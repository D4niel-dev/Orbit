// mobile/src/js/components/home-screen.js
// v0.2.8 � Home Screen Renderer

var OrbitHome = {
  /** Render the online friends horizontal scroll row */
  renderOnlineFriends: function() {
    var container = document.getElementById('online-friends-row');
    if (!container) return;
    
    var friends = MStore.friends || [];
    var filter = window._onlineFriendFilter || 'all';
    
    // Apply filter
    var filteredFriends = friends.filter(function(f) {
      var isOnline = f.status === 'online' || f.lastSeen > Date.now() - 45000;
      if (filter === 'online') return isOnline;
      if (filter === 'offline') return !isOnline;
      return true;
    });
    
    // Update filter count
    var countEl = document.getElementById('online-filter-count');
    if (countEl) {
      var onlineCount = friends.filter(function(f) {
        return f.status === 'online' || f.lastSeen > Date.now() - 45000;
      }).length;
      countEl.textContent = onlineCount + ' online';
    }
    
    if (filteredFriends.length === 0) {
      var emptyMsg = filter === 'all' ? 'No friends yet' :
                     filter === 'online' ? 'No friends online' :
                     'No offline friends';
      container.innerHTML = '<div class="online-empty-state"><i data-lucide="' + 
        (filter === 'online' ? 'wifi-off' : filter === 'offline' ? 'clock' : 'users') + 
        '"></i><span>' + emptyMsg + '</span></div>';
      container.dataset.centered = 'true';
      return;
    }
    
    var MAX_VISIBLE = 6;
    var showAll = container.dataset.showAll === 'true';
    var displayFriends = showAll ? filteredFriends : filteredFriends.slice(0, MAX_VISIBLE);
    var remaining = filteredFriends.length - MAX_VISIBLE;
    
    var html = '';
    
    // + button FIRST (always on the left)
    html += '<div class="online-friend-item online-friend-add-item" id="btn-add-quick-online">' +
      '<div class="online-friend-avatar" style="background:transparent;border:2px dashed var(--border-subtle);color:var(--text-muted);font-size:20px;">' +
        '<i data-lucide="plus" style="width:22px;height:22px;"></i>' +
      '</div>' +
      '<span class="online-friend-name">Add</span>' +
    '</div>';
    
    displayFriends.forEach(function(friend) {
      var displayName = friend.name || OrbitHome._friendId(friend) || '?';
      var initial = displayName.charAt(0).toUpperCase();
      var safeAvatarSrc = OrbitHome._safeAvatarSrc(friend.avatar);
      var avatarHtml = safeAvatarSrc
        ? '<img src="' + safeAvatarSrc + '" alt="' + OrbitHome._escapeAttr(displayName) + '" loading="lazy">'
        : OrbitHome._escape(initial);
      
      html += '<div class="online-friend-item" data-peerid="' + OrbitHome._escapeAttr(OrbitHome._friendId(friend)) + '">';
      var isDefOnline = friend.status === 'online' || (friend.lastSeen || 0) > Date.now() - 30000;
      html += '  <div class="online-friend-avatar">' + avatarHtml + '<span class="online-indicator' + (isDefOnline ? '' : ' idle') + '"></span></div>';
      html += '  <span class="online-friend-name">' + OrbitHome._escape(displayName) + '</span>';
      html += '</div>';
    });
    
    if (!showAll && remaining > 0) {
      html += '<div class="online-friend-item online-friend-more" id="online-friends-more-btn">' +
        '<div class="online-friend-avatar" style="background:var(--bg-hover);border:2px dashed var(--border-subtle);font-size:13px;font-weight:600;color:var(--text-muted);">+' + remaining + '</div>' +
        '<span class="online-friend-name">More</span>' +
      '</div>';
    }
    
    container.innerHTML = html;
    this._addAvatarFrames();
    
    container.dataset.centered = (filteredFriends.length <= 1) ? 'true' : 'false';
    
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /** Expand online friends to show all */
  _showMoreOnline: function() {
    var container = document.getElementById('online-friends-row');
    if (container) {
      container.dataset.showAll = 'true';
      this.renderOnlineFriends();
    }
  },


  /* ── One place a friend's identity is decided ───────────────────────────────
     ⚠ A friend record is keyed by `userId` — that is what MStore.addOrUpdatePeer
     writes — or by `id`, which is what the seeded bots get. It is NOT keyed by
     `peerId`: no friend record this app writes has ever had a `peerId` field.

     Reading `friend.peerId` alone therefore resolved to '' for EVERY real
     contact, and every action built from it early-returned on the empty string.
     The ⋮ opened nothing, Message did nothing, and neither said a word — while
     groups, which pass a real `g.id`, worked fine. That asymmetry was the whole
     clue: the menu was not broken, the id was empty.

     Same shape as the rest of this codebase's silent failures — a lookup against
     a field that is not there matches nothing, and matches it silently. */
  _friendId: function(f) {
    // Delegates to the app-wide resolver so there is exactly one definition of
    // "which field is this person's id". The inline fallback only matters if this
    // file is somehow loaded without app.js.
    if (typeof window.orbitFriendId === 'function') return window.orbitFriendId(f);
    if (!f) return '';
    return String(f.peerId || f.userId || f.id || '');
  },

  /**
   * Open a friend's DM. Creates the chat if the store has none.
   *
   * ⚠ THERE WERE TWO DEFINITIONS OF THIS METHOD in this object literal, and the
   * second silently won — so the careful lookup below it was unreachable dead
   * code that still looked like the implementation. One definition now.
   */
  _onFriendClick: function(friendId) {
    if (!friendId) return;
    var id = String(friendId);

    // Three chat shapes exist in the wild: the plain peer id, a 'dm_' prefix, and
    // a chat whose own id differs from its peerId. Match all three.
    var chats = MStore.chats || [];
    var chat = null;
    for (var i = 0; i < chats.length; i++) {
      var c = chats[i];
      if (c.id === id || c.id === 'dm_' + id || c.peerId === id) { chat = c; break; }
    }

    if (!chat) {
      var friend = (MStore.friends || []).filter(function(f) {
        return OrbitHome._friendId(f) === id;
      })[0];
      if (friend) {
        // Plain peer id, matching MStore's own _ensureDmChatForUser convention.
        chat = { id: id, peerId: id, name: friend.name || id, type: 'dm', messages: [] };
        MStore.chats.push(chat);
        MStore.save();
      }
    }
    if (!chat) return;

    if (typeof window.openChat === 'function') window.openChat(chat.id);
    else if (typeof openChat === 'function') openChat(chat.id);
  },
  _escape: function(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  },

  /** Escape for HTML attribute context (adds single-quote escaping on top of _escape) */
  _escapeAttr: function(str) {
    return this._escape(str).replace(/'/g, '&#39;');
  },

  /** Escape for a JS string literal embedded in a double-quoted HTML attribute (inline onclick/onerror) */
  _escapeJs: function(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/</g, '\\u003C');
  },

  /** Avatar src sanitizer — allow data:image/*, http(s), or relative app-asset paths; block scheme-based vectors (javascript: etc.) */
  _safeAvatarSrc: function(url) {
    if (!url) return '';
    var s = String(url).trim();
    if (/^data:image\//i.test(s) || /^https?:\/\//i.test(s)) return s;
    // Relative app-asset paths (e.g. the Echo bot's icons/... avatar) are
    // allowed only when no scheme prefix exists — v0.4.1-beta fix.
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) return s;
    return '';
  },

  /** Highlight matching text in search results */
  _highlightText: function(text, query) {
    if (!query || !text) return this._escape(text || '');
    var escaped = this._escape(text);
    var lower = escaped.toLowerCase();
    var q = query.toLowerCase();
    if (lower.indexOf(q) === -1) return escaped;
    var result = '';
    var lastIdx = 0;
    var idx = lower.indexOf(q, lastIdx);
    while (idx !== -1) {
      result += escaped.substring(lastIdx, idx);
      result += '<strong style="color:var(--accent-primary);font-weight:600;">' + escaped.substring(idx, idx + q.length) + '</strong>';
      lastIdx = idx + q.length;
      idx = lower.indexOf(q, lastIdx);
    }
    result += escaped.substring(lastIdx);
    return result;
  },

  /** Save a recent search term (max 5) */
  _saveRecentSearch: function(q) {
    if (!q || !q.trim()) return;
    var recent = (MStore.settings && MStore.settings.recentSearches) || [];
    recent = recent.filter(function(s) { return s !== q; });
    recent.unshift(q);
    if (recent.length > 5) recent.length = 5;
    if (!MStore.settings) MStore.settings = {};
    MStore.settings.recentSearches = recent;
    MStore.save();
  },

  /**
   * Refresh the account control in the header.
   *
   * This used to paint the floating profile pill, which was removed in the
   * v0.8.1 redesign — the header avatar does the same job now. The name is kept
   * because renderChatList() and several other callers still call it.
   *
   * ── Everything below targets the pill's elements, which no longer exist, so
   *    it returns on the next line. Left in place on purpose: deleting it in the
   *    same change that moves the UI makes a behaviour regression hard to spot.
   *    Remove it once the redesign has shipped a release. ──
   */
  renderProfilePill: function() {
    if (window.OrbitNav && window.OrbitNav.syncAvatar) window.OrbitNav.syncAvatar();

    var avatarEl = document.getElementById('profile-pill-avatar');
    var nameEl = document.getElementById('profile-pill-name');
    var statusEl = document.getElementById('profile-pill-status');
    if (!avatarEl || !nameEl || !statusEl) return;
    
    var user = MStore.user || null;
    if (user) {
      var displayName = user.name || user.peerId || 'User';
      var initial = displayName.charAt(0).toUpperCase();
      avatarEl.style.position = 'relative';
      if (user.avatar) {
        avatarEl.innerHTML = '<img src="' + user.avatar + '" alt="">';
      } else {
        avatarEl.textContent = initial;
      }
      // Add profile frame if a frame is selected — gated on stable setting
      if (MStore.settings && MStore.settings.profileFrames) {
        var pfNum = parseInt(MStore.settings.profileFrame, 10) || 0;
        var oldFrame = avatarEl.querySelector('.pfp-frame');
        if (pfNum > 0) {
          if (!oldFrame) {
            var frameEl = document.createElement('img');
            frameEl.className = 'pfp-frame';
            frameEl.draggable = false;
            frameEl.alt = '';
            avatarEl.appendChild(frameEl);
          } else {
            var frameEl = oldFrame;
          }
          frameEl.src = 'icons/frames/pfp_frame_' + pfNum + '.png';
        } else if (oldFrame) {
          oldFrame.remove();
        }
      }
      nameEl.textContent = displayName;
      var _s = (user.status || 'offline');
      var statusLabels = { online: 'Online', away: 'Away', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
      var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', dnd: 'var(--accent-danger)', invisible: 'var(--text-muted)', offline: 'var(--text-muted)' };
      statusEl.textContent = statusLabels[_s] || 'Offline';
      statusEl.style.color = statusColors[_s] || '';
    } else {
      avatarEl.textContent = '?';
      nameEl.textContent = 'User';
      statusEl.textContent = 'Offline';
    }
    
    var pill = document.getElementById('profile-pill');
    if (pill && window.showProfileSheet) {
      pill.onclick = function() { window.showProfileSheet(); };
    }
  },

  /** Render the chat list with card-style items */
  renderChatList: function(filter) {
    var container = document.getElementById('chat-list');
    // Update profile pill
    this.renderProfilePill();
    // Update online friends section
    this.renderOnlineFriends();
    if (!container) return;
    
    var chats = MStore.chats || [];
    var groups = MStore.groups || [];
    
    // Filter by tab: Friends = DMs only, Groups = groups only, Folder = folder's chats
    var groupIds = {};
    (MStore.groups || []).forEach(function(g) { groupIds[g.id || g.groupId] = true; });
    // Folder filter: filter IS the folder ID (e.g., "folder_1234567890")
    if (filter && filter.indexOf('folder_') === 0) {
      var folder = MStore.chatFolders[filter];
      var folderChatIds = folder ? folder.chatIds : [];
      chats = chats.filter(function(c) { return folderChatIds.indexOf(c.id) !== -1; });
    } else if (filter === 'groups') {
      chats = chats.filter(function(c) { return groupIds[c.id]; });
    } else if (filter === 'friends') {
      chats = chats.filter(function(c) { return !groupIds[c.id]; });
    }
    // Anything else ('all', or no argument) keeps DMs and groups in ONE list,
    // which is what the redesign does — the Friends/Groups control is hidden
    // because it was a third way to slice a list that already had two others.
    // 'friends' and 'groups' are still honoured for the folder rail.
    
    var searchQ = window._chatSearchQuery || '';
    
    // ---- SEARCH MODE: show categorized results ----
    if (searchQ) {
      this._saveRecentSearch(searchQ);
      // "Active now" is not a search result. Leaving it up pushes the results
      // down and implies those people matched.
      var onlineRow = document.getElementById('online-friends-section');
      if (onlineRow) onlineRow.style.display = 'none';
      container.innerHTML = this._buildSearchResults(searchQ, chats, filter);
      this._addAvatarFrames();
      if (window.lucide) lucide.createIcons();
      return;
    }
    // "Active now" is a strip of online FRIENDS, so it has nothing to say on the
    // Groups tab. Hidden only there — a folder can hold direct messages, so it
    // stays for those.
    var onlineRowBack = document.getElementById('online-friends-section');
    if (onlineRowBack) onlineRowBack.style.display = (filter === 'groups' ? 'none' : '');
    
    if (chats.length === 0) {
      // Plain empty state. The feature-slide carousel is a DESKTOP surface —
      // desktop/src/js/views/chat-panel.js renders it in the chat panel's empty
      // state, where the panel is otherwise a bare icon. On a phone the
      // conversation list is the first thing you see on a cold start, so a
      // seven-slide tour sits between you and the thing you opened the app for.
      container.innerHTML = '<div class="empty-state enhanced"><i data-lucide="message-circle"></i><div class="empty-state-text">No conversations yet</div><div class="empty-state-sub">Your chats will appear here once you start a conversation</div></div>';
      return;
    }
    
    // Sort: pinned first, then by last message time
    var pinned = MStore.pinnedDMs || {};
    chats.sort(function(a, b) {
      var aPinned = pinned[a.id || a.chatId] ? 1 : 0;
      var bPinned = pinned[b.id || b.chatId] ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      var aTime = a.lastTime || 0;
      var bTime = b.lastTime || 0;
      return bTime - aTime;
    });
    
    // Section headers. The list is already sorted pinned-first, so these are a
    // label over each run rather than a second grouping pass. With nothing
    // pinned there is nothing to distinguish, so neither label is emitted.
    var hasPinned = chats.some(function(c) { return pinned[c.id || c.chatId]; });
    var pinnedLabelDone = false;
    var recentLabelDone = false;

    var html = '';
    chats.forEach(function(chat) {
      var chatId = chat.id || chat.chatId;
      var isPinned = pinned[chatId];
      if (hasPinned) {
        if (isPinned && !pinnedLabelDone) {
          html += '<div class="list-label">Pinned</div>';
          pinnedLabelDone = true;
        }
        if (!isPinned && !recentLabelDone) {
          html += '<div class="list-label">Recent</div>';
          recentLabelDone = true;
        }
      }
      var unread = MStore.unreadCounts && MStore.unreadCounts[chatId] || 0;
      // Group detection: chat objects in MStore.chats don't reliably carry type === 'group',
      // so also check the MStore.groups index (same source the tab filter above uses).
      var isGroup = chat.type === 'group' || !!groupIds[chatId];
      var displayName = chat.name || chat.peerId || 'Unknown';
      var initial = displayName.charAt(0).toUpperCase();
      var avatarUrl = chat.avatar;
      // Fall back to the friend record so a known avatar still shows even if
      // the chat record hasn't been seeded yet (previously the DMs tab showed
      // the single-letter initial instead — v0.4.1-beta fix).
      if (!avatarUrl && !isGroup) {
        var avF = MStore.friends.find(function(f) { return OrbitHome._friendId(f) === (chat.peerId || chat.id); });
        avatarUrl = avF ? avF.avatar : null;
      }

      var safeAvatarSrc = OrbitHome._safeAvatarSrc(avatarUrl);
      // A group with no uploaded image renders the member-avatar grid, exactly
      // like desktop (shared/ui/group-avatar.js). Previously this fell through
      // to the group name's first letter.
      var groupGridHtml = null;
      if (isGroup && !safeAvatarSrc && window.OrbitGroupAvatarMobile) {
        var grpRec = null;
        var grps = MStore.groups || [];
        for (var gi = 0; gi < grps.length; gi++) {
          if (String(grps[gi].id) === String(chatId) || String(grps[gi].groupId) === String(chatId)) {
            grpRec = grps[gi];
            break;
          }
        }
        // 46 to match .chat-row-avatar, which redesign.css pins to 46px. This
        // was 52 for the old 52px avatar; leaving it would overflow the box.
        groupGridHtml = window.OrbitGroupAvatarMobile.forGroup(grpRec, 46, 'var(--bg-base)');
      }
      var avatarHtml = safeAvatarSrc
        ? '<img src="' + safeAvatarSrc + '" alt="' + OrbitHome._escapeAttr(initial) + '" loading="lazy" onerror="var f=this;f.onerror=null;var i=f.getAttribute(\'data-init\')||\'' + OrbitHome._escapeJs(initial) + '\';f.style.display=\'none\';var d=document.createElement(\'div\');d.textContent=i;d.style.cssText=\'width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;\';f.parentNode.insertBefore(d,f);" data-init="' + OrbitHome._escapeAttr(initial) + '">'
        : (groupGridHtml || OrbitHome._escape(initial));
      
      var preview = chat.lastMessage || '';
      // Strip markdown for preview
      preview = preview.replace(/```[\s\S]*?```/g, '[code]');
      preview = preview.replace(/`([^`]+)`/g, '$1');
      preview = preview.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      preview = preview.replace(/[*#_~>]/g, '');
      preview = preview.length > 80 ? preview.substring(0, 80) + '\u2026' : preview;
      
      var timeStr = '';
      if (chat.lastTime) {
        var d = new Date(chat.lastTime);
        var now = new Date();
        if (d.toDateString() === now.toDateString()) {
          timeStr = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        } else {
          timeStr = d.toLocaleDateString([], {month:'short', day:'numeric'});
        }
      }
      
      var isOnline = chat.status === 'online';
      var typing = chat.isTyping;
      var mentionCount = MStore.mentionCounts && MStore.mentionCounts[chatId] || 0;
      
      html += '<div class="chat-row' + (unread > 0 ? ' unread' : '') + (mentionCount > 0 ? ' has-mention' : '') + '" data-chatid="' + OrbitHome._escapeAttr(chatId) + '"' + (!isGroup ? ' data-user-id="' + OrbitHome._escape(chat.peerId || chat.id) + '"' : '') + ' onclick="OrbitHome._onChatClick(\'' + OrbitHome._escapeJs(chatId) + '\')">';
      // Groups get a squared avatar so they read as groups at a glance.
      html += '  <div class="chat-row-avatar' + (isGroup ? ' sq' : '') + (groupGridHtml ? ' has-group-avatar' : '') + '">' + avatarHtml;
      // Presence dot is for DMs/users only — groups don't have online status
      if (!isGroup) {
        if (isOnline) {
          html += '    <span class="chat-row-status-dot online"></span>';
        } else {
          html += '    <span class="chat-row-status-dot offline"></span>';
        }
      }
      html += '  </div>';
      html += '  <div class="chat-row-info">';
      // Pin sits with the name, not stacked under the timestamp where it landed
      // before — the meta column is a right-aligned stack and a third item there
      // read as clutter.
      html += '    <div class="chat-row-name">' + OrbitHome._escape(displayName) +
              (isPinned ? '<i data-lucide="pin" class="chat-row-pin-icon"></i>' : '') + '</div>';
      if (typing) {
        html += '    <div class="chat-row-typing">Typing\u2026</div>';
      } else {
        html += '    <div class="chat-row-preview">' + OrbitHome._escape(preview || 'No messages yet') + '</div>';
      }
      html += '  </div>';
      html += '  <div class="chat-row-meta">';
      html += '    <span class="chat-row-time">' + timeStr + '</span>';
      if (mentionCount > 0) {
        html += '    <span class="mention-badge">@</span>';
      } else if (unread > 0) {
        html += '    <span class="chat-row-badge">' + (unread > 99 ? '99+' : unread) + '</span>';
      }
      html += '  </div>';
      html += '</div>';
    });
    
    container.innerHTML = html;
    this._addAvatarFrames();

    // Re-init Lucide icons
    if (window.lucide) {
      lucide.createIcons();
    }
  },

  /** Build categorized search results HTML */
  /**
   * A searchable index of every message, built once and cached.
   *
   * The store LAZY-LOADS — only the open conversation's messages live in
   * MStore.messages. Reading that object directly (which is what this used to
   * do) could therefore only ever find messages in the chat you were already
   * looking at, so a global search always came back empty for anything else.
   * getMessages() loads a chat on demand, and the index has to be built through
   * it.
   *
   * Built once per search rather than per keystroke: each getMessages() is a
   * storage read plus a JSON parse, and doing that for every chat on every
   * character would be unusable on a long history.
   */
  _searchIndex: function() {
    if (window._orbitSearchIndex) return window._orbitSearchIndex;
    var out = [];
    var chats = MStore.chats || [];
    for (var i = 0; i < chats.length; i++) {
      var chat = chats[i];
      var chatId = chat.id || chat.chatId;
      if (!chatId) continue;
      var msgs;
      try { msgs = MStore.getMessages(chatId) || []; } catch (e) { msgs = []; }
      for (var j = 0; j < msgs.length; j++) {
        var m = msgs[j];
        if (!m || !m.text) continue;
        out.push({
          chatId: chatId,
          chatName: chat.name || chat.peerId || chatId,
          chatAvatar: chat.avatar || null,
          text: String(m.text),
          lower: String(m.text).toLowerCase(),
          time: m.time || '',
          from: m.from,
          id: m.id
        });
      }
    }
    window._orbitSearchIndex = out;
    return out;
  },

  _invalidateSearchIndex: function() {
    window._orbitSearchIndex = null;
  },

  /** Filter pill handler. Rendered inline, so it lives on window. */
  _setSearchType: function(type) {
    window._searchTypeFilter = type || 'all';
    if (window.renderChatList) window.renderChatList(window._activeHomeTab);
  },

  _buildSearchResults: function(query, chats, filter) {
    var q = query.toLowerCase();
    var results = [];
    
    // --- Chat results ---
    var matchedChats = [];
    chats.forEach(function(c) {
      var name = (c.name || '').toLowerCase();
      var preview = (c.lastMessage || '').toLowerCase();
      if (name.indexOf(q) !== -1 || preview.indexOf(q) !== -1) {
        matchedChats.push(c);
      }
    });
    if (matchedChats.length) {
      results.push({ type: 'chats', label: 'Chats', items: matchedChats });
    }
    
    // --- Friend results ---
    var friends = MStore.friends || [];
    var matchedFriends = [];
    friends.forEach(function(f) {
      var fName = (f.name || '').toLowerCase();
      // The tag too — it is the half of someone's handle you would actually
      // search for, and the app displays it as #1234.
      var fTag = String(f.tag || f.usertag || '').toLowerCase();
      var fId = String(f.id || '').toLowerCase();
      if (fName.indexOf(q) !== -1 || fTag.indexOf(q.replace(/^#/, '')) !== -1 || fId.indexOf(q) !== -1) {
        matchedFriends.push(f);
      }
    });
    if (matchedFriends.length) {
      results.push({ type: 'friends', label: 'Friends', items: matchedFriends });
    }
    
    // --- Message results ---
    // Through the index, so a match in a conversation that is NOT currently open
    // is found too. Sorted newest first, because a search is nearly always for
    // something recent.
    var matchedMessages = [];
    var index = this._searchIndex();
    for (var mi = 0; mi < index.length; mi++) {
      if (index[mi].lower.indexOf(q) !== -1) matchedMessages.push(index[mi]);
    }
    matchedMessages.sort(function(a, b) {
      return String(b.time).localeCompare(String(a.time));
    });
    if (matchedMessages.length) {
      results.push({ type: 'messages', label: 'Messages', items: matchedMessages });
    }
    
    // --- Build HTML ---
    var counts = { chats: 0, friends: 0, messages: 0 };
    results.forEach(function(r) { counts[r.type] = r.items.length; });
    var totalAll = counts.chats + counts.friends + counts.messages;

    // ── Filters ──
    // Counts are of what the query FOUND, and a pill stays visible at 0 — so
    // "no messages match" is something you can see, rather than a category that
    // silently is not there and leaves you wondering.
    var typeFilter = window._searchTypeFilter || 'all';
    var pills = [
      { id: 'all',      label: 'All',      n: totalAll },
      { id: 'chats',    label: 'Chats',    n: counts.chats },
      { id: 'people',   label: 'People',   n: counts.friends },
      { id: 'messages', label: 'Messages', n: counts.messages }
    ];
    var html = '<div class="search-filter-bar">';
    pills.forEach(function(p) {
      html += '<button class="search-filter-btn' + (typeFilter === p.id ? ' active' : '') +
              '" onclick="window._searchSetType(\'' + p.id + '\')">' +
              p.label + '<span class="search-filter-count">' + p.n + '</span></button>';
    });
    html += '</div>';

    var visible = results.filter(function(r) {
      if (typeFilter === 'all') return true;
      if (typeFilter === 'people') return r.type === 'friends';
      return r.type === typeFilter;
    });
    var totalCount = 0;
    visible.forEach(function(r) { totalCount += r.items.length; });

    html += '<div class="search-results-info">' +
            this._highlightText('Results for "' + query + '"', query) +
            ' \u2014 ' + totalCount + ' match' + (totalCount !== 1 ? 'es' : '') + '</div>';

    visible.forEach(function(section) {
      html += '<div class="search-results-section">';
      html += '<div class="search-results-section-header">' + section.label + ' (' + section.items.length + ')</div>';
      
      if (section.type === 'chats') {
        section.items.forEach(function(chat) {
          var chatId = chat.id || chat.chatId;
          var displayName = chat.name || chat.peerId || 'Unknown';
          var initial = displayName.charAt(0).toUpperCase();
          var preview = (chat.lastMessage || '');
          preview = preview.replace(/```[\s\S]*?```/g, '[code]').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*#_~>]/g, '');
          preview = preview.length > 60 ? preview.substring(0, 60) + '\u2026' : preview;
          
          var timeStr = '';
          if (chat.lastTime) {
            var d = new Date(chat.lastTime);
            var now = new Date();
            timeStr = d.toDateString() === now.toDateString()
              ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
              : d.toLocaleDateString([], {month:'short', day:'numeric'});
          }
          
          html += '<div class="search-result-item" onclick="OrbitHome._onChatClick(\'' + OrbitHome._escapeJs(chatId) + '\')">';
          html += '  <div class="search-result-avatar">' + (OrbitHome._safeAvatarSrc(chat.avatar) ? '<img src="' + OrbitHome._safeAvatarSrc(chat.avatar) + '">' : OrbitHome._escape(initial)) + '</div>';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._highlightText(displayName, query) + '</div>';
          html += '    <div class="search-result-preview">' + OrbitHome._highlightText(preview, query) + '</div>';
          html += '  </div>';
          html += '  <div class="search-result-suffix">' + timeStr + '</div>';
          html += '</div>';
        });
      }
      
      if (section.type === 'friends') {
        section.items.forEach(function(f) {
          var fName = f.name || OrbitHome._friendId(f) || 'Unknown';
          var fInitial = fName.charAt(0).toUpperCase();
          var fStatus = f.status || 'offline';
          var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', dnd: 'var(--accent-danger)', invisible: 'var(--text-muted)' };
          var statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (statusColors[fStatus] || 'var(--text-muted)') + ';margin-right:4px;vertical-align:middle;"></span>';
          
          html += '<div class="search-result-item" onclick="OrbitHome._onStartDM(\'' + OrbitHome._escapeJs(f.id || '') + '\')">';
          html += '  <div class="search-result-avatar">' + (OrbitHome._safeAvatarSrc(f.avatar) ? '<img src="' + OrbitHome._safeAvatarSrc(f.avatar) + '">' : OrbitHome._escape(fInitial)) + '</div>';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._highlightText(fName, query) + '</div>';
          html += '    <div class="search-result-preview">' + statusDot + OrbitHome._escape(fStatus.charAt(0).toUpperCase() + fStatus.slice(1)) + '</div>';
          html += '  </div>';
          html += '  <span class="search-result-tag">Friend</span>';
          html += '</div>';
        });
      }
      
      if (section.type === 'messages') {
        section.items.forEach(function(hit) {
          var chatName = hit.chatName || 'Chat';
          var msgText = hit.text || '';
          msgText = msgText.length > 90 ? msgText.substring(0, 90) + '\u2026' : msgText;

          var when = '';
          if (hit.time) {
            var md = new Date(hit.time);
            if (!isNaN(md.getTime())) {
              var now2 = new Date();
              when = md.toDateString() === now2.toDateString()
                ? md.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : md.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
          }

          // The chat's avatar, so a result is identifiable without reading the
          // name — the same as every other row in the app.
          var mInitial = chatName.charAt(0).toUpperCase();

          html += '<div class="search-result-item" onclick="OrbitHome._onChatClick(\'' + OrbitHome._escapeJs(hit.chatId) + '\')">';
          html += '  <div class="search-result-avatar">' + (OrbitHome._safeAvatarSrc(hit.chatAvatar) ? '<img src="' + OrbitHome._safeAvatarSrc(hit.chatAvatar) + '">' : OrbitHome._escape(mInitial)) + '</div>';
          html += '  <div class="search-result-body">';
          html += '    <div class="search-result-name">' + OrbitHome._escape(chatName) + '</div>';
          html += '    <div class="search-result-preview">' + OrbitHome._highlightText(msgText, query) + '</div>';
          html += '  </div>';
          html += '  <div class="search-result-suffix">' + OrbitHome._escape(when) + '</div>';
          html += '</div>';
        });
      }
      
      html += '</div>';
    });
    
    if (totalCount === 0) {
      html += '<div class="empty-state enhanced" style="padding-top:40px;"><i data-lucide="search-x"></i><div class="empty-state-text">No results</div><div class="empty-state-sub">Try a different search term</div></div>';
    }
    
    return html;
  },

  _onChatClick: function(chatId) {
    if (window.openChat) {
      window.openChat(chatId);
    }
  },

  /** Render the friends list */
  renderFriendsList: function() {
    var container = document.getElementById('friends-list');
    if (!container) return;
    
    var friends = MStore.friends || [];
    // The search box on this panel is wired in app.js and used to be handled by
    // the flat `renderFriends()` there. That renderer and this one both wrote to
    // #friends-list, and whichever ran last won — so the list flipped from this
    // grouped version to the flat one on any friend change. app.js now delegates
    // here instead, and the filter comes across on the window (the same shape as
    // `_onlineFriendFilter` below) because the two live in different files.
    var query = String(window._friendsSearchFilter || '').trim().toLowerCase();
    if (query) {
      friends = friends.filter(function(f) {
        return String(f.name || '').toLowerCase().indexOf(query) !== -1 ||
               String(f.bio || '').toLowerCase().indexOf(query) !== -1 ||
               String(f.tag || f.usertag || '').toLowerCase().indexOf(query) !== -1;
      });
    }

    // Groups are filtered by the same query, so "nothing matched" has to consider
    // both — otherwise a query that only matches a group would show the empty
    // state and then render the group anyway.
    var groups = (MStore.groups || []).filter(function(g) {
      if (!query) return true;
      return String(g.name || '').toLowerCase().indexOf(query) !== -1;
    });

    // Split by presence, then sort each group by name. The old code sorted
    // `friends` in place — `Array.sort` mutates, so this silently reordered
    // MStore.friends every render.
    function isFriendOnline(f) {
      return f.status === 'online' || (f.lastSeen || 0) > Date.now() - 45000;
    }
    function byName(a, b) { return (a.name || '').localeCompare(b.name || ''); }

    var all = friends.slice();
    var onlineFriends = all.filter(isFriendOnline).sort(byName);
    var offlineFriends = all.filter(function(f) { return !isFriendOnline(f); }).sort(byName);
    var groupsAll = groups;

    // ⚠ THE CHIPS COME AFTER THE SPLIT, not before, because their counts have to
    // describe the whole set while the rows below describe the slice. Computing
    // them from the same arrays the sections draw from is what stops the count
    // and the list disagreeing.
    //
    // ⚠ The chip filter is deliberately NOT persisted: which slice you are
    // looking at is momentary, and should survive a tab switch but not a
    // restart. The DISPLAY STYLE is the opposite — list or grid is how you like
    // to read, so that one lives in settings and comes back.
    var chip = OrbitHome._contactsFilter || 'all';
    this.renderContactsFilters({
      all: onlineFriends.length + offlineFriends.length + groupsAll.length,
      online: onlineFriends.length,
      offline: offlineFriends.length,
      groups: groupsAll.length
    });

    if (chip === 'online') offlineFriends = [];
    if (chip === 'offline') onlineFriends = [];
    if (chip !== 'all' && chip !== 'groups') groups = [];
    if (chip === 'groups') { onlineFriends = []; offlineFriends = []; }

    // ⚠ The empty state is checked HERE, after the chip filter, not before it.
    // Checked earlier, filtering to Groups with no groups would pass the
    // "there is something to show" test and then draw nothing at all — a blank
    // screen with no explanation.
    var nothing = !onlineFriends.length && !offlineFriends.length && !groups.length;
    if (nothing) {
      var chipEmpty = !query && chip !== 'all';
      container.innerHTML = window.OrbitEmpty.html({
        icon: query ? 'search-x' : (chipEmpty ? 'filter' : 'users-round'),
        title: query ? 'No matches' : (chipEmpty ? 'Nothing here' : 'No friends yet'),
        hint: query ? 'Try a different search.'
            : (chipEmpty ? 'Nothing in this filter yet — try All.' : 'Add a friend by scanning their QR code or entering their IP address.'),
        muted: !!query || chipEmpty
      });
      return;
    }

    function renderFriendRow(friend) {
      var displayName = friend.name || friend.peerId || 'Unknown';
      var initial = displayName.charAt(0).toUpperCase();
      var safeAvatarSrc = OrbitHome._safeAvatarSrc(friend.avatar);
      var avatarHtml = safeAvatarSrc
        ? '<img src="' + safeAvatarSrc + '" alt="' + OrbitHome._escapeAttr(initial) + '" loading="lazy" onerror="var f=this;f.onerror=null;var i=f.getAttribute(\'data-init\')||\'' + OrbitHome._escapeJs(initial) + '\';f.style.display=\'none\';var d=document.createElement(\'div\');d.textContent=i;d.style.cssText=\'width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;\';f.parentNode.insertBefore(d,f);" data-init="' + OrbitHome._escapeAttr(initial) + '">'
        : OrbitHome._escape(initial);
      var isOn = isFriendOnline(friend);
      // ⚠ Not `friend.peerId` — see OrbitHome._friendId. This one line is why the
      // ⋮ and Message were dead for every contact and alive for every group.
      var peerId = OrbitHome._friendId(friend);
      var openIt = 'OrbitHome._onFriendClick(\'' + OrbitHome._escapeJs(peerId) + '\')';

      // The presence dot sits ON the avatar, as it does in the chat list and in
      // the design. It used to be an inline <span> under the name, which read as
      // a stray green circle floating in the info column, unattached to anything.
      var row = '<div class="friend-row" data-peerid="' + OrbitHome._escapeAttr(peerId) + '" data-user-id="' + OrbitHome._escapeAttr(peerId) + '" onclick="' + openIt + '">';
      row += '  <div class="chat-row-avatar">' + avatarHtml +
             '<span class="chat-row-status-dot ' + (isOn ? 'online' : 'offline') + '"></span></div>';
      row += '  <div class="chat-row-info">';
      row += '    <div class="chat-row-name">' + OrbitHome._escape(displayName) + '</div>';

      // Secondary line: their bio if they have one, otherwise their tag.
      var sub = friend.bio ||
                ((friend.tag || friend.usertag) ? displayName + '#' + (friend.tag || friend.usertag) : '');
      if (sub) row += '    <div class="friend-sub">' + OrbitHome._escape(sub) + '</div>';

      row += '  </div>';
      row += '  <button class="friend-action" title="Message" aria-label="Message ' +
             OrbitHome._escapeAttr(displayName) + '" onclick="event.stopPropagation();' + openIt + '">' +
             '<i data-lucide="message-circle"></i></button>';
      // The row had exactly one action, so everything else a person can do with a
      // contact was reachable only by long-pressing — which is not discoverable
      // and does not exist on a desktop. This opens the SAME sheet the long-press
      // opens (`showChatContextMenu`), so there is one place those actions live.
      row += '  <button class="friend-more" title="More" aria-label="More actions for ' +
             OrbitHome._escapeAttr(displayName) + '" onclick="event.stopPropagation();OrbitHome.showChatContextMenu(\'' +
             OrbitHome._escapeJs('dm_' + peerId) + '\')">' +
             '<i data-lucide="more-vertical"></i></button>';
      row += '</div>';
      return row;
    }

    var html = '';
    if (onlineFriends.length) {
      html += '<div class="list-label">Online — ' + onlineFriends.length + '</div>';
      onlineFriends.forEach(function(f) { html += renderFriendRow(f); });
    }
    if (offlineFriends.length) {
      html += '<div class="list-label">Offline — ' + offlineFriends.length + '</div>';
      offlineFriends.forEach(function(f) { html += renderFriendRow(f); });
    }

    // Groups are listed here too. The Friends/Groups control that used to gate
    // them is hidden in the new design, so this is now the one place they appear.
    if (groups.length) {
      html += '<div class="list-label">Groups</div>';
      groups.forEach(function(g) {
        var gid = g.id || g.groupId || '';
        var gName = g.name || 'Group';
        var gAvatar = OrbitHome._safeAvatarSrc(g.avatar);
        var gPic = gAvatar
          ? '<img src="' + gAvatar + '" alt="" loading="lazy">'
          : OrbitHome._escape(gName.charAt(0).toUpperCase());
        var n = (g.members && g.members.length) || 0;
        html += '<div class="friend-row" data-user-id="' + OrbitHome._escapeAttr(gid) + '" onclick="OrbitHome._onChatClick(\'' + OrbitHome._escapeJs(gid) + '\')">';
        html += '  <div class="chat-row-avatar sq">' + gPic + '</div>';
        html += '  <div class="chat-row-info">';
        html += '    <div class="chat-row-name">' + OrbitHome._escape(gName) + '</div>';
        html += '    <div class="friend-sub">' + n + ' member' + (n === 1 ? '' : 's') + '</div>';
        html += '  </div>';
        // A group gets the same two affordances a friend does: open it, or act on
        // it. It used to have none, so a group was a row you could only tap.
        html += '  <button class="friend-action" title="Open" aria-label="Open ' + OrbitHome._escapeAttr(gName) +
                '" onclick="event.stopPropagation();OrbitHome._onChatClick(\'' + OrbitHome._escapeJs(gid) + '\')">' +
                '<i data-lucide="message-circle"></i></button>';
        html += '  <button class="friend-more" title="More" aria-label="More actions for ' + OrbitHome._escapeAttr(gName) +
                '" onclick="event.stopPropagation();OrbitHome.showChatContextMenu(\'' + OrbitHome._escapeJs(gid) + '\')">' +
                '<i data-lucide="more-vertical"></i></button>';
        html += '</div>';
      });
    }

    // Display style is a class on the container, so the same markup can read as
    // a dense list or as a face-first grid. The rows are identical either way —
    // only the layout changes, which is why this needs no second renderer.
    container.classList.toggle('contacts-grid', this._contactsDisplay() === 'grid');
    container.innerHTML = html;
    this._addAvatarFrames();
    if (window.lucide) lucide.createIcons();
  },

  /* -- Contacts: filters and display style ---------------------------------- */

  /** 'all' | 'online' | 'offline' | 'groups'. Momentary — not persisted. */
  _contactsFilter: 'all',

  /** 'list' | 'grid'. How you like to read, so it is remembered. */
  _contactsDisplay: function() {
    var s = MStore.settings || {};
    return s.contactsDisplay === 'grid' ? 'grid' : 'list';
  },

  setContactsFilter: function(id) {
    OrbitHome._contactsFilter = id || 'all';
    OrbitHome.renderFriendsList();
  },

  toggleContactsDisplay: function() {
    var next = OrbitHome._contactsDisplay() === 'grid' ? 'list' : 'grid';
    MStore.settings.contactsDisplay = next;
    try { MStore.save(); } catch (e) {}
    OrbitHome.renderFriendsList();
    var btn = document.getElementById('btn-contacts-style');
    if (btn && window.lucide) {
      btn.innerHTML = '<i data-lucide="' + (next === 'grid' ? 'list' : 'layout-grid') + '"></i>';
      try { lucide.createIcons({ root: btn }); } catch (e) {}
    }
  },

  /**
   * The chips above the list.
   *
   * ⚠ A chip with a zero count is DISABLED, not hidden. Hiding it would make the
   * row of chips change width as people come online, and a filter you cannot see
   * is a filter you will not remember exists. Disabled says "this exists, and
   * there is nothing in it right now", which is the truth.
   */
  renderContactsFilters: function(counts) {
    var host = document.getElementById('contacts-filters');
    if (!host) return;
    counts = counts || { all: 0, online: 0, offline: 0, groups: 0 };
    var active = OrbitHome._contactsFilter || 'all';

    var defs = [
      { id: 'all', label: 'All' },
      { id: 'online', label: 'Online' },
      { id: 'offline', label: 'Offline' },
      { id: 'groups', label: 'Groups' }
    ];

    host.innerHTML = defs.map(function(d) {
      var n = counts[d.id] || 0;
      var on = d.id === active;
      return '<button class="cf-chip' + (on ? ' on' : '') + '"' +
             ' data-filter="' + d.id + '"' +
             ' role="tab" aria-selected="' + (on ? 'true' : 'false') + '"' +
             (n === 0 && !on ? ' disabled' : '') + '>' +
             OrbitHome._escape(d.label) +
             '<span class="cf-n">' + n + '</span>' +
             '</button>';
    }).join('');

    if (!host._wired) {
      host._wired = true;
      host.addEventListener('click', function(e) {
        var b = e.target.closest ? e.target.closest('.cf-chip') : null;
        if (!b || b.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        OrbitHome.setContactsFilter(b.getAttribute('data-filter'));
      });
    }
  },

  /** Add profile frame overlays to friend avatars that have one selected */
  _addAvatarFrames: function() {
    // Gated on the stable Profile Frames setting — never inject frames when off
    if (!(MStore.settings && MStore.settings.profileFrames)) return;
    var avatarEls = document.querySelectorAll('.chat-row-avatar, .online-friend-avatar');
    var groupIds = {};
    (MStore.groups || []).forEach(function(g) { groupIds[g.id || g.groupId] = true; });
    var friends = MStore.friends || [];
    
    avatarEls.forEach(function(el) {
      // Skip if frame already exists
      if (el.querySelector('.pfp-frame')) return;
      
      // Find the peer ID from the parent row
      var row = el.closest('[data-peerid], [data-chatid]');
      if (!row) return;
      var id = row.getAttribute('data-peerid') || row.getAttribute('data-chatid');
      if (!id) return;
      
      // Skip groups
      if (groupIds[id]) return;
      
      // Find friend by matching id, peerId, or chat id
      var pfNum = 0;
      var rawPeerId = id.replace('dm_', '');
      for (var fi = 0; fi < friends.length; fi++) {
        var f = friends[fi];
        if (f.id === rawPeerId || f.peerId === rawPeerId || f.peerId === id) {
          pfNum = parseInt(f.profileFrame, 10) || 0;
          break;
        }
      }
      
      if (pfNum > 0) {
        var frameEl = document.createElement('img');
        frameEl.className = 'pfp-frame';
        frameEl.draggable = false;
        frameEl.alt = '';
        frameEl.src = 'icons/frames/pfp_frame_' + pfNum + '.png';
        el.appendChild(frameEl);
      }
    });
  },

  /** Show 3-item quick action menu (New Group / Add Contact / Scan QR) */
  showQuickSheet: function() {
    if (typeof OrbitSheet === 'undefined') return;
    OrbitSheet.show([
      { icon: 'users-round', label: 'New Group', subtext: 'Create or join a group', action: 'new-group' },
      { icon: 'user-round-plus', label: 'Add Contact', subtext: 'Connect with a friend', action: 'add-contact' },
      { icon: 'scan-qr-code', label: 'Scan QR', subtext: 'Scan a QR code to connect', action: 'scan-qr' }
    ]);
    OrbitSheet._callbacks = {
      'new-group': function() {
        if (window.showCreateGroup) window.showCreateGroup();
      },
      'add-contact': function() {
        if (window.showAddFriendModal) window.showAddFriendModal();
      },
      'scan-qr': function() {
        OrbitSheet.hide();
        setTimeout(function() {
          var scanner = document.getElementById('qr-scanner-overlay');
          if (scanner) scanner.style.display = 'flex';
          if (window.startQRScanner) window.startQRScanner();
        }, 200);
      }
    };
  },

  /** Start a DM from search results */
  _onStartDM: function(peerId) {
    if (!peerId) return;
    var chatId = 'dm_' + peerId;
    if (typeof window.openChat === 'function') {
      window.openChat(chatId);
    } else if (typeof openChat === 'function') {
      openChat(chatId);
    }
  },

  /** Render recent searches in the chat list area */
  renderRecentSearches: function() {
    var container = document.getElementById("chat-list");
    if (!container) return;
    var recent = (MStore.settings && MStore.settings.recentSearches) || [];
    if (!recent.length) {
      container.innerHTML = "<div class=\"empty-state enhanced\" style=\"padding-top:30px;\"><i data-lucide=\"search\"></i><div class=\"empty-state-text\">Search chats, friends & messages</div><div class=\"empty-state-sub\">Type to find conversations, people, or past messages</div></div>";
      return;
    }
    var html = "<div class=\"recent-searches-header\"><span>Recent Searches</span><button id=\"btn-clear-recent-searches\">Clear</button></div>";
    recent.forEach(function(s) {
      var escaped = (function(str) {
        var d = document.createElement("div");
        d.appendChild(document.createTextNode(str));
        return d.innerHTML;
      })(s);
      html += "<div class=\"recent-search-item\" data-query=\"" + escaped + "\"><i data-lucide=\"clock\"></i><span>" + escaped + "</span></div>";
    });
    container.innerHTML = html;
    if (window.lucide) lucide.createIcons();
    
    // Wire click on recent search items
    container.querySelectorAll(".recent-search-item").forEach(function(el) {
      el.addEventListener("click", function() {
        var q = this.getAttribute("data-query");
        var input = document.getElementById("home-search-input");
        if (input) {
          input.value = q;
          window._chatSearchQuery = q.toLowerCase();
          if (window.renderChatList) window.renderChatList();
        }
      });
    });
    
    // Wire clear button
    var clearBtn = document.getElementById("btn-clear-recent-searches");
    if (clearBtn) {
      clearBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        if (MStore.settings) MStore.settings.recentSearches = [];
        MStore.save();
        OrbitHome.renderRecentSearches();
      });
    }
  },

  /** Clear all recent searches */
  clearRecentSearches: function() {
    if (MStore.settings) MStore.settings.recentSearches = [];
    MStore.save();
    this.renderRecentSearches();
  },

  /** Render folder tabs in the home tab bar */
  renderFolderTabs: function() {
    var tabsContainer = document.getElementById('home-tabs');
    if (!tabsContainer) return;
    // Folder tabs live in their own scrollable rail appended after Friends/Groups
    var rail = tabsContainer.querySelector('.folder-rail');
    if (!rail) {
      rail = document.createElement('div');
      rail.className = 'folder-rail';
      tabsContainer.appendChild(rail);
    }
    // Remove old folder tabs from the rail (keep Friends and Groups)
    var existingFolderTabs = rail.querySelectorAll('.home-tab-folder');
    existingFolderTabs.forEach(function(t) { t.remove(); });
    // Folders are experimental — when disabled, cleanup only (no tabs rendered)
    if (!(MStore.settings && MStore.settings.experimentalFolders)) {
      tabsContainer.classList.remove('has-folders');
      tabsContainer.classList.remove('single-folder');
      tabsContainer.classList.remove('many-folders');
      if (rail.parentNode) rail.parentNode.removeChild(rail);
      return;
    }
    var folders = MStore.getChatFolders();
    var refNode = tabsContainer.querySelector('.home-tab[data-tab="groups"]');
    if (!refNode) {
      tabsContainer.classList.remove('has-folders');
      tabsContainer.classList.remove('single-folder');
      tabsContainer.classList.remove('many-folders');
      if (rail.parentNode) rail.parentNode.removeChild(rail);
      return;
    }
    tabsContainer.classList.toggle('has-folders', folders.length > 0);
    tabsContainer.classList.toggle('single-folder', folders.length === 1);
    tabsContainer.classList.toggle('many-folders', folders.length > 1);
    if (folders.length === 0) {
      if (rail.parentNode) rail.parentNode.removeChild(rail);
      return;
    }
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      var btn = document.createElement('button');
      btn.className = 'home-tab home-tab-folder' + (window._activeHomeTab === f.id ? ' active' : '');
      btn.setAttribute('data-tab', f.id);
      btn.setAttribute('data-folder-id', f.id);
      btn.innerHTML = OrbitHome._escape(f.name);
      rail.appendChild(btn);
    }
    // Keep the active folder tab reachable after re-renders
    if (window._activeHomeTab && window._activeHomeTab.indexOf('folder_') === 0) {
      OrbitHome.scrollFolderTabIntoView(window._activeHomeTab);
    }
    if (window.lucide) lucide.createIcons();
  },

  /** Scroll a folder tab into view if it sits beyond the visible edge */
  scrollFolderTabIntoView: function(folderId) {
    var tabsContainer = document.getElementById('home-tabs');
    if (!tabsContainer) return;
    var rail = tabsContainer.querySelector('.folder-rail');
    if (!rail) return;
    var el = rail.querySelector('.home-tab-folder[data-folder-id="' + folderId + '"]');
    if (!el) return;
    // offsetLeft is relative to the nearest positioned ancestor (#app-layout);
    // subtract rail.offsetLeft (same ancestor) to get the rail-relative offset
    var left = el.offsetLeft - rail.offsetLeft;
    var target = left - (rail.clientWidth - el.offsetWidth);
    if (target > rail.scrollLeft) {
      try { rail.scrollTo({ left: target, behavior: 'smooth' }); }
      catch (e) { rail.scrollLeft = target; }
    }
  },

  /** Show context menu for a chat row (long-press, or the ⋮ button) */
  showChatContextMenu: function(chatId) {
    if (typeof OrbitSheet === 'undefined') return;

    var folders = MStore.getChatFolders();
    var items = [];
    var callbacks = {};
    var foldersEnabled = !!(MStore.settings && MStore.settings.experimentalFolders);

    var grp = MStore.groups.find(function(g) { return g.id === chatId || g.groupId === chatId; });
    var isGroup = !!grp;

    // ── Folder membership ───────────────────────────────────────────────────
    // Chat-level, so it applies to a DM exactly as it does to a group. Built once
    // here and handed to whichever branch runs, because writing this block twice
    // is how two menus drift apart.
    var folderItems = [];
    var folderCallbacks = {};
    if (foldersEnabled) {
      var inFolders = [];
      for (var fi = 0; fi < folders.length; fi++) {
        if (folders[fi].chatIds.indexOf(chatId) !== -1) inFolders.push(folders[fi]);
      }
      for (var fi2 = 0; fi2 < folders.length; fi2++) {
        var f2 = folders[fi2];
        var alreadyIn = inFolders.some(function(inf) { return inf.id === f2.id; });
        (function(folderId, folderName, folderIcon, isIn) {
          var actionKey = (isIn ? 'remove_folder_' : 'add_folder_') + folderId;
          folderItems.push({
            icon: isIn ? 'check-circle' : (folderIcon || 'folder'),
            label: (isIn ? '✓ ' : '') + folderName,
            subtext: isIn ? 'Tap to remove' : 'Add chat to folder',
            action: actionKey
          });
          folderCallbacks[actionKey] = function() {
            if (isIn) {
              MStore.removeChatFromFolder(folderId, chatId);
              showToast('Removed from folder', 'info');
            } else {
              MStore.addChatToFolder(folderId, chatId);
              showToast('Added to folder', 'info');
            }
            OrbitHome.renderFolderTabs();
            if (window.renderChatList) window.renderChatList(window._activeHomeTab);
          };
        })(f2.id, f2.name, f2.icon, alreadyIn);
      }
      folderItems.push({ icon: 'plus', label: 'New Folder…', action: 'new_folder' });
      folderCallbacks['new_folder'] = function() { OrbitHome._showNewFolderSheet(chatId); };
    }

    if (!isGroup) {
      // ⚠ A DM HAS NO CHAT-LEVEL ACTIONS OF ITS OWN — they are USER actions, and
      // there is already a sheet for exactly that.
      //
      // This function only ever pushed GROUP items and folder items. So for a DM
      // with the experimental folder feature off, `items` came out EMPTY and
      // `OrbitSheet.show([])` drew a sheet containing nothing but the Cancel pill.
      // That is the three-dots button Dan pressed: it opened, and there was
      // nothing in it.
      //
      // showUserActionsSheet(userId) already holds the right set for a PERSON —
      // View Profile, Message, Mute, Close DM, Block — and it is the same sheet
      // the profile card opens. A contact gets one place its actions live instead
      // of a second menu that drifts away from the first.
      var peerId = chatId.indexOf('dm_') === 0 ? chatId.substring(3) : chatId;
      if (typeof window.showUserActionsSheet === 'function') {
        // Folder entries are chat-scoped and still apply, so they are handed over
        // rather than silently dropped.
        var extras = folderItems.map(function (it) {
          return { item: it, callback: folderCallbacks[it.action] };
        });
        window.showUserActionsSheet(peerId, { chatId: chatId }, extras);
        return;
      }
      // No user sheet to delegate to: the folder list is all there is, which is
      // still better than the empty sheet this used to draw.
      OrbitSheet.show(folderItems);
      OrbitSheet._callbacks = folderCallbacks;
      return;
    }

    // ── Group ───────────────────────────────────────────────────────────────
    var isMuted = !!(MStore.settings.mutedChats && MStore.settings.mutedChats[chatId]);
    var isPinned = !!(MStore.pinnedDMs && MStore.pinnedDMs[chatId]);
    var ownerId = grp.ownerId || grp.owner || (grp.creator && grp.creator.id);
    var isOwner = !!ownerId && String(ownerId) === String(MStore.user ? MStore.user.id : '');

    items.push({ icon: 'users-round', label: 'Group Info', action: 'group_info' });
    items.push({ icon: 'check-check', label: 'Mark as Read', action: 'group_mark_read' });
    items.push({ icon: isMuted ? 'bell' : 'bell-off', label: isMuted ? 'Unmute Notifications' : 'Mute Notifications', action: 'group_mute' });
    items.push({ icon: isPinned ? 'pin-off' : 'pin', label: isPinned ? 'Unpin Chat' : 'Pin Chat', action: 'group_pin' });
    if (isOwner) {
      items.push({ icon: 'trash-2', label: 'Delete Group', danger: true, action: 'group_delete' });
    } else {
      items.push({ icon: 'log-out', label: 'Leave Group', danger: true, action: 'group_leave' });
    }

    items = items.concat(folderItems);
    Object.keys(folderCallbacks).forEach(function (k) { callbacks[k] = folderCallbacks[k]; });

    callbacks['group_info'] = function() {
      if (window.showGroupInfo) window.showGroupInfo(chatId);
    };
    callbacks['group_mark_read'] = function() {
      MStore.markAsRead(chatId);
      if (window.renderChatList) window.renderChatList(window._activeHomeTab);
      showToast('Marked as read', 'info');
    };
    callbacks['group_mute'] = function() {
      MStore.toggleMute(chatId);
      if (window.renderChatList) window.renderChatList(window._activeHomeTab);
      showToast(isMuted ? 'Unmuted' : 'Muted', 'info');
    };
    callbacks['group_pin'] = function() {
      MStore.togglePinDM(chatId);
      if (window.renderChatList) window.renderChatList(window._activeHomeTab);
    };
    if (isOwner) {
      callbacks['group_delete'] = function() {
        if (confirm('Delete this group permanently? This cannot be undone.')) {
          if (window.deleteGroupById) window.deleteGroupById(chatId);
        }
      };
    } else {
      callbacks['group_leave'] = function() {
        if (confirm('Leave this group?')) {
          if (window.leaveGroupById) window.leaveGroupById(chatId);
        }
      };
    }

    OrbitSheet.show(items);
    OrbitSheet._callbacks = callbacks;
  },

  /** Show an in-app bottom sheet prompting for a new folder name (+ Folder flow) */
  _showNewFolderSheet: function(chatId) {
    if (typeof OrbitSheet === 'undefined') return;

    var html = '';
    // Static drag handle comes from #bottom-sheet in index.html — no inline handle here
    html += '<div style="font-size:17px;font-weight:700;color:var(--text-primary);padding:8px 20px 4px;">New Folder</div>';
    html += '<input id="new-folder-name" type="text" placeholder="Folder name" maxlength="32" style="width:calc(100% - 40px);margin:8px 20px;padding:12px 14px;border:1px solid var(--border-subtle);border-radius:10px;background:var(--bg-base);color:var(--text-primary);font-size:15px;font-family:inherit;outline:none;">';
    // Create button styled like .bottom-sheet-item
    html += '<button class="bottom-sheet-item" id="btn-new-folder-create" style="background:transparent;border:none;color:var(--text-primary);font-size:16px;font-weight:500;width:100%;text-align:left;cursor:pointer;display:flex;align-items:center;gap:16px;padding:16px 20px;">';
    html += '<i data-lucide="plus" style="width:24px;height:24px;color:var(--accent-primary);flex-shrink:0;"></i>';
    html += '<span>Create Folder</span>';
    html += '</button>';

    OrbitSheet.showCustom(html);

    // Render the plus icon
    if (window.lucide) lucide.createIcons();

    var inp = document.getElementById('new-folder-name');
    var createBtn = document.getElementById('btn-new-folder-create');

    // Focus the input once the sheet animation settles
    if (inp) setTimeout(function() { inp.focus(); }, 250);

    var doCreate = function() {
      if (!inp) return;
      var name = inp.value.trim();
      if (!name) {
        showToast('Folder name cannot be empty', 'info');
        if (inp) inp.focus();
        return;
      }
      var newId = MStore.createFolder(name, 'folder');
      MStore.addChatToFolder(newId, chatId);
      OrbitSheet.hide();
      OrbitHome.renderFolderTabs();
      OrbitHome.scrollFolderTabIntoView(newId);
      if (window.renderChatList) window.renderChatList(window._activeHomeTab);
      showToast('Folder "' + name + '" created', 'info');
      // Re-open the context sheet so the new folder shows (checked) — the overlay
      // is the same DOM element, so delay until the hide animation finishes
      setTimeout(function() { OrbitHome.showChatContextMenu(chatId); }, 250);
    };

    if (createBtn) createBtn.addEventListener('click', doCreate);

    // Enter key in the input triggers create
    if (inp) {
      inp.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          if (createBtn) createBtn.click();
        }
      });
    }
  },

  /** Show folder tab long-press menu (rename/delete) */
  _showFolderTabMenu: function(folderId) {
    if (typeof OrbitSheet === 'undefined') return;
    if (!(MStore.settings && MStore.settings.experimentalFolders)) return;
    var folder = MStore.chatFolders[folderId];
    if (!folder) return;
    OrbitSheet.show([
      { icon: 'pencil', label: 'Rename Folder', action: 'rename' },
      { icon: 'trash-2', label: 'Delete Folder', action: 'delete' }
    ]);
    OrbitSheet._callbacks = {
      'rename': function() {
        var name = prompt('Rename folder:', folder.name);
        if (name && name.trim()) {
          MStore.renameFolder(folderId, name.trim());
          OrbitHome.renderFolderTabs();
        }
      },
      'delete': function() {
        if (confirm('Delete folder "' + folder.name + '"? Chats will not be deleted.')) {
          MStore.deleteFolder(folderId);
          OrbitHome.renderFolderTabs();
          if (window._activeHomeTab === folderId) {
            window._activeHomeTab = 'friends';
            document.querySelectorAll('.home-tab').forEach(function(t) {
              t.classList.toggle('active', t.dataset.tab === 'friends');
            });
            if (window.renderChatList) window.renderChatList('friends');
          } else {
            if (window.renderChatList) window.renderChatList(window._activeHomeTab);
          }
        }
      }
    };
  },

  /** Initialize long-press on chat rows for context menu */
  _initChatContextMenu: function() {
    var container = document.getElementById('chat-list');
    if (!container) return;
    if (container._folderCtxInitialized) return;
    container._folderCtxInitialized = true;

    var pressTimer = null;
    var startX = 0, startY = 0;

    container.addEventListener('touchstart', function(e) {
      var row = e.target.closest('.chat-row');
      if (!row) return;
      // DM rows carry [data-user-id] — the global long-press handler (app.js) owns those
      // and opens the user actions sheet; don't start the folder-menu timer.
      if (e.target.closest && e.target.closest('[data-user-id]')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pressTimer = setTimeout(function() {
        pressTimer = null;
        var chatId = row.getAttribute('data-chatid');
        if (chatId) {
          OrbitHome.showChatContextMenu(chatId);
          if (e.cancelable) { e.preventDefault(); }
        }
      }, 400);
    }, {passive: true});

    container.addEventListener('touchmove', function(e) {
      if (pressTimer) {
        var dx = Math.abs(e.touches[0].clientX - startX);
        var dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
    }, {passive: true});

    container.addEventListener('touchend', function() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });

    // Desktop fallback: right-click
    container.addEventListener('contextmenu', function(e) {
      var row = e.target.closest('.chat-row');
      if (!row) return;
      e.preventDefault();
      // DM rows carry data-user-id → open the user actions sheet instead of the folder menu.
      var userEl = e.target.closest ? e.target.closest('[data-user-id]') : null;
      if (userEl) {
        var uid = userEl.getAttribute('data-user-id');
        if (uid && window.showUserActionsSheet) window.showUserActionsSheet(uid);
        return;
      }
      var chatId = row.getAttribute('data-chatid');
      if (chatId) OrbitHome.showChatContextMenu(chatId);
    });
  },
};


// --- Event Wiring (runs on DOM ready) ---
document.addEventListener('DOMContentLoaded', function() {
  // Override window.renderChatList with v0.2.8 version (app.js exports a different one)
  window.renderChatList = function(filter) { OrbitHome.renderChatList(filter); };
  // The search filter pills are rendered with inline onclick, so the handler
  // has to be reachable from a global.
  window._searchSetType = function(type) { OrbitHome._setSearchType(type); };

  // Online friends click delegation
  document.getElementById('online-friends-row').addEventListener('click', function(e) {
    var item = e.target.closest('.online-friend-item');
    if (!item) return;
    
    // + button (Quick Add) — open tabbed sheet
    if (item.id === 'btn-add-quick-online') {
      OrbitHome.showQuickSheet();
      return;
    }
    
    // "More" button
    if (item.id === 'online-friends-more-btn') {
      var container = document.getElementById('online-friends-row');
      if (container) {
        container.dataset.showAll = 'true';
        OrbitHome.renderOnlineFriends();
      }
      return;
    }
    
    // Friend click — open their DM.
    // ⚠ This used to carry its own copy of the chat lookup, which is how the two
    // copies drifted: this one matched `peerId`/`id` and the row above rendered
    // `peerId` only, so both were broken together and neither was obviously the
    // bug. One implementation now (_onFriendClick), called from here.
    OrbitHome._onFriendClick(item.getAttribute('data-peerid'));
  });
  
  // Wire home tabs (Friends | Groups | Folders) — use event delegation for dynamic tabs
  document.getElementById('home-tabs').addEventListener('click', function(e) {
    var tab = e.target.closest('.home-tab');
    if (!tab) return;
    var tabName = tab.dataset.tab;
    if (!tabName) return;
    window._activeHomeTab = tabName;

    // Update active state
    document.querySelectorAll('.home-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Re-render chat list with filter
    if (window.renderChatList) {
      window.renderChatList(tabName);
    }
  });

  // Long-press on folder tabs — rename/delete.
  // Pointer Events so it works with mouse (desktop testing) as well as touch/pen (WebView).
  (function() {
    var tabsContainer = document.getElementById('home-tabs');
    var folderPressTimer = null;
    tabsContainer.addEventListener('pointerdown', function(e) {
      // Mouse: only the primary (left) button — right-click stays the native menu.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var tab = e.target.closest('.home-tab-folder');
      if (!tab) return;
      folderPressTimer = setTimeout(function() {
        folderPressTimer = null;
        var folderId = tab.getAttribute('data-folder-id');
        if (folderId && MStore.chatFolders[folderId]) {
          OrbitHome._showFolderTabMenu(folderId);
          if (e.cancelable) { e.preventDefault(); }
        }
      }, 500);
    }, { passive: true });
    tabsContainer.addEventListener('pointermove', function() {
      if (folderPressTimer) { clearTimeout(folderPressTimer); folderPressTimer = null; }
    }, { passive: true });
    tabsContainer.addEventListener('pointerup', function() {
      if (folderPressTimer) { clearTimeout(folderPressTimer); folderPressTimer = null; }
    }, { passive: true });
    tabsContainer.addEventListener('pointercancel', function() {
      if (folderPressTimer) { clearTimeout(folderPressTimer); folderPressTimer = null; }
    }, { passive: true });
  })();
  
  // The quick-add button is the `.btn-add-quick-online` tile in the online
  // friends row, wired via the delegated click listener on
  // #online-friends-row above (search for "btn-add-quick-online"). It used to
  // also be wired here against an id `btn-add-quick` that does not exist in
  // the DOM, so the second wire resolved to null and was a trap: a future
  // edit "fixing" the dead wire by renaming the id (or adding the missing
  // element) would have opened the quick sheet twice. Removed.

  // Wire search button toggle
  var searchBtn = document.getElementById('btn-search-home');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      var searchInline = document.getElementById('home-search-inline');
      var searchInput = document.getElementById('home-search-input');
      var chatsPanel = document.getElementById('panel-chats');
      if (searchInline && searchInput) {
        var isOpen = searchInline.classList.contains('open');
        if (isOpen) {
          searchInline.classList.remove('open');
          searchInput.blur();
          if (chatsPanel) chatsPanel.classList.remove('search-open');
        } else {
          searchInline.classList.add('open');
          // Collapses the account avatar and the title so the field gets the
          // whole row — the header is only 56px tall.
          if (chatsPanel) chatsPanel.classList.add('search-open');
          // A fresh search: rebuild the message index (messages may have arrived
          // since last time) and go back to showing everything.
          OrbitHome._invalidateSearchIndex();
          window._searchTypeFilter = 'all';
          setTimeout(function() { searchInput.focus(); }, 100);
        }
      }
    });
  }
  
  // Compose button in the header — the quick sheet (new group / add contact /
  // scan QR). This replaced the notifications bell, which opened Activity; that
  // is a tab now, so the bell was a second door to a one-tap destination.
  var composeBtn = document.getElementById('btn-compose-home');
  if (composeBtn) {
    composeBtn.addEventListener('click', function() {
      if (typeof OrbitHome !== 'undefined' && OrbitHome.showQuickSheet) {
        OrbitHome.showQuickSheet();
      }
    });
  }

  // Wire home search input — shows recent searches on focus, results on type
  var homeSearchInput = document.getElementById('home-search-input');
  if (homeSearchInput) {
    homeSearchInput.addEventListener('focus', function() {
      if (!this.value.trim()) {
        OrbitHome.renderRecentSearches();
      }
    });
    homeSearchInput.addEventListener('input', function() {
      var val = this.value.trim().toLowerCase();
      // A new query starts from All — carrying a "Messages" filter over to a
      // search that finds no messages just looks broken.
      if (val !== window._chatSearchQuery) window._searchTypeFilter = 'all';
      window._chatSearchQuery = val;
      if (window.renderChatList) window.renderChatList();
    });
  }
  
  // Wire search close button
  var searchClose = document.getElementById('btn-home-search-close');
  if (searchClose) {
    searchClose.addEventListener('click', function() {
      var searchInline = document.getElementById('home-search-inline');
      var searchInput = document.getElementById('home-search-input');
      // With text in the box an ✕ reads as "clear", so it clears and leaves the search
      // open. Empty, it reads as "close", so it closes. Doing both in one tap was the
      // ambiguity: a single press threw away the query AND the search you were in.
      if (searchInput && searchInput.value) {
        searchInput.value = '';
        window._chatSearchQuery = '';
        if (window.renderChatList) window.renderChatList();
        searchInput.focus();
        return;
      }
      if (searchInline) searchInline.classList.remove('open');
      if (searchInput) {
        searchInput.value = '';
        searchInput.blur();
      }
      var closePanel = document.getElementById('panel-chats');
      if (closePanel) closePanel.classList.remove('search-open');
      window._chatSearchQuery = '';
      if (window.renderChatList) window.renderChatList();
    });
  }

  // Initial render with v0.2.8 components
  window._activeHomeTab = 'friends';
  OrbitHome.renderChatList('friends');
  OrbitHome.renderFolderTabs();
  OrbitHome._initChatContextMenu();
});

// Online friends filter tag clicks
document.addEventListener('click', function(e) {
  var tag = e.target.closest('.online-filter-tag');
  if (!tag) return;
  var filter = tag.dataset.filter;
  document.querySelectorAll('.online-filter-tag').forEach(function(t) {
    t.classList.toggle('active', t.dataset.filter === filter);
  });
  window._onlineFriendFilter = filter;
  var container = document.getElementById('online-friends-row');
  if (container) container.dataset.filter = filter;
  var onlineFriendsSection = document.getElementById('online-friends-section');
  if (onlineFriendsSection) {
    OrbitHome.renderOnlineFriends();
  }
});
