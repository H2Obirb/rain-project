// ============================================================
// M2 物種雛形：精神概念體 3D 模擬系統
// 支援三大物種切換與完整獨立操作：
// 1. 愛 (Love)    - 強效同化・光絲擁抱・極高能耗與覓食渴望
// 2. 羞恥 (Shame) - 碰觸自動解體，移開自動重組
// 3. 虛無 (Void)  - 分散再聚合、包覆吞噬、共鳴同化、維度瞬移
// ============================================================

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
let loveCore, loveAura, loveFilaments = [], lovePetals = [];
let loveParticles, loveParticleVels = [];
let loveEnergy = 1.0; // 能量值 (0.0 ~ 1.0)
let isLoveAssimilating = false;

// -------------------------------------------------------------
// [羞恥 Shame] 專屬變數
// -------------------------------------------------------------
let shameGroup;
let shameCore, shameAura;
let shamePetals = [];
let shameParticles;
let shameDisassembleFactor = 0; // 0 = 完整閉合, 1 = 完全解體
let targetShameFactor = 0;
let isFlushed = false;

// -------------------------------------------------------------
// [虛無 Void] 專屬變數
// -------------------------------------------------------------
let voidGroup;
let voidCore, voidInnerWire, voidAura, voidMembrane, voidMembraneWire;
let voidGyroRings = [];
let voidShards = [];
let voidParticles, voidParticlePositions;
let isVoidActionRunning = false;

// -------------------------------------------------------------
// [七大罪 Seven Sins 群居共生生態] 專屬變數
// -------------------------------------------------------------
let sinsGroup;
let sinCreatures = {}; // pride, greed, wrath, envy, lust, gluttony, sloth
let sinWebLines;
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
    cameraPos: { x: 0, y: 3.5, z: 18 },
    targetPos: { x: 0, y: -0.5, z: 0 }
  },
  pride: {
    title: "傲慢（Pride / 支配之冕）",
    role: "【頂端支配者】位居最高點，俯視整個群落並散播統御金冕",
    morph: "浮游冷金晶核・十二重尖銳光刺・逆向同心日冕光環",
    forage: "不從事物質採集，專門吸收其餘六罪散溢的崇拜波紋維持光環",
    state: "👑 傲然旋轉中・正以冷冽光輝排斥一切低階靠近",
    cameraPos: { x: 0, y: 4.2, z: 6.0 },
    targetPos: { x: 0, y: 3.2, z: 0 }
  },
  greed: {
    title: "貪婪（Greed / 聚斂之爪）",
    role: "【物資聚斂者】不斷將環境游離微粒抽入體內，只進不出",
    morph: "翡翠二十面體・六向向內收縮琉璃吸爪・高密度環形吸積盤",
    forage: "伸展琉璃觸爪捕捉周遭所有光點，形成微型引力晶球",
    state: "🪙 聚斂中・周圍吸積盤持續掠奪環境微粒",
    cameraPos: { x: 6.5, y: 1.8, z: 5.5 },
    targetPos: { x: 4.2, y: 0.8, z: 1.2 }
  },
  wrath: {
    title: "暴怒（Wrath / 熔岩刺核）",
    role: "【熱能引爆者】極具攻擊性，群落面臨干擾時爆發震波護衛殖群",
    morph: "赤紅脈衝多面核・十六根高溫骨刺・膨脹烈焰震波環",
    forage: "將外界衝擊與敵意轉化為體內核聚變反應熱能",
    state: "🔥 臨界高熱・體表尖刺正以高頻劇烈震顫",
    cameraPos: { x: -6.0, y: 1.5, z: 6.5 },
    targetPos: { x: -4.0, y: 0.5, z: 2.5 }
  },
  envy: {
    title: "嫉妒（Envy / 凝視之蛇）",
    role: "【陰影監視寄生體】盤踞在傲慢身旁，隨時伺機竊取頂端榮耀",
    morph: "毒青莫比烏斯扭結帶・冰冷單眼晶核・暗影毒絲",
    forage: "發射干擾頻率干涉鄰近個體，偷取其光譜反射",
    state: "🐍 陰暗窺探・冷眼持續鎖定傲慢的光環",
    cameraPos: { x: 3.8, y: 3.2, z: 1.0 },
    targetPos: { x: 2.2, y: 2.2, z: -2.8 }
  },
  lust: {
    title: "慾（Lust / 惑魅雙螺旋）",
    role: "【費洛蒙傳導體】維繫群落親和力，避免七罪因互斥而解體",
    morph: "柔韌洋紅雙螺旋絲帶・八瓣律動呼吸花裙・粉霧光場",
    forage: "散發柔和親和光波，誘引同伴的神經突觸光絲交纏",
    state: "🌸 舒展綻放・費洛蒙光場覆蓋整個中層生態圈",
    cameraPos: { x: 0, y: 0.5, z: 8.5 },
    targetPos: { x: 0, y: -0.6, z: 4.2 }
  },
  gluttony: {
    title: "暴食（Gluttony / 吞噬之口）",
    role: "【代謝胃囊消化腔】吞噬空間中所有死物與殘骸，轉化為群落養分",
    morph: "三重擴張同心圓吞嚥漏斗・巨型厚重有機囊袋・流動齒輪環",
    forage: "不斷產生向內吸力，將大體積碎片過濾研磨消化",
    state: "🍖 深層飢渴・吞嚥漏斗正以 0.8Hz 規律吸納中",
    cameraPos: { x: -5.5, y: -0.2, z: 1.0 },
    targetPos: { x: -3.6, y: -1.2, z: -3.0 }
  },
  sloth: {
    title: "怠慢（Sloth / 沉眠水母）",
    role: "【生態基底減震錨】懸浮於群落底層，吸收群落過剩震盪維持平衡",
    morph: "半透明灰藍海鞘水母傘蓋・極慢飄動垂暮長鬚・惰性防護外膜",
    forage: "零主動消耗，僅依靠群落沉降的微弱代謝殘渣滲透維生",
    state: "🦥 深度休眠・代謝率降至 3%，悠然隨波漂蕩",
    cameraPos: { x: 0, y: -2.2, z: 5.5 },
    targetPos: { x: 0, y: -3.6, z: -0.6 }
  }
};

