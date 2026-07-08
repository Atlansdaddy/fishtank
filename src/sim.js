import { SIM, CAPACITY, FOODS, SAVE_KEY } from './constants.js';

// Care model for the ACTIVE tank. Tracks per-fish hunger/health and tank-wide
// water quality + algae. Time passes while the app is closed (offline decay) so
// the child must come back and maintain the tank or fish sicken and die.
//
// Clocks: foreground runs at GAME_HOURS_PER_REAL_MIN (so effects are visible in
// a play session); offline uses real elapsed hours (so a day away really hurts).

const GAME_HOURS_PER_REAL_MIN = 1.0;

let _uid = 1;
export function newInstId() { return 'f' + (_uid++) + '_' + Math.floor(performance.now() % 100000); }

function blankTank() {
  return { fish: [], water: 1.0, algae: 0.0 };  // water 1=pristine, algae 0=clean
}

export class CareSim {
  constructor(speciesMap) {
    this.species = speciesMap || null;   // id -> spec, used for breeding
    this.state = {
      version: 2,
      coins: SIM.STARTING_COINS,
      current: 'fresh',
      lastSeen: Date.now(),
      tanks: { fresh: blankTank(), salt: blankTank() },
      discovered: [],                    // species ids ever owned (the Fish Book)
      unlocked: true,
    };
    this._index = new Map();     // instId -> fish record (active tank)
    this.events = [];            // queued notifications for the UI
    this._reindex();
    this._pollutionAccum = 0;
  }

  get tank() { return this.state.tanks[this.state.current]; }
  get coins() { return this.state.coins; }

  _reindex() {
    this._index.clear();
    for (const f of this.tank.fish) this._index.set(f.id, f);
  }

  // ---------- queries used by behavior ----------
  hunger(id) { const f = this._index.get(id); return f ? f.hunger : 0; }
  health(id) { const f = this._index.get(id); return f ? f.health : 1; }
  feed(id, amt) {
    const f = this._index.get(id);
    if (f) { f.hunger = Math.max(0, f.hunger - amt); f.everFed = true; }
  }

  // ---------- stock management ----------
  bioload() {
    let b = 0;
    for (const f of this.tank.fish) b += (f.bioload || 1);
    return b;
  }
  capacityLeft() { return CAPACITY.bioload - this.bioload(); }

  addFish(spec, name) {
    const f = {
      id: newInstId(), sp: spec.id, name: name || spec.common,
      hunger: 0.2, health: 1.0, bioload: spec.bioload || 1,
      kind: spec.kind || 'fish', dead: false, everFed: false, age: 0,
      growth: 0.35,                          // juvenile; grows to 1 with good care
      var: 0.85 + Math.random() * 0.3,       // individual size variation (±15%)
    };
    this.tank.fish.push(f);
    this._index.set(f.id, f);
    // Fish Book: first time this species is ever owned
    this.state.discovered ??= [];
    if (!this.state.discovered.includes(spec.id)) {
      this.state.discovered.push(spec.id);
      f.newSpecies = true;
    }
    return f;
  }
  removeFishById(id) {
    this.tank.fish = this.tank.fish.filter(f => f.id !== id);
    this._index.delete(id);
  }

  switchTank(which) {
    this.state.current = which;
    this._reindex();
  }

  // ---------- maintenance actions ----------
  waterChange() { this.tank.water = Math.min(1, this.tank.water + 0.55); }
  scrubAlgae(amt = 1) { this.tank.algae = Math.max(0, this.tank.algae - amt); }
  spendCoins(n) { if (this.state.coins >= n) { this.state.coins -= n; return true; } return false; }
  addCoins(n) { this.state.coins += n; }

  // ---------- time evolution ----------
  // rottingFood: count of food items decaying on substrate (from FoodSystem)
  update(dtSeconds, rottingFood = 0) {
    const gh = (dtSeconds / 60) * GAME_HOURS_PER_REAL_MIN;   // in-game hours this frame
    this._decay(gh, rottingFood, true);
  }

  applyOffline() {
    const now = Date.now();
    let hours = (now - this.state.lastSeen) / 3.6e6;
    this.state.lastSeen = now;
    if (hours <= 0) return 0;
    hours = Math.min(hours, SIM.OFFLINE_CAP_HOURS);
    // apply to BOTH tanks (both are living while you're away)
    const prevCurrent = this.state.current;
    for (const which of ['fresh', 'salt']) {
      this.state.current = which; this._reindex();
      this._decay(hours, 0, false);
    }
    this.state.current = prevCurrent; this._reindex();
    // award coins for tanks that stayed healthy
    return hours;
  }

