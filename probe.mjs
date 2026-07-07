import { chromium } from 'playwright';
import { pathToFileURL } from 'url';

const url = pathToFileURL(process.argv[2] || 'index.html').href;
const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 420, height: 760 } });
await page.addInitScript(() => {
  window.__shaderFails = [];
  const proto = WebGL2RenderingContext.prototype;
  const _src = proto.shaderSource, _comp = proto.compileShader;
  const srcMap = new WeakMap();
  proto.shaderSource = function (sh, src) { srcMap.set(sh, src); return _src.call(this, sh, src); };
  proto.compileShader = function (sh) {
    _comp.call(this, sh);
    if (!this.getShaderParameter(sh, this.COMPILE_STATUS))
      window.__shaderFails.push({ log: this.getShaderInfoLog(sh), src: srcMap.get(sh) });
  };
});
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3500);

const info = await page.evaluate(() => {
  const t = window.__tank; const out = { agents: t?.swarm.agents.length, stock: t?.sim.tank.fish.length };
  const fails = window.__shaderFails || [];
  out.failCount = fails.length;
  out.fails = fails.slice(0, 3).map(f => {
    const lines = (f.src || '').split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(f.log || '');
    let ctx = '';
    if (m) { const ln = +m[1]; ctx = lines.slice(Math.max(0, ln - 3), ln + 2).map((l, i) => (Math.max(0, ln - 3) + i + 1) + '| ' + l).join('\n'); }
    return { log: (f.log || '').slice(0, 300), ctx };
  });
  return out;
});
await page.screenshot({ path: 'shot.png' });
await browser.close();
console.log('agents', info.agents, 'stock', info.stock, 'shaderFails', info.failCount);
console.log('console errors:', logs.slice(0, 4).join(' | ') || '(none)');
for (const f of info.fails || []) { console.log('\n--- LOG:', f.log); console.log(f.ctx); }
