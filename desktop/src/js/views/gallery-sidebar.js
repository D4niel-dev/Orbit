// src/js/views/gallery-sidebar.js

window.GallerySidebar = {
  isOpen: false,
  currentTab: 'images',

  /* Message timestamps are not reliably Dates or ISO strings: they come back from storage as
     a STRING holding an epoch with a trailing ".0" — "1785589248803.0" — and
     `new Date("1785589248803.0")` is an Invalid Date. Every age and every day group computed
     from one was NaN. Parse the number first, then fall back. Same helper as the jump chip. */
  _ts: function (t) {
    if (t == null) return 0;
    if (typeof t === 'number') return t;
    var n = parseFloat(t);
    if (!isNaN(n) && n > 1e11) return n;
    var d = new Date(t).getTime();
    return isNaN(d) ? 0 : d;
  },

  /* What KIND of thing an item is, for the type filter. Images, videos and audio come from the
     Images tab; everything else from Files. */
  _kindOf: function (it) {
    var t = String(it.type || '').toLowerCase();
    var m = String(it.mimeType || '').toLowerCase();
    if (t === 'image' || m.indexOf('image/') === 0) return 'image';
    if (t === 'video' || m.indexOf('video/') === 0) return 'video';
    if (t === 'audio' || m.indexOf('audio/') === 0) return 'audio';
    return 'file';
  },

  _dateCutoff: function (key) {
    var DAY = 86400000;
    if (key === 'today') { var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (key === 'week') return Date.now() - 7 * DAY;
    if (key === 'month') return Date.now() - 30 * DAY;
    return 0;
  },

  /* The filter popover. Three labelled rows of chips; one choice per row, and clicking the
     active chip clears that row — which is how you get back to "all" without a separate
     control for it. */
  renderFilterPop: function (items) {
    var pop = this.filterPop;
    if (!pop) return;
    var f = this.filters || {};

    var users = [];
    (items || []).forEach(function (it) {
      if (it.senderName && users.indexOf(it.senderName) === -1) users.push(it.senderName);
    });

    // Only offer kinds this tab can actually contain. The Images tab is images, so offering
    // "Videos" there would be a filter that can never match anything.
    var kinds = (this.currentTab === 'links') ? []
      : (this.currentTab === 'images') ? ['image']
      : ['video', 'audio', 'file'];
    var kindLabels = { image: 'Images', video: 'Videos', audio: 'Audio', file: 'Files' };
    var dates = [['today', 'Today'], ['week', 'Past week'], ['month', 'Past month']];

    var self = this;
    var chip = function (label, active, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'padding:4px 10px; border-radius:11px; cursor:pointer; font-size:11px; white-space:nowrap; ' +
        'border:1px solid ' + (active ? 'var(--accent-primary)' : 'var(--border-subtle)') + '; ' +
        'background:' + (active ? 'var(--accent-primary)' : 'transparent') + '; ' +
        'color:' + (active ? '#fff' : 'var(--text-secondary)') + ';';
      b.addEventListener('click', onClick);
      return b;
    };

    var row = function (label, children) {
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;';
      var l = document.createElement('div');
      l.textContent = label;
      l.style.cssText = 'font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--text-muted); width:38px; flex-shrink:0;';
      wrap.appendChild(l);
      children.forEach(function (c) { wrap.appendChild(c); });
      return wrap;
    };

    pop.innerHTML = '';
    pop.appendChild(row('User', [chip('All', !f.user, function () { self.filters.user = ''; self.applyFilters(); })]
      .concat(users.map(function (u) {
        return chip(u, f.user === u, function () { self.filters.user = (f.user === u ? '' : u); self.applyFilters(); });
      }))));

    if (kinds.length) {
      pop.appendChild(row('Type', [chip('All', !f.type, function () { self.filters.type = ''; self.applyFilters(); })]
        .concat(kinds.map(function (k) {
          return chip(kindLabels[k], f.type === k, function () { self.filters.type = (f.type === k ? '' : k); self.applyFilters(); });
        }))));
    }

    pop.appendChild(row('Date', [chip('Any time', !f.date, function () { self.filters.date = ''; self.applyFilters(); })]
      .concat(dates.map(function (d) {
        return chip(d[1], f.date === d[0], function () { self.filters.date = (f.date === d[0] ? '' : d[0]); self.applyFilters(); });
      }))));
  },

  toggleFilterPop: function () {
    if (!this.filterPop) return;
    if (this.filterPop.style.display === 'none') {
      this.renderFilterPop(this._lastItems || []);
      this.filterPop.style.display = 'block';
    } else {
      this.filterPop.style.display = 'none';
    }
  },

  applyFilters: function () {
    this.visibleCount = 60;   // same reason: a filtered list is a different list
    this.render(window.store.getState());
  },

  init() {
    this.container = document.getElementById('panel-gallery');
    this.contentArea = document.getElementById('gallery-content');
    this.btnClose = document.getElementById('btn-close-gallery');
    this.searchInput = document.getElementById('gallery-search-input');
    this.filterBtn = document.getElementById('btn-gallery-filter');
    this.filterPop = document.getElementById('gallery-filter-pop');
    this.filterDot = document.getElementById('gallery-filter-dot');
    this.viewBtn = document.getElementById('btn-gallery-view');
    this.selectBtn = document.getElementById('btn-gallery-select');
    this.bulkBar = document.getElementById('gallery-bulk-bar');
    this.bulkCount = document.getElementById('gallery-bulk-count');
    if (!this.selected) this.selected = {};
    if (!this.visibleCount) this.visibleCount = 60;
    if (this.selectMode === undefined) this.selectMode = false;
    if (!this.panelViewMode) {
      this.panelViewMode = (window.store.getState().settings || {}).galleryPanelViewMode || 'grid';
    }
    if (this.searchQuery === undefined) this.searchQuery = '';
    if (!this.filters) this.filters = { user: '', type: '', date: '' };

    if (!this.container) return;

    this.attachEvents();

    var self = this;
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      if (self.isOpen) {
        var relevant = ['friends', 'messages', 'activeChatId', 'activeTab', 'groups'];
        if (!changedState || relevant.some(function(k) { return k in changedState; })) {
          self.render(state);
        }
      }
    });
  },

  attachEvents() {
    var self = this;
    if (this.selectBtn && !this.selectBtn._wired) {
      this.selectBtn._wired = true;
      this.selectBtn.addEventListener('click', function () {
        self.setSelectMode(!self.selectMode);
      });
      var bd = document.getElementById('btn-gallery-bulk-download');
      if (bd) bd.addEventListener('click', function () { self.downloadSelected(); });
      var bc = document.getElementById('btn-gallery-bulk-clear');
      if (bc) bc.addEventListener('click', function () {
        self.selected = {};
        self.render(window.store.getState());
      });
    }

    // Capture phase, so it beats the inline onclick on each item.
    if (this.container && !this.container._selectWired) {
      this.container._selectWired = true;
      this.container.addEventListener('click', function (e) {
        if (!self.selectMode) return;
        var item = e.target.closest('.gallery-item, .gallery-file-card, [data-item-key]');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        var key = item.getAttribute('data-item-key');
        if (!key) {
          var idEl = item.querySelector('[data-msg-id]');
          var urlEl = item.querySelector('[data-url]');
          // data-item-url first, matching the key the render builds when it re-applies the
          // marks — the two have to agree or a selection silently stops being visible.
          key = (idEl ? idEl.getAttribute('data-msg-id') : '') + '|' +
                (item.getAttribute('data-item-url') || (urlEl ? urlEl.getAttribute('data-url') : ''));
        }
        if (!key || key === '|') return;
        if (self.selected[key]) delete self.selected[key];
        else self.selected[key] = item.getAttribute('data-item-url') || '';
        item.classList.toggle('selected', !!self.selected[key]);
        self.updateBulkBar();
      }, true);
    }

    if (this.viewBtn && !this.viewBtn._wired) {
      this.viewBtn._wired = true;
      this.viewBtn.addEventListener('click', function () {
        self.panelViewMode = (self.panelViewMode === 'grid') ? 'list' : 'grid';
        // Persist WITHOUT touching the store. store.setState notifies every subscriber — the
        // chat panel, both sidebars, the gallery — so writing settings here re-rendered the whole
        // window every time someone flipped grid/list. The local mode already holds the new value.
        var st = window.store.getState();
        var next = Object.assign({}, st.settings, { galleryPanelViewMode: self.panelViewMode });
        if (window.Storage) window.Storage.set('settings', next);
        self.render(window.store.getState());
      });
    }

    if (this.filterBtn && !this.filterBtn._wired) {
      this.filterBtn._wired = true;
      this.filterBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        self.toggleFilterPop();
      });
      // clicking anywhere else closes it, the way every other popover in the app behaves
      document.addEventListener('click', function (e) {
        if (!self.filterPop || self.filterPop.style.display === 'none') return;
        if (self.filterPop.contains(e.target) || e.target.closest('#btn-gallery-filter')) return;
        self.filterPop.style.display = 'none';
      });
    }

    if (this.searchInput && !this.searchInput._wired) {
      this.searchInput._wired = true;
      this.searchInput.addEventListener('input', function () {
        self.searchQuery = this.value.trim().toLowerCase();
        self.visibleCount = 60;
        self.render(window.store.getState());
      });
    }
    var self = this;
    if (this.btnClose) {
      this.btnClose.addEventListener('click', function() {
        self.close();
      });
    }

    // Tabs
    if (this.container) {
      this.container.querySelectorAll('.gallery-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          self.container.querySelectorAll('.gallery-tab').forEach(function(t) {
            t.classList.remove('active');
            t.style.fontWeight = '500';
            t.style.color = 'var(--text-secondary)';
            t.style.borderBottomColor = 'transparent';
          });
          tab.classList.add('active');
          tab.style.fontWeight = '600';
          tab.style.color = 'var(--text-primary)';
          tab.style.borderBottomColor = 'var(--accent-primary)';
          self.currentTab = tab.getAttribute('data-tab');
          self.visibleCount = 60;   // a new tab is a new list; keep any expansion out of it
          self.render(window.store.getState());
        });
      });
    }

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });

    // File download handler
    if (this.container) {
      this.container.addEventListener('click', function(e) {
        if (e.target.closest('#btn-gallery-more')) {
          self.visibleCount += 60;
          self.render(window.store.getState());
          return;
        }

        var jumpBtn = e.target.closest('.gallery-jump');
        if (jumpBtn) {
          var jChat = jumpBtn.getAttribute('data-chat') || window.store.getState().activeChatId;
          self.jumpToMessage(jChat, jumpBtn.getAttribute('data-msg-id'));
          return;
        }

        var downloadBtn = e.target.closest('.gallery-file-download');
        if (downloadBtn) {
          var url = downloadBtn.getAttribute('data-url');
          var name = downloadBtn.getAttribute('data-name');
          if (url && window.orbitAPI && window.orbitAPI.downloadFile) {
            window.orbitAPI.downloadFile(url, name || 'file');
          } else if (url) {
            var a = document.createElement('a');
            a.href = url;
            a.download = name || 'file';
            a.click();
          }
        }
      });
    }
  },

  getDayCategory(ts) {
    var d = new Date(ts);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var yesterday = today - 86400000;
    var itemDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    
    if (itemDay === today) return "Today";
    if (itemDay === yesterday) return "Yesterday";
    
    var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return monthNames[d.getMonth()] + " " + d.getFullYear();
  },

  getSenderName(senderId, state) {
    if (senderId === state.currentUser.userId) return "You";
    var friend = state.friends.find(f => f.userId === senderId);
    if (friend) return friend.username;
    var group = state.groups.find(g => g.groupId === state.activeChatId);
    if (group && group.members) {
      var m = group.members.find(x => x.userId === senderId);
      if (m) return m.username;
    }
    return "Unknown";
  },

  render(state) {
    if (!state.activeChatId) {
      this.contentArea.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:40px;">Select a chat to view shared media.</div>';
      return;
    }

    const messages = state.messages[state.activeChatId] || [];
    let items = [];

    // Gather data based on tab
    messages.forEach(msg => {
      var ts = this._ts(msg.timestamp);
      var senderName = this.getSenderName(msg.sender, state);

      if (this.currentTab === 'images' || this.currentTab === 'files') {
        if (msg.attachments) {
          msg.attachments.forEach(att => {
            var aType = (att.type || '').toLowerCase();
            var aMime = (att.mimeType || '').toLowerCase();
            // IMAGES means images. Video and audio used to count as "media" and landed in this
            // tab, where their thumbnails cannot load — a video has no image to show and an audio
            // file has none at all, so both rendered as broken images. They belong in Files,
            // which gives them a proper type icon by extension.
            var isImage = aType === 'image' || aMime.startsWith('image/');
            if ((this.currentTab === 'images' && isImage) || 
                (this.currentTab === 'files' && !isImage)) {
              items.push({
                ...att,
                msgId: msg.id,
                ts: ts,
                senderName: senderName
              });
            }
          });
        }
      } else if (this.currentTab === 'links') {
        if (msg.text) {
          var urlRegex = /(https?:\/\/[^\s]+)/g;
          var matches = msg.text.match(urlRegex);
          if (matches) {
            matches.forEach(url => {
              var domain = '';
              try { domain = new URL(url).hostname; } catch(e) { domain = url; }
              items.push({
                url: url,
                domain: domain,
                msgId: msg.id,
                ts: ts,
                senderName: senderName
              });
            });
          }
        }
      }
    });

    // Filter by the search box. Matching on name, url, domain and sender: those are the four
    // things a person would type to find something again — what it was called, where it came
    // from, or who sent it.
    if (this.searchQuery) {
      var q = this.searchQuery;
      items = items.filter(function (it) {
        return String(it.name || '').toLowerCase().indexOf(q) !== -1 ||
               String(it.url || '').toLowerCase().indexOf(q) !== -1 ||
               String(it.domain || '').toLowerCase().indexOf(q) !== -1 ||
               String(it.senderName || '').toLowerCase().indexOf(q) !== -1;
      });
    }


    this._lastItems = items.slice();   // unfiltered, so the filter popover can list every sender

    // Dan's filters: by sender, by kind, by age.
    var f = this.filters || {};
    var self = this;   // the filter callbacks below are plain functions, so they need the panel
    if (f.user) items = items.filter(function (it) { return it.senderName === f.user; });
    if (f.type) items = items.filter(function (it) { return self._kindOf(it) === f.type; });
    if (f.date) {
      var cutoff = self._dateCutoff(f.date);
      if (cutoff) items = items.filter(function (it) { return it.ts >= cutoff; });
    }

    if (this.selectBtn) this.selectBtn.style.display = 'block';
    this.updateBulkBar();

    if (this.filterDot) {
      var anyFilter = !!(f.user || f.type || f.date);
      this.filterDot.style.display = anyFilter ? 'block' : 'none';
    }

    // The toggle only means something on the tabs that have two layouts. Dan's instruction was
    // explicit that Links keeps the display it has.
    if (this.viewBtn) {
      var twoLayouts = this.currentTab !== 'links';
      this.viewBtn.style.display = twoLayouts ? 'flex' : 'none';
      var vi = this.viewBtn.querySelector('svg, i');
      if (vi) {
        var want = (this.panelViewMode === 'grid') ? 'layout-grid' : 'list';
        if (vi.getAttribute('data-lucide') !== want) {
          var ni = document.createElement('i');
          ni.setAttribute('data-lucide', want);
          ni.style.cssText = 'width:15px;height:15px;';
          vi.replaceWith(ni);
          if (window.lucide) window.lucide.createIcons({ root: this.viewBtn });
        }
      }
    }

    if (items.length === 0) {
      if (this.searchQuery) {
        this.contentArea.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);gap:10px;text-align:center;">' +
          '<i data-lucide="search-x" style="width:26px;height:26px;"></i>' +
          '<div style="font-size:13px;">Nothing here matches \u201c' + window.Sanitize.escapeHtml(this.searchQuery) + '\u201d</div>' +
        '</div>';
        if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
        return;
      }
      var emptyTxt = this.currentTab === 'images' ? 'No images shared yet.' : (this.currentTab === 'files' ? 'No files shared yet.' : 'No links shared yet.');
      var emptyIcon = this.currentTab === 'images' ? 'image' : (this.currentTab === 'files' ? 'file' : 'link-2');
      this.contentArea.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;gap:12px;opacity:0.6;"><i data-lucide="' + emptyIcon + '" style="width:48px;height:48px;"></i><div style="font-size:14px;">' + emptyTxt + '</div></div>';
      if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
      return;
    }

    // Sort descending
    items.sort((a, b) => b.ts - a.ts);

    var totalItems = items.length;
    if (totalItems > this.visibleCount) items = items.slice(0, this.visibleCount);

    // Group by date
    var groups = {};
    items.forEach(item => {
      var category = this.getDayCategory(item.ts);
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });

    let html = '';

    Object.keys(groups).forEach(category => {
      var groupItems = groups[category];
      html += '<div style="margin-bottom:16px;">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;position:sticky;top:-16px;background:var(--bg-surface);padding:8px 0;z-index:2;">' + category + '</div>';
      
      if (this.currentTab === 'images' && this.panelViewMode === 'list') {
        // Rows instead of tiles: a thumbnail, the name, and who sent it. At 340px a two-column
        // grid shows very little of a filename, which is the thing you are usually looking for.
        html += '<div style="display:flex;flex-direction:column;gap:6px;">';
        groupItems.forEach(img => {
          var lu = window.Sanitize.escapeHtml(img.url);
          var ln = window.Sanitize.escapeHtml(String(img.name || 'Media'));
          var ls = window.Sanitize.escapeHtml(String(img.senderName || ''));
          var lthumb = lu;
          if (lthumb.indexOf('orbit-file://') !== 0) lthumb = lthumb.replace('orbit-db://attachment/', 'orbit-db://thumbnail/');
          html += '<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:var(--bg-base);border:1px solid var(--border-subtle);">' +
            '<div class="gallery-thumb" data-url="' + lu + '" data-name="' + ln + '" data-type="' + (img.type || 'image') + '" style="width:40px;height:40px;border-radius:8px;overflow:hidden;flex-shrink:0;background:var(--bg-hover);cursor:pointer;">' +
              '<img src="' + lthumb + '" data-fallback-src="' + lu + '" style="width:100%;height:100%;object-fit:cover;">' +
            '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ln + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);">' + ls + ' &middot; ' + window.Format.fileSize(img.size || 0) + '</div>' +
            '</div>' +
            '<button class="gallery-jump" data-msg-id="' + img.msgId + '" title="Go to message" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:4px;"><i data-lucide="corner-up-left" style="width:14px;height:14px;"></i></button>' +
            '<button class="gallery-file-download" data-url="' + lu + '" data-name="' + ln + '" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:4px;"><i data-lucide="download" style="width:14px;height:14px;"></i></button>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'images') {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        groupItems.forEach(img => {
          const safeUrl = window.Sanitize.escapeHtml(img.url);
          const safeName = window.Sanitize.escapeHtml(String(img.name || 'Media'));
          const safeSize = window.Sanitize.escapeHtml(String(img.size || 0));
          const safeSender = window.Sanitize.escapeHtml(img.senderName);
          var imgType = (img.type || '').toLowerCase();
          var imgMime = (img.mimeType || '').toLowerCase();
          var isVideo = imgType === 'video' || imgMime.startsWith('video/');
          var isAudio = imgType === 'audio' || imgMime.startsWith('audio/');
          var posterUrl = window.Sanitize.escapeHtml(img._poster || '');
          var overlayIcon = 'search';
          if (isVideo) {
            mediaContent = '<div style="width:100%;height:100%;background:var(--bg-panel);position:relative;transition:transform 0.3s;" class="media-container">' +
              (posterUrl ? '<img src="' + posterUrl + '" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;">' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;transition:transform 0.3s;"><i data-lucide="video" style="width:32px;height:32px;opacity:0.5;"></i></div>') +
            '</div>';
            overlayIcon = 'play';
          } else if (isAudio) {
            mediaContent = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-base);transition:transform 0.3s;"><i data-lucide="music" style="width:40px;height:40px;color:var(--accent-success);"></i></div>';
            overlayIcon = 'play';
          } else {
            var thumbUrl = safeUrl;
            if (thumbUrl.indexOf('orbit-file://') !== 0) {
              thumbUrl = thumbUrl.replace('orbit-db://attachment/', 'orbit-db://thumbnail/');
            }
            mediaContent = '<img src="' + thumbUrl + '" data-fallback-src="' + safeUrl + '" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;" onerror="if(window.mediaImgOnError) window.mediaImgOnError(this)">';
          }

          html += '<div class="gallery-item group" data-item-url="' + safeUrl + '" data-media-type="' + (isVideo ? 'video' : (isAudio ? 'audio' : 'image')) + '" style="position:relative;border-radius:12px;overflow:hidden;aspect-ratio:1/1;cursor:pointer;border:1px solid var(--border-subtle);" onclick="if(window.ImageViewer){ if(' + (isVideo ? 'true' : 'false') + ') window.ImageViewer.openVideo(\'' + safeUrl + '\',\'' + safeName + '\'); else if(' + (isAudio ? 'true' : 'false') + ') window.ImageViewer.openAudio({url:\'' + safeUrl + '\',name:\'' + safeName + '\',size:\'' + safeSize + '\'}); else window.ImageViewer.open({url:\'' + safeUrl + '\',name:\'' + safeName + '\',size:\'' + safeSize + '\'}); }">' +
            mediaContent +
            (isVideo ? '<div style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.7);border-radius:4px;padding:2px 6px;font-size:10px;color:white;font-weight:600;pointer-events:none;"><i data-lucide="video" style="width:10px;height:10px;margin-right:3px;vertical-align:middle;"></i>Video</div>' : '') +
            (isAudio ? '<div style="position:absolute;bottom:6px;left:6px;background:rgba(0,0,0,0.7);border-radius:4px;padding:2px 6px;font-size:10px;color:white;font-weight:600;pointer-events:none;">Audio</div>' : '') +
            '<div class="gallery-hover-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;flex-direction:column;justify-content:space-between;padding:8px;opacity:0;transition:opacity 0.2s;">' +
              '<div style="align-self:flex-end;display:flex;gap:6px;">' +
                '<button class="gallery-jump" data-msg-id="' + img.msgId + '" title="Go to message" style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;"><i data-lucide="corner-up-left" style="width:14px;height:14px;"></i></button>' +
                '<button style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;"><i data-lucide="' + overlayIcon + '" style="width:14px;height:14px;"></i></button>' +
              '</div>' +
              '<div style="font-size:11px;color:white;font-weight:500;">Sent by ' + safeSender + '</div>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'files' && this.panelViewMode === 'grid') {
        // Cards: the file-type icon and the name. Two per row at this width.
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
        groupItems.forEach(file => {
          var gu = window.Sanitize.escapeHtml(file.url);
          var gn = window.Sanitize.escapeHtml(String(file.name || 'File'));
          var gext = gn.split('.').pop().toLowerCase();
          var gicon = 'file';
          if (['mp3', 'wav', 'ogg', 'webm', 'flac', 'aac', 'm4a', 'wma'].indexOf(gext) !== -1) gicon = 'music';
          if (['mp4', 'mov', 'avi', 'mkv', 'wmv'].indexOf(gext) !== -1) gicon = 'video';
          if (['pdf', 'doc', 'docx', 'txt', 'rtf'].indexOf(gext) !== -1) gicon = 'file-text';
          if (['zip', 'rar', '7z', 'gz', 'tar'].indexOf(gext) !== -1) gicon = 'archive';
          if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'xml', 'sh'].indexOf(gext) !== -1) gicon = 'code';
          // min-width:0 and box-sizing are what make the filename truncate. A grid item defaults
          // to min-width:auto, so it refuses to shrink below its content and a long name pushes
          // the card wider than its column.
          html += '<div class="gallery-file-card gallery-jump" data-msg-id="' + file.msgId + '" title="Go to message" data-url="' + gu + '" data-name="' + gn + '" style="min-width:0; box-sizing:border-box; overflow:hidden; display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 8px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);cursor:pointer;">' +
            '<div style="width:36px;height:36px;border-radius:9px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;">' +
              '<i data-lucide="' + gicon + '" style="width:17px;height:17px;color:var(--text-secondary);"></i>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--text-primary);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;max-width:100%;" title="' + gn + '">' + gn + '</div>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'files') {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        groupItems.forEach(file => {
          const safeUrl = window.Sanitize.escapeHtml(file.url);
          const safeName = window.Sanitize.escapeHtml(String(file.name || 'File'));
          const safeSender = window.Sanitize.escapeHtml(file.senderName);
          const ext = safeName.split('.').pop().toLowerCase();
          var icon = 'file';
          if (['mp3', 'wav', 'ogg', 'webm', 'flac', 'aac', 'm4a', 'wma'].indexOf(ext) !== -1) icon = 'music';
          if (['mp4', 'mov', 'avi', 'mkv', 'wmv'].indexOf(ext) !== -1) icon = 'video';
          if (['pdf', 'doc', 'docx', 'txt', 'rtf'].indexOf(ext) !== -1) icon = 'file-text';
          if (['zip', 'rar', '7z', 'gz', 'tar'].indexOf(ext) !== -1) icon = 'archive';
          if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json', 'xml', 'sh'].indexOf(ext) !== -1) icon = 'code';

          html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor=\'var(--accent-primary)\';" onmouseleave="this.style.borderColor=\'var(--border-subtle)\';">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;"><i data-lucide="' + icon + '"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">' + safeName + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);">' + safeSender + ' &middot; ' + window.Format.fileSize(file.size || 0) + '</div>' +
            '</div>' +
            '<button class="gallery-jump" data-msg-id="' + file.msgId + '" title="Go to message" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:4px;"><i data-lucide="corner-up-left" style="width:14px;height:14px;"></i></button>' +
            '<button class="gallery-file-download" data-url="' + safeUrl + '" data-name="' + safeName + '" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;"><i data-lucide="download" style="width:16px;height:16px;"></i></button>' +
          '</div>';
        });
        html += '</div>';
      } else if (this.currentTab === 'links') {
        html += '<div style="display:flex;flex-direction:column;gap:8px;">';
        groupItems.forEach(link => {
          const safeUrl = window.Sanitize.escapeHtml(link.url);
          const safeDomain = window.Sanitize.escapeHtml(link.domain);
          const safeSender = window.Sanitize.escapeHtml(link.senderName);
          html += '<div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--bg-base);border:1px solid var(--border-subtle);cursor:pointer;transition:border-color 0.2s;" onmouseenter="this.style.borderColor=\'var(--accent-primary)\';" onmouseleave="this.style.borderColor=\'var(--border-subtle)\';" onclick="window.open(\'' + safeUrl + '\', \'_blank\')">' +
            '<div style="width:36px;height:36px;border-radius:8px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;color:var(--accent-primary);flex-shrink:0;"><i data-lucide="link"></i></div>' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px;">' + safeDomain + '</div>' +
              '<div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + safeUrl + '</div>' +
            '</div>' +
            '<button class="gallery-jump" data-msg-id="' + link.msgId + '" title="Go to message" style="background:transparent;border:none;color:var(--text-muted);cursor:pointer;padding:4px;flex-shrink:0;"><i data-lucide="corner-up-left" style="width:14px;height:14px;"></i></button>' +
            '<div style="font-size:11px;color:var(--text-muted);flex-shrink:0;">' + safeSender + '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      
      html += '</div>';
    });

    if (totalItems > this.visibleCount) {
      html += '<div style="padding:4px 0 12px; text-align:center;">' +
        '<button id="btn-gallery-more" style="padding:7px 18px; border-radius:10px; border:1px solid var(--border-subtle); ' +
        'background:var(--bg-base); color:var(--text-secondary); cursor:pointer; font-size:12px; font-weight:600;">' +
        'Show more <span style="color:var(--text-muted); font-weight:500;">(' + (totalItems - this.visibleCount) + ' more)</span>' +
        '</button>' +
        '<div style="margin-top:6px; font-size:10px; color:var(--text-muted);">Showing ' + items.length + ' of ' + totalItems + '</div>' +
      '</div>';
    }

    this.contentArea.innerHTML = html;

    // Re-apply the selection marks from state. The capture listener toggles the class on click,
    // but anything that re-renders the panel rebuilds these elements and the class is lost —
    // so the render is the authority and the click just gives instant feedback.
    if (this.selectMode) {
      var sel = this.selected || {};
      this.contentArea.querySelectorAll('.gallery-item, .gallery-file-card').forEach(function (el) {
        var idEl = el.querySelector('[data-msg-id]');
        var k = (idEl ? idEl.getAttribute('data-msg-id') : '') + '|' + (el.getAttribute('data-item-url') || '');
        if (sel[k]) el.classList.add('selected');
      });
    }
    
    // Inject hover css via JS for .gallery-item.group since inline hover on complex elements is tricky
    this.contentArea.querySelectorAll('.gallery-item.group').forEach(el => {
      var mediaType = el.getAttribute('data-media-type');
      var safeUrl = el.getAttribute('data-url');
      el.addEventListener('mouseenter', () => {
        var mediaEl = el.querySelector('img') || el.querySelector('video') || el.querySelector('.media-container');
        if (mediaEl) mediaEl.style.transform = 'scale(1.05)';
        if (mediaType === 'video') {
          var container = el.querySelector('.media-container');
          if (container && !container.querySelector('video')) {
            container.innerHTML = '<video src="' + safeUrl + '" style="width:100%;height:100%;object-fit:cover;transition:transform 0.3s;" muted loop autoplay playsinline></video>';
          } else if (container && container.querySelector('video')) {
            container.querySelector('video').play().catch(function(){});
          }
        }
        el.querySelector('.gallery-hover-overlay').style.opacity = '1';
      });
      el.addEventListener('mouseleave', () => {
        var mediaEl = el.querySelector('img') || el.querySelector('video') || el.querySelector('.media-container');
        if (mediaEl) mediaEl.style.transform = 'scale(1)';
        if (mediaType === 'video') {
          var vid = el.querySelector('video');
          if (vid) { vid.pause(); }
        }
        el.querySelector('.gallery-hover-overlay').style.opacity = '0';
      });
    });

    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
  },

  /* Scroll the chat feed to a message and flash it. Same shape as the pinned modal's jump:
     look for the row, and if it is not rendered yet ask the store to load the full chat and
     try again — the feed is virtualised for long conversations. */
  setSelectMode: function (on) {
    this.selectMode = !!on;
    if (!on) this.selected = {};
    if (this.selectBtn) {
      this.selectBtn.style.color = on ? 'var(--accent-primary)' : 'var(--text-secondary)';
      this.selectBtn.title = on ? 'Cancel selection' : 'Select items';
      var want = on ? 'x' : 'list-checks';
      var cur = this.selectBtn.querySelector('svg, i');
      if (cur && cur.getAttribute('data-lucide') !== want) {
        var ni = document.createElement('i');
        ni.setAttribute('data-lucide', want);
        ni.style.cssText = 'width:15px;height:15px;';
        cur.replaceWith(ni);
        if (window.lucide) window.lucide.createIcons({ root: this.selectBtn });
      }
    }
    this.render(window.store.getState());
  },

  updateBulkBar: function () {
    if (!this.bulkBar) return;
    var n = Object.keys(this.selected || {}).length;
    // Visible whenever select mode is on — hiding it until something was picked left no visible
    // way out of the mode.
    this.bulkBar.style.display = this.selectMode ? 'flex' : 'none';
    if (this.bulkCount) {
      this.bulkCount.textContent = n === 0 ? 'Pick items to download'
        : (n === 1 ? '1 item selected' : n + ' items selected');
    }
    var dl = document.getElementById('btn-gallery-bulk-download');
    if (dl) {
      dl.disabled = n === 0;
      dl.style.opacity = n === 0 ? '.45' : '1';
      dl.style.cursor = n === 0 ? 'default' : 'pointer';
    }
  },

  downloadSelected: function () {
    var keys = Object.keys(this.selected || {});
    if (!keys.length) return;
    var self = this;
    keys.forEach(function (k, i) {
      var url = self.selected[k];
      if (!url) return;
      // Staggered: browsers drop a burst of simultaneous downloads, and a user who picked
      // twenty files wants twenty files, not the four the browser felt like allowing.
      setTimeout(function () {
        if (window.orbitAPI && window.orbitAPI.downloadFile) {
          window.orbitAPI.downloadFile(url, (url.split('/').pop() || 'file'));
        } else {
          var a = document.createElement('a');
          a.href = url;
          a.download = url.split('/').pop() || 'file';
          a.click();
        }
      }, i * 220);
    });
  },

  jumpToMessage: function (chatId, msgId) {
    if (!chatId || msgId == null) return false;
    this.close();
    var id = String(msgId).replace(/"/g, '');
    var find = function () {
      return document.querySelector('.message-row[data-msg-id="' + id + '"]') ||
             document.querySelector('[data-msg-id="' + id + '"]');
    };
    var flash = function (el) {
      if (!el) return false;
      // Scroll the feed by hand rather than calling scrollIntoView.
      //
      // scrollIntoView did nothing here: the panel is position:absolute over the chat, so
      // hiding it reflows the feed, and the reflow undoes a scroll issued in the same turn.
      // Even deferred, the smooth behaviour never started. Moving scrollTop directly is
      // deterministic and cannot be cancelled by a reflow.
      var feed = document.getElementById('chat-message-feed');
      if (feed) {
        var fr = feed.getBoundingClientRect();
        var er = el.getBoundingClientRect();
        var delta = (er.top + er.height / 2) - (fr.top + fr.height / 2);
        feed.scrollTop = Math.max(0, feed.scrollTop + delta);
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      var prev = el.style.backgroundColor;
      el.style.transition = 'background-color .25s';
      el.style.backgroundColor = 'var(--accent-soft)';
      setTimeout(function () {
        el.style.backgroundColor = prev;
        setTimeout(function () { el.style.transition = ''; }, 400);
      }, 1100);
      return true;
    };
    // Scrolled a tick after the panel closes. The panel is position:absolute over the chat, so
    // hiding it reflows the feed — scrolling in the same turn gets undone by that reflow, which
    // is why the first version closed the panel and then did not move at all.
    // Uses the chat panel's OWN mechanism rather than scrolling by hand.
    //
    // The panel already supports "scroll to this message on the next render" via
    // window._pendingActivityScrollMsgId — it is how the activity centre jumps. My first three
    // attempts scrolled the feed directly and every one was undone, because the chat re-renders
    // when the side panel closes and that render scrolls to the bottom. Setting the pending id
    // and asking for a render puts the scroll inside the render, where it survives.
    window._pendingActivityScrollMsgId = msgId;
    if (window.ChatPanel && typeof window.ChatPanel.render === 'function') {
      window.ChatPanel.render();
    }
    // Flash it once it has landed, so you can see which message it was.
    setTimeout(function () { flash(find()); }, 400);
    return true;
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open() {
    if (!this.container) return;
    var state = window.store.getState();
    this.render(state);
    if (this._closeTimer) { clearTimeout(this._closeTimer); this._closeTimer = null; }
    this.container.classList.remove('panel-out');
    this.container.style.display = 'flex';
    // ⚠ After the display flip, so the panel has a measurable width. See the note on
    // OrbitReserveSidePanel: this panel is absolutely positioned and was covering the
    // chat header's ⋮, its own toggle, and the composer's Send button.
    if (window.OrbitReserveSidePanel) window.OrbitReserveSidePanel();
    // The class has to land a frame after display flips: an element going from display:none
    // has no from-state to animate out of, so the animation would be skipped entirely.
    var el = this.container;
    requestAnimationFrame(function () { el.classList.add('panel-in'); });
    this.isOpen = true;
  },

  close() {
    if (!this.container) return;
    var el = this.container;
    this.isOpen = false;
    el.classList.remove('panel-in');
    el.classList.add('panel-out');
    if (this._closeTimer) clearTimeout(this._closeTimer);
    // Hide it once the exit animation has finished, rather than cutting it off.
    this._closeTimer = setTimeout(function () {
      el.style.display = 'none';
      el.classList.remove('panel-out');
      el.classList.remove('panel-in');
      // ⚠ In the timer, not before it — the panel is still on screen for the 170ms of
      // the exit animation, so handing the space back early would snap the chat wider
      // while the panel is still sliding out.
      if (window.OrbitReserveSidePanel) window.OrbitReserveSidePanel();
      this._closeTimer = null;
    }.bind(this), 170);
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.GallerySidebar.init();
});
