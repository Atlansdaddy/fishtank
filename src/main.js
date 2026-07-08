import * as THREE from 'three';
import { TANK, BOUNDS, WATER_THEMES, FOODS, SIM } from './constants.js';
import { buildTank } from './tank.js';
import { buildFish } from './fishbuilder.js';
import { buildInvert } from './invertbuilder.js';
import { CareSim } from './sim.js';
import { Sound } from './audio.js';
import { Notify } from './notify.js';
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
camera.position.set(0, TANK.H * 0.52, TANK.D * 1.18);
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

// ---- day/night driven by the real clock: dawn 6-8, day, dusk 19-21, night ----
let hourOverride = null;                 // test hook
function rawDayFactor() {
  const d = new Date();
  const h = hourOverride ?? (d.getHours() + d.getMinutes() / 60);
  if (h < 6 || h >= 21) return 0;
  if (h < 8) return (h - 6) / 2;
  if (h < 19) return 1;
  return 1 - (h - 19) / 2;
}
let df = rawDayFactor();                 // smoothed day factor, 1=day 0=night
const dayNight = {
  sunDay: new THREE.Color(0xffffff), sunNight: new THREE.Color(0x7fa8e0),
  fogDay: new THREE.Color(), fogNight: new THREE.Color(),
  bgDay: new THREE.Color(), bgNight: new THREE.Color(),
};
function refreshThemeColors() {
  const th = WATER_THEMES[sim.state.current];
  dayNight.fogDay.set(th.fogColor); dayNight.fogNight.set(th.fogColor).multiplyScalar(0.16);
  dayNight.bgDay.set(th.deep); dayNight.bgNight.set(th.deep).multiplyScalar(0.14);
}

