# Bee Hive — Habitat Pack Spec

The ant farm's sibling. Same big idea: the habitat itself is the pet — a colony
that builds, grows, and remembers. Where the ant farm *digs down* into a soil
cross-section, the bee hive *builds outward* across a hex comb behind glass. It
is the second cross-section-grid habitat, so it reuses the ANTFARM tech family
almost verbatim (`ANTFARM_SPEC.md` §2 grid, §7 hero+crowd split, §7 offline
reveal). This spec only calls out what differs; where it says "same as ANTFARM"
it means literally the same code path.

Sized for John's phone baseline (S24-class, 60 fps, the budget the 42-fish
aquarium hits today). The Bee Hive lands on `habitat/beehive` **after** the ant
farm ships, because the comb grid *is* the dig grid with hexes.

The one framing job this habitat has that no other does: **bees are the animal
most kids are afraid of.** §10 is not an afterthought — making the colony
lovable is the product. Read it first if you read nothing else.

---

## 1. Scene layout

A side-view **observation hive**: a real thing beekeepers own — one or two comb
frames sandwiched between two panes of glass so you can watch the whole colony
at once. Structurally identical to the ant farm's formicarium (a thin glass
sandwich), so it reuses the exact same rendering skeleton.

Reuses the `tank.js` glass-frame pattern (`addFrame`) with the ant farm's
`TANK`-style thin dims (`W:122, H:61, D:8`) — a 2D-ish world with just enough
depth for parallax. Bees walk in the shallow gap between two comb faces exactly
as ants walk between the two soil quads.

```
+--------------------------------------------------+
|  MEADOW STRIP (open air, ~10cm): flowers,        |   <- foraging happens here
|  sun position, the entrance tube mouth           |      (or off-screen — §4)
|==================================================|   <- hive box top / wood rail
|                                                  |
|   COMB CROSS-SECTION (built wax + brood + honey) |   <- the hex grid
|                                                  |
+--------------------------------------------------+
```

Two structural swaps from the ant farm:
- The ant farm's **surface strip is open air above soil**; the bee hive's
  equivalent strip is a **meadow of flowers** the foragers fly to, joined to
  the comb by an **entrance tube** (the real observation-hive tube through the
  window). Whether that meadow is on-screen or abstracted is the big §4 call.
- The ant farm's diggable region starts full (SOLID) and is *removed*; the bee
  hive's comb region starts **empty** and is *added to* — the wax grows down
  from a wooden top-bar, the way real comb hangs.

Camera: the ant farm's narrow-orbit controller, unchanged. The existing
`main.js` orbit controller (`cam.az`/`cam.el`, clamped in ANTFARM to ±0.35 az /
±0.15 el) keeps it reading as a flat cross-section while still feeling 3D.
Pinch-zoom unchanged (`cam.targetRadius`); tap-to-follow works on an individual
bee through the same raycast path (`main.js` tap handler → `cam.follow`,
`ui.showFishCard`). Tapping the queen opens her pet card exactly as tapping a
fish does today.

## 2. The comb model (core tech decision)

### 2.1 Grid

One 2D **hex** cell grid, authoritative for sim AND rendering — the ant farm's
dig grid with a hexagonal lattice instead of a square one:

```js
// comb.js
export const HEXGRID = { COLS: 80, ROWS: 48, CELL: 1.5, layout: 'flat-top' };
// ~3840 cells across the comb face (coarser than soil's 18k — comb cells read
// bigger, and there are far fewer of them than soil voxels)
// cell states (Uint8Array, COLS*ROWS):
// (cell-state names live in their own enum; the grid dims above are HEXGRID so
//  this COMB state and the grid object never collide as JS identifiers)
const EMPTY = 0,          // no wax here yet
      COMB = 1,           // built empty wax cell (hexagon drawn, nothing inside)
      HONEY = 2,          // cell filling with nectar/honey (fill level in a paint pass)
      POLLEN = 3,         // packed pollen ("bee bread") — colourful, unmistakable
      EGG = 4,            // queen has laid; tiny white rice grain at cell bottom
      LARVA = 5,          // curled white grub, grows toward the rim
      CAPPED_BROOD = 6,   // wax-capped pupa (matte tan dome)
      CAPPED_HONEY = 7;   // wax-capped ripe honey (pale, glossy) — the harvest
```

Offset-coordinate hex indexing (flat-top hexes, odd rows shifted half a cell);
neighbour lookup is the standard 6-neighbour offset table — a tiny helper, no
different in cost from the ant farm's 4/8-neighbour soil lookups.

### 2.2 Serialization budget (same analysis as ANTFARM §2.1)

One `Uint8Array(COLS*ROWS)` = 3840 bytes raw. It serializes straight into the
`CareSim` save. Run-length encode rows before `JSON.stringify` — comb is even
more RLE-friendly than soil because whole regions share a state (a capped-honey
super, a solid brood patch): **~3.8 KB raw, well under 1 KB after RLE.** A
second parallel `Uint8Array` holds a 0–255 *fill level* for HONEY/POLLEN/LARVA
cells (how full / how fat) — also RLE'd, mostly runs of 0. Trivial next to the
aquarium's per-fish records. Same `localStorage` home as the ant farm's soil.

