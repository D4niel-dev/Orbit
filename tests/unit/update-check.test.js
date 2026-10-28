// tests/unit/update-check.test.js
// Unit tests for shared/network/update-check.js
//
// Run with: npm run test:unit
//
// This module decides whether to tell a user "a new Orbit is available", so a
// wrong comparison means either a missed update or a false alarm on every
// launch. The version rules and the release-body parsing get full coverage
// here; the network layer is exercised against a stubbed fetch.
//
// No browser or Electron needed — the module is loaded with `window` aliased to
// the Node global, which is how the rest of the shared/ modules expect to find
// their globals.

const path = require('path');

global.window = global;

// Minimal localStorage so the skip/throttle persistence can be tested. Note we
// deliberately leave window.Storage undefined so the module's localStorage
// fallback is the path under test (mobile has no Storage helper either).
const memoryStore = {};
global.window.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(memoryStore, k) ? memoryStore[k] : null),
  setItem: (k, v) => { memoryStore[k] = String(v); },
  removeItem: (k) => { delete memoryStore[k]; }
};

require(path.join(__dirname, '..', '..', 'shared', 'network', 'update-check.js'));
const UC = global.window.Orbit.UpdateCheck;

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log('FAIL  ' + name);
    console.log('      got      ' + JSON.stringify(actual));
    console.log('      expected ' + JSON.stringify(expected));
  }
}

/* ---------------------------------------------------------------- *
 * parseVersion
 * ---------------------------------------------------------------- */

console.log('update-check: parseVersion');

check('plain release', UC.parseVersion('0.5.2').numbers, [0, 5, 2, 0]);
check('v prefix stripped', UC.parseVersion('v0.5.2').numbers, [0, 5, 2, 0]);
check('beta suffix captured', UC.parseVersion('0.5.2-beta').prerelease, 'beta');
check('numbered prerelease', UC.parseVersion('0.5.2-beta.3').prerelease, 'beta.3');
check('short version pads with zeros', UC.parseVersion('0.6').numbers, [0, 6, 0, 0]);
check('four components', UC.parseVersion('1.2.3.4').numbers, [1, 2, 3, 4]);
check('no prerelease is empty string', UC.parseVersion('1.0.0').prerelease, '');
check('garbage rejected', UC.parseVersion('not-a-version'), null);
check('null rejected', UC.parseVersion(null), null);
check('empty rejected', UC.parseVersion(''), null);

/* ---------------------------------------------------------------- *
 * compareVersions
 * ---------------------------------------------------------------- */

console.log('update-check: compareVersions');

check('newer patch wins', UC.compareVersions('0.5.2-beta', '0.5.1-beta'), 1);
check('older patch loses', UC.compareVersions('0.5.1-beta', '0.5.2-beta'), -1);
check('equal is 0', UC.compareVersions('0.5.2-beta', '0.5.2-beta'), 0);
check('v prefix ignored in comparison', UC.compareVersions('v0.5.2-beta', '0.5.2-beta'), 0);
// The classic lexical-sort bug: '0.5.10' < '0.5.9' as strings.
check('10 > 9 numerically, not lexically', UC.compareVersions('0.5.10-beta', '0.5.9-beta'), 1);
check('9 < 10 numerically', UC.compareVersions('0.5.9-beta', '0.5.10-beta'), -1);
check('minor bump beats patch', UC.compareVersions('0.6.0-beta', '0.5.99-beta'), 1);
check('major bump wins', UC.compareVersions('1.0.0', '0.9.9'), 1);
check('stable outranks same-numbered beta', UC.compareVersions('0.5.2', '0.5.2-beta'), 1);
check('beta ranks below same-numbered stable', UC.compareVersions('0.5.2-beta', '0.5.2'), -1);
check('alpha below beta', UC.compareVersions('0.5.2-alpha', '0.5.2-beta'), -1);
check('beta.2 above beta', UC.compareVersions('0.5.2-beta.2', '0.5.2-beta'), 1);
check('beta.2 above beta.1', UC.compareVersions('0.5.2-beta.2', '0.5.2-beta.1'), 1);
check('unparseable sorts lowest', UC.compareVersions('garbage', '0.1.0'), -1);
check('both unparseable equal', UC.compareVersions('x', 'y'), 0);

