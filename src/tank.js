import * as THREE from 'three';
import { TANK, WATER_THEMES } from './constants.js';

// Builds the aquarium: glass box, water volume with animated surface + caustics,
// sand bed, back wall, and reusable decor. Returns handles for per-frame updates.

export function buildTank(scene, renderer) {
  const group = new THREE.Group();
  scene.add(group);

  // ----- Sand bed with gentle dunes -----
  const sandGeo = new THREE.PlaneGeometry(TANK.W, TANK.D, 64, 64);
  sandGeo.rotateX(-Math.PI / 2);
  const p = sandGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const h = Math.sin(x * 0.09) * Math.cos(z * 0.11) * 0.8
            + Math.sin(x * 0.31 + z * 0.2) * 0.35;
    p.setY(i, h);
  }
  sandGeo.computeVertexNormals();
  const sandMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.position.y = 0;
  sand.receiveShadow = true;
  group.add(sand);

  // ----- Back & side inner walls (subtle, dark, for depth) -----
  const backMat = new THREE.MeshStandardMaterial({ color: 0x0a1a1f, roughness: 1, metalness: 0, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(TANK.W, TANK.H * 2, TANK.D), backMat);
  box.position.y = TANK.H * 0.6;
  group.add(box);

  // ----- Water volume (a big box we view through; fog does the depth tint) -----
  // Water surface plane with animated ripples + refraction-ish normal shimmer.
  const surfGeo = new THREE.PlaneGeometry(TANK.W, TANK.D, 48, 48);
  surfGeo.rotateX(-Math.PI / 2);
  const surfMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8c8, transparent: true, opacity: 0.28,
    roughness: 0.08, metalness: 0.0, side: THREE.DoubleSide,
  });
  surfMat.userData.uniforms = { time: { value: 0 } };
  surfMat.onBeforeCompile = (sh) => {
    sh.uniforms.time = surfMat.userData.uniforms.time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float w = sin(position.x*0.25 + time*1.6)*0.4 + cos(position.z*0.3 + time*1.1)*0.4
               + sin((position.x+position.z)*0.15 + time*0.8)*0.3;
       transformed.y += w;`
    );
  };
  const surface = new THREE.Mesh(surfGeo, surfMat);
  surface.position.y = TANK.WATER_LEVEL;
  group.add(surface);

  // ----- Caustics: an animated light-pattern projected onto sand -----
  const causticMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.14,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  causticMat.userData.uniforms = { time: { value: 0 } };
  causticMat.onBeforeCompile = (sh) => {
    sh.uniforms.time = causticMat.userData.uniforms.time;
    sh.fragmentShader = 'uniform float time;\n' + sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       vec2 uv = vMapUv * 8.0;
       float c = 0.0;
       for(int i=0;i<3;i++){
         float fi = float(i);
         vec2 q = uv + vec2(sin(time*0.7+fi), cos(time*0.6+fi*1.7))*1.5;
         float d = sin(q.x + time) * sin(q.y + time*0.9);
         c += smoothstep(0.7, 1.0, d);
       }
       diffuseColor.rgb *= 1.0; diffuseColor.a *= clamp(c,0.0,1.0);`
    );
  };
  // caustics need a uv-mapped surface; give the plane a map placeholder
  causticMat.map = whiteTex();
  const causticGeo = new THREE.PlaneGeometry(TANK.W, TANK.D);
  causticGeo.rotateX(-Math.PI / 2);
  const caustics = new THREE.Mesh(causticGeo, causticMat);
  caustics.position.y = 1.2;
  group.add(caustics);

  // ----- Glass front edges (thin frames + faint front pane sheen) -----
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.4, metalness: 0.6 });
  addFrame(group, frameMat);

  // Floating particles (marine snow / micro-bubbles) for water presence
  const motes = buildMotes();
  group.add(motes);

  return {
    group, sand, sandMat, surface, surfMat, caustics, causticMat, motes,
    setTheme(waterType) {
      const th = WATER_THEMES[waterType];
      scene.fog = new THREE.FogExp2(th.fogColor, th.fogDensity);
      scene.background = new THREE.Color(th.deep);
      sandMat.color.set(th.sand);
      surfMat.color.set(th.surface);
      backMat.color.set(th.deep).multiplyScalar(0.7);
    },
    update(t) {
      surfMat.userData.uniforms.time.value = t;
      causticMat.userData.uniforms.time.value = t;
      const mp = motes.geometry.attributes.position;
      for (let i = 1; i < mp.count * 3; i += 3) {
        // slow upward drift, wrap
        motes.geometry.attributes.position.array[i] += 0.02 + 0.01 * Math.sin(t + i);
        if (motes.geometry.attributes.position.array[i] > TANK.WATER_LEVEL) motes.geometry.attributes.position.array[i] = 2;
      }
      mp.needsUpdate = true;
    },
  };
}

function whiteTex() {
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2);
  const t = new THREE.CanvasTexture(c); return t;
}

function addFrame(group, mat) {
  const t = 1.4, W = TANK.W + 2, H = TANK.H, D = TANK.D + 2;
  const bar = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); group.add(m);
  };
  for (const yy of [0.5, H - 0.5]) {
    bar(W, t, t, 0, yy, D / 2); bar(W, t, t, 0, yy, -D / 2);
    bar(t, t, D, W / 2, yy, 0); bar(t, t, D, -W / 2, yy, 0);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
    bar(t, H, t, sx * W / 2, H / 2, sz * D / 2);
}

function buildMotes() {
  const N = 220;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.sin(i * 12.9) * 43758.5) % 1 * TANK.W - TANK.W / 2;
    pos[i * 3 + 1] = ((Math.cos(i * 4.1) * 2371.3) % 1 + 1) % 1 * TANK.WATER_LEVEL;
    pos[i * 3 + 2] = (Math.sin(i * 78.2) * 1257.1) % 1 * TANK.D - TANK.D / 2;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xcfe8dd, size: 0.5, transparent: true, opacity: 0.35,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(g, m);
}
