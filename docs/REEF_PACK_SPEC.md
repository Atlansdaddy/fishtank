# Reef Pack — Content Expansion Spec (saltwater tank)

**Not a habitat.** This is a content pack for the EXISTING saltwater aquarium
(live at 178 species). It replaces the fake painted-cone "corals" in
`buildDecor('salt')` (`src/main.js`) with real, purchasable, placeable,
growing corals + live rock, and gives several already-shipped saltwater fish
their signature reef behaviors for free. Branch: `pack/reef`. Ships against
`main` without the engine split; nothing here blocks or is blocked by
`ENGINE_SPLIT.md` (all additions are pack-shaped already).

Constraints inherited, not reopened: realistic, real species + real facts,
offline-first, no ads/accounts, S24 60 fps, calm.

Guardrail (same as every habitat): `shots.mjs` / `camtest.mjs` / `invtest.mjs`
keep working; add one `shot_reef.png` script that places the MVP roster and
screenshots day + night.

---

## 1. What it adds

### 1.1 A new item category: `reef` — between fish and decor

Today there are two kinds of thing in the tank: **agents** (fish + inverts:
care records in `tank.fish`, they move, they can die) and **decor** (rocks +
plants: stateless, regenerated randomly by `buildDecor`, not saved). Reef
items are the missing middle: they have persistent state and care
consequences like a fish, but a persistent *position* and no locomotion like
decor.

| | Fish / inverts (agents) | **Reef items (new)** | Decor |
|---|---|---|---|
| Bought in shop | yes | yes | no (free, auto) |
| Saved state | record in `tank.fish` | record in **`tank.reef`** | none |
| Position | AI-driven, not saved | **kid-placed, saved** | random each build |
| Moves | swims/crawls | never (sways only) | never |
| Sim | hunger/health | **growth (weeks) + bleach** off the water meter | — |
| Tap | follow + fish card | **coral card** (facts, growth %, Move button) | nothing |
| Can die | yes | DECISION FOR JOHN (§3.4) | no |

Save shape (additive; `state.version` stays 2, mirror `_migrate()`'s
`f.growth ??= 1` pattern with `t.reef ??= []` for both tanks):

```js
tank.reef = [{
  id,            // instance id (newInstId())
  sp,            // species id, e.g. 'torch_coral'
  pos: [x, y, z],// world cm, y = surface hit point
  norm: [x,y,z], // surface normal it was placed on (orientation)
  rockId,        // instance id of the live rock it sits on, or null (sand)
  seed,          // procedural-geometry seed, so it regrows identical branches
  growth,        // 0.25 (frag) -> 1.0 (colony), REAL WEEKS — see §1.3
  bleach,        // 0 (healthy) -> 1 (white) — see §3
  placedAt,      // Date.now()
}]
```

Reef records are NOT in `tank.fish`: they never enter `Swarm`, never count
against `CAPACITY.bioload`/`maxFish` (zero regression risk to the fish sim),
and are updated by one small `ReefSim.decay(hours)` called from the same two
places `CareSim._decay` runs (foreground `update()`, `applyOffline()`).
Capacity is a separate, kid-visible budget:

```js
export const REEF = {
  CAPACITY: 24,          // total reefSpace points (perf + visual sanity)
  MAX_ITEMS: 20,         // hard cap
  POLYP_THRESHOLD: 0.6,  // water below this: polyps retract, growth pauses
  BLEACH_THRESHOLD: 0.5, // water below this: bleaching accrues (canary zone)
  BLEACH_DAYS: 3,        // sustained bad water -> fully white
  RECOVER_DAYS: 7,       // fully white -> recovered in pristine water (slow, honest)
};
```

`rules.js` gets a sibling `evaluatePlace(sim, spec, pos)` in the same
block/warn voice as `evaluateAdd`:

- **block**: wrong water (`spec.water !== current` — reuse rule 1 verbatim; the
  whole pack is `water:'salt'`, so corals are simply unbuyable in the fresh
  tank), reefSpace capacity, wrong substrate (`placement:'rock'` coral on bare
  sand), max items.
