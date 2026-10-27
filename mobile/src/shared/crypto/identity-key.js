// shared/crypto/identity-key.js
//
// A SIGNING key for the device — the thing Part 2's "cryptographically signed
// REPUTATION_ALERT" needs and the app did not have.
//
// ⚠⚠ WHY THIS FILE EXISTS. The v1.0.0 plan says a report is "signed using their E2EE
// private key". Orbit's E2EE keypair is **ECDH P-256** (`shared/crypto/e2ee-mobile.js`,
// imported with `deriveKey`/`deriveBits`) — key AGREEMENT, not authentication. You
// cannot sign with it, and even if you could, a shared secret proves nothing to a third
// party: everyone holding it could forge. So a report needs a SEPARATE keypair whose
// public half other people can hold.
//
// This is that keypair. It is deliberately a different key from the E2EE one:
//   - ECDH  (existing)  — derives the conversation key. Never leaves the device.
//   - ECDSA (this file) — signs statements. The public half is meant to be shared.
//
// ⚠ THE PUBLIC KEY IS NOT DISTRIBUTED YET. Signing is only half of a web of trust;
// verification needs the signer's public key, which has to travel with the identity
// exchange. Until that exists this is a primitive with no caller — and that is the
// honest state of pillar 1.
(function () {
  var ALG = { name: 'ECDSA', namedCurve: 'P-256' };
  var SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };
  var STORAGE_KEY = 'identity_signing_key';

  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  // ── base64 ────────────────────────────────────────────────────────────────
  function bytesToB64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(bytes).toString('base64');
  }

  function b64ToBytes(b64) {
    if (typeof atob === 'function') {
      var bin = atob(b64);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  function toBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    throw new Error('sign() takes a string, Uint8Array or ArrayBuffer');
  }

  // ── storage (injectable, so the unit test does not need localStorage) ─────
  var memoryStore = {};
  var storage = {
    get: function (k) {
      if (window.OrbitKeys && window.OrbitKeys.get) return window.OrbitKeys.get(k);
      if (typeof localStorage !== 'undefined') return localStorage.getItem('orbit_' + k);
      return memoryStore[k] || null;
    },
    set: function (k, v) {
      if (window.OrbitKeys && window.OrbitKeys.set) return window.OrbitKeys.set(k, v);
      if (typeof localStorage !== 'undefined') return localStorage.setItem('orbit_' + k, v);
      memoryStore[k] = v;
    }
  };

  var _cached = null;   // { keyId, publicKey, privateKey, publicKeyB64 }

  function newKeyId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Load the device's signing key, creating it on first use.
   * Resolves to { keyId, publicKey } where publicKey is base64 SPKI — the value to
   * hand to other people once the identity exchange carries it.
   */
  function ensure() {
    if (_cached) return Promise.resolve({ keyId: _cached.keyId, publicKey: _cached.publicKeyB64 });
    if (!subtle) return Promise.reject(new Error('WebCrypto is unavailable'));

    var stored = storage.get(STORAGE_KEY);
    if (stored) {
      try {
        var parsed = JSON.parse(stored);
        return Promise.all([
          subtle.importKey('pkcs8', b64ToBytes(parsed.privateKey), ALG, false, ['sign']),
          subtle.importKey('spki', b64ToBytes(parsed.publicKey), ALG, true, ['verify'])
        ]).then(function (keys) {
          _cached = { keyId: parsed.keyId, publicKey: keys[1], privateKey: keys[0], publicKeyB64: parsed.publicKey };
          return { keyId: _cached.keyId, publicKey: _cached.publicKeyB64 };
        });
      } catch (e) {
        // A corrupt blob must not lock the device out of signing forever — fall through
        // and generate a fresh key.
      }
    }

    return subtle.generateKey(ALG, true, ['sign', 'verify']).then(function (pair) {
      return Promise.all([
        subtle.exportKey('spki', pair.publicKey),
        subtle.exportKey('pkcs8', pair.privateKey)
      ]).then(function (raw) {
        var pubB64 = bytesToB64(new Uint8Array(raw[0]));
        var keyId = newKeyId();
        storage.set(STORAGE_KEY, JSON.stringify({
          keyId: keyId,
          publicKey: pubB64,
          privateKey: bytesToB64(new Uint8Array(raw[1]))
        }));
        _cached = { keyId: keyId, publicKey: pair.publicKey, privateKey: pair.privateKey, publicKeyB64: pubB64 };
        return { keyId: keyId, publicKey: pubB64 };
      });
    });
  }

  /**
   * Sign `data`. Resolves to { sig, keyId, publicKey } — the signature is base64, and
   * the keyId/publicKey travel with it so a verifier can find the right key.
   *
   * ⚠ SIGN A CANONICAL FORM, NOT `JSON.stringify(obj)`. Key order is not stable across
   * engines, so two peers can produce different bytes for the same statement and the
   * signature fails on a message nobody altered. Whatever calls this must build the
   * string itself, in a fixed field order.
   */
  function sign(data) {
    return ensure().then(function (id) {
      return subtle.sign(SIGN_ALG, _cached.privateKey, toBytes(data)).then(function (sigBuf) {
        return {
          sig: bytesToB64(new Uint8Array(sigBuf)),
          keyId: id.keyId,
          publicKey: id.publicKey
        };
      });
    });
  }

  /**
   * Verify a signature against a public key. Resolves to true/false — never rejects on
   * a bad signature, because "this signature is wrong" is an answer, not an error.
   */
  function verify(publicKeyB64, data, sigB64) {
    if (!subtle) return Promise.resolve(false);
    if (!publicKeyB64 || !sigB64) return Promise.resolve(false);
    var key;
    try {
      key = subtle.importKey('spki', b64ToBytes(publicKeyB64), ALG, true, ['verify']);
    } catch (e) {
      return Promise.resolve(false);
    }
    return key.then(function (k) {
      return subtle.verify(SIGN_ALG, k, b64ToBytes(sigB64), toBytes(data));
    }).catch(function () { return false; });
  }

  // Test seam: drop the cached key and optionally replace the storage adapter.
  function _reset(adapter) {
    _cached = null;
    memoryStore = {};
    if (adapter) storage = adapter;
  }

  window.OrbitIdentityKey = {
    ensure: ensure,
    sign: sign,
    verify: verify,
    _reset: _reset
  };
})();
