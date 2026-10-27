// mobile/src/js/components/chat-screen.js
// v0.2.8 — Chat Screen Renderer

var OrbitChat = {
  _currentChatId: null,
  _contextMenuInitialized: false,

  /** Open a chat and render everything */
  openChat: function(chatId) {
    if (!chatId) return;
    this._currentChatId = chatId;
    
    // Get chat info
    var chat = this._getChat(chatId);
    if (!chat) return;
    
    // Sync with app.js state
    window.activeChatId = chatId;
    window.editingMsg = null;
    window.replyingTo = null;
    // Hide reply bar when opening new chat
    if (window.cancelReplyEdit) window.cancelReplyEdit();
    
    // Update header (includes profile frame support)
    this._renderHeader(chat);
    
    // Show/hide members button for groups
    var galleryBtn = document.getElementById('btn-gallery');
    var moreBtn = document.getElementById('btn-chat-more');
    var group = (MStore.groups || []).find(function(g) { return g.id === chatId; });
    if (group) {
      if (galleryBtn) galleryBtn.style.display = 'flex';
      var membersBtn = document.getElementById('btn-chat-members');
      if (!membersBtn && galleryBtn && moreBtn) {
        membersBtn = document.createElement('button');
        membersBtn.id = 'btn-chat-members';
        membersBtn.title = 'Members';
        membersBtn.innerHTML = '<i data-lucide="users-round"></i>';
        galleryBtn.parentNode.insertBefore(membersBtn, moreBtn);
        membersBtn.addEventListener('click', function() { if (window.showGroupInfo) window.showGroupInfo(chatId); });
        if (window.lucide) lucide.createIcons();
      }
      if (membersBtn) membersBtn.style.display = 'flex';
    } else {
      var membersBtn = document.getElementById('btn-chat-members');
      if (membersBtn) membersBtn.style.display = 'none';
    }
    
    // Show/hide privacy badge
    var privacyBtn = document.getElementById('btn-privacy-badge');
    if (privacyBtn) {
      privacyBtn.style.display = (MStore.settings && MStore.settings.privacyMode) ? 'flex' : 'none';
    }
    
    // Highlight active chat in list
    document.querySelectorAll('.chat-row').forEach(function(r) { r.classList.remove('active-chat'); });
    var activeRow = document.querySelector('.chat-row[data-chat="' + chatId + '"]') || document.querySelector('.chat-row[data-chatid="' + chatId + '"]');
    if (activeRow) activeRow.classList.add('active-chat');
    
    // Open panel with animation
    OrbitNav.openChat();
    var panel = document.getElementById('panel-chat');
    if (panel) {
      panel.classList.add('anim-enter-up');
      setTimeout(function() { panel.classList.remove('anim-enter-up'); }, 300);
    }
    
    // Render messages
    this.renderMessages(chatId);
    
    // Reset unread
    if (MStore.unreadCounts) {
      MStore.unreadCounts[chatId] = 0;
    }
    
    // Scroll to bottom
    setTimeout(function() {
      var feed = document.getElementById('message-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    }, 100);
  },

  /** Close current chat */
  closeChat: function() {
    this._currentChatId = null;
    window.activeChatId = null;
    OrbitNav.closeChat();
  },

  /** Get chat or group data */
  _getChat: function(chatId) {
    if (!chatId) return null;
    
    var peerId = null;
    var isGroup = false;
    
    if (chatId.indexOf('dm_') === 0) {
      peerId = chatId.substring(3);
    } else if (chatId.indexOf('group_') === 0) {
      isGroup = true;
      var groups = MStore.groups || [];
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].id === chatId) return groups[i];
      }
      return null;
    } else {
      // Plain chat ID — could be a DM or echo
      peerId = chatId;
    }
    
    // Try to find existing chat by ID
    var chats = MStore.chats || [];
    var chat = null;
    for (var i = 0; i < chats.length; i++) {
      if (chats[i].id === chatId || chats[i].chatId === chatId) {
        chat = chats[i];
        break;
      }
    }
    
    // For DM chats, enrich with friend data
    if (peerId && !isGroup) {
      var friends = MStore.friends || [];
      for (var i = 0; i < friends.length; i++) {
        if (window.orbitIsFriend ? window.orbitIsFriend(friends[i], peerId)
                                 : (friends[i].id === peerId || friends[i].peerId === peerId)) {
          var friend = friends[i];
          if (chat) {
            // Merge friend data with chat data (friend avatar/status takes priority)
            return {
              id: chat.id || friend.id,
              peerId: chat.peerId || friend.peerId || friend.id,
              name: chat.name || friend.name,
              avatar: chat.avatar || friend.avatar,
              status: chat.status || friend.status,
              lastSeen: chat.lastSeen || friend.lastSeen,
              lastMessage: chat.lastMessage || '',
              lastTime: chat.lastTime || 0,
              unread: chat.unread || 0,
              type: 'dm',
              messages: chat.messages || []
            };
          }
          // No existing chat — return friend data
          return friend;
        }
      }
    }
    
    // No friend found — return raw chat or generic placeholder
    if (chat) return chat;
    if (peerId) return { id: peerId, peerId: peerId, name: peerId, type: 'dm' };
    return null;
  },

  /** Render chat header */
  _renderHeader: function(chat) {
    var headerInfo = document.getElementById('chat-header-info');
    var avatarEl = document.getElementById('chat-header-avatar');
    if (!headerInfo) return;
    
    var displayName = chat.name || chat.peerId || 'Chat';
    
    // For DM chats the header is the partner's profile → long-press opens the user actions sheet.
    // Groups and the echo bot don't get a user hook.
    var dmPeerId = null;
    var isEcho = chat.id === 'echo' || chat.type === 'echo';
    var isGroupChat = chat.type === 'group' || (chat.members && Object.prototype.toString.call(chat.members) === '[object Array]');
    if (!isEcho && !isGroupChat) {
      dmPeerId = chat.peerId || (chat.id && chat.id.indexOf('dm_') === 0 ? chat.id.substring(3) : chat.id);
    }
    
    // ── Trust warning ─────────────────────────────────────────────────────
    // ⚠ A verified report is a WARNING, never a block: it is shown to the person it
    // would affect and they decide. ⚠ The reporter is NAMED — "somebody reported them"
    // with no attribution is an accusation nobody can weigh. ⚠ Groups and the Echo bot
    // get nothing: a report is about a person, not a room or a bot.
    (function () {
      var bar = document.getElementById('trust-warning-bar');
      if (!bar) return;
      var list = (dmPeerId && window.OrbitTrust) ? window.OrbitTrust.warningsFor(dmPeerId) : [];
      if (!list.length || window.OrbitChat._trustDismissedFor === chat.id) {
        bar.style.display = 'none';
        return;
      }
      var w = list[0];
      var days = Math.max(0, Math.floor((Date.now() - w.ts) / 86400000));
      var when = days === 0 ? 'today' : (days === 1 ? 'yesterday' : days + ' days ago');
      var extra = list.length > 1
        ? ' ' + (list.length - 1) + ' other contact' + (list.length > 2 ? 's' : '') + ' reported them too.'
        : '';
      var text = document.getElementById('trust-warning-text');
      if (text) {
        text.textContent = (w.reporterName || 'A contact') + ' reported this person for ' +
          w.reason + ' ' + when + '.' + extra;
      }
      bar.style.display = 'flex';
      var dismiss = document.getElementById('btn-trust-dismiss');
      if (dismiss) {
        // onclick, not addEventListener: this runs on every header render and listeners
        // would stack up on the same element.
        dismiss.onclick = function () {
          window.OrbitChat._trustDismissedFor = chat.id;
          bar.style.display = 'none';
        };
      }
    })();

    // Match old app.js status text format
    var statusText = '';
    var statusDotColor = 'var(--text-muted)';
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };
    var statusColors = { online: 'var(--accent-success)', away: 'var(--accent-warning)', busy: 'var(--accent-danger)', offline: 'var(--text-muted)' };
    
    if (chat.id === 'echo') {
      // Echo bot: "Bot · Online" (no status dot, matching old app.js)
      statusText = 'Bot · Online';
    } else if (chat.status && statusLabels[chat.status]) {
      // Known status
      statusText = statusLabels[chat.status];
      statusDotColor = statusColors[chat.status] || 'var(--text-muted)';
    } else if (chat.lastSeen && chat.lastSeen > Date.now() - 45000) {
      // Recently online (within 45s)
      statusText = 'Online';
      statusDotColor = 'var(--accent-success)';
    } else if (chat.lastSeen) {
      // Last seen
      var d = new Date(chat.lastSeen);
      statusText = 'Last seen ' + d.toLocaleDateString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
      statusDotColor = 'var(--text-muted)';
    } else {
      statusText = 'Offline';
      statusDotColor = 'var(--text-muted)';
    }
    
    var statusDotHtml = '';
    if (chat.id !== 'echo') {
      statusDotHtml = '<span style="width:7px;height:7px;border-radius:50%;background:' + statusDotColor + ';display:inline-block;"></span> ';
    }
    
    headerInfo.innerHTML =
      '<div class="chat-header-name"' + (dmPeerId ? ' data-user-id="' + OrbitChat._escapeAttr(dmPeerId) + '"' : '') + '>' + OrbitChat._escapeAttr(displayName) + '</div>' +
      '<div class="chat-header-status">' +
        statusDotHtml + OrbitChat._escapeAttr(statusText) +
      '</div>';
    
      // Avatar with profile frame support
      if (avatarEl) {
        var initial = displayName.charAt(0).toUpperCase();
        avatarEl.style.position = 'relative';
        // DM chats: the header avatar is the partner → long-press opens the user actions sheet
        if (dmPeerId) avatarEl.setAttribute('data-user-id', dmPeerId);
        else avatarEl.removeAttribute('data-user-id');
        // A group with no uploaded image gets the member-avatar grid, matching
        // desktop (shared/ui/group-avatar.js). The MStore.groups record is
        // preferred because it carries the authoritative member list.
        var headerGridHtml = null;
        if (isGroupChat && !chat.avatar && window.OrbitGroupAvatarMobile) {
          var hdrGroup = null;
          var hdrGroups = MStore.groups || [];
          for (var hgi = 0; hgi < hdrGroups.length; hgi++) {
            if (String(hdrGroups[hgi].id) === String(chat.id) ||
                String(hdrGroups[hgi].groupId) === String(chat.id)) {
              hdrGroup = hdrGroups[hgi];
              break;
            }
          }
          // 36 to match .chat-header-avatar.
          headerGridHtml = window.OrbitGroupAvatarMobile.forGroup(hdrGroup || chat, 36, 'var(--bg-surface)');
        }
        avatarEl.classList.toggle('has-group-avatar', !!headerGridHtml);
        if (headerGridHtml) {
          avatarEl.innerHTML = headerGridHtml;
        } else if (chat.avatar) {
          avatarEl.innerHTML = '<img src="' + OrbitChat._escapeAttr(chat.avatar) + '" alt="">';
        } else {
          avatarEl.textContent = initial;
        }
      // Add profile frame for DM chats (friend's profile frame) — gated on stable setting
      if (MStore.settings && MStore.settings.profileFrames) {
        if (chat.type !== 'group') {
          var pfNum = 0;
          var friends = MStore.friends || [];
          for (var fi = 0; fi < friends.length; fi++) {
            if (friends[fi].id === chat.peerId || friends[fi].peerId === chat.peerId || friends[fi].id === chat.id) {
              pfNum = parseInt(friends[fi].profileFrame, 10) || 0;
              break;
            }
          }
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
      }
      avatarEl.style.display = '';
    }
  },

  _escapeAttr: function(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  /** Render all messages for a chat with date separators */
  renderMessages: function(chatId) {
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    
    var messages = MStore.messages && MStore.messages[chatId] || [];
    
    if (messages.length === 0) {
      feed.innerHTML = window.OrbitEmpty.html({
        icon: 'message-circle',
        title: 'No messages yet',
        hint: 'Say hello to start the conversation.',
        fill: true
      });
      this._initContextMenu();
      return;
    }
    
    var html = '';
    var lastDateKey = '';
    
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var isMine = msg.from === 'me' || msg.from === MStore.user?.peerId;
      var isGrouped = (i > 0 && messages[i-1].from === msg.from && 
                       (msg.time - messages[i-1].time) < 120000); // 2 min threshold
      
      // Date separator
      var msgDate = msg.time ? new Date(msg.time) : null;
      var dateKey = msgDate ? (msgDate.getFullYear() + '-' + (msgDate.getMonth()+1) + '-' + msgDate.getDate()) : '';
      if (dateKey && dateKey !== lastDateKey) {
        html += OrbitChat._renderDateSeparator(msgDate);
        lastDateKey = dateKey;
      }
      
      html += this._renderSingleMessage(msg, isMine, isGrouped);
    }
    
    feed.innerHTML = html;
    
    // Re-init Lucide
    if (window.lucide) lucide.createIcons();
    
    // Init long-press context menu (safe to call multiple times)
    this._initContextMenu();
    
    // Scroll to bottom
    setTimeout(function() {
      feed.scrollTop = feed.scrollHeight;
    }, 50);
  },

  /** Render a date separator pill */
  _renderDateSeparator: function(date) {
    var label = OrbitChat._formatDateLabel(date);
    return '<div class="date-separator"><span>' + label + '</span></div>';
  },

  /** Format a date as "Today", "Yesterday", or "Mon, Feb 16" */
  _formatDateLabel: function(date) {
    if (!date) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (msgDate.getTime() === today.getTime()) return 'Today';
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  },

  /** Render a single message bubble */
  _renderSingleMessage: function(msg, isMine, isGrouped) {
    var text = msg.text || '';
    var time = msg.time ? new Date(msg.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    var reactions = msg.reactions || [];
    var hasReactions = reactions.length > 0;
    
    var html = '<div class="message-row' + (isMine ? ' mine' : ' other') + (isGrouped ? ' grouped' : '') + '" data-msg-id="' + (msg.id || '') + '" data-msg-anim="slide">';
    
    // Reply reference
    if (msg.replyTo) {
      html += '  <div class="reply-ref">';
      html += '    <div class="reply-ref-bar"></div>';
      html += '    <div class="reply-ref-content">';
      html += '      <span class="reply-ref-name">' + OrbitChat._escape(msg.replyToName || 'Message') + '</span>';
      html += '      <span class="reply-ref-text">' + OrbitChat._escape(msg.replyToText || '') + '</span>';
      html += '    </div>';
      html += '  </div>';
    }
    
    html += '  <div class="message-bubble">';
    
    // Text content (sanitized) with mention support
    if (text) {
      html += '    <div class="msg-text">' + OrbitChat._sanitizeHtml(text, msg.mentions) + '</div>';
    }
    
    // Translated text (if available)
    if (msg.translatedText) {
      html += '    <div class="translated-text">' + OrbitChat._escape(msg.translatedText) + '</div>';
    } else if (msg._translating) {
      html += '    <div class="translated-text" style="opacity:0.5;font-style:italic;">Translating…</div>';
    }
    
    // Reactions
    if (hasReactions) {
      html += '    <div class="reactions-row" data-msg-id="' + (msg.id || '') + '">';
      reactions.forEach(function(r) {
        html += '      <span class="reaction-pill' + (r.mine ? ' mine' : '') + '">' + r.emoji + ' <span class="reaction-pill-count">' + r.count + '</span></span>';
      });
      html += '    </div>';
    }
    
    // Time
    html += '    <div class="message-time">' + time + '</div>';
    html += '  </div>';
    html += '</div>';
    
    return html;
  },

  /** Sanitize HTML (allow only safe tags) with mention support */
  _sanitizeHtml: function(str, mentions) {
    if (!str) return '';
    // Use markdown renderer with mention support if available
    if (window.Sanitize && window.Sanitize.markdown) {
      return this._renderMsgText(str, mentions);
    }
    // Basic fallback: escape HTML but allow line breaks
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML.replace(/\n/g, '<br>');
  },

  /** Render message text with clickable mention spans */
  _renderMsgText: function(text, mentions) {
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
    var html = window.Sanitize ? window.Sanitize.markdown(processed) : OrbitChat._escape(processed);
    // Restore mention placeholders as clickable spans
    if (placeholders.length > 0) {
      placeholders.forEach(function(p) {
        var ph = '\x00MENTION_' + p.idx + '\x00';
        var mentionHtml = '<span class="chat-mention mention-clickable" data-userid="' + p.userId + '" data-username="' + p.username + '" onclick="window._onMentionClick(\'' + p.userId + '\')">@' + p.username + '</span>';
        html = html.split(ph).join(mentionHtml);
      });
    }
    return html;
  },

  /** Escape HTML for safe inline insertion */
  _escape: function(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  },

  /** Initialize long-press context menu (event delegation on #message-feed) */
  _esc: function(s) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s == null ? '' : String(s)));
    return d.innerHTML;
  },

  /**
   * Every reaction on a message, in a sheet.
   *
   * The reaction row is capped at five pills so it stays one line, which means
   * anything past the fifth is invisible on the message itself. Long-press is
   * the way in.
   */
  _showAllReactions: function(msgId) {
    if (typeof OrbitSheet === 'undefined' || typeof OrbitSheet.showCustom !== 'function') return;
    if (!window.MStore) return;

    var chatId = window.activeChatId ||
                 (window.OrbitChat && OrbitChat._currentChatId) || null;
    if (!chatId) return;

    var msgs = MStore.getMessages(chatId) || [];
    var msg = null;
    for (var i = 0; i < msgs.length; i++) {
      if (String(msgs[i].id) === String(msgId)) { msg = msgs[i]; break; }
    }
    if (!msg || !msg.reactions || !msg.reactions.length) return;

    var groups = {};
    msg.reactions.forEach(function(r) {
      if (!r || !r.emoji) return;
      if (!groups[r.emoji]) groups[r.emoji] = [];
      groups[r.emoji].push(r.userId);
    });

    var self = this;
    var html = '<div class="rx-sheet">' +
               '<div class="rx-sheet-title">Reactions</div>';

    Object.keys(groups).forEach(function(emoji) {
      var names = groups[emoji].map(function(uid) {
        if (MStore.user && String(uid) === String(MStore.user.id)) return 'You';
        var f = (MStore.friends || []).filter(function(x) {
          return x.id === uid || x.userId === uid;
        })[0];
        return f ? (f.name || 'Someone') : 'Someone';
      });
      html += '<div class="rx-sheet-row">' +
                '<span class="rx-sheet-emoji">' + self._esc(emoji) + '</span>' +
                '<span class="rx-sheet-who">' + self._esc(names.join(', ')) + '</span>' +
                '<span class="rx-sheet-count">' + groups[emoji].length + '</span>' +
              '</div>';
    });
    html += '</div>';
    OrbitSheet.showCustom(html);
  },

  _initContextMenu: function() {
    if (this._contextMenuInitialized) return;
    
    var feed = document.getElementById('message-feed');
    if (!feed) return;
    this._contextMenuInitialized = true;
    
    var pressTimer = null;
    var startX = 0, startY = 0;
    
    feed.addEventListener('touchstart', function(e) {
      var row = e.target.closest('.message-row');
      if (!row) return;
      // Sender names/avatars carry [data-user-id] — the global long-press handler (app.js)
      // owns those and opens the user actions sheet; don't start the message-menu timer.
      if (e.target.closest && e.target.closest('[data-user-id]')) return;

      // A long-press on the reaction row shows EVERY reaction rather than the
      // message menu. The row is capped at five pills, so this is the only way
      // to see the rest.
      var rxRow = e.target.closest ? e.target.closest('.reactions-row') : null;
      if (rxRow) {
        var rxMsgId = rxRow.getAttribute('data-msg-id');
        pressTimer = setTimeout(function() {
          pressTimer = null;
          if (rxMsgId) OrbitChat._showAllReactions(rxMsgId);
          if (e.cancelable) { e.preventDefault(); }
        }, 400);
        return;
      }

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      pressTimer = setTimeout(function() {
        pressTimer = null;
        var msgId = row.getAttribute('data-msg-id');
        if (msgId) {
          OrbitChat._showContextMenu(msgId);
          // Prevent text selection / default action
          if (e.cancelable) { e.preventDefault(); }
        }
      }, 400);
    }, {passive: true});
    
    feed.addEventListener('touchmove', function(e) {
      if (pressTimer) {
        var dx = Math.abs(e.touches[0].clientX - startX);
        var dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 10 || dy > 10) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      }
    }, {passive: true});
    
    feed.addEventListener('touchend', function() {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    });
    
    // Desktop fallback: right-click
    feed.addEventListener('contextmenu', function(e) {
      var row = e.target.closest('.message-row');
      if (!row) return;
      // Same guard as touchstart: never show the message menu on [data-user-id] targets
      // (sender names) — the global user-sheet flow owns those.
      if (e.target.closest && e.target.closest('[data-user-id]')) return;
      e.preventDefault();
      var msgId = row.getAttribute('data-msg-id');
      if (msgId) OrbitChat._showContextMenu(msgId);
    });
  },

  /** Long-press context menu — delegated to the single consolidated sheet in app.js (v0.4.2) */
  _showContextMenu: function(msgId) {
    if (window.showMessageContextSheet) {
      window.showMessageContextSheet(msgId);
    }
  },
};

// Expose for backward compatibility
// window.openChat is the old complete function from app.js (with profile frames)
// OrbitChat.openChat is kept for internal component use but window.openChat takes priority
window.closeChat = function() { OrbitChat.closeChat(); };
window.renderChatList = function(filter) { OrbitHome.renderChatList(filter); };
