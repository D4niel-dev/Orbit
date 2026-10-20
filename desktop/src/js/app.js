// src/js/app.js

window.handleMediaError = function(el, url) {
  console.warn('[MediaError] Failed to load:', url);
  // Auto-retry once on first failure — protocol may need a moment
  if (!url.startsWith('blob:') && !el.hasAttribute('data-retried')) {
    el.setAttribute('data-retried', '1');
    var busted = url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    el.src = busted;
    return;
  }
  const container = el.parentElement;
  container.innerHTML = '';

  const isBlob = url.startsWith('blob:');

  const wrapper = document.createElement('div');
  wrapper.style.cssText = "width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(255,0,0,0.05); padding:8px; text-align:center; box-sizing:border-box; gap:4px;";

  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', 'image-off');
  icon.style.cssText = "width:24px;height:24px;color:var(--text-muted);";

  const text = document.createElement('div');
  text.style.cssText = "font-size:10px; color:var(--text-secondary);";
  text.innerText = isBlob ? "Image expired" : "Not found";

  wrapper.appendChild(icon);
  wrapper.appendChild(text);

  // Browse button — let user re-link the file from disk
  const browseBtn = document.createElement('button');
  browseBtn.style.cssText = "background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:4px; color:var(--text-primary); font-size:10px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; gap:4px;";
  browseBtn.innerHTML = '<i data-lucide="folder-open" style="width:12px;height:12px;"></i> Browse';

  browseBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', function() {
      if (input.files && input.files[0]) {
        const file = input.files[0];
        const localUrl = URL.createObjectURL(file);
        container.innerHTML = '';
        const img = document.createElement('img');
        img.src = localUrl;
        img.style.cssText = "width:100%; height:100%; object-fit:cover;";
        container.appendChild(img);
      }
    });
    input.click();
  });

  wrapper.appendChild(browseBtn);

  // Retry button — only for non-blob URLs (orbit-file:// etc.)
  if (!isBlob) {
    const retryBtn = document.createElement('button');
    retryBtn.style.cssText = "background:transparent; border:1px solid var(--border-subtle); border-radius:4px; color:var(--text-muted); font-size:10px; padding:4px 8px; cursor:pointer; display:flex; align-items:center; gap:4px;";
    retryBtn.innerHTML = '<i data-lucide="refresh-cw" style="width:12px;height:12px;"></i> Retry';

    retryBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      container.innerHTML = '';
      const img = document.createElement('img');
      img.src = url;
      img.style.cssText = "width:100%; height:100%; object-fit:cover;";
      img.onerror = function() {
        // Show static final error — no more auto-retry to prevent loops
        container.innerHTML = '';
        const fail = document.createElement('div');
        fail.style.cssText = "width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(255,0,0,0.05); padding:8px; text-align:center; box-sizing:border-box; gap:4px;";
        fail.innerHTML = '<i data-lucide="x-circle" style="width:24px;height:24px;color:var(--text-muted);"></i><div style="font-size:10px;color:var(--text-secondary);">Still not found</div>';
        container.appendChild(fail);
        if (window.lucide) window.lucide.createIcons({ root: container });
      };
      container.appendChild(img);
    });

    wrapper.appendChild(retryBtn);
  }

  container.appendChild(wrapper);
  if (window.lucide) window.lucide.createIcons({ root: container });
};

