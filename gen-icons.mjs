// Renders the Habitat app icon (SVG) to the PNG sizes iOS/Android want.
// Run: node gen-icons.mjs   (regenerates icons/ from the inline SVG)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12546e"/>
      <stop offset="1" stop-color="#062330"/>
    </linearGradient>
    <linearGradient id="fish" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff8a3d"/>
      <stop offset="1" stop-color="#e85d1f"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#water)"/>
  <!-- light shafts -->
  <polygon points="120,0 190,0 150,512 100,512" fill="#bfe8ff" opacity="0.08"/>
  <polygon points="300,0 380,0 330,512 270,512" fill="#bfe8ff" opacity="0.06"/>
  <!-- sand -->
  <ellipse cx="256" cy="520" rx="330" ry="70" fill="#c9a86f"/>
  <!-- plant -->
  <path d="M80 470 C70 380 95 340 88 300 M110 472 C112 400 132 370 128 330 M60 472 C52 420 60 390 56 360"
        stroke="#2e7d4f" stroke-width="16" fill="none" stroke-linecap="round"/>
  <!-- fish body -->
  <g transform="translate(130 200) rotate(-8)">
    <path d="M-10 60 C-10 10 60 -30 130 -30 C210 -30 260 20 260 60 C260 100 210 150 130 150 C60 150 -10 110 -10 60 Z" fill="url(#fish)"/>
    <!-- tail -->
    <path d="M255 60 L330 0 C315 40 315 80 330 120 Z" fill="#ff9d55"/>
    <!-- clown band -->
    <path d="M60 -18 C40 30 40 90 60 138 L100 128 C82 90 82 30 100 -8 Z" fill="#fff6ec"/>
    <!-- dorsal -->
    <path d="M60 -28 C110 -70 190 -60 220 -35 C180 -42 110 -40 78 -14 Z" fill="#e85d1f"/>
    <!-- eye -->
    <circle cx="35" cy="52" r="16" fill="#0d1b22"/>
    <circle cx="41" cy="46" r="5" fill="#ffffff"/>
  </g>
  <!-- bubbles -->
  <circle cx="430" cy="120" r="14" fill="#dff4ff" opacity="0.55"/>
  <circle cx="452" cy="80" r="9" fill="#dff4ff" opacity="0.45"/>
  <circle cx="440" cy="46" r="6" fill="#dff4ff" opacity="0.35"/>
</svg>`;

mkdirSync('icons', { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 512, height: 512 } });
await p.setContent(`<body style="margin:0">${SVG}</body>`);
for (const size of [512, 192, 180]) {
  await p.setViewportSize({ width: size, height: size });
  await p.evaluate((s) => { document.querySelector('svg').setAttribute('width', s); document.querySelector('svg').setAttribute('height', s); }, size);
  await p.screenshot({ path: `icons/icon-${size}.png` });
}
await b.close();
console.log('icons/icon-512.png, icon-192.png, icon-180.png written');
