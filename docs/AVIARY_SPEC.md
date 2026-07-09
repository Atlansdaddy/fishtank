# Aviary — Habitat Pack Spec

The big one. Habitat #9, `habitat/aviary`, the most-begged-for pack and the
largest build in the roadmap. It ships **only after Butterfly Garden** (#8) has
proven the cheap version of the flight tech — flutter flight is the training
wheels; the aviary is full 3D powered flight with gravity, stalls, and the hard
problem no earlier pack has: **landing**.

Everything here maps to an existing module the way TERRARIUM_SPEC maps to
`tank.js`. The genuinely new code is: one locomotion mode (`flight`, built as
the promotion of swim boids), a hover sub-mode (`hover`), the birdsong voice
bank on the existing synth, a folding-wing geometry rig on the fishbuilder
lofted-body tech, and one environment builder. Flocking, predator/prey,
day/night, care decay, rules, and coins are reused verbatim.

> **Prerequisite (do not start before):** Butterfly Garden's `flutter`
> locomotion and its metamorphosis-over-real-days loop must be merged and
> aquarium-regression-green. The aviary's flight state machine is a strict
> superset of `flutter` + gravity; if `flutter` isn't in the engine, this spec
> is building on sand.

---

## 1. Enclosure rendering (reuse `src/tank.js` pattern)

`buildAviary(scene, renderer)` returns the same handle shape as `buildTank()`:
`{ group, setTheme(type), setDay(df), update(t) }` so `main.js` swaps it in
without touching the frame loop. Unlike every prior habitat, the aviary
**changes the box dimensions** — a flight cage is tall and deep, not a
48"-wide show-tank footprint.

### Enclosure dimensions

The aquarium `TANK` is 122 × 61 × 61 cm (a wide, shallow show tank). Birds need
vertical air and depth to cross. Propose a new pack-level `ENCLOSURE` constant
(the engine already treats `TANK`/`BOUNDS` as a generic box per ENGINE_SPLIT
§1 — the aviary provides its own):

```js
export const AVIARY = {
  W: 220,   // width  (x) — room to fly a lap
  H: 240,   // height (y) — the headline: a walk-in flight, ~8 ft tall
  D: 170,   // depth  (z) — real crossing distance, not a fishbowl
  MESH_T: 1.0,
  FLOOR_H: 6,          // sand/paper substrate depth
  PERCH_ZONE: 0.62,    // perches live in the upper 62% of height
};
export const AVIARY_BOUNDS = {
  minX: -AVIARY.W/2 + 8, maxX: AVIARY.W/2 - 8,
  minY: AVIARY.FLOOR_H + 3, maxY: AVIARY.H - 8,
  minZ: -AVIARY.D/2 + 8, maxZ: AVIARY.D/2 - 8,
};
```

**Justification against the camera/orbit system** (`main.js` §400–458, §661–675):
the camera controller is dimension-agnostic — `resize()` computes `cam.fitR`
from `TANK.H*0.62` and `TANK.W*0.60` divided by the FOV half-angles, and
`cam.target`/`cam.look` sit at `TANK.H*0.5`. Feeding it `AVIARY.H = 240` just
recomputes a larger frame distance. **One required engine tweak:** the `fitR`
clamp is hardcoded `Math.min(320, …)` — at H=240 the fit distance is ≈300–360
in portrait, so the clamp must rise to `Math.min(420, …)` (or read a
`pack.maxFitR`). That's a one-line change and the guardrail (`fitWholeTank`,
`window.__tank`) still holds. `cam.minR = 13` already lets the kid pinch in to a
budgie's face. Tap-to-follow (`cam.follow`) becomes far more valuable here — a
bird crossing a 220 cm cage is the money shot; following it is the aviary's
signature camera moment, no new code.

> **DECISION FOR JOHN — enclosure style (pick one):**
> - **(a) Walk-in flight aviary (recommended):** tall mesh room, the kid is
>   "inside." Best sells "the parrot you can't have," maximizes the flight
>   showpiece, justifies the H=240 build.
> - **(b) Big parrot cage:** bar-cage look, cozier, smaller (H≈140), cheaper
>   camera story, reads as "a pet in a cage" (slightly less magical, arguably
>   more honest to how a kid would actually keep one bird).
> - **(c) Both as a theme toggle** (like fresh/salt): "Cage" vs "Flight" subtype
>   — reuses the subtype switch, but doubles the environment art.

### Element mapping

| Aquarium element (`tank.js`) | Aviary equivalent | Notes |
|---|---|---|
| Sand bed (`PlaneGeometry` + dune noise) | Cage-floor / paper substrate | Same displaced plane; theme colors `floor`/`floorDark`. Scattered seed-husk + dropping sprites accumulate as the cleanliness meter falls (see §4). |
| Back wall (`BackSide` box) | Mesh-and-sky backdrop | Same dark box, but the inner face is a faint wire-mesh normal map + a soft sky gradient behind it. Reads as "outdoor flight," not a black void. |
| Water surface plane | **None** (aerial) | Skip. Replaced by the **water dish / bath** (below) — a shallow cylinder reusing `surfMat`'s ripple `onBeforeCompile` for the bathing splash. |
| Caustics shader on sand | **Dappled sunlight on floor** | Reuse the caustic quad slot: same additive `ShaderMaterial`, retuned to slow leaf-shadow dapple, warm `vec3(1.0,0.95,0.8)`, intensity follows `day`. |
| `buildShafts()` sun shafts | Keep, warm daylight | Aerial dust shafts through mesh read beautifully; tint `vec3(1.0,0.93,0.78)`. |
| `buildBubbles()` airstone | **Drifting feather-down + dust** | Same `Points` system: idle a few down-feathers drift down and sideways; a **bath shake** or takeoff spawns a burst (event-driven, like terrarium's mist). |
| `buildMotes()` marine snow | Floating dust motes | Keep as-is, warm tint, gentle sideways drift. |
| Glass frame (`addFrame`) | Aviary frame + mesh panels | Same `addFrame` bar logic at `AVIARY` dims; add thin instanced wire-mesh planes on the four sides (alpha-cutout grid texture, one draw call each). |
| Decor (`buildDecor` in `main.js`) | **Perches, nest boxes, feeders, bath** (below) | The whole decor story is new and is the aviary's furniture — specced next. |

### Perches & branches (extends TERRARIUM_SPEC §3 "branch perch")

TERRARIUM_SPEC already specced the branch-perch primitive: a branch exposes
`{ points[], tangents[] }` and a perched agent snaps to the nearest curve point
(a 6th `SURFACES`-like entry with `pin = snap-to-nearest-curve-point`). The
aviary **promotes that from a sometimes-thing to the core resting surface** —
birds spend most of their non-flight life perched, exactly as snakes are
furniture 90% of the time.

| Perch element | Build | Behavior contract |
|---|---|---|
| **Dowel perches** | 2–4 horizontal `CylinderGeometry` rods spanning the cage at varied heights in `PERCH_ZONE` | Each registers as a perch-line (straight `points[]`). Landing targets. Multiple birds space out along it (1-D separation, see §2 landing). |
| **Natural branches** | Bent `TubeGeometry` (terrarium's branch code verbatim) rising into the canopy | Same `{points[], tangents[]}`; birds orient feet-down, body along local tangent. |
| **Rope/ladder toys** | `TubeGeometry` catenary sag between two anchors | Perch-line with a droop; charm decor, budgies love them (true). |

A perched bird's foot-lock reuses the crawler orientation math from
`_animateCrawler` (`makeBasis(forward, normal, right)`): **local +Y = branch-up
(world up), local +X = along-branch tangent**, feet pinned to the curve. This is
the same basis trick plecos use to sit belly-to-glass — proven code.

### Nest boxes

- **Geometry:** a small `BoxGeometry` hut with a round entrance hole (CSG-free:
  a dark disc decal on the front face + an interior cavity the camera can't see
  into). 1–2 per aviary, mounted high on the back wall.
- **Contract:** a nest box is a **named landing target with an `interior`
  point.** A bird carrying nesting drive (see §6) flies to the hole, lands, and
  vanishes inside (scale→0 over 0.3 s, like a burrow frog sinking). This is the
  hook for the eggs/chicks loop — the box is where the babies mechanic lives.

### Water dish / bath — the charm moment

- **Geometry:** shallow wide `CylinderGeometry` on the floor + a thin reflective
  disc reusing `surfMat`'s ripple shader (terrarium already reuses this exact
  material for its water dish).
- **Bathing animation (the moment):** when a bird's bath-drive fires (hot part
  of the day, or after a "spray" tool tap), it lands at the dish rim, hops in,
  and plays a **bath-shake**: rapid wing-flutter + body wobble (reuse the
  pectoral paddle sine from `animateFishVisual` at high frequency) that spawns a
  water-droplet + feather-down `Points` burst and ripples on the disc. 2–4 s,
  then a fluff-and-preen settle. This is the aviary's equivalent of the
  glass-climbing gecko: the screenshot people share. Cheap — all reused systems.

