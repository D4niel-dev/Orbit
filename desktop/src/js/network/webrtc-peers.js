// desktop/src/js/network/webrtc-peers.js
//
// WAN peers for the renderer.
//
// ⚠⚠ WHY THIS LIVES IN THE RENDERER AND NOT NEXT TO THE TCP SOCKET. `socket.js` runs in the
// MAIN process, and the main process has no RTCPeerConnection — it is a browser API. So a
// WAN peer cannot be a socket in SocketManager; it has to be a channel owned here, with the
// app routing to it. That asymmetry is the price of the hybrid design and it is better
// stated than hidden: TCP peers are main-process sockets, WAN peers are renderer channels.
//
// ⚠ IT DOES NOT TOUCH MESSAGE CONTENT. It moves opaque strings produced by
// Protocol.serialize, exactly as the TCP path does — the E2EE layer above does not know or
// care which one carried a packet.
(function () {
  // peerId -> { transport, signal, ready }
  var peers = {};

  function ensureModules() {
    if (!window.OrbitWebRTC || !window.OrbitSignaling || !window.OrbitWebRTCSignaling) {
      throw new Error('the WebRTC transport modules are not loaded');
    }
  }

  window.OrbitWan = {
    /**
     * Open a WAN channel to a peer through a signalling relay.
     *
     * @param {object} opts
     * @param {string} opts.relayUrl   ws:// or wss:// of the relay
     * @param {string} opts.room       pairing room, agreed out of band (a code, an invite)
     * @param {string} opts.peerId     OUR id
     * @param {string} opts.remoteId   the peer we expect in that room
     * @param {function} [opts.onPacket] (string) => void — same shape as a TCP packet
     * @param {function} [opts.onOpen]  ()
     * @param {function} [opts.onClose] ()
     * @param {Array}    [opts.iceServers]
     * @returns {Promise} resolves when the DataChannel is open
     */
    join: function (opts) {
      opts = opts || {};
      ensureModules();
      if (!opts.relayUrl || !opts.room || !opts.peerId) {
        return Promise.reject(new Error('relayUrl, room and peerId are required'));
      }
      if (peers[opts.remoteId]) {
        // Idempotent: asking twice for the same peer returns the existing channel rather
        // than building a second one that would fight the first for the room.
        return Promise.resolve(opts.remoteId);
      }

      var remoteId = opts.remoteId;
      var role = window.OrbitWebRTCSignaling.roleFor(opts.peerId, remoteId);
      if (!role) return Promise.reject(new Error('cannot derive a role for this pair'));

      var entry = { transport: null, signal: null, ready: false };
      peers[remoteId] = entry;

      entry.transport = window.OrbitWebRTC.createTransport({
        role: role,
        iceServers: opts.iceServers || [],
        sendSignal: function (kind, payload) { entry.signal.sendSignal(kind, payload); },
        onOpen: function () {
          entry.ready = true;
          if (opts.onOpen) opts.onOpen();
        },
        onClose: function () {
          entry.ready = false;
          if (opts.onClose) opts.onClose();
        },
        onMessage: function (text) {
          if (opts.onPacket) opts.onPacket(text);
        }
      });

      entry.signal = window.OrbitSignaling.create({
        url: opts.relayUrl,
        room: opts.room,
        peerId: opts.peerId,
        onSignal: function (s) { entry.transport.handleSignal(s.kind, s.payload); },

        // ⚠⚠ ONLY OFFER WHEN SOMEBODY IS ACTUALLY IN THE ROOM, AND THIS IS NOT POLITENESS.
        // Offering into an empty room fails at the relay AND leaves the state machine in
        // `local-offer`, so when the real peer arrives `start()` is a no-op and no offer is
        // ever made — measured: both instances sat at "not connected" with no error.
        // `joined` carries the peers already present, so this covers "they were here
        // first"; `peer-joined` covers "they arrived after".
        onJoined: function (msg) {
          if (role === 'offerer' && msg && msg.peers && msg.peers.length) entry.transport.start();
        },
        onPeerJoined: function () {
          if (role === 'offerer') entry.transport.start();
        },
        onError: function (m) {
          if (opts.onError) opts.onError(m);
        }
      });

      return entry.signal.connect().then(function () {
        // ⚠ No start() here. The answerer waits for the offer, and the offerer waits for
        // a peer — see the two callbacks above.
        return remoteId;
      });
    },

    /** Send a serialized packet. False when the channel is not open. */
    send: function (peerId, text) {
      var entry = peers[peerId];
      if (!entry || !entry.ready) return false;
      return entry.transport.send(text);
    },

    isConnected: function (peerId) {
      return !!(peers[peerId] && peers[peerId].ready);
    },

    connectedPeers: function () {
      return Object.keys(peers).filter(function (id) { return peers[id].ready; });
    },

    leave: function (peerId) {
      var entry = peers[peerId];
      if (!entry) return;
      try { entry.transport.close(); } catch (e) {}
      try { entry.signal.close(); } catch (e) {}
      delete peers[peerId];
    },

    leaveAll: function () {
      Object.keys(peers).forEach(function (id) { window.OrbitWan.leave(id); });
    }
  };
})();