// Two-stage img fallback: thumbnail -> full attachment URL -> handleMediaError
window.mediaImgOnError = function(el) {
  var fallback = el.getAttribute('data-fallback-src');
  if (fallback && el.getAttribute('data-using-fallback') !== '1') {
    el.setAttribute('data-using-fallback', '1');
    el.removeAttribute('data-retried');
    el.src = fallback + (fallback.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    return;
  }
  var url = fallback || el.currentSrc || el.src || '';
  if (window.handleMediaError) window.handleMediaError(el, url);
};

// Video/audio: retry full URL before giving up
window.mediaSrcOnError = function(el) {
  var fallback = el.getAttribute('data-fallback-src');
  if (fallback && el.getAttribute('data-using-fallback') !== '1') {
    el.setAttribute('data-using-fallback', '1');
    el.src = fallback + (fallback.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
    if (el.load) el.load();
  }
};

// Lightweight typing indicator state (not in store to avoid full re-renders)
window.TypingState = {
  _data: {}, // { chatId: [{ userId, username, timeout }] }
  _listeners: [],
  onChange(fn) { this._listeners.push(fn); },
  _notify() { this._listeners.forEach(function(fn) { fn(); }); },
  getUsers(chatId) { return this._data[chatId] || []; },
  addUser(chatId, userId, username) {
    if (!this._data[chatId]) this._data[chatId] = [];
    var existing = this._data[chatId].find(function(u) { return u.userId === userId; });
    if (existing) {
      clearTimeout(existing.timeout);
      existing.timeout = setTimeout(function() { window.TypingState.removeUser(chatId, userId); }, 4000);
    } else {
      var entry = { userId: userId, username: username };
      entry.timeout = setTimeout(function() { window.TypingState.removeUser(chatId, userId); }, 4000);
      this._data[chatId].push(entry);
    }
    this._notify();
  },
  removeUser(chatId, userId) {
    if (!this._data[chatId]) return;
    var idx = this._data[chatId].findIndex(function(u) { return u.userId === userId; });
    if (idx >= 0) {
      clearTimeout(this._data[chatId][idx].timeout);
      this._data[chatId].splice(idx, 1);
      if (this._data[chatId].length === 0) delete this._data[chatId];
      this._notify();
    }
  }
};

// Notification sound via Web Audio API (no audio files needed)
window.NotificationSound = {
  _ctx: null,
  _getContext() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._ctx;
  },
  play(opts) {
    try {
      var ctx = this._getContext();
      var now = ctx.currentTime;
      opts = opts || {};
      var vol = (opts.volume != null ? opts.volume : 80) / 100;
      if (vol < 0.01) return;
      var type = opts.type || 'chime';

      var playTone = function(freq, start, dur, gainVal) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(gainVal * vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };

      if (type === 'chime') {
        // Two ascending tones (original)
        playTone(523.25, now, 0.15, 0.3);
        playTone(659.25, now + 0.1, 0.3, 0.3);
      } else if (type === 'pop') {
        // Short single pop
        playTone(880, now, 0.08, 0.25);
      } else if (type === 'gentle') {
        // Soft two-tone with lower volume
        playTone(392, now, 0.2, 0.2);
        playTone(523.25, now + 0.15, 0.35, 0.15);
      } else if (type === 'classic') {
        // Three-note classic ring
        playTone(440, now, 0.1, 0.2);
        playTone(554.37, now + 0.12, 0.1, 0.2);
        playTone(659.25, now + 0.24, 0.3, 0.2);
      }
    } catch (e) {
      // Audio not available - silent fail
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Orbit Shell Booting...');

  // Debug log buffer for P2P Diagnostics
  window._debugLogBuffer = [];
  var _origConsole = { log: console.log, warn: console.warn, error: console.error, debug: console.debug };
  ['log','warn','error','debug'].forEach(function(level) {
    console[level] = function() {
      _origConsole[level].apply(console, arguments);
      try {
        var msgs = Array.prototype.slice.call(arguments).map(function(a) { return typeof a === 'string' ? a : JSON.stringify(a); });
        window._debugLogBuffer.push('[' + level.toUpperCase() + '] ' + msgs.join(' '));
        if (window._debugLogBuffer.length > 500) window._debugLogBuffer.shift();
      } catch(e) {}
    };
  });

  // Initialize Lucide icons
  lucide.createIcons();

  // Handle titlebar controls
  document.getElementById('btn-minimize').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'minimize');
  });
  document.getElementById('btn-maximize').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'maximize');
  });
  document.getElementById('btn-close').addEventListener('click', () => {
    window.orbitAPI?.send('window-controls', 'close');
  });

  // Detect system dark mode preference
  const darkModeMedia = window.matchMedia('(prefers-color-scheme: dark)');

  /**
   * The look — `settings.newUI`, the switch the settings modal labels "New look".
   * OFF BY DEFAULT, because the redesign is the beta: the original UI is what the
   * app opens on, and the beta has to be asked for.
   *
   * ⚠ IT IS ONE LINE OF WORK BECAUSE THE REDESIGN IS ONE STYLESHEET. Everything the
   * redesign changes about the chrome lives in styles/redesign.css, loaded last, so
   * disabling its <link> restores the previous cascade. No second copy of the old UI
   * to keep in sync.
   *
   * ⚠ It is applied from applySettings, which runs at boot AND on every settings
   * change (the store subscription below), so the layer can never drift from the
   * preference. index.html also applies it inline before first paint, so the new UI
   * does not flash on launch — this is the authority, that is the anti-flash.
   *
   * ⚠ `disabled` rather than removing the element: re-enabling must not re-fetch,
   * and a removed link has to be rebuilt from a string that would then be a second
   * definition of the path.
   */
  const applyRedesignLayer = (enabled) => {
    var link = document.getElementById('redesign-css');
    if (!link) return false;
    link.disabled = !enabled;
    return true;
  };
  /**
   * Make the chat give up the space a side panel is taking.
   *
   * ⚠⚠ `#panel-gallery` and `#panel-profile` are `position: absolute; right: 0` inside
   * `#panel-right`, so they sit ON the conversation rather than beside it. Measured with
   * the gallery open, that covered THREE controls: `#btn-chat-more` (the header's ⋮),
   * `#btn-gallery` (the button that opened it) and **`#btn-send` in the composer**. Dan
   * reported it as "the three dots button isn't showing anything" — clicking where it is
   * hit the gallery's close button instead, so the menu never appeared.
   *
   * ⚠ The chat ends where the panel begins now. The panel does not move and its own
   * shadow still reads as the boundary, so this is a fix and not a redesign.
   *
   * ⚠⚠ IT READS THE DOM RATHER THAN BEING TOLD. Both panels can be open at once, and
   * the gallery closes on a 170ms timer — so "which panel is showing" is a question for
   * the document, not for whichever caller happens to be running. Call it after any
   * display change and it is right either way. The width is read too: the gallery is
   * 340px and the profile 320px.
   */
  window.OrbitReserveSidePanel = function () {
    var right = document.getElementById('panel-right');
    if (!right) return;
    var w = 0;
    ['panel-gallery', 'panel-profile'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && getComputedStyle(el).display !== 'none') {
        w = Math.max(w, Math.round(el.getBoundingClientRect().width) || 0);
      }
    });
    if (w > 0) {
      right.style.setProperty('--side-panel-w', w + 'px');
      right.classList.add('side-panel-open');
    } else {
      right.classList.remove('side-panel-open');
      right.style.removeProperty('--side-panel-w');
    }
  };

  window.OrbitRedesign = {
    apply: applyRedesignLayer,
    isOn: () => {
      var link = document.getElementById('redesign-css');
      return !!link && !link.disabled;
    },

    /**
     * Save the choice and restart so it takes effect.
     *
     * ⚠⚠ IT RESTARTS RATHER THAN FLIPPING THE LAYER LIVE, AND THE REASON IS THE
     * MOMENT IT HAPPENS. applySettings would repaint the whole window the instant
     * the setting changed — so the user would watch the UI they are leaving change
     * under them and *then* see the window close. A restart is what they asked for
     * and what the confirmation promises; the last thing they see should be the
     * dialog, not a half-transitioned app.
     *
     * ⚠ The live store is deliberately NOT updated, for the same reason: setState
     * runs the subscription, which runs applySettings, which repaints. The write
     * goes to the stores and nowhere else, and the restarted app reads it back.
     *
     * ⚠ BOTH stores, the way the update-check toggle does it. electron-store is the
     * durable source — the Database constructor copies it over SQLite on every
     * launch — and the SQLite write is belt and braces for the boot read. Both are
     * synchronous, so the value is on disk before the process exits.
     */
    commitLook: (useNewLook) => {
      var next = Object.assign({}, window.store.getState().settings, { newUI: useNewLook === true });
      if (window.Storage) window.Storage.set('settings', next);
      if (window.orbitAPI && window.orbitAPI.dbSetSetting) window.orbitAPI.dbSetSetting('settings', next);
      window.OrbitRedesign.requestRestart();
    },

    /**
     * ⚠ Split out from commitLook so it is the ONE place the restart is asked
     * for — and so a spec can replace it. The preload's bridge is frozen and
     * non-extensible (verified: assigning to it silently does nothing), so a test
     * cannot stub `orbitAPI.relaunchApp`; without this seam, asserting the confirm
     * path would mean actually relaunching Electron and leaking a process.
     */
    requestRestart: () => {
      if (window.orbitAPI && window.orbitAPI.relaunchApp) {
        window.orbitAPI.relaunchApp();
        return true;
      }
      // No relaunch bridge — a plain browser rather than Electron. Apply it live so
      // the toggle is not a dead control there; read the value that was just
      // written, because the live store was not touched.
      var saved = window.Storage ? window.Storage.get('settings', {}) : {};
      applyRedesignLayer(saved.newUI === true);
      return false;
    }
  };

  // ---- Apply settings from store ----
  const applySettings = (settings) => {
    // ⚠ First, before anything reads a computed style. `=== true` so a missing or
    // malformed value means the ORIGINAL ui — the redesign is the beta and has to
    // be asked for.
    applyRedesignLayer(settings.newUI === true);

    var theme = settings.theme || 'dark';
    if (theme === 'system') {
      theme = darkModeMedia.matches ? 'dark' : 'light';
    } else if (theme === 'seasonal') {
      var m = new Date().getMonth();
      if (m >= 2 && m <= 4) { theme = 'seasonal-spring'; }
      else if (m >= 5 && m <= 7) { theme = 'seasonal-summer'; }
      else if (m >= 8 && m <= 10) { theme = 'seasonal-fall'; }
      else { theme = 'seasonal-winter'; }
    }
    document.documentElement.setAttribute('data-theme', theme);
    // ⚠⚠ ONLY A REAL THEME CHANGE EARNS THE TRANSITION. This used to fire on EVERY
    // applySettings — that is, on every settings write of any kind — and the class
    // carries a document-wide `transition: … !important` in animations.css, so
    // toggling an unrelated preference made the entire window animate for 600ms.
    // On a slow device that reads as the whole UI refreshing. It also meant every
    // launch began with 600ms of everything transitioning, for no reason.
    var themeChanged = !!window._prevTheme && window._prevTheme !== theme;
    if (themeChanged && !settings.reduceMotion) {
      document.documentElement.classList.add('theme-transitioning');
      setTimeout(function() {
        document.documentElement.classList.remove('theme-transitioning');
      }, 600);
    }

    // Theme change easter egg — random theme-matched text
    if (themeChanged) {
      var themeTexts = {
        'dark': ['"In the darkness, we find connection."', '"The night is young and so are we."', '"Dark mode isn\'t just a theme, it\'s a lifestyle."', '"Embracing the void, one pixel at a time."', '"The void stares back, but we stare together."', '"Darkness is just the absence of light. Connection is the presence of soul."', '"The dark side has cookies. And really good contrast ratios."', '"Shadows hold the deepest conversations."', '"Night mode: because burning your retinas is so 2010."'],
        'light': ['"Into the light, I command thee!"', '"Bright ideas start here."', '"Day mode activated. Sunglasses recommended."', '"The path is illuminated before you."', '"Brightness amplifies everything. Even the truth."', '"Step into the light — the water\'s fine."', '"Light mode: for when you want to feel the sun on your digital face."', '"Illuminate your conversations."', '"Seeing clearly never felt so right."'],
        'midnight': ['"The witching hour calls."', '"Stars whisper secrets in the midnight glow."', '"Deep blue echoes of the cosmos."', '"After midnight, we roam free."', '"Between the ticks of midnight, messages fly."', '"Stars are just holes in the dark letting light through."', '"Midnight oil burns brighter than the morning sun."', '"The moon is a loyal companion in every late-night chat."', '"In the deep blue hour, words flow freely."'],
        'seasonal-spring': ['"Blooming with possibilities."', '"Fresh starts and new beginnings."', '"Cherry blossoms and gentle breezes."', '"April showers bring May flowers and fresh conversations."', '"Everything grows when given light and water. Even friendships."', '"Spring fever meets chat energy."', '"A season of renewal and reconnection."'],
        'seasonal-summer': ['"Basking in the warmth."', '"Endless days and golden rays."', '"Summer vibes, all year long."', '"Long days, short nights, endless conversations."', '"Heat waves and good vibes."', '"Summer state of mind."', '"The sun doesn\'t rush. Neither should you."'],
        'seasonal-fall': ['"Embracing the change of seasons."', '"Golden leaves and crisp air."', '"Cozy nights and warm tones."', '"Let the falling leaves remind you that letting go is beautiful."', '"Sweater weather and deep conversations."', '"Crisp air and warm hearts."', '"Everything changes. That\'s the beauty of it."'],
        'seasonal-winter': ['"A quiet snowfall of pixels."', '"Cold outside, warm inside."', '"Winter\'s embrace in every frame."', '"Cold outside, warm inside. The best kind of winter."', '"Each snowflake is unique. So is every message."', '"Winter is the season of introspection and hot cocoa."', '"Blankets of snow, blankets of conversation."'],
        'ocean': ['"Diving into the deep blue."', '"Waves of tranquility wash over."', '"Beneath the surface, calm awaits."', '"The ocean\'s surface hides depths we\'ve yet to explore."', '"Salt water heals everything. Even a tired soul."', '"Let the waves carry your thoughts."', '"Deep as the ocean, vast as the sky."'],
        'forest': ['"Among the towering pines."', '"Nature\'s palette in every shade of green."', '"Where the wild things are."', '"The forest speaks in whispers. Listen closely."', '"Among the trees, we find ourselves."', '"Mossy paths lead to the best discoveries."', '"Breathe in the green, breathe out the noise."'],
        'sunset': ['"Painting the sky with fire."', '"Golden hour, extended."', '"The sun never sets on Orbit."', '"Every sunset is an opportunity to reset."', '"The sky\'s farewell kiss at the end of each day."', '"Golden hues paint the end of a perfect day."', '"Sunsets are proof that endings can be beautiful."'],
        'coffee': ['"Brewing something special."', '"Warm mugs and good vibes."', '"Another cup of conversation."', '"Good coffee, better conversations."', '"Coffee: the original productivity hack."', '"Brewed with care, served with love."', '"A warm cup of connection."'],
        'retro': ['"Floppy disks and neon dreams."', '"Back to the future of chat."', '"Pixel-perfect nostalgia."', '"Floppy disks held 1.44MB. Our conversations hold so much more."', '"Pixel art is just modern impressionism."', '"Retro vibes, future connections."', '"8-bit dreams in a 64-bit world."'],
        'custom': ['"Your vision, realized."', '"Colors of your imagination."', '"Uniquely yours."', '"Your palette, your world."', '"Every color tells a story. What\'s yours?"', '"Custom-crafted for your unique taste."', '"The perfect blend of your imagination."']
      };
      var texts = themeTexts[theme] || ['"A new look for a new mood."'];
      var msg = texts[Math.floor(Math.random() * texts.length)];
      if (window.Toast) {
        setTimeout(function() {
          if (window.Toast) window.Toast.show('Theme Changed', msg, 'info', 3000);
        }, 400);
      }
    }
    window._prevTheme = theme;

    if (settings.customThemeColors && theme === 'custom') {
      Object.keys(settings.customThemeColors).forEach(function(key) {
        document.documentElement.style.setProperty('--' + key, settings.customThemeColors[key]);
      });
    } else if (theme !== 'custom') {
      var customKeys = ['bg-base','bg-surface','bg-sidebar','bg-hover','bg-active','text-primary','text-secondary','text-muted','accent-primary','accent-hover','accent-soft','border-subtle','border-strong'];
      customKeys.forEach(function(key) {
        document.documentElement.style.removeProperty('--' + key);
      });
    }

    var speed = settings.animSpeed || 'normal';
    var durations = { slow: '0.35s', normal: '0.18s', fast: '0.1s' };
    var dur = durations[speed] || '0.18s';
    document.documentElement.style.setProperty('--transition-duration', dur);

    if (settings.animations === false) {
      document.documentElement.style.setProperty('--transition', 'none');
    } else {
      document.documentElement.style.setProperty('--transition', 'all ' + dur + ' cubic-bezier(0.4, 0, 0.2, 1)');
    }

    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
    if (settings.reduceMotion && window.freezeGifImages) window.freezeGifImages(document);

    document.body.setAttribute('data-message-anim', settings.messageAnim || 'slide');

    if (settings.chatWallpaper) {
      document.documentElement.style.setProperty('--chat-bg-image', 'url("' + settings.chatWallpaper + '")');
      document.documentElement.style.setProperty('--chat-bg-size', 'cover');
    } else if (settings.bgPattern === 'Dots') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (settings.bgPattern === 'Grid') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (settings.bgPattern === 'Diagonal Stripes') {
      document.documentElement.style.setProperty('--chat-bg-image', 'repeating-linear-gradient(45deg, transparent, transparent 12px, var(--border-subtle) 12px, var(--border-subtle) 13px)');
      document.documentElement.style.setProperty('--chat-bg-size', '');
    } else if (settings.bgPattern === 'Crosshatch') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px), radial-gradient(var(--border-subtle) 0.5px, transparent 0.5px)');
      document.documentElement.style.setProperty('--chat-bg-size', '30px 30px, 30px 30px, 15px 15px');
    } else if (settings.bgPattern === 'Circles') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(circle at 50% 50%, var(--border-subtle) 2px, transparent 2px)');
      document.documentElement.style.setProperty('--chat-bg-size', '30px 30px');
    } else {
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
    }

    document.body.setAttribute('data-bubbles', settings.messageBubbles || 'Modern');

    // ⚠ `classicBubbles` is a LOOK, not a preference flag: it fills your own bubble
    // with the accent. On <html> rather than on the bubble, so one rule in
    // components.css can reach it in both UIs — the redesign tints your own bubble,
    // and this has to outrank that.
    if (settings.classicBubbles === true) {
      document.documentElement.setAttribute('data-classic-bubbles', 'true');
    } else {
      document.documentElement.removeAttribute('data-classic-bubbles');
    }

    if (settings.fontSize === 'Small') document.body.style.fontSize = '14px';
    else if (settings.fontSize === 'Large') document.body.style.fontSize = '18px';
    else document.body.style.fontSize = '16px';

    document.documentElement.classList.toggle('dev-mode', !!settings.devMode);
    document.documentElement.classList.toggle('debug-display', !!settings.debugDisplay);
    document.documentElement.classList.toggle('show-message-ids', !!settings.showMessageIds);
    document.documentElement.classList.toggle('show-conn-stats', !!settings.showConnectionStats);
    document.documentElement.classList.toggle('experimental', !!settings.enableExperimental);
    document.documentElement.classList.toggle('experimental-animated-avatars', !!settings.experimentalAnimatedAvatars);
    document.documentElement.classList.toggle('experimental-message-fx', !!settings.experimentalMessageFx);
    document.documentElement.classList.toggle('experimental-compact-spacing', !!settings.experimentalCompactSpacing);
    document.documentElement.classList.toggle('experimental-fps-monitor', !!settings.experimentalFpsMonitor);
    document.documentElement.classList.toggle('experimental-dev-overlay', !!settings.experimentalDevOverlay);
    var perfMode = !!settings.experimentalPerformanceMode;
    document.documentElement.classList.toggle('performance-mode', perfMode);
    window._performanceMode = perfMode;

    // GIF freezing — bypass reduceMotion check when perf mode is on
    if (perfMode && window.freezeGifImages) {
      window.freezeGifImages(document, true);
    }

    // Link previews — disable background OG fetching
    if (perfMode) {
      window._linkPreviewCache = {};
    }

    // Connection stats overlay — stop the 2s interval
    if (perfMode && window._connStatsInterval) {
      clearInterval(window._connStatsInterval);
      window._connStatsInterval = null;
    }

    // Offline check interval — slow to 60s in perf mode, restore to 15s otherwise
    if (window._offlineCheckInterval) {
      clearInterval(window._offlineCheckInterval);
    }
    window._offlineCheckInterval = setInterval(function() {
      var state = window.store.getState();
      var now = Date.now();
      var updated = state.friends.map(function(f) {
        if (f.userId !== 'local-echo' && f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) {
          return { ...f, status: 'offline' };
        }
        return f;
      });
      window.store.setState({ friends: updated });
    }, perfMode ? 60000 : 15000);
  };

  // Freeze GIF images when reduce-motion or performance mode is enabled
  window._frozenCache = new Map();
  window.freezeGifImages = function(root, force) {
    if (!root) root = document;
    if (!root.querySelectorAll) return;
    if (!force) {
      var reduceMotion = window.store && window.store.getState && window.store.getState().settings && window.store.getState().settings.reduceMotion;
      if (!reduceMotion && !window._performanceMode) return;
    }
    function freezeOne(img) {
      img.setAttribute('data-frozen', 'true');
      var src = img.currentSrc || img.src;
      if (window._frozenCache.has(src)) {
        if (img.src !== window._frozenCache.get(src)) img.src = window._frozenCache.get(src);
        return;
      }
      if (img.complete && img.naturalWidth > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        var frozen = canvas.toDataURL('image/png');
        window._frozenCache.set(src, frozen);
        img.src = frozen;
      } else {
        img.addEventListener('load', function() {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          var frozen = c.toDataURL('image/png');
          window._frozenCache.set(img.currentSrc || img.src, frozen);
          img.src = frozen;
        });
      }
    }
    root.querySelectorAll('img[src*=".gif"]:not([data-frozen]), img[src*="data:image/gif"]:not([data-frozen]), .avatar img:not([data-frozen])').forEach(freezeOne);
  };

  applySettings(window.store.getState().settings);

  document.body.style.zoom = (window.store.getState().settings.appZoom || 100) + '%';

  darkModeMedia.addEventListener('change', () => {
    var state = window.store.getState();
    if (state.settings.theme === 'system') {
      applySettings(state.settings);
    }
  });

  // ---- Phase 1 (immediate): Settings, layout, keyboard shortcuts ----
  const appLayout = document.getElementById('app-layout');
  const resizer = document.getElementById('sidebar-resizer');
  let isResizing = false;
  let currentSidebarWidth = window.Storage ? window.Storage.get('sidebarWidth', 260) : 260;

  const updateSidebarWidth = (width) => {
    if (width < 200) width = 200;
    if (width > 500) width = 500;
    currentSidebarWidth = width;
    appLayout.style.gridTemplateColumns = '64px ' + width + 'px 1fr';
  };

  updateSidebarWidth(currentSidebarWidth);

  if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX - 64;
      updateSidebarWidth(newWidth);
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        if (window.Storage) window.Storage.set('sidebarWidth', currentSidebarWidth);
      }
    });
  }

  document.addEventListener('keydown', function(e) {
    var ctrl = e.ctrlKey || e.metaKey;
    var key = e.key.toLowerCase();
    if (ctrl && key === 'k') {
      e.preventDefault();
      if (window.ChatPanel) window.ChatPanel.showSearchModal();
      return;
    }
    if (ctrl && e.shiftKey && key === 'm') {
      e.preventDefault();
      var state = window.store.getState();
      var chatId = state.activeChatId;
      if (chatId && chatId !== 'local-echo') {
        window.store.toggleMute(chatId);
        var isMuted = state.mutedChats && state.mutedChats[chatId];
        if (window.Toast) window.Toast.show(isMuted ? 'Unmuted' : 'Muted', isMuted ? 'Notifications enabled' : 'Notifications muted');
      }
      return;
    }
    if ((ctrl && e.shiftKey && key === 'i') || key === 'f12') {
      e.preventDefault();
      var state = window.store.getState();
      if (state.settings && state.settings.devMode) {
        if (window.orbitAPI && window.orbitAPI.toggleDevtools) {
          window.orbitAPI.toggleDevtools();
        }
      } else {
        if (window.Toast) {
          window.Toast.show('Access Denied', 'Enable Developer Mode in Advanced Settings to access tools.', 'warning', 3000);
        }
      }
      return;
    }
    if (key === '/' && !ctrl && !e.shiftKey && !e.altKey) {
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      e.preventDefault();
      var input = document.getElementById('chat-input');
      if (input) input.focus();
      return;
    }
    // Konami code easter egg: ↑↑↓↓←→←→BA (using e.code for reliability)
    if (!window._konamiSeq) window._konamiSeq = [];
    var kc = e.code;
    var konamiMap = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyB: 'b', KeyA: 'a' };
    var mapped = konamiMap[kc];
    if (mapped) {
      if (mapped === 'up' || mapped === 'down' || mapped === 'left' || mapped === 'right') {
        e.preventDefault(); // prevent scrolling during sequence
      }
      window._konamiSeq.push(mapped);
      if (window._konamiSeq.length > 10) window._konamiSeq.shift();
      var seq = window._konamiSeq.join(',');
      if (seq === 'up,up,down,down,left,right,left,right,b,a' || seq === 'up,up,down,down,left,right,left,right,a,b') {
        window._konamiSeq = [];
        var cur = window.store.getState().settings.devMode;
        var updateSettings = function(key, val) {
          var newSettings = { ...window.store.getState().settings };
          newSettings[key] = val;
          window.store.setState({ settings: newSettings });
          window.Storage.set('settings', newSettings);
          if (window.App && window.App.applySettings) window.App.applySettings(newSettings);
        };
        updateSettings('devMode', !cur);
        if (window.Toast) {
          window.Toast.show('Konami!', cur ? 'Developer Mode disabled' : 'Developer Mode enabled' + (!cur ? ' — You found the secret!' : ''), !cur ? 'success' : 'info', 4000);
        }
      }
    }
    // Debug: show Konami sequence in title bar
    if (window._konamiSeq && window._konamiSeq.length > 0) {
      document.title = '[' + window._konamiSeq.join(' ') + '] Orbit Beta';
    } else {
      document.title = 'Orbit Beta';
    }
  });

  // Midnight sleep reminder (12AM-5AM, dark/midnight themes only)
  setTimeout(function() {
    try {
      var hr = new Date().getHours();
      if (hr >= 0 && hr < 5) {
        var theme = window.store.getState().settings.theme || 'dark';
        if (theme === 'dark' || theme === 'midnight') {
          if (window.Toast) {
            window.Toast.show('🌙 Late Night Chatting', 'It\'s ' + hr + ':00 and you\'re still here? Maybe get some sleep, night owl. 🌌', 'info', 8000);
          }
        }
      }
    } catch(e) {}
  }, 3000);

  // ---- Phase 2 (next frame): Identity, network, views ----
  function startPhase2() {
    setTimeout(function() {
    window.store.subscribe((state, changedState) => {
      if (!changedState || 'settings' in changedState) applySettings(state.settings);
    });

    // ⚠ THE WELCOME DECORATION STANDS STILL WHILE THE LAYOUT MOVES.
    //
    // `#app-layout` transitions `grid-template-columns` over 300ms, so the chat
    // panel — and everything painted inside it — is a different size on every
    // frame of that slide. The welcome screen's aurora is a `filter: blur(34px)`
    // pseudo-element with an infinite transform animation, and a blurred layer
    // that changes size every frame has to be re-rasterised every frame.
    //
    // Measured on the welcome screen, one sidebar toggle, frames rendered in a
    // 400ms window (~24 is 60fps):
    //     aurora painting   22 frames, 20.8ms apart
    //     aurora hidden     53 frames,  8.0ms apart
    // and with a chat open — no aurora, nothing to hide — the toggle was smooth,
    // which is exactly the shape Dan described: "it's only the WELCOME_SLIDE_SHOW".
    //
    // ⚠ A FADE DOES NOT WORK. `opacity: 0` with a 150ms transition measured 28
    // frames: a fading layer is still a layer being rasterised. It has to go, not
    // dim. `visibility: hidden` beat `display: none` by a hair and keeps the
    // pseudo-element in the tree, so there is nothing to re-create on the way back.
    function beginLayoutMove() {
      var layout = document.getElementById('app-layout');
      if (!layout) return;
      layout.classList.add('is-resizing');
      var timer = null;
      var done = function () {
        layout.removeEventListener('transitionend', onEnd);
        if (timer) clearTimeout(timer);
        timer = null;
        layout.classList.remove('is-resizing');
      };
      var onEnd = function (e) {
        if (e.target === layout && e.propertyName === 'grid-template-columns') done();
      };
      layout.addEventListener('transitionend', onEnd);
      // If the transition never runs — reduced motion, or the columns already at
      // their target — nothing fires `transitionend`, and the class would stick.
      timer = setTimeout(done, 400);
    }

    window.store.subscribe((state, changedState) => {
      if (!changedState || !('activeTab' in changedState || 'sidebarMiddleVisible' in changedState)) return;
      beginLayoutMove();
      const panelMiddle = document.getElementById('panel-middle');
      if (state.activeTab === 'gallery') {
        if (panelMiddle) panelMiddle.style.display = 'none';
        appLayout.classList.remove('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '64px 1fr';
        if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
        return;
      }
      if (panelMiddle) panelMiddle.style.display = 'flex';
      if (!state.sidebarMiddleVisible) {
        appLayout.classList.add('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '';
        var btn = window._sidebarToggleBtn;
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'btn-reopen-sidebar';
          btn.title = 'Show Sidebar';
          btn.style.cssText = 'position:absolute;left:0;top:50%;transform:translateY(-50%);z-index:10;width:24px;height:48px;border:1px solid var(--border-subtle);border-left:none;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;border-radius:0 8px 8px 0;display:flex;align-items:center;justify-content:center;transition:opacity 0.2s;';
          btn.innerHTML = '<i data-lucide="chevrons-right" style="width:16px;height:16px;"></i>';
          btn.addEventListener('click', function() {
            window.store.setState({ sidebarMiddleVisible: true });
          });
          document.getElementById('panel-right').appendChild(btn);
          if (window.lucide) window.lucide.createIcons({ root: btn });
          window._sidebarToggleBtn = btn;
        }
        btn.style.display = 'flex';
      } else {
        appLayout.classList.remove('sidebar-collapsed');
        appLayout.style.gridTemplateColumns = '64px ' + currentSidebarWidth + 'px 1fr';
        if (window._sidebarToggleBtn) window._sidebarToggleBtn.style.display = 'none';
      }
    });

    if (window.Identity) {
      window.Identity.init();
      // Filter data for the current user (per-account message isolation)
      if (window.store) {
        window.store.reloadDataForCurrentUser();
        window.store.trackChatForCurrentUser('local-echo');
      }
    }

    // Profile frame migration — runs after Identity.init() so currentUser is real
    (function() {
      var state = window.store.getState();
      var pf = state.settings && state.settings.profileFrame;
      var cur = state.currentUser && state.currentUser.profileFrame;
      if (state.currentUser && state.currentUser.userId && pf && pf !== cur) {
        var updated = { ...state.currentUser, profileFrame: pf };
        window.store.setState({ currentUser: updated });
        if (window.orbitAPI) window.orbitAPI.dbSaveUser(updated);
      }
    })();

    // P2P stats tracking
    window._p2pStartTime = Date.now();
    window._p2pSentCount = 0;
    window._p2pRecvCount = 0;

    if (window.orbitAPI) {
      var state = window.store.getState();
      var reconnectEnabled = state.settings.netAutoReconnect !== false;
      var reconnectIntervalMs = (state.settings.netReconnectInterval || 10) * 1000;
      window.orbitAPI.networkStart(state.currentUser, reconnectEnabled, reconnectIntervalMs);

      window.orbitAPI.on('peer-found', (peer) => {
        console.log('[Renderer] peer-found:', peer.username, 'IP:', peer.ip);
        window.store.addOrUpdatePeer(peer);
      });

      window.orbitAPI.on('peer-gone', (peerId) => {
        if (peerId === 'local-echo') return;
        console.log('[Renderer] peer-gone:', peerId);
        var state = window.store.getState();
        var friends = state.friends.map(function(f) {
          if (f.userId === peerId && f.status === 'online') {
            return { ...f, status: 'offline', lastSeen: Date.now() };
          }
          return f;
        });
        window.store.setState({ friends: friends });
      });

      window.orbitAPI.on('network-message', (packet) => {
        if (packet.type === window.Protocol.Types.FILE_TRANSFER_RESUME) {
          // Receiver asked the sender to resume a partial chunked transfer.
          // The main process only forwards this when no main-process send
          // session owns the fileId — the renderer chat path handles it.
          if (window.ChatPanel && window.ChatPanel.handleFileTransferResume) {
            window.ChatPanel.handleFileTransferResume(packet);
          }
          return;
        }
        if (packet.type === window.Protocol.Types.TYPING) {
          var chatId = (packet.payload && packet.payload.groupId) || packet.from;
          var isTyping = packet.payload && packet.payload.isTyping;
          var username = packet.payload ? packet.payload.username : 'Someone';
          if (isTyping) {
            window.TypingState.addUser(chatId, packet.from, username);
          } else {
            window.TypingState.removeUser(chatId, packet.from);
          }
          return;
        }
        if (packet.type === window.Protocol.Types.GROUP_JOIN_REQUEST) {
          var joinPayload = packet.payload;
          var currentState = window.store.getState();
          var myGroup = currentState.groups.find(function(g) { return g.inviteCode === joinPayload.inviteCode && g.ownerId === currentState.currentUser.userId; });
          if (myGroup && window.ConfirmModal) {
            var requester = currentState.friends.find(function(f) { return f.userId === joinPayload.userId; });
            var requesterName = requester ? requester.username : joinPayload.username || 'Someone';
            window.ConfirmModal.show({
              title: 'Join Request',
              message: requesterName + ' wants to join "' + myGroup.groupName + '". Allow them in?',
              confirmText: 'Accept',
              cancelText: 'Deny',
              danger: false,
              onConfirm: function() {
                var newMember = { userId: joinPayload.userId, username: joinPayload.username, usertag: joinPayload.usertag || '', avatar: joinPayload.avatar || null, status: 'online', ip: requester ? requester.ip || '' : '', role: 'member', publicKey: joinPayload.publicKey || null };
                window.store.addMemberToGroup(myGroup.groupId, newMember);
                if (window.orbitAPI && requester) {
                  window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                    groupId: myGroup.groupId,
                    groupName: myGroup.groupName,
                    groupAvatar: myGroup.avatarDataUrl || null,
                    accepted: true,
                    members: [...(myGroup.members || []), newMember]
                  });
                  (myGroup.members || []).forEach(function(m) {
                    if (m.userId !== currentState.currentUser.userId) {
                      window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_MEMBER_ADDED, {
                        groupId: myGroup.groupId,
                        user: { userId: newMember.userId, username: newMember.username, usertag: newMember.usertag, avatar: newMember.avatar, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: newMember.publicKey }
                      });
                    }
                  });
                }
              },
              onCancel: function() {
                if (window.orbitAPI && requester) {
                  window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                    groupId: myGroup.groupId,
                    groupName: myGroup.groupName,
                    accepted: false
                  });
                }
              }
            });
          } else if (myGroup) {
            var newMember = { userId: joinPayload.userId, username: joinPayload.username, usertag: joinPayload.usertag || '', avatar: joinPayload.avatar || null, status: 'online', ip: null, role: 'member', publicKey: joinPayload.publicKey || null };
            window.store.addMemberToGroup(myGroup.groupId, newMember);
            var requester = currentState.friends.find(function(f) { return f.userId === joinPayload.userId; });
            if (window.orbitAPI && requester) {
              window.orbitAPI.networkSend(joinPayload.userId, requester.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, {
                groupId: myGroup.groupId,
                groupName: myGroup.groupName,
                groupAvatar: myGroup.avatarDataUrl || null,
                accepted: true,
                members: [...(myGroup.members || []), newMember]
              });
              (myGroup.members || []).forEach(function(m) {
                if (m.userId !== currentState.currentUser.userId) {
                  window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_MEMBER_ADDED, {
                    groupId: myGroup.groupId,
                    user: { userId: newMember.userId, username: newMember.username, usertag: newMember.usertag, avatar: newMember.avatar, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: newMember.publicKey }
                  });
                }
              });
            }
          }
          return;
        }
        if (packet.type === window.Protocol.Types.BEACON) {
          var bp = packet.payload || {};
          var state = window.store.getState();
          var friends = state.friends.map(function(f) {
            if (f.userId === (packet.from || bp.userId)) {
              var updated = { ...f, lastSeen: Date.now(), status: bp.status || f.status };
              if (bp.avatar !== undefined) updated.avatar = bp.avatar;
              if (bp.banner !== undefined) updated.banner = bp.banner;
              if (bp.bio !== undefined) updated.bio = bp.bio;
              if (bp.profileFrame !== undefined) updated.profileFrame = bp.profileFrame;
              if (bp.publicKey) updated.publicKey = bp.publicKey;
              return updated;
            }
            return f;
          });
          window.store.setState({ friends: friends });
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_OFFER) {
          var offerData = packet.payload;
          var state = window.store.getState();
          var caller = state.friends.find(function(f) { return f.userId === packet.from; }) || { username: packet.payload.callerName, avatar: packet.payload.callerAvatar };

          // Group call offer
          if (offerData.groupId) {
            if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup && window.CallManager.groupCallId === offerData.groupId) {
              // Already in this group call — this is another member connecting to us
              window.CallManager._connectGroupParticipant(packet.from, offerData.callerName, offerData.callerAvatar, offerData.sdp, offerData.isVideo, offerData.groupId);
              return;
            }
            if (window.CallManager && window.CallManager.activeCall) {
              if (window.orbitAPI) {
                window.orbitAPI.networkSend(packet.from, packet._fromIp || '', window.Protocol.Types.CALL_DECLINE, { reason: 'busy', groupId: offerData.groupId });
              }
              return;
            }
            // New incoming group call
            window.CallManager.targetUserId = packet.from;
            window.CallManager.targetPeerIp = packet._fromIp || (caller ? caller.ip : '');
            window.CallManager.incomingCallData = {
              callerId: packet.from, sdp: offerData.sdp, isVideo: offerData.isVideo,
              callerName: offerData.callerName, callerAvatar: offerData.callerAvatar,
              groupId: offerData.groupId
            };
            if (window.CallModal) {
              window.CallModal.show({ username: offerData.callerName || caller.username, avatar: offerData.callerAvatar || caller.avatar }, offerData.isVideo, true);
              var statusEl = window.CallModal.overlay && window.CallModal.overlay.querySelector('#call-status-text');
              if (statusEl) statusEl.textContent = 'Group call from ' + (offerData.groupName || 'Group');
            }
            return;
          }

          // DM call
          if (window.CallManager && window.CallManager.activeCall) {
            if (window.orbitAPI) {
              window.orbitAPI.networkSend(packet.from, packet._fromIp || '', window.Protocol.Types.CALL_DECLINE, { reason: 'busy' });
            }
            return;
          }
          window.CallManager.targetUserId = packet.from;
          window.CallManager.targetPeerIp = packet._fromIp || (caller ? caller.ip : '');
          window.CallManager.incomingCallData = {
            callerId: packet.from, sdp: offerData.sdp, isVideo: offerData.isVideo,
            callerName: offerData.callerName, callerAvatar: offerData.callerAvatar
          };
          if (window.CallModal) {
            window.CallModal.show({ username: offerData.callerName || caller.username, avatar: offerData.callerAvatar || caller.avatar }, offerData.isVideo, true);
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_ANSWER) {
          if (packet.payload.groupId && window.CallManager && window.CallManager.peerConnections) {
            var answererId = packet.payload.answererId || packet.from;
            var pc = window.CallManager.peerConnections[answererId];
            if (pc) {
              var answerDesc = new RTCSessionDescription({ type: 'answer', sdp: packet.payload.sdp });
              pc.setRemoteDescription(answerDesc).catch(function(err) {
                console.error('Set remote description (group answer) error:', err);
              });
            }
          } else if (window.CallManager && window.CallManager.peerConnection) {
            var answerDesc = new RTCSessionDescription({ type: 'answer', sdp: packet.payload.sdp });
            window.CallManager.peerConnection.setRemoteDescription(answerDesc).catch(function(err) {
              console.error('Set remote description (answer) error:', err);
            });
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_ICE_CANDIDATE) {
          if (packet.payload.groupId && window.CallManager) {
            window.CallManager.addGroupIceCandidate(packet.from, packet.payload);
          } else if (window.CallManager) {
            window.CallManager.addIceCandidate(packet.payload);
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_END) {
          if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup) {
            var leftUserId = packet.payload.userId || packet.from;
            if (window.CallManager.participants[leftUserId]) {
              if (window.CallModal) window.CallModal.removeParticipant(leftUserId);
              window.CallManager._removeGroupParticipant(leftUserId);
            } else {
              window.CallManager.cleanup();
            }
          } else {
            if (window.Toast) window.Toast.show('Call Ended', 'The other party ended the call.', 'info');
            if (window.CallManager) window.CallManager.cleanup();
          }
          return;
        }

        if (packet.type === window.Protocol.Types.CALL_DECLINE) {
          if (window.CallManager && window.CallManager.activeCall && window.CallManager.activeCall.isGroup) {
            var declUserId = packet.from;
            if (window.CallModal) window.CallModal.removeParticipant(declUserId);
            if (window.CallManager.peerConnections[declUserId]) {
              try { window.CallManager.peerConnections[declUserId].close(); } catch(e) {}
              delete window.CallManager.peerConnections[declUserId];
            }
            if (window.Toast) window.Toast.show('Declined', 'A participant declined the call.', 'warning');
          } else {
            if (window.Toast) window.Toast.show('Call Declined', 'The other party declined the call.', 'warning');
            if (window.CallManager) {
              if (window.CallModal) window.CallModal.updateStatus('Declined');
              setTimeout(function() { if (window.CallManager) window.CallManager.cleanup(); }, 1000);
            }
          }
          return;
        }

        window.store.handleIncomingPacket(packet);
      });

      window.orbitAPI.on('file-received', (data) => {
        console.log('File received:', data);
        var settings = window.store.getState().settings || {};
        if (settings.notifySound && !settings.notifyDnd && window.NotificationSound) {
          window.NotificationSound.play({ volume: settings.notifyVolume, type: settings.notifySoundType });
        }
        if ((document.hidden || window.store.getState().activeChatId !== data.sender) && window.orbitAPI && window.orbitAPI.showNotification) {
          var senderName = 'Someone';
          var senderAvatar = null;
          var friend = window.store.getState().friends.find(function(f) { return f.userId === data.sender; });
          if (friend) { senderName = friend.username; senderAvatar = friend.avatar; }
          window.orbitAPI.showNotification('File from ' + senderName, data.name, senderAvatar);
        }
        const isImage = data.name.match(/\.(jpeg|jpg|gif|png|webp|svg)$/i) != null;
        const isVideo = data.name.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v|wmv|flv|f4v|ts|mts|m2ts)$/i) != null;
        const isAudio = data.name.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mka)$/i) != null;
        const attId = data.fileId || (window.orbitAPI ? window.orbitAPI.getUuid() : Date.now().toString());
        const fileSize = data.size || 0;
        // Default type/MIME for the !found fallback (overridden inside the found loop if found)
        var attType = 'file';
        var attMime = 'application/octet-stream';
        // CRIT-4: Try to find existing message with matching _fileId attachment, update it
        var stateMsgs = window.store.getState().messages || {};
        var found = false;
        for (var _chatId in stateMsgs) {
          var msgs = stateMsgs[_chatId] || [];
          for (var mi = 0; mi < msgs.length; mi++) {
            var atts = msgs[mi].attachments;
            if (atts && Array.isArray(atts)) {
              for (var ai = 0; ai < atts.length; ai++) {
                if (atts[ai]._fileId === data.fileId) {
                  // FIX (AV-2s-skip): Honor the sender's type classification from the pending
                  // MESSAGE attachment rather than re-classifying by file extension alone.
                  // Mobile correctly classifies .webm audio-only as 'audio', but the extension
                  // heuristic below would force it to 'video' (since .webm is in isVideo regex),
                  // routing it to the video player where decode errors trigger a +2s seek.
                  var senderType = atts[ai].type;
                  if (senderType && senderType !== 'file') {
                    attType = senderType;
                    // Use mimeType from START packet if provided (more reliable than extension mapping)
                    if (data.mimeType && data.mimeType.indexOf('/') !== -1) {
                      attMime = data.mimeType;
                    } else if (attType === 'audio') {
                      var ext = data.name.split('.').pop().toLowerCase();
                      var extMap = { webm: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', opus: 'audio/opus', mka: 'audio/x-matroska' };
                      attMime = extMap[ext] || 'audio/webm';
                    } else if (attType === 'video') {
                      var vext = data.name.split('.').pop().toLowerCase();
                      var videoExtMap2 = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', f4v: 'video/mp4', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t' };
                      attMime = videoExtMap2[vext] || 'video/mp4';
                    } else if (attType === 'image') {
                      var iext = data.name.split('.').pop().toLowerCase();
                      var imgExtMap = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' };
                      attMime = imgExtMap[iext] || 'image/png';
                    } else {
                      attMime = 'application/octet-stream';
                    }
                  } else {
                    // No sender hint — fall back to extension-based classification
                    if (isImage) {
                      attType = 'image';
                      attMime = data.name.toLowerCase().endsWith('.gif') ? 'image/gif' : (data.name.toLowerCase().endsWith('.png') ? 'image/png' : (data.name.toLowerCase().endsWith('.webp') ? 'image/webp' : (data.name.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg')));
                    } else if (isVideo) {
                      attType = 'video';
                      var videoExtMap = { mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp' };
                      var vext = data.name.split('.').pop().toLowerCase();
                      attMime = videoExtMap[vext] || 'video/mp4';
                    } else if (isAudio) {
                      attType = 'audio';
                      var extMap = { webm: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma' };
                      var ext = data.name.split('.').pop().toLowerCase();
                      attMime = extMap[ext] || 'audio/webm';
                    } else {
                      attType = 'file';
                      attMime = 'application/octet-stream';
                    }
                  }
                  atts[ai].type = attType;
                  atts[ai].mimeType = attMime;
                  atts[ai].url = 'orbit-db://attachment/' + data.fileId;
                  atts[ai].path = data.path;
                  atts[ai].size = fileSize;
                  atts[ai].name = data.name;
                  atts[ai]._pending = false;
                  atts[ai]._poster = atts[ai]._poster || null;
                  // CRIT-5: Persist received file data into DB so orbit-db:// resolves after restart
                  try {
                    window.orbitAPI.dbSaveAttachment(msgs[mi].id, {
                      id: atts[ai].id || data.fileId,
                      type: attType,
                      name: data.name,
                      size: fileSize,
                      path: data.path
                    });
                  } catch(e) { console.error('[file-received] dbSaveAttachment failed:', e); }
                  window.store.notify();
                  found = true;
                  break;
                }
              }
            }
            if (found) break;
          }
          if (found) break;
        }

        if (!found) {
          // If no pending message found, use type/mime from START packet if available
          if (data.type && data.type !== 'file' && data.type !== '') {
            attType = data.type;
            if (data.mimeType && data.mimeType.indexOf('/') !== -1) {
              attMime = data.mimeType;
            }
          }
          // Fallback: create new message entry
          window.store.handleIncomingPacket({
            type: window.Protocol.Types.MESSAGE,
            from: data.sender,
            payload: {
              text: '',
              attachments: [{
                id: attId,
                type: attType,
                mimeType: attMime,
                name: data.name,
                size: fileSize,
                path: data.path,
                url: 'orbit-db://attachment/' + attId
              }]
            }
          });
        }
      });

      window.orbitAPI.on('transfer-progress', (data) => {
        window.store.handleTransferProgress(data);
      });

      window.orbitAPI.on('transfer-error', (data) => {
        window.store.handleTransferError(data);
      });

      window.orbitAPI.on('state-invalidate', () => {
        window.location.reload();
      });

      // ---- Tray menu --------------------------------------------------------
      // The tray lives in the main process and delegates every stateful action
      // here. The renderer stays the single writer for presence and mute, then
      // reports the result back so the tray's radio/checkbox items reflect what
      // actually happened instead of what main assumed would happen.
      function pushTrayState() {
        try {
          var st = window.store.getState();
          var cu = st.currentUser || {};
          window.orbitAPI.send('tray-state', {
            status: cu.status || 'online',
            muted: !!(st.settings && st.settings.notifyDnd),
            name: cu.username || '',
            tag: cu.usertag || ''
          });
        } catch (e) { /* the tray is optional — never let it break boot */ }
      }

      window.orbitAPI.on('tray-action', (data) => {
        if (!data || !data.action) return;
        try {
          if (data.action === 'set-status') {
            var cu = window.store.getState().currentUser;
            if (!cu) return;
            var updated = { ...cu, status: data.value };
            window.store.setState({ currentUser: updated });
            window.orbitAPI.dbSaveUser(updated);
            // Tell connected peers immediately rather than waiting for the next beacon.
            if (window.orbitAPI.broadcastBeacon) window.orbitAPI.broadcastBeacon(updated);
          } else if (data.action === 'toggle-mute') {
            var s = { ...window.store.getState().settings };
            s.notifyDnd = !s.notifyDnd;
            window.store.setState({ settings: s });
            // _persistSettings dual-writes Storage AND the SQLite settings table,
            // which is the table dbGetAllStartupData() reads at startup.
            if (window.store._persistSettings) window.store._persistSettings();
            if (window.App && window.App.applySettings) window.App.applySettings(s);
            if (window.Toast) {
              window.Toast.show(s.notifyDnd ? 'Muted' : 'Unmuted',
                s.notifyDnd ? 'Notifications muted' : 'Notifications enabled');
            }
          } else if (data.action === 'check-updates') {
            if (window.UpdateNotice && window.UpdateNotice.checkManual) window.UpdateNotice.checkManual();
          } else if (data.action === 'lock') {
            if (window.PinLockScreen) window.PinLockScreen.show(function() {});
          }
        } catch (e) {
          console.warn('[Tray] action failed:', data.action, e);
        }
      });

      // Any writer of settings/currentUser keeps the tray truthful — including the
      // Settings UI, which knows nothing about the tray.
      window.store.subscribe(function (state, changed) {
        if (changed && ('settings' in changed || 'currentUser' in changed)) pushTrayState();
      });
      pushTrayState();
    }

    if (window.SidebarLeft) window.SidebarLeft.init();

    // Initialize UndoManager
    if (window.UndoManager) {
      window.UndoManager.init();
    }

    // Track chat navigation as undoable actions
    var _lastChatId = null;
    var _chatNavSub = window.store.subscribe(function(state, changed) {
      if (changed && 'activeChatId' in changed && state.activeChatId && state.activeChatId !== _lastChatId) {
        var prevChatId = _lastChatId;
        var newChatId = state.activeChatId;
        _lastChatId = newChatId;
        // Don't record if this navigation was triggered by an undo/redo
        if (window.UndoManager && window.UndoManager._paused) return;
        window.UndoManager.pushAction(
          'Switch to ' + (newChatId === 'local-echo' ? 'Orbit Echo' : 'Chat'),
          function() {
            // Undo: go back to previous chat
            window.store.setState({ activeChatId: prevChatId || 'local-echo', activeTab: 'dms' });
          },
          function() {
            // Redo: go to new chat
            window.store.setState({ activeChatId: newChatId, activeTab: 'dms' });
          }
        );
      }
    });

    if (window.SidebarMiddle) window.SidebarMiddle.init();
    if (window.ChatPanel) window.ChatPanel.init();

    // Orbit Echo welcome sequence
    (function() {
      var state = window.store.getState();
      var echoMsgs = state.messages && state.messages['local-echo'];
      if (!echoMsgs || echoMsgs.length === 0) {
        var CID = 'local-echo', UID = 'local-echo', UNAME = 'Orbit Echo';
        var TXTS = [
          "Hi! I'm Orbit Echo! You can call me Bit if you want.",
          "You can send messages in here and i'll echo it back at you! (except for images, files, folders and sounds files)",
          "**THIS MESSAGE WILL SELF-DESTRUCT AFTER 5s**",
          "_Just kidding.._"
        ];
        var DELAYS = [5000, 7000, 7000, 7000];
        (function show(i) {
          if (i >= TXTS.length) return;
          window.TypingState.addUser(CID, UID, UNAME);
          setTimeout(function() {
            window.TypingState.removeUser(CID, UID);
            window.store.addMessage(CID, {
              id: 'echo-welcome-' + i + '-' + Date.now(),
              sender: UID,
              text: TXTS[i],
              timestamp: new Date().toISOString()
            });
            show(i + 1);
          }, DELAYS[i]);
        })(0);
      }
    })();

    if (window.ContextMenu) window.ContextMenu.init();

    // Offline check is created in applySettings() — not duplicated here

    // Hide and remove the boot skeleton
    var skel = document.getElementById('app-skeleton');
    if (skel) {
      skel.classList.add('sk-hidden');
      setTimeout(function() { if (skel.parentNode) skel.parentNode.removeChild(skel); }, 300);
    }
    document.documentElement.classList.remove('sk-loading');

    console.log('Orbit Shell Ready.');
  }, 0);
  }

  // PIN Lock Check — block Phase 2/3 if PIN is enabled
  var pinEnabled = window.orbitAPI ? window.orbitAPI.pinStatus() : false;
  if (pinEnabled) {
    if (window.PinLockScreen) {
      window.PinLockScreen.show(function() {
        startPhase2();
        requestIdleCallback(function() {
          if (window.EmojiPicker) window.EmojiPicker.init();
          if (window.Toast) window.Toast.init();
          if (window.CustomThemeModal) window.CustomThemeModal.init();
          if (window.AccountSwitcher) window.AccountSwitcher.init();
          if (window.UpdateNotice) window.UpdateNotice.init();
          setTimeout(function() {
            if (window.TutorialModal && window.TutorialModal.shouldShowOnStartup()) {
              window.TutorialModal.show();
            }
          }, 800);
        });
      });
      return; // Don't proceed with normal boot until unlocked
    }
  }
  startPhase2();

  // ---- Phase 3 (idle): Non-critical components ----
  requestIdleCallback(function() {
    if (window.EmojiPicker) window.EmojiPicker.init();
    if (window.Toast) window.Toast.init();
    if (window.CustomThemeModal) window.CustomThemeModal.init();
    if (window.AccountSwitcher) window.AccountSwitcher.init();
    // Throttled "new version available" check — silent, and it no-ops if the
    // app was updated in the last 6h or the user skipped that version.
    if (window.UpdateNotice) window.UpdateNotice.init();

    setTimeout(function() {
      if (window.TutorialModal && window.TutorialModal.shouldShowOnStartup()) {
        window.TutorialModal.show();
      }
    }, 800);
  });
});

