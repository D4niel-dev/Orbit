// desktop/e2ee.js
// Desktop E2EE — Node crypto implementation of the unified scheme.
//
// Extracted from main.js so the real code can be unit-tested without booting
// Electron (see tests/unit/e2ee-interop.test.js). A test that merely mirrors
// this logic would pass while the shipped code drifted, which is exactly the
// failure mode this module exists to prevent.
//
// UNIFIED SCHEME (identical to mobile):
//   key encoding : SPKI DER hex
//   derivation   : HKDF-SHA256(secret, salt, info)
//   envelope     : ciphertext (ct||tag) + nonce, as separate fields
//
// Negotiation needs no handshake: the peer's key FORMAT is the capability
// signal. SPKI means the peer speaks the unified scheme; raw hex means an older
// desktop build, which still gets the legacy derivation and envelope.
//
// See plans/docs/Orbit E2EE Unification Design.md

const crypto = require('crypto');
const dlog = require('./src/js/log');

// Loaded from shared/ so the constants have exactly one definition. If it is
// unavailable (e.g. a packaged build predating the extraResources entry) we
// degrade to legacy-only rather than crashing at startup.
let E2EEKey = null;
try {
  E2EEKey = require('../shared/crypto/e2ee-key.js');
} catch (e) {
  console.warn('[E2EE] shared/crypto/e2ee-key.js unavailable — legacy keys only:', e.message);
}

const STORE_KEY = 'e2ee-keypair';

/**
 * @param store  anything with get(key) / set(key, value) — electron-store in
 *               production, a plain object in tests.
 */
function createE2EE(store) {
  let keyPair = null;

  /**
   * Classifies a peer key. Returns { format, rawPoint } or null.
   *   'spki' — unified scheme (mobile, or desktop v0.6+)
   *   'hex'  — legacy raw uncompressed point (older desktop builds)
   *
   * Accepts SPKI as hex, as a bare base64 body, OR PEM-armoured — mobile
   * advertises a PEM (`arrayBufferToPem` in e2ee-mobile.js) while desktop
   * advertises hex, so a hex-only parser silently rejects every mobile peer.
   */
  function peerKeyInfo(peerKey) {
    if (typeof peerKey !== 'string') return null;
    const key = peerKey.trim();
    if (!key) return null;

    // Legacy raw uncompressed point (130 hex chars).
    if (key.length === 130 && key.slice(0, 2).toLowerCase() === '04') {
      return { format: 'hex', rawPoint: key.toLowerCase() };
    }

    if (E2EEKey) {
      const norm = E2EEKey.normalize(key);
      if (norm && norm.format === 'spki') return { format: 'spki', rawPoint: norm.hex };
    }
    return null;
  }

  function isSpkiKey(key) {
    const info = peerKeyInfo(key);
    return !!info && info.format === 'spki';
  }

  // Returns the keypair with the public key in SPKI hex. A legacy pair stored
  // as a raw point is migrated in place. The PRIVATE key is untouched, so the
  // ECDH secret and any existing session keys are unaffected.
  function getOrCreateKeyPair() {
    if (keyPair) return keyPair;

    const saved = store.get(STORE_KEY);
    if (saved && saved.privateKey) {
      try {
        // Recompute the public point from the private key rather than trusting
        // the stored public value, so either legacy shape migrates correctly.
        const existing = crypto.createECDH('prime256v1');
        existing.setPrivateKey(saved.privateKey, 'hex');
        const rawPoint = existing.getPublicKey('hex');
        keyPair = {
          privateKey: saved.privateKey,
          rawPublicKey: rawPoint,
          publicKey: E2EEKey ? E2EEKey.rawPointToSpki(rawPoint) : rawPoint
        };
        if (saved.publicKey !== keyPair.publicKey) {
          store.set(STORE_KEY, keyPair);
          dlog('[E2EE] Migrated stored keypair to SPKI public key format');
        }
        return keyPair;
      } catch (e) {
        console.warn('[E2EE] Stored keypair unusable, generating a new one:', e.message);
      }
    }

    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const raw = ecdh.getPublicKey('hex');
    keyPair = {
      privateKey: ecdh.getPrivateKey('hex'),
      rawPublicKey: raw,
      publicKey: E2EEKey ? E2EEKey.rawPointToSpki(raw) : raw
    };
    store.set(STORE_KEY, keyPair);
    return keyPair;
  }

  function hkdf(shared) {
    const salt = Buffer.alloc(E2EEKey.KDF.saltBytes);        // 16 zero bytes
    const info = Buffer.from(E2EEKey.KDF.info, 'utf8');
    return Buffer.from(crypto.hkdfSync('sha256', shared, salt, info, E2EEKey.KDF.outputBytes));
  }

  function deriveAesKey(peerKey) {
    const kp = getOrCreateKeyPair();
    const info = peerKeyInfo(peerKey);
    if (!info) throw new Error('Unrecognised peer key format');

    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(kp.privateKey, 'hex');
    const shared = ecdh.computeSecret(info.rawPoint, 'hex');

    // SPKI peer => unified HKDF. Raw-point peer => legacy SHA-256, because that
    // peer is an older desktop build that derives with SHA-256.
    if (info.format === 'spki' && E2EEKey) return hkdf(shared);
    return crypto.createHash('sha256').update(shared).digest();
  }

  /**
   * Returns { v:2, ciphertext, nonce } for a unified peer, or
   * { v:1, packed } for a legacy peer. Throws if the peer key is unusable.
   */
  function encrypt(plaintext, peerKey) {
    const info = peerKeyInfo(peerKey);
    if (!info) throw new Error('Unrecognised peer key format');

    const key = deriveAesKey(peerKey);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const packed = Buffer.concat([iv, enc, cipher.getAuthTag()]).toString('base64');

    if (info.format === 'spki' && E2EEKey) {
      const fields = E2EEKey.packedToFields(packed);
      if (!fields) throw new Error('Envelope conversion failed');
      return { v: 2, ciphertext: fields.ciphertext, nonce: fields.nonce };
    }
    return { v: 1, packed };
  }

  /** Legacy envelope — one packed base64 string (iv || ct || tag). */
  function decryptPacked(packedB64, peerKey) {
    const key = deriveAesKey(peerKey);
    const buf = Buffer.from(packedB64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const enc = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(enc) + decipher.final('utf8');
  }

  /** Unified envelope — ciphertext is ct||tag, nonce is the 12-byte IV. */
  function decryptFields(ciphertextB64, nonceB64, peerKey) {
    const key = deriveAesKey(peerKey);
    const body = Buffer.from(ciphertextB64, 'base64');
    if (body.length < 16) throw new Error('Ciphertext too short');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonceB64, 'base64'));
    decipher.setAuthTag(body.subarray(body.length - 16));
    return decipher.update(body.subarray(0, body.length - 16)) + decipher.final('utf8');
  }

  return {
    getPublicKey: () => getOrCreateKeyPair().publicKey,
    getKeyPair: () => getOrCreateKeyPair(),
    encrypt,
    decryptPacked,
    decryptFields,
    // exposed for tests and diagnostics
    isSpkiKey,
    peerKeyInfo,
    hasSharedSpec: !!E2EEKey
  };
}

module.exports = createE2EE;
module.exports.E2EEKey = E2EEKey;