// DOM 元素引用
const loveEnergyText = document.getElementById('love-energy-text');
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
  buildLoveCreature();
  buildShameCreature();
  buildVoidCreature();
  buildSinsColony();
  setupUI();
  setupMouseEvents();
  setSpecies('love'); // 預設展示「愛」
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
  scene.add(ambientLight);

  const mainLight = new THREE.PointLight(0xf59e0b, 3.8, 40);
  mainLight.position.set(8, 12, 10);
  mainLight.name = 'mainLight';
  scene.add(mainLight);

  const backLight = new THREE.PointLight(0xec4899, 3.2, 35);
  backLight.position.set(-10, -6, -8);
  backLight.name = 'backLight';
  scene.add(backLight);

  window.addEventListener('resize', onWindowResize);
}

function setupHitbox() {
  const hitboxGeo = new THREE.SphereGeometry(3.3, 16, 16);
  const hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
  hitboxMesh = new THREE.Mesh(hitboxGeo, hitboxMat);
  scene.add(hitboxMesh);
}

// -------------------------------------------------------------
// 2. 構建「愛 (Love)」- 強同化・燃燒心核・光絲擁抱
// -------------------------------------------------------------
function buildLoveCreature() {
  loveGroup = new THREE.Group();
  scene.add(loveGroup);

  // A. 熾熱同化心核 (Incandescent Core) - 具有脈動的雙子金紅發光核
  const coreGeo = new THREE.SphereGeometry(1.2, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xff3366,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.2,
    roughness: 0.15,
    metalness: 0.3,
  });
  loveCore = new THREE.Mesh(coreGeo, coreMat);
  loveGroup.add(loveCore);

  // 核心向外輻射的熾熱金紅光暈
  const auraGeo = new THREE.SphereGeometry(1.9, 32, 32);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  loveAura = new THREE.Mesh(auraGeo, auraMat);
  loveGroup.add(loveAura);

  // B. 同化之光絲 / 擁抱觸鬚 (Embracing Assimilation Filaments)
  // 10 條由心核向外舒展伸展的莫比烏斯光帶 / 曲線觸鬚
  const filamentCount = 10;
  for (let i = 0; i < filamentCount; i++) {
    const points = [];
    const angle = (i / filamentCount) * Math.PI * 2;
    const len = 7;
    for (let j = 0; j <= len; j++) {
      const t = j / len;
      const r = 1.2 + t * 3.8 + Math.sin(t * Math.PI) * 0.8;
      const curAngle = angle + t * 1.5;
      const x = r * Math.cos(curAngle);
      const y = (t - 0.5) * 3.2 + Math.sin(t * 4) * 0.5;
      const z = r * Math.sin(curAngle);
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.06, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf43f5e,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.5,
      transparent: true,
      opacity: 0.85,
    });

    const filament = new THREE.Mesh(tubeGeo, tubeMat);
    filament.userData = {
      baseRotY: (i / filamentCount) * Math.PI * 2,
      rotSpeed: 0.008 + (i % 3) * 0.004,
      wavePhase: i * 0.6,
      originalPoints: points,
    };
    loveFilaments.push(filament);
    loveGroup.add(filament);
  }

  // C. 光之冠冕瓣 (Coronal Embrace Petals) - 16 片半透明琥珀琉璃冠瓣
  const petalCount = 16;
  const pGeo = new THREE.CylinderGeometry(0.04, 0.45, 2.8, 4);
  const pMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    emissive: 0xdb2777,
    emissiveIntensity: 0.5,
    transmission: 0.8,
    thickness: 1.0,
    roughness: 0.1,
    transparent: true,
    opacity: 0.75,
  });

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.Mesh(pGeo, pMat.clone());
    const r = 2.4;
    petal.position.set(r * Math.cos(angle), 0, r * Math.sin(angle));
    petal.rotation.z = Math.PI / 4;
    petal.rotation.y = angle;

    petal.userData = {
      angle: angle,
      radius: r,
      tiltSpeed: 1.5 + (i % 4) * 0.3,
    };
    lovePetals.push(petal);
    loveGroup.add(petal);
  }

  // D. 覓食匯流微粒群 (Emotion Foraging Particle Swarm)
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
    color: 0xfbbf24,
    size: 0.13,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
  });

  loveParticles = new THREE.Points(pGeoBuffer, particleMat);
  loveGroup.add(loveParticles);
}

// -------------------------------------------------------------
// [愛 Love] 專屬指令實現
// -------------------------------------------------------------