  _decay(hours, rottingFood, foreground) {
    if (hours <= 0) return;
    const t = this.tank;
    const load = this.bioload();

    // Water quality: declines with bioload; passive filter recovery; food pollution.
    const decayRate = (load / CAPACITY.bioload) / (SIM.WATER_DECAY_DAYS * 24);
    t.water -= decayRate * hours;
    t.water -= rottingFood * SIM.UNEATEN_POLLUTION * hours;
    t.water += (1 / (48)) * hours * 0.15;         // slow filtration recovery
    t.water = Math.max(0, Math.min(1, t.water));

    // Algae: grows over time, faster in bright/dirty water.
    t.algae += (hours / (SIM.ALGAE_DAYS * 24)) * (1 + (1 - t.water) * 0.8);
    t.algae = Math.min(1, t.algae);

    for (const f of t.fish) {
      if (f.dead) continue;
      // hunger rises
      f.hunger = Math.min(1, f.hunger + hours / SIM.HUNGER_HOURS);
      // health: harmed by starvation and bad water; heals when fed + clean
      let dh = 0;
      if (f.hunger > 0.85) dh -= (hours / (SIM.STARVE_DAYS * 24));
      if (t.water < SIM.SICK_THRESHOLD) dh -= (SIM.SICK_THRESHOLD - t.water) * hours / 24;
      if (f.hunger < 0.6 && t.water > 0.6) dh += hours / SIM.HEAL_HOURS;
      f.health = Math.max(0, Math.min(1, f.health + dh));
      // growth: juveniles grow into adults while fed and reasonably healthy
      if ((f.growth ?? 1) < 1 && f.hunger < 0.7 && f.health > 0.5) {
        f.growth = Math.min(1, f.growth + hours / (SIM.GROW_DAYS * 24));
        if (f.growth >= 1) this.events.push({ type: 'grown', id: f.id, name: f.name });
      }
      if (f.health <= 0 && !f.dead) {
        f.dead = true;
        this.events.push({ type: 'death', id: f.id, name: f.name, sp: f.sp });
      }
    }

    // Livebearers really do this: 2+ healthy adults in clean water -> fry
    if (this.species && t.water > 0.6) {
      const groups = {};
      for (const f of t.fish) {
        if (f.dead || (f.growth ?? 1) < 1 || f.health < 0.7) continue;
        const sp = this.species[f.sp];
        if (sp && sp.archetype === 'livebearer') (groups[f.sp] ??= []).push(f);
      }
      for (const spId of Object.keys(groups)) {
        if (groups[spId].length < 2) continue;
        if (Math.random() >= Math.min(0.5, hours / SIM.BREED_HOURS)) continue;
        const sp = this.species[spId];
        const born = [];
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) {
          if (this.capacityLeft() < (sp.bioload || 1) || t.fish.length >= CAPACITY.maxFish) break;
          const baby = this.addFish(sp);
          baby.growth = 0.1; baby.hunger = 0.3;   // tiny fry
          born.push(baby.id);
        }
        if (born.length) this.events.push({ type: 'birth', sp: spId, ids: born, name: sp.common });
      }
    }
  }

  // Remove dead fish from state; returns their ids (so caller removes 3D agents).
  reapDead() {
    const dead = this.tank.fish.filter(f => f.dead).map(f => f.id);
    this.tank.fish = this.tank.fish.filter(f => !f.dead);
    for (const id of dead) this._index.delete(id);
    return dead;
  }

  drainEvents() { const e = this.events; this.events = []; return e; }

  // ---------- persistence ----------
  save() {
    this.state.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) {}
  }
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      if (s && s.tanks) {
        // migrate pre-growth saves: existing fish are adults with slight variation
        for (const which of ['fresh', 'salt']) for (const f of s.tanks[which].fish) {
          f.growth ??= 1; f.var ??= 0.85 + Math.random() * 0.3;
        }
        this.state = s; this._reindex(); return true;
      }
    } catch (e) {}
    return false;
  }

  // Health summary for HUD
  summary() {
    const t = this.tank;
    const n = t.fish.length;
    let avgHealth = 0, hungriest = 0, sick = 0;
    for (const f of t.fish) { avgHealth += f.health; hungriest = Math.max(hungriest, f.hunger); if (f.health < SIM.SICK_THRESHOLD) sick++; }
    if (n) avgHealth /= n;
    return {
      count: n, avgHealth, hungriest, sick,
      water: t.water, algae: t.algae, coins: this.state.coins,
      bioload: this.bioload(), capacity: CAPACITY.bioload,
    };
  }
}
