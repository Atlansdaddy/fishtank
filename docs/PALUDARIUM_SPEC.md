# Paludarium — Habitat Pack Spec

The merge habitat. It is only "free" in the sense that both parent techs
already ship: the **aquarium** owns water, caustics, surface, motes, shafts,
bubbles, boid swimming; the **terrarium** owns soil, plants, branches,
crawl/climb/hop locomotion, humidity/dirty-glass meters. Paludarium is those
two packs rendered in one glass box with a waterline drawn between them, plus
exactly one genuinely new idea — **agents that cross the waterline** — and two
absorbed sub-concepts the roadmap folded in: **Pond** (koi, turtles,
tadpole→frog) and **Crabitat** (land hermit crabs that swap shells).

Everything here maps to an existing module. New code is: one waterline shader
mask, one `amphibious` locomotion state machine, a metamorphosis builder-swap
hook, and a shell-swap item system. Sized for John's S24 baseline at 60 fps —
and this is the one habitat that renders BOTH parent scenes at once, so §8 is
written honestly, not optimistically.

---

## 1. Enclosure rendering (split-world reuse of `src/tank.js` + terrarium env)

`buildPaludarium(scene, renderer)` returns the same handle shape as
`buildTank()` — `{ group, setTheme(type), setDay(df), update(t) }` — so
`main.js` swaps it in without touching the frame loop.

The world is one `TANK`-sized glass box (keep `W:122, H:61, D:61`), split by a
horizontal **waterline** at `WATER_LINE = TANK.H * WATER_FRAC`. Below the line
is verbatim aquarium; above and behind is verbatim terrarium; the line itself
is the new tech.

```js
// paludarium constants (pack data after the split)
WATER_FRAC = 0.40,                    // waterline at 40% of interior height
WATER_LINE = TANK.H * 0.40,           // = 24.4 cm  (aquarium WATER_LEVEL was 55)
BEACH_X = 18,                         // land shelf begins at x > +18 (a sloped bank)
```

The land is not the whole top — it is a **sloped bank** rising out of the water
on one side (positive-x third of the footprint), so the scene reads as a shore,
not a layer cake. The substrate plane is displaced: flat-and-low under the
water (sand bed) ramping up through a wet beach into a planted dry bank.

| Aquarium element (`tank.js`) | Paludarium use | Notes |
|---|---|---|
| Sand bed (`PlaneGeometry` + dune noise) | **Full-footprint terrain**, one plane | Same displaced plane, but the displacement adds a ramp: `y += smoothstep(0, BEACH_X, x) * BANK_H`. Underwater portion tinted `sand`; wet-beach band mixes `sand`→`soil`; dry bank is `soil`/`soilDark` (terrarium colors). One mesh, one draw call. |
| Water surface plane (`surfGeo` @ `WATER_LEVEL`) | **Kept, lowered to `WATER_LINE`, clipped to x < BEACH_X** | Same `surfMat` ripple `onBeforeCompile`. From above it is the pond surface; from the side it is the top of the waterline. Its edge where it meets the bank is the shoreline — feather its opacity to 0 across the wet-beach band so there's no hard cut. |
| Caustics shader on sand | **Kept, underwater only** | Same additive quad at `y=1.2`, but its plane is scaled/positioned to cover only x < BEACH_X. Free — it was always a screen-cheap additive pass. |
| Back wall (`BackSide` box) | **Split-tinted back wall** | Same dark box; the `setTheme` deep-color tint applies below `WATER_LINE`, cork-bark brown above. Achieved with the same world-Y shader mask used for agents (below), not a second mesh. |
| `buildShafts()` sun shafts | Kept, underwater only, warmer | Sit below `WATER_LINE`; shorten to `WATER_LINE - 6`. Above water they'd read wrong. |
| `buildBubbles()` airstone | Kept, pops at `WATER_LINE` | One-line change: wrap height `TANK.WATER_LEVEL` → `WATER_LINE`. |
| `buildMotes()` marine snow | Underwater motes + a few land dust motes | Split the point cloud: 70% below the line drifting up (marine snow), 30% above drifting sideways (terrarium dust). Same single `Points` system, seed-partitioned. |
| Glass frame (`addFrame`) | Identical | `TANK` dims unchanged. |
| Decor (`buildDecor`) | Aquatic + terrestrial | Below line: rocks, a driftwood root, aquatic plant blades (reuse). Above line: broad-leaf plants, a branch or two over the water (archerfish targets — see §6), a basking rock at the shoreline (turtle haul-out). All reuse existing `buildDecor` primitives. |

### 1.1 The waterline itself (the new tech — chosen approach)

Three candidate techniques were weighed for a phone GPU:

