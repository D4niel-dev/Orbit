/**
 * The composer's attach sheet — what the "+" opens.
 *
 * WHY THIS REPLACED THE DROPUP
 * ----------------------------
 * The "+" used to drop a five-item list: Upload Images, Upload Videos, Upload
 * Files, Commands, Upload Folder. Two of those were the same intent split in two
 * — you either had a photo or a video, and the app made you say which BEFORE it
 * could show you anything. Discord's does the opposite: one door, and the picker
 * decides. So there is now one sheet with a pill row along the bottom, and the
 * image/video/GIF case is a single entry rather than two.
 *
 * WHAT THE PHOTOS PANEL CAN AND CANNOT BE
 * ---------------------------------------
 * ⚠ It is a CHOOSER, not an in-app grid of the device's camera roll.
 *
 * Discord renders the last few hundred photos inside its own sheet. That needs
 * MediaStore access from the WebView, and a WebView cannot load a `content://`
 * URI as an <img> — every thumbnail would have to cross the bridge as base64.
 * It would also mean asking for broad photo-library access (READ_MEDIA_IMAGES /
 * READ_MEDIA_VIDEO), which is the permission Google is actively steering apps
 * away from, in a messenger whose whole point is that it does not go looking
 * through your things.
 *
 * So the grid opens the SYSTEM picker instead — which on Android 13+ is the
 * Photo Picker: the same recent-photos grid, drawn by Android, needing no
 * permission at all. The two tiles are the two intents: take one now, or choose
 * one you already have.
 *
 * Everything else on the pill row is an action the app already had, moved here
 * so the "+" has one shape instead of two.
 */
