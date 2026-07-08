import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// version stamp for crash reports + the Care panel ("is the update live?")
let hash = 'dev';
try { hash = execSync('git rev-parse --short HEAD').toString().trim(); } catch (e) {}
const STAMP = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${hash}`;
// crash reports go to the same worker as cloud saves — one config spot (cloud.js)
const CLOUD_URL = (readFileSync('src/cloud.js', 'utf8').match(/serverUrl:\s*'([^']+)'/) || [])[1] || null;

const result = await esbuild.build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2019'],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Habitat">
<meta name="theme-color" content="#02110f">
<title>Habitat — My Fish Tank</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<style>html,body{margin:0;height:100%;background:#02110f;overscroll-behavior:none;touch-action:none}</style>
</head>
<body>
<script>
// Crash reporter: a black screen must explain itself — on screen AND to the
// telemetry endpoint (same Cloudflare worker as cloud saves). If the worker
// isn't reachable (offline, or not deployed yet) reports queue in localStorage
// and flush on a later boot, so no crash is ever lost.
(function () {
  var V = ${JSON.stringify(STAMP)};
  var URLBASE = ${JSON.stringify(CLOUD_URL)};
  window.__habitatV = V;
  var sent = 0;
  function post(body) {
    return fetch(URLBASE + '/crash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: body, keepalive: true });
  }
  function queue(body) {
    try {
      var q = JSON.parse(localStorage.getItem('habitat_crashq') || '[]');
      q.push(body); localStorage.setItem('habitat_crashq', JSON.stringify(q.slice(-10)));
    } catch (e) {}
  }
  function report(kind, msg, stack) {
    try {
      if (sent++ > 4) return;    // don't flood on error loops
      var body = JSON.stringify({
        kind: kind, v: V, ts: Date.now(),
        msg: String(msg).slice(0, 500), stack: String(stack || '').slice(0, 1200),
        ua: navigator.userAgent, url: location.href,
        pwa: !!(matchMedia && matchMedia('(display-mode: standalone)').matches),
        sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      });
      if (URLBASE) post(body).catch(function () { queue(body); });
      else queue(body);
    } catch (e) {}
  }
  window.__habitatReport = report;
  addEventListener('load', function () {   // flush queued reports from earlier sessions
    try {
      if (!URLBASE) return;
      var q = JSON.parse(localStorage.getItem('habitat_crashq') || '[]');
      if (!q.length) return;
      localStorage.removeItem('habitat_crashq');
      q.forEach(function (b) { post(b).catch(function () { queue(b); }); });
    } catch (e) {}
  });
  function show(msg) {
    var d = document.getElementById('errbox');
    if (!d) {
      d = document.createElement('div');
      d.id = 'errbox';
      d.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:99999;background:#2b1d1d;color:#ffd9d2;border:1px solid #a55;border-radius:12px;padding:12px;font:13px/1.45 -apple-system,system-ui,sans-serif;white-space:pre-wrap;word-break:break-word';
      d.onclick = function () { d.remove(); };
      (document.body || document.documentElement).appendChild(d);
    }
    d.textContent = msg + '\\n\\nv' + V + '\\n(' + navigator.userAgent + ')\\nTap this box to close';
  }
  addEventListener('error', function (e) {
    show('⚠️ Habitat hit an error:\\n' + (e.message || String(e.error)) + (e.lineno ? '\\nline ' + e.lineno + ':' + e.colno : ''));
    report('error', e.message || String(e.error), e.error && e.error.stack);
  });
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    show('⚠️ Habitat hit an error:\\n' + ((r && (r.stack || r.message)) || String(r)));
    report('rejection', (r && r.message) || String(r), r && r.stack);
  });
  addEventListener('DOMContentLoaded', function () {
    try {
      var gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) {
        show('🐟 This browser cannot show the 3D tank: WebGL2 is unavailable.\\nOn iPhone this needs iOS 15 or newer, in Safari — and Lockdown Mode must be OFF for this site (aA menu > Website Settings).');
        report('webgl', 'WebGL2 unavailable');
      }
    } catch (err) { show('🐟 3D graphics unavailable: ' + err.message); report('webgl', err.message); }
  });
})();
</script>
<script>${js}</script>
<script>
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
</script>
</body>
</html>`;

writeFileSync('index.html', html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Built index.html — ${kb} KB (self-contained, offline)`);
