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
let loveFeedLines = []; // 每顆遺物一條的 THREE.Line
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
    title: "慾（Lust / 惑魅雙螺旋）",
    role: "【費洛蒙傳導體】維繫群落親和力，避免七罪因互斥而解體",
    morph: "柔韌洋紅雙螺旋絲帶・八瓣律動呼吸花裙・粉霧光場",
    forage: "散發柔和親和光波，誘引同伴的神經突觸光絲交纏",
    state: "舒展綻放・費洛蒙光場覆蓋整個中層生態圈",
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
    title: "怠慢（Sloth / 兜帽垂紗者）",
    role: "【生態基底減震錨】匍匐於群落底層，以垂紗與墨鬚吸收群落過剩震盪維持平衡",
    morph: "漆黑垂墜兜帽斗篷・赤色雙瞳・紫邊幽光・貼地蔓延的墨色長鬚",
    forage: "零主動消耗，僅依靠群落沉降的微弱代謝殘渣沿墨鬚滲透維生",
    state: "深度休眠・代謝率降至 3%，布面只以近乎看不見的幅度起伏",
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

  // 柏油道路：主幹道＋三條垂直岔路＋前後後街（y 逐層墊高，交疊處才不會閃爍）
  const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x5f6873, roughness: 0.9 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0xe8dfca, roughness: 1 });
  const crackMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 1 });
  const roads = [
    { w: 140, d: 9, x: 0, z: 0, y: 0.02 },
    ...LOVE_CROSS_STREETS.map(xs => ({ w: 8, d: 84, x: xs, z: 0, y: 0.024 })),
    ...LOVE_BACK_STREETS.map(zs => ({ w: 140, d: 8, x: 0, z: zs, y: 0.028 })),
  ];
  roads.forEach(r => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), asphaltMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(r.x, r.y, r.z);
    mesh.receiveShadow = true;
    loveEnvGroup.add(mesh);
  });

  // 路面裂痕與破洞（沿每條道路散布）
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

  // 人行道：主幹道兩側、岔路兩側、後街靠內側
  const walks = [
    { w: 140, d: 1.6, x: 0, z: 5.8, y: 0.03 },
    { w: 140, d: 1.6, x: 0, z: -5.8, y: 0.03 },
    ...LOVE_CROSS_STREETS.flatMap(xs => [
      { w: 1.6, d: 84, x: xs - 5.9, z: 0, y: 0.032 },
      { w: 1.6, d: 84, x: xs + 5.9, z: 0, y: 0.032 },
    ]),
    ...LOVE_BACK_STREETS.map(zs => ({ w: 140, d: 1.6, x: 0, z: zs - Math.sign(zs) * 5.9, y: 0.034 })),
  ];
  walks.forEach(w => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w.w, w.d), walkMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(w.x, w.y, w.z);
    mesh.receiveShadow = true;
    loveEnvGroup.add(mesh);
  });

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
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 7; i++) {
      const x = -39 + i * 13 + (Math.random() - 0.5) * 2.0;
      const z = side * (14 + Math.random() * 1.5);
      buildRuinedHouse(x, z, side, pickHouse(), null, pickRoof());
    }
  }

  // 岔路兩側的房屋（轉向面朝垂直街；z避開主幹道房屋排，岔路側寬度8，房屋中心靠外且足夠分開）
  LOVE_CROSS_STREETS.forEach((xs, si) => {
    const zList = xs === 0 ? [-30, -18, 24, 34] : [-28, -17, 18, 30];
    [-1, 1].forEach(sx => {
      zList.forEach((zBase, i) => {
        const hx = xs + sx * 12 + (Math.random() - 0.5) * 1.2;
        const hz = zBase + (Math.random() - 0.5) * 2;
        const rotY = (sx > 0 ? -Math.PI / 2 : Math.PI / 2) + (Math.random() - 0.5) * 0.12;
        buildRuinedHouse(hx, hz, sx, pickHouse(), rotY, pickRoof());
      });
    });
  });

  // 後街外側的房屋（面朝後街：離地塊較遠且不落在路面上）
  LOVE_BACK_STREETS.forEach((zs, si) => {
    [-34, -17, 0, 17, 34].forEach((hx, i) => {
      const hz = zs + Math.sign(zs) * 11;
      buildRuinedHouse(hx + (Math.random() - 0.5) * 2, hz, zs > 0 ? 1 : -1, pickHouse(), null, pickRoof());
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

  // 廢棄車輛殘骸（兩輛），車身用鮮明色彩
  buildRustedCar(8, 2.2, 0.35, 0xe84f34);
  buildRustedCar(-22, -2.8, -1.1, 0x2e9df0);

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

// 單棟廢墟房屋：牆體＋塌陷屋頂＋破窗＋藤蔓＋瓦礫
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

// 廢棄生鏽車輛
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
    relic.rotation.y = Math.random() * Math.PI * 2;
    loveEnvGroup.add(relic);
    loveRelics.push(relic); // 登記：覓食時要從這裡拉光線
  }
  // 覓食光線：每顆遺物一條淡淡的線，端點每幀跟愛的位置走
  loveFeedGroup = new THREE.Group();
  loveFeedGroup.visible = false;
  loveEnvGroup.add(loveFeedGroup);
  loveRelics.forEach((relic) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffb84d, // 暖金，亮場景也看得到
      transparent: true,
      opacity: 0.35, // 淡淡的
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false; // 端點每幀變動，關掉剔除才不會線拉長時消失
    line.userData.relic = relic;
    loveFeedGroup.add(line);
    loveFeedLines.push(line);
  });
}

// -------------------------------------------------------------
// 羞恥環境：羅馬競技場（鬥獸場）遺址 — 陰天白日，亮度比「愛」低一階
// 特徵：雙層拱廊外圈、兩段塌毀缺口、石灰華暖米色、沙地競技區、
//      傾倒柱身、斷柱與瓦礫、縫裡鑽出的乾雜草
// -------------------------------------------------------------
function buildShameEnvironment() {
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
function buildSinsEnvironment() {
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
  loveGroup.add(loveAura);

  // B. 擁抱雙翼 (Embrace Wings) - 有機羽毛層疊展開的金紅光翼
  const featherGeo = createLoveFeatherGeometry();
  const featherMat = new THREE.MeshPhysicalMaterial({
    color: 0xffe3d0,
    emissive: 0xf5c9a8,
    emissiveIntensity: 0.35,
    transmission: 0,
    thickness: 0,
    roughness: 0.5,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
  });

  loveWings.push(buildLoveWing(1, featherGeo, featherMat));
  loveWings.push(buildLoveWing(-1, featherGeo, featherMat));

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

// 羽毛幾何：貝茲曲線畫出有機羽形並擠出薄厚度（帶圓角邊），再沿長度向後彎、兩側上翹成微杯狀
function createLoveFeatherGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(0.16, 0.2, 0.18, 0.6, 0.08, 0.94);
  shape.quadraticCurveTo(0.035, 1.04, 0, 1.1);
  shape.quadraticCurveTo(-0.035, 1.04, -0.08, 0.94);
  shape.bezierCurveTo(-0.18, 0.6, -0.16, 0.2, 0, 0);

  const depth = 0.04;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, pos.getZ(i) - depth * 0.5 - 0.28 * y * y + Math.abs(x) * 0.5 * y);
  }
  geo.computeVertexNormals();
  return geo;
}

