import * as THREE from 'three';
import { BOUNDS, TANK } from './constants.js';
import { animateFishVisual } from './fishbuilder.js';
import { animateInvertVisual } from './invertbuilder.js';

// Fish/invert AI: boid schooling, zone preference, wandering, food seeking,
// feeding-time congregation at the front glass, and predator/prey hunt+flee.

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _sep = V(), _ali = V(), _coh = V(), _steer = V();
const _cp = V(), _cn = V(), _cf = V(), _cr = V();
const _cm = new THREE.Matrix4();

// ---- benthic crawler locomotion (snails, shrimp, crabs, stars, urchins) ----
// Inverts don't swim; they crawl glued to a surface. Each surface pins one axis
// to a wall/floor plane and lets the critter wander in the other two.
const FLOOR_Y = TANK.SAND_H;                                  // sit on the substrate
const CRAWL_SPEED = { snail: 2.2, star: 1.6, urchin: 0.6, shrimp: 4.5, crab: 5.5, crayfish: 4.0 };
const SURFACES = {
  floor: { normal: new THREE.Vector3(0, 1, 0),  pin: 'y', val: FLOOR_Y,         a: 'x', b: 'z' },
  front: { normal: new THREE.Vector3(0, 0, -1), pin: 'z', val: TANK.D / 2 - 2,  a: 'x', b: 'y' },
  back:  { normal: new THREE.Vector3(0, 0, 1),  pin: 'z', val: -TANK.D / 2 + 2, a: 'x', b: 'y' },
  left:  { normal: new THREE.Vector3(1, 0, 0),  pin: 'x', val: -TANK.W / 2 + 2, a: 'z', b: 'y' },
  right: { normal: new THREE.Vector3(-1, 0, 0), pin: 'x', val: TANK.W / 2 - 2,  a: 'z', b: 'y' },
};
function clampCrawl(v) {
  v.x = THREE.MathUtils.clamp(v.x, BOUNDS.minX, BOUNDS.maxX);
  v.z = THREE.MathUtils.clamp(v.z, BOUNDS.minZ, BOUNDS.maxZ);
  v.y = THREE.MathUtils.clamp(v.y, TANK.SAND_H, TANK.WATER_LEVEL - 4);
}

function zoneY(zone) {
  const lo = BOUNDS.minY, hi = BOUNDS.maxY, mid = (lo + hi) / 2;
  switch (zone) {
    case 'top': return hi - (hi - mid) * 0.35;
    case 'bottom': case 'glass': return lo + 4;
    case 'fixed': return lo + 3;
    default: return mid;
  }
}

export class Agent {
  constructor(spec, obj, instId) {
    this.spec = spec;
    this.obj = obj;
    this.instId = instId;
    this.kind = spec.kind || 'fish';
    this.pos = obj.position;
    this.vel = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) * 0.3, (Math.random() - 0.5));
    this.cruise = (spec.speed || 1) * 7.5;                 // cm/s
    this.maxSpeed = this.cruise * 1.5;
    this.zoneYbase = zoneY(spec.zone);
    this.wander = Math.random() * 100;
    this.state = 'cruise';
    this.food = null;
    this.prey = null;
    this.eatCooldown = 0;
    this.startle = 0;
    this.swimAmt = 1;
    this.turnRate = 0;
    this.alive = true;
    this.isInvert = this.kind === 'invert';
    this.sessile = spec.zone === 'fixed' || spec.archetype === 'anemone' || spec.archetype === 'featherduster';
    // Benthic inverts crawl surfaces instead of swimming. Snails & stars also climb glass.
    this.crawler = this.isInvert && !this.sessile;
    this.climber = this.crawler && (spec.archetype === 'snail' || spec.archetype === 'star');
    if (this.crawler) {
      this.crawlSpeed = CRAWL_SPEED[spec.archetype] ?? 2.5;
      this.surf = 'floor';
      this.tgt = new THREE.Vector3();
      this.heading = new THREE.Vector3(1, 0, 0);
      this.scuttle = 0;
      this.scuttleFrom = new THREE.Vector3();
      this.surfTimer = 6 + Math.random() * 10;
      this.hasTgt = false;
    }
    // proxy "physical size" for predator/prey (cm), scaled by visual too
    this.bodyCm = spec.adultSizeCm || 5;
    if (this.crawler) {
      obj.position.set(
        THREE.MathUtils.randFloat(BOUNDS.minX + 6, BOUNDS.maxX - 6),
        FLOOR_Y,
        THREE.MathUtils.randFloat(BOUNDS.minZ + 6, BOUNDS.maxZ - 6)
      );
    } else {
      obj.position.set(
        THREE.MathUtils.randFloat(BOUNDS.minX, BOUNDS.maxX),
        this.zoneYbase + (Math.random() - 0.5) * 6,
        THREE.MathUtils.randFloat(BOUNDS.minZ, BOUNDS.maxZ)
      );
    }
  }
  edibleBy(pred) {
    if (this === pred || !this.alive) return false;
    if (this.kind === 'invert') { if (!this.spec.edible) return false; }
    // predator can swallow prey up to ~40% of its length
    return this.bodyCm <= pred.bodyCm * 0.42;
  }
}