/* ---------------------------------------------------------------- *
 * markdown / highlight parsing
 * ---------------------------------------------------------------- */

console.log('update-check: parseHighlights');

check('strips bold', UC.stripMarkdown('**Bold** text'), 'Bold text');
check('strips inline code', UC.stripMarkdown('run `npm ci` now'), 'run npm ci now');
check('unwraps links', UC.stripMarkdown('see [docs](https://x.y)'), 'see docs');
check('collapses whitespace', UC.stripMarkdown('a   b\n c'), 'a b c');

// A realistic CI-generated release body (see .github/workflows/build.yml). It
// carries only download/install/verify boilerplate — no changelog at all — so
// the caller must fall back to CHANGELOG.md.
const CI_BODY = [
  '## Orbit v0.5.2-beta',
  '',
  '**Version:** v0.5.2-beta',
  '**Commit:** `abc1234`',
  '**Built:** 2026-09-14',
  '',
  '### Downloads',
  '',
  '| Artifact | Size |',
  '|----------|------|',
  '| Orbit-Setup.exe | 90M |',
  '',
  '### Installation Notes',
  '',
  '> **Desktop builds are currently unsigned.**',
  '',
  '- **Windows:** Microsoft SmartScreen may appear.',
  '- **Android:** Play Protect may warn before installation.',
  '',
  '### Verify Your Download',
  '',
  'A `SHA256SUMS.txt` file is included with this release.',
  '',
  '### Security',
  '',
  '**Orbit** is designed for trusted private networks.',
  '',
  '### Links',
  '',
  '- Repository [**Orbit-beta**](https://github.com/D4niel-dev/Orbit-beta)',
  '- View the [**changelog**](https://github.com/D4niel-dev/Orbit-beta/blob/main/CHANGELOG.md)'
].join('\n');

check('CI boilerplate yields no highlights', UC.parseHighlights(CI_BODY), []);

// A CHANGELOG.md section, which is the curated source.
const CHANGELOG_SECTION = [
  '> **Note:** Feature release.',
  '',
  '### Features',
  '',
  '- **Update Notifications** — Orbit now tells you when a new version is out, with release highlights and a download link.',
  '- **QR Pairing Tabs** — Add-a-Friend switches between entering an IP and scanning a QR code.',
  '',
  '### Bug Fixes',
  '',
  '- **Chat Header Frames** — Profile frames now render in the chat header.',
  '',
  '### Technical',
  '',
  '- **Version:** Bumped to v0.5.2-beta across all three `package.json` files.'
].join('\n');

check('changelog bullets extracted in order', UC.parseHighlights(CHANGELOG_SECTION), [
  'Update Notifications — Orbit now tells you when a new version is out, with release highlights and a download link.',
  'QR Pairing Tabs — Add-a-Friend switches between entering an IP and scanning a QR code.',
  'Chat Header Frames — Profile frames now render in the chat header.'
]);
check('"Version:" technical bullet dropped', UC.parseHighlights(CHANGELOG_SECTION).some((s) => /^Version:/.test(s)), false);
check('max respected', UC.parseHighlights(CHANGELOG_SECTION, 2).length, 2);
check('empty body -> empty list', UC.parseHighlights(''), []);
check('null body -> empty list', UC.parseHighlights(null), []);
check('long bullet truncated', UC.parseHighlights('- ' + 'x'.repeat(400), 1)[0].length, 220);

/* ---------------------------------------------------------------- *
 * sectionForVersion
 * ---------------------------------------------------------------- */

console.log('update-check: sectionForVersion');

const CHANGELOG_MD = [
  '# Orbit Changelog',
  '',
  '## v0.5.2-beta',
  '',
  '### Features',
  '',
  '- **Update Notifications** — Heads up when a new version is out.',
  '',
  '## v0.5.1-beta',
  '',
  '### Bug Fixes',
  '',
  '- **Old Fix** — Something from the previous release.',
  '',
  '## v0.5.0-beta — **Stable Release**',
  '',
  '### Features',
  '',
  '- **Ancient Feature** — From the stable release.'
].join('\n');

