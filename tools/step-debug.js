// 逐行 debug（CDP 版）：node tools/step-debug.js <url> <file:line> [選項]
//
// 這是給「AI／指令稿」用的逐行除錯器。原理：
//   Chrome DevTools Protocol 的 Debugger domain
//   → setBreakpointByUrl 下斷點 → stepOver / stepInto / stepOut 逐步執行
//   → 每停一行就把「所在行號 + 該行的原始碼 + 區域變數值」記錄下來
//
// 用法：
//   node tools/step-debug.js http://127.0.0.1:3001/m2-species/ m2-species/sketch.js:1200
//   node tools/step-debug.js <url> <file:line> --until 1230 --max 200 --out trace.json
//   node tools/step-debug.js <url> <file:line> --mode into
//   node tools/step-debug.js <url> --watch            # 只抓 debugger; 陳述句
//
// 選項：
//   --until <line>   逐步執行到這一行就停（不指定就一路執行到離開該檔案）
//   --max <n>        最多走幾行（預設 300）
//   --mode <over|into|out>  單步步進模式（預設 over）
//   --out <file>     把完整 trace 寫成 JSON（給 AI 讀）
//   --watch          不下斷點，只在遇到 debugger; 時停下
//   --headful        顯示瀏覽器視窗（預設 headless）
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Users\\annaj\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) if (fs.existsSync(p)) return p;
  return CHROME_CANDIDATES[0];
}

