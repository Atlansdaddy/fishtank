import * as THREE from 'three';
import { FOODS, TANK, BOUNDS } from './constants.js';

// Food pellets dropped into the tank. Each has buoyancy/sink physics per type.
// Fish seek the nearest food that matches their diet & zone reach.

export class FoodSystem {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.group = new THREE.Group();
    scene.add(this.group);
    this._geoCache = {};
  }

  _geo(type) {
    if (!this._geoCache[type]) {
      const f = FOODS[type];
      let g;
      if (type === 'algae') g = new THREE.CylinderGeometry(f.size, f.size, 0.4, 12);
      else if (type === 'frozen') g = new THREE.CapsuleGeometry(0.18 * f.size, 0.9 * f.size, 3, 6);
      else g = new THREE.IcosahedronGeometry(0.45 * f.size, 0);
      this._geoCache[type] = g;
    }
    return this._geoCache[type];
  }

  // Drop a serving near a world x/z (where the child tapped the surface).
  drop(type, x = 0, z = 0) {
    const f = FOODS[type];
    const mat = new THREE.MeshStandardMaterial({ color: f.color, roughness: 0.7 });
    for (let i = 0; i < f.count; i++) {
      const m = new THREE.Mesh(this._geo(type), mat);
      const px = THREE.MathUtils.clamp(x + (Math.random() - 0.5) * 18, BOUNDS.minX, BOUNDS.maxX);
      const pz = THREE.MathUtils.clamp(z + (Math.random() - 0.5) * 14, BOUNDS.minZ, BOUNDS.maxZ);
      m.position.set(px, TANK.WATER_LEVEL - 1 - Math.random() * 2, pz);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.group.add(m);
      this.items.push({
        mesh: m, type,
        vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6,
        floatT: f.floatTime * (0.6 + Math.random() * 0.8),
        age: 0, eaten: false, settled: false,
      });
    }
  }

  // Returns count of items rotting on the substrate for pollution accounting.
  update(dt) {
    let rotting = 0;
    for (const it of this.items) {
      if (it.eaten) continue;
      const f = FOODS[it.type];
      it.age += dt;
      const p = it.mesh.position;
      if (it.floatT > 0) { it.floatT -= dt; p.y += Math.sin(it.age * 3) * 0.01; }
      else if (!it.settled) {
        p.y -= f.sinkSpeed * dt;
        p.x += it.vx * dt; p.z += it.vz * dt;
        if (p.y <= TANK.SAND_H + 0.4) { p.y = TANK.SAND_H + 0.4; it.settled = true; }
      }
      it.mesh.rotation.x += dt * 0.5;
      if (it.settled) { it.age += dt; if (it.age > 40) rotting++; }
    }
    // cull eaten
    if (this.items.some(i => i.eaten)) {
      for (const it of this.items) if (it.eaten) this.group.remove(it.mesh);
      this.items = this.items.filter(i => !i.eaten);
    }
    return rotting;
  }

  // Nearest un-eaten food to a point that the fish's diet allows; within maxDist.
  nearestFor(pos, dietSet, maxDist = 999) {
    let best = null, bestD = maxDist * maxDist;
    for (const it of this.items) {
      if (it.eaten || !dietSet.has(it.type)) continue;
      const d = it.mesh.position.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  eat(it) { if (it) it.eaten = true; }
  count() { return this.items.filter(i => !i.eaten).length; }
  clear() { for (const it of this.items) this.group.remove(it.mesh); this.items = []; }
}
