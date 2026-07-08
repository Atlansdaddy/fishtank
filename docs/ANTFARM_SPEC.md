# Ant Farm — Habitat Pack Spec

The big swing. Not a "tank with agents in it" like aquarium/terrarium — the
habitat itself is the pet. The colony digs, grows, and remembers. Everything
below is sized for John's phone baseline (S24-class and below, 60 fps target,
same budget the 42-fish aquarium hits today).

---

## 1. Scene layout

Side-view formicarium: a thin glass sandwich, like the classic toy. Reuses the
`tank.js` glass-frame pattern (`addFrame`) but with `TANK`-style dims of
`W:122, H:61, D:8` — a 2D-ish world with just enough depth for parallax.

```
+--------------------------------------------------+
|  SURFACE STRIP (open air, 10cm): foraging,       |   <- food drops land here
|  food drops, grass tufts, entrance holes         |
|==================================================|   <- soil line
|                                                  |
|   SOIL CROSS-SECTION (dug tunnels + chambers)    |   <- the dig grid
|                                                  |
+--------------------------------------------------+
```

Camera: the existing orbit controller in `main.js` clamped to a narrow arc
(`cam.az` ∈ ±0.35, `cam.el` ∈ ±0.15) so it always reads as a cross-section but
still feels 3D. Pinch-zoom unchanged; tap-to-follow works on individual ants
(same raycast path as `tapSelect`).

## 2. The dig model (core tech decision)

### 2.1 Grid

One 2D cell grid, authoritative for sim AND rendering:

```js
// soil.js
export const GRID = { COLS: 192, ROWS: 96, CELL: 0.635 };  // 122cm x ~61cm world
// cell states (Uint8Array, COLS*ROWS):
const SOLID = 0, DUG = 1, ENTRANCE = 2, FOOD_STORE = 3, NURSERY = 4, MIDDEN = 5;
```

~18k cells, one `Uint8Array` — trivial memory, and it serializes straight into
the `CareSim` save (`localStorage` budget: 18KB raw, ~3KB after RLE; run-length
encode rows before `JSON.stringify`).

### 2.2 Rendering: CanvasTexture vs instanced voxels

| | A. CanvasTexture painted per dig | B. InstancedMesh soil voxels |
|---|---|---|
| Draw calls | 1 quad | 1 instanced call, but 18k instances live |
| Dig update cost | repaint ~1 cell rect, `needsUpdate` once | set instance matrix/visibility, partial buffer upload |
| Visual quality | excellent: soft edges, strata gradients, moisture darkening are just 2D painting | blocky unless heavily shaded; voxel look fights "photorealistic" brand |
| Depth/parallax | fake (normal-ish shading painted in) | real 3D walls |
| Phone GPU | trivial (one 1024×512 texture) | fine but heavier vertex load; instance buffer of 18k on low-end is wasteful for mostly-static soil |
| Offline catch-up | repaint whole canvas once at load — cheap | rebuild instance buffer — also fine |

**Pick: A — CanvasTexture.** One `1024×512` offscreen canvas mapped onto a
front-facing quad at `z = +D/2 - 0.5`. At init, paint soil: strata bands
(3–4 horizontal color bands, `#4a3520` → `#2e2012` like the terrarium theme),
speckle noise, embedded pebbles. On each dig event, paint that cell: dark
tunnel fill `#1a120a`, 1px lighter rim on the top edge (fake light), occasional
root/pebble reveal. `texture.needsUpdate = true` only on frames with dig
events (a few per second at peak — nothing).

Depth trick: a second quad 6cm behind with the same canvas at 35% brightness
= back wall of tunnels. Two draw calls total for the entire diggable world.
Ants walk in the 6cm gap between them.

### 2.3 Dig rules (tunnel growth that looks ant-made)

Ants don't dig randomly; tunnels look like tunnels because of simple biases.
A worker in `dig` state picks the next cell to excavate from candidates
adjacent to existing DUG cells, scored:

```
score = 2.0*continueStraight      // momentum: extend the corridor you're in
      + 1.4*downBias * depth01    // shafts tend downward, more so when shallow
      + 1.8*chamberField          // near a queued "chamber" blueprint: widen
      - 2.5*nearOtherTunnel       // don't merge corridors (keeps net-like look)
      - bigNegative if cell would breach the glass margin (2-cell border stays SOLID)
```

Chambers: colony-level planner (not per-ant) queues blueprints — "nursery
3×2 cells at depth 20–30", "food store near entrance", "midden far corner" —
when population crosses thresholds (below). Workers assigned to a blueprint
dig cells inside its rect until done. This gives readable rooms, which is the
whole fantasy.

Excavated soil is real: digging increments a carry task; the worker paths to
the surface and drops a spoil grain, growing a visible dirt cone by an
entrance (painted onto the same canvas, above the soil line).

