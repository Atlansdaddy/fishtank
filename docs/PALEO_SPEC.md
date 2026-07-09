# Paleo Paddock — Habitat Pack Spec

The roadmap finale (#10) and the ultimate "pet you can't have": animals that
are gone. Per `ROADMAP.md` it is deliberately last because it reuses **every**
locomotion family built before it — swim (aquarium), crawl/climb
(aquarium + terrarium), serpent (terrarium), hop (terrarium), flutter
(butterfly garden), flight (aviary). New locomotion code target: **zero**.
That constraint is the whole point of building it last, and this spec is
written to hold it.

**The brand twist.** Everywhere else the rule is "realistic, real facts,
husbandry-accurate." You cannot be husbandry-accurate about an animal no human
ever kept. So Paleo runs the **science-forward equivalent**: *what we think it
needed*. Every care fact is tagged with how sure science is — evidence-based
("fossils show…"), inferred from living relatives ("scientists believe…"), or
an honest guess ("nobody knows — this is our best guess"). The uncertainty is
not a disclaimer bolted on; it **is** the content. "We don't know what color it
was" is one of the best kid-facts in the whole game, and where melanosome
research *does* give us a real color (Sinosauropteryx's ginger, Microraptor's
iridescent black), that becomes a headline feature.

---

## 1. The enclosure question (address this FIRST)

Every other habitat is a glass box because a fish tank, a vivarium, and a
formicarium **are** glass boxes — the `tank.js` frame reuses verbatim. A glass
box does not hold a dinosaur. This is Paleo's core design problem and it gates
everything else, so it is settled before rendering, care, or roster.

Three honest options, costed against `tank.js`/`main.js` reuse:

| Option | What it is | `tank.js` reuse | New code | Fantasy ceiling | Brand fit |
|---|---|---|---|---|---|
| **(a) Lab Vivarium** | Keep the glass box. A paleo-lab terrarium holding only **small** extinct animals (trilobite, ammonite, Archaeopteryx, Compsognathus, dodo) — nothing bigger than the existing 120g-scale world. | **~100%** — `addFrame` + substrate plane + `setTheme`/`setDay`/`update` contract unchanged. Reuses the aquarium's fresh/salt **subtype switch** to swap *eras* instead. | Only per-era theme tints + a new species-visual builder. | Capped: no plesiosaur, no big theropod, no mammoth. | On-brand — identical to every other habitat. |
| **(b) Open Paddock diorama** | New enclosure metaphor: a bounded open-air diorama (no front pane), camera stays the existing orbit controller. Matches the "Paddock" name; can hold bigger animals framed by terrain, not glass. | Partial — keeps camera, lights, day/night, substrate; **loses** the glass frame, front-pane grime meter, and the "wipe the glass" gesture (which the whole care/retention loop leans on). | New environment builder (horizon, skybox, terrain silhouette), new "clean" metaphor to replace glass-wipe, camera re-clamp. | High — big animals fit visually. | Breaks the glass-box consistency that unifies habitats 1–9. |
| **(c) Per-era sub-enclosures** | Three distinct enclosures — Paleozoic aquarium / Mesozoic paddock / Ice-Age vivarium — each its own environment builder, switched like tanks. | Partial ×3 — aquarium wing reuses `tank.js` fully; paddock + ice-age wings are each an (b)-style new builder. | 2–3× the environment work of (a); most content of any option. | Highest — every era gets a bespoke stage. | Mixed — best fantasy, most build, latest ship.

> **DECIDED (John, 2026-07-09): (a) — the glass-box Lab Vivarium with the era
> switch (Paleozoic/Mesozoic/Recent), small animals only.** The open Paddock
> diorama (b) is parked as a later "Big Animals" expansion; per-era
> sub-enclosures (c) fall out for nearly free from the era-theme switch.
> Rationale: reuse is the mandate and (a) reuses `tank.js` at ~100% while
> keeping the glass-wipe care loop. Reasoning in full:
>
> 1. **Reuse is the mandate.** Paleo's roadmap justification is "pure reuse —
>    no new tech." Option (a) reuses `tank.js` at ~100% and, critically,
>    reuses the aquarium's *subtype switch* (`switchTank('fresh'|'salt')`,
>    `setTheme`) to become an **era switch** at zero new enclosure code. That
>    same switch already ships and is regression-tested.
> 2. **We get most of (c) for nearly free.** Define the pack's `subtypes` as
>    **eras** (`paleozoic`, `carboniferous`, `mesozoic`, `recent`) instead of
>    water types. Each is the *same glass box* re-themed — Paleozoic reads as a
>    lit reef aquarium (water surface **on**), the Carboniferous swamp and the
>    Mesozoic as humid swamp **air** (surface off, warm fog), Recent as a bright
>    vivarium. The three era *wings* are Paleozoic/Mesozoic/Recent, but the
>    Paleozoic wing carries **two biome looks** — a wet Cambrian sea and a dry
>    Carboniferous swamp — because you cannot flood a flying insect (both are
>    geologically Paleozoic; see §2 and the Meganeura carve-out). That is the
>    multi-era fantasy of (c) delivered as theme entries, not new builders.
> 3. **The care/retention loop survives.** The glass-wipe gesture
>    (`scrubAlgae`) is load-bearing across every habitat and is the natural
>    home for the fossil-dig hook (§6). Option (b) throws it away.
> 4. **Honest ceiling.** (a) genuinely cannot hold a 6-metre plesiosaur or an
>    adult theropod. That is a real cost — the true giants (plesiosaur,
>    Dunkleosteus) are **held for the (b) Big-Animals paddock**, not
>    juvenile-shrunk into the glass box. The small stars that *do* fit (dodo,
>    small pterosaur, feathered theropods) carry the wings, and "the lab only
>    revives what fits the tank" is a defensible, honest framing for a
>    6-year-old. Big animals become the reason to build (b) later, as its own
>    project — exactly how the Pet Shop UI was deferred.
>
> This keeps new code near zero for the finale while leaving the door open.

