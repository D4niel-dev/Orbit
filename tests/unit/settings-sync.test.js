// Unit tests for shared/network/settings-sync.js
//
// Plain Node, no browser: the module assigns to `window`, so point window at global
// first (same pattern as the other unit tests in this directory).
global.window = global;
require('../../shared/network/settings-sync.js');

const assert = require('assert');
const Sync = global.window.OrbitSettingsSync;

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

console.log('settings-sync');

// ── build ───────────────────────────────────────────────────────────────────
ok('build carries the theme and the colours', () => {
  const payload = Sync.build({
    theme: 'custom',
    customThemeColors: { 'accent-primary': '#ff0000', 'bg-base': '#101010' },
    fontSize: 'large'
  }, 1000);
  assert.strictEqual(payload.v, Sync.VERSION);
  assert.strictEqual(payload.at, 1000);
  assert.strictEqual(payload.data.theme, 'custom');
  assert.strictEqual(payload.data.customThemeColors['accent-primary'], '#ff0000');
});

ok('build sends nothing when there is nothing to send', () => {
  assert.strictEqual(Sync.build({ fontSize: 'large', bgPattern: 'Dots' }, 1), null);
  assert.strictEqual(Sync.build({}, 1), null);
  assert.strictEqual(Sync.build(null, 1), null);
});

ok('build drops a theme the app does not have', () => {
  assert.strictEqual(Sync.build({ theme: 'hotdog-stand' }, 1), null);
});

ok('build drops colour values the browser would reject', () => {
  const payload = Sync.build({
    customThemeColors: {
      'accent-primary': '#ff0000',
      'bg-base': 'not-a-colour',
      'bg-surface': '',
      'accent-danger': 'javascript:alert(1)'
    }
  }, 1);
  assert.deepStrictEqual(Object.keys(payload.data.customThemeColors), ['accent-primary']);
});

ok('build drops colour keys that are not custom-property names', () => {
  const payload = Sync.build({
    customThemeColors: { 'accent-primary': '#ff0000', 'Bad Key!': '#00ff00', '../etc/passwd': '#0000ff' }
  }, 1);
  assert.deepStrictEqual(Object.keys(payload.data.customThemeColors), ['accent-primary']);
});

ok('build caps the number of colours', () => {
  const many = {};
  for (let i = 0; i < Sync._MAX_COLOUR_KEYS + 40; i++) many['k' + i] = '#123456';
  const payload = Sync.build({ customThemeColors: many }, 1);
  assert.strictEqual(Object.keys(payload.data.customThemeColors).length, Sync._MAX_COLOUR_KEYS);
});

// ── apply ───────────────────────────────────────────────────────────────────
ok('apply takes a newer payload', () => {
  const out = Sync.apply({ theme: 'dark' }, { v: 1, at: 500, data: { theme: 'nord' } });
  assert.strictEqual(out.settings.theme, 'nord');
  assert.strictEqual(out.changed, true);
  assert.strictEqual(out.settings.settingsSyncedAt, 500);
});

ok('apply refuses anything not strictly newer', () => {
  assert.strictEqual(Sync.apply({ theme: 'dark', settingsSyncedAt: 500 }, { v: 1, at: 500, data: { theme: 'nord' } }), null);
  assert.strictEqual(Sync.apply({ theme: 'dark', settingsSyncedAt: 500 }, { v: 1, at: 499, data: { theme: 'nord' } }), null);
});

ok('apply refuses a payload from another version', () => {
  assert.strictEqual(Sync.apply({}, { v: 99, at: 999, data: { theme: 'nord' } }), null);
});

ok('apply refuses malformed payloads', () => {
  for (const bad of [null, undefined, 'theme', 42, [], {}, { v: 1 }, { v: 1, at: 'x', data: {} },
                     { v: 1, at: 5 }, { v: 1, at: 5, data: 'nope' }, { v: 1, at: 5, data: [] }]) {
    assert.strictEqual(Sync.apply({ theme: 'dark' }, bad), null, JSON.stringify(bad));
  }
});

ok('apply IGNORES anything outside the whitelist', () => {
  // The important one. A peer — or a bug — must not be able to push arbitrary settings
  // into this device through the sync path.
  const out = Sync.apply({ theme: 'dark' }, {
    v: 1, at: 900, data: { theme: 'nord', vaultPassphrase: 'hunter2', bgPattern: 'Grid', fontSize: 'huge' }
  });
  assert.strictEqual(out.settings.theme, 'nord');
  assert.strictEqual(out.settings.vaultPassphrase, undefined);
  assert.strictEqual(out.settings.bgPattern, undefined);
  assert.strictEqual(out.settings.fontSize, undefined);
});

ok('apply records the timestamp even when nothing changed', () => {
  const out = Sync.apply({ theme: 'nord', settingsSyncedAt: 10 }, { v: 1, at: 20, data: { theme: 'nord' } });
  assert.strictEqual(out.changed, false);
  assert.strictEqual(out.settings.settingsSyncedAt, 20);
});

ok('apply drops invalid colours without discarding the valid ones', () => {
  const out = Sync.apply({}, {
    v: 1, at: 30, data: { customThemeColors: { 'accent-primary': '#00ff00', 'bg-base': 'nope' } }
  });
  assert.deepStrictEqual(out.settings.customThemeColors, { 'accent-primary': '#00ff00' });
});

ok('a round trip through build and apply lands the same colours', () => {
  const source = { theme: 'custom', customThemeColors: { 'accent-primary': '#123456', 'text-inverse': '#ffffff' } };
  const payload = Sync.build(source, 777);
  const out = Sync.apply({}, payload);
  assert.strictEqual(out.settings.theme, 'custom');
  assert.deepStrictEqual(out.settings.customThemeColors, source.customThemeColors);
});

// ── worthSending / isOwnDevice ──────────────────────────────────────────────
ok('worthSending is false for a change outside the whitelist', () => {
  assert.strictEqual(Sync.worthSending({ theme: 'dark', fontSize: 'small' }, { theme: 'dark', fontSize: 'large' }), false);
  assert.strictEqual(Sync.worthSending({ theme: 'dark' }, { theme: 'nord' }), true);
  assert.strictEqual(Sync.worthSending({ theme: 'dark' }, { theme: 'dark' }), false);
});

ok('only your own devices may sync to you', () => {
  assert.strictEqual(Sync.isOwnDevice('me-123', 'me-123'), true);
  assert.strictEqual(Sync.isOwnDevice('me-123', 'someone-else'), false);
  assert.strictEqual(Sync.isOwnDevice('', 'me-123'), false);
  assert.strictEqual(Sync.isOwnDevice('me-123', null), false);
});

console.log('\n' + passed + ' passed');
