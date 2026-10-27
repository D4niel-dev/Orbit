// shared/network/webrtc-transport.js
//
// The WebRTC half of the hybrid transport: an RTCPeerConnection + DataChannel wrapper
// that obeys the ordering rules in webrtc-signaling.js.
//
// ⚠⚠ IT CARRIES OPAQUE STRINGS, AND THAT IS THE POINT OF HYBRID. Every packet that goes
// over this DataChannel is exactly the bytes the TCP path would have carried — the same
// E2EE ciphertext, the same framing. Nothing here knows or cares what a message is. That
// is what "works with E2E too" means in practice: switching transports cannot change what
// a message looks like, because the encryption sits above this line.
//
// ⚠ THE SIGNALLING CHANNEL IS NOT DECIDED HERE. `sendSignal` is injected — on a LAN it can
// ride the existing TCP connection (no relay, no third party), and over the internet it
// needs a relay. Keeping that decision outside means the transport works either way and
// the relay stays a swappable URL rather than a dependency.
(function () {
  var DATA_CHANNEL_LABEL = 'orbit';

  /**
   * @param {object} opts
   * @param {string} opts.role          'offerer' | 'answerer' (from OrbitWebRTCSignaling.roleFor)
   * @param {function} opts.sendSignal  (kind, payload) => void — deliver to the peer
   * @param {Array}  [opts.iceServers]  STUN/TURN. ⚠ Empty means host candidates only,
   *                                    which works on a LAN and NOT across the internet.
   * @param {function} [opts.onOpen]    DataChannel is ready
   * @param {function} [opts.onMessage] (string) => void
   * @param {function} [opts.onClose]
   */
  function createTransport(opts) {
    opts = opts || {};
    if (!window.OrbitWebRTCSignaling) throw new Error('webrtc-signaling is not loaded');

    var peer = window.OrbitWebRTCSignaling.createPeer({ role: opts.role });
    var pc = null;
    var channel = null;
    var closed = false;

    function emit(evt) {
      var out = peer.dispatch(evt);
      return applyEffects(out.effects);
    }

    // ⚠ EFFECTS ARE APPLIED IN ORDER, AWAITED. `setRemoteDescription` must finish before
    // `addIceCandidate`, and the drain list must go in after the description lands. Firing
    // them off in parallel is how a connection ends up working only when the timing is
    // lucky.
    function applyEffects(effects) {
      return (effects || []).reduce(function (chain, e) {
        return chain.then(function () { return applyEffect(e); });
      }, Promise.resolve());
    }

    function applyEffect(e) {
      if (!e) return Promise.resolve();
      switch (e.op) {
        // ⚠ create-* ONLY CREATES. Setting the local description is the state machine's
        // `set-local-description` effect, which fires immediately before the send. Doing
        // it here as well means the answer is set twice and the second call throws
        // "Called in wrong state: stable" — which is how this was found.
        case 'create-offer':
          return pc.createOffer().then(function (d) { return emit({ type: 'local-description', desc: d }); });

        case 'create-answer':
          return pc.createAnswer().then(function (d) { return emit({ type: 'local-description', desc: d }); });

        case 'set-local-description':
          return pc.setLocalDescription(e.desc);

        case 'set-remote-description':
          return pc.setRemoteDescription(e.desc);

        case 'add-candidate':
          return pc.addIceCandidate(e.candidate).catch(function () { /* a bad candidate is not fatal */ });

        case 'add-buffered-candidates':
          return (e.candidates || []).reduce(function (c, cand) {
            return c.then(function () { return pc.addIceCandidate(cand).catch(function () {}); });
          }, Promise.resolve());

        case 'send':
          if (typeof opts.sendSignal === 'function') opts.sendSignal(e.kind, e.desc);
          return Promise.resolve();

        case 'ignore':
        case 'fail':
          return Promise.resolve();

        default:
          return Promise.resolve();
      }
    }

    function ensurePc() {
      if (pc) return pc;
      pc = new RTCPeerConnection({ iceServers: opts.iceServers || [] });

      // ⚠ Send candidates as they are found; the state machine buffers them on the far
      // side until the description arrives, which is the whole reason that buffer exists.
      pc.onicecandidate = function (ev) {
        if (!ev.candidate || closed) return;
        if (typeof opts.sendSignal === 'function') opts.sendSignal('candidate', ev.candidate.toJSON());
      };

      pc.onconnectionstatechange = function () {
        if (pc.connectionState === 'failed') emit({ type: 'failed', reason: 'ice' });
        if (pc.connectionState === 'closed') emit({ type: 'closed' });
      };

      if (opts.role !== 'answerer') {
        channel = pc.createDataChannel(DATA_CHANNEL_LABEL);
        wireChannel(channel);
      } else {
        pc.ondatachannel = function (ev) { channel = ev.channel; wireChannel(channel); };
      }
      return pc;
    }

    function wireChannel(dc) {
      dc.onopen = function () { if (opts.onOpen) opts.onOpen(); };
      dc.onclose = function () { if (opts.onClose) opts.onClose(); };
      dc.onmessage = function (ev) { if (opts.onMessage) opts.onMessage(ev.data); };
    }

    return {
      get state() { return peer.state; },
      get channel() { return channel; },
      get connectionState() { return pc ? pc.connectionState : 'new'; },

      /** Begin. The offerer creates the offer; the answerer just waits. */
      start: function () {
        ensurePc();
        return emit({ type: 'start' });
      },

      /**
       * A signal arrived from the peer: 'offer' | 'answer' | 'candidate'.
       * ⚠ Safe to call before start() — a candidate that arrives first is buffered.
       */
      handleSignal: function (kind, payload) {
        ensurePc();
        if (kind === 'offer' || kind === 'answer') {
          return emit({ type: 'remote-description', desc: { type: kind, sdp: payload && payload.sdp } });
        }
        if (kind === 'candidate') return emit({ type: 'remote-candidate', candidate: payload });
        return Promise.resolve();
      },

      /** Send a packet. Returns false when the channel is not open yet. */
      send: function (text) {
        if (!channel || channel.readyState !== 'open') return false;
        channel.send(text);
        return true;
      },

      close: function () {
        closed = true;
        try { if (channel) channel.close(); } catch (e) {}
        try { if (pc) pc.close(); } catch (e) {}
      }
    };
  }

  var api = { createTransport: createTransport, DATA_CHANNEL_LABEL: DATA_CHANNEL_LABEL };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OrbitWebRTC = api;
})();
