// shared/network/signaling-client.js
//
// The signalling channel for the hybrid transport, as seen from a peer.
//
// ⚠⚠ THE SAME CLIENT SERVES BOTH PATHS, WHICH IS THE POINT OF HYBRID. On a LAN the caller
// can hand `sendSignal` to the existing TCP connection instead of calling connect() — the
// transport only wants a callback, so a LAN pair needs no relay and no third party. Over
// the internet, connect() to a relay and the same transport works unchanged.
//
// ⚠ IT SENDS SDP AND CANDIDATES ONLY. There is no message API here and there must never be
// one: if content ever travelled this path, the relay would be able to read it and the
// whole local-first claim would be a slogan.
(function () {
  function create(opts) {
    opts = opts || {};
    var ws = null;
    var open = false;
    var queue = [];   // signals produced before the socket finished connecting

    function emit(name, arg) {
      if (typeof opts[name] === 'function') {
        try { opts[name](arg); } catch (e) { /* a bad listener must not kill the channel */ }
      }
    }

    function raw(obj) {
      if (!ws || ws.readyState !== 1) return false;
      try { ws.send(JSON.stringify(obj)); return true; } catch (e) { return false; }
    }

    return {
      get isOpen() { return open; },

      /**
       * Connect and join the room. Resolves when the relay has confirmed the join.
       * ⚠ Rejects on failure rather than resolving quietly: a signalling channel that
       * silently never connected would look exactly like a peer that never answers.
       */
      connect: function () {
        if (ws) return Promise.resolve(true);
        return new Promise(function (resolve, reject) {
          var settled = false;
          try {
            ws = new WebSocket(opts.url);
          } catch (e) {
            return reject(new Error('could not open the signalling socket: ' + e.message));
          }

          ws.onopen = function () {
            open = true;
            raw({ t: 'join', room: opts.room, peer: opts.peerId });
          };

          ws.onmessage = function (ev) {
            var msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }

            if (msg.t === 'joined') {
              // Anything the transport produced while we were still connecting goes now,
              // in order — the offer is usually ready before the socket is.
              queue.splice(0).forEach(function (q) { raw(q); });
              if (!settled) { settled = true; resolve(true); }
              emit('onJoined', msg);
              return;
            }
            if (msg.t === 'peer-joined') { emit('onPeerJoined', msg.peer); return; }
            if (msg.t === 'peer-left') { emit('onPeerLeft', msg.peer); return; }
            if (msg.t === 'signal') {
              // ⚠ The transport decides what to do with the ordering; this only delivers.
              emit('onSignal', { from: msg.from, kind: msg.kind, payload: msg.payload });
              return;
            }
            if (msg.t === 'error') {
              emit('onError', msg.message);
              if (!settled) { settled = true; reject(new Error(msg.message)); }
            }
          };

          ws.onerror = function () {
            emit('onError', 'socket error');
            if (!settled) { settled = true; reject(new Error('signalling socket error')); }
          };

          ws.onclose = function () {
            open = false;
            ws = null;
            emit('onClose', null);
            if (!settled) { settled = true; reject(new Error('signalling socket closed before joining')); }
          };
        });
      },

      /** Send one signal to the peer. Queued until the join is confirmed. */
      sendSignal: function (kind, payload) {
        // ⚠ NO `to` FIELD, AND THAT IS DELIBERATE. `opts.peerId` is THIS peer's id, and
        // the first version sent `to: opts.peerId` — so the relay dutifully delivered
        // every offer back to its sender, which ignored it as glare, and the answerer
        // never saw anything. A room is capped at two, so "the other member" is
        // unambiguous; naming a target only creates a way to name the wrong one.
        var msg = { t: 'signal', kind: kind, payload: payload };
        if (!open) { queue.push(msg); return false; }
        return raw(msg);
      },

      close: function () {
        if (!ws) return;
        try { raw({ t: 'leave' }); } catch (e) {}
        try { ws.close(); } catch (e) {}
        ws = null;
        open = false;
      }
    };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OrbitSignaling = api;
})();
