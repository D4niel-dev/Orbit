// src/js/components/emoji-panel.js
//
// OUR OWN EMOJI PICKER — the redesign's, not the library's.
//
// ⚠ WHY. `emoji-picker-element` is a custom element with a SHADOW ROOT, so the app
// could never style it: everything inside had to be reached through the handful of
// custom properties it chooses to expose, and the rest was its defaults. It also
// floated at a hardcoded `bottom: 80px; right: 40px` against the VIEWPORT, so it
// was never attached to the composer that opened it. Dan: "rather than opening a
// weird floating modal... we make it open a pill that is under the message input
// box? and rather than the default settings of the emoji picker has given us...
// let's make our own!"
//
// ⚠ WHAT WE KEEP. The DATA is the hard part — thousands of emoji, groups, search
// aliases, skin-tone variants — and it is good. So this drives the library's own
// `Database` (exposed as `window.OrbitEmojiDatabase` by a module script) and
// replaces only the UI. That also keeps its IndexedDB cache, which means the data
// is downloaded once and is offline afterwards.
//
// ⚠ WHERE IT LIVES. The panel is a CHILD OF `.chat-input-wrapper`, which is
// `position: relative` and has no `overflow`, so it can sit directly on top of the
// composer at exactly the composer's width. It is therefore part of the composer's
// own subtree: switching chats re-renders the composer and the panel goes with it,
// with no separate teardown to forget.
//
// ⚠ REDESIGN ONLY. `EmojiPicker` (the facade the app already talks to) delegates
// here when the layer is on and falls back to the library element in classic. One
// call site, two looks, and the old UI keeps the picker it ships today.

