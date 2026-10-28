// Hash-based content filtering.
//
// ⚠ The digest tests use KNOWN ANSWERS rather than comparing two hashes to each other: a
// self-consistent hash of the wrong algorithm would pass a round-trip and fail against
// every other implementation.
global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
global.atob = global.atob || ((b64) => Buffer.from(b64, 'base64').toString('binary'));

const F = require('../../shared/security/content-filter');

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else { results.fail.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}
function mem() { const m = {}; return { get: (k) => (m[k] === undefined ? null : m[k]), set: (k, v) => { m[k] = v; } }; }
const enc = (s) => new TextEncoder().encode(s);

(async () => {
  F._setStorage(mem());

  console.log('\n== the digest is really SHA-256 ==');
  check('"abc" matches the published value',
    (await F.hashBytes(enc('abc'))) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    await F.hashBytes(enc('abc')));
  check('empty input matches the published value',
    (await F.hashBytes(new Uint8Array(0))) === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  check('output is 64 lowercase hex characters',
    /^[0-9a-f]{64}$/.test(await F.hashBytes(enc('orbit'))));
  check('one changed byte changes the whole hash',
    (await F.hashBytes(enc('abc'))) !== (await F.hashBytes(enc('abd'))));

  console.log('\n== data URLs hash the payload, not the envelope ==');
  {
    const b64 = Buffer.from('abc').toString('base64');
    check('the same bytes hash the same from a data URL',
      (await F.hashDataUrl('data:text/plain;base64,' + b64)) === (await F.hashBytes(enc('abc'))));
    check('a different mime prefix does not change it',
      (await F.hashDataUrl('data:image/png;base64,' + b64)) === (await F.hashBytes(enc('abc'))));
    let rejected = false;
    await F.hashDataUrl('not-a-data-url').catch(() => { rejected = true; });
    check('a non-data-URL is rejected rather than hashed as text', rejected);
  }

  console.log('\n== flagging ==');
  {
    F._setStorage(mem());
    const h = await F.hashBytes(enc('nasty'));
    check('nothing is flagged to begin with', F.isFlagged(h) === false);
    F.flag(h, { name: 'nasty.png', mimeType: 'image/png' });
    check('after flagging, it is', F.isFlagged(h) === true);
    check('the entry keeps its metadata', F.all()[0].name === 'nasty.png', F.all()[0]);

    F.flag(h, { name: 'again.png' });
    check('flagging twice keeps one entry', F.all().length === 1, F.all().length);
    check('and does not overwrite the first metadata', F.all()[0].name === 'nasty.png');

    const other = await F.hashBytes(enc('fine'));
    check('a different hash is unaffected', F.isFlagged(other) === false);

    F.unflag(h);
    check('unflag removes it', F.isFlagged(h) === false && F.all().length === 0);
  }

  console.log('\n== the list survives a reload ==');
  {
    const store = mem();
    F._setStorage(store);
    const h = await F.hashBytes(enc('persisted'));
    F.flag(h);
    // A reload drops the in-memory cache but keeps storage.
    F._setStorage(store);
    check('still flagged after the module is re-created', F.isFlagged(h) === true);
  }

  console.log('\n== shouldHide is cache-only, never hashing on the render path ==');
  {
    F._setStorage(mem());
    const h = await F.hashBytes(enc('x'));
    F.flag(h);
    check('an unknown attachment is not hidden', F.shouldHide('att-1') === false);
    F.remember('att-1', h);
    check('once its hash is known and flagged, it is hidden', F.shouldHide('att-1') === true);
    check('a different attachment with the same bytes is hidden too',
      (F.remember('att-2', h), F.shouldHide('att-2') === true));
    const clean = await F.hashBytes(enc('y'));
    F.remember('att-3', clean);
    check('an unflagged hash is not hidden', F.shouldHide('att-3') === false);
  }

  console.log('\n== ensureHash: one fetch per attachment, and a failure is not an error ==');
  {
    F._setStorage(mem());
    let calls = 0;
    const bytes = new TextEncoder().encode('blob-bytes');
    // ⚠ The stub must return DIFFERENT bytes per URL. A stub that returns the same bytes
    // for everything makes the "unflagged" assertion pass for the wrong reason.
    global.fetch = (url) => {
      calls++;
      const payload = String(url).indexOf('att-9') !== -1
        ? bytes.buffer
        : new TextEncoder().encode('clean:' + url).buffer;
      return Promise.resolve({ arrayBuffer: () => Promise.resolve(payload) });
    };
    const flaggedHash = await F.hashBytes(bytes);
    F.flag(flaggedHash);

    const att = { id: 'att-9', url: 'orbit-db://attachment/att-9' };
    const first = await F.ensureHash(att);
    check('the hash is computed from the fetched bytes', first.hash === flaggedHash, first);
    check('and reported as flagged', first.flagged === true);

    await F.ensureHash(att);
    check('a second call does not fetch again', calls === 1, calls);

    const clean = await F.ensureHash({ id: 'att-10', url: 'orbit-db://attachment/att-10' });
    check('unflagged bytes are not hidden', clean.flagged === false);
    check('and that attachment was fetched', calls === 2, calls);

    global.fetch = () => Promise.reject(new Error('nope'));
    const failed = await F.ensureHash({ id: 'att-11', url: 'orbit-db://attachment/att-11' });
    check('a fetch failure resolves as not-flagged rather than rejecting',
      failed.hash === null && failed.flagged === false, failed);
    delete global.fetch;
  }

  console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
  if (results.fail.length) process.exit(1);
})().catch((e) => { console.error('THREW: ' + e.message); process.exit(1); });
