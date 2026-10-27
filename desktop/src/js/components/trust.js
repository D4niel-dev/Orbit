// desktop/src/js/components/trust.js
//
// Wiring for the web of trust: exchange signing keys, verify reports, expose the
// warnings. The cryptography lives in shared/security/reputation.js and
// shared/crypto/identity-key.js; this file is the transport and the storage.
//
// ⚠⚠ NOTHING HERE RE-SENDS A RECEIVED REPORT. `onAlert` stores and stops. The one-hop
// rule is enforced by there being no code path that forwards — see the note in
// reputation.js for why a re-broadcast turns one accusation into a global ban.
(function () {
  var KEYS_STORAGE = 'peer_signing_keys';

  function readKeys() {
    try {
      var raw = window.Storage ? window.Storage.get(KEYS_STORAGE) : null;
      if (!raw) return {};
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function writeKeys(keys) {
    try { if (window.Storage) window.Storage.set(KEYS_STORAGE, JSON.stringify(keys)); } catch (e) {}
  }

  function me() {
    var s = window.store.getState();
    return s.currentUser || s.user || null;
  }

  window.OrbitTrust = {
    /** Our signing key id, once loaded — for diagnostics only. */
    _keyId: null,

    init() {
      if (!window.OrbitIdentityKey) return;
      var self = this;
      window.OrbitIdentityKey.ensure().then(function (id) {
        self._keyId = id.keyId;
      }).catch(function () { /* a device with no WebCrypto simply cannot sign */ });
    },

    keyFor(peerId) {
      return readKeys()[peerId] || null;
    },

    /**
     * Send our signing public key to a peer. Called when a peer appears — the public
     * key is what makes their reports verifiable and ours verifiable to them, so it is
     * exchanged before any report could possibly be sent.
     */
    announce(peer) {
      if (!peer || !peer.userId || !peer.ip) return;
      if (!window.OrbitIdentityKey || !window.orbitAPI) return;
      var user = me();
      if (!user || user.userId === peer.userId) return;

      window.OrbitIdentityKey.ensure().then(function (id) {
        window.orbitAPI.networkSend(peer.userId, peer.ip, window.Protocol.Types.IDENTITY_KEY, {
          userId: user.userId,
          publicKey: id.publicKey,
          keyId: id.keyId
        });
      }).catch(function () { /* non-fatal: they just cannot verify us */ });
    },

    /** Store a peer's signing key. */
    onIdentityKey(packet) {
      var p = (packet && packet.payload) || {};
      var from = packet && packet.from;
      if (!from || !p.publicKey || typeof p.publicKey !== 'string') return;
      var keys = readKeys();
      if (keys[from] === p.publicKey) return;
      keys[from] = p.publicKey;
      writeKeys(keys);
    },

    /**
     * Verify a report against the reporter's OWN key, then keep it.
     * ⚠ No key for the reporter means no verification, which means no warning — an
     * unverifiable report is hearsay and must not be able to mark anybody.
     */
    onAlert(packet) {
      var from = packet && packet.from;
      var key = from ? this.keyFor(from) : null;
      if (!key || !window.OrbitReputation) return;

      window.OrbitReputation.verifyAlert(packet.payload, key).then(function (res) {
        if (!res.ok) return;
        window.OrbitReputation.addWarning(res.alert, key);
        if (window.Toast) {
          window.Toast.show(
            'Report received',
            (res.alert.reporterName || 'A contact') + ' reported someone in your network.',
            'info', 4000
          );
        }
      }).catch(function () { /* never break the packet loop */ });
    },

    /**
     * Report a peer. Resolves to the number of contacts the report actually reached —
     * zero is a real answer (nobody has exchanged keys yet) and the caller should say so
     * rather than claim success.
     */
    report(subjectId, reason) {
      var self = this;
      var st = window.store.getState();
      var user = me();
      if (!user) return Promise.resolve(0);

      return window.OrbitReputation.buildAlert(user, subjectId, reason).then(function (payload) {
        var keys = readKeys();
        var sent = 0;
        (st.friends || []).forEach(function (f) {
          if (!f || !f.ip || f.userId === subjectId) return;
          if (!keys[f.userId]) return;   // they could not verify it, so sending is noise
          window.orbitAPI.networkSend(f.userId, f.ip, window.Protocol.Types.REPUTATION_ALERT, payload);
          sent += 1;
        });
        return sent;
      });
    },

    warningsFor(peerId) {
      return window.OrbitReputation ? window.OrbitReputation.warningsFor(peerId) : [];
    }
  };
})();
