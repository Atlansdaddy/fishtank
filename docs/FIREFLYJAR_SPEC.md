# Firefly Jar — Habitat Pack Spec

The tiny one. Built right after Terrarium to reuse its brand-new pack plumbing
(`docs/ROADMAP.md` §2→3) at roughly 1/10th the scope. It proves the
habitat-pack pattern at minimal size and delivers one piece of genuinely new
tech — a **glow shader + species-accurate blink behavior** — that later
habitats (bee-hive bioluminescence teasers, deep-sea reef) can borrow.

The fantasy: **the summer-night jar you were never allowed to keep.** You catch
a few fireflies at dusk, they light up your dark room, and — the real lesson —
you let them go. It is **night-only magic**: the jar follows the real clock the
way the aquarium already does (`rawDayFactor()` in `src/main.js`), so by day
the jar is a quiet daytime terrarium of hidden bugs, and the show starts at
dusk.

Everything maps to an existing module. New code is: one environment builder
(a cylinder instead of a box), one locomotion mode (drift-fly), and the
**blink/glow system** (the whole point of the pack). It is designed to be the
**cheapest habitat in the lineup** — a dark scene with a dozen tiny light
sources is nearly free.

---

## 1. Enclosure rendering (reuse `src/tank.js` pattern)

`buildJar(scene, renderer)` returns the same handle shape as `buildTank()`:
`{ group, setTheme(type), setDay(df), update(t) }`, so `main.js` swaps it into
the frame loop untouched. The one real departure from Terrarium: **this is a
cylinder, not a box.** The glass, the bounds, and the "sand bed" all change
shape.

| Aquarium element (`tank.js`) | Firefly-jar equivalent | Notes |
|---|---|---|
| Sand bed (`PlaneGeometry` + dune noise) | **Grass & leaf floor** | Same displaced disc instead of a rect: a `CircleGeometry(JAR.R, 48)` rotated flat, low noise, theme colors `moss`/`soil`. Scatter a few upright grass-blade sprites (thin `PlaneGeometry`, alpha-cut), a curved twig (`TubeGeometry`), 2–3 clover leaves. This is where crickets hide and the glow-worm crawls. |
| Back wall (`BackSide` box) | **None — it's a jar** | A cylinder is see-through 360°. Replace with a single dark backdrop plane far behind the jar (`scene.background` set to near-black night blue) so the glass reads and the glows pop. No inner walls. |
| Water surface plane | **None (dry)** | Removed entirely. |
| Caustics shader on sand | **Moonlight pool** (optional, off in MVP) | Reuse the caustics quad slot for a faint radial moonlight disc on the floor, blue-white `#2a3550`, intensity follows `1 - day` (brightest at night). Very low opacity — the fireflies must be the brightest thing in frame. |
| `buildShafts()` sun shafts | **Moonbeam** (one, dim) | Keep the additive-plane trick but a single pale-blue shaft, `vec3(0.6,0.7,1.0)`, opacity tied to `(1-day)`. Optional; cut in MVP. |
| `buildBubbles()` airstone | **Repurposed → the fireflies' glow motes** | Not an airstone. The `Points` system becomes drifting dim pollen/dust motes in the air column, barely visible, that catch firefly light. Idle always-on, slow upward drift like today. |
| `buildMotes()` marine snow | **Dust / pollen motes** | Keep, lower opacity, gentle Brownian drift. |
| Glass frame (`addFrame`) | **Jar rim + lid with air holes** | Replace the rectangular frame bars with: a torus rim at the mouth, and a punched metal lid — a thin `CylinderGeometry` cap with a ring of small dark circles (instanced or a single alpha texture) reading as air holes. The lid is a **toggleable prop** (see §2/§6 — opening it is a care/release action). |
| Decor (`buildDecor` in `main.js`) | Grass tufts, twig perch, toadstool | Grass blades reuse the aquarium plant-blade builder with a dry-green tint. New: a bent twig (climb/perch target for moths and the glow-worm) and one small mushroom. Cheap billboards. |

### Jar geometry & bounds

The jar is a vertical cylinder. `TANK`/`BOUNDS` become `JAR`/radial bounds:

```js
// constants (pack data): a storybook half-gallon jar, stylized scale in cm
export const JAR = {
  R: 24,          // interior radius (world x/z)
  H: 60,          // interior height
  FLOOR_H: 4,     // grass/leaf floor thickness
  RIM_Y: 58,      // where the glass mouth / lid sits
  GLASS_T: 1.0,
};
// Cylindrical bounds: clamp by radius, not min/max box.
export const JAR_BOUNDS = {
  R: JAR.R - 3,             // soft radial wall for the fliers
  minY: JAR.FLOOR_H + 1,
  maxY: JAR.RIM_Y - 4,      // fireflies pool under the lid — a real behavior
};
```

