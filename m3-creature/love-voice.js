// ============================================================
// 愛的聲音（LoveVoice）— 後室式的「擬聲」：大致正確，但有一點點不對勁
// 用 Tone.js（Web Audio 合成，不需要音檔）
//
// 概念：愛不是真的在發出聲音，而是在「模仿」它記憶裡讓人快樂的東西——
//   笑聲、冰淇淋車、遊樂園、生日音樂盒、遠處孩子們玩耍、門鈴。
//   它模仿得很用心，但它從來沒真正聽過，所以聽起來「很像、又不太像」，
//   像在夢裡聽到小時候的聲音，認得出來，卻說不出哪裡怪。
//
// 擬聲清單（每一輪隨機挑 2～3 種，不連續重複）：
//  1. 人類笑聲：「哈哈哈」的節奏太平均、音高幾乎不下降、母音偏悶（共振峰偏低），後面常跟一個遲到的、音高對不上的回聲笑
//  2. 冰淇淋車：叮叮噹噹的小調，像從遠處喇叭傳來，電話頻寬、輕微失真，由左飄到右，
//     中間偏一個音，尾巴像卡帶沒電一樣越拖越慢、越走越低
//  3. 遊樂園：旋轉木馬／蒸汽風琴的華爾滋（砰－恰－恰），簧片音色加顫音，其中一個和弦被「吃掉」半個音
//  4. 音樂盒：生日快樂或搖籃曲，發條漸漸鬆掉變慢，常常唱到一半就停了（像忘了後面怎麼唱）
//  5. 遠方的孩子：聽不出字的嘈雜人聲，偶爾冒出一聲歡呼
//  6. 門鈴：叮—咚，第二聲偏低一點點，餘音拖很長
//
// 讓它「微微不對勁」的做法：
//  - 整體有緩慢的磁帶抖動（wow）：音高像舊錄音機那樣慢慢飄
//  - 某個音刻意偏離 40～70 音分（或整整偏一個半音），別人聽了會覺得「是不是唱錯了」
//  - 節奏太準或太鬆，尾巴越走越慢
//  - 聲音被濾掉高頻、泡在長殘響裡，像從走廊另一頭傳來
//  - 底下墊一層很低的房間底噪（嗡—），像沒人的空間
//
// 持續循環：預設關閉（瀏覽器規定要點擊才能出聲），開啟後每 13～20 秒接著模仿下一輪（內容隨機不同），
// 只有「愛」在場、分頁可見時才出聲。對外介面（toggle／setActive／embrace／call）不變。
// ============================================================
const LoveVoice = (() => {
  let ready = false;       // 音訊鏈是否建好
  let enabled = false;     // 使用者有沒有開聲音
  let active = false;      // 目前是不是「愛」這個物種在場
  let timer = null;        // 下一次模仿的計時器
  let lastCallAt = 0;      // 上次模仿的毫秒時間（冷卻用）
  let lastKind = '';       // 上一種擬聲（避免連續重複）
  let bus, panner, reverbRef;

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const hz = (note) => Tone.Frequency(note).toFrequency();
  // 以 C4 為 0 的半音數轉頻率；cents 是音分偏移（磁帶抖動、唱錯都用它）
  const semi = (s, cents = 0) => 261.63 * Math.pow(2, (s + cents / 100) / 12);
  // 磁帶抖動：慢慢飄的音高偏移（音分），drift 是整段往下垂的總量
  const wowCents = (tRel, ph, drift = 0, total = 1) => 16 * Math.sin(2 * Math.PI * 0.55 * tRel + ph) + 6 * Math.sin(2 * Math.PI * 1.9 * tRel + ph * 2) + drift * (tRel / Math.max(0.01, total));

  function build() {
    const limiter = new Tone.Limiter(-3).toDestination();

    // 長殘響：像空曠的走廊／室內遊樂場
    const reverb = new Tone.Reverb({ decay: 7, preDelay: 0.05, wet: 0.55 });
    const soften = new Tone.Filter(3400, 'lowpass', -12); // 收掉高頻，聲音像隔了一段距離
    // 擬聲單音都不大（帶通、遠距離），整體補一段增益；後面有 Limiter 擋爆音
    const lift = new Tone.Gain(Tone.dbToGain(9));
    reverb.connect(soften);
    soften.connect(lift);
    lift.connect(limiter);
    reverbRef = reverb;

    const echo = new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.3, wet: 0.28 });
    echo.connect(reverb);

    // 全域磁帶抖動：整個混音的音高都在極慢地搖
    const wow = new Tone.Vibrato({ frequency: 0.6, depth: 0.1, type: 'sine' }).connect(echo);

    panner = new Tone.Panner(0).connect(wow);
    bus = panner;
  }

  function disposeLater(nodes, endTime) {
    const ms = Math.max(0, (endTime - Tone.now()) * 1000) + 1500;
    setTimeout(() => nodes.forEach((n) => { try { n.dispose(); } catch (e) { /* 已清掉 */ } }), ms);
  }

  // ───────────── 基本發聲單元 ─────────────

  // 鈴／音樂盒的一個音：基音＋倍音＋一點不諧和的「叮」，起音很快，自然衰減
  function bellNote(t, f, dur, db, dest) {
    const env = new Tone.Gain(0).connect(dest);
    const peak = Tone.dbToGain(db);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const nodes = [env];
    [['triangle', 1, 1.0], ['sine', 2, 0.3], ['sine', 5.4, 0.1]].forEach(([type, mul, gain]) => {
      const osc = new Tone.Oscillator({ type, frequency: f * mul }).start(t);
      const g = new Tone.Gain(gain);
      osc.connect(g);
      g.connect(env);
      osc.stop(t + dur + 0.1);
      nodes.push(osc, g);
    });
    disposeLater(nodes, t + dur);
  }

  // 簧片音（蒸汽風琴／旋轉木馬）：鋸齒＋方波微失諧，過濾後加顫音
  function reedNote(t, f, dur, db, dest) {
    const lpf = new Tone.Filter(2300, 'lowpass', -12).connect(dest);
    const env = new Tone.Gain(0).connect(lpf);
    const peak = Tone.dbToGain(db);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + 0.03);
    env.gain.setValueAtTime(peak * 0.85, t + Math.max(0.04, dur - 0.08));
    env.gain.linearRampToValueAtTime(0, t + dur);
    const nodes = [lpf, env];
    [['sawtooth', 1], ['square', 1.004]].forEach(([type, mul]) => {
      const osc = new Tone.Oscillator({ type, frequency: f * mul }).start(t);
      const g = new Tone.Gain(type === 'square' ? 0.5 : 0.8);
      const vib = new Tone.LFO({ frequency: rand(5, 6), min: -12, max: 12, phase: rand(0, 360) }).start(t);
      vib.connect(osc.detune);
      osc.connect(g);
      g.connect(env);
      osc.stop(t + dur + 0.1);
      nodes.push(osc, g, vib);
    });
    disposeLater(nodes, t + dur);
  }

  // 共振峰人聲單元（「哈」、歡呼）：鋸齒波＋氣息噪音，經兩個帶通濾波器塑出母音
  // pts：[[時間偏移, 頻率], ...] 音高輪廓；f1/f2：第一、第二共振峰
  function formantVoice(t, pts, dur, db, f1, f2, dest, breath = 0.3) {
    const env = new Tone.Gain(0).connect(dest);
    const peak = Tone.dbToGain(db) * 3;       // 帶通濾波會吃掉大部分能量，補回來
    const att = Math.min(0.025, dur * 0.2);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + att);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const osc = new Tone.Oscillator({ type: 'sawtooth', frequency: pts[0][1] }).start(t);
    pts.forEach(([dt, f], i) => { if (i > 0) osc.frequency.linearRampToValueAtTime(f, t + dt); });
    const noise = new Tone.Noise('pink').start(t);
    const ng = new Tone.Gain(breath);
    const mix = new Tone.Gain(1);
    osc.connect(mix);
    noise.connect(ng);
    ng.connect(mix);

    const b1 = new Tone.Filter({ frequency: f1, type: 'bandpass', Q: 5 });
    const b2 = new Tone.Filter({ frequency: f2, type: 'bandpass', Q: 5 });
    const g2 = new Tone.Gain(0.6);
    mix.connect(b1); b1.connect(env);
    mix.connect(b2); b2.connect(g2); g2.connect(env);

    osc.stop(t + dur + 0.05);
    noise.stop(t + dur + 0.05);
    disposeLater([env, osc, noise, ng, mix, b1, b2, g2], t + dur + 0.05);
  }

  // ───────────── 六種擬聲（回傳佔用的秒數） ─────────────

  // 1. 人類笑聲：哈哈哈——節奏平均得不自然、音高幾乎不降、母音偏悶
  function mimicLaugh(t, strength) {
    const voice = pick([rand(230, 290), rand(330, 420), rand(125, 150)]);   // 女聲／孩子／男聲
    const count = Math.round(rand(5, 7));
    const interval = rand(0.17, 0.2);                                       // 太平均：真的笑聲會越笑越慢、越不規則
    const f1 = rand(650, 780), f2 = rand(850, 1000);                        // F2 偏低：像把「啊」唱成「喔」
    const lvl = -15 + (strength - 1) * 3;
    const laugh = (start, f0, db) => {
      for (let i = 0; i < count; i++) {
        const ts = start + i * interval * rand(0.97, 1.03);
        const f = f0 * (1 - i * 0.01);                                      // 音高只掉一點點
        formantVoice(ts, [[0, f * 1.08], [0.05, f]], 0.12, db - i * 0.6, f1, f2, bus);
      }
    };
    laugh(t, voice, lvl);
    // 遲到的回聲笑：音高對不上、更小聲，像另一個人在別的房間跟著笑
    if (Math.random() < 0.6) laugh(t + rand(0.3, 0.5), voice * 1.19, lvl - 7);
    return count * interval + 0.9;
  }

  // 2. 冰淇淋車：遠處喇叭的小調，會經過你、偏一個音、尾巴像卡帶沒電
  const TRUCK_TUNE = [[7, .5], [7, .5], [9, .5], [7, .5], [4, .5], [7, .5], [12, 1.5],
    [12, .5], [14, .5], [12, .5], [9, .5], [7, .5], [4, 1.5],
    [2, .5], [4, .5], [7, .5], [9, .5], [7, .5], [4, .5], [0, 2]];
  function mimicTruck(t, strength) {
    const beat = rand(0.2, 0.24);
    // 電話頻寬＋輕微失真：車頂喇叭的味道
    const hp = new Tone.Filter(450, 'highpass', -12);
    const lp = new Tone.Filter(3300, 'lowpass', -12);
    const dist = new Tone.Distortion(0.18);
    const pan = new Tone.Panner(-0.9);
    const gain = new Tone.Gain(0.15);
    hp.connect(lp); lp.connect(dist); dist.connect(gain); gain.connect(pan); pan.connect(bus);

    const tune = TRUCK_TUNE.concat(TRUCK_TUNE.slice(0, 7));                 // 整首＋再回頭唱開頭一小段，像在循環
    const wrongIdx = Math.floor(rand(5, tune.length - 3));
    const wrongCents = Math.random() < 0.35 ? 100 : pick([-1, 1]) * rand(45, 70);
    const ph = rand(0, 6.28);
    let tt = t;
    let totalBeats = 0;
    tune.forEach(([, b]) => { totalBeats += b; });
    let elapsed = 0;
    tune.forEach(([s, b], i) => {
      const progress = elapsed / totalBeats;
      const slow = progress > 0.72 ? 1 + (progress - 0.72) * 2.6 : 1;        // 尾段越拖越慢
      const d = b * beat * slow;
      const cents = wowCents(tt - t, ph, -90, totalBeats * beat * 1.2) + (i === wrongIdx ? wrongCents : 0);
      bellNote(tt, semi(s + 12, cents) , Math.min(0.9, d * 1.4), -12 + (strength - 1) * 3, hp);
      tt += d;
      elapsed += b;
    });
    const dur = tt - t;
    // 車子經過：由遠而近、再由近而遠，同時由左飄到右
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.linearRampToValueAtTime(1.0, t + dur * 0.5);
    gain.gain.linearRampToValueAtTime(0.1, t + dur);
    pan.pan.setValueAtTime(-0.9, t);
    pan.pan.linearRampToValueAtTime(0.9, t + dur);
    disposeLater([hp, lp, dist, pan, gain], t + dur + 1);
    return dur + 0.6;
  }

  // 3. 遊樂園：旋轉木馬的華爾滋（砰－恰－恰），一個和弦被「吃掉」半個音
  function mimicFair(t, strength) {
    const beat = rand(0.3, 0.36);
    const lp = new Tone.Filter(3000, 'lowpass', -12).connect(bus);
    const roots = [0, 5, 7, 0, 5, 7];                                       // C F G C F G（相對 C）
    const bars = roots.length;
    const badBar = Math.floor(rand(1, bars - 1));
    const badCents = pick([-1, 1]) * rand(40, 65);
    const ph = rand(0, 6.28);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];                              // 旋律的五聲＋音階
    let mel = Math.floor(rand(2, 5));
    const lvl = -17 + (strength - 1) * 3;
    for (let bar = 0; bar < bars; bar++) {
      const bt = t + bar * 3 * beat;
      const r = roots[bar];
      const bad = bar === badBar ? badCents : 0;
      const c = (x) => wowCents(bt - t, ph, -40, bars * 3 * beat) + x;
      reedNote(bt, semi(r - 12, c(0)), beat * 0.8, lvl + 1, lp);                              // 砰
      [1, 2].forEach((k) => {                                                                 // 恰、恰
        [0, 4, 7].forEach((iv, j) => reedNote(bt + k * beat, semi(r + iv, c(j === 1 ? bad : 0)), beat * 0.45, lvl - 4, lp));
      });
      for (let k = 0; k < 3; k++) {                                                           // 旋律：隨機漫步
        mel = Math.max(0, Math.min(scale.length - 1, mel + pick([-2, -1, 1, 1, 2])));
        reedNote(bt + k * beat, semi(scale[mel] + 12, c(0)), beat * 0.85, lvl, lp);
      }
    }
    disposeLater([lp], t + bars * 3 * beat + 1);
    return bars * 3 * beat + 0.5;
  }

  // 4. 音樂盒：生日快樂／搖籃曲，發條鬆掉越來越慢，常常唱到一半就停
  const BIRTHDAY = [[7, .75], [7, .25], [9, 1], [7, 1], [12, 1], [11, 2],
    [7, .75], [7, .25], [9, 1], [7, 1], [14, 1], [12, 2],
    [7, .75], [7, .25], [19, 1], [16, 1], [12, 1], [11, 1], [9, 2],
    [17, .75], [17, .25], [16, 1], [12, 1], [14, 1], [12, 2]];
  const LULLABY = [[4, 1], [4, 1], [7, 2], [4, 1], [4, 1], [7, 2],
    [4, 1], [7, 1], [12, 1], [11, 1], [9, 2], [9, 1], [7, 3],
    [2, 1], [4, 1], [5, 2], [2, 1], [2, 1], [5, 2],
    [2, 1], [5, 1], [11, 1], [9, 1], [7, 2], [7, 1], [4, 3]];
  function mimicMusicBox(t, strength) {
    const tune = pick([BIRTHDAY, LULLABY]);
    const beat = rand(0.42, 0.5);
    const lp = new Tone.Filter(4200, 'lowpass', -12).connect(bus);
    const stopAt = Math.floor(tune.length * rand(0.55, 1.0));               // 有時唱到一半就停（像忘了後面）
    const wrongIdx = Math.floor(rand(4, Math.max(5, stopAt - 1)));
    const wrongCents = pick([-1, 1]) * rand(45, 70);
    const ph = rand(0, 6.28);
    let tt = t;
    let elapsed = 0;
    const totalBeats = tune.slice(0, stopAt).reduce((a, n) => a + n[1], 0);
    for (let i = 0; i < stopAt; i++) {
      const [s, b] = tune[i];
      const progress = elapsed / totalBeats;
      const slow = progress > 0.6 ? 1 + (progress - 0.6) * 1.8 : 1;         // 發條鬆掉
      const d = b * beat * slow;
      const cents = wowCents(tt - t, ph, -70, totalBeats * beat) + (i === wrongIdx ? wrongCents : 0);
      bellNote(tt, semi(s + 12, cents), Math.min(1.6, d * 1.8 + 0.4), -13 + (strength - 1) * 3, lp);
      tt += d;
      elapsed += b;
    }
    disposeLater([lp], tt + 2);
    return tt - t + 1.2;
  }

  // 5. 遠方的孩子：聽不出字的嘈雜聲，偶爾一聲歡呼
  function mimicKids(t, strength) {
    const dur = rand(4, 6);
    const lp = new Tone.Filter(2600, 'lowpass', -12).connect(bus);
    const env = new Tone.Gain(0).connect(lp);
    const peak = Tone.dbToGain(-23 + (strength - 1) * 3);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
    env.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.75);
    env.gain.linearRampToValueAtTime(0, t + dur);
    // 人聲嘈雜：粉紅噪音經帶通，中心頻率緩慢搖動（像母音在變）＋不規則的斷續
    const noise = new Tone.Noise('pink').start(t);
    const bp = new Tone.Filter({ frequency: 1300, type: 'bandpass', Q: 1.6 });
    const sweep = new Tone.LFO({ frequency: rand(0.8, 1.6), min: 700, max: 2200 }).start(t);
    sweep.connect(bp.frequency);
    const chop = new Tone.Gain(0.5);
    const chopLfo = new Tone.LFO({ frequency: rand(3.5, 5.5), min: 0.1, max: 1 }).start(t);
    chopLfo.connect(chop.gain);
    noise.connect(bp); bp.connect(chop); chop.connect(env);
    noise.stop(t + dur + 0.1);
    disposeLater([lp, env, noise, bp, sweep, chop, chopLfo], t + dur);
    // 一兩聲歡呼：高音、帶上揚再回落的音高
    const shouts = Math.random() < 0.7 ? 2 : 1;
    for (let i = 0; i < shouts; i++) {
      const ts = t + rand(0.8, dur - 1.2);
      const f = rand(520, 760);
      formantVoice(ts, [[0, f], [0.25, f * 1.3], [0.55, f * 1.05]], 0.6, -21 + (strength - 1) * 3, 800, 1600, lp, 0.35);
    }
    return dur + 0.4;
  }

  // 6. 門鈴：叮—咚，第二聲偏低一點，餘音拖很長
  function mimicDoorbell(t, strength) {
    const lp = new Tone.Filter(4500, 'lowpass', -12).connect(bus);
    const hi = 659.26 * rand(0.99, 1.01);
    const lo = 523.25 * rand(0.955, 0.985);                                 // 「咚」偏低，不是乾淨的大三度
    bellNote(t, hi, 2.4, -12 + (strength - 1) * 3, lp);
    bellNote(t + rand(0.7, 0.9), lo, 3.0, -12 + (strength - 1) * 3, lp);
    disposeLater([lp], t + 4);
    return 3.2;
  }

  // 底噪：很低的「嗡——」，像沒人空間的日光燈／空調（把所有擬聲墊在同一個空間裡）
  function roomTone(t, dur, levelDb) {
    const lpf = new Tone.Filter(420, 'lowpass', -24).connect(bus);
    const env = new Tone.Gain(0).connect(lpf);
    const peak = Tone.dbToGain(levelDb);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.8);
    env.gain.linearRampToValueAtTime(0, t + dur);
    const nodes = [lpf, env];
    [[hz('D2'), 'triangle', 1.0], [hz('D2') * 2.005, 'sine', 0.4], [hz('A2') * 0.998, 'sine', 0.3]].forEach(([fr, type, gain]) => {
      const osc = new Tone.Oscillator({ type, frequency: fr, detune: rand(-8, 8) }).start(t);
      const g = new Tone.Gain(gain);
      const lfo = new Tone.LFO({ frequency: rand(0.1, 0.3), min: -10, max: 10, phase: rand(0, 360) }).start(t);
      lfo.connect(osc.detune);
      osc.connect(g); g.connect(env);
      osc.stop(t + dur + 0.1);
      nodes.push(osc, g, lfo);
    });
    disposeLater(nodes, t + dur);
  }

  const MIMICS = [
    { kind: 'laugh', w: 3, fn: mimicLaugh },
    { kind: 'truck', w: 3, fn: mimicTruck },
    { kind: 'fair', w: 3, fn: mimicFair },
    { kind: 'musicbox', w: 3, fn: mimicMusicBox },
    { kind: 'kids', w: 2, fn: mimicKids },
    { kind: 'door', w: 1, fn: mimicDoorbell },
  ];
  function pickMimic(exclude) {
    const pool = MIMICS.filter((m) => m.kind !== exclude);
    let r = Math.random() * pool.reduce((a, m) => a + m.w, 0);
    for (const m of pool) { r -= m.w; if (r <= 0) return m; }
    return pool[0];
  }

  // 一次「模仿」。strength：1 平常；1.4 擁抱時更豐富（多一種、略大聲、一定有笑聲）
  function call(strength = 1) {
    if (!ready || !enabled) return;
    lastCallAt = Date.now();
    const t = Tone.now() + 0.1;
    const n = strength > 1 ? 3 : (Math.random() < 0.3 ? 3 : 2);
    let pos = t + 0.8;
    let prev = lastKind;
    for (let i = 0; i < n; i++) {
      const m = (strength > 1 && i === 0) ? MIMICS[0] : pickMimic(prev);
      const d = m.fn(pos, strength);
      prev = m.kind;
      pos += d + rand(0.6, 1.8);
    }
    lastKind = prev;
    const total = pos - t;
    roomTone(t, total + 1, -27 + (strength - 1) * 2);

    // 整體位置輕輕飄過去
    const startPan = rand(-0.4, 0.4);
    panner.pan.cancelScheduledValues(t);
    panner.pan.setValueAtTime(startPan, t);
    panner.pan.linearRampToValueAtTime(-startPan * 0.5, t + total);
  }

  // 排下一次模仿：13～20 秒後（持續循環）
  function scheduleNext(firstDelay) {
    clearTimeout(timer);
    if (!enabled || !active) return;
    const delay = firstDelay !== undefined ? firstDelay : rand(13000, 20000);
    timer = setTimeout(() => {
      if (document.hidden) { scheduleNext(); return; } // 分頁沒在看就不出聲
      call(1);
      scheduleNext();
    }, delay);
  }

  return {
    // 按「聲音」按鈕：必須在使用者點擊事件裡呼叫（瀏覽器規定）
    async toggle(isLove) {
      if (typeof Tone === 'undefined') return false; // CDN 沒載到
      if (!enabled) {
        active = !!isLove;
        await Tone.start();
        if (!ready) {
          build();
          await reverbRef.generate(); // 殘響要先算好才不會前幾秒沒聲音
          ready = true;
        }
        enabled = true;
        scheduleNext(2500); // 打開後 2.5 秒先模仿一次，讓使用者知道有開
      } else {
        enabled = false;
        clearTimeout(timer);
      }
      return enabled;
    },
    // 切換物種時呼叫：只有「愛」在場才會出聲
    setActive(isLove) {
      const wasActive = active;
      active = isLove;
      if (!isLove) clearTimeout(timer);
      else if (!wasActive) scheduleNext(1500);
    },
    // 擁抱時模仿得更豐富（10 秒冷卻，避免連按變吵）
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
