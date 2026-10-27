// mobile/src/js/components/trust.js
//
// The web of trust on the phone: exchange signing keys, verify reports, keep warnings.
// Same rules as the desktop's components/trust.js — one hop, never auto-block, expiring
// — but the transport is different: the phone sends whole packets through
// `Orbit.P2P.send(peerId, packet)` rather than the desktop's (peerId, ip, type, payload).
(function () {
  var KEYS_STORAGE = 'peer_signing_keys';

  function readKeys() {
    try {
      var raw = localStorage.getItem('orbit_' + KEYS_STORAGE);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { return {}; }
  }

  function writeKeys(keys) {
    try { localStorage.setItem('orbit_' + KEYS_STORAGE, JSON.stringify(keys)); } catch (e) {}
  }

  function me() {
    var u = (window.MStore && MStore.user) || null;
    if (!u) return null;
    // The phone's identity uses `id`; the desktop's uses `userId`. The signing module
    // only needs a stable id, so normalise here rather than in two callers.
    return { userId: u.id || u.userId, username: u.name || u.username || 'User' };
  }

  window.OrbitTrust = {
    _keyId: null,

    init() {
      if (!window.OrbitIdentityKey) return;
      var self = this;
      window.OrbitIdentityKey.ensure().then(function (id) {
        self._keyId = id.keyId;
      }).catch(function () {});
    },

    keyFor(peerId) {
      return readKeys()[peerId] || null;
    },

    /**
     * Send our signing public key to a peer that has identified itself.
     * ⚠ Fired on BEACON, because that is the moment the phone learns a peer's id — and
     * a report can only be verified if the reporter's key arrived before the report.
     */
    announce(peerId) {
      if (!peerId || !window.OrbitIdentityKey || !window.Orbit || !Orbit.P2P) return;
      var user = me();
      if (!user || !user.userId || user.userId === peerId) return;

      window.OrbitIdentityKey.ensure().then(function (id) {
        var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.IDENTITY_KEY, user.userId, peerId, {
          userId: user.userId,
          publicKey: id.publicKey,
          keyId: id.keyId
        });
        Orbit.P2P.send(peerId, pkt).catch(function () {});
      }).catch(function () {});
    },

    onIdentityKey(packet, fallbackPeerId) {
      var p = (packet && packet.payload) || {};
      var from = (packet && (packet.from || packet.senderId)) || fallbackPeerId;
      if (!from || !p.publicKey || typeof p.publicKey !== 'string') return;
      var keys = readKeys();
      if (keys[from] === p.publicKey) return;
      keys[from] = p.publicKey;
      writeKeys(keys);
    },

    /**
     * Verify a report against the reporter's own key, then keep it.
     * ⚠ No key means no verification means no warning: an unverifiable report is
     * hearsay and must not be able to mark anybody.
     */
    onAlert(packet, fallbackPeerId) {
      var from = (packet && (packet.from || packet.senderId)) || fallbackPeerId;
      var key = from ? this.keyFor(from) : null;
      if (!key || !window.OrbitReputation) return;

      window.OrbitReputation.verifyAlert(packet.payload, key).then(function (res) {
        if (!res.ok) return;
        window.OrbitReputation.addWarning(res.alert, key);
        if (typeof window.showToast === 'function') {
          window.showToast((res.alert.reporterName || 'A contact') + ' reported someone in your network.', 'warning');
        }
      }).catch(function () {});
    },

    /**
     * Report a peer. Resolves to how many contacts the report reached — zero is a real
     * answer, and the caller should say so rather than claim success.
     */
    report(subjectId, reason) {
      var st = window.MStore || {};
      var user = me();
      if (!user || !window.OrbitReputation) return Promise.resolve(0);

      return window.OrbitReputation.buildAlert(user, subjectId, reason).then(function (payload) {
        var keys = readKeys();
        var friends = st.friends || [];
        var sends = [];
        friends.forEach(function (f) {
          var fid = f && (f.id || f.userId);
          if (!fid || fid === subjectId) return;
          if (!keys[fid]) return;   // they could not verify it, so sending is noise
          var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.REPUTATION_ALERT, user.userId, fid, payload);
          sends.push(Orbit.P2P.send(fid, pkt).catch(function () {}));
        });
        return Promise.all(sends).then(function () { return sends.length; });
      });
    },

    warningsFor(peerId) {
      return window.OrbitReputation ? window.OrbitReputation.warningsFor(peerId) : [];
    }
  };
})();