// 單側翅膀：主羽扇形展開 + 覆羽蓋住羽根，pivot 為搧動軸心
function buildLoveWing(side, geo, mat) {
  const pivot = new THREE.Group();
  pivot.position.set(0.6 * side, 0.3, -0.3);
  pivot.rotation.y = side * 0.28;
  loveGroup.add(pivot);

  const feathers = [];

  const primaryCount = 12;
  for (let i = 0; i < primaryCount; i++) {
    const t = i / (primaryCount - 1);
    const phi = 2.75 + t * 1.66;
    const len = 1.0 + 1.3 * Math.pow(t, 1.2);
    const f = new THREE.Mesh(geo, mat.clone());
    f.material.emissiveIntensity = 0.45 + t * 0.5;
    f.position.set(
      side * (0.2 + 3.2 * Math.pow(t, 0.95)),
      0.15 + 1.5 * Math.sin(t * Math.PI * 0.6),
      -0.05 * i
    );
    f.rotation.z = side * phi;
    f.rotation.x = 0.15 + 0.5 * t;
    f.scale.set(1.0 + 0.4 * t, len, 1);
    f.userData.basePos = f.position.clone();
    f.userData.baseRotX = f.rotation.x;
    f.userData.baseRotZ = f.rotation.z;
    f.userData.baseScale = f.scale.clone();
    f.userData.baseEmissive = 0.45 + t * 0.5;
    feathers.push(f);
    pivot.add(f);
  }

  const covertCount = 9;
  for (let i = 0; i < covertCount; i++) {
    const t = i / (covertCount - 1);
    const phi = 2.65 + t * 1.4;
    const len = 0.55 + 0.75 * t;
    const f = new THREE.Mesh(geo, mat.clone());
    f.material.emissiveIntensity = 0.4 + t * 0.35;
    f.position.set(
      side * (0.15 + 2.2 * Math.pow(t, 0.95)),
      0.05 + 0.95 * Math.sin(t * Math.PI * 0.6),
      0.2 - 0.04 * i
    );
    f.rotation.z = side * phi;
    f.rotation.x = 0.1 + 0.3 * t;
    f.scale.set(0.8 + 0.25 * t, len, 1);
    f.userData.basePos = f.position.clone();
    f.userData.baseRotX = f.rotation.x;
    f.userData.baseRotZ = f.rotation.z;
    f.userData.baseScale = f.scale.clone();
    f.userData.baseEmissive = 0.4 + t * 0.35;
    feathers.push(f);
    pivot.add(f);
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
    w.pivot.position.set(0.6 * w.side, 0.3, -0.3);
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
        .delay(idx * 15)
        .easing(TWEEN.Easing.Quadratic.In);
      const witherR = new TWEEN.Tween(f.rotation)
        .to({ x: f.userData.baseRotX + 0.7 }, 650)
        .delay(idx * 15)
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

        const fallDelay = idx * 70 + (w.side > 0 ? 0 : 120);
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
    pivot.position.set(0.6 * w.side, 0.3, -0.3);
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
      f.material.opacity = 0.92;
      regrowPending++;

      const delay = idx * 45;
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
  }, 1200);
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