export class Swarm {
  constructor(scene, sim, food) {
    this.scene = scene;
    this.sim = sim;         // care model: exposes hunger(id)->0..1, health(id), feed(id,amt)
    this.food = food;
    this.agents = [];
    this.begging = false;   // set true briefly when app (re)opened & fish hungry
    this.begTimer = 0;
    this.playerFocus = new THREE.Vector3(0, BOUNDS.maxY - 6, BOUNDS.maxZ); // front-top glass
  }

  add(agent) { this.agents.push(agent); this.scene.add(agent.obj); }

  remove(agent) {
    agent.alive = false;
    this.scene.remove(agent.obj);
    this.agents = this.agents.filter(a => a !== agent);
  }

  triggerFeedingRush() { this.begging = true; this.begTimer = 14; }

  // Startle everything near a world point (e.g. child taps glass or a fish)
  startleNear(point, radius = 30, strength = 1) {
    for (const a of this.agents) {
      if (a.sessile) continue;
      const d = a.pos.distanceTo(point);
      if (d >= radius) continue;
      const s = strength * (1 - d / radius);
      if (a.crawler) { a.scuttle = Math.max(a.scuttle, s); a.scuttleFrom.copy(point); continue; }
      a.startle = Math.max(a.startle, s);
      _a.copy(a.pos).sub(point).normalize().multiplyScalar(a.maxSpeed * 2);
      a.vel.addScaledVector(_a, 1.2);
    }
  }

