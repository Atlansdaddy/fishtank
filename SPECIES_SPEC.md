# Species Data Specification

Each species file exports a single const array of species objects (plain JS, ES module).

- `/root/fishtank/src/species/freshwater.js` → `export const FRESHWATER_SPECIES = [ ... ]`
- `/root/fishtank/src/species/saltwater.js` → `export const SALTWATER_SPECIES = [ ... ]`

At least 50 species per file. Every species MUST be suitable for (or at least commonly kept in)
a 120-gallon home aquarium. No open-ocean pelagics, no fish that outgrow 120g badly
(no red-tail catfish, no pacu, no full-size sharks/groupers/tuna).

## Schema (every field required unless marked optional)

```js
{
  id: 'neon_tetra',              // unique snake_case
  common: 'Neon Tetra',
  scientific: 'Paracheirodon innesi',
  water: 'fresh',                // 'fresh' | 'salt' (match the file)
  adultSizeCm: 3,                // realistic adult length in cm
  bioload: 1,                    // 1=tiny (neon), 2=small (guppy/clown), 4=medium (angelfish/damsel),
                                 // 8=large (severum/foxface), 14=very large (oscar-ish/large tang/lionfish)
  minSchool: 6,                  // minimum happy group size; 1 = fine alone; 2 = pair
  temperament: 'peaceful',       // 'peaceful' | 'semi' | 'aggressive'
  predator: false,               // true if it eats tankmates that fit in its mouth
  finNipper: false,              // nips long fins
  longFins: false,               // has vulnerable long fins
  tags: [],                      // optional flags: 'soloOnly' (bettas, some cichlids/tangs vs own kind),
                                 // 'coldwater' (goldfish), 'expertDiet' (mandarin), 'hostsAnemone' (clownfish),
                                 // 'jumper', 'nocturnal'
  zone: 'mid',                   // 'top' | 'mid' | 'bottom' | 'all'  (where it swims)
  speed: 1.0,                    // relative cruise speed 0.3 (seahorse) .. 1.6 (danio)
  schooling: 'tight',            // 'tight' | 'loose' | 'solo' | 'pair'
  diet: ['flake','frozen'],      // subset of: 'flake','pellet','algae','frozen'
                                 // flake=flake food, pellet=sinking pellet, algae=algae wafer, frozen=bloodworms/brine
  price: 3,                      // whole dollars, realistic-ish pet store price
  archetype: 'torpedo',          // see archetype list below
  size: 1.0,                     // visual scale multiplier within its archetype (0.6..1.6)
  shape: { height: 1.0, finFlow: 1.0 },  // optional tweaks: body height multiplier, fin flowiness
  colors: {
    base: '#3a6ea8',             // main body color (hex)
    belly: '#e8e8e0',            // underside
    fin: '#88aacc',              // fin color
    pattern: 'lateralStripe',    // 'none'|'stripesV'|'stripesH'|'lateralStripe'|'spots'|'clownBands'|
                                 // 'patches'|'gradientTail'|'eyespot'
    patternColor: '#ff2222',
    patternScale: 1.0,           // pattern density/size, 0.5..2.0
    iridescence: 0.6             // 0..1 metallic shimmer (neons/rainbowfish high, cories low)
  },
  habitat: 'Blackwater streams of the Amazon basin in South America.',  // one sentence, real
  facts: [                       // exactly 3, kid-friendly (age ~6, read aloud by a parent), true facts
    'Its glowing blue stripe helps the school stay together in dark water.',
    'A group of neon tetras all turn at the same moment, like magic.',
    'At night its bright colors fade so predators cannot see it sleeping.'
  ],
  care: 'Easy'                   // 'Easy' | 'Medium' | 'Hard'
}
```

## Archetypes (pick the closest; use size/shape to fine-tune)

torpedo (tetras, barbs, danios, rasboras, wrasses, chromis-ish), angelfish (tall triangular,
trailing fins), discus (round pancake), tang (oval compressed w/ big dorsal+anal: tangs,
butterflyfish, foxface), clown (small ovate rounded fins: clownfish, damsels, dottybacks),
gourami (oval + thread fins), livebearer (small, big tail: guppies/mollies/platys/swordtails),
betta (huge flowing fins), cory (small armored catfish, barbels, bottom), pleco (flat
suckermouth), loach (cylindrical elongate), eel (ribbon-elongate: kuhli loach, engineer goby),
shark (torpedo + tall triangle dorsal: bala/rainbow/red-tail shark), puffer (round ball),
boxfish (cube-ish), goby (small bottom sitter, big head: gobies, blennies, hawkfish),
lionfish (fan pectorals, spiky dorsal), seahorse (upright), goldfish (round belly, double fancy
tail), cichlid (stocky oval: rams, apistos, kribs, severum, anthias-ish ok too)

## Content requirements

- FRESHWATER must include these crowd favorites: neon tetra, cardinal tetra, guppy, betta,
  angelfish, discus, a corydoras or two, bristlenose pleco, fancy goldfish (tag 'coldwater'),
  kuhli loach, dwarf gourami, german blue ram, tiger barb (finNipper true), zebra danio,
  cherry shrimp is NOT a fish — skip inverts. Fill the rest with real popular community species.
- SALTWATER must include: ocellaris clownfish (tags ['hostsAnemone']), blue tang, yellow tang,
  royal gramma, mandarin dragonet (tags ['expertDiet'], diet ['frozen']), green chromis,
  firefish, a goby or three, a blenny, six line wrasse, banggai cardinalfish, flame angelfish,
  coral beauty, volitans lionfish (predator true, bioload 14), valentini puffer, longhorn
  cowfish or yellow boxfish, a seahorse (tags ['expertDiet']), foxface rabbitfish, lawnmower
  blenny (diet includes 'algae'). Fill the rest with real popular reef/FOWLR species.
- Colors must be TRUE to the real fish. Look-alike accuracy matters more than variety.
- Facts must be TRUE and specific to the species (behavior, biology, wild habitat, defense
  tricks). No filler like "it is a pretty fish".
- Keep total species with bioload >= 8 to a minority; most should be community-sized.
- Every id unique. Valid JS only — no trailing commas issues, no comments needed inside data.