Wall avoidance changes from the box test in `Swarm._avoidWalls` to a radial
one: `const r = Math.hypot(pos.x, pos.z); if (r > R) steer inward along -[x,z]`.
This is the **only** engine-geometry change the pack needs; ~15 lines behind a
`boundsShape: 'cylinder'` flag on the pack manifest (the aquarium/terrarium keep
`'box'`). The glass cylinder itself is one `CylinderGeometry(R,R,H, 40,1, true)`
with `openEnded:true`, a faint transparent glass `MeshStandardMaterial`
(opacity ~0.10, high transmission look via low roughness) — one draw call.

Theme entry (`WATER_THEMES` sibling; becomes per-pack `themes` after the split):

```js
jar: {
  fogColor: 0x05070d, fogDensity: 0.0016,   // near-black night air, thin fog
  deep: 0x05070d, tint: 0x101828,
  lightColor: 0x9db4e0, lightIntensity: 220, // dim ambient moonlight only
  ambient: 0x0a0e18,
  moss: 0x2e3a1e, soil: 0x1c1710,
  glow: 0xffe64a,                            // default lantern tint (per-species overrides)
}
```

`setDay(df)` does the night-only reveal: by day (`df→1`) the ambient light
comes up to a soft daylight, glows are forced off, bugs sit still in the grass;
at dusk/night (`df→0`) ambient drops toward black and the blink system runs.

## 2. Care model mapping (reuse `CareSim` in `src/sim.js`)

`CareSim._decay()` runs unchanged; meters get relabeled per the engine-split
config. Firefly-jar care is deliberately gentle — **the jar's real tension is
time-in-captivity, not filth** (see §6 + the catch-and-release DECISION). Two
core meters plus a per-bug "nights held" counter.

