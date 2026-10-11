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

  // The battery exemption is not a permission — it opens a Settings screen
  // instead of a dialog — so it is offered as its own row rather than being
  // bundled into a button that says "Allow".
  var BATTERY = {
    key: 'battery', icon: 'battery-charging', title: 'Keep Orbit awake',
    why: 'Android can freeze the app in the background, and a message then waits until you next open it.'
  };

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
    var p = _plugin();
    if (p && p.requestBatteryExemption) {
      return Promise.resolve(p.requestBatteryExemption()).catch(function () { return {}; });
    }
    return Promise.resolve({});
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
  function _render(states, batteryExempt) {
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

    // The battery exemption, as its own quiet row: it opens a Settings screen
    // rather than raising a dialog, so it is not part of the same decision.
    html += '<div class="perm-battery">' +
      '<div class="perm-icon"><i data-lucide="' + (batteryExempt ? 'check' : BATTERY.icon) + '"></i></div>' +
      '<div class="perm-info">' +
        '<span class="perm-name">' + esc(BATTERY.title) + '</span>' +
        '<span class="perm-why">' + esc(BATTERY.why) + '</span>' +
      '</div>' +
      (batteryExempt
        ? '<span class="perm-chip">On</span>'
        : '<button class="perm-link" id="perm-battery-btn">Open settings</button>') +
    '</div>';

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
      // the chat visible matters. This is four explanations plus an action, and at
      // 70% the Allow button scrolled out of sight: the one thing the user came
      // here to press was the one thing they could not see.
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
          _render(next, next.battery === 'granted');
        });
      });
    }
    var done = document.getElementById('perm-done');
    if (done) {
      done.addEventListener('click', function () {
        if (typeof OrbitSheet !== 'undefined' && OrbitSheet.hide) OrbitSheet.hide();
      });
    }
    var batt = document.getElementById('perm-battery-btn');
    if (batt) {
      batt.addEventListener('click', function () {
        requestBattery();
      });
    }
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
      _render(states, states.battery === 'granted');
      return { asked: true, missing: need.map(function (w) { return w.key; }), states: states };
    });
  }

  window.OrbitPermissionGate = {
    WANTED: WANTED,
    BATTERY: BATTERY,
    supported: supported,
    check: check,
    request: request,
    requestBattery: requestBattery,
    missing: missing,
    maybeAsk: maybeAsk,
    _render: _render,
    _plugin: _plugin
  };
})();
