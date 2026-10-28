// tests/unit/e2ee-key.test.js
// Unit + interop tests for shared/crypto/e2ee-key.js
//
// Run with: npm run test:unit
//
// Two halves:
//   1. Pure byte conversions — no crypto, just correctness.
//   2. INTEROP PROOF — the important half. Node's crypto and WebCrypto
//      (which is what the Android WebView uses) must agree on the ECDH secret
//      and on the HKDF-derived AES key, and the SPKI conversion this module
//      produces must be accepted by WebCrypto's real DER parser.
//
// If half 2 ever fails, cross-platform E2EE is impossible and the whole
// unification plan is void. That is why it is asserted rather than assumed.

const path = require('path');
const crypto = require('crypto');
const { webcrypto } = crypto;
const subtle = webcrypto.subtle;

global.window = global;
require(path.join(__dirname, '..', '..', 'shared', 'crypto', 'e2ee-key.js'));
const K = global.window.Orbit.E2EEKey;

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

/* =====================================================================
   Half 1 — pure conversions
   ===================================================================== */

console.log('e2ee-key: byte helpers');

check('hex roundtrip', K.bytesToHex(K.hexToBytes('04abcdef')), '04abcdef');
check('hex odd length rejected', K.hexToBytes('abc'), null);
check('hex non-hex rejected', K.hexToBytes('zz'), null);
check('hex empty', K.bytesToHex(K.hexToBytes('')), '');
check('base64 roundtrip (no pad)', K.bytesToBase64(K.hexToBytes('040102')), 'BAEC');
check('base64 roundtrip (1 pad)', K.bytesToBase64(K.hexToBytes('0401')), 'BAE=');
check('base64 roundtrip (2 pad)', K.bytesToBase64(K.hexToBytes('04')), 'BA==');
check('base64 decode ignores whitespace', K.bytesToHex(K.base64ToBytes('BA E=')), '0401');
check('base64 -> hex -> base64 stable', K.bytesToBase64(K.hexToBytes('00ff10')), 'AP8Q');

console.log('e2ee-key: SPKI conversion');

// A synthetic but structurally valid uncompressed point.
const RAW = '04' + '11'.repeat(32) + '22'.repeat(32);
const SPKI = K.rawPointToSpki(RAW);

check('raw point is 65 bytes', K.hexToBytes(RAW).length, 65);
check('spki is 91 bytes', K.hexToBytes(SPKI).length, 91);
ok('spki starts with the known header', SPKI.indexOf(K.SPKI_P256_HEADER_HEX) === 0);
check('spki -> raw roundtrip', K.spkiToRawPoint(SPKI), RAW);
check('raw -> spki -> raw roundtrip', K.spkiToRawPoint(K.rawPointToSpki(RAW)), RAW);
check('wrong-length raw rejected', K.rawPointToSpki('04' + '11'.repeat(10)), null);
check('non-04 raw rejected', K.rawPointToSpki('05' + '11'.repeat(64)), null);
check('spki with bad header rejected', K.spkiToRawPoint('ff' + SPKI.slice(2)), null);
check('short spki rejected', K.spkiToRawPoint(SPKI.slice(0, 100)), null);

console.log('e2ee-key: format detection and normalization');

const spkiB64 = K.bytesToBase64(K.hexToBytes(SPKI));
const spkiPem = K.wrapPem(spkiB64);

check('detects raw hex', K.detectFormat(RAW), 'hex');
check('detects spki base64', K.detectFormat(spkiB64), 'spki');
check('detects spki pem', K.detectFormat(spkiPem), 'spki');
check('detects uppercase hex', K.detectFormat(RAW.toUpperCase()), 'hex');
check('rejects garbage', K.detectFormat('not-a-key'), null);
check('rejects null', K.detectFormat(null), null);
check('rejects wrong-length hex', K.detectFormat('04' + '11'.repeat(60)), null);
check('spki base64 length is 124', spkiB64.length, K.SPKI_B64_LEN);

