import * as THREE from 'three';
import { TANK, BOUNDS, WATER_THEMES, FOODS, SIM } from './constants.js';
import { buildTank } from './tank.js';
import { buildFish } from './fishbuilder.js';
import { CareSim } from './sim.js';
import { FoodSystem } from './food.js';
import { Swarm, Agent } from './behavior.js';
import { UI } from './ui.js';
import { FRESHWATER_SPECIES } from './species/freshwater.js';
import { SALTWATER_SPECIES } from './species/saltwater.js';
import { INVERT_SPECIES } from './species/inverts.js';

const ALL = [...FRESHWATER_SPECIES, ...SALTWATER_SPECIES, ...INVERT_SPECIES];
const SPECIES = {}; for (const s of ALL) SPECIES[s.id] = s;

const STARTERS = {
  fresh: [['neon_tetra',7],['guppy',3],['bronze_corydoras',3],['bristlenose_pleco',1],['dwarf_gourami',1],['cherry_shrimp',3]],
  salt:  [['ocellaris_clownfish',2],['green_chromis',4],['royal_gramma',1],['yellow_watchman_goby',1],['skunk_cleaner_shrimp',1]],
};

// ---- renderer / scene ----
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
Object.assign(document.body.style, { margin: '0', overflow: 'hidden', background: '#02110f' });
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
camera.position.set(0, TANK.H * 0.52, TANK.D * 1.65);
const camTarget = new THREE.Vector3(0, TANK.H * 0.45, 0);

// ---- lights ----
const hemi = new THREE.HemisphereLight(0xbfe8ff, 0x143025, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-20, 120, 30); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 10; sun.shadow.camera.far = 260;
sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
sun.shadow.bias = -0.0008;
scene.add(sun);
const fill = new THREE.PointLight(0x8fdcff, 0.5, 400); fill.position.set(30, 30, 60); scene.add(fill);

// simple procedural env for subtle reflections on fish
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.background = new THREE.Color(0x0a3040);
const envLight = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 16), new THREE.MeshBasicMaterial({ color: 0x6fbfe0, side: THREE.BackSide }));
envScene.add(envLight);
scene.environment = pmrem.fromScene(envScene, 0.04).texture;

// ---- world systems ----
const tankView = buildTank(scene, renderer);
const sim = new CareSim();
const food = new FoodSystem(scene);
const swarm = new Swarm(scene, sim, food);

// ---- decor: rocks & plants per tank type ----
let decorGroup = new THREE.Group(); scene.add(decorGroup);
function buildDecor(type) {
  decorGroup.clear();
  const rockMat = new THREE.MeshStandardMaterial({ color: type === 'fresh' ? 0x5a5148 : 0x6b5d52, roughness: 1 });
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + Math.random() * 6, 0), rockMat);
    r.position.set((Math.random() - 0.5) * TANK.W * 0.8, TANK.SAND_H + Math.random() * 2, (Math.random() - 0.5) * TANK.D * 0.7);
    r.scale.y = 0.6 + Math.random() * 0.5; r.rotation.set(Math.random(), Math.random(), Math.random());
    r.castShadow = r.receiveShadow = true; decorGroup.add(r);
  }
  if (type === 'fresh') {
    const plantMat = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) {
      const h = 8 + Math.random() * 22;
      const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h, 1, 5), plantMat);
      blade.position.set((Math.random() - 0.5) * TANK.W * 0.9, TANK.SAND_H + h / 2, (Math.random() - 0.5) * TANK.D * 0.8);
      blade.rotation.y = Math.random() * 6; blade.userData.sway = Math.random() * 6;
      decorGroup.add(blade);
    }
  } else {
    const colors = [0xd06a8a, 0xe0a24a, 0x8a6fd0, 0x4ac0b0];
    for (let i = 0; i < 14; i++) {
      const coralMat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 });
      const coral = new THREE.Mesh(new THREE.ConeGeometry(2 + Math.random() * 3, 6 + Math.random() * 12, 6, 1, true), coralMat);
      coral.position.set((Math.random() - 0.5) * TANK.W * 0.85, TANK.SAND_H + 4, (Math.random() - 0.5) * TANK.D * 0.75);
      coral.castShadow = true; decorGroup.add(coral);
    }
  }
}

