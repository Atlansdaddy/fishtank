// Species portraits — renders each species' REAL 3D model to a tiny snapshot
// so the shop / book / cards show exactly what swims in the tank (important
// for pre-readers: the picture IS the identification).
//
// Uses the game's own renderer via an offscreen render target — some browsers
// refuse a second WebGL context, and this is cheaper anyway. Render targets
// skip three's screen-only tone mapping + sRGB pass, so we apply ACES + sRGB
// ourselves when copying pixels out. Lazy: one portrait per animation frame,
// cached for the session.
import * as THREE from 'three';
import { buildFish } from './fishbuilder.js';
import { buildInvert } from './invertbuilder.js';
import { WATER_THEMES } from './constants.js';

// 2x the display size: cheap supersampling instead of MSAA, whose render-
// target readback support varies across browsers.
const W = 384, H = 264;
const cache = new Map();          // species id -> dataURL
const queue = [];                 // [{spec, cbs:[fn]}]
const pending = new Map();        // species id -> queue entry
let R = null, scene, camera, rt, buf, cv, ctx;

// Call once at startup with the game's renderer.
export function initPortraits(renderer) { R = renderer; }

function ensure() {
  if (scene) return;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x2a3a4a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x88ccff, 0.7); rim.position.set(-3, 1, -2); scene.add(rim);
  camera = new THREE.PerspectiveCamera(35, W / H, 0.01, 100);
  rt = new THREE.WebGLRenderTarget(W, H);
  buf = new Uint8Array(W * H * 4);
  cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  ctx = cv.getContext('2d');
}

// ACES filmic (Narkowicz fit) + sRGB transfer — approximates what three does
// on the way to the screen, so portraits match the tank.
const toneLUT = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) {
  const x = (i / 1023) * 1.05;                                   // toneMappingExposure
  const t = Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
  const s = t <= 0.0031308 ? t * 12.92 : 1.055 * Math.pow(t, 1 / 2.4) - 0.055;
  toneLUT[i] = Math.round(s * 255);
}

function snapshot(spec) {
  ensure();
  const isInv = (spec.kind || 'fish') === 'invert';
  const group = isInv ? buildInvert(spec) : buildFish(spec, WATER_THEMES[spec.water || 'fresh']);
  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getSize(new THREE.Vector3()).length() / 2;
  // fish: side-on 3/4 view (nose points +x); inverts: higher angle to show the shell/legs
  const dir = isInv ? new THREE.Vector3(0.55, 0.8, 0.9) : new THREE.Vector3(0.4, 0.18, 1);
  const dist = (r / Math.tan(THREE.MathUtils.degToRad(35 / 2))) * 1.12;
  camera.position.copy(c).addScaledVector(dir.normalize(), dist);
  camera.lookAt(c);

  const prevRT = R.getRenderTarget();
  const prevColor = new THREE.Color(); R.getClearColor(prevColor);
  const prevAlpha = R.getClearAlpha();
  R.setRenderTarget(rt);
  R.setClearColor(0x000000, 0);
  R.render(scene, camera);
  R.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  R.setRenderTarget(prevRT);
  R.setClearColor(prevColor, prevAlpha);

  scene.remove(group);
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });

  // GL rows are bottom-up; flip while tone-mapping linear -> sRGB
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4, dst = y * W * 4;
    for (let x = 0; x < W * 4; x += 4) {
      img.data[dst + x]     = toneLUT[(buf[src + x] << 2) | 3];
      img.data[dst + x + 1] = toneLUT[(buf[src + x + 1] << 2) | 3];
      img.data[dst + x + 2] = toneLUT[(buf[src + x + 2] << 2) | 3];
      img.data[dst + x + 3] = buf[src + x + 3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

// If the first readback comes back fully transparent, this browser can't read
// render targets (some software GL stacks) — stop trying, keep placeholders.
let broken = false;
function blank() {
  for (let i = 3; i < buf.length; i += 64) if (buf[i] > 0) return false;
  return true;
}

let pumping = false;
function pump() {
  if (pumping) return; pumping = true;
  const step = () => {
    const item = queue.shift();
    if (!item) { pumping = false; return; }
    let url = cache.get(item.spec.id);
    if (!url && R && !broken) {
      try {
        url = snapshot(item.spec);
        if (blank()) { broken = true; url = null; queue.length = 0; console.warn('portraits: render-target readback unavailable, keeping placeholders'); }
        else cache.set(item.spec.id, url);
      }
      catch (e) { url = null; console.warn('portrait failed:', item.spec.id, e); }
    }
    pending.delete(item.spec.id);
    if (url) for (const cb of item.cbs) cb(url);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Get a portrait for a species; cb(dataURL) fires now (cached) or soon (queued).
export function portrait(spec, cb) {
  const hit = cache.get(spec.id);
  if (hit) { cb(hit); return; }
  const p = pending.get(spec.id);
  if (p) { p.cbs.push(cb); return; }
  const item = { spec, cbs: [cb] };
  pending.set(spec.id, item);
  queue.push(item);
  pump();
}
