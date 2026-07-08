# Engine Split — fishtank → Habitat engine + habitat packs

Goal: turn the live game into `engine + habitats/aquarium` **without a single
release where the fish tank is broken**. Every checklist step below leaves the
game shippable; the aquarium is the reference pack and the regression test.

> **DECIDED (John, 2026-07-08): incremental split, branch per habitat.** No
> big-bang refactor. Each new habitat gets its own git branch
> (`habitat/terrarium`, `habitat/antfarm`, …); on that branch we extract ONLY
> the engine pieces that habitat actually needs (terrarium: meter config,
> locomotion registry, food behaviors; ant farm: its own list), verify the
> aquarium still passes, then merge to `main`. The 10-step checklist below is
> the menu we pull steps from, not a phase to run up front.

## 1. What's already generic vs. aquarium-specific

| Module (src/) | Verdict | Notes |
|---|---|---|
| `sim.js` (CareSim) | **~90% generic** | Hunger/health/decay/offline/growth/coins/save is habitat-agnostic. Hardcoded: `['fresh','salt']` loop in `applyOffline()`/`load()`, meter names `water`/`algae`, `CAPACITY` import, fixed decay formulas. Fix: meters + tank list from pack config. |
| `behavior.js` | **Generic core, aquarium modes** | `Swarm` loop, `startleNear`, `nightFactor`, rest logic, predator/prey (`_findPrey`/`_devour`), boids = engine. `SURFACES` map is generic glass-box geometry (terrarium uses it verbatim). Aquarium-specific: swim steering assumes a water column (`zoneY`, vertical wander), `FLOOR_Y = TANK.SAND_H`. Fix: split into locomotion modules registered by name (see §3). |
| `rules.js` | **Generic already** | `evaluateAdd()` reads only spec fields (`water`, `bioload`, `tags`, `predator`, `minSchool`…). The `water !== current` check generalizes to "habitat match". Fin-nip rules are harmless no-ops for packs where those flags are false. Move as-is. |
| `ui.js` | **Generic shell** | HUD pills, panels, shop catalog, fish card, toasts — all data-driven off spec fields + `summary()`. Hardcoded: meter labels/emoji ("water", algae), `FOODS` import, card bullet `🐟`. Fix: labels/foods/icon from pack config. |
| `audio.js` | **Generic synth, aquarium presets** | The WebAudio synth + unlock/toggle = engine. Brown-noise "underwater room tone" + bubble blips = aquarium ambience preset. Packs provide an ambience recipe. |
| `food.js` | **Split** | Drop/target/eat/`nearestFor`/rot accounting = engine. Float-then-sink physics + `TANK.WATER_LEVEL` spawn = aquarium. Fix: per-food `behavior` strategy provided by pack (sink / hop / static / drip). |
| `constants.js` | **Split** | `SIM` tuning + `SAVE_KEY` = engine defaults. `TANK`/`BOUNDS` (generic box, keep in engine as `ENCLOSURE`), `WATER_THEMES`, `FOODS`, `CAPACITY` = pack data. |
| `tank.js` | **Aquarium pack** | Water surface, caustics, shafts, bubbles, motes are THE aquarium. But its **contract** — `{ group, setTheme, setDay, update }` returned from `buildTank(scene, renderer)` — is the engine's environment-builder interface. Frame + substrate-plane helpers extract to shared decor utils. |
| `fishbuilder.js` | **Aquarium pack (shared tech)** | Lofted `aT`-wave body + pattern shader is reusable tech (terrarium herps copy the approach); the fish profiles/fins are pack content. Move to pack; extract `buildBodyGeometry`/`sample`/pattern shader chunk into `engine/bodykit.js` when terrarium needs it — not before. |
| `invertbuilder.js` | **Shared content library** | Snail/shrimp/crab/star primitives + `userData.sway` contract; terrarium extends with new archetypes. Move to engine content lib. |
| `species/*.js` | **Pack data** | Schema is already the cross-habitat standard (see TERRARIUM_SPEC §4). |
| `main.js` | **Mostly engine glue** | Renderer, lights, PMREM env, day/night clock (`rawDayFactor`, `df` smoothing), camera controller, gesture handling, save-on-hide, frame loop = engine. Hardcoded: `STARTERS`, `buildDecor`, species imports, `switchTank('fresh'/'salt')`, `WATER_THEMES` fog wiring. Fix: habitat registry + active-pack indirection. |