  update(dt, time) {
    if (this.begging) { this.begTimer -= dt; if (this.begTimer <= 0) this.begging = false; }

    for (const a of this.agents) {
      if (!a.alive) continue;
      // growth: juveniles render smaller and are easier prey; adults full size
      const rec = this.sim._index.get(a.instId);
      const growth = rec?.growth ?? 1;
      a.growFactor = (rec?.var ?? 1) * (0.45 + 0.55 * growth);
      a.bodyCm = (a.spec.adultSizeCm || 5) * (0.4 + 0.6 * growth);
      if (a.sessile) { this._animateSessile(a, time); continue; }
      if (a.crawler) { this._animateCrawler(a, dt, time); continue; }
      a.obj.scale.setScalar(a.obj.userData.worldScale * a.growFactor);
      a.eatCooldown = Math.max(0, a.eatCooldown - dt);
      a.startle = Math.max(0, a.startle - dt * 1.6);

      const hunger = this.sim.hunger(a.instId);   // 0 fed .. 1 starving
      const health = this.sim.health(a.instId);
      _steer.set(0, 0, 0);

      // ---- Predator: hunt prey ----
      let hunting = false;
      if (a.spec.predator && hunger > 0.35 && a.eatCooldown === 0) {
        if (!a.prey || !a.prey.alive || a.pos.distanceTo(a.prey.pos) > 55) a.prey = this._findPrey(a);
        if (a.prey) {
          hunting = true;
          _a.copy(a.prey.pos).sub(a.pos);
          const d = _a.length();
          _a.normalize();
          const lunge = d < 14 ? 2.4 : 1.0;           // burst when close
          _steer.addScaledVector(_a, a.maxSpeed * lunge);
          if (d < 3.2 + a.bodyCm * 0.05) {            // caught it
            this._devour(a, a.prey);
            a.prey = null;
          }
        }
      }

      // ---- Prey: flee nearest predator that can eat me ----
      const pred = this._nearestThreat(a);
      if (pred) {
        _a.copy(a.pos).sub(pred.pos);
        const d = _a.length();
        if (d < 34) {
          _a.normalize().multiplyScalar(a.maxSpeed * 2.2 * (1 - d / 34));
          _steer.add(_a);
          a.startle = Math.max(a.startle, 0.5);
        }
      }

      // ---- Food seeking ----
      if (!hunting && this.food.count() > 0 && (hunger > 0.15 || Math.random() < 0.3)) {
        const reach = a.spec.zone === 'bottom' ? 200 : 140;
        if (!a.food || a.food.eaten) a.food = this.food.nearestFor(a.pos, a._dietSet, reach);
        if (a.food && !a.food.eaten) {
          _a.copy(a.food.mesh.position).sub(a.pos);
          const d = _a.length();
          _a.normalize();
          _steer.addScaledVector(_a, a.maxSpeed * (hunger > 0.5 ? 1.8 : 1.1));
          if (d < 2.4) { this.food.eat(a.food); this.sim.feed(a.instId, a._foodValue(a.food.type)); a.food = null; a.eatCooldown = 0.4; }
        }
      }

      // ---- Feeding-time congregation at the front glass ----
      if (!hunting && !a.isInvert && this.begging && hunger > 0.45 && this.food.count() === 0) {
        _a.copy(this.playerFocus).sub(a.pos);
        _a.y += Math.sin(time * 2 + a.wander) * 3;
        _steer.addScaledVector(_a.normalize(), a.maxSpeed * 1.2);
      }

      // ---- Boids (same-species schooling) ----
      if (a._schools) this._boids(a, _steer);

      // ---- Zone preference (vertical band) ----
      const targetY = a.zoneYbase + Math.sin(time * 0.3 + a.wander) * 3;
      _steer.y += (targetY - a.pos.y) * 0.6;

      // ---- Wander ----
      a.wander += dt;
      _steer.x += Math.sin(a.wander * 0.7) * a.cruise * 0.3;
      _steer.z += Math.cos(a.wander * 0.5) * a.cruise * 0.3;

      // ---- Soft walls ----
      this._avoidWalls(a, _steer);

      // Sick/weak fish move sluggishly
      const vigor = 0.35 + 0.65 * health;

      // integrate
      a.vel.addScaledVector(_steer, dt * 1.8);
      const speedCap = a.maxSpeed * vigor * (a.startle > 0 ? 2.2 : 1);
      if (a.vel.length() > speedCap) a.vel.setLength(speedCap);
      // minimum forward drive so fish keep moving
      if (a.vel.length() < a.cruise * 0.4 * vigor) a.vel.setLength(a.cruise * 0.4 * vigor);

      const prevDir = _b.copy(a.vel).normalize();
      a.pos.addScaledVector(a.vel, dt);
      this._clamp(a);

      // ---- Orient + animate ----
      const dir = _c.copy(a.vel);
      if (dir.lengthSq() > 1e-5) {
        dir.normalize();
        a.turnRate = 1 - Math.min(1, prevDir.dot(dir));
        // face travel direction: model nose is +x. For a Y-rotation of `a`, local
        // +x points to world (cos a, 0, -sin a), so a = atan2(-dz, dx).
        const yaw = Math.atan2(-dir.z, dir.x);
        a.obj.rotation.set(0, yaw, 0);
        if (!a.isInvert) a.obj.rotateZ(Math.asin(THREE.MathUtils.clamp(dir.y, -0.6, 0.6)));
      }
      a.swimAmt = THREE.MathUtils.clamp(a.vel.length() / a.cruise, 0.35, 2.2);
      if (a.isInvert) {
        animateInvertVisual(a.obj, dt, time);
      } else {
        animateFishVisual(a.obj, dt, time, a.swimAmt, a.turnRate);
        const mu = a.obj.userData.mat?.userData?.uniforms;
        if (mu) mu.sick.value = health < 0.4 ? (0.4 - health) / 0.4 : 0;
      }
    }
  }

