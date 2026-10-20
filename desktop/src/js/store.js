// src/js/store.js
class Store {
  constructor(initialState = {}) {
    var data, savedSettings, savedNetwork, dbFriends, dbMessages, dbGroups, uiState, savedMutedChats, savedPinnedMessages, lastReadIds, savedBlockedUsers;

    // Batch all DB reads into a single IPC call
    if (window.orbitAPI && window.orbitAPI.dbGetAllStartupData) {
      data = window.orbitAPI.dbGetAllStartupData();
      savedSettings = data.settings || {};
      savedNetwork = data.networkSettings || {};
      dbFriends = (data.friends || []).map(function(f) {
        if (f.userId === 'local-echo') {
          f.lastSeen = Date.now();
          f.status = 'online';
        } else {
          f.lastSeen = 0;
          f.status = 'offline';
        }
        return f;
      });
      dbMessages = data.messages || {};
      dbGroups = data.groups || [];
      uiState = data.uiState || { activeTab: 'dms', activeChatId: 'local-echo' };
      savedMutedChats = data.mutedChats || {};
      // Pinned messages have no entity of their own to hang off — a pin belongs to a chat,
      // not to a friend or a group — so they persist through settings, the way mutedChats
      // does. Without any of this they were gone on every restart, which is what Dan caught.
      //
      // Read with a direct dbGetSetting rather than from `data`: dbGetAllStartupData is a
      // batched call in the main process with a fixed shape, and pinnedMessages is not in
      // it. Writing the setting and never reading it back is exactly half a fix, and it is
      // what the first attempt at this did.
      savedPinnedMessages = (window.orbitAPI && typeof window.orbitAPI.dbGetSetting === 'function')
        ? (window.orbitAPI.dbGetSetting('pinnedMessages', {}) || {})
        : ((data && data.pinnedMessages) || {});
      lastReadIds = data.readStates || {};
      savedBlockedUsers = data.blockedUsers || [];
    } else {
      savedSettings = window.Storage ? window.Storage.get('settings', {}) : {};
      savedNetwork = window.Storage ? window.Storage.get('networkSettings', {}) : {};
      dbFriends = window.Storage ? (window.Storage.get('appData', {}).friends || []).map(function(f) { if (f.userId === 'local-echo') { f.lastSeen = Date.now(); f.status = 'online'; } else { f.lastSeen = 0; f.status = 'offline'; } return f; }) : [];
      dbMessages = window.Storage ? (window.Storage.get('appData', {}).messages || {}) : {};
      dbGroups = window.Storage ? (window.Storage.get('appData', {}).groups || []) : [];
      uiState = { activeTab: 'dms', activeChatId: 'local-echo' };
      savedMutedChats = {};
      lastReadIds = {};
      savedBlockedUsers = window.Storage ? window.Storage.get('blockedUsers', []) : [];
    }

    // Ensure Orbit Echo is always in the friends list
    var echoFriend = {
      userId: 'local-echo',
      username: 'Orbit Echo',
      usertag: 'BOT',
      status: 'online',
      avatar: 'icons/orbit/orbit_default.png',
      bio: 'A local echo channel for testing messages.'
    };
    if (!dbFriends.some(function(f) { return f.userId === 'local-echo'; })) {
      dbFriends.unshift(echoFriend);
      if (window.orbitAPI && window.orbitAPI.dbSaveFriend) window.orbitAPI.dbSaveFriend(echoFriend);
    }

    this.state = {
      currentUser: {
        userId: null,
        username: 'User',
        usertag: '0000',
        status: 'online',
        avatar: null
      },
      settings: {
        theme: 'dark',
        // The redesigned UI (v0.9.0), for anyone who wants the beta look.
        // ⚠⚠ IT IS OPT-IN AND `false` IS THE DEFAULT, so the flag says what it
        // means rather than describing an opt-out. The redesigned UI is the BETA;
        // the original UI is what the app opens on. Dan: "the new redesign is the
        // beta look! the classic is the original UI! so by default, that toggle
        // should be on (on to show the classic UI look!)".
        //
        // ⚠ It is named for the NEW ui, not the old one, and that is deliberate:
        // the switch that drives it is labelled "New look", and a `classicUI` key
        // whose `false` meant "new look" is exactly the double negative that ends
        // up inverted by someone reading it quickly. `newUI: true` means what it
        // says.
        //
        // ⚠⚠ READ IN THREE PLACES, and all three require exactly `true` to turn the
        // beta on: the inline script in index.html (before first paint),
        // applySettings, and the toggle under Settings → Advanced → Experimental
        // Features.
        //
        // ⚠⚠ AND `!== true` IS THE SAFETY DIRECTION, not `!== false`. Anything
        // missing, malformed or unreadable leaves the redesign OFF — which lands
        // the user in the complete, stable original UI rather than in a beta they
        // did not ask for. See the head script in index.html.
        //
        // The old `classicUI` key is retired; main.js deletes it once at boot.
        newUI: false,
        // ⚠ FILLS your own message bubble with the accent instead of leaving it the
        // same surface as theirs. This is the look the app had before the redesign,
        // and it is the same setting the mobile carries under this name — the desktop
        // simply never had it. Applied as `data-classic-bubbles` on <html>, and the
        // rule lives in components.css because it has to work in BOTH UIs.
        classicBubbles: false,
        // The settings modal's nav rail, collapsed to icons only. ⚠ A REDESIGN-ONLY
        // preference: the rules that act on it live in redesign.css, so in the classic
        // look the class is applied and does nothing — which is the correct behaviour
        // and needs no second code path.
        settingsNavCollapsed: false,
        fontSize: 'Medium',
        messageBubbles: 'Modern',
        appZoom: 100,
        animations: true,
        animSpeed: 'normal',
        reduceMotion: false,
        messageAnim: 'slide',
        timeFormat24: false,
        bgPattern: 'None',
        enterToSend: true,
        swipeToReply: true,
        showChatAvatars: true,
        // Whether a group's info shows when it was created. On by default, which is what it
        // did before — but when a group has no recorded date the row is now hidden rather
        // than printing "Created Unknown", which is what Dan saw.
        showGroupCreated: true,
        showImagePreviews: true,
        galleryViewMode: 'grid',
        showLinkPreviews: true,
        notifySound: true,
        notifyVolume: 80,
        notifySoundType: 'chime',
        notifyPreview: true,
        notifyGroupMentions: false,
        notifyDnd: false,
        devMode: false,
        debugDisplay: false,
        // ⚠ Whether the MAIN PROCESS may print to the terminal. Read by
        // src/js/log.js, which gates every main-process log line — without it,
        // `npm start` printed a wall of discovery beacons and duration probes on
        // every launch. Needs `devMode` too; this is the narrower switch.
        debugLogs: false,
        showMessageIds: false,
        logNetworkPackets: false,
        showConnectionStats: false,
        enableExperimental: false,
        experimentalFolders: false,
        chatFolders: [],
        profileFrames: true,
        // Automatic "is there a newer Orbit?" check. Off means no network
        // contact at all; Settings → About's manual check still works.
        updateCheckEnabled: true,
        experimentalMessageTranslate: true,
        messageTranslate: true,
        translateTargetLang: '',
        autoDetectSource: true,
        experimentalCompactSpacing: false,
        experimentalFpsMonitor: false,
        experimentalDevOverlay: false,
        experimentalPerformanceMode: false,
        profileFrame: 0,
        enableCustomColors: false,
        experimentalAnimatedAvatars: false,
        experimentalMessageFx: false,
        e2eeEnabled: false,
        tutorialCompleted: false,
        tutorialSkipped: false,
        showTutorialOnStartup: true,
        noFlashbang: false,
        sidebarButtons: { activity: true, gallery: true, storage: true },
        ...savedSettings
      },
      networkSettings: {
        mode: 'LAN Auto-Discovery',
        udpPort: 45678,
        tcpPort: 46000,
        maxFileSize: 500,
        webrtcFallback: true,
        logLevel: 'None',
        netBandwidthLimit: 0,
        netAutoReconnect: true,
        netReconnectInterval: 10,
        netTimeout: 30,
        netKeepAlive: 30,
        ...savedNetwork
      },
      friends: dbFriends,
      groups: dbGroups,
      activeView: 'friends',
      activeFolder: null,
      activeTab: uiState.activeTab || 'dms',
      // Deliberately NOT the last chat. Orbit opens on the welcome slides: the
      // panel's empty state is where the feature tour lives, and landing straight
      // in an old conversation hid it. (Dan, v0.7.0.)
      activeChatId: null,
      sidebarMiddleVisible: true,
      messages: dbMessages,
      transferProgress: {},
      transferErrors: {},
      pinnedMessages: savedPinnedMessages || {},
      unreadCounts: {},
      mentionCounts: {},
      lastReadIds: lastReadIds,
      mutedChats: savedMutedChats,
      closedDMs: {},
      pinnedDMs: {},
      readReceipts: {},
      peerPublicKeys: {},
      blockedUsers: savedBlockedUsers,
      ...initialState
    };

    // ONE-TIME MIGRATION: Profile Frames graduated from Experimental to a stable setting.
    // Guard on savedSettings.profileFrames (not the post-spread value) so a user-chosen
    // profileFrames is never clobbered by a stale legacy experimentalProfileFrames value.
    if (savedSettings && typeof savedSettings === 'object' && savedSettings.experimentalProfileFrames !== undefined && savedSettings.profileFrames === undefined) {
      this.state.settings.profileFrames = !!savedSettings.experimentalProfileFrames;
      // Drop the legacy key from the in-memory object; it is persisted back as part of
      // the full settings object on the next settings save.
      delete this.state.settings.experimentalProfileFrames;
    }

    this.listeners = [];
    this._prevActiveChatId = this.state.activeChatId;
    this._messagesFullyLoaded = {};
  }

