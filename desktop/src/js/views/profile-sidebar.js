// src/js/views/profile-sidebar.js

window.ProfileSidebar = {
  isOpen: false,
  currentUserId: null,

  init() {
    this.container = document.getElementById('panel-profile');
    this.contentArea = document.getElementById('profile-sidebar-content');

    if (!this.container) return;

    this.attachEvents();
  },

  attachEvents() {
    var self = this;

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });
  },

  // The pinned block: a count, the top pin, and a way into the full list. Clicking the
  // pin scrolls the chat to that message.
  _pinnedSectionHtml(chatId) {
    var store = window.store;
    var P = window.OrbitPinned;
    if (!store || !store.getPinnedMessages) return '';
    var pinned = store.getPinnedMessages(chatId);
    if (!pinned.length) return '';
    var esc = window.Sanitize.escapeHtml;
    var limit = P ? P.limitFor(false) : 3;
    var first = pinned[0];
    // ⚠ `pf-card` so the pinned block is the same surface, border and radius as the
    // bio and the rows around it — it used to be its own inline `--bg-base` box with
    // its own radius, next to a bio box with a different one.
    return '<div id="profile-pinned" class="pf-card pf-pinned">' +
      '<div class="pf-pinned-head">' +
        '<i data-lucide="pin" class="pf-pinned-pin"></i>' +
        '<span class="pf-label">Pinned</span>' +
        '<span class="pf-pinned-count">' +
          pinned.length + ' of ' + limit +
        '</span>' +
      '</div>' +
      '<button id="profile-pinned-jump" class="pf-pinned-jump" data-msg-id="' + esc(String(first.msgId)) + '">' +
        esc(first.text || '(attachment)') +
      '</button>' +
      '<button id="profile-pinned-show-all" class="pf-pinned-all">' +
        (pinned.length > 1 ? 'Show all ' + pinned.length + ' pinned' : 'Manage pinned') +
      '</button>' +
    '</div>';
  },

  render(user) {
    var self = this;
    if (!user) {
      this.contentArea.innerHTML = '';
      return;
    }

    // The default banner. ⚠ `var(--banner-default)` rather than a gradient written
    // out here: this exact default is shared with the settings preview and the
    // Manage Group modal, and the three copies had already drifted — this one and
    // the group one still ended in a hardcoded #6C5CE7 long after the settings one
    // was fixed. The value lives in styles/variables.css, once.
    //
    // ⚠⚠ THIS HOLDS DECLARATIONS, NOT A WHOLE `style="…"` ATTRIBUTE, AND THAT IS THE
    // FIX FOR A BUG THAT HAD ALWAYS BEEN HERE. It used to be `'style="background:…"'`
    // and the consumer below was `'<div ' + bannerHtml + ' style="height:80px;…">'` —
    // so the div came out with TWO `style` attributes. The HTML parser keeps the
    // FIRST and silently DROPS the rest, so `height:80px;flex-shrink:0` never landed
    // and the banner rendered as a 319x0 box: a gradient painted into nothing, on a
    // profile that has no custom banner. Measured, not read — the parsed DOM shows
    // one style attribute and a height of 0, which is why reading the line looks
    // perfectly fine.
    //
    // The settings preview (settings-modal.js) writes it as declarations inside one
    // attribute and has always worked; this is the only site that did not.
    var bannerCss = user.banner
      ? (user.banner.startsWith('#') || user.banner.startsWith('linear-gradient')
        ? 'background:' + window.Sanitize.escapeHtml(user.banner) + ';'
        : 'background-image:url(' + window.Sanitize.escapeHtml(user.banner) + ');background-size:cover;background-position:center;')
      : 'background:var(--banner-default);';

    var bioHtml = user.bio
      ? window.Sanitize.markdown(user.bio)
      : '<span style="color:var(--text-muted);font-style:italic;">No bio yet...</span>';

    var isOnline = user.status === 'online';
    // ⚠ The presence palette lives in styles/variables.css as `--presence-*`. This
    // map used to be a SECOND copy of it, hardcoded in hex — so the same friend's
    // online dot was #22c55e here and --accent-success (#30D158) in the chat header,
    // and on a nord theme this one ignored the theme completely.
    var statusColors = {
      online: 'var(--presence-online)', away: 'var(--presence-away)',
      busy: 'var(--presence-busy)', dnd: 'var(--presence-busy)',
      offline: 'var(--presence-offline)', invisible: 'var(--presence-offline)'
    };
    var statusLabels = { online: 'Online', away: 'Away', busy: 'Busy', dnd: 'Do Not Disturb', invisible: 'Invisible', offline: 'Offline' };
    var statusColor = statusColors[user.status] || 'var(--presence-offline)';
    var statusLabel = statusLabels[user.status] || 'Offline';

    var lastSeenHtml = '';
    if (!isOnline && user.status !== 'invisible' && user.lastSeen) {
      var lastSeenStr = window.Format.relativeTime ? window.Format.relativeTime(new Date(user.lastSeen).toISOString()) : window.Format.absoluteTime(new Date(user.lastSeen).toISOString());
      lastSeenHtml = '<div class="pf-lastseen">Last seen ' + lastSeenStr + '</div>';
    }

    // A DM's chat id is the other person's user id.
    var pinnedChatId = user.userId;
    var pinnedSectionHtml = this._pinnedSectionHtml(pinnedChatId);

    // ⚠ THIS MARKUP CARRIES CLASSES RATHER THAN INLINE STYLES. Every other surface
    // in this app is styled by assigning `style="…"` in the renderer, and this panel
    // was too — which is why it had never been touched by a stylesheet and why the
    // banner could sit at height 0 unnoticed. The classes are `pf-*` and live in
    // §9d of styles/redesign.css. Every id is unchanged, so all the wiring below
    // (and the click handlers outside this file) still finds what it looks for.
    var avatarHtml = user.avatar
      ? (function() {
        var frame = window.Frames.getFrameForUser(user.userId);
        var img = '<img src="' + window.Sanitize.escapeHtml(user.avatar) + '" class="pf-avatar-img" alt="">';
        return frame
          ? '<span class="pf-avatar-framed">' + img + '<img src="icons/frames/pfp_frame_' + frame + '.png" class="pf-avatar-frame" draggable="false" alt=""></span>'
          : img;
      })()
      : '<span class="pf-avatar-initial">' + window.Sanitize.escapeHtml(user.username.charAt(0).toUpperCase()) + '</span>';

    this.contentArea.innerHTML =
      '<div class="pf-root">' +
        '<div class="pf-header">' +
          '<span class="pf-header-title">Profile</span>' +
          '<button id="btn-close-profile-sidebar" class="pf-close" title="Close"><i data-lucide="x"></i></button>' +
        '</div>' +

        // ⚠ The banner and the body share ONE scroll container. The avatar is pulled
        // up with a negative margin to straddle the banner's edge, and a negative
        // margin is clipped by an `overflow` ancestor — so with the scroller on
        // `.pf-body` the avatar's top half was cut off at the banner's edge and the
        // banner painted over it. The scroller has to be the ancestor of both.
        '<div class="pf-scroll">' +
          '<div class="pf-banner" style="' + bannerCss + '"></div>' +

        '<div class="pf-body">' +
          // ⚠ The avatar is pulled UP over the banner's bottom edge. It already
          // carried a 3px --bg-surface ring; a ring only reads as a ring if the disc
          // straddles an edge, and the body's top padding pushed it clear of the
          // banner instead — so the ring was invisible and the banner read as a
          // strip that happened to be there.
          '<div class="pf-identity">' +
            '<div class="pf-avatar">' + avatarHtml + '</div>' +
            '<h2 class="pf-name">' + window.Sanitize.escapeHtml(user.username) + '</h2>' +
            '<div class="pf-tag">#' + window.Sanitize.escapeHtml(user.usertag || '') + '</div>' +
            '<div class="pf-presence">' +
              '<span class="pf-dot">' + window.OrbitPresence.glyph(user.status, 10) + '</span>' +
              '<span class="pf-status">' + window.Sanitize.escapeHtml(statusLabel) + '</span>' +
            '</div>' +
            lastSeenHtml +
          '</div>' +

          '<div class="pf-card pf-bio">' + bioHtml + '</div>' +

          // Pinned messages — under the user info, alongside the bio and the user id, so
          // the panel says everything about this person in one place. The bar in the
          // conversation is separate and both are wanted.
          pinnedSectionHtml +

          // Mute. ⚠ The row is a <label> wrapping a REAL checkbox, instead of a div
          // with a click handler sitting next to a decorative div. Same interaction,
          // but the control is keyboard-reachable and the switch has state to read.
          '<label id="profile-mute-row" class="pf-card pf-row">' +
            '<span class="pf-row-main">' +
              '<i data-lucide="bell" id="profile-mute-icon" class="pf-row-icon"></i>' +
              '<span id="profile-mute-label" class="pf-row-label">Mute Notifications</span>' +
            '</span>' +
            '<span class="orbit-switch">' +
              '<input type="checkbox" id="profile-mute-input">' +
              '<span class="orbit-switch-track"><span class="orbit-switch-knob"></span></span>' +
            '</span>' +
          '</label>' +

          // User ID, with a way to copy it. It is a monospace string whose whole purpose
          // is to be handed to someone else, and there was no way to get it out.
          '<div class="pf-field">' +
            '<div class="pf-label">User ID</div>' +
            '<div class="pf-idrow">' +
              '<div class="pf-id">' + window.Sanitize.escapeHtml(user.userId) + '</div>' +
              '<button id="profile-copy-id" class="pf-copy" data-user-id="' + window.Sanitize.escapeHtml(user.userId) + '" title="Copy user ID">' +
                '<i data-lucide="copy"></i>' +
              '</button>' +
            '</div>' +
          '</div>' +

          // ⚠ `pf-row-danger`: a destructive action used to be the SAME CARD as the
          // mute row above it — same surface, same border, same shape, differing only
          // in the colour of the text. Blocking someone and muting them are not the
          // same kind of decision.
          '<div id="profile-block-row" class="pf-card pf-row pf-row-danger">' +
            '<i data-lucide="ban" id="profile-block-icon" class="pf-row-icon"></i>' +
            '<span id="profile-block-label" class="pf-row-label">Block User</span>' +
          '</div>' +
        '</div>' +
        '</div>' +
      '</div>';

    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });

    // Pinned: the top pin scrolls to its message, the second button opens the list.
    var _pinJump = this.contentArea.querySelector('#profile-pinned-jump');
    if (_pinJump) {
      _pinJump.addEventListener('click', function () {
        var id = _pinJump.getAttribute('data-msg-id');
        var el = document.querySelector('[data-msg-id="' + id + '"].message-row');
        // The chat may not have that message loaded yet; load it, then try again.
        if (!el && window.store && window.store.loadFullChatMessages) {
          window.store.loadFullChatMessages(pinnedChatId);
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
    var _pinBox = this.contentArea.querySelector('#profile-pinned');
    if (_pinBox) {
      _pinBox.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (window.PinnedMenu) window.PinnedMenu.showAt(e.clientX, e.clientY, pinnedChatId);
      });
    }

    var _pinAll = this.contentArea.querySelector('#profile-pinned-show-all');
    if (_pinAll) {
      _pinAll.addEventListener('click', function () {
        if (window.PinnedModal) window.PinnedModal.show(pinnedChatId);
      });
    }

    var _copyId = this.contentArea.querySelector('#profile-copy-id');
    if (_copyId) {
      _copyId.addEventListener('click', function () {
        var id = _copyId.getAttribute('data-user-id') || '';
        var done = function () { if (window.Toast && window.Toast.show) window.Toast.show('User ID copied', 'info'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(id).then(done).catch(function () {
            if (window.Toast && window.Toast.show) window.Toast.show('Could not copy', 'error');
          });
        }
      });
    }

    var closeBtn = this.contentArea.querySelector('#btn-close-profile-sidebar');
    if (closeBtn) {
      closeBtn.addEventListener('click', function(e) { e.stopPropagation(); self.close(); });
    }

    // Mute. The row is a <label> for #profile-mute-input, so a click anywhere in it
    // toggles the checkbox and fires `change` — one handler for one control, rather
    // than a div click handler that had to repaint the switch itself.
    var muteInput = this.contentArea.querySelector('#profile-mute-input');
    if (muteInput) {
      var state = window.store.getState();
      var isMuted = state.mutedChats && state.mutedChats[user.userId];
      self._updateMuteUI(isMuted);

      muteInput.addEventListener('change', function() {
        window.store.toggleMute(user.userId);
        var newState = window.store.getState();
        var nowMuted = newState.mutedChats && newState.mutedChats[user.userId];
        self._updateMuteUI(nowMuted);
      });
    }

    // Block/Unblock button
    var blockRow = this.contentArea.querySelector('#profile-block-row');
    if (blockRow) {
      var isBlocked = window.store.isUserBlocked(user.userId);
      self._updateBlockUI(isBlocked);

      blockRow.addEventListener('click', function(e) {
        e.stopPropagation();
        var nowBlocked = window.store.isUserBlocked(user.userId);
        if (nowBlocked) {
          window.store.unblockUser(user.userId);
        } else {
          window.store.blockUser(user.userId);
        }
        self._updateBlockUI(window.store.isUserBlocked(user.userId));
      });
    }
  },

  _updateBlockUI(isBlocked) {
    var icon = this.contentArea.querySelector('#profile-block-icon');
    var label = this.contentArea.querySelector('#profile-block-label');
    if (!icon || !label) return;
    if (isBlocked) {
      icon.setAttribute('data-lucide', 'user-check');
      icon.style.color = 'var(--accent-success)';
      label.textContent = 'Unblock User';
      label.style.color = 'var(--accent-success)';
    } else {
      icon.setAttribute('data-lucide', 'ban');
      icon.style.color = 'var(--accent-danger)';
      label.textContent = 'Block User';
      label.style.color = 'var(--accent-danger)';
    }
    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
  },

  _updateMuteUI(isMuted) {
    var icon = this.contentArea.querySelector('#profile-mute-icon');
    var label = this.contentArea.querySelector('#profile-mute-label');
    var input = this.contentArea.querySelector('#profile-mute-input');
    if (!icon || !label || !input) return;
    // ⚠ Sets the INPUT's checked state; the switch reads it (§9c of
    // styles/redesign.css). This used to paint the track's background and move the
    // knob by hand — the third of three copies of one state machine.
    input.checked = !!isMuted;
    if (isMuted) {
      icon.setAttribute('data-lucide', 'bell-off');
      // ⚠ The icon was --accent-danger and the track turned RED. Muting is not an
      // error: it is a setting that is on. The group modal's switch for the very
      // same action has always been accent, so the same control read as a failure
      // in one panel and a preference in the other. It now matches the switch it
      // sits next to — accent when on, neutral when off.
      icon.style.color = 'var(--accent-primary)';
      label.textContent = 'Unmute Notifications';
    } else {
      icon.setAttribute('data-lucide', 'bell');
      icon.style.color = 'var(--text-secondary)';
      label.textContent = 'Mute Notifications';
    }
    if (window.lucide) window.lucide.createIcons({ root: this.contentArea });
  },

  open(user) {
    if (!this.container || !user) return;
    this.currentUserId = user.userId;
    this.render(user);
    this.container.style.display = 'flex';
    // ⚠ Same fix as the gallery, and it had the same bug: this panel is
    // `position: absolute; right: 0`, so it sat on the chat header's ⋮, the gallery
    // toggle and the composer's Send button. See OrbitReserveSidePanel in app.js.
    if (window.OrbitReserveSidePanel) window.OrbitReserveSidePanel();
    this.isOpen = true;
  },

  close() {
    if (!this.container) return;
    this.container.style.display = 'none';
    // ⚠ After the display flip, so the panel is out of the measurement. The gallery can
    // still be open underneath, and the helper reads the DOM rather than being told.
    if (window.OrbitReserveSidePanel) window.OrbitReserveSidePanel();
    this.isOpen = false;
    this.currentUserId = null;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.ProfileSidebar.init();
});