// 1. 光之抱擁 (強效同化 - 消耗大量能量)
function triggerLoveAssimilate() {
  if (isLoveAssimilating) return;
  isLoveAssimilating = true;

  // 光絲與冠瓣向外極限伸展包覆
  new TWEEN.Tween(loveGroup.scale)
    .to({ x: 1.8, y: 1.8, z: 1.8 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  new TWEEN.Tween(loveAura.scale)
    .to({ x: 3.5, y: 3.5, z: 3.5 }, 800)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  new TWEEN.Tween(loveCore.material)
    .to({ emissiveIntensity: 2.8 }, 600)
    .start();

  // 消耗能量！
  loveEnergy = Math.max(0.18, loveEnergy - 0.55);
  updateLoveEnergyUI();

  setTimeout(() => {
    // 釋放完畢，核心因能耗過劇而劇烈暗淡收縮
    new TWEEN.Tween(loveGroup.scale)
      .to({ x: 0.88, y: 0.88, z: 0.88 }, 1200)
      .easing(TWEEN.Easing.Back.Out)
      .start();

    new TWEEN.Tween(loveAura.scale)
      .to({ x: 1.9, y: 1.9, z: 1.9 }, 1000)
      .start();

    new TWEEN.Tween(loveCore.material)
      .to({ emissiveIntensity: 0.4 + loveEnergy * 0.8 }, 1000)
      .onComplete(() => {
        isLoveAssimilating = false;
        if (loveEnergy <= 0.25) {
          loveEnergyText.innerText = `⚠️ 能量耗盡 (${Math.round(loveEnergy * 100)}%)！心火萎靡，極需覓食補充`;
          loveEnergyText.classList.add('burnout');
        }
      })
      .start();
  }, 1200);
}

// 2. 渴望覓食 (吸收文明情緒 - 回補能量)
function triggerLoveFeed() {
  loveEnergy = 1.0;
  updateLoveEnergyUI();
  loveEnergyText.innerText = "✨ 汲取文明殘影微粒！心核重新熾熱充沛 (100%)";
  loveEnergyText.classList.remove('burnout');

  // 能量光流反哺脈衝
  new TWEEN.Tween(loveCore.scale)
    .to({ x: 1.4, y: 1.4, z: 1.4 }, 300)
    .easing(TWEEN.Easing.Back.Out)
    .onComplete(() => {
      new TWEEN.Tween(loveCore.scale).to({ x: 1.0, y: 1.0, z: 1.0 }, 700).start();
    })
    .start();

  new TWEEN.Tween(loveCore.material)
    .to({ emissiveIntensity: 1.6 }, 400)
    .onComplete(() => {
      new TWEEN.Tween(loveCore.material).to({ emissiveIntensity: 1.2 }, 800).start();
    })
    .start();

  loveParticles.material.color.setHex(0xffea00);
  setTimeout(() => {
    loveParticles.material.color.setHex(0xfbbf24);
  }, 1000);
}

// 3. 過度耗損 (能量枯竭展示)
function triggerLoveBurnout() {
  loveEnergy = 0.08;
  updateLoveEnergyUI();
  loveEnergyText.innerText = "🥀 能量枯竭 (8%)！因無度同化與付出而陷入暗淡休眠";
  loveEnergyText.classList.add('burnout');

  new TWEEN.Tween(loveCore.material)
    .to({ emissiveIntensity: 0.15 }, 900)
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
  if (loveEnergy > 0.6) {
    loveEnergyText.innerText = `能量充沛 (${percent}%)・心跳強烈熾熱`;
    loveEnergyText.classList.remove('burnout');
  } else if (loveEnergy > 0.25) {
    loveEnergyText.innerText = `能量代謝中 (${percent}%)・光絲收攏`;
    loveEnergyText.classList.remove('burnout');
  }
}

// -------------------------------------------------------------
// 3. 構建「羞恥 (Shame)」(保持完全未動)
// -------------------------------------------------------------
function buildShameCreature() {
  shameGroup = new THREE.Group();
  scene.add(shameGroup);

  const coreGeo = new THREE.SphereGeometry(1.0, 32, 32);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xff4d6d,
    emissive: 0xbe123c,
    emissiveIntensity: 0.8,
    roughness: 0.15,
    metalness: 0.4,
  });
  shameCore = new THREE.Mesh(coreGeo, coreMat);
  shameGroup.add(shameCore);

  const auraGeo = new THREE.SphereGeometry(1.4, 24, 24);
  const auraMat = new THREE.MeshBasicMaterial({
    color: 0xfb7185,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  shameAura = new THREE.Mesh(auraGeo, auraMat);
  shameGroup.add(shameAura);

  const petalCount = 76;
  const petalGeo = new THREE.ConeGeometry(0.36, 1.25, 4);
  petalGeo.rotateX(Math.PI / 2);

  const petalMat = new THREE.MeshPhysicalMaterial({
    color: 0xffcad4,
    emissive: 0x880d1e,
    emissiveIntensity: 0.4,
    roughness: 0.15,
    transmission: 0.75,
    thickness: 0.8,
    transparent: true,
    opacity: 0.88,
  });

  for (let i = 0; i < petalCount; i++) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / petalCount);
    const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

    const normalDir = new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();

    const closedRadius = 1.6 + (i % 3) * 0.15;
    const closedPos = normalDir.clone().multiplyScalar(closedRadius);

    const scatterDist = 4.2 + Math.random() * 4.0;
    const scatterOffset = normalDir.clone().multiplyScalar(scatterDist).add(
      new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5)
    );

    const petal = new THREE.Mesh(petalGeo, petalMat.clone());
    petal.position.copy(closedPos);
    petal.lookAt(closedPos.clone().add(normalDir));

    petal.userData = {
      closedPos: closedPos,
      scatterPos: scatterOffset,
      baseRot: petal.rotation.clone(),
      scatterRot: new THREE.Euler(
        petal.rotation.x + (Math.random() - 0.5) * 4,
        petal.rotation.y + (Math.random() - 0.5) * 4,
        petal.rotation.z + (Math.random() - 0.5) * 4
      ),
      jitterSeed: Math.random() * 100,
    };

    shamePetals.push(petal);
    shameGroup.add(petal);
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
    transmission: 0.85,
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

  const shardGeo = new THREE.OctahedronGeometry(0.26, 0);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    emissive: 0x4f46e5,
    emissiveIntensity: 0.5,
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.85,
  });

  const shardCount = 48;
  for (let i = 0; i < shardCount; i++) {
    const shard = new THREE.Mesh(shardGeo, shardMat.clone());
    const radius = 4.2 + Math.random() * 2.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = (Math.random() - 0.5) * Math.PI * 0.8;

    const x = radius * Math.cos(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi);
    const z = radius * Math.cos(phi) * Math.sin(theta);

    shard.position.set(x, y, z);
    shard.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    shard.userData = {
      basePos: new THREE.Vector3(x, y, z),
      orbitSpeed: 0.005 + Math.random() * 0.01,
      angle: theta,
      radius: radius,
      yBase: y,
      bobSpeed: 1 + Math.random() * 2,
    };

    voidShards.push(shard);
    voidGroup.add(shard);
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
}