  // Lazy-load full messages for a chat that was only partially loaded at startup
  loadFullChatMessages(chatId) {
    if (!chatId || this._messagesFullyLoaded[chatId]) return;
    var allMsgs = window.orbitAPI ? window.orbitAPI.dbGetMessages(chatId) : [];
    if (!allMsgs || allMsgs.length === 0) {
      this._messagesFullyLoaded[chatId] = true;
      return;
    }
    if (allMsgs.length > 500) allMsgs = allMsgs.slice(-500);
    this.state.messages[chatId] = allMsgs;
    this.setState({ messages: { ...this.state.messages } });
    this._messagesFullyLoaded[chatId] = true;
  }

  // Force-load ALL messages, images, and files from the database into memory
  loadAllMessages() {
    if (!window.orbitAPI) return;
    var raw = window.orbitAPI.dbAllMessagesRaw();
    if (!raw) return;
    this.state.messages = raw;
    this._messagesFullyLoaded = {};
    Object.keys(raw).forEach(function(id) { this._messagesFullyLoaded[id] = true; }, this);
    this.setState({ messages: raw });
  }

  // Per-account closedDMs helpers
  _loadUserClosedDMs(uid) {
    if (!uid || !window.orbitAPI) return {};
    var allMaps = window.orbitAPI.dbGetSetting('userClosedDMs', {});
    return allMaps[uid] || {};
  }
  _saveUserClosedDMs(uid, map) {
    if (!uid || !window.orbitAPI) return;
    var allMaps = window.orbitAPI.dbGetSetting('userClosedDMs', {});
    allMaps[uid] = map;
    window.orbitAPI.dbSetSetting('userClosedDMs', allMaps);
  }
  // Per-account pinnedDMs helpers
  _loadUserPinnedDMs(uid) {
    if (!uid || !window.orbitAPI) return {};
    var allMaps = window.orbitAPI.dbGetSetting('userPinnedDMs', {});
    return allMaps[uid] || {};
  }
  _saveUserPinnedDMs(uid, map) {
    if (!uid || !window.orbitAPI) return;
    var allMaps = window.orbitAPI.dbGetSetting('userPinnedDMs', {});
    allMaps[uid] = map;
    window.orbitAPI.dbSetSetting('userPinnedDMs', allMaps);
  }

  // Re-load messages from DB filtered to the current user (for account switching)
  reloadDataForCurrentUser() {
    var state = this.state;
    var uid = state.currentUser && state.currentUser.userId;
    if (!uid || !window.orbitAPI) return;
    // On first load for this user, auto-track friends/groups tagged with this account
    var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
    var chatIds = allMaps[uid];
    if (!chatIds || chatIds.length === 0) {
      chatIds = ['local-echo'];
      state.friends.forEach(function(f) { if (f.accountOwnerId === uid && f.userId !== 'local-echo' && chatIds.indexOf(f.userId) === -1) chatIds.push(f.userId); });
      state.groups.forEach(function(g) { if (g.accountOwnerId === uid && chatIds.indexOf(g.groupId) === -1) chatIds.push(g.groupId); });
      allMaps[uid] = chatIds;
      window.orbitAPI.dbSetSetting('userChatIds', allMaps);
    } else {
      // Clean stale chat IDs that belong to other accounts (from old auto-track)
      var cleaned = chatIds.filter(function(id) {
        if (id === 'local-echo') return true;
        var friend = state.friends.find(function(f) { return f.userId === id; });
        if (friend && friend.accountOwnerId && friend.accountOwnerId !== uid) return false;
        var group = state.groups.find(function(g) { return g.groupId === id; });
        if (group && group.accountOwnerId && group.accountOwnerId !== uid) return false;
        return true;
      });
      if (cleaned.length !== chatIds.length) {
        allMaps[uid] = cleaned;
        window.orbitAPI.dbSetSetting('userChatIds', allMaps);
        chatIds = cleaned;
      }
    }
    var data = window.orbitAPI.dbGetAllStartupData(uid);
    if (!data) return;
    // Load per-account closedDMs and pinnedDMs
    var closedDMs = this._loadUserClosedDMs(uid);
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    // Reset messages and UI to Echo for the new account
    var dbFriends = state.friends;
    var echoFriend = {
      userId: 'local-echo', username: 'Orbit Echo', usertag: 'BOT',
      status: 'online', avatar: 'icons/orbit/orbit_default.png',
      bio: 'A local echo channel for testing messages.'
    };
    if (!dbFriends.some(function(f) { return f.userId === 'local-echo'; })) {
      dbFriends = [echoFriend].concat(dbFriends);
      if (window.orbitAPI && window.orbitAPI.dbSaveFriend) window.orbitAPI.dbSaveFriend(echoFriend);
    }
    this.setState({
      messages: data.messages || {},
      // No chat open on load (or on an account switch): the chat panel's empty
      // state is where the welcome slides live, and this used to force Orbit Echo
      // open instead. (Dan, v0.7.0.)
      activeChatId: null,
      activeTab: 'dms',
      unreadCounts: {},
      mentionCounts: {},
      lastReadIds: data.readStates || {},
      closedDMs: closedDMs,
      pinnedDMs: pinnedDMs,
      _userChatIds: allMaps[uid] || []
    });
    if (window.SidebarMiddle) {
      var s = this.state;
      window.SidebarMiddle.renderList(s);
      window.SidebarMiddle.renderGroups();
    }
    console.log('[Store] Messages reloaded for user:', uid);
  }

  // Ensure a chatId is tracked for the current user (per-account message isolation)
  trackChatForCurrentUser(chatId) {
    if (!chatId || !window.orbitAPI) return;
    var uid = this.state.currentUser && this.state.currentUser.userId;
    if (!uid) return;
    var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
    if (!allMaps[uid]) allMaps[uid] = [];
    if (allMaps[uid].indexOf(chatId) === -1) {
      allMaps[uid].push(chatId);
      window.orbitAPI.dbSetSetting('userChatIds', allMaps);
      // Sync in-memory state for render filters
      var ids = this.state._userChatIds || [];
      if (ids.indexOf(chatId) === -1) this.state._userChatIds = ids.concat([chatId]);
    }
  }

  addOrUpdatePeer(peer) {
    const friends = [...this.state.friends];
    const existingIndex = friends.findIndex(f => f.userId === peer.userId);
    
    if (existingIndex >= 0) {
      var existing = friends[existingIndex];
      var updated = { ...existing, ...peer };
      if (peer.lastSeen) updated.lastSeen = peer.lastSeen;
      if (!updated.accountOwnerId) updated.accountOwnerId = existing.accountOwnerId || (this.state.currentUser && this.state.currentUser.userId) || null;
      friends[existingIndex] = updated;
      
      // Track for current account so friend shows up in filtered list
      this.trackChatForCurrentUser(peer.userId);
      
      // If status changed to online
      if (existing.status !== 'online' && peer.status === 'online') {
        this.addSystemLog('peer_connect', 'Peer connected: ' + peer.username);
      } else if (existing.status === 'online' && peer.status === 'offline') {
        this.addSystemLog('peer_disconnect', 'Peer disconnected: ' + peer.username);
      }
      
      // Store peer's public key for E2EE
      if (peer.publicKey) {
        this.setPeerPublicKey(peer.userId, peer.publicKey);
      }
      
      if (window.orbitAPI) window.orbitAPI.dbSaveFriend(updated);
      this.setState({ friends });
      return;
    } else {
      var newPeer = { ...peer };
      if (!newPeer.accountOwnerId) newPeer.accountOwnerId = this.state.currentUser && this.state.currentUser.userId || null;
      if (peer.publicKey) {
        this.setPeerPublicKey(peer.userId, peer.publicKey);
      }
      friends.push(newPeer);
      this.addSystemLog('peer_connect', 'New peer discovered: ' + peer.username);
      this.trackChatForCurrentUser(peer.userId);
      if (window.orbitAPI) window.orbitAPI.dbSaveFriend(newPeer);
      this.setState({ friends });
      return;
    }
  }

  addSystemLog(type, message) {
    var logs = this.state.activityLog || [];
    logs = logs.concat([{
      id: Date.now() + Math.random().toString(36).substring(2),
      type: type,
      message: message,
      timestamp: new Date().toISOString()
    }]);
    if (logs.length > 100) logs = logs.slice(logs.length - 100);
    this.setState({ activityLog: logs });
  }