// ---- agent (fish) spawning for the active tank ----
function makeAgent(rec) {
  const spec = SPECIES[rec.sp]; if (!spec) return null;
  const obj = buildFish(spec, WATER_THEMES[sim.state.current]);
  obj.userData.mat.envMapIntensity = 1.0;
  const a = new Agent(spec, obj, rec.id);
  a._dietSet = new Set(spec.diet || ['flake']);
  a._schools = (spec.kind || 'fish') === 'fish' && (spec.schooling === 'tight' || spec.minSchool >= 4);
  a._foodValue = (type) => (FOODS[type]?.value || 0.3) * (a._dietSet.has(type) ? 1.4 : 0.5);
  obj.userData.agentRef = a;
  return a;
}
function rebuildAgents() {
  for (const a of [...swarm.agents]) swarm.remove(a);
  for (const rec of sim.tank.fish) { const a = makeAgent(rec); if (a) swarm.add(a); }
}

swarm.onEaten = (pred, prey) => {
  sim.removeFishById(prey.instId);
  ui.toast(`🦈 The ${SPECIES[pred.spec.id].common} ate a ${SPECIES[prey.spec.id].common}!`, 3200);
};

// ---- UI wiring ----
const ui = new UI({
  sim, food, swarm, speciesMap: SPECIES, allSpecies: ALL,
  onDropFood: (type) => {
    food.drop(type, camTarget.x, 0);
    swarm.triggerFeedingRush();
    ui.toast(`${FOODS[type].emoji} ${FOODS[type].name} dropped!`, 1600);
  },
  onBuy: (spec) => {
    if (!sim.spendCoins(spec.price)) { ui.toast('Not enough coins!'); return; }
    const rec = sim.addFish(spec);
    const a = makeAgent(rec); if (a) swarm.add(a);
    sim.save(); ui.refreshHUD();
    ui.toast(`Welcome, your new ${spec.common}! 🎉`, 2400);
  },
  onWaterChange: () => { sim.waterChange(); sim.save(); ui.refreshHUD(); ui.toast('💧 Fresh, clean water!'); },
  onScrub: () => { sim.scrubAlgae(1); sim.save(); ui.refreshHUD(); ui.toast('🧽 Sparkling glass!'); },
  onSwitchTank: () => switchTank(sim.state.current === 'fresh' ? 'salt' : 'fresh'),
  onRename: (id, name) => { const f = sim._index.get(id); if (f) { f.name = name; sim.save(); } },
});

function switchTank(which) {
  sim.switchTank(which);
  tankView.setTheme(which);
  buildDecor(which);
  rebuildAgents();
  ui.refreshHUD(); ui.closePanels();
  ui.toast(which === 'fresh' ? '🌿 Freshwater tank' : '🐚 Saltwater tank');
  sim.save();
}

// ---- first run / load ----
function seedTank(which) {
  const prev = sim.state.current; sim.switchTank(which);
  for (const [id, n] of STARTERS[which]) { const sp = SPECIES[id]; if (sp) for (let i = 0; i < n; i++) sim.addFish(sp); }
  sim.switchTank(prev);
}
if (!sim.load()) {
  seedTank('fresh'); seedTank('salt');
  sim.state.current = 'fresh'; sim._reindex();
  sim.save();
}

// offline decay + welcome-back coins
const offlineHours = sim.applyOffline();
tankView.setTheme(sim.state.current);
buildDecor(sim.state.current);
rebuildAgents();

// reap any deaths that happened while away, per tank
function reapAllTanks(announce) {
  const prev = sim.state.current;
  for (const which of ['fresh', 'salt']) {
    sim.switchTank(which);
    const dead = sim.reapDead();
    if (dead.length && announce && which === prev) for (const id of dead) {/* handled by events */}
  }
  sim.switchTank(prev); rebuildAgents();
}
if (offlineHours > 0.2) {
  const s = sim.summary();
  const days = offlineHours / 24;
  const earned = Math.max(0, Math.round(days * SIM.COINS_PER_GOOD_DAY * s.avgHealth));
  if (earned > 0) { sim.addCoins(earned); }
  const evs = sim.drainEvents();
  reapAllTanks(true);
  setTimeout(() => {
    if (evs.some(e => e.type === 'death')) {
      const names = evs.filter(e => e.type === 'death').map(e => e.name);
      ui.toast(`😢 While you were gone, ${names.slice(0,2).join(' & ')}${names.length>2?' and others':''} didn't make it. Keep your tank healthy!`, 5200);
    } else if (earned > 0) {
      ui.toast(`👋 Welcome back! Your fish were happy and earned you ${earned}🪙`, 4200);
    }
    swarm.triggerFeedingRush();
  }, 900);
} else {
  swarm.triggerFeedingRush();
}
ui.refreshHUD();

