// Unit tests for desktop/src/js/log.js — the main-process logging gate.
//
// ⚠ THE FAILURE THIS GUARDS IS INVISIBLE IN THE APP. An ungated `console.log`
// prints, the app works, and nothing looks wrong — it just costs the developer
// their terminal. Every main-process log line in Orbit was like that, so
// `npm start` opened with a wall of [Discovery] beacons and a MediaInfo dump.
// Dan: "these logs in the cmd should only be shown when they are in dev mode and
// enable debug logs in the settings."
//
// ⚠ It runs in plain Node. log.js deliberately requires nothing outside itself —
// no electron, no store — so the whole truth table can be tested without booting
// the app. That is also why it takes the store through `init()` instead of
// reaching for electron-store directly.
//
// ⚠ AND IT IS THE GATE, NOT THE TERMINAL, THAT IS TESTED. A spec that launched
// the app and counted stdout lines would pass vacuously whenever discovery
// happened to be slow to start; this asserts the decision itself.
const assert = require('assert');
const path = require('path');

const LOG_PATH = path.resolve(__dirname, '../../desktop/src/js/log.js');

// Fresh module, so the one-second cache cannot leak between cases.
function fresh() {
  delete require.cache[require.resolve(LOG_PATH)];
  return require(LOG_PATH);
}

// Run `fn` with console.log captured.
function capture(fn) {
  const orig = console.log;
  const lines = [];
  console.log = function () { lines.push(Array.prototype.join.call(arguments, ' ')); };
  try { fn(); } finally { console.log = orig; }
  return lines;
}

const storeOf = (settings) => ({ get: (k) => (k === 'settings' ? settings : undefined) });

let passed = 0;
const failures = [];

async function ok(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (e) {
    failures.push(name + ': ' + e.message);
    console.log('  FAIL - ' + name + ' -> ' + e.message);
  }
}

console.log('log-gate');

(async () => {

  await ok('requiring the module prints nothing', () => {
    const lines = capture(() => { fresh(); });
    assert.deepStrictEqual(lines, [], 'require logged: ' + lines.join(' | '));
  });

  await ok('before init() it is silent — the gate fails closed', () => {
    const dlog = fresh();
    const lines = capture(() => { dlog('this must not print'); });
    assert.deepStrictEqual(lines, [], 'printed before init: ' + lines.join(' | '));
    assert.strictEqual(dlog.enabled(), false, 'enabled() should be false with no store');
  });

  await ok('devMode alone is not enough', () => {
    const dlog = fresh();
    dlog.init(storeOf({ devMode: true, debugLogs: false }));
    const lines = capture(() => { dlog('nope'); });
    assert.deepStrictEqual(lines, [], 'printed with debugLogs off');
    assert.strictEqual(dlog.enabled(), false);
  });

  await ok('debugLogs alone is not enough', () => {
    const dlog = fresh();
    dlog.init(storeOf({ debugLogs: true, devMode: false }));
    const lines = capture(() => { dlog('nope'); });
    assert.deepStrictEqual(lines, [], 'printed with devMode off');
    assert.strictEqual(dlog.enabled(), false);
  });

  await ok('both on, and it prints', () => {
    const dlog = fresh();
    dlog.init(storeOf({ devMode: true, debugLogs: true }));
    const lines = capture(() => { dlog('[Discovery]', 'beacon'); });
    assert.deepStrictEqual(lines, ['[Discovery] beacon'], 'did not print when enabled');
    assert.strictEqual(dlog.enabled(), true);
  });

  await ok('⚠ devMode must be exactly true, not truthy', () => {
    const dlog = fresh();
    dlog.init(storeOf({ devMode: 1, debugLogs: 1 }));
    const lines = capture(() => { dlog('nope'); });
    assert.deepStrictEqual(lines, [], 'a truthy-but-not-true value opened the gate');
  });

  await ok('a store that throws is OFF, and does not throw on the way', () => {
    const dlog = fresh();
    dlog.init({ get: () => { throw new Error('no config'); } });
    let lines;
    assert.doesNotThrow(() => { lines = capture(() => { dlog('nope'); }); });
    assert.deepStrictEqual(lines, [], 'a throwing store opened the gate');
    assert.strictEqual(dlog.enabled(), false);
  });

  await ok('a missing or malformed settings object is OFF', () => {
    for (const s of [null, undefined, 'settings', 42, []]) {
      const dlog = fresh();
      dlog.init(storeOf(s));
      assert.strictEqual(dlog.enabled(), false, 'opened the gate for ' + JSON.stringify(s));
    }
  });

  await ok('init() clears the cache, so a settings change takes effect at once', () => {
    const dlog = fresh();
    const store = { value: { devMode: true, debugLogs: false }, get(k) { return k === 'settings' ? this.value : undefined; } };
    dlog.init(store);
    assert.strictEqual(dlog.enabled(), false, 'should start closed');
    // Same store object, new contents — without init() the 1s cache would hold
    // the old answer, which is the one case where caching could bite.
    store.value = { devMode: true, debugLogs: true };
    dlog.init(store);
    assert.strictEqual(dlog.enabled(), true, 'init() did not clear the cache');
  });

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    failures.forEach(f => console.log('  ! ' + f));
    process.exit(1);
  }
})();
