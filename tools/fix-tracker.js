// 修正狀態追蹤器（紅 / 綠 / 黃）：node tools/fix-tracker.js [選項]
//
// 目的：讓「已修正 / 未修正 / 待修正」永遠不會被忘記。
// 做法：在原始碼裡用固定格式的行內標記 + 自動產生總表。
//
// 標記格式（寫在程式碼的註解裡，顏色由 VS Code Better Comments 上色）：
//   // FIXED-012: 布殼不顯示 → GLB 改絕對路徑 + 多路徑輪詢   ← 綠（已修正並驗證過）
//   // TODO-003: 嫉妒粒子貼圖只貼第一條 path，待重做            ← 黃（待修正，排隊中）
//   // BUG-001: 眼球貼在布外，位置抓錯                          ← 紅（已知未修／需重做）
//
// 指令：
//   node tools/fix-tracker.js                  重新產生 DEBUG_STATUS.md ＋ DEBUG_STATUS.json
//   node tools/fix-tracker.js --list [檔名]    在終端機列出所有項目
//   node tools/fix-tracker.js --pending        只列出紅／黃（還沒解決的）
//   node tools/fix-tracker.js --verify-changed 只列出「本次改動過的檔案」裡面已修正的項目
//                                               （→ 改完後回頭重驗，避免修了後面忘了前面）
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['m0-outfit', 'm1-world', 'm2-species', 'm3-creature', 'm4-population', 'm5-habitat', 'm6-zoo'];
const SCAN_EXT = ['.js', '.mjs', '.cjs', '.ts', '.html', '.css', '.py'];
const SKIP_DIR = new Set(['node_modules', '.git', 'assets', 'fonts', '.beads']);

const MARKER = /(?:\/\/|\/\*|\*|<!--)\s*(FIXED|TODO|BUG)(?:-([A-Za-z0-9_]+))?\s*[:：]\s*(.+?)\s*(?:-->)?\s*$/;
const KIND = { FIXED: 'green', TODO: 'yellow', BUG: 'red' };
const KIND_CN = { FIXED: '已修正', TODO: '待修正', BUG: '未修正' };
const KIND_EMOJI = { FIXED: '🟢', TODO: '🟡', BUG: '🔴' };

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const en of entries) {
    if (SKIP_DIR.has(en.name)) continue;
    const full = path.join(dir, en.name);
    if (en.isDirectory()) walk(full, out);
    else if (SCAN_EXT.includes(path.extname(en.name))) out.push(full);
  }
  return out;
}

function scan() {
  const files = [];
  for (const d of SCAN_DIRS) {
    const p = path.join(ROOT, d);
    if (fs.existsSync(p)) walk(p, files);
  }
  const items = [];
  const counters = { FIXED: 0, TODO: 0, BUG: 0 };
  const autoCounters = { FIXED: 0, TODO: 0, BUG: 0 };
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => {
      const m = ln.match(MARKER);
      if (!m) return;
      counters[m[1]] += 1;
      let id = m[2];
      if (!id) { autoCounters[m[1]] += 1; id = String(autoCounters[m[1]]).padStart(3, '0'); }
      items.push({
        kind: m[1],
        status: KIND[m[1]],
        id,
        text: m[3],
        file: path.relative(ROOT, f).split(path.sep).join('/'),
        abs: f,
        line: i + 1,
        code: ln.trim(),
      });
    });
  }
  return items;
}

function gitChangedFiles() {
  const changed = new Set();
  const run = (args) => {
    try {
      const out = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
      out.split(/\r?\n/).forEach((l) => { if (l.trim()) changed.add(l.trim().split(path.sep).join('/')); });
    } catch (e) { /* 不是 git repo 就算了 */ }
  };
  run(['diff', '--name-only', 'HEAD']);
  run(['diff', '--name-only', '--cached']);
  run(['ls-files', '--others', '--exclude-standard']);
  return changed;
}

function byKind(items, kind) { return items.filter((i) => i.kind === kind); }