(function () {
  'use strict';

  // Discord's row is Photos / Poll / Apps / Files. Orbit has no bots, so the
  // third one is Commands — the door to the slash-command reference, which until
  // now you could only reach by knowing to type a "/".
  var TABS = [
    { key: 'photos', label: 'Photos', icon: 'image' },
    { key: 'poll', label: 'Poll', icon: 'bar-chart-3' },
    { key: 'commands', label: 'Commands', icon: 'terminal' },
    { key: 'files', label: 'Files', icon: 'paperclip' }
  ];

  var _tab = 'photos';

  function _esc(v) {
    return (typeof window.escapeHtml === 'function')
      ? window.escapeHtml(v)
      : String(v == null ? '' : v);
  }

  function _sheet() {
    return (typeof window.OrbitSheet !== 'undefined' && window.OrbitSheet)
      || (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
  }

  function _hide() {
    var s = _sheet();
    if (s && s.hide) s.hide();
  }

  /**
   * Drive the ONE file input the composer already owns.
   *
   * ⚠ No second `change` listener. app.js binds `handleFileInput` to this element
   * once; adding another here would stage every file twice. This only sets what
   * the picker should accept and then opens it.
   */
  function _pick(opts) {
    var input = document.getElementById('file-input');
    if (!input) return;
    opts = opts || {};

    if (opts.accept) input.setAttribute('accept', opts.accept);
    else input.removeAttribute('accept');

    // `capture` is what sends Android straight to the camera instead of a chooser.
    if (opts.capture) input.setAttribute('capture', opts.capture);
    else input.removeAttribute('capture');

    if (opts.folder) input.setAttribute('webkitdirectory', '');
    else input.removeAttribute('webkitdirectory');

    // A multi-select gallery pick is the point; a single capture is not.
    if (opts.single) input.removeAttribute('multiple');
    else input.setAttribute('multiple', '');

    input.click();
  }

  /** The media grid: two intents, not two file types. */
  function _photosPanel() {
    return '<div class="attach-grid">' +
        '<button class="attach-tile" id="attach-camera">' +
          '<span class="attach-tile-icon"><i data-lucide="camera"></i></span>' +
          '<span class="attach-tile-label">Camera</span>' +
        '</button>' +
        '<button class="attach-tile" id="attach-gallery">' +
          '<span class="attach-tile-icon"><i data-lucide="images"></i></span>' +
          '<span class="attach-tile-label">Gallery</span>' +
        '</button>' +
      '</div>' +
      '<div class="attach-hint">Photos, videos and GIFs from your device.</div>';
  }

  function _rowPanel(rows) {
    var html = '<div class="attach-rows">';
    rows.forEach(function (r) {
      html += '<button class="attach-row" id="' + _esc(r.id) + '">' +
        '<span class="attach-row-icon"><i data-lucide="' + _esc(r.icon) + '"></i></span>' +
        '<span class="attach-row-info">' +
          '<span class="attach-row-name">' + _esc(r.name) + '</span>' +
          '<span class="attach-row-why">' + _esc(r.why) + '</span>' +
        '</span>' +
      '</button>';
    });
    return html + '</div>';
  }

  function _panelHtml(tab) {
    if (tab === 'poll') {
      return _rowPanel([{
        id: 'attach-poll', icon: 'bar-chart-3', name: 'Create a poll',
        why: 'Ask a question with up to six options.'
      }]);
    }
    if (tab === 'commands') {
      return _rowPanel([{
        id: 'attach-commands', icon: 'terminal', name: 'Command reference',
        why: 'Every slash command, with what it does.'
      }]);
    }
    if (tab === 'files') {
      return _rowPanel([
        { id: 'attach-files', icon: 'file', name: 'Choose files', why: 'Any file type.' },
        { id: 'attach-folder', icon: 'folder', name: 'Choose a folder', why: 'Sends everything inside it.' }
      ]);
    }
    return _photosPanel();
  }

  function _render() {
    var html = '<div class="attach-sheet">';

    // The grid area is the sheet's body; it is the thing that changes with the
    // pills, and it is deliberately the tall part.
    html += '<div class="attach-body" id="attach-body">' + _panelHtml(_tab) + '</div>';

    html += '<div class="attach-pills" role="tablist">';
    TABS.forEach(function (t) {
      html += '<button class="attach-pill' + (t.key === _tab ? ' on' : '') +
        '" data-attach-tab="' + _esc(t.key) + '" role="tab" ' +
        'aria-selected="' + (t.key === _tab ? 'true' : 'false') + '">' +
        '<i data-lucide="' + _esc(t.icon) + '"></i>' +
        '<span>' + _esc(t.label) + '</span>' +
      '</button>';
    });
    html += '</div>';

    html += '</div>';

    var s = _sheet();
    if (s && s.showCustom) s.showCustom(html, { tall: true });
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }

    _wire();
  }

  /** Re-render only the panel, so switching pills does not rebuild the pills. */
  function _swapPanel(tab) {
    _tab = tab;
    var body = document.getElementById('attach-body');
    if (body) body.innerHTML = _panelHtml(tab);
    if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
    Array.prototype.forEach.call(document.querySelectorAll('[data-attach-tab]'), function (p) {
      var on = p.getAttribute('data-attach-tab') === tab;
      p.classList.toggle('on', on);
      p.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    _wire();
  }

  function _wire() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-attach-tab]'), function (p) {
      p.addEventListener('click', function () { _swapPanel(p.getAttribute('data-attach-tab')); });
    });

    var cam = document.getElementById('attach-camera');
    if (cam) {
      cam.addEventListener('click', function () {
        _hide();
        _pick({ accept: 'image/*', capture: 'environment', single: true });
      });
    }

    var gal = document.getElementById('attach-gallery');
    if (gal) {
      gal.addEventListener('click', function () {
        _hide();
        // ⚠ GIF IS AN IMAGE MIME TYPE, so `image/*` already covers it — listing
        // `image/gif` as well would be noise. Videos are the only thing that
        // needs its own entry, and this is the one place the app asks for both,
        // which is the whole reason the old Images/Videos split is gone.
        _pick({ accept: 'image/*,video/*' });
      });
    }

    var files = document.getElementById('attach-files');
    if (files) {
      files.addEventListener('click', function () {
        _hide();
        _pick({});
      });
    }

    var folder = document.getElementById('attach-folder');
    if (folder) {
      folder.addEventListener('click', function () {
        _hide();
        _pick({ folder: true });
      });
    }

    var poll = document.getElementById('attach-poll');
    if (poll) {
      poll.addEventListener('click', function () {
        _hide();
        // Sheet-to-sheet: let the hide animation finish before the next one takes
        // the same overlay, or the second sheet is sized against the first.
        setTimeout(function () {
          if (typeof window.openPollBuilder === 'function') window.openPollBuilder();
        }, 250);
      });
    }

    var cmds = document.getElementById('attach-commands');
    if (cmds) {
      cmds.addEventListener('click', function () {
        _hide();
        setTimeout(function () {
          if (typeof window.showHelpModal === 'function') window.showHelpModal();
        }, 250);
      });
    }
  }

  function open(tab) {
    _tab = tab || 'photos';
    _render();
  }

  window.OrbitAttach = {
    TABS: TABS,
    open: open,
    _tab: function () { return _tab; },
    _render: _render,
    _pick: _pick
  };
})();
