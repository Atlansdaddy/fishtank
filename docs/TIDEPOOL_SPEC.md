# Tide Pool — Habitat Pack Spec

The aquarium family's second habitat. Goal: ship the rocky-shore roster — an
**octopus**, sea stars, urchins, anemones, crabs, sculpins — with **maximum
reuse** of the live aquarium engine. It is the same water tech (`tank.js`
surface + caustics, `Swarm` swim/crawl, `FoodSystem`, `CareSim`); the only
genuinely new idea is a second real-clock rhythm alongside day/night: the
**TIDE**. Everything else maps to a module that already exists.

The "can't have" hook (per `HABITAT_VISION.md`): the beach you can't take
home, and the smartest pet in the game living in it.

---

## 1. Enclosure rendering (reuse `src/tank.js` pattern)

`buildTidepool(scene, renderer)` returns the same handle shape as `buildTank()`
— `{ group, setTheme(type), setDay(df), update(t) }` — plus one added method
`setTide(tf)` (0 = dead low, 1 = full high) that `main.js` drives off the tide
clock exactly like it drives `setDay(df)` today. `main.js` swaps the builder in
without touching the frame loop.

**Keep the glass-frame contract.** A tide pool renders naturally as an
open-topped rocky basin, but the engine's environment interface *is* a
glass box viewed through the front pane, and the whole product reads as
"a real exhibit in your pocket." So we keep `addFrame` verbatim and frame this
as a **public-aquarium tide-pool touch tank**: glass-sided (you watch the
rock shelves and the waterline in cross-section through the front), open top,
`TANK` dims unchanged (`122×61×61` is a believable touch tank). The illusion
of "open shore" comes from the rockwork above the waterline and the wave-surge
at the rim — not from removing the box. This keeps `TANK`/`BOUNDS` constants
and every camera/gesture path identical.

| Aquarium element (`tank.js`) | Tide-pool equivalent | Notes |
|---|---|---|
| Sand bed (`PlaneGeometry` + dune noise) | Coarse shell-grit bottom | Same displaced plane, theme colors `grit`/`gritDark` (`#c8b89a`/`#8a7a5e`). Lower amplitude than sand dunes — a tide pool floor is mostly rock and gravel, not dunes. |
| Back & side inner walls (`BackSide` box) | Rock backing | Same dark box; color `#3a352e`. A noise-displaced bumpy plane in front of it is the back rock face (climbing/crawl surface, visually wet). |
| Water **surface plane** (`surfMat` ripple) | **Tide-driven surface** | Reuse `surfMat` and its `onBeforeCompile` ripple **verbatim**, but its `position.y` is now `lerp(LOW_LEVEL, HIGH_LEVEL, tf)` set every frame in `update()`/`setTide()` instead of the fixed `TANK.WATER_LEVEL`. `LOW_LEVEL ≈ 18`, `HIGH_LEVEL ≈ 55`. As the plane drops, rock shelves emerge above it — the core visual of the whole habitat. |
| Caustics shader on grit | Caustics, tide-scaled | Reuse the caustics quad. Multiply its opacity by `tf` (weak dappling in a shallow low-tide pool, strong when deep) in addition to the existing `day` term. Its `position.y` tracks a little under the moving surface. |
| `buildShafts()` sun shafts | Keep | Read great through shallow water; tint slightly warmer `vec3(0.9,0.95,1.0)`, and fade with `tf` (shafts need water depth to exist). |
| `buildBubbles()` airstone | **Wave-surge + spray/foam** (spec below) | Repurpose the `Points` system: not a rising bubble column but a **foam/spray burst** at the rim on each wave surge, plus a thin sheet of foam bubbles riding the surface. Idle count low; surges are periodic (see §2). |
| `buildMotes()` marine snow | Suspended plankton/sand | Keep as-is; drift lateral with the surge phase rather than straight up, opacity scaled by `tf` (clearer, stiller water when the pool is isolated at low tide). |
| Glass frame (`addFrame`) | **Identical** | Kept per the contract justification above. |
| Decor (`buildDecor` in `main.js`) | **Rock shelves, crevices, holdfasts** (spec below) | New `buildDecor('tide')` branch. Rocks reuse the existing `DodecahedronGeometry` rock code but are **stacked into stepped shelves at known heights** so specific ledges emerge at specific tide levels. Add crevice hides (half-`CylinderGeometry`, like the terrarium half-log) — these are octopus dens and crab hides. Kelp/surfgrass blades reuse the freshwater plant-blade code with a broader, browner blade. |

