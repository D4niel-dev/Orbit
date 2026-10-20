// src/js/views/settings-modal.js

/**
 * The default profile banner.
 *
 * ⚠⚠ ONE DEFINITION, USED TWICE — AND IT WAS NOT, WHICH COST A ROUND TRIP.
 *
 * This gradient was written out in two places: the render path and the
 * live-preview path (which rebuilds the banner as you type in the field). The
 * v0.9.0 fix changed the render path and left the preview one alone, so the old
 * colour came straight back the moment anyone touched the banner input. A test
 * that reads THIS FILE for the retired hex is what found the second copy —
 * reading the line I had changed would never have shown it.
 *
 * ⚠⚠ AND THEN IT WAS STILL THREE DEFINITIONS ACROSS THE APP. The same default
 * was written out again in the profile sidebar and in the Manage Group modal —
 * both still ending in the retired #6C5CE7. Fixing one file and asserting on one
 * file is what let the other two survive.
 *
 * ⚠ The VALUE now lives in styles/variables.css as `--banner-default`, which is
 * the one place all three call sites read. This constant is only a NAME for it,
 * so the two settings call sites below cannot drift apart again.
 *
 * ⚠ It used to run accent → #6C5CE7: a HARDCODED PURPLE, and therefore a second
 * brand colour in a design that has exactly one. It is a wash of the THEME's
 * accent instead, so a nord or sunset user gets their own colour here rather than
 * Orbit blue.
 */
var DEFAULT_BANNER = 'var(--banner-default)';

