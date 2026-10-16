// src/js/views/sidebar-left.js

window.SidebarLeft = {
  init() {
    this.container = document.getElementById('left-sidebar-container');
    this.container.style.cssText = 'display:flex; flex-direction:column; flex:1; align-items:center; overflow:hidden;';
    this.render();
    this.attachEvents();
    
    this.unsubscribe = window.store.subscribe((state, changedState) => {
      if (!changedState) {
        this.render();
        this.attachEvents(); // render() replaces innerHTML → re-wire click handlers
        this.renderAvatar(state.currentUser);
        return;
      }
      if ('settings' in changedState) {
        // Folders rail button is gated on enableExperimental — re-render so it
        // appears/disappears when the experimental toggle flips.
        this.render();
        this.attachEvents(); // render() replaces innerHTML → re-wire click handlers
        this.renderAvatar(state.currentUser);
      } else if ('currentUser' in changedState) {
        this.renderAvatar(state.currentUser);
      }
    });
    this.renderAvatar(window.store.getState().currentUser);
  },

  renderAvatar(user) {
    if (!this.container) return;
    const profileBtn = this.container.querySelector('#btn-profile');
    if (!profileBtn) return;
    var frame = window.Frames.getFrameForUser(user ? user.userId : null);
    const avatarImg = user && user.avatar ? '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">' : '<i data-lucide="user-round"></i>';
    var frameHtml = frame ? '<img src="icons/frames/pfp_frame_' + frame + '.png" style="position:absolute;top:-14%;left:-14%;width:122%;height:122%;pointer-events:none;object-fit:contain;" draggable="false" alt="">' : '';
    profileBtn.innerHTML = '<div class="avatar avatar-md" style="position:relative;width:40px;height:40px;">' + avatarImg + frameHtml + window.OrbitPresence.badge(user ? user.status : 'online') + '</div>';
    lucide.createIcons({ root: profileBtn });
  },

  render() {
    var s = (window.store.getState().settings || {}).sidebarButtons || {};
    var showActivity = s.activity !== false;
    var showGallery = s.gallery !== false;
    var showStorage = s.storage !== false;
    var showFolders = (window.store.getState().settings || {}).enableExperimental === true;
    var activeView = window.store.getState().activeView;
    var activeTab = window.store.getState().activeTab;
    // The gallery is tracked by activeTab, not activeView — and the old template only
    // asked "are we in folders?", so DMs lit up whenever you were anywhere else
    // (including the gallery). Any re-render then stole the gallery's highlight and
    // handed it back to DMs, which is why changing the gallery display style reset the
    // sidebar to DMs.
    var inGallery = activeTab === 'gallery';
    var inFolders = activeView === 'folders';

    this.container.innerHTML = `
      <div class="sidebar-top">
        <!-- Logo -->
        <button class="icon-btn ${(!inGallery && !inFolders) ? 'active' : ''}" id="btn-nav-dms" title="Direct Messages">
          <i data-lucide="message-circle"></i>
        </button>
        <div class="sidebar-separator" style="width:24px;height:1px;background:var(--border-subtle);margin-top:8px;margin-bottom:8px;margin-left:auto;margin-right:12px;"></div>
        ${showFolders ? '<button class="icon-btn' + (inFolders ? ' active' : '') + '" id="btn-nav-folders" title="Folders"><i data-lucide="folder"></i></button>' : ''}
        ${showActivity ? '<button class="icon-btn" id="btn-nav-activity" title="Activity Center"><i data-lucide="bell"></i></button>' : ''}
        ${showGallery ? '<button class="icon-btn' + (inGallery ? ' active' : '') + '" id="btn-nav-gallery" title="Gallery"><i data-lucide="archive"></i></button>' : ''}
        ${showStorage ? '<button class="icon-btn" id="btn-nav-storage" title="Storage"><i data-lucide="hard-drive"></i></button>' : ''}
      </div>
      
      <div class="sidebar-spacer" style="flex: 1;"></div>
      
      <div class="sidebar-bottom" style="padding-bottom:30px;">
        <button class="icon-btn" id="btn-nav-settings" title="Settings">
          <i data-lucide="settings"></i>
        </button>
        <button class="icon-btn" id="btn-profile" title="Profile">
          <div class="avatar avatar-md">
            <i data-lucide="user-round"></i>
          </div>
          ${window.OrbitPresence.badge('online')}
        </button>
      </div>
    `;
    // Re-initialize icons for newly added HTML
    lucide.createIcons({ root: this.container });
  },

  attachEvents() {
    // Nav buttons logic
    const btns = this.container.querySelectorAll('.icon-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (btn.id === 'btn-nav-activity') {
          if (window.ActivityCenter) window.ActivityCenter.show();
          return;
        }
        if (btn.id === 'btn-nav-folders') {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          window.store.setState({ activeView: 'folders', activeFolder: null });
          return;
        }
        if (btn.id === 'btn-nav-storage') {
          if (window.SettingsModal) window.SettingsModal.open('data');
          return;
        }
        if(btn.id !== 'btn-profile' && btn.id !== 'btn-nav-settings') {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          
          if (btn.id === 'btn-nav-gallery') {
            window.store.setState({ activeTab: 'gallery' });
          } else {
            // DM button: escape hatch out of the folders view
            var st = window.store.getState();
            if (st.activeView === 'folders') {
              window.store.setState({ activeTab: 'dms', activeView: 'friends', activeFolder: null });
            } else {
              window.store.setState({ activeTab: 'dms' });
            }
          }
        }
      });
    });

    var settingsBtn = document.getElementById('btn-nav-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if(window.SettingsModal) window.SettingsModal.open();
      });
    }

    var profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        if(window.ProfileCard) window.ProfileCard.toggle();
      });
      profileBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if(window.AccountSwitcher) window.AccountSwitcher.toggle();
      });
    }
  }
};