(function () {
  'use strict';

  // emojibase group numbers. 2 is the skin-tone "component" group, which is not a
  // category anyone browses — the tone picker covers it.
  var GROUPS = [
    { id: 0, icon: '\uD83D\uDE00', label: 'Smileys & Emotion' },
    { id: 1, icon: '\uD83D\uDC4B', label: 'People & Body' },
    { id: 3, icon: '\uD83D\uDC3B', label: 'Animals & Nature' },
    { id: 4, icon: '\uD83C\uDF54', label: 'Food & Drink' },
    { id: 5, icon: '\u2708\uFE0F', label: 'Travel & Places' },
    { id: 6, icon: '\u26BD', label: 'Activities' },
    { id: 7, icon: '\uD83D\uDCA1', label: 'Objects' },
    { id: 8, icon: '\u2764\uFE0F', label: 'Symbols' },
    { id: 9, icon: '\uD83C\uDFF3\uFE0F', label: 'Flags' }
  ];

  // The six tones the database understands, as a hand in each. Index is the tone.
  var TONES = ['\uD83D\uDC4B', '\uD83D\uDC4B\uD83C\uDFFB', '\uD83D\uDC4B\uD83C\uDFFC',
    '\uD83D\uDC4B\uD83C\uDFFD', '\uD83D\uDC4B\uD83C\uDFFE', '\uD83D\uDC4B\uD83C\uDFFF'];

  var RECENTS_ICON = '\uD83D\uDD52';

  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.EmojiPanel = {
    isOpen: false,
    _el: null,
    _db: null,
    _dbPromise: null,
    _group: 'recents',
    _query: '',
    _tone: 0,
    _target: null,
    _caret: null,
    _token: 0,
    _cache: {},

    // ── data ────────────────────────────────────────────────────────────────
    _database() {
      if (!this._dbPromise) {
        if (!window.OrbitEmojiDatabase) {
          return Promise.reject(new Error('the emoji database module has not loaded'));
        }
        // ⚠⚠ THE BUNDLED DATASET, NOT A CDN. The source used to be a jsDelivr URL,
        // so a fresh install with no network had no emoji AT ALL — the one thing a
        // local-first app cannot afford. `orbit-emoji://` is served by the main
        // process straight out of src/data/emojis.json; see the handler in main.js
        // for why the path is resolved there and not here.
        this._db = new window.OrbitEmojiDatabase({ dataSource: 'orbit-emoji://data' });
        this._dbPromise = this._db.ready()
          .catch(function () {
            // ⚠ Falls back rather than failing. A build without the bundle, or a
            // host that does not serve the scheme, should still get a picker while
            // there is a network — an empty panel with no clue why is the exact
            // silent failure this component has already produced twice.
            this._db = new window.OrbitEmojiDatabase();
            return this._db.ready();
          }.bind(this))
          .then(() => {
            return this._db.getPreferredSkinTone().then(function (t) {
              // A stored tone is the user's, and the library validates it. Anything
              // odd leaves the default, exactly as the old picker did.
              if (typeof t === 'number' && t >= 0 && t <= 5) this._tone = t;
            }.bind(this)).catch(function () {});
          })
          .then(function () { return this._db; }.bind(this));
      }
      return this._dbPromise;
    },

    /** The unicode to insert, honouring the chosen tone when the emoji has one. */
    _unicodeFor(e) {
      if (this._tone && e.skins) {
        for (var i = 0; i < e.skins.length; i++) {
          if (e.skins[i].tone === this._tone) return e.skins[i].unicode;
        }
      }
      return e.unicode;
    },

    // ── building ────────────────────────────────────────────────────────────
    _build() {
      var el = document.createElement('div');
      el.className = 'emoji-panel';
      el.id = 'emoji-panel';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Emoji');
      el.hidden = true;

      var tabs = '<button class="ep-tab" data-group="recents" title="Frequently used">' + RECENTS_ICON + '</button>';
      GROUPS.forEach(function (g) {
        tabs += '<button class="ep-tab" data-group="' + g.id + '" title="' + esc(g.label) + '">' + g.icon + '</button>';
      });

      var tones = '';
      TONES.forEach(function (t, i) {
        tones += '<button class="ep-tone" data-tone="' + i + '" title="Skin tone ' + i + '">' + t + '</button>';
      });

      el.innerHTML =
        '<div class="ep-head">' +
          '<label class="ep-search">' +
            '<i data-lucide="search" class="ep-search-icon"></i>' +
            '<input id="ep-search" type="text" placeholder="Search emoji" autocomplete="off" spellcheck="false">' +
          '</label>' +
          '<button class="ep-tone-btn" id="ep-tone-btn" title="Skin tone">' + TONES[0] + '</button>' +
        '</div>' +
        '<div class="ep-tones" id="ep-tones" hidden>' + tones + '</div>' +
        '<div class="ep-tabs" id="ep-tabs">' + tabs + '</div>' +
        '<div class="ep-body" id="ep-body"></div>';

      this._el = el;
      this._search = el.querySelector('#ep-search');
      this._body = el.querySelector('#ep-body');
      this._toneBtn = el.querySelector('#ep-tone-btn');
      this._tonesRow = el.querySelector('#ep-tones');
      this._tabs = el.querySelector('#ep-tabs');

      var self = this;

      this._search.addEventListener('input', function () {
        self._query = this.value.trim();
        self._render();
      });

      this._tabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.ep-tab');
        if (!tab) return;
        self._group = tab.getAttribute('data-group');
        self._query = '';
        self._search.value = '';
        self._render();
      });

      this._toneBtn.addEventListener('click', function () {
        self._tonesRow.hidden = !self._tonesRow.hidden;
      });

      this._tonesRow.addEventListener('click', function (e) {
        var b = e.target.closest('.ep-tone');
        if (!b) return;
        var tone = parseInt(b.getAttribute('data-tone'), 10) || 0;
        self._tone = tone;
        self._toneBtn.textContent = TONES[tone];
        self._tonesRow.hidden = true;
        self._markTone();
        // Persist through the database so classic and the next launch agree.
        if (self._db) self._db.setPreferredSkinTone(tone).catch(function () {});
        self._render();
      });

      this._body.addEventListener('click', function (e) {
        var btn = e.target.closest('.ep-emoji');
        if (!btn) return;
        self._insert(btn.getAttribute('data-unicode'), btn.getAttribute('data-base'));
      });

      if (window.lucide) window.lucide.createIcons({ root: el });

      // Outside click and Escape close it. ⚠ `composedPath()` for the same reason
      // the old picker needed it: the composer swaps the emoji button's icon when
      // the panel opens, so `e.target` can be a DETACHED node by the time this
      // runs and `closest()` would answer "outside" for a click on the button.
      document.addEventListener('click', function (e) {
        if (!self.isOpen) return;
        var path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
        if (path.indexOf(self._el) !== -1) return;
        var onButton = path.some(function (n) { return !!n && n.id === 'btn-emoji'; });
        if (onButton) return;
        self.close();
      });
      document.addEventListener('keydown', function (e) {
        if (self.isOpen && e.key === 'Escape') {
          e.stopPropagation();
          self.close();
        }
      });
    },

    _markTone() {
      var self = this;
      this._tonesRow.querySelectorAll('.ep-tone').forEach(function (b) {
        b.classList.toggle('is-active', parseInt(b.getAttribute('data-tone'), 10) === self._tone);
      });
    },

    // ── rendering ───────────────────────────────────────────────────────────
    _render() {
      var self = this;
      if (!this._el) return;
      var token = ++this._token;

      var work;
      if (this._query) {
        work = this._database().then(function (db) {
          return db.getEmojiBySearchQuery(self._query);
        }).then(function (list) {
          return { title: null, emoji: list };
        });
      } else if (this._group === 'recents') {
        work = this._database().then(function (db) {
          return db.getTopFavoriteEmoji(48).then(function (top) {
            if (top && top.length) return { title: null, emoji: top, recents: true };
            // ⚠ A FRESH PROFILE HAS NO FAVOURITES, and an empty panel on the very
            // first open is a bad first impression. Fall through to the first
            // category — and MOVE the tab with it, or the rail would claim
            // "recently used" while showing Smileys.
            self._group = String(GROUPS[0].id);
            return db.getEmojiByGroup(GROUPS[0].id).then(function (list) {
              return { title: GROUPS[0].label, emoji: list };
            });
          });
        });
      } else {
        var gid = parseInt(this._group, 10);
        var meta = GROUPS.filter(function (g) { return g.id === gid; })[0];
        work = this._database().then(function (db) {
          return db.getEmojiByGroup(gid);
        }).then(function (list) {
          return { title: meta ? meta.label : null, emoji: list };
        });
      }

      work.then(function (res) {
        // A later render has already won.
        if (token !== self._token) return;
        self._paint(res);
      }).catch(function (err) {
        if (token !== self._token) return;
        self._body.innerHTML = '<div class="ep-empty">The emoji list could not be loaded.</div>';
        if (window.console && console.warn) console.warn('[EmojiPanel]', err && err.message);
      });
    },

    _paint(res) {
      // ⚠ Marked HERE, not at the top of _render(): the recents branch can change
      // `_group` while the query is in flight, and a highlight painted before that
      // would disagree with the list underneath it.
      this._tabs.querySelectorAll('.ep-tab').forEach(function (b) {
        b.classList.toggle('is-active', !this._query && String(b.getAttribute('data-group')) === String(this._group));
      }, this);

      var list = res.emoji || [];
      if (!list.length) {
        this._body.innerHTML = '<div class="ep-empty">' +
          (res.empty || 'No emoji match \u201C' + esc(this._query) + '\u201D.') + '</div>';
        return;
      }

      var html = '';
      if (res.title) html += '<div class="ep-group-title">' + esc(res.title) + '</div>';
      if (this._query) html += '<div class="ep-group-title">' + list.length + ' result' + (list.length === 1 ? '' : 's') + '</div>';
      if (!res.title && !this._query && this._group === 'recents') {
        html += '<div class="ep-group-title">Frequently used</div>';
      }

      html += '<div class="ep-grid">';
      list.forEach(function (e) {
        var uni = this._unicodeFor(e);
        // ⚠ `annotation`, not `label`. The emojibase records carry
        // `{ annotation, name, tags, shortcodes }` — there is no `label`, so the
        // first version rendered every tooltip and every aria-label as "".
        var name = e.annotation || e.name || '';
        html += '<button class="ep-emoji" data-unicode="' + esc(uni) + '" data-base="' + esc(e.unicode) +
          '" title="' + esc(name) + '" aria-label="' + esc(name) + '">' + uni + '</button>';
      }.bind(this));
      html += '</div>';

      this._body.innerHTML = html;
      this._body.scrollTop = 0;
    },

    // ── insert ──────────────────────────────────────────────────────────────
    _insert(unicode, base) {
      var input = this._target;
      if (!input || !unicode) return;

      var value = input.value || '';
      var start = this._caret ? this._caret[0] : value.length;
      var end = this._caret ? this._caret[1] : start;
      if (start > value.length) start = value.length;
      if (end > value.length) end = value.length;

      input.value = value.slice(0, start) + unicode + value.slice(end);
      var pos = start + unicode.length;
      this._caret = [pos, pos];

      input.focus();
      try { input.setSelectionRange(pos, pos); } catch (e) { /* not a text control */ }
      // The composer listens for `input` to enable Send and to save the draft.
      input.dispatchEvent(new Event('input', { bubbles: true }));

      // Feeds the "Frequently used" tab. ⚠ The BASE unicode, not the toned one —
      // that is what the database counts, so a toned tap still counts as one emoji.
      if (this._db && base) this._db.incrementFavoriteEmojiCount(base).catch(function () {});
      this._cache = {};
    },

    // ── lifecycle ───────────────────────────────────────────────────────────
    open(target) {
      var wrap = document.querySelector('.chat-input-wrapper');
      if (!wrap) return false;
      if (!this._el) this._build();

      // ⚠ The composer is re-rendered on a chat switch, which takes the panel with
      // it. Re-attaching here means a stale node can never be shown.
      if (this._el.parentElement !== wrap) wrap.appendChild(this._el);

      this._target = target || document.getElementById('chat-input');
      if (this._target && typeof this._target.selectionStart === 'number') {
        this._caret = [this._target.selectionStart, this._target.selectionEnd];
      }

      this._el.hidden = false;
      this.isOpen = true;
      this._markTone();
      // A transient popover should not reopen mid-search — the query belongs to
      // the visit, not to the panel.
      this._query = '';
      if (this._search) this._search.value = '';
      this._render();

      // Focus the search so typing filters, the way every picker does. The caret
      // was captured above, so inserting still lands where the user left it.
      try { this._search.focus(); } catch (e) {}
      return true;
    },

    close() {
      if (this._el) this._el.hidden = true;
      if (!this.isOpen) return;
      this.isOpen = false;

      // ⚠⚠ THE FACADE HAS TO BE TOLD, AND THIS IS NOT COSMETIC. The panel closes
      // ITSELF on Escape and on an outside click, without going through
      // `EmojiPicker.close()` — so `EmojiPicker.isOpen` stayed true. The toggle
      // reads that flag, so the NEXT click on the button "closed" a panel that was
      // already closed and nothing appeared: it took two clicks to reopen. Routing
      // through the facade also restores the button's icon, which the composer
      // swaps on open/close. `isOpen` is cleared above, so the call back into this
      // method returns immediately and cannot recurse.
      if (window.EmojiPicker && window.EmojiPicker.isOpen) window.EmojiPicker.close();

      // Give the caret back to the composer, so the next thing typed lands there.
      if (this._target && typeof this._target.focus === 'function') {
        try { this._target.focus(); } catch (e) {}
      }
    },

    /** Is `node` inside the panel? Used by the facade's own outside-click guard. */
    contains(node) {
      return !!(this._el && node && this._el.contains(node));
    }
  };
})();