## 2. Target structure

```
src/
  engine/
    sim.js            // CareSim, meters from config
    swarm.js          // Swarm core: update loop, startle, night, predator/prey
    locomotion/
      swim.js         // boids + zone steering (from behavior.js)
      crawl.js        // crawler + SURFACES + climber (from behavior.js)
      serpent.js      // ground undulation (eel repurpose)
      hop.js          // ballistic arc (new, terrarium)
    food.js           // FoodSystem core; per-food behavior strategies
    rules.js          // evaluateAdd, canEat
    ui.js             // shell; labels/icons/foods injected
    audio.js          // synth core + ambience recipes
    daynight.js       // rawDayFactor + smoothing (from main.js)
    camera.js         // orbit/pinch/tap-follow (from main.js)
    bodykit.js        // (later) lofted body + pattern shader chunks
    invertkit.js      // invertbuilder primitives + sway contract
    constants.js      // SIM defaults, SAVE_KEY, ENCLOSURE box maker
  habitats/
    aquarium/
      index.js        // the pack manifest (see §4)
      environment.js  // = today's tank.js
      fishbuilder.js
      foods.js        // FOODS + sink physics params
      themes.js       // WATER_THEMES
      species/        // freshwater.js, saltwater.js, inverts.js
      starters.js
    terrarium/
      index.js, environment.js, herpbuilder.js, foods.js, species.js ...
    antfarm/
      index.js, environment.js, soil.js, pheromone.js, colony.js ...
  main.js             // boot: registry, pick pack, wire engine
```

## 3. Locomotion registry

Today `Swarm.update` branches on `a.sessile` / `a.crawler` / default-swim.
Target: `a.locomotion` names a module; `Swarm.update` handles the shared
pre/post (growth scale, eatCooldown, startle decay, sim queries, orientation
helpers) and delegates steering/animation:

```js
// engine/swarm.js
const LOCO = {};                       // name -> { init(agent, ctx), update(agent, dt, time, ctx) }
export function registerLocomotion(name, mod) { LOCO[name] = mod; }
```

Aquarium pack registers `swim`, `crawl`, `sessile`; spec field `locomotion`
(already specced for terrarium) selects it; aquarium species without the field
fall back via the current inference (`kind === 'invert'` → crawl, etc.) so
**species data files don't have to change in the same commit**.

## 4. Habitat pack manifest (the contract)

```js
// habitats/terrarium/index.js
export default {
  id: 'terrarium',
  label: 'Terrarium', icon: '🦎',
  // rendering — same contract buildTank() already returns:
  buildEnvironment(scene, renderer) => ({ group, setTheme(type), setDay(df), update(t) }),
  buildDecor(group, subtype),          // rocks/plants/branches (from main.js buildDecor)
  buildAgentVisual(spec) => Object3D,  // routes to herpbuilder/invertkit per spec.kind
  // data:
  species: TERRARIUM_SPECIES,
  subtypes: ['terra'],                 // aquarium: ['fresh','salt'] — the "tanks" CareSim iterates
  themes: THEMES,                      // per-subtype colors (WATER_THEMES shape)
  foods: TERRA_FOODS,                  // FOODS shape + behavior: 'sink'|'hop'|'static'|...
  starters: STARTERS,
  capacity: { bioload: 60, maxAgents: 20 },
  // care model:
  care: {
    meters: {
      quality: { label: 'Humidity', icon: '💧', decayDays: 1.5, restoreAction: 'mist', restoreAmt: 0.55 },
      grime:   { label: 'Glass',    icon: '🧽', growDays: 4 },
      // optional extras, e.g. temp: {...} — CareSim iterates what it's given
    },
    sim: { HUNGER_HOURS: 24, STARVE_DAYS: 6, ... },   // overrides engine SIM defaults
  },
  locomotion: { serpent, hop },        // pack-specific modules to register (crawl/swim ship in engine)
  ambience: 'dryNight',                // audio recipe id
  rules: [],                           // optional extra evaluateAdd checks
};
```