// -------------------------------------------------------------
// 4.5 構建「七大罪群落生態 (Seven Sins Colony)」
// 傲慢、貪婪、暴怒、嫉妒、慾、暴食、怠慢 群居共生系統
// -------------------------------------------------------------
function buildSinsColony() {
  sinsGroup = new THREE.Group();
  scene.add(sinsGroup);
  sinsGroup.visible = false;

  sinCreatures = {};

  // 1. 傲慢 (Pride) - 頂部支配之冕 (0, 3.2, 0)
  {
    const grp = new THREE.Group();
    grp.position.set(0, 3.2, 0);
    grp.userData = { sinKey: 'pride', basePos: new THREE.Vector3(0, 3.2, 0) };

    const coreGeo = new THREE.OctahedronGeometry(0.85, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      metalness: 0.92,
      roughness: 0.15
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

    const crownGroup = new THREE.Group();
    const spikeGeo = new THREE.ConeGeometry(0.045, 0.95, 6);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.7,
      metalness: 0.95,
      roughness: 0.1
    });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(1.15 * Math.cos(angle), 0.35, 1.15 * Math.sin(angle));
      spike.rotation.x = Math.PI / 6;
      spike.rotation.y = angle;
      crownGroup.add(spike);
    }
    grp.add(crownGroup);

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.022, 16, 64),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.1 })
    );
    halo1.rotation.x = Math.PI / 2;
    grp.add(halo1);

    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.018, 16, 64),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true })
    );
    halo2.rotation.x = Math.PI / 3;
    grp.add(halo2);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'pride' };
    grp.add(hit);

    sinCreatures.pride = { group: grp, core, crownGroup, halo1, halo2, hit };
    sinsGroup.add(grp);
  }

  // 2. 貪婪 (Greed) - 聚斂吸積爪 (4.2, 0.8, 1.2)
  {
    const grp = new THREE.Group();
    grp.position.set(4.2, 0.8, 1.2);
    grp.userData = { sinKey: 'greed', basePos: new THREE.Vector3(4.2, 0.8, 1.2) };

    const coreGeo = new THREE.IcosahedronGeometry(0.7, 1);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x065f46,
      emissiveIntensity: 0.9,
      metalness: 0.85,
      roughness: 0.2
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

    const claws = [];
    const clawMat = new THREE.MeshPhysicalMaterial({
      color: 0x34d399,
      emissive: 0x059669,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      transmission: 0.7,
      transparent: true,
      opacity: 0.85
    });

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const pts = [
        new THREE.Vector3(0.5 * Math.cos(angle), -0.2, 0.5 * Math.sin(angle)),
        new THREE.Vector3(1.3 * Math.cos(angle), 0.35, 1.3 * Math.sin(angle)),
        new THREE.Vector3(0.85 * Math.cos(angle + 0.3), 0.9, 0.85 * Math.sin(angle + 0.3)),
        new THREE.Vector3(0.25 * Math.cos(angle + 0.4), 0.6, 0.25 * Math.sin(angle + 0.4))
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      const clawMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.05, 8, false), clawMat);
      clawMesh.userData = { basePoints: pts, angle };
      claws.push(clawMesh);
      grp.add(clawMesh);
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

  // 3. 暴怒 (Wrath) - 熔岩刺核 (-4.0, 0.5, 2.5)
  {
    const grp = new THREE.Group();
    grp.position.set(-4.0, 0.5, 2.5);
    grp.userData = { sinKey: 'wrath', basePos: new THREE.Vector3(-4.0, 0.5, 2.5) };

    const coreGeo = new THREE.DodecahedronGeometry(0.75, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xb91c1c,
      emissiveIntensity: 1.4,
      roughness: 0.35,
      metalness: 0.4
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    grp.add(core);

    const spikesGroup = new THREE.Group();
    const spikeGeo = new THREE.ConeGeometry(0.065, 0.85, 5);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 1.2,
      metalness: 0.8
    });
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Mesh(spikeGeo, spikeMat);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const r = 0.75;
      sp.position.set(r * Math.cos(phi) * Math.cos(theta), r * Math.sin(phi), r * Math.cos(phi) * Math.sin(theta));
      sp.lookAt(sp.position.clone().multiplyScalar(2));
      sp.rotateX(Math.PI / 2);
      spikesGroup.add(sp);
    }
    grp.add(spikesGroup);

    const shockRing1 = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
    );
    shockRing1.rotation.x = Math.PI / 2;
    grp.add(shockRing1);

    const shockRing2 = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.3, 32),
      new THREE.MeshBasicMaterial({ color: 0xf97316, side: THREE.DoubleSide, transparent: true, opacity: 0.4 })
    );
    shockRing2.rotation.y = Math.PI / 4;
    grp.add(shockRing2);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'wrath' };
    grp.add(hit);

    sinCreatures.wrath = { group: grp, core, spikesGroup, shockRing1, shockRing2, hit };
    sinsGroup.add(grp);
  }

  // 4. 嫉妒 (Envy) - 凝視之蛇 (2.2, 2.2, -2.8)
  {
    const grp = new THREE.Group();
    grp.position.set(2.2, 2.2, -2.8);
    grp.userData = { sinKey: 'envy', basePos: new THREE.Vector3(2.2, 2.2, -2.8) };

    const knotGeo = new THREE.TorusKnotGeometry(0.75, 0.08, 64, 8, 2, 3);
    const knotMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0f766e,
      emissiveIntensity: 0.8,
      metalness: 0.8,
      roughness: 0.2
    });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    grp.add(knot);

    const eyeGeo = new THREE.SphereGeometry(0.38, 24, 24);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x14b8a6,
      emissive: 0x2dd4bf,
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.1
    });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    grp.add(eye);

    const pupilGeo = new THREE.TorusGeometry(0.2, 0.03, 16, 32);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x042f2e });
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.z = 0.25;
    eye.add(pupil);

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'envy' };
    grp.add(hit);

    sinCreatures.envy = { group: grp, knot, eye, hit };
    sinsGroup.add(grp);
  }

  // 5. 慾 (Lust) - 惑魅雙螺旋 (0, -0.6, 4.2)
  {
    const grp = new THREE.Group();
    grp.position.set(0, -0.6, 4.2);
    grp.userData = { sinKey: 'lust', basePos: new THREE.Vector3(0, -0.6, 4.2) };

    const helixGroup = new THREE.Group();
    const helixMat = new THREE.MeshStandardMaterial({
      color: 0xec4899,
      emissive: 0xbe185d,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.2
    });

    const pts1 = [], pts2 = [];
    for (let t = -Math.PI * 2; t <= Math.PI * 2; t += 0.2) {
      pts1.push(new THREE.Vector3(0.55 * Math.cos(t), t * 0.28, 0.55 * Math.sin(t)));
      pts2.push(new THREE.Vector3(0.55 * Math.cos(t + Math.PI), t * 0.28, 0.55 * Math.sin(t + Math.PI)));
    }
    const h1 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts1), 32, 0.045, 8, false), helixMat);
    const h2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 32, 0.045, 8, false), helixMat);
    helixGroup.add(h1);
    helixGroup.add(h2);
    grp.add(helixGroup);

    const petals = [];
    const petalGeo = new THREE.CylinderGeometry(0.02, 0.3, 1.6, 4);
    const petalMat = new THREE.MeshPhysicalMaterial({
      color: 0xf43f5e,
      emissive: 0xdb2777,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      transmission: 0.75,
      transparent: true,
      opacity: 0.8
    });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pet = new THREE.Mesh(petalGeo, petalMat);
      pet.position.set(0.9 * Math.cos(angle), 0, 0.9 * Math.sin(angle));
      pet.rotation.z = Math.PI / 4;
      pet.rotation.y = angle;
      pet.userData = { angle };
      petals.push(pet);
      grp.add(pet);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'lust' };
    grp.add(hit);

    sinCreatures.lust = { group: grp, helixGroup, petals, hit };
    sinsGroup.add(grp);
  }

  // 6. 暴食 (Gluttony) - 吞噬巨口 (-3.6, -1.2, -3.0)
  {
    const grp = new THREE.Group();
    grp.position.set(-3.6, -1.2, -3.0);
    grp.userData = { sinKey: 'gluttony', basePos: new THREE.Vector3(-3.6, -1.2, -3.0) };

    const sacGeo = new THREE.TorusGeometry(0.9, 0.35, 16, 32);
    const sacMat = new THREE.MeshStandardMaterial({
      color: 0x7c2d12,
      emissive: 0xc2410c,
      emissiveIntensity: 0.7,
      roughness: 0.4,
      metalness: 0.3
    });
    const sac = new THREE.Mesh(sacGeo, sacMat);
    sac.rotation.x = Math.PI / 2;
    grp.add(sac);

    const maws = [];
    const mawSizes = [0.95, 0.65, 0.35];
    mawSizes.forEach((sz, idx) => {
      const mGeo = new THREE.CylinderGeometry(sz, sz * 0.6, 0.4, 16, 1, true);
      const mMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.8 + idx * 0.3,
        roughness: 0.3,
        side: THREE.DoubleSide
      });
      const mawMesh = new THREE.Mesh(mGeo, mMat);
      mawMesh.position.y = (idx - 1) * 0.3;
      mawMesh.userData = { baseScale: sz, offset: idx * 0.8 };
      maws.push(mawMesh);
      grp.add(mawMesh);
    });

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'gluttony' };
    grp.add(hit);

    sinCreatures.gluttony = { group: grp, sac, maws, hit };
    sinsGroup.add(grp);
  }

  // 7. 怠慢 (Sloth) - 沉眠水母 (0, -3.6, -0.6)
  {
    const grp = new THREE.Group();
    grp.position.set(0, -3.6, -0.6);
    grp.userData = { sinKey: 'sloth', basePos: new THREE.Vector3(0, -3.6, -0.6) };

    const domeGeo = new THREE.SphereGeometry(1.3, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x818cf8,
      emissive: 0x4338ca,
      emissiveIntensity: 0.4,
      roughness: 0.1,
      transmission: 0.8,
      thickness: 1.2,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    grp.add(dome);

    const tentacles = [];
    const tentMat = new THREE.MeshBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.5
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pts = [];
      for (let j = 0; j <= 5; j++) {
        pts.push(new THREE.Vector3(
          1.0 * Math.cos(angle) + Math.sin(j * 0.5) * 0.1,
          -j * 0.55,
          1.0 * Math.sin(angle)
        ));
      }
      const tentMesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.03, 6, false),
        tentMat
      );
      tentMesh.userData = { angle, phase: i * 0.7 };
      tentacles.push(tentMesh);
      grp.add(tentMesh);
    }

    const hit = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData = { sinKey: 'sloth' };
    grp.add(hit);

    sinCreatures.sloth = { group: grp, dome, tentacles, hit };
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
  const points = [];
  pairs.forEach(([a, b]) => {
    if (sinCreatures[a] && sinCreatures[b]) {
      points.push(sinCreatures[a].group.position);
      points.push(sinCreatures[b].group.position);
    }
  });
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending
  });
  sinWebLines = new THREE.LineSegments(geo, mat);
  sinsGroup.add(sinWebLines);
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
// [虛無 Void] 四大指令 (完全保持未動)
// -------------------------------------------------------------
function triggerVoidDisperse() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  voidStateText.innerText = "✨ 崩解散逸：碎片與微粒極限擴散！";

  new TWEEN.Tween(voidMembrane.material).to({ opacity: 0.05 }, 600).start();
  new TWEEN.Tween(voidCore.scale).to({ x: 0.3, y: 0.3, z: 0.3 }, 500).easing(TWEEN.Easing.Quadratic.Out).start();

  voidShards.forEach((shard) => {
    const burstTarget = shard.userData.basePos.clone().multiplyScalar(3.2 + Math.random() * 1.5);
    new TWEEN.Tween(shard.position).to({ x: burstTarget.x, y: burstTarget.y, z: burstTarget.z }, 800).easing(TWEEN.Easing.Cubic.Out).start();
  });

  setTimeout(() => {
    voidStateText.innerText = "🧲 引力共振：概念重新聚合中...";

    voidShards.forEach((shard) => {
      new TWEEN.Tween(shard.position).to({ x: shard.userData.basePos.x, y: shard.userData.basePos.y, z: shard.userData.basePos.z }, 1200).easing(TWEEN.Easing.Elastic.Out).start();
    });

    new TWEEN.Tween(voidCore.scale).to({ x: 1, y: 1, z: 1 }, 1000).easing(TWEEN.Easing.Back.Out).start();

    new TWEEN.Tween(voidMembrane.material).to({ opacity: 0.45 }, 1000).onComplete(() => {
      isVoidActionRunning = false;
      voidStateText.innerText = "平穩呼吸・殘影共鳴中";
    }).start();
  }, 1600);
}