function drawRuneGlyph(ctx, S) {
  const m = S * 0.2;               // 邊界留白
  const style = Math.floor(Math.random() * 4);
  ctx.save();

  if (style === 0) {
    // 直立主幹＋斜枝，像刻在石碑上的記號
    const x = S / 2, y0 = m, y1 = S - m;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
    const branches = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < branches; i++) {
      const t = (i + 0.4 + Math.random() * 0.4) / branches;
      const y = y0 + (y1 - y0) * (0.16 + 0.68 * t);
      const dir = Math.random() > 0.5 ? 1 : -1;
      const len = S * (0.13 + Math.random() * 0.15);
      const a = 0.5 + Math.random() * 0.6;       // 與主幹的夾角
      const up = Math.random() > 0.35;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * Math.sin(a) * len, y + (up ? -1 : 1) * Math.cos(a) * len);
      ctx.stroke();
      if (Math.random() > 0.5) {                 // 有時候多一短橫
        ctx.beginPath();
        ctx.moveTo(x + dir * len * 0.4, y + (up ? -1 : 1) * len * 0.35);
        ctx.lineTo(x + dir * len * 0.9, y + (up ? -1 : 1) * len * 0.5);
        ctx.stroke();
      }
    }
  } else if (style === 1) {
    // 不規則閉合多邊形＋交叉線，像封印記號
    const n = 5 + Math.floor(Math.random() * 3);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const rr = (S / 2 - m) * (0.7 + Math.random() * 0.45);
      pts.push([S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (Math.random() > 0.4) ctx.closePath();
    ctx.stroke();
    const cuts = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < cuts; i++) {
      const a = pts[Math.floor(Math.random() * n)];
      const b = pts[Math.floor(Math.random() * n)];
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  } else if (style === 2) {
    // 圓＋內接多邊形＋外側刻度，像印璽／星圖
    const R = S / 2 - m;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, R, 0, Math.PI * 2);
    ctx.stroke();
    const sides = 3 + Math.floor(Math.random() * 3);
    const rot = Math.random() * Math.PI;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const px = S / 2 + Math.cos(a) * R * 0.6;
      const py = S / 2 + Math.sin(a) * R * 0.6;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const ticks = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < ticks; i++) {
      const a = Math.random() * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(S / 2 + Math.cos(a) * R * 0.9, S / 2 + Math.sin(a) * R * 0.9);
      ctx.lineTo(S / 2 + Math.cos(a) * (R + S * 0.06), S / 2 + Math.sin(a) * (R + S * 0.06));
      ctx.stroke();
    }
  } else {
    // 螺旋＋橫向刻痕，像岩畫
    ctx.beginPath();
    let r = S * 0.03, a = 0;
    ctx.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    const turns = 2.2 + Math.random() * 1.6;
    for (let i = 0; i <= 90; i++) {
      a = (i / 90) * turns * Math.PI * 2;
      r = S * 0.03 + (i / 90) * (S / 2 - m - S * 0.03);
      ctx.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    ctx.stroke();
    const marks = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < marks; i++) {
      const y = S * (0.28 + Math.random() * 0.44);
      const w = S * (0.1 + Math.random() * 0.12);
      const x = Math.random() > 0.5 ? S * 0.16 : S * 0.84;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y);
      ctx.lineTo(x + w / 2, y);
      ctx.stroke();
    }
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
  voidRuneTextures = createRuneTextures(14);
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

    // 巩膜（眼白）：象牙白，血絲是向虹膜匯聚的赤紅細線（整數倍角頻率，球面無接縫）
    vec3 sclera = vec3(0.93, 0.90, 0.85);
    float wob1 = envyNoise(vec2(face * 5.0, 1.3));
    float wob2 = envyNoise(vec2(face * 9.0, 4.7));
    float v1 = sin(ang * 13.0 + wob1 * 7.0);
    float v2 = sin(ang * 27.0 + wob2 * 5.0 + 2.1);
    float veinLine = 1.0 - smoothstep(0.0, 0.13, abs(v1));
    veinLine = max(veinLine, (1.0 - smoothstep(0.0, 0.09, abs(v2))) * 0.55);
    float veinMask = smoothstep(0.60, 0.40, face) * smoothstep(0.0, 0.18, face);
    sclera = mix(sclera, vec3(0.76, 0.11, 0.13), veinLine * veinMask * 0.95);

    // 虹膜：赤紅放射狀纖維，外圈亮環（角膜緣）
    float irisM = smoothstep(0.54, 0.64, face);
    float fib = 0.52 + 0.48 * sin(ang * 26.0 + rad * 7.0);
    vec3 iris = mix(vec3(0.40, 0.02, 0.05), vec3(0.96, 0.17, 0.12), fib);
    iris += vec3(1.0, 0.50, 0.32) * smoothstep(0.72, 0.56, rad * 1.4) * 0.30;

    // 瞳孔：深邃近黑
    float pupilM = smoothstep(0.89, 0.93, face);
    vec3 pupil = vec3(0.035, 0.006, 0.012);

    // 角膜緣亮環：眼白與虹膜交界
    float limbus = smoothstep(0.48, 0.55, face) * (1.0 - smoothstep(0.55, 0.64, face));

    vec3 col = sclera;
    col = mix(col, iris, irisM);
    col = mix(col, pupil, pupilM);
    col += vec3(1.0, 0.34, 0.24) * limbus * 0.40;

    // ---- 光影材質（不動）：移動掃描高光 + fresnel 邊緣光 ----
    float scan = smoothstep(0.10, 0.0, abs(vLocal.y * 2.6 - sin(uTime * 1.2) * 0.3));
    col += vec3(1.0, 0.72, 0.62) * scan * (0.24 + uFrenzy * 0.35);
    float fres = pow(1.0 - ndv, 2.5);
    col += vec3(1.0, 0.42, 0.38) * fres * 0.55;

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
    const coreMat = createPrideGlowMaterial({ color: 0x3b0764, emissive: 0x7e22ce, intensity: 0.38, roughness: 0.42, metalness: 0.25 });
    const goldMat = createPrideGlowMaterial({ color: 0xd4af37, emissive: 0x574000, intensity: 0.4, roughness: 0.22, metalness: 0.9 });
    const diamondMat = createPrideGlowMaterial({ color: 0xf8fafc, emissive: 0xcfe4ff, intensity: 0.5, roughness: 0.06, metalness: 0.1 });
    const rubyMat = createPrideGlowMaterial({ color: 0xa50034, emissive: 0xe0115f, intensity: 0.55, roughness: 0.12, metalness: 0.2 });
    const glowMat = coreMat; // animate() 只驅動這個的呼吸脈動

    const coreGeo = new THREE.OctahedronGeometry(0.85, 1);
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

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

    sinCreatures.pride = { group: grp, core, crownGroup, halo1, halo2, hit, glowMat };
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
    }

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

    sinCreatures.greed = { group: grp, core, claws, particles, pData, hit };
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

  // 5. 慾 (Lust) - 惑魅雙螺旋 (0, 2.4, 4.2)
  {
    const grp = new THREE.Group();
    grp.position.set(0, 2.5, 9.5);
    grp.userData = { sinKey: 'lust', basePos: new THREE.Vector3(0, 2.5, 9.5) };

    const helixGroup = new THREE.Group();

    const pts1 = [], pts2 = [];
    for (let t = -Math.PI * 2; t <= Math.PI * 2; t += 0.2) {
      pts1.push(new THREE.Vector3(0.55 * Math.cos(t), t * 0.28, 0.55 * Math.sin(t)));
      pts2.push(new THREE.Vector3(0.55 * Math.cos(t + Math.PI), t * 0.28, 0.55 * Math.sin(t + Math.PI)));
    }
    // 心跳脈衝光沿螺旋往頂端傳，兩股相位差半個節拍
    const h1 = new THREE.Mesh(createTaperedTubeGeometry(new THREE.CatmullRomCurve3(pts1), 48, 8, 0.065, 0.02), createLustHelixMaterial(0.0));
    const h2 = new THREE.Mesh(createTaperedTubeGeometry(new THREE.CatmullRomCurve3(pts2), 48, 8, 0.065, 0.02), createLustHelixMaterial(0.5));
    helixGroup.add(h1);
    helixGroup.add(h2);
    grp.add(helixGroup);

    // 圓潤花瓣裙：貝茲圓瓣取代尖錐
    const petals = [];
    const petalGeo = createSinPetalGeometry();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      // fresnel 幽光花瓣：每瓣相位錯開，微光沿瓣面流動
      const pet = new THREE.Mesh(petalGeo, createLustPetalMaterial(angle));
      pet.position.set(0.9 * Math.cos(angle), 0, 0.9 * Math.sin(angle));
      pet.rotation.y = angle;
      pet.rotation.x = Math.PI / 2.6;
      pet.userData = { baseRotX: pet.rotation.x, baseRotZ: pet.rotation.z, angle };
      petals.push(pet);
      grp.add(pet);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'lust' };
    grp.add(hit);

    sinCreatures.lust = { group: grp, helixGroup, petals, hit };
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

  // 7. 怠慢 (Sloth) - 兜帽垂紗者 (-1.6, 0.02, 3.4)：漆黑袍身立於街道地面，長鬚貼地蔓延
  {
    const grp = new THREE.Group();
    grp.position.set(-1.6, 0.02, 3.4);
    grp.userData = { sinKey: 'sloth', basePos: new THREE.Vector3(-1.6, 0.02, 3.4) };

    // 內層 group 負責整體縮放 80%；外層 grp.scale 留給「點選放大／狂暴」脈動
    const shape = new THREE.Group();
    shape.scale.setScalar(0.8);
    grp.add(shape);

    const cloakMat = createSlothCloakMaterial(0);

    // 袍身：Lathe 輪廓——腳端收、腰身細、肩部張開，到頸部收束（頭顱另外做成獨立橢球）
    const bodyProfile = [
      new THREE.Vector2(0.05, 0.00),
      new THREE.Vector2(0.26, 0.05),
      new THREE.Vector2(0.31, 0.26),
      new THREE.Vector2(0.31, 0.80),
      new THREE.Vector2(0.29, 1.35),
      new THREE.Vector2(0.30, 1.90),
      new THREE.Vector2(0.38, 2.20),
      new THREE.Vector2(0.34, 2.38),
      new THREE.Vector2(0.25, 2.52),
      new THREE.Vector2(0.16, 2.60),
    ];
    const body = new THREE.Mesh(createDrapedBodyGeometry(bodyProfile, 44, 0.038, 9), cloakMat);
    body.castShadow = true;
    shape.add(body);

    // 頭顱：獨立的前傾長橢球（參考圖的光滑兜帽頭，不是尖帽）
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 36, 24), cloakMat);
    head.scale.set(0.95, 1.34, 0.98);
    head.position.set(0, 2.92, 0.02);
    head.rotation.x = 0.16;
    head.castShadow = true;
    shape.add(head);

    // 兜帽：自頸後翻上包住顱頂、再向後拉出一個尖尾（參考圖兜帽後方的尖突）
    const hoodGroup = new THREE.Group();
    hoodGroup.position.set(0, 2.60, -0.10);
    hoodGroup.rotation.x = -0.06;
    shape.add(hoodGroup);

    const cowlProfile = [
      new THREE.Vector2(0.11, 0.00),
      new THREE.Vector2(0.25, 0.08),
      new THREE.Vector2(0.34, 0.24),
      new THREE.Vector2(0.38, 0.42),
      new THREE.Vector2(0.37, 0.58),
      new THREE.Vector2(0.31, 0.70),
      new THREE.Vector2(0.20, 0.79),
      new THREE.Vector2(0.07, 0.84),
    ];
    const cowl = new THREE.Mesh(createDrapedBodyGeometry(cowlProfile, 40, 0.024, 7), cloakMat);
    cowl.position.set(0, 0.02, -0.14);
    cowl.scale.set(1.0, 1.0, 1.10);
    cowl.castShadow = true;
    hoodGroup.add(cowl);

    // 帽尖：自後腦往後下方拉出的布尖（用漸細管，收在帽布內不出切邊）
    const hoodTip = new THREE.Mesh(
      createTaperedTubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0.00, 0.70, -0.16),
          new THREE.Vector3(-0.05, 0.56, -0.40),
          new THREE.Vector3(0.03, 0.38, -0.54),
          new THREE.Vector3(0.10, 0.22, -0.56),
        ]),
        28, 8, 0.17, 0.012
      ),
      cloakMat
    );
    hoodTip.castShadow = true;
    hoodGroup.add(hoodTip);

    // 顏面：貼在頭顱前方的暗色凹陷（兜帽下的空洞），赤瞳浮在它前面
    const face = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 24, 18),
      new THREE.MeshStandardMaterial({ color: 0x030208, roughness: 0.9, metalness: 0.0 })
    );
    face.position.set(0, 2.86, 0.215);
    face.scale.set(0.88, 1.12, 0.42);
    shape.add(face);

    // 赤瞳：兩顆細長發光縫，嵌在顏面凹槽裡
    const eyeTex = createRadialGlowTexture('255,80,100');
    const eyes = [];
    [-0.082, 0.082].forEach((ex) => {
      const eye = new THREE.Sprite(new THREE.SpriteMaterial({
        map: eyeTex, color: 0xff3049, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1.0,
      }));
      eye.scale.set(0.24, 0.14, 1);
      eye.position.set(ex, 2.88, 0.325);
      shape.add(eye);
      eyes.push(eye);
    });

    // 左側大垂紗：自頭顱甩出、繞過左側再垂落地面的大片布幔（參考圖的主體量塊）
    // 收束關鍵（對應使用者要求「頭尾收束到主體內」）：
    //   首列與末列的 inner 邊鑽進頭顱／袍腳裡面 → 兩端都收進主體，不露懸空切邊
    //   中段 inner 邊往內退 → 布幔與袍身之間留出空隙，正面看得出是「一片披在旁邊的布」
    const capeRows = [
      { y: 3.00, outer: [0.10, -0.06], inner: [0.04, -0.02] },
      { y: 3.10, outer: [-0.34, -0.30], inner: [0.02, -0.10] },
      { y: 2.96, outer: [-0.86, -0.54], inner: [-0.16, -0.24] },
      { y: 2.60, outer: [-1.22, -0.70], inner: [-0.52, -0.34] },
      { y: 2.15, outer: [-1.42, -0.74], inner: [-0.78, -0.34] },
      { y: 1.60, outer: [-1.48, -0.62], inner: [-0.86, -0.26] },
      { y: 1.05, outer: [-1.42, -0.40], inner: [-0.84, -0.14] },
      { y: 0.60, outer: [-1.22, -0.14], inner: [-0.70, 0.00] },
      { y: 0.34, outer: [-0.82, 0.10], inner: [-0.40, 0.08] },
      { y: 0.24, outer: [-0.32, 0.08], inner: [-0.10, 0.04] },
      { y: 0.20, outer: [-0.12, 0.02], inner: [-0.03, 0.01] },
    ];
    const cape = new THREE.Mesh(createDrapePanelGeometry(capeRows, 16), cloakMat);
    cape.castShadow = true;
    shape.add(cape);

    // 右側垂紗：同樣頭尾收進主體、中段留縫的第二片較窄布幕
    const cape2Rows = [
      { y: 2.86, outer: [0.10, -0.24], inner: [0.04, -0.12] },
      { y: 2.64, outer: [0.40, -0.46], inner: [0.06, -0.22] },
      { y: 2.22, outer: [0.62, -0.54], inner: [0.22, -0.28] },
      { y: 1.74, outer: [0.72, -0.50], inner: [0.34, -0.20] },
      { y: 1.26, outer: [0.74, -0.34], inner: [0.38, -0.10] },
      { y: 0.84, outer: [0.64, -0.14], inner: [0.34, 0.00] },
      { y: 0.50, outer: [0.46, 0.04], inner: [0.20, 0.06] },
      { y: 0.30, outer: [0.22, 0.08], inner: [0.06, 0.05] },
      { y: 0.22, outer: [0.10, 0.02], inner: [0.02, 0.01] },
    ];
    const cape2 = new THREE.Mesh(createDrapePanelGeometry(cape2Rows, 14), cloakMat);
    cape2.castShadow = true;
    shape.add(cape2);

    // 垂地長鬚：從腳底向四面貼地蔓延的細長墨色根鬚（參考圖的地面觸手）
    const tentacles = [];
    const TENT_COUNT = 26;
    for (let i = 0; i < TENT_COUNT; i++) {
      const angle = (i / TENT_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.26;
      const reach = 2.4 + Math.random() * 2.8;
      const pts = [];
      const wobble = Math.random() * Math.PI * 2;
      for (let j = 0; j <= 7; j++) {
        const t = j / 7;
        // 前段離開身體，中段外擴，末段貼地捲曲（參考圖尖端捲起的樣子）
        const r = 0.30 + reach * Math.pow(t, 0.70);
        const swing = Math.sin(t * 2.6 + wobble) * 0.46 * t;
        const curl = t > 0.80 ? Math.pow((t - 0.80) / 0.20, 2) * 0.95 : 0;
        const a = angle + swing;
        pts.push(new THREE.Vector3(
          Math.cos(a) * r - Math.cos(a) * curl,
          0.05 + Math.sin(t * Math.PI) * 0.12 - t * 0.05 + curl * 0.16,
          Math.sin(a) * r - Math.sin(a) * curl
        ));
      }
      const tentMesh = new THREE.Mesh(
        createTaperedTubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 8, 0.075, 0.008),
        createSlothTentacleMaterial(i * 0.63)
      );
      tentMesh.userData = { angle, phase: i * 0.63 };
      tentacles.push(tentMesh);
      shape.add(tentMesh);
    }

    // 袍腳的暗紫積霧：讓袍身與地面長鬚的交界不突兀
    const mistGeo = new THREE.CircleGeometry(1.05, 40);
    const mist = new THREE.Mesh(mistGeo, new THREE.MeshBasicMaterial({
      color: 0x2a0d3f, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = 0.02;
    shape.add(mist);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'sloth' };
    hit.position.y = 1.5;
    shape.add(hit);

    sinCreatures.sloth = { group: grp, shape, body, head, hoodGroup, cowl, hoodTip, face, eyes, cape, cape2, mist, tentacles, cloakMat, hit };
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
function triggerVoidDevour() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  voidStateText.innerText = "包覆吞噬：事象地平面擴張，空間捲曲...";

  new TWEEN.Tween(voidMembrane.scale).to({ x: 3.2, y: 3.2, z: 3.2 }, 900).easing(TWEEN.Easing.Cubic.Out).start();
  new TWEEN.Tween(voidMembraneWire.scale).to({ x: 3.2, y: 3.2, z: 3.2 }, 900).easing(TWEEN.Easing.Cubic.Out).start();
  new TWEEN.Tween(voidAura.material).to({ opacity: 0.8 }, 700).start();

  setTimeout(() => {
    voidStateText.innerText = "吸收文明能量，外膜收斂重組...";

    new TWEEN.Tween(voidMembrane.scale).to({ x: 1, y: 1, z: 1 }, 1200).easing(TWEEN.Easing.Back.InOut).start();
    new TWEEN.Tween(voidMembraneWire.scale).to({ x: 1, y: 1, z: 1 }, 1200).easing(TWEEN.Easing.Back.InOut).start();
    new TWEEN.Tween(voidAura.material).to({ opacity: 0.28 }, 1200).onComplete(() => {
      isVoidActionRunning = false;
      voidStateText.innerText = "平穩呼吸・殘影共鳴中";
    }).start();
  }, 1800);
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
function triggerVoidTeleport() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;

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
  if (stateText) stateText.innerText = "罪孽狂宴爆發！七大罪集體過載，振盪頻率飆升至 300%！";

  for (const key in sinCreatures) {
    const grp = sinCreatures[key].group;
    new TWEEN.Tween(grp.scale)
      .to({ x: 1.4, y: 1.4, z: 1.4 }, 350)
      .yoyo(true)
      .repeat(3)
      .start();
  }

  setTimeout(() => {
    isSinsFrenzy = false;
    isSinsActionRunning = false;
    if (stateText) stateText.innerText = SINS_DATA[currentSelectedSin]?.state || "生態平衡・7 隻生命體共生共鳴中";
  }, 3800);
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
    scene.fog = new THREE.FogExp2(0x101c16, 0.022);
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

    // 覓食光線：淡入淡出＋每幀重接愛的最新位置（移動時自動跟著走）
    if (loveFeedGroup) {
      loveFeedFactor += ((isLoveFeeding ? 1 : 0) - loveFeedFactor) * Math.min(1, frameDelta * 3);
      loveFeedGroup.visible = loveFeedFactor > 0.02;
      if (loveFeedGroup.visible) {
        const lx = loveGroup.position.x, ly = loveGroup.position.y, lz = loveGroup.position.z;
        for (const line of loveFeedLines) {
          const rp = line.userData.relic.position; // 遺物靜止不動
          const pos = line.geometry.attributes.position.array;
          pos[0] = rp.x; pos[1] = rp.y + 0.6; pos[2] = rp.z; // 遺物中心約地面上 0.6
          pos[3] = lx; pos[4] = ly; pos[5] = lz; // 愛的身上
          line.geometry.attributes.position.needsUpdate = true;
          line.material.opacity = 0.35 * loveFeedFactor;
        }
      }
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
      loveEmbrace += (loveEmbraceTarget - loveEmbrace) * 0.06;
      const e = loveEmbrace;

      loveWings.forEach((w) => {
        const flap = Math.sin(elapsedTime * flapSpeed + w.phase);

        // 環抱：翅膀根部前移、放大、向內合攏
        w.pivot.position.set(
          w.side * (0.6 - e * 0.35),
          0.3 + e * 0.15,
          -0.3 + e * 1.6
        );
        w.pivot.rotation.y = w.side * (0.28 - e * 1.15); // 向前方掃攏
        w.pivot.rotation.z = w.side * (0.22 + flap * flapAmp * (1 - e) - wingDroop) + w.side * e * 0.55; // 抬高環抱弧線
        w.pivot.scale.setScalar(1 + e * 1.35); // 環抱時明顯放大

        w.feathers.forEach((f, idx) => {
          const follow = Math.sin(elapsedTime * flapSpeed + w.phase - idx * 0.16);
          f.rotation.z = f.userData.baseRotZ + w.side * follow * 0.05 * (0.4 + loveEnergy * 0.6);
          f.rotation.x = f.userData.baseRotX + e * (0.15 + idx * 0.02); // 羽片內彎成包覆弧面
          // 環抱時羽毛發光大幅加強
          f.material.emissiveIntensity = f.userData.baseEmissive + e * 1.8;
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

    voidGyroRings.forEach((ring) => {
      ring.rotation.x += ring.userData.rotXSpeed;
      ring.rotation.y += ring.userData.rotYSpeed;
      ring.rotation.z += ring.userData.rotZSpeed;
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

    // 5. 慾 (Lust)
    if (sinCreatures.lust) {
      const l = sinCreatures.lust;
      l.helixGroup.rotation.y += 0.018 * frenzyMult;
      l.helixGroup.children.forEach(h => setSinsUniform(h.material, elapsedTime, uFrenzyVal));
      l.petals.forEach((pet, idx) => {
        setSinsUniform(pet.material, elapsedTime, uFrenzyVal);
        const petBreath = Math.sin(elapsedTime * 2.5 + idx * 0.4) * 0.18 * frenzyMult;
        pet.rotation.x = pet.userData.baseRotX + petBreath * 0.4;
        pet.rotation.z = pet.userData.baseRotZ + petBreath * 0.3;
      });
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

    // 7. 怠慢 (Sloth) — 漆黑兜帽垂紗者
    if (sinCreatures.sloth) {
      const sl = sinCreatures.sloth;
      setSinsUniform(sl.cloakMat, elapsedTime, uFrenzyVal);
      // 極慢呼吸：袍身幾乎不動，只有布面微微起伏（怠慢＝遲鈍）
      const breath = Math.sin(elapsedTime * 0.6);
      sl.body.scale.set(1 + breath * 0.012, 1 + breath * 0.018, 1 + breath * 0.012);
      // 兜帽微微點頭（整組一起動，含帽布與赤瞳）
      sl.hoodGroup.rotation.x = -0.06 + Math.sin(elapsedTime * 0.45) * 0.05;
      sl.hoodGroup.position.y = 2.62 + breath * 0.015;
      // 赤瞳極慢明滅
      const eyePulse = 0.55 + 0.45 * Math.sin(elapsedTime * 0.8);
      sl.eyes.forEach((e) => {
        e.material.opacity = 0.6 + eyePulse * 0.4;
        e.scale.set(0.24 + eyePulse * 0.05, 0.14 + eyePulse * 0.03, 1);
      });
      // 垂紗輕微擺動
      sl.cape.rotation.z = Math.sin(elapsedTime * 0.35) * 0.03;
      sl.cape.rotation.y = Math.sin(elapsedTime * 0.27 + 1.2) * 0.05;
      sl.cape2.rotation.z = Math.sin(elapsedTime * 0.31 + 2.1) * 0.035;
      sl.cape2.rotation.y = Math.sin(elapsedTime * 0.24 + 0.6) * 0.05;
      // 袍腳暗紫積霧呼吸
      sl.mist.material.opacity = 0.4 + Math.sin(elapsedTime * 0.7) * 0.12;
      // 地面長鬚：各自極慢扭動，像墨在地面緩慢擴散
      sl.tentacles.forEach((t, idx) => {
        setSinsUniform(t.material, elapsedTime, uFrenzyVal);
        t.rotation.y = Math.sin(elapsedTime * 0.22 + idx * 0.8) * 0.03;
        t.position.y = Math.sin(elapsedTime * 0.3 + idx * 1.3) * 0.012;
      });
    }

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
