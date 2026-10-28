// Unit tests for desktop/lib/update-assets.js
//
// These two functions decide which hosts the desktop updater will download from and what
// filename it will write. They were closures inside the ipcMain handler until now, which
// meant no test could reach them — and the mobile updater turned out to have three
// defects that no test had ever touched.
//
// Plain Node, no browser and no Electron: the module is CommonJS on purpose.
const assert = require('assert');
const path = require('path');
const { isAllowedUpdateHost, safeAssetName } = require('../../desktop/lib/update-assets.js');

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

console.log('update-assets');

// ── which hosts are allowed ─────────────────────────────────────────────────
ok('github.com itself is allowed', () => {
  assert.strictEqual(isAllowedUpdateHost('github.com'), true);
  assert.strictEqual(isAllowedUpdateHost('GitHub.com'), true, 'case must not matter');
});

ok('github subdomains are allowed', () => {
  assert.strictEqual(isAllowedUpdateHost('api.github.com'), true);
  assert.strictEqual(isAllowedUpdateHost('gist.github.com'), true);
});

ok('the REDIRECT host is allowed', () => {
  // Release assets redirect to objects.githubusercontent.com. The check runs on the URL
  // as given and fetch follows redirects, so if this is not allowed every real download
  // fails the moment GitHub redirects it.
  assert.strictEqual(isAllowedUpdateHost('objects.githubusercontent.com'), true);
  assert.strictEqual(isAllowedUpdateHost('raw.githubusercontent.com'), true);
});

ok('a suffix trick is NOT allowed', () => {
  // The classic mistake: endsWith('.github.com') would accept all of these if the leading
  // dot were missing from the comparison.
  assert.strictEqual(isAllowedUpdateHost('github.com.evil.example'), false);
  assert.strictEqual(isAllowedUpdateHost('notgithub.com'), false);
  assert.strictEqual(isAllowedUpdateHost('evil-github.com'), false);
  assert.strictEqual(isAllowedUpdateHost('githubusercontent.com.evil.example'), false);
});

ok('anything else is refused', () => {
  for (const h of ['evil.example', 'localhost', '127.0.0.1', '', null, undefined, 0]) {
    assert.strictEqual(isAllowedUpdateHost(h), false, JSON.stringify(h));
  }
});

// ── what filename gets written ──────────────────────────────────────────────
ok('a normal asset name is kept', () => {
  assert.strictEqual(safeAssetName('Orbit-Setup-0.7.4-beta.exe'), 'Orbit-Setup-0.7.4-beta.exe');
  assert.strictEqual(safeAssetName('orbit-0.7.4-beta.apk'), 'orbit-0.7.4-beta.apk');
});

ok('path traversal cannot escape the download directory', () => {
  // path.basename first, so nothing with a separator survives at all.
  assert.strictEqual(safeAssetName('../../etc/passwd'), 'passwd');
  assert.strictEqual(safeAssetName('..\\..\\windows\\system32\\evil.exe'), 'evil.exe');
  assert.strictEqual(safeAssetName('/etc/shadow'), 'shadow');
  assert.strictEqual(safeAssetName('a/b/c/Orbit.exe'), 'Orbit.exe');
});

ok('characters that are not filename-safe are replaced', () => {
  assert.strictEqual(safeAssetName('Orbit Setup (1).exe'), 'Orbit_Setup_1_.exe');
  assert.strictEqual(safeAssetName('orbit\u0000.exe'), 'orbit_.exe');
  assert.strictEqual(safeAssetName('orbit\u202Egnp.exe'), 'orbit_gnp.exe', 'bidi override stripped');
});

ok('a leading dot cannot make a hidden file', () => {
  assert.strictEqual(safeAssetName('.bashrc'), 'bashrc');
  assert.strictEqual(safeAssetName('...'), 'Orbit-installer');
});

ok('the length is capped', () => {
  const long = 'a'.repeat(400) + '.exe';
  const out = safeAssetName(long);
  assert.ok(out.length <= 120, 'got ' + out.length);
});

ok('an empty or missing name falls back', () => {
  for (const n of ['', null, undefined, '.', '..']) {
    assert.strictEqual(safeAssetName(n), 'Orbit-installer', JSON.stringify(n));
  }
});

ok('the result never contains a path separator', () => {
  const nasty = ['../a/b', 'a\\b', 'x/y/z', 'C:\\Windows\\evil.exe', './.'];
  for (const n of nasty) {
    const out = safeAssetName(n);
    assert.strictEqual(out.indexOf('/'), -1, n + ' -> ' + out);
    assert.strictEqual(out.indexOf('\\'), -1, n + ' -> ' + out);
    assert.strictEqual(path.basename(out), out, n + ' -> ' + out);
  }
});

console.log('\n' + passed + ' passed');