// ---- world systems ----
const tankView = buildTank(scene, renderer);
let fogBase = WATER_THEMES.fresh.fogDensity;
const sim = new CareSim(SPECIES);
const snd = new Sound();
const notify = new Notify(sim);
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
  const isInv = (spec.kind || 'fish') === 'invert';
  const obj = isInv ? buildInvert(spec) : buildFish(spec, WATER_THEMES[sim.state.current]);
  if (!isInv) obj.userData.mat.envMapIntensity = 1.0;
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
    snd.drop();
    ui.toast(`${FOODS[type].emoji} ${FOODS[type].name} dropped!`, 1600);
  },
  onBuy: (spec) => {
    if (!sim.spendCoins(spec.price)) { ui.toast('Not enough coins!'); return; }
    const rec = sim.addFish(spec);
    const a = makeAgent(rec); if (a) swarm.add(a);
    sim.save(); ui.refreshHUD();
    snd.coin();
    ui.toast(`Welcome, your new baby ${spec.common}! 🎉`, 2400);
    if (rec.newSpecies) {
      sim.addCoins(5);
      setTimeout(() => { ui.toast('📖 New species discovered! +5🪙 — check your Fish Book!', 3400); snd.chime(); ui.refreshHUD(); }, 2600);
    }
  },
  onWaterChange: () => { sim.waterChange(); sim.save(); ui.refreshHUD(); ui.toast('💧 Fresh, clean water!'); },
  onScrub: () => { sim.scrubAlgae(1); sim.save(); ui.refreshHUD(); ui.toast('🧽 Sparkling glass!'); },
  onSwitchTank: () => switchTank(sim.state.current === 'fresh' ? 'salt' : 'fresh'),
  onFitView: () => fitWholeTank(),
  soundOn: snd.enabled,
  onToggleSound: () => snd.toggle(),
  remindersOn: notify.enabled && notify.granted,
  onToggleReminders: async () => {
    if (notify.enabled && notify.granted) { notify.disable(); ui.toast('🔕 Reminders off'); return false; }
    const r = await notify.enable();
    if (r.ok) { ui.toast("🔔 Reminders on — we'll nudge you when the fish need care!", 3600); notify.updateBadge(); }
    else if (r.why === 'denied') ui.toast('⚠️ Notifications are blocked for this app — allow them in Settings.', 4200);
    else ui.toast('⚠️ This browser can\'t do notifications — use the installed app.', 3800);
    return r.ok;
  },
  onBackup: async () => {
    const data = sim.exportSave();
    const name = `habitat-save-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const file = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Habitat tank backup' });
        ui.toast('💾 Backup shared — keep it somewhere safe!', 3200);
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ui.toast('💾 Backup downloaded!', 3200);
  },
  onRestore: () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        if (sim.importSave(await f.text())) {
          switchTank(sim.state.current);
          ui.toast('📂 Tank restored! Welcome back, fish! 🐠', 3800);
        } else ui.toast("⚠️ That file isn't a Habitat backup.", 3200);
      } catch (e) { ui.toast('⚠️ Could not read that file.', 3200); }
    };
    inp.click();
  },
  onRename: (id, name) => { const f = sim._index.get(id); if (f) { f.name = name; sim.save(); } },
});

function switchTank(which) {
  if (typeof clearSurprises === 'function') clearSurprises();
  sim.switchTank(which);
  tankView.setTheme(which);
  refreshThemeColors();
  fogBase = WATER_THEMES[which].fogDensity;
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
const bootT = Date.now();
const hadSave = sim.load();
if (!hadSave) {
  seedTank('fresh'); seedTank('salt');
  sim.state.current = 'fresh'; sim._reindex();
  sim.save();
}
// ask the browser to treat our storage as precious (Chrome honors, iOS ignores)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Fish Book backfill: everything currently owned counts as discovered
sim.state.discovered ??= [];
for (const which of ['fresh', 'salt'])
  for (const f of sim.state.tanks[which].fish)
    if (!sim.state.discovered.includes(f.sp)) sim.state.discovered.push(f.sp);

// offline decay + welcome-back coins
const offlineHours = sim.applyOffline();
tankView.setTheme(sim.state.current);
refreshThemeColors();
fogBase = WATER_THEMES[sim.state.current].fogDensity;
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
    const grown = evs.filter(e => e.type === 'grown');
    const births = evs.filter(e => e.type === 'birth');
    if (evs.some(e => e.type === 'death')) {
      const names = evs.filter(e => e.type === 'death').map(e => e.name);
      ui.toast(`😢 While you were gone, ${names.slice(0,2).join(' & ')}${names.length>2?' and others':''} didn't make it. Keep your tank healthy!`, 5200);
    } else if (births.length) {
      ui.toast(`🍼 Surprise! Your ${births[0].name}s had babies while you were away!`, 5000);
    } else if (grown.length) {
      ui.toast(`🎉 ${grown.slice(0,2).map(e => e.name).join(' & ')}${grown.length>2?' and others':''} grew up while you were away!`, 4600);
    } else if (earned > 0) {
      ui.toast(`👋 Welcome back! Your fish were happy and earned you ${earned}🪙`, 4200);
    }
    swarm.triggerFeedingRush();
  }, 900);
} else {
  swarm.triggerFeedingRush();
}
ui.refreshHUD();

// localStorage came up empty: quietly check the IndexedDB mirror before the
// kid sees a fresh tank he didn't ask for. (Mirror writes stay locked until
// this settles, so the fresh seed can't clobber a real old backup.)
if (hadSave) {
  sim.unlockMirror();
} else {
  sim.restoreFromMirror(bootT - 4000).then((ok) => {
    if (ok) { switchTank(sim.state.current); ui.refreshHUD(); ui.toast('💾 Your tank was restored from a device backup!', 4200); }
  });
}
// gentle nudge if there's no recent manual backup
setTimeout(() => {
  const lb = sim.state.lastBackup || 0;
  if (Date.now() - lb > 14 * 864e5 && sim.tank.fish.length > 0)
    ui.toast('💾 Tip: tap Care → Backup Tank now and then, so your fish are never lost!', 5200);
}, 12000);

