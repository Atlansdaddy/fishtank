import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Procedural fish builder.
// A fish is a Group with an x-axis body (nose at +x, tail at -x). The body is a
// lofted superellipse tube whose vertices carry a normalized head->tail coord
// (aT: 1 at nose, 0 at tail) used by a vertex-shader travelling wave, plus a
// side sign (aSide) used by the fragment shader to paint patterns. We inject
// undulation + patterns + iridescence into a real MeshStandardMaterial via
// onBeforeCompile, so we keep three.js PBR lighting ("stylized photorealism").
// ---------------------------------------------------------------------------

const PATTERN_ID = {
  none: 0, stripesV: 1, stripesH: 2, lateralStripe: 3, spots: 4,
  clownBands: 5, patches: 6, gradientTail: 7, eyespot: 8,
};

// Body profile control points: [t, halfHeight, halfWidth]; t=0 tail, t=1 nose.
// Values are fractions of body length L. Smoothly interpolated.
const PROFILES = {
  torpedo:   { L: 6.0, hh: [[0,.02],[.12,.14],[.5,.20],[.82,.15],[1,.03]], hw: [[0,.015],[.5,.10],[1,.03]] },
  angelfish: { L: 5.0, hh: [[0,.04],[.15,.34],[.45,.46],[.7,.30],[1,.06]], hw: [[0,.01],[.5,.055],[1,.02]] },
  discus:    { L: 5.2, hh: [[0,.05],[.2,.42],[.5,.5],[.78,.34],[1,.07]], hw: [[0,.02],[.5,.09],[1,.03]] },
  tang:      { L: 5.4, hh: [[0,.03],[.18,.30],[.5,.36],[.8,.24],[1,.05]], hw: [[0,.015],[.5,.075],[1,.025]] },
  clown:     { L: 4.2, hh: [[0,.03],[.2,.20],[.5,.25],[.8,.19],[1,.06]], hw: [[0,.02],[.5,.11],[1,.035]] },
  gourami:   { L: 5.2, hh: [[0,.03],[.2,.22],[.5,.27],[.8,.20],[1,.05]], hw: [[0,.015],[.5,.075],[1,.025]] },
  livebearer:{ L: 3.8, hh: [[0,.03],[.2,.15],[.55,.19],[.85,.13],[1,.04]], hw: [[0,.015],[.5,.07],[1,.02]] },
  betta:     { L: 4.4, hh: [[0,.04],[.2,.18],[.55,.22],[.85,.16],[1,.05]], hw: [[0,.02],[.5,.085],[1,.03]] },
  cory:      { L: 4.0, hh: [[0,.03],[.25,.16],[.55,.20],[.85,.15],[1,.06]], hw: [[0,.02],[.5,.12],[1,.04]] },
  pleco:     { L: 6.5, hh: [[0,.02],[.25,.13],[.6,.16],[.9,.14],[1,.07]], hw: [[0,.02],[.5,.13],[1,.05]] },
  loach:     { L: 6.0, hh: [[0,.02],[.3,.10],[.6,.12],[.9,.10],[1,.04]], hw: [[0,.015],[.5,.08],[1,.03]] },
  eel:       { L: 9.0, hh: [[0,.015],[.3,.06],[.6,.07],[.9,.06],[1,.03]], hw: [[0,.01],[.5,.05],[1,.02]] },
  shark:     { L: 7.0, hh: [[0,.02],[.15,.15],[.5,.20],[.82,.15],[1,.04]], hw: [[0,.015],[.5,.10],[1,.03]] },
  puffer:    { L: 4.0, hh: [[0,.05],[.25,.32],[.5,.40],[.78,.30],[1,.08]], hw: [[0,.04],[.5,.30],[1,.07]] },
  boxfish:   { L: 3.6, hh: [[0,.06],[.3,.30],[.6,.32],[.9,.24],[1,.10]], hw: [[0,.06],[.5,.28],[1,.09]] },
  goby:      { L: 4.0, hh: [[0,.03],[.2,.14],[.5,.16],[.82,.12],[1,.06]], hw: [[0,.02],[.5,.10],[1,.04]] },
  lionfish:  { L: 5.0, hh: [[0,.04],[.2,.22],[.5,.26],[.8,.20],[1,.10]], hw: [[0,.03],[.5,.13],[1,.05]] },
  seahorse:  { L: 5.0, hh: [[0,.05],[.3,.16],[.6,.14],[.85,.10],[1,.08]], hw: [[0,.03],[.5,.09],[1,.04]] },
  goldfish:  { L: 4.6, hh: [[0,.04],[.2,.30],[.5,.36],[.78,.26],[1,.07]], hw: [[0,.03],[.5,.20],[1,.05]] },
  cichlid:   { L: 5.0, hh: [[0,.03],[.18,.24],[.5,.30],[.8,.22],[1,.06]], hw: [[0,.02],[.5,.11],[1,.035]] },
};