// ---- input: tap to identify, drag to look / wipe glass ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let ptr = { down: false, x: 0, y: 0, moved: 0, startX: 0, startY: 0 };
let camAz = 0, camEl = 0; // orbit offsets

canvas.addEventListener('pointerdown', (e) => { ptr.down = true; ptr.x = ptr.startX = e.clientX; ptr.y = ptr.startY = e.clientY; ptr.moved = 0; });
canvas.addEventListener('pointermove', (e) => {
  if (!ptr.down) return;
  const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
  ptr.moved += Math.abs(dx) + Math.abs(dy);
  ptr.x = e.clientX; ptr.y = e.clientY;
  const s = sim.summary();
  if (s.algae > 0.2) {
    // wipe the glass — dragging clears algae where you rub
    sim.scrubAlgae(0.015);
    spawnSparkle(e.clientX, e.clientY);
    ui.refreshHUD();
  } else {
    camAz = THREE.MathUtils.clamp(camAz + dx * 0.005, -0.9, 0.9);
    camEl = THREE.MathUtils.clamp(camEl - dy * 0.004, -0.35, 0.5);
  }
});
canvas.addEventListener('pointerup', (e) => {
  ptr.down = false;
  if (ptr.moved < 8) tapIdentify(e.clientX, e.clientY);
});

function tapIdentify(px, py) {
  ndc.x = (px / innerWidth) * 2 - 1; ndc.y = -(py / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(swarm.agents.map(a => a.obj), true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.agentRef) o = o.parent;
    if (o && o.userData.agentRef) {
      const a = o.userData.agentRef;
      const rec = sim._index.get(a.instId);
      if (rec) { ui.showFishCard(rec, SPECIES[rec.sp]); a.startle = 0.6; }
    }
  }
}

// sparkle overlay for wiping feedback
const sparkleLayer = document.createElement('div');
Object.assign(sparkleLayer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 9, overflow: 'hidden' });
document.body.appendChild(sparkleLayer);
let lastSparkle = 0;
function spawnSparkle(x, y) {
  const now = performance.now(); if (now - lastSparkle < 40) return; lastSparkle = now;
  const s = document.createElement('div');
  s.textContent = '✨';
  Object.assign(s.style, { position: 'absolute', left: x - 10 + 'px', top: y - 10 + 'px', fontSize: '20px', transition: 'opacity .5s, transform .5s', opacity: '1' });
  sparkleLayer.appendChild(s);
  requestAnimationFrame(() => { s.style.opacity = '0'; s.style.transform = 'translateY(-16px) scale(1.4)'; });
  setTimeout(() => s.remove(), 550);
}

// ---- resize ----
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---- persistence on background ----
let saveTimer = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden) sim.save(); });
addEventListener('pagehide', () => sim.save());

// ---- main loop ----
const clock = new THREE.Clock();
let hudTimer = 0, dayTimer = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  const rotting = food.update(dt);
  sim.update(dt, rotting);
  swarm.update(dt, t);
  tankView.update(t);

  // decor sway
  for (const c of decorGroup.children) if (c.userData.sway !== undefined) c.rotation.z = Math.sin(t * 0.8 + c.userData.sway) * 0.12;

  // deaths during play
  const evs = sim.drainEvents();
  if (evs.length) {
    const dead = sim.reapDead();
    for (const id of dead) { const a = swarm.agents.find(x => x.instId === id); if (a) swarm.remove(a); }
    for (const e of evs) if (e.type === 'death') ui.toast(`😢 ${e.name} has died. Check your water and feed your fish!`, 4200);
    ui.refreshHUD();
  }

  // camera: base + gentle auto drift + user orbit
  const az = camAz + Math.sin(t * 0.06) * 0.06;
  const rad = TANK.D * 1.65;
  camera.position.x = Math.sin(az) * rad;
  camera.position.z = Math.cos(az) * rad;
  camera.position.y = TANK.H * 0.5 + camEl * 40 + Math.sin(t * 0.08) * 1.5;
  camera.lookAt(camTarget);

  // periodic HUD refresh + coin trickle for good care
  hudTimer += dt; if (hudTimer > 1.2) { hudTimer = 0; ui.refreshHUD(); }
  dayTimer += dt;
  if (dayTimer > 60) { // ~1 in-game day of foreground play
    dayTimer = 0;
    const s = sim.summary();
    if (s.avgHealth > 0.6 && s.count > 0) { sim.addCoins(Math.round(SIM.COINS_PER_GOOD_DAY * s.avgHealth)); ui.refreshHUD(); }
    sim.save();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// expose a little for debugging
window.__tank = { sim, swarm, food, SPECIES, switchTank };
