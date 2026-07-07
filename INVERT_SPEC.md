# Invertebrate Data Specification

Read SPECIES_SPEC.md first — inverts use the SAME schema with a few additions/changes below.

Write `/root/fishtank/src/species/inverts.js`:
`export const INVERT_SPECIES = [ ... ]` — EXACTLY 20 real aquarium invertebrates,
roughly 10 freshwater (`water:'fresh'`) and 10 saltwater (`water:'salt'`).

## Differences from the fish schema

- `kind: 'invert'`  (fish files implicitly are kind 'fish'; set this on every invert)
- `archetype` is one of the INVERT archetypes below (NOT the fish ones)
- `zone` is almost always `'bottom'` (crawlers) or `'glass'` (grazers on glass) — a few
  like feather dusters/anemones are `'fixed'` (sessile, don't move)
- `schooling`: use `'solo'` or `'loose'`
- `speed`: inverts are slow, 0.15 .. 0.5 (anemones/feather dusters 0)
- `diet`: what they eat — subset of 'algae','flake','pellet','frozen','detritus'
- add `edible: true|false` — true if fish predators can eat it (shrimp=true, snail=false,
  cleaner shrimp=false because fish leave them alone, anemone=false, hermit=false)
- add `cleans: true|false` — true if it helps the tank (eats algae/detritus): most inverts true
- `minSchool`: 1 for most; shrimp look best in groups so 3+ if you like
- `predator`: false for all these inverts
- `bioload`: 1 for small (shrimp/snail), 2 for crabs/anemone, 3 for larger

## INVERT archetypes (I will model these specially)

- `shrimp`     — cherry shrimp, amano shrimp, cleaner shrimp, peppermint, fire shrimp (curved body, long antennae, crawls & darts)
- `snail`      — nerite, mystery, trochus, turbo, nassarius (shell + foot, glides on glass)
- `crab`       — hermit crab, emerald crab, porcelain crab (sideways scuttle)
- `crayfish`   — dwarf crayfish, lobster-ish (claws, walks bottom)
- `star`       — starfish, brittle star, chocolate chip star (5 arms, very slow crawl)
- `urchin`     — sea urchin (spiny dome, barely moves)
- `anemone`    — bubble-tip anemone, condy (sessile, tentacles sway) — zone 'fixed'
- `featherduster` — feather duster worm (tube + feathery crown, retracts) — zone 'fixed'

## Required inverts

Freshwater: cherry shrimp, amano shrimp, ghost shrimp, nerite snail, mystery snail,
dwarf crayfish, assassin snail, ramshorn snail, bamboo/wood shrimp, malaysian trumpet snail.

Saltwater: skunk cleaner shrimp (edible false), peppermint shrimp, blood/fire shrimp,
scarlet hermit crab, emerald crab, turbo snail, nassarius snail, bubble-tip anemone
(archetype 'anemone', zone 'fixed', tags ['hostsAnemone']), feather duster worm
(archetype 'featherduster', zone 'fixed'), chocolate chip starfish.

Colors true to life (cherry shrimp bright red '#d61f1f'; amano translucent grey-green with
dotted line; bubble-tip anemone often '#8a3b6b' or '#c96a2a' tips). Pattern usually 'none'
or 'spots'. Give iridescence low (0..0.3) except shrimp a touch higher.

3 TRUE kid-friendly facts each, one-sentence real habitat, care rating.

## Validate after writing

node --input-type=module -e "import('/root/fishtank/src/species/inverts.js').then(m=>{const s=m.INVERT_SPECIES;console.log('count',s.length);const ids=new Set();for(const f of s){if(ids.has(f.id))throw new Error('dup '+f.id);ids.add(f.id);for(const k of ['id','common','scientific','water','kind','adultSizeCm','bioload','minSchool','temperament','zone','speed','schooling','diet','edible','cleans','price','archetype','size','colors','habitat','facts','care'])if(f[k]===undefined)throw new Error(f.id+' missing '+k);if(f.facts.length!==3)throw new Error(f.id+' facts!=3');if(f.kind!=='invert')throw new Error(f.id+' kind');}const fresh=s.filter(x=>x.water==='fresh').length,salt=s.filter(x=>x.water==='salt').length;console.log('fresh',fresh,'salt',salt);console.log('OK')})"

Must print count 20 and OK. Final message: report counts and any deviations.
