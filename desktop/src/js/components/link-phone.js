// src/js/components/link-phone.js
// "Link a phone" — send this whole account to a phone over the LAN.
//
// The security model lives in shared/network/transfer.js; read that first. In
// short: this listens on the LAN, so anything on the network can open a socket to
// us. What authorises a pull is the LINK TOKEN, which exists only as a QR on this
// screen and is never sent in the clear. The phone proves it holds the token by
// deriving the same encryption key from it.
//
// Two rules this file must not break:
//   1. The token is burned the moment a transfer starts, succeeds OR fails. A
//      replay of the same request must never pull a second copy.
//   2. Nothing leaves the machine until a human confirms, and the confirmation
//      says what is about to leave and how much of it.

window.OrbitLinkPhone = {
  TOKEN_TTL_MS: 10 * 60 * 1000,

  _token: null,
  _expiresAt: 0,
  _overlay: null,
  _tick: null,
  // The in-flight transfer, if any: { transferId, peerId, peerIp, token, salt,
  // key, cancelled }
  _active: null,

  /* ── opening ───────────────────────────────────────────────────────────── */

  open: function () {
    if (!window.store || !window.OrbitAccountTransfer || !window.Orbit || !Orbit.QRPairing) {
      if (window.Toast) window.Toast.show('Unavailable', 'Pairing modules are not loaded.', 'error');
      return;
    }
    var user = window.store.getState().currentUser;
    if (!user) return;

    this.close();   // never two of these at once

    this._token = OrbitAccountTransfer.makeToken();
    this._expiresAt = Date.now() + this.TOKEN_TTL_MS;
    this._render();
  },

  close: function () {
    if (this._active) this._active.cancelled = true;
    this._active = null;
    this._token = null;
    if (this._tick) { clearInterval(this._tick); this._tick = null; }
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
  },

  /* ── the panel ─────────────────────────────────────────────────────────── */

  _render: function () {
    var self = this;
    var esc = function (s) { return window.Sanitize ? window.Sanitize.escapeHtml(s) : String(s); };
    var user = window.store.getState().currentUser;

    var overlay = document.createElement('div');
    overlay.id = 'link-phone-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);' +
      'backdrop-filter:blur(4px);z-index:10000;display:flex;align-items:center;justify-content:center;';

    var panel = document.createElement('div');
    panel.style.cssText =
      'width:420px;background:var(--bg-surface);border-radius:var(--radius-lg);border:1px solid var(--border-subtle);' +
      'box-shadow:var(--shadow-xl);padding:22px;text-align:center;';

    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:9px;justify-content:center;margin-bottom:6px;">' +
        '<i data-lucide="smartphone" style="width:19px;height:19px;color:var(--accent-primary);"></i>' +
        '<h3 style="margin:0;font-family:var(--font-display);font-size:17px;font-weight:600;color:var(--text-primary);">Link a phone</h3>' +
      '</div>' +
      '<p style="margin:0 0 16px;font-size:12px;line-height:1.55;color:var(--text-muted);">' +
        'On the phone: <b style="color:var(--text-secondary);">Orbit → Settings → Pair a desktop</b>, then point it at this code.' +
      '</p>' +
      '<div id="link-phone-qr" style="background:#fff;padding:12px;border-radius:10px;display:inline-block;line-height:0;"></div>' +
      '<div id="link-phone-code" style="margin-top:12px;font-family:var(--font-mono);font-size:11px;' +
        'color:var(--text-muted);word-break:break-all;">' + esc(this._token || '') + '</div>' +
      '<div id="link-phone-status" style="margin-top:16px;font-size:12px;color:var(--text-secondary);">' +
        'Waiting for a phone… <span id="link-phone-timer" style="color:var(--text-muted);"></span></div>' +
      '<div id="link-phone-progress" style="display:none;margin-top:12px;">' +
        '<div style="height:4px;border-radius:2px;background:var(--bg-hover);overflow:hidden;">' +
          '<div id="link-phone-bar" style="height:100%;width:0%;background:var(--accent-primary);transition:width .18s ease;"></div>' +
        '</div></div>' +
      '<div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">' +
        '<button id="link-phone-cancel" style="padding:9px 20px;border-radius:8px;border:1px solid var(--border-subtle);' +
          'background:transparent;color:var(--text-secondary);font-size:13px;cursor:pointer;">Cancel</button>' +
      '</div>';

    overlay.appendChild(panel);
    document.getElementById('modal-container').appendChild(overlay);
    if (window.lucide) { try { lucide.createIcons({ root: overlay }); } catch (e) {} }
    this._overlay = overlay;

    panel.querySelector('#link-phone-cancel').addEventListener('click', function () { self.close(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });

    // The QR carries the token alongside the usual pairing payload, so one scan
    // both pairs the device and authorises the pull.
    var qrBox = panel.querySelector('#link-phone-qr');
    var publicKey = null;
    try {
      if (window.orbitAPI && window.orbitAPI.e2eeGetPublicKey) publicKey = window.orbitAPI.e2eeGetPublicKey();
    } catch (e) {}

    Orbit.QRPairing.listLocalIPv4().then(function (ips) {
      var payload = Orbit.QRPairing.buildPayload(user, {
        ips: ips,
        port: Orbit.QRPairing.DEFAULT_PORT,
        publicKey: publicKey,
        linkToken: self._token
      });
      if (!payload) throw new Error('no payload');
      if (typeof QRCode === 'undefined') throw new Error('no qr lib');
      var qr = QRCode(0, 'M');
      qr.addData(payload);
      qr.make();
      qrBox.innerHTML = qr.createImgTag(5, 0);
      qrBox.querySelector('img').style.display = 'block';
    }).catch(function () {
      qrBox.innerHTML = '<span style="color:#333;font-size:12px;">Could not generate the code</span>';
    });

    // Countdown, so an abandoned screen does not sit there looking live forever.
    this._tick = setInterval(function () {
      var left = self._expiresAt - Date.now();
      var el = panel.querySelector('#link-phone-timer');
      if (!el) return;
      if (left <= 0) {
        self._setStatus('This code has expired — close and reopen to get a new one', 'warn');
        self._token = null;   // a stale token must not authorise anything
        clearInterval(self._tick);
        self._tick = null;
        return;
      }
      var m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      el.textContent = '· expires in ' + m + ':' + (s < 10 ? '0' : '') + s;
    }, 1000);
  },

  _setStatus: function (text, kind) {
    var el = this._overlay && this._overlay.querySelector('#link-phone-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = kind === 'warn' ? 'var(--accent-warning)'
                   : kind === 'error' ? 'var(--accent-danger)'
                   : kind === 'ok' ? 'var(--accent-success)'
                   : 'var(--text-secondary)';
  },

  _setProgress: function (fraction) {
    if (!this._overlay) return;
    var wrap = this._overlay.querySelector('#link-phone-progress');
    var bar = this._overlay.querySelector('#link-phone-bar');
    if (wrap) wrap.style.display = '';
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
  },

  /* ── incoming: the phone asks for the account ──────────────────────────── */

  handleRequest: function (packet) {
    var payload = packet && packet.payload;
    if (!payload) return;

    // A token that has expired, been used, or was never ours. All three are the
    // same answer to the phone, and none of them is worth explaining in detail.
    if (!this._token || !this._expiresAt || Date.now() > this._expiresAt) {
      this._refuse(packet, 'bad-token');
      return;
    }
    if (payload.token !== this._token) {
      this._refuse(packet, 'bad-token');
      return;
    }
    if (this._active) {
      this._refuse(packet, 'declined');   // one at a time
      return;
    }

    var peerId = packet.from;
    var peerIp = packet.ip || null;
    var deviceName = (typeof payload.deviceName === 'string' ? payload.deviceName : 'A phone').slice(0, 64);
    var self = this;

    // Confirm BEFORE anything is built or sent. This is the only human check in
    // the whole flow, so it has to say what leaves and how much of it.
    window.orbitAPI.accountBundle().then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'could not read the account');
      var account = OrbitAccountTransfer.toMobileAccount(res.backup);
      if (!account || !account.user) throw new Error('this account has no identity yet');

      var msgCount = 0;
      Object.keys(account.messages).forEach(function (k) { msgCount += account.messages[k].length; });
      var bytes = JSON.stringify(account).length;
      var size = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';

      return new Promise(function (resolve) {
        window.ConfirmModal.show({
          title: 'Send this account to ' + deviceName + '?',
          message: deviceName + ' is asking to copy your account.\n\n' +
                   'Account: ' + (account.user.name || 'Unnamed') + '#' + (account.user.tag || '') + '\n' +
                   'Messages: ' + msgCount + '\n' +
                   'Contacts: ' + account.friends.length + '\n' +
                   'About ' + size + ', encrypted.\n\n' +
                   'It will be sent directly over your network. Nothing is uploaded to a server.',
          confirmText: 'Send',
          cancelText: 'Cancel',
          onConfirm: function () { resolve(true); },
          onCancel: function () { resolve(false); }
        });
      }).then(function (yes) {
        if (!yes) {
          self._refuse(packet, 'declined');
          // A refusal still burns the token: the user said no to THIS phone.
          self._token = null;
          return;
        }
        return self._send(packet, account);
      });
    }).catch(function (e) {
      self._setStatus('Could not prepare the transfer: ' + e.message, 'error');
      self._refuse(packet, 'malformed');
    });
  },

  _refuse: function (packet, reason) {
    try {
      window.orbitAPI.networkSend(packet.from, packet.ip || '', window.Protocol.Types.TRANSFER_RESULT,
        { transferId: null, ok: false, error: reason });
    } catch (e) {}
    if (reason === 'bad-token' && this._overlay) {
      this._setStatus('A device asked with an expired or wrong code — ignored', 'warn');
    }
  },

  /* ── sending ───────────────────────────────────────────────────────────── */

  _send: function (packet, account) {
    var self = this;
    var peerId = packet.from;
    var peerIp = packet.ip || '';
    var T = OrbitAccountTransfer;

    var transferId = 'tr-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    var saltBytes = new Uint8Array(16);
    window.crypto.getRandomValues(saltBytes);
    var salt = T._bytesToB64(saltBytes);

    // Burn the token NOW. If the transfer fails halfway, the phone cannot ask
    // again with the same code — the user has to re-link, which is the right
    // trade for a credential that grants a whole account.
    var token = this._token;
    this._token = null;
    if (this._tick) { clearInterval(this._tick); this._tick = null; }

    this._active = { transferId: transferId, peerId: peerId, cancelled: false };
    this._setStatus('Sending…');

    var bundle = T.buildBundle(
      { id: account.user.id, name: account.user.name, tag: account.user.tag }, account);
    var serialised = JSON.stringify(bundle);
    var bytes = serialised.length;

    return T.deriveKey(token, salt, T.KDF_ITERATIONS).then(function (key) {
      if (self._active.cancelled) throw new Error('cancelled');
      return T.seal(key, bundle);
    }).then(function (sealed) {
      if (self._active.cancelled) throw new Error('cancelled');

      // The ciphertext plus its IV, as one string, is what gets chunked. The IV
      // travels in the offer so the phone can start decrypting immediately.
      var body = sealed.iv + '.' + sealed.ct;
      var chunks = T.chunkString(body, T.CHUNK_CHARS);

      window.orbitAPI.networkSend(peerId, peerIp, window.Protocol.Types.TRANSFER_OFFER, {
        transferId: transferId,
        salt: salt,
        iterations: T.KDF_ITERATIONS,
        iv: sealed.iv,
        manifest: {
          bytes: bytes,
          total: chunks.length,
          accountName: account.user.name || '',
          counts: {
            messages: Object.keys(account.messages).reduce(function (n, k) {
              return n + account.messages[k].length;
            }, 0),
            friends: account.friends.length,
            groups: account.groups.length
          }
        }
      });

      // Chunks go out one at a time with a yield between them: networkSend is a
      // synchronous IPC call, and firing a few hundred of them back to back would
      // freeze the window and never repaint the progress bar.
      var seq = 0;
      function pump() {
        if (self._active.cancelled) return Promise.reject(new Error('cancelled'));
        if (seq >= chunks.length) return Promise.resolve();
        window.orbitAPI.networkSend(peerId, peerIp, window.Protocol.Types.TRANSFER_CHUNK, {
          transferId: transferId, seq: seq, total: chunks.length, data: chunks[seq]
        });
        seq++;
        self._setProgress(seq / chunks.length);
        self._setStatus('Sending… ' + Math.round((seq / chunks.length) * 100) + '%');
        return new Promise(function (r) { setTimeout(r, 0); }).then(pump);
      }

      return pump().then(function () {
        window.orbitAPI.networkSend(peerId, peerIp, window.Protocol.Types.TRANSFER_DONE,
          { transferId: transferId });
        self._setProgress(1);
        self._setStatus('Sent ' + chunks.length + ' of ' + chunks.length + ' — waiting for the phone to confirm…');
      });
    }).catch(function (e) {
      self._active = null;
      if (e.message === 'cancelled') {
        self._setStatus('Cancelled', 'warn');
        return;
      }
      self._setStatus('Could not send: ' + e.message, 'error');
    });
  },

  /* ── the phone reports back ────────────────────────────────────────────── */

  handleResult: function (packet) {
    var payload = packet && packet.payload;
    if (!payload || !this._active) return;
    if (payload.transferId !== this._active.transferId) return;

    this._active = null;
    if (payload.ok) {
      this._setStatus('Done — the account is on the phone.', 'ok');
      if (window.Toast) window.Toast.show('Account sent', 'The phone has it now.', 'success');
      var self = this;
      setTimeout(function () { self.close(); }, 2200);
    } else {
      this._setStatus('The phone could not finish: ' +
        OrbitAccountTransfer.describeReason(payload.error), 'error');
    }
  }
};
