// Fish Keeper progression — the shop catalog is EARNED, not given.
//
// Keeper XP comes from real care (feeding, water changes, scrubbing, raising
// babies, discoveries), capped per day so button-mashing doesn't grind it.
// Each level-up is a "delivery": a batch of new species arrives at the shop,
// easiest-care first, so hard fish only appear once the keeper has proven
// they can keep things alive. On top of that: weekly special drops (themed
// batches of the expansion inverts), rare surprise-crate unlocks, and secret
// fish with hidden conditions — bragging rights.

const BATCH = 5;                       // species per level-up delivery
const CARE_RANK = { Easy: 0, Medium: 1, Hard: 2 };
const XP_GAIN = { feed: 2, water: 4, scrub: 3, grown: 15, birth: 10, discover: 6, good: 20 };
const DAY_CAP = { feed: 3, water: 2, scrub: 2 };   // awards per real day

// Secret fish: hidden conditions, kid-readable riddle hints. Conditions read
// the lifetime counters in keeper.n (or the save itself).
export const SECRETS = [
  { id: 'discus',                emoji: '👑', hint: 'Keep the water sparkling clean for 5 days…',            test: (k) => k.n.cleanDays >= 5 },
  { id: 'mandarin_dragonet',     emoji: '💎', hint: 'Treasure hunters find the most colorful fish. Open 3 chests…', test: (k) => k.n.treasure >= 3 },
  { id: 'lined_seahorse',        emoji: '🐴', hint: 'Welcome lots of babies to your tanks…',                 test: (k) => k.n.births >= 6 },
  { id: 'african_butterfly_fish', emoji: '🌙', hint: 'Visit your fish late at night, three different nights…', test: (k) => k.n.nights >= 3 },
  { id: 'celestial_pearl_danio', emoji: '🌌', hint: 'Collect 30 different species in your Fish Book…',        test: (k, s) => (s.discovered || []).length >= 30 },
  { id: 'longhorn_cowfish',      emoji: '🐮', hint: 'Save up a big piggy bank — 250 coins at once…',          test: (k, s) => s.coins >= 250 },
  { id: 'hillstream_loach',      emoji: '🧽', hint: 'Scrub the algae away 20 times…',                        test: (k) => k.n.scrubs >= 20 },
  { id: 'volitans_lionfish',     emoji: '🍽️', hint: 'Feed your fish 30 different times…',                    test: (k) => k.n.feeds >= 30 },
];

export class Keeper {
  // weeklyPool: [{ name: '🐌 Snail Squad', ids: [...] }, ...] — one drops per real week
  constructor(sim, allSpecies, weeklyPool = []) {
    this.sim = sim;
    this.byId = {}; for (const s of allSpecies) this.byId[s.id] = s;
    this.weeklyPool = weeklyPool;
    const secretIds = new Set(SECRETS.map(s => s.id));
    const weeklyIds = new Set(weeklyPool.flatMap(b => b.ids));
    // delivery order: easiest care first, then cheapest — a stable, fair drip
    const rest = allSpecies
      .filter(s => !secretIds.has(s.id) && !weeklyIds.has(s.id))
      .sort((a, b) => (CARE_RANK[a.care] ?? 1) - (CARE_RANK[b.care] ?? 1) || a.price - b.price || a.id.localeCompare(b.id));
    // starters: the 10 easiest per water are open from day one
    this.starters = new Set();
    this.order = [];
    const perWater = { fresh: 0, salt: 0 };
    for (const s of rest) {
      if ((CARE_RANK[s.care] ?? 1) === 0 && perWater[s.water] < 10) { this.starters.add(s.id); perWater[s.water]++; }
      else this.order.push(s.id);
    }
  }

  // Starting level for a pre-progression save: a small head start, hard-capped.
  // Their discovered species stay purchasable regardless — this only controls
  // how many UNSEEN species come pre-unlocked.
  _startLevel(st) { return Math.max(1, Math.min(5, Math.ceil((st.discovered || []).length / 8))); }

  get k() {
    const st = this.sim.state;
    if (!st.keeper) {
      st.keeper = {
        v: 2, xp: 0, level: this._startLevel(st),
        t0: Date.now(), weeklySeen: 0, daily: {},
        n: { feeds: 0, waters: 0, scrubs: 0, grown: 0, births: 0, treasure: 0, nights: 0, cleanDays: 0 },
        secrets: [], extras: [],
      };
    }
    // v1 grandfathering was far too generous (a level per 3 discoveries opened
    // most of the catalog on day one) — re-clamp those saves once
    if (!st.keeper.v) {
      st.keeper.v = 2;
      st.keeper.level = Math.min(st.keeper.level, this._startLevel(st));
      st.keeper.xp = Math.min(st.keeper.xp, this.xpNeed(st.keeper.level) - 1);
      // counters could have been inflated by button-mashing before the caps
      const n = st.keeper.n;
      n.feeds = Math.min(n.feeds, DAY_CAP.feed); n.waters = Math.min(n.waters, DAY_CAP.water); n.scrubs = Math.min(n.scrubs, DAY_CAP.scrub);
    }
    return st.keeper;
  }