The rest of this spec assumes **(a) with era-subtypes**. Where a choice would
differ under (b)/(c) it is noted.

---

## 2. Enclosure rendering (recommended option (a), reuse `src/tank.js`)

`buildPaleo(scene, renderer)` returns the same handle shape as `buildTank()`:
`{ group, setTheme(era), setDay(df), update(t) }`, so `main.js` swaps it in
without touching the frame loop. Eras are the `setTheme` argument, exactly as
`'fresh'`/`'salt'` are today.

| Aquarium element (`tank.js`) | Paleo equivalent | Notes |
|---|---|---|
| Glass frame (`addFrame`) | **Identical** | Same `TANK` dims (122×61×61). A lab vivarium is a glass box; keep `TANK`/`BOUNDS` constants unchanged. |
| Sand bed (`PlaneGeometry` + dune noise) | Era substrate | Same displaced plane. Paleozoic → rippled seabed + shell hash; Mesozoic → mud + fern litter sprites; Recent → island soil. Theme colors swap `sand`/`sandDark` per era. |
| Back wall (`BackSide` box) | Era backdrop | Same dark box. Paleozoic → deep-reef blue; Mesozoic → misty fern silhouette (painted texture); Recent → dawn sky. One texture swap in `setTheme`. |
| Water surface plane | **Era-gated** | **On** for `paleozoic` (it is literally an ancient-sea aquarium — the entire aquarium water stack reuses verbatim). **Off** for `carboniferous`/`mesozoic`/`recent` (dry air), replaced by a shallow water dish (terrarium's trick: cylinder + `surfMat` ripple disc). One boolean (`wet`) in the theme — this is the flag that lets Meganeura fly in air instead of drowning in the Cambrian sea. |
| Caustics shader | Era-gated | On under water (paleozoic). For dry eras, reuse the quad slot as the terrarium's warm basking disc for baskers. |
| `buildShafts()` sun shafts | Keep, retint | Blue-green under water; warm dusty gold in Carboniferous/Mesozoic air (`vec3(1.0,0.9,0.72)`). |
| `buildBubbles()` airstone | Era-gated | On (paleozoic sea). Off in dry eras (idle count 0), reused as terrarium-style mist burst on a `mist()` call if a dry era needs humidity events. |
| `buildMotes()` marine snow | Reuse | Marine snow under water; drifting spores/pollen in the swamp air (lower opacity, lateral drift) — the "ancient air" read. |
| Decor (`buildDecor` in `main.js`) | Era flora props | Rocks reuse verbatim. Paleozoic → coral/crinoid/sea-lily stalks (reuse plant-blade + branch tubes). Mesozoic → tree ferns, cycads, horsetails (branch `TubeGeometry` + broad blades). Recent → island shrubs + a fallen-log perch. Branches double as climb/perch targets for Archaeopteryx/Microraptor (terrarium branch-perch system, already specced). |

Theme entries (the `WATER_THEMES` sibling — becomes per-pack `themes` after the
engine split). Three eras, one shape each:

```js
paleozoic: {                                  // Cambrian ancient SEA — underwater
  wet: true,                                  // water surface + caustics + bubbles ON
  fogColor: 0x0e3a44, fogDensity: 0.0038,
  deep: 0x08222a, tint: 0x1e6e7e,
  lightColor: 0xdfeee8, lightIntensity: 1500,
  ambient: 0x2e4a4a,
  sand: 0x6e6450, sandDark: 0x4a4234,         // muddy seabed / shell hash
  surface: 0x8fd0c4,
},
carboniferous: {                              // Carboniferous swamp — DRY AIR (Meganeura flies here)
  wet: false,                                 // surface + caustics + bubbles OFF — it is air, not sea
  fogColor: 0x243a24, fogDensity: 0.0018,     // warm, oxygen-rich swamp haze
  deep: 0x142010, tint: 0x486a34,
  lightColor: 0xf4e2a0, lightIntensity: 1500,
  ambient: 0x384428,
  sand: 0x40381f, sandDark: 0x282213,         // peat + fern-litter floor
  bask: 0xffb060,
},
mesozoic: {                                   // age of dinosaurs — humid air
  wet: false,
  fogColor: 0x2a3220, fogDensity: 0.0016,     // warm swamp haze, thinner than water
  deep: 0x1a2214, tint: 0x5a6a3a,
  lightColor: 0xffe6b0, lightIntensity: 1550,
  ambient: 0x40482e,
  sand: 0x4a3e28, sandDark: 0x2e2616,         // fern-litter mud
  bask: 0xffb060,
},
recent: {                                     // the just-gone (dodo era) — bright island
  wet: false,
  fogColor: 0x3a4432, fogDensity: 0.0010,
  deep: 0x223018, tint: 0x6a7a4a,
  lightColor: 0xfff2d0, lightIntensity: 1650,
  ambient: 0x50543c,
  sand: 0x5a4c34, sandDark: 0x3a301f,
  bask: 0xffc878,
}
```

Era switch = the existing subtype button generalized (aquarium's fresh/salt
toggle → a multi-era selector: Paleozoic marine, Carboniferous swamp, Mesozoic,
Recent), driving `setTheme(era)` and `CareSim.switchTank(era)`.

---

## 3. Care model — "what we think it needed" as gameplay (reuse `CareSim`)

`CareSim._decay()` already does hunger/health/water/algae/offline/growth; Paleo
relabels the meters per wet/dry era exactly as the terrarium relabels them, and
adds one thing no other habitat has: **every meter and every care fact carries a
confidence band.**

| Aquarium meter | Paleo meter (wet era) | Paleo meter (dry era) | Mechanics |
|---|---|---|---|
| `tank.water` (quality 1→0) | **Sea quality** | **Habitat quality** (humidity/air) | Identical decay path. `waterChange()` → "refresh the tank / mist the enclosure," +0.55. Each species has a `humidity` comfort center (0–1); outside it, the existing `t.water < SICK_THRESHOLD` health-drain path fires. |
| `tank.algae` (0→1) | **Glass grime** | **Glass grime** | Identical. The front-pane smudge overlay + `scrubAlgae(0.015)` wipe gesture from `main.js` works unchanged — and the same gesture powers fossil-dig (§6). |
| hunger/health per record | **Vitality** | **Vitality** | Unchanged `hunger`→`health` model. |
| Rotting food pollution | Uneaten food | Uneaten food | Unchanged. Predators eating tankmates (`canEat`) is *real Cambrian ecology* here — see §5. |
| Offline decay | Identical | Identical | `applyOffline()` loops era subtypes exactly as it loops `['fresh','salt']`. |

### The confidence layer (the paleo-specific care mechanic)

Two new schema fields drive it, and one existing UI surface displays it:

- `careConfidence: 'evidence' | 'inferred' | 'guess'` — how sure we are about
  this animal's husbandry as a whole.
- Per-meter comfort centers (`humidity`, plus optional `temp`) render in the
  care UI with an **uncertainty band** instead of a hard line: `evidence` = a
  thin band (you can dial it in tight), `inferred` = a wide band ("somewhere in
  here"), `guess` = the whole bar faintly striped with a "?" — the kid can't
  fail a meter nobody actually knows, so it never punishes.
- The **collection-book card** (existing `ui.showFishCard`) gains a one-line
  provenance stamp per care fact:
  - 🦴 *"Fossils show…"* (evidence-based — e.g. gut contents, growth rings)
  - 🔬 *"Scientists believe…"* (inferred from living relatives)
  - ❔ *"Our best guess…"* (genuinely unknown)

This is pure data + one label row; zero simulation cost. It converts the
brand's honesty problem into the brand's best teaching moment.

### Feeding extinct diets (`FOODS` sibling, terrarium food-shape)

Diets are drawn from real evidence where it exists and flagged where it
doesn't. Behaviors reuse existing food strategies (sink / cloud / hop-mini-agent).

| id | name | emoji | eaten by | behavior when dropped | evidence note |
|---|---|---|---|---|---|
| `plankton` | Plankton Cloud | ✨ | ammonite, filter feeders | drifting particle cloud (reuse fruit-fly cloud) | 🔬 ammonite diet is inferred from jaw/radula fossils — likely plankton + tiny prey |
| `detritus` | Sea-Floor Bits | 🍂 | trilobite, scavengers | sinks, sits (reuse `veggie` static) | 🦴 trilobite gut traces show sediment feeding |
| `livePrey` | Live Prey | 🦐 | anomalocaris, dunkleosteus, theropods | mini-agent that flees (reuse cricket hop / small swim); prey-seek via `food.nearestFor` | 🦴 anomalocaris arm/mouth built for grabbing |
| `insects` | Insect Swarm | 🦗 | Meganeura, Archaeopteryx, Compsognathus | flutter/hop mini-agents | 🔬 inferred from beak/tooth + wing shape |
| `ferns` | Ferns & Greens | 🌿 | herbivores (Psittacosaurus) | static dish | 🦴 gut stones + jaw shape show plant eating |
| `fruit` | Fallen Fruit | 🍑 | **dodo** | static on floor | 🦴 the **tambalacoque tree** story — see below |

> **The tambalacoque fact (dodo food card, ❔/🦴 mixed):** the dodo ate fallen
> fruit on Mauritius, and one big-seeded tree — the tambalacoque — became rare
> after the dodo died out. For years people thought the tree *needed* a dodo's
> gut to sprout its seeds. Scientists now think that story was probably too
> simple (turkeys and tortoises can do the same job) — so the card teaches both
> the beautiful idea **and** how science corrected itself. That double-beat is
> the confidence layer working exactly as intended.

`rules.js` `evaluateAdd()` runs **unchanged**: bioload = tank space, `soloOnly`
covers apex predators (anomalocaris, dunkleosteus), the predator/`canEat` warning
covers "your anomalocaris will eat your trilobites" (true, and dramatic), and the
`water !== current` check becomes the **wrong-era** block ("Meganeura is from the
Carboniferous — it can't live in your Mesozoic wing"). No new rule code.

---

## 4. Locomotion — mapping every candidate to an EXISTING mode

The rule: **reuse or die.** Each species names an already-built locomotion
module; the only thing flagged as possibly-new is a bipedal gait, and even that
gets a near-zero approximation so the "no new tech" promise holds.

| Species | Era | Reused mode (source habitat) | How it reuses |
|---|---|---|---|
| Trilobite | Paleozoic | **crawl** (aquarium/terrarium) | `crawl` module verbatim — floor + wall SURFACES, `_animateCrawler`. A trilobite *is* a benthic invert; add a "roll into a ball" startle pose (scale-squash, reuse `scuttle`). |
| Ammonite | Paleozoic/Mesozoic | **swim** (aquarium) | Slow neutral-buoyancy drift; `speed` low; roll pinned so the shell stays up. Jet-burst = reuse the `startle` velocity kick. |
| Anomalocaris | Paleozoic | **swim** (aquarium) + eel wave | Swim steering for the body; the lateral swimming flaps ripple via the **eel travelling-wave** shader (`fishbuilder` `aT` wave) already used for kuhli loach / snakes. Predator flag on. |
| Dunkleosteus | Paleozoic | **swim** (aquarium, predator) | `shark`/predator swim path verbatim — hunt/lunge/`_devour`. Armored head is a builder detail, not new motion. **Size caveat, see below.** |
| Meganeura | Carboniferous (Paleozoic wing, **dry** sub-theme) | **flutter** (butterfly garden) | Flutter-flight boid = butterfly's gentle flight, scaled up. Lives in the `carboniferous` dry theme (`wet:false`), so it flies in swamp air — never in the flooded Cambrian sea. If Paleo ships before Butterfly, this is the one dependency to sequence (or fall back to a hovering flutter). |
| Microraptor | Mesozoic | **flight** (aviary) + **climb** (terrarium) | Glide/flap = aviary flight boids; perching on branches = terrarium branch-perch + climb glue. Four-winged glide is a pose, not new physics. |
| Archaeopteryx | Mesozoic | **flutter** + **climb** hybrid | Weak flier: flutter for short hops between branches, climb glue for perching/trunk-clinging. Exactly the terrarium "arboreal climb" + butterfly "flutter" combined — both exist. |
| Dodo | Recent | **crawl** (floor-only) + waddle | Ground crawl pinned to `floor` SURFACE; a bird **waddle** is a cosmetic bob/side-sway in the builder's animate function, not a new locomotion module. |
| Psittacosaurus | Mesozoic | **crawl** | Quadruped/occasional-bipedal walk approximated by floor crawl + upright root pose. |
| Plesiosaur | Mesozoic | **swim** (aquarium) | Four-flipper "underwater flight" = swim steering + flipper sway (invert-kit `sway`). **Size caveat, see below.** |
| Compsognathus | Mesozoic | **crawl** (biped approximated, §4a) | Small running theropod — the bipedal look is a builder pose over a `crawl` agent. See flag. |
| Sinosauropteryx | Mesozoic | **crawl** (biped approximated, §4a) | Same — small feathered runner; `crawl` sim + upright builder pose. See flag. |

> **⚠ The one thing that could need new locomotion: a bipedal gait.** Small
> theropods (Compsognathus, Sinosauropteryx) run on two legs — no prior habitat
> built a biped walk cycle. Two ways to keep new code near zero:
>
> 1. **Approximate (chosen, ~0 new sim code):** run them on the **`crawl`**
>    locomotion module (reuse `_animateCrawler` steering/targeting/startle
>    wholesale) and put the *bipedal look* entirely in the **builder's animate
>    function** — an upright root, alternating leg bob, counter-swinging tail,
>    head bob. Motion planning is identical to any `crawl` agent; only the visual
>    pose differs. This is exactly how the terrarium made a snake out of an eel:
>    same steering, different body animation.
> 2. **Build it (deferred):** a real dedicated biped locomotion module (footfall
>    planting, stride-locked speed) — genuinely new ~120-line code like
>    terrarium's hop, and a name outside the canonical registry. Only worth it
>    if theropods graduate to the marquee draw.
>
> **DECIDED (John, 2026-07-09): (a) — approximate the theropod gait on the
> `crawl` module + an upright builder pose.** Keeps the zero-new-code promise
> and lands Sinosauropteryx (a melanosome color star, §5) with no new movement
> code; the bipedal read lives entirely in the builder's animate function while
> the sim runs the existing `crawl` agent.

> **Size caveat (Dunkleosteus, Plesiosaur).** Both were huge (6 m+), past
> option (a)'s "nothing bigger than the 120g world" rule.
> **DECIDED (John, 2026-07-09): hold the giants for the future paddock /
> "Big Animals" expansion — do NOT juvenile-scale them into the glass box.**
> Paleo's glass wing ships without them; their true size ("grew as long as a
> school bus") becomes a headline reason to build the open-paddock (b) enclosure
> later, where they can be shown at real scale.

Day/night reuses `Swarm.nightFactor` unchanged — nocturnal tags drive activity
math already in `behavior.js`.

---

## 5. Species plan

**Target roster:** ~24–30 authored across three era wings when the build
starts (same cadence as every other habitat — subagents against `SPECIES_SPEC.md`),
spanning Cambrian → Recent and spread across the reused locomotion families so
each family gets a paleo showpiece. Below are **8 flagship species fully
authored in the exact `freshwater.js` schema**, spanning eras and every reused
mode. Colors are true-to-science where melanosome/pigment research gives us
real answers (**Sinosauropteryx** and **Microraptor** are the stars — real
dinosaur colors), and honestly flagged as unknown where they aren't.

### Schema deltas (consistent, minimal — mirrors the terrarium deltas)

- `water:` the **era subtype** id — `'paleozoic' | 'carboniferous' | 'mesozoic' |
  'recent'` (the CareSim subtype, i.e. the "tank"; `paleozoic` and
  `carboniferous` are the two biome looks of the Paleozoic wing).
- `era:` display string for the card (e.g. `'Cambrian seas, ~500 mya'`).
- `kind:` selects the builder — `'invert'` (invert-kit: trilobite, ammonite,
  anomalocaris), `'bug'` (flutter insect: Meganeura), `'fish'` (fishbuilder:
  Dunkleosteus), `'paleo'` (one new small builder for feathered/beaked forms:
  dodo, Archaeopteryx, theropods).
- `locomotion:` canonical registry value — `'crawl' | 'swim' | 'flutter' |
  'flight' | 'climb'` (theropods use `'crawl'` with a bipedal builder pose, §4a).
- `humidity:` 0–1 comfort center (semantics per wet/dry era, as terrarium).
- `colorConfidence:` `'known' | 'inferred' | 'unknown'` — drives the card's
  color line ("real color from fossils" vs "we don't know — best guess").
- `careConfidence:` `'evidence' | 'inferred' | 'guess'` — drives the meter band (§3).
- `diet` uses paleo food ids. Every other field is identical in name and type.

```js
export const PALEO_SPECIES = [
  {
    id: 'trilobite', common: 'Trilobite', scientific: 'Elrathia kingii',
    water: 'paleozoic', era: 'Cambrian seas, ~500 million years ago',
    kind: 'invert', adultSizeCm: 4, bioload: 1, minSchool: 4,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'bottom', locomotion: 'crawl', humidity: 1.0,
    speed: 0.4, schooling: 'loose', diet: ['detritus'], price: 20,
    archetype: 'trilobite', size: 0.9, edible: true,
    colorConfidence: 'unknown', careConfidence: 'inferred',
    colors: { base: '#4a4238', belly: '#6a6050', fin: '#2e2820',
      pattern: 'stripesH', patternColor: '#2e2820', patternScale: 1.4, iridescence: 0.15 },
    habitat: 'The floors of shallow ancient seas, all over the world.',
    facts: [
      'Trilobites had eyes made of clear stone crystals — the only animals ever known to see through lenses of rock.',
      'Fossils show they could roll up into a tight ball for protection, just like a pill bug does today.',
      'They crawled the sea floor for almost 300 million years — far longer than dinosaurs — then vanished before the first dinosaur was born.'
    ],
    care: 'Easy'
  },
  {
    id: 'ammonite', common: 'Ammonite', scientific: 'Dactylioceras commune',
    water: 'paleozoic', era: 'Jurassic seas, ~180 million years ago',
    kind: 'invert', adultSizeCm: 8, bioload: 2, minSchool: 3,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'mid', locomotion: 'swim', humidity: 1.0,
    speed: 0.5, schooling: 'loose', diet: ['plankton'], price: 35,
    archetype: 'ammonite', size: 1.0, edible: true,
    colorConfidence: 'unknown', careConfidence: 'inferred',
    colors: { base: '#c9b083', belly: '#e4d3ad', fin: '#8a6f45',
      pattern: 'stripesV', patternColor: '#8a6f45', patternScale: 1.3, iridescence: 0.5 },
    habitat: 'Open ancient oceans, drifting and jetting through the water.',
    facts: [
      'An ammonite was a cousin of today\'s octopus and squid, peeking out from a beautiful coiled shell.',
      'It squirted water to jet backwards through the sea, steering with little tentacles.',
      'We can hold thousands of their fossil shells, but nobody knows what color they were alive — a mystery the fossils just can\'t tell us.'
    ],
    care: 'Medium'
  },
  {
    id: 'anomalocaris', common: 'Anomalocaris', scientific: 'Anomalocaris canadensis',
    water: 'paleozoic', era: 'Cambrian seas, ~505 million years ago',
    kind: 'invert', adultSizeCm: 18, bioload: 8, minSchool: 1,
    temperament: 'aggressive', predator: true, finNipper: false, longFins: false,
    tags: ['soloOnly'], zone: 'mid', locomotion: 'swim', humidity: 1.0,
    speed: 0.8, schooling: 'solo', diet: ['livePrey'], price: 90,
    archetype: 'anomalocaris', size: 1.3, edible: false,
    colorConfidence: 'unknown', careConfidence: 'inferred',
    colors: { base: '#b5555a', belly: '#d98a86', fin: '#7a2f38',
      pattern: 'stripesV', patternColor: '#7a2f38', patternScale: 1.2, iridescence: 0.2 },
    habitat: 'Cruising above the sea floor of the Cambrian oceans as a top hunter.',
    facts: [
      'Its name means "strange shrimp," and it was one of the first big hunters on Earth — longer than your arm.',
      'It grabbed prey with two spiky arms and swam by rippling the flaps along its sides like an underwater curtain.',
      'Scientists first found its mouth, its arm, and its body as three separate fossils and thought they were three different animals!'
    ],
    care: 'Hard'
  },
  {
    id: 'meganeura', common: 'Giant Dragonfly', scientific: 'Meganeura monyi',
    water: 'carboniferous', era: 'Carboniferous swamps, ~300 million years ago',
    kind: 'bug', adultSizeCm: 12, bioload: 2, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: [], zone: 'top', locomotion: 'flutter', humidity: 0.7,
    speed: 1.1, schooling: 'solo', diet: ['insects'], price: 60,
    archetype: 'dragonfly', size: 1.4, edible: true,
    colorConfidence: 'unknown', careConfidence: 'guess',
    colors: { base: '#3a5a44', belly: '#5a7a58', fin: '#a8c0b0',
      pattern: 'stripesH', patternColor: '#26382c', patternScale: 1.1, iridescence: 0.6 },
    habitat: 'The steamy fern swamps of the Carboniferous, before there were any birds.',
    facts: [
      'Meganeura was a dragonfly as wide as a hawk — the biggest flying insect that ever lived.',
      'Scientists think the ancient air held far more oxygen, and that let insects grow to giant sizes.',
      'It hunted other bugs on the wing over the swamps, hundreds of millions of years before the first bird flew.'
    ],
    care: 'Medium'
  },
  {
    id: 'sinosauropteryx', common: 'Sinosauropteryx', scientific: 'Sinosauropteryx prima',
    water: 'mesozoic', era: 'Early Cretaceous, ~125 million years ago',
    kind: 'paleo', adultSizeCm: 40, bioload: 4, minSchool: 1,
    temperament: 'semi', predator: true, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'crawl', humidity: 0.5,     // biped look via builder pose (§4a)
    speed: 1.0, schooling: 'solo', diet: ['insects', 'livePrey'], price: 85,
    archetype: 'theropod', size: 1.0, edible: false,
    colorConfidence: 'known', careConfidence: 'inferred',
    colors: { base: '#b5651d', belly: '#efe2c4', fin: '#9a531a',
      pattern: 'stripesV', patternColor: '#7a3f14', patternScale: 1.5, iridescence: 0.05 },
    habitat: 'Fern-covered floodplains of ancient China.',
    facts: [
      'It was the very first dinosaur ever found with fuzzy feathers all over its body.',
      'From tiny colour-sacs preserved in its fossils, scientists learned it was really ginger-orange with a striped tail — a real dinosaur colour!',
      'It wore a dark "bandit mask" of feathers across its eyes, a little like a raccoon.'
    ],
    care: 'Medium'
  },
  {
    id: 'microraptor', common: 'Microraptor', scientific: 'Microraptor gui',
    water: 'mesozoic', era: 'Early Cretaceous, ~120 million years ago',
    kind: 'paleo', adultSizeCm: 42, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: [], zone: 'arboreal', locomotion: 'flight', humidity: 0.6,
    speed: 0.9, schooling: 'solo', diet: ['insects', 'livePrey'], price: 95,
    archetype: 'raptor', size: 0.85, edible: false,
    colorConfidence: 'known', careConfidence: 'inferred',
    colors: { base: '#1b1b24', belly: '#2a2a34', fin: '#0e0e16',
      pattern: 'none', patternColor: '#3a4a8a', patternScale: 1.0, iridescence: 0.9 },
    habitat: 'Forests of ancient China, gliding between the trees.',
    facts: [
      'Microraptor had wings on all four legs — it could glide from tree to tree like a feathery paper airplane.',
      'Its fossils show its feathers were glossy black with a rainbow shimmer, like a crow shining in the sun.',
      'It was one of the smallest dinosaurs ever, only about the size of a pigeon.'
    ],
    care: 'Hard'
  },
  {
    id: 'archaeopteryx', common: 'Archaeopteryx', scientific: 'Archaeopteryx lithographica',
    water: 'mesozoic', era: 'Late Jurassic, ~150 million years ago',
    kind: 'paleo', adultSizeCm: 45, bioload: 3, minSchool: 1,
    temperament: 'peaceful', predator: true, finNipper: false, longFins: false,
    tags: [], zone: 'arboreal', locomotion: 'flutter', humidity: 0.55,
    speed: 0.7, schooling: 'solo', diet: ['insects'], price: 100,
    archetype: 'archaeopteryx', size: 0.95, edible: false,
    colorConfidence: 'inferred', careConfidence: 'inferred',
    colors: { base: '#3a352e', belly: '#8a7f66', fin: '#1e1a14',
      pattern: 'patches', patternColor: '#1e1a14', patternScale: 1.2, iridescence: 0.1 },
    habitat: 'Warm island lagoons of Jurassic Europe, fluttering among the trees.',
    facts: [
      'Archaeopteryx is a perfect "in-between" animal — it had feathers and wings like a bird but teeth and a long bony tail like a dinosaur.',
      'One of its fossil feathers still held colour-sacs, and they showed it was black — one of the first real colours ever found for such an ancient animal.',
      'It probably could not fly far, and most likely fluttered and glided between the trees.'
    ],
    care: 'Hard'
  },
  {
    id: 'dodo', common: 'Dodo', scientific: 'Raphus cucullatus',
    water: 'recent', era: 'Died out ~1680, less than 350 years ago',
    kind: 'paleo', adultSizeCm: 70, bioload: 8, minSchool: 2,
    temperament: 'peaceful', predator: false, finNipper: false, longFins: false,
    tags: [], zone: 'ground', locomotion: 'crawl', humidity: 0.5,
    speed: 0.4, schooling: 'loose', diet: ['fruit', 'ferns'], price: 120,
    archetype: 'dodo', size: 1.3, edible: false,
    colorConfidence: 'inferred', careConfidence: 'inferred',
    colors: { base: '#8a8378', belly: '#a8a196', fin: '#c8a850',
      pattern: 'none', patternColor: '#c8a850', patternScale: 1.0, iridescence: 0.05 },
    habitat: 'The island of Mauritius in the Indian Ocean — and nowhere else on Earth.',
    facts: [
      'The dodo lived only on one island with no enemies, so it never learned to be afraid of anything.',
      'It could not fly and ate fallen fruit; it may even have helped a special tree, the tambalacoque, by eating its big seeds.',
      'The last dodo died over 300 years ago, and every picture we have was drawn from memory or a few bones — so even its exact colour is partly a guess.'
    ],
    care: 'Medium'
  },
];
```

### The rest of the roster (authored at build time, per era wing)

| Wing | Also planned | Reused mode |
|---|---|---|
| **Paleozoic** | Opabinia, Hallucigenia, Wiwaxia (crawl); Orthoceras, Eurypterid/sea-scorpion (swim/crawl); Helicoprion (swim). *Dunkleosteus held for the Big-Animals paddock — too big.* | crawl, swim |
| **Mesozoic** | **Compsognathus** (crawl, biped pose §4a); Psittacosaurus (crawl, *real countershaded color* — another melanosome star); small pterosaur / juvenile (flight); Confuciusornis (flutter). *Plesiosaur held for the Big-Animals paddock — too big.* | crawl, swim, flutter, flight |
| **Recent** | Great Auk, Passenger Pigeon, Carolina Parakeet (flutter/flight); Moa chick (crawl); Thylacine (crawl — *filmed, so gait is known!*) | crawl, flutter, flight |

Note the two extra melanosome/pigment stars available: **Psittacosaurus**
(known reddish-brown countershading, Vinther 2016) and **Borealopelta** if a
future big-animal wing opens. Those go where real color is a headline.

---

## 6. Retention mechanics + the paleo hook

All four `HABITAT_VISION` mechanics, made concrete for Paleo:

1. **Care debt (offline decay).** `CareSim.applyOffline()` loops era wings
   exactly as it loops `['fresh','salt']`. Neglect drops **Vitality**; at severe
   neglect the animal **fades back into a fossil** (fossil-fade, decided below)
   and must be re-excavated via the dig-brush sequence — a real consequence with
   no permanent loss.
2. **Growth & babies.** Juvenile → adult via the existing `f.growth` path. A
   revived Archaeopteryx or dodo grows up in your care; the growth reveal card
   fires as today. Breeding is muted for most (they're precious/unique), but
   trilobites and ammonites can shoal-breed like livebearers — a gentle "your
   ancient sea is thriving" beat.
3. **Collection book.** Each species unlocks a card — with the §3 confidence
   stamps and the color-confidence line. The book itself becomes a **timeline**:
   a scrollable "Tree of Time" from Cambrian to Recent, filling in as you
   excavate. Reuses the discovered-list plumbing (`state.discovered`).
4. **Surprises.** A trilobite curls into a ball when tapped; a Meganeura molts
   (reuse terrarium molt prop); an ammonite's shell catches an iridescent
   glint at a certain camera angle; anomalocaris ambushes a trilobite
   on-screen (`_devour`) — a real Cambrian food-web moment.

### The paleo hook: fossil-dig acquisition (shop replacement)

Instead of tapping "buy" in a coin shop, **you excavate new species from rock.**
This reuses the wipe/scrub gesture (`scrubAlgae` / `pointermove` brushing) as
**brushing away rock** — the same muscle memory as cleaning the glass, repointed
at a fossil block. The same dig-brush sequence is *also* the fossil-fade recovery
path (a neglected animal that has faded back into rock is re-excavated here), so
per John's call it is a **first-class specced system**, not an optional flourish.

**Flow:** each era wing has a **dig site** (a rock face beside the tank). Tap it
to reveal a buried fossil block (a silhouette hidden under a `CanvasTexture` of
rock — the same one-canvas-repaint trick the ant farm uses for soil). Brush with
`pointermove`; each stroke clears rock in a radius (identical math to
`scrubAlgae(0.015)` + sparkle particles), slowly revealing the fossil's shape.
When cleared, the species is **identified** (card unlocks, added to the
timeline) and you choose to **revive** it into the matching era wing — the
CareSim "add" path, unchanged. Dig sites refresh on a real-clock timer (a new
block every few hours / offline), so digging is the daily draw.

- **Reuse:** brushing = `scrubAlgae` gesture; rock canvas = ant-farm
  `CanvasTexture` painter; reveal sparkle = existing scrub particles; add-to-wing
  = `addFish`. No new systems, one new screen.
- **Coin fit:** coins still exist (earned by healthy wings) and can either be
  removed here (dig replaces spend) or kept as a "buy a dig permit / era pass"
  sink. See decision.
- **Scope flag:** the dig screen + rock-brush canvas + a "which fossil is
  buried" table is **~1 new UI screen and one CanvasTexture painter** — modest,
  and almost entirely copied from ant-farm soil + aquarium scrub. The gacha-ish
  "what will I dig up?" surprise is a strong retention beat that no coin shop
  gives. **Recommended as the acquisition model for Paleo specifically.**

> **DECIDED (John, 2026-07-09): (c) — fossil-dig to discover/unlock + coins to
> revive.** You brush rock to *discover/unlock* a species (adds its card to the
> timeline), then spend coins to *revive* it into the matching era wing.
> Discovery-by-dig is the magic; coin-to-revive keeps the earn loop and the
> `rules.js` cost gate intact.

> **DECIDED (John, 2026-07-09): FOSSIL-FADE (reversible).** A neglected animal
> **fades back into a fossil** — a gentle, non-scary transition, no death card —
> and is **re-excavated via the dig-brush sequence** (§6 hook). A real reason to
> care with no permanent loss: "you can't lose them twice," and never the lesson
> that a 6-year-old re-killed the dodo. It reuses the ant-farm's blessed
> reversible-consequence pattern. John explicitly **accepts the added build
> complexity** of the dig/excavate sequence for the fun factor, so that sequence
> is specced as a first-class system (§6), not an optional flourish.
> On-screen **predation** (anomalocaris eating a trilobite) is a separate axis,
> governed by the **game-wide Nature-scenes parent toggle** (default shown,
> matter-of-fact, no gore; alternative = off-screen event) — not a Paleo-specific
> flag.

---

## 7. Performance budget (S24-class, 60 fps)

Paleo is a **low-count** habitat by nature — extinct animals are rare and
precious, so a wing holds a handful, not a 42-fish crowd. It reuses the
aquarium's proven budget with headroom to spare.

| System | Budget | Approach |
|---|---|---|
| Agents (per wing) | **≤ 20 simulated + rendered** (well under aquarium's 42) | Same `Swarm.update` loop, same per-frame agent cost. Extinct animals are showpieces, not schools; only trilobites/ammonites cluster (loose, cheap boids). |
| Locomotion | 0 new hot paths | Every mode already ships and is profiled: swim, crawl, climb, flutter, flight. The approximated theropod gait (§4) is a `crawl` agent in the sim + a builder pose — no extra sim cost. |
| Species visuals | Reuse builders | Invert-kit (trilobite/ammonite/anomalocaris) + fishbuilder (Dunkleosteus) reuse existing lofted-body + pattern shader. One new small `paleobuilder` for feathered/beaked forms (dodo, Archaeopteryx, theropods) — same `onBeforeCompile` PBR approach, no new shader tech. |
| Environment | 2–3 quads + reused water stack | Glass box + substrate + era backdrop. Water stack (surface/caustics/bubbles) is on only in the wet era, exactly one era at a time. |
| Fossil-dig canvas | 1 offscreen `CanvasTexture`, repaint on brush strokes only | Same cost profile as ant-farm soil + aquarium scrub overlay — a few cell repaints per second while actively brushing, idle otherwise. |
| Confidence layer | ~0 | Pure data + label rows in the card UI. No per-frame cost. |
| Shadows / post | None added | Match aquarium settings. |

Offline: `applyOffline()` runs the per-wing decay it already runs; the reveal
card ("while you were away, a fossil surfaced at the Mesozoic dig") reuses the
event/reveal plumbing. No new offline simulation like the ant colony needs.

---

## 8. MVP cut

Prove the finale's thesis — *every locomotion family reused, zero new movement
code* — with the smallest roster that spans the reused modes, one dig site, and
the confidence layer.

| Species | Wing | Locomotion | Why it's in |
|---|---|---|---|
| Trilobite | Paleozoic | crawl (exists) | zero-new-code crawl agent; the "roll into a ball" surprise; cheap shoal |
| Ammonite | Paleozoic | swim (exists) | swim reuse + the "we don't know its color" fact, the confidence layer's poster child |
| Anomalocaris | Paleozoic | swim + eel-wave (exists) | predator drama via `canEat` (eats trilobites); apex-hunter wow |
| Meganeura | Paleozoic (Carboniferous swamp) | flutter (butterfly) | proves the flutter family carries over + the wet→dry sub-theme; giant-bug wow |
| Sinosauropteryx | Mesozoic | `crawl` **approximating a biped** (§4a) | the **real ginger dinosaur color** star, with no new movement code |
| Dodo | Recent | crawl (floor + waddle) | the emotional headliner; the tambalacoque fact; three-wing coverage |

**Systems in MVP:** Paleo environment builder carrying **every era theme the
roster touches** — `paleozoic` marine (wet) + `carboniferous` swamp (dry) +
`mesozoic` (dry) + `recent` (dry). The roster spans all three era **wings**
(trilobite/ammonite/anomalocaris are Paleozoic-marine, Meganeura is the
Paleozoic wing's dry Carboniferous swamp, Sinosauropteryx is Mesozoic, the dodo
is Recent), so the honest MVP must ship all of them — they are cheap (one theme
object each) and together they prove both the era-switch *and* the wet↔dry
surface toggle (Meganeura would otherwise fly in a flooded tank). Plus
glass-grime + habitat-quality meters (reused); the confidence layer (meter bands
+ card provenance stamps — this is the brand, ship it); fossil-dig acquisition at
**one** dig site (discovery-by-brush) with **coin-to-revive** (decision (c)),
and the fossil-fade recovery it doubles as; foods `detritus / plankton /
livePrey / insects / fruit`; `paleobuilder` archetypes `dodo` + `theropod`, plus
invert-kit `trilobite / ammonite / anomalocaris` and flutter `dragonfly`.

**Deferred to v2+:** Microraptor + Archaeopteryx (need the aviary flight family
+ branch-perch polish); Dunkleosteus/Plesiosaur (held for the Big-Animals
paddock — decided); a real dedicated biped locomotion module (only if theropods
graduate to marquee); the open-paddock enclosure option (b) as a "Big Animals"
expansion; multi-dig-site + timeline "Tree of Time" full art.

**Build order** (each step demoable to the 6-year-old QA department): era
environment + theme switch → invert-kit trilobite/ammonite walking & swimming
in a re-themed tank → confidence-layer card + meter bands → fossil-dig brush
screen → Sinosauropteryx via crawl-as-biped → dodo + Meganeura → predation
reveal (anomalocaris eats a trilobite) → offline dig reveal card.
