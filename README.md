# 🐠 Aqua — My Fish Tank

A photorealistic-styled virtual aquarium for kids. Real fish, real behaviors, real
consequences. Built for John's son: tap a fish to learn about it, feed it, and keep
the tank healthy or the fish get sick.

**Play:** open `index.html` in any modern browser. It's a single self-contained file —
no internet needed after loading. Works great on phones (add to home screen for
full-screen).

## What's in it

- **Two 120-gallon tanks** — freshwater 🌿 and saltwater 🐚, each with its own save.
- **154 real animals** — 76 freshwater fish, 58 saltwater fish, 20 invertebrates
  (shrimp, snails, crabs, anemones), every one a real species with true colors,
  natural habitat, and 3 kid-friendly facts.
- **Lifelike movement** — procedural fish with spine-undulation swimming, tail-beat
  that speeds up with effort, paddling pectoral fins, banking turns, and hovering.
- **Real behavior** — schooling (boids), depth zones (top/mid/bottom dwellers),
  feeding-time congregation at the front glass when you open the app hungry.
- **4 foods with real physics** — flakes float then sink, pellets drop fast, algae
  wafers sink to the bottom for catfish, bloodworms are a treat. Fish only eat what
  their species actually eats, at the depth they feed.
- **Predator & prey** — predators (like the lionfish) hunt and eat fish small enough
  to fit in their mouth; prey startle and flee. The shop warns you before you mix them.
- **Care with stakes** — hunger, water quality, and algae all change over time, even
  while the app is closed. Neglect and fish sicken, then die. Good care earns coins.
- **Wipe the glass** — when algae builds up, drag your finger across the glass to
  scrub it clean.
- **Ecosystem rules** — the shop enforces what a real 120g can hold: bioload capacity,
  one betta per tank, schooling minimums, predator/prey and fin-nipping warnings,
  coldwater-vs-tropical mismatches. No mako sharks, no 200 tuna.
- **Tap to learn** — tap any fish for its name, scientific name, wild habitat, facts,
  and health; name your favorites.

## Develop

```bash
npm install
npm run build      # bundles src/ into a single index.html
```

Source lives in `src/`. Species data is in `src/species/`.