- **warn**: placing within `sting` radius of a torch/hammer ("Hammer corals
  sting neighbors that get too close — give it space"), buying any coral while
  `tank.water < 0.7` ("Corals need very clean water — do a water change
  first"). Both are true husbandry, same teaching voice as the predator warns.

### 1.2 Placement UX — on the existing gestures

The camera controller in `main.js` already owns pointerdown/move/up, pinch,
and `tapSelect`. Placement is a mode flag on that machinery, not a new input
system:

| Gesture today | In placement mode |
|---|---|
| 1-finger drag = orbit (or algae-wipe if dirty) | **drag = slide the ghost coral** — raycast each pointermove against the sand mesh (`tankView.sand`) + placed live-rock meshes; ghost snaps to hit point, oriented to hit normal (tilt clamped ≤ 25° for upright corals; `polypMat` mats conform fully) |
| pinch = zoom | unchanged (you want to zoom while placing) |
| tap agent = follow + card | **tap = confirm** — plays a soft placement `snd.chime()`, coins deduct, ghost solidifies, record saved |
| — | **✗ pill** (top center, next to the usual toast spot): cancel, full refund |

Flow: Shop → buy coral → panels close, banner pill "🪸 Drag to place your
coral — tap to plant it". Ghost renders at 60% opacity, **tinted green when
`evaluatePlace` passes, red when blocked** (warn = yellow, placeable). Orbit
and algae-wipe are suspended for the duration; a mode this short (seconds)
doesn't need them.

Re-placement is free: tap a coral → coral card (the existing `showFishCard`
shell, coral flavored) → **Move** button re-enters the same mode. Kids
rearrange; that's half the toy.

Live rock is placed the same way (sand only) and registers its mesh as a
raycast target for subsequent corals — rockwork first, corals on top, exactly
like the real hobby.

**Sessile inverts join in (small, recommended):** newly bought anemones /
feather dusters go through the same placement flow instead of spawning at a
random fixed point (existing ones keep their spot). One code path, and the
kid decides where the clownfish's home is — which matters for §1.4.
**DECISION FOR JOHN** — see §8 D4.

### 1.3 Coral growth over real weeks — `f.growth` philosophy, ×4–9 timescale

Fish: `growth 0.35 → 1.0` in `SIM.GROW_DAYS = 5`, gated on being fed and
healthy. Corals: `growth 0.25 → 1.0` in `spec.growDays` **21–45 real days**,
gated on water quality instead of hunger:

```js
// ReefSim.decay(hours) — same shape as CareSim._decay's growth clause
if (c.growth < 1 && t.water >= REEF.POLYP_THRESHOLD && c.bleach < 0.3) {
  c.growth = Math.min(1, c.growth + hours / (spec.growDays * 24));
  // milestone events -> toasts/XP, see §6
}
```

Offline hours count via the same `applyOffline()` clock, capped at
`SIM.OFFLINE_CAP_HOURS` (96h) like everything else — deliberately: a kid who
checks in every few days loses nothing; a month away doesn't hand over a free
reef. Care debt applies to growth too.

Growth is **structural, not just scale** (§2.3): an acropora at 0.5 has
visibly fewer branches than at 1.0; a plate is a bigger disc; zoas have more
polyps. Growth stage shows on the coral card ("Frag → Colony: 62%") and in
the Fish Book entry.

### 1.4 Clownfish hosting — the bond

Anemones already exist as sessile agents (`bubble_tip_anemone`,
`archetype:'anemone'`, `zone:'fixed'`, tag `hostsAnemone`), five clownfish
species already carry `tags:['hostsAnemone']`, and the behaviors we need —
rest episodes, glass-holding, startle — all exist in `behavior.js`. Hosting
is a routing change, not a new system:

| Existing system | Hosting reuse |
|---|---|
| `_restLogic` rest episodes (`a.rest`, wake conditions) | **sleep-in-anemone**: rest target = host center instead of the sand; pos lerps into the tentacles (host y + 2), `animateFishVisual` at swimAmt 0.25 with a slow roll — the classic clownfish snuggle-wiggle |
| pleco glass episodes (`a.glass`, held pose, slerp to basis) | template for the held-at-host pose and duration bookkeeping |
| `startleNear` startle vector | **inverted for hosted clowns**: instead of fleeing the tap point, dart TO the host at burst speed (`vel` toward host ×2 max), then a 2 s rest inside. Retreat-when-startled, exactly as requested |
| `nightFactor` / `_restLogic` sleepy weighting | at `nightFactor > 0.7`, hosted clowns take long rest episodes in the host (they genuinely sleep there) — mirrors "diurnal fish drift low at night", but the drift target is home |
| zone steering (`zoneYbase`) | tether: wander/cruise steering gains a soft pull toward host within ~28 cm; hosted clowns rarely leave the neighborhood, which is true and reads instantly |
| `_animateSessile` sway | cuddle response: when a clown enters, bump the host's sway `amp` ×1.4 for ~2 s (the anemone "grabs" its fish) |

**Bond formation:** every few seconds, each un-bonded `hostsAnemone` fish
picks the nearest host in the tank — priority: any anemone agent → any
placed torch/hammer coral (`hosts: true`, real-world surrogate hosting; kids
who can't afford the Hard-care anemone still get the moment). Bond stored on
the fish record (`f.hostId`) so it survives reload. A bonded pair shares one
host (schooling `'pair'` already keeps them together). Bond breaks if the
host is removed or (DECISION D1) dies.

**First-bond moment:** toast `💞 Coraline moved into the anemone!` + a Fish
Book note on the clownfish card + a one-time surprise-grade camera-worthy
event. This is the pack's screenshot.

---

## 2. Rendering on a phone

### 2.1 Procedural geometry per archetype

All geometry is generated ONCE at placement (from `seed`), merged into as few
draws as possible, `matrixAutoUpdate = false` after placing. No per-frame
geometry updates anywhere in the pack.

| Archetype | Species | Recipe | Tris (grown) | Draw calls |
|---|---|---|---|---|
| `branching` | acropora, birdsnest | cheap L-system: trunk + 2 branch generations (angle/length jitter from seed), each segment a 5-radial `TubeGeometry`, all merged into ONE BufferGeometry; tips get a lighter vertex-color band | ≤ 3.5k | 1 |
| `brain` | open brain | hemisphere (`SphereGeometry` 28×18, bottom clipped) displaced by ridged sin-noise (the `tank.js` sand-dune trick, cranked); valleys vertex-colored with `patternColor` | ≤ 2k | 1 |
| `plate` | plate coral, montipora cap | lathe disc with radial ripple displacement; monti = 2–3 stacked offset scrolls, merged | ≤ 2k | 1 |
| `mushroom` | mushroom, toadstool | lathe cap + stalk; toadstool larger, cap top dotted with polyp pattern (§2.2) | ≤ 1.2k | 1 |
| `polypMat` | green star polyps, zoanthids, xenia | low flattened blob base (1 draw) + `InstancedMesh` of a ~10-tri polyp disc / xenia stalk-with-hand, 40–120 instances (1 draw). Growth adds instances; retract scales them into the mat | ≤ 2.5k | 2 |
| `tentacled` | torch, hammer | `invertbuilder.js` anemone build, reused: column + **20–24** tentacle cylinders + tip spheres, animated through the exact `userData.sway` contract (`{mesh, axis, base, amp, spd, ph}`) that `animateInvertVisual` already drives. Hammer tips are flattened T-spheres, torch tips round + bright | ≤ 2.5k | ~25 |
| `liverock` | live rock | 2–3 merged noise-displaced dodecahedra; coralline-algae patches vertex-painted pink/purple | ≤ 1.5k | 1 |

The tentacled path deliberately reuses the sway contract rather than
inventing a shader — the shipping anemone already animates 92 swayed meshes
per instance, so two torches (~50 meshes) are strictly cheaper than one
anemone. **Escape hatch if profiling disagrees:** merge tentacles into one
geometry with a per-vertex phase attribute and do the sway in the vertex
shader (same visual, 1 draw); the contract makes the two implementations
interchangeable.

### 2.2 One coral material: pattern heritage + growth/bleach/retract uniforms

One `MeshStandardMaterial` per coral (cloned per instance for color, shared
program), extended via `onBeforeCompile` exactly like `fishbuilder.js` and
the `tank.js` water surface:

- **Polyp detail** = the existing pattern-shader heritage: reuse the
  `PATTERN_ID` chunk (`spots` at high `patternScale` = polyp dots on brain /
  toadstool / plates; `stripesV` = brain ridges). No new pattern code.
- `uGrowth`: vertices carry an `aGrow` attribute (birth order along the
  L-system / instance index for mats). Vertices with `aGrow > uGrowth`
  collapse toward their parent branch point — the coral literally grows new
  branches over weeks from one static geometry, zero rebuilds.
- `uBleach`: lerps albedo toward bone-white `#f0ede8` and kills the pattern +
  `iridescence` (fluorescence dies first — true).
- `uRetract`: 0–1, scales polyp instances/dots into the flesh and (via JS)
  multiplies sway `amp` toward 0. Retracted corals go still and bald — the
  kid-readable warning state.
- Gentle vertex sway: the water-surface sine trick at low amplitude
  (`sin(pos.x*.5 + time)*0.15 * aGrow`) so branch tips drift in the flow.
  Day/night: coral materials take the same `setDay` dimming as everything.

### 2.3 Budget — against the full 42-agent tank on the S24, 60 fps

Worst legal case: 42 agents (`CAPACITY.maxFish`) + 20 reef items
(`REEF.MAX_ITEMS`, enforced by reefSpace):

| Added by the pack | Budget | Notes |
|---|---|---|
| Triangles | ≤ ~45k total | ≤ 3.5k each, most items far under; trivial for Adreno on a 2M-pixel canvas (`setPixelRatio` already capped at 2) |
| Draw calls | ≤ ~75 total | dominated by tentacled corals; sting-spacing + reefSpace naturally cap those at 3–4. Baseline comparison: ONE shipped anemone is already ~93 draws |
| Per-frame JS | sway-list iteration + 3 uniforms/coral | zero allocations; static matrices |
| Lights / shadows | none added | corals cast static shadows from the existing sun only |
| Frame cost target | ≤ 1.5 ms GPU, ≤ 0.3 ms JS | measured via the existing `probe.mjs` + a full-reef `shots.mjs` scene before merge |

If the tentacled JS sway shows up in traces: flip to the merged
vertex-shader variant (§2.1). If total draws hurt: instance live rock.
Nothing else in the pack is plausibly on the frame path.

---

## 3. Care model — no new meter (recommended)

### 3.1 The kid-simple answer

**Corals do not add a calcium or light meter.** They make the EXISTING water
meter matter more: corals are the most sensitive thing in the tank, so they
react *first* — before any fish is even sick. The reef becomes the tank's
canary, which is both true and a better warning system than any new gauge.

| `tank.water` | Fish (today, unchanged) | Corals (new) |
|---|---|---|
| ≥ 0.6 | fine | polyps out, swaying, **growing** |
| 0.5–0.6 | fine | **polyps retract** (`uRetract` → 1, sway stills), growth paused. One toast/day: "🪸 Your corals pulled their polyps in — the water needs a change!" |
| 0.4–0.5 | fine | **bleaching accrues** — the canary zone: corals visibly suffer while every fish still looks healthy |
| < 0.4 (`SIM.SICK_THRESHOLD`) | health drain | bleaching accrues faster |

No new chores, no new UI meter — the existing 💧 pill and the water-change
button carry the whole model. Day/night already follows the real clock, so
"light" is ambient truth, not a job.

### 3.2 Bleaching — honest, staged, reversible-if-caught

```js
// ReefSim.decay(hours), mirroring the fish sick-water clause in CareSim._decay
if (t.water < REEF.BLEACH_THRESHOLD)
  c.bleach += (REEF.BLEACH_THRESHOLD - t.water) * hours / (REEF.BLEACH_DAYS * 24) * 4;
else if (t.water >= 0.7)
  c.bleach -= hours / (REEF.RECOVER_DAYS * 24);
c.bleach = clamp(c.bleach, 0, 1);
```

Stages, all shader-visible (`uBleach`), all before anything dies:

1. **0–0.3 pale**: colors wash out, fluorescence gone. Toast: "🪸 ⚠️ Your
   corals are turning pale — change the water soon!"
2. **0.3–0.7 bleaching**: clearly whitening. Toast + (if reminders on) a
   `notify.event('🪸 Your corals are bleaching!', 'They will recover if you
   clean the water now.')` — same pipeline as death notices.
3. **0.7–1.0 bone white**: polyps gone, coral stark white. Final warning.
4. **1.0**: outcome = DECISION D1 below.

Recovery is real but SLOW (7 pristine days from full white — color creeps
back, polyps re-emerge last). Bleached corals don't grow. Teach the true
story once, on the first bleach event, in the toast + book card: *bleaching
is the coral evicting the tiny algae that feed it; catch it early and it
recovers — this is what's happening to real reefs.* Care-with-stakes, honest.

### 3.3 Coral feeding (post-MVP nicety)

LPS corals (torch, hammer, brain, candy cane, plate) list `diet:['frozen']`.
Dropping bloodworms near one at night (polyps extended) triggers a polyp
gulp (sway pulse + tint flash) and a small growth bonus that respects the
`DAY_CAP`-style once-per-day limit. True husbandry, cheap to build, deferred.

### 3.4 DECISION FOR JOHN — D1: bleaching endgame (can corals die?)

- **(a) Corals never die** — at `bleach = 1` they stay bone white until
  rescued, however long that takes. Zero heartbreak; slightly off-brand
  (every other neglect in the game has real stakes).
- **(b) Real death (recommended)** — 4+ days at `bleach = 1` kills it; the
  white **skeleton stays in the tank** as placed decor (real, poignant, and a
  standing reminder rather than a vanished toy). Removable for a few coins,
  or a new frag can be placed on the skeleton (also real). Matches the
  queen-death / fish-death brand: warnings escalate loudly first.
- **(c) Tiered** — soft corals (mushrooms, GSP, zoas, xenia, toadstool)
  always recover; stony corals (everything with a skeleton) can die per (b).
  Most honest to biology, gives the Easy roster a safety rail for the
  6-year-old and real stakes to the corals earned later.

---

## 4. Content plan

### 4.1 Reef roster — 14 items, invert-schema-compatible

Same schema as `src/species/inverts.js` with these deltas (kept as small as
the terrarium's):

- `kind: 'reef'` — routes to `buildReef()` the way `kind:'invert'` routes to
  `buildInvert()`, and drives the shop/book category.
- `zone: 'fixed'`, `speed: 0`, `schooling: 'solo'`, `predator/finNipper/
  longFins: false`, `edible: false`, `cleans: false` — schema-identical
  no-ops so `rules.js` and the card UI work unchanged.
- New: `placement: 'rock'|'sand'|'any'`, `reefSpace` (capacity points),
  `growDays` (real days frag→colony), `sting` (cm warn radius, 0 = none),
  `hosts` (clownfish surrogate host).
- `colors` reinterpretation (same keys, so the shader chunk is reused):
  `base` = flesh, `belly` = skeleton/stalk/mat, `fin` = tentacle-tip/rim
  accent, `pattern`+`patternColor` = polyp/ridge detail, `iridescence` =
  fluorescence strength.

File: `src/species/reef.js`, `export const REEF_SPECIES = [...]`:

```js
export const REEF_SPECIES = [
  {
    id: 'live_rock', common: 'Live Rock', scientific: 'Aragonite reef rock (with coralline algae)',
    water: 'salt', kind: 'reef', adultSizeCm: 20, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: true,
    price: 10, archetype: 'liverock', size: 1.0,
    placement: 'sand', reefSpace: 1, growDays: 0, sting: 0, hosts: false,
    colors: { base: '#9a8a7c', belly: '#7a6c60', fin: '#b05a8a',
      pattern: 'patches', patternColor: '#a04a80', patternScale: 1.4, iridescence: 0.0 },
    habitat: 'Old reef skeleton collected or farmed in warm shallow seas, crusted in pink coralline algae.',
    facts: [
      'The rock itself is not alive — it is old coral skeleton, but it is covered and filled with living things.',
      'Inside its holes live tiny helpers: little shrimp-like pods, worms, and sponges, like a stone apartment building.',
      'In a real tank, live rock works as a natural water filter — the reef cleans its own house.'
    ],
    care: 'Easy'
  },
  {
    id: 'green_star_polyps', common: 'Green Star Polyps', scientific: 'Briareum violaceum',
    water: 'salt', kind: 'reef', adultSizeCm: 12, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 20, archetype: 'polypMat', size: 1.0,
    placement: 'any', reefSpace: 1, growDays: 21, sting: 0, hosts: false,
    colors: { base: '#3db06a', belly: '#6a3a7a', fin: '#baf0c8',
      pattern: 'none', patternColor: '#e8ffe8', patternScale: 1.0, iridescence: 0.5 },
    habitat: 'Shallow Indo-Pacific reef rubble, carpeting rocks in bright green stars.',
    facts: [
      'It grows like a glowing green lawn and will happily carpet rocks, and even the glass, if you let it.',
      'Startle it and every star vanishes in a blink, leaving only a smooth purple mat.',
      'It is one of the fastest-growing corals — real keepers trim it back like grass.'
    ],
    care: 'Easy'
  },
  {
    id: 'zoanthid_garden', common: 'Zoanthids', scientific: 'Zoanthus sociatus',
    water: 'salt', kind: 'reef', adultSizeCm: 10, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 25, archetype: 'polypMat', size: 0.9,
    placement: 'rock', reefSpace: 1, growDays: 24, sting: 0, hosts: false,
    colors: { base: '#e05a2a', belly: '#8a5a3a', fin: '#3ac0c0',
      pattern: 'spots', patternColor: '#40d0d0', patternScale: 1.6, iridescence: 0.6 },
    habitat: 'Sun-baked shallow reef flats of the Caribbean and Indo-Pacific.',
    facts: [
      'Each little button is one animal, and a whole patch is a colony of identical twins.',
      'Collectors give the wildest color mixes names like "Rasta" and "Dragon Eye".',
      'They fold shut at night like flowers — and in real life you never touch them bare-handed, because some carry a strong toxin.'
    ],
    care: 'Easy'
  },
  {
    id: 'mushroom_coral', common: 'Red Mushroom Coral', scientific: 'Discosoma sp.',
    water: 'salt', kind: 'reef', adultSizeCm: 8, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 15, archetype: 'mushroom', size: 0.8,
    placement: 'rock', reefSpace: 1, growDays: 21, sting: 0, hosts: false,
    colors: { base: '#c03a3a', belly: '#7a4a4a', fin: '#e06a5a',
      pattern: 'spots', patternColor: '#e87a6a', patternScale: 1.2, iridescence: 0.35 },
    habitat: 'Dim, calm corners of Indo-Pacific reefs and lagoons.',
    facts: [
      'Tiny algae living inside its skin make food from light — the mushroom is solar-powered.',
      'It can slide slowly across a rock, and the bit of foot it leaves behind grows into a brand-new mushroom.',
      'It is one of the easiest corals in the world — the classic first coral.'
    ],
    care: 'Easy'
  },
  {
    id: 'toadstool_leather', common: 'Toadstool Leather Coral', scientific: 'Sarcophyton sp.',
    water: 'salt', kind: 'reef', adultSizeCm: 18, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 30, archetype: 'mushroom', size: 1.4,
    placement: 'rock', reefSpace: 2, growDays: 28, sting: 0, hosts: false,
    colors: { base: '#c8b890', belly: '#a89870', fin: '#e8dcc0',
      pattern: 'spots', patternColor: '#efe6cf', patternScale: 1.8, iridescence: 0.15 },
    habitat: 'Reef slopes and lagoons across the Indo-Pacific.',
    facts: [
      'When it is happy its leathery cap grows soft "fur" — hundreds of tiny feeding polyps.',
      'Every so often it sheds a waxy layer of skin like a snake and comes back shinier.',
      'A big toadstool can grow wider than a dinner plate and shade its neighbors like a beach umbrella.'
    ],
    care: 'Easy'
  },
  {
    id: 'pulsing_xenia', common: 'Pulsing Xenia', scientific: 'Xenia elongata',
    water: 'salt', kind: 'reef', adultSizeCm: 10, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 15, archetype: 'polypMat', size: 1.0,
    placement: 'rock', reefSpace: 1, growDays: 14, sting: 0, hosts: false,
    colors: { base: '#d8c8c0', belly: '#b0a098', fin: '#e8e0dc',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.3 },
    habitat: 'Shallow, fast-growing patches on Indo-Pacific and Red Sea reefs.',
    facts: [
      'Its feathery hands open and close nonstop, like a crowd of tiny clapping gloves.',
      'Scientists think all that pumping helps it breathe by stirring fresh water past its body.',
      'It grows so fast that real reef keepers end up giving handfuls away to friends.'
    ],
    care: 'Easy'
  },
  {
    id: 'candy_cane_coral', common: 'Candy Cane Coral', scientific: 'Caulastraea furcata',
    water: 'salt', kind: 'reef', adultSizeCm: 10, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: ['frozen'], edible: false, cleans: false,
    price: 35, archetype: 'branching', size: 0.8,
    placement: 'rock', reefSpace: 1, growDays: 30, sting: 0, hosts: false,
    colors: { base: '#3ab0a0', belly: '#c8c0a8', fin: '#7ae0d0',
      pattern: 'stripesV', patternColor: '#e8f8f0', patternScale: 1.4, iridescence: 0.55 },
    habitat: 'Sandy lagoons and sheltered reef slopes of the Indo-Pacific.',
    facts: [
      'Each glowing head is striped like a peppermint candy.',
      'Every branch tip is one head — and as it grows, each head splits neatly into two.',
      'At night it puts out short sticky tentacles to catch a midnight snack.'
    ],
    care: 'Medium'
  },
  {
    id: 'hammer_coral', common: 'Hammer Coral', scientific: 'Fimbriaphyllia ancora',
    water: 'salt', kind: 'reef', adultSizeCm: 15, bioload: 0, minSchool: 1,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: ['frozen'], edible: false, cleans: false,
    price: 60, archetype: 'tentacled', size: 1.1,
    placement: 'rock', reefSpace: 2, growDays: 35, sting: 10, hosts: true,
    colors: { base: '#4a9a6a', belly: '#b8b09a', fin: '#c8b040',
      pattern: 'none', patternColor: '#d8c860', patternScale: 1.0, iridescence: 0.6 },
    habitat: 'Turbid reef slopes of the Indo-Pacific, swaying in the current.',
    facts: [
      'Every tentacle ends in a little hammer-head — that is really what it is named for.',
      'It sways like an anemone, but underneath the soft part hides a hard stony skeleton it built itself.',
      'At night it can stretch out extra-long "sweeper" tentacles that sting neighbors — so it needs personal space.'
    ],
    care: 'Medium'
  },
  {
    id: 'torch_coral', common: 'Torch Coral', scientific: 'Euphyllia glabrescens',
    water: 'salt', kind: 'reef', adultSizeCm: 15, bioload: 0, minSchool: 1,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: ['frozen'], edible: false, cleans: false,
    price: 70, archetype: 'tentacled', size: 1.1,
    placement: 'rock', reefSpace: 2, growDays: 35, sting: 10, hosts: true,
    colors: { base: '#5a7a4a', belly: '#b0a890', fin: '#d8b830',
      pattern: 'none', patternColor: '#f0d060', patternScale: 1.0, iridescence: 0.7 },
    habitat: 'Deeper reef slopes of the Indo-Pacific, from East Africa to Fiji.',
    facts: [
      'Long flowing tentacles with bright glowing tips make it look like a burning torch.',
      'Its glow is real fluorescence — under blue moonlight the tips shine like neon.',
      'When there is no anemone around, clownfish will sometimes move into a torch coral instead.'
    ],
    care: 'Medium'
  },
  {
    id: 'open_brain_coral', common: 'Open Brain Coral', scientific: 'Trachyphyllia geoffroyi',
    water: 'salt', kind: 'reef', adultSizeCm: 12, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: ['frozen'], edible: false, cleans: false,
    price: 50, archetype: 'brain', size: 1.0,
    placement: 'sand', reefSpace: 2, growDays: 40, sting: 0, hosts: false,
    colors: { base: '#c04040', belly: '#8a7a5a', fin: '#40a860',
      pattern: 'stripesV', patternColor: '#38b068', patternScale: 1.2, iridescence: 0.65 },
    habitat: 'Soft sandy lagoon bottoms around Indonesia and northern Australia.',
    facts: [
      'It looks exactly like a small colorful brain resting on the sand.',
      'By day it puffs up with water to twice its size; by night it puts out tentacles and eats.',
      'That whole swirly brain is a single animal — one giant polyp.'
    ],
    care: 'Medium'
  },
  {
    id: 'plate_coral', common: 'Plate Coral', scientific: 'Fungia fungites',
    water: 'salt', kind: 'reef', adultSizeCm: 14, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: ['frozen'], edible: false, cleans: false,
    price: 40, archetype: 'plate', size: 1.0,
    placement: 'sand', reefSpace: 2, growDays: 40, sting: 0, hosts: false,
    colors: { base: '#8a5aa0', belly: '#b8a8c0', fin: '#e080b0',
      pattern: 'stripesV', patternColor: '#d890c0', patternScale: 1.6, iridescence: 0.5 },
    habitat: 'Sandy patches between Indo-Pacific reefs — lying loose, not attached.',
    facts: [
      'It is one of the only corals that is not glued down — it lies free on the sand like a dropped cookie.',
      'It can puff up with water and scoot itself slowly across the sand, and even flip itself back over.',
      'It starts life on a tiny stalk like a lollipop, then snaps off to live free.'
    ],
    care: 'Medium'
  },
  {
    id: 'montipora_cap', common: 'Montipora Cap', scientific: 'Montipora capricornis',
    water: 'salt', kind: 'reef', adultSizeCm: 18, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 30, archetype: 'plate', size: 1.3,
    placement: 'rock', reefSpace: 2, growDays: 30, sting: 0, hosts: false,
    colors: { base: '#e07a30', belly: '#b05a20', fin: '#f0b880',
      pattern: 'spots', patternColor: '#f8c890', patternScale: 1.8, iridescence: 0.4 },
    habitat: 'Reef slopes across the Indo-Pacific, spiraling toward the light.',
    facts: [
      'It grows in swirling plates that stack up like a stone rose.',
      'It is one of the fastest-growing stony corals — you can really watch it spread.',
      'Corals like this built the reefs: what looks like rock is millions of tiny skeletons stacked over centuries.'
    ],
    care: 'Medium'
  },
  {
    id: 'birdsnest_coral', common: 'Birdsnest Coral', scientific: 'Seriatopora hystrix',
    water: 'salt', kind: 'reef', adultSizeCm: 14, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 35, archetype: 'branching', size: 1.0,
    placement: 'rock', reefSpace: 2, growDays: 40, sting: 0, hosts: false,
    colors: { base: '#e89ab0', belly: '#c87a90', fin: '#f8ccd8',
      pattern: 'spots', patternColor: '#f8d8e0', patternScale: 2.0, iridescence: 0.3 },
    habitat: 'Shallow, bright reef tops of the Indo-Pacific and Red Sea.',
    facts: [
      'Its thin pink branches tangle together exactly like a bird\'s nest.',
      'Tiny gall crabs move into its branches and live their whole lives inside the coral\'s shelter.',
      'Its branch tips are needle-sharp — the "hystrix" in its name means porcupine.'
    ],
    care: 'Hard'
  },
  {
    id: 'acropora', common: 'Staghorn Acropora', scientific: 'Acropora millepora',
    water: 'salt', kind: 'reef', adultSizeCm: 16, bioload: 0, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed', speed: 0, schooling: 'solo', diet: [], edible: false, cleans: false,
    price: 90, archetype: 'branching', size: 1.1,
    placement: 'rock', reefSpace: 3, growDays: 45, sting: 0, hosts: false,
    colors: { base: '#40b090', belly: '#2a8a70', fin: '#e070a0',
      pattern: 'spots', patternColor: '#f090b8', patternScale: 2.0, iridescence: 0.7 },
    habitat: 'Bright, wave-washed reef crests across the Indo-Pacific, including the Great Barrier Reef.',
    facts: [
      'Acropora corals built most of the world\'s coral reefs — the greatest builders on Earth.',
      'One special night each year, whole reefs of acropora release their eggs all at once, like upside-down pink snow.',
      'It is the pickiest coral in the hobby — keeping one bright and growing is a reef keeper\'s black belt.'
    ],
    care: 'Hard'
  },
];
```

Validation snippet (INVERT_SPEC style — run after authoring):

```
node --input-type=module -e "import('/root/fishtank/src/species/reef.js').then(m=>{const s=m.REEF_SPECIES;console.log('count',s.length);const ids=new Set();for(const f of s){if(ids.has(f.id))throw new Error('dup '+f.id);ids.add(f.id);for(const k of ['id','common','scientific','water','kind','placement','reefSpace','growDays','sting','hosts','price','archetype','size','colors','habitat','facts','care'])if(f[k]===undefined)throw new Error(f.id+' missing '+k);if(f.facts.length!==3)throw new Error(f.id+' facts!=3');if(f.kind!=='reef')throw new Error(f.id+' kind');if(f.water!=='salt')throw new Error(f.id+' water');}console.log('OK')})"
```

### 4.2 Existing saltwater fish that get reef behaviors FOR FREE

No species data changes required — all keyed off tags/archetypes already in
`src/species/saltwater.js`:

| Fish (shipped) | New behavior | Implementation |
|---|---|---|
| ocellaris / percula / tomato / maroon / clarkii clownfish (`hostsAnemone`) | **hosting bond** (§1.4): lives at, sleeps in, retreats into its anemone (or torch/hammer) | `_restLogic` + `startleNear` rerouting |
| six_line_wrasse | sleeps **inside the rockwork** at night (real: it spins a mucus cocoon in a crevice) | rest episode with target = nearest live-rock hollow instead of open sand |
| melanurus_wrasse, yellow_coris_wrasse | **dive under the sand** to sleep (real Halichoeres behavior — they vanish at dusk!) | rest path with `pos.y` sunk 1.5 cm below `TANK.SAND_H`; kid discovers the "missing" fish is asleep in the sand — a Fish Book fact comes alive |
| all 8 tangs + lawnmower_blenny + kole_tang (`diet` includes algae) | **graze the live rock**: periodic peck-visits to placed rock instead of aimless cruising | food-seek steering with rock surface points as pseudo-targets; visual pecks |
| mandarin_dragonet, spotted_mandarin (`expertDiet`) | **hunts pods on live rock** — each placed live rock slows their hunger accrual a notch | true husbandry ("mandarins need mature live rock") expressed as `hunger` rate × (1 − 0.1 × min(4, rocks)); makes the Hard fish genuinely easier WITH a reef, teaching the real lesson |
| banggai_cardinalfish | hovers near a torch/anemone for shelter (real: they shelter in urchins and anemones) | zone steering pull toward nearest tentacled item, no bond |

DECISION FOR JOHN — D5: does tang/blenny grazing actually reduce the `algae`
meter (small, capped/day) or stay purely visual? (a) visual only — scrubbing
stays 100% the kid's job and XP source; (b) tiny capped reduction —
clean-up-crew fantasy is real (recommended: cap at 0.1/day so the wipe
ritual and its XP survive).

---

## 5. Keeper progression integration (`src/progress.js`)

Three ways to ship 14 items into the earned catalog:

- **(a) Append to the existing `WEEKLY` pool** (`main.js`). Cheapest — zero
  code. But `weeksAvailable()` counts from the account-old `k.t0`: every
  veteran keeper (weeks past the current 8 batches) receives ALL reef
  batches in one dump on day one. Kills the slow-burn for exactly the
  players most invested.
- **(b) Fold into keeper-level deliveries** (the `order` array). Also cheap,
  but corals interleave arbitrarily with fish in the care/price sort, there's
  no "the reef has arrived" moment, and high-level keepers again get most of
  it instantly.
- **(c) RECOMMENDED — a gated reef track with its own clock.** At **Keeper
  level 6** (a few weeks of proven real care — corals are earned), a one-time
  event: toast "🪸 New at the shop: LIVE CORAL! Your salt tank can become a
  reef!", sets `k.reefT0 = Date.now()`. Reef batches then drip **weekly from
  reefT0**, so the newest level-6 kid and the day-one veteran both get the
  same five-week reef arc:

  | Reef week | Drop | Contents |
  |---|---|---|
  | 1 | 🪨 Reef Starter | live_rock, green_star_polyps, mushroom_coral |
  | 2 | 🍄 Soft & Squishy | zoanthid_garden, toadstool_leather, pulsing_xenia |
  | 3 | 🍬 Stony Starters | candy_cane_coral, plate_coral, open_brain_coral |
  | 4 | 🔥 The Flow Show | hammer_coral, torch_coral (surrogate hosting arrives) |
  | 5 | 🏆 Reef Builder Legends | montipora_cap, birdsnest_coral, acropora |

  Keeper change is small: `constructor(..., weeklyPool, reefPool)`, a
  `reefWeeksAvailable()` clone of `weeksAvailable()` anchored on `k.reefT0`,
  and `unlocked()`/`weeklyNews()` iterating both tracks. Existing weekly
  code untouched.

**DECISION FOR JOHN — D2:** (a) vs (b) vs (c) above. Recommendation: (c).

Adjacent hooks, all existing plumbing: placing a new reef species fires the
normal `discover` XP + Fish Book flow (it's just a species id in
`discovered`); a coral reaching `growth = 1` fires `award('grown')` (15 XP,
already day-capped by rarity); shop gets a 🪸 filter chip in the existing
`filterbar`; the Book gets a 🪸 Reef tab beside fresh/salt/invert
(`kind === 'reef'` filter — one line in `bookTabs`). Future secret (post-MVP,
fits `SECRETS` exactly): `{ id: 'harlequin_shrimp'-class reward, hint:
'Grow a coral all the way to a colony…', test: k => k.n.colonies >= 1 }`.

---

## 6. The four retention mechanics — coral growth is the slowest burn in the game

Per `HABITAT_VISION.md`, all four, made concrete:

1. **Care debt.** The water meter now has a hostage that reacts FIRST
   (§3.1): come back to retracted polyps, then paling, then bleaching — a
   visible, escalating, reversible consequence ramp that starts before any
   fish is in danger. Offline decay (`applyOffline`, capped 96 h) drives it,
   and the bleaching notification rides the existing `notify` pipeline.
2. **Growth & babies — the WEEKS-long loop.** Fish grow up in 5 days; a
   coral takes 3–6 real weeks, and the reef as a whole takes the full
   five-week drop arc plus months of growing. Concrete milestones, each a
   `sim.events`-style moment:
   - **Placed (0.25 "Frag")** — card shows "Frag → Colony 0%".
   - **0.5 — visible structure**: branching corals pop a new branch
     generation (`uGrowth` reveal), mats double their polyps. Toast: "🪸 Your
     torch coral grew a new head!"
   - **1.0 — "Colony"** (~3–6 weeks): fanfare toast, `award('grown')`, Book
     card gains a ⭐ Colony badge + records the date (like fish record size),
     `k.n.colonies++`.
   - **Post-colony: frag & spread events** (below) — growth never fully
     stops paying out.
3. **Collection book.** 🪸 Reef tab, 14 cards with real facts; card shows
   live growth %, colony badge, and (if it ever bleached and recovered) a
   quiet "Survivor" note — the tank's history becomes the collection. Reef
   completion % sits beside the fish counts.
4. **Surprises** (join the existing `rollSurprise()` table, gated on owning
   the relevant coral):
   - **Frag drop** — a grown branching/mat coral sheds a frag onto the sand
     (glowing like the treasure chest). Tap: keep it (free baby coral →
     placement mode) or, if reef space is full, sell it (coins — "the frag
     swap", straight from real hobby culture). DECISION D3 below.
   - **Xenia / GSP spread** — a new small patch appears overnight on an
     adjacent rock ("Your star polyps spread to the next rock!"). Real,
     slightly mischievous, and it makes the reef feel alive while you sleep.
   - **Night sweepers** — after 21:00 (`rawDayFactor() = 0`) hammer/torch
     extend long sweeper tentacles and candy cane / brain / plate show
     feeding tentacles: the reef is a different place at night, catchable
     only by the night-owl kid (synergy with the existing 🌙 secret).
   - **Plate coral walked** — the free-living plate is a few cm from where
     it was left, once in a while. No announcement. Kids notice.
   - **Coral spawning night** — very rare, night-only: pink "snow" drifts UP
     (reuse the motes system inverted) for a few minutes. Once-a-year magic
     in the real ocean; a treasured rumor in the game.
   - **First hosting** (§1.4) — the pack's signature moment.

---

## 7. MVP cut

**6 items, 5 of 7 archetypes, every core system exercised:**

| Item | Archetype | Why |
|---|---|---|
| Live Rock | liverock | placement target, wrasse/tang/mandarin behaviors hang off it |
| Green Star Polyps | polypMat | fastest grower = first kid to see growth pay off; retract drama |
| Zoanthids | polypMat | color firework, instancing proof |
| Red Mushroom | mushroom | the classic first coral, cheapest mesh |
| Torch Coral | tentacled | sway-contract reuse + surrogate hosting + night sweepers |
| Montipora Cap | plate | a stony builder with visible plate growth |

**Systems in MVP:** `tank.reef` state + migration, placement mode
(buy/move/cancel, ghost validity), `evaluatePlace` (water/capacity/substrate
+ sting warn), ReefSim growth + polyp-retract + bleach with the full warning
ramp (§3), growth/bleach/retract uniforms on the shared coral material,
clownfish hosting bond (works day one with the SHIPPED bubble-tip anemone;
torch as surrogate), 🪸 Book tab + shop chip, growth-milestone toasts, ONE
surprise (frag drop), keeper gate at level 6 unlocking all 6 MVP items at
once (the weekly reef track ships with the full 14-item roster).

**Deferred:** acropora/birdsnest L-system + remaining 6 species (weeks 3–5
of the drop track), xenia pulse animation, LPS target-feeding, mandarin pod
buff, wrasse sand-sleeping + six-line cocoon, tang rock-grazing, coral
spawning night, plate-coral walking, sessile-invert placement migration
(D4), coral secret unlock, `shot_reef.png` in CI-ish scripts (write it when
the first coral renders).

---

## 8. DECISIONS FOR JOHN (recap)

- **D1 — Bleaching endgame** (§3.4): (a) corals never die, stay white until
  rescued; (b) real death after 4+ days fully bleached, skeleton remains in
  the tank (recommended — matches the care-with-stakes brand and the
  queen-death precedent); (c) tiered — softies always recover, stony corals
  can die (most biologically honest, gentlest on-ramp).
- **D2 — Progression shape** (§5): (a) append to existing WEEKLY pool
  (veterans get everything at once); (b) fold into keeper-level deliveries
  (no arrival moment); (c) level-6-gated reef track with its own weekly
  clock (recommended — every kid gets the same five-week reef arc).
- **D3 — Frag economy** (§6): (a) frags are always free baby corals; (b)
  frags always sell for coins; (c) keep-or-sell based on reef space, kid
  taps to choose (recommended: keep if space, auto-offer coins if full — no
  dialog, stays calm).
- **D4 — Sessile invert placement** (§1.2): (a) anemones/feather dusters
  keep spawning at random fixed spots; (b) newly bought sessiles go through
  the new placement mode (recommended — one code path, and the kid chooses
  the clownfish's home).
- **D5 — Grazing gameplay effect** (§4.2): tang/blenny rock-grazing is (a)
  purely visual, or (b) reduces the algae meter a tiny capped amount per day
  (recommended: (b) with a 0.1/day cap so scrubbing remains the kid's job
  and XP source).
