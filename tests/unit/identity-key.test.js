// The device signing key — the primitive Part 2's signed reports need.
//
// ⚠ This does NOT test the web of trust, because the web of trust does not exist yet:
// nothing distributes the public key. It tests the primitive, so that when the identity
// exchange starts carrying the key there is something proven underneath it.
global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;

require('../../shared/crypto/identity-key');
const IK = global.window.OrbitIdentityKey;

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else { results.fail.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}

function memAdapter() {
  const m = {};
  return { get: (k) => (m[k] === undefined ? null : m[k]), set: (k, v) => { m[k] = v; } };
}

(async () => {
  console.log('\n== a key is created on first use, and reused after ==');
  IK._reset(memAdapter());
  const a = await IK.ensure();
  check('ensure() returns a key id', typeof a.keyId === 'string' && a.keyId.length > 1, a.keyId);
  check('and a base64 public key', typeof a.publicKey === 'string' && a.publicKey.length > 40, (a.publicKey || '').length);
  const again = await IK.ensure();
  check('calling it twice does not mint a new key', again.keyId === a.keyId, { first: a.keyId, second: again.keyId });
  check('nor a new public key', again.publicKey === a.publicKey);

  console.log('\n== the key survives a reload ==');
  IK._reset();  // drop the cache, keep the stored blob
  const reloaded = await IK.ensure();
  check('the same key comes back from storage', reloaded.keyId === a.keyId, { before: a.keyId, after: reloaded.keyId });
  check('with the same public key', reloaded.publicKey === a.publicKey);

  console.log('\n== sign, then verify ==');
  const payload = 'REPUTATION_ALERT|reporter=p_ava|subject=p_bob|reason=harassment|ts=1700000000000';
  const s1 = await IK.sign(payload);
  check('sign() returns a signature', typeof s1.sig === 'string' && s1.sig.length > 40, (s1.sig || '').length);
  check('and carries the key that made it', s1.keyId === a.keyId && s1.publicKey === a.publicKey);
  check('the signature verifies', await IK.verify(s1.publicKey, payload, s1.sig) === true);

  console.log('\n== and refuses everything that is not that exact statement ==');
  check('a changed payload fails', await IK.verify(s1.publicKey, payload + ' ', s1.sig) === false);
  check('a changed subject fails', await IK.verify(s1.publicKey, payload.replace('p_bob', 'p_carol'), s1.sig) === false);
  check('a truncated signature fails', await IK.verify(s1.publicKey, payload, s1.sig.slice(0, 20)) === false);
  check('garbage instead of a signature fails', await IK.verify(s1.publicKey, payload, 'not-base64!!') === false);

  console.log('\n== a different key cannot pass off the signature ==');
  IK._reset(memAdapter());
  const other = await IK.ensure();
  check('the other device has a different key', other.keyId !== a.keyId);
  check('its public key does not verify the first device signature',
    await IK.verify(other.publicKey, payload, s1.sig) === false);

  console.log('\n== ECDSA signatures are randomised, and both verify ==');
  const s2 = await IK.sign(payload);
  check('two signatures over the same data differ', s1.sig !== s2.sig);
  check('both are valid', (await IK.verify(s1.publicKey, payload, s1.sig)) && (await IK.verify(s2.publicKey, payload, s2.sig)));

  console.log('\n== missing pieces are false, not a throw ==');
  check('no public key', await IK.verify('', payload, s1.sig) === false);
  check('no signature', await IK.verify(s1.publicKey, payload, '') === false);

  console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
  if (results.fail.length) process.exit(1);
})().catch((e) => { console.error('THREW: ' + e.message); process.exit(1); });