const s052 = UC.sectionForVersion(CHANGELOG_MD, 'v0.5.2-beta');
check('extracts the right section', /Update Notifications/.test(s052), true);
check('stops at the next version', /Old Fix/.test(s052), false);
check('version header itself excluded', /^## /.test(s052), false);
check('matches without v prefix', /Update Notifications/.test(UC.sectionForVersion(CHANGELOG_MD, '0.5.2-beta')), true);
check('handles a decorated header', /Ancient Feature/.test(UC.sectionForVersion(CHANGELOG_MD, 'v0.5.0-beta')), true);
check('missing version -> empty', UC.sectionForVersion(CHANGELOG_MD, 'v9.9.9'), '');
check('null markdown -> empty', UC.sectionForVersion(null, 'v0.5.2-beta'), '');

/* ---------------------------------------------------------------- *
 * pickAsset
 * ---------------------------------------------------------------- */

console.log('update-check: pickAsset');

const RELEASE = {
  tag_name: 'v0.5.2-beta',
  name: 'Orbit v0.5.2-beta',
  html_url: 'https://github.com/D4niel-dev/Orbit-beta/releases/tag/v0.5.2-beta',
  prerelease: true,
  draft: false,
  published_at: '2026-09-14T00:00:00Z',
  body: CI_BODY,
  // Deliberately in the order GitHub ACTUALLY returns assets — alphabetical by
  // name, not the order CI uploaded them. The old fixture was hand-ordered with
  // the wanted file first, which is exactly why it never caught the two bugs
  // this list now covers: arm64.dmg sorting ahead of x64.dmg (wrong build for
  // an Intel Mac) and amd64.deb sorting ahead of x86_64.AppImage (never offered
  // the "runs anywhere" build).
  assets: [
    { name: 'Orbit-0.5.2-beta-amd64.deb', browser_download_url: 'https://x/orbit-amd64.deb', size: 100000000 },
    { name: 'Orbit-0.5.2-beta-arm64.dmg', browser_download_url: 'https://x/orbit-arm64.dmg', size: 121000000 },
    { name: 'Orbit-0.5.2-beta-x64.dmg', browser_download_url: 'https://x/orbit-x64.dmg', size: 120000000 },
    { name: 'Orbit-0.5.2-beta-x86_64.AppImage', browser_download_url: 'https://x/orbit-x86_64.AppImage', size: 110000000 },
    { name: 'Orbit-v0.5.2-beta.apk', browser_download_url: 'https://x/orbit.apk', size: 50000000 },
    { name: 'Orbit.Setup.0.5.2-beta.exe', browser_download_url: 'https://x/Orbit.Setup.exe', size: 94371840 }
  ]
};

check('windows picks .exe', UC.pickAsset(RELEASE, 'win32').name, 'Orbit.Setup.0.5.2-beta.exe');
check('macos arm64 gets the arm64 .dmg', UC.pickAsset(RELEASE, 'darwin', 'arm64').name, 'Orbit-0.5.2-beta-arm64.dmg');
check('macos x64 gets the x64 .dmg, NOT arm64', UC.pickAsset(RELEASE, 'darwin', 'x64').name, 'Orbit-0.5.2-beta-x64.dmg');
check('macos with no arch prefers x64 (Rosetta runs it on Apple Silicon; arm64 will not run on Intel)',
  UC.pickAsset(RELEASE, 'darwin').name, 'Orbit-0.5.2-beta-x64.dmg');
check('linux picks AppImage even though .deb sorts first',
  UC.pickAsset(RELEASE, 'linux').name, 'Orbit-0.5.2-beta-x86_64.AppImage');
check('linux with a non-matching arch still prefers AppImage over .deb',
  UC.pickAsset(RELEASE, 'linux', 'arm64').name, 'Orbit-0.5.2-beta-x86_64.AppImage');
check('android picks .apk', UC.pickAsset(RELEASE, 'android').name, 'Orbit-v0.5.2-beta.apk');
check('asset carries a url', UC.pickAsset(RELEASE, 'android').url, 'https://x/orbit.apk');
check('unknown platform falls back to windows', UC.pickAsset(RELEASE, 'solaris').name, 'Orbit.Setup.0.5.2-beta.exe');
check('missing asset -> null', UC.pickAsset({ assets: [] }, 'win32'), null);
check('no assets key -> null', UC.pickAsset({}, 'win32'), null);
check('deb-only linux build still matches', UC.pickAsset({ assets: [{ name: 'o.deb', browser_download_url: 'https://x/o.deb' }] }, 'linux').name, 'o.deb');
check('arm64-only mac build still matches with no arch', UC.pickAsset({ assets: [{ name: 'o-arm64.dmg', browser_download_url: 'https://x/o.dmg' }] }, 'darwin').name, 'o-arm64.dmg');

/* ---------------------------------------------------------------- *
 * pickLatest
 * ---------------------------------------------------------------- */

console.log('update-check: pickLatest');

check('ignores drafts', UC.pickLatest([
  { tag_name: 'v9.9.9', draft: true },
  { tag_name: 'v0.5.2-beta', draft: false }
]).tag_name, 'v0.5.2-beta');

check('picks highest semver, not first', UC.pickLatest([
  { tag_name: 'v0.5.1-beta' },
  { tag_name: 'v0.5.10-beta' },
  { tag_name: 'v0.5.2-beta' }
]).tag_name, 'v0.5.10-beta');

check('prerelease-only list still resolves', UC.pickLatest([
  { tag_name: 'v0.5.1-beta', prerelease: true },
  { tag_name: 'v0.5.0-beta', prerelease: true }
]).tag_name, 'v0.5.1-beta');

check('stable outranks same-numbered prerelease', UC.pickLatest([
  { tag_name: 'v0.5.2-beta', prerelease: true },
  { tag_name: 'v0.5.2', prerelease: false }
]).tag_name, 'v0.5.2');

check('skips unparseable tags', UC.pickLatest([
  { tag_name: 'nightly' },
  { tag_name: 'v0.5.2-beta' }
]).tag_name, 'v0.5.2-beta');

check('empty list -> null', UC.pickLatest([]), null);
check('null list -> null', UC.pickLatest(null), null);

/* ---------------------------------------------------------------- *
 * check() against a stubbed fetch
 * ---------------------------------------------------------------- */

console.log('update-check: check()');

const fetchLog = [];
function stubFetch(handler) {
  fetchLog.length = 0;
  global.fetch = function(url, init) {
    fetchLog.push(String(url));
    return handler(String(url), init || {});
  };
}
function jsonRes(obj) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj))
  });
}
function textRes(s) {
  return Promise.resolve({
    ok: true, status: 200,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(s)
  });
}

