// mobile/src/js/store.js
// Orbit Mobile — Data Store
// Ported from desktop Store class with full MStore backward compatibility

class Store {
  constructor(initialState = {}) {
    // ── Account ──
    // Which identity's data this store is currently reading. null means "no
    // account yet", which reads the un-prefixed keys — exactly the pre-v0.8.1
    // layout. See initAccounts().
    this.accountId = null;

    // ── Data properties (direct access, backward compat with MStore) ──
    this.friends = [];
    this.chats = [];
    this.groups = [];
    this.messages = {};
    this.blockedUsers = [];
    this.user = null;
    this.settings = {
      theme: 'dark',
      enterToSend: false,
      swipeToReply: true,
      privacyMode: false,
      e2eeEnabled: false,
      timeFormat24: true,
      messageBubbles: 'Modern',
      showChatAvatars: true,
      showImagePreviews: true,
      showLinkPreviews: true,
      bgPattern: 'None',
      animations: true,
      animSpeed: 'normal',
      reduceMotion: false,
      devMode: false,
      debugDisplay: false,
      showMessageIds: false,
      logNetworkPackets: false,
      showConnectionStats: false,
      enableExperimental: false,
      profileFrames: true,
      // Automatic "is there a newer Orbit?" check. Off means no network
      // contact at all; Settings → About's manual check still works.
      updateCheckEnabled: true,
      experimentalAnimatedAvatars: false,
      messageFx: false,
      experimentalFolders: false,
      messageTranslate: true,
      experimentalCompactSpacing: false,
      enableCustomColors: false,
      experimentalPerformanceMode: false,
      notifyPreview: true,
      notifySound: true,
      notifyVolume: 80,
      notifySoundType: 'chime',
      notifyDnd: false,
      notifyGroupMentions: false,
      translateTargetLang: '',
      autoDetectSource: true,
      deleteAttachmentsAfter: 0,
      networkMode: 'LAN Auto-Discovery',
      udpPort: 45678,
      tcpPort: 46000,
      maxFileSize: 500,
      fontSize: 'Medium',
      messageAnim: 'slide',
      netAutoReconnect: true,
      netReconnectInterval: 10,
      netTimeout: 30,
      netKeepAlive: 30,
      webrtcFallback: true,
      logLevel: 'None',
      netBandwidthLimit: 0,
      experimentalFpsMonitor: false,
      experimentalDevOverlay: false,
      mutedChats: {},      // stored inside settings for backward compat (app.js uses MStore.settings.mutedChats)
      noFlashbang: false,
      appZoom: 100,
      // The app version whose permission pass was last shown. Set by
      // components/permission-gate.js so a user who denied something is asked
      // once per release rather than on every launch. It has to live here, in
      // the defaults: load() RESETS settings rather than merging, so a key that
      // is not declared would be dropped on the next boot and the sheet would
      // reappear forever.
      permissionsAskedVersion: '',
      ...initialState.settings
    };

    // Pristine settings, captured before anything can merge over them.
    //
    // load() has to reset to THESE rather than reusing whatever is already on the
    // instance. It used to do `Object.assign({}, this.settings, saved)` — so on a
    // switch or a create, an account with no saved settings of its own inherited
    // the previous account's wholesale (theme, bubbles, E2EE, the lot). Deep-copied
    // because `mutedChats` is a nested object and this.mutedChats aliases it.
    this._settingsDefaults = JSON.parse(JSON.stringify(this.settings));

    // ── Chat Folders ──
    this.chatFolders = {};      // { "folderId": { id, name, icon, chatIds: [] } }
    this.chatFolderOrder = [];  // ["folderId1", "folderId2"] — ordered display

    // ── Desktop-style state extras ──
    this.unreadCounts = {};
    this.mentionCounts = {};
    this.lastReadIds = {};
    this.pinnedMessages = {};
    this.closedDMs = {};
    this.pinnedDMs = {};
    this.peerPublicKeys = {};
    this.activeChatId = null;
    this.activeView = 'chats';
    this.activityLog = [];
    this.activityClearedAt = 0;
    this.systemLogClearedAt = 0;
    this.transferProgress = {};
    this.transferErrors = {};
    this.scheduledMessages = [];

    // ── Listeners (subscribe/notify) ──
    this.listeners = [];

    // Sync any initial state
    Object.assign(this, initialState);

    // this.mutedChats aliases this.settings.mutedChats for desktop-style code
    this.mutedChats = this.settings.mutedChats;
  }

  // ════════════════════════════════════════════
  // Accounts
  //
  // Multi-account works by namespacing the storage keys. Everything the store
  // owns goes through get()/set(), so prefixing there covers friends, chats,
  // groups, messages, settings and the user record in one place.
  //
  // It does NOT cover the ~15 sites outside this class that write `orbit_*`
  // directly (drafts, the E2EE keypair, the vault backup, the outbox). Those are
  // swept onto window.OrbitKeys — see the note on it below.
  //
  // Layout:
  //   orbit_accounts         registry          (raw, never namespaced)
  //   orbit_active_account   which one is live (raw)
  //   orbit_acct_<id>_<key>  everything else
  // ════════════════════════════════════════════

  /** Storage prefix for the active account. '' before the first account exists. */
  _ns() {
    return this.accountId ? 'acct_' + this.accountId + '_' : '';
  }

