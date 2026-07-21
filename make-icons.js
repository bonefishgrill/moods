// Render the home-screen / favicon set: the Classic skin as a square.
//
// Needs Electron, which lives in the desktop project, so run it from there:
//   cd ../moods-desktop && node_modules/.bin/electron ../moods/make-icons.js
//
// Deliberately full-bleed and opaque — no rounded corners, no shadow, no
// transparency. iOS masks apple-touch-icon into its own squircle and renders
// any alpha as black, and Android crops adaptive icons itself. Rounding it
// here would get rounded twice.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = __dirname;
const S = 1024;
// The wordmark stays inside 80% of the width, clear of the corners iOS and
// Android shave off.
const FIT_W = S * 0.80;

const PAGE = `<html><head><style>
  html,body { margin:0; padding:0; }
  body {
    width:${S}px; height:${S}px;
    background-color:#fff;
    background-image: radial-gradient(circle, rgba(0,0,0,0.30) 6px, transparent 6px);
    background-size: 48px 48px;
    display:flex; align-items:center; justify-content:center;
  }
  .word {
    font-family:'Courier New', Courier, monospace;
    font-style:italic; font-weight:900; text-transform:lowercase;
    letter-spacing:0.02em; line-height:0.9; white-space:nowrap;
    padding-right:0.12em;
    color:transparent;
    -webkit-background-clip:text; background-clip:text;
  }
</style></head><body>
  <div class="word" id="w">moods</div>
</body></html>`;

// Same proportions as the site title (4px cell / 1.35px dot at 68px type),
// scaled to whatever size the fitter settles on.
const FIT = `(() => {
  const el = document.getElementById('w');
  let s = 320;
  const apply = () => {
    el.style.fontSize = s + 'px';
    const cell = 4 * s / 68, dot = 1.35 * s / 68;
    el.style.backgroundSize = cell + 'px ' + cell + 'px';
    el.style.backgroundPosition = '0 ' + (s / 68) + 'px';
    el.style.backgroundImage =
      'radial-gradient(circle, #000 0 ' + dot + 'px, transparent ' + (dot + 0.25) + 'px)';
  };
  apply();
  for (let i = 0; i < 200 && el.getBoundingClientRect().width > ${FIT_W}; i++) {
    s -= 4; apply();
  }
  return s;
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: S, height: S, show: false, frame: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE));
  const size = await win.webContents.executeJavaScript(FIT);
  await win.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: S, height: S });

  const master = path.join(OUT, 'icon-512.png');
  fs.writeFileSync(master, img.resize({ width: 512, height: 512 }).toPNG());
  for (const px of [192, 180]) {
    const f = path.join(OUT, 'icon-' + px + '.png');
    execFileSync('sips', ['-z', String(px), String(px), master, '--out', f],
                 { stdio: 'ignore' });
  }
  console.log('wrote icon-512/192/180.png; wordmark at', size + 'px');

  // The favicon gets its own treatment. Five dot-matrix letters at 32px is a
  // gray smudge, so the tab icon is a solid monogram — same typeface, no dot
  // pattern, no page grid, nothing that survives poorly at that size.
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
    <html><head><style>
      html,body { margin:0; padding:0; }
      body { width:${S}px; height:${S}px; background:#fff;
             display:flex; align-items:center; justify-content:center; }
      div { font-family:'Courier New', Courier, monospace;
            font-style:italic; font-weight:900; font-size:820px;
            line-height:0.9; color:#000; padding-right:0.08em; }
    </style></head><body><div>m</div></body></html>`));
  await win.webContents.executeJavaScript(
    'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
  const fav = await win.webContents.capturePage({ x: 0, y: 0, width: S, height: S });
  const favMaster = path.join(OUT, 'icon-32.png');
  fs.writeFileSync(favMaster, fav.resize({ width: 32, height: 32 }).toPNG());
  console.log('wrote icon-32.png (monogram)');
  app.quit();
});