// ---- camera controller: pinch zoom, drag orbit, tap-to-follow ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const cam = {
  az: 0, el: 0.12,
  radius: 130, targetRadius: 130,
  minR: 13, fitR: 200,                 // fitR recomputed in resize() to frame the whole tank
  target: new THREE.Vector3(0, TANK.H * 0.5, 0),
  look: new THREE.Vector3(0, TANK.H * 0.5, 0),
  follow: null,
};
const pointers = new Map();            // pointerId -> {x,y}
let pinchPrev = 0, gestureMulti = false, gestureMoved = 0, gestureStart = null;

canvas.addEventListener('pointerdown', (e) => {
  snd.unlock();                          // mobile audio needs a user gesture
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { gestureMoved = 0; gestureMulti = false; gestureStart = { x: e.clientX, y: e.clientY }; }
  if (pointers.size === 2) { gestureMulti = true; pinchPrev = pinchDistance(); }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  gestureMoved += Math.abs(dx) + Math.abs(dy);

  if (pointers.size >= 2) {             // pinch to zoom
    const d = pinchDistance();
    if (pinchPrev > 0) cam.targetRadius = THREE.MathUtils.clamp(cam.targetRadius * (pinchPrev / d), cam.minR, cam.fitR);
    pinchPrev = d;
    return;
  }
  // single finger: wipe algae if dirty, else orbit
  if (sim.summary().algae > 0.2) {
    sim.scrubAlgae(0.015); spawnSparkle(e.clientX, e.clientY); ui.refreshHUD();
  } else {
    cam.az = THREE.MathUtils.clamp(cam.az + dx * 0.006, -1.2, 1.2);
    cam.el = THREE.MathUtils.clamp(cam.el - dy * 0.005, -0.25, 0.75);
  }
});
function endPointer(e) {
  const had = pointers.has(e.pointerId);
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchPrev = 0;
  if (had && pointers.size === 0 && !gestureMulti && gestureMoved < 10 && gestureStart)
    tapSelect(gestureStart.x, gestureStart.y);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {   // desktop / trackpad zoom
  e.preventDefault();
  cam.targetRadius = THREE.MathUtils.clamp(cam.targetRadius * (1 + Math.sign(e.deltaY) * 0.12), cam.minR, cam.fitR);
}, { passive: false });

function pinchDistance() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

