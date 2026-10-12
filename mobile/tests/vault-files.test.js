// A backup the user SAVED must be a backup the restore can FIND.
//
// Dan: "Critical bug: the export .orzip/.zip are exported in the wrong folder
// (rn it's exporting to the user's download folder... not the app vault/ folder
// where...) and that's why the restore by .orzip/.zip didn't find any files."
//
// ⚠ THE MECHANISM. runVaultExport() writes a v2 vault directory into the app's
// PRIVATE data dir, then offers "Save a copy to Downloads now?" — and that copy is
// the only one that survives deleting the app. It goes to the PUBLIC Downloads
// folder through MediaStore (OrbitP2PPlugin.saveToDownloads).
//
// findBackupFiles() scanned only app-private storage — the Data root and vault/.
// So the one copy that survives a reinstall was the one copy the restore could not
// see. The export worked, the restore worked, and they disagreed about where a
// backup lives.
//
// The fix lists and reads Downloads natively and merges those files into the scan.
// This spec drives that merge with a REAL gzipped .orzip payload, and checks the
// fail-closed paths, because a WebView cannot reach that folder at all — so "no
// plugin" is the normal case on an older build and must look like "no files",
// never like a crash in Settings.
const H = require('./harness.js');
const zlib = require('zlib');

// A minimal but genuinely valid .orzip: gzip(JSON) with a `data` object, which is
// what backup-archive.js's read()/describe() require. Built for real rather than
// mocked, so the base64 round-trip through the native boundary is exercised.
const BACKUP_JSON = {
  version: 1,
  exportedAt: new Date().toISOString(),
  data: {
    users: [{ id: 'u_dan', username: 'Dan' }],
    friends: [{ id: 'p_ava', name: 'Ava Chen' }],
    messages: [{ id: 'm1', text: 'hello' }, { id: 'm2', text: 'again' }]
  }
};
const PAYLOAD_B64 = zlib.gzipSync(Buffer.from(JSON.stringify(BACKUP_JSON), 'utf8')).toString('base64');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ userId: 'p_ava', name: 'Ava Chen', tag: '0001', status: 'online' }],
  orbit_chats: [{ id: 'dm_p_ava', name: 'Ava Chen', lastMessage: '', lastTime: H.t(2) }],
  orbit_msg_dm_p_ava: []
};

/** Install a fake native plugin. `files` is what listDownloadBackups returns. */
const installPlugin = (files, opts) => `(() => {
  window.__readCalls = [];
  window.__payload = ${JSON.stringify(PAYLOAD_B64)};
  window.Capacitor = window.Capacitor || {};
  window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  window.Capacitor.Plugins.OrbitP2P = {
    listDownloadBackups: function () {
      ${opts && opts.listRejects ? "return Promise.reject(new Error('boom'));" : ''}
      return Promise.resolve({ files: ${JSON.stringify(files)} });
    },
    readDownloadBackup: function (o) {
      window.__readCalls.push(o);
      ${opts && opts.readRejects ? "return Promise.reject(new Error('The file is gone'));" : ''}
      return Promise.resolve({ name: o.name, size: 1234, data: window.__payload });
    }
  };
})()`;

