// desktop/src/js/components/wan-connect.js
//
// "Connect over the internet" — the small piece of UI that makes the WAN transport
// reachable by a person instead of only by a probe.
//
// ⚠⚠ THE CODE IS A SHARED SECRET, NOT DECORATION. The room name is derived from it, and
// anybody who knows the room name can join it and sit in the middle of the signalling. A
// short random code that the two people exchange out of band is the minimum that makes
// that impractical — which is why it is generated here rather than being "the two user
// ids", a value anyone who has ever messaged you already knows.
//
// ⚠ THERE IS NO DIRECTORY AND NO LOOKUP. You pick the friend, then agree a code. Inventing
// a discovery service would put a server back in the middle of a local-first app, which is
// the thing this whole transport exists to avoid.
(function () {
  function randomCode() {
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';   // no look-alikes: i/l/o/0/1
    var out = '';
    var bytes = new Uint8Array(8);
    (window.crypto || {}).getRandomValues
      ? crypto.getRandomValues(bytes)
      : bytes.forEach(function (_, i) { bytes[i] = Math.floor(Math.random() * 256); });
    for (var i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
    return out.slice(0, 4) + '-' + out.slice(4);
  }

  function relayUrl() {
    var st = window.store.getState();
    var n = st.networkSettings || {};
    return n.natRelayUrl || 'ws://127.0.0.1:8787';
  }

  window.WanConnect = {
    /**
     * @param {object} peer  a friend record ({ userId, username })
     */
    open: function (peer) {
      if (!peer || !peer.userId) return;
      if (!window.orbitWanConnect) {
        if (window.Toast) window.Toast.show('Not available', 'The WAN transport did not load.', 'error');
        return;
      }
      var existing = document.getElementById('wan-connect-modal');
      if (existing) existing.remove();

      var code = randomCode();
      var el = document.createElement('div');
      el.id = 'wan-connect-modal';
      el.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.6);' +
        'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';

      el.innerHTML =
        '<div style="width:420px;max-width:100%;background:var(--bg-surface);border-radius:var(--radius-lg);' +
          'border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);overflow:hidden;">' +
          '<div style="padding:20px 22px 0;display:flex;align-items:flex-start;gap:12px;">' +
            '<div style="width:34px;height:34px;border-radius:10px;background:var(--accent-soft);display:flex;' +
              'align-items:center;justify-content:center;flex-shrink:0;color:var(--accent-primary);">' +
              '<i data-lucide="globe" style="width:17px;height:17px;"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:700;font-size:15px;color:var(--text-primary);">Connect to ' +
                window.Sanitize.escapeHtml(peer.username || 'this person') + '</div>' +
              '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-top:4px;">' +
                'Send them this code, and they enter the same one. It is the only thing that stops a ' +
                'stranger joining the connection.</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:16px 22px 0;">' +
            '<label style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;' +
              'letter-spacing:.04em;">Pairing code</label>' +
            '<div style="display:flex;gap:8px;margin-top:6px;">' +
              '<input id="wan-code-input" value="' + code + '" spellcheck="false" autocomplete="off" ' +
                'style="flex:1;min-width:0;padding:9px 12px;border-radius:9px;border:1px solid var(--border-subtle);' +
                'background:var(--bg-base);color:var(--text-primary);font-size:14px;font-family:var(--font-mono,monospace);' +
                'letter-spacing:.06em;">' +
              '<button id="wan-code-copy" style="padding:9px 12px;border-radius:9px;border:1px solid var(--border-subtle);' +
                'background:transparent;color:var(--text-secondary);font-size:12px;font-weight:600;cursor:pointer;' +
                'white-space:nowrap;">Copy</button>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;">Via ' +
              window.Sanitize.escapeHtml(relayUrl()) + '</div>' +
            '<div id="wan-status" style="font-size:12px;color:var(--text-secondary);margin-top:10px;min-height:16px;"></div>' +
          '</div>' +
          '<div style="padding:16px 22px 18px;display:flex;gap:10px;justify-content:flex-end;">' +
            '<button id="wan-cancel" style="padding:9px 18px;border-radius:9px;border:1px solid var(--border-subtle);' +
              'background:transparent;color:var(--text-secondary);font-size:13px;font-weight:500;cursor:pointer;' +
              'white-space:nowrap;">Cancel</button>' +
            '<button id="wan-go" style="padding:9px 18px;border-radius:9px;border:none;background:var(--accent-primary);' +
              'color:#fff;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Connect</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(el);
      if (window.lucide) { try { window.lucide.createIcons({ root: el }); } catch (e) {} }

      var status = el.querySelector('#wan-status');
      function close() { el.remove(); }
      function setStatus(text, colour) {
        status.textContent = text;
        status.style.color = colour || 'var(--text-secondary)';
      }

      el.addEventListener('mousedown', function (e) { if (e.target === el) close(); });
      el.querySelector('#wan-cancel').addEventListener('click', close);
      el.querySelector('#wan-code-copy').addEventListener('click', function () {
        var v = el.querySelector('#wan-code-input').value;
        try {
          navigator.clipboard.writeText(v);
          if (window.Toast) window.Toast.show('Copied', 'Send it to them however you like.', 'success');
        } catch (e) { /* clipboard may be unavailable; the field is selectable */ }
      });

      el.querySelector('#wan-go').addEventListener('click', function () {
        var room = String(el.querySelector('#wan-code-input').value || '').trim();
        if (room.length < 4) { setStatus('A code needs at least 4 characters.', 'var(--accent-warning)'); return; }
        setStatus('Connecting\u2026');
        window.orbitWanConnect(peer.userId, { relayUrl: relayUrl(), room: room }).then(function () {
          // ⚠ join() resolves on the relay handshake, not on the DataChannel. Wait for the
          // channel before claiming success, or the message would be a lie for a second.
          var tries = 0;
          (function poll() {
            if (window.OrbitWan && window.OrbitWan.isConnected(peer.userId)) {
              setStatus('Connected \u2014 messages now take this route.', 'var(--accent-success)');
              if (window.Toast) window.Toast.show('Connected over the internet', peer.username + ' is reachable outside your network.', 'success');
              setTimeout(close, 1200);
              return;
            }
            if (++tries > 40) { setStatus('The relay accepted, but no channel opened. Is the other person using the same code?', 'var(--accent-warning)'); return; }
            setTimeout(poll, 250);
          })();
        }).catch(function (err) {
          setStatus(String((err && err.message) || err), 'var(--accent-danger)');
        });
      });
    }
  };
})();
