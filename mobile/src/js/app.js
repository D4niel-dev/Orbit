// mobile/src/js/app.js
// Orbit Mobile — Main App Controller

console.log('[APP] app.js loaded at', new Date().toISOString());

/* ---- Message Action State ---- */
var editingMsg = null;
var replyingTo = null;

/* ---- Disappearing Messages ---- */
window._disappearTimers = {};

/* ---- Slash Command Registry ---- */
var COMMANDS = [
  { name: '/help', desc: 'Show all available commands', usage: '/help', handler: 'help' },
  { name: '/poll', desc: 'Create a poll in the group', usage: '/poll — opens poll builder (or /poll "Question?" "Option1" "Option2" ...)', handler: 'poll' },
  { name: '/me', desc: 'Write in third person', usage: '/me waves', handler: 'me' },
  { name: '/shrug', desc: 'Add a shrug', usage: '/shrug', handler: 'shrug' },
  { name: '/tableflip', desc: 'Flipping tables', usage: '/tableflip', handler: 'tableflip' },
  { name: '/unflip', desc: 'Unflip the table', usage: '/unflip', handler: 'unflip' },
  { name: '/lenny', desc: '( ͡° ͜ʖ ͡°)', usage: '/lenny', handler: 'lenny' },
  { name: '/roll', desc: 'Roll a die', usage: '/roll 6', handler: 'roll' },
  { name: '/flip', desc: 'Flip a coin', usage: '/flip', handler: 'flip' },
  { name: '/spoiler', desc: 'Send text as spoiler', usage: '/spoiler secret text', handler: 'spoiler' },
  { name: '/clear', desc: 'Clear chat messages (local)', usage: '/clear', handler: 'clear' },
  { name: '/invite', desc: 'Show group invite code', usage: '/invite', handler: 'invite' },
  { name: '/members', desc: 'List group members', usage: '/members', handler: 'members' },
  { name: '/topic', desc: 'Set group description (owner/admin)', usage: '/topic New description', handler: 'topic' },
  { name: '/leave', desc: 'Leave current group', usage: '/leave', handler: 'leave' },
  { name: '/shout', desc: 'Send announcement', usage: '/shout <message>', handler: 'shout' },
  { name: '/countdown', desc: 'Countdown then send message', usage: '/countdown 5 Go!', handler: 'countdown' },
  { name: '/nick', desc: 'Set your nickname in this group', usage: '/nick <new name>', handler: 'nick' },
  { name: '/kick', desc: 'Remove member from group (owner/admin)', usage: '/kick <username>', handler: 'kick' }
];

/* ---- Mention Autocomplete State ---- */
var _mentionActive = false;
var _mentionQuery = '';
var _mentionSelectedIndex = 0;
var _mentionUsers = [];
var _mentionStartPos = -1;
var _mentionDropdown = null;
var _mentionMirror = null;

/* ---- Mobile App ---- */
document.addEventListener('DOMContentLoaded', function() {
  window._orbitSessionId = Date.now();
  // Init env
  if (!window.Orbit) window.Orbit = {};
  if (!window.Orbit.env) {
    window.Orbit.env = {
      isElectron: false,
      isAndroid: true,
      isMobile: true,
      isTouchDevice: true,
      platform: 'android'
    };
  }

  window.orbitGuessMimeType = function(fileName) {
    if (!fileName) return 'application/octet-stream';
    var extMatch = fileName.match(/\.(png|jpe?g|gif|webp|svg|tiff?|bmp|heic|heif|avif)$/i);
    var audioMatch = fileName.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mka)$/i);
    var videoMatch = fileName.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v|wmv|flv|f4v|ts|mts|m2ts)$/i);
    if (extMatch) {
      var extLower = extMatch[1].toLowerCase();
      if (extLower === 'svg') return 'image/svg+xml';
      if (extLower === 'tif' || extLower === 'tiff') return 'image/tiff';
      return 'image/' + extLower.replace('jpg','jpeg');
    }
    if (videoMatch) {
      var videoExtMap = { mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', f4v: 'video/x-f4v', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t' };
      return videoExtMap[videoMatch[1].toLowerCase()] || 'video/mp4';
    }
    if (audioMatch) {
      var audioExtMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', opus: 'audio/opus', mka: 'audio/x-matroska' };
      return audioExtMap[audioMatch[1].toLowerCase()] || 'audio/mpeg';
    }
    return 'application/octet-stream';
  };

  // Safe base64→ArrayBuffer decoder (atob() on Android WebView corrupts bytes >127)
  // Uses single-pass streaming decoder to avoid intermediate string allocations
  window.orbitBase64ToArrayBuffer = function orbitBase64ToArrayBuffer(b64) {
    var lookup = new Int8Array(256);
    for (var i = 0; i < 256; i++) lookup[i] = -1;
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (var i = 0; i < 64; i++) lookup[chars.charCodeAt(i)] = i;

    var validLen = 0;
    for (var i = 0; i < b64.length; i++) {
      if (lookup[b64.charCodeAt(i)] !== -1) validLen++;
    }

    var binLen = Math.floor(validLen * 3 / 4);
    if (binLen === 0) return new ArrayBuffer(0);

    var buf = new ArrayBuffer(binLen);
    var bytes = new Uint8Array(buf);

    var p = 0;
    var b = [0,0,0,0];
    var bi = 0;
    for (var i = 0; i < b64.length; i++) {
      var val = lookup[b64.charCodeAt(i)];
      if (val === -1 || val === void 0) continue;
      b[bi++] = val;
      if (bi === 4) {
        if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
        if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
        if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
        bi = 0;
      }
    }
    if (bi > 0) {
      while (bi < 4) b[bi++] = 0;
      if (p < binLen) bytes[p++] = (b[0] << 2) | (b[1] >> 4);
      if (p < binLen) bytes[p++] = ((b[1] & 15) << 4) | (b[2] >> 2);
      if (p < binLen) bytes[p++] = ((b[2] & 3) << 6) | b[3];
    }
    return buf;
  };
  window.orbitBase64ToBlob = function orbitBase64ToBlob(b64, mime) {
    var buf = window.orbitBase64ToArrayBuffer(b64);
    if (!buf || buf.byteLength === 0) return null;
    try { return URL.createObjectURL(new Blob([buf], { type: mime })); } catch(e) { return null; }
  };

  /* ---- IndexedDB Blob Store (for large files >10MB that don't fit in localStorage) ---- */
  window.BlobStoreDB = {
    _db: null,
    _ready: null,
    _open: function() {
      if (this._ready) return this._ready;
      var self = this;
      this._ready = new Promise(function(resolve, reject) {
        try {
          var req = indexedDB.open('OrbitBlobStore', 2);
          req.onupgradeneeded = function(e) {
            var db = e.target.result;
            if (!db.objectStoreNames.contains('blobs')) {
              db.createObjectStore('blobs');
            }
            if (!db.objectStoreNames.contains('partials')) {
              db.createObjectStore('partials');
            }
          };
          req.onsuccess = function(e) {
            self._db = e.target.result;
            self._db.onversionchange = function() { self._db.close(); };
            resolve();
          };
          req.onerror = function(e) {
            console.warn('[BlobStoreDB] open failed:', e.target.error);
            reject(e.target.error);
          };
        } catch(e) {
          console.warn('[BlobStoreDB] indexedDB unavailable:', e.message);
          reject(e);
        }
      });
      return this._ready;
    },
    put: function(key, arrayBuffer) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs').put(arrayBuffer, key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    get: function(key) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readonly');
            var req = tx.objectStore('blobs').get(key);
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    // Walk a store one record at a time, awaiting the handler between records, so a
    // caller that streams each value straight out to a file keeps peak memory at a
    // single record. That matters: a real account holds 500 MB+, and loading the
    // store in one go is exactly what made the v1 vault unable to back it up.
    //
    // Deliberately NOT a cursor. An IndexedDB transaction auto-commits as soon as
    // the microtask queue drains with no pending request, so awaiting a slow handler
    // (sealing and writing an 8 MB chunk) before cursor.continue() throws
    // "The transaction is not active". Reading the key list first and then fetching
    // each value in its own short transaction keeps memory bounded while still
    // letting the handler be async.
    eachKey: function(storeName, handler) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction(storeName, 'readonly');
            var req = tx.objectStore(storeName).getAllKeys();
            req.onsuccess = function(e) { resolve(e.target.result || []); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      }).then(function(keys) {
        var chain = Promise.resolve();
        keys.forEach(function(key) {
          chain = chain.then(function() {
            return self._getOne(storeName, key).then(function(value) {
              return handler(key, value);
            });
          });
        });
        return chain;
      });
    },
    _getOne: function(storeName, key) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction(storeName, 'readonly');
            var req = tx.objectStore(storeName).get(key);
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    'delete': function(key) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('blobs', 'readwrite');
            tx.objectStore('blobs')['delete'](key);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    // CROSS-RESTART: checkpoint in-progress receives into the 'partials' store
    // so an app kill mid-transfer can be resumed after restart (v2 upgrade adds
    // the store; the 'blobs' store and its API stay untouched).
    partialPut: function(fileId, record) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('partials', 'readwrite');
            tx.objectStore('partials').put(record, fileId);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    partialGetAll: function() {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('partials', 'readonly');
            var req = tx.objectStore('partials').getAll();
            req.onsuccess = function(e) { resolve(e.target.result || []); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    partialGet: function(fileId) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('partials', 'readonly');
            var req = tx.objectStore('partials').get(fileId);
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    },
    partialDelete: function(fileId) {
      var self = this;
      return this._open().then(function() {
        return new Promise(function(resolve, reject) {
          try {
            var tx = self._db.transaction('partials', 'readwrite');
            tx.objectStore('partials')['delete'](fileId);
            tx.oncomplete = function() { resolve(); };
            tx.onerror = function(e) { reject(e.target.error); };
          } catch(e) { reject(e); }
        });
      });
    }
  };

  // Restore large-file blob attachments from IndexedDB after loading from localStorage
  window._restoreAllBlobAttachments = function _restoreAllBlobAttachments() {
    var allMsgs = MStore.messages || {};

    // Fast path: scan for any blob keys before entering the triple loop
    var hasBlobs = false;
    for (var cid in allMsgs) {
      var msgs = allMsgs[cid];
      if (!Array.isArray(msgs)) continue;
      for (var mi = 0; mi < msgs.length; mi++) {
        var atts = msgs[mi].attachments;
        if (!Array.isArray(atts)) continue;
        for (var ai = 0; ai < atts.length; ai++) {
          if (atts[ai]._blobKey) { hasBlobs = true; break; }
        }
        if (hasBlobs) break;
      }
      if (hasBlobs) break;
    }
    if (!hasBlobs) return Promise.resolve([]); // Nothing to restore

    var restorePromises = [];
    for (var cid in allMsgs) {
      var msgs = allMsgs[cid];
      if (!Array.isArray(msgs)) continue;
      for (var mi = 0; mi < msgs.length; mi++) {
        var atts = msgs[mi].attachments;
        if (!Array.isArray(atts)) continue;
        for (var ai = 0; ai < atts.length; ai++) {
          var a = atts[ai];
          if (a._blobKey && (!a.url || a.url.indexOf('blob:') === 0)) {
            // Dead blob URL — restore from IndexedDB
            (function(attachment, chatId) {
              if (window._restoreQueue && window._restoreQueue[attachment._blobKey]) return;
              restorePromises.push(
                window.BlobStoreDB.get(attachment._blobKey).then(function(ab) {
                  if (!ab) { console.warn('[BlobStore] no data for key', attachment._blobKey); return; }
                  var mime = attachment.mimeType || 'application/octet-stream';
                  try {
                    var newUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
                    attachment.url = newUrl;
                    attachment._blobCreated = true; attachment._blobSession = window._orbitSessionId;
                    MStore._saveMsgs(chatId);
                  } catch(e) {
                    console.warn('[BlobStore] createObjectURL failed:', e.message);
                  }
                }).catch(function(err) {
                  console.warn('[BlobStore] restore failed for', attachment._blobKey, err);
                })
              );
            })(a, cid);
          }
        }
      }
    }
    return Promise.all(restorePromises);
  };

  migrateOldData(); // copy unprefixed keys before MStore reads orbit_* keys
  MStore.load();

  // Only load messages for the active/last chat at startup (lazy load others on demand)
  var lastChatId = OrbitKeys.get('last_chat') || null;
  if (lastChatId) {
    MStore.getMessages(lastChatId);
  }

  // Restore blob attachments asynchronously — optimized to skip if no blobs exist
  window._restoreAllBlobAttachments().then(function() {
    console.log('[BlobStore] All blob attachments restored');
    if (activeChatId) renderMessages(activeChatId);
  });

  // CROSS-RESTART: rehydrate in-progress file receives from the IndexedDB
  // 'partials' store. A re-sent START after restart then hits the duplicate-
  // START guard (same hash → keep partial → _maybeRequestResume), so the
  // sender skips ahead instead of starting from zero.
  window.BlobStoreDB.partialGetAll().then(function(partials) {
    if (!partials || !partials.length) return;
    var _restoredCount = 0;
    var _purgedCount = 0;
    var _now = Date.now();
    var _maxAge = 24 * 60 * 60 * 1000;
    partials.forEach(function(rec) {
      if (!rec || !rec.fileId) return;
      // Stale partial (older than 24h) — purge, do not resurrect
      if (!rec.savedAt || (_now - rec.savedAt) > _maxAge) {
        window.BlobStoreDB.partialDelete(rec.fileId).catch(function(err) {
          console.warn('[P2P] Partial purge failed for', rec.fileId, err);
        });
        _purgedCount++;
        return;
      }
      window.activeTransfers = window.activeTransfers || {};
      if (window.activeTransfers[rec.fileId]) return; // already live — keep it
      var _chunksArr = new Array(rec.total || 0);
      var _recvCount = 0;
      if (rec.chunks && typeof rec.chunks === 'object') {
        for (var _ckKey in rec.chunks) {
          var _ckIdx = parseInt(_ckKey, 10);
          if (!isNaN(_ckIdx) && _ckIdx >= 0 && _ckIdx < _chunksArr.length) {
            _chunksArr[_ckIdx] = rec.chunks[_ckKey];
            _recvCount++;
          }
        }
      }
      window.activeTransfers[rec.fileId] = {
        chunks: _chunksArr,
        fileName: rec.fileName || 'unknown',
        total: rec.total || 0,
        received: _recvCount,
        senderId: rec.senderId || '',
        type: rec.type || '',
        mimeType: rec.mimeType || '',
        hash: rec.hash || '',
        chatId: rec.chatId || '',
        _startTime: rec.savedAt,
        // fresh 120s grace post-boot so the first reap can't kill a restored partial
        _lastChunkTime: Date.now(),
        _rehydrated: true,
        _lastCheckpoint: rec.received || _recvCount
      };
      _restoredCount++;
    });
    console.log('[P2P] Restored ' + _restoredCount + ' partial transfer(s) from IndexedDB' +
      (_purgedCount ? ' (purged ' + _purgedCount + ' stale)' : ''));
  }).catch(function(err) {
    console.warn('[P2P] Partial rehydration failed:', err);
  });

  var activeChatId = null;

  /* -- Navigation --
     The left-to-right order of the tab panels, which is what decides the
     direction a transition slides. Moving to a panel further along this list
     goes FORWARD — the outgoing panel leaves to the left and the incoming one
     arrives from the right. Moving to an earlier one goes BACK, and the two
     swap over.

     This replaced a handler bound to `.nav-btn`, an element the tab bar has not
     used since it was rebuilt — it also carried its own `panel-slide-*` classes
     and animations, so the app had two transition mechanisms and only one of
     them was reachable. */
  var PANEL_ORDER = ['panel-chats', 'panel-friends', 'panel-activity'];

  /* -- Panel Transition Helper -- */
  /**
   * Switch panels with a directional slide.
   *
   * The direction is DERIVED from PANEL_ORDER rather than passed in. It used to
   * come from the caller, and the only caller passed `tabId === 'chats' ?
   * 'reverse' : 'enter'` — so the direction was really "is the destination
   * Chats?" and every move that did not involve Chats slid the same way. Going
   * Chats → Contacts → Activity → Contacts, the last step slid left when it
   * should have slid right.
   *
   * `animation` is still honoured for the one genuinely vertical case: a chat
   * opening over the list rises from the bottom and settles back down.
   */
  function switchPanel(panelId, animation) {
    var panels = document.querySelectorAll('.mobile-panel');
    var currentActive = null;
    panels.forEach(function(p) {
      if (p.classList.contains('active')) {
        currentActive = p;
      }
    });
    var target = document.getElementById(panelId);
    if (!target || target === currentActive) return;
    
    if (currentActive) {
      var exitClass, enterClass;
      if (animation === 'enter-up') {
        exitClass = 'anim-exit-down';
        enterClass = 'anim-enter-up';
      } else {
        // -1 for a panel not in the list, so an unknown destination is treated
        // as being to the right rather than silently going backwards.
        var from = PANEL_ORDER.indexOf(currentActive.id);
        var to = PANEL_ORDER.indexOf(panelId);
        var back = from !== -1 && to !== -1 && to < from;
        exitClass = back ? 'anim-exit-reverse' : 'anim-exit';
        enterClass = back ? 'anim-enter-reverse' : 'anim-enter';
      }
      currentActive.classList.add(exitClass);
      setTimeout(function() {
        currentActive.classList.remove('active', 'anim-exit', 'anim-exit-down', 'anim-exit-reverse', 'anim-enter', 'anim-enter-up', 'anim-enter-reverse');
        target.classList.add(enterClass, 'active');
        setTimeout(function() {
          target.classList.remove('anim-enter', 'anim-enter-up', 'anim-enter-reverse');
        }, 300);
      }, 180);
    } else {
      target.classList.add('active');
    }
  }

  /* -- Search -- */
  var searchFilter = '';
  var chatSearchFilter = '';

  /* -- Render Chat List -- */
  /* ─── End-of-list cat footer ─── */
  function endOfListHTML() {
    return '<div class="end-of-list">' +
      '<pre class="end-of-list-cat" style="font-family: monospace; line-height: 1.2; letter-spacing: 0;">' +
        '   |\\      _,,,---,,_\n' +
        '   /,`.-\'`\'    -.  ;-;;,_\n' +
        '  |,4-  ) )-,_..;\\ (  `\'-\'\n' +
        ' \'---\'\'(_/--\'  `-\'\\_)' +
      '</pre>' +
      '<div class="end-of-list-text">Nothing else to see here...</div>' +
    '</div>';
  }

  /* ─── Clean preview text for chat list ─── */
  function formatLastMessage(text) {
    if (!text) return 'No messages yet';
    var preview = text;
    // Strip multi-line code blocks entirely
    preview = preview.replace(/```[\s\S]*?```/g, 'code');
    // Strip single-line backtick fences
    preview = preview.replace(/```([^`\n]+?)```/g, '$1');
    // Strip inline code
    preview = preview.replace(/`([^`]+)`/g, '$1');
    // Strip URLs → "link"
    preview = preview.replace(/https?:\/\/[^\s]+/g, 'link');
    // Strip bold, italic, strikethrough, headings, blockquotes
    preview = preview.replace(/[*_~#>]/g, '');
    // Strip [text](url) links
    preview = preview.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Collapse whitespace
    preview = preview.replace(/\s+/g, ' ').trim();
    // Truncate
    if (preview.length > 80) preview = preview.substring(0, 80) + '…';
    return preview || 'Message';
  }

  function renderChatList() {
    // Delegate to OrbitHome's tab-aware renderer if available
    if (typeof OrbitHome !== 'undefined' && OrbitHome.renderChatList) {
      // Default is 'all' — DMs and groups in one list. The redesign hides the
      // Friends/Groups control; 'friends' and 'groups' are still honoured when
      // the folder rail is in play.
      OrbitHome.renderChatList(window._activeHomeTab || 'all');
      return;
    }
    // Fallback: original rendering
    var container = document.getElementById('chat-list');
    var chats = MStore.getChats();
    var filtered = chats;

    if (searchFilter) {
      var lower = searchFilter.toLowerCase();
      filtered = chats.filter(function(c) {
        return c.name.toLowerCase().indexOf(lower) !== -1;
      });
    }

    if (filtered.length === 0) {
      // The feature slides live here when the list is genuinely empty (not when a
      // search simply found nothing). The list is the first thing you see on a
      // cold start, so this is mobile's equivalent of the desktop chat panel's
      // welcome surface — see shared/ui/welcome-slides.js.
      if (!searchFilter && window.OrbitWelcome) {
        container.innerHTML = '<div id="mobile-welcome-host" style="display:flex;align-items:center;justify-content:center;padding:24px 0;box-sizing:border-box;"></div>';
        window.OrbitWelcome.render(document.getElementById('mobile-welcome-host'));
        renderLucide({ root: container });
        return;
      }
      container.innerHTML =
        window.OrbitEmpty.html({
          icon: searchFilter ? 'search-x' : 'message-circle',
          title: searchFilter ? 'No matching chats' : 'No conversations yet',
          hint: searchFilter ? 'Try a different search.' : 'Start a new chat from the Friends tab.',
          muted: !!searchFilter
        });
      renderLucide({ root: container });
      return;
    }

    // Split into Direct Messages and Groups
    var groupIds = {};
    MStore.groups.forEach(function(g) { groupIds[g.id] = g; });
    var dms = [];
    var grpChats = [];
    filtered.forEach(function(c) {
      if (groupIds[c.id]) {
        grpChats.push(c);
      } else {
        dms.push(c);
      }
    });

    function renderChatRow(c, isGroup) {
      var timeStr = c.lastTime ? formatTime(c.lastTime) : '';
      var avatarHtml = '';
      var statusDot = '';
      var chatFrameHtml = '';
      var usedGroupGrid = false;
      if (MStore.settings.showChatAvatars !== false) {
        var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
        var cAvatarSrc = safeAvatarSrc(c.avatar);
        avatarHtml = cAvatarSrc
          ? '<img src="' + cAvatarSrc + '" alt="">'
          : escapeHtml(initial);
        if (isGroup) {
          var group = groupIds[c.id];
          var memberCount = group && group.members ? group.members.length : 0;
          // A group with no uploaded image gets the member-avatar grid, matching
          // desktop (shared/ui/group-avatar.js).
          if (!cAvatarSrc && window.OrbitGroupAvatarMobile) {
            var gridHtml = window.OrbitGroupAvatarMobile.forGroup(group, 52, 'var(--bg-base)');
            if (gridHtml) { avatarHtml = gridHtml; usedGroupGrid = true; }
          }
          statusDot = '<span style="font-size:10px;color:var(--text-muted);background:var(--bg-hover);padding:1px 6px;border-radius:8px;margin-left:auto;">' + memberCount + '</span>';
        } else {
          var statusClass = c.status && c.status !== 'offline' ? c.status : '';
          statusDot = statusClass ? '<div class="chat-row-status-dot ' + statusClass + '"></div>' : '';
          if (statusClass) {
            avatarHtml = '<div class="avatar-glow-' + statusClass + '" style="border-radius:50%;width:100%;height:100%;overflow:hidden;display:flex;align-items:center;justify-content:center;">' + avatarHtml + '</div>';
          }
          // Profile frame for DM avatars
          if (MStore.settings.profileFrames) {
            var cf = MStore.friends.find(function(f) { return f.id === c.id; });
            var cfNum = cf ? getProfileFrame(cf) : 0;
            if (cfNum > 0) {
              chatFrameHtml = '<img src="icons/frames/pfp_frame_' + cfNum + '.png" class="pfp-frame" draggable="false" alt="">';
            }
          }
        }
      }
      // Build rich preview from last message
      var previewHtml = '';
      var chatMsgs = MStore.getMessages(c.id);
      var lastMsg = null;
      if (chatMsgs.length > 0) {
        lastMsg = chatMsgs[chatMsgs.length - 1];
      }
      
      var hasAtt = lastMsg && lastMsg.attachments && lastMsg.attachments.length > 0;
      var hasText = lastMsg && lastMsg.text && lastMsg.text.trim();
      var hasPoll = lastMsg && lastMsg.poll;

      if (lastMsg && lastMsg.from === 'me' && lastMsg.from !== 'echo') {
        // Show "You: " prefix for own messages
        previewHtml += '<span class="chat-row-you">You: </span>';
      } else if (lastMsg && lastMsg.from && lastMsg.from !== 'me' && lastMsg.from !== 'echo') {
        // Show sender name for group messages
        var senderName = lastMsg.fromName || '';
        if (!senderName) {
          var sf = (MStore.friends || []).find(function(f) { return f.id === lastMsg.from; });
          if (sf) senderName = sf.name;
        }
        if (senderName) {
          previewHtml += '<span class="chat-row-sender">' + escapeHtml(senderName) + ': </span>';
        }
      }

      if (hasPoll) {
        previewHtml += '<i data-lucide="bar-chart-3" class="chat-row-attachment-icon"></i> Poll';
      } else if (hasAtt && !hasText) {
        // No text, only attachment — show attachment type label
        var imgAtt = lastMsg.attachments.some(function(a) { var t = (a.type || '').toLowerCase(); return t === 'image' || (a.mimeType || '').startsWith('image/'); });
        var vidAtt = lastMsg.attachments.some(function(a) { var t = (a.type || '').toLowerCase(); return t === 'video' || (a.mimeType || '').startsWith('video/'); });
        var audAtt = lastMsg.attachments.some(function(a) { var t = (a.type || '').toLowerCase(); return t === 'audio' || (a.mimeType || '').startsWith('audio/'); });
        if (imgAtt) {
          previewHtml += '<i data-lucide="image" class="chat-row-attachment-icon"></i> Photo';
        } else if (vidAtt) {
          previewHtml += '<i data-lucide="video" class="chat-row-attachment-icon"></i> Video';
        } else if (audAtt) {
          previewHtml += '<i data-lucide="music" class="chat-row-attachment-icon"></i> Audio';
        } else {
          previewHtml += '<i data-lucide="paperclip" class="chat-row-attachment-icon"></i> File';
        }
      } else if (hasAtt && hasText) {
        // Has both text and attachment
        previewHtml += '<i data-lucide="paperclip" class="chat-row-attachment-icon"></i>';
        previewHtml += escapeHtml(formatLastMessage(lastMsg.text));
      } else {
        // Text only or no message
        previewHtml += escapeHtml(formatLastMessage(lastMsg ? lastMsg.text : c.lastMessage));
      }
      var rowClass = 'chat-row';
      if (c.unread > 0) rowClass += ' unread';
      return '<div class="' + rowClass + '" data-chat="' + c.id + '">' +
        (MStore.settings.showChatAvatars !== false
          ? '<div class="chat-row-avatar-wrapper">' +
            '<div class="chat-row-avatar' + (usedGroupGrid ? ' has-group-avatar' : '') + '"' + (isGroup ? ' style="border-radius:12px;"' : '') + '>' + avatarHtml + '</div>' +
            chatFrameHtml +
            statusDot +
          '</div>'
          : '') +
        '<div class="chat-row-info">' +
          '<div class="chat-row-name">' + escapeHtml(c.name) + '</div>' +
          '<div class="chat-row-preview">' + previewHtml + '</div>' +
        '</div>' +
        '<div class="chat-row-meta">' +
          '<div class="chat-row-time">' + timeStr + '</div>' +
          (c.unread > 0 ? '<div class="chat-row-badge premium-badge">' + (c.unread > 99 ? '99+' : c.unread) + '</div>' : '') +
        '</div>' +
      '</div>';
    }

    var html = '';

    // Direct Messages section (only when showing friends tab)
    if (window._activeHomeTab !== 'groups' && dms.length > 0) {
      html += '<div>';
      dms.forEach(function(c) { html += renderChatRow(c, false); });
      html += '</div>';
    }

    // Groups section (only when showing groups tab)
    if (window._activeHomeTab === 'groups' && grpChats.length > 0) {
      html += '<div class="chat-section-header"><i data-lucide="users-round" style="width:14px;height:14px;"></i> Groups</div>';
      html += '<div>';
      grpChats.forEach(function(c) { html += renderChatRow(c, true); });
      html += '</div>';
    }

    html += endOfListHTML();

    container.innerHTML = html;
    renderLucide({ root: container });

    container.querySelectorAll('.chat-row').forEach(function(row) {
      row.addEventListener('click', function() {
        openChat(this.getAttribute('data-chat'));
      });
    });
  }

  /** Send echo bot welcome messages with typing indicator delays */
  function _startEchoWelcome() {
    var echoMsgs = [
      { id: 'e1', from: 'echo', text: "**Hi!** I'm **Orbit Echo**! You can call me *Bit* if you want." },
      { id: 'e2', from: 'echo', text: "You can send messages in here and I'll echo it back at you! (except for images, files, folders and sound files)" },
      { id: 'e3', from: 'echo', text: '**⚠️ THIS MESSAGE WILL SELF-DESTRUCT AFTER 5s**' },
      { id: 'e4', from: 'echo', text: '*Just kidding..* 😄' }
    ];
    
    var totalDelay = 0;
    for (var mi = 0; mi < echoMsgs.length; mi++) {
      var msg = echoMsgs[mi];
      // Capture current delay value in closure
      (function(msg, showDelay, sendDelay) {
        // Step 1: Show typing indicator
        setTimeout(function() {
          if (!window._typingUsers) window._typingUsers = {};
          if (!window._typingUsers['echo']) window._typingUsers['echo'] = {};
          window._typingUsers['echo']['echo'] = { username: 'Orbit Echo' };
          if (window.renderTypingIndicator) window.renderTypingIndicator();
          
          var echoChat = MStore.chats.find(function(c) { return c.id === 'echo'; });
          if (echoChat) { echoChat.isTyping = true; }
          if (window.renderChatList) window.renderChatList();
        }, showDelay);
        
        // Step 2: After "typing", send message and clear indicator
        setTimeout(function() {
          if (window._typingUsers && window._typingUsers['echo']) {
            delete window._typingUsers['echo']['echo'];
            if (window.renderTypingIndicator) window.renderTypingIndicator();
          }
          var echoChat = MStore.chats.find(function(c) { return c.id === 'echo'; });
          if (echoChat) { echoChat.isTyping = false; }
          
          MStore.addMessage('echo', {
            id: msg.id,
            from: 'echo',
            text: msg.text,
            time: new Date().toISOString()
          });
          if (activeChatId === 'echo') renderMessages('echo');
          if (window.renderChatList) window.renderChatList();
        }, sendDelay);
      })(msg, totalDelay, totalDelay + 1200);
      
      totalDelay += 1800; // 1200ms typing + 600ms pause
    }
  }

  /* ---- Drafts ----
     Per-chat composer drafts. Four separate copies of this logic had drifted apart,
     and between them they produced every symptom in Dan's report:

       * the debounced save captured the text at INPUT time and wrote it 300ms later,
         so a message sent inside that window had its draft written back afterwards —
         the draft "reappearing" after you sent it;
       * it wrote against whatever chat was active when the timer fired, not the chat
         the text was typed in, so a draft could land in the wrong conversation;
       * switching away only SAVED when the box had text and never removed the key, so
         an emptied composer left a stale draft behind;
       * restoring only set the value when a draft existed and never cleared the box,
         so the previous chat's text stayed on screen.

     One helper each way now. */
  function saveDraft(chatId, value) {
    if (!chatId) return;
    try {
      var v = (value == null ? '' : String(value)).trim();
      if (v) OrbitKeys.set('draft_' + chatId, v);
      else OrbitKeys.remove('draft_' + chatId);
    } catch (e) { /* storage blocked — drafts are a convenience, never fatal */ }
  }

  function readDraft(chatId) {
    if (!chatId) return '';
    try { return OrbitKeys.get('draft_' + chatId) || ''; } catch (e) { return ''; }
  }

  // Cancel a pending debounced save. Called when the message is sent, so the timer
  // cannot write the just-sent text back as a draft.
  function cancelPendingDraftSave() {
    if (window._draftTimer) {
      clearTimeout(window._draftTimer);
      window._draftTimer = null;
    }
  }

  /* -- Read receipts --
     The desktop sends a READ packet when a chat is read, and mobile has always
     HANDLED them (see the Types.READ branch further down, which sets m.read).
     But mobile never SENT one, so a desktop peer never saw ticks for a message
     read on the phone — the indicator existed on one platform only.
     Payload matches the desktop exactly: { chatId, lastReadMsgId }. */
  var _lastReadSent = {};

  function sendReadReceipt(chatId) {
    if (!chatId || !window.Orbit || !Orbit.P2P || typeof Orbit.P2P.send !== 'function') return;
    if (!MStore.user || !Orbit.Protocol) return;

    var msgs = MStore.getMessages(chatId);
    if (!msgs || !msgs.length) return;
    var lastId = msgs[msgs.length - 1].id;
    if (lastId == null) return;
    // Only when there is something new to acknowledge.
    if (_lastReadSent[chatId] === String(lastId)) return;
    _lastReadSent[chatId] = String(lastId);

    var me = MStore.user.id || MStore.user.userId;
    try {
      Orbit.P2P.send(chatId, Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.READ, me, chatId,
        { chatId: chatId, lastReadMsgId: lastId }));
    } catch (e) {
      // Peer unreachable. Clear the guard so the next read tries again.
      delete _lastReadSent[chatId];
    }
  }

  /* -- Render Chat View -- */
  function openChat(chatId) {
    // Save the draft for the chat we are leaving. Through the helper, so an emptied
    // box REMOVES the key rather than leaving the old text to come back later.
    if (activeChatId) {
      var _oldInput = document.getElementById('chat-input');
      if (_oldInput) saveDraft(activeChatId, _oldInput.value);
      cancelPendingDraftSave();
    }
    activeChatId = chatId;
    if (window.OrbitChat) window.OrbitChat._currentChatId = chatId;
    // Save last opened chat for next startup (so we can pre-load just this chat's messages)
    try { OrbitKeys.set('last_chat', chatId); } catch(e) {}
    editingMsg = null;
    replyingTo = null;
    updateReplyEditBar();
    var chat = MStore.chats.find(function(c) { return c.id === chatId; });
    if (!chat) return;

    // Check if group chat
    var group = MStore.groups.find(function(g) { return g.id === chatId; });

    // Find friend for status (strip 'dm_' prefix if present — chats created from friends list use 'dm_' + peerId)
    var _friendLookupId = chatId.indexOf('dm_') === 0 ? chatId.substring(3) : chatId;
    var friend = MStore.friends.find(function(f) { return f.id === _friendLookupId || f.peerId === _friendLookupId; });
    var statusText = '';
    var statusDot = '';
    if (group) {
      statusText = (group.members ? group.members.length : 0) + ' members';
    } else if (chatId === 'echo') {
      statusText = 'Bot · Online';
    } else if (friend) {
      var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
      statusText = statusLabels[friend.status] || 'Offline';
      statusDot = friend && friend.status
        ? '<span style="width:7px;height:7px;border-radius:50%;background:' + getStatusColor(friend.status) + ';display:inline-block;"></span>'
        : '';
    }

    // Set header
    var headerInfo = document.getElementById('chat-header-info');
    headerInfo.innerHTML =
      '<div style="font-size:15px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(chat.name) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">' +
        statusDot + escapeHtml(statusText) +
      '</div>';

    // Set header avatar with profile frame support
    var _avatarEl = document.getElementById('chat-header-avatar');
    var _friendAv = friend || null;
    if (_avatarEl) {
      var chatAvatar = chat.avatar || (_friendAv ? _friendAv.avatar : null);
      var _displayName = chat.name || 'Chat';
      _avatarEl.style.position = 'relative';
      // A group with no uploaded image gets the member-avatar grid, matching
      // desktop (shared/ui/group-avatar.js).
      var _hdrGridHtml = (group && !chatAvatar && window.OrbitGroupAvatarMobile)
        ? window.OrbitGroupAvatarMobile.forGroup(group, 36, 'var(--bg-surface)')
        : null;
      _avatarEl.classList.toggle('has-group-avatar', !!_hdrGridHtml);
      if (_hdrGridHtml) {
        _avatarEl.innerHTML = _hdrGridHtml;
      } else if (chatAvatar) {
        _avatarEl.innerHTML = '<img src="' + escapeHtml(chatAvatar) + '" alt="">';
      } else {
        _avatarEl.textContent = _displayName.charAt(0).toUpperCase();
      }
      // Profile frame for DMs (friend's profile frame) — gated on stable setting
      if (MStore.settings && MStore.settings.profileFrames) {
        var pfNum = 0;
        if (!group && _friendAv) {
          pfNum = parseInt(_friendAv.profileFrame, 10) || 0;
        }
        if (pfNum > 0) {
          var oldFrame = _avatarEl.querySelector('.pfp-frame');
          if (!oldFrame) {
            var frameEl = document.createElement('img');
            frameEl.className = 'pfp-frame';
            frameEl.draggable = false;
            frameEl.alt = '';
            _avatarEl.appendChild(frameEl);
            oldFrame = frameEl;
          }
          oldFrame.src = 'icons/frames/pfp_frame_' + pfNum + '.png';
        } else {
          var oldFrame = _avatarEl.querySelector('.pfp-frame');
          if (oldFrame) oldFrame.remove();
        }
      }
      _avatarEl.style.display = '';
    }

    // Show/hide members button for groups
    var galleryBtn = document.getElementById('btn-gallery');
    var moreBtn = document.getElementById('btn-chat-more');
    if (group) {
      galleryBtn.style.display = 'flex';
      // The members button is gone. Four icons in a 390px header was one too many, and
      // this was the least-used: the ⋮ menu directly beside it already offers "Group
      // Info", which opens the same sheet. Folded rather than lost.
      var _membersBtn = document.getElementById('btn-chat-members');
      if (_membersBtn) _membersBtn.style.display = 'none';
    } else {
      var membersBtn = document.getElementById('btn-chat-members');
      if (membersBtn) membersBtn.style.display = 'none';
    }

    // Show/hide privacy badge
    var privacyBtn = document.getElementById('btn-privacy-badge');
    if (MStore.settings.privacyMode) {
      privacyBtn.style.display = 'flex';
    } else {
      privacyBtn.style.display = 'none';
    }

    // Hide nav bar, show chat panel
    var _elmobilenav = document.getElementById('mobile-nav');
    if (_elmobilenav) _elmobilenav.style.display = 'none';
    var panel = document.getElementById('panel-chat');
    if (panel) {
      panel.classList.add('anim-enter-up', 'active', 'open');
      setTimeout(function() { panel.classList.remove('anim-enter-up'); }, 300);
    }

    // The tab bar is injected into the tab-level panels, which stay active while
    // a conversation slides over them — so it has to be suppressed explicitly,
    // or it floats over the composer. (This used to hide the profile pill.)
    var _layout = document.getElementById('app-layout');
    if (_layout) _layout.classList.add('orbit-chat-open');

    // Highlight active chat in list
    document.querySelectorAll('.chat-row').forEach(function(r) { r.classList.remove('active-chat'); });
    var activeRow = document.querySelector('.chat-row[data-chat="' + chatId + '"]');
    if (activeRow) activeRow.classList.add('active-chat');

    // Start echo welcome sequence with delays if no messages exist yet
    if (chatId === 'echo' && MStore.getMessages('echo').length === 0) {
      _startEchoWelcome();
    }

    renderMessages(chatId);
    // Apply per-chat wallpaper if set
    applyChatWallpaper(chatId);
    if (window.renderTypingIndicator) window.renderTypingIndicator();

    // Restore this chat's draft — and CLEAR the box when it has none, which is what
    // used to leave the previous conversation's text sitting there.
    var _draft = readDraft(chatId);
    var _input = document.getElementById('chat-input');
    if (_input) {
      _input.value = _draft;
      _input.style.height = 'auto';
      if (_draft) _input.style.height = Math.min(_input.scrollHeight, 150) + 'px';
      updateSendButton();
    }
  }

  window.openChat = openChat;

  var _groupCreateMode = false;
  var _settingsOverlayOpen = false;
  var _settingsInSection = false;

  function showCreateGroup() {
    if (typeof OrbitSheet === 'undefined') {
      // Fallback to old modal (KEEP THIS EXACTLY AS IS)
      var modalTitle = document.querySelector('#modal-overlay .modal-header h3');
      var modalInput = document.getElementById('modal-input');
      var modalAvatarInput = document.getElementById('modal-avatar-input');
      var modalConfirm = document.getElementById('btn-modal-confirm');
      var modalCancel = document.getElementById('btn-modal-cancel');
      var modalClose = document.getElementById('btn-close-modal');
      var modalOverlay = document.getElementById('modal-overlay');
      var memberList = document.getElementById('modal-member-list');
      var modalTabs = document.querySelector('.modal-tabs');
      if (modalTabs) modalTabs.style.display = 'none';
      document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
      var addTab = document.getElementById('modal-tab-add');
      if (addTab) addTab.style.display = 'block';
      modalTitle.textContent = 'Create Group';
      modalInput.placeholder = 'Group name...';
      modalInput.value = '';
      modalAvatarInput.value = '';
      modalAvatarInput.style.display = 'block';
      modalConfirm.textContent = 'Create';
      _groupCreateMode = true;
      var friends = MStore.friends;
      if (friends.length > 0) {
        var mlHtml = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Add members:</div>';
        friends.forEach(function(f) {
          mlHtml += '<label style="display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer;">' +
            '<input type="checkbox" class="group-member-cb" value="' + f.id + '" style="width:16px;height:16px;accent-color:var(--accent-primary);">' +
            '<span style="font-size:13px;color:var(--text-primary);">' + escapeHtml(f.name) + '</span>' +
          '</label>';
        });
        memberList.innerHTML = mlHtml;
        memberList.style.display = 'block';
      } else {
        memberList.style.display = 'none';
      }
      modalOverlay.style.display = 'flex';
      modalInput.focus();
      modalConfirm.onclick = function() { _finishGroupCreate(); };
      return;
    }
    
    // --- Tabbed Bottom Sheet version ---
    var friends = MStore.friends || [];
    
    // Build member checklist
    var memberHtml = '';
    if (friends.length > 0) {
      memberHtml = '<input id="bs-member-search" class="bs-input" placeholder="Search friends..." style="margin-top:8px;font-size:13px;padding:8px 12px;">';
      memberHtml += '<div id="bs-member-list" style="max-height:150px;overflow-y:auto;margin-top:8px;">';
      friends.forEach(function(f) {
        var displayName = f.name || f.peerId || 'Unknown';
        var initial = displayName.charAt(0).toUpperCase();
        var isOnline = f.status === 'online' || f.lastSeen > Date.now() - 45000;
        var avatarHtml = f.avatar 
          ? '<img src="' + f.avatar + '" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;flex-shrink:0;">' + escapeHtml(initial) + '</div>';
        memberHtml += '<label class="bs-member-row" data-name="' + escapeHtml(displayName.toLowerCase()) + '">' +
          avatarHtml +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:14px;color:var(--text-primary);font-weight:500;">' + escapeHtml(displayName) + '</div>' +
          '</div>' +
          '<span class="bs-member-dot ' + (isOnline ? 'online' : 'offline') + '"></span>' +
          '<input type="checkbox" class="bs-group-cb" value="' + escapeHtml(f.id) + '" style="width:16px;height:16px;accent-color:var(--accent-primary);flex-shrink:0;">' +
        '</label>';
      });
      memberHtml += '</div>';
      memberHtml += '<div id="bs-member-count" style="font-size:12px;color:var(--text-muted);margin-top:6px;text-align:center;">0 selected</div>';
    } else {
      memberHtml = window.OrbitEmpty.html({ icon: 'users-round', title: 'No friends to add', compact: true, muted: true });
    }
    
    var html =
      '<div style="padding:8px 20px 4px;">' +
        '<div style="display:flex;align-items:center;margin-bottom:4px;gap:8px;">' +
          '<button id="bs-back-btn" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;display:flex;align-items:center;gap:4px;padding:4px 0;font-size:14px;font-weight:600;"><i data-lucide="arrow-left" style="width:18px;height:18px;"></i> Back</button>' +
        '</div>' +
        // Tab bar
        '<div class="bs-tabs">' +
          '<button class="bs-tab active" data-tab="create">Create</button>' +
          '<button class="bs-tab" data-tab="join">Join via Code</button>' +
        '</div>' +
        // Create tab
        '<div class="bs-tab-content" id="bs-tab-create">' +
          '<input id="bs-group-name" class="bs-input" placeholder="Group name...">' +
          '<div style="display:flex;gap:8px;margin-top:8px;">' +
            '<input id="bs-group-avatar" class="bs-input" style="flex:1;" placeholder="Group avatar URL (optional)">' +
            '<button id="bs-avatar-pick-btn" class="profile-image-pick-btn" type="button" title="Choose from gallery"><i data-lucide="image" style="width:18px;height:18px;"></i></button>' +
          '</div>' +
          (friends.length > 0 ? '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Add Members</div><div style="max-height:150px;overflow-y:auto;">' + memberHtml + '</div></div>' : '') +
          '<button id="bs-group-create" class="bs-btn-primary" style="margin-top:16px;">Create Group</button>' +
        '</div>' +
        // Join via Code tab
        '<div class="bs-tab-content" id="bs-tab-join" style="display:none;">' +
          '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Enter an invite code to join a group</div>' +
          '<input id="bs-join-code" class="bs-input" placeholder="Invite code...">' +
          '<button id="bs-join-submit" class="bs-btn-primary" style="margin-top:12px;">Join Group</button>' +
        '</div>' +
      '</div>';
    
    OrbitSheet.showCustom(html);
    
    setTimeout(function() {
      // Tab switching
      document.querySelectorAll('.bs-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          document.querySelectorAll('.bs-tab').forEach(function(t) { t.classList.remove('active'); });
          this.classList.add('active');
          var tabName = this.getAttribute('data-tab');
          document.querySelectorAll('.bs-tab-content').forEach(function(c) { c.style.display = 'none'; });
          var target = document.getElementById('bs-tab-' + tabName);
          if (target) target.style.display = 'block';
          // Focus first input
          if (tabName === 'create') {
            var ni = document.getElementById('bs-group-name');
            if (ni) ni.focus();
          } else if (tabName === 'join') {
            var ji = document.getElementById('bs-join-code');
            if (ji) ji.focus();
          }
        });
      });
      
      // Group creation logic
      document.getElementById('bs-group-create').addEventListener('click', function() {
        var name = document.getElementById('bs-group-name').value.trim();
        if (!name) { showToast('Enter a group name', 'info'); return; }
        var selectedMembers = [];
        var cbs = document.querySelectorAll('.bs-group-cb:checked');
        cbs.forEach(function(cb) { selectedMembers.push(cb.value); });
        var groupAvatar = document.getElementById('bs-group-avatar').value.trim() || null;
        var groupId = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var codeArr = new Uint8Array(4);
        if (window.crypto) window.crypto.getRandomValues(codeArr);
        var inviteCode = Array.from(codeArr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        var memberList = [];
        var myId = MStore.user ? MStore.user.id : '';
        if (myId) memberList.push({ userId: myId, role: 'owner', joinedAt: new Date().toISOString(), name: MStore.user ? (MStore.user.name || MStore.user.username || '') : '', avatar: MStore.user ? (MStore.user.avatar || null) : null });
        selectedMembers.forEach(function(id) {
          if (id !== myId) {
            var friendData = MStore.friends.find(function(f) { return f.id === id; });
            memberList.push({ userId: id, role: 'member', joinedAt: new Date().toISOString(), name: friendData ? friendData.name : '', avatar: friendData ? (friendData.avatar || null) : null });
          }
        });
        var newGroup = { id: groupId, name: name, avatar: groupAvatar, description: '', inviteCode: inviteCode, pinned: false, notificationMuted: false, pinnedMessages: [], ownerId: myId, members: memberList, createdAt: new Date().toISOString() };
        MStore.groups.push(newGroup);
        MStore.chats.push({ id: groupId, name: name, avatar: groupAvatar, lastMessage: '', lastTime: '', unread: 0 });
        MStore.save();
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          memberList.forEach(function(m) {
            if (m.userId !== myId) {
              var packet = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, myId, m.userId, { groupId: groupId, groupName: name, groupAvatar: groupAvatar, ownerId: myId, members: memberList, inviteCode: inviteCode, description: '' });
              Orbit.P2P.send(m.userId, packet);
            }
          });
        }
        OrbitSheet.hide();
        renderChatList();
        showToast('Group "' + name + '" created' + (selectedMembers.length > 0 ? ' with ' + selectedMembers.length + ' member' + (selectedMembers.length !== 1 ? 's' : '') : ''), 'info');
        openChat(groupId);
      });
      
      // Join via Code
      document.getElementById('bs-join-submit').addEventListener('click', function() {
        var code = document.getElementById('bs-join-code').value.trim();
        if (!code) { showToast('Enter an invite code', 'info'); return; }
        // Try to find group locally by invite code
        var foundGroup = MStore.groups.find(function(g) { return g.inviteCode === code; });
        if (foundGroup) {
          OrbitSheet.hide();
          showToast('Group "' + foundGroup.name + '" found! Joining...', 'info');
          openChat(foundGroup.id);
        } else {
          // Broadcast join request via P2P
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var myId = MStore.user ? MStore.user.id : '';
            var conns = Orbit.P2P.getConnections ? Orbit.P2P.getConnections() : [];
            var sent = false;
            (conns || []).forEach(function(conn) {
              var peerId = conn.peerId || conn.remotePeer || '';
              if (peerId) {
                var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_JOIN_REQUEST, myId, peerId, { inviteCode: code });
                Orbit.P2P.send(peerId, pkt);
                sent = true;
              }
            });
            OrbitSheet.hide();
            showToast(sent ? 'Join request sent to connected peers' : 'No peers connected', 'info');
          } else {
            showToast('No group found with that code', 'info');
          }
        }
      });
      
      // Enter key
      document.getElementById('bs-group-name').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('bs-group-create').click(); }
      });
      document.getElementById('bs-join-code').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('bs-join-submit').click(); }
      });

      // Image pick for group avatar
      var _avatarFileInput = document.createElement('input');
      _avatarFileInput.type = 'file';
      _avatarFileInput.accept = 'image/*';
      _avatarFileInput.style.display = 'none';
      document.getElementById('bs-tab-create').appendChild(_avatarFileInput);

      document.getElementById('bs-avatar-pick-btn').addEventListener('click', function() {
        _avatarFileInput.click();
      });
      _avatarFileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files[0]) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            MStore.compressImage(ev.target.result, 400, 400, 0.8, function(compressedUrl) {
              document.getElementById('bs-group-avatar').value = compressedUrl;
            });
          };
          reader.readAsDataURL(this.files[0]);
        }
        this.value = '';
      });

      // Back button — return to + menu
      document.getElementById('bs-back-btn').addEventListener('click', function() {
        OrbitSheet.hide();
        if (typeof OrbitHome !== 'undefined' && OrbitHome.showQuickSheet) {
          setTimeout(function() { OrbitHome.showQuickSheet(); }, 250);
        }
      });
      
      // Member search filter
      var memberSearch = document.getElementById('bs-member-search');
      if (memberSearch) {
        memberSearch.addEventListener('input', function() {
          var q = this.value.toLowerCase().trim();
          document.querySelectorAll('.bs-member-row').forEach(function(row) {
            var name = row.getAttribute('data-name') || '';
            row.style.display = (!q || name.indexOf(q) !== -1) ? 'flex' : 'none';
          });
        });
      }
      
      // Update selected member count
      function updateMemberCount() {
        var count = document.querySelectorAll('.bs-group-cb:checked').length;
        var el = document.getElementById('bs-member-count');
        if (el) el.textContent = count + ' selected';
      }
      document.querySelectorAll('.bs-group-cb').forEach(function(cb) {
        cb.addEventListener('change', updateMemberCount);
      });
    }, 50);
  }

  function _finishGroupCreate() {
    resetModalToAddFriend();
    hideModal();
  }

  function closeChat() {
    // Save draft before closing
    if (activeChatId) {
      var _closeInput = document.getElementById('chat-input');
      if (_closeInput && _closeInput.value.trim()) {
        saveDraft(activeChatId, _closeInput.value);
      }
    }
    // Send stop-typing indicator before clearing activeChatId
    if (activeChatId && activeChatId !== 'local-echo' && window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var isGrp = MStore.groups.some(function(g) { return g.id === activeChatId; });
      var myId = MStore.user ? MStore.user.id : 'mobile';
      var username = MStore.user ? MStore.user.name : 'Someone';
      var stopPayload = { isTyping: false, username: username };
      if (isGrp) stopPayload.groupId = activeChatId;
      if (isGrp) {
        var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (grp && grp.members) {
          grp.members.forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== myId) {
              Orbit.P2P.send(mid, Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, mid, stopPayload));
            }
          });
        }
      } else {
        Orbit.P2P.send(activeChatId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, activeChatId, stopPayload));
      }
    }
    
    var chatPanel = document.getElementById('panel-chat');
    if (chatPanel) {
      chatPanel.classList.add('anim-exit-down');
      var _closeSession = (window._closeChatCounter = (window._closeChatCounter || 0) + 1);
      setTimeout(function() {
        // Guard: if a new chat was opened since closeChat() was called, don't strip classes
        if (activeChatId !== null || window._closeChatCounter !== _closeSession) return;
        chatPanel.classList.remove('open', 'active', 'anim-exit-down', 'anim-enter-up');
        var _elmobilenav2 = document.getElementById('mobile-nav');
        if (_elmobilenav2) _elmobilenav2.style.display = 'flex';
        // Bring the tab bar back now the conversation has closed.
        var _layout2 = document.getElementById('app-layout');
        if (_layout2) _layout2.classList.remove('orbit-chat-open');
      }, 180);
    }
    activeChatId = null;
    if (window.OrbitChat) window.OrbitChat._currentChatId = null;
    // Clear per-chat wallpaper
    clearChatWallpaper();
    var typingDiv = document.getElementById('typing-indicator');
    if (typingDiv) typingDiv.style.display = 'none';
    
    // Clear search bar
    chatSearchFilter = '';
    var csb = document.getElementById('message-search-bar');
    if (csb) csb.style.display = 'none';
    var csi = document.getElementById('chat-search-input');
    if (csi) csi.value = '';
    // Clear all row highlights
    document.querySelectorAll('.chat-row.active-chat').forEach(function(r) { r.classList.remove('active-chat'); });
    document.querySelectorAll('.friend-row.highlighted').forEach(function(r) { r.classList.remove('highlighted'); });
  }

  window.renderTypingIndicator = function() {
    if (!activeChatId) return;
    var typingDiv = document.getElementById('typing-indicator');
    var typingText = document.getElementById('typing-text');
    if (!typingDiv || !typingText) return;
    
    var users = window._typingUsers && window._typingUsers[activeChatId] ? Object.values(window._typingUsers[activeChatId]) : [];
    if (users.length === 0) {
      typingDiv.style.display = 'none';
    } else if (users.length === 1) {
      typingText.innerText = users[0].username + ' is typing...';
      typingDiv.style.display = 'flex';
    } else if (users.length === 2) {
      typingText.innerText = users[0].username + ' and ' + users[1].username + ' are typing...';
      typingDiv.style.display = 'flex';
    } else {
      typingText.innerText = 'Several people are typing...';
      typingDiv.style.display = 'flex';
    }
  };

  function getStatusColor(status) {
    var colors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', dnd: 'var(--accent-danger)', invisible: 'var(--text-muted)', offline: 'var(--text-muted)' };
    return colors[status] || 'var(--text-muted)';
  }

  /* -- Reply/Edit Bar -- */
  function updateReplyEditBar() {
    var bar = document.getElementById('reply-edit-bar');
    if (!bar) return;
    if (editingMsg) {
      bar.style.display = 'flex';
      bar.style.background = 'rgba(255,170,0,0.1)';
      bar.style.border = '1px solid rgba(255,170,0,0.3)';
      bar.innerHTML =
        '<i data-lucide="pencil" style="width:14px;height:14px;flex-shrink:0;color:#ffaa00;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editing message</span>' +
        '<button id="btn-cancel-edit-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;">&times;</button>';
      renderLucide({ root: bar });
    } else if (replyingTo) {
      bar.style.display = 'flex';
      bar.style.background = 'var(--bg-hover)';
      bar.style.border = '1px solid var(--border-subtle)';
      var rText = (replyingTo.text || '').substring(0, 80);
      var rFallback = '';
      if (!rText && replyingTo.attachments && replyingTo.attachments.length > 0) {
        rFallback = '(' + replyingTo.attachments[0].name + ')';
      } else if (!rText) {
        rFallback = '(Attachment)';
      }
      bar.innerHTML =
        '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + escapeHtml(replyingTo.senderName || 'message') + '</b>: ' + escapeHtml(rText || rFallback) + '</span>' +
        '<button id="btn-cancel-edit-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;">&times;</button>';
      renderLucide({ root: bar });
    } else {
      bar.style.display = 'none';
    }
  }

  function startReply(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    var senderName = 'Unknown';
    if (msg.from === 'me') {
      senderName = MStore.user ? MStore.user.name : 'You';
    } else if (msg.from === 'echo') {
      senderName = 'Orbit Echo';
    } else {
      var friend = MStore.friends.find(function(f) { return f.id === msg.from; });
      senderName = friend ? friend.name : msg.from;
    }
    replyingTo = { id: msg.id, text: msg.text, senderName: senderName, attachments: msg.attachments || msg.fileAttachments || null };
    editingMsg = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) inp.focus();
  }

  function startEdit(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    editingMsg = { id: msg.id, chatId: activeChatId, text: msg.text };
    replyingTo = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) {
      inp.value = msg.text;
      inp.focus();
    }
  }

  function cancelReplyEdit() {
    editingMsg = null;
    replyingTo = null;
    updateReplyEditBar();
    var inp = document.getElementById('chat-input');
    if (inp) inp.value = '';
  }

  function translateMessage(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg || !msg.text) return;
    var bubble = document.querySelector('.message-row[data-msg-id="' + msgId + '"] .message-bubble');
    if (!bubble) return;
    var existing = bubble.querySelector('.translated-text');
    if (existing) { existing.remove(); return; }
    var targetLang = MStore.settings.translateTargetLang || (navigator.language || 'en').split('-')[0] || 'en';
    var sourceLang = MStore.settings.autoDetectSource !== false ? 'auto' : 'en';
    var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(msg.text) + '&langpair=' + sourceLang + '|' + targetLang;
    var div = document.createElement('div');
    div.className = 'translated-text';
    div.textContent = 'Translating...';
    bubble.appendChild(div);
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      if (data && data.responseData && data.responseData.translatedText) {
        div.textContent = '🌐 ' + data.responseData.translatedText;
      } else {
        div.textContent = 'Translation unavailable';
      }
    }).catch(function() {
      div.textContent = 'Translation failed';
    });
  }

  function sendReaction(chatId, msgId, emoji, action) {
    if (!window.Orbit || !Orbit.P2P || !Orbit.P2P.isAvailable()) return;
    var myId = MStore.user ? MStore.user.id : 'mobile';
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    if (isGroup) {
      var grp = MStore.groups.find(function(g) { return g.id === chatId; });
      if (grp) {
        (grp.members || []).forEach(function(m) {
          var mid = typeof m === 'string' ? m : m.userId;
          if (mid !== myId) {
            var pkt = Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.REACTION, myId, mid,
              { msgId: msgId, emoji: emoji, action: action, userId: myId, groupId: chatId }
            );
            Orbit.P2P.send(mid, pkt);
          }
        });
      }
    } else {
      // DM reaction: NO chatId in payload (would overwrite receiver's chat lookup)
      var pkt = Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.REACTION, myId, chatId,
        { msgId: msgId, emoji: emoji, action: action, userId: myId }
      );
      Orbit.P2P.send(chatId, pkt);
    }
  }

  function applyReactionLocally(chatId, msgId, emoji, action) {
    var msgs = MStore.getMessages(chatId);
    if (!msgs.length) return;
    var myId = MStore.user ? MStore.user.id : '';
    for (var i = 0; i < msgs.length; i++) {
      if (String(msgs[i].id) === String(msgId)) {
        var reactions = msgs[i].reactions ? msgs[i].reactions.slice() : [];
        var existingIdx = reactions.findIndex(function(r) { return r.emoji === emoji && r.userId === myId; });
        if (action === 'add' && existingIdx < 0) {
          reactions.push({ emoji: emoji, userId: myId });
        } else if (action === 'remove' && existingIdx >= 0) {
          reactions.splice(existingIdx, 1);
        }
        msgs[i].reactions = reactions;
        break;
      }
    }
    MStore._saveMsgs(chatId);
    if (activeChatId === chatId) renderMessages(chatId);
  }

  function toggleReaction(msgId, pillEl) {
    if (!activeChatId) return;
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    var emoji = pillEl.querySelector('span') ? pillEl.querySelector('span').textContent : '';
    if (!emoji) return;
    var myId = MStore.user ? MStore.user.id : '';
    var hasReacted = msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === myId; });
    var action = hasReacted ? 'remove' : 'add';
    applyReactionLocally(activeChatId, msgId, emoji, action);
    sendReaction(activeChatId, msgId, emoji, action);
  }

  var _reactionPickerEl = null;
  function showReactionPicker(btnEl, msgId) {
    if (_reactionPickerEl) { _reactionPickerEl.remove(); _reactionPickerEl = null; return; }
    var emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    var myId = MStore.user ? MStore.user.id : '';
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    var picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = 'position:fixed;z-index:9999;background:var(--surface-color);border:1px solid var(--border-color);border-radius:12px;padding:6px;display:flex;gap:4px;box-shadow:0 4px 16px rgba(0,0,0,0.3);';
    var rect = btnEl.getBoundingClientRect();
    picker.style.left = Math.max(8, rect.left + rect.width / 2 - 140) + 'px';
    picker.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    emojis.forEach(function(emoji) {
      var hasReacted = msg && msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === myId; });
      var el = document.createElement('span');
      el.textContent = emoji;
      el.style.cssText = 'font-size:24px;cursor:pointer;padding:4px 8px;border-radius:8px;transition:background 0.15s;' + (hasReacted ? 'background:var(--accent-primary-alpha);' : '');
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var action = hasReacted ? 'remove' : 'add';
        applyReactionLocally(activeChatId, msgId, emoji, action);
        sendReaction(activeChatId, msgId, emoji, action);
        if (_reactionPickerEl) { _reactionPickerEl.remove(); _reactionPickerEl = null; }
      });
      picker.appendChild(el);
    });
    document.body.appendChild(picker);
    _reactionPickerEl = picker;
    function closePicker(e) {
      if (!picker.contains(e.target) && e.target !== btnEl) {
        picker.remove();
        _reactionPickerEl = null;
        document.removeEventListener('click', closePicker);
      }
    }
    setTimeout(function() { document.addEventListener('click', closePicker); }, 0);
  }

  function confirmDeleteMessage(msgId) {
    if (!confirm('Delete this message? This cannot be undone.')) return;
    MStore.deleteMessage(activeChatId, msgId);
    renderMessages(activeChatId);
    renderChatList();
  }

  function showForwardModal(msgId) {
    var msgs = MStore.getMessages(activeChatId);
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;

    var senderName = 'Unknown';
    if (msg.from === 'me') {
      senderName = MStore.user ? MStore.user.name : 'You';
    } else if (msg.from === 'echo') {
      senderName = 'Orbit Echo';
    } else {
      var friend = MStore.friends.find(function(f) { return f.id === msg.from; });
      if (friend) {
        senderName = friend.name;
      } else {
        var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (group) {
          var member = group.members.find(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            return mid === msg.from;
          });
          senderName = member ? (typeof member === 'string' ? member : (member.username || member.name || member.userId)) : msg.from;
        }
      }
    }

    var forwardedText = 'Forwarded from ' + senderName + ': ' + (msg.text || '');

    var existing = document.querySelector('.forward-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'forward-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:9999;display:flex;flex-direction:column;';

    var allContacts = [];
    MStore.chats.forEach(function(c) {
      if (c.id !== activeChatId) {
        var isGroup = MStore.groups.some(function(g) { return g.id === c.id; });
        allContacts.push({ id: c.id, name: c.name, avatar: c.avatar, type: isGroup ? 'group' : 'friend' });
      }
    });

    var contactListHtml = '';
    allContacts.forEach(function(c) {
      var initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
      var cAvatarSrc = safeAvatarSrc(c.avatar);
      var avatarHtml = cAvatarSrc
        ? '<img src="' + cAvatarSrc + '" style="width:44px;height:44px;border-radius:' + (c.type === 'group' ? '12px' : '50%') + ';object-fit:cover;">'
        : '<div style="width:44px;height:44px;border-radius:' + (c.type === 'group' ? '12px' : '50%') + ';background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:18px;">' + escapeHtml(initial) + '</div>';
      var typeLabel = c.type === 'group' ? 'Group' : 'Direct Message';
      contactListHtml += '<div class="forward-contact-row" data-contact-id="' + escapeHtml(c.id) + '" style="display:flex;align-items:center;gap:14px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--border-subtle);">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:16px;font-weight:600;color:var(--text-primary);">' + escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + typeLabel + '</div>' +
        '</div>' +
      '</div>';
    });

    var preview = forwardedText.substring(0, 50) + (forwardedText.length > 50 ? '...' : '');

    overlay.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border-subtle);background:var(--bg-surface);flex-shrink:0;">' +
        '<span style="font-size:17px;font-weight:700;color:var(--text-primary);">Forward Message</span>' +
        '<button id="forward-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:22px;height:22px;"></i></button>' +
      '</div>' +
      '<div style="padding:10px 16px;background:var(--bg-hover);border-bottom:1px solid var(--border-subtle);flex-shrink:0;">' +
        '<input id="forward-search-input" type="text" placeholder="Search chats..." autofocus style="width:100%;padding:10px 14px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-primary);font-size:15px;outline:none;box-sizing:border-box;">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-top:6px;padding:0 2px;">Forwarding: ' + escapeHtml(preview) + '</div>' +
      '</div>' +
      '<div id="forward-contact-list" style="flex:1;overflow-y:auto;background:var(--bg-surface);">' +
        contactListHtml +
      '</div>';

    document.body.appendChild(overlay);
    renderLucide({ root: overlay });

    document.getElementById('forward-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var searchInput = document.getElementById('forward-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        var rows = overlay.querySelectorAll('.forward-contact-row');
        rows.forEach(function(row) {
          var nameEl = row.querySelector('div > div:first-child');
          if (nameEl) {
            var name = nameEl.textContent.toLowerCase();
            row.style.display = name.indexOf(q) !== -1 ? 'flex' : 'none';
          }
        });
      });
    }

    overlay.querySelectorAll('.forward-contact-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var targetId = this.getAttribute('data-contact-id');
        if (!targetId) return;

        var newMsg = {
          id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
          from: 'me',
          text: forwardedText,
          time: new Date().toISOString(),
          forwardedFrom: senderName
        };
        if (msg.attachments && msg.attachments.length > 0) {
          newMsg.attachments = msg.attachments.map(function(a) {
            var copy = Object.assign({}, a);
            if (copy.url && copy.url.indexOf('blob:') === 0) {
              if (copy._dataUrl) {
                copy.url = copy._dataUrl;
              } else if (copy._blobKey) {
                copy.url = '';
                copy._pending = true;
              } else {
                copy.url = '';
              }
            }
            return copy;
          });
        }
        if (MStore.user) newMsg.fromName = MStore.user.name;

        MStore.addMessage(targetId, newMsg);

        // Send over P2P if available
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          var isGroup = MStore.groups.some(function(g) { return g.id === targetId; });
          var myId = MStore.user ? MStore.user.id : 'mobile';
          var targetName = '';
          var contact = allContacts.find(function(c) { return c.id === targetId; });
          if (contact) targetName = contact.name;

          var payload = {
            text: forwardedText,
            msgId: newMsg.id,
            forwardedFrom: senderName
          };
          if (newMsg.attachments) payload.attachments = newMsg.attachments;

          if (isGroup) {
            var grp = MStore.groups.find(function(g) { return g.id === targetId; });
            if (grp) {
              (grp.members || []).forEach(function(m) {
                var mid = typeof m === 'string' ? m : m.userId;
                if (mid !== myId) {
                  var fwdPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, myId, mid, payload);
                  Orbit.P2P.send(mid, fwdPkt);
                }
              });
            }
          } else {
            var dmPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, myId, targetId, payload);
            Orbit.P2P.send(targetId, dmPkt);
          }
        }

        renderChatList();
        showToast('Forwarded to ' + targetName, 'info');
        overlay.remove();
      });
    });
  }

  function injectMessageParticles(container) {
    if (!container || !MStore.settings.messageFx) return;
    var bubbles = container.querySelectorAll('.message-row.mine .message-bubble');
    if (!bubbles.length) return;
    var colors = ['#ffd700','#ff6b6b','#48dbfb','#ff9ff3','#feca57','#a29bfe','#fd79a8','#00cec9'];
    var count = 8 + Math.floor(Math.random() * 5);
    for (var bi = 0; bi < bubbles.length; bi++) {
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'fx-particle';
        var angle = Math.random() * 360;
        var dist = 20 + Math.random() * 50;
        var rad = angle * Math.PI / 180;
        p.style.setProperty('--p-x', (Math.cos(rad) * dist) + 'px');
        p.style.setProperty('--p-y', (Math.sin(rad) * dist) + 'px');
        p.style.setProperty('--p-delay', (Math.random() * 0.12) + 's');
        var sz = 3 + Math.random() * 4;
        p.style.width = sz + 'px';
        p.style.height = sz + 'px';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        bubbles[bi].appendChild(p);
        setTimeout(function(el) { if (el.parentNode) el.parentNode.removeChild(el); }, 1200, p);
      }
    }
  }

  /* ─── Call log messages ───
     A finished call leaves an entry in the chat: how long it lasted, whether it
     was a voice or video call, and a button to call back. Stored as a normal
     message with a `call` object instead of `text`, so it sits in the timeline,
     gets a timestamp and can be deleted like anything else. */
  function _fmtCallDuration(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    var mm = (m < 10 ? '0' : '') + m, ss = (s < 10 ? '0' : '') + s;
    return h > 0 ? (h + ':' + mm + ':' + ss) : (m + ':' + ss);
  }

  function renderCallLog(m) {
    if (!m || !m.call) return '';
    var c = m.call;
    var isVideo = c.kind === 'video';
    var peerId = c.peerId || m.from || '';
    var title = isVideo ? 'Video call' : 'Voice call';
    var sub = '';
    var icon = isVideo ? 'video' : 'phone';
    var muted = false;

    switch (c.outcome) {
      case 'ended':
        sub = _fmtCallDuration(c.durationSec);
        break;
      case 'missed':
        title = isVideo ? 'Missed video call' : 'Missed voice call';
        sub = 'No answer';
        icon = 'phone-missed';
        muted = true;
        break;
      case 'declined':
        sub = 'Declined';
        icon = 'phone-off';
        muted = true;
        break;
      case 'no-answer':
        sub = 'No answer';
        icon = 'phone-missed';
        muted = true;
        break;
      case 'busy':
        sub = 'They were on another call';
        icon = 'phone-off';
        muted = true;
        break;
      case 'failed':
        sub = 'Call failed';
        icon = 'phone-off';
        muted = true;
        break;
      default:
        sub = 'Call ended';
        muted = true;
    }

    return '<div class="call-log' + (muted ? ' is-muted' : '') + '">' +
      '<div class="call-log-icon"><i data-lucide="' + icon + '"></i></div>' +
      '<div class="call-log-body">' +
        '<div class="call-log-title">' + escapeHtml(title) + '</div>' +
        '<div class="call-log-sub">' + escapeHtml(sub) + '</div>' +
      '</div>' +
      '<button class="call-log-again" data-call-again="' + escapeHtml(peerId) + '" data-call-video="' + (isVideo ? '1' : '0') + '" title="Call again">' +
        '<i data-lucide="' + (isVideo ? 'video' : 'phone') + '"></i>' +
        '<span>Call again</span>' +
      '</button>' +
    '</div>';
  }

  /* Public entry point for the call manager: record a finished call in the chat.
     `entry` = { kind, outcome, durationSec, peerId, direction } */
  window.OrbitCallLog = {
    add: function (entry) {
      try {
        if (!entry || !entry.peerId) return;
        var peerId = String(entry.peerId);
        var me = (MStore.user && MStore.user.id) || 'mobile';

        // A call can come from someone you have never messaged, so make sure the
        // chat exists before the message is appended or it would be invisible.
        var chat = MStore.chats.find(function (c) { return String(c.id) === peerId; });
        if (!chat) {
          var friend = MStore.friends.find(function (f) {
            return String(f.id) === peerId || String(f.peerId) === peerId;
          });
          chat = {
            id: peerId,
            name: (friend && friend.name) || peerId,
            avatar: friend ? friend.avatar : null,
            lastMessage: '',
            lastTime: '',
            unread: 0
          };
          MStore.chats.push(chat);
        }

        var msg = {
          id: 'call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          // 'me' when I placed the call, otherwise the peer — this drives which
          // side of the timeline the entry sits on.
          from: entry.direction === 'outgoing' ? 'me' : peerId,
          time: new Date().toISOString(),
          call: {
            kind: entry.kind === 'video' ? 'video' : 'voice',
            outcome: entry.outcome || 'ended',
            durationSec: Math.max(0, Math.floor(entry.durationSec || 0)),
            peerId: peerId
          }
        };

        var msgs = MStore.getMessages(peerId);
        msgs.push(msg);
        MStore._saveMsgs(peerId);

        chat.lastMessage = msg.call.kind === 'video' ? 'Video call' : 'Voice call';
        chat.lastTime = msg.time;
        if (activeChatId !== peerId) chat.unread = (chat.unread || 0) + 1;
        MStore.save();

        if (activeChatId === peerId) renderMessages(peerId);
        renderChatList(window._activeHomeTab);
      } catch (e) {
        console.warn('[CallLog] failed to record call:', e && e.message);
      }
    }
  };

  function renderPoll(msg, chatId) {
    if (!msg || !msg.poll) return '';
    var poll = msg.poll;
    var myId = MStore.user ? MStore.user.id : '';
    var totalVotes = 0;
    poll.options.forEach(function(o) { totalVotes += (o.votes || []).length; });
    var hasVoted = poll.options.some(function(o) { return (o.votes || []).indexOf(myId) !== -1; });

    var html = '<div class="poll-container" data-msg-id="' + msg.id + '">';
    html += '<div class="poll-question">' + escapeHtml(poll.question) + '</div>';

    poll.options.forEach(function(opt, idx) {
      var voteCount = (opt.votes || []).length;
      var pct = totalVotes > 0 ? Math.round(voteCount / totalVotes * 100) : 0;
      var iVoted = (opt.votes || []).indexOf(myId) !== -1;

      html += '<div class="poll-option' + (iVoted ? ' voted' : '') + '" data-opt-index="' + idx + '">';
      html += '<div class="poll-option-bar" style="width:' + pct + '%;"></div>';
      html += '<div class="poll-option-text">' + escapeHtml(opt.text) + '</div>';
      html += '<div class="poll-option-count">' + voteCount + '</div>';
      html += '</div>';
    });

    html += '<div class="poll-footer">' + totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '') + '</div>';
    html += '</div>';
    return html;
  }

  function handlePollVote(chatId, msgId, optIndex) {
    var msgs = MStore.messages[chatId];
    if (!msgs) return;
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg || !msg.poll) return;
    var poll = msg.poll;
    var myId = MStore.user ? MStore.user.id : '';
    if (!myId) return;
    var opt = poll.options[optIndex];
    if (!opt) return;

    // Toggle: if already voted for this option, remove vote
    var voteIdx = (opt.votes || []).indexOf(myId);
    if (voteIdx !== -1) {
      opt.votes.splice(voteIdx, 1);
    } else {
      // Remove vote from other options if not multi-select
      if (!poll.multiSelect) {
        poll.options.forEach(function(o) { o.votes = (o.votes || []).filter(function(v) { return v !== myId; }); });
      }
      if (!opt.votes) opt.votes = [];
      opt.votes.push(myId);
    }

    MStore.save();
    renderMessages(chatId);

    // Broadcast vote to group members via P2P
    broadcastPollVote(chatId, msgId, optIndex);
  }

  function broadcastPollVote(chatId, msgId, optIndex) {
    if (!window.Orbit || !window.Orbit.P2P || !Orbit.P2P.isAvailable()) return;
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    if (!isGroup) return;
    var myId = MStore.user ? MStore.user.id : '';
    var grp = MStore.groups.find(function(g) { return g.id === chatId; });
    if (!grp) return;
    (grp.members || []).forEach(function(m) {
      var memberId = typeof m === 'string' ? m : m.userId;
      if (memberId === myId) return;
      Orbit.P2P.send(memberId, Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.POLL_VOTE, myId, memberId,
        { msgId: msgId, optIndex: optIndex, chatId: chatId }
      ));
    });
  }

  /**
   * The Lucide glyph for an attachment, from its name and MIME type.
   *
   * Every attachment used to draw the same generic `file` icon, so a .zip, a
   * .json and a .pdf were a column of identical squares. The mapper lives in
   * `shared/ui/file-icons.js` and the desktop reads the same one. Falls back to
   * the old glyph rather than to nothing if the module is not loaded.
   */
  function _fileIconFor(att) {
    if (att && window.FileIcons && typeof window.FileIcons.icon === 'function') {
      return window.FileIcons.icon(att.name, att.mimeType || att.mime || '');
    }
    return 'file';
  }

  function renderMessages(chatId) {
    // The pinned bar belongs to the chat, so it repaints whenever the chat does.
    try { _renderPinnedBar(chatId); } catch (e) { /* the bar must never break the messages */ }
    try { _renderLinkPreviewBar(chatId); } catch (e) { /* nor must this one */ }
    try { _wireJumpChip(); _updateJumpChip(); } catch (e) { /* nor the chip */ }
    // Never render without a chat.
    //
    // MStore.getMessages(undefined) does not fail — it lazily creates
    // `this.messages[undefined] = []` and returns that, so the feed renders EMPTY. A
    // caller that forgot the argument therefore looked exactly like "the chat was
    // wiped": the message list vanished and the old conversation appeared gone until
    // the chat was reopened.
    //
    // _markMessagePending() did exactly that (`renderMessages()` with no argument), so
    // the "Waiting for them to come back" toast cleared the visible chat every time it
    // fired. Guarding here rather than at the call site means every present and future
    // caller is safe.
    if (!chatId) chatId = activeChatId;
    if (!chatId) return;

    // Blob URL lifecycle managed by browser — no eager revocation here
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    var msgs = MStore.getMessages(chatId);
    // Resolve attachment URLs without mutating store objects (avoids silent data loss)
    window._dataUrlCache = window._dataUrlCache || {};
    function _resUrl(a) {
      var u = a && a.url;
      if (!u) return '';
      // Blob URL — return directly if live (this session), else restore from IndexedDB
      if (u.indexOf('blob:') === 0) {
        // Always try IndexedDB restoration if key exists (survives restart)
        if (a._blobKey && (!a._blobCreated || a._blobSession !== window._orbitSessionId)) {
          if (!window._restoreQueue) window._restoreQueue = {};
          if (!window._restoreQueue[a._blobKey]) {
            window._restoreQueue[a._blobKey] = true;
            window.BlobStoreDB.get(a._blobKey).then(function(ab) {
              if (!ab) {
                // Retry with exponential backoff (300ms, 600ms, 1.2s, 2.4s, 4.8s)
                var _retryDelay = 300;
                var _maxRetries = 5;
                var _retryCount = 0;
                (function _retryBlob() {
                  if (_retryCount >= _maxRetries) {
                    console.warn('[BlobStore] give up restoring', a._blobKey, 'after', _maxRetries, 'retries');
                    window._restoreQueue[a._blobKey] = false;
                    return;
                  }
                  _retryCount++;
                  setTimeout(function() {
                    window.BlobStoreDB.get(a._blobKey).then(function(abN) {
                      if (!abN) { _retryDelay *= 2; _retryBlob(); return; }
                      window._restoreQueue[a._blobKey] = false;
                      try {
                        var mime = a.mimeType || window.orbitGuessMimeType(a.name);
                        var newUrl = URL.createObjectURL(new Blob([abN], { type: mime }));
                        if (a.url && a.url !== newUrl && a.url.indexOf('blob:') === 0 && a._blobCreated) {
                          try { URL.revokeObjectURL(a.url); } catch(e) {}
                        }
                        a.url = newUrl;
                        a._blobCreated = true; a._blobSession = window._orbitSessionId;
                        if (!window._blobUrlsToRevoke) window._blobUrlsToRevoke = [];
                        window._blobUrlsToRevoke.push(newUrl);
                        if (activeChatId) renderMessages(activeChatId);
                      } catch(e) { console.warn('[BlobStore] retry restore error:', e.message); }
                    });
                  }, _retryDelay);
                })();
                return;
              }
              window._restoreQueue[a._blobKey] = false;
              try {
                var mime = a.mimeType || window.orbitGuessMimeType(a.name);
                var newUrl = URL.createObjectURL(new Blob([ab], { type: mime }));
                if (a.url && a.url !== newUrl && a.url.indexOf('blob:') === 0 && a._blobCreated) {
                  try { URL.revokeObjectURL(a.url); } catch(e) {}
                }
                a.url = newUrl;
                a._blobCreated = true; a._blobSession = window._orbitSessionId;
                if (!window._blobUrlsToRevoke) window._blobUrlsToRevoke = [];
                window._blobUrlsToRevoke.push(newUrl);
                if (activeChatId) renderMessages(activeChatId);
              } catch(e) { console.warn('[BlobStore] createObjectURL during restore:', e.message); }
            }).catch(function(err) {
              console.warn('[BlobStore] async restore failed:', a._blobKey, err);
              window._restoreQueue[a._blobKey] = false;
            });
          }
          return ''; // Show "Restoring..." until restore completes
        }
        if (a._blobCreated) return u;
        // Fallback: use _dataUrl if blob can't be restored
        if (a._dataUrl && a._dataUrl.indexOf('data:') === 0) {
          if (a.type === 'video' || a.type === 'audio') return a._dataUrl;
          if (!window._dataUrlCache) window._dataUrlCache = {};
          // Always create fresh blob URL — cache produces stale revoked URLs
          return _dataUrlToBlobUrl(a._dataUrl);
        }
        return ''; // No persistence key — can't restore
      }
      // Data URL — old messages.
      // Video/Audio: return as-is (players handle data: URLs natively)
      // Images: convert to blob URL for better WebView compatibility
      if (u.indexOf('data:') === 0) {
        if (a && (a.type === 'video' || a.type === 'audio')) return u;
        if (!window._dataUrlCache) window._dataUrlCache = {};
        if (!window._dataUrlCache[u]) window._dataUrlCache[u] = _dataUrlToBlobUrl(u);
        return window._dataUrlCache[u];
      }
      // Everything else (file://, orbit-db://, http://, etc.)
      return u;
    }
    // Thread map: parentId (String key) -> replies[] — built over the full chat array
    var threadMap = {};
    for (var _tmk = 0; _tmk < msgs.length; _tmk++) {
      var _tmi = msgs[_tmk];
      if (_tmi.replyTo != null) {
        var _tkey = String(_tmi.replyTo);
        if (!threadMap[_tkey]) threadMap[_tkey] = [];
        threadMap[_tkey].push(_tmi);
      }
    }
    // In-chat search. Scoped to this conversation by construction — it filters
    // the messages we already have for the open chat, so it can never reach
    // another one.
    //
    // The type filter also works with an EMPTY query, so tapping "Media" with
    // nothing typed browses the chat's media instead of matching nothing.
    var _typeFilter = window._chatSearchType || 'all';
    if (chatSearchFilter || _typeFilter !== 'all') {
      var cl = (chatSearchFilter || '').toLowerCase();
      msgs = msgs.filter(function(m) {
        if (cl && (m.text || '').toLowerCase().indexOf(cl) === -1) return false;
        if (_typeFilter === 'all') return true;
        var atts = m.attachments || [];
        if (_typeFilter === 'media') {
          return atts.some(function(a) {
            var t = (a.type || '').toLowerCase();
            return t === 'image' || t === 'video';
          });
        }
        if (_typeFilter === 'voice') {
          return atts.some(function(a) {
            var t = (a.type || '').toLowerCase();
            return t === 'audio' || t === 'voice';
          });
        }
        if (_typeFilter === 'links') return /https?:\/\/\S+/i.test(m.text || '');
        return true;
      });
    }

    // A scoped search should say how much it found, or an empty result is
    // indistinguishable from a filter that did nothing.
    var _countEl = document.getElementById('chat-search-count');
    if (_countEl) {
      var _searching = !!(chatSearchFilter || (_typeFilter && _typeFilter !== 'all'));
      _countEl.textContent = _searching
        ? (msgs.length === 0 ? 'No matches' : msgs.length + (msgs.length === 1 ? ' match' : ' matches'))
        : '';
    }
    if (msgs.length === 0) {
      feed.innerHTML =
        window.OrbitEmpty.html({
          icon: 'message-circle',
          title: 'No messages yet',
          hint: 'Send a message to start the conversation.',
          fill: true
        });
      renderLucide({ root: feed });
      return;
    }
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    // Snapshot existing rendered message IDs so we skip the entry animation on re-render
    var existingMsgIds = {};
    var _existingRows = feed.querySelectorAll('.message-row');
    for (var _eri = 0; _eri < _existingRows.length; _eri++) {
      var _eid = _existingRows[_eri].getAttribute('data-msg-id');
      if (_eid) existingMsgIds[_eid] = true;
    }
    var html = '';
    var prevSender = null;
    var prevTime = null;
    var prevIsMine = null;

    // Day separators. A conversation with only times in it is hard to orient in —
    // "12:06" says nothing about whether that was this morning or last week.
    var _lastDayKey = null;
    function _dayKeyOf(iso) {
      if (!iso) return null;
      var d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    }
    function _dayLabelOf(iso) {
      var d = new Date(iso);
      var today = new Date();
      var yest = new Date(today);
      yest.setDate(yest.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return 'Today';
      if (d.toDateString() === yest.toDateString()) return 'Yesterday';
      var opts = { day: 'numeric', month: 'long' };
      if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
      try { return d.toLocaleDateString(undefined, opts); } catch (e) { return d.toDateString(); }
    }

    msgs.forEach(function(m) {
      var _dk = _dayKeyOf(m.time);
      if (_dk && _dk !== _lastDayKey) {
        _lastDayKey = _dk;
        html += '<div class="day-separator"><span>' + escapeHtml(_dayLabelOf(m.time)) + '</span></div>';
      }
      // A system line: no sender, no bubble, centred. Handled before the own/other split,
      // because neither branch can draw it.
      //
      // This loop is a forEach, so the exit is `return`. The desktop's equivalent is a
      // `for` and needs `continue` — the two are deliberately not copy-paste twins.
      if (m.system) {
        html += '<div class="message-row message-system" data-msg-id="' + m.id + '"' +
          ' style="display:flex;justify-content:center;margin:8px 0;">' +
          '<span style="font-size:11.5px;color:var(--text-muted);background:var(--bg-hover);' +
            'padding:4px 12px;border-radius:999px;text-align:center;">' +
            escapeHtml(m.text || '') +
          '</span>' +
        '</div>';
        return;
      }
      var isMine = m.from === 'me';
      var currentSender = isGroup && !isMine ? m.from : null;
      // Group consecutive messages from same sender within 5 min
      var isGrouped = false;
      if (prevSender === currentSender && prevIsMine === isMine) {
        var timeDiff = prevTime && m.time ? new Date(m.time) - new Date(prevTime) : Infinity;
        if (timeDiff < 300000) { // 5 minutes
          isGrouped = true;
        }
      }
      prevSender = currentSender;
      prevTime = m.time;
      prevIsMine = isMine;

      var senderLabel = '';
      if (isGroup && !isMine && !isGrouped) {
        var senderFriend = MStore.friends.find(function(f) { return f.id === m.from; });
        var senderName = senderFriend ? senderFriend.name : (m.fromName || m.from);
        // data-user-id lets the global long-press handler open the user actions sheet on the sender name
        senderLabel = '<div style="font-size:11px;font-weight:600;color:var(--accent-primary);margin-bottom:2px;" data-user-id="' + escapeHtml(String(m.from)) + '">' + escapeHtml(senderName) + '</div>';
      }
      // Reply quote
      var replyHtml = '';
      if (m.replyTo) {
        var origMsg = msgs.find(function(o) { return o.id === m.replyTo; });
        if (origMsg) {
          var rpText = (origMsg.text || '').substring(0, 60) + ((origMsg.text || '').length > 60 ? '...' : '');
          if (!rpText && origMsg.attachments && origMsg.attachments.length > 0) {
            rpText = '(' + origMsg.attachments[0].name + ')';
          } else if (!rpText) {
            rpText = '(Attachment)';
          }
          var rpUser = origMsg.from === 'me' ? 'You' : 'Unknown';
          if (origMsg.from !== 'me') {
            var rpFriend = MStore.friends.find(function(f) { return f.id === origMsg.from; });
            rpUser = rpFriend ? rpFriend.name : (origMsg.fromName || origMsg.from);
          }
          replyHtml = '<div class="reply-quote" data-reply-msg-id="' + origMsg.id + '">' +
            '<span class="reply-quote-user">' + escapeHtml(rpUser) + '</span> ' + escapeHtml(rpText) +
          '</div>';
        }
      }

      // Edited badge
      var editedBadge = m.edited ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">(edited)</span>' : '';
      // Attachments — separated: images/files in grid, video/audio standalone
      var attachmentsHtml = '';
      if (m.attachments && m.attachments.length > 0) {
        var gridHtml = '';
        var largeHtml = '';
        var hasText = m.text && m.text.trim();
        var showImages = MStore.settings.showImagePreviews !== false;
        // The grid is the images and files; video and audio go below it whole.
        var _gridTotal = m.attachments.filter(function(x) { return x.type !== 'video' && x.type !== 'audio'; }).length;
        var _gridSeen = 0;
          m.attachments.forEach(function(a) {
            // Past four there is no tile to put it in — the fourth carries "+N"
            // instead, and the rest are reachable through the gallery.
            var _isGridCell = a.type !== 'video' && a.type !== 'audio';
            if (_isGridCell) { if (_gridSeen >= 4) return; _gridSeen++; }
            var safeAttId = escapeHtml(String(a.id || ''));
            var attUrl = _resUrl(a);
            if (a.type === 'video') {
              if (attUrl) {
                var posterAttr = a._poster ? ' data-ovp-poster="' + escapeHtml(a._poster) + '"' : '';
                largeHtml += '<div class="att-large-cell att-video-cell ovp-placeholder" data-ovp-url="' + escapeHtml(attUrl) + '"' + posterAttr + ' data-open-video="' + safeAttId + '" data-msg-id="' + m.id + '"></div>';
              } else if (a._pending) {
                largeHtml += '<div class="att-large-cell att-video-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:200px;">' +
                  '<i data-lucide="video" style="width:32px;height:32px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Receiving Video...</div></div>';
              } else if (a._blobKey) {
                largeHtml += '<div class="att-large-cell att-video-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:200px;">' +
                  '<i data-lucide="hard-drive" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Restoring...</div></div>';
              } else {
                gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="' + _fileIconFor(a) + '" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
              }
            } else if (a.type === 'audio') {
              if (attUrl) {
                largeHtml += '<div class="att-large-cell att-audio-cell oap-placeholder" data-oap-url="' + escapeHtml(attUrl) + '" data-oap-name="' + escapeHtml(String(a.name || '')) + '"></div>';
              } else if (a._pending) {
                largeHtml += '<div class="att-large-cell att-audio-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:120px;">' +
                  '<i data-lucide="music" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Receiving Audio...</div></div>';
              } else if (a._blobKey) {
                largeHtml += '<div class="att-large-cell att-audio-cell" style="display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:8px;height:120px;">' +
                  '<i data-lucide="hard-drive" style="width:28px;height:28px;margin-bottom:8px;opacity:0.5;"></i><div style="font-size:13px;font-weight:500;">Restoring...</div></div>';
              } else {
                gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="' + _fileIconFor(a) + '" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
              }
            } else if (a.type === 'image') {
              if (attUrl) {
                if (showImages) {
                  gridHtml += '<div class="att-grid-cell" data-open-image="' + safeAttId + '" data-msg-id="' + m.id + '">' +
                    '<img src="' + escapeHtml(attUrl) + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy">' +
                  '</div>';
                }
              } else if (a._pending) {
                gridHtml += '<div class="att-grid-cell" style="display:flex;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);"><i data-lucide="image" style="width:24px;height:24px;opacity:0.5;"></i></div>';
              } else if (a._blobKey) {
                gridHtml += '<div class="att-grid-cell" style="display:flex;align-items:center;justify-content:center;background:var(--bg-panel);color:var(--text-muted);"><i data-lucide="hard-drive" style="width:24px;height:24px;opacity:0.5;"></i></div>';
              } else {
              gridHtml += '<div class="att-grid-cell att-file-cell"><i data-lucide="' + _fileIconFor(a) + '" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i><div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div></div>';
            }
          } else {
            gridHtml += '<div class="att-grid-cell att-file-cell">' +
              '<i data-lucide="' + _fileIconFor(a) + '" style="width:28px;height:28px;margin-bottom:6px;color:var(--text-muted);"></i>' +
              '<div class="att-file-name">' + escapeHtml(String(a.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        if (_gridTotal > 4 && gridHtml) {
          // Mark the fourth tile. A string pass rather than a counter threaded
          // through every branch that can emit a cell.
          var _seen = 0;
          gridHtml = gridHtml.replace(/class="att-grid-cell/g, function (m2) {
            _seen++;
            return _seen === 4 ? 'class="att-grid-cell att-grid-more" data-more="+' + (_gridTotal - 4) + '"' : m2;
          });
        }
        // Discord's layouts are bucketed: 1, 2, 3, then 4 for everything larger.
        var _gridLayout = Math.min(_gridTotal, 4);
        var gridSection = gridHtml ? '<div class="att-grid" data-count="' + _gridLayout + '" data-total="' + _gridTotal + '">' + gridHtml + '</div>' : '';
        // One wrapper, so the attachments can be styled as a group that sits
        // beside the bubble rather than inside it.
        attachmentsHtml = '<div class="msg-attachments">' +
          (gridSection ? gridSection + '<div style="height:6px;"></div>' : '') + largeHtml +
        '</div>';
      }
      // Link Preview card.
      //
      // ⚠ This was "a basic card without OG fetch", and it showed it: a hardcoded
      // link glyph where the thumbnail goes, the DOMAIN as the title, and then
      // the FULL URL underneath — so the two lines said the same thing twice
      // ("d4niel-dev.github.io" over "https://d4niel-dev.github.io/Orbit/").
      //
      // The composer's bar has fetched real titles and images for a while. The
      // card now paints instantly from what it already knows — domain, glyph —
      // and is upgraded in place when the same fetch answers, so a slow network
      // never leaves an empty card.
      var linkPreviewHtml = '';
      if (m.text && MStore.settings.showLinkPreviews !== false) {
        var urlMatch = m.text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          var url = urlMatch[1];
          var domain = '';
          try { domain = new URL(url).hostname; } catch(e) { domain = url; }
          // The card is addressed by the message id so the upgrade can find THIS
          // one — the same link can appear in several messages.
          var lpKey = 'lp_' + String(m.id == null ? '' : m.id) + '_' + Math.random().toString(36).slice(2, 7);
          linkPreviewHtml = '<div class="link-preview-mob' + (isMine ? ' mine' : '') + '" data-lp="' + escapeHtml(lpKey) + '" data-lp-url="' + escapeHtml(url) + '" onclick="window.open(\'' + escapeHtml(jsEscape(url)) + '\', \'_blank\')">' +
            '<div class="link-preview-mob-img"><i data-lucide="link-2" style="width:18px;height:18px;"></i></div>' +
            '<div class="link-preview-mob-body">' +
              '<div class="link-preview-mob-title">' + escapeHtml(domain) + '</div>' +
              '<div class="link-preview-mob-url">' + escapeHtml(domain) + '</div>' +
            '</div>' +
          '</div>';
        }
      }
      var reactionsHtml = '';
      if (m.reactions && m.reactions.length > 0) {
        var rxGroups = {};
        m.reactions.forEach(function(r) {
          if (!rxGroups[r.emoji]) rxGroups[r.emoji] = [];
          rxGroups[r.emoji].push(r.userId);
        });
        var rxHtml = '';
        // ONE line, at most MAX_RX pills. Anything past that collapses into a
        // "+N" chip; long-press the row to see them all. A reaction row that
        // wraps makes every message a different height and shoves the timestamp
        // around, so it never wraps.
        var MAX_RX = 5;
        var rxEmojis = Object.keys(rxGroups);
        var rxHidden = Math.max(0, rxEmojis.length - MAX_RX);
        rxEmojis.slice(0, MAX_RX).forEach(function(emoji) {
          var count = rxGroups[emoji].length;
          var hasMe = rxGroups[emoji].indexOf(MStore.user ? MStore.user.id : '') !== -1;
          rxHtml += '<div class="reaction-pill' + (hasMe ? ' mine' : '') + '">' +
            '<span>' + escapeHtml(emoji) + '</span>' +
            (count > 1 ? '<span class="reaction-pill-count">' + count + '</span>' : '') +
            '</div>';
        });
        if (rxHidden > 0) {
          rxHtml += '<div class="reaction-pill reaction-more">+' + rxHidden + '</div>';
        }
        reactionsHtml = '<div class="reactions-row" data-msg-id="' + m.id + '">' + rxHtml + '</div>';
      }

      // Poll rendering
      var pollHtml = '';
      if (m.poll) {
        pollHtml = renderPoll(m, chatId);
      }

      // Call log rendering (a finished call, not a text message)
      var callLogHtml = '';
      if (m.call) {
        callLogHtml = renderCallLog(m);
      }

      // Thread replies chip (shown when this message has replies in the chain)
      var threadChipHtml = '';
      var _threadReplies = threadMap[String(m.id)];
      if (_threadReplies && _threadReplies.length > 0) {
        threadChipHtml = '<button class="msg-thread-chip" data-thread-msg-id="' + m.id + '">' + _threadReplies.length + (_threadReplies.length === 1 ? ' reply' : ' replies') + '</button>';
      }

      // Only set data-msg-anim on genuinely new messages to prevent re-animation on re-render
      var _animType = MStore.settings.messageAnim || 'slide';
      var _animAttr = existingMsgIds[m.id] ? '' : ' data-msg-anim="' + _animType + '"';
      var _renderedText = _renderMsgText(m.text, m.mentions);
      if (m.isSpoiler) {
        _renderedText = '<span class="spoiler-text" onclick="this.classList.toggle(\'revealed\')">' + _renderedText + '</span>';
      }
      // A call entry has no text of its own — don't leave an empty text wrapper
      // taking up the bubble's first line.
      var _textWrapHtml = (m.call && !_renderedText)
        ? ''
        : '<div class="msg-text-mob">' + _renderedText + editedBadge + '</div>';
      // Attachments sit BESIDE the bubble, not inside it. A photo, a file, a
      // video and a line of text want different things — a bubble around a photo
      // is a frame around a frame — so only the things that need a surface get
      // one. The row is a flex column, so they stack and align together.
      var _bubbleInner = senderLabel + replyHtml + _textWrapHtml + linkPreviewHtml +
        pollHtml + callLogHtml +
        (MStore.settings.showMessageIds ? '<div style="font-size:9px;color:var(--text-muted);opacity:0.5;margin-top:2px;">' + m.id + '</div>' : '');
      // An image on its own should not leave an empty bubble above it.
      var _bubbleHasContent = _bubbleInner.replace(/<[^>]*>/g, '').trim().length > 0 ||
        replyHtml || pollHtml || callLogHtml || linkPreviewHtml || senderLabel;

      // The reactions belong INSIDE the bubble whenever there is one.
      //
      // `.reactions-row` is `position: absolute; bottom: 0; transform:
      // translateY(52%)` — it is designed to straddle the bubble's bottom edge,
      // bottom-left on your own messages and bottom-right on theirs, poking out
      // by half its height. It needs the bubble to position against; moved out to
      // a wrapper it escapes to the row instead and lands on the wrong side,
      // detached. The bubble also reserves a band at its bottom for them.
      //
      // Only a message with NO bubble — an image on its own — puts them in the
      // group below, because there is nothing to straddle and the alternative is
      // losing them entirely.
      var _rxInside = _bubbleHasContent;
      var _belowBubble = threadChipHtml;

      // With no bubble the pills straddle the ATTACHMENT's bottom edge — the idea
      // is "straddle whatever the message IS". They have to go INSIDE
      // `.msg-attachments` for that: an absolutely-positioned element resolves
      // against its own ancestor chain, and `.msg-below` is a SIBLING of the
      // attachment group, so putting them there left them pinned to the row
      // instead — detached, and on the wrong side.
      if (!_rxInside && reactionsHtml && attachmentsHtml) {
        attachmentsHtml = attachmentsHtml.replace(/<\/div>$/, reactionsHtml + '</div>');
      } else if (!_rxInside && reactionsHtml) {
        // No attachment either — nothing to straddle, so they flow below.
        _belowBubble = reactionsHtml + _belowBubble;
      }

      html += '<div class="message-row ' + (isMine ? 'mine' : 'other') + (isGrouped ? ' grouped' : '') + (m.replyTo != null ? ' msg-threaded' : '') + (m.call ? ' msg-call' : '') + '" data-msg-id="' + m.id + '"' + _animAttr + '>' +
        (_bubbleHasContent ? '<div class="message-bubble">' + _bubbleInner + (_rxInside ? reactionsHtml : '') + '</div>' : '') +
        attachmentsHtml +
        (_belowBubble ? '<div class="msg-below">' + _belowBubble + '</div>' : '') +
        // Timestamp and delivery state sit BELOW the bubble, on the bubble's
        // outer edge — the same place the desktop puts them. Inside the bubble
        // they competed with the message text for the same corner.
        '<div class="message-time">' +
          (m.pending ? '<span class="msg-pending-indicator" title="Waiting for them to come back — sends automatically">⏳</span>' : '') +
          (_getDisappearTimer(chatId) !== 'off' ? '<span class="msg-disappear-indicator" title="Auto-deletes after ' + _getDisappearTimer(chatId) + '">⏱</span>' : '') +
          formatTime(m.time) +
          // Double check. `m.read` is set by the READ packet handler above, so
          // this reflects a real receipt from the peer, not an assumption.
          (isMine && !m.pending
            ? '<span class="msg-ticks' + (m.read ? ' read' : '') + '" title="' + (m.read ? 'Read' : 'Sent') + '">✓✓</span>'
            : '') +
        '</div>' +
      '</div>';
    });
    var _savedAudio = null;
    var _savedVideo = null;
    if (window.OrbitAudioPlayer && typeof OrbitAudioPlayer.isAnyPlaying === 'function' && OrbitAudioPlayer.isAnyPlaying() && typeof OrbitAudioPlayer.savePlaying === 'function') _savedAudio = OrbitAudioPlayer.savePlaying();
    if (window.OrbitVideoPlayer && typeof OrbitVideoPlayer.isAnyPlaying === 'function' && OrbitVideoPlayer.isAnyPlaying() && typeof OrbitVideoPlayer.savePlaying === 'function') _savedVideo = OrbitVideoPlayer.savePlaying();
    feed.setAttribute('data-refreshing', 'true');
    // The design opens a thread with a quiet statement that the conversation is
    // end-to-end encrypted. Orbit is E2EE and the UI never said so anywhere,
    // which is the single most important thing about the product.
    // Only when encryption is actually on. Claiming it unconditionally would be
    // the app asserting a property it is not currently providing.
    var _e2eeOn = !!(MStore.settings && MStore.settings.e2eeEnabled);
    var _e2eeNote = _e2eeOn
      ? '<div class="e2ee-note"><i data-lucide="lock"></i>Messages are end-to-end encrypted</div>'
      : '';
    feed.innerHTML = _e2eeNote + html;
    if (window.lucide && lucide.createIcons) {
      try { lucide.createIcons({ root: feed }); } catch (e) {}
    }
    // The link cards are already painted with the domain and the glyph; this
    // fills in the page's own title and image when the fetch answers.
    try { _upgradeLinkCards(feed); } catch (e) { /* a card must never break the feed */ }
    // Tell the peer what we have seen. Guarded inside, so this only goes out
    // when the newest message actually changed.
    sendReadReceipt(chatId);

    // The composer's trailing button is mic-or-send, and that state is set here
    // as well as on input — otherwise opening a chat shows BOTH, because nothing
    // has run the swap yet.
    updateSendButton();
    // Wire the message long-press context menu (idempotent — safe on every render).
    // The live chat path is window.openChat → this renderMessages; the old
    // OrbitChat.renderMessages path that used to own this is no longer the entry point.
    if (window.OrbitChat && typeof OrbitChat._initContextMenu === 'function') OrbitChat._initContextMenu();
    if (window.Prism) setTimeout(function() { Prism.highlightAll(); }, 0);
    // Wire up copy-code buttons
    setTimeout(function() {
      feed.querySelectorAll('.copy-code-btn').forEach(function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation();
          var code = this.getAttribute('data-code');
          if (!code) return;
          var decoded = code.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(decoded).then(function() {
              var orig = btn.textContent;
              btn.textContent = 'Copied!';
              btn.style.color = 'var(--accent-success, #3fb950)';
              setTimeout(function() { btn.textContent = orig; btn.style.color = ''; }, 2000);
            }).catch(function() {});
          } else {
            // Fallback: select text from the code element
            var codeEl = btn.closest('.code-block-wrap').querySelector('code');
            if (codeEl) {
              var range = document.createRange();
              range.selectNodeContents(codeEl);
              var sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('copy');
              sel.removeAllRanges();
              var orig = btn.textContent;
              btn.textContent = 'Copied!';
              btn.style.color = 'var(--accent-success, #3fb950)';
              setTimeout(function() { btn.textContent = orig; btn.style.color = ''; }, 2000);
            }
          }
        };
      });
    }, 50);
    freezeGifImages(feed);
    if (window.OrbitAudioPlayer) OrbitAudioPlayer.init(feed);
    if (window.OrbitVideoPlayer) OrbitVideoPlayer.init(feed);
    if (_savedAudio && typeof OrbitAudioPlayer.restorePlaying === 'function') OrbitAudioPlayer.restorePlaying(_savedAudio);
    if (_savedVideo && typeof OrbitVideoPlayer.restorePlaying === 'function') OrbitVideoPlayer.restorePlaying(_savedVideo);
    // Fallback: convert raw video/audio data URLs in case any elements bypass the player
    feed.querySelectorAll('video[src^="data:"], audio[src^="data:"]').forEach(function(el) {
      try {
        var newUrl = _dataUrlToBlobUrl(el.getAttribute('src'));
        if (newUrl && newUrl.indexOf('blob:') === 0) el.src = newUrl;
      } catch(e) { console.warn('[Messages] data URL fallback failed', e); }
    });
    requestAnimationFrame(function() { feed.removeAttribute('data-refreshing'); });
    feed.querySelectorAll('.reaction-pill').forEach(function(pill) {
      pill.addEventListener('click', function(e) { e.stopPropagation(); var rm = this.parentElement.getAttribute('data-msg-id') || (this.closest('[data-msg-id]') || {}).getAttribute('data-msg-id'); if (rm) toggleReaction(rm, this); });
    });
    // "Call again" on a call-log entry — redials the same kind of call.
    feed.querySelectorAll('.call-log-again').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var peerId = this.getAttribute('data-call-again');
        var isVideo = this.getAttribute('data-call-video') === '1';
        if (!peerId) return;
        if (!window.OrbitCall) { showToast('Calling is unavailable', 'error'); return; }
        window.OrbitCall.startCall(isVideo, peerId);
      });
    });
    feed.querySelectorAll('.msg-thread-chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var tId = this.getAttribute('data-thread-msg-id');
        if (tId && window.openThreadPanel) window.openThreadPanel(activeChatId, tId);
      });
    });
    // NOTE: a binding for '.msg-pin-btn' used to sit here. Nothing ever rendered that
    // class, so it matched nothing on every render — dead code that looked like a control, and
    // it cost a test run chasing a button that did not exist. Pinning goes through the message
    // action sheet, which is where a user finds it.
    // Click on reply quote scrolls to target
    feed.querySelectorAll('.reply-quote').forEach(function(el) {
      el.addEventListener('click', function() {
        var targetId = this.getAttribute('data-reply-msg-id');
        if (targetId) {
          var target = feed.querySelector('[data-msg-id="' + targetId.replace(/"/g, '') + '"]');
          // We don't have data-msg-id on rows, scroll to message bubble containing the text
          // Simple approach: highlight and scroll
          feed.querySelectorAll('.message-row').forEach(function(r) { r.style.opacity = '1'; });
          var found = false;
          feed.querySelectorAll('.message-row').forEach(function(r) {
            if (!found) {
              var bubble = r.querySelector('.message-bubble');
              if (bubble && bubble.innerHTML.indexOf(targetId) > -1) {
                r.style.opacity = '0.4';
                r.scrollIntoView({ behavior: 'smooth', block: 'center' });
                found = true;
                setTimeout(function() { r.style.opacity = '1'; }, 2000);
              }
            }
          });
        }
      });
    });
    // Click image to open full-size preview
    feed.querySelectorAll('[data-open-image]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var msgId = this.getAttribute('data-msg-id');
        var attId = this.getAttribute('data-open-image');
        var msgs = MStore.getMessages(activeChatId);
        var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
        if (msg && msg.attachments) {
          openImageViewer(msg, attId);
        }
      });
    });
    // Click video to open full-size player
    feed.querySelectorAll('[data-open-video]').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var msgId = this.getAttribute('data-msg-id');
        var attId = this.getAttribute('data-open-video');
        var msgs = MStore.getMessages(activeChatId);
        var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
        if (msg && msg.attachments) {
          var att = msg.attachments.find(function(a) { return String(a.id) === attId; });
          if (att && att.url) {
            var player = document.getElementById('video-preview-player');
            var vidUrl = att.url;
            if (vidUrl.indexOf('data:') === 0) {
    try {
      var vm = vidUrl.match(/^data:(video\/[^;]+|application\/octet-stream);base64,(.+)$/);
      if (vm) {
        var blobUrl = window.orbitBase64ToBlob(vm[2], vm[1]);
        if (blobUrl) vidUrl = blobUrl;
      }
    } catch(e) { console.warn('[Video] preview data URL failed', e); }
            }
            player.src = vidUrl;
            player.load();
            document.getElementById('video-preview-overlay').classList.add('open');
          }
        }
      });
    });
    // Poll option click handlers
    feed.querySelectorAll('.poll-option').forEach(function(el) {
      el.addEventListener('click', function(e) {
        e.stopPropagation();
        var pollContainer = this.closest('.poll-container');
        var msgId = pollContainer.getAttribute('data-msg-id');
        var optIndex = parseInt(this.getAttribute('data-opt-index'), 10);
        handlePollVote(chatId, msgId, optIndex);
      });
    });
    feed.scrollTop = feed.scrollHeight;
    // Deferred re-scroll after content settles (catches lazy-loaded images, lucide SVGs, players)
    setTimeout(function() {
      feed.scrollTop = feed.scrollHeight;
    }, 150);
    renderLucide({ root: feed });
    injectMessageParticles(feed);
  }

  function setupMessageSwipe() {
    var feed = document.getElementById('message-feed');
    if (!feed || feed.dataset.swipeReplyBound) return;
    feed.dataset.swipeReplyBound = 'true';
    var swipe = null;
    var DRAG_MAX = 80;
    var TRIGGER_THRESHOLD = 55;
    var _hapticFired = false;

    function getRow(id) {
      return feed.querySelector('.message-row[data-msg-id="' + id + '"]');
    }

    function ensureIndicator(row) {
      var ind = row.querySelector('.swipe-reply-indicator');
      if (!ind) {
        ind = document.createElement('div');
        ind.className = 'swipe-reply-indicator';
        ind.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>';
        row.style.position = 'relative';
        row.appendChild(ind);
      }
      return ind;
    }

    function getSwipeTargets(row) {
      var targets = [];
      Array.prototype.forEach.call(row.children, function(child) {
        if (!child.classList || !child.classList.contains('swipe-reply-indicator')) {
          targets.push(child);
        }
      });
      var bubble = row.querySelector('.message-bubble');
      return targets.length ? targets : (bubble ? [bubble] : []);
    }

    function applyDrag(row, dx) {
      var clampedDx = Math.max(-DRAG_MAX, Math.min(0, dx));
      getSwipeTargets(row).forEach(function(target) {
        target.style.transition = 'none';
        target.style.transform = 'translateX(' + clampedDx + 'px)';
      });
      var ind = ensureIndicator(row);
      var progress = Math.min(1, Math.abs(clampedDx) / TRIGGER_THRESHOLD);
      var scale = 0.4 + progress * 0.6;
      var opacity = progress;
      ind.style.opacity = opacity;
      ind.style.transform = 'translateY(-50%) scale(' + scale + ')';
      if (progress >= 1) {
        ind.style.color = 'var(--accent-primary, #3b82f6)';
      } else {
        ind.style.color = 'var(--text-muted)';
      }
    }

    function resetRow(row, triggered) {
      getSwipeTargets(row).forEach(function(target) {
        target.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        target.style.transform = 'translateX(0)';
        target.addEventListener('transitionend', function handler() {
          target.style.transition = '';
          target.style.transform = '';
          target.removeEventListener('transitionend', handler);
        });
        setTimeout(function() {
          target.style.transition = '';
          target.style.transform = '';
        }, 350);
      });
      var ind = row.querySelector('.swipe-reply-indicator');
      if (ind) {
        ind.style.transition = 'opacity 0.2s ease';
        ind.style.opacity = '0';
        setTimeout(function() { if (ind.parentNode) ind.remove(); }, 250);
      }
    }

    feed.addEventListener('touchstart', function(e) {
      if (MStore.settings.swipeToReply === false || e.touches.length !== 1) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn, .poll-option')) return;
      var t = e.touches[0];
      swipe = { id: row.getAttribute('data-msg-id'), x: t.clientX, y: t.clientY, locked: false };
      _hapticFired = false;
    }, { passive: true });

    feed.addEventListener('touchmove', function(e) {
      if (!swipe || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - swipe.x;
      var dy = t.clientY - swipe.y;

      // Determine drag direction lock
      if (!swipe.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipe.locked = true;
        swipe.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipe.locked || !swipe.horizontal) return;

      // Only allow dragging LEFT
      if (dx >= 0) {
        var row = getRow(swipe.id);
        if (row) applyDrag(row, 0);
        return;
      }

      if (e.cancelable) e.preventDefault();
      var row = getRow(swipe.id);
      if (row) {
        applyDrag(row, dx);
        // Haptic feedback when crossing threshold
        if (!_hapticFired && Math.abs(dx) >= TRIGGER_THRESHOLD) {
          _hapticFired = true;
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }
    }, { passive: false });

    feed.addEventListener('touchend', function(e) {
      if (!swipe) return;
      var sid = swipe.id;
      var row = getRow(sid);
      if (!row) { swipe = null; return; }

      var triggered = false;
      if (e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var dx = t.clientX - swipe.x;
        var dy = t.clientY - swipe.y;
        if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;
      }

      resetRow(row, triggered);
      if (triggered) startReply(sid);
      swipe = null;
    }, { passive: true });

    feed.addEventListener('touchcancel', function() {
      if (swipe) {
        var row = getRow(swipe.id);
        if (row) resetRow(row, false);
      }
      swipe = null;
    }, { passive: true });
  }

  /* -- Send Message -- */
  var _frozenCache = new Map();
  function freezeGifImages(root, force) {
    if (!root || !root.querySelectorAll) return;
    if (!force && (!MStore.settings || (!MStore.settings.reduceMotion && !MStore.settings.experimentalPerformanceMode))) return;
    function freezeOne(img) {
      img.setAttribute('data-frozen', 'true');
      var src = img.currentSrc || img.src;
      if (_frozenCache.has(src)) {
        if (img.src !== _frozenCache.get(src)) img.src = _frozenCache.get(src);
        return;
      }
      if (img.complete && img.naturalWidth > 0) {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        var frozen = canvas.toDataURL('image/png');
        _frozenCache.set(src, frozen);
        img.src = frozen;
      } else {
        img.addEventListener('load', function() {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          var frozen = c.toDataURL('image/png');
          _frozenCache.set(img.currentSrc || img.src, frozen);
          img.src = frozen;
        });
      }
    }
    root.querySelectorAll('img[src*=".gif"]:not([data-frozen]), img[src*="data:image/gif"]:not([data-frozen]), .avatar img:not([data-frozen])').forEach(freezeOne);
  }

  function _showAvWarningModal() {
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '9999';

      var content = document.createElement('div');
      content.className = 'modal-content';
      content.style.padding = '24px';
      content.style.textAlign = 'center';

      content.innerHTML =
        '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#f59e0b" stroke-width="2" style="display:block;margin:0 auto 12px auto;">' +
          '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
          '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
        '</svg>' +
        '<h3 style="margin:0 0 8px 0;font-size:16px;font-weight:600;">Unstable Transfer Warning</h3>' +
        '<p style="margin:0;font-size:13px;line-height:1.5;color:var(--text-muted);">' +
          'Audio and video file transfers are still unstable. The file may not play correctly or the transfer may fail.' +
        '</p>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none;text-align:left;">' +
          '<input type="checkbox" id="chk-av-warn-dismiss" style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer;flex-shrink:0;">' +
          '<span style="font-size:12px;color:var(--text-muted);">Don\'t show this warning again</span>' +
        '</label>' +
        '<div style="display:flex;gap:8px;margin-top:4px;">' +
          '<button id="btn-av-warn-cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-normal);font-size:14px;">Cancel</button>' +
          '<button id="btn-av-warn-proceed" style="flex:1;padding:10px;border-radius:8px;border:none;background:#f59e0b;color:#fff;font-size:14px;font-weight:500;">Send Anyway</button>' +
        '</div>';

      overlay.appendChild(content);
      document.body.appendChild(overlay);

      function cleanup() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) { cleanup(); resolve(false); }
      });

      document.getElementById('btn-av-warn-cancel').addEventListener('click', function() {
        cleanup();
        resolve(false);
      });
      document.getElementById('btn-av-warn-proceed').addEventListener('click', function() {
        var dontShow = document.getElementById('chk-av-warn-dismiss').checked;
        if (dontShow) {
          try { localStorage.setItem('orbit_av_warn_hidden', '1'); } catch(e) {}
        }
        cleanup();
        resolve(true);
      });
    });
  }

  /* ---- Disappearing Messages Timer ---- */

  function _parseTimerValue(val) {
    if (val === 'off' || !val) return 0;
    var unit = val.slice(-1);
    var num = parseInt(val.slice(0, -1), 10);
    if (unit === 's') return num * 1000;
    if (unit === 'm') return num * 60000;
    if (unit === 'h') return num * 3600000;
    if (val === '24h') return 86400000;
    return 0;
  }

  function _getDisappearTimer(chatId) {
    // Check groups first
    var grp = MStore.groups.find(function(g) { return g.id === chatId; });
    if (grp && grp.disappearTimer !== undefined) return grp.disappearTimer;
    // Then check DM chats
    var chat = MStore.chats.find(function(c) { return c.id === chatId; });
    if (chat && chat.disappearTimer !== undefined) return chat.disappearTimer;
    return 'off';
  }

  function _setDisappearTimer(chatId, val) {
    var grp = MStore.groups.find(function(g) { return g.id === chatId; });
    if (grp) { grp.disappearTimer = val; MStore.save(); return; }
    var chat = MStore.chats.find(function(c) { return c.id === chatId; });
    if (chat) { chat.disappearTimer = val; MStore.save(); }
  }

  function _startDisappearTimer(chatId, msgId) {
    var timerVal = _getDisappearTimer(chatId);
    var ms = _parseTimerValue(timerVal);
    if (ms <= 0) return;
    var key = chatId + '_' + msgId;
    // Cancel any existing timer for this message
    if (window._disappearTimers[key]) {
      clearTimeout(window._disappearTimers[key]);
    }
    window._disappearTimers[key] = setTimeout(function() {
      MStore.deleteMessage(chatId, msgId);
      delete window._disappearTimers[key];
      if (activeChatId === chatId) renderMessages(chatId);
      renderChatList();
    }, ms);
  }

  function _cancelDisappearTimer(chatId, msgId) {
    var key = chatId + '_' + msgId;
    if (window._disappearTimers[key]) {
      clearTimeout(window._disappearTimers[key]);
      delete window._disappearTimers[key];
    }
  }

  /* ---- Scheduled Messages ---- */

  function _checkScheduledMessages() {
    var due = MStore.getDueScheduledMessages();
    due.forEach(function(sched) {
      // Mark sent immediately to prevent double-sending
      sched.sent = true;
      MStore.set('scheduledMessages', MStore.scheduledMessages);
      // Clone attachments for the send pipeline
      var prevActiveChatId = activeChatId;
      var prevStaged = stagedFiles.slice();
      if (sched.attachments && sched.attachments.length > 0) {
        stagedFiles = sched.attachments.map(function(a) {
          return { name: a.name, type: a.type, size: a.size, url: a.url };
        });
      } else {
        stagedFiles = [];
      }
      // Temporarily switch active chat and send
      activeChatId = sched.chatId;
      var input = document.getElementById('chat-input');
      var savedInput = input.value;
      input.value = sched.text;
      sendMessage();
      input.value = savedInput;
      activeChatId = prevActiveChatId;
      stagedFiles = prevStaged;
      showToast('Scheduled message sent', 'success');
    });
  }

  // Start scheduled message checker
  var _schedInterval = setInterval(_checkScheduledMessages, 10000);
  // Run once on startup after a short delay to let everything initialize
  setTimeout(_checkScheduledMessages, 2000);

  function updateSendButton() {
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('btn-send');
    if (!input || !sendBtn) return;
    var hasText = input.value.trim().length > 0;
    var hasFiles = typeof stagedFiles !== 'undefined' && stagedFiles.length > 0;
    var ready = hasText || hasFiles;
    sendBtn.disabled = !ready;

    // One trailing control, not two. Mic when there is nothing to send, send
    // when there is — otherwise both sit there and the composer reads as four
    // controls crowded into a 48px pill.
    var voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.style.display = ready ? 'none' : '';
    sendBtn.style.display = ready ? '' : 'none';
    // Update scheduled messages badge
    var badge = document.getElementById('scheduled-badge');
    if (badge) {
      var pendCount = MStore.scheduledMessages.filter(function(m) { return !m.sent; }).length;
      badge.style.display = pendCount > 0 ? 'flex' : 'none';
      badge.textContent = pendCount;
    }
  }

  /**
   * Deliver a message packet, queueing it when the peer is not reachable.
   *
   * Every send used to be fire-and-forget: if the peer happened to be offline the
   * call did nothing and the message was gone. On a LAN that is constant — a laptop
   * lid closes, a phone leaves Wi-Fi — so the outbox holds the packet until they are
   * back. Falls back to a direct send if the module is missing, so an older cached
   * bundle cannot lose messages outright.
   */
  /**
   * Send a message, and report honestly whether the transport took it.
   *
   * The transport ALREADY owns delivery and retry, and I did not realise that when I
   * built the outbox on top of it. shared/network/p2p-mobile.js:
   *
   *   - `send()` is async and returns { success: true } or { success: false, queued: true }
   *   - on failure it pushes onto `_pendingMessages` (its own retry queue)
   *   - `flushPending(connectionId)` drains that queue and re-sends when a peer connects
   *   - entries expire via `_maxPendingAge`
   *
   * So queueing the same packet in a second outbox meant every failed message was
   * retried TWICE — duplicate delivery. The repeated identical frames in the desktop log
   * were almost certainly that.
   *
   * The old version also showed "Waiting for them to come back" whenever reachable()
   * said no, which was frequently wrong (a peer can be known by user id, connection id,
   * host or IP and only one is registered) — so the toast appeared on sends that had
   * actually succeeded.
   *
   * This now just reports what happened. No second queue.
   */
  /**
   * Coerce a stored chunk to bytes.
   *
   * Chunks are ArrayBuffers now (decoded on arrival). Partials written by older builds
   * still hold base64 strings, so both shapes must be accepted — but an ArrayBuffer must
   * never be re-decoded, which would allocate a second copy of the whole file.
   */
  function _chunkToBytes(c) {
    if (!c) return new ArrayBuffer(0);
    if (typeof c === 'string') return window.orbitBase64ToArrayBuffer(c);
    if (typeof c.byteLength === 'number') return c;          // ArrayBuffer
    if (c.buffer) return c.buffer;                            // typed array view
    return new ArrayBuffer(0);
  }

  function _deliverOrQueue(peerId, packet, msgId) {
    var result;
    try {
      result = Orbit.P2P.send(peerId, packet);
    } catch (e) {
      console.warn('[Send] transport threw:', e);
      _markMessagePending(peerId, msgId);
      return false;
    }

    if (result && typeof result.then === 'function') {
      result.then(function (r) {
        // Only claim it is waiting when the transport actually says it could not send.
        if (r && r.success === false) _markMessagePending(peerId, msgId);
      }).catch(function (e) {
        console.warn('[Send] transport rejected:', e);
        _markMessagePending(peerId, msgId);
      });
    }
    return true;
  }

  /** Flag a queued message so it does not look delivered. */
  function _markMessagePending(chatId, msgId) {
    try {
      var msgs = MStore.getMessages(chatId);
      for (var i = 0; i < msgs.length; i++) {
        if (String(msgs[i].id) === String(msgId)) {
          msgs[i].pending = true;
          msgs[i].pendingSince = Date.now();
          break;
        }
      }
      MStore.save();
      if (activeChatId === chatId) renderMessages(chatId);
    } catch (e) { /* the queue itself already succeeded */ }
    showToast('Waiting for them to come back — it will send automatically', 'info');
  }

  /**
   * A short, human-comparable fingerprint of a public key.
   * SHA-256 truncated to 8 bytes and grouped in fours, so two people can read it
   * aloud to each other. Not the whole digest — this is for eyeball comparison, not
   * for a cryptographic proof.
   */
  function _keyFingerprint(key) {
    try {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(key)))
        .then(function (d) {
          var b = new Uint8Array(d);
          var out = '';
          for (var i = 0; i < 8; i++) out += ('0' + b[i].toString(16)).slice(-2);
          return out.toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
        });
    } catch (e) {
      return Promise.resolve('');
    }
  }

  /**
   * Record a peer's public key — and shout if it has changed.
   *
   * Keys are pinned on first use (that is what QR pairing establishes). But pinning
   * without ever checking again is only half the job: if a key changes later, the
   * app previously just accepted the new one silently. That is the classic
   * man-in-the-middle gap, and for an app whose whole pitch is that your
   * conversations stay yours, accepting a swapped key without a word undermines the
   * claim. A peer's key legitimately changes when they reinstall, so this does not
   * block the chat — it tells you, and leaves a mark on the contact.
   *
   * Called from every site that learns a peer key: QR pairing, the connection
   * handshake, and the two discovery paths.
   */
  function _setPeerKey(friend, key) {
    if (!friend || !key) return;
    if (friend.publicKey === key) return;          // unchanged — nothing to do

    var hadKey = !!friend.publicKey;
    friend.publicKey = key;                        // set synchronously; callers save

    _keyFingerprint(key).then(function (fp) {
      var previous = friend.keyFingerprint;
      friend.keyFingerprint = fp;

      if (hadKey && previous && previous !== fp) {
        friend.keyChanged = true;
        friend.keyChangedAt = Date.now();
        MStore.save();
        showToast((friend.name || 'This contact') +
          '’s security key has changed — confirm it with them before trusting this chat',
          'error');
        console.warn('[E2EE] peer key changed for ' + friend.id + ': ' + previous + ' -> ' + fp);
        if (window.orbitNotify) {
          window.orbitNotify('ERROR', 'Security key changed',
            (friend.name || 'A contact') + '’s key is not the one you pinned.',
            'keychange_' + friend.id);
        }
      } else {
        MStore.save();
      }
    });
  }

  async function sendMessage() {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if ((!text && stagedFiles.length === 0) || !activeChatId) return;

    // Send stop-typing indicator immediately
    if (activeChatId && activeChatId !== 'local-echo' && window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var isGrp = MStore.groups.some(function(g) { return g.id === activeChatId; });
      var myId = MStore.user ? MStore.user.id : 'mobile';
      var username = MStore.user ? MStore.user.name : 'Someone';
      var stopPayload = { isTyping: false, username: username };
      if (isGrp) stopPayload.groupId = activeChatId;
      if (isGrp) {
        var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
        if (grp && grp.members) {
          grp.members.forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== myId) {
              Orbit.P2P.send(mid, Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, mid, stopPayload));
            }
          });
        }
      } else {
        Orbit.P2P.send(activeChatId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, activeChatId, stopPayload));
      }
    }

    // Warn about unstable audio/video transfers before proceeding
    var hasAvFile = stagedFiles.some(function(s) { return s.type === 'audio' || s.type === 'video'; });
    if (hasAvFile) {
      try {
        if (localStorage.getItem('orbit_av_warn_hidden') === '1') { /* skip */ }
        else {
          var proceed = await _showAvWarningModal();
          if (!proceed) return;
        }
      } catch(e) { /* localStorage unavailable */ }
    }

    if (editingMsg) {
      MStore.editMessage(editingMsg.chatId, editingMsg.id, text);
      if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
        var isGroup = MStore.groups.some(function(g) { return g.id === editingMsg.chatId; });
        var myId = MStore.user ? MStore.user.id : 'mobile';
        if (isGroup) {
          var grp = MStore.groups.find(function(g) { return g.id === editingMsg.chatId; });
          if (grp) {
            (grp.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== myId) {
                var pkt = Orbit.Protocol.createPacket(
                  Orbit.Protocol.Types.MESSAGE_EDIT, myId, mid,
                  { msgId: editingMsg.id, newText: text, chatId: editingMsg.chatId }
                );
                Orbit.P2P.send(mid, pkt);
              }
            });
          }
        } else {
          var pkt = Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.MESSAGE_EDIT, myId, editingMsg.chatId,
            { msgId: editingMsg.id, newText: text }
          );
          Orbit.P2P.send(editingMsg.chatId, pkt);
        }
      }
      editingMsg = null;
      replyingTo = null;
      updateReplyEditBar();
      renderMessages(activeChatId);
      renderChatList();
      input.value = '';
      cancelPendingDraftSave();
      saveDraft(activeChatId, '');
      input.style.height = 'auto';
      return;
    }

    var INLINE_LIMIT = 1.5 * 1024 * 1024;
    var CHUNK_SIZE = 64 * 1024;

    // Helper: convert ArrayBuffer to base64 string (binary-per-chunk for large files)
    function _arrayBufferToBase64(ab) {
      var u8 = new Uint8Array(ab);
      var binary = '';
      for (var i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
      return btoa(binary);
    }

    var inlineAttachments = [];
    var largeFiles = [];
    stagedFiles.forEach(function(s) {
      var size = s._arrayBuffer ? s._arrayBuffer.byteLength : 0;
      if (size === 0 && s.url && s.url.indexOf('data:') === 0) {
        var b64 = s.url.substring(s.url.indexOf(',') + 1);
        size = Math.round(b64.length * 3 / 4);
      }
      var att = {
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type: s.type,
        name: s.name,
        size: s.size,
        url: s.url  // blob URL for audio/video, data URL for images
      };
      if (size >= INLINE_LIMIT && (s.type === 'video' || s.type === 'audio' || s.type === 'file')) {
        // Keep the ArrayBuffer for on-the-fly chunking during send (matching desktop pattern)
        if (s._arrayBuffer) {
          att._arrayBuffer = s._arrayBuffer;
          att._totalSize = size;
          att.mimeType = s.mimeType || '';
        }
        largeFiles.push(att);
      } else {
        // For inline attachments with ArrayBuffer (e.g. small audio), convert to base64
        if (s._arrayBuffer) {
          var mime = s.type === 'video' ? 'video/mp4' : (s.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream');
          att.url = 'data:' + mime + ';base64,' + _arrayBufferToBase64(s._arrayBuffer);
        }
        inlineAttachments.push(att);
      }
    });

    // Build allAttachments: inline are used as-is, large files use the blob URL for display
    var allAttachments = [];
    inlineAttachments.forEach(function(a) { allAttachments.push(a); });
    largeFiles.forEach(function(a) {
      if (a.type === 'audio' || a.type === 'video') {
        var localKey = 'local_' + a.id;
        var localAtt = {
          id: a.id, _fileId: a.id, name: a.name, type: a.type,
          url: a.url, _blobCreated: true, _blobSession: window._orbitSessionId
        };
        if (a._arrayBuffer) {
          window.BlobStoreDB.put(localKey, a._arrayBuffer).then(function() {
            localAtt._blobKey = localKey;
          }).catch(function(err) {
            console.warn('[Send] Local persist failed:', err);
          });
        }
        allAttachments.push(localAtt);
        if (a.type === 'video' && a._arrayBuffer) {
          try {
            var blob = new Blob([a._arrayBuffer], { type: 'video/mp4' });
            var blobUrl = URL.createObjectURL(blob);
            var vid = document.createElement('video');
            vid.preload = 'auto';
            vid.muted = true;
            vid.playsInline = true;
            var thumbnailCaptureTimeout = setTimeout(function() {
              vid.remove();
              URL.revokeObjectURL(blobUrl);
            }, 10000);
            vid.onloadeddata = function() {
              vid.currentTime = 0.5;
            };
            vid.onseeked = function() {
              try {
                var canvas = document.createElement('canvas');
                canvas.width = vid.videoWidth || 320;
                canvas.height = vid.videoHeight || 240;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                var posterDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                var lastAtt = allAttachments[allAttachments.length - 1];
                if (lastAtt) lastAtt._poster = posterDataUrl;
                a._poster = posterDataUrl;
              } catch(e) {}
              clearTimeout(thumbnailCaptureTimeout);
              vid.remove();
              URL.revokeObjectURL(blobUrl);
            };
            vid.onerror = function() {
              clearTimeout(thumbnailCaptureTimeout);
              vid.remove();
              URL.revokeObjectURL(blobUrl);
            };
            vid.src = blobUrl;
            vid.load();
          } catch(e) {}
        }
      } else {
        allAttachments.push(a);
      }
    });
    var msgId = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    var newMsg = {
      id: msgId,
      from: 'me',
      text: text,
      time: new Date().toISOString(),
      attachments: allAttachments.length > 0 ? allAttachments : undefined
    };

    // ── Handle slash commands ──
    var cmdResult = _handleSlashCommand(text, newMsg);
    if (cmdResult) {
      if (cmdResult.cancel) return;
      if (cmdResult.handled) {
        if (cmdResult.msg.text !== undefined) newMsg.text = cmdResult.msg.text;
        if (cmdResult.msg.poll) newMsg.poll = cmdResult.msg.poll;
        if (cmdResult.msg.isSpoiler) newMsg.isSpoiler = true;
      }
    }
    if (MStore.user) newMsg.fromName = MStore.user.name;
    if (replyingTo) newMsg.replyTo = replyingTo.id;
    // Extract @mention data from text
    if (text) {
      var mentionMatches = text.match(/@(\w+)/g);
      if (mentionMatches) {
        var mentionUsers = _getMentionableUsers(activeChatId);
        var mentions = [];
        mentionMatches.forEach(function(match) {
          var username = match.substring(1).toLowerCase();
          var found = mentionUsers.find(function(u) { return u.name.toLowerCase() === username; });
          if (found) {
            // Avoid duplicates
            if (!mentions.some(function(m) { return m.userId === found.id; })) {
              mentions.push({ userId: found.id, username: found.name, name: found.name, tag: found.tag });
            }
          }
        });
        if (mentions.length > 0) newMsg.mentions = mentions;
      }
    }
    MStore.addMessage(activeChatId, newMsg);
    _startDisappearTimer(activeChatId, newMsg.id);
    _offerUndoSend(activeChatId, newMsg);
    stagedFiles = [];
    renderFilePreview();

    renderMessages(activeChatId);
    renderChatList();
    input.value = '';
    hideCommandTooltip();
    cancelPendingDraftSave();
    saveDraft(activeChatId, '');
    input.style.height = 'auto';
    updateSendButton();
    replyingTo = null;
    updateReplyEditBar();

    // Echo bot
    if (activeChatId === 'echo') {
      setTimeout(function() {
        var echoMsgId = 'm' + Date.now();
        MStore.addMessage('echo', {
          id: echoMsgId,
          from: 'echo',
          text: 'Echo: ' + text,
          time: new Date().toISOString()
        });
        _startDisappearTimer('echo', echoMsgId);
        renderMessages('echo');
        renderChatList();
      }, 500);
      return;
    }

    function _broadcastToGroupMembers(groupId, textToSend, isE2EE) {
      var grp = MStore.groups.find(function(g) { return g.id === groupId; });
      if (!grp) return;

      // Members we could not encrypt to. Group E2EE is pairwise, so blocking the
      // whole message over one member without a key would be too blunt — but
      // sending them PLAINTEXT would silently leak a message the user believes
      // is encrypted. Skip them, and say so.
      var skipped = [];
      var pending = 0;
      var reported = false;

      function reportIfDone() {
        if (reported || pending > 0 || skipped.length === 0) return;
        reported = true;
        showToast('Sent encrypted — ' + skipped.length + ' member' +
          (skipped.length === 1 ? '' : 's') + ' skipped (no encryption key): ' +
          skipped.join(', '), 'info');
      }

      (grp.members || []).forEach(function(m) {
        var memberId = typeof m === 'string' ? m : m.userId;
        if (memberId === (MStore.user ? MStore.user.id : '')) return;
        var memberFriend = MStore.friends.find(function(f) { return f.id === memberId; });
        var memberKey = memberFriend ? memberFriend.publicKey : (typeof m !== 'string' ? m.publicKey : null);
        var memberLabel = memberFriend ? memberFriend.name : memberId;
        var grpAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
        var payload = {
          text: textToSend, groupId: groupId, msgId: newMsg.id, replyTo: newMsg.replyTo,
          attachments: grpAttachments.length > 0 ? grpAttachments : undefined,
          fromName: newMsg.fromName,
          poll: newMsg.poll || undefined
        };

        // E2EE off for this group — plaintext is what the user asked for.
        if (!isE2EE) {
          Orbit.P2P.send(memberId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user ? MStore.user.id : 'mobile', memberId, payload));
          return;
        }

        // No key for this member: skip rather than send them plaintext.
        if (!memberKey) {
          skipped.push(memberLabel);
          reportIfDone();
          return;
        }

        pending++;
        Orbit.E2EE.encrypt(textToSend, memberKey).then(function(encrypted) {
          pending--;
          if (!encrypted) {
            skipped.push(memberLabel);
            reportIfDone();
            return;
          }
          payload.e2ee = true;
          payload.ciphertext = encrypted.ciphertext;
          payload.nonce = encrypted.nonce;
          payload.poll = newMsg.poll || undefined;
          Orbit.P2P.send(memberId, Orbit.Protocol.createPacket(Orbit.Protocol.Types.MESSAGE, MStore.user.id, memberId, payload));
          reportIfDone();
        });
      });

      reportIfDone();
    }

    // Shared base64 decoder for hash computation (avoids allocating lookup table repeatedly)
    var _b64Lookup = null;
    function _base64ToBytes(b64str) {
      if (!_b64Lookup) {
        _b64Lookup = new Int8Array(256);
        for (var i = 0; i < 256; i++) _b64Lookup[i] = -1;
        var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        for (var li = 0; li < 64; li++) _b64Lookup[b64chars.charCodeAt(li)] = li;
      }
      var _validLen = 0;
      for (var i = 0; i < b64str.length; i++) {
        if (_b64Lookup[b64str.charCodeAt(i)] !== -1) _validLen++;
      }
      var _binLen = Math.floor(_validLen * 3 / 4);
      if (_binLen === 0) return new ArrayBuffer(0);
      var _buf = new ArrayBuffer(_binLen);
      var _bytes = new Uint8Array(_buf);
      var _p = 0;
      var _b = [0,0,0,0];
      var _bi = 0;
      for (var i = 0; i < b64str.length; i++) {
        var val = _b64Lookup[b64str.charCodeAt(i)];
        if (val === -1 || val === void 0) continue;
        _b[_bi++] = val;
        if (_bi === 4) {
          if (_p < _binLen) _bytes[_p++] = (_b[0] << 2) | (_b[1] >> 4);
          if (_p < _binLen) _bytes[_p++] = ((_b[1] & 15) << 4) | (_b[2] >> 2);
          if (_p < _binLen) _bytes[_p++] = ((_b[2] & 3) << 6) | _b[3];
          _bi = 0;
        }
      }
      if (_bi > 0) {
        while (_bi < 4) _b[_bi++] = 0;
        if (_p < _binLen) _bytes[_p++] = (_b[0] << 2) | (_b[1] >> 4);
        if (_p < _binLen) _bytes[_p++] = ((_b[1] & 15) << 4) | (_b[2] >> 2);
        if (_p < _binLen) _bytes[_p++] = ((_b[2] & 3) << 6) | _b[3];
      }
      return _buf;
    }

    function _sendLargeFileToPeer(att, peerId, isGroup) {
      var ab = att._arrayBuffer;
      var fileSize = att._totalSize || (ab ? ab.byteLength : 0);

      // Fallback: legacy data URL path (no ArrayBuffer)
      if (!ab) {
        if (!att.url || att.url.indexOf('data:') !== 0) return;
        var _b64 = att.url.substring(att.url.indexOf(',') + 1);
        fileSize = Math.round(_b64.length * 3 / 4);
        // Convert data URL to ArrayBuffer for chunking
        try {
          var _m = att.url.match(/^data:[^;]+;base64,(.+)$/);
          if (_m) ab = _base64ToBytes(_m[1]);
        } catch(e) {}
        if (!ab || ab.byteLength === 0) return;
        att._totalSize = fileSize;
        att._arrayBuffer = ab;
      }

      var fileId = att.id;
      var myId = MStore.user ? MStore.user.id : 'mobile';
      var totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
      var _u8 = new Uint8Array(ab);

      // On-the-fly chunk: read a binary chunk from ArrayBuffer, convert to base64
      function _getChunk(index) {
        var start = index * CHUNK_SIZE;
        var end = Math.min(start + CHUNK_SIZE, fileSize);
        var slice = _u8.subarray(start, end);
        var bin = '';
        for (var bi = 0; bi < slice.length; bi++) bin += String.fromCharCode(slice[bi]);
        return btoa(bin);
      }

      // Compute file hash — SHA-256 of the FULL file (lowercase hex). This must
      // match desktop's full-file hash: the receiver's FILE_TRANSFER_END
      // verification compares against this exact value. Do NOT truncate — a
      // prefix hash would break the cross-platform contract for >50MB files.
      function _computeFileHash(callback) {
        try {
          crypto.subtle.digest('SHA-256', _u8.buffer).then(function(hashBuf) {
            var _hashArr = Array.from(new Uint8Array(hashBuf));
            var _hex = _hashArr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
            callback(_hex);
          }).catch(function() { callback(''); });
        } catch(e) { callback(''); }
      }

      _computeFileHash(function(fileHash) {
        if (fileHash) {
          debugLog('P2P', 'Computed file hash for ' + att.name, { fileId: fileId, hash: fileHash, totalChunks: totalChunks, fileSize: fileSize });
        } else {
          debugLog('P2P', 'crypto.subtle unavailable — sending without hash for ' + att.name, { fileId: fileId, totalChunks: totalChunks });
        }
        var ftStartPayload = {
          fileId: fileId, fileName: att.name, fileSize: fileSize,
          totalChunks: totalChunks, hash: fileHash,
          type: att.type || '', mimeType: att.mimeType || ''
        };
        if (isGroup) ftStartPayload.chatId = activeChatId;
        // START goes out DIRECTLY, never through the outbox.
        //
        // It was routed through the outbox once, to let an attachment to a briefly
        // offline peer wait instead of failing. That broke transfers: the outbox
        // enqueues and then flushes ASYNCHRONOUSLY, while the chunk driver below
        // (sendNext) starts synchronously — so chunks reached the receiver before the
        // START that gives them context, and the transfer died. Worse, if a flush was
        // already in flight the START was deferred by the outbox's rerun flag while
        // chunks kept streaming.
        //
        // Ordering here is a hard requirement, not a nicety: the receiver cannot
        // interpret a chunk without its START. Delivery is attempted synchronously so
        // the ordering holds; if the peer is genuinely unreachable the send throws and
        // the caller's normal failure path applies.
        Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
          Orbit.Protocol.Types.FILE_TRANSFER_START, myId, peerId,
          ftStartPayload
        ));

        // CROSS-4: send-session map so an incoming FILE_TRANSFER_RESUME can
        // rewind/advance progress. Keyed fileId + '::' + peerId — a group
        // fan-out sends the SAME attachment.id to several members, and each
        // member needs its own cursor (mirrors the per-peer closure `ci` the
        // pre-resume code used). The dispatcher also falls back to a plain
        // fileId key.
        window.activeSends = window.activeSends || {};
        var sendKey = fileId + '::' + peerId;
        window.activeSends[sendKey] = {
          att: att,
          peerId: peerId,
          isGroup: isGroup,
          total: totalChunks,
          hash: fileHash,
          ci: 0,
          done: false,
          cancelled: false,
          // F5: the START payload as sent, stored so a RESUME rewind can
          // re-send it (a receiver whose in-memory receive was reaped can
          // re-open its persisted transfer from a fresh START)
          startPayload: ftStartPayload
        };

        // Driver loop: reads session.ci fresh each iteration so a mid-stream
        // RESUME (which mutates session.ci) is picked up on the next tick.
        function sendNext() {
          var session = window.activeSends[sendKey];
          if (!session) return;
          if (session.cancelled) {
            if (window.activeSends && window.activeSends[sendKey]) delete window.activeSends[sendKey];
            return;
          }
          if (session.done) return; // F5: grace period — kept 60s for a late RESUME (END re-send)
          if (session.ci >= session.total) {
            var ftEndPayload = { fileId: fileId, hash: fileHash };
            if (isGroup) ftEndPayload.chatId = activeChatId;
            Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_END, myId, peerId,
              ftEndPayload
            ));
            // F5: don't delete right away — the receiver may have missed END
            // and re-request it via RESUME; keep the session for a 60s grace
            // window and let the sweep below reclaim it.
            session.done = true;
            session.doneAt = Date.now();
            session.endPayload = ftEndPayload;
            setTimeout(function() {
              var _sweep = window.activeSends && window.activeSends[sendKey];
              if (_sweep && (_sweep.cancelled || (_sweep.done && _sweep.doneAt && Date.now() - _sweep.doneAt > 60000))) {
                delete window.activeSends[sendKey];
              }
            }, 65000);
            return;
          }
          var idx = session.ci;
          var chunkData = _getChunk(idx);
          Orbit.P2P.send(peerId, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.FILE_CHUNK, myId, peerId,
            { fileId: fileId, chunkIndex: idx, data: chunkData }
          )).then(function() {
            // Advance only when the cursor is untouched since this chunk began
            // (ci === idx). A RESUME may have rewound the cursor to n < idx;
            // advancing would destroy that rewind, so chunks n..idx-1 would
            // never be re-sent and the transfer would stall.
            if (window.activeSends && window.activeSends[sendKey] && window.activeSends[sendKey].ci === idx) {
              window.activeSends[sendKey].ci = idx + 1;
            }
            setTimeout(sendNext, 0);
          }).catch(function(e) {
            console.error('Failed to send chunk ' + idx, e);
            // Retry once on failure before giving up
            setTimeout(sendNext, 1000);
          });
        }
        sendNext();
      });
    }

    if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var isGroup = MStore.groups.some(function(g) { return g.id === activeChatId; });
      var myId = MStore.user ? MStore.user.id : 'mobile';

      if (isGroup) {
        var useE2EE = MStore.settings.e2eeEnabled && window.Orbit.E2EE;
        _broadcastToGroupMembers(activeChatId, text, useE2EE);
        if (largeFiles.length > 0) {
          var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
          if (grp) {
            (grp.members || []).forEach(function(m) {
              var memberId = typeof m === 'string' ? m : m.userId;
              if (memberId === myId) return;
              largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, memberId, true); });
            });
          }
        }
        return;
      }

      if (MStore.settings.e2eeEnabled && window.Orbit.E2EE) {
        var friend = MStore.friends.find(function(f) { return f.id === activeChatId; });
        // E2EE is ON for this chat, so there is no plaintext path from here.
        // Previously a missing key fell through to the plaintext send below,
        // silently breaking the user's E2EE setting.
        if (!friend || !friend.publicKey) {
          showToast('Not sent — no encryption key for this contact yet', 'info');
          return;
        }
        Orbit.E2EE.encrypt(text, friend.publicKey).then(function(encrypted) {
          if (!encrypted) {
            // Previously this failed silently: nothing was sent, but the
            // message was already in the local list, so it looked delivered.
            showToast('Not sent — encryption failed', 'info');
            return;
          }
          // Large files are deliberately NOT referenced in this message any more.
          // They used to ride along as `_pending` attachments so the receiver could
          // merge text+file into one bubble (CRIT-4) — which is what produced a
          // message captioned "Receiving Video...". The text now goes as its own
          // message and the file arrives as its own when the transfer completes,
          // which is both simpler and honest about what has actually arrived.
          // Inline (small) attachments still ride along as before.
          var e2eeAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
          _deliverOrQueue(activeChatId, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.MESSAGE, myId, activeChatId,
            { e2ee: true, ciphertext: encrypted.ciphertext, nonce: encrypted.nonce, msgId: newMsg.id, replyTo: newMsg.replyTo, attachments: e2eeAttachments.length > 0 ? e2eeAttachments : undefined, fromName: newMsg.fromName, poll: newMsg.poll || undefined }
          ), newMsg.id);
          // Attachments ride with a message that actually went out, so they are
          // sent only on the success path.
          if (largeFiles.length > 0) {
            largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, activeChatId, false); });
          }
        });
        return;
      }

      // Large files are deliberately NOT referenced in this message any more.
      // They used to ride along as `_pending` attachments so the receiver could
      // merge text+file into one bubble (CRIT-4) — which is what produced a
      // message captioned "Receiving Video...". The text now goes as its own
      // message and the file arrives as its own when the transfer completes,
      // which is both simpler and honest about what has actually arrived.
      // Inline (small) attachments still ride along as before.
      var msgAttachments = inlineAttachments.length > 0 ? inlineAttachments.slice() : [];
      _deliverOrQueue(activeChatId, Orbit.Protocol.createPacket(
        Orbit.Protocol.Types.MESSAGE, myId, activeChatId,
        { text: text, msgId: newMsg.id, replyTo: newMsg.replyTo, attachments: msgAttachments.length > 0 ? msgAttachments : undefined, fromName: newMsg.fromName, poll: newMsg.poll || undefined }
      ), newMsg.id);
      if (largeFiles.length > 0) {
        largeFiles.forEach(function(att) { _sendLargeFileToPeer(att, activeChatId, false); });
      }
    }
  }

  /* -- Poll Helpers -- */

  function parsePollArgs(str) {
    var args = [];
    var current = '';
    var inQuotes = false;
    for (var i = 6; i < str.length; i++) {
      var c = str[i];
      if (c === '"') {
        inQuotes = !inQuotes;
        if (!inQuotes && current) { args.push(current); current = ''; }
      } else if (c === ' ' && !inQuotes) {
        if (current) { args.push(current); current = ''; }
      } else {
        current += c;
      }
    }
    if (current) args.push(current);
    return args;
  }

  /* ---- Slash Command Handler ---- */
  /**
   * ⚠ `opts.anyChat` exists for the composer's attach sheet, and only for it.
   *
   * Slash commands are group utilities and the guard below is what enforces that.
   * But the POLL BUILDER is not a group-only thing — it is a composer action, and
   * polls render and vote identically in a DM (the create path already falls back
   * to a direct send for non-group chats, see the `/poll` case). The attach sheet
   * reaches the SAME builder through this flag rather than a second copy of it, so
   * there is still exactly one place a poll is composed.
   */
  function _handleSlashCommand(text, newMsg, opts) {
    if (!text || !text.startsWith('/')) return null;

    // Group-only guard: all slash commands are group utilities (no AI, per README/plans).
    // Handles both storage shapes: g.id (created locally) and g.groupId (synced via addGroup).
    var isGroupChat = false;
    try {
      isGroupChat = MStore.groups.some(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
    } catch(e) { isGroupChat = false; }
    if (!isGroupChat && !(opts && opts.anyChat)) {
      // Clear the slash input so it does not look stuck
      var _slashInput = document.getElementById('chat-input');
      if (_slashInput && _slashInput.value.trim().indexOf('/') === 0) {
        _slashInput.value = '';
        _slashInput.style.height = 'auto';
        updateSendButton();
        hideCommandTooltip();
      }
      showToast('Slash commands only work in group chats', 'info');
      // ...and open the reference sheet as well.
      //
      // A toast plus a cleared input reads as "nothing happened": that is exactly
      // how it looked on a fresh emulator, where the only chat is Orbit Echo (a
      // DM) — the command vanished and no sheet appeared, which looks like a bug
      // in the command rather than a restriction. The sheet carries the group-only
      // note, so the user learns what exists and why it is not running here.
      showHelpModal();
      return { cancel: true };
    }

    var parts = text.split(' ');
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1).join(' ');

    switch(cmd) {
      case '/h':
      case '/help':
        showHelpModal();
        return { cancel: true };

      case '/pool':
      case '/poll': {
        var pollArgs = parsePollArgs(text);
        if (pollArgs.length >= 3) {
          newMsg.poll = {
            question: pollArgs[0],
            options: pollArgs.slice(1).map(function(opt) { return { text: opt, votes: [] }; }),
            multiSelect: false,
            expiresAt: null
          };
          newMsg.text = '';
          return { handled: true, msg: newMsg };
        }
        // UX-friendly builder: open modal sheet when args insufficient
        var pollChatId = activeChatId;
        var sheet = (typeof window !== 'undefined' && window.OrbitSheet) ? window.OrbitSheet : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
        if (!sheet || !sheet.showCustom) {
          showToast('Usage: /poll "Question?" "Option1" "Option2" ...', 'info');
          return { cancel: true };
        }
        var _pollEsc = (typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s||''); });
        var pollHtml =
          '<div style="padding:20px;width:100%;box-sizing:border-box;">' +
            '<h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:var(--text-primary);">Create Poll</h3>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">Ask a question and add up to 6 options</div>' +
            '<input id="poll-question" class="bs-input" placeholder="Question?" autocomplete="off" style="width:100%;box-sizing:border-box;">' +
            '<div id="poll-options" style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">' +
              '<div class="poll-opt-row" style="display:flex;gap:8px;align-items:center;">' +
                '<input class="bs-input poll-opt-input" placeholder="Option 1" autocomplete="off" style="flex:1;min-width:0;">' +
                '<button type="button" class="poll-opt-remove" style="width:30px;height:36px;border:none;background:var(--bg-hover);border-radius:8px;color:var(--text-muted);font-size:18px;cursor:pointer;flex-shrink:0;display:none;">&times;</button>' +
              '</div>' +
              '<div class="poll-opt-row" style="display:flex;gap:8px;align-items:center;">' +
                '<input class="bs-input poll-opt-input" placeholder="Option 2" autocomplete="off" style="flex:1;min-width:0;">' +
                '<button type="button" class="poll-opt-remove" style="width:30px;height:36px;border:none;background:var(--bg-hover);border-radius:8px;color:var(--text-muted);font-size:18px;cursor:pointer;flex-shrink:0;display:none;">&times;</button>' +
              '</div>' +
            '</div>' +
            '<button id="poll-add-option" type="button" style="margin-top:10px;width:100%;padding:8px;border:1px dashed var(--border-subtle);border-radius:10px;background:transparent;color:var(--accent-primary);font-size:13px;font-weight:600;cursor:pointer;">+ Add option</button>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center;">Tip: you can also type <span style="font-family:monospace;">/poll "Q?" "O1" "O2"</span> for instant poll</div>' +
            '<div style="margin-top:16px;">' +
              '<button id="poll-create" type="button" style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent-primary);color:#fff;font-size:14px;font-weight:700;cursor:pointer;">Create Poll</button>' +
            '</div>' +
          '</div>';
        sheet.showCustom(pollHtml);
        // Clear slash input so it does not linger behind sheet
        var _pollInputEl = document.getElementById('chat-input');
        if (_pollInputEl) { _pollInputEl.value = ''; _pollInputEl.style.height='auto'; try{updateSendButton();}catch(e){} try{hideCommandTooltip();}catch(e){} }
        setTimeout(function() {
          var qInput = document.getElementById('poll-question');
          if (qInput) qInput.focus();
          var addBtn = document.getElementById('poll-add-option');
          var optsContainer = document.getElementById('poll-options');
          var createBtn = document.getElementById('poll-create');
          function refreshPollRows() {
            var rows = optsContainer ? optsContainer.querySelectorAll('.poll-opt-row') : [];
            var canRemove = rows.length > 2;
            for (var ri = 0; ri < rows.length; ri++) {
              var rm = rows[ri].querySelector('.poll-opt-remove');
              if (rm) rm.style.display = canRemove ? 'inline-flex' : 'none';
            }
            if (addBtn) addBtn.style.display = rows.length >= 6 ? 'none' : 'block';
            // refresh placeholders
            for (var pi = 0; pi < rows.length; pi++) {
              var inp = rows[pi].querySelector('.poll-opt-input');
              if (inp) inp.placeholder = 'Option ' + (pi + 1);
            }
          }
          function addPollOptionRow(value) {
            if (!optsContainer) return;
            var rows = optsContainer.querySelectorAll('.poll-opt-row');
            if (rows.length >= 6) { showToast('Max 6 options', 'info'); return; }
            var row = document.createElement('div');
            row.className = 'poll-opt-row';
            row.style.cssText = 'display:flex;gap:8px;align-items:center;';
            var inp = document.createElement('input');
            inp.className = 'bs-input poll-opt-input';
            inp.placeholder = 'Option ' + (rows.length + 1);
            inp.autocomplete = 'off';
            inp.style.cssText = 'flex:1;min-width:0;';
            if (value) inp.value = value;
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'poll-opt-remove';
            rm.textContent = '×';
            rm.style.cssText = 'width:30px;height:36px;border:none;background:var(--bg-hover);border-radius:8px;color:var(--text-muted);font-size:18px;cursor:pointer;flex-shrink:0;';
            rm.addEventListener('click', function() {
              row.remove();
              refreshPollRows();
            });
            row.appendChild(inp);
            row.appendChild(rm);
            optsContainer.appendChild(row);
            refreshPollRows();
            inp.focus();
          }
          // wire existing remove buttons
          if (optsContainer) {
            var existingRemoves = optsContainer.querySelectorAll('.poll-opt-remove');
            for (var ei = 0; ei < existingRemoves.length; ei++) {
              (function(btn){ btn.addEventListener('click', function(){ var r = btn.closest('.poll-opt-row'); if(r) r.remove(); refreshPollRows(); }); })(existingRemoves[ei]);
            }
          }
          refreshPollRows();
          if (addBtn) addBtn.addEventListener('click', function(){ addPollOptionRow(''); });
          if (createBtn) createBtn.addEventListener('click', function(){
            var qEl = document.getElementById('poll-question');
            var question = qEl ? qEl.value.trim() : '';
            if (!question) { showToast('Enter a question', 'info'); if(qEl) qEl.focus(); return; }
            var optInputs = optsContainer ? optsContainer.querySelectorAll('.poll-opt-input') : [];
            var opts = [];
            for (var oi = 0; oi < optInputs.length; oi++) {
              var v = optInputs[oi].value.trim();
              if (v) opts.push(v);
            }
            if (opts.length < 2) { showToast('Add at least 2 options', 'info'); return; }
            if (opts.length > 6) opts = opts.slice(0,6);
            var poll = { question: question, options: opts.map(function(t){ return { text: t, votes: [] }; }), multiSelect: false, expiresAt: null };
            var pollMsgId = 'm' + Date.now() + Math.random().toString(36).slice(2,6);
            var pollMsg = { id: pollMsgId, from: 'me', text: '', time: new Date().toISOString(), poll: poll };
            if (MStore.user) pollMsg.fromName = MStore.user.name;
            // Persist locally
            MStore.addMessage(pollChatId, pollMsg);
            try { _startDisappearTimer(pollChatId, pollMsg.id); } catch(e) {}
            // Render if still on same chat, otherwise still update list
            if (pollChatId) {
              try { if (activeChatId === pollChatId) renderMessages(pollChatId); } catch(e) {}
              try { renderChatList(); } catch(e) {}
            }
            // P2P broadcast to group members (mirrors sendMessage group path, includes poll)
            try {
              if (window.Orbit && window.Orbit.P2P && window.Orbit.P2P.isAvailable()) {
                var myId = MStore.user ? MStore.user.id : 'mobile';
                var grp = MStore.groups.find(function(g){ return g.id === pollChatId || g.groupId === pollChatId; });
                if (grp) {
                  var useE2EE = MStore.settings && MStore.settings.e2eeEnabled && window.Orbit.E2EE;
                  (grp.members || []).forEach(function(m){
                    var memberId = typeof m === 'string' ? m : m.userId;
                    if (!memberId || memberId === myId) return;
                    var memberFriend = MStore.friends.find(function(f){ return f.id === memberId; });
                    var memberKey = memberFriend ? memberFriend.publicKey : (typeof m !== 'string' ? m.publicKey : null);
                    var payload = { text: '', groupId: pollChatId, msgId: pollMsg.id, fromName: pollMsg.fromName, poll: poll };
                    if (useE2EE && memberKey) {
                      try {
                        window.Orbit.E2EE.encrypt('', memberKey).then(function(enc){
                          if (enc) { payload.e2ee = true; payload.ciphertext = enc.ciphertext; payload.nonce = enc.nonce; try{ window.Orbit.P2P.send(memberId, window.Orbit.Protocol.createPacket(window.Orbit.Protocol.Types.MESSAGE, myId, memberId, payload)); }catch(e){} }
                        });
                      } catch(e) { try{ window.Orbit.P2P.send(memberId, window.Orbit.Protocol.createPacket(window.Orbit.Protocol.Types.MESSAGE, myId, memberId, payload)); }catch(e2){} }
                    } else {
                      try{ window.Orbit.P2P.send(memberId, window.Orbit.Protocol.createPacket(window.Orbit.Protocol.Types.MESSAGE, myId, memberId, payload)); }catch(e){}
                    }
                  });
                } else {
                  // Not a group? No broadcast (guarded already, but fallback to DM-style if needed)
                  var myId2 = MStore.user ? MStore.user.id : 'mobile';
                  var payload2 = { text: '', msgId: pollMsg.id, fromName: pollMsg.fromName, poll: poll };
                  try{ window.Orbit.P2P.send(pollChatId, window.Orbit.Protocol.createPacket(window.Orbit.Protocol.Types.MESSAGE, myId2, pollChatId, payload2)); }catch(e){}
                }
              }
            } catch(e) {}
            sheet.hide();
            showToast('Poll created', 'info');
          });
        }, 80);
        return { cancel: true };
      }

      case '/me':
        newMsg.text = '*_' + args.trim() + '_*';
        return { handled: true, msg: newMsg };

      case '/shrug':
        newMsg.text = '¯\\\\_(ツ)_/¯';
        return { handled: true, msg: newMsg };

      case '/tableflip':
        newMsg.text = '(╯°□°）╯︵ ┻━┻';
        return { handled: true, msg: newMsg };

      case '/unflip':
        newMsg.text = '┬─┬ ノ( ゜-゜ノ)';
        return { handled: true, msg: newMsg };

      case '/lenny':
        newMsg.text = '( ͡° ͜ʖ ͡°)';
        return { handled: true, msg: newMsg };

      case '/roll':
        var max = parseInt(args, 10) || 6;
        if (max < 1) max = 6;
        if (max > 1000) max = 1000;
        var result = Math.floor(Math.random() * max) + 1;
        newMsg.text = '🎲 Rolled ' + result + ' (1-' + max + ')';
        return { handled: true, msg: newMsg };

      case '/flip':
        var outcomes = ['Heads', 'Tails'];
        newMsg.text = '🪙 ' + outcomes[Math.floor(Math.random() * 2)];
        return { handled: true, msg: newMsg };

      case '/spoiler':
        var spoilerText = args.trim();
        if (!spoilerText) {
          showToast('Usage: /spoiler hidden text', 'info');
          return { cancel: true };
        }
        newMsg.text = spoilerText;
        newMsg.isSpoiler = true;
        return { handled: true, msg: newMsg };

      case '/clear':
        if (activeChatId && MStore.messages[activeChatId]) {
          if (confirm('Clear all messages in this chat? This cannot be undone.')) {
            MStore.messages[activeChatId] = [];
            OrbitKeys.remove('msg_' + activeChatId);
            MStore.save();
            renderMessages(activeChatId);
            renderChatList();
            showToast('Chat cleared', 'info');
          }
        }
        return { cancel: true };

      case '/invite': {
        var group = MStore.groups.find(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
        if (!group) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        var code = group.inviteCode || '—';
        if (!code || code === '—') {
          try {
            var _icb = new Uint8Array(4);
            window.crypto.getRandomValues(_icb);
            code = Array.from(_icb).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
            group.inviteCode = code;
            try { MStore.save(); } catch(e) {}
          } catch(e) { code = '—'; }
        }
        if (!code || code === '—') { showToast('No invite code available','error'); return { cancel: true }; }
        var escCode = (typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s); })(code);
        var grpName = (typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s); })(group.name || group.groupName || 'Group');
        var inviteHtml = '<div style="padding:20px;width:100%;box-sizing:border-box;">' +
          '<h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:var(--text-primary);">Invite — ' + grpName + '</h3>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px;">Share this code with others to let them join</div>' +
          '<div style="display:flex;align-items:center;gap:10px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:12px 14px;">' +
            '<code id="invite-code-val" style="flex:1;font-size:15px;font-weight:700;letter-spacing:0.08em;color:var(--accent-primary);word-break:break-all;">' + escCode + '</code>' +
            '<button id="btn-copy-invite" style="flex-shrink:0;padding:8px 14px;border-radius:8px;border:none;background:var(--accent-primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Copy</button>' +
            '<button id="btn-share-invite" style="flex-shrink:0;padding:8px 14px;border-radius:8px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer;">Share</button>' +
          '</div>' +
          '<div style="margin-top:12px;font-size:11px;color:var(--text-muted);text-align:center;font-family:monospace;">/invite · /members /topic /leave /shout /countdown also available</div>' +
        '</div>';
        var sheet = (typeof window !== 'undefined' && window.OrbitSheet) ? window.OrbitSheet : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
        if (sheet && sheet.showCustom) sheet.showCustom(inviteHtml);
        else showToast('Invite code: ' + code, 'info');
        setTimeout(function() {
          var btn = document.getElementById('btn-copy-invite');
          if (btn) btn.addEventListener('click', function() {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(code).then(function() { showToast('Invite code copied', 'info'); }).catch(function() { showToast('Copy failed', 'error'); });
              } else {
                var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('Invite code copied', 'info');
              }
            } catch(e) { showToast('Copy failed', 'error'); }
          });
          var shareBtn = document.getElementById('btn-share-invite');
          if (shareBtn) shareBtn.addEventListener('click', function() {
            if (!code || code === '—') { showToast('No invite code available','error'); return; }
            var rawName = group.name || group.groupName || 'Group';
            var inviteText = 'Join "' + rawName + '" on Orbit! Code: ' + code;
            try {
              if (navigator.share) {
                var canShareOk = true;
                try { if (navigator.canShare && !navigator.canShare({ text: inviteText })) canShareOk = false; } catch(e) { canShareOk = true; }
                if (canShareOk) {
                  navigator.share({ title: 'Orbit invite', text: inviteText }).then(function(){ showToast('Shared!','info'); }).catch(function(err){
                    if (err && err.name === 'AbortError') return;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(inviteText).then(function(){ showToast('Invite text copied','info'); }).catch(function(){ showToast('Copy failed','error'); });
                    } else {
                      var ta2 = document.createElement('textarea'); ta2.value = inviteText; document.body.appendChild(ta2); ta2.select(); document.execCommand('copy'); ta2.remove(); showToast('Invite text copied','info');
                    }
                  });
                  return;
                }
              }
            } catch(e) {}
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(inviteText).then(function(){ showToast('Invite text copied','info'); }).catch(function(){ showToast('Copy failed','error'); });
              } else {
                var ta = document.createElement('textarea'); ta.value = inviteText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('Invite text copied','info');
              }
            } catch(e) { showToast('Copy failed','error'); }
          });
        }, 80);
        var _invInput = document.getElementById('chat-input');
        if (_invInput) { _invInput.value = ''; _invInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      case '/members':
      case '/list': {
        var group2 = MStore.groups.find(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
        if (!group2) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        var members = group2.members || [];
        var esc2 = (typeof escapeHtml === 'function' ? escapeHtml : function(s){ return String(s); });
        var escAttr2 = (typeof escapeAttr === 'function' ? escapeAttr : esc2);
        var grpName2 = esc2(group2.name || group2.groupName || 'Group');
        var listHtml = '<div style="padding:20px;width:100%;box-sizing:border-box;">' +
          '<h3 style="margin:0 0 4px;font-size:17px;font-weight:700;color:var(--text-primary);">' + grpName2 + '</h3>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px;">' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</div>';
        if (members.length === 0) {
          listHtml += '<div style="font-size:13px;color:var(--text-muted);text-align:center;padding:12px;">No members</div>';
        } else {
          listHtml += '<div style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;-webkit-overflow-scrolling:touch;">';
          for (var mi = 0; mi < members.length; mi++) {
            var m = members[mi];
            var uid = typeof m === 'string' ? m : (m.userId || m.id || '');
            var mName = typeof m === 'string' ? m : (m.name || m.username || uid);
            var role = typeof m === 'string' ? 'member' : (m.role || 'member');
            var friend = MStore.friends.find(function(f) { return f.id === uid || f.peerId === uid; });
            var displayName = friend ? friend.name : mName;
            var isOnline = friend && (friend.status === 'online' || friend.online);
            if (!isOnline && friend && friend.lastSeen) { try { isOnline = (Date.now() - friend.lastSeen) < 45000; } catch(e) {} }
            var initial = (displayName || '?').charAt(0).toUpperCase();
            var roleBadge = role === 'owner' ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);padding:2px 6px;border-radius:999px;letter-spacing:0.04em;">OWNER</span>' : (role === 'admin' ? '<span style="font-size:10px;font-weight:700;color:#fff;background:#f59e0b;padding:2px 6px;border-radius:999px;letter-spacing:0.04em;">ADMIN</span>' : '');
            listHtml += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:10px;">' +
              '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0;position:relative;">' + esc2(initial) +
                '<span style="position:absolute;bottom:-1px;right:-1px;width:10px;height:10px;border-radius:50%;border:2px solid var(--bg-surface);background:' + (isOnline ? 'var(--accent-success)' : 'var(--text-muted)') + ';display:inline-block;"></span>' +
              '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc2(displayName) + ' ' + roleBadge + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted);font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc2(uid) + '</div>' +
              '</div>' +
              '<span style="width:8px;height:8px;border-radius:50%;background:' + (isOnline ? '#22c55e' : '#94a3b8') + ';flex-shrink:0;display:inline-block;" title="' + (isOnline ? 'online' : 'offline') + '"></span>' +
            '</div>';
          }
          listHtml += '</div>';
        }
        listHtml += '</div>';
        var sheet2 = (typeof window !== 'undefined' && window.OrbitSheet) ? window.OrbitSheet : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
        if (sheet2 && sheet2.showCustom) sheet2.showCustom(listHtml);
        else showToast(members.length + ' member(s)', 'info');
        var _memInput = document.getElementById('chat-input');
        if (_memInput) { _memInput.value = ''; _memInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      case '/topic': {
        var topicArgs = text.slice(6).trim();
        if (!topicArgs) { showToast('Usage: /topic New description', 'info'); return { cancel: true }; }
        var grp3 = MStore.groups.find(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
        if (!grp3) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        var myId = MStore.user ? MStore.user.id : '';
        var selfMember = (grp3.members || []).find(function(mm) { var u = typeof mm === 'string' ? mm : mm.userId; return u === myId; });
        var selfRole = selfMember ? (selfMember.role || 'member') : (grp3.ownerId === myId ? 'owner' : 'member');
        if (selfRole !== 'owner' && selfRole !== 'admin') { showToast('Only owner/admin can set topic', 'info'); return { cancel: true }; }
        grp3.description = topicArgs;
        // Persist to MStore — handle both g.id and g.groupId shapes
        try { MStore.save(); } catch(e) {}
        // Broadcast to members if protocol available (best-effort)
        try {
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var pktType = (Orbit.Protocol && Orbit.Protocol.Types) ? (Orbit.Protocol.Types.GROUP_UPDATE || Orbit.Protocol.Types.GROUP_CREATE || null) : null;
            if (pktType) {
              (grp3.members || []).forEach(function(mm) {
                var mid = typeof mm === 'string' ? mm : mm.userId;
                if (!mid || mid === myId) return;
                var pkt = Orbit.Protocol.createPacket(pktType, myId, mid, { groupId: grp3.id || grp3.groupId, description: topicArgs });
                Orbit.P2P.send(mid, pkt);
              });
            }
          }
        } catch(e) {}
        showToast('Topic updated', 'info');
        if (typeof renderChatList === 'function') try { renderChatList(); } catch(e) {}
        var _topInput = document.getElementById('chat-input');
        if (_topInput) { _topInput.value = ''; _topInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      case '/leave': {
        var grp4 = MStore.groups.find(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
        if (!grp4) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        if (!confirm('Leave group "' + (grp4.name || grp4.groupName || activeChatId) + '"?')) return { cancel: true };
        var gid = grp4.id || grp4.groupId;
        var myId2 = MStore.user ? MStore.user.id : '';
        try {
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable() && Orbit.Protocol && Orbit.Protocol.Types.GROUP_LEAVE) {
            (grp4.members || []).forEach(function(mm) {
              var mid = typeof mm === 'string' ? mm : mm.userId;
              if (!mid || mid === myId2) return;
              var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, myId2, mid, { groupId: gid, userId: myId2 });
              Orbit.P2P.send(mid, pkt);
            });
          }
        } catch(e) {}
        // Prefer existing helper if present (handles messages/chats cleanup + UI)
        if (typeof leaveGroupById === 'function') { try { leaveGroupById(gid); } catch(e) { /* fallback below */ } }
        else {
          MStore.groups = MStore.groups.filter(function(g) { return (g.id || g.groupId) !== gid; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== gid; });
          delete MStore.messages[gid];
          try { OrbitKeys.remove('msg_' + gid); } catch(e) {}
          MStore.save();
          if (typeof renderChatList === 'function') try { renderChatList(); } catch(e) {}
          showToast('Left group', 'info');
          if (activeChatId === gid && typeof closeChat === 'function') try { closeChat(); } catch(e) {}
        }
        var _lvInput = document.getElementById('chat-input');
        if (_lvInput) { _lvInput.value = ''; _lvInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      case '/shout': {
        var shoutArgs = args.trim();
        if (!shoutArgs) { showToast('Usage: /shout <message>', 'info'); return { cancel: true }; }
        newMsg.text = '🔊 ' + shoutArgs.toUpperCase() + ' 🔊';
        return { handled: true, msg: newMsg };
      }

      case '/countdown': {
        var cParts = text.split(' ');
        var seconds = parseInt(cParts[1], 10);
        if (isNaN(seconds)) seconds = 5;
        if (seconds < 1) seconds = 1;
        if (seconds > 10) seconds = 10;
        var message = cParts.slice(2).join(' ').trim() || 'Go!';
        // Schedule toast ticks for live feedback (non-blocking)
        for (var ci = seconds; ci >= 1; ci--) {
          (function(tick) {
            setTimeout(function() { showToast('⏳ ' + tick + '...', 'info'); }, (seconds - tick) * 1000);
          })(ci);
        }
        newMsg.text = '⏳ Countdown ' + seconds + 's: ' + message;
        // Replace text after countdown elapsed with final shout (best-effort local update)
        // The sent message stays as the countdown line; ticks are toasts only — keeps protocol simple.
        return { handled: true, msg: newMsg };
      }

      case '/nick': {
        var nickArgs = text.slice(5).trim();
        if (!nickArgs) { showToast('Usage: /nick <new name>', 'info'); return { cancel: true }; }
        var group = MStore.groups.find(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
        if (!group) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        var myId = MStore.user ? MStore.user.id : '';
        var selfMember = (group.members || []).find(function(mm) { var u = typeof mm === 'string' ? mm : (mm.userId || mm.id); return u === myId; });
        if (!selfMember) { showToast('Could not find your member entry', 'info'); return { cancel: true }; }
        if (typeof selfMember === 'string') {
          // legacy string member — replace entry
          for (var ni = 0; ni < group.members.length; ni++) {
            if (group.members[ni] === selfMember) {
              group.members[ni] = { userId: myId, role: 'member', joinedAt: new Date().toISOString(), name: nickArgs };
              break;
            }
          }
        } else {
          selfMember.name = nickArgs;
          if (selfMember.username !== undefined) selfMember.username = nickArgs;
        }
        if (MStore.user) MStore.user.name = nickArgs;
        try { MStore.save(); } catch(e) {}
        try {
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var pktType = (Orbit.Protocol && Orbit.Protocol.Types) ? (Orbit.Protocol.Types.GROUP_UPDATE || Orbit.Protocol.Types.GROUP_CREATE || null) : null;
            if (pktType) {
              (group.members || []).forEach(function(mm) {
                var mid = typeof mm === 'string' ? mm : mm.userId;
                if (!mid || mid === myId) return;
                var pkt = Orbit.Protocol.createPacket(pktType, myId, mid, { groupId: group.id || group.groupId, members: group.members, updatedMember: { userId: myId, name: nickArgs } });
                Orbit.P2P.send(mid, pkt);
              });
            }
          }
        } catch(e) {}
        showToast('Nickname updated to "' + nickArgs + '"', 'info');
        if (typeof renderChatList === 'function') try { renderChatList(); } catch(e) {}
        var _nickInput = document.getElementById('chat-input');
        if (_nickInput) { _nickInput.value = ''; _nickInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      case '/kick':
      case '/remove': {
        var kickRaw = args.trim();
        if (kickRaw.charAt(0) === '@') kickRaw = kickRaw.slice(1).trim();
        if (!kickRaw) { showToast('Usage: /kick <username>', 'info'); return { cancel: true }; }
        var g = MStore.groups.find(function(x) { return x.id === activeChatId || x.groupId === activeChatId; });
        if (!g) { showToast('Not in a group chat', 'info'); return { cancel: true }; }
        var meId = MStore.user ? MStore.user.id : '';
        var meEntry = (g.members || []).find(function(m) { var u = typeof m === 'string' ? m : (m.userId || m.id); return u === meId; });
        var meRole = meEntry ? (meEntry.role || 'member') : (g.ownerId === meId ? 'owner' : 'member');
        if (meRole !== 'owner' && meRole !== 'admin') { showToast('Only owner/admin can kick members', 'info'); return { cancel: true }; }
        var targetIdx = -1;
        var targetMember = null;
        for (var ti = 0; ti < (g.members || []).length; ti++) {
          var mm = g.members[ti];
          var mName = typeof mm === 'string' ? mm : (mm.name || mm.username || '');
          var mId = typeof mm === 'string' ? mm : (mm.userId || mm.id || '');
          if (mName.toLowerCase() === kickRaw.toLowerCase() || mId.toLowerCase() === kickRaw.toLowerCase()) {
            targetIdx = ti; targetMember = mm; break;
          }
        }
        if (targetIdx === -1) { showToast('User "' + kickRaw + '" not found in group', 'info'); return { cancel: true }; }
        var targetUid = typeof targetMember === 'string' ? targetMember : (targetMember.userId || targetMember.id || '');
        if (targetUid === meId) { showToast('You cannot kick yourself', 'info'); return { cancel: true }; }
        var displayKickName = typeof targetMember === 'string' ? targetMember : (targetMember.name || targetMember.username || targetUid);
        if (!confirm('Remove "' + displayKickName + '" from group?')) return { cancel: true };
        g.members.splice(targetIdx, 1);
        try { MStore.save(); } catch(e) {}
        try {
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable() && Orbit.Protocol && Orbit.Protocol.Types) {
            var pktType2 = Orbit.Protocol.Types.GROUP_MEMBER_REMOVE || Orbit.Protocol.Types.GROUP_LEAVE || null;
            if (pktType2) {
              var payload = { groupId: g.id || g.groupId, userId: targetUid, removedUserId: targetUid };
              try { var pktToTarget = Orbit.Protocol.createPacket(pktType2, meId, targetUid, payload); Orbit.P2P.send(targetUid, pktToTarget); } catch(e) {}
              (g.members || []).forEach(function(rm) {
                var rid = typeof rm === 'string' ? rm : rm.userId;
                if (!rid || rid === meId || rid === targetUid) return;
                try { var p = Orbit.Protocol.createPacket(pktType2, meId, rid, payload); Orbit.P2P.send(rid, p); } catch(e2) {}
              });
            }
          }
        } catch(e) {}
        if (typeof renderChatList === 'function') try { renderChatList(); } catch(e) {}
        showToast('"' + displayKickName + '" removed from group', 'info');
        var _kickInput = document.getElementById('chat-input');
        if (_kickInput) { _kickInput.value = ''; _kickInput.style.height = 'auto'; updateSendButton(); hideCommandTooltip(); }
        return { cancel: true };
      }

      default:
        showToast('Unknown command. Type /help to see all commands.', 'info');
        return { cancel: true };
    }
  }

  function showHelpModal() {
    var sheet = (typeof window !== 'undefined' && window.OrbitSheet) ? window.OrbitSheet : (typeof OrbitSheet !== 'undefined' ? OrbitSheet : null);
    if (!sheet || typeof sheet.showCustom !== 'function') {
      // The sheet is loaded before app.js, so this should be unreachable — if it fires,
      // something is wrong with the load order and the message should say so.
      if (window.console && console.error) console.error('[help] OrbitSheet missing', typeof sheet);
      showToast('Help unavailable — sheet not loaded', 'error');
      return;
    }
    var esc = (typeof escapeHtml === 'function') ? escapeHtml : (window.Sanitize ? window.Sanitize.escapeHtml : function(s){ return String(s||''); });
    var html = '<div style="padding:20px;width:100%;box-sizing:border-box;">';
    html += '<h3 style="margin:0 0 16px;font-size:17px;font-weight:700;color:var(--text-primary);">Slash Commands</h3>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Group-only utilities — only work inside group chats</div>';
    for (var i = 0; i < COMMANDS.length; i++) {
      var c = COMMANDS[i];
      // The usage line only earns a row when it shows something the name does
      // not: 10 of the 19 commands are invoked bare (/help, /shrug, /flip …), so
      // those rows were spending a third of their height repeating themselves.
      // With 19 commands that is the difference between seeing three of them and
      // seeing most of the list without scrolling.
      var showUsage = String(c.usage || '').trim() !== String(c.name || '').trim();
      html += '<div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">';
      html += '  <div style="flex:1;min-width:0;">';
      html += '    <div style="font-size:14px;font-weight:600;color:var(--accent-primary);font-family:monospace;">' + esc(c.name) + '</div>';
      html += '    <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + esc(c.desc) + '</div>';
      if (showUsage) {
        html += '    <div style="font-size:11px;color:var(--text-muted);margin-top:1px;font-family:monospace;">' + esc(c.usage) + '</div>';
      }
      html += '  </div>';
      html += '</div>';
    }
    html += '</div>';

    // Open it, and only clear the input if it actually opened.
    //
    // Dan's report: in a GROUP, typing /help showed the tooltip, pressing send closed
    // the keyboard, deleted the text, and then NOTHING appeared — while every other
    // command worked. That is the shape of a throw between dismissing the keyboard and
    // activating the overlay: the sheet never becomes visible, the input is cleared
    // anyway, and the user is left with neither their text nor the help.
    //
    // So: catch it, say so, and keep the text. A silent failure that eats what you
    // typed is the worst possible outcome, and "nothing showed" gave us nothing to
    // work with. Whatever is throwing on a real device will now name itself.
    var opened = false;
    try {
      sheet.showCustom(html, { tall: true });
      var _ov = document.getElementById('bottom-sheet-overlay');
      opened = !!(_ov && _ov.classList.contains('active'));
      // ...and confirm it is actually on screen a beat later. The class alone was not
      // enough: the bug this was written for left the overlay active with the sheet parked
      // off the bottom of the screen, so "active" read true, the input was cleared and
      // nothing was visible. But checking the rect HERE is too early — the sheet settles
      // over 0/180/450/900/1500ms and is mid-animation now — so the immediate decision uses
      // the class and this reports a sheet that never arrived.
      setTimeout(function () {
        var _sh = document.getElementById('bottom-sheet');
        var _r = _sh ? _sh.getBoundingClientRect() : null;
        var _onScreen = !!(_r && _r.height > 50 && _r.bottom > 0 && _r.top < window.innerHeight);
        var _stillActive = _ov && _ov.classList.contains('active');
        if (_stillActive && !_onScreen) {
          if (window.console && console.error) console.error('[help] sheet opened but is not on screen', _r && _r.top, _r && _r.height);
          showToast('The command list did not appear on screen', 'error');
        }
      }, 700);
    } catch (e) {
      if (window.console && console.error) console.error('[help] sheet failed', e);
      showToast('Could not open the command list: ' + ((e && e.message) || e), 'error');
    }
    if (!opened) {
      // Not open, for whatever reason. Leave the input alone so the text is not lost,
      // and say something rather than nothing.
      if (!window.OrbitSheet || typeof window.OrbitSheet.showCustom !== 'function') {
        showToast('Help unavailable — sheet not loaded', 'error');
      } else {
        showToast('Could not open the command list', 'error');
      }
      return;
    }

    // Clear the /help input now that the list is on screen, so it does not linger
    var _helpInput = document.getElementById('chat-input');
    if (_helpInput) {
      _helpInput.value = '';
      _helpInput.style.height = 'auto';
      updateSendButton();
      hideCommandTooltip();
    }
  }

  /* ---- Transfer progress strip ----
     Same shape as the desktop's transfer-progress-inline: a card row per transfer with
     an icon, the name and percentage on one line, and a bar underneath — so the two
     platforms read the same. Desktop labels are mirrored too ("Receiving Video...").

     Inline SVG rather than a lucide pass: this markup is rewritten on a 600ms poller,
     and the app already prefers inline SVG for exactly this reason (see the sheet's
     close button) — no icon pass, so nothing can be lost to icon timing.

     A poller rather than a hook in every chunk: the chunk paths are the most delicate
     code in the app (resume rewinds, checkpoints, reap sweeps) and a UI concern has no
     business being threaded through them. It costs nothing when no transfer is running. */
  var _TP_ICONS = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transfer-icon-svg"><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="transfer-icon-svg"><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>'
  };

  /* ---- Pinned messages ----
     One accessor for both chat types.

     MStore.pinnedMessages is a per-chat map and MStore.save() already persists it — it was
     simply never written to. Groups kept their pins inside the group object instead, which
     meant a DM could not have any: the toggle looked for a group and gave up. Both live in
     the store map now, keyed by chat id, exactly like the desktop, with the old
     group.pinnedMessages read as a fallback so existing pins are not lost.

     Pruned on read: a pin whose message is gone is dropped, so a deleted message leaves the
     list rather than scrolling to nothing. */
  function _pinnedFor(chatId) {
    if (!chatId) return [];
    var P = window.OrbitPinned;
    var stored = (MStore.pinnedMessages && MStore.pinnedMessages[chatId]) || null;
    if (!stored) {
      // the pre-store location, for groups pinned before this change
      var g = (MStore.groups || []).find(function (x) { return x.id === chatId || x.groupId === chatId; });
      stored = (g && g.pinnedMessages) || [];
    }
    if (!P) return stored || [];
    var msgs = MStore.getMessages(chatId) || [];
    var live = {};
    msgs.forEach(function (m) { live[String(m.id)] = true; });
    return P.prune(stored, function (id) { return !!live[String(id)]; });
  }

  // Write them back, and keep the group object in step so anything still reading it agrees.
  function _setPinned(chatId, list) {
    if (!chatId) return;
    if (!MStore.pinnedMessages) MStore.pinnedMessages = {};
    MStore.pinnedMessages[chatId] = list || [];
    var g = (MStore.groups || []).find(function (x) { return x.id === chatId || x.groupId === chatId; });
    if (g) g.pinnedMessages = MStore.pinnedMessages[chatId];
    MStore.save();
  }

  function _isGroupChat(chatId) {
    return (MStore.groups || []).some(function (g) { return g.id === chatId || g.groupId === chatId; });
  }

  /* ---- Jump to latest ----
     Dan: a chip when you are scrolled up, and something more explicit when what you are
     looking at is genuinely old — a week, a month — because "you are 400 messages behind" is
     not the same problem as "you are reading last month and the conversation has moved on".

     The chip floats over the foot of the messages rather than sitting above the composer:
     the composer grows with a multi-line message, and the pinned bar and the transfer strip
     already live in that column. `bottom` is measured from the composer for the same reason.
     */
  var _jumpChipBound = false;
  var _jumpChipRaf = 0;

  /* Message timestamps are not reliably Dates or ISO strings.
     On the desktop they come back from storage as a STRING holding an epoch with a trailing
     ".0" — "1785589248803.0" — and `new Date("1785589248803.0")` is an Invalid Date, so any
     age computed from it silently becomes NaN. Parse the number first, then fall back. */
  function _msgTime(t) {
    if (t == null) return NaN;
    if (typeof t === 'number') return t;
    var n = parseFloat(t);
    if (!isNaN(n) && n > 1e11) return n;
    return new Date(t).getTime();
  }

  function _updateJumpChip() {
    var chip = document.getElementById('jump-latest-chip');
    var feed = document.getElementById('message-feed');
    if (!chip || !feed) return;

    var area = document.getElementById('chat-input-area');
    var bottomPad = (area ? area.getBoundingClientRect().height : 64) + 12;

    var behind = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
    // A larger threshold than it had. At 60px the chip appeared the instant a scroll began,
    // which is why it read as "you have scrolled" rather than "there is something below".
    if (behind < 140) {
      _hideJumpChip();
      return;
    }

    // How old is what you are READING — the middle of the visible area, not the top row.
    //
    // This was the actual complaint: it measured the row at the very top of the viewport,
    // which is the message you scrolled PAST. In a chat whose last message is a month old,
    // nudging the feed up put an old row at the top and the chip announced "reading old
    // messages" while the user was looking at yesterday. The middle of the view is what is
    // on screen; the top edge is what is leaving it.
    var ageDays = null;
    var fr = feed.getBoundingClientRect();
    var probe = fr.top + (fr.height / 2);
    var rows = feed.querySelectorAll('.message-row[data-msg-id]');
    var msgs = (typeof MStore !== 'undefined' && MStore.getMessages) ? (MStore.getMessages(activeChatId) || []) : [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (r.bottom >= probe) {
        var id = rows[i].getAttribute('data-msg-id');
        for (var j = 0; j < msgs.length; j++) {
          if (String(msgs[j].id) === String(id)) {
            // A desktop peer's timestamp arrives as an epoch string; _msgTime handles both.
            var _t = _msgTime(msgs[j].timestamp != null ? msgs[j].timestamp : msgs[j].time);
            if (!isNaN(_t)) ageDays = (Date.now() - _t) / 86400000;
            break;
          }
        }
        break;
      }
    }

    chip.style.bottom = bottomPad + 'px';
    _showJumpChip();
    var title = chip.querySelector('.jump-latest-title');
    var sub = chip.querySelector('.jump-latest-sub');
    // A week is the line. Yesterday is current, and so is last Tuesday — the panel is for
    // conversations that have genuinely moved on, which is Dan's rule and the right one.
    if (ageDays !== null && ageDays >= 7) {
      chip.classList.add('old');
      if (title) title.textContent = ageDays >= 60 ? 'You\u2019re viewing messages from months ago' : 'You\u2019re viewing older messages';
      // No sub line any more: the button beside it says what to do, and two instructions in
      // one small chip is one too many.
      if (sub) { sub.textContent = ''; sub.style.display = 'none'; }
    } else {
      chip.classList.remove('old');
      if (title) title.textContent = 'Jump to latest';
      if (sub) { sub.textContent = ''; sub.style.display = 'none'; }
    }
  }

  /* Show and hide with the transition, rather than flipping `display`.
     A display change has no from-state to animate out of, so the chip needs a frame at
     display:flex before the class that drives the transition is added — otherwise it
     appears instantly, which is what Dan saw. */
  var _jumpChipHideTimer = null;
  function _showJumpChip() {
    var chip = document.getElementById('jump-latest-chip');
    if (!chip) return;
    if (_jumpChipHideTimer) { clearTimeout(_jumpChipHideTimer); _jumpChipHideTimer = null; }
    if (chip.style.display === 'none') chip.style.display = 'flex';
    if (chip.classList.contains('shown')) return;
    requestAnimationFrame(function () { chip.classList.add('shown'); });
  }

  function _hideJumpChip() {
    var chip = document.getElementById('jump-latest-chip');
    if (!chip || chip.style.display === 'none') return;
    chip.classList.remove('shown');
    // Reset the wording as well as the visibility. It used to keep its last state while
    // hidden, so scrolling back up in a different part of the chat animated it in still
    // reading "messages from months ago" for a frame before correcting itself — which is
    // exactly how this looked like a wrong age judgement when it was a stale label.
    chip.classList.remove('old');
    var _t = chip.querySelector('.jump-latest-title');
    var _s = chip.querySelector('.jump-latest-sub');
    if (_t) _t.textContent = 'Jump to latest';
    if (_s) { _s.textContent = ''; _s.style.display = 'none'; }
    if (_jumpChipHideTimer) clearTimeout(_jumpChipHideTimer);
    _jumpChipHideTimer = setTimeout(function () {
      chip.style.display = 'none';
      _jumpChipHideTimer = null;
    }, 200);
  }

  function _wireJumpChip() {
    var feed = document.getElementById('message-feed');
    var chip = document.getElementById('jump-latest-chip');
    if (!feed || !chip || _jumpChipBound) return;
    _jumpChipBound = true;
    feed.addEventListener('scroll', function () {
      if (_jumpChipRaf) return;
      _jumpChipRaf = requestAnimationFrame(function () {
        _jumpChipRaf = 0;
        _updateJumpChip();
      });
    }, { passive: true });
    // The button is the stated target, but the whole chip still works: a small button on a
    // floating chip is an awkward thing to hit, and there is nothing else the chip could mean.
    var go = function (e) {
      if (e) e.stopPropagation();
      feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
      _hideJumpChip();
    };
    chip.addEventListener('click', go);
    var goBtn = chip.querySelector('.jump-latest-go');
    if (goBtn) goBtn.addEventListener('click', go);
  }

  window._updateJumpChip = _updateJumpChip;

  /* ---- The pinned bar, above the composer ----
     Same card as the desktop's, so the two read alike. Rendered from _pinnedFor, so it is
     always the pruned list and always the store's, not a group's. */
  var _lastPinnedBarSig = '';
  var _pinnedLongPressFired = false;
  var _pinBarIndex = 0;
  var _pinBarChatId = null;
  // The chat id is passed in, not read from window: activeChatId is a module-local in this
  // app, so window.activeChatId is undefined and the bar silently rendered for no chat.
  // renderMessages already receives it; the poller reuses the last one seen.
  /* ══ Sharing INTO Orbit ════════════════════════════════════════════════════
     A photo or link shared from another app. Android parks the intent in
     OrbitSharePlugin (see that file for why it is parked rather than delivered),
     and this collects it and asks which chat it is for.

     It asks rather than guessing. Sharing to a person you did not mean is worse
     than one extra tap, and "send to the last chat" is exactly the kind of
     helpfulness that sends a photo to the wrong person. */
  function _shareBridge() {
    var cap = window.Capacitor;
    return (cap && cap.Plugins && cap.Plugins.OrbitShare) || null;
  }

  var _shareBusy = false;

  /** Collect a parked share, if there is one. Safe to call often. */
  function checkPendingShare() {
    var bridge = _shareBridge();
    if (!bridge || _shareBusy) return;
    bridge.getPending().then(function (res) {
      var share = res && res.share;
      if (!share) return;
      _shareBusy = true;
      bridge.clear().catch(function () {}).then(function () {
        _shareBusy = false;
        _openSharePicker(share);
      });
    }).catch(function () { /* no plugin, or nothing parked */ });
  }

  /** Which chat? A list of the people and groups you can actually send to. */
  function _openSharePicker(share) {
    // Deduped by id: MStore.chats can carry the same chat twice — a
    // friend-derived entry alongside a stored one — and the same person listed
    // twice in a picker reads as two different people.
    var seen = {};
    var chats = (MStore.chats || []).filter(function (c) {
      if (!c || c.id == null) return false;
      var k = String(c.id);
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
    if (!chats.length) { showToast('No chats to share into yet', 'info'); return; }

    var rows = chats.map(function (c) {
      var initial = (c.name || '?').charAt(0).toUpperCase();
      var avatar = c.avatar
        ? '<img src="' + escapeHtml(c.avatar) + '" alt="">'
        : escapeHtml(initial);
      return '<div class="share-pick-row" data-chat="' + escapeHtml(String(c.id)) + '">' +
        '<div class="share-pick-avatar">' + avatar + '</div>' +
        '<div class="share-pick-name">' + escapeHtml(c.name || c.id) + '</div>' +
      '</div>';
    }).join('');

    var what = share.files && share.files.length
      ? (share.files.length + (share.files.length === 1 ? ' file' : ' files'))
      : 'a link';

    var html =
      '<div class="share-pick">' +
        '<div class="share-pick-head">' +
          '<div class="share-pick-title">Share to\u2026</div>' +
          '<div class="share-pick-sub">' + escapeHtml(what) + '</div>' +
        '</div>' +
        '<div class="share-pick-list">' + rows + '</div>' +
      '</div>';

    var sheet = window.OrbitSheet;
    if (sheet && sheet.showCustom) sheet.showCustom(html);
    else return;

    var root = document.querySelector('.share-pick');
    if (!root) return;
    root.querySelectorAll('.share-pick-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var chatId = row.getAttribute('data-chat');
        if (sheet && sheet.hide) sheet.hide();
        _deliverShare(chatId, share);
      });
    });
  }

  /** Put the shared thing into the composer as an attachment, ready to send. */
  function _deliverShare(chatId, share) {
    try {
      if (activeChatId !== chatId) openChat(chatId);
    } catch (e) { /* the send below will surface it */ }

    setTimeout(function () {
      try {
        (share.files || []).forEach(function (f) {
          // The attach path already accepts { type, name, url } with a data URL.
          var kind = /^image\//.test(f.mimeType) ? 'image'
            : /^video\//.test(f.mimeType) ? 'video'
            : /^audio\//.test(f.mimeType) ? 'audio'
            : 'file';
          stagedFiles.push({
            id: 'sf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: kind,
            name: f.name,
            size: f.size,
            mimeType: f.mimeType,
            url: f.dataUrl
          });
        });
        if (typeof renderFilePreview === 'function') renderFilePreview();
        if (typeof updateSendButton === 'function') updateSendButton();
        // A shared link goes in the box rather than being sent blind: you may
        // want to say something about it.
        if (share.text) {
          var input = document.getElementById('chat-input');
          if (input) {
            input.value = input.value ? (input.value + ' ' + share.text) : share.text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        showToast('Ready to send', 'info');
      } catch (e) {
        showToast('Could not attach the shared item', 'error');
      }
    }, 260);
  }

  window.checkPendingShare = checkPendingShare;

  /* ══ Replies typed into the notification shade ═════════════════════════════
     Android delivers an inline reply to OrbitReplyReceiver, which queues it —
     the process may not have been alive, and a broadcast receiver cannot run the
     P2P stack. This drains the queue and sends each one through the normal path.

     It sends by filling the composer and calling the same send the button calls,
     rather than writing a second send path. A reply that behaves differently from
     a typed message would be a bug waiting to be found.

     Order is preserved, and the queue is only cleared after every send has been
     attempted: a crash mid-drain replays a reply rather than losing it. */
  var _repliesBusy = false;

  function checkPendingReplies() {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var bridge = plugins.OrbitP2P;
    if (!bridge || typeof bridge.getPendingReplies !== 'function') return;
    if (_repliesBusy) return;
    _repliesBusy = true;

    bridge.getPendingReplies().then(function (res) {
      var replies = (res && res.replies) || [];
      if (!replies.length) { _repliesBusy = false; return; }

      var i = 0;
      var next = function () {
        if (i >= replies.length) {
          // Only now: everything has been attempted.
          if (typeof bridge.clearPendingReplies === 'function') {
            var c = bridge.clearPendingReplies();
            if (c && c.catch) c.catch(function () {});
          }
          _repliesBusy = false;
          return;
        }
        var r = replies[i++];
        try {
          if (activeChatId !== r.chatId) openChat(r.chatId);
          var input = document.getElementById('chat-input');
          if (input) {
            input.value = r.text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          setTimeout(function () {
            try { sendMessage(); } catch (e) { /* the next one still goes */ }
            setTimeout(next, 320);
          }, 200);
        } catch (e) {
          setTimeout(next, 120);
        }
      };
      next();
    }).catch(function () { _repliesBusy = false; });
  }

  window.checkPendingReplies = checkPendingReplies;

  /* ══ Undo send ═════════════════════════════════════════════════════════════
     A few seconds to take a message back after it has gone.

     This is a real retraction, not a local hide: `MESSAGE_DELETE` already exists
     in the protocol, the desktop broadcasts it, and the mobile already handles
     receiving it. Undo sends the same packet, so the message disappears for the
     other side too rather than leaving them reading something you think you
     unsent. A "delete" that only deletes it for you is worse than none.

     The window is short on purpose. It is for "wrong chat" and "sent too soon",
     not for changing your mind about what you said. */
  var UNDO_WINDOW_MS = 6000;
  var _undoChipTimer = null;

  /**
   * Offer the undo ON THE MESSAGE ITSELF, not in a toast.
   *
   * Dan's call, and he was right: a toast per send is a downgrade. Send five
   * messages quickly and you get five stacked toasts covering the chat — for a
   * feature most people will never use. The affordance belongs where the message
   * is, so it costs nothing when you are not looking at it.
   *
   * Off unless asked for. The hold menu already deletes, so this is a
   * convenience for people who send fast and regret fast, not a default.
   */
  function _offerUndoSend(chatId, msg) {
    if (!msg || !msg.id) return;
    if (!MStore.settings.undoSend) return;
    // The echo bot is not a peer and has nothing to retract.
    if (chatId === 'echo' || chatId === 'local-echo') return;

    if (_undoChipTimer) { clearTimeout(_undoChipTimer); _undoChipTimer = null; }

    var draw = function () {
      // Remove any chip from a previous send first: only the newest message is
      // undoable, so only the newest message may offer it.
      Array.prototype.forEach.call(document.querySelectorAll('.msg-undo-chip'), function (c) { c.remove(); });
      Array.prototype.forEach.call(document.querySelectorAll('.has-undo-chip'), function (r) { r.classList.remove('has-undo-chip'); });
      var row = document.querySelector('[data-msg-id="' + msg.id + '"]');
      if (!row) return;
      var chip = document.createElement('button');
      chip.className = 'msg-undo-chip';
      chip.textContent = 'Undo';
      chip.addEventListener('click', function (e) {
        e.stopPropagation();
        _clearUndoChip();
        _undoSend(chatId, msg.id);
      });
      row.classList.add('has-undo-chip');
      row.appendChild(chip);
    };
    setTimeout(draw, 60);

    _undoChipTimer = setTimeout(function () {
      _clearUndoChip();
      _undoChipTimer = null;
    }, UNDO_WINDOW_MS);
  }

  /** Take the chip (and the room it reserved) away. */
  function _clearUndoChip() {
    Array.prototype.forEach.call(document.querySelectorAll('.msg-undo-chip'), function (c) { c.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('.has-undo-chip'), function (r) { r.classList.remove('has-undo-chip'); });
  }

  /** Delete locally and tell the peer. Both, or it is not an undo. */
  function _undoSend(chatId, msgId) {
    try { MStore.deleteMessage(chatId, msgId); } catch (e) { /* already gone */ }

    try {
      var myId = MStore.user && MStore.user.id;
      var P = window.Orbit && window.Orbit.Protocol;
      if (P && myId && window.Orbit.P2P) {
        var payload = { msgId: msgId, chatId: chatId };
        var pkt = P.createPacket(P.Types.MESSAGE_DELETE, myId, chatId, payload);
        if (_isGroupChat(chatId)) {
          // A group has to hear it too, or the retraction stops at one member.
          var g = (MStore.groups || []).find(function (x) { return String(x.id) === String(chatId); });
          (g && g.members ? g.members : []).forEach(function (m) {
            var mid = String(m && m.id ? m.id : m);
            if (mid && mid !== String(myId)) { try { window.Orbit.P2P.send(mid, pkt); } catch (e) {} }
          });
        } else {
          window.Orbit.P2P.send(chatId, pkt);
        }
      }
    } catch (e) { /* the local delete already happened; the peer just keeps it */ }

    try { renderMessages(chatId); renderChatList(); } catch (e) {}
    showToast('Message undone', 'info');
  }

  /* ══ App lock ══════════════════════════════════════════════════════════════
     Ported from the desktop's PinLockScreen. The desktop verifies through
     Electron's main process; there is none here, so shared/ui/app-lock.js hashes
     with PBKDF2-SHA256 and keeps the result on settings. */
  function _appLockOn() {
    return !!(window.OrbitAppLock && window.OrbitAppLock.isEnabled(MStore.settings));
  }
  function _appLockDesc() {
    if (!_appLockOn()) return 'Require a PIN to open Orbit';
    return 'On \u00b7 ' + (MStore.settings.appLock && MStore.settings.appLock.lockOnBackground !== false
      ? 'locks when backgrounded'
      : 'locks on launch only');
  }

  /**
   * Ask for a PIN, twice, and store the hash. Two prompts because a mistyped PIN
   * you cannot read back is a lock you cannot open.
   */
  function _promptSetPin(after) {
    var AL = window.OrbitAppLock;
    if (!AL) return;
    var first = null;
    var ask = function (title, cb) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:210000;background:rgba(0,0,0,0.6);' +
        'display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
      overlay.innerHTML =
        '<div style="background:var(--bg-surface);border-radius:16px;padding:20px;width:100%;max-width:320px;border:1px solid var(--border-subtle);">' +
          '<div style="font-size:15px;font-weight:650;color:var(--text-primary);margin-bottom:4px;">' + title + '</div>' +
          '<div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:14px;">4 to 8 digits</div>' +
          '<input type="tel" inputmode="numeric" maxlength="8" class="vault-pass-input" style="width:100%;letter-spacing:0.4em;text-align:center;font-size:20px;" autocomplete="off">' +
          '<div style="display:flex;gap:8px;margin-top:16px;">' +
            '<button class="settings-btn-secondary" style="flex:1;">Cancel</button>' +
            '<button class="settings-btn-primary" style="flex:1;">Continue</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      var input = overlay.querySelector('input');
      var btns = overlay.querySelectorAll('button');
      setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      btns[0].addEventListener('click', function () { overlay.remove(); });
      btns[1].addEventListener('click', function () {
        var v = (input.value || '').trim();
        if (!/^\d{4,8}$/.test(v)) { input.value = ''; input.placeholder = '4 to 8 digits'; return; }
        overlay.remove();
        cb(v);
      });
    };
    ask('Choose a PIN', function (v1) {
      first = v1;
      ask('Enter it again', function (v2) {
        if (v1 !== v2) { _toast('The PINs did not match', 'error'); return; }
        AL.setPin(v1).then(function (cfg) {
          MStore.settings.appLock = cfg;
          MStore.save();
          _toast('App Lock is on', 'success');
          if (after) after();
        }).catch(function () { _toast('Could not set the PIN', 'error'); });
      });
    });
  }

  /** Lock the app now, unless it is already showing. */
  function lockApp() {
    if (!_appLockOn()) return;
    var AL = window.OrbitAppLock;
    if (!AL || AL.isShowing()) return;
    // Anything already open sits under the lock; the overlay's z-index is above
    // every sheet and modal, so nothing needs closing to be safe.
    AL.show(MStore.settings, function () {});
  }

  /* ══ The link preview bar ══════════════════════════════════════════════════
     Shows what the most recent link in this chat leads to, directly above the
     pinned card — and, when nothing is pinned, in its place.

     It is deliberately about the MOST RECENT link rather than every link: a
     preview is there to answer "what is this?", and the thing you are looking at
     is the thing just sent. An older link's card would sit there permanently,
     describing something nobody is talking about any more. */
  var _lpBarUrl = null;        // what is showing now
  var _lpDismissed = {};       // url -> true, for this session (the chat fallback)
  var _lpComposerSilenced = false;  // the box's link was dismissed; until it is emptied

  function _latestLinkUrl(chatId) {
    var LP = window.OrbitLinkPreview;
    if (!LP || !chatId) return null;
    var msgs = MStore.getMessages(chatId) || [];
    // Newest first. Only what a person actually typed is considered — a URL
    // inside a quoted reply or a forwarded blob is not what the chat is about.
    for (var i = msgs.length - 1; i >= 0; i--) {
      var text = msgs[i] && msgs[i].text;
      if (!text) continue;
      var url = LP.firstUrl(text);
      if (url) return url;
    }
    return null;
  }

  function _renderLinkPreviewBar(chatIdArg) {
    var el = document.getElementById('link-preview-bar');
    if (!el) return;
    var chatId = chatIdArg || activeChatId;

    // ⚠ The composer comes FIRST, and that ordering is the whole fix.
    //
    // This used to read only the chat's messages, so the bar could not appear
    // until the link had already been sent — the one moment a preview is
    // useless, because the decision is made. A preview answers "what does this
    // lead to?", and that question belongs to the moment the link is in the box.
    //
    // The input wins over the last sent message on purpose: if you are typing a
    // new link, that is the one you are asking about. Falling back to the chat
    // keeps the old behaviour for a chat that has a link and an empty composer.
    var typed = '';
    try {
      var inputEl = document.getElementById('chat-input');
      // Only when the composer belongs to the chat being painted.
      if (inputEl && inputEl.value && chatId === activeChatId) {
        // ⚠ ONE SOURCE for "what link is in this text". This used to be a second,
        // slightly different regex living only here, so the bar and the cards
        // could disagree about where a URL ended. OrbitLinkPreview.firstUrl() is
        // the one the messages already use — including its trailing-punctuation
        // trim, which matters for "see https://x.com." typed mid-sentence.
        var LPu = window.OrbitLinkPreview;
        var found = (LPu && LPu.firstUrl)
          ? LPu.firstUrl(inputEl.value)
          : (inputEl.value.match(/https?:\/\/[^\s]+/) || [])[0];
        if (found) typed = found;
      }
    } catch (e) { /* the bar must never break the composer */ }

    // ⚠ A LINK IN THE BOX ALWAYS WINS OVER AN OLD DISMISSAL.
    //
    // Dismissing means "stop describing the last thing that was SENT" — it is
    // about the message, not about the link. But it was keyed by URL for the
    // whole session, so once the bar for a link had been dismissed, putting that
    // SAME link into the composer showed nothing at all. That is the one moment a
    // preview is genuinely wanted: you are looking at the link you are about to
    // send, and asking what it leads to.
    //
    // That is exactly what Dan hit. The chat already held
    // https://d4niel-dev.github.io/Orbit/, its card had been dismissed at some
    // point, and pasting it back gave no preview. He read that as "pasted links
    // are not recognised" and as "links ending in / are not recognised" — it is
    // one cause, and neither of those is what was happening.
    //
    // So the two cases are tracked separately. The chat fallback keeps a
    // per-URL dismissal for the session, as before. The composer has a single
    // flag instead, set when you dismiss the bar while a link is in the box and
    // cleared when the box is emptied — so saying "no" holds while you carry on
    // typing (the URL changes on every keystroke, and keying by URL would bring
    // the bar straight back), but clearing the box and pasting the link again is
    // a fresh decision and gets a fresh preview.
    if (!typed) _lpComposerSilenced = false;

    var url = typed || _latestLinkUrl(chatId);
    var silenced = typed ? _lpComposerSilenced : (url ? !!_lpDismissed[url] : false);
    if (!url || silenced) {
      if (el.style.display !== 'none') { el.style.display = 'none'; el.innerHTML = ''; _lpBarUrl = null; }
      return;
    }

    var LP = window.OrbitLinkPreview;
    var esc = window.escapeHtml || function (v) { return String(v == null ? '' : v); };

    // Paint the domain immediately, then fill in the title and image when the
    // page answers. A bar that appears only after a network round-trip would
    // feel broken on a slow connection.
    if (_lpBarUrl !== url) {
      _lpBarUrl = url;
      el.innerHTML =
        '<div class="link-preview-bar" data-url="' + esc(url) + '">' +
          '<div class="link-preview-bar-thumb"><i data-lucide="link-2"></i></div>' +
          '<div class="link-preview-bar-body">' +
            '<span class="link-preview-bar-site">' + esc(LP.hostOf(url)) + '</span>' +
            '<span class="link-preview-bar-title">' + esc(LP.hostOf(url)) + '</span>' +
          '</div>' +
          '<button class="link-preview-bar-close" aria-label="Dismiss"><i data-lucide="x"></i></button>' +
        '</div>';
      el.style.display = '';
      if (window.lucide) { try { window.lucide.createIcons({ root: el }); } catch (e) {} }

      var box = el.querySelector('.link-preview-bar');
      if (box) {
        box.addEventListener('click', function (e) {
          if (e.target.closest('.link-preview-bar-close')) return;
          window.open(url, '_blank');
        });
        var close = box.querySelector('.link-preview-bar-close');
        if (close) {
          close.addEventListener('click', function (e) {
            e.stopPropagation();
            // ⚠ Read the composer NOW rather than trusting the `typed` captured
            // when this handler was attached. The same URL can arrive from the
            // other path (the chat's last link, then the same link pasted), and
            // the bar is not repainted when the URL is unchanged — so the
            // captured value can describe the previous source.
            var nowTyped = '';
            try {
              var i2 = document.getElementById('chat-input');
              var LPy = window.OrbitLinkPreview;
              if (i2 && i2.value && LPy && LPy.firstUrl) nowTyped = LPy.firstUrl(i2.value) || '';
            } catch (err) { /* fall through to the chat dismissal */ }

            // Which dismissal this is depends on what the bar was describing. A
            // link in the box is silenced for this compose only; the chat's own
            // last link is remembered per URL for the session. Dismissed, not
            // forgotten: the next link in the chat is a different question and
            // deserves its own answer.
            if (nowTyped) _lpComposerSilenced = true;
            else _lpDismissed[url] = true;
            el.style.display = 'none';
            el.innerHTML = '';
            _lpBarUrl = null;
          });
        }
      }
    }

    LP.preview(url).then(function (p) {
      // The chat may have moved on while the page was loading.
      if (!p || _lpBarUrl !== url) return;
      var box = el.querySelector('.link-preview-bar');
      if (!box) return;
      var site = box.querySelector('.link-preview-bar-site');
      var title = box.querySelector('.link-preview-bar-title');
      var thumb = box.querySelector('.link-preview-bar-thumb');
      if (site) site.textContent = p.site || LP.hostOf(url);
      if (title) title.textContent = p.title || LP.hostOf(url);
      if (thumb && p.image) {
        thumb.innerHTML = '<img src="' + esc(p.image) + '" alt="" ' +
          'onerror="this.parentNode.innerHTML=\'<i data-lucide=&quot;link-2&quot;></i>\'">';
        if (window.lucide) { try { window.lucide.createIcons({ root: thumb }); } catch (e) {} }
      }
    });
  }

  /**
   * Upgrade the in-message link cards with the page's own title and image.
   *
   * ⚠ ONE SOURCE. This calls the same `OrbitLinkPreview.preview()` the composer's
   * bar calls, so the card in a sent message and the bar above the composer
   * cannot describe the same link differently — which is what they did when the
   * card was written before the fetch existed.
   *
   * The card is already on screen and readable by the time this runs, so a failed
   * or slow fetch simply leaves the domain and the glyph in place. Nothing here
   * can empty a card that was already drawn.
   */
  function _upgradeLinkCards(root) {
    var LP = window.OrbitLinkPreview;
    if (!LP || !LP.preview) return;
    var scope = root || document;
    var cards = scope.querySelectorAll('[data-lp-url]');
    if (!cards.length) return;

    Array.prototype.forEach.call(cards, function (card) {
      var url = card.getAttribute('data-lp-url');
      if (!url || card.getAttribute('data-lp-done') === '1') return;
      card.setAttribute('data-lp-done', '1');

      Promise.resolve().then(function () { return LP.preview(url); }).then(function (p) {
        if (!p || !card.isConnected) return;
        var titleEl = card.querySelector('.link-preview-mob-title');
        // Only replace the domain when there is a real title to replace it with.
        if (titleEl && p.title && String(p.title).trim()) {
          titleEl.textContent = String(p.title).trim();
        }
        var thumb = card.querySelector('.link-preview-mob-img');
        if (thumb && p.image) {
          var img = document.createElement('img');
          img.alt = '';
          img.src = p.image;
          // A broken image falls back to the glyph rather than an empty box.
          img.addEventListener('error', function () {
            thumb.innerHTML = '<i data-lucide="link-2" style="width:18px;height:18px;"></i>';
            if (window.lucide) { try { lucide.createIcons({ root: thumb }); } catch (e) {} }
          }, { once: true });
          thumb.innerHTML = '';
          thumb.appendChild(img);
        }
      }).catch(function () { /* the card stays as painted */ });
    });
  }

  var _pinnedBarChatId = null;
  function _renderPinnedBar(chatIdArg) {
    var el = document.getElementById('pinned-messages-bar');
    if (!el) return;
    if (chatIdArg) _pinnedBarChatId = chatIdArg;
    var chatId = chatIdArg || _pinnedBarChatId;
    var list = chatId ? _pinnedFor(chatId) : [];
    if (!list.length) {
      if (el.style.display !== 'none') { el.style.display = 'none'; el.innerHTML = ''; _lastPinnedBarSig = ''; }
      return;
    }
    var sig = chatId + '|' + list.map(function (p) { return p.msgId; }).join(',');
    if (sig === _lastPinnedBarSig && el.style.display !== 'none') return;
    _lastPinnedBarSig = sig;

    // Which pin the bar is showing. Clamped, because a pin can disappear underneath it.
    if (_pinBarChatId !== chatId) { _pinBarChatId = chatId; _pinBarIndex = 0; }
    if (_pinBarIndex >= list.length) _pinBarIndex = 0;
    var shown = list[_pinBarIndex] || list[0];

    var P = window.OrbitPinned;
    var limit = P ? P.limitFor(_isGroupChat(chatId)) : 3;
    var esc = (window.escapeHtml) || function (v) { return String(v == null ? '' : v); };

    // Dots rather than a number: "2 of 3" beside "3 of 5" would read as two different
    // counts of the same thing, and one of them is how many are pinned.
    var dots = '';
    if (list.length > 1) {
      dots = '<span class="pin-dots">';
      for (var di = 0; di < list.length; di++) {
        dots += '<span class="pin-dot' + (di === _pinBarIndex ? ' on' : '') + '"></span>';
      }
      dots += '</span>';
    }

    el.innerHTML =
      '<i data-lucide="pin" style="width:14px;height:14px;flex-shrink:0;color:var(--accent-primary);"></i>' +
      '<span class="pin-name">' + esc(shown.text || '(attachment)') + '</span>' +
      dots +
      '<span class="pin-count">' + list.length + ' of ' + limit + '</span>' +
      '<button class="pin-show-all" type="button">' + (list.length > 1 ? 'Show all' : 'Manage') + '</button>';
    el.style.display = 'flex';
    if (window.lucide) { try { lucide.createIcons({ root: el }); } catch (e) {} }
    // Tap the row to jump to the top pin; the button opens the list; a LONG PRESS opens the
    // floating panel at the finger, which is the mobile equivalent of the desktop's
    // right-click. The click is suppressed when the long press has fired, or the jump would
    // run underneath the panel that just opened.
    el.onclick = function (e) {
      if (_pinnedLongPressFired) { _pinnedLongPressFired = false; return; }
      if (e.target.closest('.pin-show-all')) { showPinnedSheet(chatId); return; }
      _jumpToPinned(chatId, (list[_pinBarIndex] || list[0]).msgId);
    };
    // Swipe the bar to move between pins. Horizontal only, and only past a threshold, so it
    // does not fight the vertical scroll of the conversation underneath it.
    if (!el._pinSwipeWired) {
      el._pinSwipeWired = true;
      var _sw = null;
      el.addEventListener('touchstart', function (e) {
        var t = e.touches && e.touches[0];
        if (!t) return;
        _sw = { x: t.clientX, y: t.clientY };
      }, { passive: true });
      el.addEventListener('touchmove', function (e) {
        if (!_sw) return;
        var t = e.touches && e.touches[0];
        if (!t) return;
        _sw.dx = t.clientX - _sw.x;
        _sw.dy = t.clientY - _sw.y;
      }, { passive: true });
      el.addEventListener('touchend', function () {
        if (!_sw) return;
        var dx = _sw.dx || 0, dy = _sw.dy || 0;
        _sw = null;
        if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        var list2 = _pinnedFor(chatId);
        if (list2.length < 2) return;
        _pinBarIndex = dx < 0
          ? (_pinBarIndex + 1) % list2.length
          : (_pinBarIndex - 1 + list2.length) % list2.length;
        _lastPinnedBarSig = '';      // force a repaint of the same list
        _renderPinnedBar(chatId);
      }, { passive: true });
    }
    if (!el._pinnedLongPressWired) {
      el._pinnedLongPressWired = true;
      var _lpTimer = null;
      el.addEventListener('touchstart', function (e) {
        var t = (e.touches && e.touches[0]) || null;
        var px = t ? t.clientX : 0, py = t ? t.clientY : 0;
        _pinnedLongPressFired = false;
        clearTimeout(_lpTimer);
        _lpTimer = setTimeout(function () {
          _pinnedLongPressFired = true;
          showPinnedMenuAt(px, py, chatId);
        }, 450);
      }, { passive: true });
      el.addEventListener('touchmove', function () { clearTimeout(_lpTimer); }, { passive: true });
      el.addEventListener('touchend', function () { clearTimeout(_lpTimer); }, { passive: true });
    }
  }

  function _jumpToPinned(chatId, msgId) {
    var sel = '.message-row[data-msg-id="' + String(msgId).replace(/"/g, '') + '"]';
    var el = document.querySelector(sel);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    // Not rendered yet: load the chat, then try once more.
    if (window.openChat && window.activeChatId !== chatId) {
      window.openChat(chatId);
      setTimeout(function () {
        var again = document.querySelector(sel);
        if (again) again.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  }

  /* ---- The list, with reordering ----
     A working copy, so leaving without saving changes nothing. Save hands the order to
     _setPinned, and the shared rules decide whether it was a change worth announcing. */
  function showPinnedSheet(chatId) {
    if (typeof OrbitSheet === 'undefined') return;
    var P = window.OrbitPinned;
    var working = _pinnedFor(chatId).map(function (p) { return { msgId: p.msgId, text: p.text }; });
    var esc = (window.escapeHtml) || function (v) { return String(v == null ? '' : v); };
    var limit = P ? P.limitFor(_isGroupChat(chatId)) : 3;

    function rowsHtml() {
      if (!working.length) {
        return '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">Nothing is pinned here yet.</div>';
      }
      var h = '';
      working.forEach(function (r, i) {
        h += '<div class="pinned-sheet-row" data-index="' + i + '">' +
          '<span class="pin-text">' + esc(r.text || '(attachment)') + '</span>' +
          '<button class="pin-move" data-move="up" data-index="' + i + '"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
          '<button class="pin-move" data-move="down" data-index="' + i + '"' + (i === working.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
        '</div>';
      });
      return h;
    }

    function paint() {
      var host = document.getElementById('pinned-sheet-rows');
      if (host) host.innerHTML = rowsHtml();
    }

    OrbitSheet.showCustom(
      '<div style="padding:16px;">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">' +
          '<i data-lucide="pin" style="width:16px;height:16px;color:var(--accent-primary);"></i>' +
          '<span style="font-weight:600;font-size:15px;color:var(--text-primary);">Pinned messages</span>' +
          '<span style="margin-left:auto;font-size:11px;color:var(--text-muted);">' + working.length + ' of ' + limit + '</span>' +
        '</div>' +
        '<div id="pinned-sheet-rows">' + rowsHtml() + '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="pinned-sheet-close" type="button" style="flex:1;padding:12px;border-radius:11px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);font-size:14px;">Close</button>' +
          '<button id="pinned-sheet-save" type="button" style="flex:1;padding:12px;border-radius:11px;border:none;background:var(--accent-primary);color:#fff;font-size:14px;font-weight:600;">Save order</button>' +
        '</div>' +
      '</div>'
    );

    setTimeout(function () {
      if (window.lucide) { try { lucide.createIcons(); } catch (e) {} }
      var host = document.getElementById('pinned-sheet-rows');
      if (host) {
        host.addEventListener('click', function (e) {
          var btn = e.target.closest('.pin-move');
          if (!btn || btn.disabled) return;
          var i = parseInt(btn.getAttribute('data-index'), 10);
          var to = btn.getAttribute('data-move') === 'up' ? i - 1 : i + 1;
          if (to < 0 || to >= working.length) return;
          var row = working.splice(i, 1)[0];
          working.splice(to, 0, row);
          paint();
        });
      }
      var closeBtn = document.getElementById('pinned-sheet-close');
      if (closeBtn) closeBtn.onclick = function () { OrbitSheet.hide(); };
      var saveBtn = document.getElementById('pinned-sheet-save');
      if (saveBtn) saveBtn.onclick = function () {
        var before = _pinnedFor(chatId);
        var nextIds = working.map(function (r) { return String(r.msgId); });
        // orderChanged only looks at msgId order, so plain {msgId} shapes are enough.
        var asIds = function (ids) { return ids.map(function (id) { return { msgId: id }; }); };
        var beforeIds = before.map(function (b) { return String(b.msgId); });
        if (P && P.orderChanged(asIds(beforeIds), asIds(nextIds))) {
          var byId = {};
          before.forEach(function (b) { byId[String(b.msgId)] = b; });
          _setPinned(chatId, nextIds.map(function (id) { return byId[id]; }).filter(Boolean));
          if (typeof renderMessages === 'function') renderMessages(chatId);
          _renderPinnedBar();
          // A real system line in the chat now, the same as the desktop's. It was a toast
          // while the renderer had no `system` branch; that branch exists, so the note goes
          // where the conversation is.
          var _noteText = P.orderChangedText((MStore.user && (MStore.user.name || MStore.user.username)) || '');
          MStore.messages[chatId] = (MStore.messages[chatId] || []).concat([{
            id: 'sys-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
            text: _noteText,
            from: 'me',
            system: true,
            time: new Date().toISOString()
          }]);
          MStore.save();
          if (typeof renderMessages === 'function') renderMessages(chatId);
        }
        OrbitSheet.hide();
      };
    }, 60);
  }

  // A light poller for the same reason the transfer strip has one: a pin can change
  // without this device rendering anything, and 1.5s is cheap.
  setInterval(function () { try { _renderPinnedBar(); } catch (e) {} }, 1500);

  /* ---- The floating panel, at the touch ----
     The mobile equivalent of the desktop's right-click menu: a small card where the finger
     is, listing the pins with a jump on tap, then Reorder and Unpin all.

     Clamped into the viewport rather than left where it was asked for. The desktop's
     ContextMenu FLIPS when it would run off the bottom, and a menu half off-screen is worse
     than one that has moved — this does the same job by clamping. */
  function showPinnedMenuAt(x, y, chatId) {
    var existing = document.getElementById('pinned-floating-panel');
    if (existing) existing.remove();
    var list = _pinnedFor(chatId);
    var esc = (window.escapeHtml) || function (v) { return String(v == null ? '' : v); };

    var panel = document.createElement('div');
    panel.id = 'pinned-floating-panel';

    var html = '';
    if (!list.length) {
      html += '<div class="pfp-empty">Nothing pinned here yet</div>';
    } else {
      list.forEach(function (p, i) {
        html += '<button type="button" class="pfp-row" data-msg-id="' + esc(String(p.msgId)) + '">' +
          '<span class="pfp-num">' + (i + 1) + '.</span>' +
          '<span class="pfp-text">' + esc(p.text || '(attachment)') + '</span>' +
        '</button>';
      });
      html += '<div class="pfp-sep"></div>';
      html += '<button type="button" class="pfp-action" data-act="reorder">Reorder&hellip;</button>';
      html += '<button type="button" class="pfp-action pfp-danger" data-act="unpin-all">Unpin all</button>';
    }
    panel.innerHTML = html;
    document.body.appendChild(panel);

    // Clamp: a menu that runs off the edge is worse than one that has moved.
    var r = panel.getBoundingClientRect();
    var left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    var top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';

    function dismiss() { panel.remove(); }
    panel.addEventListener('click', function (e) {
      var row = e.target.closest('.pfp-row');
      var act = e.target.closest('.pfp-action');
      if (row) {
        var id = row.getAttribute('data-msg-id');
        dismiss();
        _jumpToPinned(chatId, id);
        return;
      }
      if (act) {
        var what = act.getAttribute('data-act');
        dismiss();
        if (what === 'reorder') showPinnedSheet(chatId);
        if (what === 'unpin-all') {
          _setPinned(chatId, []);
          if (typeof renderMessages === 'function') renderMessages(chatId);
          _renderPinnedBar();
        }
        return;
      }
      dismiss();
    });
    // Anywhere else, on the next interaction.
    setTimeout(function () {
      document.addEventListener('touchstart', dismiss, { once: true, passive: true });
      document.addEventListener('mousedown', dismiss, { once: true });
    }, 0);
  }

  window.showPinnedMenuAt = showPinnedMenuAt;

  window.showPinnedSheet = showPinnedSheet;
  window._renderPinnedBar = _renderPinnedBar;

  // Exposed for the pinned bar and list, and for the harness.
  window._pinnedFor = _pinnedFor;
  window._setPinned = _setPinned;
  window._isGroupChat = _isGroupChat;

  function _transferRows() {
    var rows = [];
    var sends = window.activeSends || {};
    for (var k in sends) {
      var sess = sends[k];
      if (!sess || sess.done || sess.cancelled) continue;
      var total = sess.total || 0;
      var sent = Math.min(sess.ci || 0, total);
      var att = sess.att || {};
      var name = att.name || att.fileName || '';
      rows.push({
        // Desktop falls back to a description rather than an empty or unknown name
        name: name || 'Sending file\u2026',
        pct: total ? Math.floor(sent / total * 100) : 0,
        dir: 'up'
      });
    }
    var recvs = window.activeTransfers || {};
    for (var id in recvs) {
      var t = recvs[id];
      if (!t) continue;
      var tot = t.total || 0;
      var got = t.received || 0;
      var label = t.fileName || '';
      // Desktop names the kind when it has one, so a nameless receive still says
      // something useful instead of "unknown".
      if (!label || label === 'unknown') {
        if (t.progType === 'audio') label = 'Receiving Audio\u2026';
        else if (t.progType === 'video') label = 'Receiving Video\u2026';
        else label = 'Receiving file\u2026';
      }
      rows.push({
        name: label,
        pct: tot ? Math.floor(got / tot * 100) : 0,
        dir: 'down'
      });
    }
    return rows;
  }

  var _lastStripSignature = '';
  function _renderTransferStrip() {
    var strip = document.getElementById('transfer-progress-strip');
    if (!strip) return;
    var rows = _transferRows();
    if (!rows.length) {
      if (strip.style.display !== 'none') {
        strip.style.display = 'none';
        strip.innerHTML = '';
        _lastStripSignature = '';
      }
      return;
    }
    // Only touch the DOM when something actually changed: the poller runs every 600ms
    // and a rebuild per tick would fight the bar's width transition.
    var sig = rows.map(function (r) { return r.dir + '|' + r.name + '|' + r.pct; }).join('\n');
    if (sig === _lastStripSignature) return;
    _lastStripSignature = sig;

    var esc = (window.Sanitize && window.Sanitize.escapeHtml)
      ? window.Sanitize.escapeHtml
      : function (v) { return String(v == null ? '' : v); };
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var pct = Math.max(0, Math.min(100, r.pct));
      html += '<div class="transfer-card">' +
        '<span class="transfer-icon" aria-hidden="true">' + (_TP_ICONS[r.dir] || _TP_ICONS.down) + '</span>' +
        '<div class="transfer-body">' +
          '<div class="transfer-line">' +
            '<span class="transfer-name">' + esc(r.name) + '</span>' +
            '<span class="transfer-pct">' + pct + '%</span>' +
          '</div>' +
          '<div class="transfer-bar"><div class="transfer-bar-fill" style="width:' + pct + '%"></div></div>' +
        '</div>' +
      '</div>';
    }
    strip.innerHTML = html;
    strip.style.display = 'block';
  }

  setInterval(_renderTransferStrip, 600);
  window._renderTransferStrip = _renderTransferStrip;
  window._transferRows = _transferRows;

  /* ---- Slash Command Tooltip ---- */
  function showCommandTooltip(val) {
    // Group-only guard for the COMMANDS: they really are group utilities, so the
    // picker stays out of the way in a DM.
    //
    // /help is the exception, and it is the reason this looked broken. Typing /help
    // in a DM — and a fresh install's only chat is Orbit Echo, a DM — produced no
    // tooltip at all, so the command appeared dead on every version, even though the
    // help sheet itself opens fine and explains the group-only rule. Help is a
    // reference, not a utility, so it is offered wherever it is typed.
    var isGroupForTip = false;
    try {
      isGroupForTip = MStore.groups.some(function(g) { return g.id === activeChatId || g.groupId === activeChatId; });
    } catch(e) { isGroupForTip = false; }
    var typed = String(val || '').trim().toLowerCase();
    var isHelpCommand = typed === '/h' || typed === '/help';
    if (!isGroupForTip && !isHelpCommand) {
      hideCommandTooltip();
      return;
    }
    var tooltip = document.getElementById('slash-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'slash-tooltip';
      tooltip.className = 'slash-tooltip';
      var chatInputArea = document.getElementById('chat-input-area');
      if (chatInputArea) chatInputArea.appendChild(tooltip);
      else document.body.appendChild(tooltip);
    }
    var q = val.toLowerCase().substring(1);
    var matches = COMMANDS.filter(function(c) {
      return c.name.indexOf(q) !== -1 || c.desc.toLowerCase().indexOf(q) !== -1;
    });
    if (matches.length === 0) {
      tooltip.style.display = 'none';
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(matches.length, 5); i++) {
      var m = matches[i];
      html += '<div class="slash-tooltip-item" data-cmd="' + m.name + '">' +
        '<span class="slash-tooltip-name">' + m.name + '</span>' +
        '<span class="slash-tooltip-desc">' + m.desc + '</span>' +
      '</div>';
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    // Wire click handlers
    tooltip.querySelectorAll('.slash-tooltip-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var cmd = this.getAttribute('data-cmd');
        var input = document.getElementById('chat-input');
        if (input) {
          input.value = cmd + ' ';
          input.selectionStart = input.selectionEnd = cmd.length + 1;
          input.focus();
          var evt = new Event('input', { bubbles: true });
          input.dispatchEvent(evt);
        }
        hideCommandTooltip();
      });
    });
  }

  function hideCommandTooltip() {
    var tooltip = document.getElementById('slash-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  /* -- Emoji Picker -- */
  var emojiPickerOpen = false;

  function closeEmojiPicker() {
    var container = document.getElementById('emoji-picker-container');
    if (container) container.style.display = 'none';
    emojiPickerOpen = false;
    window._emojiPickerReactMode = null;
  }

  // Size the picker against the VISIBLE area rather than a fixed 320px: that
  // constant ate most of a short screen, and the picker carries its own search
  // field, so once the keyboard is up a fixed height pushes the composer out of
  // reach. Mirrors OrbitSheet._syncViewport, which does the same for sheets.
  function _syncEmojiHeight() {
    var container = document.getElementById('emoji-picker-container');
    if (!container) return;
    var vv = window.visualViewport;
    var h = (vv && vv.height) ? vv.height : window.innerHeight;
    container.style.setProperty('--emoji-picker-vh', h + 'px');
  }

  function initEmojiPicker() {
    var container = document.getElementById('emoji-picker-container');
    if (!container) return;

    // Header: just the grab handle. Dismissal is by tapping outside (the
    // document-level listener below) or swiping the handle down — Dan asked for
    // the close button to go rather than have two ways out of the same panel.
    var header = document.createElement('div');
    header.className = 'emoji-picker-header';
    header.innerHTML = '<div class="bottom-sheet-handle"></div>';
    container.appendChild(header);

    var picker = document.createElement('emoji-picker');

    // emoji-picker-element only remembers the chosen skin tone for the session,
    // so persist it — otherwise every launch silently resets to the default.
    //
    // The value MUST be validated on both sides. The picker renders whatever it is
    // handed inside its skin-tone button, and a `skin-tone-change` event with no
    // detail stored the literal string "undefined" — which then rendered as a
    // giant "undefined" across the search row on the next launch. (Reported by
    // Dan; the poisoned value had to be cleared, not just stopped, so the read
    // side rejects and removes it.)
    function isValidSkinTone(v) {
      // A tone emoji is a non-ASCII grapheme: "undefined" and friends are ASCII,
      // so this rejects every bad value without trying to enumerate good ones.
      return typeof v === 'string' && v.length > 0 && v.length <= 12 && !/[\x00-\x7F]/.test(v);
    }
    try {
      var savedTone = localStorage.getItem('orbit_emoji_skin_tone');
      if (savedTone) {
        if (isValidSkinTone(savedTone)) {
          picker.skinToneEmoji = savedTone;
        } else {
          localStorage.removeItem('orbit_emoji_skin_tone');   // self-heal
        }
      }
    } catch (e) { /* storage blocked — the picker keeps its default tone */ }
    picker.addEventListener('skin-tone-change', function(e) {
      try {
        var tone = e && e.detail ? e.detail.skinToneEmoji : null;
        if (isValidSkinTone(tone)) localStorage.setItem('orbit_emoji_skin_tone', tone);
      } catch (e2) {}
    });

    picker.addEventListener('emoji-click', function(e) {
      // Reaction mode — emoji is for reacting to a message, not for input
      if (window._emojiPickerReactMode) {
        var mode = window._emojiPickerReactMode;
        window._emojiPickerReactMode = null;
        if (mode.chatId && mode.msgId) {
          applyReactionLocally(mode.chatId, mode.msgId, e.detail.unicode, 'add');
          sendReaction(mode.chatId, mode.msgId, e.detail.unicode, 'add');
        }
        closeEmojiPicker();
        return;
      }
      // Normal mode — insert emoji into chat input
      var input = document.getElementById('chat-input');
      if (input) {
        var start = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, start) + e.detail.unicode + input.value.slice(start);
        input.focus();
        var pos = start + e.detail.unicode.length;
        input.setSelectionRange(pos, pos);

        // ⚠ THE BUG WAS HERE. Assigning .value fires nothing, so nothing that
        // watches the composer ever learned the box had content. Pick an emoji
        // and the composer still showed the MIC — the send button never
        // appeared, so an emoji-only message could not be sent. Typing worked
        // fine, which is why this survived: the text path fires `input` for
        // free and the picker path does not.
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    container.appendChild(picker);

    // Swipe down on the handle to dismiss — the same gesture as the sheets, via
    // the same helper, so the two panels behave alike.
    if (window.OrbitSheet && typeof OrbitSheet.enableDragClose === 'function') {
      OrbitSheet.enableDragClose({ sheet: container, onClose: closeEmojiPicker });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', function() {
        if (emojiPickerOpen) _syncEmojiHeight();
      });
    }
  }

  function openEmojiPicker() {
    var container = document.getElementById('emoji-picker-container');
    if (!container) return;
    var theme = document.documentElement.getAttribute('data-theme') || 'dark';
    var picker = container.querySelector('emoji-picker');
    if (picker) {
      picker.classList.remove('light', 'dark');
      picker.classList.add(theme);
    }
    _syncEmojiHeight();
    container.style.display = 'block';
    emojiPickerOpen = true;
  }

  function toggleEmojiPicker() {
    if (emojiPickerOpen) closeEmojiPicker();
    else openEmojiPicker();
  }

  /* -- File Upload -- */
  var stagedFiles = [];
  var _voiceRecorder = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    startTime: null,
    timerInterval: null,
    isRecording: false
  };

  function _getAudioMimeType() {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    return 'audio/webm';
  }

  function startVoiceRecording() {
    if (_voiceRecorder.isRecording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      // Show the button but disabled — a check already happened at init
      showToast('Microphone not available on this device', 'warning');
      return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      _voiceRecorder.stream = stream;
      _voiceRecorder.audioChunks = [];
      _voiceRecorder.startTime = Date.now();

      var mimeType = _getAudioMimeType();
      var recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mimeType });
      } catch(e) {
        // Fallback: let MediaRecorder pick default
        recorder = new MediaRecorder(stream);
      }
      _voiceRecorder.mediaRecorder = recorder;

      recorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) {
          _voiceRecorder.audioChunks.push(e.data);
        }
      };

      recorder.onstop = function() {
        // Show indicator briefly before pushing to staged files
        var btnVoice = document.getElementById('btn-voice');
        if (btnVoice) btnVoice.classList.remove('recording');

        var indicator = document.getElementById('voice-recording-indicator');
        if (indicator) indicator.style.display = 'none';

        clearInterval(_voiceRecorder.timerInterval);
        _voiceRecorder.timerInterval = null;

        if (_voiceRecorder.audioChunks.length === 0) {
          _voiceRecorder.isRecording = false;
          return;
        }

        var blob = new Blob(_voiceRecorder.audioChunks, { type: _getAudioMimeType() });
        var ext = blob.type.indexOf('mp4') !== -1 ? '.mp4' : '.webm';
        var fileName = 'Voice Message' + ext;
        var audioFile = new File([blob], fileName, { type: blob.type });
        var blobUrl = URL.createObjectURL(blob);

        stagedFiles.push({
          id: 'voice_' + Date.now(),
          file: audioFile,
          type: 'audio',
          name: fileName,
          url: blobUrl,
          mimeType: blob.type,
          size: blob.size,
          _arrayBuffer: null
        });

        // Read the blob as ArrayBuffer for the send pipeline
        var reader = new FileReader();
        reader.onload = function(ev) {
          var lastIdx = stagedFiles.length - 1;
          if (lastIdx >= 0 && stagedFiles[lastIdx].id.indexOf('voice_') === 0) {
            stagedFiles[lastIdx]._arrayBuffer = ev.target.result;
          }
        };
        reader.readAsArrayBuffer(blob);

        renderFilePreview();
        showToast('Voice message recorded', 'success');

        _voiceRecorder.audioChunks = [];
        _voiceRecorder.isRecording = false;
      };

      recorder.onerror = function() {
        stopVoiceRecording(true);
        showToast('Recording failed', 'error');
      };

      recorder.start(250); // Collect data every 250ms for low latency
      _voiceRecorder.isRecording = true;

      // Update UI
      var btnVoice = document.getElementById('btn-voice');
      if (btnVoice) btnVoice.classList.add('recording');

      var indicator = document.getElementById('voice-recording-indicator');
      if (indicator) indicator.style.display = 'flex';

      // Start timer
      _voiceRecorder.timerInterval = setInterval(function() {
        var elapsed = Math.floor((Date.now() - _voiceRecorder.startTime) / 1000);
        var maxDuration = 300; // 5 minutes
        if (elapsed >= maxDuration) {
          stopVoiceRecording(false);
          return;
        }
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        var timerEl = document.getElementById('voice-recording-timer');
        if (timerEl) timerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
      }, 200);
    }).catch(function(err) {
      console.warn('[Voice] getUserMedia error:', err.message);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showToast('Microphone permission denied', 'warning');
      } else if (err.name === 'NotFoundError') {
        showToast('No microphone found', 'warning');
      } else {
        showToast('Could not access microphone: ' + err.message, 'warning');
      }
      _voiceRecorder.isRecording = false;
    });
  }

  function stopVoiceRecording(cancel) {
    if (!_voiceRecorder.isRecording && !_voiceRecorder.mediaRecorder) return;

    // Stop the MediaRecorder
    if (_voiceRecorder.mediaRecorder && _voiceRecorder.mediaRecorder.state !== 'inactive') {
      try { _voiceRecorder.mediaRecorder.stop(); } catch(e) {}
    }

    // Stop all tracks on the stream
    if (_voiceRecorder.stream) {
      var tracks = _voiceRecorder.stream.getTracks();
      tracks.forEach(function(t) { t.stop(); });
      _voiceRecorder.stream = null;
    }

    clearInterval(_voiceRecorder.timerInterval);
    _voiceRecorder.timerInterval = null;

    // Clean up UI
    var btnVoice = document.getElementById('btn-voice');
    if (btnVoice) btnVoice.classList.remove('recording');

    var indicator = document.getElementById('voice-recording-indicator');
    if (indicator) indicator.style.display = 'none';

    var timerEl = document.getElementById('voice-recording-timer');
    if (timerEl) timerEl.textContent = '0:00';

    if (cancel) {
      // Discard all chunks
      _voiceRecorder.audioChunks = [];
      _voiceRecorder.isRecording = false;
      // Revoke any blob URLs that might have been created
    }
  }

  function handleFileInput(e) {
    if (!e.target.files || e.target.files.length === 0) return;
    var total = e.target.files.length;
    var done = 0;
    var maxBytes = (parseInt(MStore.settings.maxFileSize, 10) || 500) * 1024 * 1024;
    for (var i = 0; i < total; i++) {
      (function(file) {
        if (file.size > maxBytes) {
          showToast('File too large: ' + file.name + ' (max ' + (maxBytes / 1024 / 1024) + 'MB)', 'warning');
          done++;
          if (done === total) renderFilePreview();
          return;
        }
    var ext = file.name.split('.').pop().toLowerCase();
    var imgExts = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    var vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
    var audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
    var isImage = file.type.startsWith('image/') || imgExts.indexOf(ext) !== -1;
    var isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
    var isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
        if (isImage) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            MStore.compressImage(ev.target.result, 800, 800, 0.5, function(compressedUrl) {
              stagedFiles.push({
                name: file.name,
                size: file.size,
                type: 'image',
                mimeType: file.type || 'image/jpeg',
                url: compressedUrl
              });
              done++;
              if (done === total) renderFilePreview();
            });
          };
          reader.readAsDataURL(file);
        } else if (isVideo) {
          var reader = new FileReader();
          reader.onload = function(ev) {
            var ab = ev.target.result;
            var blobUrl = URL.createObjectURL(new Blob([ab], { type: file.type || 'video/mp4' }));
            stagedFiles.push({
              name: file.name,
              size: file.size,
              type: 'video',
              mimeType: file.type || 'video/mp4',
              url: blobUrl,
              _arrayBuffer: ab
            });
            done++;
            if (done === total) renderFilePreview();
          };
          reader.readAsArrayBuffer(file);
        } else if (isAudio) {
          var audioReader = new FileReader();
          audioReader.onload = function(ev) {
            var ab = ev.target.result;
            var blobUrl = URL.createObjectURL(new Blob([ab], { type: file.type || 'audio/mpeg' }));
            stagedFiles.push({
              name: file.name,
              size: file.size,
              type: 'audio',
              mimeType: file.type || 'audio/mpeg',
              url: blobUrl,
              _arrayBuffer: ab
            });
            done++;
            if (done === total) renderFilePreview();
          };
          audioReader.readAsArrayBuffer(file);
        } else {
          stagedFiles.push({
            name: file.name,
            size: file.size,
            type: 'file',
            mimeType: file.type || 'application/octet-stream',
            url: null
          });
          done++;
          if (done === total) renderFilePreview();
        }
      })(e.target.files[i]);
    }
    e.target.value = '';
  }

  function renderFilePreview() {
    var area = document.getElementById('file-preview-area');
    if (!area) return;
    if (stagedFiles.length === 0) {
      area.style.display = 'none';
      return;
    }
    area.style.display = 'flex';
    var html = '';
    stagedFiles.forEach(function(s, i) {
      if (s.type === 'image' && s.url) {
        // ⚠ THE TILE USED TO BE NOTHING BUT AN <img>. So while a photo decoded
        // — a full-resolution camera shot can take a second — the user got an
        // empty 54x54 box with no indication anything was happening. The tile is
        // now a container with a spinner and a remove button, and the image sits
        // on top of them.
        html += '<div class="file-preview-item is-loading" data-i="' + i + '">' +
          '<div class="fp-spinner" aria-hidden="true"></div>' +
          '<img src="' + s.url + '" alt="">' +
          '<button class="fp-x" data-i="' + i + '" aria-label="Remove ' +
            escapeHtml(s.name || 'image') + '">' +
            '<i data-lucide="x"></i></button>' +
          '</div>';
      } else if (s.type === 'video') {
        html += '<div class="file-preview-item" data-i="' + i + '">' +
          '<div class="file-icon" style="color:#a855f7;"><i data-lucide="video"></i></div>' +
          '<button class="fp-x" data-i="' + i + '" aria-label="Remove ' +
            escapeHtml(s.name || 'video') + '"><i data-lucide="x"></i></button>' +
          "</div>";
      } else if (s.type === 'audio') {
        html += '<div class="file-preview-item" data-i="' + i + '">' +
          '<div class="file-icon" style="color:#ec4899;"><i data-lucide="music"></i></div>' +
          '<button class="fp-x" data-i="' + i + '" aria-label="Remove ' +
            escapeHtml(s.name || 'audio') + '"><i data-lucide="x"></i></button>' +
          "</div>";
      } else {
        html += '<div class="file-preview-item" data-i="' + i + '">' +
          '<div class="file-icon"><i data-lucide="file"></i></div>' +
          '<button class="fp-x" data-i="' + i + '" aria-label="Remove ' +
            escapeHtml(s.name || 'file') + '"><i data-lucide="x"></i></button>' +
          "</div>";
      }
    });
    area.innerHTML = html;
    renderLucide(area);

    // The spinner comes off when the image is actually ready. `complete` is
    // checked as well as the event: a cached image may already have loaded by
    // the time this runs, and then `load` never fires — which would leave a
    // spinner turning over a photo that is plainly visible underneath it.
    area.querySelectorAll('.file-preview-item.is-loading img').forEach(function(img) {
      var tile = img.parentNode;
      var done = function() { if (tile) tile.classList.remove('is-loading'); };
      if (img.complete && img.naturalWidth > 0) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });

    // ⚠ This handler used to be wired to `.file-preview-remove`, an element the
    // renderer never emitted — so it matched nothing and did nothing, and a
    // staged image could not be taken back. It is wired to the button that
    // actually exists now.
    area.querySelectorAll('.fp-x').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = parseInt(this.getAttribute('data-i'), 10);
        if (isNaN(idx) || idx < 0 || idx >= stagedFiles.length) return;
        // Only THIS one leaves; everything else still sends.
        stagedFiles.splice(idx, 1);
        renderFilePreview();
        updateSendButton();
      });
    });

    // Tapping a tile LOOKS at it. It must not send, and it must not open the
    // chat — so the tile is its own click target and the x stops propagation.
    // The viewer is the app's existing lightbox: it already takes a list of
    // { url, type } and already knows how to page through them, which is
    // exactly the shape stagedFiles has.
    area.querySelectorAll('.file-preview-item').forEach(function(tile) {
      tile.addEventListener('click', function(e) {
        if (e.target.closest('.fp-x')) return;
        var idx = parseInt(this.getAttribute('data-i'), 10);
        var viewable = stagedFiles.filter(function(s) { return s.type === 'image' && s.url; });
        if (!viewable.length) return;
        var target = stagedFiles[idx];
        if (!target || target.type !== 'image') return;
        var at = viewable.indexOf(target);
        if (typeof window.openLightbox === 'function') {
          window.openLightbox(at < 0 ? 0 : at, viewable);
        }
      });
    });
  }

  /* -- DB Migration -- */
  function migrateOldData() {
    if (localStorage.getItem('orbit_migrated_v2')) { console.log('[Orbit] Data migration already completed — skipping'); return; }

    console.log('[Orbit] Running old data migration...');
    // Check for old non-prefixed keys
    var oldKeys = ['friends', 'chats', 'messages', 'settings'];
    var migrated = false;
    oldKeys.forEach(function(key) {
      var val = localStorage.getItem(key);
      if (val) {
        try {
          JSON.parse(val);
          // Only migrate if we don't already have data
          var existing = localStorage.getItem('orbit_' + key);
          if (!existing || existing === 'null') {
            localStorage.setItem('orbit_' + key, val);
            localStorage.removeItem(key);
            migrated = true;
          }
        } catch(e) {}
      }
    });

    // Migrate old user data
    var oldUser = localStorage.getItem('user');
    if (oldUser) {
      try {
        JSON.parse(oldUser);
        var existingUser = localStorage.getItem('orbit_user');
        if (!existingUser || existingUser === 'null') {
          localStorage.setItem('orbit_user', oldUser);
          localStorage.removeItem('user');
          migrated = true;
        }
      } catch(e) {}
    }

    if (migrated) {
      console.log('[Orbit] Migrated old localStorage data');
    }
    localStorage.setItem('orbit_migrated_v2', 'true');
  }

  /* -- Friends -- */
  var friendsSearchFilter = '';
  var activitySearchFilter = '';

  /**
   * Render the Contacts list.
   *
   * This used to be a second, older implementation that wrote to the SAME
   * `#friends-list` container as `OrbitHome.renderFriendsList()`. Whichever ran
   * last won, and this one is called from a dozen places (friend added, presence
   * change, profile save, search), so the list flipped from the grouped version
   * — Online / Offline / Groups — to a flat list with a chevron on almost any
   * friend update. Dan saw it as "correct, then incorrect".
   *
   * There is one renderer now. The name is kept because the call sites use it,
   * and the search filter is published on the window for the renderer to read.
   */
  function renderFriends() {
    window._friendsSearchFilter = friendsSearchFilter;
    if (window.OrbitHome && window.OrbitHome.renderFriendsList) {
      window.OrbitHome.renderFriendsList();
      return;
    }
    // OrbitHome loads after app.js. Reaching here means a call fired before it
    // was defined, which is a load-order bug — say so rather than drawing a
    // second, different list that then gets overwritten.
    console.warn('[Orbit] renderFriends called before OrbitHome is available');
  }

  /* -- Settings -- */
  /* ─── Nav & panel header avatar ─── */
  function updateNavAvatar() {
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    var navEl = document.getElementById('nav-user-avatar');
    if (navEl) {
      navEl.innerHTML = u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '" alt="">' : initial;
      var navPf = getProfileFrame(MStore.settings);
      var navFrame = navEl.parentNode.querySelector('.pfp-frame');
      if (navPf > 0) {
        if (!navFrame) {
          navFrame = document.createElement('img');
          navFrame.className = 'pfp-frame';
          navFrame.draggable = false;
          navFrame.alt = '';
          navEl.parentNode.appendChild(navFrame);
        }
        navFrame.src = 'icons/frames/pfp_frame_' + navPf + '.png';
      } else if (navFrame) {
        navFrame.remove();
      }
    }

    var headerEl = document.getElementById('panel-header-avatar');
    if (headerEl) {
      headerEl.innerHTML = u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial;
    }

    // The header account avatar is the live one (the elements above are legacy
    // from the desktop layout and are not in the mobile DOM). Keeping the sync
    // here means every existing updateNavAvatar() call site refreshes it.
    if (window.OrbitNav && window.OrbitNav.syncAvatar) window.OrbitNav.syncAvatar();
  }

  /* ─── Settings Panel (simplified main view) ─── */
  /**
   * Diagnostics — the screen that answers "why can't I see anyone?".
   *
   * A LAN app fails for reasons that are invisible from inside the app: AP isolation
   * on the router, a host firewall, two devices on different subnets, a port already
   * taken. From the user's side they all look identical — nobody shows up — and each
   * one needs a different fix. This reports what the app can actually observe and
   * names the likely cause, instead of leaving someone to guess.
   */
  function _diagRows() {
    var P2P = (window.Orbit && Orbit.P2P) || null;
    var rows = [];

    var transport = P2P && typeof P2P.isAvailable === 'function' ? !!P2P.isAvailable() : false;
    rows.push({
      ok: transport,
      label: 'Networking',
      value: transport ? 'available' : 'unavailable',
      hint: transport ? '' : 'The native networking plugin did not start. Reinstall, or check that Orbit has not been restricted in Android settings.'
    });

    var discovery = false;
    try { discovery = !!(P2P && typeof P2P.isDiscoveryActive === 'function' && P2P.isDiscoveryActive()); } catch (e) {}
    rows.push({
      ok: discovery,
      label: 'Peer discovery',
      value: discovery ? 'running' : 'stopped',
      hint: discovery ? '' : 'Orbit is not announcing itself, so nearby peers cannot find you. Toggle it from the home screen, and check that Wi-Fi is on.'
    });

    var port = (MStore.settings && MStore.settings.tcpPort) || 0;
    rows.push({
      ok: !!port,
      label: 'Listening port',
      value: port ? String(port) : 'not set',
      hint: port ? '' : 'No port configured. Messages can still be sent, but nobody can reach you first.'
    });

    var friends = (MStore.friends || []).length;
    var online = 0;
    try {
      online = (MStore.friends || []).filter(function(f) {
        return f.status === 'online' || f.online || (P2P && P2P.isPeerConnected && P2P.isPeerConnected(f.id));
      }).length;
    } catch (e) {}
    rows.push({
      ok: friends === 0 || online > 0,
      label: 'Peers',
      value: online + ' of ' + friends + ' reachable',
      hint: (friends > 0 && online === 0)
        ? 'None of your contacts are reachable. On a home or office network the usual causes are wireless isolation on the router (devices cannot see each other), a firewall on the other machine, or the two devices being on different subnets.'
        : ''
    });

    var conns = 0;
    try { conns = (P2P && typeof P2P.getConnections === 'function' ? (P2P.getConnections() || []).length : 0); } catch (e) {}
    rows.push({ ok: conns > 0, label: 'Open connections', value: String(conns), hint: '' });

    // "Waiting to send" used to report the outbox, which is no longer in the send path
    // — the transport owns queueing. The row could therefore only ever read zero, which
    // is worse than not showing it. The receive limit is the genuinely useful number
    // here: it is what refuses a large file.
    rows.push({
      ok: true,
      label: 'Largest file it will accept',
      value: '~150 MB',
      hint: ''
    });

    return rows;
  }

  function renderDiagnostics() {
    var rows = _diagRows();
    var html = '';

    var problem = null;
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i].ok && rows[i].hint) { problem = rows[i]; break; }
    }

    // No section title. The screen header already says "Diagnostics", so a title
    // repeating it four lines lower was pure duplication.
    //
    // A hero that states the verdict, then the checks as ONE group, then the
    // report. Before this the checks were bare rows floating on the background
    // with no container, and everything sat in the top third of a screen with
    // nothing under it.
    var bad = 0;
    for (var k = 0; k < rows.length; k++) if (!rows[k].ok) bad++;

    html += '<div class="diag-hero' + (problem ? ' diag-hero-bad' : '') + '">' +
      '<div class="diag-hero-icon"><i data-lucide="' + (problem ? 'alert-triangle' : 'check-circle-2') + '"></i></div>' +
      '<div class="diag-hero-text">' +
        '<div class="diag-hero-title">' +
          (problem ? 'Something needs a look' : 'Everything checks out') +
        '</div>' +
        '<div class="diag-hero-sub">' +
          (problem
            ? escapeHtml(problem.label + ' is the first thing to look at.')
            : 'Orbit can reach what it needs to.') +
        '</div>' +
      '</div>' +
      '<div class="diag-hero-count">' + (rows.length - bad) + '/' + rows.length + '</div>' +
    '</div>';

    html += '<div class="diag-group">';
    html += '<div class="diag-group-label">Checked</div>';
    html += '<div class="diag-list">';
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      html += '<div class="diag-row' + (r.ok ? '' : ' diag-row-bad') + '">' +
        '<span class="diag-dot" aria-hidden="true"></span>' +
        '<span class="diag-label">' + escapeHtml(r.label) + '</span>' +
        '<span class="diag-value">' + escapeHtml(r.value) + '</span>' +
      '</div>';
      if (r.hint) {
        html += '<div class="diag-hint">' + escapeHtml(r.hint) + '</div>';
      }
    }
    html += '</div>';
    html += '</div>';

    // The report, shown rather than only described. "Copy these values" is a
    // promise about content you could not see; a monospace block of the actual
    // text is the same promise kept, and it is what the empty half of this
    // screen should have been holding all along.
    html += '<div class="diag-group">' +
      '<div class="diag-group-head">' +
        '<span class="diag-group-label">Report</span>' +
        '<button class="settings-action-btn" id="diag-copy">Copy</button>' +
      '</div>' +
      '<div class="diag-group-sub">Paste this into a bug report. It carries no message content.</div>' +
      '<pre class="diag-report" id="diag-report-preview">' + escapeHtml(_diagReportText()) + '</pre>' +
    '</div>';

    return html;
  }

  /**
   * The exact text the Copy button puts on the clipboard.
   *
   * One builder, used by both the button and the on-screen preview — they were
   * two separate loops and would have drifted the first time either changed.
   * The `label=value` shape is what people have been pasting into reports, so it
   * is kept as it was.
   */
  function _diagReportText() {
    var rows = _diagRows();
    var lines = ['Orbit diagnostics', 'version=' + (window.APP_VERSION || '?'),
                 'platform=' + (window.Capacitor ? 'android' : 'web')];
    rows.forEach(function(r) { lines.push(r.label + '=' + r.value); });
    lines.push('friends=' + ((MStore.friends || []).length));
    lines.push('chats=' + ((MStore.chats || []).length));
    return lines.join('\n');
  }

  function _diagCopy() {
    var text = _diagReportText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { showToast('Diagnostics copied', 'success'); },
                                                 function() { showToast('Could not copy', 'error'); });
        return;
      }
    } catch (e) {}
    showToast('Copy is unavailable in this WebView', 'warning');
  }

  function renderSettings() {
    try { updateNavAvatar(); } catch(e) { console.error('[Orbit] updateNavAvatar error:', e); }
    
    var container = document.getElementById('settings-content');
    if (!container) {
      console.error('[Orbit] settings-content not found');
      return;
    }
    
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    var sPfNum = 0;
    try { sPfNum = getProfileFrame(MStore.settings); } catch(e) {}
    
    var sPfHtml = sPfNum > 0 ? '<img src="icons/frames/pfp_frame_' + sPfNum + '.png" class="pfp-frame" draggable="false" alt="">' : '';
    
    container.innerHTML =
      '<div class="settings-profile-card" id="settings-profile-card">' +
        '<div style="position:relative;display:inline-flex;">' +
          '<div class="settings-profile-avatar">' + (u && u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : initial) + '</div>' +
          sPfHtml +
        '</div>' +
        '<div class="settings-profile-info">' +
          '<div class="settings-profile-name">' + escapeHtml(u && u.name ? u.name : 'User') + '</div>' +
          '<div class="settings-profile-tag">#' + escapeHtml(u && u.tag ? u.tag : '0000') + '</div>' +
        '</div>' +
        '<i data-lucide="chevron-right" class="settings-profile-arrow"></i>' +
      '</div>' +
      '<div class="settings-link-card" id="open-settings-overlay">' +
        '<i data-lucide="settings" class="settings-link-icon"></i>' +
        '<span class="settings-link-text">All Settings</span>' +
        '<i data-lucide="chevron-right" class="settings-link-arrow"></i>' +
      '</div>';

    try {
      document.getElementById('settings-profile-card').addEventListener('click', showProfile);
      document.getElementById('open-settings-overlay').addEventListener('click', showSettingsOverlay);
      renderLucide({ root: container });
    } catch(e) {
      console.error('[Orbit] settings listeners error:', e);
    }
  }

  /* ─── Settings Overlay ─── */
  var SETTINGS_SECTIONS = [
    { key: 'appearance', icon: 'palette', title: 'Appearance', desc: 'Theme, message bubbles, 24-hour time' },
    { key: 'chat', icon: 'message-square', title: 'Chat', desc: 'Enter to send, avatars, image previews' },
    { key: 'notifications', icon: 'bell', title: 'Notifications', desc: 'Sounds, DND, @mentions' },
    { key: 'privacy', icon: 'shield', title: 'Privacy & Security', desc: 'Encryption, auto-delete' },
    { key: 'network', icon: 'wifi', title: 'Network', desc: 'Ports, file size, add friend' },
    { key: 'vault', icon: 'database-backup', title: 'Local Vault', desc: 'Encrypted local backup & restore' },
    { key: 'diagnostics', icon: 'activity', title: 'Diagnostics', desc: 'Connection health and what might be blocking it' },
    { key: 'about', icon: 'info', title: 'About', desc: 'Version, statistics' },
    { key: 'advanced', icon: 'terminal', title: 'Advanced', desc: 'Developer tools, experimental features' }
  ];

  function showSettingsOverlay() {
    var overlay = document.getElementById('panel-settings-overlay');
    var backdrop = document.getElementById('settings-overlay-backdrop');
    overlay.classList.add('open');
    backdrop.style.display = 'block';
    backdrop.style.transition = 'opacity 0.2s ease';
    backdrop.style.opacity = '0';
    void backdrop.offsetHeight;
    backdrop.style.opacity = '1';
    setTimeout(function() { backdrop.style.transition = ''; }, 200);
    var _elmobilenav3 = document.getElementById('mobile-nav');
    if (_elmobilenav3) _elmobilenav3.classList.add('nav-hidden');
    _settingsOverlayOpen = true;
    var _pillStt = document.getElementById('profile-pill');
    if (_pillStt) { _pillStt.style.opacity = '0'; _pillStt.style.pointerEvents = 'none'; }
    _settingsInSection = false;
    renderSettingsOverview();
  }

  function hideSettingsOverlay() {
    var overlay = document.getElementById('panel-settings-overlay');
    var backdrop = document.getElementById('settings-overlay-backdrop');
    if (!overlay || !overlay.classList.contains('open')) return;
    
    overlay.classList.remove('open');
    backdrop.style.transition = 'opacity 0.2s ease';
    backdrop.style.opacity = '0';
    
    setTimeout(function() {
      backdrop.style.display = 'none';
      backdrop.style.opacity = '';
      backdrop.style.transition = '';
      var _elmobilenav4 = document.getElementById('mobile-nav');
      if (_elmobilenav4) _elmobilenav4.classList.remove('nav-hidden');
      var _pillStt2 = document.getElementById('profile-pill');
      if (_pillStt2) { _pillStt2.style.opacity = ''; _pillStt2.style.pointerEvents = ''; }
    }, 280);
    
    _settingsOverlayOpen = false;
    _settingsInSection = false;
  }

  /* ─── Network Map (Settings → Network) ─── */
  function _netMapHash(s) {
    var h = 5381;
    var str = String(s || '');
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
    }
    return Math.abs(h);
  }

  function _netMapAngle(peerId) {
    // Stable angle from peerId hash — deterministic layout across redraws
    return (_netMapHash(peerId) % 6283) / 1000;
  }

  function _netMapColor(seed) {
    // Hues drawn from the app's accent family (blue/violet/pink/cyan/orange)
    var hues = [210, 260, 320, 180, 30, 90, 140];
    return 'hsl(' + hues[_netMapHash(seed) % hues.length] + ', 75%, 58%)';
  }

  function _netMapIsConnected(peerId, friend) {
    if (!window.Orbit || !Orbit.P2P) return false;
    if (Orbit.P2P.isPeerConnected(peerId)) return true;
    if (friend) {
      if (friend.connectionId && Orbit.P2P.isPeerConnected(friend.connectionId)) return true;
      if (friend.ip && Orbit.P2P.isPeerConnected(friend.ip)) return true;
    }
    return false;
  }

  function _netMapTransfers() {
    // Returns { anyActive, someMatched, byPeer: { peerId: {fileName, percent} } }
    var out = { anyActive: false, someMatched: false, byPeer: {} };
    var txMap = out.byPeer;
    // Incoming transfers: window.activeTransfers keyed by fileId, carry senderId
    if (window.activeTransfers) {
      Object.keys(window.activeTransfers).forEach(function(fileId) {
        var tx = window.activeTransfers[fileId];
        if (!tx) return;
        out.anyActive = true;
        var pid = tx.senderId;
        if (pid && !txMap[pid]) {
          txMap[pid] = {
            fileName: tx.fileName || 'file',
            percent: tx.total ? Math.round((tx.received / tx.total) * 100) : 0
          };
        }
      });
    }
    // Outgoing transfers: window.activeSends keyed fileId + '::' + peerId
    if (window.activeSends) {
      Object.keys(window.activeSends).forEach(function(sendKey) {
        var sess = window.activeSends[sendKey];
        if (!sess || sess.done || sess.cancelled) return;
        out.anyActive = true;
        var pid = sess.peerId;
        if (pid && !txMap[pid]) {
          var fname = sess.att && sess.att.name ? sess.att.name :
            (sess.startPayload && sess.startPayload.fileName ? sess.startPayload.fileName : 'file');
          txMap[pid] = {
            fileName: fname,
            percent: sess.total ? Math.round((sess.ci / sess.total) * 100) : 0
          };
        }
      });
    }
    return out;
  }

  /* ══ The image viewer ══════════════════════════════════════════════════════
     Opened from a picture in the chat. It walks the images of THAT MESSAGE —
     the group you tapped in — because that is the set the grid put in front of
     you, and it is the one a swipe is expected to move through.

     State is deliberately tiny: which message, which index, and how far in.
     Everything on screen is derived from those three, so the buttons, the
     counter and the picture cannot disagree. */
  var _viewer = { msg: null, list: [], index: 0, scale: 1, tx: 0, ty: 0, springBack: null };
  var VIEWER_MIN = 1;     // fully out — below this it springs back
  var VIEWER_MAX = 4;

  function openImageViewer(msg, attId) {
    var list = (msg.attachments || []).filter(function(a) { return a.type === 'image' && a.url; });
    if (!list.length) return;
    var idx = list.findIndex(function(a) { return String(a.id) === String(attId); });
    _viewer.msg = msg;
    _viewer.list = list;
    _viewer.index = idx < 0 ? 0 : idx;
    _resetViewerZoom();
    _renderViewer();
    document.getElementById('image-preview-overlay').classList.add('open');
    if (window.lucide) { try { window.lucide.createIcons({ root: document.getElementById('image-preview-overlay') }); } catch (e) {} }
  }

  function _resetViewerZoom() {
    _viewer.scale = 1; _viewer.tx = 0; _viewer.ty = 0;
    if (_viewer.springBack) { clearTimeout(_viewer.springBack); _viewer.springBack = null; }
    _applyViewerTransform();
  }

  function _applyViewerTransform() {
    var img = document.getElementById('image-preview-img');
    var overlay = document.getElementById('image-preview-overlay');
    if (!img || !overlay) return;
    img.style.transform = 'translate(' + _viewer.tx + 'px,' + _viewer.ty + 'px) scale(' + _viewer.scale + ')';
    overlay.classList.toggle('is-zoomed', _viewer.scale !== 1);
    var out = document.getElementById('btn-zoom-out');
    if (out) out.disabled = false;
  }

  /** Paint everything from the state — picture, counter, and which ends are live. */
  function _renderViewer() {
    var overlay = document.getElementById('image-preview-overlay');
    var img = document.getElementById('image-preview-img');
    if (!overlay || !img) return;
    var cur = _viewer.list[_viewer.index];
    if (!cur) return;
    img.src = cur.url;
    img.alt = cur.name || 'Image';

    var single = _viewer.list.length < 2;
    overlay.classList.toggle('is-single', single);

    var counter = document.getElementById('image-viewer-counter');
    if (counter) counter.textContent = (_viewer.index + 1) + ' of ' + _viewer.list.length;

    // At the ends the buttons stay in place but go dead — moving them would shift
    // the layout under a thumb that is mid-tap.
    var prev = document.getElementById('btn-prev-image');
    var next = document.getElementById('btn-next-image');
    if (prev) prev.disabled = single || _viewer.index === 0;
    if (next) next.disabled = single || _viewer.index === _viewer.list.length - 1;

    var dl = document.getElementById('btn-download-image');
    if (dl) {
      dl.disabled = false;
      dl.classList.remove('is-done');
      var lbl = dl.querySelector('.viewer-dl-label');
      if (lbl) lbl.textContent = '';
      dl.style.minWidth = '44px';
    }
    _resetViewerZoom();
  }

  function _viewerStep(dir) {
    var next = _viewer.index + dir;
    if (next < 0 || next >= _viewer.list.length) return;
    _viewer.index = next;
    _renderViewer();
  }

  /**
   * Zoom by a step.
   *
   * Dan's rule for the ends: zoomed IN, stepping out to 1 stops there — that is
   * the picture's own size and going below it is not useful. At 1, stepping out
   * DOES shrink it, but only briefly: it springs back after a moment. So the
   * gesture always answers, and you cannot end up stuck looking at a thumbnail.
   */
  function _viewerZoom(delta) {
    if (_viewer.springBack) { clearTimeout(_viewer.springBack); _viewer.springBack = null; }
    var from = _viewer.scale;
    var to = Math.max(VIEWER_MIN * 0.6, Math.min(VIEWER_MAX, from + delta));
    if (to > 1) to = Math.max(1, to);
    _viewer.scale = to;
    if (to <= 1) { _viewer.tx = 0; _viewer.ty = 0; }
    _applyViewerTransform();
    if (to < 1) {
      // Below the original size: hold it, then let go.
      _viewer.springBack = setTimeout(function() {
        _viewer.springBack = null;
        _viewer.scale = 1; _viewer.tx = 0; _viewer.ty = 0;
        _applyViewerTransform();
      }, 1400);
    }
  }

  /** Two fingers: pinch to zoom, drag to pan once in. */
  function _bindViewerGestures() {
    var overlay = document.getElementById('image-preview-overlay');
    var img = document.getElementById('image-preview-img');
    if (!overlay || !img || overlay._gesturesBound) return;
    overlay._gesturesBound = true;

    var startDist = 0, startScale = 1, startX = 0, startY = 0, panFrom = null, pinchMid = null;

    var dist = function(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    overlay.addEventListener('touchstart', function(e) {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startScale = _viewer.scale;
        pinchMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        panFrom = null;
        if (_viewer.springBack) { clearTimeout(_viewer.springBack); _viewer.springBack = null; }
      } else if (e.touches.length === 1 && _viewer.scale > 1) {
        panFrom = { x: e.touches[0].clientX - _viewer.tx, y: e.touches[0].clientY - _viewer.ty };
      }
    }, { passive: true });

    overlay.addEventListener('touchmove', function(e) {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault();
        var scale = Math.max(1, Math.min(VIEWER_MAX, startScale * (dist(e.touches) / startDist)));
        _viewer.scale = scale;
        if (scale === 1) { _viewer.tx = 0; _viewer.ty = 0; }
        _applyViewerTransform();
      } else if (e.touches.length === 1 && panFrom) {
        e.preventDefault();
        _viewer.tx = e.touches[0].clientX - panFrom.x;
        _viewer.ty = e.touches[0].clientY - panFrom.y;
        _applyViewerTransform();
      }
    }, { passive: false });

    overlay.addEventListener('touchend', function() {
      startDist = 0; panFrom = null; pinchMid = null;
    }, { passive: true });
  }

  /** Keep the file. The label carries the state, because a spinner on a button
   *  this small is noise and the words are clearer. */
  function _downloadViewerImage() {
    var cur = _viewer.list[_viewer.index];
    if (!cur || !cur.url) return;
    var btn = document.getElementById('btn-download-image');
    var lbl = btn ? btn.querySelector('.viewer-dl-label') : null;
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    if (lbl) lbl.textContent = 'Downloading';
    btn.style.minWidth = btn.offsetWidth + 'px';

    var done = function(ok) {
      if (lbl) lbl.textContent = ok ? 'Downloaded' : 'Failed';
      if (ok) btn.classList.add('is-done');
      setTimeout(function() {
        btn.disabled = false;
        btn.classList.remove('is-done');
        if (lbl) lbl.textContent = '';
        btn.style.minWidth = '44px';
      }, 2000);
    };

    var name = cur.name || ('orbit-image-' + Date.now() + '.png');
    fetch(cur.url)
      .then(function(r) { return r.blob(); })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 4000);
        done(true);
      })
      .catch(function() { done(false); });
  }

  function _bindImageViewer() {
    var overlay = document.getElementById('image-preview-overlay');
    if (!overlay || overlay._bound) return;
    overlay._bound = true;
    var on = function(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function(e) { e.stopPropagation(); fn(); });
    };
    on('btn-close-image-preview', function() {
      _resetViewerZoom();
      overlay.classList.remove('open');
    });
    on('btn-prev-image', function() { _viewerStep(-1); });
    on('btn-next-image', function() { _viewerStep(1); });
    on('btn-zoom-in', function() { _viewerZoom(0.5); });
    on('btn-zoom-out', function() { _viewerZoom(-0.5); });
    on('btn-download-image', _downloadViewerImage);
    // Tapping the backdrop closes; tapping the picture must not.
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay || e.target.id === 'image-preview-wrap') {
        _resetViewerZoom();
        overlay.classList.remove('open');
      }
    });
    _bindViewerGestures();
  }
  window.openImageViewer = openImageViewer;

  /**
   * The avatar images the network map draws, keyed by URL.
   *
   * The map is a CANVAS, so an avatar is an image the draw loop has to have
   * already decoded — it cannot be a lazy <img> the browser fills in later. Each
   * entry is `{ img, ok }`; `ok` flips when it loads, and because the map redraws
   * on a one-second interval the picture appears on the next tick with no
   * scheduling of its own. A URL that fails is remembered as failed so it is not
   * retried every second forever, and the node falls back to the initial.
   */
  var _netMapAvatarCache = {};
  function _netMapAvatar(url) {
    if (!url) return null;
    var hit = _netMapAvatarCache[url];
    if (hit) return hit.ok ? hit.img : null;
    var entry = { img: new Image(), ok: false };
    _netMapAvatarCache[url] = entry;
    entry.img.onload = function () { entry.ok = entry.img.naturalWidth > 0; };
    entry.img.onerror = function () { entry.ok = false; };
    entry.img.src = url;
    // A data: URL or a cached image can be complete before onload is attached.
    if (entry.img.complete && entry.img.naturalWidth > 0) entry.ok = true;
    return entry.ok ? entry.img : null;
  }

  /**
   * Draw a node as a circular avatar, or its initial when there is no picture.
   * The caller has already set up the arc; this fills it.
   */
  function _netMapNodeFace(ctx, img, initial, x, y, r, fallbackFill) {
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      // Cover the circle, so a non-square avatar is not squashed.
      var scale = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
      var w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fallbackFill;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, x, y + 1);
    }
  }

  function drawNetworkMap() {
    var canvas = document.getElementById('network-map-canvas-mobile');
    if (!canvas) return;
    // Only redraw while the settings overlay is actually showing the section
    if (!_settingsOverlayOpen || !_settingsInSection) return;
    var block = canvas.parentNode;
    if (!block) return;
    var width = block.clientWidth;
    if (!width) return; // lazily drawn on the first visible tick
    var dpr = window.devicePixelRatio || 1;
    var height = 220;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var cx = width / 2;
    var cy = height / 2;
    var radius = Math.min(85, width / 2 - 46);

    // Peers: friends first, then any connected ids not already known
    var peers = [];
    var seen = {};
    (MStore.friends || []).forEach(function(f) {
      var pid = f.id || f.peerId || '';
      if (!pid || seen[pid]) return;
      seen[pid] = true;
      peers.push({ id: pid, friend: f });
    });
    if (window.Orbit && Orbit.P2P && Orbit.P2P.getConnections) {
      var connIds = Orbit.P2P.getConnections() || [];
      connIds.forEach(function(cid) {
        if (!cid || seen[cid]) return;
        seen[cid] = true;
        peers.push({ id: cid, friend: null });
      });
    }

    var transfers = _netMapTransfers();
    var someMatched = peers.some(function(p) { return transfers.byPeer[p.id]; });
    var now = Date.now();

    // Edges (self → peer)
    peers.forEach(function(peer) {
      var angle = _netMapAngle(peer.id);
      var px = cx + Math.cos(angle) * radius;
      var py = cy + Math.sin(angle) * radius;
      peer._x = px;
      peer._y = py;
      var connected = _netMapIsConnected(peer.id, peer.friend);
      var tf = transfers.byPeer[peer.id] || null;
      var pulse = !!tf || (transfers.anyActive && !someMatched);
      var alpha = connected ? 0.9 : 0.35;
      if (pulse) alpha = 0.5 + 0.5 * Math.abs(Math.sin(now / 400)); // activity pulse
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.strokeStyle = connected ? 'rgba(10,132,255,' + alpha.toFixed(3) + ')' : 'rgba(150,150,160,' + alpha.toFixed(3) + ')';
      ctx.lineWidth = pulse ? 2.5 : (connected ? 1.8 : 1.2);
      if (!connected && !pulse) ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Self node
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,132,255,0.25)';
    ctx.fill();
    var myInitial = MStore.user && MStore.user.name ? MStore.user.name.charAt(0).toUpperCase() : 'Y';
    // Your own picture, falling back to your initial. The ring is drawn after,
    // so it sits on top of the avatar rather than under it.
    ctx.font = '600 13px "DM Sans", sans-serif';
    _netMapNodeFace(ctx, _netMapAvatar(MStore.user && MStore.user.avatar), myInitial, cx, cy, 13, '#0A84FF');
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('You', cx, cy + 28);

    // Peer nodes + labels
    peers.forEach(function(peer) {
      var px = peer._x;
      var py = peer._y;
      var connected = _netMapIsConnected(peer.id, peer.friend);
      var name = peer.friend ? (peer.friend.name || peer.id) : peer.id;
      var letter = name.charAt(0).toUpperCase();
      // A friend with a picture shows it; otherwise the coloured initial, which
      // is what every node used to be.
      var peerFill = peer.friend ? _netMapColor(peer.id) : '#8E8E93';
      ctx.font = '600 12px "DM Sans", sans-serif';
      _netMapNodeFace(ctx, _netMapAvatar(peer.friend && peer.friend.avatar), letter, px, py, 13, peerFill);
      ctx.beginPath();
      ctx.arc(px, py, 13, 0, Math.PI * 2);
      ctx.strokeStyle = connected ? 'rgba(10,132,255,0.9)' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      var label = name.length > 12 ? name.slice(0, 12) + '…' : name;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.fillText(label, px, py + 26);
      var tf = transfers.byPeer[peer.id] || null;
      if (tf) {
        ctx.fillStyle = '#0A84FF';
        ctx.font = '600 10px "DM Sans", sans-serif';
        var shortName = tf.fileName.length > 14 ? tf.fileName.slice(0, 14) + '…' : tf.fileName;
        ctx.fillText(shortName + ' ' + tf.percent + '%', px, py + 40);
      }
    });

    // Status line under the canvas
    var statusEl = document.getElementById('network-map-status');
    if (statusEl) {
      var connectedCount = 0;
      peers.forEach(function(p) { if (_netMapIsConnected(p.id, p.friend)) connectedCount++; });
      statusEl.textContent = 'Connected: ' + connectedCount + ' · Peers: ' + peers.length;
    }
  }

  function ensureNetworkMapInterval() {
    if (window._netmapInterval) return; // single interval, guarded like other app intervals
    window._netmapInterval = setInterval(function() {
      try {
        drawNetworkMap();
      } catch(e) {
        console.warn('[Orbit] network map draw error:', e);
      }
    }, 1000);
  }

  function renderSettingsOverview() {
    document.getElementById('btn-settings-back').style.display = 'none';
    document.getElementById('settings-overlay-title').textContent = 'Settings';
    var container = document.getElementById('settings-overlay-content');
    renderSettingsOverviewInner(container, false);
  }

  function showSettingsSection(key) {
    var section = SETTINGS_SECTIONS.find(function(s) { return s.key === key; });
    if (!section) return;

    _settingsInSection = true;
    document.getElementById('btn-settings-back').style.display = '';
    document.getElementById('settings-overlay-title').textContent = section.title;
    document.getElementById('search-settings').value = '';

    var container = document.getElementById('settings-overlay-content');
    var s = MStore.settings;
    var html = renderSectionHtml(key, s);
    // renderSectionHtml emits bare .settings-item-card siblings with no wrapper,
    // so a section rendered edge-to-edge with hairline dividers instead of as a
    // card like the overview. Wrap them in the same card the overview uses.
    container.innerHTML =
      '<div class="settings-category-card settings-detail-card">' + html + '</div>';
    // Detail sections are full-bleed (see the CSS), which needs the container's
    // own side padding dropped. The overview still wants it.
    container.classList.add('settings-detail');
    container.classList.remove('settings-slide-left');
    container.classList.add('settings-slide-right');
    bindSectionEvents(key, s);
    renderLucide({ root: container });
  }

  function backSettingsOverview() {
    _settingsInSection = false;
    document.getElementById('btn-settings-back').style.display = 'none';
    document.getElementById('settings-overlay-title').textContent = 'Settings';
    document.getElementById('search-settings').value = '';
    var container = document.getElementById('settings-overlay-content');
    // Back to the overview, which is carded and needs the side padding back.
    container.classList.remove('settings-detail');
    renderSettingsOverviewInner(container, true);
  }

  function renderSettingsOverviewInner(container, animate) {
    var categories = [
      {
        label: 'General',
        items: [
          { key: 'appearance', icon: 'palette', title: 'Appearance', desc: 'Theme, message bubbles, 24-hour time' },
          { key: 'chat', icon: 'message-square', title: 'Chat', desc: 'Enter to send, avatars, image previews' },
          { key: 'notifications', icon: 'bell', title: 'Notifications', desc: 'Sounds, DND, @mentions' }
        ]
      },
      {
        label: 'Security',
        items: [
          { key: 'privacy', icon: 'shield', title: 'Privacy & Security', desc: 'Encryption, auto-delete' }
        ]
      },
      {
        label: 'Connection',
        items: [
          { key: 'network', icon: 'wifi', title: 'Network', desc: 'Ports, file size, add friend' },
          { key: 'vault', icon: 'database-backup', title: 'Local Vault', desc: 'Encrypted local backup & restore' }
        ]
      },
      {
        label: 'System',
        items: [
          { key: 'diagnostics', icon: 'activity', title: 'Diagnostics', desc: 'Connection health and what might be blocking it' },
    { key: 'about', icon: 'info', title: 'About', desc: 'Version, statistics' },
          { key: 'advanced', icon: 'terminal', title: 'Advanced', desc: 'Developer tools, experimental features' }
        ]
      }
    ];

    var html = '<div class="settings-section-list">';

    // The design puts your account at the very top of Settings, which also gives
    // the switcher a second entry point besides the header avatar.
    var _acct = MStore.activeAccount && MStore.activeAccount();
    if (_acct) {
      var _acctPic = _acct.avatar
        ? '<img src="' + escapeHtml(_acct.avatar) + '" alt="" ' +
          'style="width:48px;height:48px;border-radius:50%;object-fit:cover;">'
        : '<div class="acct-initial" style="width:48px;height:48px;font-size:17px;">' +
          escapeHtml(String(_acct.name || 'U').charAt(0).toUpperCase()) + '</div>';
      var _acctTag = String(_acct.name || '').toLowerCase() + (_acct.tag ? '#' + _acct.tag : '');
      // Profile frame, gated on the stable setting — the same rule the header
      // avatar and the chat rows use. It is drawn over the avatar, so it has to
      // sit inside .acct-pic and after the picture.
      var _acctFrame = 0;
      if (MStore.settings && MStore.settings.profileFrames) {
        _acctFrame = parseInt(MStore.settings.profileFrame, 10) || 0;
      }
      var _acctFrameHtml = _acctFrame > 0
        ? '<img class="pfp-frame" src="icons/frames/pfp_frame_' + _acctFrame +
          '.png" alt="" draggable="false">'
        : '';
      html +=
        '<div class="settings-account-row" id="settings-account-row" role="button" tabindex="0">' +
          '<div class="acct-pic">' + _acctPic + _acctFrameHtml +
            '<span class="presence ' + escapeHtml(_acct.status || 'offline') + '"></span></div>' +
          '<div class="acct-info">' +
            '<div class="acct-name">' + escapeHtml(_acct.name || 'User') + '</div>' +
            '<div class="acct-tag">' + escapeHtml(_acctTag) + '</div>' +
          '</div>' +
          '<span class="chev"><i data-lucide="chevron-right"></i></span>' +
        '</div>';
    }

    categories.forEach(function(cat) {
      html += '<div class="settings-category-header">' + cat.label + '</div>';
      html += '<div class="settings-category-card">';
      cat.items.forEach(function(sec, idx) {
        // Folders section is experimental — hide unless the experimental flag is on
        if (sec.key === 'folders' && !(MStore.settings && MStore.settings.experimentalFolders)) return;
        html +=
          '<div class="settings-section-card" data-section="' + sec.key + '">' +
            '<div class="settings-card-icon"><i data-lucide="' + sec.icon + '"></i></div>' +
            '<div class="settings-card-info">' +
              '<div class="settings-section-title" style="margin-bottom:2px;">' + sec.title + '</div>' +
              '<div class="settings-section-desc">' + sec.desc + '</div>' +
            '</div>' +
            '<i data-lucide="chevron-right" class="settings-section-arrow"></i>' +
          '</div>';
      });
      html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
    if (animate) {
      container.classList.remove('settings-slide-right');
      container.classList.add('settings-slide-left');
    }

    container.querySelectorAll('.settings-section-card').forEach(function(el) {
      el.addEventListener('click', function() {
        showSettingsSection(this.getAttribute('data-section'));
      });
    });

    var acctRow = container.querySelector('#settings-account-row');
    if (acctRow) {
      acctRow.addEventListener('click', function() {
        if (window.OrbitAccounts) window.OrbitAccounts.open();
      });
    }

    renderLucide({ root: container });
  }

  function renderSectionHtml(key, s) {
    function sel(name, id, current) {
      var h = '<select class="settings-select" id="' + id + '">';
      name.forEach(function(o) {
        h += '<option value="' + o.v + '"' + (o.v === current ? ' selected' : '') + '>' + escapeHtml(o.l) + '</option>';
      });
      return h + '</select>';
    }

    function card(icon, title, desc, actionHtml, searchExtra) {
      var search = escapeHtml(title + ' ' + desc + ' ' + (searchExtra || ''));
      return '<div class="settings-item-card" data-search="' + search + '">' +
        '<div class="settings-item-icon"><i data-lucide="' + icon + '"></i></div>' +
        '<div class="settings-item-info">' +
          '<span class="settings-item-title">' + escapeHtml(title) + '</span>' +
          '<span class="settings-item-desc">' + escapeHtml(desc) + '</span>' +
        '</div>' +
        '<div class="settings-item-action">' + actionHtml + '</div>' +
      '</div>';
    }

    var themeOptions = [
      { v: 'dark', l: 'Dark' }, { v: 'light', l: 'Light' }, { v: 'system', l: 'System' },
      { v: 'dark-purple', l: 'Dark Purple' }, { v: 'midnight', l: 'Midnight' },
      { v: 'sunset', l: 'Sunset' }, { v: 'nord', l: 'Nord' }, { v: 'seasonal', l: 'Seasonal' }
    ];

    switch (key) {
      case 'appearance':
        return card('palette', 'Theme', 'Dark, light, or colorful presets',
          sel(themeOptions, 'set-theme', s.theme || 'dark')) +
        card('message-square', 'Message Bubbles', 'Modern rounded or compact bubbles',
          sel([{v:'Modern',l:'Modern'},{v:'Compact',l:'Compact'}], 'set-bubbles', s.messageBubbles || 'Modern')) +
        card('clock', '24-Hour Time', 'Show times in 24-hour format',
          '<button class="settings-toggle ' + (s.timeFormat24 ? 'on' : '') + '" id="set-24h"></button>') +
        card('sparkles', 'Animations', 'Enable UI animations and transitions',
          '<button class="settings-toggle ' + (s.animations !== false ? 'on' : '') + '" id="set-animations"></button>') +
        card('zap', 'Animation Speed', 'How fast animations play',
          sel([{v:'normal',l:'Normal'},{v:'fast',l:'Fast'},{v:'instant',l:'Instant'}], 'set-anim-speed', s.animSpeed || 'normal')) +
        card('type', 'Font Size', 'Adjust chat text size',
          sel([{v:'Small',l:'Small'},{v:'Medium',l:'Medium'},{v:'Large',l:'Large'}], 'set-font-size', s.fontSize || 'Medium')) +
        card('activity', 'Reduce Motion', 'Disable animations, freeze GIF previews, and stop avatar effects',
          '<button class="settings-toggle ' + (s.reduceMotion ? 'on' : '') + '" id="set-reduce-motion"></button>') +
        card('maximize-2', 'App Zoom', 'Zoom the entire app interface',
          '<div style="display:flex;align-items:center;gap:6px;width:140px;"><input type="range" min="80" max="150" value="' + (s.appZoom || 100) + '" class="settings-slider" id="set-zoom" style="flex:1;height:4px;"><span id="zoom-val-label" style="font-size:12px;min-width:36px;text-align:right;font-weight:600;color:var(--accent-primary);">' + (s.appZoom || 100) + '%</span></div>') +
        card('sun', 'Disable Light Mode Flashbang', 'Skip the white flash when switching to Light Mode',
          '<button class="settings-toggle ' + (s.noFlashbang ? 'on' : '') + '" id="set-nobang"></button>') +
        card('frame', 'Profile Frames', 'Overlay decorative frames on avatars',
          '<button class="settings-toggle ' + (s.profileFrames ? 'on' : '') + '" id="set-profile-frames"></button>');
      case 'chat':
        return card('corner-down-left', 'Enter to Send', 'Press Enter to send messages',
          '<button class="settings-toggle ' + (s.enterToSend ? 'on' : '') + '" id="set-enter-send"></button>') +
        card('arrow-left', 'Swipe to Reply', 'Swipe left on a message to reply',
          '<button class="settings-toggle ' + (s.swipeToReply !== false ? 'on' : '') + '" id="set-swipe-reply"></button>') +
        // Off by default. Deleting from the hold menu already covers this, so
        // undo is for people who send fast and regret fast — and it should not
        // put anything on screen for everyone else.
        card('undo-2', 'Undo Send', 'A short window to take a message back after sending',
          '<button class="settings-toggle ' + (s.undoSend ? 'on' : '') + '" id="set-undo-send"></button>') +
        card('users', 'Show Avatars', 'Show profile pictures in chats',
          '<button class="settings-toggle ' + (s.showChatAvatars !== false ? 'on' : '') + '" id="set-chat-avatars"></button>') +
        card('move-right', 'Message Animation', 'How new messages appear',
          sel([{v:'slide',l:'Slide'},{v:'fade',l:'Fade'}], 'set-msg-anim', s.messageAnim || 'slide')) +
        card('minimize-2', 'Compact Spacing', 'Tighter message layout',
          '<button class="settings-toggle ' + (s.experimentalCompactSpacing ? 'on' : '') + '" id="set-compact-spacing"></button>') +
        card('sparkles', 'Message Effects', 'Show sparkle animations on new messages',
          '<button class="settings-toggle ' + (s.messageFx ? 'on' : '') + '" id="set-message-fx"></button>') +
        card('grid', 'Background Pattern', 'Dots or Grid on chat background',
          sel([{v:'None',l:'None'},{v:'Dots',l:'Dots'},{v:'Grid',l:'Grid'}], 'set-pattern', s.bgPattern || 'None')) +
        card('image', 'Image Previews', 'Show inline image previews in chat',
          '<button class="settings-toggle ' + (s.showImagePreviews !== false ? 'on' : '') + '" id="set-image-previews"></button>') +
        card('link', 'Link Previews', 'Show rich previews for shared links',
          '<button class="settings-toggle ' + (s.showLinkPreviews !== false ? 'on' : '') + '" id="set-link-previews"></button>') +
        card('palette', 'Classic Bubbles', 'Colour your own messages with the accent',
          '<button class="settings-toggle ' + (s.classicBubbles ? 'on' : '') + '" id="set-classic-bubbles"></button>') +
        '<div class="settings-section-label">Translation</div>' +
        card('languages', 'Message Translation', 'Show translate button on messages',
          '<button class="settings-toggle ' + (s.messageTranslate ? 'on' : '') + '" id="set-message-translate"></button>') +
        card('globe', 'Target Language', 'Language to translate messages into',
          sel([{v:'',l:'Auto'},{v:'en',l:'English'},{v:'vi',l:'Vietnamese'},{v:'es',l:'Spanish'},{v:'fr',l:'French'},{v:'de',l:'German'},{v:'it',l:'Italian'},{v:'pt',l:'Portuguese'},{v:'ru',l:'Russian'},{v:'zh-CN',l:'Chinese (Simplified)'},{v:'zh-TW',l:'Chinese (Traditional)'},{v:'ja',l:'Japanese'},{v:'ko',l:'Korean'},{v:'ar',l:'Arabic'},{v:'hi',l:'Hindi'},{v:'tr',l:'Turkish'},{v:'nl',l:'Dutch'},{v:'pl',l:'Polish'},{v:'sv',l:'Swedish'},{v:'th',l:'Thai'},{v:'id',l:'Indonesian'},{v:'el',l:'Greek'},{v:'cs',l:'Czech'},{v:'ro',l:'Romanian'},{v:'uk',l:'Ukrainian'},{v:'hu',l:'Hungarian'},{v:'he',l:'Hebrew'},{v:'da',l:'Danish'},{v:'fi',l:'Finnish'},{v:'no',l:'Norwegian'},{v:'ms',l:'Malay'}], 'set-translate-target', s.translateTargetLang || '')) +
        card('search', 'Auto-Detect Source', 'Auto-detect message language instead of assuming English',
          '<button class="settings-toggle ' + (s.autoDetectSource !== false ? 'on' : '') + '" id="set-auto-detect"></button>');
      case 'notifications':
        return card('eye', 'Message Previews', 'Show message content in notifications',
          '<button class="settings-toggle ' + (s.notifyPreview !== false ? 'on' : '') + '" id="notify-preview"></button>') +
        card('bell', 'Notification Sound', 'Play sound on new messages',
          '<button class="settings-toggle ' + (s.notifySound ? 'on' : '') + '" id="notify-sound"></button>') +
        card('volume-2', 'Notification Volume', 'Volume level for notification sounds',
          '<div style="display:flex;align-items:center;gap:8px;"><input type="range" min="0" max="100" value="' + (s.notifyVolume || 80) + '" class="settings-slider" id="notify-volume" style="width:100px;"><span id="notify-volume-label" style="font-size:12px;min-width:32px;text-align:right;">' + (s.notifyVolume || 80) + '</span></div>') +
        card('music', 'Sound Type', 'Notification sound style',
          sel([{v:'chime',l:'Chime'},{v:'pop',l:'Pop'},{v:'gentle',l:'Gentle'},{v:'classic',l:'Classic'}], 'notify-sound-type', s.notifySoundType || 'chime')) +
        card('moon', 'Do Not Disturb', 'Mute all notifications',
          '<button class="settings-toggle ' + (s.notifyDnd ? 'on' : '') + '" id="notify-dnd"></button>') +
        card('at-sign', '@Mentions Only', 'Only notify when mentioned in groups',
          '<button class="settings-toggle ' + (s.notifyGroupMentions ? 'on' : '') + '" id="notify-mentions"></button>');
      case 'privacy':
        // App Lock sits first: it is the only thing here that stops someone
        // reading your messages with the phone in their hand. Everything below
        // it protects the data on disk.
        return card('lock-keyhole', 'App Lock', _appLockDesc(),
          '<button class="settings-toggle ' + (_appLockOn() ? 'on' : '') + '" id="set-app-lock"></button>') +
        (_appLockOn() ? (
          card('timer', 'Lock When Backgrounded', 'Ask for the PIN when you come back to Orbit',
            '<button class="settings-toggle ' + (s.appLock && s.appLock.lockOnBackground !== false ? 'on' : '') + '" id="set-app-lock-bg"></button>') +
          '<div id="row-change-pin" data-search="Change PIN app lock" style="cursor:pointer;">' +
            card('key-round', 'Change PIN', 'Set a new PIN',
              '<div class="settings-item-action"><i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);"></i></div>') +
          '</div>'
        ) : '') +
        card('shield', 'Privacy Mode', 'Attachments not saved to database',
          '<button class="settings-toggle ' + (s.privacyMode ? 'on' : '') + '" id="set-privacy"></button>') +
        card('lock', 'End-to-End Encryption', 'AES-256-GCM for direct messages',
          '<button class="settings-toggle ' + (s.e2eeEnabled ? 'on' : '') + '" id="set-e2ee"></button>') +
        card('trash-2', 'Auto-Delete Attachments', 'Auto-remove sent attachments after time',
          sel([
            {v:'0',l:'Never'},{v:'1',l:'1 min'},{v:'5',l:'5 min'},
            {v:'10',l:'10 min'},{v:'25',l:'25 min'},{v:'60',l:'60 min'}
          ], 'set-delete-after', String(s.deleteAttachmentsAfter || 0)));
      case 'network':
        return '<div class="settings-section-label">Network Map</div>' +
        '<div class="network-map-block" data-search="Network Map visualize peer connections">' +
          '<canvas id="network-map-canvas-mobile" width="0" height="0"></canvas>' +
          '<div class="network-map-status" id="network-map-status">Connected: 0 · Peers: 0</div>' +
        '</div>' +
        card('radio', 'Network Mode', 'Connection discovery method',
          sel([{v:'LAN Auto-Discovery',l:'LAN Auto-Discovery'},{v:'Custom IP',l:'Custom IP'}], 'net-mode', s.networkMode || 'LAN Auto-Discovery')) +
        card('wifi', 'UDP Discovery Port', 'Port for peer discovery',
          '<input type="number" class="settings-input" id="net-udp" value="' + (s.udpPort || 45678) + '">') +
        card('git-branch', 'TCP Connection Port', 'Port for direct connections',
          '<input type="number" class="settings-input" id="net-tcp" value="' + (s.tcpPort || 46000) + '">') +
        card('hard-drive', 'Max File Size', 'Megabytes',
          '<input type="number" class="settings-input" id="net-maxsize" value="' + (s.maxFileSize || 500) + '">') +
        card('refresh-cw', 'Auto-Reconnect', 'Reconnect dropped P2P connections',
          '<button class="settings-toggle ' + (s.netAutoReconnect !== false ? 'on' : '') + '" id="net-autoreconnect"></button>') +
        card('timer', 'Connection Timeout', 'Seconds',
          sel([{v:'5',l:'5s'},{v:'10',l:'10s'},{v:'30',l:'30s'},{v:'60',l:'60s'}], 'net-timeout', String(s.netTimeout || 30))) +
        card('repeat', 'Reconnect Interval', 'Seconds between reconnect attempts',
          '<input type="number" class="settings-input" id="net-reconnect-interval" value="' + (s.netReconnectInterval || 10) + '" min="1">') +
        card('heart', 'Keep-Alive Interval', 'Ping interval for active connections',
          sel([{v:'10',l:'10s'},{v:'30',l:'30s'},{v:'60',l:'60s'},{v:'120',l:'120s'}], 'net-keepalive', String(s.netKeepAlive || 30))) +
        card('share-2', 'WebRTC Fallback', 'Use WebRTC when direct TCP fails',
          '<button class="settings-toggle ' + (s.webrtcFallback !== false ? 'on' : '') + '" id="net-webrtc"></button>') +
        card('terminal', 'Log Level', 'Verbosity of connection logs',
          sel([{v:'None',l:'None'},{v:'Error',l:'Error'},{v:'Info',l:'Info'},{v:'Debug',l:'Debug'}], 'net-loglevel', s.logLevel || 'None')) +
        card('bar-chart-3', 'Bandwidth Limit', 'KB/s (0 = unlimited)',
          '<input type="number" class="settings-input" id="net-bandwidth" value="' + (s.netBandwidthLimit || 0) + '" min="0">') +
        '<div class="settings-item-card" id="row-add-friend" data-search="Add Friend Add a new friend to your network" style="cursor:pointer;">' +
          '<div class="settings-item-icon"><i data-lucide="user-round-plus"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Add Friend</span>' +
            '<span class="settings-item-desc">Add a new friend to your network</span>' +
          '</div>' +
          '<div class="settings-item-action">' +
            '<i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);"></i>' +
          '</div>' +
        '</div>';
      case 'diagnostics':
        return renderDiagnostics();
      case 'about':
        var friendsCount = MStore ? MStore.friends.length : 0;
        var chatsCount = MStore ? MStore.chats.length : 0;
        var _appVer = window.APP_VERSION || '0.2.8-beta';
        return '<div class="settings-item-card" data-search="Orbit Mobile ' + _appVer + ' Capacitor Android">' +
          '<div class="settings-item-icon"><i data-lucide="info"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Orbit Mobile</span>' +
            '<span class="settings-item-desc">' + _appVer + ' · Capacitor Android</span>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item-card" data-search="Statistics ' + friendsCount + ' friends ' + chatsCount + ' chats">' +
          '<div class="settings-item-icon"><i data-lucide="bar-chart-2"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Statistics</span>' +
            '<span class="settings-item-desc">' + friendsCount + ' friends · ' + chatsCount + ' chats</span>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item-card" id="row-check-update" data-search="Check for updates New version Orbit ' + _appVer + '" style="cursor:pointer;">' +
          '<div class="settings-item-icon"><i data-lucide="download-cloud"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Check for Updates</span>' +
            '<span class="settings-item-desc">See if a newer version of Orbit is available</span>' +
          '</div>' +
          '<div class="settings-item-action">' +
            '<i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);"></i>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item-card" data-search="Automatic Update Checks GitHub network new version">' +
          '<div class="settings-item-icon"><i data-lucide="refresh-cw"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Automatic Update Checks</span>' +
            '<span class="settings-item-desc">Check GitHub for a new version after launch (max once per 6h)</span>' +
          '</div>' +
          '<div class="settings-item-action">' +
            '<button class="settings-toggle ' + (MStore.settings.updateCheckEnabled !== false ? 'on' : '') + '" id="set-update-check"></button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item-card" id="row-show-changelog" data-search="What\'s New View latest changes and updates" style="cursor:pointer;">' +
          '<div class="settings-item-icon"><i data-lucide="megaphone"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">What\'s New</span>' +
            '<span class="settings-item-desc">View latest changes and updates</span>' +
          '</div>' +
          '<div class="settings-item-action">' +
            '<i data-lucide="chevron-right" style="width:18px;height:18px;color:var(--text-muted);"></i>' +
          '</div>' +
        '</div>' +
        '<div class="settings-section-label">Links</div>' +
        '<a href="https://github.com/D4niel-dev/Orbit-beta" target="_blank" rel="noopener noreferrer" class="settings-item-card" style="text-decoration:none;cursor:pointer;">' +
          '<div class="settings-item-icon"><i data-lucide="code" style="width:18px;height:18px;color:var(--text-primary);"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">GitHub Repository</span>' +
            '<span class="settings-item-desc">View source code, report issues, contribute</span>' +
          '</div>' +
          '<div class="settings-item-action"><i data-lucide="external-link" style="width:16px;height:16px;color:var(--text-muted);"></i></div>' +
        '</a>' +
        '<a href="https://github.com/D4niel-dev/Orbit-beta/issues" target="_blank" rel="noopener noreferrer" class="settings-item-card" style="text-decoration:none;cursor:pointer;">' +
          '<div class="settings-item-icon"><i data-lucide="bug" style="width:18px;height:18px;color:#ef4444;"></i></div>' +
          '<div class="settings-item-info">' +
            '<span class="settings-item-title">Report an Issue</span>' +
            '<span class="settings-item-desc">Found a bug? Let us know on GitHub</span>' +
          '</div>' +
          '<div class="settings-item-action"><i data-lucide="external-link" style="width:16px;height:16px;color:var(--text-muted);"></i></div>' +
        '</a>';
      case 'advanced':
        return card('code', 'Developer Mode', 'Enable developer tools',
          '<button class="settings-toggle ' + (s.devMode ? 'on' : '') + '" id="set-dev-mode"></button>') +
        card('bug', 'Debug Display', 'Show debug overlay info',
          '<button class="settings-toggle ' + (s.debugDisplay ? 'on' : '') + '" id="set-debug-display"></button>') +
        card('hash', 'Show Message IDs', 'Display message IDs in chat',
          '<button class="settings-toggle ' + (s.showMessageIds ? 'on' : '') + '" id="set-msg-ids"></button>') +
        card('activity', 'Log Network Packets', 'Log P2P network traffic',
          '<button class="settings-toggle ' + (s.logNetworkPackets ? 'on' : '') + '" id="set-log-packets"></button>') +
        card('bar-chart', 'Show Connection Stats', 'Show connection info overlay',
          '<button class="settings-toggle ' + (s.showConnectionStats ? 'on' : '') + '" id="set-conn-stats"></button>') +
        card('flask-conical', 'Enable Experimental', 'Unstable features',
          '<button class="settings-toggle ' + (s.enableExperimental ? 'on' : '') + '" id="set-experimental"></button>') +
        (s.enableExperimental ? (
          card('circle-dot', 'Animated Avatars', 'Animate avatar borders with pulse effect',
            '<button class="settings-toggle ' + (s.experimentalAnimatedAvatars ? 'on' : '') + '" id="set-exp-avatars"></button>') +
          card('droplet', 'Custom Colors', 'Pick custom accent color',
            '<button class="settings-toggle ' + (s.enableCustomColors ? 'on' : '') + '" id="set-exp-colors"></button>') +
          card('monitor', 'FPS Monitor', 'Display real-time frame rate',
            '<button class="settings-toggle ' + (s.experimentalFpsMonitor ? 'on' : '') + '" id="set-exp-fps"></button>') +
          card('layout', 'Developer Overlay', 'Connection stats and debug info',
            '<button class="settings-toggle ' + (s.experimentalDevOverlay ? 'on' : '') + '" id="set-exp-dev-overlay"></button>') +
          card('folder', 'Chat Folders', 'Organize chats into custom folders',
            '<button class="settings-toggle ' + (s.experimentalFolders ? 'on' : '') + '" id="set-exp-folders"></button>') +
          card('zap-off', 'Performance Mode', 'Kill animations, reduce CPU usage',
            '<button class="settings-toggle ' + (s.experimentalPerformanceMode ? 'on' : '') + '" id="set-exp-perf"></button>')
        ) : '');
      case 'vault':
        var _vLastBackup = localStorage.getItem('orbit_vault_lastbackup');
        var _vLastBackupTxt = '';
        if (_vLastBackup) {
          // Accepts BOTH shapes. The app writes `new Date().toISOString()`, so an
          // ISO string is what is normally here — but an epoch number has been
          // seen too, and `new Date('1791...')` is Invalid Date, which renders the
          // literal words "Invalid Date" into the UI.
          //
          // I got this wrong once by reading a probe's seed instead of the writer:
          // the probe's value was JSON-quoted, so `new Date()` failed on the
          // probe, and "coercing to a number" would have broken the real path.
          // Check the WRITER before believing a value's shape.
          try {
            var _vNum = Number(_vLastBackup);
            var _vDate = new Date(isNaN(_vNum) ? _vLastBackup : _vNum);
            if (!isNaN(_vDate.getTime())) _vLastBackupTxt = _vDate.toLocaleString();
          } catch(e) {}
        }
        // The status was a centred block with centred sub-text, sitting in a
        // settings list where everything else is left-aligned — which is what made
        // it read as bolted on rather than part of the app. It is a card now, like
        // every other row here: icon, title, description.
        return '<div class="settings-section-label">Local Vault</div>' +
        '<div class="vault-block" data-search="Local Vault encrypted backup restore files">' +
          // The file note used to be a SEPARATE block below this card, which is
          // why it read as out of place: it repeated what the card already said,
          // it had no icon where the card has one, and redesign.css left-aligns
          // it while the card is a row. It is the third line of the card now, so
          // the row reads as one object: what happened, when, and where it lives.
          '<div class="settings-item-card vault-status-card" id="vault-status">' +
            '<div class="settings-item-icon"><i data-lucide="shield-check"></i></div>' +
            '<div class="settings-item-info">' +
              '<span class="settings-item-title">' + (_vLastBackupTxt ? 'Last backup' : 'No backup yet') + '</span>' +
              '<span class="settings-item-desc">' + (_vLastBackupTxt ? escapeHtml(_vLastBackupTxt) : 'No backup has been written yet') + '</span>' +
              '<span class="settings-item-meta">A single JSON file in the app data folder (vault/)</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        card('lock', 'Encrypt Vault', 'Protect exports with a passphrase (PBKDF2 + AES-GCM)',
          '<button class="settings-toggle ' + (s.vaultEncrypt ? 'on' : '') + '" id="vault-encrypt-toggle"></button>') +
        (s.vaultEncrypt ? (
          '<div class="settings-item-card" data-search="Vault Passphrase password encryption key">' +
            '<div class="settings-item-icon"><i data-lucide="key-round"></i></div>' +
            '<div class="settings-item-info">' +
              '<span class="settings-item-title">Passphrase</span>' +
              '<span class="settings-item-desc">Used to encrypt this export</span>' +
            '</div>' +
            '<div class="settings-item-action"><input type="password" class="vault-pass-input" id="vault-passphrase" placeholder="Enter passphrase" autocomplete="off" style="max-width:150px;"></div>' +
          '</div>'
        ) : '') +
        card('smartphone', 'Auto-Backup on Background', 'Export silently when the app goes to background',
          '<button class="settings-toggle ' + (s.vaultAutoBackup ? 'on' : '') + '" id="vault-auto-toggle"></button>') +
        // ⚠ THIS ROW SITS ABOVE THE BUTTONS, ON PURPOSE (Dan's call, v0.8.7).
        //
        // It used to be the last thing on the screen, below Export and Restore —
        // which put it after the actions it has nothing to do with, and made it
        // read as a footnote to them. It is not an action on THIS vault; it is
        // the recovery path for a vault that is already gone, and the only one
        // that survives deleting the app. Every other row on this screen is a
        // setting, so it belongs with the rows.
        //
        // A vault and a backup FILE are different things (see vault.js), and the
        // file is what survives a reinstall. It gets its own row rather than
        // being folded into "Restore Vault", because a user looking for the file
        // they saved would not think to look inside a directory restore.
        card('file-archive', 'Restore From a Backup File',
          'Find .orzip or .zip backups in this app\u2019s folder and vault/',
          '<button id="btn-vault-files" class="settings-btn-secondary" style="white-space:nowrap;">Find backups</button>') +
        // One primary, one secondary. Both were primary, which made the eye
        // choose between two things that are not equal: exporting is the routine
        // action, restoring replaces everything you have.
        '<div class="settings-btn-row">' +
          '<button id="btn-vault-export" class="settings-btn-primary"><i data-lucide="download"></i> Export Vault Now</button>' +
          '<button id="btn-vault-restore" class="settings-btn-secondary"><i data-lucide="upload"></i> Restore Vault</button>' +
        '</div>';
      case 'folders':
        if (!s.experimentalFolders) return '';
        var folders = MStore.getChatFolders();
        if (folders.length === 0) {
          return '<div class="settings-item-card" data-search="Folders No folders yet">' +
            '<div class="settings-item-icon"><i data-lucide="folder"></i></div>' +
            '<div class="settings-item-info">' +
              '<span class="settings-item-title">No Folders Yet</span>' +
              '<span class="settings-item-desc">Create a folder to organize your chats</span>' +
            '</div>' +
          '</div>' +
          '<div class="settings-btn-row"><button id="btn-create-folder" class="settings-btn-primary"><i data-lucide="plus"></i> Create New Folder</button></div>';
        }
        var html = '';
        for (var fi = 0; fi < folders.length; fi++) {
          var f = folders[fi];
          var chatCount = f.chatIds.length;
          html += '<div class="settings-folder-row" data-folder-id="' + f.id + '">' +
            '<div class="settings-folder-icon"><i data-lucide="' + (f.icon || 'folder') + '"></i></div>' +
            '<div class="settings-folder-info">' +
              '<div class="settings-folder-name">' + escapeHtml(f.name) + '</div>' +
              '<div class="settings-folder-count">' + chatCount + ' chat' + (chatCount !== 1 ? 's' : '') + '</div>' +
            '</div>' +
            '<button class="settings-folder-rename-btn" data-folder-id="' + f.id + '" title="Rename"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>' +
            '<button class="settings-folder-delete-btn" data-folder-id="' + f.id + '" title="Delete"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>' +
          '</div>';
        }
        return html +
          '<div class="settings-btn-row"><button id="btn-create-folder" class="settings-btn-primary"><i data-lucide="plus"></i> Create New Folder</button></div>';
      default:
        return '';
    }
  }

  function bindSectionEvents(key, s) {
    // Helper for rename/delete folder events
    function _bindFolderActions() {
      // Rename buttons
      document.querySelectorAll('.settings-folder-rename-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var fid = this.getAttribute('data-folder-id');
          var folder = MStore.chatFolders[fid];
          if (!folder) return;
          var name = prompt('Rename folder:', folder.name);
          if (name && name.trim()) {
            MStore.renameFolder(fid, name.trim());
            showSettingsSection('folders');
          }
        });
      });
      // Delete buttons
      document.querySelectorAll('.settings-folder-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          var fid = this.getAttribute('data-folder-id');
          var folder = MStore.chatFolders[fid];
          if (!folder) return;
          if (confirm('Delete folder "' + folder.name + '"? Chats inside it will not be deleted.')) {
            MStore.deleteFolder(fid);
            // If we were viewing this folder in home, reset to friends
            if (window._activeHomeTab === fid) {
              window._activeHomeTab = 'friends';
            }
            if (typeof OrbitHome !== 'undefined' && OrbitHome.renderFolderTabs) {
              OrbitHome.renderFolderTabs();
            }
            if (window.renderChatList) window.renderChatList(window._activeHomeTab);
            showSettingsSection('folders');
          }
        });
      });
      // Create Folder button
      var createBtn = document.getElementById('btn-create-folder');
      if (createBtn) {
        createBtn.addEventListener('click', function() {
          var name = prompt('Enter folder name:');
          if (name && name.trim()) {
            MStore.createFolder(name.trim(), 'folder');
            if (typeof OrbitHome !== 'undefined' && OrbitHome.renderFolderTabs) {
              OrbitHome.renderFolderTabs();
            }
            showSettingsSection('folders');
            showToast('Folder "' + name.trim() + '" created', 'info');
          }
        });
      }
    }

    switch (key) {
      case 'appearance':
        // Theme select with light mode flashbang interception
        (function() {
          var themeSelect = document.getElementById('set-theme');
          if (themeSelect) {
            themeSelect.addEventListener('change', function() {
              var v = this.value;
              var currentTheme = s.theme;
              if (v === 'light' && currentTheme !== 'light' && !s.noFlashbang) {
                // Show flashbang warning dialog
                showLightModeWarning(function(noBang) {
                  if (noBang) { s.noFlashbang = true; MStore.save(); }
                  s.theme = 'light';
                  applyTheme('light');
                  MStore.save();
                  // Re-render to update toggle states (nobang toggle)
                  showSettingsSection('appearance');
                }, function() {
                  // Cancel - revert the select back to current theme
                  themeSelect.value = currentTheme;
                });
              } else {
                s.theme = v;
                applyTheme(v);
                MStore.save();
              }
            });
          }
        })();
        bindSelect('set-bubbles', function(v) { s.messageBubbles = v; document.documentElement.setAttribute('data-bubbles', v); MStore.save(); });
        bindToggle('set-24h', function(on) { s.timeFormat24 = on; MStore.save(); renderChatList(); if (activeChatId) renderMessages(activeChatId); renderActivity(); }, s.timeFormat24);
        bindToggle('set-animations', function(on) { s.animations = on; MStore.save(); applyAnimationSettings(); }, s.animations !== false);
        bindSelect('set-anim-speed', function(v) { s.animSpeed = v; MStore.save(); applyAnimationSettings(); });
        bindToggle('set-reduce-motion', function(on) { s.reduceMotion = on; MStore.save(); applyAnimationSettings(); if (activeChatId) renderMessages(activeChatId); }, s.reduceMotion);
        bindSelect('set-font-size', function(v) { s.fontSize = v; MStore.save(); applyFontSize(); });
        // App Zoom slider
        (function() {
          var zoomEl = document.getElementById('set-zoom');
          var zoomLabel = document.getElementById('zoom-val-label');
          if (zoomEl) {
            zoomEl.addEventListener('input', function() {
              if (zoomLabel) zoomLabel.textContent = this.value + '%';
            });
            zoomEl.addEventListener('change', function() {
              s.appZoom = parseInt(this.value, 10);
              MStore.save();
              document.body.style.zoom = (s.appZoom || 100) + '%';
              showToast('App Zoom: ' + s.appZoom + '%', 'info');
            });
            // Initial application
            document.body.style.zoom = (s.appZoom || 100) + '%';
          }
        })();
        // No flashbang toggle
        bindToggle('set-nobang', function(on) { s.noFlashbang = on; MStore.save(); }, s.noFlashbang);
        // Profile Frames (graduated from Experimental)
        bindToggle('set-profile-frames', function(on) { s.profileFrames = on; MStore.save(); if (on) document.documentElement.setAttribute('data-exp-frames','true'); else document.documentElement.removeAttribute('data-exp-frames'); }, s.profileFrames);
        break;
      case 'chat':
        bindToggle('set-enter-send', function(on) { s.enterToSend = on; MStore.save(); }, s.enterToSend);
        bindToggle('set-swipe-reply', function(on) { s.swipeToReply = on; MStore.save(); }, s.swipeToReply !== false);
        bindToggle('set-undo-send', function(on) {
          s.undoSend = on; MStore.save();
          // Turning it off should take the chip away now, not at the end of a
          // window the user has just said they do not want.
          if (!on) {
            if (_undoChipTimer) { clearTimeout(_undoChipTimer); _undoChipTimer = null; }
            _clearUndoChip();
          }
        }, !!s.undoSend);
        bindToggle('set-chat-avatars', function(on) { s.showChatAvatars = on; MStore.save(); renderChatList(); }, s.showChatAvatars !== false);
        bindSelect('set-msg-anim', function(v) { s.messageAnim = v; MStore.save(); if (activeChatId) renderMessages(activeChatId); });
        bindToggle('set-compact-spacing', function(on) { s.experimentalCompactSpacing = on; MStore.save(); if (on) document.documentElement.setAttribute('data-compact-spacing', 'true'); else document.documentElement.removeAttribute('data-compact-spacing'); if (activeChatId) renderMessages(activeChatId); }, s.experimentalCompactSpacing);
        bindToggle('set-message-fx', function(on) { s.messageFx = on; MStore.save(); if (on) document.documentElement.setAttribute('data-exp-fx', 'true'); else document.documentElement.removeAttribute('data-exp-fx'); }, s.messageFx);
        bindSelect('set-pattern', function(v) { s.bgPattern = v; MStore.save(); applyBgPattern(); });
        bindToggle('set-image-previews', function(on) { s.showImagePreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showImagePreviews !== false);
        bindToggle('set-link-previews', function(on) { s.showLinkPreviews = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showLinkPreviews !== false);
        bindToggle('set-classic-bubbles', function(on) { s.classicBubbles = on; MStore.save(); applyClassicBubbles(); }, s.classicBubbles);
        bindToggle('set-message-translate', function(on) { s.messageTranslate = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.messageTranslate);
        bindSelect('set-translate-target', function(v) { s.translateTargetLang = v; MStore.save(); });
        bindToggle('set-auto-detect', function(on) { s.autoDetectSource = on; MStore.save(); }, s.autoDetectSource !== false);
        break;
      case 'notifications':
        bindToggle('notify-preview', function(on) { s.notifyPreview = on; MStore.save(); }, s.notifyPreview !== false);
        bindToggle('notify-sound', function(on) { s.notifySound = on; MStore.save(); }, s.notifySound);
        (function() {
          var volEl = document.getElementById('notify-volume');
          var volLabel = document.getElementById('notify-volume-label');
          if (volEl) {
            volEl.addEventListener('input', function() {
              s.notifyVolume = parseInt(this.value, 10);
              if (volLabel) volLabel.textContent = s.notifyVolume;
              MStore.save();
            });
          }
        })();
        bindSelect('notify-sound-type', function(v) { s.notifySoundType = v; MStore.save(); });
        bindToggle('notify-dnd', function(on) { s.notifyDnd = on; MStore.save(); }, s.notifyDnd);
        bindToggle('notify-mentions', function(on) { s.notifyGroupMentions = on; MStore.save(); }, s.notifyGroupMentions);
        break;
      case 'privacy':
        bindToggle('set-app-lock', function(on) {
          if (on) {
            // Turning it on needs a PIN before it means anything. If the prompt
            // is cancelled the toggle has to fall back, or the switch would read
            // "on" with nothing behind it.
            _promptSetPin(function () { showSettingsSection('privacy'); });
            setTimeout(function () {
              if (!_appLockOn()) {
                var t = document.getElementById('set-app-lock');
                if (t) t.classList.remove('on');
              }
            }, 400);
          } else {
            s.appLock = null;
            MStore.save();
            if (window.OrbitAppLock) window.OrbitAppLock.clearAttempts();
            _toast('App Lock is off', 'info');
            showSettingsSection('privacy');
          }
        }, _appLockOn());
        bindToggle('set-app-lock-bg', function(on) {
          s.appLock = s.appLock || {};
          s.appLock.lockOnBackground = on;
          MStore.save();
        }, !(s.appLock && s.appLock.lockOnBackground === false));
        (function () {
          var row = document.getElementById('row-change-pin');
          if (row) row.addEventListener('click', function () { _promptSetPin(function () { showSettingsSection('privacy'); }); });
        })();
        bindToggle('set-privacy', function(on) { s.privacyMode = on; MStore.save(); var badge = document.getElementById('btn-privacy-badge'); if (badge) badge.style.display = on ? 'flex' : 'none'; }, s.privacyMode);
        bindToggle('set-e2ee', function(on) {
          s.e2eeEnabled = on; MStore.save();
          if (on && window.Orbit && window.Orbit.E2EE) {
            Orbit.E2EE.getPublicKeyAsync().then(function(pk) { if (pk) { MStore.user.publicKey = pk; MStore.save(); showToast('E2EE enabled — key ready', 'info'); } });
          } else { showToast(on ? 'E2EE enabled' : 'E2EE disabled', 'info'); }
        }, s.e2eeEnabled);
        bindSelect('set-delete-after', function(v) { s.deleteAttachmentsAfter = parseInt(v, 10); MStore.save(); });
        break;
      case 'network':
        bindSelect('net-mode', function(v) { s.networkMode = v; MStore.save(); toggleNetworkPortFields(v); });
        toggleNetworkPortFields(s.networkMode || 'LAN Auto-Discovery');
        ['net-udp', 'net-tcp', 'net-maxsize'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', function() {
              var key = id === 'net-udp' ? 'udpPort' : id === 'net-tcp' ? 'tcpPort' : 'maxFileSize';
              s[key] = parseInt(this.value, 10) || 0;
              MStore.save();
            });
          }
        });
        bindToggle('net-autoreconnect', function(on) { s.netAutoReconnect = on; MStore.save(); }, s.netAutoReconnect !== false);
        bindSelect('net-timeout', function(v) { s.netTimeout = parseInt(v, 10); MStore.save(); });
        bindSelect('net-keepalive', function(v) { s.netKeepAlive = parseInt(v, 10); MStore.save(); });
        bindToggle('net-webrtc', function(on) { s.webrtcFallback = on; MStore.save(); }, s.webrtcFallback !== false);
        bindSelect('net-loglevel', function(v) { s.logLevel = v; MStore.save(); });
        ['net-reconnect-interval', 'net-bandwidth'].forEach(function(id) {
          var el = document.getElementById(id);
          if (el) {
            el.addEventListener('change', function() {
              var key = id === 'net-reconnect-interval' ? 'netReconnectInterval' : 'netBandwidthLimit';
              s[key] = parseInt(this.value, 10) || 0;
              MStore.save();
            });
          }
        });
        var addFriendRow = document.getElementById('row-add-friend');
        if (addFriendRow) addFriendRow.addEventListener('click', showAddFriendModal);
        ensureNetworkMapInterval();
        drawNetworkMap();
        break;
      case 'vault':
        bindToggle('vault-encrypt-toggle', function(on) { s.vaultEncrypt = on; MStore.save(); showSettingsSection('vault'); }, s.vaultEncrypt);
        bindToggle('vault-auto-toggle', function(on) { s.vaultAutoBackup = on; MStore.save(); }, s.vaultAutoBackup);
        var vExpBtn = document.getElementById('btn-vault-export');
        if (vExpBtn) vExpBtn.addEventListener('click', function() { runVaultExport(true); });
        var vResBtn = document.getElementById('btn-vault-restore');
        if (vResBtn) vResBtn.addEventListener('click', runVaultRestore);
        var vFileBtn = document.getElementById('btn-vault-files');
        if (vFileBtn) vFileBtn.addEventListener('click', function() { showBackupFileSheet(); });
        break;
      case 'folders':
        _bindFolderActions();
        break;
      case 'advanced':
        bindToggle('set-dev-mode', function(on) {
          s.devMode = on; MStore.save(); document.documentElement.setAttribute('data-dev-mode', on ? 'true' : ''); updateDebugOverlay();
          if (on) {
            // Load eruda for on-device devtools
            if (!window.eruda) {
              var sc = document.createElement('script');
              sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
              sc.onload = function() { eruda.init(); showToast('DevTools loaded (eruda)', 'info'); };
              sc.onerror = function() { showToast('Could not load DevTools — use chrome://inspect', 'warning'); };
              document.body.appendChild(sc);
            } else {
              eruda.init();
            }
            // Show log overlay button
            if (!document.getElementById('p2p-log-btn')) {
              var btn = document.createElement('button');
              btn.id = 'p2p-log-btn';
              btn.textContent = 'P2P Log';
              btn.style.cssText = 'position:fixed;bottom:100px;right:16px;z-index:99998;background:#0a0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-family:monospace;cursor:pointer;opacity:0.85;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
              btn.addEventListener('click', showLogOverlay);
              document.body.appendChild(btn);
            }
            renderLogBuffer();
            showToast('Dev Mode ON — Logs enabled', 'info');
          } else {
            if (window.eruda) try { eruda.destroy(); } catch(e) {}
            var lb = document.getElementById('p2p-log-btn');
            if (lb) lb.remove();
            if (_logOverlay) { _logOverlay.remove(); _logOverlay = null; }
          }
        }, s.devMode);
        bindToggle('set-debug-display', function(on) { s.debugDisplay = on; MStore.save(); updateDebugOverlay(); }, s.debugDisplay);
        bindToggle('set-msg-ids', function(on) { s.showMessageIds = on; MStore.save(); if (activeChatId) renderMessages(activeChatId); }, s.showMessageIds);
        bindToggle('set-log-packets', function(on) { s.logNetworkPackets = on; MStore.save(); }, s.logNetworkPackets);
        bindToggle('set-conn-stats', function(on) { s.showConnectionStats = on; MStore.save(); updateDebugOverlay(); }, s.showConnectionStats);
        bindToggle('set-experimental', function(on) {
          s.enableExperimental = on; MStore.save();
          showSettingsSection('advanced');
        }, s.enableExperimental);
        bindToggle('set-exp-avatars', function(on) { s.experimentalAnimatedAvatars = on; MStore.save(); if (on) document.documentElement.setAttribute('data-exp-avatars', 'true'); else document.documentElement.removeAttribute('data-exp-avatars'); }, s.experimentalAnimatedAvatars);
        bindToggle('set-exp-folders', function(on) {
          s.experimentalFolders = on; MStore.save();
          // If disabling while a folder tab is active, fall back to Friends so the
          // chat list doesn't stay stuck on a now-hidden folder filter.
          if (!on && typeof window._activeHomeTab === 'string' && window._activeHomeTab.indexOf('folder_') === 0) {
            window._activeHomeTab = 'friends';
          }
          if (typeof OrbitHome !== 'undefined') { OrbitHome.renderFolderTabs(); if (window.renderChatList) window.renderChatList(window._activeHomeTab); }
        }, s.experimentalFolders);
        bindToggle('set-exp-colors', function(on) { s.enableCustomColors = on; MStore.save(); document.documentElement.setAttribute('data-exp-colors', on ? 'true' : ''); }, s.enableCustomColors);
        bindToggle('set-exp-fps', function(on) { s.experimentalFpsMonitor = on; MStore.save(); toggleFpsMonitor(on); }, s.experimentalFpsMonitor);
        bindToggle('set-exp-dev-overlay', function(on) { s.experimentalDevOverlay = on; MStore.save(); toggleDevOverlay(on); }, s.experimentalDevOverlay);
        bindToggle('set-exp-perf', function(on) {
          s.experimentalPerformanceMode = on; MStore.save();
          if (on) document.documentElement.setAttribute('data-perf-mode', 'true'); else document.documentElement.removeAttribute('data-perf-mode');
          if (on) {
            freezeGifImages(document, true);
            // Slow offline check to 60s
            if (window._offlineCheckInterval) { clearInterval(window._offlineCheckInterval); }
            window._offlineCheckInterval = setInterval(function() {
              var now = Date.now();
              MStore.friends.forEach(function(f) {
                if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
              });
              MStore.save();
              renderFriends();
              renderChatList();
            }, 15000);
            // Stop dev overlay polling
            if (window._stopDevOverlay) window._stopDevOverlay = true;
          } else {
            // Restore offline check to 30s
            if (window._offlineCheckInterval) { clearInterval(window._offlineCheckInterval); }
            window._offlineCheckInterval = setInterval(function() {
              var now = Date.now();
              MStore.friends.forEach(function(f) {
                if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
              });
              MStore.save();
              renderFriends();
              renderChatList();
            }, 15000);
            // Restore dev overlay polling
            if (window._stopDevOverlay) window._stopDevOverlay = false;
          }
        }, s.experimentalPerformanceMode);
        break;
      case 'diagnostics':
        // Bind only. The render case (which returns the markup) lives in the render
        // switch above — putting innerHTML here referenced an undefined container and
        // threw, leaving the screen blank.
        var diagCopy = document.getElementById('diag-copy');
        if (diagCopy) diagCopy.addEventListener('click', _diagCopy);
        break;
      case 'about':
        var changelogBtn = document.getElementById('row-show-changelog');
        if (changelogBtn) changelogBtn.addEventListener('click', showChangelog);
        var updateRow = document.getElementById('row-check-update');
        if (updateRow) updateRow.addEventListener('click', function() {
          if (window.UpdateNotice) window.UpdateNotice.checkManual();
        });
        // Automatic checks are opt-out; the manual row above always works.
        bindToggle('set-update-check', function(on) {
          s.updateCheckEnabled = on;
          MStore.save();
        });
        break;
    }
  }

  /* ─── Local Vault (encrypted local backup/restore) ─── */
  function _vaultFilesystem() {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) {
      return window.Capacitor.Plugins.Filesystem;
    }
    return null;
  }

  function _vaultAbToBase64(ab) {
    var u8 = new Uint8Array(ab);
    var CHUNK = 0x8000;
    var binary = '';
    for (var i = 0; i < u8.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  }

  function _vaultPad2(n) { return n < 10 ? '0' + n : '' + n; }

  function _vaultFmtBytes(b) {
    if (!b && b !== 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1073741824).toFixed(2) + ' GB';
  }

  function _vaultFmtDate(mtime) {
    try { return new Date(mtime).toLocaleDateString(); } catch(e) { return ''; }
  }

  // Serialised-size budget for attachment data (blobs + partials) in one export.
  //
  // Peak memory during an export is several times the SERIALISED payload:
  //   payload object -> JSON.stringify (one full copy) -> the Capacitor bridge
  //   serialises that whole string again to reach native.
  // And every base64 string costs TWO bytes per character in JS (UTF-16), so a
  // 23 MB payload measures as ~80-150 MB of real renderer memory.
  //
  // On Android all of that lands in the WebView heap, and an OOM there is NOT
  // catchable — it kills the renderer, which is the reported "app crashes when I
  // back up". So rather than a fixed number, derive the budget from the heap
  // ceiling the WebView actually has and keep the export to a small slice of it.
  // Measured: a 23.5 MB export peaked ~349 MB on desktop, against a 268 MB
  // baseline — so ~8% of the ceiling is the right order of magnitude.
  //
  // Both stores that can hold bulk data must be budgeted, because either one is
  // unbounded on its own:
  //   - `blobs`    — every inline attachment. maxFileSize defaults to 500 MB.
  //   - `partials` — checkpointed chunks of IN-PROGRESS transfers, stored as
  //                  base64 (64 KB chunk -> ~87 KB of text). A single interrupted
  //                  large-file receive can dwarf the whole attachment store.
  var VAULT_BLOB_BUDGET_FLOOR = 4 * 1024 * 1024;
  var VAULT_BLOB_BUDGET_CAP = 32 * 1024 * 1024;

  function _vaultHeapLimit() {
    try {
      return (window.performance && performance.memory && performance.memory.jsHeapSizeLimit) || 0;
    } catch (e) { return 0; }
  }

  // The budget actually used for a given export. `needsEnc` halves it: the
  // encrypted path additionally holds the JSON string, a TextEncoder copy of it,
  // the ciphertext and a base64 of the ciphertext all at once.
  function _vaultExportBudget(needsEnc) {
    var heap = _vaultHeapLimit();
    // No signal (or a non-Chromium engine): stay conservative.
    var base = heap ? Math.floor(heap * 0.08) : 16 * 1024 * 1024;
    base = Math.max(VAULT_BLOB_BUDGET_FLOOR, Math.min(VAULT_BLOB_BUDGET_CAP, base));
    return needsEnc ? Math.floor(base / 2) : base;
  }

  // Reads the blob + partials stores, stopping once `maxBytes` of SERIALISED
  // attachment data has been accumulated. Cursors keep draining after that (so
  // the transaction can still close) but nothing further is allocated —
  // base64-encoding is the expensive part, so it is skipped entirely for
  // anything over budget rather than encoded and then discarded.
  //
  // The two stores are walked in separate passes, attachments first. Finished
  // attachments are user data; a partial is only resumable-transfer state, so
  // that is the thing worth dropping. Separate passes also make the result
  // deterministic — sharing one transaction meant the budget went to whichever
  // cursor happened to run first, so the same store could export different
  // contents on different runs.
  // Returns { blobs, partials, totalBytes, truncated, droppedBlobs, droppedPartials }.
  function _vaultReadBlobStore(maxBytes) {
    var budget = maxBytes || _vaultExportBudget(false);
    var acc = {
      blobs: {}, partials: [], totalBytes: 0,
      truncated: false, droppedBlobs: 0, droppedPartials: 0
    };
    if (!window.BlobStoreDB || !window.BlobStoreDB._open) return Promise.resolve(acc);
    function remaining() { return budget - acc.totalBytes; }

    return window.BlobStoreDB._open().then(function() {
      return _vaultWalkStore('blobs', function (cursor, value) {
        var raw = (value && value.byteLength) ? value.byteLength : 0;
        // Count what will actually be serialised, not the raw bytes: base64 is
        // 4 characters per 3 bytes. Checking the raw size would let a full
        // 32 MB of blobs through as 43 MB of text.
        var encoded = Math.ceil(raw / 3) * 4;
        if (encoded > remaining()) { acc.truncated = true; acc.droppedBlobs++; return; }
        try {
          acc.blobs[cursor.key] = _vaultAbToBase64(value);
          acc.totalBytes += encoded;
        } catch (err) { console.warn('[Vault] blob encode failed for', cursor.key, err); }
      });
    }).then(function() {
      return _vaultWalkStore('partials', function (cursor, rec) {
        // A checkpoint is a map of index -> base64 chunk. Measure it before
        // pushing it into the payload.
        var size = 0;
        if (rec && rec.chunks) {
          for (var ck in rec.chunks) {
            if (Object.prototype.hasOwnProperty.call(rec.chunks, ck)) {
              var _sc = rec.chunks[ck];
              // Chunks are ArrayBuffers now — `.length` is undefined on those, which
              // would have made this total NaN.
              size += (typeof _sc === 'string') ? _sc.length : ((_sc && _sc.byteLength) || 0);
            }
          }
        }
        if (size > remaining()) { acc.truncated = true; acc.droppedPartials++; return; }
        acc.partials.push(rec);
        acc.totalBytes += size;
      });
    }).then(function() { return acc; });
  }

  // Walks one object store, handing every record to `visit` as it arrives.
  function _vaultWalkStore(storeName, visit) {
    return new Promise(function(resolve, reject) {
      try {
        var tx = window.BlobStoreDB._db.transaction(storeName, 'readonly');
        tx.onerror = function(e) { reject(e.target.error); };
        var req = tx.objectStore(storeName).openCursor();
        req.onsuccess = function(e) {
          var cursor = e.target.result;
          if (!cursor) { resolve(); return; }
          visit(cursor, cursor.value);
          cursor['continue']();
        };
      } catch (e) { reject(e); }
    });
  }

  function _vaultCrypto() {
    return window.crypto && window.crypto.subtle ? window.crypto.subtle : null;
  }

  // Random bytes for the salt/IV.
  //
  // NOTE: getRandomValues lives on `crypto`, NOT on `crypto.subtle` — and
  // _vaultCrypto() returns the subtle object. Calling c.getRandomValues(...) on
  // it throws "TypeError: c.getRandomValues is not a function", which meant the
  // encrypted export never produced a file at all: every attempt died on the
  // first line of _vaultEncryptPayload, before any encryption happened.
  function _vaultRandomBytes(len) {
    var out = new Uint8Array(len);
    window.crypto.getRandomValues(out);
    return out;
  }

  function _vaultDeriveKey(passphrase, salt) {
    var c = _vaultCrypto();
    return c.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function(key) {
        return c.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
          key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
      });
  }

  function _vaultEncryptPayload(payloadObj, passphrase) {
    var c = _vaultCrypto();
    var salt = _vaultRandomBytes(16);
    var iv = _vaultRandomBytes(12);
    return _vaultDeriveKey(passphrase, salt).then(function(aesKey) {
      var json = JSON.stringify(payloadObj);
      return c.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, new TextEncoder().encode(json));
    }).then(function(ct) {
      return {
        salt: _vaultAbToBase64(salt.buffer),
        iv: _vaultAbToBase64(iv.buffer),
        ciphertext: _vaultAbToBase64(ct)
      };
    });
  }

  function _vaultDecryptPayload(encObj, passphrase) {
    var c = _vaultCrypto();
    return _vaultDeriveKey(passphrase, window.orbitBase64ToArrayBuffer(encObj.salt)).then(function(aesKey) {
      var ct = window.orbitBase64ToArrayBuffer(encObj.ciphertext);
      return c.decrypt({ name: 'AES-GCM', iv: window.orbitBase64ToArrayBuffer(encObj.iv) }, aesKey, ct);
    }).then(function(pt) {
      return JSON.parse(new TextDecoder().decode(pt));
    });
  }

  /* ══ Restoring from a backup FILE ═══════════════════════════════════════════
     The desktop writes a whole account as one .orzip/.zip. This finds those files
     on the device and offers them back, which is the recovery path that matters
     after a reinstall: the app's own data directory is gone, but a file the user
     saved is not.

     The scan lives in components/vault.js (findBackupFiles/readBackupFile) and the
     write lives in account-receive.js (applyAccount) — the same funnel "Link a
     phone" uses. This is only the sheet. */

  function _fmtBytes(n) {
    if (!n) return '0 KB';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function _fmtWhen(ms) {
    if (!ms) return '';
    try {
      var d = new Date(ms);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function showBackupFileSheet() {
    var V = window.OrbitVault;
    if (!V || !V.findBackupFiles) { showToast('Restore is not available in this build', 'error'); return; }

    var sheet = window.OrbitSheet;
    if (!sheet || !sheet.showCustom) return;

    // Show the search before it finishes: on a cold start the filesystem plugin
    // takes a moment, and a sheet that appears empty then fills in reads as
    // broken. The spinner is honest about what is happening.
    sheet.showCustom(
      '<div class="bk-sheet">' +
        '<div class="bk-head">' +
          '<div class="bk-title">Backup files</div>' +
          '<div class="bk-sub">Looking in this app\u2019s folder and vault/\u2026</div>' +
        '</div>' +
        '<div class="bk-busy"><span class="acct-spinner"></span></div>' +
      '</div>');

    V.findBackupFiles().then(function (files) {
      var root = document.querySelector('.bk-sheet');
      if (!root) return;   // the sheet was closed while we were looking

      var body;
      if (!files.length) {
        body =
          '<div class="bk-empty">' +
            '<div class="bk-empty-title">No backup files found</div>' +
            '<div class="bk-empty-sub">A backup is a single <strong>.orzip</strong> or <strong>.zip</strong> file ' +
            'made by Orbit on a desktop. Put one in this app\u2019s folder or in <code>vault/</code> and look again.</div>' +
          '</div>';
      } else {
        body = '<div class="bk-list">' + files.map(function (f, i) {
          return '<div class="bk-row" data-i="' + i + '">' +
            '<div class="bk-icon"><i data-lucide="file-archive"></i></div>' +
            '<div class="bk-info">' +
              '<span class="bk-name">' + escapeHtml(f.name) + '</span>' +
              // ⚠ The full path was here and always truncated to "Orbit-B…" — the
              // name and the path start with the same words, so the tail that got
              // cut was the only part that differed. Show the FOLDER, which is
              // the thing a person is actually choosing between.
              '<span class="bk-meta">' + escapeHtml(_fmtBytes(f.size)) +
                (f.mtime ? ' \u00b7 ' + escapeHtml(_fmtWhen(f.mtime)) : '') +
                ' \u00b7 ' + (f.path.indexOf('vault/') === 0 ? 'in vault/' : 'app folder') + '</span>' +
            '</div>' +
            '<button class="bk-restore" data-i="' + i + '">Restore</button>' +
          '</div>';
        }).join('') + '</div>';
      }

      root.innerHTML =
        '<div class="bk-head">' +
          '<div class="bk-title">Backup files</div>' +
          '<div class="bk-sub">' + (files.length
            ? files.length + (files.length === 1 ? ' file found' : ' files found') +
              ' \u00b7 looked in this app\u2019s folder and vault/'
            : 'Looked in this app\u2019s folder and vault/') + '</div>' +
        '</div>' + body;

      if (window.lucide) { try { lucide.createIcons({ root: root }); } catch (e) {} }

      Array.prototype.forEach.call(root.querySelectorAll('.bk-restore'), function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var f = files[parseInt(btn.getAttribute('data-i'), 10)];
          if (f) _restoreFromBackupFile(f, btn);
        });
      });
    });
  }

  function _restoreFromBackupFile(file, btn) {
    var V = window.OrbitVault;
    if (btn) { btn.disabled = true; btn.textContent = 'Reading\u2026'; }

    V.readBackupFile(file.path).then(function (r) {
      if (!r.account || !r.account.user) {
        throw new Error('That backup does not contain an account');
      }
      var name = r.account.user.name || 'an account';
      var msgs = Object.keys(r.account.messages || {}).reduce(function (n, k) {
        return n + (r.account.messages[k] || []).length;
      }, 0);

      // Restoring REPLACES everything, so it gets a real confirmation that names
      // what is about to be imported rather than a generic "are you sure".
      return _confirmImportBackupFile(name, msgs, r.kind, file).then(function (ok) {
        if (!ok) { showBackupFileSheet(); return; }

        var R = window.OrbitAccountReceive;
        if (!R || !R.applyAccount) throw new Error('The importer is unavailable');
        var newId = R.applyAccount(r.account);
        if (!newId) throw new Error('Could not save the restored account');

        if (window.OrbitSheet && window.OrbitSheet.hide) window.OrbitSheet.hide();
        showToast('Restored ' + name + ' \u2014 reopening\u2026', 'success');
        // Reload so the app boots as the restored account; the network layer has
        // to pick up the new identity, exactly as switching accounts does.
        setTimeout(function () { window.location.reload(); }, 1400);
      });
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Restore'; }
      showToast(e && e.message ? e.message : 'Could not read that backup', 'error');
    });
  }

  /**
   * A confirmation that says what is being restored, not just "are you sure".
   *
   * ⚠ IT IS A SECOND STEP IN THE SAME SHEET, NOT A NEW DIALOG. A centred modal
   * floating over the sheet was two surfaces doing one job, and it looked like a
   * desktop dialog dropped into a phone app — the app's own vocabulary for a
   * question is a bottom sheet with a Cancel pill. Replacing the sheet's content
   * keeps one surface, and Cancel simply goes back to the list.
   */
  function _confirmImportBackupFile(name, messageCount, kind, file) {
    return new Promise(function (resolve) {
      var root = document.querySelector('.bk-sheet');
      if (!root) { resolve(false); return; }

      root.innerHTML =
        '<div class="bk-head">' +
          '<div class="bk-title">Restore ' + escapeHtml(name) + '?</div>' +
          '<div class="bk-sub">This adds a second account. Nothing is overwritten.</div>' +
        '</div>' +
        '<div class="bk-body">' +
          '<div class="bk-src-row">' +
            '<div class="bk-icon"><i data-lucide="file-archive"></i></div>' +
            '<div class="bk-info">' +
              '<span class="bk-name">' + escapeHtml(file ? file.name : 'backup') + '</span>' +
              '<span class="bk-meta">' +
                (file ? escapeHtml(_fmtBytes(file.size)) + ' \u00b7 ' : '') +
                escapeHtml(String(messageCount)) + (messageCount === 1 ? ' message' : ' messages') +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="bk-note">' +
            'It will be added as a <strong>new account</strong>. Everything already on this phone ' +
            'is left alone \u2014 the restored account sits alongside your current ones, and you can ' +
            'switch between them.' +
          '</div>' +
        '</div>' +
        // ⚠ ONE way out, not two. The sheet already pins its own Cancel pill, so
        // an in-content Cancel was the same duplication the × removal fixed in
        // v0.8.3 — two controls for one job, the smaller one harder to hit. This
        // row carries only the decision: Restore. Leaving is the pill.
        '<div class="bk-actions">' +
          '<button class="bk-go">Restore</button>' +
        '</div>';

      if (window.lucide) { try { lucide.createIcons({ root: root }); } catch (e) {} }

      root.querySelector('.bk-go').addEventListener('click', function () {
        var go = root.querySelector('.bk-go');
        if (go) { go.disabled = true; go.textContent = 'Restoring\u2026'; }
        resolve(true);
      });
    });
  }

  window.showBackupFileSheet = showBackupFileSheet;

  /**
   * Export the whole account using the v2 chunked format (see components/vault.js).
   *
   * The v1 implementation built one in-memory object, stringified it and wrote it in
   * a single call, which is why it needed a byte budget and could never include all
   * of a real account's attachments. v2 writes a directory of chunk files instead, so
   * peak memory is one chunk rather than the whole account.
   */
  function runVaultExport(showUI) {
    var F = _vaultFilesystem();
    if (!F) {
      if (showUI !== false) showToast('Vault: Filesystem plugin unavailable', 'error');
      return Promise.resolve(null);
    }
    if (window._vaultExportRunning) return Promise.resolve(null);
    if (!window.OrbitVault) {
      if (showUI !== false) showToast('Vault: exporter unavailable', 'error');
      return Promise.resolve(null);
    }
    window._vaultExportRunning = true;

    if (showUI !== false && window.orbitNotify) {
      window.orbitNotify('PROGRESS', 'Backing up your vault',
        'Exporting your account data…', 'orbit_vault');
    }

    // Passphrase comes from the settings field. Auto-backup runs on app-background with
    // no UI, so it usually has none — and it must then SKIP, not downgrade. Writing an
    // unencrypted backup on a timer for someone who deliberately enabled encryption is
    // the exact failure encryption is meant to prevent.
    var passphrase = null;
    if (MStore.settings.vaultEncrypt) {
      var input = document.getElementById('vault-passphrase');
      passphrase = (input && input.value) ? input.value : null;
      if (!passphrase) {
        if (showUI !== false) {
          showToast('Encryption is on but no passphrase is set — backup cancelled', 'warning');
        } else {
          console.warn('[Vault] auto-backup skipped: encryption is on but no passphrase is available');
        }
        return Promise.resolve(null);
      }
    }

    var statusEl = document.getElementById('vault-status');
    if (statusEl) statusEl.textContent = 'Backing up…';

    return window.OrbitVault.exportVault({ passphrase: passphrase })
      .then(function (res) {
        try { localStorage.setItem('orbit_vault_lastbackup', new Date().toISOString()); } catch (e) {}
        // Total the whole backup, not just the blob store. Attachments small enough
        // to live inline as data URLs sit in the localStorage payload, so counting
        // only blobs reported "0 attachments · 0.0 MB" on an account full of
        // images. Showing the split also makes it obvious where the weight is.
        var blobBytes = res.counts.bytes || 0;
        var dataBytes = res.counts.dataBytes || 0;
        var totalBytes = blobBytes + dataBytes;
        var summary = res.counts.blobs + ' attachment' + (res.counts.blobs === 1 ? '' : 's') +
                      ' · ' + _vaultFmtBytes(totalBytes) +
                      (dataBytes > 0 ? ' (' + _vaultFmtBytes(dataBytes) + ' of messages & settings)' : '');
        if (showUI !== false) {
          showToast('Vault exported: ' + summary, 'success');
          if (statusEl) statusEl.textContent = 'Last backup: ' + new Date().toLocaleString();
          if (window.orbitNotify) {
            window.orbitNotify('SUCCESS', 'Vault backed up', summary, 'orbit_vault');
          }
          // The backup currently lives in app-private storage, which a file manager
          // cannot see and a reinstall would wipe. Offer to get a copy out now, while
          // the user is thinking about backups at all.
          if (confirm('Backup complete (' + summary + ').\n\n' +
                      'Save a copy to Downloads now? Until it leaves this device ' +
                      'it is not a real backup.')) {
            _shareVault(res.dir);
          }
        }
        return res;
      })
      .catch(function (err) {
        var msg = (err && err.message) ? err.message : String(err);
        console.warn('[Vault] export error:', err);
        if (showUI !== false) {
          showToast('Vault export failed: ' + msg, 'error');
          if (window.orbitNotify) window.orbitNotify('ERROR', 'Vault backup failed', msg, 'orbit_vault');
        }
        return null;
      })
      .then(function (r) { window._vaultExportRunning = false; return r; });
  }

  function runVaultRestore() {
    var fs = _vaultFilesystem();
    if (!fs) { showToast('Vault: Filesystem plugin unavailable', 'error'); return; }
    // v2 backups are directories; v1 backups are single .json files. Offer both so
    // an older backup can still be restored after upgrading.
    Promise.all([
      (window.OrbitVault ? window.OrbitVault.listVaults() : Promise.resolve([])),
      fs.readdir({ path: 'vault', directory: 'DATA' }).then(function(res) {
        return (res.files || []).filter(function(f) {
          return f && f.name && f.name.toLowerCase().slice(-5) === '.json';
        }).map(function(f) {
          return { kind: 'legacy', name: f.name, path: 'vault/' + f.name, size: f.size, mtime: f.mtime };
        });
      }).catch(function() { return []; })
    ]).then(function(both) {
      var dirs = (both[0] || []).map(function(p) {
        return { kind: 'v2', name: p.split('/').pop(), path: p };
      });
      var all = dirs.concat(both[1] || []);
      if (!all.length) { showToast('No vault backups found', 'warning'); return; }
      _showVaultPicker(all);
    }).catch(function(err) {
      var msg = err && err.message ? err.message : String(err);
      if (msg.toLowerCase().indexOf('does not exist') !== -1 || msg.toLowerCase().indexOf('no such') !== -1) {
        showToast('No vault backups found', 'warning');
      } else {
        showToast('Vault: ' + msg, 'error');
      }
    });
  }

  function _showVaultPicker(files) {
    if (!window.OrbitSheet) { showToast('Vault: picker unavailable', 'error'); return; }
    var html = '<div class="vault-picker-title">Select a backup to restore' +
      (files.length > 1 ? ' · ' + files.length + ' stored' : '') + '</div>';
    html += '<div class="vault-file-list">';
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var metaParts = [];
      if (f.kind === 'v2') metaParts.push('chunked backup');
      if (typeof f.size === 'number') metaParts.push(_vaultFmtBytes(f.size));
      // v2 backups are directories, and readdir returns a name with no mtime, so the
      // timestamp has to come from the folder name (OrbitVault-YYYYMMDD-HHMM).
      var stampMs = f.mtime;
      if (!stampMs && f.kind === 'v2') {
        var m = /OrbitVault-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(f.name || '');
        if (m) stampMs = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
      }
      var timeTxt = _vaultFmtDate(stampMs);
      if (timeTxt) metaParts.push(timeTxt);
      html += '<div class="vault-file-row">' +
        '<button class="vault-file-item" data-vault-idx="' + i + '">' +
          '<i data-lucide="database-backup"></i>' +
          '<span class="vault-file-name">' + escapeHtml(f.name) + '</span>' +
          '<span class="vault-file-meta">' + escapeHtml(metaParts.join(' · ')) + '</span>' +
        '</button>' +
        '<button class="vault-file-save" data-vault-save="' + i + '"' +
          ' title="Save a copy to Downloads" aria-label="Save a copy to Downloads">' +
          '<i data-lucide="download"></i>' +
        '</button>' +
        '<button class="vault-file-delete" data-vault-del="' + i + '"' +
          ' title="Delete this backup" aria-label="Delete this backup">' +
          '<i data-lucide="trash-2"></i>' +
        '</button>' +
      '</div>';
    }
    html += '</div>';
    window.OrbitSheet.showCustom(html);
    var btns = document.querySelectorAll('.vault-file-item');
    for (var j = 0; j < btns.length; j++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var idx = parseInt(btn.getAttribute('data-vault-idx'), 10);
          window.OrbitSheet.hide();
          if (!files[idx]) return;
          if (files[idx].kind === 'v2') _confirmVaultRestoreV2(files[idx]);
          else _confirmVaultRestore(files[idx]);
        });
      })(btns[j]);
    }

    // Saving an existing backup matters as much as saving a fresh one — without it,
    // declining the post-export prompt meant no second chance short of exporting again.
    var saveBtns = document.querySelectorAll('.vault-file-save');
    for (var m = 0; m < saveBtns.length; m++) {
      (function(btn) {
        btn.addEventListener('click', function(ev) {
          ev.stopPropagation();
          var idx = parseInt(btn.getAttribute('data-vault-save'), 10);
          if (files[idx]) _shareVault(files[idx].path);
        });
      })(saveBtns[m]);
    }

    var delBtns = document.querySelectorAll('.vault-file-delete');
    for (var k = 0; k < delBtns.length; k++) {
      (function(btn) {
        btn.addEventListener('click', function(ev) {
          ev.stopPropagation();
          var idx = parseInt(btn.getAttribute('data-vault-del'), 10);
          if (files[idx]) _deleteVault(files[idx]);
        });
      })(delBtns[k]);
    }
  }

  /**
   * Delete one stored backup.
   *
   * Nothing ever pruned old backups, so every export left a full copy in app storage —
   * at a few hundred MB each, that fills a phone quickly. This is the only way to
   * reclaim the space.
   *
   * Deliberately explicit: a confirm that names the backup, and no automatic cleanup.
   * Silently deleting someone's backups is a worse failure than using disk.
   */
  function _deleteVault(entry) {
    var fs = _vaultFilesystem();
    if (!fs) { showToast('Vault: Filesystem plugin unavailable', 'error'); return; }

    if (!confirm('Delete the backup\n\n' + entry.name + '\n\nThis cannot be undone.')) return;

    // v2 backups are directories (manifest + chunk files), so they need a recursive
    // remove; v1 backups are a single .json.
    var op = (entry.kind === 'v2')
      ? fs.rmdir({ path: entry.path, directory: 'DATA', recursive: true })
      : fs.deleteFile({ path: entry.path, directory: 'DATA' });

    return op.then(function() {
      showToast('Deleted ' + entry.name, 'success');
      if (window.OrbitSheet) window.OrbitSheet.hide();
      // Re-open the picker so the list reflects reality straight away.
      setTimeout(function() { runVaultRestore(); }, 250);
      return true;
    }).catch(function(err) {
      var msg = (err && err.message) ? err.message : String(err);
      console.warn('[Vault] delete failed:', err);
      showToast('Could not delete that backup: ' + msg, 'error');
      return false;
    });
  }

  /**
   * Zip a vault and hand it to the Android share sheet.
   *
   * The vault is a directory of chunk files in app-private storage, so without this
   * a backup could never actually leave the device — which rather defeats the point.
   * Zipping natively gets real DEFLATE from the platform, and the share sheet is the
   * correct way to move a file out on Android 10+, where an app cannot simply write
   * into a browsable public folder. The user decides where it goes.
   */
  function _shareVault(dirPath) {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var P2P = plugins.OrbitP2P;
    if (!P2P || typeof P2P.zipVault !== 'function') {
      showToast('Sharing a backup needs a newer Android build', 'warning');
      return Promise.resolve(null);
    }
    showToast('Preparing the backup…', 'info');
    return P2P.zipVault({ srcDir: dirPath }).then(function (z) {
      // Prefer Downloads over the share sheet. A real account produces a backup far
      // too large for most share targets (email will simply refuse it), whereas
      // Downloads is where someone actually goes looking for the file afterwards.
      var save = (typeof P2P.saveToDownloads === 'function')
        ? P2P.saveToDownloads({ path: z.path, mime: 'application/zip', displayName: z.path })
        : Promise.reject(new Error('unsupported'));

      return save.then(function (r) {
        showToast('Saved to ' + (r.location || 'Downloads') + ': ' + (r.displayName || z.path) +
                  ' (' + _vaultFmtBytes(z.size) + ', ' + z.entries + ' files)', 'success');
        return z;
      }).catch(function () {
        // Fall back to sharing — works on every device, just less convenient for a
        // large file, and the user still gets a copy off the phone.
        return P2P.shareFile({
          path: z.path,
          mime: 'application/zip',
          title: 'Orbit backup'
        }).then(function () {
          showToast('Backup ready to share — ' + _vaultFmtBytes(z.size) +
                    ', ' + z.entries + ' files', 'success');
          return z;
        });
      });
    }).catch(function (err) {
      var msg = (err && err.message) ? err.message : String(err);
      console.warn('[Vault] share failed:', err);
      showToast('Could not prepare the backup to share: ' + msg, 'error');
      return null;
    });
  }

  /** Restore a v2 vault directory (chunked, per-chunk sealed). */
  function _confirmVaultRestoreV2(entry) {
    if (!window.OrbitVault) { showToast('Vault: restore unavailable', 'error'); return; }
    if (!confirm('Restore vault "' + entry.name + '"? This will overwrite your current local data.')) return;

    var pass = null;
    return window.OrbitVault.readManifest(entry.path).then(function(man) {
      if (!man.encrypted) return null;
      pass = prompt('Enter the vault passphrase:');
      if (!pass) return Promise.reject(new Error('A passphrase is required for this backup'));
      return null;
    }).then(function() {
      showToast('Restoring vault…', 'info');
      if (window.orbitNotify) window.orbitNotify('PROGRESS', 'Restoring vault', 'Putting your data back…', 'orbit_vault');
      return window.OrbitVault.restoreVault(entry.path, pass, {
        writeBlob: function(key, buf) { return BlobStoreDB.put(key, buf); },
        writePartial: function(key, rec) { return BlobStoreDB.partialPut(key, rec); }
      });
    }).then(function(res) {
      var msg = res.stats.keys + ' settings, ' + res.stats.blobs + ' attachment' +
                (res.stats.blobs === 1 ? '' : 's');
      showToast('Vault restored (' + msg + ') — restart the app to apply fully', 'success');
      if (window.orbitNotify) window.orbitNotify('SUCCESS', 'Vault restored', msg, 'orbit_vault');
      return res;
    }).catch(function(err) {
      var msg = (err && err.message) ? err.message : String(err);
      console.warn('[Vault] v2 restore failed:', err);
      showToast('Vault restore failed: ' + msg, 'error');
      return null;
    });
  }

  function _confirmVaultRestore(file) {
    if (!confirm('Restore vault "' + file.name + '"? This will overwrite your current local data.')) return;
    var fs = _vaultFilesystem();
    fs.readFile({ path: 'vault/' + file.name, directory: 'DATA', encoding: 'utf8' }).then(function(res) {
      var raw = res.data;
      var vaultObj;
      try { vaultObj = JSON.parse(raw); } catch(e) { showToast('Vault file is corrupt', 'error'); return; }
      // Release the raw text before the object graph is walked. On a large
      // vault this is a multi-megabyte string and the parse result already
      // holds its own copy of everything in it.
      raw = null;
      res = null;
      if (!vaultObj || vaultObj.app !== 'Orbit') { showToast('Not a valid Orbit vault file', 'error'); return; }
      if (vaultObj.encrypted) {
        var pass = prompt('Enter the vault passphrase:');
        if (!pass) return;
        return _vaultDecryptPayload(vaultObj, pass).then(function(payload) {
          return _applyVaultData(payload, vaultObj);
        }).catch(function(err) {
          console.warn('[Vault] decrypt failed:', err);
          showToast('Decryption failed — wrong passphrase?', 'error');
          return null;
        });
      }
      return _applyVaultData(vaultObj, vaultObj);
    }).catch(function(err) {
      showToast('Vault read failed: ' + (err && err.message ? err.message : String(err)), 'error');
    });
  }

  function _applyVaultData(payload, meta) {
    var data = payload.data || {};
    var restoreCount = 0;
    for (var k in data) {
      if (!data.hasOwnProperty(k)) continue;
      // Never clobber existing vault prefs; restore them only if absent
      if (k.indexOf('orbit_vault_') === 0) {
        if (localStorage.getItem(k) === null) {
          try { localStorage.setItem(k, data[k]); restoreCount++; } catch(e) {}
        }
        continue;
      }
      try { localStorage.setItem(k, data[k]); restoreCount++; } catch(e) {}
    }
    var blobKeys = payload.blobs || {};
    var partials = payload.partials || [];

    // Decode and write blobs in small sequential batches rather than building one
    // big Promise.all. Every base64 string decodes to an ArrayBuffer that stays
    // live until its write resolves, so restoring a large vault in one go holds
    // EVERY attachment in memory at once — the same shape of problem the export
    // had. A few at a time keeps the restore peak flat regardless of vault size.
    var RESTORE_BATCH = 3;
    var blobList = [];
    for (var bk in blobKeys) {
      if (blobKeys.hasOwnProperty(bk)) blobList.push(bk);
    }

    var chain = Promise.resolve();
    for (var bi = 0; bi < blobList.length; bi += RESTORE_BATCH) {
      (function(batch) {
        chain = chain.then(function() {
          var jobs = [];
          batch.forEach(function(key) {
            var ab = window.orbitBase64ToArrayBuffer(blobKeys[key]);
            // Release the encoded string as soon as it has been decoded.
            blobKeys[key] = null;
            if (ab && ab.byteLength > 0) jobs.push(window.BlobStoreDB.put(key, ab));
          });
          return Promise.all(jobs);
        });
      })(blobList.slice(bi, bi + RESTORE_BATCH));
    }

    partials.forEach(function(rec) {
      if (rec && rec.fileId) {
        chain = chain.then(function() { return window.BlobStoreDB.partialPut(rec.fileId, rec); });
      }
    });

    return chain.then(function() {
      // Best-effort: re-init in-memory store from the restored localStorage so
      // the current session sees the data (and doesn't clobber it on next save).
      try {
        if (MStore && MStore.load) MStore.load();
        renderFriends();
        renderChatList();
        if (activeChatId) renderMessages(activeChatId);
      } catch(e) { console.warn('[Vault] post-restore re-init failed:', e); }
      // The export records when it had to leave bulk data out (see
      // attachmentsExcluded). Say so here too, or a partial restore reads as
      // silent data loss.
      var gapNote = (meta && meta.attachmentsExcluded)
        ? ' — this backup was exported without some attachments' +
          (meta.attachmentsExcludedCounts ? ' (' +
            (meta.attachmentsExcludedCounts.attachments || 0) + ' attachment(s), ' +
            (meta.attachmentsExcludedCounts.partialTransfers || 0) + ' in-progress transfer(s))' : '')
        : '';
      showToast('Vault restored (' + restoreCount + ' keys)' + gapNote + ' — restart the app to apply fully', 'success');
    }).catch(function(err) {
      showToast('Vault restore error: ' + (err && err.message ? err.message : String(err)), 'error');
    });
  }

  function showChangelog() {
    if (document.getElementById('changelog-overlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'changelog-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--bg-surface);border-radius:16px;padding:20px;max-width:520px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);border:1px solid var(--border-subtle);';

    function vBlock(version, tag, sections) {
      var tagH = tag ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:2px 6px;margin-left:8px;text-transform:uppercase;">' + tag + '</span>' : '';
      var body = sections.map(function(s) {
        var items = s[1].map(function(i) { return '<li style="font-size:13px;color:var(--text-secondary);line-height:1.6;">' + i + '</li>'; }).join('');
        return '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin:12px 0 4px 0;">' + s[0] + '</div><ul style="margin:0;padding-left:20px;">' + items + '</ul>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border-subtle);padding-bottom:16px;"><div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">v' + version + tagH + '</div>' + body + '</div>';
    }

    modal.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;font-weight:700;color:var(--text-primary);">What\'s New</h2>' +
        '<button id="changelog-close-mobile" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;font-size:20px;">✕</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:16px;">' +
        // NOTE: this list is hand-maintained and had drifted three releases
        // behind — it stopped at 0.7.5 while the app was on 0.8.1, so What's New
        // showed nothing newer than 0.7.5 to anyone who updated. The desktop's
        // changelog.js is the other hand-maintained copy; they are separate files
        // and both have to be updated. A release is not done until this block is
        // added, which is why `npm run test:mobile` now asserts it.
        vBlock('0.8.6-beta', 'Latest', [
          ['New', [
            'Restore from a backup file. The Local Vault now finds .orzip and .zip backups in this app\u2019s folder and in vault/ \u2014 the files that survive deleting the app \u2014 and adds the account alongside what is already here rather than over it.',
            'Link previews while you type. The bar used to appear only after the message had gone, which is the one moment a preview is useless.',
            'The link card inside a sent message shows the page\u2019s own title and image now. It used to print the domain twice \u2014 as the title, and then the full URL underneath it.',
            'Contacts gained filters \u2014 All, Online, Offline, Groups, each with a live count \u2014 and a display style: a dense list, or a grid of large avatars.',
            'Every contact row has its actions now. Groups had none at all before this \u2014 a group was a row you could only tap.',
            'The attachment preview was rebuilt. A staged image used to be an empty box until it decoded; there is a spinner now, an \u00d7 on each one to take it out of the send, and tapping an image looks at it full screen instead of sending it.',
            'Only the active tab keeps its label. Three labels you are not on is three words competing for a 62px bar.',
          ]],
          ['Fixes', [
            'An emoji picked from the picker could not be sent. It was not the empty-check \u2014 an emoji passes that. The picker set the input\u2019s value directly, and assigning .value fires no input event, so the send button never appeared and the composer kept showing the mic.',
            'Tapping \u201cPair a desktop\u201d no longer re-opens the profile card on top of the camera.',
            'The restore button had no corner radius at all \u2014 it was written against a token this app does not define, and an undefined var() is dropped silently.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.6-beta.'
          ]]
        ]) +
        vBlock('0.8.5-beta', '', [
          ['New', [
            'Orbit is in the Android share sheet. Share a photo, a video, a PDF or a link from any app and it asks which chat \u2014 sharing to the wrong person is worse than one extra tap, and "send to the last chat" is exactly the helpfulness that sends a photo to the wrong person.',
            'A notification can be answered without opening the app. Direct messages get a Reply box. Replies typed while Orbit is closed are queued and sent when you next open it, and the notification stays until then rather than pretending.',
            'App Lock: a PIN in front of the app, six digits on a keypad. Stored as a PBKDF2 hash, five wrong tries starts a 30-second cooldown that survives a restart. Locks on launch always, and on return only if you ask.',
            'Link previews. The old card showed the domain, which tells you nothing you could not read off the URL \u2014 it fetches the page and shows its own title and image now, for the most recent link in the chat.',
            'The image viewer grew up: previous/next through the images of the message you tapped, zoom by button or pinch, and a download button. At the ends the arrows go dead but stay put, so nothing shifts under your thumb mid-tap.',
            'The network map shows faces instead of letters.',
            'Undo send \u2014 a real retraction, not a local hide: it tells the other side too, so the message is gone for them as well. Off by default, in Settings \u203a Chat.',
          ]],
          ['Improved', [
            'The update download is a bottom sheet with states that change. It used to be a centred modal that said "Downloading Orbit\u2026" even while it was installing.',
            'The Local Vault\u2019s file note is the third line of its card now, instead of a stray block floating below it.',
          ]],
          ['Fixes', [
            'The What\u2019s New button did nothing \u2014 a docs edit had broken both hardcoded blocks behind it.',
            'The image viewer\u2019s prev/next arrows were never styled at all: the rules were written against a class the buttons did not have, so not one matched and they fell back to the browser default. They match the desktop\u2019s now.',
            'The viewer\u2019s backdrop was 92% opaque, so the chat behind showed through as blocks and read as a second image.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.5-beta.'
          ]]
        ]) +
        vBlock('0.8.4-beta', '', [
          ['Fixes', [
            'A group of images of different sizes no longer goes ragged. The grid follows Discord now: one image keeps its own proportions, two are a pair of squares, three are one large square with two stacked beside it, four are a 2x2, and anything past four shows four tiles with a +N on the last.',
            'One tap on Send was also starting the mic. Sending swaps the composer from the send button to the mic, and Android fires a synthetic mouse event right after a touch aimed at whatever is under your finger by then \u2014 so it landed on the mic, started a recording, and the release sent it. One tap, a voice message nobody asked for, on repeat.',
            'That is also why the send button looked wrong and never lit up: the swap had already run, so the composer was showing the mic.',
            'And on the desktop, images in a grid were rendering at half height \u2014 the grid\u2019s own rules lost a specificity tie, so a wide photo sat at its natural height inside a square tile.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.4-beta.'
          ]]
        ]) +
        vBlock('0.8.3-beta', '', [
          ['New', [
            'The conversation screen, reworked. A message was one box with everything crammed inside it — text, images, files, video, audio. Now each kind gets the treatment its content actually wants: text keeps its bubble, images lose theirs and keep their real proportions instead of being squared and cropped, files get a surface of their own, and video and audio float on a shadow.',
            'Every file draws its own icon. A .zip, a .json and a .pdf used to be a column of identical glyphs.',
            'Your own messages are no longer a block of colour. Same surface as everyone else’s, with the corner saying which side you are on — and a Classic Bubbles toggle in Chat settings if you want the old look back.',
            'The desktop got the same treatment, so both platforms lay a conversation out the same way.',
            'The Local Vault fits the rest of Settings now, with Export and Restore told apart instead of both shouting equally.',
            'Reactions straddle the bubble’s edge, and the bottom sheets lost their duplicate ×.',
          ]],
          ['Fixes', [
            'The message bubbles were hardcoded to a fixed dark and a fixed blue. In a light theme the incoming bubble stayed dark while the text went dark with the rest of the app, so the message vanished into its own bubble. They follow the theme now — 17.3:1 contrast in dark, 17.8:1 in light.',
            'The small × on every staged attachment is gone, and so is the one in the top-right of every sheet. The Cancel button clears them, and two controls for one job just meant the smaller, harder-to-hit one.',
          ]],
          ['Version', [
            'Version: Bumped to v0.8.3-beta.'
          ]]
        ]) +
        vBlock('0.8.2-beta', '', [
          ['New', [
            'Diagnostics, rebuilt. It used to be a row of bare checks floating on the background with the top third of the screen empty. It opens with a verdict now \u2014 "Everything checks out", or what needs a look \u2014 and the report you would paste into a bug report is shown on screen instead of only promised.'
          ]],
          ['Fixes', [
            'The contacts list kept changing its mind. It rendered grouped \u2014 Online, Offline, Groups \u2014 and then flipped to a plain flat list on almost any update, including typing in the search box. Two renderers were writing to the same list and the older one was winning.',
            'The Friends / Groups tabs were invisible unless you had already created a folder. If you never made one, the control that switches between them was simply not there.',
            'Custom profile banners had stopped showing. Your banner image was still saved and still set \u2014 it just was not being drawn, and the card looked deliberate without it.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.2-beta.'
          ]]
        ]) +
        vBlock('0.8.1-beta', '', [
          ['New', [
            'Link a phone. Open it from the account switcher on the desktop, scan the code here, and your account comes across your own network \u2014 encrypted, and imported as a second account rather than overwriting the one already on this phone.',
            'The code that authorises it is shown only on the desktop screen and never sent in the clear. Nothing leaves that machine until you confirm.',
            'The mobile redesign is finished: the selected tab shows the filled form of its icon, the conversation has day separators and rebalanced bubbles, the composer is three controls instead of four, and the gallery names the conversation it belongs to.',
            'Search actually searches. It used to find nothing outside the conversation you had open \u2014 a word appearing in three chats returned zero results. It spans everything now, with filters on both the global and the in-chat search.',
            'The profile card opens from the header avatar, with the account switcher one tap in behind it.'
          ]],
          ['Fixes', [
            'Profile frames had a solid square behind them. Two !important rules of equal weight, and this one lost on load order.',
            'The settings search marked nine of ten rows hidden and left every one on screen. Broken since the restyle.',
            'The Activity title sat 20px left of centre, and the navbar moved when you changed tabs.',
            'Switching accounts could take the wrong settings with it.',
            'The last row of every settings section was clipped, and the toggle knob was off-centre.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.1-beta.'
          ]]
        ]) +
        vBlock('0.8.0-beta', 'Stable', [
          ['New', [
            'Your theme follows you to your phone. Change it on the desktop and it reaches your own devices \u2014 including a custom theme\u2019s colours, which is the half that matters.',
            'Message search now uses a full-text index, so it answers in milliseconds however much history you have.',
            'A search icon inside the Shared Media search bar.'
          ]],
          ['Fixes', [
            'The update progress bar actually moves. It had no total to divide by.',
            'A custom theme\u2019s colours now reach your phone \u2014 the colour editor saves differently from everything else, and the broadcast never fired for it.',
            'The Images tab shows images. Video and audio were landing there, where their thumbnails cannot load.',
            'Changing the display no longer refreshes the whole window.',
            'Opening the gallery closes the Shared Media panel, instead of showing two at once.',
            'Select mode has a visible way out, and long filenames truncate instead of spilling over the next card.',
            'The send button can no longer leave you stuck, and a toast arriving as you went to send no longer swallows the click.'
          ]],
          ['Version', [
            'Version: Bumped to v0.8.0-beta.'
          ]]
        ]) +
        vBlock('0.7.6-beta', '', [
          ['New', [
            'Shared Media has grown up: search, filters by sender, kind and age, a grid/list toggle, jump-to-message on every item, and multi-select with download-all. It renders 60 items at a time with a count, rather than building the whole list on every keystroke.',
            'Storage stats in the gallery header \u2014 how much your media takes and which chats it came from, biggest first. Orbit keeps your files on your own disk, so this is a fair question to ask.',
            'Select and delete media from the gallery. The confirm says plainly that the message goes for both people.',
            'A month scrubber down the side of the gallery, so "that photo from March" is a click rather than a scroll.',
            'The composer says what it can do: the plus rotates into an \u00d7 while its menu is open, and the send button lights up when there is something to send.'
          ]],
          ['Fixes', [
            'The Images tab was showing video and audio \u2014 and their thumbnails cannot load, so they appeared as broken images. Images means images now.',
            'Changing the display no longer refreshes the whole window.',
            'Opening the gallery closes the Shared Media panel, instead of showing two galleries at once.',
            'Select mode has a visible way out, even before you pick anything.',
            'Long filenames truncate in their cards instead of spilling over the next one.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.6-beta.'
          ]]
        ]) +
        vBlock('0.7.5-beta', '', [
          ['New', [
            'The desktop build now has 55 profile frames. This build ships its own set, so frames beyond it will not appear here until that art is added.',
            'Scrolled up and lost? A chip now floats above the message box \u2014 tap it to get back to the bottom. If what you are reading is genuinely old, it says so.',
            'The + button has a Commands entry, so the slash commands are findable without knowing to type one.',
            'Copy your user ID from the pill at the bottom, and swipe the pinned bar to move between pins.'
          ]],
          ['Fixes', [
            'Sending /help in a group cleared the box and then showed nothing. The tap that opened the command list was also closing it \u2014 one gesture, two jobs. It opens properly now.',
            'And if a list ever opens off the bottom of the screen, it says so rather than leaving you with nothing.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.5-beta.'
          ]]
        ]) +
        vBlock('0.7.4-beta', '', [
          ['Updates', [
            'The in-app update works. It never once succeeded before, and the reason was one byte: the downloaded APK was written a byte too long, so Android refused it with "There\u2019s a problem with the app file".',
            'Downloading now shows a progress bar and the time remaining, and the dialog stays open while it runs instead of closing the moment you press Download.',
            '"Update failed: total is not defined" is fixed too \u2014 it fired before the size check could even run.'
          ]],
          ['Pinned messages', [
            'Pin up to three messages in a direct message, five in a group \u2014 and a direct message can be pinned at all now, which it could not before.',
            'A card above the message box shows the top pin. Tap it to jump there, or long-press it for a floating list where the order can be changed.',
            'The change is saved and announced in the chat, and a pinned photo is named by its file name instead of "(attachment)".'
          ]],
          ['File transfers', [
            'Sending or receiving a file shows a progress row above the message box: the direction, the file name, a bar and a percentage.',
            'It looks the same as the desktop now, so the two do not read differently for the same event.'
          ]],
          ['Commands', [
            '/help opens its command list in a direct message too. It used to show nothing outside a group chat, and a fresh install only has a direct message.',
            'And when it cannot open, it says so and keeps what you typed. It used to fail silently and clear the box.'
          ]],
          ['Version', [
            'Version: Bumped to v0.7.4-beta.'
          ]]
        ]) +
        vBlock('0.7.3-beta', '', [
          ['Messages', [
            'An unsent message stays in its chat until you send it, and sending ends the draft. Drafts used to come back after you had sent the message \u2014 and could even land in the wrong conversation.'
          ]],
          ['Themes', [
            'A custom theme built on the desktop now applies here. Android had no custom-theme support at all, so your colours were silently ignored and the app fell back to the base theme.',
            'There is still no colour editor on the phone \u2014 the colours travel, the editing does not.'
          ]],
          ['Note', [
            'Settings sync is groundwork in this release: the rules are in and tested, but nothing sends or receives yet, so a theme still has to reach this device through a backup or a fresh edit on the desktop.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.3-beta.'
          ]]
        ]) +
        vBlock('0.7.2-beta', '', [
          ['Chat Commands', [
            'The /help list opens full-screen over the keyboard and scrolls properly now, with its Cancel button on screen. It used to open as a short strip that would not scroll or close.',
            'The emoji picker no longer shows a stray "undefined" across its search row.'
          ]],
          ['Updates', [
            'An update download is checked before Android is asked to install it, so a partial download says how much arrived instead of failing with Android\u2019s generic "problem with the app file".'
          ]],
          ['Look & Feel', [
            'Every empty screen \u2014 your chats, a new conversation, the friends list, group members, the activity log \u2014 now shares one treatment: a soft glowing icon, a title, and a line telling you what to do next.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.2-beta.'
          ]]
        ]) +
        vBlock('0.7.1-beta', '', [
          ['Fixed', [
            'The /help list opens at full height now, with its Cancel button on screen. It was being sized to the keyboard, which left it as a short strip that would not scroll or close.',
            'The emoji picker no longer shows a stray "undefined" across its search row.',
            'Scrolling a long list no longer drags the panel along with your finger.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.1-beta.'
          ]]
        ]) +
        vBlock('0.7.0-beta', '', [
          ['Chat Commands', [
            'The /help list opens nearly full-screen and shows ten commands at once instead of three, with a scroll indicator so it is obvious there is more to see. The rows are tighter too, so there is less to scroll through.'
          ]],
          ['Notifications', [
            'Every notification uses the Orbit icon now, so you can tell at a glance which app it came from \u2014 and the notification shows the face of whoever wrote.'
          ]],
          ['Fixed', [
            'The first-run feature slides no longer appear in your chat list. That tour belongs on desktop; on a phone the conversation list should be the first thing you see.'
          ]],
          ['Look & Feel', [
            'The people icons are the rounded variants now.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.7.0-beta.'
          ]]
        ]) +
        vBlock('0.6.5-beta', '', [
          ['Audio', [
            'Audio no longer jumps out of its bubble. If you were playing a voice note and left the chat, the player used to reappear as a bare block in whatever chat you opened next \u2014 and it could not find its way home after that. It stays with its message now and carries on where it left off when you come back.'
          ]],
          ['Chat Commands', [
            'The /help list has a close button at the top, can be dragged down to dismiss, and shows that there are more commands below the fold instead of just stopping.'
          ]],
          ['Emoji', [
            'The emoji picker has a grab handle and swipes down to dismiss; tapping outside it closes it too. It remembers your skin tone between launches, fits better on shorter screens, and the stray outline around the grid is gone.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.5-beta.'
          ]]
        ]) +
        vBlock('0.6.4-beta', '', [
          ['Audio', [
            'The audio player draws the track\u2019s real waveform now \u2014 not a decorative row of bars. It is read from the file itself and cached, so it never costs you anything twice.',
            'The file name sits above the timer, and the speaker icon at the end of the progress bar is also a level meter: crossed out when muted or at 0%, one wave up to half, two waves above it. Tap it for the volume slider.',
            'The \u22ee menu carries more: loop, visualiser (bars, wave, or off), elapsed or remaining time, playback speed, and copy file name.'
          ]],
          ['Onboarding', [
            'The empty chat panel now shows a short tour of what Orbit actually does \u2014 no server, encrypted, files and calls, groups, local-first storage, themes. Swipe through it or press Done to skip; it remembers where you were.'
          ]],
          ['Fixed', [
            'An unplayed audio message was a large blank box. It shows the track\u2019s real waveform now.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.4-beta.'
          ]]
        ]) +
        vBlock('0.6.3-beta', '', [
          ['File Transfer', [
            'Sending a file works now. The pieces of a file could reach the other side before the note that explains them, which is what made transfers stall or arrive broken.',
            'Attachments are also more resilient: a transfer that gets interrupted can carry on from where it stopped.'
          ]],
          ['New', [
            'Audio messages show their album art \u2014 if the file carries a cover image, Orbit shows it beside the controls. If it does not, you get a music note.',
            'Videos show their first frame \u2014 an unplayed video is no longer a black rectangle. Press play and the preview steps aside; press stop and it comes back.',
            'Text and files now sit in the same order as on desktop. Mobile always put the message first; both platforms agree now.'
          ]],
          ['Fixed', [
            'Audio no longer stops when a new message arrives \u2014 if you were listening to a voice message and someone messaged you, the player was rebuilt from scratch and went silent. It keeps playing now.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.3-beta.',
            'Unit test suite grew to 289 assertions, including new coverage for the file-transfer state machine.'
          ]]
        ]) +
        vBlock('0.6.2-beta', '', [
          ['Fixes', [
            'Notification icons show in the status bar now \u2014 they were appearing in the shade with nothing next to the clock, because the icons themselves were invalid rather than missing. All nine were rebuilt and checked.',
            'The update check works \u2014 it could not reach GitHub at all, so Orbit never saw that a new version existed.',
            'The update download works \u2014 and if a download has to be buffered rather than streamed, it still finishes instead of failing.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.2-beta.',
            'Android-only fix release; the desktop app is unchanged.'
          ]]
        ]) +
        vBlock('0.6.1-beta', '', [
          ['Notifications', [
            'Notifications now actually appear \u2014 This is the fix that matters. Android requires your permission before an app can post a notification, and Orbit was never asking for it, so the system was discarding every notification before it reached the status bar. Orbit now asks on first launch. If you denied it, you can turn it back on in Android\u2019s app settings.',
            'This is also why the notification work in 0.6.0 seemed to do nothing \u2014 those fixes were real, but nothing could get past the door.'
          ]],
          ['Transfers', [
            'Large files no longer run out of memory \u2014 Sending a big video used to exhaust the phone\u2019s memory, which killed the connection and restarted the transfer over and over, so it never finished. Chunks are now handled as raw bytes instead of text, which uses roughly a third of the memory it did before.',
            'You are told when a file is too large \u2014 If something is beyond what Orbit can receive, you get a clear message instead of a transfer that hangs forever.'
          ]],
          ['Messages', [
            'Text and files are separate messages now \u2014 A message used to appear captioned "Receiving Video..." before the video had arrived. Your text now lands on its own, and the file arrives as its own message when it is actually here.'
          ]],
          ['Fixes', [
            'The gallery no longer resets the sidebar to DMs when you change its display style.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.1-beta; Android bundle resynced.',
            'Unit tests 267/267.'
          ]]
        ]) +
        vBlock('0.6.0-beta', 'Stable', [
          ['Notifications', [
            'Real system notifications — Orbit now tells you about messages, @mentions, incoming calls, available updates and background work even when it is closed. Each type has its own icon and its own notification channel, so you can set different behaviour for calls and for quiet background work in Android settings.',
            'Messages group by chat, so a burst from one person collapses into a single notification instead of stacking up.'
          ]],
          ['Reliability', [
            'Messages now wait for people who are offline — Sending to someone who is not reachable used to drop the message silently, which on a local network happens constantly (a laptop closes, a phone leaves Wi-Fi). Orbit now holds the message and sends it the moment they are back, with an hourglass on the bubble so nothing ever looks delivered when it is not. If you close the app while something is still waiting, it will need sending again.',
            'You are told when someone’s security key changes — Keys are pinned the first time you connect, but a changed key used to be accepted silently. Orbit now fingerprints each contact’s key and warns you clearly if it is not the one you pinned, so a swapped key cannot pass unnoticed. It does not block the chat — people do reinstall — it tells you.',
            'This release fixes notifications properly. They had never actually appeared in the background — for three separate reasons, any one of which was enough to lose them. Every notification also used Android’s built-in info icon, which is why they all looked like the same generic "i".'
          ]],
          ['Local Vault', [
            'Your backup can now hold a full account — The old export built the whole backup in memory and could only ever save part of it. It now writes in 8 MB chunks, so a large account backs up without running out of memory.',
            'You can finally get the backup off your phone — Saving a copy to Downloads, or sharing it, so it is not trapped in the app.',
            'Delete old backups — Each backup in the list has a delete button, with a confirmation naming the file. Nothing is removed automatically.',
            'Save or share an older backup too — Not just the one you just made: any backup in the list can be saved to Downloads or shared.',
            'If you use encryption, auto-backup no longer silently writes an unencrypted copy when no passphrase is set — it skips instead.'
          ]],
          ['Updates', [
            'Update from inside the app — Orbit downloads the new version, opens the installer, and then offers to close itself so the update takes effect. If Android needs permission to install, it takes you straight to the right setting.'
          ]],
          ['Fixes', [
            'Profile frames are fixed — they were drawn at six different sizes and offsets depending on where they appeared, and were off-centre. They now sit correctly everywhere.',
            'The backup size readout was wrong — it reported 0.0 MB on a full account because it only counted one of the two places your data lives.',
            'A backup list date showed "invalid date" for newer backups.'
          ]],
          ['Diagnostics', [
            'New: Settings \u2192 Diagnostics \u2014 When nobody shows up it is almost never obvious why. This reports what Orbit can actually see about your network \u2014 whether discovery is running, your listening port, how many contacts are reachable \u2014 and tells you the likely cause when something is wrong, including the usual suspects like wireless isolation on the router or a firewall. You can copy it out for a bug report.',
            'Attachments to someone offline now wait too \u2014 previously only the message queued, so the file itself could still fail.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.6.0-beta; Android bundle resynced.',
            'Unit tests 267/267. This release is Android-only — the desktop app is unchanged.'
          ]]
        ]) +
        vBlock('0.5.3-beta', '', [
          ['Features', [
            'Voice & Video Calling — You can call someone from a chat now. Open a chat, tap the ⋯ button and choose Voice Call or Video Call. They get a ring with Accept and Decline, and once connected you both see the call screen with mute, speaker and camera buttons and a running timer. Video calls show the other person full screen with a small picture-in-picture view of yourself. Signalling travels over the same encrypted connection as your messages.',
            'A Real Ringtone — Calls ring with an actual sound for up to a minute and a half before giving up. If the ring runs out, the call is logged as a missed call instead of leaving you on a stuck screen.',
            'Call History in the Chat — Every finished call leaves a message in the conversation showing whether it was a voice or video call, how long it lasted, and a Call again button. Missed, declined and unanswered calls are recorded too.'
          ]],
          ['Bug Fixes', [
            'Encrypted Vault Export Never Worked — Turning on encryption for a Local Vault export made it fail every single time, silently, before it encrypted anything. Fixed and verified end to end, including restoring the backup afterwards.',
            'Local Vault Could Still Crash on a Big Account — The previous fix covered saved attachments but not the data left behind by interrupted file transfers, which on a busy account pushed the export to roughly 290 MB of memory. The limit now covers both, and it adjusts to your device on its own — a low-memory phone exports less rather than dying.',
            'Restoring a Vault No Longer Loads Everything at Once — Attachments are restored in small batches, so a large backup restores without running out of memory.',
            'Bottom Sheets Could Not Be Closed — The Cancel button sat at the very bottom of the scroll area on long sheets like /help, and a leftover drag could make closing stop working entirely. Both fixed, and tall sheets now scroll properly with the keyboard open.',
            'Some Bottom Sheets Would Not Scroll — Sheet height was measured against the full screen rather than the area the keyboard leaves visible, so a tall sheet could be pushed off the top.',
            'Group Avatars Now Match Desktop — Groups without a picture used to show a single letter; they now show the same grid of member avatars that desktop uses.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.5.3-beta; Android bundle resynced.',
            'Unit tests 267/267. Calling was verified with two real peers connected to each other, and the vault with a full encrypted export-and-restore round trip.',
            'Note: calling has not yet been tested on physical hardware — please report anything odd on a real device.'
          ]]
        ]) +
        vBlock('0.5.2-beta', '', [
          ['Features', [
            'Cross-Platform E2EE — Desktop now speaks the same encryption scheme as Android (SPKI keys, HKDF-SHA256, two-field envelope), so encrypted DMs finally work in both directions. The peer\'s advertised key format decides which path is used, so peers on older builds keep working.',
            'QR Pairing v2 — A QR code is now a portable beacon: your identity, every LAN address, your TCP port and your public key. Scan one with the camera, or share yours from the Add Friend sheet. Every invalid code explains itself instead of failing silently.',
            'In-App Update Notifications — Orbit tells you when a newer version exists, shows what changed, and hands you the APK in one tap. Checked at most once every 6 hours, skippable per version, and switchable off in Settings → About.'
          ]],
          ['Security', [
            'Silent E2EE Downgrade Fixed (4 sites) — A missing peer key or a failed encryption could previously send a message as plaintext while the UI still showed encryption as on; one mobile path left a message on screen that was never actually sent. Mobile now blocks the send and tells you why, and group messages skip keyless members instead of downgrading for them.',
            'QR key pinning now works between Android and desktop.'
          ]],
          ['Bug Fixes', [
            'Local Vault No Longer Kills the App — Large exports assembled the whole blob store in memory with no limit, and an out-of-memory kill cannot be caught. Exports now stop at 32 MB and record what was left out, so a restore can explain the gap.',
            'Bottom Sheets No Longer Open Behind the Keyboard — /help, the /poll builder and folder rename were invisible on device, because Android does not shrink the viewport when the soft keyboard appears.',
            'Mobile QR Codes Now Work Between Phones — The app was encoding a bare user id instead of the pairing payload, so phone-to-phone scanning could never work, and the error was swallowed silently.',
            'Android Now Shares Its Real Addresses in a QR Code — So a scanned code actually connects.',
            'Group Avatars No Longer Show "undefined" — Four implementations that had drifted apart are now one shared member-avatar grid.',
            'Image Cropper Is Now WYSIWYG — The export was about a third more zoomed than the preview.',
            'Group Image Upload — The create-group sheet can set a group image now.'
          ]],
          ['Technical', [
            'Version: Bumped to v0.5.2-beta; Android bundle resynced.',
            'Unit tests 158 → 267 assertions across four suites; desktop E2E suite 9 → 34 specs. The new E2EE interop suite caught three bugs before they shipped.'
          ]]
        ]) +
        vBlock('0.5.1-beta', '', [
          ['Bug Fixes', [
            'Stalled Transfer Recovery (Mobile + Desktop) — Interrupted receives keep their saved progress across stalls, app restarts, and crashes; late chunks resume from the checkpoint instead of restarting or vanishing.',
            '/help Now Works With Phone Keyboards — Soft keyboards that skip real Enter keydowns (IME 229 / insertLineBreak) now trigger slash commands like the send button does.'
          ]],
          ['Added', [
            '/h Shortcut — Quick alias for /help on both platforms.'
          ]]
        ]) +
        vBlock('0.5.0-beta', 'Stable', [
          ['Features', [
            'Resumable P2P File Transfers (Desktop) — Interrupted chunked transfers resume from the last contiguous chunk via FILE_TRANSFER_RESUME and auto-resume when peers reconnect.',
            'Network Topology Visualizer (Desktop + Mobile) — Live canvas map in Settings → Network: you at the center, peers orbiting, RTT color-coded links, transfer pulses, activity flashes.',
            'Message Threading (Desktop + Mobile) — Replies persist across restarts, render as indented chains with an "N replies" chip, and open in a View thread panel.',
            'Local Vault (Mobile) — Encrypted local backup of all your data (settings, chats, messages, files) with restore picker and optional auto-backup on background.',
            'Group Slash Commands (19) — /help /poll /me /shrug /tableflip /unflip /lenny /roll /flip /spoiler /clear /invite /members /topic /leave /shout /countdown /nick /kick — group chats only. /poll opens a visual builder; quoted syntax still works.'
          ]],
          ['Bug Fixes', [
            '/help Now Works on Mobile — Hardened sheet access plus a cache-bust fixed the dead command in group chats.',
            'Slash Commands Come to Desktop — Full parity with mobile, gated to groups.',
            'Poll Builder Centered — The create-poll sheet (plus invite/members sheets) is now properly centered.',
            'Invite Share Fixed — Group Info Share now uses the system share sheet (or copies invite text) instead of posting into whatever chat was open.',
            'Music Visualizer Duration Line Matches Video Player — Seek bar, groove, fill, and tooltip styles harmonized.'
          ]],
          ['Technical', [
            'Version bumped to v0.5.0-beta across all manifests; Android bundle resynced.'
          ]]
        ]) +
        vBlock('0.4.2-beta', '', [
          ['Features', [
            'Chat Folders (Desktop, experimental) — New Folders rail in the sidebar: create/rename/delete folders, add chats via the context menu, and bulk-assign with the "Add Chats" picker. Folders persist per-device (no sync yet).',
            'Folder Tabs Polish (Mobile) — Uniform tab width, centered Friends/Groups/folder trio with one folder, scrollable sub-rail with several; no opaque backgrounds, centered underline, auto-scroll on new folders.'
          ]],
          ['Bug Fixes', [
            'Desktop fixes — Deleting a folder no longer crashes; sidebar rail buttons work after a settings change; folder picker dismisses on outside click.'
          ]],
          ['Technical', [
            'Version bumped to v0.4.2-beta across all manifests.'
          ]]
        ]) +
        vBlock('0.4.0-beta', 'Stable', [
          ['Bug Fixes', [
            'Message Long-Press Menu Fixed — Press-and-hold on a message bubble now opens the reactions + actions sheet (Copy/Reply/Translate/Forward/Delete). Previously the wiring only ran through a secondary code path the app no longer uses, so the menu never initialized.',
            'Profile Frame Leak Fixed (4 renderers) — Avatar frames were still rendering when the Profile Frames setting was off. Gated _addAvatarFrames, renderProfilePill, and both chat-header renderers.',
            'Experimental Toggle Off-State Bugs Fixed — Avatars / Profile Frames / Perf Mode toggles used empty-string attribute selectors that failed when off. Switched to value-based [data-*="true"] selectors.',
            'Compact Spacing Toggle Fixed — Setting wrote a class the CSS no longer matched; now uses a [data-compact-spacing] attribute selector.',
            'FPS Monitor & Dev Overlay Resume on Reload — Debug toggles no longer stay off after an app reload when enabled.'
          ]],
          ['UI Polish', [
            'Folder Tab Icons Removed — Folder tabs show clean text labels only, matching Friends/Groups.',
            'Folders Gated Behind Experimental — Folder tabs and the Folders settings entry now require the new Experimental toggle (off by default) in Settings → Experimental → Advanced.',
            'Profile Frame Icon Removed (Desktop) — Account settings "Profile Frame" collapsible header shows the title only.'
          ]],
          ['Features', [
            'Message Effects Graduated — Message Effects (particle confetti on sent messages) moved from Experimental to Chat settings, with one-time automatic migration.',
            'Profile Frames Graduated — Moved from Experimental to stable settings (Appearance on mobile, Account on desktop), on by default, with one-time automatic migration. Desktop picker no longer requires Developer Mode.'
          ]],
          ['Technical', [
            'Version bumped to v0.4.0-beta across all manifests.'
          ]]
        ]) +
        vBlock('0.3.2-beta', '', [
          ['Bug Fixes', [
            'Android Crash-on-Launch Fixed (3 bugs) — styles.xml SplashScreen attributes missing, registerPlugin() called after super.onCreate(), colors.xml entirely missing.',
            'Profile Card Real-Time Updates Fixed (4 bugs) — Duplicate DOM IDs in profile sheet vs panel renamed; cropped image hero preview not updating after save fixed; avatar mistakenly used for banner background fixed; profile pill never updated after save wired up.',
            'Status Text Color Fixed (Profile Pill) — Status text appeared gray on startup because getStatusColor() depended on app.js load order. Fixed with local statusColors map in home-screen.js renderProfilePill().',
            'Mobile Gallery Bug Fixes (7 bugs) — Null guards on gallery button bindings; null checks in show/hide gallery; blob URL memory leak fixed (video/audio blob URLs revoked on navigation and close); filter index mismatch fixed; date-group visual order mismatch fixed (items grouped by date/section were stored in wrong order — clicking media opened wrong item); missing @keyframes scaleIn animation added; lightbox close button respects safe-area-top.'
          ]],
          ['UI Polish', [
            'Frame Picker Redesigned (Mobile) — Changed from full-screen flex backdrop to compact fixed-position bottom sheet (position:fixed;bottom:0;left:0;width:100%;max-height:75vh) appended to backdrop with slideUp CSS animation, guarded by _framePickerOpen flag.',
            'Frame Preview in Button Fixed — Removed position:absolute;top:-16%;left:-16% from frame image and overflow:hidden from container. Frame now flexbox-centered without clipping by circular avatar edge.',
            'Status Selection Added — New select dropdown with 4 statuses (Online, Away, Do Not Disturb, Offline). Saves to store and broadcasts BEACON immediately.',
            '"Busy" Status Removed — From both mobile and desktop.',
            'Desktop Status Icons — Changed to filled colored circles.'
          ]],
          ['Search Enhancement', [
            'Categorized Results — Search results organized into Chats, Friends, and Messages sections with count headers.',
            'Text Highlighting — Matched terms highlighted with accent color via _highlightText() helper.',
            'Recent Searches — Last 5 searches stored in MStore.settings.recentSearches, shown on input focus with empty-state prompt.',
            'CSS Added — New styles for .search-results-* and .recent-search-* classes in mobile.css.'
          ]],
          ['Technical', [
            'Version bumped to v0.3.2-beta across all manifests.'
          ]]
        ]) +
        vBlock('0.3.1-beta', '', [
          ['Bug Fixes', [
            'Android Immersive Mode Fixed — Taskbar now hides correctly. Root cause: Capacitor SystemBars plugin was calling show() after immersive mode. Fixed with SystemBars config, SplashScreen API, lifecycle handlers, and FLAG_FULLSCREEN for legacy API levels.',
            'Real-Time Profile Cards Fixed — Avatar/banner/bio/frame changes now propagate instantly. Desktop added broadcastBeacon IPC bridge; mobile sends BEACON on profile save; both platforms fixed null-propagation checks.',
            'DM Avatar Render Fix — No more missing avatars during rapid chat switching. closeChat/openChat race condition fixed, dm_ prefix stripped from friend lookup.',
            'Mobile Startup Performance — Lazy message loading, early-exit blob restoration, deferred cropper init.'
          ]],
          ['UI Polish', [
            'Image Cropper Redesigned — Premium look with Lucide icons, checkerboard preview, rule-of-thirds grid, corner handles, gradient Apply button, and smooth entrance animations.',
            'Smooth Zoom — Finer zoom steps (0.01 slider, 5% buttons, 2% scroll), GPU-accelerated sub-pixel positioning.',
            'Bottom Sheet Safe Area Cleaned — Removed safe-area-bottom padding from all bottom sheets.'
          ]],
          ['Technical', [
            'Version bumped to v0.3.1-beta across all manifests.',
            'Android web assets synced via npx cap sync android.'
          ]]
        ]) +
        vBlock('0.3.0-beta', '', [
          ['Image Cropper (Desktop + Mobile)', [
            'Shared Image Cropper — New crop tool with drag, zoom (slider + pinch + wheel), rotate 90° CW/CCW, mirror, and reset. Integrated into desktop avatar/banner inputs and mobile profile sheet.',
            'Avatar Circular Crop Guide — Three-level SVG mask with dimmed corners and transparent circle for precise avatar framing.',
            'Zoom & Centering Fixes — Drag scales proportionally; image sized-to-fit (Math.min); base centering separated from user drag.'
          ]],
          ['Mobile Improvements', [
            'Gallery A/V Playback Fixed — base64→blob URL conversion in openLightbox() for native Android WebView media playback.',
            'Real-Time Profile Overlay Refresh — Beacon handlers call refreshProfileOverlay() so peer cards update instantly on friend changes.',
            'Immersive Mode — System bars auto-hide on full-screen content (Android 7+).',
            'Input Box Draft Saving — Chat drafts auto-saved to localStorage (debounced 300ms), restored on chat switch, cleared on send.'
          ]],
          ['Desktop Improvements', [
            'Real-Time Profile Card Updates — profile-card.js watches friends array; open cards re-render on beacon-driven friend changes.',
            'Receiving Audio/Video Progress — File transfers show "Receiving Audio..." or "Receiving Video..." with Lucide icons.',
            'Input Box Draft Saving — Same localStorage draft pattern, cross-session persistence.'
          ]],
          ['Release Signing & Security', [
            'GitHub Actions Release Workflow — 5 parallel build jobs (Linux/Windows/macOS/Android) + SHA256SUMS.txt + GPG signing.',
            'GPG Signing — Release artifacts verified with Orbit Release Key. Key setup docs in security/README.md.',
            'Security Policy — SECURITY.md with supported versions and vulnerability reporting.',
            'Verification Docs — README.md "Release Verification" section with copy-paste commands.'
          ]]
        ]) +
        vBlock('0.2.8-beta', '', [
          ['Mobile A/V Persistence Fix', [
            'All Chat Pre-Loading — _restoreAllBlobAttachments now loads ALL chat messages before restoration runs, not just Orbit Echo. P2P chat attachments are restored proactively at startup.',
            'Exponential Backoff Retry — _resUrl blob restoration retries 5 times (300ms→4.8s) instead of giving up after one attempt. Eliminates permanent "Restoring..." dead state.',
            'Local Send Path Cleanup — Fixed the attsRef pointer in large-file BlobStoreDB.put which targeted the last inline attachment instead of the correct large-file attachment due to IIFE timing.',
            'FILE_TRANSFER_END _blobKey restored to synchronous save — _blobKey is set before _saveMsgs (v0.2.6 pattern), ensuring the render path finds the field on restart.'
          ]],
          ['Video Duration Fix', [
            'Backward moov scan — Added fallback backward scan for moov atom when forward scan fails (non-faststart MP4s). Prevents null duration from triggering wrong fallbacks.',
            'Duration return priority — max(mvhdDur, bestTrackDur) for fragmented MP4s where mvhd has partial initial duration.',
            'durationchange handler updates knownDuration — Browser duration corrections propagate into knownDuration, preventing wrong values from sticking.',
            'dur() uses max(knownDuration, video.duration) — Read-side safety net displays the best available duration from both sources.'
          ]],
          ['Mobile Status Circle Fix', [
            'PONG handler updates friend.lastSeen — prevents 45s offline timeout from marking connected peers as offline.',
            'MESSAGE handler updates sender status — incoming messages now refresh friend online status.',
            'onPeerFound sets lastSeen + re-renders — UDP discovery and reconnect paths keep status accurate.'
          ]],
          ['Emoji Reaction Fix', [
            'Reactions-row now carries data-msg-id — pill click handlers use reliable closest() lookup instead of fragile DOM traversal.'
          ]],
          ['Video Overlay Controls Fix', [
            'touchstart handler + _touchTap guard — overlay appears instantly on tap, no 300ms click delay or destructive mousemove interference.'
          ]],
          ['UI/UX Improvements', [
            'Code blocks redesigned — wrapped in styled container with header bar, language label, and Copy button on both platforms.',
            'Copy button on all code blocks — copies decoded code text to clipboard with "Copied!" confirmation feedback.',
            'Inline/single-line code styling — accent color border and improved background for better visibility.',
            'Chat list previews cleaned — markdown syntax stripped: code fences→"code", URLs→"link", inline code→text, bold/italic/hash markers removed, truncated at 80 chars.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.7-beta.'
          ]]
        ]) +
        vBlock('0.2.7-beta', 'Stable', [
          ['New', [
            'Code blocks got a proper frame \u2014 a header bar, a language badge and a Copy button, with inline code in the accent colour.',
            'Chat list previews are cleaned up: markdown is stripped, so a code block reads as "code" and a link as "link" rather than a wall of punctuation.'
          ]],
          ['Fixes', [
            'Video duration, finally. Four fallbacks now cover the containers that report nothing useful, including a backward scan for the metadata atom in a fragmented MP4.',
            'Media survived a restart on mobile again \u2014 a received file is stored with its data as well as its blob URL, so a URL that dies with the session can be rebuilt.',
            'A friend\u2019s status dot updates when they reply, not only when a beacon arrives.',
            'Reactions route to the right message in a direct message.',
            'The play overlay on a video responds to the first touch instead of the second.'
          ]],
          ['Version', [
            'Version: Bumped to v0.2.7-beta.'
          ]]
        ]) +
        vBlock('0.2.6-beta', '', [
          ['New Features', [
            'Undo/Redo System — Full Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y support via the new UndoManager component. Covers: message send/delete/edit, settings changes, profile updates, account switching, and chat navigation. Titlebar buttons with visual disabled state.',
            'Konami Code Easter Egg — Type ↑↑↓↓←→←→BA or ↑↑↓↓←→←→AB to toggle Developer Mode. Visual sequence feedback in the title bar.',
            'Light Mode Flashbang Prevention — "Disable Light Mode Flashbang" toggle and warning dialog checkbox to permanently skip the white flash when switching to Light Mode.',
            'Theme Transition Animation — 600ms smooth CSS transition for background, border-color, color, fill, and stroke when switching themes. Respects Reduce Motion setting.',
            'Theme Change Easter Egg — Random theme-matched quotes shown as toasts when switching themes.',
            'Midnight Sleep Reminder — Between 12AM-5AM on dark/midnight themes, a toast gently reminds users to rest.',
            'Gallery Audio/Video Playback — Gallery sidebar routes audio files to Audio Player and video files to Video Player.',
            'ImageViewer Audio Player — New openAudio() method for inline audio playback in the image viewer overlay.',
            'Activity Center Scroll-to-Message — Activity entries scroll to the specific message in chat.'
          ]],
          ['Bug Fixes', [
            'Profile Frame Per-Account Sync Fixed — Frame picker reads from currentUser.profileFrame, not global settings. Switching accounts shows correct frame.',
            'overlayIcon ReferenceError Fixed — Undeclared variable in gallery-sidebar.js caused gallery crash.',
            'Activity Center UI Shift Fixed — scrollIntoView propagation fixed with manual feed.scrollTop calculation.',
            'Mobile Buffer Loader Always Visible Fixed — Placeholder removal and overflow:hidden in mobile CSS.',
            'Image Send Bug Fixed — Blob URL revocation removed from renderMessages().',
            'Mobile Video Duration Mismatch Fixed — loadedmetadata event listener replaces forced seek hack.',
            'Mobile→Desktop Video Thumbnails Fixed — _poster field preserved across platforms.',
            'Gallery Audio/Video Route Fixed — Proper type detection routes to correct player.',
            'Mobile Fullscreen Taskbar Overlap Fixed — safe-area-inset-bottom padding.',
            'Blue Fullscreen Background Eliminated — 4-layer background fix across all fullscreen elements.',
            'Fullscreen Manual Only — Both platforms use _enterManualFS()/_exitManualFS() exclusively.'
          ]],
          ['Media Player Improvements', [
            'Fullscreen Theme Glow — Radial gradient accent glow behind video.',
            'App-wide Filled Icon State — _iconToggle helper switches filled/outlined Lucide icons.',
            'Byte-identical Players — shared and mobile player files confirmed identical.'
          ]],
          ['UI/UX Polish', [
            'Titlebar nav buttons switched to undo/redo icons.',
            'GPU-accelerated rendering with will-change + translateZ(0).',
            'Sidebar nav back/forward buttons with 50-entry history.'
          ]],
          ['Technical', [
            'New UndoManager component: 100-action stack, Ctrl+Z/Y/Shift+Z, privacy mode awareness.',
            'NoFlashbang setting, theme transition CSS classes, version bumped to v0.2.6-beta.'
          ]]
        ]) +
        vBlock('0.2.5-beta', '', [
          ['New Features', [
            'Global Gallery Redesign — Grid and list views with audio/video type detection.',
            'Gallery Sidebar Improvements — Audio inline player, video posters, media type badges.',
            'Activity Center Enhancements — Refined rendering and click handling.'
          ]],
          ['Media Player Improvements', [
            '_poster field propagated through attachment pipeline for video thumbnails.'
          ]],
          ['UI/UX Polish', [
            'Sidebar nav header with Back/Forward navigation buttons.',
            'Activity Center shows Lucide icons with color badges, duration/size displays.'
          ]]
        ]) +
        vBlock('0.2.4-beta', '', [
          ['Bug Fixes', [
            'Removed _skipCorrupted proactive seek in doPlay() — forced 1e10 seek replaced with loadedmetadata listeners.',
            'FILE_TRANSFER DM Packet Fix — chatId removed from DM FILE_TRANSFER packets.'
          ]]
        ]) +
        vBlock('0.2.3-beta', '', [
          ['Bug Fixes', [
            'Render loop fix, _skipCorrupted state persistence across stop/play cycles, chatId packet routing fix.'
          ]]
        ]) +
        vBlock('0.2.2-beta', '', [
          ['Media Player Improvements', [
            'Video Player complete overhaul — MP4 duration parsing, multi-layered fallback, eliminated forced seeks.',
            'Audio Player major rewrite — same architecture as video player, reliable metadata detection.',
            'Automatic Video Poster Capture at 0.5s on send (both platforms).',
            'Mobile sync — both players synced via shared/ui/ directory.'
          ]],
          ['Technical', [
            'Shared audio/video player refactored into clean module pattern.',
            'Version bumped to v0.2.2-beta.'
          ]]
        ]) +
        vBlock('0.2.1-beta', '', [
          ['Bug Fixes', [
            'Null-check safety for audio/video player controls.',
            'Mobile audio/video player synced with desktop fixes.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.1-beta.'
          ]]
        ]) +
        vBlock('0.2.0-beta', '', [
          ['CRITICAL: Mobile Background Notifications & Large File Persistence', [
            'CRITICAL: Mobile Background Notifications Fixed — document.hidden is unreliable in Capacitor WebView; notifications never appeared outside the app. Two-layer fix: JS tracks background via Capacitor appStateChange, and Java OrbitP2PPlugin creates notifications directly via NotificationManager.',
            'CRITICAL: Large File Persistence on Mobile — Files >10MB in IndexedDB had blob: URLs die on restart. Added BlobStoreDB + _restoreAllBlobAttachments() on startup. "Restoring..." placeholders during recovery.'
          ]],
          ['Mobile base64 Streaming Optimizations', [
            'All 7 binary base64 decode sites rewritten as single-pass streaming decoders — no intermediate string allocations. Includes orbitBase64ToArrayBuffer, _base64ToBytes, _safeB64ToArrayBuffer (shared audio/video players).'
          ]],
          ['Notification & Lifecycle Fixes', [
            'Reliable App Background Detection: window._appIsBackgrounded from Capacitor appStateChange listener instead of unreliable document.hidden.',
            'Native Android Notifications from Plugin: OrbitP2PPlugin creates notifications directly via NotificationManager. Works regardless of WebView JS state.',
            'JS→Plugin Foreground Bridge: setForeground() prevents duplicate notifications.'
          ]],
          ['Desktop File Transfer Fixes', [
            'Desktop AV Type Honor Fix: Desktop file-received now honors sender\'s type classification (e.g., .webm audio) instead of blind extension re-classification.'
          ]],
          ['Media Player Improvements', [
            'muted=true Gated to Mobile Only: Desktop players no longer start muted.',
            'Blob MP4 Duration Parsing: fetch(blob:) + Uint8Array byte access for large blob URLs.',
            'Video Player Blob Duration Fallback: Fetches blob and parses MP4 header directly.'
          ]],
          ['Technical', [
            'Version bumped to v0.2.0-beta.',
            'Two-layer notification: JS handles foreground; Java handles background.',
            'All 7 binary decode sites unified to streaming single-pass algorithm.',
            'File persistence: ≤10MB localStorage, >10MB IndexedDB BlobStoreDB.'
          ]]
        ]) +
        vBlock('0.1.9-beta', '', [
          ['CRITICAL: P2P Transfer & Service Lifecycle Fixes', [
            'CRITICAL: Mobile base64 Decode Corruption — atob() corrupts bytes >127. All 7 binary decode sites replaced with safe manual decoder.',
            'CRITICAL: Desktop→Mobile Chunk Joining — desktop btoa()\'s each chunk independently; mobile did chunks.join(\'\') → corrupt at padding boundaries. Fixed: per-chunk independent decode + ArrayBuffer concat.',
            'CRITICAL: WriteStream Race (Mobile→Desktop) — stream.end() async; onComplete fired before flush → truncated files, lost audio/duration. Fixed: stream.on(\'finish\') wraps completion.',
            'CRITICAL: P2P cleanup() Race in Android Plugin — cleanup() called stopService() then initP2P found boundService still non-null, skipped restart. Fixed: Java cleanup() is a no-op (JS already clears listeners).'
          ]],
          ['File Transfer Fixes', [
            'Mobile Type Override Fixed (HIGH): FILE_TRANSFER_END no longer overwrites correct video/audio type — only overwrites if null/undefined/file.',
            'Mobile Video Compression Dropped Audio (HIGH): canvas.captureStream(15) captures only pixels. Disabled compressVideoMobile — raw video with audio sent.',
            'Group Chat File Routing Fixed: FILE_TRANSFER_START/END lacked chatId. Added to desktop + mobile packets.',
            'Hash Mismatch Silenced: Platform hash diff is harmless — console.warn only, file always saved.'
          ]],
          ['Media & UI Fixes', [
            'Mobile Metadata Preload: muted=true + preload=metadata forces mobile browsers to load duration immediately. Audio restored on play.',
            'Video Player preload Changed to metadata — saves bandwidth.',
            'Transfer Error X Button Fixed: preventDefault + stopPropagation on dismiss.',
            'Peer Status Dot After Auto-Connect: Immediate online status update.'
          ]],
          ['Quality of Life', [
            'Unstable AV Transfer Warning Modal: Shown on audio/video send. "Don\'t show again" checkbox, nicer alert-triangle icon.',
            'Auto-Discovery Diagnostic Logging: [AutoConnect] logs in DevTools.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.9-beta.'
          ]]
        ]) +
        vBlock('0.1.8.1-beta', '', [
          ['CRITICAL: P2P Cross-Platform Fixes', [
            'Mobile→Desktop File Transfers Silently Deleted (CRITICAL): hash was empty — desktop always deleted file. Fixed: real SHA-256 computed via crypto.subtle; desktop skips hash check when omitted.',
            'FILE_TRANSFER Packets Had Empty Sender (CRITICAL): from/senderId was \'\'. Fixed: passes userId + peerId to createPacket.',
            'createPacket Signature Aligned to Desktop (CRITICAL): changed from (type,payload,senderId) to (type,fromId,toId,payload). Added packetId and to fields. Updated all 28 call sites.',
            'Duplicate Messages for Large Files Fixed (CRITICAL): _fileId markers in MESSAGE attachment — receiver merges into existing message instead of creating second entry.'
          ]],
          ['High-Impact Fixes', [
            'Missing File Extensions Added (HIGH): video (m4v,wmv,flv,f4v,ts,mts,m2ts), image (svg,tiff,bmp,heic,heif,avif), audio (opus,mka) — correct MIME mappings.',
            'Media Persistence Fixed: Received files survive restart — _dataUrl stored alongside blob URL for recovery.',
            'renderMessages No Longer Mutates Store: data:→blob conversion no longer corrupts MStore.messages.',
            '.webm Misclassification Fixed: .webm removed from audioMatch — video checked first.',
            'Desktop isVideo Added: file-received handler now classifies videos with proper MIME.'
          ]],
          ['Video Player', [
            'Mobile Video Aspect Ratio Fixed: object-fit: contain, max-height 50vh (was 300px), #000 letterbox background.'
          ]],
          ['Technical', [
            'Version bumped to v0.1.8.1-beta.'
          ]]
        ]) +
        vBlock('0.1.8-beta', '', [
          ['Store Class Ported to Mobile', [
            'Dedicated Store class created: Inline MStore (~350 lines) extracted into store.js (760 lines) — full class with property-based access (MStore.friends, MStore.settings.*) for backward compatibility plus getState()/setState()/subscribe() for convergence.',
            'Desktop parity features added: subscribe/notify, blockUser/unblockUser, pinMessage/unpinMessage, markAsRead, toggleMute, group management (addGroup/removeGroup/addMemberToGroup), DM management (closeDM/togglePinDM/reopenDM), E2EE key storage, transfer tracking, addOrUpdatePeer.'
          ]],
          ['Bug Fixes', [
            'addMessage() unread tracking fixed (HIGH): Removed — mobile manages unreads via chat.unread. Every message was previously counted as unread.',
            'mutedChats misalignment fixed (HIGH): Now aliases settings.mutedChats — all mute/unmute ops update same object mobile reads via MStore.settings.mutedChats.',
            'setState() currentUser fixed (MEDIUM): now maps to this.user — previously silently dropped.'
          ]],
          ['Technical', [
            'MStore API fully backward-compatible — 532+ references preserved.',
            'Desktop CSP updated for Prism.js (cdnjs.cloudflare.com).',
            'Prism.js loading fixed: loads before app.js on both platforms.',
            'Version bumped to v0.1.8-beta.'
          ]]
        ]) +
        vBlock('0.1.7-beta', '', [
          ['Video Playback Fixes', [
            'PIPELINE_ERROR_DECODE Root Cause Fixed: Audio packet decode errors in fMP4 files resolved via Content-Type fix in main.js. Videos play continuously.',
            'Re-render Guard: Store subscription blocks re-renders while video plays (except chat switches). Handles notify() without changedState.',
            'Decode Error Retry: On PIPELINE_ERROR_DECODE, source reloads and skips forward +2s (up to 3 attempts).',
            'Removed Forced Seeking: Eliminated currentTime = 1e10 hack for orbit-db:// / orbit-file:// URLs.'
          ]],
          ['Media Player UX Improvements', [
            'Larger Video Player: Display increased to 720x600 in messages. Fullscreen has shadow + theme-matched letterbox.',
            'Larger Audio Player: Waveform canvas height increased to 200px, full-width container (720px).',
            'Separated Media Layout: Video and audio removed from image grid — standalone blocks at full width.',
            'Fullscreen uses var(--bg-surface) — blends with active UI theme.'
          ]]
        ]) +
        vBlock('0.1.6-beta', '', [
          ['P2P Connectivity & Bug Fixes', [
            'Desktop Auto-Connect Port: Uses peer.tcpPort instead of hardcoded 46000. Per-peer ports stored in SocketManager._peerPorts.',
            'Desktop P2P Edit Loop Fixed: store.editMessage no longer re-broadcasts (caused echo). Single broadcast from chat-panel.js.',
            'Desktop Context Menu Edit: No-op log replaced with proper editingMsg flow.',
            'Mobile Disconnect Handler Fixed (Critical): Friend lookup by connectionId works — connectionId stored on connect + beacon. Falls back to IP split.',
            'Mobile TCP/UDP Beacon Handlers: Store tcpPort, connectionId, ip on friends. Auto-reconnect uses peer port.',
            'Mobile Orbit Echo: Status correctly reset to online on friend load.'
          ]],
          ['Message Editing & Reactions', [
            'Mobile Edit P2P Broadcast: Edits broadcast to DMs and group members with chatId for group routing.',
            'Mobile edited Flag: Incoming MESSAGE_EDIT sets msg.edited = true.',
            'Mobile Reaction UI: Reaction button, floating picker (6 emojis), toggle on pills, P2P broadcast via REACTION protocol.'
          ]],
          ['Android Foreground Service', [
            'OrbitForegroundService: Full P2P engine as persistent Android Service — TCP server, UDP multicast, WakeLock, START_STICKY.',
            'OrbitP2PPlugin: Thin proxy forwarding calls via Binder. Events drained every 100ms to JS listeners.',
            'BootReceiver: Restarts foreground service on BOOT_COMPLETED.',
            'JS Lifecycle: visibilitychange, appStateChange, pageshow re-render UI and restart discovery on foreground.',
            'sendFailed/connectFailed events now delivered to JS (were silently dropped).',
            'Battery Optimization exemption permission + JS bridge method.'
          ]],
          ['Silent Bug Fixes', [
            'serverSocket volatile — prevents stale null on stopServer',
            'PeerConnection stale map entry eliminated — both original + updated peerId keys cleaned',
            'Executor shutdownNow on destroy — prevents thread leaks on START_STICKY recreation',
            'Static eventQueue cleared on destroy — prevents stale events from old instance',
            'SO_REUSEADDR on MulticastSocket — prevents bind failure on discovery restart',
            'joinGroup with explicit NetworkInterface — Android 10+ compatibility'
          ]]
        ]) +
        vBlock('0.1.5-beta', '', [
          ['New Features', [
            'Account Switcher (Experimental): Right-click avatar on desktop to add/switch/logout accounts. Last active user auto-loaded.',
            'PIN Lock Screen (2FA Experimental): 4-8 digit PIN, SHA-256 hashed, numpad UI, 5-attempt cooldown, Forgot PIN reset.',
            'Per-Account Message Isolation: Messages stored per-user via userChatIds. accountOwnerId columns for DB isolation.',
            'Per-Account Avatar Frames: Frame loaded from user record, not shared settings.',
            'Orbit Echo Welcome Sequence: 4 welcome messages with typing indicator delays.',
            'Beacon Payload Enriched: Avatar, banner, bio, profileFrame, publicKey in both UDP and TCP beacons.',
            'Friend Status Starts Offline: Friends load offline (except Echo). Faster offline detection (45s threshold, 15s interval).',
            'Group Avatar Backfill: Async fetch for groups with avatarPath but no avatarDataUrl.'
          ]],
          ['Bug Fixes', [
            'Messages from other accounts no longer leak — per-account auto-track and render filtering',
            'Closing DMs no longer affects other accounts — per-account closedDMs/pinnedDMs in settings',
            'Leaving groups correctly hides the group — renderGroups checks membership, removeGroupMember untracks chat',
            '"User"#0000 placeholder fixed, store syntax error fixed, various cross-account isolation fixes'
          ]]
        ]) +
        vBlock('0.1.4-beta', '', [
          ['New Features', [
            'Native Android System Notifications: Messages now show as real system notifications when app is backgrounded (requires POST_NOTIFICATIONS permission)',
            'Desktop Notification Avatars: Sender/group avatar now shown as notification icon',
            'Connection Stats Panel: Live P2P status — online peers, uptime, sent/received message counters',
            'Video File Support: Upload, render, and view video files in chat with play overlay',
            'Video Preview Modal: Full-screen video player on desktop and mobile',
            'Video Compression: Large videos (>5MB) auto-compressed to 720p/500kbps before sending',
            'P2P Discovery Optimized: Beacon interval reduced, stale threshold increased, exponential backoff',
            'Group Info UI: Theme CSS variables for consistent dark/light mode appearance',
            'Performance Mode: New toggle in Experimental settings with two-step confirmation',
            'Compact Spacing & Swipe-to-Reply moved from Experimental to chat settings'
          ]],
          ['Bug Fixes & Optimizations', [
            'Image Viewer reliability fixes, JS-level CPU optimization for GIFs and link previews',
            'Forced reflow cascade eliminated, data-refreshing animation guard added',
            'Leaked offline check interval fixed, mobile HTML nesting fixed',
            'E2EE cross-platform key derivation — per-platform group encryption as first step',
            'P2P Auto-Connection Stabilization: PING/PONG keep-alive, socket timeout, reconnect logic, stale peer pruning',
            'Translation Improvements: cache, dedup, abort controller, retry on failure',
            'Voice Messages: Content-Type fix, onerror handler, chunked transfer audio detection',
            'Image Viewer: quick-save button, keyboard navigation, swipe, download fix, loading placeholder',
            'Group sync fixes: owner transfer roles, self-leave cleanup, invite adds group, GROUP_CREATE init messages'
          ]]
        ]) +
        vBlock('0.1.3-beta', '', [
          ['Bug Fixes', [
            'Manual Connect Bug Fixed: "Add a Friend" IP connect no longer creates duplicate TCP connections',
            'Hardcoded type strings eliminated — all use Protocol.Types constants'
          ]],
          ['Technical', [
            'Protocol Type Unification: All 47 types unified across shared and desktop protocol.js',
            'Build Pipeline Overhaul: Android assembleRelease, SHA256 checksums, artifact verification'
          ]]
        ]) +
        vBlock('0.1.2-beta', '', [
          ['Bug Fixes', [
            'Desktop Bug Fixes — require(crypto) → window.crypto in sidebar-middle; PIN_MESSAGE groupId in payload'
          ]]
        ]) +
        vBlock('0.1.1-beta', 'Legacy Stable', [
          ['New Features', [
            'Voice & Video Calls (P2P): Full WebRTC call system with incoming notification, mute/speaker controls',
            'Group Calls (Mesh): Each participant gets their own RTCPeerConnection',
            'Camera Toggle: On/off during calls with HSL avatar placeholder',
            'Message Forwarding: Forward messages with attachments to any chat',
            'Block User: Block/unblock from context menu; P2P filter drops blocked packets',
            'Search Within a Chat: Scoped search with chatId filter, sender filter, date inputs',
            'Export Chat History: JSON or TXT export with timestamped downloads',
            'Save/Load Themes: Export current theme as JSON; import via file picker',
            'Message Translate Unlocked: Always-on translate button, default enabled'
          ]],
          ['Bug Fixes', [
            'Mobile Reply fromName fix, Lucide Icon null fix, Call Modal UI centering'
          ]]
        ]) +
        vBlock('0.1.0-beta', '', [
          ['Performance', [
            'Up to 5× faster startup and rendering — selective store subscriptions, setStateBatch microtask coalescing',
            'Startup: ~40% faster — deferred init phases, batched store IPC, lazy message loading',
            'freezeGifImages: Canvas cache, expanded selectors, global call on Reduce Motion toggle'
          ]],
          ['Bug Fixes', [
            'orbit-db://attachment/ 404 fix, selective subscriber undefined changedState fix',
            'Message avatar click moved from re-attached events to delegated actions',
            'loadFullChatMessages was dropping existing messages'
          ]]
        ]) +
        vBlock('0.0.9.3-beta', '', [
          ['New Features', [
            'Group Info Panel overhaul — Add Member, Leave Group, Transfer Ownership, member search',
            'DM context menus — Pin/Unpin, Mute, View Profile, Copy ID, Close DM',
            'Pinned DMs — pinned state sorted first with pin icon',
            'Close DM removes friend from DB with full cleanup',
            'P2P Diagnostics panel — logs, errors, peer info, connection stats',
            'Debug log buffer — captures last 500 console entries',
            'Global Gallery type filters — All/Images/Files, view mode persisted'
          ]],
          ['Bug Fixes', [
            'Gallery sidebar Files tab fix, Context menu data-action fix',
            'P2P protocol audit — isPeerConnected key mismatch, type string fixes'
          ]]
        ]) +
        vBlock('0.0.9.2-beta', '', [
          ['New Features', [
            'Mobile initP2P Logging — detailed debug logs throughout P2P initialization',
            'Dev Mode DevTools — toggling loads eruda on-device inspector panel',
            'Debug Log Buffer — scrollable log overlay when dev mode is active'
          ]],
          ['Bug Fixes', [
            'Desktop sends messages to mobile (BEACON IP fallback)',
            'Mobile peer merging (host:port→UUID dedup)'
          ]]
        ]) +
        vBlock('0.0.9-beta', '', [
          ['Bug Fixes', [
            'Android P2P Stability: 8 Java plugin fixes + 4 JS bridge fixes',
            'Desktop P2P Stability: 9 fixes (write queue, oversized frames, socket errors, self-beacon filter)',
            'Desktop Socket Write Queue: per-connection queue prevents TCP byte interleaving',
            'Mobile DB Fix: migration runs after user load to prevent identity corruption'
          ]],
          ['New Features', [
            'Mobile Group Info Panel: edit name/description, avatar, invite code, pin/mute, member roles',
            'Pinned Messages: pin/unpin in action bar; pinned section in group info; cross-platform sync',
            'Message Search: search bar filters messages in real-time on mobile',
            'Enhanced Message FX: particle confetti system on both platforms',
            'Mobile Settings: Font Size, Message Animation, Auto-Reconnect, Connection Timeout',
            'Avatar in P2P Beacons: cross-platform avatar sharing in discovery packets'
          ]]
        ]) +
        vBlock('0.0.8-beta', '', [
          ['New Features', [
            'Rich Link Previews v2 — Open Graph metadata fetched via Electron IPC',
            'Cross-Platform P2P: Desktop ↔ Android LAN discovery and messaging via TCP/UDP',
            'Mobile Settings Wired: All toggles now have real behavior',
            'Mobile Toast Overhaul: Type-based accent bar, icons, slide-in animation',
            'Mobile Notification Sound: Web Audio beep on incoming P2P messages',
            'Chat Background Patterns: Diagonal Stripes, Crosshatch, Circles'
          ]],
          ['Bug Fixes', [
            'QR Code Fixes, MIME mapping, cache headers, media retry, attachment URL stability'
          ]]
        ]) +
        vBlock('0.0.7-beta', '', [
          ['New Features', [
            'First-Time User Tutorial (Welcome Tour) — skippable and replayable via Settings',
            'Link Previews — Rich URL cards rendered directly in chat messages',
            'Activity Center Overhaul — Modern notification timeline with tabs',
            'Shared Media Gallery — Revamped panel with Images, Files, and Links',
            'Privacy Mode Overhaul — Attachments and thumbnails properly handled'
          ]]
        ]) +
        vBlock('0.0.6-beta', '', [
          ['Bug Fixes', [
            'XSS fixes, CSS injection fix, network packet null-safety',
            'Store immutability, fixed duplicate addMemberToGroup, data cleanup on removeGroup',
            'Fixed require(crypto) in renderer, unguarded networkSend calls fixed',
            'Consistent clipboard with fallback'
          ]],
          ['New Features', [
            'Dev Mode master gate, True Dark theme, Custom theme dropdown, Seasonal theme',
            'Custom Colors modal, Profile Frames, Animated Avatars, Message FX',
            'Message Translate, Compact Spacing, App Zoom slider',
            '42 decorative profile frame overlays, experimental feature badges'
          ]]
        ]) +
        vBlock('0.0.5-beta', 'Stable', [
          ['New Features', [
            'Backup & Restore, Database Health Check, Database Repair',
            'Unread badges, @mention highlighting, mention badges, jump to first unread',
            'Read receipts, Edit message sync, Per-chat mute, Keyboard shortcuts',
            'Transfer cancellation, Disk space check, File size enforcement',
            'Group roles (Owner/Admin/Member), Group Info Panel, Join request system',
            'E2EE encryption (ECDH + AES-256-GCM) for DMs, Privacy Mode',
            'Network Dashboard, Do Not Disturb mode, Settings tabs redesign'
          ]]
        ]) +
        vBlock('0.0.4-beta', '', [
          ['New Features', [
            'Group chat creation and joining, Invite code system',
            'Pinned messages, Message reactions, Image gallery sidebar',
            'File transfer system with TCP, Transfer progress UI'
          ]]
        ]) +
        vBlock('0.0.3-beta', '', [
          ['New Features', [
            'LAN peer discovery via UDP broadcasting',
            'Local echo channel for testing, Friend list with online status'
          ]]
        ]) +
        vBlock('0.0.2-beta', '', [
          ['New Features', [
            'Early development release with core messaging infrastructure',
            'User identity and profile system, Settings and preferences framework'
          ]]
        ]) +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('changelog-close-mobile');
    if (closeBtn) closeBtn.addEventListener('click', function() { overlay.remove(); });
  }

  function showLightModeWarning(onConfirm, onCancel) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:99999;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    overlay.innerHTML =
      '<div style="background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:16px;padding:28px 24px;max-width:400px;width:90%;box-shadow:0 24px 48px rgba(0,0,0,0.4);text-align:center;">' +
        '<div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#FFD93D,#FF6B6B);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg></div>' +
        '<h3 style="font-family:var(--font-display);font-size:18px;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>CAUTION : Light Mode</h3>' +
        '<p style="font-size:14px;color:var(--text-secondary);line-height:1.6;margin-bottom:6px;">' +
          'Are you <b>ABSOLUTELY</b> sure you want to switch to <br><span style="color:#FFD93D;font-weight:700;">Light Mode</span>?' +
        '</p>' +
        '<p style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:16px;">' +
          'This will deploy a tactical <b style="color:var(--accent-warning);">FLASHBANG</b> to your retinas. ' +
          'Side effects may include temporary blindness and an urge to switch back immediately.' +
        '</p>' +
        '<label style="display:flex;align-items:center;gap:8px;justify-content:center;font-size:13px;color:var(--text-muted);cursor:pointer;margin-bottom:16px;">' +
          '<input id="light-mode-nobang-mobile" type="checkbox">' +
          '<span>Don\'t flashbang me next time</span>' +
        '</label>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
          '<button id="light-mode-cancel-mobile" style="padding:10px 18px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:13px;font-weight:500;">No thanks, I choose life</button>' +
          '<button id="light-mode-confirm-mobile" style="padding:10px 18px;border-radius:10px;border:none;background:linear-gradient(135deg,#FFD93D,#FF8C00);color:#000;cursor:pointer;font-size:13px;font-weight:700;display:inline-flex;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Flashbang me</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#light-mode-cancel-mobile').addEventListener('click', function() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s';
      setTimeout(function() { overlay.remove(); if (onCancel) onCancel(); }, 200);
    });
    overlay.addEventListener('click', function(ev) {
      if (ev.target === overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s';
        setTimeout(function() { overlay.remove(); if (onCancel) onCancel(); }, 200);
      }
    });

    overlay.querySelector('#light-mode-confirm-mobile').addEventListener('click', function() {
      overlay.remove();
      var noBang = overlay.querySelector('#light-mode-nobang-mobile').checked;
      if (onConfirm) onConfirm(noBang);
      if (!noBang) {
        var flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:999999;opacity:1;transition:opacity 0.8s ease;pointer-events:none;';
        document.body.appendChild(flash);
        setTimeout(function() {
          flash.style.opacity = '0';
          setTimeout(function() { flash.remove(); }, 800);
        }, 400);
      }
    });
  }

  var _fpsMonitorInterval = null;
  var _devOverlayEl = null;
  // Read/written as window._stopDevOverlay by the perf-mode block and the dev
  // overlay update loop; initialize so `!window._stopDevOverlay` is well-defined.
  window._stopDevOverlay = false;

  function toggleFpsMonitor(on) {
    if (on) {
      if (!document.getElementById('fps-monitor')) {
        var el = document.createElement('div');
        el.id = 'fps-monitor';
        el.style.cssText = 'position:fixed;top:4px;right:4px;z-index:99997;background:rgba(0,0,0,0.7);color:#0f0;font-family:monospace;font-size:11px;padding:4px 8px;border-radius:4px;pointer-events:none;';
        document.body.appendChild(el);
      }
      var frames = 0;
      var lastTime = performance.now();
      if (_fpsMonitorInterval) clearInterval(_fpsMonitorInterval);
      _fpsMonitorInterval = setInterval(function() {
        var now = performance.now();
        var fps = Math.round(frames * 1000 / (now - lastTime));
        var el = document.getElementById('fps-monitor');
        if (el) el.textContent = fps + ' FPS';
        frames = 0;
        lastTime = now;
      }, 1000);
      var rafLoop = function() { frames++; requestAnimationFrame(rafLoop); };
      requestAnimationFrame(rafLoop);
    } else {
      if (_fpsMonitorInterval) { clearInterval(_fpsMonitorInterval); _fpsMonitorInterval = null; }
      var el = document.getElementById('fps-monitor');
      if (el) el.remove();
    }
  }

  function toggleDevOverlay(on) {
    if (on) {
      if (_devOverlayEl) { _devOverlayEl.style.display = 'block'; return; }
      _devOverlayEl = document.createElement('div');
      _devOverlayEl.id = 'dev-overlay';
      _devOverlayEl.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99997;background:rgba(0,0,0,0.7);color:#0af;font-family:monospace;font-size:10px;padding:6px 10px;border-radius:4px;pointer-events:none;line-height:1.6;max-width:200px;';
      document.body.appendChild(_devOverlayEl);
      var update = function() {
        if (!_devOverlayEl) return;
        var conns = (window.Orbit && Orbit.P2P ? Orbit.P2P.getConnections().length : 0);
        var friends = MStore.friends.length;
        var chats = MStore.chats.length;
        var msgs = 0;
        var allKeys = [];
        OrbitKeys.list('msg_').forEach(function(id) { allKeys.push(id); });
        allKeys.forEach(function(k) { msgs += (MStore.messages[k] || MStore.getMessages(k)).length; });
        _devOverlayEl.innerHTML = 'Friends: ' + friends + '<br>Chats: ' + chats + '<br>Messages: ' + msgs + '<br>P2P Conns: ' + conns;
        if (MStore.settings.experimentalDevOverlay && !window._stopDevOverlay) requestAnimationFrame(update);
      };
      update();
    } else {
      if (_devOverlayEl) { _devOverlayEl.remove(); _devOverlayEl = null; }
    }
  }

  // Every token a custom theme can set. Kept as a list rather than read from the
  // saved colours alone, so a token that was customised once and then dropped is
  // still cleared when another theme is chosen.
  var CUSTOM_THEME_KEYS = ['bg-base','bg-surface','bg-sidebar','bg-hover','bg-active',
    'text-primary','text-secondary','text-muted','text-inverse',
    'accent-primary','accent-hover','accent-soft',
    'accent-danger','accent-success','accent-warning',
    'border-subtle','border-strong'];

  function applyTheme(theme) {
    if (theme === 'system') {
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'seasonal') {
      var month = new Date().getMonth();
      var seasonTheme;
      if (month >= 2 && month <= 4) seasonTheme = 'seasonal-spring';
      else if (month >= 5 && month <= 7) seasonTheme = 'seasonal-summer';
      else if (month >= 8 && month <= 9) seasonTheme = 'seasonal-fall';
      else seasonTheme = 'seasonal-winter';
      document.documentElement.setAttribute('data-theme', seasonTheme);
    } else if (theme === 'custom') {
      // There is no custom theme stylesheet, here or on the desktop: a custom theme
      // is the dark base with the user's own values layered over it. Mobile never
      // did the layering, so a custom theme set on the desktop was silently ignored
      // on the phone — data-theme was set to "custom", no stylesheet matched, and
      // the app fell back to the base theme.
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }

    // Layer the saved colours on, or clear them for any other theme.
    var stored = MStore.settings.customThemeColors || null;
    var use = (theme === 'custom' && stored) ? stored : null;
    var keys = CUSTOM_THEME_KEYS.concat(Object.keys(stored || {}));
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (use && use[key]) document.documentElement.style.setProperty('--' + key, use[key]);
      else document.documentElement.style.removeProperty('--' + key);
    }
  }

  /**
   * Whether your own messages keep the accent fill or match everyone else's.
   *
   * Separate from `messageBubbles` (Modern/Compact), which is about DENSITY —
   * folding a colour choice into that selector would make the two impossible to
   * reason about together.
   */
  function applyClassicBubbles() {
    if (MStore.settings.classicBubbles) {
      document.documentElement.setAttribute('data-classic-bubbles', 'true');
    } else {
      document.documentElement.removeAttribute('data-classic-bubbles');
    }
  }

  function applyBgPattern() {
    var p = MStore.settings.bgPattern || 'None';
    if (p === 'Dots') {
      document.documentElement.style.setProperty('--chat-bg-image', 'radial-gradient(var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else if (p === 'Grid') {
      document.documentElement.style.setProperty('--chat-bg-image', 'linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)');
      document.documentElement.style.setProperty('--chat-bg-size', '20px 20px');
    } else {
      document.documentElement.style.setProperty('--chat-bg-image', 'none');
    }
  }

  // ── Per-chat wallpaper helpers ──
  function applyChatWallpaper(chatId) {
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    var chat = MStore.chats.find(function(c) { return c.id === chatId; });
    if (chat && chat.wallpaper) {
      feed.style.setProperty('--chat-wallpaper-url', 'url("' + chat.wallpaper + '")');
      feed.classList.add('has-wallpaper');
    } else {
      feed.classList.remove('has-wallpaper');
      feed.style.removeProperty('--chat-wallpaper-url');
    }
  }

  function clearChatWallpaper() {
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    feed.classList.remove('has-wallpaper');
    feed.style.removeProperty('--chat-wallpaper-url');
  }

  // ── Wallpaper picker UI ──
  function showChatWallpaperPicker() {
    if (!activeChatId) return;
    var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
    if (!chat) return;

    var hasWallpaper = !!chat.wallpaper;
    var previewHtml = hasWallpaper
      ? '<div style="width:100%;height:80px;border-radius:12px;margin:8px 0;background-size:cover;background-position:center;background-image:url(' + chat.wallpaper + ');border:1px solid var(--border-subtle);"></div>'
      : '<div style="width:100%;height:48px;border-radius:12px;margin:8px 0;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px;">No wallpaper set</div>';

    var html = '<div class="action-sheet-overlay" id="wallpaper-picker-sheet" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;">' +
      '<div class="action-sheet-content" style="background:var(--bg-surface);border-radius:24px 24px 0 0;padding:24px 16px;animation:slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);">' +
        '<div class="bottom-sheet-handle" style="width:40px;height:5px;background:var(--border-subtle);border-radius:4px;margin:0 auto 24px;"></div>' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--text-primary);">Chat Wallpaper</div>' +
        '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Set a custom wallpaper behind messages for this chat only.</div>' +
        '<div id="wallpaper-preview-area">' + previewHtml + '</div>' +
        '<div class="action-btn" id="action-choose-wallpaper" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
          '<i data-lucide="image"></i> Choose Photo' +
        '</div>' +
        (hasWallpaper
          ? '<div class="action-btn" id="action-remove-wallpaper" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--accent-danger);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="trash-2"></i> Remove Wallpaper' +
          '</div>'
          : '') +
      '</div>' +
    '</div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    var sheet = div.firstChild;
    document.body.appendChild(sheet);
    // Drag-down-to-close (grab the visual content panel)
    if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
      OrbitSheet.enableDragClose({ sheet: sheet.firstElementChild, onClose: function () { sheet.remove(); } });
    }
    renderLucide({ root: sheet });

    sheet.addEventListener('click', function(e) {
      if (e.target === sheet) sheet.remove();
    });

    document.getElementById('action-choose-wallpaper').addEventListener('click', function() {
      sheet.remove();
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(ev) {
        var file = ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev2) {
          MStore.compressImage(ev2.target.result, 1200, 1200, 0.7, function(compressedUrl) {
            chat.wallpaper = compressedUrl;
            MStore.save();
            applyChatWallpaper(activeChatId);
            showToast('Chat wallpaper updated', 'success');
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });

    var removeBtn = document.getElementById('action-remove-wallpaper');
    if (removeBtn) {
      removeBtn.addEventListener('click', function() {
        sheet.remove();
        chat.wallpaper = null;
        MStore.save();
        clearChatWallpaper();
        showToast('Chat wallpaper removed', 'info');
      });
    }
  }

  function applyAnimationSettings() {
    var s = MStore.settings;
    if (s.animations === false) {
      document.documentElement.setAttribute('data-animations', 'off');
    } else {
      document.documentElement.removeAttribute('data-animations');
    }
    if (s.reduceMotion) {
      document.documentElement.setAttribute('data-reduce-motion', 'true');
      freezeGifImages(document);
    } else {
      document.documentElement.removeAttribute('data-reduce-motion');
    }
    if (s.animSpeed && s.animSpeed !== 'normal') {
      document.documentElement.setAttribute('data-anim-speed', s.animSpeed);
    } else {
      document.documentElement.removeAttribute('data-anim-speed');
    }
  }

  function applyFontSize() {
    document.documentElement.setAttribute('data-font-size', (MStore.settings.fontSize || 'Medium').toLowerCase());
  }

  function updateDebugOverlay() {
    var el = document.getElementById('debug-overlay');
    if (!el) return;
    if (!MStore.settings.debugDisplay && !MStore.settings.devMode) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    var lines = [];
    if (MStore.settings.devMode) {
      lines.push('devMode=ON');
    }
    if (MStore.settings.showConnectionStats) {
      var online = MStore.friends.filter(function(f) { return f.status && f.status !== 'offline'; }).length;
      var chatCount = MStore.chats.length;
      var msgCount = 0;
      var allKeys = [];
      OrbitKeys.list('msg_').forEach(function(id) { allKeys.push(id); });
      allKeys.forEach(function(k) { msgCount += (MStore.messages[k] || MStore.getMessages(k)).length; });
      lines.push('friends=' + MStore.friends.length + ' online=' + online + ' chats=' + chatCount + ' msgs=' + msgCount);
      if (window.Orbit && window.Orbit.P2P) {
        lines.push('p2p=' + (Orbit.P2P.isAvailable() ? 'avail' : 'unavail'));
      }
    }
    if (MStore.settings.debugDisplay) {
      var storeSize = 0;
      try { storeSize = new Blob([JSON.stringify(MStore.settings)]).size; } catch(e) {}
      lines.push('store=' + (storeSize / 1024).toFixed(1) + 'KB theme=' + (MStore.settings.theme || 'dark'));
    }
    el.textContent = lines.join(' • ');
  }

  function updateDebugStats() {
    if (MStore.settings.showConnectionStats || MStore.settings.debugDisplay || MStore.settings.devMode) {
      updateDebugOverlay();
    }
    if (MStore.settings.showConnectionStats) {
      setTimeout(updateDebugStats, 5000);
    }
  }

  function toggleNetworkPortFields(mode) {
    var ids = ['net-udp', 'net-tcp', 'net-maxsize'];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var row = el.closest('.settings-row');
      if (!row) return;
      row.style.display = (mode === 'Custom IP') ? '' : 'none';
    });
  }

  function bindSelect(id, onChange) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', function() {
      if (onChange) onChange(this.value);
    });
  }

  function bindToggle(id, onChange, initialState) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function() {
      var on = this.classList.toggle('on');
      if (onChange) onChange(on);
    });
  }

  /* -- Profile Panel (editable) -- */
  /**
   * Paint the hero's banner — through the <img> layer, never a background.
   *
   * There were three places doing `heroEl.style.backgroundImage = 'url(...)'`,
   * and `.profile-hero { background: transparent !important }` resets
   * background-image. A stylesheet `!important` beats a non-important inline
   * style, so all three did nothing: you crop a banner, the modal closes, the URL
   * field fills in, and the hero does not move.
   *
   * The save path also gated the banner on `avatar` — so with no avatar set it
   * actively CLEARED the banner.
   *
   * @param {Element} heroEl  the .profile-hero to paint
   * @param {string}  url     the image, or a falsy value to remove the banner
   */
  function setHeroBanner(heroEl, url) {
    if (!heroEl) return;
    var band = heroEl.querySelector('.profile-hero-banner');
    if (!url) {
      if (band) band.remove();
      heroEl.classList.remove('has-banner');
      return;
    }
    if (!band) {
      band = document.createElement('img');
      band.className = 'profile-hero-banner';
      band.alt = '';
      band.draggable = false;
      heroEl.insertBefore(band, heroEl.firstChild);
    }
    band.src = url;
    heroEl.classList.add('has-banner');
  }

  function renderProfile() {
    var container = document.getElementById('profile-content');
    var u = MStore.user;
    var initial = u && u.name ? u.name.charAt(0).toUpperCase() : '?';

    // An <img>, not a CSS background — see the note in showProfileSheet. The
    // restyle's `background: transparent !important` on .profile-hero resets
    // background-image and beats an inline style, so this was invisible too.
    var hasBanner = !!(u && u.banner);
    var bannerHtml = hasBanner
      ? '<img class="profile-hero-banner" src="' + escapeHtml(u.banner) + '" alt="" draggable="false">'
      : '';

    var pfNum = getProfileFrame(MStore.settings);
    var selfFrameHtml = pfNum > 0 ? '<img src="icons/frames/pfp_frame_' + pfNum + '.png" class="pfp-frame" draggable="false" alt="">' : '';

    container.innerHTML =
      '<div class="profile-hero' + (hasBanner ? ' has-banner' : '') + '">' +
        bannerHtml +
        '<div class="profile-hero-bg"></div>' +
        '<div class="profile-hero-content">' +
          '<div class="profile-avatar-wrapper" style="position:relative;">' + (u.avatar ? '<img src="' + escapeHtml(u.avatar) + '">' : '<div class="avatar-placeholder">' + initial + '</div>') + selfFrameHtml + '</div>' +
          '<div class="profile-name">' + escapeHtml(u ? u.name : 'User') + '</div>' +
          '<div class="profile-id">#' + escapeHtml(u ? u.tag : '0000') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="profile-edit-body" style="padding: 16px;">' +
      '<div class="settings-section">' +
        '<div class="settings-section-title">Edit Profile</div>' +
        '<div class="settings-item">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Name</div>' +
          '<input class="profile-input" id="edit-username" value="' + escapeHtml(u ? u.name : '') + '" maxlength="32" placeholder="Your name" style="flex:1;background:transparent;border:none;color:var(--text-primary);text-align:right;font-size:15px;outline:none;min-width:0;">' +
        '</div>' +
        '<div class="settings-item" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
          '<div style="color:var(--text-secondary);font-size:14px;font-weight:600;">Bio</div>' +
          '<textarea class="profile-textarea" id="edit-bio" placeholder="Tell us about yourself..." maxlength="160" style="width:100%;box-sizing:border-box;background:var(--bg-hover);border-radius:12px;border:none;padding:12px;color:var(--text-primary);resize:none;outline:none;font-size:14px;min-height:80px;">' + escapeHtml(u && u.bio ? u.bio : '') + '</textarea>' +
        '</div>' +
        '<div class="settings-item">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Avatar</div>' +
          '<div style="display:flex;gap:8px;flex:1;min-width:0;">' +
            '<input class="profile-input" id="edit-avatar" value="' + escapeHtml(u && u.avatar ? u.avatar : '') + '" placeholder="URL" style="flex:1;min-width:0;background:transparent;border:none;color:var(--text-primary);font-size:14px;outline:none;text-align:right;">' +
            '<button class="profile-upload-btn" id="btn-upload-avatar" data-target="avatar" style="background:var(--bg-hover);border:none;color:var(--accent-primary);font-weight:700;padding:6px 12px;border-radius:10px;cursor:pointer;font-size:12px;text-transform:uppercase;flex-shrink:0;">Edit</button>' +
          '</div>' +
        '</div>' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;width:70px;font-weight:600;">Banner</div>' +
          '<div style="display:flex;gap:8px;flex:1;min-width:0;">' +
            '<input class="profile-input" id="edit-banner" value="' + escapeHtml(u && u.banner ? u.banner : '') + '" placeholder="URL" style="flex:1;min-width:0;background:transparent;border:none;color:var(--text-primary);font-size:14px;outline:none;text-align:right;">' +
            '<button class="profile-upload-btn" id="btn-upload-banner" data-target="banner" style="background:var(--bg-hover);border:none;color:var(--accent-primary);font-weight:700;padding:6px 12px;border-radius:10px;cursor:pointer;font-size:12px;text-transform:uppercase;flex-shrink:0;">Edit</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (MStore.settings.profileFrames ? (
      '<div class="settings-section">' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;flex-shrink:0;">Frame</div>' +
          '<select id="profile-frame-select" style="background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:8px;padding:6px 10px;font-size:13px;outline:none;margin-left:auto;">' +
            (function() {
              var opts = '';
              for (var fi = 0; fi <= 42; fi++) {
                opts += '<option value="' + fi + '"' + (MStore.settings.profileFrame == fi ? ' selected' : '') + '>' + (fi === 0 ? 'None' : '#' + fi) + '</option>';
              }
              return opts;
            })() +
          '</select>' +
        '</div>' +
      '</div>'
      ) : '') +
      '<div class="settings-section">' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;flex-shrink:0;">User ID</div>' +
          '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);word-break:break-all;text-align:right;margin-left:10px;">' + escapeHtml(u ? u.id : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="height:64px;"></div>' +
      '</div>';
    renderLucide({ root: container });

    function checkChanges() {
      var username = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar').value.trim();
      var banner = document.getElementById('edit-banner').value.trim();
      
      var changed = (username !== (u && u.name ? u.name : '')) ||
                    (bio !== (u && u.bio ? u.bio : '')) ||
                    (avatar !== (u && u.avatar ? u.avatar : '')) ||
                    (banner !== (u && u.banner ? u.banner : ''));
      
      document.getElementById('btn-save-profile-header').style.display = changed ? 'block' : 'none';
    }

    document.getElementById('edit-username').addEventListener('input', checkChanges);
    document.getElementById('edit-bio').addEventListener('input', checkChanges);
    document.getElementById('edit-avatar').addEventListener('input', checkChanges);
    document.getElementById('edit-banner').addEventListener('input', checkChanges);

    // Enter key in avatar/banner URL inputs opens cropper
    document.getElementById('edit-avatar').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = this.value.trim();
        if (val) {
          window._loadImageCropper(function() {
            window.ImageCropper.open(val, {
              aspectRatio: 1, cropWidth: 300, cropHeight: 300, title: 'Crop Avatar'
            }, function(result) {
              if (result) {
                document.getElementById('edit-avatar').value = result;
                checkChanges();
              }
            });
          });
        }
      }
    });
    document.getElementById('edit-banner').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = this.value.trim();
        if (val) {
          window._loadImageCropper(function() {
            window.ImageCropper.open(val, {
              aspectRatio: 3, cropWidth: 600, cropHeight: 200, title: 'Crop Banner'
            }, function(result) {
              if (result) {
                document.getElementById('edit-banner').value = result;
                checkChanges();
              }
            });
          });
        }
      }
    });

    // Profile frame selector
    var frameSelect = document.getElementById('profile-frame-select');
    if (frameSelect) {
      frameSelect.addEventListener('change', function() {
        MStore.settings.profileFrame = parseInt(this.value, 10) || 0;
        MStore.save();
        renderProfile();
        updateNavAvatar();
        renderChatList();
        renderFriends();
        renderSettings();
      });
    }

    // File upload handlers for avatar/banner using cropper
    function setupProfileUpload(btnId, inputId) {
      var btn = document.getElementById(btnId);
      if (!btn) return;
      btn.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.style.display = 'none';
        document.body.appendChild(input);
        input.addEventListener('change', function() {
          if (this.files && this.files[0]) {
            var file = this.files[0];
            var isAvatar = inputId === 'edit-avatar';
            window._loadImageCropper(function() {
              window.ImageCropper.open(file, {
                aspectRatio: isAvatar ? 1 : 3,
                cropWidth: isAvatar ? 300 : 600,
                cropHeight: isAvatar ? 300 : 200,
                title: isAvatar ? 'Crop Avatar' : 'Crop Banner'
              }, function(result) {
                if (result) {
                  document.getElementById(inputId).value = result;
                  checkChanges();
                }
              });
            });
          }
          document.body.removeChild(input);
        });
        input.click();
      });
    }
    setupProfileUpload('btn-upload-avatar', 'edit-avatar');
    setupProfileUpload('btn-upload-banner', 'edit-banner');

    // Remove any previous event listeners on the header save button
    var oldBtn = document.getElementById('btn-save-profile-header');
    var newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.style.display = 'none'; // reset state

    // Bind save button
    newBtn.addEventListener('click', function() {
      var username = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar').value.trim();
      var banner = document.getElementById('edit-banner').value.trim();

      if (!username) {
        showToast('Username cannot be empty', 'info');
        return;
      }

      MStore.user.name = username;
      MStore.user.bio = bio;
      MStore.user.avatar = avatar || null;
      MStore.user.banner = banner || null;
      MStore.save();

      // Re-render affected views
      updateNavAvatar();
      renderSettings();
      renderFriends();
      renderChatList();
      // Re-render this profile with updated values
      renderProfile();
      // Push updated profile into the UDP beacon (avatar thumbnail refresh)
      repushUdpBeacon();
      // Real-time broadcast to already-connected peers (fix #8)
      broadcastProfileToPeers();
      showToast('Profile saved', 'info');
      
      newBtn.style.display = 'none';
    });
  }

  function showProfileOverlay(chatId) {
    var friend = MStore.friends.find(function(f) { return f.id === chatId; });
    if (!friend) {
      // Fallback: resolve non-friend users from group membership (e.g. long-press on a group member row)
      var myId = MStore.user ? MStore.user.id : '';
      for (var _gi = 0; _gi < MStore.groups.length && !friend; _gi++) {
        var _g = MStore.groups[_gi];
        if (!_g || !_g.members) continue;
        for (var _mi = 0; _mi < _g.members.length; _mi++) {
          var _mm = _g.members[_mi];
          var _mmId = typeof _mm === 'string' ? _mm : _mm.userId;
          if (String(_mmId) === String(chatId)) {
            friend = {
              id: _mmId,
              name: _mm.name || _mm.username || _mmId,
              avatar: _mm.avatar || null,
              status: 'offline',
              tag: _mm.tag || '',
              bio: '',
              banner: null
            };
            break;
          }
        }
      }
    }
    if (!friend) { showToast('User not found', 'info'); return; }

    var initial = friend.name ? friend.name.charAt(0).toUpperCase() : '?';
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
    var statusColor = getStatusColor(friend.status);
    var frameNum = getProfileFrame(friend);

    var backdrop = document.createElement('div');
    backdrop.id = 'profile-view-overlay';
    backdrop.dataset.profileUserId = chatId;
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn 0.15s;';
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) backdrop.remove(); });

    var sheet = document.createElement('div');
    sheet.style.cssText = 'background:var(--bg-surface);border-radius:24px 24px 0 0;animation:slideUp 0.3s cubic-bezier(0.16,1,0.3,1);max-height:90dvh;overflow-y:auto;position:relative;';
    sheet.addEventListener('click', function(e) { e.stopPropagation(); });

    // Same <img>-not-background fix as the other two profile heroes. This one also
    // had a gradient fallback for "no banner", which the restyle replaced with the
    // blurred accent — so the fallback went too, and that was fine.
    var bannerUrl = friend.banner;
    var hasBanner = !!bannerUrl;
    var bannerHtml = hasBanner
      ? '<img class="profile-hero-banner" src="' + escapeHtml(bannerUrl) + '" alt="" draggable="false">'
      : '';

    var frameHtml = frameNum > 0 ? '<img src="icons/frames/pfp_frame_' + frameNum + '.png" class="pfp-frame" draggable="false" alt="">' : '';
    var fAvatarSrc = safeAvatarSrc(friend.avatar);
    var avatarEl = fAvatarSrc
      ? '<img src="' + fAvatarSrc + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<div class="avatar-placeholder">' + escapeHtml(initial) + '</div>';

    // Hero section (matching showProfileSheet style)
    var heroHtml =
      '<div class="profile-hero' + (hasBanner ? ' has-banner' : '') + '" style="padding: 44px 20px 30px;">' +
        bannerHtml +
        '<div class="profile-hero-bg"></div>' +
        // Drag handle
        '<div class="bottom-sheet-handle" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:40px;height:5px;background:rgba(255,255,255,0.4);border-radius:4px;z-index:3;"></div>' +
        // X button
        '<button id="btn-profile-view-close" style="position:absolute;top:8px;right:12px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.2);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:16px;z-index:3;transition:background 0.15s;">✕</button>' +
        '<div class="profile-hero-content">' +
          '<div class="profile-avatar-wrapper" style="position:relative;">' +
            avatarEl +
            frameHtml +
            // Status dot
            '<div style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:' + statusColor + ';border:3px solid var(--bg-surface);box-sizing:content-box;"></div>' +
          '</div>' +
          '<div class="profile-name">' + escapeHtml(friend.name) + '</div>' +
          (friend.tag ? '<div class="profile-id">#' + escapeHtml(friend.tag) + '</div>' : '') +
        '</div>' +
      '</div>';

    // Content section (About + Mutual Groups + buttons)
    var contentHtml =
      '<div style="padding: 0 16px 24px;">' +
        // About section
        (friend.bio ? '<div style="margin-top:12px;"><div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">About</div><div style="font-size:14px;color:var(--text-secondary);line-height:1.5;padding:0 4px;">' + (window.Sanitize ? window.Sanitize.markdown(friend.bio) : escapeHtml(friend.bio)) + '</div></div>' : '') +
        // Mutual groups
        '<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Mutual Groups</div><div style="font-size:14px;color:var(--text-secondary);padding:0 4px;">' + MStore.groups.filter(function(g) { return g.members && g.members.find(function(m) { return (typeof m === 'string' ? m : m.userId) === friend.id; }); }).length + ' groups in common</div></div>' +
        // Dev mode ID
        (MStore.settings.devMode && friend.id ? '<div style="margin-top:12px;padding:0 4px;"><div style="font-size:10px;color:var(--text-muted);word-break:break-all;font-family:monospace;">ID: ' + escapeHtml(friend.id) + '</div></div>' : '') +
        // Buttons
        '<div style="margin-top:20px;display:flex;flex-direction:column;gap:8px;">' +
          '<button id="btn-profile-view-message" style="width:100%;padding:14px;background:var(--accent-primary);border:none;border-radius:12px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;transition:opacity 0.15s;">Message</button>' +
          '<button id="btn-profile-view-close-bottom" style="width:100%;padding:12px;background:var(--bg-hover);border:none;border-radius:12px;color:var(--text-primary);font-size:15px;font-weight:600;cursor:pointer;transition:background 0.15s;">Close</button>' +
        '</div>' +
      '</div>';

    sheet.innerHTML = heroHtml + contentHtml;
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);
    // Drag-down-to-close (grab the hero handle)
    if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
      OrbitSheet.enableDragClose({ sheet: sheet, onClose: function () { backdrop.remove(); } });
    }
    renderLucide({ root: sheet });

    // Close buttons
    document.getElementById('btn-profile-view-close').addEventListener('click', function() { backdrop.remove(); });
    document.getElementById('btn-profile-view-close-bottom').addEventListener('click', function() { backdrop.remove(); });

    // Message button - opens DM
    document.getElementById('btn-profile-view-message').addEventListener('click', function() {
      backdrop.remove();
      openChat(chatId);
    });
  }

  function refreshProfileOverlay(chatId) {
    var overlay = document.querySelector('#profile-view-overlay');
    if (!overlay || overlay.dataset.profileUserId !== chatId) return;
    overlay.remove();
    showProfileOverlay(chatId);
  }

  /* ---- User Actions Sheet (long-press on a user: sender names, avatars, group member rows, friend rows, DM header) ---- */

  /** Resolve a userId to a displayable user (friend first, then group member, then raw id fallback) */
  function _resolveUserForSheet(userId) {
    if (!userId) return null;
    // 1. Friends — canonical id or peerId alias
    var friend = MStore.friends.find(function(f) { return f.id === userId || f.peerId === userId; });
    if (friend) {
      return { id: friend.id, name: friend.name || friend.id, avatar: friend.avatar || null, status: friend.status || 'offline', tag: friend.tag || '', isFriend: true };
    }
    // 2. Group members (any group this user belongs to)
    var groups = MStore.groups || [];
    for (var gi = 0; gi < groups.length; gi++) {
      var members = groups[gi].members || [];
      for (var mi = 0; mi < members.length; mi++) {
        var m = members[mi];
        var mid = typeof m === 'string' ? m : m.userId;
        if (String(mid) === String(userId)) {
          var f = MStore.friends.find(function(fr) { return fr.id === mid || fr.peerId === mid; });
          return {
            id: mid,
            name: f ? f.name : (m.name || m.username || mid),
            avatar: f ? f.avatar : (m.avatar || null),
            status: f ? (f.status || 'offline') : 'offline',
            tag: f ? (f.tag || '') : (m.tag || ''),
            isFriend: !!f
          };
        }
      }
    }
    // 3. Fallback — unknown user (view-profile/message still work with the raw id)
    return { id: userId, name: userId, avatar: null, status: 'offline', tag: '', isFriend: false };
  }

  /** Find an existing DM chat for a user, or create one (plain peer id — matches P2P receive convention) */
  function _ensureDmChatForUser(userId, userName) {
    if (!userId) return null;
    var chats = MStore.chats || [];
    for (var i = 0; i < chats.length; i++) {
      var c = chats[i];
      if (c.id === userId || c.id === 'dm_' + userId || c.peerId === userId) return c;
    }
    var chat = { id: userId, peerId: userId, name: userName || userId, lastMessage: '', lastTime: '', unread: 0 };
    MStore.chats.push(chat);
    MStore.save();
    if (typeof renderChatList === 'function') renderChatList();
    return chat;
  }

  /**
   * Bottom sheet for a user: View Profile / Message / Add Friend / Close DM / Block.
   * Only actions that apply are shown (Add Friend & Close DM are friend-only, etc.).
   */
  function showUserActionsSheet(userId, sourceContext, extraItems) {
    if (typeof OrbitSheet === 'undefined' || !OrbitSheet.show) return;
    var myId = MStore.user ? MStore.user.id : '';
    if (!userId || String(userId) === String(myId)) return; // never for yourself

    var u = _resolveUserForSheet(userId);
    if (!u) { showToast('User not found', 'info'); return; }

    var items = [];
    var callbacks = {};

    // View Profile — works for friends and group members (showProfileOverlay resolves both)
    items.push({ icon: 'user-round', label: 'View Profile', subtext: u.status || '', action: 'user_view_profile' });
    callbacks['user_view_profile'] = function() {
      if (typeof showProfileOverlay === 'function') showProfileOverlay(u.id);
      else showToast(u.name + ' — ' + (u.status || 'offline'), 'info');
    };

    // Message — open the DM (creates it if the store has none)
    items.push({ icon: 'message-circle', label: 'Message', action: 'user_message' });
    callbacks['user_message'] = function() {
      var chat = _ensureDmChatForUser(u.id, u.name);
      if (chat && typeof openChat === 'function') openChat(chat.id);
      else showToast('No active chat with this user', 'info');
    };

    // Mute / Unmute notifications (friends only — preserves the legacy friend menu behavior)
    if (u.isFriend) {
      var isMuted = !!(MStore.settings.mutedChats && MStore.settings.mutedChats[u.id]);
      items.push({ icon: isMuted ? 'bell' : 'bell-off', label: isMuted ? 'Unmute Notifications' : 'Mute Notifications', action: 'user_mute' });
      (function(muted) {
        callbacks['user_mute'] = function() {
          if (!MStore.settings.mutedChats) MStore.settings.mutedChats = {};
          if (muted) {
            delete MStore.settings.mutedChats[u.id];
          } else {
            MStore.settings.mutedChats[u.id] = true;
          }
          MStore.save();
          showToast(muted ? 'Unmuted' : 'Muted', 'info');
        };
      })(isMuted);
    }

    // Add Friend — only when they are not already a friend
    if (!u.isFriend) {
      items.push({ icon: 'user-round-plus', label: 'Add Friend', action: 'user_add_friend' });
      callbacks['user_add_friend'] = function() {
        var peerId = u.id;
        var existing = MStore.friends.find(function(f) { return f.id === peerId || f.peerId === peerId; });
        if (existing) {
          showToast(u.name + ' is already a friend', 'info');
          return;
        }
        MStore.friends.push({ id: peerId, name: u.name, tag: u.tag || '', status: 'offline', avatar: u.avatar || null, bio: '', ip: null, publicKey: null });
        var chatExists = MStore.chats.find(function(c) { return c.id === peerId || c.id === 'dm_' + peerId; });
        if (!chatExists) {
          MStore.chats.push({ id: peerId, name: u.name, lastMessage: '', lastTime: '', unread: 0 });
        }
        MStore.save();
        if (typeof renderFriends === 'function') renderFriends();
        if (typeof renderChatList === 'function') renderChatList();
        showToast(u.name + ' added as friend', 'info');
      };
    }

    // Close DM — canonical close-DM flow (also removes the friend entry, matching the legacy menu)
    if (u.isFriend) {
      items.push({ icon: 'x', label: 'Close DM', action: 'user_close_dm' });
      callbacks['user_close_dm'] = function() {
        var dmId = u.id;
        MStore.chats = MStore.chats.filter(function(c) { return c.id !== dmId && c.id !== 'dm_' + dmId; });
        delete MStore.messages[dmId];
        delete MStore.messages['dm_' + dmId];
        OrbitKeys.remove('msg_' + dmId);
        OrbitKeys.remove('msg_dm_' + dmId);
        MStore.friends = MStore.friends.filter(function(f) { return f.id !== dmId; });
        MStore.save();
        if ((activeChatId === dmId || activeChatId === 'dm_' + dmId) && typeof closeChat === 'function') closeChat();
        if (typeof renderChatList === 'function') renderChatList();
        if (typeof renderFriends === 'function') renderFriends();
        showToast(u.name + ' — DM closed', 'info');
      };
    }

    // Block / Unblock — always available
    var isBlocked = MStore.blockedUsers && MStore.blockedUsers.indexOf(u.id) !== -1;
    items.push({ icon: isBlocked ? 'user-check' : 'ban', label: isBlocked ? 'Unblock User' : 'Block User', action: 'user_block' });
    (function(blocked) {
      callbacks['user_block'] = function() {
        if (blocked) {
          MStore.blockedUsers = MStore.blockedUsers.filter(function(id) { return id !== u.id; });
          showToast(u.name + ' unblocked', 'info');
        } else {
          MStore.blockedUsers = MStore.blockedUsers.concat([u.id]);
          showToast(u.name + ' blocked', 'info');
        }
        MStore.save();
      };
    })(isBlocked);

    // Extras from the caller — entries that are about the CHAT rather than the
    // person (currently folder membership, handed over by the contact row's ⋮
    // menu). Appended after the user's own actions so the person stays the
    // subject of the sheet, and skipped silently if malformed.
    (extraItems || []).forEach(function (e) {
      if (!e || !e.item) return;
      items.push(e.item);
      if (e.callback) callbacks[e.item.action] = e.callback;
    });

    OrbitSheet.show(items);
    OrbitSheet._callbacks = callbacks;
  }

  window.showUserActionsSheet = showUserActionsSheet;

  // The composer's attach sheet (js/components/attach-sheet.js) is a separate file
  // and cannot see inside this closure, so the two things it opens are handed out
  // here. Both are thin: the poll builder is the /poll builder, and the command
  // reference is the same modal /help opens. Nothing new is composed for the sheet.
  window.showHelpModal = showHelpModal;
  window.openPollBuilder = function () {
    // `anyChat` because a poll is a composer action, not a group-only utility.
    return _handleSlashCommand('/poll', null, { anyChat: true });
  };

  /** Show own profile as a slide-up bottom sheet */
  function showProfileSheet() {
    var u = MStore.user;
    if (!u) { showToast('No user data', 'info'); return; }

    // The profile and the account switcher are two views of the same thing and
    // must never be stacked. Whoever opens second closes the other.
    // _returnTo is cleared first: otherwise closing the switcher would bounce
    // straight back to the profile we are about to show, forever.
    if (window.OrbitAccounts) {
      window.OrbitAccounts._returnTo = null;
      window.OrbitAccounts.close();
    }

    // Store initial values for change detection
    var _origName = u.name || '';
    var _origBio = u.bio || '';
    var _origAvatar = u.avatar || '';
    var _origBanner = u.banner || '';
    var _hasUnsavedChanges = false;

    var backdrop = document.createElement('div');
    backdrop.id = 'profile-sheet-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;justify-content:flex-end;animation:fadeIn 0.15s;';

    // Close handler with unsaved changes protection
    function closeProfileSheet() {
      if (_hasUnsavedChanges) {
        if (confirm('You have unsaved changes. Save before leaving?')) {
          saveProfileChanges();
          backdrop.remove();
          showPillLocal();
        } else {
          backdrop.remove();
          showPillLocal();
        }
      } else {
        backdrop.remove();
        showPillLocal();
      }
      // The switcher checks this before opening, so clear it — a stale closer
      // would try to remove an element that is already gone.
      if (window._closeProfileSheet === closeProfileSheet) window._closeProfileSheet = null;
    }

    // Let the account switcher close us when it opens. It cannot reach into this
    // closure, so it gets a handle instead.
    window._closeProfileSheet = closeProfileSheet;

    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeProfileSheet(); });

    var sheet = document.createElement('div');
    sheet.className = 'profile-sheet-scroll';
    sheet.style.cssText = 'background:var(--bg-surface);border-radius:24px 24px 0 0;animation:slideUp 0.3s cubic-bezier(0.16,1,0.3,1);max-height:90dvh;overflow-y:auto;position:relative;';
    sheet.addEventListener('click', function(e) { e.stopPropagation(); });

    var initial = u.name ? u.name.charAt(0).toUpperCase() : '?';
    // The banner is an <img>, not a CSS background. It used to be an inline
    // `background-image` on .profile-hero, and the restyle layer sets
    // `background: transparent !important` on that element — the shorthand resets
    // background-image, and a stylesheet `!important` beats a non-important inline
    // style. So every custom banner became invisible and nobody noticed, because
    // the element still looked deliberate with the blurred accent behind it.
    // An <img> cannot be reached by a background rule.
    var hasBanner = !!u.banner;
    var bannerHtml = hasBanner
      ? '<img class="profile-hero-banner" src="' + escapeHtml(u.banner) + '" alt="" draggable="false">'
      : '';
    var pfNum = getProfileFrame(MStore.settings);
    var frameHtml = pfNum > 0 ? '<img src="icons/frames/pfp_frame_' + pfNum + '.png" class="pfp-frame" draggable="false" alt="">' : '';

    // Build profile content HTML (hero + edit form)
    var contentHtml =
      // Hero section with drag handle + action button overlaid inside
      '<div class="profile-hero' + (hasBanner ? ' has-banner' : '') + '" style="padding: 44px 20px 30px;">' +
        bannerHtml +
        '<div class="profile-hero-bg"></div>' +
        // Drag handle overlay (centered at top)
        '<div class="bottom-sheet-handle" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);width:40px;height:5px;background:rgba(255,255,255,0.4);border-radius:4px;z-index:3;"></div>' +
        // Top row: the account switcher on the left, close/save on the right.
        // Tapping the header avatar used to open the switcher directly; that is
        // this button now, and the avatar opens the profile.
        '<button id="btn-profile-sheet-accounts" class="profile-sheet-btn" title="Accounts"><i data-lucide="users"></i></button>' +
        '<button id="btn-profile-sheet-action" class="profile-sheet-btn profile-sheet-btn-end" title="Close">✕</button>' +
        '<div class="profile-hero-content">' +
          '<div class="profile-avatar-wrapper" style="position:relative;">' +
            (safeAvatarSrc(u.avatar) ? '<img src="' + safeAvatarSrc(u.avatar) + '">' : '<div class="avatar-placeholder">' + escapeHtml(initial) + '</div>') +
            frameHtml +
          '</div>' +
          '<div class="profile-name">' + escapeHtml(u.name) + '</div>' +
          '<div class="profile-id">#' + escapeHtml(u.tag || '0000') + '</div>' +
        '</div>' +
      '</div>';

    // Create the profile content container for renderProfile to use
    var editContainer = document.createElement('div');
    editContainer.id = 'profile-sheet-edit-content';
    sheet.innerHTML = contentHtml;
    sheet.appendChild(editContainer);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    // The accounts button carries a lucide glyph, which has to be swapped in
    // after the markup is in the document.
    if (window.lucide && lucide.createIcons) {
      try { lucide.createIcons({ root: sheet }); } catch (e) {}
    }

    var accountsBtn = document.getElementById('btn-profile-sheet-accounts');
    if (accountsBtn) {
      accountsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        // Switching accounts leaves this sheet behind, and its unsaved-changes
        // prompt would fire over a screen that no longer owns it.
        _hasUnsavedChanges = false;
        closeProfileSheet();
        // returnTo so closing the switcher comes back here rather than dropping
        // the user on the chat list.
        if (window.OrbitAccounts) window.OrbitAccounts.open({ returnTo: 'profile' });
      });
    }

    // Drag-down-to-close (grab the hero handle)
    OrbitSheet.enableDragClose({ sheet: sheet, onClose: function () { closeProfileSheet(); } });

    // Save function
    function saveProfileChanges() {
      var username = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar-sheet').value.trim();
      var banner = document.getElementById('edit-banner-sheet').value.trim();
      if (!username) { showToast('Username cannot be empty', 'info'); return false; }
      MStore.user.name = username;
      MStore.user.bio = bio;
      MStore.user.avatar = avatar || null;
      MStore.user.banner = banner || null;
      MStore.save();
      updateNavAvatar();
      renderSettings();
      renderFriends();
      renderChatList();
      renderProfile();
      // Broadcast updated profile to all connected peers in real time
      broadcastProfileToPeers();
      // Push updated profile into the UDP beacon (avatar thumbnail refresh)
      repushUdpBeacon();
      // Update stored originals and reset state
      _origName = username;
      _origBio = bio;
      _origAvatar = avatar;
      _origBanner = banner;
      _hasUnsavedChanges = false;
      // Switch button back to X
      var actionBtn = document.getElementById('btn-profile-sheet-action');
      if (actionBtn) {
        actionBtn.textContent = '✕';
        actionBtn.style.fontSize = '16px';
        actionBtn.style.background = 'rgba(0,0,0,0.2)';
        actionBtn.onclick = closeProfileSheet;
      }
      // The header avatar is refreshed by updateNavAvatar() above — this block
      // used to repaint the floating pill's avatar, name and frame.
      showToast('Profile saved', 'success');
      // Update the hero's banner and avatar. The banner goes through the <img>
      // layer, and is NOT gated on `avatar` — it used to be, so saving with no
      // avatar set cleared the banner you had just chosen.
      var heroEl = sheet.querySelector('.profile-hero');
      setHeroBanner(heroEl, banner);
      var avatarWrapper = sheet.querySelector('.profile-avatar-wrapper');
      if (avatarWrapper) {
        var img = avatarWrapper.querySelector('img');
        if (avatar) {
          if (img) {
            img.src = avatar;
          } else {
            var placeholder = avatarWrapper.querySelector('.avatar-placeholder');
            if (placeholder) {
              placeholder.outerHTML = '<img src="' + escapeHtml(avatar) + '">';
            } else {
              var _existingFrame = avatarWrapper.querySelector('.pfp-frame');
              avatarWrapper.innerHTML = '<img src="' + escapeHtml(avatar) + '">' + (_existingFrame ? _existingFrame.outerHTML : '');
            }
          }
        } else {
          // No avatar — show placeholder
          var newInitial = (MStore.user.name || '?').charAt(0).toUpperCase();
          avatarWrapper.innerHTML = '<div class="avatar-placeholder">' + newInitial + '</div>' + (avatarWrapper.querySelector('.pfp-frame') ? avatarWrapper.querySelector('.pfp-frame').outerHTML : '');
        }
      }
      return true;
    }

    // Now render the editable profile form into the sheet
    editContainer.innerHTML =
      '<div class="profile-edit-body" style="padding: 16px;">' +
      '<div class="settings-section">' +
        '<div class="settings-section-title">Edit Profile</div>' +
        '<div class="profile-field">' +
          '<label class="profile-field-label">Name</label>' +
          '<input class="profile-input" id="edit-username" value="' + escapeHtml(u.name) + '" maxlength="32" placeholder="Your display name">' +
        '</div>' +
        '<div class="profile-field">' +
          '<label class="profile-field-label">Bio</label>' +
          '<textarea class="profile-textarea" id="edit-bio" placeholder="Tell us about yourself..." maxlength="160" style="resize:none;min-height:80px;">' + escapeHtml(u.bio || '') + '</textarea>' +
        '</div>' +
        '<div class="profile-field">' +
          '<label class="profile-field-label">Avatar URL</label>' +
          '<div class="profile-input-row">' +
            '<input class="profile-input" id="edit-avatar-sheet" value="' + escapeHtml(u.avatar || '') + '" placeholder="https://example.com/avatar.jpg">' +
            '<button id="btn-pick-avatar" class="profile-image-pick-btn" type="button" title="Choose from gallery"><i data-lucide="image" style="width:18px;height:18px;"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="profile-field" style="border:none;margin-bottom:0;">' +
          '<label class="profile-field-label">Banner URL</label>' +
          '<div class="profile-input-row">' +
            '<input class="profile-input" id="edit-banner-sheet" value="' + escapeHtml(u.banner || '') + '" placeholder="https://example.com/banner.jpg">' +
            '<button id="btn-pick-banner" class="profile-image-pick-btn" type="button" title="Choose from gallery"><i data-lucide="image" style="width:18px;height:18px;"></i></button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Status selector
      '<div class="settings-section">' +
        '<div class="settings-section-title">Status</div>' +
        '<div class="settings-item" style="border:none;display:flex;align-items:center;gap:12px;">' +
          '<span class="status-dot status-' + (u.status || 'online') + '" style="width:14px;height:14px;border-radius:50%;flex-shrink:0;background:' + getStatusColor(u.status || 'online') + ';border:2px solid var(--bg-surface);box-sizing:content-box;"></span>' +
          '<select id="status-select" style="flex:1;background:var(--bg-hover);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:8px;padding:8px 10px;font-size:14px;outline:none;">' +
            '<option value="online"' + ((u.status || 'online') === 'online' ? ' selected' : '') + '>Online</option>' +
            '<option value="away"' + (u.status === 'away' ? ' selected' : '') + '>Away</option>' +
            
            '<option value="dnd"' + (u.status === 'dnd' ? ' selected' : '') + '>Do Not Disturb</option>' +
            '<option value="invisible"' + (u.status === 'invisible' ? ' selected' : '') + '>Invisible</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      (MStore.settings.profileFrames ? (
      '<div class="settings-section">' +
        '<div class="settings-section-title">Profile Frame</div>' +
        '<div class="settings-item" style="border:none;cursor:pointer;" id="frame-picker-btn">' +
          '<div style="display:flex;align-items:center;gap:12px;width:100%;padding:4px 0;">' +
            '<div style="width:40px;height:40px;border-radius:50%;background:var(--bg-base);flex-shrink:0;display:flex;align-items:center;justify-content:center;">' +
              (MStore.settings.profileFrame > 0 ? '<img src="icons/frames/pfp_frame_' + MStore.settings.profileFrame + '.png" style="width:125%;height:125%;pointer-events:none;object-fit:contain;flex-shrink:0;display:block;" draggable="false" alt="">' : '<span style="font-size:10px;color:var(--text-muted);">None</span>') +
            '</div>' +
            '<span style="flex:1;font-size:14px;color:var(--text-primary);">' + (MStore.settings.profileFrame > 0 ? 'Frame #' + MStore.settings.profileFrame : 'No Frame') + '</span>' +
            '<i data-lucide="chevron-up" style="width:16px;height:16px;color:var(--text-muted);flex-shrink:0;"></i>' +
          '</div>' +
        '</div>' +
      '</div>'
      ) : '') +
      '<div class="settings-section">' +
        '<div class="settings-item" style="border:none;">' +
          '<div style="color:var(--text-secondary);font-size:14px;flex-shrink:0;">User ID</div>' +
          '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);word-break:break-all;text-align:right;margin-left:10px;">' + escapeHtml(u.id) + '</div>' +
        '</div>' +
      '</div>' +
      '</div>';

    renderLucide({ root: sheet });

    // Hidden file input for image picking
    var _profileFileInput = document.createElement('input');
    _profileFileInput.type = 'file';
    _profileFileInput.accept = 'image/*';
    _profileFileInput.style.display = 'none';
    _profileFileInput.id = 'profile-file-input';
    sheet.appendChild(_profileFileInput);
    
    var _pickMode = null;
    _profileFileInput.addEventListener('change', function() {
      if (_pickMode && this.files && this.files[0]) {
        var file = this.files[0];
        var isAvatar = _pickMode === 'avatar';
        _pickMode = null;
        window._loadImageCropper(function() {
          window.ImageCropper.open(file, {
            aspectRatio: isAvatar ? 1 : 3,
            cropWidth: isAvatar ? 300 : 600,
            cropHeight: isAvatar ? 300 : 200,
            title: isAvatar ? 'Crop Avatar' : 'Crop Banner'
          }, function(result) {
            if (result) {
              var input = document.getElementById(isAvatar ? 'edit-avatar-sheet' : 'edit-banner-sheet');
              if (input) {
                input.value = result;
                checkChanges();
                // Also update the hero preview in real-time
                var heroEl = sheet.querySelector('.profile-hero');
                if (isAvatar) {
                  // Update avatar in hero
                  var avatarWrapper = sheet.querySelector('.profile-avatar-wrapper');
                  if (avatarWrapper) {
                    var img = avatarWrapper.querySelector('img');
                    if (img) {
                      img.src = result;
                    } else {
                      var ph = avatarWrapper.querySelector('.avatar-placeholder');
                      var frameEl = avatarWrapper.querySelector('.pfp-frame');
                      var frameStr = frameEl ? frameEl.outerHTML : '';
                      if (ph) {
                        ph.outerHTML = '<img src="' + result.replace(/"/g, '&quot;') + '">';
                      } else {
                        avatarWrapper.innerHTML = '<img src="' + result.replace(/"/g, '&quot;') + '">' + frameStr;
                      }
                    }
                  }
                } else {
                  // Live-preview the banner in the hero. Through the <img> layer —
                  // a background image here is reset by `background: transparent
                  // !important` on .profile-hero and does nothing at all.
                  setHeroBanner(heroEl, result);
                }
              }
            }
          });
        });
      }
      this.value = '';
    });
    
    document.getElementById('btn-pick-avatar').addEventListener('click', function() {
      _pickMode = 'avatar';
      _profileFileInput.click();
    });
    document.getElementById('btn-pick-banner').addEventListener('click', function() {
      _pickMode = 'banner';
      _profileFileInput.click();
    });

    // --- Change detection ---
    function checkChanges() {
      var name = document.getElementById('edit-username').value.trim();
      var bio = document.getElementById('edit-bio').value.trim();
      var avatar = document.getElementById('edit-avatar-sheet').value.trim();
      var banner = document.getElementById('edit-banner-sheet').value.trim();
      var changed = name !== _origName || bio !== _origBio || avatar !== _origAvatar || banner !== _origBanner;
      if (changed !== _hasUnsavedChanges) {
        _hasUnsavedChanges = changed;
        var actionBtn = document.getElementById('btn-profile-sheet-action');
        if (actionBtn) {
          if (changed) {
            actionBtn.textContent = '✓';
            actionBtn.style.fontSize = '18px';
            actionBtn.style.background = 'var(--accent-primary)';
            actionBtn.onclick = function() { saveProfileChanges(); };
          } else {
            actionBtn.textContent = '✕';
            actionBtn.style.fontSize = '16px';
            actionBtn.style.background = 'rgba(0,0,0,0.2)';
            actionBtn.onclick = closeProfileSheet;
          }
        }
      }
    }

    // Wire input listeners for change detection
    document.getElementById('edit-username').addEventListener('input', checkChanges);
    document.getElementById('edit-bio').addEventListener('input', checkChanges);
    document.getElementById('edit-avatar-sheet').addEventListener('input', checkChanges);
    document.getElementById('edit-banner-sheet').addEventListener('input', checkChanges);

    // Enter key in avatar/banner inputs opens cropper
    document.getElementById('edit-avatar-sheet').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = this.value.trim();
        if (val) {
          window._loadImageCropper(function() {
            window.ImageCropper.open(val, {
              aspectRatio: 1, cropWidth: 300, cropHeight: 300, title: 'Crop Avatar'
            }, function(result) {
              if (result) {
                document.getElementById('edit-avatar-sheet').value = result;
                checkChanges();
              }
            });
          });
        }
      }
    });
    document.getElementById('edit-banner-sheet').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var val = this.value.trim();
        if (val) {
          window._loadImageCropper(function() {
            window.ImageCropper.open(val, {
              aspectRatio: 3, cropWidth: 600, cropHeight: 200, title: 'Crop Banner'
            }, function(result) {
              if (result) {
                document.getElementById('edit-banner-sheet').value = result;
                checkChanges();
              }
            });
          });
        }
      }
    });
    
    // Status selector change handler
    var statusSelect = document.getElementById('status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', function() {
        var newStatus = this.value;
        u.status = newStatus;
        MStore.user.status = newStatus;
        MStore.save();
        // Update the status dot in the sheet
        var statusDot = this.parentNode.querySelector('.status-dot');
        if (statusDot) {
          statusDot.style.background = getStatusColor(newStatus);
          statusDot.className = 'status-dot status-' + newStatus;
        }
        // Refresh the header account dot. (This used to update the floating
        // pill's status label, which no longer exists.)
        if (window.OrbitNav) window.OrbitNav.syncAvatar();
        // Broadcast status change to peers
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          var beaconData = buildBeacon().payload;
          var conns = Orbit.P2P.getConnections ? Orbit.P2P.getConnections() : [];
          var myId = MStore.user ? MStore.user.id : '';
          (conns || []).forEach(function(conn) {
            var peerId = conn.peerId || conn.remotePeer || (typeof conn === 'string' ? conn : '');
            if (peerId && peerId !== myId) {
              var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.BEACON, myId, peerId, beaconData);
              Orbit.P2P.send(peerId, pkt);
            }
          });
        }
        showToast('Status updated to ' + newStatus, 'success');
      });
    }

    // Action button default behavior
    document.getElementById('btn-profile-sheet-action').onclick = closeProfileSheet;



        // Frame picker button — opens drop-up inside the sheet
    var frameBtn = document.getElementById('frame-picker-btn');
    var _framePickerOpen = false;
    if (frameBtn) {
      frameBtn.addEventListener('click', function() {
        if (_framePickerOpen) return;
        _framePickerOpen = true;
        
        var fOverlay = document.createElement('div');
        fOverlay.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:var(--bg-surface);border-radius:24px 24px 0 0;max-height:75vh;display:flex;flex-direction:column;animation:slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards;';
        
        var selectedFrame = MStore.settings.profileFrame || 0;
        
        fOverlay.innerHTML =
          '<div style="flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:20px 20px 0;">' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);">Choose Frame</div>' +
            '<button id="btn-close-frame-picker" style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-primary);font-size:16px;">✕</button>' +
          '</div>' +
          '<div style="flex:1;overflow-y:auto;padding:16px 20px 30px;">' +
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;">' +
              (function() {
                var html = '';
                // 0 is the "None" option; 1..COUNT are the frames. This stopped at
                // 42 while 55 exist, so the phone never offered 43-55 — and a
                // picker missing its last twelve entries looks exactly like a
                // picker that ends there. COUNT now comes from the shared list the
                // desktop reads too.
                var _frameMax = (window.ProfileFrames && window.ProfileFrames.COUNT) || 42;
                for (var fi = 0; fi <= _frameMax; fi++) {
                  var isSel = selectedFrame == fi;
                  if (fi === 0) {
                    html += '<div class="frame-option" data-frame="0" style="width:100%;aspect-ratio:1;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text-muted);cursor:pointer;transition:all 0.15s;box-sizing:border-box;overflow:hidden;' + (isSel ? 'border:2px solid var(--accent-primary);' : 'border:2px solid transparent;') + '">None</div>';
                  } else {
                    html += '<div class="frame-option" data-frame="' + fi + '" style="width:100%;aspect-ratio:1;border-radius:50%;background:var(--bg-base);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s;position:relative;box-sizing:border-box;overflow:hidden;' + (isSel ? 'border:2px solid var(--accent-primary);' : 'border:2px solid transparent;') + '">' +
                      '<img src="icons/frames/pfp_frame_' + fi + '.png" style="width:100%;height:100%;object-fit:cover;border-radius:50%;pointer-events:none;" draggable="false" alt="">' +
                    '</div>';
                  }
                }
                return html;
              })() +
            '</div>' +
          '</div>';
        
        backdrop.appendChild(fOverlay);

        // Drag-down-to-close (onClose mirrors the ✕ button handler)
        if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
          OrbitSheet.enableDragClose({ sheet: fOverlay, onClose: function () { fOverlay.remove(); _framePickerOpen = false; } });
        }

        document.getElementById('btn-close-frame-picker').addEventListener('click', function() {
          fOverlay.remove();
          _framePickerOpen = false;
        });
        
        fOverlay.addEventListener('click', function(e) { e.stopPropagation(); });
        
        fOverlay.querySelectorAll('.frame-option').forEach(function(el) {
          el.addEventListener('click', function() {
            var frameNum = parseInt(this.getAttribute('data-frame'), 10) || 0;
            
            var previewWrap = frameBtn.querySelector('div:first-child > div:first-child');
            var labelEl = frameBtn.querySelector('span');
            if (previewWrap) {
              if (frameNum > 0) {
                previewWrap.innerHTML = '<img src="icons/frames/pfp_frame_' + frameNum + '.png" style="width:125%;height:125%;pointer-events:none;object-fit:contain;flex-shrink:0;display:block;" draggable="false" alt="">';
              } else {
                previewWrap.innerHTML = '<span style="font-size:10px;color:var(--text-muted);">None</span>';
              }
            }
            if (labelEl) {
              labelEl.textContent = frameNum > 0 ? 'Frame #' + frameNum : 'No Frame';
            }
            
            MStore.settings.profileFrame = frameNum;
            MStore.save();
            updateNavAvatar();
            renderChatList();
            renderFriends();
            
            var heroFrame = sheet.querySelector('.profile-avatar-wrapper .pfp-frame');
            if (frameNum > 0) {
              if (heroFrame) {
                heroFrame.src = 'icons/frames/pfp_frame_' + frameNum + '.png';
              } else {
                var aw = sheet.querySelector('.profile-avatar-wrapper');
                if (aw) {
                  var newFrame = document.createElement('img');
                  newFrame.className = 'pfp-frame';
                  newFrame.draggable = false;
                  newFrame.alt = '';
                  newFrame.src = 'icons/frames/pfp_frame_' + frameNum + '.png';
                  aw.appendChild(newFrame);
                }
              }
            } else {
              if (heroFrame) heroFrame.remove();
            }
            
            // Refresh the header avatar's frame. (This used to repaint the
            // floating pill's avatar.)
            if (window.OrbitNav) window.OrbitNav.syncAvatar();

            fOverlay.remove();
            _framePickerOpen = false;
          });
        });
      });
    }
    // Hide pill
    var pill = document.getElementById('profile-pill');
    if (pill) { pill.style.opacity = '0'; pill.style.pointerEvents = 'none'; }

    function showPillLocal() {
      var p = document.getElementById('profile-pill');
      if (p) { p.style.opacity = ''; p.style.pointerEvents = ''; }
      var fc = document.getElementById('profile-content');
      if (fc && fc.style.display === 'none') fc.remove();
    }
  }

  function showProfile() {
    renderProfile();
    var panel = document.getElementById('panel-profile-overlay');
    var backdrop = document.getElementById('profile-overlay-backdrop');
    panel.classList.add('open');
    backdrop.style.display = 'block';
    var _elmobilenav5 = document.getElementById('mobile-nav');
    if (_elmobilenav5) _elmobilenav5.classList.add('nav-hidden');
  }

  function hideProfile() {
    document.getElementById('panel-profile-overlay').classList.remove('open');
    document.getElementById('profile-overlay-backdrop').style.display = 'none';
    var _elmobilenav6 = document.getElementById('mobile-nav');
    if (_elmobilenav6) _elmobilenav6.classList.remove('nav-hidden');
  }

  /* -- Gallery Overlay -- */
  // Grid density, remembered per account. 3-up by default.
  function galleryColumns() {
    var n = parseInt(MStore.get('galleryColumns', 3), 10);
    return (n === 2 || n === 3) ? n : 3;
  }

  // Whose gallery this is and how much is in it. The header used to say only
  // "Gallery", which gave no clue which conversation you were looking at.
  function setGallerySubtitle(count, filter) {
    var el = document.getElementById('gallery-subtitle');
    if (!el) return;
    var chat = (MStore.chats || []).find(function(c) { return c.id === activeChatId; });
    var name = chat ? (chat.name || 'Chat') : 'Chat';
    var what = (filter && filter !== 'all') ? filter + 's' : 'items';
    var n = (typeof count === 'number') ? count : 0;
    el.textContent = name + ' · ' + n + ' ' + (n === 1 ? what.replace(/s$/, '') : what);
  }

  function renderGallery(filter) {
    var container = document.getElementById('gallery-content');
    // Remembered so the density toggle can re-render without losing the filter.
    window._galleryFilterValue = filter || 'all';
    if (!activeChatId) {
      setGallerySubtitle(null);
      var sub0 = document.getElementById('gallery-subtitle');
      if (sub0) sub0.textContent = 'No conversation open';
      container.innerHTML =
        '<div class="gallery-empty"><i data-lucide="image"></i>' +
        '<div class="gallery-empty-title">Select a chat to view its media</div>' +
        '<div class="gallery-empty-sub">Photos, videos and voice notes from a conversation all land here.</div>' +
        '</div>';
      renderLucide({ root: container });
      return;
    }
    var msgs = MStore.getMessages(activeChatId);
    var allMedia = [];
    msgs.forEach(function(m) {
      if (m.attachments) {
        m.attachments.forEach(function(a) {
          var t = (a.type || '').toLowerCase();
          var mime = (a.mimeType || '').toLowerCase();
          var isImg = t === 'image' || mime.startsWith('image/');
          var isVid = t === 'video' || mime.startsWith('video/');
          var isAud = t === 'audio' || mime.startsWith('audio/');
          if ((isImg || isVid || isAud) && a.url) {
            // Find sender info
            var sender = null;
            if (m.from === 'me') {
              sender = MStore.user ? MStore.user.name || 'You' : 'You';
            } else {
              var friend = (MStore.friends || []).find(function(f) { return f.id === m.from; });
              sender = friend ? friend.name : (m.fromName || m.from || 'Unknown');
            }
            allMedia.push({
              url: a.url,
              type: isVid ? 'video' : (isAud ? 'audio' : 'image'),
              mimeType: a.mimeType || '',
              poster: a._poster || '',
              name: a.name || '',
              msgId: m.id,
              sender: sender,
              time: m.time || m.timestamp || '',
              isMine: m.from === 'me'
            });
          }
        });
      }
    });

    // Apply filter
    var filteredMedia = allMedia;
    if (filter && filter !== 'all') {
      filteredMedia = allMedia.filter(function(item) { return item.type === filter; });
    }

    if (filteredMedia.length === 0) {
      setGallerySubtitle(0, filter);
      var isFiltered = !!(filter && filter !== 'all');
      container.innerHTML =
        '<div class="gallery-empty"><i data-lucide="' + (isFiltered ? 'filter' : 'image') + '"></i>' +
        '<div class="gallery-empty-title">' +
          (isFiltered ? 'No ' + escapeHtml(filter) + ' in this chat' : 'Nothing shared yet') +
        '</div>' +
        '<div class="gallery-empty-sub">' +
          (isFiltered
            ? 'This conversation has media, just none of that kind.'
            : 'Photos, videos and voice notes sent in this chat will show up here.') +
        '</div>' +
        '</div>';
      renderLucide({ root: container });
      return;
    }

    var html = '';

    // Filter tabs
    html += '<div class="gallery-filter-bar">';
    var tabs = [
      { id: 'all', label: 'All', count: allMedia.length },
      { id: 'image', label: 'Images', count: allMedia.filter(function(i) { return i.type === 'image'; }).length },
      { id: 'video', label: 'Videos', count: allMedia.filter(function(i) { return i.type === 'video'; }).length },
      { id: 'audio', label: 'Audio', count: allMedia.filter(function(i) { return i.type === 'audio'; }).length }
    ];
    tabs.forEach(function(t) {
      if (t.count > 0) {
        var active = (!filter || filter === 'all' ? t.id === 'all' : t.id === filter) ? ' active' : '';
        html += '<button class="gallery-filter-btn' + active + '" data-filter="' + t.id + '" onclick="window._galleryFilter(\'' + t.id + '\')">' + escapeHtml(t.label) + ' (' + t.count + ')</button>';
      }
    });
    html += '</div>';

    // Group filtered items by date
    var groups = {};
    filteredMedia.forEach(function(item) {
      var dateKey = '';
      if (item.time) {
        try {
          var d = new Date(item.time);
          var today = new Date();
          var yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          if (d.toDateString() === today.toDateString()) {
            dateKey = 'Today';
          } else if (d.toDateString() === yesterday.toDateString()) {
            dateKey = 'Yesterday';
          } else {
            dateKey = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
          }
        } catch(e) { dateKey = 'Unknown'; }
      } else {
        dateKey = 'Unknown';
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    // Build grid by date sections
    var dateKeys = Object.keys(groups);
    // Sort date keys chronologically (Today first, then Yesterday, then ascending dates)
    dateKeys.sort(function(a, b) {
      var order = ['Today', 'Yesterday'];
      var ai = order.indexOf(a);
      var bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    // The count lives in the header now, so the separate .gallery-count line
    // that used to sit above the grid would say the same thing twice.
    setGallerySubtitle(filteredMedia.length, filter);

    var cols = galleryColumns();
    var flatIndex = 0;
    var visualOrder = [];
    dateKeys.forEach(function(dateKey) {
      html += '<div class="gallery-section-date">' + escapeHtml(dateKey) + '</div>';
      html += '<div class="gallery-grid cols-' + cols + (filter === 'audio' ? ' single-col' : '') + '">';
      groups[dateKey].forEach(function(item) {
        var safeUrl = escapeHtml(item.url).replace(/'/g, "\\'");
        var safePoster = item.poster ? window.Sanitize.escapeHtml(item.poster) : '';

        if (item.type === 'video') {
          if (safePoster) {
            html += '<div class="gallery-item" onclick="window._galleryOpen(' + flatIndex + ')" data-gallery-index="' + flatIndex + '">' +
              '<img src="' + safePoster + '" loading="lazy">' +
              '<div class="gallery-item-type-badge"><i data-lucide="video"></i> Video</div>' +
              '</div>';
          } else {
              // No poster: a plain dark square with a dim glyph read as an empty
              // tile. A play button says what it is before you tap it.
              html += '<div class="gallery-item" onclick="window._galleryOpen(' + flatIndex + ')" data-gallery-index="' + flatIndex + '">' +
              '<div class="gallery-video-fallback"><i data-lucide="play"></i></div>' +
              '<div class="gallery-item-type-badge"><i data-lucide="video"></i> Video</div>' +
              '</div>';
          }
        } else if (item.type === 'audio') {
          html += '<div class="gallery-item-audio" onclick="window._galleryOpen(' + flatIndex + ')" data-gallery-index="' + flatIndex + '">' +
            '<i data-lucide="music"></i>' +
            '<span>' + escapeHtml(item.name || 'Audio') + '</span>' +
            '</div>';
        } else {
          html += '<div class="gallery-item" onclick="window._galleryOpen(' + flatIndex + ')" data-gallery-index="' + flatIndex + '">' +
            '<img src="' + escapeHtml(item.url) + '" loading="lazy">' +
            '</div>';
        }
        flatIndex++;
        visualOrder.push(item);
      });
      html += '</div>';
    });

    // Store visual-order list so clicking flatIndex correctly maps to the right item
    window._galleryMediaList = visualOrder;

    container.innerHTML = html;
    renderLucide({ root: container });
  }

  // Grid density toggle. Kept in storage rather than in settings so it does not
  // travel between devices — how wide your thumb likes the grid is a per-screen
  // preference, not part of the account.
  (function wireGalleryDensity() {
    var btn = document.getElementById('btn-gallery-density');
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', function() {
      MStore.set('galleryColumns', galleryColumns() === 3 ? 2 : 3);
      var icon = btn.querySelector('i, svg');
      if (window.lucide) {
        btn.innerHTML = '<i data-lucide="' + (galleryColumns() === 3 ? 'layout-grid' : 'grid-2x2') + '"></i>';
        try { lucide.createIcons({ root: btn }); } catch (e) {}
      } else if (icon) {
        icon.remove();
      }
      renderGallery(window._galleryFilterValue || 'all');
    });
  })();

  window.showProfileSheet = showProfileSheet;
  window.showCreateGroup = showCreateGroup;
  window.showAddFriendModal = showAddFriendModal;
  window.showProfileOverlay = showProfileOverlay;
  window.startQRScanner = startQRScanner;
  window.stopQRScanner = stopQRScanner;

  // Exposed for the tab bar (components/navigation.js). These were all
  // closure-scoped, so the tab bar had no way to reach them — it needs the same
  // switchPanel the activity bell uses, or tab switches would lose the panel
  // transition and could leave two panels active.
  window.switchPanel = switchPanel;
  // Exposed so the appearance settings can be driven from a test — and so the
  // harness can seed a thread and re-render it. Neither was reachable before,
  // which is why a probe that called them silently did nothing.
  window.renderMessages = renderMessages;
  window.applyClassicBubbles = applyClassicBubbles;
  window.showSettingsOverlay = showSettingsOverlay;
  // The section renderer too — without it a test can open Settings but not reach
  // a section, which is the same gap that made an earlier probe silently do
  // nothing when it called renderMessages.
  window.showSettingsSection = showSettingsSection;
  window.renderActivity = renderActivity;

  window.openLightbox = function(index, mediaList) {
    var existing = document.getElementById('gallery-lightbox');
    if (existing) existing.remove();

    // Use global list if mediaList not provided (backward compat)
    if (!mediaList && window._galleryMediaList) {
      mediaList = window._galleryMediaList;
    }
    var _blobUrls = [];
    
    var items = mediaList || [];
    var currentIdx = Math.max(0, Math.min(index || 0, items.length - 1));
    var currentItem = items[currentIdx] || { url: '', type: 'image', sender: '', time: '' };

    function renderLightbox(idx) {
      idx = Math.max(0, Math.min(idx, items.length - 1));
      var item = items[idx];
      if (!item) return;

      var lb = document.getElementById('gallery-lightbox');
      if (!lb) return;

      // Revoke previous blob URLs to prevent memory leak
      _blobUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch(e) {} });
      _blobUrls = [];

      // Media content
      var contentHtml = '';
      if (item.type === 'video') {
        var playUrl = item.url;
        if (playUrl.indexOf('data:') === 0) {
          try {
            var vm = playUrl.match(/^data:(video\/[^;]+|application\/octet-stream);base64,(.+)$/);
            if (vm) {
              var blobUrl = window.orbitBase64ToBlob(vm[2], vm[1]);
              if (blobUrl) { playUrl = blobUrl; _blobUrls.push(blobUrl); }
            }
          } catch(e) { console.warn('[Gallery] video data URL convert failed', e); }
        }
        contentHtml = '<video src="' + escapeHtml(playUrl) + '" controls autoplay style="max-width:100%;max-height:100%;object-fit:contain;animation:scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);"></video>';
      } else if (item.type === 'audio') {
        var playUrl = item.url;
        if (playUrl.indexOf('data:') === 0) {
          try {
            var vm = playUrl.match(/^data:(audio\/[^;]+|application\/octet-stream);base64,(.+)$/);
            if (vm) {
              var blobUrl = window.orbitBase64ToBlob(vm[2], vm[1]);
              if (blobUrl) { playUrl = blobUrl; _blobUrls.push(blobUrl); }
            }
          } catch(e) { console.warn('[Gallery] audio data URL convert failed', e); }
        }
        contentHtml = '<audio src="' + escapeHtml(playUrl) + '" controls autoplay style="width:80%;max-width:400px;animation:scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);"></audio>';
      } else {
        contentHtml = '<img src="' + escapeHtml(item.url) + '" style="max-width:100%;max-height:100%;object-fit:contain;animation:scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);">';
      }

      // Format date
      var dateStr = '';
      if (item.time) {
        try {
          var d = new Date(item.time);
          dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' +
                    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        } catch(e) { dateStr = ''; }
      }

      var hasPrev = idx > 0;
      var hasNext = idx < items.length - 1;

      // Build header with close + nav
      var headerHtml = '';
      headerHtml += '<button class="lightbox-close" id="lb-close-btn"><i data-lucide="x"></i></button>';
      if (hasPrev) {
        headerHtml += '<button class="lightbox-nav-btn lightbox-nav-prev" id="lb-prev-btn"><i data-lucide="chevron-left"></i></button>';
      }
      if (hasNext) {
        headerHtml += '<button class="lightbox-nav-btn lightbox-nav-next" id="lb-next-btn"><i data-lucide="chevron-right"></i></button>';
      }

      // Footer with sender, date, counter, download
      var footerHtml = '';
      footerHtml += '<div class="lightbox-footer">';
      footerHtml += '  <div class="lightbox-footer-left">';
      footerHtml += '    <div class="lightbox-footer-sender">' + escapeHtml(item.sender || 'Unknown') + '</div>';
      footerHtml += '    <div class="lightbox-footer-date">' + escapeHtml(dateStr) + '</div>';
      footerHtml += '  </div>';
      footerHtml += '  <div class="lightbox-footer-right">';
      if (items.length > 1) {
        footerHtml += '    <div class="lightbox-counter">' + (idx + 1) + ' / ' + items.length + '</div>';
      }
      footerHtml += '    <button class="lightbox-dl-btn" id="lb-dl-btn"><i data-lucide="download"></i></button>';
      footerHtml += '  </div>';
      footerHtml += '</div>';

      lb.innerHTML = headerHtml + '<div class="lightbox-media-wrap">' + contentHtml + '</div>' + footerHtml;
      renderLucide({ root: lb });

      // Re-bind events
      lb._currentIdx = idx;
      lb._items = items;

      document.getElementById('lb-close-btn').addEventListener('click', function() {
        // Revoke blob URLs on close
        _blobUrls.forEach(function(u) { try { URL.revokeObjectURL(u); } catch(e) {} });
        _blobUrls = [];
        lb.remove();
      });
      
      var prevBtn = document.getElementById('lb-prev-btn');
      if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); renderLightbox(idx - 1); });
      
      var nextBtn = document.getElementById('lb-next-btn');
      if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); renderLightbox(idx + 1); });
      
      var dlBtn = document.getElementById('lb-dl-btn');
      if (dlBtn) {
        dlBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          var a = document.createElement('a');
          a.href = item.url;
          a.download = item.name || 'media';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        });
      }

      // Touch swipe support
      var touchStartX = 0;
      var touchEndX = 0;
      var mediaWrap = lb.querySelector('.lightbox-media-wrap');
      if (mediaWrap) {
        mediaWrap.addEventListener('touchstart', function(e) {
          touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        mediaWrap.addEventListener('touchend', function(e) {
          touchEndX = e.changedTouches[0].screenX;
          var diff = touchStartX - touchEndX;
          var hasPrev = idx > 0;
          var hasNext = idx < items.length - 1;
          if (Math.abs(diff) > 60) {
            if (diff > 0 && hasNext) {
              renderLightbox(idx + 1);
            } else if (diff < 0 && hasPrev) {
              renderLightbox(idx - 1);
            }
          }
        }, { passive: true });
      }
    }

    var html = '<div id="gallery-lightbox" class="gallery-lightbox"></div>';
    var div = document.createElement('div');
    div.innerHTML = html;
    var lightbox = div.firstChild;
    document.body.appendChild(lightbox);

    // Close on backdrop click
    lightbox.addEventListener('click', function(e) {
      if (e.target === lightbox) lightbox.remove();
    });

    renderLightbox(currentIdx);
  };

  function showGallery() {
    window._galleryFilter = function(filterId) {
      renderGallery(filterId);
    };
    window._galleryOpen = function(index) {
      var list = window._galleryMediaList;
      if (!list || !list[index]) return;
      openLightbox(index, list);
    };
    renderGallery('all');
    var panel = document.getElementById('panel-gallery-overlay');
    var backdrop = document.getElementById('gallery-overlay-backdrop');
    if (panel) panel.classList.add('open');
    if (backdrop) backdrop.style.display = 'block';
  }

  function hideGallery() {
    var panel = document.getElementById('panel-gallery-overlay');
    var backdrop = document.getElementById('gallery-overlay-backdrop');
    if (panel) panel.classList.remove('open');
    if (backdrop) backdrop.style.display = 'none';
  }

  /* -- Thread Panel -- */
  function _threadSenderName(m) {
    if (!m) return 'Unknown';
    if (m.from === 'me') return 'You';
    var f = (MStore.friends || []).find(function(fr) { return fr.id === m.from; });
    return f ? f.name : (m.fromName || m.from || 'Unknown');
  }

  function openThreadPanel(chatId, msgId) {
    var panel = document.getElementById('panel-thread-overlay');
    var backdrop = document.getElementById('thread-overlay-backdrop');
    if (!panel || !backdrop) return;
    var msgs = MStore.getMessages(chatId) || [];
    var byId = {};
    var target = null;
    for (var ti = 0; ti < msgs.length; ti++) {
      byId[String(msgs[ti].id)] = msgs[ti];
      if (String(msgs[ti].id) === String(msgId)) target = msgs[ti];
    }
    if (!target) return;
    // Walk up the replyTo chain to the thread root
    var root = target;
    var guard = 0;
    while (root.replyTo != null && byId[String(root.replyTo)] && guard < 100) {
      root = byId[String(root.replyTo)];
      guard++;
    }
    var rootKey = String(root.id);
    var threadMsgs = msgs.filter(function(m) {
      var cur = m;
      var g = 0;
      while (cur.replyTo != null && byId[String(cur.replyTo)] && g < 100) {
        cur = byId[String(cur.replyTo)];
        g++;
      }
      return cur && String(cur.id) === rootKey;
    });
    // Newest last
    threadMsgs.sort(function(a, b) {
      return ((a.time ? new Date(a.time).getTime() : 0) - (b.time ? new Date(b.time).getTime() : 0));
    });
    var titleEl = document.getElementById('thread-overlay-title');
    if (titleEl) titleEl.textContent = 'Thread (' + threadMsgs.length + ')';
    var content = document.getElementById('thread-content');
    var html = '';
    for (var i = 0; i < threadMsgs.length; i++) {
      var tm = threadMsgs[i];
      var isRoot = String(tm.id) === rootKey;
      var txt = (tm.text || '').trim();
      if (!txt && tm.attachments && tm.attachments.length > 0) {
        txt = '[' + (tm.attachments[0].name || 'Attachment') + ']';
      } else if (!txt) {
        txt = '(No text)';
      }
      html += '<div class="' + (isRoot ? 'thread-root-msg' : 'thread-msg-item') + '" data-thread-msg-id="' + tm.id + '">' +
        '<div class="thread-msg-name">' + escapeHtml(_threadSenderName(tm)) + (isRoot ? ' <span class="thread-root-badge">Root</span>' : '') + '</div>' +
        '<div class="thread-msg-text">' + escapeHtml(txt) + '</div>' +
        '<div class="thread-msg-time">' + formatTime(tm.time) + '</div>' +
      '</div>';
    }
    content.innerHTML = html;
    content.querySelectorAll('[data-thread-msg-id]').forEach(function(row) {
      row.addEventListener('click', function() {
        var mId = this.getAttribute('data-thread-msg-id');
        closeThreadPanel();
        setTimeout(function() {
          var el = document.querySelector('.message-row[data-msg-id="' + String(mId).replace(/"/g, '') + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
      });
    });
    panel.classList.add('open');
    backdrop.style.display = 'block';
    var _thnav = document.getElementById('mobile-nav');
    if (_thnav) _thnav.classList.add('nav-hidden');
  }

  function closeThreadPanel() {
    var panel = document.getElementById('panel-thread-overlay');
    var backdrop = document.getElementById('thread-overlay-backdrop');
    if (!panel || !backdrop) return;
    panel.classList.remove('open');
    backdrop.style.display = 'none';
    var _thnav2 = document.getElementById('mobile-nav');
    if (_thnav2) _thnav2.classList.remove('nav-hidden');
  }
  window.openThreadPanel = openThreadPanel;
  window.closeThreadPanel = closeThreadPanel;

  /* -- Group Info Panel -- */
  function _getMemberRoleBadge(role) {
    if (role === 'owner') return '<span class="group-role-badge group-role-owner">Owner</span>';
    if (role === 'admin') return '<span class="group-role-badge group-role-admin">Admin</span>';
    return '';
  }

  function _isMyGroupOwner(group) {
    return group.ownerId === (MStore.user ? MStore.user.id : '');
  }

  function _getMemberById(group, userId) {
    if (!group || !group.members) return null;
    return group.members.find(function(m) { return (typeof m === 'string' ? m : m.userId) === userId; });
  }

  function _isGroupAdmin(group, userId) {
    var mem = _getMemberById(group, userId);
    if (!mem) return false;
    if (typeof mem === 'string') return false;
    return mem.role === 'admin' || mem.role === 'owner';
  }

  function renderGroupInfo(groupId) {
    var container = document.getElementById('members-content');
    var gid = groupId || activeChatId;
    if (!gid) return;
    var group = MStore.groups.find(function(g) { return g.id === gid; });
    if (!group) {
      container.innerHTML = window.OrbitEmpty.html({ icon: 'users-round', title: 'Not a group', compact: true, muted: true });
      renderLucide({ root: container });
      document.querySelector('#panel-members-overlay .overlay-panel-header h3').textContent = 'Group Info';
      return;
    }

    var isOwner = _isMyGroupOwner(group);
    var myId = MStore.user ? MStore.user.id : '';
    var members = group.members || [];
    var groupInitial = group.name.charAt(0).toUpperCase();

    // ── Avatar HTML ──
    var gAvatarSrc = safeAvatarSrc(group.avatar);
    // A group with no uploaded image gets the member-avatar grid, matching
    // desktop (shared/ui/group-avatar.js). 80 to match .group-info-avatar.
    var groupGridHtml = (!gAvatarSrc && window.OrbitGroupAvatarMobile)
      ? window.OrbitGroupAvatarMobile.forGroup(group, 80, 'var(--bg-surface)')
      : null;
    var avatarHtml = gAvatarSrc
      ? '<img src="' + gAvatarSrc + '" alt="">'
      : (groupGridHtml || ('<span>' + escapeHtml(groupInitial) + '</span>'));
    var editOverlay = isOwner
      ? '<div class="group-info-avatar-edit" id="btn-group-info-avatar">Edit</div>'
      : '';

    // ── Member rows ──
    var membersHtml = '';
    members.forEach(function(m) {
      var mid = typeof m === 'string' ? m : m.userId;
      var role = (typeof m === 'string') ? 'member' : (m.role || 'member');
      var friend = MStore.friends.find(function(f) { return f.id === mid; });
      var memberName = m.name || m.username || '';
      var uName = mid === myId && MStore.user ? (MStore.user.name || MStore.user.username) : '';
      var name = friend ? friend.name : (memberName || uName || mid);
      var tag = friend ? (friend.tag || '') : '';
      var initial = name.charAt(0).toUpperCase();
      var memberAvatar = m.avatar || '';
      var selfAvatar = mid === myId && MStore.user ? (MStore.user.avatar || null) : null;
      var mAvatar = safeAvatarSrc(friend && friend.avatar)
        ? '<img src="' + safeAvatarSrc(friend && friend.avatar) + '" alt="">'
        : (safeAvatarSrc(memberAvatar) ? '<img src="' + safeAvatarSrc(memberAvatar) + '" alt="">'
        : (safeAvatarSrc(selfAvatar) ? '<img src="' + safeAvatarSrc(selfAvatar) + '" alt="">'
        : escapeHtml(initial)));
      var statusColor = friend
        ? ({ online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' }[friend.status] || 'var(--text-muted)')
        : 'var(--text-muted)';
      var mPfNum = mid === myId ? getProfileFrame(MStore.settings) : (friend ? getProfileFrame(friend) : 0);
      var mPfHtml = mPfNum > 0 ? '<img src="icons/frames/pfp_frame_' + mPfNum + '.png" class="pfp-frame" draggable="false" alt="">' : '';

      var canManage = isOwner || _isGroupAdmin(group, myId);
      var isSelf = mid === myId;
      var isOwnerMember = role === 'owner';
      var removeBtn = (canManage && !isSelf && !isOwnerMember)
        ? '<button class="group-member-action group-member-remove" data-user-id="' + mid + '">✕</button>'
        : '';
      var promoteBtn = (isOwner && role === 'member')
        ? '<button class="group-member-action group-member-promote" data-user-id="' + mid + '" title="Promote to Admin">▲</button>'
        : '';
      var demoteBtn = (isOwner && role === 'admin')
        ? '<button class="group-member-action group-member-demote" data-user-id="' + mid + '" title="Demote to Member">▼</button>'
        : '';

      var joinedDate = '';
      if (m.joinedAt) {
        try {
          var jd = new Date(m.joinedAt);
          joinedDate = jd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch(e) {}
      }
      // data-user-id on the row itself makes the whole member row long-pressable (user actions sheet).
      // The action buttons below keep their own data-user-id attributes for the delegated click handlers.
      membersHtml += '<div class="group-member-row" data-user-id="' + mid + '">' +
        '<div class="group-member-avatar-wrap">' +
          '<div class="group-member-avatar">' + mAvatar + '</div>' +
          mPfHtml +
          '<span class="group-member-status" style="background:' + statusColor + ';"></span>' +
        '</div>' +
        '<div class="group-member-info">' +
          '<div class="group-member-name">' + escapeHtml(name) + _getMemberRoleBadge(role) + '</div>' +
          (tag ? '<div class="group-member-tag">@' + escapeHtml(tag) + '</div>' : '') +
          (joinedDate ? '<div class="group-member-joined">Joined ' + joinedDate + '</div>' : '') +
        '</div>' +
        '<div class="group-member-actions">' + promoteBtn + demoteBtn + removeBtn + '</div>' +
      '</div>';
    });

    // ── Build full panel ──
    var html = '<div class="group-info-section">' +
      // Avatar Section (standalone card)
      '<div class="group-info-card">' +
        '<div class="group-info-avatar-section">' +
          '<div class="group-info-avatar' + (groupGridHtml ? ' has-group-avatar' : '') + '">' + avatarHtml + editOverlay + '</div>' +
          '<div class="group-info-group-name">' + escapeHtml(group.name) + '</div>' +
          '<div class="group-info-group-meta">' + members.length + ' member' + (members.length !== 1 ? 's' : '') + '</div>' +
        '</div>' +
      '</div>' +

      // Group Details card
      '<div class="group-info-card">' +
        '<div class="group-info-field-row">' +
          '<div class="group-info-field-label">Name</div>' +
          '<div class="group-info-field-value"><input id="group-info-name" type="text" value="' + escapeHtml(group.name) + '" class="group-info-input" ' + (isOwner ? '' : 'disabled') + '></div>' +
        '</div>' +
        '<div class="group-info-field-row">' +
          '<div class="group-info-field-label">About</div>' +
          '<div class="group-info-field-value"><textarea id="group-info-desc" rows="2" class="group-info-textarea" ' + (isOwner ? '' : 'disabled') + ' placeholder="Group description">' + escapeHtml(group.description || '') + '</textarea></div>' +
        '</div>' +
      '</div>' +

      // Invite Code card
      '<div class="group-info-card">' +
        '<div class="group-info-invite-row">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Invite Code</div>' +
            '<div class="group-info-code">' + escapeHtml(group.inviteCode || 'No invite code') + '</div>' +
          '</div>' +
          '<button class="group-info-btn" id="btn-group-copy-invite">Copy</button>' +
          '<button class="group-info-btn" id="btn-group-share-invite">Share</button>' +
        '</div>' +
      '</div>' +

      // Toggles card
      '<div class="group-info-card">' +
        '<div class="group-info-toggle-row">' +
          '<div class="group-info-toggle-label">' +
            '<span class="group-info-toggle-title">Pin Group</span>' +
            '<span class="group-info-toggle-desc">Keep at top of chat list</span>' +
          '</div>' +
          '<label class="toggle-switch"><input type="checkbox" id="group-info-pin"' + (group.pinned ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
        '</div>' +
        '<div class="group-info-toggle-row">' +
          '<div class="group-info-toggle-label">' +
            '<span class="group-info-toggle-title">Mute Notifications</span>' +
            '<span class="group-info-toggle-desc">Silence alerts from this group</span>' +
          '</div>' +
          '<label class="toggle-switch"><input type="checkbox" id="group-info-mute"' + (group.notificationMuted ? ' checked' : '') + '><span class="toggle-slider"></span></label>' +
        '</div>' +
      '</div>' +

      // Disappearing Messages card
      '<div class="group-info-card">' +
        '<div class="group-info-toggle-row">' +
          '<div class="group-info-toggle-label">' +
            '<span class="group-info-toggle-title">Disappearing Messages</span>' +
            '<span class="group-info-toggle-desc">Auto-delete messages after time</span>' +
          '</div>' +
          '<select id="group-info-disappear" class="group-info-select">' +
            '<option value="off"' + (group.disappearTimer === 'off' ? ' selected' : '') + '>Off</option>' +
            '<option value="5s"' + (group.disappearTimer === '5s' ? ' selected' : '') + '>5 seconds</option>' +
            '<option value="30s"' + (group.disappearTimer === '30s' ? ' selected' : '') + '>30 seconds</option>' +
            '<option value="1m"' + (group.disappearTimer === '1m' ? ' selected' : '') + '>1 minute</option>' +
            '<option value="5m"' + (group.disappearTimer === '5m' ? ' selected' : '') + '>5 minutes</option>' +
            '<option value="1h"' + (group.disappearTimer === '1h' ? ' selected' : '') + '>1 hour</option>' +
            '<option value="24h"' + (group.disappearTimer === '24h' ? ' selected' : '') + '>24 hours</option>' +
          '</select>' +
        '</div>' +
      '</div>' +

      // Pinned Messages card
      '<div class="group-info-card">' +
        '<div class="group-info-pinned-section">' +
          '<div class="group-info-pinned-header">Pinned Messages</div>' +
          '<div class="group-info-pinned-list">' +
            ((group.pinnedMessages && group.pinnedMessages.length > 0)
              ? group.pinnedMessages.map(function(pm) {
                  var pmFriend = MStore.friends.find(function(f) { return f.id === pm.pinnedBy; });
                  var pmName = pmFriend ? pmFriend.name : (pm.pinnedBy === (MStore.user ? MStore.user.id : '') ? 'You' : pm.pinnedBy);
                  return '<div class="group-info-pinned-item" data-msg-id="' + pm.msgId + '">' +
                    '<i data-lucide="pin" style="width:14px;height:14px;flex-shrink:0;color:var(--accent-primary);"></i>' +
                    '<div class="group-info-pinned-text">' + escapeHtml(pm.text || '') + '</div>' +
                    '<span class="group-info-pinned-by">' + escapeHtml(pmName) + '</span>' +
                    '<button class="group-info-pinned-remove" data-pin-msg-id="' + pm.msgId + '" title="Unpin">✕</button>' +
                  '</div>';
                }).join('')
              : '<div class="group-info-pinned-empty">No pinned messages</div>') +
          '</div>' +
        '</div>' +
      '</div>' +

      // Members card
      '<div class="group-info-card">' +
        '<div class="group-info-members-header">' +
          'Members (' + members.length + ')' +
          '<button class="group-info-btn" id="btn-group-add-member"><i data-lucide="user-round-plus" style="width:14px;height:14px;"></i> Add</button>' +
        '</div>' +
        '<div class="group-info-members-list">' + membersHtml + '</div>' +
      '</div>' +

      // Leave / Delete (standalone danger button)
      (isOwner
        ? '<button class="group-info-danger" id="btn-group-delete">Delete Group</button>'
        : '<button class="group-info-danger" id="btn-group-leave">Leave Group</button>') +
      '</div>';

    container.innerHTML = html;
    document.querySelector('#panel-members-overlay .overlay-panel-header h3').textContent = 'Group Info';
    renderLucide({ root: container });
  }

  function showGroupInfo(groupId) {
    renderGroupInfo(groupId);
    document.getElementById('panel-members-overlay').classList.add('open');
    document.getElementById('members-overlay-backdrop').style.display = 'block';
    var pill = document.getElementById('profile-pill');
    if (pill) { pill.style.opacity = '0'; pill.style.pointerEvents = 'none'; }
  }

  window.showGroupInfo = showGroupInfo;

  function hideGroupInfo() {
    document.getElementById('panel-members-overlay').classList.remove('open');
    document.getElementById('members-overlay-backdrop').style.display = 'none';
    var pill = document.getElementById('profile-pill');
    var chatPanel = document.getElementById('panel-chat');
    if (pill && !(chatPanel && chatPanel.classList.contains('open'))) {
      pill.style.opacity = '';
      pill.style.pointerEvents = '';
    }
  }

  /* -- Group leave/delete by id (group info overlay + long-press sheet) -- */
  function leaveGroupById(groupId) {
    if (!groupId) return;
    var grp = MStore.groups.find(function(g) { return g.id === groupId; });
    if (grp && window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      (grp.members || []).forEach(function(m) {
        var mid = typeof m === 'string' ? m : m.userId;
        if (mid !== (MStore.user ? MStore.user.id : '')) {
          var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
            groupId: groupId, userId: MStore.user ? MStore.user.id : ''
          });
          Orbit.P2P.send(mid, leavePkt);
        }
      });
    }
    MStore.groups = MStore.groups.filter(function(g) { return g.id !== groupId; });
    MStore.chats = MStore.chats.filter(function(c) { return c.id !== groupId; });
    delete MStore.messages[groupId];
    OrbitKeys.remove('msg_' + groupId);
    MStore.save();
    if (activeChatId === groupId && typeof closeChat === 'function') closeChat();
    if (typeof hideGroupInfo === 'function') hideGroupInfo();
    if (typeof renderChatList === 'function') renderChatList();
    showToast('Left group', 'info');
  }

  function deleteGroupById(groupId) {
    if (!groupId) return;
    var grp = MStore.groups.find(function(g) { return g.id === groupId; });
    if (grp && window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      (grp.members || []).forEach(function(m) {
        var mid = typeof m === 'string' ? m : m.userId;
        if (mid !== (MStore.user ? MStore.user.id : '')) {
          var removePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
            groupId: groupId, userId: mid
          });
          Orbit.P2P.send(mid, removePkt);
        }
      });
    }
    MStore.groups = MStore.groups.filter(function(g) { return g.id !== groupId; });
    MStore.chats = MStore.chats.filter(function(c) { return c.id !== groupId; });
    delete MStore.messages[groupId];
    OrbitKeys.remove('msg_' + groupId);
    MStore.save();
    if (activeChatId === groupId && typeof closeChat === 'function') closeChat();
    if (typeof hideGroupInfo === 'function') hideGroupInfo();
    if (typeof renderChatList === 'function') renderChatList();
    showToast('Group deleted', 'info');
  }

  window.leaveGroupById = leaveGroupById;
  window.deleteGroupById = deleteGroupById;

  /* -- Activity Center (Desktop-style) -- */
  var ActivityCenter = {
    activeTab: 'all'
  };

  function renderActivity(tab) {
    var container = document.getElementById('activity-content');
    if (!container) return;
    var t = tab || ActivityCenter.activeTab || 'all';
    ActivityCenter.activeTab = t;

    var state = MStore;
    var messages = state.messages || {};
    var friends = state.friends || [];
    var groups = state.groups || [];
    var myId = state.user ? state.user.id : null;
    var clearedAt = state.activityClearedAt || 0;
    var sysClearedAt = state.systemLogClearedAt || 0;

    function getFriend(id) {
      return friends.find(function(f) { return f.id === id; });
    }
    function getGroup(id) {
      return groups.find(function(g) { return g.id === id || g.groupId === id; });
    }
    function getMemberAvatar(groupId, userId) {
      var g = getGroup(groupId);
      if (g && g.members) {
        var m = g.members.find(function(mm) { return mm.userId === userId; });
        if (m) return m.avatar;
      }
      return null;
    }
    function getMemberName(groupId, userId) {
      var g = getGroup(groupId);
      if (g && g.members) {
        var m = g.members.find(function(mm) { return mm.userId === userId; });
        if (m) return m.username || m.name || userId;
      }
      return userId;
    }
    function getAvatarHtml(userId, name) {
      var initial = (name ? name.charAt(0).toUpperCase() : '?');
      var selfAvatarSrc = safeAvatarSrc(state.user && state.user.avatar);
      if (userId === myId && selfAvatarSrc) {
        return '<img class="activity-sender-avatar" src="' + selfAvatarSrc + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';var p=this.parentNode;if(p&&!p.querySelector(\'.act-fallback\')){var d=document.createElement(\'div\');d.className=\'act-fallback\';d.style.cssText=\'width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;\';d.textContent=\'' + jsEscape(initial) + '\';p.insertBefore(d,this);}">';
      }
      var f = getFriend(userId);
      var fAvatarSrc = safeAvatarSrc(f && f.avatar);
      if (f && fAvatarSrc) {
        return '<img class="activity-sender-avatar" src="' + fAvatarSrc + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';var p=this.parentNode;if(p&&!p.querySelector(\'.act-fallback\')){var d=document.createElement(\'div\');d.className=\'act-fallback\';d.style.cssText=\'width:32px;height:32px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;\';d.textContent=\'' + jsEscape(initial) + '\';p.insertBefore(d,this);}">';
      }
      return '<div class="activity-sender-placeholder">' + escapeHtml(initial) + '</div>';
    }
    function getChatAvatarHtml(chatId, chatName) {
      var initial = (chatName ? chatName.charAt(0).toUpperCase() : '?');
      var f = getFriend(chatId);
      var fBadgeSrc = safeAvatarSrc(f && f.avatar);
      if (f && fBadgeSrc) {
        var src = fBadgeSrc;
        if (src.indexOf('blob:') !== 0 && src.indexOf('data:') !== 0 && src.indexOf('?') === -1) {
          src += '?t=' + Date.now();
        }
        return '<img class="activity-chat-badge-avatar" src="' + escapeHtml(src) + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';var p=this.parentNode;if(p&&!p.querySelector(\'.act-cb-fallback\')){var d=document.createElement(\'div\');d.className=\'act-cb-fallback\';d.style.cssText=\'width:24px;height:24px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;\';d.textContent=\'' + jsEscape(initial) + '\';p.insertBefore(d,this);}">';
      }
      var g = getGroup(chatId);
      var gBadgeSrc = safeAvatarSrc(g && g.avatar);
      if (g && gBadgeSrc) {
        return '<img class="activity-chat-badge-avatar" style="border-radius:4px;" src="' + gBadgeSrc + '" loading="lazy" onerror="this.onerror=null;this.style.display=\'none\';var p=this.parentNode;if(p&&!p.querySelector(\'.act-cb-fallback\')){var d=document.createElement(\'div\');d.className=\'act-cb-fallback\';d.style.cssText=\'width:24px;height:24px;border-radius:4px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;\';d.textContent=\'' + jsEscape(initial) + '\';p.insertBefore(d,this);}">';
      }
      return '<div class="activity-chat-badge-avatar" style="background:var(--accent-primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;">' + escapeHtml(initial) + '</div>';
    }

    // Build tabs HTML
    var tabs = ['all', 'mentions', 'files', 'system'];
    var tabLabels = { all: 'All', mentions: 'Mentions', files: 'Files', system: 'System' };
    var html = '<div class="activity-tabs">';
    tabs.forEach(function(tabKey) {
      html += '<div class="activity-tab' + (tabKey === t ? ' active' : '') + '" data-tab="' + tabKey + '">' + tabLabels[tabKey] + '</div>';
    });
    html += '</div>';

    // Tab click handler (delegated)
    container.addEventListener('click', function _tabClick(e) {
      var tabEl = e.target.closest('.activity-tab');
      if (!tabEl) return;
      var tabKey = tabEl.getAttribute('data-tab');
      container.removeEventListener('click', _tabClick);
      renderActivity(tabKey);
    });

    if (t === 'system') {
      // System tab — show activity log
      var logs = state.activityLog || [];
      logs = logs.filter(function(l) { return new Date(l.timestamp).getTime() > sysClearedAt; });
      if (logs.length === 0) {
        html += window.OrbitEmpty.html({
          icon: 'activity',
          title: 'No System Activity',
          hint: 'Network events like connections and disconnections appear here.',
          muted: true
        });
      } else {
        html += '<div class="activity-feed">';
        logs.slice().reverse().forEach(function(l) {
          var time = formatTime(l.timestamp) || new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          var icon = l.type === 'peer_connect' ? 'link' : (l.type === 'peer_disconnect' ? 'link-2-off' : 'info');
          var color = l.type === 'peer_connect' ? 'var(--accent-success)' : (l.type === 'peer_disconnect' ? 'var(--accent-danger)' : 'var(--accent-primary)');
          html += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin-bottom:8px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);">' +
            '<span style="font-size:11px;color:var(--text-muted);flex-shrink:0;width:40px;text-align:right;">' + time + '</span>' +
            '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:' + color + ';"><i data-lucide="' + icon + '" style="width:16px;height:16px;"></i></div>' +
            '<span style="font-size:13px;color:var(--text-primary);flex:1;">' + escapeHtml(l.message) + '</span>' +
          '</div>';
        });
        html += '</div>';
      }
    } else {
      // All, Mentions, or Files tab — build event list
      var allEvents = [];
      var chatIds = Object.keys(messages);
      chatIds.forEach(function(chatId) {
        if (chatId === 'echo' || chatId === 'local-echo') return;
        var msgs = messages[chatId] || [];
        if (msgs.length === 0) return;

        var friend = getFriend(chatId);
        var group = getGroup(chatId);
        var chatName = friend ? friend.name : (group ? group.name : chatId.substring(0, 8));

        msgs.forEach(function(m) {
          var msgTime = new Date(m.time || 0).getTime();
          if (msgTime <= clearedAt) return;

          var isMine = m.from === 'me';
          var senderId = isMine ? myId : m.from;
          var senderName = isMine ? 'You' : '';
          if (!isMine && friend && chatId === senderId) {
            senderName = friend.name;
          } else if (!isMine && group) {
            senderName = getMemberName(chatId, senderId);
          } else if (!isMine) {
            var sf = getFriend(senderId);
            senderName = sf ? sf.name : senderId;
          }

          // Mentions filter
          if (t === 'mentions') {
            var isMention = m.text && state.user && state.user.name &&
              (m.text.indexOf('@' + state.user.name) !== -1 || m.text.indexOf('@everyone') !== -1);
            if (!isMention) return;
          }
          // Files filter
          if (t === 'files') {
            if (!m.attachments || m.attachments.length === 0) return;
          }

          allEvents.push({
            chatId: chatId,
            chatName: chatName,
            msg: m,
            isMine: isMine,
            senderId: senderId,
            senderName: senderName,
            ts: msgTime
          });
        });
      });

      allEvents.sort(function(a, b) { return b.ts - a.ts; });
      allEvents = allEvents.slice(0, 100);

      if (allEvents.length === 0) {
        var emptyText, emptyIcon, emptyDesc;
        if (t === 'mentions') {
          emptyText = 'No recent mentions.';
          emptyIcon = 'at-sign';
          emptyDesc = 'When someone mentions you in a group chat, it will appear here.';
        } else if (t === 'files') {
          emptyText = 'No recent files.';
          emptyIcon = 'file';
          emptyDesc = 'Files and media shared in your chats will appear here.';
        } else {
          emptyText = 'No chat activity recently.';
          emptyIcon = 'message-square';
          emptyDesc = 'Your recent messages and activity will appear here.';
        }
        html += '<div class="activity-empty-state">' +
          '<div class="activity-empty-icon"><i data-lucide="' + emptyIcon + '" style="width:36px;height:36px;opacity:0.5;"></i></div>' +
          '<div class="activity-empty-title">' + emptyText + '</div>' +
          '<div class="activity-empty-desc">' + emptyDesc + '</div>' +
        '</div>';
      } else {
        html += '<div class="activity-feed">';
        allEvents.forEach(function(ev) {
          var text = '';
          if (ev.msg.text) {
            text = escapeHtml(ev.msg.text);
            if (text.length > 120) text = text.substring(0, 120) + '...';
          }
          var attachHtml = '';
          if (ev.msg.attachments && ev.msg.attachments.length > 0) {
            var attachPieces = [];
            ev.msg.attachments.forEach(function(a) {
              if (a._pending) return;
              var aType = a.type || '';
              var aMime = a.mimeType || '';
              var aUrl = escapeHtml(a.url || '');
              var aName = escapeHtml(a.name || 'unknown');
              if (aType === 'image' || aMime.startsWith('image/')) {
                attachPieces.push('<div style="width:60px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);background:var(--bg-hover);flex-shrink:0;"><img src="' + aUrl + '" style="width:100%;height:100%;object-fit:cover;"></div>');
              } else if (aType === 'video' || aMime.startsWith('video/')) {
                attachPieces.push('<div style="width:60px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);background:var(--bg-base);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i data-lucide="video" style="width:24px;height:24px;opacity:0.5;"></i></div>');
              } else if (aType === 'audio' || aMime.startsWith('audio/')) {
                attachPieces.push('<div style="width:60px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);background:var(--bg-base);flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i data-lucide="music" style="width:24px;height:24px;color:var(--accent-success);"></i></div>');
              } else {
                attachPieces.push('<div style="width:60px;height:60px;border-radius:8px;overflow:hidden;border:1px solid var(--border-subtle);background:var(--bg-hover);flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:4px;"><i data-lucide="file" style="width:16px;height:16px;color:var(--text-muted);margin-bottom:2px;"></i><div style="font-size:8px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;text-align:center;">' + aName + '</div></div>');
              }
            });
            if (attachPieces.length > 0) {
              attachHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">' + attachPieces.join('') + '</div>';
            }
          }

          var time = ev.msg.time ? formatTime(ev.msg.time) : '';
          var chatAvatarHtml = getChatAvatarHtml(ev.chatId, ev.chatName);
          var senderAvatarHtml = getAvatarHtml(ev.senderId, ev.senderName);

          html += '<div class="activity-event-card" data-activity-chat="' + escapeHtml(ev.chatId) + '" data-msg-id="' + escapeHtml(ev.msg.id || '') + '">' +
            '<div class="activity-card-header">' +
              '<div class="activity-chat-badge">' + chatAvatarHtml + '<span class="activity-chat-badge-name">' + escapeHtml(ev.chatName) + '</span></div>' +
              '<span class="activity-card-time">' + time + '</span>' +
            '</div>' +
            '<div class="activity-card-body">' +
              senderAvatarHtml +
              '<div class="activity-card-content">' +
                '<div class="activity-sender-name">' + escapeHtml(ev.senderName) + '</div>' +
                '<div class="activity-msg-text">' + text + '</div>' +
                attachHtml +
              '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }
    }

    container.innerHTML = html;
    renderLucide({ root: container });

    // Click activity event card to open chat
    container.querySelectorAll('.activity-event-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var chatId = this.getAttribute('data-activity-chat');
        document.querySelector('.nav-btn[data-view="chats"]').click();
        openChat(chatId);
      });
    });
  }

  // Wire the clear button (trash icon)
  var clearBtn = document.getElementById('btn-activity-action');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      var now = Date.now();
      if (ActivityCenter.activeTab === 'system') {
        MStore.systemLogClearedAt = now;
        MStore.set('systemLogClearedAt', now);
      } else {
        MStore.activityClearedAt = now;
        MStore.set('activityClearedAt', now);
      }
      renderActivity(ActivityCenter.activeTab);
    });
  }

  /* -- Add Friend Modal -- */
  function resetModalToAddFriend() {
    var modalTitle = document.querySelector('#modal-overlay .modal-header h3');
    var modalInput = document.getElementById('modal-input');
    var modalAvatarInput = document.getElementById('modal-avatar-input');
    var modalConfirm = document.getElementById('btn-modal-confirm');
    var memberList = document.getElementById('modal-member-list');
    var modalTabs = document.querySelector('.modal-tabs');

    // Restore tabs, switch to Add Friend tab
    if (modalTabs) modalTabs.style.display = '';
    document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
    var addTab = document.getElementById('modal-tab-add');
    if (addTab) addTab.style.display = 'block';
    document.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
    var addTabBtn = document.querySelector('.modal-tab[data-tab="add"]');
    if (addTabBtn) addTabBtn.classList.add('active');

    if (modalTitle) modalTitle.textContent = 'Add Friend';
    if (modalInput) modalInput.placeholder = 'IP address or Peer ID...';
    if (modalAvatarInput) modalAvatarInput.style.display = 'none';
    if (memberList) memberList.style.display = 'none';
    if (modalConfirm) {
      modalConfirm.textContent = 'Connect';
      modalConfirm.onclick = confirmAddFriend;
    }
    _groupCreateMode = false;
  }

  function showAddFriendModal() {
    if (typeof OrbitSheet === 'undefined') {
      // Fallback to old modal
      resetModalToAddFriend();
      document.getElementById('modal-overlay').style.display = 'flex';
      document.getElementById('modal-input').value = '';
      document.getElementById('modal-input').focus();
      return;
    }
    
    var html =
      '<div style="padding:8px 20px 4px;">' +
        '<div style="display:flex;align-items:center;margin-bottom:4px;gap:8px;">' +
          '<button id="bs-back-btn2" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;display:flex;align-items:center;gap:4px;padding:4px 0;font-size:14px;font-weight:600;"><i data-lucide="arrow-left" style="width:18px;height:18px;"></i> Back</button>' +
        '</div>' +
        // Tab bar
        '<div class="bs-tabs">' +
          '<button class="bs-tab active" data-tab="add">Add</button>' +
          '<button class="bs-tab" data-tab="qr">My QR</button>' +
        '</div>' +
        // Add tab
        '<div class="bs-tab-content" id="bs-tab-add">' +
          '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Enter an IP address or Peer ID to connect</div>' +
          '<input id="bs-add-input" class="bs-input" placeholder="IP address or Peer ID...">' +
          '<button id="bs-add-connect" class="bs-btn-primary" style="margin-top:12px;">Connect</button>' +
        '</div>' +
        // My QR tab
        '<div class="bs-tab-content" id="bs-tab-qr" style="display:none;">' +
          '<div style="text-align:center;padding:12px 0;">' +
            '<div id="bs-qr-canvas" style="display:inline-block;padding:12px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.1);"></div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:8px;">Share this QR code to let others connect with you</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    
    OrbitSheet.showCustom(html);
    
    setTimeout(function() {
      // Tab switching
      document.querySelectorAll('.bs-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          document.querySelectorAll('.bs-tab').forEach(function(t) { t.classList.remove('active'); });
          this.classList.add('active');
          var tabName = this.getAttribute('data-tab');
          document.querySelectorAll('.bs-tab-content').forEach(function(c) { c.style.display = 'none'; });
          var target = document.getElementById('bs-tab-' + tabName);
          if (target) target.style.display = 'block';
          if (tabName === 'qr') {
            renderQR();
          } else if (tabName === 'add') {
            var ai = document.getElementById('bs-add-input');
            if (ai) ai.focus();
          }
        });
      });
      
      function renderQR() {
        var container = document.getElementById('bs-qr-canvas');
        if (!container) return;
        if (!window.QRCode || !MStore.user) {
          container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);padding:20px;">User data not available</div>';
          return;
        }

        function paint(qrData) {
          try {
            var qr = new QRCode(0, 'M');
            qr.addData(qrData);
            qr.make();
            var canvas = document.createElement('canvas');
            canvas.width = 160;
            canvas.height = 160;
            var ctx = canvas.getContext('2d');
            var modCount = qr.getModuleCount();
            var cellSize = 160 / modCount;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 160, 160);
            ctx.fillStyle = '#000000';
            for (var row = 0; row < modCount; row++) {
              for (var col = 0; col < modCount; col++) {
                if (qr.isDark(row, col)) {
                  ctx.fillRect(Math.floor(col * cellSize), Math.floor(row * cellSize), Math.ceil(cellSize), Math.ceil(cellSize));
                }
              }
            }
            container.innerHTML = '';
            container.appendChild(canvas);
          } catch(e) {
            container.textContent = 'Could not generate QR code';
          }
        }

        // v1 fallback (identity only). Previously this function encoded a BARE
        // user id string, which JSON.parse could not read — the scanner threw,
        // swallowed the error, and scanned forever. Never regress to that.
        function paintV1() {
          paint(JSON.stringify({ v: 1, id: MStore.user.id, n: MStore.user.name, t: MStore.user.tag }));
        }

        if (!window.Orbit || !Orbit.QRPairing) { paintV1(); return; }

        Orbit.QRPairing.listLocalIPv4().then(function(ips) {
          var payload = Orbit.QRPairing.buildPayload(MStore.user, {
            ips: ips,
            port: Orbit.QRPairing.DEFAULT_PORT,
            publicKey: MStore.user.publicKey || null
          });
          if (payload) paint(payload); else paintV1();
        }).catch(paintV1);
      }
      
      // Wire connect
      document.getElementById('bs-add-connect').addEventListener('click', function() {
        var val = document.getElementById('bs-add-input').value.trim();
        if (!val) { showToast('Enter an IP or Peer ID', 'info'); return; }
        OrbitSheet.hide();
        setTimeout(function() {
          document.getElementById('modal-input').value = val;
          if (window.confirmAddFriend) window.confirmAddFriend();
        }, 200);
      });
      
      // Enter key
      document.getElementById('bs-add-input').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); document.getElementById('bs-add-connect').click(); }
      });

      // Back button — return to + menu
      document.getElementById('bs-back-btn2').addEventListener('click', function() {
        OrbitSheet.hide();
        if (typeof OrbitHome !== 'undefined' && OrbitHome.showQuickSheet) {
          setTimeout(function() { OrbitHome.showQuickSheet(); }, 250);
        }
      });
    }, 50);
  }

  function hideModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  }

  function confirmAddFriend() {
    var input = document.getElementById('modal-input');
    var val = input.value.trim();
    if (!val) return;
    hideModal();

    // Parse input: "host:port" or just "host"
    var parts = val.split(':');
    var host = parts[0];
    var port = parseInt(parts[1], 10) || 46000;
    var peerId = host + ':' + port;

    // Prevent connecting to self
    if (host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '::1') {
      showToast('Cannot connect to yourself', 'error');
      return;
    }

    // Add as friend
    var existing = MStore.friends.find(function(f) { return f.id === peerId; });
    if (!existing) {
      MStore.friends.push({
        id: peerId,
        name: host,
        tag: '',
        status: 'offline',
        avatar: null,
        bio: '',
        ip: host,
        publicKey: null
      });
      MStore.save();
      renderFriends();
    }

    // Ensure chat exists
    var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
    if (!chatExists) {
      MStore.chats.push({ id: peerId, name: host, lastMessage: '', lastTime: '', unread: 0 });
      MStore.save();
      renderChatList();
    }

    showToast('Connecting to ' + host + '...', 'info');

    // Attempt P2P connection — try even if plugin wasn't ready at boot
    if (window.Orbit && window.Orbit.P2P) {
      Orbit.P2P.connect(host, port, peerId).then(function(result) {
        if (result.success) {
          showToast('Connected to ' + host, 'info');
          // Update friend status
          var friend = MStore.friends.find(function(f) { return f.id === peerId; });
          if (friend) {
            friend.status = 'online';
            // A peer just became reachable — drain anything queued for them.
            if (window.OrbitOutbox) setTimeout(function() { OrbitOutbox.flush(); }, 500);
            MStore.save();
            renderFriends();
            renderChatList();
          }
        } else {
          showToast('Connection failed: ' + (result.error || 'unknown'), 'info');
        }
      });
    } else {
      showToast('P2P bridge not loaded', 'error');
    }
  }

  /* -- QR Scanner -- */
  var _qrScanning = false;
  var _qrStream = null;
  // Debounce: a code held in frame decodes ~30x/sec. Without this, a bad code
  // would spam a toast every frame.
  var _lastQRRaw = null;
  var _lastQRAt = 0;

  function startQRScanner() {
    var overlay = document.getElementById('qr-scanner-overlay');
    var video = document.getElementById('qr-scanner-video');
    if (!overlay || !video) return;
    overlay.style.display = 'flex';

    // Request camera
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 640 } }).then(function(stream) {
      _qrStream = stream;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.play();
      _qrScanning = true;
      scanFrame();
    }).catch(function() {
      showToast('Camera access denied', 'info');
      stopQRScanner();
    });
  }

  function scanFrame() {
    if (!_qrScanning) return;
    var video = document.getElementById('qr-scanner-video');
    var canvas = document.getElementById('qr-scanner-canvas');
    if (!video || !canvas || video.readyState < 2) {
      requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (typeof jsQR !== 'undefined') {
      var code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if (code && code.data) {
        var now = Date.now();
        if (code.data !== _lastQRRaw || (now - _lastQRAt) > 3000) {
          _lastQRRaw = code.data;
          _lastQRAt = now;
          handleQRPayload(code.data);
        }
      }
    }
    requestAnimationFrame(scanFrame);
  }

  // Validate and pair. Every failure path reports to the user — the previous
  // implementation caught parse errors silently and scanned forever, so a bad
  // code looked identical to a camera that simply wasn't finding anything.
  function handleQRPayload(raw) {
    if (!window.Orbit || !Orbit.QRPairing) {
      showToast('Pairing unavailable — update the app', 'info');
      return;
    }
    // Own addresses, so a QR can never make us connect to ourselves.
    Orbit.QRPairing.listLocalIPv4().then(function(ownIps) {
      var res = Orbit.QRPairing.parsePayload(raw, { ownIps: ownIps });
      if (!res.ok) {
        showToast(Orbit.QRPairing.describeReason(res.reason), 'info');
        return;
      }
      // A code that offers an account keeps the screen up: it turns into the
      // progress view instead of closing the instant the code is read.
      var isTransfer = !!(window.OrbitAccountReceive &&
                          OrbitAccountReceive.isTransferPayload(res.data));
      stopQRScanner(isTransfer);
      pairFromQRData(res.data);
    }).catch(function() {
      showToast('Could not read network addresses', 'info');
    });
  }

  function pairFromQRData(data) {
    var peerId = data.id;
    var peerName = data.n || 'Unknown';
    var peerTag = data.t || '';
    var ip = data.ips.length ? data.ips[0] : null;

    // Only pin a key we can actually encrypt to. Desktop keys are hex and
    // mobile keys are SPKI — a key from the other platform would be stored and
    // then fail silently at encrypt time, so it is skipped instead.
    var publicKey = null;
    if (Orbit.QRPairing.isUsableKey(data)) {
      publicKey = Orbit.QRPairing.exportKey(data.key);
    } else if (data.key) {
      showToast('Paired without key pinning (different key format)', 'info');
    }

    var existing = MStore.friends.find(function(f) { return f.id === peerId; });
    if (existing) {
      if (ip) existing.ip = ip;
      if (data.port) existing.tcpPort = data.port;
      if (publicKey) _setPeerKey(existing, publicKey);
      MStore.save();
      renderFriends();
      showToast(peerName + ' updated', 'info');
    } else {
      MStore.friends.push({
        id: peerId, name: peerName, tag: peerTag, status: 'offline',
        avatar: null, bio: '', ip: ip, tcpPort: data.port, publicKey: publicKey
      });
      MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0 });
      MStore.save();
      renderFriends();
      renderChatList();
      showToast('Added ' + peerName, 'info');
    }

    // An account transfer takes over from here. The peer above is already saved
    // and connected, which is what the pull rides on.
    if (window.OrbitAccountReceive && OrbitAccountReceive.isTransferPayload(data)) {
      OrbitAccountReceive.start(data);
      return;
    }

    if (!data.ips.length) {
      // v1 codes and codes generated before address enumeration existed.
      // Falling back to discovery is expected here, not a failure.
      showToast('No address in the code — waiting for discovery', 'info');
      return;
    }
    connectViaQR(data.ips, data.port, peerId, peerName);
  }

  // A QR carries every candidate address the other device has (Wi-Fi, Ethernet,
  // virtual adapters). We cannot know which one this phone can reach, so try
  // them in order with a short timeout each.
  function connectViaQR(ips, port, peerId, peerName) {
    var idx = 0;
    var perAttemptMs = Math.min((MStore.settings.netTimeout || 30) * 1000, 10000);

    function attempt() {
      if (idx >= ips.length) {
        showToast('Could not reach ' + peerName + ' — trying discovery', 'info');
        return;
      }
      var ip = ips[idx++];
      if (!window.Orbit || !Orbit.P2P || !Orbit.P2P.connect) return;
      Orbit.P2P.connect(ip, port, peerId, perAttemptMs).then(function(r) {
        if (r && r.success) {
          var f = MStore.friends.find(function(x) { return x.id === peerId; });
          if (f) {
            f.ip = ip;
            f.tcpPort = port;
            if (r.connectionId) f.connectionId = r.connectionId;
            MStore.save();
          }
          showToast('Connected to ' + peerName, 'info');
        } else {
          attempt();
        }
      }).catch(function() { attempt(); });
    }

    showToast('Connecting to ' + peerName + '…', 'info');
    attempt();
  }

  // keepVisible: stop the camera but leave the screen up. An account transfer
  // needs it — the pair screen becomes the progress view rather than closing the
  // moment a code is read.
  function stopQRScanner(keepVisible) {
    _qrScanning = false;
    if (_qrStream) {
      _qrStream.getTracks().forEach(function(t) { t.stop(); });
      _qrStream = null;
    }
    var overlay = document.getElementById('qr-scanner-overlay');
    if (!overlay) return;
    if (!keepVisible) {
      overlay.style.display = 'none';
      return;
    }
    var frame = overlay.querySelector('.qr-scan-frame');
    if (frame) frame.style.display = 'none';
    var prog = document.getElementById('qr-scan-progress');
    if (prog) prog.style.display = '';
  }

  /* -- Toast -- */

  function isValidAvatarUrl(url) {
    return url && (typeof url === 'string') && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:'));
  }

  // Mirrors OrbitNotifications.Kind on the Android side — keep the two in step.
  var NOTIFY_KINDS = ['MESSAGE', 'MENTION', 'CALL', 'VIDEO_CALL', 'UPDATE', 'PROGRESS', 'ERROR', 'SUCCESS'];

  // The sender's avatar for the notification's large icon. Android puts Orbit's
  // mark in the status bar (the small icon, OrbitNotifications.java) and the
  // sender's face in the notification itself — the pairing Discord uses, and the
  // reason a glance at the shade tells you who wrote without reading the title.
  // Returns null when we have no avatar for the sender, which just leaves the
  // large icon off.
  function _notificationAvatar(data) {
    try {
      var fromId = data && data.fromId;
      if (!fromId) return null;
      var friends = (window.MStore && MStore.friends) || [];
      var f = null;
      for (var i = 0; i < friends.length; i++) {
        var x = friends[i];
        if (x && (x.id === fromId || x.peerId === fromId || x.userId === fromId)) { f = x; break; }
      }
      if (!f || !f.avatar) return null;
      // safeAvatarSrc drops anything that is not a usable image source, so the
      // native side never receives a value it cannot decode.
      return (typeof safeAvatarSrc === 'function') ? safeAvatarSrc(f.avatar) : f.avatar;
    } catch (e) {
      return null;
    }
  }

  // Exposed alongside the other notification helpers so the avatar lookup can be
  // exercised without a device (there is no native plugin in a browser harness).
  window.orbitNotificationAvatar = _notificationAvatar;

  // Hand the native layer the avatars it will need.
  //
  // A background notification is posted from the NATIVE message handler (the
  // WebView may be frozen, which is exactly why that path exists), and it only has
  // the packet — and a MESSAGE packet carries no image, deliberately: putting a
  // thumbnail on every message would be absurd. So the renderer pushes what it
  // knows instead, and OrbitNotifications.setPeerAvatars keeps it.
  //
  // Called on the way to the background, which is the last moment the WebView is
  // guaranteed to be running, and once shortly after boot.
  function pushPeerAvatarsToNative() {
    try {
      var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
      if (!plugins.OrbitP2P || typeof plugins.OrbitP2P.setPeerAvatars !== 'function') return;
      var map = {};
      var friends = (window.MStore && MStore.friends) || [];
      for (var i = 0; i < friends.length; i++) {
        var f = friends[i];
        if (!f || !f.id || !f.avatar) continue;
        var src = (typeof safeAvatarSrc === 'function') ? safeAvatarSrc(f.avatar) : f.avatar;
        // Data URLs only: the native side base64-decodes them directly. A path or
        // a blob URL would be rejected there anyway, so do not pretend otherwise.
        if (src && /^data:image\//i.test(src)) map[f.id] = src;
      }
      var r = plugins.OrbitP2P.setPeerAvatars({ avatars: map });
      if (r && r.catch) r.catch(function () {});
    } catch (e) { /* an avatar cache must never break anything */ }
  }
  window.orbitPushPeerAvatars = pushPeerAvatarsToNative;

  /**
   * Where an inline notification reply should go, or null if it is ambiguous.
   *
   * Direct messages only. A group notification carries a group id, and replying
   * into a group from a notification would put a message in front of everyone
   * with no chance to check who it was meant for.
   */
  function _replyTargetFor(data) {
    if (!data || !data.chatId) return null;
    var chatId = String(data.chatId);
    if (chatId === 'echo' || chatId === 'local-echo') return null;
    try { if (_isGroupChat(chatId)) return null; } catch (e) { return null; }
    return chatId;
  }

  window.__probeReplyTarget = _replyTargetFor;   // pure, and worth asserting on

  function showNativeNotification(title, body, data, kind) {
    if (NOTIFY_KINDS.indexOf(kind) === -1) kind = 'MESSAGE';
    try {
      var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};

      // Preferred: Orbit's own notification layer, which owns the channels and the
      // per-type icons (see OrbitNotifications.java). Using it means a message, a
      // mention and a call each get their own channel and their own icon.
      if (plugins.OrbitP2P && typeof plugins.OrbitP2P.notify === 'function') {
        var p = plugins.OrbitP2P.notify({
          kind: kind,
          title: title,
          text: body,
          groupKey: (data && (data.groupKey || data.chatId)) || null,
          avatar: _notificationAvatar(data),
          // An inline reply box, but only where a reply has one obvious
          // destination. In a group the notification cannot say who it is
          // replying to, and a box that cannot say where it is going is worse
          // than no box.
          replyToChatId: _replyTargetFor(data)
        });
        if (p && p.catch) p.catch(function () {});
        return;
      }

      // Fallback for an older native build. This used to reference channel
      // 'orbit_messages' (which nothing ever created) and smallIcon
      // 'ic_stat_icon' (which never existed) — either one alone is enough for
      // Android to drop the notification, so this path never worked.
      if (plugins.LocalNotifications) {
        plugins.LocalNotifications.schedule({
          notifications: [{
            id: Date.now(),
            title: title,
            body: body,
            channelId: 'orbit_messages',
            smallIcon: 'ic_notify_orbit',
            data: data || {}
          }]
        });
      }
    } catch(e) {
      console.log('[Notifications] Native notification error:', e);
    }
  }

  /**
   * Public entry point for the rest of the app. Components (call manager, update
   * notice, vault) live outside this closure and cannot reach showNativeNotification
   * directly, so they go through here.
   *
   * kind: one of NOTIFY_KINDS — MESSAGE | MENTION | CALL | VIDEO_CALL | UPDATE |
   *       PROGRESS | ERROR | SUCCESS
   */
  // The outbox tells us when it has drained, so pending bubbles can clear.
  window.addEventListener('orbit-outbox-changed', function () {
    try {
      var still = window.OrbitOutbox ? OrbitOutbox.pendingFor(null) : {};
      var touched = false;
      (MStore.chats || []).forEach(function (c) {
        var msgs = MStore.getMessages(c.id);
        msgs.forEach(function (m) {
          if (m.pending && !still[String(m.id)]) { m.pending = false; touched = true; }
        });
      });
      if (touched) { MStore.save(); if (activeChatId) renderMessages(activeChatId); }
    } catch (e) { /* non-fatal */ }
  });

  // Kinds that mean "someone is trying to reach you". These must never appear as a
  // system notification while the user is looking at the app — they are already seeing
  // the message, and a banner on top of it is noise. Other kinds (vault progress,
  // errors) are about work the user started and stay unconditional.
  var REACH_ME_KINDS = { MESSAGE: true, MENTION: true, CALL: true, VIDEO_CALL: true };

  window.orbitNotify = function (kind, title, text, groupKey) {
    // The native path already gates on the activity lifecycle (see
    // OrbitP2PPlugin: if (!_isForeground) postMessageNotification(...)). This is the
    // JS side of the same rule: without it, anything JS raises posts regardless of
    // whether the app is on screen.
    if (REACH_ME_KINDS[kind] && typeof window.orbitIsBackground === 'function'
        && !window.orbitIsBackground()) {
      return;
    }
    showNativeNotification(title, text, groupKey ? { groupKey: groupKey } : null, kind);
  };

  /** True when the app is not on screen — either signal alone is unreliable. */
  window.orbitIsBackground = function () {
    return window._appIsBackgrounded === true || document.hidden === true;
  };

  // requestNotificationPermission() used to live here and raised the notification
  // dialog on the spot, with no idea whether it was already granted. It is gone:
  // there is now exactly one place that asks, components/permission-gate.js, and
  // it reads the current state first. Leaving a second entry point under the old
  // name is how a competing prompt gets reintroduced later.

  function showWebNotification(title, body, data) {
    try {
      if ('Notification' in window && window.Notification.permission === 'granted') {
        var notif = new window.Notification(title, {
          body: body || '',
          icon: 'icons/app/orbit_256.png',
          tag: (data && data.chatId) ? data.chatId : 'orbit',
          data: data || {}
        });
        notif.onclick = function() {
          window.focus();
          if (this.data && this.data.chatId && window.openChat) {
            window.openChat(this.data.chatId);
          }
          this.close();
        };
      }
    } catch(e) {
      console.log('[Notifications] Web notification error:', e);
    }
  }

  /* -- Flush queued notifications on foreground -- */
  function flushPendingNotifications() {
    try {
      if (!window._notifyPending || window._notifyPending.length === 0) return;
      var pending = window._notifyPending.splice(0);
      // Group by chat to avoid spamming
      var grouped = {};
      pending.forEach(function(n) {
        if (!grouped[n.chatId]) grouped[n.chatId] = { name: n.name, count: 0, lastText: n.text, chatId: n.chatId, fromId: n.fromId };
        grouped[n.chatId].count++;
        grouped[n.chatId].lastText = n.text;
      });
      // Only notify for chats that aren't currently open
      for (var cid in grouped) {
        if (cid === activeChatId) continue;
        var g = grouped[cid];
        var body = g.count > 1 ? g.count + ' new messages' : g.lastText;
        showWebNotification(g.name, body, { chatId: g.chatId, fromId: g.fromId });
        showNativeNotification(g.name, body, { chatId: g.chatId, fromId: g.fromId });
      }
    } catch(e) { console.log('[Notifications] Flush error:', e); }
  }

  function showIncomingNotification(chatId, fromId, text) {
    if (activeChatId === chatId) return;
    if (MStore.settings.notifyDnd) return;
    if (MStore.settings.mutedChats && MStore.settings.mutedChats[chatId]) return;
    var friend = MStore.friends.find(function(f) { return f.id === fromId; });
    var name = friend ? friend.name : (fromId || 'Someone');
    // Group mention check — also decides which native channel/icon this uses.
    var isGroup = MStore.groups.some(function(g) { return g.id === chatId; });
    var isMention = false;
    if (isGroup) {
      var myName = MStore.user ? MStore.user.name : '';
      isMention = !!(myName && text.indexOf('@' + myName) !== -1);
      if (MStore.settings.notifyGroupMentions && !isMention) return;
    }
    var preview = MStore.settings.notifyPreview !== false ? text : 'New message';
    
    // Always show in-app toast (visible in foreground only, harmless in background)
    showToast(name + ': ' + preview, 'info');
    
    // Play sound
    if (MStore.settings.notifySound) playNotificationSound();
    
    // Always attempt system notifications — don't gate on background detection.
    // `_appIsBackgrounded` is unreliable in Capacitor WebView (sometimes false when backgrounded,
    // sometimes true when foregrounded). Both showWebNotification and showNativeNotification
    // have their own internal permission/availability checks, so it's safe to always call them.
    // The OS will suppress duplicates if the user is actively using the app.
    showWebNotification(name, preview, { chatId: chatId, fromId: fromId });
    showNativeNotification(name, preview, { chatId: chatId, fromId: fromId },
                           isMention ? 'MENTION' : 'MESSAGE');
    
    // Also push to pending notification queue for foreground recovery
    // (handles the case where the WebView was paused and onMessage didn't fire)
    if (typeof window._notifyPending === 'undefined') window._notifyPending = [];
    window._notifyPending.push({ chatId: chatId, fromId: fromId, name: name, text: preview, time: Date.now() });
    // Cap queue at 50 to avoid memory leak
    if (window._notifyPending.length > 50) window._notifyPending.splice(0, window._notifyPending.length - 50);
  }

  function playNotificationSound() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var vol = (MStore.settings.notifyVolume != null ? MStore.settings.notifyVolume : 80) / 100;
      var soundType = MStore.settings.notifySoundType || 'chime';
      var gain = ctx.createGain();
      gain.connect(ctx.destination);
      var now = ctx.currentTime;
      if (soundType === 'pop') {
        var pop = ctx.createOscillator();
        pop.connect(gain);
        pop.frequency.value = 880;
        pop.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        pop.start(now);
        pop.stop(now + 0.1);
      } else if (soundType === 'gentle') {
        var gen = ctx.createOscillator();
        gen.connect(gain);
        gen.frequency.value = 440;
        gen.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        gen.start(now);
        gen.stop(now + 0.4);
      } else if (soundType === 'classic') {
        var c1 = ctx.createOscillator();
        var g1 = ctx.createGain();
        c1.connect(g1);
        g1.connect(ctx.destination);
        c1.frequency.value = 523;
        c1.type = 'sine';
        g1.gain.setValueAtTime(vol * 0.12, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        c1.start(now);
        c1.stop(now + 0.15);
        var c2 = ctx.createOscillator();
        var g2 = ctx.createGain();
        c2.connect(g2);
        g2.connect(ctx.destination);
        c2.frequency.value = 659;
        c2.type = 'sine';
        g2.gain.setValueAtTime(vol * 0.12, now + 0.15);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        c2.start(now + 0.15);
        c2.stop(now + 0.35);
      } else {
        var osc = ctx.createOscillator();
        osc.connect(gain);
        osc.frequency.value = 660;
        osc.type = 'sine';
        gain.gain.setValueAtTime(vol * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch(e) {}
  }

  /**
   * A toast. `action` is optional: `{ label, onTap, duration }`.
   *
   * The action exists for undo. A toast that says "Message deleted" and a toast
   * that says "Message deleted · Undo" are the same toast — the difference is
   * whether you can change your mind, and an undo you cannot reach in time is
   * not an undo. So an action also sets its own (longer) duration, and the
   * progress bar is what tells you how long you have.
   */
  function showToast(msg, type, action) {
    var container = document.getElementById('toast-container');
    if (!container) { console.warn('[Orbit] toast-container missing'); return; }
    var el = document.createElement('div');
    el.className = 'toast-mobile' + (type && type !== 'info' ? ' toast-' + type : '');

    var icons = { info: 'info', success: 'check-circle', error: 'alert-circle', warning: 'alert-triangle' };
    var iconName = icons[type] || 'info';

    var actionHtml = (action && action.label)
      ? '<button class="toast-action">' + escapeHtml(action.label) + '</button>'
      : '';
    el.innerHTML = '<i data-lucide="' + iconName + '"></i><span class="toast-text">' + escapeHtml(msg) +
      '</span>' + actionHtml + '<div class="toast-bar"></div>';

    container.appendChild(el);
    if (window.lucide) lucide.createIcons({ root: el });

    var gone = false;
    var dismiss = function () {
      if (gone) return;
      gone = true;
      el.style.opacity = '0';
      el.style.transform = 'translateY(-24px) scale(0.95)';
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(function() { el.remove(); }, 300);
    };

    if (action && action.label) {
      var btn = el.querySelector('.toast-action');
      if (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          dismiss();
          if (typeof action.onTap === 'function') action.onTap();
        });
      }
    }

    var duration = (action && action.duration) || 2500;
    // The bar shrinks over the toast's life, so the window is visible rather than
    // something you have to guess at. It is driven by the existing toastShrink
    // keyframes — which are hardcoded to 2.5s — so an action toast has to move
    // the animation, not add a transition on top of it.
    var bar = el.querySelector('.toast-bar');
    if (bar && action && action.label) bar.style.animationDuration = duration + 'ms';
    setTimeout(dismiss, duration);
  }
  window.showToast = showToast;

  function compressVideoMobile(dataUrl, maxW, callback) {
    try {
      var video = document.createElement('video');
      video.muted = true;
      video.playsinline = true;
      video.preload = 'metadata';
      video.src = dataUrl;
      video.onloadedmetadata = function() {
        var scale = Math.min(1, maxW / video.videoWidth);
        var w = Math.round(video.videoWidth * scale);
        var h = Math.round(video.videoHeight * scale);
        if (w % 2 !== 0) w++;
        if (h % 2 !== 0) h++;
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        var stream = canvas.captureStream(15);
        var chunks = [];
        var recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 500000
        });
        recorder.ondataavailable = function(e) {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onstop = function() {
          var reader = new FileReader();
          reader.onload = function() { callback(reader.result || dataUrl); };
          reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
        };
        recorder.start(1000);
        var drawTimer = setInterval(function() {
          if (video.paused || video.ended) {
            clearInterval(drawTimer);
            if (recorder.state !== 'inactive') recorder.stop();
            return;
          }
          ctx.drawImage(video, 0, 0, w, h);
        }, 66);
        video.play().catch(function() {
          clearInterval(drawTimer);
          if (recorder.state !== 'inactive') recorder.stop();
          callback(dataUrl);
        });
      };
      video.onerror = function() { callback(dataUrl); };
    } catch(e) {
      console.error('[Compress] Error:', e);
      callback(dataUrl);
    }
  }

  /* -- Helpers -- */
  function renderLucide(container) {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      try {
        if (container && container.nodeType) {
          lucide.createIcons({ root: container });
        } else if (typeof container === 'object') {
          lucide.createIcons(container);
        } else {
          lucide.createIcons();
        }
      } catch(e) {}
    }
  }

  function _dataUrlToBlobUrl(dataUrl) {
    try {
      // Parse MIME type even if extra parameters (e.g. ;codecs=...) appear before ;base64,
      var m = dataUrl.match(/^data:([^;]+)(?:;[^;]+)*;base64,(.+)$/);
      if (!m) m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (m) {
        var blobUrl = window.orbitBase64ToBlob(m[2], m[1]);
        if (blobUrl) {
          if (!window._blobUrlsToRevoke) window._blobUrlsToRevoke = [];
          window._blobUrlsToRevoke.push(blobUrl);
          return blobUrl;
        }
      }
    } catch(e) { console.warn('[Orbit] data:→blob failed', e.message); }
    return dataUrl;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function jsEscape(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/</g, '\<');
  }

  function safeAvatarSrc(url) {
    if (!url) return '';
    var s = String(url).trim();
    if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
    // Allow relative app-asset paths (e.g. the Echo bot's icons/... avatar)
    // only when there is no scheme prefix, so javascript:/vbscript:/data:text
    // URLs stay blocked (v0.4.1-beta fix).
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) return s;
    return '';
  }

  function linkifyText(text) {
    if (!text) return '';
    var html = escapeHtml(text);
    html = html.replace(/(https?:\/\/[^\s]+)/g, function(url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="msg-link-mob">' + url + '</a>';
    });
    return html;
  }

  function formatTime(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (MStore.settings.timeFormat24 === false) {
        var hour = d.getHours();
        var ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12;
        if (hour === 0) hour = 12;
        return hour + ':' + d.getMinutes().toString().padStart(2, '0') + ' ' + ampm;
      }
      return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    } catch(e) { return ''; }
  }

  /* ---- Mention Autocomplete ---- */
  function _getMentionableUsers(chatId) {
    var users = [];
    var seen = {};
    // Add all friends (excluding current user)
    (MStore.friends || []).forEach(function(f) {
      if (!seen[f.id] && f.id !== MStore.user.id) {
        seen[f.id] = true;
        users.push({ id: f.id, name: f.name || f.id, tag: f.tag || '', avatar: f.avatar });
      }
    });
    // Add group members for the active group chat
    var group = (MStore.groups || []).find(function(g) { return g.id === chatId || g.groupId === chatId; });
    if (group && group.members) {
      group.members.forEach(function(m) {
        var mid = typeof m === 'string' ? m : m.userId;
        if (!seen[mid] && mid !== MStore.user.id) {
          seen[mid] = true;
          var friend = (MStore.friends || []).find(function(f) { return f.id === mid; });
          users.push({
            id: mid,
            name: friend ? friend.name : (m.name || mid),
            tag: friend ? (friend.tag || '') : (m.tag || ''),
            avatar: friend ? friend.avatar : null
          });
        }
      });
    }
    return users;
  }

  function _getMentionUsers(chatId, query) {
    var all = _getMentionableUsers(chatId);
    if (!query) return all;
    var q = query.toLowerCase();
    return all.filter(function(u) {
      return u.name.toLowerCase().indexOf(q) !== -1 || (u.tag && u.tag.toLowerCase().indexOf(q) !== -1);
    });
  }

  function _buildMentionDropdownHtml(users, selectedIndex) {
    var html = '';
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var initial = (u.name || '?').charAt(0).toUpperCase();
      var mAvatarSrc = safeAvatarSrc(u.avatar);
      var avatarHtml = mAvatarSrc
        ? '<img src="' + mAvatarSrc + '" alt="">'
        : '<span class="mention-avatar-placeholder">' + escapeHtml(initial) + '</span>';
      var isSelected = i === selectedIndex;
      html += '<div class="mention-item' + (isSelected ? ' selected' : '') + '" data-index="' + i + '" data-userid="' + escapeAttr(u.id) + '" data-username="' + escapeAttr(u.name) + '" data-tag="' + escapeAttr(u.tag || '') + '">' +
        '<div class="mention-item-avatar">' + avatarHtml + '</div>' +
        '<div class="mention-item-info">' +
          '<span class="mention-item-name">' + escapeHtml(u.name) + '</span>' +
          '<span class="mention-item-tag">@' + escapeHtml(u.tag || u.name) + '</span>' +
        '</div>' +
      '</div>';
    }
    return html;
  }

  function _showMentionDropdown() {
    if (!_mentionDropdown) _mentionDropdown = document.getElementById('mention-dropdown');
    if (!_mentionDropdown) {
      _mentionDropdown = document.createElement('div');
      _mentionDropdown.id = 'mention-dropdown';
      _mentionDropdown.className = 'mention-dropdown';
      _mentionDropdown.style.display = 'none';
      var chatPanel = document.getElementById('panel-chat') || document.body;
      chatPanel.appendChild(_mentionDropdown);
    }
    var input = document.getElementById('chat-input');
    if (!input) return;

    var users = _getMentionUsers(activeChatId, _mentionQuery);
    _mentionUsers = users;
    _mentionSelectedIndex = 0;

    if (users.length === 0) {
      _hideMentionDropdown();
      return;
    }

    _mentionDropdown.innerHTML = '<div class="mention-header">Mentions</div>' + _buildMentionDropdownHtml(users, 0);
    _mentionDropdown.style.display = 'block';
    _mentionActive = true;

    // Position dropdown using mirror div
    _positionMentionDropdown(input);

    // Wire click handlers
    _mentionDropdown.querySelectorAll('.mention-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'), 10);
        _mentionSelectedIndex = idx;
        _selectMention();
      });
    });

    // Wire hover
    _mentionDropdown.querySelectorAll('.mention-item').forEach(function(item) {
      item.addEventListener('mouseenter', function() {
        _mentionDropdown.querySelectorAll('.mention-item').forEach(function(el) { el.classList.remove('selected'); });
        this.classList.add('selected');
        _mentionSelectedIndex = parseInt(this.getAttribute('data-index'), 10);
      });
    });
  }

  function _hideMentionDropdown() {
    _mentionActive = false;
    _mentionQuery = '';
    _mentionUsers = [];
    _mentionSelectedIndex = 0;
    _mentionStartPos = -1;
    if (_mentionDropdown) {
      _mentionDropdown.style.display = 'none';
      _mentionDropdown.innerHTML = '';
    }
  }

  function _positionMentionDropdown(input) {
    if (!_mentionDropdown) return;
    var rect = input.getBoundingClientRect();
    // Position above the textarea (avoids keyboard overlap on mobile)
    _mentionDropdown.style.left = Math.max(8, Math.min(rect.left + 8, window.innerWidth - 280)) + 'px';
    _mentionDropdown.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
    _mentionDropdown.style.maxHeight = Math.min(200, rect.top - 20) + 'px';
  }

  function _selectMention() {
    var users = _mentionUsers;
    if (!users || users.length === 0 || _mentionSelectedIndex < 0 || _mentionSelectedIndex >= users.length) return;
    var user = users[_mentionSelectedIndex];
    var input = document.getElementById('chat-input');
    if (!input) return;

    var val = input.value;
    var beforeAt = val.substring(0, _mentionStartPos);
    var afterAt = val.substring(_mentionStartPos);
    var wordEnd = afterAt.search(/\s|$/);
    if (wordEnd === -1) wordEnd = afterAt.length;
    var afterMention = afterAt.substring(wordEnd);

    input.value = beforeAt + '@' + user.name + ' ' + afterMention;
    var newCursor = beforeAt.length + user.name.length + 2;
    input.selectionStart = input.selectionEnd = newCursor;

    // Trigger input event to update textarea height and draft save
    var evt = new Event('input', { bubbles: true });
    input.dispatchEvent(evt);

    _hideMentionDropdown();
    input.focus();
  }

  function _renderMsgText(text, mentions) {
    if (!text) return '';
    var processed = text;
    var placeholders = [];
    // If we have structured mention data, swap @username for placeholders before markdown
    if (mentions && mentions.length > 0) {
      mentions.forEach(function(mt, idx) {
        var escapedName = mt.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var re = new RegExp('@' + escapedName + '\\b', 'g');
        var placeholder = '\x00MENTION_' + idx + '\x00';
        processed = processed.replace(re, placeholder);
        placeholders.push({ idx: idx, userId: mt.userId, username: mt.username, name: mt.name, tag: mt.tag });
      });
    }
    // Run through markdown
    var html = window.Sanitize ? window.Sanitize.markdown(processed) : escapeHtml(processed);
    // Restore mention placeholders as clickable spans
    if (placeholders.length > 0) {
      placeholders.forEach(function(p) {
        var ph = '\x00MENTION_' + p.idx + '\x00';
        var mentionHtml = '<span class="chat-mention mention-clickable" data-userid="' + escapeAttr(p.userId) + '" data-username="' + escapeAttr(p.username) + '" onclick="window._onMentionClick(\'' + escapeHtml(jsEscape(p.userId)) + '\')">@' + escapeHtml(p.username) + '</span>';
        html = html.split(ph).join(mentionHtml);
      });
    }
    return html;
  }

  // Click handler for mention spans
  window._onMentionClick = function(userId) {
    if (typeof showProfileOverlay === 'function') {
      showProfileOverlay(userId);
    } else if (typeof showProfileSheet === 'function') {
      showProfileSheet(userId);
    }
  };

  /* -- Event Bindings -- */

  /**
   * Android fires a FULL set of synthetic mouse events after every touchend —
   * mousedown, mouseup, click — and they are dispatched against whatever element
   * is under the finger at the time, not the one the touch started on.
   *
   * That is what caused the endless voice messages. One tap on Send:
   *
   *   1. touchend on #btn-send  -> sendMessage() -> the composer swaps to the mic
   *   2. synthetic mousedown    -> now lands on #btn-voice -> startVoiceRecording()
   *   3. mouseup (on document)  -> stopVoiceRecording() -> a voice message is SENT
   *
   * One tap, a voice note nobody asked for, and it repeats because each one
   * resets the composer. The send icon looked wrong for the same reason: the
   * swap had already run, so the composer was showing the mic.
   *
   * Any mouse event within this window of a real touch is a ghost and is ignored.
   * 700ms is comfortably longer than Android's ~300ms synthetic delay and far
   * shorter than a deliberate second tap.
   */
  var _lastRealTouch = 0;
  document.addEventListener('touchstart', function() { _lastRealTouch = Date.now(); },
    { passive: true, capture: true });
  function _isGhostMouse() { return (Date.now() - _lastRealTouch) < 700; }

  // Back button
  document.getElementById('btn-back').addEventListener('click', closeChat);

  // Send button — with long-press for schedule
  (function() {
    var sendBtn = document.getElementById('btn-send');
    var longPressTimer = null;
    var isLongPress = false;

    function _clearLongPress() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }

    function _startLongPress(e) {
      if (sendBtn.disabled) return;
      isLongPress = false;
      _clearLongPress();
      longPressTimer = setTimeout(function() {
        isLongPress = true;
        // Show schedule action sheet
        var input = document.getElementById('chat-input');
        var text = input.value.trim();
        if (!text && stagedFiles.length === 0) { _clearLongPress(); return; }
        var schedSheetHtml = '<div class="action-sheet-overlay" id="schedule-action-sheet" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10001;display:flex;flex-direction:column;justify-content:flex-end;">' +
          '<div class="action-sheet-content" style="background:var(--bg-surface);border-radius:24px 24px 0 0;padding:24px 16px;animation:slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);">' +
            '<div class="bottom-sheet-handle" style="width:40px;height:5px;background:var(--border-subtle);border-radius:4px;margin:0 auto 24px;"></div>' +
            '<div class="action-btn" id="sched-send-now" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
              '<i data-lucide="send" style="width:20px;height:20px;"></i> Send Now' +
            '</div>' +
            '<div class="action-btn" id="sched-schedule" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
              '<i data-lucide="calendar-clock" style="width:20px;height:20px;"></i> Schedule' +
            '</div>' +
          '</div>' +
        '</div>';
        var schedDiv = document.createElement('div');
        schedDiv.innerHTML = schedSheetHtml;
        var schedSheet = schedDiv.firstChild;
        document.body.appendChild(schedSheet);
        if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
          OrbitSheet.enableDragClose({ sheet: schedSheet.firstElementChild, onClose: function () { schedSheet.remove(); } });
        }
        renderLucide({ root: schedSheet });
        schedSheet.addEventListener('click', function(se) {
          if (se.target === schedSheet) schedSheet.remove();
        });
        document.getElementById('sched-send-now').addEventListener('click', function() {
          schedSheet.remove();
          sendMessage();
        });
        document.getElementById('sched-schedule').addEventListener('click', function() {
          schedSheet.remove();
          _showSchedulePicker();
        });
      }, 500);
    }

    function _showSchedulePicker() {
      var input = document.getElementById('chat-input');
      var text = input.value.trim();
      if (!text && stagedFiles.length === 0) return;
      // Build a minimal date-time picker modal
      var now = new Date();
      var minStr = now.toISOString().slice(0, 16);
      var defaultStr = new Date(now.getTime() + 3600000).toISOString().slice(0, 16);
      var pickerHtml = '<div class="action-sheet-overlay" id="schedule-picker-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:10002;display:flex;align-items:center;justify-content:center;">' +
        '<div class="schedule-picker-modal" style="background:var(--bg-surface);border-radius:20px;padding:24px;width:320px;max-width:90vw;box-shadow:0 8px 40px rgba(0,0,0,0.4);">' +
          '<div style="font-size:18px;font-weight:700;color:var(--text-primary);margin-bottom:20px;text-align:center;">Schedule Message</div>' +
          '<input type="datetime-local" id="sched-datetime" value="' + defaultStr + '" min="' + minStr + '" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:15px;outline:none;box-sizing:border-box;font-family:inherit;">' +
          '<div style="display:flex;gap:10px;margin-top:20px;">' +
            '<button id="sched-cancel-btn" style="flex:1;padding:12px;border-radius:12px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);font-size:15px;font-weight:600;cursor:pointer;">Cancel</button>' +
            '<button id="sched-confirm-btn" style="flex:1;padding:12px;border-radius:12px;border:none;background:var(--accent-primary);color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Schedule</button>' +
          '</div>' +
        '</div>' +
      '</div>';
      var pickerDiv = document.createElement('div');
      pickerDiv.innerHTML = pickerHtml;
      var pickerOverlay = pickerDiv.firstChild;
      document.body.appendChild(pickerOverlay);
      document.getElementById('sched-cancel-btn').addEventListener('click', function() { pickerOverlay.remove(); });
      document.getElementById('sched-confirm-btn').addEventListener('click', function() {
        var dtInput = document.getElementById('sched-datetime');
        if (!dtInput || !dtInput.value) { showToast('Please select a date and time', 'warning'); return; }
        var scheduledAt = new Date(dtInput.value);
        if (scheduledAt <= new Date()) { showToast('Please select a future time', 'warning'); return; }
        // Save the scheduled message
        var schedMsg = {
          id: 'sched_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          chatId: activeChatId,
          text: text,
          attachments: stagedFiles.length > 0 ? stagedFiles.map(function(sf) { return { name: sf.name, type: sf.type, size: sf.size, url: sf.url }; }) : [],
          scheduledAt: scheduledAt.toISOString(),
          createdAt: new Date().toISOString(),
          sent: false
        };
        MStore.scheduleMessage(schedMsg);
        pickerOverlay.remove();
        // Clear input
        input.value = '';
        stagedFiles = [];
        renderFilePreview();
        updateSendButton();
        showToast('Message scheduled for ' + dtInput.value, 'success');
      });
    }

    // Touch events for mobile
    sendBtn.addEventListener('touchstart', _startLongPress, { passive: true });
    sendBtn.addEventListener('touchend', function(e) {
      _clearLongPress();
      if (!isLongPress) {
        hideCommandTooltip();
        sendMessage();
      }
    }, { passive: true });
    sendBtn.addEventListener('touchmove', _clearLongPress, { passive: true });

    // Mouse events for desktop/testing fallback
    sendBtn.addEventListener('mousedown', _startLongPress);
    sendBtn.addEventListener('mouseup', function(e) {
      // The tap already sent on touchend; this is the ghost.
      if (_isGhostMouse()) return;
      _clearLongPress();
      if (!isLongPress) {
        hideCommandTooltip();
        sendMessage();
      }
    });
    sendBtn.addEventListener('mouseleave', _clearLongPress);
  })();

  // Enter to send, Shift+Enter to insert newline, mention keyboard nav
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.isComposing || e.keyCode === 229) return;
    // Mention dropdown keyboard navigation
    if (_mentionActive && _mentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _mentionSelectedIndex = (_mentionSelectedIndex + 1) % _mentionUsers.length;
        _updateMentionHighlight();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        _mentionSelectedIndex = (_mentionSelectedIndex - 1 + _mentionUsers.length) % _mentionUsers.length;
        _updateMentionHighlight();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        _selectMention();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        _hideMentionDropdown();
        return;
      }
    }
    if (e.key === 'Enter' || e.keyCode === 13) {
      if (e.shiftKey) {
        // Insert newline at cursor — some Android keyboards don't default to this in textareas
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '\n' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 1;
        var evt = new Event('input', { bubbles: true });
        this.dispatchEvent(evt);
        return;
      }
      if (MStore.settings.enterToSend) {
        e.preventDefault();
        hideCommandTooltip();
        sendMessage();
      }
    }
  });

  function _updateMentionHighlight() {
    if (!_mentionDropdown) return;
    var items = _mentionDropdown.querySelectorAll('.mention-item');
    items.forEach(function(el, i) {
      el.classList.toggle('selected', i === _mentionSelectedIndex);
    });
    var selected = items[_mentionSelectedIndex];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  // ⚠ A PASTED LINK MUST BE SEEN EVEN IF NO `input` EVENT ARRIVES.
  //
  // The main handler below is on `input`, which is what a paste normally fires.
  // But some Android keyboards insert clipboard text through the IME without a
  // plain `input` event reaching this element — the text appears in the box and
  // nothing else happens. Listening for `paste` covers that path. `paste` fires
  // BEFORE the text lands, so the read is deferred a tick; if `input` also fired
  // this is simply a second, identical paint of the same URL.
  ['paste', 'compositionend'].forEach(function (evt) {
    document.getElementById('chat-input').addEventListener(evt, function () {
      setTimeout(function () {
        try { _renderLinkPreviewBar(activeChatId); } catch (e) { /* never fatal */ }
      }, 0);
    });
  });

  // Auto-resize textarea as content grows
  document.getElementById('chat-input').addEventListener('input', function(e) {
    // Soft-keyboard Enter safety net: some Android keyboards never fire a real
    // keydown for Enter and only emit insertLineBreak.
    if (e && e.inputType === 'insertLineBreak' && MStore.settings && MStore.settings.enterToSend) {
      var _lbVal = this.value;
      var _nlIdx = _lbVal.lastIndexOf('\n');
      this.value = _nlIdx === -1 ? '' : _lbVal.substring(0, _nlIdx);
      this.style.height = 'auto';
      hideCommandTooltip();
      _hideMentionDropdown();
      sendMessage();
      return;
    }
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    updateSendButton();

    // ⚠ The preview bar was only ever painted from renderMessages(), so it
    // appeared AFTER the message went — which is the one moment a preview is
    // useless, because you have already decided to send the link. A preview
    // answers "what does this lead to?" and that question belongs to the moment
    // the link is in the box, not the moment it has left.
    //
    // Guarded, like the other two bars: the composer must never break because a
    // preview could not be fetched.
    try { _renderLinkPreviewBar(activeChatId); } catch (e) { /* never fatal */ }

    // @mention detection
    if (!_mentionDropdown) _mentionDropdown = document.getElementById('mention-dropdown');
    var cursorPos = this.selectionStart;
    var val = this.value;
    // Find the @ symbol before cursor
    var textBeforeCursor = val.substring(0, cursorPos);
    var atIdx = -1;
    // Walk backwards from cursor to find @ preceded by whitespace or at start
    for (var ci = cursorPos - 1; ci >= 0; ci--) {
      var ch = textBeforeCursor[ci];
      if (ch === '@') {
        atIdx = ci;
        break;
      }
      if (ch === ' ' || ch === '\n') break;
    }
    if (atIdx !== -1) {
      var query = textBeforeCursor.substring(atIdx + 1);
      // Only trigger if query is word characters (no spaces)
      if (/^\w*$/.test(query)) {
        _mentionStartPos = atIdx;
        _mentionQuery = query;
        _showMentionDropdown();
      } else {
        _hideMentionDropdown();
      }
    } else {
      _hideMentionDropdown();
    }

    // ── Slash command suggestion tooltip ──
    if (!_mentionActive && val.indexOf('/') === 0 && !val.includes(' ')) {
      showCommandTooltip(val);
    } else {
      hideCommandTooltip();
    }

    // Debounced draft save.
    //
    // The chat is captured HERE, because that is the conversation the text belongs to.
    // The text is read at FIRE time, not captured — a captured value is what let a
    // sent message be written back as a draft 300ms later.
    if (window._draftTimer) clearTimeout(window._draftTimer);
    var _draftChatId = activeChatId;
    window._draftTimer = setTimeout(function() {
      window._draftTimer = null;
      var box = document.getElementById('chat-input');
      saveDraft(_draftChatId, box ? box.value : '');
    }, 300);

    // Send typing indicator
    if (activeChatId && activeChatId !== 'local-echo' && window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
      var now = Date.now();
      if (now - (window._lastTypingSent || 0) > 2000) {
        window._lastTypingSent = now;
        var isGroup = MStore.groups.some(function(g) { return g.id === activeChatId; });
        var myId = MStore.user ? MStore.user.id : 'mobile';
        var username = MStore.user ? MStore.user.name : 'Someone';
        var payload = { isTyping: true, username: username };
        if (isGroup) payload.groupId = activeChatId;
        
        if (isGroup) {
          var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
          if (grp && grp.members) {
            grp.members.forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== myId) {
                var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, mid, payload);
                Orbit.P2P.send(mid, pkt);
              }
            });
          }
        } else {
          var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.TYPING, myId, activeChatId, payload);
          Orbit.P2P.send(activeChatId, pkt);
        }
      }
    }
  });
  updateSendButton();

  // Search inputs
  document.getElementById('home-search-input').addEventListener('input', function() {
    searchFilter = this.value;
    renderChatList();
  });

  // Settings search
  document.getElementById('search-settings').addEventListener('input', function() {
    if (!_settingsInSection || !_settingsOverlayOpen) return;
    var query = this.value.trim().toLowerCase();
    var container = document.getElementById('settings-overlay-content');
    if (!container) return;

    var cards = container.querySelectorAll('.settings-item-card');
    var visibleCount = 0;

    cards.forEach(function(card) {
      var searchData = (card.getAttribute('data-search') || '').toLowerCase();
      if (!query || searchData.indexOf(query) !== -1) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    // Handle "no results" state
    var emptyEl = container.querySelector('.settings-search-empty');
    if (visibleCount === 0 && query && cards.length > 0) {
      if (!emptyEl) {
        emptyEl = document.createElement('div');
        emptyEl.className = 'settings-search-empty';
        emptyEl.innerHTML = '<i data-lucide="search-x"></i><span>No matching settings</span>';
        container.appendChild(emptyEl);
        if (window.lucide) lucide.createIcons({ root: emptyEl });
      }
      emptyEl.style.display = '';
    } else if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  });

  var searchFriendsEl = document.getElementById('search-friends');
  if (searchFriendsEl) {
    searchFriendsEl.addEventListener('input', function() {
      friendsSearchFilter = this.value;
      renderFriends();
    });
  }

  // Contacts: display style. The chip filters wire themselves inside
  // home-screen.js, because they are re-rendered on every paint and a listener
  // added there would be replaced with the markup.
  var contactsStyleBtn = document.getElementById('btn-contacts-style');
  if (contactsStyleBtn) {
    contactsStyleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (window.OrbitHome && OrbitHome.toggleContactsDisplay) OrbitHome.toggleContactsDisplay();
    });
  }

  var searchActivityEl = document.getElementById('search-activity');
  if (searchActivityEl) {
    searchActivityEl.addEventListener('input', function() {
      activitySearchFilter = this.value;
      renderActivity();
    });
  }

  var activityBtn = document.getElementById('btn-activity-action');
  if (activityBtn) {
    activityBtn.addEventListener('click', function() {
      showToast('Activity cleared', 'info');
    });
  }

  // Chat search toggle
  var chatSearchBtn = document.getElementById('btn-chat-search');
  var chatSearchBar = document.getElementById('message-search-bar');
  var chatSearchInput = document.getElementById('chat-search-input');
  var chatSearchClose = document.getElementById('btn-chat-search-close');
  if (chatSearchBtn && chatSearchBar && chatSearchInput && chatSearchClose) {
    // Keeps the pills in step with the state, including the resets below — the
    // two drifting apart is how a filter ends up looking active while doing
    // nothing.
    function _syncChatSearchPills() {
      var cur = window._chatSearchType || 'all';
      var bar = document.getElementById('chat-search-filters');
      if (!bar) return;
      Array.prototype.forEach.call(bar.querySelectorAll('.chat-search-filter'), function(b) {
        b.classList.toggle('active', (b.getAttribute('data-ctype') || 'all') === cur);
      });
    }
    function _resetChatSearch() {
      chatSearchFilter = '';
      chatSearchInput.value = '';
      window._chatSearchType = 'all';
      _syncChatSearchPills();
    }

    chatSearchBtn.addEventListener('click', function() {
      var opening = chatSearchBar.style.display === 'none';
      chatSearchBar.style.display = opening ? '' : 'none';
      if (opening) {
        _resetChatSearch();
        chatSearchInput.focus();
      } else {
        _resetChatSearch();
        if (activeChatId) renderMessages(activeChatId);
      }
    });

    chatSearchInput.addEventListener('input', function() {
      chatSearchFilter = this.value;
      if (activeChatId) renderMessages(activeChatId);
    });

    chatSearchClose.addEventListener('click', function() {
      chatSearchBar.style.display = 'none';
      _resetChatSearch();
      if (activeChatId) renderMessages(activeChatId);
    });

    // Type filters. Scoped to the open conversation, same as the text.
    var filterBar = document.getElementById('chat-search-filters');
    if (filterBar) {
      filterBar.addEventListener('click', function(e) {
        var b = e.target.closest ? e.target.closest('.chat-search-filter') : null;
        if (!b) return;
        window._chatSearchType = b.getAttribute('data-ctype') || 'all';
        _syncChatSearchPills();
        if (activeChatId) renderMessages(activeChatId);
      });
    }
  }

  // --- Add Three Dots Menu ---
  /** Resolve who to call for the currently open chat, then place the call. */
  function _startCallFromChat(isVideo) {
    if (!window.OrbitCall) { showToast('Calling is unavailable', 'error'); return; }
    // For a DM the active chat id is the peer's user id, but chats created from
    // the friends list use 'dm_' + peerId.
    var peerId = (activeChatId && activeChatId.indexOf('dm_') === 0)
      ? activeChatId.substring(3)
      : activeChatId;
    var friend = MStore.friends.find(function(f) { return f.id === peerId || f.peerId === peerId; });
    if (friend) peerId = friend.id;
    if (!peerId) { showToast('Cannot tell who to call', 'error'); return; }
    window.OrbitCall.startCall(!!isVideo, peerId);
  }

  var moreBtn = document.getElementById('btn-chat-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', function() {
      if (!activeChatId && window.activeChatId) activeChatId = window.activeChatId;
      if (!activeChatId) return;
      var isGroup = !!MStore.groups.find(function(g) { return g.id === activeChatId; });
      var html = '<div class="action-sheet-overlay" id="chat-more-action-sheet" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;flex-direction:column;justify-content:flex-end;">' +
        '<div class="action-sheet-content" style="background:var(--bg-surface);border-radius:24px 24px 0 0;padding:24px 16px;animation:slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);">' +
          '<div class="bottom-sheet-handle" style="width:40px;height:5px;background:var(--border-subtle);border-radius:4px;margin:0 auto 24px;"></div>' +
          '<div class="action-btn" id="action-view-info" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="' + (isGroup ? 'users' : 'user') + '"></i> ' + (isGroup ? 'Group Info' : 'View Profile') +
          '</div>' +
          (isGroup ? '' :
          '<div class="action-btn" id="action-voice-call" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="phone"></i> Voice Call' +
          '</div>' +
          '<div class="action-btn" id="action-video-call" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="video"></i> Video Call' +
          '</div>') +
          '<div class="action-btn" id="action-mute" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="bell-off"></i> Mute Notifications' +
          '</div>' +
          '<div class="action-btn" id="action-disappear" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="clock"></i> Disappearing Messages' +
          '</div>' +
          '<div class="action-btn" id="action-wallpaper" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="image"></i> Wallpaper' +
          '</div>' +
          '<div class="action-btn" id="action-clear-chat" style="padding:16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:600;color:var(--accent-danger);cursor:pointer;border-radius:12px;transition:background 0.2s;">' +
            '<i data-lucide="trash-2"></i> Clear Chat' +
          '</div>' +
        '</div>' +
      '</div>';
      
      var div = document.createElement('div');
      div.innerHTML = html;
      var sheet = div.firstChild;
      document.body.appendChild(sheet);
      if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
        OrbitSheet.enableDragClose({ sheet: sheet.firstElementChild, onClose: function () { sheet.remove(); } });
      }
      renderLucide({ root: sheet });

      sheet.addEventListener('click', function(e) {
        if (e.target === sheet) sheet.remove();
      });
      
      document.getElementById('action-view-info').addEventListener('click', function() {
        sheet.remove();
        if (isGroup) showGroupInfo();
        else showProfileOverlay(activeChatId);
      });

      var _voiceCallBtn = document.getElementById('action-voice-call');
      if (_voiceCallBtn) _voiceCallBtn.addEventListener('click', function() {
        sheet.remove();
        _startCallFromChat(false);
      });

      var _videoCallBtn = document.getElementById('action-video-call');
      if (_videoCallBtn) _videoCallBtn.addEventListener('click', function() {
        sheet.remove();
        _startCallFromChat(true);
      });
      
      document.getElementById('action-mute').addEventListener('click', function() {
        sheet.remove();
        showToast('Notifications muted', 'success');
      });
      
      document.getElementById('action-disappear').addEventListener('click', function() {
        sheet.remove();
        // Show disappear timer picker
        var currentVal = _getDisappearTimer(activeChatId);
        var timerOptions = [
          { v: 'off', l: 'Off' },
          { v: '5s', l: '5 seconds' },
          { v: '30s', l: '30 seconds' },
          { v: '1m', l: '1 minute' },
          { v: '5m', l: '5 minutes' },
          { v: '1h', l: '1 hour' },
          { v: '24h', l: '24 hours' }
        ];
        var timerSheetHtml = '<div class="action-sheet-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;flex-direction:column;justify-content:flex-end;">' +
          '<div class="action-sheet-content" style="background:var(--bg-surface);border-radius:24px 24px 0 0;padding:24px 16px;animation:slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);">' +
            '<div class="bottom-sheet-handle" style="width:40px;height:5px;background:var(--border-subtle);border-radius:4px;margin:0 auto 24px;"></div>' +
            '<div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:16px;text-align:center;">Disappearing Messages</div>' +
            timerOptions.map(function(o) {
              return '<div class="action-btn timer-option" data-value="' + o.v + '" style="padding:14px 16px;display:flex;align-items:center;gap:14px;font-size:16px;font-weight:500;color:var(--text-primary);cursor:pointer;border-radius:12px;transition:background 0.2s;' + (o.v === currentVal ? 'background:var(--accent-soft);color:var(--accent-primary);' : '') + '">' +
                '<i data-lucide="' + (o.v === 'off' ? 'x-circle' : 'clock') + '" style="width:18px;height:18px;flex-shrink:0;"></i> ' + o.l +
                (o.v === currentVal ? ' <span style="margin-left:auto;font-size:13px;opacity:0.7;">✓</span>' : '') +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>';
        var timerDiv = document.createElement('div');
        timerDiv.innerHTML = timerSheetHtml;
        var timerSheet = timerDiv.firstChild;
        document.body.appendChild(timerSheet);
        if (window.OrbitSheet && typeof window.OrbitSheet.enableDragClose === 'function') {
          OrbitSheet.enableDragClose({ sheet: timerSheet.firstElementChild, onClose: function () { timerSheet.remove(); } });
        }
        renderLucide({ root: timerSheet });
        timerSheet.addEventListener('click', function(te) {
          if (te.target === timerSheet) timerSheet.remove();
        });
        timerSheet.querySelectorAll('.timer-option').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var val = this.getAttribute('data-value');
            _setDisappearTimer(activeChatId, val);
            timerSheet.remove();
            showToast('Disappearing messages: ' + val, 'info');
          });
        });
      });
      
      document.getElementById('action-wallpaper').addEventListener('click', function() {
        sheet.remove();
        showChatWallpaperPicker();
      });
      
      document.getElementById('action-clear-chat').addEventListener('click', function() {
        sheet.remove();
        // Custom simple modal or confirm
        if (confirm('Are you sure you want to clear this chat?')) {
          MStore.messages[activeChatId] = [];
          MStore._saveMsgs(activeChatId);
          MStore.save();
          renderMessages(activeChatId);
          renderChatList();
          showToast('Chat cleared', 'info');
        }
      });
    });
  }

  // Friends buttons
  document.getElementById('btn-add-friend').addEventListener('click', showAddFriendModal);
  // The scanner is one screen used for two jobs: pairing a desktop (which will
  // carry an account across) and adding a contact from a code. The copy differs,
  // so the caller sets it before opening.
  function setScanCopy(mode) {
    var isDesktop = mode === 'desktop';
    var t = document.querySelector('.qr-scan-title');
    var h = document.querySelector('.qr-scan-head');
    var l = document.querySelector('.qr-scan-lead');
    var p = document.querySelector('.qr-scan-path');
    var alt = document.getElementById('btn-qr-show-mine');
    if (t) t.textContent = isDesktop ? 'Link a desktop' : 'Scan a code';
    if (h) h.textContent = isDesktop ? 'Point at the code on your computer'
                                     : 'Point at their Orbit code';
    if (l) {
      l.textContent = isDesktop
        ? 'Both devices need to be on the same Wi-Fi. Your messages and contacts move directly between them — nothing is uploaded anywhere.'
        : 'Scanning adds them as a contact and opens a direct connection, so it works even when the network blocks discovery.';
    }
    if (p) p.style.display = isDesktop ? '' : 'none';
    if (alt) alt.style.display = isDesktop ? '' : 'none';
  }
  window.openScanner = function(mode) { setScanCopy(mode); startQRScanner(); };

  var scanBtn = document.getElementById('btn-scan-qr');
  if (scanBtn) scanBtn.addEventListener('click', function() { setScanCopy(null); startQRScanner(); });
  var closeScannerBtn = document.getElementById('btn-close-scanner');
  // Wrapped, not passed directly: stopQRScanner now takes a flag, and passing it
  // straight in would hand it the click EVENT, which is truthy and would leave
  // the screen up forever.
  if (closeScannerBtn) closeScannerBtn.addEventListener('click', function() { stopQRScanner(); });

  // "Show my code instead" — the other half of pairing. Close the camera and open
  // the Add Friend modal on its QR tab, which already renders the payload.
  var showMineBtn = document.getElementById('btn-qr-show-mine');
  if (showMineBtn) {
    showMineBtn.addEventListener('click', function() {
      stopQRScanner();
      if (typeof showAddFriendModal === 'function') {
        showAddFriendModal();
        setTimeout(function() {
          var tab = document.querySelector('.modal-tab[data-tab="qr"]');
          if (tab) tab.click();
        }, 60);
      }
    });
  }

  // Gallery button
  var btnGallery = document.getElementById('btn-gallery');
  if (btnGallery) btnGallery.addEventListener('click', showGallery);

  // Close gallery
  var btnCloseGallery = document.getElementById('btn-close-gallery');
  if (btnCloseGallery) btnCloseGallery.addEventListener('click', hideGallery);

  // Close thread panel
  var btnCloseThread = document.getElementById('btn-close-thread');
  if (btnCloseThread) btnCloseThread.addEventListener('click', closeThreadPanel);

  // Close profile
  document.getElementById('btn-close-profile').addEventListener('click', hideProfile);

  // Settings overlay
  document.getElementById('btn-close-settings').addEventListener('click', hideSettingsOverlay);
  document.getElementById('btn-settings-back').addEventListener('click', backSettingsOverview);
  document.getElementById('settings-overlay-backdrop').addEventListener('click', hideSettingsOverlay);

  // Group members
  document.getElementById('btn-close-members').addEventListener('click', hideGroupInfo);
  document.getElementById('btn-close-image-preview').addEventListener('click', function() {
    document.getElementById('image-preview-overlay').classList.remove('open');
  });
  document.getElementById('image-preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('open');
  });
  // The viewer's own controls: prev/next, zoom, download, and pinch.
  _bindImageViewer();

  // ── Sharing in from another app ────────────────────────────────────────────
  // Checked on load (a share that started the app) and on every return (a share
  // that arrived while Orbit was already open — singleTask means it came through
  // onNewIntent, and the app may have been sitting in the background).
  setTimeout(checkPendingShare, 1200);
  setTimeout(checkPendingReplies, 1500);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    setTimeout(checkPendingShare, 400);
    setTimeout(checkPendingReplies, 500);
  });

  // ── App lock: when to ask ──────────────────────────────────────────────────
  // Lock on launch always, so a cold start is never open. Lock when backgrounded
  // only if asked, because switching apps to copy something and coming back is
  // not the same as handing the phone to someone.
  (function () {
    var AL = window.OrbitAppLock;
    if (!AL) return;
    if (AL.isEnabled(MStore.settings)) setTimeout(function () { lockApp(); }, 300);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (!_appLockOn()) return;
      var cfg = MStore.settings.appLock || {};
      if (cfg.lockOnBackground === false) return;
      lockApp();
    });
  })();
  document.getElementById('btn-close-video-preview').addEventListener('click', function() {
    var player = document.getElementById('video-preview-player');
    player.pause();
    player.removeAttribute('src');
    document.getElementById('video-preview-overlay').classList.remove('open');
  });
  document.getElementById('video-preview-overlay').addEventListener('click', function(e) {
    if (e.target === this) {
      var player = document.getElementById('video-preview-player');
      player.pause();
      player.removeAttribute('src');
      this.classList.remove('open');
    }
  });
  document.getElementById('members-overlay-backdrop').addEventListener('click', hideGroupInfo);
  document.getElementById('members-content').addEventListener('click', function(e) {
    var target = e.target;

    // Avatar upload
    if (target.id === 'btn-group-info-avatar') {
      var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!group) return;
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = function(ev) {
        var file = ev.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev2) {
          MStore.compressImage(ev2.target.result, 400, 400, 0.8, function(compressedUrl) {
            var dataUrl = compressedUrl;
            group.avatar = dataUrl;
            MStore.save();
            var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
            if (chat) chat.avatar = dataUrl;
            renderGroupInfo();
            renderChatList();
            showToast('Group avatar updated', 'info');
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    // Group name change
    if (target.id === 'group-info-name' || target.id === 'group-info-desc') {
      return; // handled by change events
    }

    // Copy invite code
    if (target.id === 'btn-group-copy-invite') {
      var g = MStore.groups.find(function(gr) { return gr.id === activeChatId; });
      if (g && g.inviteCode) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(g.inviteCode);
        }
        showToast('Invite code copied', 'info');
      }
      return;
    }

    // Share invite via system share sheet
    if (target.id === 'btn-group-share-invite') {
      var sg = MStore.groups.find(function(gr) { return gr.id === activeChatId; });
      if (sg) {
        if (!sg.inviteCode) {
          var codeBytes = new Uint8Array(4);
          window.crypto.getRandomValues(codeBytes);
          sg.inviteCode = Array.from(codeBytes).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
          MStore.save();
        }
        var inviteText = 'Join "' + sg.name + '" on Orbit! Code: ' + sg.inviteCode;
        try {
          if (navigator.share) {
            var canShareOk = true;
            try { if (navigator.canShare && !navigator.canShare({ text: inviteText })) canShareOk = false; } catch(e) { canShareOk = true; }
            if (canShareOk) {
              navigator.share({ title: 'Orbit invite', text: inviteText }).then(function(){ showToast('Shared!', 'info'); }).catch(function(err){
                if (err && err.name === 'AbortError') return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(inviteText).then(function(){ showToast('Invite text copied - share it anywhere', 'info'); }).catch(function(){
                    var ta2 = document.createElement('textarea'); ta2.value = inviteText; document.body.appendChild(ta2); ta2.select(); document.execCommand('copy'); ta2.remove(); showToast('Invite text copied - share it anywhere', 'info');
                  });
                } else {
                  var ta2 = document.createElement('textarea'); ta2.value = inviteText; document.body.appendChild(ta2); ta2.select(); document.execCommand('copy'); ta2.remove(); showToast('Invite text copied - share it anywhere', 'info');
                }
              });
              return;
            }
          }
        } catch(e) {}
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(inviteText).then(function(){ showToast('Invite text copied - share it anywhere', 'info'); }).catch(function(){
              var ta = document.createElement('textarea'); ta.value = inviteText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('Invite text copied - share it anywhere', 'info');
            });
          } else {
            var ta = document.createElement('textarea'); ta.value = inviteText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); showToast('Invite text copied - share it anywhere', 'info');
          }
        } catch(e) { showToast('Copy failed', 'error'); }
      }
      return;
    }

    // Add member
    if (target.id === 'btn-group-add-member' || target.closest('#btn-group-add-member')) {
      hideGroupInfo();
      var friendNames = MStore.friends.map(function(f) { return f.name; });
      if (friendNames.length === 0) {
        showToast('No friends to add', 'info');
        return;
      }
      var name = prompt('Enter friend name to add:\n' + friendNames.join(', '));
      if (!name || !name.trim()) return;
      var friend = MStore.friends.find(function(f) { return f.name.toLowerCase() === name.trim().toLowerCase(); });
      if (!friend) {
        showToast('Friend not found', 'info');
        return;
      }
      var grp = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (grp) {
        if (!grp.members) grp.members = [];
        var exists = grp.members.some(function(m) { return (typeof m === 'string' ? m : m.userId) === friend.id; });
        if (!exists) {
          grp.members.push({ userId: friend.id, role: 'member', joinedAt: new Date().toISOString(), name: friend.name, avatar: friend.avatar || null });
          MStore.save();
          // Send group data to the new member
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var enrichedMembers = (grp.members || []).map(function(m) {
              var origin = typeof m === 'string' ? { userId: m } : m;
              var uid = origin.userId;
              var mf = MStore.friends.find(function(f) { return f.id === uid; });
              if (mf) {
                return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
              }
              return { ...origin };
            });
            var invitePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_CREATE, MStore.user ? MStore.user.id : '', friend.id, {
              groupId: activeChatId,
              groupName: grp.name,
              groupAvatar: grp.avatar || null,
              ownerId: grp.ownerId,
              members: enrichedMembers,
              inviteCode: grp.inviteCode,
              description: grp.description || '',
              publicKey: MStore.user ? MStore.user.publicKey || null : null
            });
            Orbit.P2P.send(friend.id, invitePkt);
          }
          // Notify existing members about the new member
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            (grp.members || []).forEach(function(m) {
              var mid = typeof m === 'string' ? m : m.userId;
              if (mid !== friend.id && mid !== (MStore.user ? MStore.user.id : '')) {
                var memberAddPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_MEMBER_ADDED, MStore.user ? MStore.user.id : '', mid, {
                  groupId: activeChatId,
                  user: { userId: friend.id, name: friend.name, username: friend.name, usertag: friend.tag || '', avatar: friend.avatar || null, status: 'online', role: 'member', joinedAt: new Date().toISOString(), publicKey: friend.publicKey || null }
                });
                Orbit.P2P.send(mid, memberAddPkt);
              }
            });
          }
          showToast(friend.name + ' added to group', 'info');
          renderGroupInfo();
          var headerInfo = document.getElementById('chat-header-info');
          var statusDiv = headerInfo.querySelector('div:last-child');
          if (statusDiv) statusDiv.textContent = grp.members.length + ' members';
        } else {
          showToast(friend.name + ' is already in group', 'info');
        }
      }
      return;
    }

    // Remove member
    if (target.classList.contains('group-member-remove')) {
      var removeUserId = target.getAttribute('data-user-id');
      var grp2 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp2 || !removeUserId) return;
      if (confirm('Remove this member from the group?')) {
        grp2.members = (grp2.members || []).filter(function(m) {
          return (typeof m === 'string' ? m : m.userId) !== removeUserId;
        });
        // Notify remaining members about the removal
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          (grp2.members || []).forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== (MStore.user ? MStore.user.id : '')) {
              var leavePkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.GROUP_LEAVE, MStore.user ? MStore.user.id : '', mid, {
                groupId: activeChatId, userId: removeUserId
              });
              Orbit.P2P.send(mid, leavePkt);
            }
          });
        }
        MStore.save();
        renderGroupInfo();
        var headerInfo = document.getElementById('chat-header-info');
        var statusDiv = headerInfo.querySelector('div:last-child');
        if (statusDiv) statusDiv.textContent = grp2.members.length + ' members';
        showToast('Member removed', 'info');
      }
      return;
    }

    // Promote to admin
    if (target.classList.contains('group-member-promote')) {
      var promoteUserId = target.getAttribute('data-user-id');
      var grp3 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp3 || !promoteUserId) return;
      grp3.members = (grp3.members || []).map(function(m) {
        if ((typeof m === 'string' ? m : m.userId) === promoteUserId) {
          return typeof m === 'string' ? { userId: m, role: 'admin', joinedAt: new Date().toISOString() } : { ...m, role: 'admin' };
        }
        return m;
      });
      MStore.save();
      renderGroupInfo();
      showToast('Member promoted to Admin', 'info');
      return;
    }

    // Demote to member
    if (target.classList.contains('group-member-demote')) {
      var demoteUserId = target.getAttribute('data-user-id');
      var grp4 = MStore.groups.find(function(g) { return g.id === activeChatId; });
      if (!grp4 || !demoteUserId) return;
      grp4.members = (grp4.members || []).map(function(m) {
        if ((typeof m === 'string' ? m : m.userId) === demoteUserId) {
          return typeof m === 'string' ? { userId: m, role: 'member', joinedAt: new Date().toISOString() } : { ...m, role: 'member' };
        }
        return m;
      });
      MStore.save();
      renderGroupInfo();
      showToast('Admin demoted to Member', 'info');
      return;
    }

    // Leave group
    if (target.id === 'btn-group-leave') {
      if (confirm('Leave this group?')) {
        leaveGroupById(activeChatId);
      }
      return;
    }

    // Delete group (owner only)
    if (target.id === 'btn-group-delete') {
      if (confirm('Delete this group permanently? This cannot be undone.')) {
        deleteGroupById(activeChatId);
      }
      return;
    }
  });

  // Group name/description change events (delegated)
  document.getElementById('members-content').addEventListener('change', function(e) {
    var target = e.target;
    var group = MStore.groups.find(function(g) { return g.id === activeChatId; });
    if (!group) return;

    if (target.id === 'group-info-name') {
      group.name = target.value;
      MStore.save();
      var chat = MStore.chats.find(function(c) { return c.id === activeChatId; });
      if (chat) chat.name = target.value;
      renderChatList();
      var headerInfo = document.getElementById('chat-header-info');
      if (headerInfo) {
        var nameDiv = headerInfo.querySelector('div:first-child');
        if (nameDiv) nameDiv.textContent = target.value;
      }
    }

    if (target.id === 'group-info-desc') {
      group.description = target.value;
      MStore.save();
    }

    if (target.id === 'group-info-pin') {
      group.pinned = target.checked;
      MStore.save();
    }

    if (target.id === 'group-info-mute') {
      group.notificationMuted = target.checked;
      MStore.save();
    }

    if (target.id === 'group-info-disappear') {
      group.disappearTimer = target.value;
      MStore.save();
      showToast('Disappearing messages: ' + target.value, 'info');
    }

    // Unpin from pinned messages section
    if (target.classList.contains('group-info-pinned-remove')) {
      var pinMsgId = target.getAttribute('data-pin-msg-id');
      if (pinMsgId && group.pinnedMessages) {
        group.pinnedMessages = group.pinnedMessages.filter(function(p) { return String(p.msgId) !== String(pinMsgId); });
        MStore.save();
        renderGroupInfo();
        if (activeChatId) renderMessages(activeChatId);
        // Broadcast UNPIN_MESSAGE
        var _myId = MStore.user ? MStore.user.id : '';
        if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
          (group.members || []).forEach(function(m) {
            var mid = typeof m === 'string' ? m : m.userId;
            if (mid !== _myId && mid !== '') {
              var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.UNPIN_MESSAGE, _myId, mid, { msgId: pinMsgId, groupId: activeChatId });
              Orbit.P2P.send(mid, pkt);
            }
          });
        }
      }
    }

    // Click pinned message item to scroll to message
    if (target.closest('.group-info-pinned-item')) {
      var pinItem = target.closest('.group-info-pinned-item');
      var scrollMsgId = pinItem.getAttribute('data-msg-id');
      if (scrollMsgId && !target.classList.contains('group-info-pinned-remove')) {
        hideGroupInfo();
        openChat(activeChatId);
        setTimeout(function() {
          var el = document.querySelector('.message-row[data-msg-id="' + scrollMsgId.replace(/"/g, '') + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      return;
    }
  });

  // Overlay backdrops
  document.getElementById('profile-overlay-backdrop').addEventListener('click', hideProfile);
  document.getElementById('gallery-overlay-backdrop').addEventListener('click', hideGallery);
  var _threadBackdrop = document.getElementById('thread-overlay-backdrop');
  if (_threadBackdrop) _threadBackdrop.addEventListener('click', closeThreadPanel);

  // Emoji picker
  document.getElementById('btn-emoji').addEventListener('click', function(e) {
    e.stopPropagation();
    toggleEmojiPicker();
  });

  // Close emoji picker on outside click
  document.addEventListener('click', function(e) {
    if (emojiPickerOpen) {
      var container = document.getElementById('emoji-picker-container');
      if (container && !container.contains(e.target) && !e.target.closest('#btn-emoji')) {
        closeEmojiPicker();
      }
    }
  });

  // File input.
  //
  // ⚠ THIS GUARD USED TO READ `if (fileInput && dropupMenu)`. Removing the dropup
  // markup made `dropupMenu` null, which would have skipped this whole block —
  // including `fileInput.addEventListener('change', handleFileInput)` — so every
  // attachment would have stopped staging, with no error anywhere. The "+" would
  // still have opened the sheet and the picker would still have run; the file
  // simply would never have arrived. A guard on a thing that no longer exists is
  // the same silent-failure shape as a CSS rule against a class nothing has.
  var fileInput = document.getElementById('file-input');

  if (fileInput) {
    // Copy my own user ID from the profile pill. The ID's whole purpose is to be handed to
    // someone else, and on mobile there was no way to get it out at all.
    var btnPillCopy = document.getElementById('btn-pill-copy-id');
    if (btnPillCopy) {
      btnPillCopy.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = (MStore.user && (MStore.user.id || MStore.user.userId)) || '';
        if (!id) return;
        var done = function () { showToast('User ID copied', 'info'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(id).then(done).catch(function () { showToast('Could not copy', 'error'); });
        } else {
          showToast('Could not copy', 'error');
        }
      });
    }

    var btnPlus = document.getElementById('btn-plus');
    if (btnPlus) {
      btnPlus.addEventListener('click', function(e) {
        e.stopPropagation();
        // ⚠ ONE DOOR, NOT FIVE. This used to toggle a dropup list whose first two
        // entries were "Upload Images" and "Upload Videos" — the same intent split
        // by file type, decided before the user had seen anything. The sheet that
        // replaced it opens the picker, and the picker decides. See
        // js/components/attach-sheet.js for why the media grid is a chooser rather
        // than an in-app camera roll.
        if (window.OrbitAttach) window.OrbitAttach.open('photos');
      });
    }

    fileInput.addEventListener('change', handleFileInput);
  }

  // Voice recording — Mic button
  var btnVoice = document.getElementById('btn-voice');
  if (btnVoice) {
    // Check MediaRecorder support
    var voiceSupported = typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!voiceSupported) {
      btnVoice.style.opacity = '0.3';
      btnVoice.title = 'Voice recording not supported';
    }

    // Start recording on press
    btnVoice.addEventListener('mousedown', function(e) {
      // Ghost mouse event after a touch — the mic would start twice.
      if (_isGhostMouse()) return;
      e.preventDefault();
      if (!voiceSupported) { showToast('Voice recording not supported in this browser', 'warning'); return; }
      startVoiceRecording();
    });
    btnVoice.addEventListener('touchstart', function(e) {
      if (!voiceSupported) { showToast('Voice recording not supported in this browser', 'warning'); return; }
      startVoiceRecording();
    }, { passive: true });

    // Stop recording on release (anywhere on the page)
    document.addEventListener('mouseup', function() {
      if (_isGhostMouse()) return;
      if (_voiceRecorder.isRecording) stopVoiceRecording(false);
    });
    document.addEventListener('touchend', function() {
      if (_voiceRecorder.isRecording) stopVoiceRecording(false);
    }, { passive: true });
  }

  // Cancel voice recording button
  var btnCancelVoice = document.getElementById('btn-cancel-voice');
  if (btnCancelVoice) {
    btnCancelVoice.addEventListener('click', function() {
      stopVoiceRecording(true);
      showToast('Recording cancelled', 'info');
    });
  }

  // Privacy badge (just visual, no action needed)
  document.getElementById('btn-privacy-badge').addEventListener('click', function() {
    showToast('Privacy mode is on', 'info');
  });

  // Profile button in settings header
  document.getElementById('btn-profile').addEventListener('click', showProfile);

  // Notifications header button — open activity panel
  var _elbtn_notifications = document.getElementById('btn-notifications-header');
  if (_elbtn_notifications) {
    _elbtn_notifications.addEventListener('click', function() {
      switchPanel('panel-activity');
      setTimeout(function() {
        if (typeof renderActivity === 'function') renderActivity();
      }, 200);
      var notifBadge = document.getElementById('notif-badge');
      if (notifBadge) notifBadge.style.display = 'none';
      var pill = document.getElementById('profile-pill');
      if (pill) { pill.style.opacity = '0'; pill.style.pointerEvents = 'none'; }
    });
  }

  // Activity panel back button — close activity panel
  var _elbtn_activity_back = document.getElementById('btn-activity-back');
  if (_elbtn_activity_back) {
    _elbtn_activity_back.addEventListener('click', function() {
      switchPanel('panel-chats');
      var pill = document.getElementById('profile-pill');
      if (pill) { pill.style.opacity = ''; pill.style.pointerEvents = ''; }
    });
  }

  // Profile pill settings gear button
  var _elbtn_pill_settings = document.getElementById('btn-pill-settings');
  if (_elbtn_pill_settings) {
    _elbtn_pill_settings.addEventListener('click', function(e) {
      e.stopPropagation();
      if (typeof showSettingsOverlay === 'function') {
        showSettingsOverlay();
      }
    });
  }

  // The "New chat" button (#btn-new-chat) never existed in the HTML — the
  // wire resolved to null, so the if-guard swallowed it. The handler would
  // have shown a toast and navigated to the Friends tab, but no element
  // triggers it. Removed to avoid a future edit "fixing" the dead wire by
  // adding the element and getting an unexpected toast + navigation.

  // Modal buttons
  document.getElementById('btn-close-modal').addEventListener('click', function() {
    if (_groupCreateMode) _finishGroupCreate(); else hideModal();
  });
  document.getElementById('btn-modal-cancel').addEventListener('click', function() {
    if (_groupCreateMode) _finishGroupCreate(); else hideModal();
  });
  document.getElementById('modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) {
      if (_groupCreateMode) _finishGroupCreate(); else hideModal();
    }
  });
  document.getElementById('modal-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (_groupCreateMode) {
        document.getElementById('btn-modal-confirm').click();
      } else {
        confirmAddFriend();
      }
    }
  });
  document.getElementById('btn-modal-confirm').onclick = confirmAddFriend;

  // Modal tab switching
  document.querySelectorAll('.modal-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.modal-tab-content').forEach(function(c) { c.style.display = 'none'; });
      var target = document.getElementById('modal-tab-' + tab.dataset.tab);
      if (target) target.style.display = 'block';

      // Generate QR code when switching to QR tab
      if (tab.dataset.tab === 'qr') {
        var qrContainer = document.getElementById('modal-qr-code');
        if (qrContainer && !qrContainer.hasChildNodes() && typeof QRCode !== 'undefined') {
          var user = MStore.user;
          if (user) {
            (function paintModalQR() {
              function paint(qrData) {
                try {
                  var qr = QRCode(0, 'M');
                  qr.addData(qrData);
                  qr.make();
                  qrContainer.innerHTML = qr.createImgTag(3, 0);
                  var img = qrContainer.querySelector('img');
                  if (img) img.style.display = 'block';
                } catch(e) {
                  qrContainer.innerHTML = '<span style="color:var(--text-muted);font-size:11px;">Error</span>';
                }
              }

              function paintV1() {
                paint(JSON.stringify({ v: 1, id: user.id, n: user.name, t: user.tag }));
              }

              if (!window.Orbit || !Orbit.QRPairing) { paintV1(); return; }

              Orbit.QRPairing.listLocalIPv4().then(function(ips) {
                var payload = Orbit.QRPairing.buildPayload(user, {
                  ips: ips,
                  port: Orbit.QRPairing.DEFAULT_PORT,
                  publicKey: user.publicKey || null
                });
                if (payload) paint(payload); else paintV1();
              }).catch(paintV1);
            })();
          }
        }
      }
    });
  });

  // Cancel reply/edit bar (delegated since button is dynamic)
  document.addEventListener('click', function(e) {
    if (e.target.closest('#btn-cancel-edit-reply')) {
      cancelReplyEdit();
    }
  });

  // Nav activity tab: render activity when shown
  var _elnav_activity = document.querySelector('.nav-btn[data-view="activity"]');
  if (_elnav_activity) {
    _elnav_activity.addEventListener('click', function() {
      // Defer render so panel is visible
      setTimeout(renderActivity, 50);
    });
  }

  // Friends tab: click to start chat
  document.addEventListener('click', function(e) {
    // Don't open chat if context menu is showing
    if (document.getElementById('friend-context-overlay')) return;
    var friendRow = e.target.closest('.friend-row');
    if (friendRow) {
      var fid = friendRow.getAttribute('data-friend');
      // Ensure a chat exists for this friend
      var existing = MStore.chats.find(function(c) { return c.id === fid; });
      if (!existing) {
        var friend = MStore.friends.find(function(f) { return f.id === fid; });
        if (friend) {
          MStore.chats.push({ id: fid, name: friend.name, lastMessage: '', lastTime: '', unread: 0 });
          MStore.save();
          renderChatList();
        }
      }
      // Switch to chats tab
      document.querySelector('.nav-btn[data-view="chats"]').click();
      openChat(fid);
    }
  });

  /* -- Long-press context menu for friend rows -- */
  // NOTE: legacy functions below (showFriendContextMenu / showMessageContextMenu / showChatContextMenu)
  // are superseded by the [data-user-id] delegated handler + showUserActionsSheet above/below.
  // Kept only as reference — the close-DM / block logic is ported into showUserActionsSheet.
  var _lpTimer = null;
  var _lpTarget = null;

  function showFriendContextMenu(friend, touchX, touchY) {
    hideFriendContextMenu();
    var backdrop = document.createElement('div');
    backdrop.id = 'friend-context-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', hideFriendContextMenu);
    backdrop.addEventListener('touchmove', function(e) { if (e.cancelable) e.preventDefault(); }, { passive: false });

    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100000;background:var(--bg-surface);border-radius:16px 16px 0 0;padding:16px 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    menu.addEventListener('click', function(e) { e.stopPropagation(); });

    var header = document.createElement('div');
    header.style.cssText = 'padding:0 16px 12px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
    header.innerHTML = '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(friend.name) + '</div><div style="font-size:12px;color:var(--text-muted);">' + (friend.status || 'offline') + '</div>';
    menu.appendChild(header);

    function addMenuItem(label, icon, onClick) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--text-primary);font-size:15px;cursor:pointer;';
      item.addEventListener('click', function(e) { e.stopPropagation(); onClick(); hideFriendContextMenu(); });
      item.innerHTML = '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--text-muted);flex-shrink:0;"></i><span>' + label + '</span>';
      menu.appendChild(item);
    }

    var isMuted = MStore.settings.mutedChats && MStore.settings.mutedChats[friend.id];
    addMenuItem(isMuted ? 'Unmute Notifications' : 'Mute Notifications', isMuted ? 'bell' : 'bell-off', function() {
      if (!MStore.settings.mutedChats) MStore.settings.mutedChats = {};
      if (MStore.settings.mutedChats[friend.id]) {
        delete MStore.settings.mutedChats[friend.id];
      } else {
        MStore.settings.mutedChats[friend.id] = true;
      }
      MStore.save();
      showToast(isMuted ? 'Unmuted' : 'Muted', 'info');
    });

    addMenuItem('View Profile', 'user', function() {
      showToast(friend.name + ' — ' + (friend.status || 'offline'), 'info');
    });

    addMenuItem('Close DM', 'x', function() {
      MStore.chats = MStore.chats.filter(function(c) { return c.id !== friend.id; });
      delete MStore.messages[friend.id];
      OrbitKeys.remove('msg_' + friend.id);
      MStore.friends = MStore.friends.filter(function(f) { return f.id !== friend.id; });
      MStore.save();
      if (activeChatId === friend.id) closeChat();
      renderChatList();
      renderFriends();
      showToast(friend.name + ' — DM closed', 'info');
    });

    var isBlocked = MStore.blockedUsers && MStore.blockedUsers.indexOf(friend.id) !== -1;
    addMenuItem(isBlocked ? 'Unblock User' : 'Block User', isBlocked ? 'user-check' : 'ban', function() {
      if (isBlocked) {
        MStore.blockedUsers = MStore.blockedUsers.filter(function(id) { return id !== friend.id; });
        showToast(friend.name + ' unblocked', 'info');
      } else {
        MStore.blockedUsers = MStore.blockedUsers.concat([friend.id]);
        showToast(friend.name + ' blocked', 'info');
      }
      MStore.save();
    });

    var cancel = document.createElement('div');
    cancel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:14px 16px;margin-top:4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:15px;cursor:pointer;';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function(e) { e.stopPropagation(); hideFriendContextMenu(); });
    menu.appendChild(cancel);

    backdrop.appendChild(menu);
    document.body.appendChild(backdrop);
    renderLucide({ root: menu });
  }

  function hideFriendContextMenu() {
    var el = document.getElementById('friend-context-overlay');
    if (el) el.remove();
  }

  function hideOverlay(id) {
    var el = document.getElementById(id);
    if (el) { el.remove(); return true; }
    return false;
  }

  function showMessageContextMenu_handler(action, msgId, chatId) {
    switch(action) {
      case 'copy':
        var msgs = MStore.getMessages(chatId);
        var theMsg = msgs.find(function(m) { return String(m.id) === String(msgId); });
        if (theMsg && theMsg.text) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(theMsg.text).then(function() {
              if (window.showToast) showToast('Copied to clipboard', 'info');
            }).catch(function() {});
          }
        }
        break;
      case 'reply':
        if (window.startReply) window.startReply(msgId);
        break;
      case 'forward':
        if (window.showForwardModal) window.showForwardModal(msgId);
        break;
      case 'thread':
        if (window.openThreadPanel) window.openThreadPanel(chatId, msgId);
        break;
      case 'translate':
        if (typeof translateMessage === 'function') translateMessage(msgId);
        break;
      case 'edit':
        if (window.startEdit) window.startEdit(msgId);
        break;
      case 'delete':
        if (typeof confirmDeleteMessage === 'function') confirmDeleteMessage(msgId);
        break;
      case 'pin': {
        // Both chat types, through the store map and the shared rules.
        //
        // This used to bail unless the chat was a group, pushed without any limit, and
        // labelled every file "(attachment)". The three fixes are the same three the
        // desktop needed, which is why the rules live in shared/utils/pinned.js.
        var _list = _pinnedFor(chatId);
        var _wasPinned = _list.some(function(p) { return String(p.msgId) === String(msgId); });
        var _isGroupChatHere = _isGroupChat(chatId);

        if (window.Orbit && Orbit.P2P && Orbit.P2P.isAvailable()) {
          var _pktType = _wasPinned ? Orbit.Protocol.Types.UNPIN_MESSAGE : Orbit.Protocol.Types.PIN_MESSAGE;
          var _send = { groupId: chatId, msgId: msgId };
          if (!_wasPinned) {
            var _src = MStore.getMessages(chatId).find(function(x) { return String(x.id) === String(msgId); });
            _send.text = window.OrbitPinned ? OrbitPinned.labelFor(_src) : (_src ? _src.text : '');
            _send.pinnedAt = new Date().toISOString();
          }
          Orbit.P2P.send(chatId, Orbit.Protocol.createPacket(_pktType, MStore.user ? MStore.user.id : 'mobile', chatId, _send));
        }

        if (_wasPinned) {
          _setPinned(chatId, _list.filter(function(p) { return String(p.msgId) !== String(msgId); }));
        } else {
          var _ms = MStore.getMessages(chatId);
          var _m = _ms.find(function(x) { return String(x.id) === String(msgId); });
          var _entry = {
            msgId: msgId,
            text: window.OrbitPinned ? OrbitPinned.labelFor(_m) : (_m ? _m.text : ''),
            pinnedBy: MStore.user ? MStore.user.id : 'mobile',
            pinnedAt: new Date().toISOString()
          };
          var _res = window.OrbitPinned
            ? OrbitPinned.add(_list, _entry, _isGroupChatHere)
            : { ok: true, list: _list.concat([_entry]) };
          if (!_res.ok) {
            showToast(_res.message || ('You can pin up to ' + (_isGroupChatHere ? 5 : 3) + ' messages here. Unpin one first.'), 'info');
            break;
          }
          _setPinned(chatId, _res.list);
        }
        if (window.activeChatId === chatId && typeof renderMessages === 'function') renderMessages(chatId);
        break;
      }
    }
  }

  function showMessageContextSheet(msgId) {
    var chatId = activeChatId;
    if (!chatId || !msgId) return;
    var ctxMsgs = MStore.getMessages(chatId);
    var msg = null;
    for (var i = 0; i < ctxMsgs.length; i++) {
      if (String(ctxMsgs[i].id) === String(msgId)) { msg = ctxMsgs[i]; break; }
    }
    if (!msg) return;

    var previewText = msg.text ? msg.text.substring(0, 80) + (msg.text.length > 80 ? '...' : '') : 'Message';

    var html = '<div class="context-msg-preview"><span class="context-msg-text">' + escapeHtml(previewText) + '</span></div>';

    html += '<div class="context-reactions">';
    var emojis = ['😀', '❤️', '👍', '😂', '😮', '😢', '😡'];
    for (var ei = 0; ei < emojis.length; ei++) {
      html += '<button class="context-reaction-btn" data-emoji="' + emojis[ei] + '" data-msg-id="' + msg.id + '">' + emojis[ei] + '</button>';
    }
    html += '<button class="context-reaction-btn more-emoji-btn" data-emoji="__picker__" data-msg-id="' + msg.id + '" title="More emojis"><i data-lucide="smile-plus" style="width:22px;height:22px;color:var(--text-muted);"></i></button>';
    html += '</div>';

    html += '<div class="context-divider"></div>';

    var actions = [
      { label: 'Copy', icon: 'copy', action: 'copy', danger: false, always: true },
      { label: 'Reply', icon: 'reply', action: 'reply', danger: false, always: true },
      { label: 'Forward', icon: 'send', action: 'forward', danger: false, always: true }
    ];

    var _hasThread = msg.replyTo != null || ctxMsgs.some(function(x) { return x.replyTo != null && String(x.replyTo) === String(msg.id); });
    if (_hasThread) {
      actions.push({ label: 'View thread', icon: 'messages-square', action: 'thread', danger: false });
    }

    if (MStore.settings && MStore.settings.messageTranslate) {
      actions.push({ label: 'Translate', icon: 'languages', action: 'translate', danger: false });
    }

    if (msg.from === 'me') {
      actions.push({ label: 'Edit', icon: 'pencil', action: 'edit', danger: false });
    }

    actions.push({ label: 'Delete', icon: 'trash-2', action: 'delete', danger: true });

    // Offered for a DM as well as a group. The pins live in MStore.pinnedMessages, which is
    // keyed by chat id and persisted by save(), so a DM can hold them too — it used to
    // require a group, which is why a DM had no Pin in this sheet at all.
    var _pinList = _pinnedFor(chatId);
    var _isPinnedNow = _pinList.some(function(p) { return String(p.msgId) === String(msg.id); });
    actions.push({ label: _isPinnedNow ? 'Unpin' : 'Pin', icon: _isPinnedNow ? 'pin-off' : 'pin', action: 'pin', danger: false });

    for (var ai = 0; ai < actions.length; ai++) {
      var a = actions[ai];
      var cls = 'context-action-item' + (a.danger ? ' danger' : '');
      html += '<button class="' + cls + '" data-action="' + a.action + '" data-msg-id="' + msg.id + '"><span>' + a.label + '</span><i data-lucide="' + a.icon + '"></i></button>';
    }

    OrbitSheet.showCustom(html);

    setTimeout(function() {
      var sheet = document.getElementById('bottom-sheet-content');
      if (!sheet) return;

      sheet.querySelectorAll('.context-reaction-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var emoji = btn.getAttribute('data-emoji');
          var mId = btn.getAttribute('data-msg-id');
          if (emoji === '__picker__') {
            OrbitSheet.hide();
            setTimeout(function() {
              var container = document.getElementById('emoji-picker-container');
              if (!container) return;
              var picker = container.querySelector('emoji-picker');
              if (!picker) return;
              window._emojiPickerReactMode = { chatId: chatId, msgId: mId };
              openEmojiPicker();
            }, 300);
            return;
          }
          OrbitSheet.hide();
          var msgs = MStore.getMessages(chatId);
          var msgItem = msgs.find(function(m) { return String(m.id) === String(mId); });
          var myId = MStore.user ? MStore.user.id : '';
          var hasReacted = msgItem && msgItem.reactions && msgItem.reactions.some(function(r) { return r.emoji === emoji && r.userId === myId; });
          var action = hasReacted ? 'remove' : 'add';
          applyReactionLocally(chatId, mId, emoji, action);
          sendReaction(chatId, mId, emoji, action);
        });
      });

      sheet.querySelectorAll('.context-action-item').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var action = btn.getAttribute('data-action');
          var mId = btn.getAttribute('data-msg-id');
          OrbitSheet.hide();
          setTimeout(function() {
            showMessageContextMenu_handler(action, mId, chatId);
          }, 200);
        });
      });

      if (window.lucide) lucide.createIcons();
    }, 50);
  }
  window.showMessageContextSheet = showMessageContextSheet;

  function showChatContextMenu(chat, x, y) {
    var backdrop = document.createElement('div');
    backdrop.id = 'chat-context-overlay';
    backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;background:rgba(0,0,0,0.3);';
    backdrop.addEventListener('click', function() { hideOverlay('chat-context-overlay'); });
    backdrop.addEventListener('touchmove', function(e) { if (e.cancelable) e.preventDefault(); }, { passive: false });

    var menu = document.createElement('div');
    menu.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:100000;background:var(--bg-surface);border-radius:16px 16px 0 0;padding:16px 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
    menu.addEventListener('click', function(e) { e.stopPropagation(); });

    var header = document.createElement('div');
    header.style.cssText = 'padding:0 16px 12px;border-bottom:1px solid var(--border-subtle);margin-bottom:4px;';
    header.innerHTML = '<div style="font-size:15px;font-weight:600;color:var(--text-primary);">' + escapeHtml(chat.name) + '</div><div style="font-size:12px;color:var(--text-muted);">Chat</div>';
    menu.appendChild(header);

    function addItem(label, icon, onClick) {
      var item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:14px 16px;color:var(--text-primary);font-size:15px;cursor:pointer;';
      item.addEventListener('click', function(e) { e.stopPropagation(); onClick(); hideOverlay('chat-context-overlay'); });
      item.innerHTML = '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--text-muted);flex-shrink:0;"></i><span>' + label + '</span>';
      menu.appendChild(item);
    }

    if (chat.unread > 0) {
      addItem('Mark Read', 'eye', function() {
        chat.unread = 0;
        MStore.save();
        renderChatList();
      });
    }

    var isMuted = MStore.settings.mutedChats && MStore.settings.mutedChats[chat.id];
    addItem(isMuted ? 'Unmute' : 'Mute', isMuted ? 'bell' : 'bell-off', function() {
      if (!MStore.settings.mutedChats) MStore.settings.mutedChats = {};
      if (isMuted) {
        delete MStore.settings.mutedChats[chat.id];
      } else {
        MStore.settings.mutedChats[chat.id] = true;
      }
      MStore.save();
      showToast(isMuted ? 'Unmuted' : 'Muted', 'info');
    });

    addItem('Delete Chat', 'trash-2', function() {
      if (activeChatId === chat.id) closeChat();
      MStore.chats = MStore.chats.filter(function(c) { return c.id !== chat.id; });
      delete MStore.messages[chat.id];
      OrbitKeys.remove('msg_' + chat.id);
      MStore.save();
      renderChatList();
      showToast('Chat deleted', 'info');
    });

    var isGroup = MStore.groups.some(function(g) { return g.id === chat.id; });
    if (!isGroup) {
      addItem('View Profile', 'user', function() {
        var friend = MStore.friends.find(function(f) { return f.id === chat.id; });
        if (friend) {
          showToast(friend.name + ' — ' + (friend.status || 'offline'), 'info');
        } else {
          showToast('Friend info not available', 'info');
        }
      });
    }

    var cancel = document.createElement('div');
    cancel.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:14px 16px;margin-top:4px;border-top:1px solid var(--border-subtle);color:var(--text-muted);font-size:15px;cursor:pointer;';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', function(e) { e.stopPropagation(); hideOverlay('chat-context-overlay'); });
    menu.appendChild(cancel);

    backdrop.appendChild(menu);
    document.body.appendChild(backdrop);
    renderLucide({ root: menu });
  }

  /* -- Delegated long-press → user actions sheet -- */
  // Matches any [data-user-id] element: sender names/avatars in bubbles, group member rows,
  // friend rows (Friends tab) and the DM chat header avatar/name. Replaces the legacy handler
  // that matched stale .friend-row[data-friend] / .chat-row[data-chat] selectors and conflicted
  // with chat-screen.js _initContextMenu on .message-row (double context menu).
  var _userLpTimer = null;
  var _userLpTarget = null;
  var _userLpStartX = 0;
  var _userLpStartY = 0;
  var _userLpFired = false;
  var _userLpConsumeClick = false;

  // Pointer Events fire for mouse + touch + pen, so the long-press works in the desktop
  // browser AND the Android WebView with a single code path (touch events never fire for a
  // mouse, which is why the old touch-only handler was dead on desktop).
  document.addEventListener('pointerdown', function(e) {
    _userLpFired = false;
    // Look up [data-user-id] FIRST: sender names inside .message-row bubbles and DM chat rows
    // in the chat list must open the user sheet. .message-row is intentionally NOT excluded —
    // chat-screen.js's own menu guards (touchstart/contextmenu on [data-user-id]) prevent the
    // double-fire; message rows without a [data-user-id] ancestor fall through here untouched.
    var el = e.target.closest ? e.target.closest('[data-user-id]') : null;
    if (!el) return;
    // Never long-press interactive controls (member action buttons, links, inputs, ...).
    // These may sit inside a row/element that also carries data-user-id, so the exclusion
    // takes precedence over the [data-user-id] match.
    if (e.target.closest && e.target.closest('button, a, input, textarea, select, label, .group-member-remove, .group-member-promote, .group-member-demote, .group-info-btn, .group-info-pinned-remove')) return;
    // Mouse: only the primary (left) button starts a long-press — right-click is a separate
    // action (context menu / native menu) and must never open the user sheet.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var userId = el.getAttribute('data-user-id');
    if (!userId) return;
    var myId = MStore.user ? MStore.user.id : '';
    if (String(userId) === String(myId)) return; // never open the sheet for yourself
    _userLpTarget = { el: el, userId: userId };
    _userLpStartX = e.clientX;
    _userLpStartY = e.clientY;
    _userLpTimer = setTimeout(function() {
      _userLpTimer = null;
      if (!_userLpTarget) return;
      var target = _userLpTarget;
      _userLpTarget = null;
      _userLpFired = true;
      if (e.cancelable) e.preventDefault();
      showUserActionsSheet(target.userId, { sourceEl: target.el });
    }, 450);
  }, { passive: true });

  document.addEventListener('pointermove', function(e) {
    if (_userLpTimer) {
      var dx = Math.abs(e.clientX - _userLpStartX);
      var dy = Math.abs(e.clientY - _userLpStartY);
      if (dx > 10 || dy > 10) {
        clearTimeout(_userLpTimer);
        _userLpTimer = null;
        _userLpTarget = null;
      }
    }
  }, { passive: true });

  document.addEventListener('pointerup', function() {
    if (_userLpTimer) { clearTimeout(_userLpTimer); _userLpTimer = null; }
    _userLpTarget = null;
    // If a long-press just fired, swallow the single synthetic click that follows release —
    // otherwise it would open the chat / trigger inline onclick handlers underneath the sheet.
    if (_userLpFired) {
      _userLpFired = false;
      _userLpConsumeClick = true;
      setTimeout(function() { _userLpConsumeClick = false; }, 500);
    }
  }, { passive: true });

  document.addEventListener('pointercancel', function() {
    if (_userLpTimer) { clearTimeout(_userLpTimer); _userLpTimer = null; }
    _userLpTarget = null;
    _userLpFired = false;
  }, { passive: true });

  // Right-click guard: only suppress contextmenu while the ghost-click guard is armed (i.e.
  // right after a long-press release) so a native menu can't stack on top of the open sheet.
  // chat-screen.js / home-screen.js right-click menus are unaffected — they only fire when
  // this flag is NOT set (their rows are excluded from this long-press anyway).
  document.addEventListener('contextmenu', function(e) {
    if (_userLpConsumeClick) {
      _userLpConsumeClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Ghost-click guard (capture phase, before OrbitSheet's item buttons see the event):
  // swallows exactly one click fired right after a long-press release.
  document.addEventListener('click', function(e) {
    if (!_userLpConsumeClick) return;
    _userLpConsumeClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  /* -- Init E2EE (async, non-blocking) -- */
  if (window.Orbit && window.Orbit.E2EE && window.Orbit.E2EE.init) {
    Orbit.E2EE.init().then(function(ready) {
      if (ready) {
        console.log('[Orbit] E2EE initialized');
        if (MStore.settings.e2eeEnabled) {
          Orbit.E2EE.getPublicKeyAsync().then(function(pk) {
            if (pk) {
              MStore.user.publicKey = pk;
              MStore.save();
            }
          });
        }
      } else {
        console.warn('[Orbit] E2EE init failed — encryption unavailable');
      }
    });
  }

  /* -- Init P2P Networking -- */

  // ── Beacon avatar thumbnail cache (v0.4.0-beta fix) ──
  // UDP datagrams cap at ~64KB and the Android receive buffer is bounded, so a
  // full PNG data-URL avatar (100-300KB) breaks discovery. Send a small compressed
  // thumbnail instead, and only when it changes; full-res avatar still flows over
  // the TCP handshake beacon.
  var _beaconAvatarThumb = null;
  var _beaconAvatarSource = null;
  var _beaconThumbPending = false;
  var _lastBeaconAvatarSent = null;

  function refreshBeaconAvatarThumb() {
    var u = MStore.user;
    if (!u || !u.avatar) {
      _beaconAvatarThumb = null;
      _beaconAvatarSource = (u && u.avatar) || null;
      _beaconThumbPending = false;
      return;
    }
    if (_beaconAvatarSource === u.avatar && _beaconAvatarThumb) return; // cached
    if (_beaconThumbPending) return; // already computing
    _beaconThumbPending = true;
    _beaconAvatarSource = u.avatar;
    MStore.compressImage(u.avatar, 128, 128, 0.7, function(thumb) {
      _beaconThumbPending = false;
      // Only cache if the avatar didn't change mid-compress
      if (MStore.user && MStore.user.avatar !== _beaconAvatarSource) return;
      // Oversized safety net (fix #7): if the JPEG is still too large for a
      // UDP datagram (or compressImage fell back to the original PNG), retry
      // smaller; if that fails too, drop the avatar from the beacon entirely
      // rather than break discovery — full-res avatar flows over the TCP
      // handshake anyway.
      if (thumb && thumb.length > 50000) {
        _beaconThumbPending = true;
        MStore.compressImage(u.avatar, 96, 96, 0.5, function(thumb2) {
          _beaconThumbPending = false;
          if (MStore.user && MStore.user.avatar !== _beaconAvatarSource) return;
          _beaconAvatarThumb = (thumb2 && thumb2.length <= 50000) ? thumb2 : null;
          repushUdpBeacon();
          broadcastProfileToPeers();
        });
        return;
      }
      _beaconAvatarThumb = thumb || u.avatar;
      // Thumbnail now ready — push it into the native beacon store so the
      // 10s UDP broadcast actually carries the avatar, and notify peers we
      // are already connected to over TCP (v0.4.0-beta fixes #1/#8)
      repushUdpBeacon();
      broadcastProfileToPeers();
    });
  }

  function buildBeacon(forceAvatar) {
    var u = MStore.user;
    if (!u) return {};
    refreshBeaconAvatarThumb();
    var avatarForBeacon = _beaconAvatarThumb;
    // forceAvatar = unconditional avatar (re-push after async thumb cache/profile
    // save) so a stale undefined never wipes the native beacon store.
    var avatarChanged = forceAvatar ? !!avatarForBeacon : (avatarForBeacon !== _lastBeaconAvatarSent);
    if (avatarChanged) _lastBeaconAvatarSent = avatarForBeacon;
    return {
      type: Orbit.Protocol.Types.BEACON,
      from: u.id,
      senderId: u.id,
      timestamp: new Date().toISOString(),
      payload: {
        userId: u.id,
        username: u.name,
        usertag: u.tag,
        avatarHash: u.avatar ? 'has_avatar' : null,
        avatar: avatarChanged ? avatarForBeacon : undefined,
        status: u.status || 'online',
        bio: u.bio || '',
        publicKey: u.publicKey || null,
        profileFrame: MStore.settings.profileFrame || null,
        banner: u.banner || null,
        tcpPort: MStore.settings.tcpPort || 46000,
        device: 'android'
      }
    };
  }

  // Re-push the current beacon to native so Java's 10s UDP re-broadcast carries
  // the latest avatar/profile. Safe to call repeatedly (native update is
  // idempotent). Always uses the ORIGINAL udpPort to avoid multicast port drift.
  function repushUdpBeacon() {
    if (!window.Orbit || !window.Orbit.P2P) return;
    if (MStore.settings.networkMode === 'Custom IP') return; // UDP discovery off
    var udpPort = MStore.settings.udpPort || 45678;
    var beacon = buildBeacon(true);
    Orbit.P2P.startDiscovery(beacon, udpPort).catch(function() {});
  }

  // Broadcast the current profile/avatar to already-connected TCP peers in
  // real time (v0.4.0-beta fix #8). New peers get it from the UDP beacon;
  // this closes the gap for peers we are already connected to. forceAvatar
  // in buildBeacon keeps the avatar field present so a stale value never
  // wipes a peer's stored avatar.
  function broadcastProfileToPeers() {
    if (!window.Orbit || !window.Orbit.P2P || !Orbit.P2P.isAvailable || !Orbit.P2P.isAvailable()) return;
    var beaconData = buildBeacon(true).payload;
    var conns = Orbit.P2P.getConnections ? Orbit.P2P.getConnections() : [];
    var myId = MStore.user ? MStore.user.id : '';
    (conns || []).forEach(function(conn) {
      var peerId = conn.peerId || conn.remotePeer || (typeof conn === 'string' ? conn : '');
      if (peerId && peerId !== myId && Orbit.Protocol && Orbit.Protocol.createPacket && Orbit.P2P.send) {
        var pkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.BEACON, myId, peerId, beaconData);
        Orbit.P2P.send(peerId, pkt);
      }
    });
  }

  // Mirror a peer's avatar onto their DM chat record so the DMs tab (which
  // renders chat.avatar) shows the other user's avatar instead of the
  // single-letter fallback (v0.4.1-beta fix). Returns true only when the
  // chat's avatar actually changed, so callers save/render only then instead
  // of spamming writes on the 10s beacon cycle.
  function syncFriendAvatar(friendId) {
    if (!friendId || (MStore.user && friendId === MStore.user.id)) return false;
    var f = MStore.friends.find(function(x) { return x.id === friendId; });
    if (!f || !f.avatar) return false;
    var c = MStore.chats.find(function(x) { return (x.id || x.chatId) === friendId; });
    if (!c) return false;
    var target = f.avatar || null;
    if (c.avatar !== target) { c.avatar = target; return true; }
    return false;
  }

  function getProfileFrame(source) {
    if (MStore.settings.profileFrames !== true) return 0;
    var val = (source && source.profileFrame != null) ? source.profileFrame : 0;
    return Math.max(0, parseInt(val, 10) || 0);
  }

  /* -- Debug log buffer (visible when devMode is on) -- */
  var _logBuffer = [];
  var _logOverlay = null;
  function escHtml(s) {
    if (typeof s !== 'string') return String(s || '');
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  var _logLevels = { 'None': 0, 'Error': 1, 'Info': 2, 'Debug': 3 };
  function debugLog(category, msg, data) {
    var currentLevel = _logLevels[MStore.settings.logLevel] || 3;
    if (currentLevel < 2) return;
    if (currentLevel < 3 && data && typeof data === 'object' && Object.keys(data).length > 2) { data = null; }
    var entry = { t: new Date().toISOString().slice(11,23), cat: category, msg: msg, data: data || null };
    _logBuffer.push(entry);
    if (_logBuffer.length > 500) _logBuffer.shift();
    if (currentLevel >= 3) console.log('[' + category + ']', msg, data || '');
    else if (currentLevel >= 2) console.log('[' + category + ']', msg);
  }
  function showLogOverlay() {
    if (_logOverlay) { _logOverlay.style.display = 'flex'; return; }
    var overlay = document.createElement('div');
    overlay.id = 'p2p-log-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;padding:12px;font-family:monospace;font-size:11px;color:#0f0;';
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-shrink:0;';
    header.innerHTML = '<span style="font-weight:700;font-size:13px;">P2P Log</span><button id="p2p-log-close" style="background:transparent;border:1px solid #0f0;color:#0f0;border-radius:4px;padding:4px 12px;cursor:pointer;">Close</button>';
    var content = document.createElement('div');
    content.id = 'p2p-log-content';
    content.style.cssText = 'flex:1;overflow-y:auto;white-space:pre-wrap;line-height:1.5;';
    overlay.appendChild(header);
    overlay.appendChild(content);
    document.body.appendChild(overlay);
    _logOverlay = overlay;
    renderLogBuffer();
    document.getElementById('p2p-log-close').addEventListener('click', function() { overlay.style.display = 'none'; });
  }
  function renderLogBuffer() {
    var el = document.getElementById('p2p-log-content');
    if (!el) return;
    el.innerHTML = _logBuffer.map(function(e) {
      return '<span style="color:#888;">' + e.t + '</span> <span style="color:#0af;">[' + e.cat + ']</span> ' + escHtml(e.msg) + (e.data ? ' <span style="color:#fa0;">' + escHtml(JSON.stringify(e.data)) + '</span>' : '');
    }).join('\n');
    el.scrollTop = el.scrollHeight;
  }

  /* ─── Connection Status ─── */
  var _connectedShown = false;
  function showConnectionStatus(state, text) {
    var el = document.getElementById('connection-status');
    if (!el) return;
    var textEl = document.getElementById('conn-status-text');
    if (state === 'connected') {
      if (_connectedShown) return;
      _connectedShown = true;
    }
    if (state === 'disconnected') {
      _connectedShown = false;
    }
    el.className = 'conn-status visible ' + (state || '');
    if (textEl) textEl.textContent = text || '';
    if (state === 'connected' || state === 'disconnected') {
      setTimeout(function() { el.classList.remove('visible'); }, 3000);
    }
  }

  function initP2P() {
    if (!window.Orbit || !window.Orbit.P2P) {
      debugLog('P2P', 'initP2P aborted — Orbit.P2P not available');
      return;
    }
    showConnectionStatus('connecting', 'Connecting...');
    debugLog('P2P', 'initP2P called');
    var u = MStore.user;

    // Remove stale listeners before re-initializing (BUG-JS-4)
    debugLog('P2P', 'Cleaning up stale listeners');
    Orbit.P2P.cleanup();

    debugLog('P2P', 'P2P plugin available: ' + Orbit.P2P.isAvailable());

    // Start TCP server
    var tcpPort = MStore.settings.tcpPort || 46000;
    debugLog('P2P', 'Starting TCP server on port ' + tcpPort);
    Orbit.P2P.startServer(tcpPort).then(function(result) {
      if (result.success) {
        debugLog('P2P', 'Server started on port ' + result.port);
      } else {
        debugLog('P2P', 'Server start failed: ' + (result.error || 'unknown'));
      }
    });

    // Build beacon
    var beacon = buildBeacon();
    debugLog('P2P', 'Beacon built', { userId: u ? u.id : 'none', username: u ? u.name : 'none' });

    // Start LAN discovery (only in auto-discovery mode)
    if (MStore.settings.networkMode !== 'Custom IP') {
      var udpPort = MStore.settings.udpPort || 45678;
      debugLog('P2P', 'Starting LAN discovery on UDP port ' + udpPort);
      Orbit.P2P.startDiscovery(beacon, udpPort).then(function(r) {
        if (r && !r.success) debugLog('P2P', 'Discovery start failed: ' + (r.error || 'unknown'));
        else debugLog('P2P', 'Discovery started');
      });
    } else {
      debugLog('P2P', 'Custom IP mode — UDP discovery skipped');
    }

    // Start P2P heartbeat (sends PING at netKeepAlive interval)
    if (window._heartbeatInterval) clearInterval(window._heartbeatInterval);
    window._heartbeatPingCount = {};
    var keepAliveSec = Math.max(10, (MStore.settings.netKeepAlive || 30));
    window._heartbeatInterval = setInterval(function() {
      if (!window.Orbit || !Orbit.P2P) return;
      var conns = Orbit.P2P.getConnections();
      conns.forEach(function(connId) {
        var pingPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.PING, MStore.user ? MStore.user.id : '', connId, { ts: Date.now() });
        Orbit.P2P.send(connId, pingPkt).then(function(r) {
          if (!r.success) {
            window._heartbeatPingCount[connId] = (window._heartbeatPingCount[connId] || 0) + 1;
            if (window._heartbeatPingCount[connId] >= 3) {
              debugLog('P2P', 'Heartbeat: no response from ' + connId + ' after 3 pings');
            }
          }
        });
      });
    }, keepAliveSec * 1000);

    window._resumeExpectedReceives = window._resumeExpectedReceives || {}; // fileIds whose IndexedDB partial survives a reap (lazy re-open)
    // Reap stale activeTransfers every 30s (CROSS-4)
    if (window._transferReapInterval) clearInterval(window._transferReapInterval);
    window._transferReapInterval = setInterval(function() {
      if (!window.activeTransfers) return;
      var now = Date.now();
      Object.keys(window.activeTransfers).forEach(function(fileId) {
        var tx = window.activeTransfers[fileId];
        // CROSS-4: idle-timeout semantics — only reap when NO chunk has arrived
        // for 120s (a long but healthy transfer must not be killed)
        var lastActivity = tx._lastChunkTime || tx._startTime;
        if (lastActivity && now - lastActivity > 120000) {
          console.warn('[P2P] Reaping stalled transfer:', fileId, tx.fileName);
          window._resumeExpectedReceives[fileId] = true; // partial persists in IndexedDB — late CHUNK/END re-open it
          delete window.activeTransfers[fileId];
        }
      });
    }, 30000);

    // CROSS-4: ask the sender to skip ahead to the first missing chunk when the
    // receive-side prefix stalls (lost chunks on the wire or a missed
    // FILE_TRANSFER_END). The sender verifies the hash of the prefix we already
    // hold before re-sending from our contiguous count.
    function _maybeRequestResume(fileId) {
      if (!window.activeTransfers || !window.activeTransfers[fileId]) return;
      var tx = window.activeTransfers[fileId];
      if (!tx.chunks || !tx.chunks.length) return;
      // Contiguous prefix length: first slot that is still missing
      var n = 0;
      while (n < tx.chunks.length && tx.chunks[n] !== undefined) n++;
      // F2: healthy in-order flow — the prefix is complete and only the tail
      // is missing, so there is no hole for the sender to skip; a RESUME
      // would only churn (base64-decode + hash the whole prefix for nothing).
      // The END-with-gaps path still fires (there n < tx.received).
      if (n === tx.received && n < tx.total) return;
      var now = Date.now();
      if (tx._resuming) return; // digest/send already in flight
      if (tx._lastResumeReq && now - tx._lastResumeReq < 4000) return; // cooldown
      if (n === 0 && now - tx._startTime < 5000) return; // right after START — useless
      tx._resuming = true;
      try {
        // Hash the contiguous prefix we actually hold (chunks 0..n-1)
        var _rLen = 0;
        var _rBufs = [];
        for (var _r = 0; _r < n; _r++) {
          // No decode — chunks are already bytes. (This loop used to rebuild the whole
          // prefix as fresh buffers on every retry, which is a second full copy of the
          // file at exactly the moment the transfer is already struggling.)
          var _rCb = _chunkToBytes(tx.chunks[_r]);
          _rBufs.push(_rCb);
          _rLen += _rCb.byteLength;
        }
        var _rMerged = new Uint8Array(_rLen);
        var _rOff = 0;
        for (var _r2 = 0; _r2 < _rBufs.length; _r2++) {
          _rMerged.set(new Uint8Array(_rBufs[_r2]), _rOff);
          _rOff += _rBufs[_r2].byteLength;
        }
        crypto.subtle.digest('SHA-256', _rMerged.buffer).then(function(hashBuf) {
          var _rArr = Array.from(new Uint8Array(hashBuf));
          var _rHex = _rArr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
          tx._resuming = false;
          tx._lastResumeReq = Date.now();
          var resumePayload = { fileId: fileId, receivedCount: n, hash: _rHex };
          if (tx.chatId) resumePayload.chatId = tx.chatId; // group transfers
          debugLog('P2P', 'Requesting resume for ' + (tx.fileName || fileId) + ' — ' + n + '/' + tx.total + ' chunks held');
          try {
            Orbit.P2P.send(tx.senderId, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_RESUME,
              MStore.user ? MStore.user.id : '',
              tx.senderId,
              resumePayload
            )).catch(function(e) {
              console.warn('[P2P] RESUME send failed for', fileId, e);
            });
          } catch(e) {
            console.warn('[P2P] RESUME send failed for', fileId, e);
          }
        }).catch(function(e) {
          console.warn('[P2P] RESUME digest failed for', fileId, e);
          tx._resuming = false;
        });
      } catch(e) {
        console.warn('[P2P] RESUME failed for', fileId, e);
        tx._resuming = false;
      }
    }

    // Listen for incoming connections — send identity beacon over TCP
    Orbit.P2P.onConnection(function(data) {
      if (!data || !data.connectionId) { debugLog('P2P', 'onConnection: invalid data'); return; }
      debugLog('P2P', 'Incoming connection', { connectionId: data.connectionId, host: data.host });
      var cur = MStore.user;
      if (cur && data.connectionId) {
        var beaconPacket = Orbit.Protocol.createPacket(Orbit.Protocol.Types.BEACON, cur.id, data.connectionId, {
          userId: cur.id,
          username: cur.name,
          usertag: cur.tag,
          avatarHash: cur.avatar ? 'has_avatar' : null,
          avatar: cur.avatar || null,
          status: cur.status || 'online',
          bio: cur.bio || '',
          publicKey: cur.publicKey || null,
          profileFrame: MStore.settings.profileFrame || null,
          banner: cur.banner || null,
          tcpPort: MStore.settings.tcpPort || 46000,
          device: 'android'
        });
        debugLog('P2P', 'Sending TCP beacon to', { connectionId: data.connectionId, target: cur.name });
        Orbit.P2P.send(data.connectionId, beaconPacket);
      }
    });

    // Listen for messages
    var _handleP2PPacketData = function(data, _pre) { try {
      var packet = _pre;
      if (!packet) {
        if (!data || !data.data) {
          debugLog('P2P', 'onMessage received empty data');
          return;
        }
        debugLog('P2P', 'Raw message from ' + (data.connectionId || '?'), { length: data.data.length, preview: data.data.substring(0, 80) });
        packet = Orbit.Protocol.parsePacket(data.data);
        if (!packet) {
          debugLog('P2P', 'Failed to parse packet from ' + (data.connectionId || '?'));
          return;
        }
      }
      debugLog('P2P', 'Parsed packet type=' + packet.type + ' from=' + (packet.from || packet.senderId || '?'), packet.payload);
      if (MStore.settings.logNetworkPackets) console.log('[NET] P2P recv <-', data.connectionId, packet);

      // Handle PING — respond with PONG
      if (packet.type === Orbit.Protocol.Types.PING) {
        var pongPkt = Orbit.Protocol.createPacket(Orbit.Protocol.Types.PONG, MStore.user ? MStore.user.id : '', data.connectionId, { ts: Date.now() });
        Orbit.P2P.send(data.connectionId, pongPkt).catch(function() {});
        return;
      }

      // Handle PONG — reset heartbeat ping count AND update friend status
      if (packet.type === Orbit.Protocol.Types.PONG) {
        if (window._heartbeatPingCount && data.connectionId) {
          window._heartbeatPingCount[data.connectionId] = 0;
        }
        // Update friend's lastSeen so the offline check doesn't mark them offline
        var pongFriend = MStore.friends.find(function(f) { return f.connectionId === data.connectionId || f.id === data.connectionId; });
        if (pongFriend) {
          pongFriend.lastSeen = Date.now();
          if (pongFriend.status !== 'online') {
            pongFriend.status = 'online';
            MStore.save();
            renderFriends();
            renderChatList();
          }
        }
        return;
      }

      // ── Voice / video call signalling ──
      // Control packets: handled and returned so they never fall through to the
      // message path below. The manager lives in components/call-manager.js.
      // `packet.from` is the sender's user id; data.connectionId is the same
      // value on mobile (the native plugin uses peerId as the connectionId).
      if (packet.type === Orbit.Protocol.Types.CALL_OFFER) {
        if (window.OrbitCall) window.OrbitCall.handleOffer(packet.payload, packet.from || data.connectionId);
        return;
      }
      if (packet.type === Orbit.Protocol.Types.CALL_ANSWER) {
        if (window.OrbitCall) window.OrbitCall.handleAnswer(packet.payload);
        return;
      }
      if (packet.type === Orbit.Protocol.Types.CALL_ICE_CANDIDATE) {
        if (window.OrbitCall) window.OrbitCall.handleIceCandidate(packet.payload);
        return;
      }
      if (packet.type === Orbit.Protocol.Types.CALL_END) {
        if (window.OrbitCall) window.OrbitCall.handleEnd();
        return;
      }
      if (packet.type === Orbit.Protocol.Types.CALL_DECLINE) {
        if (window.OrbitCall) window.OrbitCall.handleDecline(packet.payload);
        return;
      }

      // Handle BEACON packets received over TCP (handshake)
      if (packet.type === Orbit.Protocol.Types.BEACON) {
        var bp = packet.payload || {};
        var peerId = bp.userId || packet.from || packet.senderId;
        if (!peerId || (MStore.user && peerId === MStore.user.id)) return;
        var peerName = bp.username || bp.name || data.connectionId;
        var peerTag = bp.usertag || bp.tag || '';
        // Add or update friend — with peer merging (Bug #2)
        var existing = MStore.friends.find(function(f) { return f.id === peerId; });
        // Also search by connectionId to catch host:port-based peers
        if (!existing && data.connectionId && data.connectionId !== peerId) {
          var connIp = data.connectionId.split(':')[0];
          var connFriend = MStore.friends.find(function(f) { return f.id === data.connectionId || (connIp && f.ip === connIp); });
          if (connFriend) {
            debugLog('P2P', 'Merging TCP peer: ' + connFriend.id + ' → ' + peerId, { name: peerName });
            var oldChatId = connFriend.id;
            if (oldChatId !== peerId) {
              if (MStore.messages[oldChatId] && MStore.messages[oldChatId].length) {
                var existingMsgs = MStore.getMessages(peerId);
                var mergedMsgs = (MStore.messages[oldChatId] || []).map(function(m) {
                  var clone = JSON.parse(JSON.stringify(m));
                  if (clone.from === oldChatId) clone.from = peerId;
                  return clone;
                });
                MStore.messages[peerId] = existingMsgs.concat(mergedMsgs);
                MStore._saveMsgs(peerId);
                delete MStore.messages[oldChatId];
                OrbitKeys.remove('msg_' + oldChatId);
              }
              MStore.chats = MStore.chats.filter(function(c) { return c.id !== oldChatId; });
            }
            connFriend.id = peerId;
            connFriend.name = peerName;
            connFriend.tag = peerTag;
            connFriend.status = bp.status || 'online';
            if (bp.avatar !== undefined) connFriend.avatar = bp.avatar;
            if (bp.publicKey) _setPeerKey(connFriend, bp.publicKey);
            if (bp.tcpPort) connFriend.tcpPort = bp.tcpPort;
            if (data.connectionId) connFriend.connectionId = data.connectionId;
            existing = connFriend;
          }
        }
        if (!existing) {
          MStore.friends.push({
            id: peerId,
            name: peerName,
            tag: peerTag,
            status: bp.status || 'online',
            avatar: bp.avatar || null,
            bio: bp.bio || '',
            ip: data.connectionId ? data.connectionId.split(':')[0] : null,
            tcpPort: bp.tcpPort || null,
            connectionId: data.connectionId || null,
            publicKey: bp.publicKey || null,
            profileFrame: bp.profileFrame !== undefined ? bp.profileFrame : null,
            banner: bp.banner || null,
            lastSeen: Date.now()
          });
        } else {
          existing.status = bp.status || 'online';
          existing.lastSeen = Date.now();
          existing.name = peerName;
          existing.tag = peerTag;
          if (bp.avatar !== undefined) existing.avatar = bp.avatar;
          if (bp.bio !== undefined) existing.bio = bp.bio;
          if (bp.profileFrame !== undefined) existing.profileFrame = bp.profileFrame;
          if (bp.banner !== undefined) existing.banner = bp.banner;
          if (bp.tcpPort) existing.tcpPort = bp.tcpPort;
          if (data.connectionId) existing.ip = data.connectionId.split(':')[0];
          if (data.connectionId) existing.connectionId = data.connectionId;
        }
        refreshProfileOverlay(peerId);
        // Ensure chat exists (avoid duplicates from host:port→UUID merge)
        var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
        if (!chatExists) {
          MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0, avatar: bp.avatar || null });
        } else {
          // Clean up any orphan chats (Bug #2) — match the OLD host:port chat id for
          // THIS peer endpoint only; never match by display name (two peers can share
          // a name, and name-matching deletes the wrong chat + message history).
          var connIp = data.connectionId ? data.connectionId.split(':')[0] : null;
          var ipChat = null;
          if (connIp) {
            ipChat = MStore.chats.find(function(c) {
              return c.id !== peerId &&
                     (c.id === data.connectionId || c.id.indexOf(connIp + ':') === 0) &&
                     !(MStore.groups || []).some(function(g) { return (g.id || g.groupId) === c.id; });
            });
          }
          if (ipChat) {
            MStore.chats = MStore.chats.filter(function(c) { return c.id !== ipChat.id; });
            delete MStore.messages[ipChat.id];
            OrbitKeys.remove('msg_' + ipChat.id);
          }
        }
        if (syncFriendAvatar(peerId)) { MStore.save(); }
        MStore.save();
        renderFriends();
        renderChatList();
        showConnectionStatus('connected', 'Connected');
        console.log('[P2P] Beacon handshake from:', peerName);
        return;
      }

      var msgFrom = packet.from || packet.senderId || data.connectionId;
      if (!msgFrom) { debugLog('P2P', 'Cannot determine sender — dropping'); return; }

      // Blocked user check
      if (MStore.blockedUsers && MStore.blockedUsers.indexOf(msgFrom) !== -1) {
        debugLog('P2P', 'Ignored message from blocked user ' + msgFrom);
        return;
      }

      var chatId = msgFrom;
      // Group messages carry the group ID in payload
      if (packet.payload && packet.payload.groupId) {
        chatId = packet.payload.groupId;
      } else if (packet.payload && packet.payload.chatId && packet.type !== Orbit.Protocol.Types.REACTION) {
        // REACTION packets must NOT use payload.chatId — it's the sender's activeChatId,
        // which would be the receiver's own userId for DM, causing chat lookup to fail
        chatId = packet.payload.chatId;
      }

      var chat = MStore.chats.find(function(c) { return c.id === chatId; });
      if (!chat) {
        var exemptGroupTypes = [Orbit.Protocol.Types.GROUP_CREATE, Orbit.Protocol.Types.GROUP_JOIN_RESPONSE];
        if (exemptGroupTypes.indexOf(packet.type) === -1) {
          debugLog('P2P', 'Chat not found for message from ' + msgFrom + ' chatId=' + chatId + ' type=' + packet.type, { availableChats: MStore.chats.map(function(c){return c.id;}).join(',') });
          return;
        }
      }

      // Global payload null guard (MSG-1)
      if (!packet.payload) {
        debugLog('P2P', 'Packet missing payload — dropping');
        return;
      }

      if (packet.type === Orbit.Protocol.Types.MESSAGE) {
        var msgText = packet.payload.text || '';
        var msgAttachmentsRaw = packet.payload.attachments || undefined;
        // Convert inline data: URLs to blob: URLs and persist in IndexedDB
        if (msgAttachmentsRaw) {
          for (var ai = 0; ai < msgAttachmentsRaw.length; ai++) {
            var aa = msgAttachmentsRaw[ai];
            if (aa.url && aa.url.indexOf('data:') === 0) {
              var blobUrl = _dataUrlToBlobUrl(aa.url);
              if (blobUrl !== aa.url) {
                aa._dataUrl = aa.url;   // preserve for restart recovery (backward compat)
                aa.url = blobUrl;
              }
              // Persist inline attachment data in IndexedDB
              if (!aa._blobKey && !aa._pending) {
                var inlineKey = 'inline_' + chatId + '_' + (aa.id || Date.now() + '_' + Math.random().toString(36).slice(2, 6));
                try {
                  var dataUrlToParse = aa._dataUrl || aa.url;
                  var m = dataUrlToParse.match(/^data:([^;]+);base64,(.+)$/);
                  if (m) {
                    var ab = window.orbitBase64ToArrayBuffer(m[2]);
                    if (ab && ab.byteLength > 0) {
                      window.BlobStoreDB.put(inlineKey, ab).catch(function(err) {
                        console.warn('[P2P] Inline persist failed:', err);
                      });
                      aa._blobKey = inlineKey;
                      aa._blobCreated = true; aa._blobSession = window._orbitSessionId;
                    }
                  }
                } catch(e) {
                  console.warn('[P2P] Inline persist error:', e);
                }
              }
            }
          }
        }
        var msgAttachments = msgAttachmentsRaw;
        var msgReplyTo = packet.payload.replyTo || undefined;

        var senderName = packet.payload.fromName || (function() { var sf = MStore.friends.find(function(f) { return f.id === msgFrom; }); return sf ? sf.name : null; })();
        if (packet.payload.e2ee && window.Orbit.E2EE) {
          var senderFriend = MStore.friends.find(function(f) { return f.id === msgFrom; });
          if (senderFriend && senderFriend.publicKey) {
            Orbit.E2EE.decrypt(
              packet.payload.ciphertext,
              packet.payload.nonce,
              senderFriend.publicKey
            ).then(function(decrypted) {
              if (decrypted) msgText = decrypted;
              var e2eeMsgId = packet.payload.msgId || ('p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
              MStore.addMessage(chatId, {
                id: e2eeMsgId,
                from: msgFrom,
                fromName: senderName,
                text: msgText,
                time: new Date().toISOString(),
                replyTo: msgReplyTo,
                attachments: msgAttachments,
                poll: packet.payload.poll || undefined
              });
              _startDisappearTimer(chatId, e2eeMsgId);
              // Check if this message mentions the current user
              if (chatId !== activeChatId && MStore.user && msgText) {
                var myName = MStore.user.name || '';
                var match = msgText.match(/@(\w+)/g);
                if (match && myName && match.some(function(m) { return m.substring(1).toLowerCase() === myName.toLowerCase(); })) {
                  MStore.mentionCounts[chatId] = (MStore.mentionCounts[chatId] || 0) + 1;
                }
              }
              if (activeChatId === chatId) renderMessages(activeChatId);
              renderChatList();
              showIncomingNotification(chatId, msgFrom, msgText);
            });
            return;
          }
        }

        debugLog('P2P', 'Incoming MESSAGE from ' + msgFrom + ' chatId=' + chatId, { text: msgText.substring(0, 100) });
        var incomingMsgId = packet.payload.msgId || ('p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
        MStore.addMessage(chatId, {
          id: incomingMsgId,
          from: msgFrom,
          fromName: senderName,
          text: msgText,
          time: new Date().toISOString(),
          replyTo: msgReplyTo,
          attachments: msgAttachments,
          poll: packet.payload.poll || undefined
        });
        _startDisappearTimer(chatId, incomingMsgId);
        // Update sender's status — receiving a message confirms they're online
        var msgFriend = MStore.friends.find(function(f) { return f.id === msgFrom; });
        if (msgFriend) {
          msgFriend.lastSeen = Date.now();
          if (msgFriend.status !== 'online') {
            msgFriend.status = 'online';
          }
        }
        // Check if this message mentions the current user
        if (chatId !== activeChatId && MStore.user && msgText) {
          var myName = MStore.user.name || '';
          var match = msgText.match(/@(\w+)/g);
          if (match && myName) {
            var isMentioned = match.some(function(m) {
              return m.substring(1).toLowerCase() === myName.toLowerCase();
            });
            if (isMentioned) {
              MStore.mentionCounts[chatId] = (MStore.mentionCounts[chatId] || 0) + 1;
            }
          }
        }
        if (activeChatId === chatId) renderMessages(activeChatId);
        renderChatList();
        showIncomingNotification(chatId, msgFrom, msgText);
        return;
      }

      // Handle typing indicators
      if (packet.type === Orbit.Protocol.Types.TYPING) {
        var typChatId = (packet.payload && packet.payload.groupId) || packet.from;
        var isTyping = packet.payload && packet.payload.isTyping;
        var username = packet.payload ? packet.payload.username : 'Someone';
        
        if (!window._typingUsers) window._typingUsers = {};
        if (!window._typingUsers[typChatId]) window._typingUsers[typChatId] = {};
        
        if (isTyping) {
          window._typingUsers[typChatId][packet.from] = { username: username, timeout: setTimeout(function() {
            if (window._typingUsers[typChatId] && window._typingUsers[typChatId][packet.from]) {
              delete window._typingUsers[typChatId][packet.from];
              renderTypingIndicator();
            }
          }, 4000) };
        } else {
          if (window._typingUsers[typChatId][packet.from]) clearTimeout(window._typingUsers[typChatId][packet.from].timeout);
          delete window._typingUsers[typChatId][packet.from];
        }
        
        window.renderTypingIndicator();
        return;
      }
      

      // Handle reactions
      if (packet.type === Orbit.Protocol.Types.REACTION) {
        var rPayload = packet.payload;
        if (rPayload && rPayload.msgId && rPayload.emoji && rPayload.userId) {
          if (rPayload.action !== 'add' && rPayload.action !== 'remove') return;
          // Defensive: recompute chatId — never trust payload.chatId for REACTION
          // (legacy clients may include it, overwriting the correct msgFrom-based chatId)
          var reactChatId = rPayload.groupId || msgFrom;
          var reactMsgs = MStore.getMessages(reactChatId);
          var reactMsgIdx = reactMsgs.findIndex(function(m) { return String(m.id) === String(rPayload.msgId); });
          if (reactMsgIdx >= 0) {
            var reactMsg = reactMsgs[reactMsgIdx];
            var reactReactions = reactMsg.reactions ? reactMsg.reactions.slice() : [];
            var reactExistingIdx = reactReactions.findIndex(function(r) { return r.emoji === rPayload.emoji && r.userId === rPayload.userId; });
            if (rPayload.action === 'add' && reactExistingIdx < 0) {
              reactReactions.push({ emoji: rPayload.emoji, userId: rPayload.userId });
            } else if (rPayload.action === 'remove' && reactExistingIdx >= 0) {
              reactReactions.splice(reactExistingIdx, 1);
            }
            reactMsgs[reactMsgIdx].reactions = reactReactions;
            MStore.messages[reactChatId] = reactMsgs;
            MStore._saveMsgs(reactChatId);
            if (activeChatId === reactChatId) renderMessages(activeChatId);
          }
        }
      }

      // File transfers (Receive from Desktop)
      // Lazy re-open of a reaped receive from its IndexedDB partial (mobile M3).
      // Rebuilds activeTransfers[fileId] exactly like startup rehydration, then
      // the caller re-dispatches the packet through _handleP2PPacketData.
      function _reopenPartialReceive(fileId) {
        return window.BlobStoreDB.partialGet(fileId).then(function(rec){
          if (!rec || !rec.fileId) return false;
          if (window.activeTransfers && window.activeTransfers[fileId]) return true;
          var arr = new Array(rec.total || 0);
          var recv = 0;
          if (rec.chunks && typeof rec.chunks === 'object') {
            for (var k in rec.chunks) {
              var i2 = parseInt(k, 10);
              if (!isNaN(i2) && i2 >= 0 && i2 < arr.length) { arr[i2] = rec.chunks[k]; recv++; }
            }
          }
          window.activeTransfers = window.activeTransfers || {};
          window.activeTransfers[fileId] = { chunks: arr, fileName: rec.fileName || 'unknown', total: rec.total || 0, received: recv, senderId: rec.senderId || '', type: rec.type || '', mimeType: rec.mimeType || '', hash: rec.hash || '', chatId: rec.chatId || '', _startTime: Date.now(), _lastChunkTime: Date.now(), _rehydrated: true, _lastCheckpoint: rec.received || recv };
          return true;
        }).catch(function(){ return false; });
      }
      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_START) {
        if (!packet.payload || !packet.payload.fileId) return;
        // F3: receivers buffer whole files in RAM, so a chunk cap is a real limit.
        //
        // The old cap was 5000 chunks — 320 MB at 64 KB/chunk — which was set as if the
        // receiver only needed one copy. It needs about two: the received chunks plus the
        // contiguous buffer the merge step builds, so the real footprint is ~2x the file.
        // A 133 MB video (2,081 chunks) sailed under the old cap and then OOMed the
        // WebView, which is what killed the connection and produced ECONNRESET on the
        // sender. Rejecting up front is the honest outcome: a clear message beats a
        // transfer that will never finish.
        //
        // MAX_RECEIVE_CHUNKS is deliberately tunable — raise it if a target device has
        // heap to spare. Removing the need for a cap at all means streaming chunks
        // straight to storage instead of merging them, which is the real fix.
        var MAX_RECEIVE_CHUNKS = 2400;   // ~150 MB at 64 KB/chunk
        if ((packet.payload.totalChunks || 0) > MAX_RECEIVE_CHUNKS) {
          var _tooBigMb = Math.round((packet.payload.totalChunks * 65536) / (1024 * 1024));
          console.warn('[P2P] Rejecting oversized transfer', packet.payload.fileId, '—',
                       packet.payload.totalChunks, 'chunks (~' + _tooBigMb + ' MB) exceed the cap of', MAX_RECEIVE_CHUNKS);
          try { showToast('That file is too large to receive (' + _tooBigMb + ' MB)', 'warning'); } catch(e) {}
          try {
            Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_REJECT, MStore.user ? MStore.user.id : '', msgFrom,
              { fileId: packet.payload.fileId, reason: 'too_large' }
            )).catch(function(e) {
              console.warn('[P2P] REJECT send failed for', packet.payload.fileId, e);
            });
          } catch(e) {
            console.warn('[P2P] REJECT send failed for', packet.payload.fileId, e);
          }
          return;
        }
        var totalChunks = Math.min(packet.payload.totalChunks || 0, MAX_RECEIVE_CHUNKS);
        if (totalChunks <= 0) return;
        window.activeTransfers = window.activeTransfers || {};
        var _startFileId = packet.payload.fileId;
        var _existingTx = window.activeTransfers[_startFileId];
        if (_existingTx) {
          // CROSS-4 duplicate-START guard: a fresh sender session re-sends START
          // from chunk 0. Only replace the partial when the content hash differs;
          // otherwise keep it and let the FILE_CHUNK handler fill the gaps (it
          // skips already-defined slots), nudging the sender via RESUME.
          var _startHash = packet.payload.hash || '';
          var _oldHash = _existingTx.hash || '';
          if (_startHash && _oldHash && _startHash !== _oldHash) {
            console.warn('[P2P] START with different hash for', _startFileId, '— replacing partial');
            window.BlobStoreDB.partialDelete(_startFileId).catch(function(err) {
              console.warn('[P2P] Partial cleanup failed for', _startFileId, err);
            });
            delete window._resumeExpectedReceives[_startFileId];
          } else {
            debugLog('P2P', 'Duplicate START for in-progress transfer', _startFileId, '— keeping partial');
            if (_existingTx.received < _existingTx.total) _maybeRequestResume(_startFileId);
            return;
          }
        }
        window.activeTransfers[_startFileId] = {
          chunks: new Array(totalChunks),
          fileName: packet.payload.fileName || 'unknown',
          total: totalChunks,
          received: 0,
          senderId: msgFrom,
          // CROSS-4: full-file hash from the sender ('' when crypto is
          // unavailable) + chatId for group transfers (mirrors sender's START)
          hash: packet.payload.hash || '',
          chatId: packet.payload.chatId || '',
          // Sender-stamped metadata (mobile stamps these in FILE_TRANSFER_START).
          // Persisted so the END handler can classify voice clips (*.webm is in
          // videoMatch) correctly on the merge-fallback path.
          type: packet.payload.type || '',
          mimeType: packet.payload.mimeType || '',
          _startTime: Date.now(),
          _lastChunkTime: Date.now()
        };
        debugLog('P2P', 'Started receiving file ' + (packet.payload.fileName || '?'));
        return;
      }
      
      if (packet.type === Orbit.Protocol.Types.FILE_CHUNK) {
        if (!packet.payload || !packet.payload.fileId) return;
        window.activeTransfers = window.activeTransfers || {};
        var tx = window.activeTransfers[packet.payload.fileId];
        if (!tx && window._resumeExpectedReceives && window._resumeExpectedReceives[packet.payload.fileId]) {
          // Reaped receive with the connection still up: restore the persisted
          // partial, then re-dispatch this chunk through the normal path.
          _reopenPartialReceive(packet.payload.fileId).then(function(ok){
            if (ok) {
              delete window._resumeExpectedReceives[packet.payload.fileId];
              _handleP2PPacketData(null, packet);
            }
          });
          return;
        }
        if (tx) {
          var chunkIdx = parseInt(packet.payload.chunkIndex, 10);
          if (!isNaN(chunkIdx) && chunkIdx >= 0 && chunkIdx < tx.chunks.length) {
            if (tx.chunks[chunkIdx] === undefined) {
              // Decode ON ARRIVAL and keep bytes, not base64 text.
              //
              // Holding base64 strings cost roughly 2.7x the binary size: base64 inflates
              // 33%, and a JS string is UTF-16, so 133 MB of video sat in the heap as
              // ~356 MB of characters. The merge step at FILE_TRANSFER_END then decoded
              // every chunk into a second full copy and wrote a third. Peak was ~620 MB
              // in an Android WebView heap, which OOMs — the renderer dies, the socket
              // resets, and the sender sees ECONNRESET and retries forever.
              //
              // Storing ArrayBuffers also makes the periodic checkpoint a shallow
              // REFERENCE copy instead of duplicating every string, and removes the
              // decode loop at END entirely.
              try {
                tx.chunks[chunkIdx] = window.orbitBase64ToArrayBuffer(packet.payload.data);
              } catch (e) {
                console.warn('[P2P] chunk decode failed at', chunkIdx, e && e.message);
                tx.chunks[chunkIdx] = window.orbitBase64ToArrayBuffer(''); // keep the slot defined
              }
              tx.received++;
              // CROSS-RESTART: checkpoint the partial to IndexedDB every 50
              // newly received chunks (non-fatal on failure — resume stays
              // best-effort). The chunks object map (index→base64 for defined
              // slots only) avoids sparse-array structured-clone ambiguity.
              if (!tx._lastCheckpoint) tx._lastCheckpoint = 0;
              if (tx.received - tx._lastCheckpoint >= 50) {
                tx._lastCheckpoint = tx.received;
                var _ckMap = {};
                for (var _ckI = 0; _ckI < tx.chunks.length; _ckI++) {
                  if (tx.chunks[_ckI] !== undefined) _ckMap[String(_ckI)] = tx.chunks[_ckI];
                }
                window.BlobStoreDB.partialPut(packet.payload.fileId, {
                  fileId: packet.payload.fileId,
                  fileName: tx.fileName,
                  total: tx.total,
                  received: tx.received,
                  senderId: tx.senderId,
                  type: tx.type,
                  mimeType: tx.mimeType,
                  hash: tx.hash,
                  chatId: tx.chatId,
                  chunks: _ckMap,
                  savedAt: Date.now()
                }).then(function() {
                  console.log('[P2P] Checkpointed partial', packet.payload.fileId, tx.received + '/' + tx.total);
                }).catch(function(err) {
                  console.warn('[P2P] Partial checkpoint failed for', packet.payload.fileId, err);
                });
              }
            }
          }
          var bwLimit = MStore.settings.netBandwidthLimit || 0;
          if (bwLimit > 0 && tx.received < tx.total) {
            tx._lastChunkTime = tx._lastChunkTime || 0;
            var elapsed = Date.now() - tx._lastChunkTime;
            var _cdata = tx.chunks[chunkIdx];
            var chunkSize = (_cdata && _cdata.byteLength) ? _cdata.byteLength
                          : ((packet.payload.data || '').length * 3 / 4);
            var minInterval = Math.max(50, (chunkSize / (bwLimit * 1024)) * 1000);
            if (elapsed < minInterval && !tx._throttleScheduled) {
              tx._throttleScheduled = true;
              setTimeout(function() { if (tx) tx._throttleScheduled = false; }, Math.min(minInterval - elapsed, 1000));
            }
          }
          tx._lastChunkTime = Date.now();
          // CROSS-4: transfer still incomplete → ask the sender to skip ahead to
          // the first gap (the helper computes the true contiguous prefix; the
          // 4s cooldown keeps this cheap on out-of-order / duplicate chunks)
          if (tx.received < tx.total) _maybeRequestResume(packet.payload.fileId);
        }
        return;
      }
      
      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_END) {
        if (!packet.payload || !packet.payload.fileId) return;
        window.activeTransfers = window.activeTransfers || {};
        var txEnd = window.activeTransfers[packet.payload.fileId];
        if (!txEnd && window._resumeExpectedReceives && window._resumeExpectedReceives[packet.payload.fileId]) {
          // Reaped receive with the connection still up: restore the persisted
          // partial, then re-dispatch this chunk through the normal path.
          _reopenPartialReceive(packet.payload.fileId).then(function(ok){
            if (ok) {
              delete window._resumeExpectedReceives[packet.payload.fileId];
              _handleP2PPacketData(null, packet);
            }
          });
          return;
        }
        if (txEnd) {
          // Validate all chunks received before assembly (MSG-8)
          var allReceived = true;
          for (var ci = 0; ci < txEnd.chunks.length; ci++) {
            if (txEnd.chunks[ci] === undefined) { allReceived = false; break; }
          }
          if (!allReceived) {
            console.warn('[P2P] File transfer incomplete — missing chunks for', txEnd.fileName);
            // CROSS-4: keep the partial alive and ask the sender to resume from
            // the first gap instead of silently discarding it
            _maybeRequestResume(packet.payload.fileId);
            return;
          }
          // CRIT-1: Decode each chunk independently and concatenate ArrayBuffers
          // Desktop independently btoa()'s each 64KB binary chunk — joining as strings
          // produces corrupted base64 at every padding boundary
          // Chunks are ArrayBuffers already (decoded on arrival). Older partials
          // restored from IndexedDB may still hold base64 strings, so accept both —
          // but never build a second full copy of an ArrayBuffer chunk.
          var _totalByteLen = 0;
          var _chunkBufs = new Array(txEnd.chunks.length);
          for (var _c = 0; _c < txEnd.chunks.length; _c++) {
            var _cb = _chunkToBytes(txEnd.chunks[_c]);
            _chunkBufs[_c] = _cb;
            _totalByteLen += _cb.byteLength;
          }
          var _mergedBuf = new Uint8Array(_totalByteLen);
          var _off = 0;
          for (var _c2 = 0; _c2 < _chunkBufs.length; _c2++) {
            _mergedBuf.set(new Uint8Array(_chunkBufs[_c2]), _off);
            _off += _chunkBufs[_c2].byteLength;
          }
          // N5: verify the sender's full-file hash against the assembled bytes.
          // Non-fatal — a mismatch only warns and the file is still saved
          // (mirrors desktop's handleEnd; desktop only discards on a
          // resumed-transfer mismatch). Fire-and-forget: the async digest
          // resolves after the synchronous save path below, so it never
          // reorders or blocks it.
          if (txEnd.hash) {
            try {
              crypto.subtle.digest('SHA-256', _mergedBuf.buffer).then(function(_hashBuf) {
                var _hashHex = Array.from(new Uint8Array(_hashBuf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
                if (_hashHex.toLowerCase() !== String(txEnd.hash).toLowerCase()) {
                  console.warn('[P2P] File hash mismatch for', txEnd.fileName, '— expected', txEnd.hash, 'actual', _hashHex, '— saving anyway (non-fatal)');
                }
              }).catch(function(err) {
                console.warn('[P2P] File hash verification failed for', txEnd.fileName, err);
              });
            } catch(e) {
              console.warn('[P2P] File hash verification unavailable for', txEnd.fileName, e);
            }
          }
          var extMatch = txEnd.fileName.match(/\.(png|jpe?g|gif|webp|svg|tiff?|bmp|heic|heif|avif)$/i);
          // NOTE: .webm intentionally only in videoMatch — do NOT add to audioMatch
          var audioMatch = txEnd.fileName.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|mka)$/i);
          var videoMatch = txEnd.fileName.match(/\.(mp4|mov|avi|mkv|webm|3gp|m4v|wmv|flv|f4v|ts|mts|m2ts)$/i);
          var mimeType = 'application/octet-stream';
          var isImage = false;
          var isAudio = false;
          var isVideo = false;
          if (extMatch) {
            var extLower = extMatch[1].toLowerCase();
            if (extLower === 'svg') mimeType = 'image/svg+xml';
            else if (extLower === 'tif' || extLower === 'tiff') mimeType = 'image/tiff';
            else mimeType = 'image/' + extLower.replace('jpg','jpeg');
            isImage = true;
          } else if (videoMatch) {
            // Check video BEFORE audio — .webm is always video
            var videoExtMap = { mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', mkv: 'video/x-matroska', webm: 'video/webm', '3gp': 'video/3gpp', m4v: 'video/x-m4v', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', f4v: 'video/x-f4v', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t' };
            mimeType = videoExtMap[videoMatch[1].toLowerCase()] || 'video/mp4';
            isVideo = true;
          } else if (audioMatch) {
            var audioExtMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', opus: 'audio/opus', mka: 'audio/x-matroska' };
            mimeType = audioExtMap[audioMatch[1].toLowerCase()] || 'audio/mpeg';
            isAudio = true;
          }

          // Sender-stamped type wins over extension inference (VOICE-1):
          // voice clips are named *.webm (intentionally in videoMatch, see
          // above) — mobile stamps type:'audio' + the real mimeType in
          // FILE_TRANSFER_START. Only trust explicit image|video|audio stamps;
          // anything else (desktop senders, ''/'file') falls through to the
          // extension rules above, so genuinely-video files keep video.
          var senderType = txEnd.type || '';
          if (senderType === 'image' || senderType === 'video' || senderType === 'audio') {
            isImage = senderType === 'image';
            isVideo = senderType === 'video';
            isAudio = senderType === 'audio';
            if (txEnd.mimeType) {
              mimeType = txEnd.mimeType;
            } else if (isAudio && mimeType.indexOf('video/') === 0) {
              mimeType = 'audio/webm'; // audio-stamped .webm without mime info
            }
          }
          
          // Build blob URL from independently-decoded chunks
          var attUrl = '';
          try { attUrl = URL.createObjectURL(new Blob([_mergedBuf.buffer], { type: mimeType })); } catch(e) { attUrl = ''; }
          // Persist file data for cross-restart survival:
          // ALL files (any size) are stored as raw ArrayBuffer in IndexedDB.
          // _blobKey must be set SYNCHRONOUSLY (before _saveMsgs) so the render
          // path can show "Restoring..." after restart. The IndexedDB write is
          // fire-and-forget; if it fails, _blobKey is cleaned up in the catch.
          var blobKey = packet.payload.fileId;
          (function(key, buf) {
            window.BlobStoreDB.put(key, buf).then(function() {
              console.log('[P2P] Stored file in IndexedDB:', key, buf.byteLength + ' bytes');
            }).catch(function(err) {
              console.warn('[P2P] IndexedDB store failed for', key, err);
            });
          })(blobKey, _mergedBuf.buffer);

          // CRIT-4: Try to find existing message with matching _fileId attachment, update it instead of creating duplicate
          // Search for pending message across both chatId and msgFrom (DM chatId mismatch fix)
          var searchIds = [chatId];
          if (msgFrom && msgFrom !== chatId) searchIds.push(msgFrom);
          var found = false;
          for (var si = 0; si < searchIds.length && !found; si++) {
            var existingMsgs = MStore.getMessages(searchIds[si]);
            for (var mi = 0; mi < existingMsgs.length; mi++) {
              var atts = existingMsgs[mi].attachments;
              if (atts && Array.isArray(atts)) {
                for (var ai = 0; ai < atts.length; ai++) {
                  if (atts[ai]._fileId === packet.payload.fileId) {
                    atts[ai].url = attUrl;
                    atts[ai]._blobKey = blobKey;
                    atts[ai]._blobCreated = true; atts[ai]._blobSession = window._orbitSessionId;
                    if (!atts[ai].type || atts[ai].type === 'file') {
                      atts[ai].type = isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file'));
                    }
                    atts[ai].mimeType = mimeType;
                    atts[ai]._pending = false;
                    atts[ai].name = txEnd.fileName || atts[ai].name;
                    MStore._saveMsgs(searchIds[si]);
                    found = true;
                    break;
                  }
                }
              }
              if (found) break;
            }
          }

          if (!found) {
            // Fallback: create a new message entry if no matching _fileId found
            var ftMsgId = 'p2p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            MStore.addMessage(chatId, {
              id: ftMsgId,
              from: msgFrom,
              text: '',
              time: new Date().toISOString(),
              attachments: [{
                id: packet.payload.fileId,
                name: txEnd.fileName,
                type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
                url: attUrl,
                _blobKey: blobKey,
                _blobCreated: true, _blobSession: window._orbitSessionId,
                _fileId: packet.payload.fileId
              }]
            });
            _startDisappearTimer(chatId, ftMsgId);
          }
          
          delete window.activeTransfers[packet.payload.fileId];
          delete window._resumeExpectedReceives[packet.payload.fileId];
          window.BlobStoreDB.partialDelete(packet.payload.fileId).catch(function(err) {
            console.warn('[P2P] Partial cleanup failed for', packet.payload.fileId, err);
          });
          if (activeChatId === chatId) renderMessages(activeChatId);
          renderChatList();
          debugLog('P2P', 'Completed receiving file ' + txEnd.fileName);
        }
        return;
      }

      // CROSS-4 — SENDER side of the resume protocol: a receiver asks us to
      // continue from its contiguous prefix (lost chunks / missed END). We
      // verify the hash of the prefix it claims to hold, then rewind/advance
      // the send session's cursor; the driver loop picks it up on the next tick.
      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_RESUME) {
        if (!packet.payload || !packet.payload.fileId) return;
        window.activeSends = window.activeSends || {};
        // Sessions are keyed fileId + '::' + peer so a group fan-out (same
        // attachment.id sent to several members) keeps independent cursors;
        // fall back to a plain fileId key for robustness.
        var _sKey = packet.payload.fileId + '::' + msgFrom;
        var _sess = window.activeSends[_sKey] || window.activeSends[packet.payload.fileId];
        if (!_sess) {
          debugLog('P2P', 'RESUME for unknown fileId ' + packet.payload.fileId + ' — no send session, ignoring');
          return;
        }
        var _n = Number(packet.payload.receivedCount);
        if (!isFinite(_n) || _n < 0 || _n > _sess.total) {
          console.warn('[P2P] RESUME invalid offset', _n, 'for', packet.payload.fileId, '— cancelling');
          Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.FILE_TRANSFER_CANCEL, MStore.user ? MStore.user.id : '', msgFrom,
            { fileId: packet.payload.fileId, error: 'Invalid resume offset' }
          ));
          _sess.cancelled = true;
          return;
        }
        // F5: the session may already be done (END sent, within the 60s grace
        // period) — the receiver missed END or its partial was purged and it
        // re-requested. Re-send the stored END packet instead of resuming
        // chunks (a queued transport may have resolved while the receiver
        // never got the data).
        if (_sess.done) {
          debugLog('P2P', 'RESUME for completed session ' + packet.payload.fileId + ' — re-sending END');
          var _doneEnd = _sess.endPayload || { fileId: packet.payload.fileId, hash: _sess.hash };
          if (_sess.isGroup && _sess.chatId && !_doneEnd.chatId) _doneEnd.chatId = _sess.chatId;
          try {
            Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_END, MStore.user ? MStore.user.id : '', msgFrom,
              _doneEnd
            )).catch(function(e) {
              console.warn('[P2P] END re-send failed for', packet.payload.fileId, e);
            });
          } catch(e) {
            console.warn('[P2P] END re-send failed for', packet.payload.fileId, e);
          }
          return;
        }
        var _ab = _sess.att && _sess.att._arrayBuffer;
        if (!_ab || !_ab.byteLength) {
          console.warn('[P2P] RESUME: source buffer gone for', packet.payload.fileId, '— cancelling');
          Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.FILE_TRANSFER_CANCEL, MStore.user ? MStore.user.id : '', msgFrom,
            { fileId: packet.payload.fileId, error: 'Sender no longer has the file' }
          ));
          _sess.cancelled = true;
          return;
        }
        // Hash the first n chunks of our own file and compare (case-insensitive)
        // CHUNK_SIZE (sendMessage-local) is out of scope here; 64KB is the
        // protocol-fixed chunk size on both platforms.
        var _chunkSize = 64 * 1024;
        var _prefixBytes = Math.min(_n * _chunkSize, _ab.byteLength);
        var _prefU8 = new Uint8Array(_ab, 0, _prefixBytes);
        try {
          crypto.subtle.digest('SHA-256', _prefU8).then(function(hashBuf) {
            var _ha = Array.from(new Uint8Array(hashBuf));
            var _hex = _ha.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
            var _theirHash = String(packet.payload.hash || '').toLowerCase();
            var _match = false;
            if (_theirHash !== '') {
              _match = (_hex === _theirHash);
            } else if (_n === 0 && (!_sess.hash || _sess.hash === '')) {
              // both sides hashless + empty prefix → full re-send is safe
              _match = true;
            }
            if (_match) {
              // F5: re-send START before rewinding so a receiver whose
              // in-memory receive was reaped can re-open its persisted row
              // (desktop's handleStart resume branch keys off the row hash)
              if (_sess.startPayload) {
                debugLog('P2P', 'Re-sending START for ' + packet.payload.fileId + ' (RESUME rewind)');
                try {
                  Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
                    Orbit.Protocol.Types.FILE_TRANSFER_START, MStore.user ? MStore.user.id : '', msgFrom,
                    _sess.startPayload
                  )).catch(function(e) {
                    console.warn('[P2P] START re-send failed for', packet.payload.fileId, e);
                  });
                } catch(e) {
                  console.warn('[P2P] START re-send failed for', packet.payload.fileId, e);
                }
              }
              _sess.ci = _n;
              debugLog('P2P', 'RESUME verified for ' + packet.payload.fileId + ' — ' + (_n >= _sess.total ? 're-sending END' : 'streaming from chunk ' + _n));
              // _n >= total: the driver sends FILE_TRANSFER_END on its next tick
            } else {
              console.warn('[P2P] RESUME hash mismatch for', packet.payload.fileId, '— cancelling');
              Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
                Orbit.Protocol.Types.FILE_TRANSFER_CANCEL, MStore.user ? MStore.user.id : '', msgFrom,
                { fileId: packet.payload.fileId, error: 'Hash mismatch' }
              ));
              _sess.cancelled = true;
            }
          }).catch(function(e) {
            console.warn('[P2P] RESUME digest failed for', packet.payload.fileId, e);
            Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.FILE_TRANSFER_CANCEL, MStore.user ? MStore.user.id : '', msgFrom,
              { fileId: packet.payload.fileId, error: 'Hash verification failed' }
            ));
            _sess.cancelled = true;
          });
        } catch(e) {
          console.warn('[P2P] RESUME digest unavailable for', packet.payload.fileId, e);
          Orbit.P2P.send(msgFrom, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.FILE_TRANSFER_CANCEL, MStore.user ? MStore.user.id : '', msgFrom,
            { fileId: packet.payload.fileId, error: 'Hash verification unavailable' }
          ));
          _sess.cancelled = true;
        }
        return;
      }

      if (packet.type === Orbit.Protocol.Types.FILE_TRANSFER_CANCEL || packet.type === Orbit.Protocol.Types.FILE_TRANSFER_REJECT) {
        if (packet.payload && packet.payload.fileId) {
          // Receive side: drop the partial
          if (window.activeTransfers) {
            delete window.activeTransfers[packet.payload.fileId];
          }
          delete window._resumeExpectedReceives[packet.payload.fileId];
          window.BlobStoreDB.partialDelete(packet.payload.fileId).catch(function(err) {
            console.warn('[P2P] Partial cleanup failed for', packet.payload.fileId, err);
          });
          // Send side (CROSS-4): mark any matching send session cancelled — the
          // driver loop observes the flag and cleans the session up
          if (window.activeSends) {
            var _cancelKey = packet.payload.fileId + '::' + msgFrom;
            if (window.activeSends[_cancelKey]) window.activeSends[_cancelKey].cancelled = true;
            if (window.activeSends[packet.payload.fileId]) window.activeSends[packet.payload.fileId].cancelled = true;
          }
        }
        return;
      }

      // Handle MESSAGE_EDIT — desktop sends edited messages
      if (packet.type === Orbit.Protocol.Types.MESSAGE_EDIT) {
        var me = packet.payload || {};
        if (me.msgId && MStore.getMessages(chatId).length) {
          var msgIdx = MStore.getMessages(chatId).findIndex(function(m) { return String(m.id) === String(me.msgId); });
          if (msgIdx !== -1) {
            MStore.messages[chatId][msgIdx].text = me.newText || me.text;
            MStore.messages[chatId][msgIdx].edited = true;
            MStore._saveMsgs(chatId);
            if (activeChatId === chatId) renderMessages(chatId);
          }
        }
        return;
      }

      // ── Account transfer (Pair a desktop) ──
      // The receiver owns the whole flow: validate, decrypt, import. The packet
      // handler only routes, so the screen and the crypto stay in one place.
      if (packet.type === Orbit.Protocol.Types.TRANSFER_OFFER) {
        if (window.OrbitAccountReceive) OrbitAccountReceive.handleOffer(packet);
        return;
      }
      if (packet.type === Orbit.Protocol.Types.TRANSFER_CHUNK) {
        if (window.OrbitAccountReceive) OrbitAccountReceive.handleChunk(packet);
        return;
      }
      if (packet.type === Orbit.Protocol.Types.TRANSFER_DONE) {
        if (window.OrbitAccountReceive) OrbitAccountReceive.handleDone(packet);
        return;
      }

      // Handle READ — desktop sends read receipts
      if (packet.type === Orbit.Protocol.Types.READ) {
        var rr = packet.payload || {};
        if (rr.chatId && MStore.getMessages(rr.chatId).length) {
          var readMsgs = MStore.getMessages(rr.chatId);
          var foundIdx = -1;
          for (var ri = 0; ri < readMsgs.length; ri++) {
            if (String(readMsgs[ri].id) === String(rr.lastReadMsgId)) { foundIdx = ri; break; }
          }
          if (foundIdx >= 0) {
            for (var rj = 0; rj <= foundIdx; rj++) { if (!readMsgs[rj].read) readMsgs[rj].read = true; }
          }
          MStore._saveMsgs(rr.chatId);
        }
        return;
      }

      // Handle MESSAGE_DELETE — desktop deletes messages
      if (packet.type === Orbit.Protocol.Types.MESSAGE_DELETE) {
        var md = packet.payload || {};
        if (md.msgId && MStore.getMessages(chatId).length) {
          MStore.messages[chatId] = MStore.getMessages(chatId).filter(function(m) { return String(m.id) !== String(md.msgId); });
          MStore._saveMsgs(chatId);
          if (activeChatId === chatId) renderMessages(chatId);
        }
        return;
      }

      // Handle GROUP_CREATE — receive group from peer
      if (packet.type === Orbit.Protocol.Types.GROUP_CREATE) {
        var gc = packet.payload || {};
        if (!gc.groupId || !gc.groupName) return;
        var exists = MStore.groups.find(function(g) { return g.id === gc.groupId; });
        if (exists) return;
        MStore.groups.push({
          id: gc.groupId,
          name: gc.groupName,
          avatar: isValidAvatarUrl(gc.groupAvatar) ? gc.groupAvatar : null,
          description: gc.description || '',
          inviteCode: gc.inviteCode || '',
          pinned: false,
          notificationMuted: false,
          pinnedMessages: [],
          ownerId: gc.ownerId || msgFrom,
          members: (gc.members || [{ userId: msgFrom, role: 'owner', joinedAt: new Date().toISOString() }]).map(function(m) {
            var origin = typeof m === 'string' ? { userId: m } : m;
            var muid = origin.userId;
            var mf = MStore.friends.find(function(f) { return f.id === muid; });
            if (mf) {
              return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
            }
            return { ...origin };
          }),
          createdAt: gc.createdAt || new Date().toISOString()
        });
        var gcChatExists = MStore.chats.find(function(c) { return c.id === gc.groupId; });
        if (!gcChatExists) {
          MStore.chats.push({ id: gc.groupId, name: gc.groupName, avatar: isValidAvatarUrl(gc.groupAvatar) ? gc.groupAvatar : null, lastMessage: '', lastTime: '', unread: 0 });
        }
        MStore.save();
        renderChatList();
        showToast('Added group "' + gc.groupName + '"', 'info');
        console.log('[P2P] Group created:', gc.groupName);
        return;
      }

      // Handle GROUP_JOIN_RESPONSE — received when added to a group by desktop peer
      if (packet.type === Orbit.Protocol.Types.GROUP_JOIN_RESPONSE) {
        var gjr = packet.payload || {};
        if (gjr.accepted && gjr.groupId) {
          var gjrExists = MStore.groups.find(function(g) { return g.id === gjr.groupId; });
          if (!gjrExists) {
            var gjrMembers = (gjr.members || []).map(function(m) {
              var origin = typeof m === 'string' ? { userId: m } : m;
              var muid = origin.userId;
              var mf = MStore.friends.find(function(f) { return f.id === muid; });
              if (mf) {
                return { ...origin, name: origin.name || mf.name, username: origin.username || origin.name || mf.name, avatar: origin.avatar || mf.avatar || null };
              }
              return { ...origin };
            });
            MStore.groups.push({
              id: gjr.groupId,
              name: gjr.groupName || 'Group',
              avatar: isValidAvatarUrl(gjr.groupAvatar) ? gjr.groupAvatar : null,
              ownerId: msgFrom,
              members: gjrMembers,
              createdAt: new Date().toISOString(),
              pinnedMessages: [],
              notificationMuted: false,
              inviteCode: gjr.inviteCode || null
            });
            var gjrChatExists = MStore.chats.find(function(c) { return c.id === gjr.groupId; });
            if (!gjrChatExists) {
              MStore.chats.push({ id: gjr.groupId, name: gjr.groupName || 'Group', avatar: isValidAvatarUrl(gjr.groupAvatar) ? gjr.groupAvatar : null, lastMessage: '', lastTime: '', unread: 0 });
            }
            MStore.save();
            renderChatList();
            showToast('Joined group "' + (gjr.groupName || 'Group') + '"', 'info');
          }
        } else {
          showToast('Join request denied', 'info');
        }
        return;
      }

      // Handle GROUP_JOIN_REQUEST — a peer wants to join a group I own
      if (packet.type === Orbit.Protocol.Types.GROUP_JOIN_REQUEST) {
        var joinReq = packet.payload || {};
        if (!joinReq.inviteCode) return;
        var myId = MStore.user ? MStore.user.id : '';
        var myGroup = MStore.groups.find(function(g) {
          return g.inviteCode === joinReq.inviteCode && g.ownerId === myId;
        });
        if (myGroup) {
          // Add the requester as a member
          var newMember = {
            userId: msgFrom,
            name: joinReq.name || joinReq.username || 'Unknown',
            username: joinReq.username || joinReq.name || 'Unknown',
            avatar: joinReq.avatar || null,
            role: 'member',
            joinedAt: new Date().toISOString()
          };
          myGroup.members.push(newMember);
          MStore.save();
          
          // Send GROUP_JOIN_RESPONSE back with full group data
          if (window.Orbit && window.Orbit.P2P && Orbit.P2P.isAvailable()) {
            var respPkt = Orbit.Protocol.createPacket(
              Orbit.Protocol.Types.GROUP_JOIN_RESPONSE,
              myId, msgFrom,
              {
                groupId: myGroup.id,
                groupName: myGroup.name,
                groupAvatar: myGroup.avatar || null,
                accepted: true,
                members: myGroup.members,
                inviteCode: myGroup.inviteCode
              }
            );
            Orbit.P2P.send(msgFrom, respPkt);
            
            // Notify other members about the new member
            (myGroup.members || []).forEach(function(m) {
              if (m.userId !== myId && m.userId !== msgFrom) {
                var addedPkt = Orbit.Protocol.createPacket(
                  Orbit.Protocol.Types.GROUP_MEMBER_ADDED,
                  myId, m.userId,
                  { groupId: myGroup.id, user: newMember }
                );
                Orbit.P2P.send(m.userId, addedPkt);
              }
            });
          }
          showToast('"' + (joinReq.name || 'Someone') + '" joined "' + myGroup.name + '"', 'info');
        }
        return;
      }

      // Handle PIN_MESSAGE
      if (packet.type === Orbit.Protocol.Types.PIN_MESSAGE) {
        var pinPkt = packet.payload || {};
        var pinGroupId = pinPkt.groupId || chatId;
        var pinGroup = MStore.groups.find(function(g) { return g.id === pinGroupId; });
        if (pinGroup) {
          if (!pinGroup.pinnedMessages) pinGroup.pinnedMessages = [];
          if (!pinGroup.pinnedMessages.some(function(p) { return String(p.msgId) === String(pinPkt.msgId); })) {
            pinGroup.pinnedMessages.push({
              msgId: pinPkt.msgId,
              text: pinPkt.text || '',
              pinnedBy: msgFrom,
              pinnedAt: pinPkt.pinnedAt || new Date().toISOString()
            });
            MStore.save();
            if (activeChatId === pinGroupId) renderMessages(activeChatId);
          }
        }
        return;
      }

      // Handle UNPIN_MESSAGE
      if (packet.type === Orbit.Protocol.Types.UNPIN_MESSAGE) {
        var unpinPkt = packet.payload || {};
        var unpinGroupId = unpinPkt.groupId || chatId;
        var unpinGroup = MStore.groups.find(function(g) { return g.id === unpinGroupId; });
        if (unpinGroup && unpinGroup.pinnedMessages) {
          unpinGroup.pinnedMessages = unpinGroup.pinnedMessages.filter(function(p) { return String(p.msgId) !== String(unpinPkt.msgId); });
          MStore.save();
          if (activeChatId === unpinGroupId) renderMessages(activeChatId);
        }
        return;
      }

      // Handle GROUP_LEAVE — member left or was removed
      if (packet.type === Orbit.Protocol.Types.GROUP_LEAVE) {
        var gl = packet.payload || {};
        var leaveGroupId = gl.groupId;
        var leaveUserId = gl.userId || msgFrom;
        if (!leaveGroupId) return;
        // If I was removed, delete the group entirely
        if (leaveUserId === (MStore.user ? MStore.user.id : '')) {
          MStore.groups = MStore.groups.filter(function(g) { return g.id !== leaveGroupId; });
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== leaveGroupId; });
          if (activeChatId === leaveGroupId) closeChat();
          showToast('You were removed from the group', 'info');
        } else {
          // Remove the leaving member
          var leaveGrp = MStore.groups.find(function(g) { return g.id === leaveGroupId; });
          if (leaveGrp) {
            leaveGrp.members = (leaveGrp.members || []).filter(function(m) {
              return (typeof m === 'string' ? m : m.userId) !== leaveUserId;
            });
            var leaveFriend = MStore.friends.find(function(f) { return f.id === leaveUserId; });
            if (leaveFriend) showToast(leaveFriend.name + ' left the group', 'info');
          }
        }
        MStore.save();
        renderChatList();
        if (activeChatId === leaveGroupId) {
          var headerInfo = document.getElementById('chat-header-info');
          if (headerInfo) {
            var grpAfter = MStore.groups.find(function(g) { return g.id === leaveGroupId; });
            if (grpAfter) {
              var sd = headerInfo.querySelector('div:last-child');
              if (sd) sd.textContent = (grpAfter.members || []).length + ' members';
            }
          }
        }
        return;
      }

      // Handle GROUP_MEMBER_ADDED — new member added by admin/owner
      if (packet.type === Orbit.Protocol.Types.GROUP_MEMBER_ADDED) {
        var gm = packet.payload || {};
        var gmGroupId = gm.groupId;
        var newMember = gm.user;
        if (!gmGroupId || !newMember) return;
        var gmGrp = MStore.groups.find(function(g) { return g.id === gmGroupId; });
        if (gmGrp) {
          var alreadyMember = (gmGrp.members || []).find(function(m) { return (typeof m === 'string' ? m : m.userId) === newMember.userId; });
          if (!alreadyMember) {
            gmGrp.members = gmGrp.members || [];
            var enrichedNewMember = JSON.parse(JSON.stringify(newMember));
            var nmf = MStore.friends.find(function(f) { return f.id === (newMember.userId || newMember.id); });
            if (nmf) { enrichedNewMember.name = enrichedNewMember.name || nmf.name; enrichedNewMember.username = enrichedNewMember.username || enrichedNewMember.name; enrichedNewMember.avatar = enrichedNewMember.avatar || nmf.avatar || null; }
            gmGrp.members.push(enrichedNewMember);
            MStore.save();
            showToast((enrichedNewMember.name || enrichedNewMember.username || 'Someone') + ' was added to ' + (gmGrp.name || 'group'), 'info');
            if (activeChatId === gmGroupId) {
              var hi = document.getElementById('chat-header-info');
              if (hi) {
                var sd2 = hi.querySelector('div:last-child');
                if (sd2) sd2.textContent = gmGrp.members.length + ' members';
              }
            }
          }
        }
        return;
      }

      // Handle POLL_VOTE — group poll vote
      if (packet.type === Orbit.Protocol.Types.POLL_VOTE) {
        var votePayload = packet.payload;
        if (votePayload && votePayload.msgId && votePayload.optIndex !== undefined && votePayload.chatId) {
          var voteChatId = votePayload.chatId;
          var voteMsgs = MStore.messages[voteChatId];
          if (voteMsgs) {
            var voteMsg = voteMsgs.find(function(m) { return String(m.id) === String(votePayload.msgId); });
            if (voteMsg && voteMsg.poll && voteMsg.poll.options[votePayload.optIndex]) {
              var voteOpt = voteMsg.poll.options[votePayload.optIndex];
              if (!voteOpt.votes) voteOpt.votes = [];
              var hasExistingVote = voteOpt.votes.indexOf(packet.from || packet.senderId);
              if (hasExistingVote === -1) {
                // Remove this voter's previous vote from all other options
                voteMsg.poll.options.forEach(function(o) { o.votes = (o.votes || []).filter(function(v) { return v !== (packet.from || packet.senderId); }); });
                voteOpt.votes.push(packet.from || packet.senderId);
                MStore.save();
                if (activeChatId === voteChatId) renderMessages(voteChatId);
              }
            }
          }
        }
        return;
      }

      // Handle GROUP_OWNER_TRANSFER — ownership transferred
      if (packet.type === Orbit.Protocol.Types.GROUP_OWNER_TRANSFER) {
        var gt = packet.payload || {};
        var gtGroupId = gt.groupId;
        var newOwnerId = gt.newOwnerId;
        if (!gtGroupId || !newOwnerId) return;
        var gtGrp = MStore.groups.find(function(g) { return g.id === gtGroupId; });
        if (gtGrp) {
          gtGrp.ownerId = newOwnerId;
          MStore.save();
          var newOwnerFriend = MStore.friends.find(function(f) { return f.id === newOwnerId; });
          showToast('Ownership transferred to ' + (newOwnerFriend ? newOwnerFriend.name : 'someone'), 'info');
        }
        return;
      }

      if (packet.type === Orbit.Protocol.Types.SETTINGS_SYNC) {
        // A settings payload from another device of MINE. The sender is checked first: the
        // module validates the contents, but only this decides whether we listen at all.
        if (!window.OrbitSettingsSync) return;
        var ssMe = MStore.currentUser ? (MStore.currentUser.id || MStore.currentUser.userId) : null;
        if (!window.OrbitSettingsSync.isOwnDevice(packet.from, ssMe)) return;

        var ssRes = window.OrbitSettingsSync.apply(MStore.settings, packet.payload);
        if (!ssRes) return;   // older than what we have, or nothing usable

        MStore.settings = ssRes.settings;
        MStore.save();
        if (ssRes.changed) applyTheme(MStore.settings.theme || 'dark');
        return;
      }
    } catch(e) { console.error('[P2P] onMessage crash:', e); if (typeof showToast === 'function') showToast('P2P crash:'+_errLoc(e)+' '+e.message,'error'); }
    };
    Orbit.P2P.onMessage(_handleP2PPacketData);

    // Listen for connection failures (clean up phantom connections)
    Orbit.P2P.onConnectFailed(function(data) {
      if (!data) return;
      debugLog('P2P', 'Connection failed', { connectionId: data.connectionId, host: data.host, error: data.error });
    });
    Orbit.P2P.onSendFailed(function(data) {
      if (!data) return;
      debugLog('P2P', 'Send failed', { connectionId: data.connectionId, error: data.error });
    });

    // Listen for disconnections
    Orbit.P2P.onDisconnect(function(data) {
      if (!data) return;
      debugLog('P2P', 'Disconnected', { connectionId: data.connectionId });
      // Only show disconnected if no other connections remain (DISC-3)
      var remainingConns = Orbit.P2P.getConnections ? Orbit.P2P.getConnections() : [];
      if (remainingConns.length === 0) showConnectionStatus('disconnected', 'Disconnected');
      var friend = MStore.friends.find(function(f) { return f.connectionId === data.connectionId; });
      if (!friend && data.connectionId) {
        var discIp = data.connectionId.split(':')[0];
        friend = MStore.friends.find(function(f) { return f.ip === discIp; });
      }
      if (friend) {
        debugLog('P2P', 'Marking friend offline', { name: friend.name, id: friend.id });
        friend.status = 'offline';
        MStore.save();
        renderFriends();
        renderChatList();
        // Auto-reconnect if enabled
        if (MStore.settings.netAutoReconnect !== false && friend.ip) {
          debugLog('P2P', 'Auto-reconnect scheduled in 5s for ' + friend.name);
          var reconnectDelay = (MStore.settings.netReconnectInterval || 10) * 1000;
          var _savedId = friend.id, _savedIp = friend.ip, _savedTcpPort = friend.tcpPort || MStore.settings.tcpPort || 46000, _savedName = friend.name;
          setTimeout(function() {
            var curFriend = MStore.friends.find(function(f) { return f.id === _savedId; });
            if (curFriend && curFriend.status === 'offline') {
              var tcpPort2 = _savedTcpPort;
              debugLog('P2P', 'Auto-reconnecting to ' + _savedName + ' at ' + _savedIp + ':' + tcpPort2 + ' (delay=' + (reconnectDelay / 1000) + 's)');
              var timeoutMs = (MStore.settings.netTimeout || 30) * 1000;
              Orbit.P2P.connect(_savedIp, tcpPort2, _savedId, timeoutMs).then(function(r) {
                if (r.success) debugLog('P2P', 'Auto-reconnect OK', { name: _savedName, connectionId: r.connectionId });
                else debugLog('P2P', 'Auto-reconnect failed for ' + _savedName, { error: r.error });
              });
            }
          }, reconnectDelay);
        }
      } else {
        debugLog('P2P', 'No friend found for disconnected ID', { id: data.connectionId });
      }
    });

    // Listen for peers found via discovery
    // Periodic offline status check
    window._offlineCheckInterval = setInterval(function() {
      var now = Date.now();
      MStore.friends.forEach(function(f) {
        if (f.status === 'online' && f.lastSeen && now - f.lastSeen > 45000) { f.status = 'offline'; }
      });
      MStore.save();
      renderFriends();
      renderChatList();
    }, 15000);

    Orbit.P2P.onPeerFound(function(data) {
      if (!data || !data.host) {
        debugLog('P2P', 'onPeerFound called with invalid data', data);
        return;
      }
      debugLog('P2P', 'Peer found via discovery', { host: data.host, beaconType: typeof data.beacon });
      debugLog('P2P', 'Raw beacon string', typeof data.beacon === 'string' ? data.beacon : JSON.stringify(data.beacon));

      // Parse beacon — Java plugin sends it as a JSON string
      var beacon;
      try {
        beacon = typeof data.beacon === 'string' ? JSON.parse(data.beacon) : data.beacon;
      } catch(e) {
        debugLog('P2P', 'Failed to parse beacon JSON from ' + data.host, { raw: typeof data.beacon === 'string' ? data.beacon.substring(0, 300) : String(data.beacon).substring(0, 300), error: e.message });
        return;
      }
      if (!beacon) {
        debugLog('P2P', 'Empty beacon from', data.host);
        return;
      }

      var peerId = beacon.from || beacon.senderId;
      if (!peerId) {
        debugLog('P2P', 'Beacon missing from/senderId', beacon);
        return;
      }
      var pPayload = beacon.payload || beacon;
      var peerName = pPayload.username || pPayload.name || data.host;
      var peerTag = pPayload.usertag || pPayload.tag || '';

      // Filter out own beacon
      if (MStore.user && peerId === MStore.user.id) {
        debugLog('P2P', 'Ignoring own beacon from', data.host);
        return;
      }

      debugLog('P2P', 'Discovered peer', { id: peerId, name: peerName, host: data.host, device: pPayload.device || '?' });

      // Add or update friend — with peer merging (Bug #2)
      var existing = MStore.friends.find(function(f) { return f.id === peerId; });
      // Also search by IP to catch host:port-based peers
      if (!existing && data.host) {
        var ipFriend = MStore.friends.find(function(f) { return f.ip === data.host; });
        if (ipFriend) {
          debugLog('P2P', 'Merging friend by IP: ' + ipFriend.id + ' → ' + peerId, { name: peerName });
          // Move messages from old chat to new chat
          var oldChatId = ipFriend.id;
          if (oldChatId !== peerId) {
            if (MStore.messages[oldChatId] && MStore.messages[oldChatId].length) {
              var existingMsgs = MStore.getMessages(peerId);
              var mergedMsgs = (MStore.messages[oldChatId] || []).map(function(m) {
                var clone = JSON.parse(JSON.stringify(m));
                if (clone.from === oldChatId) clone.from = peerId;
                return clone;
              });
              MStore.messages[peerId] = existingMsgs.concat(mergedMsgs);
              MStore._saveMsgs(peerId);
              delete MStore.messages[oldChatId];
              OrbitKeys.remove('msg_' + oldChatId);
            }
            // Remove old chat
            MStore.chats = MStore.chats.filter(function(c) { return c.id !== oldChatId; });
          }
          // Upgrade friend ID
          ipFriend.id = peerId;
          ipFriend.name = peerName;
          ipFriend.tag = peerTag;
          ipFriend.status = 'online';
          ipFriend.lastSeen = Date.now();
          ipFriend.ip = data.host;
          if (pPayload.avatar) ipFriend.avatar = pPayload.avatar;
          if (pPayload.publicKey) _setPeerKey(ipFriend, pPayload.publicKey);
          if (pPayload.tcpPort) ipFriend.tcpPort = pPayload.tcpPort;
          existing = ipFriend;
        }
      }
      if (!existing) {
        debugLog('P2P', 'Adding new friend from beacon', { name: peerName, id: peerId });
        MStore.friends.push({
          id: peerId,
          name: peerName,
          tag: peerTag,
          status: 'online',
          avatar: pPayload.avatar || null,
          bio: pPayload.bio || '',
          ip: data.host,
          tcpPort: pPayload.tcpPort || null,
          publicKey: pPayload.publicKey || null,
          profileFrame: pPayload.profileFrame !== undefined ? pPayload.profileFrame : null,
          banner: pPayload.banner || null
        });
        MStore.save();
        renderFriends();
      } else {
        debugLog('P2P', 'Updating existing friend status', { name: existing.name, id: peerId });
        existing.status = 'online';
        existing.lastSeen = Date.now();
        existing.name = peerName;
        existing.tag = peerTag;
        existing.ip = data.host;
        if (pPayload.avatar !== undefined) existing.avatar = pPayload.avatar;
        if (pPayload.bio !== undefined) existing.bio = pPayload.bio;
        if (pPayload.publicKey) _setPeerKey(existing, pPayload.publicKey);
        if (pPayload.profileFrame !== undefined) existing.profileFrame = pPayload.profileFrame;
        if (pPayload.banner !== undefined) existing.banner = pPayload.banner;
        if (pPayload.tcpPort) existing.tcpPort = pPayload.tcpPort;
        MStore.save();
        renderFriends();
        renderChatList();
      }
      refreshProfileOverlay(peerId);

      // Ensure chat exists (avoid duplicates from host:port→UUID merge)
      var chatExists = MStore.chats.find(function(c) { return c.id === peerId; });
      if (!chatExists) {
        debugLog('P2P', 'Creating chat for new peer', { name: peerName, id: peerId });
        MStore.chats.push({ id: peerId, name: peerName, lastMessage: '', lastTime: '', unread: 0, avatar: pPayload.avatar || null });
        MStore.save();
        renderChatList();
      } else {
        // Clean up any orphan chats from host:port ID (Bug #2) — match by endpoint,
        // never by name (name-matching can delete another peer's chat + history).
        var ipChat = null;
        if (data.host) {
          ipChat = MStore.chats.find(function(c) {
            return c.id !== peerId &&
                   c.id.indexOf(data.host + ':') === 0 &&
                   !(MStore.groups || []).some(function(g) { return (g.id || g.groupId) === c.id; });
          });
        }
        if (ipChat) {
          debugLog('P2P', 'Removing orphan chat: ' + ipChat.id);
          MStore.chats = MStore.chats.filter(function(c) { return c.id !== ipChat.id; });
          delete MStore.messages[ipChat.id];
          OrbitKeys.remove('msg_' + ipChat.id);
          MStore.save();
          renderChatList();
        }
      }

      // Mirror the peer's avatar onto their DM record so the DMs tab shows it
      if (syncFriendAvatar(peerId)) { MStore.save(); renderChatList(); }

      // Auto-connect to peer (skip if already connected) (Bug #2)
      window._p2pConnecting = window._p2pConnecting || {};
      if (window._p2pConnecting[peerId]) { debugLog('P2P', 'Already connecting to ' + peerName + ', skipping'); return; }
      var existingConn = Orbit.P2P.isPeerConnected(peerId) || Orbit.P2P.isPeerConnected(data.host);
      debugLog('P2P', 'Checking connection status for ' + peerName, { connected: !!existingConn });
      if (!existingConn) {
        var port = pPayload.tcpPort || 46000;
        debugLog('P2P', 'Auto-connecting to ' + peerName + ' at ' + data.host + ':' + port);
        window._p2pConnecting[peerId] = true;
        Orbit.P2P.connect(data.host, port, peerId).then(function(result) {
          delete window._p2pConnecting[peerId];
          if (result.success) {
            debugLog('P2P', 'Connected to', { name: peerName, id: peerId, connectionId: result.connectionId });
            var friend = MStore.friends.find(function(f) { return f.id === peerId; });
            if (friend) {
              friend.status = 'online';
              friend.lastSeen = Date.now();
              if (result.connectionId && result.connectionId !== friend.connectionId) friend.connectionId = result.connectionId;
              MStore.save();
              renderFriends();
              renderChatList();
            }
          } else {
            debugLog('P2P', 'Connection to ' + peerName + ' failed', { error: result.error });
          }
        });
      } else {
        debugLog('P2P', 'Already connected to ' + peerName + ', skipping');
      }
    });
  }

  /* -- Android Hardware Back Button -- */
  document.addEventListener('backbutton', function(e) {
    e.preventDefault();
    // Close overlays in reverse priority
    if (emojiPickerOpen) {
      closeEmojiPicker();
      return;
    }
    if (_settingsOverlayOpen) {
      if (_settingsInSection) {
        backSettingsOverview();
      } else {
        hideSettingsOverlay();
      }
      return;
    }
    var galleryBackdrop = document.getElementById('gallery-overlay-backdrop');
    if (galleryBackdrop.style.display === 'block') {
      hideGallery();
      return;
    }
    var membersBackdrop = document.getElementById('members-overlay-backdrop');
    if (membersBackdrop.style.display === 'block') {
      hideGroupInfo();
      return;
    }
    var profileBackdrop = document.getElementById('profile-overlay-backdrop');
    if (profileBackdrop.style.display === 'block') {
      hideProfile();
      return;
    }
    var chatPanel = document.getElementById('panel-chat');
    if (chatPanel.classList.contains('open')) {
      closeChat();
      return;
    }
    // If no overlays open, minimize the app
    if (navigator.app && navigator.app.exitApp) {
      navigator.app.exitApp();
    }
  }, false);

  /* -- Keyboard handling (mobile) -- */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function() {
      var panel = document.getElementById('panel-chat');
      if (panel && panel.classList.contains('open')) {
        panel.style.height = window.visualViewport.height + 'px';
        var input = document.getElementById('chat-input');
        if (input === document.activeElement) {
          setTimeout(function() {
            input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }, 100);
        }
      }
    });
  }

  // Blur active element after touch to prevent persistent focus ring
  // (Skip inputs/textareas so the keyboard stays open while typing)
  document.addEventListener('touchend', function(e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target.closest('input, textarea, select')) return;
    // ⚠ `.dropup-item` was in this list and no longer exists — the "+" opens the
    // attach sheet now. Replaced by its controls rather than just deleted: this
    // list is what stops a tap blurring the composer, and the sheet's tiles and
    // pills are exactly the kind of control it is for.
    if (e.target.closest('button, [role="button"], .btn, .chat-row, .friend-row, .nav-btn, .settings-row, .settings-toggle, .profile-upload-btn, .modal-btn, .msg-action-btn, .attach-tile, .attach-pill, .attach-row, .create-group-btn, label, .search-btn, .poll-option')) {
      setTimeout(function() {
        var active = document.activeElement;
        if (active && active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && active.tagName !== 'SELECT') {
          active.blur();
        }
      }, 150);
    }
  });

  /* -- Apply saved settings -- */
  applyTheme(MStore.settings.theme || 'dark');
  applyBgPattern();
  applyAnimationSettings();
  applyClassicBubbles();
  document.documentElement.setAttribute('data-bubbles', MStore.settings.messageBubbles || 'Modern');

  // Listen for OS theme changes in system mode
  var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', function() {
    if (MStore.settings.theme === 'system') {
      applyTheme('system');
    }
  });

  /* -- App lifecycle handlers for background execution -- */
  (function() {
    // Reliable app background state — used by showIncomingNotification
    // instead of document.hidden which is unreliable in Capacitor WebView
    window._appIsBackgrounded = false;

    // Seed the native avatar cache once the store has settled, so a notification
    // arriving after a cold start in the background still has a face to show.
    setTimeout(pushPeerAvatarsToNative, 4000);

    // Request battery optimization exemption (user prompt)
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
        var p = window.Capacitor.Plugins.OrbitP2P;
        if (p.requestIgnoreBatteryOptimizations) p.requestIgnoreBatteryOptimizations();
      }
    } catch(e) { console.log('[Lifecycle] Battery opt request skipped', e.message); }

    async function _foregroundRecovery() {
      renderFriends();
      renderChatList();
      if (activeChatId) renderMessages(activeChatId);
      if (!window.Orbit || !window.Orbit.P2P) return;
      // Re-hydrate JS connection state from native service
      try { if (Orbit.P2P.refreshConnections) await Orbit.P2P.refreshConnections(); } catch(e) { console.warn('[Lifecycle] refreshConnections failed', e); }
      // Restart TCP server if it was killed (native is idempotent)
      var tcpPort = MStore.settings.tcpPort || 46000;
      Orbit.P2P.startServer(tcpPort);
      // Restart discovery if inactive
      if (!Orbit.P2P.isDiscoveryActive()) {
        var beacon = buildBeacon();
        var udpPort = MStore.settings.udpPort || 45678;
        Orbit.P2P.startDiscovery(beacon, udpPort);
      }
      // Stop all media players and exit fullscreen on foreground (fixes blank black screen)
      try {
        if (window.OrbitVideoPlayer) {
          window.OrbitVideoPlayer.exitAllFullscreen();
          window.OrbitVideoPlayer.stopAll();
        }
        if (window.OrbitAudioPlayer) {
          window.OrbitAudioPlayer.stopAll();
        }
      } catch(e) { console.log('[Lifecycle] stopMedia error:', e.message); }
    }

    // Handle visibility changes
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        console.log('[Lifecycle] App foregrounded (visibility)');
        _foregroundRecovery();
        // Flush any queued notifications that arrived while backgrounded
        flushPendingNotifications();
      } else {
        // Stop all media when going to background
        try {
          if (window.OrbitVideoPlayer) window.OrbitVideoPlayer.stopAll();
          if (window.OrbitAudioPlayer) window.OrbitAudioPlayer.stopAll();
        } catch(e) {}
      }
    });

    // Foreground/background, straight from the native plugin.
    //
    // This is the primary signal now. The block below relies on the Capacitor App
    // plugin, which is NOT installed — so its guard was always false, the listener
    // never registered, and _appIsBackgrounded stayed false forever. That also meant
    // the native side was never told we had backgrounded, which is what gated its
    // background notification path. OrbitP2PPlugin.registerLifecycle() now watches
    // the activity lifecycle itself and emits this event.
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P
          && typeof window.Capacitor.Plugins.OrbitP2P.addListener === 'function') {
        window.Capacitor.Plugins.OrbitP2P.addListener('foreground', function(data) {
          var active = !!(data && data.isForeground);
          window._appIsBackgrounded = !active;
          if (active) {
            _foregroundRecovery();
            flushPendingNotifications();
            // Anything queued while we were away may be deliverable now.
            if (window.OrbitOutbox) OrbitOutbox.flush();
          } else {
            // Last guaranteed moment the WebView is running: give the native
            // layer the avatars its background notifications will need.
            pushPeerAvatarsToNative();
          }
        });
      }
    } catch (e) {
      console.log('[Lifecycle] native foreground listener unavailable:', e && e.message);
    }

    // Handle Capacitor appStateChange — this is the RELIABLE way to detect
    // foreground/background on Android (unlike document.hidden)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      try {
        window.Capacitor.Plugins.App.addListener('appStateChange', function(state) {
          window._appIsBackgrounded = !state.isActive;
          // Inform native plugin so it can post notifications directly
          // (JS WebView may be paused in background, making LocalNotifications.schedule() unreliable)
          try {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OrbitP2P) {
              window.Capacitor.Plugins.OrbitP2P.setForeground({ isForeground: state.isActive });
              // Let the native side identify us, so it can tell an @mention apart
              // from an ordinary message even while the WebView is paused.
              window.Capacitor.Plugins.OrbitP2P.setIdentity({ userId: (MStore.user && MStore.user.id) || '' });
            }
          } catch(e2) { console.log('[Lifecycle] setForeground error', e2.message); }
          if (state.isActive) {
            console.log('[Lifecycle] App foregrounded (capacitor)');
            _foregroundRecovery();
            // Flush any queued notifications that arrived while backgrounded
            flushPendingNotifications();
          } else {
            console.log('[Lifecycle] App backgrounded — service keeps running');
            MStore.save();
            // Auto-backup vault silently when the app goes to background (if enabled)
            if (MStore.settings && MStore.settings.vaultAutoBackup && !window._vaultExportRunning) {
              // runVaultExport is async, so a sync try/catch cannot catch its
              // rejections. Attach to the promise instead.
              var _autoBackup = runVaultExport(false);
              if (_autoBackup && typeof _autoBackup.catch === 'function') {
                _autoBackup.catch(function(e) { console.warn('[Vault] auto-backup error:', e); });
              }
            }
            // Stop all media when going to background
            try {
              if (window.OrbitVideoPlayer) window.OrbitVideoPlayer.stopAll();
              if (window.OrbitAudioPlayer) window.OrbitAudioPlayer.stopAll();
            } catch(e) {}
          }
        });
      } catch(e) { console.log('[Lifecycle] App plugin listener error', e.message); }
    }

    // On page show
    window.addEventListener('pageshow', function() {
      console.log('[Lifecycle] Page shown');
      renderFriends();
      renderChatList();
      if (activeChatId) renderMessages(activeChatId);
    });
  })();

  function _errLoc(e) {
    if (e && e.stack) {
      var m = e.stack.match(/(?:\s+at\s+(?:\S+\s+)?\(?)([^:]+):(\d+):(\d+)\)?/);
      if (m) return (m[1].split('\\').pop().split('/').pop()) + ':' + m[2] + ':' + m[3];
    }
    return '';
  }

  /* -- Init -- */
  debugLog('P2P', 'App initialization starting');
  try { initEmojiPicker(); } catch(e) { console.error('[Orbit] initEmojiPicker error:', e); showToast('emoji:'+_errLoc(e)+' '+(e.message||e),'error'); }

  // Process static HTML icons (nav, headers, etc.)
  if (typeof lucide !== 'undefined' && renderLucide) {
    try {
      renderLucide();
      console.log('[Orbit] Lucide icons rendered');
    } catch(e) {
      console.warn('[Orbit] Lucide render error:', e);
    }
  } else {
    console.warn('[Orbit] Lucide not loaded — icons missing');
    showToast('Icons not loaded — check console', 'info');
  }

  var initSteps = [
    { name: 'P2P', fn: initP2P },
    { name: 'ChatList', fn: renderChatList },
    { name: 'Friends', fn: renderFriends },
    { name: 'Settings', fn: renderSettings },
    { name: 'Activity', fn: renderActivity },
    { name: 'MessageSwipe', fn: setupMessageSwipe }
  ];

  initSteps.forEach(function(step) {
    try {
      step.fn();
    } catch(e) {
      var msg = e && e.message ? e.message : String(e);
      console.error('[Orbit] Init error in ' + step.name + ':', e);
      showToast(step.name+':'+_errLoc(e)+' '+msg, 'error');
    }
  });

  // Init debug overlay
  updateDebugOverlay();

  // Restore dev mode on restart: if user had devMode enabled before restart,
  // re-init eruda, data attribute, P2P log button, and log buffer
  if (MStore.settings.devMode) {
    document.documentElement.setAttribute('data-dev-mode', 'true');
    if (!window.eruda) {
      var sc = document.createElement('script');
      sc.src = 'https://cdn.jsdelivr.net/npm/eruda';
      sc.onload = function() { eruda.init(); };
      sc.onerror = function() { /* chrome://inspect fallback */ };
      document.body.appendChild(sc);
    } else {
      eruda.init();
    }
    if (!document.getElementById('p2p-log-btn')) {
      var btn = document.createElement('button');
      btn.id = 'p2p-log-btn';
      btn.textContent = 'P2P Log';
      btn.style.cssText = 'position:fixed;bottom:100px;right:16px;z-index:99998;background:#0a0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-family:monospace;cursor:pointer;opacity:0.85;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
      btn.addEventListener('click', showLogOverlay);
      document.body.appendChild(btn);
    }
    renderLogBuffer();
  }

  // Init compact spacing from saved preference
  if (MStore.settings.experimentalCompactSpacing) {
    document.documentElement.setAttribute('data-compact-spacing', 'true');
  } else {
    document.documentElement.removeAttribute('data-compact-spacing');
  }

  // Init font size
  applyFontSize();

  // Init experimental data attributes
  var expAttrs = {
    'experimentalAnimatedAvatars': 'data-exp-avatars',
    'messageFx': 'data-exp-fx',
    'enableCustomColors': 'data-exp-colors',
    'profileFrames': 'data-exp-frames',
    'experimentalFpsMonitor': 'data-exp-fps',
    'experimentalDevOverlay': 'data-exp-dev-overlay',
    'experimentalPerformanceMode': 'data-perf-mode'
  };
  Object.keys(expAttrs).forEach(function(key) {
    if (MStore.settings[key]) document.documentElement.setAttribute(expAttrs[key], 'true');
    else document.documentElement.removeAttribute(expAttrs[key]);
  });

  // Resume FPS monitor / dev overlay after reload if they were enabled
  if (MStore.settings.experimentalFpsMonitor) toggleFpsMonitor(true);
  if (MStore.settings.experimentalDevOverlay) toggleDevOverlay(true);

  // Auto-delete attachments timer
  function runAutoDelete() {
    var interval = parseInt(MStore.settings.deleteAttachmentsAfter, 10);
    if (interval > 0) {
      var cutoff = Date.now() - interval * 60 * 1000;
      var chatIds = [];
      OrbitKeys.list('msg_').forEach(function(id) { chatIds.push(id); });
      chatIds.forEach(function(chatId) {
        var msgs = MStore.getMessages(chatId);
        if (!msgs) return;
        var changed = false;
        msgs.forEach(function(m) {
          if (m.attachments && m.attachments.length > 0) {
            var msgTime = new Date(m.time).getTime();
            if (msgTime < cutoff) {
              m.attachments = [];
              changed = true;
            }
          }
        });
        if (changed) MStore._saveMsgs(chatId);
      });
    }
    if (interval > 0) setTimeout(runAutoDelete, interval * 60 * 1000);
  }
  runAutoDelete();

  // Create scheduled messages badge on send button
  (function() {
    var sendBtn = document.getElementById('btn-send');
    if (sendBtn) {
      var badge = document.createElement('span');
      badge.id = 'scheduled-badge';
      sendBtn.style.position = 'relative';
      sendBtn.appendChild(badge);
    }
  })();
  updateSendButton();

  showToast('Orbit Mobile ready', 'info');

  // Throttled "new version available" check — silent, delayed, and a no-op if
  // the app checked in the last 6h or the user skipped that version.
  if (window.UpdateNotice) window.UpdateNotice.init();

  // Attempt immersive mode on Android
  if (Orbit.env.isAndroid) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
        window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: true });
      }
    } catch(e) {}
  }

  // ⚠ ONE PERMISSION PASS, AND ONLY FOR WHAT IS MISSING.
  //
  // This spot used to do three things, none of which could read the current
  // state — so a permission that was already granted was asked for again on
  // every single launch:
  //
  //   1. requestNotificationPermission() — unconditionally, every start.
  //   2. a click listener that called Notification.requestPermission().
  //   3. getUserMedia({video:true}) then stopping the tracks, purely to provoke
  //      the camera dialog. The camera indicator lit up on EVERY start, whether
  //      or not the user was about to scan anything.
  //
  // OrbitPermissionGate reads the real state first and asks only for what is
  // missing, once per version, in a sheet that says what each one is for before
  // the system dialog appears. If everything is already granted it does nothing
  // at all — no sheet, no dialog, no camera.
  try {
    if (window.OrbitPermissionGate) window.OrbitPermissionGate.maybeAsk();
  } catch (e) {
    console.warn('[Startup] permission pass failed', e);
  }

  console.log('[Orbit Mobile] Started');
});
