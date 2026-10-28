// tests/unit/e2ee-interop.test.js
// Cross-platform E2EE interop — the REAL desktop implementation vs WebCrypto.
//
// Run with: npm run test:unit
//
// This is the test that proves Phase 1 actually works. It loads the shipped
// desktop module (desktop/e2ee.js) — not a copy of its logic — and exchanges
// real messages with a WebCrypto peer that mirrors shared/crypto/e2ee-mobile.js
// exactly. If desktop and mobile ever drift apart again, this fails.
//
// See plans/docs/Orbit E2EE Unification Design.md

const path = require('path');
const crypto = require('crypto');
const { webcrypto } = crypto;
const subtle = webcrypto.subtle;

const ROOT = path.join(__dirname, '..', '..');
const K = require(path.join(ROOT, 'shared', 'crypto', 'e2ee-key.js'));
const createE2EE = require(path.join(ROOT, 'desktop', 'e2ee.js'));

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

function ok(name, condition) {
  check(name, !!condition, true);
}

// Minimal stand-in for electron-store.
function fakeStore(initial) {
  const data = Object.assign({}, initial);
  return {
    get: (k) => data[k],
    set: (k, v) => { data[k] = v; },
    _data: data
  };
}

/* =====================================================================
   Mobile mirror — replicates shared/crypto/e2ee-mobile.js
   ===================================================================== */

async function mobileGenerate() {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const spki = new Uint8Array(await subtle.exportKey('spki', kp.publicKey));
  const b64 = K.bytesToBase64(spki);
  return { kp, spkiB64: b64, spkiPem: K.wrapPem(b64) };
}