  setStateBatch(newState) {
    if (!this._batchQueue) this._batchQueue = {};
    Object.assign(this._batchQueue, newState);
    if (!this._batchScheduled) {
      this._batchScheduled = true;
      Promise.resolve().then(() => {
        this._batchScheduled = false;
        const batch = this._batchQueue || {};
        this._batchQueue = null;
        if (Object.keys(batch).length > 0) this.setState(batch);
      });
    }
  }

  _detectFileType(name) {
    if (!name) return 'file';
    const ext = name.split('.').pop().toLowerCase();
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'];
    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', '3gp', 'ogv'];
    if (audioExts.includes(ext)) return 'audio';
    if (videoExts.includes(ext)) return 'video';
    return 'file';
  }

  handleTransferProgress(data) {
    const { fileId, received, total, isSending, name } = data;
    const currentProgress = { ...this.state.transferProgress };
    if (received >= total) {
      delete currentProgress[fileId];
    } else {
      const existing = currentProgress[fileId];
      const resolvedName = name || (existing ? existing.name : undefined);
      var progType = this._detectFileType(resolvedName);
      if (!progType || progType === 'file') {
        progType = existing ? existing.progType : undefined;
      }
      currentProgress[fileId] = { received, total, isSending, name: resolvedName, progType };
    }
    this.setStateBatch({ transferProgress: currentProgress });
  }

  addTransferProgress(name, fileId) {
    const currentProgress = { ...this.state.transferProgress };
    if (!fileId) {
      fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    }
    currentProgress[fileId] = { received: 0, total: 1, isSending: true, name: name };
    this.setState({ transferProgress: currentProgress });
    return fileId;
  }

  handleTransferError(data) {
    const { fileId, error } = data;
    const currentProgress = { ...this.state.transferProgress };
    const prog = currentProgress[fileId];
    const name = prog ? prog.name : 'Unknown file';
    delete currentProgress[fileId];
    const currentErrors = { ...this.state.transferErrors };
    currentErrors[fileId] = { error, name };
    this.setStateBatch({ transferProgress: currentProgress, transferErrors: currentErrors });
    if (window.Toast) {
      window.Toast.show('Transfer Failed', name + ': ' + error);
    }
    // Auto-dismiss errors after 10s
    setTimeout(function() {
      var st = window.store.getState();
      var errs = { ...st.transferErrors };
      delete errs[fileId];
      window.store.setState({ transferErrors: errs });
    }, 10000);
  }

