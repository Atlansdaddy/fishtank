// All world units are centimeters.
// 120-gallon "show tank": 48" x 24" x 24" interior.
export const TANK = {
  W: 122,   // interior width  (x)
  H: 61,    // interior height (y)
  D: 61,    // interior depth  (z)
  GLASS_T: 1.2,
  WATER_LEVEL: 55,     // water surface height from sand
  SAND_H: 4.5,         // substrate depth
  GALLONS: 120,
};

// Interior swim bounds (soft walls for fish AI)
export const BOUNDS = {
  minX: -TANK.W / 2 + 5,
  maxX: TANK.W / 2 - 5,
  minY: TANK.SAND_H + 2.5,
  maxY: TANK.WATER_LEVEL - 3,
  minZ: -TANK.D / 2 + 5,
  maxZ: TANK.D / 2 - 5,
};

export const CAPACITY = {
  bioload: 130,        // total bioload points a 120g supports
  maxFish: 42,         // hard cap (performance + sanity)
};

// Simulation tuning. Times in real-world hours.
export const SIM = {
  HUNGER_HOURS: 16,          // 0 -> starving in this many hours
  STARVE_DAYS: 3.5,          // full health -> death while starving
  SICK_THRESHOLD: 0.4,       // health below this = visibly sick
  WATER_DECAY_DAYS: 9,       // pristine -> bad at full bioload
  ALGAE_DAYS: 4,             // clean glass -> covered
  UNEATEN_POLLUTION: 0.006,  // water quality hit per rotted food item
  OFFLINE_CAP_HOURS: 96,     // max elapsed decay applied on return
  HEAL_HOURS: 30,            // full recovery time when fed + clean water
  GROW_DAYS: 5,              // juvenile -> adult, given food + decent health
  COINS_PER_GOOD_DAY: 12,
  STARTING_COINS: 100,
};

export const WATER_THEMES = {
  fresh: {
    fogColor: 0x123f37, fogDensity: 0.0034,
    deep: 0x0d332c, tint: 0x2a6e5e,
    lightColor: 0xfff2dc, lightIntensity: 1450,
    ambient: 0x3d5a52,
    sand: 0xb99a6b, sandDark: 0x8a6f4a,
    surface: 0x9fd8c8,
  },
  salt: {
    fogColor: 0x0c3050, fogDensity: 0.0030,
    deep: 0x0a2740, tint: 0x1e5f8e,
    lightColor: 0xdcefff, lightIntensity: 1650,
    ambient: 0x2e4a66,
    sand: 0xe8e0cd, sandDark: 0xbfb49b,
    surface: 0xa8dcf0,
  },
};

export const FOODS = {
  flake:  { name: 'Flakes',       emoji: '🍥', color: 0xd9902a, color2: 0xa8541f,
            floatTime: 5, sinkSpeed: 1.1, size: 0.9, count: 14, value: 0.30,
            blurb: 'Everyday food. Floats, then drifts down.' },
  pellet: { name: 'Pellets',      emoji: '🟤', color: 0x6b4a2a, color2: 0x4a3018,
            floatTime: 0.6, sinkSpeed: 4.5, size: 0.7, count: 10, value: 0.34,
            blurb: 'Sinks fast for fish that eat lower down.' },
  algae:  { name: 'Algae Wafer',  emoji: '🟢', color: 0x3d5c2a, color2: 0x2a4018,
            floatTime: 0, sinkSpeed: 8.0, size: 1.6, count: 2, value: 0.55,
            blurb: 'Sinks to the bottom for catfish and grazers.' },
  frozen: { name: 'Bloodworms',   emoji: '🪱', color: 0xa82a20, color2: 0x7a1a12,
            floatTime: 1.5, sinkSpeed: 1.8, size: 0.8, count: 10, value: 0.38,
            blurb: 'A juicy treat. Almost every fish loves these.' },
};

export const SAVE_KEY = 'fishtank_save_v2';