### 2.3 Rendering: CanvasTexture (same pick as ANTFARM §2.2)

**Pick A — CanvasTexture**, for the same reasons the ant farm picked it (soft
edges, painted depth, one draw call, photoreal-friendly vs. blocky instancing).
One `1024×640` offscreen canvas mapped onto a front comb face at
`z = +D/2 - 0.5`; a second, dimmer copy 6 cm behind = the back face of the
double-sided comb. Two draw calls for the entire built world. Bees walk in the
gap between.

Painting differs from soil in the good way — this is where "build outward"
becomes *visible progress cell by cell*, the marquee feel of the habitat:

- **Build a cell** (EMPTY→COMB): paint a fresh hexagon outline in pale wax
  (`#f0e0a8`), with a soft inner shadow so it reads as a real cavity. New comb
  is bright and pale; older comb darkens with use (brood-reared comb goes
  amber→brown — a real, paintable aging signal that doubles as colony-age
  storytelling).
- **Fill honey** (COMB→HONEY, rising fill level): paint the hex filling from the
  bottom with translucent amber; a meniscus highlight at the top of the fill.
  You literally watch cells top up.
- **Cap honey** (HONEY full → CAPPED_HONEY): paint a pale convex wax lid over a
  full cell. A finished honey arch of capped cells is the harvest trigger (§7).
- **Pollen**: packed discs of saturated colour (orange, yellow, red, even
  blue-grey depending on flower) — the prettiest cells, and a real fact: pollen
  colour tells you which flower a bee visited.
- **Brood**: EGG = a single upright white grain; LARVA = a fattening C-shaped
  grub (fill level = fatness); CAPPED_BROOD = a matte tan dome (flatter and
  duller than a honey cap — the two caps look different in real life, so the kid
  learns to read the comb).

`texture.needsUpdate = true` only on frames where a cell changed state or fill —
a handful per second at peak. Same negligible cost as the ant farm's dig
repaints.

### 2.4 Comb-building rules (growth that looks bee-made)

Bees don't build randomly either. Real comb hangs from the top-bar and grows
**downward and outward**, filled in as a smooth front, with a predictable
internal zonation the kid can learn: **brood in the centre, a ring of pollen
around it, honey stored up top and out at the edges.** That zonation is the
whole readable fantasy — the ant farm's chambers, but emergent from where each
cell type is allowed.

A worker in `build` state picks the next EMPTY cell to wax from candidates
adjacent to existing COMB, scored:

```
score = 2.2*attachTop            // grow down from the top-bar / existing sheet
      + 1.6*fillFront            // complete the leading edge before extending (flat front)
      + 1.4*neighborSupport      // more built neighbours = easier to add (no lace)
      - 2.0*breachMargin         // 2-cell wax border stays EMPTY (glass gap, real bee-space)
```

Cell *use* is a colony-level planner (not per-bee), same shape as the ant
farm's chamber blueprints: the queen lays EGGs only in built COMB inside the
central **brood-nest** zone; nurses convert nearby cells to POLLEN; receivers
deposit HONEY in the upper/outer zone. This gives the readable brood-ring-honey
comb without per-bee negotiation.

### 2.5 Pathfinding on the comb (same as ANTFARM §2.4)

Bees on comb are surface walkers, not corridor crawlers, but the count is low
enough that no A* is needed. Maintain a handful of flow-field BFS distance
fields over built COMB cells from key targets (**entrance/tube mouth, brood
nest, honey arch, queen**), recomputed only when comb changes, amortized one
target per frame. A nurse "going to the brood nest" descends the brood-nest
field. 4 fields × `Uint16Array(3840)` = cheap.

## 3. Colony lifecycle

Extends `CareSim` records exactly as the ant farm does — the colony is one
"tank" whose `fish[]` array holds the queen and the brood cohorts; individual
workers/drones are NOT care records (see §8). Timings use the same dual-clock
pattern from `sim.js` (`GAME_HOURS_PER_REAL_MIN` foreground, real hours
offline), so a kid sees eggs and larvae progress in a session and a school day
means real colony growth. **All durations below are the true biological ones**
(days), which the dual clock compresses for foreground viewing.