  /** Raw access that ignores the namespace — for the registry only. */
  _rawGet(key, fallback) {
    try { var d = JSON.parse(localStorage.getItem('orbit_' + key)); return d !== null ? d : fallback; }
    catch (e) { return fallback; }
  }
  _rawSet(key, val) {
    try { localStorage.setItem('orbit_' + key, JSON.stringify(val)); } catch (e) {}
  }
  _rawRemove(key) {
    try { localStorage.removeItem('orbit_' + key); } catch (e) {}
  }

  /** All accounts, most recently used first. */
  listAccounts() {
    var reg = this._rawGet('accounts', null);
    return Array.isArray(reg) ? reg : [];
  }

  activeAccount() {
    var id = this.accountId;
    var list = this.listAccounts();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }

  _recordFromUser(user, id) {
    if (!user) return null;
    return {
      id: id || user.id || user.userId,
      name: user.name || 'User',
      tag: user.tag || '',
      avatar: user.avatar || null,
      status: user.status || 'offline',
      createdAt: user.createdAt || new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };
  }

  /**
   * Decide which account we are, and adopt the legacy single-account keys on
   * first run under the new scheme.
   */
  initAccounts() {
    var reg = this._rawGet('accounts', null);
    if (!Array.isArray(reg)) {
      var legacyUser = this._rawGet('user', null);
      var id = (legacyUser && (legacyUser.id || legacyUser.userId)) ||
               ('a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5));

      var moved = this._migrateLegacyInto(id);
      var rec = this._recordFromUser(legacyUser, id) ||
                { id: id, name: 'User', tag: '', avatar: null, status: 'online',
                  createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString() };
      reg = [rec];
      this._rawSet('accounts', reg);
      this._rawSet('active_account', id);
      console.log('[Store] Adopted ' + moved + ' legacy key(s) into account ' + id);
    }
    if (!reg.length) { this.accountId = null; return reg; }

    var active = this._rawGet('active_account', null);
    var found = false;
    for (var i = 0; i < reg.length; i++) if (reg[i].id === active) found = true;
    this.accountId = found ? active : reg[0].id;
    return reg;
  }

  /**
   * Copy every un-namespaced `orbit_*` key into <id>'s namespace.
   *
   * The originals are deliberately LEFT IN PLACE. Copy, verify, and only then
   * clean up — in a later release. Losing someone's message history to a bad
   * migration is unrecoverable, and the storage here is small enough that
   * carrying a duplicate for one release is cheap insurance.
   */
  _migrateLegacyInto(id) {
    var prefix = 'acct_' + id + '_';
    var bare = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('orbit_') !== 0) continue;
        var b = k.substring(6);
        if (b === 'accounts' || b === 'active_account') continue;
        if (b.indexOf('acct_') === 0) continue;   // already namespaced
        bare.push(b);
      }
    } catch (e) { return 0; }

    var moved = 0;
    bare.forEach(function(b) {
      var v = localStorage.getItem('orbit_' + b);
      if (v === null) return;
      try { localStorage.setItem('orbit_' + prefix + b, v); moved++; } catch (e) {}
    });
    return moved;
  }

  /** Create a fresh, empty account and switch to it. */
  createAccount() {
    this.save();  // flush the current account before we change namespace
    var id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    var reg = this.listAccounts();
    reg.push({
      id: id, name: 'New account', tag: '', avatar: null, status: 'online',
      createdAt: new Date().toISOString(), lastUsedAt: new Date().toISOString()
    });
    this._rawSet('accounts', reg);
    this.accountId = id;
    this._rawSet('active_account', id);
    this.load();      // empty namespace → load() generates a default identity
    this.syncAccountRecord();
    this.notify(this.getState());
    return id;
  }

  /** Switch to another account. Returns false when nothing changed. */
  switchAccount(id) {
    if (!id || id === this.accountId) return false;
    var list = this.listAccounts();
    var found = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) found = list[i];
    if (!found) return false;

    this.save();                  // persist what the outgoing account was doing
    this.accountId = id;
    this._rawSet('active_account', id);
    this.load();                  // everything now reads from the new namespace
    this.touchAccount(id);
    this.notify(this.getState());
    return true;
  }

  /**
   * Keep the registry's copy of a profile in step with the account's own.
   * save() runs constantly, so this only writes when a displayed field actually
   * changed — otherwise every unrelated save would rewrite the registry.
   */
  syncAccountRecord() {
    if (!this.accountId || !this.user) return;
    var reg = this.listAccounts();
    var u = this.user;
    var name = u.name || 'User', tag = u.tag || '', avatar = u.avatar || null;
    // The frame lives in settings, not on the user record, so it has to be
    // copied across or the switcher cannot show it for an account that is not
    // the active one.
    var frame = (this.settings && this.settings.profileFrames)
      ? (parseInt(this.settings.profileFrame, 10) || 0) : 0;
    var changed = false;
    for (var i = 0; i < reg.length; i++) {
      if (reg[i].id !== this.accountId) continue;
      if (reg[i].name !== name || reg[i].tag !== tag ||
          reg[i].avatar !== avatar || reg[i].profileFrame !== frame) {
        reg[i].name = name;
        reg[i].tag = tag;
        reg[i].avatar = avatar;
        reg[i].profileFrame = frame;
        changed = true;
      }
    }
    if (changed) this._rawSet('accounts', reg);
  }

  touchAccount(id) {
    var reg = this.listAccounts();
    for (var i = 0; i < reg.length; i++) {
      if (reg[i].id === id) { reg[i].lastUsedAt = new Date().toISOString(); break; }
    }
    this._rawSet('accounts', reg);
  }

  /**
   * Remove an account and purge its namespaced keys.
   * Refuses to remove the last one — there would be nothing to switch to.
   */
  deleteAccount(id) {
    var reg = this.listAccounts().filter(function(a) { return a.id !== id; });
    if (!reg.length) return false;

    var prefix = 'orbit_acct_' + id + '_';
    var doomed = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) doomed.push(k);
      }
    } catch (e) {}
    doomed.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });

    this._rawSet('accounts', reg);
    if (this.accountId === id) {
      this.accountId = reg[0].id;
      this._rawSet('active_account', this.accountId);
      this.load();
      this.notify(this.getState());
    }
    return true;
  }

  // ════════════════════════════════════════════
  // MStore-compatible API (backward compat)
  // ════════════════════════════════════════════

  get(key, fallback) {
    if (key.indexOf('msg_') === 0) {
      try { var d = JSON.parse(localStorage.getItem('orbit_' + this._ns() + key)); return d !== null ? d : fallback; }
      catch(e) { return fallback; }
    }
    try { var d = JSON.parse(localStorage.getItem('orbit_' + this._ns() + key)); return d !== null ? d : fallback; }
    catch(e) { return fallback; }
  }

  set(key, val) {
    if (key === 'messages') {
      for (var cid in val) {
        if (val.hasOwnProperty(cid)) {
          this.set('msg_' + cid, val[cid]);
        }
      }
      try { localStorage.removeItem('orbit_messages'); } catch(_) {}
      return;
    }
    if (key.indexOf('msg_') === 0) {
      var chatId = key.substring(4);
      try {
        localStorage.setItem('orbit_' + this._ns() + key, JSON.stringify(val));
      } catch(e) {
        if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
          console.error('Storage quota exceeded for messages of', chatId);
          if (typeof showToast === 'function') {
            showToast('Storage full! Old messages trimmed for this chat.', 'warning');
          }
          var limits = [30, 15, 5];
          for (var li = 0; li < limits.length; li++) {
            var trimmed = val.slice(-limits[li]);
            try {
              localStorage.setItem('orbit_' + this._ns() + key, JSON.stringify(trimmed));
              if (this.messages) this.messages[chatId] = trimmed;
              return;
            } catch(e2) {}
          }
          console.error('Failed to save messages for', chatId);
          try { localStorage.removeItem('orbit_' + this._ns() + key); } catch(_) {}
          if (this.messages) delete this.messages[chatId];
        }
      }
      return;
    }
    try {
      localStorage.setItem('orbit_' + this._ns() + key, JSON.stringify(val));
    } catch(e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        console.error('Storage quota exceeded for', key);
        if (typeof showToast === 'function') {
          showToast('Storage full! Clear some chat history or use smaller images.', 'error');
        }
      }
    }
  }

  // Lazy-load messages for a chat
  getMessages(chatId) {
    if (!this.messages[chatId]) {
      this.messages[chatId] = this.get('msg_' + chatId, []);
    }
    return this.messages[chatId];
  }

  _saveMsgs(chatId) {
    if (this.messages[chatId]) {
      this.set('msg_' + chatId, this.messages[chatId]);
    }
  }

  // Migrate old combined orbit_messages key to per-chat keys
  _migrateOldMessages() {
    try {
      var old = JSON.parse(localStorage.getItem('orbit_messages'));
      if (old && typeof old === 'object') {
        console.log('[Store] Migrating old combined messages to per-chat keys');
        for (var cid in old) {
          if (old.hasOwnProperty(cid) && old[cid]) {
            this.set('msg_' + cid, old[cid]);
          }
        }
        localStorage.removeItem('orbit_messages');
      }
    } catch(e) { console.warn('[Store] migrateOldData failed', e); }
  }

  // Compress large images before storing
  compressImage(dataUrl, maxWidth, maxHeight, quality, callback) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      return callback(dataUrl);
    }
    var img = new Image();
    img.onload = function() {
      try {
        var canvas = document.createElement('canvas');
        var w = img.width;
        var h = img.height;
        if (w > maxWidth || h > maxHeight) {
          if (w / h > maxWidth / maxHeight) {
            h = Math.round(h * maxWidth / w);
            w = maxWidth;
          } else {
            w = Math.round(w * maxHeight / h);
            h = maxHeight;
          }
        }
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        if (!ctx) { callback(dataUrl); return; }
        // JPEG has no alpha channel: a transparent PNG would come out with
        // black corners. Fill a neutral background first so transparency
        // stays clean (v0.4.0-beta fix #7).
        if (/^data:image\/png/i.test(dataUrl)) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        var out = canvas.toDataURL('image/jpeg', quality);
        callback(out && out.length > 0 ? out : dataUrl);
      } catch (e) {
        // Never hang the caller — fall back to the original image
        callback(dataUrl);
      }
    };
    img.onerror = function() { callback(dataUrl); };
    img.src = dataUrl;
  }

  // Load all data from localStorage
  load() {
    // Must run first — it decides which namespace get() reads from.
    this.initAccounts();

    this.friends = this.get('friends', []).map(function(f) { f.lastSeen = 0; f.status = 'offline'; return f; });
    this.chats = this.get('chats', []);
    this.groups = this.get('groups', []);
    this.messages = {};
    this._migrateOldMessages();
    this.blockedUsers = this.get('blockedUsers', []);
    this.pinnedMessages = this.get('pinnedMessages', {});
    this.unreadCounts = this.get('unreadCounts', {});
    this.mentionCounts = this.get('mentionCounts', {});
    this.lastReadIds = this.get('lastReadIds', {});
    this.peerPublicKeys = this.get('peerPublicKeys', {});

    // Merge saved settings over a FRESH copy of the defaults — not over whatever
    // the previous account left on the instance. See _settingsDefaults.
    var savedSettings = this.get('settings', {});
    this.settings = Object.assign(
      JSON.parse(JSON.stringify(this._settingsDefaults || {})), savedSettings);

    // These are only ever set in the constructor, so a load() that does not come
    // with a page reload (an account switch, a create) would keep the outgoing
    // account's values. Reset them so load() really does mean "read it all again".
    this.closedDMs = {};
    this.pinnedDMs = {};
    this.activeChatId = null;
    this.transferProgress = {};
    this.transferErrors = {};

    // ONE-TIME MIGRATION: "Message Effects" graduated from Experimental to a
    // stable Chat setting. Legacy persisted key `experimentalMessageFx` → `messageFx`.
    // Only migrates when the legacy key exists in the loaded (persisted) settings
    // AND the new key was never persisted, so users who toggle the new setting
    // afterward keep their choice. `!!` coerces legacy true/false; undefined guard
    // keeps this safe for malformed saved settings. The legacy key is deleted so it
    // is never written back to storage again.
    if (savedSettings && typeof savedSettings === 'object' && savedSettings.experimentalMessageFx !== undefined && savedSettings.messageFx === undefined) {
      this.settings.messageFx = !!savedSettings.experimentalMessageFx;
      delete this.settings.experimentalMessageFx;
    }

    // ONE-TIME MIGRATION: "Profile Frames" graduated from Experimental to a
    // stable Appearance setting. Legacy persisted key `experimentalProfileFrames` → `profileFrames`.
    // Only migrates when the legacy key exists in the loaded (persisted) settings
    // AND the new key was never persisted, so users who toggle the new setting
    // afterward keep their choice. `!!` coerces legacy true/false; undefined guard
    // keeps this safe for malformed saved settings. The legacy key is deleted so it
    // is never written back to storage again.
    if (savedSettings && typeof savedSettings === 'object' && savedSettings.experimentalProfileFrames !== undefined && savedSettings.profileFrames === undefined) {
      this.settings.profileFrames = !!savedSettings.experimentalProfileFrames;
      delete this.settings.experimentalProfileFrames;
    }

    // Re-sync mutedChats alias (must point to same object as settings.mutedChats for backward compat)
    this.mutedChats = this.settings.mutedChats;

    this.chatFolders = this.get('chatFolders', {});
    this.chatFolderOrder = this.get('chatFolderOrder', []);

    this.scheduledMessages = this.get('scheduledMessages', []);

    this.user = this.get('user', null);
    this._migrateGroups();

    // Ensure all chats have disappearTimer
    var chatsChanged = false;
    this.chats.forEach(function(c) {
      if (c.disappearTimer === undefined) { c.disappearTimer = 'off'; chatsChanged = true; }
    });
    if (chatsChanged) this.set('chats', this.chats);

    // Generate default user identity if missing
    if (!this.user) {
      this.user = {
        id: 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: 'User',
        tag: Math.floor(1000 + Math.random() * 9000).toString(),
        status: 'online',
        avatar: null,
        banner: null,
        bio: '',
        publicKey: null
      };
      this.save();
    }

    if (this.settings.profileFrame === undefined) this.settings.profileFrame = 0;

    // Ensure echo bot exists
    var echoFriend = this.friends.find(function(f) { return f.id === 'echo'; });
    if (!echoFriend) {
      this.friends.unshift({
        id: 'echo', name: 'Orbit Echo', tag: 'BOT', status: 'online',
        avatar: 'icons/app/orbit_1024.png', bio: 'Local echo channel for testing'
      });
    } else {
      echoFriend.avatar = 'icons/app/orbit_1024.png';
      echoFriend.status = 'online';
    }
    // Ensure echo chat exists
    var echoChat = this.chats.find(function(c) { return c.id === 'echo'; });
    if (!echoChat) {
      this.chats.unshift({
        id: 'echo', name: 'Orbit Echo', avatar: 'icons/app/orbit_1024.png',
        status: 'online', lastMessage: '', lastTime: '', unread: 0, wallpaper: null,
        disappearTimer: 'off'
      });
    } else {
      echoChat.avatar = 'icons/app/orbit_1024.png';
      echoChat.status = 'online';
      if (echoChat.disappearTimer === undefined) echoChat.disappearTimer = 'off';
    }
    // Ensure echo messages array is loaded from storage (don't overwrite saved ones)
    if (!this.messages['echo']) {
      this.messages['echo'] = this.get('msg_echo', []);
    }
    this.save();
  }

  // Save all data to localStorage
  /* Send the whitelisted settings to my OTHER DEVICES — the friends whose id is my own id.
     build() returns null when nothing on the whitelist is worth sending. */
  broadcastSettings() {
    if (!window.OrbitSettingsSync || typeof Orbit === 'undefined' || !Orbit.P2P) return false;
    var payload = window.OrbitSettingsSync.build(this.settings);
    if (!payload) return false;

    // this.user, NOT this.currentUser. The store never assigns `currentUser` — it
    // exists only as a getState()/setState() alias for the desktop's naming. This
    // read undefined, so `me` was always null and the function returned before
    // sending anything: SETTINGS_SYNC never actually fired from the mobile, for
    // any setting, since it was wired up in v0.8.0.
    var me = this.user ? (this.user.id || this.user.userId) : null;
    if (!me) return false;

    var sent = 0;
    (this.friends || []).forEach(function (f) {
      if (window.OrbitSettingsSync.isOwnDevice(f.id, me)) {
        try {
          Orbit.P2P.send(f.id, Orbit.Protocol.createPacket(
            Orbit.Protocol.Types.SETTINGS_SYNC, me, f.id, payload));
          sent++;
        } catch (e) { /* unreachable right now; it will sync on the next change */ }
      }
    });
    return sent > 0;
  }

  save() {
    this.set('friends', this.friends);
    this.set('chats', this.chats);
    this.set('groups', this.groups);
    this.set('blockedUsers', this.blockedUsers);
    // Sync mutedChats back into settings before persisting (app.js reads MStore.settings.mutedChats)
    this.settings.mutedChats = this.mutedChats;
    this.set('settings', this.settings);
    this.set('user', this.user);
    this.set('pinnedMessages', this.pinnedMessages);
    this.set('unreadCounts', this.unreadCounts);
    this.set('mentionCounts', this.mentionCounts);
    this.set('lastReadIds', this.lastReadIds);
    this.set('peerPublicKeys', this.peerPublicKeys);
    this.set('chatFolders', this.chatFolders);
    this.set('chatFolderOrder', this.chatFolderOrder);
    this.set('activityLog', this.activityLog);
    this.set('activityClearedAt', this.activityClearedAt);
    this.set('systemLogClearedAt', this.systemLogClearedAt);
    this.set('scheduledMessages', this.scheduledMessages);

    // Tell my other devices if the whitelisted settings actually moved. save() runs for many
    // reasons, so worthSending() compares against the last payload we SENT rather than against
    // the previous save — otherwise every unrelated save would look like a settings change.
    if (window.OrbitSettingsSync) {
      if (window.OrbitSettingsSync.worthSending(this._lastSyncedSettings || {}, this.settings)) {
        this.broadcastSettings();
        try { this._lastSyncedSettings = JSON.parse(JSON.stringify(this.settings)); } catch (e) {}
      }
    }

    // Keep the account registry's name/tag/avatar in step with the profile.
    this.syncAccountRecord();
  }

  addActivityLogEntry(type, message) {
    this.activityLog.push({
      type: type,
      message: message,
      timestamp: new Date().toISOString()
    });
    // Keep only last 200 entries
    if (this.activityLog.length > 200) {
      this.activityLog = this.activityLog.slice(-200);
    }
    this.set('activityLog', this.activityLog);
  }

  // Enriched chat list
  getChats() {
    var self = this;
    return this.chats.map(function(c) {
      var msgs = self.getMessages(c.id);
      var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      var friend = self.friends.find(function(f) { return f.id === c.id; });
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar || (friend ? friend.avatar : null),
        status: friend ? friend.status : null,
        lastMessage: last ? last.text : '',
        lastTime: last ? last.time : '',
        unread: c.unread || 0
      };
    });
  }

  addMessage(chatId, msg) {
    if (!this.messages[chatId]) this.messages[chatId] = [];
    // Deduplicate
    if (msg.id && this.messages[chatId].some(function(m) { return String(m.id) === String(msg.id); })) return;
    this.messages[chatId].push(msg);
    // Update chat summary
    var chat = this.chats.find(function(c) { return c.id === chatId; });
    if (chat) {
      chat.lastMessage = msg.text || (msg.attachments && msg.attachments.length > 0 ? '[Media]' : '');
      chat.lastTime = msg.time;
    }
    this._saveMsgs(chatId);
    this.set('chats', this.chats);
    this.notify({ messages: this.messages, chats: this.chats });
  }

  sendMessage(chatId, text) {
    var msg = {
      id: 'm' + Date.now() + Math.random().toString(36).slice(2, 6),
      from: 'me',
      text: text,
      time: new Date().toISOString()
    };
    this.addMessage(chatId, msg);
    return msg;
  }

  editMessage(chatId, msgId, newText) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    for (var i = 0; i < msgs.length; i++) {
      if (String(msgs[i].id) === String(msgId)) {
        msgs[i].text = newText;
        msgs[i].edited = true;
        break;
      }
    }
    this._saveMsgs(chatId);
    this.notify({ messages: this.messages });
  }

  deleteMessage(chatId, msgId) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    this.messages[chatId] = msgs.filter(function(m) { return String(m.id) !== String(msgId); });
    this._saveMsgs(chatId);
    this.notify({ messages: this.messages });
  }

  // ════════════════════════════════════════════
  // Scheduled Messages
  // ════════════════════════════════════════════

  scheduleMessage(msg) {
    this.scheduledMessages.push(msg);
    this.set('scheduledMessages', this.scheduledMessages);
    return msg;
  }

  cancelScheduledMessage(id) {
    this.scheduledMessages = this.scheduledMessages.filter(function(m) { return m.id !== id; });
    this.set('scheduledMessages', this.scheduledMessages);
  }

  getDueScheduledMessages() {
    var now = Date.now();
    return this.scheduledMessages.filter(function(m) { return !m.sent && new Date(m.scheduledAt).getTime() <= now; });
  }

  _migrateGroups() {
    var changed = false;
    var self = this;
    this.groups.forEach(function(g) {
      if (!g.ownerId) { g.ownerId = (self.user ? self.user.id : ''); changed = true; }
      if (g.description === undefined) { g.description = ''; changed = true; }
      if (!g.inviteCode) {
        var arr = new Uint8Array(4);
        if (window.crypto) window.crypto.getRandomValues(arr);
        g.inviteCode = Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        changed = true;
      }
      if (g.pinned === undefined) { g.pinned = false; changed = true; }
      if (g.notificationMuted === undefined) { g.notificationMuted = false; changed = true; }
      if (g.pinnedMessages === undefined) { g.pinnedMessages = []; changed = true; }
      if (g.disappearTimer === undefined) { g.disappearTimer = 'off'; changed = true; }
      if (g.members && g.members.length > 0 && typeof g.members[0] === 'string') {
        g.members = g.members.map(function(id) {
          return { userId: id, role: 'member', joinedAt: g.createdAt || new Date().toISOString() };
        });
        var ownerEntry = g.members.find(function(m) { return m.userId === g.ownerId; });
        if (ownerEntry) ownerEntry.role = 'owner';
        changed = true;
      }
    });
    if (changed) { console.log('[Store] Migrated ' + this.groups.length + ' group(s) — added missing fields'); this.save(); }
  }

  // ════════════════════════════════════════════
  // Chat Folders CRUD
  // ════════════════════════════════════════════

  createFolder(name, icon) {
    var id = 'folder_' + Date.now();
    this.chatFolders[id] = { id: id, name: name, icon: icon || 'folder', chatIds: [] };
    this.chatFolderOrder.push(id);
    this.save();
    return id;
  }
  renameFolder(folderId, name) {
    if (this.chatFolders[folderId]) {
      this.chatFolders[folderId].name = name;
      this.save();
    }
  }
  deleteFolder(folderId) {
    delete this.chatFolders[folderId];
    this.chatFolderOrder = this.chatFolderOrder.filter(function(id) { return id !== folderId; });
    this.save();
  }
  addChatToFolder(folderId, chatId) {
    if (this.chatFolders[folderId] && this.chatFolders[folderId].chatIds.indexOf(chatId) === -1) {
      this.chatFolders[folderId].chatIds.push(chatId);
      this.save();
    }
  }
  removeChatFromFolder(folderId, chatId) {
    if (this.chatFolders[folderId]) {
      this.chatFolders[folderId].chatIds = this.chatFolders[folderId].chatIds.filter(function(id) { return id !== chatId; });
      this.save();
    }
  }
  getChatFolders() {
    var folders = [];
    for (var i = 0; i < this.chatFolderOrder.length; i++) {
      var fid = this.chatFolderOrder[i];
      if (this.chatFolders[fid]) folders.push(this.chatFolders[fid]);
    }
    return folders;
  }

  // Helper: current user's ID
  getMyId() {
    return this.user ? (this.user.id || this.user.userId) : '';
  }

  // ════════════════════════════════════════════
  // Desktop Store API (subscribe / notify / state)
  // ════════════════════════════════════════════

  getState() {
    return {
      friends: this.friends,
      chats: this.chats,
      groups: this.groups,
      messages: this.messages,
      blockedUsers: this.blockedUsers,
      user: this.user,
      currentUser: this.user,
      settings: this.settings,
      unreadCounts: this.unreadCounts,
      mentionCounts: this.mentionCounts,
      lastReadIds: this.lastReadIds,
      mutedChats: this.mutedChats,
      pinnedMessages: this.pinnedMessages,
      closedDMs: this.closedDMs,
      pinnedDMs: this.pinnedDMs,
      peerPublicKeys: this.peerPublicKeys,
      activeChatId: this.activeChatId,
      activeView: this.activeView,
      transferProgress: this.transferProgress,
      transferErrors: this.transferErrors,
      scheduledMessages: this.scheduledMessages,
      chatFolders: this.chatFolders,
      chatFolderOrder: this.chatFolderOrder
    };
  }

  setState(newState) {
    // Sync to direct properties for backward compat
    var keys = ['friends', 'chats', 'groups', 'messages', 'blockedUsers', 'user',
                'settings', 'unreadCounts', 'mentionCounts', 'lastReadIds',
                'mutedChats', 'pinnedMessages', 'closedDMs', 'pinnedDMs',
                'peerPublicKeys', 'activeChatId', 'activeView',
                'transferProgress', 'transferErrors', 'scheduledMessages',
                'chatFolders', 'chatFolderOrder'];
    for (var k in newState) {
      if (newState.hasOwnProperty(k) && keys.indexOf(k) !== -1) {
        this[k] = newState[k];
      }
    }
    // Map currentUser (desktop convention) → user (mobile convention)
    if (newState.currentUser !== undefined) {
      this.user = newState.currentUser;
    }
    // Persist core data
    if (newState.friends !== undefined || newState.chats !== undefined ||
        newState.groups !== undefined || newState.blockedUsers !== undefined ||
        newState.user !== undefined || newState.settings !== undefined) {
      this.save();
    }
    this.notify(newState);
  }

  setStateBatch(newState) {
    this.setState(newState);
  }

  subscribe(listener) {
    this.listeners.push(listener);
    var self = this;
    return function() {
      self.listeners = self.listeners.filter(function(l) { return l !== listener; });
    };
  }

  notify(changedState) {
    var state = this.getState();
    this.listeners.forEach(function(listener) { listener(state, changedState); });
  }

  // ════════════════════════════════════════════
  // Friends / Peers
  // ════════════════════════════════════════════

  addOrUpdatePeer(peer) {
    if (!peer || !peer.userId) return;
    var idx = this.friends.findIndex(function(f) { return f.userId === peer.userId || f.id === peer.userId; });
    var friend = this.friends[idx];
    if (idx >= 0) {
      this.friends[idx] = Object.assign({}, friend, peer);
    } else {
      this.friends.push(Object.assign({}, peer, { lastSeen: Date.now(), status: peer.status || 'offline' }));
    }
    if (peer.publicKey) this.setPeerPublicKey(peer.userId, peer.publicKey);
    this.save();
    this.notify({ friends: this.friends });
  }

  removeFriend(userId) {
    this.friends = this.friends.filter(function(f) { return f.userId !== userId && f.id !== userId; });
    delete this.messages[userId];
    delete this.pinnedMessages[userId];
    delete this.unreadCounts[userId];
    delete this.mentionCounts[userId];
    delete this.lastReadIds[userId];
    delete this.mutedChats[userId];
    this.save();
    this.notify({ friends: this.friends });
  }

  // ════════════════════════════════════════════
  // Groups
  // ════════════════════════════════════════════

  addGroup(group) {
    if (!group || !group.groupId) return;
    var idx = this.groups.findIndex(function(g) { return g.groupId === group.groupId; });
    if (group.disappearTimer === undefined) group.disappearTimer = 'off';
    if (!group.inviteCode) {
      var arr = new Uint8Array(4);
      if (window.crypto) window.crypto.getRandomValues(arr);
      group.inviteCode = Array.prototype.map.call(arr, function(b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }
    if (idx >= 0) {
      this.groups[idx] = Object.assign({}, this.groups[idx], group);
    } else {
      this.groups.push(group);
    }
    this.save();
    this.notify({ groups: this.groups });
  }

  removeGroup(groupId) {
    this.groups = this.groups.filter(function(g) { return g.groupId !== groupId; });
    delete this.messages[groupId];
    delete this.pinnedMessages[groupId];
    delete this.unreadCounts[groupId];
    delete this.mentionCounts[groupId];
    delete this.lastReadIds[groupId];
    delete this.mutedChats[groupId];
    this.save();
    this.notify({ groups: this.groups });
  }

  removeGroupMember(groupId, userId) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId && g.members) {
        g.members = g.members.filter(function(m) { return m.userId !== userId; });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  setMemberRole(groupId, userId, role) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId && g.members) {
        g.members = g.members.map(function(m) {
          return m.userId === userId ? Object.assign({}, m, { role: role }) : m;
        });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  addMemberToGroup(groupId, user) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId) {
        var members = g.members || [];
        if (!members.find(function(m) { return m.userId === user.userId; })) {
          members = members.concat([Object.assign({}, user, { joinedAt: user.joinedAt || new Date().toISOString() })]);
        }
        return Object.assign({}, g, { members: members });
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  updateGroupField(groupId, field, value) {
    this.groups = this.groups.map(function(g) {
      if (g.groupId === groupId) {
        var updated = {};
        updated[field] = value;
        return Object.assign({}, g, updated);
      }
      return g;
    });
    this.save();
    this.notify({ groups: this.groups });
  }

  getGroupMembers(groupId) {
    var group = this.groups.find(function(g) { return g.groupId === groupId; });
    return group ? (group.members || []) : [];
  }

  // ════════════════════════════════════════════
  // DM management
  // ════════════════════════════════════════════

  closeDM(userId) {
    delete this.messages[userId];
    delete this.pinnedMessages[userId];
    delete this.unreadCounts[userId];
    delete this.mentionCounts[userId];
    delete this.lastReadIds[userId];
    delete this.mutedChats[userId];
    this.closedDMs[userId] = true;
    delete this.pinnedDMs[userId];
    this.activeChatId = 'echo';
    this.save();
    this.notify({ closedDMs: this.closedDMs, pinnedDMs: this.pinnedDMs, activeChatId: 'echo' });
  }

  togglePinDM(userId) {
    if (this.pinnedDMs[userId]) {
      delete this.pinnedDMs[userId];
    } else {
      this.pinnedDMs[userId] = true;
    }
    this.save();
    this.notify({ pinnedDMs: this.pinnedDMs });
  }

  reopenDM(userId) {
    delete this.closedDMs[userId];
    this.activeChatId = userId;
    this.save();
    this.notify({ closedDMs: this.closedDMs, activeChatId: userId });
  }

  // ════════════════════════════════════════════
  // Read / Unread
  // ════════════════════════════════════════════

  markAsRead(chatId) {
    delete this.unreadCounts[chatId];
    delete this.mentionCounts[chatId];
    var msgs = this.messages[chatId];
    if (msgs && msgs.length > 0) {
      this.lastReadIds[chatId] = msgs[msgs.length - 1].id;
    }
    this.save();
    this.notify({ unreadCounts: this.unreadCounts, mentionCounts: this.mentionCounts, lastReadIds: this.lastReadIds });
  }

  toggleMute(chatId) {
    if (this.mutedChats[chatId]) {
      delete this.mutedChats[chatId];
    } else {
      this.mutedChats[chatId] = true;
    }
    this.save();
    this.notify({ mutedChats: this.mutedChats });
  }

  // ════════════════════════════════════════════
  // Pinned messages
  // ════════════════════════════════════════════

  pinMessage(chatId, msgId) {
    var msgs = this.messages[chatId];
    if (!msgs) return;
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;
    if (!this.pinnedMessages[chatId]) this.pinnedMessages[chatId] = [];
    if (this.pinnedMessages[chatId].some(function(p) { return String(p.msgId) === String(msgId); })) return;
    this.pinnedMessages[chatId] = this.pinnedMessages[chatId].concat([{
      msgId: msg.id,
      text: msg.text || '(attachment)',
      from: msg.from || msg.sender,
      timestamp: msg.time || msg.timestamp || new Date().toISOString(),
      pinnedAt: new Date().toISOString()
    }]);
    this.save();
    this.notify({ pinnedMessages: this.pinnedMessages });
  }

  unpinMessage(chatId, msgId) {
    if (!this.pinnedMessages[chatId]) return;
    this.pinnedMessages[chatId] = this.pinnedMessages[chatId].filter(function(p) { return String(p.msgId) !== String(msgId); });
    if (this.pinnedMessages[chatId].length === 0) delete this.pinnedMessages[chatId];
    this.save();
    this.notify({ pinnedMessages: this.pinnedMessages });
  }

  getPinnedMessages(chatId) {
    return this.pinnedMessages[chatId] || [];
  }

  // ════════════════════════════════════════════
  // Blocking
  // ════════════════════════════════════════════

  blockUser(userId) {
    if (this.blockedUsers.indexOf(userId) !== -1) return;
    this.blockedUsers = this.blockedUsers.concat([userId]);
    this.save();
    this.notify({ blockedUsers: this.blockedUsers });
  }

  unblockUser(userId) {
    this.blockedUsers = this.blockedUsers.filter(function(id) { return id !== userId; });
    this.save();
    this.notify({ blockedUsers: this.blockedUsers });
  }

  isUserBlocked(userId) {
    return this.blockedUsers.indexOf(userId) !== -1;
  }

  // ════════════════════════════════════════════
  // E2EE key management
  // ════════════════════════════════════════════

  setPeerPublicKey(peerId, publicKey) {
    if (!peerId || !publicKey) return;
    this.peerPublicKeys[peerId] = publicKey;
    this.set('peerPublicKeys', this.peerPublicKeys);
  }

  getPeerPublicKey(peerId) {
    return this.peerPublicKeys[peerId] || null;
  }

  // ════════════════════════════════════════════
  // Transfer tracking
  // ════════════════════════════════════════════

  addTransferProgress(name, fileId) {
    this.transferProgress[name] = fileId;
    this.notify({ transferProgress: this.transferProgress });
  }

  handleTransferProgress(data) {
    var p = this.transferProgress[data.name] || {};
    p.bytes = data.bytes;
    p.total = data.total;
    p.speed = data.speed;
    this.transferProgress[data.name] = p;
    this.notify({ transferProgress: this.transferProgress });
  }

  handleTransferError(data) {
    var errs = Object.assign({}, this.transferErrors);
    errs[data.name] = data.error || 'Transfer failed';
    this.transferErrors = errs;
    this.notify({ transferErrors: errs });
  }

  // ════════════════════════════════════════════
  // System log
  // ════════════════════════════════════════════

  addSystemLog(type, message) {
    console.log('[System] ' + type + ': ' + message);
  }
}

// Global singleton — named MStore for backward compat with existing mobile code
window.MStore = new Store();

/**
 * Account-aware localStorage, for the sites that do NOT go through Store.
 *
 * The store's get()/set() is a funnel only for the store's own data. Roughly
 * fifteen places elsewhere write `orbit_*` directly — drafts, the last-open
 * chat, the E2EE keypair, the vault backup, the outbox. Those would all leak
 * across accounts, and the E2EE one would actively destroy the first account's
 * identity key. They call this instead.
 *
 * Falls back to the un-prefixed key when the store is not up yet.
 */
window.OrbitKeys = {
  ns: function() {
    return (window.MStore && typeof window.MStore._ns === 'function') ? window.MStore._ns() : '';
  },
  full: function(key) { return 'orbit_' + window.OrbitKeys.ns() + key; },
  get: function(key) {
    try { return localStorage.getItem(window.OrbitKeys.full(key)); } catch (e) { return null; }
  },
  set: function(key, rawValue) {
    try { localStorage.setItem(window.OrbitKeys.full(key), rawValue); } catch (e) {}
  },
  remove: function(key) {
    try { localStorage.removeItem(window.OrbitKeys.full(key)); } catch (e) {}
  },
  /** Every key under a logical prefix, for the enumeration loops. */
  list: function(prefix) {
    var out = [];
    var full = window.OrbitKeys.full(prefix);
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(full) === 0) out.push(k.substring(full.length));
      }
    } catch (e) {}
    return out;
  }
};