function renderMarkdown(items) {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [];
  lines.push('# 修正狀態總表（自動產生，勿手改）');
  lines.push('');
  lines.push('> 這張表由 `node tools/fix-tracker.js` 從原始碼裡的行內標記自動重建。');
  lines.push('> 每一行原始碼只要有 `FIXED-` / `TODO-` / `BUG-` 標記，就會出現在下面。');
  lines.push('> 改完程式 → 跑一次 `npm run fix-status` → 這張表就是最新的真相。');
  lines.push('');
  lines.push(`> 最後更新：${now}（由 \`tools/fix-tracker.js\` 產生）`);
  lines.push('');

  const green = byKind(items, 'FIXED');
  const yellow = byKind(items, 'TODO');
  const red = byKind(items, 'BUG');

  lines.push('## 一覽');
  lines.push('');
  lines.push('| 狀態 | 顏色 | 數量 |');
  lines.push('|---|---|---|');
  lines.push(`| 已修正（驗證過） | 🟢 綠 | ${green.length} |`);
  lines.push(`| 待修正（排隊中） | 🟡 黃 | ${yellow.length} |`);
  lines.push(`| 未修正（已知問題） | 🔴 紅 | ${red.length} |`);
  lines.push('');

  lines.push('## 🔴 紅：未修正（已知問題，最優先）');
  lines.push('');
  if (!red.length) lines.push('_（目前沒有紅色項目）_');
  else {
    lines.push('| ID | 位置 | 說明 |');
    lines.push('|---|---|---|');
    red.forEach((i) => lines.push(`| ${i.id} | \`${i.file}:${i.line}\` | ${i.text.replace(/\|/g, '\\|')} |`));
  }
  lines.push('');

  lines.push('## 🟡 黃：待修正（已知但還沒排到）');
  lines.push('');
  if (!yellow.length) lines.push('_（目前沒有黃色項目）_');
  else {
    lines.push('| ID | 位置 | 說明 |');
    lines.push('|---|---|---|');
    yellow.forEach((i) => lines.push(`| ${i.id} | \`${i.file}:${i.line}\` | ${i.text.replace(/\|/g, '\\|')} |`));
  }
  lines.push('');

  lines.push('## 🟢 綠：已修正並驗證過');
  lines.push('');
  if (!green.length) lines.push('_（目前沒有綠色項目）_');
  else {
    lines.push('| ID | 位置 | 說明 |');
    lines.push('|---|---|---|');
    green.forEach((i) => lines.push(`| ${i.id} | \`${i.file}:${i.line}\` | ${i.text.replace(/\|/g, '\\|')} |`));
  }
  lines.push('');

  lines.push('## 逐檔案索引');
  lines.push('');
  const files = [...new Set(items.map((i) => i.file))].sort();
  for (const f of files) {
    lines.push(`### \`${f}\``);
    lines.push('');
    items.filter((i) => i.file === f)
      .sort((a, b) => a.line - b.line)
      .forEach((i) => lines.push(`- ${KIND_EMOJI[i.kind]} **${i.id}** \`L${i.line}\` ${i.text}`));
    lines.push('');
  }

  return lines.join('\n');
}

function printItems(items, title) {
  console.log('\n' + title + '（共 ' + items.length + ' 項）');
  console.log('─'.repeat(60));
  if (!items.length) { console.log('（沒有項目）\n'); return; }
  items.forEach((i) => {
    console.log(`${KIND_EMOJI[i.kind]} ${KIND_CN[i.kind]} ${i.id}  ${i.file}:${i.line}`);
    console.log(`    ${i.text}`);
  });
  console.log('');
}

function main() {
  const args = process.argv.slice(2);
  const items = scan();

  if (args.includes('--list')) {
    const f = args[args.indexOf('--list') + 1];
    const list = f && !f.startsWith('--') ? items.filter((i) => i.file.indexOf(f) >= 0) : items;
    printItems(list, '全部修正項目');
    return;
  }

  if (args.includes('--pending')) {
    printItems(items.filter((i) => i.kind !== 'FIXED'), '還沒解決的項目（紅／黃）');
    return;
  }

  if (args.includes('--verify-changed')) {
    const changed = gitChangedFiles();
    const green = items.filter((i) => i.kind === 'FIXED' && changed.has(i.file));
    printItems(green, '本次改動過的檔案裡，已修正但需要回頭重驗的項目');
    if (green.length === 0) console.log('✅ 沒有需要回頭重驗的項目。\n');
    return;
  }

  // 預設：重建總表
  const md = renderMarkdown(items);
  const mdPath = path.join(ROOT, 'DEBUG_STATUS.md');
  const jsonPath = path.join(ROOT, 'DEBUG_STATUS.json');
  fs.writeFileSync(mdPath, md, 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    counts: {
      FIXED: byKind(items, 'FIXED').length,
      TODO: byKind(items, 'TODO').length,
      BUG: byKind(items, 'BUG').length,
    },
    items,
  }, null, 2), 'utf8');
  console.log('✅ 已更新 DEBUG_STATUS.md / DEBUG_STATUS.json');
  console.log(`   🟢 已修正 ${byKind(items, 'FIXED').length}　🟡 待修正 ${byKind(items, 'TODO').length}　🔴 未修正 ${byKind(items, 'BUG').length}`);
}

main();
