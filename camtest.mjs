import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
const b = await chromium.launch({ args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport:{width:412,height:800} });
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(pathToFileURL('index.html').href,{waitUntil:'load'}); await p.waitForTimeout(1500);
const r = await p.evaluate(async ()=>{
  const t=window.__tank; const out={};
  out.fitR = Math.round(t.cam.fitR);
  out.startRadius = Math.round(t.cam.radius);
  // follow first fish
  const a = t.swarm.agents.find(x=>!x.isInvert);
  t.cam.follow = a; t.cam.targetRadius = 24;
  const p0 = t.camera.position.toArray().map(n=>+n.toFixed(1));
  await new Promise(r=>setTimeout(r,1200));
  out.radiusAfterZoom = Math.round(t.cam.radius);
  const p1 = t.camera.position.toArray().map(n=>+n.toFixed(1));
  out.cameraMoved = (p0[0]!==p1[0]||p0[1]!==p1[1]||p0[2]!==p1[2]);
  // near the followed fish?
  out.distToFish = +t.camera.position.distanceTo(a.pos).toFixed(0);
  // fit whole tank
  t.fitWholeTank();
  await new Promise(r=>setTimeout(r,1400));
  out.radiusAfterFit = Math.round(t.cam.radius);
  out.followCleared = t.cam.follow===null;
  return out;
});
await b.close();
console.log('errors:', errs.slice(0,3).join(' | ')||'(none)');
console.log(JSON.stringify(r));
