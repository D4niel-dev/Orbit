// Render the MOBILE web UI in Electron at phone size, so a phone-only change can be
// seen without a device or an emulator. Capacitor plugins are absent; the app guards
// every one of them, so this shows the UI, not the native integrations.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');

const PAGE = path.resolve(__dirname, '..', 'mobile/src/index.html');
const OUT = path.join(os.tmpdir(), 'mobile-home.png');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('no-sandbox');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 390, height: 844, show: false, frame: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false }
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message.slice(0, 140));
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push('load failed: ' + desc));

  await win.loadFile(PAGE);
  await new Promise((r) => setTimeout(r, 3500));

  const state = await win.webContents.executeJavaScript(`(() => ({
    hasApp: !!window.MStore,
    hasPresence: !!window.OrbitPresence,
    bodyLen: document.body ? document.body.innerText.trim().length : 0,
    dots: document.querySelectorAll('.presence, .online-indicator').length,
    badges: document.querySelectorAll('.orbit-presence-badge').length,
    dotDetail: [...document.querySelectorAll('.presence, .online-indicator')].map((el) => {
      const b = el.getBoundingClientRect();
      return el.className + ' | parent=' + (el.parentElement ? el.parentElement.className : '?') +
        ' | ' + Math.round(b.width) + 'x' + Math.round(b.height) +
        ' @' + Math.round(b.x) + ',' + Math.round(b.y);
    }),
    sample: document.body ? document.body.innerText.trim().slice(0, 80).replace(/\\s+/g, ' ') : ''
  }))()`);

  const img = await win.webContents.capturePage();
  require('fs').writeFileSync(OUT, img.toPNG());
  console.log('STATE: ' + JSON.stringify(state));
  console.log('ERRORS: ' + (errors.length ? JSON.stringify(errors.slice(0, 4)) : 'none'));
  console.log('SHOT: ' + OUT);
  app.quit();
}).catch((e) => { console.error('HARNESS FAILED: ' + e.message); app.quit(); });