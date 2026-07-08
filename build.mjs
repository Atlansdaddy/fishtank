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