  _boids(a, out) {
    _sep.set(0, 0, 0); _ali.set(0, 0, 0); _coh.set(0, 0, 0);
    let n = 0, ns = 0;
    for (const b of this.agents) {
      if (b === a || !b.alive || b.sessile) continue;
      const d = a.pos.distanceTo(b.pos);
      if (b.spec.id === a.spec.id && d < 22) {
        _coh.add(b.pos); _ali.add(b.vel); n++;
        if (d < 7) { _a.copy(a.pos).sub(b.pos).divideScalar(Math.max(0.5, d)); _sep.add(_a); ns++; }
      } else if (d < 6) { // personal space vs everyone
        _a.copy(a.pos).sub(b.pos).divideScalar(Math.max(0.5, d)); _sep.add(_a); ns++;
      }
    }
    if (n > 0) {
      _coh.divideScalar(n).sub(a.pos).multiplyScalar(0.02);
      _ali.divideScalar(n).multiplyScalar(0.12);
      out.add(_coh).add(_ali);
    }
    if (ns > 0) out.addScaledVector(_sep, a.cruise * 0.5);
  }

  _findPrey(a) {
    let best = null, bd = 60 * 60;
    for (const b of this.agents) {
      if (!b.edibleBy(a)) continue;
      const d = a.pos.distanceToSquared(b.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _nearestThreat(a) {
    let best = null, bd = 34 * 34;
    for (const b of this.agents) {
      if (!b.spec.predator || !b.alive) continue;
      if (!a.edibleBy(b)) continue;
      const d = a.pos.distanceToSquared(b.pos);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  _devour(pred, prey) {
    this.sim.feed(pred.instId, 0.9);
    pred.eatCooldown = 6 + Math.random() * 6;
    if (this.onEaten) this.onEaten(pred, prey);
    this.remove(prey);
  }

  _avoidWalls(a, out) {
    const m = 8;
    if (a.pos.x < BOUNDS.minX + m) out.x += (BOUNDS.minX + m - a.pos.x) * 0.8;
    if (a.pos.x > BOUNDS.maxX - m) out.x -= (a.pos.x - (BOUNDS.maxX - m)) * 0.8;
    if (a.pos.z < BOUNDS.minZ + m) out.z += (BOUNDS.minZ + m - a.pos.z) * 0.8;
    if (a.pos.z > BOUNDS.maxZ - m) out.z -= (a.pos.z - (BOUNDS.maxZ - m)) * 0.8;
    if (a.pos.y < BOUNDS.minY + 3) out.y += 3;
    if (a.pos.y > BOUNDS.maxY - 3) out.y -= 3;
  }

  _clamp(a) {
    a.pos.x = THREE.MathUtils.clamp(a.pos.x, BOUNDS.minX, BOUNDS.maxX);
    a.pos.y = THREE.MathUtils.clamp(a.pos.y, BOUNDS.minY, BOUNDS.maxY);
    a.pos.z = THREE.MathUtils.clamp(a.pos.z, BOUNDS.minZ, BOUNDS.maxZ);
  }

  _animateSessile(a, time) {
    // anemones & feather dusters sway tentacles; handled by a small vertex wobble
    a.obj.rotation.y = Math.sin(time * 0.4 + a.wander) * 0.05;
    const s = 1 + Math.sin(time * 1.5 + a.wander) * 0.04;
    a.obj.scale.setScalar(a.obj.userData.worldScale * (a.growFactor ?? 1) * s);
  }

  // Benthic crawl: creep slowly along the current surface (floor or glass),
  // scavenge sunk food, and — for snails/stars — climb the walls.
  _animateCrawler(a, dt, time) {
    a.eatCooldown = Math.max(0, a.eatCooldown - dt);
    a.scuttle = Math.max(0, a.scuttle - dt * 1.1);
    const S = SURFACES[a.surf];
    const health = this.sim.health(a.instId);

    if (a.scuttle > 0.03) {                         // startled: hurry directly away
      _cp.copy(a.pos).sub(a.scuttleFrom); _cp[S.pin] = 0;
      if (_cp.lengthSq() > 1e-4) {
        _cp.normalize();
        a.tgt.copy(a.pos).addScaledVector(_cp, 16);
        a.tgt[S.pin] = S.val; clampCrawl(a.tgt); a.tgt[S.pin] = S.val; a.hasTgt = true;
      }
    } else if (this.food.count() > 0 && a.surf === 'floor') {   // graze sunk food
      if (!a.food || a.food.eaten) a.food = this.food.nearestFor(a.pos, a._dietSet, 100);
      if (a.food && !a.food.eaten) {
        a.tgt.copy(a.food.mesh.position); a.tgt.y = S.val; a.hasTgt = true;
        if (a.pos.distanceTo(a.food.mesh.position) < 3.4) {
          this.food.eat(a.food); this.sim.feed(a.instId, a._foodValue(a.food.type));
          a.food = null; a.eatCooldown = 0.6;
        }
      }
    } else { a.food = null; }

    if (a.scuttle <= 0.03 && !a.food) {             // idle wander + glass climbing
      if (!a.hasTgt || a.pos.distanceTo(a.tgt) < 3) this._pickCrawlTarget(a);
      if (a.climber) { a.surfTimer -= dt; if (a.surfTimer <= 0) this._switchSurface(a); }
    }

    // creep toward the target, but only along the surface (never off it)
    _cp.copy(a.tgt).sub(a.pos); _cp[S.pin] = 0;
    const dist = _cp.length();
    if (dist > 1e-3) {
      _cp.normalize();
      const spd = a.crawlSpeed * (a.scuttle > 0 ? 3.2 : 1) * (0.4 + 0.6 * health);
      a.pos.addScaledVector(_cp, Math.min(dist, spd * dt));
      a.heading.lerp(_cp, 0.15);
    }
    a.pos[S.pin] = S.val; clampCrawl(a.pos); a.pos[S.pin] = S.val;   // glue to surface
    a.obj.scale.setScalar(a.obj.userData.worldScale * (a.growFactor ?? 1));

    // orient flat against the surface: local +Y = surface normal, +X = crawl heading
    _cn.copy(S.normal);
    _cf.copy(a.heading).addScaledVector(_cn, -a.heading.dot(_cn));   // tangential component
    if (_cf.lengthSq() < 1e-5) _cf.set(S.a === 'x' ? 1 : 0, S.a === 'y' ? 1 : 0, S.a === 'z' ? 1 : 0);
    _cf.normalize();
    _cr.copy(_cf).cross(_cn).normalize();
    _cm.makeBasis(_cf, _cn, _cr);
    a.obj.quaternion.setFromRotationMatrix(_cm);

    animateInvertVisual(a.obj, dt, time);
  }

  _pickCrawlTarget(a) {
    const S = SURFACES[a.surf];
    a.tgt.copy(a.pos);
    a.tgt[S.a] += (Math.random() * 2 - 1) * 18;
    if (S.b === 'y') {
      // on glass: aim anywhere up the pane so climbers actually traverse it
      a.tgt.y = THREE.MathUtils.lerp(TANK.SAND_H + 3, TANK.WATER_LEVEL - 6, Math.random());
    } else {
      a.tgt[S.b] += (Math.random() * 2 - 1) * 18;
    }
    a.tgt[S.pin] = S.val; clampCrawl(a.tgt); a.tgt[S.pin] = S.val;
    a.hasTgt = true;
  }

  // Climbers move between the sand and the glass. From the floor they walk to the
  // nearest wall, then attach and climb; from a wall they drop back to the sand.
  _switchSurface(a) {
    if (a.surf !== 'floor') {
      a.surf = 'floor'; a.surfTimer = 12 + Math.random() * 16;
      a.pos.y = FLOOR_Y; this._pickCrawlTarget(a); return;
    }
    const near = [
      ['front', TANK.D / 2 - a.pos.z],
      ['back',  a.pos.z + TANK.D / 2],
      ['left',  a.pos.x + TANK.W / 2],
      ['right', TANK.W / 2 - a.pos.x],
    ].sort((p, q) => p[1] - q[1])[0];
    const wall = near[0];
    if (near[1] < 12) {                             // reached the glass — climb it
      a.surf = wall; a.surfTimer = 16 + Math.random() * 22;
      a.pos[SURFACES[wall].pin] = SURFACES[wall].val;
      this._pickCrawlTarget(a);
    } else {                                        // walk to the glass base first
      a.tgt.copy(a.pos);
      if (wall === 'front') a.tgt.z = BOUNDS.maxZ;
      else if (wall === 'back') a.tgt.z = BOUNDS.minZ;
      else if (wall === 'left') a.tgt.x = BOUNDS.minX;
      else a.tgt.x = BOUNDS.maxX;
      a.tgt.y = FLOOR_Y; a.hasTgt = true;
      a.surfTimer = 3 + Math.random() * 3;
    }
  }
}