function sample(points, t) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      const s = f * f * (3 - 2 * f); // smoothstep
      return a[1] + (b[1] - a[1]) * s;
    }
  }
  return points[points.length - 1][1];
}

function buildBodyGeometry(prof, heightMul, widthMul) {
  const RINGS = 30, SEG = 16;
  const L = prof.L;
  const pos = [], norm = [], uv = [], aT = [], aSide = [];
  const idx = [];
  const ringPts = [];
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    const x = (t - 0.5) * L;
    const hh = sample(prof.hh, t) * L * heightMul;
    const hw = sample(prof.hw, t) * L * widthMul;
    const ring = [];
    for (let j = 0; j <= SEG; j++) {
      const a = (j / SEG) * Math.PI * 2;
      // superellipse-ish cross section, slightly flattened top/bottom
      const cy = Math.sin(a), cz = Math.cos(a);
      const y = cy * hh;
      const z = cz * hw;
      ring.push(new THREE.Vector3(x, y, z));
      pos.push(x, y, z);
      uv.push(t, j / SEG);
      aT.push(t);
      aSide.push(Math.sign(cz) || 0);
      norm.push(0, cy, cz); // refined below
    }
    ringPts.push(ring);
  }
  const stride = SEG + 1;
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A thin fin membrane in a plane, given an outline (array of [x,y]).
function finGeometry(outline, thickness = 0.02) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

const _wave = `
  float phase = aT * waveLen - time * waveSpeed;
  float amp = mix(0.0, tailAmp, pow(1.0 - aT, 1.6)) * swim;
  float headYaw = (1.0 - aT) * 0.0;
  transformed.z += sin(phase) * amp * bodyLen;
  transformed.x += cos(phase) * amp * bodyLen * 0.12;
  // gentle breathing / roll
  transformed.y += sin(time * 1.3 + aT * 2.0) * 0.004 * bodyLen;
`;

