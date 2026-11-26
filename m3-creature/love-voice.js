// ============================================================
// 愛的聲音（LoveVoice）— 溫暖、有力量的「生命氣息」
// 用 Tone.js（Web Audio 合成，不需要音檔）
//
// 全部取自自然界真實會有的聲音，沒有人聲、沒有宗教意象：
//  1. 心跳：低低的「咚—咚」，由快到慢，像一個活著的核心在你旁邊（力量與安心）
//  2. 暖氣流：低沉的深呼吸，慢慢漲起又退下，像大型動物的吐息（溫暖）
//  3. 餘燼：幾聲細小的劈啪，像火堆裡的炭（呼應「熾熱燃燒」）
//  4. 鳩鳴：兩三聲柔軟的咕咕聲，一聲比一聲低（生物的「叫聲」）
//  5. 水滴：幾顆往上「噗」的水珠，散在回聲裡（共鳴）
//
// 避免「人造感」的做法：
//  - 音高有不規則的小抖動，不是工整的顫音
//  - 每聲的時間、長短、音量、音高都隨機偏一點點
//  - 每個音的起音都有一點「滑上去」，不是按鍵就到位
//  - 回聲柔、殘響短，高頻被收掉，像在有空氣的房間裡
//
// 持續循環：預設關閉（瀏覽器規定要點擊才能出聲），開啟後每 13～20 秒接著叫下一輪（每輪內容隨機不同），
// 只有「愛」在場、分頁可見時才叫。
// ============================================================
const LoveVoice = (() => {
  let ready = false;       // 音訊鏈是否建好
  let enabled = false;     // 使用者有沒有開聲音
  let active = false;      // 目前是不是「愛」這個物種在場
  let timer = null;        // 下一次呼喚的計時器
  let lastCallAt = 0;      // 上次呼喚的毫秒時間（冷卻用）
  let bus, panner, breath, breathFilter, reverbRef, ember;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const hz = (note) => Tone.Frequency(note).toFrequency();

  // 鳩鳴的起音高度（D 大調，偏低偏暖）
  const COO_BASES = ['D4', 'E4', 'F#4', 'A4'];
  // 水滴的音高（D 大調五聲，偏高）
  const DROP_NOTES = ['D5', 'E5', 'F#5', 'A5', 'B5', 'D6'];

  function build() {
    const limiter = new Tone.Limiter(-3).toDestination();

    // 短而暖的殘響（不像虛無那樣空曠）
    const reverb = new Tone.Reverb({ decay: 6, preDelay: 0.04, wet: 0.5 });
    // 收掉高頻，讓回聲像有空氣的房間，不刺耳
    const soften = new Tone.Filter(3800, 'lowpass', -12);
    reverb.connect(soften);
    soften.connect(limiter);
    reverbRef = reverb;

    // 回聲：柔柔地彈回來，次數不多
    const echo = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.38, wet: 0.35 });
    echo.connect(reverb);

    panner = new Tone.Panner(0).connect(echo);
    bus = panner;

    // 氣息：粉紅噪音，帶通濾波，很輕
    breathFilter = new Tone.Filter(1400, 'bandpass', -12).connect(reverb);
    breath = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 1.6, decay: 1.2, sustain: 0, release: 2.5 },
      volume: -28,
    }).connect(breathFilter);

    // 餘燼：極短的高頻噪音點，像炭火的劈啪
    const emberFilter = new Tone.Filter(3200, 'bandpass', -12).connect(bus);
    ember = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
      volume: -22,
    }).connect(emberFilter);
  }

  // 清掉一批用完的節點
  function disposeLater(nodes, endTime) {
    const ms = Math.max(0, (endTime - Tone.now()) * 1000) + 1500;
    setTimeout(() => nodes.forEach((n) => n.dispose()), ms);
  }

  // 一聲鳩鳴：基音＋微弱二倍音，柔軟起音，尾巴慢慢散掉
  function coo(t, f, dur, levelDb) {
    const osc = new Tone.Oscillator({ type: 'sine', frequency: f * 0.9 }).start(t);
    const osc2 = new Tone.Oscillator({ type: 'sine', frequency: f * 1.8 }).start(t); // 二倍音，聲音比較有「喉嚨」
    // 音高：從下方「滑」進來，再微微下垂（像真的鳥叫，不是按鍵）
    [osc, osc2].forEach((o, i) => {
      const k = i === 0 ? 1 : 2;
      o.frequency.setValueAtTime(f * 0.9 * k, t);
      o.frequency.exponentialRampToValueAtTime(f * k, t + dur * 0.18);
      o.frequency.exponentialRampToValueAtTime(f * 0.96 * k, t + dur);
    });
    // 不規則的小抖動
    const jitter = new Tone.LFO({ frequency: rand(2.5, 4.5), min: -14, max: 14, phase: rand(0, 360) }).start(t);
    jitter.connect(osc.detune);
    jitter.connect(osc2.detune);

    const g2 = new Tone.Gain(0.18); // 二倍音很小聲
    const env = new Tone.Gain(0);
    const lpf = new Tone.Filter(1300, 'lowpass', -12); // 圓潤，沒有電子感的刺
    const peak = Tone.dbToGain(levelDb);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.14);          // 柔軟起音
    env.gain.exponentialRampToValueAtTime(peak * 0.45, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);     // 自然衰減

    osc.connect(env);
    osc2.connect(g2);
    g2.connect(env);
    env.connect(lpf);
    lpf.connect(bus);

    osc.stop(t + dur + 0.1);
    osc2.stop(t + dur + 0.1);
    disposeLater([osc, osc2, jitter, g2, env, lpf], t + dur);
  }

  // 一下心跳：低頻「咚」＋高一點的二倍音（小喇叭也聽得到），快速下滑再衰減
  function thump(t, levelDb) {
    const nodes = [];
    [[95, 58, 1.0], [190, 118, 0.45]].forEach(([f0, f1, gain]) => {
      const osc = new Tone.Oscillator({ type: 'sine', frequency: f0 }).start(t);
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + 0.14);
      const env = new Tone.Gain(0);
      const peak = Tone.dbToGain(levelDb) * gain;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(env);
      env.connect(bus);
      osc.stop(t + 0.5);
      nodes.push(osc, env);
    });
    disposeLater(nodes, t + 0.5);
  }

  // 暖氣流：三層低音緩緩漲起、慢慢退下，濾波器由暗變亮再暗（像一口深呼吸）
  function swell(t, f, dur, levelDb) {
    const lpf = new Tone.Filter(260, 'lowpass', -24).connect(bus);
    lpf.frequency.setValueAtTime(260, t);
    lpf.frequency.exponentialRampToValueAtTime(900, t + dur * 0.45);
    lpf.frequency.exponentialRampToValueAtTime(300, t + dur);
    const env = new Tone.Gain(0).connect(lpf);
    const peak = Tone.dbToGain(levelDb);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const nodes = [lpf, env];
    [[f, 'triangle', 1.0], [f * 1.5, 'triangle', 0.5], [f * 2.003, 'sine', 0.3]].forEach(([fr, type, gain]) => {
      const osc = new Tone.Oscillator({ type, frequency: fr, detune: rand(-7, 7) }).start(t);
      const g = new Tone.Gain(gain);
      const lfo = new Tone.LFO({ frequency: rand(0.15, 0.4), min: -9, max: 9, phase: rand(0, 360) }).start(t);
      lfo.connect(osc.detune);
      osc.connect(g);
      g.connect(env);
      osc.stop(t + dur + 0.1);
      nodes.push(osc, g, lfo);
    });
    disposeLater(nodes, t + dur);
  }

  // 一顆水滴：音高快速往上「噗」一下，再自然衰減
  function drop(t, f, levelDb) {
    const osc = new Tone.Oscillator({ type: 'sine', frequency: f * 0.72 }).start(t);
    osc.frequency.setValueAtTime(f * 0.72, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.07); // 往上的「噗」
    const env = new Tone.Gain(0);
    const peak = Tone.dbToGain(levelDb);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    osc.connect(env);
    env.connect(bus);
    osc.stop(t + 1);
    disposeLater([osc, env], t + 1);
  }

  // 一次「呼喚」。strength：1 平常；1.4 擁抱時更豐富一點
  function call(strength = 1) {
    if (!ready || !enabled) return;
    lastCallAt = Date.now();
    const t = Tone.now() + 0.1;
    const total = 8 * strength;

    // 位置：從一邊輕輕飄過去
    const startPan = rand(-0.5, 0.5);
    panner.pan.cancelScheduledValues(t);
    panner.pan.setValueAtTime(startPan, t);
    panner.pan.linearRampToValueAtTime(-startPan * 0.5, t + total);

    // 1) 暖氣流＋氣息：先有一口深呼吸（低音 D2 附近，有時換成 A1）
    swell(t, hz(pick(['D2', 'D2', 'A1'])), total, -13 + (strength - 1) * 3);
    breathFilter.frequency.setValueAtTime(1000, t);
    breathFilter.frequency.exponentialRampToValueAtTime(2200, t + 2.5);
    breath.triggerAttackRelease(2.2, t);

    // 2) 心跳：兩下一組，3 組，越跳越慢（像慢慢平靜下來）；第二下比第一下輕
    let bt = t + 0.7;
    let gap = rand(0.85, 1.0);
    for (let i = 0; i < 3; i++) {
      thump(bt, -7 - i * 2 + rand(-1, 1));
      thump(bt + rand(0.28, 0.36), -11 - i * 2 + rand(-1, 1));
      bt += gap;
      gap *= rand(1.12, 1.25);
    }

    // 3) 餘燼：整段裡散落的細小劈啪（間隔不均，成群出現）
    let et = t + rand(1.0, 2.0);
    const emberEnd = t + total;
    while (et < emberEnd) {
      const cluster = Math.round(rand(1, 3));
      for (let i = 0; i < cluster && et < emberEnd; i++) {
        ember.triggerAttackRelease(0.02, et, rand(0.3, 1));
        et += rand(0.06, 0.2);
      }
      et += rand(0.6, 1.8);
    }

    // 4) 鳩鳴：心跳之後，2～3 聲（擁抱時 3～4 聲），一聲比一聲低、間隔不均
    const cooCount = Math.round(rand(2, 3)) + (strength > 1 ? 1 : 0);
    let fc = hz(pick(COO_BASES));
    let ct = bt - gap * 0.4 + 0.3;
    for (let i = 0; i < cooCount; i++) {
      coo(ct, fc, rand(0.8, 1.2), -13 - i * 2 + rand(-1.5, 1.5) + (strength - 1) * 3);
      fc *= rand(0.86, 0.92);
      ct += rand(0.85, 1.35);
    }

    // 5) 水滴：2～4 顆（擁抱時多幾顆），散在鳩鳴之後，交給回聲延伸
    const dropCount = Math.round(rand(2, 4)) + (strength > 1 ? 2 : 0);
    let dt = ct + rand(0.1, 0.5);
    for (let i = 0; i < dropCount; i++) {
      drop(dt, hz(pick(DROP_NOTES)), -20 + rand(-4, 2) + (strength - 1) * 3);
      dt += rand(0.35, 1.6);
    }
  }

  // 排下一次呼喚：13～20 秒後（持續循環，不要叫一輪就沒了）
  function scheduleNext(firstDelay) {
    clearTimeout(timer);
    if (!enabled || !active) return;
    const delay = firstDelay !== undefined ? firstDelay : rand(13000, 20000);
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
        active = !!isLove; // 按下當下「愛」有沒有在場，先登記好，第一聲才不會被略過
        await Tone.start();
        if (!ready) {
          build();
          await reverbRef.generate(); // 殘響要先算好才不會前幾秒沒聲音
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
    // 切換物種時呼叫：只有「愛」在場才會叫
    setActive(isLove) {
      const wasActive = active;
      active = isLove;
      if (!isLove) clearTimeout(timer);
      else if (!wasActive) scheduleNext(1500); // 切回來 1.5 秒後就接著叫
    },
    // 擁抱時叫得更豐富（10 秒冷卻，避免連按變吵）
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