// Tap: select+follow+zoom an animal, or tap empty water to release & frame the tank.
function tapSelect(px, py) {
  ndc.x = (px / innerWidth) * 2 - 1; ndc.y = -(py / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  // surprises (treasure, molts, eggs) grab the tap first
  const sObjs = surprises.list.filter(s => s.obj).map(s => s.obj);
  if (sObjs.length) {
    const sHits = raycaster.intersectObjects(sObjs, true);
    if (sHits.length) {
      let o = sHits[0].object;
      while (o && !o.userData.surprise) o = o.parent;
      const s = surprises.list.find(x => x.obj === o);
      if (s) { openSurprise(s, px, py); return; }
    }
  }
  const hits = raycaster.intersectObjects(swarm.agents.map(a => a.obj), true);
  if (hits.length) {
    let o = hits[0].object;
    while (o && !o.userData.agentRef) o = o.parent;
    if (o && o.userData.agentRef) {
      const a = o.userData.agentRef;
      cam.follow = a;
      const size = a.obj.userData.worldScale * (a.bodyCm || 5);
      cam.targetRadius = THREE.MathUtils.clamp(size * 3.2 + 10, cam.minR, 46);  // zoom in on it
      const rec = sim._index.get(a.instId);
      if (rec) { ui.showFishCard(rec, SPECIES[rec.sp]); a.startle = 0.4; snd.chime(); }
      else if (a.visitor) { ui.showSpeciesFacts(SPECIES[a.spec.id]); a.startle = 0.4; snd.chime(); }
    }
  } else {
    cam.follow = null;                  // tapped empty water: stop following
    ui.hideFishCard();
  }
}
function fitWholeTank() { cam.follow = null; cam.targetRadius = cam.fitR; cam.el = 0.12; ui.hideFishCard(); }

// ---- surprise events: rare, unannounced, variable — the boredom killers ----
const surprises = { list: [], timer: 45 + Math.random() * 60 };

function chestMesh() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a26, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 3.4), wood); base.position.y = 1.3; g.add(base);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5, 10, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2; lid.position.y = 2.6; g.add(lid);
  const band = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.5, 3.5), trim); band.position.y = 2.0; g.add(band);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  glow.position.y = 3.4; g.add(glow); g.userData.glow = glow;
  for (const c of g.children) c.castShadow = true;
  return g;
}
function moltMesh() {
  const m = new THREE.MeshStandardMaterial({ color: 0xfff1ea, transparent: true, opacity: 0.55, roughness: 0.3, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.45, 8, 12, Math.PI * 1.15), m);
  body.rotation.z = -0.5; body.position.y = 1.0; g.add(body);
  return g;
}
function eggsMesh() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xfff8f0, transparent: true, opacity: 0.85, roughness: 0.35 });
  for (let i = 0; i < 8; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), m);
    e.position.set(Math.cos(i * 2.4) * 0.7, Math.sin(i * 1.7) * 0.7, (i % 3) * 0.25);
    g.add(e);
  }
  return g;
}
function addSurprise(kind, obj, extra = {}) {
  if (obj) { obj.userData.surprise = true; scene.add(obj); }
  surprises.list.push({ kind, obj, ...extra });
}
function spawnTreasure() {
  const c = chestMesh();
  c.position.set(THREE.MathUtils.randFloat(BOUNDS.minX + 8, BOUNDS.maxX - 8), TANK.SAND_H, THREE.MathUtils.randFloat(BOUNDS.minZ + 6, BOUNDS.maxZ - 6));
  c.rotation.y = Math.random() * 6;
  addSurprise('treasure', c, { ttl: 150, coins: 10 + Math.floor(Math.random() * 31) });
}
function spawnMolt() {
  const shrimp = swarm.agents.find(a => a.spec.archetype === 'shrimp');
  if (!shrimp) return;
  const s = moltMesh();
  s.position.set(shrimp.pos.x + 3, TANK.SAND_H, shrimp.pos.z);
  addSurprise('molt', s, { ttl: 200, coins: 5, name: sim._index.get(shrimp.instId)?.name || 'Your shrimp' });
  ui.toast(`🦐 ${sim._index.get(shrimp.instId)?.name || 'Your shrimp'} molted its shell!`, 3000);
}
function spawnSnailEggs() {
  const snail = swarm.agents.find(a => a.spec.archetype === 'snail');
  if (!snail) return;
  const e = eggsMesh();
  e.position.set(THREE.MathUtils.randFloat(BOUNDS.minX + 8, BOUNDS.maxX - 8), 14 + Math.random() * 16, TANK.D / 2 - 1.6);
  addSurprise('eggs', e, { ttl: 100 + Math.random() * 80, spec: snail.spec });
  ui.toast('🥚 Snail eggs appeared on the glass!', 3000);
}
function spawnVisitor() {
  const water = sim.state.current;
  const pool = ALL.filter(s => s.water === water && (s.kind || 'fish') === 'fish' && !s.predator);
  if (!pool.length) return;
  const spec = pool[Math.floor(Math.random() * pool.length)];
  const obj = buildFish(spec, WATER_THEMES[water]);
  obj.userData.mat.envMapIntensity = 1.0;
  const a = new Agent(spec, obj, 'visitor_' + Math.floor(Math.random() * 1e6));
  a._dietSet = new Set(spec.diet || ['flake']);
  a._schools = false;
  a._foodValue = () => 0.2;
  a.visitor = true;
  obj.userData.agentRef = a;
  swarm.add(a);
  addSurprise('visitor', null, { ttl: 55 + Math.random() * 35, agent: a, name: spec.common });
  ui.toast(`👀 A wild ${spec.common} is visiting your tank!`, 3400);
}
function rollSurprise() {
  const opts = [['treasure', 0.34], ['visitor', 0.28]];
  if (swarm.agents.some(a => a.spec.archetype === 'shrimp')) opts.push(['molt', 0.22]);
  if (swarm.agents.some(a => a.spec.archetype === 'snail')) opts.push(['eggs', 0.16]);
  let r = Math.random() * opts.reduce((s, o) => s + o[1], 0);
  for (const [k, w] of opts) { r -= w; if (r <= 0) return ({ treasure: spawnTreasure, molt: spawnMolt, eggs: spawnSnailEggs, visitor: spawnVisitor })[k](); }
}
function openSurprise(s, px, py) {
  if (s.kind === 'treasure') {
    sim.addCoins(s.coins); sim.save();
    ui.toast(`💰 Treasure! +${s.coins}🪙`, 3200); snd.coin();
    for (let i = 0; i < 6; i++) setTimeout(() => spawnSparkle(px + (Math.random() - 0.5) * 60, py + (Math.random() - 0.5) * 60), i * 70);
    removeSurprise(s); ui.refreshHUD();
  } else if (s.kind === 'molt') {
    sim.addCoins(s.coins); sim.save();
    ui.toast(`🦐 An empty shell! Shrimp shed their shells to grow. +${s.coins}🪙`, 4200); snd.chime();
    removeSurprise(s); ui.refreshHUD();
  } else if (s.kind === 'eggs') {
    ui.toast('🥚 Snail eggs — keep watching, they hatch soon!', 3000);
  }
}
function removeSurprise(s) {
  if (s.obj) scene.remove(s.obj);
  surprises.list = surprises.list.filter(x => x !== s);
}
function expireSurprise(s) {
  if (s.kind === 'eggs') {
    if (sim.capacityLeft() >= (s.spec.bioload || 1)) {
      const rec = sim.addFish(s.spec);
      rec.growth = 0.15;
      const a = makeAgent(rec); if (a) swarm.add(a);
      sim.save(); ui.refreshHUD();
      ui.toast('🐌 The snail eggs hatched — a free baby snail!', 4200); snd.coin();
    }
  } else if (s.kind === 'visitor') {
    if (s.agent.alive) swarm.remove(s.agent);
    ui.toast(`👋 The wild ${s.name} swam away…`, 2600);
  }
  removeSurprise(s);
}
function clearSurprises() {
  for (const s of [...surprises.list]) { if (s.obj) scene.remove(s.obj); if (s.kind === 'visitor' && s.agent.alive) swarm.remove(s.agent); }
  surprises.list = [];
}
// a treasure might be waiting when the app opens (variable reward on arrival)
if (Math.random() < 0.3) setTimeout(spawnTreasure, 3000);

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
  // Distance needed to frame the whole tank (worst of width/height fit, portrait or landscape)
  const vHalf = Math.tan((camera.fov * Math.PI / 180) / 2);
  const hHalf = vHalf * camera.aspect;
  const dV = (TANK.H * 0.62) / vHalf;
  const dW = (TANK.W * 0.60) / hHalf;
  cam.fitR = Math.min(320, Math.max(90, dV, dW) + 12);
  if (cam.targetRadius > cam.fitR) cam.targetRadius = cam.fitR;
}
addEventListener('resize', resize);
resize();
cam.radius = cam.targetRadius = cam.fitR;   // start framed on the whole tank

