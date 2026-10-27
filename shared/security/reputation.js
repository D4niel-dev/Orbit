// shared/security/reputation.js
//
// The web of trust, in the only form that is safe to build: a report is a SIGNED
// STATEMENT that travels ONE HOP, expires, and never blocks anybody.
//
// ⚠⚠ WHY ONE HOP. Dan's plan said "broadcast this signed packet to all of User A's
// current friends". A signature makes a report unforgeable, not TRUE — and if every
// receiver re-broadcasts what it receives, one accusation from one person becomes a
// global ban, with no appeal and no way to tell a grudge from a pattern. So: you receive
// a report from someone you know, you keep it, and you do NOT pass it on. There is
// deliberately no API here for re-sending a received alert.
//
// ⚠⚠ AND NOTHING IS EVER BLOCKED AUTOMATICALLY. A warning is shown to the person who
// would be affected and they decide. Auto-block turns a single signature into a remote
// kill switch over somebody else's contacts.
//
// ⚠ Warnings EXPIRE (90 days by default). People change, and a permanent mark held on a
// stranger's device with no appeal is not something this app should be able to do.
(function () {
  var VERSION = 'orbit-reputation-v1';
  var DAY = 24 * 60 * 60 * 1000;
  var DEFAULT_TTL = 90 * DAY;

  // ⚠ A CLOSED SET OF REASONS, NOT FREE TEXT. The reason is part of the signed string,
  // so free text would need escaping rules that two implementations can disagree about
  // — and a disagreement there is a signature that fails on a message nobody altered.
  var REASONS = ['harassment', 'spam', 'scam', 'other'];

  // ── storage (injectable for tests) ───────────────────────────────────────
  var memory = {};
  var storage = {
    get: function (k) {
      if (window.Storage && window.Storage.get) return window.Storage.get(k);
      if (typeof localStorage !== 'undefined') return localStorage.getItem('orbit_' + k);
      return memory[k] || null;
    },
    set: function (k, v) {
      if (window.Storage && window.Storage.set) return window.Storage.set(k, v);
      if (typeof localStorage !== 'undefined') return localStorage.setItem('orbit_' + k, v);
      memory[k] = v;
    }
  };

  function readWarnings() {
    var raw = storage.get('reputation_warnings');
    if (!raw) return [];
    try {
      var list = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeWarnings(list) {
    storage.set('reputation_warnings', JSON.stringify(list));
  }

  /**
   * The exact bytes that get signed. ⚠ Field order is fixed and every value is
   * length-prefixed by construction (the reason is an enum, ids are opaque), so two
   * peers cannot build different strings for the same statement.
   */
  function canonicalAlert(a) {
    return VERSION +
      '|reporter=' + String(a.reporterId || '') +
      '|subject=' + String(a.subjectId || '') +
      '|reason=' + String(a.reason || '') +
      '|ts=' + String(a.ts || 0);
  }

  /**
   * Build and sign an alert about `subjectId`. Resolves to a packet payload:
   * { alert: {reporterId, subjectId, reason, ts}, sig, keyId, publicKey }
   */
  function buildAlert(reporter, subjectId, reason) {
    if (!window.OrbitIdentityKey) return Promise.reject(new Error('the signing key module is not loaded'));
    if (!reporter || !reporter.userId) return Promise.reject(new Error('a reporter identity is required'));
    if (!subjectId) return Promise.reject(new Error('a subject is required'));
    if (REASONS.indexOf(reason) === -1) return Promise.reject(new Error('unknown reason: ' + reason));

    var alert = {
      reporterId: reporter.userId,
      reporterName: reporter.username || '',
      subjectId: String(subjectId),
      reason: reason,
      ts: Date.now()
    };

    return window.OrbitIdentityKey.sign(canonicalAlert(alert)).then(function (signed) {
      return { alert: alert, sig: signed.sig, keyId: signed.keyId, publicKey: signed.publicKey };
    });
  }

  /**
   * Verify an alert payload against the reporter's public key.
   * Resolves to { ok: true, alert } or { ok: false, error } — never throws.
   */
  function verifyAlert(payload, reporterPublicKey) {
    if (!payload || !payload.alert || !payload.sig) return Promise.resolve({ ok: false, error: 'malformed' });
    if (!reporterPublicKey) return Promise.resolve({ ok: false, error: 'no key for reporter' });
    if (!window.OrbitIdentityKey) return Promise.resolve({ ok: false, error: 'signing module missing' });

    var a = payload.alert;
    if (REASONS.indexOf(a.reason) === -1) return Promise.resolve({ ok: false, error: 'unknown reason' });
    if (typeof a.ts !== 'number' || !isFinite(a.ts)) return Promise.resolve({ ok: false, error: 'bad timestamp' });
    // ⚠ A clock in the future would make a warning that never expires look fresh.
    if (a.ts > Date.now() + DAY) return Promise.resolve({ ok: false, error: 'timestamp in the future' });

    return window.OrbitIdentityKey.verify(reporterPublicKey, canonicalAlert(a), payload.sig).then(function (ok) {
      if (!ok) return { ok: false, error: 'bad signature' };
      return { ok: true, alert: a };
    });
  }

  /**
   * Store a verified alert. Deduplicated by (reporter, subject) — the newest wins, so
   * the same friend reporting twice does not stack up, and a report can be replaced by
   * a newer one from the same person but never merged with someone else's.
   */
  function addWarning(alert, reporterPublicKey) {
    var list = readWarnings().filter(function (w) {
      return !(w.reporterId === alert.reporterId && w.subjectId === alert.subjectId);
    });
    list.push({
      reporterId: alert.reporterId,
      reporterName: alert.reporterName || '',
      subjectId: alert.subjectId,
      reason: alert.reason,
      ts: alert.ts,
      expiresAt: alert.ts + DEFAULT_TTL,
      // Kept so a warning can be re-verified later without trusting our own storage.
      sig: alert.sig || null,
      keyId: alert.keyId || null,
      reporterPublicKey: reporterPublicKey || null
    });
    writeWarnings(list);
    return list;
  }

  /** Live warnings about `subjectId`, newest first. Expired ones are not returned. */
  function warningsFor(subjectId) {
    var now = Date.now();
    return readWarnings()
      .filter(function (w) { return w.subjectId === String(subjectId) && (!w.expiresAt || w.expiresAt > now); })
      // ⚠ TIE-BREAK ON THE REPORTER. Two alerts can land in the same millisecond, and
      // `b.ts - a.ts` is then 0 — which leaves the order up to the sort's internals, so
      // the same list could render in a different order twice. Deterministic is worth
      // one extra comparison.
      .sort(function (a, b) {
        return (b.ts - a.ts) || String(a.reporterId).localeCompare(String(b.reporterId));
      });
  }

  /** Every live warning. */
  function allWarnings() {
    var now = Date.now();
    return readWarnings().filter(function (w) { return !w.expiresAt || w.expiresAt > now; });
  }

  function clearWarnings() { writeWarnings([]); }

  function _setStorage(adapter) {
    storage = adapter;
    memory = {};
  }

  window.OrbitReputation = {
    VERSION: VERSION,
    REASONS: REASONS.slice(),
    DEFAULT_TTL: DEFAULT_TTL,
    canonicalAlert: canonicalAlert,
    buildAlert: buildAlert,
    verifyAlert: verifyAlert,
    addWarning: addWarning,
    warningsFor: warningsFor,
    allWarnings: allWarnings,
    clearWarnings: clearWarnings,
    _setStorage: _setStorage
  };
})();