  addGroup(group) {
    const groups = [...this.state.groups];
    const existing = groups.findIndex(g => g.groupId === group.groupId);
    
    // Generate invite code for new groups
    if (!group.inviteCode) {
      var arr = new Uint8Array(4);
      if (window.crypto) window.crypto.getRandomValues(arr);
      else arr = [Math.random()*255|0, Math.random()*255|0, Math.random()*255|0, Math.random()*255|0];
      group.inviteCode = Array.prototype.map.call(arr, function(b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }
    
    var tagged = { ...group };
    if (!tagged.accountOwnerId) tagged.accountOwnerId = this.state.currentUser && this.state.currentUser.userId || null;
    
    if (existing >= 0) {
      groups[existing] = { ...groups[existing], ...tagged };
    } else {
      groups.push(tagged);
    }
    if (window.orbitAPI) window.orbitAPI.dbSaveGroup(tagged);
    this.setState({ groups });
  }

  removeGroup(groupId) {
    const groups = this.state.groups.filter(g => g.groupId !== groupId);
    if (window.orbitAPI) window.orbitAPI.dbDeleteGroup(groupId);
    const messages = { ...this.state.messages };
    delete messages[groupId];
    const pinnedMessages = { ...this.state.pinnedMessages };
    delete pinnedMessages[groupId];
    const unreadCounts = { ...this.state.unreadCounts };
    delete unreadCounts[groupId];
    const mentionCounts = { ...this.state.mentionCounts };
    delete mentionCounts[groupId];
    const lastReadIds = { ...this.state.lastReadIds };
    delete lastReadIds[groupId];
    const mutedChats = { ...this.state.mutedChats };
    delete mutedChats[groupId];
    this.setState({ groups, messages, pinnedMessages, unreadCounts, mentionCounts, lastReadIds, mutedChats });
  }

  removeFriend(userId) {
    const friends = this.state.friends.filter(function(f) { return f.userId !== userId; });
    if (window.orbitAPI) window.orbitAPI.dbDeleteFriend(userId);
    const messages = { ...this.state.messages };
    delete messages[userId];
    const pinnedMessages = { ...this.state.pinnedMessages };
    delete pinnedMessages[userId];
    const unreadCounts = { ...this.state.unreadCounts };
    delete unreadCounts[userId];
    const mentionCounts = { ...this.state.mentionCounts };
    delete mentionCounts[userId];
    const lastReadIds = { ...this.state.lastReadIds };
    delete lastReadIds[userId];
    const mutedChats = { ...this.state.mutedChats };
    delete mutedChats[userId];
    this.setState({ friends, messages, pinnedMessages, unreadCounts, mentionCounts, lastReadIds, mutedChats });
  }

  closeDM(userId) {
    // Orbit Echo is the app's own bot and the one DM that has to stay reachable.
    // A closed DM is filtered out of the sidebar, and Echo is not a peer you can
    // re-add — so closing it removed the only way back to it.
    if (userId === 'local-echo') {
      if (window.Toast) {
        window.Toast.show('Orbit Echo cannot be closed', 'It is always available in your DMs', 'info');
      }
      return;
    }
    // Closing only hides the DM. This used to delete messages[userId] and
    // pinnedMessages[userId] out of state — and state is persisted — so
    // "Close DM" destroyed the very conversation it was closing. The messages and
    // pins now stay exactly where they are; only the sidebar entry is hidden, and
    // the All Friends tab (or a new message) brings it back.
    const unreadCounts = { ...this.state.unreadCounts };
    delete unreadCounts[userId];
    const mentionCounts = { ...this.state.mentionCounts };
    delete mentionCounts[userId];
    const lastReadIds = { ...this.state.lastReadIds };
    delete lastReadIds[userId];
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var closedDMs = this._loadUserClosedDMs(uid);
    closedDMs = { ...closedDMs, [userId]: true };
    this._saveUserClosedDMs(uid, closedDMs);
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    delete pinnedDMs[userId];
    this._saveUserPinnedDMs(uid, pinnedDMs);
    // Closing the DM you are reading drops you back to the welcome screen rather
    // than into Orbit Echo.
    var nextActive = this.state.activeChatId === userId ? null : this.state.activeChatId;
    this.setState({ unreadCounts, mentionCounts, lastReadIds, pinnedDMs, closedDMs, activeChatId: nextActive });
    if (window.Toast) {
      window.Toast.show('DM closed', 'The conversation is kept — reopen it from All Friends');
    }
  }

  togglePinDM(userId) {
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var pinnedDMs = this._loadUserPinnedDMs(uid);
    if (pinnedDMs[userId]) {
      delete pinnedDMs[userId];
    } else {
      pinnedDMs = { ...pinnedDMs, [userId]: true };
    }
    this._saveUserPinnedDMs(uid, pinnedDMs);
    this.setState({ pinnedDMs });
  }

  reopenDM(userId) {
    const uid = this.state.currentUser && this.state.currentUser.userId;
    var closedDMs = this._loadUserClosedDMs(uid);
    delete closedDMs[userId];
    this._saveUserClosedDMs(uid, closedDMs);
    this.setState({ closedDMs, activeChatId: userId });
  }

  removeGroupMember(groupId, userId) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        return { ...g, members: g.members.filter(m => m.userId !== userId) };
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbRemoveGroupMember(groupId, userId);
    // If removing self, untrack this chat for the current account
    var uid = this.state.currentUser && this.state.currentUser.userId;
    if (uid && userId === uid) {
      var allMaps = window.orbitAPI.dbGetSetting('userChatIds', {});
      if (allMaps[uid]) {
        allMaps[uid] = allMaps[uid].filter(function(id) { return id !== groupId; });
        window.orbitAPI.dbSetSetting('userChatIds', allMaps);
      }
      var ids = this.state._userChatIds || [];
      this.state._userChatIds = ids.filter(function(id) { return id !== groupId; });
    }
    this.setState({ groups });
  }

  setMemberRole(groupId, userId, role) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) {
        return { ...g, members: g.members.map(m => m.userId === userId ? { ...m, role: role } : m) };
      }
      return g;
    });
    if (window.orbitAPI) window.orbitAPI.dbSetMemberRole(groupId, userId, role);
    this.setState({ groups });
  }

  addMemberToGroup(groupId, user) {
    const groups = this.state.groups.map(g => {
      if (g.groupId !== groupId) return g;
      const members = g.members || [];
      if (!members.find(m => m.userId === user.userId)) {
        var friend = this.state.friends.find(function(f) { return f.userId === user.userId; });
        var enrichedUser = friend
          ? { ...user, username: user.username || friend.username, avatar: user.avatar || friend.avatar || null, usertag: user.usertag || friend.usertag || '', publicKey: user.publicKey || friend.publicKey || null }
          : { ...user, avatar: user.avatar || null };
        if (window.orbitAPI) window.orbitAPI.dbAddGroupMember(groupId, enrichedUser);
        return { ...g, members: [...members, { ...enrichedUser, joinedAt: user.joinedAt || new Date().toISOString() }] };
      }
      return g;
    });
    this.setState({ groups });
  }

  updateGroupField(groupId, field, value) {
    const groups = this.state.groups.map(g => {
      if (g.groupId === groupId) return { ...g, [field]: value };
      return g;
    });
    this.setState({ groups });
    if (window.orbitAPI) window.orbitAPI.dbUpdateGroupField(groupId, field, value);
  }

  getGroupMembers(groupId) {
    const group = this.state.groups.find(g => g.groupId === groupId);
    return group ? (group.members || []) : [];
  }

  handleIncomingPacket(packet) {
    if (!packet || !packet.payload) return;

    // Block messages from blocked users
    if (packet.from && this.state.blockedUsers && this.state.blockedUsers.indexOf(packet.from) !== -1) {
      return;
    }
    if (packet.type === window.Protocol.Types.GROUP_CREATE) {
      const { groupId, groupName, ownerId, members, groupAvatar } = packet.payload;
      const existingGroup = this.state.groups.find(g => g.groupId === groupId);
      if (!existingGroup) {
        var enrichedMembers = (members || []).map(function(m) {
          var friend = window.store ? window.store.getState().friends.find(function(f) { return f.userId === m.userId; }) : null;
          if (friend) {
            return { ...m, username: m.username || friend.username, avatar: m.avatar || friend.avatar || null, usertag: m.usertag || friend.usertag || '', publicKey: m.publicKey || friend.publicKey || null };
          }
          return m;
        });
        for (var mi = 0; mi < enrichedMembers.length; mi++) {
          if (enrichedMembers[mi].publicKey) {
            this.setPeerPublicKey(enrichedMembers[mi].userId, enrichedMembers[mi].publicKey);
          }
        }
        const group = {
          groupId,
          groupName,
          ownerId,
          avatarDataUrl: groupAvatar || null,
          members: enrichedMembers,
          createdAt: packet.timestamp || new Date().toISOString()
        };
        this.addGroup(group);
        var msgs = { ...this.state.messages };
        if (!msgs[groupId]) msgs[groupId] = [];
        this.setState({ messages: msgs });
        if (window.Toast) window.Toast.show('New Group', 'You were added to ' + groupName);
        if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
          window.orbitAPI.showNotification('New Group', 'You were added to ' + groupName);
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_INVITE) {
      const { groupId, groupName, inviter, members, groupAvatar } = packet.payload;
      var inviteGroup = this.state.groups.find(function(g) { return g.groupId === groupId; });
      if (!inviteGroup && groupId) {
        var group = {
          groupId: groupId,
          groupName: groupName || 'Invited Group',
          ownerId: packet.from,
          avatarDataUrl: groupAvatar || null,
          members: members || [],
          createdAt: new Date().toISOString()
        };
        this.addGroup(group);
        var msgs = { ...this.state.messages };
        if (!msgs[groupId]) msgs[groupId] = [];
        this.setState({ messages: msgs });
      }
      if (window.Toast) window.Toast.show('Group Invite', inviter + ' invited you to ' + (groupName || 'a group'));
      if (document.hidden && window.orbitAPI && window.orbitAPI.showNotification) {
        window.orbitAPI.showNotification('Group Invite', inviter + ' invited you to ' + (groupName || 'a group'));
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_JOIN_REQUEST) {
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_JOIN_RESPONSE) {
      const { groupId, groupName, groupAvatar, accepted, members } = packet.payload;
      if (accepted && groupId) {
        var existing = this.state.groups.find(function(g) { return g.groupId === groupId; });
        if (!existing) {
          // Store group member public keys for E2EE
          if (members) {
            var self = this;
            members.forEach(function(m) {
              if (m.publicKey) {
                self.setPeerPublicKey(m.userId, m.publicKey);
              }
            });
          }
          var group = {
            groupId: groupId,
            groupName: groupName || 'Group',
            ownerId: packet.from,
            avatarDataUrl: groupAvatar || null,
            members: members || [],
            createdAt: new Date().toISOString()
          };
          this.addGroup(group);
          var msgs = { ...this.state.messages };
          if (!msgs[groupId]) msgs[groupId] = [];
          this.setState({ messages: msgs, activeChatId: groupId });
          if (window.Toast) window.Toast.show('Joined Group', 'You are now a member of ' + (groupName || 'Group'));
        }
      } else {
        if (window.Toast) window.Toast.show('Join Denied', 'Your request to join was denied.');
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_LEAVE) {
      const { groupId, userId } = packet.payload;
      var leaverGroup = this.state.groups.find(function(g) { return g.groupId === groupId; });
      if (leaverGroup) {
        var leaver = leaverGroup.members ? leaverGroup.members.find(function(m) { return m.userId === userId; }) : null;
        var isSelf = userId === this.state.currentUser.userId;
        if (isSelf) {
          this.removeGroup(groupId);
        } else {
          this.removeGroupMember(groupId, userId);
        }
        if (window.Toast) {
          window.Toast.show(isSelf ? 'Left Group' : 'Member Left', (isSelf ? 'You left ' : (leaver ? leaver.username : 'Someone') + ' left ') + leaverGroup.groupName);
          if (isSelf && this.state.activeChatId === groupId) {
            this.setState({ activeChatId: null });
          }
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_MEMBER_ADDED) {
      const { groupId, user } = packet.payload;
      if (groupId && user && user.userId) {
        this.addMemberToGroup(groupId, user);
        var gmGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (gmGroup && gmGroup.members && gmGroup.members.some(function(m) { return m.userId === user.userId; })) {
          var updatedGroups = this.state.groups.map(function(gg) {
            if (gg.groupId === groupId && gg.members) {
              return {
                ...gg,
                members: gg.members.map(function(m) {
                  if (m.userId === user.userId) {
                    var updated = { ...m };
                    if (user.avatar !== undefined) updated.avatar = user.avatar;
                    if (user.usertag !== undefined) updated.usertag = user.usertag;
                    if (user.status !== undefined) updated.status = user.status;
                    if (user.publicKey !== undefined) updated.publicKey = user.publicKey;
                    return updated;
                  }
                  return m;
                })
              };
            }
            return gg;
          });
          this.setState({ groups: updatedGroups });
        }
        gmGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (user.publicKey) {
          this.setPeerPublicKey(user.userId, user.publicKey);
        }
        if (window.Toast) window.Toast.show('New Member', (user.username || 'Someone') + ' was added to ' + (gmGroup ? gmGroup.groupName : 'group'));
      }
      return;
    }

    if (packet.type === window.Protocol.Types.GROUP_OWNER_TRANSFER) {
      const { groupId, newOwnerId } = packet.payload;
      if (groupId && newOwnerId) {
        var tGroup = this.state.groups.find(function(gg) { return gg.groupId === groupId; });
        if (tGroup) {
          var oldOwnerId = tGroup.ownerId;
          this.updateGroupField(groupId, 'ownerId', newOwnerId);
          if (oldOwnerId) this.setMemberRole(groupId, oldOwnerId, 'member');
          this.setMemberRole(groupId, newOwnerId, 'owner');
          if (window.Toast) {
            var newOwner = tGroup.members ? tGroup.members.find(function(m) { return m.userId === newOwnerId; }) : null;
            window.Toast.show('Ownership Transferred', 'Group ownership transferred to ' + (newOwner ? newOwner.username : 'someone'));
          }
        }
      }
      return;
    }

    if (packet.type === window.Protocol.Types.REACTION) {
      const { msgId, emoji, action, userId, chatId: payloadChatId, groupId } = packet.payload;
      // Defensive: trust groupId for group reactions, otherwise fall back to packet.from (DM sender)
      const chatId = groupId || payloadChatId || packet.from || packet.to;
      const msgs = { ...this.state.messages };
      if (msgs[chatId]) {
        msgs[chatId] = msgs[chatId].map(m => {
          if (String(m.id) === String(msgId)) {
            const reactions = m.reactions ? [...m.reactions] : [];
            const existingIdx = reactions.findIndex(r => r.emoji === emoji && r.userId === userId);
            if (action === 'add' && existingIdx < 0) {
              reactions.push({ emoji, userId });
            } else if (action === 'remove' && existingIdx >= 0) {
              reactions.splice(existingIdx, 1);
            }
            return { ...m, reactions };
          }
          return m;
        });
        this.setState({ messages: msgs });
      }
      return;
    }

    // Typing indicator — handled via direct listener in app.js
    if (packet.type === window.Protocol.Types.SETTINGS_SYNC) {
      // A settings payload from ANOTHER DEVICE OF MINE. Anyone else's theme is their business,
      // so the sender is checked before the payload is even looked at — the module validates the
      // contents, but only this check decides whether we should be listening at all.
      if (!window.OrbitSettingsSync) return;
      var syncMe = this.state.currentUser ? this.state.currentUser.userId : null;
      if (!window.OrbitSettingsSync.isOwnDevice(packet.from, syncMe)) return;

      var syncRes = window.OrbitSettingsSync.apply(this.state.settings, packet.payload);
      if (!syncRes) return;   // older than what we have, or nothing usable in it

      this.setState({ settings: syncRes.settings });
      if (window.Storage) window.Storage.set('settings', syncRes.settings);
      if (window.App && window.App.applySettings) window.App.applySettings(syncRes.settings);
      return;
    }

    // ── Account transfer ──
    // A phone asking to copy this account. LinkPhone owns the whole flow: it
    // checks the token, confirms with the user, and sends. The store only routes.
    if (packet.type === window.Protocol.Types.TRANSFER_REQUEST) {
      if (window.OrbitLinkPhone) window.OrbitLinkPhone.handleRequest(packet);
      return;
    }
    if (packet.type === window.Protocol.Types.TRANSFER_RESULT) {
      if (window.OrbitLinkPhone) window.OrbitLinkPhone.handleResult(packet);
      return;
    }

    if (packet.type === window.Protocol.Types.TYPING) {
      return;
    }

    // Basic message handling logic
    if (packet.type === window.Protocol.Types.MESSAGE) {
      if (window._p2pRecvCount !== undefined) window._p2pRecvCount++;
      const fromId = packet.payload.chatId || packet.payload.groupId || packet.from;
      var text = packet.payload.text || (typeof packet.payload === 'string' ? packet.payload : '');

      // Decrypt E2EE messages. Two envelope shapes are accepted: the unified
      // ciphertext/nonce pair (mobile, and desktop v0.6+) and the legacy packed
      // string carried in `text` (older desktop builds).
      if (packet.payload.e2ee && this.state.settings.e2eeEnabled) {
        var decrypted = null;
        if (packet.payload.ciphertext) {
          decrypted = this.e2eeDecryptMessageV2(packet.payload.ciphertext, packet.payload.nonce, packet.from);
        } else {
          decrypted = this.e2eeDecryptMessage(text, packet.from);
        }
        if (decrypted) text = decrypted;
      }

      this.addMessage(fromId, {
        id: packet.payload.msgId || packet.packetId || Date.now(),
        sender: packet.from,
        text: text,
        timestamp: packet.timestamp || new Date().toISOString(),
        replyTo: packet.payload.replyTo,
        attachments: packet.payload.attachments
      });

      // Auto-reopen DM if it was closed
      if (this.state.closedDMs && this.state.closedDMs[fromId]) {
        const uid = this.state.currentUser && this.state.currentUser.userId;
        var closedDMs = this._loadUserClosedDMs(uid);
        delete closedDMs[fromId];
        this._saveUserClosedDMs(uid, closedDMs);
        this.setState({ closedDMs });
      }

      // Clear typing indicator for sender
      if (window.TypingState) {
        window.TypingState.removeUser(fromId, packet.from);
      }

      // Play notification sound
      var settings = this.state.settings || {};
      var isMuted = this.state.mutedChats && this.state.mutedChats[fromId];
      if (settings.notifySound && !settings.notifyDnd && !isMuted && window.NotificationSound) {
        window.NotificationSound.play({ volume: settings.notifyVolume, type: settings.notifySoundType });
      }

      // Notifications
      if (this.state.activeChatId !== fromId || document.hidden) {
        const isGroup = this.state.groups.find(g => g.groupId === fromId);
        if (isGroup && isGroup.notificationMuted) return;
        if (this.state.mutedChats && this.state.mutedChats[fromId]) return;
        let senderName = 'Unknown';
        let senderAvatar = null;
        if (isGroup) {
          const member = isGroup.members.find(m => m.userId === packet.from);
          senderName = member ? member.username : (isGroup.groupName || 'Group');
          senderAvatar = member ? member.avatar : null;
        } else {
          const friend = this.state.friends.find(f => f.userId === packet.from);
          if (friend) {
            senderName = friend.username;
            senderAvatar = friend.avatar;
          }
        }
        let preview = text;
        if (preview.length > 50) preview = preview.substring(0, 50) + '...';
        const title = isGroup ? senderName + ' in ' + isGroup.groupName : senderName;
        
        if (document.hidden) {
           if (window.orbitAPI && window.orbitAPI.showNotification) {
             window.orbitAPI.showNotification('New message from ' + title, preview, senderAvatar);
           }
        } else if (window.Toast) {
           window.Toast.show(title, preview, senderAvatar);
        }
      }
    } else if (packet.type === window.Protocol.Types.SYSTEM) {
      // Handle edit/delete sync
      const payload = packet.payload;
      if (payload && payload.action === 'delete' && payload.msgId) {
        this.deleteMessage(payload.chatId || packet.from, payload.msgId);
      } else if (payload && payload.action === 'pin_order' && Array.isArray(payload.order)) {
        // Someone else rearranged the pins. Apply their order silently — we are not the
        // one who changed it — then post the note with THEIR name on it.
        var _chatId = payload.chatId || packet.from;
        this.reorderPinned(_chatId, payload.order, { silent: true });
        var _P = window.OrbitPinned;
        if (_P) this._postSystemNote(_chatId, _P.orderChangedText(payload.by));
      }
    } else if (packet.type === window.Protocol.Types.PIN_MESSAGE) {
      const { msgId, groupId } = packet.payload;
      this.pinMessage(groupId || packet.from, msgId);
      return;
    } else if (packet.type === window.Protocol.Types.UNPIN_MESSAGE) {
      const { msgId, groupId } = packet.payload;
      this.unpinMessage(groupId || packet.from, msgId);
      return;
    } else if (packet.type === window.Protocol.Types.MESSAGE_EDIT) {
      const { msgId, newText, chatId } = packet.payload;
      this.editMessage(chatId || packet.from, msgId, newText);
    } else if (packet.type === window.Protocol.Types.MESSAGE_DELETE) {
      const { msgId, chatId } = packet.payload;
      this.deleteMessage(chatId || packet.from, msgId);
    } else if (packet.type === window.Protocol.Types.READ) {
      const { chatId, lastReadMsgId } = packet.payload;
      if (chatId && lastReadMsgId) {
        const readReceipts = { ...this.state.readReceipts };
        if (!readReceipts[chatId]) readReceipts[chatId] = {};
        readReceipts[chatId][packet.from] = lastReadMsgId;
        this.setState({ readReceipts });
      }
    }
  }

  // --- E2EE Helpers ---

  getPeerPublicKey(peerId) {
    var state = this.state;
    var friend = state.friends.find(function(f) { return f.userId === peerId; });
    if (friend && friend.publicKey) return friend.publicKey;
    var group = state.groups.find(function(g) { return g.groupId === peerId; });
    if (group && group.publicKey) return group.publicKey;
    // Check all group members (for non-friend group members)
    for (var gi = 0; gi < state.groups.length; gi++) {
      var gMembers = state.groups[gi].members || [];
      for (var mj = 0; mj < gMembers.length; mj++) {
        if (gMembers[mj].userId === peerId && gMembers[mj].publicKey) return gMembers[mj].publicKey;
      }
    }
    return state.peerPublicKeys[peerId] || null;
  }

  setPeerPublicKey(peerId, publicKey) {
    var peerPublicKeys = { ...this.state.peerPublicKeys };
    peerPublicKeys[peerId] = publicKey;
    // Also store on friend if applicable
    var friends = this.state.friends.map(function(f) {
      if (f.userId === peerId) return { ...f, publicKey: publicKey };
      return f;
    });
    this.setState({ peerPublicKeys: peerPublicKeys, friends: friends });
  }

  // NOTE: there is deliberately no e2eeEncryptMessage() here.
  //
  // An earlier version had one, and it returned the PLAINTEXT whenever
  // encryption was unavailable — a silent downgrade. It had no callers, so it
  // was removed rather than fixed: reviving it would silently reintroduce that
  // bug. Outgoing DMs are encrypted in chat-panel.js sendMessage(), which blocks
  // the send and tells the user instead.
  // See plans/docs/Orbit E2EE Unification Design.md §5.2

  e2eeDecryptMessage(ciphertext, fromId) {
    if (!ciphertext || !this.state.settings.e2eeEnabled) return ciphertext;
    var pubKey = this.getPeerPublicKey(fromId);
    if (!pubKey || !window.orbitAPI) return ciphertext;
    return window.orbitAPI.e2eeDecrypt(ciphertext, pubKey) || ciphertext;
  }

  // Unified envelope: ciphertext and nonce arrive as separate fields.
  // Returns null on failure so the caller keeps the original (unreadable) text
  // rather than rendering ciphertext as if it were a message.
  e2eeDecryptMessageV2(ciphertext, nonce, fromId) {
    if (!ciphertext || !this.state.settings.e2eeEnabled) return null;
    var pubKey = this.getPeerPublicKey(fromId);
    if (!pubKey || !window.orbitAPI || !window.orbitAPI.e2eeDecryptV2) return null;
    return window.orbitAPI.e2eeDecryptV2(ciphertext, nonce, pubKey);
  }

  addMessage(chatId, messageObj) {
    const MAX_MSGS = 500;
    const msgs = { ...this.state.messages };
    if (!msgs[chatId]) msgs[chatId] = [];
    if (messageObj.id && msgs[chatId].some(function(m) { return m.id === messageObj.id; })) return;
    msgs[chatId] = [...msgs[chatId], messageObj];
    if (msgs[chatId].length > MAX_MSGS) msgs[chatId] = msgs[chatId].slice(-MAX_MSGS);

    if (window.orbitAPI) {
      window.orbitAPI.dbAddMessage(chatId, messageObj);
      this.trackChatForCurrentUser(chatId);
    }

    // Track unread if not the active chat
    const isActive = this.state.activeChatId === chatId && !document.hidden;
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };

    if (!isActive) {
      // Don't increment unread for own messages
      if (messageObj.sender !== this.state.currentUser.userId) {
        unreadCounts[chatId] = (unreadCounts[chatId] || 0) + 1;
      }
    }

    // Detect @mentions referencing current user (always, even when active)
    const currentUser = this.state.currentUser;
    if (messageObj.sender !== currentUser.userId && messageObj.text) {
      const text = messageObj.text;
      if (text.includes('@' + currentUser.username) || text.includes('@' + currentUser.usertag) || text.includes('@everyone') || text.includes('@here')) {
        mentionCounts[chatId] = (mentionCounts[chatId] || 0) + 1;
        if (window.orbitAPI) {
          window.orbitAPI.dbAddMention(chatId, messageObj.id, messageObj.sender);
        }
      }
    }

    // Track own message sends for undo/redo
    if (window.UndoManager && !window.UndoManager._paused && messageObj.sender === this.state.currentUser.userId) {
      var _addedChatId = chatId;
      var _addedMsg = messageObj;
      window.UndoManager.pushAction('Send message', function() {
        // Undo: delete the message
        var st = window.store.getState();
        var m = st.messages && st.messages[_addedChatId];
        if (m) {
          var f = m.filter(function(x) { return x.id !== _addedMsg.id; });
          var u = { ...st.messages };
          u[_addedChatId] = f;
          window.store.setState({ messages: u });
          if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_addedChatId, f);
        }
      }, function() {
        // Redo: note — re-send not fully supported for attachments
        var st = window.store.getState();
        var m = st.messages && st.messages[_addedChatId] || [];
        var restored = [...m, _addedMsg];
        restored.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
        var u = { ...st.messages };
        u[_addedChatId] = restored;
        window.store.setState({ messages: u });
        if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_addedChatId, restored);
        if (window.Toast) window.Toast.show('Redo', 'Message restored locally. Re-send manually if needed.', 'info', 3000);
      }, { isAttachment: !!(messageObj.attachments && messageObj.attachments.length > 0) });
    }

    this.setState({ messages: msgs, unreadCounts, mentionCounts });
  }

  markAsRead(chatId) {
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };
    const lastReadIds = { ...this.state.lastReadIds };
    delete unreadCounts[chatId];
    delete mentionCounts[chatId];
    if (window.orbitAPI) {
      const msgs = this.state.messages[chatId];
      if (msgs && msgs.length > 0) {
        const lastId = msgs[msgs.length - 1].id;
        window.orbitAPI.dbSetReadState(chatId, lastId);
        lastReadIds[chatId] = lastId;
      }
      window.orbitAPI.dbClearMentions(chatId);
    }
    this.setState({ unreadCounts, mentionCounts, lastReadIds });
  }

  toggleMute(chatId) {
    const mutedChats = { ...this.state.mutedChats };
    if (mutedChats[chatId]) {
      delete mutedChats[chatId];
    } else {
      mutedChats[chatId] = true;
    }
    if (window.orbitAPI) window.orbitAPI.dbSetSetting('mutedChats', mutedChats);
    this.setState({ mutedChats });
  }

  // --- Chat Folders (experimental, local-only) ---
  // Persist folders inside the settings JSON, the same way settings persist:
  // dual-write to the electron-store JSON (Storage) AND the SQLite settings
  // table (which is what dbGetAllStartupData() reads at startup).
  _persistSettings() {
    var settings = this.state.settings;
    if (window.Storage) window.Storage.set('settings', settings);
    if (window.orbitAPI && window.orbitAPI.dbSetSetting) window.orbitAPI.dbSetSetting('settings', settings);
  }

  _setFolders(folders) {
    var settings = { ...this.state.settings, chatFolders: folders };
    this.setState({ settings: settings });
    this._persistSettings();
  }

  getFolders() {
    return (this.state.settings && this.state.settings.chatFolders) || [];
  }

  getFolderById(id) {
    return this.getFolders().find(function(f) { return f.id === id; }) || null;
  }

  createFolder(name) {
    name = String(name || '').trim();
    if (!name) return null;
    if (name.length > 32) name = name.substring(0, 32);
    var id = 'folder_' + Date.now();
    var folders = this.getFolders().concat([{ id: id, name: name, chatIds: [] }]);
    this._setFolders(folders);
    if (window.Toast) window.Toast.show('Folder Created', '"' + name + '" created');
    return id;
  }

  renameFolder(id, name) {
    name = String(name || '').trim();
    if (!name) return;
    if (name.length > 32) name = name.substring(0, 32);
    var folders = this.getFolders().map(function(f) {
      if (f.id === id) return { ...f, name: name };
      return f;
    });
    this._setFolders(folders);
  }

  deleteFolder(id) {
    var folders = this.getFolders().filter(function(f) { return f.id !== id; });
    var settings = { ...this.state.settings, chatFolders: folders };
    var patch = { settings: settings };
    if (this.state.activeFolder === id) patch.activeFolder = null;
    // Single atomic setState: subscribers see the folder removed AND the
    // activeFolder reset in one pass — no intermediate render can reference
    // the deleted folder, and the persist always runs after the state change.
    this.setState(patch);
    this._persistSettings();
  }

  addChatToFolder(folderId, chatKey) {
    var key = { kind: chatKey.kind, id: chatKey.id };
    var folders = this.getFolders().map(function(f) {
      if (f.id !== folderId) return f;
      if (f.chatIds.some(function(k) { return k && k.kind === key.kind && String(k.id) === String(key.id); })) return f;
      return { ...f, chatIds: f.chatIds.concat([key]) };
    });
    this._setFolders(folders);
  }

  removeChatFromFolder(folderId, chatKey) {
    var folders = this.getFolders().map(function(f) {
      if (f.id !== folderId) return f;
      return { ...f, chatIds: f.chatIds.filter(function(k) {
        if (k && typeof k === 'object' && k.kind !== undefined) return !(k.kind === chatKey.kind && String(k.id) === String(chatKey.id));
        // Legacy raw-string entries are treated as friend ids
        return String(k) !== String(chatKey.id);
      }) };
    });
    this._setFolders(folders);
  }

  isChatInFolder(folderId, chatKey) {
    var folder = this.getFolderById(folderId);
    if (!folder || !folder.chatIds) return false;
    return folder.chatIds.some(function(k) {
      if (k && typeof k === 'object' && k.kind !== undefined) return k.kind === chatKey.kind && String(k.id) === String(chatKey.id);
      return String(k) === String(chatKey.id);
    });
  }

  editMessage(chatId, msgId, newText) {
    const msgs = { ...this.state.messages };
    if (msgs[chatId]) {
      msgs[chatId] = msgs[chatId].map(m => {
        if (m.id == msgId) {
          return { ...m, text: newText, edited: true };
        }
        return m;
      });
      if (window.orbitAPI) window.orbitAPI.dbEditMessage(chatId, msgId, newText);

      // Track own message edits for undo/redo
      if (window.UndoManager && !window.UndoManager._paused && msgs[chatId]) {
        var _editChatId = chatId;
        var _editMsgId = msgId;
        var _oldMsg = this.state.messages[chatId] ? this.state.messages[chatId].find(function(m) { return String(m.id) === String(msgId); }) : null;
        var _oldText = _oldMsg ? _oldMsg.text : '';
        var _newText = newText;
        if (_oldMsg && (_oldMsg.sender === this.state.currentUser.userId || !_oldMsg.sender) && _oldText !== _newText) {
          window.UndoManager.pushAction('Edit message', function() {
            // Undo: restore old text
            var st = window.store.getState();
            var m = st.messages && st.messages[_editChatId];
            if (m) {
              var u = m.map(function(x) {
                if (String(x.id) === String(_editMsgId)) return { ...x, text: _oldText, edited: true };
                return x;
              });
              var ms = { ...st.messages };
              ms[_editChatId] = u;
              window.store.setState({ messages: ms });
              if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_editChatId, u);
            }
          }, function() {
            // Redo: re-apply new text
            var st = window.store.getState();
            var m = st.messages && st.messages[_editChatId];
            if (m) {
              var u = m.map(function(x) {
                if (String(x.id) === String(_editMsgId)) return { ...x, text: _newText, edited: true };
                return x;
              });
              var ms = { ...st.messages };
              ms[_editChatId] = u;
              window.store.setState({ messages: ms });
              if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_editChatId, u);
            }
          });
        }
      }

      this.setState({ messages: msgs });
    }
  }

  deleteMessage(chatId, msgId) {
    const msgs = { ...this.state.messages };
    if (msgs[chatId]) {
      // Track own message deletes for undo/redo
      var _deletedMsg = null;
      if (window.UndoManager && !window.UndoManager._paused && msgs[chatId]) {
        var _delChatId = chatId;
        var _delMsgId = msgId;
        _deletedMsg = msgs[chatId].find(function(m) { return String(m.id) === String(msgId); });
        if (_deletedMsg && (_deletedMsg.sender === this.state.currentUser.userId || !_deletedMsg.sender)) {
          var _capturedMsg = _deletedMsg;
          window.UndoManager.pushAction('Delete message', function() {
            // Undo: restore the deleted message
            var st = window.store.getState();
            var m = st.messages && st.messages[_delChatId] || [];
            var restored = [...m, _capturedMsg];
            restored.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
            var u = { ...st.messages };
            u[_delChatId] = restored;
            window.store.setState({ messages: u });
            if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_delChatId, restored);
          }, function() {
            // Redo: delete again
            var st = window.store.getState();
            var m = st.messages && st.messages[_delChatId];
            if (m) {
              var f = m.filter(function(x) { return String(x.id) !== String(_delMsgId); });
              var u = { ...st.messages };
              u[_delChatId] = f;
              window.store.setState({ messages: u });
              if (window.orbitAPI && window.orbitAPI.dbSaveMessages) window.orbitAPI.dbSaveMessages(_delChatId, f);
            }
          });
        }
      }

      msgs[chatId] = msgs[chatId].filter(m => m.id != msgId);
      if (window.orbitAPI) window.orbitAPI.dbDeleteMessage(chatId, msgId);
      this.setState({ messages: msgs });

      // A pinned message that no longer exists leaves the pinned list at once. The
      // alternative is a pinned row that scrolls to nothing, which reads as a bug.
      this._prunePinned(chatId);
    }
  }

  /* Send the whitelisted settings to my OTHER DEVICES — the friends whose userId is my own.
     Deliberately not "to everyone": a peer with my userId is me on another machine, and a peer
     without it is someone else.

     build() returns null when nothing on the whitelist is worth sending, so a caller can fire
     this on every settings change without checking first. */
  broadcastSettings(settings) {
    if (!window.OrbitSettingsSync || !window.orbitAPI) return false;
    var payload = window.OrbitSettingsSync.build(settings);
    if (!payload) return false;

    var me = this.state.currentUser ? this.state.currentUser.userId : null;
    if (!me) return false;

    var sent = 0;
    this.state.friends.forEach(function (f) {
      if (window.OrbitSettingsSync.isOwnDevice(f.userId, me)) {
        window.orbitAPI.networkSend(f.userId, f.ip || '', window.Protocol.Types.SETTINGS_SYNC, payload);
        sent++;
      }
    });
    return sent > 0;
  }

  sendReaction(chatId, msgId, emoji, action) {
    const state = this.state;
    const members = this.getGroupMembers(chatId);

    if (window.orbitAPI) {
      if (members.length > 0) {
        members.forEach(m => {
          if (m.userId !== state.currentUser.userId) {
            window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId, groupId: chatId });
          }
        });
      } else {
        const friend = state.friends.find(f => f.userId === chatId);
        if (friend) {
          // DM reaction: NO chatId in payload (would overwrite receiver's chat lookup)
          window.orbitAPI.networkSend(chatId, friend.ip || '', window.Protocol.Types.REACTION, { msgId, emoji, action, userId: state.currentUser.userId });
        }
      }
    }

    // Update locally immediately
    const msgs = { ...state.messages };
    if (msgs[chatId]) {
      msgs[chatId] = msgs[chatId].map(m => {
        if (String(m.id) === String(msgId)) {
          const reactions = m.reactions ? [...m.reactions] : [];
          const existingIdx = reactions.findIndex(r => r.emoji === emoji && r.userId === state.currentUser.userId);
          if (action === 'add' && existingIdx < 0) {
            reactions.push({ emoji, userId: state.currentUser.userId });
          } else if (action === 'remove' && existingIdx >= 0) {
            reactions.splice(existingIdx, 1);
          }
          return { ...m, reactions };
        }
        return m;
      });
      this.setState({ messages: msgs });
    }
  }

  // What a pinned message should be called in a list.
  //
  // A file-only message has no text, and the old fallback was the literal string
  // "(attachment)" — so pinning a photo or a document produced a pin labelled
  // "(attachment)", which tells you nothing about which one it is. The chat list already
  // names attachments for exactly this reason; this uses the same vocabulary.
  //
  // The name first (the user knows the file), the kind second (a photo pasted from the
  // clipboard has no name), and the old fallback only if there is nothing at all.
  _pinLabel(msg) {
    // One copy, in shared/utils/pinned.js, because the mobile had its own and both were
    // wrong in the same way.
    if (window.OrbitPinned && window.OrbitPinned.labelFor) return window.OrbitPinned.labelFor(msg);
    if (!msg) return '(attachment)';
    var text = String(msg.text == null ? '' : msg.text).trim();
    if (text) return text;
    var att = (msg.attachments && msg.attachments[0]) || msg.attachment || null;
    if (!att) return '(attachment)';
    var kind = att.type || '';
    if (!kind && att.mimeType) {
      if (/^image\//.test(att.mimeType)) kind = 'image';
      else if (/^video\//.test(att.mimeType)) kind = 'video';
      else if (/^audio\//.test(att.mimeType)) kind = 'audio';
    }
    var name = String(att.name || att.fileName || '').trim();
    if (name) return name;
    if (kind === 'image') return 'Photo';
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Voice message';
    return 'File';
  }

  pinMessage(chatId, msgId) {
    var msgs = this.state.messages[chatId];
    if (!msgs) return;
    var msg = msgs.find(function(m) { return String(m.id) === String(msgId); });
    if (!msg) return;

    // The limit is a rule, not a silent no-op: refuse it and say why, so the UI can tell
    // the user rather than appearing to do nothing.
    var P = window.OrbitPinned;
    if (P) {
      var allowed = P.canPin(this.getPinnedMessages(chatId), this._isGroupChat(chatId));
      if (!allowed.ok) {
        if (window.Toast) window.Toast.show(allowed.message, 'info');
        return;
      }
    }

    var pinned = { ...this.state.pinnedMessages };
    if (!pinned[chatId]) pinned[chatId] = [];
    
    // Don't allow duplicates
    if (pinned[chatId].some(function(p) { return String(p.msgId) === String(msgId); })) return;
    
    pinned[chatId] = pinned[chatId].concat([{
      msgId: msg.id,
      text: this._pinLabel(msg),
      sender: msg.sender,
      timestamp: msg.timestamp || new Date().toISOString(),
      pinnedBy: this.state.currentUser.userId,
      pinnedAt: new Date().toISOString()
    }]);

    this.setState({ pinnedMessages: pinned });
  }

  unpinMessage(chatId, msgId) {
    var pinned = { ...this.state.pinnedMessages };
    if (!pinned[chatId]) return;
    pinned[chatId] = pinned[chatId].filter(function(p) { return String(p.msgId) !== String(msgId); });
    if (pinned[chatId].length === 0) delete pinned[chatId];
    this.setState({ pinnedMessages: pinned });
  }

  getPinnedMessages(chatId) {
    var pinned = this.state.pinnedMessages[chatId];
    if (!pinned || !pinned.length) return [];
    var P = window.OrbitPinned;
    if (!P) return pinned;
    // Prune on read as a safety net: a message can disappear without going through
    // deleteMessage (a chat cleared, a store restore), and a pinned row that scrolls
    // nowhere is worse than a shorter list. The rules live in shared/utils/pinned.js so
    // both platforms agree on them.
    var msgs = this.state.messages[chatId] || [];
    var live = {};
    msgs.forEach(function (m) { live[String(m.id)] = true; });
    return P.prune(pinned, function (id) { return !!live[String(id)]; });
  }

  // Is this chat a group? The pin limit differs: 3 in a direct message, 5 in a group.
  _isGroupChat(chatId) {
    return (this.state.groups || []).some(function (g) {
      return String(g.groupId || g.id) === String(chatId);
    });
  }

  // Put a system line into the chat. These carry no sender and are rendered centred,
  // the way a "so-and-so joined" notice would be.
  _postSystemNote(chatId, text) {
    if (!text) return;
    // A real system line in the chat now. It was a toast while the renderer could not draw
    // one: the two own/other branches are keyed on isMine and neither knew about `system`,
    // so writing the message would have put an empty-sender bubble in the feed. That branch
    // exists now, so this is the message it was always meant to be.
    var note = {
      id: 'sys-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      text: text,
      sender: '',
      system: true,
      timestamp: new Date().toISOString()
    };
    var msgs = { ...this.state.messages };
    msgs[chatId] = (msgs[chatId] || []).concat([note]);
    this.setState({ messages: msgs });
  }

  // Reorder the pinned list, and tell the chat about it.
  //
  // `orderedIds` is the full order the user settled on. Anything it does not mention is
  // kept, appended in its old relative order, so a partial list cannot silently drop a
  // pin. Nothing is announced when the order did not actually change — dragging a row
  // and dropping it where it started is not news.
  reorderPinned(chatId, orderedIds, opts) {
    opts = opts || {};
    var P = window.OrbitPinned;
    var current = this.getPinnedMessages(chatId);
    if (!P || !current.length) return { ok: false, reason: 'nothing-pinned' };

    var byId = {};
    current.forEach(function (p) { byId[String(p.msgId)] = p; });
    var next = [];
    (orderedIds || []).forEach(function (id) {
      var key = String(id);
      if (byId[key]) { next.push(byId[key]); delete byId[key]; }
    });
    current.forEach(function (p) { if (byId[String(p.msgId)]) next.push(p); });

    if (!P.orderChanged(current, next)) return { ok: true, changed: false };

    var pinned = { ...this.state.pinnedMessages };
    pinned[chatId] = next;
    this.setState({ pinnedMessages: pinned });

    if (opts.silent) return { ok: true, changed: true, list: next };

    var me = this.state.currentUser || {};
    var myName = me.username || me.name || '';
    this._postSystemNote(chatId, P.orderChangedText(myName));

    // Tell the others. Reuses the SYSTEM packet with an action, which is how the delete
    // sync already travels — no new packet type, and an older build simply ignores an
    // action it does not know.
    try {
      if (window.orbitAPI && this.state.networkPeers) {
        var ids = next.map(function (p) { return String(p.msgId); });
        var targets = (this._isGroupChat(chatId) ? (this.state.groups || []).find(function (g) {
          return String(g.groupId || g.id) === String(chatId);
        }) : null);
        var members = (targets && targets.members) ? targets.members : [{ userId: chatId }];
        members.forEach(function (m) {
          if (String(m.userId) === String(me.userId)) return;
          window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.SYSTEM, {
            action: 'pin_order', chatId: chatId, order: ids, by: myName
          });
        });
      }
    } catch (e) { /* announcing is best-effort; the reorder itself is already saved */ }

    return { ok: true, changed: true, list: next };
  }

  // The pinned list as it should be stored, with dead entries removed.
  _prunePinned(chatId) {
    var P = window.OrbitPinned;
    var pinned = this.state.pinnedMessages[chatId];
    if (!P || !pinned || !pinned.length) return;
    var msgs = this.state.messages[chatId] || [];
    var live = {};
    msgs.forEach(function (m) { live[String(m.id)] = true; });
    var clean = P.prune(pinned, function (id) { return !!live[String(id)]; });
    if (clean.length === pinned.length) return;
    var next = { ...this.state.pinnedMessages };
    if (clean.length) next[chatId] = clean;
    else delete next[chatId];
    this.setState({ pinnedMessages: next });
  }

  sendPinMessage(chatId, msgId) {
    var state = this.state;
    var members = this.getGroupMembers(chatId);
    var recipients = [];
    if (members.length > 0) {
      members.forEach(function(m) {
        if (m.userId !== state.currentUser.userId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend) {
        recipients.push({ userId: friend.userId, ip: friend.ip || '' });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.PIN_MESSAGE, { msgId: msgId, groupId: chatId });
      }
    });
    this.pinMessage(chatId, msgId);
  }

  sendUnpinMessage(chatId, msgId) {
    var state = this.state;
    var members = this.getGroupMembers(chatId);
    var recipients = [];
    if (members.length > 0) {
      members.forEach(function(m) {
        if (m.userId !== state.currentUser.userId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      if (friend) {
        recipients.push({ userId: friend.userId, ip: friend.ip || '' });
      }
    }
    recipients.forEach(function(r) {
      if (window.orbitAPI) {
        window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.UNPIN_MESSAGE, { msgId: msgId, groupId: chatId });
      }
    });
    this.unpinMessage(chatId, msgId);
  }

  getState() {
    return this.state;
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };

    // Automatically persist app data if changed (only for web fallback now)
    if (!window.orbitAPI && (newState.messages || newState.friends || newState.groups)) {
      if (window.Storage) {
        window.Storage.set('appData', {
          friends: this.state.friends,
          messages: this.state.messages,
          groups: this.state.groups,
          pinnedMessages: this.state.pinnedMessages
        });
      }
    }

    // Pinned messages persist through settings on the Electron path, the way mutedChats
    // does: there is no entity to attach them to, and the pins change rarely enough that
    // a write per change is nothing.
    if (window.orbitAPI && newState && newState.pinnedMessages) {
      try { window.orbitAPI.dbSetSetting('pinnedMessages', this.state.pinnedMessages); } catch (e) { /* never break a state change over this */ }
    }

    // Groups are persisted individually by each mutating method (addGroup, addMemberToGroup, etc.)
    // No bulk save needed here to avoid data corruption from partial groups arrays.

    if (window.orbitAPI && (newState.activeTab !== undefined || newState.activeChatId !== undefined)) {
       window.orbitAPI.dbSetSetting('uiState', {
         activeTab: this.state.activeTab,
         activeChatId: this.state.activeChatId
       });
    }

    // Auto-mark as read when switching to a chat
    if (newState.activeChatId && newState.activeChatId !== (this._prevActiveChatId || this.state.activeChatId)) {
      const chatId = this.state.activeChatId;
      if (chatId && this.state.unreadCounts[chatId]) {
        this._markAsReadInternal(chatId);
      }
      // Send read receipt to peers
      this._sendReadReceipt(chatId);
    }
    this._prevActiveChatId = this.state.activeChatId;

    this.notify(newState);
  }

  _markAsReadInternal(chatId) {
    const unreadCounts = { ...this.state.unreadCounts };
    const mentionCounts = { ...this.state.mentionCounts };
    const lastReadIds = { ...this.state.lastReadIds };
    delete unreadCounts[chatId];
    delete mentionCounts[chatId];
    if (window.orbitAPI) {
      const msgs = this.state.messages[chatId];
      if (msgs && msgs.length > 0) {
        const lastId = msgs[msgs.length - 1].id;
        window.orbitAPI.dbSetReadState(chatId, lastId);
        lastReadIds[chatId] = lastId;
      }
      window.orbitAPI.dbClearMentions(chatId);
    }
    this.setState({ unreadCounts, mentionCounts, lastReadIds });
  }

  _sendReadReceipt(chatId) {
    if (!window.orbitAPI || chatId === 'local-echo') return;
    const msgs = this.state.messages[chatId];
    if (!msgs || msgs.length === 0) return;
    const lastId = msgs[msgs.length - 1].id;
    const state = this.state;
    const members = this.getGroupMembers(chatId);
    if (members.length > 0) {
      members.forEach(m => {
        if (m.userId !== state.currentUser.userId) {
          window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
        }
      });
    } else {
      const friend = state.friends.find(f => f.userId === chatId);
      if (friend) {
        window.orbitAPI.networkSend(chatId, friend.ip || '', window.Protocol.Types.READ, { chatId, lastReadMsgId: lastId });
      }
    }
  }

  blockUser(userId) {
    var blockedUsers = this.state.blockedUsers || [];
    if (blockedUsers.indexOf(userId) !== -1) return;
    blockedUsers = blockedUsers.concat([userId]);
    this.setState({ blockedUsers });
    if (window.Storage) window.Storage.set('blockedUsers', blockedUsers);
    if (window.Toast) window.Toast.show('User Blocked', 'Messages from this user will be ignored');
  }

  unblockUser(userId) {
    var blockedUsers = (this.state.blockedUsers || []).filter(function(id) { return id !== userId; });
    this.setState({ blockedUsers });
    if (window.Storage) window.Storage.set('blockedUsers', blockedUsers);
    if (window.Toast) window.Toast.show('User Unblocked', 'Messages from this user will now be received');
  }

  isUserBlocked(userId) {
    return (this.state.blockedUsers || []).indexOf(userId) !== -1;
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(changedState) {
    // A throwing subscriber must never break the rest of the app: an exception
    // here would escape through setState -> every mutating method -> the
    // caller (e.g. ConfirmModal's onConfirm), leaving full-screen overlays
    // stuck and the whole GUI unresponsive. Isolate each listener.
    this.listeners.forEach(listener => {
      try {
        listener(this.state, changedState);
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error('[Store] subscriber error:', e);
      }
    });
  }
}

// Global singleton store
window.store = new Store();

// Backfill avatarDataUrl for existing groups that only have file-based avatarPath
setTimeout(function() {
  var s = window.store ? window.store.getState() : null;
  if (!s || !s.groups) return;
  s.groups.forEach(function(g) {
    if (g.avatarPath && !g.avatarDataUrl && g.groupId) {
      fetch('orbit-avatar://' + g.groupId + '?t=' + (g.avatarUpdatedAt || 0))
        .then(function(r) { return r.blob(); })
        .then(function(blob) {
          return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        })
        .then(function(dataUrl) {
          window.store.updateGroupField(g.groupId, 'avatarDataUrl', dataUrl);
        })
        .catch(function() {});
    }
  });
}, 100);