window.SettingsModal = {
  isOpen: false,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'settings-overlay';
    this.container.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;';
    document.body.appendChild(this.container);
    this.render();
    // Live network-map refresh (Settings → Network tab). Skips itself while
    // the modal is closed or the canvas is hidden, so it's idle-cheap.
    var self = this;
    setInterval(function() { self._drawNetworkMap(); }, 250);
    // Keyboard accessibility for collapsible sections
    this.container.addEventListener('keydown', function(e) {
      var header = e.target.closest('.collapsible-header');
      if (!header) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        header.click();
      }
    });
    // Close theme dropdown on outside click
    this.container.addEventListener('click', function(e) {
      if (e.target.closest('#theme-custom-menu') || e.target.closest('#theme-custom-trigger')) return;
      var menu = document.getElementById('theme-custom-menu');
      if (menu && menu.style.display !== 'none') {
        menu.style.display = 'none';
        var arrow = document.getElementById('theme-custom-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      }
    });
  },

  render() {
    var s = window.store.getState().settings || {};
    var showSecurity = s.enableExperimental;

    // ⚠ AN ICON PER ITEM, AND THE LIST IS BUILT FROM ONE ARRAY. Eight bare words in a
    // 240px rail is a list you have to READ; an icon column is one you can SCAN, and
    // it is the last thing in this modal that did not have one. The array also makes
    // the Security item's condition a property rather than a string concatenation
    // spliced into the middle of the markup.
    //
    // ⚠ The inline styles are gone — the layer owns `.settings-tab` outright now, so
    // the active state is a class and there is no second writer left to fight it.
    var navItems = [
      { tab: 'account', icon: 'user', label: 'Account' },
      { tab: 'appearance', icon: 'palette', label: 'Appearance' },
      { tab: 'network', icon: 'wifi', label: 'Network' },
      { tab: 'notifications', icon: 'bell', label: 'Notifications' },
      { tab: 'data', icon: 'database', label: 'Data Manager' },
      { tab: 'security', icon: 'shield', label: 'Security', experimental: true },
      { tab: 'advanced', icon: 'sliders-horizontal', label: 'Advanced' },
      { tab: 'about', icon: 'info', label: 'About' }
    ].filter(function (it) { return !it.experimental || showSecurity; }).map(function (it) {
      return '<button class="settings-tab' + (it.tab === 'account' ? ' active' : '') + '" data-tab="' + it.tab + '">' +
        '<i data-lucide="' + it.icon + '"></i><span>' + it.label + '</span></button>';
    }).join('');

    this.container.innerHTML =
      '<div style="width:800px;height:600px;background:var(--bg-surface);border-radius:var(--radius-lg);display:flex;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
        '<div style="width:240px;background:var(--bg-base);padding:24px;border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
          // ⚠ The heading and the collapse control share a row, so the h2 is no longer
          // a DIRECT child of the rail — the layer's selector for it moved with it.
          '<div class="settings-rail-head">' +
            '<h2 style="font-family:var(--font-display);font-size:20px;margin-bottom:24px;color:var(--text-primary);font-weight:bold;">Settings</h2>' +
            // ⚠ Rendered ALWAYS and hidden by `_syncNavToggle` when the redesign is off.
            // Deciding it here would read `OrbitRedesign` during init, and init runs on
            // DOMContentLoaded — before the settings are hydrated and, on some load
            // orders, before app.js has defined the object. That is the same trap the
            // gallery's view mode fell into.
            '<button id="settings-nav-toggle" class="settings-rail-toggle" type="button" title="Collapse to icons">' +
              '<i data-lucide="chevrons-left"></i>' +
            '</button>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            navItems +
          '</div>' +
          '<div style="flex:1;"></div>' +
          // ⚠ An icon for the collapsed rail: "Close" is 40px of text and the rail is
          // 64px wide. Shown only when collapsed — the expanded rail keeps the word.
          '<button id="btn-close-settings" style="padding:10px;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-secondary);background:transparent;cursor:pointer;"><i data-lucide="x"></i><span>Close</span></button>' +
        '</div>' +
        '<div id="settings-content" style="flex:1;padding:32px;overflow-y:auto;background:var(--bg-surface);"></div>' +
      '</div>';
    // ⚠⚠ THE NAV'S ICONS HAVE TO BE CONVERTED HERE, AND THEY NEVER WERE. `render()`
    // writes `<i data-lucide="…">` into the rail and then called only `attachEvents()`;
    // every one of the eight `createIcons` calls in this file is scoped to
    // `#settings-content`, so the RAIL was never converted by anything in this file.
    // The icons appeared on first load only because app.js runs a global
    // `lucide.createIcons()` at boot — which happens to sweep whatever is in the DOM at
    // that moment.
    //
    // ⚠⚠ So any RE-RENDER lost them, and the experimental-features toggle is a
    // re-render: turning it on made the Security item appear and every other icon
    // vanish. Dan reported it as "the security doesn't have an icon" — measured, ALL
    // EIGHT lose theirs. The item that just appeared is the one that looks guilty.
    if (window.lucide) window.lucide.createIcons({ root: this.container });
    this.attachEvents();
  },

  /**
   * Apply the collapsed-nav preference — and decide whether the control exists at all.
   *
   * ⚠⚠ CALLED FROM open() AS WELL AS attachEvents(). The modal renders ONCE, in
   * init(), which runs on DOMContentLoaded — BEFORE the settings are hydrated from the
   * database. A render-time read of `settingsNavCollapsed` therefore always sees the
   * default, which is exactly how the gallery's saved view mode came to look like it
   * never saved. open() is the first moment the value is real.
   */
  _syncNavToggle() {
    var btn = this.container && this.container.querySelector('#settings-nav-toggle');
    if (!btn) return;
    // ⚠ A REDESIGN-ONLY control. With the layer off there is no button and no class, so
    // the classic rail is always the full 240px. The rules that act on the class live
    // in the layer anyway, so this is belt and braces — but a control that visibly does
    // nothing is worse than one that is not there.
    var redesigned = !!(window.OrbitRedesign && window.OrbitRedesign.isOn());
    var collapsed = !!(window.store.getState().settings || {}).settingsNavCollapsed;
    btn.style.display = redesigned ? '' : 'none';
    this.container.classList.toggle('nav-collapsed', redesigned && collapsed);
    btn.title = collapsed ? 'Show labels' : 'Collapse to icons';
    // ⚠ Re-emitted rather than two stacked icons toggled by CSS: lucide replaces the
    // <i> with an <svg>, and whether a class on the <i> survives that is not something
    // to bet a control on.
    btn.innerHTML = '<i data-lucide="' + (collapsed ? 'chevrons-right' : 'chevrons-left') + '"></i>';
    if (window.lucide) window.lucide.createIcons({ root: btn });
  },

  attachEvents() {
    var self = this;
    var tabs = this.container.querySelectorAll('.settings-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        // ⚠ The class is the ONLY writer now. This used to also set `background` and
        // `color` inline on every tab — a second writer for a state the stylesheet
        // already owns, which is why every rule for `.settings-tab` in the layer needs
        // `!important` to be seen at all. It is one class toggle.
        tabs.forEach(function(t) { t.classList.remove('active'); });
        e.currentTarget.classList.add('active');
        self.renderTab(e.currentTarget.getAttribute('data-tab'));
      });
    });
    this.container.querySelector('#btn-close-settings').addEventListener('click', function() { self.close(); });

    // ⚠ The rail collapse. The STORE moves as well as the disk — persisting without it
    // is how the gallery's view mode came to be silently reverted by its own
    // subscription on the next settings change.
    var navToggle = this.container.querySelector('#settings-nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', function() {
        // ⚠⚠ A RAIL COLLAPSE IS NOT AN APP-WIDE SETTINGS CHANGE, SO IT MUST NOT
        // TRAVEL THE APP-WIDE PATH. `setState({ settings })` notifies every
        // subscriber, and app.js's subscriber runs applySettings — which restarted
        // a document-wide `theme-transitioning` transition, rewrote the chat
        // wallpaper, the font size, a dozen root classes and the offline poller.
        // Dan: "it seems to refresh the whole app UI ??? (which it shouldn't cuz it
        // may lag some devices)". It did.
        //
        // The store still MOVES: the settings object is mutated in place, so a
        // later `Object.assign({}, state.settings, …)` from any other control
        // carries this value forward. That was the lesson from the gallery's view
        // mode — persisting to disk WITHOUT the store let the next settings change
        // silently revert it. Here the store holds it and nothing repaints.
        var live = window.store.getState().settings;
        if (!live) return;
        live.settingsNavCollapsed = !live.settingsNavCollapsed;
        if (window.Storage) window.Storage.set('settings', live);
        if (window.orbitAPI && window.orbitAPI.dbSetSetting) window.orbitAPI.dbSetSetting('settings', live);
        self._syncNavToggle();
      });
    }
    self._syncNavToggle();
  },

  renderTab(tabName) {
    var content = this.container.querySelector('#settings-content');
    var state = window.store.getState();
    var user = state.currentUser;
    var experimentalBadge = '<span style="display:inline-block;font-size:8px;font-weight:700;color:#fff;background:var(--accent-warning);border-radius:3px;padding:1px 5px;text-transform:uppercase;line-height:1.4;vertical-align:middle;margin-left:6px;">EXPERIMENTAL</span>';
    // ⚠ Same pill, different word and colour, because it means something
    // different. "Experimental" says it might be unstable; "Beta" says it is
    // still changing but you can rely on it. The redesign is the second kind: it
    // ships alongside the old UI and keeps being improved, so it is not going to
    // be pulled out from under anyone.
    var betaBadge = '<span style="display:inline-block;font-size:8px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:3px;padding:1px 5px;text-transform:uppercase;line-height:1.4;vertical-align:middle;margin-left:6px;">BETA</span>';

    if (tabName === 'account') {
      var s = state.settings || {};
      var frameNum = (user && user.profileFrame != null ? user.profileFrame : (s.profileFrame || 0));
      var frameOverlayPreview = frameNum ? '<img src="icons/frames/pfp_frame_' + frameNum + '.png" style="position:absolute;top:-11%;left:-11%;width:117%;height:117%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '';

      var avatarPreview = user.avatar
        ? '<div id="preview-avatar-wrapper" style="position:relative;display:inline-block;">' +
          '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:4px solid var(--bg-surface);">' +
          frameOverlayPreview +
          '</div>'
        : '<div id="preview-avatar-wrapper" style="position:relative;display:inline-block;">' +
          '<div id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:white;font-weight:600;border:4px solid var(--bg-surface);">' + (user.username ? user.username.charAt(0).toUpperCase() : '?') + '</div>' +
          frameOverlayPreview +
          '</div>';

      var bannerStyle = user.banner
        ? (user.banner.startsWith('#') || user.banner.startsWith('linear-gradient') || user.banner.startsWith('rgb')
          ? 'background:' + window.Sanitize.escapeHtml(user.banner)
          : 'background-image:url(' + window.Sanitize.escapeHtml(user.banner) + ');background-size:cover;background-position:center')
        // ⚠ Changed HERE rather than overridden in redesign.css on purpose: this
        // inline style is either the default or the banner the user chose, and a
        // stylesheet rule with `!important` could not tell the two apart — it would
        // quietly discard a custom banner.
        : 'background:' + DEFAULT_BANNER;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">My Account</h3>' +

        // Preview Card
        '<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid var(--border-subtle);">' +
          '<div id="preview-banner" style="height:120px;' + bannerStyle + ';position:relative;">' +
            '<div style="position:absolute;bottom:-40px;left:24px;">' + avatarPreview + '</div>' +
          '</div>' +
          '<div style="padding:48px 24px 20px 24px;background:var(--bg-surface);">' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);" id="preview-username">' + window.Sanitize.escapeHtml(user.username) + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);font-family:var(--font-mono);" id="preview-usertag">#' + window.Sanitize.escapeHtml(user.usertag || '') + '</div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Profile
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Profile</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="margin-bottom:16px;"><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Username</label>' +
            '<div style="display:flex;gap:8px;"><input type="text" id="input-username" value="' + window.Sanitize.escapeHtml(user.username) + '" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:14px;outline:none;">' +
            '<div style="padding:10px 12px;border-radius:8px;background:var(--bg-surface);color:var(--text-muted);font-family:var(--font-mono);font-size:14px;border:1px solid var(--border-subtle);">#' + window.Sanitize.escapeHtml(user.usertag || '') + '</div></div></div>' +
            '<div><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Bio</label>' +
            '<textarea id="input-bio" rows="3" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;resize:none;">' + window.Sanitize.escapeHtml(user.bio || '') + '</textarea></div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Profile Frame
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Profile Frame</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;" id="frame-picker">' +
              '<button class="frame-option" data-frame="0" style="width:44px;height:44px;border-radius:50%;border:2px solid ' + (!frameNum ? 'var(--accent-primary)' : 'var(--border-subtle)') + ';background:var(--bg-base);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);">None</button>' +
              (function() {
                // The numbers that have an asset, listed rather than ranged, so a missing
                // asset cannot put a broken tile in the picker. All of 1..55 exist as of the
                // latest batch. Regenerate if the frame assets change.
                // The shared list — the mobile reads the same one. This was a
                // literal 1..55 here and a loop stopping at 42 on the phone, so
                // the two drifted and nobody could tell.
                var FRAME_NUMBERS = (window.ProfileFrames && window.ProfileFrames.numbers) || [
                  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
                  13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
                  25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
                  37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
                  49, 50, 51, 52, 53, 54, 55
                ];
                var html = '';
                for (var fi = 0; fi < FRAME_NUMBERS.length; fi++) {
                  var i = FRAME_NUMBERS[fi];
                  html += '<button class="frame-option" data-frame="' + i + '" style="width:44px;height:44px;border-radius:50%;border:2px solid ' + (frameNum === i ? 'var(--accent-primary)' : 'var(--border-subtle)') + ';cursor:pointer;overflow:hidden;padding:0;background:var(--bg-base);">' +
                    '<img src="icons/frames/pfp_frame_' + i + '.png" style="width:100%;height:100%;object-fit:contain;" draggable="false">' +
                  '</button>';
                }
                return html;
              })() +
            '</div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Avatar & Banner
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Avatar & Banner</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Avatar</label>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<div style="flex:1;"><input type="text" id="input-avatar" placeholder="Avatar URL..." value="' + window.Sanitize.escapeHtml(user.avatar || '') + '" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;"></div>' +
                '<label style="padding:10px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);flex-shrink:0;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-avatar-file" accept="image/*" style="display:none;"></label>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Banner</label>' +
              '<div style="display:flex;gap:8px;align-items:center;">' +
                '<div style="flex:1;"><input type="text" id="input-banner" placeholder="#Hex, gradient, or Image URL..." value="' + window.Sanitize.escapeHtml(user.banner || '') + '" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;"></div>' +
                '<label style="padding:10px;background:var(--bg-hover);color:var(--text-primary);border-radius:8px;cursor:pointer;border:1px solid var(--border-subtle);flex-shrink:0;"><i data-lucide="upload" style="width:16px;"></i><input type="file" id="input-banner-file" accept="image/*" style="display:none;"></label>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Collapsible: Account Info
        '<div class="settings-collapsible" style="margin-bottom:24px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Account Info</span>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">User ID</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);font-family:var(--font-mono);word-break:break-all;padding:10px 12px;background:var(--bg-base);border-radius:8px;border:1px solid var(--border-subtle);">' + (user.userId || 'N/A') + '</div>' +
            '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);text-align:center;">' +
              '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Your QR Code</div>' +
              '<p style="font-size:11px;color:var(--text-muted);margin:0 0 10px;">Scan this with Orbit on another device to connect instantly.</p>' +
              '<div id="qr-code-container" style="display:inline-block;padding:10px;background:#fff;border-radius:10px;"></div>' +
              '<div style="margin-top:14px;">' +
                '<button id="btn-scan-qr" style="padding:8px 16px;background:transparent;color:var(--text-secondary);' +
                'border:1px solid var(--border-subtle);border-radius:8px;font-size:12px;cursor:pointer;">Scan a QR code…</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Save
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<button id="btn-save-account" style="padding:10px 24px;background:var(--accent-primary);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Save Changes</button>' +
          '<span id="save-msg" style="font-size:14px;color:var(--accent-success);"></span>' +
        '</div>';

      lucide.createIcons({ root: content });

      // Generate QR code for user profile (pairing payload v2)
      // See plans/docs/Orbit QR Pairing v2 Design.md
      (function generateQR() {
        var qrContainer = document.getElementById('qr-code-container');
        if (!qrContainer || typeof QRCode === 'undefined') return;
        var state = window.store.getState();
        var user = state.currentUser;
        if (!user) return;

        function render(qrData) {
          try {
            var qr = QRCode(0, 'M');
            qr.addData(qrData);
            qr.make();
            qrContainer.innerHTML = qr.createImgTag(4, 0);
            qrContainer.querySelector('img').style.display = 'block';
          } catch(e) {
            qrContainer.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">Could not generate QR code</span>';
          }
        }

        // Identity-only payload (v1). Used if the shared pairing module is
        // unavailable, so this panel never renders blank.
        function renderV1() {
          render(JSON.stringify({ v: 1, id: user.userId, n: user.username, t: user.usertag }));
        }

        if (!window.Orbit || !Orbit.QRPairing) { renderV1(); return; }

        var publicKey = null;
        try {
          if (window.orbitAPI && window.orbitAPI.e2eeGetPublicKey) publicKey = window.orbitAPI.e2eeGetPublicKey();
        } catch(e) {}

        Orbit.QRPairing.listLocalIPv4().then(function(ips) {
          var payload = Orbit.QRPairing.buildPayload(user, {
            ips: ips,
            port: Orbit.QRPairing.DEFAULT_PORT,
            publicKey: publicKey
          });
          if (payload) render(payload); else renderV1();
        }).catch(renderV1);
      })();

      // Desktop has no camera — pairing from an image (paste / drop / picker)
      var scanBtn = document.getElementById('btn-scan-qr');
      if (scanBtn) {
        scanBtn.addEventListener('click', function() {
          if (window.OrbitQRScanner) {
            window.OrbitQRScanner.open();
          } else if (window.Toast) {
            window.Toast.show('Unavailable', 'QR scanner not loaded.', 'error');
          }
        });
      }

      // Live preview updates
      function updatePreview() {
        try {
          var nameInput = content.querySelector('#input-username');
          var avatarInput = content.querySelector('#input-avatar');
          var bannerInput = content.querySelector('#input-banner');
          if (!nameInput || !avatarInput || !bannerInput) return;

          var name = nameInput.value.trim();
          var avatar = avatarInput.value.trim();
          var banner = bannerInput.value.trim();
          var frame = window.store.getState().settings.profileFrame || 0;

          var nameEl = content.querySelector('#preview-username');
          if (nameEl) nameEl.textContent = name || 'User';

          var wrapper = content.querySelector('#preview-avatar-wrapper');
          if (wrapper) {
            var innerHtml;
            if (avatar) {
              innerHtml = '<img src="' + window.Sanitize.escapeHtml(avatar) + '" id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:4px solid var(--bg-surface);">';
            } else {
              innerHtml = '<div id="preview-avatar-img" style="width:80px;height:80px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:32px;color:white;font-weight:600;border:4px solid var(--bg-surface);">' + (name ? name.charAt(0).toUpperCase() : '?') + '</div>';
            }
            var frameHtml = frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-11%;left:-11%;width:117%;height:117%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '';
            wrapper.innerHTML = innerHtml + frameHtml;
          }

          var bannerEl = content.querySelector('#preview-banner');
          if (bannerEl) {
            if (banner) {
              if (banner.startsWith('#') || banner.startsWith('linear-gradient') || banner.startsWith('rgb')) {
                bannerEl.style.cssText = 'height:120px;position:relative;background:' + window.Sanitize.escapeHtml(banner) + ';';
              } else {
                bannerEl.style.cssText = 'height:120px;position:relative;background-image:url(' + window.Sanitize.escapeHtml(banner) + ');background-size:cover;background-position:center;';
              }
            } else {
              bannerEl.style.cssText = 'height:120px;position:relative;background:' + DEFAULT_BANNER + ';';
            }
          }
        } catch (e) {
          // Silently fail if DOM is stale (tab was re-rendered)
        }
      }

      function openAvatarCropper(source) {
      if (window.ImageCropper) {
        window.ImageCropper.open(source, {
          aspectRatio: 1,
          cropWidth: 300,
          cropHeight: 300,
          title: 'Crop Avatar'
        }, function(result) {
          if (result) {
            var input = content.querySelector('#input-avatar');
            if (input) {
              input.value = result;
              updatePreview();
            }
          }
        });
      }
    }

    function openBannerCropper(source) {
      if (window.ImageCropper) {
        window.ImageCropper.open(source, {
          aspectRatio: 3,
          cropWidth: 600,
          cropHeight: 200,
          title: 'Crop Banner'
        }, function(result) {
          if (result) {
            var input = content.querySelector('#input-banner');
            if (input) {
              input.value = result;
              updatePreview();
            }
          }
        });
      }
    }

      var avatarFileInput = content.querySelector('#input-avatar-file');
      if (avatarFileInput) {
      avatarFileInput.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          openAvatarCropper(file);
          e.target.value = '';
        });
      }
      var bannerFileInput = content.querySelector('#input-banner-file');
      if (bannerFileInput) {
        bannerFileInput.addEventListener('change', function(e) {
          var file = e.target.files[0];
          if (!file) return;
          openBannerCropper(file);
          e.target.value = '';
        });
      }

      content.querySelector('#input-username').addEventListener('input', updatePreview);
      content.querySelector('#input-avatar').addEventListener('input', updatePreview);
      content.querySelector('#input-banner').addEventListener('input', updatePreview);

      // Enter key in avatar/banner URL inputs opens cropper
      content.querySelector('#input-avatar').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var val = this.value.trim();
          if (val) openAvatarCropper(val);
        }
      });
      content.querySelector('#input-banner').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var val = this.value.trim();
          if (val) openBannerCropper(val);
        }
      });

      content.querySelector('#btn-save-account').addEventListener('click', function() {
        try {
          window.Identity.update({
            username: content.querySelector('#input-username').value.trim(),
            bio: content.querySelector('#input-bio').value.trim(),
            avatar: content.querySelector('#input-avatar').value.trim() || null,
            banner: content.querySelector('#input-banner').value.trim() || null
          });
          content.querySelector('#save-msg').textContent = "Saved!";
          setTimeout(function() { 
            var msgEl = content.querySelector('#save-msg');
            if (msgEl) msgEl.textContent = ""; 
          }, 3000);
        } catch (e) {
          content.querySelector('#save-msg').style.color = "var(--accent-danger)";
          content.querySelector('#save-msg').textContent = e.message;
        }
      });

      // Settings helper for Account tab (also syncs profileFrame to identity)
      var updateSettings = function(key, val) {
        // Record undo/redo action
        if (window.UndoManager && !window.UndoManager._paused) {
          var _oldVal = window.store.getState().settings[key];
          var _key = key;
          var _newVal = val;
          if (_oldVal !== _newVal) {
            window.UndoManager.pushAction('Change ' + _key, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _oldVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            }, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _newVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            });
          }
        }
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
        if (key === 'profileFrame') {
          var cu = window.store.getState().currentUser;
          if (cu) {
            var updated = { ...cu, profileFrame: val || null };
            window.store.setState({ currentUser: updated });
            if (window.orbitAPI) window.orbitAPI.dbSaveUser(updated);
            // Broadcast profile frame change to connected peers in real time
            if (window.orbitAPI && window.orbitAPI.broadcastBeacon) {
              window.orbitAPI.broadcastBeacon(updated);
            }
          }
        }
      };

      // Frame picker in Account tab
      content.querySelectorAll('.frame-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var frame = parseInt(btn.dataset.frame);
          updateSettings('profileFrame', frame);
          if (window.SettingsModal) window.SettingsModal.renderTab('account');
        });
      });
    } else if (tabName === 'appearance') {
      var s = state.settings;

      var defaultThemes = [
        { value: 'dark', icon: 'moon', label: 'Dark' },
        { value: 'light', icon: 'sun', label: 'Light' },
        { value: 'system', icon: 'monitor', label: 'System' }
      ];

      var customThemes = [
        { value: 'dark-purple', icon: 'palette', label: 'Dark Purple' },
        { value: 'midnight', icon: 'cloud-moon', label: 'Midnight' },
        { value: 'sunset', icon: 'sunset', label: 'Sunset' },
        { value: 'seasonal', icon: 'calendar', label: 'Seasonal' },
        { value: 'nord', icon: 'snowflake', label: 'Nord' }
      ];

      var isCustomTheme = customThemes.some(function(t) { return t.value === s.theme; });
      var currentCustom = customThemes.find(function(t) { return t.value === s.theme; });

      var themeBtnHtml = defaultThemes.map(function(t) {
        return '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 12px;flex:1;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);transition:border-color 0.15s;' + (s.theme === t.value ? 'border-color:var(--accent-primary);' : '') + '">' +
          '<input type="radio" name="theme" value="' + t.value + '" ' + (s.theme === t.value ? 'checked' : '') + ' style="accent-color:var(--accent-primary);">' +
          '<i data-lucide="' + t.icon + '" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>' +
          '<span style="font-size:12px;color:var(--text-primary);">' + t.label + '</span>' +
        '</label>';
      }).join('');

      var customDropdownHtml =
        '<div style="position:relative;">' +
          '<button id="theme-custom-trigger" style="display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:12px;cursor:pointer;outline:none;' + (isCustomTheme ? 'border-color:var(--accent-primary);' : '') + '">' +
            '<i data-lucide="' + (currentCustom ? currentCustom.icon : 'palette') + '" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>' +
            '<span style="flex:1;text-align:left;">' + (currentCustom ? currentCustom.label : 'Custom') + '</span>' +
            '<i data-lucide="chevron-down" id="theme-custom-arrow" style="width:12px;height:12px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</button>' +
          '<div id="theme-custom-menu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;width:100%;background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:var(--shadow-lg);z-index:200;overflow:hidden;">' +
            customThemes.map(function(opt) {
              return '<button class="theme-custom-option" data-value="' + opt.value + '" style="display:flex;align-items:center;gap:8px;width:100%;padding:10px 14px;background:transparent;border:none;color:var(--text-primary);font-size:13px;cursor:pointer;text-align:left;transition:background 0.1s;' + (opt.value === s.theme ? 'background:var(--bg-hover);' : '') + '">' +
                '<i data-lucide="' + opt.icon + '" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;"></i>' +
                '<span>' + opt.label + '</span>' +
                (opt.value === s.theme ? '<i data-lucide="check" style="width:14px;height:14px;color:var(--accent-primary);margin-left:auto;"></i>' : '') +
              '</button>';
            }).join('') +
          '</div>' +
        '</div>';

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Appearance</h3>' +

        // ⚠ The "Look" card that used to sit here — and FIRST in this tab — has
        // moved to Advanced → Experimental Features, with a BETA badge. The
        // redesign is not a one-off: it ships alongside the old UI and keeps being
        // improved, so switching between them is a beta feature rather than a
        // first-class appearance choice. Its markup and its change handler moved
        // together; the handler now lives in the advanced branch below.

        // Section: Theme
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:visible;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="palette" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Theme</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="display:flex;gap:8px;margin-bottom:8px;">' + themeBtnHtml + '</div>' +
            customDropdownHtml +
            (s.enableCustomColors
              ? '<button id="theme-custom-colors-btn" style="display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px;margin-top:8px;border-radius:8px;border:1px dashed var(--border-subtle);background:transparent;color:var(--text-secondary);font-size:12px;cursor:pointer;text-align:center;justify-content:center;transition:border-color 0.15s,color 0.15s;">' +
                '<i data-lucide="palette" style="width:14px;height:14px;"></i>' +
                '<span>Custom Colors</span>' + experimentalBadge +
              '</button>'
              : '') +
            // A way BACK to the saved custom colours. Applying in the editor sets
            // theme='custom', but nothing in this list offered that value — so
            // choosing any other theme dropped you out of your own colours with no
            // route back except reopening the editor and pressing Apply again.
            ((s.enableCustomColors && s.customThemeColors && Object.keys(s.customThemeColors).length)
              ? '<button id="theme-use-custom-btn" style="display:flex;align-items:center;gap:6px;width:100%;padding:8px 12px;margin-top:6px;border-radius:8px;border:1px solid ' + (s.theme === 'custom' ? 'var(--accent-primary)' : 'var(--border-subtle)') + ';background:var(--bg-base);color:var(--text-primary);font-size:12px;cursor:pointer;justify-content:center;transition:border-color 0.15s;">' +
                '<i data-lucide="check" style="width:14px;height:14px;' + (s.theme === 'custom' ? 'color:var(--accent-primary);' : 'color:var(--text-muted);') + '"></i>' +
                '<span>' + (s.theme === 'custom' ? 'Using your custom colors' : 'Use your custom colors') + '</span>' +
              '</button>'
              : '') +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;margin-top:16px;padding-top:12px;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-24h" type="checkbox" '+(s.timeFormat24?'checked':'')+'>' +
              '<div><div>24-hour Time</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Show timestamps in 24-hour format</div></div>' +
            '</label>' +
          '</div>' +
        '</div>' +
        
        // Section: Text & Layout
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="type" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Text & Layout</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Font Size</label>' +
              '<select id="set-font" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.fontSize==='Small'?'selected':'')+'>Small</option><option '+(s.fontSize==='Medium'?'selected':'')+'>Medium</option><option '+(s.fontSize==='Large'?'selected':'')+'>Large</option>' +
              '</select>' +
            '</div>' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Message Bubbles</label>' +
              '<select id="set-bubbles" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.messageBubbles==='Modern'?'selected':'')+'>Modern (Rounded)</option><option '+(s.messageBubbles==='Compact'?'selected':'')+'>Compact (Square)</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label for="set-zoom" style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">App Zoom</label>' +
              '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="font-size:11px;color:var(--text-muted);">80%</span>' +
                '<input id="set-zoom" type="range" min="80" max="150" value="'+s.appZoom+'" style="flex:1;accent-color:var(--accent-primary);">' +
                '<span style="font-size:11px;color:var(--text-muted);">150%</span>' +
              '</div>' +
              '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px;">' +
                '<span id="zoom-val-label" style="font-size:13px;font-weight:600;color:var(--accent-primary);">' + s.appZoom + '%</span>' +
                '<span style="font-size:11px;color:var(--text-muted);">(restart required)</span>' +
              '</div>' +
              '<div id="zoom-preview" style="margin-top:10px;border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden;background:var(--bg-base);">' +
                '<div style="padding:8px 10px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface);">' +
                  '<div style="width:20px;height:20px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;color:white;font-size:9px;font-weight:600;">O</div>' +
                  '<div style="flex:1;height:6px;border-radius:3px;background:var(--border-subtle);"></div>' +
                  '<div style="width:16px;height:16px;border-radius:4px;background:var(--border-subtle);"></div>' +
                '</div>' +
                '<div style="padding:10px;display:flex;gap:8px;align-items:flex-start;">' +
                  '<div style="width:24px;height:24px;border-radius:50%;background:var(--border-subtle);flex-shrink:0;"></div>' +
                  '<div style="flex:1;">' +
                    '<div style="height:6px;width:60%;border-radius:3px;background:var(--border-subtle);margin-bottom:4px;"></div>' +
                    '<div style="height:24px;border-radius:4px;background:var(--accent-primary);opacity:0.15;"></div>' +
                  '</div>' +
                '</div>' +
                '<div id="zoom-preview-scale" style="display:flex;align-items:center;justify-content:center;gap:4px;padding:6px;border-top:1px solid var(--border-subtle);font-size:10px;color:var(--text-muted);">' +
                  '<i data-lucide="search" style="width:10px;height:10px;"></i>' +
                  '<span id="zoom-preview-label">' + s.appZoom + '%</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:10px;">Sidebar Buttons</label>' +
              '<div style="display:flex;flex-direction:column;gap:8px;">' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="activity" '+(s.sidebarButtons&&s.sidebarButtons.activity!==false?'checked':'')+'>' +
                  '<i data-lucide="bell" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Activity Center</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="gallery" '+(s.sidebarButtons&&s.sidebarButtons.gallery!==false?'checked':'')+'>' +
                  '<i data-lucide="archive" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Gallery</span>' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
                  '<input type="checkbox" class="sidebar-btn-toggle" data-btn="storage" '+(s.sidebarButtons&&s.sidebarButtons.storage!==false?'checked':'')+'>' +
                  '<i data-lucide="hard-drive" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
                  '<span>Storage</span>' +
                '</label>' +
              '</div>' +
            '</div>' +
          '<div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="set-translate" type="checkbox" '+(s.messageTranslate||s.experimentalMessageTranslate?'checked':'')+'>' +
              '<div><div>Message Translation</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Show a translate button on messages via MyMemory API</div></div>' +
            '</label>' +
            '<div id="translate-options" style="' + ((s.messageTranslate || s.experimentalMessageTranslate) ? '' : 'display:none;') + '">' +
              '<div style="margin-top:12px;">' +
                '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Translate to</label>' +
                '<select id="set-translate-lang" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                  '<option value="" '+(s.translateTargetLang===''?'selected':'')+'>Auto (browser language)</option>' +
                  '<option value="en" '+(s.translateTargetLang==='en'?'selected':'')+'>English</option>' +
                  '<option value="vi" '+(s.translateTargetLang==='vi'?'selected':'')+'>Vietnamese</option>' +
                  '<option value="es" '+(s.translateTargetLang==='es'?'selected':'')+'>Spanish</option>' +
                  '<option value="fr" '+(s.translateTargetLang==='fr'?'selected':'')+'>French</option>' +
                  '<option value="de" '+(s.translateTargetLang==='de'?'selected':'')+'>German</option>' +
                  '<option value="it" '+(s.translateTargetLang==='it'?'selected':'')+'>Italian</option>' +
                  '<option value="pt" '+(s.translateTargetLang==='pt'?'selected':'')+'>Portuguese</option>' +
                  '<option value="ru" '+(s.translateTargetLang==='ru'?'selected':'')+'>Russian</option>' +
                  '<option value="zh-CN" '+(s.translateTargetLang==='zh-CN'?'selected':'')+'>Chinese (Simplified)</option>' +
                  '<option value="zh-TW" '+(s.translateTargetLang==='zh-TW'?'selected':'')+'>Chinese (Traditional)</option>' +
                  '<option value="ja" '+(s.translateTargetLang==='ja'?'selected':'')+'>Japanese</option>' +
                  '<option value="ko" '+(s.translateTargetLang==='ko'?'selected':'')+'>Korean</option>' +
                  '<option value="ar" '+(s.translateTargetLang==='ar'?'selected':'')+'>Arabic</option>' +
                  '<option value="hi" '+(s.translateTargetLang==='hi'?'selected':'')+'>Hindi</option>' +
                  '<option value="tr" '+(s.translateTargetLang==='tr'?'selected':'')+'>Turkish</option>' +
                  '<option value="nl" '+(s.translateTargetLang==='nl'?'selected':'')+'>Dutch</option>' +
                  '<option value="pl" '+(s.translateTargetLang==='pl'?'selected':'')+'>Polish</option>' +
                  '<option value="sv" '+(s.translateTargetLang==='sv'?'selected':'')+'>Swedish</option>' +
                  '<option value="th" '+(s.translateTargetLang==='th'?'selected':'')+'>Thai</option>' +
                  '<option value="id" '+(s.translateTargetLang==='id'?'selected':'')+'>Indonesian</option>' +
                  '<option value="el" '+(s.translateTargetLang==='el'?'selected':'')+'>Greek</option>' +
                  '<option value="cs" '+(s.translateTargetLang==='cs'?'selected':'')+'>Czech</option>' +
                  '<option value="ro" '+(s.translateTargetLang==='ro'?'selected':'')+'>Romanian</option>' +
                  '<option value="uk" '+(s.translateTargetLang==='uk'?'selected':'')+'>Ukrainian</option>' +
                  '<option value="hu" '+(s.translateTargetLang==='hu'?'selected':'')+'>Hungarian</option>' +
                  '<option value="he" '+(s.translateTargetLang==='he'?'selected':'')+'>Hebrew</option>' +
                  '<option value="da" '+(s.translateTargetLang==='da'?'selected':'')+'>Danish</option>' +
                  '<option value="fi" '+(s.translateTargetLang==='fi'?'selected':'')+'>Finnish</option>' +
                  '<option value="no" '+(s.translateTargetLang==='no'?'selected':'')+'>Norwegian</option>' +
                  '<option value="ms" '+(s.translateTargetLang==='ms'?'selected':'')+'>Malay</option>' +
                '</select>' +
              '</div>' +
              '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;margin-top:12px;">' +
                '<input id="set-translate-autodetect" type="checkbox" '+(s.autoDetectSource?'checked':'')+'>' +
                '<div><div>Auto-detect Source Language</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Detect message language instead of assuming English</div></div>' +
              '</label>' +
            '</div>' +
          '</div>' +
          '</div>' +
        '</div>' +

        // Section: Animation
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="sparkles" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Animation</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<label style="font-size:13px;color:var(--text-primary);min-width:90px;">Speed</label>' +
                '<select id="set-anim-speed" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                  '<option value="slow"'+(s.animSpeed==='slow'?' selected':'')+'>Slow</option>' +
                  '<option value="normal"'+(s.animSpeed==='normal'?' selected':'')+'>Normal</option>' +
                  '<option value="fast"'+(s.animSpeed==='fast'?' selected':'')+'>Fast</option>' +
                '</select>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<label style="font-size:13px;color:var(--text-primary);min-width:90px;">Messages</label>' +
                '<select id="set-msg-anim" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                  '<option value="slide"'+(s.messageAnim==='slide'?' selected':'')+'>Slide</option>' +
                  '<option value="fade"'+(s.messageAnim==='fade'?' selected':'')+'>Fade</option>' +
                  '<option value="instant"'+(s.messageAnim==='instant'?' selected':'')+'>Instant</option>' +
                '</select>' +
              '</div>' +
              '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;">' +
                '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                  '<input id="set-anim" type="checkbox" '+(s.animations===false?'':'checked')+'>' +
                  '<div><div>UI Animations</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Enable animated transitions and effects</div></div>' +
                '</label>' +
              '</div>' +
              '<div>' +
                '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                  '<input id="set-reduce-motion" type="checkbox" '+(s.reduceMotion?'checked':'')+'>' +
                   '<div><div>Reduce Motion</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Disable animations, freeze GIF previews, and stop avatar effects</div></div>' +
                '</label>' +
              '</div>' +
              '<div style="border-top:1px solid var(--border-subtle);padding-top:12px;margin-top:4px;">' +
                '<label style="display:flex;align-items:center;gap:12px;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                  '<input id="set-nobang" type="checkbox" '+(s.noFlashbang?'checked':'')+'>' +
                  '<div><div>Disable Light Mode Flashbang</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Skip the white flash when switching to Light Mode</div></div>' +
                '</label>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Save/Load Themes
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="download" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Save/Load Themes</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;line-height:1.4;">Export your current theme settings to a file or import a previously saved theme.</div>' +
            '<div id="save-load-theme-buttons" style="display:flex;align-items:center;gap:8px;margin-top:8px;">' +
              '<button id="btn-export-theme" style="padding:10px 20px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;font-size:13px;">Export Theme</button>' +
              '<button id="btn-import-theme" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;font-size:13px;">Import Theme</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Chat
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="message-square" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Chat</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Chat Wallpaper</label>' +
              '<div style="display:flex;align-items:center;gap:12px;">' +
                '<button id="btn-upload-wallpaper" style="padding:8px 12px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-primary);cursor:pointer;font-size:13px;font-weight:500;"><i data-lucide="image" style="width:14px;height:14px;margin-right:6px;vertical-align:middle;"></i>Choose Image</button>' +
                (s.chatWallpaper ? '<button id="btn-clear-wallpaper" style="padding:8px 12px;background:transparent;border:none;color:var(--accent-danger);cursor:pointer;font-size:13px;font-weight:500;">Remove</button>' : '') +
              '</div>' +
              (s.chatWallpaper ? '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + window.Sanitize.escapeHtml(s.chatWallpaper) + '">Custom wallpaper applied</div>' : '') +
            '</div>' +
            '<div style="margin-bottom:16px;">' +
              '<label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Background Pattern</label>' +
              '<select id="set-pattern" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;">' +
                '<option '+(s.bgPattern==='None'?'selected':'')+'>None</option><option '+(s.bgPattern==='Dots'?'selected':'')+'>Dots</option><option '+(s.bgPattern==='Grid'?'selected':'')+'>Grid</option><option '+(s.bgPattern==='Diagonal Stripes'?'selected':'')+'>Diagonal Stripes</option><option '+(s.bgPattern==='Crosshatch'?'selected':'')+'>Crosshatch</option><option '+(s.bgPattern==='Circles'?'selected':'')+'>Circles</option>' +
              '</select>' +
            '</div>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-enter-send" type="checkbox" '+(s.enterToSend!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Enter to Send</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Press Enter to send, Shift+Enter for new line</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-chat-avatars" type="checkbox" '+(s.showChatAvatars!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Show Avatars</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Display user avatars next to messages</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-group-created" type="checkbox" '+(s.showGroupCreated!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Show Group Created Date</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Show when a group was created in its info</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-image-previews" type="checkbox" '+(s.showImagePreviews!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Image Previews</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Show inline image previews in chat</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-link-previews" type="checkbox" '+(s.showLinkPreviews!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Link Previews</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Show rich previews for shared links</div></div>' +
            '</label>' +
            // ⚠ THE DESKTOP NEVER HAD THIS ROW; THE MOBILE DID, and it belongs with
            // the other message-appearance toggles rather than under Text & Layout.
            // ⚠ A CHECKBOX, not the `.orbit-switch` — this section is all checkboxes,
            // and a lone toggle among them reads as a different kind of control.
            // The rule lives in components.css, so it does something in BOTH UIs.
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-classic-bubbles" type="checkbox" '+(s.classicBubbles===true?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Classic Bubbles</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Colour your own messages with the accent</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-compact-spacing" type="checkbox" '+(s.experimentalCompactSpacing?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Compact Spacing</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Tighter message layout with reduced padding</div></div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
              '<input id="set-swipe-reply" type="checkbox" '+(s.swipeToReply!==false?'checked':'')+' style="accent-color:var(--accent-primary);">' +
              '<div><div>Swipe to Reply</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Swipe or drag left on a message to reply</div></div>' +
            '</label>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        // Record undo/redo action
        if (window.UndoManager && !window.UndoManager._paused) {
          var _oldVal = window.store.getState().settings[key];
          var _key = key;
          var _newVal = val;
          if (_oldVal !== _newVal) {
            window.UndoManager.pushAction('Change ' + _key, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _oldVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            }, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _newVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            });
          }
        }
        var beforeSettings = window.store.getState().settings;
        var newSettings = { ...beforeSettings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
        
        if (window.App && window.App.applySettings) {
          window.App.applySettings(newSettings);
        }

        // Tell my other devices, if anything on the whitelist actually moved. worthSending()
        // compares the BUILT payloads rather than the settings objects, so a change to a key
        // outside the whitelist costs nothing and a keystroke in a colour field does not send a
        // packet per character.
        if (window.OrbitSettingsSync && window.OrbitSettingsSync.worthSending(beforeSettings, newSettings)) {
          window.store.broadcastSettings(newSettings);
        }

        // Sync profileFrame to currentUser for beacon broadcast
        if (key === 'profileFrame') {
          var cu = window.store.getState().currentUser;
          if (cu) {
            var updated = { ...cu, profileFrame: val || null };
            window.store.setState({ currentUser: updated });
            if (window.orbitAPI) window.orbitAPI.dbSaveUser(updated);
          }
        }
      };

      content.querySelectorAll('input[name="theme"]').forEach(function(radio) {
        radio.addEventListener('change', function(e) {
          if (e.target.checked) {
            var currentTheme = window.store.getState().settings.theme;
            // Easter egg: Light mode warning 😎
            if (e.target.value === 'light' && currentTheme !== 'light') {
              // Revert the radio visually while we show the dialog
              e.target.checked = false;
              var prevRadio = content.querySelector('input[name="theme"][value="' + currentTheme + '"]');
              if (prevRadio) prevRadio.checked = true;

              // Build a funny warning dialog
              var overlay = document.createElement('div');
              overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
              overlay.innerHTML =
                '<div style="background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:16px;padding:32px;max-width:440px;width:90%;box-shadow:0 24px 48px rgba(0,0,0,0.4);text-align:center;">' +
                  '<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#FFD93D,#FF6B6B);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></div>' +
                  '<h3 style="font-family:var(--font-display);font-size:20px;color:var(--text-primary);margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px;"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--accent-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>CAUTION : Light Mode</h3>' +
                  '<p style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:6px;">' +
                    'Are you <b>ABSOLUTELY</b> sure you want to switch to <br><span style="color:#FFD93D;font-weight:700;">Light Mode</span> ?' +
                  '</p>' +
                  '<p style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:20px;">' +
                    'This action will deploy a tactical <b style="color:var(--accent-warning);">FLASHBANG</b> directly to your retinas. ' +
                    '<br>Side effects may include temporary blindness, existential confusion, and an overwhelming urge to switch back to Dark Mode immediately.<br><br>' +
                    '<span style="font-size:12px;opacity:0.7;">We recommend putting on sunglasses before proceeding. <br>You have been warned.</span>' +
                  '</p>' +
                  '<label style="display:flex;align-items:center;gap:8px;justify-content:center;font-size:13px;color:var(--text-muted);cursor:pointer;margin-bottom:16px;">' +
                    '<input id="light-mode-nobang" type="checkbox" '+(window.store.getState().settings.noFlashbang?'checked':'')+'>' +
                    '<span>Don\u0027t flashbang me next time</span>' +
                  '</label>' +
                  '<div style="display:flex;gap:10px;justify-content:center;">' +
                    '<button id="light-mode-cancel" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;font-weight:500;">No thanks, I choose life</button>' +
                    '<button id="light-mode-confirm" style="padding:10px 20px;border-radius:10px;border:none;background:linear-gradient(135deg,#FFD93D,#FF8C00);color:#000;cursor:pointer;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Flashbang me</button>' +
                  '</div>' +
                '</div>';
              document.body.appendChild(overlay);

              overlay.querySelector('#light-mode-cancel').addEventListener('click', function() {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.2s';
                setTimeout(function() { overlay.remove(); }, 200);
              });
              overlay.addEventListener('click', function(ev) {
                if (ev.target === overlay) {
                  overlay.style.opacity = '0';
                  overlay.style.transition = 'opacity 0.2s';
                  setTimeout(function() { overlay.remove(); }, 200);
                }
              });

              overlay.querySelector('#light-mode-confirm').addEventListener('click', function() {
                overlay.remove();
                var noBang = overlay.querySelector('#light-mode-nobang').checked;
                if (noBang) {
                  updateSettings('noFlashbang', true);
                }
                if (!noBang) {
                  var settings = window.store.getState().settings;
                  if (!settings || !settings.noFlashbang) {
                    // Deploy the flashbang 💥
                    var flash = document.createElement('div');
                    flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:999999;opacity:1;transition:opacity 0.8s ease;pointer-events:none;';
                    document.body.appendChild(flash);
                    setTimeout(function() {
                      flash.style.opacity = '0';
                      setTimeout(function() { flash.remove(); }, 800);
                    }, 400);
                  }
                }
                // Apply the theme
                updateSettings('theme', 'light');
                if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
              });
              return;
            }

            updateSettings('theme', e.target.value);
            content.querySelectorAll('input[name="theme"]').forEach(function(r) {
              r.parentElement.style.borderColor = 'var(--border-subtle)';
            });
            e.target.parentElement.style.borderColor = 'var(--accent-primary)';
            if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
          }
        });
      });

      content.querySelector('#theme-custom-trigger').addEventListener('click', function(e) {
        e.stopPropagation();
        var menu = content.querySelector('#theme-custom-menu');
        var arrow = content.querySelector('#theme-custom-arrow');
        var isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
        if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
      });

      content.querySelectorAll('.theme-custom-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var val = btn.dataset.value;
          updateSettings('theme', val);
          if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
        });
      });

      var customColorsBtn = content.querySelector('#theme-custom-colors-btn');
      if (customColorsBtn) {
        customColorsBtn.addEventListener('click', function() {
          if (window.CustomThemeModal) window.CustomThemeModal.open();
        });
      }

      var useCustomBtn = content.querySelector('#theme-use-custom-btn');
      if (useCustomBtn) {
        useCustomBtn.addEventListener('click', function() {
          updateSettings('theme', 'custom');
          if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
        });
      }

      content.querySelector('#set-font').addEventListener('change', function(e) { updateSettings('fontSize', e.target.value); });
      content.querySelector('#set-bubbles').addEventListener('change', function(e) { updateSettings('messageBubbles', e.target.value.split(' ')[0]); });
      content.querySelector('#set-zoom').addEventListener('input', function(e) {
        var val = e.target.value;
        document.getElementById('zoom-val-label').textContent = val + '%';
        var scaleEl = document.getElementById('zoom-preview-label');
        if (scaleEl) scaleEl.textContent = val + '%';
        var preview = document.getElementById('zoom-preview');
        if (preview) preview.style.transform = 'scale(' + (val / 100) + ')';
      });
      content.querySelector('#set-zoom').addEventListener('change', function(e) {
        var val = parseInt(e.target.value);
        updateSettings('appZoom', val);
        if (window.Toast) {
          window.Toast.show('Zoom Changed', 'Restart the app to apply the new zoom level.', 'info', 5000);
        }
      });
      content.querySelector('#set-anim-speed').addEventListener('change', function(e) { updateSettings('animSpeed', e.target.value); });
      content.querySelector('#set-anim').addEventListener('change', function(e) { updateSettings('animations', e.target.checked); });
      content.querySelector('#set-reduce-motion').addEventListener('change', function(e) { updateSettings('reduceMotion', e.target.checked); });
      content.querySelector('#set-classic-bubbles').addEventListener('change', function(e) { updateSettings('classicBubbles', e.target.checked); });
      var nobangEl = content.querySelector('#set-nobang');
      if (nobangEl) {
        nobangEl.addEventListener('change', function(e) {
          updateSettings('noFlashbang', e.target.checked);
        });
      }
      content.querySelector('#set-msg-anim').addEventListener('change', function(e) { updateSettings('messageAnim', e.target.value); });
      content.querySelector('#set-24h').addEventListener('change', function(e) { updateSettings('timeFormat24', e.target.checked); });

      // ⚠ The look toggle's handler moved with its markup — it is in the advanced
      // branch now, under Experimental Features. Look for `#set-new-ui` there; it
      // is not an Appearance control any more.
      content.querySelector('#set-translate').addEventListener('change', function(e) {
        updateSettings('messageTranslate', e.target.checked);
        updateSettings('experimentalMessageTranslate', e.target.checked);
        var opts = content.querySelector('#translate-options');
        if (opts) opts.style.display = e.target.checked ? '' : 'none';
      });
      content.querySelector('#set-translate-lang').addEventListener('change', function(e) {
        updateSettings('translateTargetLang', e.target.value);
      });
      content.querySelector('#set-translate-autodetect').addEventListener('change', function(e) {
        updateSettings('autoDetectSource', e.target.checked);
      });
      var uploadBtn = content.querySelector('#btn-upload-wallpaper');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', function() {
          var input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/png, image/jpeg, image/webp, image/gif';
          input.onchange = function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(evt) {
              updateSettings('chatWallpaper', evt.target.result);
              if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
            };
            reader.readAsDataURL(file);
          };
          input.click();
        });
      }
      var clearBtn = content.querySelector('#btn-clear-wallpaper');
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          updateSettings('chatWallpaper', null);
          if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
        });
      }

      content.querySelector('#set-pattern').addEventListener('change', function(e) { updateSettings('bgPattern', e.target.value); });
      content.querySelector('#set-enter-send').addEventListener('change', function(e) { updateSettings('enterToSend', e.target.checked); });
      content.querySelector('#set-chat-avatars').addEventListener('change', function(e) { updateSettings('showChatAvatars', e.target.checked); });
      if (content.querySelector('#set-group-created')) {
        content.querySelector('#set-group-created').addEventListener('change', function(e) { updateSettings('showGroupCreated', e.target.checked); });
      }
      content.querySelector('#set-image-previews').addEventListener('change', function(e) { updateSettings('showImagePreviews', e.target.checked); });
      content.querySelector('#set-link-previews').addEventListener('change', function(e) { updateSettings('showLinkPreviews', e.target.checked); });
      content.querySelector('#set-compact-spacing').addEventListener('change', function(e) { updateSettings('experimentalCompactSpacing', e.target.checked); });
      content.querySelector('#set-swipe-reply').addEventListener('change', function(e) { updateSettings('swipeToReply', e.target.checked); });
      content.querySelectorAll('.sidebar-btn-toggle').forEach(function(cb) {
        cb.addEventListener('change', function(e) {
          var btns = Object.assign({}, window.store.getState().settings.sidebarButtons || {});
          btns[e.target.dataset.btn] = e.target.checked;
          updateSettings('sidebarButtons', btns);
          if (window.SidebarLeft) { window.SidebarLeft.render(); window.SidebarLeft.attachEvents(); window.SidebarLeft.renderAvatar(window.store.getState().currentUser); }
        });
      });

      // Export Theme
      content.querySelector('#btn-export-theme').addEventListener('click', function() {
        var s = window.store.getState().settings || {};
        var themeData = {
          theme: s.theme || 'auto',
          messageBubbles: s.messageBubbles || 'Modern',
          fontSize: s.fontSize || 'Medium',
          animations: s.animations !== false,
          animSpeed: s.animSpeed || 'normal',
          reduceMotion: s.reduceMotion || false,
          timeFormat24: s.timeFormat24 || false,
          messageAnim: s.messageAnim || 'slide',
          bgPattern: s.bgPattern || 'None',
          appZoom: s.appZoom || 100,
          chatWallpaper: s.chatWallpaper || null,
          sidebarButtons: s.sidebarButtons || null,
          customColors: s.customColors || null
        };
        var blob = new Blob([JSON.stringify(themeData, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'orbit-theme.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });

      // Import Theme
      content.querySelector('#btn-import-theme').addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function(e) {
          var file = e.target.files[0];
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function(evt) {
            try {
              var themeData = JSON.parse(evt.target.result);
              var validKeys = ['theme', 'messageBubbles', 'fontSize', 'animations', 'animSpeed', 'reduceMotion', 'noFlashbang', 'timeFormat24', 'messageAnim', 'bgPattern', 'appZoom', 'chatWallpaper', 'sidebarButtons', 'customColors'];
              validKeys.forEach(function(key) {
                if (key in themeData) {
                  updateSettings(key, themeData[key]);
                }
              });
              if (window.Toast) window.Toast.show('Theme Imported', 'Theme settings applied successfully.');
              if (window.SettingsModal) window.SettingsModal.renderTab('appearance');
            } catch(err) {
              if (window.Toast) window.Toast.show('Import Error', 'Invalid theme file: ' + err.message);
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
      
    } else if (tabName === 'network') {
      var n = state.networkSettings;
      var peerCount = state.friends ? state.friends.filter(function(f) { return f.status === 'online'; }).length : 0;
      var totalPeers = state.friends ? state.friends.length : 0;
      var groupCount = state.groups ? state.groups.length : 0;

      var collapsible = function(title, icon, bodyHtml, open) {
        return '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="' + icon + '" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">' + title + '</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:' + (open ? 'block' : 'none') + ';">' +
            '<div style="padding:4px 16px 16px;">' + bodyHtml + '</div>' +
          '</div>' +
        '</div>';
      };

      var selectRow = function(id, label, opts, current) {
        var html = '<div style="padding:8px 0 4px;"><label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">' + label + '</label>' +
          '<select id="' + id + '" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:13px;outline:none;cursor:pointer;">';
        for (var i = 0; i < opts.length; i++) {
          html += '<option value="' + opts[i].val + '"' + (String(current) === String(opts[i].val) ? ' selected' : '') + '>' + opts[i].label + '</option>';
        }
        html += '</select></div>';
        return html;
      };

      var inputRow = function(id, label, val, unit) {
        return '<div style="padding:8px 0 4px;"><label for="' + id + '" style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">' + label + '</label>' +
          '<div style="display:flex;align-items:center;gap:8px;"><input id="' + id + '" type="number" value="' + val + '" style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:13px;outline:none;">' +
          (unit ? '<span style="font-size:12px;color:var(--text-muted);min-width:30px;">' + unit + '</span>' : '') +
          '</div></div>';
      };

      var toggleRow = function(id, label, desc, checked) {
        return '<label style="display:flex;align-items:center;gap:12px;padding:10px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
          '<input id="' + id + '" type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
          '<div><div>' + label + '</div>' + (desc ? '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">' + desc + '</div>' : '') + '</div></label>';
      };

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Network</h3>' +

        // Dashboard
        '<div style="margin-bottom:20px;">' +
          '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0 0 12px;">Dashboard</h4>' +
          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;">' +
            '<div style="padding:14px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:26px;font-weight:700;color:var(--accent-success);">' + peerCount + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Online Peers</div>' +
            '</div>' +
            '<div style="padding:14px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:26px;font-weight:700;color:var(--accent-primary);">' + totalPeers + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Total Friends</div>' +
            '</div>' +
            '<div style="padding:14px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:26px;font-weight:700;color:var(--accent-warning);">' + groupCount + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Groups</div>' +
            '</div>' +
            '<div style="padding:14px;background:var(--bg-base);border-radius:10px;text-align:center;border:1px solid var(--border-subtle);">' +
              '<div style="font-size:26px;font-weight:700;' + (n.mode === 'LAN Auto-Discovery' ? 'color:var(--text-primary);' : 'color:var(--accent-primary);') + '">' + (n.mode === 'LAN Auto-Discovery' ? 'LAN' : 'Custom') + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Network Mode</div>' +
            '</div>' +
          '</div>' +
          // Peer list
          '<div style="padding:12px 14px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
            '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Online Peers</div>' +
            (peerCount === 0
              ? '<div style="display:flex;flex-direction:column;align-items:center;padding:16px 0;color:var(--text-muted);gap:8px;"><i data-lucide="radio" style="width:28px;height:28px;opacity:0.3;"></i><div style="font-size:13px;">No peers online</div></div>'
              : '<div style="display:flex;flex-direction:column;gap:5px;">' + state.friends.filter(function(f) { return f.status === 'online'; }).map(function(f) {
                return '<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;background:var(--bg-surface);">' +
                  // ⚠ `var(--presence-online)`, not a hardcoded #22c55e — that hex was
                  // the third copy of the presence palette and the one that ignored the
                  // theme outright. See the note on --presence-* in variables.css.
                  // The glyph rather than a bare dot, so this row and the chat header
                  // say "online" the same way.
                  window.OrbitPresence.glyph('online', 10) +
                  '<span style="font-size:13px;color:var(--text-primary);flex:1;">' + window.Sanitize.escapeHtml(f.username) + '</span>' +
                  '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">' + (f.ip || '') + '</span>' +
                '</div>';
              }).join('') + '</div>'
            ) +
          '</div>' +
        '</div>' +

        // Network Map Visualizer
        collapsible('Network Map', 'share-2',
          '<div style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:8px;">Interactive view of connected peers</div>' +
          '<div id="network-map-container" style="width:100%;height:240px;background:var(--bg-surface);border-radius:8px;border:1px solid var(--border-subtle);position:relative;overflow:hidden;">' +
            '<canvas id="network-map-canvas" style="width:100%;height:100%;"></canvas>' +
          '</div>',
          false
        ) +

        // Settings sections
        '<h4 style="font-size:14px;font-weight:600;color:var(--text-primary);margin:0 0 12px;">Settings</h4>' +

        // Connection
        collapsible('Connection', 'cable', 
          selectRow('net-mode', 'Network Mode', [{val:'LAN Auto-Discovery',label:'LAN Auto-Discovery'},{val:'Custom IP',label:'Custom IP'}], n.mode) +
          selectRow('net-timeout', 'Connection Timeout', [{val:5,label:'5 seconds'},{val:10,label:'10 seconds'},{val:30,label:'30 seconds'},{val:60,label:'60 seconds'}], n.netTimeout) +
          selectRow('net-keepalive', 'Keep-Alive Interval', [{val:10,label:'10 seconds'},{val:30,label:'30 seconds'},{val:60,label:'60 seconds'},{val:120,label:'2 minutes'}], n.netKeepAlive) +
          toggleRow('net-reconnect', 'Auto-Reconnect', 'Automatically retry connection on disconnect', n.netAutoReconnect) +
          '<div id="net-reconnect-opts" style="padding:0 0 8px 24px;display:' + (n.netAutoReconnect ? 'block' : 'none') + ';">' +
            inputRow('net-reconnect-interval', 'Reconnect Interval', n.netReconnectInterval, 's') +
          '</div>',
          true
        ) +

        // Ports & Transfer
        collapsible('Ports & Transfer', 'server',
          inputRow('net-udp', 'UDP Discovery Port', n.udpPort) +
          inputRow('net-tcp', 'TCP Connection Port', n.tcpPort) +
          inputRow('net-size', 'Max File Transfer Size', n.maxFileSize, 'MB') +
          '<div style="border-top:1px solid var(--border-subtle);margin:8px 0;"></div>' +
          inputRow('net-bandwidth', 'Bandwidth Limit', n.netBandwidthLimit, 'KB/s') +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Set to 0 for unlimited transfer speed</div>',
          false
        ) +

        // Advanced
        collapsible('Advanced', 'settings-2',
          toggleRow('net-rtc', 'Enable WebRTC Fallback', 'Use WebRTC when direct connection fails', n.webrtcFallback) +
          selectRow('net-log', 'Connection Log Level', [{val:'None',label:'None'},{val:'Error',label:'Error'},{val:'Info',label:'Info'},{val:'Debug',label:'Debug'}], n.logLevel) +
          '<div style="padding-top:8px;"><button id="net-clear" style="padding:10px 24px;background:transparent;color:var(--accent-danger);border-radius:8px;border:1px solid var(--accent-danger);font-weight:600;cursor:pointer;width:fit-content;">Clear Network Cache</button></div>',
          false
        );

      if (window.lucide) window.lucide.createIcons({ root: content });

      var canvasContainer = content.querySelector('#network-map-container');
      if (canvasContainer) {
        var ro = new ResizeObserver(function(entries) {
          if (entries[0].contentRect.width > 0) {
            var canvas = content.querySelector('#network-map-canvas');
            if (!canvas) return;
            // Backing store sized at devicePixelRatio; draw in CSS px via setTransform
            var dpr = window.devicePixelRatio || 1;
            canvas.width = Math.round(entries[0].contentRect.width * dpr);
            canvas.height = Math.round(entries[0].contentRect.height * dpr);
            window.SettingsModal._mapDpr = dpr;
            window.SettingsModal._drawNetworkMap();
          }
        });
        ro.observe(canvasContainer);
      }

      var updateNetwork = function(key, val) {
        var newNet = { ...window.store.getState().networkSettings };
        newNet[key] = val;
        window.store.setState({ networkSettings: newNet });
        window.Storage.set('networkSettings', newNet);
      };

      content.querySelector('#net-mode').addEventListener('change', function(e) { updateNetwork('mode', e.target.value); });
      content.querySelector('#net-udp').addEventListener('change', function(e) { updateNetwork('udpPort', parseInt(e.target.value) || 45678); });
      content.querySelector('#net-tcp').addEventListener('change', function(e) { updateNetwork('tcpPort', parseInt(e.target.value) || 46000); });
      content.querySelector('#net-size').addEventListener('change', function(e) { updateNetwork('maxFileSize', parseInt(e.target.value) || 500); });
      content.querySelector('#net-rtc').addEventListener('change', function(e) { updateNetwork('webrtcFallback', e.target.checked); });
      content.querySelector('#net-log').addEventListener('change', function(e) { updateNetwork('logLevel', e.target.value); });
      content.querySelector('#net-clear').addEventListener('click', function(e) {
         var btn = e.target;
         btn.textContent = 'Clearing...';
         btn.disabled = true;
         // Reset discovery and socket connections via IPC
         if (window.orbitAPI) {
           var user = window.store ? window.store.getState().currentUser : null;
           if (user) window.orbitAPI.networkStart(user);
         }
         setTimeout(function() {
           btn.textContent = 'Clear Network Cache';
           btn.disabled = false;
           if (window.Toast) window.Toast.show('Network cache cleared', 'info');
         }, 1500);
      });
      content.querySelector('#net-timeout').addEventListener('change', function(e) { updateNetwork('netTimeout', parseInt(e.target.value, 10) || 30); });
      content.querySelector('#net-keepalive').addEventListener('change', function(e) { updateNetwork('netKeepAlive', parseInt(e.target.value, 10) || 30); });
      content.querySelector('#net-reconnect').addEventListener('change', function(e) {
        updateNetwork('netAutoReconnect', e.target.checked);
        var opts = content.querySelector('#net-reconnect-opts');
        if (opts) opts.style.display = e.target.checked ? 'block' : 'none';
        if (window.orbitAPI && window.orbitAPI.networkSetReconnect) {
          window.orbitAPI.networkSetReconnect(e.target.checked);
        }
      });
      content.querySelector('#net-reconnect-interval').addEventListener('change', function(e) {
        var val = parseInt(e.target.value, 10) || 10;
        updateNetwork('netReconnectInterval', val);
        if (window.orbitAPI && window.orbitAPI.networkSetReconnect) {
          var enabled = document.querySelector('#net-reconnect')?.checked ?? true;
          window.orbitAPI.networkSetReconnect(enabled, val * 1000);
        }
      });
      content.querySelector('#net-bandwidth').addEventListener('change', function(e) { updateNetwork('netBandwidthLimit', parseInt(e.target.value, 10) || 0); });
    } else if (tabName === 'notifications') {
      var s = state.settings;
      var dndActive = s.notifyDnd;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Notifications</h3>' +

        // DND status banner
        (dndActive
          ? '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;margin-bottom:16px;">' +
              '<i data-lucide="moon" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;"></i>' +
              '<span style="font-size:13px;color:#ef4444;font-weight:500;">Do Not Disturb is enabled — all notifications are muted.</span>' +
            '</div>'
          : ''
        ) +

        // Section: General
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="bell" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">General</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:block;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;border-bottom:1px solid var(--border-subtle);">' +
                '<input id="notify-preview" type="checkbox" '+(s.notifyPreview?'checked':'')+'>' +
                '<div><div>Message Previews</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Show message content in notification toasts</div></div>' +
              '</label>' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-dnd" type="checkbox" '+(s.notifyDnd?'checked':'')+'>' +
                '<div><div>Do Not Disturb</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Mute all notification sounds and toasts</div></div>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Group Notifications
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="users-round" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Groups</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-mentions" type="checkbox" '+(s.notifyGroupMentions?'checked':'')+'>' +
                '<div><div>@Mentions Only</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Only receive notifications when you\'re @mentioned in groups</div></div>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Sound
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="volume-2" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Sound</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
                '<input id="notify-sound" type="checkbox" '+(s.notifySound?'checked':'')+'>' +
                '<div><div>Play Sound</div><div style="font-size:12px;color:var(--text-muted);font-weight:400;">Play a notification sound when new messages arrive</div></div>' +
                '<button id="btn-test-sound" style="margin-left:auto;padding:6px 12px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-secondary);cursor:pointer;font-size:11px;">Test</button>' +
              '</label>' +

              // Volume slider
              '<div style="padding:8px 0 4px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
                  '<label style="font-size:13px;color:var(--text-primary);font-weight:500;">Volume</label>' +
                  '<span id="volume-value" style="font-size:12px;color:var(--text-muted);min-width:32px;text-align:right;">' + (s.notifyVolume != null ? s.notifyVolume : 80) + '%</span>' +
                '</div>' +
                '<input id="notify-volume" type="range" min="0" max="100" value="' + (s.notifyVolume != null ? s.notifyVolume : 80) + '" style="width:100%;height:4px;accent-color:var(--accent-primary);cursor:pointer;">' +
              '</div>' +

              // Sound type select
              '<div style="padding:8px 0 4px;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
                  '<label for="notify-sound-type" style="font-size:13px;color:var(--text-primary);font-weight:500;">Sound</label>' +
                '</div>' +
                '<select id="notify-sound-type" style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;cursor:pointer;">' +
                  '<option value="chime"' + (s.notifySoundType === 'chime' ? ' selected' : '') + '>Chime</option>' +
                  '<option value="pop"' + (s.notifySoundType === 'pop' ? ' selected' : '') + '>Pop</option>' +
                  '<option value="gentle"' + (s.notifySoundType === 'gentle' ? ' selected' : '') + '>Gentle</option>' +
                  '<option value="classic"' + (s.notifySoundType === 'classic' ? ' selected' : '') + '>Classic</option>' +
                '</select>' +
              '</div>' +

            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        // Record undo/redo action
        if (window.UndoManager && !window.UndoManager._paused) {
          var _oldVal = window.store.getState().settings[key];
          var _key = key;
          var _newVal = val;
          if (_oldVal !== _newVal) {
            window.UndoManager.pushAction('Change ' + _key, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _oldVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            }, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _newVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            });
          }
        }
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      function refreshDndBanner() {
        var isDnd = content.querySelector('#notify-dnd').checked;
        var existing = content.querySelector('.dnd-banner');
        if (isDnd && !existing) {
          var banner = document.createElement('div');
          banner.className = 'dnd-banner';
          banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:10px;margin-bottom:16px;';
          banner.innerHTML = '<i data-lucide="moon" style="width:18px;height:18px;color:#ef4444;flex-shrink:0;"></i><span style="font-size:13px;color:#ef4444;font-weight:500;">Do Not Disturb is enabled — all notifications are muted.</span>';
          content.insertBefore(banner, content.querySelector('.settings-collapsible'));
          if (window.lucide) window.lucide.createIcons({ root: banner });
        } else if (!isDnd && existing) {
          existing.remove();
        }
      }

      content.querySelector('#notify-sound').addEventListener('change', function(e) { updateSettings('notifySound', e.target.checked); });
      content.querySelector('#btn-test-sound').addEventListener('click', function(e) {
        e.stopPropagation();
        if (window.NotificationSound) {
          var volInput = content.querySelector('#notify-volume');
          var typeInput = content.querySelector('#notify-sound-type');
          window.NotificationSound.play({
            volume: volInput ? parseInt(volInput.value, 10) : 80,
            type: typeInput ? typeInput.value : 'chime'
          });
        }
      });
      content.querySelector('#notify-preview').addEventListener('change', function(e) { updateSettings('notifyPreview', e.target.checked); });
      content.querySelector('#notify-mentions').addEventListener('change', function(e) { updateSettings('notifyGroupMentions', e.target.checked); });
      content.querySelector('#notify-dnd').addEventListener('change', function(e) { updateSettings('notifyDnd', e.target.checked); refreshDndBanner(); });
      content.querySelector('#notify-volume').addEventListener('input', function(e) {
        updateSettings('notifyVolume', parseInt(e.target.value, 10));
        var valDisplay = content.querySelector('#volume-value');
        if (valDisplay) valDisplay.textContent = e.target.value + '%';
      });
      content.querySelector('#notify-sound-type').addEventListener('change', function(e) { updateSettings('notifySoundType', e.target.value); });
      
    } else if (tabName === 'security') {
      if (!state.settings.enableExperimental) {
        content.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:8px;padding:40px;">' +
          '<i data-lucide="lock" style="width:32px;height:32px;opacity:0.3;"></i>' +
          '<div style="font-size:15px;font-weight:600;color:var(--text-secondary);">Experimental Features Disabled</div>' +
          '<div style="font-size:13px;line-height:1.5;">Enable "Experimental Features" in Advanced settings to access Security options.</div>' +
        '</div>';
        return;
      }
      (function() {
        var pinEnabled = window.orbitAPI ? window.orbitAPI.pinStatus() : false;
        var html =
          '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:8px;">Security <span style="display:inline-block;font-size:8px;font-weight:700;color:#fff;background:var(--accent-warning);border-radius:3px;padding:1px 5px;text-transform:uppercase;line-height:1.4;vertical-align:middle;margin-left:6px;">EXPERIMENTAL</span></h3>' +
          '<div style="font-size:13px;color:var(--text-muted);margin-bottom:24px;line-height:1.5;">Manage your account security settings.</div>' +

          '<div style="background:var(--bg-base);border-radius:12px;padding:20px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
              '<div>' +
                '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">App Lock (PIN)</div>' +
                '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Protect Orbit with a PIN code on launch</div>' +
              '</div>' +
              // ⚠ One shared switch — geometry, off-colour and knob travel all live
              // in §9c of styles/redesign.css. State comes from `checked`, so the
              // handler below no longer repaints anything by hand.
              '<label class="orbit-switch">' +
                '<input type="checkbox" id="pin-toggle"' + (pinEnabled ? ' checked' : '') + '>' +
                '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
              '</label>' +
            '</div>' +
            (pinEnabled
              ? '<div id="pin-change-area" style="border-top:1px solid var(--border-subtle);padding-top:16px;">' +
                  '<button id="btn-change-pin" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);font-size:13px;font-weight:500;cursor:pointer;transition:background 0.15s;">Change PIN</button>' +
                '</div>'
              : '<div id="pin-setup-area">' +
                  '<div style="margin-bottom:12px;">' +
                    '<label style="font-size:13px;font-weight:500;color:var(--text-secondary);display:block;margin-bottom:6px;">Set PIN (4-8 digits)</label>' +
                    '<input id="pin-new" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Enter PIN" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-hover);color:var(--text-primary);font-size:15px;outline:none;box-sizing:border-box;letter-spacing:4px;text-align:center;">' +
                  '</div>' +
                  '<div style="margin-bottom:16px;">' +
                    '<label style="font-size:13px;font-weight:500;color:var(--text-secondary);display:block;margin-bottom:6px;">Confirm PIN</label>' +
                    '<input id="pin-confirm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Re-enter PIN" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-hover);color:var(--text-primary);font-size:15px;outline:none;box-sizing:border-box;letter-spacing:4px;text-align:center;">' +
                  '</div>' +
                  '<div id="pin-setup-error" style="font-size:12px;color:var(--accent-danger);margin-bottom:8px;min-height:16px;"></div>' +
                  '<button id="btn-save-pin" style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent-primary);color:white;font-size:13px;font-weight:500;cursor:pointer;transition:opacity 0.15s;">Save PIN</button>' +
                '</div>'
            ) +
          '</div>' +

          '<div style="margin-top:16px;padding:16px;background:var(--accent-soft);border-radius:12px;border:1px solid var(--accent-primary);">' +
            '<div style="font-size:12px;color:var(--text-muted);line-height:1.5;">' +
              '<strong style="color:var(--accent-primary);">Note:</strong> PIN lock is an experimental feature. It protects access to Orbit on this device but does not encrypt your messages or data. ' +
              'If you forget your PIN, use "Forgot PIN" on the lock screen to reset it (your account data stays intact).' +
            '</div>' +
          '</div>';

        content.innerHTML = html;

        // Toggle switch
        var toggle = content.querySelector('#pin-toggle');
        if (toggle) {
          toggle.addEventListener('change', function() {
            if (this.checked) {
              // Enabling — show setup area
              var area = content.querySelector('#pin-setup-area');
              var changeArea = content.querySelector('#pin-change-area');
              if (area) area.style.display = 'block';
              if (changeArea) changeArea.style.display = 'none';
              // Re-render to show setup fields
              window.SettingsModal.renderTab('security');
            } else {
              // Disabling — require current PIN
              var currentPin = prompt('Enter your current PIN to disable App Lock:');
              if (currentPin && window.orbitAPI) {
                var ok = window.orbitAPI.pinDisable(currentPin);
                if (ok) {
                  window.SettingsModal.renderTab('security');
                } else {
                  alert('Incorrect PIN. App Lock remains enabled.');
                  this.checked = true;
                }
              } else {
                this.checked = true;
              }
            }
          });
        }

        // Save PIN
        var saveBtn = content.querySelector('#btn-save-pin');
        if (saveBtn) {
          saveBtn.addEventListener('click', function() {
            var pinNew = content.querySelector('#pin-new').value.replace(/\D/g, '');
            var pinConfirm = content.querySelector('#pin-confirm').value.replace(/\D/g, '');
            var errorEl = content.querySelector('#pin-setup-error');

            if (pinNew.length < 4) {
              errorEl.textContent = 'PIN must be at least 4 digits.';
              return;
            }
            if (pinNew !== pinConfirm) {
              errorEl.textContent = 'PINs do not match.';
              return;
            }
            if (window.orbitAPI) {
              window.orbitAPI.pinSet(pinNew);
              window.SettingsModal.renderTab('security');
            }
          });
        }

        // Change PIN
        var changeBtn = content.querySelector('#btn-change-pin');
        if (changeBtn) {
          changeBtn.addEventListener('click', function() {
            var currentPin = prompt('Enter your current PIN:');
            if (!currentPin) return;
            var newPin = prompt('Enter new PIN (4-8 digits):');
            if (!newPin) return;
            var confirmNew = prompt('Confirm new PIN:');
            if (!confirmNew) return;
            newPin = newPin.replace(/\D/g, '');
            confirmNew = confirmNew.replace(/\D/g, '');
            if (newPin.length < 4) { alert('PIN must be at least 4 digits.'); return; }
            if (newPin !== confirmNew) { alert('PINs do not match.'); return; }
            // Verify current PIN first
            if (window.orbitAPI) {
              var valid = window.orbitAPI.pinVerify(currentPin);
              if (!valid) { alert('Current PIN is incorrect.'); return; }
              window.orbitAPI.pinSet(newPin);
              window.SettingsModal.renderTab('security');
            }
          });
        }
      })();

    } else if (tabName === 'advanced') {
      var s = state.settings || {};

      var toggleRow = function(id, label, desc, checked) {
        return '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
          '<input id="' + id + '" type="checkbox" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
          '<div><div>' + label + '</div>' +
          (desc ? '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">' + desc + '</div>' : '') +
          '</div></label>';
      };

      var gatedToggleRow = function(id, label, desc, checked, enabled) {
        if (enabled) return toggleRow(id, label, desc, checked);
        return '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-muted);cursor:not-allowed;opacity:0.5;">' +
          '<input id="' + id + '" type="checkbox" style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:not-allowed;" disabled>' +
          '<div><div>' + label + '</div>' +
          (desc ? '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">Enable developer mode to access this setting.</div></div>' : '</div>') +
          '</label>';
      };

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Advanced</h3>' +

        // Warning banner
        '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:10px;margin-bottom:16px;">' +
          '<i data-lucide="alert-triangle" style="width:18px;height:18px;color:#f59e0b;flex-shrink:0;"></i>' +
          '<span style="font-size:13px;color:#f59e0b;font-weight:500;">These settings are intended for debugging and development. Changing them may affect performance and stability.</span>' +
        '</div>' +

        // Section: Developer Tools
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="terminal" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Developer Tools</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:block;">' +
            '<div style="padding:4px 16px 16px;">' +
              toggleRow('adv-dev-mode', 'Developer Mode', 'Enable developer tools and instrumentation.', s.devMode) +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Experimental Features
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="flask-round" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Experimental Features</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          // ⚠ EXPANDED BY DEFAULT, like Developer Tools above it. It used to be
          // collapsed unless Developer Mode was on, which was fine while every row
          // inside was dev-only — but the look switch is not, and a section
          // that starts collapsed is a section nobody opens. The rows themselves
          // are still gated; only the default has changed.
          '<div class="collapsible-body" style="display:block;">' +
            '<div style="padding:4px 16px 16px;">' +
              // ⚠ FIRST, AND DELIBERATELY NOT GATED. Every other row in here is
              // disabled until Developer Mode is on. This one has to work for
              // anyone — it is how you try the redesign, and how you get back out
              // of it. Gating it behind Developer Mode would hide it from exactly
              // the people it is for.
              //
              // ⚠ IT IS LABELLED FROM THE BETA'S SIDE, AND THE DEFAULT IS OFF.
              // Dan: "the new redesign is the beta look! the classic is the
              // original UI! so by default, that toggle should be on (on to show
              // the classic UI look!)". The original UI is what the app opens on,
              // so the switch that turns the beta ON is the one that has to be
              // off — and the BETA badge belongs on this row rather than on a row
              // called "Classic look", where it read as if classic were the beta.
              '<label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;cursor:pointer;">' +
                '<div>' +
                  '<div style="font-size:14px;color:var(--text-primary);">New look' + betaBadge + '</div>' +
                  '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">The redesigned UI. Still being improved, so the original look stays the default.</div>' +
                '</div>' +
                // ⚠ A <span>, not a <label>: the row IS the label, and a label inside
                // a label is invalid. See §9c in components.css.
                '<span class="orbit-switch">' +
                  '<input type="checkbox" id="set-new-ui"' + (s.newUI === true ? ' checked' : '') + '>' +
                  '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
                '</span>' +
              '</label>' +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              gatedToggleRow('adv-experimental', 'Experimental Features' + experimentalBadge, 'Enable experimental features that may be unstable.', s.enableExperimental, s.devMode) +
              (s.enableExperimental && s.devMode
                ? '<div style="border-top:1px solid var(--border-subtle);margin-top:4px;"></div>' +
                  '<div style="padding-top:4px;">' +
                    gatedToggleRow('adv-custom-colors', 'Custom Colors' + experimentalBadge, 'Customize UI colors with a live preview editor.', s.enableCustomColors, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-animated-avatars', 'Animated Avatars' + experimentalBadge, 'Subtle pulse animation on user avatars.', s.experimentalAnimatedAvatars, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-message-fx', 'Enhanced Message FX' + experimentalBadge, 'Sparkle effect on newly sent messages.', s.experimentalMessageFx, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-fps-monitor', 'FPS Monitor' + experimentalBadge, 'Display real-time frame rate counter.', s.experimentalFpsMonitor, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-dev-overlay', 'Developer Overlay' + experimentalBadge, 'Show connection stats and debug info overlay.', s.experimentalDevOverlay, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-perf-mode', 'Performance Mode' + experimentalBadge, 'Kill animations, disable link previews, reduce background CPU.', s.experimentalPerformanceMode, true) +
                    '<div style="border-top:1px solid var(--border-subtle);"></div>' +
                    gatedToggleRow('adv-folders', 'Chat Folders' + experimentalBadge, 'Organize chats into custom folders.', s.experimentalFolders, true) +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Debug & Diagnostics
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="search" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Debug & Diagnostics</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="display:none;">' +
            '<div style="padding:4px 16px 16px;">' +
              // ⚠ FIRST HERE, and it is the one that decides whether the terminal
              // is usable at all. Every main-process log line — discovery beacons,
              // socket events, duration probes, the database migration — goes
              // through the gate this drives (src/js/log.js). Off by default.
              gatedToggleRow('adv-debug-logs', 'Debug Logs', 'Print main-process logs to the terminal. Needs Developer Mode.', s.debugLogs, s.devMode) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              gatedToggleRow('adv-debug-display', 'Debug Display', 'Show debug overlays on messages, search results, and UI components.', s.debugDisplay, s.devMode) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              gatedToggleRow('adv-show-msg-ids', 'Show Message IDs', 'Display internal message IDs below each message.', s.showMessageIds, s.devMode) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              gatedToggleRow('adv-log-packets', 'Log Network Packets', 'Log all incoming and outgoing network packets to the console.', s.logNetworkPackets, s.devMode) +
              '<div style="border-top:1px solid var(--border-subtle);"></div>' +
              gatedToggleRow('adv-conn-stats', 'Show Connection Stats', 'Display live connection statistics overlay.', s.showConnectionStats, s.devMode) +
            '</div>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var updateSettings = function(key, val) {
        // Record undo/redo action
        if (window.UndoManager && !window.UndoManager._paused) {
          var _oldVal = window.store.getState().settings[key];
          var _key = key;
          var _newVal = val;
          if (_oldVal !== _newVal) {
            window.UndoManager.pushAction('Change ' + _key, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _oldVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            }, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _newVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            });
          }
        }
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      // The "New look" toggle — the beta redesign. It is the first row under
      // Experimental Features, and it is off by default.
      //
      // ⚠⚠ IT CONFIRMS FIRST, AND THE SWITCH GOES BACK IMMEDIATELY. Changing the
      // look restarts the app, so this is not a control that may act on the click:
      // a switch that moves and then asks permission is showing a state that is not
      // saved. It is put back at once, and only a confirmed choice — followed by the
      // restart that applies it — may move it.
      //
      // ⚠ It does NOT go through updateSettings. That funnels into the store, whose
      // subscription repaints the window through applySettings — so the UI would
      // change under the user and *then* the app would close. See commitLook.
      var lookToggle = content.querySelector('#set-new-ui');
      if (lookToggle) {
        lookToggle.addEventListener('change', function(e) {
          var wantNewLook = e.target.checked;
          e.target.checked = !wantNewLook;

          // ⚠ A restart ends a call, and the dialog is the only place that can say
          // so. `CallManager.activeCall` is set on every call start — outgoing,
          // incoming, 1:1 and group, and a call that is still RINGING — and cleared
          // in the single cleanup(), so it is the one honest signal for this. The
          // confirm turns red when it applies, because the consequence is no longer
          // just a restart.
          var inCall = !!(window.CallManager && window.CallManager.activeCall);

          window.ConfirmModal.show({
            title: wantNewLook ? 'Switch to the new look?' : 'Switch back to the original look?',
            message: 'Orbit will close and reopen to apply it. Nothing else changes — your messages, accounts and settings are untouched.'
              + (inCall ? ' You are in a call right now, and restarting will end it.' : ''),
            confirmText: inCall ? 'End call and restart' : 'Restart now',
            cancelText: 'Not now',
            danger: inCall,
            onConfirm: function() {
              if (window.OrbitRedesign) window.OrbitRedesign.commitLook(wantNewLook);
            }
          });
        });
      }

      content.querySelector('#adv-dev-mode').addEventListener('change', function(e) {
        if (!e.target.checked) {
          var s = { ...window.store.getState().settings };
          s.devMode = false;
          s.enableExperimental = false;
          s.enableCustomColors = false;
          s.experimentalAnimatedAvatars = false;
          s.experimentalMessageFx = false;
          s.experimentalCompactSpacing = false;
          s.experimentalFpsMonitor = false;
          s.experimentalDevOverlay = false;
          s.experimentalPerformanceMode = false;
          s.experimentalFolders = false;
          s.debugDisplay = false;
          s.debugLogs = false;
          s.showMessageIds = false;
          s.logNetworkPackets = false;
          s.showConnectionStats = false;
          window.store.setState({ settings: s });
          window.Storage.set('settings', s);
        } else {
          updateSettings('devMode', true);
        }
        if (window.SettingsModal) window.SettingsModal.renderTab('advanced');
      });
      content.querySelector('#adv-debug-logs').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) { e.target.checked = false; return; }
        updateSettings('debugLogs', e.target.checked);
      });
      content.querySelector('#adv-debug-display').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) { e.target.checked = false; return; }
        updateSettings('debugDisplay', e.target.checked);
      });
      content.querySelector('#adv-show-msg-ids').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) { e.target.checked = false; return; }
        updateSettings('showMessageIds', e.target.checked);
      });
      content.querySelector('#adv-log-packets').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) { e.target.checked = false; return; }
        updateSettings('logNetworkPackets', e.target.checked);
      });
      content.querySelector('#adv-conn-stats').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) { e.target.checked = false; return; }
        updateSettings('showConnectionStats', e.target.checked);
      });
      content.querySelector('#adv-experimental').addEventListener('change', function(e) {
        if (!window.store.getState().settings.devMode) {
          e.target.checked = false;
          if (window.Toast) window.Toast.show('Notice', 'Enable Developer Mode first to access experimental features.');
          return;
        }
        updateSettings('enableExperimental', e.target.checked);
        if (e.target.checked && window.Toast) {
          window.Toast.show('Experimental', 'Experimental features enabled. Some features may be unstable.');
        }
        // Toggle Security tab visibility in sidebar
        var secTab = window.SettingsModal.container.querySelector('.settings-tab[data-tab="security"]');
        if (e.target.checked && !secTab) {
          window.SettingsModal.render();
          var tabEl = window.SettingsModal.container.querySelector('.settings-tab[data-tab="advanced"]');
          if (tabEl) tabEl.click();
        } else if (!e.target.checked && secTab) {
          window.SettingsModal.render();
          var tabEl = window.SettingsModal.container.querySelector('.settings-tab[data-tab="advanced"]');
          if (tabEl) tabEl.click();
        } else {
          if (window.SettingsModal) window.SettingsModal.renderTab('advanced');
        }
      });

      var expToggle = function(id, key) {
        var el = content.querySelector('#' + id);
        if (el) {
          el.addEventListener('change', function(e) {
            if (!window.store.getState().settings.devMode || !window.store.getState().settings.enableExperimental) {
              e.target.checked = false;
              return;
            }
            updateSettings(key, e.target.checked);
          });
        }
      };
      expToggle('adv-custom-colors', 'enableCustomColors');
      expToggle('adv-animated-avatars', 'experimentalAnimatedAvatars');
      expToggle('adv-message-fx', 'experimentalMessageFx');
      expToggle('adv-fps-monitor', 'experimentalFpsMonitor');
      expToggle('adv-dev-overlay', 'experimentalDevOverlay');
      expToggle('adv-folders', 'experimentalFolders');
      // Performance Mode — two-step confirmation on enable
      (function() {
        var el = content.querySelector('#adv-perf-mode');
        if (el) {
          el.addEventListener('change', function(e) {
            if (!window.store.getState().settings.devMode || !window.store.getState().settings.enableExperimental) {
              e.target.checked = false;
              return;
            }
            if (!e.target.checked) {
              // Turning off — just apply
              updateSettings('experimentalPerformanceMode', false);
              return;
            }
            // Step 1: Warning modal
            if (window.ConfirmModal) {
              window.ConfirmModal.show({
                title: 'Performance Mode',
                message: 'Performance Mode disables animations, link previews, GIFs, and background tasks to reduce CPU usage. Some visual feedback will stop working while this is active.',
                confirmText: 'Continue',
                cancelText: 'Cancel',
                onConfirm: function() {
                  // Step 2: Final confirmation
                  window.ConfirmModal.show({
                    title: 'Are you sure?',
                    message: 'This will kill all CSS animations, freeze animated GIFs, disable link preview fetching, and reduce background task frequency. The app will feel less responsive visually but may use less CPU. You can turn this off at any time.',
                    confirmText: 'Enable',
                    cancelText: 'Cancel',
                    danger: true,
                    onConfirm: function() {
                      updateSettings('experimentalPerformanceMode', true);
                      window.Toast && window.Toast.show('Performance Mode', 'Performance Mode enabled. Some features are now disabled.', 'info');
                    },
                    onCancel: function() {
                      e.target.checked = false;
                    }
                  });
                },
                onCancel: function() {
                  e.target.checked = false;
                }
              });
            } else {
              updateSettings('experimentalPerformanceMode', true);
            }
          });
        }
      })();

    } else if (tabName === 'data') {
      var s = state.settings;
      var currentDelete = s.deleteAttachmentsAfter || 0;
      var presetOptions = [
        { label: 'Never', value: 0 },
        { label: '1 minute', value: 1 },
        { label: '5 minutes', value: 5 },
        { label: '10 minutes', value: 10 },
        { label: '25 minutes', value: 25 },
        { label: '60 minutes', value: 60 },
        { label: 'Custom', value: -1 }
      ];
      var isCustom = currentDelete > 0 && ![1,5,10,25,60].includes(currentDelete);
      var selectVal = isCustom ? -1 : currentDelete;
      var optionsHtml = '';
      presetOptions.forEach(function(opt) {
        optionsHtml += '<option value="' + opt.value + '"' + (selectVal === opt.value ? ' selected' : '') + '>' + opt.label + '</option>';
      });

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">Data Manager</h3>' +
        '<div style="display:flex;flex-direction:column;gap:16px;">' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Export Backup</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Export all your messages, groups, friends, settings, and avatars into a single backup file (.orzip or .zip).</div>' +
                '<div style="display:flex;gap:10px;margin-top:14px;">' +
                  '<button id="btn-backup-orzip" class="btn btn-primary" style="padding:10px 20px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;">Backup as .orzip</button>' +
                  '<button id="btn-backup-zip" class="btn btn-secondary" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Backup as .zip</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Restore from Backup</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Restore your data from a previously created backup file. This will replace all current data.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-restore" class="btn btn-danger" style="padding:10px 20px;border-radius:10px;background:var(--accent-danger);color:white;border:none;cursor:pointer;font-weight:600;">Restore Backup</button>' +
                  '<span id="restore-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Database Health</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Check your database integrity and verify all tables are healthy.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-db-health" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Run Health Check</button>' +
                  '<span id="health-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div id="db-repair-section" style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Database Repair</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Repair database integrity, rebuild indexes, and remove orphaned records.</div>' +
                '<div style="margin-top:14px;">' +
                  '<button id="btn-db-repair" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Run Repair</button>' +
                  '<span id="repair-status" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '<div id="privacy-mode-section" style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label id="privacy-mode-label" style="display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text-primary);cursor:pointer;font-weight:bold;">' +
              '<input id="set-privacy" type="checkbox" '+(s.privacyMode?'checked':'')+'> Enable Privacy Mode' +
            '</label>' +
            '<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">When enabled, attachments (images, files) are NOT saved to the database. They are only kept in a temporary folder and cleared when the app closes. Messages and profile data are still saved.</p>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label style="display:flex;align-items:center;gap:12px;font-size:16px;color:var(--text-primary);cursor:pointer;font-weight:bold;">' +
              '<input id="set-e2ee" type="checkbox" '+(s.e2eeEnabled?'checked':'')+'> Enable End-to-End Encryption' +
            '</label>' +
            '<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);">When enabled, message content is encrypted with AES-256-GCM before leaving your device. Only the intended recipient can decrypt it. Currently works for direct messages. <span style="color:var(--accent-warning);">Requires both you and the recipient to have E2EE enabled.</span></p>' +
          '</div>' +
          '<div style="padding:16px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Delete attachments after</label>' +
            '<select id="set-delete-after" style="width:100%;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
              optionsHtml +
            '</select>' +
            '<div id="custom-time-row" style="display:' + (isCustom ? 'flex' : 'none') + ';gap:8px;align-items:center;margin-top:12px;">' +
              '<input id="custom-time-value" type="number" min="1" max="1440" value="' + (isCustom ? currentDelete : 30) + '" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
              '<select id="custom-time-unit" style="padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;">' +
                '<option value="1"' + (isCustom && currentDelete < 60 ? ' selected' : '') + '>Minutes</option>' +
                '<option value="60"' + (isCustom && currentDelete >= 60 ? ' selected' : '') + '>Hours</option>' +
              '</select>' +
              '<button id="btn-custom-done" style="padding:10px 20px;background:var(--accent-primary);color:white;border-radius:8px;border:none;font-weight:600;cursor:pointer;">Done</button>' +
            '</div>' +
            '<p style="margin-top:8px;font-size:12px;color:var(--text-muted);">Attachments older than this will be automatically removed from the database. Max: 24 hours (1440 minutes).</p>' +
          '</div>' +
           '<div id="load-all-data-section" style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="flex:1;">' +
              '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Load All Stored Data</div>' +
              '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Load all messages, images, and files from the database into memory. Use this to ensure all historical data is available for search and gallery.</div>' +
              '<div style="margin-top:14px;">' +
                '<button id="btn-load-all-data" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Load All Data</button>' +
                '<span id="load-all-msg" style="margin-left:12px;font-size:13px;color:var(--text-muted);display:none;"></span>' +
              '</div>' +
            '</div>' +
          '</div>' +
           '<div id="export-chat-section" style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="display:flex;align-items:flex-start;gap:16px;">' +
              '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
              '<div style="flex:1;">' +
                '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Export Chat History</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;line-height:1.4;">Export the complete message history of a single chat as a JSON or text file.</div>' +
                '<div style="margin-top:14px;">' +
                  '<select id="export-chat-select" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);outline:none;font-size:13px;margin-bottom:10px;">' +
                    '<option value="">Select a chat...</option>' +
                  '</select>' +
                  '<div style="display:flex;gap:10px;">' +
                    '<button id="btn-export-json" class="btn btn-primary" style="padding:10px 20px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;">Export as JSON</button>' +
                    '<button id="btn-export-txt" class="btn btn-secondary" style="padding:10px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Export as TXT</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
           '<div style="padding:20px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border-subtle);">' +
            '<div style="flex:1;">' +
              '<div style="font-weight:600;color:var(--text-primary);font-size:15px;">Storage Management</div>' +
              '<div style="font-size:13px;color:var(--text-secondary);margin-top:4px;margin-bottom:14px;line-height:1.4;">Permanently delete local storage files to free up disk space.</div>' +
              '<button id="btn-clear-attachments" style="padding:10px 20px;background:var(--accent-danger);color:white;border-radius:10px;border:none;font-weight:600;cursor:pointer;">Clear All Saved Attachments</button>' +
              '<span id="clear-msg" style="margin-left:16px;font-size:13px;color:var(--accent-success);"></span>' +
            '</div>' +
          '</div>' +
        '</div>';

      var updateSettings = function(key, val) {
        // Record undo/redo action
        if (window.UndoManager && !window.UndoManager._paused) {
          var _oldVal = window.store.getState().settings[key];
          var _key = key;
          var _newVal = val;
          if (_oldVal !== _newVal) {
            window.UndoManager.pushAction('Change ' + _key, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _oldVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            }, function() {
              var s = { ...window.store.getState().settings };
              s[_key] = _newVal;
              window.store.setState({ settings: s });
              window.Storage.set('settings', s);
              if (window.App && window.App.applySettings) window.App.applySettings(s);
            });
          }
        }
        var newSettings = { ...window.store.getState().settings };
        newSettings[key] = val;
        window.store.setState({ settings: newSettings });
        window.Storage.set('settings', newSettings);
      };

      // Backup buttons
      var updateStatus = function(el, text, isError) {
        el.style.display = 'inline';
        el.textContent = text;
        el.style.color = isError ? 'var(--accent-danger)' : 'var(--accent-success)';
      };

      var withLoading = function(btn, fn) {
        return async function() {
          if (btn.disabled) return;
          var origText = btn.textContent;
          btn.disabled = true;
          btn.style.opacity = '0.6';
          btn.style.cursor = 'wait';
          btn.textContent = 'Working...';
          try {
            await fn();
          } finally {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.textContent = origText;
          }
        };
      };

      content.querySelector('#btn-backup-orzip').addEventListener('click', withLoading(content.querySelector('#btn-backup-orzip'), async function() {
        if (!window.orbitAPI || !window.orbitAPI.backupCreate) { window.Toast.show('Error', 'Backup not available'); return; }
        var result = await window.orbitAPI.backupCreate('orzip');
        if (result.canceled) return;
        if (result.error) { window.Toast.show('Backup Failed', result.error); return; }
        window.Toast.show('Backup Created', 'Saved (' + (result.size / 1024).toFixed(1) + ' KB)');
      }));
      content.querySelector('#btn-backup-zip').addEventListener('click', withLoading(content.querySelector('#btn-backup-zip'), async function() {
        if (!window.orbitAPI || !window.orbitAPI.backupCreate) { window.Toast.show('Error', 'Backup not available'); return; }
        var result = await window.orbitAPI.backupCreate('zip');
        if (result.canceled) return;
        if (result.error) { window.Toast.show('Backup Failed', result.error); return; }
        window.Toast.show('Backup Created', 'Saved (' + (result.size / 1024).toFixed(1) + ' KB)');
      }));

      // Restore with confirmation
      content.querySelector('#btn-restore').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.backupRestore) { window.Toast.show('Error', 'Restore not available'); return; }
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Restore Backup',
            message: 'This will replace ALL current data (messages, groups, friends, settings) with data from the backup. This cannot be undone. Are you sure?',
            confirmText: 'Restore',
            danger: true,
            onConfirm: async function() {
              var statusEl = content.querySelector('#restore-status');
              updateStatus(statusEl, 'Restoring...', false);
              var result = await window.orbitAPI.backupRestore();
              if (result.canceled) { statusEl.style.display = 'none'; return; }
              if (result.ok) {
                updateStatus(statusEl, 'Restore complete! Reloading...', false);
                setTimeout(function() { window.location.reload(); }, 1500);
              } else {
                updateStatus(statusEl, result.error || 'Restore failed', true);
              }
            }
          });
        }
      });

      // Health check
      content.querySelector('#btn-db-health').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.dbHealthCheck) { window.Toast.show('Error', 'Health check not available'); return; }
        var btn = this;
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.textContent = 'Checking...';
        var result = window.orbitAPI.dbHealthCheck();
        var statusEl = content.querySelector('#health-status');
        if (result.ok && result.errors.length === 0) {
          var warnings = result.warnings && result.warnings.length > 0 ? ' (' + result.warnings.length + ' warnings)' : '';
          updateStatus(statusEl, 'Database healthy' + warnings, false);
        } else {
          var errMsg = result.errors ? result.errors.join('; ') : 'Unknown issue';
          updateStatus(statusEl, errMsg, true);
        }
        btn.disabled = false;
        btn.style.opacity = '';
        btn.textContent = 'Run Health Check';
      });

      // Database repair
      content.querySelector('#btn-db-repair').addEventListener('click', function() {
        if (!window.orbitAPI || !window.orbitAPI.dbRepair) { window.Toast.show('Error', 'Repair not available'); return; }
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Repair Database',
            message: 'This will rebuild indexes, remove orphaned data, and attempt to fix integrity issues. The app may become unresponsive briefly. Proceed?',
            confirmText: 'Repair',
            danger: true,
            onConfirm: function() {
              var statusEl = content.querySelector('#repair-status');
              updateStatus(statusEl, 'Repairing...', false);
              var result = window.orbitAPI.dbRepair();
              if (result.ok) {
                var msg = 'Repair complete';
                if (result.repaired && result.repaired.length > 0) {
                  msg = result.repaired.join('; ');
                }
                if (result.warnings && result.warnings.length > 0) {
                  msg += ' (warnings: ' + result.warnings.join('; ') + ')';
                }
                updateStatus(statusEl, msg, result.warnings && result.warnings.length > 0);
              } else {
                updateStatus(statusEl, result.warnings ? result.warnings.join('; ') : 'Repair failed', true);
              }
            }
          });
        }
      });

      // Privacy mode toggle
      content.querySelector('#set-privacy').addEventListener('change', function(e) {
        var isChecked = e.target.checked;
        if (isChecked) {
          e.target.checked = false;
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Enable Privacy Mode',
              message: "WARNING! When you toggle this mode, you'll enter Privacy Mode, which will NOT save any sended Images, Files, Folders but, you keep your messages, profile data!",
              confirmText: 'Enable',
              danger: true,
              onConfirm: function() {
                e.target.checked = true;
                updateSettings('privacyMode', true);
              }
            });
          }
        } else {
          updateSettings('privacyMode', false);
        }
      });

      // E2EE toggle
      var e2eeToggle = content.querySelector('#set-e2ee');
      if (e2eeToggle) {
        e2eeToggle.addEventListener('change', function(e) {
          var isChecked = e.target.checked;
          if (isChecked) {
            if (window.ConfirmModal) {
              window.ConfirmModal.show({
                title: 'Enable E2EE',
                message: 'End-to-end encryption will encrypt message content before sending. Recipients also need E2EE enabled to decrypt. Only direct messages are encrypted. Group messages will still be sent in plaintext.',
                confirmText: 'Enable',
                danger: false,
                onConfirm: function() {
                  updateSettings('e2eeEnabled', true);
                  if (window.Toast) window.Toast.show('E2EE Enabled', 'Messages will now be encrypted end-to-end');
                }
              });
            } else {
              updateSettings('e2eeEnabled', true);
            }
          } else {
            updateSettings('e2eeEnabled', false);
            if (window.Toast) window.Toast.show('E2EE Disabled', 'Messages will be sent in plaintext');
          }
        });
      }

      // Delete attachments after
      content.querySelector('#set-delete-after').addEventListener('change', function(e) {
        var val = parseInt(e.target.value);
        if (val === -1) {
          content.querySelector('#custom-time-row').style.display = 'flex';
        } else {
          content.querySelector('#custom-time-row').style.display = 'none';
          updateSettings('deleteAttachmentsAfter', val);
        }
      });

      var btnCustomDone = content.querySelector('#btn-custom-done');
      if (btnCustomDone) {
        btnCustomDone.addEventListener('click', function() {
          var timeVal = parseInt(content.querySelector('#custom-time-value').value) || 30;
          var unitVal = parseInt(content.querySelector('#custom-time-unit').value) || 1;
          var totalMinutes = Math.min(1440, Math.max(1, timeVal * unitVal));
          content.querySelector('#custom-time-value').value = Math.floor(totalMinutes / unitVal);
          updateSettings('deleteAttachmentsAfter', totalMinutes);
          btnCustomDone.textContent = 'Saved!';
          setTimeout(function() { btnCustomDone.textContent = 'Done'; }, 1500);
        });
      }

      // Load all stored data (double confirmation)
      content.querySelector('#btn-load-all-data').addEventListener('click', function() {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Load All Stored Data',
            message: 'Warning: This will load ALL stored messages, images, and files from the database into memory. This may temporarily increase memory usage and cause the app to become less responsive while loading. Are you sure you want to continue?',
            confirmText: 'Continue',
            danger: true,
            onConfirm: function() {
              window.ConfirmModal.show({
                title: 'Final Confirmation',
                message: 'This action will fully load all historical data from the database, making everything available for search and gallery views. This cannot be undone unless you restart the app. Proceed?',
                confirmText: 'Yes, Load Everything',
                danger: true,
                onConfirm: function() {
                  var statusEl = content.querySelector('#load-all-msg');
                  statusEl.style.display = 'inline';
                  statusEl.textContent = 'Loading...';
                  statusEl.style.color = 'var(--text-muted)';
                  window.store.loadAllMessages();
                  statusEl.textContent = 'Loaded!';
                  statusEl.style.color = 'var(--accent-success)';
                  setTimeout(function() { statusEl.style.display = 'none'; }, 3000);
                  if (window.Toast) window.Toast.show('Data Loaded', 'All stored messages are now available in memory');
                }
              });
            }
          });
        }
      });

      // Populate export chat select
      var exportSelect = content.querySelector('#export-chat-select');
      if (exportSelect) {
        var state = window.store.getState();
        var chatIds = Object.keys(state.messages || {});
        var seen = {};
        chatIds.forEach(function(cId) {
          if (cId === 'local-echo') return;
          var label = cId;
          var friend = state.friends.find(function(f) { return f.userId === cId; });
          var group = state.groups.find(function(g) { return g.groupId === cId; });
          if (friend) label = friend.username;
          else if (group) label = group.groupName;
          if (seen[label]) return;
          seen[label] = true;
          var opt = document.createElement('option');
          opt.value = cId;
          opt.textContent = label;
          exportSelect.appendChild(opt);
        });
      }

      function doExportChat(format) {
        var select = content.querySelector('#export-chat-select');
        var chatId = select ? select.value : '';
        if (!chatId) {
          if (window.Toast) window.Toast.show('Export Error', 'Please select a chat first.');
          return;
        }
        var state = window.store.getState();
        var msgs = state.messages[chatId] || [];
        var chatName = chatId;
        var friend = state.friends.find(function(f) { return f.userId === chatId; });
        var group = state.groups.find(function(g) { return g.groupId === chatId; });
        if (friend) chatName = friend.username;
        else if (group) chatName = group.groupName;

        function getSenderName(senderId) {
          if (senderId === state.currentUser.userId) return 'You';
          var f = state.friends.find(function(fr) { return fr.userId === senderId; });
          if (f) return f.username;
          if (group) {
            var m = group.members.find(function(mem) { return mem.userId === senderId; });
            if (m) return m.username;
          }
          return senderId;
        }

        if (format === 'json') {
          var data = {
            chatId: chatId,
            chatName: chatName,
            exportedAt: new Date().toISOString(),
            messages: msgs.map(function(m) {
              return {
                id: m.id,
                sender: m.sender,
                senderName: getSenderName(m.sender),
                text: m.text || '',
                timestamp: m.timestamp,
                attachments: m.attachments || []
              };
            })
          };
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'chat-' + chatName.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          var lines = msgs.map(function(m) {
            var date = m.timestamp ? new Date(m.timestamp).toLocaleString() : 'Unknown date';
            return '[' + date + '] ' + getSenderName(m.sender) + ': ' + (m.text || '');
          });
          var text = lines.join('\n');
          var blob = new Blob([text], { type: 'text/plain' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'chat-' + chatName.replace(/[^a-zA-Z0-9]/g, '_') + '.txt';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        if (window.Toast) window.Toast.show('Chat Exported', chatName + ' history exported successfully.');
      }

      content.querySelector('#btn-export-json').addEventListener('click', function() { doExportChat('json'); });
      content.querySelector('#btn-export-txt').addEventListener('click', function() { doExportChat('txt'); });

      // Clear all attachments
      content.querySelector('#btn-clear-attachments').addEventListener('click', function() {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Clear Attachments',
            message: 'Are you sure you want to permanently delete all saved attachments from the database? This cannot be undone.',
            confirmText: 'Clear All',
            danger: true,
            onConfirm: function() {
              if (window.orbitAPI) {
                window.orbitAPI.dbClearAttachments();
                content.querySelector('#clear-msg').textContent = 'Attachments cleared!';
                setTimeout(function() {
                  var clearMsgEl = content.querySelector('#clear-msg');
                  if (clearMsgEl) clearMsgEl.textContent = '';
                }, 3000);
              }
            }
          });
        }
      });

    } else if (tabName === 'about') {
      // Prefer the main process's app.getVersion(): preload's `version` field
      // reads process.env.npm_package_version, which is unset in a packaged
      // build, so it would report a hardcoded fallback forever.
      var version = '0.0.0';
      if (window.orbitAPI) {
        if (typeof window.orbitAPI.getAppVersion === 'function') {
          try { version = window.orbitAPI.getAppVersion() || version; } catch (e) { /* fall through */ }
        } else if (window.orbitAPI.version) {
          version = window.orbitAPI.version;
        }
      }
      var friendCount = state.friends ? state.friends.length : 0;
      var groupCount = state.groups ? state.groups.length : 0;
      var chatCount = Object.keys(state.messages || {}).length;
      var s = state.settings || {};
      var updateCheckOn = s.updateCheckEnabled !== false;

      content.innerHTML =
        '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">About</h3>' +

        // Section: App Info
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
              '<img src="icons/app/orbit_256.png" style="width:32px;height:32px;border-radius:8px;">' +
              '<div><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Orbit Beta</span><span style="font-size:11px;color:var(--text-muted);margin-left:8px;font-family:var(--font-mono);">v' + version + '</span></div>' +
            '</div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:block;">' +
            '<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 16px;">A peer-to-peer messaging app for local networks. Connect, chat, and share files without the cloud.</p>' +
            '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px;padding:12px;background:var(--bg-surface);border-radius:8px;font-size:12px;">' +
              '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Version</span><span style="color:var(--text-primary);font-family:var(--font-mono);">' + version + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Electron</span><span style="color:var(--text-primary);font-family:var(--font-mono);">' + (window.orbitAPI ? (window.orbitAPI.electronVersion || '?') : '?') + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Node.js</span><span style="color:var(--text-primary);font-family:var(--font-mono);">' + (window.orbitAPI ? (window.orbitAPI.nodeVersion || '?') : '?') + '</span></div>' +
              '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">License</span><span style="color:var(--text-primary);font-family:var(--font-mono);">MIT</span></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
              '<button id="settings-btn-changelog" style="display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:24px;background:var(--accent-primary);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:600;transition:opacity 0.15s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">' +
                '<i data-lucide="sparkles" style="width:16px;height:16px;"></i> What\'s New' +
              '</button>' +
              '<button id="settings-btn-check-update" style="display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:24px;background:transparent;color:var(--text-secondary);border:1px solid var(--border-subtle);cursor:pointer;font-size:13px;font-weight:500;transition:opacity 0.15s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">' +
                '<i data-lucide="download-cloud" style="width:16px;height:16px;"></i> Check for updates' +
              '</button>' +
            '</div>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border-subtle);">' +
              '<div>' +
                '<div style="font-size:13px;font-weight:600;color:var(--text-primary);">Automatic Update Checks</div>' +
                '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.4;">Ask GitHub for a newer version shortly after launch (at most once every 6 hours). Off means no automatic network contact — the button above still works.</div>' +
              '</div>' +
              '<label class="orbit-switch">' +
                '<input type="checkbox" id="update-check-toggle"' + (updateCheckOn ? ' checked' : '') + '>' +
                '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
              '</label>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Tutorial
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="graduation-cap" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Welcome Tour</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<button id="settings-btn-replay-tour" style="display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:24px;background:var(--accent-primary);color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:600;margin-bottom:16px;transition:opacity 0.15s;" onmouseenter="this.style.opacity=\'0.85\'" onmouseleave="this.style.opacity=\'1\'">' +
              '<i data-lucide="refresh-cw" style="width:16px;height:16px;"></i> Replay Welcome Tour' +
            '</button>' +
            '<label style="display:flex;align-items:center;gap:12px;padding:12px 0;font-size:14px;color:var(--text-primary);cursor:pointer;">' +
              '<input id="settings-tour-startup" type="checkbox" ' + (s.showTutorialOnStartup ? 'checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
              '<div><div>Show Welcome Tour on Startup</div>' +
              '<div style="font-size:12px;color:var(--text-muted);font-weight:400;">Automatically show the welcome tour when Orbit starts.</div>' +
            '</div></label>' +
          '</div>' +
        '</div>' +

        // Section: Stats
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="bar-chart-3" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Statistics</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + friendCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Friends</div>' +
              '</div>' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + groupCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Groups</div>' +
              '</div>' +
              '<div style="text-align:center;padding:16px;background:var(--bg-base);border-radius:10px;border:1px solid var(--border-subtle);">' +
                '<div style="font-size:28px;font-weight:700;color:var(--accent-primary);">' + chatCount + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Chats</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section: Links
        '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
          '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="var b=this.nextElementSibling;var i=this.querySelector(\'.collapse-icon\');if(b.style.display===\'none\'){b.style.display=\'block\';i.style.transform=\'rotate(0deg)\'}else{b.style.display=\'none\';i.style.transform=\'rotate(-90deg)\'}">' +
            '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="external-link" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">Links</span></div>' +
            '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;"></i>' +
          '</div>' +
          '<div class="collapsible-body" style="padding:16px;display:none;">' +
            '<a href="https://github.com/D4niel-dev/Orbit-beta" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:var(--bg-surface);text-decoration:none;margin-bottom:8px;transition:background 0.15s;" onmouseenter="this.style.background=\'var(--bg-base)\'" onmouseleave="this.style.background=\'var(--bg-surface)\'">' +
              '<i data-lucide="code" style="width:20px;height:20px;color:var(--text-primary);flex-shrink:0;"></i>' +
              '<div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">GitHub Repository</div><div style="font-size:11px;color:var(--text-muted);">View source code, report issues, contribute</div></div>' +
            '</a>' +
            '<a href="https://github.com/D4niel-dev/Orbit-beta/issues" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;background:var(--bg-surface);text-decoration:none;transition:background 0.15s;" onmouseenter="this.style.background=\'var(--bg-base)\'" onmouseleave="this.style.background=\'var(--bg-surface)\'">' +
              '<i data-lucide="bug" style="width:20px;height:20px;color:#ef4444;flex-shrink:0;"></i>' +
              '<div><div style="font-size:13px;font-weight:600;color:var(--text-primary);">Report an Issue</div><div style="font-size:11px;color:var(--text-muted);">Found a bug? Let us know on GitHub</div></div>' +
            '</a>' +
          '</div>' +
        '</div>';

      if (window.lucide) window.lucide.createIcons({ root: content });

      var changelogBtn = content.querySelector('#settings-btn-changelog');
      if (changelogBtn) {
        changelogBtn.addEventListener('click', function() {
          if (window.Changelog) window.Changelog.show();
        });
      }

      var updateBtn = content.querySelector('#settings-btn-check-update');
      if (updateBtn) {
        updateBtn.addEventListener('click', function() {
          if (window.UpdateNotice) window.UpdateNotice.checkManual();
        });
      }

      var updateToggle = content.querySelector('#update-check-toggle');
      if (updateToggle) {
        updateToggle.addEventListener('change', function() {
          var on = updateToggle.checked;
          var next = { ...window.store.getState().settings, updateCheckEnabled: on };
          window.store.setState({ settings: next });
          // Write BOTH stores. Boot reads settings from SQLite
          // (database.getAllStartupData → getSetting('settings')), but the DB
          // constructor re-runs migrateFromElectronStore(true) on every launch,
          // and that call bypasses its own "already migrated" guard — so it
          // copies electron-store's `settings` over SQLite each boot. A
          // SQLite-only write is therefore silently reverted on the next
          // launch whenever electron-store still holds an older snapshot
          // (verified). electron-store alone also works, but only because of
          // that migration; writing both makes the choice robust either way.
          if (window.orbitAPI && window.orbitAPI.dbSetSetting) {
            window.orbitAPI.dbSetSetting('settings', next);
          }
          window.Storage.set('settings', next);
          // ⚠ Nothing repaints the switch here any more. It used to repaint the
          // slider and the knob by hand — a SECOND writer for one piece of state,
          // with its own copy of the travel distance. The checkbox already carries
          // the state and §9c of styles/redesign.css reads it.
        });
      }

      var replayBtn = content.querySelector('#settings-btn-replay-tour');
      if (replayBtn) {
        replayBtn.addEventListener('click', function() {
          window.SettingsModal.close();
          setTimeout(function() {
            if (window.TutorialModal) window.TutorialModal.show();
          }, 300);
        });
      }

      var tourStartupToggle = content.querySelector('#settings-tour-startup');
      if (tourStartupToggle) {
        tourStartupToggle.addEventListener('change', function(e) {
          var newSettings = { ...window.store.getState().settings };
          newSettings.showTutorialOnStartup = e.target.checked;
          window.store.setState({ settings: newSettings });
          window.Storage.set('settings', newSettings);
        });
      }

    } else {
      content.innerHTML = '<h3 style="font-family:var(--font-display);font-size:24px;margin-bottom:24px;">' + tabName + '</h3><p style="color:var(--text-muted);">Coming soon...</p>';
    }
  },

  // Stable per-string hash → deterministic node placement across redraws
  _hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  },

  // Live network topology renderer for #network-map-canvas (Settings → Network).
  // Self node at center; peer nodes placed on stable per-peerId angles; edges
  // only to connected peers, colored by RTT (_rtts, green<150 / yellow 150-400 /
  // red>400-or-unknown). Active transfers pulse edges + show a name/percent
  // badge; incoming-message bursts (_p2pRecvCount deltas) briefly brighten edges.
  _drawNetworkMap() {
    var recvNow = window._p2pRecvCount || 0;
    if (this._lastRecvCount !== undefined && recvNow > this._lastRecvCount) this._activityAt = Date.now();
    this._lastRecvCount = recvNow;

    if (!this.isOpen) return;
    var canvas = document.getElementById('network-map-canvas');
    if (!canvas || canvas.offsetParent === null) return;

    var dpr = this._mapDpr || window.devicePixelRatio || 1;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    if (w < 10 || h < 10) return;

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var state = window.store ? window.store.getState() : null;
    if (!state) return;
    var friends = state.friends || [];
    var online = friends.filter(function(f) { return f.status === 'online'; });

    // Connected set: SocketManager.connections when the socket layer is exposed
    // to the renderer; otherwise fall back to beacon-implied online friends.
    var sm = window.SocketManager;
    var connectedIds = {};
    var rtts = null;
    if (sm && sm.connections) {
      sm.connections.forEach(function(sock, peerId) { connectedIds[peerId] = true; });
      rtts = (sm._rtts && sm._rtts.get) ? sm._rtts : null;
    } else {
      online.forEach(function(f) { connectedIds[f.userId] = true; });
    }

    // Node set: online friends + any connected peer not among them
    var nodes = [];
    var seen = {};
    online.forEach(function(f) {
      if (!seen[f.userId]) {
        seen[f.userId] = true;
        nodes.push({ id: f.userId, name: f.username || 'Peer', connected: !!connectedIds[f.userId] });
      }
    });
    if (sm && sm.connections) {
      sm.connections.forEach(function(sock, peerId) {
        if (!seen[peerId]) {
          seen[peerId] = true;
          nodes.push({ id: peerId, name: String(peerId).substring(0, 8), connected: true });
        }
      });
    }

    var transfers = state.transferProgress || {};
    var transferIds = Object.keys(transfers);
    var anyTransfer = transferIds.length > 0;

    // Incoming-activity pulse (fades over ~500ms after _p2pRecvCount jumps)
    var activity = this._activityAt ? Math.max(0, 1 - (Date.now() - this._activityAt) / 500) : 0;

    var cx = w / 2;
    var cy = h / 2;
    var radius = Math.min(cx, cy) * 0.6;

    // Deterministic angles from peerId hash (stable across ticks, unlike index order)
    var pos = {};
    nodes.forEach(function(node) {
      var angle = nodes.length === 1 ? 0 : (this._hashString(node.id) % 1000) / 1000 * Math.PI * 2;
      pos[node.id] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    }, this);

    function edgeStyle(id) {
      var rtt = rtts ? rtts.get(id) : undefined;
      if (rtt === undefined || rtt === null) return { color: '255, 69, 58' }; // unknown → red
      if (rtt < 150) return { color: '48, 209, 88' }; // green
      if (rtt <= 400) return { color: '255, 204, 0' }; // yellow
      return { color: '255, 69, 58' }; // red
    }

    var pulseT = (Date.now() % 1200) / 1200; // 0..1 traveling pulse

    // Edges: self → each connected peer
    nodes.forEach(function(node) {
      if (!node.connected) return;
      var p = pos[node.id];
      var st = edgeStyle(node.id);
      var alpha = 0.35 + activity * 0.55;
      if (anyTransfer) alpha = 0.45 + 0.4 * Math.abs(Math.sin(pulseT * Math.PI * 2));
      ctx.strokeStyle = 'rgba(' + st.color + ', ' + alpha.toFixed(2) + ')';
      ctx.lineWidth = anyTransfer ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (anyTransfer) {
        // Traveling dot along the edge while a transfer is active
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(cx + (p.x - cx) * pulseT, cy + (p.y - cy) * pulseT, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Active transfer badge (name + percent)
    if (anyTransfer) {
      var t = transfers[transferIds[0]];
      if (t && t.name) {
        var pct = t.total > 0 ? Math.round((t.received / t.total) * 100) : 0;
        var badge = (t.isSending ? 'Sending ' : 'Receiving ') + t.name + ' — ' + pct + '%';
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        var bw = ctx.measureText(badge).width + 16;
        ctx.fillStyle = 'rgba(10, 132, 255, 0.15)';
        ctx.strokeStyle = 'rgba(10, 132, 255, 0.5)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect((w - bw) / 2, 6, bw, 18, 9) : ctx.rect((w - bw) / 2, 6, bw, 18);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(badge, w / 2, 18);
      }
    }

    // Self node
    ctx.fillStyle = '#0A84FF';
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('You', cx, cy + 28);

    // Peer nodes: initial letter, RTT-colored when connected
    nodes.forEach(function(node) {
      var p = pos[node.id];
      var label = node.name.length > 8 ? node.name.substring(0, 8) + '…' : node.name;
      if (node.connected) {
        var st = edgeStyle(node.id);
        ctx.fillStyle = 'rgb(' + st.color + ')';
      } else {
        ctx.fillStyle = '#8E8E93';
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.fillText(node.name.charAt(0).toUpperCase(), p.x, p.y + 3.5);
      ctx.fillStyle = 'rgba(174, 174, 182, 0.95)';
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.fillText(label, p.x, p.y + 24);
    });

    // Legend (top-left): RTT thresholds
    ctx.textAlign = 'left';
    var legend = [
      { c: '48, 209, 88', t: '<150ms' },
      { c: '255, 204, 0', t: '150-400ms' },
      { c: '255, 69, 58', t: '>400ms / unknown' }
    ];
    var lx = 8;
    var ly = h - 10;
    legend.forEach(function(l) {
      ctx.fillStyle = 'rgb(' + l.c + ')';
      ctx.beginPath(); ctx.arc(lx + 3, ly - 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(174, 174, 182, 0.9)';
      ctx.font = '500 9px system-ui, sans-serif';
      ctx.fillText(l.t, lx + 9, ly);
      lx += ctx.measureText(l.t).width + 20;
    });
  },

  open(tab) {
    if (!tab) {
      tab = window.Storage ? window.Storage.get('lastSettingsTab', 'account') : 'account';
    }
    this.container.style.display = 'flex';
    this.isOpen = true;
    // ⚠ Before the tab click, and for a reason: this is the first moment the hydrated
    // settings exist. See _syncNavToggle.
    this._syncNavToggle();
    var tabEl = this.container.querySelector('.settings-tab[data-tab="' + tab + '"]');
    if (tabEl) tabEl.click();
  },

  close() {
    // Save active tab
    var activeTab = this.container ? this.container.querySelector('.settings-tab.active') : null;
    if (activeTab && window.Storage) {
      window.Storage.set('lastSettingsTab', activeTab.getAttribute('data-tab'));
    }
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.SettingsModal.init();
});