function triggerVoidDevour() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  voidStateText.innerText = "🌌 包覆吞噬：事象地平面擴張，空間捲曲...";

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
  voidStateText.innerText = "💠 共鳴同化：精神頻率同步，光譜躍遷！";

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

function triggerVoidTeleport() {
  if (isVoidActionRunning) return;
  isVoidActionRunning = true;
  voidStateText.innerText = "⚡ 維度瞬移：空間塌陷，折躍至鄰近座標！";

  new TWEEN.Tween(voidGroup.scale)
    .to({ x: 0.05, y: 3.5, z: 0.05 }, 350)
    .easing(TWEEN.Easing.Cubic.In)
    .onComplete(() => {
      const newX = (Math.random() - 0.5) * 5;
      const newY = (Math.random() - 0.5) * 3;
      const newZ = (Math.random() - 0.5) * 3;
      voidGroup.position.set(newX, newY, newZ);

      new TWEEN.Tween(voidGroup.scale).to({ x: 1, y: 1, z: 1 }, 450).easing(TWEEN.Easing.Back.Out).start();

      setTimeout(() => {
        new TWEEN.Tween(voidGroup.position)
          .to({ x: 0, y: 0, z: 0 }, 1000)
          .easing(TWEEN.Easing.Quadratic.InOut)
          .onComplete(() => {
            isVoidActionRunning = false;
            voidStateText.innerText = "平穩呼吸・殘影共鳴中";
          })
          .start();
      }, 700);
    })
    .start();
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
  if (stateText) stateText.innerText = "🩸 罪孽狂宴爆發！七大罪集體過載，振盪頻率飆升至 300%！";

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

function triggerSinsSwarm() {
  if (isSinsActionRunning) return;
  isSinsActionRunning = true;

  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "🌀 群聚向心漩渦！七大罪向生態中樞螺旋聚攏！";

  for (const key in sinCreatures) {
    const grp = sinCreatures[key].group;
    const base = grp.userData.basePos;
    const centerTarget = base.clone().multiplyScalar(0.35);
    new TWEEN.Tween(grp.position)
      .to({ x: centerTarget.x, y: centerTarget.y, z: centerTarget.z }, 1000)
      .easing(TWEEN.Easing.Back.In)
      .start();
  }

  setTimeout(() => {
    if (stateText) stateText.innerText = "引力平衡重組，七位一體回歸自然生態軌道...";
    for (const key in sinCreatures) {
      const grp = sinCreatures[key].group;
      const base = grp.userData.basePos;
      new TWEEN.Tween(grp.position)
        .to({ x: base.x, y: base.y, z: base.z }, 1200)
        .easing(TWEEN.Easing.Elastic.Out)
        .start();
    }
    setTimeout(() => {
      isSinsActionRunning = false;
      if (stateText) stateText.innerText = SINS_DATA[currentSelectedSin]?.state || "生態平衡・7 隻生命體共生共鳴中";
    }, 1300);
  }, 2200);
}

function triggerSinsTraits() {
  if (isSinsActionRunning) return;
  isSinsActionRunning = true;

  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "⚡ 各自專屬異態全面激發：傲慢昂冠・暴怒噴刺・貪婪搶奪・暴食開口！";

  if (sinCreatures.pride) {
    new TWEEN.Tween(sinCreatures.pride.crownGroup.scale).to({ x: 1.6, y: 1.6, z: 1.6 }, 600).yoyo(true).repeat(1).start();
  }
  if (sinCreatures.greed) {
    new TWEEN.Tween(sinCreatures.greed.core.scale).to({ x: 0.5, y: 0.5, z: 0.5 }, 500).yoyo(true).repeat(1).start();
  }
  if (sinCreatures.wrath) {
    new TWEEN.Tween(sinCreatures.wrath.spikesGroup.scale).to({ x: 1.8, y: 1.8, z: 1.8 }, 400).yoyo(true).repeat(1).start();
  }
  if (sinCreatures.gluttony) {
    sinCreatures.gluttony.maws.forEach(m => {
      new TWEEN.Tween(m.scale).to({ x: 2.0, y: 1.0, z: 2.0 }, 700).yoyo(true).repeat(1).start();
    });
  }
  if (sinCreatures.lust) {
    new TWEEN.Tween(sinCreatures.lust.helixGroup.scale).to({ x: 1.5, y: 1.5, z: 1.5 }, 800).yoyo(true).repeat(1).start();
  }
  if (sinCreatures.sloth) {
    new TWEEN.Tween(sinCreatures.sloth.group.position).to({ y: -4.5 }, 800).yoyo(true).repeat(1).start();
  }

  setTimeout(() => {
    isSinsActionRunning = false;
    if (stateText) stateText.innerText = SINS_DATA[currentSelectedSin]?.state || "生態平衡・7 隻生命體共生共鳴中";
  }, 2500);
}

function triggerSinsBalance() {
  const stateText = document.getElementById('sin-state-text');
  if (stateText) stateText.innerText = "⚖️ 生態平衡調和：群落共生張力重置，回歸協和律動";

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

function onShameHoverEnter() {
  isHovered = true;
  targetShameFactor = 1.0;

  shameStateText.innerText = "⚠️ 被碰到了！極度羞恥，花瓣全面解體散開！";
  shameStateText.classList.add('ashamed');

  new TWEEN.Tween(shameCore.scale).to({ x: 0.45, y: 0.45, z: 0.45 }, 250).easing(TWEEN.Easing.Back.In).start();
  new TWEEN.Tween(shameCore.material.emissive).to({ r: 1.0, g: 0.05, b: 0.2 }, 200).start();
}

function onShameHoverLeave() {
  isHovered = false;
  targetShameFactor = 0.0;

  shameStateText.innerText = "視線移開... 安全了，小心翼翼重新組合";
  shameStateText.classList.remove('ashamed');

  new TWEEN.Tween(shameCore.scale).to({ x: 1.0, y: 1.0, z: 1.0 }, 900).easing(TWEEN.Easing.Back.Out).start();
  new TWEEN.Tween(shameCore.material.emissive).to({ r: 0.74, g: 0.07, b: 0.24 }, 800).start();
}

// -------------------------------------------------------------
// 5. 三大物種切換與介面動態化
// -------------------------------------------------------------
function setSpecies(species) {
  currentSpecies = species;

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
    tabLove.classList.add('active', 'love-theme');
    hudHeader.classList.add('love-theme');
    loveInfo.classList.add('love-theme');
    loveInfo.style.display = 'flex';
    actionsPanel.classList.add('love-theme');
    loveActions.style.display = 'flex';
    hudFooter.classList.add('love-theme');
    categoryBadge.classList.add('love-theme');

    categoryBadge.innerText = "正・正向情緒陣營";
    speciesTitle.innerHTML = '精神概念體：<span>愛（LOVE）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 強效同化・生命熾熱燃燒與共鳴之核";
    document.getElementById('panel-title').innerText = "愛・行為與能量指令";
    hoverHintText.innerHTML = '💡 <b>點擊指令</b>：測試同化、覓食與能量衰減機制';

    if (mainLight) mainLight.color.setHex(0xf59e0b);
    if (backLight) backLight.color.setHex(0xec4899);

    updateLoveEnergyUI();
  } else if (species === 'shame') {
    shameGroup.visible = true;
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
    speciesTitle.innerHTML = '精神概念體：<span>羞恥（SHAME）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 視覺迴避與脆弱防禦之核";
    document.getElementById('panel-title').innerText = "羞恥行為指令";
    hoverHintText.innerHTML = '💡 <b>游標碰觸</b>：可直接觸發羞恥解體';

    if (mainLight) mainLight.color.setHex(0xf43f5e);
    if (backLight) backLight.color.setHex(0xa855f7);

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
    speciesTitle.innerHTML = '精神概念體：<span>虛無（VOID）</span>';
    speciesSubtitle.innerText = "人類消失 5000 年後 ｜ 秩序、平靜、遺忘與中立之核";
    document.getElementById('panel-title').innerText = "虛無行為指令";
    hoverHintText.innerHTML = '💡 <b>點擊指令</b>：可測試虛無 4 大動態能力';

    if (mainLight) mainLight.color.setHex(0x7c3aed);
    if (backLight) backLight.color.setHex(0x06b6d4);

    voidStateText.innerText = "平穩呼吸・殘影共鳴中";
  } else if (species === 'sins') {
    if (sinsGroup) sinsGroup.visible = true;
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
    speciesTitle.innerHTML = '群居共生體：<span>七大罪生態系（SEVEN DEADLY SINS）</span>';
    speciesSubtitle.innerText = "深層意識群落 ｜ 相互寄生・制衡共鳴之七位一體生物圈";
    document.getElementById('panel-title').innerText = "七大罪生態指令";
    hoverHintText.innerHTML = '💡 <b>點擊生物或標籤</b>：可切換焦點對焦與測試群落生態反應';

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
    targetShameFactor = 1.0;
    isHovered = true;
    onShameHoverEnter();
  });

  document.getElementById('btn-shame-reassemble').addEventListener('click', () => {
    targetShameFactor = 0.0;
    isHovered = false;
    onShameHoverLeave();
  });

  document.getElementById('btn-shame-flush').addEventListener('click', () => {
    isFlushed = !isFlushed;
    shameStateText.innerText = isFlushed ? "😳 情緒激烈泛紅中！" : "情緒逐漸平復...";
    shamePetals.forEach(p => {
      new TWEEN.Tween(p.material.color)
        .to(isFlushed ? { r: 1.0, g: 0.1, b: 0.3 } : { r: 1.0, g: 0.79, b: 0.83 }, 400)
        .start();
    });
  });

  // [虛無 按鈕]
  document.getElementById('btn-void-disperse').addEventListener('click', triggerVoidDisperse);
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
  const btnSinsTraits = document.getElementById('btn-sins-traits');
  if (btnSinsTraits) btnSinsTraits.addEventListener('click', triggerSinsTraits);
  const btnSinsBalance = document.getElementById('btn-sins-balance');
  if (btnSinsBalance) btnSinsBalance.addEventListener('click', triggerSinsBalance);

  // 重置攝影機
  document.getElementById('btn-reset-cam').addEventListener('click', () => {
    if (currentSpecies === 'sins') {
      selectSin('all', true);
    } else {
      new TWEEN.Tween(camera.position).to({ x: 0, y: 2.5, z: 15 }, 800).easing(TWEEN.Easing.Cubic.Out).start();
      controls.target.set(0, 0, 0);
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

  TWEEN.update();
  controls.update();

  if (currentSpecies === 'love') {
    // 【愛】心跳律動 (雙拍心跳 Lub-Dub：磅...磅... 磅...磅...)
    const heartBeatSpeed = 1.5 + loveEnergy * 2.5; // 能量充沛心跳快，枯竭時緩慢
    const rawSin = Math.sin(elapsedTime * heartBeatSpeed);
    const lubDub = Math.pow(Math.max(0, rawSin), 4) * 0.18 + Math.pow(Math.max(0, Math.sin(elapsedTime * heartBeatSpeed + 0.5)), 4) * 0.1;
    const heartScale = 1.0 + lubDub * loveEnergy;

    if (!isLoveAssimilating) {
      loveCore.scale.set(heartScale, heartScale, heartScale);
      loveAura.scale.set(heartScale * 1.3, heartScale * 1.3, heartScale * 1.3);
    }

    // 光絲如火焰與觸鬚舒展起伏
    loveFilaments.forEach((fil, idx) => {
      fil.rotation.y += fil.userData.rotSpeed;
      const wave = Math.sin(elapsedTime * 2.5 + fil.userData.wavePhase) * 0.08 * loveEnergy;
      fil.scale.set(1 + wave, 1 + wave * 1.2, 1 + wave);
    });

    // 冠瓣起伏
    lovePetals.forEach((petal, idx) => {
      const openAngle = Math.sin(elapsedTime * 2 + idx * 0.3) * 0.15;
      petal.rotation.z = Math.PI / 4 + openAngle * (0.4 + loveEnergy * 0.6);
    });

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

    loveGroup.rotation.y += 0.004;

  } else if (currentSpecies === 'shame') {
    // 【羞恥】解體因子內插
    const lerpSpeed = targetShameFactor > shameDisassembleFactor ? 0.18 : 0.055;
    shameDisassembleFactor += (targetShameFactor - shameDisassembleFactor) * lerpSpeed;

    const breath = 1.0 + Math.sin(elapsedTime * 2.2) * 0.06;
    if (!isHovered) {
      shameCore.scale.set(breath, breath, breath);
    }
    shameAura.scale.set(breath * 1.15, breath * 1.15, breath * 1.15);

    shamePetals.forEach((petal) => {
      const currentPos = new THREE.Vector3().lerpVectors(
        petal.userData.closedPos,
        petal.userData.scatterPos,
        shameDisassembleFactor
      );

      if (shameDisassembleFactor > 0.05) {
        const jitter = Math.sin(elapsedTime * 30 + petal.userData.jitterSeed) * 0.08 * shameDisassembleFactor;
        currentPos.x += jitter;
        currentPos.y += jitter;

        petal.rotation.x = THREE.MathUtils.lerp(petal.userData.baseRot.x, petal.userData.scatterRot.x, shameDisassembleFactor);
        petal.rotation.y = THREE.MathUtils.lerp(petal.userData.baseRot.y, petal.userData.scatterRot.y, shameDisassembleFactor);
        petal.rotation.z = THREE.MathUtils.lerp(petal.userData.baseRot.z, petal.userData.scatterRot.z, shameDisassembleFactor);
      } else {
        petal.rotation.copy(petal.userData.baseRot);
      }

      petal.position.copy(currentPos);
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

    voidShards.forEach((shard) => {
      if (!isVoidActionRunning) {
        shard.userData.angle += shard.userData.orbitSpeed;
        const x = shard.userData.radius * Math.cos(shard.userData.angle);
        const z = shard.userData.radius * Math.sin(shard.userData.angle);
        const y = shard.userData.yBase + Math.sin(elapsedTime * shard.userData.bobSpeed) * 0.35;
        shard.position.set(x, y, z);
        shard.rotation.x += 0.02;
        shard.rotation.y += 0.025;
      }
    });

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
  } else if (currentSpecies === 'sins') {
    // 【七大罪群居生態】群體與個別生命體運動
    const frenzyMult = isSinsFrenzy ? 2.8 : 1.0;

    // 1. 傲慢 (Pride)
    if (sinCreatures.pride) {
      const p = sinCreatures.pride;
      p.halo1.rotation.z += 0.012 * frenzyMult;
      p.halo2.rotation.y -= 0.018 * frenzyMult;
      p.crownGroup.rotation.y += 0.008 * frenzyMult;
      p.core.rotation.y += 0.006;
      const b = Math.sin(elapsedTime * 2.0) * 0.05 * frenzyMult + 1.0;
      p.core.scale.set(b, b, b);
      p.group.position.y = p.group.userData.basePos.y + Math.sin(elapsedTime * 1.5) * 0.15;
    }

    // 2. 貪婪 (Greed)
    if (sinCreatures.greed) {
      const g = sinCreatures.greed;
      g.core.rotation.y += 0.015 * frenzyMult;
      g.claws.forEach((claw, idx) => {
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
      g.group.position.y = g.group.userData.basePos.y + Math.sin(elapsedTime * 1.8 + 1) * 0.12;
    }

    // 3. 暴怒 (Wrath)
    if (sinCreatures.wrath) {
      const w = sinCreatures.wrath;
      const jitter = (Math.random() - 0.5) * (isSinsFrenzy ? 0.22 : 0.04);
      w.core.position.set(jitter, jitter, jitter);
      w.spikesGroup.rotation.y += 0.02 * frenzyMult;
      w.shockRing1.rotation.z += 0.03 * frenzyMult;
      const s1 = 1.0 + ((elapsedTime * 2.0) % 2.0) * 0.5;
      w.shockRing1.scale.set(s1, s1, s1);
      w.shockRing1.material.opacity = Math.max(0, 0.7 - ((elapsedTime * 2.0) % 2.0) * 0.35);
      w.group.position.y = w.group.userData.basePos.y + Math.sin(elapsedTime * 2.4 + 2) * 0.1;
    }

    // 4. 嫉妒 (Envy)
    if (sinCreatures.envy) {
      const e = sinCreatures.envy;
      e.knot.rotation.x += 0.012 * frenzyMult;
      e.knot.rotation.y += 0.016 * frenzyMult;
      if (sinCreatures.pride) {
        e.eye.lookAt(sinCreatures.pride.group.position);
      }
      e.group.position.y = e.group.userData.basePos.y + Math.sin(elapsedTime * 1.6 + 3) * 0.14;
    }

    // 5. 慾 (Lust)
    if (sinCreatures.lust) {
      const l = sinCreatures.lust;
      l.helixGroup.rotation.y += 0.018 * frenzyMult;
      l.petals.forEach((pet, idx) => {
        const petBreath = Math.sin(elapsedTime * 2.5 + idx * 0.4) * 0.18 * frenzyMult;
        pet.rotation.z = Math.PI / 4 + petBreath;
      });
      l.group.position.y = l.group.userData.basePos.y + Math.sin(elapsedTime * 2.0 + 4) * 0.12;
    }

    // 6. 暴食 (Gluttony)
    if (sinCreatures.gluttony) {
      const gt = sinCreatures.gluttony;
      gt.sac.rotation.z += 0.005;
      gt.maws.forEach((m, idx) => {
        const gulp = Math.sin(elapsedTime * 3.0 + m.userData.offset) * 0.22 * frenzyMult;
        m.scale.set(1 + gulp, 1, 1 + gulp);
      });
      gt.group.position.y = gt.group.userData.basePos.y + Math.sin(elapsedTime * 1.4 + 5) * 0.15;
    }

    // 7. 怠慢 (Sloth)
    if (sinCreatures.sloth) {
      const sl = sinCreatures.sloth;
      const breath = Math.sin(elapsedTime * 0.6) * 0.25;
      sl.dome.scale.set(1 + breath * 0.1, 1 - breath * 0.1, 1 + breath * 0.1);
      sl.tentacles.forEach(tent => {
        tent.rotation.z = Math.sin(elapsedTime * 0.8 + tent.userData.phase) * 0.09;
        tent.rotation.x = Math.cos(elapsedTime * 0.7 + tent.userData.phase) * 0.07;
      });
      sl.group.position.y = sl.group.userData.basePos.y + Math.sin(elapsedTime * 0.7) * 0.2;
    }

    // 共生連線微光波動
    if (sinWebLines) {
      sinWebLines.material.opacity = 0.2 + Math.sin(elapsedTime * 2.2) * 0.12 * frenzyMult;
    }

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

    // 整體群落生態緩慢偏航旋轉
    sinsGroup.rotation.y += 0.0018 * frenzyMult;
  }

  renderer.render(scene, camera);
}
