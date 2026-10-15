// src/js/components/profile-card.js

window.ProfileCard = {
  isOpen: false,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'profile-card-container';
    this.container.style.cssText = 'display:none;position:absolute;bottom:80px;left:20px;width:300px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:1000;overflow:visible;flex-direction:column;';
    document.body.appendChild(this.container);
    this.attachEvents();
    var self = this;
    this.currentUserBeingViewed = null;
    window.store.subscribe(function(state, changedState) {
      if (!self.isOpen || !self.currentUserBeingViewed) return;
      if (self.currentUserBeingViewed === state.currentUser.userId && (!changedState || 'currentUser' in changedState)) {
        self.render(state.currentUser);
        return;
      }
      if (self.currentUserBeingViewed !== state.currentUser.userId && (!changedState || 'friends' in changedState)) {
        var friend = state.friends.find(function(f) { return f.userId === self.currentUserBeingViewed; });
        if (friend) self.render(friend);
      }
    });
  },

  render(user) {
    if (!user) return;
    
    var frame = window.Frames.getFrameForUser(user.userId);

    var avatarHtml = user.avatar
      ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<i data-lucide="user-round" style="width:40px;height:40px;"></i>';

    var avatarContainerHtml = '<div style="width:80px;height:80px;border-radius:50%;background:var(--bg-surface);border:4px solid var(--bg-surface);position:absolute;top:-40px;display:flex;align-items:center;justify-content:center;overflow:visible;">' +
      avatarHtml +
      (frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '') +
    '</div>';

    var bioHtml = user.bio
      ? window.Sanitize.markdown(user.bio)
      : '<span style="color:var(--text-muted);font-style:italic;">No bio yet...</span>';

    var statuses = [
      { value: 'online', label: 'Online', icon: 'circle', color: 'var(--accent-success)' },
      { value: 'away', label: 'Away', icon: 'moon', color: 'var(--accent-warning)' },

      { value: 'dnd', label: 'Do Not Disturb', icon: 'bell-off', color: 'var(--accent-danger)' },
      { value: 'invisible', label: 'Invisible', icon: 'eye-off', color: 'var(--text-muted)' }
    ];
    var curStatus = statuses.find(function(s) { return s.value === user.status; }) || statuses[0];
    
    var isMe = user.userId === window.store.getState().currentUser.userId;

    var editBtnHtml = isMe ? '<button id="btn-edit-profile" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.5);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:white;cursor:pointer;">' +
          '<i data-lucide="edit-2" style="width:16px;"></i>' +
        '</button>' : '';

    var statusBtnsHtml = isMe ? '<div style="margin-top:16px;position:relative;">' +
        '<label style="display:block;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Status</label>' +
        '<button id="status-dropdown-btn" style="width:100%;display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;background:var(--bg-base);border:1px solid var(--border-subtle);color:var(--text-primary);font-size:14px;cursor:pointer;text-align:left;">' +
          window.OrbitPresence.glyph(curStatus.value, 12) +
          '<span style="flex:1;">' + curStatus.label + '</span>' +
          '<i data-lucide="chevron-up" style="width:14px;height:14px;color:var(--text-muted);flex-shrink:0;"></i>' +
        '</button>' +
        '<div id="status-dropdown-menu" style="display:none;position:absolute;bottom:100%;left:0;right:0;z-index:100;margin-bottom:6px;background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:10px;box-shadow:var(--shadow-lg);overflow:hidden;">' +
        '</div>' +
      '</div>' : '';

    this.container.innerHTML =
      '<div style="border-radius:16px 16px 0 0;overflow:hidden;">' +
        '<div id="profile-banner" style="height:100px;position:relative;">' +
          editBtnHtml +
        '</div>' +
      '</div>' +
      '<div style="padding:0 20px 20px 20px;position:relative;border-radius:0 0 16px 16px;">' +
          avatarContainerHtml +
        '<div style="margin-top:48px;">' +
          '<div style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary);">' + window.Sanitize.escapeHtml(user.username) + '</div>' +
          '<div style="font-size:14px;color:var(--text-secondary);margin-bottom:12px;">#' + window.Sanitize.escapeHtml(user.usertag) + '</div>' +
          '<div style="font-size:14px;color:var(--text-primary);line-height:1.5;padding:12px;background:var(--bg-base);border-radius:8px;">' + bioHtml + '</div>' +
          statusBtnsHtml +
        '</div>' +
      '</div>';

    // Set banner background safely via JS (prevents CSS injection)
    var bannerEl = this.container.querySelector('#profile-banner');
    if (bannerEl && user.banner) {
      if (user.banner.startsWith('#') || user.banner.startsWith('rgb')) {
        bannerEl.style.background = user.banner;
      } else {
        bannerEl.style.background = 'url("' + user.banner.replace(/"/g, '%22') + '") center/cover no-repeat';
      }
    } else if (bannerEl) {
      bannerEl.style.background = 'var(--accent-primary)';
    }

    lucide.createIcons({ root: this.container });
    
    if (isMe) {
      var self = this;
      var dropdownBtn = this.container.querySelector('#status-dropdown-btn');
      var dropdownMenu = this.container.querySelector('#status-dropdown-menu');

      if (dropdownBtn && dropdownMenu) {
        // Build menu items
        statuses.forEach(function(s) {
          var item = document.createElement('div');
          item.className = 'status-dropdown-item';
          item.setAttribute('data-status', s.value);
          item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;font-size:13px;color:var(--text-primary);transition:background 0.1s;';
          item.innerHTML = window.OrbitPresence.glyph(s.value, 12) + '<span>' + s.label + '</span>';
          if (s.value === user.status) item.style.background = 'var(--bg-hover)';
          item.addEventListener('mouseenter', function() { item.style.background = 'var(--bg-hover)'; });
          item.addEventListener('mouseleave', function() { item.style.background = s.value === user.status ? 'var(--bg-hover)' : 'transparent'; });
          item.addEventListener('click', function(e) {
            e.stopPropagation();
            var newStatus = item.getAttribute('data-status');
            window.Identity.update({ status: newStatus });
            if (window.orbitAPI && window.orbitAPI.broadcastBeacon) {
              window.orbitAPI.broadcastBeacon();
            }
            dropdownMenu.style.display = 'none';
          });
          dropdownMenu.appendChild(item);
        });
        // Icons are now inline colored circles, no Lucide creation needed

        dropdownBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
        });

        // Close menu on outside click
        document.addEventListener('click', function closeMenu(e) {
          if (dropdownMenu.style.display !== 'none' && !dropdownMenu.contains(e.target) && e.target !== dropdownBtn && !dropdownBtn.contains(e.target)) {
            dropdownMenu.style.display = 'none';
          }
        });
      }

      var editBtn = this.container.querySelector('#btn-edit-profile');
      if (editBtn) {
        editBtn.addEventListener('click', function() {
          self.close();
          if (window.SettingsModal) window.SettingsModal.open('account');
        });
      }
    }
  },

  attachEvents() {
    var self = this;
    document.addEventListener('click', function(e) {
      if (self.isOpen && !self.container.contains(e.target) && !e.target.closest('#btn-profile') && !e.target.closest('.chat-header-avatar') && !e.target.closest('.list-row-avatar')) {
        self.close();
      }
    });
  },

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  },

  open(user) {
    user = user || window.store.getState().currentUser;
    this.currentUserBeingViewed = user.userId;
    this.render(user);
    this.container.style.display = 'flex';
    this.isOpen = true;
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.ProfileCard.init();
});