(async function runAsync() {
  // 1. Update available, release body has no notes -> changelog is fetched.
  stubFetch((url) => {
    if (url.indexOf('api.github.com') !== -1) return jsonRes([RELEASE]);
    if (url.indexOf('CHANGELOG.md') !== -1) return textRes(CHANGELOG_MD);
    return Promise.reject(new Error('unexpected url ' + url));
  });

  let res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'win32' });
  check('ok', res.ok, true);
  check('update detected', res.hasUpdate, true);
  check('latest version', res.latest, '0.5.2-beta');
  check('current echoed', res.current, '0.5.1-beta');
  check('highlights come from the changelog', res.highlights.length, 1);
  check('highlight text', res.highlights[0], 'Update Notifications — Heads up when a new version is out.');
  check('download url is the platform asset', res.downloadUrl, 'https://x/Orbit.Setup.exe');
  check('release url present', /releases\/tag\/v0\.5\.2-beta$/.test(res.releaseUrl), true);
  check('prerelease flagged', res.prerelease, true);
  check('fetched changelog at the tag', fetchLog.some((u) => /v0\.5\.2-beta\/CHANGELOG\.md$/.test(u)), true);

  // 2. Already current -> no update, and no changelog fetch needed.
  stubFetch((url) => jsonRes([RELEASE]));
  res = await UC.check({ currentVersion: '0.5.2-beta', platform: 'linux' });
  check('same version -> no update', res.hasUpdate, false);
  check('linux download url is the AppImage, not the .deb', res.downloadUrl, 'https://x/orbit-x86_64.AppImage');

  // 3. Newer than remote (dev build) -> no update.
  res = await UC.check({ currentVersion: '0.6.0-beta', platform: 'win32' });
  check('ahead of remote -> no update', res.hasUpdate, false);

  // 4. Release body that DOES carry notes wins over the changelog.
  const bodyWithNotes = RELEASE.body + '\n### Features\n\n- **Inline Note** — Straight from the release body.\n';
  stubFetch((url) => {
    if (url.indexOf('api.github.com') !== -1) return jsonRes([Object.assign({}, RELEASE, { body: bodyWithNotes })]);
    return Promise.reject(new Error('changelog should not be fetched'));
  });
  res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'android' });
  check('release-body notes preferred', res.highlights, ['Inline Note — Straight from the release body.']);
  check('android download url', res.downloadUrl, 'https://x/orbit.apk');

  // 5. Network failure resolves, never rejects.
  stubFetch(() => Promise.reject(new Error('offline')));
  res = await UC.check({ currentVersion: '0.5.1-beta' });
  check('network failure -> ok false', res.ok, false);
  check('network failure -> no update claimed', res.hasUpdate, false);
  check('network failure keeps current', res.current, '0.5.1-beta');

  // 6. Changelog unavailable -> still a usable result.
  stubFetch((url) => {
    if (url.indexOf('api.github.com') !== -1) return jsonRes([RELEASE]);
    return Promise.reject(new Error('404'));
  });
  res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'darwin' });
  check('missing changelog still ok', res.ok, true);
  check('missing changelog -> empty highlights', res.highlights, []);
  check('missing changelog keeps download url', res.downloadUrl, 'https://x/orbit-x64.dmg');

  // 7. No releases at all.
  stubFetch(() => jsonRes([]));
  res = await UC.check({ currentVersion: '0.5.1-beta' });
  check('no releases -> no update', res.hasUpdate, false);
  check('no releases reason', res.reason, 'no-releases');

  /* -------------------------------------------------------------- *
   * Throttle + skip
   * -------------------------------------------------------------- */

  console.log('update-check: checkThrottled');

  UC.clearSkip();
  UC.markChecked();   // pretend we just checked

  stubFetch(() => jsonRes([RELEASE]));
  res = await UC.checkThrottled({ currentVersion: '0.5.1-beta' });
  check('throttled right after a check', res.reason, 'throttled');
  check('throttled does not hit the network', fetchLog.length, 0);
  check('throttled claims no update', res.hasUpdate, false);

  res = await UC.checkThrottled({ currentVersion: '0.5.1-beta', force: true });
  check('force bypasses the throttle', res.hasUpdate, true);

  // Skipped version is suppressed...
  UC.skipVersion('0.5.2-beta');
  global.localStorage.removeItem('orbit_update_lastCheck');
  stubFetch((url) => {
    if (url.indexOf('api.github.com') !== -1) return jsonRes([RELEASE]);
    return textRes(CHANGELOG_MD);
  });
  res = await UC.checkThrottled({ currentVersion: '0.5.1-beta' });
  check('skipped version suppressed', res.hasUpdate, false);
  check('skipped reason', res.reason, 'skipped');
  check('skipped result still carries the data', res.suppressed.latest, '0.5.2-beta');

  // ...but an explicit check still surfaces it.
  global.localStorage.removeItem('orbit_update_lastCheck');
  res = await UC.checkThrottled({ currentVersion: '0.5.1-beta', force: true });
  check('force overrides the skip', res.hasUpdate, true);

  // A newer version than the skipped one is not suppressed.
  global.localStorage.removeItem('orbit_update_lastCheck');
  stubFetch((url) => {
    if (url.indexOf('api.github.com') !== -1) return jsonRes([Object.assign({}, RELEASE, { tag_name: 'v0.5.3-beta' })]);
    return textRes(CHANGELOG_MD);
  });
  res = await UC.checkThrottled({ currentVersion: '0.5.1-beta' });
  check('newer than skipped still announced', res.hasUpdate, true);
  check('newer version reported', res.latest, '0.5.3-beta');

  check('skippedVersion reflects storage', UC.skippedVersion(), '0.5.2-beta');
  UC.clearSkip();
  check('clearSkip works', UC.skippedVersion(), null);

  /* -------------------------------------------------------------- *
   * Transport selection
   * -------------------------------------------------------------- */

  console.log('update-check: transport selection');

  // Desktop cannot reach GitHub from the renderer (its CSP omits api.github.com
  // from connect-src), so it must route through the main process. Simulate that
  // by removing global.fetch and providing orbitAPI.updateFetch.
  const savedFetch = global.fetch;
  const savedOrbitAPI = global.orbitAPI;

  delete global.fetch;
  global.orbitAPI = {
    updateFetch: (url) => {
      const body = url.indexOf('CHANGELOG.md') !== -1 ? CHANGELOG_MD : JSON.stringify([RELEASE]);
      return Promise.resolve({ ok: true, status: 200, body: body });
    }
  };

  check('electron transport detected', typeof UC.electronTransport(), 'function');
  res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'win32' });
  check('check works with no window.fetch at all', res.ok, true);
  check('main-process transport reports the update', res.hasUpdate, true);
  check('main-process transport feeds the changelog fallback', res.highlights.length, 1);

  // A blocked/rejected request must surface as a failure, never as "up to date".
  global.orbitAPI = {
    updateFetch: () => Promise.resolve({ ok: false, status: 403, body: '', error: 'host not allowed' })
  };
  res = await UC.check({ currentVersion: '0.5.1-beta' });
  check('blocked transport -> ok false', res.ok, false);
  check('blocked transport surfaces the reason', res.error, 'host not allowed');

  // An explicit fetchImpl outranks the built-in transports (used by tests and
  // by any caller that wants to inject its own cache).
  global.orbitAPI = { updateFetch: () => Promise.reject(new Error('should not be used')) };
  let overrideCalls = 0;
  res = await UC.check({
    currentVersion: '0.5.1-beta',
    platform: 'win32',
    fetchImpl: () => {
      overrideCalls++;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve([RELEASE]),
        text: () => Promise.resolve(CHANGELOG_MD)
      });
    }
  });
  check('fetchImpl override is used', overrideCalls > 0, true);
  check('fetchImpl result parsed', res.hasUpdate, true);

  global.fetch = savedFetch;
  global.orbitAPI = savedOrbitAPI;

  /* -------------------------------------------------------------- *
   * Capacitor transport (Android)
   * -------------------------------------------------------------- */

  // On Android there is no window.orbitAPI, so the native HTTP plugin is the
  // branch that runs. It returns { status, data } rather than a Response.
  delete global.orbitAPI;
  delete global.fetch;
  global.Capacitor = {
    Plugins: {
      CapacitorHttp: {
        get: (opts) => Promise.resolve({
          status: 200,
          data: opts.url.indexOf('CHANGELOG') !== -1 ? CHANGELOG_MD : [RELEASE]
        })
      }
    }
  };

  check('capacitor transport detected', typeof UC.capacitorTransport(), 'function');
  res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'android' });
  check('android check works via native http', res.ok, true);
  check('android reports the update', res.hasUpdate, true);
  check('android download url is the apk', /\.apk$/.test(res.downloadUrl), true);
  check('android changelog fallback works', res.highlights.length, 1);

  // A non-2xx native response must fail loudly, not read as "up to date".
  global.Capacitor.Plugins.CapacitorHttp.get = () => Promise.resolve({ status: 503, data: '' });
  res = await UC.check({ currentVersion: '0.5.1-beta', platform: 'android' });
  check('native http error -> ok false', res.ok, false);
  check('native http error mentions status', /503/.test(res.error || ''), true);

  delete global.Capacitor;
  global.fetch = savedFetch;

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
