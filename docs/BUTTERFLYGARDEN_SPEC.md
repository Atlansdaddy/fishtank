# Butterfly Garden — Habitat Pack Spec

The gentle flight habitat. Where the aquarium's retention loop is *care debt*
and the ant farm's is *the colony digging while you sleep*, the Butterfly
Garden's is **metamorphosis over real days**: egg → caterpillar → chrysalis →
the eclosure moment. That transformation IS the pet, and it is deliberately the
**training wheels for the Aviary** (ROADMAP §8→9): flutter flight is a cheap,
noisy 3D wander that the Aviary later grows into full flight boids. Everything
below is sized for John's phone baseline (S24-class, 60 fps, same budget the
42-fish aquarium hits today) and reuses the aquarium engine wherever it can.

---

## 1. Enclosure rendering (reuse `src/tank.js` pattern)

`buildGarden(scene, renderer)` returns the same handle shape as `buildTank()`:
`{ group, setTheme(type), setDay(df), update(t) }`, so `main.js` swaps it in
without touching the frame loop. The enclosure is a walk-in mesh flight house:
a screened cube with planted beds, not a glass box. The `TANK` dims
(`122×61×61`) read as a tabletop butterfly cage; a larger `subtype: 'walkin'`
theme later just scales the box.

| Aquarium element (`tank.js`) | Butterfly Garden equivalent | Notes |
|---|---|---|
| Glass frame (`addFrame`) | Aluminium/wood cage frame | Identical bars; recolor frameMat to pale powder-coat `#c8c4b8`. Keep `TANK`/`BOUNDS`. |
| Back & side inner walls (`BackSide` box) | **Mesh netting walls** | The signature look. Replace the dark box with a `BackSide` box whose material is a **netting shader** (below). Behind it, a soft blurred garden backdrop (gradient sky → foliage) so the net reads as "outside is a garden". |
| Sand bed (displaced `PlaneGeometry`) | Mulch / soil bed | Same displaced plane; theme colors `soil`/`soilDark`. Scatter bark-chip and pebble sprites; a few fallen leaves (host-plant litter, see §2 caterpillar chew). |
| Water surface plane | **None** (dry) | Skip. Optional shallow "puddling" mud dish (males drink minerals — real behavior, a fact card) reusing the terrarium water-dish disc. |
| Caustics shader on sand | **Dappled sun-through-leaves** | Reuse the caustics quad slot verbatim: same additive ShaderMaterial disc, warmer tint `#fff0c0`, lower contrast, drives off the `day` uniform. Reads as sunlight broken by the canopy. |
| `buildShafts()` sun shafts | Keep, warm garden light | Warm the tint to `vec3(1.0,0.94,0.78)`; angle steeper. Gorgeous with fluttering wings crossing them. |
| `buildBubbles()` airstone | **Misting burst** | Same `Points` system inverted (terrarium pattern): particles spawn top on `mist()`, fall with drift, fade. Idle count 0. |
| `buildMotes()` marine snow | **Pollen / drifting spores + the odd stray petal** | Keep as-is; recolor warm gold, very low opacity, slow lateral drift. Doubles as "air is alive". |
| Decor (`buildDecor` in `main.js`) | **Flowering plants + host plants + perch twigs** | The heart of this habitat — plants are functional, not just decor. Three plant roles below. |

### Plant roles (functional decor)

Plants are the interactive furniture of this habitat the way branches are the
terrarium's climb targets. Three roles, each a `buildDecor` subtype:

| Role | What it is | Function | Render |
|---|---|---|---|
| **Nectar flower** | Blooming flowers (lantana, zinnia, buddleia clusters) | **Feeding stations** — adults land here and uncurl the proboscis to drink; the `nectar` care meter refills them (§4). A drained flower visibly wilts/browns; refilled, it re-blooms. | Billboarded flower-cluster cards + a few 3D petal cones; a per-flower `bloom` 0..1 uniform fades saturation and droop. |
| **Host plant** | Species-specific leaves (milkweed for monarch, citrus for swallowtail, etc.) | **Caterpillar food + egg site.** Caterpillars crawl and **eat** these — leaf area shrinks via chew decals (§2). Strip a host bare and it must be replanted (`host-plant health` meter, §4). | Broad-leaf blades (reuse terrarium's broadened plant blades) with a per-leaf `eaten` 0..1 uniform that masks the leaf edge inward. |
| **Perch twig** | Bare sticks, net corners | **Chrysalis attachment + basking/roost spots.** A chrysalis hangs here for days; adults roost here at night; a "J-hang" caterpillar attaches here before pupating. | Bent `TubeGeometry` twigs (terrarium branch reuse) exposing `{points[], tangents[]}` so a hanging chrysalis or perched adult snaps to a curve point (terrarium "branch perch" reuse). |

### Netting shader (moiré-safe — the phone-screen hazard, addressed)

A fine repeating net texture is the #1 way to get **moiré shimmer** on a phone:
the net's pixel pitch beats against the display's pixel grid and against
mip-transitions as the camera orbits. We must not ship a naive tiled net PNG.

**Approach — procedural net in the fragment shader with distance-based fade,
never a sampled high-frequency texture:**

```glsl
// net wall fragment (BackSide box). vUv spans the wall in "cell" units.
uniform float cell;        // world cells per net square (~0.9cm)
uniform float fade;        // world distance at which the net dissolves to flat
varying vec2 vUv; varying float vDist;
void main(){
  // analytic line coverage with screen-space AA (fwidth) => no aliasing, no moiré
  vec2 g = abs(fract(vUv) - 0.5);
  vec2 w = fwidth(vUv);                       // pixel footprint of one cell
  vec2 line = smoothstep(vec2(0.0), w*1.5, 0.5 - g - 0.02);
  float net = 1.0 - min(line.x, line.y);      // 1 on the thread, 0 in the hole
  // KEY: when one net cell is smaller than ~1 screen pixel, stop drawing threads
  float density = clamp(max(w.x, w.y) * 2.0, 0.0, 1.0);   // grows as net shrinks on screen
  net = mix(net, 0.18, density);              // dissolve to a flat translucent grey
  net = mix(net, 0.18, smoothstep(fade*0.6, fade, vDist));
  float a = mix(0.06, 0.34, net);             // holes barely visible, threads soft
  gl_FragColor = vec4(vec3(0.72,0.72,0.68), a);
}
```

Rules that keep it moiré-free on an S24:
- **Analytic, not sampled.** `fwidth`-based line AA computes exact per-pixel
  coverage; there is no texel grid to beat against the screen.
- **Density dissolve.** When the projected net cell drops below ~1px
  (`density → 1`), threads fade to a flat translucent film — the exact regime
  where moiré would appear is the regime where we stop drawing lines.
- **Distance fade.** Far net walls become a soft grey haze (`fade`), so the
  back wall never buzzes behind the animals.
- No mipmaps to transition (nothing is sampled), so no mip-shimmer while
  orbiting. `renderer` MSAA (already on) cleans the near threads.

`setTheme` swaps net tint + backdrop; `setDay` dims the backdrop sky and the
dappled-light uniform exactly like the aquarium caustics.

Theme entry (`WATER_THEMES` sibling — becomes per-pack `themes` after the split):

```js
garden: {
  fogColor: 0xdfe8d8, fogDensity: 0.0009,     // bright, airy — almost no fog
  deep: 0xbcd0b0, tint: 0x9fc07a,
  lightColor: 0xfff4dc, lightIntensity: 1600,
  ambient: 0x6a7858,
  soil: 0x4a3a26, soilDark: 0x2e2214,
  net: 0xb8b8ac, sky: 0xbfe0ef,               // backdrop sky
  bloom: 0xffd0e0,                            // default flower accent
}
```

---

## 2. The metamorphosis pipeline (the core spec — this habitat's dig model)

Metamorphosis is to the Butterfly Garden what the dig grid is to the Ant Farm:
the one structural system the whole habitat is built around. It maps directly
onto the **existing growth system** (`f.growth`, `SIM.GROW_DAYS`, the `'grown'`
event) and the existing save format — a butterfly is one care record that walks
through life stages, not four separate entities.

### 2.1 One record, four stages

Each individual is a single `fish[]` record (rename-agnostic; the engine never
cared what `sp`/`kind` mean). We add one field, `stage`, and reuse `growth`
0..1 as **progress within the current stage**. When `growth` hits 1, the record
advances to the next stage and `growth` resets.

```js
// a butterfly record (superset of the fish record in sim.js addFish)
{
  id, sp, name, kind: 'lep',
  stage: 'egg' | 'caterpillar' | 'chrysalis' | 'adult',
  growth: 0.0..1,          // progress through THIS stage (reused field!)
  instar: 1..5,            // caterpillar molt count (caterpillar stage only)
  hunger, health,          // as today; meaning shifts per stage (below)
  bornAt: epochMs,         // for adult lifespan (§7)
  hostId: <plant instId>,  // which host plant this caterpillar is eating
  perchId: <twig point>,   // where the chrysalis hangs / adult roosts
  var, bioload,            // as today
}
```

### 2.2 Stage table (maps onto `SIM.GROW_DAYS` and the dual clock)

Durations use the **existing dual-clock pattern** (`GAME_HOURS_PER_REAL_MIN`
foreground so a kid sees progress in a session; real hours offline so a school
day is real growth) exactly like the ant farm brood cycle. Each stage's
duration is a `SIM`-style tuning constant; `GROW_DAYS` is the caterpillar
anchor (kept meaningful for shared code).

| Stage | Real duration | Locomotion | `growth` drives | Feeds on | Payoff / event |
|---|---|---|---|---|---|
| **Egg** | ~0.5 day (`EGG_DAYS`) | none (static on host leaf) | subtle darkening + a tiny visible larva curled inside near hatch | — | tiny "hatched" toast; caterpillar crawls out |
| **Caterpillar** | ~2.5 days (`GROW_DAYS`, reused) | **`crawl`** (existing) | body scale ↑, 5 instars (molt = shed prop, retention) | **host plant** — visibly, leaf-chew decals | grows fat; at `growth≈1` climbs a twig, hangs in a **J**, molts to chrysalis |
| **Chrysalis** | ~5–8 days (`CHRYSALIS_DAYS`) | none (attached to `perchId`) | color: opaque → **translucent**, wings showing through in the last ~10% | — | subtle wiggle; the **eclosure hold** (§2.4) |
| **Adult** | days–weeks (§7, `ADULT_LIFE_DAYS`) | **flutter** (NEW, §3) | wing wear + fade as it ages; lays eggs mid-life (§7) | **nectar flowers** | the collection-book generation; eventual honest death |

`stage` advance logic lives in `_decay()` alongside today's growth code — one
added branch, not a new subsystem:

```js
// inside _decay, replacing the plain growth bump for kind:'lep'
if (f.kind === 'lep') {
  const perDay = 1 / STAGE_DAYS[f.stage];         // egg/cat/chrys/adult
  const canGrow = f.stage === 'caterpillar'
    ? (f.hunger < 0.7 && hostHealth(f.hostId) > 0) // must have leaf to eat
    : f.stage === 'adult' ? false                  // adults don't "grow", they age (§7)
    : true;                                         // egg/chrysalis advance on the clock
  if (canGrow) {
    f.growth = Math.min(1, f.growth + hours/24 * perDay);
    if (f.stage === 'caterpillar') f.instar = 1 + Math.floor(f.growth * 4.99);
    if (f.growth >= 1) advanceStage(f);             // resets growth, emits event
  }
}
```

### 2.3 Caterpillar eats the host plant (visible — leaf-chew decals)

The caterpillar stage must *show* consumption; it is the cause-and-effect
lesson and the reason host-plant health is a care meter (§4).

- Each host plant carries `leafArea` 0..1 (its `bloom`-style uniform). A
  caterpillar assigned `hostId` reduces that host's `leafArea` while feeding —
  the same accounting as fish eating food, but the "food" is the plant.
- **Chew decals:** each host leaf mesh has an `eaten` uniform; as `leafArea`
  drops, the shader masks the leaf inward from the edges with a scalloped
  (cosine-noise) boundary — the classic caterpillar-chewed leaf silhouette.
  Cheap: one float per leaf, no geometry edits.
- Caterpillar `hunger` rises as today; it crawls (existing `crawl` locomotion)
  toward its host and "eats" on contact (`food`-style eat tick against the
  plant instead of a `FoodSystem` item). A stripped host (`leafArea → 0`) means
  caterpillars stall (`canGrow` false) → the kid must replant (§4).
- Frass (droppings) is a tiny surprise: occasional dark speck sprites drop to
  the mulch under a feeding caterpillar (a real, funny, kid-true detail; also
  the honest "they poop a lot" fact).

### 2.4 The eclosure moment (the payoff — hold it until the kid is watching)

Adults really emerge from the chrysalis in minutes, and if the kid misses it
the magic is gone. We use the **exact pattern the aquarium already ships**:
`triggerFeedingRush()` holds the feeding-rush until the app is (re)opened
(`main.js` fires it after `applyOffline`, on visibility change). We add a
**pending-eclosure hold**:

- When a chrysalis reaches `growth ≥ 1` **offline**, it does **not** eclose in
  the background. Instead it is marked `pendingEclosure = true` and frozen at
  the translucent, wings-visible final look. Offline decay caps at
  `OFFLINE_CAP_HOURS` (96) as usual — a chrysalis "ripe" for days simply waits.
- On app open, after `applyOffline()` and the welcome-back toast, the engine
  scans for `pendingEclosure` records. If any, it **stages an eclosure show**:
  camera eases to the chrysalis (reuse `cam.follow`), a soft chime
  (`audio.js` one-shot), then over ~8 s the chrysalis splits, the adult crawls
  out with crumpled wings, hangs, and **pumps its wings from folded to full**
  (a wing `unfurl` 0..1 uniform, §8) before the first flutter.
- If multiple are pending, they eclose one at a time (queued like the ant
  farm's reveal cards) so each gets its moment.
- Foreground eclosure (kid happens to be watching when `growth` crosses 1)
  plays the same show inline. Either way, **the kid sees it happen** — that is
  the whole retention beat.

Migration/save: `stage`, `instar`, `bornAt`, `pendingEclosure` all default in
`_migrate()` the way `f.growth ??= 1` already does. A pre-existing save has no
`lep` records, so the branch is inert until the pack ships (additive, per
ENGINE_SPLIT §6).

---

## 3. Flutter flight locomotion (NEW — cheap, and grows into the Aviary)

Adult flight is a new locomotion module `flutter` (registered by the pack, per
ENGINE_SPLIT §3 locomotion registry). It is spec'd as a **state machine** like
the terrarium hop, not as boids — deliberately cheap, and deliberately shaped
so the Aviary can graduate it into full flight boids without a rewrite.

States: `perched → takeoff → flutter → seek → land → basking → perched`
(+ `roost` at night, + `startle`).

- **perched / roost**: clung to a twig, flower, or net point (`perchId`, reuse
  terrarium branch-perch snap). Wings do a slow open–close **basking** cycle
  (a `wingOpen` 0..1 sine, 0.2–0.6 Hz), occasional antenna twitch. At night
  (`nightFactor` high) diurnal butterflies **roost** here wings-shut (existing
  `_restLogic` rest path, target = nearest perch instead of sand). Moths do the
  inverse (§6 night shift).
- **takeoff** (0.2 s): a small squash-and-launch off the perch; pick a target
  (see seek).
- **flutter** (the signature motion — the cheap noisy wander):
  ```
  heading += curlNoise2D(pos, t) * WOBBLE      // erratic, non-repeating path
  wingBeat = sin(t * beatHz + phase)           // 8–12 Hz visual, decoupled from motion
  // bobbing lift: butterflies rise on each downstroke
  vel.y += max(0, wingBeat) * FLAP_LIFT - G_SOFT*dt
  vel += heading * flutterSpeed
  vel *= drag                                  // heavy air drag => floaty, slow
  ```
  The path is **noise on the heading** (Perlin/curl), not straight-line steering
  — that is what makes a butterfly read as a butterfly and not a fish. `WOBBLE`
  is high, `flutterSpeed` low, `drag` heavy → the floaty, drunken-looking flight.
  No neighbor awareness (unlike boids) — each butterfly wanders independently,
  which is both accurate and cheap.
- **seek**: when hungry, bias the noisy heading toward the nearest un-drained
  nectar flower (`food.nearestFor`-style query against flowers). Weak bias, so
  it still meanders there rather than beelining. Also targets the **kid's tap
  point** — a tap on a flower (or open palm gesture) makes nearby adults drift
  toward it and maybe land (the "it landed on me" magic; reuses `tapSelect`
  raycast + `playerFocus`).
- **land** (0.3 s): decelerate onto the target flower/twig/net/tap-point, snap
  to perch, fold to basking. If landed on a nectar flower with `bloom > 0` →
  drink (proboscis uncurl anim), `sim.feed`, flower `bloom` drops a little.
- **startle**: `startleNear()` already reaches all agents — a startled adult
  bursts upward with a fast erratic climb (map `a.startle` to a big transient
  `WOBBLE` + upward `vel`), then settles. Butterflies scattering when the kid
  taps the net is a lovely, free interaction.

### Designed to grow into the Aviary (ROADMAP §8→9)

The `flutter` module is written as the **degenerate case of the flight boids**
the Aviary will need, so the Aviary extends rather than replaces it:

| Butterfly `flutter` (cheap) | Aviary `flight` (full) | The seam |
|---|---|---|
| Per-agent noisy wander, no neighbors | Boids: separation/alignment/cohesion | `flutter` already runs in the `Swarm.update` slot; the Aviary turns on the `_boids()` call (already in `behavior.js`) with a flight weight. |
| `heading += curlNoise` | same noise as *wander* term added to boid steering | The noise field stays; it becomes the wander component of steering. |
| Soft gravity + flap lift bob | real gravity + flap-powered climb, gliding, stall | `FLAP_LIFT`/`G_SOFT` become the physically-tuned pair; add a glide state. |
| Perch snap on twigs | perch on branches + landing approach flare | Same `perchId` snap; add an approach-vector landing. |
| No path planning | targeted flight (to feeder, to nest) with obstacle avoid | The weak `seek` bias becomes a real steering target. |

The Aviary build is then "add neighbor terms + real physics tuning + glide" to
a working module — the intended cheap-tech-first sequence.

---

## 4. Care model mapping (reuse `CareSim` in `src/sim.js`)

`CareSim._decay()` already handles decay, offline, health, growth. Meters get
relabeled per pack config (ENGINE_SPLIT §4). What the kid **does daily**: refill
nectar, keep host plants alive, mist for humidity, keep the net clean.

| Aquarium meter | Butterfly Garden meter | Mechanics & the daily action |
|---|---|---|
| `tank.water` (quality 1→0) | **Nectar** | Sum of `bloom` across nectar flowers, normalized. Adults drinking lowers it; it does **not** self-recover (unlike the aquarium filter). Daily action: **tap a flower to refill nectar** (a watering-can / nectar-feeder tool, `waterChange()` reuse, +0.55) or **drop a fruit slice** (orange/banana — real butterfly food, §5) as a feeding station. Nectar near 0 → adults hungry → health drain via the existing `t.water < SICK_THRESHOLD` path. |
| — (new) | **Host-plant health** | Sum of `leafArea` across host plants. Caterpillars strip it (§2.3). Daily action: **replant / add a fresh host plant** when leaves run low (a shop item + a "replant" tap on a bare stem, restores `leafArea`). At 0, caterpillars can't grow (stall, not death) — a gentle, recoverable fail, like the ant farm's overwater collapse. Drives a "your caterpillars are hungry — the milkweed is bare!" toast. |
| `tank.algae` (0→1, dirty glass) | **Net cleanliness** | Identical mechanic: dust, frass specks, old scales film the netting over `ALGAE_DAYS`-style time. The existing wipe gesture (`sim.scrubAlgae(0.015)` per pointermove + sparkles) works unchanged — the kid wipes the net clean. Dirty net dims the whole garden (lower light) and slightly speeds nectar loss (bugs). |
| — (optional new) | **Humidity / misting** | New meter `tank.humidity` like the terrarium's, decays toward 0 (`HUMIDITY_DECAY_DAYS ≈ 2`). Daily action: **mist** (the misting-burst particles, §1). Low humidity slows caterpillar growth and dulls chrysalis (eggs desiccate — kept gentle, a stall not a kill). Chrysalises and freshly-eclosed adults *need* it — a soft educational nudge. **Kept in scope but MVP-optional (§9).** |
| Rotting food pollution | Fallen/overripe fruit | Fruit-slice feeders overripen: after a while they brown and draw fruit-fly motes (cute), dinging net cleanliness slightly. Reuses the `rottingFood` accounting path. |
| Offline decay | Identical | `applyOffline()` loops the garden's subtype exactly as it loops `['fresh','salt']` today. The marquee offline event is metamorphosis progress + **pending eclosures waiting** (§2.4), not decay damage. |

`summary()` maps cleanly to the HUD pills: `hungriest` = adult nectar need,
`avgHealth` = flock health, `water` = nectar, `algae` = net grime, plus the new
host/humidity pills. `rules.js` `evaluateAdd()` runs **unchanged**: bioload =
cage air space, `water !== current` blocks garden species in the fish tank,
the mantis predator rule (§7) rides the existing `predator`/`canEat` path.

**What the kid does daily, in one breath:** refill the flowers with nectar,
check the caterpillars haven't eaten the milkweed bare (replant if so), wipe
the net, mist — then watch who's fluttering, who's hanging in a chrysalis, and
whether anyone is about to eclose.

---

## 5. Foods table

`FOODS` sibling, same field shape. Nectar/fruit are adult foods; the host
"food" is the living plant (§2.3), not a dropped item. Behaviors are the
per-food strategy the split introduces (`sink`/`hop`/`static`/`drip`).

| id | name | emoji | eaten by | behavior when placed |
|---|---|---|---|---|
| `nectar` | Nectar Refill | 💧 | all adult butterflies & moths (that feed) | not a dropped item — **refills flower `bloom`** at tap point (`drip` behavior); the flower is the feeding station |
| `fruit` | Fruit Slice | 🍊 | most adults; blue morpho, many nymphalids **prefer** fruit over nectar | `static` — an orange/banana slice sits on a feeding stump; browns over time (rot accounting) |
| `sugarwater` | Sugar-Water Feeder | 🥤 | all feeding adults | `static` dish; a sponge feeder — never rots, low value, the reliable staple |
| `hostplant` | Host Plant (milkweed/citrus/passionvine/…) | 🌿 | **caterpillars only**, species-matched | placed as decor; restores `host-plant health`; caterpillars graze it (§2.3) |
| `minerals` | Mud Puddle | 🟫 | male swallowtails/blues (puddling) | `static` damp patch; a behavior treat + fact card, no health value |

Design notes:
- **Adults of some species don't eat at all** — the atlas and luna moths have
  no functional mouthparts (§6). Their records have `diet: []`; nectar/fruit
  are irrelevant to them; they live on stored fat and simply age (§7). This is
  a real, astonishing fact and is surfaced honestly, not hidden.
- Caterpillars are **host-specific** in real life (monarch = milkweed only).
  The shop sells the matching host plant with each caterpillar/egg; a caterpillar
  with no matching host stalls — a purchasing-time `rules.js` warn ("Monarch
  caterpillars only eat milkweed — add a milkweed plant too").

---

## 6. Species plan

### Target roster (~20 authored when the build starts; flagships below)

Day shift (butterflies): monarch, painted lady, common buckeye, tiger
swallowtail, black swallowtail, blue morpho, red admiral, zebra longwing, gulf
fritillary, cabbage white, common birdwing, peacock butterfly, orange-barred
sulphur. Night shift (moths — the day/night system hands the garden to them
after dark): atlas moth, luna moth, cecropia moth, rosy maple moth, hummingbird
hawk-moth (crepuscular, hovers — a flutter-flight showpiece). Optional
predator: Chinese/European mantis resident (§7).

### 6.1 Flagship species — authored in the exact `freshwater.js` schema

Deltas applied consistently (mirrors the terrarium's schema deltas):
- `water: 'garden'`; `kind: 'lep'` (selects the butterfly builder).
- `zone`: `'canopy' | 'flowers' | 'ground'` (where it prefers to fly/perch;
  `zoneY()` maps `canopy`→upper third, `flowers`→mid, `ground`→low).
- `locomotion: 'flutter'` for all adults (the crawler/chrysalis stages are
  driven by `stage`, not `locomotion`).
- New `host`: the caterpillar's food plant id. New `nightShift: true` for moths.
- `wingspanCm` reuses the `adultSizeCm` slot (it IS the size that matters).
- `colors.iridescence` — the schema already has it — carries the blue morpho
  and swallowtail shimmer. Pattern uses the existing `PATTERN_ID` set.
- Facts: exactly 3, true, kid-aimed (age ~6, read aloud), per SPECIES_SPEC.

```js
export const BUTTERFLY_SPECIES = [
  {
    id: 'monarch', common: 'Monarch Butterfly', scientific: 'Danaus plexippus',
    water: 'garden', kind: 'lep', adultSizeCm: 10, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['migratory'], zone: 'flowers', locomotion: 'flutter', host: 'milkweed',
    speed: 0.8, schooling: 'loose', diet: ['nectar', 'fruit', 'sugarwater'], price: 40,
    archetype: 'butterfly', size: 1.0,
    colors: { base: '#e8801c', belly: '#f0a850', fin: '#1a1a1a',
      pattern: 'patches', patternColor: '#1a1a1a', patternScale: 1.3, iridescence: 0.05 },
    habitat: 'Meadows and milkweed fields across North America, wintering in Mexico.',
    facts: [
      'Monarch caterpillars eat ONLY milkweed, which makes them taste bad to birds.',
      'Some monarchs fly all the way from Canada to Mexico — thousands of miles — for winter.',
      'It tastes with its feet: it steps on a leaf to know if it is the right one to eat.'
    ],
    care: 'Easy'
  },
  {
    id: 'blue_morpho', common: 'Blue Morpho', scientific: 'Morpho peleides',
    water: 'garden', kind: 'lep', adultSizeCm: 15, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'canopy', locomotion: 'flutter', host: 'passionvine',
    speed: 0.9, schooling: 'loose', diet: ['fruit', 'sugarwater'], price: 75,
    archetype: 'butterfly', size: 1.5,
    colors: { base: '#1a3a8a', belly: '#6a5030', fin: '#0a1a40',
      pattern: 'none', patternColor: '#2a5adf', patternScale: 1.0, iridescence: 0.95 },
    habitat: 'Rainforest clearings and streams of Central and South America.',
    facts: [
      'Its wings are not painted blue — tiny scales bend light to flash electric blue as it flies.',
      'Flip it over and it is dull brown with eye-spots, so a resting morpho vanishes.',
      'It does not sip flower nectar — it prefers the juice of rotting fruit on the forest floor.'
    ],
    care: 'Medium'
  },
  {
    id: 'tiger_swallowtail', common: 'Eastern Tiger Swallowtail', scientific: 'Papilio glaucus',
    water: 'garden', kind: 'lep', adultSizeCm: 12, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'flowers', locomotion: 'flutter', host: 'citrus',
    speed: 0.85, schooling: 'loose', diet: ['nectar', 'minerals', 'sugarwater'], price: 45,
    archetype: 'butterfly', size: 1.2, shape: { finFlow: 1.4 },
    colors: { base: '#f0c020', belly: '#f4d048', fin: '#101010',
      pattern: 'stripesV', patternColor: '#101010', patternScale: 1.2, iridescence: 0.1 },
    habitat: 'Woodlands, gardens, and riversides across eastern North America.',
    facts: [
      'The little "tails" on its back wings trick birds into pecking there instead of its head.',
      'Its caterpillar has two big fake eye-spots and looks just like a tiny snake.',
      'Groups of males gather at mud puddles to drink up minerals — this is called puddling.'
    ],
    care: 'Easy'
  },
  {
    id: 'black_swallowtail', common: 'Black Swallowtail', scientific: 'Papilio polyxenes',
    water: 'garden', kind: 'lep', adultSizeCm: 9, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'flowers', locomotion: 'flutter', host: 'parsley',
    speed: 0.85, schooling: 'loose', diet: ['nectar', 'minerals'], price: 40,
    archetype: 'butterfly', size: 1.0, shape: { finFlow: 1.4 },
    colors: { base: '#141414', belly: '#2a2a2a', fin: '#101010',
      pattern: 'spots', patternColor: '#f0d040', patternScale: 1.1, iridescence: 0.25 },
    habitat: 'Fields, gardens, and roadsides across North America.',
    facts: [
      'Its caterpillar lives on parsley, carrots, and dill right in the vegetable garden.',
      'When a caterpillar is scared, it pops out a smelly orange horn to say "go away!"',
      'A row of blue and yellow dots edges its black wings like tiny beads.'
    ],
    care: 'Easy'
  },
  {
    id: 'painted_lady', common: 'Painted Lady', scientific: 'Vanessa cardui',
    water: 'garden', kind: 'lep', adultSizeCm: 6, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['migratory'], zone: 'flowers', locomotion: 'flutter', host: 'thistle',
    speed: 0.9, schooling: 'loose', diet: ['nectar', 'sugarwater'], price: 20,
    archetype: 'butterfly', size: 0.8,
    colors: { base: '#d87028', belly: '#e0904a', fin: '#3a2418',
      pattern: 'patches', patternColor: '#201410', patternScale: 1.2, iridescence: 0.05 },
    habitat: 'Almost everywhere on Earth — the most widespread butterfly, on every continent but Antarctica.',
    facts: [
      'It is the classroom butterfly: most kids who raise butterflies raise this one.',
      'Painted ladies migrate in huge waves, sometimes crossing the whole Sahara Desert.',
      'From egg to butterfly takes only about three weeks — one of the fastest changes of all.'
    ],
    care: 'Easy'
  },
  {
    id: 'zebra_longwing', common: 'Zebra Longwing', scientific: 'Heliconius charithonia',
    water: 'garden', kind: 'lep', adultSizeCm: 9, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'canopy', locomotion: 'flutter', host: 'passionvine',
    speed: 0.7, schooling: 'loose', diet: ['nectar', 'pollen'], price: 35,
    archetype: 'butterfly', size: 1.0, shape: { finFlow: 1.3 },
    colors: { base: '#181818', belly: '#282828', fin: '#101010',
      pattern: 'stripesV', patternColor: '#f0e048', patternScale: 1.4, iridescence: 0.05 },
    habitat: 'Tropical hammocks and forest edges of Florida and Central America.',
    facts: [
      'It is the only butterfly that eats pollen, not just nectar — so it lives for months, not weeks.',
      'Every night a whole group roosts together on the same twigs, returning to the exact spot.',
      'Its slow, floaty flap makes it look like it is dancing on the air.'
    ],
    care: 'Medium'
  },
  {
    id: 'atlas_moth', common: 'Atlas Moth', scientific: 'Attacus atlas',
    water: 'garden', kind: 'lep', adultSizeCm: 24, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nightShift', 'nomouth'], zone: 'canopy', locomotion: 'flutter', host: 'privet',
    speed: 0.5, schooling: 'solo', diet: [], price: 90,
    archetype: 'moth', size: 2.0,
    colors: { base: '#8a4a22', belly: '#a86838', fin: '#3a2010',
      pattern: 'patches', patternColor: '#e0b070', patternScale: 1.3, iridescence: 0.1 },
    habitat: 'Tropical forests of Southeast Asia, from India to Indonesia.',
    facts: [
      'It is one of the biggest moths on Earth — its wings are as wide as a dinner plate.',
      'The grown-up moth has NO mouth and cannot eat, so it lives only about one to two weeks.',
      'The tips of its wings look like snake heads to scare away hungry birds.'
    ],
    care: 'Medium'
  },
  {
    id: 'luna_moth', common: 'Luna Moth', scientific: 'Actias luna',
    water: 'garden', kind: 'lep', adultSizeCm: 11, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nightShift', 'nomouth'], zone: 'canopy', locomotion: 'flutter', host: 'walnut',
    speed: 0.55, schooling: 'solo', diet: [], price: 55,
    archetype: 'moth', size: 1.15, shape: { finFlow: 1.5 },
    colors: { base: '#a8e0a0', belly: '#c0e8b8', fin: '#7a3a58',
      pattern: 'spots', patternColor: '#e8e0a0', patternScale: 1.0, iridescence: 0.2 },
    habitat: 'Nighttime forests of eastern North America.',
    facts: [
      'It glows pale green and only flies at night — you almost never see one by day.',
      'Like the atlas moth, an adult luna has no mouth and never eats; it lives about a week.',
      'Its long twisty tails confuse bats by scrambling the echoes bats use to hunt.'
    ],
    care: 'Medium'
  },
];
```

> Author note for the roster subagent: the monarch `belly` is `'#f0a850'`
> (pale orange underwing). The `pollen` diet id on the zebra longwing is that species' special mechanic
> (§7 longevity); if not implementing pollen-feeding in MVP, map it to
> `'nectar'`. All other hexes are true-to-life; verify against a photo when
> authoring the full 20.

---

## 7. The four retention mechanics — made concrete

Per HABITAT_VISION, every habitat ships all four. Here they are, plus **the
hard question**.

1. **Care debt (offline decay).** `applyOffline()` runs the garden subtype
   unchanged. Nectar drains, net grimes, host plants get stripped by
   caterpillars while you're away — but the headline offline event is
   metamorphosis progress, not damage. Come back and someone has changed stage.
2. **Growth & babies → metamorphosis (the structural equivalent).** This IS
   the loop, made structural like the ant colony. Egg→caterpillar→chrysalis→
   adult on the real clock (§2). "Babies" = adults laying eggs (§7 generational
   option). Every stage transition is a `sim.events` push like `'grown'` today.
3. **Collection book.** The existing `discovered[]` Fish-Book mechanic, but
   richer: unlock a species card the first time you own it, AND (the values
   call below) **celebrate each generation raised** — a "raised from egg" seal,
   a generation counter, the eclosure date. Gotta-raise, not just gotta-buy.
4. **Surprises.** Molt/shed props each caterpillar instar (5 collectible molts,
   like tarantula molts); the eclosure show catching you off guard; a chrysalis
   that darkens overnight signalling "tomorrow"; puddling clusters; the night
   shift takeover (moths appear when the kid's room goes dark, §6); a butterfly
   landing on the tap point.

### THE HARD QUESTION — adult lifespan and death **[DECISION FOR JOHN]**

Adult butterflies really live days to weeks; moths like the atlas/luna live
about a week with no mouth. The aquarium has honest death stakes from *care
failure*. Here, **death is not a failure — it is the lifecycle itself**, and a
6-year-old will feel it. This is a values call. Three options:

- **Option A — Full honest generational cycle.** Adults age on the real clock
  (`ADULT_LIFE_DAYS` per species: painted lady ~2 wks, atlas ~1 wk). Before
  dying, healthy well-fed adults lay eggs on the matching host plant, so the
  garden **self-renews** — a new generation is already growing when the old one
  passes. Death is peaceful (wings fade, a final rest on a flower, no gore), and
  the collection book **celebrates the generation**: "Your 3rd generation of
  monarchs." *Teaches:* the real, beautiful truth — life is a cycle, endings
  make room for beginnings; loss is softened by renewal you caused. Highest
  educational value; matches "real-ish" and honest-death brand. Most build.
- **Option B — Metamorphosis-focused, lifespan de-emphasized.** Adults live a
  long, vague time and don't visibly die on screen; when an adult's time comes
  it "flies off to the wild garden" (flutters up through the net and away) and
  its card is stamped "released". Eggs/renewal optional. *Teaches:* the
  transformation story without the grief; a softer contract for the youngest
  kids. Loses the honesty the aquarium sets as the bar.
- **Option C — Hybrid, parent-toggle (mirrors the snake-feeding decision).**
  Default = Option A's cycle with the gentle fade + generational celebration; a
  settings toggle switches death to Option B's "released to the wild" framing.
  *Teaches:* families choose their own readiness; consistent with the toggle
  precedent already set for snake feeding.

Recommendation to surface, not decide: **C defaulting to A** — honest by
default, softenable, and consistent with how John already handled the snake.
Whichever is chosen, eggs-before-death (self-renewal) is what keeps the garden
from emptying out and is the engine of the retention loop; strongly keep it.

### Resident mantis predator **[DECISION FOR JOHN]**

ROADMAP names a "resident mantis". A mantis in a butterfly garden eats
butterflies — biologically true, and it rides the existing
`predator`/`canEat`/`_findPrey` path for free (a mantis striking a resting
butterfly is exactly `Swarm._devour`). But it turns the calm garden into a
place where your raised pet gets eaten. Options:

- **A — No predator.** Keep the garden purely calm; drop the mantis. Safest for
  the 6-year-old audience and the "calm" pillar.
- **B — Mantis as an *observed* resident, non-lethal to your collection.** It
  hunts the free feeder insects / fruit flies only (like the terrarium's
  matter-of-fact feeding), never your named butterflies. Predator drama,
  no grief. `canEat` restricted to `kind:'feeder'`.
- **C — Optional, parent-gated, fully honest.** The mantis can take a
  butterfly (rare, telegraphed, no gore); off by default, a toggle like snake
  feeding. Teaches food webs honestly; risks the calm.

Recommendation to surface: **B** — keeps the predator flavor and a genuine
nature-is-real moment without eating the pet the kid spent a week raising.

---

## 8. Performance budget (S24-class, 60 fps, alongside DOM UI)

Same envelope the 42-fish aquarium already hits. Wings are the only new cost;
keep them shader-driven and instanced.

| System | Budget | Approach |
|---|---|---|
| Adult butterflies | **~30 flying, individually simulated** | Reuses the `Swarm` agent loop and per-agent state machine (§3). Cheaper than fish steering — no boids, no predator scan (unless mantis on). |
| Wing rendering | **2 quads per butterfly, vertex-shader flap** | Each adult = a body sprite/prism + two textured wing quads hinged at the body; flap is a `sin(t*beatHz)` **vertex** rotation about the hinge in the shader — no CPU skinning, no per-frame geometry. `wingOpen` (bask) and `unfurl` (eclosure) are two more uniforms on the same material. |
| Wing iridescence (morpho/swallowtail) | view-angle tint, **no extra passes** | Reuse the fish `iridescence` shader chunk: a fresnel-driven hue shift in the fragment shader (`dot(viewDir, normal)`), gated by `colors.iridescence`. Blue morpho's flash is this term turned to 0.95. Zero new render targets. |
| Wing scales / pattern | the existing `PATTERN_ID` set | Same pattern shader as fish/herps; the wing quad UVs sample it. No unique textures per species. |
| Caterpillars / chrysalises | cheap | Caterpillars: existing crawler + a short segmented body (invertkit-style, like the millipede). Chrysalis: one teardrop mesh with a `translucency`/`unfurl` uniform. A dozen at once is nothing. |
| Instancing option | if a species crowd grows | If a "butterfly release" moment ever puts 60+ identical-species adults up, batch them into one `InstancedMesh` with per-instance flap phase + wander seed (the Aviary will want this anyway; spec'd here as the growth path, not MVP). |
| Netting | **procedural shader, 3 quads** (walls) | §1 — analytic, moiré-safe, no texture sampling, no mipmaps. Effectively free. |
| Plants | billboarded flower cards + a few 3D leaves | `bloom`/`leafArea`/`eaten` are uniforms, not geometry edits. Chew decals are shader masks. |
| Shadows | off (as aquarium) | Dappled-light quad fakes the depth cue. |

Offline catch-up: on `applyOffline()`, advance every `lep` record's stage
progress in coarse steps (capped at `OFFLINE_CAP_HOURS`), mark ripe chrysalises
`pendingEclosure` (don't eclose in the dark — §2.4), decay meters. Then a
**reveal beat** on open ("While you were away: 2 caterpillars pupated, and a
Monarch is ready to emerge — tap to watch") that feeds the eclosure show queue.

---

## 9. MVP cut

**In (proves the loop and the new tech):**

| Piece | Why |
|---|---|
| Garden environment builder: mesh net walls (moiré-safe shader), soil bed, dappled light, one nectar-flower cluster + one host plant + perch twigs | the enclosure and its plant roles |
| **Full metamorphosis pipeline** (egg→caterpillar→chrysalis→adult) on `stage`+`growth`, save/migration | this is the whole point; non-negotiable |
| **Eclosure hold + show** (pending-eclosure on open, camera + wing-unfurl) | the payoff moment; the retention beat |
| **Flutter locomotion** (noise-wander state machine + wing-flap shader), written as the Aviary seam | the one new locomotion mode |
| Caterpillar eating host plant with chew decals; instar molts as collectible props | cause/effect + a surprise |
| Meters: **nectar + net cleanliness** (humidity/misting deferred) | daily action, reuses waterChange + scrubAlgae |
| Foods: `nectar`, `fruit`, `sugarwater`, `hostplant` | adult + caterpillar feeding |
| Collection book: species card + "raised from egg" seal + generation counter | retention mechanic #3 |
| Adult lifespan + eggs-before-death self-renewal, per the **DECISION FOR JOHN** (default C→A) | keeps the garden alive; the hard question resolved before ship |
| Butterfly builder: archetypes `butterfly` + `moth`; iridescence reuse | the visuals |
| **6–8 flagship species** (§6.1): monarch, blue morpho, tiger & black swallowtail, painted lady, zebra longwing, atlas moth, luna moth | day + night shift, the milkweed/no-mouth/iridescence stories |

**Out (v2):**

- Humidity/misting meter (lamp-style visual only in MVP).
- Resident mantis predator (ships once the **DECISION FOR JOHN** lands; likely
  Option B).
- Puddling behavior + `minerals` food, pollen-feeding longevity (zebra longwing).
- Hummingbird hawk-moth hover flight (a flutter-flight showcase, but its
  stationary-hover kinematics deserve their own milestone — and it's a natural
  Aviary hummingbird pre-tease).
- Instanced butterfly crowd / "release" spectacle (the Aviary will build the
  instancing; here it's the documented growth path).
- Full ~20 roster (authored by subagents against SPECIES_SPEC when the build
  starts, same as every habitat).
- Walk-in larger enclosure subtype.

Build order (each step demoable to the 6-year-old QA department): net-wall
environment + plants → butterfly builder + flutter flight on a bought adult →
metamorphosis stages driven by a fake fast clock → caterpillar-eats-host + chew
decals → nectar/net meters → eclosure hold + show → offline advance + reveal →
collection-book generation seal → lifespan/renewal per the decision.