| Approach | Cost | Half-submerged look | Verdict |
|---|---|---|---|
| **Clip planes** (render each crossing agent twice — dry copy clipped `y>line`, wet copy clipped `y<line`) | 2× draw calls per crossing agent + clip-plane state changes; WebGL clipping adds discards | Correct | ❌ Doubles the exact draw calls we can least afford (agents), and only for the few that cross. |
| **Two-material volume** (a translucent water box; refraction) | Depth sort + transparency overdraw over the whole lower half; refraction is a second pass | Approximate, expensive | ❌ Overdraw is the phone killer; we already avoid a water *volume* in the aquarium for this reason (it uses fog, not a box). |
| **World-Y shader mask** (one global `uWaterY` uniform; every material's fragment shader tints/darkens fragments below it, brightens a thin meniscus band) | ~6–8 ALU per fragment, **single pass, zero extra draw calls** | Free and correct: a fish half-out has its lower half water-tinted and its upper half dry-lit in the same draw | ✅ **CHOSEN.** |

**Chosen: the world-Y shader mask.** One uniform `uWaterY` (world space) is
injected into every agent, terrain, plant, and back-wall material via a shared
`onBeforeCompile` chunk (the same pattern `tank.js` already uses to inject the
ripple `time` uniform). In the fragment shader, using the world position
varying:

```glsl
// shared chunk appended to every pack material's fragment shader
uniform float uWaterY;        // WATER_LINE in world space
uniform float uCausticT;      // time, for underwater shimmer on submerged agents
varying vec3 vWorldPos;
// ... near the end, before gl_FragColor is finalized:
float below = step(vWorldPos.y, uWaterY);
float band  = 1.0 - smoothstep(0.0, 1.2, abs(vWorldPos.y - uWaterY));  // meniscus
// underwater: cool tint + darken + faint caustic shimmer
vec3 wet = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.55,0.78,0.85), 0.6);
wet += 0.10 * below * sin(vWorldPos.x*0.6 + uCausticT) * sin(vWorldPos.z*0.6 + uCausticT*0.9);
gl_FragColor.rgb = mix(gl_FragColor.rgb, wet, below);
// meniscus: a bright refraction lip right at the line
gl_FragColor.rgb += band * vec3(0.9,1.0,1.0) * 0.18;
```

- **Half-submerged rendering is automatic**: a mudskipper with its head in air
  and tail in water gets a dry-lit head and a water-tinted tail in a single
  draw, because the split is per-fragment on world-Y, not per-object.
- **The meniscus line on the glass**: the same `band` term, evaluated on the
  back wall and on a thin inward-facing ring at `y=WATER_LINE` on the four glass
  panes (reuse `addFrame`'s bar helper to lay a 0.3 cm emissive-ish band at the
  waterline), gives the wet lip where water meets glass — the detail that sells
  "there is water here" from the side.
- The existing ripple **surface plane** still provides the animated top-down
  water and the specular glint; the mask provides the side-on tint and the
  meniscus. They are complementary, not redundant.

Cost of the mask: one extra `varying vec3 vWorldPos` and ~8 ALU per fragment on
materials that opt in. No new draw calls, no depth pre-pass, no clip state. This
is the cheapest of the three and the only one that gives correct half-submerged
agents for free — the deciding factor on a phone GPU.

Theme entry (`WATER_THEMES`/terrarium `themes` sibling; becomes per-pack
`themes` after the split):

```js
palud: {
  // underwater half (from fresh theme, warmed slightly for a planted look)
  fogColor: 0x123f37, fogDensity: 0.0030,   // fog only fills the lower half visually
  deep: 0x0d332c, tint: 0x2a6e5e,
  sand: 0xb99a6b, sandDark: 0x8a6f4a, surface: 0x9fd8c8,
  // land half (from terra theme)
  soil: 0x4a3520, soilDark: 0x2e2012, bank: 0x5a4a30,
  // shared
  lightColor: 0xfff2dc, lightIntensity: 1500, ambient: 0x3d5240,
  waterY: 24.4, meniscus: 0xdff4ff,
}
```

> **DECIDED (John, 2026-07-09): (a) fixed 40% waterline for MVP.** One constant,
> reads as a shore, and no dependent constant (basking rock height, plant
> placement, spawn zones) has to re-derive live. Adjustable water level (option
> b) is parked as a post-launch delighter (see §9 Deferred).

## 2. Care model mapping (reuse `CareSim` in `src/sim.js`)

`CareSim._decay()` already runs everything; the question is **how many meters a
6-year-old should juggle**. A paludarium plausibly wants BOTH aquarium water
quality (fish, koi, turtles are messy) AND terrarium humidity (frogs, land
crabs). That is a real husbandry fact and a real UX hazard: three-plus decaying
bars is where "calm pet" becomes "chore app."

| Aquarium/terra meter | Paludarium meter | Mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Water quality** | Unchanged from aquarium: bioload + uneaten food drive it down, filtration recovers it, `waterChange()` +0.55. Fish/koi/turtles below `SICK_THRESHOLD` take the existing health-drain path. |
| `tank.algae` (0→1) | **Dirty glass** | Unchanged: the existing wipe gesture (`sim.scrubAlgae`) clears front-pane grime. Grows a touch faster (more light on a planted shore). |
| Terrarium `humidity` | **Humidity — DERIVED, not a chore** (recommended) | Because there is standing water, humidity is *supplied by the pond*. Model it as a **readout driven by water level + a misting top-up**, not an independent decaying bar: `humidity = clamp(0.55 + 0.4*waterFillFrac - dryPenalty)`. Land species have a comfort band (`humidity` field) exactly as terrarium; it only dips below comfort if the kid lets the *water* crash. This folds the second husbandry axis into the water meter they already tend. |

> **DECIDED (John, 2026-07-09): (a) two meters + derived humidity.** Kid tends
> *water quality* and *dirty glass* — the same two muscle-memory meters as the
> aquarium — and humidity is a green/amber readout that only complains when the
> water is neglected. It honors the real biology (a paludarium *is* humid
> because it's half water) and never asks a 6-year-old to keep three decaying
> bars up, staying clear of the "too many chores" cliff.

`applyOffline()` loops the paludarium's tank(s) exactly as it loops
`['fresh','salt']` today — no change; offline decay hits water quality and the
land species inherit the derived-humidity consequence for free.

`rules.js` `evaluateAdd()` runs **unchanged**. `water !== current` becomes the
habitat-match check (`'palud'` blocks fish-only species and vice versa —
though see the crossover DECISION in §6). `bioload` = combined enclosure space.
`predator`/`canEat` already covers the spicy interactions (turtle eats small
fish, archerfish eats bugs, pacman-style frogs) — see §6. `soloOnly` covers a
lone turtle. No new rule code required for MVP.

## 3. Foods (aquatic + terrestrial coexisting)

Food gains a `behavior` strategy (the split already planned this in
`ENGINE_SPLIT.md` §1 for `food.js`: `sink | hop | static | drip`). The
paludarium is the first pack where **both** water foods and land foods are on
the menu at once, and the new wrinkle is **cross-boundary drift**: fish food
dropped over the beach, or a cricket that hops into the water.

| id | name | emoji | behavior | eaten by | when it lands wrong |
|---|---|---|---|---|---|
| `flake` | Flakes | 🍥 | `sink` (existing float→sink) | fish, koi, tadpoles, fry | **On the beach:** doesn't sink — sits as wet debris. Beach foragers (mudskipper, fiddler crab, hermit crab) *can* eat it; otherwise it rots and dings water quality when the tide/rain washes it back (see DECISION). |
| `pellet` | Sinking Pellets | 🟤 | `sink` fast | koi, turtles, bottom fish | On beach: same as flake — forageable or rots. |
| `turtlestick` | Turtle Sticks | 🥢 | `float` then slow sink | turtles, koi, archerfish (from the surface) | Floats at the waterline — the turtle surfaces to grab it. Great "come up for air" beat. |
| `cricket` | Crickets | 🦗 | `hop` (terrarium hop-arc mini-agent) | frogs, toads, mudskipper, crabs, newt | **Hops into the water:** becomes a struggling swimmer at the surface — archerfish/fish snap it, or a frog grabs it. Emergent and true. |
| `worm` | Bloodworms / Mealworms | 🪱 | `sink` in water / `static` on land | almost everyone | Dual-natured: the aquatic worm sinks (existing `frozen`), the land worm wiggles in place. Same id, behavior chosen by where it lands. |
| `veggie` | Greens | 🥬 | `static` | koi, turtles, fiddler crabs, hermit crabs, tadpoles (algae phase) | Sits on land or sinks slowly in water; both halves' herbivores browse it. |
| `fruit` | Fruit | 🍓 | `static` (land) | land hermit crab, fiddler crabs, turtles | A land-food (same row exists in the terrarium pack). Sits on the beach; the land hermit crab's favorite. If it lands in water it slowly sinks and softens — koi/turtles will still nibble it. |

The `FoodSystem.update` per-item strategy keys off `FOODS[type].behavior`, and
each item checks its own `y` vs `uWaterY` each frame to decide land-rules vs
water-rules — the mask uniform is reused as sim data, not just a shader input.
`nearestFor`/`eat`/rot accounting are unchanged from `food.js`.

> **DECIDED (John, 2026-07-09): (a) fish food on the beach is forageable by
> beach critters.** Stranded fish food is eaten by the mudskipper and crabs, so
> nothing is wasted and the shore reads as having its own cleanup crew — with a
> small rot penalty (dinging water quality) if nothing eats it within the
> window, keeping the tone forgiving but not consequence-free.

## 4. Locomotion — amphibious agents (the one new movement system)

Four locomotion names already exist or are trivially reused: `swim` (aquarium),
`crawl`/`climb` (terrarium, verbatim for crabs), `hop` (terrarium),
`serpent` (unused here). The **new** thing is `amphibious`: an agent that owns
two of the above sub-modes and switches between them at the waterline.

### 4.1 The amphibious state machine

An `amphibious` agent declares `waterMode` and `landMode` (each one of the
existing locomotion modules) plus a driver that decides which side of the line
it wants to be on. `Swarm.update` dispatches to the active sub-module exactly as
the locomotion registry (`ENGINE_SPLIT.md` §3) dispatches any mode; the
amphibious wrapper only owns the transition.

```
                 wantsLand (bask / forage / flee-to-shore / random haul-out)
   [WATER: waterMode] ───────────────► [APPROACH_SHORE] ──► [EMERGE] ──► [LAND: landMode]
        ▲                                                                      │
        │                          wantsWater (cool off / hunger in water /    │
        └────────── [SUBMERGE] ◄── [APPROACH_WATER] ◄────── flee-to-water /────┘
                                                            random dive)
```

- **WATER**: runs `waterMode` (`swim`) with the boid/zone code unchanged, but Y
  is clamped to `< WATER_LINE`.
- **wantsLand triggers** (any true → target the nearest shoreline point):
  baskNeed rising (turtle, warmed by day factor), hunger with food only on land,
  a predator in the water, or a random haul-out timer (turtles/mudskippers do
  this for no reason and it's charming).
- **APPROACH_SHORE**: steer toward the nearest terrain point where
  `terrainY ≈ WATER_LINE` (the shoreline set, precomputed from the displaced
  plane). Still swimming.
- **EMERGE** (0.3 s): a short scripted clamber — Y lerps from `WATER_LINE` up
  the bank, body pitches nose-up, gait crossfades swim→land. The world-Y mask
  makes the half-out-of-water look free during this beat.
- **LAND**: runs `landMode` (`crawl` for turtle/crab/mudskipper, `hop` for
  frog/toad/newt) with Y pinned to `terrainY` and the terrarium wall/branch
  surfaces available if the mode is a `climb`er.
- **wantsWater triggers**: baskNeed satisfied, hunger with food only in water,
  a land threat (tap-startle on land), a random dive timer, or (mudskipper)
  drying out — a `wetness` value that falls on land and forces a return.
- **SUBMERGE** (0.25 s): slide down the bank, pitch nose-down, crossfade to
  swim.

Per-species tuning of the same machine:

| Species | waterMode | landMode | Driver character |
|---|---|---|---|
| **Red-eared slider** (turtle) | `swim` (bottom/all zone) | `crawl` (slow, `tortoise`-speed) | Long basks on the shore rock when day factor is high; dives to feed. The archetypal amphibian beat. |
| **Fire-bellied toad** | `swim` (paddling, shallow) | `hop` | Spends "as much time paddling as hopping" (its real fact) — short random cross timers both ways, stays near the shoreline. |
| **Mudskipper** (the mascot) | `swim` (darty, surface) | `crawl` (pectoral-fin "skitter", `crab`-fast) — **a fish that walks out** | `wetness` driver: crawls out to forage/bask, must return before drying; can climb the low glass a little (reuse `climb` glue). |
| **Newt** | `swim` | `crawl` (salamander gait) | Seasonal-ish: biased to water when young/hungry, land when resting. |
| **Frog (tree/pond)** | `swim` (brief) | `hop` (+ branch perch) | Mostly land/branch; dives only when startled or to lay (breeding). |

Crabs (**fiddler**, **land hermit**) are **not** amphibious agents — they are
terrarium `crawl`/`climb` verbatim, living on the beach and bank, dipping a
claw in the shallows for humidity but never swimming. Zero new movement code.
Koi and archerfish are **pure `swim`** (aquarium agents) that never leave the
water — the amphibious system is opt-in per species, not imposed on the pack.

### 4.2 Tadpole → frog metamorphosis (reuses `f.growth`, swaps the BUILDER)

This is the Pond concept and the retention loop made structural. A tadpole is a
plain `swim` agent with `archetype:'tadpole'`. It grows via the **existing**
`f.growth` path in `CareSim._decay` (`SIM.GROW_DAYS`, fed + healthy). The new
hook: at a growth **threshold**, the agent's *builder and locomotion change* —
it does not just scale up.

```js
// in CareSim._decay, alongside the existing growth block:
const META = 0.6;                                  // metamorphosis threshold
if (f.metamorph && (f.growth ?? 1) >= META && !f.metamorphed) {
  f.metamorphed = true;
  f.sp = f.metamorph;                              // 'tadpole_frog' -> 'fire_bellied_toad'
  this.events.push({ type: 'metamorphose', id: f.id, from: 'tadpole', to: f.sp, name: f.name });
}
```

`main.js` handles the `metamorphose` event the way it handles `death`/`birth`:
dispose the tadpole `Object3D`, build the adult via `buildAgentVisual(newSpec)`,
hand the new visual to the *same* `Agent.instId` but re-init its locomotion from
`swim` to `amphibious` (`hop` landMode). Growth continues from `META`→1 as a
juvenile frog. Stages, all from one growth scalar:

| `f.growth` | Stage | Builder / locomotion | Visual |
|---|---|---|---|
| 0.10–0.35 | Tadpole | `tadpole` swim | Round body, big tail, no legs |
| 0.35–0.60 | Legged tadpole | `tadpole` swim (leg buds) | Back legs sprout (shader/morph, cheap) |
| **0.60** | **Metamorphosis** | swim → amphibious(hop) | Builder swap event; tail resorbs |
| 0.60–1.0 | Juvenile frog | amphibious | Grows to adult size normally |

The intermediate leg-bud visual is a cheap tweak of the tadpole model (a couple
of scaled cylinders faded in by `growth`), not a third builder — only the
0.60 swap is a real builder change. This reuses the exact growth machinery koi
and every fish already use; the only additions are one threshold check and one
event type.

> **DECIDED (John, 2026-07-09): (a) buy tadpoles at MVP, (c) breeding added
> later.** MVP sells tadpoles in the shop that metamorphose into the frog you
> paid for — the transformation itself is the reward and it proves the
> builder-swap. Frog breeding (adult → eggs → tadpoles, extending the livebearer
> egg→larva chain) is layered on afterward for the full Pond experience.

## 5. Hermit-crab shell-swap mechanic (the Crabitat concept)

Land hermit crabs live in borrowed shells and **trade up as they grow**. Shells
are collectible items in the world, tied to `f.growth`, and the kid can drop new
ones in. Concretely:

> **Ownership (canonical):** the land hermit crab is owned by THIS pack under the
> id **`land_hermit_crab`** (§6). TERRARIUM's duplicate `hermit_crab` id is being
> removed — the shell-swap mechanic below is the paludarium's, not the
> terrarium's. Future authors: build the hermit crab here, do not re-duplicate it.

### 5.1 Shells as items

Shells are props managed like food items but persistent (they don't get eaten or
rot). Each shell has a `size` (small/medium/large/jumbo) and an `occupied` flag.

```js
// shell item: { mesh, size: 0..3, occupied: bool, ownerId: instId|null }
```

- A hermit crab spec carries `shellUser: true` and a `shellSize` on its record
  (starts matching its juvenile `growth`).
- The crab's **rendered shell** is one of the `invertbuilder` `crab` group's
  parts (the `sph`/`coil` shell already modeled for snails is reused as the
  hermit's borrowed shell), scaled to `shellSize`.

### 5.2 Trading up (ties into `f.growth`)

The crab grows via the normal `f.growth` path. When its body outgrows its shell
(`growth` crosses the next size band and `shellSize < needed`), it enters a
**house-hunting** state:

```
growth crosses band → needsShell=true → seek nearest EMPTY shell of size >= needed
   found within reach → [SWAP animation ~1s] → old shell drops (occupied=false),
   crab adopts new shell (shellSize=new, needsShell=false)
   none available → crab is "cramped": a gentle nag (crab pauses, tugs at its
      shell) + a HUD hint "Your hermit crab needs a bigger shell!" — husbandry,
      not punishment. No health hit unless left cramped for days.
```

- **Swap animation**: crab backs out of the old shell (body briefly bare and
  vulnerable — a genuine surprise beat, §7), scuttles to the new one, reverses
  in. Reuses the `crawl` orient/scuttle code; the "bare" moment is just the
  shell part hidden for ~1 s.
- **Old shell** stays in the world as an empty collectible — a smaller crab can
  later claim it (the real biology of a shell exchange chain, and the "line up
  biggest-to-smallest" fact becomes an emergent scene if you have several).

### 5.3 Kid drops new shells

A **Shell** tool sits beside the food tools: tapping drops an empty shell of a
chosen size onto the beach (same drop path as food, `behavior:'static'`). This
is the kid's lever to keep crabs housed as they grow — a care action that isn't
a decaying meter, which fits the calm brief.

> **DECIDED (John, 2026-07-09): shells are cheap shop items (bought).** The
> Shell tool drops shells the kid buys for a few coins each — a small economy
> sink that fits the coin loop and makes dropping a new shell a deliberate kid
> choice ("your growing pet needs new things"), while never being the scarce
> dead-end (option c) that could strand a crab a 6-year-old can't rescue.

## 6. Species plan

**Target roster: 24–28 species** at full build — smaller than terrarium's 30
because the pack leans on absorbed crossovers and because every amphibious
species costs more than a pure swimmer. Composition: ~8 fully aquatic (koi,
archerfish, danios, rainbowfish, guppies as pond fish, a loach), ~6 amphibious
(turtle, 3–4 frogs/toads, newt, mudskipper), ~6 beach inverts (fiddler crab,
land hermit crab, red-claw crab, vampire crab, nerite, thai micro-crab), ~4
land herps/plants-dwellers reused from terrarium (a tree frog, a small skink).
Many are **crossovers** — a pond koi is a legit aquarium fish, a fire-bellied
toad is a legit terrarium herp — so authoring cost is partly amortized.

Below: **8 flagship species** in the exact `freshwater.js` schema, with
paludarium deltas applied consistently:

- `water: 'palud'`.
- `zone`: `'aquatic' | 'beach' | 'land' | 'arboreal'` (where it lives; maps to
  spawn side and Y-clamp).
- `locomotion`: `'swim' | 'amphibious' | 'crawl' | 'climb' | 'hop'` (canonical
  registry names, `ENGINE_SPLIT.md`).
- `landMode`/`waterMode`: present only when `locomotion:'amphibious'`.
- `humidity`: comfort center (drives the derived-humidity readout, §2).
- `basker` is a **tag** (`tags:['basker']`), not a boolean field — the
  TERRARIUM precedent; the turtle carries it in its `tags` array.
- New optional flags: `shellUser`, `metamorph` (id of the adult a larva
  becomes), `spitter` (archerfish).
- Everything else — identical fields, identical types, true-to-life `colors`,
  exactly 3 kid-true `facts`.

**Cross-spec ownership (canonical).** This pack **OWNS** two ids that must not
be duplicated elsewhere: **`fire_bellied_toad`** (`water:'palud'`, amphibious —
TERRARIUM is being edited to swap its copy for a fully terrestrial frog), and
the land hermit crab **`land_hermit_crab`** (TERRARIUM's duplicate
`hermit_crab` is being removed). Future authors: do not re-add either to another
pack.

```js
export const PALUDARIUM_SPECIES = [
  {
    id: 'mudskipper', common: 'Atlantic Mudskipper', scientific: 'Periophthalmus barbarus',
    water: 'palud', kind: 'fish', adultSizeCm: 16, bioload: 3, minSchool: 2,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: ['jumper'], zone: 'beach', locomotion: 'amphibious', waterMode: 'swim', landMode: 'crawl',
    humidity: 0.8, speed: 0.9, schooling: 'loose', diet: ['cricket', 'worm', 'flake'], price: 40,
    archetype: 'goby', size: 1.0, shape: { height: 0.9, finFlow: 1.1 },
    colors: { base: '#6b5a3a', belly: '#c8bfa0', fin: '#3a6ea8',
      pattern: 'spots', patternColor: '#4a90c8', patternScale: 1.1, iridescence: 0.35 },
    habitat: 'Muddy mangrove shores and tidal flats of West Africa.',
    facts: [
      'It is a fish that walks on land, pulling itself along on its strong front fins.',
      'It breathes through its wet skin and mouth, so it can leave the water for hours.',
      'It carries a mouthful of water like a scuba tank to keep its gills wet on land.'
    ],
    care: 'Medium'
  },
  {
    id: 'fiddler_crab', common: 'Fiddler Crab', scientific: 'Uca pugnax',
    water: 'palud', kind: 'invert', adultSizeCm: 4, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'beach', locomotion: 'crawl', humidity: 0.8,
    speed: 0.4, schooling: 'loose', diet: ['veggie', 'flake', 'worm'], price: 15,
    archetype: 'crab', size: 0.55, edible: false, cleans: true,
    colors: { base: '#6a4a30', belly: '#8a6a48', fin: '#e0b040',
      pattern: 'none', patternColor: '#e0b040', patternScale: 1.0, iridescence: 0.15 },
    habitat: 'Salt-marsh and mangrove mudflats along the Atlantic coast of the Americas.',
    facts: [
      'The male has one giant claw he waves like a fiddle to say hello and show off.',
      'It rolls the mud into little balls, eating the tiny bits and leaving the rest behind.',
      'A whole beach of fiddler crabs will duck into their burrows at the same moment if a shadow passes.'
    ],
    care: 'Easy'
  },
  {
    id: 'red_eared_slider', common: 'Red-Eared Slider', scientific: 'Trachemys scripta elegans',
    water: 'palud', kind: 'herp', adultSizeCm: 25, bioload: 12, minSchool: 1,
    temperament: 'semi', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly', 'basker'], zone: 'aquatic', locomotion: 'amphibious', waterMode: 'swim', landMode: 'crawl',
    humidity: 0.7, speed: 0.6, schooling: 'solo', diet: ['turtlestick', 'pellet', 'veggie', 'worm'], price: 85,
    archetype: 'turtle', size: 1.3,
    colors: { base: '#3a6a34', belly: '#d8c84a', fin: '#5a8a3a',
      pattern: 'stripesV', patternColor: '#d8b020', patternScale: 1.2, iridescence: 0.05 },
    habitat: 'Slow rivers, ponds, and marshes across the southern United States.',
    facts: [
      'The red stripe behind each eye is how it got its name — no other pond turtle has it.',
      'It basks in the sun for hours to warm up and keep its shell healthy, then slips back to swim.',
      'A slider can pull its head and all four legs inside its shell like a suitcase snapping shut.'
    ],
    care: 'Medium'
  },
  {
    // OWNED BY THIS PACK (canonical): fire_bellied_toad lives here as an
    // amphibious palud species; TERRARIUM's copy is being swapped for a fully
    // terrestrial frog. Do not re-duplicate this id in another pack.
    id: 'fire_bellied_toad', common: 'Oriental Fire-Bellied Toad', scientific: 'Bombina orientalis',
    water: 'palud', kind: 'herp', adultSizeCm: 5, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'beach', locomotion: 'amphibious', waterMode: 'swim', landMode: 'hop',
    humidity: 0.85, speed: 0.8, schooling: 'loose', diet: ['cricket', 'worm'], price: 25,
    archetype: 'frog', size: 0.6, metamorph: null,
    colors: { base: '#4a9838', belly: '#e83818', fin: '#2a6820',
      pattern: 'spots', patternColor: '#1a3010', patternScale: 1.3, iridescence: 0.1 },
    habitat: 'Ponds and slow streams of Korea, northeastern China, and eastern Russia.',
    facts: [
      'When scared it arches its back to flash its fire-orange belly: "warning — I taste bad!"',
      'It spends as much time paddling in the shallow water as hopping on land.',
      'Its call is not a croak but a soft, musical "boop... boop" like a tiny bell.'
    ],
    care: 'Easy'
  },
  {
    // Larva of the toad above — bought/bred as a tadpole, metamorphoses at growth 0.6
    id: 'tadpole_fbt', common: 'Fire-Bellied Tadpole', scientific: 'Bombina orientalis (larva)',
    water: 'palud', kind: 'fish', adultSizeCm: 3, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'aquatic', locomotion: 'swim', humidity: 1.0,
    speed: 0.7, schooling: 'loose', diet: ['flake', 'veggie'], price: 8,
    archetype: 'tadpole', size: 0.4, metamorph: 'fire_bellied_toad',
    colors: { base: '#2a2a20', belly: '#4a4a38', fin: '#3a3a2a',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'The shallow, plant-filled edges of ponds where the eggs were laid.',
    facts: [
      'A tadpole is a baby toad with a tail and no legs — it swims like a little fish.',
      'It slowly grows back legs, then front legs, and its tail shrinks away.',
      'As it changes it stops eating plants and gets ready to eat bugs on land.'
    ],
    care: 'Easy'
  },
  {
    id: 'koi', common: 'Koi', scientific: 'Cyprinus rubrofuscus',
    water: 'palud', kind: 'fish', adultSizeCm: 60, bioload: 16, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['coldwater'], zone: 'aquatic', locomotion: 'swim', humidity: 1.0,
    speed: 0.7, schooling: 'loose', diet: ['pellet', 'turtlestick', 'veggie', 'flake'], price: 70,
    archetype: 'torpedo', size: 1.6, shape: { height: 1.15, finFlow: 1.0 },
    colors: { base: '#f4f0e8', belly: '#f8f4ee', fin: '#e86a2a',
      pattern: 'patches', patternColor: '#e83820', patternScale: 1.5, iridescence: 0.3 },
    habitat: 'Ornamental garden ponds worldwide, bred from wild carp of East Asia.',
    facts: [
      'Some koi have lived over 200 years — they can be handed down for generations.',
      'They learn to recognize the person who feeds them and will eat from your hand.',
      'Each koi\'s red, white, and black pattern is unique, like a painting no one can copy.'
    ],
    care: 'Medium'
  },
  {
    // OWNED BY THIS PACK (canonical): land_hermit_crab is the single canonical
    // land hermit crab id. TERRARIUM's duplicate `hermit_crab` is being removed.
    id: 'land_hermit_crab', common: 'Caribbean Land Hermit Crab', scientific: 'Coenobita clypeatus',
    water: 'palud', kind: 'invert', adultSizeCm: 8, bioload: 2, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'beach', locomotion: 'climb', humidity: 0.8,
    speed: 0.6, schooling: 'loose', diet: ['fruit', 'veggie', 'flake'], price: 20,
    archetype: 'crab', size: 0.9, edible: false, cleans: true, shellUser: true,
    colors: { base: '#b06a3a', belly: '#c88850', fin: '#c8b090',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Beaches and coastal forests of the Caribbean islands.',
    facts: [
      'It wears an empty seashell as its house and moves to a bigger one as it grows.',
      'Hermit crabs sometimes line up biggest-to-smallest so everyone can trade shells at once!',
      'Even living on land, it carries a little water in its shell to keep its gills damp.'
    ],
    care: 'Easy'
  },
  {
    id: 'archerfish', common: 'Banded Archerfish', scientific: 'Toxotes jaculatrix',
    water: 'palud', kind: 'fish', adultSizeCm: 20, bioload: 6, minSchool: 3,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'aquatic', locomotion: 'swim', humidity: 1.0,
    speed: 1.0, schooling: 'loose', diet: ['cricket', 'flake', 'worm'], price: 55,
    archetype: 'tang', size: 1.1, spitter: true,
    colors: { base: '#eef0e8', belly: '#f6f8f0', fin: '#d8dcc8',
      pattern: 'stripesV', patternColor: '#20242a', patternScale: 1.0, iridescence: 0.25 },
    habitat: 'Mangrove estuaries and brackish shores from India to northern Australia.',
    facts: [
      'It shoots a jet of water from its mouth to knock bugs off leaves above the water.',
      'It aims so well it hits targets over a foot away, bending its shot for the way light tricks the eye.',
      'When a knocked-down bug hits the water, the whole group races to grab the snack.'
    ],
    care: 'Medium'
  },
];
```

### 6.1 The archerfish spit (signature moment)

Cheap version: when a `cricket` (hop food) lands on a branch/leaf **above**
`uWaterY` and an archerfish is within range and hungry, the fish rises to just
below the surface, aims, and emits a **water-jet particle** (reuse the mist/
bubble `Points` system, one short upward streak). On hit, the cricket is
knocked off its perch, falls to the water, becomes a surface-swimmer food item,
and the school races in (existing `nearestFor` congregation). No new physics —
a raycast from fish to food, a particle streak, and a "detach food → drop it"
state change.

> **DECIDED (John, 2026-07-09): (a) full signature moment.** The archerfish
> aims, fires a jet particle, knocks the bug down, and the school races in — it
> is *the* wow of this pack and it's cheap (a raycast plus reused bubble
> particles). It lands as its own milestone after the amphibious core is solid
> (see §9 Deferred).

> **DECIDED (John, 2026-07-09): (a) the axolotl stays in the aquarium.** It
> remains the `water:'fresh'` aquarium resident and serves as the crossover
> tease pointing toward the paludarium — no re-home, no new work, and the
> terrarium/aquarium shop tease keeps pointing where it already does.

> **DECIDED (John, 2026-07-09): turtle predation is governed by the game-wide
> Nature-scenes parent toggle.** Real red-eared sliders eat small fish and fry
> (`predator:true` + `canEat` 0.42 ratio), so a slider will hunt guppies,
> tadpoles, and small crabs on screen. There is no per-habitat flag: the single
> game-wide Nature-scenes parent setting (ROADMAP 2026-07-09) governs it —
> default shown, matter-of-fact, no gore; alternative resolves it off-screen.
> `rules.js` still warns at purchase and the real diet stays honest in the
> facts. This supersedes the earlier per-habitat predation flag.

## 7. The four retention mechanics, made concrete

Per HABITAT_VISION every habitat ships all four. Paludarium's advantage is that
**two of them are literally metamorphosis and shell-swapping — growth made
visible** in a way no fish tank can match.

1. **Care debt** — offline decay via `CareSim.applyOffline`, unchanged. One
   tank, water quality + dirty glass (§2), capped at `SIM.OFFLINE_CAP_HOURS`. A
   neglected pond drops water quality, which (via the derived-humidity model)
   also stresses the land species — one lapse hurts both halves, which reads as
   a real, connected ecosystem.
2. **Growth & babies** — three visible growth stories from one `f.growth`
   scalar: (i) **tadpole → frog metamorphosis** (§4.2) — the loudest "my pet
   *changed*" moment in the whole game; (ii) **hermit-crab shell-swaps** (§5) —
   growth you can *see* because the pet visibly moves house; (iii) **koi growth**
   — a bought juvenile koi grows toward its huge adult size over `GROW_DAYS`,
   and a healthy koi pair can spawn fry (livebearer-style breeding path reused).
3. **Collection book** — every paludarium species owned unlocks its card
   (facts, habitat, record size), exactly the existing `discovered` set. Both
   the larva and adult forms (tadpole *and* frog) can be separate cards, so
   raising one through metamorphosis fills two entries — a built-in reason to
   see it through.
4. **Surprises** — unscripted small moments to catch: a turtle hauled out and
   basking that wasn't there this morning; a mudskipper crawled fully onto the
   beach at low activity; the archerfish spit landing a bug; a hermit crab
   caught **out of its shell** mid-swap (rare, vulnerable, memorable); a
   shed/molt left on the beach; the whole fiddler-crab group ducking burrows at
   once when the kid taps the glass.

## 8. Performance budget — S24-class, 60 fps, honest about two halves

This is the pack that renders an aquarium **and** a terrarium in one frame, so
the budget is real and the mitigations matter. Baseline: the live game holds 60
fps with a full house of animals + full aquarium FX on an S24, where
`CAPACITY.maxFish = 42` (src/constants.js:25) is the **total animal cap — fish
*and* inverts combined**, not 42 fish plus extra inverts. Paludarium must fit
the *same* budget, not double it.

| Cost center | Aquarium today | Paludarium | Mitigation |
|---|---|---|---|
| Water surface plane | full footprint | **~60% area** (clipped at the beach, waterline at 40% H) | Smaller mesh, fewer verts; net cheaper than aquarium. |
| Caustics quad | full | **underwater only (~60%)** | Additive screen pass, scaled down. Cheaper. |
| Sun shafts | 5 planes | 5 planes, shorter | ~same. |
| Bubbles / motes | 42 + 220 pts | ~30 + ~160 pts split land/water | Fewer points; the land half doesn't need marine snow. |
| Soil/bank terrain | — (new) | **+1 displaced plane, +leaf litter sprites** | One extra draw call; static, no per-frame cost. |
| Plants/branches decor | reused | aquatic + terrestrial set | Same primitives; keep instance count modest. |
| **World-Y shader mask** | — (new) | **+1 varying, ~8 ALU/fragment** on opted-in materials | The chosen waterline tech (§1.1): single pass, **zero extra draw calls**. This is the whole reason clip planes / a water volume were rejected. |
| Agents | up to 42 | **cap 14–16** | The real lever. Amphibious agents cost more (state machine + two gaits), so the pack caps `maxAgents` well below the aquarium. A paludarium is a *few* charismatic animals (a turtle, a koi pair, some frogs, a crab colony), not a 42-fish shoal — which is also biologically right. |
| Amphibious transition | — | EMERGE/SUBMERGE lerps, a few frames each, rare | Only crossing agents pay it, only during the ~0.3 s crossing. Negligible amortized. |
| Archerfish spit | — | raycast + short particle burst, event-driven | Reuses the bubble `Points`; fires seldom. Cheap. |

**Frame budget verdict:** the two-halves fear is mostly answered by geometry —
the waterline at 40% means neither half is full-size, the water FX shrink to
~60%, and the new terrain is a static plane. The mask adds ALU, not draw calls.
The one place we must be disciplined is **agent count**: cap the pack at ~14–16
active agents (vs 42), which the content design wants anyway. Net: paludarium
targets the *same* frame budget as the live aquarium, not a doubled one. If
profiling on the S24 shows the mask ALU is hot on low-end GPUs, the fallback is
a `#define` that drops the caustic-shimmer term (keeps tint + meniscus) — a
one-line quality tier.

## 9. MVP cut — 8 species, minimum systems

The smallest build that proves the merge: one waterline, one amphibious crosser,
one metamorphosis, one shell-swap, both feeding halves.

| Species | Role | Locomotion | Why in MVP |
|---|---|---|---|
| Koi (×1–2) | pond centerpiece | swim (aquarium reuse) | Proves the underwater half is just the aquarium; growth story; zero new code. |
| Danio or guppy (pond fish) | shoal / life in the water | swim | Cheap water motion, feeding-rush reuse. |
| Mudskipper | **the mascot** | amphibious (swim↔crawl) | Proves the amphibious state machine and the half-submerged mask in one animal. |
| Fire-bellied toad | amphibian | amphibious (swim↔hop) | Proves `hop` reuse across the waterline; forgiving care. |
| Fire-bellied tadpole | the transformation | swim → amphibious | **Proves the metamorphosis builder-swap** — the pack's headline retention beat. |
| Land hermit crab | beach life | climb (terrarium reuse) + shellUser | **Proves the shell-swap system**; zero new movement code. |
| Fiddler crab | beach crowd | crawl (terrarium reuse) | Cheap charm; the group-duck surprise. |
| Red-eared slider | the big amphibian | amphibious (swim↔crawl) + basker | The archetypal "swims then hauls out to bask" moment; sells the whole concept. |

**Systems in MVP:** paludarium environment builder (split terrain + waterline
shader mask + reused water FX), water-quality + dirty-glass meters with derived
humidity (DECISION §2 option a), the `amphibious` locomotion module with
swim/crawl/hop sub-modes, food behaviors `sink`/`hop`/`float`/`static` with
cross-boundary handling (DECISION §3 option a), the metamorphosis threshold hook
(§4.2), the shell-swap item system + Shell drop tool (§5), and turtle predation
with the parent toggle (DECISION §6 option a+b).

**Deferred:** archerfish spit (§6.1 — its own milestone once the amphibious core
is solid), koi/frog breeding (buy-only tadpoles in MVP, DECISION §4.2 option a),
adjustable water level (DECISION §1 option b), newt and the wider crab/fish
roster (author against `SPECIES_SPEC.md` when the build starts), the axolotl
re-home decision (§6), and branch-perch archerfish targets beyond a single leaf.
```