### Wave-surge shader at the rim (the one new visual)

A thin additive band mesh spanning the pool at the current surface height, its
opacity pulsing on a **surge cycle** (period ~6–9 s, independent of the slow
tide). One `ShaderMaterial` (copy the `buildShafts` shader scaffold): a moving
foam line `smoothstep`-ed across `vUv.x` with time, whiter and taller as the
surge peaks. On each surge peak, emit ~20 spray particles from the up-current
rim (the `buildBubbles` Points system, launched upward+inward, gravity-fall,
fade). Surge amplitude scales with `tf` — dramatic white water at high tide,
a gentle lap at low tide. This is the shot that sells "the ocean is right
there," at two draw calls.

Theme entry (`WATER_THEMES` sibling — becomes per-pack `themes` after the
engine split):

```js
tide: {
  fogColor: 0x14384a, fogDensity: 0.0026,   // clearer than reef: shallow, sunlit
  deep: 0x0e2c3c, tint: 0x2a6a86,
  lightColor: 0xffffff, lightIntensity: 1700,  // bright open-shore sun
  ambient: 0x35505e,
  grit: 0xc8b89a, gritDark: 0x8a7a5e,
  rock: 0x3a352e, surface: 0xbfe4ea,
  foam: 0xf2f8ff,
}
```

## 2. Care model mapping (reuse `CareSim` in `src/sim.js`) + the TIDE clock

### 2.1 The tide clock (new rhythm, mirrors `rawDayFactor`)

Day/night is a `rawDayFactor()` that reads the wall clock and returns 0..1;
the tide is a **second, independent** function of the same clock, smoothed the
same way `df` is (`tf += (rawTideFactor() - tf) * min(1, dt*0.8)`), and pushed
into the environment via `setTide(tf)` and into `Swarm` via `swarm.tideFactor`.
It is a *clock*, not a stored meter (nothing to save; it is always derivable
from `Date.now()`, exactly like day/night). This is the whole reason the
habitat feels alive between sessions: **the shore is in a different state every
time the kid opens it**, driven by the real world, not a timer that nags.

