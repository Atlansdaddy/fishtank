import * as THREE from 'three';

// Recognizable procedural invertebrate models. Fish geometry doesn't fit snails,
// shrimp, crabs, etc., so inverts get their own builder. Each returns a Group
// with userData.sway (a list of parts to gently animate) and userData.worldScale.

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.0, transparent: !!opts.opacity, opacity: opts.opacity ?? 1, side: opts.side || THREE.FrontSide });
}
const sph = (r, m) => new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), m);
const cyl = (rt, rb, h, m, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, m, seg = 8) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);

export function buildInvert(spec) {
  const g = new THREE.Group();
  const c = spec.colors;
  const base = c.base, accent = c.patternColor || c.fin || c.base, belly = c.belly || c.base;
  const sway = [];
  const A = spec.archetype;

  if (A === 'snail') {
    const foot = sph(1, mat(belly, { rough: 0.7 }));
    foot.scale.set(1.7, 0.42, 0.85); foot.position.y = 0.35; g.add(foot);
    const shell = sph(0.95, mat(accent, { rough: 0.35 }));
    shell.scale.set(1, 0.95, 0.72); shell.position.set(-0.35, 1.15, 0); g.add(shell);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.16, 8, 16), mat(base, { rough: 0.4 }));
    coil.position.copy(shell.position); coil.rotation.y = Math.PI / 2; g.add(coil);
    for (const s of [1, -1]) {                       // eye stalks
      const stalk = cyl(0.06, 0.08, 0.9, mat(belly));
      stalk.position.set(1.5, 0.8, s * 0.3); stalk.rotation.z = -0.5; g.add(stalk);
      const eye = sph(0.12, mat('#111'));
      eye.position.set(1.9, 1.15, s * 0.35); g.add(eye);
      sway.push({ mesh: stalk, axis: 'z', base: -0.5, amp: 0.18, spd: 1.3, ph: s });
    }
  }

  else if (A === 'shrimp') {
    const bodyMat = mat(base, { opacity: 0.92, rough: 0.4 });
    let px = 0, py = 0.6;
    for (let i = 0; i < 6; i++) {                    // curved segmented body
      const r = 0.55 * (1 - i * 0.11);
      const seg = sph(r, i === 5 ? mat(accent, { opacity: 0.92 }) : bodyMat);
      seg.position.set(px, py, 0); g.add(seg);
      px -= r * 1.2; py += i < 3 ? 0.12 : -0.16;     // arch up then curl tail down
    }
    const tail = cone(0.5, 0.7, mat(accent, { opacity: 0.9 })); // tail fan
    tail.position.set(px, py, 0); tail.rotation.z = Math.PI * 0.75; tail.scale.z = 1.6; g.add(tail);
    const head = sph(0.6, bodyMat); head.position.set(0.6, 0.55, 0); g.add(head);
    const eyeMat = mat('#111');
    for (const s of [1, -1]) { const e = sph(0.13, eyeMat); e.position.set(1.05, 0.75, s * 0.28); g.add(e); }
    for (const s of [1, -1]) {                       // long antennae
      const ant = cyl(0.03, 0.03, 3.2, mat(accent, { opacity: 0.8 }));
      ant.position.set(2.0, 0.9, s * 0.15); ant.rotation.z = 1.15; g.add(ant);
      sway.push({ mesh: ant, axis: 'z', base: 1.15, amp: 0.12, spd: 2.2, ph: s });
    }
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) { // swimmerets / legs
      const leg = cyl(0.03, 0.03, 0.5, bodyMat); leg.position.set(-0.1 - i * 0.35, 0.15, s * 0.3);
      leg.rotation.x = s * 0.5; g.add(leg);
    }
  }

  else if (A === 'crab') {
    const shell = sph(1, mat(base, { rough: 0.5 }));
    shell.scale.set(1.5, 0.55, 1.05); shell.position.y = 0.7; g.add(shell);
    const eyeMat = mat('#111');
    for (const s of [1, -1]) {
      const stalk = cyl(0.06, 0.06, 0.4, mat(base)); stalk.position.set(0.9, 1.0, s * 0.3); g.add(stalk);
      const e = sph(0.13, eyeMat); e.position.set(0.9, 1.25, s * 0.3); g.add(e);
    }
    for (const s of [1, -1]) {                       // claws
      const arm = cyl(0.12, 0.14, 0.9, mat(accent)); arm.position.set(1.1, 0.6, s * 1.0); arm.rotation.x = s * 0.5; g.add(arm);
      const claw = sph(0.35, mat(accent)); claw.scale.set(1.2, 0.7, 0.9); claw.position.set(1.7, 0.55, s * 1.25); g.add(claw);
      sway.push({ mesh: claw, axis: 'y', base: 0, amp: 0.25, spd: 3, ph: s });
    }
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) { // legs
      const leg = cyl(0.07, 0.07, 1.3, mat(base)); leg.position.set(-0.2 - i * 0.5, 0.35, s * 1.0);
      leg.rotation.x = s * 0.9; leg.rotation.z = 0.3; g.add(leg);
    }
  }

  else if (A === 'crayfish') {
    const bodyMat = mat(base, { rough: 0.45 });
    const body = cyl(0.45, 0.65, 2.4, bodyMat, 10); body.rotation.z = Math.PI / 2; body.position.y = 0.6; g.add(body);
    const tail = cone(0.6, 0.9, mat(accent)); tail.position.set(-1.4, 0.6, 0); tail.rotation.z = Math.PI / 2; tail.scale.z = 1.5; g.add(tail);
    for (const s of [1, -1]) {                       // big front claws
      const arm = cyl(0.14, 0.16, 1.4, bodyMat); arm.position.set(1.3, 0.5, s * 0.4); arm.rotation.z = 0.5; g.add(arm);
      const claw = sph(0.45, mat(accent)); claw.scale.set(1.4, 0.6, 0.8); claw.position.set(2.1, 0.75, s * 0.5); g.add(claw);
      sway.push({ mesh: claw, axis: 'z', base: 0, amp: 0.2, spd: 2.4, ph: s });
    }
    for (const s of [1, -1]) { const ant = cyl(0.03, 0.03, 2.4, mat(accent, { opacity: 0.8 })); ant.position.set(1.6, 0.8, s * 0.2); ant.rotation.z = 0.9; g.add(ant); sway.push({ mesh: ant, axis: 'z', base: 0.9, amp: 0.15, spd: 2, ph: s }); }
  }

  else if (A === 'star') {
    const arms = 5, starMat = mat(base, { rough: 0.7 });
    const shape = new THREE.Shape();
    for (let i = 0; i <= arms * 2; i++) {
      const ang = (i / (arms * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 2.0 : 0.7;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2, steps: 1 });
    const star = new THREE.Mesh(geo, starMat); star.rotation.x = -Math.PI / 2; star.position.y = 0.4; g.add(star);
  }

  else if (A === 'urchin') {
    const bodyMat = mat(base, { rough: 0.6 });
    const ball = sph(1, bodyMat); ball.position.y = 1; g.add(ball);
    const spikeMat = mat(accent, { rough: 0.5 });
    for (let i = 0; i < 60; i++) {
      const a = Math.acos(1 - 2 * (i + 0.5) / 60), b = Math.PI * (1 + Math.sqrt(5)) * i;
      const dir = new THREE.Vector3(Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b));
      const sp = cone(0.09, 1.1, spikeMat, 5);
      sp.position.copy(dir).multiplyScalar(1.4).add(new THREE.Vector3(0, 1, 0));
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); g.add(sp);
    }
  }

  else if (A === 'anemone') {
    const column = cyl(0.7, 1.0, 1.4, mat(belly, { rough: 0.6 })); column.position.y = 0.7; g.add(column);
    const tentMat = mat(base, { rough: 0.4 }), tipMat = mat(accent, { rough: 0.3 });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2, ring = 0.3 + (i % 3) * 0.28;
      const t = cyl(0.05, 0.14, 1.6, tentMat, 5);
      t.position.set(Math.cos(a) * ring, 1.7, Math.sin(a) * ring);
      t.rotation.z = Math.cos(a) * 0.5; t.rotation.x = -Math.sin(a) * 0.5; g.add(t);
      const tip = sph(0.12, tipMat); tip.position.set(Math.cos(a) * (ring + 0.5), 2.4, Math.sin(a) * (ring + 0.5)); g.add(tip);
      sway.push({ mesh: t, axis: 'z', base: t.rotation.z, amp: 0.25, spd: 1.2, ph: i });
    }
  }

  else if (A === 'featherduster') {
    const tube = cyl(0.28, 0.34, 2.4, mat(belly, { rough: 0.8 })); tube.position.y = 1.2; g.add(tube);
    const frondMat = mat(base, { rough: 0.45, side: THREE.DoubleSide });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, r = 0.9;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 4), frondMat);
      frond.position.set(Math.cos(a) * r * 0.4, 2.7, Math.sin(a) * r * 0.4);
      frond.rotation.z = Math.cos(a) * 0.7; frond.rotation.x = -Math.sin(a) * 0.7; g.add(frond);
      sway.push({ mesh: frond, axis: 'z', base: frond.rotation.z, amp: 0.12, spd: 1.6, ph: i });
    }
  }

  else { // fallback: a simple pebble-critter so nothing is ever invisible
    const b = sph(1, mat(base)); b.scale.set(1.3, 0.7, 1); b.position.y = 0.6; g.add(b);
  }

  for (const o of g.children) { o.castShadow = true; }
  const worldScale = (spec.size || 1) * (0.7 + Math.min(1.1, (spec.adultSizeCm || 3) / 7));
  g.scale.setScalar(worldScale);
  g.userData = { sway, worldScale, invert: true };
  return g;
}

export function animateInvertVisual(group, dt, t) {
  const u = group.userData;
  if (u.sway) for (const s of u.sway) s.mesh.rotation[s.axis] = s.base + Math.sin(t * s.spd + s.ph) * s.amp;
}