// Mirrors deriveAesKey(): HKDF-SHA256, 16-byte zero salt, info 'orbit-e2ee-v1'.
async function mobileAesKey(kp, peerSpkiHex) {
  const peer = await subtle.importKey(
    'spki', K.hexToBytes(peerSpkiHex),
    { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const bits = await subtle.deriveBits({ name: 'ECDH', public: peer }, kp.privateKey, 256);
  const hk = await subtle.importKey('raw', bits, { name: 'HKDF' }, false, ['deriveKey']);
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(K.KDF.saltBytes),
      info: new TextEncoder().encode(K.KDF.info)
    },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

// Mirrors Orbit.E2EE.encrypt() — returns { ciphertext, nonce } as separate fields.
async function mobileEncrypt(kp, peerSpkiHex, plaintext) {
  const aes = await mobileAesKey(kp, peerSpkiHex);
  const iv = webcrypto.getRandomValues(new Uint8Array(K.ENVELOPE.ivBytes));
  const ct = await subtle.encrypt(
    { name: 'AES-GCM', iv }, aes, new TextEncoder().encode(plaintext)
  );
  return { ciphertext: K.bytesToBase64(new Uint8Array(ct)), nonce: K.bytesToBase64(iv) };
}

// Mirrors Orbit.E2EE.decrypt().
async function mobileDecrypt(kp, peerSpkiHex, ciphertextB64, nonceB64) {
  const aes = await mobileAesKey(kp, peerSpkiHex);
  const out = await subtle.decrypt(
    { name: 'AES-GCM', iv: K.base64ToBytes(nonceB64) },
    aes, K.base64ToBytes(ciphertextB64)
  );
  return new TextDecoder().decode(out);
}

/* =====================================================================
   Tests
   ===================================================================== */

async function main() {
  console.log('e2ee-interop: desktop keypair format');

  const desktopStore = fakeStore();
  const desktop = createE2EE(desktopStore);
  ok('shared spec loaded', desktop.hasSharedSpec);

  const desktopPub = desktop.getPublicKey();
  check('desktop public key is SPKI hex (182 chars)', desktopPub.length, 182);
  check('desktop public key carries the DER header', desktopPub.slice(0, 4), '3059');

  // The decisive format check: WebCrypto must be able to parse the desktop key.
  let desktopKeyImportable = true;
  try {
    await subtle.importKey(
      'spki', K.hexToBytes(desktopPub),
      { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
  } catch (e) {
    desktopKeyImportable = false;
  }
  ok('WebCrypto can import the desktop public key', desktopKeyImportable);

  console.log('e2ee-interop: peer key formats accepted');

  const mobile = await mobileGenerate();

  // Mobile advertises a PEM. Desktop must accept PEM, bare base64, AND hex —
  // a hex-only parser silently rejects every mobile peer.
  ok('desktop accepts mobile key as PEM', desktop.isSpkiKey(mobile.spkiPem));
  ok('desktop accepts mobile key as base64 body', desktop.isSpkiKey(mobile.spkiB64));
  ok('desktop accepts mobile key as SPKI hex', desktop.isSpkiKey(K.bytesToHex(K.base64ToBytes(mobile.spkiB64))));
  check('desktop classifies PEM as spki', desktop.peerKeyInfo(mobile.spkiPem).format, 'spki');

  const legacyRawHex = '04' + 'ab'.repeat(64);
  check('desktop classifies raw hex as legacy', desktop.peerKeyInfo(legacyRawHex).format, 'hex');
  check('desktop rejects garbage', desktop.peerKeyInfo('not-a-key'), null);
  check('desktop rejects null', desktop.peerKeyInfo(null), null);

  console.log('e2ee-interop: desktop -> mobile');

  const fromDesktop = desktop.encrypt('hello from desktop', mobile.spkiPem);
  check('desktop encrypt yields v2 envelope', fromDesktop.v, 2);
  ok('v2 carries ciphertext', !!fromDesktop.ciphertext);
  ok('v2 carries nonce', !!fromDesktop.nonce);
  ok('v2 does NOT carry a packed string', fromDesktop.packed === undefined);

  const mobileGot = await mobileDecrypt(mobile.kp, desktopPub, fromDesktop.ciphertext, fromDesktop.nonce);
  check('mobile decrypts a desktop message', mobileGot, 'hello from desktop');

  console.log('e2ee-interop: mobile -> desktop');

  const fromMobile = await mobileEncrypt(mobile.kp, desktopPub, 'hello from mobile');
  const desktopGot = desktop.decryptFields(fromMobile.ciphertext, fromMobile.nonce, mobile.spkiPem);
  check('desktop decrypts a mobile message', desktopGot, 'hello from mobile');

  console.log('e2ee-interop: multi-byte content');

  const unicode = 'Xin chào 👋 — emoji and accents';
  const uniEnc = desktop.encrypt(unicode, mobile.spkiPem);
  const uniBack = await mobileDecrypt(mobile.kp, desktopPub, uniEnc.ciphertext, uniEnc.nonce);
  check('unicode survives desktop -> mobile', uniBack, unicode);

  console.log('e2ee-interop: legacy peer still works');

  // An older desktop build advertises a raw uncompressed point and derives
  // with SHA-256. It must still get the legacy packed envelope.
  const legacyEcdh = crypto.createECDH('prime256v1');
  legacyEcdh.generateKeys();
  const legacyPeerHex = legacyEcdh.getPublicKey('hex');

  const legacyEnc = desktop.encrypt('legacy path', legacyPeerHex);
  check('legacy peer gets v1 envelope', legacyEnc.v, 1);
  ok('v1 carries a packed string', !!legacyEnc.packed);
  ok('v1 has no ciphertext field', legacyEnc.ciphertext === undefined);

  // Simulate the OLD desktop decrypting. It derives SHA-256(ECDH(its private
  // key, our RAW public point)) — not HKDF — so it is reproduced directly here
  // rather than through createE2EE(), which would migrate its key to SPKI and
  // take the unified path instead.
  const legacyShared = legacyEcdh.computeSecret(Buffer.from(desktop.getKeyPair().rawPublicKey, 'hex'));
  const legacyAes = crypto.createHash('sha256').update(legacyShared).digest();
  const legacyBuf = Buffer.from(legacyEnc.packed, 'base64');
  const legacyDecipher = crypto.createDecipheriv('aes-256-gcm', legacyAes, legacyBuf.subarray(0, 12));
  legacyDecipher.setAuthTag(legacyBuf.subarray(legacyBuf.length - 16));
  const legacyPlain = legacyDecipher.update(legacyBuf.subarray(12, legacyBuf.length - 16)) + legacyDecipher.final('utf8');
  check('old desktop can still decrypt the v1 envelope', legacyPlain, 'legacy path');

  // And the converse: an old desktop encrypting to us still decrypts via the
  // legacy path, because the peer key it presents is a raw point.
  const legacyReplyIv = crypto.randomBytes(12);
  const legacyReplyCipher = crypto.createCipheriv('aes-256-gcm', legacyAes, legacyReplyIv);
  const legacyReplyEnc = Buffer.concat([
    legacyReplyCipher.update('reply from old desktop', 'utf8'),
    legacyReplyCipher.final()
  ]);
  const legacyReplyPacked = Buffer.concat([
    legacyReplyIv, legacyReplyEnc, legacyReplyCipher.getAuthTag()
  ]).toString('base64');
  check(
    'we can decrypt an old desktop message',
    desktop.decryptPacked(legacyReplyPacked, legacyPeerHex),
    'reply from old desktop'
  );

  console.log('e2ee-interop: legacy keypair migration');

  // A user upgrading from an older build has a stored raw-point keypair.
  // Migration must NOT change the private key, or every existing peer loses
  // the ability to talk to them.
  const oldEcdh = crypto.createECDH('prime256v1');
  oldEcdh.generateKeys();
  const oldPrivate = oldEcdh.getPrivateKey('hex');
  const oldRawPublic = oldEcdh.getPublicKey('hex');

  const migrateStore = fakeStore({
    'e2ee-keypair': { privateKey: oldPrivate, publicKey: oldRawPublic }
  });
  const migrated = createE2EE(migrateStore).getKeyPair();

  check('private key is preserved across migration', migrated.privateKey, oldPrivate);
  check('raw public point is preserved', migrated.rawPublicKey, oldRawPublic);
  check('advertised public key became SPKI', migrated.publicKey.length, 182);
  check('SPKI unwraps back to the original point', K.spkiToRawPoint(migrated.publicKey), oldRawPublic);
  check('migration was persisted', migrateStore._data['e2ee-keypair'].publicKey.length, 182);

  // And the migrated key must still interoperate with a mobile peer.
  const migratedDesktop = createE2EE(migrateStore);
  const postMigrate = migratedDesktop.encrypt('after migration', mobile.spkiPem);
  const postMigrateBack = await mobileDecrypt(mobile.kp, migratedDesktop.getPublicKey(), postMigrate.ciphertext, postMigrate.nonce);
  check('migrated desktop still talks to mobile', postMigrateBack, 'after migration');

  console.log('e2ee-interop: failure handling');

  let threwOnGarbage = false;
  try { desktop.encrypt('x', 'garbage-key'); } catch (e) { threwOnGarbage = true; }
  ok('encrypt throws on an unusable peer key', threwOnGarbage);

  let threwOnShortCiphertext = false;
  try { desktop.decryptFields('AAAA', fromMobile.nonce, mobile.spkiPem); } catch (e) { threwOnShortCiphertext = true; }
  ok('decryptFields rejects a too-short ciphertext', threwOnShortCiphertext);
}

main().then(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error('\ninterop test threw:', e);
  process.exit(1);
});
