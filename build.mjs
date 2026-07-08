import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

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
// Crash reporter: a black screen must explain itself. Catches errors from the
// game script below (including parse errors) and missing WebGL2 (old iOS,
// Lockdown Mode), and prints them on screen so they can be reported.
(function () {
  function show(msg) {
    var d = document.getElementById('errbox');
    if (!d) {
      d = document.createElement('div');
      d.id = 'errbox';
      d.style.cssText = 'position:fixed;left:10px;right:10px;top:10px;z-index:99999;background:#2b1d1d;color:#ffd9d2;border:1px solid #a55;border-radius:12px;padding:12px;font:13px/1.45 -apple-system,system-ui,sans-serif;white-space:pre-wrap;word-break:break-word';
      d.onclick = function () { d.remove(); };
      (document.body || document.documentElement).appendChild(d);
    }
    d.textContent = msg + '\\n\\n(' + navigator.userAgent + ')\\nTap this box to close';
  }
  addEventListener('error', function (e) {
    show('⚠️ Habitat hit an error:\\n' + (e.message || String(e.error)) + (e.lineno ? '\\nline ' + e.lineno + ':' + e.colno : ''));
  });
  addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    show('⚠️ Habitat hit an error:\\n' + ((r && (r.stack || r.message)) || String(r)));
  });
  addEventListener('DOMContentLoaded', function () {
    try {
      var gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) show('🐟 This browser cannot show the 3D tank: WebGL2 is unavailable.\\nOn iPhone this needs iOS 15 or newer, in Safari — and Lockdown Mode must be OFF for this site (aA menu > Website Settings).');
    } catch (err) { show('🐟 3D graphics unavailable: ' + err.message); }
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
