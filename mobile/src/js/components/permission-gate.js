/**
 * The startup permission pass.
 *
 * WHAT THIS REPLACES
 * ------------------
 * Permissions used to be asked for from three unrelated places, and none of them
 * could tell whether the answer was already yes:
 *
 *   1. MainActivity raised the POST_NOTIFICATIONS dialog on every cold start.
 *   2. This file's predecessor called LocalNotifications.requestPermissions() at
 *      boot, on every start.
 *   3. And it opened the CAMERA on every launch — getUserMedia({video:true}) and
 *      then immediately stopping the tracks — purely to provoke the OS prompt.
 *      The camera indicator lit up on every start whether or not you were about
 *      to scan anything.
 *
 * None of them could READ the current state, which is the whole reason a granted
 * permission was asked for again forever. OrbitPermissions.check() answers that,
 * and this gate asks only for what is genuinely missing.
 *
 * WHEN IT ASKS
 * ------------
 * Once per version, and only if something is missing. If everything is already
 * granted it does nothing at all — no sheet, no dialog, no camera. If a user
 * denied something, they are not nagged again until the next release, which is
 * what Dan asked for ("after they update to v0.8.7... if they are still missing
 * some permissions, on start up of the new version, it'll ask for those").
 *
 * WHY A SHEET AND NOT THE OS DIALOG ALONE
 * ---------------------------------------
 * A bare system dialog says "Allow Orbit to take pictures and record video?"
 * with no context, at a moment the user did not choose. The sheet says what it
 * is for first, and the system dialog then arrives as the answer to a question
 * that was already asked. It is also the app's own vocabulary — a bottom sheet
 * with one primary action and the Cancel pill — rather than a second kind of
 * surface.
 */
