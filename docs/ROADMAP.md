# Habitat — Full Roadmap

**Decided by John, 2026-07-08: all habitats below are official.** Order
alternates big swings with cheap wins so every engine investment pays twice.
Each habitat is built on its own branch (`habitat/<name>`), extracting only
the engine pieces it needs (see `ENGINE_SPLIT.md` note), aquarium regression-
tested before merge.

**UI decision (John, 2026-07-08):** no habitat-selector redesign per habitat.
The fresh/salt toggle stretches as far as it can; once the habitats are done
and tested, the home screen becomes a full **Pet Shop UI** — designed then,
against real content, as its own project. Don't design it early.

## The lineup

| # | Habitat | Branch | Tech family | New tech | Stars | Status |
|---|---------|--------|-------------|----------|-------|--------|
| 1 | **Aquarium** | `main` | — (reference pack) | — | 202 species, fresh + salt | **Live** |
| 2 | **Terrarium** | `habitat/terrarium` | Terrarium (new) | hop locomotion, branch perch, humidity/temp meters, herpbuilder | Geckos, ball python, tarantulas, dart frogs (30 species, spec final) | Specced — `TERRARIUM_SPEC.md` |
| 3 | **Firefly Jar** | `habitat/fireflyjar` | Terrarium | glow shader, synchronized-blink behavior | Fireflies, moths, crickets you hear | Idea — tiny scope, night-only magic; proves the habitat-pack pattern at minimal size |
| 4 | **Ant Farm** | `habitat/antfarm` | Cross-section grid (new) | dig-grid CanvasTexture, pheromone field, castes, colony-as-pet | Queen (real death stakes — decided), 48 hero + ~400 crowd ants | Specced — `ANTFARM_SPEC.md` |
| 5 | **Tide Pool** | `habitat/tidepool` | Aquarium | wave-surge shader, real-clock tide cycle | **Octopus** (smartest pet in the game), sea stars, urchins, anemones | Idea |
| 6 | **Bee Hive** | `habitat/beehive` | Cross-section grid | hex comb grid (dig-grid sibling), waggle dance, honey stores | Queen, foragers, comb filling cell by cell | Idea — strongest ant-farm sibling |
| 7 | **Paludarium** | `habitat/paludarium` | Aquarium + Terrarium merged | water-line split rendering, amphibious agents | Mudskippers, fiddler crabs, turtles; **absorbs Pond** (koi, tadpoles→frogs) **and Crabitat** (hermit-crab shell-swap) | Idea — was always "free once 1+2 exist" |
| 8 | **Butterfly Garden** | `habitat/butterflygarden` | Flight (new, gentle intro) | flutter flight, **metamorphosis over real days** (caterpillar → chrysalis → butterfly = the retention loop made structural) | Monarchs, atlas moth, resident mantis | Idea |
| 9 | **Aviary** | `habitat/aviary` | Flight (full) | true 3D flight boids (≈ swim boids + gravity + perching), synth birdsong | Parrots, owls (nocturnal!), hummingbirds | Idea — most-begged-for, biggest build |
| 10 | **Paleo Paddock** | `habitat/paleo` | ALL families | none — the payoff habitat: every prior locomotion mode reused for extinct animals | Trilobites (crawl), ammonite (swim), dodo (ground), Meganeura (flutter); giants (plesiosaur+) parked for a later expansion | Specced — `PALEO_SPEC.md` (Lab Vivarium + era switch, fossil-dig, fossil-fade stakes) |

**Content pack, not a habitat:** **Reef expansion** — corals + live rock for
the existing salt tank, coral growth over real weeks, clownfish hosting.
Slots in anywhere as filler between habitats.

## Sequencing logic

- **2→3**: Firefly Jar right after Terrarium reuses its brand-new pack
  plumbing while it's fresh, at 1/10th the scope — a fast win for the kid
  between two big builds.
- **4→6**: Bee Hive lands after Ant Farm for the same reason — the comb grid
  is the dig grid with hexes.
- **5**: Tide Pool is the aquarium family's second habitat; cheap any time,
  placed mid-roadmap as a breather before the merge-tech of Paludarium.
- **8→9**: Butterfly's flutter is the training wheels for Aviary's full
  flight; build the cheap version of the tech first, same as hop-before-
  flight.
- **10 last**: Paleo is pure reuse — it gets better the more locomotion
  families exist, and it's the finale-grade hook.

## Per-habitat shipping bar (from `HABITAT_VISION.md`)

Every habitat ships with all four retention mechanics: care debt (offline
decay), growth & babies (or its structural equivalent — colony growth,
metamorphosis, coral growth), collection book entries, and surprise events.
Plus real species, true colors, real facts, husbandry-accurate care.

## Species roster status

| Habitat | Roster |
|---|---|
| Aquarium | 178 authored (76 fresh fish, 58 salt fish, 44 inverts) |
| Terrarium | 30 authored in spec |
| Ant Farm | species-of-ant list TBD (harvester colony first, per spec §MVP) |
| All others | rosters authored per-habitat when its build starts (subagents against `SPECIES_SPEC.md`, same as always) |

## Decisions log

**2026-07-08:**
- Branch per habitat; engine split incremental per habitat (`ENGINE_SPLIT.md`).
- Snake feeding: parent toggle, default shown matter-of-fact (`TERRARIUM_SPEC.md`).
- Queen death: real stakes with big escalating warnings (`ANTFARM_SPEC.md`).
- Pet Shop UI: after habitats are done and tested, not before.
- Paleo Paddock: in.

**2026-07-09 (all 8 remaining specs authored + John's decision round):**
- **Nature-scenes law (GAME-WIDE):** the snake-feeding call is now global. One
  parent setting governs ALL on-screen predation in every habitat (femme-fatale
  firefly, turtle, owl, octopus, mantis, paleo, future packs): default =
  shown, matter-of-fact, no gore; alternative = off-screen event. Supersedes
  every per-habitat predation flag.
- Butterfly Garden: full generational cycle — adults lay eggs before a gentle
  fade, the garden self-renews, the Book celebrates generations.
- Firefly Jar: matter-of-fact lifecycle, no guilt machinery around release —
  keep-with-care works, release exists as an action, short real lives are fine.
- Paleo: fossil-fade instead of death — neglected animals fade back into a
  fossil and are re-excavated via the dig-brush sequence (build complexity
  accepted for the fun factor). Lab Vivarium glass box + era switch; fossil-dig
  discovery + coin shop hybrid; giants parked for a later expansion.
- Tide Pool: REAL lunar semidiurnal tides (12.42 h, drifting ~50 min/day);
  octopus ships at the escape-artist tier (~150 lines), smarter tiers later.
- Reef: bleaching stakes tiered by hardiness — soft corals always recover,
  stony corals can die (skeleton remains).
- Bee Hive bundle: hybrid porch foraging (tube exit, visible loaded returns),
  "share the surplus" honey harvest, colony-first safety onboarding with
  stingless drones spotlighted, staged collection (honeybees deep first).
- **All other flagged decisions: writers' recommendations adopted** — each
  spec's DECISION FOR JOHN blocks are being stamped DECIDED accordingly; John
  can overturn any individually later.