### Seed feeders

- **Geometry:** a hopper cup or seed-cup clipped to the mesh, plus a **feeding
  station** landing target. Millet sprays hang as `TubeGeometry` stalks.
- **Contract:** feeders are the aviary's "front glass" — where hungry birds
  congregate (reuse `begging`/`playerFocus` congregation in `Swarm.update`
  §214, retargeted from the front pane to the nearest feeder). A bird flies to
  the feeder, lands, and pecks (head-bob animation); `food.eat` + `sim.feed`
  fire on contact exactly as fish eating works.

Theme entry (`WATER_THEMES` sibling — becomes per-pack `themes` after the
engine split):

```js
aviary: {
  fogColor: 0xbfd4e6, fogDensity: 0.0006,   // airy, near-clear; almost no fog
  deep: 0x9fb8d0, tint: 0xcfe0ee,           // sky, not deep water
  lightColor: 0xfff4e0, lightIntensity: 1700,
  ambient: 0x8fa4b8,
  floor: 0xd8cdb0, floorDark: 0xa89878,     // paper/sand cage floor
  sky: 0xbcd6ee, mesh: 0x2a2e30,
  bask: 0xfff0d0,                            // warm sun patch for basking birds
}
```

Note the near-zero fog: an aviary is bright open air. The fog-density-vs-camera
coupling in `main.js` §758 (`scene.fog.density = fogBase * clamp(...)`) still
works — it just barely tints, which is correct for air.

---

## 2. Flight locomotion (the promotion of swim boids)

Flight is `swim` + gravity + a landing state machine. The swim steering in
`behavior.js` already produces exactly the horizontal wandering, boids
schooling, food-seeking, and wall-avoidance a flock of budgies needs — a fish
in a water column and a bird in an air column are the same 3D boid. The two
things water gives for free that air does not: **neutral buoyancy** (fish don't
fall) and **infinite braking** (water drag stops a fish instantly). Flight must
add gravity and must *earn* every stop by landing. That's the whole design.

Register `flight` (and `hover`) in the locomotion registry (ENGINE_SPLIT §3).
`Swarm.update` keeps its shared pre/post (growth scale, eatCooldown, startle,
sim queries, orientation); the flight module owns steering + the state machine.

### Flight state machine

States: `perched → takeoff → cruise → approach → land → perched`
(with `hover` as a cruise sub-mode for hummingbirds, §Hover). Real numbers,
in the style of TERRARIUM_SPEC's hop spec. World units = cm, `G` tuned punchy
like the hop spec (reads better at cage scale than real 981 cm/s²).

- **perched** (default resting state): foot-locked to a perch-line, branch, or
  feeder via the basis-orientation from §1. Idle micro-motions: head turns,
  preen (occasional wing-lift), tail bob, sleepy fluff at night (feather
  scale-puff). Duration 4–20 s, cut short by hunger, nearby food, bath-drive,
  or startle. Reuses the `_restLogic` episode structure directly — perching
  *is* the aviary's rest state, the way glass-sitting is the pleco's.
  - **Sleep:** at deep night (`nightFactor > 0.7`) diurnal birds perch, tuck
    head, and stay — the existing diurnal night-sink logic (§225) becomes
    "settle to nearest perch and sleep." Nocturnal (owl) inverts it.

- **takeoff** (0.25 s): crouch (`scale.y *= 0.8`), aim yaw at destination or
  open air, then a **launch impulse**: `vel = dir * cruise * 1.4 + up * 40`.
  Wings snap to full downstroke. Spawns a tiny down-feather puff.

- **cruise** (flap/glide): the swim steering loop, unchanged in spirit —
  boids (`_boids`), zone preference (retargeted: birds prefer the upper flight
  zone `zoneY('top')` when free, descend to feed), wander, wall-avoidance
  (`_avoidWalls` at `AVIARY_BOUNDS`). **Added forces:**
  - **Gravity:** `vel.y -= G * dt`, `G = 220`. Constant downward pull.
  - **Lift from flapping:** during a downstroke tick, add `up * G * 1.15 * dt`
    so a flapping bird net-climbs slightly; between flaps it sags (glide). The
    flap cycle is a sine (see §7 wing rig); sample its phase to gate lift. Net
    effect: bob-and-glide flight path, free and correct-looking.
  - **Airspeed floor:** unlike fish, a bird must keep moving or **stall**. If
    horizontal speed `< stallSpeed` (`= cruise * 0.35`) and not in `approach`,
    force a flap burst or begin a descent. No hovering in place (except
    hummingbird). This is what makes flight read as flight, not floating.
  - Flock species (finch/budgie): full boids cohesion/alignment (`_boids`
    verbatim). Solo species (owl, big parrots): `soloOnly` tag → skip `_boids`,
    fly alone, exactly as `soloOnly` already gates conspecifics in rules.

