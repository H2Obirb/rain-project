// ============================================================
// M2 物種雛形：精神概念體 3D 模擬系統
// 支援三大物種切換與完整獨立操作：
// 1. 愛 (Love)    - 強效同化・光絲擁抱・極高能耗與覓食渴望
// 2. 羞恥 (Shame) - 碰觸自動解體，移開自動重組
// 3. 虛無 (Void)  - 分散再聚合、包覆吞噬、共鳴同化、維度瞬移（3D⇄2D 來回切換）
// ============================================================
//
// 【除錯標註約定】寫在行內註解裡，VS Code 會自動上色，總表由工具自動重建：
//   綠  FIXED-nnn  已修正並驗證過（改壞了要回來看這裡）
//   黃  TODO-nnn   待修正，已知但還沒排到
//   紅  BUG-nnn    未修正，已知問題
//   完整寫法是「狀態-編號: 說明」，例如上面三種狀態後面接半形冒號再接說明文字
//   改完程式 → 跑 `npm run fix-status` → DEBUG_STATUS.md 就會是最新狀態
//
// FIXED-002: 本檔於 2026/11/11 通過 node --check 語法檢查（除錯基準線）

let scene, camera, renderer, controls;
let clock;
let currentSpecies = 'love'; // 'love' | 'shame' | 'void'

// 共同互動變數
const mouse = new THREE.Vector2(-9999, -9999);
const raycaster = new THREE.Raycaster();
let hitboxMesh; // 羞恥專用碰撞體
let isHovered = false;

// -------------------------------------------------------------
// [愛 Love] 專屬變數
// -------------------------------------------------------------
let loveGroup;
let loveCore, loveCoreGlow, loveAura, loveHalo, loveSpiralMat, loveWings = [];
let loveDrips = []; // 熔岩膠滴（即將滴落）
let loveEyeMesh, loveEyeMat, loveShroudClothMat, loveShroudCavityMat; // 兜帽裹屍的眼球與布料材質
// 布料與眼球共用同一組 uniforms：讓既有的 uIntensity 補能量 tween 一次驅動兩者
// 並用 loveCore.material = { uniforms } 維持舊程式碼的存取路徑不變
const loveShroudUniforms = {
  uTime: { value: 0 },
  uIntensity: { value: 1.2 },
  // 兜帽縫那顆眼球凸起（mesh local 座標，GLB 載入後會用實測值覆蓋）
  uEyeLocal: { value: new THREE.Vector3(-0.012, 0.612, 0.135) },
  uEyeRadius: { value: 0.052 / 1.48 },
  // 身體中軸（mesh local）：用來判斷「哪些面是布殼內側」
  uCenterLocal: { value: new THREE.Vector3(0, 0, 0) },
};
let loveRelics = []; // 愛的遺物（覓食光線的連線目標）
let loveFeedGroup = null; // 覓食光線群組（偷偷連著 loveEnvGroup，切物種自動隱藏）
let loveFeedSlots = []; // 覓食光絲槽位（只連最近的十幾顆遺物，見 buildLoveFeedSystem）
let loveFeedPickT = 0; // 距離下次重選遺物的倒數秒數
let isLoveFeeding = false; // 覓食狀態開關（按「渴望覓食」切換）
let loveFeedFactor = 0; // 光線淡入淡出係數 0→1
let loveEnvGroup; // 愛的專屬環境：廢墟住宅區
let sinsEnvGroup; // 七大罪專屬環境：廢墟監獄＋流氓街道
let sinsLamps = []; // Zaun 化技燈（綠／琥珀閃爍）
const LOVE_HOVER_Y = 5.0; // 愛懸浮高度（屋頂約 4.7：抬到屋頂以上，配合下方仰角鏡頭襯藍天）
const LOVE_FOLLOW_RANGE = 68; // 可移動範圍半徑（住宅區整張圖）
const LOVE_MOVE_SPEED = 7.0; // WASD 移動速度（單位/秒）
const LOVE_RISE_SPEED = 4.5; // 空白鍵上升速度（單位/秒）
const LOVE_SINK_SPEED = 3.5; // Shift 下降速度（單位/秒）
const LOVE_MIN_Y = 1.0; // 最低懸浮（本體底不插地）
const LOVE_MAX_Y = 16.0; // 最高懸浮
let loveBaseY = LOVE_HOVER_Y; // 愛的基準高度（空白/Shift 調整，浮沉疊在上面）
let loveFollowInit = false; // 是否需要重設相機跟隨基準
const loveCamOffset = new THREE.Vector3(0, -1.4, 9.5); // 相機相對愛的固定偏移（在下方微仰角：往下看背景永遠是地面會融成一片，仰角才襯藍天）
const loveKeys = {}; // WASD 按鍵狀態

// 鍵盤偵測（僅「愛」使用）
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  loveKeys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  loveKeys[e.key.toLowerCase()] = false;
});
// 翅膀根部的 z：放在布殼背面（布殼 z 範圍約 -0.61~0.36）之後，從正面看不到翅膀穿出布殼
const LOVE_WING_Z = -1.05;
// FIXED-010: 愛的光之擁抱——原本翅膀是平面整片旋轉＋放大 4 倍（疊上整隻 1.8 倍）→ 變一面白牆、包不住身體；
//   改成把每根羽毛沿「環繞身體的圓弧」彎過來（圓柱彎曲），羽毛轉向朝下垂成披風。驗證：展開／環抱截圖（正面、俯視、3/4）＋收回後羽毛回到原位
// 環抱：把平面翅膀沿著「環繞身體的圓弧」彎過來（圓柱彎曲），而不是整片旋轉
const LOVE_HUG_CURVE = 1.25;      // 完全環抱時的彎曲率（越大圓越小）；搭配放大 1.3 → 圓半徑約 1.04，貼著約 1.55 寬的身體
const LOVE_HUG_SCALE_ADD = 0.3;   // 環抱時翅膀放大（整隻愛本身另有 1.8 倍）
const LOVE_HUG_TIP_CURL = 0.25;   // 越外側的羽毛越往內側多轉的角度（弧度）：翼尖向內收攏
const LOVE_HUG_HANG = 0.8;        // 環抱時羽毛轉向「朝下垂」的程度（0＝維持原本指向，1＝完全垂直向下）
const LOVE_HUG_HANG_DEG = -92;    // 「朝下垂」的指向角（度）
const LOVE_HUG_SHORTEN = 0.2;     // 環抱時羽毛縮短比例（太長會戳出身體外面）
const LOVE_HUG_DROP = 1.0;        // 環抱時翅膀外端往下垂的高度（像手臂環抱在胸前，而不是高舉過頭）
let loveWingMode = 'normal'; // 'normal' | 'shedding' | 'shed' | 'regrowing'
let loveWingTweens = [];
let loveParticles, loveParticleVels = [];
let loveEnergy = 1.0; // 能量值 (0.0 ~ 1.0)
let isLoveAssimilating = false;
let loveEmbrace = 0; // 環抱當前值 (0 = 展開, 1 = 完全環抱)
let loveEmbraceTarget = 0; // 環抱目標值

// -------------------------------------------------------------
// [羞恥 Shame] 專屬變數
// -------------------------------------------------------------
let shameGroup;
let shameEnvGroup; // 羞恥專屬環境：羅馬競技場遺址
const SHAME_HOVER_Y = 3.6; // 羞恥懸浮高度：球半徑約 2.2，抬高才不會埋進沙地
let shameScribbles = []; // 羞恥本體：蠟筆塗鴉筆劃
const shameFleeVel = new THREE.Vector3(); // 逃離鼠標的速度
let crayonAlphaTex; // 蠟筆顆粒貼圖
let shameFaceMat; // 鬼臉五官共用的白蠟筆筆觸材質
let shameAccentMat; // 鬼臉周圍亂畫記號的粉紅筆觸材質
let shameParticles;
let shameDisassembleFactor = 0; // 0 = 完整閉合, 1 = 完全解體
let targetShameFactor = 0;
let isFlushed = false;
let shameHuddle = false;          // 緊縮護核：縮小＋塗鴉變密＋膽小貼牆
let shameHuddleFactor = 0;        // 0→1 插值（縮小與線條加密漸變）
let shameHuddleTarget = null;     // 牆邊目標點
const shameTiptoe = { t: 0 };      // 鬼祟節奏時鐘（鬼祟小步 vs 沒人看時的快速衝刺）
const shameDash = { mode: 'rest', timer: 1.0, target: new THREE.Vector3() }; // 泛紅暴衝狀態機

// 羞恥每幀運算的暫存物件（避免 64 筆劃 × 每幀 new 出一堆物件）
const shamePosTmp = new THREE.Vector3();
const shameQuatA = new THREE.Quaternion();
const shameQuatB = new THREE.Quaternion();
const shameQuatFace = new THREE.Quaternion();
const shameQuatTilt = new THREE.Quaternion();
const shameGroupInvQuat = new THREE.Quaternion();
const shameEulerTmp = new THREE.Euler();

// -------------------------------------------------------------
// [虛無 Void] 專屬變數
// -------------------------------------------------------------
let voidGroup;
let voidCore, voidInnerWire, voidAura, voidMembrane, voidMembraneWire;
let voidGyroRings = [];
let voidRunes = [];          // 環繞虛無的古文明符文（取代原本的正八面體）
let voidRuneTextures = [];   // 程序生成的符文貼圖，多個符文共用
const voidRuneBurst = { v: 0 }; // 「分散再聚合」指令用的爆開係數
const voidRunePosTmp = new THREE.Vector3();
const voidRuneCamQuat = new THREE.Quaternion();
const voidRuneGroupInv = new THREE.Quaternion();
let voidParticles, voidParticlePositions;
let voidTesseractCore, voidTesseractHalo, voidTesseractJoints; // 核心中心的四維超立方體
let tesseractV4D = [], tesseractEdges = [];
let isVoidActionRunning = false;
let isVoidFlat = false;            // 維度瞬移：目前是否停在二維形態
const voidFlatState = { v: 0 };    // 0 = 三維（四維超立方體），1 = 二維（立方體畫在平面上）
const voidFlatLook = new THREE.Object3D();      // 二維紙片朝向的輔助物件
const voidFlatFaceQ = new THREE.Quaternion();   // 進入二維那一刻的鏡頭方向快照
const voidFlatTargetQ = new THREE.Quaternion(); // 每幀算出的目標朝向

// -------------------------------------------------------------
// [七大罪 Seven Sins 群居共生生態] 專屬變數
// -------------------------------------------------------------
let sinsGroup;
let sinCreatures = {}; // pride, greed, wrath, envy, lust, gluttony, sloth
let sinWebTubes = [];
let sinWebPulses = [];
let sinSpores, sinSporeVels = [];
let currentSelectedSin = 'all';
let isSinsActionRunning = false;
let isSinsFrenzy = false;

// 七大罪群居生態設定與詳細資訊
const SINS_DATA = {
  all: {
    title: "七位一體共生生態群落",
    role: "相互寄生・相互制衡・互為食物鏈與情緒源",
    morph: "七個不同頻率的精神幾何生命體構成之殖群",
    forage: "透過空間中流動的光絲微粒網絡共享能量，構成封閉能量循環",
    state: "生態平衡・7 隻生命體共生共鳴中",
    cameraPos: { x: 0, y: 10.5, z: 26.5 },
    targetPos: { x: 0, y: 3.2, z: -0.5 }
  },
  pride: {
    title: "傲慢（Pride / 支配之冕）",
    role: "【頂端支配者】位居最高點，俯視整個群落並散播統御金冕",
    morph: "帝王紫晶核・鑽白八星環冕・紅寶頂珠・王金拱弧",
    forage: "不從事物質採集，專門吸收其餘六罪散溢的崇拜波紋維持光環",
    state: "傲然旋轉中・正以冷冽光輝排斥一切低階靠近",
    cameraPos: { x: 0, y: 11.4, z: -4.4 },
    targetPos: { x: 0, y: 10.2, z: -10 }
  },
  greed: {
    title: "貪婪（Greed / 聚斂之爪）",
    role: "【物資聚斂者】不斷將環境游離微粒抽入體內，只進不出",
    morph: "翡翠二十面體・六向向內收縮琉璃吸爪・高密度環形吸積盤",
    forage: "伸展琉璃觸爪捕捉周遭所有光點，形成微型引力晶球",
    state: "聚斂中・周圍吸積盤持續掠奪環境微粒",
    cameraPos: { x: -1.4, y: 2.2, z: 0.9 },
    targetPos: { x: -5.2, y: 0.9, z: -4.0 }
  },
  wrath: {
    title: "暴怒（Wrath / 熔岩刺核）",
    role: "【熱能引爆者】極具攻擊性，群落面臨干擾時爆發震波護衛殖群",
    morph: "赤紅脈衝多面核・升騰熔焰火舌・膨脹烈焰震波環",
    forage: "將外界衝擊與敵意轉化為體內核聚變反應熱能",
    state: "臨界高熱・體表火舌正以高頻劇烈搖曳",
    cameraPos: { x: -0.8, y: 2.6, z: 11.8 },
    targetPos: { x: -5.0, y: 1.4, z: 6.5 }
  },
  envy: {
    title: "嫉妒（Envy / 凝視之蛇）",
    role: "【陰影監視寄生體】盤踞在傲慢身旁，隨時伺機竊取頂端榮耀",
    morph: "赤紅莫比烏斯扭結帶・凝血眼球晶核・環伺紅紫鬼火",
    forage: "發射干擾頻率干涉鄰近個體，偷取其光譜反射",
    state: "陰暗窺探・冷眼持續鎖定觀看者",
    cameraPos: { x: 4.9, y: 3.4, z: -1.6 },
    targetPos: { x: 4.8, y: 2.3, z: -6.5 }
  },
  lust: {
    title: "慾（Lust / 纏縛螺旋）",
    role: "【牽引誘餌】以誘人的脈動光把一切拉近，再隨心跳收緊纏縛；群落靠它彼此牽引、無法分開",
    morph: "鋸齒緞帶織成的紡錘籠・籠中搏動的暗紅核・底部六片合攏的利刃花瓣・頂端帶光點的誘引絲",
    forage: "以脈動光誘引靠近之物，心跳時收籠纏縛，吸取牠們的神經突觸光絲",
    state: "引誘中・核以雙拍搏動，每次心跳籠都收緊一分",
    cameraPos: { x: 0, y: 3.6, z: 15.2 },
    targetPos: { x: 0, y: 2.5, z: 9.5 }
  },
  gluttony: {
    title: "暴食（Gluttony / 吞噬之口）",
    role: "【代謝胃囊消化腔】吞噬空間中所有死物與殘骸，轉化為群落養分",
    morph: "三重擴張同心圓吞嚥漏斗・巨型厚重有機囊袋・流動齒輪環",
    forage: "不斷產生向內吸力，將大體積碎片過濾研磨消化",
    state: "深層飢渴・吞嚥漏斗正以 0.8Hz 規律吸納中",
    cameraPos: { x: 1.2, y: 2.7, z: 5.3 },
    targetPos: { x: 5.2, y: 1.7, z: 0 }
  },
  sloth: {
    title: "怠慢（Sloth / 滯重沉降者）",
    role: "【生態基底重力錨】以沉重的質量把群落過剩的動能拖進地底；越靠近它，一切越慢、越沉",
    morph: "層層堆疊的灰岩軟體・肚腹垂掛的石筍利齒・斷節重臂・岩縫透出的暗紫幽光・環繞下沉的灰燼碎片",
    forage: "吸收靠近之物的動能與時間：光絲被拖慢、孢子被拽向地面，本體幾乎不耗能",
    state: "沉降中・重力圈緩慢收縮，每一次呼吸都像地層在錯動",
    cameraPos: { x: 0.6, y: 2.4, z: 8.6 },
    targetPos: { x: -1.6, y: 1.6, z: 3.4 }
  }
};

// DOM 元素引用
const loveEnergyText = document.getElementById('love-energy-text');
const loveEnergyBar = document.getElementById('love-energy-bar');
const shameStateText = document.getElementById('current-state-text');
const voidStateText = document.getElementById('void-state-text');
const speciesTitle = document.getElementById('species-title');
const speciesSubtitle = document.getElementById('species-subtitle');
const categoryBadge = document.getElementById('category-badge');
const promptBox = document.getElementById('interaction-prompt');
const hoverHintText = document.getElementById('hover-hint-text');

const hudHeader = document.getElementById('hud-header');
const loveInfo = document.getElementById('love-info');
const shameInfo = document.getElementById('shame-info');
const voidInfo = document.getElementById('void-info');
const sinsInfo = document.getElementById('sins-info');
const actionsPanel = document.getElementById('actions-panel');
const loveActions = document.getElementById('love-actions');
const shameActions = document.getElementById('shame-actions');
const voidActions = document.getElementById('void-actions');
const sinsActions = document.getElementById('sins-actions');
const hudFooter = document.querySelector('.hud-footer');

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  initScene();
  setupHitbox();
  buildLoveEnvironment();
  buildShameEnvironment();
  buildSinsEnvironment();
  setupSceneLighting();
  buildLoveCreature();
  buildShameCreature();
  buildVoidCreature();
  buildSinsColony();
  setupUI();
  setupMouseEvents();
  setSpecies('love'); // 預設展示「愛」
  // [TEMP-TEST] hash 直達切換（截圖驗證用，驗完移除）
  { const h = location.hash.replace('#',''); if (['love','shame','void','sins'].includes(h)) setSpecies(h); }
  animate();
});

// -------------------------------------------------------------
// 1. 場景配置
// -------------------------------------------------------------
// -------------------------------------------------------------
// 光影增強（輕量、不加外部套件）
//  1. 程序化環境貼圖（PMREM，一次性預算）：只貼在「環境裡偏光滑的材質」上，
//     讓金屬、車漆、玻璃、積水被光掃到時有微微的反光；生物材質不受影響。
//  2. 接觸陰影（柔邊暗斑）：房屋、車、街區建築底下的環境遮蔽感，免即時 SSAO。
//  3. 太陽光陰影 normalBias，去掉陰影斑紋。
// -------------------------------------------------------------
function makeEnvTexture(pm, kind) {
  const es = new THREE.Scene();
  const stops = kind === 'love'
    ? [[-1, 0x8da35a], [-0.05, 0xb5cb6f], [0.02, 0xfff1d6], [0.35, 0xcfe6ff], [1, 0x6fa8e8]]
    : [[-1, 0x0b0f0c], [-0.05, 0x141c17], [0.05, 0x26362b], [0.5, 0x1a2a22], [1, 0x0e1612]];
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), c1 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 50;
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const t = Math.min(1, Math.max(0, (y - stops[k][0]) / (stops[k + 1][0] - stops[k][0])));
    c.setHex(stops[k][1]).lerp(c1.setHex(stops[k + 1][1]), t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  es.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (hex, s, x, y, z, w, h) => {   // 發光面板＝反光裡的高光來源（亮度 > 1 保留 HDR）
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(s), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
  };
  if (kind === 'love') {
    panel(0xfff3e0, 8, 25, 39, 17, 16, 16);        // 太陽
    panel(0xdfeeff, 1.5, -30, 20, -20, 30, 12);    // 天空補光
  } else {
    panel(0xffb347, 5, -30, 8, -20, 10, 6);        // 琥珀燈
    panel(0x39d353, 4, 25, 10, -28, 10, 8);        // 化技綠
    panel(0xb8cdc4, 3, 0, 40, -5, 30, 10);         // 冷月光條
    panel(0xffb347, 3, 30, 6, 25, 8, 5);
  }
  const rt = pm.fromScene(es, 0.015);
  geo.dispose();
  return rt.texture;
}

// 只對「偏光滑」的標準材質套環境反射：越光滑反射越強；粗糙材質不動（避免整體變亮）
function applyEnvReflections(group, tex, base) {
  const seen = new Set();
  group.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || seen.has(m) || !m.isMeshStandardMaterial) return;
    seen.add(m);
    if (m.roughness >= 0.9 && m.metalness < 0.2) return;
    m.envMap = tex;
    m.envMapIntensity = base * Math.min(1, Math.max(0.1, (0.95 - m.roughness) * 2.2)) + m.metalness * 0.3;
    m.needsUpdate = true;
  });
}

let sinsEnvTex = null;   // 七大罪環境貼圖（環境材質與傲慢玻璃共用）
let _softRectTex = null;
function softRectShadowTex() {
  if (_softRectTex) return _softRectTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.shadowColor = '#000'; g.shadowBlur = 26; g.shadowOffsetX = 1000;
  g.fillStyle = '#000';
  g.fillRect(34 - 1000, 34, 60, 60);              // 陰影畫到畫布內，本體被推到畫布外
  _softRectTex = new THREE.CanvasTexture(c);
  return _softRectTex;
}
// 地面柔邊暗斑（偽環境遮蔽）；放在 parent 的局部座標 (x, z)
function addContactShadow(parent, x, z, w, d, opacity) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: softRectShadowTex(), color: 0x000000, transparent: true, opacity: opacity == null ? 0.5 : opacity,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.037, z);
  m.userData.noShadow = true;
  parent.add(m);
  return m;
}

function setupSceneLighting() {
  const sun = scene.getObjectByName('sunLight');
  if (sun) { sun.shadow.normalBias = 0.03; sun.shadow.bias = -0.0003; }
  const pm = new THREE.PMREMGenerator(renderer);
  if (loveEnvGroup) applyEnvReflections(loveEnvGroup, makeEnvTexture(pm, 'love'), 0.9);
  sinsEnvTex = makeEnvTexture(pm, 'sins');
  if (sinsEnvGroup) applyEnvReflections(sinsEnvGroup, sinsEnvTex, 1.0);
  pm.dispose();
}

function initScene() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060308);
  scene.fog = new THREE.FogExp2(0x060308, 0.022);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2.5, 15);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxDistance = 42;
  controls.minDistance = 3.5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;

  // 光源
  const ambientLight = new THREE.AmbientLight(0x221520, 1.4);
  ambientLight.name = 'ambientLight';
  scene.add(ambientLight);

  const mainLight = new THREE.PointLight(0xf59e0b, 3.8, 40);
  mainLight.position.set(8, 12, 10);
  mainLight.name = 'mainLight';
  scene.add(mainLight);

  const backLight = new THREE.PointLight(0xec4899, 3.2, 35);
  backLight.position.set(-10, -6, -8);
  backLight.name = 'backLight';
  scene.add(backLight);

  // 白天太陽光（僅「愛」的廢墟住宅區環境使用）
  const sunLight = new THREE.DirectionalLight(0xfff3e0, 0);
  sunLight.position.set(18, 28, 12);
  sunLight.name = 'sunLight';
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -48;
  sunLight.shadow.camera.right = 48;
  sunLight.shadow.camera.top = 48;
  sunLight.shadow.camera.bottom = -48;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 90;
  sunLight.shadow.bias = -0.0004;
  scene.add(sunLight);

  // 柔和天空半球光（僅愛環境使用）
  const hemiLight = new THREE.HemisphereLight(0xbfdcff, 0x7a6a55, 0);
  hemiLight.name = 'hemiLight';
  scene.add(hemiLight);

  window.addEventListener('resize', onWindowResize);
}

function setupHitbox() {
  const hitboxGeo = new THREE.SphereGeometry(2.5, 16, 16);
  const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
  hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
  scene.add(hitboxMesh);
}

// —— 愛的環境格局：主幹道＋三條垂直岔路＋前後後街構成街廓 ——
const LOVE_CROSS_STREETS = [-42, 0, 42];
const LOVE_BACK_STREETS = [42, -42];
const loveObstacles = []; // 房屋／車輛佔地，給樹與遺物避讓用

function loveOnStreet(x, z) {
  if (Math.abs(z) < 7.2) return true;
  for (const zs of LOVE_BACK_STREETS) if (Math.abs(z - zs) < 7.2) return true;
  for (const xs of LOVE_CROSS_STREETS) if (Math.abs(x - xs) < 7.2) return true;
  return false;
}

function loveBlocked(x, z, margin) {
  margin = margin || 0;
  for (const o of loveObstacles) {
    if (Math.abs(x - o.x) < o.hw + margin && Math.abs(z - o.z) < o.hd + margin) return true;
  }
  return false;
}

// -------------------------------------------------------------
// 2. 構建「愛 (Love)」- 強同化・燃燒心核・展翼擁抱
// -------------------------------------------------------------
// 愛的專屬環境：人類消失 5000 年後的美國住宅區廢墟（白天・晴天・柔光）
function buildLoveEnvironment() {
  loveEnvGroup = new THREE.Group();
  loveEnvGroup.visible = false;
  scene.add(loveEnvGroup);

  // 草地：指定色 #CBDB84
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: 0xb5cb6f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  loveEnvGroup.add(ground);

  // ===== 道路（優化版）=====
  // 柏油噪點貼圖＋雙黃線／邊線／斑馬線（實例化）＋人行道磚縫＋路緣石＋坑洞／補丁／人孔蓋＋縫隙雜草
  // y 逐層墊高避免閃爍：柏油 .02~.028 < 人行道 .03 < 補丁 .036 < 裂痕 .04~.06 < 標線 .048(+polygonOffset) < 坑洞 .05
  const rndR = (a, b) => a + Math.random() * (b - a);
  const mkTex = (draw, size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  };
  const asphaltTex = mkTex((g, s) => {
    g.fillStyle = '#5f6873'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {   // 碎石顆粒
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    for (let i = 0; i < 4; i++) {      // 補過的深色斑塊
      g.fillStyle = 'rgba(30,34,40,0.14)';
      g.fillRect(Math.random() * s * 0.7, Math.random() * s * 0.7, s * (0.12 + Math.random() * 0.2), s * (0.08 + Math.random() * 0.15));
    }
    g.strokeStyle = 'rgba(25,28,34,0.55)'; g.lineWidth = 1.2;   // 細裂縫
    for (let i = 0; i < 5; i++) {
      let x = Math.random() * s, y = Math.random() * s;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.2) * 30; g.lineTo(x, y); }
      g.stroke();
    }
  }, 256);
  const walkTex = mkTex((g, s) => {
    g.fillStyle = '#e8dfca'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(110,100,80,0.10)';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(120,112,95,0.7)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);   // 磚縫
    g.strokeStyle = 'rgba(100,92,78,0.55)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(s * 0.2, s * 0.1); g.lineTo(s * 0.45, s * 0.5); g.lineTo(s * 0.4, s * 0.9); g.stroke();
    for (let i = 0; i < 6; i++) {      // 角落青苔
      g.fillStyle = 'rgba(90,125,60,0.30)';
      g.beginPath(); g.arc(Math.random() < 0.5 ? 2 : s - 2, Math.random() < 0.5 ? 2 : s - 2, 6 + Math.random() * 12, 0, 7); g.fill();
    }
  }, 128);

  const roads = [
    { w: 140, d: 9, x: 0, z: 0, y: 0.02 },
    ...LOVE_CROSS_STREETS.map(xs => ({ w: 8, d: 84, x: xs, z: 0, y: 0.024 })),
    ...LOVE_BACK_STREETS.map(zs => ({ w: 140, d: 8, x: 0, z: zs, y: 0.028 })),
  ];
  roads.forEach(r => {
    const t = asphaltTex.clone(); t.needsUpdate = true; t.repeat.set(r.w / 6, r.d / 6);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r.x, r.y, r.z);
    mesh.receiveShadow = true;
    loveEnvGroup.add(mesh);
  });

  // 路面裂痕（沿每條道路散布）
  const crackMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1 });
  roads.forEach((r, ri) => {
    const horiz = r.w >= r.d;
    const long = horiz ? r.w : r.d;
    const short = horiz ? r.d : r.w;
    for (let i = 0; i < (ri === 0 ? 22 : 5); i++) {
      const crack = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 + Math.random() * 2.4, 0.04, 0.15 + Math.random() * 0.35),
        crackMat
      );
      crack.position.set(
        r.x + (horiz ? (Math.random() - 0.5) * (long - 10) : (Math.random() - 0.5) * (short - 2)),
        0.04,
        r.z + (horiz ? (Math.random() - 0.5) * (short - 1.5) : (Math.random() - 0.5) * (long - 10))
      );
      crack.rotation.y = Math.random() * Math.PI;
      loveEnvGroup.add(crack);
    }
  });

  // 道路標線：用 InstancedMesh（一次畫完），隨機缺段表示磨損
  const yellowMarks = [], whiteMarks = [];
  const dashX = (z, x0, x1, len, gap, list, band) => {
    for (let x = x0; x < x1; x += len + gap) {
      const cx = x + len / 2;
      if (LOVE_CROSS_STREETS.some(xs => Math.abs(cx - xs) < band)) continue;
      if (Math.random() < 0.22) continue;
      list.push({ x: cx, z, w: len * rndR(0.7, 1), d: 0.14 });
    }
  };
  const dashZ = (x, z0, z1, len, gap, list) => {
    for (let z = z0; z < z1; z += len + gap) {
      if (Math.random() < 0.22) continue;
      list.push({ x, z: z + len / 2, w: 0.14, d: len * rndR(0.7, 1) });
    }
  };
  dashX(0.13, -68, 68, 3.2, 0.3, yellowMarks, 5.2);     // 主幹道雙黃線
  dashX(-0.13, -68, 68, 3.2, 0.3, yellowMarks, 5.2);
  dashX(3.9, -68, 68, 5, 0.4, whiteMarks, 5.2);         // 主幹道邊線
  dashX(-3.9, -68, 68, 5, 0.4, whiteMarks, 5.2);
  LOVE_CROSS_STREETS.forEach(xs => {
    [-1, 1].forEach(s => {
      dashZ(xs, s > 0 ? 6 : -37, s > 0 ? 37 : -6, 3, 2.5, yellowMarks);
      dashZ(xs - 3.7, s > 0 ? 6 : -37, s > 0 ? 37 : -6, 5, 0.4, whiteMarks);
      dashZ(xs + 3.7, s > 0 ? 6 : -37, s > 0 ? 37 : -6, 5, 0.4, whiteMarks);
      for (let z = -3.6; z <= 3.61; z += 0.9) whiteMarks.push({ x: xs + s * 5.9, z, w: 1.8, d: 0.45 });     // 跨主幹道斑馬線
      for (let x = -3.2; x <= 3.21; x += 0.9) whiteMarks.push({ x: xs + x, z: s * 5.9, w: 0.45, d: 1.8 });   // 跨岔路斑馬線
    });
  });
  LOVE_BACK_STREETS.forEach(zs => {
    dashX(zs, -68, 68, 3, 2.5, yellowMarks, 5.2);
    dashX(zs - 3.7, -68, 68, 5, 0.4, whiteMarks, 5.2);
    dashX(zs + 3.7, -68, 68, 5, 0.4, whiteMarks, 5.2);
  });
  const makeMarks = (list, color) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      list.length
    );
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    list.forEach((o, i) => {
      m.compose(new THREE.Vector3(o.x, 0.048, o.z), q, new THREE.Vector3(o.w, o.d, 1));
      im.setMatrixAt(i, m);
    });
    im.frustumCulled = false;   // r128 的實例化剔除只看原點，會讓標線憑空消失
    im.receiveShadow = true;
    loveEnvGroup.add(im);
  };
  makeMarks(yellowMarks, 0xd9c36a);
  makeMarks(whiteMarks, 0xdcdad0);

  // 人行道：貼磚縫貼圖，在路口斷開（改由斑馬線連接）
  const xRanges = (half) => {
    const out = []; let start = -70;
    [...LOVE_CROSS_STREETS].sort((a, b) => a - b).forEach(xs => {
      if (xs - half > start) out.push([start, xs - half]);
      start = xs + half;
    });
    out.push([start, 70]);
    return out;
  };
  const addWalk = (cx, cz, w, d) => {
    const t = walkTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.6, d / 1.6);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.03, cz);
    mesh.receiveShadow = true;
    loveEnvGroup.add(mesh);
  };
  [-5.8, 5.8].forEach(z => xRanges(5.1).forEach(([a, b]) => addWalk((a + b) / 2, z, b - a, 1.6)));
  LOVE_BACK_STREETS.forEach(zs => [zs - 5.9, zs + 5.9].forEach(z => xRanges(5.1).forEach(([a, b]) => addWalk((a + b) / 2, z, b - a, 1.6))));
  LOVE_CROSS_STREETS.forEach(xs => [-1, 1].forEach(sx => [-1, 1].forEach(sz => addWalk(xs + sx * 5.9, sz * (6.6 + 35.3) / 2, 1.6, 35.3 - 6.6))));

  // 路緣石
  const curbMat = new THREE.MeshStandardMaterial({ color: 0xc2bca8, roughness: 1 });
  const addCurb = (cx, cz, len, horiz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len : 0.2, 0.14, horiz ? 0.2 : len), curbMat);
    m.position.set(cx, 0.07, cz);
    m.receiveShadow = true;
    loveEnvGroup.add(m);
  };
  [-4.7, 4.7].forEach(z => xRanges(4.4).forEach(([a, b]) => addCurb((a + b) / 2, z, b - a, true)));
  LOVE_BACK_STREETS.forEach(zs => [zs - 4.2, zs + 4.2].forEach(z => xRanges(4.4).forEach(([a, b]) => addCurb((a + b) / 2, z, b - a, true))));
  LOVE_CROSS_STREETS.forEach(xs => [-1, 1].forEach(sx => [-1, 1].forEach(sz => addCurb(xs + sx * 4.2, sz * (5.0 + 37.6) / 2, 37.6 - 5.0, false))));

  // 柏油補丁、坑洞、人孔蓋
  const inBand = (x) => LOVE_CROSS_STREETS.some(xs => Math.abs(x - xs) < 5.5);
  const patchMat = new THREE.MeshStandardMaterial({ color: 0x454c56, roughness: 1, transparent: true, opacity: 0.6 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x474c56, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (let i = 0; i < 24; i++) {
    const onMain = i < 14;
    const x = rndR(-62, 62);
    const z = onMain ? rndR(-3.4, 3.4) : LOVE_BACK_STREETS[i % 2] + rndR(-3, 3);
    if (inBand(x) || Math.hypot(x, z) < 4) continue;
    if (i % 3 === 0) {   // 補丁
      const p = new THREE.Mesh(new THREE.PlaneGeometry(rndR(1.5, 3.2), rndR(1, 2)), patchMat);
      p.rotation.set(-Math.PI / 2, 0, rndR(-0.2, 0.2));
      p.position.set(x, 0.036, z);
      loveEnvGroup.add(p);
    } else {             // 坑洞：外圈碎裂＋深色洞
      const r = rndR(0.3, 0.8), rot = rndR(0, 3);
      const rim = new THREE.Mesh(new THREE.CircleGeometry(r * 1.35, 10), rimMat);
      rim.rotation.set(-Math.PI / 2, 0, rot); rim.scale.set(1, 0.75, 1); rim.position.set(x, 0.05, z);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(r, 10), potMat);
      hole.rotation.set(-Math.PI / 2, 0, rot); hole.scale.set(1, 0.72, 1); hole.position.set(x, 0.052, z);
      loveEnvGroup.add(rim, hole);
    }
  }
  const manMat = new THREE.MeshStandardMaterial({ color: 0x4a4e57, roughness: 0.8, metalness: 0.3 });
  const manLine = new THREE.MeshStandardMaterial({ color: 0x6b707a, roughness: 0.8 });
  [[-30, 1.9], [-14, -1.9], [18, 1.9], [34, -1.9], [-52, -1.9], [56, 1.9]].forEach(([mx, mz]) => {
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 16), manMat);
    cover.position.set(mx, 0.045, mz);
    cover.receiveShadow = true;
    loveEnvGroup.add(cover);
    [0, Math.PI / 2].forEach(a => {
      const ln = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.05), manLine);
      ln.position.set(mx, 0.075, mz); ln.rotation.y = a;
      loveEnvGroup.add(ln);
    });
  });

  // 路緣與縫隙鑽出的雜草（實例化）
  const tuftN = 560;
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.45, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), tuftN);
  tuft.frustumCulled = false;
  const greens = [0x55783f, 0x6e8f48, 0x86a35d, 0x8d9a4c, 0x4d6b38].map(c => new THREE.Color(c));
  let tn = 0;
  const putTuft = (x, z) => {
    if (tn >= tuftN || Math.hypot(x, z) < 3) return;
    for (let k = 0; k < 3 && tn < tuftN; k++) {
      const s = rndR(0.35, 1.0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rndR(-0.3, 0.3), rndR(0, 6), rndR(-0.3, 0.3)));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x + rndR(-0.12, 0.12), 0.03 + 0.25 * s, z + rndR(-0.12, 0.12)), q, new THREE.Vector3(s, s, s));
      tuft.setMatrixAt(tn, m);
      tuft.setColorAt(tn, greens[Math.floor(Math.random() * greens.length)]);
      tn++;
    }
  };
  for (let i = 0; i < 190; i++) {
    const kind = i % 5;
    if (kind === 0) { const x = rndR(-68, 68); if (!inBand(x)) putTuft(x, (Math.random() < 0.5 ? -1 : 1) * rndR(4.45, 4.95)); }
    else if (kind === 1) { const x = rndR(-68, 68); if (!inBand(x)) putTuft(x, (Math.random() < 0.5 ? -1 : 1) * rndR(5.0, 6.6)); }
    else if (kind === 2) { const x = rndR(-62, 62); if (!inBand(x)) putTuft(x, rndR(-4.2, 4.2)); }
    else if (kind === 3) { const xs = LOVE_CROSS_STREETS[i % 3]; putTuft(xs + (Math.random() < 0.5 ? -1 : 1) * rndR(3.9, 4.6), (Math.random() < 0.5 ? -1 : 1) * rndR(6, 36)); }
    else { const zs = LOVE_BACK_STREETS[i % 2]; const x = rndR(-68, 68); if (!inBand(x)) putTuft(x, zs + (Math.random() < 0.5 ? -1 : 1) * rndR(3.9, 4.6)); }
  }
  tuft.count = tn;
  tuft.instanceMatrix.needsUpdate = true;
  if (tuft.instanceColor) tuft.instanceColor.needsUpdate = true;
  loveEnvGroup.add(tuft);

  // 房屋群：主幹道兩側各一排，損毀程度隨機
  // 房屋屋身：米色；屋頂每棟不同色（鮮豔晴天美國住宅社區）
  const houseColors = Array(20).fill(0xe8dcc3);
  const pickHouse = () => houseColors[Math.floor(Math.random() * houseColors.length)];
  // 歐美住宅屋頂高彩度色票（每棟屋頂不同）
  const roofColors = [
    0x8b2f1f, 0x4e2a20, 0x1f3a5f, 0x5a2d3e, 0x2c4d63,
    0x62321c, 0x1f5f5b, 0x5b2c6f, 0x34495e, 0x773c5e,
    0xb3472a, 0x111c2e, 0x3f6b4f, 0x6e2c3e, 0x121212
  ];
  const pickRoof = () => roofColors[Math.floor(Math.random() * roofColors.length)];
  // 歐美獨棟住宅：依序「主幹道 → 後街 → 岔路」貪婪擺放，每棟都檢查不碰路、不重疊
  // （舊的廢墟房屋函式 buildRuinedHouse 仍保留在檔案中，想還原把下面三段換回呼叫它即可）
  const housesPlaced = [];
  const tryRow = (cands, makePose) => {
    let spec = makeHouseSpec();
    cands.forEach(c => {
      const p = makePose(c, spec);
      if (!placeLoveHouse(p.x, p.z, p.rotY, spec)) return;
      housesPlaced.push(p);
      spec = makeHouseSpec();
    });
  };
  const range = (a, b, s) => { const r = []; for (let v = a; v <= b; v += s) r.push(v); return r; };

  // 主幹道兩側（面朝馬路）
  [-1, 1].forEach(side => {
    tryRow(range(-52, 52, 1), (x) => ({
      x, z: side * (14.5 + Math.random() * 0.8), rotY: side > 0 ? Math.PI : 0
    }));
  });

  // 後街外側（面朝後街）
  LOVE_BACK_STREETS.forEach(zs => {
    tryRow(range(-52, 52, 1), (x) => ({
      x, z: zs + Math.sign(zs) * 13, rotY: zs > 0 ? Math.PI : 0
    }));
  });

  // 岔路兩側（轉 90° 面朝岔路）
  LOVE_CROSS_STREETS.forEach(xs => {
    [-1, 1].forEach(sx => {
      tryRow(range(-38, 38, 1), (zc) => ({
        x: xs + sx * (13.4 + Math.random() * 0.4), z: zc, rotY: sx > 0 ? -Math.PI / 2 : Math.PI / 2
      }));
    });
  });

  // 傾倒電線桿與垂落電線感（簡化為傾斜桿體）；x避開三條垂直街
  // 第 26 次：降光防刺眼，馬卡龍柔光
  [-50, -28, -13, 15, 50].forEach(px => {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 7, 8),
      new THREE.MeshStandardMaterial({ color: 0xa8907a, roughness: 1 })
    );
    pole.position.set(px + (Math.random() - 0.5) * 2, 3.2, -6.9); // 放在道路遠側：預設鏡頭在 +z 仰角看愛，桿放 +z 會整根擋在前面
    pole.rotation.z = (Math.random() - 0.5) * 0.7;
    pole.rotation.x = (Math.random() - 0.5) * 0.4;
    pole.castShadow = true;
    loveEnvGroup.add(pole);
  });

  // 樹：半枯半盛，雜草吞噬文明（避開道路與房屋）
  // 第 26 次：降光防刺眼，馬卡龍柔光
  for (let i = 0; i < 26; i++) {
    let ok = false, x = 0, z = 0;
    for (let t = 0; t < 20 && !ok; t++) {
      x = (Math.random() - 0.5) * 100;
      z = (Math.random() > 0.5 ? 1 : -1) * (16 + Math.random() * 22);
      if (loveOnStreet(x, z) || loveBlocked(x, z, 2.5)) continue;
      ok = true;
    }
    if (ok) buildOvergrownTree(x, z);
  }

  // 後街之外的樹：把地平線往外推
  for (let i = 0; i < 14; i++) {
    let ok = false, x = 0, z = 0;
    for (let t = 0; t < 20 && !ok; t++) {
      x = (Math.random() - 0.5) * 120;
      z = (Math.random() > 0.5 ? 1 : -1) * (53 + Math.random() * 13);
      if (loveBlocked(x, z, 2.5)) continue;
      ok = true;
    }
    if (ok) buildOvergrownTree(x, z);
  }

  // 廢棄車輛（側視輪廓建模，十輛四種車型）與街道小物件（路標、消防栓、路燈…）
  buildLoveCars();
  buildLoveStreetProps();

  // 草叢與雜草簇（避開房屋佔地，讓草照樣長進路面縫裡）
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x55783f, roughness: 1 });
  for (let i = 0; i < 110; i++) {
    const x = (Math.random() - 0.5) * 110;
    const z = (Math.random() - 0.5) * 50;
    if (loveBlocked(x, z, 1.5)) continue;
    const weed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.4, 0), weedMat);
    weed.position.set(x, 0.12, z);
    weed.scale.y = 0.5 + Math.random() * 0.6;
    weed.castShadow = true;
    loveEnvGroup.add(weed);
  }

  // 愛的遺物：隨機散落街廓間、能承載「愛」概念的小物件
  buildLoveRelics();
}

// =============================================================
// 歐美郊區獨棟住宅（參考美國典型 suburban house：雙坡屋頂 6/12 坡度、
// 橫向壁板外牆、前門廊、附車庫、磚砌煙囪、百葉窗）
// 尺寸以公尺計；局部座標 +z 為正面，原點在主屋中心
// =============================================================
const HOUSE_SIDING = [0xf3ecd9, 0xe9e5dc, 0xd3dde6, 0xdce6d2, 0xf1e0b9, 0xe8d2c6, 0xc3d2db, 0xeadac3, 0xcfc9bc, 0xe6e2c8];
const HOUSE_ROOF = [0x4a4a4e, 0x5a4a42, 0x3d3f45, 0x6a5a50, 0x2f3640, 0x58504b];
const HOUSE_DOOR = [0x8b2f1f, 0x1f3a5f, 0x2f5d44, 0x2a2a2e, 0xb8862b, 0x5a2d3e];
const HOUSE_SHUTTER = ['#2f4a63', '#3d5a45', '#6b2a2a', '#2a2a2e'];
const _houseCache = { mat: {}, tex: {} };

function houseMat(color, rough, key) {
  const k = key || (color + '_' + rough);
  if (!_houseCache.mat[k]) _houseCache.mat[k] = new THREE.MeshStandardMaterial({ color, roughness: rough == null ? 0.9 : rough });
  return _houseCache.mat[k];
}

// 橫向壁板貼圖（每 0.2 m 一條板縫），依牆高決定垂直重複次數
function houseSidingMat(color, wallH) {
  const key = 'sid_' + color + '_' + wallH;
  if (_houseCache.mat[key]) return _houseCache.mat[key];
  const tkey = 'sid_' + wallH;
  if (!_houseCache.tex[tkey]) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#c9c4b8'; g.fillRect(0, i * 16, 64, 2);
      g.fillStyle = '#ece8de'; g.fillRect(0, i * 16 + 2, 64, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, wallH / 0.8);
    _houseCache.tex[tkey] = t;
  }
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, map: _houseCache.tex[tkey] });
  _houseCache.mat[key] = m;
  return m;
}

// 窗戶貼圖：白色窗框＋玻璃＋格條；shutter 有顏色時兩側加百葉窗
// state：'ok' 完好／'broken' 玻璃碎裂、框發黃／'gone' 玻璃全無、黑洞洞
function houseWindowMat(shutter, state) {
  state = state || 'ok';
  const key = 'win_' + (shutter || 'none') + '_' + state + '_' + (state === 'broken' ? Math.floor(Math.random() * 4) : 0);
  if (_houseCache.mat[key]) return _houseCache.mat[key];
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const x0 = shutter ? 0.18 : 0.02, x1 = shutter ? 0.82 : 0.98;
  const ruined = state !== 'ok';
  if (shutter) {
    g.fillStyle = ruined ? '#4d4a40' : shutter;
    g.fillRect(2, 4, 128 * 0.15, 120);
    if (!ruined || state === 'broken') g.fillRect(128 * 0.85 - 2, 4, 128 * 0.15, 120); // 損毀時右百葉窗常掉落
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 10; y < 120; y += 8) {
      g.fillRect(4, y, 128 * 0.15 - 4, 1.5);
      if (!ruined || state === 'broken') g.fillRect(128 * 0.85, y, 128 * 0.15 - 4, 1.5);
    }
  }
  const fx = 128 * x0, fw = 128 * (x1 - x0);
  g.fillStyle = ruined ? '#b9b39c' : '#fbf9f2'; g.fillRect(fx, 4, fw, 120);   // 窗框（損毀＝發黃）
  const gr = g.createLinearGradient(0, 12, 0, 116);
  if (state === 'gone') { gr.addColorStop(0, '#1b1916'); gr.addColorStop(1, '#0b0a09'); }
  else if (state === 'broken') { gr.addColorStop(0, '#46565f'); gr.addColorStop(1, '#1d262b'); }
  else { gr.addColorStop(0, '#b4cbdb'); gr.addColorStop(1, '#5f7f97'); }
  g.fillStyle = gr; g.fillRect(fx + 6, 12, fw - 12, 104);       // 玻璃
  if (state !== 'gone') {
    g.fillStyle = ruined ? '#b9b39c' : '#fbf9f2';
    g.fillRect(fx + fw / 2 - 1.5, 12, 3, 104);                  // 直格條
    g.fillRect(fx + 6, 12 + 104 / 3 - 1.5, fw - 12, 3);         // 橫格條
    g.fillRect(fx + 6, 12 + 208 / 3 - 1.5, fw - 12, 3);
  }
  if (state === 'broken') {
    g.strokeStyle = 'rgba(235,240,245,0.85)'; g.lineWidth = 1.5;   // 蛛網裂痕
    const cx = fx + fw * (0.3 + Math.random() * 0.4), cy = 30 + Math.random() * 50;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, L = 25 + Math.random() * 40;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
    }
    g.fillStyle = '#0b0a09';                                       // 缺角黑洞
    g.beginPath(); g.moveTo(cx - 14, cy - 10); g.lineTo(cx + 18, cy - 16); g.lineTo(cx + 8, cy + 20); g.lineTo(cx - 16, cy + 12); g.fill();
  }
  g.fillStyle = ruined ? '#9a947f' : '#e4dfd2'; g.fillRect(fx - 3, 120, fw + 6, 6);  // 窗台
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.22, metalness: 0.1, alphaTest: 0.5 });
  _houseCache.mat[key] = m;
  return m;
}

function houseGarageDoorMat() {
  if (_houseCache.mat.garage) return _houseCache.mat.garage;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#f2efe6'; g.fillRect(0, 0, 128, 96);
  g.strokeStyle = '#bdb8aa'; g.lineWidth = 2;
  for (let r = 0; r < 4; r++) {
    for (let col = 0; col < 4; col++) g.strokeRect(4 + col * 31, 4 + r * 23, 29, 21);
  }
  g.fillStyle = '#7a95a8';
  for (let col = 0; col < 4; col++) g.fillRect(8 + col * 31, 8, 21, 9); // 上排小窗
  const m = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.7 });
  _houseCache.mat.garage = m;
  return m;
}

// 雙坡屋頂（脊線沿局部 x），run＝半進深，坡度 6/12
function addHouseGable(parent, cx, baseY, cz, len, run, wallMat, roofMat, rotY, ruin) {
  ruin = ruin || 0;
  const g = new THREE.Group();
  g.position.set(cx, baseY, cz);
  g.rotation.y = rotY || 0;
  const rise = run * 0.5, ov = 0.5, R = run + ov;
  const Ls = Math.hypot(R, R * 0.5), a = Math.atan(0.5);
  const rafterMat = houseMat(0x4a3a2c, 1);
  [-1, 1].forEach(s => {
    // 廢墟：整片屋面塌掉只剩椽木；或屋面下垂、歪斜、掉落一角
    if (ruin > 0.35 && Math.random() < ruin * 0.5) {
      for (let i = 0; i < 5; i++) {
        const rf = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, Ls * (0.55 + Math.random() * 0.45)), rafterMat);
        rf.position.set(-len / 2 + (i + 0.5) * len / 5, rise - R / 4 + 0.05 - Math.random() * 0.3, s * R / 2 * (0.7 + Math.random() * 0.25));
        rf.rotation.x = s * a + (Math.random() - 0.5) * 0.5 * ruin;
        rf.rotation.z = (Math.random() - 0.5) * 0.3;
        g.add(rf);
      }
      return;
    }
    const lenS = ruin > 0.3 ? (len + 0.5) * (0.6 + Math.random() * 0.4) : len + 0.5;   // 屋面缺一段
    const slab = new THREE.Mesh(new THREE.BoxGeometry(lenS, 0.14, Ls), roofMat);
    slab.position.set(ruin > 0.3 ? (Math.random() - 0.5) * (len + 0.5 - lenS) : 0, rise - R / 4 + 0.07, s * R / 2);
    slab.rotation.x = s * a;
    if (ruin > 0.2) {
      slab.rotation.x += s * (Math.random() - 0.3) * ruin * 0.45;
      slab.rotation.z = (Math.random() - 0.5) * ruin * 0.35;
      slab.position.y -= Math.random() * ruin * 0.7;
    }
    g.add(slab);
  });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(len + 0.5, 0.12, 0.22), roofMat);
  ridge.position.set(0, rise + 0.12, 0);
  if (ruin < 0.5 || Math.random() < 0.35) g.add(ridge);
  const shape = new THREE.Shape();
  shape.moveTo(-run, 0); shape.lineTo(run, 0); shape.lineTo(0, rise);
  [-1, 1].forEach(s => {
    if (ruin > 0.7 && Math.random() < 0.3) return;   // 山牆整片倒塌
    const tri = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }), wallMat);
    tri.rotation.y = Math.PI / 2;
    tri.position.set(s > 0 ? len / 2 - 0.25 : -len / 2, 0, 0);
    g.add(tri);
  });
  parent.add(g);
  return g;
}

function makeHouseSpec() {
  const floors = Math.random() < 0.55 ? 2 : 1;
  const garage = Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : 0;
  const w = 6.3 + Math.random() * 1.1;
  const d = 5.9 + Math.random() * 0.8;
  const gw = garage ? 3.4 : 0;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return {
    floors, garage, w, d, gw,
    siding: pick(HOUSE_SIDING), roof: pick(HOUSE_ROOF), door: pick(HOUSE_DOOR),
    shutter: Math.random() < 0.5 ? pick(HOUSE_SHUTTER) : null,
    frontGable: Math.random() < 0.55,
    doorSide: Math.random() < 0.5 ? -1 : 1,
    chimneySide: Math.random() < 0.5 ? -1 : 1,
    ruin: 0.4 + Math.random() * 0.6   // 0.4 輕度風化 ~ 1.0 幾乎垮掉（刻意誇張）
  };
}

// 嘗試放置；佔地矩形與路面或已放置的房屋重疊就回傳 false（會往下一個候選位置移動）
function placeLoveHouse(x, z, rotY, spec) {
  const halfW = (spec.w + spec.gw) / 2 + 0.4;
  const halfD = spec.d / 2 + 0.85;          // 前門廊延伸 1.6、後牆 0.1，取中心前移 0.75
  const cx = x + Math.sin(rotY) * 0.75, cz = z + Math.cos(rotY) * 0.75;
  const rotated = Math.abs(Math.sin(rotY)) > 0.7;
  const hw = rotated ? halfD : halfW, hd = rotated ? halfW : halfD;
  // 路面（含人行道）
  if (Math.abs(cz) < 7.4 + hd) return false;
  for (const zs of LOVE_BACK_STREETS) if (Math.abs(cz - zs) < 7.4 + hd) return false;
  for (const xs of LOVE_CROSS_STREETS) if (Math.abs(cx - xs) < 7.4 + hw) return false;
  // 與既有房屋至少留 2.2m 側院
  for (const o of loveObstacles) {
    if (Math.abs(cx - o.x) < hw + o.hw + 3.2 && Math.abs(cz - o.z) < hd + o.hd + 3.2) return false;
  }
  loveObstacles.push({ x: cx, z: cz, hw, hd });
  buildHouse(x, z, rotY, spec);
  return true;
}

function buildHouse(x, z, rotY, spec) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rotY;
  const { w, d, floors, garage, gw } = spec;
  const total = w + gw;
  const bx = -garage * (total / 2 - w / 2);   // 主屋中心 x
  const gx = garage * (total / 2 - gw / 2);   // 車庫中心 x
  const FH = 0.45;                            // 基座高
  const H = floors === 2 ? 5.4 : 2.9;
  const ruin = spec.ruin || 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // 風化：把顏色往灰褐／苔綠偏移，越毀越暗
  const weather = (hex, toHex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color(toHex), k).getHexString();
  const wc = (hex, toHex, k) => new THREE.Color(weather(hex, toHex, k)).getHex();
  const trim = houseMat(wc(0xfaf7f0, 0x9d977f, ruin * 0.8), 0.95);
  const concrete = houseMat(wc(0xb9b5ac, 0x6f6b5f, ruin * 0.7), 1);
  const roofMat = houseMat(wc(spec.roof, 0x4e5a3a, ruin * 0.35), 1);
  const wallCol = wc(wc(spec.siding, 0x8c8573, ruin * 0.6), 0x4f5a3f, ruin * 0.15);
  const wallMat = houseSidingMat(wallCol, H);
  const mossMat = houseMat(0x5b7d3f, 1);
  const darkMat = houseMat(0x14110e, 1);
  const vineMat = houseMat(0x4d7338, 1);
  const vineDark = houseMat(0x2f5230, 1);
  // 整棟微傾斜（地基下陷）
  if (ruin > 0.5) { grp.rotation.z = rnd(-1, 1) * ruin * 0.05; grp.rotation.x = rnd(-1, 1) * ruin * 0.03; }
  const ds = garage !== 0 ? garage : spec.doorSide;   // 大門靠車庫那側
  const doorX = bx + ds * (w / 2 - 1.5);

  const box = (bw, bh, bd, mat, px, py, pz) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(px, py, pz);
    grp.add(m);
    return m;
  };
  const plane = (pw, ph, mat, px, py, pz, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    m.position.set(px, py, pz);
    m.rotation.y = ry || 0;
    m.userData.noShadow = true;
    grp.add(m);
    return m;
  };
  const win = (px, py, pz, ry, shutter) => {
    const ww = shutter ? 1.9 : 1.3;
    const r = Math.random();
    const state = r < ruin * 0.4 ? 'gone' : (r < ruin * 0.95 ? 'broken' : 'ok');
    return plane(ww, 1.6, houseWindowMat(shutter, state), px, py, pz, ry);
  };
  // 裝飾小物（藤蔓、雜草、瓦礫）：不投影以省效能
  const deco = (geo, mat, px, py, pz, sc, shadow) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    if (sc) m.scale.set(sc[0], sc[1], sc[2]);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    if (!shadow) m.userData.noShadow = true;
    grp.add(m);
    return m;
  };

  // 主屋：基座＋牆身＋二樓腰線＋屋頂
  box(w + 0.12, FH, d + 0.12, concrete, bx, FH / 2, 0);
  box(w, H, d, wallMat, bx, FH + H / 2, 0);
  if (floors === 2) box(w + 0.1, 0.14, d + 0.1, trim, bx, FH + 2.95, 0);
  // 牆根苔蘚帶與雨水汙痕
  if (ruin > 0.2) {
    const mb = box(w + 0.04, 0.9 + ruin * 0.8, d + 0.04, mossMat, bx, FH + (0.9 + ruin * 0.8) / 2, 0);
    mb.material = mossMat.clone(); mb.material.transparent = true; mb.material.opacity = 0.55;
    mb.userData.noShadow = true;
    for (let i = 0; i < 3 + ruin * 6; i++) {
      const sh = rnd(1.0, 2.6), sxp = bx + rnd(-w / 2 + 0.3, w / 2 - 0.3);
      const stain = box(rnd(0.15, 0.4), sh, 0.01, houseMat(0x3d3a30, 1), sxp, FH + H - sh / 2 - 0.1, d / 2 + 0.035);
      stain.material = stain.material.clone(); stain.material.transparent = true; stain.material.opacity = 0.35;
      stain.userData.noShadow = true;
    }
  }
  addHouseGable(grp, bx, FH + H, 0, w, d / 2, wallMat, roofMat, 0, ruin);

  // 牆面大洞（露出黑暗室內）與缺角：前牆、側牆各抽幾個
  const holeMat = darkMat;
  const makeHole = (px, py, pz, ry, size) => {
    const pts = [], n = 8;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2, rr = size * (0.55 + Math.random() * 0.5);
      pts.push(new THREE.Vector2(Math.cos(ang) * rr * 1.1, Math.sin(ang) * rr * 0.9));
    }
    const hm = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), holeMat);
    hm.position.set(px, py, pz); hm.rotation.y = ry; hm.userData.noShadow = true;
    grp.add(hm);
  };
  if (ruin > 0.45) {
    const nHoles = Math.floor(ruin * 3);
    for (let i = 0; i < nHoles; i++) {
      makeHole(bx + rnd(-w / 2 + 1.2, w / 2 - 1.2), FH + rnd(1.0, H - 0.8), d / 2 + 0.09 + i * 0.004, 0, rnd(0.5, 1.1));
    }
    makeHole(bx + (garage !== 0 ? -garage : spec.chimneySide) * (w / 2 + 0.09), FH + rnd(0.9, H - 0.9), rnd(-1, 1) * (d / 2 - 1.2),
      (garage !== 0 ? -garage : spec.chimneySide) > 0 ? Math.PI / 2 : -Math.PI / 2, rnd(0.6, 1.2));
  }
  // 二樓頂部缺口：牆頂鋸齒狀斷裂
  if (floors === 2 && ruin > 0.6) {
    for (let i = 0; i < 4; i++) {
      box(rnd(0.6, 1.4), rnd(0.4, 1.1), 0.25, houseMat(0x2b2722, 1), bx + rnd(-w / 2 + 0.7, w / 2 - 0.7), FH + H + rnd(0.1, 0.4), d / 2 - 0.05);
    }
  }

  // 前面窗戶（一樓兩扇在大門另一側；二樓三扇）
  const sh = spec.shutter;
  const frontZ = d / 2 + 0.06;
  win(bx - ds * 2.1, FH + 1.55, frontZ, 0, sh);
  win(bx - ds * 0.0, FH + 1.55, frontZ, 0, sh);
  if (floors === 2) [-2.1, 0, 2.1].forEach(ox => win(bx + ox, FH + 4.2, frontZ, 0, sh));

  // 側面（非車庫側）與背面窗戶
  const ws = garage !== 0 ? -garage : -spec.chimneySide;   // 有窗戶的那一側
  const sideX = bx + ws * (w / 2 + 0.06);
  const sideRy = ws > 0 ? Math.PI / 2 : -Math.PI / 2;
  [-1.9, 1.9].forEach(oz => {
    win(sideX, FH + 1.55, oz, sideRy, null);
    if (floors === 2) win(sideX, FH + 4.2, oz, sideRy, null);
  });
  [-2.0, 0, 2.0].forEach(ox => {
    win(bx + ox, FH + 1.55, -d / 2 - 0.06, Math.PI, null);
    if (floors === 2) win(bx + ox, FH + 4.2, -d / 2 - 0.06, Math.PI, null);
  });

  // 前門（門框＋門板＋門把）、門廊平台、台階、兩根柱子與小屋簷、步道
  box(1.25, 2.25, 0.1, trim, doorX, FH + 1.125, d / 2 + 0.05);
  const doorCol = wc(spec.door, 0x5a4a3a, ruin * 0.5);
  if (ruin > 0.4 && Math.random() < 0.7) {
    // 大門洞開：黑暗門洞＋歪掛在一邊鉸鏈的門板
    box(1.0, 2.1, 0.05, darkMat, doorX, FH + 1.05, d / 2 + 0.09);
    const hinge = new THREE.Group();
    hinge.position.set(doorX - 0.5, FH + 1.05, d / 2 + 0.12);
    hinge.rotation.y = -rnd(0.8, 1.5);
    hinge.rotation.z = rnd(-0.08, 0.08);
    const dm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.06), houseMat(doorCol, 0.8));
    dm.position.set(0.5, 0, 0); dm.castShadow = true;
    hinge.add(dm);
    grp.add(hinge);
  } else {
    box(1.0, 2.1, 0.06, houseMat(doorCol, 0.8), doorX, FH + 1.05, d / 2 + 0.1);
    box(0.09, 0.09, 0.07, houseMat(0xd4af37, 0.3), doorX + 0.36, FH + 1.0, d / 2 + 0.16);
  }
  const stepMat = ruin > 0.5 ? mossMat : concrete;
  box(2.8, FH + 0.03, 1.6, concrete, doorX, (FH + 0.03) / 2, d / 2 + 0.8);
  box(1.6, 0.22, 0.5, stepMat, doorX, 0.11, d / 2 + 1.85).rotation.y = rnd(-0.1, 0.1) * ruin;
  const porchRoof = box(3.2, 0.14, 2.0, roofMat, doorX, FH + 2.65, d / 2 + 0.95);
  porchRoof.rotation.x = 0.14;
  if (ruin > 0.5) {   // 門廊小屋簷塌下一角
    porchRoof.rotation.x = 0.14 + ruin * 0.5;
    porchRoof.rotation.z = rnd(-1, 1) * ruin * 0.25;
    porchRoof.position.y -= ruin * 0.35;
  }
  [-1.25, 1.25].forEach(ox => {
    const broken = ruin > 0.5 && Math.random() < ruin * 0.6;
    const col = box(0.14, broken ? 1.3 : 2.2, 0.14, trim, doorX + ox, FH + (broken ? 0.65 : 1.1), d / 2 + 1.5);
    if (broken) col.rotation.z = rnd(-0.5, 0.5);
  });
  // 步道：龜裂長草
  box(1.1, 0.05, 2.0, ruin > 0.5 ? houseMat(0x8a877c, 1) : concrete, doorX, 0.025, d / 2 + 3.1);
  for (let i = 0; i < 4 + ruin * 6; i++) {
    deco(new THREE.IcosahedronGeometry(rnd(0.12, 0.25), 0), i % 2 ? vineMat : vineDark,
      doorX + rnd(-0.6, 0.6), 0.1, d / 2 + rnd(1.9, 4.0), [1, rnd(0.6, 1.6), 1]);
  }

  // 車庫：略退縮、矮一點的屋頂、分格車庫門、車道
  if (garage !== 0) {
    const GH = 2.7, gd = d - 0.6, gz = -0.3, gFront = gz + gd / 2;
    box(gw + 0.1, FH - 0.03, gd + 0.1, concrete, gx, (FH - 0.03) / 2, gz);
    const gWall = houseSidingMat(wallCol, GH);
    box(gw, GH, gd, gWall, gx, FH + GH / 2, gz);
    addHouseGable(grp, gx, FH + GH, gz, gw, gd / 2, gWall, roofMat, 0, ruin);
    if (ruin > 0.55) {
      // 車庫門鏽蝕塌下：黑洞洞門口＋只剩下半截歪斜的門板
      plane(gw - 0.6, 2.1, darkMat, gx, FH + 1.05, gFront + 0.02, 0);
      const gdp = plane(gw - 0.6, 1.1, houseGarageDoorMat(), gx, FH + 0.55, gFront + 0.05, 0);
      gdp.material = gdp.material.clone(); gdp.material.color.set(0x8f8a7c);
      gdp.rotation.x = -rnd(0.1, 0.35); gdp.rotation.z = rnd(-0.08, 0.08);
    } else {
      const gdp = plane(gw - 0.6, 2.1, houseGarageDoorMat(), gx, FH + 1.05, gFront + 0.03, 0);
      if (ruin > 0.3) { gdp.material = gdp.material.clone(); gdp.material.color.set(0xa39e8f); }
    }
    box(gw - 0.5, 0.06, 3.6, ruin > 0.4 ? houseMat(0x8a877c, 1) : concrete, gx, 0.03, gFront + 1.8);
    for (let i = 0; i < 3 + ruin * 8; i++) {   // 車道裂縫長草
      deco(new THREE.IcosahedronGeometry(rnd(0.12, 0.28), 0), i % 2 ? vineMat : vineDark,
        gx + rnd(-gw / 2 + 0.4, gw / 2 - 0.4), 0.1, gFront + rnd(0.3, 3.4), [1, rnd(0.6, 1.8), 1]);
    }
  }

  // 前山牆（過半數房屋有，增加層次）與閣樓小窗
  if (spec.frontGable && floors === 2) {
    const gl = 2.6;
    addHouseGable(grp, doorX, FH + H, d / 2 + 0.25 - gl / 2, gl, 1.5, wallMat, roofMat, Math.PI / 2, ruin);
    win(doorX, FH + H + 0.5, d / 2 + 0.27, 0, null).scale.set(0.5, 0.45, 1);
  }

  // 磚砌煙囪（與側面窗戶同一側外牆，窗在 z=±1.9、煙囪在 z=0）
  const cs = ws;
  const chFull = FH + H + d * 0.25 + 0.9;
  const chH = ruin > 0.55 ? chFull * rnd(0.7, 0.9) : chFull;   // 煙囪頂端崩斷
  const brick = houseMat(wc(0x9c5440, 0x5a4a3c, ruin * 0.5), 1);
  const chim = box(0.8, chH, 1.0, brick, bx + cs * (w / 2 + 0.3), chH / 2, 0);
  if (ruin > 0.55) chim.rotation.z = rnd(-1, 1) * 0.07;
  else box(1.0, 0.12, 1.2, houseMat(0x6e6a64, 1), bx + cs * (w / 2 + 0.3), chH + 0.06, 0);
  if (ruin > 0.55) {   // 掉落的磚塊散在煙囪腳邊
    for (let i = 0; i < 8; i++) {
      const bk = box(0.3, 0.14, 0.15, brick, bx + cs * (w / 2 + rnd(0.4, 1.8)), 0.08, rnd(-1.6, 1.6));
      bk.rotation.set(rnd(-0.4, 0.4), rnd(0, 3), rnd(-0.4, 0.4));
    }
  }

  // ---- 自然侵蝕：藤蔓、爬牆植物、屋頂苔蘚、灌木、雜草、瓦礫 ----
  const sideDir = ws, sideWx = bx + sideDir * (w / 2 + 0.08);
  // 藤蔓團塊貼在牆上（正面、側面、背面），越毀越多
  const nVine = Math.floor(8 + ruin * 26);
  for (let i = 0; i < nVine; i++) {
    const face = Math.floor(Math.random() * 3);
    const gy = FH + rnd(0.2, H);
    const geo = new THREE.IcosahedronGeometry(rnd(0.22, 0.5), 0);
    const sc = [rnd(0.8, 1.6), rnd(0.8, 2.2), 0.45];
    const mat = Math.random() < 0.5 ? vineMat : vineDark;
    if (face === 0) deco(geo, mat, bx + rnd(-w / 2, w / 2), gy, d / 2 + 0.12, sc);
    else if (face === 1) deco(geo, mat, sideWx, gy, rnd(-d / 2, d / 2), [0.45, sc[1], sc[0]]);
    else deco(geo, mat, bx + rnd(-w / 2, w / 2), gy, -d / 2 - 0.12, sc);
  }
  // 垂掛的藤蔓條
  for (let i = 0; i < 2 + ruin * 8; i++) {
    const vl = rnd(1.2, 3.2);
    box(rnd(0.08, 0.2), vl, 0.05, vineDark, bx + rnd(-w / 2, w / 2), FH + H - vl / 2 + 0.1, d / 2 + 0.07).userData.noShadow = true;
  }
  // 屋頂上的苔蘚與雜草叢（壓扁的綠球）
  for (let i = 0; i < 2 + ruin * 7; i++) {
    const rz = rnd(-d / 2 * 0.9, d / 2 * 0.9);
    deco(new THREE.IcosahedronGeometry(rnd(0.3, 0.7), 0), Math.random() < 0.6 ? mossMat : vineMat,
      bx + rnd(-w / 2, w / 2), FH + H + d * 0.25 - Math.abs(rz) * 0.5 + 0.08, rz, [1.3, 0.35, 1.3]);
  }
  // 灌木與雜草：包住牆腳與前院
  const nBush = Math.floor(3 + ruin * 7);
  for (let i = 0; i < nBush; i++) {
    const bxp = bx + rnd(-total / 2 - 0.3, total / 2 + 0.3);
    const bzp = Math.random() < 0.55 ? d / 2 + rnd(0.2, 2.4) : (Math.random() < 0.5 ? -d / 2 - rnd(0.2, 1.2) : rnd(-d / 2, d / 2));
    const bxx = bzp > -d / 2 && bzp < d / 2 ? bx + (Math.random() < 0.5 ? -1 : 1) * (total / 2 + rnd(0.3, 0.8)) : bxp;
    deco(new THREE.IcosahedronGeometry(rnd(0.5, 1.1), 1), Math.random() < 0.5 ? vineMat : vineDark, bxx, 0.45, bzp, [1, rnd(0.6, 1.1), 1], true);
  }
  for (let i = 0; i < 10 + ruin * 22; i++) {   // 雜草叢
    deco(new THREE.ConeGeometry(rnd(0.05, 0.1), rnd(0.4, 1.0), 4), Math.random() < 0.5 ? vineMat : houseMat(0x8a8a4a, 1),
      bx + rnd(-total / 2 - 0.8, total / 2 + 0.8), 0.3, rnd(-d / 2 - 1.5, d / 2 + 3.5), [1, 1, 1]).rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
  }
  // 瓦礫：碎磚、斷板、掉落的瓦片
  const rubbleMat = houseMat(0x8f8777, 1);
  for (let i = 0; i < 4 + ruin * 14; i++) {
    const r = deco(new THREE.DodecahedronGeometry(rnd(0.15, 0.45), 0), Math.random() < 0.4 ? brick : rubbleMat,
      bx + rnd(-total / 2 - 0.8, total / 2 + 0.8), 0.15, rnd(-d / 2 - 1.5, d / 2 + 2.5), [1, rnd(0.5, 0.9), 1], true);
  }
  for (let i = 0; i < 3 + ruin * 6; i++) {   // 掉落的壁板與屋瓦
    const sl = box(rnd(0.6, 1.8), 0.05, rnd(0.2, 0.5), Math.random() < 0.5 ? wallMat : roofMat,
      bx + rnd(-total / 2 - 0.6, total / 2 + 0.6), 0.08, rnd(d / 2 - 0.5, d / 2 + 2.5));
    sl.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3)); sl.userData.noShadow = true;
  }
  // 誇張：屋頂破洞長出一棵小樹
  if (ruin > 0.65 && Math.random() < 0.5) {
    const th = FH + H + d * 0.25 + rnd(1.0, 2.2);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, th, 6), houseMat(0x6b5a46, 1));
    trunk.position.set(bx + rnd(-w * 0.25, w * 0.25), th / 2, rnd(-0.8, 0.8));
    trunk.rotation.z = rnd(-0.12, 0.12);
    grp.add(trunk);
    for (let i = 0; i < 3; i++) {
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.8, 1.2), 1), i % 2 ? vineMat : mossMat);
      lf.position.set(trunk.position.x + rnd(-0.6, 0.6), th + rnd(-0.2, 0.7), trunk.position.z + rnd(-0.6, 0.6));
      lf.castShadow = true;
      grp.add(lf);
    }
  }

  addContactShadow(grp, 0, 0.1, total + 3.4, d + 3.4, 0.5);
  grp.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.noShadow; o.receiveShadow = true; } });
  loveEnvGroup.add(grp);
}

// 單棟廢墟房屋：牆體＋塌陷屋頂＋破窗＋藤蔓＋瓦礫（已不再使用，保留以便還原）
function buildRuinedHouse(x, z, side, wallColor, rotYOverride, roofColor) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = rotYOverride != null ? rotYOverride : (side > 0 ? Math.PI + (Math.random() - 0.5) * 0.15 : (Math.random() - 0.5) * 0.15);
  loveObstacles.push({ x, z, hw: 4.4, hd: 3.8 });

  const ruin = Math.random(); // 0 完整 ~ 1 嚴重毀損
  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95 });
  const wW = 6.5, wH = 3.2, wD = 5.5;

  // 牆：後牆＋兩側牆，前牆依損毀度殘缺
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(wW, wH, 0.25), wallMat);
  backWall.position.set(0, wH / 2, -wD / 2);
  grp.add(backWall);

  [-1, 1].forEach(s => {
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, wH * (ruin > 0.6 ? 0.55 : 1), wD), wallMat);
    sideWall.position.set(s * wW / 2, wH * (ruin > 0.6 ? 0.275 : 0.5), 0);
    if (ruin > 0.6) sideWall.rotation.z = s * 0.05;
    grp.add(sideWall);
  });

  // 前牆：中間開門洞，兩側窗洞用深色面表示
  const frontMat = wallMat;
  const doorW = 1.1, doorH = 2.2;
  const leftW = (wW - doorW) / 2 - 1.0;
  [-1, 1].forEach(s => {
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(leftW, ruin > 0.8 ? wH * 0.5 : wH, 0.25),
      frontMat
    );
    seg.position.set(s * (doorW / 2 + leftW / 2), (ruin > 0.8 ? wH * 0.25 : wH / 2), wD / 2);
    grp.add(seg);
  });
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.3, wH - doorH, 0.25), frontMat);
  lintel.position.set(0, doorH + (wH - doorH) / 2, wD / 2);
  grp.add(lintel);

  // 破窗（深色內凹面＋歪斜窗框）
  const winMat = new THREE.MeshStandardMaterial({ color: 0x3f4f5f, roughness: 0.6 });
  [[-1.9, 1.6, wD / 2 + 0.14], [1.9, 1.6, wD / 2 + 0.14]].forEach(([wx, wy, wz]) => {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), winMat);
    win.position.set(wx, wy, wz);
    win.rotation.y = 0;
    if (Math.random() > 0.5) win.rotation.z = (Math.random() - 0.5) * 0.3;
    grp.add(win);
  });

  // 屋頂：A 字形雙斜面，依損毀度塌陷歪斜；暖土色屋頂色每棟不同
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor || (0x9a7a65 + Math.floor(Math.random() * 0x001010)), roughness: 0.9 });
  const roofLen = wW + 0.6, slope = 2.1;
  const rotZ = ruin > 0.5 ? (Math.random() - 0.5) * 0.5 : 0;
  [-1, 1].forEach(s => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(roofLen, 0.16, slope + 0.5), roofMat);
    panel.position.set(0, wH + slope * 0.35, s * wD * 0.26);
    panel.rotation.x = s * 0.62;
    if (ruin > 0.5) {
      panel.position.y -= ruin * 1.1;
      panel.rotation.z = rotZ + (Math.random() - 0.5) * 0.2;
      panel.rotation.x += s * (Math.random() - 0.5) * 0.3;
    }
    panel.castShadow = true;
    grp.add(panel);
  });

  // 藤蔓爬上牆（綠色球簇）
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x55783f, roughness: 1 });
  const vineCount = Math.floor(3 + ruin * 6);
  for (let i = 0; i < vineCount; i++) {
    const vine = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + Math.random() * 0.35, 0), vineMat);
    vine.position.set(
      (Math.random() - 0.5) * wW,
      0.3 + Math.random() * wH * 0.9,
      (Math.random() > 0.5 ? 1 : -1) * (wD / 2 + 0.2)
    );
    vine.scale.set(1, 0.6 + Math.random(), 0.5);
    grp.add(vine);
  }

  // 瓦礫堆
  const rubbleMat = new THREE.MeshStandardMaterial({ color: 0xa8907a, roughness: 1 });
  const rubbleCount = Math.floor(ruin * 7);
  for (let i = 0; i < rubbleCount; i++) {
    const rub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.45, 0), rubbleMat);
    rub.position.set(
      (Math.random() - 0.5) * (wW + 2),
      0.2,
      wD / 2 + 0.5 + Math.random() * 2
    );
    rub.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rub.castShadow = true;
    grp.add(rub);
  }

  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  loveEnvGroup.add(grp);
}

// 半枯半盛的樹
function buildOvergrownTree(x, z) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);

  // 樹幹
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.25, 3.2 + Math.random() * 1.5, 7),
    new THREE.MeshStandardMaterial({ color: 0xa8907a, roughness: 1 })
  );
  trunk.position.y = 1.8;
  trunk.rotation.z = (Math.random() - 0.5) * 0.25;
  trunk.castShadow = true;
  grp.add(trunk);

  // 樹冠：兩三球簇，半數枯枝不長葉
  if (Math.random() > 0.35) {
    const leafMat = new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x55783f : 0x86a35d, roughness: 1 });
    const blobs = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < blobs; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0 + Math.random() * 0.8, 1), leafMat);
      blob.position.set((Math.random() - 0.5) * 1.6, 3.6 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6);
      blob.castShadow = true;
      grp.add(blob);
    }
  } else {
    // 枯枝
    for (let i = 0; i < 4; i++) {
      const br = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.09, 1.6, 5),
        new THREE.MeshStandardMaterial({ color: 0xa8907a, roughness: 1 })
      );
      br.position.set(0, 3.4, 0);
      br.rotation.z = (Math.random() - 0.5) * 1.4;
      br.rotation.y = Math.random() * Math.PI * 2;
      br.translateY(0.7);
      grp.add(br);
    }
  }
  loveEnvGroup.add(grp);
}

// =============================================================
// 廢棄車輛（優化版）：側視輪廓擠出的車身＋座艙＋玻璃＋輪胎輪拱＋車燈保險桿＋鏽斑苔蘚
// 車型：sedan 轎車／suv／pickup 小貨卡／van 廂型車；局部座標 +x 為車頭
// =============================================================
const CAR_TYPES = {
  sedan:  { front: 2.25, rear: -2.25, belt: 0.95, hood: 0.86, cab: [0.9, -1.25, 0.35, -0.85, 1.46], W: 1.8, wr: 0.36 },
  suv:    { front: 2.3, rear: -2.35, belt: 1.05, hood: 0.95, cab: [1.05, -2.25, 0.65, -2.2, 1.75], W: 1.9, wr: 0.41 },
  pickup: { front: 2.5, rear: -2.6, belt: 1.0, hood: 0.92, cab: [0.95, -0.4, 0.5, -0.35, 1.65], W: 1.9, wr: 0.42, bed: true },
  van:    { front: 2.3, rear: -2.4, belt: 1.05, hood: 1.0, cab: [1.6, -2.3, 1.15, -2.3, 2.05], W: 1.95, wr: 0.4 },
};
let _carCrackTex = null;
function carCrackTex() {
  if (_carCrackTex) return _carCrackTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(30,45,55,0.85)'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(235,240,245,0.9)'; g.lineWidth = 1.5;
  const cx = 30 + Math.random() * 60, cy = 30 + Math.random() * 60;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, L = 30 + Math.random() * 60;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); g.stroke();
  }
  g.clearRect(cx - 12, cy - 10, 26, 22);   // 撞破的洞（alphaTest 會挖空）
  g.clearRect(0, 0, 128, 16);
  _carCrackTex = new THREE.CanvasTexture(c);
  return _carCrackTex;
}

function buildCar(x, z, rotY, bodyColor, type) {
  const T = CAR_TYPES[type] || CAR_TYPES.sedan;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const yaw = new THREE.Group();
  yaw.position.set(x, 0.03, z);
  yaw.rotation.y = rotY;
  const grp = new THREE.Group();     // 內層：負責下陷傾斜（外層才轉向，避免傾斜軸跟著偏）
  yaw.add(grp);
  const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 });
  const paintCol = new THREE.Color(bodyColor).lerp(new THREE.Color(0x8a7f6d), 0.3);   // 褪色
  const paint = new THREE.MeshPhysicalMaterial({ color: paintCol, roughness: 0.4, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.35 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x33474f, roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide });
  const dark = std(0x1c1c1e, 0.9);
  const rust = [0x8a4a2a, 0x6b3a22, 0x4f6a38];
  const W = T.W, Bw = W / 2 + 0.05, belt = T.belt, front = T.front, rear = T.rear;
  const [bF, bR, tF, tR, roofY] = T.cab;
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); grp.add(m); return m; };

  // 下車身：側視輪廓擠出
  const lower = new THREE.Shape();
  lower.moveTo(rear, 0.3); lower.lineTo(front, 0.3); lower.lineTo(front + 0.04, 0.62); lower.lineTo(front - 0.12, T.hood);
  lower.lineTo(bF, belt); lower.lineTo(bR, belt); lower.lineTo(rear + 0.08, belt - 0.04); lower.lineTo(rear - 0.03, 0.7);
  const lg = new THREE.ExtrudeGeometry(lower, { depth: W, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  lg.translate(0, 0, -W / 2);
  add(lg, paint, 0, 0, 0);

  // 座艙（車頂）
  const Wc = W - 0.16;
  const cabS = new THREE.Shape();
  cabS.moveTo(bF, belt - 0.02); cabS.lineTo(bR, belt - 0.02); cabS.lineTo(tR, roofY); cabS.lineTo(tF, roofY);
  const cg = new THREE.ExtrudeGeometry(cabS, { depth: Wc, bevelEnabled: false });
  cg.translate(0, 0, -Wc / 2);
  add(cg, paint, 0, 0, 0);

  // 側窗（座艙輪廓往內縮）＋B 柱
  const cx0 = (bF + bR + tF + tR) / 4, cy0 = (belt + roofY) / 2;
  const sh = (px, py) => [cx0 + (px - cx0) * 0.88, cy0 + (py - cy0) * 0.82];
  const winS = new THREE.Shape();
  [[bF, belt], [bR, belt], [tR, roofY], [tF, roofY]].map(p => sh(p[0], p[1])).forEach((p, i) => i ? winS.lineTo(p[0], p[1]) : winS.moveTo(p[0], p[1]));
  const brokenSide = Math.random() < 0.3;
  [-1, 1].forEach(s => {
    const wm = new THREE.Mesh(new THREE.ShapeGeometry(winS), brokenSide && s > 0 ? dark : glassMat);
    wm.position.z = s * (Wc / 2 + 0.012);
    wm.scale.z = s;
    grp.add(wm);
    const pil = add(new THREE.BoxGeometry(0.1, roofY - belt - 0.2, 0.012), paint, (bF + bR) / 2 * 0.9 + (tF + tR) / 2 * 0.1, (belt + roofY) / 2, s * (Wc / 2 + 0.016));
  });
  // 擋風玻璃（常見破裂）與後窗
  const slantQuad = (x0, y0, x1, y1, half, nx, ny, off, mat) => {
    const t0 = 0.1, t1 = 0.9;
    const P = t => [x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off];
    const a = P(t0), b = P(t1);
    const pos = new Float32Array([a[0], a[1], -half, a[0], a[1], half, b[0], b[1], half, b[0], b[1], -half]);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); grp.add(m); return m;
  };
  const fl = Math.hypot(tF - bF, roofY - belt), rl = Math.hypot(tR - bR, roofY - belt);
  const crackMat = new THREE.MeshStandardMaterial({ map: carCrackTex(), alphaTest: 0.5, roughness: 0.3, side: THREE.DoubleSide });
  slantQuad(bF, belt, tF, roofY, Wc / 2 - 0.1, (roofY - belt) / fl, -(tF - bF) / fl, 0.012, Math.random() < 0.6 ? crackMat : glassMat);
  slantQuad(bR, belt, tR, roofY, Wc / 2 - 0.1, -(roofY - belt) / rl, (tR - bR) / rl, 0.012, glassMat);

  // 皮卡車斗：深色內底＋護欄
  if (T.bed) {
    const bx0 = bR - 0.05, bx1 = rear + 0.12, bl = bx0 - bx1;
    const floor = add(new THREE.BoxGeometry(bl, 0.02, W - 0.2), std(0x2b2a28, 1), (bx0 + bx1) / 2, belt + 0.012, 0);
    [-1, 1].forEach(s => add(new THREE.BoxGeometry(bl, 0.14, 0.05), paint, (bx0 + bx1) / 2, belt + 0.06, s * (W / 2 - 0.1)));
    add(new THREE.BoxGeometry(0.05, 0.14, W - 0.15), paint, bx0, belt + 0.06, 0);
  }

  // 輪胎＋輪拱＋輪圈（其中一顆爆胎，車身往那側傾）
  const wr = T.wr, flat = [[front - 0.85, 1], [front - 0.85, -1], [rear + 0.9, 1], [rear + 0.9, -1]][Math.floor(Math.random() * 4)];
  [[front - 0.85, 1], [front - 0.85, -1], [rear + 0.9, 1], [rear + 0.9, -1]].forEach(([wx, sz]) => {
    const isFlat = (wx === flat[0] && sz === flat[1]);
    const r = isFlat ? wr * 0.78 : wr;
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 14), std(0x23262b, 0.95));
    tire.rotation.x = Math.PI / 2;
    tire.position.set(wx, r, sz * (Bw - 0.1));
    grp.add(tire);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.58, 10), std(Math.random() < 0.5 ? 0x8a8d90 : 0x7a5a42, 0.5, 0.5));
    hub.position.set(wx, r, sz * (Bw + 0.026));
    if (sz < 0) hub.rotation.y = Math.PI;
    grp.add(hub);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(wr * 1.2, 14, 0, Math.PI), dark);
    arch.position.set(wx, wr, sz * (Bw + 0.006));
    if (sz < 0) arch.rotation.y = Math.PI;
    grp.add(arch);
  });
  grp.rotation.x = flat[1] * 0.028;
  grp.rotation.z = flat[0] > 0 ? -0.02 : 0.02;

  // 前後燈、保險桿、水箱罩、車牌、後視鏡
  const lens = std(0xe8e2b8, 0.3), tail = std(0x9b2d2d, 0.4);
  [-1, 1].forEach(s => {
    add(new THREE.BoxGeometry(0.06, 0.14, 0.32), Math.random() < 0.25 ? dark : lens, front + 0.06, 0.64, s * W * 0.31);
    add(new THREE.BoxGeometry(0.06, 0.14, 0.3), tail, rear - 0.02, 0.72, s * W * 0.31);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.06), paint, bF - 0.1, belt + 0.1, s * (Bw + 0.1));
  });
  add(new THREE.BoxGeometry(0.04, 0.2, W * 0.46), dark, front + 0.08, 0.5, 0);
  add(new THREE.BoxGeometry(0.14, 0.17, W + 0.1), std(0x7d7d79, 0.5, 0.4), front + 0.1, 0.38, 0);
  add(new THREE.BoxGeometry(0.14, 0.17, W + 0.1), std(0x7d7d79, 0.5, 0.4), rear - 0.08, 0.38, 0);
  add(new THREE.BoxGeometry(0.02, 0.14, 0.36), std(0xe6e6df, 0.8), rear - 0.08, 0.58, 0);

  // 門縫與門把
  [-1, 1].forEach(s => {
    [bF - 0.12, (bF + bR) / 2 - 0.2, bR + 0.18].forEach(dx => {
      add(new THREE.BoxGeometry(0.015, belt - 0.38, 0.008), dark, dx, (belt + 0.38) / 2, s * (Bw + 0.004));
    });
    add(new THREE.BoxGeometry(0.14, 0.03, 0.03), std(0x888888, 0.5, 0.5), (bF + bR) / 2 + 0.18, belt - 0.12, s * (Bw + 0.01));
  });

  // 鏽斑、泥垢、苔蘚補丁（半透明貼片）
  for (let i = 0; i < 9; i++) {
    const rp = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.3, 0.9), rnd(0.15, 0.4)),
      new THREE.MeshStandardMaterial({ color: rust[Math.floor(Math.random() * 3)], roughness: 1, transparent: true, opacity: 0.7 }));
    const s = Math.random() < 0.5 ? 1 : -1;
    rp.position.set(rnd(rear + 0.4, front - 0.4), rnd(0.4, belt - 0.1), s * (Bw + 0.012));
    if (s < 0) rp.rotation.y = Math.PI;
    grp.add(rp);
  }
  const moss = std(0x5b7d3f, 1), vine = std(0x4d7338, 1);
  for (let i = 0; i < 4; i++) {   // 車頂與引擎蓋上的苔蘚
    const m = add(new THREE.IcosahedronGeometry(rnd(0.15, 0.32), 0), Math.random() < 0.5 ? moss : vine,
      rnd(tR, tF), roofY + 0.03, rnd(-0.55, 0.55));
    m.scale.set(1.4, 0.3, 1.4);
  }
  for (let i = 0; i < 3; i++) {
    const m = add(new THREE.IcosahedronGeometry(rnd(0.15, 0.3), 0), moss, rnd(bF + 0.2, front - 0.3), T.hood + 0.02, rnd(-0.6, 0.6));
    m.scale.set(1.5, 0.3, 1.3);
  }
  for (let i = 0; i < 12; i++) {   // 車底與輪子旁長出的雜草
    const g = add(new THREE.ConeGeometry(rnd(0.04, 0.08), rnd(0.3, 0.8), 4), Math.random() < 0.5 ? moss : vine,
      rnd(rear, front), 0.22, (Math.random() < 0.5 ? -1 : 1) * (Bw + rnd(-0.1, 0.35)));
    g.rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
  }

  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  addContactShadow(yaw, 0, 0, 5.6, 2.9, 0.55);
  loveEnvGroup.add(yaw);
  const c = Math.abs(Math.cos(rotY)), s2 = Math.abs(Math.sin(rotY));
  loveObstacles.push({ x, z, hw: c * 2.6 + s2 * 1.2, hd: s2 * 2.6 + c * 1.2 });
}

function buildLoveCars() {
  [
    ['sedan', 8, 2.2, 0.35, 0xe84f34],
    ['suv', -22, -2.8, -1.1, 0x2e9df0],
    ['pickup', -52, 2.4, Math.PI + 0.08, 0xf2c14e],
    ['van', 27, -2.5, -0.12, 0xe7e2d6],
    ['sedan', 52, 2.0, 0.2, 0x6fbf73],
    ['sedan', -42.4, 19, Math.PI / 2 + 0.12, 0xd96b8c],
    ['pickup', 42, -23, -Math.PI / 2 + 0.05, 0x9b6fd1],
    ['van', 0.4, 27, Math.PI / 2 - 0.1, 0xe84f34],
    ['sedan', -26, 42.3, 0.08, 0x2e9df0],
    ['suv', 33, -41.7, Math.PI - 0.1, 0xf2c14e],
  ].forEach(([type, x, z, rotY, color]) => {
    if (!loveBlocked(x, z, 0)) buildCar(x, z, rotY, color, type);
  });
}

// =============================================================
// 街道小物件：消防栓、停止標誌、路燈、垃圾桶、交通錐（歪倒、長苔、鏽蝕）
// =============================================================
function buildLoveProp(kind) {
  const grp = new THREE.Group();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.85 : r, metalness: m || 0 });
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); grp.add(m); return m; };
  const moss = std(0x5b7d3f, 1);

  if (kind === 'hydrant') {
    const red = std(0xa8483a, 0.7), gold = std(0xc9b86a, 0.5, 0.3);
    add(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 10), red, 0, 0.04, 0);
    add(new THREE.CylinderGeometry(0.15, 0.18, 0.6, 10), red, 0, 0.38, 0);
    add(new THREE.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.68, 0);
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), gold, 0, 0.86, 0);
    [-1, 1].forEach(s => {
      add(new THREE.CylinderGeometry(0.065, 0.065, 0.18, 8), red, s * 0.2, 0.5, 0).rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8), gold, s * 0.3, 0.5, 0).rotation.z = Math.PI / 2;
    });
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 8), red, 0, 0.46, 0.18).rotation.x = Math.PI / 2;
    const m = add(new THREE.IcosahedronGeometry(0.16, 0), moss, 0.1, 0.1, 0.1); m.scale.set(1.3, 0.5, 1.3);
  } else if (kind === 'stop') {
    add(new THREE.CylinderGeometry(0.045, 0.05, 2.5, 8), std(0x777b80, 0.6, 0.4), 0, 1.25, 0);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const oct = (r) => { g.beginPath(); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(64 + Math.cos(a) * r, 64 - Math.sin(a) * r); } g.closePath(); };
    g.fillStyle = '#e8e4d8'; oct(64); g.fill();
    g.fillStyle = '#a8312c'; oct(58); g.fill();
    g.fillStyle = '#e8e4d8'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66);
    g.fillStyle = 'rgba(80,100,60,0.35)'; g.beginPath(); g.arc(30, 100, 26, 0, 7); g.fill();   // 青苔
    const faceMat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.6, alphaTest: 0.5 });
    const face = add(new THREE.CircleGeometry(0.42, 8, Math.PI / 8, Math.PI * 2), faceMat, 0, 2.3, 0.032);
    const back = add(new THREE.CircleGeometry(0.42, 8, Math.PI / 8, Math.PI * 2), std(0x6b6e72, 0.7, 0.3), 0, 2.3, 0.026);
    back.rotation.y = Math.PI; back.position.z = 0.025;
    face.rotation.z = 0;
    const v = add(new THREE.IcosahedronGeometry(0.2, 0), std(0x4d7338, 1), 0.04, 0.5, 0.06); v.scale.set(0.6, 2.2, 0.6);
  } else if (kind === 'lamp') {
    const pole = std(0x5d6168, 0.6, 0.4);
    add(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 8), pole, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.07, 0.1, 5.2, 8), pole, 0, 2.8, 0);
    const arm = add(new THREE.BoxGeometry(1.3, 0.07, 0.07), pole, 0.6, 5.4, 0);
    arm.rotation.z = 0.08;
    add(new THREE.BoxGeometry(0.55, 0.12, 0.28), std(0x4a4d54, 0.6, 0.4), 1.2, 5.38, 0);
    add(new THREE.BoxGeometry(0.4, 0.04, 0.2), std(Math.random() < 0.5 ? 0xd7d3b8 : 0x2a2d33, 0.3), 1.2, 5.3, 0);   // 燈罩（有的破了）
    for (let i = 0; i < 4; i++) {
      const v = add(new THREE.IcosahedronGeometry(0.16, 0), std(0x4d7338, 1), rnd(-0.05, 0.05), 0.5 + i * 0.9, rnd(-0.05, 0.05));
      v.scale.set(0.8, 1.6, 0.8);
    }
  } else if (kind === 'trash') {
    const body = std(0x4f6a58, 0.8);
    add(new THREE.CylinderGeometry(0.3, 0.25, 0.8, 12), body, 0, 0.4, 0);
    add(new THREE.CylinderGeometry(0.33, 0.33, 0.06, 12), std(0x3c5244, 0.8), 0, 0.83, 0);
    [0.2, 0.55].forEach(y => add(new THREE.TorusGeometry(0.29 - (y < 0.3 ? 0.03 : 0), 0.015, 5, 14), std(0x3c5244, 0.8), 0, y, 0).rotation.x = Math.PI / 2);
    const m = add(new THREE.IcosahedronGeometry(0.2, 0), moss, 0.1, 0.88, 0); m.scale.set(1.3, 0.4, 1.3);
  } else if (kind === 'cone') {
    add(new THREE.BoxGeometry(0.42, 0.04, 0.42), std(0xc4551f, 0.8), 0, 0.02, 0);
    add(new THREE.ConeGeometry(0.17, 0.6, 12), std(0xe2702a, 0.8), 0, 0.34, 0);
    add(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 12), std(0xe9e6da, 0.8), 0, 0.33, 0);
    const m = add(new THREE.IcosahedronGeometry(0.11, 0), moss, 0.1, 0.06, 0.1); m.scale.set(1.4, 0.4, 1.4);
  }
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}

function buildLoveStreetProps() {
  const rndR = (a, b) => a + Math.random() * (b - a);
  const place = (kind, x, z, opt) => {
    if (loveBlocked(x, z, 0.4)) return;
    const p = buildLoveProp(kind);
    p.position.set(x, opt && opt.y != null ? opt.y : 0.03, z);
    p.rotation.y = opt && opt.rotY != null ? opt.rotY : rndR(0, Math.PI * 2);
    if (opt && opt.tilt) { p.rotation.z = opt.tilt; }
    if (opt && opt.fallen) { p.rotation.z = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); p.position.y = 0.3; }
    loveEnvGroup.add(p);
    loveObstacles.push({ x, z, hw: 0.6, hd: 0.6 });
  };
  // 路口：停止標誌（對角兩角）與消防栓
  LOVE_CROSS_STREETS.forEach((xs, i) => {
    [[1, 1], [-1, -1]].forEach(([sx, sz]) => {
      const px = xs + sx * 5.5, pz = sz * 5.4;
      place('stop', px, pz, { rotY: Math.atan2(xs - px, -pz), tilt: rndR(-0.12, 0.12) });
    });
    place('hydrant', xs + (i % 2 ? -1 : 1) * 7.2, (i % 2 ? 1 : -1) * 6.2, { rotY: rndR(0, 6) });
  });
  // 路燈：主幹道兩側，有的歪斜、有的倒下
  [-58, -34, -18, 18, 34, 58].forEach((lx, i) => {
    [-1, 1].forEach(s => {
      const r = Math.random();
      const px = lx + rndR(-2, 2), pz = s * 6.3;
      place('lamp', px, pz, { rotY: s > 0 ? Math.PI : 0, tilt: r < 0.3 ? rndR(-0.35, 0.35) : 0, fallen: false });
    });
  });
  // 垃圾桶（部分翻倒）
  for (let i = 0; i < 9; i++) {
    const s = Math.random() < 0.5 ? -1 : 1;
    place('trash', rndR(-60, 60), s * rndR(5.4, 6.2), { fallen: Math.random() < 0.4 });
  }
  // 交通錐：散落在路上
  for (let k = 0; k < 2; k++) {
    const cx = rndR(-50, 50), cz = rndR(-3, 3);
    if (Math.hypot(cx, cz) < 8) continue;
    for (let i = 0; i < 3; i++) place('cone', cx + rndR(-1.2, 1.2), cz + rndR(-0.8, 0.8), { fallen: Math.random() < 0.4, y: 0.05 });
  }
}

// 廢棄生鏽車輛（舊版方塊車，已不再使用，保留以便還原）
function buildRustedCar(x, z, rotY, bodyColor) {
  const grp = new THREE.Group();
  grp.position.set(x, 0.05, z);
  grp.rotation.y = rotY;
  loveObstacles.push({ x, z, hw: 2.6, hd: 1.8 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor || 0x31b94e, roughness: 0.45, metalness: 0.25 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 1.6), bodyMat);
  body.position.y = 0.55;
  grp.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.65, 1.45), bodyMat);
  cabin.position.set(-0.2, 1.15, 0);
  cabin.rotation.z = 0.04;
  grp.add(cabin);

  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.9 });
  [[1.2, 0.8], [1.2, -0.8], [-1.2, 0.8], [-1.2, -0.8]].forEach(([wx, wz]) => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.34, wz);
    grp.add(wheel);
  });

  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  loveEnvGroup.add(grp);
}

// —— 愛的遺物：任何能承載「愛」概念的小物件，由 buildLoveRelics 隨機散布 ——
function createLoveRelic(kind) {
  const grp = new THREE.Group();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const std = (hex, rough) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough != null ? rough : 0.85 });

  if (kind === 'photo') {
    const photo = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.62), std(0xfff8e7, 0.8));
    paper.position.y = 0.01;
    const img = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.42), std(pick([0xff6f61, 0x2e86de, 0x27ae60, 0xf39c12, 0x9b59b6, 0x1abc9c]), 0.9));
    img.rotation.x = -Math.PI / 2;
    img.position.y = 0.022;
    photo.add(paper, img);
    photo.rotation.y = rnd(0, Math.PI * 2);
    if (Math.random() > 0.5) {
      const photo2 = photo.clone();
      photo2.position.set(rnd(-0.07, 0.07), 0.026, rnd(-0.07, 0.07));
      photo2.rotation.y += rnd(-0.8, 0.8);
      grp.add(photo2);
    }
    grp.add(photo);
  } else if (kind === 'book') {
    const cover = std(pick([0xe74c3c, 0x2e86de, 0x27ae60, 0xf39c12, 0x8e44ad, 0xff6fb1]), 0.9);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.54), cover);
    bottom.position.y = 0.01;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.5), std(0xf5f0e0, 0.95));
    pages.position.y = 0.045;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.54), cover);
    top.position.y = 0.08;
    grp.add(bottom, pages, top);
  } else if (kind === 'bouquet') {
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, 0.5, 8), std(pick([0xff6f61, 0x2e86de, 0x9b59b6, 0x27ae60]), 0.9));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.y = 0.21;
    grp.add(wrap);
    const flowerColors = [0xff5a7a, 0xffd23f, 0xfe4f9f, 0xff8a1f, 0x8b5eff];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), std(pick(flowerColors), 0.75));
      f.position.set(rnd(-0.1, 0.1), 0.21 + rnd(-0.04, 0.1), 0.26 + rnd(-0.04, 0.08));
      grp.add(f);
    }
  } else if (kind === 'blocks') {
    const palette = [0xff5a3d, 0x2e9df0, 0xffd23f, 0x31b94e, 0x8b5eff, 0xfe4f9f];
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), std(pick(palette), 0.7));
    b1.position.set(-0.16, 0.12, 0);
    b1.rotation.y = rnd(0, 1);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), std(pick(palette), 0.7));
    b2.position.set(0.13, 0.12, 0.1);
    b2.rotation.y = rnd(0, 1);
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), std(pick(palette), 0.7));
    b3.position.set(-0.16, 0.36, 0);
    b3.rotation.y = Math.PI / 4;
    grp.add(b1, b2, b3);
  } else if (kind === 'teddy') {
    const fur = std(0xb86b3f, 0.95);
    const light = std(0xe6b37a, 0.95);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), fur);
    body.position.y = 0.22;
    body.scale.set(1, 1.1, 0.9);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur);
    head.position.y = 0.55;
    grp.add(body, head);
    [[-0.115, 0.67], [0.115, 0.67]].forEach(([ex, ey]) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), fur);
      ear.position.set(ex, ey, 0);
      grp.add(ear);
    });
    [[-0.2, 0.29, 0.05], [0.2, 0.29, 0.05]].forEach(([ax, ay, az]) => {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), fur);
      arm.position.set(ax, ay, az);
      grp.add(arm);
    });
    [[-0.12, 0.08, 0.15], [0.12, 0.08, 0.15]].forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
      leg.position.set(lx, ly, lz);
      leg.scale.set(1, 0.7, 1.2);
      grp.add(leg);
    });
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), light);
    muzzle.position.set(0, 0.51, 0.14);
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), std(0xff3d5a, 0.7));
    heart.position.set(0, 0.3, 0.19);
    heart.scale.set(1, 1, 0.5);
    grp.add(muzzle, heart);
  } else if (kind === 'letter') {
    const env = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.018, 0.3), std(pick([0xfff1c7, 0xffd1dc, 0xc7e6ff, 0xd4f7c7]), 0.9));
    env.position.y = 0.009;
    const seal = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), std(0xff3d5a, 0.5));
    seal.position.y = 0.024;
    seal.scale.y = 0.45;
    grp.add(env, seal);
  } else if (kind === 'candle') {
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.22, 10), std(pick([0xffb3c1, 0x9be7ff, 0xd2ffb8, 0xffd98f]), 0.8));
    wax.position.y = 0.11;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff9f1c }));
    flame.position.y = 0.26;
    flame.scale.set(1, 1.5, 1);
    grp.add(wax, flame);
  } else if (kind === 'balloon') {
    const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), std(pick([0xff5a3d, 0xfe4f9f, 0xffd23f, 0x2e9df0, 0x31b94e, 0x8b5eff]), 0.45));
    balloon.position.y = 0.95;
    balloon.scale.set(1, 1.15, 1);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 6), std(0xe23a4a, 0.6));
    knot.position.y = 0.71;
    knot.rotation.z = Math.PI;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.7, 5), std(0x4a4a4a, 1));
    string.position.y = 0.36;
    const weight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), std(0x6c5ce7, 0.9));
    weight.position.y = 0.025;
    grp.add(balloon, knot, string, weight);
  } else if (kind === 'gift') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), std(pick([0xff5a3d, 0x2e9df0, 0x31b94e, 0x8b5eff, 0xfe4f9f]), 0.7));
    box.position.y = 0.13;
    const ribbonMat = std(pick([0xffd23f, 0xfffaf0, 0x2e9df0, 0xfe4f9f]), 0.45);
    const rA = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.06), ribbonMat);
    rA.position.y = 0.27;
    const rB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.32), ribbonMat);
    rB.position.y = 0.27;
    grp.add(box, rA, rB);
    [[-0.045, 0.305], [0.045, 0.305]].forEach(([bx, by]) => {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.014, 6, 12), ribbonMat);
      loop.position.set(bx, by, 0);
      loop.rotation.x = Math.PI / 2;
      grp.add(loop);
    });
  } else if (kind === 'heart') {
    const red = std(Math.random() > 0.5 ? 0xff3d5a : 0xff6fb1, 0.75);
    const lL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), red);
    lL.position.set(-0.08, 0.2, 0);
    lL.scale.z = 0.85;
    const lR = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), red);
    lR.position.set(0.08, 0.2, 0);
    lR.scale.z = 0.85;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.26, 12), red);
    tip.position.y = 0.13;
    tip.rotation.z = Math.PI;
    tip.scale.z = 0.85;
    grp.add(lL, lR, tip);
  } else if (kind === 'rings') {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.25, metalness: 0.8 });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), gold);
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.03;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 8, 20), gold);
    ring2.rotation.x = Math.PI / 2;
    ring2.rotation.z = 0.9;
    ring2.position.set(0.1, 0.06, 0.02);
    grp.add(ring1, ring2);
  }

  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return grp;
}

function buildLoveRelics() {
  const kinds = ['photo', 'photo', 'book', 'book', 'bouquet', 'blocks', 'teddy', 'letter', 'candle', 'balloon', 'gift', 'heart', 'rings'];
  for (let i = 0; i < 80; i++) {
    let x = 0, z = 0, ok = false;
    for (let t = 0; t < 25 && !ok; t++) {
      x = (Math.random() - 0.5) * 128;
      z = (Math.random() - 0.5) * 88;
      if (Math.hypot(x, z) < 4.5) continue; // 別壓在愛的正下方
      if (loveBlocked(x, z, 1.0)) continue; // 別埋進房子或車裡
      ok = true;
    }
    if (!ok) continue;
    const relic = createLoveRelic(kinds[Math.floor(Math.random() * kinds.length)]);
    relic.scale.setScalar(2.0); // 再放大：小物件遠看太不起眼
    relic.position.set(x, 0.08, z);
    relic.userData.baseY = 0.08; // 覓食時會被牽引飄起，記住原本高度才飄得回來
    relic.rotation.y = Math.random() * Math.PI * 2;
    loveEnvGroup.add(relic);
    loveRelics.push(relic); // 登記：覓食時要從這裡拉光線
  }
  buildLoveFeedSystem();
}

// =============================================================
// 覓食光絲（渴望覓食）
//  FIXED-012: 舊版 80 條直線一次全連到愛身上、很亂 → 只連最近 12 顆、依序長出、雙螺旋弧線＋光點流（截圖驗證近景／拉遠）
//  舊版：80 顆遺物各一條直線連到愛身上 → 一團亂線。
//  新版：
//   1. 只連離愛最近的 LOVE_FEED_SLOTS 顆（愛移動時自動換成新的最近者）
//   2. 由近到遠依序「長」出去（光絲從愛身上伸向遺物），不是一次全出現
//   3. 光絲是雙螺旋弧線（兩條反相位互相纏繞，中間鼓、兩端收回愛與遺物），會緩緩旋轉
//   4. 遺物被牽引：慢慢飄起來、自轉、底下亮起光暈
//   5. 一顆顆發光光點沿螺旋從遺物流向愛，到愛身上縮小消失＝被吸收
// =============================================================
const LOVE_FEED_SLOTS = 12;   // 同時最多連幾顆
const LOVE_FEED_RANGE = 30;   // 只連這個距離內的遺物
const LOVE_FEED_SEG = 44;     // 每條光絲分幾段（越多越圓滑）
const LOVE_FEED_MOTES = 9;    // 每個槽位同時流動的光點數

function makeLoveGlowTexture() {
  // 柔邊圓光點：白熱的中心 → 透明（顏色由材質決定）
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildLoveFeedSystem() {
  loveFeedGroup = new THREE.Group();
  loveFeedGroup.visible = false;
  loveEnvGroup.add(loveFeedGroup);
  const tex = makeLoveGlowTexture();

  for (let i = 0; i < LOVE_FEED_SLOTS; i++) {
    const slot = { relic: null, leaving: false, age: 0, g: 0, rank: 0, phase: 0, twist: 1, dir: 1, lines: [], motes: [], halo: null };
    // 雙股螺旋：兩條線
    for (let st = 0; st < 2; st++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LOVE_FEED_SEG + 1) * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: st === 0 ? 0xff8f1f : 0xffb347, // 兩股深淺不同的暖金橘，亮場景也看得到
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }));
      line.frustumCulled = false; // 端點每幀變動，關掉剔除
      line.visible = false;
      loveFeedGroup.add(line);
      slot.lines.push(line);
    }
    // 流動光點（每顆自己的 Sprite，才能各自縮放與淡出）
    for (let j = 0; j < LOVE_FEED_MOTES; j++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xff9a1a, transparent: true, depthWrite: false }));
      m.visible = false;
      loveFeedGroup.add(m);
      slot.motes.push(m);
    }
    // 遺物底下的光暈
    slot.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffc04d, transparent: true, depthWrite: false }));
    slot.halo.visible = false;
    loveFeedGroup.add(slot.halo);
    loveFeedSlots.push(slot);
  }
}

// 槽位放掉遺物：遺物落回原位、光絲與光點全部隱藏
function releaseLoveFeedSlot(s) {
  if (s.relic) s.relic.position.y = s.relic.userData.baseY;
  s.relic = null;
  s.leaving = false;
  s.g = 0;
  s.lines.forEach((l) => { l.visible = false; });
  s.motes.forEach((m) => { m.visible = false; });
  s.halo.visible = false;
}

function updateLoveFeed(time, dt) {
  // 沒在覓食、光線也淡完了：全部收好
  if (!isLoveFeeding && loveFeedFactor <= 0.02) {
    for (const s of loveFeedSlots) if (s.relic) releaseLoveFeedSlot(s);
    return;
  }
  const L = loveGroup.position;

  // 每 0.35 秒重選一次「最近的 N 顆」（愛在動，最近的會換）
  loveFeedPickT -= dt;
  if (loveFeedPickT <= 0) {
    loveFeedPickT = 0.35;
    const cands = [];
    if (isLoveFeeding) {
      for (const r of loveRelics) {
        const d = Math.hypot(r.position.x - L.x, r.userData.baseY + 0.6 - L.y, r.position.z - L.z);
        if (d < LOVE_FEED_RANGE) cands.push({ r, d });
      }
    }
    cands.sort((p, q) => p.d - q.d);
    const wanted = cands.slice(0, LOVE_FEED_SLOTS);
    const wantedSet = new Set(wanted.map((c) => c.r));
    for (const s of loveFeedSlots) if (s.relic) s.leaving = !wantedSet.has(s.relic);
    wanted.forEach((c, rank) => {
      const have = loveFeedSlots.find((s) => s.relic === c.r);
      if (have) { have.rank = rank; return; }
      const free = loveFeedSlots.find((s) => !s.relic);
      if (!free) return;
      free.relic = c.r;
      free.leaving = false;
      free.age = 0;
      free.g = 0;
      free.rank = rank; // 越近越先長出去
      free.phase = Math.random() * Math.PI * 2;
      free.twist = 0.9 + Math.random() * 0.7; // 螺旋圈數
      free.dir = Math.random() < 0.5 ? 1 : -1; // 順／逆時針
    });
  }

  const fade = loveFeedFactor;
  for (const s of loveFeedSlots) {
    const r = s.relic;
    if (!r) continue;

    // g：這條光絲長了多少（0→1）。離開時快速縮回
    if (s.leaving) s.g = Math.max(0, s.g - dt * 2.5);
    else {
      s.age += dt;
      const x = Math.min(1, Math.max(0, (s.age - s.rank * 0.09) / 0.9));
      s.g = x * x * (3 - 2 * x);
    }
    if (s.leaving && s.g <= 0.001) { releaseLoveFeedSlot(s); continue; }
    const g = s.g;

    // 遺物被牽引：飄起來、慢慢自轉
    r.position.y = r.userData.baseY + (0.9 + 0.25 * Math.sin(time * 2 + s.phase)) * g;
    r.rotation.y += dt * 0.9 * g;

    // 光絲兩端：A＝愛、B＝遺物
    const ax = L.x, ay = L.y, az = L.z;
    const bx = r.position.x, by = r.position.y + 0.6, bz = r.position.z;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    // 垂直於光絲方向的兩個軸 u、v（螺旋繞著它轉）
    let ux = -nz, uz = nx;
    const ul = Math.hypot(ux, uz);
    if (ul < 1e-3) { ux = 1; uz = 0; } else { ux /= ul; uz /= ul; }
    const vx = ny * uz, vy = nz * ux - nx * uz, vz = -ny * ux;
    const amp = Math.min(2.2, 0.35 + len * 0.06); // 螺旋鼓出的半徑
    const arch = Math.min(4, len * 0.1);          // 整條光絲向上拱起的高度

    // 曲線上 pt（0=愛，1=遺物）、相位 phi 的點，寫進 out[o..o+2]
    const pointAt = (pt, phi, out, o) => {
      const env = Math.sin(Math.PI * pt); // 兩端收回、中間最鼓
      const k = amp * Math.pow(env, 0.9);
      const c = Math.cos(phi) * k, sn = Math.sin(phi) * k;
      out[o] = ax + dx * pt + ux * c + vx * sn;
      out[o + 1] = ay + dy * pt + arch * env + vy * sn;
      out[o + 2] = az + dz * pt + uz * c + vz * sn;
    };

    // 雙股螺旋（光絲從愛的身上往遺物「長」：只畫到 pt = g）
    for (let st = 0; st < 2; st++) {
      const line = s.lines[st];
      const pos = line.geometry.attributes.position.array;
      for (let i = 0; i <= LOVE_FEED_SEG; i++) {
        const pt = (i / LOVE_FEED_SEG) * g;
        const phi = s.dir * s.twist * 2 * Math.PI * pt + time * 1.4 + s.phase + st * Math.PI;
        pointAt(pt, phi, pos, i * 3);
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = 0.7 * fade;
      line.visible = true;
    }

    // 光點：長到遺物之後，一顆顆從遺物沿螺旋流向愛，到愛身上縮小＝被吸收
    const tmp = s._tmp || (s._tmp = [0, 0, 0]);
    for (let j = 0; j < LOVE_FEED_MOTES; j++) {
      const m = s.motes[j];
      if (g < 0.97) { m.visible = false; continue; }
      const p = (((time * 0.32 + j / LOVE_FEED_MOTES + s.phase) % 1) + 1) % 1; // 0=剛離開遺物 1=抵達愛
      const pt = 1 - p;
      const phi = s.dir * s.twist * 2 * Math.PI * pt + time * 1.4 + s.phase;
      pointAt(pt, phi, tmp, 0);
      m.position.set(tmp[0], tmp[1], tmp[2]);
      // 光點大小：中段最大、兩端縮到 0；離鏡頭越近縮越多（不然近景會變成一大團金色模糊蓋住愛）
      const camD = camera.position.distanceTo(m.position);
      const sz = (0.18 + 0.34 * Math.sin(Math.PI * p)) * Math.min(1, Math.max(0.25, camD / 14));
      m.scale.set(sz, sz, 1);
      m.material.opacity = fade * Math.pow(Math.sin(Math.PI * p), 0.6);
      m.visible = true;
    }

    // 遺物底下的光暈
    s.halo.position.set(bx, by, bz);
    const hs = 1.5 + 0.3 * Math.sin(time * 3 + s.phase);
    s.halo.scale.set(hs, hs, 1);
    s.halo.material.opacity = 0.45 * g * fade;
    s.halo.visible = true;
  }
}

// -------------------------------------------------------------
// 羞恥環境：羅馬競技場（鬥獸場）遺址 — 陰天白日，亮度比「愛」低一階
// 特徵：雙層拱廊外圈、兩段塌毀缺口、石灰華暖米色、沙地競技區、
//      傾倒柱身、斷柱與瓦礫、縫裡鑽出的乾雜草
// -------------------------------------------------------------
// 羞恥環境（優化版）：依羅馬競技場真實結構建模
//  - 橢圓平面；外環三層拱廊（托斯卡尼／愛奧尼／科林斯半柱）＋頂部閣樓（長方窗＋托石）
//  - 真實殘況：北側（鏡頭後方）外環仍完整，南側外環在 1349 年地震後塌毀，露出內環；斷口呈階梯狀
//  - 內環＋階梯看台（cavea）＋放射狀磚牆；競技場地板大半不存，露出地下室（hypogeum）磚牆格網
//  - 石灰華（travertine）塊石貼圖＋鐵夾孔蝕痕；內部露出的是磚與混凝土
// 參考：羅馬競技場三層 80 拱、橢圓 188×156 m、地下室後加（皇帝圖密善）、南側外環 1349 年倒塌
function buildShameEnvironment() {
  shameEnvGroup = new THREE.Group();
  shameEnvGroup.visible = false;
  scene.add(shameEnvGroup);
  const G = shameEnvGroup;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const pt = (A, B, t) => [A * Math.sin(t), B * Math.cos(t)];   // 橢圓：t=0 在 +z，t=π 在 -z（鏡頭後方＝北側）

  // ---------- 貼圖 ----------
  const mkTex = (draw, size, repU, repV) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repU, repV == null ? repU : repV);
    t.anisotropy = 4;
    return t;
  };
  // 石灰華：水平砌層＋錯縫＋蝕孔（鐵夾被取走留下的洞）＋汙漬
  const travTex = mkTex((g, s) => {
    g.fillStyle = '#d3c7a9'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,250,230,0.10)' : 'rgba(110,95,70,0.10)';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    for (let c = 0; c < 4; c++) {
      const y = c * 64, bw = c % 2 ? 96 : 128, off = c % 2 ? 40 : 0;
      g.fillStyle = 'rgba(80,68,48,0.55)'; g.fillRect(0, y, s, 2);
      for (let x = -off; x < s; x += bw) g.fillRect(x, y, 2, 64);
    }
    for (let i = 0; i < 150; i++) {   // 蝕孔
      g.fillStyle = 'rgba(70,58,40,0.45)';
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, 1 + Math.random() * 2.5, 1 + Math.random() * 2, 0, 0, TAU); g.fill();
    }
    for (let i = 0; i < 7; i++) {     // 雨水汙漬與地衣
      g.fillStyle = Math.random() < 0.6 ? 'rgba(120,100,70,0.12)' : 'rgba(110,125,80,0.14)';
      g.fillRect(Math.random() * s, Math.random() * s * 0.6, 12 + Math.random() * 30, 40 + Math.random() * 100);
    }
  }, 256, 0.5);
  const brickTex = mkTex((g, s) => {
    g.fillStyle = '#c4b393'; g.fillRect(0, 0, s, s);   // 灰漿
    const cols = ['#a65f43', '#9a553b', '#b06b4c', '#8f5038', '#a9704f'];
    for (let r = 0; r < 8; r++) {
      const y = r * 16, off = r % 2 ? 14 : 0;
      for (let x = -off; x < s; x += 28) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x + 1, y + 1, 26, 14);
      }
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(40,30,20,0.12)'; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  }, 128, 1);
  const sandTex = mkTex((g, s) => {
    g.fillStyle = '#c3b08a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,245,215,0.18)' : 'rgba(110,90,60,0.14)';
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1);
    }
  }, 256, 0.17);

  // ---------- 材質 ----------
  const travMats = [0xeae4d2, 0xd8d0b8, 0xc4baa0, 0xb0a78e, 0xa09a86].map(c => new THREE.MeshStandardMaterial({ map: travTex, color: c, roughness: 0.95 }));
  const pickTrav = () => travMats[Math.floor(Math.random() * travMats.length)];
  const brickMat = new THREE.MeshStandardMaterial({ map: brickTex, color: 0xe6d6c4, roughness: 1 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b241c, roughness: 1, side: THREE.DoubleSide });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x7a8447, roughness: 1 });
  const dryMat = new THREE.MeshStandardMaterial({ color: 0x8c8a52, roughness: 1 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b5238, roughness: 1 });

  // ---------- 小工具 ----------
  // 盒子 UV 換成公尺單位（貼圖才不會被拉伸）
  const stoneBox = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
    return g;
  };
  const sMesh = (geo, mat, x, y, z, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    (parent || G).add(m);
    return m;
  };
  const sBox = (w, h, d, mat, x, y, z, parent) => sMesh(stoneBox(w, h, d), mat, x, y, z, parent);
  // 橢圓扇形環（看台、台座牆）：半軸 a1,b1（內）→ a2,b2（外），角度 t0→t1，高 h
  const sectorGeo = (a1, b1, a2, b2, t0, t1, h) => {
    const sh = new THREE.Shape();
    const n = Math.max(2, Math.ceil((t1 - t0) / 0.08));
    for (let k = 0; k <= n; k++) { const [x, z] = pt(a2, b2, t0 + (t1 - t0) * k / n); k ? sh.lineTo(x, -z) : sh.moveTo(x, -z); }
    for (let k = n; k >= 0; k--) { const [x, z] = pt(a1, b1, t0 + (t1 - t0) * k / n); sh.lineTo(x, -z); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const angDist = (t) => Math.abs(Math.atan2(Math.sin(t - Math.PI), Math.cos(t - Math.PI)));   // 離「北側」(t=π) 的角距

  // ---------- 地面 ----------

  // 競技場地板：沙地橢圓，中央挖出地下室（hypogeum）
  const AR_A = 17.5, AR_B = 14.0, PIT_X = 10, PIT_Z = 2.0, PIT_Y = -2.5;
  const arenaShape = new THREE.Shape();
  arenaShape.absellipse(0, 0, AR_A, AR_B, 0, TAU, false, 0);
  const hole = new THREE.Path();
  hole.moveTo(-PIT_X, -PIT_Z); hole.lineTo(-PIT_X, PIT_Z); hole.lineTo(PIT_X, PIT_Z); hole.lineTo(PIT_X, -PIT_Z); hole.lineTo(-PIT_X, -PIT_Z);
  arenaShape.holes.push(hole);
  // 外圈夯土：同樣在地下室處挖洞，否則會蓋住地下室
  const dirtShape = new THREE.Shape();
  dirtShape.moveTo(-85, -85); dirtShape.lineTo(-85, 85); dirtShape.lineTo(85, 85); dirtShape.lineTo(85, -85); dirtShape.lineTo(-85, -85);
  const dirtHole = new THREE.Path();
  dirtHole.moveTo(-PIT_X, -PIT_Z); dirtHole.lineTo(-PIT_X, PIT_Z); dirtHole.lineTo(PIT_X, PIT_Z); dirtHole.lineTo(PIT_X, -PIT_Z); dirtHole.lineTo(-PIT_X, -PIT_Z);
  dirtShape.holes.push(dirtHole);
  const dirt = new THREE.Mesh(new THREE.ShapeGeometry(dirtShape), new THREE.MeshStandardMaterial({ color: 0x968868, roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = -0.02; dirt.receiveShadow = true;
  G.add(dirt);
  const arena = new THREE.Mesh(new THREE.ShapeGeometry(arenaShape, 48), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  arena.rotation.x = -Math.PI / 2; arena.receiveShadow = true;
  G.add(arena);

  // 地下室：深色地面＋磚牆格網（長牆、橫牆、四周擋土牆；高度參差表示已損毀）
  const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(PIT_X * 2, PIT_Z * 2), new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 1 }));
  pitFloor.rotation.x = -Math.PI / 2; pitFloor.position.y = PIT_Y; pitFloor.receiveShadow = true;
  G.add(pitFloor);
  const pitH = -PIT_Y;
  [-1, 1].forEach(s => sBox(PIT_X * 2, pitH, 0.3, brickMat, 0, PIT_Y + pitH / 2, s * (PIT_Z - 0.15)));   // 兩側擋土牆
  [-1, 1].forEach(s => sBox(0.3, pitH, PIT_Z * 2, brickMat, s * (PIT_X - 0.15), PIT_Y + pitH / 2, 0));   // 兩端擋土牆
  [-0.9, 0.9].forEach(z => {                                      // 兩道縱向牆
    for (let x = -PIT_X + 0.3; x < PIT_X - 0.3; x += 2.4) {
      const h = rnd(0.9, pitH - 0.15);
      sBox(2.3, h, 0.45, brickMat, x + 1.15, PIT_Y + h / 2, z);
    }
  });
  for (let x = -8.4; x <= 8.4; x += 2.8) {                        // 橫向隔牆
    const h = rnd(0.8, pitH - 0.15);
    sBox(0.45, h, PIT_Z * 2 - 0.5, brickMat, x, PIT_Y + h / 2, 0);
  }
  for (let k = 0; k < 7; k++) {                                   // 東端殘留的木地板條（復原的一小段）
    sBox(0.28, 0.06, PIT_Z * 2 + 0.2, woodMat, 7.6 + k * 0.33 + rnd(0, 0.04), -0.04, 0).rotation.y = rnd(-0.02, 0.02);
  }

  // ---------- 拱廊環 ----------
  const dark = (w, h, y, zBack, parent) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), darkMat);
    m.position.set(0, y + h / 2, zBack);
    parent.add(m);
  };
  const buildRing = (cfg) => {
    const N = cfg.N;
    for (let i = 0; i < N; i++) {
      const t0 = i / N * TAU, t1 = (i + 1) / N * TAU, tm = (t0 + t1) / 2;
      const [x0, z0] = pt(cfg.A, cfg.B, t0), [x1, z1] = pt(cfg.A, cfg.B, t1);
      const dx = x1 - x0, dz = z1 - z0, bw = Math.hypot(dx, dz);
      const grp = new THREE.Group();
      grp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      grp.rotation.y = Math.atan2(-dz / bw, dx / bw);
      G.add(grp);
      const st = cfg.keep(i, angDist(tm));
      if (st.jag) { grp.rotation.z = rnd(-0.05, 0.05); }   // 斷口處的殘牆微傾
      const th = cfg.thick;
      let y = 0;

      if (st.tiers === 0) {   // 外環已不在：只剩低矮的基礎石
        if (cfg.foundation) sBox(bw * 0.92, rnd(0.15, 0.7), th, pickTrav(), 0, 0.2, 0, grp);
        continue;
      }
      for (let k = 0; k < Math.min(st.tiers, cfg.tiers.length); k++) {
        const T = cfg.tiers[k];
        const spring = T.H - T.ow - 0.7;
        const isTop = (k === st.tiers - 1) && !st.attic;
        const minH = spring + T.ow + 0.35;
        const hl = (isTop && st.jag) ? rnd(minH, T.H) : T.H, hr = (isTop && st.jag) ? rnd(minH, T.H) : T.H;
        const hw = bw / 2, ow = T.ow;
        const sh = new THREE.Shape();
        if (k === 0) {   // 底層：拱洞直通地面（U 形輪廓）
          sh.moveTo(-hw, 0); sh.lineTo(-ow, 0); sh.lineTo(-ow, spring);
          sh.absarc(0, spring, ow, Math.PI, 0, true);
          sh.lineTo(ow, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hr); sh.lineTo(-hw, hl); sh.lineTo(-hw, 0);
        } else {         // 上層：窗台以上才開拱
          sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(hw, hr); sh.lineTo(-hw, hl); sh.lineTo(-hw, 0);
          const hp = new THREE.Path();
          hp.moveTo(-ow, 0.5); hp.lineTo(-ow, spring);
          hp.absarc(0, spring, ow, Math.PI, 0, true);
          hp.lineTo(ow, 0.5); hp.lineTo(-ow, 0.5);
          sh.holes.push(hp);
        }
        const wg = new THREE.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
        wg.translate(0, 0, -th / 2);
        sMesh(wg, pickTrav(), 0, y, 0, grp);
        dark(2 * ow + 0.2, T.H - 0.2, y + 0.1, 0, grp);
        // 半柱（逐層：托斯卡尼→愛奧尼→科林斯）：柱礎＋柱身＋柱頭
        if (!(isTop && st.jag)) {
          const colH = T.H - 0.55;
          const cm = pickTrav();
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, colH, k === 0 ? 8 : 12), cm);
          shaft.position.set(-hw, y + 0.2 + colH / 2, th / 2 + 0.1);
          shaft.castShadow = true; grp.add(shaft);
          sBox(0.8, 0.2, 0.8, cm, -hw, y + 0.1, th / 2 + 0.1, grp);
          sBox(k === 2 ? 0.85 : 0.78, k === 2 ? 0.34 : 0.22, k === 2 ? 0.85 : 0.78, cm, -hw, y + T.H - 0.32, th / 2 + 0.1, grp);
        }
        if (!(isTop && st.jag)) sBox(bw + 0.1, 0.3, th + 0.5, pickTrav(), 0, y + T.H + 0.15, 0, grp);   // 層間腰線
        y += T.H + 0.3;
      }
      // 閣樓：實牆＋方窗＋托石（外環完整處才有）
      if (st.attic && cfg.attic) {
        const AH = cfg.attic;
        const sh = new THREE.Shape();
        sh.moveTo(-bw / 2, 0); sh.lineTo(bw / 2, 0); sh.lineTo(bw / 2, AH); sh.lineTo(-bw / 2, AH); sh.lineTo(-bw / 2, 0);
        if (i % 2 === 0) {
          const hp = new THREE.Path();
          hp.moveTo(-0.4, AH * 0.3); hp.lineTo(-0.4, AH * 0.3 + 1.2); hp.lineTo(0.4, AH * 0.3 + 1.2); hp.lineTo(0.4, AH * 0.3); hp.lineTo(-0.4, AH * 0.3);
          sh.holes.push(hp);
        }
        const ag = new THREE.ExtrudeGeometry(sh, { depth: th - 0.2, bevelEnabled: false });
        ag.translate(0, 0, -(th - 0.2) / 2);
        sMesh(ag, pickTrav(), 0, y, 0, grp);
        [-0.9, 0.9].forEach(cx => sBox(0.28, 0.5, 0.35, pickTrav(), cx, y + AH - 0.45, (th - 0.2) / 2 + 0.1, grp));   // 托石
        sBox(bw + 0.1, 0.35, th + 0.5, pickTrav(), 0, y + AH + 0.17, 0, grp);
        y += AH + 0.35;
      } else if (st.stub) {
        [-1, 1].forEach(s => sBox(0.9, rnd(0.4, 1.7), th * 0.85, pickTrav(), s * (bw / 2 - 0.5), y + 0.5, 0, grp).rotation.z = rnd(-0.1, 0.1));
      }
      // 牆頂：苔蘚與乾草
      if (Math.random() < 0.9) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.3, 0.8), 0), Math.random() < 0.5 ? mossMat : dryMat);
        m.position.set(rnd(-bw / 2, bw / 2), y + 0.05, rnd(-th / 3, th / 3));
        m.scale.set(1.4, 0.45, 1.2);
        grp.add(m);
      }
    }
  };

  // 外環：北側完整（三層＋閣樓），向南逐層斷開成階梯狀，南側全毀
  buildRing({
    N: 44, A: 27, B: 22.5, thick: 1.5, foundation: true, attic: 2.4,
    tiers: [{ H: 4.4, ow: 0.95 }, { H: 3.7, ow: 0.85 }, { H: 3.5, ow: 0.8 }],
    keep: (i, d) => {
      d += rnd(-0.12, 0.12);
      let tiers = d < 1.4 ? 3 : d < 1.7 ? 2 : d < 1.95 ? 1 : 0;
      if (tiers > 0 && Math.random() < 0.22) tiers--;   // 荒廢：到處有被啃掉的一層
      const attic = tiers === 3 && d < 1.15 && Math.random() > 0.35;
      const jag = tiers > 0 && !attic;
      return { tiers, attic, jag: jag || Math.random() < 0.1, stub: jag && Math.random() < 0.5 };
    },
  });
  // 內環：兩層拱廊；南側崩得更碎
  buildRing({
    N: 44, A: 22.2, B: 18.5, thick: 1.3, foundation: false, attic: 0,
    tiers: [{ H: 4.4, ow: 0.8 }, { H: 3.6, ow: 0.75 }],
    keep: (i, d) => {
      let tiers = 2;
      if (d > 1.6) { const r = Math.random(); tiers = r < 0.25 ? 2 : r < 0.75 ? 1 : 0; } else if (Math.random() < 0.15) tiers = 1;
      return { tiers, attic: false, jag: tiers < 2 || (d > 1.6 && Math.random() < 0.7), stub: Math.random() < 0.3 };
    },
  });

  // ---------- 台座牆與階梯看台 ----------
  const POD_A = AR_A + 0.45, POD_B = AR_B + 0.45;
  for (let c = 0; c < 72; c++) {                                  // 競技場邊的台座牆（缺幾塊）
    if (Math.random() < 0.18) continue;
    sMesh(sectorGeo(AR_A, AR_B, POD_A, POD_B, c / 72 * TAU, (c + 1) / 72 * TAU, rnd(1.0, 1.4)), pickTrav(), 0, 0, 0);
  }
  const IN_A = 21.5, IN_B = 17.85, STEPS = 7;
  const dA = (IN_A - POD_A) / STEPS, dB = (IN_B - POD_B) / STEPS;
  const CH = 36;
  for (let k = 0; k < STEPS; k++) {
    for (let c = 0; c < CH; c++) {
      const tm = (c + 0.5) / CH * TAU, d = angDist(tm);
      const p = d < 1.6 ? 0.82 - 0.04 * k : Math.max(0.06, 0.7 - 0.14 * k);   // 北側完整；南側越高越殘
      if (Math.random() > p) continue;
      sMesh(sectorGeo(POD_A + dA * k, POD_B + dB * k, POD_A + dA * (k + 1), POD_B + dB * (k + 1), c / CH * TAU, (c + 1) / CH * TAU, 1.5 + k * 0.52),
        pickTrav(), 0, 0, 0);
    }
  }
  // 放射狀磚牆：看台缺失處露出的支撐結構（只放南側）
  for (let i = 0; i < 44; i += 1) {
    const t = (i + 0.5) / 44 * TAU, d = angDist(t);
    if (d < 1.5 || Math.random() < 0.25) continue;
    const [xa, za] = pt(POD_A, POD_B, t), [xb, zb] = pt(IN_A, IN_B, t);
    const len = Math.hypot(xb - xa, zb - za), h = rnd(0.7, 4.0);
    const w = sBox(0.5, h, len, brickMat, (xa + xb) / 2, h / 2, (za + zb) / 2);
    w.rotation.y = Math.atan2(xb - xa, zb - za);
  }

  // ---------- 殘留直立斷柱（位置與碰撞表 SHAME_COLUMN_OBSTACLES 對應，不可移動）----------
  [[6.5, 4.5, 3.2], [-7.5, 2.8, 2.4], [-3.5, -8.5, 2.8], [8.2, -4.0, 1.8]].forEach(([x, z, h], idx) => {
    const m = pickTrav();
    sBox(1.3, 0.25, 1.3, m, x, 0.125, z);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.52, h - 0.25, 14), m);
    shaft.position.set(x, 0.25 + (h - 0.25) / 2, z); shaft.castShadow = true; shaft.receiveShadow = true;
    G.add(shaft);
    for (let f = 0; f < 6; f++) {   // 凹槽（柱身直條紋）
      const a = f / 6 * TAU;
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.9, 0.05), darkMat);
      fl.position.set(x + Math.cos(a) * 0.5, 0.25 + (h - 0.25) / 2, z + Math.sin(a) * 0.5);
      G.add(fl);
    }
    if (idx !== 3) {                // 柱頭（最矮那根只剩斷口）
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.46, 0.4, 14), m);
      cap.position.set(x, h + 0.05, z); cap.castShadow = true; G.add(cap);
      const ab = sBox(1.4, 0.18, 1.4, m, x, h + 0.34, z);
      ab.rotation.y = rnd(0, 0.5);
      if (idx === 1) { ab.rotation.z = 0.12; ab.position.y -= 0.05; }
    }
  });

  // ---------- 倒落的柱身、塊石、碎磚 ----------
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * TAU, r = 9 + Math.random() * 6;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.4 + Math.random() * 1.2, 12), pickTrav());
    drum.position.set(r * Math.sin(a), 0.42, r * Math.cos(a));
    drum.rotation.z = Math.PI / 2 + rnd(-0.15, 0.15); drum.rotation.y = Math.random() * Math.PI;
    drum.castShadow = true; drum.receiveShadow = true;
    if (Math.abs(drum.position.z) < 3 && Math.abs(drum.position.x) < 11) { drum.position.z += 3.6 * (drum.position.z >= 0 ? 1 : -1); }   // 別掉進地下室
    G.add(drum);
  }
  for (let i = 0; i < 280; i++) {   // 塌毀處（南側外環）與場內的塊石
    const south = i < 170;
    const t = south ? Math.PI + (Math.random() < 0.5 ? -1 : 1) * rnd(2.2, 3.0) : rnd(0, TAU);
    const r = south ? rnd(0.92, 1.18) : rnd(0.55, 0.9);
    const [bx, bz] = pt(south ? 27 * r : 21 * r, south ? 22.5 * r : 17 * r, t);
    if (!south && Math.abs(bz) < 3.2 && Math.abs(bx) < 11) continue;
    const blk = sBox(rnd(0.5, 1.5), rnd(0.4, 0.9), rnd(0.5, 1.2), pickTrav(), bx, 0.3, bz);
    blk.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3));
  }
  for (let i = 0; i < 40; i++) {    // 碎磚
    const a = Math.random() * TAU, r = rnd(4, 24);
    const x = r * Math.sin(a) * 1.0, z = r * Math.cos(a) * 0.8;
    if (Math.abs(z) < 3.2 && Math.abs(x) < 11) continue;
    const ch = sMesh(new THREE.DodecahedronGeometry(rnd(0.15, 0.4), 0), Math.random() < 0.5 ? brickMat : pickTrav(), x, 0.15, z);
    ch.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
  }

  // ---------- 植被：乾草叢、灌木、傘松與柏樹（羅馬的天際線）----------
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * TAU, r = Math.random() < 0.6 ? rnd(14, 22) : rnd(2, 13);
    const x = r * Math.sin(a), z = r * Math.cos(a) * 0.82;
    if (Math.abs(z) < 3.2 && Math.abs(x) < 11) continue;
    const w = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.06, 0.12), rnd(0.35, 0.9), 4), Math.random() < 0.6 ? dryMat : mossMat);
    w.position.set(x, 0.25, z); w.rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
    G.add(w);
  }
  // 荒蕪：灌木叢爬滿場內與看台、場內長出野樹、牆根青苔、沙地龜裂汙漬
  const bushMats = [mossMat, dryMat, new THREE.MeshStandardMaterial({ color: 0x5e6b3a, roughness: 1 })];
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * TAU, r = Math.random() < 0.5 ? rnd(8, 17) : rnd(15, 22);
    const x = r * Math.sin(a), z = r * Math.cos(a) * 0.82;
    if (Math.abs(z) < 3.4 && Math.abs(x) < 11.5) continue;
    const bsh = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.35, 0.95), 1), bushMats[Math.floor(Math.random() * 3)]);
    bsh.position.set(x, rnd(0.2, 0.5), z); bsh.scale.set(1.2, rnd(0.5, 0.9), 1.2);
    bsh.castShadow = true; G.add(bsh);
  }
  for (let i = 0; i < 5; i++) {   // 場內的野樹（從破裂的沙地長出來）
    const a = Math.random() * TAU, r = rnd(9, 14);
    const x = r * Math.sin(a), z = r * Math.cos(a) * 0.8;
    if (Math.abs(z) < 4 && Math.abs(x) < 12) continue;
    const th = rnd(2.5, 4.2);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, th, 6), new THREE.MeshStandardMaterial({ color: 0x5d4a38, roughness: 1 }));
    tr.position.set(x, th / 2, z); tr.rotation.z = rnd(-0.2, 0.2); tr.castShadow = true; G.add(tr);
    for (let k = 0; k < 2; k++) {
      const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.7, 1.1), 1), bushMats[k]);
      lf.position.set(x + rnd(-0.4, 0.4), th + rnd(-0.2, 0.4), z + rnd(-0.4, 0.4)); lf.scale.y = 0.8; lf.castShadow = true; G.add(lf);
    }
  }
  const stainMat = new THREE.MeshStandardMaterial({ color: 0x6b5a40, roughness: 1, transparent: true, opacity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (let i = 0; i < 26; i++) {   // 沙地龜裂與乾涸汙漬
    const a = Math.random() * TAU, r = rnd(2, 15);
    const x = r * Math.sin(a), z = r * Math.cos(a) * 0.8;
    if (Math.abs(z) < 3.2 && Math.abs(x) < 11) continue;
    const st = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.8, 2.4), 9), stainMat);
    st.rotation.set(-Math.PI / 2, 0, Math.random() * 3); st.scale.set(1, rnd(0.4, 0.8), 1); st.position.set(x, 0.015, z);
    G.add(st);
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, TAU), s = rnd(1.2, 1.55);
    const [tx, tz] = pt(27 * s, 22.5 * s, a);
    if (Math.random() < 0.5) {      // 傘松
      const th = rnd(7, 10);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, th, 7), new THREE.MeshStandardMaterial({ color: 0x6b5340, roughness: 1 }));
      trunk.position.set(tx, th / 2, tz); trunk.rotation.z = rnd(-0.08, 0.08); trunk.castShadow = true; G.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cn = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.8, 2.6), 1), new THREE.MeshStandardMaterial({ color: 0x55663d, roughness: 1 }));
        cn.position.set(tx + rnd(-1.4, 1.4), th + rnd(-0.3, 0.7), tz + rnd(-1.4, 1.4)); cn.scale.set(1.4, 0.5, 1.4); cn.castShadow = true; G.add(cn);
      }
    } else {                        // 義大利柏樹
      const ch = rnd(6, 9);
      const cy = new THREE.Mesh(new THREE.ConeGeometry(1.0, ch, 8), new THREE.MeshStandardMaterial({ color: 0x3f5035, roughness: 1 }));
      cy.position.set(tx, ch / 2, tz); cy.castShadow = true; G.add(cy);
    }
  }
}

// 舊版羅馬競技場環境（簡化圓形雙層拱廊，已不再使用，保留以便還原）
function buildShameEnvironmentOld() {
  shameEnvGroup = new THREE.Group();
  shameEnvGroup.visible = false;
  scene.add(shameEnvGroup);

  const R = 21;     // 競技場外圈半徑
  const BAYS = 26;  // 拱廊開間數

  const stoneMats = [
    new THREE.MeshStandardMaterial({ color: 0xbfae8a, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0xa8977a, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: 0x91826a, roughness: 0.95 }),
  ];
  const pickStone = () => stoneMats[Math.floor(Math.random() * stoneMats.length)];
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3228, roughness: 1, side: THREE.DoubleSide });

  // ---- 地面：外圈夯土 + 內圈沙地競技區 ----
  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({ color: 0x968868, roughness: 1 })
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = -0.02;
  dirt.receiveShadow = true;
  shameEnvGroup.add(dirt);

  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(13.5, 48),
    new THREE.MeshStandardMaterial({ color: 0xb2a180, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  shameEnvGroup.add(sand);

  const sandInner = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 40),
    new THREE.MeshStandardMaterial({ color: 0xc0af8c, roughness: 1 })
  );
  sandInner.rotation.x = -Math.PI / 2;
  sandInner.position.y = 0.012;
  sandInner.receiveShadow = true;
  shameEnvGroup.add(sandInner);

  // ---- 雙層拱廊外圈：兩大段塌平＋零星矮殘段，才像遺址 ----
  const isCollapsed = (i) => (i >= 4 && i <= 6) || (i >= 15 && i <= 17);

  for (let i = 0; i < BAYS; i++) {
    const a = ((i + 0.5) / BAYS) * Math.PI * 2;
    const bayW = 2 * R * Math.sin(Math.PI / BAYS); // 弦長 ≈ 5.07
    const grp = new THREE.Group();
    grp.position.set(R * Math.sin(a), 0, R * Math.cos(a));
    grp.rotation.y = a;

    if (isCollapsed(i)) {
      // 塌毀段：只剩歪斜基座
      const stubH = 0.5 + Math.random() * 0.9;
      [-1, 1].forEach(s => {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.85, stubH, 1.7), pickStone());
        stub.position.set(s * bayW / 2, stubH / 2, 0);
        stub.rotation.z = (Math.random() - 0.5) * 0.15;
        stub.castShadow = true;
        stub.receiveShadow = true;
        grp.add(stub);
      });
      shameEnvGroup.add(grp);
      continue;
    }

    // ---- 下層拱廊：柱墩 + 拱圈 + 拱內陰影 ----
    const lowerH = 5.2;
    const archR = 1.48;

    [-1, 1].forEach(s => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.85, lowerH, 1.7), pickStone());
      pillar.position.set(s * bayW / 2, lowerH / 2, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      grp.add(pillar);
    });

    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(archR, 0.34, 8, 20, Math.PI),
      pickStone()
    );
    arch.position.set(0, lowerH, 0);
    arch.castShadow = true;
    grp.add(arch);

    // 拱內：陰影牆＋半圓暗面，看向競技場時拱門是深色洞口
    const recessWall = new THREE.Mesh(new THREE.BoxGeometry(bayW - 0.9, lowerH + archR, 0.08), darkMat);
    recessWall.position.set(0, (lowerH + archR) / 2, -0.55);
    grp.add(recessWall);
    const recessTop = new THREE.Mesh(new THREE.CircleGeometry(archR + 0.12, 16, 0, Math.PI), darkMat);
    recessTop.position.set(0, lowerH, -0.55);
    grp.add(recessTop);

    // ---- 檐帶（上下層之間的水平線腳）----
    const bandY = lowerH + archR + 0.72;
    const band = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.85, 0.55, 1.85), pickStone());
    band.position.set(0, bandY, 0);
    band.castShadow = true;
    band.receiveShadow = true;
    grp.add(band);

    // ---- 上層：小拱窗，部分開間已塌只剩殘牆 ----
    if (Math.random() < 0.72) {
      const upperH = 3.6;
      const archR2 = 1.05;
      [-1, 1].forEach(s => {
        const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, upperH, 1.55), pickStone());
        p2.position.set(s * bayW / 2, bandY + 0.28 + upperH / 2, 0);
        p2.castShadow = true;
        p2.receiveShadow = true;
        grp.add(p2);
      });
      const arch2 = new THREE.Mesh(
        new THREE.TorusGeometry(archR2, 0.26, 8, 16, Math.PI),
        pickStone()
      );
      arch2.position.set(0, bandY + 0.28 + upperH, 0);
      arch2.castShadow = true;
      grp.add(arch2);

      const recess2 = new THREE.Mesh(new THREE.BoxGeometry(bayW - 1.6, upperH + archR2, 0.08), darkMat);
      recess2.position.set(0, bandY + 0.28 + (upperH + archR2) / 2, -0.5);
      grp.add(recess2);
      const recess2Top = new THREE.Mesh(new THREE.CircleGeometry(archR2 + 0.1, 14, 0, Math.PI), darkMat);
      recess2Top.position.set(0, bandY + 0.28 + upperH, -0.5);
      grp.add(recess2Top);

      // 頂部簷口
      const cap = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.9, 0.4, 1.7), pickStone());
      cap.position.set(0, bandY + 0.28 + upperH + archR2 + 0.42, 0);
      cap.castShadow = true;
      grp.add(cap);
    } else {
      // 上層塌掉：檐帶上留一兩塊歪斜殘磚
      const nStub = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < nStub; k++) {
        const stub = new THREE.Mesh(
          new THREE.BoxGeometry(0.8 + Math.random() * 1.4, 0.6 + Math.random() * 1.6, 1.4),
          pickStone()
        );
        stub.position.set(
          (Math.random() - 0.5) * (bayW - 1.5),
          bandY + 0.5 + stub.geometry.parameters.height / 2,
          (Math.random() - 0.5) * 0.4
        );
        stub.rotation.z = (Math.random() - 0.5) * 0.12;
        stub.castShadow = true;
        stub.receiveShadow = true;
        grp.add(stub);
      }
    }

    shameEnvGroup.add(grp);
  }

  // ---- 傾倒的柱身（散在沙地邊緣與競技場裡）----
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 9 + Math.random() * 7;
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.46, 1.4 + Math.random() * 1.2, 12),
      pickStone()
    );
    drum.position.set(r * Math.sin(a), 0.42, r * Math.cos(a));
    drum.rotation.z = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    drum.rotation.y = Math.random() * Math.PI;
    drum.castShadow = true;
    drum.receiveShadow = true;
    shameEnvGroup.add(drum);
  }

  // ---- 直立斷柱：三四根，帶柱頭方板 ----
  [[6.5, 4.5, 3.2], [-7.5, 2.8, 2.4], [-3.5, -8.5, 2.8], [8.2, -4.0, 1.8]].forEach(([x, z, h]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, h, 14), pickStone());
    col.position.set(x, h / 2, z);
    col.castShadow = true;
    col.receiveShadow = true;
    shameEnvGroup.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 1.3), pickStone());
    cap.position.set(x, h + 0.14, z);
    cap.rotation.y = Math.random() * 0.4;
    cap.castShadow = true;
    shameEnvGroup.add(cap);
  });

  // ---- 瓦礫堆 ----
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() < 0.5 ? 14 + Math.random() * 4 : 4 + Math.random() * 9;
    const chunk = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.4, 0),
      pickStone()
    );
    chunk.position.set(r * Math.sin(a), 0.15 + Math.random() * 0.1, r * Math.cos(a));
    chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    chunk.castShadow = true;
    shameEnvGroup.add(chunk);
  }

  // ---- 零星乾雜草：遺址石縫裡鑽出來 ----
  const weedMat = new THREE.MeshStandardMaterial({ color: 0x6e7346, roughness: 1 });
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() < 0.55 ? 13.5 + Math.random() * 6 : 2 + Math.random() * 10;
    const weed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + Math.random() * 0.22, 0), weedMat);
    weed.position.set(r * Math.sin(a), 0.1, r * Math.cos(a));
    weed.scale.y = 0.5 + Math.random() * 0.7;
    shameEnvGroup.add(weed);
  }
}

/* ============================================================
   七大罪環境：Zaun 底城街巷（參考 Arcane／LoL Zaun 視覺設計）
   特徵萃取自 Riot／Fortiche 官方設定與概念美術：
   - 「鐵與玻璃之城」：垂直堆疊的街屋、蓋了又蓋的密度感
   - 腐蝕管線在立面與頭頂縱橫（chem-tech 工業）
   - 招牌的化技綠光：窗、燈、煙囪都滲綠
   - 維多利亞鐵格＋工業殘骸混搭（拱窗、鐵橋、簷板）
   ============================================================ */
/* ============================================================
   七大罪環境（優化版）：蒸氣龐克監獄街區
   參考：維多利亞工業監獄（鐵欄窗、層層鐵製走廊、圍牆＋瞭望塔＋鐵絲網＋探照燈）、
        髒舊的底層街區（煙燻磚牆、鵝卵石路、積水、海報塗鴉、晾衣線、破窗木板窗）、
        蒸氣龐克損毀風（鉚釘鐵板、黃銅齒輪、鍋爐、壓力錶、閥門、管線漏蒸氣、時鐘塔）
   保留：街心留空給七大罪生物、化技綠／琥珀燈光（sinsLamps 閃爍）、Shimmer 紫窗
   ============================================================ */
function buildSinsEnvironment() {
  sinsEnvGroup = new THREE.Group();
  sinsEnvGroup.visible = false;
  scene.add(sinsEnvGroup);
  sinsLamps = [];
  const G = sinsEnvGroup;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const TAU = Math.PI * 2;

  const ZAUN = {
    chemGreen: 0x39d353, chemGreenDim: 0x1a7a30, amber: 0xd4a017, shimmer: 0xa855f7, smoke: 0x8a9a8e,
    brass: 0xa8843a, copper: 0x8a5a3a, iron: 0x3a4048, rust: 0x6b4a2a, soot: 0x1a1a18,
  };

  // ---------- 貼圖（皆以公尺為 UV 單位，tile = 2 m）----------
  const mkTex = (draw, w, h, repU, repV) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repU, repV == null ? repU : repV);
    t.anisotropy = 4;
    return t;
  };
  // 煙燻磚牆：深紅褐磚＋灰漿＋煤煙汙漬＋雨水垂痕＋底部潮濕
  const brickTex = mkTex((g, w, h) => {
    g.fillStyle = '#3a3029'; g.fillRect(0, 0, w, h);
    const cols = ['#5e4234', '#5a3f32', '#634638', '#573c30', '#5c4033'];
    for (let r = 0; r < 16; r++) {
      const off = r % 2 ? 14 : 0;
      for (let x = -off; x < w; x += 28) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x + 1, r * 16 + 1, 26, 14);
      }
    }
    for (let i = 0; i < 40; i++) {      // 煤煙塊
      g.fillStyle = 'rgba(8,8,6,' + (0.03 + Math.random() * 0.05) + ')';
      g.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 50, 20 + Math.random() * 60);
    }
    for (let i = 0; i < 6; i++) {      // 垂直雨痕
      g.fillStyle = 'rgba(0,0,0,0.07)';
      g.fillRect(Math.random() * w, Math.random() * h * 0.5, 2 + Math.random() * 3, 40 + Math.random() * 120);
    }
    for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }, 256, 256, 0.35);
  // 鉚釘鐵板：板縫＋鉚釘格＋鏽斑垂痕
  const plateTex = mkTex((g, w, h) => {
    g.fillStyle = '#3b3f3c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
    g.strokeStyle = 'rgba(8,8,8,0.8)'; g.lineWidth = 3;
    g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
    for (let x = 14; x < w; x += 32) for (let y = 14; y < h; y += 32) {
      g.fillStyle = '#6b6f69'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 1, y + 1, 1.5, 0, TAU); g.fill();
    }
    for (let i = 0; i < 18; i++) {      // 鏽水垂痕
      g.fillStyle = 'rgba(150,80,30,' + (0.06 + Math.random() * 0.1) + ')';
      g.fillRect(Math.random() * w, Math.random() * h * 0.6, 3 + Math.random() * 6, 30 + Math.random() * 120);
    }
  }, 256, 256, 0.5);
  // 鵝卵石路面：不規則石塊＋積污＋青苔
  const cobbleTex = mkTex((g, w, h) => {
    g.fillStyle = '#242723'; g.fillRect(0, 0, w, h);
    const cols = ['#33362f', '#31342d', '#363933', '#30332c', '#343730'];
    for (let y = 0; y < h; y += 32) {
      const off = (y / 32) % 2 ? 20 : 0;
      for (let x = -off; x < w; x += 40) {
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        const rw = 30 + Math.random() * 6, rh = 24 + Math.random() * 5;
        g.beginPath(); g.ellipse(x + 20, y + 16, rw / 2, rh / 2, 0, 0, TAU); g.fill();
      }
    }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(55,95,50,0.06)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 24, 0, TAU); g.fill(); }
  }, 256, 256, 12, 12);
  // 窗戶：鐵欄窗（牢房）／玻璃窗／破窗／木板窗，亮的版本用 emissiveMap 發光
  const winCache = {};
  const winMat = (kind) => {
    if (winCache[kind]) return winCache[kind];
    const lit = kind === 'barLit' || kind === 'glassLit' || kind === 'glassGreen';
    const t = mkTex((g, w, h) => {
      g.fillStyle = '#2a2825'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 8, 0, h - 8);
      if (kind === 'barLit') { gr.addColorStop(0, '#ffd27a'); gr.addColorStop(1, '#b8741f'); }
      else if (kind === 'glassLit') { gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(1, '#9a5f1a'); }
      else if (kind === 'glassGreen') { gr.addColorStop(0, '#8dff9a'); gr.addColorStop(1, '#1e7a35'); }
      else { gr.addColorStop(0, '#12171a'); gr.addColorStop(1, '#070909'); }
      g.fillStyle = gr; g.fillRect(8, 8, w - 16, h - 16);
      if (kind === 'barLit' || kind === 'barDark') {
        g.fillStyle = '#121211';
        for (let x = 16; x < w - 8; x += 12) g.fillRect(x, 8, 4, h - 16);
        g.fillRect(8, h * 0.45, w - 16, 5);
      } else if (kind === 'broken') {
        g.fillStyle = '#4b5a58';
        for (let i = 0; i < 5; i++) { g.beginPath(); const x = 10 + Math.random() * (w - 20), y = 10 + Math.random() * (h - 20); g.moveTo(x, y); g.lineTo(x + 10 + Math.random() * 14, y + 4); g.lineTo(x + 4, y + 14 + Math.random() * 16); g.fill(); }
      } else if (kind === 'boarded') {
        g.fillStyle = '#4a3a28';
        g.save(); g.translate(w / 2, h / 2); g.rotate(0.35); g.fillRect(-w, -8, w * 2, 14); g.rotate(-0.7); g.fillRect(-w, -4, w * 2, 14); g.restore();
        g.fillStyle = '#6b5538'; g.fillRect(10, h * 0.2, w - 20, 12);
      } else {
        g.fillStyle = '#25231f'; g.fillRect(w / 2 - 2, 8, 4, h - 16); g.fillRect(8, h * 0.42, w - 16, 4);
      }
    }, 64, 96, 1);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
    if (lit) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = 0.28; }
    winCache[kind] = m;
    return m;
  };
  // 招牌、海報、時鐘、壓力錶
  const textCache = {};
  const signMat = (text, bg, fg) => {
    const key = text + bg + fg;
    if (textCache[key]) return textCache[key];
    const t = mkTex((g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(Math.random() * w, Math.random() * h, 3, 2); }
      g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = fg; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
      g.fillStyle = 'rgba(120,70,30,0.35)'; g.fillRect(w * 0.7, 0, 10, h);   // 鏽水
    }, 256, 96, 1);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, metalness: 0.3 });
    textCache[key] = m;
    return m;
  };
  const clockMat = (() => {
    const t = mkTex((g, w, h) => {
      g.fillStyle = '#d8cfae'; g.beginPath(); g.arc(128, 128, 120, 0, TAU); g.fill();
      g.strokeStyle = '#2a2520'; g.lineWidth = 8; g.stroke();
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; g.lineWidth = 6; g.beginPath(); g.moveTo(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); g.lineTo(128 + Math.sin(a) * 112, 128 - Math.cos(a) * 112); g.stroke(); }
      g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(2.1) * 62, 128 - Math.cos(2.1) * 62); g.stroke();   // 停擺的指針
      g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(5.2) * 90, 128 - Math.cos(5.2) * 90); g.stroke();
      g.fillStyle = 'rgba(70,50,30,0.35)'; g.fillRect(0, 150, 256, 106);
    }, 256, 256, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  })();
  const gaugeMat = (() => {
    const t = mkTex((g, w, h) => {
      g.fillStyle = '#d9d2b6'; g.beginPath(); g.arc(64, 64, 58, 0, TAU); g.fill();
      g.fillStyle = '#b3402f'; g.beginPath(); g.arc(64, 64, 52, -0.3, 0.9); g.lineTo(64, 64); g.fill();     // 危險區
      g.fillStyle = '#d9d2b6'; g.beginPath(); g.arc(64, 64, 40, 0, TAU); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 30, 64 - 22); g.stroke();
    }, 128, 128, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  })();
  const railTex = mkTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2a2d2a'; g.fillRect(0, 4, w, 5); g.fillRect(0, h / 2, w, 3);
    for (let x = 4; x < w; x += 12) g.fillRect(x, 4, 3, h - 4);
  }, 128, 32, 1);
  const chainTex = mkTex((g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#5a5e5a'; g.lineWidth = 2;
    for (let i = -h; i < w + h; i += 12) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke(); }
  }, 64, 64, 1);

  // ---------- 材質 ----------
  const wallMats = [0x9c968e, 0x8f8982, 0x837e77].map(c => new THREE.MeshStandardMaterial({ map: brickTex, color: c, roughness: 1 }));
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, color: 0xffffff, roughness: 0.6, metalness: 0.5 });
  const plateRustMat = new THREE.MeshStandardMaterial({ map: plateTex, color: 0x8a6a56, roughness: 0.8, metalness: 0.35 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a4a44, roughness: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ color: ZAUN.iron, roughness: 0.55, metalness: 0.75 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.8, metalness: 0.4 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x7a6430, roughness: 0.4, metalness: 0.8 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.5, metalness: 0.7 });
  const verdiMat = new THREE.MeshStandardMaterial({ color: 0x3a5a4e, roughness: 0.7, metalness: 0.4 });   // 銅綠
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0b, roughness: 1, side: THREE.DoubleSide });
  const chemGlowMat = new THREE.MeshStandardMaterial({ color: ZAUN.chemGreenDim, emissive: ZAUN.chemGreen, emissiveIntensity: 0.55, roughness: 0.4 });
  const amberGlowMat = new THREE.MeshStandardMaterial({ color: 0x6a5018, emissive: ZAUN.amber, emissiveIntensity: 0.5, roughness: 0.5 });
  const shimmerGlowMat = new THREE.MeshStandardMaterial({ color: 0x4a2080, emissive: ZAUN.shimmer, emissiveIntensity: 1.1, roughness: 0.4 });
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xaab5a8, transparent: true, opacity: 0.16, depthWrite: false });

  // ---------- 小工具 ----------
  const uvBox = (w, h, d) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return g;
  };
  const put = (geo, mat, x, y, z, parent, shadow) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    (parent || G).add(m);
    return m;
  };
  const bx = (w, h, d, mat, x, y, z, parent) => put(uvBox(w, h, d), mat, x, y, z, parent);
  const cyl = (r1, r2, h, mat, x, y, z, parent, seg) => put(new THREE.CylinderGeometry(r1, r2, h, seg || 10), mat, x, y, z, parent);
  const steam = (x, y, z, s, parent) => {   // 漏出的蒸氣：幾顆半透明球疊成一團
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(s * rnd(0.5, 1), 8, 6), steamMat);
      m.position.set(rnd(-s, s) * 0.5, i * s * 0.7, rnd(-s, s) * 0.5);
      g.add(m);
    }
    (parent || G).add(g);
  };
  const gearGeo = (R, teeth, thick) => {
    const sh = new THREE.Shape();
    const wdt = TAU / teeth;
    for (let j = 0; j < teeth; j++) {
      const a0 = j * wdt;
      [[R * 0.84, 0], [R, 0.14], [R, 0.5], [R * 0.84, 0.64]].forEach(([r, f], k) => {
        const a = a0 + f * wdt;
        (j === 0 && k === 0) ? sh.moveTo(Math.cos(a) * r, Math.sin(a) * r) : sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      });
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.28, 0, TAU, true); sh.holes.push(hole);
    for (let k = 0; k < 4; k++) {   // 輪輻：以洞口外的小洞鏤空
      const p = new THREE.Path(); const a = k / 4 * TAU + 0.4;
      p.absarc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.16, 0, TAU, true); sh.holes.push(p);
    }
    return new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  };

  // ---------- 地面：濕鵝卵石路＋排水格柵＋人孔蓋＋裂痕＋綠色積水 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x3a392f, roughness: 0.62 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  G.add(ground);
  const crackMat = new THREE.MeshStandardMaterial({ color: 0x151815, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const c = put(new THREE.BoxGeometry(0.06 + Math.random() * 0.05, 0.01, 1 + Math.random() * 3.2), crackMat, rnd(-22, 22), 0.02, rnd(-20, 20), G, false);
    c.rotation.y = Math.random() * Math.PI;
  }
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x0a2a14, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.8, depthWrite: false });
  for (let i = 0; i < 5; i++) {
    const p = put(new THREE.CircleGeometry(0.5 + Math.random() * 1.1, 10), puddleMat, rnd(-13, 13), 0.015, rnd(-12, 14), G, false);
    p.rotation.x = -Math.PI / 2;
  }
  // 自然廢墟地面：素色泥土＋大塊碎裂的舊鋪面＋泥濘／青苔斑＋雜草叢（不貼圖，避免花）
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x4a4a42, roughness: 1 });
  const dirtMats = [0x302e26, 0x45422f, 0x34372a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }));
  for (let i = 0; i < 16; i++) {          // 泥濘／苔蘚大斑塊（貼地的壓扁圓盤）
    const p = put(new THREE.CircleGeometry(rnd(1.5, 4.2), 12), dirtMats[i % 3], rnd(-14, 14), 0.012 + i * 0.0004, rnd(-14, 16), G, false);
    p.rotation.set(-Math.PI / 2, 0, rnd(0, 3)); p.scale.set(1, rnd(0.5, 0.9), 1);
  }
  for (let i = 0; i < 24; i++) {          // 碎裂翹起的舊鋪面石板
    const sx = rnd(-12, 12), sz = rnd(-12, 15);
    if (Math.hypot(sx, sz) < 6) continue;
    const sl = put(new THREE.BoxGeometry(rnd(0.8, 2.2), rnd(0.08, 0.2), rnd(0.8, 1.8)), slabMat, sx, 0.05, sz, G);
    sl.rotation.set(rnd(-0.12, 0.12), rnd(0, 3), rnd(-0.12, 0.12));
  }
  const weedMats = [0x3a4630, 0x44503a, 0x4f4e38, 0x30392a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  for (let i = 0; i < 150; i++) {         // 雜草叢（長在石板縫與牆根）
    const wx = rnd(-14, 14), wz = rnd(-15, 17);
    if (Math.hypot(wx, wz) < 5) continue;
    const w = put(new THREE.ConeGeometry(rnd(0.05, 0.1), rnd(0.35, 0.9), 4), weedMats[i % 4], wx, 0.2, wz, G, false);
    w.rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
  }
  for (let i = 0; i < 18; i++) {          // 較大的灌木與蔓生團塊，主要靠牆邊
    const side = Math.random() < 0.5 ? -1 : 1;
    const b = put(new THREE.IcosahedronGeometry(rnd(0.4, 0.9), 1), weedMats[i % 4], side * rnd(7.2, 8.3), rnd(0.2, 0.4), rnd(-18, 17), G, false);
    b.scale.set(1.1, rnd(0.5, 0.9), 1.1);
  }
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x151716, roughness: 0.6, metalness: 0.6 });
  [[-4, 6], [5, -3], [-2, -9], [3, 12]].forEach(([gx, gz]) => {      // 排水格柵
    bx(1.1, 0.04, 0.7, grateMat, gx, 0.03, gz);
    for (let k = -2; k <= 2; k++) bx(0.03, 0.05, 0.7, ironMat, gx + k * 0.2, 0.05, gz);
  });
  [[0, 2], [-5, -6]].forEach(([mx, mz]) => {                        // 人孔蓋＋漏出的蒸氣
    cyl(0.55, 0.55, 0.06, plateMat, mx, 0.04, mz, G, 16);
    steam(mx, 0.3, mz, 0.5);
  });

  // ---------- 街區建築：牢房棟（鐵欄窗＋鐵走廊）／出租屋／工廠（鍋爐） ----------
  const signTexts = [['CELL BLOCK C', '#2d3a30', '#d6c98a'], ['WARDEN', '#3a2a24', '#d8b078'], ['BOILER WORKS', '#2a2f33', '#c98a4a'], ['RATIONS', '#33302a', '#d4cfa0'], ['NO ENTRY', '#4a2424', '#e0d8c0'], ['SECTOR 7', '#26302e', '#9ad0a8']];
  const grafColors = [0x8a2a3a, 0x2a6a4a, 0x6a4a8a, 0xa06a20];

  function addBuilding(cx, cz, fw, bd, h, rotY, style) {
    const grp = new THREE.Group();
    grp.position.set(cx, 0, cz);
    grp.rotation.y = rotY;
    G.add(grp);
    const wm = pick(wallMats);
    const fz = bd / 2;
    const vineMat = weedMats[1], vineDark = weedMats[3];
    // 主體分成三段柱體，高度參差＝上部大面積坍塌，頂端斷口鋸齒狀
    const NC = 3, cw = fw / NC, colH = [];
    for (let k = 0; k < NC; k++) colH.push(h * rnd(0.42, 0.95));
    colH[Math.floor(Math.random() * NC)] = h;
    for (let k = 0; k < NC; k++) {
      const ch = colH[k], ox = (k - (NC - 1) / 2) * cw;
      bx(cw, ch, bd, wm, ox, ch / 2, 0, grp);
      bx(cw + 0.05, 1.0, bd + 0.2, stoneMat, ox, 0.5, 0, grp);               // 石基座
      if (ch >= h * 0.97) bx(cw + 0.3, 0.4, bd + 0.5, stoneMat, ox, ch + 0.2, 0, grp).rotation.z = rnd(-0.03, 0.03);   // 殘存的簷口
      else {
        for (let j = 0; j < 3; j++) {                                          // 斷口：鋸齒殘磚
          const jh = rnd(0.3, 1.5), jw = cw * rnd(0.15, 0.4);
          bx(jw, jh, bd * rnd(0.4, 0.95), wm, ox + rnd(-cw / 2 + jw / 2, cw / 2 - jw / 2), ch + jh / 2 - 0.05, rnd(-0.3, 0.3), grp).rotation.z = rnd(-0.2, 0.2);
        }
        const fl = Math.max(2.7, Math.floor(ch / 2.7) * 2.7);                  // 樓板外露、垂掛下來
        const slab = bx(cw * 0.95, 0.16, bd * 0.8, plateRustMat, ox, fl - 0.1, fz * 0.2, grp);
        slab.rotation.x = rnd(0.05, 0.35); slab.position.z += rnd(0.1, 0.6);
        for (let j = 0; j < 3; j++) cyl(0.025, 0.025, rnd(0.8, 2.2), rustMat, ox + rnd(-cw / 2, cw / 2), ch + rnd(0.2, 0.9), rnd(-bd / 3, bd / 3), grp, 4).rotation.z = rnd(-0.3, 0.3);   // 外露鋼筋
      }
      // 窗戶：只放在還存在的牆段；大多破損或釘死，極少數仍亮燈
      const nC = Math.max(1, Math.floor(cw / 2.0));
      const deadKinds = style === 'cell' ? ['barDark', 'barDark', 'broken'] : ['glassDark', 'broken', 'broken', 'boarded', 'boarded'];
      for (let r = 0; 2.3 + r * 2.7 < ch - 1.2; r++) {
        for (let c = 0; c < nC; c++) {
          if (Math.random() < 0.18) continue;                                  // 整扇窗連牆一起掉了
          const wx = ox + (c - (nC - 1) / 2) * (cw / nC);
          put(new THREE.PlaneGeometry(1.1, 1.6), winMat(Math.random() < 0.06 ? (style === 'cell' ? 'barLit' : 'glassLit') : pick(deadKinds)), wx, 2.3 + r * 2.7, fz + 0.03, grp, false);
          bx(1.4, 0.12, 0.3, stoneMat, wx, 2.3 + r * 2.7 - 0.9, fz + 0.1, grp).rotation.z = rnd(-0.1, 0.1);
        }
      }
      // 鐵走廊：段落殘缺、傾斜垂掛
      if (style === 'cell') {
        for (let r = 0; 1.4 + r * 2.7 < ch - 2; r++) {
          if (Math.random() < 0.3) continue;
          const y = 1.45 + r * 2.7;
          const deck = bx(cw, 0.12, 1.0, plateRustMat, ox, y, fz + 0.5, grp);
          const rail = put(new THREE.PlaneGeometry(cw, 1.0), new THREE.MeshBasicMaterial({ map: railTex.clone(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x9a8a7a }), ox, y + 0.55, fz + 1.0, grp, false);
          rail.material.map.needsUpdate = true; rail.material.map.repeat.set(cw / 4, 1);
          if (Math.random() < 0.45) { const t = rnd(0.12, 0.4) * (Math.random() < 0.5 ? 1 : -1); deck.rotation.z = t; deck.position.y -= Math.abs(t) * cw * 0.25; rail.rotation.z = t; rail.position.y -= Math.abs(t) * cw * 0.25; }
        }
      }
    }
    // 門：只剩黑洞洞的門口，鐵門半開歪掛
    const dxo = rnd(-fw / 4, fw / 4);
    bx(1.5, 2.4, 0.2, darkMat, dxo, 1.2 + 0.5, fz + 0.08, grp);
    if (Math.random() < 0.6) {
      const hinge = new THREE.Group(); hinge.position.set(dxo - 0.75, 1.7, fz + 0.2); hinge.rotation.y = -rnd(0.7, 1.4);
      const dm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.3, 0.1), style === 'cell' ? plateRustMat : rustMat); dm.position.x = 0.75; dm.castShadow = true; hinge.add(dm); grp.add(hinge);
    }
    // 外牆管線：斷裂、短缺，管箍留幾個
    [-1, 1].forEach(s => {
      const px = s * (fw / 2 - 0.35), ph = (h + 1) * rnd(0.35, 1.0);
      cyl(0.12, 0.12, ph, Math.random() < 0.5 ? rustMat : verdiMat, px, ph / 2, fz + 0.2, grp, 7);
      for (let y = 1.8; y < ph; y += 3) { const col = put(new THREE.TorusGeometry(0.17, 0.035, 5, 10), ironMat, px, y, fz + 0.2, grp); col.rotation.x = Math.PI / 2; }
      if (Math.random() < 0.5) steam(px, ph + 0.1, fz + 0.2, 0.3, grp);
    });
    // 牆面大破洞與裂縫、塗鴉
    for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) {
      const pts = [], n = 9, sz = rnd(0.8, 1.9);
      for (let k = 0; k < n; k++) { const a = k / n * TAU, rr = sz * rnd(0.5, 1.1); pts.push(new THREE.Vector2(Math.cos(a) * rr * 1.1, Math.sin(a) * rr * 0.9)); }
      put(new THREE.ShapeGeometry(new THREE.Shape(pts)), darkMat, rnd(-fw / 2 + 1.2, fw / 2 - 1.2), rnd(2.0, Math.max(2.5, h * 0.6)), fz + 0.07 + i * 0.003, grp, false);
    }
    for (let i = 0; i < 4; i++) {            // 斜向龜裂
      const cr = put(new THREE.BoxGeometry(rnd(1.2, 3.0), 0.05, 0.02), darkMat, rnd(-fw / 2 + 1, fw / 2 - 1), rnd(1.5, h - 1), fz + 0.06, grp, false);
      cr.rotation.z = rnd(-1.2, 1.2);
    }
    if (Math.random() < 0.6) {
      const gr = put(new THREE.PlaneGeometry(rnd(0.8, 1.8), rnd(0.6, 1.2)), new THREE.MeshStandardMaterial({ color: pick(grafColors), roughness: 0.9, transparent: true, opacity: 0.7 }), rnd(-fw / 2 + 1, fw / 2 - 1), rnd(1.2, 2.2), fz + 0.06, grp, false);
      gr.rotation.z = rnd(-0.2, 0.2);
    }
    // 招牌：半脫落、傾斜
    if (Math.random() < 0.6) {
      const [txt, bg, fg] = pick(signTexts);
      const sg = new THREE.Group(); sg.position.set(rnd(-fw / 3, fw / 3), Math.min(4.8, colH[1] - 1), fz + 0.9); sg.rotation.z = rnd(-0.7, 0.7);
      put(new THREE.PlaneGeometry(2.4, 0.9), signMat(txt, bg, fg), 0, 0, 0, sg, false).material.side = THREE.DoubleSide;
      cyl(0.02, 0.02, 1.0, ironMat, 1.0, 0.8, 0, sg, 4);
      grp.add(sg);
    }
    // 屋頂：水塔歪倒、煙囪斷半
    if (Math.random() < 0.45) {
      const tg = new THREE.Group(); tg.position.set(rnd(-fw / 4, fw / 4), colH[1] + 0.4, rnd(-bd / 4, bd / 4)); tg.rotation.z = rnd(-0.35, 0.35); tg.rotation.x = rnd(-0.2, 0.2);
      cyl(1.0, 1.0, 1.7, plateRustMat, 0, 1.45, 0, tg, 14);
      cyl(0.01, 1.15, 0.6, rustMat, 0, 2.6, 0, tg, 14);
      [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].forEach(([lx, lz]) => bx(0.1, Math.random() < 0.5 ? 1.2 : 0.6, 0.1, ironMat, lx, 0.6, lz, tg));
      grp.add(tg);
    }
    for (let i = 0; i < 1 + Math.floor(Math.random() * 2); i++) {
      const k = Math.floor(Math.random() * NC), ox = (k - (NC - 1) / 2) * cw, sh = rnd(1.0, 2.4);
      bx(0.8, sh, 0.8, wm, ox + rnd(-cw / 4, cw / 4), colH[k] + sh / 2, rnd(-bd / 3, bd / 3), grp).rotation.z = rnd(-0.15, 0.15);
    }
    // 荒蕪：藤蔓團塊爬滿外牆、垂掛藤條、屋頂與斷口長草、牆根灌木
    for (let i = 0; i < 18; i++) {
      const k = Math.floor(Math.random() * NC), ox = (k - (NC - 1) / 2) * cw;
      const v = put(new THREE.IcosahedronGeometry(rnd(0.25, 0.6), 0), Math.random() < 0.5 ? vineMat : vineDark, ox + rnd(-cw / 2, cw / 2), rnd(0.6, colH[k]), fz + 0.12, grp, false);
      v.scale.set(rnd(0.9, 1.8), rnd(0.9, 2.4), 0.45);
    }
    for (let i = 0; i < 6; i++) {
      const k = Math.floor(Math.random() * NC), ox = (k - (NC - 1) / 2) * cw, vl = rnd(1.5, 4.0);
      bx(rnd(0.08, 0.2), vl, 0.05, vineDark, ox + rnd(-cw / 2, cw / 2), colH[k] - vl / 2, fz + 0.1, grp);
    }
    for (let k = 0; k < NC; k++) {
      const ox = (k - (NC - 1) / 2) * cw;
      for (let j = 0; j < 3; j++) {
        const m = put(new THREE.IcosahedronGeometry(rnd(0.3, 0.7), 0), Math.random() < 0.5 ? vineMat : weedMats[0], ox + rnd(-cw / 2, cw / 2), colH[k] + rnd(0.05, 0.5), rnd(-bd / 3, bd / 3), grp, false);
        m.scale.set(1.4, 0.5, 1.2);
      }
    }
    for (let i = 0; i < 5; i++) {
      const bsh = put(new THREE.IcosahedronGeometry(rnd(0.5, 1.0), 1), pick(weedMats), rnd(-fw / 2, fw / 2), rnd(0.25, 0.5), fz + rnd(0.5, 1.6), grp, false);
      bsh.scale.set(1.2, rnd(0.5, 0.9), 1.2);
    }
    // 牆腳瓦礫堆：磚塊、碎牆塊、斷梁
    for (let i = 0; i < 12; i++) {
      const rb = put(new THREE.DodecahedronGeometry(rnd(0.2, 0.55), 0), pick(wallMats), rnd(-fw / 2, fw / 2), 0.2, fz + rnd(0.4, 2.2), grp);
      rb.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }
    for (let i = 0; i < 4; i++) {
      const bm = bx(rnd(1.2, 2.6), 0.14, 0.16, rustMat, rnd(-fw / 2, fw / 2), 0.2, fz + rnd(0.5, 2.0), grp);
      bm.rotation.set(rnd(-0.2, 0.2), rnd(0, 3), rnd(-0.2, 0.2));
    }
    addContactShadow(grp, 0, fz + 0.8, fw + 2.5, 3.4, 0.55);
    return { grp, fw, bd, h, fz };
  }

  // 街道兩側：留 |x|<8.8 給生物活動
  [-1, 1].forEach(s => {
    [-18, -11.6, -5.2, 1.2, 7.6, 14].forEach((z, i) => {
      const bd = rnd(5.2, 7), h = rnd(8, 15.5) + (Math.abs(z) < 3 ? 0 : 1.5);
      const style = (i + (s > 0 ? 1 : 0)) % 3 === 0 ? 'factory' : (i + (s > 0 ? 0 : 1)) % 2 === 0 ? 'cell' : 'tenement';
      const b = addBuilding(s * (8.8 + bd / 2), z, 6.2, bd, h, s < 0 ? Math.PI / 2 : -Math.PI / 2, style);
      if (style === 'factory') {   // 鍋爐：橫躺的鉚釘圓筒＋壓力錶＋閥門＋蒸氣
        const g = b.grp;
        const tank = cyl(1.0, 1.0, 5.4, plateRustMat, 0, 1.25, b.fz + 1.3, g, 18);
        tank.rotation.z = Math.PI / 2;
        [-2, 0, 2].forEach(tx => { const ring = put(new THREE.TorusGeometry(1.03, 0.07, 6, 18), brassMat, tx, 1.25, b.fz + 1.3, g); ring.rotation.y = Math.PI / 2; });
        const gauge = put(new THREE.CircleGeometry(0.28, 14), gaugeMat, 1.2, 1.9, b.fz + 2.31, g, false);
        put(new THREE.TorusGeometry(0.3, 0.05, 5, 14), brassMat, 1.2, 1.9, b.fz + 2.31, g);
        const valve = put(new THREE.TorusGeometry(0.28, 0.04, 5, 12), copperMat, -1.2, 2.45, b.fz + 1.3, g); valve.rotation.x = Math.PI / 2;
        steam(-1.2, 2.6, b.fz + 1.3, 0.35, g);
        cyl(0.18, 0.18, 1.0, copperMat, -1.2, 2.2, b.fz + 1.3, g, 8);
      }
    });
  });

  // ---------- 外圍與遠景：監獄圍牆（鐵門＋瞭望塔＋鐵絲網＋探照燈）、天際線、煙囪 ----------
  const WZ = -24;   // 圍牆所在 z
  // 圍牆：左右兩段實牆，中間留拱門
  [-1, 1].forEach(s => {
    bx(30, 10, 1.8, wallMats[0], s * 19, 5, WZ);
    bx(30.4, 0.5, 2.2, stoneMat, s * 19, 10.25, WZ);
    for (let k = 0; k < 6; k++) bx(0.25, 10, 2.0, plateMat, s * (5 + k * 5.4), 5, WZ + 0.05);   // 鐵扶壁
  });
  bx(8, 3.2, 1.8, wallMats[0], 0, 8.4, WZ);                          // 門楣
  bx(8.4, 0.5, 2.2, stoneMat, 0, 10.25, WZ);
  const gateGlow = put(new THREE.PlaneGeometry(6, 6.8), amberGlowMat, 0, 3.4, WZ - 0.4, G, false);
  for (let k = -5; k <= 5; k++) cyl(0.07, 0.07, 6.8, ironMat, k * 0.55, 3.4, WZ + 0.4, G, 6);   // 鐵閘柵欄
  [2.0, 4.4, 6.4].forEach(y => bx(6.2, 0.14, 0.2, ironMat, 0, y, WZ + 0.45));
  for (let k = -5; k <= 5; k++) cyl(0.0, 0.1, 0.35, ironMat, k * 0.55, 6.9, WZ + 0.4, G, 4);   // 矛尖
  put(new THREE.PlaneGeometry(5.0, 1.6), signMat('NO RETURN', '#2a2420', '#c9a860'), 0, 8.7, WZ + 1.0, G, false);
  const gateLight = new THREE.PointLight(0xffb347, 0.9, 20, 2);
  gateLight.position.set(0, 3.5, WZ + 2);
  G.add(gateLight);
  sinsLamps.push({ light: gateLight, bulbMat: amberGlowMat, base: 0.9 });
  // 瞭望塔：門兩側圓塔＋角落木樁塔，頂有探照燈光錐
  const cone = (x, y, z, len, rotX, rotZ, col) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rotX, 0, rotZ);
    const m = new THREE.Mesh(new THREE.ConeGeometry(len * 0.32, len, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: col || 0xffe9a8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    m.position.y = -len / 2;
    g.add(m); G.add(g);
  };
  [-1, 1].forEach(s => {
    cyl(2.0, 2.3, 13, wallMats[0], s * 7.4, 6.5, WZ + 0.3, G, 14);
    cyl(2.6, 2.6, 0.5, stoneMat, s * 7.4, 13.2, WZ + 0.3, G, 14);
    cyl(0.01, 2.8, 2.2, copperMat, s * 7.4, 14.6, WZ + 0.3, G, 14);
    for (let k = 0; k < 3; k++) put(new THREE.PlaneGeometry(0.7, 1.1), winMat(k === 1 ? 'barLit' : 'barDark'), s * 7.4 + Math.sin(k - 1) * 0.0, 5 + k * 2.6, WZ + 2.5, G, false);
    cone(s * 7.4, 13.4, WZ + 1.5, 20, 0.9, s * 0.35, 0xffe9a8);
  });
  [-1, 1].forEach(s => {                                             // 角落木製瞭望塔
    const tx = s * 27, tz = WZ + 4;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { const leg = bx(0.3, 10, 0.3, rustMat, tx + a * 1.4, 5, tz + b * 1.4); leg.rotation.z = -a * 0.04; });
    bx(3.6, 0.3, 3.6, plateMat, tx, 9.8, tz);
    bx(3.2, 1.8, 3.2, wallMats[1], tx, 10.95, tz);
    put(new THREE.PlaneGeometry(2.0, 0.7), winMat('barLit'), tx, 11.0, tz + 1.62, G, false);
    bx(4.0, 0.25, 4.0, ironMat, tx, 12.0, tz);
    cone(tx, 11.8, tz + 1.8, 22, 0.7, -s * 0.5, 0xfff0c0);
  });
  // 倒刺鐵絲網：沿圍牆頂的螺旋
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x23221f, roughness: 0.6, metalness: 0.7 });
  [[-34, -10], [10, 34]].forEach(([x0, x1]) => {
    const pts = [];
    for (let t = 0; t <= 1; t += 1 / 140) pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, 10.9 + Math.sin(t * 90) * 0.35, WZ + Math.cos(t * 90) * 0.35));
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 200, 0.04, 4), wireMat, 0, 0, 0, G, false);
  });
  // 內側鐵柵欄＋鏈條網：守衛區與街道的分隔線（z=-17，留中間通道）
  [-1, 1].forEach(s => {
    const fx = s * 15.5, fl = 21;
    for (let k = 0; k < 14; k++) { cyl(0.05, 0.05, 2.4, ironMat, s * (5 + k * 1.5), 1.2, -17, G, 5); cyl(0.0, 0.08, 0.25, ironMat, s * (5 + k * 1.5), 2.5, -17, G, 4); }
    bx(fl, 0.08, 0.1, ironMat, fx, 2.2, -17); bx(fl, 0.08, 0.1, ironMat, fx, 0.4, -17);
    const net = put(new THREE.PlaneGeometry(fl, 1.4), new THREE.MeshBasicMaterial({ map: chainTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), fx, 3.3, -17, G, false);
    net.material.map.repeat.set(fl / 0.8, 2);
  });
  // 守衛亭＋沙包
  bx(2.4, 2.6, 2.2, plateRustMat, -4.5, 1.3, -14.5);
  bx(2.8, 0.25, 2.6, ironMat, -4.5, 2.7, -14.5);
  put(new THREE.PlaneGeometry(1.4, 0.9), winMat('glassLit'), -4.5, 1.7, -13.38, G, false);
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x5a5240, roughness: 1 });
  for (let k = 0; k < 6; k++) { const sb = bx(0.9, 0.35, 0.5, sandMat, -3.0 + k * 0.45 - 1.2 + (k % 2) * 0.2, 0.2 + Math.floor(k / 3) * 0.33, -12.8); sb.rotation.y = rnd(-0.1, 0.1); }
  // 遠景天際線：高樓剪影＋亮窗＋大煙囪冒煙＋時鐘塔
  const backMat = new THREE.MeshStandardMaterial({ color: 0x151c18, roughness: 1 });
  for (let i = -5; i <= 5; i++) {
    const bw = 7 + Math.random() * 4, bh = 15 + Math.random() * 11;
    const b = bx(bw, bh, 4, backMat, i * 8.6 + rnd(-1.5, 1.5), bh / 2, WZ - 6 - Math.random() * 5);
    for (let k = 0; k < 7; k++) {
      if (Math.random() < 0.4) continue;
      put(new THREE.PlaneGeometry(0.6, 0.9), Math.random() < 0.6 ? chemGlowMat : amberGlowMat, b.position.x + rnd(-bw / 2 + 1, bw / 2 - 1), rnd(2, bh - 1.5), b.position.z + 2.03, G, false);
    }
  }
  const ct = bx(3.6, 26, 3.6, wallMats[2], 14, 13, WZ - 12);                  // 時鐘塔
  put(new THREE.CircleGeometry(1.4, 24), clockMat, 14, 22, WZ - 12 + 1.82, G, false);
  put(new THREE.TorusGeometry(1.45, 0.12, 6, 24), brassMat, 14, 22, WZ - 12 + 1.82, G);
  cyl(0.0, 2.8, 4, copperMat, 14, 28, WZ - 12, G, 4).rotation.y = Math.PI / 4;
  [[-16, -34], [-26, -30], [24, -33], [4, -38]].forEach(([sx, sz], i) => {
    const stackH = 14 + i * 3;
    cyl(1.0, 1.4, stackH, rustMat, sx, stackH / 2, sz, G, 10);
    const rim = put(new THREE.TorusGeometry(1.05, 0.12, 6, 12), ironMat, sx, stackH, sz); rim.rotation.x = Math.PI / 2;
    const sm = put(new THREE.ConeGeometry(2.0, 6, 8), new THREE.MeshBasicMaterial({ color: ZAUN.smoke, transparent: true, opacity: 0.12, depthWrite: false }), sx + 0.6, stackH + 3.4, sz, G, false);
    sm.rotation.z = 0.25;
  });
  // 兩側遠景樓牆：封住場景邊緣
  [-1, 1].forEach(s => {
    for (let k = 0; k < 6; k++) {
      const hh = rnd(14, 24);
      const b = bx(6, hh, 7, backMat, s * rnd(28, 31), hh / 2, -22 + k * 9);
      for (let w = 0; w < 4; w++) if (Math.random() < 0.6) put(new THREE.PlaneGeometry(0.6, 0.9), Math.random() < 0.5 ? chemGlowMat : amberGlowMat, b.position.x - s * 3.03, rnd(2, hh - 1.5), b.position.z + rnd(-2.5, 2.5), G, false).rotation.y = -s * Math.PI / 2;
    }
  });
  for (let k = -3; k <= 3; k++) bx(8, rnd(14, 22), 6, backMat, k * 9, 9, 33);   // 鏡頭後方

  // ---------- 蒸氣龐克機械：齒輪、管橋、閥門、壓力錶、吊籠 ----------
  const gearAt = (x, y, z, R, mat, rotY, teeth) => {
    const gm = put(gearGeo(R, teeth || 14, 0.35), mat, x, y, z, G);
    gm.rotation.y = rotY; return gm;
  };
  gearAt(-8.75, 7.5, -8.5, 1.8, brassMat, Math.PI / 2, 14);
  gearAt(-8.75, 5.0, -7.4, 1.0, ironMat, Math.PI / 2, 10);
  gearAt(8.7, 8.5, 3, 2.2, brassMat, -Math.PI / 2, 16);
  gearAt(8.7, 6.2, 5.0, 1.2, copperMat, -Math.PI / 2, 10);
  gearAt(8.7, 10.5, -6, 1.5, ironMat, -Math.PI / 2, 12);
  // 頭頂管橋（沿用原結構）：粗管＋兩側 A 架，另加閥門輪與壓力錶、漏蒸氣
  [-2, 9].forEach((pz, idx) => {
    for (let k = 0; k < 3; k++) {
      const cross = cyl(0.22, 0.22, 22, k === 1 ? verdiMat : rustMat, 0, 6.5 + idx * 1.6 + k * 0.55, pz, G, 9);
      cross.rotation.z = Math.PI / 2;
      if (k === 0) { const col = put(new THREE.TorusGeometry(0.28, 0.05, 5, 12), brassMat, -5 + idx * 3, 6.5 + idx * 1.6, pz, G); col.rotation.y = Math.PI / 2; }
    }
    [-8, 8].forEach(sx => {
      const legL = bx(0.12, 6.5, 0.12, ironMat, sx - 0.8, 3.25, pz); legL.rotation.z = 0.12;
      const legR = bx(0.12, 6.5, 0.12, ironMat, sx + 0.8, 3.25, pz); legR.rotation.z = -0.12;
      bx(2.2, 0.1, 0.1, ironMat, sx, 5.2, pz);
    });
    const v = put(new THREE.TorusGeometry(0.4, 0.05, 6, 14), copperMat, 4.5, 8.4 + idx * 1.6, pz + 0.3, G); v.rotation.x = Math.PI / 2;   // 閥門輪
    cyl(0.04, 0.04, 0.8, brassMat, 4.5, 8.0 + idx * 1.6, pz + 0.3, G, 5);
    put(new THREE.CircleGeometry(0.3, 14), gaugeMat, -4.2, 7.0 + idx * 1.6, pz + 0.24, G, false);
    steam(6.5, 6.9 + idx * 1.6, pz, 0.4);
  });
  // 吊籠與鎖鏈：掛在管橋上（囚籠）
  [[-6.5, -2], [7, 9]].forEach(([cx, cz]) => {
    const cage = new THREE.Group(); cage.position.set(cx, 3.2, cz); cage.rotation.y = rnd(0, 3);
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; cyl(0.03, 0.03, 1.8, ironMat, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55, cage, 4); }
    [-0.9, 0, 0.9].forEach(y => { const r = put(new THREE.TorusGeometry(0.56, 0.03, 4, 14), ironMat, 0, y, 0, cage); r.rotation.x = Math.PI / 2; });
    cyl(0.01, 0.6, 0.4, ironMat, 0, 1.0, 0, cage, 8);
    G.add(cage);
    for (let k = 0; k < 9; k++) { const l = put(new THREE.TorusGeometry(0.07, 0.016, 4, 8), ironMat, cx, 4.5 + k * 0.28, cz, G, false); l.rotation.set(k % 2 ? 0 : Math.PI / 2, 0, 0); }
  });
  // 晾衣線與電線：橫跨街道的下垂線，掛幾塊破布
  [[-9, 4, 9, 5.3, -10], [-9, 6, 9, 6.6, 6]].forEach(([x0, y0, x1, y1, z]) => {
    const pts = [];
    for (let t = 0; t <= 1; t += 0.05) pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 1.1, z));
    put(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.02, 4), wireMat, 0, 0, 0, G, false);
    for (let k = 0; k < 4; k++) {
      const t = rnd(0.15, 0.85), c = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.4, 0.8), rnd(0.6, 1.1)), new THREE.MeshStandardMaterial({ color: pick([0x4a4a42, 0x55483a, 0x3a4a45, 0x5a3a3a]), roughness: 1, side: THREE.DoubleSide }));
      c.position.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * 1.1 - 0.4, z);
      c.rotation.y = rnd(-0.3, 0.3); G.add(c);
    }
  });

  // ---------- 維多利亞瓦斯燈（sinsLamps 供 animate 閃爍；保留 3 盞＋Shimmer 紫窗）----------
  [[-7.8, 2], [7.8, 10], [-7.8, 14]].forEach(([lx, lz], li) => {
    const poleGrp = new THREE.Group();
    poleGrp.position.set(lx, 0, lz);
    bx(0.5, 0.6, 0.5, stoneMat, 0, 0.3, 0, poleGrp);
    cyl(0.1, 0.14, 4.6, ironMat, 0, 2.9, 0, poleGrp, 8);
    const ring = put(new THREE.TorusGeometry(0.17, 0.04, 5, 10), brassMat, 0, 1.2, 0, poleGrp); ring.rotation.x = Math.PI / 2;
    const isAmber = li === 1;
    const bulbMat = new THREE.MeshStandardMaterial({ color: isAmber ? 0x8a6a20 : 0x1a5a30, emissive: isAmber ? ZAUN.amber : ZAUN.chemGreen, emissiveIntensity: 1.5 });
    bx(0.5, 0.1, 0.5, brassMat, 0, 5.15, 0, poleGrp);                              // 燈籠底
    const bulb = put(new THREE.BoxGeometry(0.38, 0.55, 0.38), bulbMat, 0, 5.45, 0, poleGrp, false);   // 玻璃燈罩
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => bx(0.04, 0.6, 0.04, brassMat, a * 0.2, 5.45, b * 0.2, poleGrp));
    cyl(0.0, 0.34, 0.3, brassMat, 0, 5.85, 0, poleGrp, 4).rotation.y = Math.PI / 4;
    const lamp = new THREE.PointLight(isAmber ? 0xd4a017 : 0x39d353, 0.8, 14, 2);
    lamp.position.set(0, 5.4, 0);
    poleGrp.add(lamp);
    poleGrp.rotation.z = rnd(-0.04, 0.04);
    sinsLamps.push({ light: lamp, bulbMat, base: 0.8 });
    G.add(poleGrp);
  });
  // 角色補光：街心上方一盞柔和的冷白光（只照亮近處），地面再墊一圈淡光暈
  const fillLight = new THREE.PointLight(0xdfeee0, 0.9, 11, 2);
  fillLight.position.set(0, 3.2, 3);
  G.add(fillLight);
  const poolTex = mkTex((g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(200,225,205,0.30)'); gr.addColorStop(1, 'rgba(200,225,205,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, 128, 128, 1);
  const pool = put(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false }), 0, 0.03, 2, G, false);
  pool.rotation.x = -Math.PI / 2;
  const shimmerWin = put(new THREE.BoxGeometry(0.9, 1.3, 0.08), shimmerGlowMat, 9.0, 3.2, -3.2, G, false);
  shimmerWin.rotation.y = -Math.PI / 2;
  const shimmerLight = new THREE.PointLight(0xa855f7, 0.5, 8, 2);
  shimmerLight.position.set(8.0, 3.2, -3.2);
  G.add(shimmerLight);
  sinsLamps.push({ light: shimmerLight, bulbMat: shimmerGlowMat, base: 0.5 });

  // ---------- 街頭殘骸：生鏽燒毀的車、木箱、油桶、推車、垃圾、瓦礫 ----------
  function buildBurntCar(x, z, rotY) {
    const grp = new THREE.Group(); grp.position.set(x, 0.05, z); grp.rotation.y = rotY;
    const burnt = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1, metalness: 0.3 });
    put(new THREE.BoxGeometry(3.4, 0.65, 1.5), burnt, 0, 0.5, 0, grp).rotation.z = 0.06;
    put(new THREE.BoxGeometry(1.7, 0.6, 1.35), burnt, -0.15, 1.05, 0, grp).rotation.z = -0.08;
    [[1.1, 0.75], [-1.1, -0.75], [1.1, -0.75]].forEach(([wx, wz]) => {
      const rim = put(new THREE.TorusGeometry(0.3, 0.08, 6, 12), ironMat, wx, 0.3, wz, grp);
      rim.rotation.x = Math.PI / 2 + rnd(-0.2, 0.2);
    });
    G.add(grp);
  }
  buildBurntCar(-6, 3, 0.5);
  buildBurntCar(7, 14, -0.9);
  [[6.4, 6], [-6.4, -9], [5.9, -12], [-5.6, 12]].forEach(([ox, oz]) => {      // 油桶
    const b = cyl(0.42, 0.42, 1.0, plateRustMat, ox, 0.5, oz, G, 12);
    [0.25, 0.75].forEach(y => { const r = put(new THREE.TorusGeometry(0.43, 0.025, 4, 14), ironMat, ox, y, oz); r.rotation.x = Math.PI / 2; });
  });
  [[5.2, -6], [-5.0, 8.5], [6.6, 0.5]].forEach(([ox, oz]) => {                // 木箱堆
    const w = pick([0x4a3a28, 0x3e3426]);
    const m = new THREE.MeshStandardMaterial({ color: w, roughness: 1 });
    const c1 = bx(1.0, 1.0, 1.0, m, ox, 0.5, oz); c1.rotation.y = rnd(-0.4, 0.4);
    const c2 = bx(0.8, 0.8, 0.8, m, ox + 0.2, 1.4, oz - 0.1); c2.rotation.y = rnd(-0.5, 0.5);
  });
  const cartG = new THREE.Group(); cartG.position.set(-6.2, 0.1, -2.5); cartG.rotation.y = 0.7; cartG.rotation.z = 0.15;   // 翻倒推車
  bx(1.4, 0.15, 0.9, rustMat, 0, 0.5, 0, cartG);
  [-1, 1].forEach(s => { const w = put(new THREE.TorusGeometry(0.32, 0.05, 6, 14), ironMat, 0, 0.35, s * 0.55, cartG); });
  G.add(cartG);
  const binMat = new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.9, metalness: 0.3 });
  const bin = put(new THREE.CylinderGeometry(0.5, 0.45, 1.3, 10), binMat, 5.5, 0.45, 5, G);
  bin.rotation.z = Math.PI / 2.3;
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x4a4a40, roughness: 1 });
  for (let i = 0; i < 16; i++) {
    const t = put(new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.1, 0.2 + Math.random() * 0.3), trashMat, 5.5 + rnd(-1.5, 1.5), 0.06, 5 + rnd(-1.5, 1.5), G, false);
    t.rotation.y = Math.random() * Math.PI;
  }
  for (let i = 0; i < 6; i++) {
    const rubble = new THREE.Group();
    do { rubble.position.set(rnd(-11, 11), 0, rnd(-10, 12)); } while (Math.hypot(rubble.position.x, rubble.position.z) < 6);
    for (let j = 0; j < 4 + Math.random() * 4; j++) {
      const chunk = put(new THREE.BoxGeometry(0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4, 0.3 + Math.random() * 0.5), pick(wallMats), rnd(-0.7, 0.7), 0.12 + Math.random() * 0.3, rnd(-0.7, 0.7), rubble);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
    }
    G.add(rubble);
  }
}

// 舊版 Zaun 街屋環境（方塊街屋，已不再使用，保留以便還原）
function buildSinsEnvironmentOld() {
  sinsEnvGroup = new THREE.Group();
  sinsEnvGroup.visible = false;
  scene.add(sinsEnvGroup);
  sinsLamps = [];

  // ---- 色票：Zaun（深綠黑、鐵鏽、化技綠、琥珀窗光、Shimmer 紫） ----
  const ZAUN = {
    asphalt: 0x141c18,      // 濕黑瀝青（帶綠）
    asphaltDark: 0x0a100d,
    wallA: 0x243028,        // 石牆・深綠灰
    wallB: 0x2c2820,        // 石牆・鏽褐
    wallC: 0x1e242c,        // 石牆・鐵灰藍
    iron: 0x3a4048,         // 鐵件
    rust: 0x6b4a2a,         // 鏽管
    pipeGreen: 0x3d5a48,    // 腐蝕綠銅管
    chemGreen: 0x39d353,    // 化技綠（發光）
    chemGreenDim: 0x1a7a30,
    amber: 0xd4a017,        // 琥珀窗光
    shimmer: 0xa855f7,      // Shimmer 紫
    smoke: 0x8a9a8e,
  };

  // ---- 濕路面（深綠黑）＋裂痕 ----
  const roadMat = new THREE.MeshStandardMaterial({ color: ZAUN.asphalt, roughness: 0.85 });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(80, 0.2, 80), roadMat);
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  sinsEnvGroup.add(ground);

  // 路面裂痕
  const crackMat = new THREE.MeshStandardMaterial({ color: ZAUN.asphaltDark, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const crack = new THREE.Mesh(
      new THREE.BoxGeometry(0.06 + Math.random() * 0.05, 0.01, 1 + Math.random() * 3.2),
      crackMat
    );
    crack.position.set((Math.random() - 0.5) * 44, 0.02, (Math.random() - 0.5) * 40);
    crack.rotation.y = Math.random() * Math.PI;
    sinsEnvGroup.add(crack);
  }

  // 化技積水：路面一小灘一小灘的綠光反光
  const puddleMat = new THREE.MeshBasicMaterial({
    color: ZAUN.chemGreenDim, transparent: true, opacity: 0.35, depthWrite: false,
  });
  for (let i = 0; i < 7; i++) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.5 + Math.random() * 1.1, 10), puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set((Math.random() - 0.5) * 26, 0.015, (Math.random() - 0.5) * 24 + 2);
    sinsEnvGroup.add(puddle);
  }

  // ---- 共用建材 ----
  const wallMats = [
    new THREE.MeshStandardMaterial({ color: ZAUN.wallA, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: ZAUN.wallB, roughness: 0.95 }),
    new THREE.MeshStandardMaterial({ color: ZAUN.wallC, roughness: 0.9 }),
  ];
  const ironMat = new THREE.MeshStandardMaterial({ color: ZAUN.iron, roughness: 0.55, metalness: 0.75 });
  const rustMat = new THREE.MeshStandardMaterial({ color: ZAUN.rust, roughness: 0.8, metalness: 0.4 });
  const pipeGreenMat = new THREE.MeshStandardMaterial({ color: ZAUN.pipeGreen, roughness: 0.7, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: ZAUN.asphaltDark, roughness: 1 });
  const chemGlowMat = new THREE.MeshStandardMaterial({
    color: ZAUN.chemGreenDim, emissive: ZAUN.chemGreen, emissiveIntensity: 1.2, roughness: 0.4,
  });
  const amberGlowMat = new THREE.MeshStandardMaterial({
    color: 0x8a6a20, emissive: ZAUN.amber, emissiveIntensity: 0.9, roughness: 0.5,
  });
  const shimmerGlowMat = new THREE.MeshStandardMaterial({
    color: 0x4a2080, emissive: ZAUN.shimmer, emissiveIntensity: 1.1, roughness: 0.4,
  });

  // ---- Zaun 街屋：垂直堆疊＋維多利亞拱窗＋簷板＋鐵格陽台 ----
  // 「蓋了又蓋」：主體上面再疊更小的加建層
  function buildZaunHouse(x, z, w, h, d, rotY) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = rotY;
    const wallMat = wallMats[Math.floor(Math.random() * wallMats.length)];

    // 主體
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    // 簷板（頂緣一條突出的水平線脚）
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, d + 0.4), wallMat);
    cornice.position.y = h + 0.1;
    grp.add(cornice);

    // 加建層：蓋在屋頂上的更小違建（Zaun 垂直堆疊的關鍵）
    const addH = 1.6 + Math.random() * 1.8;
    const addW = w * (0.55 + Math.random() * 0.3);
    const addon = new THREE.Mesh(
      new THREE.BoxGeometry(addW, addH, d * 0.7),
      wallMats[Math.floor(Math.random() * wallMats.length)]
    );
    addon.position.set((Math.random() - 0.5) * (w - addW) * 0.6, h + 0.2 + addH / 2, 0);
    addon.castShadow = true;
    grp.add(addon);

    // 拱窗：發光窗（綠／琥珀交錯），部分是黑洞
    const winW = 0.7, winH = 1.1;
    const nCols = Math.max(2, Math.floor(w / 2));
    const nRows = Math.max(2, Math.floor(h / 2.6));
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        if (Math.random() < 0.22) continue; // 破掉沒窗的
        const wx = (c - (nCols - 1) / 2) * (w / nCols);
        const wy = 1.3 + r * 2.3;
        if (wy > h - 0.6) continue;
        // 拱頂（半圓）
        const arch = new THREE.Mesh(
          new THREE.CylinderGeometry(winW / 2, winW / 2, 0.08, 8, 1, false, 0, Math.PI),
          wallMat
        );
        arch.rotation.x = Math.PI / 2;
        arch.rotation.z = Math.PI;
        arch.position.set(wx, wy + winH / 2, d / 2 + 0.04);
        grp.add(arch);
        // 窗面
        const roll = Math.random();
        const winMat = roll < 0.45 ? chemGlowMat : roll < 0.8 ? amberGlowMat : darkMat;
        const win = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), winMat);
        win.position.set(wx, wy, d / 2 + 0.04);
        grp.add(win);
      }
    }

    // 鐵格陽台：一層挑出的鐵板＋欄杆
    if (Math.random() < 0.7) {
      const by = h * (0.45 + Math.random() * 0.3);
      const balcony = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.08, 0.7), ironMat);
      balcony.position.set((Math.random() - 0.5) * w * 0.3, by, d / 2 + 0.35);
      grp.add(balcony);
      for (let b = -2; b <= 2; b++) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.55, 0.05), ironMat);
        rail.position.set(balcony.position.x + b * (w * 0.5 / 5), by + 0.3, d / 2 + 0.65);
        grp.add(rail);
      }
      const railTop = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.05, 0.05), ironMat);
      railTop.position.set(balcony.position.x, by + 0.58, d / 2 + 0.65);
      grp.add(railTop);
    }

    sinsEnvGroup.add(grp);
    return grp;
  }

  // 左右兩側街屋（近→遠，高低錯落，越遠越高＝峽谷感）
  const houseDefs = [
    [-10, -6, 5.5, 7.5, 5, 0.10], [-11, 0, 6, 9, 5.5, 0.06], [-10.5, 7, 5, 6.5, 5, 0.12],
    [-12, 14, 6.5, 11, 6, 0.15], [10, -6, 5.5, 8, 5, -0.10], [11, 0, 6, 10, 5.5, -0.06],
    [10.5, 7, 5, 7, 5, -0.12], [12, 14, 6.5, 12, 6, -0.15],
  ];
  houseDefs.forEach(([hx, hy, hw, hh, hd, hr]) => buildZaunHouse(hx, hy, hw, hh, hd, hr));

  // ---- 背景高牆：遠處更高密度的堆疊剪影（峽谷底的對岸） ----
  const backMat = new THREE.MeshStandardMaterial({ color: 0x151c18, roughness: 1 });
  for (let i = -3; i <= 3; i++) {
    const bw = 7 + Math.random() * 3;
    const bh = 13 + Math.random() * 7;
    const back = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 4), backMat);
    back.position.set(i * 9 + (Math.random() - 0.5) * 2, bh / 2, -22 - Math.random() * 3);
    sinsEnvGroup.add(back);
    // 剪影上的零星亮窗
    for (let w = 0; w < 5; w++) {
      if (Math.random() < 0.4) continue;
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.7),
        Math.random() < 0.6 ? chemGlowMat : amberGlowMat
      );
      win.position.set(
        back.position.x + (Math.random() - 0.5) * (bw - 1),
        2 + Math.random() * (bh - 3),
        back.position.z + 2.02
      );
      sinsEnvGroup.add(win);
    }
  }

  // ---- 腐蝕管線：垂直幹管＋橫跨街道的頭頂管橋（Zaun 招牌） ----
  // 垂直幹管：貼在街屋立面上
  houseDefs.forEach(([hx, , hw, hh]) => {
    const side = Math.sign(hx);
    for (let p = 0; p < 2; p++) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14 + Math.random() * 0.08, 0.14 + Math.random() * 0.08, hh + 1, 7),
        Math.random() < 0.5 ? rustMat : pipeGreenMat
      );
      pipe.position.set(hx - side * (hw / 2 + 0.18), (hh + 1) / 2, (Math.random() - 0.5) * hw * 0.7);
      pipe.castShadow = true;
      sinsEnvGroup.add(pipe);
      // 管箍
      for (let y = 1.5; y < hh; y += 2.5) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 5, 10), ironMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.set(pipe.position.x, y, pipe.position.z);
        sinsEnvGroup.add(collar);
      }
    }
  });

  // 頭頂管橋：兩條粗管＋支架橫跨街道（支架只立在兩側，不擋街心生物）
  [-2, 9].forEach((pz, idx) => {
    const pipeGrp = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const cross = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 22, 8),
        k === 1 ? pipeGreenMat : rustMat
      );
      cross.rotation.z = Math.PI / 2;
      cross.position.set(0, 6.5 + idx * 1.6 + k * 0.55, pz);
      cross.castShadow = true;
      pipeGrp.add(cross);
    }
    // 支架（A 字鐵架）：只放兩側，街心（x=0）留空給七大罪
    [-8, 8].forEach((sx) => {
      const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.5, 0.12), ironMat);
      legL.position.set(sx - 0.8, 3.25, pz);
      legL.rotation.z = 0.12;
      pipeGrp.add(legL);
      const legR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.5, 0.12), ironMat);
      legR.position.set(sx + 0.8, 3.25, pz);
      legR.rotation.z = -0.12;
      pipeGrp.add(legR);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.1), ironMat);
      crossbar.position.set(sx, 5.2, pz);
      pipeGrp.add(crossbar);
    });
    sinsEnvGroup.add(pipeGrp);
  });

  // ---- 鐵格天橋：移到生物後方（z=-8），當背景不擋視線 ----
  const bridgeGrp = new THREE.Group();
  bridgeGrp.position.set(0, 5.2, -8);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(19, 0.15, 1.6), ironMat);
  deck.castShadow = true;
  bridgeGrp.add(deck);
  for (let i = -9; i <= 9; i += 1.2) {
    const lattice = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), ironMat);
    lattice.position.set(i, 0.42, 0.72);
    bridgeGrp.add(lattice);
    const lattice2 = lattice.clone();
    lattice2.position.z = -0.72;
    bridgeGrp.add(lattice2);
  }
  const deckRail = new THREE.Mesh(new THREE.BoxGeometry(19, 0.06, 0.06), ironMat);
  deckRail.position.set(0, 0.78, 0.72);
  bridgeGrp.add(deckRail);
  const deckRail2 = deckRail.clone();
  deckRail2.position.z = -0.72;
  bridgeGrp.add(deckRail2);
  // 橋底斜撐
  [-6, -2, 2, 6].forEach((bx) => {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), ironMat);
    brace.position.set(bx, -1.1, 0.6);
    brace.rotation.x = 0.5;
    bridgeGrp.add(brace);
  });
  sinsEnvGroup.add(bridgeGrp);

  // ---- 煙囪：遠景冒煙的工業煙囪（化技綠頂光） ----
  [[-16, -20], [14, -21], [4, -24]].forEach(([sx, sz], i) => {
    const stackH = 9 + i * 2.5;
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, stackH, 8), rustMat);
    stack.position.set(sx, stackH / 2, sz);
    sinsEnvGroup.add(stack);
    // 頂環
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 6, 12), ironMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(sx, stackH, sz);
    sinsEnvGroup.add(rim);
    // 煙（半透明錐，微透綠）
    const smokeMat = new THREE.MeshBasicMaterial({
      color: ZAUN.smoke, transparent: true, opacity: 0.12, depthWrite: false,
    });
    const smoke = new THREE.Mesh(new THREE.ConeGeometry(1.6, 5, 7), smokeMat);
    smoke.position.set(sx + 0.4, stackH + 2.8, sz);
    smoke.rotation.z = 0.25;
    sinsEnvGroup.add(smoke);
  });

  // ---- 化技燈柱：貼兩側牆邊，不佔街心（sinsLamps 供 animate 閃爍） ----
  [[-8.5, 2], [8.5, 10], [-8.5, 14]].forEach(([lx, lz], li) => {
    const poleGrp = new THREE.Group();
    poleGrp.position.set(lx, 0, lz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6), ironMat);
    pole.position.y = 2.8;
    pole.rotation.z = (Math.random() - 0.5) * 0.1;
    poleGrp.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.09), ironMat);
    arm.position.set(0.55, 5.5, 0);
    poleGrp.add(arm);
    // 化技綠燈泡（第 2 盞改琥珀，錯開色彩節奏）
    const isAmber = li === 1;
    const bulbMat = new THREE.MeshStandardMaterial({
      color: isAmber ? 0x8a6a20 : 0x1a5a30,
      emissive: isAmber ? ZAUN.amber : ZAUN.chemGreen,
      emissiveIntensity: 1.5,
    });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), bulbMat);
    bulb.position.set(1.1, 5.35, 0);
    poleGrp.add(bulb);
    const lamp = new THREE.PointLight(isAmber ? 0xd4a017 : 0x39d353, 0.8, 14, 2);
    lamp.position.copy(bulb.position);
    poleGrp.add(lamp);
    sinsLamps.push({ light: lamp, bulbMat, base: 0.8 });
    sinsEnvGroup.add(poleGrp);
  });

  // ---- Shimmer 紫光小窗：角落一扇發紫的小窗（Silco 的痕跡） ----
  const shimmerWin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.08), shimmerGlowMat);
  shimmerWin.position.set(9.2, 3.2, -3.2);
  shimmerWin.rotation.y = -0.3;
  sinsEnvGroup.add(shimmerWin);
  const shimmerLight = new THREE.PointLight(0xa855f7, 0.5, 8, 2);
  shimmerLight.position.set(8.6, 3.2, -2.6);
  sinsEnvGroup.add(shimmerLight);
  sinsLamps.push({ light: shimmerLight, bulbMat: shimmerGlowMat, base: 0.5 });

  // ---- 街頭殘骸：保留燒車、垃圾桶、瓦礫（底城的日常） ----
  function buildBurntCar(x, z, rotY) {
    const grp = new THREE.Group();
    grp.position.set(x, 0.05, z);
    grp.rotation.y = rotY;
    const burntMat = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 1, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.65, 1.5), burntMat);
    body.position.y = 0.5;
    body.rotation.z = 0.06;
    grp.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.35), burntMat);
    cabin.position.set(-0.15, 1.05, 0);
    cabin.rotation.z = -0.08;
    grp.add(cabin);
    [[1.1, 0.75], [-1.1, -0.75]].forEach(([wx, wz]) => {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 12), burntMat);
      rim.position.set(wx, 0.3, wz);
      rim.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      grp.add(rim);
    });
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    sinsEnvGroup.add(grp);
  }
  buildBurntCar(-6, 3, 0.5);
  buildBurntCar(7, 14, -0.9);

  // 翻覆垃圾桶＋散落垃圾
  const binMat = new THREE.MeshStandardMaterial({ color: 0x2a3a30, roughness: 0.9, metalness: 0.3 });
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.45, 1.3, 10), binMat);
  bin.position.set(5.5, 0.45, 5);
  bin.rotation.z = Math.PI / 2.3;
  sinsEnvGroup.add(bin);
  const trashMat = new THREE.MeshStandardMaterial({ color: 0x4a4a40, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.1, 0.2 + Math.random() * 0.3), trashMat);
    t.position.set(5.5 + (Math.random() - 0.5) * 3, 0.06, 5 + (Math.random() - 0.5) * 3);
    t.rotation.y = Math.random() * Math.PI;
    sinsEnvGroup.add(t);
  }

  // 瓦礫堆
  for (let i = 0; i < 5; i++) {
    const rubble = new THREE.Group();
    rubble.position.set((Math.random() - 0.5) * 22, 0, (Math.random() - 0.5) * 20 + 2);
    for (let j = 0; j < 4 + Math.random() * 4; j++) {
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(0.3 + Math.random() * 0.5, 0.2 + Math.random() * 0.4, 0.3 + Math.random() * 0.5),
        new THREE.MeshStandardMaterial({ color: 0x3a4038, roughness: 1 })
      );
      chunk.position.set((Math.random() - 0.5) * 1.4, 0.12 + Math.random() * 0.3, (Math.random() - 0.5) * 1.4);
      chunk.rotation.set(Math.random(), Math.random(), Math.random());
      rubble.add(chunk);
    }
    sinsEnvGroup.add(rubble);
  }

  // 噴漆塗鴉：隨機色塊貼在近處牆面（保留底城的幫派感，改暗色系）
  const grafColors = [0x8a2a3a, 0x2a6a4a, 0x6a4a8a, 0xa06a20];
  houseDefs.slice(0, 4).forEach(([hx, hy, hw, hh, hd]) => {
    const side = Math.sign(hx);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const g = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8 + Math.random() * 1.4, 0.6 + Math.random() * 0.9),
        new THREE.MeshStandardMaterial({
          color: grafColors[Math.floor(Math.random() * grafColors.length)],
          roughness: 0.9,
        })
      );
      g.position.set(
        hx - side * (hw / 2 + 0.03),
        1 + Math.random() * (hh - 2.5),
        hy + (Math.random() - 0.5) * hd * 0.7
      );
      g.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.rotation.z = (Math.random() - 0.5) * 0.25;
      sinsEnvGroup.add(g);
    }
  });
}

const LAVA_NOISE_GLSL = `
float hash3d(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float lavaNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3d(i), hash3d(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash3d(i + vec3(0.0, 1.0, 0.0)), hash3d(i + vec3(1.0, 1.0, 0.0)), f.y), f.z),
    mix(mix(hash3d(i + vec3(0.0, 0.0, 1.0)), hash3d(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash3d(i + vec3(0.0, 1.0, 1.0)), hash3d(i + vec3(1.0, 1.0, 1.0)), f.y), f.z),
    f.z
  );
}
float lavaFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * lavaNoise(p);
    p = p * 2.02 + vec3(11.7, 5.3, 7.9);
    a *= 0.52;
  }
  return v;
}
`;

// 半熔岩核心：上半冷卻玄武岩、下半熔融橙紅；龜裂與熔岩流交錯；
// 頂點起伏讓球面看起來像變形中的熔岩膠
function createLavaCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.2 },
    },
    vertexShader: `
      uniform float uTime;
      ${LAVA_NOISE_GLSL}
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        vLocal = position;
        float sag = smoothstep(0.6, -0.9, position.y);
        float lumps = lavaFbm(position * 4.5 + vec3(uTime * 0.32, -uTime * 0.72, uTime * 0.18));
        float crust = lavaFbm(position * 1.8 + vec3(uTime * 0.08, uTime * 0.12, -uTime * 0.05));
        vec3 p = position + normal * ((lumps - 0.5) * 0.42 * sag + (crust - 0.5) * 0.07);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      ${LAVA_NOISE_GLSL}
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vViewDir);
        float ndv = clamp(dot(n, v), 0.0, 1.0);

        // 兩道逆向流動的熔岩紋，交錯在一起（一道向下滴，一道橫向緩流）
        float veinDown = lavaFbm(vLocal * 3.4 + vec3(0.0, -uTime * 0.55, uTime * 0.08));
        float veinCross = lavaFbm(vLocal * 5.1 + vec3(uTime * 0.18, uTime * 0.1, -uTime * 0.28));
        float v1 = smoothstep(0.115, 0.0, abs(veinDown - 0.5));
        float v2 = smoothstep(0.085, 0.0, abs(veinCross - 0.5));
        float veins = v1 * 0.8 + v2 * 0.65;

        float dripZone = smoothstep(0.65, -0.95, vLocal.y);
        float flow = lavaFbm(vLocal * 2.1 + vec3(0.0, -uTime * 0.35, uTime * 0.1));
        float heat = dripZone * 0.68 + flow * 0.34 + veins * dripZone * 0.4;
        float energy = clamp(uIntensity / 1.2, 0.08, 2.4);

        // 冷卻白灰殼 → 月光玄武岩 → 珍珠白熔岩 → 白曜膠體
        vec3 pearlCrust = vec3(0.58, 0.60, 0.65);
        vec3 moonBasalt = vec3(0.86, 0.88, 0.92);
        vec3 moonFlow = vec3(1.08, 0.96, 0.88);
        vec3 pearlLava = vec3(1.18, 1.05, 0.94);
        vec3 whiteObsidian = vec3(1.22, 1.18, 1.06);
        float crustMask = smoothstep(0.42, 0.78, lavaFbm(vLocal * 1.65 + vec3(uTime * 0.05)));
        vec3 col = mix(pearlCrust, moonBasalt, 0.55 + crustMask * 0.45);
        float molten01 = smoothstep(0.45, 0.95, heat);
        col = mix(col, moonFlow, molten01 * 0.85);
        col = mix(col, pearlLava, smoothstep(0.72, 1.08, heat) * 0.85);
        col = mix(col, whiteObsidian, smoothstep(1.02, 1.35, heat) * 0.6);

        // 高壓熱流脈動，隨 uIntensity / 能量狀態暗亮
        float pulse = 0.78 + 0.28 * sin(uTime * 1.7) + 0.08 * sin(uTime * 4.1);
        col *= (0.28 + 0.92 * energy) * pulse;

        // 邊緣熔岩光；冷卻邊緣幾乎無光
        float rim = pow(1.0 - ndv, 2.2) * dripZone * (0.35 + heat);
        col += vec3(1.18, 1.02, 0.9) * rim * 0.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
  });
}

// 糖漿滴：細頸 → 鼓起的梨形滴 → 圓弧收尾；亮面厚液體
function createSyrupDripGeometry() {
  const pts = [
    new THREE.Vector2(0.030,  0.18),
    new THREE.Vector2(0.075,  0.08),
    new THREE.Vector2(0.075, -0.08),
    new THREE.Vector2(0.095, -0.22),
    new THREE.Vector2(0.115, -0.34),
    new THREE.Vector2(0.150, -0.48),
    new THREE.Vector2(0.205, -0.62),
    new THREE.Vector2(0.235, -0.76),
    new THREE.Vector2(0.215, -0.92),
    new THREE.Vector2(0.160, -1.08),
    new THREE.Vector2(0.080, -1.22),
    new THREE.Vector2(0.000, -1.28)
  ];
  const geo = new THREE.LatheGeometry(pts, 28);
  geo.computeVertexNormals();
  return geo;
}

// -------------------------------------------------------------
// [愛 Love] 兜帽裹屍核心（依使用者參考圖重做）
// 參考圖特徵：像一件被撐起的灰白斗篷／裹屍布，下端收成一個尖錐，
//   中央有一道深色開口（像布裡挖出的縫），縫裡懸著一顆「同心圓環」的藍白眼球。
// 做法：Lathe 做出布的整體輪廓（上寬下尖）＋ 正面挖出裂縫（自訂 BufferGeometry 的 U 型截面）
//   ＋ 兩片布幔邊緣（左右翻起的袖口）＋ 裂縫深處的眼球（同心環 shader）
// -------------------------------------------------------------

// 布料 shader：灰白織物＋縱向皺褶陰影＋邊緣微光（不是塑膠高光）
// 布料 shader：灰白織物＋布摺陰影＋真實明暗（Lambert）＋邊緣微光
// gl_FrontFacing 判斷正反面：布的內側（開口的內壁、斗篷翼的背面）壓暗，讀起來才有厚度
const LOVE_SHROUD_CLOTH_FRAG = `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec3 uEyeLocal;
  uniform float uEyeRadius;
  uniform vec3 uCenterLocal;
  varying vec3 vN;
  varying vec3 vNLocal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying vec2 vUv;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(vViewDir);
    if (!gl_FrontFacing) n = -n;

    // 織物顆粒（細碎明暗）
    float grain = sin(vLocal.x * 46.0 + vLocal.y * 31.0) * sin(vLocal.z * 38.0 - vLocal.y * 17.0);

    // 主光源：與愛的場景一致（右上方的暖黃太陽）
    vec3 keyDir = normalize(vec3(0.42, 0.78, 0.62));
    // 補光：來自天空的冷色環境光
    vec3 fillDir = normalize(vec3(-0.55, 0.30, 0.45));

    float lambert = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0);

    // 鵝白色（比原本的冷灰亮一截，且帶一點暖奶油色，不會變成死白）
    // FIXED-007: 使用者要求外層布殼調亮成鵝白色 → albedo 從冷灰 0.62/0.62/0.66 提到 0.88/0.87/0.83
    vec3 albedo = vec3(1.0, 0.87, 0.63);
    vec3 keyCol = vec3(1.00, 0.96, 0.88);
    vec3 fillCol = vec3(0.55, 0.62, 0.74);

    vec3 col = albedo * (0.36 + 0.24 * (n.y * 0.5 + 0.5));        // 半球環境光（給足底，不讓布變成黑團）
    col += albedo * keyCol * lambert * 0.85;                        // 主光
    col += albedo * fillCol * fill * 0.45;                         // 補光
    col *= 1.0 + grain * 0.07;

    // 邊緣微光：勾出布的輪廓
    float rim = pow(1.0 - abs(dot(n, v)), 2.4);
    col += vec3(0.72, 0.73, 0.80) * rim * 0.70;

    // 深處的假 AO：只壓暗「正中央的縱縫內壁」，不影響整體亮度
    float ao = smoothstep(0.02, 0.34, abs(vLocal.x) * 0.5 + abs(vLocal.z) * 0.4);
    col *= mix(0.68, 1.0, ao);

    // 能量狀態：耗損時整體變暗（同化時略亮）
    float energy = clamp(uIntensity / 1.2, 0.08, 2.4);
    col *= (0.55 + 0.55 * energy);

    // 「布殼裡面」＝ 法線朝向身體中軸的那些面（兜帽裡的凹腔、翻起來的布的內側）
    // FIXED-006: 判定「布殼內側」的方式：用「從身體中軸指向該點」的方向當外側方向，外側方向與法線同向＝外表面，反向＝內表面 → 兜帽凹腔塗成純黑，外表面不受影響（一開始想用 gl_FrontFacing 判背面，但凹腔是朝前的正面，判不到）
    vec3 rel = vLocal - uCenterLocal;
    vec3 outward = (dot(rel.xz, rel.xz) > 0.0004)
      ? normalize(vec3(rel.x, 0.0, rel.z))
      : normalize(rel + vec3(0.0, 0.0001, 0.0));
    float facing = dot(normalize(vNLocal), outward);
    float cavity = smoothstep(0.12, -0.30, facing);
    col = mix(col, vec3(0.020, 0.020, 0.026), cavity);

    // 兜帽縫那顆眼球凸起 → 直接塗成發亮的白圓（不是另加一顆球，而是把布面本身塗白）
    float dEye = distance(vLocal, uEyeLocal);
    // 眼睛周圍的凹槽一併塗黑 → 白圓像鑲在一個黑洞裡（跟參考圖一致）
    float socket = 1.0 - smoothstep(uEyeRadius * 1.05, uEyeRadius * 3.2, dEye);
    col = mix(col, vec3(0.015, 0.015, 0.020), socket * 0.90);
    float eyeCore = 1.0 - smoothstep(uEyeRadius * 0.80, uEyeRadius, dEye);
    float eyeHalo = 1.0 - smoothstep(uEyeRadius, uEyeRadius * 3.4, dEye);
    float eyePulse = 0.86 + 0.14 * sin(uTime * 2.4);
    col = mix(col, vec3(1.0, 1.0, 1.0), eyeCore);
    col += vec3(0.58, 0.72, 1.0) * eyeHalo * eyeHalo * 0.30 * eyePulse;
    col += vec3(1.0, 0.98, 0.94) * eyeCore * 1.30 * eyePulse;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLoveShroudClothMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: `
      varying vec3 vN;
      varying vec3 vNLocal;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vLocal = position;
        vNLocal = normal;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: LOVE_SHROUD_CLOTH_FRAG,
    side: THREE.DoubleSide,
  });
}


// 兜帽裹屍幾何 v2（依使用者三視圖 FRONT / SIDE / BACK 重建）
// 三視圖共同特徵：
//   FRONT  上窄下寬、肩部兩側翻出尖角、下端收成一枚長尖錐；正面偏左上開一道縱縫，
//          縫上端懸著一顆藍白同心環眼球
//   SIDE   極薄（正面寬度約 3 倍深度的薄殼），上端向左前方傾斜，下端尖錐
//   BACK   完整一片垂布，肩線高聳、背面中央一道深溝
// 因此這不是旋轉體，而是一個「薄殼」：橫截面是扁的，
// 靠「正面開口 + 兩側翻角 + 背溝」做出體積感，而不是靠加粗。
// profile(v) 回傳 { rx, rz, y }：rx=左右半寬、rz=前後半厚（薄殼）
// gapAt(v) 回傳正面(+Z)開口的半角；0 = 完全閉合
function createLoveShroudGeometry(radialSegs, heightSegs, profile, gapAt) {
  const verts = [], uvs = [], indices = [];
  for (let j = 0; j <= heightSegs; j++) {
    const v = j / heightSegs;              // 0 = 底部尖錐，1 = 頂端
    const row = profile(v);
    const gap = gapAt(v);                   // 正面開口的半角（弧度）
    // 開口中心對準 +Z（正面，ang = PI/2）：起點角 = PI/2 + gap，繞過背面到 PI/2 - gap
    const center = Math.PI / 2;
    const startA = center + gap;
    const sweep = Math.PI * 2 - gap * 2;
    for (let i = 0; i <= radialSegs; i++) {
      const u = i / radialSegs;
      const ang = startA + sweep * u;
      // 橢圓截面（rx >> rz）：薄殼而非圓柱
      const x = Math.cos(ang) * row.rx;
      const z = Math.sin(ang) * row.rz;
      verts.push(x, row.y, z);
      uvs.push(u, v);
    }
  }
  for (let j = 0; j < heightSegs; j++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = j * (radialSegs + 1) + i;
      const b = a + radialSegs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 布殼的場景比例：原始高 1.957，放大到約 2.9 高（與舊程序化版本同量級）
const SHRoud_SCALE = 1.48;
// 兜帽縫裡那顆眼球凸起的位置（loveCore 空間；2026/11/11 用 Raycaster 掃網格實測出來）
const LOVE_EYE_ANCHOR = new THREE.Vector3(0.0, 0.925, 0.209);
// 白圓的半徑（loveCore 空間）
const LOVE_EYE_RADIUS = 0.052;

// FIXED-005: 底布收成倒三角形尖角（AI 生成的模型底下被平切，正面看像一片梯形）
// 做法：把下半截（y < y0）往「前方中央」收斂，越靠近底部收得越狠 → 正面是 V、側面也收尖。
// 參數是實際調出來的：右側的側翼（x > wx0）用權重保護，不讓它被拖進尖角。
function taperShroudHem(geometry, toLove, fromLove) {
  const O = { y0: -0.30, yBot: -1.458, ax: -0.05, az: 0.12, p: 1.05, wx0: 0.25, wx1: 0.55, tip: 0.11 };
  const pos = geometry.attributes.position.array;
  const v = new THREE.Vector3();
  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(toLove);   // → loveCore 空間
    const x = v.x, y = v.y, z = v.z;
    if (y < O.y0) {
      const t = Math.min(1, (O.y0 - y) / (O.y0 - O.yBot));
      const s = Math.pow(1 - t, O.p) * (1 - O.tip) + O.tip;          // 1 → tip，越往下越小
      const w = 1 - smooth(O.wx0, O.wx1, x);                          // 右側側翼權重 → 0
      const k = 1 - (1 - s) * w;
      v.x = O.ax + (x - O.ax) * k;
      v.z = O.az + (z - O.az) * k;
    }
    v.applyMatrix4(fromLove);                                       // → 回到 mesh local
    pos[i] = v.x; pos[i + 1] = v.y; pos[i + 2] = v.z;
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
}

// 載入 AI 建模產生的兜帽裹屍 GLB（Hunyuan3D-2mv 多視角版）
// 模型本身已經置中（原始 bounding box 中心約 [-0.018,-0.020,-0.009]），
// 這裡再依實際場景需求做縮放，讓布殼的高度與翅膀比例相符。
// 材質換成專案自製的布料 shader（LOVE_SHROUD_CLOTH_FRAG），維持與其他物種一致的布感與 rim 光。
function loadLoveShroudGLB(target) {
  // three r128 的 examples/js 版 GLTFLoader 是掛在 THREE.GLTFLoader 上（不是全域變數）
  const LoaderClass = (typeof THREE !== 'undefined') ? THREE.GLTFLoader : (typeof GLTFLoader !== 'undefined' ? GLTFLoader : null);
  if (!LoaderClass) {
    console.warn('[love] GLTFLoader 未載入，兜帽裹屍無法顯示 AI 建模結果');
    return;
  }

  // 模型檔放在 m2-species/assets/models/ 底下（跟著 m2-species 資料夾走，符合「一站一資料夾」的交付結構）。
  // 本專案有兩種伺服器開法，原本的服務根不同：
  //   live-server 服務 repo 根 → 頁面在 /m2-species/
  //   local_server.js 原本只服務 m2-species → 頁面在 /
  // 同一個相對路徑在兩者會落到不同位置，只放一份檔案另一邊就會 404 → 布殼整個消失（且不報錯）。
  // 解法：第 47 次已把 local_server.js 的服務根統一成 repo 根（與 live-server 一致），
  //       兩邊的 URL 路徑就完全相同 → 這裡直接用絕對路徑，命中後 console 會印出實際路徑。
  const CANDIDATES = [
    '/m2-species/assets/models/love-core-mv.glb',  // 服務根 = repo 根（兩種伺服器現在都如此）
    'assets/models/love-core-mv.glb',             // 服務根 = m2-species（保底）
    '../assets/models/love-core-mv.glb'            // 保底
  ];

  let idx = 0;
  const tryNext = () => {
    if (idx >= CANDIDATES.length) {
      console.error('[love] 兜帽裹屍 GLB 載入失敗：所有候選路徑都找不到');
      return;
    }
    const url = CANDIDATES[idx++];
    const loader = new LoaderClass();
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        // 置中：把原始模型的 bbox 中心搬到原點
        const box = new THREE.Box3().setFromObject(root);
        const ctr = box.getCenter(new THREE.Vector3());
        root.position.sub(ctr);
        root.scale.setScalar(SHRoud_SCALE);

        // 換成自製布料材質（GLB 原本是無光照的灰白 mesh）
        root.traverse((o) => {
          if (o.isMesh) {
            // Hunyuan3D 匯出的 GLB 只有 position，沒有 normal → 先算出法線，
            // 否則布料 shader 會因為法線全零而整片全黑
            if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
            o.material = loveShroudClothMat;
            o.castShadow = true;
            o.receiveShadow = true;
            o.frustumCulled = false;
          }
        });

        target.add(root);

        // 算 mesh local ↔ loveCore 空間的轉換（要用「實際」的矩陣，不要用寫死的常數）
        let mesh = null;
        root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
        if (mesh) {
          loveCore.updateMatrixWorld(true);
          const toLove = new THREE.Matrix4().copy(loveCore.matrixWorld).invert().multiply(mesh.matrixWorld);
          const fromLove = toLove.clone().invert();

          // 底布收成倒三角形尖角
          taperShroudHem(mesh.geometry, toLove, fromLove);

          // 身體中軸（mesh local 的 bbox 中心）→ 給 shader 判斷哪些面是「布殼內側」
          const bb2 = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
          loveShroudUniforms.uCenterLocal.value.copy(bb2.getCenter(new THREE.Vector3()));

          // 眼睛凸起的位置換算成 mesh local → 給布料 shader 畫白圓用
          loveShroudUniforms.uEyeLocal.value.copy(LOVE_EYE_ANCHOR.clone().applyMatrix4(fromLove));
          loveShroudUniforms.uEyeRadius.value = LOVE_EYE_RADIUS / SHRoud_SCALE;
        }

        console.log('[love] 兜帽裹屍 GLB 載入完成（AI 建模 · Hunyuan3D-2mv 多視角 · 底布收尖）← ' + url);
      },
      undefined,
      () => tryNext()
    );
  };
  tryNext();
}

function buildLoveCreature() {
  loveGroup = new THREE.Group();
  scene.add(loveGroup);

  // A. 兜帽裹屍核心 —— 改用 AI 建模（Hunyuan3D-2mv 多視角）產出的真實網格：
  //    參考圖是「三視圖（FRONT / SIDE / BACK）」，正好對應 Hunyuan3D 的多視角輸入格式，
  //    用裁好的多張視角圖餵進去，出來的布殼形狀／布褶／薄殼厚度都遠優於程序化建模。
  //    GLB：assets/models/love-core-mv.glb（多視角版，2026/11/11 重新生成後減面到 60k 面 / 1.03MB）
  // FIXED-003: 愛的核心改回 AI 建模的兜帽裹屍布殼＋鑲在布縫裡的靶心眼（原 GLB 遺失，2026/11/11 用 C:\tools\hf_run_mv3.py 重新生成、decimate_glb.py 減面）
  loveCore = new THREE.Group();
  // 背面固定貼在翅膀根部：翅膀的 pivot 在 z=-0.3，所以兜帽稍微往後挪一點
  loveCore.position.z = -0.12;
  loveCore.material = { uniforms: loveShroudUniforms }; // 沿用舊的 loveCore.material.uniforms 存取路徑
  loveShroudClothMat = createLoveShroudClothMaterial(loveShroudUniforms);

  // AI 生成的布殼（灰白織物）
  const shroudGlb = new THREE.Group();
  loveCore.add(shroudGlb);

  // 眼球：AI 網格在兜帽縫裡刻了一顆眼球凸起。
  // FIXED-004: 眼球改成「把布面本身塗白」——不再另外擺一顆同心靶心球（舊值 (-0.074, 1.063, 0.110) 是沒乘 1.48 縮放的模型座標、球心又埋太深，只露出藍色一角的月牙）；白圓直接由布料 shader 在凸起處畫 → 永遠服貼布面不會穿模

  // 載入 AI 生成的 GLB（多視角版）
  loadLoveShroudGLB(shroudGlb);

  loveGroup.add(loveCore);

  // A1. 舊的熔岩膠滴與外殼光暈已由兜帽裹屍取代（loveDrips 保持空陣列）

  // A2. 螺旋圓盤環 (Spiral Disk) - 取代舊金環：兩條對稱螺旋光帶，
  // 內圈寬厚熾亮、向外逐漸收窄變淡（吸積盤螺旋臂語彙），水平繞在核心上方
  // 光環改成更厚的同心傾斜圓盤（白色珍珠光澤）
  loveHalo = new THREE.Group();
  loveHalo.position.y = 2.18; // 兜帽頂端在 y≈1.5：光環浮到帽尖之上才不會插在布裡
  loveHalo.rotation.x = 0.38; // 微傾 22°：正水平時相機平視只看得到一條線，傾斜才讀得出「盤」
  loveSpiralMat = createSpiralDiskMaterial();
  const spiralGeo = createSpiralDiskGeometry();
  [-0.12, 0, 0.12].forEach(y => {
    const spiralDisk = new THREE.Mesh(spiralGeo, loveSpiralMat);
    spiralDisk.position.y = y;
    loveHalo.add(spiralDisk);
  });
  // 內圈熾亮邊緣：細白環標出圓盤內界，讓「盤」的讀法更清楚
  // 光環改成更厚的同心傾斜圓盤（白色珍珠光澤）
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.075, 16, 72),
    new THREE.MeshBasicMaterial({
      color: 0xfff6e8,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  rimRing.rotation.x = Math.PI / 2;
  loveHalo.add(rimRing);
  loveGroup.add(loveHalo);

  // 核心向外輻射的柔光（拉成直立橢圓，貼合兜帽裹屍的長身輪廓）
  const auraGeo = new THREE.SphereGeometry(1.55, 32, 32);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xf8f4ec,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  loveAura = new THREE.Mesh(auraGeo, auraMat);
  loveAura.scale.set(1.05, 1.30, 1.00);
  loveAura.position.y = -0.05;
  loveAura.visible = false;   // 移除布殼外的橢圓光區（物件與動畫保留，只是不顯示；想恢復改成 true）
  loveGroup.add(loveAura);

  // B. 擁抱雙翼 (Embrace Wings) - 有機羽毛層疊展開的金紅光翼
  const featherGeo = createLoveFeatherGeometry();
  const makeFeatherMat = (kind) => {
    const tex = createLoveFeatherTexture(kind);
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0xfff6ee,
      emissiveIntensity: 0.3,
      map: tex,
      emissiveMap: tex,
      roughness: 0.6,
      transparent: true,
      opacity: 1,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
    });
  };
  const flightMat = makeFeatherMat('flight');
  const covertMat = makeFeatherMat('covert');

  loveWings.push(buildLoveWing(1, featherGeo, flightMat, covertMat));
  loveWings.push(buildLoveWing(-1, featherGeo, flightMat, covertMat));

  // C. 覓食匯流微粒群 (Emotion Foraging Particle Swarm)
  // 象徵 5000 年後渴望吸收的人類詩歌、誓言與情感結晶
  const pCount = 800;
  const pGeoBuffer = new THREE.BufferGeometry();
  const pPositions = new Float32Array(pCount * 3);
  loveParticleVels = [];

  for (let i = 0; i < pCount; i++) {
    const r = 3.0 + Math.random() * 11.0;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.9;

    pPositions[i * 3] = r * Math.cos(phi) * Math.cos(theta);
    pPositions[i * 3 + 1] = r * Math.sin(phi);
    pPositions[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);

    loveParticleVels.push({
      r: r,
      theta: theta,
      phi: phi,
      inwardSpeed: 0.03 + Math.random() * 0.04, // 持續向核心匯流覓食
    });
  }

  pGeoBuffer.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xffd23f,
    size: 0.13,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
  });

  loveParticles = new THREE.Points(pGeoBuffer, particleMat);
  loveGroup.add(loveParticles);
}

// —— 白洞核心 shader（第 20 次）——
// 參考白洞外觀研究：亮球而非暗球；中心白熱、邊緣光子環增亮、表面有向外噴發的光帶。
// uIntensity 是能量狀態係數（同化 2.8／覓食 1.8／平時 1.2／耗損 0.15），
// triggerLove* 的 tween 改打 uniforms.uIntensity.value（r128 ShaderMaterial 沒有 emissiveIntensity）
function createWhiteHoleCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.2 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        vLocal = position;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vViewDir;
      varying vec3 vLocal;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vViewDir);
        float ndv = clamp(dot(n, v), 0.0, 1.0);

        // 中心白熱（正面最亮）＋邊緣光子環增亮（1-ndv 的 fresnel）
        float hot = pow(ndv, 1.6);
        float ring = pow(1.0 - ndv, 2.4);

        // 噴發光紋：經度光束緩轉 ＋ 緯度光帶向上流動（往外吐光的動勢）
        // 底限拉高（0.82）避免光紋把表面切得太灰
        vec3 dir = normalize(vLocal);
        float beams = 0.5 + 0.5 * sin(atan(dir.y, dir.x) * 14.0 + uTime * 1.6);
        float flow = 0.5 + 0.5 * sin(dir.y * 9.0 - uTime * 2.4);
        float streak = mix(0.82, 1.15, beams * 0.5 + flow * 0.5);

        float pulse = 1.0 + 0.07 * sin(uTime * 3.0);
        float e = uIntensity * pulse;

        vec3 col = mix(vec3(1.0, 0.98, 0.93), vec3(0.84, 0.92, 1.0), 1.0 - ndv);
        col *= (0.75 + 1.05 * hot + 1.9 * ring) * streak;
        col *= e * 1.2;

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
  });
}

// 白洞外層光暈薄殼：只在視線掠過球緣時發亮（fresnel），additive 疊出大氣光環
function createWhiteHoleGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.2 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vViewDir;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vViewDir;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(vViewDir);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float edge = pow(1.0 - ndv, 2.6); // 球緣最亮、中心近透明
        vec3 col = vec3(0.9, 0.95, 1.0) * edge * uIntensity * 0.55;
        gl_FragColor = vec4(col, edge * clamp(uIntensity * 0.6, 0.0, 1.0));
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

// 螺旋圓盤幾何：兩條對稱螺旋帶（每條 = 內外兩列頂點沿阿基米德螺旋展開）
// uv.x = 沿臂由內到外 (0→1)，uv.y = 橫跨帶寬 (0→1)，給 shader 做衰減與軟邊
function createSpiralDiskGeometry() {
  const ARMS = 2;
  const TURNS = 1.4; // 繞幾圈（太多圈會讀成同心圓漣漪）
  const SEG = 200;   // 每條取樣數
  const R0 = 0.7;    // 內半徑
  const R1 = 1.85;   // 外半徑
  const W0 = 0.24;    // 內側帶寬（正面線條細一點）
  const W1 = 0.035;   // 外側帶寬（正面更細、間距較大）

  const positions = [];
  const uvs = [];
  const indices = [];

  for (let a = 0; a < ARMS; a++) {
    const base = positions.length / 3;
    const phase = (a / ARMS) * Math.PI * 2;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const th = phase + t * TURNS * Math.PI * 2;
      const r = R0 + (R1 - R0) * t;
      const w = W0 + (W1 - W0) * t;
      const cos = Math.cos(th);
      const sin = Math.sin(th);
      // 內側頂點
      positions.push(cos * (r - w * 0.5), 0, sin * (r - w * 0.5));
      uvs.push(t, 0);
      // 外側頂點
      positions.push(cos * (r + w * 0.5), 0, sin * (r + w * 0.5));
      uvs.push(t, 1);
      if (i < SEG) {
        const k = base + i * 2;
        indices.push(k, k + 1, k + 2);
        indices.push(k + 1, k + 3, k + 2);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geo;
}

// 螺旋圓盤材質：additive 發光白光帶——內圈白熱、向外轉冷藍白並淡出，
// 沿臂流動微光表現「往外吐出的物質流」；雙面可見（相機低角時盤面變薄線）
function createSpiralDiskMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1.2 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        // 橫跨帶寬：邊緣軟化（帶中心實、兩側溶掉）
        float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
        across = smoothstep(0.0, 0.55, across);

        // 沿臂：內圈最亮，過半後淡出到尖端
        float along = mix(1.0, 0.0, smoothstep(0.35, 1.0, vUv.x));
        along = max(along, 0.25 * (1.0 - vUv.x));

        // 流動微光：亮紋沿臂由內往外推
        float shimmer = 0.82 + 0.18 * sin(vUv.x * 42.0 - uTime * 5.0);

        float e = uIntensity * 0.9;
        vec3 col = mix(vec3(1.0, 0.99, 0.96), vec3(0.8, 0.9, 1.0), vUv.x);
        col *= across * along * shimmer * e * 1.0;

        float alpha = across * along * clamp(e * 0.8, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// 羽毛貼圖（依鳥類真實構造）：
//  · 羽軸 (rachis) 偏向前緣，前緣羽片窄、後緣羽片寬（飛羽不對稱）
//  · 羽片是「封閉的一整面」（羽小鉤把羽枝扣在一起），不是一根根分開的線；羽枝只是表面細紋
//  · 飛羽近羽尖處有缺刻 (emargination)，羽根有蓬鬆的絨羽 (plumulaceous)
//  kind: 'flight' 飛羽（初級／次級／三級）｜ 'covert' 覆羽（短、圓、較對稱）
function createLoveFeatherTexture(kind) {
  const W = 128, H = 512;
  const sx = W * 0.4; // 羽軸位置
  const Lmax = sx - 3, Rmax = W - sx - 3;
  const flight = kind === 'flight';
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = flight ? 11 : 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // 側邊半寬（v: 0 羽根 → 1 羽尖）
  const prof = (v) => {
    const base = Math.pow(Math.sin(Math.PI * Math.pow(v, flight ? 0.85 : 0.9)), flight ? 0.45 : 0.6);
    return base * Math.min(1, Math.pow(v / (flight ? 0.14 : 0.08), 1.2));
  };
  const half = (v, side) => {
    const p = Math.max(prof(v), 0);
    if (side < 0) { // 前緣（窄）
      let w = Lmax * (flight ? 0.62 : 0.9) * p;
      if (flight) w *= 1 - 0.3 * Math.exp(-Math.pow((v - 0.78) / 0.05, 2));
      return w;
    }
    let w = Rmax * (flight ? 1.0 : 0.95) * p; // 後緣（寬）
    if (flight) w *= 1 - 0.22 * Math.exp(-Math.pow((v - 0.72) / 0.06, 2));
    return w;
  };

  // 1) 封閉羽片輪廓（實心）
  const steps = 96;
  const path = new Path2D();
  for (let i = 0; i <= steps; i++) {
    const v = i / steps, y = H * (1 - v);
    const x = sx - half(v, -1);
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) {
    const v = i / steps, y = H * (1 - v);
    path.lineTo(sx + half(v, 1), y);
  }
  path.closePath();
  const fillG = g.createLinearGradient(0, 0, W, 0);
  fillG.addColorStop(0, 'rgb(246,248,252)');
  fillG.addColorStop(0.4, 'rgb(255,255,255)');
  fillG.addColorStop(1, 'rgb(244,246,251)');
  g.fillStyle = fillG;
  g.fill(path);

  // 2) 羽枝細紋（只畫在羽片內，斜向羽尖；明暗交錯＝羽小鉤扣合的絲質感）
  g.save();
  g.clip(path);
  g.lineCap = 'round';
  for (let y = H - 4; y > 4; y -= 1.7) {
    const v = 1 - y / H;
    for (const dir of [-1, 1]) {
      const len = half(v, dir) * 1.25 + 6;
      const sweep = len * (0.7 + rnd() * 0.15);
      const dark = rnd() < 0.5;
      g.strokeStyle = dark
        ? 'rgba(206,214,230,' + (0.18 + rnd() * 0.2).toFixed(2) + ')'
        : 'rgba(255,255,255,' + (0.5 + rnd() * 0.3).toFixed(2) + ')';
      g.lineWidth = 0.8 + rnd() * 0.9;
      g.beginPath();
      g.moveTo(sx + dir * 2, y);
      g.quadraticCurveTo(sx + dir * len * 0.55, y - sweep * 0.15, sx + dir * len, y - sweep);
      g.stroke();
    }
  }
  // 羽軸兩側微陰影，製造立體感
  const rs = g.createLinearGradient(sx - 9, 0, sx + 9, 0);
  rs.addColorStop(0, 'rgba(200,208,226,0)');
  rs.addColorStop(0.5, 'rgba(200,208,226,0.35)');
  rs.addColorStop(1, 'rgba(200,208,226,0)');
  g.fillStyle = rs;
  g.fillRect(sx - 9, 0, 18, H);
  g.restore();

  // 3) 後緣極細的羽枝分裂（窄縫，不是大洞）
  if (flight) {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    for (let k = 0; k < 7; k++) {
      const v = 0.28 + rnd() * 0.6;
      const y = H * (1 - v);
      const w0 = half(v, 1);
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(sx + w0 + 2, y);
      g.lineTo(sx + w0 - (9 + rnd() * 12), y - (6 + rnd() * 8));
      g.stroke();
    }
    g.restore();
  }

  // 4) 羽根絨羽（蓬鬆、無羽小鉤）
  g.lineCap = 'round';
  for (let k = 0; k < 46; k++) {
    const y = H - 2 - rnd() * H * 0.2;
    const dir = rnd() < 0.5 ? -1 : 1;
    const len = 10 + rnd() * 26;
    g.strokeStyle = 'rgba(255,255,255,' + (0.5 + rnd() * 0.4).toFixed(2) + ')';
    g.lineWidth = 1 + rnd() * 0.8;
    g.beginPath();
    g.moveTo(sx + dir * 2, y);
    g.quadraticCurveTo(sx + dir * len * 0.6, y - len * 0.2, sx + dir * len, y - len * (0.5 + rnd() * 0.5));
    g.stroke();
  }

  // 5) 羽軸（根部粗、往羽尖漸細）
  g.fillStyle = 'rgb(255,251,244)';
  g.beginPath();
  g.moveTo(sx - 2.6, H);
  g.lineTo(sx + 2.6, H);
  g.lineTo(sx + 0.7, H * 0.045);
  g.lineTo(sx - 0.7, H * 0.045);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(205,212,228,0.75)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(sx + 2.2, H);
  g.lineTo(sx + 0.8, H * 0.06);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 羽毛幾何：細分平面，羽軸對齊 x=0；沿長度向後彎、兩側微微下垂成弧面
function createLoveFeatherGeometry() {
  // 厚度：上下兩層薄片（相距 THICK）＋ 羽軸處隆起的脊，從側面看有真實的厚度
  const THICK = 0.07;
  const RIDGE = 0.06;
  const sheet = (zOff, ridgeK) => {
    const g = new THREE.PlaneGeometry(0.5, 1.1, 10, 28);
    g.translate(0.05, 0.55, 0); // 羽軸（貼圖 u=0.4）移到 x=0，羽根在原點，羽尖朝 +y
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const ridge = ridgeK * RIDGE * Math.exp(-Math.pow(x / 0.035, 2)) * (1 - 0.6 * y);
      const z = -0.22 * y * y - Math.abs(x) * (0.3 + 0.2 * y) + zOff + ridge;
      pos.setZ(i, z);
      pos.setX(i, x + 0.05 * y * y);
    }
    return g;
  };
  const front = sheet(THICK / 2, 1);
  const back = sheet(-THICK / 2, -0.6);
  const merged = new THREE.BufferGeometry();
  const attr = (name) => {
    const a = front.attributes[name].array, b = back.attributes[name].array;
    const out = new Float32Array(a.length + b.length);
    out.set(a, 0); out.set(b, a.length);
    merged.setAttribute(name, new THREE.BufferAttribute(out, front.attributes[name].itemSize));
  };
  attr('position'); attr('uv');
  const ia = front.index.array, off = front.attributes.position.count;
  const idx = new Uint16Array(ia.length * 2);
  idx.set(ia, 0);
  for (let i = 0; i < ia.length; i++) idx[ia.length + i] = ia[i] + off;
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeVertexNormals();
  return merged;
}

// 單側翅膀：依鳥翼骨架分層
//   骨架（翅膀平面）：肩 S → 腕 W → 手 T（前緣拱起）
//   · 次級飛羽 (secondaries)：長在前臂 S→W
//   · 初級飛羽 (primaries)：長在手骨 W→T，最長，呈扇形展開
//   · 三級飛羽 (tertials)：靠身體最內側
//   · 覆羽三排 (greater／median／lesser coverts)：一層層像屋瓦蓋住飛羽根部
//   · 小翼羽 (alula)：腕關節前緣的小羽
// pivot 為搧動軸心
function buildLoveWing(side, geo, flightMat, covertMat) {
  const pivot = new THREE.Group();
  pivot.position.set(0.6 * side, 0.3, LOVE_WING_Z);
  pivot.rotation.y = side * 0.28;
  loveGroup.add(pivot);

  const feathers = [];
  const D = Math.PI / 180;
  const WK = 0.72; // 整體翅膀尺寸係數
  const S = { x: 0.2, y: 0.3 }, Wr = { x: 1.75, y: 2.0 }, T = { x: 3.45, y: 2.55 };
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const armPoint = (u) => (u < 0.5 ? lerp(S, Wr, u * 2) : lerp(Wr, T, (u - 0.5) * 2));
  const armTheta = (u) => (u < 0.5 ? -118 + 20 * (u * 2) : -98 + 78 * ((u - 0.5) * 2));

  // base：翅膀平面座標（以右翼為準，左翼用 side 鏡像）；thetaDeg：羽毛指向角
  const add = (mat, base, thetaDeg, len, width, z, tilt, emis, curl) => {
    const f = new THREE.Mesh(geo, mat.clone());
    f.rotation.order = 'YXZ'; // 先 Z（羽毛指向）→ X（傾斜）→ Y（環抱時沿圓弧轉向）
    f.material.emissiveIntensity = emis;
    f.position.set(side * base.x * WK, base.y * WK, z);
    f.rotation.z = side * (thetaDeg * D - Math.PI / 2);
    f.rotation.x = tilt;
    f.scale.set(side * width * WK, (len * WK) / 1.1, 1); // 左翼 x 取負＝鏡像，窄的前緣羽片永遠朝外
    f.userData.basePos = f.position.clone();
    f.userData.baseRotX = f.rotation.x;
    f.userData.baseRotZ = f.rotation.z;
    f.userData.baseScale = f.scale.clone();
    f.userData.baseEmissive = emis;
    f.userData.curl = curl;
    f.userData.theta = thetaDeg; // 攤開時羽毛指向角（度），環抱時往「朝下垂」混合
    feathers.push(f);
    pivot.add(f);
  };
  const jitter = (i) => Math.sin(i * 12.9898) * 1.4;
  const flightList = []; // 記住每根飛羽，覆羽依它定位

  // 三級飛羽（最內側、蓋在次級上）
  for (let i = 0; i < 3; i++) {
    const base = { x: S.x - 0.05 + i * 0.1, y: S.y + 0.05 - i * 0.05 };
    add(flightMat, base, -124 + i * 5, 1.75 - i * 0.12, 1.35, 0.05 + i * 0.01, 0.06, 0.3, i);
  }
  // 次級飛羽 12
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const base = lerp(S, Wr, t);
    const th = -118 + 20 * t + jitter(i);
    const len = 2.1 + 0.35 * t;
    flightList.push({ base, th, len, width: 1.15 });
    add(flightMat, base, th, len, 1.15, -0.02 * i, 0.07, 0.3, i);
  }
  // 初級飛羽 10（扇形，中段最長）
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const base = lerp(Wr, T, t);
    const th = -98 + 78 * t + jitter(i + 20);
    const len = 2.2 + 1.15 * Math.sin(Math.PI * (0.2 + 0.65 * t));
    flightList.push({ base, th, len, width: 1.0 });
    add(flightMat, base, th, len, 1.0, -0.02 * (i + 12), 0.08, 0.3, 12 + i);
  }
  // 大覆羽：每根飛羽一根，蓋住羽根約三分之一
  flightList.forEach((ff, i) => {
    const d = { x: Math.cos(ff.th * D), y: Math.sin(ff.th * D) };
    const shift = 0.15;
    const base = { x: ff.base.x - d.x * shift, y: ff.base.y - d.y * shift };
    add(covertMat, base, ff.th, 0.4 * ff.len + shift, ff.width * 0.95, 0.12, 0.1, 0.32, i % 12);
  });
  // 中覆羽 14
  for (let i = 0; i < 14; i++) {
    const u = i / 13;
    const bp = armPoint(u), th = armTheta(u) + jitter(i + 40);
    const d = { x: Math.cos(th * D), y: Math.sin(th * D) };
    const base = { x: bp.x - d.x * 0.1, y: bp.y - d.y * 0.1 };
    add(covertMat, base, th, 0.95 - 0.2 * u, 0.9, 0.24, 0.12, 0.34, i);
  }
  // 小覆羽 16（最短、最圓，貼在前緣）
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const bp = armPoint(u), th = armTheta(u) + jitter(i + 60);
    const d = { x: Math.cos(th * D), y: Math.sin(th * D) };
    const base = { x: bp.x - d.x * 0.2, y: bp.y - d.y * 0.2 };
    add(covertMat, base, th, 0.55, 0.75, 0.36, 0.14, 0.36, i);
  }
  // 小翼羽 3（腕關節前緣，朝外上方）
  for (let i = 0; i < 3; i++) {
    add(covertMat, { x: Wr.x + 0.05 * i, y: Wr.y + 0.1 }, 8 + i * 20, 0.95 - i * 0.18, 0.6, 0.25 + i * 0.01, 0.1, 0.36, i);
  }

  return { pivot, feathers, side, phase: side > 0 ? 0 : 0.5 };
}

function stopLoveWingTweens() {
  loveWingTweens.forEach(t => t.stop());
  loveWingTweens = [];
}

// 過度耗損：翅膀先萎縮下垂，羽毛再逐片翻滾墜落、淡出消失
function shedLoveWings() {
  if (loveWingMode !== 'normal') return;
  loveWingMode = 'shedding';
  stopLoveWingTweens();

  loveWings.forEach((w) => {
    w.pivot.position.set(0.6 * w.side, 0.3, LOVE_WING_Z);
    new TWEEN.Tween(w.pivot.rotation).to({ y: w.side * 0.28 }, 700).easing(TWEEN.Easing.Quadratic.Out).start();
    const droop = new TWEEN.Tween(w.pivot.rotation)
      .to({ z: w.side * -0.45 }, 700)
      .easing(TWEEN.Easing.Quadratic.In);
    const shrink = new TWEEN.Tween(w.pivot.scale)
      .to({ x: 0.45, y: 0.45, z: 0.45 }, 700)
      .easing(TWEEN.Easing.Quadratic.In);
    loveWingTweens.push(droop, shrink);
    droop.start();
    shrink.start();

    w.feathers.forEach((f, idx) => {
      const witherS = new TWEEN.Tween(f.scale)
        .to({
          x: f.userData.baseScale.x * 0.7,
          y: f.userData.baseScale.y * 0.5,
          z: f.userData.baseScale.z * 0.7,
        }, 650)
        .delay(idx * 6)
        .easing(TWEEN.Easing.Quadratic.In);
      const witherR = new TWEEN.Tween(f.rotation)
        .to({ x: f.userData.baseRotX + 0.7 }, 650)
        .delay(idx * 6)
        .easing(TWEEN.Easing.Quadratic.In);
      loveWingTweens.push(witherS, witherR);
      witherS.start();
      witherR.start();
    });
  });

  // 萎縮完成後：羽毛脫離骨架，翻滾墜落並淡出
  setTimeout(() => {
    if (loveWingMode !== 'shedding') return;

    let shedPending = 0;
    loveWings.forEach(w => shedPending += w.feathers.length);

    loveWings.forEach((w) => {
      w.feathers.forEach((f, idx) => {
        loveGroup.attach(f);

        const fallDelay = idx * 22 + (w.side > 0 ? 0 : 120);
        const fall = new TWEEN.Tween(f.position)
          .to({
            x: f.position.x + w.side * (1.2 + Math.random() * 1.5),
            y: f.position.y - 4.5 - Math.random() * 2.5,
            z: f.position.z + (Math.random() - 0.5) * 2,
          }, 1700)
          .delay(fallDelay)
          .easing(TWEEN.Easing.Quadratic.In);
        const spin = new TWEEN.Tween(f.rotation)
          .to({
            x: f.rotation.x + 2.5 + Math.random() * 2,
            y: f.rotation.y + (Math.random() - 0.5) * 4,
            z: f.rotation.z + (Math.random() - 0.5) * 3,
          }, 1700)
          .delay(fallDelay)
          .easing(TWEEN.Easing.Linear.None);
        const sink = new TWEEN.Tween(f.scale)
          .to({ x: 0.01, y: 0.01, z: 0.01 }, 900)
          .delay(fallDelay + 700)
          .easing(TWEEN.Easing.Quadratic.In);
        const fade = new TWEEN.Tween(f.material)
          .to({ opacity: 0 }, 900)
          .delay(fallDelay + 700)
          .onComplete(() => {
            f.visible = false;
            shedPending--;
            if (shedPending === 0 && loveWingMode === 'shedding') loveWingMode = 'shed';
          });
        loveWingTweens.push(fall, spin, sink, fade);
        fall.start();
        spin.start();
        sink.start();
        fade.start();
      });
    });
  }, 750);
}

// 渴望覓食：墜落中的羽毛飛回骨架，重新長回來
function regrowLoveWings() {
  if (loveWingMode === 'normal') return;
  stopLoveWingTweens();
  loveWingMode = 'regrowing';

  new TWEEN.Tween(loveGroup.scale)
    .to({ x: 1, y: 1, z: 1 }, 900)
    .easing(TWEEN.Easing.Back.Out)
    .start();

  let regrowPending = 0;
  const onFeatherDone = () => {
    regrowPending--;
    if (regrowPending === 0) loveWingMode = 'normal';
  };

  loveWings.forEach((w) => {
    const pivot = w.pivot;
    pivot.position.set(0.6 * w.side, 0.3, LOVE_WING_Z);
    const pRise = new TWEEN.Tween(pivot.scale)
      .to({ x: 1, y: 1, z: 1 }, 900)
      .easing(TWEEN.Easing.Back.Out);
    const pLift = new TWEEN.Tween(pivot.rotation)
      .to({ y: w.side * 0.28, z: w.side * 0.22 }, 900)
      .easing(TWEEN.Easing.Back.Out);
    loveWingTweens.push(pRise, pLift);
    pRise.start();
    pLift.start();

    w.feathers.forEach((f, idx) => {
      pivot.attach(f);
      f.visible = true;
      f.material.opacity = 1;
      regrowPending++;

      const delay = idx * 14;
      const backP = new TWEEN.Tween(f.position)
        .to({ x: f.userData.basePos.x, y: f.userData.basePos.y, z: f.userData.basePos.z }, 850)
        .delay(delay)
        .easing(TWEEN.Easing.Cubic.Out);
      const backR = new TWEEN.Tween(f.rotation)
        .to({ x: f.userData.baseRotX, y: 0, z: f.userData.baseRotZ }, 850)
        .delay(delay)
        .easing(TWEEN.Easing.Cubic.Out);
      const backS = new TWEEN.Tween(f.scale)
        .to({
          x: f.userData.baseScale.x,
          y: f.userData.baseScale.y,
          z: f.userData.baseScale.z,
        }, 850)
        .delay(delay)
        .easing(TWEEN.Easing.Back.Out)
        .onComplete(onFeatherDone);
      loveWingTweens.push(backP, backR, backS);
      backP.start();
      backR.start();
      backS.start();
    });
  });
}

// -------------------------------------------------------------
// [愛 Love] 專屬指令實現
// -------------------------------------------------------------

// 1. 光之抱擁 (強效同化 - 消耗大量能量)
function triggerLoveAssimilate() {
  if (isLoveAssimilating) return;
  isLoveAssimilating = true;

  // FIXED-011: 過度耗損後翅膀已脫落（loveWingMode !== 'normal'），舊版擁抱沒有翅膀可抱、只有覓食才會長回來。
  //   現在：先讓翅膀長回來，長好（回到 normal）才開始擁抱；最多等 5 秒避免卡住。
  if (loveWingMode !== 'normal') {
    loveEnergyText.innerText = "翅膀重新長出…準備擁抱";
    regrowLoveWings();
    let waited = 0;
    const iv = setInterval(() => {
      waited += 100;
      if (loveWingMode === 'normal' || waited >= 5000) {
        clearInterval(iv);
        runLoveEmbrace();
      }
    }, 100);
    return;
  }
  runLoveEmbrace();
}

// 實際的擁抱動作（翅膀確定在場才呼叫）
function runLoveEmbrace() {
  if (typeof LoveVoice !== 'undefined') LoveVoice.embrace(); // 擁抱時叫得更豐富（10 秒冷卻）
  setLoveFeeding(false); // 抱擁時先收起覓食光線

  // 雙翼放大並向前環抱合攏
  loveEmbraceTarget = 1.0;

  // 環抱時整體光輝爆發
  new TWEEN.Tween(loveAura.material)
    .to({ opacity: 0.85 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  // 雙翼與光暈向外極限伸展包覆
  new TWEEN.Tween(loveGroup.scale)
    .to({ x: 1.8, y: 1.8, z: 1.8 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  new TWEEN.Tween(loveAura.scale)
    .to({ x: 3.5, y: 3.5, z: 3.5 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  new TWEEN.Tween(loveCore.material.uniforms.uIntensity)
    .to({ value: 2.8 }, 600)
    .start();

  // 消耗能量！
  loveEnergy = Math.max(0.18, loveEnergy - 0.55);
  updateLoveEnergyUI();

  setTimeout(() => {
    // 釋放完畢，雙翼鬆開環抱，核心因能耗過劇而劇烈暗淡收縮
    loveEmbraceTarget = 0.0;

    new TWEEN.Tween(loveAura.material)
      .to({ opacity: 0.35 }, 1000)
      .start();

    new TWEEN.Tween(loveGroup.scale)
      .to({ x: 0.88, y: 0.88, z: 0.88 }, 1200)
      .easing(TWEEN.Easing.Back.Out)
      .start();

    new TWEEN.Tween(loveAura.scale)
      .to({ x: 1.9, y: 1.9, z: 1.9 }, 1000)
      .start();

    new TWEEN.Tween(loveCore.material.uniforms.uIntensity)
      .to({ value: 0.4 + loveEnergy * 0.8 }, 1000)
      .onComplete(() => {
        isLoveAssimilating = false;
        if (loveEnergy <= 0.25) {
          loveEnergyText.innerText = `能量耗盡 (${Math.round(loveEnergy * 100)}%)！眼環黯淡，極需覓食補充`;
          loveEnergyText.classList.add('burnout');
        }
      })
      .start();
  }, 2600); // 環抱停留 2.6 秒（原 1.2 秒，剛抱滿就放開了）
}

// 覓食光線開關：開則每幀跟著愛移動，關則淡出
function setLoveFeeding(on) {
  isLoveFeeding = on;
  if (loveFeedGroup) loveFeedGroup.visible = true; // 淡出期間還看得到
  const btn = document.getElementById('btn-love-feed');
  if (btn) btn.classList.toggle('feeding', on);
}

// 2. 渴望覓食 (吸收文明情緒 - 回補能量)｜再按一次收起光線
function triggerLoveFeed() {
  if (isLoveFeeding) { setLoveFeeding(false); return; } // 已在覓食中：收線（不重補）
  setLoveFeeding(true);
  loveEnergy = 1.0;
  updateLoveEnergyUI();
  loveEnergyText.innerText = "汲取文明殘影微粒！眼核重新明亮充沛 (100%)";
  loveEnergyText.classList.remove('burnout');

  // 能量光流反哺脈衝
  new TWEEN.Tween(loveCore.scale)
    .to({ x: 1.4, y: 1.4, z: 1.4 }, 300)
    .easing(TWEEN.Easing.Back.Out)
    .onComplete(() => {
      new TWEEN.Tween(loveCore.scale).to({ x: 1.0, y: 1.0, z: 1.0 }, 700).start();
    })
    .start();

  new TWEEN.Tween(loveCore.material.uniforms.uIntensity)
    .to({ value: 1.8 }, 400)
    .onComplete(() => {
      new TWEEN.Tween(loveCore.material.uniforms.uIntensity).to({ value: 1.2 }, 800).start();
    })
    .start();

  loveParticles.material.color.setHex(0xffea00);
  setTimeout(() => {
    loveParticles.material.color.setHex(0xfbbf24);
  }, 1000);

  regrowLoveWings();
}

// 3. 過度耗損 (能量枯竭展示)
function triggerLoveBurnout() {
  setLoveFeeding(false); // 枯竭時收起光線
  loveEnergy = 0.08;
  loveEmbraceTarget = 0.0;
  updateLoveEnergyUI();
  loveEnergyText.innerText = "能量枯竭 (8%)！因無度同化與付出而陷入暗淡休眠";
  loveEnergyText.classList.add('burnout');

  shedLoveWings();

  new TWEEN.Tween(loveCore.material.uniforms.uIntensity)
    .to({ value: 0.15 }, 900)
    .start();

  new TWEEN.Tween(loveAura.material)
    .to({ opacity: 0.08 }, 900)
    .start();

  new TWEEN.Tween(loveGroup.scale)
    .to({ x: 0.75, y: 0.75, z: 0.75 }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .start();
}

function updateLoveEnergyUI() {
  const percent = Math.round(loveEnergy * 100);
  // 像素 HP 條：寬度跟能量走，低於 60% 變黃、低於 25% 變紅並閃爍
  if (loveEnergyBar) {
    loveEnergyBar.style.width = Math.max(4, percent) + '%';
    loveEnergyBar.classList.toggle('mid', loveEnergy <= 0.6 && loveEnergy > 0.25);
    loveEnergyBar.classList.toggle('low', loveEnergy <= 0.25);
  }
  if (loveEnergy > 0.6) {
    loveEnergyText.innerText = `能量充沛 (${percent}%)・眼環明亮強烈`;
    loveEnergyText.classList.remove('burnout');
  } else if (loveEnergy > 0.25) {
    loveEnergyText.innerText = `能量代謝中 (${percent}%)・光絲收攏`;
    loveEnergyText.classList.remove('burnout');
  }
}

// -------------------------------------------------------------
// 3. 構建「羞恥 (Shame)」：發光核心＋圍繞它的塗鴉筆劃
// -------------------------------------------------------------
function buildShameCreature() {
  shameGroup = new THREE.Group();
  shameGroup.position.y = SHAME_HOVER_Y;
  scene.add(shameGroup);

  // 蠟筆顆粒貼圖（全部筆劃共用）
  crayonAlphaTex = createCrayonAlphaTexture();

  // 鬼臉五官：黑蠟筆筆觸，只有散開時才浮出來
  shameFaceMat = new THREE.MeshBasicMaterial({
    color: 0x14100e,
    alphaMap: crayonAlphaTex,
    alphaTest: 0.2,
  });

  // 鬼臉周圍的亂畫記號：也是黑色，像用同一支筆亂塗
  shameAccentMat = new THREE.MeshBasicMaterial({
    color: 0x14100e,
    alphaMap: crayonAlphaTex,
    alphaTest: 0.2,
  });

  // 64 組蠟筆塗鴉筆劃：整隻生物就是這團塗鴉，沒有核心
  for (let i = 0; i < 64; i++) {
    const scribble = buildShameScribble(i, 64);
    shameScribbles.push(scribble);
    shameGroup.add(scribble);
  }

  const pCount = 550;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  const pVels = [];

  for (let i = 0; i < pCount; i++) {
    const r = 2.0 + Math.random() * 6.0;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;

    pPos[i * 3] = r * Math.cos(phi) * Math.cos(theta);
    pPos[i * 3 + 1] = r * Math.sin(phi);
    pPos[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);

    pVels.push({
      baseR: r,
      theta: theta,
      speed: 0.005 + Math.random() * 0.01,
    });
  }

  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xf43f5e,
    size: 0.11,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
  });

  shameParticles = new THREE.Points(pGeo, pMat);
  shameParticles.userData = { vels: pVels };
  shameGroup.add(shameParticles);
}

// -------------------------------------------------------------
// 3.5 羞恥的蠟筆塗鴉：隨機亂塗，筆尖先跑、筆尾擦掉，持續自我重畫
// -------------------------------------------------------------
function createCrayonAlphaTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  // 底色全白（不透明），再撒黑色顆粒與刮痕挖出蠟筆的毛邊
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.55})`;
    ctx.fillRect(
      Math.random() * size,
      Math.random() * size,
      1 + Math.random() * 2.5,
      1 + Math.random() * 2.5
    );
  }
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.3})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    const y = Math.random() * size;
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 30);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1); // 顆粒沿筆觸長度重複
  return tex;
}

function generateScribbleCurve() {
  const pts = [];
  // 半徑固定落在 1.15~2.25 的球殼層 → 線條只在球面上亂竄，整團才會讀成一顆球
  const shellR = 1.35 + Math.random() * 0.75;
  // 起點用均勻球面分佈（phi = acos(2u-1)），球的每一個面都塗得到
  let theta = Math.random() * Math.PI * 2;
  let phi = Math.acos(2 * Math.random() - 1) - Math.PI / 2;
  const steps = 16 + Math.floor(Math.random() * 8);

  for (let i = 0; i <= steps; i++) {
    // 角度亂跳的幅度比之前小一點：線條沿著球面繞，不會整條穿進球心
    theta += (Math.random() - 0.5) * 1.5;
    phi += (Math.random() - 0.5) * 0.8;
    phi = Math.max(-1.45, Math.min(1.45, phi));
    const r = Math.max(1.15, Math.min(2.25, shellR + (Math.random() - 0.5) * 0.5));
    pts.push(new THREE.Vector3(
      r * Math.cos(phi) * Math.cos(theta),
      r * Math.sin(phi),
      r * Math.cos(phi) * Math.sin(theta)
    ));
  }
  return new THREE.CatmullRomCurve3(pts);
}

// 散開落點：斐波那契球面均勻分佈（黃金角切球），每張臉幾乎等距 → 不會疊在一起，
// 且往上下左右前後全方向散開（不是只有水平一層）；整團抬高，最低點仍浮在沙地之上
function randomShameScatterPos(index, total) {
  const golden = Math.PI * (3 - Math.sqrt(5));       // 黃金角
  const t = total > 1 ? index / (total - 1) : 0.5;
  const ySphere = 1 - t * 2;                          // +1 頂 → -1 底等距切球
  const ringR = Math.sqrt(Math.max(0, 1 - ySphere * ySphere));
  const theta = golden * index + Math.random() * 0.35; // 微幅亂角，避免像人造晶格
  const radius = 4.6 + Math.random() * 3.2;            // 半徑 4.6~7.8，散得更開、有前後深度
  const v = new THREE.Vector3(
    Math.cos(theta) * ringR * radius,
    ySphere * radius * 0.45 + 1.3,                     // 垂直展幅夠大但不壓成平盤，整團抬高離地
    Math.sin(theta) * ringR * radius
  );
  return v;
}

function buildShameScribble(scatterIndex, scatterTotal) {
  const grp = new THREE.Group();

  const curve = generateScribbleCurve();
  const tubularSegs = 100;
  const radialSegs = 5;
  const inkRadius = 0.03; // 筆劃變密後稍微收細，才不會糊成一團

  // 蠟筆筆觸：深玫瑰紅、顆粒 alpha 挖毛邊，沒有光暈沒有邊框
  const inkGeo = new THREE.TubeGeometry(curve, tubularSegs, inkRadius, radialSegs, false);
  const inkMat = new THREE.MeshBasicMaterial({
    color: 0xc41e4a,
    alphaMap: crayonAlphaTex,
    alphaTest: 0.2,
  });
  const inkMesh = new THREE.Mesh(inkGeo, inkMat);
  grp.add(inkMesh);

  // 散開後這團塗鴉會轉向鏡頭，長出一張黑蠟筆鬼臉
  const face = buildShameGhostFace();
  grp.add(face);

  grp.userData = {
    inkMesh: inkMesh,
    inkRadius: inkRadius,
    tubularSegs: tubularSegs,
    radialSegs: radialSegs,
    indexCount: inkGeo.index.count,
    drawT: Math.random() * 4.0,           // 每筆起點時間錯開
    cycle: 3.0 + Math.random() * 2.2,     // 一輪「塗完＋擦掉」的秒數
    closedPos: new THREE.Vector3(0, 0, 0),
    scatterPos: randomShameScatterPos(scatterIndex, scatterTotal),
    scatterIndex: scatterIndex,   // 重生時用同一格位重抽，均勻分佈不會亂掉
    baseRot: new THREE.Euler(0, 0, 0),
    scatterRot: new THREE.Euler(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    ),
    face: face,
    faceScale: 0.85 + Math.random() * 0.5,       // 每張臉大小不一
    faceTilt: new THREE.Euler(                     // 面向鏡頭時保留一點歪斜，不要太制式
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.8
    ),
    jitterSeed: Math.random() * 100,
  };
  face.visible = false;
  return grp;
}

// -------------------------------------------------------------
// 3.6 羞恥的塗鴉鬼臉：瘋狂手畫風
//     特徵：線條全部帶抖動、左右眼大小不一樣、叉眼／渦卷眼、
//     鋸齒尖牙咧嘴、縫線嘴、歪斜眉毛、周圍亂噴的小刮痕與火花
//     五官畫在球殻前方（+Z），鬼臉轉向鏡頭時剛好是正臉
// -------------------------------------------------------------
const FACE_INK_R = 0.064; // 五官筆觸粗細

function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rnd(a, b) { return a + Math.random() * (b - a); }

// 手抖的直線：切成小段、中間點隨機偏移 → 線條發抖、不平滑
function shakyLine(x1, y1, x2, y2, segs, amp) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const edge = (i === 0 || i === segs);
    pts.push(new THREE.Vector3(
      x1 + (x2 - x1) * t + (edge ? 0 : (Math.random() - 0.5) * amp),
      y1 + (y2 - y1) * t + (edge ? 0 : (Math.random() - 0.5) * amp),
      (Math.random() - 0.5) * amp * 0.6
    ));
  }
  return pts;
}

// 毛邊橢圓：角度與半徑都亂抖，畫出來不像標準圓
function roughEllipsePts(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.09, 0.09);
    const w = 1 + (Math.random() - 0.5) * 0.3;
    pts.push(new THREE.Vector3(
      cx + Math.cos(a) * rx * w,
      cy + Math.sin(a) * ry * w,
      rnd(-0.04, 0.04)
    ));
  }
  return pts;
}

// 一段齒列：x0→x1 之間上下交替的尖牙
function teethRowPts(x0, x1, y, teeth, toothH) {
  const pts = [];
  const n = teeth * 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(
      x0 + (x1 - x0) * t + rnd(-0.02, 0.02),
      y + (i % 2 === 0 ? 0 : toothH) + rnd(-0.025, 0.025),
      rnd(-0.03, 0.03)
    ));
  }
  return pts;
}

// 路徑點 → 蠟筆管狀幾何（不包 Mesh，之後要合併）
function crayonGeo(pts, radius, closed) {
  const curve = new THREE.CatmullRomCurve3(pts, !!closed);
  const segs = Math.max(8, pts.length * 3);
  return new THREE.TubeGeometry(curve, segs, radius, 5, !!closed);
}

// 把一張臉的眾多筆觸合成一個幾何：64 張臉從 ~600 個 draw call 降到 128
function mergeStrokeGeos(geos) {
  if (!geos.length) return null;
  let vTotal = 0, iTotal = 0;
  geos.forEach(g => {
    vTotal += g.attributes.position.count;
    iTotal += g.index.count;
  });

  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idx = new Uint32Array(iTotal);

  let vOff = 0, iOff = 0;
  geos.forEach(g => {
    pos.set(g.attributes.position.array, vOff * 3);
    nor.set(g.attributes.normal.array, vOff * 3);
    uv.set(g.attributes.uv.array, vOff * 2);
    const gi = g.index.array;
    for (let k = 0; k < gi.length; k++) idx[iOff + k] = gi[k] + vOff;
    vOff += g.attributes.position.count;
    iOff += gi.length;
    g.dispose();
  });

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// 眼睛三型：叉眼 / 渦卷眼 / 毛邊圓＋瞳孔（s = 這隻眼的大小）
function buildGhostEyeGeos(style, cx, cy, s) {
  const geos = [];
  const r = FACE_INK_R;

  if (style === 'xX') {
    const L = 0.27 * s;
    geos.push(crayonGeo(shakyLine(cx - L, cy - L, cx + L, cy + L, 4, 0.07), r, false));
    geos.push(crayonGeo(shakyLine(cx - L, cy + L, cx + L, cy - L, 4, 0.07), r, false));
  } else if (style === 'spiral') {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * Math.PI * 2 * 3.2;
      const rr = (0.04 + t * 0.28) * s;
      pts.push(new THREE.Vector3(
        cx + Math.cos(a) * rr + rnd(-0.02, 0.02),
        cy + Math.sin(a) * rr + rnd(-0.02, 0.02),
        rnd(-0.03, 0.03)
      ));
    }
    geos.push(crayonGeo(pts, r * 0.9, false));
  } else {
    // 毛邊圓眼＋偏心瞳孔＋瞳孔裡一劃刮痕
    geos.push(crayonGeo(roughEllipsePts(cx, cy, 0.27 * s, 0.3 * s, 12), r, true));
    const px = cx + rnd(-0.08, 0.08) * s;
    const py = cy + rnd(-0.08, 0.08) * s;
    geos.push(crayonGeo(roughEllipsePts(px, py, 0.1 * s, 0.11 * s, 8), r * 0.9, true));
    geos.push(crayonGeo(shakyLine(px - 0.1 * s, py, px + 0.1 * s, py + 0.04, 2, 0.03), r * 0.7, false));
  }
  return geos;
}

// 嘴巴五型：鋸齒咧嘴 / 張口尖牙 / 縫線 / 抖動波浪 / 刮出來的皺眉
function buildGhostMouthGeos(style, my) {
  const geos = [];
  const r = FACE_INK_R;

  if (style === 'grin') {
    // 沿著笑弧（∪）上下交替 → 一排尖牙的咧嘴笑
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const x = -0.62 + t * 1.24;
      const arc = my - 0.06 + 1.3 * x * x;
      pts.push(new THREE.Vector3(x, arc + (i % 2 === 0 ? 0.11 : -0.07) + rnd(-0.03, 0.03), rnd(-0.03, 0.03)));
    }
    geos.push(crayonGeo(pts, r, false));
    // 上緣補一條抖線，讓嘴巴有厚度
    geos.push(crayonGeo(shakyLine(-0.6, my + 0.02, 0.6, my + 0.02, 5, 0.05), r * 0.8, false));
  } else if (style === 'shout') {
    geos.push(crayonGeo(roughEllipsePts(0, my, 0.34, 0.42, 14), r, true));
    geos.push(crayonGeo(teethRowPts(-0.26, 0.26, my + 0.18, 4, -0.12), r * 0.85, false));
    geos.push(crayonGeo(teethRowPts(-0.26, 0.26, my - 0.18, 4, 0.12), r * 0.85, false));
  } else if (style === 'stitch') {
    geos.push(crayonGeo(shakyLine(-0.64, my, 0.64, my, 6, 0.06), r, false));
    for (let i = 0; i < 5; i++) {
      const x = -0.46 + i * 0.23;
      geos.push(crayonGeo(shakyLine(x, my - 0.15, x + rnd(-0.06, 0.06), my + 0.15, 3, 0.05), r * 0.8, false));
    }
  } else if (style === 'wave') {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector3(
        -0.6 + t * 1.2,
        my + Math.sin(t * Math.PI * 3.2) * 0.17 + rnd(-0.05, 0.05),
        rnd(-0.03, 0.03)
      ));
    }
    geos.push(crayonGeo(pts, r, false));
  } else {
    // 皺眉：∩ 形，帶抖動
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = -0.55 + t * 1.1;
      pts.push(new THREE.Vector3(x, my + 0.34 - 1.4 * x * x + rnd(-0.05, 0.05), rnd(-0.03, 0.03)));
    }
    geos.push(crayonGeo(pts, r, false));
  }
  return geos;
}

// 臉周圍亂噴的粉紅記號：短刮痕 / 火花 / 小渦卷 / 小圈點
function buildGhostStrayGeos(count) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const a = rnd(0, Math.PI * 2);
    const rr = rnd(0.95, 1.45);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.85;
    const type = pickOne(['tick', 'spark', 'curl', 'dot']);

    if (type === 'tick') {
      const len = rnd(0.14, 0.32);
      const ang = rnd(0, Math.PI);
      geos.push(crayonGeo(shakyLine(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, 3, 0.05), FACE_INK_R * 0.8, false));
    } else if (type === 'spark') {
      for (let k = 0; k < 3; k++) {
        const ang = k * (Math.PI * 2 / 3) + rnd(-0.35, 0.35);
        const len = rnd(0.1, 0.22);
        geos.push(crayonGeo(shakyLine(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, 2, 0.04), FACE_INK_R * 0.7, false));
      }
    } else if (type === 'curl') {
      const pts = [];
      for (let k = 0; k <= 18; k++) {
        const t = k / 18;
        const aa = t * Math.PI * 3;
        const r2 = 0.03 + t * 0.14;
        pts.push(new THREE.Vector3(x + Math.cos(aa) * r2, y + Math.sin(aa) * r2, rnd(-0.02, 0.02)));
      }
      geos.push(crayonGeo(pts, FACE_INK_R * 0.7, false));
    } else {
      geos.push(crayonGeo(roughEllipsePts(x, y, 0.06, 0.06, 7), FACE_INK_R * 1.1, true));
    }
  }
  return geos;
}

function buildShameGhostFace() {
  const face = new THREE.Group();
  const whiteGeos = []; // 白色五官
  const accentGeos = []; // 粉紅亂畫記號

  const eyeStyle = pickOne(['xX', 'spiral', 'ringDot']);
  const mouthStyle = pickOne(['grin', 'shout', 'stitch', 'wave', 'frown']);
  const eyeX = rnd(0.46, 0.6);
  const eyeY = rnd(0.38, 0.56);

  [-1, 1].forEach((side) => {
    const s = rnd(0.75, 1.35); // 大小眼：左右眼不一樣大
    const cx = side * eyeX * rnd(0.9, 1.12);
    const cy = eyeY + rnd(-0.11, 0.11);
    buildGhostEyeGeos(eyeStyle, cx, cy, s).forEach(g => whiteGeos.push(g));

    // 眉毛：歪斜、左右不對稱
    const tilt = rnd(0.18, 0.55) * side * (Math.random() > 0.5 ? 1 : -1);
    whiteGeos.push(crayonGeo(
      shakyLine(cx - 0.3, cy + 0.44 - tilt, cx + 0.3, cy + 0.44 + tilt, 4, 0.06),
      FACE_INK_R * 0.85, false
    ));
  });

  buildGhostMouthGeos(mouthStyle, rnd(-0.64, -0.48)).forEach(g => whiteGeos.push(g));
  buildGhostStrayGeos(3 + Math.floor(Math.random() * 3)).forEach(g => accentGeos.push(g));

  const whiteGeo = mergeStrokeGeos(whiteGeos);
  if (whiteGeo) face.add(new THREE.Mesh(whiteGeo, shameFaceMat));
  const accentGeo = mergeStrokeGeos(accentGeos);
  if (accentGeo) face.add(new THREE.Mesh(accentGeo, shameAccentMat));

  face.position.z = 2.3 + Math.random() * 0.25; // 貼在球殻外側，不會被筆劃埋住
  return face;
}

function updateScribbleDraw(scribble, delta) {
  const ud = scribble.userData;
  ud.drawT += delta * (isFlushed ? 2.4 : 1); // 泛紅時線條自我重畫快一倍多

  if (ud.drawT >= ud.cycle) {
    // 這一輪畫完 → 換一條新的亂塗
    ud.drawT = 0;
    ud.cycle = isFlushed ? 1.0 + Math.random() * 0.8 : 3.0 + Math.random() * 2.2;

    const curve = generateScribbleCurve();
    // 緊縮護核時塗鴉變密：每根線條粗一點，整團讀成密集的亂塗而不是稀疏線條
    const thick = ud.inkRadius * (1 + 0.95 * shameHuddleFactor);
    const newInk = new THREE.TubeGeometry(curve, ud.tubularSegs, thick, ud.radialSegs, false);
    ud.inkMesh.geometry.dispose();
    ud.inkMesh.geometry = newInk;
    ud.indexCount = newInk.index.count;

    // 收合狀態下才換散開方向，避免散開中整條瞬移
    if (shameDisassembleFactor < 0.15) {
      ud.scatterPos.copy(randomShameScatterPos(ud.scatterIndex, 64));
    }
  }

  // 筆尖 head 先跑、筆尾 tail 跟著擦掉 → 看起來像正在塗鴉
  const u = ud.drawT / ud.cycle;
  const headU = Math.min(1, u * 1.8);
  const tailU = Math.max(0, (u - 0.45) * 1.8);

  // 量化成整圈（每圈 radialSegs × 6 個索引），drawRange 才不會切到三角形中間
  const ringIdx = ud.radialSegs * 6;
  const headI = Math.floor(headU * ud.tubularSegs) * ringIdx;
  const tailI = Math.floor(tailU * ud.tubularSegs) * ringIdx;
  const count = Math.max(0, headI - tailI);

  ud.inkMesh.geometry.setDrawRange(tailI, count);
}

// 程序生成的徑向光暈貼圖（赤瞳之類的小光點用）
function createRadialGlowTexture(rgb) {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(' + rgb + ',1)');
  g.addColorStop(0.28, 'rgba(' + rgb + ',0.85)');
  g.addColorStop(0.62, 'rgba(' + rgb + ',0.25)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// -------------------------------------------------------------
// 古文明符文：程序生成的原始字形貼圖（不是任何真實文字）
// -------------------------------------------------------------
function createRuneTextures(count) {
  const texs = [];
  const S = 256;
  for (let i = 0; i < count; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.lineWidth = S * 0.042;
    ctx.lineCap = 'butt';            // 平切的筆尾，像鑿出來的
    ctx.lineJoin = 'miter';          // 尖角接合
    ctx.miterLimit = 6;
    ctx.shadowColor = 'rgba(255,255,255,0.7)';
    ctx.shadowBlur = S * 0.028;      // 光暈收小，邊緣才銳利
    drawRuneGlyph(ctx, S);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    texs.push(tex);
  }
  return texs;
}

// 字形的「文法」取自幾種真實古文明書寫的共通特徵（但每顆都是隨機生成、不是任何真實文字）：
//   0 棍幹符文：一根主幹＋只用 45° 斜枝與三角環（刻在木／石上，不會有水平線與曲線）
//   1 楔形文字：泥板上壓出的三角楔，橫／直／斜三種方向成組排列
//   2 刻痕文字：一條主線上刻短劃，一組一組分開（歐甘式）
//   3 方塊聖書體：圓角方框＋圓點與橫槓（像馬雅的數字與字塊），外側有小耳
//   4 象形符號：環頂十字、太陽、眼睛三種
//   5 岩畫螺旋＋刻痕
// 外加 40% 機率加上石碑角框，像刻在碑面上的一行字
function drawRuneGlyph(ctx, S) {
  const m = S * 0.2;
  const C = S / 2;
  const SNAP = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

  // 楔形：頭寬尾尖的細長三角（填滿），ang 為尾巴指向
  const wedge = (x, y, ang, len, w) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const px = -dy, py = dx;
    ctx.beginPath();
    ctx.moveTo(x + px * w / 2, y + py * w / 2);
    ctx.lineTo(x - px * w / 2, y - py * w / 2);
    ctx.lineTo(x + dx * len, y + dy * len);
    ctx.closePath();
    ctx.fill();
  };
  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  ctx.save();
  ctx.fillStyle = 'rgb(255,255,255)';
  const style = Math.floor(Math.random() * 6);

  if (style === 0) {
    // —— 棍幹符文 ——
    const x = C, y0 = m, y1 = S - m;
    line(x, y0, x, y1);
    const twin = Math.random() < 0.28;                  // 有時是雙幹（像 ᚺ ᛖ 一類的形狀）
    const x2 = x + S * rnd(0.12, 0.17);
    if (twin) line(x2, y0, x2, y1);
    const parts = 1 + Math.floor(Math.random() * 3);
    const levels = [0.15, 0.4, 0.62].sort(() => Math.random() - 0.5).slice(0, parts).sort();
    levels.forEach((lv) => {
      const ya = y0 + (y1 - y0) * lv;
      const L = S * rnd(0.12, 0.2);
      const kind = Math.random();
      if (kind < 0.4) {
        // 三角環（像 ᚹ ᚦ ᛒ 的環）
        const d = Math.random() > 0.5 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, ya);
        ctx.lineTo(x + d * L, ya + L * 0.75);
        ctx.lineTo(x, ya + L * 1.5);
        if (Math.random() > 0.4) ctx.closePath();
        ctx.stroke();
      } else if (kind < 0.8) {
        // 45° 單斜枝，向上或向下
        const a = pick(SNAP);
        line(x, ya, x + Math.cos(a) * L * 1.2, ya + Math.sin(a) * L * 1.2);
      } else {
        // 對稱雙斜枝（像 ᛉ ᚨ 的叉）
        line(x, ya, x - L, ya - L);
        line(x, ya, x + L, ya - L);
      }
    });
    if (Math.random() < 0.3) line(x - S * 0.12, y0 + S * 0.1, x + S * 0.12, y1 - S * 0.1);   // 貫穿斜線
  } else if (style === 1) {
    // —— 楔形文字 ——
    const rows = 2 + Math.floor(Math.random() * 2);
    const rowH = (S - 2 * m) / rows;
    for (let r = 0; r < rows; r++) {
      const cols = 1 + Math.floor(Math.random() * 3);
      const cy = m + rowH * (r + 0.5);
      let cx = m + rnd(0, S * 0.05);
      for (let c = 0; c < cols; c++) {
        const kind = Math.random();
        const w = S * rnd(0.06, 0.085), len = S * rnd(0.13, 0.2);
        if (kind < 0.4) { wedge(cx, cy, 0, len, w); cx += len + S * 0.05; }                        // 橫楔
        else if (kind < 0.75) { wedge(cx, cy - len / 2, Math.PI / 2, len, w); cx += w + S * 0.07; } // 直楔
        else {                                                                                       // 角楔（兩個斜楔相對）
          wedge(cx, cy - len * 0.35, Math.PI / 4, len * 0.7, w * 0.9);
          wedge(cx + len * 0.1, cy + len * 0.35, -Math.PI / 4, len * 0.7, w * 0.9);
          cx += len * 0.75 + S * 0.05;
        }
        if (cx > S - m) break;
      }
    }
  } else if (style === 2) {
    // —— 刻痕文字 ——
    const x = C, y0 = m, y1 = S - m;
    line(x, y0, x, y1);
    const groups = 1 + Math.floor(Math.random() * 2);
    let y = y0 + S * 0.04;
    for (let g = 0; g < groups; g++) {
      const n = 1 + Math.floor(Math.random() * 4);
      const mode = Math.floor(Math.random() * 3);         // 0 左側 1 右側 2 貫穿斜刻
      for (let i = 0; i < n; i++) {
        const yy = y + i * S * 0.07;
        const L = S * rnd(0.1, 0.14);
        if (mode === 0) line(x, yy, x - L, yy);
        else if (mode === 1) line(x, yy, x + L, yy);
        else line(x - L, yy + L * 0.4, x + L, yy - L * 0.4);
      }
      y += n * S * 0.07 + S * 0.08;                      // 組與組之間留空
      if (y > y1 - S * 0.05) break;
    }
  } else if (style === 3) {
    // —— 方塊聖書體 ——
    const w = S * 0.5, h = S * 0.58;
    const x0 = C - w / 2, y0 = C - h / 2;
    ctx.save();
    ctx.lineWidth = S * 0.034;
    roundRect(x0, y0, w, h, S * 0.07);
    ctx.stroke();
    ctx.restore();
    // 內部（刻意不對稱，避免看起來像臉）：左欄圓點直排（點＝1）、右欄粗豎槓（槓＝5）、頂部一個小螺旋
    const dr = S * 0.026;
    const dots = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < dots; i++) {
      ctx.beginPath(); ctx.arc(x0 + w * 0.3, y0 + h * (0.34 + i * (0.5 / dots)), dr, 0, Math.PI * 2); ctx.fill();
    }
    const bars = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < bars; i++) {
      roundRect(x0 + w * (0.55 + i * 0.16), y0 + h * 0.3, S * 0.04, h * 0.52, S * 0.015);
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 3, r = S * 0.006 + (i / 24) * S * 0.035;
      const px = x0 + w * 0.3 + Math.cos(a) * r, py = y0 + h * 0.16 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (style === 4) {
    // —— 象形符號 ——
    const k = Math.floor(Math.random() * 3);
    if (k === 0) {
      // 環頂十字（像生命符）
      const R = S * 0.12;
      ctx.beginPath(); ctx.ellipse(C, m + R * 1.2, R * 0.8, R * 1.2, 0, 0, Math.PI * 2); ctx.stroke();
      line(C, m + R * 2.4, C, S - m);
      line(C - S * 0.16, m + R * 3.2, C + S * 0.16, m + R * 3.2);
    } else if (k === 1) {
      // 太陽：圓環＋中心點＋放射短線
      const R = S * 0.14;
      ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(C, C, S * 0.028, 0, Math.PI * 2); ctx.fill();
      const rays = pick([8, 12]);
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        line(C + Math.cos(a) * (R + S * 0.04), C + Math.sin(a) * (R + S * 0.04), C + Math.cos(a) * (R + S * 0.12), C + Math.sin(a) * (R + S * 0.12));
      }
    } else {
      // 眼睛：杏仁形＋瞳孔＋下垂淚線
      const wI = S * 0.3, hI = S * 0.15;
      ctx.beginPath();
      ctx.moveTo(C - wI, C);
      ctx.quadraticCurveTo(C, C - hI * 2, C + wI, C);
      ctx.quadraticCurveTo(C, C + hI * 2, C - wI, C);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.arc(C, C, S * 0.05, 0, Math.PI * 2); ctx.fill();
      line(C + S * 0.04, C + hI, C + S * 0.04, C + hI + S * 0.14);
      line(C + S * 0.04, C + hI + S * 0.14, C - S * 0.04, C + hI + S * 0.2);
    }
  } else {
    // —— 岩畫螺旋＋刻痕 ——
    ctx.beginPath();
    let r = S * 0.03, a = 0;
    ctx.moveTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    const turns = rnd(2.2, 3.6);
    for (let i = 0; i <= 90; i++) {
      a = (i / 90) * turns * Math.PI * 2;
      r = S * 0.03 + (i / 90) * (S / 2 - m - S * 0.03);
      ctx.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
    }
    ctx.stroke();
    const marks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < marks; i++) {
      const y = S * rnd(0.28, 0.72);
      const w = S * rnd(0.1, 0.22);
      const x = Math.random() > 0.5 ? S * 0.16 : S * 0.84;
      line(x - w / 2, y, x + w / 2, y);
    }
  }

  // 石碑角框：四個角各刻一個 L 形記號
  if (Math.random() < 0.4) {
    ctx.save();
    ctx.lineWidth = S * 0.02;
    const e = S * 0.1, L = S * 0.1;
    [[e, e, 1, 1], [S - e, e, -1, 1], [e, S - e, 1, -1], [S - e, S - e, -1, -1]].forEach(([px, py, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(px + sx * L, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * L); ctx.stroke();
    });
    ctx.restore();
  }

  drawRuneCracks(ctx, S);
  ctx.restore();
}

// 龜裂：用擦除的方式在符文上刻出鋸齒狀裂痕
function drawRuneCracks(ctx, S) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.shadowBlur = 0;                       // 擦除不能帶光暈，邊緣才乾脆
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = S * 0.02;
  const cracks = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < cracks; i++) {
    // 從畫布邊緣往內走的鋸齒裂線
    let x, y, ang;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { x = S * (0.15 + Math.random() * 0.7); y = S * 0.05; }
    else if (side === 1) { x = S - S * 0.05; y = S * (0.15 + Math.random() * 0.7); }
    else if (side === 2) { x = S * (0.15 + Math.random() * 0.7); y = S - S * 0.05; }
    else { x = S * 0.05; y = S * (0.15 + Math.random() * 0.7); }
    // 朝符文中心走，比較會真的劃過筆畫
    ang = Math.atan2(S / 2 - y, S / 2 - x) + (Math.random() - 0.5) * 1.2;

    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < segs; k++) {
      ang += (Math.random() - 0.5) * 1.5;      // 每段都突然轉向，像真的裂開
      const len = S * (0.08 + Math.random() * 0.14);
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    // 有時候裂到一半岔出一小條
    if (Math.random() > 0.45) {
      const bx = x + Math.cos(ang + (Math.random() > 0.5 ? 1 : -1)) * S * 0.08;
      const by = y + Math.sin(ang + (Math.random() > 0.5 ? 1 : -1)) * S * 0.08;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 符文掉到核心就被吸走，重新補一顆到最外圈
function respawnVoidRune(rune) {
  const r = rune.userData;
  r.radius = r.outerR * (0.92 + Math.random() * 0.3);
  r.angle = Math.random() * Math.PI * 2;
  r.pullSpeed = 0.42 + Math.random() * 0.3;
  r.angSpeed = (0.16 + Math.random() * 0.14) * (Math.random() > 0.15 ? 1 : -1);
  r.spinSpeed = (Math.random() - 0.5) * 0.9;
  r.fadeIn = 0;
  const texIndex = Math.floor(Math.random() * voidRuneTextures.length);
  r.texIndex = texIndex;
  rune.material.map = voidRuneTextures[texIndex];
  rune.material.needsUpdate = true;
}

// 每幀更新：符文面向鏡頭、被引力拉向核心、掉進核心就消失，外側持續補新的
function updateVoidRunes(frameDelta) {
  voidGroup.getWorldQuaternion(voidRuneGroupInv).invert();
  voidRuneCamQuat.copy(voidRuneGroupInv).multiply(camera.quaternion);

  voidRunes.forEach((rune) => {
    const r = rune.userData;
    // near：1 = 最外圈，0 = 貼到核心
    const near = Math.max(0, (r.radius - r.coreR) / (r.outerR - r.coreR));
    const pull = 1 + (1 - near) * 3.0;   // 越靠近核心掉越快、轉越快

    r.angle += r.angSpeed * pull * frameDelta;
    r.radius -= r.pullSpeed * pull * frameDelta;
    r.spinAngle += r.spinSpeed * frameDelta;
    r.fadeIn = Math.min(1, r.fadeIn + frameDelta / 0.7);

    if (r.radius <= r.coreR + 0.02) respawnVoidRune(rune);

    const nearNear = Math.max(0, (r.radius - r.coreR) / (r.outerR - r.coreR));
    voidRunePosTmp.copy(r.u).multiplyScalar(Math.cos(r.angle))
      .addScaledVector(r.v, Math.sin(r.angle))
      .multiplyScalar(r.radius * (1 + voidRuneBurst.v * 2.4));
    rune.position.copy(voidRunePosTmp);

    // 面向鏡頭再自轉一圈（像浮在空中慢慢轉的石刻）
    rune.quaternion.copy(voidRuneCamQuat);
    rune.rotateZ(r.spinAngle);

    // 淡入：剛生出來；淡出：貼近核心前；縮小：被吸進去
    const outT = Math.min(1, Math.max(0, (nearNear - 0.03) / 0.2));
    const s = r.baseSize * (0.55 + 0.45 * Math.min(1, nearNear * 1.4));
    rune.scale.set(s, s, s);
    rune.material.opacity = 0.95 * r.fadeIn * outT;
  });
}

// -------------------------------------------------------------
// 4. 構建「虛無 (Void)」(保持完全未動)
// -------------------------------------------------------------
function buildVoidCreature() {
  voidGroup = new THREE.Group();
  scene.add(voidGroup);

  const coreGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x050510,
    roughness: 0.1,
    metalness: 0.95,
  });
  voidCore = new THREE.Mesh(coreGeo, coreMat);
  voidGroup.add(voidCore);

  const innerWireGeo = new THREE.IcosahedronGeometry(1.4, 2);
  const innerWireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  });
  voidInnerWire = new THREE.Mesh(innerWireGeo, innerWireMat);
  voidGroup.add(voidInnerWire);

  const auraGeo = new THREE.SphereGeometry(1.8, 32, 32);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  voidAura = new THREE.Mesh(auraGeo, auraMat);
  voidGroup.add(voidAura);

  const membraneGeo = new THREE.IcosahedronGeometry(2.5, 3);
  const membraneMat = new THREE.MeshPhysicalMaterial({
    color: 0x6366f1,
    emissive: 0x2e1065,
    emissiveIntensity: 0.6,
    roughness: 0.1,
    // TODO-003: three r128 的 transmission 不看 color，透出的是背景色而不是膜自己的顏色；要染色得改用手寫 shader
    transmission: 0.85,
    // TODO-004: three r128 的 MeshPhysicalMaterial 沒有 thickness 參數，這行是 console 警告的來源
    thickness: 1.2,
    transparent: true,
    opacity: 0.45,
  });
  voidMembrane = new THREE.Mesh(membraneGeo, membraneMat);
  voidGroup.add(voidMembrane);

  const memWireMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.22,
  });
  voidMembraneWire = new THREE.Mesh(membraneGeo.clone(), memWireMat);
  voidGroup.add(voidMembraneWire);

  const ringRadii = [3.3, 3.8, 4.3];
  const ringColors = [0x38bdf8, 0xa855f7, 0xec4899];

  ringRadii.forEach((radius, i) => {
    const ringMat = new THREE.MeshStandardMaterial({
      color: ringColors[i],
      emissive: ringColors[i],
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.75,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 16, 100), ringMat);
    ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    ring.userData = {
      rotXSpeed: (Math.random() - 0.5) * 0.015,
      rotYSpeed: (Math.random() - 0.5) * 0.02,
      rotZSpeed: (Math.random() - 0.5) * 0.012,
    };
    voidGyroRings.push(ring);
    voidGroup.add(ring);
  });

  // 古文明符文：程序畫出來的貼圖，共用幾張，每顆符文是一塊面片
  voidRuneTextures = createRuneTextures(20);
  const runeGeo = new THREE.PlaneGeometry(1, 1);
  const runeCount = 46;
  const runeOuterR = 7.0;

  for (let i = 0; i < runeCount; i++) {
    const texIndex = Math.floor(Math.random() * voidRuneTextures.length);
    const mat = new THREE.MeshBasicMaterial({
      map: voidRuneTextures[texIndex],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color().setHSL(0.1 + Math.random() * 0.04, 0.85, 0.5 + Math.random() * 0.15), // 金色
    });
    const rune = new THREE.Mesh(runeGeo, mat);

    // 每個符文一條自己的軌道平面：兩個互相垂直的單位向量
    const u = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const v = new THREE.Vector3().crossVectors(u, new THREE.Vector3(0, 1, 0));
    if (v.lengthSq() < 1e-4) v.set(1, 0, 0);
    v.normalize();

    const size = (0.85 + Math.random() * 0.6) * 0.5; // 縮小 50%
    rune.userData = {
      u, v,
      angle: Math.random() * Math.PI * 2,
      angSpeed: (0.16 + Math.random() * 0.14) * (Math.random() > 0.15 ? 1 : -1),
      radius: 1.3 + Math.random() * (runeOuterR - 1.3), // 一開始就散在整條路徑上
      outerR: runeOuterR,
      coreR: 1.2, // 虛無核心半徑，掉到這裡就被吸進去
      pullSpeed: 0.42 + Math.random() * 0.3, // 每秒向內掉的距離
      baseSize: size,
      spinAngle: Math.random() * Math.PI * 2,
      spinSpeed: (Math.random() - 0.5) * 0.9,
      fadeIn: 0.7, // 起始視為已出生，一開頁就看得到
      texIndex,
    };
    rune.scale.setScalar(size);

    voidRunes.push(rune);
    voidGroup.add(rune);
  }

  const vParticleCount = 700;
  const vGeometry = new THREE.BufferGeometry();
  voidParticlePositions = new Float32Array(vParticleCount * 3);
  const vVelocities = [];

  for (let i = 0; i < vParticleCount; i++) {
    const r = 3.5 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI;

    voidParticlePositions[i * 3] = r * Math.cos(phi) * Math.cos(theta);
    voidParticlePositions[i * 3 + 1] = r * Math.sin(phi);
    voidParticlePositions[i * 3 + 2] = r * Math.cos(phi) * Math.sin(theta);

    vVelocities.push({
      r: r,
      theta: theta,
      speed: 0.002 + Math.random() * 0.005,
    });
  }

  vGeometry.setAttribute('position', new THREE.BufferAttribute(voidParticlePositions, 3));
  const vMaterial = new THREE.PointsMaterial({
    color: 0x38bdf8,
    size: 0.12,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
  });

  voidParticles = new THREE.Points(vGeometry, vMaterial);
  voidParticles.userData = { velocities: vVelocities };
  voidGroup.add(voidParticles);

  buildVoidTesseract();
}

// -------------------------------------------------------------
// 4.4 虛無核心中心的四維超立方體（Tesseract）
// 16 個頂點在 4D 空間旋轉（只轉 XW/YW/ZW 三平面），再透視投影成 3D 線框
// 「維度瞬移」壓成二維時，改用第二套投影：三維立方體旋轉後正交丟掉 Z，
// 畫成平面上的立方體線稿（三維在二維空間的呈現），兩套用 voidFlatState.v 內插
// -------------------------------------------------------------
const tesseractDummy = new THREE.Object3D();
const tesseractDir = new THREE.Vector3();
const tesseractMid = new THREE.Vector3();
const tesseractUp = new THREE.Vector3(0, 1, 0);
const tesseractProjected = new Float32Array(48);
const voidCubeProjected = new Float32Array(24); // 8 個立方體角的二維投影
const VOID_CUBE_HALF = 0.5; // 二維形態時立方體的半邊長
const TESS_CORE_W = 0.038; // 亮芯粗度
const TESS_HALO_W = 0.105; // 光暈粗度

function buildVoidTesseract() {
  // 16 個頂點：每維度 ±0.35，用 0~15 的 bit 生成（bit0=x, bit1=y, bit2=z, bit3=w）
  tesseractV4D = [];
  for (let i = 0; i < 16; i++) {
    tesseractV4D.push([
      (i & 1 ? 0.35 : -0.35),
      (i & 2 ? 0.35 : -0.35),
      (i & 4 ? 0.35 : -0.35),
      (i & 8 ? 0.35 : -0.35),
    ]);
  }

  // 32 條邊：只連接「只差一個 bit」的兩點（也就是四維裡的立方體稜）
  // 存成 [i, j, bit]，bit 用來判斷二維形態時哪些邊要收合／淡出
  tesseractEdges = [];
  for (let i = 0; i < 16; i++) {
    for (let b = 0; b < 4; b++) {
      const j = i ^ (1 << b);
      if (j > i) tesseractEdges.push([i, j, b]);
    }
  }

  const edgeCount = tesseractEdges.length;

  // 內層亮芯：細柱、近白色，做出「線的實體」
  voidTesseractCore = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xcdf6ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthTest: false, // 核心球不透光，關掉深度測試才能「透視」球內部
    }),
    edgeCount
  );

  // 外層光暈：粗柱、半透明加法疊色，疊在亮芯外就成為發光
  voidTesseractHalo = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    }),
    edgeCount
  );

  // 頂點光珠：補柱子接縫、讓節點也發光
  voidTesseractJoints = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.062, 10, 10),
    new THREE.MeshBasicMaterial({
      color: 0x9be8ff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    }),
    16
  );

  voidTesseractCore.renderOrder = 10;
  voidTesseractHalo.renderOrder = 11;
  voidTesseractJoints.renderOrder = 12;
  voidTesseractCore.frustumCulled = false;
  voidTesseractHalo.frustumCulled = false;
  voidTesseractJoints.frustumCulled = false;
  voidGroup.add(voidTesseractCore);
  voidGroup.add(voidTesseractHalo);
  voidGroup.add(voidTesseractJoints);
}

function updateVoidTesseract(time) {
  if (!voidTesseractCore) return;

  // 只在含 W 的三個平面旋轉：這三個才是四維獨有的「內外翻轉」視覺
  const aXW = time * 0.5;
  const aYW = time * 0.33;
  const aZW = time * 0.42;
  const cXW = Math.cos(aXW), sXW = Math.sin(aXW);
  const cYW = Math.cos(aYW), sYW = Math.sin(aYW);
  const cZW = Math.cos(aZW), sZW = Math.sin(aZW);

  const d = 2.6; // 四維相機放在 W = 2.6 處看原點

  for (let i = 0; i < 16; i++) {
    let x = tesseractV4D[i][0];
    let y = tesseractV4D[i][1];
    let z = tesseractV4D[i][2];
    let w = tesseractV4D[i][3];

    let nx = x * cXW - w * sXW;
    w = x * sXW + w * cXW;
    x = nx;

    let ny = y * cYW - w * sYW;
    w = y * sYW + w * cYW;
    y = ny;

    let nz = z * cZW - w * sZW;
    w = z * sZW + w * cZW;
    z = nz;

    // 透視投影 4D → 3D：w 越靠近相機放大越多（同 3D 透視，只是多一維）
    const f = d / (d - w);
    tesseractProjected[i * 3] = x * f;
    tesseractProjected[i * 3 + 1] = y * f;
    tesseractProjected[i * 3 + 2] = z * f;
  }

  // ---- 二維形態：把 16 個點倒向「三維立方體的二維投影」----
  // 立方體 8 角在三維持續旋轉，再正交投影丟掉 Z（只剩 XY 座標）＝畫在紙上
  // 頂點映射：低 3 bit（x/y/z）決定立方體角，高 bit（w）的另一半疊到同一角
  const fv = voidFlatState.v;
  if (fv > 0.0005) {
    const cxb = Math.cos(time * 0.55), sxb = Math.sin(time * 0.55);
    const cyb = Math.cos(time * 0.4),  syb = Math.sin(time * 0.4);
    const czb = Math.cos(time * 0.28), szb = Math.sin(time * 0.28);
    const H = VOID_CUBE_HALF;

    for (let c = 0; c < 8; c++) {
      let x = (c & 1 ? H : -H);
      let y = (c & 2 ? H : -H);
      let z = (c & 4 ? H : -H);
      let t1 = y * cxb - z * sxb; z = y * sxb + z * cxb; y = t1; // 繞 X
      t1 = x * cyb + z * syb;     z = -x * syb + z * cyb; x = t1; // 繞 Y
      t1 = x * czb - y * szb;     y = x * szb + y * czb; x = t1;  // 繞 Z
      voidCubeProjected[c * 3] = x;
      voidCubeProjected[c * 3 + 1] = y;
      voidCubeProjected[c * 3 + 2] = 0; // 正交投影：丟掉 Z，三維落成二維
    }

    for (let i = 0; i < 16; i++) {
      const cc = (i & 7) * 3;
      const ii = i * 3;
      tesseractProjected[ii]     += (voidCubeProjected[cc]     - tesseractProjected[ii]) * fv;
      tesseractProjected[ii + 1] += (voidCubeProjected[cc + 1] - tesseractProjected[ii + 1]) * fv;
      tesseractProjected[ii + 2] += (voidCubeProjected[cc + 2] - tesseractProjected[ii + 2]) * fv;
    }
  }

  // 每條邊：算出中點與方向，把細柱擺上去（長度=邊長，粗度=設定值）
  for (let e = 0; e < tesseractEdges.length; e++) {
    const iA = tesseractEdges[e][0];
    const bit = tesseractEdges[e][2];
    const a = iA * 3;
    const bPos = tesseractEdges[e][1] * 3;

    tesseractMid.set(
      (tesseractProjected[a] + tesseractProjected[bPos]) / 2,
      (tesseractProjected[a + 1] + tesseractProjected[bPos + 1]) / 2,
      (tesseractProjected[a + 2] + tesseractProjected[bPos + 2]) / 2
    );
    tesseractDir.set(
      tesseractProjected[bPos] - tesseractProjected[a],
      tesseractProjected[bPos + 1] - tesseractProjected[a + 1],
      tesseractProjected[bPos + 2] - tesseractProjected[a + 2]
    );
    const len = tesseractDir.length();

    // 二維形態：w 邊（bit 3）兩端收成同一點 → 零長度，整條收起來
    if (len < 1e-4) {
      tesseractDummy.position.copy(tesseractMid);
      tesseractDummy.quaternion.identity();
      tesseractDummy.scale.set(0, 0, 0);
      tesseractDummy.updateMatrix();
      voidTesseractCore.setMatrixAt(e, tesseractDummy.matrix);
      voidTesseractHalo.setMatrixAt(e, tesseractDummy.matrix);
      continue;
    }
    tesseractDir.normalize();

    // 二維形態：上半（i≥8）的空間邊與下半是同一條立方體稜的重疊線，
    // 用 (1-fv) 逐漸縮掉，避免加法混色疊到過亮
    const drawLen = (bit !== 3 && iA >= 8) ? len * (1 - fv) : len;

    tesseractDummy.position.copy(tesseractMid);
    tesseractDummy.quaternion.setFromUnitVectors(tesseractUp, tesseractDir);

    tesseractDummy.scale.set(TESS_CORE_W, drawLen, TESS_CORE_W);
    tesseractDummy.updateMatrix();
    voidTesseractCore.setMatrixAt(e, tesseractDummy.matrix);

    tesseractDummy.scale.set(TESS_HALO_W, drawLen, TESS_HALO_W);
    tesseractDummy.updateMatrix();
    voidTesseractHalo.setMatrixAt(e, tesseractDummy.matrix);
  }
  voidTesseractCore.instanceMatrix.needsUpdate = true;
  voidTesseractHalo.instanceMatrix.needsUpdate = true;

  // 頂點光珠跟著 16 個投影點跑（二維時上半 8 顆與下半重疊，同步淡出只留一顆）
  tesseractDummy.quaternion.identity();
  for (let i = 0; i < 16; i++) {
    tesseractDummy.position.set(
      tesseractProjected[i * 3],
      tesseractProjected[i * 3 + 1],
      tesseractProjected[i * 3 + 2]
    );
    tesseractDummy.scale.setScalar(i < 8 ? 1 : Math.max(0, 1 - fv));
    tesseractDummy.updateMatrix();
    voidTesseractJoints.setMatrixAt(i, tesseractDummy.matrix);
  }
  voidTesseractJoints.instanceMatrix.needsUpdate = true;
}

// -------------------------------------------------------------
// 4.5 構建「七大罪群落生態 (Seven Sins Colony)」
// 傲慢、貪婪、暴怒、嫉妒、慾、暴食、怠慢 群居共生系統
// -------------------------------------------------------------

// —— 暴怒專用 shader：燃燒火球（頂點噪聲位移）＋ 火舌漸層（沿管長白熱→暗紅）——
// 程序化火焰：不依賴外部貼圖／模型，符合本專案「全程序化生成」的取捨
const WRATH_NOISE_GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  // 火焰色階：暗紅 → 紅 → 橙 → 黃 → 白熱
  vec3 wrathFireRamp(float h) {
    h = clamp(h, 0.0, 1.0);
    vec3 c = mix(vec3(0.30, 0.015, 0.015), vec3(0.90, 0.10, 0.04), smoothstep(0.0, 0.32, h));
    c = mix(c, vec3(1.0, 0.42, 0.07), smoothstep(0.32, 0.58, h));
    c = mix(c, vec3(1.0, 0.82, 0.30), smoothstep(0.58, 0.82, h));
    c = mix(c, vec3(1.0, 0.97, 0.82), smoothstep(0.82, 1.0, h));
    return c;
  }
`;

// 火球核心：球面沿法線做噪聲位移（越往上噴越高），fragment 用色階＋邊緣 fresnel 白熱
const WRATH_CORE_VERT = `
  uniform float uTime;
  uniform float uFrenzy;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  varying float vHeat;
  ${'' + WRATH_NOISE_GLSL}
  void main() {
    vec3 p = position;
    float t = uTime * (1.0 + uFrenzy * 0.9);
    float n = snoise(p * 2.6 + vec3(0.0, -t * 1.3, 0.0));
    n += 0.5 * snoise(p * 5.4 + vec3(t * 0.3, -t * 2.3, 0.0));
    n *= 0.6667;
    float upBias = smoothstep(-0.75, 1.0, p.y);
    float disp = n * (0.13 + 0.11 * upBias) * (1.0 + uFrenzy * 0.5);
    vec3 displaced = p + normalize(normal) * disp;
    vLocal = p;
    vHeat = n;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const WRATH_CORE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  varying float vHeat;
  ${'' + WRATH_NOISE_GLSL}
  void main() {
    float heat = clamp(vHeat * 0.55 + 0.30, 0.0, 1.0);
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 1.5);
    heat = clamp(heat + fres * 0.35 + uFrenzy * 0.12, 0.0, 1.0);
    vec3 col = wrathFireRamp(heat);
    col *= 0.88 + 0.12 * sin(uTime * 11.0 + vLocal.y * 7.0 + vLocal.x * 5.0);
    col += vec3(1.0, 0.55, 0.18) * fres * (0.22 + uFrenzy * 0.3);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

// 火舌管：uv.x = 0 火腳（貼核）→ 1 火尖；沿管長亮度衰減＋頂點噪聲搖曳
const WRATH_FLAME_VERT = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying float vHeat;
  ${'' + WRATH_NOISE_GLSL}
  void main() {
    vUv = uv;
    float t = uv.x;
    float wob = snoise(vec3(uv.y * 3.0, t * 7.0 - uTime * 2.6, uPhase));
    vec3 displaced = position + normal * wob * 0.05 * t * (1.0 + uFrenzy * 0.6);
    vHeat = (1.0 - t) * 0.85 - 0.10 + wob * 0.18 + uFrenzy * 0.12;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;
const WRATH_FLAME_FRAG = `
  uniform float uFrenzy;
  varying vec2 vUv;
  varying float vHeat;
  ${'' + WRATH_NOISE_GLSL}
  void main() {
    vec3 col = wrathFireRamp(vHeat);
    col *= 1.0 + uFrenzy * 0.4;
    float alpha = (1.0 - smoothstep(0.25, 1.0, vUv.x)) * clamp(0.35 + vHeat, 0.0, 1.0);
    alpha *= 0.85;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

function createWrathCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 } },
    vertexShader: WRATH_CORE_VERT,
    fragmentShader: WRATH_CORE_FRAG,
  });
}
function createWrathFlameMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: WRATH_FLAME_VERT,
    fragmentShader: WRATH_FLAME_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// —— 其餘六大罪共用 shader 工具 ——
// 研究來源與取捨（第 17 次）：
// · matcap 金屬：three.js 官方 MeshMatcapMaterial（場景無環境貼圖時 metalness 物件會發黑，
//   matcap 自帶光照，且圖檔用 canvas 程序化生成 → 維持全專案零外部貼圖原則）
// · fresnel 邊緣光：Schlick 近似，參考 three.js BRDF_Fresnel 與 OtanoStudio/Fresnel-Shader-Material
// · UV 流動光帶：管狀幾何沿 uv.x 掃描（參考 three.js forum UV-scrolling 討論串）
// · 簡化虹彩：IQ cosine palette 隨視角取色，模擬薄膜干涉（r128 的 MeshPhysicalMaterial 尚無
//   iridescence 屬性，完整薄膜模型過重，故走輕量 shader 路線）
function setSinsUniform(mat, time, frenzy) {
  if (!mat || !mat.uniforms) return;
  if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
  if (mat.uniforms.uFrenzy) mat.uniforms.uFrenzy.value = frenzy;
}

// 程序化 matcap 貼圖：canvas 畫「受光球面」（左上主高光 + 右下邊緣反光）
function createSinsMatcap(hi, mid, lo, edge) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.36, size * 0.34, size * 0.02, size * 0.5, size * 0.5, size * 0.55);
  g.addColorStop(0, hi);
  g.addColorStop(0.3, mid);
  g.addColorStop(0.72, lo);
  g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // 右下邊緣反光（第二光源，金屬感的關鍵）
  const rim = ctx.createRadialGradient(size * 0.74, size * 0.8, size * 0.02, size * 0.74, size * 0.8, size * 0.42);
  rim.addColorStop(0, 'rgba(255,244,214,0.5)');
  rim.addColorStop(1, 'rgba(255,244,214,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
  // 銳利鏡面高光點
  const spec = ctx.createRadialGradient(size * 0.34, size * 0.3, 0, size * 0.34, size * 0.3, size * 0.08);
  spec.addColorStop(0, 'rgba(255,255,255,0.95)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// iOS「液態玻璃」質感（傲慢專用）：高透明體 + clearcoat 光澤 + 注入式 fresnel 冷白亮邊
// + 隨時間掃過表面的流動高光帶。
function createPrideGlowMaterial(opts) {
  opts = opts || {};
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color != null ? opts.color : 0xffc93c,
    emissive: opts.emissive != null ? opts.emissive : 0xffb100,
    emissiveIntensity: opts.intensity != null ? opts.intensity : 1.0,
    roughness: opts.roughness != null ? opts.roughness : 0.3,
    metalness: opts.metalness != null ? opts.metalness : 0.3,
  });
  mat.userData.glowBase = mat.emissiveIntensity;
  return mat;
}

const SINS_FRESNEL_VERT = `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    vUv = uv;
    vLocal = position;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// 傲慢的玻璃外殼：刻面平面法線（用螢幕導數算）＋ 視角相關的邊緣亮光 ＋ 固定光源的刻面高光 ＋ 旋轉探照掃過時某些刻面金光閃爍
const PRIDE_GLASS_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  uniform float uMode;   // 0 外殼正面／1 外殼背面／2 內層殼
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    vec3 V = normalize(-vViewPos);
    vec3 fn = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
    if (dot(fn, V) < 0.0) fn = -fn;
    float ndv = clamp(dot(fn, V), 0.0, 1.0);
    float fres = pow(1.0 - ndv, 2.5);
    vec3 R = reflect(-V, fn);
    float s1 = pow(max(dot(R, normalize(vec3(-0.5, 0.8, 0.6))), 0.0), 14.0) * 0.7;
    float s2 = pow(max(dot(R, normalize(vec3(0.7, 0.3, -0.5))), 0.0), 12.0) * 0.7;
    vec3 sweep = normalize(vec3(sin(uTime * 0.5 + uPhase), 0.35, cos(uTime * 0.5 + uPhase)));
    float g = smoothstep(0.82, 0.98, dot(fn, sweep));                       // 正對掃光方向的刻面會突然亮起
    vec3 irid = 0.5 + 0.5 * cos(6.2831 * (ndv * 1.2 + vec3(0.0, 0.33, 0.67) + uPhase));
    vec3 tint = uMode > 1.5 ? vec3(0.78, 0.86, 1.0) : (uMode > 0.5 ? vec3(0.55, 0.65, 0.85) : vec3(0.85, 0.93, 1.0));
    // 霧面：整體覆一層乳白霧、表面細顆粒讓反光不那麼銳利
    float grain = fract(sin(dot(floor(vLocal * 70.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    vec3 col = tint * 0.18 + vec3(0.80, 0.88, 1.0) * 0.10 + fres * mix(vec3(0.85, 0.92, 1.0), irid, 0.5) * 0.85;
    col *= 0.94 + 0.12 * grain;
    col += (s1 + s2) * vec3(1.0, 0.97, 0.9) * 1.4;
    col += g * vec3(1.0, 0.82, 0.45) * (1.3 + uFrenzy);
    float alpha = 0.20 + fres * 0.40 + (s1 + s2) * 0.7 + g * 0.7 + (grain - 0.5) * 0.05;
    if (uMode > 0.5 && uMode < 1.5) alpha *= 0.7;
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createPrideGlassMaterial(mode, phase, side) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase || 0 }, uMode: { value: mode } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: PRIDE_GLASS_FRAG,
    transparent: true,
    depthWrite: false,
    side: side == null ? THREE.FrontSide : side,
    extensions: { derivatives: true },
  });
}



// —— 貪婪：爪管能量脈衝（綠翡翠底 + 金光帶流向爪尖）——
const GREED_CLAW_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    float t = vUv.x;
    vec3 base = mix(vec3(0.01, 0.30, 0.15), vec3(0.10, 0.76, 0.42), t);
    float flow = fract(t * 2.5 - uTime * (0.5 + uFrenzy * 0.9) + uPhase);
    float pulse = smoothstep(0.0, 0.4, flow) * (1.0 - smoothstep(0.4, 0.68, flow));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 2.0);
    vec3 col = base;
    col += vec3(1.0, 0.84, 0.16) * pulse * (0.95 + uFrenzy * 0.7);
    col += vec3(0.25, 0.95, 0.58) * fres * 0.35;
    float alpha = clamp(0.66 + fres * 0.28 + pulse * 0.3, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createGreedClawMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: GREED_CLAW_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

// —— 嫉妒：核心球體畫成眼球（眼白＋赤紅虹膜＋瞳孔）＋扭結掃描光帶 ——
// 光影材質維持原樣：fresnel 邊緣光、移動掃描高光、tonemapping/encodings 都不動，只換配色與球面圖案
const ENVY_EYE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  float envyHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float envyNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = envyHash(i), b = envyHash(i + vec2(1.0, 0.0));
    float c = envyHash(i + vec2(0.0, 1.0)), d = envyHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  void main() {
    vec3 dir = normalize(vLocal);
    float face = dot(dir, vec3(0.0, 0.0, 1.0));   // +Z = 注視方向（lookAt 朝向鏡頭）
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float ang = atan(dir.y, dir.x);
    float rad = acos(clamp(face, -1.0, 1.0));

    // 鞏膜：象牙白，離虹膜越遠越帶黃、略暗（球體立體感）；血絲＝向虹膜匯聚的赤紅細線＋不規則細支
    vec3 sclera = mix(vec3(0.93, 0.90, 0.85), vec3(0.84, 0.76, 0.64), smoothstep(0.5, -0.3, face));
    sclera *= 0.92 + 0.10 * envyNoise(vec2(ang * 5.0, face * 9.0));
    float wob1 = envyNoise(vec2(face * 5.0, 1.3));
    float wob2 = envyNoise(vec2(face * 9.0, 4.7));
    float v1 = sin(ang * 13.0 + wob1 * 7.0);
    float v2 = sin(ang * 27.0 + wob2 * 5.0 + 2.1);
    float veinLine = 1.0 - smoothstep(0.0, 0.13, abs(v1));
    veinLine = max(veinLine, (1.0 - smoothstep(0.0, 0.09, abs(v2))) * 0.55);
    float fineV = 1.0 - smoothstep(0.0, 0.07, abs(envyNoise(vec2(ang * 7.0 + face * 3.0, face * 16.0)) - 0.5));
    veinLine = max(veinLine, fineV * 0.45);
    float veinMask = smoothstep(0.60, 0.40, face) * smoothstep(0.0, 0.18, face);
    sclera = mix(sclera, vec3(0.72, 0.10, 0.12), veinLine * veinMask * 0.9);

    // 虹膜：赤紅放射纖維＋隱窩（暗細紋）＋瞳孔緣淺色環（collarette）＋外緣暗環（limbal ring）
    float irisM = smoothstep(0.54, 0.64, face);
    float fib = 0.52 + 0.48 * sin(ang * 26.0 + rad * 7.0 + envyNoise(vec2(ang * 9.0, rad * 6.0)) * 3.0);
    vec3 iris = mix(vec3(0.34, 0.015, 0.04), vec3(0.92, 0.16, 0.10), fib);
    float crypt = smoothstep(0.55, 0.9, envyNoise(vec2(ang * 11.0, rad * 14.0)));
    iris *= 1.0 - 0.45 * crypt;
    float collar = exp(-pow((face - 0.80) / 0.035, 2.0));
    iris = mix(iris, vec3(1.0, 0.55, 0.28), collar * 0.55);
    iris *= mix(0.30, 1.0, smoothstep(0.55, 0.68, face));

    // 瞳孔：深邃近黑，邊緣隨時間極輕微地縮放（活著的感覺）
    float pr = 0.90 + 0.012 * sin(uTime * 0.8);
    float pupilM = smoothstep(pr - 0.02, pr + 0.02, face);
    vec3 pupil = vec3(0.020, 0.004, 0.008);

    vec3 col = sclera;
    col = mix(col, iris, irisM);
    col = mix(col, pupil, pupilM);

    // 濕潤感：鞏膜上一道寬而淡的高光（虹膜上的亮點交給角膜層）
    vec3 Nn = normalize(vNormalV), Vv = normalize(-vViewPos);
    float wet = pow(max(dot(reflect(-normalize(vec3(-0.4, 0.6, 0.7)), Nn), Vv), 0.0), 45.0) * (1.0 - irisM) * 0.35;
    col += vec3(1.0, 0.97, 0.92) * wet;

    // ---- 光影材質（不動）：移動掃描高光 + fresnel 邊緣光 ----
    float scan = smoothstep(0.10, 0.0, abs(vLocal.y * 2.6 - sin(uTime * 1.2) * 0.3));
    col += vec3(1.0, 0.72, 0.62) * scan * (0.24 + uFrenzy * 0.35);
    float fres = pow(1.0 - ndv, 2.5);
    col += vec3(1.0, 0.42, 0.38) * fres * 0.38;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createEnvyEyeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: ENVY_EYE_FRAG,
  });
}

// 角膜：虹膜上方微凸的透明層，只疊加濕潤的高光（視窗般的亮點）與極淡的邊緣反光
const ENVY_CORNEA_FRAG = `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    vec3 N = normalize(vNormalV), V = normalize(-vViewPos);
    vec3 R = reflect(-V, N);
    float s1 = pow(max(dot(R, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 260.0) * 3.0;
    float s2 = pow(max(dot(R, normalize(vec3(0.5, -0.2, 0.8))), 0.0), 60.0) * 0.5;
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);
    vec3 col = vec3(1.0, 0.96, 0.90) * s1 + vec3(1.0, 0.70, 0.50) * s2 + vec3(0.9, 0.5, 0.5) * fres * 0.22;
    gl_FragColor = vec4(col, 1.0);
  }
`;
function createEnvyCorneaMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: ENVY_CORNEA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

const ENVY_KNOT_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    vec3 base = mix(vec3(0.17, 0.01, 0.05), vec3(0.58, 0.06, 0.10), clamp(vUv.y, 0.0, 1.0));
    float flow = fract(vUv.x * 3.0 - uTime * (0.3 + uFrenzy * 0.6));
    float band = smoothstep(0.0, 0.45, flow) * (1.0 - smoothstep(0.45, 0.78, flow));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 2.0);
    vec3 col = base;
    col += vec3(1.0, 0.52, 0.30) * band * (0.85 + uFrenzy * 0.6);
    col += vec3(1.0, 0.26, 0.22) * fres * 0.45;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createEnvyKnotMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: ENVY_KNOT_FRAG,
  });
}

// —— 嫉妒：環伺紅紫鬼火（立體火苗，取代原本的窺視水滴）——
// 鬼火＝中式傳說裡飄浮的燐火：圓肚尖尾、S 形扭曲、內焰亮外焰透
const GHOST_FIRE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    float t = clamp(vUv.y, 0.0, 1.0); // 0 = 圓肚底，1 = 尖尾端
    vec3 base = mix(vec3(0.40, 0.03, 0.15), vec3(0.75, 0.08, 0.34), smoothstep(0.0, 0.45, t));
    base = mix(base, vec3(1.0, 0.36, 0.55), smoothstep(0.45, 0.85, t));
    float rise = fract(t * 1.6 - uTime * (0.55 + uFrenzy * 0.5) + uPhase);
    float lick = smoothstep(0.0, 0.25, rise) * (1.0 - smoothstep(0.25, 0.6, rise));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 2.2);
    vec3 col = base;
    col += vec3(1.0, 0.60, 0.74) * lick * (0.7 + uFrenzy * 0.7);
    col += vec3(1.0, 0.45, 0.62) * fres * 0.5;
    col *= 0.85 + 0.3 * sin(uTime * 8.5 + uPhase * 5.0 + t * 6.0);
    float alpha = (1.0 - smoothstep(0.45, 1.0, t)) * 0.85 + fres * 0.15;
    alpha *= 0.8 + 0.25 * sin(uTime * 11.0 + uPhase * 9.0);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0) * (0.75 + uFrenzy * 0.25));
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;

function createGhostFireGeometry() {
  // 車床成型：圓肚→收腰→尖尾，經典鬼火輪廓（半徑, 高度）
  const profile = [
    [0.0, 0.0], [0.045, 0.015], [0.075, 0.06], [0.088, 0.12],
    [0.075, 0.19], [0.052, 0.26], [0.03, 0.33], [0.014, 0.4], [0.0, 0.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 20);
  // 每朵鬼火自己扭一個 S 形：尖尾越往上偏越多，像被風吹歪的燐火
  const phase = Math.random() * Math.PI * 2;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / 0.47;
    pos.setX(i, pos.getX(i) + Math.sin(t * 2.4 + phase) * 0.14 * t * t);
    pos.setZ(i, pos.getZ(i) + Math.cos(t * 1.9 + phase * 1.7) * 0.09 * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

function createGhostFire() {
  const grp = new THREE.Group();
  const phase = Math.random() * Math.PI * 2;
  const outerMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: GHOST_FIRE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const outer = new THREE.Mesh(createGhostFireGeometry(), outerMat);
  grp.add(outer);
  // 內焰：同輪廓縮小，粉紅色但不要白到洗掉外焰的紅紫
  const inner = new THREE.Mesh(
    createGhostFireGeometry(),
    new THREE.MeshBasicMaterial({
      color: 0xff9fb8, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  inner.scale.setScalar(0.55);
  inner.position.y = 0.01;
  grp.add(inner);
  grp.userData = { uPhase: phase, outerMat };
  return grp;
}

// —— 慾（再設計）：纏縛螺旋——鋸齒緞帶織成的籠，中心是一顆搏動的暗紅核；邊緣發熱、會在心跳時收緊 ——
const LUST_SNARE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float t = vUv.x;
    float edge = smoothstep(0.55, 1.0, abs(vUv.y - 0.5) * 2.0);
    vec3 base = mix(vec3(0.12, 0.008, 0.05), vec3(0.30, 0.03, 0.13), t);
    float p1 = fract(t - uTime * 0.30 + uPhase);
    float thump = exp(-12.0 * abs(p1 - 0.5));
    thump += 0.6 * exp(-14.0 * abs(fract(t - uTime * 0.30 + uPhase + 0.14) - 0.5));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 2.0);
    vec3 col = base;
    col += vec3(1.0, 0.22, 0.55) * edge * (0.5 + thump * 0.8);                    // 鋸齒邊緣發熱
    col += vec3(0.95, 0.25, 0.60) * thump * 0.3 * (0.8 + uFrenzy * 0.7);          // 心跳脈衝沿帶身往頂端傳
    col += vec3(0.70, 0.15, 0.40) * fres * 0.28;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLustSnareMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: LUST_SNARE_FRAG,
    side: THREE.DoubleSide,
  });
}

const LUST_CORE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  uniform float uBeat;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float n = n3(vLocal * 5.0 + vec3(0.0, uTime * 0.15, 0.0));
    float vein = smoothstep(0.07, 0.0, abs(n - 0.5));
    vec3 col = vec3(0.20, 0.01, 0.07) * (0.7 + 0.6 * n);
    col += vec3(1.0, 0.20, 0.50) * vein * (0.9 + uBeat * 1.6 + uFrenzy * 0.6);       // 血管般的亮脈，隨心跳增亮
    col += vec3(0.9, 0.12, 0.35) * pow(1.0 - ndv, 2.0) * (0.5 + uBeat * 0.9);
    col += vec3(0.5, 0.05, 0.18) * (0.35 + uBeat * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLustCoreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: 0 }, uBeat: { value: 0 } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: LUST_CORE_FRAG,
  });
}

const LUST_BLADE_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float t = vUv.x;
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    vec3 col = mix(vec3(0.10, 0.005, 0.04), vec3(0.28, 0.02, 0.12), t);
    float flow = fract(t - uTime * 0.25 + uPhase);
    col += vec3(1.0, 0.25, 0.55) * exp(-10.0 * abs(flow - 0.5)) * 0.45 * (0.8 + uFrenzy * 0.7);
    col += vec3(1.0, 0.22, 0.52) * pow(1.0 - ndv, 2.4) * (0.9 + t * 0.6);           // 刃緣泛熱，越近尖端越亮
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLustBladeMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: LUST_BLADE_FRAG,
  });
}

// 鋸齒緞帶：沿 pts 展開，寬度隔點交錯＝一排尖齒；uv.x 沿長度、uv.y 沿寬度
function createSerratedRibbonGeometry(pts, halfBase, halfTooth) {
  const verts = [], uvs = [], idx = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], w = (i % 2 ? halfTooth : halfBase);
    verts.push(p.x, p.y + w, p.z, p.x, p.y - w, p.z);
    uvs.push(i / (n - 1), 1, i / (n - 1), 0);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// —— 慾：螺旋心跳脈衝光（雙節拍往頂端傳）＋花瓣 fresnel 幽光 ——
const LUST_HELIX_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float t = vUv.x;
    vec3 base = mix(vec3(0.50, 0.05, 0.28), vec3(0.95, 0.32, 0.62), t);
    float p1 = fract(t - uTime * 0.35 + uPhase);
    float thump = exp(-12.0 * abs(p1 - 0.5));
    float p2 = fract(t - uTime * 0.35 + uPhase + 0.14);
    thump += 0.6 * exp(-14.0 * abs(p2 - 0.5));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 2.0);
    vec3 col = base;
    col += vec3(1.0, 0.55, 0.85) * thump * (0.85 + uFrenzy * 0.7);
    col += vec3(1.0, 0.45, 0.75) * fres * 0.5;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLustHelixMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: LUST_HELIX_FRAG,
  });
}

const LUST_PETAL_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    vec3 base = mix(vec3(0.64, 0.05, 0.32), vec3(0.99, 0.30, 0.60), ndv);
    float fres = pow(1.0 - ndv, 2.0);
    float shimmer = 0.9 + 0.1 * sin(uTime * 3.0 + vUv.x * 7.0 + uPhase);
    vec3 col = base * shimmer;
    col += vec3(1.0, 0.55, 0.82) * fres * (0.6 + uFrenzy * 0.5);
    float alpha = clamp(0.62 + fres * 0.38, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createLustPetalMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: LUST_PETAL_FRAG,
    transparent: true,
    side: THREE.DoubleSide,
  });
}

// —— 暴食：漏斗內壁向心漩渦（極座標旋轉流紋往喉深捲入）——
const GLUTTONY_MAW_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float ang = vUv.x * 6.28318;
    float depth = 1.0 - vUv.y;
    float swirl = ang + uTime * (1.3 + uFrenzy * 1.6) + depth * 4.5 + uPhase;
    float streak = 0.5 + 0.5 * sin(swirl * 6.0);
    streak = pow(streak, 3.0);
    vec3 rimCol = vec3(0.72, 0.26, 0.045);
    vec3 deepCol = vec3(0.12, 0.02, 0.008);
    vec3 col = mix(rimCol, deepCol, smoothstep(0.0, 0.75, depth));
    col += vec3(0.95, 0.55, 0.16) * streak * (0.30 - depth * 0.20) * (1.0 + uFrenzy * 0.6);
    col *= 1.0 - 0.35 * smoothstep(0.45, 1.0, depth) * (0.5 + 0.5 * sin(uTime * 4.0 + uPhase));
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(-vViewPos))), 1.6);
    col += vec3(1.0, 0.45, 0.15) * fres * 0.12;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createGluttonyMawMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: GLUTTONY_MAW_FRAG,
    side: THREE.DoubleSide,
  });
}

// —— 怠慢（再設計）：滯重沉降者——層層堆疊的灰岩軟體，縫隙滲出暗紫幽光 ——
const SLOTH_STRATA_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 N = normalize(vNormalV);
    float ndv = abs(dot(N, normalize(-vViewPos)));
    vec3 L = normalize(vec3(-0.4, 0.8, 0.5));
    float diff = max(dot(N, L), 0.0) * 0.55 + 0.35;
    // 地層條帶：每一層明度不同，邊界被噪聲扭曲
    float warp = n3(vec3(vLocal.x * 1.2, vLocal.y * 0.5, vLocal.z * 1.2)) * 0.9;
    float yy = (vLocal.y + warp) * 3.2;
    float band = fract(yy);
    float tone = h3(vec3(floor(yy), 3.1, 7.7));
    vec3 base = mix(vec3(0.045, 0.040, 0.055), vec3(0.16, 0.14, 0.18), tone * 0.7);
    base *= 0.75 + 0.5 * n3(vLocal * 14.0);
    base += vec3(0.04, 0.035, 0.05) * smoothstep(0.85, 1.0, band);       // 層緣微亮
    float ash = smoothstep(1.2, 2.2, vLocal.y) * smoothstep(0.35, 0.7, n3(vLocal * 5.0));
    base = mix(base, vec3(0.30, 0.29, 0.31), ash * 0.5);                  // 上緣落灰
    vec3 col = base * diff;
    // 岩縫裡滲出的暗紫幽光（慢慢明滅）
    float cr = n3(vLocal * vec3(2.6, 2.0, 2.6) + 3.7);
    float crack = smoothstep(0.035, 0.0, abs(cr - 0.5));
    float pulse = 0.55 + 0.45 * sin(uTime * 0.6 + vLocal.y * 2.0 + uPhase);
    col += vec3(0.62, 0.16, 0.80) * crack * pulse * (0.9 + uFrenzy);
    // 正面一道縱向裂口，像緩慢呼吸的傷口
    float fis = smoothstep(0.05, 0.0, abs(vLocal.x - 0.12 + 0.07 * sin(vLocal.y * 5.0)))
              * step(0.15, vLocal.z) * smoothstep(0.5, 0.9, vLocal.y) * (1.0 - smoothstep(1.9, 2.2, vLocal.y));
    col += vec3(0.95, 0.25, 0.95) * fis * (0.7 + 0.3 * sin(uTime * 0.8)) * (1.0 + uFrenzy * 0.8);
    col += vec3(0.35, 0.12, 0.55) * pow(1.0 - ndv, 3.0) * 0.5;           // 暗紫輪廓光
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createSlothStrataMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: SLOTH_STRATA_FRAG,
    side: THREE.DoubleSide,
  });
}

// —— 怠慢（重做）：沉睡的重物者——暗紫灰的軟身，帶灰塵／苔蘚斑塊與柔和的紫色輪廓光 ——
const SLOTH_BODY_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 N = normalize(vNormalV);
    float ndv = abs(dot(N, normalize(-vViewPos)));
    vec3 L = normalize(vec3(-0.4, 0.8, 0.5));
    float diff = max(dot(N, L), 0.0) * 0.6 + 0.4;
    vec3 base = mix(vec3(0.20, 0.17, 0.26), vec3(0.36, 0.32, 0.45), smoothstep(0.0, 1.4, vLocal.y));
    float dust = n3(vLocal * 6.0);
    base = mix(base, vec3(0.33, 0.35, 0.29), smoothstep(0.60, 0.82, dust) * 0.5);   // 灰塵／苔蘚斑
    base *= 0.86 + 0.28 * n3(vLocal * 20.0);                                        // 細顆粒
    vec3 col = base * diff;
    col += vec3(0.50, 0.38, 0.78) * pow(1.0 - ndv, 3.0) * (0.45 + uFrenzy * 0.5);   // 柔和紫色輪廓光
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createSlothBodyMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: SLOTH_BODY_FRAG,
    side: THREE.DoubleSide,
  });
}

// —— 怠慢：漆黑兜帽斗篷＋垂地長鬚（依使用者參考圖：黑袍、紅瞳、紫邊光）——
const SLOTH_CLOAK_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    // 邊緣光收得很緊：整體維持近黑，只有輪廓線泛紫
    float fres = pow(1.0 - ndv, 5.0);
    float rimBand = pow(1.0 - ndv, 2.0);
    vec3 col = vec3(0.008, 0.007, 0.014);
    // 黑袍布面的柔和高光帶（緩慢游移＝怠慢）
    float sheen = sin(vLocal.y * 4.0 - uTime * 0.35 + vLocal.x * 1.5 + uPhase) * 0.5 + 0.5;
    col += vec3(0.055, 0.040, 0.090) * pow(sheen, 8.0) * 0.5;
    // 紫色輪廓光（參考圖黑袍邊緣泛紫）
    col += vec3(0.46, 0.14, 0.86) * fres * (1.5 + uFrenzy * 1.2);
    col += vec3(0.24, 0.07, 0.40) * rimBand * 0.32;
    // 根部積聚的暗紫霧
    col += vec3(0.055, 0.020, 0.105) * smoothstep(0.7, -0.3, vLocal.y) * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createSlothCloakMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: SLOTH_CLOAK_FRAG,
    side: THREE.DoubleSide,
  });
}

const SLOTH_TENT_FRAG = `
  uniform float uTime;
  uniform float uFrenzy;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying vec3 vLocal;
  void main() {
    float t = vUv.x;
    float ndv = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
    float fres = pow(1.0 - ndv, 3.5);
    vec3 col = vec3(0.010, 0.007, 0.020);
    // 紫脈從根部緩慢流向鬚尖
    float flow = fract(t - uTime * (0.05 + uFrenzy * 0.12) + uPhase * 0.13);
    float pulse = smoothstep(0.0, 0.35, flow) * (1.0 - smoothstep(0.35, 0.75, flow));
    col += vec3(0.40, 0.13, 0.72) * pulse * (0.45 + uFrenzy * 0.8) * (0.25 + t * 0.95);
    col += vec3(0.34, 0.13, 0.66) * fres * 0.9;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }
`;
function createSlothTentacleMaterial(phase) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFrenzy: { value: 0 }, uPhase: { value: phase } },
    vertexShader: SINS_FRESNEL_VERT,
    fragmentShader: SLOTH_TENT_FRAG,
    side: THREE.DoubleSide,
  });
}

// 垂紗布片：沿「外緣 → 內緣」填滿的整片布面（不是掃描出來的空心管）
// 每列 = { y, outer:[x,z], inner:[x,z] }：外緣是甩出去的外弧，內緣貼著袍身
// 首列與末列的寬度刻意收成 0 並藏進頭顱／袍腳 → 兩端都收束在主體內，不露懸空切邊
function createDrapePanelGeometry(rows, cols) {
  const verts = [], uvs = [], indices = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (let j = 0; j <= cols; j++) {
      const v = j / cols;
      // 內緣往內彎一點，做出布的褶皺感（不是死板的直線邊）
      const bulge = Math.sin(v * Math.PI) * 0.10;
      const x = r.outer[0] + (r.inner[0] - r.outer[0]) * v - bulge;
      const z = r.outer[1] + (r.inner[1] - r.outer[1]) * v + bulge * 0.6;
      verts.push(x, r.y, z);
      uvs.push(i / (rows.length - 1), v);
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 布身幾何：Lathe 輪廓＋縱向皺褶位移，做出斗篷自然垂墜的縱襯
function createDrapedBodyGeometry(profile, radialSegs, foldAmp, folds) {
  const geo = new THREE.LatheGeometry(profile, radialSegs);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-5) continue;
    const a = Math.atan2(z, x);
    const d = foldAmp * Math.sin(a * folds + y * 1.4);
    pos.setX(i, x + Math.cos(a) * d);
    pos.setZ(i, z + Math.sin(a) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

// 沿曲線的漸細管：半徑由 r0 遊到 r1，末端收成尖，取代死板的等粗管線
function createTaperedTubeGeometry(curve, segs = 24, radialSegs = 8, r0 = 0.06, r1 = 0.01, rMid = null) {
  const pts = [];
  const tans = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    pts.push(curve.getPoint(t));
    tans.push(curve.getTangent(t).normalize());
  }

  let refNormal = new THREE.Vector3(0, 1, 0);
  if (Math.abs(tans[0].dot(refNormal)) > 0.9) refNormal.set(1, 0, 0);
  const normals = [];
  let n0 = new THREE.Vector3().crossVectors(tans[0], refNormal).normalize();
  normals.push(n0);
  for (let i = 1; i <= segs; i++) {
    const n = normals[i - 1].clone();
    const q = new THREE.Quaternion().setFromUnitVectors(tans[i - 1], tans[i]);
    n.applyQuaternion(q);
    n.sub(tans[i].clone().multiplyScalar(n.dot(tans[i]))).normalize();
    normals.push(n);
  }

  const radiusAt = (t) => {
    if (rMid !== null) {
      return t < 0.5
        ? r0 + (rMid - r0) * (t / 0.5)
        : rMid + (r1 - rMid) * ((t - 0.5) / 0.5);
    }
    return r0 + (r1 - r0) * t;
  };

  const verts = [];
  const uvs = [];   // u = 沿管長 0→1（火焰 shader 用來做火腳→火尖漸層）
  const indices = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const binormal = new THREE.Vector3().crossVectors(tans[i], normals[i]).normalize();
    const r = radiusAt(t);
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * Math.PI * 2;
      const offset = normals[i].clone().multiplyScalar(Math.cos(a) * r)
        .add(binormal.clone().multiplyScalar(Math.sin(a) * r));
      verts.push(pts[i].x + offset.x, pts[i].y + offset.y, pts[i].z + offset.z);
      uvs.push(t, j / radialSegs);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = a + radialSegs + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// 圓潤花瓣幾何：貝茲畫出水滴圓瓣、擠出薄厚度並微微上杯
function createSinPetalGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.24, 0.18, 0.3, 0.6, 0.16, 0.95);
  shape.quadraticCurveTo(0.07, 1.12, 0, 1.18);
  shape.quadraticCurveTo(-0.07, 1.12, -0.16, 0.95);
  shape.bezierCurveTo(-0.3, 0.6, -0.24, 0.18, 0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.translate(0, 0, -0.04);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) - 0.35 * y * y + Math.abs(x) * 0.6 * y);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildSinsColony() {
  sinsGroup = new THREE.Group();
  scene.add(sinsGroup);
  sinsGroup.visible = false;

  sinCreatures = {};

  // 1. 傲慢 (Pride) - 頂部支配之冕 (0, 7.5, 0)：群落最高點，遠離下方怠慢
  {
    const grp = new THREE.Group();
    grp.position.set(0, 10.2, -10);
    grp.userData = { sinKey: 'pride', basePos: new THREE.Vector3(0, 10.2, -10) };

    // 帝王配色：核心帝王紫燦光（呼吸脈動）＋ 王金冠環／拱弧 ＋ 鑽白八星 ＋ 頂珠紅寶石
    const gemMat = createPrideGlowMaterial({ color: 0xfff2c8, emissive: 0xffd36b, intensity: 0.9, roughness: 0.08, metalness: 0.2 });   // 玻璃內的傲慢核心（呼吸脈動由它驅動）
    const goldMat = createPrideGlowMaterial({ color: 0xd4af37, emissive: 0x574000, intensity: 0.4, roughness: 0.22, metalness: 0.9 });
    const diamondMat = createPrideGlowMaterial({ color: 0xf8fafc, emissive: 0xcfe4ff, intensity: 0.5, roughness: 0.06, metalness: 0.1 });
    const rubyMat = createPrideGlowMaterial({ color: 0xa50034, emissive: 0xe0115f, intensity: 0.55, roughness: 0.12, metalness: 0.2 });
    const glowMat = gemMat; // animate() 只驅動這個的呼吸脈動

    // 外殼：薄玻璃（單層殼，正面＋背面）；刻面隨視角反光、被掃光掃到時金光閃爍，表面帶一點霧面
    const coreGeo = new THREE.OctahedronGeometry(0.85, 1);
    const glassMats = [
      createPrideGlassMaterial(0, 0.0, THREE.FrontSide),
      createPrideGlassMaterial(1, 0.9, THREE.BackSide),
    ];
    const core = new THREE.Mesh(coreGeo, glassMats[0]);
    const coreBack = new THREE.Mesh(coreGeo, glassMats[1]);
    coreBack.renderOrder = 1; core.renderOrder = 2;
    core.add(coreBack);
    core.add(new THREE.LineSegments(new THREE.EdgesGeometry(coreGeo, 20), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false })));
    grp.add(core);

    // 玻璃裡的傲慢核心（全部在半徑 0.5 內，不超出外殼 0.78~0.85）：
    //   正中是自我欣賞的長鑽，鑽頂戴一頂迷你王冠，外圍三道金環像陀螺儀般各自旋轉（環上各嵌一顆寶石）
    const inner = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), gemMat);
    gem.scale.set(1, 1.5, 1);
    inner.add(gem);
    const innerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createRadialGlowTexture('255,210,110'), transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    innerGlow.scale.set(1.0, 1.0, 1);
    inner.add(innerGlow);
    const miniCrown = new THREE.Group();
    miniCrown.position.y = 0.33;
    miniCrown.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 20), goldMat)).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.1, 6), goldMat);
      tip.position.set(0.1 * Math.cos(a), 0.05, 0.1 * Math.sin(a));
      miniCrown.add(tip);
    }
    miniCrown.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0), rubyMat)).position.y = 0.16;
    inner.add(miniCrown);
    const gyros = [];
    [[0.30, 0, 0], [0.38, 0, 0], [0.46, 0, 0]].forEach(([r], k) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 56), goldMat);
      if (k === 0) ring.rotation.x = Math.PI / 2;
      if (k === 2) ring.rotation.y = Math.PI / 2;
      const bead = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), k === 1 ? rubyMat : diamondMat);
      bead.position.set(r, 0, 0);
      ring.add(bead);
      inner.add(ring);
      gyros.push(ring);
    });
    grp.add(inner);

    // 環冕：底座金環＋交替鑽白八星＋四道金拱弧匯於紅寶頂珠
    const crownGroup = new THREE.Group();
    const bandMat = goldMat;
    const diamonds = diamondMat;

    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 12, 48), bandMat);
    band.position.y = 0.35;
    band.rotation.x = Math.PI / 2;
    crownGroup.add(band);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pearl = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), diamonds);
      pearl.position.set(1.0 * Math.cos(angle), 0.35 + (i % 2) * 0.22, 1.0 * Math.sin(angle));
      crownGroup.add(pearl);
    }

    for (let i = 0; i < 4; i++) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 10, 40, Math.PI), bandMat);
      arch.position.y = 0.35;
      arch.rotation.y = (i / 4) * Math.PI * 2;
      crownGroup.add(arch);
    }
    const apexPearl = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), rubyMat); // 頂珠改紅寶石
    apexPearl.position.y = 1.13;
    crownGroup.add(apexPearl);

    grp.add(crownGroup);

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.022, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0xd4a017, emissiveIntensity: 1.0 })
    );
    halo1.rotation.x = Math.PI / 2;
    grp.add(halo1);

    // 點狀日冕：細珍珠環取代線框圓環
    const halo2 = new THREE.Group();
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xfdf6e3 }); // 珍珠白點環
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), dotMat);
      dot.position.set(1.2 * Math.cos(a), 0, 1.2 * Math.sin(a));
      halo2.add(dot);
    }
    halo2.rotation.x = Math.PI / 3;
    grp.add(halo2);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'pride' };
    grp.add(hit);

    sinCreatures.pride = { group: grp, core, glassMats, inner, gyros, miniCrown, crownGroup, halo1, halo2, hit, glowMat };
    sinsGroup.add(grp);
  }

  // 2. 貪婪 (Greed) - 聚斂吸積爪 (4.2, 0.8, 1.2)
  {
    const grp = new THREE.Group();
    grp.position.set(-5.2, 0.9, -4.0);
    grp.userData = { sinKey: 'greed', basePos: new THREE.Vector3(-5.2, 0.9, -4.0) };

    // 綠寶石 matcap：同樣是金屬感材質，走 matcap 免去無環境貼圖發黑問題
    const emeraldMatcap = createSinsMatcap('#ecfdf5', '#6ee7b7', '#059669', '#022c22');
    const coreGeo = new THREE.IcosahedronGeometry(0.7, 1);
    const coreMat = new THREE.MeshMatcapMaterial({ matcap: emeraldMatcap });
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

    // 金色 matcap：關節、爪尖、金幣、腰環共用
    const goldMatcap = createSinsMatcap('#fffbeb', '#fde047', '#b45309', '#451a03');
    const goldMat = new THREE.MeshMatcapMaterial({ matcap: goldMatcap });

    // 兩道交錯的金腰環
    const collar = new THREE.Group();
    [0, Math.PI / 2.6].forEach((tilt) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.028, 10, 56), goldMat);
      ring.rotation.x = Math.PI / 2 + tilt;
      collar.add(ring);
    });
    grp.add(collar);

    const claws = [];
    const tipMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(0.5 * Math.cos(angle), -0.2, 0.5 * Math.sin(angle)),
        new THREE.Vector3(1.3 * Math.cos(angle), 0.35, 1.3 * Math.sin(angle)),
        new THREE.Vector3(0.85 * Math.cos(angle + 0.3), 0.9, 0.85 * Math.sin(angle + 0.3)),
        new THREE.Vector3(0.25 * Math.cos(angle + 0.4), 0.6, 0.25 * Math.sin(angle + 0.4)),
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      // 每爪獨立 shader（uPhase 錯開），金光帶沿管長流向爪尖
      const clawMesh = new THREE.Mesh(createTaperedTubeGeometry(curve, 28, 8, 0.075, 0.008), createGreedClawMaterial(i / 6));
      clawMesh.userData = { basePoints: pts, angle };
      claws.push(clawMesh);
      grp.add(clawMesh);

      const tipOrb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), tipMat);
      tipOrb.position.copy(pts[3]);
      clawMesh.userData.tipOrb = tipOrb;
      clawMesh.add(tipOrb);

      // 金色關節（爪管上兩處）＋ 爪尖利爪，順著曲線末端方向
      [0.35, 0.68].forEach((t, k) => {
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.058 - k * 0.018, 12, 12), goldMat);
        knuckle.position.copy(curve.getPoint(t));
        clawMesh.add(knuckle);
      });
      const talon = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.24, 8), goldMat);
      talon.position.copy(pts[3]);
      talon.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangent(1).normalize());
      talon.translateY(0.1);
      clawMesh.add(talon);
    }

    // 第二層小觸爪：夾在大爪之間、較短較細，讓輪廓更繁複
    const claws2 = [];
    for (let i = 0; i < 6; i++) {
      const a = ((i + 0.5) / 6) * Math.PI * 2;
      const pts2 = [
        new THREE.Vector3(0.45 * Math.cos(a), -0.3, 0.45 * Math.sin(a)),
        new THREE.Vector3(1.0 * Math.cos(a), 0.05, 1.0 * Math.sin(a)),
        new THREE.Vector3(0.72 * Math.cos(a + 0.25), 0.5, 0.72 * Math.sin(a + 0.25)),
        new THREE.Vector3(0.34 * Math.cos(a + 0.35), 0.38, 0.34 * Math.sin(a + 0.35)),
      ];
      const curve2 = new THREE.CatmullRomCurve3(pts2);
      const c2 = new THREE.Mesh(createTaperedTubeGeometry(curve2, 22, 8, 0.05, 0.006), createGreedClawMaterial(i / 6 + 0.5));
      const tip2 = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), tipMat);
      tip2.position.copy(pts2[3]);
      c2.add(tip2);
      claws2.push(c2);
      grp.add(c2);
    }

    // 吸積金幣：環繞翻轉、螺旋被吸向核心（InstancedMesh，一次繪製）
    const coinCount = 28;
    const coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.026, 18), goldMat, coinCount);
    const coinData = [];
    for (let i = 0; i < coinCount; i++) {
      coinData.push({
        r: 1.5 + Math.random() * 1.6,
        theta: Math.random() * Math.PI * 2,
        y: (Math.random() - 0.5) * 1.1,
        speed: 0.012 + Math.random() * 0.02,
        spin: 0.03 + Math.random() * 0.05,
        rot: Math.random() * Math.PI * 2,
      });
    }
    const coinDummy = new THREE.Object3D();
    grp.add(coins);

    const pCount = 50;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    const pData = [];
    for (let i = 0; i < pCount; i++) {
      const r = 1.2 + Math.random() * 2.2;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 1.5;
      pPos[i * 3] = r * Math.cos(theta);
      pPos[i * 3 + 1] = y;
      pPos[i * 3 + 2] = r * Math.sin(theta);
      pData.push({ r, theta, speed: 0.02 + Math.random() * 0.03, y });
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 0.1,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    const particles = new THREE.Points(pGeo, pMat);
    grp.add(particles);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'greed' };
    grp.add(hit);

    sinCreatures.greed = { group: grp, core, claws, claws2, collar, coins, coinData, coinDummy, particles, pData, hit };
    sinsGroup.add(grp);
  }

  // 3. 暴怒 (Wrath) - 熔岩刺核 (-4.0, 1.3, 2.5)
  {
    const grp = new THREE.Group();
    grp.position.set(-5.0, 1.4, 6.5);
    grp.userData = { sinKey: 'wrath', basePos: new THREE.Vector3(-5.0, 1.4, 6.5) };

    const coreGeo = new THREE.SphereGeometry(0.75, 48, 48);
    const coreMat = createWrathCoreMaterial();
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

    // 升騰火舌：沿上揚曲線的漸細火苗，頂點噪聲搖曳＋沿管長白熱→暗紅漸層
    const flamesGroup = new THREE.Group();

    for (let i = 0; i < 9; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.7;
      const start = new THREE.Vector3(
        0.72 * Math.cos(phi) * Math.cos(theta),
        0.72 * Math.sin(phi),
        0.72 * Math.cos(phi) * Math.sin(theta)
      );
      const height = 0.9 + Math.random() * 0.6;
      const curl = (Math.random() - 0.5) * 0.9;
      const pts = [
        start,
        start.clone().multiplyScalar(1.35).add(new THREE.Vector3(0, height * 0.3, 0)),
        start.clone().multiplyScalar(1.2).add(new THREE.Vector3(curl * 0.4, height * 0.7, 0)),
        start.clone().multiplyScalar(0.9).add(new THREE.Vector3(curl, height, curl * 0.3)),
      ];
      const flamePhase = Math.random() * Math.PI * 2;
      const flame = new THREE.Mesh(
        createTaperedTubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 7, 0.09, 0.005),
        createWrathFlameMaterial(flamePhase)
      );
      flame.userData = { phase: flamePhase, baseScale: 0.85 + Math.random() * 0.5 };
      flame.scale.setScalar(flame.userData.baseScale);
      flamesGroup.add(flame);
    }
    grp.add(flamesGroup);

    const shockRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.03, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.6 })
    );
    shockRing1.rotation.x = Math.PI / 2;
    grp.add(shockRing1);

    const shockRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.022, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.4 })
    );
    shockRing2.rotation.y = Math.PI / 4;
    grp.add(shockRing2);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'wrath' };
    grp.add(hit);

    sinCreatures.wrath = { group: grp, core, flamesGroup, shockRing1, shockRing2, hit };
    sinsGroup.add(grp);
  }

  // 4. 嫉妒 (Envy) - 凝視之蛇 (2.2, 2.2, -2.8)
  {
    const grp = new THREE.Group();
    grp.position.set(4.8, 2.3, -6.5);
    grp.userData = { sinKey: 'envy', basePos: new THREE.Vector3(4.8, 2.3, -6.5) };

    const knotGeo = new THREE.TorusKnotGeometry(0.75, 0.08, 64, 8, 2, 3);
    // 掃描光帶沿扭結管壁流動 ＋ fresnel 邊緣光（金屬件無 env map，改用自發光 shader）
    const knotMat = createEnvyKnotMaterial();
    const knot = new THREE.Mesh(knotGeo, knotMat);
    grp.add(knot);

    // 眼球：視角變色虹彩（IQ palette 模擬薄膜干涉）＋移動掃描高光
    const eyeGeo = new THREE.SphereGeometry(0.38, 32, 32);
    const eyeMat = createEnvyEyeMaterial();
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    grp.add(eye);

    // 角膜：略大於眼球的凸起球冠，罩在虹膜上，負責濕潤的高光（球冠極點朝 +Z＝注視方向）
    const corneaGeo = new THREE.SphereGeometry(0.392, 40, 24, 0, Math.PI * 2, 0, 1.08);
    corneaGeo.rotateX(Math.PI / 2);
    const cornea = new THREE.Mesh(corneaGeo, createEnvyCorneaMaterial());
    cornea.renderOrder = 2;
    eye.add(cornea);

    // 眼球的瞳孔與虹膜已由 ENVY_EYE_FRAG 直接畫在球面上，不再疊獨立 mesh

    // 嫉妒的環伺鬼火：五朵紅紫燐火，沿扭結外側緩慢環繞
    const ghostFires = [];
    for (let i = 0; i < 5; i++) {
      const fire = createGhostFire();
      fire.userData = Object.assign(fire.userData, {
        angle: (i / 5) * Math.PI * 2,
        radius: 1.25 + Math.random() * 0.35,
        speed: 0.008 + Math.random() * 0.006,
        yBase: (Math.random() - 0.5) * 0.8,
        bobPhase: Math.random() * Math.PI * 2,
        baseScale: 1.35, // 比原水滴大一點，全群視野才看得見
      });
      ghostFires.push(fire);
      grp.add(fire);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'envy' };
    grp.add(hit);

    sinCreatures.envy = { group: grp, knot, eye, ghostFires, hit };
    sinsGroup.add(grp);
  }

  // 5. 慾 (Lust) - 纏縛螺旋 (0, 2.5, 9.5)
  // 設計（人類消失後才誕生的概念生物）：慾＝牽引與纏縛。鋸齒緞帶以兩正兩反的螺旋織成紡錘形的籠，
  //   兩端收束在頂端與底端的節點上（不留懸空端）；籠中是一顆會雙拍搏動的暗紅核，每次心跳籠都會收緊；
  //   底節點長出六片向上合攏的利刃花瓣，頂節點垂下三條帶光點的誘引絲。
  {
    const grp = new THREE.Group();
    grp.position.set(0, 2.5, 9.5);
    grp.userData = { sinKey: 'lust', basePos: new THREE.Vector3(0, 2.5, 9.5) };
    const shape = new THREE.Group();
    shape.scale.setScalar(0.66);   // 0.88 × 75%
    grp.add(shape);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const H = 3.2, R = 0.9;

    // 籠：四條鋸齒緞帶（兩條右旋、兩條左旋）。半徑沿高度呈紡錘形，兩端收成 0＝兩端都收進節點
    const cage = new THREE.Group();
    shape.add(cage);
    const ribbonMats = [];
    [[2.2, 0.0], [2.2, Math.PI], [-2.2, Math.PI / 2], [-2.2, Math.PI * 1.5]].forEach(([turns, ph], k) => {
      const pts = [];
      const N = 96;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const r = R * Math.pow(Math.sin(Math.PI * t), 0.75);
        const a = turns * Math.PI * 2 * t + ph;
        pts.push(new THREE.Vector3(r * Math.cos(a), (t - 0.5) * H, r * Math.sin(a)));
      }
      const mat = createLustSnareMaterial(k * 0.25);
      ribbonMats.push(mat);
      const rb = new THREE.Mesh(createSerratedRibbonGeometry(pts, 0.07, 0.17), mat);
      rb.castShadow = true;
      cage.add(rb);
    });
    // 兩端節點（緞帶在此匯聚）
    const nodeMat = createLustBladeMaterial(0);
    const apex = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), nodeMat);
    apex.position.y = H / 2;
    const base = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 14), nodeMat);
    base.position.y = -H / 2;
    shape.add(apex, base);

    // 搏動的核
    const coreMat = createLustCoreMaterial();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 30), coreMat);
    core.scale.set(1, 1.18, 1);
    shape.add(core);
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createRadialGlowTexture('255,40,120'), transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    aura.scale.set(4.2, 5.0, 1);
    shape.add(aura);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createRadialGlowTexture('255,60,140'), transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(8.5, 9.5, 1);
    shape.add(halo);
    const glowLight = new THREE.PointLight(0xff3d8a, 1.6, 15, 2);   // 真的會照亮周圍的粉紅光
    shape.add(glowLight);

    // 底部六片利刃花瓣：以底節點為樞紐向上合攏，像捕蠅的夾
    const blades = [];
    const bladeMats = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.position.set(0, -H / 2, 0);
      pivot.rotation.y = angle;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.45, -0.18, 0),
        new THREE.Vector3(1.05, 0.15, 0),
        new THREE.Vector3(1.38, 0.85, 0),
        new THREE.Vector3(1.32, 1.55, 0),
      ]);
      const bm = createLustBladeMaterial(i * 0.16);
      bladeMats.push(bm);
      const blade = new THREE.Mesh(createTaperedTubeGeometry(curve, 28, 8, 0.15, 0.004), bm);
      blade.castShadow = true;
      pivot.add(blade);
      pivot.userData = { baseZ: 0, phase: i * 0.9 };
      shape.add(pivot);
      blades.push(pivot);
    }

    // 頂部三條誘引絲：從頂節點垂弧而出，尖端有發光點（拉住靠近的東西）
    const lures = [];
    const tips = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      const pivot = new THREE.Group();
      pivot.position.set(0, H / 2, 0);
      pivot.rotation.y = angle;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.35, 0.55, 0),
        new THREE.Vector3(1.0, 0.85, 0),
        new THREE.Vector3(1.7, 0.45, 0),
        new THREE.Vector3(2.0, -0.3, 0),
      ]);
      const lm = createLustBladeMaterial(i * 0.3);
      bladeMats.push(lm);
      pivot.add(new THREE.Mesh(createTaperedTubeGeometry(curve, 30, 6, 0.045, 0.012), lm));
      const tip = new THREE.Sprite(new THREE.SpriteMaterial({
        map: createRadialGlowTexture('255,70,150'), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      tip.scale.set(0.5, 0.5, 1);
      tip.position.copy(curve.getPoint(1));
      pivot.add(tip);
      shape.add(pivot);
      lures.push(pivot);
      tips.push(tip);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'lust' };
    shape.add(hit);

    sinCreatures.lust = { group: grp, shape, cage, core, coreMat, aura, halo, glowLight, blades, lures, tips, ribbonMats, bladeMats, nodeMat, hit };
    sinsGroup.add(grp);
  }

  // 6. 暴食 (Gluttony) - 吞噬巨口 (-3.6, 1.6, -3.0)
  {
    const grp = new THREE.Group();
    grp.position.set(5.2, 1.7, 0);
    grp.userData = { sinKey: 'gluttony', basePos: new THREE.Vector3(5.2, 1.7, 0) };

    const sacGeo = new THREE.TorusGeometry(0.9, 0.35, 24, 48);
    const sacMat = new THREE.MeshPhysicalMaterial({
      color: 0x7c2d12,
      emissive: 0xc2410c,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.3,
    });
    const sac = new THREE.Mesh(sacGeo, sacMat);
    sac.rotation.x = Math.PI / 2;
    grp.add(sac);

    const maws = [];
    const mawSizes = [0.95, 0.65, 0.35];
    const lipMat = new THREE.MeshStandardMaterial({
      color: 0xfdba74,
      emissive: 0xea580c,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    const throatMat = new THREE.MeshBasicMaterial({ color: 0x1c0a04, side: THREE.DoubleSide });

    mawSizes.forEach((sz, idx) => {
      const mGeo = new THREE.CylinderGeometry(sz, sz * 0.6, 0.4, 24, 1, true);
      // 向心漩渦：極座標流紋往喉深捲入，每口相位錯開
      const mMat = createGluttonyMawMaterial(idx * 0.8);
      const mawMesh = new THREE.Mesh(mGeo, mMat);
      mawMesh.position.y = (idx - 1) * 0.3;
      mawMesh.userData = { baseScale: sz, offset: idx * 0.8 };

      // 唇環與深喉，讓漏斗有厚度與深度
      const lip = new THREE.Mesh(new THREE.TorusGeometry(sz, 0.05, 12, 48), lipMat);
      lip.position.y = 0.2;
      lip.rotation.x = Math.PI / 2;
      mawMesh.add(lip);

      const throat = new THREE.Mesh(new THREE.CircleGeometry(sz * 0.58, 24), throatMat);
      throat.position.y = -0.18;
      throat.rotation.x = -Math.PI / 2;
      mawMesh.add(throat);

      maws.push(mawMesh);
      grp.add(mawMesh);
    });

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'gluttony' };
    grp.add(hit);

    sinCreatures.gluttony = { group: grp, sac, maws, hit };
    sinsGroup.add(grp);
  }

  // 7. 怠慢 (Sloth) - 滯重沉降者 (-1.6, 0.02, 3.4)
  // 設計（人類消失後才誕生的概念生物，不模仿現有動物）：怠慢＝慣性與沉降的重量。
  //   層層堆疊的灰岩軟體半陷進地面，肚腹垂掛一圈石筍利齒，兩條斷節的重臂以厚實的肩窩接在身上、拖在地上；
  //   岩縫與正面裂口滲出暗紫幽光；周圍的灰燼碎片緩慢環繞，地面的重力圈不斷向它收縮。
  {
    const grp = new THREE.Group();
    grp.position.set(-1.6, 0.02, 3.4);
    grp.userData = { sinKey: 'sloth', basePos: new THREE.Vector3(-1.6, 0.02, 3.4) };
    const shape = new THREE.Group();
    shape.scale.setScalar(0.9);   // 外層 grp.scale 留給點選放大／狂暴
    grp.add(shape);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const bodyMat = createSlothStrataMaterial(0);
    const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // 身體：球體變形——肩部寬、層層外突的地層邊、下緣外擴、頂端鋸齒、整體向右歪
    const bodyShape = (y, ang) => {
      const shoulder = Math.exp(-Math.pow((y - 0.1) / 0.75, 2));
      let rr = 0.78 + 0.28 * shoulder;
      rr *= 1 + 0.07 * (Math.floor((y + 1) * 3.5) % 2 ? 1 : -0.25);
      rr *= 1 + 0.25 * sstep(0.1, -0.9, y);
      return rr;
    };
    const bg = new THREE.SphereGeometry(1, 64, 48);
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const ang = Math.atan2(z, x);
      const rr = bodyShape(y, ang);
      const crown = 0.14 * Math.sin(ang * 5) * sstep(0.6, 1.0, y);
      bp.setXYZ(i, x * rr * 1.25 + 0.28 * sstep(-0.3, 1.0, y), (y + 1) * 1.15 - 0.25 + crown, z * rr * 1.1);
    }
    bg.computeVertexNormals();
    const body = new THREE.Mesh(bg, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    shape.add(body);
    const radiusAt = (Y) => bodyShape((Y + 0.25) / 1.15 - 1, 0) * 1.2;

    // 地面陷坑：被身體壓出來的隆起圈與碎石
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x1d1a1f, roughness: 1 });
    const crater = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.42, 10, 40), soilMat);
    crater.rotation.x = Math.PI / 2; crater.scale.set(1, 1, 0.45); crater.position.y = 0.05;
    shape.add(crater);
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1.5, 2.4);
      const lump = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.1, 0.3), 0), bodyMat);
      lump.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      lump.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      lump.castShadow = true;
      shape.add(lump);
    }

    // 肚腹垂掛的石筍利齒：從身體中段向下，長短不一，有些戳到地面
    for (let i = 0; i < 15; i++) {
      const a = (i / 15) * Math.PI * 2 + rnd(-0.12, 0.12);
      const Y0 = rnd(0.85, 1.3), L = rnd(0.7, 1.55), R = radiusAt(Y0);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.10, 0.2), L, 8), bodyMat);
      cone.rotation.x = Math.PI;
      cone.rotation.z = rnd(-0.12, 0.12);
      cone.position.set(Math.cos(a) * R * 0.92 + 0.12, Y0 - L / 2 + 0.05, Math.sin(a) * R * 0.85);
      cone.castShadow = true;
      shape.add(cone);
    }

    // 兩條重臂：厚實肩窩（一半埋在身體裡）＋一節節重疊的斷節，最後拖成一塊沉重的錨
    const arms = [];
    [-1, 1].forEach(s => {
      const armG = new THREE.Group();
      shape.add(armG);
      const sx = s > 0 ? 1.15 : -0.85, sy = 1.4;
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 14), bodyMat);
      socket.scale.set(1, 0.9, 1);
      socket.position.set(sx, sy, 0.1);
      socket.castShadow = true;
      armG.add(socket);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, sy, 0.1),
        new THREE.Vector3(sx + s * 0.55, sy - 0.45, 0.4),
        new THREE.Vector3(sx + s * 0.75, sy - 1.0, 1.0),
        new THREE.Vector3(sx + s * 0.45, sy - 1.3, 1.6),
        new THREE.Vector3(sx + s * 0.2, sy - 1.34, 1.95),
      ]);
      const N = 9;
      for (let k = 0; k <= N; k++) {
        const t = k / N, p = curve.getPoint(t), tan = curve.getTangent(t).normalize();
        const rad = 0.30 * (1 - 0.5 * t) + 0.05;
        const seg = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bodyMat);
        seg.scale.set(rad, rad * 0.88, rad * 1.5);
        seg.position.copy(p);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        seg.castShadow = true;
        armG.add(seg);
      }
      const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.8), bodyMat);   // 末端：拖在地上的重錨
      const pe = curve.getPoint(1);
      anchor.position.set(pe.x, 0.17, pe.z + 0.1);
      anchor.rotation.set(rnd(-0.1, 0.1), s * 0.4, rnd(-0.1, 0.1));
      anchor.castShadow = true;
      armG.add(anchor);
      arms.push(armG);
    });

    // 環繞的灰燼碎片（極慢旋轉），少數帶暗紫幽光
    const shards = new THREE.Group();
    shard: {
      const ashMat = new THREE.MeshStandardMaterial({ color: 0x2c2a30, roughness: 1 });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x9a52e0 });
      for (let i = 0; i < 46; i++) {
        const a = Math.random() * Math.PI * 2, r = rnd(2.3, 3.4);
        const m = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.07, 0.22), rnd(0.05, 0.16), rnd(0.07, 0.22)), i % 8 === 0 ? glowMat : ashMat);
        m.position.set(Math.cos(a) * r, rnd(0.4, 2.5), Math.sin(a) * r);
        m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        m.userData.spin = rnd(-0.25, 0.25);
        shards.add(m);
      }
    }
    shape.add(shards);

    // 重力圈：貼地的幾圈暗紫環，不斷向本體收縮（被拖著下沉）
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 72), new THREE.MeshBasicMaterial({
        color: 0x8a45d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      ring.userData.i = i;
      shape.add(ring);
      rings.push(ring);
    }
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(2.9, 40), new THREE.MeshBasicMaterial({
      map: createRadialGlowTexture('0,0,0'), transparent: true, opacity: 0.6, depthWrite: false,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    shape.add(shadow);

    // 緩緩下沉的灰燼微粒
    const MOTES = 110;
    const mp = new Float32Array(MOTES * 3);
    for (let i = 0; i < MOTES; i++) {
      const a = Math.random() * Math.PI * 2, r = rnd(0.8, 3.2);
      mp[i * 3] = Math.cos(a) * r; mp[i * 3 + 1] = rnd(0, 3.4); mp[i * 3 + 2] = Math.sin(a) * r;
    }
    const motesGeo = new THREE.BufferGeometry();
    motesGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ color: 0xb59cff, size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
    motes.frustumCulled = false;
    shape.add(motes);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'sloth' };
    hit.position.y = 1.1;
    shape.add(hit);

    sinCreatures.sloth = { group: grp, shape, body, arms, shards, rings, motes, bodyMat, hit };
    sinsGroup.add(grp);
  }

  // 8. 共生網絡連線與孢子雲
  buildSinsWeb();
  buildSinsSpores();
}

function buildSinsWeb() {
  const pairs = [
    ['pride', 'envy'], ['pride', 'wrath'], ['pride', 'greed'],
    ['greed', 'gluttony'], ['wrath', 'gluttony'], ['lust', 'pride'],
    ['lust', 'greed'], ['lust', 'wrath'], ['sloth', 'gluttony'], ['sloth', 'lust']
  ];

  sinWebTubes = [];
  sinWebPulses = [];

  pairs.forEach(([a, b]) => {
    if (!sinCreatures[a] || !sinCreatures[b]) return;
    const pa = sinCreatures[a].group.position;
    const pb = sinCreatures[b].group.position;

    // 弧形下垂的有機曲線，取代兩點間的直線；下垂量與偏移固定下來，之後每幀沿用同一形狀跟隨兩端
    const sag = 0.7 + Math.random() * 0.6;
    const midOff = { x: (Math.random() - 0.5) * 1.2, z: (Math.random() - 0.5) * 1.2 };
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y -= sag;
    mid.x += midOff.x;
    mid.z += midOff.z;
    const q1 = pa.clone().lerp(mid, 0.45);
    const q2 = pb.clone().lerp(mid, 0.45);
    const curve = new THREE.CatmullRomCurve3([pa.clone(), q1, mid, q2, pb.clone()]);

    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.02, 6, false), tubeMat);
    tube.userData = { phase: Math.random() * Math.PI * 2, a, b, sag, midOff, lastAx: pa.x, lastAz: pa.z, lastBx: pb.x, lastBz: pb.z };
    sinWebTubes.push(tube);
    sinsGroup.add(tube);

    // 沿曲線流動的能量光點
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
      })
    );
    pulse.userData = { curve, t: Math.random(), speed: 0.003 + Math.random() * 0.004 };
    sinWebPulses.push(pulse);
    sinsGroup.add(pulse);
  });
}

// 光絲跟隨：兩端位移超過門檻（x/z）才重建管路幾何，端點沒動就跳過，避免每幀浪費
const SINS_WEB_MOVE_EPS = 0.03;
function updateSinsWeb() {
  for (let i = 0; i < sinWebTubes.length; i++) {
    const tube = sinWebTubes[i];
    const u = tube.userData;
    const ca = sinCreatures[u.a];
    const cb = sinCreatures[u.b];
    if (!ca || !cb) continue;
    const pa = ca.group.position;
    const pb = cb.group.position;
    if (Math.abs(pa.x - u.lastAx) < SINS_WEB_MOVE_EPS && Math.abs(pa.z - u.lastAz) < SINS_WEB_MOVE_EPS &&
        Math.abs(pb.x - u.lastBx) < SINS_WEB_MOVE_EPS && Math.abs(pb.z - u.lastBz) < SINS_WEB_MOVE_EPS) continue;
    const mid = pa.clone().add(pb).multiplyScalar(0.5);
    mid.y -= u.sag;
    mid.x += u.midOff.x;
    mid.z += u.midOff.z;
    const q1 = pa.clone().lerp(mid, 0.45);
    const q2 = pb.clone().lerp(mid, 0.45);
    const curve = new THREE.CatmullRomCurve3([pa.clone(), q1, mid, q2, pb.clone()]);
    tube.geometry.dispose();
    tube.geometry = new THREE.TubeGeometry(curve, 20, 0.02, 5, false);
    u.lastAx = pa.x; u.lastAz = pa.z; u.lastBx = pb.x; u.lastBz = pb.z;
    const pulse = sinWebPulses[i];
    if (pulse) pulse.userData.curve = curve;
  }
}

function buildSinsSpores() {
  const pCount = 200;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(pCount * 3);
  sinSporeVels = [];
  for (let i = 0; i < pCount; i++) {
    const r = 2.0 + Math.random() * 7.0;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * 8.0;
    pPos[i * 3] = r * Math.cos(theta);
    pPos[i * 3 + 1] = y;
    pPos[i * 3 + 2] = r * Math.sin(theta);
    sinSporeVels.push({
      r, theta, y,
      speed: 0.003 + Math.random() * 0.008,
      yDrift: (Math.random() - 0.5) * 0.005
    });
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xf43f5e,
    size: 0.09,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending
  });
  sinSpores = new THREE.Points(pGeo, pMat);
  sinsGroup.add(sinSpores);
}

// -------------------------------------------------------------
// [虛無 Void] 三大指令
// -------------------------------------------------------------
// 核心強光：三層疊加——核心本體白熱（自發光）、疊加光暈精靈瞬間脹大蓋過畫面、點光源把周遭膜面照亮；都是 80ms 衝頂、約 1 秒淡出
let voidFlash = null, voidFlashLight = null;
function flashVoidCore(power = 1) {
  if (!voidFlash) {
    voidFlash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createRadialGlowTexture('255,255,255'), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    voidFlash.renderOrder = 999;
    voidGroup.add(voidFlash);
    voidFlashLight = new THREE.PointLight(0xe9d5ff, 0, 40);
    voidGroup.add(voidFlashLight);
  }
  const up = TWEEN.Easing.Quadratic.Out, down = TWEEN.Easing.Cubic.In;
  const peak = (obj, key, max, upMs, downMs) => {
    const o = {}; o[key] = max;
    const z = {}; z[key] = 0;
    new TWEEN.Tween(obj).to(o, upMs).easing(up).chain(new TWEEN.Tween(obj).to(z, downMs).easing(down)).start();
  };
  voidCore.material.emissive.set(0xffffff);
  voidCore.material.emissiveIntensity = 0;
  peak(voidCore.material, 'emissiveIntensity', 5 * power, 80, 1100);
  voidFlash.scale.set(3, 3, 1);
  new TWEEN.Tween(voidFlash.scale).to({ x: 18, y: 18 }, 700).easing(TWEEN.Easing.Exponential.Out).start();
  peak(voidFlash.material, 'opacity', Math.min(1, power), 80, 1000);
  peak(voidFlashLight, 'intensity', 14 * power, 80, 1100);
}

function triggerVoidDevour() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  if (typeof VoidVoice !== 'undefined') VoidVoice.embrace(); // 吞噬時叫得更飽滿（10 秒冷卻）
  voidStateText.innerText = "包覆吞噬：萬物向奇點坍縮...";

  // 大爆炸節奏：① 微微收縮蓄力（慢）→ ② 奇點爆發、極速暴脹後減速（快）→ ③ 餘波漂移 → ④ 緩緩收斂
  const scaleTo = (mesh, to, ms, ease) => new TWEEN.Tween(mesh.scale).to({ x: to, y: to, z: to }, ms).easing(ease).start();

  // ① 收縮：外膜縮到約 78%、核心與光暈一起內縮、符文被往內吸一點，光暈暗下去
  scaleTo(voidMembrane, 0.78, 750, TWEEN.Easing.Sinusoidal.InOut);
  scaleTo(voidMembraneWire, 0.78 * 1.01, 750, TWEEN.Easing.Sinusoidal.InOut);
  scaleTo(voidCore, 0.82, 750, TWEEN.Easing.Sinusoidal.InOut);
  new TWEEN.Tween(voidAura.material).to({ opacity: 0.1 }, 750).start();
  new TWEEN.Tween(voidRuneBurst).to({ v: -0.14 }, 750).easing(TWEEN.Easing.Sinusoidal.InOut).start();

  // ② 爆發：極短時間衝到最大（指數緩出＝一開始最快、後面越來越慢），光暈瞬間閃白、核心脹一下、符文向外炸開
  setTimeout(() => {
    voidStateText.innerText = "奇點爆發！時空極速暴脹——";
    if (typeof VoidVoice !== 'undefined') VoidVoice.embrace();
    flashVoidCore();
    scaleTo(voidMembrane, 4.2, 420, TWEEN.Easing.Exponential.Out);
    scaleTo(voidMembraneWire, 4.2 * 1.01, 420, TWEEN.Easing.Exponential.Out);
    scaleTo(voidCore, 1.3, 220, TWEEN.Easing.Quadratic.Out);
    new TWEEN.Tween(voidAura.material).to({ opacity: 1.0 }, 140).easing(TWEEN.Easing.Quadratic.Out).start();
    new TWEEN.Tween(voidRuneBurst).to({ v: 1.0 }, 600).easing(TWEEN.Easing.Exponential.Out).start();
  }, 800);

  // ③ 餘波：外膜仍緩慢外漂、光暈慢慢退，像宇宙持續膨脹
  setTimeout(() => {
    voidStateText.innerText = "餘波擴散，吸收文明能量...";
    scaleTo(voidMembrane, 4.6, 1000, TWEEN.Easing.Linear.None);
    scaleTo(voidMembraneWire, 4.6 * 1.01, 1000, TWEEN.Easing.Linear.None);
    scaleTo(voidCore, 1.0, 900, TWEEN.Easing.Cubic.InOut);
    new TWEEN.Tween(voidAura.material).to({ opacity: 0.6 }, 1000).start();
  }, 1300);

  // ④ 收斂：外膜與符文緩緩回到原位
  setTimeout(() => {
    voidStateText.innerText = "外膜收斂重組...";
    scaleTo(voidMembrane, 1, 1300, TWEEN.Easing.Cubic.InOut);
    scaleTo(voidMembraneWire, 1, 1300, TWEEN.Easing.Cubic.InOut);
    new TWEEN.Tween(voidRuneBurst).to({ v: 0 }, 1500).easing(TWEEN.Easing.Cubic.InOut).start();
    new TWEEN.Tween(voidAura.material).to({ opacity: 0.28 }, 1300).onComplete(() => {
      isVoidActionRunning = false;
      voidStateText.innerText = "平穩呼吸・殘影共鳴中";
    }).start();
  }, 2400);
}

function triggerVoidAssimilate() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  voidStateText.innerText = "共鳴同化：精神頻率同步，光譜躍遷！";

  const colors = [0x38bdf8, 0x10b981, 0xf59e0b, 0xec4899, 0x8b5cf6];
  let step = 0;

  const colorInterval = setInterval(() => {
    step++;
    const nextCol = new THREE.Color(colors[step % colors.length]);
    voidMembrane.material.color.set(nextCol);
    voidParticles.material.color.set(nextCol);

    if (step > 6) {
      clearInterval(colorInterval);
      voidMembrane.material.color.setHex(0x6366f1);
      voidParticles.material.color.setHex(0x38bdf8);
      isVoidActionRunning = false;
      voidStateText.innerText = "平穩呼吸・殘影共鳴中";
    }
  }, 280);
}

// 維度瞬移：3D ⇄ 2D 來回切換
// 第一次按：整組沿鏡頭方向壓進二維平面，中心從「四維投影成三維」
//           收合成「三維立方體畫在二維紙上」的線稿
// 再按一次：平面展開，回到原本的三維形態
// 前搖：空間失穩——整隻虛無由小到大劇烈震顫（振幅逐步升高）、核心內縮、符文被往內擠、光暈發亮，
// 約 1.2 秒後在震幅最大時「啪」一聲才真正切換維度。由 animate() 每幀呼叫 applyVoidTeleportShake()
const voidTeleportShake = { amp: 0, active: false, base: new THREE.Vector3() };

// 衝擊波環：面向鏡頭、從核心位置往外擴散並淡出，結束後自己清掉
function spawnVoidShockwave(hex, maxScale = 16, ms = 750, delay = 0) {
  setTimeout(() => {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.93, 1, 64),
      new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
    );
    ring.renderOrder = 998;
    voidGroup.getWorldPosition(ring.position);
    ring.quaternion.copy(camera.quaternion);
    ring.scale.setScalar(1.5);
    scene.add(ring);
    new TWEEN.Tween(ring.scale).to({ x: maxScale, y: maxScale, z: 1 }, ms).easing(TWEEN.Easing.Cubic.Out).start();
    new TWEEN.Tween(ring.material).to({ opacity: 0 }, ms).easing(TWEEN.Easing.Quadratic.In).onComplete(() => {
      scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
    }).start();
  }, delay);
}
// 鏡頭視角衝擊：fov 先收再放，onUpdate 要重算投影矩陣
function tweenCameraFov(to, ms, ease) {
  new TWEEN.Tween(camera).to({ fov: to }, ms).easing(ease).onUpdate(() => camera.updateProjectionMatrix()).start();
}
function applyVoidTeleportShake(t) {
  const k = voidTeleportShake;
  if (!k.active) return;
  const a = k.amp;
  voidGroup.position.set(
    k.base.x + (Math.sin(t * 83) + Math.sin(t * 47 + 1.3)) * 0.14 * a,
    k.base.y + (Math.sin(t * 71 + 0.7) + Math.sin(t * 53)) * 0.14 * a,
    k.base.z + (Math.sin(t * 61 + 2.1) + Math.sin(t * 97)) * 0.10 * a
  );
  const tremble = 1 + Math.sin(t * 58) * 0.05 * a;          // 外膜高頻抽動
  voidMembrane.scale.setScalar(tremble);
  voidMembraneWire.scale.setScalar(tremble * 1.01);
  voidAura.scale.setScalar(1 + Math.sin(t * 40) * 0.2 * a);
  // 震幅過半後，線框在青／洋紅／白之間快速閃爍（像訊號破圖）
  if (a > 0.3) voidMembraneWire.material.color.setHex([0x38bdf8, 0xff2bd6, 0xffffff][Math.floor(t * 22) % 3]);
}

function triggerVoidTeleport() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;

  const k = voidTeleportShake;
  k.base.copy(voidGroup.position);
  k.amp = 0;
  k.active = true;
  voidStateText.innerText = isVoidFlat ? "維度結構不穩：平面開始震顫、邊緣撕裂..." : "維度結構不穩：空間劇烈震顫，物質開始失去厚度...";
  if (typeof VoidVoice !== 'undefined') VoidVoice.embrace();

  new TWEEN.Tween(k).to({ amp: 1 }, 1100).easing(TWEEN.Easing.Quadratic.In).start();       // 震幅越來越大
  new TWEEN.Tween(voidCore.scale).to({ x: 0.78, y: 0.78, z: 0.78 }, 1100).easing(TWEEN.Easing.Quadratic.In).start();
  new TWEEN.Tween(voidRuneBurst).to({ v: -0.25 }, 1100).easing(TWEEN.Easing.Quadratic.In).start();
  new TWEEN.Tween(voidAura.material).to({ opacity: 0.85 }, 1100).start();
  tweenCameraFov(38, 1150, TWEEN.Easing.Quadratic.In);           // 鏡頭越推越緊
  spawnVoidShockwave(0x38bdf8, 7, 600, 450);                      // 蓄力途中兩道小衝擊波
  spawnVoidShockwave(0xff2bd6, 9, 650, 850);

  setTimeout(() => {
    // 震幅最高點：停震、核心與符文彈回，接著進入真正的維度切換
    k.active = false;
    voidGroup.position.copy(k.base);
    voidMembraneWire.material.color.setHex(0x38bdf8);
    // 切換瞬間的爆點：強光、兩道大衝擊波、鏡頭先外彈再回正、整體鼓一下
    flashVoidCore(0.8);
    spawnVoidShockwave(0xffffff, 22, 800);
    spawnVoidShockwave(0xa855f7, 26, 1000, 130);
    tweenCameraFov(54, 110, TWEEN.Easing.Quadratic.Out);
    setTimeout(() => tweenCameraFov(45, 700, TWEEN.Easing.Cubic.InOut), 120);
    new TWEEN.Tween(voidGroup.scale).to({ x: 1.3, y: 1.3 }, 110).easing(TWEEN.Easing.Quadratic.Out).yoyo(true).repeat(1).start();
    new TWEEN.Tween(voidCore.scale).to({ x: 1, y: 1, z: 1 }, 400).easing(TWEEN.Easing.Back.Out).start();
    new TWEEN.Tween(voidRuneBurst).to({ v: 0 }, 700).easing(TWEEN.Easing.Cubic.Out).start();
    new TWEEN.Tween(voidAura.material).to({ opacity: 0.28 }, 900).start();
    performVoidTeleport();
  }, 1200);
}

function performVoidTeleport() {
  isVoidFlat = !isVoidFlat;
  syncVoidTeleportBtn();

  if (isVoidFlat) {
    voidStateText.innerText = "維度瞬移：空間塌陷，厚度被壓成零！";
    controls.autoRotate = false; // 二維紙片停在原地，可自由繞到側面看薄片

    // 快照當下鏡頭方向：壓扁的同時把平面轉正面向你，之後就不再追蹤鏡頭
    voidFlatLook.position.copy(voidGroup.position);
    voidFlatLook.lookAt(camera.position);
    voidFlatFaceQ.copy(voidFlatLook.quaternion);

    new TWEEN.Tween(voidFlatState)
      .to({ v: 1 }, 900)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    new TWEEN.Tween(voidGroup.scale)
      .to({ z: 0.03 }, 900) // 不能壓到 0（法線矩陣會失效），留一點厚度
      .easing(TWEEN.Easing.Cubic.InOut)
      .onComplete(() => {
        isVoidActionRunning = false;
        voidStateText.innerText = "二維形態・世界失去厚度，只剩平面輪廓";
      })
      .start();
  } else {
    voidStateText.innerText = "維度回昇：平面展開，厚度重新湧現！";

    new TWEEN.Tween(voidFlatState)
      .to({ v: 0 }, 900)
      .easing(TWEEN.Easing.Cubic.InOut)
      .start();
    new TWEEN.Tween(voidGroup.scale)
      .to({ z: 1 }, 900)
      .easing(TWEEN.Easing.Back.Out)
      .onComplete(() => {
        controls.autoRotate = true;
        isVoidActionRunning = false;
        voidStateText.innerText = "平穩呼吸・殘影共鳴中";
      })
      .start();
  }
}

// 維度瞬移按鈕：依二維／三維狀態換主標與說明
function syncVoidTeleportBtn() {
  const btn = document.getElementById('btn-void-teleport');
  if (!btn) return;
  btn.querySelector('.btn-text').innerText = isVoidFlat ? "返回三維" : "維度瞬移";
  btn.querySelector('small').innerText = isVoidFlat ? "展開折疊平面，重回三維形態" : "折疊壓縮至二維平面";
}

// -------------------------------------------------------------
// [七大罪 Seven Sins] 選擇與四大生態指令
// -------------------------------------------------------------
function selectSin(sinKey, moveCamera = true) {
  currentSelectedSin = sinKey;
  const data = SINS_DATA[sinKey] || SINS_DATA.all;

  const targetName = document.getElementById('sin-target-name');
  const roleText = document.getElementById('sin-role-text');
  const morphText = document.getElementById('sin-morph-text');
  const forageText = document.getElementById('sin-forage-text');
  const stateText = document.getElementById('sin-state-text');

  if (targetName) targetName.innerText = data.title;
  if (roleText) roleText.innerText = data.role;
  if (morphText) morphText.innerText = data.morph;
  if (forageText) forageText.innerText = data.forage;
  if (stateText) stateText.innerText = data.state;

  document.querySelectorAll('.sin-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sin === sinKey);
  });
  document.querySelectorAll('.sin-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sin === sinKey);
  });

  if (moveCamera && data.cameraPos && data.targetPos) {
    new TWEEN.Tween(camera.position)
      .to(data.cameraPos, 850)
      .easing(TWEEN.Easing.Cubic.Out)
      .start();
    new TWEEN.Tween(controls.target)
      .to(data.targetPos, 850)
      .easing(TWEEN.Easing.Cubic.Out)
      .start();
  }

  if (sinCreatures[sinKey]) {
    const grp = sinCreatures[sinKey].group;
    new TWEEN.Tween(grp.scale)
      .to({ x: 1.25, y: 1.25, z: 1.25 }, 250)
      .yoyo(true)
      .repeat(1)
      .start();
  }
}

function triggerSinsFrenzy() {
  if (isSinsActionRunning) return;
  isSinsActionRunning = true;
  isSinsFrenzy = true;

  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "罪孽狂宴爆發！七罪各現本性——傲慢升空、貪婪撲抓、暴怒狂震、嫉妒覬覦、色慾起舞、暴食膨脹、怠惰癱倒！";

  // 記下各隻原本的旋轉，狂宴結束時還原；編舞由 animate() 每幀呼叫 applySinsFrenzyChoreo()
  SINS_FRENZY.start = performance.now();
  for (const key in sinCreatures) {
    const grp = sinCreatures[key].group;
    grp.userData.frenzyRot = grp.rotation.clone();
  }

  setTimeout(() => {
    isSinsFrenzy = false;
    isSinsActionRunning = false;
    for (const key in sinCreatures) {
      const grp = sinCreatures[key].group;
      grp.scale.set(1, 1, 1);
      if (grp.userData.frenzyRot) grp.rotation.copy(grp.userData.frenzyRot);
      grp.position.copy(grp.userData.basePos);
    }
    if (stateText) stateText.innerText = SINS_DATA[currentSelectedSin]?.state || "生態平衡・7 隻生命體共生共鳴中";
  }, SINS_FRENZY.dur * 1000);
}

// —— 罪孽狂宴編舞：持續 5 秒，七隻各演自己的罪 ——
// 設計原則（讓它像活體而不是在滑動的物件）：
//   1) 起勢 → 爆發 → 收勢：先蓄力（反向縮一下）再出擊，落地要壓扁、再彈回（擠壓與拉伸）
//   2) 不用 Math.random 抖動、不用等速滑動／自轉；用緩動曲線與「衰減震動」
//   3) 移動時身體朝向移動方向、並順勢前傾
// 每隻只動「整組」的位置／旋轉／縮放（不碰內部細節），e 是淡入淡出包絡（0→1→0）
const SINS_FRENZY = { dur: 5, start: 0 };
const _clamp01 = (x) => Math.max(0, Math.min(1, x));
const _smooth = (x) => { x = _clamp01(x); return x * x * (3 - 2 * x); };
const _easeOut = (x) => 1 - Math.pow(1 - _clamp01(x), 3);
const _easeIn = (x) => Math.pow(_clamp01(x), 3);
const _angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));   // a 轉到 b 的最短角度

function applySinsFrenzyChoreo() {
  const t = (performance.now() - SINS_FRENZY.start) / 1000;
  const ramp = 0.6;
  const e = _smooth(Math.min(t / ramp, (SINS_FRENZY.dur - t) / ramp));
  const TAU = Math.PI * 2;

  const place = (key, fn) => {
    const c = sinCreatures[key];
    if (!c) return;
    const g = c.group, b = g.userData.basePos, r0 = g.userData.frenzyRot || g.rotation;
    g.position.copy(b);
    g.rotation.copy(r0);
    g.scale.set(1, 1, 1);
    fn(g, b, r0);
  };
  // 面向某個水平方向（依 e 淡入，不會瞬間轉頭）
  const face = (g, r0, dx, dz) => {
    g.rotation.y = r0.y + _angDiff(r0.y, Math.atan2(dx, dz)) * e;
  };

  // 傲慢：昂首緩緩升起、挺胸，慢慢左顧右盼（俯視眾生），像飄浮的帝王，動作從容不急
  place('pride', (g, b, r0) => {
    g.position.y = b.y + 2.4 * _easeOut(t / 1.6) * e + Math.sin(t * 1.6) * 0.12 * e;
    g.rotation.y = r0.y + Math.sin(t * 0.9) * 0.7 * e;          // 緩慢睥睨，不是一直自轉
    g.rotation.x = r0.x - 0.12 * e;                              // 仰頭
    const s = 1 + 0.22 * e + 0.025 * Math.sin(t * 2.4);          // 挺胸 + 呼吸
    g.scale.set(s, s, s);
  });

  // 貪婪：循環「蓄力→猛撲→抓住→收回」，每圈 1.25 秒；撲出去時身體拉長、收回時回彈
  place('greed', (g, b, r0) => {
    const cx = 0 - b.x, cz = 0 - b.z;
    const len = Math.hypot(cx, cz) || 1;
    const p = (t / 1.25) % 1;
    let reach = 0, stretch = 0;
    if (p < 0.22) { const k = p / 0.22; reach = -0.12 * _smooth(k); stretch = -0.12 * _smooth(k); }          // 蓄力：往後縮、壓扁
    else if (p < 0.40) { const k = (p - 0.22) / 0.18; reach = -0.12 + 0.82 * _easeOut(k); stretch = -0.12 + 0.34 * _easeOut(k); }  // 猛撲：快速伸出
    else if (p < 0.55) { reach = 0.70; stretch = 0.22 - 0.22 * _smooth((p - 0.40) / 0.15); }                 // 抓住：停頓、回彈
    else { reach = 0.70 * (1 - _smooth((p - 0.55) / 0.45)); }                                                  // 緩緩收回
    reach *= e; stretch *= e;
    g.position.x = b.x + (cx / len) * reach * len * 0.85;
    g.position.z = b.z + (cz / len) * reach * len * 0.85;
    g.position.y = b.y + 0.3 * Math.max(0, reach);
    face(g, r0, cx, cz);
    g.rotation.x = r0.x + 0.35 * Math.max(0, reach) * e;         // 撲出時前傾
    g.scale.set(1 - stretch * 0.4, 1 - stretch * 0.4, 1 + stretch);   // 沿撲出方向拉長
  });

  // 暴怒：循環「後仰蓄怒→猛砸落地→落地震顫衰減」，每圈 1.0 秒；震顫是衰減的，不是亂抖
  place('wrath', (g, b, r0) => {
    const p = (t / 1.0) % 1;
    let lift = 0, tilt = 0, sq = 0, shake = 0;
    if (p < 0.55) { const k = _easeOut(p / 0.55); lift = 0.9 * k; tilt = -0.35 * k; sq = -0.10 * k; }       // 抬高、後仰、身體拉高
    else if (p < 0.65) { const k = _easeIn((p - 0.55) / 0.10); lift = 0.9 * (1 - k); tilt = -0.35 * (1 - k) + 0.20 * k; sq = -0.10 + 0.34 * k; }   // 猛砸
    else { const k = (p - 0.65) / 0.35; lift = 0; tilt = 0.20 * (1 - _smooth(k)); sq = 0.24 * Math.exp(-5 * k); shake = Math.exp(-5 * k) * Math.sin(k * 40); }   // 壓扁後彈回＋衰減震顫
    g.position.y = b.y + lift * e;
    g.position.x = b.x + shake * 0.12 * e;
    g.rotation.x = r0.x + tilt * e;
    g.rotation.y = r0.y + Math.sin(t * 5.0) * 0.25 * e;          // 怒目左右猛甩頭（小幅）
    g.scale.set(1 + sq * 0.7 * e, 1 - sq * e, 1 + sq * 0.7 * e);
  });

  // 嫉妒：一格一格偷偷爬向傲慢——走兩步、停下偷看、再走；身體低伏、朝向目標
  place('envy', (g, b, r0) => {
    const p = sinCreatures.pride && sinCreatures.pride.group.userData.basePos;
    if (!p) return;
    const dx = p.x - b.x, dy = p.y - b.y, dz = p.z - b.z;
    const stepT = 0.9;
    const n = Math.floor(t / stepT);
    const within = (t % stepT) / stepT;
    const stepsTotal = 5;
    const progress = (Math.min(n, stepsTotal - 1) + (n < stepsTotal ? _smooth(within / 0.55) : 1)) / stepsTotal * 0.38;   // 每一步只在前 55% 時間移動，其餘停下偷看
    const moving = (n < stepsTotal && within < 0.55) ? 1 : 0;
    g.position.x = b.x + dx * progress * e;
    g.position.y = b.y + dy * progress * e - 0.2 * e;
    g.position.z = b.z + dz * progress * e;
    face(g, r0, dx, dz);
    g.rotation.y += Math.sin(t * 2.6) * 0.25 * (1 - moving) * e;                   // 停下時左右偷瞄
    g.rotation.x = r0.x + 0.25 * moving * e;                                         // 前行時身體前傾
    const s = 1 - 0.12 * e;
    g.scale.set(s, s * (1 - 0.06 * moving), s);
  });

  // 色慾：沿著橢圓軌道曼妙滑行，身體朝向行進方向、隨動作側傾，並隨心跳（雙拍）一縮一放
  place('lust', (g, b, r0) => {
    const w = 1.1;                                                  // 角速度（約 5.7 秒一圈，慢而柔）
    const a = t * w;
    const rx = 1.9 * e, rz = 1.2 * e;
    const x = Math.sin(a) * rx, z = (1 - Math.cos(a)) * rz;         // 從原位出發繞一個橢圓回來
    g.position.x = b.x + x;
    g.position.z = b.z + z;
    g.position.y = b.y + 0.15 * e + Math.sin(a * 2) * 0.25 * e;
    const vx = Math.cos(a) * rx, vz = Math.sin(a) * rz;             // 速度方向
    face(g, r0, vx, vz);
    g.rotation.z = r0.z - Math.cos(a) * 0.18 * e;                   // 轉彎時內傾
    const bp = (t * 1.5) % 1;                                       // 雙拍心跳
    const beat = Math.exp(-18 * Math.pow(bp - 0.12, 2)) + 0.6 * Math.exp(-18 * Math.pow(bp - 0.34, 2));
    const s = 1 + 0.10 * e + 0.16 * beat * e;
    g.scale.set(s, s * (1 + 0.06 * beat * e), s);
  });

  // 暴食：每隔約 0.7 秒大口吞一下——吞的瞬間身體猛擴張、再彈簧般回穩，累積的體型一口一口變大
  place('gluttony', (g, b, r0) => {
    const gulpT = 0.7;
    const n = Math.floor(t / gulpT);
    const k = (t % gulpT);
    const grown = Math.min(n + 1, 7) / 7;                           // 每吞一口 +1 級，最多 7 級
    const baseS = 1 + 0.55 * grown * e;
    const spring = Math.exp(-6 * k) * Math.cos(k * 22);            // 吞下去的彈簧衰減震盪
    const gulp = 0.14 * spring * e;
    g.scale.set(baseS + gulp, baseS - gulp * 1.3, baseS + gulp);
    g.position.y = b.y + 0.35 * e + 0.12 * Math.max(0, spring) * e;
    g.rotation.z = r0.z + Math.sin(t * 1.4) * 0.06 * e;            // 沉重地微微左右晃
  });

  // 怠惰：全場在發狂，牠先慢慢癱向一側，中途吃力地撐起一下，又無力地倒回去（再多動一下都嫌累）
  place('sloth', (g, b, r0) => {
    const droop = _smooth(t / 1.8);
    const struggle = Math.exp(-Math.pow((t - 3.1) / 0.45, 2));       // 約第 3 秒掙扎一下
    const lean = 0.6 * droop - 0.25 * struggle;
    g.rotation.z = r0.z + lean * e;
    g.position.x = b.x - 0.5 * lean * e;
    const flat = 0.22 * droop - 0.08 * struggle;
    g.scale.set(1 + flat * 0.4 * e, 1 - flat * e, 1 + flat * 0.4 * e);
  });
}

// —— 群聚漩渦：拔地而起 → 建築物上空成環快速旋轉 → 歸位 ——
// 聚集高度取 16.5（街屋最高＋加建層約 15，管橋約 7.7），移動全程都在街道淨空廊道內，
// 不會穿過任何建築；不需要 2D 繞行，因為垂直上升與空中成環都在建築頂上。
const SINS_SWARM = { active: false, phase: 'idle', t: 0, spin: 0 };
const SWARM_CENTER = { x: 0, z: 1.5 };
const SWARM_RING_R = 2.6;
const SWARM_Y = 16.5;
const SWARM_SPIN_SPEED = 1.5;   // rad/s，約 4.2 秒一圈
const SWARM_RISE_T = 1.6, SWARM_HOLD_T = 2.6, SWARM_RETURN_T = 1.7;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// 每幀由 sins 分支呼叫；回傳 true 代表漩渦進行中（各生命體的 bobbing 要讓路）
function updateSinsSwarm(frameDelta, elapsedTime) {
  if (!SINS_SWARM.active) return false;
  const s = SINS_SWARM;
  s.t += frameDelta;
  const spinEase = s.phase === 'return' ? Math.max(0.15, 1 - s.t / SWARM_RETURN_T) : 1;
  s.spin += frameDelta * SWARM_SPIN_SPEED * spinEase;

  const keys = Object.keys(sinCreatures);
  const n = keys.length;
  keys.forEach((key, i) => {
    const grp = sinCreatures[key].group;
    const ang = (i / n) * Math.PI * 2 + s.spin - Math.PI / 2;
    const ring = {
      x: SWARM_CENTER.x + SWARM_RING_R * Math.cos(ang),
      y: SWARM_Y + Math.sin(elapsedTime * 2.1 + i * 1.3) * 0.4,
      z: SWARM_CENTER.z + SWARM_RING_R * Math.sin(ang),
    };
    const base = grp.userData.basePos;
    if (s.phase === 'rise') {
      const p = easeOutCubic(Math.min(s.t / SWARM_RISE_T, 1));
      grp.position.set(base.x + (ring.x - base.x) * p, base.y + (ring.y - base.y) * p, base.z + (ring.z - base.z) * p);
    } else if (s.phase === 'orbit') {
      grp.position.set(ring.x, ring.y, ring.z);
    } else {
      const p = easeInOutCubic(Math.min(s.t / SWARM_RETURN_T, 1));
      grp.position.set(ring.x + (base.x - ring.x) * p, ring.y + (base.y - ring.y) * p, ring.z + (base.z - ring.z) * p);
    }
  });

  const stateText = document.getElementById('sin-state-text');
  if (s.phase === 'rise' && s.t >= SWARM_RISE_T) {
    s.phase = 'orbit'; s.t = 0;
    if (stateText) stateText.innerText = "漩渦成形——七位一體繞行飛旋，極限頻率！";
  } else if (s.phase === 'orbit' && s.t >= SWARM_HOLD_T) {
    s.phase = 'return'; s.t = 0;
    if (stateText) stateText.innerText = "引力平衡重組，七位一體回歸自然生態軌道...";
  } else if (s.phase === 'return' && s.t >= SWARM_RETURN_T) {
    keys.forEach((key) => sinCreatures[key].group.position.copy(sinCreatures[key].group.userData.basePos));
    SINS_SWARM.active = false;
    isSinsActionRunning = false;
    if (stateText) stateText.innerText = SINS_DATA[currentSelectedSin]?.state || "生態平衡・7 隻生命體共生共鳴中";
  }
  return true;
}

function triggerSinsSwarm() {
  if (isSinsActionRunning) return;
  isSinsActionRunning = true;

  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "罪群拔地而起！七大罪昇騰至建築上空成環！";

  SINS_SWARM.active = true;
  SINS_SWARM.phase = 'rise';
  SINS_SWARM.t = 0;
  SINS_SWARM.spin = 0;

  // 鏡頭往上拉，讓集結環進得了畫面（集結期間拉住，回程結束才放回去）
  const camStart = camera.position.y;
  new TWEEN.Tween(controls.target).to({ y: 14.5 }, 700).easing(TWEEN.Easing.Cubic.Out).start();
  new TWEEN.Tween(camera.position).to({ y: camStart + 5.0 }, 700).easing(TWEEN.Easing.Cubic.Out).start();

  setTimeout(() => {
    new TWEEN.Tween(controls.target).to({ y: 3.2 }, 900).easing(TWEEN.Easing.Cubic.InOut).start();
    new TWEEN.Tween(camera.position).to({ y: camStart }, 900).easing(TWEEN.Easing.Cubic.InOut).start();
  }, 6100);
}
function triggerSinsBalance() {
  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "生態平衡調和：群落共生張力重置，回歸協和律動";

  for (const key in sinCreatures) {
    const grp = sinCreatures[key].group;
    const base = grp.userData.basePos;
    new TWEEN.Tween(grp.position).to({ x: base.x, y: base.y, z: base.z }, 800).easing(TWEEN.Easing.Cubic.Out).start();
    new TWEEN.Tween(grp.scale).to({ x: 1, y: 1, z: 1 }, 800).easing(TWEEN.Easing.Cubic.Out).start();
  }

  selectSin('all', true);
}

// -------------------------------------------------------------
// [羞恥 Shame] 滑鼠偵測與事件 (保持完全未動)
// -------------------------------------------------------------
function setupMouseEvents() {
  window.addEventListener('pointermove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (currentSpecies === 'shame') {
      checkShameHover();
    }
  });

  window.addEventListener('pointerleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
    if (currentSpecies === 'shame') {
      onShameHoverLeave();
    }
  });

  window.addEventListener('pointerdown', () => {
    if (currentSpecies !== 'sins') return;
    raycaster.setFromCamera(mouse, camera);
    const hitList = [];
    for (const key in sinCreatures) {
      if (sinCreatures[key].hit) hitList.push(sinCreatures[key].hit);
    }
    const intersects = raycaster.intersectObjects(hitList);
    if (intersects.length > 0) {
      const hitKey = intersects[0].object.userData.sinKey;
      if (hitKey) selectSin(hitKey, true);
    }
  });
}

function checkShameHover() {
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(hitboxMesh);

  if (intersects.length > 0) {
    if (!isHovered) onShameHoverEnter();
  } else {
    if (isHovered) onShameHoverLeave();
  }
}

// 緊縮護核的牆邊落點：競技場環牆內緣安全半徑內隨機一角（柱墩內面約 R=20.1，
// 球半徑約 1.4，落點 16.2 再加顫抖也不會碰進牆裡）
function pickShameHuddleTarget() {
  const a = Math.random() * Math.PI * 2;
  const r = 16.2;
  shameHuddleTarget = new THREE.Vector3(Math.cos(a) * r, SHAME_HOVER_Y, Math.sin(a) * r);
}

// 直立柱頭與斷柱（球心 y 約 3.6，柱頂 3.2＋柱頭方板，垂直範圍會交疊，必須避開）
const SHAME_COLUMN_OBSTACLES = [
  { x: 6.5, z: 4.5 }, { x: -7.5, z: 2.8 }, { x: -3.5, z: -8.5 }, { x: 8.2, z: -4.0 },
];
const SHAME_COLUMN_MARGIN = 2.35; // 柱半徑 0.55＋球半徑（縮小後約 1.3，未縮小約 2.1）＋餘量

// 任何 XZ 移動之後都跑一次：柱心到球心若低於安全距，直接推出去（保證不穿模）
function resolveShameColumns() {
  for (const o of SHAME_COLUMN_OBSTACLES) {
    const dx = shameGroup.position.x - o.x;
    const dz = shameGroup.position.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < SHAME_COLUMN_MARGIN && d > 0.001) {
      const push = SHAME_COLUMN_MARGIN - d;
      shameGroup.position.x += (dx / d) * push;
      shameGroup.position.z += (dz / d) * push;
    }
  }
}

function onShameHoverEnter() {
  isHovered = true;
  targetShameFactor = 1.0;

  shameStateText.innerText = "被碰到了！極度羞恥，塗鴉筆劃炸開四散！";
  shameStateText.classList.add('ashamed');
}

function onShameHoverLeave() {
  isHovered = false;
  targetShameFactor = 0.0;

  shameStateText.innerText = "視線移開... 安全了，小心翼翼重新組合";
  shameStateText.classList.remove('ashamed');
}

// -------------------------------------------------------------
// 5. 三大物種切換與介面動態化
// -------------------------------------------------------------
function setSpecies(species) {
  currentSpecies = species;
  // 生物叫聲：愛（溫和鳩鳴＋水滴）與虛無（人聲＋大水）各自只在自己在場時才叫
  if (typeof LoveVoice !== 'undefined') LoveVoice.setActive(species === 'love');
  if (typeof VoidVoice !== 'undefined') VoidVoice.setActive(species === 'void');

  // 場景底色連動：深色場景（羞恥／虛無／七大罪）時 HUD 紙底同步加深
  document.body.classList.remove('scene-love', 'scene-shame', 'scene-void', 'scene-sins');
  document.body.classList.add('scene-' + species);

  const tabLove = document.getElementById('tab-love');
  const tabShame = document.getElementById('tab-shame');
  const tabVoid = document.getElementById('tab-void');
  const tabSins = document.getElementById('tab-sins');
  const mainLight = scene.getObjectByName('mainLight');
  const backLight = scene.getObjectByName('backLight');

  // 清除所有 Tab active 狀態
  [tabLove, tabShame, tabVoid, tabSins].forEach(t => t && t.classList.remove('active', 'love-theme', 'shame-theme', 'void-theme', 'sins-theme'));
  [hudHeader, loveInfo, shameInfo, voidInfo, sinsInfo, actionsPanel, hudFooter, categoryBadge].forEach(el => {
    if (el) el.classList.remove('love-theme', 'shame-theme', 'void-theme', 'sins-theme');
  });

  // 隱藏全部
  loveGroup.visible = false;
  shameGroup.visible = false;
  voidGroup.visible = false;
  if (sinsGroup) sinsGroup.visible = false;
  if (loveEnvGroup) loveEnvGroup.visible = false;
  if (shameEnvGroup) shameEnvGroup.visible = false;
  if (sinsEnvGroup) sinsEnvGroup.visible = false;

  // 還原預設（暗色宇宙）天空與光源
  scene.background = new THREE.Color(0x060308);
  scene.fog = new THREE.FogExp2(0x060308, 0.022);
  const ambientLight = scene.getObjectByName('ambientLight');
  const sunLight = scene.getObjectByName('sunLight');
  const hemiLight = scene.getObjectByName('hemiLight');
  if (ambientLight) { ambientLight.color.setHex(0x221520); ambientLight.intensity = 1.4; }
  if (sunLight) sunLight.intensity = 0;
  if (hemiLight) hemiLight.intensity = 0;
  if (mainLight) mainLight.intensity = 3.8;
  if (backLight) backLight.intensity = 3.2;
  controls.autoRotate = true;
  controls.target.set(0, 0, 0); // 各物種分支再各自調整（羞恥會抬高注視點）

  loveInfo.style.display = 'none';
  shameInfo.style.display = 'none';
  voidInfo.style.display = 'none';
  if (sinsInfo) sinsInfo.style.display = 'none';

  loveActions.style.display = 'none';
  shameActions.style.display = 'none';
  voidActions.style.display = 'none';
  if (sinsActions) sinsActions.style.display = 'none';

  promptBox.style.display = 'none';

  if (species === 'love') {
    loveGroup.visible = true;
    if (loveEnvGroup) loveEnvGroup.visible = true;

    // 晴天美國住宅社區：暖陽高飽和背景
    scene.background = new THREE.Color(0x72c7ec);
    scene.fog = new THREE.FogExp2(0x9fd8ec, 0.008);
    if (ambientLight) { ambientLight.color.setHex(0xfff2dd); ambientLight.intensity = 0.75; }
    if (sunLight) { sunLight.color.setHex(0xffdfb0); sunLight.intensity = 1.35; }
    if (hemiLight) { hemiLight.color.setHex(0xcce5ff); hemiLight.groundColor.setHex(0xd9c1a3); hemiLight.intensity = 0.7; }

    // 鏡頭永遠跟隨「愛」：關閉自動旋轉
    controls.autoRotate = false;
    loveGroup.position.set(0, LOVE_HOVER_Y, 0);
    loveBaseY = LOVE_HOVER_Y; // 回到預設高度
    loveFollowInit = true; // 下一幀設定相機跟隨基準

    tabLove.classList.add('active', 'love-theme');
    hudHeader.classList.add('love-theme');
    loveInfo.classList.add('love-theme');
    loveInfo.style.display = 'flex';
    actionsPanel.classList.add('love-theme');
    loveActions.style.display = 'flex';
    hudFooter.classList.add('love-theme');
    categoryBadge.classList.add('love-theme');

    categoryBadge.innerText = "正・正向情緒陣營";
    speciesTitle.innerHTML = '<span>愛（LOVE）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 強效同化・生命熾熱燃燒與共鳴之核";
    document.getElementById('panel-title').innerText = "愛・行為與能量指令";
    hoverHintText.innerHTML = '<svg class="px-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z"/><path d="M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"/></svg> <span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> 移動愛 ｜ <span class="kbd">空白</span> 上升 ｜ <span class="kbd">Shift</span> 下降 ｜ 鏡頭永遠跟隨';

    if (mainLight) mainLight.color.setHex(0xf59e0b);
    if (backLight) backLight.color.setHex(0xec4899);

    updateLoveEnergyUI();
  } else if (species === 'shame') {
    shameGroup.visible = true;
    if (shameEnvGroup) shameEnvGroup.visible = true;

    // 陰天白日：灰米色霧天，亮度刻意壓得比「愛」低一階
    scene.background = new THREE.Color(0x9e988d);
    scene.fog = new THREE.FogExp2(0x9e988d, 0.014);
    if (ambientLight) { ambientLight.color.setHex(0xa8a094); ambientLight.intensity = 0.55; }
    if (sunLight) { sunLight.color.setHex(0xffe6c4); sunLight.intensity = 0.85; }
    if (hemiLight) hemiLight.intensity = 0.3;

    tabShame.classList.add('active', 'shame-theme');
    hudHeader.classList.add('shame-theme');
    shameInfo.classList.add('shame-theme');
    shameInfo.style.display = 'flex';
    actionsPanel.classList.add('shame-theme');
    shameActions.style.display = 'flex';
    hudFooter.classList.add('shame-theme');
    categoryBadge.classList.add('shame-theme');

    promptBox.style.display = 'flex';
    categoryBadge.innerText = "反・負面情緒陣營";
    speciesTitle.innerHTML = '<span>羞恥（SHAME）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 視覺迴避與脆弱防禦之核";
    document.getElementById('panel-title').innerText = "羞恥行為指令";
    hoverHintText.innerHTML = '<svg class="px-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z"/></svg> <b>游標靠近</b>：它默默逃開｜<b>碰到本體</b>：自我瓦解';

    if (mainLight) { mainLight.color.setHex(0xf43f5e); mainLight.intensity = 1.1; }
    if (backLight) { backLight.color.setHex(0xa855f7); backLight.intensity = 0.6; }

    // 本體懸浮在 y≈3.6，注視點也抬高，散開的鬼臉才不會被畫面上緣裁掉
    new TWEEN.Tween(controls.target).to({ x: 0, y: 3.0, z: 0 }, 800).easing(TWEEN.Easing.Cubic.Out).start();

    onShameHoverLeave();
  } else if (species === 'void') {
    voidGroup.visible = true;
    tabVoid.classList.add('active', 'void-theme');
    hudHeader.classList.add('void-theme');
    voidInfo.classList.add('void-theme');
    voidInfo.style.display = 'flex';
    actionsPanel.classList.add('void-theme');
    voidActions.style.display = 'flex';
    hudFooter.classList.add('void-theme');
    categoryBadge.classList.add('void-theme');

    categoryBadge.innerText = "中立・概念遺忘陣營";
    speciesTitle.innerHTML = '<span>虛無（VOID）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 秩序、平靜、遺忘與中立之核";
    document.getElementById('panel-title').innerText = "虛無行為指令";
    hoverHintText.innerHTML = '<svg class="px-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z"/></svg> <b>點擊指令</b>：可測試虛無 3 大動態能力';

    if (mainLight) mainLight.color.setHex(0x7c3aed);
    if (backLight) backLight.color.setHex(0x06b6d4);

    // 離開再回來仍記得二維狀態：紙片時不自動旋轉，按鈕文字同步
    controls.autoRotate = !isVoidFlat;
    syncVoidTeleportBtn();
    voidStateText.innerText = isVoidFlat ? "二維形態・世界失去厚度，只剩平面輪廓" : "平穩呼吸・殘影共鳴中";
  } else if (species === 'sins') {
    if (sinsGroup) sinsGroup.visible = true;
    if (sinsEnvGroup) sinsEnvGroup.visible = true;

    // Zaun 底城：化技綠霧霾＋昏暗月光（The Gray 的綠色版）
    scene.background = new THREE.Color(0x0c1210);
    scene.fog = new THREE.FogExp2(0x0e1713, 0.03);
    if (ambientLight) { ambientLight.color.setHex(0x243328); ambientLight.intensity = 0.9; }
    if (sunLight) { sunLight.color.setHex(0x99aa88); sunLight.intensity = 0.35; }
    if (hemiLight) hemiLight.intensity = 0.25;
    controls.autoRotate = false;

    if (tabSins) tabSins.classList.add('active', 'sins-theme');
    hudHeader.classList.add('sins-theme');
    if (sinsInfo) {
      sinsInfo.classList.add('sins-theme');
      sinsInfo.style.display = 'flex';
    }
    actionsPanel.classList.add('sins-theme');
    if (sinsActions) sinsActions.style.display = 'flex';
    hudFooter.classList.add('sins-theme');
    categoryBadge.classList.add('sins-theme');

    categoryBadge.innerText = "罪・共生群落生態陣營";
    speciesTitle.innerHTML = '<span>七大罪生態系（SEVEN DEADLY SINS）</span>';
    speciesSubtitle.innerText = "深層意識群落 ｜ 相互寄生・制衡共鳴之七位一體生物圈";
    document.getElementById('panel-title').innerText = "七大罪生態指令";
    hoverHintText.innerHTML = '<svg class="px-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z"/></svg> <b>點擊生物或標籤</b>：可切換焦點對焦與測試群落生態反應';

    if (mainLight) mainLight.color.setHex(0xf59e0b);
    if (backLight) backLight.color.setHex(0xef4444);

    selectSin('all', true);
  }
}

// -------------------------------------------------------------
// 6. 按鈕事件綁定 (四大陣營獨立按鈕)
// -------------------------------------------------------------
function setupUI() {
  document.getElementById('tab-love').addEventListener('click', () => setSpecies('love'));
  document.getElementById('tab-shame').addEventListener('click', () => setSpecies('shame'));
  document.getElementById('tab-void').addEventListener('click', () => setSpecies('void'));
  const tabSins = document.getElementById('tab-sins');
  if (tabSins) tabSins.addEventListener('click', () => setSpecies('sins'));

  // [愛 按鈕]
  document.getElementById('btn-love-assimilate').addEventListener('click', triggerLoveAssimilate);
  document.getElementById('btn-love-feed').addEventListener('click', triggerLoveFeed);
  document.getElementById('btn-love-burnout').addEventListener('click', triggerLoveBurnout);

  // [羞恥 按鈕]
  document.getElementById('btn-shame-disperse').addEventListener('click', () => {
    shameHuddle = false;
    shameHuddleTarget = null;
    targetShameFactor = 1.0;
    isHovered = true;
    onShameHoverEnter();
  });

  document.getElementById('btn-shame-reassemble').addEventListener('click', () => {
    targetShameFactor = 0.0;
    isHovered = false;
    onShameHoverLeave();
    shameHuddle = true;
    pickShameHuddleTarget();
  });

  document.getElementById('btn-shame-flush').addEventListener('click', () => {
    isFlushed = !isFlushed;
    if (isFlushed) {
      // 泛紅失控：取消緊縮護核的膽小貼牆，改成隨機暴衝
      shameHuddle = false;
      shameHuddleTarget = null;
      shameDash.mode = 'rest';
      shameDash.timer = 0.4;
    }
    shameStateText.innerText = isFlushed ? "情緒激烈泛紅中！" : "情緒逐漸平復...";
    shameScribbles.forEach(s => {
      new TWEEN.Tween(s.userData.inkMesh.material.color)
        // 泛紅 = 正紅色（原本是酒紅，現在按要求改成亮正紅）
        .to(isFlushed ? { r: 0.92, g: 0.03, b: 0.04 } : { r: 0.769, g: 0.118, b: 0.29 }, 400)
        .start();
    });
    // 鬼臉五官與周圍記號也跟著泛紅（深一點的正紅，維持與主體的層次）
    if (shameFaceMat) {
      new TWEEN.Tween(shameFaceMat.color)
        .to(isFlushed ? { r: 0.62, g: 0.04, b: 0.04 } : { r: 0.078, g: 0.063, b: 0.055 }, 400)
        .start();
    }
    if (shameAccentMat) {
      new TWEEN.Tween(shameAccentMat.color)
        .to(isFlushed ? { r: 0.62, g: 0.04, b: 0.04 } : { r: 0.078, g: 0.063, b: 0.055 }, 400)
        .start();
    }
  });

  // [虛無 按鈕]
  document.getElementById('btn-void-devour').addEventListener('click', triggerVoidDevour);
  document.getElementById('btn-void-assimilate').addEventListener('click', triggerVoidAssimilate);
  document.getElementById('btn-void-teleport').addEventListener('click', triggerVoidTeleport);

  // [七大罪 按鈕與選單]
  document.querySelectorAll('.sin-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectSin(btn.dataset.sin, true);
    });
  });
  document.querySelectorAll('.sin-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectSin(chip.dataset.sin, true);
    });
  });

  const btnSinsFrenzy = document.getElementById('btn-sins-frenzy');
  if (btnSinsFrenzy) btnSinsFrenzy.addEventListener('click', triggerSinsFrenzy);
  const btnSinsSwarm = document.getElementById('btn-sins-swarm');
  if (btnSinsSwarm) btnSinsSwarm.addEventListener('click', triggerSinsSwarm);
  const btnSinsBalance = document.getElementById('btn-sins-balance');
  if (btnSinsBalance) btnSinsBalance.addEventListener('click', triggerSinsBalance);

  // 重置攝影機
  // 聲音開關（瀏覽器規定要點擊才能出聲）
  const btnSound = document.getElementById('btn-sound');
  if (btnSound) btnSound.addEventListener('click', async () => {
    if (typeof VoidVoice === 'undefined') { btnSound.innerText = '聲音：載入失敗'; return; }
    // 兩隻生物的聲音一起開關，各自只在自己在場時叫
    const on = await VoidVoice.toggle(currentSpecies === 'void');
    if (typeof LoveVoice !== 'undefined') await LoveVoice.toggle(currentSpecies === 'love');
    btnSound.innerText = on ? '聲音：開' : '聲音：關';
  });

  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    if (currentSpecies === 'sins') {
      selectSin('all', true);
    } else if (currentSpecies === 'love') {
      loveFollowInit = true; // 重新貼回愛身邊
    } else {
      new TWEEN.Tween(camera.position).to({ x: 0, y: 2.5, z: 15 }, 800).easing(TWEEN.Easing.Cubic.Out).start();
      const tgtY = currentSpecies === 'shame' ? 3.0 : 0;
      new TWEEN.Tween(controls.target).to({ x: 0, y: tgtY, z: 0 }, 800).easing(TWEEN.Easing.Cubic.Out).start();
    }
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------------
// 7. 主動畫迴圈
// -------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  const elapsedTime = clock.getElapsedTime();
  const frameDelta = animate._lastT === undefined ? 0.016 : Math.min(elapsedTime - animate._lastT, 0.1);
  animate._lastT = elapsedTime;

  TWEEN.update();
  controls.update();

  // 【七大罪】化技燈閃爍（Zaun 底城氛圍）
  if (currentSpecies === 'sins' && sinsLamps.length) {
    sinsLamps.forEach((lamp, i) => {
      const n = Math.sin(elapsedTime * 9 + i * 2.7) * Math.sin(elapsedTime * 2.3 + i);
      const flicker = n > 0.55 ? 0.15 : 0.65 + Math.sin(elapsedTime * 17 + i * 5) * 0.12;
      lamp.light.intensity = lamp.base * flicker;
      lamp.bulbMat.emissiveIntensity = 0.4 + flicker;
    });
  }

  if (currentSpecies === 'love') {
    // 【愛】WASD 移動：方向相對於鏡頭朝向（W 前進 = 鏡頭前方）
    const prevX = loveGroup.position.x;
    const prevZ = loveGroup.position.z;

    const moveDir = new THREE.Vector3(
      (loveKeys['d'] ? 1 : 0) - (loveKeys['a'] ? 1 : 0),
      0,
      (loveKeys['s'] ? 1 : 0) - (loveKeys['w'] ? 1 : 0)
    );
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      // 取得鏡頭水平朝向，讓 W 往畫面深處走
      const camForward = new THREE.Vector3();
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      camForward.normalize();
      const camRight = new THREE.Vector3().crossVectors(camForward, new THREE.Vector3(0, 1, 0)).normalize();

      const worldMove = new THREE.Vector3()
        .addScaledVector(camForward, -moveDir.z)
        .addScaledVector(camRight, moveDir.x);

      loveGroup.position.addScaledVector(worldMove, LOVE_MOVE_SPEED * frameDelta);
    }

    // 限制在住宅區範圍內
    const dist = Math.sqrt(loveGroup.position.x ** 2 + loveGroup.position.z ** 2);
    if (dist > LOVE_FOLLOW_RANGE) {
      loveGroup.position.x *= LOVE_FOLLOW_RANGE / dist;
      loveGroup.position.z *= LOVE_FOLLOW_RANGE / dist;
    }

    // 垂直移動：空白鍵上升、Shift 下降（落地夾制，浮沉疊在基準上）
    if (loveKeys[' ']) loveBaseY += LOVE_RISE_SPEED * frameDelta;
    if (loveKeys['shift']) loveBaseY -= LOVE_SINK_SPEED * frameDelta;
    loveBaseY = Math.max(LOVE_MIN_Y, Math.min(LOVE_MAX_Y, loveBaseY));

    // 懸浮浮沉
    loveGroup.position.y = loveBaseY + Math.sin(elapsedTime * 1.6) * 0.18;

    // 覓食光線：淡入淡出＋螺旋光絲與光點流（見 updateLoveFeed）
    if (loveFeedGroup) {
      loveFeedFactor += ((isLoveFeeding ? 1 : 0) - loveFeedFactor) * Math.min(1, frameDelta * 3);
      loveFeedGroup.visible = loveFeedFactor > 0.02;
      updateLoveFeed(elapsedTime, frameDelta);
    }

    // 鏡頭永遠跟隨：愛移動多少，相機就跟著平移多少，並鎖定注視點
    if (loveFollowInit) {
      loveCamOffset.set(0, -1.4, 9.5);
      camera.position.copy(loveGroup.position).add(loveCamOffset);
      controls.target.copy(loveGroup.position);
      loveFollowInit = false;
    } else {
      camera.position.x += loveGroup.position.x - prevX;
      camera.position.z += loveGroup.position.z - prevZ;
      controls.target.copy(loveGroup.position);
    }

    // 【愛】心跳律動 (雙拍心跳 Lub-Dub：磅...磅... 磅...磅...)
    const heartBeatSpeed = 1.5 + loveEnergy * 2.5; // 能量充沛心跳快，枯竭時緩慢
    const rawSin = Math.sin(elapsedTime * heartBeatSpeed);
    const lubDub = Math.pow(Math.max(0, rawSin), 4) * 0.18 + Math.pow(Math.max(0, Math.sin(elapsedTime * heartBeatSpeed + 0.5)), 4) * 0.1;
    const heartScale = 1.0 + lubDub * loveEnergy;

    if (!isLoveAssimilating) {
      loveCore.scale.set(heartScale, heartScale, heartScale);
      // 核心不旋轉：正面（縱縫＋眼球）永遠朝鏡頭，背面固定貼在翅膀根部
      // 只有極小的左右傾斜（呼吸感），不做繞 Y 軸的自轉
      loveCore.rotation.y = 0;
      loveCore.rotation.x = Math.sin(elapsedTime * 0.5) * 0.025;
      // 光暈維持直立橢圓的比例，只跟著心跳縮放
      loveAura.scale.set(heartScale * 1.05, heartScale * 1.30, heartScale * 1.00);
      if (loveHalo) loveHalo.scale.setScalar(heartScale);
      // 眼球在黑腔裡極慢地呼吸（不旋轉：參考圖的同心環是靜止的）
      if (loveEyeMesh) {
        const eyePulse = 1 + Math.sin(elapsedTime * 1.15) * 0.05 * loveEnergy;
        loveEyeMesh.scale.setScalar(eyePulse);
      }
      if (loveCoreGlow) {
        loveCoreGlow.material.opacity = 0.12 + 0.07 * Math.sin(elapsedTime * 1.15);
        loveCoreGlow.scale.setScalar(1 + Math.sin(elapsedTime * 1.15) * 0.06 * loveEnergy);
      }
    }

    // 兜帽裹屍 shader：時間流動＋光暈／圓盤跟核心能量同步明暗
    if (loveCore.material.uniforms) {
      loveCore.material.uniforms.uTime.value = elapsedTime;
      const ei = loveCore.material.uniforms.uIntensity.value;
      if (loveSpiralMat) {
        loveSpiralMat.uniforms.uTime.value = elapsedTime;
        loveSpiralMat.uniforms.uIntensity.value = ei;
      }
    }

    // 頂端螺旋圓盤水平自轉（繞鉛直軸；螺旋不對稱，旋轉肉眼可見）
    if (loveHalo) loveHalo.rotation.y += frameDelta * 0.9;

    // 雙翼搧動：能量充沛時寬展有力，枯竭時沉重下垂（脫落／重生期間暫停）
    if (loveWingMode === 'normal') {
      const flapSpeed = 1.3 + loveEnergy * 1.5;
      const flapAmp = 0.1 + loveEnergy * 0.1;
      const wingDroop = (1 - loveEnergy) * 0.5;

      // 環抱係數平滑趨近目標
      // FIXED-009: 原本每幀固定乘 0.06，低幀率電腦會抱得很慢；改成用時間差，60fps 時效果與原本相同
      loveEmbrace += (loveEmbraceTarget - loveEmbrace) * (1 - Math.exp(-3.76 * frameDelta));
      const e = loveEmbrace;
      const hugScale = 1 + e * LOVE_HUG_SCALE_ADD;
      const hugC = e * LOVE_HUG_CURVE; // 目前彎曲率：0＝攤平，越大越捲向身體
      // 圓弧圓心要落在身體中心：翅膀根部退到圓的最後方（圓半徑 = 1/C，再乘翅膀放大）
      const hugRootZ = -0.12 - hugScale / LOVE_HUG_CURVE; // 身體中心在 z≈-0.12

      loveWings.forEach((w) => {
        const flap = Math.sin(elapsedTime * flapSpeed + w.phase);

        // 翅膀根部：從背後往圓弧後方靠攏（兩邊根部幾乎重疊在背後正中央）
        w.pivot.position.set(
          w.side * (0.6 - e * 0.35),
          0.3 + e * 0.1,
          LOVE_WING_Z + e * (hugRootZ - LOVE_WING_Z)
        );
        w.pivot.rotation.y = w.side * 0.28 * (1 - e); // 攤開時外八，環抱時由圓弧本身決定方向
        // 攤開時的搧動／下垂隨環抱淡出（不然整個圓弧會歪掉），環抱時只留一點呼吸
        w.pivot.rotation.z = w.side * (0.22 + flap * flapAmp - wingDroop) * (1 - e) + w.side * flap * 0.02 * e;
        w.pivot.scale.setScalar(hugScale);

        w.feathers.forEach((f, idx) => {
          const ud = f.userData;
          const follow = Math.sin(elapsedTime * flapSpeed + w.phase - idx * 0.16);
          // 環抱時羽毛由「朝外伸」逐漸轉成「朝下垂」，像披風順著身體垂下（直羽毛朝外伸會戳出圓弧外）
          const thetaE = ud.theta + (LOVE_HUG_HANG_DEG - ud.theta) * e * LOVE_HUG_HANG;
          f.rotation.z = w.side * (thetaE * Math.PI / 180 - Math.PI / 2) + w.side * follow * 0.05 * (0.4 + loveEnergy * 0.6);
          f.scale.y = ud.baseScale.y * (1 - LOVE_HUG_SHORTEN * e);
          f.rotation.x = ud.baseRotX + e * (0.15 + ud.curl * 0.02); // 羽片微微內彎成包覆弧面

          // 圓柱彎曲：沿翼展方向 u 的距離 → 圓弧上的角度 a；z 層次（羽毛厚度）沿圓弧法線方向偏移
          if (hugC > 1e-4) {
            const u = Math.abs(ud.basePos.x);   // 離肩膀的水平距離
            const zl = ud.basePos.z - (w.side < 0 ? 0.16 * e : 0); // 羽毛疊層厚度；左翼整體稍微在外圈，兩邊翼尖交疊時不互相穿插
            // FIXED-008: 越外側彎越多的係數必須乘 e，否則 e→0 時（收回）羽毛會被拉長 35% 回不到原位
            const a = hugC * u * (1 + 0.45 * e * Math.min(1, u / 2.5)); // 越外側彎越多：根部貼身、外端繞到胸前
            const sa = Math.sin(a), ca = Math.cos(a);
            f.position.set(
              w.side * (sa / hugC - zl * sa),
              ud.basePos.y - LOVE_HUG_DROP * e * Math.pow(Math.min(1, u / 2.5), 1.5), // 越外端垂得越低
              (1 - ca) / hugC + zl * ca
            );
            f.rotation.y = -w.side * (a + LOVE_HUG_TIP_CURL * e * Math.min(1, u / 2.5)); // 順著圓弧切線轉向，外側再多往內收
          } else {
            f.position.copy(ud.basePos);
            f.rotation.y = 0;
          }
          // 環抱時羽毛發光大幅加強
          f.material.emissiveIntensity = ud.baseEmissive + e * 1.8;
        });
      });
    }

    // 粒子急速匯流向心核（覓食吸收殘影微粒）
    if (loveParticles) {
      const positions = loveParticles.geometry.attributes.position.array;
      const vels = loveParticleVels;

      for (let i = 0; i < vels.length; i++) {
        // 向核心聚集
        vels[i].r -= vels[i].inwardSpeed * (0.6 + loveEnergy * 0.8);
        vels[i].theta += 0.01;

        // 當被吸入核心半徑內，重新在外圍重生
        if (vels[i].r < 1.3) {
          vels[i].r = 8.0 + Math.random() * 4.0;
        }

        const x = vels[i].r * Math.cos(vels[i].phi) * Math.cos(vels[i].theta);
        const y = vels[i].r * Math.sin(vels[i].phi);
        const z = vels[i].r * Math.cos(vels[i].phi) * Math.sin(vels[i].theta);

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      }
      loveParticles.geometry.attributes.position.needsUpdate = true;
    }

    // 整隻不再自轉：兜帽裹屍的正面（縱縫＋眼球）固定朝鏡頭、背面固定貼在翅膀根部
    // （光環另有自己的自轉，見上方 loveHalo.rotation.y）
  } else if (currentSpecies === 'shame') {
    // 【羞恥】解體因子內插
    const lerpSpeed = targetShameFactor > shameDisassembleFactor ? 0.18 : 0.055;
    shameDisassembleFactor += (targetShameFactor - shameDisassembleFactor) * lerpSpeed;

    // 鼠標靠近 → 默默逃離（對著面向鏡頭、穿過本體的平面算距離）
    if (isFlushed) {
      // —— 情緒泛紅：失控暴衝（不吃鼠標逃跑、不飄回家），起衝刺 → 休息 → 再衝刺 ——
      shameDash.timer -= frameDelta;
      if (shameDash.mode === 'rest') {
        if (shameDash.timer <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 12; // 落點 r≤15，遠離環牆不穿模
          shameDash.target.set(Math.cos(a) * r, SHAME_HOVER_Y, Math.sin(a) * r);
          shameDash.mode = 'dash';
          shameDash.timer = 0.55 + Math.random() * 0.3;
        }
      } else {
        const dx = shameDash.target.x - shameGroup.position.x;
        const dz = shameDash.target.z - shameGroup.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.9 || shameDash.timer <= 0) {
          shameDash.mode = 'rest';
          shameDash.timer = 0.55 + Math.random() * 1.5;
        } else {
          shameGroup.position.x += (dx / d) * 13.5 * frameDelta;
          shameGroup.position.z += (dz / d) * 13.5 * frameDelta;
          // 衝刺時整團高頻顫抖
          shameGroup.position.x += Math.sin(elapsedTime * 34) * 0.013;
          shameGroup.position.z += Math.cos(elapsedTime * 29) * 0.013;
        }
      }
    } else if (shameHuddleTarget) {
      // —— 緊縮護核：先緩慢鬼祟地小步移動；一旦發現沒人在看（鼠標遠離），迅速貼牆 ——
      // 鼠標到本體的平面距離（沒有鼠標＝沒人注意，直接衝刺貼牆）
      let mouseDist = Infinity;
      if (mouse.x > -900) {
        raycaster.setFromCamera(mouse, camera);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, shameGroup.position);
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hitPoint)) {
          mouseDist = shameGroup.position.distanceTo(hitPoint);
        }
      }
      const watched = mouseDist < 4.5;        // 有人正在看牠！
      const cycleLen = watched ? 1.15 : 0.5;  // 週期間隔：有人看＝漫長鬼祟節奏，沒人看＝短促衝刺節奏
      const moveFrac = watched ? 0.35 : 0.7;  // 週期內「在移動」的比例（其餘時間僵住發抖）
      shameTiptoe.t += frameDelta;
      const cyc = (shameTiptoe.t % cycleLen) / cycleLen;

      const dx = shameHuddleTarget.x - shameGroup.position.x;
      const dz = shameHuddleTarget.z - shameGroup.position.z;
      const distToWall = Math.hypot(dx, dz);
      if (distToWall > 0.3 && cyc < moveFrac) {
        const speed = watched ? 0.55 : 9.5;   // 有人看＝鬼祟小碎步；沒人看＝迅速移至牆邊
        shameGroup.position.x += (dx / distToWall) * speed * frameDelta;
        shameGroup.position.z += (dz / distToWall) * speed * frameDelta;
      } else if (watched) {
        // 有人看的僵住時刻：定住裝沒事＋高頻顫抖
        shameGroup.position.x += Math.sin(elapsedTime * 22) * 0.006;
        shameGroup.position.z += Math.cos(elapsedTime * 19) * 0.006;
      }
      // 兩個節奏都帶微顫抖，像一直很緊張
      shameGroup.position.x += Math.sin(elapsedTime * 17) * 0.006;
      shameGroup.position.z += Math.cos(elapsedTime * 15) * 0.006;
    } else {
      if (mouse.x > -900) {
        raycaster.setFromCamera(mouse, camera);
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, shameGroup.position);
        const hitPoint = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(plane, hitPoint)) {
          const away = shameGroup.position.clone().sub(hitPoint);
          const dist = away.length();
          const fleeRadius = 2.8;
          if (dist < fleeRadius && dist > 0.001) {
            away.normalize();
            shameFleeVel.addScaledVector(away, (1 - dist / fleeRadius) * 6 * frameDelta);
          }
        }
      }
      shameFleeVel.multiplyScalar(Math.max(0, 1 - 2.2 * frameDelta)); // 阻尼
      shameGroup.position.addScaledVector(shameFleeVel, frameDelta);
      // 慢慢飄回家：只對 XZ 拉回原點
      const homePull = Math.max(0, 1 - 0.22 * frameDelta);
      shameGroup.position.x *= homePull;
      shameGroup.position.z *= homePull;
    }
    // Y 懸浮＋輕微浮沉（所有模式共用）
    const hoverTargetY = SHAME_HOVER_Y + Math.sin(elapsedTime * 1.6) * 0.12;
    shameGroup.position.y += (hoverTargetY - shameGroup.position.y) * 0.05;
    // XZ 硬夾制：競技場環牆內緣安全半徑，任何模式都不能穿模
    const distXZ = Math.sqrt(shameGroup.position.x ** 2 + shameGroup.position.z ** 2);
    if (distXZ > 16.4) {
      const s = 16.4 / distXZ;
      shameGroup.position.x *= s;
      shameGroup.position.z *= s;
    }
    // 直立柱頭排除：推開任何進入安全距的位置（任何移動模式都適用）
    resolveShameColumns();

    // 碰撞球跟著本體跑：滑鼠真的碰到塗鴉團才會觸發瓦解
    // 散開後鬼臉飄得更遠，碰撞球跟著長大，才不會一散開就判定「沒碰到」又自己合回去
    hitboxMesh.position.copy(shameGroup.position);
    hitboxMesh.scale.setScalar((1 + shameDisassembleFactor * 1.7) * (1 - 0.38 * shameHuddleFactor));

    // —— 緊縮護核：縮小＋內層塗鴉變密（沒有任何實心球核）——
    const huddleGoal = shameHuddle ? 1 : 0;
    shameHuddleFactor += (huddleGoal - shameHuddleFactor) * Math.min(1, frameDelta * 4.5);
    shameGroup.scale.setScalar(1 - 0.38 * shameHuddleFactor);

    const f = shameDisassembleFactor;
    const eFull = f * f * (3 - 2 * f);                 // 散開緩動
    const grpScale = 1 - 0.66 * eFull;                 // 每團塗鴉邊散邊縮成小鬼頭
    const faceT = Math.max(0, Math.min(1, (f - 0.3) / 0.55));
    const faceEase = faceT * faceT * (3 - 2 * faceT);  // 五官浮現
    const turnT = Math.max(0, Math.min(1, (f - 0.35) / 0.5));
    const turnEase = turnT * turnT * (3 - 2 * turnT);  // 轉向鏡頭

    if (turnEase > 0) shameGroup.getWorldQuaternion(shameGroupInvQuat).invert();

    shameScribbles.forEach((scribble) => {
      const ud = scribble.userData;

      shamePosTmp.lerpVectors(ud.closedPos, ud.scatterPos, f);
      if (f > 0.05) {
        const jitter = Math.sin(elapsedTime * 30 + ud.jitterSeed) * 0.09 * f;
        shamePosTmp.x += jitter;
        shamePosTmp.y += jitter;
      }
      scribble.position.copy(shamePosTmp);

      // 旋轉三段：收合 → 炸開翻滾 → 最後轉成正臉面向鏡頭
      shameEulerTmp.copy(ud.baseRot);
      shameQuatA.setFromEuler(shameEulerTmp);
      shameEulerTmp.copy(ud.scatterRot);
      shameQuatB.setFromEuler(shameEulerTmp);
      shameQuatA.slerp(shameQuatB, f);
      if (turnEase > 0) {
        shameQuatTilt.setFromEuler(ud.faceTilt);
        shameQuatFace.copy(shameGroupInvQuat).multiply(camera.quaternion).multiply(shameQuatTilt);
        shameQuatA.slerp(shameQuatFace, turnEase);
      }
      scribble.quaternion.copy(shameQuatA);

      // 散開的同時整團縮小、五官長出來 → 變成一只只塗鴉鬼臉
      scribble.scale.setScalar(grpScale);
      if (ud.face) {
        ud.face.visible = faceEase > 0.02;
        if (ud.face.visible) ud.face.scale.setScalar(faceEase * ud.faceScale);
      }

      updateScribbleDraw(scribble, frameDelta);
    });

    if (shameParticles) {
      const positions = shameParticles.geometry.attributes.position.array;
      const vels = shameParticles.userData.vels;

      for (let i = 0; i < vels.length; i++) {
        vels[i].theta += vels[i].speed;
        const currentR = vels[i].baseR + shameDisassembleFactor * 5.0;
        positions[i * 3] = currentR * Math.cos(vels[i].theta);
        positions[i * 3 + 2] = currentR * Math.sin(vels[i].theta);
        positions[i * 3 + 1] += Math.sin(elapsedTime * 2 + i) * 0.01;
      }
      shameParticles.geometry.attributes.position.needsUpdate = true;
      shameParticles.rotation.y += 0.002;
    }

    shameGroup.rotation.y += 0.003;

  } else if (currentSpecies === 'void') {
    // 【虛無】呼吸與幾何運動
    const breathe = Math.sin(elapsedTime * 1.8) * 0.08 + 1.0;
    if (!isVoidActionRunning) {
      voidMembrane.scale.set(breathe, breathe, breathe);
      voidMembraneWire.scale.set(breathe * 1.01, breathe * 1.01, breathe * 1.01);
      voidAura.scale.set(1 + Math.sin(elapsedTime * 2.5) * 0.12, 1 + Math.sin(elapsedTime * 2.5) * 0.12, 1 + Math.sin(elapsedTime * 2.5) * 0.12);
    }

    voidCore.rotation.y += 0.008;
    voidInnerWire.rotation.x -= 0.012;
    voidInnerWire.rotation.y += 0.015;
    applyVoidTeleportShake(elapsedTime);

    const ringBoost = 1 + (voidTeleportShake.active ? voidTeleportShake.amp * 7 : 0);   // 維度失穩時陀螺環瘋狂加速
    voidGyroRings.forEach((ring) => {
      ring.rotation.x += ring.userData.rotXSpeed * ringBoost;
      ring.rotation.y += ring.userData.rotYSpeed * ringBoost;
      ring.rotation.z += ring.userData.rotZSpeed * ringBoost;
    });

    // 古文明符文：螺旋靠近核心 → 被吸入 → 外側補新的
    updateVoidRunes(frameDelta);

    if (voidParticles) {
      const positions = voidParticles.geometry.attributes.position.array;
      const vels = voidParticles.userData.velocities;

      for (let i = 0; i < vels.length; i++) {
        vels[i].theta += vels[i].speed;
        const r = vels[i].r;
        positions[i * 3] = r * Math.cos(vels[i].theta);
        positions[i * 3 + 2] = r * Math.sin(vels[i].theta);
        positions[i * 3 + 1] += Math.sin(elapsedTime + i) * 0.008;
      }
      voidParticles.geometry.attributes.position.needsUpdate = true;
      voidParticles.rotation.y += 0.001;
    }

    // 紙片朝向：進入二維時朝「按鈕當下快照的鏡頭方向」轉正（v→1 混向快照），
    // 回到三維時目標退回正向，整組自然轉回原位
    voidFlatTargetQ.identity().slerp(voidFlatFaceQ, voidFlatState.v);
    voidGroup.quaternion.slerp(voidFlatTargetQ, 0.14);

    updateVoidTesseract(elapsedTime);
  } else if (currentSpecies === 'sins') {
    // 【七大罪群居生態】群體與個別生命體運動
    const swarmLock = updateSinsSwarm(frameDelta, elapsedTime);
    const frenzyMult = isSinsFrenzy ? 2.8 : 1.0;
    const uFrenzyVal = frenzyMult - 1.0;

    // 1. 傲慢 (Pride)
    if (sinCreatures.pride) {
      const p = sinCreatures.pride;
      p.halo1.rotation.z += 0.012 * frenzyMult;
      p.halo2.rotation.y -= 0.018 * frenzyMult;
      p.crownGroup.rotation.y += 0.008 * frenzyMult;
      p.core.rotation.y += 0.006;
      p.glassMats.forEach(gm => setSinsUniform(gm, elapsedTime, uFrenzyVal));
      // 玻璃裡的核心：鑽石與迷你王冠緩轉，三道金環各自旋轉
      p.inner.rotation.y -= 0.01 * frenzyMult;
      p.gyros[0].rotation.z += 0.018 * frenzyMult;
      p.gyros[1].rotation.x += 0.013 * frenzyMult;
      p.gyros[2].rotation.x -= 0.016 * frenzyMult;
      const b = Math.sin(elapsedTime * 2.0) * 0.05 * frenzyMult + 1.0;
      p.core.scale.set(b, b, b);
      if (!swarmLock) p.group.position.y = p.group.userData.basePos.y + Math.sin(elapsedTime * 1.5) * 0.15;
      // 黃光呼吸脈動；狂暴狀態整體更亮（frenzyMult 上限 1.8）
      if (p.glowMat) {
        p.glowMat.emissiveIntensity = p.glowMat.userData.glowBase * (1.0 + 0.12 * Math.sin(elapsedTime * 2.0)) * Math.min(frenzyMult, 1.8);
      }
    }

    // 2. 貪婪 (Greed)
    if (sinCreatures.greed) {
      const g = sinCreatures.greed;
      g.core.rotation.y += 0.015 * frenzyMult;
      g.claws.forEach((claw, idx) => {
        setSinsUniform(claw.material, elapsedTime, uFrenzyVal);
        const curl = Math.sin(elapsedTime * 3.0 + idx * 0.8) * 0.12 * frenzyMult;
        claw.rotation.z = curl;
      });
      // 小觸爪與大爪反相擺動，像一張一合的「抓取」節奏
      g.claws2.forEach((claw, idx) => {
        setSinsUniform(claw.material, elapsedTime, uFrenzyVal);
        claw.rotation.z = -Math.sin(elapsedTime * 3.0 + idx * 0.8) * 0.16 * frenzyMult;
      });
      g.collar.rotation.y += 0.011 * frenzyMult;
      // 金幣：繞行＋翻轉＋緩慢內縮，進到核心附近就從外圈重生
      for (let i = 0; i < g.coinData.length; i++) {
        const c = g.coinData[i];
        c.theta += c.speed * frenzyMult;
        c.rot += c.spin * frenzyMult;
        c.r -= 0.0025 * frenzyMult;
        if (c.r < 0.95) c.r = 2.8 + Math.random() * 0.4;
        g.coinDummy.position.set(c.r * Math.cos(c.theta), c.y + Math.sin(elapsedTime * 1.6 + i) * 0.06, c.r * Math.sin(c.theta));
        g.coinDummy.rotation.set(c.rot, c.theta, c.rot * 0.6);
        g.coinDummy.updateMatrix();
        g.coins.setMatrixAt(i, g.coinDummy.matrix);
      }
      g.coins.instanceMatrix.needsUpdate = true;
      if (g.particles) {
        const positions = g.particles.geometry.attributes.position.array;
        const pData = g.pData;
        for (let i = 0; i < pData.length; i++) {
          pData[i].theta += pData[i].speed * frenzyMult;
          pData[i].r -= 0.004 * frenzyMult;
          if (pData[i].r < 0.7) pData[i].r = 2.4 + Math.random() * 0.8;
          positions[i * 3] = pData[i].r * Math.cos(pData[i].theta);
          positions[i * 3 + 1] = pData[i].y + Math.sin(elapsedTime * 2 + i) * 0.08;
          positions[i * 3 + 2] = pData[i].r * Math.sin(pData[i].theta);
        }
        g.particles.geometry.attributes.position.needsUpdate = true;
      }
      if (!swarmLock) g.group.position.y = g.group.userData.basePos.y + Math.sin(elapsedTime * 1.8 + 1) * 0.12;
    }

    // 3. 暴怒 (Wrath)
    if (sinCreatures.wrath) {
      const w = sinCreatures.wrath;
      if (w.core.material.uniforms) {
        w.core.material.uniforms.uTime.value = elapsedTime;
        w.core.material.uniforms.uFrenzy.value = uFrenzyVal;
      }
      const jitter = (Math.random() - 0.5) * (isSinsFrenzy ? 0.22 : 0.04);
      w.core.position.set(jitter, jitter, jitter);
      w.flamesGroup.rotation.y += 0.02 * frenzyMult;
      w.flamesGroup.children.forEach((fl) => {
        if (fl.material.uniforms) {
          fl.material.uniforms.uTime.value = elapsedTime;
          fl.material.uniforms.uFrenzy.value = uFrenzyVal;
        }
        const sway = Math.sin(elapsedTime * 6 + fl.userData.phase) * 0.14 * frenzyMult;
        fl.rotation.z = sway;
        fl.rotation.x = Math.cos(elapsedTime * 5 + fl.userData.phase) * 0.1 * frenzyMult;
        const s = fl.userData.baseScale * (1 + Math.sin(elapsedTime * 8 + fl.userData.phase) * 0.12);
        fl.scale.set(s, s * (1 + Math.sin(elapsedTime * 7 + fl.userData.phase) * 0.15), s);
      });
      w.shockRing1.rotation.z += 0.03 * frenzyMult;
      const s1 = 1.0 + ((elapsedTime * 2.0) % 2.0) * 0.5;
      w.shockRing1.scale.set(s1, s1, s1);
      w.shockRing1.material.opacity = Math.max(0, 0.7 - ((elapsedTime * 2.0) % 2.0) * 0.35);
      if (!swarmLock) w.group.position.y = w.group.userData.basePos.y + Math.sin(elapsedTime * 2.4 + 2) * 0.1;
    }

    // 4. 嫉妒 (Envy)
    if (sinCreatures.envy) {
      const e = sinCreatures.envy;
      setSinsUniform(e.knot.material, elapsedTime, uFrenzyVal);
      setSinsUniform(e.eye.material, elapsedTime, uFrenzyVal);
      e.knot.rotation.x += 0.012 * frenzyMult;
      e.knot.rotation.y += 0.016 * frenzyMult;
      // 眼球瞳孔直接正對鏡頭：預設全群視角與點選放大時都不用轉視角
      e.eye.lookAt(camera.position);
      e.ghostFires.forEach((d) => {
        d.userData.angle += d.userData.speed * frenzyMult;
        d.position.set(
          d.userData.radius * Math.cos(d.userData.angle),
          d.userData.yBase + Math.sin(elapsedTime * 1.5 + d.userData.bobPhase) * 0.15,
          d.userData.radius * Math.sin(d.userData.angle)
        );
        d.rotation.z = Math.sin(elapsedTime * 2.3 + d.userData.bobPhase) * 0.16;
        d.rotation.x = Math.cos(elapsedTime * 1.8 + d.userData.bobPhase * 1.4) * 0.12;
        const s = (1 + Math.sin(elapsedTime * 6.5 + d.userData.bobPhase * 3.0) * 0.14 * frenzyMult) * (d.userData.baseScale || 1);
        d.scale.set(s, s * (1 + Math.sin(elapsedTime * 7.5 + d.userData.bobPhase) * 0.18), s);
        d.userData.outerMat.uniforms.uTime.value = elapsedTime;
        d.userData.outerMat.uniforms.uFrenzy.value = uFrenzyVal;
      });
      if (!swarmLock) e.group.position.y = e.group.userData.basePos.y + Math.sin(elapsedTime * 1.6 + 3) * 0.14;
    }

    // 5. 慾 (Lust) — 纏縛螺旋：核雙拍搏動，每次心跳籠收緊、刃瓣合攏、誘引絲晃動
    if (sinCreatures.lust) {
      const l = sinCreatures.lust;
      const bp = (elapsedTime * 1.15) % 1;
      const beat = Math.min(1, Math.exp(-16 * Math.abs(bp - 0.12)) + 0.6 * Math.exp(-18 * Math.abs(bp - 0.30)));
      l.ribbonMats.forEach(m => setSinsUniform(m, elapsedTime, uFrenzyVal));
      l.bladeMats.forEach(m => setSinsUniform(m, elapsedTime, uFrenzyVal));
      setSinsUniform(l.coreMat, elapsedTime, uFrenzyVal);
      l.coreMat.uniforms.uBeat.value = beat;
      l.core.scale.set(1 + beat * 0.18, 1.18 + beat * 0.22, 1 + beat * 0.18);
      l.aura.material.opacity = 0.8 + beat * 0.4;
      l.halo.material.opacity = 0.3 + beat * 0.2;
      l.glowLight.intensity = (1.2 + beat * 1.6) * (1 + uFrenzyVal * 0.5);
      l.cage.rotation.y += 0.008 * frenzyMult;
      const squeeze = 1 - beat * 0.10 * (1 + uFrenzyVal);
      l.cage.scale.set(squeeze, 1, squeeze);
      l.blades.forEach((p) => {
        p.rotation.z = Math.sin(elapsedTime * 0.7 + p.userData.phase) * 0.08 - beat * 0.16 * frenzyMult;   // 心跳時向內合攏
      });
      l.lures.forEach((p, i) => {
        p.rotation.z = Math.sin(elapsedTime * 0.9 + i * 2.1) * 0.10;
        p.rotation.x = Math.sin(elapsedTime * 0.6 + i) * 0.06;
      });
      l.tips.forEach((t) => { const s = 0.45 + beat * 0.22; t.scale.set(s, s, 1); });
      if (!swarmLock) l.group.position.y = l.group.userData.basePos.y + Math.sin(elapsedTime * 2.0 + 4) * 0.12;
    }

    // 6. 暴食 (Gluttony)
    if (sinCreatures.gluttony) {
      const gt = sinCreatures.gluttony;
      gt.sac.rotation.z += 0.005;
      gt.sac.material.emissiveIntensity = 0.7 + Math.sin(elapsedTime * 2.0) * 0.25 * (1 + uFrenzyVal);
      gt.maws.forEach((m, idx) => {
        setSinsUniform(m.material, elapsedTime, uFrenzyVal);
        const gulp = Math.sin(elapsedTime * 3.0 + m.userData.offset) * 0.22 * frenzyMult;
        m.scale.set(1 + gulp, 1, 1 + gulp);
      });
      if (!swarmLock) gt.group.position.y = gt.group.userData.basePos.y + Math.sin(elapsedTime * 1.4 + 5) * 0.15;
    }

    // 7. 怠慢 (Sloth) — 滯重沉降者：呼吸像地層錯動、偶爾沉重地一頓、環繞灰燼與收縮的重力圈
    if (sinCreatures.sloth) {
      const sl = sinCreatures.sloth;
      setSinsUniform(sl.bodyMat, elapsedTime, uFrenzyVal);
      const breath = Math.sin(elapsedTime * 0.45);
      sl.body.scale.set(1 + breath * 0.01, 1 + breath * 0.02, 1 + breath * 0.01);
      // 沉重地一頓：每隔幾秒身體往下頓一下再慢慢回彈
      const thud = Math.pow(Math.max(0, Math.sin(elapsedTime * 0.8)), 24);
      sl.shape.position.y = -0.05 * thud;
      sl.arms.forEach((a, i) => { a.rotation.y = Math.sin(elapsedTime * 0.2 + i * 2.0) * 0.015; });
      sl.shards.rotation.y = elapsedTime * 0.06;
      sl.shards.children.forEach((m) => { m.rotation.x += m.userData.spin * 0.01; m.rotation.y += m.userData.spin * 0.012; });
      // 重力圈向內收縮
      sl.rings.forEach((r) => {
        const ph = (elapsedTime * 0.14 + r.userData.i / 3) % 1;
        const sc = 3.6 - 2.7 * ph;
        r.scale.set(sc, sc, 1);
        r.material.opacity = Math.sin(ph * Math.PI) * 0.4 * (1 + uFrenzyVal * 0.6);
      });
      // 灰燼微粒緩慢下沉並向中心靠攏
      const mpos = sl.motes.geometry.attributes.position.array;
      for (let i = 0; i < mpos.length; i += 3) {
        mpos[i + 1] -= 0.0035;
        mpos[i] *= 0.9995; mpos[i + 2] *= 0.9995;
        if (mpos[i + 1] < 0.05) { const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 2.4; mpos[i] = Math.cos(a) * r; mpos[i + 1] = 3.4; mpos[i + 2] = Math.sin(a) * r; }
      }
      sl.motes.geometry.attributes.position.needsUpdate = true;
    }

    // 罪孽狂宴：七隻各自的 5 秒編舞（蓋在上面各自的常態動作之上）
    if (isSinsFrenzy) applySinsFrenzyChoreo();

    // 共生連線：弧管微光呼吸 + 光點沿曲線流動
    sinWebTubes.forEach((tube) => {
      tube.material.opacity = 0.22 + Math.sin(elapsedTime * 2.2 + tube.userData.phase) * 0.1 * frenzyMult;
    });
    sinWebPulses.forEach((pulse) => {
      pulse.userData.t = (pulse.userData.t + pulse.userData.speed * frenzyMult) % 1;
      pulse.position.copy(pulse.userData.curve.getPoint(pulse.userData.t));
      pulse.material.opacity = 0.6 + Math.sin(elapsedTime * 6 + pulse.userData.t * 12) * 0.3;
    });

    // 共生孢子雲流動
    if (sinSpores) {
      const pos = sinSpores.geometry.attributes.position.array;
      const vels = sinSporeVels;
      for (let i = 0; i < vels.length; i++) {
        vels[i].theta += vels[i].speed * frenzyMult;
        vels[i].y += vels[i].yDrift;
        if (vels[i].y > 4.5) vels[i].y = -4.5;
        if (vels[i].y < -4.5) vels[i].y = 4.5;
        pos[i * 3] = vels[i].r * Math.cos(vels[i].theta);
        pos[i * 3 + 1] = vels[i].y;
        pos[i * 3 + 2] = vels[i].r * Math.sin(vels[i].theta);
      }
      sinSpores.geometry.attributes.position.needsUpdate = true;
    }

    // 共生光絲跟隨兩端（端點沒動就不重建）
    updateSinsWeb();
  }

  renderer.render(scene, camera);
}