// ---- persistence on background ----
let saveTimer = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { sim.save(); notify.updateBadge(); notify.markSeen(); }
  else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
});
addEventListener('pagehide', () => { sim.save(); notify.updateBadge(); });

// ---- main loop ----
const clock = new THREE.Clock();
let hudTimer = 0, dayTimer = 0;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  // day/night lighting: dim to blue moonlight after dark, warm up at dawn
  df += (rawDayFactor() - df) * Math.min(1, dt * 0.8);
  sun.intensity = 0.18 + 2.0 * df;
  sun.color.copy(dayNight.sunNight).lerp(dayNight.sunDay, df);
  hemi.intensity = 0.14 + 0.56 * df;
  fill.intensity = 0.12 + 0.38 * df;
  if (scene.fog) scene.fog.color.copy(dayNight.fogNight).lerp(dayNight.fogDay, df);
  if (scene.background && scene.background.isColor)
    scene.background.copy(dayNight.bgNight).lerp(dayNight.bgDay, df);
  swarm.nightFactor = 1 - df;
  if (tankView.setDay) tankView.setDay(df);

  const rotting = food.update(dt);
  sim.update(dt, rotting);
  swarm.update(dt, t);
  tankView.update(t);

  // surprise events: occasional rolls, glow pulses, lifetimes
  surprises.timer -= dt;
  if (surprises.timer <= 0) {
    surprises.timer = 100 + Math.random() * 140;
    if (surprises.list.length < 2) rollSurprise();
  }
  for (const s of [...surprises.list]) {
    s.ttl -= dt;
    const glow = s.obj?.userData?.glow;
    if (glow) glow.scale.setScalar(1 + Math.sin(t * 3) * 0.3);
    if (s.ttl <= 0) expireSurprise(s);
  }

  // decor sway
  for (const c of decorGroup.children) if (c.userData.sway !== undefined) c.rotation.z = Math.sin(t * 0.8 + c.userData.sway) * 0.12;

  // deaths during play
  const evs = sim.drainEvents();
  if (evs.length) {
    const dead = sim.reapDead();
    for (const id of dead) { const a = swarm.agents.find(x => x.instId === id); if (a) swarm.remove(a); }
    for (const e of evs) {
      if (e.type === 'death') { ui.toast(`😢 ${e.name} has died. Check your water and feed your fish!`, 4200); snd.sad(); notify.event('😢 Sad news in your tank', `${e.name} has died. Check the water!`); }
      else if (e.type === 'grown') { ui.toast(`🎉 ${e.name} is all grown up!`, 3600); snd.coin(); }
      else if (e.type === 'birth') {
        for (const id of e.ids) { const rec = sim._index.get(id); if (rec) { const a = makeAgent(rec); if (a) swarm.add(a); } }
        ui.toast(`🍼 Your ${e.name}s had ${e.ids.length === 1 ? 'a baby' : e.ids.length + ' babies'}!!`, 4600);
        snd.coin(); sim.save(); ui.refreshHUD();
        notify.event('🍼 Babies!!', `Your ${e.name}s just had ${e.ids.length === 1 ? 'a baby' : e.ids.length + ' babies'}!`);
      }
    }
    ui.refreshHUD();
  }

  // camera: orbit around the followed animal or the tank centre; smooth zoom
  if (cam.follow && cam.follow.alive) cam.target.copy(cam.follow.pos);
  else { cam.follow = null; cam.target.set(0, TANK.H * 0.5, 0); }
  cam.look.lerp(cam.target, cam.follow ? 0.12 : 0.05);
  cam.radius += (cam.targetRadius - cam.radius) * 0.10;
  const az = cam.az + (cam.follow ? 0 : Math.sin(t * 0.05) * 0.05);
  const ce = Math.cos(cam.el);
  camera.position.set(
    cam.look.x + Math.sin(az) * cam.radius * ce,
    cam.look.y + Math.sin(cam.el) * cam.radius + (cam.follow ? 0 : Math.sin(t * 0.08) * 1.2),
    cam.look.z + Math.cos(az) * cam.radius * ce
  );
  camera.lookAt(cam.look);
  // thin the fog when zoomed out so the whole tank is visible, thicken up close
  if (scene.fog) scene.fog.density = fogBase * THREE.MathUtils.clamp(70 / cam.radius, 0.32, 1.35);

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
window.__tank = { sim, swarm, food, SPECIES, switchTank, ui, cam, camera, fitWholeTank,
  setHour: (h) => { hourOverride = h; }, dayFactor: () => df,
  surprises, spawn: { treasure: spawnTreasure, molt: spawnMolt, eggs: spawnSnailEggs, visitor: spawnVisitor } };