- **approach** (the hard part, part 1 — deceleration): triggered when the bird
  commits to a target (perch/feeder/floor/nest). This is the state fish never
  need because water brakes them for free. Spec:
  - Target is a point on a perch-line (or feeder/floor/nest anchor). Compute
    `toTarget = target - pos`, `d = |toTarget|`.
  - Enter approach when `d < brakeDist`, `brakeDist = max(20, speed²/(2*decel))`
    with `decel = 90` cm/s². This is the classic "start braking early enough to
    arrive at ~zero speed" — arrive-behavior with a physical decel cap.
  - Steering = arrive: desired speed ramps `speed_desired = min(cruise,
    sqrt(2*decel*d))`; steer velocity toward `dir(toTarget) * speed_desired`.
    Flare the body up (pitch nose-up, wings cupped forward = air-brake) as `d`
    shrinks — this is the visual tell and it dumps speed.
  - Gravity still applies; the bird trades altitude for the glide-in, then
    flares. If it overshoots (`speed` still high at `d < 6`), **abort**: bail
    back to `cruise`, climb, circle, retry. A missed landing that goes around
    again is *charming*, not a bug — spec it in.

- **land** (the hard part, part 2 — perch targeting + foot-lock): when
  `d < 4` **and** `speed < landSpeed` (`= 12` cm/s):
  - Snap `pos` to the exact nearest curve point on the perch-line; zero `vel`.
  - Over 0.2 s, slerp orientation into the foot-locked perch basis (§1), wings
    fold (see §7), tail fans down for balance, a small settle-bob.
  - **Perch-slot arbitration:** a perch-line keeps a set of occupied 1-D
    params `t ∈ [0,1]`. A landing bird picks the nearest *free* slot (min
    spacing `= bodyLength * 1.3`); if the branch is full it re-targets another
    perch or the floor. This is boids separation collapsed to one dimension —
    same idea as fish personal-space, cheap.
  - On landing failure (no free slot, or aborts twice), land on the **floor**
    (a large always-available target) and walk/hop a step — reuse the terrarium
    `hop` mode for ground shuffling. Every bird can always land somewhere.

- **land on floor:** budgies/finches ground-forage; owls land heavy. Floor is a
  planar target (`y = FLOOR_H`), trivial vs a perch-line. Ground locomotion =
  short `hop`s (terrarium hop mode, tiny arcs) or a waddle for bigger birds.

### Collision with enclosure bounds (honest treatment)

Fish `_avoidWalls` applies soft steering forces near the walls and `_clamp`
hard-clamps position — good enough because fish are slow and buoyant. Birds are
faster and fall, so bounds need two extra honesties:

1. **Soft repulsion, stronger and earlier.** Widen the margin (`m = 16` vs
   fish's 8) and scale the push by speed, so a budgie doesn't rocket into the
   mesh. This is `_avoidWalls` retuned, not new code.
2. **Ceiling and floor are real, not soft.** `maxY` (mesh roof): a bird that
   hits it bounces its vertical velocity down (`vel.y = -|vel.y|*0.3`) and
   flares — it can't fly through the roof. `minY` (floor): if a bird descends
   to `FLOOR_H` outside a landing, it *lands* (transition to land-on-floor)
   rather than clipping. **Never** let a bird tunnel or hover at a wall.
3. **Mesh perch-grab (optional polish):** budgies cling to cage mesh in real
   life. If a bird approaches a side wall slowly, allow a wall-cling using the
   *existing climber* surface code (`SURFACES.front/back/left/right` from
   `behavior.js`) — a bird gripping the mesh is literally a gecko on glass.
   Flag as post-MVP; the wall-cling is free reuse but not load-bearing.

### Hover sub-mode (hummingbird)

Hummingbirds break the "must keep moving or stall" rule — they hover on brute
wingbeat. Spec `hover` as a **cruise variant**, not a whole new mode:
- Gravity is fully cancelled by continuous lift (`vel.y` damped toward 0 near a
  target flower/feeder); the airspeed floor is disabled.
- Movement is darting: short, fast, straight dashes between hover points with
  near-instant stops (high `decel`, no long approach). Reuses arrive-behavior
  with `brakeDist` tiny.
- Wing animation is a blur (see §7) — the visual, not the physics, sells it.

> **DECISION FOR JOHN — does hummingbird need its own locomotion sub-mode?**
> **Recommendation: yes, but cheap** — `hover` is ~30 lines layered on `flight`
> (cancel gravity + disable stall + dart steering), not a third mode. Options:
> - **(a) Ship hover as a `flight` variant** (recommended): one flag
>   `spec.flight === 'hover'` toggles the two rule-changes above.
> - **(b) Defer hummingbird to a v2 content drop** — flagship flight roster
>   without it; add hover later. Lowers MVP risk (§8 already cuts it).
> - **(c) Full separate `hover` module** — cleanest code, most work; only worth
>   it if a future pack (e.g. sunbirds, or a bee in Bee Hive) reuses it.

---

## 3. Birdsong on the existing WebAudio synth (`src/audio.js`)

No assets. Every sound is oscillator-synthesized, exactly like the existing
`_bubble`/`chime`/`coin`. Birdsong is *more* synth-friendly than bubbles — real
birdsong is close to pure-tone frequency-swept whistles, which is precisely what
`OscillatorNode.frequency.exponentialRampToValueAtTime` produces. The aviary
adds a **voice bank**: a set of note/phrase primitives plus per-species song
recipes that sequence them.

### Voice primitives (add to `Sound`)

Built from the same `_env(g, t0, attack, peak, dur)` envelope helper already in
`audio.js`:

| Primitive | Synth recipe | Use |
|---|---|---|
| `_chirp(f0, f1, dur, vol)` | one `sine`/`triangle` osc, `freq` ramps `f0→f1` over `dur`, `_env` short attack | the atom of all songs |
| `_warble(f, depth, rate, dur)` | osc at `f` with a fast LFO on `frequency` (depth Hz, rate Hz) | canary/lovebird trills |
| `_tweet(seq)` | schedule a list of `[f0,f1,dt,dur,vol]` chirps | finch/budgie chatter |
| `_hoot(f, dur)` | low `sine` (~`300–500` Hz), slow attack, tremolo LFO, breathy | owl, needs a lowpass like the ambience |
| `_whistle(notes)` | clean `sine` glides between pitches | wolf-whistle / mimic |

These are 6–8 small methods, each ~6 lines, mirroring `drop()`/`chime()`.

### Per-species song recipes

Each species carries a `song` descriptor in its schema; the audio system reads
it to schedule primitives. Recipes as data, not code:

| Species | Recipe (sequence of primitives) | Timing / trigger |
|---|---|---|
| **Zebra finch** | rapid `_tweet` bursts of 3–5 short up-chirps (`650→900 Hz`) + a nasal "meep" | frequent, social; more when flock is close (map to boids neighbor count) |
| **Budgie** | long babbling `_tweet` chains, random pitch walk `500–1400 Hz`, occasional `_warble` | near-continuous soft chatter when awake; louder at feeder |
| **Canary** | long rolling `_warble` (rate 20–30 Hz) climbing then cascading, 3–6 s phrases | the song showpiece — sings solo, more when alone & content (health high) |
| **Cockatiel** | 3-note descending `_whistle` + a rising "wolf-whistle" motif | periodic; the mimicry candidate (see below) |
| **Lovebird** | sharp high `_chirp` shrieks in pairs, `_warble` bursts | excitable, more at dawn and when a mate is near |
| **Barn owl** | `_hoot`-family: NOT a hoot — a raspy screech; a `sine` 400 Hz + shaped noise burst, breathy, eerie | **night only**, gated on `nightFactor > 0.6` (see below) |
| **Hummingbird** | thin insect-like `_chirp` ticks `3–4 kHz`, plus a wing-hum drone (low `sine` 40–50 Hz at low vol) | quiet; the wing-hum is the identity sound |

### Night gating via existing `nightFactor`

The synth doesn't own the clock, but `Swarm.nightFactor` is already computed
each frame in `main.js` (§701, `= 1 - df`). Route it into `Sound` (a
`setNight(nf)` setter, or read it where songs are scheduled). Then:
- Diurnal songbirds' song rate scales by `df` (quiet at night — sleeping).
- The **owl screech** is gated `nf > 0.6`, so it only calls after the kid's
  lights go out. This is the terrarium night-check-in feeling, in audio: the
  aviary *sounds* different at night, and the owl is the reason.

### Dawn chorus (killer feature — spec it)

Tie to the real-clock dawn already in `rawDayFactor()` (`main.js` §88–95): dawn
is the ramp `h ∈ [6,8)` where `df` climbs `0→1`. During this window, in the
foreground (app open at real 6–8am) **and** as the catch-up when the kid opens
the app during that window:

- **Trigger:** `df` rising **and** `df ∈ (0.05, 0.95)` **and** local hour in
  `[6, 8)`. A `dawnChorus` flag on the aviary pack's audio recipe.
- **Behavior:** every awake songbird's song rate is multiplied ×3 and the flock
  sings in loose overlap — schedule each bird's recipe with a small random
  phase offset (0–2 s) so voices stack into a chorus, not a unison. The canary
  leads, finches/budgies fill, cockatiel whistles punctuate. Volume swells with
  `df` then relaxes to normal daytime chatter by 8am.
- **Why it's a killer feature:** it makes the aviary a *place with a time of
  day.* A kid who opens the app before school hears the dawn chorus; the same
  aviary at noon is quiet chatter; at night, one owl. Nothing else in the game
  rewards *when* you open it like this. It's pure reuse of the day/night clock
  the engine already runs, and it's the aviary's signature.
- **Cost:** near zero — it's a rate multiplier + phase-stagger on recipes that
  already exist. No assets, no new DSP.

> **DECISION FOR JOHN — dawn chorus intrusiveness:**
> - **(a) On by default, gentle** (recommended): swells softly, respects the
>   master mute, never louder than normal chatter × ~1.6.
> - **(b) Off by default, opt-in "Dawn Chorus" toggle** — safest for a parent
>   who hands the phone over at breakfast; discoverable as a delight.
> - **(c) Visual-only dawn "everybody's singing" cue** if sound is muted (birds
>   animate open-beak) so muted players still get the moment.

### Parrot / budgie MIMICRY (scope call)

Real budgies and parrots mimic. A synth "learning" to mimic is charming but the
options differ wildly in cost and privacy risk. **This is the aviary's marquee
taste-and-scope decision.** What a synth can realistically "learn":

| Option | What it does | Cost | Risk |
|---|---|---|---|
| **(1) Tap-melody echo** | Kid taps a rhythm/melody on the birds (or on-screen keys); the parrot repeats it back after a beat, as `_whistle` notes. Fully offline, no mic. | Low (~a day): record tap timestamps → replay as whistle chirps | None |
| **(2) In-aviary song mimicry** | The parrot/cockatiel occasionally repeats *another bird's* recipe it has "heard" (a nearby species' song), tagged as learned. Emergent flock behavior, no external input. | Low–med: pick a neighbor's recipe, replay through the parrot's timbre | None |
| **(3) Scripted phrase unlocks** | The kid "teaches" set phrases (a wolf-whistle, "hello") unlocked by care milestones; parrot plays them via `_whistle`. Feels like teaching, fully authored. | Med: content + unlock plumbing | None |
| **(4) Real mic input mimicry** | Mic captures the kid's whistle/voice; bird plays it back (pitch-tracked or raw). The "wow." | High + **privacy-sensitive**: mic permission on a kids' app, recording, storage. | **High** — cuts against "safe for a 6-year-old to own, no accounts, no dark patterns." |