### 2.4 Pathfinding in the grid

Tunnels are 1D-ish corridors — no A* needed at ant count. Maintain a
flow-field BFS from key targets (entrance, nursery, food store, midden),
recomputed only when the grid changes (dig events), amortized 1 target/frame.
An ant walking "to the nursery" just descends the nursery distance field.
4 fields × Uint16Array(18k) = cheap.

## 3. Colony lifecycle

Extends `CareSim` records — the colony is one "tank" whose `fish[]` array
holds broods and the queen; individual workers are NOT care records (see
performance, §7).

| Stage | Duration (game) | Notes |
|---|---|---|
| Queen (bought/founding) | permanent | The one named pet (`ui.showFishCard` card, renameable via existing `onRename`). Health = colony health. **DECIDED (John, 2026-07-08): real stakes.** Sustained severe neglect can kill her; colony winds down over days, memorial card archives to the collection book, fresh founding starts a new colony. Big escalating warnings before it ever happens (queen-weak toasts, HUD pill goes red — the kid must never be surprised). |
| Eggs | 8 h | laid in nursery chamber, batch size scales with colony food stores |
| Larvae | 24 h | must be fed: nurse ants carry food from store to nursery — visible chains |
| Pupae | 24 h | inert, cocoon sprites |
| Worker | lives 5 days | the population engine |
| Soldier | lives 7 days | spawned 1 per 8 workers after pop ≥ 30; bigger head, guards entrances, front line vs. surprise events |
| Nurse | role, not caste | youngest 30% of workers stay underground tending brood |
| Forager | role | oldest workers go topside — true to real age-polyethism, and a free fact for the collection book |

Timings use the existing dual-clock pattern from `sim.js`
(`GAME_HOURS_PER_REAL_MIN` foreground, real hours offline) so a kid sees eggs
progress during a session, and a school day means real colony growth.

Population milestones (retention beats, each fires a `sim.events` push like
`'grown'` does today): 10 = first soldier soon; 25 = second entrance;
50 = new nursery blueprint; 100 = "your colony is a city" + leafcutter unlock
teaser.

## 4. Ant AI

Two tiers (see §7 budget): **hero ants** (individually simulated + rendered,
the ones you can tap) and **crowd ants** (statistical, rendered as flow
particles along tunnel corridors).

Hero ant state machine (replaces `Swarm` steering — ants are grid creatures,
but plugs into the same `swarm.update(dt, t)` slot and reuses `startleNear`):

`idle → dig | carrySpoil | forage | carryFood | nurse | guard | drink`

- **Dig / carrySpoil**: §2.3. Carry = walk the entrance flow field with a
  spoil grain sprite on the mandibles.
- **Forage** (surface strip): the pheromone sim, below.
- **CarryFood**: food item overhead, descend food-store field. Big items
  (whole "leaf"/"seed") need 2–3 ants — chain forms when two foragers grab the
  same item; movement speed halves, wobbles. Pure spectacle, kids love it.
- **Nurse**: shuttle food-store → nursery; touch a larva, it fattens (sprite
  scale up).
- **Guard**: soldiers loiter at ENTRANCE cells, antennae sweep.
- **Drink**: when moisture low, ants cluster at the water-drop zone (§5).

### Pheromone trail sim (surface foraging)

A decaying scalar field over the **surface strip only** — keeps it tiny:

```js
// pheromone.js — surface strip: 192 x 12 cells above the soil line
field = Float32Array(192*12);
// per sim tick (10 Hz, not per frame):
field[i] *= Math.exp(-dt / TAU);          // TAU = 90s decay
// forager returning WITH food deposits +1.0 along its path
// outbound foragers steer by weighted sample of 3 forward cells:
//   p(left/straight/right) ∝ (0.1 + field[cell])^2, plus small random jitter
```

Emergent result with zero extra code: first finder wanders randomly, returners
lay trail, trail reinforces while food lasts, evaporates after — kids watch a
living bridge of ants form to a cookie crumb and dissolve when it's gone. Render
the field as a faint additive glow texture (same CanvasTexture trick, 192×12,
toggleable "ant vision" button — great educational moment).

## 5. Care loop (maps onto `CareSim` meters)

