import { CAPACITY } from './constants.js';

// Ecosystem constraints for the shop. Given current stock + a candidate species,
// returns { block: [...], warn: [...] }. Blocks stop the purchase; warns inform.
// This is what keeps a child from adding a mako shark or 200 tuna — the tank
// only handles what a real 120g would.

export function evaluateAdd(sim, spec, qty, speciesMap) {
  const block = [], warn = [];
  const stock = sim.tank.fish.map(f => ({ f, spec: speciesMap[f.sp] })).filter(x => x.spec);

  // 1. Right water
  if (spec.water !== sim.state.current)
    block.push(`${spec.common} lives in ${spec.water === 'fresh' ? 'freshwater' : 'saltwater'} — wrong tank.`);

  // 2. Bioload capacity
  const addLoad = (spec.bioload || 1) * qty;
  if (sim.bioload() + addLoad > CAPACITY.bioload)
    block.push(`Not enough room. This tank can hold ${CAPACITY.bioload} bioload; you'd be at ${sim.bioload() + addLoad}. Try fewer, or a smaller fish.`);

  // 3. Hard fish-count cap (performance + realism)
  if (sim.tank.fish.length + qty > CAPACITY.maxFish)
    block.push(`That's too many animals for one tank (max ${CAPACITY.maxFish}).`);

  // 4. soloOnly — one of its kind (bettas, many tangs vs conspecifics)
  const tags = spec.tags || [];
  const sameSpecies = stock.filter(x => x.spec.id === spec.id).length;
  if (tags.includes('soloOnly')) {
    if (qty > 1) block.push(`${spec.common} must live alone — they fight their own kind. Add just one.`);
    if (sameSpecies >= 1) block.push(`You already have a ${spec.common}. They won't tolerate another.`);
  }
  if (spec.archetype === 'betta' && qty > 1)
    block.push(`Two ${spec.common}s will fight. Only one betta per tank.`);

  // 5. Schooling minimum (warn, not block)
  if (spec.minSchool >= 4 && qty < spec.minSchool && sameSpecies + qty < spec.minSchool)
    warn.push(`${spec.common} is a schooling fish — it's happiest in groups of ${spec.minSchool}+. Alone it may hide and get stressed.`);

  // 6. Predator/prey — will this eat, or be eaten?
  if (spec.predator) {
    const victims = stock.filter(x => canEat(spec, x.spec)).map(x => x.spec.common);
    if (victims.length) warn.push(`${spec.common} is a predator. It may hunt and eat your smaller fish (${uniq(victims).slice(0,4).join(', ')}${uniq(victims).length>4?'…':''}).`);
  }
  const predators = stock.filter(x => x.spec.predator && canEat(x.spec, spec)).map(x => x.spec.common);
  if (predators.length)
    warn.push(`Careful: your ${uniq(predators).join(', ')} could eat ${spec.common} — it's small enough to be a snack.`);

  // 7. Fin nipping
  if (spec.finNipper) {
    const longs = stock.filter(x => x.spec.longFins).map(x => x.spec.common);
    if (longs.length) warn.push(`${spec.common} nips fins. It may pester long-finned fish like ${uniq(longs).join(', ')}.`);
  }
  if (spec.longFins) {
    const nippers = stock.filter(x => x.spec.finNipper).map(x => x.spec.common);
    if (nippers.length) warn.push(`${spec.common} has long fins — your ${uniq(nippers).join(', ')} may nip them.`);
  }

  // 8. Temperament clash
  if (spec.temperament === 'aggressive') {
    const peacefuls = stock.filter(x => x.spec.temperament === 'peaceful').length;
    if (peacefuls > 0) warn.push(`${spec.common} is aggressive and may bully peaceful tankmates.`);
  }

  // 9. Coldwater vs tropical
  if (tags.includes('coldwater')) {
    const tropical = stock.filter(x => !(x.spec.tags||[]).includes('coldwater')).length;
    if (tropical > 0) warn.push(`${spec.common} likes cooler water than tropical fish — not an ideal roommate.`);
  } else if (stock.some(x => (x.spec.tags||[]).includes('coldwater'))) {
    warn.push(`You have a coldwater fish; ${spec.common} prefers warmer water.`);
  }

  // 10. Expert diet
  if (tags.includes('expertDiet'))
    warn.push(`${spec.common} is tricky to feed — it needs frozen food and lots of live surfaces. A tougher pet to keep happy.`);

  // 11. Cost
  const cost = (spec.price || 1) * qty;
  if (cost > sim.coins) block.push(`Costs ${cost} coins — you have ${sim.coins}. Keep your tank healthy to earn more.`);

  return { block, warn, cost };
}

export function canEat(pred, prey) {
  if (!pred.predator) return false;
  if (prey.kind === 'invert' && !prey.edible) return false;
  return (prey.adultSizeCm || 5) <= (pred.adultSizeCm || 5) * 0.42;
}

function uniq(a) { return [...new Set(a)]; }