const normHex = K.normalize(RAW);
const normPem = K.normalize(spkiPem);
check('normalize(hex).hex', normHex.hex, RAW);
check('normalize(hex).format', normHex.format, 'hex');
check('normalize(pem).hex matches raw', normPem.hex, RAW);
check('normalize(pem).base64 matches', normPem.base64, spkiB64);
check('normalize is idempotent across forms', normHex.spkiHex, normPem.spkiHex);
check('normalize rejects garbage', K.normalize('nope'), null);

// SPKI as HEX — what desktop advertises. Without this branch a desktop peer is
// rejected as an unrecognised key format, which silently breaks desktop-to-desktop.
check('detects spki hex', K.detectFormat(SPKI), 'spki');
check('spki hex is 182 chars', SPKI.length, K.SPKI_BYTES * 2);
check('isSpkiHex true for spki', K.isSpkiHex(SPKI), true);
check('isSpkiHex false for raw point', K.isSpkiHex(RAW), false);
check('normalize(spki hex).hex', K.normalize(SPKI).hex, RAW);
check('normalize(spki hex).base64', K.normalize(SPKI).base64, spkiB64);
check('normalize(spki hex).pem', K.normalize(SPKI).pem, spkiPem);
check('normalize(spki hex).spkiHex', K.normalize(SPKI).spkiHex, SPKI.toLowerCase());
check('all three spki forms agree', [
  K.normalize(SPKI).hex,
  K.normalize(spkiB64).hex,
  K.normalize(spkiPem).hex
], [RAW, RAW, RAW]);

console.log('e2ee-key: envelope layout conversion');

// Build a fake packed envelope: iv(12) || ct(4) || tag(16)
const iv = K.hexToBytes('00'.repeat(12));
const ct = K.hexToBytes('deadbeef');
const tag = K.hexToBytes('aa'.repeat(16));
const packedBytes = new Uint8Array(iv.length + ct.length + tag.length);
packedBytes.set(iv, 0);
packedBytes.set(ct, 12);
packedBytes.set(tag, 16);
const packed = K.bytesToBase64(packedBytes);

const fields = K.packedToFields(packed);
check('packed -> nonce is the iv', fields.nonce, K.bytesToBase64(iv));
check('packed -> ciphertext is ct||tag', fields.ciphertext, K.bytesToBase64(new Uint8Array([...ct, ...tag])));
check('fields -> packed roundtrip', K.fieldsToPacked(fields.ciphertext, fields.nonce), packed);
check('too-short packed rejected', K.packedToFields(K.bytesToBase64(K.hexToBytes('00'.repeat(20)))), null);
check('bad nonce length rejected', K.fieldsToPacked(fields.ciphertext, 'AAAA'), null);

/* =====================================================================
   Half 2 — interop proof (Node crypto vs WebCrypto)
   ===================================================================== */