| Stage | Real duration | Notes |
|---|---|---|
| **Queen** (bought/founding) | permanent | The one named pet (`ui.showFishCard` card, renameable via existing `onRename`). Her health = colony health. **DECIDED (John, 2026-07-08, mirrors ANTFARM): real death stakes with big escalating warnings (same as ant farm).** Sustained severe neglect can kill her; the colony goes *queenless* — the marquee sad-but-teachable moment (a real hive without a queen winds down over days). Big escalating warnings first: "the hive sounds worried" audio shift, HUD queen-pill goes amber then red, a "your queen is weak" toast well before any death. Memorial card archives to the collection book; re-queening / a fresh founding swarm starts a new colony. The kid must never be surprised. |
| Egg | 3 days | Queen lays one upright egg per prepared brood cell; batch rate scales with stores + comb space + season. |
| Larva | ~6 days | Must be fed constantly — **nurse bees visit ~1000×/day in real life**; game shows visible nurse traffic to open larval cells; larva fattens (fill level up). Underfed larvae stall (low stores). |
| Capped brood (pupa) | ~12 days | Nurses cap the cell (COMB→CAPPED_BROOD); inert dome, no traffic. |
| **Worker** emerges | day ~21 total | The population engine. Summer worker then lives ~5–6 weeks (see age-polyethism below). |
| **Drone** | egg→emerge ~24 days; lives weeks | Male, from unfertilised eggs in larger drone cells (bigger hexes — paintable). No sting, no work: eats, flies out on mating flights, lounges. Evicted in autumn (seasonal beat, §3 note). Big-eyed, chunky, loud — comedic and lovable, a deliberate fear-defuser (§10). |
| **New queen** | egg→emerge ~16 days | Only reared in a special **queen cell** (a big vertical peanut-shaped cell on the comb face — unmistakable art). Triggers swarming (§7) or supersedure (replacing a failing queen). |

**Worker age-polyethism (a bee does different jobs as she ages — a huge, true,
collection-book-grade fact).** One worker sprite, role driven purely by age, no
extra records:

| Age (of adult life) | Role | On-screen |
|---|---|---|
| days 1–3 | **Cleaner** | polishes emptied cells |
| days 3–12 | **Nurse** | feeds larvae in the brood nest (visible traffic to open larval cells) |
| days 12–18 | **Builder / receiver** | secretes wax, builds comb (§2.4), takes nectar from foragers, packs pollen, caps honey. **Wax comes from glands on her belly** — a fact card gold. |
| days 18–21 | **Guard** | loiters at the tube mouth, checks incoming bees (fear-defuser: guards are *doorkeepers*, not attackers) |
| days 21–death | **Forager** | flies to the meadow, does the waggle dance (§4). The oldest bees take the riskiest job — true, and poignant. |

This is the ant farm's nurse→forager polyethism made richer (bees have more
named life-stages than ants), and every transition is a free fact.