> **DECIDED (John, 2026-07-09): (a) real lunar semidiurnal tides.** Two highs +
> two lows per day on the true **12.42 h** cycle, so high tide drifts ~50 min
> later each day and genuinely tracks the moon. `rawTideFactor()` is a raised
> cosine over that period, phase-seeded from a fixed epoch (~20 lines). A
> **tide chart in the Book** lets the kid read where the tide is and when it
> turns. *Rationale:* truest to nature and a real teaching moment ("the tide's
> late today, like at the real beach") at trivial cost — the authenticity is
> the whole point of a tide-driven habitat.

### 2.2 Meters onto `CareSim`

`CareSim._decay()` already does hunger/health/water/algae/offline/growth. The
meters get relabeled and their decay is **coupled to the tide clock** — which
is the interesting part.

| Aquarium meter | Tide-pool meter | Mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Pool freshness / oxygen** | Same field, but **the tide does your water changes for free**: while `tf` is high, surge exchanges water, so add a tide-scaled recovery term `t.water += tf * (1/24) * hours * 0.4`. While `tf` is low the pool is isolated and stagnates — decay runs ~1.6× the aquarium `WATER_DECAY_DAYS` rate. Net: a healthy pool self-maintains at high tide and needs help at low tide. Player action: **wave pump** tool (a coin/day toggle) forces surge when the tide is out — maps to `waterChange()`, `+0.55`. |
| `tank.algae` (0→1) | **Slime / overgrowth on rock** | Identical growth curve and the identical wipe gesture (`sim.scrubAlgae(0.015)` per pointermove + sparkles). Rendered as green biofilm on the emerged rock faces (grows faster on rock that's been air-exposed and sunlit — bias growth by recent low-tide time). **Grazer cleaning is TO-BE-BUILT, not a reused mechanic:** today nothing in the engine lowers `tank.algae` except the kid's wipe gesture (`sim.scrubAlgae`, `src/sim.js:123`), and `cleans:true` is read nowhere. Add a tiny **capped** reduction (~0.1/day, matching `REEF_PACK_SPEC` §4.2 D5) for `cleans:true` grazers (urchins, chitons, snails) so they *help* — but scrubbing stays the kid's job, same as plecos should for aquarium algae. |
| Rotting food pollution | Uneaten food | Identical `UNEATEN_POLLUTION` path. At low tide, uneaten food strands on exposed rock and pollutes faster (concentrated in a small pool) — multiply the pollution term by `(1.4 - 0.4*tf)`. |
| — (implicit in tide) | **Emersion / stranding** | Not a stored meter — derived from `tf` + each animal's `tideBand`. When the surface drops below an animal's home shelf, it is **exposed to air**. Low-`airTolerance` species (octopus, sculpin, urchin) take the `t.water < SICK_THRESHOLD`-style health drain while stranded; high-tolerance species (barnacle, anemone, chiton, high-zone snails) are fine — that's literally why they live up the shore. See §2.3. |
| Offline decay | Identical | `applyOffline()` loops habitats exactly as it loops `['fresh','salt']`. Tide state on return is recomputed from the clock, then stranding/health math applies over the elapsed hours using the true tide curve. |

### 2.3 Stranding — how meters interact with the tide

Each species declares a `tideBand` (`'splash' | 'high' | 'mid' | 'low' |
'subtidal'`) = the shelf height it lives on, and an `airTolerance` (0..1). Each
frame, `exposed = surfaceY < shelfY(tideBand)`. For an exposed agent:

- **High tolerance** (barnacle 1.0, anemone 0.9, chiton 0.8, hermit 0.7):
  closes up / hunkers (barnacle plates shut, anemone retracts to a blob,
  chiton clamps) — a visible animation, **no health cost**. This is the
  educational core: the animals that live high are built for air.
- **Low tolerance** (octopus 0.15, sculpin 0.25, urchin 0.4): health drains on
  the stranded path and they actively try to move down-shore into remaining
  water (crawl/jet toward the deepest cell). If the kid runs the wave pump or
  the tide simply comes back, they recover — same recover-when-clean logic as
  aquarium water.

> **DECIDED (John, 2026-07-09): (a) soft stranding — never an instant kill.**
> Stranded low-tolerance animals only *lose health slowly* and always seek
> water themselves; a genuinely neglected pool can still lose an animal over
> days (same honest stakes as the aquarium), but a single low tide never kills.
> *Rationale:* teaches the real consequence of the tide without ambushing a
> 6-year-old. (The rescue-drag interaction from option (b) is parked as a
> post-MVP caretaking beat.)

`rules.js` `evaluateAdd()` runs **unchanged**: bioload = pool space,
`soloOnly` covers the octopus (and territorial anemones vs. their own kind),
the predator size rule (`canEat`, 0.42 ratio) covers "the octopus will eat
your hermit crab," and the `water !== current` check blocks tide-pool species
in fish tanks and vice-versa. `finNipper`/`longFins` stay `false` everywhere —
kept so the schema and rules stay identical.

## 3. Foods (`FOODS` sibling, same field shape)

`floatTime`/`sinkSpeed` keep their aquarium meaning; a per-food `behavior`
(`sink` / `drift` / `static` / `cling`) rides along for the engine-split food
strategy. Tide pool feeding is mostly bottom/rock, so most items sink or cling.

| id | name | emoji | eaten by | behavior when dropped |
|---|---|---|---|---|
| `shrimpbit` | Shrimp Bits | 🦐 | octopus, sculpin, hermit, star, anemone | sinks; the meaty staple, almost everyone takes it |
| `crabmeat` | Crab & Clam | 🦀 | octopus (favorite), sea star, big hermit | sinks fast; the octopus's enrichment food — triggers its best hunting animation |
| `algaesheet` | Algae Sheet | 🟩 | urchin, chiton, snails, limpets | `cling`: drifts to a rock face and sticks (reuse the `cling`-to-glass idea); grazers rasp it down |
| `plankton` | Plankton Mix | 🌫️ | anemone, barnacle, feather duster, mussels | `drift`: a slow particle cloud in the water column that filter-feeders and anemones catch as it passes |
| `detritus` | Detritus / Leftovers | 🍂 | hermit crabs, snails, brittle stars (cleanup crew) | `static`: settles on grit, scavengers find it via `food.nearestFor` |

Anemones and barnacles are `sessile` (existing flag) — they don't seek food;
instead `plankton`/`shrimpbit` within reach auto-feeds them (a small radius
check in their sessile branch, like a passive `feed`). Free trophallaxis-style
fact fodder for the collection cards.

## 4. Locomotion — mapping to existing systems in `src/behavior.js`

| Mode | Species | Implementation |
|---|---|---|
| **Crawl** (exists) | sea stars, urchins, chitons, hermit crabs, snails, shore crabs, brittle stars | `Agent.crawler` path verbatim: `_animateCrawler` + `_pickCrawlTarget` + `CRAWL_SPEED` per archetype. Floor + rock surfaces. Urchin/chiton get very low speeds (0.4–0.6). **Note:** `_animateCrawler`'s existing "graze" branch (`src/behavior.js:426`) grazes **sunk food items**, not algae — a grazer that actually eats down rock-slime is a small **TO-BE-BUILT** mechanic, not a reused one (see §2.2). |
| **Climb** (exists) | snails, chitons, sea stars, limpets | The snail/star `climber` flag: `_switchSurface()` walking between `SURFACES.floor/front/back/left/right`. A sea star spread flat on the front glass showing its tube feet is this habitat's version of the terrarium's gecko-on-glass hero shot. **Add rock-face surfaces** (below) so they climb the shelves, not just the tank walls. |
| **Sessile** (exists) | anemones, barnacles, feather dusters, mussels | `Agent.sessile` + `_animateSessile` verbatim — tentacle/plate sway. Barnacles and anemones add a **tide-close** animation (scale to a closed blob when `exposed`). ~15 lines in the sessile branch. |
| **Swim** (exists) | tidepool sculpin, blennies, small gobies | The default swim path, unchanged. `zone:'bottom'` keeps them low in the pool; they dart between rock crevices. Reuse the `_restLogic` glass/rock-sit for a sculpin perched on a ledge. |
| **Rock-face surfaces** (small new) | all climbers/crawlers | The stepped rock shelves from `buildDecor` register as extra `SURFACES`-style entries (a few angled planes with a `normal`, `pin` axis, `val`, and `a`/`b` tangents). `_switchSurface` gains "rock" as an option alongside floor/glass. ~50 lines — the same generalization the terrarium branch-perch note describes. |
| **Jet-crawl** (NEW — the octopus, spec below) | octopus | New locomotion, ~180 lines. |

### The OCTOPUS — jet + crawl hybrid movement

`locomotion: 'jetcrawl'`. The octopus is a boneless crawler that *can* swim in
bursts. Two states layered on the existing crawler:

- **Crawl (default):** it is a `crawler` glued to whatever surface it's on
  (grit, rock shelf, or glass), using the exact `_animateCrawler` glue — arms
  reaching, body flowing over contours. Slow (`crawlSpeed ≈ 3.0`), constantly
  changing which surface it hugs. Reuses `SURFACES` + the new rock faces.
- **Jet (burst):** on startle (`startleNear` already reaches it), on a hunt
  lunge, or when stranded and fleeing down-shore, it detaches from the surface
  and does a **ballistic jet**: mantle contracts (squash the body), a puff of
  spray/ink-free water particles fires backward (reuse the surge Points), and
  it shoots in the opposite direction for ~0.4 s at 4–5× crawl speed, arms
  trailing behind (the `eel`-style travelling wave on the arm meshes reads
  perfectly here). Then it flops back onto the nearest surface and resumes
  crawling. This is the same startle→burst→settle shape the fish already have,
  just with a surface re-attach at the end.
- **Denning:** it picks a crevice hide as its home (like the terrarium hide
  target in `_restLogic`) and returns there to rest, often dragging a shell or
  rock to the entrance (a carried prop — cheap, and pure character).

The visual needs a new `octopus` archetype in `invertbuilder.js`: a soft
mantle (squashed sphere), 8 tapered arms (`cyl`/`cone` chains with the `eel`
wave applied via `userData.sway`), suckers as a texture or small spheres, and
the two signature blue eyespots. `animateInvertVisual` already walks
`userData.sway`, so the arms animate for free.

### The octopus intelligence layer

> **DECIDED (John, 2026-07-09): (a) escape-artist tier ships first (~150 lines).**
> A normal agent plus three unscripted moments: **camouflage** (a shader term
> blends the octopus's `base` color/roughness toward the nearest surface it's
> crawling on over ~1.5 s — reuse the fish `sick` uniform pattern for a `blend`
> uniform; it "disappears" against rock and reappears when it moves), an
> occasional **escape attempt** (climbs the front glass, pokes one arm over the
> rim — like the ant-farm escape event; tap to coax it back, never punitive),
> and **denning** with a dragged prop. *Rationale:* cheap, reuses
> startle/rest/crawl/camo, and already delivers the "it's clever!" gasp that
> sells "the smartest pet in the game." The smarter tiers — reactive pet
> (~400 lines: watches the finger, learns feeding spots, investigates props)
> and full puzzle pet (~800+ lines: jar-opening minigames) — **layer in later**
> as post-MVP upgrades; the puzzle tier especially wants its own milestone and
> must not undercut the no-timers/no-minigame ethos in `HABITAT_VISION.md`.

> **DECIDED (John, 2026-07-09): the octopus is an honest predator, governed by
> the game-wide Nature-scenes toggle.** `predator:true`; over days it hunts the
> hermits, crabs, snails, and sculpins that fit the `canEat` 0.42 ratio
> (`rules.js` already *warns* at purchase: "your octopus may eat this"), paired
> with "a well-fed octopus hunts less" (suppress hunting while `hunger < 0.35`,
> which the code already gates on) so feeding it protects the tank. **Whether
> the kill shows on-screen is not a per-habitat flag** — it is decided by the
> single **game-wide Nature-scenes parent setting** (`ROADMAP.md` 2026-07-09,
> default = shown, matter-of-fact, no gore; alternative = off-screen event),
> which **supersedes** the old per-habitat predation flag. *Rationale:* honest
> to the tide pool, self-balancing via hunger, and consistent with every other
> predator in the game.

Day/night: `Swarm.nightFactor` drives activity as today. Octopus and sculpin
are crepuscular/nocturnal (`nocturnal` tag) — the octopus comes out of its den
and roams after the kid's lights go out, the game's best night-check-in beat.

## 5. Species plan

**Target roster: 26 species** (aquarium ships 202, terrarium 30; a tide pool is
a smaller, denser community, so ~26 authored is the right "rich but real"
size). Composition target: 1 octopus, 3 sea stars (ochre, bat, brittle),
2 urchins (purple, green), 3 anemones (giant green, aggregating, strawberry),
4 crabs (blueband hermit, hairy hermit, striped shore crab, decorator),
4 snails/limpets/chitons (black turban snail, periwinkle, owl limpet, lined
chiton), 3 sculpins/blennies (tidepool sculpin, woolly sculpin, rockweed
gunnel), plus barnacle, mussel bed, feather duster, nudibranch, and a small
subtidal fish or two. All `water:'tide'`, real Pacific/Atlantic rocky-shore
species, true colors, 3 kid-true facts each.

Schema is **identical** to `src/species/saltwater.js` + the invert additions
(`kind:'invert'`, `edible`, `cleans`), with the same tide-pack deltas the
terrarium used: a `locomotion` field, and two tide fields — `tideBand`
(`'splash'|'high'|'mid'|'low'|'subtidal'`) and `airTolerance` (0..1). Below are
**8 flagship species fully authored**.

```js
export const TIDEPOOL_SPECIES = [
  {
    id: 'two_spot_octopus', common: 'California Two-Spot Octopus',
    scientific: 'Octopus bimaculoides',
    water: 'tide', kind: 'invert', adultSizeCm: 18, bioload: 8, minSchool: 1,
    temperament: 'semi', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'bottom',
    locomotion: 'jetcrawl', tideBand: 'low', airTolerance: 0.15,
    speed: 0.6, schooling: 'solo', diet: ['crabmeat', 'shrimpbit'], price: 140,
    archetype: 'octopus', size: 1.0, edible: false, cleans: false,
    colors: { base: '#8a7566', belly: '#b5a494', fin: '#6a564a',
      pattern: 'spots', patternColor: '#2a6ec8', patternScale: 1.0, iridescence: 0.2 },
    habitat: 'Rocky reefs and tide pools along the coast of southern California and Mexico.',
    facts: [
      'It has two bright blue spots that look like extra eyes — that is how it got its name.',
      'It can change its color AND its bumpy skin in a blink to vanish against a rock.',
      'With no bones at all, it can squeeze its whole body through a hole the size of its eyeball.'
    ],
    care: 'Hard'
  },
  {
    id: 'ochre_star', common: 'Ochre Sea Star', scientific: 'Pisaster ochraceus',
    water: 'tide', kind: 'invert', adultSizeCm: 25, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'bottom',
    locomotion: 'climb', tideBand: 'mid', airTolerance: 0.7,
    speed: 0.2, schooling: 'solo', diet: ['shrimpbit', 'crabmeat', 'detritus'], price: 30,
    archetype: 'star', size: 1.2, edible: false, cleans: true,
    colors: { base: '#d8691f', belly: '#e0925a', fin: '#b04a12',
      pattern: 'spots', patternColor: '#e8c8a0', patternScale: 1.4, iridescence: 0.05 },
    habitat: 'Wave-battered rocks of the Pacific coast, from Alaska to Baja California.',
    facts: [
      'The same kind of star can be bright orange OR deep purple — nobody is sure why.',
      'Hundreds of tiny suction-cup feet on its underside pull it slowly across the rock.',
      'It pushes its own stomach OUT of its body to eat a mussel right inside the shell.'
    ],
    care: 'Medium'
  },
  {
    id: 'purple_urchin', common: 'Purple Sea Urchin', scientific: 'Strongylocentrotus purpuratus',
    water: 'tide', kind: 'invert', adultSizeCm: 8, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'bottom',
    locomotion: 'crawl', tideBand: 'low', airTolerance: 0.4,
    speed: 0.15, schooling: 'loose', diet: ['algaesheet', 'detritus'], price: 18,
    archetype: 'urchin', size: 0.9, edible: false, cleans: true,
    colors: { base: '#6a4a9a', belly: '#7a5aa8', fin: '#4a3070',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Rocky low-tide zones and kelp forests of the North American Pacific coast.',
    facts: [
      'It slowly chews a bowl-shaped hollow into solid rock to make itself a snug home.',
      'It walks on see-through tube feet that reach out between its spines.',
      'Its five teeth are so tough that scientists named the tooth machine "Aristotle\'s lantern".'
    ],
    care: 'Easy'
  },
  {
    id: 'giant_green_anemone', common: 'Giant Green Anemone', scientific: 'Anthopleura xanthogrammica',
    water: 'tide', kind: 'invert', adultSizeCm: 17, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['hostsAnemone'], zone: 'fixed',
    locomotion: 'sessile', tideBand: 'mid', airTolerance: 0.9,
    speed: 0, schooling: 'solo', diet: ['plankton', 'shrimpbit'], price: 22,
    archetype: 'anemone', size: 1.1, edible: false, cleans: false,
    colors: { base: '#3f9a55', belly: '#7ab88a', fin: '#e8d84a',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Surge channels and tide pools of the Pacific coast, in bright sunny spots.',
    facts: [
      'It is green because tiny algae live inside it and make food from sunlight, like a plant.',
      'When the tide goes out it folds its arms in and becomes a squishy blob to stay wet.',
      'Its soft-looking arms are covered in stingers that zap and grab tiny drifting food.'
    ],
    care: 'Easy'
  },
  {
    id: 'blueband_hermit', common: 'Blueband Hermit Crab', scientific: 'Pagurus samuelis',
    water: 'tide', kind: 'invert', adultSizeCm: 2, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'bottom',
    locomotion: 'crawl', tideBand: 'high', airTolerance: 0.7,
    speed: 0.4, schooling: 'loose', diet: ['detritus', 'algaesheet', 'shrimpbit'], price: 6,
    archetype: 'crab', size: 0.5, edible: true, cleans: true,
    colors: { base: '#7a4a2a', belly: '#9a6a3a', fin: '#2a7ac0',
      pattern: 'stripesH', patternColor: '#2a7ac0', patternScale: 1.2, iridescence: 0.15 },
    habitat: 'High rocky tide pools along the Pacific coast, from Alaska to Baja.',
    facts: [
      'It wears an empty snail shell as a house and trades up for a bigger one as it grows.',
      'Bright blue bands on its legs and red antennae make it easy to spot.',
      'If scared it pulls all the way inside and blocks the door with one big claw.'
    ],
    care: 'Easy'
  },
  {
    id: 'tidepool_sculpin', common: 'Tidepool Sculpin', scientific: 'Oligocottus maculosus',
    water: 'tide', kind: 'fish', adultSizeCm: 9, bioload: 2, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'bottom',
    locomotion: 'swim', tideBand: 'mid', airTolerance: 0.25,
    speed: 0.9, schooling: 'loose', diet: ['shrimpbit', 'detritus'], price: 12,
    archetype: 'goby', size: 0.8, shape: { height: 0.9, finFlow: 0.9 },
    colors: { base: '#6a5a3a', belly: '#c8b890', fin: '#8a7448',
      pattern: 'patches', patternColor: '#3a2e1c', patternScale: 1.3, iridescence: 0.05 },
    habitat: 'Rocky Pacific tide pools from Alaska to California, darting among the weeds.',
    facts: [
      'It can change color to blend into its pool, from green to brown to speckled.',
      'If its pool dries up it can breathe a little air and wriggle to a wetter spot.',
      'Moved to a new pool, it can find its way back home to its very own pool.'
    ],
    care: 'Easy'
  },
  {
    id: 'lined_chiton', common: 'Lined Chiton', scientific: 'Tonicella lineata',
    water: 'tide', kind: 'invert', adultSizeCm: 5, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'glass',
    locomotion: 'climb', tideBand: 'mid', airTolerance: 0.8,
    speed: 0.15, schooling: 'loose', diet: ['algaesheet', 'detritus'], price: 14,
    archetype: 'chiton', size: 0.7, edible: false, cleans: true,
    colors: { base: '#c85a6a', belly: '#e0a878', fin: '#8a2a3a',
      pattern: 'stripesV', patternColor: '#f0d0a0', patternScale: 1.5, iridescence: 0.2 },
    habitat: 'Rocks in cool Pacific tide pools, often where pink coralline algae grows.',
    facts: [
      'Its back is eight overlapping plates of armor, so it can bend over bumpy rock.',
      'It scrapes algae with a tongue tipped in teeth made of real iron — the hardest teeth on Earth.',
      'Pry-proof: it clamps down so hard you cannot pull it off the rock.'
    ],
    care: 'Medium'
  },
  {
    id: 'acorn_barnacle', common: 'Acorn Barnacle', scientific: 'Balanus glandula',
    water: 'tide', kind: 'invert', adultSizeCm: 1.5, bioload: 1, minSchool: 5,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'fixed',
    locomotion: 'sessile', tideBand: 'high', airTolerance: 1.0,
    speed: 0, schooling: 'loose', diet: ['plankton'], price: 4,
    archetype: 'barnacle', size: 0.5, edible: false, cleans: true,
    colors: { base: '#d8d0c0', belly: '#f0ece0', fin: '#a89a84',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.05 },
    habitat: 'Packed onto high rocks all along the Pacific coast, in the splashing waves.',
    facts: [
      'A barnacle glues its own head to the rock and spends its whole life standing on it.',
      'It kicks feathery legs out of its shell to comb tiny food from the water.',
      'When the tide drops it shuts its plates like a trapdoor to keep from drying out.'
    ],
    care: 'Easy'
  },
];
```

The remaining ~18 species (bat star, brittle star, green urchin, aggregating +
strawberry anemone, hairy hermit, striped shore crab, decorator crab, black
turban snail, periwinkle, owl limpet, woolly sculpin, rockweed gunnel, mussel
cluster, feather duster, opalescent nudibranch, plus a subtidal fish or two)
are authored the same way by a subagent against this schema when the build
starts — identical to how every other roster in the repo was filled.

## 6. Retention hooks — tied to the tide

All four `HABITAT_VISION.md` mechanics ship, each hung off the tide clock so
the shore is a genuinely different place at different real-world hours.

1. **Care debt (offline decay).** `applyOffline()` runs the pool while away.
   Because low tide stagnates the water and strands the sensitive animals, the
   *state you return to depends on where the tide is when you open the app* —
   coming back at a neglected low tide is visibly worse than at a fresh high
   tide. Genuine, honest, and never a nag.
2. **Growth & babies.** Existing `growth`/`GROW_DAYS`: juvenile stars, urchins,
   octopus grow to adult with good care. Hermit crabs **change shells** on a
   growth event (`'grown'`) — swap to a bigger shell prop, a collectible beat.
   Anemones that are healthy and well-fed **split into a clone** (real
   aggregating-anemone behavior) via the existing livebearer-style breed path,
   generalized from `archetype==='livebearer'` to a `breeds:'split'` flag.
3. **Collection book.** Every species owned unlocks its card (facts, habitat,
   record size), same `discovered[]` + Fish-Book UI. Rocky-shore roster is a
   tight, gotta-find-them-all set; the octopus card is the trophy.
4. **Surprises — washed in at high tide, revealed at low tide:**
   - **High-tide arrivals:** on a high tide (especially the first open after
     one), something *washes in* — a stranded moon jelly drifting through, a
     new hermit crab, a clump of drift kelp with a tiny crab riding it, a
     message-in-a-bottle / sea-glass collectible. Fires a `sim.events` push
     like `'grown'` does today; tap to keep or return it.
   - **Low-tide reveals:** as the water drops, the emerged rock **reveals**
     things the water hid — a sea star that crawled up overnight, a fresh
     barnacle patch, an octopus egg festoon under a ledge, a hidden nudibranch.
     A gentle "the tide's out — look what's on the rocks" toast.
   - **Octopus escape / camouflage moment** (per §4 decision (a)): the
     catch-it-once-and-gasp beat, the tide-pool sibling of the terrarium's
     night-only behaviors and the ant-farm escape event.
   - **Octopus den redecoration:** find a new shell or pebble stacked at its
     crevice door between visits.

## 7. Performance budget (S24-class, 60 fps, alongside DOM UI)

Same envelope the 42-fish aquarium already hits; the tide pool is *lighter* on
agent count (rocky pools are dense with small slow animals, but we cap them) and
adds only the tide/surge visuals.

| System | Budget | Approach |
|---|---|---|
| Agents | **≤ 30 simulated** (`CAPACITY.maxFish`-style cap), most are slow crawlers/sessile | Crawlers and sessile animals are far cheaper than schooling fish — no boids, 10 Hz-ish target picks, tiny velocity math. The octopus is the only "expensive" agent (camo shader blend + arm wave) and there is exactly one. |
| Tide surface + caustics | reuse aquarium cost exactly | Moving one plane's `y` is free; caustics/shafts are the same shaders, just tide-scaled opacity. |
| Wave surge + spray/foam | 2 draw calls + ≤ ~60 `Points` | One additive band mesh (surge shader) + the repurposed `buildBubbles` Points for spray; both already budgeted in the aquarium. |
| Rock shelves / crevices | static meshes, merged | `buildDecor('tide')` builds the shelves once into a merged geometry; no per-frame cost. Emergence is just the water plane passing them — zero rock updates. |
| Octopus camouflage | 1 shader uniform lerp | A `blend` uniform on its material (copy the fish `sick` uniform pattern), no render-target reads — the color it blends toward is sampled from the surface it's on in JS, not the framebuffer. |
| Shadows | agent shadows ON, as today | **Correction:** the aquarium *does* cast dynamic agent shadows — `renderer.shadowMap` is enabled (`src/main.js:58-74`) and agents set `castShadow` (`fishbuilder.js:298,319`, `invertbuilder.js:148`). Match it: crawlers/sessile animals cast shadows onto the rock and grit exactly like the fish do. At ≤ 30 slow agents this sits well inside the same shadow budget the 42-fish aquarium already pays — no new cost. |
| Offline tide/stranding | closed-form over elapsed hours | `applyOffline()` integrates health with the analytic tide curve; no per-tick loop needed for a pool this size. A few ms on load. |

LOD is a non-issue at ≤ 30 slow agents; the follow-cam on the octopus gets its
full arm/camo animation, everyone else is already cheap.

## 8. MVP cut — 8 species, minimum systems

| Species | Locomotion | Why |
|---|---|---|
| California Two-Spot Octopus | jetcrawl (new) | THE hook; ships with intelligence **option (a)** — camo + escape + den, hunting toggle default honest |
| Ochre Sea Star | climb (exists) | star-on-the-glass hero shot; keystone-species fact gold |
| Purple Sea Urchin | crawl (exists) | grazer + `cleans`; the rock-boring fact |
| Giant Green Anemone | sessile (exists) | proves the tide-close animation; passive feeding |
| Blueband Hermit Crab | crawl (exists) | cheap starter, shell-swap growth beat, octopus prey |
| Tidepool Sculpin | swim (exists) | the one swimmer; proves fish live here too; color-change |
| Lined Chiton | climb (exists) | armor + iron-teeth fact; rock-face grazer |
| Acorn Barnacle | sessile (exists) | the high-zone air-breather that teaches the tide bands; cheap |

**Systems in MVP:** tide-pool environment builder with the tide-driven surface
+ wave surge; the **tide clock** (`rawTideFactor` — model per John's decision,
recommend real 12.42 h); `setTide` wiring in the frame loop; pool-freshness +
rock-slime meters with tide-coupled decay; stranding on the **soft** setting
(decision (a)); rock-face surfaces for climbers; octopus jetcrawl + camouflage
+ escape event; foods `shrimpbit / crabmeat / algaesheet / plankton / detritus`;
octopus archetype + barnacle/chiton archetypes added to `invertbuilder.js`
(star/urchin/anemone/crab already exist).

**Deferred to v2:** octopus intelligence options (b)/(c) (reactive pet /
jar puzzles); anemone cloning and full shell-economy for hermits; the
high-tide "washed-in" visitor system beyond one starter surprise; the wave-pump
tool (MVP: tide self-manages, no manual surge); decorator crab (needs a
prop-attach system); nudibranch and mussel-bed archetypes; the rescue-drag
stranding interaction (decision (b)); the remaining ~18 roster species.
