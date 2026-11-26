// ============================================================
// 愛的聲音（VoidVoice）— 生物的「叫聲」，不是背景音樂
// 用 Tone.js（Web Audio 合成，不需要音檔）
//
// 聲音靈感來自聖經對天使／活物的描寫：
//  - 以西結書 1:24：翅膀聲「如大水的聲音」      → 一陣寬頻的「水聲」噪音
//  - 啟示錄 1:15／14:2：聲音「如眾水」「如吹號」 → 一個身體同時發出好幾個聲音
//  - 以賽亞書 6:3：撒拉弗呼喊「聖哉」            → 有母音的人聲，但不是人
//
// 生物感的做法（不是和弦，是「一口氣叫出來」）：
//  1. 鋸齒波（像聲帶）→ 三個共振峰濾波器（像嘴巴形狀）→ 母音 u→a→o 隨叫聲張開再合上
//  2. 音高滑行：升上去、停住、慢慢落下（像鯨歌、鹿鳴）
//  3. 顫音（vibrato）一開始沒有，叫到一半才慢慢出現（像呼吸不穩）
//  4. 三個聲音疊在一起（主音＋五度＋八度，各自微微走音）＝「眾水」
//  5. 很遠的回聲：乒乓延遲＋長殘響
//
// 持續循環：預設關閉（瀏覽器規定要點擊才能出聲），開啟後每 12～20 秒接著叫下一輪（每輪內容隨機不同），
// 只有「虛無」在場、分頁可見時才叫。
// ============================================================
const VoidVoice = (() => {
  let ready = false;       // 音訊鏈是否建好
  let enabled = false;     // 使用者有沒有開聲音
  let active = false;      // 目前是不是「虛無」這個物種在場
  let timer = null;        // 下一次呼喚的計時器
  let lastCallAt = 0;      // 上次呼喚的毫秒時間（冷卻用）
  let panner, chirp, water, waterFilter;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const hz = (note) => Tone.Frequency(note).toFrequency();

  // 母音的三個共振峰頻率（Hz）：u（嘴小）→ a（嘴大）→ o（嘴圓）
  const VOWEL_U = [325, 700, 2530];
  const VOWEL_A = [800, 1150, 2900];
  const VOWEL_O = [450, 800, 2830];

  // 叫聲的三種「姿勢」：[起音, 最高音, 結尾音]（D 大調五聲，偏高的女聲／童聲音域）
  const SHAPES = [
    { name: '呼喚', notes: ['D4', 'A4', 'F#4'], dur: [5, 7] },   // 升上去再落下
    { name: '嘆息', notes: ['A4', 'A4', 'D4'], dur: [6, 8] },    // 高處停住，慢慢滑下
    { name: '應答', notes: ['F#4', 'B4', 'A4'], dur: [4, 5.5] }, // 短一點，像在回應誰
  ];

  function build() {
    const limiter = new Tone.Limiter(-3).toDestination();

    // 超長殘響（空間感）
    const reverb = new Tone.Reverb({ decay: 12, preDelay: 0.08, wet: 0.7 });
    reverb.connect(limiter);
    build.reverb = reverb;

    // 回聲：左右彈來彈去，每次變小聲
    const echo = new Tone.PingPongDelay({ delayTime: '4n.', feedback: 0.5, wet: 0.4 });
    echo.connect(reverb);

    // 位置：每次叫會在左右慢慢飄
    panner = new Tone.Panner(0).connect(echo);

    // 高處的鳥啾聲（短促往上滑的正弦波，主要交給回聲延伸）
    chirp = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.25, sustain: 0, release: 0.6 },
      volume: -16,
    }).connect(echo);

    // 「大水」：棕噪音（低沉的沙沙聲）慢慢漲起來又退下去，像翅膀搧動
    waterFilter = new Tone.Filter(500, 'lowpass', -24).connect(reverb);
    water = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 2.5, decay: 1.5, sustain: 0, release: 3.5 },
      volume: -16,
    }).connect(waterFilter);
  }

  // 一個「嘴巴」發出的聲音。t=開始時間；freqs=[起,峰,尾]（Hz）；dur=秒；levelDb=音量
  function voice(t, freqs, dur, levelDb, detuneCents) {
    const [f0, f1, f2] = freqs;

    // 聲帶：鋸齒波
    const osc = new Tone.Oscillator({ type: 'sawtooth', frequency: f0, detune: detuneCents }).start(t);
    // 音高滑行：0→45% 升到最高，之後慢慢落到尾音
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
    osc.frequency.exponentialRampToValueAtTime(f2, t + dur);

    // 顫音：前半段幾乎沒有，後面慢慢抖起來
    const vib = new Tone.LFO({ frequency: rand(4.6, 5.8), min: -28, max: 28 }).start(t);
    vib.amplitude.setValueAtTime(0, t);
    vib.amplitude.linearRampToValueAtTime(0.9, t + dur * 0.7);
    vib.connect(osc.detune);

    // 嘴巴：三個共振峰，母音 u → a → o
    const env = new Tone.Gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(Tone.dbToGain(levelDb), t + dur * 0.3);
    env.gain.setValueAtTime(Tone.dbToGain(levelDb), t + dur * 0.55);
    env.gain.linearRampToValueAtTime(0, t + dur);
    env.connect(panner);

    const formantGains = [1.0, 0.55, 0.3]; // 低共振峰最響
    const parts = [osc, vib, env];
    for (let i = 0; i < 3; i++) {
      const filt = new Tone.Filter({ type: 'bandpass', Q: 9, frequency: VOWEL_U[i] });
      filt.frequency.setValueAtTime(VOWEL_U[i], t);
      filt.frequency.linearRampToValueAtTime(VOWEL_A[i], t + dur * 0.4);
      filt.frequency.linearRampToValueAtTime(VOWEL_O[i], t + dur);
      const g = new Tone.Gain(formantGains[i]);
      osc.connect(filt);
      filt.connect(g);
      g.connect(env);
      parts.push(filt, g);
    }

    // 叫完把這批節點清掉，不留垃圾
    osc.stop(t + dur + 0.1);
    setTimeout(() => parts.forEach((p) => p.dispose()), (dur + 1.5) * 1000 + Math.max(0, (t - Tone.now()) * 1000));
  }

  // 一次「呼喚」。strength：1 平常；1.4 擁抱時更飽滿
  function call(strength = 1) {
    if (!ready || !enabled) return;
    lastCallAt = Date.now();
    const t = Tone.now() + 0.1;

    const shape = pick(SHAPES);
    const dur = rand(shape.dur[0], shape.dur[1]) * strength;
    const base = shape.notes.map(hz);

    // 位置：慢慢從一邊飄到另一邊
    const startPan = rand(-0.7, 0.7);
    panner.pan.cancelScheduledValues(t);
    panner.pan.setValueAtTime(startPan, t);
    panner.pan.linearRampToValueAtTime(-startPan * 0.6, t + dur + 3);

    // 1) 「大水」先漲起來（翅膀聲）
    waterFilter.frequency.setValueAtTime(350, t);
    waterFilter.frequency.exponentialRampToValueAtTime(1400, t + dur * 0.5);
    water.volume.value = -16 + (strength - 1) * 4;
    water.triggerAttackRelease(dur * 0.8, t);

    // 2) 三個聲音疊成「眾水」：主音、五度、低八度，各自微微走音
    const lvl = -4 + (strength - 1) * 4;
    voice(t + 0.3, base, dur, lvl, rand(-6, 6));
    voice(t + 0.5, base.map((f) => f * 1.5), dur * 0.95, lvl - 5, rand(-10, 10));
    voice(t + 0.4, base.map((f) => f * 0.5), dur * 1.05, lvl - 3, rand(-8, 8));

    // 3) 高處偶爾一兩聲鳥啾（約 6 成機率），交給回聲去延伸
    if (Math.random() < 0.6) {
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const ct = t + dur * rand(0.5, 0.9) + i * 0.45;
        const from = hz(pick(['A5', 'B5']));
        chirp.triggerAttackRelease(from, 0.25, ct, 0.7);
        chirp.frequency.setValueAtTime(from, ct);
        chirp.frequency.exponentialRampToValueAtTime(from * 1.25, ct + 0.2);
      }
    }
  }

  // 排下一次呼喚：12～20 秒後（持續循環，不要叫一輪就沒了）
  function scheduleNext(firstDelay) {
    clearTimeout(timer);
    if (!enabled || !active) return;
    const delay = firstDelay !== undefined ? firstDelay : rand(12000, 20000);
    timer = setTimeout(() => {
      if (document.hidden) { scheduleNext(); return; } // 分頁沒在看就不叫
      call(1);
      scheduleNext();
    }, delay);
  }

  return {
    // 按「聲音」按鈕：必須在使用者點擊事件裡呼叫（瀏覽器規定）
    async toggle(isLove) {
      if (typeof Tone === 'undefined') return false; // CDN 沒載到
      if (!enabled) {
        active = !!isLove; // 按下當下「虛無」有沒有在場，先登記好，第一聲才不會被略過
        await Tone.start();
        if (!ready) {
          build();
          await build.reverb.generate(); // 殘響要先算好才不會前幾秒沒聲音
          ready = true;
        }
        enabled = true;
        scheduleNext(2500); // 打開後 2.5 秒先叫一聲，讓使用者知道有開
      } else {
        enabled = false;
        clearTimeout(timer);
      }
      return enabled;
    },
    // 切換物種時呼叫：只有「虛無」在場才會叫
    setActive(isLove) {
      const wasActive = active;
      active = isLove;
      if (!isLove) clearTimeout(timer);
      else if (!wasActive) scheduleNext(1500); // 切回來 1.5 秒後就接著叫；重複通知「虛無還在場」時不重排計時
    },
    // 擁抱時叫得更飽滿（10 秒冷卻，避免連按變吵）
    embrace() {
      if (!enabled || !active) return;
      if (Date.now() - lastCallAt < 10000) return;
      call(1.4);
      scheduleNext();
    },
    call,
    get enabled() { return enabled; },
  };
})();