| Aquarium meter | Ant farm meter | Player action |
|---|---|---|
| `water` quality | **Moisture** | tap-hold to drip water on a soil spot (darkens canvas cells, radius ~6). Decays like `WATER_DECAY_DAYS` ≈ 3. Too dry: digging stops, larvae stall. Too wet (over-watering!): a tunnel section collapses — cells repaint to SOLID, ants re-dig. Real consequence, recoverable. |
| `algae` | **Midden overflow** | ants pile waste + dead ants in the midden chamber; if not managed (tap to "clean window" — same wipe gesture as `scrubAlgae`) mold speckles paint outward from midden and moisture drains faster. |
| hunger/health per fish | **Colony food store + queen health** | store level = sum of food in FOOD_STORE cells; queen/brood draw from it hourly. `summary()` maps: `hungriest` = store emptiness, `avgHealth` = queen health. HUD pills work unchanged. |
| foods (`FOODS`) | seed 🌰, cookie crumb 🍪, honey drop 🍯, leaf 🍃 (leafcutter only) | dropped on the surface strip at tap x — reuses `FoodSystem.drop` signature. Honey = liquid: foragers drink and share (trophallaxis — fact card gold), no carry chain. |
| — | **Colony mood** | derived, not stored: f(store, moisture, midden, recent startles). Drives ant walk speed and the ambient sound bed (audio.js: dry-grass rustle density). |

**Escape events (surprise mechanic):** if mood is low OR lid left "open" after
a feeding for >2 min, scouts probe the top frame; a few ants walk onto the
OUTSIDE of the glass (render on a quad in front of everything — genuinely
startling in the good way). Tap each escapee to return it. Never punitive
(no deaths), always a story: "3 ants tried to escape while you were at school."

## 6. Species (habitat variants, not just skins)

| Species | Sci name | Twist | Status |
|---|---|---|---|
| Harvester ant | Pogonomyrmex barbatus | baseline: seeds, granary chambers | **MVP** |
| Carpenter ant | Camponotus pennsylvanicus | digs in a half-buried log (different canvas art + dig scoring: follows wood grain horizontally); bigger, fewer, night-active (`nightFactor` reuse) | v2 |
| Leafcutter ant | Atta cephalotes | the crown jewel: foragers cut leaf props topside, carry chains feed a **fungus garden chamber** that visibly grows (painted blob-field) — colony eats fungus, not leaves; add tiny-workers-riding-leaves detail | v2/v3 |
| Fire ant colony | Solenopsis invicta | raft-building vs. overwatering events | maybe |

One colony per save initially (the ant farm IS the tank); species chosen at
founding, new queen = new colony (old one archives to the collection book).

## 7. Performance budget (phone, 60fps, alongside DOM UI)

| System | Budget | Approach |
|---|---|---|
| Hero ants | **48 simulated + individually rendered** | one InstancedMesh (body) + one (head/abdomen bob via instance attribute), 2 draw calls; state machine at 10 Hz ticks, movement lerped per frame. No shadows. |
| Crowd ants | up to ~400 visual | NOT simulated: particles advected along corridor flow fields with noise; a Points/InstancedMesh of flat sprites, 1 draw call. Density per corridor = statistical population of that branch. |
| Soil | 2 quads + 1 canvas repaint per dig event | §2.2 |
| Pheromone | 2304 floats @ 10 Hz + 1 small glow texture | §4 |
| Flow fields | BFS on 18k cells, only on dig, amortized | §2.4 |
| LOD | zoomed out: heroes freeze their state machine visuals to simple loops, crowd density becomes the show. Zoomed in (follow-cam on a hero): its neighbors within 15cm get full antenna/leg animation, `swarm`-style. | tap-to-follow reuses `cam.follow` |

Offline growth ("what did they dig while you slept") — the marquee retention
feature: on `applyOffline()`, run the colony planner in coarse ticks (1 tick =
30 offline min, capped by `OFFLINE_CAP_HOURS` = 96 → ≤192 ticks). Each tick:
consume food, advance brood, execute N dig-cell choices with the same scoring
RNG. Then repaint the canvas once and diff: new cells dug, chambers finished,
population change → a **reveal card** on open ("While you were away: 2 new
tunnels, the nursery is finished, 14 ants hatched") with the camera slowly
panning the new digging before control unlocks. Deterministic-enough, and at
≤192 ticks × ~40 dig choices it's a few ms of JS on load.

## 8. MVP cut

**In:** harvester colony; queen + egg/larva/pupa/worker (no soldiers); dig
grid + CanvasTexture rendering + spoil cones; 2 chamber blueprints (nursery,
food store); pheromone foraging on the surface; foods seed + crumb + honey;
moisture drip + overwater collapse; midden as visual only (no mold);
48 hero ants, no crowd layer; offline dig + reveal card; queen card in the
existing `ui.js` fish-card UI.

**Out (v2):** soldiers, carpenter/leafcutter, escape events, crowd-ant layer,
mold/midden management, carry chains >1 ant, "ant vision" pheromone view,
multi-colony.

Build order: soil grid + canvas painter → dig scoring with a fake auto-digger
(no ants) → flow fields → hero ants walking → forage/pheromone → brood cycle →
care meters → offline ticks → reveal card. Each step is demoable to the
6-year-old, which is the real QA department.