(function () {
  'use strict';

  // What Orbit asks for, and the reason a person would recognise. Order matters:
  // the sheet reads top-down, and the first item is the one most users want.
  var WANTED = [
    { key: 'notifications', icon: 'bell', title: 'Notifications',
      why: 'So a message can reach you while Orbit is in the background.' },
    { key: 'camera', icon: 'scan-qr-code', title: 'Camera',
      why: 'Only to scan a QR code \u2014 adding a friend, or pairing a desktop.' },
    { key: 'microphone', icon: 'mic', title: 'Microphone',
      why: 'For voice messages and calls. Nothing records until you hold the button.' },
    { key: 'nearby', icon: 'wifi', title: 'Nearby devices',
      why: 'So Orbit can find your other device on the same network.' }
  ];

  // ⚠ THESE ARE NOT PERMISSIONS — THEY ARE APP-OPS.
  //
  // Each one opens a Settings screen instead of raising a dialog, so there is
  // nothing for `requestPermissions()` to raise and nothing to accept. They
  // cannot be part of a button that says "Allow", so each gets its own row with
  // its own jump to Settings.
  //
  // They are here for the same reason the permissions are: without them the app
  // fails later, at a worse moment.
  //   - battery: Android may freeze the foreground service, so a message waits
  //     until the app is next opened.
  //   - install: the updater downloads the WHOLE APK and only then discovers it
  //     cannot open the installer. The download is wasted and the user is dropped
  //     into Settings mid-update with nothing to come back to.
  var SETTINGS_ROWS = [
    {
      key: 'battery',
      icon: 'battery-charging',
      title: 'Keep Orbit awake',
      why: 'Android can freeze the app in the background, and a message then waits until you next open it.',
      method: 'requestBatteryExemption'
    },
    {
      key: 'installPackages',
      icon: 'package-plus',
      title: 'Install updates',
      why: 'Orbit updates itself by downloading an APK. Android asks for your permission before it will open the installer.',
      method: 'requestInstallPackages'
    }
  ];

  /** The native plugin, or null when it is not there (browser, or an older build). */
  function _plugin() {
    var cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    return (cap && cap.Plugins && cap.Plugins.OrbitPermissions) || null;
  }

  function _settings() {
    return (typeof MStore !== 'undefined' && MStore && MStore.settings) ? MStore.settings : null;
  }

  function _version() {
    return String((typeof window !== 'undefined' && window.APP_VERSION) || '');
  }

  /**
   * The current state of everything, as `{ notifications: 'granted', ... }`.
   *
   * Falls back to the LocalNotifications plugin for the one permission it knows
   * about, so a build without the native plugin still asks for notifications
   * rather than going silent.
   */
  function check() {
    var p = _plugin();
    if (p && p.check) {
      return Promise.resolve(p.check()).then(function (r) {
        return r || {};
      }).catch(function () { return {}; });
    }
    var cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    var ln = cap && cap.Plugins && cap.Plugins.LocalNotifications;
    if (ln && ln.checkPermissions) {
      return Promise.resolve(ln.checkPermissions()).then(function (r) {
        var v = r && r.display;
        return { notifications: v === 'granted' ? 'granted' : (v === 'denied' ? 'denied' : 'prompt') };
      }).catch(function () { return {}; });
    }
    return Promise.resolve({});
  }

  /** Is there anything to ask about at all? */
  function supported() {
    var p = _plugin();
    if (p && p.check) return true;
    var cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    return !!(cap && cap.Plugins && cap.Plugins.LocalNotifications);
  }

  /** The entries in WANTED that are not granted. An unknown state counts as missing. */
  function missing(states) {
    states = states || {};
    return WANTED.filter(function (w) {
      return states[w.key] !== 'granted';
    });
  }

  /** Ask the OS for everything that is not already granted. */
  function request() {
    var p = _plugin();
    if (p && p.request) {
      return Promise.resolve(p.request()).then(function (r) { return r || {}; })
        .catch(function () { return {}; });
    }
    var cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    var ln = cap && cap.Plugins && cap.Plugins.LocalNotifications;
    if (ln && ln.requestPermissions) {
      return Promise.resolve(ln.requestPermissions()).then(function (r) {
        var v = r && r.display;
        return { notifications: v === 'granted' ? 'granted' : 'denied' };
      }).catch(function () { return {}; });
    }
    return Promise.resolve({});
  }

  function requestBattery() {
    return _openSettings('requestBatteryExemption');
  }

  function requestInstallPackages() {
    return _openSettings('requestInstallPackages');
  }

  /**
   * Open a Settings screen through the plugin, then arrange to re-read the state
   * when the user comes back.
   *
   * ⚠ The answer is given on a screen we do not control, so nothing here can
   * report it. Without the re-check the row would still say "Open settings" after
   * the user had already granted it — the sheet would be lying about the one
   * thing it exists to report.
   */
  function _openSettings(method) {
    var p = _plugin();
    if (!p || typeof p[method] !== 'function') return Promise.resolve({});
    _recheckOnReturn();
    return Promise.resolve(p[method]()).catch(function () { return {}; });
  }

  function _recheckOnReturn() {
    if (document.__permRecheck) return;
    document.__permRecheck = true;
    var once = function () {
      // Still in the background — Settings is on top of us.
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', once);
      window.removeEventListener('focus', once);
      document.__permRecheck = false;
      // Only if the sheet is still the thing on screen.
      var ov = document.getElementById('bottom-sheet-overlay');
      if (!ov || !ov.classList.contains('active')) return;
      check().then(function (s) { _render(s); }).catch(function () {});
    };
    document.addEventListener('visibilitychange', once);
    window.addEventListener('focus', once);
  }

  function _esc(v) {
    return (typeof window.escapeHtml === 'function')
      ? window.escapeHtml(v)
      : String(v == null ? '' : v);
  }

  /**
   * The sheet. Re-rendered in place after a request so the rows that were just
   * granted show it — the user sees the answer without the sheet vanishing.
   */
  function _render(states) {
    states = states || {};
    var esc = _esc;
    var still = missing(states);

    var html = '<div class="perm-sheet">';
    html += '<div class="perm-head">';
    html += '<div class="perm-title">Permissions</div>';
    html += '<div class="perm-sub">Orbit needs a few things to work properly. ' +
            'Each one is only used when it is actually needed.</div>';
    html += '</div>';

    html += '<div class="perm-list">';
    WANTED.forEach(function (w) {
      var granted = states[w.key] === 'granted';
      html += '<div class="perm-row' + (granted ? ' is-granted' : '') + '">' +
        '<div class="perm-icon"><i data-lucide="' + (granted ? 'check' : w.icon) + '"></i></div>' +
        '<div class="perm-info">' +
          '<span class="perm-name">' + esc(w.title) + '</span>' +
          '<span class="perm-why">' + esc(w.why) + '</span>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    // The app-ops, grouped below and set apart: each is a Settings screen, not a
    // dialog, so none of them is part of the Allow button above.
    html += '<div class="perm-list perm-settings">';
    SETTINGS_ROWS.forEach(function (row) {
      var on = states[row.key] === 'granted';
      html += '<div class="perm-row perm-setting' + (on ? ' is-granted' : '') + '">' +
        '<div class="perm-icon"><i data-lucide="' + (on ? 'check' : row.icon) + '"></i></div>' +
        '<div class="perm-info">' +
          '<span class="perm-name">' + esc(row.title) + '</span>' +
          '<span class="perm-why">' + esc(row.why) + '</span>' +
        '</div>' +
        (on
          ? '<span class="perm-chip">On</span>'
          : '<button class="perm-link" data-perm-settings="' + esc(row.key) + '">Open settings</button>') +
      '</div>';
    });
    html += '</div>';

    html += '<div class="perm-actions">' +
      (still.length
        ? '<button class="perm-go" id="perm-allow">Allow' +
          (still.length === 1 ? '' : ' all ' + still.length) + '</button>'
        : '<button class="perm-go perm-done" id="perm-done">Done</button>') +
    '</div>';

    html += '</div>';

    if (typeof OrbitSheet !== 'undefined' && OrbitSheet.showCustom) {
      // ⚠ `tall` on purpose. The default cap is 70% of the visible area, which is
      // sized for a chooser — a context menu or a poll builder — where leaving
      // the chat visible matters. This is four explanations, two app-ops and an
      // action, and at 70% the Allow button scrolled out of sight: the one thing
      // the user came here to press was the one thing they could not see.
      OrbitSheet.showCustom(html, { tall: true });
    }
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }

    var allow = document.getElementById('perm-allow');
    if (allow) {
      allow.addEventListener('click', function () {
        allow.disabled = true;
        allow.textContent = 'Asking\u2026';
        request().then(function (next) {
          // Re-render from the state the OS just reported, not from an assumption.
          _render(next);
        });
      });
    }
    var done = document.getElementById('perm-done');
    if (done) {
      done.addEventListener('click', function () {
        if (typeof OrbitSheet !== 'undefined' && OrbitSheet.hide) OrbitSheet.hide();
      });
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-perm-settings]'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-perm-settings');
        var row = SETTINGS_ROWS.filter(function (r) { return r.key === key; })[0];
        if (row) _openSettings(row.method);
      });
    });
  }

  function _markAsked() {
    var s = _settings();
    if (!s) return;
    s.permissionsAskedVersion = _version();
    try { if (typeof MStore !== 'undefined' && MStore.save) MStore.save(); } catch (e) {}
  }

  /**
   * The startup entry point. Resolves with what it decided, so a caller (or a
   * test) can tell "nothing was missing" from "we asked" without guessing.
   */
  function maybeAsk() {
    if (!supported()) return Promise.resolve({ asked: false, reason: 'unsupported' });
    var ver = _version();
    return check().then(function (states) {
      var need = missing(states);
      if (!need.length) return { asked: false, reason: 'all-granted', states: states };

      var s = _settings();
      var askedFor = (s && s.permissionsAskedVersion) || '';
      if (ver && askedFor === ver) {
        return { asked: false, reason: 'already-asked-this-version', missing: need.map(function (w) { return w.key; }) };
      }

      // Marked before the sheet is shown: if the app is closed while it is open,
      // the next start must not immediately ask again.
      _markAsked();
      _render(states);
      return { asked: true, missing: need.map(function (w) { return w.key; }), states: states };
    });
  }

  window.OrbitPermissionGate = {
    WANTED: WANTED,
    SETTINGS_ROWS: SETTINGS_ROWS,
    supported: supported,
    check: check,
    request: request,
    requestBattery: requestBattery,
    requestInstallPackages: requestInstallPackages,
    missing: missing,
    maybeAsk: maybeAsk,
    _render: _render,
    _openSettings: _openSettings,
    _plugin: _plugin
  };
})();
