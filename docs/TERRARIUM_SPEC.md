# Terrarium — Habitat Pack Spec

The cheap second habitat. Goal: ship reptiles/amphibians/bugs with **maximum
reuse** of the aquarium engine. Everything here maps to an existing module;
new code is one locomotion mode (hop), one environment builder, and one
species-visual builder.

---

## 1. Enclosure rendering (reuse `src/tank.js` pattern)

`buildTerrarium(scene, renderer)` returns the same handle shape as
`buildTank()`: `{ group, setTheme(type), setDay(df), update(t) }` so
`main.js` swaps it in without touching the frame loop.

| Aquarium element (`tank.js`) | Terrarium equivalent | Notes |
|---|---|---|
| Sand bed (`PlaneGeometry` + dune noise) | Soil/coco-fiber bed | Same displaced plane; theme colors `soil`/`soilDark` replace `sand`/`sandDark`. Add scattered leaf-litter sprites. |
| Back wall (`BackSide` box) | Cork-bark background | Same dark box + a bumpy plane in front (noise-displaced, bark color). Climbing surface visually. |
| Water surface plane | **None** (dry) | Skip. Small water dish instead: shallow cylinder + tiny reflective disc reusing `surfMat` ripple `onBeforeCompile`. |
| Caustics shader on sand | **Heat-lamp glow + basking spot** | Reuse the caustics quad slot: a radial-gradient ShaderMaterial disc under the lamp, warm color `#ffb060`, intensity follows `day` uniform. One `SpotLight` from top corner = the lamp. |
| `buildShafts()` sun shafts | Keep, warmer tint | Dry-air dust shafts read great; change color to `vec3(1.0,0.9,0.75)`. |
| `buildBubbles()` airstone | **Misting burst** | Same `Points` system, inverted: particles spawn at top on `mist()` call, fall with drift, fade. Idle count 0 (bubbles are always-on; mist is event-driven). |
| `buildMotes()` marine snow | Dust motes | Keep as-is, lower opacity, drift sideways not up. |
| Glass frame (`addFrame`) | Identical | Same `TANK` dims work: a 120g footprint is a legit 4-ft vivarium. Keep `TANK`/`BOUNDS` constants. |
| Decor (`buildDecor` in `main.js`) | Plants + branches + hide | Rocks reuse verbatim. Plant blades reuse with broader leaves. New: 2–3 branches (bent `TubeGeometry` from floor to upper third) — these are climb targets — plus a half-log hide (half `CylinderGeometry`). |

Theme entry (`WATER_THEMES` sibling — becomes per-pack `themes` after the
engine split):

```js
terra: {
  fogColor: 0x2a2418, fogDensity: 0.0012,   // dry air: much thinner fog
  deep: 0x1a140c, tint: 0x6b5a3a,
  lightColor: 0xffd9a0, lightIntensity: 1500,
  ambient: 0x4a4034,
  soil: 0x4a3520, soilDark: 0x2e2012,
  bask: 0xffb060,
}
```

## 2. Care model mapping (reuse `CareSim` in `src/sim.js`)

`CareSim._decay()` already does everything; the meters just get relabeled and
one meter is added. Per the engine split, meters become pack config; until
then, semantic mapping:

| Aquarium meter | Terrarium meter | Mechanics |
|---|---|---|
| `tank.water` (quality 1→0) | **Humidity** | Decays toward 0 at `HUMIDITY_DECAY_DAYS` (≈1.5 — faster than water's 9, misting is the daily ritual). `waterChange()` → `mist()`, +0.55 same as now. Species have a comfort band (`humidity` field); outside it, same health drain path as `t.water < SICK_THRESHOLD`. |
| `tank.algae` (0→1) | **Dirty glass + substrate** | Identical: poop smudges/dust on the panes grow at `ALGAE_DAYS`-style rate; the existing wipe gesture in `main.js` (`sim.scrubAlgae(0.015)` per pointermove + sparkles) works unchanged. Render as the same front-pane grime overlay. |
| — (new) | **Temperature** | New meter `tank.temp` (0 cold → 1 hot, 0.5 ideal). Driven by the day/night factor already computed in `main.js` (`df`): drifts toward `0.35 + 0.45*df` naturally; the heat lamp (a toggle tool, small coin cost/day) pins daytime temp up and creates the basking spot. Cold-blooded rule: low temp doesn't hurt directly, it **slows** everything — multiply agent `activity` and `hunger` accrual by temp factor. Sustained temp < 0.25 with hunger > 0.85 drains health. |
| Rotting food pollution | Uneaten crickets | Uneaten feeder insects don't pollute — they **hide** (despawn into "loose in the tank" count) and reappear at night. Cute + true. Escaped-feeder count > 5 dings humidity/cleanliness slightly. |
| Offline decay | Identical | `applyOffline()` loops habitats exactly as it loops `['fresh','salt']` today. |

Foods (`FOODS` sibling, same field shape — `floatTime`/`sinkSpeed` become
`hopTime`/`crawlSpeed` semantics inside the terrarium food system):

| id | name | emoji | eaten by | behavior when dropped |
|---|---|---|---|---|
| `cricket` | Crickets | 🦗 | most herps, mantises, tarantulas | hops around floor (mini-agent, reuses hop arc); prey-seeking works via existing `food.nearestFor` |
| `worm` | Mealworms | 🪱 | geckos, beardie, frogs, beetle | wiggles in place on floor |
| `fruitfly` | Fruit Flies | 🪰 | dart frogs, mantises | drifting particle cloud near drop point |
| `veggie` | Greens & Veg | 🥬 | beardie, tortoise, sticks, isopods, roach, millipede | static, sits until eaten |
| `fruit` | Fruit Mash | 🍌 | crested gecko, hisser, isopods | static dish |
| `mouse` | Frozen Mouse | 🍖 | snakes only | placed with tongs; snake slow-approach + strike; **design decision for John** — see note |

> **Note for John:** snakes eating mice is the one content-rating question in
> this pack. Options: (a) show it — it's nature, handled matter-of-factly like
> the existing predator/prey eating in `Swarm._devour`; (b) "feeding day"
> happens as an offline event ("Noodle ate today, she's sleepy"). Spec assumes
> (a) with no gore — swallow animation is a scale-down, same as fish.

`rules.js` `evaluateAdd()` runs **unchanged**: bioload = enclosure space,
`soloOnly` tag covers tarantulas/mantises/chameleons/ball python, predator
size rule (`canEat`, 0.42 ratio) covers "mantis will eat your isopods",
`water !== current` check blocks terra species in fish tanks (and the
axolotl in the terrarium). `finNipper`/`longFins` stay `false` everywhere —
kept so the schema and rules stay identical.

## 3. Locomotion — mapping to existing systems in `src/behavior.js`

| Mode | Species | Implementation |
|---|---|---|
| **Crawler** (exists) | tortoise, beardie, tarantulas, scorpion, isopods, millipede, roach, beetle, salamander, hermit crab | `Agent.crawler` path verbatim: `_animateCrawler` + `_pickCrawlTarget` + `CRAWL_SPEED`-style per-archetype speeds. Floor surface only. |
| **Climber** (exists) | crested gecko, pinktoe tarantula, mantises, stick insects, hisser | The snail/star `climber` flag: `_switchSurface()` walking between `SURFACES.floor/front/back/left/right`. This is the terrarium's hero moment — a gecko stuck to the front glass showing its belly. Add `back` bias (cork wall) and branch perching (see below). |
| **Branch perch** (small new) | arboreal climbers + tree frogs | Branches from `buildDecor` register as extra pseudo-surfaces: a polyline of points; a perched agent lerps along it. Implementation: each branch exposes `{points[], tangents[]}`; treat "branch" as a 6th SURFACES-like entry where `pin` = snap-to-nearest-curve-point. ~60 lines. |
| **Serpent** (exists, repurposed) | ball python, corn snake | The `eel` archetype in `fishbuilder.js` `PROFILES` already does a travelling-wave body (`aT` vertex wave). Ground snake = eel agent with: `pos.y` pinned to `FLOOR_Y` like a crawler, vertical wave component zeroed, wave axis flipped to lateral (z in local space), `cruise` low (0.6), long rest episodes via `_restLogic` (snakes are furniture 90% of the time — that's accurate AND cheap). Corn snake also gets `climber`-style branch access. |
| **Hopper** (NEW — spec below) | tree frogs, dart frogs, pacman, fire-bellied toad | New state machine, ~120 lines. |
| **Swimmer** (exists) | axolotl only | Crossover species: it is literally an aquarium agent (`water:'fresh'`, zone `bottom`) — sold in the terrarium shop tab as a tease, lives in the fish tank. Zero new code. |

### Hop locomotion spec (the one new movement mode)

States: `idle → windup → airborne → land → idle`.

- **idle**: sit still, breathing scale pulse (`invertbuilder`-style sway on
  throat), blink. Duration 1.5–8 s, shortened by hunger and by nearby food
  (reuse `this.food.nearestFor` targeting from `_animateCrawler`).
- **windup** (0.12 s): squash — `obj.scale.y *= 0.75`, aim yaw at target.
- **airborne**: ballistic. Pick target point ≤ 18 cm away on current surface
  (or a branch/wall point for tree frogs — they may land on `SURFACES.front`
  and stick, reusing the climber glue). Launch angle θ = 55–70°, gravity
  `G = 350` cm/s² (tuned punchy, not realistic 981 — reads better at tank
  scale), `v0 = sqrt(G·d / sin(2θ))`. Integrate
  `pos += vel*dt; vel.y -= G*dt`. Orient nose along velocity. No steering
  mid-air (real frogs can't either).
- **land** (0.15 s): stretch then settle (`scale.y` 1.15 → 1.0), tiny dust
  puff (reuse mist particles). If landed within 2.4 cm of food →
  `food.eat` + `sim.feed`, same as fish.
- **startle**: `startleNear()` already reaches all agents — a startled hopper
  immediately windups away from the tap point (map `a.startle` to hop
  direction like the crawler's `scuttleFrom`).
- Pacman frog variant: `zone:'burrow'` — sits buried (y sunk 1 cm, eyes out),
  never wanders; hops ONLY as an ambush strike when food/prey comes within
  10 cm. Predator flag on; `canEat` lets it eat smaller frogs — real, and
  `rules.js` already warns the kid at purchase.

Day/night: `Swarm.nightFactor` drives everything as today — leopard gecko,
tarantulas, scorpion, hisser tagged `nocturnal` (existing tag, existing
`activity` math). Diurnal beardie/tortoise sleep in the hide at night
(existing `_restLogic` rest path, target = hide position instead of sand).

## 4. Species list (30)

Exact `src/species/freshwater.js` schema. Deltas, applied consistently:

- `water: 'terra'` (axolotl stays `'fresh'` — crossover, see above).
- `zone`: `'ground' | 'arboreal' | 'burrow'` (replaces mid/top/bottom;
  `zoneY()` in behavior.js maps arboreal→upper third/branches).
- `kind`: `'herp' | 'bug'` — selects the builder (herpbuilder / extended
  invertbuilder) the way `kind:'invert'` selects `buildInvert` today.
- New `locomotion`: `'crawler' | 'climber' | 'serpent' | 'hopper' | 'swimmer'`
  (aquarium infers this from kind/archetype; terrarium declares it).
- New `humidity`: 0–1 comfort center for the humidity meter.
- `diet` uses terrarium food ids. Everything else — identical fields,
  identical types. `colors` hexes are true-to-life.

```js
export const TERRARIUM_SPECIES = [
  {
    id: 'leopard_gecko', common: 'Leopard Gecko', scientific: 'Eublepharis macularius',
    water: 'terra', kind: 'herp', adultSizeCm: 22, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'ground', locomotion: 'crawler', humidity: 0.3,
    speed: 0.6, schooling: 'none', diet: ['cricket', 'worm'], price: 45,
    archetype: 'gecko', size: 1.0,
    colors: { base: '#e8c04a', belly: '#f5ead0', fin: '#c89838',
      pattern: 'spots', patternColor: '#3a2a14', patternScale: 1.2, iridescence: 0.1 },
    habitat: 'Rocky, dry grasslands and deserts of Afghanistan, Pakistan, and India.',
    facts: [
      'It stores food in its fat, carrot-shaped tail — like a lunchbox it carries everywhere.',
      'Unlike most geckos it has real eyelids, so it can wink and blink at you.',
      'If a predator grabs its tail, the tail pops off and wiggles — and a new one grows back.'
    ],
    care: 'Easy'
  },
  {
    id: 'crested_gecko', common: 'Crested Gecko', scientific: 'Correlophus ciliatus',
    water: 'terra', kind: 'herp', adultSizeCm: 20, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'arboreal', locomotion: 'climber', humidity: 0.7,
    speed: 0.8, schooling: 'none', diet: ['fruit', 'cricket'], price: 50,
    archetype: 'gecko', size: 0.95, shape: { height: 1.0, finFlow: 1.0 },
    colors: { base: '#c4924a', belly: '#e0c898', fin: '#8a5a2a',
      pattern: 'patches', patternColor: '#6b4520', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Rainforest treetops of New Caledonia, a group of islands near Australia.',
    facts: [
      'Scientists thought it was extinct for 100 years — then it was found again in 1994!',
      'Its toes have millions of tiny hairs that let it walk straight up glass.',
      'It has no eyelids, so it licks its own eyeballs to keep them clean.'
    ],
    care: 'Easy'
  },
  {
    id: 'ball_python', common: 'Ball Python', scientific: 'Python regius',
    water: 'terra', kind: 'herp', adultSizeCm: 120, bioload: 10, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'ground', locomotion: 'serpent', humidity: 0.55,
    speed: 0.4, schooling: 'none', diet: ['mouse'], price: 90,
    archetype: 'snake', size: 1.4,
    colors: { base: '#6b4e2a', belly: '#d8cba8', fin: '#4a3418',
      pattern: 'patches', patternColor: '#d8b464', patternScale: 1.4, iridescence: 0.25 },
    habitat: 'Grasslands and open forests of West and Central Africa.',
    facts: [
      'When it feels shy, it curls into a tight ball and hides its head in the middle.',
      'Heat-sensing pits on its lips let it "see" the warmth of animals in the dark.',
      'It only needs to eat about once a week — then it naps to digest, like after a big dinner.'
    ],
    care: 'Easy'
  },
  {
    id: 'corn_snake', common: 'Corn Snake', scientific: 'Pantherophis guttatus',
    water: 'terra', kind: 'herp', adultSizeCm: 120, bioload: 8, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'ground', locomotion: 'serpent', humidity: 0.45,
    speed: 0.7, schooling: 'none', diet: ['mouse'], price: 60,
    archetype: 'snake', size: 1.2,
    colors: { base: '#d8703a', belly: '#e8dcc0', fin: '#b03020',
      pattern: 'patches', patternColor: '#b03020', patternScale: 1.6, iridescence: 0.2 },
    habitat: 'Forests, fields, and old barns of the southeastern United States.',
    facts: [
      'Its belly is checkered like corn kernels — that may be how it got its name.',
      'It is a fantastic climber and explorer that can slither straight up a tree trunk.',
      'Corn snakes are gentle and curious — many learn to recognize the person who feeds them.'
    ],
    care: 'Easy'
  },
  {
    id: 'bearded_dragon', common: 'Bearded Dragon', scientific: 'Pogona vitticeps',
    water: 'terra', kind: 'herp', adultSizeCm: 50, bioload: 8, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly', 'basker'], zone: 'ground', locomotion: 'crawler', humidity: 0.25,
    speed: 0.8, schooling: 'none', diet: ['cricket', 'veggie', 'worm'], price: 70,
    archetype: 'lizard', size: 1.2,
    colors: { base: '#c8a05a', belly: '#e8d8b8', fin: '#a87838',
      pattern: 'stripesH', patternColor: '#8a6030', patternScale: 1.2, iridescence: 0.05 },
    habitat: 'Hot, dry deserts and scrublands of central Australia.',
    facts: [
      'It waves one arm in slow circles to say "hello, I see you" to other dragons.',
      'When excited or grumpy, its spiky chin "beard" puffs up and turns black.',
      'It has a tiny third eye on top of its head that senses light and shadows from above.'
    ],
    care: 'Moderate'
  },
  {
    id: 'veiled_chameleon', common: 'Veiled Chameleon', scientific: 'Chamaeleo calyptratus',
    water: 'terra', kind: 'herp', adultSizeCm: 45, bioload: 6, minSchool: 1,
    temperament: 'shy', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly', 'expertDiet'], zone: 'arboreal', locomotion: 'climber', humidity: 0.6,
    speed: 0.25, schooling: 'none', diet: ['cricket', 'worm'], price: 110,
    archetype: 'chameleon', size: 1.1,
    colors: { base: '#5aa832', belly: '#a8d878', fin: '#3a7820',
      pattern: 'stripesV', patternColor: '#d8e04a', patternScale: 1.3, iridescence: 0.15 },
    habitat: 'Mountain valleys and coastal plains of Yemen and Saudi Arabia.',
    facts: [
      'Each eye moves on its own, so it can watch a bug ahead and you behind at the same time.',
      'Its sticky tongue shoots out longer than its whole body in a fraction of a second.',
      'It changes color to show its mood — bright when happy, dark stripes when annoyed.'
    ],
    care: 'Expert'
  },
  {
    id: 'whites_tree_frog', common: "White's Tree Frog", scientific: 'Litoria caerulea',
    water: 'terra', kind: 'herp', adultSizeCm: 10, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'arboreal', locomotion: 'hopper', humidity: 0.65,
    speed: 0.6, schooling: 'loose', diet: ['cricket', 'worm'], price: 35,
    archetype: 'frog', size: 1.0,
    colors: { base: '#6ab08a', belly: '#e8e0c8', fin: '#4a8a68',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Trees, rain barrels, and even mailboxes across northern Australia and New Guinea.',
    facts: [
      'Its nickname is the "dumpy frog" because it looks chubby and always half-asleep.',
      'Its skin makes a waxy coat so it can stay moist even on a dry, sunny branch.',
      'These frogs can live more than 20 years — longer than most dogs!'
    ],
    care: 'Easy'
  },
  {
    id: 'red_eyed_tree_frog', common: 'Red-Eyed Tree Frog', scientific: 'Agalychnis callidryas',
    water: 'terra', kind: 'herp', adultSizeCm: 7, bioload: 2, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'arboreal', locomotion: 'hopper', humidity: 0.85,
    speed: 0.8, schooling: 'loose', diet: ['cricket', 'fruitfly'], price: 45,
    archetype: 'frog', size: 0.85,
    colors: { base: '#4ab83a', belly: '#e8f0d8', fin: '#e87020',
      pattern: 'stripesV', patternColor: '#3060c8', patternScale: 1.1, iridescence: 0.2 },
    habitat: 'Rainforest canopy of Central America, from Mexico down to Colombia.',
    facts: [
      'By day it sleeps as a plain green blob — eyes shut, legs tucked, invisible on a leaf.',
      'If a predator gets close, it flashes its red eyes and orange feet to startle it and escape.',
      'Mom lays eggs on leaves hanging over ponds, so hatching tadpoles drop straight into the water.'
    ],
    care: 'Moderate'
  },
  {
    id: 'azureus_dart_frog', common: 'Blue Poison Dart Frog', scientific: "Dendrobates tinctorius 'Azureus'",
    water: 'terra', kind: 'herp', adultSizeCm: 4.5, bioload: 1, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'hopper', humidity: 0.9,
    speed: 0.9, schooling: 'loose', diet: ['fruitfly'], price: 55,
    archetype: 'frog', size: 0.6,
    colors: { base: '#2858d0', belly: '#4870d8', fin: '#1a3a90',
      pattern: 'spots', patternColor: '#0a1a40', patternScale: 1.4, iridescence: 0.3 },
    habitat: 'Cool, mossy rainforest streams of southern Suriname in South America.',
    facts: [
      'Wild dart frogs get their poison from the wild ants and mites they eat — frogs raised by people eat fruit flies, so they are not poisonous at all.',
      'Every dart frog has its own pattern of black spots, unique like your fingerprint.',
      'Dart frog parents give tadpoles piggyback rides to little pools of water inside plants.'
    ],
    care: 'Moderate'
  },
  {
    id: 'strawberry_dart_frog', common: 'Strawberry Dart Frog', scientific: 'Oophaga pumilio',
    water: 'terra', kind: 'herp', adultSizeCm: 2.5, bioload: 1, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['expertDiet'], zone: 'ground', locomotion: 'hopper', humidity: 0.9,
    speed: 0.9, schooling: 'loose', diet: ['fruitfly'], price: 65,
    archetype: 'frog', size: 0.45,
    colors: { base: '#d82820', belly: '#e85040', fin: '#3048a0',
      pattern: 'gradientTail', patternColor: '#3048a0', patternScale: 1.0, iridescence: 0.25 },
    habitat: 'Leaf litter of rainforests in Costa Rica, Nicaragua, and Panama.',
    facts: [
      'This "blue jeans" frog has a red body and blue legs, like it dressed itself.',
      'It is smaller than your thumbnail as an adult, but its bright color says "notice me!"',
      'The mother carries each tadpole up a tree to its own tiny water pool inside a plant, and brings it food.'
    ],
    care: 'Expert'
  },
  {
    id: 'pacman_frog', common: 'Pacman Frog', scientific: 'Ceratophrys ornata',
    water: 'terra', kind: 'herp', adultSizeCm: 12, bioload: 3, minSchool: 1,
    temperament: 'aggressive', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'burrow', locomotion: 'hopper', humidity: 0.75,
    speed: 0.3, schooling: 'none', diet: ['cricket', 'worm'], price: 40,
    archetype: 'frog', size: 1.15, shape: { height: 1.3, finFlow: 1.0 },
    colors: { base: '#5a9838', belly: '#e0d8b0', fin: '#8a5828',
      pattern: 'patches', patternColor: '#3a6820', patternScale: 1.5, iridescence: 0.05 },
    habitat: 'Rain-flooded grasslands of Argentina, Uruguay, and southern Brazil.',
    facts: [
      'Its mouth is as wide as half its whole body — that is how it got its video-game name.',
      'It buries itself in the soil with just its eyes peeking out, waiting for lunch to walk by.',
      'It will try to eat almost anything that fits in its mouth, so it must live alone!'
    ],
    care: 'Easy'
  },
  {
    id: 'fire_bellied_toad', common: 'Fire-Bellied Toad', scientific: 'Bombina orientalis',
    water: 'terra', kind: 'herp', adultSizeCm: 5, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'hopper', humidity: 0.8,
    speed: 0.8, schooling: 'loose', diet: ['cricket', 'fruitfly'], price: 25,
    archetype: 'frog', size: 0.6,
    colors: { base: '#4a9838', belly: '#e83818', fin: '#2a6820',
      pattern: 'spots', patternColor: '#1a3010', patternScale: 1.3, iridescence: 0.1 },
    habitat: 'Ponds and slow streams of Korea, northeastern China, and eastern Russia.',
    facts: [
      'When scared, it arches its back to flash its fire-orange belly: "warning — I taste bad!"',
      'It spends as much time paddling in shallow water as hopping on land.',
      'Its call is not a croak but a soft, musical "boop... boop" like a tiny bell.'
    ],
    care: 'Easy'
  },
  {
    id: 'axolotl', common: 'Axolotl', scientific: 'Ambystoma mexicanum',
    water: 'fresh',  // CROSSOVER: fully aquatic — lives in the AQUARIUM, sold from the terrarium tab
    kind: 'herp', adultSizeCm: 25, bioload: 8, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['coldwater', 'soloOnly'], zone: 'bottom', locomotion: 'swimmer', humidity: 1.0,
    speed: 0.5, schooling: 'none', diet: ['frozen', 'pellet'], price: 80,
    archetype: 'salamander', size: 1.1,
    colors: { base: '#f0c8c8', belly: '#f8e0e0', fin: '#d05868',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.15 },
    habitat: 'Only one place on Earth: the ancient lake canals of Xochimilco, Mexico City.',
    facts: [
      'It can regrow a lost leg, its tail, and even parts of its heart — scientists study it to learn how.',
      'It never grows up! It keeps its feathery baby gills its whole life and stays underwater.',
      'Its mouth curves so it always looks like it is smiling at you.'
    ],
    care: 'Moderate'
  },
  {
    id: 'tiger_salamander', common: 'Tiger Salamander', scientific: 'Ambystoma tigrinum',
    water: 'terra', kind: 'herp', adultSizeCm: 30, bioload: 4, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'burrow', locomotion: 'crawler', humidity: 0.7,
    speed: 0.5, schooling: 'none', diet: ['worm', 'cricket'], price: 45,
    archetype: 'salamander', size: 1.0,
    colors: { base: '#2a2a20', belly: '#5a5a48', fin: '#d8c838',
      pattern: 'patches', patternColor: '#d8c838', patternScale: 1.5, iridescence: 0.1 },
    habitat: 'Burrows near ponds across most of North America.',
    facts: [
      'It is one of the biggest salamanders that lives on land — as long as a school ruler.',
      'It spends most of its life in underground burrows, coming up on rainy nights.',
      'Tiger salamanders can live over 15 years and learn when it is dinner time.'
    ],
    care: 'Easy'
  },
  {
    id: 'redknee_tarantula', common: 'Mexican Red-Knee Tarantula', scientific: 'Brachypelma hamorii',
    water: 'terra', kind: 'bug', adultSizeCm: 14, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'ground', locomotion: 'crawler', humidity: 0.5,
    speed: 0.5, schooling: 'none', diet: ['cricket', 'worm'], price: 75,
    archetype: 'tarantula', size: 1.0, edible: false,
    colors: { base: '#1a1a1a', belly: '#2a2020', fin: '#e86820',
      pattern: 'stripesH', patternColor: '#e86820', patternScale: 1.2, iridescence: 0.1 },
    habitat: 'Dry scrubland burrows along the Pacific coast of Mexico.',
    facts: [
      'To grow, it climbs out of its old skin and leaves behind a perfect see-through spider suit.',
      'Female red-knees can live more than 25 years — a pet you could hand down.',
      'It is famously gentle and slow — more teddy bear than monster.'
    ],
    care: 'Easy'
  },
  {
    id: 'pinktoe_tarantula', common: 'Pink-Toe Tarantula', scientific: 'Avicularia avicularia',
    water: 'terra', kind: 'bug', adultSizeCm: 12, bioload: 2, minSchool: 1,
    temperament: 'shy', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'arboreal', locomotion: 'climber', humidity: 0.75,
    speed: 0.8, schooling: 'none', diet: ['cricket'], price: 60,
    archetype: 'tarantula', size: 0.9, edible: false,
    colors: { base: '#22222e', belly: '#33333e', fin: '#e090a8',
      pattern: 'gradientTail', patternColor: '#e090a8', patternScale: 1.0, iridescence: 0.35 },
    habitat: 'Rainforest treetops of the Amazon in South America and the Caribbean.',
    facts: [
      'Each dark furry leg ends in a bright pink toe, like tiny ballet shoes.',
      'It builds a silky tube-tent high in the leaves and hides inside during the day.',
      'Instead of running away on the ground, it can leap from branch to branch.'
    ],
    care: 'Moderate'
  },
  {
    id: 'curlyhair_tarantula', common: 'Curly Hair Tarantula', scientific: 'Tliltocatl albopilosus',
    water: 'terra', kind: 'bug', adultSizeCm: 13, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'ground', locomotion: 'crawler', humidity: 0.6,
    speed: 0.45, schooling: 'none', diet: ['cricket', 'worm'], price: 50,
    archetype: 'tarantula', size: 0.95, edible: false,
    colors: { base: '#3a2e22', belly: '#4a3c2e', fin: '#c8a058',
      pattern: 'none', patternColor: '#c8a058', patternScale: 1.0, iridescence: 0.2 },
    habitat: 'Rainforest floors of Nicaragua and Costa Rica, often near rivers.',
    facts: [
      'Its whole body is covered in golden hairs that curl like a teddy bear\'s fur.',
      'It digs a cozy burrow and redecorates it with silk wallpaper.',
      'It is one of the calmest tarantulas in the world — a favorite first spider.'
    ],
    care: 'Easy'
  },
  {
    id: 'emperor_scorpion', common: 'Emperor Scorpion', scientific: 'Pandinus imperator',
    water: 'terra', kind: 'bug', adultSizeCm: 20, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: ['nocturnal', 'soloOnly'], zone: 'burrow', locomotion: 'crawler', humidity: 0.75,
    speed: 0.5, schooling: 'none', diet: ['cricket', 'worm'], price: 65,
    archetype: 'scorpion', size: 1.1, edible: false,
    colors: { base: '#101820', belly: '#182028', fin: '#284858',
      pattern: 'none', patternColor: '#284858', patternScale: 1.0, iridescence: 0.6 },
    habitat: 'Rainforest floors and termite mounds of West Africa.',
    facts: [
      'Under a blacklight it glows an amazing ghostly blue-green — scientists still are not sure why.',
      'It would rather pinch with its big claws than sting; its sting is milder than a bee\'s.',
      'A scorpion mom carries all her babies riding on her back like a bus.'
    ],
    care: 'Moderate'
  },
  {
    id: 'orchid_mantis', common: 'Orchid Mantis', scientific: 'Hymenopus coronatus',
    water: 'terra', kind: 'bug', adultSizeCm: 7, bioload: 1, minSchool: 1,
    temperament: 'aggressive', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'arboreal', locomotion: 'climber', humidity: 0.7,
    speed: 0.6, schooling: 'none', diet: ['fruitfly', 'cricket'], price: 55,
    archetype: 'mantis', size: 0.7, edible: true,
    colors: { base: '#f0d8e8', belly: '#f8ecf4', fin: '#e070a0',
      pattern: 'gradientTail', patternColor: '#e070a0', patternScale: 1.0, iridescence: 0.2 },
    habitat: 'Flowering bushes in the rainforests of Malaysia and Indonesia.',
    facts: [
      'Its legs are shaped exactly like flower petals — it IS the orchid.',
      'Instead of hiding, it pretends to be a flower so bees fly right to it.',
      'It sways gently side to side, like a blossom bobbing in the breeze.'
    ],
    care: 'Expert'
  },
  {
    id: 'ghost_mantis', common: 'Ghost Mantis', scientific: 'Phyllocrania paradoxa',
    water: 'terra', kind: 'bug', adultSizeCm: 5, bioload: 1, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: [], zone: 'arboreal', locomotion: 'climber', humidity: 0.65,
    speed: 0.5, schooling: 'loose', diet: ['fruitfly'], price: 40,
    archetype: 'mantis', size: 0.55, edible: true,
    colors: { base: '#6b4e30', belly: '#7a5c3a', fin: '#4a3520',
      pattern: 'patches', patternColor: '#8a6b45', patternScale: 1.3, iridescence: 0.05 },
    habitat: 'Dry bushes and leaf litter across Madagascar and mainland Africa.',
    facts: [
      'Its whole body looks like a crumpled dead leaf, right down to a leafy crown on its head.',
      'When the wind blows, it rocks back and forth to move exactly like the leaves around it.',
      'Unlike most mantises, ghost mantises are calm enough to live in small groups.'
    ],
    care: 'Moderate'
  },
  {
    id: 'chinese_mantis', common: 'Chinese Mantis', scientific: 'Tenodera sinensis',
    water: 'terra', kind: 'bug', adultSizeCm: 10, bioload: 1, minSchool: 1,
    temperament: 'aggressive', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'arboreal', locomotion: 'climber', humidity: 0.5,
    speed: 0.7, schooling: 'none', diet: ['cricket', 'fruitfly'], price: 25,
    archetype: 'mantis', size: 0.85, edible: true,
    colors: { base: '#7a9040', belly: '#a8b868', fin: '#5a7028',
      pattern: 'stripesH', patternColor: '#b8a858', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Gardens, meadows, and hedges — originally from China, now worldwide.',
    facts: [
      'It can turn its head to look over its shoulder at you — almost no other insect can.',
      'Its lightning strike takes about one twentieth of a second: blink and you missed it.',
      'It hatches with over 100 brothers and sisters from one foam egg case.'
    ],
    care: 'Easy'
  },
  {
    id: 'indian_stick_insect', common: 'Indian Stick Insect', scientific: 'Carausius morosus',
    water: 'terra', kind: 'bug', adultSizeCm: 10, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'arboreal', locomotion: 'climber', humidity: 0.6,
    speed: 0.3, schooling: 'loose', diet: ['veggie'], price: 15,
    archetype: 'stick', size: 0.8, edible: true,
    colors: { base: '#6a8a3a', belly: '#7a9a48', fin: '#4a6828',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.0 },
    habitat: 'Bushes and shrubs of southern India.',
    facts: [
      'Almost every Indian stick insect is a girl — they can have babies without any dad at all.',
      'When touched, it goes stiff and drops like a real twig falling off a branch.',
      'If a young one loses a leg, it can grow a new one the next time it molts.'
    ],
    care: 'Easy'
  },
  {
    id: 'giant_prickly_stick', common: 'Giant Prickly Stick Insect', scientific: 'Extatosoma tiaratum',
    water: 'terra', kind: 'bug', adultSizeCm: 15, bioload: 1, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'arboreal', locomotion: 'climber', humidity: 0.6,
    speed: 0.3, schooling: 'loose', diet: ['veggie'], price: 35,
    archetype: 'stick', size: 1.1, edible: true,
    colors: { base: '#b09050', belly: '#c8a868', fin: '#8a6b38',
      pattern: 'spots', patternColor: '#7a5c30', patternScale: 1.1, iridescence: 0.0 },
    habitat: 'Eucalyptus forests of Queensland, Australia.',
    facts: [
      'When threatened it curls its spiky tail overhead to look like a scorpion — but it is harmless.',
      'Its newly hatched babies are copycats of ants, running fast with curled-up bodies.',
      'Its eggs look like seeds, so ants carry them home and keep them safe underground until they hatch.'
    ],
    care: 'Moderate'
  },
  {
    id: 'hissing_cockroach', common: 'Madagascar Hissing Cockroach', scientific: 'Gromphadorhina portentosa',
    water: 'terra', kind: 'bug', adultSizeCm: 8, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'ground', locomotion: 'climber', humidity: 0.6,
    speed: 0.7, schooling: 'loose', diet: ['fruit', 'veggie'], price: 12,
    archetype: 'roach', size: 0.8, edible: true,
    colors: { base: '#5a2e18', belly: '#3a1e10', fin: '#8a4a24',
      pattern: 'stripesH', patternColor: '#8a4a24', patternScale: 1.4, iridescence: 0.15 },
    habitat: 'Rotting logs on the forest floor of Madagascar.',
    facts: [
      'It hisses by pushing air through tiny breathing holes in its sides — no other insect does that.',
      'It has no wings at all and never flies; it is a champion walker instead.',
      'It can climb straight up smooth glass thanks to sticky pads on its feet.'
    ],
    care: 'Easy'
  },
  {
    id: 'giant_millipede', common: 'Giant African Millipede', scientific: 'Archispirostreptus gigas',
    water: 'terra', kind: 'bug', adultSizeCm: 30, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'ground', locomotion: 'crawler', humidity: 0.8,
    speed: 0.25, schooling: 'none', diet: ['veggie', 'fruit'], price: 30,
    archetype: 'millipede', size: 1.2, edible: false,
    colors: { base: '#201a14', belly: '#2a221a', fin: '#6a3820',
      pattern: 'stripesV', patternColor: '#302620', patternScale: 2.0, iridescence: 0.2 },
    habitat: 'Rainforest floors of East Africa, hiding under logs and leaf litter.',
    facts: [
      'It is the biggest millipede on Earth — as long as a ruler, with about 256 legs (not 1000).',
      'Its legs move in beautiful slow waves, like a stadium crowd doing "the wave".',
      'When worried it coils into a perfect spiral with its hard shell facing out.'
    ],
    care: 'Easy'
  },
  {
    id: 'rubber_ducky_isopod', common: 'Rubber Ducky Isopod', scientific: "Cubaris sp. 'Rubber Ducky'",
    water: 'terra', kind: 'bug', adultSizeCm: 1.5, bioload: 1, minSchool: 5,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'crawler', humidity: 0.85,
    speed: 0.3, schooling: 'loose', diet: ['veggie', 'fruit'], price: 20,
    archetype: 'isopod', size: 0.35, edible: false, cleans: true,
    colors: { base: '#8a8a88', belly: '#a8a8a0', fin: '#e8c040',
      pattern: 'gradientTail', patternColor: '#e8c040', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Damp limestone caves of Thailand — only discovered by pet keepers in 2017.',
    facts: [
      'Its yellow face on a grey body makes it look exactly like a tiny bath duck.',
      'Isopods are the cleanup crew: they eat old leaves and droppings and keep the tank tidy.',
      'It is not an insect at all — it is a tiny land crustacean, cousin to crabs and shrimp.'
    ],
    care: 'Moderate'
  },
  {
    id: 'dairy_cow_isopod', common: 'Dairy Cow Isopod', scientific: "Porcellio laevis 'Dairy Cow'",
    water: 'terra', kind: 'bug', adultSizeCm: 2, bioload: 1, minSchool: 5,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'crawler', humidity: 0.7,
    speed: 0.5, schooling: 'loose', diet: ['veggie', 'fruit'], price: 8,
    archetype: 'isopod', size: 0.4, edible: true, cleans: true,
    colors: { base: '#e8e8e0', belly: '#f0f0e8', fin: '#202020',
      pattern: 'patches', patternColor: '#202020', patternScale: 1.4, iridescence: 0.05 },
    habitat: 'Compost heaps and damp soil — originally Europe, now all over the world.',
    facts: [
      'It is spotted black-and-white exactly like a little dairy cow.',
      'A mom isopod carries her babies in a belly pouch, a bit like a kangaroo.',
      'A busy isopod family can turn dead leaves into fresh soil for the whole tank.'
    ],
    care: 'Easy'
  },
  {
    id: 'blue_death_feigning_beetle', common: 'Blue Death-Feigning Beetle', scientific: 'Asbolus verrucosus',
    water: 'terra', kind: 'bug', adultSizeCm: 2, bioload: 1, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'crawler', humidity: 0.15,
    speed: 0.5, schooling: 'loose', diet: ['veggie', 'worm'], price: 15,
    archetype: 'beetle', size: 0.4, edible: false,
    colors: { base: '#8aa8b8', belly: '#6a8898', fin: '#48606c',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'The scorching Sonoran and Mojave deserts of the southwestern USA.',
    facts: [
      'When startled, it flips over, sticks its legs in the air, and plays dead — very dramatically.',
      'Its powder-blue color is a waxy sunscreen; if it gets wet, it turns black until it dries.',
      'This tough little desert tank can live 8 years or more.'
    ],
    care: 'Easy'
  },
  {
    id: 'hermit_crab', common: 'Caribbean Hermit Crab', scientific: 'Coenobita clypeatus',
    water: 'terra', kind: 'bug', adultSizeCm: 8, bioload: 2, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['nocturnal'], zone: 'ground', locomotion: 'climber', humidity: 0.75,
    speed: 0.6, schooling: 'loose', diet: ['fruit', 'veggie'], price: 20,
    archetype: 'crab', size: 0.9, edible: false,
    colors: { base: '#b06a3a', belly: '#c88850', fin: '#c8b090',
      pattern: 'none', patternColor: '#ffffff', patternScale: 1.0, iridescence: 0.1 },
    habitat: 'Beaches and coastal forests of the Caribbean islands.',
    facts: [
      'It wears an empty seashell as its house and moves to a bigger one as it grows.',
      'Hermit crabs sometimes line up biggest-to-smallest so everyone can trade shells at once!',
      'Despite living on land, it carries a little seawater in its shell to keep its gills damp.'
    ],
    care: 'Easy'
  },
  {
    id: 'russian_tortoise', common: 'Russian Tortoise', scientific: 'Testudo horsfieldii',
    water: 'terra', kind: 'herp', adultSizeCm: 20, bioload: 8, minSchool: 1,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: ['soloOnly', 'basker'], zone: 'ground', locomotion: 'crawler', humidity: 0.3,
    speed: 0.3, schooling: 'none', diet: ['veggie'], price: 95,
    archetype: 'tortoise', size: 1.1,
    colors: { base: '#7a6a3a', belly: '#b0985a', fin: '#4a3e20',
      pattern: 'patches', patternColor: '#3a3018', patternScale: 1.6, iridescence: 0.0 },
    habitat: 'Dry, grassy steppes of Central Asia — Kazakhstan, Uzbekistan, and Afghanistan.',
    facts: [
      'In 1968, two of these tortoises flew around the Moon before any astronaut did — and came home safe.',
      'It digs long burrows and can nap underground for months to skip the coldest and hottest weather.',
      'With good care it can live 40 years or more — it might outlive your goldfish by decades.'
    ],
    care: 'Moderate'
  },
];
```

## 5. Species visuals (`herpbuilder.js`, extend `invertbuilder.js`)

- **Herps** get a `herpbuilder.js` modeled on `fishbuilder.js`: same lofted
  cross-section body (`buildBodyGeometry`-style rings with `aT` head→tail
  attribute), plus procedural legs from `invertbuilder.js`-style primitives.
  Archetypes: `gecko, lizard, snake, chameleon, frog, salamander, tortoise`.
  Snake reuses the `eel` profile + wave shader directly.
- **Bugs** extend `buildInvert()` with archetypes
  `tarantula, scorpion, mantis, stick, roach, millipede, isopod, beetle`
  (crab already exists). Same `userData.sway` animation contract.
- Patterns/colors reuse the fish shader `PATTERN_ID` set (`spots`, `patches`,
  `stripesH`…) — the `colors` block is schema-identical on purpose.

## 6. Retention hooks (per HABITAT_VISION loop)

- **Molts**: tarantulas/mantises/isopods leave a translucent molt prop on
  growth events (`SIM.GROW_DAYS` already emits `'grown'`) — collectible.
- **Shed**: snakes leave a shed skin; brushing it away = coins.
- **Night check-in**: nocturnal cast means the tank is a different place after
  21:00 (`rawDayFactor()` = 0) — gecko out, tarantula out, roaches climbing.
- **Escaped cricket** surprise: a feeder that survives 2 days chirps
  (audio.js one-shot) until caught by tap.

## 7. MVP cut — 8 species, minimum systems

| Species | Locomotion | Why |
|---|---|---|
| Leopard Gecko | crawler (exists) | THE first pet reptile; nocturnal showpiece |
| Crested Gecko | climber (exists) | glass-climbing wow moment |
| Corn Snake | serpent (eel reuse) | snake with no feeding controversy blocker if mice deferred — can eat `worm` in MVP |
| White's Tree Frog | hopper (new) | proves the hop system; forgiving care |
| Blue Dart Frog | hopper | color + the not-toxic fact; fruitfly food |
| Curly Hair Tarantula | crawler | the can't-have pet, zero new movement code |
| Chinese Mantis | climber | predator drama, cheap |
| Dairy Cow Isopod | crawler | cleanup-crew mechanic (`cleans: true`), cheap starter |

Systems in MVP: terrarium environment builder, humidity + dirty-glass meters
(temperature meter deferred — lamp is visual only), hop locomotion, foods
`cricket/worm/fruitfly/veggie`, herpbuilder archetypes
`gecko/snake/frog` + bug archetypes `tarantula/mantis/isopod`.
Deferred: chameleon (tongue + turret eyes deserve their own milestone),
axolotl crossover, tortoise/beardie baskers (need temp meter), scorpion UV
mode, burrowing, branch-perch system (climbers use walls only in MVP).
