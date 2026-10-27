// shared/network/webrtc-signaling.js
//
// The signalling STATE MACHINE for the hybrid transport, with no WebRTC in it.
//
// ⚠⚠ WHY THIS IS SEPARATE FROM RTCPeerConnection. The hard part of WebRTC is not
// creating an offer — it is ORDER. ICE candidates start arriving immediately and often
// before the remote description exists, and `addIceCandidate()` throws (or is silently
// dropped, depending on the browser) if you call it too early. Getting that wrong
// produces a connection that works on a fast LAN and fails over the internet, which is
// exactly the case this feature exists for and the hardest one to reproduce.
//
// So the ordering rules live here, as a pure reducer: events in, effects out. The caller
// owns the RTCPeerConnection and applies the effects. That means the ordering can be
// tested without a browser, a network, or a second peer.
//
// ⚠⚠ GLARE IS DESIGNED OUT, NOT HANDLED. Both peers would otherwise be free to offer at
// the same moment, and RFC 8445's answer (rollback, polite/impolite peers) is a lot of
// machinery for a chat app. Instead `roleFor()` derives the role from the two ids, so
// exactly one side ever offers and the two sides always agree. It is deterministic, it
// needs no negotiation, and there is no race to lose.
(function () {
  var STATES = {
    NEW: 'new',                 // nothing exchanged yet
    LOCAL_OFFER: 'local-offer', // we offered, waiting for the answer
    REMOTE_OFFER: 'remote-offer', // they offered, we owe an answer
    STABLE: 'stable',           // descriptions exchanged, candidates flowing
    FAILED: 'failed'            // terminal
  };

  /**
   * Which side offers. ⚠ Both peers must compute this the same way or both offer (glare)
   * or neither does (deadlock). Comparing the two ids with a plain `<` is stable across
   * engines because both sides compare the same two strings in the same order.
   */
  function roleFor(myId, peerId) {
    var a = String(myId || '');
    var b = String(peerId || '');
    if (!a || !b || a === b) return null;
    return a < b ? 'offerer' : 'answerer';
  }

  function createPeer(opts) {
    opts = opts || {};
    var role = opts.role === 'answerer' ? 'answerer' : 'offerer';
    var state = STATES.NEW;
    var buffered = [];   // remote candidates that arrived before the remote description
    var answered = false;

    function fail(reason) {
      state = STATES.FAILED;
      return { state: state, effects: [{ op: 'fail', reason: reason }] };
    }

    // ⚠ The drain carries the list AND clears the buffer, so a caller cannot apply the
    // candidates and then forget to empty it — which would re-apply them on the next
    // description and hand the peer a duplicate set of routes.
    function drainBuffered() {
      if (!buffered.length) return null;
      var list = buffered.slice();
      buffered = [];
      return { op: 'add-buffered-candidates', candidates: list };
    }

    /**
     * Feed one event. Returns { state, effects }. Pure: no timers, no I/O, no
     * RTCPeerConnection — the caller applies the effects in order.
     */
    function dispatch(event) {
      event = event || {};
      if (state === STATES.FAILED) return { state: state, effects: [] };

      // ── start: the offerer asks for an offer; the answerer just waits ──────
      if (event.type === 'start') {
        if (role !== 'offerer') return { state: state, effects: [] };
        if (state !== STATES.NEW) return { state: state, effects: [] };
        state = STATES.LOCAL_OFFER;
        return { state: state, effects: [{ op: 'create-offer' }] };
      }

      // ── a description we produced ──────────────────────────────────────────
      if (event.type === 'local-description') {
        var ld = event.desc || {};
        if (!ld.type) return { state: state, effects: [] };
        if (ld.type === 'offer') {
          if (state !== STATES.LOCAL_OFFER) return { state: state, effects: [] };
          // ⚠ SYMMETRIC WITH THE ANSWER BRANCH: set local, then send. The adapter creates
          // the description and hands it here; it must NOT also call setLocalDescription
          // itself, or the second call lands on a connection that is already stable and
          // throws "Called in wrong state: stable". Measured, not theorised.
          return {
            state: state,
            effects: [
              { op: 'set-local-description', desc: ld },
              { op: 'send', kind: 'offer', desc: ld }
            ]
          };
        }
        if (ld.type === 'answer') {
          // ⚠ Only once, and only while we owe one. A second answer means a duplicate
          // packet, and re-sending it would confuse the peer's state for no gain.
          if (state !== STATES.REMOTE_OFFER || answered) return { state: state, effects: [] };
          answered = true;
          state = STATES.STABLE;
          var answerEffects = [
            { op: 'set-local-description', desc: ld },
            { op: 'send', kind: 'answer', desc: ld }
          ];
          var drain1 = drainBuffered();
          if (drain1) answerEffects.push(drain1);
          return { state: state, effects: answerEffects };
        }
        return { state: state, effects: [] };
      }

      // ── a description they produced ────────────────────────────────────────
      if (event.type === 'remote-description') {
        var rd = event.desc || {};
        if (!rd.type) return { state: state, effects: [] };

        if (rd.type === 'offer') {
          // ⚠ An offerer that receives an offer is glare. `roleFor` is supposed to make
          // that impossible; if it happens the safe move is to IGNORE, not to roll back
          // into an offer/answer we did not plan for.
          if (role === 'offerer') {
            return { state: state, effects: [{ op: 'ignore', reason: 'glare' }] };
          }
          if (state === STATES.REMOTE_OFFER) return { state: state, effects: [{ op: 'ignore', reason: 'duplicate-offer' }] };
          if (state !== STATES.NEW) return { state: state, effects: [{ op: 'ignore', reason: 'unexpected-offer' }] };
          state = STATES.REMOTE_OFFER;
          return {
            state: state,
            effects: [
              { op: 'set-remote-description', desc: rd },
              { op: 'create-answer' }
            ]
          };
        }

        if (rd.type === 'answer') {
          if (state !== STATES.LOCAL_OFFER) return { state: state, effects: [{ op: 'ignore', reason: 'unexpected-answer' }] };
          state = STATES.STABLE;
          var stableEffects = [
            { op: 'set-remote-description', desc: rd }
          ];
          // ⚠ THE POINT OF THIS FILE. Everything that arrived early is applied now, in
          // arrival order, and only now.
          var drain2 = drainBuffered();
          if (drain2) stableEffects.push(drain2);
          return { state: state, effects: stableEffects };
        }
        return { state: state, effects: [] };
      }

      // ── a candidate from them ──────────────────────────────────────────────
      if (event.type === 'remote-candidate') {
        var c = event.candidate;
        if (!c) return { state: state, effects: [] };
        // ⚠ Buffer until a remote description exists. `addIceCandidate` before
        // `setRemoteDescription` is the classic way to get a connection that only works
        // when the network is fast enough for the answer to win the race.
        if (state === STATES.STABLE) return { state: state, effects: [{ op: 'add-candidate', candidate: c }] };
        buffered.push(c);
        return { state: state, effects: [] };
      }

      // ── terminal signals ───────────────────────────────────────────────────
      if (event.type === 'failed') return fail(event.reason || 'failed');
      if (event.type === 'closed') return fail('closed');

      return { state: state, effects: [] };
    }

    /** The buffered candidates, in arrival order. Read-only copy. */
    function pending() { return buffered.slice(); }

    return {
      role: role,
      get state() { return state; },
      dispatch: dispatch,
      pending: pending
    };
  }

  var api = {
    STATES: STATES,
    roleFor: roleFor,
    createPeer: createPeer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OrbitWebRTCSignaling = api;
})();
