// Shared helpers for Orbit Electron E2E tests.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('@playwright/test');

const DESKTOP_DIR = path.resolve(__dirname, '../..');

// Fresh, per-test user data dir (SQLite DB + electron-store live under userData).
function tmpUserDataDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `orbit-e2e-${label}-`));
}

// ⚠ THE REDESIGN IS OPT-IN NOW, SO A SPEC ABOUT IT HAS TO ASK FOR IT.
// `settings.newUI` defaults to false — the original UI is what the app opens on —
// so a spec that asserts anything about the redesign has to turn it on before the
// app launches.
//
// ⚠ BEFORE LAUNCH, because electron-store reads `<userData>/config.json` in its
// constructor and the inline head script reads the same file through the preload
// bridge to decide the look before first paint. Seeding after launch would be
// testing the flash.
function seedNewUI(userDataDir, on = true) {
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ settings: { newUI: on === true } })
  );
  return userDataDir;
}

// Electron's renderer crashes during boot on some Windows machines (and in
// headless CI) unless GPU acceleration and the sandbox are disabled. The
// symptom is `Target crashed`, or #chat-input never appearing. These switches
// are inert on machines that don't need them, so they are always passed.
const DEFAULT_ELECTRON_ARGS = [
  '--disable-gpu',
  '--no-sandbox',
  '--disable-software-rasterizer'
];

// Launch the Electron app against the given user data dir.
// The app's own Electron binary is used — no Playwright browsers involved.
// extraArgs are appended as Chromium switches (e.g. fake media flags for the
// voice recorder spec). Passed per-test rather than via a second Playwright
// project, because the launch happens here in the helper, not in the config.
async function launchApp(userDataDir, extraArgs = [], opts = {}) {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, ...DEFAULT_ELECTRON_ARGS, ...extraArgs],
    cwd: DESKTOP_DIR
  });
  const page = await app.firstWindow();
  // Wait for the app SHELL, not the composer. Since v0.7.0 the app boots with no
  // chat open — the chat panel shows the welcome slides — so #chat-input is not
  // on screen yet, and waiting for it timed out for every spec.
  await page.waitForSelector('#middle-sidebar-container', { timeout: 30000 });
  // The startup tutorial overlay can appear ~1s after boot and blocks pointer
  // events over the whole window. Dismiss it deterministically: mark it
  // completed in the store (identical to pressing "Skip") and click Skip if the
  // overlay already rendered.
  await page.evaluate(() => {
    const s = window.store.getState().settings;
    window.store.setState({ settings: { ...s, tutorialCompleted: true } });
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('settings', { ...s, tutorialCompleted: true });
  });
  const skip = page.locator('.tutorial-btn-skip');
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
  }
  await page.locator('#tutorial-overlay').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  // The specs are written against a chat being open, so give them one. Pass
  // { keepBootState: true } to observe the real cold-start state instead — the
  // welcome slides with no active chat — which is what the DM/sidebar spec does.
  if (!opts.keepBootState) {
    await page.evaluate(() => {
      if (window.store && !window.store.getState().activeChatId) {
        window.store.setState({ activeChatId: 'local-echo' });
      }
    });
    await page.waitForSelector('#chat-input', { timeout: 15000 });
  }
  return { app, page };
}

// Read the persisted settings object from the SQLite DB (renderer context).
function getPersistedSettings(page) {
  return page.evaluate(() => window.orbitAPI.dbGetSetting('settings', {}));
}

// Merge + persist the full settings object (renderer context).
function setPersistedSettings(page, patch) {
  return page.evaluate((p) => {
    const current = window.orbitAPI.dbGetSetting('settings', {});
    const next = { ...current, ...p };
    window.orbitAPI.dbSetSetting('settings', next);
    return next;
  }, patch);
}

// Seed N fake friends into the store (persisted via dbSaveFriend) so the
// create-group friend picker has real entries to overflow and select.
function seedFriends(page, count) {
  return page.evaluate((n) => {
    const peers = [];
    for (let i = 1; i <= n; i++) {
      peers.push({
        userId: 'seed-peer-' + i,
        username: 'Seed Peer ' + i,
        usertag: String(1000 + i),
        status: 'online',
        avatar: null,
        bio: '',
        ip: null,
        publicKey: null,
        lastSeen: Date.now()
      });
    }
    peers.forEach((p) => window.store.addOrUpdatePeer(p));
    return peers.length;
  }, count);
}

module.exports = { DESKTOP_DIR, tmpUserDataDir, launchApp, getPersistedSettings, setPersistedSettings, seedFriends, seedNewUI };