// Frame overlay helper
window.Frames = {
  getFrameSrc(frameNum) {
    if (!frameNum || frameNum === 0) return null;
    return 'icons/frames/pfp_frame_' + frameNum + '.png';
  },
  wrapAvatar(avatarHtml, frameNum) {
    var src = this.getFrameSrc(frameNum);
    if (!src) return avatarHtml;
    return '<div style="position:relative;display:inline-block;">' +
      avatarHtml +
      '<img src="' + src + '" style="position:absolute;top:-12.5%;left:-12.5%;width:125%;height:125%;pointer-events:none;object-fit:contain;border-radius:0;" draggable="false" alt="">' +
    '</div>';
  },
  wrapAvatarContainer(container, frameNum) {
    var src = this.getFrameSrc(frameNum);
    if (!src) return;
    if (!container) return;
    var existing = container.querySelector('.frame-overlay');
    if (existing) existing.remove();
    var img = document.createElement('img');
    img.className = 'frame-overlay';
    img.src = src;
    // 125% centred, not inset:0/100%. The frame art is a wreath authored to wrap
    // AROUND the avatar circle; at 100% it is crushed against the edge and overlaps
    // the avatar. A 125%-wide overlay needs -12.5% to stay centred — the same
    // geometry mobile uses. See the frame-geometry note in the mobile stylesheet.
    img.style.cssText = 'position:absolute;top:-12.5%;left:-12.5%;width:125%;height:125%;pointer-events:none;object-fit:contain;border-radius:0;';
    img.draggable = false;
    img.alt = 'frame';
    container.style.position = 'relative';
    container.appendChild(img);
  },
  getFrameForUser(userId) {
    var state = window.store ? window.store.getState() : null;
    if (!state) return 0;
    // Self — use currentUser.profileFrame (per-account)
    if (state.currentUser && state.currentUser.userId === userId) {
      return (state.currentUser.profileFrame != null ? state.currentUser.profileFrame : 0);
    }
    // Friend/peer
    var friend = state.friends.find(function(f) { return f.userId === userId; });
    if (friend && friend.profileFrame) return friend.profileFrame;
    // Group member
    for (var i = 0; i < state.groups.length; i++) {
      var member = state.groups[i].members.find(function(m) { return m.userId === userId; });
      if (member && member.profileFrame) return member.profileFrame;
    }
    return 0;
  }
};