Boot (`main.js`): `const PACKS = { aquarium, terrarium }` → active pack from
save → `registerLocomotion` for pack modules → `pack.buildEnvironment` →
`new CareSim(pack)` → `new UI({ ...pack bindings })`. The habitat switcher is
the existing `switchTank` button generalized one level up (subtype switch
within a pack, pack switch above it).

## 5. Save format

`SAVE_KEY = 'fishtank_save_v2'` → `'habitat_save_v3'`. Shape:

```js
{ version: 3, coins, activePack: 'aquarium',
  packs: { aquarium: { current: 'fresh', tanks: { fresh: {...}, salt: {...} } },
           terrarium: { current: 'terra', tanks: { terra: {...} } } } }
```

Migration in `CareSim.load()`: if `fishtank_save_v2` exists and v3 doesn't,
wrap it (`packs.aquarium.tanks = old.tanks`, carry `coins`). Never delete the
v2 key for one release (rollback safety). This mirrors the growth-field
migration already in `load()` (`f.growth ??= 1`).

## 6. Ordered migration checklist (each step ships)

1. **Meters + subtype list into CareSim config.** Replace hardcoded
   `['fresh','salt']` in `applyOffline()`/`load()` with
   `Object.keys(this.state.tanks)`; take `{ subtypes, capacity, sim }` as a
   constructor arg defaulting to today's values. Pure refactor, zero behavior
   change. *Risk: low. Test: existing save loads, offline decay identical.*
2. **Extract `daynight.js` and `camera.js` from `main.js`.** Mechanical
   move; `main.js` shrinks. *Risk: low.*
3. **Locomotion registry inside `behavior.js`** (don't move files yet):
   carve `_animateCrawler`+`SURFACES` into `crawl.js`, swim steering into
   `swim.js`, sessile into `sessile.js`; `Swarm` dispatches through the
   registry with the current inference as fallback. *Risk: medium — this is
   the diff to review hardest. Test: fish school, plecos glass-sit, snails
   climb, predator eats, night behavior — the existing shot scripts
   (`shots.mjs`, `camtest.mjs`, `invtest.mjs`) cover most of this.*
4. **Foods: behavior strategies.** `FoodSystem.update` delegates per-item
   motion to a strategy keyed by `FOODS[type].behavior` (default `'sink'`
   preserves today's float/sink). *Risk: low.*
5. **Create `src/engine/` + `src/habitats/aquarium/` and move files** —
   imports only, no logic edits. `main.js` becomes boot + a one-pack registry.
   `index.html`/`build.mjs` entry unchanged. *Risk: low but touches every
   import; do it as its own commit.*
6. **Pack manifest for aquarium** (§4) — `main.js` reads everything
   (species, themes, starters, foods, decor) through the manifest. The game
   is now formally "engine + one pack". *Risk: low.*
7. **Save v3 + migration** (§5). *Risk: medium — write the migration test
   first (seed a v2 blob, load, assert fish/coins/growth survive).*
8. **UI shell parametrization**: meter labels/icons, food buttons, card
   bullet icon, shop tabs from the manifest. *Risk: low.*
9. **Terrarium pack MVP** lands as pure addition (`habitats/terrarium/`),
   per TERRARIUM_SPEC §7. First real proof of the contract; expect small
   engine patches (branch surfaces, hop) — additive only.
10. **Ant farm pack** (ANTFARM_SPEC): stresses the contract on purpose —
    CareSim colony records + grid world. Where it doesn't fit, extend the
    manifest, never special-case pack ids inside engine files.

Guardrail for the whole sequence: `window.__tank` debug handle and the
screenshot scripts in the repo root keep working at every step — if a step
breaks `shots.mjs`, the step is too big.