| Aquarium meter | Firefly-jar meter | Mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Air & Dew** (freshness of the jar) | A closed jar goes stale and dries out. Decays toward 0 at `AIR_DECAY_DAYS` ≈ **1.0** — the fastest-decaying quality meter in any pack, on purpose: it nudges you to open the lid / release. `waterChange()` → **`freshenJar()`** (open lid + add a dewy grass blade), +0.6. Below `SICK_THRESHOLD` the same health-drain path as the aquarium runs, but slowly (`STARVE_DAYS`-scale, not minutes). |
| `tank.algae` (0→1) | **Condensation on glass** | Identical mechanic, cosmetic. Warm bugs in a sealed jar fog the inside of the glass; grows at an `ALGAE_DAYS`-style rate, dims the glows behind it (nice: your light show gets hazy if you neglect it). The existing wipe gesture (`sim.scrubAlgae(0.015)` per pointermove + sparkles in `main.js`) works unchanged — render as a front-facing fog overlay on the cylinder. |
| hunger per fish | **Faint** (energy) | Reuse `f.hunger` verbatim but relabel to "energy." Adult fireflies barely eat (many don't eat at all — a real, kid-true fact), so `HUNGER_HOURS` is long (**≈ 40**) and feeding is optional flavor, not a fail state. Crickets/glow-worm do eat (see foods). Low energy dims a firefly's flash (glow intensity scales by `0.4 + 0.6*health`), it doesn't kill quickly. |
| — (new, per bug) | **Nights held** (`f.nights`) | Increment each real dawn a bug is still in the jar. Drives the release loop and, depending on the DECISION below, drives a gentle glow-dimming / weakening. Stored on the fish record; free. |
| Rotting-food pollution | Uneaten crumbs | Same as terrarium: uneaten food (cricket crumbs, leftover greens) doesn't really pollute a jar — it just sits and is cleaned up. Tiny `UNEATEN_POLLUTION`. |
| Offline decay | Identical | `applyOffline()` loops the jar exactly as it loops `['fresh','salt']` today. Crucially, **offline time advances `nights held`** — leave for the weekend and your fireflies have spent three nights in the jar (see §6). |

`rules.js` `evaluateAdd()` runs **unchanged**. Bioload = jar air space (small
capacity, `bioload: ~14`, `maxAgents: ~18`). The `predator` flag marks the
femme-fatale firefly and the glow-worm (whose larvae really do hunt snails), and
drives the **shop warning** at purchase, same path as the aquarium's "your oscar
could eat this." **Important — the femme-fatale hunt does NOT go through
`canEat`.** A Photuris female (1.6 cm) versus a Photinus (1.3 cm) is a 0.42 size
ratio (`src/rules.js:86`) that fails the eat test and always will for two
similar-sized fireflies, so `canEat` can never fire it. The mimic-hunt is instead
a **scripted surprise-event predation** (see §4b/§6): explicitly exempt from
`canEat`, triggered by the mimic state machine, with on-screen presentation
governed by the game-wide Nature-scenes toggle. `water !== current` blocks jar
bugs from the fish tank and vice-versa. `soloOnly` tags the femme-fatale and moths
(they don't need groups). `finNipper`/`longFins` stay `false` everywhere — schema
and rules stay identical.

## 3. Foods (`FOODS` sibling, same field shape)

Feeding is light here — most of the cast is heard/glowing, not gorging. The
column format matches the aquarium/terrarium foods table. `floatTime`/
`sinkSpeed` semantics become `driftTime`/`settleSpeed` inside the jar food
system (a `behavior: 'static'|'drip'` strategy per the ENGINE_SPLIT food plan).

Per the DECISION below, **adult fireflies and moths don't eat on screen** — the
eaters are the crickets and the glow-worm. `nectar` and `dewdrop` as *foods* are
cut (dew survives only as the `freshenJar()` restore visual, not a food item).

| id | name | emoji | eaten by | behavior when dropped |
|---|---|---|---|---|
| `pollen` | Pollen & Petals | 🌼 | crickets | small static tuft on the grass floor; part of the tree cricket's real diet |
| `greens` | Clover & Leaf | 🍃 | crickets, katydid | static on the floor; the cricket's real diet |
| `aphid` | Aphids | 🐛 | glow-worm, cricket | tiny crawling mini-agent on the floor (reuses the terrarium cricket-as-mini-agent idea, `crawl` arc); prey-seeking via `food.nearestFor` |

> **DECIDED (John, 2026-07-09):** adult fireflies don't eat on screen — truthful,
> since many adult fireflies barely feed or not at all. The eaters are the
> crickets (greens/pollen/aphid) and the glow-worm (aphid). The optional
> dew/nectar firefly foods are **cut**; dew remains only as the `freshenJar()`
> care visual. Rationale: keeps the jar honest and the food system tiny, and it
> makes the crickets the reason foods exist at all.

## 4. Locomotion — mapping to existing systems

| Mode | Species | Implementation |
|---|---|---|
| **`flutter`** (small new) | all flying fireflies, moths | New drift-flight steering, ~90 lines (below); the canonical `flutter` locomotion module (shared with butterflies/moths). Not boids-heavy — a firefly meanders alone. Moths add **phototaxis** (steer toward the brightest glow / the moon prop) — a genuinely charming, true behavior for almost no code. |
| **`crawl`** (exists) | glow-worm (flightless female), crickets, katydid, grounded fireflies | `crawl`-module path verbatim on the **floor surface only** (`SURFACES.floor`), plus the twig as a perch. Crickets are *heard, rarely seen* — they mostly sit in the grass (long `_restLogic` rest episodes) and chirp (audio). |
| **rest / perch** (a *state*, not a locomotion value) | moths (between flights), fireflies at rest | Perch/rest is a behavioral **state** reachable from `flutter` (or `crawl`), NOT its own locomotion mode — a moth's `locomotion` stays `flutter`. Reuse the pleco glass-sit / `_restLogic` path: a moth flutters, then enters a long rest state clinging to the glass or twig, wings slowly fanning (`invertbuilder` sway). Cheap and true — a moth on the jar wall is half the charm. |

Day/night drives all of it through `Swarm.nightFactor` exactly as today: by day
everything is in a deep rest state (crickets silent, fireflies dark and still in
the grass); at dusk the fliers take off and the blink system wakes. Fireflies
also **pool near the lid at night** (`maxY` bias) — a real behavior and a pretty
one.

### 4a. Drift-flight (the one new movement mode)

A firefly's flight is slow, hovering, and near weightless — not a boid school
and not a ballistic hop. Steering per frame:

- **Buoyant hover**: target Y drifts slowly toward a per-bug band (fireflies
  mid-to-upper, moths anywhere); gravity is near zero. `vel` damped hard
  (`*0.90/frame`) so motion is floaty, not darty.
- **Meander**: low-frequency wander (`sin(wander*0.4)`) at ~30% of the
  aquarium's, so a firefly ambles.
- **Flight path** modifier keyed by `flash.path` — this is what makes each
  species *recognizable in the air*, before it even blinks:
  - `'J'` (Photinus pyralis): during the **charge→flash** window, arc upward in
    a short J-swoop; flash fires at the top of the hook. The classic "checkmark
    of light."
  - `'hover'`: bob nearly in place (glow-worm-adjacent fliers, synchronous
    species holding station).
  - `'drift'`: slow horizontal glide (blue ghost floats low and level).
- **Phototaxis** (moths only): add a steering vector toward the brightest active
  glow in the jar (sample the fireflies + moon prop). Moths circling a firefly's
  light = free, real, and magical.
- **Startle**: `startleNear()` reaches fliers already — a tap scatters them
  upward/outward briefly, then they settle. Never violent.
- **Radial wall**: the cylinder bound from §1 keeps them off the glass.

### 4b. The blink/glow system (the actual new tech — state machine + shader)

This is the pack's reason to exist and the **collection-book hook: you identify
a firefly by its flash pattern, not its body.** Two parts.

**(i) Glow shader — emissive pulse.** Each luminous bug carries a `lantern`: a
small sphere on the abdomen with an additive, unlit material, plus a billboard
halo sprite. One shared shader, one uniform per instance:

```glsl
// lantern fragment — additive, depthWrite:false, no postprocessing bloom needed
uniform vec3 uColor;      // species flash color
uniform float uGlow;      // 0..1 current brightness from the blink state machine
varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5);
  float core = smoothstep(0.5, 0.0, d);          // soft round falloff
  gl_FragColor = vec4(uColor * (0.3 + 1.7*uGlow), core * uGlow);
}
```

Fake bloom cheaply: the billboard halo is 3–4× the lantern radius at low alpha,
scaled by `uGlow`. A dozen of these additive sprites on a black background read
as real glow with **zero render targets** — the whole reason this is the cheap
habitat. Optionally raise `PointLight` on only the 1–2 brightest lanterns per
frame (budget: ≤2 dynamic lights) so a nearby grass blade catches the light.

**(ii) Blink state machine — drives `uGlow` per bug.** Each species is a
different clock. States:

`dark → charge → flash → afterglow → dark`

- **dark**: `uGlow = 0`. Hold for `flash.gapMs` (± jitter). Between-flash
  darkness is as diagnostic as the flash itself.
- **charge** (~80 ms): `uGlow` ramps 0→1 (ease-in). For `path:'J'`, the flight
  arc begins here.
- **flash** (`flash.flashMs`, e.g. 350 ms): `uGlow` held high, then eased down.
  If `flash.count > 1` (a *train* — carolinus does 5–8), loop charge→flash
  `count` times with short internal gaps before the long `gapMs` dark.
- **afterglow** (~120 ms): `uGlow` decays to 0 (phosphor tail — real).

Per-species tuning lives on the spec (see §5 `flash`). Modes:

| `flash.mode` | Look | Example |
|---|---|---|
| `jSwoop` | single flash at top of a rising J | Photinus pyralis |
| `train` | 5–8 quick flashes, then long synchronized dark | Photinus carolinus |
| `glow` | steady on, no blinking (`uGlow` ~constant, slow breathe) | glow-worm, blue ghost |
| `flicker` | rapid amber shimmer while flying | Pyractomena-type (future) |
| `mimic` | copies a nearby male's pattern, then goes predatory | Photuris femme-fatale |
| `none` | no light (moths, crickets) | Rosy maple moth, crickets |

**Synchronization (the showpiece).** For `train` species with
`flash.coupling > 0`, add one float per bug — a phase `θ` advancing at the
species' natural rate. When any same-species neighbor enters `flash`, nudge
this bug's `θ` toward it: `θ += coupling * sin(θ_neighbor - θ) * dt`
(a one-line Kuramoto coupling). With `coupling ≈ 0.9`, a group of *Photinus
carolinus* falls into unison within ~15–20 s of dusk — the Smoky-Mountain
"whole hillside breathing" effect, emergent from one line of math. With
`coupling = 0` (pyralis and most others) they blink independently. Cost: O(n²)
over same-species pairs, but n ≤ ~12 fireflies — trivial. This coupling constant
is the single most magical dial in the pack.

**Mimic (femme-fatale).** A `mimic` female runs a *copy* of a target species'
pattern to lure a male, then switches to hunting. This predation **cannot** run
through `canEat` — a 1.6 cm Photuris vs a 1.3 cm Photinus is a 0.42 size ratio
(`src/rules.js:86`) that fails the eat test and always will for similar-sized
fireflies. So the hunt is a **scripted surprise event** instead: the mimic beat
plays out (copy → lure → close), then a scripted capture runs a matter-of-fact
scale-down catch (`Swarm._devour`-style), **explicitly exempt from `canEat`**. It
is a rare surprise (§6), and whether it's shown on-screen or resolved as an
off-screen "she caught a meal last night" beat is governed by the game-wide
Nature-scenes toggle (§6 DECIDED), not by any per-habitat flag.

## 5. Species plan

**Target roster size: 12–14** (this is the tiny habitat — a curated jar, not a
zoo). Fireflies are the stars; a couple of moths and crickets round it out, and
they are **heard or glimpsed more than watched** — that restraint *is* the mood.

Below are **8 flagship species fully authored** in the exact
`src/species/freshwater.js` schema. Deltas, applied consistently (mirrors the
Terrarium approach):

- `water: 'jar'`.
- `kind: 'bug'` — selects the builder (extended `invertbuilder.js`; fireflies =
  a small `beetle` archetype + lantern, moths = `moth` archetype, crickets =
  `cricket` archetype).
- `zone`: `'air' | 'floor' | 'perch'` (replaces top/mid/bottom).
- `locomotion`: canonical registry values only — `'flutter'` (all fliers: fireflies
  + moths) or `'crawl'` (glow-worm, crickets, katydid). Perch/rest is a behavioral
  **state**, not a locomotion value (see §4). No `flyer`/`crawler`/`rester` aliases.
- New `flash` (pack addition): the blink descriptor from §4b (the collection-book
  identity). Nonstandard field, declared here.
- New `sound` (pack addition, optional): chirp/song descriptor for the audio bed —
  the crickets are heard, not seen. Nonstandard field, declared here.
- New `edible` (pack addition, optional `boolean`): whether the bug can be eaten as
  prey in-jar (crickets `true`; fireflies/glow-worm/moths `false` — fireflies carry
  defensive lucibufagins). Nonstandard field, declared here.
- Everything else — identical fields and types. `colors` are true-to-life (dark
  elytra, reddish pronotum, yellow margins for fireflies); `flash.color` is the
  real light color.

```js
export const FIREFLYJAR_SPECIES = [
  {
    id: 'common_eastern_firefly', common: 'Common Eastern Firefly',
    scientific: 'Photinus pyralis',
    water: 'jar', kind: 'bug', adultSizeCm: 1.4, bioload: 1, minSchool: 4,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'air', locomotion: 'flutter',
    speed: 0.6, schooling: 'loose', diet: [], price: 8,
    archetype: 'firefly', size: 1.0,
    colors: { base: '#241d12', belly: '#f2d24a', fin: '#c85040',
      pattern: 'stripesH', patternColor: '#f0c840', patternScale: 1.2, iridescence: 0.15 },
    flash: { mode: 'jSwoop', color: '#ffe24a', flashMs: 350, gapMs: 5500,
      count: 1, coupling: 0, path: 'J' },
    habitat: 'Warm summer meadows and backyards across the eastern United States.',
    facts: [
      'The male flies in a swooping J-shape and lights up at the top, like drawing a checkmark of light.',
      'Fireflies are not flies at all — they are beetles, and their light makes almost no heat, so it never burns.',
      'A female waits in the grass and flashes back the exact right answer to say "here I am."'
    ],
    care: 'Easy'
  },
  {
    id: 'synchronous_firefly', common: 'Synchronous Firefly',
    scientific: 'Photinus carolinus',
    water: 'jar', kind: 'bug', adultSizeCm: 1.3, bioload: 1, minSchool: 5,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'air', locomotion: 'flutter',
    speed: 0.5, schooling: 'loose', diet: [], price: 14,
    archetype: 'firefly', size: 0.95,
    colors: { base: '#221b10', belly: '#e8e0a0', fin: '#c04838',
      pattern: 'stripesH', patternColor: '#e8d858', patternScale: 1.1, iridescence: 0.12 },
    flash: { mode: 'train', color: '#e6ff86', flashMs: 220, gapMs: 8000,
      count: 6, coupling: 0.9, path: 'hover' },
    habitat: 'A few old forests of the Great Smoky Mountains in the southeastern USA.',
    facts: [
      'In a few forests, thousands of them blink on and off all together, like the whole hillside is breathing light.',
      'They flash 5 to 8 times in a row, then everyone goes dark for about 8 seconds at the same moment.',
      'People camp out for just one week each summer to watch their light show.'
    ],
    care: 'Medium'
  },
  {
    id: 'blue_ghost_firefly', common: 'Blue Ghost Firefly',
    scientific: 'Phausis reticulata',
    water: 'jar', kind: 'bug', adultSizeCm: 0.8, bioload: 1, minSchool: 4,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'air', locomotion: 'flutter',
    speed: 0.4, schooling: 'loose', diet: [], price: 16,
    archetype: 'firefly', size: 0.8,
    colors: { base: '#2a2418', belly: '#c8d8f0', fin: '#8a7a4a',
      pattern: 'none', patternColor: '#c8d8f0', patternScale: 1.0, iridescence: 0.2 },
    flash: { mode: 'glow', color: '#bcd6ff', flashMs: 0, gapMs: 0,
      count: 1, coupling: 0, path: 'drift' },
    habitat: 'Damp Appalachian forest floors, glowing low among the leaves at night.',
    facts: [
      'Instead of blinking, it holds one long, steady glow that floats low through the trees like a tiny ghost.',
      'Its light looks blue-white, while most fireflies glow yellow-green.',
      'The female has no wings and glows on the ground like a little lit-up worm.'
    ],
    care: 'Medium'
  },
  {
    id: 'femme_fatale_firefly', common: 'Femme Fatale Firefly',
    scientific: 'Photuris versicolor',
    water: 'jar', kind: 'bug', adultSizeCm: 1.6, bioload: 1, minSchool: 1,
    temperament: 'aggressive', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'air', locomotion: 'flutter',
    speed: 0.7, schooling: 'solo', diet: [], price: 18,
    archetype: 'firefly', size: 1.1, edible: false,
    colors: { base: '#1e2216', belly: '#d8e88a', fin: '#a88838',
      pattern: 'stripesH', patternColor: '#c8e060', patternScale: 1.0, iridescence: 0.15 },
    flash: { mode: 'mimic', color: '#a8ff5a', flashMs: 300, gapMs: 5000,
      count: 1, coupling: 0, path: 'drift' },
    habitat: 'Meadow edges of the eastern USA, hunting other fireflies by night.',
    facts: [
      'The female can copy another firefly\'s flash to trick a male into coming close — then she eats him.',
      'Scientists call her the "femme fatale" firefly for this sneaky trick.',
      'She may eat other fireflies to steal chemicals that make her taste bad to hungry spiders.'
    ],
    care: 'Medium'
  },
  {
    id: 'common_glow_worm', common: 'Common Glow-worm',
    scientific: 'Lampyris noctiluca',
    water: 'jar', kind: 'bug', adultSizeCm: 2.5, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'floor', locomotion: 'crawl',
    speed: 0.25, schooling: 'solo', diet: ['aphid'], price: 12,
    archetype: 'glowworm', size: 1.0, edible: false,
    colors: { base: '#3a3222', belly: '#9dff6e', fin: '#5a4c30',
      pattern: 'none', patternColor: '#9dff6e', patternScale: 1.0, iridescence: 0.1 },
    flash: { mode: 'glow', color: '#9dff6e', flashMs: 0, gapMs: 0,
      count: 1, coupling: 0, path: 'ground' },
    habitat: 'Grassy banks and hedgerows across Europe and Asia.',
    facts: [
      'The glowing "worm" is really a female beetle with no wings, shining green to call flying males down to her.',
      'She can glow steadily from the tip of her tail for hours.',
      'Her babies glow too, and they hunt snails much bigger than themselves.'
    ],
    care: 'Easy'
  },
  {
    id: 'rosy_maple_moth', common: 'Rosy Maple Moth',
    scientific: 'Dryocampa rubicunda',
    water: 'jar', kind: 'bug', adultSizeCm: 3.5, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'perch', locomotion: 'flutter',
    speed: 0.5, schooling: 'solo', diet: [], price: 15,
    archetype: 'moth', size: 1.1, shape: { finFlow: 1.1 },
    colors: { base: '#f4a6c6', belly: '#f6e05e', fin: '#ec8ab5',
      pattern: 'stripesV', patternColor: '#f6e05e', patternScale: 1.1, iridescence: 0.06 },
    flash: { mode: 'none', color: '#000000', flashMs: 0, gapMs: 0, count: 0, coupling: 0, path: 'hover' },
    sound: { song: 'silent', wingHz: 9 },
    habitat: 'Deciduous woods of eastern North America, flying only at night.',
    facts: [
      'It is painted in pink and yellow, like a little scoop of strawberry-and-lemon sherbet with wings.',
      'It is one of the smallest of the giant silk moths — small enough to perch on your thumbnail.',
      'The grown-up has no working mouth and never eats; it lives just a few nights, only long enough to find a mate.'
    ],
    care: 'Easy'
  },
  {
    id: 'snowy_tree_cricket', common: 'Snowy Tree Cricket',
    scientific: 'Oecanthus fultoni',
    water: 'jar', kind: 'bug', adultSizeCm: 1.5, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'floor', locomotion: 'crawl',
    speed: 0.4, schooling: 'solo', diet: ['greens', 'pollen'], price: 6,
    archetype: 'cricket', size: 0.8, edible: true,
    colors: { base: '#c8e0a0', belly: '#e0f0c8', fin: '#a0c078',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.05 },
    flash: { mode: 'none', color: '#000000', flashMs: 0, gapMs: 0, count: 0, coupling: 0, path: 'ground' },
    sound: { song: 'steadyTrill', chirpHz: 2.7, tempWithTemp: true },
    habitat: 'Trees and bushes across North America, singing on warm summer nights.',
    facts: [
      'It is called the "thermometer cricket" — count its chirps in 13 seconds and add 40 to get the temperature.',
      'The pale green male lifts his wings and rubs them together to sing.',
      'Its soft, steady chirp is the sound many people picture when they think of a summer night.'
    ],
    care: 'Easy'
  },
  {
    id: 'field_cricket', common: 'Field Cricket',
    scientific: 'Gryllus pennsylvanicus',
    water: 'jar', kind: 'bug', adultSizeCm: 2.5, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'floor', locomotion: 'crawl',
    speed: 0.5, schooling: 'solo', diet: ['greens', 'aphid'], price: 4,
    archetype: 'cricket', size: 1.0, edible: true,
    colors: { base: '#1c1712', belly: '#3a3026', fin: '#4a3a24',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    flash: { mode: 'none', color: '#000000', flashMs: 0, gapMs: 0, count: 0, coupling: 0, path: 'ground' },
    sound: { song: 'chirpPairs', chirpHz: 1.5 },
    habitat: 'Fields, lawns, and doorsteps across North America.',
    facts: [
      'Only the male chirps, scraping a rough edge on one wing against the other like a tiny fiddle.',
      'It hears with "ears" on its front legs, just below the knees.',
      'In some countries, a cricket in the house is thought to bring good luck.'
    ],
    care: 'Easy'
  },
];
```

**Fill-out roster (authored when the pack is built, same schema):** a couple
more true fireflies (Big Dipper *Photinus marginellus*; amber *Pyractomena
angulata* — `flash.mode:'flicker'`), the **Common True Katydid** (*Pterophylla
camellifolia*, `sound` species, "Katy-did / Katy-didn't"), a small **Polyphemus
moth**, and a **grasshopper** or **lacewing**. Total ~12–14. No species that
needs new tech beyond `flutter`/`crawl` (+ the rest/perch state) + a `flash` or
`sound` descriptor.

## 6. Retention mechanics (all four, per HABITAT_VISION)

- **Care debt.** Air & Dew decays fastest of any pack (§2); offline decay +
  `nights held` accrual mean the jar genuinely needs you back by tomorrow
  night. But it is *calm* debt — dimmed glows and foggy glass, never a scream.
- **Growth & babies.** These are short-lived adults, so "growth" is reframed:
  fireflies **flash brighter and more confidently over their first nights** of
  good care (`f.growth` drives max `uGlow` and flash regularity — a juvenile's
  blink is faint and irregular, an adult's is crisp). Breeding is the classic
  loop made literal and educational: a male's correct flash + a female's answer
  flash (the real courtship) → **eggs laid in the grass floor → glowing larvae**
  (glow-worm-style crawlers) over real days. The larvae are their own
  collection entry.
- **Collection book — the flash-pattern hook.** This is the pack's signature.
  A species card unlocks not by owning the bug but by **correctly identifying it
  from its flash.** The book shows an animated flash-pattern strip (the same
  `uGlow` timeline as a little waveform/dot sequence) for each species; catching
  a firefly whose live blink matches confirms the ID and stamps the card with
  its real name, range, and 3 facts. "You caught a *Photinus carolinus* — the
  one that blinks in time with its friends." Gotta-identify, not gotta-hoard.
- **Surprises.** Night-only reveal is the base surprise: the daytime jar is
  quiet (bugs tucked in the grass, no light); the show only starts at dusk
  (`rawDayFactor()→0`), so *checking at night is rewarded*. Rarer beats: a
  femme-fatale's scripted mimic-and-hunt surprise event (presentation governed by
  the game-wide Nature-scenes toggle — see DECIDED below); a moth circling a
  firefly's glow; the synchronous flock snapping into unison for the first time;
  a glowing larva appearing in the grass after a courtship.

> **DECIDED (John, 2026-07-09): catch-and-release is a matter-of-fact lifecycle,
> with NO guilt machinery.** Keep-with-care works — a well-kept jar (`freshenJar()`
> each night) holds bugs fine; **release exists as a simple action** — tap "open
> the lid," the firefly rises out and flies off into the dark with a small
> send-off. No weakening-as-punishment, no loss-shaming, no "you killed it"
> beat. Fireflies have short real lives and natural death is shown **honestly and
> plainly, exactly like everywhere else in the game** — not dramatized. Rationale
> (John): fireflies dying is trivial; don't over-engineer values or guilt
> mechanics around release. Release still gives a small reward + book stamp, but
> it is offered, never coerced.

> **DECIDED (John, 2026-07-09): femme-fatale predation is governed by the
> game-wide Nature-scenes parent toggle** (default = shown, matter-of-fact, no
> gore; alternative = resolved as an off-screen "she caught a meal last night"
> event). The hunt runs as the **scripted surprise event** from §2/§4b — exempt
> from `canEat`, never through the size-ratio path. Rationale: the
> Nature-scenes law is now global (ROADMAP 2026-07-09) — one parent setting
> governs ALL on-screen predation in every habitat, so per-habitat predation
> flags are superseded and the femme-fatale simply obeys it.

> **DECIDED (John, 2026-07-09): the daytime jar is a quiet, daylit jar** — bugs
> hidden/resting in the grass, crickets silent, **care actions available** (freshen
> air, watch a cricket, wipe condensation). **No locked screen.** The show starts
> at dusk on the real clock (`rawDayFactor()→0`). Rationale: a calm daytime care
> window beats a locked door, and saving the light show for dusk is what makes
> checking at night rewarding.

## 7. Performance budget — S24-class, 60fps (the cheapest habitat)

Designed to be the lightest pack in the lineup. A near-black scene with a
handful of tiny additive glows is close to free.

| System | Budget | Approach |
|---|---|---|
| Agents | **≤ 18 total** (≤ ~12 fireflies + a few moths/crickets) | Tiny cast by design. Each is a small `invertbuilder` group; full per-frame AI is affordable at this count. |
| Glass jar | **1 draw call** | One open-ended `CylinderGeometry`, transparent standard material. No inner walls, no back box. |
| Floor + decor | **~3–4 draw calls** | One `CircleGeometry` floor + a few billboard grass/twig sprites (shared material, alpha-cut). |
| Glows | **1 additive sprite + 1 halo per luminous bug (~12–14 sprites)** | No postprocessing / no bloom render target. Additive billboards on black = the effect. Optional: ≤ **2** dynamic `PointLight`s on the brightest lanterns only. |
| Blink/sync sim | **1 float per bug, O(n²) same-species coupling** | n ≤ 12 → dozens of `sin()` per frame. Negligible. |
| Motes / moonbeam | **1 `Points` cloud + ≤1 additive plane** | Reused from `tank.js`, low opacity; moonbeam cut in MVP. |
| Fill rate | **the real win** | Scene is mostly black → few lit pixels → tiny GPU fragment load. This is why it undercuts every other habitat. |
| Audio | 2–3 looped/one-shot synth voices | Cricket trills + occasional chirp from `audio.js` synth; the crickets are *heard*, so audio carries mood cheaply. |

No shadows, no water shader, no caustics, no substrate displacement grid. Target
draw calls: **< 15 total.** Comfortably inside the 42-fish aquarium's budget,
with headroom to spare.

## 8. MVP cut — 4 species, minimum systems

| Species | Locomotion | Why |
|---|---|---|
| Common Eastern Firefly | `flutter` (new) | THE backyard firefly; proves `flutter` + single-flash + the J-swoop |
| Synchronous Firefly | `flutter` | proves the sync coupling — the showpiece; do it early to de-risk |
| Common Glow-worm | `crawl` (exists) | steady-glow mode + a floor bug, zero new movement code |
| Field Cricket | `crawl` (exists) | the *heard-not-seen* audio mood, cheapest starter |

Systems in MVP: jar environment builder (cylinder + radial bounds + grass
floor + lid prop), **glow shader + blink state machine** (`jSwoop`, `train`
with coupling, `glow`), drift-flight locomotion, Air & Dew + condensation
meters, the **night-only day/night reveal**, foods deferred (adult bugs don't
feed; crickets/glow-worm eat greens/aphid when foods ship),
`invertbuilder` archetypes `firefly` + `glowworm` + `cricket`, cricket audio
voice, and the **catch-and-release action per John's DECISION** (matter-of-fact
lifecycle, no guilt machinery — see §6).

Deferred to v2: moths (`flutter` + rest/perch state + phototaxis), the
femme-fatale scripted mimic-hunt surprise event, the flash-pattern
**identification** collection UI (MVP just stamps the card on catch; the
guess-the-species game is v2), courtship→glowing-larvae breeding, `flicker` amber
fireflies, katydid, moonbeam + moonlight pool, pollen
foods.