async function interop() {
  console.log('e2ee-key: INTEROP — SPKI accepted by WebCrypto');

  // Desktop-style keypair: Node ECDH, raw uncompressed point.
  const ecdhA = crypto.createECDH('prime256v1');
  ecdhA.generateKeys();
  const pubAraw = ecdhA.getPublicKey();                 // Buffer(65)
  const pubAhex = pubAraw.toString('hex');

  // Mobile-style keypair: WebCrypto, SPKI.
  const kpB = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const spkiB = new Uint8Array(await subtle.exportKey('spki', kpB.publicKey));
  check('WebCrypto SPKI is 91 bytes', spkiB.length, K.SPKI_BYTES);

  // THE conversion that makes cross-platform possible: take desktop's raw
  // point, wrap it, and hand it to WebCrypto. If our header were wrong this
  // import would throw.
  const spkiA = K.rawPointToSpki(pubAhex);
  let importedOk = true;
  let pubA_forWeb = null;
  try {
    pubA_forWeb = await subtle.importKey(
      'spki', K.hexToBytes(spkiA),
      { name: 'ECDH', namedCurve: 'P-256' }, false, []
    );
  } catch (e) {
    importedOk = false;
  }
  ok('raw point wrapped as SPKI imports into WebCrypto', importedOk);

  // And the reverse: recover the raw point from a real WebCrypto SPKI.
  const rawB = K.spkiToRawPoint(K.bytesToHex(spkiB));
  ok('real WebCrypto SPKI unwraps to a 65-byte point', rawB && rawB.length === 130);
  check('unwrapped point starts with 04', rawB.slice(0, 2), '04');

  console.log('e2ee-key: INTEROP — shared secret');

  const nodeSecret = ecdhA.computeSecret(Buffer.from(K.hexToBytes(rawB)));
  const webSecret = Buffer.from(
    await subtle.deriveBits({ name: 'ECDH', public: pubA_forWeb }, kpB.privateKey, 256)
  );

  check('ECDH secret is 32 bytes', nodeSecret.length, 32);
  check('Node ECDH secret == WebCrypto ECDH secret', nodeSecret.toString('hex'), webSecret.toString('hex'));

  console.log('e2ee-key: INTEROP — key derivation');

  const SALT = new Uint8Array(K.KDF.saltBytes);           // all zero
  const INFO = Buffer.from(K.KDF.info, 'utf8');

  const legacy = crypto.createHash('sha256').update(nodeSecret).digest();
  const nodeHkdf = Buffer.from(crypto.hkdfSync(K.KDF.hash.toLowerCase(), nodeSecret, SALT, INFO, K.KDF.outputBytes));

  const hkdfKey = await subtle.importKey('raw', webSecret, { name: 'HKDF' }, false, ['deriveBits']);
  const webHkdf = Buffer.from(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: INFO },
      hkdfKey,
      K.KDF.outputBytes * 8
    )
  );

  check('HKDF output is 32 bytes', nodeHkdf.length, 32);
  check('Node HKDF == WebCrypto HKDF', nodeHkdf.toString('hex'), webHkdf.toString('hex'));
  // Documents the divergence this work exists to remove. If this ever becomes
  // true, the two platforms were already compatible.
  ok('legacy SHA-256 differs from HKDF (the bug)', legacy.toString('hex') !== nodeHkdf.toString('hex'));

  console.log('e2ee-key: INTEROP — end-to-end message');

  // Desktop encrypts with the unified key, mobile-style: AES-GCM, packed as
  // iv||ct||tag, then converted to the canonical two-field layout.
  const msgIv = crypto.getRandomValues(new Uint8Array(K.ENVELOPE.ivBytes));
  const plaintext = 'cross-platform hello';
  const cipher = crypto.createCipheriv('aes-256-gcm', nodeHkdf, msgIv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const packedMsg = K.bytesToBase64(Buffer.concat([Buffer.from(msgIv), enc, cipher.getAuthTag()]));

  const wire = K.packedToFields(packedMsg);
  ok('wire payload has ciphertext + nonce', !!(wire && wire.ciphertext && wire.nonce));

  // WebCrypto (the mobile side) decrypts using only the wire fields.
  const webAes = await subtle.importKey('raw', webHkdf, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: K.base64ToBytes(wire.nonce) },
    webAes,
    K.base64ToBytes(wire.ciphertext)
  );

  check('Node encrypt -> WebCrypto decrypt', Buffer.from(decrypted).toString('utf8'), plaintext);

  // And the reverse direction.
  const replyIv = webcrypto.getRandomValues(new Uint8Array(K.ENVELOPE.ivBytes));
  const replyWeb = await subtle.encrypt(
    { name: 'AES-GCM', iv: replyIv },
    await subtle.importKey('raw', webHkdf, { name: 'AES-GCM' }, false, ['encrypt']),
    new TextEncoder().encode('reply from mobile')
  );
  const replyPacked = K.fieldsToPacked(
    K.bytesToBase64(new Uint8Array(replyWeb)),
    K.bytesToBase64(replyIv)
  );
  const replyBytes = Buffer.from(K.base64ToBytes(replyPacked));
  const decipher = crypto.createDecipheriv('aes-256-gcm', nodeHkdf, replyBytes.slice(0, 12));
  decipher.setAuthTag(replyBytes.slice(replyBytes.length - 16));
  const replyPlain = decipher.update(replyBytes.slice(12, replyBytes.length - 16)) + decipher.final('utf8');

  check('WebCrypto encrypt -> Node decrypt', replyPlain, 'reply from mobile');
}

interop().then(() => {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error('\ninterop test threw:', e);
  process.exit(1);
});