function parseArgs(argv) {
  const opts = { url: '', target: null, until: null, max: 300, mode: 'over', out: null, watch: false, headful: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--until') opts.until = parseInt(argv[++i], 10);
    else if (a === '--max') opts.max = parseInt(argv[++i], 10);
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--watch') opts.watch = true;
    else if (a === '--headful') opts.headful = true;
    else pos.push(a);
  }
  opts.url = pos[0];
  if (pos[1]) {
    const m = pos[1].match(/^(.*):(\d+)$/);
    if (m) { opts.target = { file: m[1], line: parseInt(m[2], 10) }; }
    else opts.target = { file: pos[1], line: null };
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (!opts.url) {
  console.error('用法: node tools/step-debug.js <url> <file:line> [--until N] [--max N] [--mode over|into|out] [--out trace.json] [--watch] [--headful]');
  process.exit(1);
}

const trace = {
  url: opts.url,
  target: opts.target,
  startedAt: new Date().toISOString(),
  steps: [],
  console: [],
  pageErrors: [],
  stoppedReason: null,
};

function short(v) {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'string') return v.length > 120 ? v.slice(0, 117) + '...' : v;
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v);
      return s.length > 160 ? s.slice(0, 157) + '...' : s;
    } catch (e) { return '[object]'; }
  }
  return String(v);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: opts.headful ? false : 'new',
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-swiftshader', // headless 下 WebGL fallback，three.js 場景才不會黑畫面
      '--window-size=1440,900',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on('console', (m) => {
      const t = m.type();
      if (t === 'error' || t === 'warning') trace.console.push({ type: t, text: m.text() });
    });
    page.on('pageerror', (e) => trace.pageErrors.push(String(e && e.message ? e.message : e)));

    const client = await page.createCDPSession();
    await client.send('Debugger.enable');

    // scriptId → url 對照表
    const scriptUrls = new Map();
    client.on('Debugger.scriptParsed', (e) => {
      scriptUrls.set(e.scriptId, e.url || '');
    });

    // 取得某個 scriptId 的原始碼（用來印出那一行）
    const scriptSources = new Map();
    async function getSource(scriptId) {
      if (scriptSources.has(scriptId)) return scriptSources.get(scriptId);
      try {
        const r = await client.send('Debugger.getScriptSource', { scriptId });
        scriptSources.set(scriptId, r.scriptSource || '');
      } catch (e) {
        scriptSources.set(scriptId, '');
      }
      return scriptSources.get(scriptId);
    }

    function sourceLine(src, lineNo0) {
      const lines = src.split(/\r?\n/);
      return (lines[lineNo0] !== undefined ? lines[lineNo0] : '').trim();
    }

    // 暫停事件 → 記錄 + 通知等待者
    let pauseResolver = null;
    let lastPause = null;

    client.on('Debugger.paused', (e) => {
      lastPause = e;
      if (pauseResolver) { const r = pauseResolver; pauseResolver = null; r(e); }
    });

    function waitForPause(timeoutMs = 60000) {
      // 若暫停事件比等待者早到（lastPause 已存），直接回傳，避免漏接
      if (lastPause) { const p = lastPause; lastPause = null; return Promise.resolve(p); }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { pauseResolver = null; reject(new Error('等待 debugger 暫停逾時（' + timeoutMs + 'ms）')); }, timeoutMs);
        pauseResolver = (e) => { clearTimeout(t); lastPause = null; resolve(e); };
      });
    }

    // 讀取當下 scope 裡的變數（local / closure）
    async function readScope(frame) {
      const out = {};
      const scopes = frame.scopeChain || [];
      for (const sc of scopes) {
        if (sc.type !== 'local' && sc.type !== 'closure') continue;
        try {
          const props = await client.send('Runtime.getProperties', {
            objectId: sc.object.objectId,
            ownProperties: true,
            generatePreview: false,
          });
          for (const p of props.result || []) {
            if (p.name === 'this' || p.name.startsWith('__')) continue;
            if (p.value === undefined) continue;
            if (out[p.name] === undefined) out[p.name] = short(p.value.value !== undefined ? p.value.value : p.value.description);
          }
        } catch (e) { /* scope 取不到就略過 */ }
      }
      return out;
    }

    // 下斷點（在 page 載入前設，urlRegex 對之後載入的 script 生效）
    let breakpointId = null;
    if (opts.target && opts.target.file) {
      const fileName = path.basename(opts.target.file);
      const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const urlRegex = new RegExp('.*' + escaped + '(\\?.*)?$');
      const res = await client.send('Debugger.setBreakpointByUrl', {
        urlRegex: urlRegex.source,
        lineNumber: Math.max(0, (opts.target.line || 1) - 1),
        columnNumber: 0,
      });
      breakpointId = res.breakpointId;
      console.error('[step-debug] 斷點已設於 ' + opts.target.file + ':' + (opts.target.line || 1));
    } else {
      console.error('[step-debug] watch 模式：等待 debugger; 陳述句');
    }

    // 載入頁面（不 await 完整 load，避免 pause 事件被卡住）
    const nav = page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);

    let stepNo = 0;
    const stepCommands = { over: 'Debugger.stepOver', into: 'Debugger.stepInto', out: 'Debugger.stepOut' };

    // 等待第一次暫停
    let pause;
    try {
      pause = await waitForPause();
    } catch (e) {
      trace.stoppedReason = 'never-paused: ' + e.message;
      // 就算沒暫停也把 console 錯誤收好
      await nav;
      finish();
      return;
    }

    while (pause) {
      const frame = pause.callFrames && pause.callFrames[0];
      if (!frame) break;
      const loc = frame.location || {};
      const scriptId = loc.scriptId;
      const url = scriptUrls.get(scriptId) || '(unknown)';
      const lineNo = (loc.lineNumber || 0) + 1;
      const src = await getSource(scriptId);
      const vars = await readScope(frame);

      const record = {
        n: ++stepNo,
        file: url,
        line: lineNo,
        column: (loc.columnNumber || 0) + 1,
        fn: frame.functionName || '(anonymous)',
        reason: pause.reason,
        code: sourceLine(src, loc.lineNumber || 0),
        vars,
      };
      trace.steps.push(record);

      // 只印出我們關心的那個檔案，減少雜訊
      const targetBase = opts.target ? path.basename(opts.target.file) : null;
      const inTarget = !targetBase || (url || '').indexOf(targetBase) >= 0;
      const interesting = inTarget;
      if (interesting) {
        console.log(
          '#' + String(record.n).padStart(3, '0') + '  ' + record.file.split('/').pop() + ':' + record.line +
          '  ' + (record.fn || '') + '  ' + record.code
        );
        const kv = Object.entries(vars);
        if (kv.length) console.log('        ' + kv.map(([k, v]) => k + '=' + v).join('  '));
      }

      // 停止條件
      if (opts.until && lineNo >= opts.until && inTarget) {
        trace.stoppedReason = 'reached --until ' + opts.until;
        break;
      }
      if (stepNo >= opts.max) { trace.stoppedReason = 'reached --max ' + opts.max; break; }
      if (opts.watch) {
        trace.stoppedReason = 'debugger statement at ' + record.file + ':' + record.line;
        break;
      }
      if (targetBase && !inTarget) {
        trace.stoppedReason = 'left target file';
        break;
      }

      // 單步
      const cmd = stepCommands[opts.mode] || 'Debugger.stepOver';
      try {
        const next = waitForPause();
        await client.send(cmd);
        pause = await next;
      } catch (e) {
        trace.stoppedReason = 'step error: ' + e.message;
        break;
      }
    }

    await nav;
    finish();
  } finally {
    try { await browser.close(); } catch (e) { /* ignore */ }
  }

  function finish() {
    if (opts.out) {
      try {
        fs.writeFileSync(opts.out, JSON.stringify(trace, null, 2), 'utf8');
        console.error('[step-debug] trace 已寫入 ' + opts.out);
      } catch (e) { console.error('[step-debug] 寫 trace 失敗: ' + e.message); }
    }
    console.error('[step-debug] 停止原因: ' + trace.stoppedReason + '，共 ' + trace.steps.length + ' 行');
    if (trace.pageErrors.length) console.error('[step-debug] 頁面錯誤:\n  ' + trace.pageErrors.join('\n  '));
    const errs = trace.console.filter((c) => c.type === 'error');
    if (errs.length) console.error('[step-debug] console error:\n  ' + errs.map((c) => c.text).join('\n  '));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
