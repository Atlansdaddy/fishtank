# Habitat — Product Vision

**One line:** the pets you want but can't have.

Kids fall in love with animals they will never be allowed to keep — a shark, a
tarantula, a snake, an ant colony. Habitat gives them those pets for real-ish:
realistic look and behavior, real care consequences, real facts. Calm, no ads,
no dark patterns, safe for a 6-year-old to own outright.

## What Habitat is

- **Realistic, not cartoon.** Procedural animals with true colors and real
  scientific names (see `src/species/freshwater.js` — every fish already ships
  with `scientific`, `habitat`, and 3 kid-true `facts`). That bar holds for
  every habitat.
- **Educational by accident.** The care sim (`src/sim.js` CareSim) teaches
  cause and effect: skip feeding and pets sicken; ecosystems have rules
  (`src/rules.js` blocks a shark in a 120g, warns about predators). Kids learn
  husbandry without a single quiz.
- **Calm.** No timers screaming at you. Day/night follows the real clock
  (`rawDayFactor()` in `src/main.js`). Nocturnal animals wake when the kid's
  lights go out.
- **Yours.** Offline-first, localStorage saves, zero accounts, zero ads.

## The lineup

| # | Habitat | Status | The "can't have" hook |
|---|---------|--------|----------------------|
| 1 | **Aquarium** | Live (fresh + salt, 154 species) | A 120-gallon show tank in your pocket |
| 2 | **Terrarium** | Next — cheap build, max engine reuse | Snakes, geckos, tarantulas, dart frogs |
| 3 | **Ant Farm** | The big swing — new sim tech | A living colony that digs while you sleep |
| 4 | **Paludarium** | Later — merges 1+2 tech | Half water, half land: crabs, mudskippers, frogs |

Sequencing logic: Terrarium reuses ~80% of the engine (glass box, care meters,
crawler locomotion, shop rules) and proves the "habitat pack" split
(`docs/ENGINE_SPLIT.md`). Ant Farm is the marquee feature that no competitor
has and funds itself on word-of-mouth ("my ants dug a new room last night").
Paludarium is free once the first three exist.

## One engine, habitat packs

Everything ships in one app. The engine owns: care simulation with offline
decay, agent locomotion modes, ecosystem rules, day/night, sound, shop/UI
shell, coins. A habitat pack declares: an environment builder, a species list,
care-meter tuning, foods, and which locomotion modes it uses. Full contract in
`docs/ENGINE_SPLIT.md`.

## The retention loop (every habitat must ship with all four)

Being built into the aquarium now; it is the template, not an option:

1. **Care debt.** Offline decay (`CareSim.applyOffline`, capped at
   `SIM.OFFLINE_CAP_HOURS`) means the pets genuinely need you back.
2. **Growth & babies.** Juveniles grow into adults with good care
   (`f.growth`, `SIM.GROW_DAYS`); breeding/babies is the next layer. Ant Farm
   is this loop made structural — the colony itself grows.
3. **Collection book.** Every species owned unlocks its card (facts, habitat,
   record size). Gotta-collect across 150+ fish, 30 herps/bugs, ant species.
4. **Surprises.** Molts left behind, a predator strike, an escape attempt, a
   night-only behavior you catch once — small unscripted moments that make the
   tank feel alive and worth checking daily.

## Non-goals

No multiplayer, no gacha, no energy meters, no push-notification nagging.
The animals are the retention mechanic.