export function makeFishMaterial(spec, palette) {
  const c = spec.colors;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(c.base),
    roughness: 0.32,
    metalness: 0.0,
    envMapIntensity: 1.1,
  });
  const uniforms = {
    time: { value: 0 },
    swim: { value: 1 },
    waveLen: { value: 6.5 },
    waveSpeed: { value: 7.0 },
    tailAmp: { value: 0.10 },
    bodyLen: { value: 1 },
    baseCol: { value: new THREE.Color(c.base) },
    bellyCol: { value: new THREE.Color(c.belly || c.base) },
    patCol: { value: new THREE.Color(c.patternColor || c.fin || '#ffffff') },
    patId: { value: PATTERN_ID[c.pattern] ?? 0 },
    patScale: { value: c.patternScale ?? 1.0 },
    irid: { value: c.iridescence ?? 0.2 },
    sick: { value: 0 },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = `
      attribute float aT; attribute float aSide;
      varying float vT; varying float vSide; varying vec2 vUvF; varying vec3 vViewN;
      uniform float time, swim, waveLen, waveSpeed, tailAmp, bodyLen;
    ` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vT=aT; vSide=aSide; vUvF=uv;\n' + _wave
    ).replace(
      '#include <defaultnormal_vertex>',
      '#include <defaultnormal_vertex>\n vViewN = normalize(transformedNormal);'
    );
    sh.fragmentShader = `
      varying float vT; varying float vSide; varying vec2 vUvF; varying vec3 vViewN;
      uniform vec3 baseCol, bellyCol, patCol; uniform float patId, patScale, irid, sick;
      float band(float x, float c, float w){ return smoothstep(w, 0.0, abs(x-c)); }
    ` + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        vec3 col = baseCol;
        // belly gradient (ventral counter-shading)
        float ventral = smoothstep(0.15, -0.15, sin(vUvF.y * 6.2831));
        col = mix(col, bellyCol, ventral * 0.6);
        float u = vUvF.x, v = vUvF.y;
        float p = 0.0;
        int id = int(patId + 0.5);
        if(id==1){ p = step(0.5, fract(u * 7.0 * patScale)); }                       // stripesV
        else if(id==2){ p = step(0.5, fract(v * 6.0 * patScale)); }                  // stripesH
        else if(id==3){ p = band(fract(v*1.0)-0.5, 0.0, 0.10) ; }                    // lateralStripe (mid flank)
        else if(id==4){ float g=8.0*patScale; p = step(0.78, sin(u*g)*0.5+0.5) * step(0.78, sin(v*g*0.8)*0.5+0.5); } // spots
        else if(id==5){ p = band(u,0.16,0.06)+band(u,0.5,0.07)+band(u,0.84,0.06); }  // clownBands
        else if(id==6){ p = step(0.6, sin(u*4.0*patScale)*sin(v*3.0)*0.5+0.5); }     // patches
        else if(id==7){ p = smoothstep(0.25,0.0,u); }                               // gradientTail (tail darkening)
        else if(id==8){ p = band(u,0.12,0.05)*band(v,0.5,0.08); }                    // eyespot near tail
        col = mix(col, patCol, clamp(p,0.0,1.0));
        // iridescent fresnel shimmer
        float fres = pow(1.0 - abs(dot(normalize(vViewN), vec3(0.0,0.0,1.0))), 3.0);
        vec3 shimmer = vec3(0.4,0.7,1.0);
        col += fres * irid * shimmer * 0.6;
        // sickness desaturates + pales
        float g2 = dot(col, vec3(0.299,0.587,0.114));
        col = mix(col, vec3(g2)*1.1, sick*0.7);
        diffuseColor.rgb *= 0.0; diffuseColor.rgb += col;
      }`
    );
  };
  return mat;
}

const _tmpOutline = {
  caudalRound: [[0,0],[-0.9,0.7],[-1.2,0.35],[-1.25,0],[-1.2,-0.35],[-0.9,-0.7]],
  caudalFork:  [[0,0],[-1.3,0.9],[-0.7,0.15],[-0.7,-0.15],[-1.3,-0.9]],
  caudalFan:   [[0,0],[-1.4,1.2],[-1.5,0],[-1.4,-1.2]],
  caudalLunate:[[0,0],[-1.6,1.0],[-1.0,0.2],[-1.0,-0.2],[-1.6,-1.0]],
};

function caudalStyle(spec) {
  const a = spec.archetype;
  if (a === 'betta' || a === 'goldfish') return { o: 'caudalFan', s: spec.shape?.finFlow ? 1.7 : 1.5 };
  if (a === 'tang' || a === 'shark') return { o: 'caudalLunate', s: 1.1 };
  if (a === 'torpedo' || a === 'livebearer' || a === 'cichlid') return { o: 'caudalFork', s: 1.0 };
  if (a === 'angelfish' || a === 'discus') return { o: 'caudalRound', s: 1.2 };
  return { o: 'caudalRound', s: 1.0 };
}

export function buildFish(spec, palette) {
  const prof = PROFILES[spec.archetype] || PROFILES.torpedo;
  const heightMul = (spec.shape?.height ?? 1) * 1.0;
  const widthMul = 1.0;
  const bodyGeo = buildBodyGeometry(prof, heightMul, widthMul);
  const mat = makeFishMaterial(spec, palette);
  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo, mat);
  body.castShadow = true;
  group.add(body);

  const L = prof.L;
  const finMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.colors.fin || spec.colors.base),
    roughness: 0.45, metalness: 0, transparent: true, opacity: 0.86,
    side: THREE.DoubleSide,
  });
  // share undulation-free but time-driven sway on CPU

  // caudal (tail) fin
  const cs = caudalStyle(spec);
  const finScale = L * 0.28 * cs.s * (spec.shape?.finFlow ?? 1);
  const caudal = new THREE.Mesh(finGeometry(_tmpOutline[cs.o]), finMat);
  caudal.scale.setScalar(finScale);
  caudal.position.x = -L * 0.5;
  caudal.castShadow = true;
  group.add(caudal);

  // dorsal fin (top), height varies by archetype
  const dorsalTall = ['tang', 'lionfish', 'angelfish', 'gourami', 'betta', 'shark', 'cichlid'].includes(spec.archetype);
  const dorsal = new THREE.Mesh(
    finGeometry([[ -L*0.28,0],[ -L*0.05,(dorsalTall?0.32:0.14)*L],[ L*0.18,(dorsalTall?0.28:0.12)*L],[ L*0.28,0]]),
    finMat
  );
  dorsal.rotation.x = Math.PI / 2;
  dorsal.position.y = sample(prof.hh, 0.5) * L * heightMul * 0.95;
  group.add(dorsal);

  // anal fin (bottom)
  const anal = new THREE.Mesh(
    finGeometry([[ -L*0.2,0],[ -L*0.02,-(0.14)*L],[ L*0.12,-(0.10)*L],[ L*0.2,0]]),
    finMat
  );
  anal.rotation.x = Math.PI / 2;
  anal.position.y = -sample(prof.hh, 0.5) * L * heightMul * 0.9;
  group.add(anal);

  // pectoral fins (paddling) — two, near the head
  const pecOutline = spec.archetype === 'lionfish'
    ? [[0,0],[-0.2,0.9],[-0.5,1.3],[-0.75,0.8],[-0.7,0],[-0.6,-0.7],[-0.3,-0.5]]
    : [[0,0],[-0.15,0.5],[-0.55,0.55],[-0.7,0.1],[-0.5,-0.25]];
  const pecScale = L * 0.16 * (spec.archetype === 'lionfish' ? 2.0 : 1);
  const pecL = new THREE.Mesh(finGeometry(pecOutline), finMat);
  const pecR = new THREE.Mesh(finGeometry(pecOutline), finMat);
  for (const [p, s] of [[pecL, 1], [pecR, -1]]) {
    p.scale.set(pecScale, pecScale, pecScale);
    p.position.set(L * 0.22, -L * 0.02, s * sample(prof.hw, 0.35) * L * 0.9);
    p.rotation.y = s * 0.5;
    group.add(p);
  }

  // eyes
  const eyeGeo = new THREE.SphereGeometry(L * 0.035, 10, 10);
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.15, metalness: 0.1 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeWhite);
    eye.position.set(L * 0.42, L * 0.05, s * sample(prof.hw, 0.85) * L * 0.85);
    group.add(eye);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(L * 0.012, 6, 6), glint);
    gl.position.set(L * 0.44, L * 0.07, s * sample(prof.hw, 0.85) * L * 0.85);
    group.add(gl);
  }

  // set body length uniform for shader amplitude scaling
  mat.userData.uniforms.bodyLen.value = L;
  mat.userData.uniforms.waveSpeed.value = 6.0 + (spec.speed || 1) * 3.0;

  group.userData = {
    mat, caudal, pecL, pecR, dorsal, anal, L,
    caudalRest: caudal.rotation.z,
  };
  // overall scale from spec size + a real-ish size cue from adult length
  const worldScale = (spec.size || 1) * (0.75 + Math.min(1.6, (spec.adultSizeCm || 5) / 12));
  group.scale.setScalar(worldScale);
  group.userData.worldScale = worldScale;
  return group;
}

// Per-frame visual update for a fish group (called by behavior).
export function animateFishVisual(group, dt, t, swim, turnRate) {
  const u = group.userData;
  u.mat.userData.uniforms.time.value = t;
  u.mat.userData.uniforms.swim.value = swim;
  // tail fin sways opposite/behind body wave
  const beat = 6.0 + swim * 6.0;
  u.caudal.rotation.y = Math.sin(t * beat) * 0.5 * (0.3 + swim);
  // pectorals paddle; faster when hovering (low swim) to hold station
  const paddle = Math.sin(t * (5.0 + (1 - swim) * 4.0));
  u.pecL.rotation.z = 0.3 + paddle * 0.45;
  u.pecR.rotation.z = -0.3 - paddle * 0.45;
  // bank into turns
  const bank = THREE.MathUtils.clamp(-turnRate * 6.0, -0.6, 0.6);
  group.children[0].rotation.x = bank;
  u.dorsal.rotation.z = Math.sin(t * beat * 0.5) * 0.06;
}
