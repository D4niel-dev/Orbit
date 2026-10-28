// The web of trust: signed alerts, verified against the reporter's own key.
//
// ⚠ These tests exercise the WHOLE statement — build, sign, verify, store, expire —
// with real ECDSA keys. A signature test that mocks the crypto proves nothing.
global.window = global;
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;

require('../../shared/crypto/identity-key');
require('../../shared/security/reputation');

const IK = global.window.OrbitIdentityKey;
const R = global.window.OrbitReputation;

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else { results.fail.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}
function mem() { const m = {}; return { get: (k) => (m[k] === undefined ? null : m[k]), set: (k, v) => { m[k] = v; } }; }

const AVA = { userId: 'p_ava', username: 'Ava Chen' };
const BOB = { userId: 'p_bob', username: 'Bob' };

(async () => {
  // Ava's device signs; Bob's device is the one that receives and keeps the warning.
  IK._reset(mem());
  const avaKey = await IK.ensure();
  const avaPublic = avaKey.publicKey;

  R._setStorage(mem());

  console.log('\n== the canonical string is stable and total ==');
  const c = R.canonicalAlert({ reporterId: 'p_ava', subjectId: 'p_bob', reason: 'harassment', ts: 1700000000000 });
  check('it names the version', c.indexOf('orbit-reputation-v1') === 0, c);
  check('and every field, in a fixed order',
    c === 'orbit-reputation-v1|reporter=p_ava|subject=p_bob|reason=harassment|ts=1700000000000', c);
  check('missing fields do not throw', typeof R.canonicalAlert({}) === 'string');

  console.log('\n== build, sign, verify ==');
  const payload = await R.buildAlert(AVA, 'p_bob', 'harassment');
  check('the payload carries the alert', payload.alert.subjectId === 'p_bob');
  check('and the signer public key', payload.publicKey === avaPublic);
  const v = await R.verifyAlert(payload, avaPublic);
  check('it verifies against the reporter key', v.ok === true, v);
  check('and survives the round trip intact', v.ok && v.alert.reason === 'harassment');

  console.log('\n== tampering is caught ==');
  const swapSubject = JSON.parse(JSON.stringify(payload));
  swapSubject.alert.subjectId = 'p_carol';
  check('changing the subject fails', (await R.verifyAlert(swapSubject, avaPublic)).ok === false);

  const swapReason = JSON.parse(JSON.stringify(payload));
  swapReason.alert.reason = 'spam';
  check('changing the reason fails', (await R.verifyAlert(swapReason, avaPublic)).ok === false);

  const backdate = JSON.parse(JSON.stringify(payload));
  backdate.alert.ts = payload.alert.ts - 1000;
  check('changing the timestamp fails', (await R.verifyAlert(backdate, avaPublic)).ok === false);

  console.log('\n== a different key cannot pass off the report ==');
  IK._reset(mem());
  const mallory = await IK.ensure();
  check('Mallory\'s key does not verify Ava\'s alert',
    (await R.verifyAlert(payload, mallory.publicKey)).ok === false);
  check('and no key at all is refused', (await R.verifyAlert(payload, null)).ok === false);

  console.log('\n== the verifier refuses nonsense rather than throwing ==');
  check('unknown reason', (await R.verifyAlert({ alert: { reason: 'because', subjectId: 'x', ts: Date.now() }, sig: 'x' }, avaPublic)).ok === false);
  check('timestamp far in the future', (await R.verifyAlert({
    alert: { reporterId: 'p_ava', subjectId: 'p_bob', reason: 'spam', ts: Date.now() + 5 * 24 * 3600 * 1000 },
    sig: 'x'
  }, avaPublic)).ok === false);
  check('malformed payload', (await R.verifyAlert(null, avaPublic)).ok === false);

  console.log('\n== warnings are stored, deduplicated and expire ==');
  R._setStorage(mem());
  R.addWarning({ reporterId: 'p_ava', reporterName: 'Ava Chen', subjectId: 'p_bob', reason: 'harassment', ts: Date.now() }, avaPublic);
  check('one warning about Bob', R.warningsFor('p_bob').length === 1);
  check('and none about anyone else', R.warningsFor('p_carol').length === 0);

  R.addWarning({ reporterId: 'p_ava', reporterName: 'Ava Chen', subjectId: 'p_bob', reason: 'spam', ts: Date.now() }, avaPublic);
  const deduped = R.warningsFor('p_bob');
  check('the same reporter does not stack up', deduped.length === 1, deduped.length);
  check('the newest report wins', deduped[0].reason === 'spam', deduped[0].reason);

  R.addWarning({ reporterId: 'p_dan', reporterName: 'Dan', subjectId: 'p_bob', reason: 'scam', ts: Date.now() + 1 }, avaPublic);
  check('two different reporters are two warnings', R.warningsFor('p_bob').length === 2);
  check('newest first', R.warningsFor('p_bob')[0].reporterId === 'p_dan');

  // ⚠ Equal timestamps are real — two alerts can arrive in the same millisecond — and
  // without a tie-break the list order is whatever the sort happens to do.
  R._setStorage(mem());
  const same = Date.now();
  R.addWarning({ reporterId: 'p_zoe', reporterName: 'Zoe', subjectId: 'p_max', reason: 'spam', ts: same }, avaPublic);
  R.addWarning({ reporterId: 'p_amy', reporterName: 'Amy', subjectId: 'p_max', reason: 'spam', ts: same }, avaPublic);
  const orderA = R.warningsFor('p_max').map((w) => w.reporterId).join(',');
  const orderB = R.warningsFor('p_max').map((w) => w.reporterId).join(',');
  check('equal timestamps still order deterministically', orderA === orderB, { orderA, orderB });
  check('and the tie-break is by reporter id', orderA === 'p_amy,p_zoe', orderA);

  const stale = Date.now() - R.DEFAULT_TTL - 1000;
  R.addWarning({ reporterId: 'p_old', reporterName: 'Old', subjectId: 'p_eve', reason: 'other', ts: stale }, avaPublic);
  check('a warning past its TTL is not returned', R.warningsFor('p_eve').length === 0);
  check('and is not in allWarnings either',
    R.allWarnings().filter((w) => w.subjectId === 'p_eve').length === 0);

  console.log('\n== there is no way to pass a received report on ==');
  check('the module exposes no re-broadcast entry point',
    typeof R.broadcast === 'undefined' && typeof R.forward === 'undefined' && typeof R.relay === 'undefined');

  console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
  if (results.fail.length) process.exit(1);
})().catch((e) => { console.error('THREW: ' + e.message); process.exit(1); });
