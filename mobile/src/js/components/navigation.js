// mobile/src/js/components/navigation.js
// v0.8.1-beta — primary navigation.
//
// Before this release the app had NO top-level navigation. Every surface was
// reached from a floating profile pill pinned to the bottom-right, which is why
// that pill had to carry settings, the profile and a copy-ID button all at once.
// This file adds the spine: a floating pill tab bar injected into each tab-level
// panel, plus the header account control that replaced the pill.
//
// The bar is injected INTO the panels rather than living once in #app-layout.
// A panel is display:none unless it is active, so injecting it means the bar
// appears and disappears with its panel and needs no visibility observer.

var OrbitNav = {

  /** Top-level destinations, in order. */
  // Icons are chosen so the ACTIVE state can be FILLED.
  //
  // Lucide is outline-only, so "filled" means `fill: currentColor` on the active
  // icon (see redesign.css). The catch is that filling an outline only says
  // anything if the glyph has INTERNAL SHAPE — otherwise it becomes a blob:
  //
  //   activity   a polyline           -> shapeless lump
  //   settings   a gear, teeth merge  -> a flower
  //   history    a circle + a notch   -> a BALL at 24px, the notch is 2px
  //
  // So the two tabs whose own icons cannot be filled use ones that can:
  //   activity -> bell   a solid bell, real shape at 24px, and it is what the
  //                      panel is: All / Mentions / Files / System, with an
  //                      unread dot on the tab
  // Chats and Contacts keep theirs; message-circle and users fill perfectly.
  //
  // Settings keeps its gear. switchTo() deliberately does NOT mark it active —
  // it is an overlay on top of whatever tab you are on — so its filled form never
  // renders and there is nothing to gain by changing the glyph.
  //
  // Chosen by rendering candidates at the real 24px and at 3x — the small size is
  // exactly where a ball and a glyph differ.
  TABS: [
    { id: 'chats',    label: 'Chats',    icon: 'message-circle', panel: 'panel-chats'    },
    { id: 'contacts', label: 'Contacts', icon: 'users',          panel: 'panel-friends'  },
    { id: 'activity', label: 'Activity', icon: 'bell',           panel: 'panel-activity' },
    // Settings is an overlay, not a panel — see switchTo().
    { id: 'settings', label: 'Settings', icon: 'settings',       panel: null             }
  ],

  active: 'chats',
  _inited: false,
  _activityUnread: false,

  // ──────────────────────────────────────────────────────────────────────────

  init: function() {
    if (this._inited) return;
    // app.js assigns window.switchPanel near the end of its own setup, and it
    // loads before this file — but a cached bundle could differ, so wait for it
    // rather than assuming.
    var self = this;
    var tries = 0;
    (function wait() {
      if (typeof window.switchPanel === 'function' || tries++ > 40) {
        self._inited = true;
        // The strip is labelled "Active now", and the All/Online/Offline chips
        // that used to drive it are gone. Without this it defaults to 'all' and
        // the header would be a lie — every contact listed as active.
        window._onlineFriendFilter = 'online';
        self._injectBars();
        self._wireAvatar();
        self._wireBackButtons();
        self.setActive(self.active);
        return;
      }
      setTimeout(wait, 50);
    })();
  },

  // ── Tab bar ───────────────────────────────────────────────────────────────

  _tabbarHtml: function(activeId) {
    var buttons = this.TABS.map(function(t) {
      var isActive = t.id === activeId;
      return '<button class="tab' + (isActive ? ' active' : '') + '"' +
             ' type="button" data-tab="' + t.id + '"' +
             ' aria-label="' + t.label + '"' +
             ' aria-selected="' + (isActive ? 'true' : 'false') + '">' +
               '<i data-lucide="' + t.icon + '"></i>' +
               '<span>' + t.label + '</span>' +
               (t.id === 'activity'
                 ? '<span class="tab-dot" style="display:none;"></span>'
                 : '') +
             '</button>';
    }).join('');

    // A class, not an id: this markup is injected into three panels.
    return '<div class="orbit-tabbar"><div class="pill">' + buttons + '</div></div>';
  },

  _injectBars: function() {
    var self = this;
    this.TABS.forEach(function(t) {
      if (!t.panel) return;
      var panel = document.getElementById(t.panel);
      if (!panel) return;
      // Remove any bar from a previous init so a re-run cannot double up.
      var old = panel.querySelector(':scope > .orbit-tabbar');
      if (old) old.remove();
      panel.insertAdjacentHTML('beforeend', self._tabbarHtml(self.active));
    });

    // One delegated listener on the document rather than three sets, so bars
    // injected later still work.
    if (!this._delegated) {
      this._delegated = true;
      document.addEventListener('click', function(e) {
        var btn = e.target.closest ? e.target.closest('.orbit-tabbar .tab') : null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        OrbitNav.switchTo(btn.getAttribute('data-tab'));
      });
    }

    this._refreshIcons();
  },

  _refreshIcons: function() {
    if (window.lucide && window.lucide.createIcons) {
      document.querySelectorAll('.orbit-tabbar').forEach(function(bar) {
        try { window.lucide.createIcons({ root: bar }); } catch (e) {}
      });
    }
  },

  /** Paint the active state across every injected bar. */
  setActive: function(tabId) {
    this.active = tabId || 'chats';
    var self = this;
    document.querySelectorAll('.orbit-tabbar .tab').forEach(function(btn) {
      var on = btn.getAttribute('data-tab') === self.active;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    this._refreshIcons();
  },

  /** Move to a top-level destination. */
  switchTo: function(tabId) {
    var tab = null;
    for (var i = 0; i < this.TABS.length; i++) {
      if (this.TABS[i].id === tabId) { tab = this.TABS[i]; break; }
    }
    if (!tab || tabId === this.active) {
      // Re-tapping the current tab is a no-op, except Settings which is an
      // overlay the user may have closed.
      if (!tab || tabId !== 'settings') return;
    }

    if (tabId === 'settings') {
      // Settings is a slide-in overlay, not a panel. Opening it does not change
      // which tab you are on, so the active tab is left alone.
      if (typeof window.showSettingsOverlay === 'function') {
        window.showSettingsOverlay();
      }
      return;
    }

    if (typeof window.switchPanel === 'function' && tab.panel) {
      // No direction hint. It used to pass `tabId === 'chats' ? 'reverse' : 'enter'`,
      // which made the direction depend on the DESTINATION rather than on where
      // you were coming from — so every move not involving Chats slid the same
      // way. switchPanel derives it from the panel order now.
      window.switchPanel(tab.panel);
    }

    // Panels are lazy: nothing rendered the friends list before, because
    // nothing ever activated that panel.
    if (tabId === 'contacts') {
      try {
        if (window.OrbitHome && window.OrbitHome.renderFriendsList) {
          window.OrbitHome.renderFriendsList();
        }
      } catch (e) {}
    }
    if (tabId === 'activity') {
      try {
        if (typeof window.renderActivity === 'function') window.renderActivity();
      } catch (e) {}
    }

    this.setActive(tabId);
    this.setActivityDot(false);
  },

  /** Unread dot on the Activity tab. */
  setActivityDot: function(on) {
    this._activityUnread = !!on;
    document.querySelectorAll('.orbit-tabbar .tab[data-tab="activity"] .tab-dot')
      .forEach(function(dot) {
        dot.style.display = on ? 'block' : 'none';
      });
  },

  // ── Header account control ────────────────────────────────────────────────

  _wireAvatar: function() {
    var btn = document.getElementById('orbit-home-avatar');
    if (!btn || btn._wired) return;
    btn._wired = true;

    // Tap opens the profile sheet; long-press copies the user ID.
    //
    // The ID's whole purpose is to be handed to someone else, and the button
    // that used to do this lived on the pill. Rather than drop the capability,
    // it moves here. Long-press is the standard mobile home for a secondary
    // action on an avatar.
    var pressTimer = null;
    var longFired = false;

    var start = function() {
      longFired = false;
      pressTimer = setTimeout(function() {
        longFired = true;
        OrbitNav._copyUserId();
      }, 600);
    };
    var cancel = function() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };

    btn.addEventListener('touchstart', start, { passive: true });
    btn.addEventListener('touchend', cancel);
    btn.addEventListener('touchcancel', cancel);
    btn.addEventListener('touchmove', cancel, { passive: true });
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', cancel);
    btn.addEventListener('mouseleave', cancel);

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (longFired) { longFired = false; return; }
      // Tap opens the PROFILE. The account switcher is one tap further in, from
      // the button in the profile's top-left — it is a rarer action than looking
      // at your own profile, and it used to sit on the first tap.
      if (typeof window.showProfileSheet === 'function') {
        window.showProfileSheet();
      } else if (window.OrbitAccounts) {
        window.OrbitAccounts.open();
      }
    });
  },

  /**
   * The Activity panel's own back button switches the panel itself. The tab bar
   * has to follow, or it would keep showing Activity as active on the Chats
   * screen.
   */
  _wireBackButtons: function() {
    if (this._backWired) return;
    this._backWired = true;
    document.addEventListener('click', function(e) {
      if (!e.target.closest) return;
      if (e.target.closest('#btn-activity-back')) {
        OrbitNav.setActive('chats');
      }
    });
  },

  _copyUserId: function() {
    var id = (window.MStore && MStore.user &&
              (MStore.user.id || MStore.user.userId)) || '';
    if (!id) return;
    var toast = (typeof window.showToast === 'function') ? window.showToast : null;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(id)
        .then(function() { if (toast) toast('User ID copied', 'info'); })
        .catch(function() { if (toast) toast('Could not copy', 'error'); });
    } else if (toast) {
      toast('Could not copy', 'error');
    }
  },

  /**
   * Paint the header avatar from the store.
   *
   * This replaces renderProfilePill(). Callers that used to refresh the pill
   * (renderChatList, the profile editor, the status picker) call this instead —
   * same job, new element.
   */
  syncAvatar: function() {
    var wrap = document.getElementById('orbit-home-avatar');
    if (!wrap) return;
    var img = document.getElementById('orbit-home-avatar-img');
    var initialEl = document.getElementById('orbit-home-avatar-initial');
    var dot = document.getElementById('orbit-home-avatar-presence');

    var user = (window.MStore && MStore.user) || null;
    if (!user) {
      if (initialEl) initialEl.textContent = '?';
      return;
    }

    var name = user.name || user.username || 'User';
    var initial = String(name).charAt(0).toUpperCase();

    if (user.avatar && img) {
      img.src = user.avatar;
      img.style.display = 'block';
      if (initialEl) initialEl.style.display = 'none';
    } else {
      if (img) img.style.display = 'none';
      if (initialEl) {
        initialEl.style.display = 'flex';
        initialEl.textContent = initial;
      }
    }

    // Profile frame, gated on the stable setting.
    if (MStore.settings && MStore.settings.profileFrames) {
      var num = parseInt(MStore.settings.profileFrame, 10) || 0;
      var frame = wrap.querySelector('.pfp-frame');
      if (num > 0) {
        if (!frame) {
          frame = document.createElement('img');
          frame.className = 'pfp-frame';
          frame.draggable = false;
          frame.alt = '';
          wrap.appendChild(frame);
        }
        var src = 'icons/frames/pfp_frame_' + num + '.png';
        if (frame.getAttribute('src') !== src) frame.src = src;
      } else if (frame) {
        frame.remove();
      }
    } else {
      var stale = wrap.querySelector('.pfp-frame');
      if (stale) stale.remove();
    }

    if (dot) {
      var status = user.status || 'offline';
      // ⚠ THE BADGE POSITIONS ITSELF (`position:absolute; bottom:-1px; right:-1px`)
      // against the nearest positioned ancestor, which is `.orbit-avatar-btn`. So the
      // outer span keeps its id but DROPS `.presence` — leaving it would apply the old
      // dot's positioning to a wrapper that now contains the positioned badge, and the
      // two offsets would stack.
      dot.className = '';
      dot.innerHTML = window.OrbitPresence
        ? window.OrbitPresence.badge(status, 12, 'var(--bg-base)')
        : '';
    }
  },

  // ── Chat panel (kept from the previous version — chat-screen.js calls these) ─

  /** Open the conversation panel. */
  openChat: function() {
    var panel = document.getElementById('panel-chat');
    if (panel) panel.classList.add('open');
    // The tab bar would otherwise sit under the composer.
    document.getElementById('app-layout').classList.add('orbit-chat-open');
  },

  /** Close the conversation panel. */
  closeChat: function() {
    var panel = document.getElementById('panel-chat');
    if (panel) panel.classList.remove('open');
    document.getElementById('app-layout').classList.remove('orbit-chat-open');
  },

  /** Show bottom sheet */
  showBottomSheet: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) overlay.classList.add('active');
  },

  /** Hide bottom sheet */
  hideBottomSheet: function() {
    var overlay = document.getElementById('bottom-sheet-overlay');
    if (overlay) overlay.classList.remove('active');
  }
};

// Self-init. navigation.js is the last script in index.html, so app.js has
// already defined what this needs by the time it runs.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { OrbitNav.init(); });
} else {
  OrbitNav.init();
}

window.OrbitNav = OrbitNav;