**Seasonal notes** (drive the day/night + a slow real-clock season, reusing
`rawDayFactor` machinery): **Spring** = build + swarm season (comb grows fast,
swarm pressure, §7). **Summer** = honey flow (honey cells fill fastest — best
harvest). **Autumn** = drones evicted (a gentle, explained event: "the colony
is getting ready for winter"), laying slows. **Winter** = the colony clusters
into a ball and shivers to stay warm, eats stored honey, no foraging — the care
model's hard mode (§5): if stores are low and the kid hasn't fed sugar, the
cluster is at risk. This is the bee equivalent of the ant farm's dry-spell
tension and it is *real husbandry* (winter starvation is the #1 hive killer).

## 4. Foraging — where does it happen?

The ant farm forages on an on-screen surface strip with a pheromone trail sim.
The bee hive has a real fork here, because bees forage **hundreds of metres
away** — you can't literally show the field. Two honest options, costed:

### Option A — On-screen meadow strip (ant-farm-faithful)

A flower meadow occupies the top strip (the ant farm's surface-strip slot).
Foragers fly out the tube, visit painted flowers, return. Flowers deplete and
refresh; more/better flowers = faster stores.

- **Cost:** reuses the ant farm's surface-strip rendering and a small
  **foraging-flight pack system** (not a new locomotion mode — a 2D drifting
  flight over the strip, simpler than the terrarium's ballistic hop; no gravity,
  gentle bob). Flowers are cheap sprites. ~1 new pack module + flower props.
- **Pro:** you *see* the foraging, you see bees land on flowers (adorable,
  educational, defuses fear — "look, she's just visiting a flower"), and the
  meadow is a place the kid can improve (plant flowers = a care action / coin
  sink).
- **Con:** it compresses "bees fly kilometres" into a 10 cm strip; a purist
  might feel it's toy-scale (but so is the whole hive).

### Option B — Off-screen abstraction (tube in/out)

No meadow. Foragers walk to the tube mouth, disappear up the tube, and return a
little later carrying a visible pollen load (coloured leg baskets) or a
nectar-swollen belly. The "field" is a number: a **forage-quality** value driven
by season + weather + how many flowers the kid has "planted" in a menu.

- **Cost:** *cheaper* — no meadow render, no foraging-flight system at all; foragers
  are just comb-walkers that despawn at the tube and respawn with cargo. The
  waggle dance (below) still happens **on the comb**, which is where it really
  happens anyway.
- **Pro:** truer to scale (the field genuinely is somewhere else), leans the
  whole camera on the gorgeous comb, cheapest to build, and the return-with-
  cargo moment is a lovely little reveal each time.
- **Con:** less to *watch*; loses the "bee on a flower" postcard image that does
  the most fear-defusing work.

> **DECIDED (John, 2026-07-09): (c) hybrid porch.** The field's *quality* stays
> an off-screen number (truest to scale, cheapest), but returning foragers land
> on a shallow **porch** in front of the tube and unload their pollen baskets
> on-screen for a beat before entering — most of Option A's charm at most of
> Option B's cost, and a lovely little reveal each trip. An occasional meadow
> cutaway can be added later. (The porch/forage flight is a pack system, not a
> locomotion mode.)

### The waggle dance (ships regardless of A/B/C — it happens ON the comb)

The single best fact in the whole habitat, and a real figure-8: a returning
forager who found good forage runs a **figure-8 on the comb**, waggling her
abdomen through the straight middle "run." The **angle of the straight run
relative to straight-up encodes the compass direction to the flowers (relative
to the sun); the length/duration of the waggle encodes the distance.** Other
foragers cluster around her, "read" it, and leave to that spot. It is a real
animal language and it is adorable.

Implementation is a scripted comb behavior, not physics: a forager who returns
with a good load enters `dance` state at a spot near the tube, traces a
parametric figure-8 (two mirrored loops + a straight waggle run with a
side-to-side abdomen wobble, ~10 Hz), for a few loops. Nearby idle foragers
enter `watch` (a little audience — instantly readable and cute), then leave in
the danced direction. In Option A the danced angle actually points at the
flower patch she used (angle maps to the meadow x-position). Zero extra sim
cost, huge collection-book payoff. A tappable "what is she doing?" fact card
fires the first time the kid sees it: *"She's telling her sisters where the
flowers are — by dancing."*

## 5. Care model (maps onto `CareSim` meters)

The recurring question — *what does the kid actually DO daily?* Real observation-
hive keeping is low-touch, which is perfect for a calm game: the kid **watches**,
and intervenes at a few honest levers. Concretely, day to day:

- **Feed sugar water** when forage is poor (early spring, autumn, winter, or a
  rainy stretch) — the bee equivalent of dropping food. A jar feeder; foragers
  drink from it like the ant farm's honey trophallaxis.
- **Open / close the entrance** — a real beekeeper control. Close it down on
  cold days and to stop **robbing** (other bees stealing honey — a surprise
  event); open it wide on hot days so the colony can ventilate. Wrong setting
  has gentle, recoverable consequences.
- **Clean the glass / bottom board** — wipe gesture, same as the aquarium's
  algae scrub.
- **Harvest honey** — the coin economy (§7), gated behind a gentleness framing
  (§10).
- **Plant flowers** (Option A/C) or nudge forage — a coin sink that improves
  stores.

Meter mapping (relabels of `CareSim` meters; per the engine split these become
pack config — until then, semantic mapping, exactly like TERRARIUM §2):

| Aquarium meter | Bee-hive meter | Player action & mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Stores / Nectar** | Colony food = sum of HONEY + CAPPED_HONEY + POLLEN fill across the comb. Drops as brood and adults eat (hourly draw, faster in winter, faster with more brood). Refilled by foraging (§4) OR by the kid's **sugar-water feeder** (`waterChange()` → `feedSugar()`, +0.55). Low stores stalls laying and larvae; sustained-low in winter risks the cluster. Decays toward 0 at a `STORES_DECAY_DAYS` tuning (≈ 2 foreground, faster than water's 9 — feeding/foraging is the ritual). |
| `tank.algae` (0→1) | **Hive debris / pest risk** | Dead bees, wax cappings, and mould accumulate on the glass and bottom board at an `ALGAE_DAYS`-style rate; the existing wipe gesture (`sim.scrubAlgae(0.015)` per pointermove + sparkles, `main.js`) clears it unchanged. Left too long: **wax-moth / small-hive-beetle** speckle creeps in from the corners (a real hive pest — the ant farm's mould analogue) and stores drain slightly faster. |
| hunger/health per fish | **Queen health + brood viability** | `summary()` maps: `avgHealth` = queen/colony health; `hungriest` = stores emptiness. HUD pills work unchanged. Queen weak → the escalating-warning ladder in §3. |
| — (new, optional) | **Hive climate** | New meter `tank.temp` (0 cold → 1 hot, ~0.55 ideal). Brood needs a warm, stable nest (~35°C in real life — a fact). Driven by season/`df` + entrance setting + colony size: too cold chills brood (laying slows, dev stalls); too hot and the colony **beards** (bees hang outside the tube — a paintable, non-scary "it's hot, they're cooling off" moment). The kid manages it with the entrance and, in winter, by not over-opening. **DECIDED (John, 2026-07-09): deferred to v2, visual-only** (like the terrarium's temp meter) — MVP paints bearding/clustering but runs no real climate mechanic. |
| Rotting food pollution | Robbing / dearth events | Uneaten sugar syrup left out during a dearth can trigger a **robbing** surprise (§7) rather than polluting — cute + true; the fix is to close the entrance down. |
| — (derived) | **Colony mood / hum** | Not stored: f(stores, climate, debris, recent disturbances). Drives bee walk speed, forager traffic density, and the ambient **hive hum** (audio.js: a warm, calm bee-hum bed whose pitch/density tracks mood — a queenless or hungry colony *sounds* different, a real beekeeper's tell and a gorgeous calm-app audio moment). |

**Offline decay:** `applyOffline()` loops the hive exactly as it loops
`['fresh','salt']` today (ENGINE_SPLIT §6 step 1 makes the subtype list config).
Stores are consumed, brood advances a stage or two, comb grows, honey ripens and
gets capped, foragers bank the day's nectar — then a **reveal card** on open
(same as ANTFARM §7): *"While you were away: the colony built 40 new cells,
capped its first honey, and 22 new bees hatched,"* camera slowly panning the new
comb before control unlocks. Deterministic-enough coarse ticks
(`OFFLINE_CAP_HOURS = 96`), a few ms of JS on load.

## 6. Species / content plan

**Core = the three honeybee castes of one colony** (queen, worker, drone) — they
are not skins, they're the cast of the living hive, and each is a full
collection-book entry with real facts. That alone teaches the single most
important bee idea: *a hive is one animal made of three kinds of body.*

**Collection angle — two directions, and I recommend doing both, staged:**
1. **Honeybee subspecies as colour/genetics variants of the core hive** — the
   founding queen's race sets the colony's look and temperament: **Italian**
   (golden, gentle, the default), **Carniolan** (dark grey, calm, explosive
   spring build), **Buckfast** (amber, hardy), **Africanized** (flag as a
   *fact-only mention*, not a keepable defensive hive — honesty without arming a
   scare). This is the ant-farm "queen = new colony" pattern: a new founding
   queen of a different race is a new collection entry and a visibly different
   hive.
2. **Other bees as entirely separate hive types (separate packs-within-the-pack)**
   — **bumblebees** (fuzzy, big, a small annual colony in a box — a great
   "gentle giant" fear-defuser), and **solitary bees** (**mason bee**,
   **leafcutter bee**, **carpenter bee**) that don't make honey and live in
   tube/wood nests, not comb. Solitary bees are a *different care model* (no
   colony, no queen stakes — a gentle, low-stakes alternate hive) and a huge
   real-world conservation story (most bees are solitary and don't sting — the
   ultimate fear-defuser).

> **DECIDED (John, 2026-07-09): (c) staged.** Ship the honeybee comb hive deep
> first — castes + subspecies variants of the one comb hive (it *is* the
> ant-farm sibling, all tech reuse) — then add bumblebees and solitary bees as
> later content drops, like the ant farm's carpenter/leafcutter v2 species.
> Rationale: richest collection over time without blocking launch on a second
> (bumble-box / tube) nest grid.

Below, **7 fully-authored entries in the exact `src/species/freshwater.js`
schema**, with bee-appropriate deltas consistent with how TERRARIUM_SPEC did it:
`water:'hive'`; `kind:'bee'`; `zone:'comb' | 'meadow' | 'nest'`;
`locomotion:'crawl' | 'flutter'` — in-hive honeybees are `crawl` on the comb
plane (reusing the engine `crawl` surface walker on the hex grid); the
non-honeybee bees (bumble / solitary) use `flutter` for their gentle drift
flight. **Honeybee foraging flight is a pack system, not a locomotion mode**
(§4), so it never appears in this field. New `role` field for
caste; new `nectar` comfort band (0–1) reusing the humidity-meter slot;
`bioload` reads as "space/forage demand." Colours are true to life; facts are
true and kid-read-aloud.

```js
export const BEEHIVE_SPECIES = [
  {
    id: 'honeybee_queen', common: 'Honeybee Queen', scientific: 'Apis mellifera',
    water: 'hive', kind: 'bee', role: 'queen', adultSizeCm: 2, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'comb', locomotion: 'crawl', nectar: 0.5,
    speed: 0.4, schooling: 'solo', diet: ['royaljelly'], price: 120,
    archetype: 'bee', size: 1.6, shape: { height: 1.0, finFlow: 1.2 },
    colors: { base: '#c88a2a', belly: '#8a5a1a', fin: '#3a2a12',
      pattern: 'stripesV', patternColor: '#3a2a12', patternScale: 1.1, iridescence: 0.25 },
    habitat: 'The dark heart of the hive, laid down by generations of beekeepers worldwide.',
    facts: [
      'She is the mother of the whole hive and can lay more eggs in a day than her own body weight.',
      'A queen can live four or five years, while her worker daughters live only a few weeks.',
      'The workers feed her a special food called royal jelly her entire life — that is what made her a queen.'
    ],
    care: 'Medium'
  },
  {
    id: 'honeybee_worker', common: 'Worker Honeybee', scientific: 'Apis mellifera',
    water: 'hive', kind: 'bee', role: 'worker', adultSizeCm: 1.3, bioload: 1, minSchool: 20,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'comb', locomotion: 'crawl', nectar: 0.5,
    speed: 0.9, schooling: 'tight', diet: ['nectar', 'pollen'], price: 0,
    archetype: 'bee', size: 1.0,
    colors: { base: '#d8a838', belly: '#8a5a1a', fin: '#2a2018',
      pattern: 'stripesV', patternColor: '#2a2018', patternScale: 1.3, iridescence: 0.2 },
    habitat: 'Every cell of the comb and every flower for two miles around the hive.',
    facts: [
      'Every worker is a sister, and each one changes jobs as she grows up — cleaner, then nurse, then builder, then guard, then flower-finder.',
      'One worker makes only about a twelfth of a teaspoon of honey in her whole life.',
      'She makes wax for the comb from tiny flakes on her own belly.'
    ],
    care: 'Easy'
  },
  {
    id: 'honeybee_drone', common: 'Drone Honeybee', scientific: 'Apis mellifera',
    water: 'hive', kind: 'bee', role: 'drone', adultSizeCm: 1.6, bioload: 1, minSchool: 4,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'comb', locomotion: 'crawl', nectar: 0.5,
    speed: 0.7, schooling: 'loose', diet: ['nectar'], price: 0,
    archetype: 'bee', size: 1.2, shape: { height: 1.2, finFlow: 1.0 },
    colors: { base: '#b8862a', belly: '#6a4416', fin: '#1a1410',
      pattern: 'stripesV', patternColor: '#1a1410', patternScale: 1.2, iridescence: 0.2 },
    habitat: 'The comb by day and the open sky on warm afternoons.',
    facts: [
      'Drones are the boy bees — they have no stinger at all and cannot sting anyone.',
      'Their giant eyes wrap around their whole head to help them find a queen in the sky.',
      'A drone does no chores; his one job is to fly out looking for a new queen to marry.'
    ],
    care: 'Easy'
  },
  {
    id: 'buff_tailed_bumblebee', common: 'Buff-Tailed Bumblebee', scientific: 'Bombus terrestris',
    water: 'hive', kind: 'bee', role: 'queen', adultSizeCm: 2.2, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'nest', locomotion: 'flutter', nectar: 0.4,
    speed: 0.6, schooling: 'solo', diet: ['nectar', 'pollen'], price: 40,
    archetype: 'bumblebee', size: 1.5, shape: { height: 1.4, finFlow: 1.0 },
    colors: { base: '#1a1410', belly: '#e8d038', fin: '#f0ead8',
      pattern: 'stripesV', patternColor: '#e8d038', patternScale: 1.6, iridescence: 0.1 },
    habitat: 'Cool meadows and gardens across Europe, nesting in old mouse holes in the ground.',
    facts: [
      'A bumblebee is so fuzzy she looks like a tiny flying teddy bear.',
      'She warms up her flight muscles by shivering, so she can fly on cold mornings when honeybees stay home.',
      'Her buzzing shakes pollen loose from flowers — a trick called buzz pollination that honeybees cannot do.'
    ],
    care: 'Easy'
  },
  {
    id: 'red_mason_bee', common: 'Red Mason Bee', scientific: 'Osmia bicornis',
    water: 'hive', kind: 'bee', role: 'solitary', adultSizeCm: 1.1, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'nest', locomotion: 'flutter', nectar: 0.4,
    speed: 0.8, schooling: 'solo', diet: ['nectar', 'pollen'], price: 18,
    archetype: 'solitarybee', size: 0.8,
    colors: { base: '#7a3418', belly: '#a85028', fin: '#c87848',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.15 },
    habitat: 'Hollow stems and bee-hotel tubes in gardens across Europe.',
    facts: [
      'She lives alone with no hive and no queen — most bees in the world are solitary like her.',
      'She builds little rooms for her eggs inside a hollow tube and walls them up with mud.',
      'A mason bee almost never stings — she has better things to do than bother you.'
    ],
    care: 'Easy'
  },
  {
    id: 'leafcutter_bee', common: 'Leafcutter Bee', scientific: 'Megachile centuncularis',
    water: 'hive', kind: 'bee', role: 'solitary', adultSizeCm: 1.0, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'nest', locomotion: 'flutter', nectar: 0.4,
    speed: 0.8, schooling: 'solo', diet: ['nectar', 'pollen'], price: 18,
    archetype: 'solitarybee', size: 0.8,
    colors: { base: '#2a2620', belly: '#6a6250', fin: '#8a8068',
      pattern: 'stripesV', patternColor: '#b0a888', patternScale: 1.2, iridescence: 0.2 },
    habitat: 'Tube nests and rotten wood in gardens and woodlands worldwide.',
    facts: [
      'She snips neat little circles out of leaves and rolls them into cradles for her babies.',
      'She carries pollen on a brush of golden hairs under her belly, not on her legs.',
      'She is a gentle garden helper and one of the best pollinators a garden can have.'
    ],
    care: 'Easy'
  },
  {
    id: 'carpenter_bee', common: 'Eastern Carpenter Bee', scientific: 'Xylocopa virginica',
    water: 'hive', kind: 'bee', role: 'solitary', adultSizeCm: 2.3, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'nest', locomotion: 'flutter', nectar: 0.4,
    speed: 0.7, schooling: 'solo', diet: ['nectar', 'pollen'], price: 22,
    archetype: 'bumblebee', size: 1.4, shape: { height: 1.3, finFlow: 1.0 },
    colors: { base: '#181410', belly: '#241e18', fin: '#3a3a44',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.5 },
    habitat: 'Sunny wooden fences, decks, and dead trees across the eastern United States.',
    facts: [
      'She looks like a bumblebee but her shiny black belly is bald and gleaming like a bead.',
      'She drills a perfectly round tunnel into wood to make her nest, like a tiny carpenter.',
      'The big males hover and buzz right up to your face to show off, but they have no stinger at all.'
    ],
    care: 'Easy'
  },
];
```

(Worker and drone `price: 0` — they aren't bought, they're *born* from the
colony; they populate the collection book automatically the first time the hive
rears one. The queen is the purchase, as in the ant farm. Her `bioload` is
written as **1**, not 0: the engine coerces a falsy bioload to 1 anyway
(`spec.bioload || 1`, `src/rules.js:17` and `src/sim.js:96`), so a literal 0
would silently become 1 — we author 1 to match what the sim actually runs.)

### Foods

The `diet` ids above resolve to this foods table (same column shape as
TERRARIUM_SPEC §2 — `id`, label, `behavior`, notes). Only the sugar-water
feeder is a player-dropped food; the rest are colony-internal / forage-borne:

| id | Shown as | behavior | Notes |
|---|---|---|---|
| `sugarwater` | Sugar-Water Feeder | `drip` | The one player-dropped food (§5 `feedSugar()`) — a jar feeder the foragers drink from like the ant farm's honey trophallaxis. Tops up **Stores** (+0.55) when forage is poor. |
| `nectar` | Nectar | — (forage-borne) | Not player-dropped; foragers bring it in (§4) and receivers deposit it as HONEY. The everyday food of workers, drones, and foragers. |
| `pollen` | Pollen | — (forage-borne) | Not player-dropped; foragers carry it in leg baskets and nurses pack it as POLLEN "bee bread." The protein source for brood and young workers. |
| `royaljelly` | Royal Jelly | — (in-colony) | Never a player food; nurse bees secrete it to feed the queen for life and every very young larva. It is what turns a larva into a queen. |

## 7. The four retention mechanics, made concrete

Every habitat ships all four (HABITAT_VISION). The bee hive's versions:

1. **Care debt.** `CareSim.applyOffline` decays **stores**, climate, and debris
   while away (§5). A honeybee colony in a dearth or a winter genuinely needs
   the kid to feed sugar water — the truest "your pet needs you" of any habitat,
   and real husbandry.
2. **Growth & babies made structural — SWARMING.** This is the ant farm's
   "colony growth is the loop" pattern, and bees do it more dramatically than
   any animal: when the colony gets **crowded** (comb mostly built + high
   population + spring), it rears **queen cells** and **swarms** — the old queen
   leaves with about half the workers to found a new home, and a new queen
   takes over the original. In-game this is a genuine **colony split**: a
   swarm-day event (a hanging cluster of bees on the meadow branch — a real,
   iconic, non-scary sight) lets the kid **hive the swarm into a second
   observation hive** (a new "tank" subtype — you now keep two colonies, the
   collection/roster doubling that keeps the ant-farm-style growth going). Miss
   it and the swarm flies away ("your hive was so healthy it made a new family
   — they've gone to live wild"), never punitive, always a story. Swarming is
   growth you can *see coming* (queen cells on the comb = the warning) and act
   on — the best structural-growth beat in the roadmap.
3. **Collection book.** Castes (queen/worker/drone) unlock as the colony rears
   each; subspecies queens and other-bee hives (§6) fill out the pages. Every
   entry has real facts and a record (biggest colony, most honey harvested,
   swarms caught).
4. **Surprises.** First **waggle dance** (§4, a tappable fact moment); first
   **capped honey**; a **swarm cluster** on the branch; **bearding** on a hot
   day; a **robbing** raid (close the entrance!); the queen's **mating flight**
   for a newly reared queen; drones being **evicted** in autumn; the winter
   **cluster** shivering. Small unscripted moments that make the hive worth
   checking daily.

**Honey harvest as the coin economy.** When a honey arch reaches enough
**CAPPED_HONEY** cells, the kid can harvest it for coins (the aquarium's
coin-earning slot). This is the bee hive's signature economy and it needs a
gentleness framing:

> **DECIDED (John, 2026-07-09): (a) "share the surplus".** The game only ever
> lets the kid harvest *surplus* capped honey the colony doesn't need for
> winter — a clear "leave enough for the bees" line on the harvest UI, and the
> colony refills it. Never any colony harm. Rationale: it's the real, teachable,
> guilt-free version of the mechanic and it keeps the coin loop intact.

## 8. Performance budget (S24, 60 fps, alongside DOM UI)

Mirrors ANTFARM §7 exactly — same two-tier hero/crowd split, same numbers, and
the comb is *cheaper* to render than soil (fewer, larger cells).

| System | Budget | Approach |
|---|---|---|
| **Hero bees** | **48 simulated + individually rendered** | one InstancedMesh (body) + one (wing/abdomen wobble via instance attribute), 2 draw calls; state machine at 10 Hz, movement lerped per frame. No shadows. These are the tappable bees, the dancers, the queen, the guards. |
| **Crowd bees** | up to ~400 visual | NOT simulated: fuzzy bee-sprite particles advected along the comb flow fields with noise (a Points/InstancedMesh, 1 draw call). Density per comb region = statistical population there — a busy brood nest *looks* busy. This is what sells "thousands of bees" cheaply, same trick as the ant farm's corridor crowd. |
| **Comb** | 2 quads + 1 canvas repaint per cell change | §2.3 |
| **Flow fields** | BFS on ~3840 cells, only on comb change, amortized | §2.5 — cheaper than the ant farm's 18k soil cells |
| **Meadow / foragers** (Option A/C only) | ≤ ~16 forager bees over the strip | gentle 2D flight, no gravity; the forage-flight **pack system** (not a locomotion module), cheaper than any locomotion mode. Option B spends **zero** here. |
| **Waggle dance** | 1 scripted figure-8 + a few `watch`ers | parametric path, negligible |
| **Hive hum** | one warm oscillator bed, params from mood | audio.js, negligible |
| **LOD** | zoomed out: heroes freeze to simple loops, crowd density is the show; zoomed in on a hero (follow-cam): its neighbours within 15 cm get full leg/antenna/wing animation | tap-to-follow reuses `cam.follow` |

Offline growth ("what did they build while you slept") is the same coarse-tick
planner as ANTFARM §7 (≤192 ticks × cheap per-tick comb/brood/stores updates),
then one canvas repaint + a diff-driven reveal card (§5). A few ms on load.

## 9. MVP cut

**In:** one Italian honeybee colony in a single observation hive; queen +
egg/larva/capped-brood/worker (no drones, no reared new queens yet); the hex
comb grid + CanvasTexture painter with **visible cell-by-cell build, honey fill,
and capping**; brood-nest/pollen-ring/honey zonation; the **waggle dance** (it's
cheap and it's the whole magic); foraging via **Option B/C off-screen tube**
(no meadow render in MVP — cheapest, and the porch-unload beat sells it); care =
**stores** meter (sugar-water feeder) + **debris** wipe + queen health, climate
meter visual-only (deferred like terrarium's temp); honey harvest with the §7
gentleness framing as the coin loop; 48 hero bees, no crowd layer; offline
build/brood + reveal card; queen pet card in the existing `ui.js` fish-card UI;
the three honeybee-caste collection entries.

**Out (v2+):** drones + drone eviction; reared new queens + **swarming / second
hive** (the big v2 beat — it's the structural-growth headliner but needs the
second-tank plumbing); on-screen meadow + forage-flight pack + planting flowers;
crowd-bee layer; climate meter as a real mechanic + bearding; robbing events;
wax-moth/beetle pest; subspecies queens; bumblebee + solitary-bee hive types
(§6 direction (c)); seasons as a full real-clock cycle (MVP fakes season as a
slow drift).

Build order (each step demoable to the 6-year-old, the real QA department):
comb grid + hex canvas painter → build scoring with a fake auto-builder (no
bees) → flow fields → hero bees walking the comb → forage tube + stores → brood
cycle → waggle dance → care meters + feeder → honey capping + harvest → offline
ticks → reveal card.

## 10. Making bees lovable (the framing job)

Bees are the one habitat most kids are **afraid** of. If the game doesn't
actively make them lovable, a scared 6-year-old never opens it. This is a design
requirement, not flavour. How the game does it:

- **Glass between you and them, always.** It's an *observation hive* — the whole
  premise is "watch the colony in perfect safety." The kid is never in the swarm;
  they're at the window. That's the real thing and it's inherently calming.
- **The pet bees never sting you.** There is no sting mechanic aimed at the
  player, ever. Guards are framed as *doorkeepers* checking visitors, not
  attackers. Stings are handled honestly but gently as a **fact** on the worker
  card, in defensive context ("a worker can sting to protect her home, and she
  only does it as a last resort — it costs the bee her life, so she really
  doesn't want to"), never as a threat to the kid.
- **Lead with the un-scary bees.** Drones (no stinger at all — say it out loud),
  and especially the **solitary bees** (§6): "most bees in the world live alone,
  don't make a hive, and almost never sting." The single best fear-defuser in
  entomology, and true. A first-run beat can literally open on a fuzzy, gentle
  bumblebee or a mason bee before the big colony.
- **Fuzzy, warm, rounded art.** Realistic-not-cartoon still means *choosing* the
  fuzziest, roundest, most teddy-bear-accurate real bees (bumblebees, the fuzzy
  golden Italian honeybee) and warm amber lighting. The calm hive **hum** audio
  bed reframes "buzzing" from a threat sound into a cozy, sleepy one.
- **The waggle dance reframes the whole animal** from "thing that stings" to
  "thing that *talks by dancing*." That reframing is the emotional core of the
  habitat.
- **Names and stakes create love, not fear.** The queen is named and cared for
  like any pet; the colony's moods are legible and gentle. A kid who has named
  their queen and watched their hive build honey is not afraid of bees anymore —
  that transformation *is the product's reason to exist.*

> **DECIDED (John, 2026-07-09): (b) colony-first, safety-framed.** Open straight
> on the beautiful glass observation hive and let the "you're safe at the
> window" + calm-hum framing do the work, with the stingless **drones** (and the
> solitary bees) spotlighted prominently early as fear-defusers. Add the
> one-time **parent comfort toggle** (c) if it's cheap. Rationale: strongest
> first impression, and it trusts the framing that is the product's reason to
> exist.
```
