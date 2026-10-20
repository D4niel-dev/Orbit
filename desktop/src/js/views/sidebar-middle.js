// src/js/views/sidebar-middle.js

window.SidebarMiddle = {
  init() {
    this.container = document.getElementById('middle-sidebar-container');
    
    // Subscribe to store
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      var relevant = ['messages', 'friends', 'groups', 'activeChatId', 'activeTab', 'activeView', 'currentUser', 'unreadCounts', 'closedDMs', 'pinnedDMs', 'settings', 'activeFolder'];
      if (!changedState || relevant.some(function(k) { return k in changedState; })) {
        if (state.activeView === 'groups') {
          this.renderGroups();
        } else if (state.activeView === 'folders') {
          this.renderFolders();
        } else {
          this.renderList(state);
        }
      }
    });

    this.render();
    this._initPickerOutsideClickDismiss();
    this._initStatsOverlay();
  },

  _formatLastMessage(text) {
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
    preview = preview.replace(/[*_~#>`\-]/g, '');
    // Strip [text](url) links
    preview = preview.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    // Collapse whitespace
    preview = preview.replace(/\s+/g, ' ').trim();
    // Truncate
    if (preview.length > 80) preview = preview.substring(0, 80) + '…';
    return preview || 'Message';
  },

  render() {
    this.container.innerHTML = 
      '<div class="search-container" style="padding: 16px; padding-bottom: 8px;">' +
        '<div class="search-input-wrapper" data-debug="Search: query=\\"\\" results=0" style="position: relative; display: flex; align-items: center;">' +
          '<i data-lucide="search" style="position: absolute; left: 12px; width: 16px; color: var(--text-muted);"></i>' +
          '<input type="text" class="search-input" placeholder="Search messages, people..." style="width: 100%; padding: 8px 12px 8px 36px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-surface); color: var(--text-primary); outline: none;">' +
          '<button id="btn-toggle-sidebar" title="Toggle Sidebar" style="background:transparent; border:none; cursor:pointer; color:var(--text-muted); padding:4px; margin-left:4px; flex-shrink:0;"><i data-lucide="chevrons-left" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="tabs-container" style="display:flex; padding: 0 var(--spacing-md); margin-bottom: var(--spacing-md); gap: 16px;">' +
        '<button class="tab active" data-view="friends" style="flex:1; text-align:center; padding: 12px 4px; border-bottom: 3px solid var(--accent-primary); border-top: none; border-left: none; border-right: none; font-weight: 600; color: var(--text-primary); background: transparent; transition: var(--transition); cursor:pointer;">Friends</button>' +
        '<button class="tab" data-view="groups" style="flex:1; text-align:center; padding: 12px 4px; border-bottom: 3px solid transparent; border-top: none; border-left: none; border-right: none; color: var(--text-muted); font-weight: 500; background: transparent; transition: var(--transition); cursor:pointer;">Groups</button>' +
      '</div>' +
      '<div class="list-container" id="friends-list-container" style="flex:1; overflow-y:auto;">' +
        '<!-- Dynamically rendered -->' +
      '</div>';
    lucide.createIcons({ root: this.container });
    this.attachEvents();
    
    // Initial render
    var state = window.store.getState();
    if (state.activeView === 'groups') {
      this.renderGroups();
    } else if (state.activeView === 'folders') {
      this.renderFolders();
    } else {
      this.renderList(state);
    }
  },

  _initStatsOverlay() {
    // Create connection stats panel as direct child of body to avoid
    // Chromium compositing bugs with position:fixed inside overflow:hidden containers
    if (document.getElementById('connection-stats-overlay')) return;
    var div = document.createElement('div');
    div.id = 'connection-stats-overlay';
    div.style.cssText = 'display:none;position:fixed;bottom:16px;right:16px;background:rgba(0,0,0,0.85);border:1px solid var(--border-subtle);border-radius:12px;z-index:9998;font-family:monospace;font-size:11px;flex-direction:column;min-width:200px;';
    div.innerHTML =
      '<div id="conn-stats-drag" style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.1);cursor:grab;display:flex;align-items:center;justify-content:space-between;user-select:none;">' +
        '<span style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:0.5px;">Connection</span>' +
        '<i data-lucide="grip-vertical" style="width:14px;height:14px;color:var(--text-muted);"></i>' +
      '</div>' +
      '<div style="padding:12px;display:flex;flex-direction:column;gap:5px;">' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Status:</span><span id="conn-status" style="color:var(--accent-success);">Disconnected</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Peers:</span><span id="conn-peers" style="color:var(--accent-success);">0</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Uptime:</span><span id="conn-uptime" style="color:var(--accent-success);">--</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Sent:</span><span id="conn-sent" style="color:var(--accent-success);">0</span></div>' +
        '<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-muted);">Recv:</span><span id="conn-recv" style="color:var(--accent-success);">0</span></div>' +
        '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;text-align:center;">' +
          '<button id="btn-p2p-diag" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-secondary);border-radius:6px;padding:4px 10px;font-size:10px;cursor:pointer;width:100%;">P2P Diagnostics</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);
    if (window.lucide) window.lucide.createIcons({ root: div });

    // Restore saved position
    var savedPos = window.Storage ? window.Storage.get('connStatsPos', null) : null;
    if (savedPos) {
      div.style.bottom = 'auto';
      div.style.right = 'auto';
      div.style.top = savedPos.top + 'px';
      div.style.left = savedPos.left + 'px';
    }
  },

  renderGroups() {
    var self = this;
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;
    var tabsEl = this.container.querySelector('.tabs-container');
    if (tabsEl) tabsEl.style.display = 'flex';
    var state = window.store.getState();
    var uid = state.currentUser && state.currentUser.userId;
    var groups = (state.groups || []).filter(function(g) {
      return g.members && g.members.some(function(m) { return m.userId === uid; });
    });
    var activeChatId = state.activeChatId;
    var messages = state.messages;

    var hasGroups = groups.length > 0;
    var html = '';
    if (hasGroups) {
      html += '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; justify-content:space-between; align-items:center;">' +
        '<span style="font-size: 12px; font-weight:bold; color:var(--text-muted); text-transform:uppercase;">Groups (' + groups.length + ')</span>' +
        '<button id="btn-create-group" style="color:var(--text-secondary); cursor:pointer;"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>' +
      '</div>';
    } else {
      html += '<div style="padding: var(--spacing-md); display:flex; justify-content:stretch; align-items:center;">' +
        '<button id="btn-create-group" style="width:100%;padding:10px 20px;background:var(--accent-primary);color:white;border-radius:24px;border:none;cursor:pointer;font-weight:600;">+ Create Group</button>' +
      '</div>';
    }

    if (groups.length === 0) {
      html += window.OrbitEmpty.html({
        icon: 'users-round',
        title: 'No groups yet',
        hint: 'Create a group to chat with multiple friends.',
        compact: true
      });
    } else {
      groups.forEach(function(group) {
        html += self._buildGroupRowHtml(group, state);
      });
    }

    listContainer.innerHTML = html;
    lucide.createIcons({ root: listContainer });

    // Create group button - open friend picker modal
    listContainer.querySelector('#btn-create-group').addEventListener('click', function() {
      self.showCreateGroupModal();
    });

  },

  _buildGroupRowHtml(group, state) {
    var self = this;
    var activeChatId = state.activeChatId;
    var messages = state.messages;
    var isActive = activeChatId === group.groupId;
    var members = group.members || [];
    var onlineCount = members.filter(function(m) { return m.status === 'online'; }).length;
    var subtitle = onlineCount > 0 ? onlineCount + ' online, ' + members.length + ' member' + (members.length !== 1 ? 's' : '') : members.length + ' member' + (members.length !== 1 ? 's' : '');
    var groupMsgs = messages[group.groupId] || [];
    if (groupMsgs.length > 0) {
      var lastMsg = groupMsgs[groupMsgs.length - 1];
      var senderName = '';
      var isMe = lastMsg.sender === state.currentUser.userId;
      if (isMe) {
        senderName = 'You: ';
      } else {
        var sender = members.find(function(m) { return m.userId === lastMsg.sender; });
        if (sender) senderName = sender.username + ': ';
      }
      var escapedSender = window.Sanitize.escapeHtml(senderName);
      if (lastMsg.text) {
        subtitle = escapedSender + window.Sanitize.escapeHtml(self._formatLastMessage(lastMsg.text));
      } else {
        subtitle = escapedSender + '<span style="display:inline-flex;align-items:center;gap:4px;"><i data-lucide="paperclip" style="width:12px;height:12px;"></i> Attachment</span>';
      }
    } else {
      subtitle = window.Sanitize.escapeHtml(subtitle);
    }

    // Group avatar — uploaded image, else a grid of member avatars.
    // Previously this drew offset overlapping circles, which read as a smear at
    // 40px. See shared/ui/group-avatar.js for the shared implementation.
    var avatarHtml = '';
    if (group.avatarPath) {
      avatarHtml = '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(group.groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">';
    } else if (group.avatarDataUrl) {
      avatarHtml = '<img src="' + window.Sanitize.escapeHtml(group.avatarDataUrl) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">';
    } else if (window.OrbitGroupAvatar) {
      avatarHtml = window.OrbitGroupAvatar.html(members, 40, 'var(--bg-base)');
    }
    var avatarWidth = 40;

    var pinIcon = group.pinned ? '<i data-lucide="pin" style="width:12px;height:12px;color:var(--accent-primary);margin-left:4px;"></i>' : '';

    var unreadCount = state.unreadCounts[group.groupId] || 0;
    var mentionCount = state.mentionCounts[group.groupId] || 0;
    var badgeHtml = '';
    if (mentionCount > 0) {
      badgeHtml = '<div class="unread-badge mention-badge">@' + mentionCount + '</div>';
    } else if (unreadCount > 0) {
      badgeHtml = '<div class="unread-badge">' + (unreadCount > 99 ? '99+' : unreadCount) + '</div>';
    }

    var isMuted = state.mutedChats && state.mutedChats[group.groupId];
    var mutedHtml = isMuted ? '<i data-lucide="bell-off" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>' : '';

    return '<div class="list-row ' + (isActive ? 'active' : '') + '" data-id="' + window.Sanitize.escapeHtml(group.groupId) + '" data-type="group" data-debug="Group: ' + window.Sanitize.escapeHtml(group.groupName) + ' ID: ' + window.Sanitize.escapeHtml(group.groupId) + '">' +
      '<div class="avatar avatar-md list-row-avatar" style="position:relative;width:' + avatarWidth + 'px;min-width:' + avatarWidth + 'px;height:40px;display:flex;align-items:center;justify-content:center;">' +
        avatarHtml +
      '</div>' +
      '<div class="list-row-info">' +
        '<div class="list-row-title">' + window.Sanitize.escapeHtml(group.groupName || 'Unnamed Group') + pinIcon + '</div>' +
        '<div class="list-row-subtitle">' + subtitle + '</div>' +
      '</div>' +
      (badgeHtml || mutedHtml ? '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' + mutedHtml + badgeHtml + '</div>' : '') +
    '</div>';
  },

  showCreateGroupModal(prefilledCode) {
    var state = window.store.getState();
    var friends = state.friends.filter(function(f) { return f.userId !== state.currentUser.userId && f.userId !== 'local-echo'; });

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var activeTab = prefilledCode ? 'join' : 'create';

    function renderModal() {
      var friendOptions = '';
      friends.forEach(function(f) {
        var fFrame = window.Frames ? window.Frames.getFrameForUser(f.userId) : null;
        var favatar = f.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(f.avatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:14px;color:white;font-weight:600;flex-shrink:0;">' + (f.username ? f.username.charAt(0).toUpperCase() : '?') + '</div>';
        var favatarContainer = fFrame
          ? '<div style="position:relative;display:inline-block;flex-shrink:0;">' + favatar + '<img src="icons/frames/pfp_frame_' + fFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt=""></div>'
          : favatar;
        friendOptions += '<label class="friend-picker-option" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer;">' +
          '<input type="checkbox" class="group-member-cb" value="' + window.Sanitize.escapeHtml(f.userId) + '" style="width:18px;height:18px;accent-color:var(--accent-primary);cursor:pointer;">' +
          favatarContainer +
          '<div><div style="font-weight:500;color:var(--text-primary);">' + window.Sanitize.escapeHtml(f.username) + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);">' + window.Sanitize.escapeHtml(f.status || 'online') + '</div></div>' +
        '</label>';
      });

      // F3: single style attribute per tab div — the static flex props come
      // first and the dynamic display state LAST so it wins the cascade (the
      // old two-attribute form dropped the second attribute entirely per
      // HTML5 first-wins, killing the flex layout + footer pinning).
      var createContent = 'style="flex:1;flex-direction:column;overflow:hidden;display:' + (activeTab === 'create' ? 'flex' : 'none') + ';"';
      var joinContent = 'style="flex:1;flex-direction:column;overflow:hidden;display:' + (activeTab === 'join' ? 'flex' : 'none') + ';"';

      overlay.innerHTML =
        '<div style="width:420px;max-height:620px;background:var(--bg-surface);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
          '<div style="padding:16px 24px 12px;display:flex;flex-direction:column;gap:12px;border-bottom:1px solid var(--border-subtle);">' +
            '<div style="display:flex;background:var(--bg-base);border-radius:10px;padding:3px;">' +
              '<button class="gcm-tab" data-tab="create" style="flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:' + (activeTab === 'create' ? '600' : '500') + ';background:' + (activeTab === 'create' ? 'var(--accent-primary)' : 'transparent') + ';color:' + (activeTab === 'create' ? 'white' : 'var(--text-secondary)') + ';transition:all 0.15s;">Create</button>' +
              '<button class="gcm-tab" data-tab="join" style="flex:1;padding:7px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:' + (activeTab === 'join' ? '600' : '500') + ';background:' + (activeTab === 'join' ? 'var(--accent-primary)' : 'transparent') + ';color:' + (activeTab === 'join' ? 'white' : 'var(--text-secondary)') + ';transition:all 0.15s;">Join</button>' +
            '</div>' +
          '</div>' +
          '<div ' + createContent + '>' +
            '<div style="padding:32px 40px 20px;display:flex;flex-direction:column;gap:18px;">' +
              '<div style="display:flex;align-items:flex-start;gap:16px;">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
                '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Create a New Group</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Give your group a name and invite friends to start chatting together.</div></div>' +
              '</div>' +
              '<input id="group-name-input" type="text" placeholder="Group name..." style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
              // Optional group image — a pasted link, or pick a file with the
              // button on the right. Left empty, the group falls back to the
              // member-avatar grid (shared/ui/group-avatar.js).
              '<div style="display:flex;gap:12px;align-items:center;margin-top:12px;">' +
                '<div id="group-avatar-preview" style="width:56px;height:56px;border-radius:14px;flex-shrink:0;overflow:hidden;background:var(--bg-base);border:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center;color:var(--text-muted);">' +
                  '<i data-lucide="image-plus" style="width:20px;height:20px;"></i>' +
                '</div>' +
                '<div style="flex:1;display:flex;gap:8px;min-width:0;">' +
                  '<input id="group-avatar-input" type="text" placeholder="Image URL (optional)" style="flex:1;min-width:0;padding:12px 14px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
                  '<button id="group-avatar-upload" type="button" title="Upload an image" style="padding:0 14px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
                    '<i data-lucide="upload" style="width:16px;height:16px;"></i>' +
                  '</button>' +
                '</div>' +
                '<input id="group-avatar-file" type="file" accept="image/*" style="display:none;">' +
              '</div>' +
            '</div>' +
            '<div style="flex:1;overflow-y:auto;max-height:224px;padding:0 40px 16px;">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;padding:8px 0 12px;letter-spacing:0.5px;">Select Members</div>' +
              friendOptions +
              (friends.length === 0 ? '<div style="display:flex;flex-direction:column;align-items:center;padding:24px 0;color:var(--text-muted);gap:8px;"><i data-lucide="user-round-x" style="width:28px;height:28px;opacity:0.3;"></i><div style="font-size:13px;">No friends available.</div></div>' : '') +
            '</div>' +
            '<div style="margin-top:auto;padding:20px 40px 28px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
              '<button id="btn-cancel-group" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
              '<button id="btn-confirm-group" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Create</button>' +
            '</div>' +
          '</div>' +
          '<div ' + joinContent + '>' +
            '<div style="flex:1;padding:56px 40px 32px;display:flex;flex-direction:column;gap:28px;">' +
              '<div style="display:flex;align-items:flex-start;gap:16px;">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>' +
                '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Join with Invite Code</div>' +
                '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Paste an invite code or link shared in a chat to join a group.</div></div>' +
              '</div>' +
              '<input id="join-code-input" type="text" placeholder="Paste invite code..." style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
            '</div>' +
            '<div style="padding:20px 40px 28px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
              '<button id="btn-cancel-join" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
              '<button id="btn-confirm-join" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Join</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      if (!overlay.parentNode) document.body.appendChild(overlay);
      lucide.createIcons({ root: overlay });

      attachEvents();
    }

    function attachEvents() {
      overlay.querySelectorAll('.gcm-tab').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeTab = btn.getAttribute('data-tab');
          renderModal();
        });
      });

      overlay.querySelector('#btn-cancel-group').addEventListener('click', function() { document.body.removeChild(overlay); });
      overlay.querySelector('#btn-cancel-join').addEventListener('click', function() { document.body.removeChild(overlay); });
      // F4: guard registration — renderModal() re-runs attachEvents() on every
      // tab switch; an unguarded listener would accumulate and later fire on a
      // removed overlay (NotFoundError in console).
      if (!overlay._clickBound) {
        overlay._clickBound = true;
        overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });
      }

      // Group image — a pasted link or an uploaded file (both optional).
      // The chosen value lives on the overlay so it survives a tab switch
      // (renderModal rebuilds the inner HTML and would otherwise drop it).
      var gAvatarInput = overlay.querySelector('#group-avatar-input');
      var gAvatarFile = overlay.querySelector('#group-avatar-file');
      var gAvatarPreview = overlay.querySelector('#group-avatar-preview');
      var gAvatarUpload = overlay.querySelector('#group-avatar-upload');

      function refreshGroupAvatarPreview() {
        if (!gAvatarPreview) return;
        var val = (overlay._pendingAvatar || '').trim();
        if (val) {
          gAvatarPreview.innerHTML = '<img src="' + window.Sanitize.escapeHtml(val) + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
        } else {
          gAvatarPreview.innerHTML = '<i data-lucide="image-plus" style="width:20px;height:20px;"></i>';
          if (window.lucide) lucide.createIcons({ root: gAvatarPreview });
        }
      }

      // Restore a previously chosen value when renderModal rebuilds the DOM.
      if (gAvatarInput && (overlay._pendingAvatar || '') !== gAvatarInput.value) {
        gAvatarInput.value = overlay._pendingAvatar || '';
      }

      if (gAvatarInput) {
        gAvatarInput.addEventListener('input', function() {
          overlay._pendingAvatar = gAvatarInput.value;
          refreshGroupAvatarPreview();
        });
      }
      if (gAvatarUpload && gAvatarFile) {
        gAvatarUpload.addEventListener('click', function() { gAvatarFile.click(); });
      }
      if (gAvatarFile) {
        gAvatarFile.addEventListener('change', function(e) {
          var file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (!file) return;
          var reader = new FileReader();
          reader.onload = function() {
            var src = reader.result;
            function setAvatar(dataUrl) {
              overlay._pendingAvatar = dataUrl;
              if (gAvatarInput) gAvatarInput.value = dataUrl;
              refreshGroupAvatarPreview();
            }
            if (window.ImageCropper) {
              window.ImageCropper.open(src, {
                aspectRatio: 1,
                cropWidth: 300,
                cropHeight: 300,
                title: 'Group Avatar'
              }, function(result) {
                if (result) setAvatar(result);
              });
            } else {
              setAvatar(src);
            }
          };
          reader.readAsDataURL(file);
        });
      }
      refreshGroupAvatarPreview();

      overlay.querySelector('#btn-confirm-group').addEventListener('click', function() {
        var groupName = overlay.querySelector('#group-name-input').value.trim();
        if (!groupName) { window.Toast.show('Error', 'Please enter a group name'); return; }

        var checkboxes = overlay.querySelectorAll('.group-member-cb:checked');
        var state = window.store.getState();
        var groupId = 'group_' + Date.now();

        var selectedMembers = [];
        checkboxes.forEach(function(cb) {
          var friend = state.friends.find(function(f) { return f.userId === cb.value; });
          if (friend) {
            selectedMembers.push({
              userId: friend.userId,
              username: friend.username,
              usertag: friend.usertag || '',
              status: friend.status || 'online',
              avatar: friend.avatar || null,
              ip: friend.ip || null,
              role: 'member',
              publicKey: friend.publicKey || null
            });
          }
        });

        var allMembers = [
          {
            userId: state.currentUser.userId,
            username: state.currentUser.username || 'You',
            usertag: state.currentUser.usertag || '',
            status: 'online',
            avatar: state.currentUser.avatar || null,
            ip: null,
            role: 'owner',
            publicKey: state.currentUser.publicKey || null
          },
          ...selectedMembers
        ];

        var group = {
          groupId: groupId,
          groupName: groupName,
          ownerId: state.currentUser.userId,
          members: allMembers,
          createdAt: new Date().toISOString()
        };

        // Optional group image (link or uploaded file) chosen in the modal.
        if (overlay._pendingAvatar) {
          group.avatarDataUrl = overlay._pendingAvatar;
        }

        window.store.addGroup(group);

        var msgs = state.messages;
        msgs[groupId] = [];
        window.store.setState({ messages: msgs, activeChatId: groupId });

        if (window.orbitAPI) {
          allMembers.forEach(function(m) {
            if (m.userId !== state.currentUser.userId) {
              window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_CREATE, {
                groupId: groupId,
                groupName: groupName,
                ownerId: state.currentUser.userId,
                groupAvatar: state.currentUser.avatar || null,
                members: allMembers
              });
            }
          });
        }

        window.Toast.show('Group Created', 'Welcome to ' + groupName + '!');
        document.body.removeChild(overlay);
      });

      overlay.querySelector('#btn-confirm-join').addEventListener('click', function() {
        var code = overlay.querySelector('#join-code-input').value.trim();
        if (!code) { window.Toast.show('Error', 'Please enter an invite code'); return; }

        var state = window.store.getState();
        var matchedGroup = state.groups.find(function(g) { return g.inviteCode === code; });
        if (matchedGroup) {
          window.Toast.show('Already Member', 'You are already in this group.');
          return;
        }

        if (window.orbitAPI) {
          state.friends.forEach(function(f) {
            if (f.userId !== state.currentUser.userId) {
              window.orbitAPI.networkSend(f.userId, f.ip || '', window.Protocol.Types.GROUP_JOIN_REQUEST, {
                inviteCode: code,
                userId: state.currentUser.userId,
                username: state.currentUser.username,
                usertag: state.currentUser.usertag || '',
                avatar: state.currentUser.avatar || null,
                status: state.currentUser.status || 'online',
                publicKey: state.currentUser.publicKey || null
              });
            }
          });
        }

        window.Toast.show('Join Request Sent', 'Invite sent to group members for approval.');
        document.body.removeChild(overlay);
      });
    }

    renderModal();

    // Pre-fill invite code if provided
    if (prefilledCode) {
      var joinInput = document.getElementById('join-code-input');
      if (joinInput) {
        joinInput.value = prefilledCode;
        joinInput.focus();
      }
    }
  },

  /**
   * The friends directory — every friend, searchable and filterable, in a modal.
   *
   * Opened by left-clicking the Friends tab. The tab itself lists who is ONLINE;
   * this lists everyone: offline friends, and DMs that were closed (marked as
   * such, and clicking one reopens it — which is the only way back to a closed
   * DM now that it is filtered out of the tab).
   *
   * It respects `_userChatIds`, the per-account isolation filter: without it one
   * account's friends would appear in another account's directory.
   */
  showAllFriendsModal() {
    if (document.getElementById('all-friends-modal')) return;   // already open
    var self = this;
    var state = window.store.getState();
    var closedDMs = state.closedDMs || {};
    var userChatIds = state._userChatIds;

    var friends = (state.friends || []).filter(function(f) {
      if (userChatIds && userChatIds.indexOf(f.userId) === -1) return false;
      return true;
    });
    friends.sort(function(a, b) {
      if (a.userId === 'local-echo') return -1;
      if (b.userId === 'local-echo') return 1;
      var ao = a.status === 'online' ? 0 : 1;
      var bo = b.status === 'online' ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (a.username || '').localeCompare(b.username || '');
    });

    var overlay = document.createElement('div');
    overlay.id = 'all-friends-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var segBtn = function(id, label, active) {
      return '<button class="afm-filter" data-filter="' + id + '" style="flex:1;padding:6px 8px;border-radius:8px;border:none;cursor:pointer;font-size:12px;font-weight:600;' +
        (active ? 'background:var(--accent-primary);color:white;' : 'background:transparent;color:var(--text-secondary);') +
        'transition:all 0.15s;">' + label + '</button>';
    };

    overlay.innerHTML =
      '<div style="width:460px;max-width:94vw;max-height:82vh;background:var(--bg-surface);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
        '<div style="display:flex;align-items:flex-start;gap:10px;padding:16px 16px 12px;">' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:600;color:var(--text-primary);font-size:16px;">All Friends</div>' +
            '<div id="afm-count" style="font-size:12px;color:var(--text-muted);margin-top:2px;"></div>' +
          '</div>' +
          '<button id="afm-close" title="Close" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;flex-shrink:0;">' +
            '<i data-lucide="x" style="width:18px;height:18px;"></i>' +
          '</button>' +
        '</div>' +
        '<div style="padding:0 16px 10px;">' +
          '<div style="position:relative;display:flex;align-items:center;">' +
            '<i data-lucide="search" style="position:absolute;left:10px;width:14px;height:14px;color:var(--text-muted);"></i>' +
            '<input id="afm-search" type="text" placeholder="Search friends by name, tag or ID..." autocomplete="off" style="width:100%;padding:8px 10px 8px 32px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;padding:0 16px 12px;">' +
          '<div id="afm-filters" style="display:flex;background:var(--bg-base);border-radius:10px;padding:3px;flex:1;gap:2px;">' +
            segBtn('all', 'All', true) +
            segBtn('online', 'Online', false) +
            segBtn('offline', 'Offline', false) +
            segBtn('closed', 'Closed', false) +
          '</div>' +
          '<button id="afm-display" title="Switch between list and grid" style="background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:10px;padding:7px;cursor:pointer;color:var(--text-secondary);flex-shrink:0;display:flex;align-items:center;">' +
            '<i data-lucide="layout-grid" style="width:15px;height:15px;"></i>' +
          '</button>' +
        '</div>' +
        '<div id="afm-list" style="flex:1;overflow-y:auto;padding:0 12px 12px;min-height:120px;"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    if (window.lucide) lucide.createIcons({ root: overlay });

    var listEl = overlay.querySelector('#afm-list');
    var countEl = overlay.querySelector('#afm-count');
    var searchEl = overlay.querySelector('#afm-search');
    var displayBtn = overlay.querySelector('#afm-display');
    var query = '';
    var filter = 'all';
    var display = 'list';

    function close() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function visible() {
      return friends.filter(function(f) {
        if (filter === 'online' && f.status !== 'online') return false;
        if (filter === 'offline' && f.status === 'online') return false;
        if (filter === 'closed' && !closedDMs[f.userId]) return false;
        if (query) {
          var hay = ((f.username || '') + ' ' + (f.usertag || '') + ' ' + (f.userId || '')).toLowerCase();
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      });
    }

    function avatarInner(f) {
      var frame = window.Frames ? window.Frames.getFrameForUser(f.userId) : null;
      var img = f.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(f.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
        : '<i data-lucide="user-round"></i>';
      return '<div style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' + img +
        (frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') +
      '</div>';
    }

    function openFriend(id, ev) {
      var f = friends.filter(function(x) { return x.userId === id; })[0];
      if (ev && ev.target.closest('.list-row-avatar') && window.ProfileSidebar && f) {
        window.ProfileSidebar.open(f);   // the avatar still opens the profile
        return;
      }
      // reopenDM clears the closed flag AND opens the chat, so this is the same
      // action whether the DM was closed or merely not open.
      window.store.reopenDM(id);
      close();
    }

    function render() {
      var rows = visible();
      countEl.textContent = rows.length + ' of ' + friends.length + ' friend' + (friends.length === 1 ? '' : 's');
      displayBtn.innerHTML = '<i data-lucide="' + (display === 'list' ? 'layout-grid' : 'list') + '" style="width:15px;height:15px;"></i>';
      // The button is rewritten on every render, so its icon has to be converted
      // here too — createIcons otherwise only runs on the list below, leaving the
      // toggle as a blank square.
      if (window.lucide) lucide.createIcons({ root: displayBtn });

      if (rows.length === 0) {
        listEl.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;padding:32px 20px;text-align:center;color:var(--text-muted);gap:10px;">' +
          '<i data-lucide="users-round" style="width:34px;height:34px;opacity:0.3;"></i>' +
          '<div style="font-size:13px;">' + (friends.length === 0 ? 'No friends yet' : 'Nobody matches that') + '</div>' +
        '</div>';
        if (window.lucide) lucide.createIcons({ root: listEl });
        return;
      }

      if (display === 'grid') {
        listEl.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:10px;padding:4px;">' +
          rows.map(function(f) {
            return '<div class="afm-tile" data-id="' + window.Sanitize.escapeHtml(f.userId) + '" title="' + window.Sanitize.escapeHtml(f.username) + '" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:12px;cursor:pointer;background:var(--bg-base);border:1px solid var(--border-subtle);">' +
              '<div style="position:relative;width:44px;height:44px;border-radius:50%;">' + avatarInner(f) +
                window.OrbitPresence.badge(f.status || 'offline') +
              '</div>' +
              '<div style="font-size:11px;color:var(--text-primary);text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(f.username) + '</div>' +
              (closedDMs[f.userId] ? '<div style="font-size:9px;color:var(--text-muted);">Closed</div>' : '') +
            '</div>';
          }).join('') +
        '</div>';
      } else {
        listEl.innerHTML = rows.map(function(f) {
          return self._buildFriendRowHtml(f, state, { reopen: true, closed: !!closedDMs[f.userId] });
        }).join('');
      }

      if (window.lucide) lucide.createIcons({ root: listEl });
      listEl.querySelectorAll('.afm-tile').forEach(function(tile) {
        tile.addEventListener('click', function() { openFriend(tile.getAttribute('data-id')); });
      });
      listEl.querySelectorAll('.list-row').forEach(function(row) {
        row.addEventListener('click', function(e) { openFriend(row.getAttribute('data-id'), e); });
      });
    }

    overlay.querySelector('#afm-close').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    searchEl.addEventListener('input', function() {
      query = this.value.trim().toLowerCase();
      render();
    });
    overlay.querySelectorAll('.afm-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        filter = btn.getAttribute('data-filter');
        overlay.querySelectorAll('.afm-filter').forEach(function(b) {
          var on = b === btn;
          b.style.background = on ? 'var(--accent-primary)' : 'transparent';
          b.style.color = on ? 'white' : 'var(--text-secondary)';
        });
        render();
      });
    });
    displayBtn.addEventListener('click', function() {
      display = display === 'list' ? 'grid' : 'list';
      render();
    });

    render();
    setTimeout(function() { try { searchEl.focus(); } catch (e) {} }, 50);
  },

  renderList(state) {
    var closedDMs = state.closedDMs || {};
    var pinnedDMs = state.pinnedDMs || {};
    var userChatIds = state._userChatIds;
    var friends = state.friends.filter(function(f) {
      // Orbit Echo is never filtered out, closed or not.
      if (f.userId !== 'local-echo' && closedDMs[f.userId]) return false;
      if (userChatIds && userChatIds.indexOf(f.userId) === -1) return false;
      return true;
    });
    // Sort: pinned DMs first, then by name
    friends.sort(function(a, b) {
      if (pinnedDMs[a.userId] && !pinnedDMs[b.userId]) return -1;
      if (!pinnedDMs[a.userId] && pinnedDMs[b.userId]) return 1;
      return (a.username || '').localeCompare(b.username || '');
    });
    var activeChatId = state.activeChatId;
    var messages = state.messages;
    var unreadCounts = state.unreadCounts || {};
    var mentionCounts = state.mentionCounts || {};
    var self = this;
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;

    // Show/hide the Friends/Groups tabs: hidden while browsing inside a folder
    var tabsEl = this.container.querySelector('.tabs-container');
    if (tabsEl) tabsEl.style.display = state.activeFolder ? 'none' : 'flex';

    if (state.activeFolder) {
      this._renderFolderList(state, listContainer);
      return;
    }

    var onlineFriends = friends.filter(function(f) { return f.status === 'online'; });

    // The header renders in BOTH states, because the friends directory button has
    // to be reachable when nobody is online — that is exactly when you need it, to
    // reach an offline friend or reopen a DM you closed.
    var headerHtml = '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; justify-content:space-between; align-items:center;">' +
      '<span style="font-size: 12px; font-weight:bold; color:var(--text-muted); text-transform:uppercase;">Online (' + onlineFriends.length + ')</span>' +
      '<div style="display:flex;align-items:center;gap:12px;">' +
        '<button id="btn-all-friends" title="All friends" style="color:var(--text-secondary);cursor:pointer;background:transparent;border:none;padding:0;display:flex;align-items:center;"><i data-lucide="users-round" style="width:16px;height:16px;"></i></button>' +
        '<button id="btn-add-friend" title="Add a friend" style="color:var(--text-secondary);cursor:pointer;background:transparent;border:none;padding:0;display:flex;align-items:center;"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>' +
      '</div>' +
    '</div>';

    function wireHeader() {
      var addBtn = listContainer.querySelector('#btn-add-friend');
      if (addBtn) addBtn.addEventListener('click', function() { self.showAddFriendModal(); });
      var allBtn = listContainer.querySelector('#btn-all-friends');
      if (allBtn) allBtn.addEventListener('click', function() { self.showAllFriendsModal(); });
    }

    if (!friends || friends.length === 0) {
      listContainer.innerHTML = headerHtml + window.OrbitEmpty.html({
        icon: 'wifi-off',
        title: 'No friends online',
        hint: 'Waiting for peers on the local network\u2026',
        compact: true,
        muted: true
      });
      lucide.createIcons({ root: listContainer });
      wireHeader();
      return;
    }

    var html = headerHtml;
    friends.forEach(function(friend) {
      html += self._buildFriendRowHtml(friend, state);
    });

    listContainer.innerHTML = html;
    lucide.createIcons({ root: listContainer });
    wireHeader();
  },

  _buildFriendRowHtml(friend, state, opts) {
    opts = opts || {};
    var self = this;
    var activeChatId = state.activeChatId;
    var messages = state.messages;
    var unreadCounts = state.unreadCounts || {};
    var mentionCounts = state.mentionCounts || {};
    var pinnedDMs = state.pinnedDMs || {};
    var isActive = activeChatId === friend.userId;
    
    var userMsgs = messages[friend.userId] || [];
    var subtitleHtml = window.Sanitize.escapeHtml('#' + (friend.usertag || '0000'));
    if (userMsgs.length > 0) {
      var lastMsg = userMsgs[userMsgs.length - 1];
      if (lastMsg.text) {
        subtitleHtml = window.Sanitize.escapeHtml(self._formatLastMessage(lastMsg.text));
      } else {
        subtitleHtml = '<span style="display:inline-flex;align-items:center;gap:4px;color:var(--accent-primary);"><i data-lucide="paperclip" style="width:12px;height:12px;"></i> Attachment</span>';
      }
    }

    if (opts.closed) {
      subtitleHtml = '<span style="display:inline-flex;align-items:center;gap:4px;color:var(--text-muted);">' +
        '<i data-lucide="archive" style="width:12px;height:12px;"></i> Closed \u2014 click to reopen</span>';
    }

    var frame = window.Frames.getFrameForUser(friend.userId);
    var avatarImg = friend.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(friend.avatar) + '" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">'
      : '<i data-lucide="user-round"></i>';
    var avatarContainer = '<div style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' + avatarImg + (frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';

    var unreadCount = unreadCounts[friend.userId] || 0;
    var mentionCount = mentionCounts[friend.userId] || 0;
    var badgeHtml = '';
    if (mentionCount > 0) {
      badgeHtml = '<div class="unread-badge mention-badge">@' + mentionCount + '</div>';
    } else if (unreadCount > 0) {
      badgeHtml = '<div class="unread-badge">' + (unreadCount > 99 ? '99+' : unreadCount) + '</div>';
    }

    var mutedChats = state.mutedChats || {};
    var isMuted = mutedChats[friend.userId];
    var mutedHtml = isMuted ? '<i data-lucide="bell-off" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>' : '';
    var isPinned = pinnedDMs[friend.userId];
    var pinnedHtml = isPinned ? '<i data-lucide="pin" style="width:14px;height:14px;color:var(--accent-primary);flex-shrink:0;"></i>' : '';

    return '<div class="list-row ' + (isActive ? 'active' : '') + '"' + (opts.reopen ? ' data-reopen="1"' : '') + ' data-id="' + window.Sanitize.escapeHtml(friend.userId) + '" data-debug="User: ' + window.Sanitize.escapeHtml(friend.username) + ' ID: ' + window.Sanitize.escapeHtml(friend.userId) + ' Status: ' + window.Sanitize.escapeHtml(friend.status || 'offline') + '">' +
      '<div class="avatar avatar-md list-row-avatar" style="position:relative;">' +
        avatarContainer +
        window.OrbitPresence.badge(friend.status || 'offline') +
      '</div>' +
      '<div class="list-row-info">' +
        '<div class="list-row-title">' + window.Sanitize.escapeHtml(friend.username) + '</div>' +
        '<div class="list-row-subtitle">' + subtitleHtml + '</div>' +
      '</div>' +
      (pinnedHtml || badgeHtml || mutedHtml ? '<div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">' + pinnedHtml + mutedHtml + badgeHtml + '</div>' : '') +
    '</div>';
  },

  // Renders a single folder's chats (friends + groups) as one combined list,
  // in the order the chats were added to the folder.
  _renderFolderList(state, listContainer) {
    var self = this;
    var folder = null;
    if (state.settings && state.settings.chatFolders) {
      folder = state.settings.chatFolders.find(function(f) { return f.id === state.activeFolder; }) || null;
    }
    var rows = [];
    if (folder) {
      (folder.chatIds || []).forEach(function(k) {
        if (k && typeof k === 'object' && k.kind !== undefined) {
          if (k.kind === 'group') {
            var g = state.groups.find(function(gg) { return gg.groupId === k.id; });
            if (g) rows.push(self._buildGroupRowHtml(g, state));
          } else {
            var f = state.friends.find(function(ff) { return ff.userId === k.id; });
            if (f) rows.push(self._buildFriendRowHtml(f, state));
          }
        } else {
          // Legacy raw-string entry: treat as friend id, fall back to group
          var f2 = state.friends.find(function(ff) { return ff.userId === k; });
          if (f2) rows.push(self._buildFriendRowHtml(f2, state));
          else {
            var g2 = state.groups.find(function(gg) { return gg.groupId === k; });
            if (g2) rows.push(self._buildGroupRowHtml(g2, state));
          }
        }
      });
    }
    var folderName = folder ? folder.name : 'Folder';
    var html = '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; align-items:center; gap:8px;">' +
      '<button id="btn-folder-back" title="Back to Folders" style="color:var(--text-secondary); cursor:pointer; background:transparent; border:none; padding:2px; flex-shrink:0;"><i data-lucide="arrow-left" style="width:16px;height:16px;"></i></button>' +
      '<span style="font-size:12px; font-weight:bold; color:var(--text-primary); text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="' + window.Sanitize.escapeHtml(folderName) + '">' + window.Sanitize.escapeHtml(folderName) + '</span>' +
      '<span style="font-size:11px; color:var(--text-muted); flex-shrink:0;">' + rows.length + ' chat' + (rows.length !== 1 ? 's' : '') + '</span>' +
    '</div>';
    if (rows.length === 0) {
      html += '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center;color:var(--text-muted);gap:12px;">' +
        '<i data-lucide="folder-open" style="width:40px;height:40px;opacity:0.3;"></i>' +
        '<div style="font-size:14px;font-weight:500;">No chats in this folder yet</div>' +
        '<div style="font-size:12px;">Use the "+ Add" action on the folder row to add chats.</div>' +
      '</div>';
    } else {
      html += rows.join('');
    }
    listContainer.innerHTML = html;
    lucide.createIcons({ root: listContainer });
    var backBtn = listContainer.querySelector('#btn-folder-back');
    if (backBtn) {
      backBtn.addEventListener('click', function() {
        window.store.setState({ activeView: 'folders', activeFolder: null });
      });
    }
  },

  // --- Chat Folders (experimental, local-only) ---

  // Build the picker section listing every assignable chat for a folder.
  _buildFolderPickerHtml(folder) {
    var state = window.store.getState();
    var uid = state.currentUser && state.currentUser.userId;
    var folderId = folder.id;
    var self = this;

    function chatRowHtml(key, label, sub, avatarHtml) {
      var isIn = window.store.isChatInFolder(folderId, key);
      return '<div class="folder-picker-row" data-kind="' + key.kind + '" data-chat-id="' + window.Sanitize.escapeHtml(key.id) + '" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(label) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);flex-shrink:0;">' + window.Sanitize.escapeHtml(sub) + '</div>' +
        '<i data-lucide="' + (isIn ? 'check-circle' : 'circle') + '" style="width:16px;height:16px;color:' + (isIn ? 'var(--accent-primary)' : 'var(--text-muted)') + ';flex-shrink:0;"></i>' +
      '</div>';
    }

    function friendAvatarHtml(f) {
      var favatar = f.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(f.avatar) + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
        : '<div style="width:24px;height:24px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:600;flex-shrink:0;">' + (f.username ? f.username.charAt(0).toUpperCase() : '?') + '</div>';
      return favatar;
    }

    function groupAvatarHtml(g) {
      if (g.avatarDataUrl) {
        return '<img src="' + window.Sanitize.escapeHtml(g.avatarDataUrl) + '" style="width:24px;height:24px;border-radius:8px;object-fit:cover;flex-shrink:0;">';
      }
      return '<div style="width:24px;height:24px;border-radius:8px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:600;flex-shrink:0;">' + (g.groupName ? g.groupName.charAt(0).toUpperCase() : 'G') + '</div>';
    }

    var html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;font-weight:600;">Add chats to ' + window.Sanitize.escapeHtml(folder.name) + '</div>';

    var friends = state.friends || [];
    html += '<div style="font-size:10px;color:var(--text-muted);margin:6px 0 4px;font-weight:600;">Friends</div>';
    if (friends.length === 0) {
      html += '<div style="font-size:12px;color:var(--text-muted);padding:4px 0;">No friends yet</div>';
    } else {
      friends.forEach(function(f) {
        html += chatRowHtml({ kind: 'friend', id: f.userId }, f.username, '@' + (f.usertag || '0000'), friendAvatarHtml(f));
      });
    }

    var groups = (state.groups || []).filter(function(g) {
      return g.members && g.members.some(function(m) { return m.userId === uid; });
    });
    html += '<div style="font-size:10px;color:var(--text-muted);margin:6px 0 4px;font-weight:600;">Groups</div>';
    if (groups.length === 0) {
      html += window.OrbitEmpty.html({ icon: 'users-round', title: 'No groups yet', compact: true, muted: true });
    } else {
      groups.forEach(function(g) {
        html += chatRowHtml({ kind: 'group', id: g.groupId }, g.groupName || 'Unnamed Group', (g.members || []).length + ' members', groupAvatarHtml(g));
      });
    }
    return html;
  },

  // Show (or rebuild) the add-chats picker under a folder row.
  _openFolderPicker(folderId) {
    var state = window.store.getState();
    var folder = state.settings && state.settings.chatFolders ? state.settings.chatFolders.find(function(f) { return f.id === folderId; }) : null;
    var row = document.querySelector('.folder-row[data-folder-id="' + folderId + '"]');
    if (!folder || !row) return;
    var picker = row.querySelector('.folder-picker');
    if (!picker) return;
    picker.style.display = 'block';
    picker.innerHTML = this._buildFolderPickerHtml(folder);
    if (window.lucide) window.lucide.createIcons({ root: picker });
    this._openFolderPickerId = folderId;
  },

  _closeFolderPicker(folderId) {
    var row = document.querySelector('.folder-row[data-folder-id="' + folderId + '"]');
    if (row) {
      var picker = row.querySelector('.folder-picker');
      if (picker) picker.style.display = 'none';
    }
    if (this._openFolderPickerId === folderId) this._openFolderPickerId = null;
  },

  // Close the open "+ Add chats" picker when the user clicks anywhere outside
  // it (or outside the add button that toggles it). Registered once in init();
  // the open-picker state is checked inside the handler, so it is a no-op
  // whenever no picker is open (and therefore never interferes with context
  // menus, modals, or chat navigation).
  _initPickerOutsideClickDismiss() {
    var self = this;
    document.addEventListener('pointerdown', function(e) {
      if (!self._openFolderPickerId) return;
      var target = e.target;
      if (!target || !target.closest) return;
      // The add button toggles the picker on its click handler — let it.
      if (target.closest('.folder-action[data-action="add"]')) return;
      // Clicks inside the open picker (rows, scrollbar, toggling chats) keep it open.
      var picker = target.closest('.folder-picker');
      if (picker && picker.style.display === 'block') return;
      self._closeFolderPicker(self._openFolderPickerId);
    });
  },

  renderFolders() {
    var self = this;
    var listContainer = document.getElementById('friends-list-container');
    if (!listContainer) return;
    var tabsEl = this.container.querySelector('.tabs-container');
    if (tabsEl) tabsEl.style.display = 'none';
    var state = window.store.getState();
    var settings = state.settings || {};
    var folders = settings.chatFolders || [];

    // Gate: the feature toggle lives in Settings → Advanced → Experimental
    if (!settings.experimentalFolders) {
      listContainer.innerHTML =
        '<div style="display:flex;flex-direction:column;align-items:center;padding:40px 20px;text-align:center;color:var(--text-muted);gap:12px;">' +
          '<i data-lucide="folder" style="width:40px;height:40px;opacity:0.3;"></i>' +
          '<div style="font-size:14px;font-weight:500;">Chat Folders is disabled</div>' +
          '<div style="font-size:12px;line-height:1.5;">Enable it in Settings &rarr; Advanced &rarr; Experimental Features.</div>' +
        '</div>';
      return;
    }

    var html = '<div style="padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md); display:flex; justify-content:space-between; align-items:center;">' +
      '<span style="font-size: 12px; font-weight:bold; color:var(--text-muted); text-transform:uppercase;">Folders (' + folders.length + ')</span>' +
      '<button id="btn-new-folder" title="New Folder" style="color:var(--text-secondary); cursor:pointer;"><i data-lucide="plus" style="width:16px;height:16px;"></i></button>' +
    '</div>';

    // Inline "New Folder" input row (revealed on + click)
    html += '<div id="new-folder-row" style="display:none;padding: 0 var(--spacing-md) var(--spacing-sm) var(--spacing-md);">' +
      '<input id="new-folder-input" type="text" maxlength="32" placeholder="Folder name... (Enter to create)" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--accent-primary);background:var(--bg-surface);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
    '</div>';

    if (folders.length === 0) {
      html += '<div style="padding: var(--spacing-lg); text-align:center; color: var(--text-muted); font-size: 13px;">' +
        'No folders yet — create one to organize chats.' +
      '</div>';
    } else {
      folders.forEach(function(folder) {
        var chatCount = (folder.chatIds || []).length;
        html += '<div class="folder-row" data-folder-id="' + window.Sanitize.escapeHtml(folder.id) + '" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px var(--spacing-md);cursor:pointer;">' +
          '<div style="width:40px;height:40px;border-radius:12px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i data-lucide="folder" style="width:18px;height:18px;color:var(--text-muted);"></i></div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="folder-row-name" style="font-size:14px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(folder.name) + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);">' + chatCount + ' chat' + (chatCount !== 1 ? 's' : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:2px;flex-shrink:0;">' +
            '<button class="folder-action" data-action="add" title="Add chats" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:4px;border-radius:6px;"><i data-lucide="plus" style="width:15px;height:15px;"></i></button>' +
            '<button class="folder-action" data-action="rename" title="Rename" style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:4px;border-radius:6px;"><i data-lucide="pencil" style="width:15px;height:15px;"></i></button>' +
            '<button class="folder-action" data-action="delete" title="Delete" style="background:transparent;border:none;color:var(--accent-danger);cursor:pointer;padding:4px;border-radius:6px;"><i data-lucide="trash-2" style="width:15px;height:15px;"></i></button>' +
          '</div>' +
          '<div class="folder-picker" style="display:none;flex-basis:100%;padding:10px 12px;background:var(--bg-base);border-radius:8px;margin-top:8px;max-height:220px;overflow-y:auto;"></div>' +
        '</div>';
      });
    }

    listContainer.innerHTML = html;
    if (window.lucide) window.lucide.createIcons({ root: listContainer });
    this._wireFolderEvents(listContainer);

    // Re-open the picker that was open before a re-render (each folder mutation
    // triggers a re-render through the store subscription).
    if (this._openFolderPickerId) {
      this._openFolderPicker(this._openFolderPickerId);
    }
  },

  _startFolderRename(folderId) {
    var state = window.store.getState();
    var folder = state.settings && state.settings.chatFolders ? state.settings.chatFolders.find(function(f) { return f.id === folderId; }) : null;
    var row = document.querySelector('.folder-row[data-folder-id="' + folderId + '"]');
    if (!folder || !row) return;
    var nameEl = row.querySelector('.folder-row-name');
    if (!nameEl) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 32;
    input.value = folder.name;
    input.style.cssText = 'width:100%;padding:4px 8px;border-radius:6px;border:1px solid var(--accent-primary);background:var(--bg-surface);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;';
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    var cancelled = false;
    function finish() {
      if (cancelled) return;
      var val = input.value.trim();
      if (val && val !== folder.name) window.store.renameFolder(folderId, val);
    }
    function restore() {
      var span = document.createElement('span');
      span.className = 'folder-row-name';
      span.style.cssText = 'font-size:14px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      span.textContent = folder.name;
      if (input.parentNode) input.replaceWith(span);
    }
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); finish(); if (input.isConnected) input.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelled = true; restore(); }
    });
    input.addEventListener('blur', function() {
      if (input._done) return;
      input._done = true;
      finish();
    });
  },

  _wireFolderEvents(listContainer) {
    var self = this;

    // New Folder button → reveal inline input row
    var newBtn = listContainer.querySelector('#btn-new-folder');
    if (newBtn) {
      newBtn.addEventListener('click', function() {
        var row = listContainer.querySelector('#new-folder-row');
        var input = listContainer.querySelector('#new-folder-input');
        if (!row || !input) return;
        row.style.display = 'block';
        input.focus();
      });
    }
    var newInput = listContainer.querySelector('#new-folder-input');
    if (newInput) {
      newInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var name = this.value.trim();
          if (name) window.store.createFolder(name);
          var row = listContainer.querySelector('#new-folder-row');
          if (row) row.style.display = 'none';
          this.value = '';
        } else if (e.key === 'Escape') {
          var row2 = listContainer.querySelector('#new-folder-row');
          if (row2) row2.style.display = 'none';
          this.value = '';
        }
      });
      newInput.addEventListener('blur', function() {
        var row = listContainer.querySelector('#new-folder-row');
        if (row) row.style.display = 'none';
        this.value = '';
      });
    }

    // Delegated row/action clicks — #friends-list-container persists across
    // re-renders, so register this listener only ONCE. Re-registering on
    // every renderFolders() stacks duplicate listeners; on a delete click
    // every stacked listener would open its own ConfirmModal.
    if (listContainer._folderClickWired) return;
    listContainer._folderClickWired = true;

    listContainer.addEventListener('click', function(e) {
      var actionBtn = e.target.closest('.folder-action');
      if (actionBtn) {
        e.stopPropagation();
        var rowEl = actionBtn.closest('.folder-row');
        if (!rowEl) return;
        var folderId = rowEl.getAttribute('data-folder-id');
        var action = actionBtn.getAttribute('data-action');
        // Fresh lookup from the store — this one-time listener must not rely
        // on a stale closure snapshot of the folders array.
        var folder = window.store.getFolderById(folderId);
        if (!folder) return;
        if (action === 'add') {
          var picker = rowEl.querySelector('.folder-picker');
          if (!picker) return;
          if (picker.style.display === 'block') {
            self._closeFolderPicker(folderId);
          } else {
            self._openFolderPicker(folderId);
          }
          return;
        }
        if (action === 'rename') {
          self._startFolderRename(folderId);
          return;
        }
        if (action === 'delete') {
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Delete Folder',
              message: 'Delete folder "' + folder.name + '"? Chats inside it will not be deleted.',
              confirmText: 'Delete',
              danger: true,
              onConfirm: function() {
                window.store.deleteFolder(folderId);
                if (self._openFolderPickerId === folderId) self._openFolderPickerId = null;
              }
            });
          }
          return;
        }
        return;
      }

      var pickerRow = e.target.closest('.folder-picker-row');
      if (pickerRow) {
        e.stopPropagation();
        var pickerEl = pickerRow.closest('.folder-picker');
        var folderRow = pickerEl ? pickerEl.closest('.folder-row') : null;
        if (!folderRow) return;
        var fid = folderRow.getAttribute('data-folder-id');
        var key = { kind: pickerRow.getAttribute('data-kind'), id: pickerRow.getAttribute('data-chat-id') };
        if (window.store.isChatInFolder(fid, key)) {
          window.store.removeChatFromFolder(fid, key);
        } else {
          window.store.addChatToFolder(fid, key);
        }
        return;
      }

      // Clicks on an OPEN picker's own non-row area (header, padding,
      // scrollbar) must not navigate into the folder — the pointerdown
      // dismiss handler already treats the picker interior as "keep open".
      var openPicker = e.target.closest('.folder-picker');
      if (openPicker && openPicker.style.display === 'block') return;

      var folderRow = e.target.closest('.folder-row');
      if (folderRow) {
        var fId = folderRow.getAttribute('data-folder-id');
        window.store.setState({ activeView: 'friends', activeFolder: fId });
        self._openFolderPickerId = null;
      }
    });
  },

  // Small modal used from the chat-row context menu ("New Folder…") — Electron
  // has no window.prompt(), so this is an overlay with an input instead.
  _showNewFolderModal() {
    var self = this;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="width:380px;background:var(--bg-surface);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
        '<div style="flex:1;padding:40px 32px 24px;display:flex;flex-direction:column;gap:20px;">' +
          '<div style="display:flex;align-items:flex-start;gap:16px;">' +
            '<i data-lucide="folder" style="width:28px;height:28px;color:var(--accent-primary);flex-shrink:0;margin-top:2px;"></i>' +
            '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">New Folder</div>' +
            '<div style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">Give your folder a name to organize chats.</div></div>' +
          '</div>' +
          '<input id="new-folder-modal-input" type="text" maxlength="32" placeholder="Folder name..." style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;">' +
        '</div>' +
        '<div style="padding:16px 32px 24px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
          '<button id="btn-cancel-folder" style="padding:9px 20px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;">Cancel</button>' +
          '<button id="btn-confirm-folder" style="padding:9px 24px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;">Create</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    function close() { if (overlay.parentNode) document.body.removeChild(overlay); }
    overlay.querySelector('#btn-cancel-folder').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('keydown', onKey);
    var input = overlay.querySelector('#new-folder-modal-input');
    overlay.querySelector('#btn-confirm-folder').addEventListener('click', function() {
      var name = input.value.trim();
      if (!name) { if (window.Toast) window.Toast.show('Error', 'Please enter a folder name'); return; }
      window.store.createFolder(name);
      close();
    });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') overlay.querySelector('#btn-confirm-folder').click();
    });
    input.focus();
  },

  // Extend a context-menu items array with folder toggle entries and a
    // "New Folder…" entry. No-op unless the experimental folders toggle is on.
    _appendFolderMenuItems(items, chatKey) {
      var state = window.store.getState();
      var settings = state.settings || {};
      if (!settings.enableExperimental || !settings.experimentalFolders) return;
      var folders = settings.chatFolders || [];
      var self = this;
      items.push('separator');
      if (folders.length > 0) {
        folders.forEach(function(folder) {
          var isIn = window.store.isChatInFolder(folder.id, chatKey);
          items.push({
            label: (isIn ? 'Remove from ' : 'Add to ') + '"' + folder.name + '"',
            icon: isIn ? 'folder-minus' : 'folder-plus',
            onClick: function() {
              if (isIn) window.store.removeChatFromFolder(folder.id, chatKey);
              else window.store.addChatToFolder(folder.id, chatKey);
            }
          });
        });
        items.push('separator');
      }
      items.push({ label: 'New Folder…', icon: 'folder-plus', onClick: function() { self._showNewFolderModal(); } });
    },

    showAddFriendModal() {
    var activeTab = 'ip';      // 'ip' | 'qr'
    var qrHandle = null;       // live inline QR scanner, if the QR tab is open

    var SUBTITLES = {
      ip: 'Enter the IP address of a peer on your local network to connect with them. Add :port after it if they use a custom one.',
      qr: 'Paste, drop, or choose a QR code image from another Orbit device to connect instantly.'
    };

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      // ⚠ Inline styles cannot express `:hover`, and this modal is built entirely out
      // of them. One scoped rule, and it leaves with the overlay.
      '<style>.af-addr-btn:hover{background:var(--bg-hover);color:var(--text-primary);}</style>' +
      '<div style="width:420px;max-width:92vw;background:var(--bg-surface);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
        '<div style="flex:1;padding:40px 40px 26px;display:flex;flex-direction:column;gap:20px;">' +
          '<div style="display:flex;align-items:flex-start;gap:16px;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:2px;"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
            '<div><div style="font-weight:600;color:var(--text-primary);font-size:16px;">Add a Friend</div>' +
            '<div id="add-friend-subtitle" style="font-size:13px;color:var(--text-secondary);margin-top:6px;line-height:1.5;">' + SUBTITLES.ip + '</div></div>' +
          '</div>' +
          // Method switcher — same segmented-control look as the group modal.
          '<div style="display:flex;background:var(--bg-base);border-radius:10px;padding:3px;">' +
            '<button class="af-tab" data-tab="ip" style="flex:1;padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;background:var(--accent-primary);color:white;transition:all 0.15s;">IP Address</button>' +
            '<button class="af-tab" data-tab="qr" style="flex:1;padding:8px 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:500;background:transparent;color:var(--text-secondary);transition:all 0.15s;">QR Code</button>' +
          '</div>' +
          // Swapped per tab; min-height + centring keeps the modal from jumping.
          '<div id="add-friend-content" style="min-height:152px;display:flex;flex-direction:column;justify-content:center;"></div>' +
        '</div>' +
        '<div style="padding:18px 40px 26px;border-top:1px solid var(--border-subtle);display:flex;gap:12px;justify-content:flex-end;background:var(--bg-surface);">' +
          '<button id="btn-cancel-connect" style="padding:11px 24px;border-radius:10px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-weight:500;flex-shrink:0;">Cancel</button>' +
          '<button id="btn-confirm-connect" style="padding:11px 28px;border-radius:10px;background:var(--accent-primary);color:white;border:none;cursor:pointer;font-weight:600;flex-shrink:0;">Connect</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    function closeOverlay() {
      if (qrHandle) { qrHandle.destroy(); qrHandle = null; }
      document.removeEventListener('keydown', onKeydown);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    function onKeydown(e) {
      if (e.key === 'Escape') closeOverlay();
    }

    // ── Parsing, errors, and this device's own addresses ─────────────────────
    //
    // ⚠⚠ `orbitAPI.connect(ip, port)` HAS ALWAYS TAKEN A PORT — the preload defaults
    // it to 46000 and the main process passes it to `connectToPeer('manual', ip,
    // port)` — and this modal has always thrown that away. A peer listening anywhere
    // but 46000 could not be reached by typing it, and nothing said why. This is the
    // only place that decides what gets sent, so the parse lives here.
    function parseAddress(raw) {
      var s = String(raw == null ? '' : raw).trim();
      if (!s) return { error: 'Enter an address to connect to.' };
      // People paste these out of messages, sometimes as a URL.
      s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '').replace(/\/.*$/, '');

      var host = s, port = null;
      var v6 = s.match(/^\[([0-9a-fA-F:]+)\](?::(\d{1,5}))?$/);
      if (v6) {
        host = v6[1];
        if (v6[2]) port = parseInt(v6[2], 10);
      } else {
        // Only a SINGLE colon is a port; anything else is an unbracketed IPv6.
        var first = s.indexOf(':');
        if (first > -1 && first === s.lastIndexOf(':')) {
          host = s.slice(0, first);
          port = parseInt(s.slice(first + 1), 10);
        }
      }
      if (!host) return { error: 'Enter an address to connect to.' };
      if (port !== null && !(port >= 1 && port <= 65535)) {
        return { error: 'That port is out of range — use 1 to 65535.' };
      }

      var isV4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      if (isV4) {
        var bad = host.split('.').filter(function(p) { return parseInt(p, 10) > 255; });
        if (bad.length) return { error: 'That is not a valid IPv4 address — every part must be 0 to 255.' };
      } else if (!/^[0-9a-fA-F:]+$/.test(host) &&
                 !/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(host)) {
        return { error: 'That does not look like an IP address or a hostname.' };
      }
      return { ip: host, port: port };
    }

    function setError(msg) {
      var err = overlay.querySelector('#af-error');
      var inp = overlay.querySelector('#connect-ip-input');
      if (err) {
        err.textContent = msg || '';
        err.style.display = msg ? 'block' : 'none';
      }
      if (inp) {
        inp.style.borderColor = msg ? 'var(--accent-danger)' : 'var(--border-subtle)';
        // ⚠⚠ THE RING IS NOT THE BORDER. Both sheets draw the focus ring as
        // `box-shadow: 0 0 0 2px … !important` — base.css's universal `*:focus-visible`
        // in classic, the layer's halo in the redesign — and the field is focused
        // whenever it has an error in it. So the accent ring sat OVER the red border
        // and the field read as "focused", not "wrong": the message was the only
        // signal. An inline `!important` is the only thing that outranks those.
        if (msg) inp.style.setProperty('box-shadow', '0 0 0 2px var(--accent-danger)', 'important');
        else inp.style.removeProperty('box-shadow');
      }
    }

    // ⚠⚠ THE MODAL ONLY EVER HELPED YOU CONNECT OUT. It never said how someone reaches
    // YOU, which is the other half of adding a friend over a LAN. `getLocalIPv4s()`
    // returns every interface on purpose — which one is right depends on which network
    // the other device is on, and the user is the only one who knows that.
    var localIPs = null;
    function loadLocalIPs() {
      if (localIPs) return Promise.resolve(localIPs);
      if (!window.orbitAPI || !window.orbitAPI.getLocalIPv4s) return Promise.resolve([]);
      return window.orbitAPI.getLocalIPv4s().then(function(list) {
        localIPs = Array.isArray(list) ? list.filter(Boolean) : [];
        return localIPs;
      }).catch(function() { localIPs = []; return localIPs; });
    }

    function paintYourAddress() {
      loadLocalIPs().then(function(ips) {
        var box = overlay.querySelector('#af-your-address');
        // The tab may have been switched, or the modal closed, while that was in flight.
        if (!box || !ips.length) return;
        // ⚠⚠ MASKED BY DEFAULT. Dan: "maybe hide the users ip ... showing like that is
        // kinda... you know..." — a full LAN address sitting in a dialog is readable
        // over a shoulder and permanent in a screenshot, and nobody has to READ it to
        // use it: the copy button is the whole point. The real value lives in `data-ip`
        // (not on screen); the eye reveals it deliberately, per row.
        var MASK = '\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022.\u2022\u2022\u2022';
        box.innerHTML =
          '<div style="font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-secondary);">Your address</div>' +
          ips.map(function(ip) {
            return '<div class="af-addr" data-ip="' + window.Sanitize.escapeHtml(ip) + '" ' +
              'style="display:flex;align-items:center;gap:8px;width:100%;padding:7px 8px 7px 12px;margin-top:6px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);">' +
                '<span class="af-addr-val" style="flex:1;min-width:0;font-size:13px;color:var(--text-primary);letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + MASK + '</span>' +
                '<button class="af-addr-btn af-reveal" title="Show address" aria-label="Show address" ' +
                  'style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;flex-shrink:0;">' +
                  '<i data-lucide="eye" style="width:14px;height:14px;"></i>' +
                '</button>' +
                '<button class="af-addr-btn af-copy" title="Copy address" aria-label="Copy address" ' +
                  'style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;flex-shrink:0;">' +
                  '<i data-lucide="copy" style="width:14px;height:14px;"></i>' +
                '</button>' +
              '</div>';
          }).join('') +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.45;">Hidden until you show it. Copy works either way — give one of these to the other device.</div>';
        if (window.lucide) window.lucide.createIcons({ root: box });

        box.querySelectorAll('.af-addr').forEach(function(row) {
          var real = row.getAttribute('data-ip');
          var val = row.querySelector('.af-addr-val');
          var reveal = row.querySelector('.af-reveal');
          var copy = row.querySelector('.af-copy');
          var shown = false;

          reveal.addEventListener('click', function() {
            shown = !shown;
            val.textContent = shown ? real : MASK;
            var label = shown ? 'Hide address' : 'Show address';
            reveal.setAttribute('title', label);
            reveal.setAttribute('aria-label', label);
            // ⚠ Rebuild the icon from scratch: `createIcons` REPLACES the <i> with an
            // <svg>, so calling it again on the same node finds nothing to swap and the
            // icon silently stops changing after the first toggle.
            reveal.innerHTML = '<i data-lucide="' + (shown ? 'eye-off' : 'eye') + '" style="width:14px;height:14px;"></i>';
            if (window.lucide) window.lucide.createIcons({ root: reveal });
          });

          copy.addEventListener('click', function() {
            function done() {
              // ⚠ The toast must not name the address — that would put back on screen
              // exactly what this masking is hiding.
              if (window.Toast) window.Toast.show('Copied', 'Address copied to clipboard', 'info', 2000);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(real).then(done, function() {
                try { window.orbitAPI.sendSync('write-clipboard', real); } catch (e) {}
                done();
              });
            } else {
              try { window.orbitAPI.sendSync('write-clipboard', real); } catch (e) {}
              done();
            }
          });
        });
      });
    }

    // Tear down any live scanner before swapping content, otherwise the paste
    // listener would keep firing against a detached node.
    function renderContent() {
      var content = overlay.querySelector('#add-friend-content');
      if (!content) return;
      if (qrHandle) { qrHandle.destroy(); qrHandle = null; }

      if (activeTab === 'ip') {
        content.innerHTML =
          '<input id="connect-ip-input" type="text" placeholder="192.168.1.42   ·   192.168.1.42:47000" ' +
            'autocomplete="off" spellcheck="false" ' +
            'style="width:100%;padding:14px 16px;border-radius:10px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;box-sizing:border-box;transition:border-color 0.15s;">' +
          '<div id="af-error" role="alert" style="display:none;font-size:12px;line-height:1.45;color:var(--accent-danger);margin-top:8px;"></div>' +
          '<div id="af-your-address" style="margin-top:14px;"></div>';
        var inp = content.querySelector('#connect-ip-input');
        if (inp) {
          inp.focus();
          inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') overlay.querySelector('#btn-confirm-connect').click(); });
          // Clear the complaint the moment they start fixing it.
          inp.addEventListener('input', function() { setError(''); });
        }
        paintYourAddress();
        return;
      }

      // QR tab — mount the shared scanner inline (same decode pipeline as the
      // standalone overlay, minus the overlay chrome).
      content.innerHTML = '';
      if (window.OrbitQRScanner && window.OrbitQRScanner.mount) {
        qrHandle = window.OrbitQRScanner.mount(content, { onPaired: closeOverlay });
      } else {
        content.innerHTML =
          '<div style="text-align:center;padding:20px 0;">' +
            '<button id="af-open-scanner" style="padding:10px 20px;background:var(--accent-primary);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Open QR scanner…</button>' +
          '</div>';
        var fallback = content.querySelector('#af-open-scanner');
        if (fallback && window.OrbitQRScanner) fallback.addEventListener('click', function() { window.OrbitQRScanner.open(); });
      }
    }

    function setTab(tab) {
      activeTab = tab;
      overlay.querySelectorAll('.af-tab').forEach(function(btn) {
        var on = btn.getAttribute('data-tab') === tab;
        btn.style.background = on ? 'var(--accent-primary)' : 'transparent';
        btn.style.color = on ? 'white' : 'var(--text-secondary)';
        btn.style.fontWeight = on ? '600' : '500';
      });
      var subtitle = overlay.querySelector('#add-friend-subtitle');
      if (subtitle) subtitle.textContent = SUBTITLES[tab] || SUBTITLES.ip;
      // Connecting by IP is an explicit submit; the QR tab has its own actions.
      var confirmBtn = overlay.querySelector('#btn-confirm-connect');
      if (confirmBtn) confirmBtn.style.display = (tab === 'ip') ? '' : 'none';
      renderContent();
    }

    overlay.querySelectorAll('.af-tab').forEach(function(btn) {
      btn.addEventListener('click', function() { setTab(btn.getAttribute('data-tab')); });
    });

    overlay.querySelector('#btn-cancel-connect').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', onKeydown);

    overlay.querySelector('#btn-confirm-connect').addEventListener('click', function() {
      var btn = this;
      if (btn.disabled) return;
      var input = overlay.querySelector('#connect-ip-input');
      var parsed = parseAddress(input ? input.value : '');

      if (parsed.error) {
        setError(parsed.error);
        if (input) input.focus();
        return;
      }

      // ⚠ The main process refuses a self-connect too, but only against the PRIMARY
      // interface and only AFTER this modal has closed — so the user loses what they
      // typed and gets a toast about a dialog that is already gone. Checking every
      // local address here keeps the error next to the mistake.
      loadLocalIPs().then(function(ips) {
        if (ips.indexOf(parsed.ip) !== -1) {
          setError('That is this device\u2019s own address — enter the address of the other device.');
          if (input) input.focus();
          return;
        }
        setError('');
        btn.disabled = true;
        btn.textContent = 'Connecting...';
        var label = parsed.port ? parsed.ip + ':' + parsed.port : parsed.ip;
        if (window.orbitAPI) {
          // ⚠ The port, when one was typed. The preload defaults it to 46000.
          if (window.orbitAPI.connect) window.orbitAPI.connect(parsed.ip, parsed.port || undefined);
          window.Toast.show('Connecting', 'Attempting to connect to ' + window.Sanitize.escapeHtml(label));
        }
        setTimeout(function() {
          closeOverlay();
          btn.disabled = false;
        }, 500);
      });
    });

    // ⚠ Exposed for the spec, and only for that: `parseAddress` is pure, and
    // `window.orbitAPI` is FROZEN — the port cannot be observed at the boundary it is
    // actually sent through, so the decision that produces it is what gets asserted.
    window.SidebarMiddle._parseAddress = parseAddress;

    renderContent();
  },

  attachEvents() {
    var self = this;

    // Delegated click for list rows
    this.container.addEventListener('click', function(e) {
      var row = e.target.closest('.list-row');
      if (!row) return;
      var id = row.getAttribute('data-id');
      if (!id) return;
      if (e.target.closest('.list-row-avatar')) {
        var state = window.store.getState();
        var friend = state.friends.find(function(f) { return f.userId === id; });
        if (friend && window.ProfileSidebar) window.ProfileSidebar.open(friend);
      } else if (row.getAttribute('data-reopen')) {
        // From All Friends: clear the closed flag too, or the DM would open and
        // then vanish from the list again on the next render.
        window.store.reopenDM(id);
      } else {
        window.store.setState({ activeChatId: id });
      }
    });

    var searchInput = this.container.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        var query = e.target.value.toLowerCase();
        var rows = self.container.querySelectorAll('.list-row');
        rows.forEach(function(row) {
          var text = row.innerText.toLowerCase();
          if (text.includes(query)) {
            row.style.display = 'flex';
          } else {
            row.style.display = 'none';
          }
        });
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var query = e.target.value.trim();
          if (!query) return;
          if (window.ChatPanel && window.ChatPanel.showSearchModal) {
            window.ChatPanel.showSearchModal(query);
          }
        }
      });
    }

    var toggleBtn = this.container.querySelector('#btn-toggle-sidebar');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var state = window.store.getState();
        window.store.setState({ sidebarMiddleVisible: !state.sidebarMiddleVisible });
      });
    }

    var tabs = this.container.querySelectorAll('.tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function(e) {
        tabs.forEach(function(t) {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
          t.style.color = 'var(--text-secondary)';
          t.style.fontWeight = 'normal';
        });
        e.target.classList.add('active');
        e.target.style.borderBottomColor = 'var(--accent-primary)';
        e.target.style.color = 'var(--text-primary)';
        e.target.style.fontWeight = '500';
        
        // data-view, not the label — a label-derived name is a trap ("All Friends"
        // would have become the view "all friends").
        var view = e.target.getAttribute('data-view') || e.target.innerText.toLowerCase();
        // Was Friends already the active view? Read BEFORE the setState below.
        var wasFriends = window.store.getState().activeView === 'friends';
        window.store.setState({ activeView: view, activeFolder: null });
        // Clicking the ALREADY-ACTIVE Friends tab opens the friends directory — the
        // tab lists who is online, the directory lists everyone. Deliberately not
        // on every click: switching Groups -> Friends used to pop a modal that had
        // to be dismissed before you could reach the list you asked for. The
        // header's "All friends" button is the discoverable way in; this is the
        // shortcut.
        if (view === 'friends' && wasFriends) self.showAllFriendsModal();
      });
    });

    // Connection stats drag-to-move
    var statsOverlay = document.getElementById('connection-stats-overlay');
    if (statsOverlay && !statsOverlay._dragAttached) {
      statsOverlay._dragAttached = true; // guard against duplicate attachment
      var dragHandle = statsOverlay.querySelector('#conn-stats-drag');
      if (dragHandle) {
        var isDragging = false, startX, startY, startLeft, startTop;
        function _onDragMove(e) {
          if (!isDragging) return;
          var dx = e.clientX - startX;
          var dy = e.clientY - startY;
          statsOverlay.style.left = (startLeft + dx) + 'px';
          statsOverlay.style.top = (startTop + dy) + 'px';
        }
        function _onDragEnd() {
          if (!isDragging) return;
          isDragging = false;
          dragHandle.style.cursor = 'grab';
          var rect = statsOverlay.getBoundingClientRect();
          if (window.Storage) {
            window.Storage.set('connStatsPos', { top: rect.top, left: rect.left });
          }
          document.removeEventListener('mousemove', _onDragMove);
          document.removeEventListener('mouseup', _onDragEnd);
        }
        dragHandle.addEventListener('mousedown', function(e) {
          isDragging = true;
          dragHandle.style.cursor = 'grabbing';
          var rect = statsOverlay.getBoundingClientRect();
          startX = e.clientX;
          startY = e.clientY;
          startLeft = rect.left;
          startTop = rect.top;
          statsOverlay.style.bottom = 'auto';
          statsOverlay.style.right = 'auto';
          statsOverlay.style.left = startLeft + 'px';
          statsOverlay.style.top = startTop + 'px';
          e.preventDefault();
          document.addEventListener('mousemove', _onDragMove);
          document.addEventListener('mouseup', _onDragEnd);
        });
      }

      // P2P Diagnostics button
      var diagBtn = statsOverlay.querySelector('#btn-p2p-diag');
      if (diagBtn) {
        diagBtn.addEventListener('click', function() {
          self.showP2PDiagnostics();
        });
      }

      // Live connection stats updater
      if (!window._connStatsInterval) {
        window._connStatsInterval = setInterval(function() {
          var st = document.getElementById('conn-status');
          var sp = document.getElementById('conn-peers');
          var su = document.getElementById('conn-uptime');
          var ss = document.getElementById('conn-sent');
          var sr = document.getElementById('conn-recv');
          if (!st) return;
          var state = window.store ? window.store.getState() : null;
          var online = state && state.friends ? state.friends.filter(function(f) { return f.status === 'online'; }).length : 0;
          st.textContent = online > 0 ? 'Connected' : 'Disconnected';
          // ⚠ These were the literals #30D158 and #ef4444 — and #30D158 is exactly
          // DARK's --accent-success, so this readout kept a bright green on nord,
          // sunset and the seasonal themes while everything around it changed.
          // Deliberately the ACCENT tokens rather than --presence-*: this is the
          // local peer's connection readout, not somebody's presence dot.
          st.style.color = online > 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
          sp.textContent = String(online);
          if (window._p2pStartTime) {
            var elapsed = Math.floor((Date.now() - window._p2pStartTime) / 1000);
            var h = Math.floor(elapsed / 3600);
            var m = Math.floor((elapsed % 3600) / 60);
            var s = elapsed % 60;
            su.textContent = h + 'h ' + m + 'm ' + s + 's';
          }
          ss.textContent = String(window._p2pSentCount || 0);
          sr.textContent = String(window._p2pRecvCount || 0);
        }, 2000);
      }
    }

    // Right-click context menu for DMs and groups
    var listContainer = document.getElementById('friends-list-container');
    if (listContainer) {
      listContainer.addEventListener('contextmenu', function(e) {
        var row = e.target.closest('.list-row');
        if (!row || !window.ContextMenu) return;
        e.preventDefault();
        var id = row.getAttribute('data-id');
        var type = row.getAttribute('data-type');
        var state = window.store.getState();
        var isMuted = state.mutedChats && state.mutedChats[id];

        if (type === 'group') {
          var group = state.groups.find(function(g) { return g.groupId === id; });
          if (!group) return;
    // Backfill avatarDataUrl for groups with file-based avatars
    if (group.avatarPath && !group.avatarDataUrl) {
      fetch('orbit-avatar://' + group.groupId + '?t=' + Date.now())
        .then(function(r) { return r.blob(); })
        .then(function(blob) {
          return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        })
        .then(function(dataUrl) {
          window.store.updateGroupField(group.groupId, 'avatarDataUrl', dataUrl);
        })
        .catch(function() {});
    }

    var isOwner = group.ownerId === state.currentUser.userId;
          var items = [
            { label: (group.pinned ? 'Unpin' : 'Pin') + ' Group', icon: 'pin', onClick: function() {
              window.store.updateGroupField(id, 'pinned', group.pinned ? 0 : 1);
            }},
            { label: (isMuted ? 'Unmute' : 'Mute') + ' Notifications', icon: isMuted ? 'bell' : 'bell-off', onClick: function() {
              window.store.toggleMute(id);
            }},
            { label: 'Group Info', icon: 'info', onClick: function() {
              window.SidebarMiddle.showGroupInfo(id);
            }},
            { label: 'Copy Invite Code', icon: 'link', onClick: function() {
              var code = group.inviteCode || Array.from(window.crypto.getRandomValues(new Uint8Array(4)), function(b) { return b.toString(16).padStart(2, '0'); }).join('');
              if (window.orbitAPI && window.orbitAPI.writeClipboard) {
                window.orbitAPI.writeClipboard(code);
              } else {
                navigator.clipboard.writeText(code).catch(function(e) { console.warn('Clipboard write failed', e); });
              }
              if (window.Toast) window.Toast.show('Copied', 'Invite code copied to clipboard');
            }},
            'separator',
            { label: 'Leave Group', icon: 'log-out', onClick: function() {
              if (window.ConfirmModal) {
                window.ConfirmModal.show({
                  title: 'Leave Group',
                  message: 'Are you sure you want to leave this group?',
                  confirmText: 'Leave',
                  danger: true,
                  onConfirm: function() {
                    if (window.orbitAPI) {
                      group.members.forEach(function(m) {
                        if (m.userId !== state.currentUser.userId) {
                          window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_LEAVE, { groupId: id, userId: state.currentUser.userId });
                        }
                      });
                    }
                    window.store.removeGroupMember(id, state.currentUser.userId);
                  }
                });
              }
            }}
          ];
          if (isOwner) {
            items.push('separator');
            items.push({ label: 'Delete Group', icon: 'trash-2', color: 'var(--accent-danger)', onClick: function() {
              self._deleteGroup(id);
            }});
          }
          self._appendFolderMenuItems(items, { kind: 'group', id: id });
          window.ContextMenu.show(e.clientX, e.clientY, items);
        } else {
          var friend = state.friends.find(function(f) { return f.userId === id; });
          if (!friend) return;
          var isPinned = state.pinnedDMs && state.pinnedDMs[id];
          var items = [
            { label: (isPinned ? 'Unpin' : 'Pin') + ' DM', icon: 'pin', onClick: function() {
              window.store.togglePinDM(id);
            }},
            { label: (isMuted ? 'Unmute' : 'Mute') + ' Notifications', icon: isMuted ? 'bell' : 'bell-off', onClick: function() {
              window.store.toggleMute(id);
            }},
            { label: 'View Profile', icon: 'user-round', onClick: function() {
              if (window.ProfileSidebar) window.ProfileSidebar.open(friend);
            }},
            'separator',
            { label: 'Copy ID', icon: 'copy', onClick: function() {
              navigator.clipboard.writeText(id);
              if (window.Toast) window.Toast.show('Copied', 'User ID copied to clipboard');
            }},
            (id === 'local-echo'
              ? { label: 'Close DM (not available)', icon: 'lock', color: 'var(--text-muted)', onClick: function() {
                  if (window.Toast) {
                    window.Toast.show('Orbit Echo cannot be closed', 'It is always available in your DMs', 'info');
                  }
                }}
              : { label: 'Close DM', icon: 'x', color: 'var(--accent-danger)', onClick: function() {
                  window.store.closeDM(id);
                }})
          ];
          self._appendFolderMenuItems(items, { kind: 'friend', id: id });
          window.ContextMenu.show(e.clientX, e.clientY, items);
        }
      });
    }
  },

  showP2PDiagnostics() {
    var state = window.store.getState();
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) document.body.removeChild(overlay); });

    var panel = document.createElement('div');
    panel.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:16px;width:600px;max-height:80vh;overflow-y:auto;padding:24px;font-family:monospace;font-size:12px;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
        '<h2 style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0;">P2P Diagnostics</h2>' +
        '<button id="p2p-diag-close" style="background:none;border:none;color:var(--text-secondary);font-size:20px;cursor:pointer;padding:4px 8px;border-radius:8px;">&times;</button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Status</span><span id="diag-status" style="color:var(--accent-success);">' + (window.SocketManager && window.SocketManager._server ? 'Running' : 'Stopped') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Discovery</span><span id="diag-discovery" style="color:var(--accent-success);">' + (window.Discovery && window.Discovery._started ? 'Active' : 'Inactive') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Peers</span><span id="diag-peers" style="color:var(--accent-success);">' + (state.friends ? state.friends.length : 0) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Connections</span><span id="diag-connections" style="color:var(--accent-success);">' + (window.SocketManager && window.SocketManager.connections ? window.SocketManager.connections.size : 0) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Muted Chats</span><span style="color:var(--accent-success);">' + Object.keys(state.mutedChats || {}).length + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Closed DMs</span><span style="color:var(--accent-success);">' + Object.keys(state.closedDMs || {}).length + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:var(--bg-base);border-radius:6px;"><span style="color:var(--text-muted);">Pinned DMs</span><span style="color:var(--accent-success);">' + Object.keys(state.pinnedDMs || {}).length + '</span></div>' +
      '</div>' +
      '<div style="margin-top:16px;padding:8px;background:var(--bg-base);border-radius:6px;max-height:200px;overflow-y:auto;" id="diag-log">' +
        '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Recent Logs</div>' +
        '<div id="diag-log-entries" style="color:var(--text-primary);font-size:11px;line-height:1.6;"></div>' +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Populate logs from debug buffer
    var logEl = document.getElementById('diag-log-entries');
    if (!window._debugLogBuffer) window._debugLogBuffer = [];
    if (window._debugLogBuffer.length > 0 && logEl) {
      logEl.textContent = window._debugLogBuffer.slice(-50).join('\n');
    } else if (logEl) {
      logEl.textContent = '(no logs captured — enable dev mode to capture)';
    }

    overlay.querySelector('#p2p-diag-close').addEventListener('click', function() {
      document.body.removeChild(overlay);
    });

    // Esc key to close
    function onKey(e) {
      if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);
  },

  // Deleting a group: confirm, tell the members, remove it locally.
  //
  // One copy, used by both the sidebar's context menu and the group info panel. They
  // were separate — the panel had no delete at all — and a duplicated broadcast is
  // exactly how the two would drift apart.
  _deleteGroup(id) {
    var state = window.store.getState();
    var group = (state.groups || []).find(function(g) { return (g.groupId || g.id) === id; });
    if (!group || !window.ConfirmModal) return;
    window.ConfirmModal.show({
      title: 'Delete Group',
      message: 'Are you sure you want to permanently delete this group and all messages?',
      confirmText: 'Delete',
      danger: true,
      onConfirm: function() {
        try {
          if (window.orbitAPI) {
            (group.members || []).forEach(function(m) {
              if (m.userId !== state.currentUser.userId) {
                window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_LEAVE, { groupId: id, userId: state.currentUser.userId });
              }
            });
          }
        } catch (e) {}
        window.store.removeGroup(id);
      }
    });
  },

  // The pinned block for a group: a count, the top pin, and a way into the full list.
  // Mirrors the one in the DM profile sidebar so the two read the same.
  _pinnedSectionHtml(chatId, group) {
    var store = window.store;
    var P = window.OrbitPinned;
    if (!store || !store.getPinnedMessages) return '';
    var pinned = store.getPinnedMessages(chatId);
    if (!pinned.length) return '';
    var esc = window.Sanitize.escapeHtml;
    var limit = P ? P.limitFor(true) : 5;
    var first = pinned[0];
    var rowStyle = 'display:block;width:100%;text-align:left;background:transparent;border:none;' +
      'padding:6px 0;cursor:pointer;font-size:12px;color:var(--text-secondary);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    return '<div id="group-pinned" style="margin:0 0 12px;background:var(--bg-base);border-radius:8px;padding:12px;">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
        '<i data-lucide="pin" style="width:14px;height:14px;color:var(--accent-primary);"></i>' +
        '<span style="font-size:11px;font-weight:600;text-transform:uppercase;color:var(--text-muted);">Pinned</span>' +
        '<span style="margin-left:auto;font-size:11px;color:var(--text-muted);">' +
          pinned.length + ' of ' + limit +
        '</span>' +
      '</div>' +
      '<button id="group-pinned-jump" data-msg-id="' + esc(String(first.msgId)) + '" style="' + rowStyle + '">' +
        esc(first.text || '(attachment)') +
      '</button>' +
      '<button id="group-pinned-show-all" style="margin-top:6px;background:transparent;border:none;' +
        'padding:0;cursor:pointer;font-size:11px;font-weight:600;color:var(--accent-primary);">' +
        (pinned.length > 1 ? 'Show all ' + pinned.length + ' pinned' : 'Manage pinned') +
      '</button>' +
    '</div>';
  },

  showGroupInfo(groupId) {
    var self = this;
    var state = window.store.getState();
    var group = state.groups.find(function(g) { return g.groupId === groupId; });
    if (!group) return;

    var isOwner = group.ownerId === state.currentUser.userId;
    var isAdmin = isOwner || (state.currentUser.userId !== group.ownerId && group.members.find(function(mm) { return mm.userId === state.currentUser.userId && mm.role === 'admin'; }));
    var myId = state.currentUser.userId;
    var members = group.members || [];
    var onlineCount = members.filter(function(m) { return m.status === 'online'; }).length;

    // Member search filter
    var memberSearchTerm = '';

    function buildMemberListHtml(filter) {
      var filtered = members;
      if (filter) {
        var f = filter.toLowerCase();
        filtered = members.filter(function(m) { return m.username.toLowerCase().indexOf(f) !== -1 || (m.usertag && m.usertag.toLowerCase().indexOf(f) !== -1); });
      }
      var html = '';
      filtered.forEach(function(m) {
        var isOnline = m.status === 'online';
        // ⚠ Presence comes from the shared palette, not from the raw accents. This
        // was the fifth site and the fourth different answer: the member list used
        // --accent-success, the chat header used --accent-success, the profile
        // sidebar hardcoded #22c55e and the settings peers row hardcoded #22c55e too.
        // The dot is now the shared glyph, so the shape says it as well as the hue.
        var onlineDot = '<span style="display:inline-flex;align-items:center;vertical-align:middle;margin-right:8px;">' +
          window.OrbitPresence.glyph(isOnline ? 'online' : 'offline', 10) + '</span>';
        var mFrame = window.Frames.getFrameForUser(m.userId);
        // Cross-reference friends list for correct avatar (member.avatar may be stale/wrong)
        var mFriend = window.store ? window.store.getState().friends.find(function(f) { return f.userId === m.userId; }) : null;
        var bestAvatar = mFriend ? (mFriend.avatar || null) : (m.avatar || null);
        var mAvatar = bestAvatar
          ? '<img src="' + window.Sanitize.escapeHtml(bestAvatar) + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">'
          : '<div style="width:32px;height:32px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:12px;color:white;font-weight:600;">' + m.username.charAt(0).toUpperCase() + '</div>';
        var mAvatarContainer = '<div style="position:relative;display:inline-block;">' + mAvatar + (mFrame ? '<img src="icons/frames/pfp_frame_' + mFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        var role = m.role || 'member';
        var roleBadge = '';
        if (role === 'owner') {
          roleBadge = '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--accent-primary);color:white;margin-left:6px;font-weight:600;">Owner</span>';
        } else if (role === 'admin') {
          roleBadge = '<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--accent-warning);color:#000;margin-left:6px;font-weight:600;">Admin</span>';
        }
        var canManage = isOwner || (myId !== m.userId && group.members.find(function(mm) { return mm.userId === myId && (mm.role === 'owner' || mm.role === 'admin'); }));
        var removeBtn = (canManage && m.userId !== myId && m.role !== 'owner')
          ? '<button class="group-info-remove-member" data-user-id="' + m.userId + '" style="background:none;border:none;color:var(--accent-danger);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px;" title="Remove member">✕</button>'
          : '';
        var promoteBtn = (isOwner && m.role === 'member')
          ? '<button class="group-info-promote" data-user-id="' + m.userId + '" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:4px;" title="Promote to Admin">▲</button>'
          : '';
        var demoteBtn = (isOwner && m.role === 'admin')
          ? '<button class="group-info-demote" data-user-id="' + m.userId + '" style="background:none;border:none;color:var(--accent-warning);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:4px;" title="Demote to Member">▼</button>'
          : '';
        var transferBtn = isOwner && m.role !== 'owner'
          ? '<button class="group-info-transfer-ownership" data-user-id="' + m.userId + '" style="background:none;border:none;color:var(--accent-warning);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:4px;margin-left:2px;" title="Transfer Ownership">◎</button>'
          : '';
        html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;cursor:default;">' +
          mAvatarContainer +
          '<div style="flex:1;">' +
            '<div style="font-size:13px;font-weight:500;color:var(--text-primary);display:flex;align-items:center;flex-wrap:wrap;">' + window.Sanitize.escapeHtml(m.username) + roleBadge + promoteBtn + demoteBtn + transferBtn + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">@' + window.Sanitize.escapeHtml(m.usertag || '') + '</div>' +
          '</div>' +
          onlineDot +
          removeBtn +
        '</div>';
      });
      return html;
    }

    function buildFriendPickerHtml() {
      var state2 = window.store.getState();
      var friends = state2.friends || [];
      var memberIds = {};
      (group.members || []).forEach(function(m) { memberIds[m.userId] = true; });
      var nonMembers = friends.filter(function(f) { return !memberIds[f.userId] && f.userId !== myId; });
      if (nonMembers.length === 0) {
        return '<div style="padding:12px;text-align:center;color:var(--text-muted);font-size:12px;">No friends to add</div>';
      }
      var html = '<div style="max-height:180px;overflow-y:auto;margin-top:8px;">';
      nonMembers.forEach(function(f) {
        var fFrame = window.Frames.getFrameForUser(f.userId);
        var favatar = f.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(f.avatar) + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;">'
          : '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:11px;color:white;font-weight:600;">' + (f.username || f.name || '?').charAt(0).toUpperCase() + '</div>';
        var favatarContainer = '<div style="position:relative;display:inline-block;">' + favatar + (fFrame ? '<img src="icons/frames/pfp_frame_' + fFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        html += '<div class="group-info-add-friend" data-user-id="' + f.userId + '" style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;cursor:pointer;">' +
          favatarContainer +
          '<div style="flex:1;font-size:13px;color:var(--text-primary);">' + window.Sanitize.escapeHtml(f.username || f.name || '') + '</div>' +
          '<span style="font-size:10px;color:var(--text-muted);">@' + window.Sanitize.escapeHtml(f.usertag || '') + '</span>' +
        '</div>';
      });
      html += '</div>';
      return html;
    }

    function refreshMemberList() {
      var membersContainer = document.getElementById('group-info-members-list');
      if (membersContainer) {
        var searchInput = document.getElementById('group-info-member-search');
        var term = searchInput ? searchInput.value : '';
        membersContainer.innerHTML = buildMemberListHtml(term);
        wireMemberButtons(membersContainer);
      }
    }

    function wireMemberButtons(scopeEl) {
      scopeEl = scopeEl || document.getElementById('group-info-overlay');
      if (!scopeEl) return;

      // Remove member buttons
      scopeEl.querySelectorAll('.group-info-remove-member').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetUserId = btn.getAttribute('data-user-id');
          var targetMember = group.members.find(function(m) { return m.userId === targetUserId; });
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Remove Member',
              message: 'Remove ' + (targetMember ? targetMember.username : 'this member') + ' from the group?',
              confirmText: 'Remove',
              danger: true,
              onConfirm: function() {
                if (window.orbitAPI) {
                  group.members.forEach(function(m) {
                    if (m.userId !== myId && m.userId !== targetUserId) {
                      window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_LEAVE, { groupId: groupId, userId: targetUserId });
                    }
                  });
                }
                window.store.removeGroupMember(groupId, targetUserId);
                scopeEl.remove();
              }
            });
          }
        });
      });

      // Promote to Admin buttons
      scopeEl.querySelectorAll('.group-info-promote').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetUserId = btn.getAttribute('data-user-id');
          window.store.setMemberRole(groupId, targetUserId, 'admin');
          scopeEl.remove();
          window.SidebarMiddle.showGroupInfo(groupId);
        });
      });

      // Demote to Member buttons
      scopeEl.querySelectorAll('.group-info-demote').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetUserId = btn.getAttribute('data-user-id');
          window.store.setMemberRole(groupId, targetUserId, 'member');
          scopeEl.remove();
          window.SidebarMiddle.showGroupInfo(groupId);
        });
      });

      // Transfer Ownership buttons
      scopeEl.querySelectorAll('.group-info-transfer-ownership').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var targetUserId = btn.getAttribute('data-user-id');
          var targetMember = group.members.find(function(m) { return m.userId === targetUserId; });
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Transfer Ownership',
              message: 'Transfer group ownership to ' + (targetMember ? targetMember.username : 'this member') + '? You will no longer be the owner.',
              confirmText: 'Transfer',
              danger: false,
              onConfirm: function() {
                window.store.updateGroupField(groupId, 'ownerId', targetUserId);
                // Notify all members
                if (window.orbitAPI) {
                  group.members.forEach(function(m) {
                    window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_OWNER_TRANSFER, { groupId: groupId, newOwnerId: targetUserId });
                  });
                }
                scopeEl.remove();
                window.SidebarMiddle.showGroupInfo(groupId);
              }
            });
          }
        });
      });
    }

    function wireAddFriendButtons(scopeEl) {
      scopeEl = scopeEl || document.getElementById('group-info-overlay');
      if (!scopeEl) return;

      scopeEl.querySelectorAll('.group-info-add-friend').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var friendUserId = btn.getAttribute('data-user-id');
          var state2 = window.store.getState();
          var friend = state2.friends.find(function(f) { return f.userId === friendUserId; });
          if (!friend) return;
          var userObj = {
            userId: friend.userId,
            username: friend.username || friend.name,
            usertag: friend.usertag,
            avatar: friend.avatar,
            status: friend.status || 'offline',
            role: 'member',
            joinedAt: new Date().toISOString(),
            ip: friend.ip || ''
          };
          window.store.addMemberToGroup(groupId, userObj);
          if (window.orbitAPI) {
            group.members.forEach(function(m) {
              window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_MEMBER_ADDED, { groupId: groupId, user: { userId: friend.userId, username: friend.username || friend.name, usertag: friend.usertag, avatar: friend.avatar, status: friend.status || 'offline', role: 'member', publicKey: friend.publicKey || null } });
            });
            var membersForNew = group.members.filter(function(m) { return m.userId !== myId; }).map(function(m) { return { userId: m.userId, username: m.username, usertag: m.usertag, avatar: m.avatar, status: m.status, role: m.role, publicKey: m.publicKey || null }; });
            membersForNew.push({ userId: myId, username: state2.currentUser.username, usertag: state2.currentUser.usertag || state2.currentUser.userTag || '', avatar: state2.currentUser.avatar || '', status: 'online', role: isOwner ? 'owner' : 'admin', publicKey: state2.currentUser.publicKey || null });
            membersForNew.push({ userId: friend.userId, username: friend.username || friend.name, usertag: friend.usertag || '', avatar: friend.avatar || '', status: friend.status || 'offline', role: 'member', publicKey: friend.publicKey || null });
            window.orbitAPI.networkSend(friend.userId, friend.ip || '', window.Protocol.Types.GROUP_JOIN_RESPONSE, { groupId: groupId, groupName: group.groupName, groupAvatar: group.avatarDataUrl || null, accepted: true, members: membersForNew });
          }
          scopeEl.remove();
          window.SidebarMiddle.showGroupInfo(groupId);
          if (window.Toast) window.Toast.show('Added', (friend.username || friend.name) + ' added to group');
        });
      });
    }

    // Default group avatar = member grid (shared/ui/group-avatar.js).
    // The initial-letter fallback that used to live here rendered the literal
    // string "undefined": it referenced `groupInitial`, which was declared
    // AFTER this line, so `var` hoisting left it undefined at use.
    var groupInitialFallback = (group.groupName || 'G').charAt(0).toUpperCase();

    var avatarFallbackLarge = window.OrbitGroupAvatar
      ? window.OrbitGroupAvatar.html(members, 86, 'var(--bg-surface)')
      : '<div style="width:86px;height:86px;border-radius:18px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:30px;color:white;font-weight:700;">' + window.Sanitize.escapeHtml(groupInitialFallback) + '</div>';

    var avatarSection = group.avatarPath
      ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" id="group-info-avatar-img" style="width:86px;height:86px;border-radius:18px;object-fit:cover;cursor:pointer;border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">'
      : group.avatarDataUrl
        ? '<img src="' + window.Sanitize.escapeHtml(group.avatarDataUrl) + '" id="group-info-avatar-img" style="width:86px;height:86px;border-radius:18px;object-fit:cover;cursor:pointer;border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">'
        : '<div id="group-info-avatar-img" style="cursor:pointer;border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);border-radius:18px;overflow:hidden;width:86px;height:86px;">' + avatarFallbackLarge + '</div>';

    var previewFallback = window.OrbitGroupAvatar
      ? window.OrbitGroupAvatar.html(members, 76, 'var(--bg-surface)')
      : '<div style="width:76px;height:76px;border-radius:18px;background:var(--bg-surface);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--text-primary);">' + window.Sanitize.escapeHtml(groupInitialFallback) + '</div>';

    var previewAvatarSection = group.avatarPath
      ? '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(groupId) + '?t=' + (group.avatarUpdatedAt || 0) + '" id="group-info-preview-avatar-img" style="position:absolute;left:24px;bottom:-38px;width:76px;height:76px;border-radius:18px;object-fit:cover;border:4px solid var(--bg-surface);">'
      : group.avatarDataUrl
        ? '<img src="' + window.Sanitize.escapeHtml(group.avatarDataUrl) + '" id="group-info-preview-avatar-img" style="position:absolute;left:24px;bottom:-38px;width:76px;height:76px;border-radius:18px;object-fit:cover;border:4px solid var(--bg-surface);">'
        : '<div id="group-info-preview-avatar-img" style="position:absolute;left:24px;bottom:-38px;width:76px;height:76px;border-radius:18px;overflow:hidden;background:var(--bg-surface);border:4px solid var(--bg-surface);">' + previewFallback + '</div>';

    // No 'Unknown' fallback: a row that says "Created Unknown" is worse than no row at all.
    // Whether the row shows is a setting — Dan was unsure whether he wanted it, so it is his
    // call rather than mine.
    var showCreated = !window.store || window.store.getState().settings.showGroupCreated !== false;
    var createdDate = group.createdAt
      ? new Date(group.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    var collapsibleClick = "var b=this.nextElementSibling;var i=this.querySelector('.collapse-icon');if(b.style.display==='none'){b.style.display='block';i.style.transform='rotate(0deg)'}else{b.style.display='none';i.style.transform='rotate(-90deg)'}";
    var sectionStart = function(icon, title, open) {
      return '<div class="settings-collapsible" style="margin-bottom:12px;border-radius:10px;border:1px solid var(--border-subtle);overflow:hidden;">' +
        '<div class="collapsible-header" style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg-base);cursor:pointer;user-select:none;" onclick="' + collapsibleClick + '">' +
          '<div style="display:flex;align-items:center;gap:8px;"><i data-lucide="' + icon + '" style="width:16px;height:16px;color:var(--text-muted);"></i><span style="font-size:13px;font-weight:600;color:var(--text-primary);">' + title + '</span></div>' +
          '<i data-lucide="chevron-down" class="collapse-icon" style="width:16px;height:16px;color:var(--text-muted);transition:transform 0.2s;' + (open ? '' : 'transform:rotate(-90deg);') + '"></i>' +
        '</div>' +
        '<div class="collapsible-body" style="padding:16px;display:' + (open ? 'block' : 'none') + ';">';
    };
    var sectionEnd = '</div></div>';
    var fieldStyle = 'width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:14px;outline:none;';
    var ghostBtnStyle = 'padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);cursor:pointer;font-size:12px;font-weight:600;';

    var overlay = document.createElement('div');
    overlay.id = 'group-info-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:800px;height:600px;background:var(--bg-surface);border-radius:var(--radius-lg);display:flex;overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);';
    panel.innerHTML =
      '<div style="width:240px;background:var(--bg-base);padding:24px;border-right:1px solid var(--border-subtle);display:flex;flex-direction:column;">' +
        '<h2 style="font-family:var(--font-display);font-size:20px;margin:0 0 24px;color:var(--text-primary);font-weight:bold;">Group Info</h2>' +
        '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:20px;">' +
          avatarSection +
          (isOwner ? '<button id="group-info-upload-avatar" style="margin-top:10px;padding:7px 10px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;font-size:12px;font-weight:600;">Change Avatar</button>' : '') +
          '<div style="font-size:17px;font-weight:700;color:var(--text-primary);margin-top:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(group.groupName || 'Group') + '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + onlineCount + ' online, ' + members.length + ' members</div>' +
        '</div>' +
        '<div style="margin-top:4px;">' +
          // ⚠ "Overview" was a filled `--bg-hover` row with a 8px radius and 10px of
          // padding — byte-for-byte the shape of the settings nav's SELECTED item,
          // which sits two inches to the right in the modal next door. A static
          // heading was advertising itself as a control. It is a label over two
          // facts now.
          '<div class="gi-label">Overview</div>' +
          ((showCreated && createdDate)
            ? '<div class="gi-fact">Created ' + createdDate + '</div>'
            : '') +
          '<div class="gi-fact">Role: ' + (isOwner ? 'Owner' : (isAdmin ? 'Admin' : 'Member')) + '</div>' +
        '</div>' +
        '<div style="flex:1;"></div>' +
        '<button class="btn-ghost" id="group-info-close" style="padding:10px;border:1px solid var(--border-subtle);border-radius:8px;color:var(--text-secondary);background:transparent;cursor:pointer;">Close</button>' +
      '</div>' +
      '<div style="flex:1;padding:32px;overflow-y:auto;background:var(--bg-surface);">' +
        '<h3 style="font-family:var(--font-display);font-size:24px;margin:0 0 24px;color:var(--text-primary);">Manage Group</h3>' +
        '<div style="margin-bottom:24px;border-radius:12px;overflow:hidden;border:1px solid var(--border-subtle);">' +
        // ⚠ `var(--banner-default)`, not a gradient spelled out here. This is the
        // third copy of the same default (with the profile sidebar and the settings
        // preview) and it was still ending in the retired #6C5CE7. One value, one
        // place: styles/variables.css.
          '<div style="height:96px;background:var(--banner-default);position:relative;">' +
            previewAvatarSection +
          '</div>' +
          '<div style="padding:46px 24px 20px;background:var(--bg-surface);">' +
            '<div style="font-size:18px;font-weight:700;color:var(--text-primary);">' + window.Sanitize.escapeHtml(group.groupName || 'Group') + '</div>' +
            '<div style="font-size:13px;color:var(--text-muted);margin-top:4px;line-height:1.4;">' + window.Sanitize.escapeHtml(group.description || 'No description yet') + '</div>' +
          '</div>' +
        '</div>' +
        sectionStart('users', 'Profile', true) +
          '<div style="margin-bottom:16px;"><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Group Name</label>' +
          '<input id="group-info-name" type="text" value="' + window.Sanitize.escapeHtml(group.groupName || '') + '" style="' + fieldStyle + (isOwner ? '' : 'opacity:0.7;') + '" ' + (isOwner ? '' : 'disabled') + '></div>' +
          '<div><label style="display:block;font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Description</label>' +
          '<textarea id="group-info-desc" rows="3" style="' + fieldStyle + 'resize:none;' + (isOwner ? '' : 'opacity:0.7;') + '" ' + (isOwner ? '' : 'disabled') + '>' + window.Sanitize.escapeHtml(group.description || '') + '</textarea></div>' +
          ((showCreated && group.createdAt)
            ? '<div style="font-size:11px;color:var(--text-muted);">Created ' +
              window.Sanitize.escapeHtml(new Date(group.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) +
              '</div>'
            : '') +
        sectionEnd +
        // Pinned messages, under the group's own info — the same idea as the profile
        // panel, in the place a group keeps its details.
        this._pinnedSectionHtml(groupId, group) +
        sectionStart('key-round', 'Invite', false) +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
            '<div style="min-width:0;">' +
              '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:6px;">Invite Code</div>' +
              '<div style="font-size:13px;color:var(--accent-primary);font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(group.inviteCode || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-shrink:0;">' +
              '<button class="btn-ghost" id="group-info-copy-invite" style="' + ghostBtnStyle + '">Copy</button>' +
              '<button class="btn-ghost" id="group-info-share-invite" style="' + ghostBtnStyle + 'color:var(--accent-primary);">Share</button>' +
            '</div>' +
          '</div>' +
        sectionEnd +
        sectionStart('sliders-horizontal', 'Preferences', false) +
          '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;">' +
            // ⚠ A <span>, not a <label>: the row IS already a label, and a label
            // inside a label is invalid. The row's label does the toggling; this is
            // only the visual, and §9c of styles/redesign.css owns its appearance.
            '<span class="orbit-switch">' +
              '<input type="checkbox" id="group-info-pin"' + (group.pinned ? ' checked' : '') + '>' +
              '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
            '</span><div><div>Pin Group</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Keep this group near the top of your chat list</div></div>' +
          '</label>' +
          '<label style="display:flex;align-items:center;gap:12px;font-size:13px;color:var(--text-primary);cursor:pointer;padding:8px 0;border-top:1px solid var(--border-subtle);">' +
            '<span class="orbit-switch">' +
              '<input type="checkbox" id="group-info-mute"' + (group.notificationMuted ? ' checked' : '') + '>' +
              '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
            '</span><div><div>Mute Notifications</div><div style="font-size:11px;color:var(--text-muted);font-weight:400;">Stop notification alerts from this group</div></div>' +
          '</label>' +
        sectionEnd +
        // The online count was computed but never shown, so the one thing you want to
        // know about a member list at a glance was the one thing missing from it.
        sectionStart('user-plus', 'Members (' + members.length +
          (onlineCount ? ' \u00b7 ' + onlineCount + ' online' : '') + ')', true) +
          '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
            '<input id="group-info-member-search" type="text" placeholder="Search members..." style="flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;">' +
            '<button id="group-info-add-member-btn" style="' + ghostBtnStyle + 'color:var(--accent-primary);">Add</button>' +
          '</div>' +
          '<div id="group-info-add-member-section" style="display:none;margin-bottom:12px;padding:12px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:10px;">' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;font-weight:600;">Select a friend to add</div>' +
            '<div id="group-info-friend-picker">' + buildFriendPickerHtml() + '</div>' +
          '</div>' +
          '<div id="group-info-members-list">' + buildMemberListHtml('') + '</div>' +
        sectionEnd +
        // A danger zone for both roles. The owner used to get nothing here, and their
        // delete lived only in the sidebar's right-click menu — which is not somewhere
        // anyone looks for it.
        sectionStart('trash-2', 'Danger Zone', false) +
          (isOwner
            ? '<button id="group-info-delete-group" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--accent-danger);background:transparent;color:var(--accent-danger);cursor:pointer;font-size:13px;font-weight:600;">Delete Group</button>' +
              '<div style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5;">You own this group, so there is no Leave option. Delete it, or hand ownership to someone else first.</div>'
            : '<button id="group-info-leave-group" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--accent-danger);background:transparent;color:var(--accent-danger);cursor:pointer;font-size:13px;font-weight:600;">Leave Group</button>') +
        sectionEnd +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: panel });

    // Close button
    document.getElementById('group-info-close').addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    // Esc key
    function onEsc(e) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);

    // Copy invite code
    document.getElementById('group-info-copy-invite').addEventListener('click', function() {
      var hadCodeCopy = !!group.inviteCode;
      group.inviteCode = group.inviteCode || Array.from(window.crypto.getRandomValues(new Uint8Array(4)), function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      if (!hadCodeCopy && group.inviteCode && window.store && window.store.updateGroupField) {
        try { window.store.updateGroupField(group.groupId, 'inviteCode', group.inviteCode); } catch(e) {}
      }
      if (window.orbitAPI && window.orbitAPI.writeClipboard) {
        window.orbitAPI.writeClipboard(group.inviteCode);
      } else {
        navigator.clipboard.writeText(group.inviteCode).catch(function(e) { console.warn('Clipboard write failed', e); });
      }
      if (window.Toast) window.Toast.show('Copied', 'Invite code copied');
    });

    // Share invite via system share sheet
    var shareInviteBtn = document.getElementById('group-info-share-invite');
    if (shareInviteBtn) {
      shareInviteBtn.addEventListener('click', function() {
        var hadCode = !!group.inviteCode;
        group.inviteCode = group.inviteCode || (function() { var b=new Uint8Array(4); window.crypto.getRandomValues(b); return Array.from(b).map(function(x){return x.toString(16).padStart(2,'0')}).join(''); })();
        if (!hadCode && group.inviteCode && window.store && window.store.updateGroupField) {
          try { window.store.updateGroupField(group.groupId, 'inviteCode', group.inviteCode); } catch(e) {}
        }
        var inviteText = 'Join "' + group.groupName + '" on Orbit! Code: ' + group.inviteCode;
        try {
          if (navigator.share) {
            var canShareOk = true;
            try { if (navigator.canShare && !navigator.canShare({ text: inviteText })) canShareOk = false; } catch(e) { canShareOk = true; }
            if (canShareOk) {
              navigator.share({ title: 'Orbit invite', text: inviteText }).then(function(){
                if (window.Toast) window.Toast.show('Shared', 'Shared!');
              }).catch(function(err){
                if (err && err.name === 'AbortError') return;
                if (window.orbitAPI && window.orbitAPI.writeClipboard) {
                  try { window.orbitAPI.writeClipboard(inviteText); if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); } catch(e2) { if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error'); }
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(inviteText).then(function(){ if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); }).catch(function(){ if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error'); });
                } else {
                  if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error');
                }
              });
              return;
            }
          }
        } catch(e) {}
        if (window.orbitAPI && window.orbitAPI.writeClipboard) {
          try { window.orbitAPI.writeClipboard(inviteText); if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); } catch(e) { if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error'); }
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(inviteText).then(function(){ if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); }).catch(function(){
            try { var ta2=document.createElement('textarea'); ta2.value=inviteText; document.body.appendChild(ta2); ta2.select(); document.execCommand('copy'); ta2.remove(); if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); } catch(e){ if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error'); }
          });
        } else {
          try { var ta=document.createElement('textarea'); ta.value=inviteText; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); if (window.Toast) window.Toast.show('Copied', 'Invite text copied - share it anywhere'); } catch(e){ if (window.Toast) window.Toast.show('Error', 'Copy failed', 'error'); }
        }
      });
    }

    // Upload avatar
    var uploadBtn = document.getElementById('group-info-upload-avatar');
    if (uploadBtn) {
      uploadBtn.addEventListener('click', function() { window.SidebarMiddle.handleGroupAvatarUpload(groupId); });
    }

    // Edit name
    var nameInput = document.getElementById('group-info-name');
    if (nameInput && isOwner) {
      nameInput.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'groupName', nameInput.value);
      });
    }

    // Edit description
    var descInput = document.getElementById('group-info-desc');
    if (descInput && isOwner) {
      descInput.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'description', descInput.value);
      });
    }

    // Pin toggle
    // ⚠ The track and the knob used to be repainted by hand here, on render AND on
    // every change — a second writer for state the checkbox already carries, with
    // its own hardcoded travel ('18px' / '2px'). §9c of styles/redesign.css reads
    // `:checked` and computes the travel from the switch's own dimensions, so all
    // that is left is the store write.
    var pinCheck = document.getElementById('group-info-pin');
    if (pinCheck) {
      pinCheck.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'pinned', pinCheck.checked ? 1 : 0);
      });
    }

    // Mute toggle
    var muteCheck = document.getElementById('group-info-mute');
    if (muteCheck) {
      muteCheck.addEventListener('change', function() {
        window.store.updateGroupField(groupId, 'notificationMuted', muteCheck.checked ? 1 : 0);
      });
    }

    // Member search
    var searchInput = document.getElementById('group-info-member-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        refreshMemberList();
      });
    }

    // Toggle Add Member section
    var addMemberBtn = document.getElementById('group-info-add-member-btn');
    if (addMemberBtn) {
      addMemberBtn.addEventListener('click', function() {
        var section = document.getElementById('group-info-add-member-section');
        if (section) {
          section.style.display = section.style.display === 'none' ? 'block' : 'none';
        }
      });
    }

    // Wire member action buttons
    wireMemberButtons();
    wireAddFriendButtons();

    // Leave Group
    // Pinned: the top pin scrolls to its message, the second button opens the list.
    var _pinJump = document.getElementById('group-pinned-jump');
    if (_pinJump) {
      _pinJump.addEventListener('click', function () {
        var id = _pinJump.getAttribute('data-msg-id');
        var el = document.querySelector('[data-msg-id="' + id + '"].message-row');
        if (!el && window.store && window.store.loadFullChatMessages) {
          window.store.loadFullChatMessages(groupId);
          setTimeout(function () {
            var again = document.querySelector('[data-msg-id="' + id + '"].message-row');
            if (again) again.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 250);
          return;
        }
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
    // Right-click anywhere on the pinned block for the floating list at the cursor.
    var _pinBox = document.getElementById('group-pinned');
    if (_pinBox) {
      _pinBox.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.PinnedMenu) window.PinnedMenu.showAt(e.clientX, e.clientY, groupId);
      });
    }

    var _pinAll = document.getElementById('group-pinned-show-all');
    if (_pinAll) {
      _pinAll.addEventListener('click', function () {
        if (window.PinnedModal) window.PinnedModal.show(groupId);
      });
    }

    var deleteBtn = document.getElementById('group-info-delete-group');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function() {
        self._deleteGroup(groupId);
      });
    }

    var leaveBtn = document.getElementById('group-info-leave-group');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', function() {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Leave Group',
            message: 'Are you sure you want to leave this group?',
            confirmText: 'Leave',
            danger: true,
            onConfirm: function() {
              if (window.orbitAPI) {
                group.members.forEach(function(m) {
                  if (m.userId !== myId) {
                    window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_LEAVE, { groupId: groupId, userId: myId });
                  }
                });
              }
              window.store.removeGroupMember(groupId, myId);
              overlay.remove();
              if (window.Toast) window.Toast.show('Left Group', 'You left ' + group.groupName);
            }
          });
        }
      });
    }
  },

  handleGroupAvatarUpload(groupId) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        if (!ev.target || !ev.target.result) return;
        if (window.orbitAPI && window.orbitAPI.saveAvatar) {
          var ts = Date.now();
          var dataParts = ev.target.result.split(',');
          if (dataParts.length < 2) { if (window.Toast) window.Toast.show('Error', 'Invalid image data'); return; }
          var fullDataUrl = ev.target.result;
          window.orbitAPI.saveAvatar(groupId, dataParts[1]).then(function(path) {
            window.store.updateGroupField(groupId, 'avatarPath', path);
            window.store.updateGroupField(groupId, 'avatarDataUrl', fullDataUrl);
            window.store.updateGroupField(groupId, 'avatarUpdatedAt', ts);
            var newSrc = 'orbit-avatar://' + groupId + '?t=' + ts;
            var img = document.getElementById('group-info-avatar-img');
            var previewImg = document.getElementById('group-info-preview-avatar-img');
            if (img) img.src = newSrc;
            if (previewImg) previewImg.src = newSrc;
          }).catch(function(err) {
            if (window.Toast) window.Toast.show('Error', 'Failed to save avatar');
            console.error('Avatar save failed:', err);
          });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }
};
