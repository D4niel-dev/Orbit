// Unit tests for shared/network/transfer.js
//
// Plain Node, no browser: the module assigns to `window`, so point window at
// global first (same pattern as the other unit tests in this directory).
global.window = global;
require('../../shared/network/transfer.js');

const assert = require('assert');
const T = global.window.OrbitAccountTransfer;

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

console.log('account-transfer');

(async () => {

  // ── link token ────────────────────────────────────────────────────────────

  await ok('a fresh token is valid', () => {
    const t = T.makeToken();
    assert.strictEqual(typeof t, 'string');
    assert.ok(T.isValidToken(t), 'generated token failed its own validation: ' + t);
  });

  await ok('tokens do not repeat', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(T.makeToken());
    assert.strictEqual(seen.size, 200);
  });

  await ok('tokens carry 128 bits', () => {
    // 16 bytes base64url, unpadded, is 22 characters.
    assert.strictEqual(T.makeToken().length, 22);
  });

  await ok('isValidToken rejects short, long and non-base64url values', () => {
    assert.strictEqual(T.isValidToken(''), false);
    assert.strictEqual(T.isValidToken('short'), false);
    assert.strictEqual(T.isValidToken('x'.repeat(19)), false);
    assert.strictEqual(T.isValidToken('x'.repeat(25)), false);
    assert.strictEqual(T.isValidToken('x'.repeat(22).slice(0, 21) + '+'), false);
    assert.strictEqual(T.isValidToken('x'.repeat(21) + '/'), false);
    assert.strictEqual(T.isValidToken(null), false);
    assert.strictEqual(T.isValidToken(12345), false);
    assert.strictEqual(T.isValidToken('a'.repeat(22)), true);
  });

  // ── seal / open ───────────────────────────────────────────────────────────

  const token = T.makeToken();
  const salt = T._bytesToB64(new Uint8Array(16).fill(7));

  await ok('seal then open returns the original object', async () => {
    const key = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    const sealed = await T.seal(key, { hello: 'world', n: 42, nested: { a: [1, 2, 3] } });
    assert.ok(typeof sealed.iv === 'string' && typeof sealed.ct === 'string');
    const back = await T.open(key, sealed.iv, sealed.ct);
    assert.deepStrictEqual(back, { hello: 'world', n: 42, nested: { a: [1, 2, 3] } });
  });

  await ok('a DIFFERENT token cannot open it', async () => {
    const key = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    const sealed = await T.seal(key, { secret: 'account data' });
    const wrong = await T.deriveKey(T.makeToken(), salt, T.KDF_ITERATIONS);
    let threw = false;
    try { await T.open(wrong, sealed.iv, sealed.ct); } catch (e) { threw = true; }
    assert.ok(threw, 'a wrong token decrypted the bundle');
  });

  await ok('a DIFFERENT salt cannot open it', async () => {
    const key = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    const sealed = await T.seal(key, { secret: 'account data' });
    const wrong = await T.deriveKey(token, T._bytesToB64(new Uint8Array(16).fill(9)), T.KDF_ITERATIONS);
    let threw = false;
    try { await T.open(wrong, sealed.iv, sealed.ct); } catch (e) { threw = true; }
    assert.ok(threw, 'a wrong salt decrypted the bundle');
  });

  await ok('TAMPERED ciphertext is rejected (GCM authenticates)', async () => {
    const key = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    const sealed = await T.seal(key, { secret: 'account data' });
    const bytes = T._b64ToBytes(sealed.ct);
    bytes[5] = bytes[5] ^ 0x01;
    let threw = false;
    try { await T.open(key, sealed.iv, T._bytesToB64(bytes)); } catch (e) { threw = true; }
    assert.ok(threw, 'a flipped ciphertext bit decrypted anyway');
  });

  await ok('a malformed sealed payload rejects rather than throwing synchronously', async () => {
    const key = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    let threw = false;
    try { await T.open(key, null, undefined); } catch (e) { threw = true; }
    assert.ok(threw);
  });

  await ok('an out-of-range iteration count falls back to the default', async () => {
    // A peer must not be able to talk us into a 1-iteration KDF.
    const weak = await T.deriveKey(token, salt, 1);
    const strong = await T.deriveKey(token, salt, T.KDF_ITERATIONS);
    const sealed = await T.seal(strong, { a: 1 });
    // deriveKey(…, 1) should have used the default, so it matches strong.
    const back = await T.open(weak, sealed.iv, sealed.ct);
    assert.deepStrictEqual(back, { a: 1 });
  });

  // ── chunking ──────────────────────────────────────────────────────────────

  await ok('chunkString splits and reassembles exactly', () => {
    const s = 'x'.repeat(T.CHUNK_CHARS * 2 + 137);
    const parts = T.chunkString(s, T.CHUNK_CHARS);
    assert.strictEqual(parts.length, 3);
    assert.strictEqual(parts.join(''), s);
    assert.strictEqual(T.chunkString('', T.CHUNK_CHARS).length, 0);
  });

  // ── validation: the receive side must not trust the sender ────────────────

  const goodOffer = () => ({
    transferId: 't-1',
    salt: T._bytesToB64(new Uint8Array(16)),
    iterations: T.KDF_ITERATIONS,
    manifest: { bytes: 4096, total: 2, accountName: 'Dan', counts: { messages: 120 } }
  });

  await ok('validateOffer accepts a well-formed offer', () => {
    const r = T.validateOffer(goodOffer());
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.transferId, 't-1');
    assert.strictEqual(r.manifest.total, 2);
    assert.strictEqual(r.manifest.accountName, 'Dan');
  });

  await ok('validateOffer rejects junk', () => {
    assert.strictEqual(T.validateOffer(null).ok, false);
    assert.strictEqual(T.validateOffer('nope').ok, false);
    assert.strictEqual(T.validateOffer({}).ok, false);
    assert.strictEqual(T.validateOffer({ transferId: 'a', salt: 's' }).ok, false, 'no manifest');
    assert.strictEqual(T.validateOffer({ transferId: '', salt: 's', manifest: { bytes: 1, total: 1 } }).ok, false);
  });

  await ok('validateOffer refuses a bundle over the cap', () => {
    const o = goodOffer();
    o.manifest.bytes = T.MAX_BUNDLE_BYTES + 1;
    assert.strictEqual(T.validateOffer(o).ok, false);
    assert.strictEqual(T.validateOffer(o).reason, 'too-large');
  });

  await ok('validateOffer refuses an absurd chunk count', () => {
    const o = goodOffer();
    o.manifest.total = 1000000;
    assert.strictEqual(T.validateOffer(o).ok, false);
  });

  await ok('validateOffer refuses a weak KDF request', () => {
    const o = goodOffer();
    o.iterations = 1;
    assert.strictEqual(T.validateOffer(o).ok, false);
    assert.strictEqual(T.validateOffer(o).reason, 'bad-kdf');
  });

  await ok('validateChunk checks the transfer, the seq and the size', () => {
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: 0, data: 'abc' }, 't-1', 2).ok, true);
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: 1, data: 'abc' }, 't-1', 2).ok, true);
    // seq out of range
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: 2, data: 'a' }, 't-1', 2).ok, false);
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: -1, data: 'a' }, 't-1', 2).ok, false);
    // a chunk from a different transfer
    assert.strictEqual(T.validateChunk({ transferId: 't-2', seq: 0, data: 'a' }, 't-1', 2).reason, 'wrong-transfer');
    // oversized chunk
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: 0, data: 'x'.repeat(T.CHUNK_CHARS + 1) }, 't-1', 2).ok, false);
    // non-string data
    assert.strictEqual(T.validateChunk({ transferId: 't-1', seq: 0, data: 123 }, 't-1', 2).ok, false);
  });

  await ok('validateBundle rejects anything that is not an account', () => {
    assert.strictEqual(T.validateBundle(null, 0).ok, false);
    assert.strictEqual(T.validateBundle({ kind: 'other', account: { id: 'a' }, data: {} }, 0).ok, false);
    assert.strictEqual(T.validateBundle({ kind: 'orbit-account', account: {}, data: {} }, 0).ok, false, 'no id');
    assert.strictEqual(T.validateBundle({ kind: 'orbit-account', account: { id: 'a' } }, 0).ok, false, 'no data');
  });

  await ok('validateBundle catches a TRUNCATED transfer', () => {
    const b = T.buildBundle({ id: 'u1', name: 'Dan', tag: '2847' }, { friends: [], chats: [] });
    const real = JSON.stringify(b).length;
    assert.strictEqual(T.validateBundle(b, real).ok, true, 'exact size should pass');
    // The offer promised far more than arrived — a partial transfer must not
    // look complete.
    assert.strictEqual(T.validateBundle(b, real + 100000).ok, false);
    assert.strictEqual(T.validateBundle(b, real + 100000).reason, 'size-mismatch');
  });

  await ok('buildBundle carries the account and the data', () => {
    const b = T.buildBundle({ id: 'u1', name: 'Dan', tag: '2847' }, { friends: [{ id: 'x' }] });
    assert.strictEqual(b.kind, 'orbit-account');
    assert.strictEqual(b.account.id, 'u1');
    assert.strictEqual(b.account.name, 'Dan');
    assert.deepStrictEqual(b.data.friends, [{ id: 'x' }]);
  });

  await ok('buildBundle truncates an absurd name', () => {
    const b = T.buildBundle({ id: 'u1', name: 'n'.repeat(5000), tag: '' }, {});
    assert.ok(b.account.name.length <= 64);
  });

  // ── desktop backup → mobile account shape ────────────────────────────────

  const desktopBackup = () => ({
    version: 1,
    data: {
      users: [{ userId: 'u_dan', username: 'Dan', usertag: '2847', status: 'online', avatar: null, bio: 'hi' }],
      friends: [
        { userId: 'p_mai', username: 'Mai', usertag: '7714', status: 'online', avatar: null, bio: '' },
        { userId: 'p_ben', username: 'Ben', usertag: '0001', status: 'offline', avatar: null, bio: '' }
      ],
      messages: [
        { id: 'm1', chatId: 'p_mai', sender: 'p_mai', text: 'hello', timestamp: '2026-10-01T10:00:00Z' },
        { id: 'm2', chatId: 'p_mai', sender: 'u_dan', text: 'hey', timestamp: '2026-10-01T10:01:00Z' },
        { id: 'm3', chatId: 'p_ben', sender: 'p_ben', text: 'yo', timestamp: '2026-10-01T09:00:00Z' }
      ],
      groups: [{ groupId: 'g1', groupName: 'Team', ownerId: 'u_dan', createdAt: '2026-09-01T00:00:00Z' }],
      settings: [
        { key: 'theme', value: 'dark' },
        { key: 'appZoom', value: '110' },
        { key: 'e2eeEnabled', value: 'true' }
      ]
    }
  });

  await ok('toMobileAccount marks MY messages as "me"', () => {
    const acc = T.toMobileAccount(desktopBackup());
    const conv = acc.messages['p_mai'];
    assert.strictEqual(conv.length, 2);
    assert.strictEqual(conv[0].from, 'p_mai', 'their message kept the sender id');
    assert.strictEqual(conv[1].from, 'me', 'my own message must become "me"');
  });

  await ok('toMobileAccount groups messages by chat', () => {
    const acc = T.toMobileAccount(desktopBackup());
    assert.deepStrictEqual(Object.keys(acc.messages).sort(), ['p_ben', 'p_mai']);
    assert.strictEqual(acc.messages['p_ben'].length, 1);
  });

  await ok('toMobileAccount derives chats from the messages', () => {
    const acc = T.toMobileAccount(desktopBackup());
    const mai = acc.chats.filter(c => c.id === 'p_mai')[0];
    assert.ok(mai, 'no chat row for p_mai');
    assert.strictEqual(mai.name, 'Mai', 'name should come from the friend row');
    assert.strictEqual(mai.lastMessage, 'hey');
    assert.strictEqual(mai.lastTime, '2026-10-01T10:01:00Z');
    // newest conversation first
    assert.strictEqual(acc.chats[0].id, 'p_mai');
  });

  await ok('toMobileAccount carries friends, groups and the user', () => {
    const acc = T.toMobileAccount(desktopBackup());
    assert.strictEqual(acc.friends.length, 2);
    assert.strictEqual(acc.friends[0].id, 'p_mai');
    assert.strictEqual(acc.friends[0].name, 'Mai');
    assert.strictEqual(acc.groups.length, 1);
    assert.strictEqual(acc.groups[0].id, 'g1');
    assert.strictEqual(acc.user.id, 'u_dan');
    assert.strictEqual(acc.user.name, 'Dan');
  });

  await ok('toMobileAccount parses settings out of TEXT', () => {
    const acc = T.toMobileAccount(desktopBackup());
    assert.strictEqual(acc.settings.theme, 'dark', 'a plain string stays a string');
    assert.strictEqual(acc.settings.appZoom, 110, 'a number must not arrive as "110"');
    assert.strictEqual(acc.settings.e2eeEnabled, true, 'a boolean must not arrive as "true"');
  });

  await ok('toMobileAccount survives an empty or broken backup', () => {
    assert.strictEqual(T.toMobileAccount(null), null);
    assert.strictEqual(T.toMobileAccount({}), null);
    assert.strictEqual(T.toMobileAccount({ data: {} }).friends.length, 0);
    assert.strictEqual(T.toMobileAccount({ data: { messages: 'nope' } }).chats.length, 0);
    // A friend row with no id must not become a contact with an empty id.
    const acc = T.toMobileAccount({ data: { friends: [{ username: 'ghost' }] } });
    assert.strictEqual(acc.friends.length, 0);
  });

  await ok('a converted account round-trips through the bundle', () => {
    const acc = T.toMobileAccount(desktopBackup());
    const b = T.buildBundle({ id: acc.user.id, name: acc.user.name, tag: acc.user.tag }, acc);
    const size = JSON.stringify(b).length;
    assert.strictEqual(T.validateBundle(b, size).ok, true);
  });

  await ok('describeReason always says something human', () => {
    const reasons = ['malformed', 'not-a-bundle', 'too-large', 'bad-kdf', 'wrong-transfer',
                     'bad-seq', 'bad-chunk', 'size-mismatch', 'bad-token', 'declined', 'nonsense'];
    reasons.forEach(r => {
      const s = T.describeReason(r);
      assert.ok(typeof s === 'string' && s.length > 3, 'no message for ' + r);
    });
  });

  console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
  if (failures.length) {
    failures.forEach(f => console.log('  ! ' + f));
    process.exit(1);
  }
})();
