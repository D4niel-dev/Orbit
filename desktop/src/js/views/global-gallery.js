// src/js/views/global-gallery.js

window.GlobalGallery = {
  init() {
    this.container = document.getElementById('global-gallery-container');
    if (!this.container) return;
    
    this.currentFilter = 'all';
    this.mediaType = 'all';
    this.searchQuery = '';
    this.displayMode = (window.store.getState().settings || {}).galleryViewMode || 'grid';

    this.unsubscribe = window.store.subscribe((state, changedState) => {
      // Re-read the saved display mode whenever settings change.
      //
      // This is what made the setting look like it never saved. The constructor reads
      // `galleryViewMode` once, but GlobalGallery.init() runs on DOMContentLoaded —
      // before the settings are hydrated from the database — so that read always saw
      // the default 'grid'. The mode WAS being written correctly; nothing ever read it
      // back, so every launch started on Grid again.
      //
      // When the user picks a mode this is a no-op: displayMode is already set to the
      // same value before setState fires, so the comparison below matches.
      var savedMode = (state.settings || {}).galleryViewMode;
      if (savedMode && savedMode !== this.displayMode) {
        this.displayMode = savedMode;
      }

      var relevant = ['friends', 'messages', 'activeChatId', 'activeTab', 'settings'];
      if (!changedState || relevant.some(function(k) { return k in changedState; })) {
        this.render(state);
      }
    });
    
    this.render(window.store.getState());
  },

  render(state) {
    if (state.activeTab !== 'gallery') {
      this.container.style.display = 'none';
      return;
    }

    // Fade the view in when it is first shown, not on every re-render. render() runs on any
    // store change, so an unconditional animation would flicker the whole gallery every time
    // a message arrived.
    var wasHidden = this.container.style.display === 'none';
    this.container.style.display = 'flex';
    if (wasHidden) {
      // The Shared Media panel is an overlay anchored to the chat, and the gallery takes the
      // full width. Leaving it open shows two galleries side by side.
      if (window.GallerySidebar && window.GallerySidebar.isOpen) window.GallerySidebar.close();
      var el = this.container;
      el.classList.remove('gallery-in');
      requestAnimationFrame(function () { el.classList.add('gallery-in'); });
    }

    var allAttachments = [];
    const messages = state.messages || {};
    const friends = state.friends || [];
    const groups = state.groups || [];

    function chatNameFor(chatId) {
      var f = friends.find(function(f) { return f.userId === chatId; });
      if (f) return f.username;
      var g = groups.find(function(g) { return g.groupId === chatId; });
      if (g) return g.groupName;
      if (chatId === 'local-echo') return 'Orbit Echo';
      return chatId;
    }

    Object.keys(messages).forEach(chatId => {
      const chatMsgs = messages[chatId];
      const chatName = chatNameFor(chatId);

      chatMsgs.forEach(msg => {
        if (msg.attachments) {
          msg.attachments.forEach(function(att) {
            var type = (att.type || '').toLowerCase();
            var mime = (att.mimeType || '').toLowerCase();
            var isMedia = type === 'image' || type === 'video' || type === 'audio' || mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
            if (this.mediaType === 'images' && !isMedia) return;
            if (this.mediaType === 'files' && isMedia) return;
            allAttachments.push({
              ...att,
              msgId: msg.id,
              chatId: chatId,
              chatName: chatName,
              timestamp: msg.timestamp
            });
          }, this);
        }
      }, this);
    });

    const isTypeFilterActive = this.mediaType !== 'all';
    const filteredChats = [...new Set(allAttachments.map(function(a) { return a.chatId; }))];

    // Apply Chat Filter
    if (this.currentFilter !== 'all' && filteredChats.indexOf(this.currentFilter) !== -1) {
      allAttachments = allAttachments.filter(function(a) { return a.chatId === this.currentFilter; }, this);
    } else {
      this.currentFilter = 'all';
    }

    // Apply Search Filter
    if (this.searchQuery.trim() !== '') {
      const query = this.searchQuery.toLowerCase();
      allAttachments = allAttachments.filter(function(a) {
        return (a.name && a.name.toLowerCase().indexOf(query) !== -1) ||
               (a.chatName && a.chatName.toLowerCase().indexOf(query) !== -1);
      });
    }

    // Sort newest first
    allAttachments.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

    var self = this;

    // The months that actually have media, newest first, each remembering the first item so the
    // rail can scroll to it. Built from the sorted list, so the order is already right.
    this._months = [];
    (function () {
      var seen = {};
      allAttachments.forEach(function (a) {
        var t = a.timestamp ? new Date(a.timestamp) : null;
        if (!t || isNaN(t.getTime())) return;
        var key = t.getFullYear() + '-' + t.getMonth();
        if (seen[key]) return;
        seen[key] = true;
        self._months.push({ key: key, label: t.toLocaleString(undefined, { month: 'short' }) + ' ' + t.getFullYear(), anchor: a.msgId });
      });
    })();

    function fileIconHtml(name) {
      var ext = (name || '').split('.').pop().toLowerCase();
      var icon = 'file';
      if (['pdf'].indexOf(ext) !== -1) icon = 'file-text';
      else if (['zip','rar','7z','gz','tar'].indexOf(ext) !== -1) icon = 'archive';
      else if (['mp3','wav','ogg','flac','aac','m4a','wma'].indexOf(ext) !== -1) icon = 'music';
      else if (['mp4','mkv','avi','mov','wmv','webm'].indexOf(ext) !== -1) icon = 'video';
      else if (['doc','docx','xls','xlsx','ppt','pptx'].indexOf(ext) !== -1) icon = 'file-text';
      else if (['js','ts','py','java','c','cpp','html','css','json','xml'].indexOf(ext) !== -1) icon = 'code';
      return icon;
    }

    function isMediaType(a) {
      var type = (a.type || '').toLowerCase();
      var mime = (a.mimeType || '').toLowerCase();
      return type === 'image' || type === 'video' || type === 'audio' || mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/');
    }

    function renderGridItem(a) {
      if (isMediaType(a)) {
        var isVideo = (a.type === 'video' || (a.mimeType || '').startsWith('video/'));
        var isAudio = (a.type === 'audio' || (a.mimeType || '').startsWith('audio/'));
        var mediaHtml = '';
        var safeUrl = window.Sanitize.escapeHtml(a.url || '');
        if (isVideo) {
          var posterUrl = window.Sanitize.escapeHtml(a._poster || '');
          mediaHtml = '<div style="width:100%; height:100%; background:var(--bg-panel); position:relative;" onmouseover="var vc=this.querySelector(\'.vid-c\'); if(!vc.querySelector(\'video\')){ vc.innerHTML = \'<video src=&quot;' + safeUrl + '&quot; style=&quot;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;&quot; muted loop autoplay playsinline></video>\'; } else { vc.querySelector(\'video\').play().catch(function(){}); }" onmouseout="var v=this.querySelector(\'video\'); if(v) v.pause();">' +
            (posterUrl ? '<img src="' + posterUrl + '" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:absolute;inset:0;"><i data-lucide="video" style="width:32px;height:32px;opacity:0.5;"></i></div>') +
            '<div class="vid-c" style="position:absolute;inset:0;pointer-events:none;"></div>' +
          '</div>';
        } else if (isAudio) {
          mediaHtml = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--bg-base);"><i data-lucide="music" style="width:48px;height:48px;color:var(--accent-success);"></i></div>';
        } else {
          mediaHtml = '<img src="' + safeUrl + '" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')">';
        }

        return '<div class="gallery-grid-item" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" style="aspect-ratio:1;" onclick="if(window.ImageViewer){ if(' + (isVideo ? 'true' : 'false') + ') window.ImageViewer.openVideo(\'' + safeUrl + '\',\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\'); else if(' + (isAudio ? 'true' : 'false') + ') window.ImageViewer.openAudio({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); else window.ImageViewer.open({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); }">' +
          mediaHtml +
          '<div class="gallery-label">' + window.Sanitize.escapeHtml(a.chatName) + '</div>' +
          '<div class="gallery-overlay">' +
            '<button class="gallery-action-btn gallery-jump" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" title="Go to message"><i data-lucide="corner-up-left" style="width:18px;height:18px;"></i></button>' +
            '<button class="gallery-action-btn" title="View"><i data-lucide="' + (isVideo || isAudio ? 'play' : 'eye') + '" style="width:18px;height:18px;"></i></button>' +
            '<a href="' + safeUrl + '" download="' + window.Sanitize.escapeHtml(a.name || 'Media') + '" class="gallery-action-btn" title="Download" onclick="event.stopPropagation()"><i data-lucide="download" style="width:18px;height:18px;"></i></a>' +
          '</div>' +
        '</div>';
      }
      var fic = fileIconHtml(a.name);
      return '<div style="border-radius:12px; overflow:hidden; border:1px solid var(--border-subtle); background:var(--bg-hover); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:16px; cursor:default;">' +
        '<i data-lucide="' + fic + '" style="width:28px; height:28px; color:var(--text-muted);"></i>' +
        '<div style="font-size:11px; color:var(--text-secondary); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</div>' +
      '</div>';
    }

    function renderListItem(a) {
      var d = new Date(a.timestamp);
      var dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      if (isMediaType(a)) {
        var isVideo = (a.type === 'video' || (a.mimeType || '').startsWith('video/'));
        var isAudio = (a.type === 'audio' || (a.mimeType || '').startsWith('audio/'));
        var mediaHtml = '';
        var safeUrl = window.Sanitize.escapeHtml(a.url || '');
        if (isVideo) {
          var posterUrl = window.Sanitize.escapeHtml(a._poster || '');
          mediaHtml = '<div style="width:100%; height:100%; background:var(--bg-panel); position:relative;" onmouseover="var vc=this.querySelector(\'.vid-c\'); if(!vc.querySelector(\'video\')){ vc.innerHTML = \'<video src=&quot;' + safeUrl + '&quot; style=&quot;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;&quot; muted loop autoplay playsinline></video>\'; } else { vc.querySelector(\'video\').play().catch(function(){}); }" onmouseout="var v=this.querySelector(\'video\'); if(v) v.pause();">' +
            (posterUrl ? '<img src="' + posterUrl + '" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;position:absolute;inset:0;"><i data-lucide="video" style="width:24px;height:24px;opacity:0.5;"></i></div>') +
            '<div class="vid-c" style="position:absolute;inset:0;pointer-events:none;"></div>' +
          '</div>';
        } else if (isAudio) {
          mediaHtml = '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--bg-base);"><i data-lucide="music" style="width:32px;height:32px;color:var(--accent-success);"></i></div>';
        } else {
          mediaHtml = '<img src="' + safeUrl + '" style="width:100%; height:100%; object-fit:cover;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')">';
        }

        var jumpBtn = '<button class="gallery-jump" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" title="Go to message" ' +
          'style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:4px;flex-shrink:0;"><i data-lucide="corner-up-left" style="width:16px;height:16px;"></i></button>';
        return '<div class="gallery-list-row" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" style="display:flex; gap:16px; align-items:center; border-radius:12px; padding:12px; border:1px solid var(--border-subtle); background:var(--bg-surface); cursor:pointer;" onclick="if(window.ImageViewer){ if(' + (isVideo ? 'true' : 'false') + ') window.ImageViewer.openVideo(\'' + safeUrl + '\',\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\'); else if(' + (isAudio ? 'true' : 'false') + ') window.ImageViewer.openAudio({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); else window.ImageViewer.open({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); }">' +
          '<div style="width:80px; height:80px; border-radius:8px; overflow:hidden; flex-shrink:0;">' +
            mediaHtml +
          '</div>' +
          '<div style="flex:1; overflow:hidden;">' +
            '<div style="font-weight:600; font-family:var(--font-display); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'Media') + '</div>' +
            '<div style="color:var(--text-secondary); font-size:13px; margin-top:4px;">Shared in ' + window.Sanitize.escapeHtml(a.chatName) + '</div>' +
            '<div style="color:var(--text-muted); font-size:12px; margin-top:4px;">' + dateStr + '</div>' +
          '</div>' +
          jumpBtn +
        '</div>';
      }
      var fic = fileIconHtml(a.name);
      return '<div style="display:flex; gap:16px; align-items:center; border-radius:12px; padding:12px; border:1px solid var(--border-subtle); background:var(--bg-surface);">' +
        '<div style="width:48px; height:48px; border-radius:8px; background:var(--bg-hover); display:flex; align-items:center; justify-content:center; flex-shrink:0;">' +
          '<i data-lucide="' + fic + '" style="width:24px; height:24px; color:var(--text-muted);"></i>' +
        '</div>' +
        '<div style="flex:1; overflow:hidden;">' +
          '<div style="font-weight:500; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</div>' +
          '<div style="color:var(--text-secondary); font-size:12px; margin-top:2px;">' + window.Sanitize.escapeHtml(a.chatName) + ' &middot; ' + dateStr + '</div>' +
        '</div>' +
      '</div>';
    }

    // Build content HTML
    var contentHtml = '';
    if (allAttachments.length === 0) {
      contentHtml = 
        '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px;">' +
          '<svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="var(--border-subtle)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:16px;">' +
            '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
            '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
            '<polyline points="21 15 16 10 5 21"></polyline>' +
          '</svg>' +
          '<div style="font-size:16px; font-weight:600; color:var(--text-primary); margin-bottom:4px;">No Media Found</div>' +
          '<div style="font-size:13px; color:var(--text-muted); text-align:center; max-width:280px;">' +
            (this.searchQuery ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'When you share images, videos, or files in chats, they will appear here.') +
          '</div>' +
        '</div>';
    } else {
      // Common scroll wrapper - separates overflow from layout rendering
      var scrollWrapOpen = '<div style="flex:1; overflow-y:auto; overflow-x:hidden; padding:var(--spacing-lg);">';
      var scrollWrapClose = '</div>';
      
      if (this.displayMode === 'grid') {
        contentHtml = scrollWrapOpen +
          '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:16px; align-content:start;">';
        allAttachments.forEach(function(a) { contentHtml += renderGridItem(a); });
        contentHtml += '</div>' + scrollWrapClose;
      } else if (this.displayMode === 'compact') {
        contentHtml = scrollWrapOpen +
          '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:8px; align-content:start;">';
        allAttachments.forEach(function(a) { contentHtml += renderGridItem(a); });
        contentHtml += '</div>' + scrollWrapClose;
      } else if (this.displayMode === 'masonry') {
        contentHtml = scrollWrapOpen +
          '<div style="column-count: 3; column-gap: 16px;">';
        var mediaFiles = allAttachments.filter(function(a) { return isMediaType(a); });
        var otherFiles = allAttachments.filter(function(a) { return !isMediaType(a); });
        mediaFiles.forEach(function(a) {
          var isVideo = (a.type === 'video' || (a.mimeType || '').startsWith('video/'));
          var isAudio = (a.type === 'audio' || (a.mimeType || '').startsWith('audio/'));
          var mediaHtml = '';
          var safeUrl = window.Sanitize.escapeHtml(a.url || '');
          if (isVideo) {
            var posterUrl = window.Sanitize.escapeHtml(a._poster || '');
          mediaHtml = '<div style="width:100%; height:100%; min-height:120px; display:flex; align-items:center; justify-content:center; background:var(--bg-panel); position:relative;" onmouseover="var vc=this.querySelector(\'.vid-c\'); if(!vc.querySelector(\'video\')){ vc.innerHTML = \'<video src=&quot;' + safeUrl + '&quot; style=&quot;width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0;&quot; muted loop autoplay playsinline></video>\'; } else { vc.querySelector(\'video\').play().catch(function(){}); }" onmouseout="var v=this.querySelector(\'video\'); if(v) v.pause();">' +
            (posterUrl ? '<img src="' + posterUrl + '" style="width:100%;height:100%;object-fit:cover;display:block;position:absolute;inset:0;">' : '<i data-lucide="video" style="width:32px;height:32px;opacity:0.5;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></i>') +
            '<div class="vid-c" style="position:absolute;inset:0;pointer-events:none;"></div>' +
          '</div>';
          } else if (isAudio) {
            mediaHtml = '<div style="width:100%; aspect-ratio:1; display:flex; align-items:center; justify-content:center; background:var(--bg-base);"><i data-lucide="music" style="width:48px;height:48px;color:var(--accent-success);"></i></div>';
          } else {
            mediaHtml = '<img src="' + safeUrl + '" style="width:100%; display:block;" onerror="if(window.handleMediaError) window.handleMediaError(this, \'' + safeUrl + '\')">';
          }

          contentHtml += '<div class="gallery-grid-item" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" onclick="if(window.ImageViewer){ if(' + (isVideo ? 'true' : 'false') + ') window.ImageViewer.openVideo(\'' + safeUrl + '\',\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\'); else if(' + (isAudio ? 'true' : 'false') + ') window.ImageViewer.openAudio({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); else window.ImageViewer.open({url:\'' + safeUrl + '\',name:\'' + window.Sanitize.escapeHtml(a.name || 'Media') + '\',size:\'' + window.Sanitize.escapeHtml(String(a.size || 0)) + '\'}); }" style="margin-bottom:16px;">' +
            mediaHtml +
            '<div class="gallery-overlay">' +
              '<button class="gallery-action-btn gallery-jump" data-msg-id="' + a.msgId + '" data-chat="' + a.chatId + '" title="Go to message"><i data-lucide="corner-up-left" style="width:18px;height:18px;"></i></button>' +
              '<button class="gallery-action-btn" title="View"><i data-lucide="' + (isVideo || isAudio ? 'play' : 'eye') + '" style="width:18px;height:18px;"></i></button>' +
              '<a href="' + safeUrl + '" download="' + window.Sanitize.escapeHtml(a.name || 'Media') + '" class="gallery-action-btn" title="Download" onclick="event.stopPropagation()"><i data-lucide="download" style="width:18px;height:18px;"></i></a>' +
            '</div>' +
          '</div>';
        });
        if (otherFiles.length > 0) {
          contentHtml += '<div style="break-inside:avoid; margin-bottom:16px; padding:12px; background:var(--bg-hover); border-radius:12px; border:1px solid var(--border-subtle);"><div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">Files</div>';
          otherFiles.forEach(function(a) {
            var fic = fileIconHtml(a.name);
            contentHtml += '<div style="display:flex; align-items:center; gap:8px; padding:4px 0;"><i data-lucide="' + fic + '" style="width:14px; height:14px; color:var(--text-muted); flex-shrink:0;"></i><span style="font-size:12px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + window.Sanitize.escapeHtml(a.name || 'file') + '</span></div>';
          });
          contentHtml += '</div>';
        }
        contentHtml += '</div>' + scrollWrapClose;
      } else if (this.displayMode === 'list') {
        contentHtml = scrollWrapOpen +
          '<div style="display:flex; flex-direction:column; gap:12px;">';
        allAttachments.forEach(function(a) { contentHtml += renderListItem(a); });
        contentHtml += '</div>' + scrollWrapClose;
      }
    }

    // Header + filter bar HTML
    //
    // ⚠ THE CHIPS CARRY `active` AND NOTHING ELSE — no inline background, no colour.
    // They used to write `background: var(--accent-primary)` inline when selected,
    // which made a FILTER look like the primary action on the screen: "All Chats" was
    // the only saturated thing in the gallery, and it is not a thing you do, it is a
    // thing you are looking at. It is a tint now, like every other selected state in
    // this app.
    //
    // ⚠ And the two groups disagreed about how state was expressed: the chat chips
    // had an `active` class, the type chips did not — so no stylesheet could style
    // both, and the type chips could only ever be styled by the renderer. They both
    // use `active` now.
    var self = this;
    var typeFilterHtml = '';
    if (filteredChats.length > 0) {
      var typeChip = function (type, label) {
        return '<button class="gallery-type-filter' + (self.mediaType === type ? ' active' : '') +
          '" data-type="' + type + '">' + label + '</button>';
      };
      typeFilterHtml = typeChip('all', 'All') + typeChip('images', 'Images') + typeChip('files', 'Files');
    }

    var chatFilterHtml = '';
    chatFilterHtml += '<button class="gallery-filter-btn' + (this.currentFilter === 'all' ? ' active' : '') +
      '" data-id="all">' + (isTypeFilterActive ? (this.mediaType === 'images' ? 'All Images' : 'All Files') : 'All Chats') + '</button>';
    if (this.currentFilter === 'all') {
      filteredChats.forEach(function(chatId) {
        chatFilterHtml += '<button class="gallery-filter-btn" data-id="' + window.Sanitize.escapeHtml(chatId) + '">' + window.Sanitize.escapeHtml(chatNameFor(chatId)) + '</button>';
      });
    } else {
      chatFilterHtml += '<button class="gallery-filter-btn active" data-id="' + window.Sanitize.escapeHtml(this.currentFilter) + '">' + window.Sanitize.escapeHtml(chatNameFor(this.currentFilter)) + '</button>';
    }

    // Where the space actually goes. Every attachment is on the user's own disk in a local-first
    // app, so the useful number is not "how many" but "how much, and from where".
    var totalBytes = 0;
    var byChat = {};
    allAttachments.forEach(function (a) {
      var sz = parseInt(a.size, 10) || 0;
      totalBytes += sz;
      var name = a.chatName || 'Unknown';
      if (!byChat[name]) byChat[name] = { bytes: 0, count: 0 };
      byChat[name].bytes += sz;
      byChat[name].count += 1;
    });
    var totalSize = window.Format && window.Format.fileSize ? window.Format.fileSize(totalBytes) : (totalBytes + ' B');
    this._storageByChat = Object.keys(byChat).map(function (k) {
      return { name: k, bytes: byChat[k].bytes, count: byChat[k].count };
    }).sort(function (a, b) { return b.bytes - a.bytes; });
    this._storageTotal = { bytes: totalBytes, size: totalSize, count: allAttachments.length };

    // The view switcher, built from one list rather than four hand-written copies of
    // the same button. ⚠ It carries `active` and nothing else — the inline background,
    // colour and shadow are gone, so the layer styles it like the two other segmented
    // controls in the app instead of this being a fourth hand-built one.
    var modeBtns = [
      { mode: 'grid', icon: 'grid', title: 'Grid View' },
      { mode: 'compact', icon: 'layout-grid', title: 'Compact View' },
      { mode: 'masonry', icon: 'columns', title: 'Masonry View' },
      { mode: 'list', icon: 'list', title: 'List View' }
    ].map(function (m) {
      return '<button class="view-mode-btn' + (self.displayMode === m.mode ? ' active' : '') +
        '" data-mode="' + m.mode + '" title="' + m.title + '"><i data-lucide="' + m.icon + '"></i></button>';
    }).join('');

    this._galleryRenderSeq = (this._galleryRenderSeq || 0) + 1;
    this.container.innerHTML =
      '<div class="gal-header">' +
        '<div class="gal-header-left">' +
          // ⚠ The app's own .ico used to sit here at 24px. It is the icon already in
          // the dock, drawn in its own colours — which made it the only purple in an
          // app that has exactly one accent — and it told you nothing you did not
          // already know. The title carries the header on its own.
          '<h2 class="gal-title">Global Gallery</h2>' +
          // ⚠ "0 items · 0 B" sat here as bare muted text and read as a subtitle. It
          // is a BUTTON — it opens where the space goes — so it looks like one now.
          '<button id="gallery-storage-stat" class="gal-stat" title="Where the space goes">' +
            '<span>' + allAttachments.length + ' items &middot; ' + totalSize + '</span>' +
            '<i data-lucide="chevron-down"></i>' +
          '</button>' +
        '</div>' +
        '<div class="gal-header-right">' +
          '<div class="gal-search">' +
            '<i data-lucide="search" class="gal-search-icon"></i>' +
            '<input type="text" id="gallery-search" class="gal-search-input" value="' + window.Sanitize.escapeHtml(this.searchQuery) + '" placeholder="Search media...">' +
          '</div>' +
          '<button id="gallery-select-btn" class="gal-icon-btn" title="Select items"><i data-lucide="list-checks"></i></button>' +
          '<div class="gal-seg">' + modeBtns + '</div>' +
        '</div>' +
      '</div>' +
      '<div id="gallery-storage-pop" style="display:none; position:absolute; top:60px; left:var(--spacing-lg); z-index:60; width:320px; ' +
        'max-height:60vh; overflow-y:auto; padding:14px; border-radius:14px; background:var(--bg-surface); border:1px solid var(--border-subtle); ' +
        'box-shadow:var(--shadow-xl);"></div>' +
      '<div id="gallery-bulk-bar" style="display:none; padding:8px var(--spacing-lg); border-bottom:1px solid var(--border-subtle); ' +
        'background:var(--bg-base); align-items:center; gap:10px;">' +
        '<span id="gallery-bulk-count" style="font-size:12px; color:var(--text-secondary); flex:1;"></span>' +
        '<button id="gallery-bulk-delete" style="padding:6px 14px; border-radius:8px; border:none; background:var(--accent-danger); color:#fff; cursor:pointer; font-size:12px; font-weight:600;">Delete</button>' +
        '<button id="gallery-bulk-clear" style="padding:6px 12px; border-radius:8px; border:1px solid var(--border-subtle); background:transparent; color:var(--text-secondary); cursor:pointer; font-size:12px;">Clear</button>' +
      '</div>' +
      '<div class="gal-filters">' +
        typeFilterHtml +
        (typeFilterHtml ? '<span class="gal-filters-sep"></span>' : '') +
        chatFilterHtml +
      '</div>' +
      contentHtml;

    lucide.createIcons({ root: this.container });

    // The month rail. Only worth showing when there is more than one month to choose between.
    var oldRail = document.getElementById('gallery-month-rail');
    if (oldRail) oldRail.remove();
    if (this._months && this._months.length > 1) {
      var rail = '<div id="gallery-month-rail" style="position:absolute; right:12px; top:120px; bottom:20px; display:flex; ' +
        'flex-direction:column; justify-content:center; gap:1px; z-index:40; pointer-events:none;">';
      this._months.forEach(function (m) {
        rail += '<button class="gallery-month-btn" data-anchor="' + m.anchor + '" title="Jump to ' + m.label + '" ' +
          'style="pointer-events:auto; background:transparent; border:none; cursor:pointer; font-size:10px; font-weight:600; ' +
          'color:var(--text-muted); padding:3px 7px; border-radius:6px; text-align:right; transition:color .15s, background .15s;">' +
          m.label + '</button>';
      });
      rail += '</div>';
      this.container.insertAdjacentHTML('beforeend', rail);
    }

    // Marks re-applied from state, because anything that re-renders rebuilds these elements and
    // a class toggled on click would be lost. Same lesson as the Shared Media panel.
    if (this.gallerySelect) {
      var seld = this.gallerySelected || {};
      this.container.querySelectorAll('[data-msg-id]').forEach(function (el) {
        var k = el.getAttribute('data-msg-id') + '|' + (el.getAttribute('data-chat') || '');
        if (seld[k]) el.classList.add('selected');
      });
    }
    this.updateGalleryBulkBar();
    this.attachEvents();
  },

  /* Leave the gallery, then hand the scroll to the chat panel's own mechanism. Switching tab and
     setting the pending id in the same turn works because the chat panel reads the id when its
     render runs — the same approach the Shared Media panel uses, and for the same reason: a
     scroll issued by hand gets undone by the re-render. */
  jumpToMessage: function (chatId, msgId) {
    if (!chatId || msgId == null) return;
    window.store.setState({ activeTab: 'dms', activeChatId: chatId });
    window._pendingActivityScrollMsgId = msgId;
    if (window.ChatPanel && typeof window.ChatPanel.render === 'function') {
      window.ChatPanel.render();
    }
    setTimeout(function () {
      var row = document.querySelector('.message-row[data-msg-id="' + String(msgId).replace(/"/g, '') + '"]');
      if (!row) return;
      row.style.transition = 'background-color .25s';
      row.style.backgroundColor = 'var(--accent-soft)';
      setTimeout(function () {
        row.style.backgroundColor = '';
        setTimeout(function () { row.style.transition = ''; }, 400);
      }, 1100);
    }, 400);
  },

  setGallerySelect: function (on) {
    this.gallerySelect = !!on;
    if (!on) this.gallerySelected = {};
    var btn = document.getElementById('gallery-select-btn');
    if (btn) {
      btn.style.color = on ? 'var(--accent-primary)' : 'var(--text-secondary)';
      btn.title = on ? 'Cancel selection' : 'Select items';
      var want = on ? 'x' : 'list-checks';
      var cur = btn.querySelector('svg, i');
      if (cur && cur.getAttribute('data-lucide') !== want) {
        var ni = document.createElement('i');
        ni.setAttribute('data-lucide', want);
        ni.style.cssText = 'width:15px;height:15px;';
        cur.replaceWith(ni);
        if (window.lucide) window.lucide.createIcons({ root: btn });
      }
    }
    this.render(window.store.getState());
  },

  updateGalleryBulkBar: function () {
    var bar = document.getElementById('gallery-bulk-bar');
    var count = document.getElementById('gallery-bulk-count');
    if (!bar) return;
    var n = Object.keys(this.gallerySelected || {}).length;
    // The bar shows whenever select mode is ON, not only once something is picked. Hiding it
    // until then left no visible way to leave the mode — which is exactly what Dan hit.
    bar.style.display = this.gallerySelect ? 'flex' : 'none';
    if (count) {
      count.textContent = n === 0 ? 'Pick items to delete' : (n === 1 ? '1 item selected' : n + ' items selected');
    }
    var del = document.getElementById('gallery-bulk-delete');
    if (del) {
      del.disabled = n === 0;
      del.style.opacity = n === 0 ? '.45' : '1';
      del.style.cursor = n === 0 ? 'default' : 'pointer';
    }
  },

  /* Deleting media means deleting the MESSAGE it came from, for both sides — which is what Dan
     chose, and what store.deleteMessage already does. The confirm says so plainly, because
     "delete" in a gallery could reasonably mean three different things and the wrong guess
     destroys history. */
  deleteGallerySelected: function () {
    var sel = this.gallerySelected || {};
    var keys = Object.keys(sel);
    if (!keys.length) return;
    var self = this;
    var n = keys.length;
    window.ConfirmModal.show({
      title: 'Delete ' + n + (n === 1 ? ' item' : ' items') + '?',
      message: 'The message' + (n === 1 ? '' : 's') + ' will be removed for both you and the other person, along with the media. This cannot be undone.',
      confirmText: 'Delete',
      danger: true,
      onConfirm: function () {
        keys.forEach(function (k) {
          var parts = String(k).split('|');
          if (parts[0] && parts[1]) window.store.deleteMessage(parts[1], parts[0]);
        });
        self.gallerySelected = {};
        self.setGallerySelect(false);
      }
    });
  },

  /* The breakdown, biggest first, with a bar so the ranking is readable at a glance rather than
     requiring you to compare numbers. */
  renderStoragePop: function () {
    var pop = document.getElementById('gallery-storage-pop');
    if (!pop) return;
    var rows = this._storageByChat || [];
    var total = (this._storageTotal || {}).bytes || 0;
    var esc = window.Sanitize.escapeHtml;

    var html = '<div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px;">' +
      '<div style="font-size:13px; font-weight:700; color:var(--text-primary);">Where the space goes</div>' +
      '<div style="font-size:11px; color:var(--text-muted);">' + ((this._storageTotal || {}).size || '0 B') + '</div>' +
    '</div>';

    if (!rows.length) {
      html += '<div style="font-size:12px; color:var(--text-muted);">Nothing stored yet.</div>';
    } else {
      rows.forEach(function (r) {
        var pct = total > 0 ? Math.max(1, Math.round((r.bytes / total) * 100)) : 0;
        var size = window.Format && window.Format.fileSize ? window.Format.fileSize(r.bytes) : (r.bytes + ' B');
        html += '<div style="margin-bottom:10px;">' +
          '<div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; margin-bottom:4px;">' +
            '<span style="color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(r.name) + '</span>' +
            '<span style="color:var(--text-muted); flex-shrink:0;">' + size + ' &middot; ' + r.count + '</span>' +
          '</div>' +
          '<div style="height:5px; border-radius:3px; background:var(--bg-hover); overflow:hidden;">' +
            '<div style="height:100%; width:' + pct + '%; background:var(--accent-primary); border-radius:3px;"></div>' +
          '</div>' +
        '</div>';
      });
    }

    pop.innerHTML = html;
  },

  toggleStoragePop: function () {
    var pop = document.getElementById('gallery-storage-pop');
    if (!pop) return;
    if (pop.style.display === 'none') {
      this.renderStoragePop();
      pop.style.display = 'block';
    } else {
      pop.style.display = 'none';
    }
  },

  attachEvents() {
    var self = this;

    if (this.gallerySelected === undefined) this.gallerySelected = {};
    if (this.gallerySelect === undefined) this.gallerySelect = false;

    // Jump buttons are inside the items, so this listens on the container. It runs before the
    // item's own inline onclick only in select mode (the capture listener above); outside it,
    // the jump button stops the event itself.
    // The rail is rebuilt every render, so its listener is attached to the CONTAINER (once) and
    // delegated, not to the rail itself.
    if (this.container && !this.container._monthWired) {
      this.container._monthWired = true;
      this.container.addEventListener('click', function (e) {
        var b = e.target.closest('.gallery-month-btn');
        if (!b) return;
        e.preventDefault();
        e.stopPropagation();
        var anchor = String(b.getAttribute('data-anchor')).replace(/"/g, '');
        var target = self.container.querySelector('[data-msg-id="' + anchor + '"]');
        if (!target) return;
        // The scroll container is the wrapper the render opens; find it from the item.
        // Walk up to the element that actually scrolls, by its overflow. Comparing
        // scrollHeight to clientHeight finds the GRID first: it overflows by a few pixels of
        // gap, so the walk stopped there and scrollTop never moved.
        var scroller = target.parentElement;
        while (scroller && scroller !== self.container) {
          var oy = window.getComputedStyle(scroller).overflowY;
          if (oy === 'auto' || oy === 'scroll') break;
          scroller = scroller.parentElement;
        }
        if (!scroller || scroller === self.container) return;
        var sr = scroller.getBoundingClientRect();
        var tr = target.getBoundingClientRect();
        scroller.scrollTop += (tr.top - sr.top) - 16;
        var rail = document.getElementById('gallery-month-rail');
        if (rail) {
          Array.prototype.forEach.call(rail.querySelectorAll('.gallery-month-btn'), function (x) {
            x.style.color = 'var(--text-muted)';
            x.style.background = 'transparent';
          });
        }
        b.style.color = 'var(--accent-primary)';
        b.style.background = 'var(--bg-hover)';
      });
    }

    if (this.container && !this.container._jumpWired) {
      this.container._jumpWired = true;
      this.container.addEventListener('click', function (e) {
        var jb = e.target.closest('.gallery-jump');
        if (!jb) return;
        e.preventDefault();
        e.stopPropagation();
        self.jumpToMessage(jb.getAttribute('data-chat'), jb.getAttribute('data-msg-id'));
      });
    }

    var selBtn = document.getElementById('gallery-select-btn');
    if (selBtn) {
      selBtn.addEventListener('click', function () { self.setGallerySelect(!self.gallerySelect); });
    }
    var delBtn = document.getElementById('gallery-bulk-delete');
    if (delBtn) delBtn.addEventListener('click', function () { self.deleteGallerySelected(); });
    var clrBtn = document.getElementById('gallery-bulk-clear');
    if (clrBtn) clrBtn.addEventListener('click', function () {
      self.gallerySelected = {};
      self.render(window.store.getState());
    });

    // Capture phase: every item carries an inline onclick that opens the viewer, and those fire
    // before any bubble-phase listener on a parent.
    if (this.container && !this.container._selectWired) {
      this.container._selectWired = true;
      this.container.addEventListener('click', function (e) {
        if (!self.gallerySelect) return;
        var item = e.target.closest('[data-msg-id]');
        if (!item || !self.container.contains(item)) return;
        e.preventDefault();
        e.stopPropagation();
        var key = item.getAttribute('data-msg-id') + '|' + (item.getAttribute('data-chat') || '');
        if (self.gallerySelected[key]) delete self.gallerySelected[key];
        else self.gallerySelected[key] = true;
        item.classList.toggle('selected', !!self.gallerySelected[key]);
        self.updateGalleryBulkBar();
      }, true);
    }

    // The header is rebuilt on every render, so the button needs re-wiring each time — but the
    // document listener must not be, or one would accumulate per render.
    var stat = document.getElementById('gallery-storage-stat');
    if (stat) {
      stat.addEventListener('click', function (e) {
        e.stopPropagation();
        self.toggleStoragePop();
      });
    }
    if (!window._galleryStoragePopWired) {
      window._galleryStoragePopWired = true;
      document.addEventListener('click', function (e) {
        var pop = document.getElementById('gallery-storage-pop');
        if (!pop || pop.style.display === 'none') return;
        if (pop.contains(e.target) || e.target.closest('#gallery-storage-stat')) return;
        pop.style.display = 'none';
      });
    }
    var filterBtns = this.container.querySelectorAll('.gallery-filter-btn');
    filterBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        self.currentFilter = e.currentTarget.getAttribute('data-id');
        self.render(window.store.getState());
      });
    });

    var typeFilterBtns = this.container.querySelectorAll('.gallery-type-filter');
    typeFilterBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        self.mediaType = e.currentTarget.getAttribute('data-type');
        self.render(window.store.getState());
      });
    });

    var modeBtns = this.container.querySelectorAll('.view-mode-btn');
    modeBtns.forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        var mode = e.currentTarget.getAttribute('data-mode');
        self.displayMode = mode;

        // ⚠⚠ THE STORE'S OWN SETTINGS HAVE TO MOVE TOO, AND NOT MOVING THEM IS WHY
        // THIS SWITCHER DID NOTHING. It built `newSettings` and then never used it —
        // `_persistSettings()` persists `store.state.settings`, so the OLD mode went
        // to disk — and because the store never changed, the subscription above kept
        // re-reading `galleryViewMode` (still 'grid') and resetting `displayMode`
        // under the user on the very next store change. Clicking a view mode set the
        // field, re-rendered once, and was silently undone.
        //
        // The earlier note here said persisting through the store "re-rendered the
        // whole app on every view-mode click", and that is true — but it is exactly
        // what every other setting does, and avoiding it cost the feature. Measured
        // before and after: the mode now survives the render and reaches the disk.
        var live = window.store.getState();
        window.store.setState({ settings: { ...(live.settings || {}), galleryViewMode: mode } });
        if (typeof window.store._persistSettings === 'function') {
          window.store._persistSettings();
        } else {
          if (window.Storage) window.Storage.set('settings', { ...(live.settings || {}), galleryViewMode: mode });
          if (window.orbitAPI && window.orbitAPI.dbSetSetting) window.orbitAPI.dbSetSetting('settings', { ...(live.settings || {}), galleryViewMode: mode });
        }
        self.render(window.store.getState());
      });
    });

    var searchInput = document.getElementById('gallery-search');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        self.searchQuery = e.target.value;
        self.render(window.store.getState());
        var newSearchInput = document.getElementById('gallery-search');
        if (newSearchInput) {
          newSearchInput.focus();
          var val = newSearchInput.value;
          newSearchInput.value = '';
          newSearchInput.value = val;
        }
      });
    }
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.GlobalGallery.init();
});