const removePlugin = `(() => {
  if (window.Capacitor && window.Capacitor.Plugins) delete window.Capacitor.Plugins.OrbitP2P;
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  // ── 1. No plugin at all — the normal case on a build without the native side.
  console.log('\n== no native plugin (fails closed, does not throw) ==');
  await page.evaluate(removePlugin);
  const none = await page.evaluate(() =>
    window.OrbitVault.findBackupFiles().then((f) => ({ ok: true, count: f.length }))
      .catch((e) => ({ ok: false, error: e.message })));
  console.log('  ' + JSON.stringify(none));
  H.check('findBackupFiles resolves rather than rejecting', none.ok === true, none);
  H.check('and finds nothing', none.count === 0, none);

  // And reading a Downloads file with no plugin is a readable message, not a crash.
  const noPluginRead = await page.evaluate(() =>
    window.OrbitVault.readBackupFile('downloads/x.zip', 'downloads')
      .then(() => ({ rejected: false }))
      .catch((e) => ({ rejected: true, message: e.message })));
  console.log('  ' + JSON.stringify(noPluginRead));
  H.check('reading from Downloads without the plugin rejects with a readable message',
    noPluginRead.rejected === true && /newer Android build/.test(noPluginRead.message), noPluginRead);

  // ── 2. A plugin that throws — must still look like "nothing found".
  console.log('\n== the listing throws (still not an exception) ==');
  await page.evaluate(installPlugin([], { listRejects: true }));
  const threw = await page.evaluate(() =>
    window.OrbitVault.findBackupFiles().then((f) => ({ ok: true, count: f.length }))
      .catch((e) => ({ ok: false, error: e.message })));
  console.log('  ' + JSON.stringify(threw));
  H.check('a failing listing is swallowed', threw.ok === true && threw.count === 0, threw);

  // ── 3. THE FIX: a saved backup in Downloads is found.
  console.log('\n== a saved backup in Downloads IS found ==');
  await page.evaluate(installPlugin([
    { name: 'OrbitVault-20261012-1010.zip', size: 4096, mtime: Date.now() - 60000 },
    { name: 'Orbit-Backup-2026-10-11.orzip', size: 8192, mtime: Date.now() },
    // Not a backup — must be filtered out, or the list fills with noise.
    { name: 'holiday-photos.zip.txt', size: 10, mtime: Date.now() },
    { name: 'notes.txt', size: 10, mtime: Date.now() }
  ]));
  const found = await page.evaluate(() => window.OrbitVault.findBackupFiles());
  console.log('  ' + JSON.stringify(found.map((f) => ({ n: f.name, s: f.source, p: f.path }))));

  H.check('the Downloads files are listed', found.length === 2, found.length);
  H.check('they are tagged as coming from Downloads',
    found.every((f) => f.source === 'downloads'), found);
  H.check('their paths are namespaced so they cannot collide with app storage',
    found.every((f) => f.path.indexOf('downloads/') === 0), found);
  H.check('non-backups are filtered out',
    !found.some((f) => /notes|photos/.test(f.name)), found.map((f) => f.name));
  H.check('newest first', found[0] && /Orbit-Backup/.test(found[0].name), found.map((f) => f.name));
  H.check('the size and mtime survive the native boundary',
    found[0] && found[0].size === 8192 && !!found[0].mtime, found[0]);

  // ── 4. The sheet shows it, and says where it is.
  console.log('\n== the sheet shows it, labelled Downloads ==');
  await page.evaluate(() => window.showBackupFileSheet());
  await page.waitForTimeout(1200);
  const sheet = await page.evaluate(() => {
    const root = document.querySelector('.bk-sheet');
    if (!root) return { open: false };
    return {
      open: true,
      rows: Array.from(root.querySelectorAll('.bk-row')).map((r) => ({
        name: (r.querySelector('.bk-name') || {}).textContent,
        meta: (r.querySelector('.bk-meta') || {}).textContent,
        hasRestore: !!r.querySelector('.bk-restore')
      })),
      sub: (root.querySelector('.bk-sub') || {}).textContent
    };
  });
  console.log('  ' + JSON.stringify(sheet, null, 1));

  H.check('the sheet lists both files', sheet.open === true && sheet.rows.length === 2, sheet);
  H.check('and labels them as being in Downloads',
    sheet.rows.every((r) => /in Downloads/.test(r.meta || '')), sheet.rows);
  // ⚠ The old copy promised only two places. It was the promise the app broke.
  H.check('and the header says it looked in Downloads too',
    /Downloads/.test(sheet.sub || ''), sheet.sub);
  H.check('each row offers Restore', sheet.rows.every((r) => r.hasRestore), sheet.rows);
  await page.screenshot({ path: H.SHOTS + '/vault-files-downloads.png' });

  // ── 5. Restoring one actually reads it, and the bytes survive the round trip.
  console.log('\n== restoring from Downloads reads the real file ==');
  const restored = await page.evaluate(() =>
    window.OrbitVault.readBackupFile('downloads/Orbit-Backup-2026-10-11.orzip', 'downloads')
      .then((r) => ({
        ok: true,
        kind: r.kind,
        users: (r.backup.data.users || []).length,
        friends: (r.backup.data.friends || []).length,
        messages: (r.backup.data.messages || []).length,
        summary: r.summary,
        calls: window.__readCalls
      }))
      .catch((e) => ({ ok: false, error: e.message })));
  console.log('  ' + JSON.stringify(restored));

  H.check('the read succeeds', restored.ok === true, restored);
  // ⚠ The native call takes the BARE name. Passing 'downloads/x.orzip' through
  // would look for a file literally called that and find nothing.
  H.check('the native call is given the bare file name, not the namespaced path',
    restored.calls && restored.calls.length === 1 &&
    restored.calls[0].name === 'Orbit-Backup-2026-10-11.orzip', restored.calls);
  H.check('the gzipped payload survives base64 and is detected as an .orzip',
    restored.kind === 'orzip', restored);
  H.check('and the contents are intact — users',
    restored.users === 1, restored);
  H.check('and the contents are intact — friends',
    restored.friends === 1, restored);
  H.check('and the contents are intact — messages',
    restored.messages === 2, restored);
  H.check('and describe() can read it, so the confirmation can name it',
    typeof restored.summary === 'string' && restored.summary !== 'unreadable', restored.summary);

  // ── 6. A file that vanished between listing and reading.
  console.log('\n== the file is gone by the time you tap Restore ==');
  await page.evaluate(installPlugin([], { readRejects: true }));
  const gone = await page.evaluate(() =>
    window.OrbitVault.readBackupFile('downloads/gone.orzip', 'downloads')
      .then(() => ({ rejected: false }))
      .catch((e) => ({ rejected: true, message: e.message })));
  console.log('  ' + JSON.stringify(gone));
  H.check('it rejects with a readable message rather than hanging or crashing',
    gone.rejected === true && /gone/.test(gone.message), gone);

  // ── 7. The app-private path still works exactly as before.
  console.log('\n== the app-folder path is untouched ==');
  const privateRead = await page.evaluate(() =>
    window.OrbitVault.readBackupFile('vault/OrbitVault-x/orphan.zip', 'vault')
      .then(() => ({ rejected: false }))
      .catch((e) => ({ rejected: true, message: e.message })));
  console.log('  ' + JSON.stringify(privateRead));
  H.check('a private-storage read still goes to the Filesystem plugin (absent here, so it says so)',
    privateRead.rejected === true && /Filesystem plugin unavailable/.test(privateRead.message), privateRead);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
