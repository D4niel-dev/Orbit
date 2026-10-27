// mobile/src/js/components/account-switcher.js
// v0.8.1-beta — account switcher.
//
// Reached by tapping the header avatar (and from the account row in Settings).
// Mirrors the desktop's account switcher in behaviour, not in form: the desktop
// uses a 280px floating panel, which does not survive a 390px screen, so this is
// a bottom sheet.
//
// Switching RELOADS the webview rather than hot-swapping state. The store can
// change namespace in place, but the network layer is started once from app.js
// with the identity that was current at boot (Orbit.P2P.startServer /
// startDiscovery), and there is no clean way to re-point it — a half-switched
// app that still beacons as the old identity is worse than a reload. The desktop
// does the same thing on logout (relaunchApp).

var OrbitAccounts = {

  _el: null,
  _confirmingSignOut: false,

  // ──────────────────────────────────────────────────────────────────────────

  open: function(opts) {
    // Only one account surface at a time. The profile sheet registers a closer
    // on window because it cannot be reached from here.
    if (typeof window._closeProfileSheet === 'function') {
      try { window._closeProfileSheet(); } catch (e) {}
    }
    // Set when the user arrived here FROM the profile, so closing comes back to
    // it. Opening from anywhere else closes to whatever was underneath.
    this._returnTo = (opts && opts.returnTo) || null;

    if (!window.MStore) return;
    if (this._el) this.close();
    this._confirmingSignOut = false;

    var host = document.createElement('div');
    host.className = 'acct-host';
    host.innerHTML = this._html();
    document.body.appendChild(host);
    this._el = host;

    // Let the browser paint the closed state before the transition runs.
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { host.classList.add('open'); });
    });

    this._wire();
    if (window.lucide) { try { lucide.createIcons({ root: host }); } catch (e) {} }
  },

  close: function() {
    var host = this._el;
    if (!host) return;
    this._el = null;
    var back = this._returnTo;
    this._returnTo = null;
    host.classList.remove('open');
    setTimeout(function() {
      if (host.parentNode) host.parentNode.removeChild(host);
      // Closing the switcher goes back to the profile when that is where the
      // user came from. showProfileSheet() clears _returnTo before it closes
      // us, so this cannot bounce back and forth.
      if (back === 'profile' && typeof window.showProfileSheet === 'function') {
        window.showProfileSheet();
      }
    }, 220);
  },

  // ──────────────────────────────────────────────────────────────────────────

  _escape: function(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  },

  _avatarHtml: function(rec, size) {
    var pic;
    if (rec && rec.avatar) {
      pic = '<img src="' + this._escape(rec.avatar) + '" alt="" ' +
            'style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;">';
    } else {
      var initial = (rec && rec.name ? String(rec.name).charAt(0) : '?').toUpperCase();
      pic = '<div class="acct-initial" style="width:' + size + 'px;height:' + size + 'px;">' +
            this._escape(initial) + '</div>';
    }
    // Profile frame. Each account's frame number is mirrored into the registry
    // by Store.syncAccountRecord, so an inactive account can still show its own.
    var frame = rec && rec.profileFrame ? parseInt(rec.profileFrame, 10) || 0 : 0;
    if (frame > 0) {
      pic += '<img class="pfp-frame" src="icons/frames/pfp_frame_' + frame +
             '.png" alt="" draggable="false">';
    }
    return pic;
  },

  _html: function() {
    var self = this;
    var list = MStore.listAccounts();
    var current = MStore.activeAccount();
    var others = list.filter(function(a) { return !current || a.id !== current.id; });

    var h = '';
    h += '<div class="acct-backdrop" data-act="close"></div>';
    h += '<div class="acct-sheet" role="dialog" aria-label="Accounts">';
    h += '  <div class="acct-grabber"></div>';
    h += '  <div class="acct-head">';
    h += '    <h3>Accounts</h3>';
    h += '    <span>' + list.length + ' on this device</span>';
    h += '  </div>';

    // Current account — tapping it opens the profile editor.
    h += '  <div class="acct-current" data-act="profile" role="button" tabindex="0">';
    h += '    <div class="acct-pic">' + self._avatarHtml(current, 44) +
         (window.OrbitPresence
           ? window.OrbitPresence.badge((current && current.status) || 'offline', 12, 'var(--bg-surface)')
           : '') + '</div>';
    h += '    <div class="acct-info">';
    h += '      <div class="acct-name">' + self._escape(current ? current.name : 'User') + '</div>';
    h += '      <div class="acct-tag">' + self._escape(self._tag(current)) + '</div>';
    h += '    </div>';
    h += '    <span class="acct-this">This device</span>';
    h += '  </div>';

    if (others.length) {
      h += '  <div class="acct-label">Other accounts</div>';
      others.forEach(function(a) {
        h += '<div class="acct-row" data-act="switch" data-id="' + self._escape(a.id) + '" role="button" tabindex="0">';
        h += '  <div class="acct-pic">' + self._avatarHtml(a, 40) + '</div>';
        h += '  <div class="acct-info">';
        h += '    <div class="acct-name">' + self._escape(a.name) + '</div>';
        h += '    <div class="acct-tag">' + self._escape(self._tag(a)) + '</div>';
        h += '  </div>';
        h += '  <span class="acct-dev"><i data-lucide="smartphone"></i>Phone</span>';
        h += '</div>';
      });
    }

    h += '  <div class="acct-sep"></div>';

    h += '  <button class="acct-action" data-act="add">';
    h += '    <i data-lucide="plus"></i>';
    h += '    <span class="acct-action-txt">Add another account';
    h += '      <span class="acct-sub">Creates a fresh identity on this phone</span></span>';
    h += '  </button>';

    h += '  <button class="acct-action" data-act="pair">';
    h += '    <i data-lucide="qr-code"></i>';
    h += '    <span class="acct-action-txt">Pair a desktop';
    h += '      <span class="acct-sub">Bring an account over from Orbit on your computer</span></span>';
    h += '  </button>';

    h += '  <button class="acct-action danger" data-act="signout">';
    h += '    <i data-lucide="log-out"></i>';
    h += '    <span class="acct-action-txt" data-signout-label>Remove this account from the device</span>';
    h += '  </button>';

    h += '</div>';
    return h;
  },

  _tag: function(rec) {
    if (!rec) return '';
    if (!rec.tag) return rec.id ? String(rec.id).slice(0, 10) : '';
    return String(rec.name || '').toLowerCase() + '#' + rec.tag;
  },

  // ──────────────────────────────────────────────────────────────────────────

  _wire: function() {
    var self = this;
    var host = this._el;
    if (!host) return;

    host.addEventListener('click', function(e) {
      var t = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!t) return;
      var act = t.getAttribute('data-act');
      e.preventDefault();
      e.stopPropagation();

      if (act === 'close') { self.close(); return; }
      if (act === 'profile') { self.close(); self._openProfile(); return; }
      if (act === 'switch') { self._switchTo(t.getAttribute('data-id')); return; }
      if (act === 'add') { self._addAccount(); return; }
      if (act === 'pair') { self._pairDesktop(); return; }
      if (act === 'signout') { self._signOut(t); return; }
    });
  },

  _openProfile: function() {
    // The current-account card is the way into editing your profile — that is
    // what the header avatar used to do before it became the account control.
    if (typeof window.showProfileSheet === 'function') window.showProfileSheet();
  },

  _switchTo: function(id) {
    if (!id) return;
    this._busy('Switching…');
    // switchAccount() flushes the outgoing account, re-points the namespace and
    // reloads the data. The reload below is what actually re-boots the network
    // layer against the new identity.
    var ok = window.MStore.switchAccount(id);
    if (!ok) { this.close(); return; }
    setTimeout(function() { window.location.reload(); }, 120);
  },

  _addAccount: function() {
    this._busy('Creating…');
    try { window.MStore.createAccount(); } catch (e) {}
    setTimeout(function() { window.location.reload(); }, 120);
  },

  _pairDesktop: function() {
    // Opens the scanner. Scanning a desktop's code pairs the device and opens a
    // direct connection (QR pairing v2, already shipped) — that part works today.
    // Carrying the account ACROSS that connection is the next piece.
    //
    // ⚠ Clear the return-to BEFORE closing. `close()` honours `_returnTo`, so
    // arriving here from the profile card meant close() re-opened the card 220ms
    // later — the same moment the scanner opens, so the profile landed on top of
    // the camera. Tapping Pair is leaving for a destination, not dismissing the
    // sheet, so it must not take the "go back where I came from" path.
    this._returnTo = null;
    this.close();
    setTimeout(function() {
      if (typeof window.openScanner === 'function') window.openScanner('desktop');
    }, 220);   // let the sheet finish closing so the camera does not fight it
  },

  _signOut: function(btn) {
    var list = MStore.listAccounts();
    if (list.length < 2) {
      this.close();
      if (typeof window.showToast === 'function') {
        window.showToast('This is your only account', 'info');
      }
      return;
    }
    if (!this._confirmingSignOut) {
      // Two-step rather than a modal — the sheet is already a confirmation
      // surface and a nested dialog on a phone is worse than a second tap.
      this._confirmingSignOut = true;
      var label = btn.querySelector('[data-signout-label]');
      if (label) label.textContent = 'Tap again to remove this account';
      btn.classList.add('armed');
      return;
    }
    var id = window.MStore.accountId;
    this._busy('Removing…');
    try { window.MStore.deleteAccount(id); } catch (e) {}
    setTimeout(function() { window.location.reload(); }, 120);
  },

  _busy: function(text) {
    var host = this._el;
    if (!host) return;
    var sheet = host.querySelector('.acct-sheet');
    if (!sheet) return;
    if (!sheet.querySelector('.acct-busy')) {
      var b = document.createElement('div');
      b.className = 'acct-busy';
      b.innerHTML = '<span class="acct-spinner"></span><span class="acct-busy-txt"></span>';
      sheet.appendChild(b);
    }
    var t = sheet.querySelector('.acct-busy-txt');
    if (t) t.textContent = text || 'Working…';
  }
};

window.OrbitAccounts = OrbitAccounts;