> **DECISION FOR JOHN — mimicry scope (RECOMMENDATION: ship (1)+(2), defer (3),
> reject (4) for the kids'-privacy line):**
> - **(1) Tap-melody echo** — cheapest, delightful, zero privacy cost. The core.
> - **(2) In-aviary song mimicry** — emergent, "my birds taught each other,"
>   free reuse of recipes. Strong pairing with (1).
> - **(3) Scripted phrase unlocks** — good retention layer, do it if there's
>   time; it's the "teach your parrot to say hello" fantasy done safely.
> - **(4) Mic mimicry** — **flag against**: violates the offline/no-permissions/
>   safe-for-a-6-year-old constraints. If ever wanted, it must be an explicit,
>   parent-gated, nothing-stored, opt-in setting — a separate decision, not MVP.

---

## 4. Care model mapping (reuse `CareSim` in `src/sim.js`)

`CareSim._decay()` already does hunger/health/water/algae/offline/growth; the
meters get relabeled and retuned. Semantic mapping (meters become pack config
per ENGINE_SPLIT §4; until then, the mapping):

| Aquarium meter | Aviary meter | Mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Seed & water freshness** | Decays toward 0 at `FRESHNESS_DECAY_DAYS ≈ 2` (birds need daily fresh food/water — faster than water's 9). `waterChange()` → `refresh()` (top up seed + change bath water), `+0.55` same as now. Below `SICK_THRESHOLD`, same health-drain path as `t.water < SICK_THRESHOLD`. |
| `tank.algae` (0→1) | **Cage-floor cleanliness** | Identical mechanic: droppings + seed husks accumulate on the floor at an `ALGAE_DAYS`-style rate. **The existing wipe gesture in `main.js` (`sim.scrubAlgae(0.015)` per pointermove + sparkles) works unchanged** — the kid wipes the cage floor clean exactly as they scrub algae. Render as accumulating husk/dropping sprites on the floor plane instead of a pane overlay. |
| — (new, optional) | **Bath / plumage** | Optional third meter: birds that never bathe look dull (drop the feather-shine uniform); a bath resets it. Cheap delight, not load-bearing — defer to post-MVP. |
| Rotting food pollution | Scattered seed | Uneaten seed on the floor doesn't "rot" as poison — it **builds husk mess** (feeds the cleanliness meter) and can sprout the "escaped feeder" style surprise (a dropped seed a bird finds later). Maps to the `rottingFood` accounting already in `_decay`. |
| Offline decay | Identical | `applyOffline()` loops habitats exactly as it loops `['fresh','salt']` today — the aviary subtype(s) slot in unchanged. |

**Temperature/humidity:** birds are far more forgiving than reptiles — **no temp
meter** (unlike terrarium). Keeps the aviary's care model to two meters
(freshness + cleanliness), which is simpler than the terrarium's three. Good:
the aviary's complexity budget is spent on flight, not husbandry.

### Foods table (`FOODS` sibling, same field shape)

Behavior semantics repurposed: `floatTime`/`sinkSpeed` → for the aviary most
food is **static in a feeder or on the floor** (`behavior: 'static'` per
ENGINE_SPLIT §4 food strategies), with a couple of special cases.

| id | name | emoji | eaten by | behavior when placed |
|---|---|---|---|---|
| `seed` | Seed Mix | 🌾 | budgie, cockatiel, finch, canary, lovebird | fills the seed cup; birds land at feeder to peck (static in feeder) |
| `millet` | Millet Spray | 🌾 | budgie, finch, lovebird | hangs as a spray stalk; birds cling and peck — a *toy + food* (the treat) |
| `fruit` | Fruit & Veg | 🍎 | cockatiel, lovebird, (parrots) | static dish; chunk shrinks as eaten |
| `pellet` | Bird Pellets | 🟤 | all seed-eaters (the "healthy" food) | static in cup; higher `value` than seed (true — pellets are better nutrition) |
| `mealworm` | Mealworms | 🪱 | canary (rearing), robin-types, **insectivores** | wiggles on floor (terrarium mealworm behavior reuse); live-food treat |
| `nectar` | Nectar | 🍯 | **hummingbird, lorikeet/lorikeet-type** | drips into a nectar feeder; hover-feed (hummingbird) or lap (lorikeet) |
| `mouse`/`chick` | (owl food) | 🍖 | **barn owl only** | see §5 owl + the terrarium snake-feeding toggle precedent |

Nectar for lorikeets: yes — lorikeets are nectar/pollen specialists (true). If a
lorikeet is in the roster (see §5 roster options), `nectar` is its diet and the
nectar feeder + hover/lap feeding is its hook. The hummingbird shares `nectar`.

`rules.js` `evaluateAdd()` runs **unchanged**: bioload = cage air space,
`soloOnly` covers big parrots and the owl-vs-flock question (see §5),
`predator` + `canEat` (0.42 size ratio) covers the owl-eats-finches problem
honestly, `water !== current` generalizes to habitat-match so aviary birds can't
be added to a fish tank. `finNipper`/`longFins` stay `false` everywhere — kept
so schema and rules stay identical.

---

## 5. Species plan

### Target roster

A launch roster of ~12–16 birds, authored per-habitat against `SPECIES_SPEC.md`
by subagents (same as every pack). Coverage targets: **flock songbirds**
(finches, budgies), **companion parrots** (cockatiel, lovebird, budgie),
**a song specialist** (canary), **the nocturnal "can't-have" star** (barn owl),
**a hover specialist** (hummingbird), and 1–2 stretch birds (a small conure or a
rainbow lorikeet for the nectar mechanic). Below are the **8 flagship species
fully authored** in the exact `freshwater.js` schema.

### Schema deltas (applied consistently)

- `water: 'aviary'` (the habitat-match key; `zone` values change too).
- `zone`: `'canopy' | 'mid-air' | 'ground' | 'nest'` (replaces top/mid/bottom;
  `zoneY()` maps `canopy`→upper flight zone/perches, `ground`→floor foragers).
- `kind`: `'bird'` — selects the bird builder (§7).
- `locomotion`: `'flight' | 'hover'` (aquarium infers from kind; aviary
  declares it).
- `flight`: `'flock' | 'solo' | 'hover'` — steering flavor (flock = boids on,
  solo = boids off, hover = the sub-mode).
- `song`: a recipe id (§3) — new field, string.
- Everything else — identical fields and types. `colors` hexes are true-to-life;
  facts are 3, kid-true, real.

```js
export const AVIARY_SPECIES = [
  {
    id: 'budgie', common: 'Budgerigar', scientific: 'Melopsittacus undulatus',
    water: 'aviary', kind: 'bird', adultSizeCm: 18, bioload: 2, minSchool: 4,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'flight', flight: 'flock', song: 'budgie',
    speed: 1.3, schooling: 'tight', diet: ['seed', 'millet', 'pellet'], price: 25,
    archetype: 'parakeet', size: 1.0,
    colors: { base: '#6fc23a', belly: '#e8e84a', fin: '#3a7fc2',
      pattern: 'stripesH', patternColor: '#101010', patternScale: 1.4, iridescence: 0.15 },
    habitat: 'Vast dry grasslands and scrub across the interior of Australia.',
    facts: [
      'Wild budgies fly in huge flocks of thousands, wheeling and turning together like a living cloud.',
      'A budgie can learn more words than any other bird — one held the world record at over 1,700!',
      'The skin above its beak, called the cere, is blue on most boys and brownish on girls.'
    ],
    care: 'Easy'
  },
  {
    id: 'cockatiel', common: 'Cockatiel', scientific: 'Nymphicus hollandicus',
    water: 'aviary', kind: 'bird', adultSizeCm: 32, bioload: 4, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'flight', flight: 'flock', song: 'cockatiel',
    speed: 1.15, schooling: 'loose', diet: ['seed', 'pellet', 'fruit'], price: 60,
    archetype: 'cockatiel', size: 1.15, shape: { height: 1.1, finFlow: 1.1 },
    colors: { base: '#b8b0a0', belly: '#d8d0c0', fin: '#e8e0d0',
      pattern: 'patches', patternColor: '#e8c040', patternScale: 1.2, iridescence: 0.1 },
    habitat: 'Open bushland and wetlands across most of inland Australia.',
    facts: [
      'The tall crest of feathers on its head goes straight up when it is surprised and flat when it is grumpy.',
      'The round orange patch on each cheek is like a permanent pair of blush marks.',
      'Cockatiels are champion whistlers and can learn to whistle whole tunes back to you.'
    ],
    care: 'Easy'
  },
  {
    id: 'zebra_finch', common: 'Zebra Finch', scientific: 'Taeniopygia guttata',
    water: 'aviary', kind: 'bird', adultSizeCm: 10, bioload: 1, minSchool: 6,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'flight', flight: 'flock', song: 'zebra_finch',
    speed: 1.4, schooling: 'tight', diet: ['seed', 'millet'], price: 15,
    archetype: 'finch', size: 0.7,
    colors: { base: '#8a8a80', belly: '#e8e0d0', fin: '#d86838',
      pattern: 'stripesV', patternColor: '#202020', patternScale: 1.5, iridescence: 0.1 },
    habitat: 'Dry grasslands and scrub across most of mainland Australia.',
    facts: [
      'A zebra finch dad sings his own special song, and his sons learn it note by note, like a family tune.',
      'Its call sounds exactly like a tiny toy trumpet going "meep meep".',
      'It is one of the fastest little birds to build a nest — a fluffy dome of grass in just a few days.'
    ],
    care: 'Easy'
  },
  {
    id: 'canary', common: 'Domestic Canary', scientific: 'Serinus canaria domestica',
    water: 'aviary', kind: 'bird', adultSizeCm: 13, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'mid-air', locomotion: 'flight', flight: 'solo', song: 'canary',
    speed: 1.2, schooling: 'solo', diet: ['seed', 'pellet', 'mealworm'], price: 40,
    archetype: 'finch', size: 0.75,
    colors: { base: '#f0d020', belly: '#f8e860', fin: '#e0b010',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.12 },
    habitat: 'Wild ancestors live on the Canary Islands, Madeira, and the Azores off Africa.',
    facts: [
      'Only the boy canaries sing, and they practice for months to learn their long, rolling song.',
      'Miners once carried canaries underground because the birds warned them of dangerous air.',
      'People have bred canaries in yellow, orange, white, and even with fluffy crests for 500 years.'
    ],
    care: 'Easy'
  },
  {
    id: 'lovebird', common: 'Peach-Faced Lovebird', scientific: 'Agapornis roseicollis',
    water: 'aviary', kind: 'bird', adultSizeCm: 17, bioload: 2, minSchool: 2,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'flight', flight: 'flock', song: 'lovebird',
    speed: 1.3, schooling: 'loose', diet: ['seed', 'millet', 'fruit'], price: 45,
    archetype: 'parakeet', size: 0.9,
    colors: { base: '#4fb040', belly: '#7ac850', fin: '#3a90d0',
      pattern: 'patches', patternColor: '#e86840', patternScale: 1.1, iridescence: 0.2 },
    habitat: 'Dry, rocky country and river valleys of southwestern Africa.',
    facts: [
      'Lovebirds sit pressed together in pairs and preen each other, which is how they got their name.',
      'A girl lovebird tucks strips of leaf and bark into her tail feathers to carry them home for the nest.',
      'They chatter to each other all day long and stay with the same partner for years.'
    ],
    care: 'Moderate'
  },
  {
    id: 'barn_owl', common: 'Barn Owl', scientific: 'Tyto alba',
    water: 'aviary', kind: 'bird', adultSizeCm: 36, bioload: 8, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'canopy', locomotion: 'flight', flight: 'solo', song: 'barn_owl',
    speed: 0.9, schooling: 'solo', diet: ['mouse', 'chick'], price: 150,
    archetype: 'owl', size: 1.5, shape: { height: 1.2, finFlow: 0.9 },
    colors: { base: '#e8d8b8', belly: '#f8f0e0', fin: '#c8a878',
      pattern: 'spots', patternColor: '#8a7050', patternScale: 1.3, iridescence: 0.05 },
    habitat: 'Farmland, meadows, and old barns across every continent except Antarctica.',
    facts: [
      'Its wing feathers have a soft velvety edge, so it flies in total silence — its prey never hears it coming.',
      'It can find a mouse in complete darkness using only its heart-shaped face to funnel sound to its ears.',
      'A barn owl does not hoot — it makes a long, raspy screech that sounds a little spooky.'
    ],
    care: 'Hard'
  },
  {
    id: 'annas_hummingbird', common: "Anna's Hummingbird", scientific: 'Calypte anna',
    water: 'aviary', kind: 'bird', adultSizeCm: 10, bioload: 1, minSchool: 1,
    temperament: 'semi', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'hover', flight: 'hover', song: 'hummingbird',
    speed: 1.6, schooling: 'solo', diet: ['nectar'], price: 70,
    archetype: 'hummingbird', size: 0.5,
    colors: { base: '#3a9a5a', belly: '#e8e0d0', fin: '#4a9a60',
      pattern: 'gradientTail', patternColor: '#d81848', patternScale: 1.0, iridescence: 0.85 },
    habitat: 'Gardens, chaparral, and woodland edges along the Pacific coast of North America.',
    facts: [
      'It beats its wings about 50 times every second, so fast they blur into a hum — that is its name.',
      'It is the only bird that can truly fly backwards, and it can hover perfectly still in the air.',
      'Its heart can beat over 1,200 times a minute, faster than any other animal its size.'
    ],
    care: 'Hard'
  },
  {
    id: 'gouldian_finch', common: 'Gouldian Finch', scientific: 'Chloebia gouldiae',
    water: 'aviary', kind: 'bird', adultSizeCm: 14, bioload: 1, minSchool: 6,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid-air', locomotion: 'flight', flight: 'flock', song: 'zebra_finch',
    speed: 1.35, schooling: 'tight', diet: ['seed', 'millet'], price: 55,
    archetype: 'finch', size: 0.75,
    colors: { base: '#4fc23a', belly: '#f0d020', fin: '#7a30c0',
      pattern: 'patches', patternColor: '#e01848', patternScale: 1.2, iridescence: 0.3 },
    habitat: 'Tropical grassy woodlands of far northern Australia.',
    facts: [
      'It looks like it was colored in with every crayon in the box — green, yellow, purple, and red.',
      'A single wild flock can have birds with black faces, red faces, or golden faces, all together.',
      'It nests inside hollow trees and its chicks have glowing blue beads at the corners of their mouths so parents can feed them in the dark.'
    ],
    care: 'Moderate'
  },
];
```

### Barn owl cohabitation — honest treatment (check `rules.js` predator logic)

The owl is the "can't-have" star and also a genuine predator. `rules.js` already
handles this correctly and honestly, no special-casing:

- `barn_owl` has `predator: true`, `adultSizeCm: 36`. `canEat(owl, finch)` =
  `finchSize(10) <= 36*0.42 (=15.1)` → **true**. A zebra finch (10cm), canary
  (13cm), gouldian (14cm), budgie (18cm→ `18<=15.1` false) are all flagged. So
  `evaluateAdd` **warns** at purchase: *"Barn Owl is a predator. It may hunt and
  eat your smaller birds (Zebra Finch, Canary, Gouldian Finch)."* — the exact
  existing warning path, truthful.
- At runtime, `_findPrey`/`_nearestThreat`/`_devour` would let the owl actually
  hunt finches (at night, when it's active and they're asleep — grim but real).

This is a **taste decision, not a code problem** — the honesty engine already
works. The question is what the *product* does with a 6-year-old's flock:

> **DECISION FOR JOHN — owl-with-songbirds policy (RECOMMENDATION: (b) warn +
> soft-separate, mirroring the terrarium snake-feeding toggle):**
> - **(a) Full honesty (predation on):** the owl really can eat a finch
>   overnight. Maximally true, matches "ecosystems have rules," but a kid losing
>   a beloved finch to their own owl at 3am with no warning is harsh for this
>   audience. (The queen-death stakes in Ant Farm were opt-in-severe; this is
>   not opt-in.)
> - **(b) Warn hard at purchase, then the owl "hunts" cosmetically but doesn't
>   kill tankmates by default** — a parent toggle ("Owl hunting", default off)
>   enables real predation for families who want it. Directly mirrors the
>   **decided** terrarium snake-feeding toggle pattern (parent toggle, matter-of-
>   fact default). Owl still eats its `mouse`/`chick` food on its own perch
>   (off-screen or matter-of-fact per the same 3-mode toggle). **Recommended.**
> - **(c) Enclosure separation:** the owl is `soloOnly` **and** aviary-
>   incompatible with small songbirds — `rules.js` gets one extra check
>   blocking finches + owl in the same aviary ("a barn owl needs its own
>   aviary — it would hunt little birds"). Cleanest for safety, teaches a true
>   husbandry fact, but loses the mixed-aviary drama entirely.

The owl's own feeding (`mouse`/`chick`) reuses the **already-decided** terrarium
snake-feeding parent toggle verbatim (shown / off-screen / substitute) — do not
re-litigate that; inherit it.

---

## 6. The four retention mechanics, made concrete

Per HABITAT_VISION, every habitat ships all four. The aviary's headline is the
**babies loop as a full nesting → eggs → chicks → fledging arc over real days**
— the richest version of the growth-&-babies mechanic in the game so far
(structurally like the livebearer breeding already in `CareSim._decay` §188, but
staged and visible in the nest box).

1. **Care debt (offline decay).** `applyOffline()` unchanged: seed/water
   freshness and cage cleanliness decay while away, capped at
   `OFFLINE_CAP_HOURS`. Birds have a *faster* freshness clock than fish (daily
   food), so a day away matters more — a good thing for a daily-check pet.

2. **Growth & babies — the nesting loop (the structural centerpiece).**
   Extends the existing breeding path (`_decay` §188: 2+ healthy adults of a
   nesting species in good conditions → offspring). Staged over real days:
   - **Pair bond:** two adults of a nest-capable species (finch, budgie,
     lovebird, cockatiel), health high, freshness high, a free nest box → a
     pair forms (they perch together, mutual preen; lovebirds carry "nest
     material" as a visible prop — true).
   - **Eggs:** the pair claims a nest box; 1–5 eggs appear inside over ~1 day.
     Eggs are a **collectible surprise prop** (like terrarium molts / the
     treasure system) — tap the box to peek.
   - **Incubation → hatch over real days:** eggs hatch staggered over
     `HATCH_DAYS ≈ 2–4` real days (reuse the `growth` clock — an egg is a
     `growth: 0` record that "hatches" at a threshold, then a chick is a
     `growth: 0.05` juvenile). Requires the parents to be alive, fed, and the
     cage reasonably clean — care debt gates the loop, teaching consequence.
   - **Parents feed chicks:** chicks stay in/near the nest with an open-beak
     begging animation; parents fly food from the feeder to the nest (a new
     tiny AI errand: a parent with chicks periodically targets feeder → nest,
     visible feeding). Chicks' `hunger` is buffered by parent feeding as long as
     the *parents* are fed — the kid feeds the parents, the parents feed the
     babies. Beautiful, true, and cheap (reuses feeding targeting).
   - **Fledging moment (the payoff):** at `growth ≈ 0.4` a chick **fledges** —
     first wobbly flight from the nest to a nearby perch: a special one-time
     event (toast + a shaky short flight with extra flap and a near-miss
     landing, using the flight state machine's "abort and retry" as *charm*).
     This is the aviary's metamorphosis-grade moment — the thing the kid waits
     days for and catches once. Fires a `'fledged'` event like `'grown'`.

3. **Collection book.** Every species owned unlocks its card (facts, habitat,
   real name, record — e.g. wingspan or fastest-flier). Same `discovered[]`
   array in `CareSim`. Bonus aviary-specific unlock: "first successful clutch"
   and "first fledge" as book achievements.

4. **Surprises.** Reuse the surprise system: a **dropped feather** left after a
   molt or bath (collectible, coins on tap — the aviary's molt/shed analog); an
   **egg** appearing in a nest box (the peek moment); a **fledge** you catch
   once; the **owl screech** at night the first time the kid is watching after
   dark; a **dawn chorus** the first time they open the app at 6–8am. Several of
   these are "different place after dark / at dawn" moments, the strongest
   version of the terrarium night-check-in.

> **DECISION FOR JOHN — clutch frequency / population pressure:**
> - **(a) Generous breeding** (birds pair and clutch readily): maximal babies-
>   loop delight, but bioload fills fast → the kid hits the cap and must manage
>   (rehome via the shop for coins? — needs a "rehome to the pet store" flow).
> - **(b) Rare, milestone breeding** (a clutch is a special earned event,
>   gated on sustained good care + a nest box the kid buys): scarcer, more
>   precious, less population management. **Recommended for calm.**
> - **(c) Player-initiated** ("Set up a nest box" is a deliberate action the kid
>   takes when ready): no surprise overpopulation, teaches intent.

---

## 7. Performance budget — S24-class, 60fps

The aviary's cost centers are **feathers/wings** (each bird animates folding
wings, unlike a rigid fish) and **flock counts**. Budget mirrors the aquarium's
(the S24 already runs 42 fish + particles at 60fps).

### Wing & feather geometry — on the fishbuilder lofted-body tech

Reuse `fishbuilder.js`'s heritage exactly: a lofted superellipse body
(`buildBodyGeometry`, ring cross-sections with the `aT` head→tail attribute) +
the `onBeforeCompile` pattern/iridescence shader (`makeFishMaterial`). A bird
body is a shorter, rounder fish body — same `PROFILES` approach with new bird
archetypes (`parakeet, cockatiel, finch, owl, hummingbird`). The genuinely new
requirement: **wings that fold.**

- **Wing geometry:** each wing is a low-poly lofted membrane (like a large
  pectoral fin from `fishbuilder` — the `finGeometry`/`ridgeFinGeometry` code
  already builds fin sheets with the `aT` attribute). Two wings, rooted at the
  shoulders, built once per archetype and shared.
- **Fold via a two-bone hinge, animated CPU-side (no skinning):** a wing is a
  parented two-segment group (`shoulder` → `hand`), like the pectoral-fin
  `rotation.z` paddle already animated in `animateFishVisual` (§388). Folding =
  driving two rotation angles:
  - **Flap:** `shoulder.rotation.z = flapAmp * sin(t * flapRate)`; the outer
    `hand` segment lags by a phase for a whip (same trick as the pectoral lag).
    `flapRate` per species (finch fast, owl slow, hummingbird a blur — for the
    hummingbird just hold the wings as a motion-blurred alpha disc rather than
    animate 50Hz, which no display shows anyway).
  - **Fold (perched):** lerp both angles to a tucked pose (`shoulder` back,
    `hand` folded flat along the body) over 0.2 s on landing; unfold on takeoff.
    This is the fish "fins fold on rest" idea generalized. Purely transform
    animation — **zero per-frame geometry rebuild.**
- **Feather look = shader, not geometry:** feather rows, barring, and sheen come
  from the existing pattern shader (`PATTERN_ID` set: `stripesH`, `patches`,
  `spots`, `gradientTail`) + `iridescence` uniform — the `colors` block is
  schema-identical on purpose (a hummingbird gorget = high `iridescence`, a
  budgie's barring = `stripesH`). No feather meshes, no fur cards.
- **Tail:** the caudal-fin builder (`CAUDAL`, `finGeometry` + `addFinT`) becomes
  the tail fan — fans open on landing/braking (air-brake tell), closes in
  cruise. Direct reuse.

Per-bird cost ≈ body + 2 wings (2 segments each) + tail + 2 eyes ≈ on par with a
fish + its fins. No new material system.

### Flock instancing

- Flocking species (finch, budgie, gouldian) are the crowd. The aquarium
  already runs schools of tetras with per-agent `Agent` objects at 42 total;
  the aviary keeps the same per-agent model for **hero birds** (the ones the kid
  bought, named, that breed).
- For **large decorative flocks** beyond the hero cap (a wheeling cloud of
  finches as ambience), use `InstancedMesh` with per-instance matrices driven by
  a lightweight boids pass — the same pattern ANTFARM_SPEC uses for its ~400
  crowd ants vs 48 hero ants. Wings on instanced crowd birds animate via a
  shared shader-time flap (vertex wobble like the body wave), not per-instance
  CPU transforms. Flag crowd-flock as **post-MVP polish**; MVP runs hero birds
  only.
- **Caps (pack config, mirrors `CAPACITY`):** `maxAgents: 24` hero birds (fewer
  than fish's 42 — birds are bigger and animate more), `bioload: 100` cage-air
  budget. Big birds (owl `bioload: 8`) eat the budget fast, correctly limiting a
  cage to one owl + a few small birds.

### Frame budget notes

- Shadows: the aquarium casts one directional shadow; keep it, but birds high in
  a 240cm cage need the shadow camera frustum widened (the `sun.shadow.camera`
  bounds in `main.js` §71–73) — a constant tweak, not new tech.
- Particles (down-feathers, dust, bath splash) reuse the bubble/mote `Points`
  systems at similar counts — proven cheap.
- The synth voice bank is trivial CPU (a handful of oscillators at a time);
  cap simultaneous songs (~4 voices) so a full dawn chorus schedules in
  overlapping bursts, not 16 oscillators at once.

---

## 8. MVP cut

Ship the flight-perch-song core with a small flock; defer mimicry, the owl, the
hover bird, and the full nesting arc. Proves the pack contract and the flight
tech before the expensive parts.

| Species | Locomotion | Why |
|---|---|---|
| **Budgie** | flight (flock) | THE beg-for bird; flock boids reuse; talker charm |
| **Zebra Finch** | flight (flock) | cheap, tight flock — proves cohesion + perch-slot spacing |
| **Cockatiel** | flight (flock) | whistle song showpiece; crest charm; forgiving care |
| **Canary** | flight (solo) | the song specialist — proves solo (`soloOnly`, no boids) + `_warble` |
| **Lovebird** | flight (flock) | pair-bond charm, a taste of the nesting hook |

**Systems in MVP:**
- Aviary environment builder (bigger `ENCLOSURE`, perches, feeder, water bath,
  cage-floor cleanliness overlay).
- `flight` locomotion: perched → takeoff → cruise → approach → land, with
  gravity, stall, arrive-braking, perch-slot landing, and floor-fallback.
- Two care meters: seed/water freshness + cage cleanliness (wipe gesture reuse).
  **No temp meter.**
- Foods: `seed`, `millet`, `pellet`, `fruit`.
- Birdsong voice bank (`_chirp`/`_warble`/`_tweet`/`_whistle`) + per-species
  recipes + **the dawn chorus** (it's cheap and it's the signature — keep it in
  MVP).
- Bird builder archetypes: `parakeet`, `cockatiel`, `finch` with folding wings +
  the fishbuilder pattern shader.
- Hero birds only (per-agent), `maxAgents ≈ 24`.

**Deferred past MVP:**
- **Barn owl** (nocturnal predator + the cohabitation policy decision + owl
  food toggle + `owl` archetype — its own milestone, and the "star" is worth
  waiting for).
- **Hummingbird** (`hover` sub-mode + wing-blur + nectar feeder).
- **Mimicry** (tap-echo + in-aviary — the whole §3 mimicry decision).
- **Full nesting arc** (eggs → chicks → parent-feeding → fledge). MVP ships the
  pair-bond *look* (lovebirds perch together) as a teaser; the staged babies
  loop is the first post-MVP milestone.
- **Crowd-flock InstancedMesh** ambience.
- **Bath/plumage third meter**, mesh wall-cling, lorikeet + nectar.

> **DECISION FOR JOHN — starter flight policy (clipped vs full flight):**
> Real fledgling pet birds are sometimes wing-clipped so they can't fly far. In
> the game this is a difficulty/onboarding lever:
> - **(a) Full flight from day one** (recommended): the flight showpiece is the
>   whole point of the pack — clipping it hides the best tech. Realistic-not-
>   cartoon favors the free-flight aviary fantasy.
> - **(b) "Clipped" starter, unlock free flight:** the first bird stays low /
>   hops more until the kid earns/buys a bigger flight cage — eases the landing
>   AI in gently and gives a progression beat. More conservative, teaches a real
>   (if debated) husbandry practice.
> - **(c) Per-bird toggle** (a bird can be "flighted" or "clipped" as a care
>   choice): most flexible, but adds a husbandry concept a 6-year-old may not
>   need. Probably over-scoped.
```
