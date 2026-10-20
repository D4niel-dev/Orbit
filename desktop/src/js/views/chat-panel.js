// src/js/views/chat-panel.js

/* ---- File transfer chunk size ----
   Shared by sendMessage (which computes totalChunks) and _sendFileChunks (which
   slices the buffer). Those are SEPARATE class methods, so this must live at module
   scope: it used to be a local `var` inside sendMessage, which left _sendFileChunks
   throwing "ReferenceError: CHUNK_SIZE is not defined" on the very first chunk.
   Every file send died there — which is why attaching anything produced no message. */
var CHUNK_SIZE = 64 * 1024; // 64 KB

/* ---- Slash Command Registry (mirrors mobile/src/js/app.js:14-26) ---- */
var CHAT_COMMANDS = [
  { name: '/help', desc: 'Show all available commands', usage: '/help', handler: 'help' },
  { name: '/poll', desc: 'Create a poll in the group', usage: '/poll "Question?" "Option1" "Option2" ...', handler: 'poll' },
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

/* Timestamps are not reliably Dates or ISO strings.
   On the desktop they come back from storage as a STRING holding an epoch with a trailing
   ".0" — "1785589248803.0" — and `new Date("1785589248803.0")` is an Invalid Date, so any age
   computed from it silently becomes NaN. Parse the number first, then fall back. */
function _msgTime(t) {
  if (t == null) return NaN;
  if (typeof t === 'number') return t;
  var n = parseFloat(t);
  if (!isNaN(n) && n > 1e11) return n;
  return new Date(t).getTime();
}

window.ChatPanel = {
  init() {
    this.container = document.getElementById('chat-container');
    this.stagedFiles = [];
    this.replyingTo = null; // { id, sender, text }
    this.editingMsg = null; // { id, chatId, text }
    // Resumable file transfer state (renderer sender path):
    // _sendSessions: fileId → pinned { data, name, type, mimeType, size, totalChunks,
    //   hash, recipients, isGroup, chatId, startPayload, _sending } kept for the app
    //   session so a FILE_TRANSFER_RESUME can re-send from an offset.
    // _resumeRequests: fileId → receivedCount requested mid-loop (rewind flag).
    this._sendSessions = {};
    this._resumeRequests = {};

    // M4: main → renderer — the peer cancelled a transfer. Mark every
    // matching send session cancelled (keys may be per-recipient prefixed,
    // so match by "starts with fileId"); the chunk loop observes the flag
    // and aborts, mirroring the mobile activeSends handling.
    if (window.orbitAPI && window.orbitAPI.on) {
      var selfCancel = this;
      window.orbitAPI.on('transfer-cancel', function(data) {
        if (!data || !data.fileId) return;
        var fid = String(data.fileId);
        Object.keys(selfCancel._sendSessions).forEach(function(key) {
          if (key.indexOf(fid) === 0) selfCancel._sendSessions[key].cancelled = true;
        });
        console.log('[ChatPanel] Incoming FILE_TRANSFER_CANCEL for ' + fid + ' (sender ' + (data.senderId || '?') + ') — aborting matching send session(s)');
      });
    }

    // Voice memo recorder state — lives on the panel object so it survives
    // chat re-renders (renderChat rebuilds the input DOM each store change).
    this._voiceState = {
      isRecording: false,   // MediaRecorder actively capturing
      pendingStart: false,  // getUserMedia in flight
      holding: false,       // pointer currently down on the mic button
      pressStart: 0,        // pointerdown timestamp (hold detection)
      stageOnRelease: false,// hold release happened before stream ready — stage once started
      suppressClick: true,  // swallow the click that follows a pointer interaction
      cancelPending: false, // next onstop should discard chunks
      stream: null,         // active getUserMedia stream
      mediaRecorder: null,  // active MediaRecorder
      srcNode: null,        // MediaStreamAudioSourceNode (disconnected on stop)
      audioChunks: [],      // collected dataavailable chunks
      analyser: null,       // AnalyserNode for the live level meter
      audioCtx: null,       // shared AudioContext (created lazily)
      _meterData: null,     // reusable Uint8Array for analyser reads
      startTime: null,      // recording start (ms epoch)
      timerInterval: null,  // mm:ss timer updater
      meterInterval: null   // level-meter updater
    };
    
    // Delegated click handler — attached ONCE in init

    // Link preview click delegation
    document.addEventListener('click', function(e) {
      var lp = e.target.closest('.link-preview');
      if (lp) {
        var url = lp.getAttribute('data-url');
        if (url) window.open(url, '_blank');
      }
      // "Call again" on a call-log entry - redials the same kind of call.
      var callAgain = e.target.closest('.call-log-again');
      if (callAgain) {
        e.stopPropagation();
        var peerId = callAgain.getAttribute('data-call-again');
        var isVideo = callAgain.getAttribute('data-call-video') === '1';
        if (!peerId || !window.CallManager) return;
        var st = window.store.getState();
        var f = st.friends.find(function(fr) { return fr.userId === peerId; });
        window.CallManager.startCall(isVideo, peerId, (f && f.ip) || '');
      }
    });
    this.initDelegatedActions();
    
    // Subscribe to store
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      // pinnedMessages belongs here. It was missing, so pinning a message changed the store
      // and nothing re-rendered: the menu correctly offered Unpin, and the bar never
      // appeared, because its paint only runs on a render.
      var relevant = ['messages', 'activeChatId', 'activeTab', 'groups', 'currentUser', 'settings', 'pinnedMessages'];
      if (!changedState || relevant.some(function(k) { return k in changedState; })) {
        // Save draft when switching away from a chat
        if (changedState && 'activeChatId' in changedState && this._prevChatId) {
          var oldInput = document.getElementById('chat-input');
          if (oldInput && oldInput.value.trim()) {
            localStorage.setItem('orbit_draft_' + this._prevChatId, oldInput.value);
          }
        }
        // Prevent interrupting audio/video playback during re-renders
        var savedAudio = null;
        var savedVideo = null;
        var isAudioPlaying = window.OrbitAudioPlayer && window.OrbitAudioPlayer.isAnyPlaying && window.OrbitAudioPlayer.isAnyPlaying();
        var isVideoPlaying = window.OrbitVideoPlayer && window.OrbitVideoPlayer.isAnyPlaying && window.OrbitVideoPlayer.isAnyPlaying();
        if (isAudioPlaying || isVideoPlaying) {
          if (!changedState || !('activeChatId' in changedState)) {
            if (isAudioPlaying && window.OrbitAudioPlayer.savePlaying) savedAudio = window.OrbitAudioPlayer.savePlaying();
            if (isVideoPlaying && window.OrbitVideoPlayer.savePlaying) savedVideo = window.OrbitVideoPlayer.savePlaying();
          }
        }
        if (changedState && 'activeChatId' in changedState && state.activeChatId) {
          window.store.loadFullChatMessages(state.activeChatId);
        }
        this.renderChat(state);
        // Restore draft for this chat after render
        if (state.activeChatId) {
          var draft = localStorage.getItem('orbit_draft_' + state.activeChatId);
          var newInput = document.getElementById('chat-input');
          if (draft && newInput) {
            newInput.value = draft;
            newInput.style.height = 'auto';
            newInput.style.height = Math.min(newInput.scrollHeight, 200) + 'px';
          }
        }
        this._prevChatId = state.activeChatId;
        if (savedAudio && window.OrbitAudioPlayer.restorePlaying) window.OrbitAudioPlayer.restorePlaying(savedAudio);
        if (savedVideo && window.OrbitVideoPlayer.restorePlaying) window.OrbitVideoPlayer.restorePlaying(savedVideo);
      } else if (changedState && 'friends' in changedState) {
        // Peer presence and a peer's profile frame both arrive as a
        // friends-only change (store.addOrUpdatePeer). A full renderChat would
        // rebuild the whole feed and force-scroll it to the bottom mid-read, so
        // repaint just the header strip. Group headers derive from `groups`
        // (already in `relevant`) and refreshing would drop the member-count
        // listener, so only DMs take this path.
        var fState = window.store.getState();
        var inGroupChat = fState.groups.some(function(g) { return g.groupId === fState.activeChatId; });
        if (!inGroupChat) this._refreshHeaderStrip(fState);
      }
    });

    // Load full messages for the initial active chat
    var initialId = window.store.getState().activeChatId;
    if (initialId) window.store.loadFullChatMessages(initialId);

    this.render();
    this.attachEvents();
    
    // Initial render
    this.renderChat(window.store.getState());
    this._prevChatId = window.store.getState().activeChatId;
  },

  initDelegatedActions() {
    var self = this;
    this.container.addEventListener('click', function(e) {
      if (e.target.closest('#btn-cancel-reply')) {
        self.replyingTo = null;
        var bar = document.getElementById('reply-edit-bar');
        if (bar) bar.remove();
        return;
      }
      if (e.target.closest('#btn-cancel-edit')) {
        self.editingMsg = null;
        var inp = document.getElementById('chat-input');
        if (inp) inp.value = '';
        window.store.notify();
        return;
      }
      
      // React
      var reactBtn = e.target.closest('.msg-react-btn');
      if (reactBtn) {
        e.stopPropagation();
        var msgId = reactBtn.getAttribute('data-msg-id');
        var rect = reactBtn.getBoundingClientRect();
        self.showReactionPicker(rect.right, rect.bottom, msgId);
        return;
      }

      // Reply
      var replyBtn = e.target.closest('.msg-reply-btn');
      if (replyBtn) {
        var msgId = replyBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg) {
          var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
          self.replyingTo = { id: msg.id, text: msg.text, senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User'), attachments: msg.attachments || null };
          self.editingMsg = null;
          var inp = document.getElementById('chat-input');
          if (inp) inp.focus();
          window.store.notify();
        }
        return;
      }
      
      // Edit
      var editBtn = e.target.closest('.msg-edit-btn');
      if (editBtn) {
        var msgId = editBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg) {
          self.editingMsg = { id: msg.id, chatId: state.activeChatId, text: msg.text };
          self.replyingTo = null;
          var inp = document.getElementById('chat-input');
          if (inp) {
            inp.value = msg.text;
            inp.focus();
          }
          window.store.notify();
        }
        return;
      }
      
      // Translate
      var translateBtn = e.target.closest('.msg-translate-btn');
      if (translateBtn) {
        var msgId = translateBtn.getAttribute('data-msg-id');
        var state = window.store.getState();
        var msgList = state.messages[state.activeChatId] || [];
        var msg = msgList.find(function(m) { return m.id == msgId; });
        if (msg && msg.text) {
          var bubble = document.querySelector('.message-bubble[data-msg-id="' + msgId + '"]');
          if (bubble) {
            var existing = bubble.querySelector('.translated-text');
            if (existing) {
              existing.remove();
              return;
            }
            var targetLang = state.settings.translateTargetLang || (navigator.language || 'en').split('-')[0] || 'en';
            var useAuto = state.settings.autoDetectSource;
            var div = document.createElement('div');
            div.className = 'translated-text';
            div.style.cssText = 'font-size:11px;color:var(--text-muted);border-top:1px solid var(--border-subtle);margin-top:6px;padding-top:6px;';
            div.textContent = 'Translating...';
            bubble.appendChild(div);

            // Check cache first
            if (!window._translationCache) window._translationCache = new Map();
            if (!window._pendingTranslations) window._pendingTranslations = new Map();
            if (!window._translationAbort) window._translationAbort = new Map();

            var cacheKey = msg.text + '|' + targetLang + '|' + (useAuto ? 'auto' : 'en');
            var cached = window._translationCache.get(cacheKey);
            if (cached) {
              div.textContent = '🌐 ' + cached;
              return;
            }

            // Check if a request for the same text+lang is already in flight
            var pending = window._pendingTranslations.get(cacheKey);
            if (pending) {
              pending.then(function(result) {
                if (div && div.parentNode) div.textContent = '🌐 ' + result;
              }).catch(function() {
                if (div && div.parentNode) div.textContent = 'Translation failed';
              });
              return;
            }

            var abortController = new AbortController();
            window._translationAbort.set(cacheKey, abortController);

            function showError(sourceUsed) {
              if (!div || !div.parentNode) return;
              div.innerHTML = '<span>Translation failed</span>' +
                ' <span class="translate-retry" data-cachekey="' + cacheKey.replace(/"/g, '&quot;') + '" data-source="' + sourceUsed + '" data-msgid="' + msgId + '" style="cursor:pointer;text-decoration:underline;color:var(--accent-primary);margin-left:4px;">Retry</span>';
              var retryEl = div.querySelector('.translate-retry');
              if (retryEl) {
                retryEl.addEventListener('click', function(ev) {
                  ev.stopPropagation();
                  var src = retryEl.getAttribute('data-source');
                  var ckey = retryEl.getAttribute('data-cachekey');
                  window._translationCache.delete(ckey);
                  window._pendingTranslations.delete(ckey);
                  if (div && div.parentNode) {
                    div.textContent = 'Translating...';
                    tryTranslate(src, true);
                  }
                });
              }
            }

            function tryTranslate(source, isRetry) {
              var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(msg.text) + '&langpair=' + source + '|' + targetLang;
              var signal = abortController.signal;
              var fetchPromise = fetch(url, { signal: signal }).then(function(r) { return r.json(); }).then(function(data) {
                if (data && data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
                  window._translationCache.set(cacheKey, data.responseData.translatedText);
                  if (div && div.parentNode) div.textContent = '🌐 ' + data.responseData.translatedText;
                } else if (source === 'auto' && !isRetry) {
                  return tryTranslate('en', false);
                } else {
                  showError(source);
                }
              }).catch(function(err) {
                if (err && err.name === 'AbortError') return;
                if (source === 'auto' && !isRetry) {
                  return tryTranslate('en', false);
                } else {
                  showError(source);
                }
              });
              window._pendingTranslations.set(cacheKey, fetchPromise);
              fetchPromise.finally(function() {
                window._pendingTranslations.delete(cacheKey);
                window._translationAbort.delete(cacheKey);
              });
              return fetchPromise;
            }

            tryTranslate(useAuto ? 'auto' : 'en', false);
          }
        }
        return;
      }
      
      // Forward
      var forwardBtn = e.target.closest('.msg-forward-btn');
      if (forwardBtn) {
        e.stopPropagation();
        self.showForwardModal(forwardBtn.getAttribute('data-msg-id'));
        return;
      }

      // Pinned messages bar
      var btnUnpinAll = e.target.closest('#btn-unpin-all');
      if (btnUnpinAll) {
        var chatId = window.store.getState().activeChatId;
        var pinnedMsgs = window.store.getPinnedMessages(chatId);
        pinnedMsgs.forEach(function(p) {
          window.store.sendUnpinMessage(chatId, p.msgId);
        });
        return;
      }
      // Click pinned message text to jump to it
      var pinnedText = e.target.closest('#pinned-messages-text');
      if (pinnedText) {
        var chatId = window.store.getState().activeChatId;
        var pinnedMsgs = window.store.getPinnedMessages(chatId);
        if (pinnedMsgs.length > 0) {
          var msgId = pinnedMsgs[0].msgId;
          setTimeout(function() {
            var el = document.querySelector('[data-msg-id="' + msgId + '"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
        return;
      }

      function broadcastToChat(chatId, type, payload) {
        var s = window.store.getState();
        var g = s.groups.find(function(g) { return g.groupId === chatId; });
        if (g) {
          payload.chatId = chatId;
          (g.members || []).forEach(function(m) {
            if (m.userId !== s.currentUser.userId) {
              window.orbitAPI.networkSend(m.userId, m.ip || '', type, payload);
            }
          });
        } else {
          var friend = s.friends.find(function(f) { return f.userId === chatId; });
          if (friend) {
            window.orbitAPI.networkSend(chatId, friend.ip || '', type, payload);
          }
        }
      }
      
      // Delete
      var deleteBtn = e.target.closest('.msg-delete-btn');
      if (deleteBtn) {
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Delete Message',
            message: 'Are you sure you want to delete this message? This action cannot be undone.',
            confirmText: 'Delete',
            danger: true,
            onConfirm: function() {
              var msgId = deleteBtn.getAttribute('data-msg-id');
              var isMine = deleteBtn.getAttribute('data-is-mine') === '1';
              var state = window.store.getState();
              var activeChatId = state.activeChatId;
              
              if (isMine && window.orbitAPI && activeChatId !== 'local-echo') {
                broadcastToChat(activeChatId, window.Protocol.Types.MESSAGE_DELETE, { msgId: msgId });
              }
              window.store.deleteMessage(activeChatId, msgId);
            }
          });
        }
        return;
      }
      
      // File remove in preview area
      var removeBtn = e.target.closest('.btn-remove-file');
      if (removeBtn) {
        const idx = parseInt(removeBtn.getAttribute('data-index'));
        const removed = self.stagedFiles.splice(idx, 1)[0];
        if (removed && removed.url) URL.revokeObjectURL(removed.url);
        self.renderPreviewArea();
        return;
      }

      // Attachment delete
      var attDeleteBtn = e.target.closest('.att-delete-btn');
      if (attDeleteBtn) {
        e.stopPropagation();
        if (window.ConfirmModal) {
          window.ConfirmModal.show({
            title: 'Delete Attachment',
            message: 'Are you sure you want to delete this attachment locally?',
            confirmText: 'Delete',
            danger: true,
            onConfirm: function() {
              var attId = attDeleteBtn.getAttribute('data-att-id');
              var msgId = attDeleteBtn.getAttribute('data-msg-id');
              if (window.orbitAPI) window.orbitAPI.dbDeleteAttachment(attId);
              
              var state = window.store.getState();
              var activeChatId = state.activeChatId;
              var msgList = state.messages[activeChatId] || [];
              var msg = msgList.find(function(m) { return m.id == msgId; });
              if (msg && msg.attachments) {
                msg.attachments = msg.attachments.filter(function(a) { return String(a.id) !== String(attId); });
                window.store.setState({ messages: state.messages });
              }
            }
          });
        }
        return;
      }
      
      // Invite code chip click
      var inviteChip = e.target.closest('[data-invite-code]');
      if (inviteChip) {
        e.stopPropagation();
        var code = inviteChip.getAttribute('data-invite-code');
        if (code && window.SidebarMiddle) window.SidebarMiddle.showCreateGroupModal(code);
        return;
      }
      
      // Reply preview click — scroll to original message
      var replyPreview = e.target.closest('[data-reply-msg-id]');
      if (replyPreview) {
        var targetId = replyPreview.getAttribute('data-reply-msg-id');
        if (targetId) {
          var el = document.querySelector('[data-msg-id="' + targetId.replace(/"/g, '') + '"].message-row');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      
      // Thread chip click — open the thread panel
      var threadChip = e.target.closest('.msg-thread-chip');
      if (threadChip) {
        var threadMsgId = threadChip.getAttribute('data-thread-msg-id');
        if (threadMsgId) {
          var st = window.store.getState();
          self.showThreadPanel(st.activeChatId, threadMsgId);
        }
        return;
      }
      
      // Image attachment click — open in viewer
      var imageDiv = e.target.closest('[data-open-image]');
      if (!imageDiv) {
        var imgs = document.querySelectorAll('[data-open-image]');
        for (var i = 0; i < imgs.length; i++) {
          var r = imgs[i].getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            imageDiv = imgs[i];
            break;
          }
        }
      }
      if (imageDiv) {
        e.stopPropagation();
        var attId = imageDiv.getAttribute('data-open-image');
        var msgId = imageDiv.getAttribute('data-msg-id');
        if (window.ImageViewer) window.ImageViewer.openFromMessage(msgId, attId);
        return;
      }

      // Reaction pill toggle
      var pill = e.target.closest('.reaction-pill');
      if (pill) {
        e.stopPropagation();
        var msgId = pill.getAttribute('data-msg-id');
        var emoji = pill.getAttribute('data-emoji');
        var state = window.store.getState();
        var chatId = state.activeChatId;
        var msg = (state.messages[chatId] || []).find(function(m) { return String(m.id) === msgId; });
        if (!msg) return;
        var hasReacted = msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === state.currentUser.userId; });
        window.store.sendReaction(chatId, msgId, emoji, hasReacted ? 'remove' : 'add');
        return;
      }

      // Header avatar click
      var headerAvatar = e.target.closest('.chat-header-avatar');
      if (headerAvatar) {
        e.stopPropagation();
        var state = window.store.getState();
        var activeFriend = state.friends.find(function(f) { return f.userId === state.activeChatId; });
        if (activeFriend && window.ProfileSidebar) window.ProfileSidebar.open(activeFriend);
        return;
      }

      // Cancel transfer
      var cancelBtn = e.target.closest('.btn-cancel-transfer');
      if (cancelBtn) {
        var fid = cancelBtn.getAttribute('data-file-id');
        if (window.orbitAPI && window.orbitAPI.cancelTransfer) {
          window.orbitAPI.cancelTransfer(fid);
        }
        var cp = { ...window.store.getState().transferProgress };
        delete cp[fid];
        window.store.setState({ transferProgress: cp });
        return;
      }

      // Dismiss error
      var dismissBtn = e.target.closest('.btn-dismiss-error');
      if (dismissBtn) {
        e.preventDefault();
        e.stopPropagation();
        var fid = dismissBtn.getAttribute('data-file-id');
        var errs = { ...window.store.getState().transferErrors };
        delete errs[fid];
        window.store.setState({ transferErrors: errs });
        return;
      }

      // Per-message avatar click → open ProfileSidebar
      var avatarEl = e.target.closest('.msg-avatar');
      if (avatarEl) {
        var userId = avatarEl.getAttribute('data-user-id');
        if (!userId) return;
        var state = window.store.getState();
        var user = state.friends.find(function(f) { return f.userId === userId; });
        if (!user) {
          var group = state.groups.find(function(g) { return g.groupId === state.activeChatId; });
          if (group) {
            user = group.members.find(function(m) { return m.userId === userId; });
          }
        }
        if (userId === state.currentUser.userId) {
          user = state.currentUser;
        }
        if (user && window.ProfileSidebar) window.ProfileSidebar.open(user);
        return;
      }
    });
    // Context menu delegation for message bubbles
    this.container.addEventListener('contextmenu', function(e) {
      var bubble = e.target.closest('.message-bubble');
      if (!bubble || !window.ContextMenu) return;
      e.preventDefault();
      var msgId = bubble.getAttribute('data-msg-id');
      var state = window.store.getState();
      var msgs = state.messages[state.activeChatId] || [];
      var msg = msgs.find(function(m) { return m.id == msgId; });
      if (!msg) return;
      var isMine = msg.sender === state.currentUser.userId;
      var items = [
        { label: 'Reply', action: 'reply', icon: 'corner-up-left', onClick: function() {
          var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
          self.replyingTo = { id: msg.id, text: msg.text, senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User'), attachments: msg.attachments || null };
          self.editingMsg = null;
          var input = document.getElementById('chat-input');
          if (input) input.focus();
          window.store.notify();
        } },
        { label: 'Copy Text', action: 'copy', icon: 'copy', onClick: function() {
          var text = msg.text || '';
          if (window.orbitAPI && window.orbitAPI.writeClipboard) {
            window.orbitAPI.writeClipboard(text);
          } else {
            navigator.clipboard.writeText(text).catch(function(e) { console.warn('Clipboard write failed', e); });
          }
        } },
        { label: 'Forward', action: 'forward', icon: 'send', onClick: function() {
          self.showForwardModal(msg.id);
        } },
      ];
      var hasReplies = msgs.some(function(m) { return m.replyTo != null && String(m.replyTo) === String(msg.id); });
      if (msg.replyTo || hasReplies) {
        items.push({ label: 'View thread', action: 'thread', icon: 'list-tree', onClick: function() {
          self.showThreadPanel(state.activeChatId, msg.id);
        } });
      }
      var pinnedMsgs = window.store.getPinnedMessages(state.activeChatId);
      var isPinned = pinnedMsgs.some(function(p) { return String(p.msgId) === String(msg.id); });
      if (isPinned) {
        items.push({ label: 'Unpin Message', action: 'unpin', icon: 'pin-off', onClick: function() {
          window.store.sendUnpinMessage(state.activeChatId, msg.id);
        } });
      } else {
        items.push({ label: 'Pin Message', action: 'pin', icon: 'pin', onClick: function() {
          window.store.sendPinMessage(state.activeChatId, msg.id);
        } });
      }
      if (!isMine) {
        var isBlocked = window.store.isUserBlocked(msg.sender);
        items.push('separator');
        items.push({ label: isBlocked ? 'Unblock User' : 'Block User', action: isBlocked ? 'unblock' : 'block', icon: isBlocked ? 'user-check' : 'ban', color: isBlocked ? 'var(--accent-success)' : 'var(--accent-danger)', onClick: function() {
          if (isBlocked) {
            window.store.unblockUser(msg.sender);
          } else {
            window.store.blockUser(msg.sender);
          }
        } });
      }
      if (isMine) {
        items.push('separator');
        items.push({ label: 'Edit Message', action: 'edit', icon: 'edit-2', onClick: function() {
          var state = window.store.getState();
          var msgs = state.messages[state.activeChatId] || [];
          var targetMsg = msgs.find(function(m) { return m.id == msg.id; });
          if (targetMsg) {
            self.editingMsg = { id: targetMsg.id, chatId: state.activeChatId, text: targetMsg.text };
            self.replyingTo = null;
            var inp = document.getElementById('chat-input');
            if (inp) { inp.value = targetMsg.text; inp.focus(); }
            window.store.notify();
          }
        } });
        items.push({ label: 'Delete Message', action: 'delete', icon: 'trash-2', color: 'var(--accent-danger)', onClick: function() { 
          window.store.deleteMessage(state.activeChatId, msg.id);
        } });
      }
      if (window.ContextMenu.show) window.ContextMenu.show(e.clientX, e.clientY, items);
    });
  },

  render() {
    // Don't show the empty state if we're not in DMs mode
    const state = window.store.getState();
    if (state.activeTab !== 'dms') {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    this.container.innerHTML = `
      <!-- Initial Empty State. The feature slides render in here (shared/ui/welcome-slides.js):
           the third panel is the first thing you see on a cold start, so it is the
           honest place to explain what Orbit does. -->
      <div id="chat-welcome-host" style="flex:1; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;"></div>
    `;
    if (window.OrbitWelcome) {
      window.OrbitWelcome.render(document.getElementById('chat-welcome-host'));
    }
    lucide.createIcons({ root: this.container });
  },

  // Left-hand side of the chat header: avatar (with profile frame), name and
  // presence line. Split out of renderChat so a *friends-only* store change can
  // repaint just this strip. That case matters: peer presence and a peer's
  // profile frame both arrive via `setState({ friends })` (addOrUpdatePeer), and
  // re-running renderChat for it would rebuild the whole message feed and
  // force-scroll it to the bottom mid-read.
  _buildHeaderStrip(state) {
    var activeGroup = state.groups.find(function(g) { return g.groupId === state.activeChatId; });
    var activeFriend = state.friends.find(function(f) { return f.userId === state.activeChatId; });

    if (activeGroup) {
      var memberCount = (activeGroup.members || []).length;
      var groupHeaderAvatar;
      if (activeGroup.avatarPath) {
        groupHeaderAvatar = '<img src="orbit-avatar://' + window.Sanitize.escapeHtml(activeGroup.groupId) + '?t=' + (activeGroup.avatarUpdatedAt || 0) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">';
      } else if (activeGroup.avatarDataUrl) {
        // This branch was missing entirely — a group whose avatar is a data URL
        // (e.g. set at creation) fell through to the initial letter.
        groupHeaderAvatar = '<img src="' + window.Sanitize.escapeHtml(activeGroup.avatarDataUrl) + '" style="width:40px;height:40px;border-radius:12px;object-fit:cover;">';
      } else if (window.OrbitGroupAvatar) {
        groupHeaderAvatar = window.OrbitGroupAvatar.html(activeGroup.members || [], 40, 'var(--bg-surface)');
      } else {
        groupHeaderAvatar = '<div style="display:flex;align-items:center;justify-content:center;background:var(--accent-primary);border-radius:12px;width:40px;height:40px;font-weight:700;color:white;font-size:16px;">' + window.Sanitize.escapeHtml((activeGroup.groupName || 'G').charAt(0).toUpperCase()) + '</div>';
      }
      return '<div class="avatar avatar-md" style="margin-right: var(--spacing-md); display:flex; align-items: center; justify-content: center;">' +
          groupHeaderAvatar +
        '</div>' +
        '<div style="flex:1;">' +
          '<div style="font-weight: 600; font-family: var(--font-display); font-size: 16px;">' + window.Sanitize.escapeHtml(activeGroup.groupName) + '</div>' +
          '<div id="group-member-count" style="font-size: 12px; color: var(--text-muted); cursor:pointer;">' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</div>' +
        '</div>';
    }

    if (!activeFriend) return '';

    // ⚠ Reads the shared presence palette (styles/variables.css) rather than the
    // raw accents, so the chat header and the profile sidebar cannot disagree about
    // what "online" looks like. They did: this map was right and the profile's was a
    // hardcoded copy.
    var statusColors = { online: 'var(--presence-online)', away: 'var(--presence-away)', busy: 'var(--presence-busy)', dnd: 'var(--presence-busy)', offline: 'var(--presence-offline)', invisible: 'var(--presence-offline)' };
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
    var friendStatus = activeFriend.status || 'offline';
    var statusColor = statusColors[friendStatus] || 'var(--text-muted)';
    var statusLabel = statusLabels[friendStatus] || 'Offline';
    var lastSeenText = '';
    if (friendStatus === 'offline' && activeFriend.lastSeen) {
      var lastSeenStr = window.Format.relativeTime ? window.Format.relativeTime(new Date(activeFriend.lastSeen).toISOString()) : '';
      lastSeenText = lastSeenStr ? ' · Last seen ' + lastSeenStr : '';
    }

    // Profile frame — same overlay pattern as the chat list / message avatars.
    // The frame sits at -14%/122% so it bleeds slightly outside the 36px avatar
    // circle; `.avatar` has no overflow:hidden, so it is not clipped.
    var headerFrame = window.Frames ? window.Frames.getFrameForUser(activeFriend.userId) : 0;
    var headerAvatarInner = activeFriend.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(activeFriend.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
      : '<i data-lucide="user-round"></i>';
    var headerAvatarContainer = '<div style="position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' +
      headerAvatarInner +
      (headerFrame ? '<img src="icons/frames/pfp_frame_' + headerFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') +
    '</div>';

    return '<div class="avatar avatar-md chat-header-avatar" style="margin-right: var(--spacing-md); position:relative; cursor:pointer;">' +
        headerAvatarContainer +
        window.OrbitPresence.badge(friendStatus) +
      '</div>' +
      '<div style="flex:1;">' +
        '<div style="font-weight: 600; font-family: var(--font-display); font-size: 16px;">' + window.Sanitize.escapeHtml(activeFriend.username) + '</div>' +
        '<div style="font-size: 12px; color: ' + statusColor + '; display:flex; align-items:center; gap:4px;">' +
          window.OrbitPresence.glyph(friendStatus, 11) + ' ' + window.Sanitize.escapeHtml(statusLabel) + window.Sanitize.escapeHtml(lastSeenText) +
        '</div>' +
      '</div>';
  },

  // Repaint only #chat-header-strip, leaving the header's action buttons (and
  // their listeners) untouched. Safe to swap innerHTML: the header avatar click
  // is delegated from the container.
  _refreshHeaderStrip(state) {
    var strip = document.getElementById('chat-header-strip');
    if (!strip) return;
    strip.innerHTML = this._buildHeaderStrip(state || window.store.getState());
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons({ root: strip }); } catch (e) { /* non-fatal */ }
    }
  },

  renderChat(state) {
    if (state.activeTab !== 'dms') {
      this.container.style.display = 'none';
      return;
    }

    if (!state.activeChatId) {
      this.render();
      return;
    }

    const activeFriend = state.friends.find(f => f.userId === state.activeChatId);
    const activeGroup = state.groups.find(g => g.groupId === state.activeChatId);
    const isGroup = !!activeGroup;
    const activeName = isGroup ? activeGroup.groupName : (activeFriend ? activeFriend.username : 'Chat');
    if (!activeFriend && !isGroup) return;

    const messages = state.messages[state.activeChatId] || [];
    const myId = state.currentUser.userId;

    // Thread map for this render pass: msgById (String keys) + replyMap (parentId -> direct replies),
    // plus threadCounts (rootId -> total messages in the chain, incl. nested replies).
    // Keys are always String() since own message ids are strings and incoming ones are numeric.
    var msgById = {};
    var replyMap = {};
    for (var _im = 0; _im < messages.length; _im++) {
      msgById[String(messages[_im].id)] = messages[_im];
      if (messages[_im].replyTo != null) {
        var _pid = String(messages[_im].replyTo);
        if (!replyMap[_pid]) replyMap[_pid] = [];
        replyMap[_pid].push(messages[_im]);
      }
    }
    var threadCounts = {};
    for (var _cm = 0; _cm < messages.length; _cm++) {
      if (messages[_cm].replyTo == null) continue;
      var _cur = messages[_cm];
      var _seen = {};
      while (_cur && _cur.replyTo != null && !_seen[String(_cur.id)]) {
        _seen[String(_cur.id)] = true;
        _cur = msgById[String(_cur.replyTo)] || null;
      }
      if (_cur && _cur.replyTo == null) {
        var _rootId = String(_cur.id);
        threadCounts[_rootId] = (threadCounts[_rootId] || 0) + 1;
      }
    }

    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';

    let messagesHtml = '';

    // Find last read message index for unread divider
    const lastReadId = state.lastReadIds && state.lastReadIds[state.activeChatId];
    let lastReadIdx = -1;
    if (lastReadId) {
      lastReadIdx = messages.findIndex(function(m) { return String(m.id) === String(lastReadId); });
    }
    let hasUnreadInFeed = false;

    // Snapshot existing message IDs from current DOM before re-render
    // so we can apply entry animation only to genuinely new messages
    var existingMsgIds = {};
    var _existingRows = (this.container || document.getElementById('chat-message-feed')).querySelectorAll('.message-row');
    for (var _ei = 0; _ei < _existingRows.length; _ei++) {
      var _eid = _existingRows[_ei].getAttribute('data-msg-id');
      if (_eid) existingMsgIds[_eid] = true;
    }

    for (var mi = 0; mi < messages.length; mi++) {
      var msg = messages[mi];
      var _animAttr = existingMsgIds[msg.id] ? '' : ' data-msg-anim="slide"';

      // Insert unread divider before the first unread message
      if (lastReadIdx >= 0 && mi === lastReadIdx + 1) {
        hasUnreadInFeed = true;
        messagesHtml += '<div class="unread-divider" style="display:flex;align-items:center;gap:12px;margin:16px 0;position:relative;">' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Unread Messages</span>' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
        '</div>';
      }
      // If no lastReadId but there are messages with unread counts, show divider at start
      if (lastReadIdx < 0 && mi === 0 && state.unreadCounts[state.activeChatId] && messages.length > 0) {
        hasUnreadInFeed = true;
        messagesHtml += '<div class="unread-divider" style="display:flex;align-items:center;gap:12px;margin:16px 0;position:relative;">' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
          '<span style="font-size:11px;font-weight:700;color:var(--accent-primary);text-transform:uppercase;letter-spacing:0.5px;">Unread Messages</span>' +
          '<div style="flex:1;height:1px;background:var(--accent-primary);opacity:0.3;"></div>' +
        '</div>';
      }

      const isMine = msg.sender === myId;
      const timeStr = window.Format.absoluteTime(msg.timestamp).split(' · ')[0];
      var sanitizedText = window.Sanitize.markdown(msg.text);
      // A finished call is stored as a message with a `call` object instead of
      // text (see window.OrbitCallLog). Render the call card and drop the empty
      // text wrapper so the bubble contains only the card.
      var callLogHtml = (msg.call && window.OrbitCallLog)
        ? window.OrbitCallLog.render(msg)
        : '';
      var textWrapHtml = (callLogHtml && !sanitizedText)
        ? ''
        : '<div class="msg-text">' + sanitizedText + '</div>';
      // Make known invite codes clickable
      if (sanitizedText && state.groups) {
        state.groups.forEach(function(g) {
          if (g.inviteCode && sanitizedText.indexOf(g.inviteCode) !== -1) {
            var groupName = window.Sanitize.escapeHtml(g.groupName || 'Group');
            sanitizedText = sanitizedText.split(g.inviteCode).join(
              '<span data-invite-code="' + window.Sanitize.escapeHtml(g.inviteCode) + '" style="display:inline-flex;align-items:center;gap:6px;background:var(--bg-hover);border-radius:6px;padding:2px 8px;font-family:var(--font-mono);font-size:12px;cursor:pointer;border:1px solid var(--border-subtle);color:var(--accent-primary);" title="Click to join ' + groupName + '">' + window.Sanitize.escapeHtml(g.inviteCode) + ' <span style="font-size:10px;background:var(--accent-primary);color:white;border-radius:4px;padding:1px 5px;font-family:var(--font-ui);">Join</span></span>'
            );
          }
        });
      }
      const editedBadge = msg.edited ? '<span style="font-size:11px;color:rgba(255,255,255,0.5);margin-left:6px;">(edited)</span>' : '';
      const editedBadgeOther = msg.edited ? '<span style="font-size:11px;color:var(--text-muted);margin-left:6px;">(edited)</span>' : '';

      // Reactions display
      let reactionsHtml = '';
      if (msg.reactions && msg.reactions.length > 0) {
        const grouped = {};
        msg.reactions.forEach(r => {
          if (!grouped[r.emoji]) grouped[r.emoji] = [];
          grouped[r.emoji].push(r.userId);
        });
        const entries = Object.entries(grouped);
        // ⚠ THE LOOK IS IN THE STYLESHEETS, NOT HERE. Every declaration used to be
        // inline on each pill — including a hardcoded `color: white` — which meant
        // the redesign could not restyle a control that sits inside the conversation
        // it redesigned. State is a class now: base in components.css so classic
        // looks the same, deltas in the layer.
        reactionsHtml = '<div class="reactions-row">';
        entries.forEach(([emoji, users]) => {
          const userMention = users.length <= 2 ? users.map(u => u === myId ? 'You' : u.substring(0, 6)).join(', ') : users.length + ' people';
          const hasReacted = users.includes(myId);
          reactionsHtml += '<div class="reaction-pill' + (hasReacted ? ' is-mine' : '') + '" data-msg-id="' + msg.id + '" data-emoji="' + window.Sanitize.escapeHtml(emoji) + '" data-debug="Reaction: ' + window.Sanitize.escapeHtml(emoji) + ' (' + users.length + ')" title="' + window.Sanitize.escapeHtml(userMention) + '">' +
            '<span class="reaction-emoji">' + emoji + '</span>' +
            '<span class="reaction-count">' + users.length + '</span>' +
          '</div>';
        });
        reactionsHtml += '</div>';
      }

      // Reply quote
      let replyHtml = '';
      if (msg.replyTo) {
        const origMsg = messages.find(m => m.id == msg.replyTo);
        if (origMsg) {
          var replyPreview = (origMsg.text || '').substring(0, 60) + (origMsg.text && origMsg.text.length > 60 ? '...' : '');
          if (!replyPreview && origMsg.attachments && origMsg.attachments.length > 0) {
            replyPreview = '(' + origMsg.attachments[0].name + ')';
          } else if (!replyPreview) {
            replyPreview = '(Attachment)';
          }
          // activeFriend is undefined for group chats — resolve the reply
          // sender via the group roster instead of throwing on .username.
          let replyUser = 'Unknown';
          if (origMsg.sender === myId) {
            replyUser = 'You';
          } else if (activeFriend) {
            replyUser = window.Sanitize.escapeHtml(activeFriend.username);
          } else if (isGroup && activeGroup && activeGroup.members) {
            var senderMem = activeGroup.members.find(function(m) { return m.userId === origMsg.sender; });
            replyUser = senderMem && senderMem.username ? window.Sanitize.escapeHtml(senderMem.username) : 'Unknown';
          }
          replyHtml = '<div data-reply-msg-id="' + origMsg.id + '" style="font-size:12px;padding:6px 10px;margin-bottom:6px;border-left:3px solid rgba(255,255,255,0.3);border-radius:4px;background:rgba(0,0,0,0.1);color:rgba(255,255,255,0.7);cursor:pointer;">' +
            '<span style="font-weight:600;">' + replyUser + '</span> ' + window.Sanitize.escapeHtml(replyPreview) +
          '</div>';
        }
      }

      // Thread chip — shown below messages that have replies in their chain
      var threadCount = threadCounts[String(msg.id)] || 0;
      var threadChipHtml = threadCount > 0
        ? '<button class="msg-thread-chip" data-thread-msg-id="' + msg.id + '" title="View thread (' + threadCount + ' repl' + (threadCount > 1 ? 'ies' : 'y') + ')">' +
            '<i data-lucide="list-tree" style="width:13px;height:13px;"></i> ' + threadCount + ' repl' + (threadCount > 1 ? 'ies' : 'y') +
          '</button>'
        : '';

      let attachmentsHtml = '';
      if (msg.attachments && msg.attachments.length > 0) {
        // Determine uniform aspect ratio for image attachments
        var imageAtts = msg.attachments.filter(function(a) { return a.type === 'image'; });
        var imageAspectRatio = null;
        if (imageAtts.length > 0) {
          var allHaveDim = imageAtts.every(function(a) { return a.width && a.height; });
          if (!allHaveDim) {
            imageAspectRatio = 1;
          } else if (imageAtts.length === 1) {
            var a = imageAtts[0];
            imageAspectRatio = a.width / a.height;
          } else {
            var ratios = imageAtts.map(function(a) { return a.width / a.height; });
            var first = ratios[0];
            var allSame = ratios.every(function(r) { return Math.abs(r - first) < 0.01; });
            imageAspectRatio = allSame ? first : 1;
          }
        }

        var arStyle = imageAspectRatio ? 'aspect-ratio:' + imageAspectRatio + ';' : 'height:120px;';

        let gridHtml = '';
        let largeHtml = '';
        // The grid is the images and files; video and audio go below it whole.
        // Past four there is no tile to put one in — the fourth carries "+N".
        var _gridTotal = msg.attachments.filter(function (x) { return x.type !== 'video' && x.type !== 'audio'; }).length;
        var _gridSeen = 0;
        msg.attachments.forEach(att => {
          var _isGridCell = att.type !== 'video' && att.type !== 'audio';
          if (_isGridCell) { if (_gridSeen >= 4) return; _gridSeen++; }
          const safeAttId = window.Sanitize.escapeHtml(String(att.id || ''));
          const deleteBtn = '<button class="att-delete-btn" data-att-id="' + safeAttId + '" data-msg-id="' + msg.id + '" style="position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.6);border:none;color:white;cursor:pointer;align-items:center;justify-content:center;font-size:14px;line-height:1;z-index:2;" title="Delete">×</button>';
          if (att.type === 'video' || (att.mimeType && att.mimeType.startsWith('video/'))) {
            const safeUrl = window.Sanitize.escapeHtml(att.url);
            // Pass a known poster down to the player (mobile does the same). When
            // there is none, the player captures the first frame itself.
            const posterAttr = att._poster ? ' data-ovp-poster="' + window.Sanitize.escapeHtml(att._poster) + '"' : '';
            largeHtml += '<div class="att-thumb ovp-placeholder" data-ovp-url="' + safeUrl + '"' + posterAttr + ' data-msg-id="' + msg.id + '" style="position:relative;border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-hover); overflow: hidden; max-width:720px;">' +
              deleteBtn +
            '</div>';
          } else if (att.type === 'audio' || (att.mimeType && att.mimeType.startsWith('audio/'))) {
            const safeUrl = window.Sanitize.escapeHtml(att.url);
            largeHtml += '<div class="att-thumb oap-placeholder" data-oap-url="' + safeUrl + '" data-oap-name="' + window.Sanitize.escapeHtml(att.name || '') + '" style="position:relative;border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-hover); overflow: hidden; max-width:720px;">' +
              deleteBtn +
            '</div>';
          } else if (att.type === 'image') {
            if (state.settings.showImagePreviews !== false) {
              const safeUrl = window.Sanitize.escapeHtml(att.url);
              const safeName = window.Sanitize.escapeHtml(String(att.name || 'Image'));
              const safeSize = window.Sanitize.escapeHtml(String(att.size || 0));
              gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; overflow: hidden; ' + arStyle + ' border: 1px solid var(--border-subtle); cursor:pointer;" data-open-image="' + safeAttId + '" data-msg-id="' + msg.id + '">' + deleteBtn + '<img src="' + safeUrl + '" style="width: 100%; height: 100%; object-fit: cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')"></div>';
            } else {
              gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; height: 120px; border: 1px solid var(--border-subtle); display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,0.1); padding: 8px; text-align:center;">' +
                deleteBtn +
                '<i data-lucide="image" style="width:32px;height:32px;margin-bottom:8px;color:var(--text-muted);"></i>' +
                '<div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">' + window.Sanitize.escapeHtml(String(att.name || 'Image')) + '</div>' +
              '</div>';
            }
          } else {
            gridHtml += '<div class="att-thumb" style="position:relative;border-radius: 8px; height: 120px; border: 1px solid var(--border-subtle); display:flex; flex-direction:column; align-items:center; justify-content:center; background: rgba(0,0,0,0.1); padding: 8px; text-align:center;">' +
              deleteBtn +
              '<i data-lucide="' + this.getFileIconLucide(this.getFileIcon(att.name, att.mimeType || '')) + '" style="width:32px;height:32px;margin-bottom:8px;color:var(--text-muted);"></i>' +
              '<div style="font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">' + window.Sanitize.escapeHtml(String(att.name || 'File')) + '</div>' +
            '</div>';
          }
        });
        if (_gridTotal > 4 && gridHtml) {
          // A string pass rather than a counter threaded through every branch
          // that can emit a cell.
          var _seen = 0;
          gridHtml = gridHtml.replace(/class="att-thumb/g, function (m2) {
            _seen++;
            return _seen === 4 ? 'class="att-thumb att-grid-more" data-more="+' + (_gridTotal - 4) + '"' : m2;
          });
        }
        // Discord's layouts are bucketed: 1, 2, 3, then 4 for everything larger.
        var _gridLayout = Math.min(_gridTotal, 4);
        var gridSection = gridHtml ? '<div class="att-grid" data-count="' + _gridLayout + '" data-total="' + _gridTotal + '" style="width: 100%; min-width: 250px; max-width: 280px;">' + gridHtml + '</div>' : '';
        // One wrapper, so the attachments can be styled as a group that sits
        // beside the bubble rather than inside it.
        attachmentsHtml = '<div class="msg-attachments">' +
          (gridSection ? gridSection + '<div style="height:8px;"></div>' : '') + largeHtml +
        '</div>';
      }

      // Hover action bar
      const actionBtns =
        '<button class="msg-action-btn msg-reply-btn" data-msg-id="' + msg.id + '" title="Reply"><i data-lucide="reply" style="width:16px;height:16px;"></i></button>' +
        '<button class="msg-action-btn msg-react-btn" data-msg-id="' + msg.id + '" data-msg-text="' + window.Sanitize.escapeHtml(msg.text || '').replace(/"/g, '&quot;') + '" title="React"><i data-lucide="smile-plus" style="width:16px;height:16px;"></i></button>' +
        '<button class="msg-action-btn msg-forward-btn" data-msg-id="' + msg.id + '" title="Forward"><i data-lucide="send" style="width:16px;height:16px;"></i></button>' +
        (isMine ? '<button class="msg-action-btn msg-edit-btn" data-msg-id="' + msg.id + '" title="Edit"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>' : '') +
        (state.settings.messageTranslate ? '<button class="msg-action-btn msg-translate-btn" data-msg-id="' + msg.id + '" title="Translate"><i data-lucide="languages" style="width:16px;height:16px;"></i></button>' : '') +
        '<button class="msg-action-btn msg-delete-btn" data-msg-id="' + msg.id + '" data-is-mine="' + (isMine ? '1' : '0') + '" title="Delete"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>';

      const actionsBar = '<div class="msg-actions-bar' + (isMine ? ' msg-actions-left' : ' msg-actions-right') + '">' + actionBtns + '</div>';


      // Link Preview detection
      let linkPreviewHtml = '';
      if (msg.text && window.store.getState().settings.showLinkPreviews !== false) {
        var urlMatch = msg.text.match(/(https?:\/\/[^\s]+)/);
        if (urlMatch) {
          var url = urlMatch[1];
          var domain = '';
          try { domain = new URL(url).hostname; } catch(e) { domain = url; }
          var dataUrl = window.Sanitize.escapeHtml(url);
          linkPreviewHtml = '<div class="link-preview' + (isMine ? ' link-preview-mine' : '') + '" data-url="' + dataUrl + '" data-og-loaded="false">' +
            '<div class="link-preview-img"><i data-lucide="link-2" style="width:20px;height:20px;"></i></div>' +
            '<div class="link-preview-body">' +
              '<div class="link-preview-title">' + window.Sanitize.escapeHtml(domain) + '</div>' +
              '<div class="link-preview-url">' + dataUrl + '</div>' +
            '</div>' +
          '</div>';
        }
      }

      var showAvatars = state.settings.showChatAvatars !== false;
      // A system line: no sender, no bubble, centred. It carries its own text, so it is
      // handled BEFORE the own/other split — neither branch can render it.
      //
      // ── Whether this message gets a bubble at all ──────────────────────────
      // The bubble is for TEXT. Attachments sit beside it now, so they no longer
      // decide — that is what put a frame around every photo. Matches the mobile.
      //
      // ⚠ This block has to sit AFTER every variable it reads, and it is here for
      // that reason. Written above `linkPreviewHtml` it threw `Cannot access
      // 'linkPreviewHtml' before initialization` — a `const` in the temporal dead
      // zone is a RUNTIME error, so `node --check` passes and every message fails
      // to render. The voice-recorder spec caught it; nothing else did.
      const _bubbleHasContent = !!(sanitizedText || replyHtml || callLogHtml || linkPreviewHtml);
      const bubblePadding = _bubbleHasContent ? 'padding: 10px 14px;' : 'padding: 0;';
      const bubbleBgMine = _bubbleHasContent ? 'background-color: var(--bg-surface); color: var(--text-primary); box-shadow: var(--shadow-sm);' : 'background: transparent;';
      const bubbleBgOther = _bubbleHasContent ? 'background-color: var(--bg-surface); box-shadow: var(--shadow-sm);' : 'background: transparent;';
      // Reactions straddle the bubble's bottom edge, so they need it to position
      // against. With no bubble they go in the group below instead — same rule as
      // the mobile, so the two platforms cannot drift.
      const _rxInside = _bubbleHasContent;
      // With no bubble the pills straddle the ATTACHMENT's bottom edge — the idea
      // is "straddle whatever the message IS". They have to go INSIDE
      // `.msg-attachments`: an absolutely-positioned element resolves against its
      // own ancestor chain, and `.msg-below` is a SIBLING of the attachment group,
      // so putting them there leaves them pinned to the row instead — detached,
      // and on the wrong side. Same rule as the mobile.
      if (!_rxInside && reactionsHtml && attachmentsHtml) {
        attachmentsHtml = attachmentsHtml.replace(/<\/div>$/, reactionsHtml + '</div>');
      }
      const _rxInBelow = !_rxInside && reactionsHtml && !attachmentsHtml ? reactionsHtml : '';

      // This loop is a `for`, so the exit is `continue`. I checked, because `return` here
      // would have ended the whole render and shown an empty feed, and `continue` inside a
      // forEach would not have parsed at all.
      if (msg.system) {
        messagesHtml += '<div class="message-row message-system" data-msg-id="' + msg.id + '"' +
          ' style="display:flex;justify-content:center;margin-bottom:var(--spacing-md);">' +
          '<span style="font-size:11px;color:var(--text-muted);background:var(--bg-hover);' +
            'padding:4px 12px;border-radius:999px;text-align:center;">' +
            window.Sanitize.escapeHtml(msg.text || '') +
          '</span>' +
        '</div>';
        continue;
      }

        if (isMine) {
        var myFrame = window.Frames.getFrameForUser(state.currentUser.userId);
        const myAvatarImg = state.currentUser.avatar
          ? '<img src="' + window.Sanitize.escapeHtml(state.currentUser.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">'
          : '<i data-lucide="user-round" style="width:14px;"></i>';
        var myAvatarContainer = '<div style="position:relative;display:inline-block;">' + myAvatarImg + (myFrame ? '<img src="icons/frames/pfp_frame_' + myFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        const senderName = '';
        // Check if message has been read
        var readReceipts = state.readReceipts || {};
        var chatReadReceipts = readReceipts[state.activeChatId] || {};
        var isRead = false;
        if (!isGroup) {
          isRead = Object.values(chatReadReceipts).some(function(lastId) { return String(msg.id) <= String(lastId); });
        }
        var readHtml = isRead ? '<span style="font-size:10px;color:var(--accent-primary);margin-left:4px;">✓✓</span>' : '';

        messagesHtml += '<div class="message-row message-own" data-msg-id="' + msg.id + '"' + _animAttr + ' data-debug="MsgID: ' + msg.id + ' Sender: ' + window.Sanitize.escapeHtml(msg.sender) + ' TS: ' + msg.timestamp + '" style="display:flex; margin-bottom: var(--spacing-md); flex-direction: row-reverse; align-items: flex-end;">' +
          '<div style="padding-bottom: 10px; display:' + (showAvatars ? 'flex' : 'none') + ';">' +
            '<div class="avatar avatar-sm msg-avatar" data-user-id="' + state.currentUser.userId + '" style="margin-left: var(--spacing-sm); flex-shrink: 0; cursor:pointer;">' + myAvatarContainer + '</div>' +
          '</div>' +
          '<div class="' + (msg.replyTo ? 'msg-threaded ' : '') + '" style="max-width: 65%; display:flex; flex-direction:column; align-items:flex-end;">' +
            senderName +
            (_bubbleHasContent ? '<div class="message-bubble' + (callLogHtml ? ' has-call-log' : '') + '" data-msg-id="' + msg.id + '" data-debug="Bubble: ' + msg.id + '" style="position:relative;' + bubbleBgMine + ' ' + bubblePadding + ' border-radius: 16px 16px 0 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;">' +
              '<div class="message-id" style="display:none;font-size:9px;font-family:monospace;color:rgba(255,255,255,0.4);margin-bottom:2px;">#' + String(msg.id).substring(0, 8) + '</div>' +
            actionsBar + replyHtml + textWrapHtml + callLogHtml + linkPreviewHtml + editedBadge +
            (_rxInside ? reactionsHtml : '') +
          '</div>' : '') +
          attachmentsHtml +
          (_rxInBelow ? '<div class="msg-below">' + _rxInBelow + '</div>' : '') +
          threadChipHtml +
          '<div class="msg-time" style="font-size: 12px; color: var(--text-muted); margin-top: 4px; align-self: flex-start; margin-left: 4px;">' + timeStr + readHtml + '</div>' +
          '</div>' +
        '</div>';
      } else {
        const sender = msg.sender === state.currentUser.userId ? state.currentUser : (isGroup ? null : activeFriend);
        let senderName = isGroup ? 'Unknown' : window.Sanitize.escapeHtml(activeFriend.username);
        let senderAvatar = isGroup ? null : (activeFriend.avatar || null);

        if (isGroup) {
          // Look up sender in group members
          const member = activeGroup.members.find(function(m) { return m.userId === msg.sender; });
          if (member) {
            senderName = window.Sanitize.escapeHtml(member.username);
            senderAvatar = member.avatar || null;
          } else {
            // Look up in friends list as fallback
            const friend = state.friends.find(function(f) { return f.userId === msg.sender; });
            if (friend) {
              senderName = window.Sanitize.escapeHtml(friend.username);
              senderAvatar = friend.avatar || null;
            }
          }
        }

        var senderFrame = window.Frames.getFrameForUser(msg.sender);
        var avatarImg = senderAvatar
          ? '<img src="' + window.Sanitize.escapeHtml(senderAvatar) + '" style="width:100%;height:100%;border-radius:50%;">'
          : '<i data-lucide="user-round" style="width:14px;"></i>';
        var otherAvatarContainer = '<div style="position:relative;display:inline-block;">' + avatarImg + (senderFrame ? '<img src="icons/frames/pfp_frame_' + senderFrame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') + '</div>';
        messagesHtml += '<div class="message-row" data-msg-id="' + msg.id + '"' + _animAttr + ' data-debug="MsgID: ' + msg.id + ' Sender: ' + window.Sanitize.escapeHtml(msg.sender) + ' TS: ' + msg.timestamp + '" style="display:flex; margin-bottom: var(--spacing-md);">' +
          '<div class="avatar avatar-sm msg-avatar" data-user-id="' + msg.sender + '" style="margin-right: var(--spacing-sm); margin-top: 4px; flex-shrink: 0; cursor:pointer;' + (showAvatars ? '' : 'display:none;') + '">' + otherAvatarContainer + '</div>' +
          '<div class="' + (msg.replyTo ? 'msg-threaded ' : '') + '" style="max-width: 65%; display:flex; flex-direction:column; align-items:flex-start;">' +
            '<div style="font-size: 11px; color: var(--text-secondary); font-weight: 500; margin-bottom: 2px; margin-left: 4px;">' + senderName + '</div>' +
            (_bubbleHasContent ? '<div class="message-bubble" data-msg-id="' + msg.id + '" data-debug="Bubble: ' + msg.id + '" style="position:relative;' + bubbleBgOther + ' ' + bubblePadding + ' border-radius: 0 16px 16px 16px; line-height: 1.4; font-size: 14px; cursor:context-menu; max-width: 100%;">' +
              '<div class="message-id" style="display:none;font-size:9px;font-family:monospace;color:var(--text-muted);margin-bottom:2px;">#' + String(msg.id).substring(0, 8) + '</div>' +
              actionsBar + replyHtml + textWrapHtml + callLogHtml + linkPreviewHtml + editedBadgeOther +
              (_rxInside ? reactionsHtml : '') +
            '</div>' : '') +
            attachmentsHtml +
            (_rxInBelow ? '<div class="msg-below">' + _rxInBelow + '</div>' : '') +
            threadChipHtml +
            '<div class="msg-time" style="font-size: 12px; color: var(--text-muted); margin-top: 4px; align-self: flex-end; margin-right: 4px;">' + timeStr + '</div>' +
          '</div>' +
        '</div>';
      }
    }

    // Show Jump to Unread button if there are unread messages
    if (hasUnreadInFeed || state.unreadCounts[state.activeChatId]) {
      hasUnreadInFeed = true;
    }

    // Empty state for chats with no messages
    if (!messagesHtml) {
      var isFirstMessageWithFriend = activeFriend && !isGroup && (!state.messages[state.activeChatId] || state.messages[state.activeChatId].length === 0);
      if (isFirstMessageWithFriend) {
        messagesHtml = window.OrbitEmpty.html({
          icon: 'message-circle',
          title: 'No messages yet',
          hint: 'Send a message to start the conversation' +
            (activeFriend.username ? ' with ' + window.Sanitize.escapeHtml(activeFriend.username) : '') + '.',
          fill: true
        });
      } else if (isGroup) {
        messagesHtml = window.OrbitEmpty.html({
          icon: 'users-round',
          title: 'Welcome to ' + window.Sanitize.escapeHtml(activeGroup.groupName),
          hint: 'Send the first message to the group.',
          fill: true
        });
      }
    }

    // Header (see _buildHeaderStrip — shared with the friends-only refresh path)
    var headerHtml = this._buildHeaderStrip(state);

    // Inline progress — rendered inside the message feed
    var progressHtml = '';
    if (state.transferProgress && Object.keys(state.transferProgress).length > 0) {
      progressHtml = '<div class="transfer-progress-inline" style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">';
      Object.keys(state.transferProgress).forEach(function(fileId) {
        const prog = state.transferProgress[fileId];
        const pct = Math.max(0, Math.min(100, Math.floor((prog.received / prog.total) * 100)));
        let fileName, icon;
        if (prog.isSending) {
          fileName = prog.name || 'Sending file...';
          icon = 'upload-cloud';
        } else if (prog.progType === 'audio') {
          fileName = 'Receiving Audio...';
          icon = 'music';
        } else if (prog.progType === 'video') {
          fileName = 'Receiving Video...';
          icon = 'video';
        } else {
          fileName = prog.name || 'Receiving file...';
          icon = 'download-cloud';
        }
        progressHtml += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--border-subtle);box-shadow:var(--shadow-sm);">' +
          '<i data-lucide="' + icon + '" style="width:20px;height:20px;color:var(--accent-primary);flex-shrink:0;"></i>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary);margin-bottom:4px;">' +
              '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(fileName) + '</span>' +
              '<span style="flex-shrink:0;margin-left:8px;">' + pct + '%</span>' +
            '</div>' +
            '<div style="width:100%;height:6px;background:var(--bg-hover);border-radius:3px;overflow:hidden;">' +
              '<div style="height:100%;width:' + pct + '%;background:var(--accent-primary);transition:width 0.2s linear;border-radius:3px;"></div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-cancel-transfer" data-file-id="' + fileId + '" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;flex-shrink:0;" title="Cancel transfer">' +
            '<i data-lucide="x" style="width:16px;height:16px;"></i>' +
          '</button>' +
        '</div>';
      });
      progressHtml += '</div>';
    }

    // Transfer errors
    var errorsHtml = '';
    if (state.transferErrors && Object.keys(state.transferErrors).length > 0) {
      errorsHtml = '<div class="transfer-errors" style="display:flex;flex-direction:column;gap:8px;padding:4px 0;">';
      Object.keys(state.transferErrors).forEach(function(fileId) {
        const err = state.transferErrors[fileId];
        errorsHtml += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--accent-danger);box-shadow:var(--shadow-sm);">' +
          '<i data-lucide="alert-circle" style="width:20px;height:20px;color:var(--accent-danger);flex-shrink:0;"></i>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:12px;color:var(--accent-danger);font-weight:600;">Failed: ' + window.Sanitize.escapeHtml(err.name || 'file') + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);">' + window.Sanitize.escapeHtml(err.error) + '</div>' +
          '</div>' +
          '<button class="btn-dismiss-error" data-file-id="' + fileId + '" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;flex-shrink:0;" title="Dismiss">' +
            '<i data-lucide="x" style="width:16px;height:16px;"></i>' +
          '</button>' +
        '</div>';
      });
      errorsHtml += '</div>';
    }

    this.container.innerHTML =
      '<!-- Chat Header -->' +
      '<div class="chat-header" style="height: 64px; border-bottom: 1px solid var(--border-subtle); display:flex; align-items:center; padding: 0 var(--spacing-lg);">' +
        '<div id="chat-header-strip" style="display:flex;align-items:center;flex:1;min-width:0;">' +
        headerHtml +
        '</div>' +
        '<div style="display:flex; gap:16px; align-items:center; color: var(--text-secondary);">' +
          (state.settings && state.settings.privacyMode ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-warning);border-radius:3px;padding:2px 6px;text-transform:uppercase;">Privacy</span>' : '') +
          '<button id="btn-gallery" title="Image Gallery" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="image"></i></button>' +
          (isGroup ? '<button id="btn-group-info" title="Group Info" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="info"></i></button>' : '') +
          '<button id="btn-chat-more" title="More" style="background:transparent; border:none; cursor:pointer; color:inherit;"><i data-lucide="more-vertical"></i></button>' +
        '</div>' +
      '</div>' +
      // Pinned messages, on top of the conversation — under the header and above the
      // messages. (It went to the composer, then the right-hand panel; Dan meant the top
      // of the third panel.) One bar for DMs and groups alike; only the limit differs,
      // and the shared rules decide that from the chat type.
      '<!-- Pinned Messages Bar -->' +
      // A floating card, not a full-width strip: rounded, inset from the edges, with an
      // edge and a shadow, on a surface a step lighter than the chat behind it.
      '<div id="pinned-messages-bar" title="Click to jump to this message, right-click for the list" style="display:none;align-items:center;gap:8px;' +
        'padding:8px 12px;margin:8px var(--spacing-lg) 4px;border-radius:12px;' +
        'border:1px solid var(--border-subtle);background:var(--bg-hover);' +
        'box-shadow:var(--shadow-sm, 0 2px 10px rgba(0,0,0,0.28));' +
        'font-size:13px;color:var(--text-secondary);cursor:pointer;">' +
        '<i data-lucide="pin" style="width:14px;height:14px;flex-shrink:0;color:var(--accent-primary);"></i>' +
        '<span id="pinned-messages-text" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>' +
        '<span id="pinned-messages-count" style="flex-shrink:0;font-size:11px;color:var(--text-muted);"></span>' +
        '<button id="btn-show-all-pinned" style="background:none;border:none;cursor:pointer;color:var(--accent-primary);padding:2px 4px;font-size:11px;font-weight:600;">Show all</button>' +
        '<button id="btn-unpin-all" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;font-size:16px;line-height:1;" title="Unpin all">×</button>' +
      '</div>' +

      '<!-- Message Feed -->' +
      '<div class="message-feed" id="chat-message-feed" style="flex:1; overflow-y:auto; overflow-x:visible; padding: var(--spacing-lg);">' +
        messagesHtml + progressHtml + errorsHtml +
        '<div id="jump-to-unread" class="jump-to-latest" style="display:none;">' +
          '<span class="jump-latest-title">Jump to latest</span>' +
          '<button class="jump-latest-go" type="button" title="Jump to the latest messages">' +
            '<i data-lucide="arrow-down-to-line" style="width:16px;height:16px;"></i>' +
          '</button>' +
        '</div>' +
      '</div>';

    // Syntax-highlight code blocks — Prism is fetched on demand, and only when
    // the feed actually contains code. See shared/ui/code-highlight.js.
    if (window.OrbitCodeHighlight) {
      window.OrbitCodeHighlight.refresh(document.getElementById('chat-message-feed') || document);
    }
    // Wire up copy-code buttons
    setTimeout(function() {
      var feed = document.getElementById('chat-message-feed');
      if (!feed) return;
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

    // Reply/Edit preview bar
    let replyEditBar = '';
    if (this.replyingTo) {
      const rText = (this.replyingTo.text || '').substring(0, 80);
      var rFallback = '';
      if (!rText && this.replyingTo.attachments && this.replyingTo.attachments.length > 0) {
        rFallback = '(' + this.replyingTo.attachments[0].name + ')';
      } else if (!rText) {
        rFallback = '(Attachment)';
      }
      replyEditBar = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:var(--bg-hover);border:1px solid var(--border-subtle);font-size:13px;color:var(--text-secondary);">' +
        '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + window.Sanitize.escapeHtml(this.replyingTo.senderName || 'message') + '</b>: ' + window.Sanitize.escapeHtml(rText || rFallback) + '</span>' +
        '<button id="btn-cancel-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
      '</div>';
    } else if (this.editingMsg) {
      replyEditBar = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:rgba(255,170,0,0.1);border:1px solid rgba(255,170,0,0.3);font-size:13px;color:var(--text-secondary);">' +
        '<i data-lucide="pencil" style="width:14px;height:14px;flex-shrink:0;color:#ffaa00;"></i>' +
        '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Editing message</span>' +
        '<button id="btn-cancel-edit" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
      '</div>';
    }

    // Typing indicator placeholder (filled by listener)
    var typingHtml = '<div id="typing-indicator" style="display:none;align-items:center;gap:8px;padding:4px 12px;font-size:12px;color:var(--text-muted);">' +
        '<div class="typing-dots" style="display:flex;align-items:center;gap:2px;">' +
          '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>' +
        '</div>' +
        '<span id="typing-text"></span>' +
      '</div>';

    this.container.insertAdjacentHTML('beforeend',
      '<!-- Chat Input -->' +
      '<div class="chat-input-area" style="padding: var(--spacing-md) var(--spacing-lg) 48px var(--spacing-lg); display: flex; flex-direction: column;">' +
        '<div id="file-preview-area" style="display:none; gap: 8px; padding: 12px; margin-bottom: 8px; overflow-x: auto; white-space: nowrap; border-radius: 16px; background: var(--bg-hover); border: 1px solid var(--border-subtle);"></div>' +
        replyEditBar +
        typingHtml +
        '<div class="chat-input-wrapper">' +
          '<button id="btn-plus" class="composer-plus" title="Attach"><i data-lucide="plus"></i></button>' +
          '<textarea id="chat-input" class="chat-input-field" placeholder="Message ' + window.Sanitize.escapeHtml(activeName) + '..." rows="1">' + (this.editingMsg ? window.Sanitize.escapeHtml(this.editingMsg.text) : '') + '</textarea>' +
          '<button id="btn-mic" title="Voice Memo (Click to start/stop)"><i data-lucide="mic"></i></button>' +
          '<button id="btn-emoji" class="composer-emoji"><i data-lucide="smile"></i></button>' +
          '<button id="btn-send" class="composer-send" title="Send"><i data-lucide="send-horizontal"></i></button>' +
          '<input type="file" id="file-input" style="display:none;" multiple>' +
        '</div>' +
      '</div>');

    lucide.createIcons({ root: this.container });

    if (window.freezeGifImages) window.freezeGifImages(this.container);

    // Link Preview OG fetch
    if (!window._linkPreviewCache) window._linkPreviewCache = {};
    var previews = this.container.querySelectorAll('.link-preview[data-og-loaded="false"]');
    previews.forEach(function(el) {
      var url = el.getAttribute('data-url');
      if (!url) return;
      if (window._linkPreviewCache[url]) {
        applyOgData(el, window._linkPreviewCache[url]);
        return;
      }
      if (window.orbitAPI && window.orbitAPI.invoke) {
        window.orbitAPI.invoke('fetch-og', url).then(function(og) {
          if (og && og.url) {
            window._linkPreviewCache[og.url] = og;
            applyOgData(el, og);
          }
        }).catch(function() {});
      }
    });

    // Pinned messages bar
    var pinnedBar = document.getElementById('pinned-messages-bar');
    var pinnedCountEl = document.getElementById('pinned-messages-count');
    if (pinnedBar) {
      var pinnedMsgs = window.store.getPinnedMessages(state.activeChatId);

      // The count and the two controls. onclick rather than addEventListener: this runs
      // on every render, and listeners would stack up on the same element.
      if (pinnedCountEl) {
        var _pinLimit = window.OrbitPinned
          ? window.OrbitPinned.limitFor(window.store._isGroupChat(state.activeChatId))
          : 0;
        pinnedCountEl.textContent = pinnedMsgs.length ? (pinnedMsgs.length + ' of ' + _pinLimit) : '';
      }
      var _showAllBtn = document.getElementById('btn-show-all-pinned');
      if (_showAllBtn) {
        _showAllBtn.onclick = function (e) {
          e.stopPropagation();
          if (window.PinnedModal) window.PinnedModal.show(window.store.getState().activeChatId);
        };
      }
      // Right-click the bar for the floating list at the cursor.
      pinnedBar.oncontextmenu = function (e) {
        e.preventDefault();
        if (window.PinnedMenu) window.PinnedMenu.showAt(e.clientX, e.clientY, window.store.getState().activeChatId);
      };
      if (pinnedMsgs.length > 0) {
        pinnedBar.style.display = 'flex';
        var textEl = document.getElementById('pinned-messages-text');
        if (textEl) {
          var labels = pinnedMsgs.map(function(p) {
            var preview = (p.text || '').substring(0, 50);
            return window.Sanitize.escapeHtml(preview);
          });
          if (labels.length === 1) {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '"';
          } else if (labels.length === 2) {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '" and "' + labels[1] + '"';
          } else {
            textEl.innerHTML = 'Pinned: "' + labels[0] + '", "' + labels[1] + '", and ' + (labels.length - 2) + ' more';
          }
        }
      } else {
        pinnedBar.style.display = 'none';
      }
    }

    // Inject message FX particles for own messages
    this._injectMessageParticles();

    // Auto scroll to bottom (or to a pending message from Activity Center / search)
    var feed = document.getElementById('chat-message-feed');
    if (feed) {
      var scrollMsgId = window._pendingActivityScrollMsgId;
      if (scrollMsgId) {
        var scrollEl = feed.querySelector('[data-msg-id="' + scrollMsgId + '"].message-row');
        if (scrollEl) {
          var feedRect = feed.getBoundingClientRect();
          var elRect = scrollEl.getBoundingClientRect();
          var offset = (elRect.top + elRect.height / 2) - (feedRect.top + feedRect.height / 2);
          feed.scrollTop += offset;
          window._pendingActivityScrollMsgId = null;
        }
      } else {
        feed.scrollTop = feed.scrollHeight;
      }
    }

    // Jump to latest. The same rule as mobile: it appears when you are scrolled up, and it
    // says something different when what you are looking at is genuinely old.
    //
    // This replaced an unread-divider check that only fired when there was an unread marker
    // below the fold, which meant the button was absent exactly when you had scrolled up in a
    // chat with nothing unread — the common case. The divider is still honoured for its own
    // wording, but the chip no longer depends on it.
    if (feed) {
      var jumpBtn = document.getElementById('jump-to-unread');
      if (jumpBtn) {
        feed.removeEventListener('scroll', this._jumpScrollHandler);
        this._jumpScrollHandler = function () {
          var behind = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
          if (behind < 140) { jumpBtn.style.display = 'none'; return; }

          // What you are READING: the middle of the visible area, not the top row — that is
          // the message you scrolled past, and using it made the chip cry "older messages"
          // while the user was looking at yesterday.
          var ageDays = null;
          var fr = feed.getBoundingClientRect();
          var probe = fr.top + fr.height / 2;
          var rows = feed.querySelectorAll('.message-row[data-msg-id]');
          var st = window.store ? window.store.getState() : null;
          var msgs = (st && st.messages && st.messages[st.activeChatId]) || [];
          for (var i = 0; i < rows.length; i++) {
            var r = rows[i].getBoundingClientRect();
            if (r.bottom >= probe) {
              var id = rows[i].getAttribute('data-msg-id');
              for (var j = 0; j < msgs.length; j++) {
                if (String(msgs[j].id) === String(id)) {
                  var _t = _msgTime(msgs[j].timestamp != null ? msgs[j].timestamp : msgs[j].time);
                  if (!isNaN(_t)) ageDays = (Date.now() - _t) / 86400000;
                  break;
                }
              }
              break;
            }
          }

          var title = jumpBtn.querySelector('.jump-latest-title');
          var divider = feed.querySelector('.unread-divider');
          var dividerBelow = false;
          if (divider) {
            var dr = divider.getBoundingClientRect();
            dividerBelow = dr.top > fr.bottom - 60;
          }
          if (dividerBelow) {
            jumpBtn.classList.remove('old');
            if (title) title.textContent = 'Jump to first unread';
          } else if (ageDays !== null && ageDays >= 7) {
            jumpBtn.classList.add('old');
            if (title) title.textContent = ageDays >= 60
              ? 'You\u2019re viewing messages from months ago'
              : 'You\u2019re viewing older messages';
          } else {
            jumpBtn.classList.remove('old');
            if (title) title.textContent = 'Jump to latest';
          }
          jumpBtn.style.display = 'flex';
        };
        feed.addEventListener('scroll', this._jumpScrollHandler);

        // The button did nothing: there was no click handler anywhere on it.
        if (!jumpBtn._jumpWired) {
          jumpBtn._jumpWired = true;
          jumpBtn.addEventListener('click', function () {
            var f = document.getElementById('chat-message-feed');
            if (f) f.scrollTo({ top: f.scrollHeight, behavior: 'smooth' });
            jumpBtn.style.display = 'none';
          });
        }

        // Initial check
        setTimeout(this._jumpScrollHandler, 100);
      }
    }

    // Set up ResizeObserver once to re-position on feed resize
    if (!this._messageActionsResizeObserver && typeof ResizeObserver !== 'undefined') {
      var self = this;
      this._messageActionsResizeObserver = new ResizeObserver(function() {
        if (window._performanceMode) return;
        var now = Date.now();
        if (self._lastMessageActionsRun && now - self._lastMessageActionsRun < 1000) return;
        if (self._messageActionsResizeTimer) clearTimeout(self._messageActionsResizeTimer);
        self._messageActionsResizeTimer = setTimeout(function() {
          self._positionMessageActions();
        }, 80);
      });
    }
    if (this._messageActionsResizeObserver) {
      var msgFeed = document.getElementById('chat-message-feed');
      if (msgFeed) this._messageActionsResizeObserver.observe(msgFeed);
    }

    if (!window._performanceMode) {
      requestAnimationFrame(function() {
        window.ChatPanel._positionMessageActions();
      });
    }

    // Attach local input events
    this.attachEvents();

    // ⚠ REBUILD THE STAGED-ATTACHMENT STRIP FROM `stagedFiles`.
    //
    // renderChat rebuilds the whole composer, including `#file-preview-area` —
    // which the template emits EMPTY and `display: none`. Nothing repopulated it,
    // so **any re-render while files were staged made the strip vanish**: the
    // files were still in `stagedFiles` and would still be sent, but they were
    // no longer on screen and could not be removed. It is not a rare path — the
    // local-echo chat posts its greeting a few seconds after boot, so it happened
    // on a plain cold start.
    //
    // Found by a spec that had been dismissed as flaky: it passed about half the
    // time, and the difference was only whether the assertion ran before or after
    // that greeting. The measured sequence was 3 tiles at t+0.5s, then `tiles: 0`
    // with `stagedFiles: 3` and the area hidden at t+4.5s.
    this.renderPreviewArea();

    // Initialize audio player visualizers
    if (window.OrbitAudioPlayer) window.OrbitAudioPlayer.init(this.container);
    if (window.OrbitVideoPlayer) window.OrbitVideoPlayer.init(this.container);
  },

  _positionMessageActions() {
    if (window._performanceMode) return;
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var bubbles = feed.querySelectorAll('.message-bubble');
    if (this._messageActionsResizeObserver) {
      try { this._messageActionsResizeObserver.disconnect(); } catch(e) {}
    }
    for (var i = 0; i < bubbles.length; i++) {
      var bubble = bubbles[i];
      var bar = bubble.querySelector('.msg-actions-bar');
      if (!bar) continue;
      var bubbleW = bubble.offsetWidth;
      var barW = bar.offsetWidth;
      var isCompact = barW > bubbleW - 4 || (bubbleW < 160 && !bubble.querySelector('.att-thumb'));
      bar.classList.remove('msg-actions-compact', 'msg-actions-wide');
      bar.classList.add(isCompact ? 'msg-actions-compact' : 'msg-actions-wide');
    }
    this._lastMessageActionsRun = Date.now();
    if (this._messageActionsResizeObserver && feed) {
      var f = feed;
      setTimeout(function() {
        try { window.ChatPanel._messageActionsResizeObserver.observe(f); } catch(e) {}
      }, 0);
    }
  },

  jumpToFirstUnread() {
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var divider = feed.querySelector('.unread-divider');
    if (divider) {
      divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      // Fallback: scroll to bottom
      feed.scrollTop = feed.scrollHeight;
    }
  },

  attachEvents() {
    var self = this;
    var input = document.getElementById('chat-input');

    // Typing indicator listener (register once)
    if (!this._typingListenerRegistered) {
      this._typingListenerRegistered = true;
      if (window.TypingState) {
        window.TypingState.onChange(function() {
          var el = document.getElementById('typing-indicator');
          var textEl = document.getElementById('typing-text');
          if (!el || !textEl) return;
          var chatId = window.store.getState().activeChatId;
          if (!chatId) { el.style.display = 'none'; return; }
          var users = window.TypingState.getUsers(chatId);
          if (users.length === 0) {
            el.style.display = 'none';
          } else {
            var names = users.map(function(u) { return window.Sanitize.escapeHtml(u.username); });
            textEl.textContent = names.length === 1 ? names[0] + ' is typing...' : names.join(', ') + ' are typing...';
            el.style.display = 'flex';
          }
        });
      }
    }

    if (input) {
      // Typing indicator — send typing packets
      var typingTimeout = null;
      var lastTypingSent = 0;
      var sendTyping = function(isTyping) {
        var state = window.store.getState();
        var chatId = state.activeChatId;
        if (!chatId || chatId === 'local-echo') return;
        var members = state.groups.find(function(g) { return g.groupId === chatId; });
        var recipients = members ? members.members : [state.friends.find(function(f) { return f.userId === chatId; })].filter(Boolean);
        var isGroup = !!members;
        recipients.forEach(function(r) {
          if (r.userId !== state.currentUser.userId) {
            var payload = { isTyping: isTyping, username: state.currentUser.username };
            if (isGroup) payload.groupId = chatId;
            window.orbitAPI.networkSend(r.userId, r.ip || '', window.Protocol.Types.TYPING, payload);
          }
        });
      };
      input.addEventListener('input', function() {
        // The send button lights up as soon as there is something to send.
        if (self._refreshSend) self._refreshSend();
        var now = Date.now();
        if (now - lastTypingSent > 2000) {
          lastTypingSent = now;
          sendTyping(true);
        }
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(function() {
          sendTyping(false);
          typingTimeout = null;
        }, 3000);
      });
      input.addEventListener('blur', function() {
        if (typingTimeout) {
          clearTimeout(typingTimeout);
          typingTimeout = null;
        }
        sendTyping(false);
      });

      input.addEventListener('keydown', async function(e) {
        var enterSends = window.store.getState().settings.enterToSend !== false;
        if (e.key === 'Enter' && (enterSends ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          // Clear typing indicator when sending
          if (typingTimeout) {
            clearTimeout(typingTimeout);
            typingTimeout = null;
          }
          sendTyping(false);
          var text = input.value.trim();
          if (text !== '' || self.stagedFiles.length > 0) {
            await self.sendMessage(text);
            input.value = '';
            input.style.height = 'auto';
          }
        }
      });

      // Auto-resize textarea as content grows
      input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 200) + 'px';
        // ---- Slash command suggestion tooltip (parity with mobile 9035-9039) ----
        var iv = this.value;
        if (iv.indexOf('/') === 0 && !iv.includes(' ')) {
          self.showSlashTooltip(iv);
        } else {
          self.hideSlashTooltip();
        }
        // Debounced draft save
        if (self._draftTimer) clearTimeout(self._draftTimer);
        self._draftTimer = setTimeout(function() {
          var chatId = window.store.getState().activeChatId;
          if (chatId) {
            var val = input.value.trim();
            if (val) {
              localStorage.setItem('orbit_draft_' + chatId, val);
            } else {
              localStorage.removeItem('orbit_draft_' + chatId);
            }
          }
        }, 300);
      });
    }

    var btnEmoji = document.getElementById('btn-emoji');
    if (btnEmoji && window.EmojiPicker) {
      // The picker owns open/close and closes itself on an outside click, so the button's lit
      // state follows the picker rather than our own click. Wrapping the two methods covers
      // every path in and out, including the ones we do not initiate.
      var _setEmojiIcon = function (open) {
        // Looked up fresh rather than closing over the render-time button: the composer is
        // re-rendered on chat switches, and the wrapper below is installed only once, so a
        // captured reference would point at a button that is no longer on screen.
        var b = document.getElementById('btn-emoji');
        if (!b) return;
        b.classList.toggle('active', !!open);
        // NOT filled. Filling lucide's smile fills its outer circle, so the icon becomes a solid
        // disc with no face in it — Dan: "its just a blue circle! i don't see any icon". The
        // lit state is the accent colour alone, which is what the send button does too.
        var icon = self._iconEl ? self._iconEl('smile', false) : null;
        if (!icon) return;
        var old = b.querySelector('svg, i');
        if (old) old.replaceWith(icon); else b.appendChild(icon);
        if (icon.tagName === 'I' && window.lucide) window.lucide.createIcons({ root: b });
      };
      if (!window.EmojiPicker._orbitWrapped) {
        window.EmojiPicker._orbitWrapped = true;
        var _origOpen = window.EmojiPicker.open;
        var _origClose = window.EmojiPicker.close;
        window.EmojiPicker.open = function () {
          var r = _origOpen.apply(this, arguments);
          _setEmojiIcon(true);
          return r;
        };
        window.EmojiPicker.close = function () {
          var r = _origClose.apply(this, arguments);
          _setEmojiIcon(false);
          return r;
        };
      }
      btnEmoji.addEventListener('click', function() {
        window.EmojiPicker.toggle(input);
      });
    }

    var btnSend = document.getElementById('btn-send');
    if (btnSend) {
      // Render the button's icon from scratch. lucide replaces the <i> with an inline <svg>,
      // so swapping the icon means putting a fresh <i> back and re-running it — and the fill
      // has to be set on the svg afterwards, because lucide writes fill="none" itself.
      // Build the icon node SYNCHRONOUSLY rather than going through lucide's createIcons pass.
      //
      // That pass is timing-sensitive in this app — the transfer strip keeps inline SVG for
      // exactly this reason, because its markup is rewritten on a poller. Here a rapid hover
      // in and out could leave a stale random glyph on the button, which the stress test
      // caught. createElement has no timing to lose.
      var _iconEl = function (name, filled) {
        var key = name.replace(/(^|-)([a-z])/g, function (m, p, c) { return c.toUpperCase(); });
        var icons = (window.lucide && window.lucide.icons) || null;
        var node = icons ? (icons[key] || icons[name]) : null;
        var svg = (node && window.lucide.createElement) ? window.lucide.createElement(node) : null;
        if (!svg) {
          // a build without createElement: fall back to the async pass
          var i = document.createElement('i');
          i.setAttribute('data-lucide', name);
          return i;
        }
        svg.setAttribute('class', 'lucide lucide-' + name);
        svg.setAttribute('data-lucide', name);
        svg.setAttribute('width', '24');
        svg.setAttribute('height', '24');
        svg.setAttribute('fill', filled ? 'currentColor' : 'none');
        return svg;
      };
      var _lastIconSwap = 0;
      var _setSendIcon = function (btn, name, filled) {
        if (!btn) return;
        var old = btn.querySelector('svg, i');
        var el = _iconEl(name, filled);
        _lastIconSwap = Date.now();
        if (old) old.replaceWith(el); else btn.appendChild(el);
        if (el.tagName === 'I' && window.lucide) window.lucide.createIcons({ root: btn });
      };

      // Whether there is anything to send. Files count: an image with no caption is a
      // perfectly good message, and the old code let you press the button and then did
      // nothing, which is worse than a button that says so.
      self._refreshSend = function () {
        // BOTH elements are looked up fresh. The composer's markup is re-rendered when a group's
        // welcome state is replaced, which detaches the nodes captured above — reading a detached
        // input returns '' and would disable a button that is visibly fine.
        var btn = document.getElementById('btn-send');
        var inp = document.getElementById('chat-input');
        if (!btn) return;
        var value = inp ? inp.value : '';
        var has = (value.trim() !== '') || (self.stagedFiles && self.stagedFiles.length > 0);
        // Deliberately NOT `btn.disabled`. The composer is rebuilt by renderChat, and a rebuild
        // can drop what was typed — a disabled button then leaves the user with no way to send
        // and nothing to tell them why. The `ready` class and the icon carry the state instead,
        // and the click handler already guards on the value, so a press with nothing to send is
        // simply ignored. State you can see, without a state you can get stuck in.
        btn.classList.toggle('ready', has);
        btn.setAttribute('aria-disabled', has ? 'false' : 'true');
        // Always authoritative. It used to skip while an easter-egg icon was showing, which
        // made the restore conditional and left a random glyph behind on a fast hover in and
        // out. Nothing else can fire while the pointer is on the button anyway — you cannot
        // type or stage a file with the cursor parked there.
        _setSendIcon(btn, 'send-horizontal', has);
      };
      self._setSendIcon = _setSendIcon;
      self._iconEl = _iconEl;
      self._refreshSend();

      btnSend.addEventListener('click', async function() {
        var text = input.value.trim();
        if (text !== '' || self.stagedFiles.length > 0) {
          await self.sendMessage(text);
          input.value = '';
          if (self._refreshSend) self._refreshSend();
        }
      });

      // ── 4. the easter egg ──────────────────────────────────────────────────
      // Hovering a send button you cannot press shows a random lucide icon. Only when it is
      // disabled: when it is live, the filled arrow is the thing that tells you so, and
      // hiding it behind a random glyph would be a worse button to make a joke with.
      var _eggIcons = null;
      btnSend.addEventListener('mouseenter', function () {
        if (btnSend.classList.contains('ready')) return;
        // Swapping the icon replaces the element under the pointer, and the browser treats the
        // new element as freshly entered — so the swap fires a mouseenter, which fires another
        // swap. That loop is why a random glyph sometimes survived a hover, and why it was
        // worse the faster the pointer moved. Ignore an enter that is our own echo.
        if (Date.now() - _lastIconSwap < 150) return;
        if (!_eggIcons) {
          try {
            _eggIcons = (window.lucide && window.lucide.icons) ? Object.keys(window.lucide.icons) : null;
          } catch (e) { _eggIcons = null; }
          if (!_eggIcons || !_eggIcons.length) {
            _eggIcons = ['send', 'rocket', 'sparkles', 'ghost', 'cat', 'coffee', 'zap', 'heart', 'star', 'moon',
                         'feather', 'anchor', 'apple', 'banana', 'bird', 'bug', 'cake', 'candy', 'cloud', 'crown'];
          }
        }
        var pick = _eggIcons[Math.floor(Math.random() * _eggIcons.length)];
        _setSendIcon(document.getElementById('btn-send') || btnSend, pick, false);
      });
      btnSend.addEventListener('mouseleave', function () {
        if (self._refreshSend) self._refreshSend();
      });
    }

    var btnMic = document.getElementById('btn-mic');
    if (btnMic) {
      btnMic.title = 'Voice memo — hold to record, release to send. Quick click for Stop/Cancel controls.';

      // Press = start recording (hold-to-record primary; quick click = toggle mode).
      btnMic.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        var vs = self._voiceState;
        if (vs.isRecording || vs.pendingStart) return; // guard double-start
        vs.pressStart = Date.now();
        vs.holding = true;
        vs.suppressClick = true;
        try { btnMic.setPointerCapture(e.pointerId); } catch (err) {}
        self._startVoiceRecording();
      });

      // Release = stop + stage (hold >= 300ms) OR keep recording with the
      // control bar (quick click < 300ms → click-toggle mode).
      var releaseVoice = function() {
        var vs = self._voiceState;
        if (!vs.holding) return;
        vs.holding = false;
        var held = Date.now() - vs.pressStart;
        if (held < 300) {
          // Quick click — recording continues; show the bar with Stop/Cancel
          self._showVoiceBar();
        } else {
          // Hold-to-record — stop and stage the clip on release
          if (vs.isRecording) {
            self._stopVoiceRecording(false);
          } else {
            vs.stageOnRelease = true; // stream still pending — stage once it starts
          }
        }
      };
      btnMic.addEventListener('pointerup', releaseVoice);
      btnMic.addEventListener('pointercancel', releaseVoice);
      btnMic.addEventListener('pointerleave', releaseVoice);

      // Keyboard activation only (pointer paths set suppressClick and are
      // handled above) — starts recording in click-toggle mode.
      btnMic.addEventListener('click', function() {
        var vs = self._voiceState;
        if (vs.suppressClick) { vs.suppressClick = false; return; }
        if (vs.isRecording || vs.pendingStart) return;
        self._startVoiceRecording();
      });

      // Re-apply recording UI after a chat re-render (renderChat rebuilds the input DOM)
      self._syncVoiceBar();
    }

    var btnPlus = document.getElementById('btn-plus');
    var fileInput = document.getElementById('file-input');
    if (btnPlus && fileInput) {
      // The plus rotates 45° into an x while its menu is open. That is the whole trick: a +
      // turned 45° IS an x, so there is no second icon to load or keep in sync.
      var _plusOpen = function (open) {
        btnPlus.classList.toggle('open', !!open);
      };
      self._closePlus = function () { _plusOpen(false); };
      document.addEventListener('click', function () { _plusOpen(false); });
      btnPlus.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!window.ContextMenu) return;
        _plusOpen(true);
        var rect = btnPlus.getBoundingClientRect();
        window.ContextMenu.show(rect.left, rect.top - 120, [
          { label: 'Upload Images', action: 'upload-image', icon: 'images', onClick: function() { 
            fileInput.accept = 'image/*'; 
            fileInput.removeAttribute('webkitdirectory'); 
            fileInput.click(); 
          } },
          { label: 'Upload Files', action: 'upload-file', icon: 'file', onClick: function() { 
            fileInput.removeAttribute('accept'); 
            fileInput.removeAttribute('webkitdirectory'); 
            fileInput.click(); 
          } },
          { label: 'Upload Folder', action: 'upload-folder', icon: 'folder', onClick: function() { 
            fileInput.removeAttribute('accept'); 
            fileInput.setAttribute('webkitdirectory', ''); 
            fileInput.click(); 
          } }
        ]);
      });
      
      fileInput.addEventListener('change', function(e) {
        if (!e.target.files || e.target.files.length === 0) return;
        
        for (let i = 0; i < e.target.files.length; i++) {
          const file = e.target.files[i];
          const ext = file.name.split('.').pop().toLowerCase();
          const vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
          const audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
          const isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
          var entry = {
            file: file,
            // Electron 32 removed File.path, so this used to fall through to
            // file.name — a bare filename with no directory, which the transfer
            // cannot open. That is why attaching anything produced no message.
            path: (window.orbitAPI && window.orbitAPI.getPathForFile
                     ? window.orbitAPI.getPathForFile(file)
                     : '') || file.path || file.name,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
            url: isImage || isAudio || isVideo ? URL.createObjectURL(file) : null,
            width: 0,
            height: 0
          };
          self.stagedFiles.push(entry);

          if (isImage && entry.url) {
            (function(entry) {
              var img = new Image();
              img.onload = function() {
                entry.width = img.naturalWidth;
                entry.height = img.naturalHeight;
                // ⚠ DO NOT REVOKE HERE. `img.src` is `entry.url` — the SAME blob
                // URL the tile renders and the message is sent with. Revoking it
                // once the dimensions were read killed the URL for every later
                // use, so the image worked in the strip (already decoded and
                // cached) and failed everywhere after it. The revoke belongs
                // where the entry actually leaves: the remove handler, and after
                // a successful send.
              };
              img.src = entry.url;
            })(entry);
          }
        }
        
        self.renderPreviewArea();
        fileInput.value = '';
      });
    }

    var btnChatMore = document.getElementById('btn-chat-more');
    if (btnChatMore) {
      btnChatMore.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!window.ContextMenu) return;
        var rect = btnChatMore.getBoundingClientRect();
        window.ContextMenu.show(rect.left - 150, rect.bottom + 8, (function() {
          var s = window.store.getState();
          var isGroup = s.groups.some(function(g) { return g.groupId === s.activeChatId; });
          var items = [];
          if (isGroup) {
            items.push({ label: 'Voice Call', action: 'voice-call', icon: 'phone', onClick: function() { if (window.CallManager) window.CallManager.startGroupCall(false, window.store.getState().activeChatId); } });
            items.push({ label: 'Video Call', action: 'video-call', icon: 'video', onClick: function() { if (window.CallManager) window.CallManager.startGroupCall(true, window.store.getState().activeChatId); } });
          } else {
            items.push({ label: 'Voice Call', action: 'voice-call', icon: 'phone', onClick: function() { var s2 = window.store.getState(); var f = s2.friends.find(function(fr) { return fr.userId === s2.activeChatId; }); if (f && window.CallManager) window.CallManager.startCall(false, f.userId, f.ip); } });
            items.push({ label: 'Video Call', action: 'video-call', icon: 'video', onClick: function() { var s2 = window.store.getState(); var f = s2.friends.find(function(fr) { return fr.userId === s2.activeChatId; }); if (f && window.CallManager) window.CallManager.startCall(true, f.userId, f.ip); } });
          }
          items.push({ label: 'Search in Chat', action: 'search-chat', icon: 'message-square', onClick: function() { self.showSearchModal(null, window.store.getState().activeChatId); } });
          items.push({ label: 'Search', action: 'search', icon: 'search', onClick: function() { self.showSearchModal(); } });
          return items;
        })());
      });
    }

    var btnGallery = document.getElementById('btn-gallery');
    if (btnGallery && window.GallerySidebar) {
      btnGallery.addEventListener('click', function() {
        window.GallerySidebar.toggle();
      });
    }

    var btnGroupInfo = document.getElementById('btn-group-info');
    if (btnGroupInfo) {
      btnGroupInfo.addEventListener('click', function() {
        var s = window.store.getState();
        if (s.activeChatId && window.SidebarMiddle && window.SidebarMiddle.showGroupInfo) {
          window.SidebarMiddle.showGroupInfo(s.activeChatId);
        }
      });
    }

    var groupMemberCount = document.getElementById('group-member-count');
    if (groupMemberCount) {
      groupMemberCount.addEventListener('click', function() {
        var s = window.store.getState();
        if (s.activeChatId && window.SidebarMiddle && window.SidebarMiddle.showGroupInfo) {
          window.SidebarMiddle.showGroupInfo(s.activeChatId);
        }
      });
    }

    self.initSwipeToReply();

    // Cancel transfer buttons
    // Drag and drop file uploads
    this.container.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.add('drag-active');
    });

    this.container.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.remove('drag-active');
    });

    this.container.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.container.classList.remove('drag-active');

      if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

      var state = window.store.getState();
      if (!state.activeChatId) {
        window.Toast.show('No Chat', 'Select a chat first');
        return;
      }

      for (var i = 0; i < e.dataTransfer.files.length; i++) {
        var file = e.dataTransfer.files[i];
        var ext = file.name.split('.').pop().toLowerCase();
        var vidExts = ['mp4','mov','avi','mkv','webm','3gp','m4v','wmv','flv'];
        var audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','webm'];
        var isImage = file.type.startsWith('image/');
        var isVideo = file.type.startsWith('video/') || vidExts.indexOf(ext) !== -1;
        var isAudio = file.type.startsWith('audio/') || audExts.indexOf(ext) !== -1;
        self.stagedFiles.push({
          file: file,
          // Same Electron 32 issue as the file-input path above: File.path is gone,
          // so this fell through to a bare filename the transfer cannot open.
          path: (window.orbitAPI && window.orbitAPI.getPathForFile
                   ? window.orbitAPI.getPathForFile(file)
                   : '') || file.path || file.name,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          type: isImage ? 'image' : (isVideo ? 'video' : (isAudio ? 'audio' : 'file')),
          url: isImage || isAudio || isVideo ? URL.createObjectURL(file) : null,
          width: 0,
          height: 0
        });
      }

      self.renderPreviewArea();
      window.Toast.show('Files Added', e.dataTransfer.files.length + ' file(s) staged for upload');
    });
  },

  // Delegates to the shared mapper so the desktop and the phone agree about
  // what a .rar looks like. The inline list is kept as a fallback.
  getFileIcon(name, mimeType) {
    if (window.FileIcons && typeof window.FileIcons.kind === 'function') {
      return window.FileIcons.kind(name, mimeType);
    }
    return 'file';
  },

  getFileIconLucide(fileType) {
    if (window.FileIcons && typeof window.FileIcons.lucide === 'function') {
      return window.FileIcons.lucide(fileType);
    }
    return 'file';
  },

  /* ── Voice memo recording (parity with mobile _voiceRecorder) ── */

  _getVoiceMimeType() {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    }
    return 'audio/webm';
  },

  _startVoiceRecording() {
    var self = this;
    var vs = this._voiceState;
    if (vs.isRecording || vs.pendingStart) return; // guard double-start
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (window.Toast) window.Toast.show('Microphone Error', 'Microphone recording is not supported in this browser', 'error', 3000);
      return;
    }
    vs.pendingStart = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      vs.pendingStart = false;
      vs.stream = stream;
      vs.audioChunks = [];
      vs.startTime = Date.now();
      vs.cancelPending = false;

      var mimeType = self._getVoiceMimeType();
      var recorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: mimeType });
      } catch (e) {
        recorder = new MediaRecorder(stream); // fallback: browser default
      }
      vs.mediaRecorder = recorder;

      recorder.ondataavailable = function(e) {
        if (e.data && e.data.size > 0) vs.audioChunks.push(e.data);
      };

      recorder.onstop = function() {
        // Stop all mic tracks — idempotent with _stopVoiceRecording's backstop
        stream.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
        vs.stream = null;
        vs.mediaRecorder = null;
        // Release the MediaStreamAudioSourceNode — it would otherwise stay
        // connected to the analyser forever (one leak per recording).
        if (vs.srcNode) { try { vs.srcNode.disconnect(); } catch (e) {} vs.srcNode = null; }
        if (vs.cancelPending) { vs.cancelPending = false; vs.audioChunks = []; return; }
        if (vs.audioChunks.length === 0) return;
        var blob = new Blob(vs.audioChunks, { type: mimeType });
        vs.audioChunks = [];
        if (blob.size > 0) {
          // Derive the extension from the actual blob type (mp4-capable
          // Chromium builds record audio/mp4) — mirrors mobile app.js.
          var ext = blob.type.indexOf('mp4') !== -1 ? '.mp4' : '.webm';
          var file = new File([blob], 'VoiceMemo_' + Date.now() + ext, { type: blob.type });
          self.stagedFiles.push({
            file: file,
            path: file.name,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            type: 'audio',
            url: URL.createObjectURL(file),
            width: 0,
            height: 0
          });
          self.renderPreviewArea();
          if (window.Toast) window.Toast.show('Voice Memo', 'Voice message recorded', 'success', 2500);
        }
      };

      recorder.onerror = function() {
        self._stopVoiceRecording(true);
        if (window.Toast) window.Toast.show('Voice Memo', 'Recording failed', 'error', 3000);
      };

      // Live level meter — same AnalyserNode pattern as shared/ui/audio-player.js
      try {
        if (!vs.audioCtx) vs.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (vs.audioCtx.state === 'suspended') vs.audioCtx.resume().catch(function() {});
        vs.srcNode = vs.audioCtx.createMediaStreamSource(stream);
        vs.analyser = vs.audioCtx.createAnalyser();
        vs.analyser.fftSize = 128;
        vs.srcNode.connect(vs.analyser);
        // deliberately NOT connected to audioCtx.destination — no mic monitoring
      } catch (e) {
        vs.analyser = null;
      }

      recorder.start(250); // collect every 250ms for low-latency staging
      vs.isRecording = true;

      self._setMicRecordingUI(true);
      self._showVoiceBar();

      // Hold-release happened while the stream was still pending — stop after a
      // short grace so the clip has a usable minimum length.
      if (vs.stageOnRelease) {
        vs.stageOnRelease = false;
        setTimeout(function() { self._stopVoiceRecording(false); }, 300);
      }

      vs.timerInterval = setInterval(function() { self._updateVoiceTimer(); }, 250);
      vs.meterInterval = setInterval(function() { self._updateVoiceMeter(); }, 66);
    }).catch(function(err) {
      vs.pendingStart = false;
      vs.stageOnRelease = false;
      vs.holding = false;
      vs.suppressClick = false;
      self._hideVoiceBar();
      self._setMicRecordingUI(false);
      console.error('Microphone access denied or error:', err);
      if (window.Toast) window.Toast.show('Microphone Error', 'Could not access microphone: ' + err.message, 'error', 3000);
    });
  },

  _stopVoiceRecording(cancel) {
    var self = this;
    var vs = this._voiceState;
    if (!vs.isRecording && !vs.mediaRecorder) return;
    vs.cancelPending = !!cancel;
    vs.stageOnRelease = false;
    vs.holding = false;
    if (vs.mediaRecorder && vs.mediaRecorder.state !== 'inactive') {
      try { vs.mediaRecorder.stop(); } catch (e) {}
    }
    // Backstop: stop tracks even if onstop never fires (idempotent with onstop)
    if (vs.stream) {
      var tracks = vs.stream.getTracks();
      tracks.forEach(function(t) { try { t.stop(); } catch (e) {} });
      vs.stream = null;
    }
    this._clearVoiceTimers();
    vs.isRecording = false;
    this._setMicRecordingUI(false);
    this._hideVoiceBar();
  },

  _clearVoiceTimers() {
    var vs = this._voiceState;
    if (vs.timerInterval) { clearInterval(vs.timerInterval); vs.timerInterval = null; }
    if (vs.meterInterval) { clearInterval(vs.meterInterval); vs.meterInterval = null; }
  },

  _updateVoiceTimer() {
    var vs = this._voiceState;
    if (!vs.startTime) return;
    var elapsed = Math.floor((Date.now() - vs.startTime) / 1000);
    var maxDuration = 300; // 5 minutes — same cap as mobile (_voiceRecorder)
    if (elapsed >= maxDuration) {
      this._stopVoiceRecording(false);
      if (window.Toast) window.Toast.show('Voice Memo', 'Max recording length reached (5:00)', 'info', 3000);
      return;
    }
    var timerEl = document.getElementById('voice-rec-timer');
    if (timerEl) {
      timerEl.textContent = Math.floor(elapsed / 60) + ':' + (elapsed % 60 < 10 ? '0' : '') + (elapsed % 60);
    }
  },

  _updateVoiceMeter() {
    var vs = this._voiceState;
    var analyser = vs.analyser;
    var meterEl = document.getElementById('voice-rec-meter');
    if (!analyser || !meterEl || !meterEl.children || meterEl.children.length === 0) return;
    if (!vs._meterData) vs._meterData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(vs._meterData);
    var bars = meterEl.children;
    var n = bars.length;
    var usable = Math.min(vs._meterData.length, 64); // 0–6kHz — human voice range
    var binsPerBar = Math.max(1, Math.floor(usable / n));
    for (var i = 0; i < n; i++) {
      var sum = 0;
      var start = i * binsPerBar;
      for (var b = 0; b < binsPerBar && start + b < usable; b++) sum += vs._meterData[start + b];
      var level = sum / binsPerBar / 255; // 0..1
      bars[i].style.height = (4 + Math.round(level * 92)) + '%';
      bars[i].className = level > 0.02 ? 'voice-rec-meter-bar active' : 'voice-rec-meter-bar';
    }
  },

  _setMicRecordingUI(recording) {
    var btnMic = document.getElementById('btn-mic');
    if (!btnMic) return;
    btnMic.style.color = recording ? 'var(--accent-danger)' : '';
    btnMic.innerHTML = recording ? '<i data-lucide="square" style="fill:var(--accent-danger);"></i>' : '<i data-lucide="mic"></i>';
    if (window.lucide) window.lucide.createIcons({ root: btnMic });
  },

  _showVoiceBar() {
    var self = this;
    var wrapper = this.container ? this.container.querySelector('.chat-input-wrapper') : null;
    if (!wrapper) return;
    var bar = document.getElementById('voice-rec-bar');
    if (!bar) {
      var meterHtml = '';
      for (var i = 0; i < 32; i++) meterHtml += '<span class="voice-rec-meter-bar"></span>';
      wrapper.insertAdjacentHTML('afterbegin',
        '<div id="voice-rec-bar" class="voice-rec-bar">' +
          '<span class="voice-rec-dot"></span>' +
          '<span id="voice-rec-timer">0:00</span>' +
          '<div id="voice-rec-meter" class="voice-rec-meter">' + meterHtml + '</div>' +
          '<button id="btn-voice-cancel" class="voice-rec-btn voice-rec-btn-cancel" title="Cancel recording">' +
            '<i data-lucide="x" style="width:14px;height:14px;"></i>' +
          '</button>' +
          '<button id="btn-voice-stop" class="voice-rec-btn voice-rec-btn-stop" title="Stop and send">Stop</button>' +
        '</div>');
      bar = document.getElementById('voice-rec-bar');
      var cancelBtn = document.getElementById('btn-voice-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
          self._stopVoiceRecording(true);
          if (window.Toast) window.Toast.show('Voice Memo', 'Recording cancelled', 'info', 2500);
        });
      }
      var stopBtn = document.getElementById('btn-voice-stop');
      if (stopBtn) {
        stopBtn.addEventListener('click', function() { self._stopVoiceRecording(false); });
      }
      if (window.lucide) window.lucide.createIcons({ root: bar });
    }
    bar.style.display = 'flex';
  },

  _hideVoiceBar() {
    var bar = document.getElementById('voice-rec-bar');
    if (bar) bar.style.display = 'none';
  },

  // Re-render safety: renderChat rebuilds the input DOM — restore the recording
  // indicator and mic state if we were mid-recording.
  _syncVoiceBar() {
    if (this._voiceState.isRecording) {
      this._setMicRecordingUI(true);
      this._showVoiceBar();
    }
  },

  renderPreviewArea() {
    const area = document.getElementById('file-preview-area');
    // Staging or removing a file changes whether there is anything to send, and the send
    // button has to follow. This is the one place the preview is rebuilt, so one call here
    // covers both directions.
    if (this._refreshSend) this._refreshSend();
    if (!area) return;
    
    if (this.stagedFiles.length === 0) {
      area.style.display = 'none';
      return;
    }
    
    area.style.display = 'flex';
    let html = '';
    this.stagedFiles.forEach((staged, index) => {
      var fileType = this.getFileIcon(staged.name, staged.mimeType || '');
      var safeName = window.Sanitize.escapeHtml(staged.name);
      // ⚠ THERE WAS A BLANK LINE WHERE THIS BUTTON GOES. The document-level
      // handler for `.btn-remove-file` has existed the whole time — it splices
      // the file out and revokes the blob URL — but the renderer never emitted
      // the button, so the handler matched nothing and a staged file could not
      // be taken back. Same dead-handler shape as the mobile's.
      var removeBtn = '<button class="btn-remove-file" data-index="' + index + '"' +
        ' title="Remove" aria-label="Remove ' + safeName + '">' +
        '<i data-lucide="x"></i></button>';

      if (fileType === 'image') {
        // The tile is a container now, so it can hold a spinner and the remove
        // button. It used to be a bare <img>, which meant a photo that took a
        // moment to decode was an empty box with nothing happening in it.
        html += '<div class="fp-tile is-loading" data-index="' + index + '" title="Click to view">' +
          '<div class="fp-spin" aria-hidden="true"></div>' +
          '<img src="' + staged.url + '" alt="">' +
          removeBtn +
        '</div>';
      } else {
        var icon = this.getFileIconLucide(fileType);
        var colorMap = { pdf: '#ef4444', word: '#3b82f6', sheet: '#22c55e', archive: '#f59e0b', code: '#8b5cf6', audio: '#ec4899', video: '#a855f7', text: '#6b7280' };
        var iconColor = colorMap[fileType] || 'var(--text-muted)';
        html += '<div class="fp-tile" data-index="' + index + '">' +
          '<div class="fp-doc">' +
            '<i data-lucide="' + icon + '" style="width:22px;height:22px;color:' + iconColor + ';"></i>' +
            '<span class="fp-name">' + safeName + '</span>' +
          '</div>' +
          removeBtn +
        '</div>';
      }
    });
    
    area.innerHTML = html;
    lucide.createIcons({ root: area });

    // The spinner comes off when the image is actually ready. `complete` is
    // checked as well as the event: a cached image has already loaded by the
    // time this runs, so `load` never fires and the spinner would sit there
    // turning over a photo that is plainly visible underneath it.
    area.querySelectorAll('.fp-tile.is-loading img').forEach(function (img) {
      var tile = img.parentNode;
      var done = function () { if (tile) tile.classList.remove('is-loading'); };
      if (img.complete && img.naturalWidth > 0) { done(); return; }
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });

    // Clicking a tile LOOKS at it. It must not send and must not open the chat.
    // ⚠ The remove button is deliberately NOT wired here — the document-level
    // handler already does that, and a second listener would splice twice.
    const self = this;
    area.querySelectorAll('.fp-tile[data-index]').forEach(function (tile) {
      tile.addEventListener('click', function (e) {
        if (e.target.closest('.btn-remove-file')) return;
        var idx = parseInt(tile.getAttribute('data-index'), 10);
        var target = self.stagedFiles[idx];
        if (!target || self.getFileIcon(target.name, target.mimeType || '') !== 'image') return;
        // Only the images, so prev/next in the viewer steps between pictures
        // rather than landing on a PDF.
        var gallery = self.stagedFiles.filter(function (s) {
          return s.url && self.getFileIcon(s.name, s.mimeType || '') === 'image';
        });
        var at = gallery.indexOf(target);
        if (window.ImageViewer && window.ImageViewer.openGallery) {
          window.ImageViewer.openGallery(gallery, at < 0 ? 0 : at);
        }
      });
    });
  },

  showReactionPicker(x, y, msgId) {
    var existing = document.querySelector('.reaction-picker');
    if (existing) { document.body.removeChild(existing); return; }

    var emojis = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉', '🥺', '👀', '💀', '✨', '⭐', '🤨', '😭', '😤', '😈', '💯', '👋', '🤝', '💪', '👏', '🎊', '🚀', '🎯', '💅', '🤔'];
    var self = this;
    var picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.style.cssText = 'position:fixed;left:' + Math.max(8, Math.min(x - 360, window.innerWidth - 360 - 8)) + 'px;top:' + (y + 8) + 'px;z-index:9999;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:24px;padding:8px 10px;box-shadow:var(--shadow-xl);display:flex;flex-wrap:wrap;gap:2px;max-width:360px;';

    emojis.forEach(function(emoji) {
      var btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.cssText = 'background:none;border:none;font-size:22px;cursor:pointer;padding:4px 6px;border-radius:50%;transition:background 0.15s,transform 0.1s;line-height:1;';
      btn.onmouseover = function() { this.style.background = 'var(--bg-hover)'; this.style.transform = 'scale(1.2)'; };
      btn.onmouseout = function() { this.style.background = 'transparent'; this.style.transform = 'scale(1)'; };
      btn.onclick = function() {
        var state = window.store.getState();
        var chatId = state.activeChatId;
        var msg = (state.messages[chatId] || []).find(function(m) { return String(m.id) === msgId; });
        var hasReacted = msg && msg.reactions && msg.reactions.some(function(r) { return r.emoji === emoji && r.userId === state.currentUser.userId; });
        if (chatId && window.store.sendReaction) {
          window.store.sendReaction(chatId, msgId, emoji, hasReacted ? 'remove' : 'add');
        }
        if (picker.parentNode) picker.parentNode.removeChild(picker);
      };
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Close on click outside
    setTimeout(function() {
      document.addEventListener('click', function closePicker(e) {
        if (!picker.contains(e.target)) {
          if (picker.parentNode) picker.parentNode.removeChild(picker);
          document.removeEventListener('click', closePicker);
        }
      });
    }, 10);
  },

  showSearchModal(initialQuery, chatId) {
    var existing = document.querySelector('.search-modal-overlay');
    if (existing) { existing.remove(); }

    var self = this;
    var isChatSearch = !!chatId;
    var state = window.store.getState();
    var chatName = '';
    if (isChatSearch) {
      var friend = state.friends.find(function(f) { return f.userId === chatId; });
      var group = state.groups.find(function(g) { return g.groupId === chatId; });
      if (friend) chatName = friend.username;
      else if (group) chatName = group.groupName;
    }

    var overlay = document.createElement('div');
    overlay.className = 'search-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:560px;max-height:75vh;background:var(--bg-surface);border-radius:var(--radius-lg);border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);display:flex;flex-direction:column;overflow:hidden;';

    var modalTitle = isChatSearch ? 'Search in Chat' : 'Search';
    var placeholder = isChatSearch ? 'Search this chat...' : 'Search messages, people, files...';

    panel.innerHTML =
      '<div class="search-modal-header" style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<i data-lucide="search" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0;"></i>' +
          '<div style="flex:1;display:flex;flex-direction:column;">' +
            '<span style="font-size:11px;font-weight:600;color:var(--text-muted);">' + modalTitle + '</span>' +
            '<input id="search-modal-input" class="search-modal-input" type="text" placeholder="' + placeholder + '" autofocus style="flex:1;border:none;background:transparent;color:var(--text-primary);font-size:15px;outline:none;">' +
          '</div>' +
          '<button id="search-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;border-radius:6px;transition:background 0.15s;" onmouseover="this.style.background=\'var(--bg-hover)\'" onmouseout="this.style.background=\'transparent\'"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
        '<div id="search-modal-filters" style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">' +
          '<input id="search-filter-from" type="text" placeholder="Filter by sender" style="flex:1;min-width:100px;padding:6px 10px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:12px;outline:none;">' +
          '<input id="search-filter-date-from" type="date" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:11px;outline:none;color-scheme:dark;">' +
          '<span style="font-size:11px;color:var(--text-muted);">to</span>' +
          '<input id="search-filter-date-to" type="date" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:11px;outline:none;color-scheme:dark;">' +
        '</div>' +
      '</div>' +
      '<div id="search-modal-results" style="flex:1;overflow-y:auto;padding:8px 0;"></div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var input = document.getElementById('search-modal-input');
    var results = document.getElementById('search-modal-results');

    // Pre-fill the chat filter if searching within a chat
    if (isChatSearch) {
      var filterFrom = document.getElementById('search-filter-from');
      if (filterFrom) filterFrom.placeholder = 'Filter by sender';
    }

    // Delegated click on search results
    results.addEventListener('click', function(e) {
      var row = e.target.closest('.search-result-row');
      if (!row) return;
      var chatId = row.getAttribute('data-chat-id');
      var msgId = row.getAttribute('data-msg-id');
      var state = window.store.getState();
      if (state.activeChatId !== chatId) {
        window.store.setState({ activeChatId: chatId });
      }
      overlay.remove();
      if (msgId) {
        setTimeout(function() {
          var el = document.querySelector('[data-msg-id="' + msgId + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
    });

    if (input) {
      input.focus();
      if (initialQuery) {
        input.value = initialQuery;
      }
    }

    var performSearch = function() {
      try {
        var query = input ? input.value.trim().toLowerCase() : '';
        var filterFrom = document.getElementById('search-filter-from') ? document.getElementById('search-filter-from').value.trim().toLowerCase() : '';
        var dateFrom = document.getElementById('search-filter-date-from') ? document.getElementById('search-filter-date-from').value : '';
        var dateTo = document.getElementById('search-filter-date-to') ? document.getElementById('search-filter-date-to').value : '';

        if (!query) {
          results.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted);font-size:13px;">' + (isChatSearch ? 'Type to search messages in this chat' : 'Type to search messages, people, and files') + '</div>';
          return;
        }

        var state = window.store.getState();
        var hits = [];
        var myId = state.currentUser.userId;

        var chatIds = isChatSearch ? [chatId] : Object.keys(state.messages);

        // Ask the FTS5 index which messages match, once, before walking the store. It returns []
        // both when nothing matches and when this build has no FTS5 — the two are not
        // distinguishable from here, so an empty set falls back to scanning below. A slow correct
        // answer beats a fast empty one.
        var ftsIds = null;
        if (query && !filterFrom && window.orbitAPI && typeof window.orbitAPI.dbSearchMessages === 'function') {
          try {
            // NOT  — that is the results array this function builds, and  here would
            // redeclare it (function scope), pushing raw database rows into the results.
            // FTS5's operators must be UPPERCASE. query has been lowercased for the scoring
            // below, so 'project and cancelled' would reach SQLite with a lowercase 'and' —
            // which FTS5 reads as a search TERM, not an operator, and the query then matches
            // nothing. Restore the operators for the engine and leave query alone for scoring.
            var ftsQuery = query.replace(/\b(and|or|not|near)\b/g, function (m) { return m.toUpperCase(); });
            var ftsRows = window.orbitAPI.dbSearchMessages(ftsQuery, isChatSearch ? { chatId: chatId } : {}) || [];
            if (ftsRows.length) {
              ftsIds = {};
              ftsRows.forEach(function(h) { ftsIds[String(h.id)] = true; });
            }
          } catch (e) { ftsIds = null; }
        }

        chatIds.forEach(function(cId) {
          var msgs = state.messages[cId] || [];
          var chatName = cId;
          var friend = state.friends.find(function(f) { return f.userId === cId; });
          var group = state.groups.find(function(g) { return g.groupId === cId; });
          if (friend) chatName = friend.username;
          else if (group) chatName = group.groupName;
          else if (cId === 'local-echo') chatName = 'Orbit Echo';

          msgs.forEach(function(msg) {
            var match = false;
            var matchType = 'text';
            var score = 0;

            // Sender filter
            if (filterFrom) {
              var senderMatch = false;
              if (friend && friend.username.toLowerCase().includes(filterFrom)) senderMatch = true;
              if (group) {
                var sender = group.members.find(function(m) { return m.userId === msg.sender; });
                if (sender && sender.username.toLowerCase().includes(filterFrom)) senderMatch = true;
              }
              if (msg.sender === myId && 'you'.includes(filterFrom)) senderMatch = true;
              if (!senderMatch) return;
            }

            // Date filter
            if (dateFrom && msg.timestamp && msg.timestamp < dateFrom) return;
            if (dateTo && msg.timestamp) {
              var endDate = new Date(dateTo);
              endDate.setDate(endDate.getDate() + 1);
              if (msg.timestamp >= endDate.toISOString().split('T')[0]) return;
            }

            if (msg.text) {
              var lower = msg.text.toLowerCase();
              var q = query;
              // The index decided whether this message matches; the scoring below still decides
              // how well. Without an index, fall back to testing the text directly.
              var textMatches = ftsIds ? !!ftsIds[String(msg.id)] : lower.includes(q);
              if (textMatches) {
                if (lower === q) { match = true; score = 100; }
                else if (lower.startsWith(q)) { match = true; score = 80; }
                else if (lower.includes(' ' + q) || lower.includes(q + ' ')) { match = true; score = 60; }
                else if (lower.includes(q)) { match = true; score = 40; }
                else { match = true; score = 30; }   // the index matched on a stem or a token the plain scan cannot see
              }
            }
            if (msg.attachments) {
              msg.attachments.forEach(function(att) {
                if (att.name && att.name.toLowerCase().includes(query)) {
                  match = true;
                  matchType = 'file';
                  score = Math.max(score, 50);
                }
              });
            }
            if (match) {
              hits.push({ chatId: cId, chatName: chatName, msg: msg, matchType: matchType, score: score, timestamp: msg.timestamp || '' });
            }
          });
        });

        // Search friends/usernames (skip in chat-specific search)
        if (!isChatSearch) {
        state.friends.forEach(function(f) {
          if (f.username && f.username.toLowerCase().includes(query) && f.userId !== myId) {
            if (!hits.some(function(h) { return h.chatId === f.userId; })) {
              hits.push({ chatId: f.userId, chatName: f.username, msg: null, matchType: 'user', score: 30, timestamp: '' });
            }
          }
        });
        }

        // Sort: by score desc, then by timestamp desc
        hits.sort(function(a, b) {
          if (b.score !== a.score) return b.score - a.score;
          return (b.timestamp || '').localeCompare(a.timestamp || '');
        });

        if (hits.length === 0) {
          results.innerHTML = window.OrbitEmpty.html({
            icon: 'search-x',
            title: 'No results',
            hint: 'Nothing matched <b style="color:var(--text-secondary);">' + window.Sanitize.escapeHtml(query) + '</b>.',
            compact: true,
            muted: true
          });
          return;
        }

        function highlightText(text, q) {
          if (!q || !text) return window.Sanitize.escapeHtml(text || '');
          var escaped = window.Sanitize.escapeHtml(text);
          var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
          return escaped.replace(re, '<strong style="color:var(--accent-primary);font-weight:600;">$1</strong>');
        }

        var html = '<div style="font-size:11px;padding:6px 20px;color:var(--text-muted);">' + hits.length + ' result' + (hits.length !== 1 ? 's' : '') + '</div>';
        hits.slice(0, 50).forEach(function(hit) {
          var rawQuery = input ? input.value.trim() : '';
          var preview = '';
          var icon = 'message-circle';
          if (hit.matchType === 'file') {
            icon = 'file';
            var fileName = hit.msg.attachments[0] ? hit.msg.attachments[0].name : 'attachment';
            preview = 'File: ' + highlightText(fileName, rawQuery);
          } else if (hit.matchType === 'user') { icon = 'user'; preview = 'Click to open chat'; }
          else {
            var raw = hit.msg.text || '(attachment)';
            if (raw.length > 80) raw = raw.substring(0, 80) + '...';
            preview = highlightText(raw, rawQuery);
          }
          var time = hit.msg ? window.Format.relativeTime(hit.msg.timestamp) : '';

          var nameHtml = isChatSearch ? '' : '<span>' + window.Sanitize.escapeHtml(hit.chatName) + '</span>';
          html += '<div class="search-result-row" data-chat-id="' + window.Sanitize.escapeHtml(hit.chatId) + '" data-msg-id="' + (hit.msg ? hit.msg.id : '') + '" style="display:flex;align-items:center;gap:12px;padding:10px 20px;cursor:pointer;">' +
            '<i data-lucide="' + icon + '" style="width:18px;height:18px;color:var(--text-muted);flex-shrink:0;"></i>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-primary);font-weight:500;">' + nameHtml + '<span style="font-size:11px;color:var(--text-muted);font-weight:400;">' + time + '</span></div>' +
              '<div style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + preview + '</div>' +
            '</div>' +
          '</div>';
        });
        results.innerHTML = html;
        if (window.lucide) window.lucide.createIcons({ root: results });
      } catch(err) {
        console.error('[Search] performSearch error:', err);
        if (results) {
          results.innerHTML = '<div style="padding:24px;text-align:left;color:var(--accent-danger);font-size:12px;font-family:var(--font-mono);white-space:pre-wrap;word-break:break-word;">' +
            '<b>Search Error</b><br><br>' + window.Sanitize.escapeHtml(String(err && err.message ? err.message : err)) +
            (err && err.stack ? '<br><br><span style="color:var(--text-muted);font-size:11px;">' + window.Sanitize.escapeHtml(err.stack) + '</span>' : '') +
          '</div>';
        }
      }
    };

    // Filter inputs trigger search
    var filterInputs = ['search-modal-input', 'search-filter-from', 'search-filter-date-from', 'search-filter-date-to'];
    filterInputs.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', function() {
          if (self._searchTimeout) clearTimeout(self._searchTimeout);
          self._searchTimeout = setTimeout(performSearch, 200);
        });
        el.addEventListener('change', function() {
          if (self._searchTimeout) clearTimeout(self._searchTimeout);
          self._searchTimeout = setTimeout(performSearch, 100);
        });
      }
    });

    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') performSearch();
        if (e.key === 'Escape') overlay.remove();
      });
    }

    document.getElementById('search-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    if (input && initialQuery) {
      var ev = new Event('input', { bubbles: true });
      input.dispatchEvent(ev);
    }
  },

  showForwardModal(msgId) {
    var existing = document.querySelector('.forward-modal-overlay');
    if (existing) { existing.remove(); }

    var self = this;
    var state = window.store.getState();
    var msgList = state.messages[state.activeChatId] || [];
    var msg = msgList.find(function(m) { return m.id == msgId; });
    if (!msg) return;

    function getSenderName(originalMsg) {
      if (originalMsg.sender === state.currentUser.userId) return 'You';
      var friend = state.friends.find(function(f) { return f.userId === state.activeChatId; });
      var group = state.groups.find(function(g) { return g.groupId === state.activeChatId; });
      if (group) {
        var member = group.members.find(function(m) { return m.userId === originalMsg.sender; });
        if (member) return member.username;
        var fromFriend = state.friends.find(function(f) { return f.userId === originalMsg.sender; });
        if (fromFriend) return fromFriend.username;
      }
      if (friend) return friend.username;
      return 'Unknown';
    }

    var senderName = getSenderName(msg);
    var forwardedText = 'Forwarded from ' + senderName + ': ' + (msg.text || '');

    var overlay = document.createElement('div');
    overlay.className = 'forward-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:460px;max-height:75vh;background:var(--bg-surface);border-radius:var(--radius-lg);border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);display:flex;flex-direction:column;overflow:hidden;';

    var allContacts = [];

    state.friends.forEach(function(f) {
      if (f.userId !== state.activeChatId && f.userId !== 'local-echo') {
        allContacts.push({ id: f.userId, name: f.username, avatar: f.avatar, type: 'friend' });
      }
    });

    state.groups.forEach(function(g) {
      if (g.groupId !== state.activeChatId) {
        allContacts.push({ id: g.groupId, name: g.groupName, avatar: g.avatarPath || '', type: 'group' });
      }
    });

    var contactListHtml = '';
    allContacts.forEach(function(c) {
      var initial = c.name.charAt(0).toUpperCase();
      var avatarHtml = c.avatar
        ? '<img src="' + window.Sanitize.escapeHtml(c.avatar) + '" style="width:36px;height:36px;border-radius:' + (c.type === 'group' ? '10px' : '50%') + ';object-fit:cover;">'
        : '<div style="width:36px;height:36px;border-radius:' + (c.type === 'group' ? '10px' : '50%') + ';background:var(--accent-primary);display:flex;align-items:center;justify-content:center;font-weight:700;color:white;font-size:14px;">' + initial + '</div>';
      var typeIcon = c.type === 'group' ? '<i data-lucide="users-round" style="width:12px;height:12px;"></i>' : '<i data-lucide="user-round" style="width:12px;height:12px;"></i>';
      contactListHtml += '<div class="forward-contact-row" data-contact-id="' + window.Sanitize.escapeHtml(c.id) + '" data-contact-type="' + c.type + '" style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-radius:8px;transition:background 0.15s;">' +
        avatarHtml +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:500;color:var(--text-primary);">' + window.Sanitize.escapeHtml(c.name) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:4px;">' + typeIcon + ' ' + (c.type === 'group' ? 'Group' : 'Direct Message') + '</div>' +
        '</div>' +
      '</div>';
    });

    panel.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<span style="font-weight:600;font-size:16px;flex:1;">Forward Message</span>' +
          '<button id="forward-modal-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
        '<div style="margin-top:10px;">' +
          '<input id="forward-search-input" type="text" placeholder="Search chats..." autofocus style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Forwarding: ' + window.Sanitize.escapeHtml(forwardedText.substring(0, 60)) + (forwardedText.length > 60 ? '...' : '') + '</div>' +
      '</div>' +
      '<div id="forward-contact-list" style="flex:1;overflow-y:auto;padding:8px;">' +
        contactListHtml +
      '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    function doForward(targetId) {
      var targetContact = allContacts.find(function(c) { return c.id === targetId; });
      if (!targetContact) return;

      var myId = state.currentUser.userId;
      var newMsg = {
        id: Date.now() + Math.random().toString(36).slice(2, 8),
        sender: myId,
        text: forwardedText,
        timestamp: new Date().toISOString(),
        forwardedFrom: senderName
      };
      if (msg.attachments && msg.attachments.length > 0) {
        newMsg.attachments = msg.attachments.map(function(a) { return { ...a }; });
      }

      window.store.addMessage(targetId, newMsg);

      var payload = {
        text: forwardedText,
        msgId: newMsg.id,
        forwardedFrom: senderName
      };
      if (newMsg.attachments) payload.attachments = newMsg.attachments;

      var s = window.store.getState();
      var g = s.groups.find(function(g) { return g.groupId === targetId; });
      if (g) {
        payload.chatId = targetId;
        (g.members || []).forEach(function(m) {
          if (m.userId !== s.currentUser.userId) {
            window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.MESSAGE, payload);
            if (window._p2pSentCount !== undefined) window._p2pSentCount++;
          }
        });
      } else {
        var friend = s.friends.find(function(f) { return f.userId === targetId; });
        if (friend) {
          window.orbitAPI.networkSend(targetId, friend.ip || '', window.Protocol.Types.MESSAGE, payload);
          if (window._p2pSentCount !== undefined) window._p2pSentCount++;
        }
      }

      if (window.Toast) window.Toast.show('Forwarded', 'Message sent to ' + targetContact.name);
      overlay.remove();
    }

    document.getElementById('forward-modal-close').addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

    var searchInput = document.getElementById('forward-search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.addEventListener('input', function() {
        var q = this.value.trim().toLowerCase();
        var rows = panel.querySelectorAll('.forward-contact-row');
        rows.forEach(function(row) {
          var name = row.querySelector('div > div:first-child').textContent.toLowerCase();
          row.style.display = name.indexOf(q) !== -1 ? 'flex' : 'none';
        });
      });

      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') overlay.remove();
      });
    }

    panel.querySelectorAll('.forward-contact-row').forEach(function(row) {
      row.addEventListener('click', function() {
        doForward(this.getAttribute('data-contact-id'));
      });
    });
  },

  _showAvWarningModal() {
    var _this = this;
    return new Promise(function(resolve) {
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;';

      var card = document.createElement('div');
      card.style.cssText = 'background:var(--bg-surface);border-radius:var(--radius-lg);padding:24px;max-width:400px;width:90%;box-shadow:var(--shadow-xl);';

      card.innerHTML =
        '<div style="text-align:center;margin-bottom:16px;">' +
          '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#f59e0b" stroke-width="2" style="display:block;margin:0 auto;">' +
            '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>' +
            '<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' +
          '</svg>' +
          '<h3 style="margin:12px 0 8px 0;font-size:16px;font-weight:600;color:var(--text-normal);">Unstable Transfer Warning</h3>' +
          '<p style="margin:0;font-size:13px;color:var(--text-muted);line-height:1.5;">' +
            'Audio and video file transfers are still unstable. The file may not play correctly or the transfer may fail.' +
          '</p>' +
        '</div>' +
        '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 0;user-select:none;">' +
          '<input type="checkbox" id="chk-av-warn-dismiss" style="width:16px;height:16px;accent-color:#f59e0b;cursor:pointer;">' +
          '<span style="font-size:12px;color:var(--text-muted);">Don\'t show this warning again</span>' +
        '</label>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">' +
          '<button class="btn-av-warning-cancel" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-surface);color:var(--text-normal);cursor:pointer;font-size:13px;">Cancel</button>' +
          '<button class="btn-av-warning-proceed" style="padding:8px 16px;border-radius:8px;border:none;background:#f59e0b;color:#fff;cursor:pointer;font-size:13px;font-weight:500;">Send Anyway</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function cleanup() {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) { cleanup(); resolve(false); }
      });

      overlay.querySelector('.btn-av-warning-cancel').addEventListener('click', function() {
        cleanup();
        resolve(false);
      });
      overlay.querySelector('.btn-av-warning-proceed').addEventListener('click', function() {
        var dontShow = document.getElementById('chk-av-warn-dismiss').checked;
        if (dontShow) {
          try { localStorage.setItem('orbit_av_warn_hidden', '1'); } catch(e) {}
        }
        cleanup();
        resolve(true);
      });
    });
  },

  async sendMessage(text) {
    if (this._sending) return;
    this._sending = true;
    var state = window.store.getState();
    var activeChatId = state.activeChatId;
    if (!activeChatId) { this._sending = false; return; }

    if (!text && this.stagedFiles.length === 0) { this._sending = false; return; }

    // Warn about unstable audio/video transfers before proceeding
    var hasAvFile = this.stagedFiles.some(function(s) { return s.type === 'audio' || s.type === 'video'; });
    if (hasAvFile) {
      try {
        if (localStorage.getItem('orbit_av_warn_hidden') === '1') { /* skip */ }
        else {
          var proceed = await this._showAvWarningModal();
          if (!proceed) { this._sending = false; return; }
        }
      } catch(e) { /* localStorage unavailable */ }
    }

    const friend = state.friends.find(function(f) { return f.userId === activeChatId; });
    const activeGroup = state.groups.find(function(g) { return g.groupId === activeChatId; });
    const isGroup = !!activeGroup;
    const myId = state.currentUser.userId;

    // Get all recipients for this message
    var recipients = [];
    if (isGroup) {
      var members = activeGroup.members || [];
      members.forEach(function(m) {
        if (m.userId !== myId) {
          recipients.push({ userId: m.userId, ip: m.ip || '' });
        }
      });
    } else if (friend) {
      recipients.push({ userId: friend.userId, ip: friend.ip || '' });
    }

    // Helper: send to all recipients (with packet size logging)
    function sendToAll(type, payload) {
      if (window.orbitAPI && activeChatId !== 'local-echo') {
        var payloadStr = JSON.stringify(payload);
        if (payloadStr.length > 100 * 1024) {
          console.log('[SEND] type=' + type + ' size=' + (payloadStr.length / 1024).toFixed(1) + 'KB recipients=' + recipients.length);
        }
        recipients.forEach(function(r) {
          window.orbitAPI.networkSend(r.userId, r.ip, type, payload);
          if (type === window.Protocol.Types.MESSAGE && window._p2pSentCount !== undefined) window._p2pSentCount++;
        });
      } else if (activeChatId === 'local-echo') {
        var echoPayload = payload.text ? { text: 'Echo: ' + payload.text, msgId: Date.now() + 1, replyTo: payload.replyTo } : null;
        if (echoPayload) {
          setTimeout(function() {
            window.store.addMessage('local-echo', {
              id: Date.now() + 1,
              sender: 'local-echo',
              text: echoPayload.text,
              replyTo: echoPayload.replyTo,
              timestamp: new Date().toISOString()
            });
          }, 500);
        }
      }
    }

    // Handle edit separately (text-only)
    if (this.editingMsg) {
      const editId = this.editingMsg.id;
      var editPayload = { msgId: editId, newText: text || '' };
      if (isGroup) editPayload.chatId = activeChatId;
      sendToAll(window.Protocol.Types.MESSAGE_EDIT, editPayload);
      window.store.editMessage(activeChatId, editId, text || '');
      this.editingMsg = null;
      var input = document.getElementById('chat-input');
      if (input) input.value = '';
      localStorage.removeItem('orbit_draft_' + activeChatId);
      window.store.notify();
      this._sending = false;
      return;
    }

    // ---- Slash command handling (parity with mobile/src/js/app.js:3077) ----
    // GROUP-ONLY — all slash commands are group utilities (Orbit is local-first P2P, no AI).
    // isGroup already resolved above; _handleSlashCommand also enforces the guard and shows Toast for DMs.
    if (text && text.trim().startsWith('/')) {
      var slashResult = this._handleSlashCommand(text, activeChatId);
      if (slashResult) {
        if (slashResult.cancel) {
          this._sending = false;
          var _slashInput = document.getElementById('chat-input');
          if (_slashInput) { _slashInput.value = ''; _slashInput.style.height = 'auto'; }
          this.hideSlashTooltip();
          return;
        }
        if (slashResult.handled) {
          if (slashResult.text !== undefined) text = slashResult.text;
          // stash poll/spoiler for payload building below
          this._pendingSlashPoll = slashResult.poll || null;
          this._pendingSlashSpoiler = !!slashResult.isSpoiler;
        }
      }
    }

    // Limit: files over this size use chunked FILE_TRANSFER instead of inline base64
    var INLINE_LIMIT = 1.5 * 1024 * 1024; // 1.5 MB
    // CHUNK_SIZE is module-scope now — see the note above.

    var localAttachments = [];
    var inlineAttachments = [];
    var largeFiles = []; // { staged, data, att }

    if (this.stagedFiles.length > 0) {
      const fileBuffers = await Promise.all(this.stagedFiles.map(async (s) => {
        if (s.file) {
          try {
            const ab = await s.file.arrayBuffer();
            if (ab && ab.byteLength > 0) return ab;
          } catch(e) { /* ignore */ }
        }
        return null;
      }));

      var attId = Date.now();
      for (var fi = 0; fi < this.stagedFiles.length; fi++) {
        var s = this.stagedFiles[fi];
        var fileData = fileBuffers[fi];
        var att = {
          id: String(attId + fi),
          type: s.type,
          name: s.name,
          size: s.size,
          path: s.path,
          data: fileData,
          url: 'orbit-db://attachment/' + String(attId + fi) + '?t=' + Date.now(),
          width: s.width || 0,
          height: s.height || 0
        };
        localAttachments.push(att);

        if (fileData && fileData.byteLength >= INLINE_LIMIT) {
          // Large file: send via chunked FILE_TRANSFER protocol (mobile-compatible)
          if (s.type === 'audio' || s.type === 'video') {
            var rawMime = s.file ? s.file.type : (s.type === 'audio' ? 'audio/mpeg' : 'video/mp4');
            att.url = URL.createObjectURL(new Blob([fileData], { type: rawMime }));
          }
          largeFiles.push({ staged: s, data: fileData, att: att });
        } else if (fileData) {
          // Small file: inline as base64 data URL in MESSAGE payload
          var bytes = new Uint8Array(fileData);
          var binary = '';
          for (var b = 0; b < bytes.byteLength; b++) {
            binary += String.fromCharCode(bytes[b]);
          }
          var mimeType = s.file ? s.file.type : (s.type === 'image' ? 'image/png' : (s.type === 'audio' ? 'audio/mpeg' : 'application/octet-stream'));
          var dataUrl = 'data:' + mimeType + ';base64,' + btoa(binary);
          // Use blob URL for local display (CSP allows blob: in media-src)
          if (s.type === 'audio' || s.type === 'video') {
            att.url = URL.createObjectURL(new Blob([fileData], { type: mimeType }));
          }
          inlineAttachments.push({
            id: att.id,
            name: s.name,
            type: s.type,
            size: s.size,
            url: dataUrl,
            width: s.width || 0,
            height: s.height || 0
          });
        } else if (s.url && typeof s.url === 'string' && s.url.indexOf('data:') === 0) {
          if (s.type === 'audio' || s.type === 'video') {
            att.url = s.url;
          }
          inlineAttachments.push({
            id: att.id,
            name: s.name,
            type: s.type,
            size: s.size,
            url: s.url,
            width: s.width || 0,
            height: s.height || 0
          });
        }
      }
    }

    // ---- Pre-generate fileIds for large files (used in MESSAGE _fileId + FILE_TRANSFER) ----
    var _largeFileIds = {};
    largeFiles.forEach(function(lf) {
      var fid = (window.orbitAPI && window.orbitAPI.getUuid) ? window.orbitAPI.getUuid() : (Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
      _largeFileIds[lf.att.id] = fid;
      lf._fileId = fid;
    });

    // ---- Generate posters for video files before sending ----
    await Promise.all(largeFiles.map(async function(lf) {
      if (lf.staged.type !== 'video' || !lf.staged.file) return;
      try {
        var videoUrl = URL.createObjectURL(lf.staged.file);
        var vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.muted = true;
        vid.playsInline = true;
        vid.src = videoUrl;
        await new Promise(function(resolve, reject) {
          var timeout = setTimeout(function() { vid.remove(); URL.revokeObjectURL(videoUrl); resolve(); }, 8000);
          vid.addEventListener('loadeddata', function() {
            vid.currentTime = 0.5;
          });
          vid.addEventListener('seeked', function() {
            try {
              var canvas = document.createElement('canvas');
              canvas.width = vid.videoWidth || 320;
              canvas.height = vid.videoHeight || 240;
              canvas.getContext('2d').drawImage(vid, 0, 0);
              lf.staged._poster = canvas.toDataURL('image/jpeg', 0.6);
            } catch(e) { /* poster capture failed */ }
            clearTimeout(timeout);
            vid.remove();
            URL.revokeObjectURL(videoUrl);
            resolve();
          });
          vid.addEventListener('error', function() {
            clearTimeout(timeout);
            vid.remove();
            URL.revokeObjectURL(videoUrl);
            resolve();
          });
          vid.load();
        });
      } catch(e) {
        console.warn('[ChatPanel] Failed to generate video poster:', e);
      }
    }));

    // ---- Send MESSAGE with text + small file data URLs (large files follow separately) ----
    var msgId = Date.now() + 2;
    if (text || inlineAttachments.length > 0 || largeFiles.length > 0) {
      var payload = {
        text: text || '',
        msgId: msgId
      };
      var state = window.store.getState();
      if (isGroup) {
        payload.chatId = activeChatId;
      }
      if (state.currentUser) payload.fromName = state.currentUser.name;
      if (this.replyingTo) {
        payload.replyTo = this.replyingTo.id;
      }
      payload.attachments = [];
      if (inlineAttachments.length > 0) {
        inlineAttachments.forEach(function(a) { payload.attachments.push(a); });
      }
      // Large files are deliberately NOT marked on this message any more. They used to
      // ride along as `_pending` attachments so the receiver could merge text+file into
      // one bubble (CRIT-4) — which is what produced a message captioned
      // "Receiving Video...". The text now goes as its own message and the file arrives
      // as its own when the transfer completes. Inline (small) attachments still ride
      // along above, unchanged.
      // Attach slash-command extras (poll/spoiler) if any — mirrors mobile payload
      if (this._pendingSlashPoll) {
        payload.poll = this._pendingSlashPoll;
      }
      if (this._pendingSlashSpoiler) {
        payload.isSpoiler = true;
      }

      // E2EE: encrypt text for the single DM recipient.
      //
      // If E2EE is enabled we must NOT fall back to plaintext. The user believes
      // the message is encrypted; sending it in the clear would silently break
      // that promise. Block the send and say why instead.
      // See plans/docs/Orbit E2EE Unification Design.md §5.2
      var settings = window.store.getState().settings;
      if (settings.e2eeEnabled && !isGroup && recipients.length === 1 && text) {
        var peer = recipients[0];
        var pubKey = window.store.getPeerPublicKey(peer.userId);
        var encrypted = (pubKey && window.orbitAPI && window.orbitAPI.e2eeEncrypt)
          ? window.orbitAPI.e2eeEncrypt(text, pubKey)
          : null;
        if (!encrypted) {
          // Reset the send lock or the composer stays stuck forever, and return
          // before sendToAll so no phantom message lands in the list.
          this._sending = false;
          this._notifyE2EEBlocked(peer, !pubKey);
          return;
        }
        if (encrypted.v === 2) {
          // Unified envelope. payload.text must NOT carry the plaintext —
          // the receiver reads ciphertext/nonce instead.
          payload.ciphertext = encrypted.ciphertext;
          payload.nonce = encrypted.nonce;
          payload.text = '';
        } else {
          // Legacy envelope for an older desktop peer.
          payload.text = encrypted.packed;
        }
        payload.e2ee = true;
      }

      sendToAll(window.Protocol.Types.MESSAGE, payload);
    }

    // ---- Send large files via chunked FILE_TRANSFER protocol (resumable) ----
    var sentFileIds = [];
    for (var li = 0; li < largeFiles.length; li++) {
      var lf = largeFiles[li];
      var fileData = lf.data;
      // Use pre-generated fileId from _fileId (matches MESSAGE attachment marker — CRIT-4)
      var fileId = lf._fileId;
      sentFileIds.push(fileId);
      var totalChunks = Math.ceil(fileData.byteLength / CHUNK_SIZE);

      // Compute SHA-256 hash
      var hash = '';
      try {
        if (window.crypto && window.crypto.subtle) {
          var hashBuffer = await window.crypto.subtle.digest('SHA-256', fileData);
          var hashView = new Uint8Array(hashBuffer);
          var hashParts = [];
          for (var hi = 0; hi < hashView.length; hi++) {
            var h = hashView[hi].toString(16);
            if (h.length < 2) h = '0' + h;
            hashParts.push(h);
          }
          hash = hashParts.join('');
        }
      } catch (e) {
        hash = '';
      }

      // Build the send session: pinned file data + recipients, so a
      // FILE_TRANSFER_RESUME from the receiver can re-send from an offset
      // (file is fully in memory; resume = skip i < receivedCount).
      var mimeType = lf.staged.mimeType || (lf.staged.file ? lf.staged.file.type : '');
      var session = {
        fileId: fileId,
        data: fileData,
        name: lf.staged.name,
        type: lf.staged.type,
        mimeType: mimeType,
        size: fileData.byteLength,
        totalChunks: totalChunks,
        hash: hash,
        recipients: recipients,
        isGroup: isGroup,
        chatId: activeChatId,
        _sending: false
      };
      // Send FILE_TRANSFER_START (only include chatId for groups — DM uses msgFrom routing)
      // Type/mimeType stamps let receivers (incl. mobile) honor the sender's
      // classification instead of guessing from the file extension.
      session.startPayload = {
        fileId: fileId,
        fileName: lf.staged.name,
        fileSize: fileData.byteLength,
        totalChunks: totalChunks,
        hash: hash,
        type: lf.staged.type,
        mimeType: mimeType
      };
      if (isGroup) session.startPayload.chatId = activeChatId;
      this._sendSessions[fileId] = session;

      session._sending = true;
      try {
        await this._sendFileChunks(session, 0);
      } finally {
        session._sending = false;
        // Release the pinned full-file buffer as soon as the loop finishes
        // (F3: it was held for the whole app session) and mark the session
        // for sweeping; also clear any RESUME that landed between the last
        // chunk and END so it cannot rewind a later pass (F5).
        session.doneAt = Date.now();
        session.data = null;
        delete this._resumeRequests[fileId];
        setTimeout(() => this._sweepSendSessions(), 60000);
      }
    }

    // Clean up transfer progress for sent files
    if (sentFileIds.length > 0 && window.store) {
      var cp = { ...window.store.getState().transferProgress };
      sentFileIds.forEach(function(fid) { delete cp[fid]; });
      window.store.setState({ transferProgress: cp });
    }

    // Store locally with orbit-db attachment URLs
    var localId = (text || inlineAttachments.length > 0) ? msgId : (Date.now() + 3);
    var localMsg = {
      id: localId,
      sender: myId,
      text: text || '',
      timestamp: new Date().toISOString()
    };
    if (localAttachments.length > 0) {
      localMsg.attachments = localAttachments;
    }
    if (this.replyingTo) {
      localMsg.replyTo = this.replyingTo.id;
    }
    // Mirror poll/spoiler slash extras into local echo — parity with mobile newMsg.poll / isSpoiler
    if (this._pendingSlashPoll) {
      localMsg.poll = this._pendingSlashPoll;
    }
    if (this._pendingSlashSpoiler) {
      localMsg.isSpoiler = true;
    }
    // Clear pending slash state for next send
    this._pendingSlashPoll = null;
    this._pendingSlashSpoiler = false;
    window.store.addMessage(activeChatId, localMsg);

    // The blobs have been read and sent, so this is where they are released.
    // Nothing revokes them otherwise and a long session would hold every image
    // it ever sent.
    this.stagedFiles.forEach(function (s) { if (s && s.url) { try { URL.revokeObjectURL(s.url); } catch (e) {} } });
    this.stagedFiles = [];
    this.renderPreviewArea();
    this.replyingTo = null;
    this.hideSlashTooltip();

    // Clear UI state
    var input = document.getElementById('chat-input');
    if (input) input.value = '';
    localStorage.removeItem('orbit_draft_' + activeChatId);
    window.store.notify();
    this._sending = false;
  },

  // Shown when E2EE is enabled but a message cannot be encrypted. Blocking is
  // deliberate — a silent plaintext fallback would mean the user believes a
  // message is encrypted when it is not.
  _notifyE2EEBlocked(peer, keyMissing) {
    var name = 'this contact';
    try {
      var st = window.store.getState();
      var f = st.friends.find(function(x) { return x.userId === (peer && peer.userId); });
      if (f) name = f.username || f.name || name;
      else if (peer && peer.userId) name = peer.userId;
    } catch (e) { /* store unavailable */ }

    var reason = keyMissing
      ? "Orbit doesn't have " + name + "'s encryption key yet."
      : 'Orbit could not encrypt this message.';
    var advice = ' It was NOT sent, because sending it unencrypted would break your ' +
      'End-to-End Encryption setting. Turn E2EE off in Settings \u2192 Data Manager ' +
      'if you want to send unencrypted.';

    if (window.Toast && window.Toast.show) {
      window.Toast.show('Message not sent', reason + advice, 'error', 9000);
    } else {
      console.warn('[E2EE] Blocked send to ' + name + ' — ' + reason);
    }
  },

  // Send a packet to the given recipients via the main-process socket layer.
  // (sendToAll is a closure inside sendMessage; file chunks need the same
  // routing from the resume handler, which runs outside that closure.)
  _sendToRecipients(recipients, type, payload) {
    if (!window.orbitAPI) return;
    recipients.forEach(function(r) {
      window.orbitAPI.networkSend(r.userId, r.ip, type, payload);
    });
  },

  // Stream a session's chunks starting at `resumeFrom`. The file lives fully
  // in memory (session.data), so resuming just means starting the loop at a
  // different index. Mid-stream FILE_TRANSFER_RESUME requests rewind the loop
  // (this._resumeRequests) instead of starting a second, interleaved stream.
  async _sendFileChunks(session, resumeFrom) {
    var totalChunks = session.totalChunks;
    var fileData = session.data;
    var fileId = session.fileId;

    // (Re-)send FILE_TRANSFER_START with the same fileId — the receiver's
    // CRIT-4 merge depends on _fileId stability, and a persisted receiver
    // resumes its write cursor when hash + fileId match.
    this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_START, session.startPayload);

    var ci = Math.max(0, resumeFrom) || 0;
    while (ci < totalChunks) {
      // Peer aborted the transfer (incoming FILE_TRANSFER_CANCEL): stop
      // streaming — no more chunks and no FILE_TRANSFER_END.
      if (session.cancelled) {
        this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_CANCEL, { fileId: fileId });
        console.log('[ChatPanel] Send cancelled for ' + fileId + ' — aborting chunk stream');
        return;
      }
      // Mid-stream resume request from the receiver: rewind to the requested
      // contiguous count (chunks in [requested, ci) were lost on the wire).
      var req = this._resumeRequests[fileId];
      if (req !== undefined) {
        delete this._resumeRequests[fileId];
        if (req >= 0 && req < ci) {
          ci = req;
          this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_START, session.startPayload);
          continue;
        }
        // req >= ci: receiver is not behind enough to rewind — continue
      }

      var start = ci * CHUNK_SIZE;
      var end = Math.min(start + CHUNK_SIZE, fileData.byteLength);
      var chunkBytes = new Uint8Array(fileData.slice(start, end));
      var chunkBinary = '';
      for (var cb = 0; cb < chunkBytes.byteLength; cb++) {
        chunkBinary += String.fromCharCode(chunkBytes[cb]);
      }
      var chunkBase64 = btoa(chunkBinary);

      this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_CHUNK, {
        fileId: fileId,
        chunkIndex: ci,
        data: chunkBase64
      });

      // Report progress
      if (window.store) {
        var cp = window.store.getState().transferProgress || {};
        var updated = {};
        updated[fileId] = { received: ci + 1, total: totalChunks, name: session.name, isSending: true };
        window.store.setState({
          transferProgress: Object.assign({}, cp, updated)
        });
      }

      // Yield to event loop between chunks
      await new Promise(function(r) { setTimeout(r, 0); });
      ci++;
    }

    // Send FILE_TRANSFER_END (only include chatId for groups)
    var ftEndPayload = { fileId: fileId, hash: session.hash };
    if (session.isGroup) ftEndPayload.chatId = session.chatId;
    this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_END, ftEndPayload);
  },

  // Receiver → sender: the peer asks us to resume a partial chunked transfer.
  // Reaches the renderer only when the main process has no send session for
  // this fileId (i.e. the file was sent through this chat path).
  async handleFileTransferResume(packet) {
    var payload = packet && packet.payload;
    if (!payload || !payload.fileId) return;
    var session = this._sendSessions && this._sendSessions[payload.fileId];
    if (!session) {
      console.log('[ChatPanel] RESUME for unknown fileId ' + payload.fileId + ' — send session gone (app restart?), ignoring');
      return;
    }

    // F4: validate the offset before trusting it (mirrors
    // TransferManager._resumeSessionSend) — garbage n must not rewind the loop.
    var n = Number(payload.receivedCount);
    if (!isFinite(n) || n < 0 || n > session.totalChunks) {
      console.warn('[ChatPanel] RESUME invalid receivedCount ' + payload.receivedCount + ' for ' + payload.fileId + ' — cancelling transfer');
      this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_CANCEL, { fileId: payload.fileId, error: 'Invalid resume offset' });
      return;
    }

    // F4: when the receiver's partial can still be verified (session.data
    // present), hash the claimed contiguous prefix and compare. A mismatch —
    // or a missing hash for a non-empty partial — means the receiver's file
    // is corrupt or unrelated: cancel instead of silently re-sending.
    if (session.data) {
      var prefixBytes = Math.min(n * 65536, session.data.byteLength);
      var hex = '';
      try {
        var hashBuffer = await window.crypto.subtle.digest('SHA-256', session.data.slice(0, prefixBytes));
        var hashView = new Uint8Array(hashBuffer);
        var hashParts = [];
        for (var hi = 0; hi < hashView.length; hi++) {
          var h = hashView[hi].toString(16);
          if (h.length < 2) h = '0' + h;
          hashParts.push(h);
        }
        hex = hashParts.join('').toLowerCase();
      } catch (e) {
        hex = '';
      }
      var receiverHash = payload.hash ? String(payload.hash).toLowerCase() : '';
      if ((receiverHash && hex !== receiverHash) || (n > 0 && !receiverHash)) {
        console.warn('[ChatPanel] RESUME partial hash mismatch for ' + payload.fileId + ' (received ' + n + ' chunks) — cancelling transfer');
        this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_CANCEL, { fileId: payload.fileId, error: 'Receiver partial does not match sender file' });
        session.cancelled = true;
        return;
      }
    } else if (n < session.totalChunks) {
      // F3: the full-file buffer was released after the send loop finished —
      // a partial resume can no longer be verified, so ignore the request.
      console.log('[ChatPanel] RESUME for ' + payload.fileId + ' at chunk ' + n + ' ignored — send session buffer released (cannot verify partial)');
      return;
    }

    if (n >= session.totalChunks) {
      // Receiver has every chunk; it only missed FILE_TRANSFER_END. Re-send
      // END and drop the session (DM: single receiver, transfer is complete).
      var ftEndPayload = { fileId: session.fileId, hash: session.hash };
      if (session.isGroup) ftEndPayload.chatId = session.chatId;
      this._sendToRecipients(session.recipients, window.Protocol.Types.FILE_TRANSFER_END, ftEndPayload);
      if (!session.isGroup) delete this._sendSessions[session.fileId];
      return;
    }

    if (session._sending) {
      // A chunk loop is currently streaming this file — rewind it in place
      // rather than starting a second, interleaved stream.
      this._resumeRequests[payload.fileId] = n;
      console.log('[ChatPanel] RESUME mid-send: rewinding ' + payload.fileId + ' to chunk ' + n);
    } else {
      // First pass already finished — run a fresh pass from the offset.
      console.log('[ChatPanel] RESUME re-send: streaming ' + payload.fileId + ' from chunk ' + n);
      var self = this;
      session._sending = true;
      this._sendFileChunks(session, n).catch(function(err) {
        console.warn('[ChatPanel] Resume re-send failed:', err && err.message);
      }).finally(function() {
        session._sending = false;
        session.doneAt = Date.now();
      });
    }
  },

  // F3: drop send sessions that finished >60s ago (their data buffer was
  // already released in sendMessage's finally). In-flight sessions are kept.
  _sweepSendSessions() {
    var cutoff = Date.now() - 60000;
    var self = this;
    Object.keys(this._sendSessions).forEach(function(fid) {
      var s = self._sendSessions[fid];
      if (s && s.doneAt && s.doneAt < cutoff && !s._sending) delete self._sendSessions[fid];
    });
  },

  _injectMessageParticles() {
    if (!window.store) return;
    var s = window.store.getState();
    if (!s.settings.experimentalMessageFx) return;
    var feed = document.getElementById('chat-message-feed');
    if (!feed) return;
    var bubbles = feed.querySelectorAll('.message-own .message-bubble');
    if (!bubbles.length) return;
    var colors = ['#ffd700','#ff6b6b','#48dbfb','#ff9ff3','#feca57','#a29bfe','#fd79a8','#00cec9'];
    var count = 10 + Math.floor(Math.random() * 6);
    for (var bi = 0; bi < bubbles.length; bi++) {
      for (var i = 0; i < count; i++) {
        var p = document.createElement('div');
        p.className = 'fx-particle';
        var angle = Math.random() * 360;
        var dist = 25 + Math.random() * 55;
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
  },

  initSwipeToReply() {
    if (this._swipeInitialized) return;
    var self = this;
    var swipeState = null;
    var DRAG_MAX = 80;
    var TRIGGER_THRESHOLD = 55;

    function getRow(id) {
      return document.querySelector('.message-row[data-msg-id="' + id + '"]');
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
      ind.style.opacity = progress;
      ind.style.transform = 'translateY(-50%) scale(' + scale + ')';
      if (progress >= 1) {
        ind.style.color = 'var(--accent-primary)';
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

    function triggerReply(row) {
      var msgId = row.getAttribute('data-msg-id');
      if (!msgId) return;
      var state = window.store.getState();
      var msgList = state.messages[state.activeChatId] || [];
      var msg = msgList.find(function(m) { return String(m.id) === msgId; });
      if (msg) {
        var friendName = state.friends.find(function(f) { return f.userId === state.activeChatId; });
        self.replyingTo = {
          id: msg.id,
          text: msg.text,
          senderName: msg.sender === state.currentUser.userId ? 'You' : (friendName ? friendName.username : 'User'),
          attachments: msg.attachments || null
        };
        self.editingMsg = null;
        var existing = document.getElementById('reply-edit-bar');
        if (existing) existing.remove();
        if (!self.replyingTo) return;
        var rText = (self.replyingTo.text || '').substring(0, 80);
        var rFallback = '';
        if (!rText && self.replyingTo.attachments && self.replyingTo.attachments.length > 0) {
          rFallback = '(' + self.replyingTo.attachments[0].name + ')';
        } else if (!rText) {
          rFallback = '(Attachment)';
        }
        var barHtml = '<div id="reply-edit-bar" style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:12px;background:var(--bg-hover);border:1px solid var(--border-subtle);font-size:13px;color:var(--text-secondary);">' +
          '<i data-lucide="reply" style="width:14px;height:14px;flex-shrink:0;"></i>' +
          '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Replying to <b>' + window.Sanitize.escapeHtml(self.replyingTo.senderName || 'message') + '</b>: ' + window.Sanitize.escapeHtml(rText || rFallback) + '</span>' +
          '<button id="btn-cancel-reply" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:2px;">✕</button>' +
        '</div>';
        var previewArea = document.getElementById('file-preview-area');
        if (previewArea) {
          previewArea.insertAdjacentHTML('beforebegin', barHtml);
        }
        if (window.lucide) lucide.createIcons();
        var inp = document.getElementById('chat-input');
        if (inp) inp.focus();
      }
    }

    // Use this.container for delegation — it persists across innerHTML replacement
    // getRow() still finds rows via global querySelector
    var el = this.container;

    el.addEventListener('touchstart', function(e) {
      if (!window.store.getState().settings.swipeToReply || e.touches.length !== 1) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn, .link-preview')) return;
      var t = e.touches[0];
      swipeState = { id: row.getAttribute('data-msg-id'), x: t.clientX, y: t.clientY, locked: false };
    }, { passive: true });

    el.addEventListener('touchmove', function(e) {
      if (!swipeState || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - swipeState.x;
      var dy = t.clientY - swipeState.y;

      if (!swipeState.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeState.locked = true;
        swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipeState.locked || !swipeState.horizontal) return;

      if (dx >= 0) {
        var row = getRow(swipeState.id);
        if (row) applyDrag(row, 0);
        return;
      }

      e.preventDefault();
      var row = getRow(swipeState.id);
      if (row) applyDrag(row, dx);
    }, { passive: false });

    el.addEventListener('touchend', function(e) {
      if (!swipeState) return;
      var sid = swipeState.id;
      var row = getRow(sid);
      if (!row) { swipeState = null; return; }

      var triggered = false;
      if (e.changedTouches && e.changedTouches.length === 1) {
        var t = e.changedTouches[0];
        var dx = t.clientX - swipeState.x;
        var dy = t.clientY - swipeState.y;
        if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;
      }
      resetRow(row, triggered);
      if (triggered) triggerReply(row);
      swipeState = null;
    }, { passive: true });

    el.addEventListener('touchcancel', function() {
      if (swipeState) {
        var row = getRow(swipeState.id);
        if (row) resetRow(row, false);
      }
      swipeState = null;
    }, { passive: true });

    // Desktop mouse drag (same logic, adapted)
    el.addEventListener('mousedown', function(e) {
      if (!window.store.getState().settings.swipeToReply) return;
      if (e.button !== 0) return;
      var row = e.target.closest('.message-row');
      if (!row || e.target.closest('button, input, textarea, select, a, label, .reaction-pill, .reply-quote, .msg-action-btn, .link-preview, .msg-avatar, .att-thumb')) return;
      swipeState = { id: row.getAttribute('data-msg-id'), x: e.clientX, y: e.clientY, locked: false };
    });

    el.addEventListener('mousemove', function(e) {
      if (!swipeState) return;
      var dx = e.clientX - swipeState.x;
      var dy = e.clientY - swipeState.y;

      if (!swipeState.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        swipeState.locked = true;
        swipeState.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (!swipeState.locked || !swipeState.horizontal) return;

      if (dx >= 0) {
        var row = getRow(swipeState.id);
        if (row) applyDrag(row, 0);
        return;
      }

      var row = getRow(swipeState.id);
      if (row) applyDrag(row, dx);
    });

    el.addEventListener('mouseup', function(e) {
      if (!swipeState) return;
      var sid = swipeState.id;
      var row = getRow(sid);
      if (!row) { swipeState = null; return; }

      var triggered = false;
      var dx = e.clientX - swipeState.x;
      var dy = e.clientY - swipeState.y;
      if (dx < -TRIGGER_THRESHOLD && Math.abs(dy) < 70) triggered = true;

      resetRow(row, triggered);
      if (triggered) triggerReply(row);
      swipeState = null;
    });

    el.addEventListener('mouseleave', function() {
      if (swipeState) {
        var row = getRow(swipeState.id);
        if (row) resetRow(row, false);
      }
      swipeState = null;
    });

    this._swipeInitialized = true;
  },

  // Thread panel: shows the root message (walked up via replyTo chain) and every
  // message whose chain resolves to that root, newest last. Clicking a row
  // closes the panel and scrolls the chat feed to that message.
  // Handles both string ids (own messages) and numeric ids (incoming).
  showThreadPanel(chatId, msgId) {
    var existing = document.querySelector('.thread-panel-overlay');
    if (existing) { existing.remove(); }

    var self = this;
    var state = window.store.getState();
    var msgList = state.messages[chatId] || [];
    var msgById = {};
    msgList.forEach(function(m) { msgById[String(m.id)] = m; });

    var rootMsg = msgById[String(msgId)];
    if (!rootMsg) return;

    // Walk up the replyTo chain to the top parent (thread root)
    var seen = {};
    while (rootMsg.replyTo != null && !seen[String(rootMsg.id)]) {
      seen[String(rootMsg.id)] = true;
      var parent = msgById[String(rootMsg.replyTo)];
      if (!parent) break;
      rootMsg = parent;
    }

    // Collect every message whose chain resolves to the root
    var rootId = String(rootMsg.id);
    var chain = [rootMsg];
    msgList.forEach(function(m) {
      if (String(m.id) === rootId) return;
      var cur = m;
      var visited = {};
      while (cur && cur.replyTo != null && !visited[String(cur.id)]) {
        visited[String(cur.id)] = true;
        if (String(cur.replyTo) === rootId) { chain.push(m); return; }
        cur = msgById[String(cur.replyTo)];
      }
    });
    chain.sort(function(a, b) {
      var ta = a.timestamp || '', tb = b.timestamp || '';
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });

    function senderName(m) {
      if (m.sender === state.currentUser.userId) return 'You';
      var friend = state.friends.find(function(f) { return f.userId === m.sender; });
      if (friend) return friend.username;
      var group = state.groups.find(function(g) { return g.groupId === chatId; });
      if (group) {
        var member = (group.members || []).find(function(mm) { return mm.userId === m.sender; });
        if (member) return member.username;
      }
      return 'Unknown';
    }

    var rowsHtml = chain.map(function(m, idx) {
      var isRoot = idx === 0;
      var text = (m.text || '').substring(0, 140) + ((m.text || '').length > 140 ? '...' : '');
      if (!text && m.attachments && m.attachments.length > 0) text = '(' + m.attachments[0].name + ')';
      if (!text) text = '(Attachment)';
      var timeStr = (window.Format && window.Format.absoluteTime) ? window.Format.absoluteTime(m.timestamp).split(' · ')[0] : (m.timestamp || '');
      return '<div class="thread-row' + (isRoot ? ' thread-row-root' : '') + '" data-thread-msg-id="' + m.id + '" style="display:flex;flex-direction:column;gap:3px;padding:10px 16px;cursor:pointer;border-radius:8px;' + (isRoot ? 'background:var(--bg-hover);' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="font-size:13px;font-weight:600;color:' + (isRoot ? 'var(--accent-primary)' : 'var(--text-secondary)') + ';">' + window.Sanitize.escapeHtml(senderName(m)) + '</span>' +
          (isRoot ? '<span style="font-size:10px;font-weight:700;color:var(--accent-primary);border:1px solid var(--accent-primary);border-radius:4px;padding:0 5px;">ROOT</span>' : '') +
          '<span style="font-size:11px;color:var(--text-muted);margin-left:auto;flex-shrink:0;">' + window.Sanitize.escapeHtml(timeStr) + '</span>' +
        '</div>' +
        '<div style="font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.Sanitize.escapeHtml(text) + '</div>' +
      '</div>';
    }).join('');

    var overlay = document.createElement('div');
    overlay.className = 'thread-panel-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:80px;';

    var panel = document.createElement('div');
    panel.className = 'thread-panel';
    panel.style.cssText = 'width:460px;max-height:75vh;background:var(--bg-surface);border-radius:var(--radius-lg);border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);display:flex;flex-direction:column;overflow:hidden;';

    panel.innerHTML =
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="display:flex;align-items:center;gap:12px;">' +
          '<span style="font-weight:600;font-size:16px;flex:1;">Thread</span>' +
          '<span style="font-size:12px;color:var(--text-muted);">' + chain.length + ' message' + (chain.length > 1 ? 's' : '') + '</span>' +
          '<button id="thread-panel-close" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
        '</div>' +
      '</div>' +
      '<div class="thread-panel-list" style="flex:1;overflow-y:auto;padding:8px;">' + rowsHtml + '</div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    function onKey(e) { if (e.key === 'Escape') close(); }
    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.remove();
    }
    document.addEventListener('keydown', onKey);
    document.getElementById('thread-panel-close').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    panel.querySelectorAll('.thread-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var targetId = String(this.getAttribute('data-thread-msg-id') || '');
        close();
        var el = document.querySelector('[data-msg-id="' + targetId.replace(/"/g, '') + '"].message-row');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
  },

  /* ---- Slash Commands (parity with mobile/src/js/app.js:14-26 + 3058,3077,3167,3184) ---- */

  _parsePollArgs(str) {
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
  },

  _handleSlashCommand(text, chatId) {
    if (!text || !text.startsWith('/')) return null;
    // GROUP-ONLY guard — Orbit is local-first P2P; all 11 slash commands are group utilities (no AI). Even /help is group-only.
    var _targetId = chatId || (window.store && window.store.getState().activeChatId);
    var _groups = (window.store && window.store.getState().groups) || [];
    var _isGroup = !!_groups.find(function(g) { return g.groupId === _targetId || g.id === _targetId; });
    if (!_isGroup) {
      if (window.Toast) window.Toast.show('Slash Commands', 'Slash commands only work in group chats', 'info', 3000);
      return { cancel: true };
    }
    var parts = text.split(' ');
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1).join(' ');
    var self = this;

    switch(cmd) {
      case '/h':
      case '/help':
        self.showHelpModal();
        return { cancel: true };

      case '/pool':
      case '/poll':
        var pollArgs = self._parsePollArgs(text);
        if (pollArgs.length >= 3) {
          return {
            handled: true,
            text: '',
            poll: {
              question: pollArgs[0],
              options: pollArgs.slice(1).map(function(opt) { return { text: opt, votes: [] }; }),
              multiSelect: false,
              expiresAt: null
            }
          };
        }
        // UX friendly: open poll builder modal for bare / incomplete /poll
        var _tidPoll = chatId || (window.store && window.store.getState().activeChatId);
        var _initQ = '';
        if (pollArgs.length === 1) _initQ = pollArgs[0];
        else if (pollArgs.length === 2) _initQ = pollArgs[0];
        else {
          var _raw = text.slice(cmd.length).trim();
          if (_raw && _raw.indexOf('"') !== 0) {
            // strip surrounding quotes if user typed single quoted question without options
            _initQ = _raw.replace(/^"+|"+$/g, '');
          }
        }
        self._showPollBuilder(_tidPoll, _initQ);
        return { cancel: true };

      case '/me':
        return { handled: true, text: '*_' + args.trim() + '_*' };

      case '/shrug':
        return { handled: true, text: '¯\\_(ツ)_/¯' };

      case '/tableflip':
        return { handled: true, text: '(╯°□°）╯︵ ┻━┻' };

      case '/unflip':
        return { handled: true, text: '┬─┬ ノ( ゜-゜ノ)' };

      case '/lenny':
        return { handled: true, text: '( ͡° ͜ʖ ͡°)' };

      case '/roll':
        var max = parseInt(args, 10) || 6;
        if (max < 1) max = 6;
        if (max > 1000) max = 1000;
        var result = Math.floor(Math.random() * max) + 1;
        return { handled: true, text: '🎲 Rolled ' + result + ' (1-' + max + ')' };

      case '/flip':
        var outcomes = ['Heads', 'Tails'];
        return { handled: true, text: '🪙 ' + outcomes[Math.floor(Math.random() * 2)] };

      case '/spoiler':
        var spoilerText = args.trim();
        if (!spoilerText) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /spoiler hidden text', 'info', 3000);
          return { cancel: true };
        }
        return { handled: true, text: spoilerText, isSpoiler: true };

      case '/clear':
        // Local clear — mirrors mobile /clear (no network send). Works for DM and group chats.
        (function() {
          var targetId = chatId || (window.store && window.store.getState().activeChatId);
          if (!targetId) return;
          var msgs = window.store.getState().messages || {};
          if (!msgs[targetId] || msgs[targetId].length === 0) {
            if (window.Toast) window.Toast.show('Slash Command', 'No messages to clear', 'info', 2500);
            return;
          }
          var doClear = function() {
            var updated = Object.assign({}, window.store.getState().messages);
            updated[targetId] = [];
            window.store.setState({ messages: updated });
            if (window.orbitAPI && window.orbitAPI.dbSaveMessages) {
              window.orbitAPI.dbSaveMessages(targetId, []);
            }
            // Also clear any draft
            try { localStorage.removeItem('orbit_draft_' + targetId); } catch(e) {}
            window.store.notify();
            if (window.Toast) window.Toast.show('Chat Cleared', 'Messages cleared locally', 'success', 2500);
          };
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Clear Chat',
              message: 'Clear all messages in this chat? This cannot be undone (local only).',
              confirmText: 'Clear',
              danger: true,
              onConfirm: doClear
            });
          } else if (confirm('Clear all messages in this chat? This cannot be undone.')) {
            doClear();
          }
        })();
        return { cancel: true };

      case '/invite': {
        var _tidInvite = chatId || (window.store && window.store.getState().activeChatId);
        var _stInvite = window.store ? window.store.getState() : { groups: [] };
        var _grpInvite = _stInvite.groups.find(function(g) { return g.groupId === _tidInvite || g.id === _tidInvite; });
        if (!_grpInvite) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        var _codeInvite = _grpInvite.inviteCode || '';
        var _nameInvite = _grpInvite.groupName || 'Group';
        (function() {
          var existingIv = document.querySelector('.slash-invite-overlay');
          if (existingIv) existingIv.remove();
          var overlay = document.createElement('div');
          overlay.className = 'slash-invite-overlay';
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
          var panel = document.createElement('div');
          panel.style.cssText = 'width:360px;max-width:90vw;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);padding:20px;';
          var safeCode = window.Sanitize ? window.Sanitize.escapeHtml(_codeInvite) : _codeInvite;
          var safeName = window.Sanitize ? window.Sanitize.escapeHtml(_nameInvite) : _nameInvite;
          panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
            '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary);">Invite — ' + safeName + '</h3>' +
            '<button id="slash-invite-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
            '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Share this code to invite others:</div>' +
            '<div style="display:flex;align-items:center;gap:8px;background:var(--bg-hover);border:1px solid var(--border-subtle);border-radius:10px;padding:10px 12px;">' +
              '<span style="flex:1;font-family:var(--font-mono,monospace);font-size:15px;font-weight:600;letter-spacing:0.5px;color:var(--accent-primary);word-break:break-all;">' + (safeCode || '(no code)') + '</span>' +
              '<button id="slash-invite-copy" style="flex-shrink:0;background:var(--accent-primary);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">Copy</button>' +
            '</div>';
          overlay.appendChild(panel);
          document.body.appendChild(overlay);
          if (window.lucide) window.lucide.createIcons({ root: overlay });
          function closeIv() {
            document.removeEventListener('keydown', onKeyIv);
            if (overlay.parentNode) overlay.remove();
          }
          function onKeyIv(e) { if (e.key === 'Escape') closeIv(); }
          document.addEventListener('keydown', onKeyIv);
          var closeBtn = document.getElementById('slash-invite-close');
          if (closeBtn) closeBtn.addEventListener('click', closeIv);
          overlay.addEventListener('click', function(e) { if (e.target === overlay) closeIv(); });
          var copyBtn = document.getElementById('slash-invite-copy');
          if (copyBtn) copyBtn.addEventListener('click', function() {
            var doToast = function(ok) {
              if (window.Toast) window.Toast.show(ok ? 'Copied' : 'Copy Failed', ok ? 'Invite code copied' : 'Could not copy', ok ? 'success' : 'error', 2000);
            };
            if (window.orbitAPI && window.orbitAPI.writeClipboard) {
              try { window.orbitAPI.writeClipboard(_codeInvite); doToast(true); } catch(err) { doToast(false); }
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(_codeInvite).then(function(){ doToast(true); }, function(){ doToast(false); });
            } else {
              doToast(false);
            }
          });
        })();
        return { cancel: true };
      }

      case '/members':
      case '/list': {
        var _tidMem = chatId || (window.store && window.store.getState().activeChatId);
        var _stMem = window.store ? window.store.getState() : { groups: [], friends: [] };
        var _grpMem = _stMem.groups.find(function(g) { return g.groupId === _tidMem || g.id === _tidMem; });
        if (!_grpMem) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        (function() {
          var existingMem = document.querySelector('.slash-members-overlay');
          if (existingMem) existingMem.remove();
          var overlay = document.createElement('div');
          overlay.className = 'slash-members-overlay';
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
          var panel = document.createElement('div');
          panel.style.cssText = 'width:380px;max-width:90vw;max-height:75vh;overflow-y:auto;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);padding:20px;';
          var members = _grpMem.members || [];
          var safeGroupName = window.Sanitize ? window.Sanitize.escapeHtml(_grpMem.groupName || 'Group') : (_grpMem.groupName || 'Group');
          var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
            '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary);">' + safeGroupName + ' — Members (' + members.length + ')</h3>' +
            '<button id="slash-members-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
            '</div>';
          if (members.length === 0) {
            html += '<div style="font-size:13px;color:var(--text-muted);padding:12px 0;">No members found.</div>';
          } else {
            for (var mi = 0; mi < members.length; mi++) {
              var m = members[mi];
              var role = m.role || (m.userId === _grpMem.ownerId ? 'owner' : 'member');
              var roleBadge = role === 'owner' ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-primary);border-radius:4px;padding:1px 6px;">OWNER</span>' : (role === 'admin' ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent-success);border-radius:4px;padding:1px 6px;">ADMIN</span>' : '<span style="font-size:10px;color:var(--text-muted);border:1px solid var(--border-subtle);border-radius:4px;padding:1px 6px;">MEMBER</span>');
              var isSelf = window.store && window.store.getState().currentUser && m.userId === window.store.getState().currentUser.userId;
              var friend = (_stMem.friends || []).find(function(f) { return f.userId === m.userId; });
              var onlineDot = friend && friend.status === 'online' ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--accent-success);display:inline-block;" title="Online"></span>' : (friend ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--text-muted);display:inline-block;opacity:0.4;" title="Offline"></span>' : '');
              var nameEsc = window.Sanitize ? window.Sanitize.escapeHtml(m.username || m.userId || 'Unknown') : (m.username || m.userId);
              var tagEsc = m.usertag ? (window.Sanitize ? window.Sanitize.escapeHtml(m.usertag) : m.usertag) : '';
              html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-subtle);">' +
                '<div style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">' + (m.avatar ? '<img src="' + (window.Sanitize ? window.Sanitize.escapeHtml(m.avatar) : m.avatar) + '" style="width:100%;height:100%;object-fit:cover;">' : '<i data-lucide="user-round" style="width:16px;height:16px;color:var(--text-muted);"></i>') + '</div>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div style="display:flex;align-items:center;gap:6px;"><span style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + nameEsc + (isSelf ? ' (you)' : '') + '</span>' + onlineDot + '</div>' +
                  (tagEsc ? '<div style="font-size:11px;color:var(--text-muted);">@' + tagEsc + '</div>' : '') +
                '</div>' +
                roleBadge +
              '</div>';
            }
          }
          panel.innerHTML = html;
          overlay.appendChild(panel);
          document.body.appendChild(overlay);
          if (window.lucide) window.lucide.createIcons({ root: overlay });
          function closeMem() {
            document.removeEventListener('keydown', onKeyMem);
            if (overlay.parentNode) overlay.remove();
          }
          function onKeyMem(e) { if (e.key === 'Escape') closeMem(); }
          document.addEventListener('keydown', onKeyMem);
          var closeBtnMem = document.getElementById('slash-members-close');
          if (closeBtnMem) closeBtnMem.addEventListener('click', closeMem);
          overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMem(); });
        })();
        return { cancel: true };
      }

      case '/topic': {
        var topicArgs = args.trim();
        if (!topicArgs) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /topic New description', 'info', 3000);
          return { cancel: true };
        }
        var _tidTopic = chatId || (window.store && window.store.getState().activeChatId);
        var _stTopic = window.store ? window.store.getState() : { groups: [], currentUser: {} };
        var _grpTopic = _stTopic.groups.find(function(g) { return g.groupId === _tidTopic || g.id === _tidTopic; });
        if (!_grpTopic) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        var _selfId = _stTopic.currentUser && _stTopic.currentUser.userId;
        var _selfMem = (_grpTopic.members || []).find(function(m) { return m.userId === _selfId; });
        var _role = _selfMem ? (_selfMem.role || (_grpTopic.ownerId === _selfId ? 'owner' : 'member')) : 'member';
        var _isPriv = _role === 'owner' || _role === 'admin' || _grpTopic.ownerId === _selfId;
        if (!_isPriv) {
          if (window.Toast) window.Toast.show('Slash Command', 'Only owner/admin can change the group description', 'error', 3000);
          return { cancel: true };
        }
        if (window.store.updateGroupField) {
          window.store.updateGroupField(_grpTopic.groupId, 'description', topicArgs);
        } else {
          _grpTopic.description = topicArgs;
          if (window.store.save) window.store.save();
          else if (window.store.setState) window.store.setState({ groups: _stTopic.groups });
        }
        // Broadcast GROUP_UPDATE if protocol supports it, else try generic SYSTEM update
        try {
          var _payload = { groupId: _grpTopic.groupId, field: 'description', value: topicArgs, description: topicArgs };
          var _type = (window.Protocol && window.Protocol.Types && window.Protocol.Types.GROUP_UPDATE) ? window.Protocol.Types.GROUP_UPDATE : (window.Protocol && window.Protocol.Types && window.Protocol.Types.SYSTEM ? window.Protocol.Types.SYSTEM : null);
          if (_type && window.orbitAPI && window.orbitAPI.networkSend) {
            (_grpTopic.members || []).forEach(function(m) {
              if (m.userId !== _selfId) window.orbitAPI.networkSend(m.userId, m.ip || '', _type, _payload);
            });
          }
        } catch(e) {}
        if (window.Toast) window.Toast.show('Group Updated', 'Description updated', 'success', 2500);
        return { cancel: true };
      }

      case '/leave': {
        var _tidLeave = chatId || (window.store && window.store.getState().activeChatId);
        var _stLeave = window.store ? window.store.getState() : { groups: [] };
        var _grpLeave = _stLeave.groups.find(function(g) { return g.groupId === _tidLeave || g.id === _tidLeave; });
        if (!_grpLeave) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        (function() {
          var doLeave = function() {
            var gid = _grpLeave.groupId;
            var selfId = window.store.getState().currentUser && window.store.getState().currentUser.userId;
            // Broadcast leave to peers before local removal
            try {
              if (window.orbitAPI && window.orbitAPI.networkSend) {
                (_grpLeave.members || []).forEach(function(m) {
                  if (m.userId !== selfId) window.orbitAPI.networkSend(m.userId, m.ip || '', window.Protocol.Types.GROUP_LEAVE, { groupId: gid, userId: selfId });
                });
              }
            } catch(e) {}
            if (window.store.leaveGroup) {
              window.store.leaveGroup(gid);
            } else if (window.store.removeGroup) {
              window.store.removeGroup(gid);
              if (window.store.getState().activeChatId === gid) window.store.setState({ activeChatId: null });
            } else {
              var s = window.store.getState();
              var filtered = (s.groups || []).filter(function(g) { return (g.groupId || g.id) !== gid; });
              var msgs = Object.assign({}, s.messages); delete msgs[gid];
              window.store.setState({ groups: filtered, messages: msgs, activeChatId: s.activeChatId === gid ? null : s.activeChatId });
            }
            if (window.Toast) window.Toast.show('Left Group', 'Left ' + (_grpLeave.groupName || 'group'), 'success', 2500);
          };
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Leave Group?',
              message: 'Are you sure you want to leave "' + (_grpLeave.groupName || 'this group') + '"? You will need an invite to rejoin.',
              confirmText: 'Leave',
              danger: true,
              onConfirm: doLeave
            });
          } else if (confirm('Leave Group? Are you sure?')) {
            doLeave();
          }
        })();
        return { cancel: true };
      }

      case '/shout': {
        var shoutText = args.trim();
        if (!shoutText) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /shout <message>', 'info', 3000);
          return { cancel: true };
        }
        return { handled: true, text: '\uD83D\uDD0A ' + shoutText.toUpperCase() + ' \uD83D\uDD0A' };
      }

      case '/countdown': {
        var cdRaw = args.trim();
        if (!cdRaw) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /countdown 5 Go!', 'info', 3000);
          return { cancel: true };
        }
        var cdParts = cdRaw.split(/\s+/);
        var cdSec = parseInt(cdParts[0], 10);
        if (isNaN(cdSec) || cdSec < 1 || cdSec > 10) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /countdown 5 Go!  (seconds 1-10)', 'info', 3000);
          return { cancel: true };
        }
        var cdMsg = cdParts.slice(1).join(' ').trim();
        var cdText = '\u23F3 Countdown ' + cdSec + 's' + (cdMsg ? ': ' + cdMsg : '') + ' \u2014 starting now!';
        return { handled: true, text: cdText };
      }

      case '/nick': {
        var nickRaw = text.slice(5).trim();
        if (!nickRaw) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /nick <new name>', 'info', 3000);
          return { cancel: true };
        }
        if (nickRaw.length < 1 || nickRaw.length > 20) {
          if (window.Toast) window.Toast.show('Slash Command', 'Nickname must be 1-20 characters', 'error', 3000);
          return { cancel: true };
        }
        var _tidNick = chatId || (window.store && window.store.getState().activeChatId);
        var _stNick = window.store ? window.store.getState() : { groups: [], currentUser: {} };
        var _grpNick = _stNick.groups.find(function(g) { return g.groupId === _tidNick || g.id === _tidNick; });
        if (!_grpNick) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        var _myIdNick = _stNick.currentUser && _stNick.currentUser.userId;
        var _selfMemNick = (_grpNick.members || []).find(function(m) { return m.userId === _myIdNick; });
        var safeNick = window.Sanitize ? window.Sanitize.escapeHtml(nickRaw) : nickRaw;
        // rawNick stored; safeNick used for display
        var rawNick = nickRaw;
        if (_selfMemNick) {
          _selfMemNick.username = rawNick;
          if (_selfMemNick.name !== undefined) _selfMemNick.name = rawNick;
        }
        // Also update currentUser for local display
        if (_stNick.currentUser) {
          _stNick.currentUser.username = rawNick;
          if (_stNick.currentUser.name !== undefined) _stNick.currentUser.name = rawNick;
        }
        // Persist via store
        try {
          if (window.store) {
            // Prefer dedicated member update if available
            if (window.store.updateGroupField) {
              // Trigger persistence by rewriting groups array via setState
              window.store.setState({ groups: _stNick.groups, currentUser: _stNick.currentUser });
              if (window.store.save) window.store.save();
              else if (window.orbitAPI && window.orbitAPI.dbSaveGroup) window.orbitAPI.dbSaveGroup(_grpNick);
              else if (window.orbitAPI && window.orbitAPI.dbUpdateGroupField) window.orbitAPI.dbUpdateGroupField(_grpNick.groupId, 'members', _grpNick.members);
            } else {
              window.store.setState({ groups: _stNick.groups, currentUser: _stNick.currentUser });
            }
          }
        } catch(e) {}
        // Broadcast nickname change if protocol supports GROUP_UPDATE / GROUP_MEMBER_UPDATE
        try {
          var _nickPayload = { groupId: _grpNick.groupId, userId: _myIdNick, username: rawNick, field: 'nickname', value: rawNick };
          var _nickType = null;
          if (window.Protocol && window.Protocol.Types) {
            _nickType = window.Protocol.Types.GROUP_MEMBER_UPDATE || window.Protocol.Types.GROUP_UPDATE || window.Protocol.Types.GROUP_MEMBER_ADDED || null;
          }
          if (_nickType && window.orbitAPI && window.orbitAPI.networkSend) {
            (_grpNick.members || []).forEach(function(m) {
              if (m.userId !== _myIdNick) window.orbitAPI.networkSend(m.userId, m.ip || '', _nickType, _nickPayload);
            });
          }
        } catch(e) {}
        if (window.Toast) window.Toast.show('Nickname Updated', 'Nickname changed to ' + safeNick + ' in ' + (window.Sanitize ? window.Sanitize.escapeHtml(_grpNick.groupName || 'group') : (_grpNick.groupName || 'group')), 'success', 2500);
        return { cancel: true };
      }

      case '/kick':
      case '/remove': {
        var kickRaw = args.trim().replace(/^@/, '');
        if (!kickRaw) {
          if (window.Toast) window.Toast.show('Slash Command', 'Usage: /kick <username>', 'info', 3000);
          return { cancel: true };
        }
        var _tidKick = chatId || (window.store && window.store.getState().activeChatId);
        var _stKick = window.store ? window.store.getState() : { groups: [], currentUser: {} };
        var _grpKick = _stKick.groups.find(function(g) { return g.groupId === _tidKick || g.id === _tidKick; });
        if (!_grpKick) {
          if (window.Toast) window.Toast.show('Slash Command', 'No group found for this chat', 'error', 3000);
          return { cancel: true };
        }
        var _myIdKick = _stKick.currentUser && _stKick.currentUser.userId;
        var _selfMemKick = (_grpKick.members || []).find(function(m) { return m.userId === _myIdKick; });
        var _roleKick = _selfMemKick ? (_selfMemKick.role || (_grpKick.ownerId === _myIdKick ? 'owner' : 'member')) : 'member';
        var _isPrivKick = _roleKick === 'owner' || _roleKick === 'admin' || _grpKick.ownerId === _myIdKick;
        if (!_isPrivKick) {
          if (window.Toast) window.Toast.show('Slash Command', 'Only owner/admin can kick members', 'error', 3000);
          return { cancel: true };
        }
        var _targetKick = (_grpKick.members || []).find(function(m) {
          var uname = (m.username || m.name || '').toLowerCase();
          return uname === kickRaw.toLowerCase() || String(m.userId).toLowerCase() === kickRaw.toLowerCase();
        });
        if (!_targetKick) {
          if (window.Toast) window.Toast.show('Slash Command', 'Member not found: ' + (window.Sanitize ? window.Sanitize.escapeHtml(kickRaw) : kickRaw), 'error', 3000);
          return { cancel: true };
        }
        if (String(_targetKick.userId) === String(_myIdKick)) {
          if (window.Toast) window.Toast.show('Slash Command', 'You cannot kick yourself. Use /leave instead.', 'error', 3000);
          return { cancel: true };
        }
        if (_grpKick.ownerId && String(_targetKick.userId) === String(_grpKick.ownerId)) {
          if (window.Toast) window.Toast.show('Slash Command', 'Cannot kick the group owner', 'error', 3000);
          return { cancel: true };
        }
        (function() {
          var targetId = _targetKick.userId;
          var targetName = _targetKick.username || _targetKick.name || targetId;
          var safeTarget = window.Sanitize ? window.Sanitize.escapeHtml(targetName) : targetName;
          var doKick = function() {
            // Persist removal
            try {
              if (window.store && window.store.removeGroupMember) {
                window.store.removeGroupMember(_grpKick.groupId, targetId);
              } else if (window.store) {
                var s = window.store.getState();
                var filtered = (s.groups || []).map(function(g) {
                  if ((g.groupId || g.id) === (_grpKick.groupId || _grpKick.id)) {
                    return { ...g, members: (g.members || []).filter(function(m) { return String(m.userId) !== String(targetId); }) };
                  }
                  return g;
                });
                window.store.setState({ groups: filtered });
                if (window.orbitAPI && window.orbitAPI.dbRemoveGroupMember) window.orbitAPI.dbRemoveGroupMember(_grpKick.groupId, targetId);
              }
            } catch(e) {}
            // Broadcast GROUP_LEAVE for the kicked user — peers handleIncomingPacket will remove member / group
            try {
              var kickType = (window.Protocol && window.Protocol.Types && window.Protocol.Types.GROUP_LEAVE) ? window.Protocol.Types.GROUP_LEAVE : null;
              // Fallbacks: GROUP_MEMBER_REMOVE / GROUP_KICK if defined
              if (!kickType && window.Protocol && window.Protocol.Types) {
                kickType = window.Protocol.Types.GROUP_MEMBER_REMOVE || window.Protocol.Types.GROUP_KICK || window.Protocol.Types.GROUP_LEAVE || null;
              }
              if (kickType && window.orbitAPI && window.orbitAPI.networkSend) {
                var payload = { groupId: _grpKick.groupId, userId: targetId, kickedBy: _myIdKick, reason: 'kicked' };
                // Send to all members (including the kicked user) except self
                (_grpKick.members || []).forEach(function(m) {
                  if (String(m.userId) !== String(_myIdKick)) {
                    try { window.orbitAPI.networkSend(m.userId, m.ip || '', kickType, payload); } catch(e) {}
                  }
                });
              }
            } catch(e) {}
            if (window.Toast) window.Toast.show('Member Kicked', safeTarget + ' was removed from the group', 'success', 2500);
          };
          if (window.ConfirmModal) {
            window.ConfirmModal.show({
              title: 'Kick Member?',
              message: 'Remove "' + safeTarget + '" from this group? They will need an invite to rejoin.',
              confirmText: 'Kick',
              danger: true,
              onConfirm: doKick
            });
          } else if (confirm('Kick "' + targetName + '" from this group?')) {
            doKick();
          }
        })();
        return { cancel: true };
      }

      default:
        if (window.Toast) window.Toast.show('Slash Command', 'Unknown command. Type /help to see all commands.', 'info', 3000);
        return { cancel: true };
    }
  },

  showHelpModal() {
    // Remove existing help overlay if any
    var existing = document.querySelector('.slash-help-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'slash-help-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:380px;max-width:90vw;max-height:75vh;overflow-y:auto;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);padding:20px;';

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">' +
      '<h3 style="margin:0;font-size:17px;font-weight:700;color:var(--text-primary);">Slash Commands</h3>' +
      '<button id="slash-help-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
      '</div>';
    for (var i = 0; i < CHAT_COMMANDS.length; i++) {
      var c = CHAT_COMMANDS[i];
      html += '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border-subtle);">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:14px;font-weight:600;color:var(--accent-primary);font-family:var(--font-mono,monospace);">' + window.Sanitize.escapeHtml(c.name) + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + window.Sanitize.escapeHtml(c.desc) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:1px;font-family:var(--font-mono,monospace);">' + window.Sanitize.escapeHtml(c.usage) + '</div>' +
        '</div>' +
      '</div>';
    }
    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    var closeBtn = document.getElementById('slash-help-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
  },

  _sendPollMessage(chatId, poll) {
    var state = window.store ? window.store.getState() : null;
    if (!state) return;
    var targetId = chatId || state.activeChatId;
    if (!targetId) {
      if (window.Toast) window.Toast.show('Poll', 'No chat selected', 'error', 2500);
      return;
    }
    var groups = state.groups || [];
    var group = groups.find(function(g) { return g.groupId === targetId || g.id === targetId; });
    if (!group) {
      if (window.Toast) window.Toast.show('Poll', 'Polls only work in group chats', 'info', 3000);
      return;
    }
    var myId = state.currentUser && state.currentUser.userId;
    var recipients = [];
    (group.members || []).forEach(function(m) {
      if (String(m.userId) !== String(myId)) recipients.push({ userId: m.userId, ip: m.ip || '' });
    });
    var msgId = Date.now() + Math.floor(Math.random() * 1000);
    var payload = {
      text: '',
      msgId: msgId,
      poll: poll,
      chatId: targetId
    };
    if (state.currentUser) payload.fromName = state.currentUser.username || state.currentUser.name || '';
    // Broadcast to peers
    if (window.orbitAPI && window.orbitAPI.networkSend && targetId !== 'local-echo') {
      recipients.forEach(function(r) {
        try { window.orbitAPI.networkSend(r.userId, r.ip, window.Protocol.Types.MESSAGE, payload); } catch(e) {}
        if (window._p2pSentCount !== undefined) window._p2pSentCount++;
      });
    }
    // Local echo
    var localMsg = {
      id: msgId,
      sender: myId,
      text: '',
      timestamp: new Date().toISOString(),
      poll: poll
    };
    if (window.store && window.store.addMessage) {
      window.store.addMessage(targetId, localMsg);
    }
    if (window.Toast) window.Toast.show('Poll Created', poll.question, 'success', 2500);
    // Clear draft and input
    try { localStorage.removeItem('orbit_draft_' + targetId); } catch(e) {}
    var inp = document.getElementById('chat-input');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    if (this.hideSlashTooltip) this.hideSlashTooltip();
  },

  _showPollBuilder(chatId, initialQuestion) {
    var self = this;
    var existing = document.querySelector('.poll-builder-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'poll-builder-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    var panel = document.createElement('div');
    panel.style.cssText = 'width:420px;max-width:90vw;max-height:85vh;overflow-y:auto;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-xl);padding:20px;display:flex;flex-direction:column;gap:16px;';
    // Build inner HTML: title, question, options container, add btn, footer
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<h3 style="margin:0;font-size:16px;font-weight:700;color:var(--text-primary);">Create Poll</h3>' +
        '<button id="poll-builder-close" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;border-radius:6px;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);">Question</label>' +
        '<input id="poll-builder-question" type="text" placeholder="Question?" maxlength="200" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;">' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;">' +
        '<label style="font-size:12px;font-weight:600;color:var(--text-secondary);">Options (2-6)</label>' +
        '<div id="poll-builder-options" style="display:flex;flex-direction:column;gap:8px;"></div>' +
        '<button id="poll-builder-add" style="align-self:flex-start;background:transparent;border:1px dashed var(--border-subtle);color:var(--accent-primary);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;"><i data-lucide="plus" style="width:14px;height:14px;"></i> Add option</button>' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;padding-top:4px;border-top:1px solid var(--border-subtle);margin-top:4px;">' +
        '<button id="poll-builder-cancel" style="background:transparent;border:1px solid var(--border-subtle);color:var(--text-secondary);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;">Cancel</button>' +
        '<button id="poll-builder-create" style="background:var(--accent-primary);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">Create Poll</button>' +
      '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);">Tip: power users can still use <span style="font-family:var(--font-mono,monospace);background:var(--bg-hover);padding:1px 4px;border-radius:4px;">/poll "Question?" "Option1" "Option2"</span></div>';

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    if (window.lucide) window.lucide.createIcons({ root: overlay });

    var qInput = document.getElementById('poll-builder-question');
    var optsContainer = document.getElementById('poll-builder-options');
    var addBtn = document.getElementById('poll-builder-add');
    var createBtn = document.getElementById('poll-builder-create');

    if (qInput && initialQuestion) qInput.value = initialQuestion;

    function createOptionRow(value, placeholder) {
      var row = document.createElement('div');
      row.className = 'poll-option-row';
      row.style.cssText = 'display:flex;gap:8px;align-items:center;';
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'poll-option-input';
      input.placeholder = placeholder || 'Option';
      input.maxLength = 80;
      input.value = value || '';
      input.style.cssText = 'flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:13px;outline:none;box-sizing:border-box;';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'poll-option-remove';
      rm.title = 'Remove option';
      rm.innerHTML = '<i data-lucide="x" style="width:14px;height:14px;"></i>';
      rm.style.cssText = 'background:none;border:none;cursor:pointer;color:var(--text-muted);padding:6px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
      rm.addEventListener('click', function() {
        row.remove();
        refreshOptionState();
      });
      row.appendChild(input);
      row.appendChild(rm);
      return row;
    }

    function refreshOptionState() {
      var rows = optsContainer.querySelectorAll('.poll-option-row');
      var count = rows.length;
      // Show remove only if >2
      rows.forEach(function(r) {
        var btn = r.querySelector('.poll-option-remove');
        if (btn) btn.style.display = count > 2 ? 'flex' : 'none';
      });
      // Update placeholders sequentially
      rows.forEach(function(r, idx) {
        var inp = r.querySelector('.poll-option-input');
        if (inp) inp.placeholder = 'Option ' + (idx + 1);
      });
      if (addBtn) {
        addBtn.style.display = count >= 6 ? 'none' : 'flex';
        addBtn.disabled = count >= 6;
      }
    }

    // Init with 2 empty rows
    optsContainer.appendChild(createOptionRow('', 'Option 1'));
    optsContainer.appendChild(createOptionRow('', 'Option 2'));
    // If initialQuestion was pollArgs[0] and we have a hint for first option? keep empty
    refreshOptionState();
    if (window.lucide) window.lucide.createIcons({ root: optsContainer });

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.remove();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    var closeBtn = document.getElementById('poll-builder-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
    var cancelBtn = document.getElementById('poll-builder-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', close);

    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var rows = optsContainer.querySelectorAll('.poll-option-row');
        if (rows.length >= 6) return;
        var row = createOptionRow('', 'Option ' + (rows.length + 1));
        optsContainer.appendChild(row);
        refreshOptionState();
        if (window.lucide) window.lucide.createIcons({ root: row });
        var inp = row.querySelector('.poll-option-input');
        if (inp) inp.focus();
      });
    }

    if (createBtn) {
      createBtn.addEventListener('click', function() {
        var question = qInput ? qInput.value.trim() : '';
        if (!question) {
          if (window.Toast) window.Toast.show('Poll', 'Question is required', 'error', 2500);
          if (qInput) { qInput.focus(); qInput.style.borderColor = 'var(--accent-danger)'; setTimeout(function(){ qInput.style.borderColor=''; }, 1500); }
          return;
        }
        var inputs = optsContainer.querySelectorAll('.poll-option-input');
        var filtered = [];
        inputs.forEach(function(inp) {
          var v = inp.value.trim();
          if (v) filtered.push(v);
        });
        if (filtered.length < 2) {
          if (window.Toast) window.Toast.show('Poll', 'At least 2 options required', 'error', 2500);
          return;
        }
        if (filtered.length > 6) filtered = filtered.slice(0, 6);
        var poll = {
          question: question,
          options: filtered.map(function(t) { return { text: t, votes: [] }; }),
          multiSelect: false,
          expiresAt: null
        };
        close();
        self._sendPollMessage(chatId, poll);
      });
    }

    // Focus question input
    setTimeout(function() { if (qInput) qInput.focus(); }, 50);
    // Enter handling: Enter on question moves to first option; Enter on last option creates if valid
    if (qInput) {
      qInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var firstOpt = optsContainer.querySelector('.poll-option-input');
          if (firstOpt) firstOpt.focus();
        }
      });
    }
  },

  showSlashTooltip(val) {
    // GROUP-ONLY — suppress slash autocomplete in DMs (parity with mobile group-only intent)
    var _cid = window.store && window.store.getState().activeChatId;
    var _grps = (window.store && window.store.getState().groups) || [];
    var _isGrp = !!_grps.find(function(g) { return g.groupId === _cid || g.id === _cid; });
    if (!_isGrp) {
      var _tip = document.getElementById('slash-tooltip');
      if (_tip) _tip.style.display = 'none';
      return;
    }
    var inputArea = document.querySelector('.chat-input-area');
    if (!inputArea) return;
    var tooltip = document.getElementById('slash-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'slash-tooltip';
      tooltip.style.cssText = 'position:absolute;bottom:100%;left:12px;right:12px;margin-bottom:8px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden;z-index:20;display:none;max-height:180px;overflow-y:auto;';
      // Ensure inputArea is positioning context
      inputArea.style.position = 'relative';
      inputArea.appendChild(tooltip);
      // Inject tooltip item styles once
      if (!document.getElementById('slash-tooltip-style')) {
        var style = document.createElement('style');
        style.id = 'slash-tooltip-style';
        style.textContent = '.slash-tooltip-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border-subtle);} .slash-tooltip-item:last-child{border-bottom:none;} .slash-tooltip-item:hover{background:var(--bg-hover);} .slash-tooltip-name{font-family:var(--font-mono,monospace);font-size:13px;font-weight:600;color:var(--accent-primary);} .slash-tooltip-desc{font-size:11px;color:var(--text-muted);margin-left:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';
        document.head.appendChild(style);
      }
    }
    var q = val.toLowerCase().substring(1);
    var matches = CHAT_COMMANDS.filter(function(c) {
      return c.name.indexOf(q) !== -1 || c.desc.toLowerCase().indexOf(q) !== -1;
    });
    if (matches.length === 0) {
      tooltip.style.display = 'none';
      return;
    }
    var html = '';
    for (var i = 0; i < Math.min(matches.length, 5); i++) {
      var m = matches[i];
      html += '<div class="slash-tooltip-item" data-cmd="' + window.Sanitize.escapeHtml(m.name) + '">' +
        '<span class="slash-tooltip-name">' + window.Sanitize.escapeHtml(m.name) + '</span>' +
        '<span class="slash-tooltip-desc">' + window.Sanitize.escapeHtml(m.desc) + '</span>' +
      '</div>';
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';

    var self = this;
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
        self.hideSlashTooltip();
      });
    });
  },

  hideSlashTooltip() {
    var tooltip = document.getElementById('slash-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }
};

function applyOgData(el, og) {
  if (!el || !og) return;
  el.setAttribute('data-og-loaded', 'true');
  var titleEl = el.querySelector('.link-preview-title');
  var urlEl = el.querySelector('.link-preview-url');
  var imgEl = el.querySelector('.link-preview-img');
  if (og.title && titleEl) titleEl.textContent = og.title.substring(0, 120);
  if (og.description && urlEl) urlEl.textContent = og.description.substring(0, 200);
  if (og.image && imgEl) {
    imgEl.innerHTML = '<img src="' + window.Sanitize.escapeHtml(og.image) + '" alt="" loading="lazy" onerror="var p=this.parentNode;this.style.display=\'none\';p.innerHTML=\'<i data-lucide=\\\'link-2\\\' style=\\\'width:20px;height:20px;\\\'></i>\';if(window.lucide)lucide.createIcons({root:p});">';
    if (window.lucide) lucide.createIcons({ root: imgEl });
  }
  if (og.domain && !og.title && titleEl) titleEl.textContent = og.domain;
}
