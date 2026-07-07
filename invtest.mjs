import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
const b = await chromium.launch({ args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:412,height:800} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL('index.html').href,{waitUntil:'load'}); await p.waitForTimeout(1500);
// add one of every invert archetype and check agents build without error
const res = await p.evaluate(()=>{
  const t=window.__tank; const arche={};
  const inverts=Object.values(t.SPECIES).filter(s=>s.kind==='invert');
  const out={total:inverts.length, byArch:{}, spawned:0, meshCounts:{}};
  // switch to fresh, add each fresh invert; then salt, add each salt invert
  for(const water of ['fresh','salt']){
    t.switchTank(water);
    for(const s of inverts.filter(x=>x.water===water)){
      const rec=t.sim.addFish(s);
      const a=t.swarm.agents.find(x=>x.instId===rec.id);
      // makeAgent is internal; force rebuild by calling switchTank? Instead check via onBuy path:
    }
  }
  return out;
});
// simpler: just verify no page errors after normal load + count invert agents in each tank
await p.evaluate(()=>window.__tank.switchTank('fresh'));
await p.waitForTimeout(300);
const info = await p.evaluate(()=>{
  const t=window.__tank;
  const inv=t.swarm.agents.filter(a=>a.isInvert);
  return {agents:t.swarm.agents.length, invertAgents:inv.length, sampleChildren: inv[0]?inv[0].obj.children.length:0, sampleSp: inv[0]?inv[0].spec.id:null};
});
await b.close();
console.log('pageerrors:', errs.slice(0,3).join(' | ')||'(none)');
console.log('info:', JSON.stringify(info));
