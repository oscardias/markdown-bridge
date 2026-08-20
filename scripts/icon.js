// Renders the application icon to build/icon.png (1024×1024), which
// electron-builder picks up for every platform:
//
//   npm run icon        (or: npm run icon:x11 on Wayland)
//
// The mark is the two panes with the sync arrows between them — the same idea
// as the app itself, drawn so it still reads at 16px in a taskbar.

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'icon.png');
const SIZE = 1024;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#252b34"/>
      <stop offset="1" stop-color="#14171c"/>
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>

  <!-- left pane: plain-text lines, monospace-even -->
  <g fill="#8c96a5">
    <rect x="150" y="300" width="230" height="34" rx="17"/>
    <rect x="150" y="386" width="180" height="34" rx="17"/>
    <rect x="150" y="472" width="230" height="34" rx="17"/>
    <rect x="150" y="558" width="140" height="34" rx="17"/>
    <rect x="150" y="644" width="200" height="34" rx="17"/>
  </g>

  <!-- right pane: formatted document — a heading, then body text -->
  <g fill="#dfe4ec">
    <rect x="644" y="292" width="200" height="50" rx="25"/>
  </g>
  <g fill="#8c96a5">
    <rect x="644" y="386" width="230" height="34" rx="17"/>
    <rect x="644" y="472" width="190" height="34" rx="17"/>
  </g>
  <g fill="#dfe4ec">
    <rect x="644" y="552" width="150" height="46" rx="23"/>
  </g>
  <g fill="#8c96a5">
    <rect x="644" y="644" width="230" height="34" rx="17"/>
  </g>

  <!-- the bridge: sync arrows on the divider -->
  <rect x="497" y="150" width="30" height="724" rx="15" fill="#1b1f26"/>
  <circle cx="512" cy="512" r="150" fill="#4c9ffe"/>
  <g stroke="#0f1319" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M 442 468 h 140"/>
    <path d="M 540 426 l 44 42 -44 42"/>
    <path d="M 582 556 h -140"/>
    <path d="M 484 514 l -44 42 44 42"/>
  </g>
</svg>
`;

app.whenReady().then(async () => {
  await fs.mkdir(path.dirname(OUT), { recursive: true });

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: false },
  });

  const page = `<!doctype html><meta charset="utf-8">
    <style>html,body{margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent}
    svg{display:block}</style>${SVG}`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  await new Promise((r) => setTimeout(r, 500));

  const png = (await win.webContents.capturePage()).toPNG();
  await fs.writeFile(OUT, png);

  if (png.length < 5_000) {
    console.error(`✗ ${path.relative(ROOT, OUT)} looks blank (${png.length} bytes)`);
    app.exit(1);
    return;
  }

  console.log(`✓ ${path.relative(ROOT, OUT)} (${Math.round(png.length / 1024)} KB)`);
  app.exit(0);
});