  xpNeed(level = this.k.level) { return 40 + (level - 1) * 20; }

  // Award XP for a care action. Returns the number of levels gained (0 usually).
  // Day caps gate BOTH the XP and the lifetime counters that secret fish read,
  // so button-mashing can't speed up either (a secret like "feed 30 times"
  // means 10+ real days of feeding, not 3 minutes of tapping).
  award(kind, mult = 1) {
    const k = this.k;
    const today = new Date().toDateString();
    if (k.daily.d !== today) k.daily = { d: today };
    if (DAY_CAP[kind] != null) {
      k.daily[kind] = (k.daily[kind] || 0) + 1;
      if (k.daily[kind] > DAY_CAP[kind]) return 0;
    }
    const counter = { feed: 'feeds', water: 'waters', scrub: 'scrubs', grown: 'grown', birth: 'births' }[kind];
    if (counter) k.n[counter] += mult;
    k.xp += (XP_GAIN[kind] || 0) * mult;
    let ups = 0;
    while (k.xp >= this.xpNeed()) { k.xp -= this.xpNeed(); k.level++; ups++; }
    return ups;
  }

  // Once per real day: was the tank cared for? (called from the periodic tick)
  dailyCheck(summary) {
    const k = this.k, today = new Date().toDateString();
    if (k.lastGoodDay === today) return 0;
    if (summary.count > 0 && summary.avgHealth > 0.6) {
      k.lastGoodDay = today;
      if (summary.water >= 0.9) k.n.cleanDays++;
      return this.award('good');
    }
    return 0;
  }

  // Once per real day: night-time visit counter for the 🌙 secret.
  nightCheck() {
    const k = this.k, h = new Date().getHours(), today = new Date().toDateString();
    if ((h >= 21 || h < 6) && k.lastNight !== today) { k.lastNight = today; k.n.nights++; }
  }

  weeksAvailable() {
    return Math.min(this.weeklyPool.length, Math.floor((Date.now() - this.k.t0) / (7 * 864e5)) + 1);
  }
  // Newly arrived weekly batch since last check (for the announcement toast).
  weeklyNews() {
    const avail = this.weeksAvailable();
    if (avail <= this.k.weeklySeen) return null;
    this.k.weeklySeen = avail;
    return this.weeklyPool[avail - 1];
  }
  latestWeekly() { return this.weeksAvailable() > 0 ? this.weeklyPool[this.weeksAvailable() - 1] : null; }

  unlocked() {
    const k = this.k;
    const set = new Set(this.starters);
    for (const id of this.order.slice(0, (k.level - 1) * BATCH)) set.add(id);
    for (const id of k.extras) set.add(id);
    for (const id of k.secrets) set.add(id);
    for (const id of this.sim.state.discovered || []) set.add(id);
    for (let w = 0; w < this.weeksAvailable(); w++) for (const id of this.weeklyPool[w].ids) set.add(id);
    return set;
  }

  // The next delivery, previewed as silhouettes (only ones for this water).
  nextDelivery(water) {
    const un = this.unlocked();
    return this.order
      .filter(id => !un.has(id) && this.byId[id]?.water === water)
      .slice(0, 4).map(id => this.byId[id]);
  }

  // Surprise crate: unlock one species early, from the near future (so care
  // difficulty stays appropriate), never a secret.
  surpriseUnlock() {
    const un = this.unlocked();
    const soon = this.order.filter(id => !un.has(id)).slice(0, 10);
    if (!soon.length) return null;
    const id = soon[Math.floor(Math.random() * soon.length)];
    this.k.extras.push(id);
    return this.byId[id];
  }

  // Evaluate secret conditions; returns newly unlocked spec+def pairs.
  checkSecrets() {
    const k = this.k, out = [];
    for (const def of SECRETS) {
      if (k.secrets.includes(def.id) || !this.byId[def.id]) continue;
      if (def.test(k, this.sim.state)) { k.secrets.push(def.id); out.push({ spec: this.byId[def.id], def }); }
    }
    return out;
  }
}
