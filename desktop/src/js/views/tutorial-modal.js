// src/js/views/tutorial-modal.js

window.TutorialModal = {
  isOpen: false,

  pages: [
    {
      target: null,
      title: 'Welcome to Orbit',
      desc: 'Orbit is a local-first peer-to-peer messaging app. It works over LAN and Wi-Fi, letting you message, share files, create groups, and customize your experience — all without a central server.'
    },
    {
      target: '#chat-container',
      title: 'Chats & Messages',
      desc: 'This is where your conversations live. Send direct messages, reply to specific messages, edit your sent messages, and react with emoji. Conversations are end-to-end encrypted when both peers support it.',
      gap: 18,
      preferLeft: true,
      width: 260
    },
    {
      target: '.chat-input-area',
      title: 'File & Image Sharing',
      desc: 'Use the input area to send images, documents, ZIP files, and more. Attachments are shared peer-to-peer with no cloud upload, and image previews appear inline in the message feed.',
      // ⚠⚠ OPEN A CONVERSATION FIRST. This step is about the input area and the
      // upload buttons, and on a fresh install NOTHING IS OPEN — so `.chat-input-area`
      // did not exist when render() looked for it, the card fell back to dead centre
      // with no spotlight, and the thing being described was not even on screen.
      // Dan: "we should open the bot chat to show the users the input message box and
      // the upload buttons".
      //
      // ⚠ The Echo chat, because it is the one conversation that exists before the
      // user has added anybody. Guarded on the friend existing rather than on the id
      // alone, so a profile that has removed it just gets the old behaviour.
      onEnter: function() {
        var pageIndex = this.currentPage;
        var self = this;
        var state = window.store && window.store.getState && window.store.getState();
        if (!state) return;
        // Already looking at a conversation? Leave the user where they are.
        if (state.activeChatId && document.querySelector('.chat-input-area')) return;

        var hasEcho = (state.friends || []).some(function(f) { return f.userId === 'local-echo'; });
        if (!hasEcho) return;

        window.store.setState({ activeChatId: 'local-echo' });
        // The composer is built by the chat panel's own render, so it is not there
        // on the next line. Re-target once it is, and only if this is still the step
        // the user is on.
        setTimeout(function() {
          if (self.currentPage !== pageIndex) return;
          var el = document.querySelector('.chat-input-area');
          if (el) self._updateTarget('.chat-input-area');
        }, 400);
      }
    },
    {
      target: '#panel-middle',
      title: 'LAN & Wi-Fi Modes',
      desc: 'LAN mode auto-discovers peers on your local network. Wi-Fi mode connects over the internet. Your connection status shows online friends and lets you manage your network settings.',
      preferRight: true
    },
    {
      target: '.tabs-container .tab:last-child',
      title: 'Groups',
      desc: 'The sidebar lists your friends and groups. Create group chats with multiple members, set icons, and invite others using invite codes. Group messages are encrypted pairwise.',
      preferRight: true,
      onEnter: function() {
        var groupsTab = document.querySelector('.tabs-container .tab:last-child');
        if (groupsTab && !groupsTab.classList.contains('active')) groupsTab.click();
      },
      onLeave: function() {
        var friendsTab = document.querySelector('.tabs-container .tab:first-child');
        if (friendsTab) friendsTab.click();
      }
    },
    {
      target: '.search-input-wrapper',
      title: 'Search & Navigation',
      desc: 'Search messages, files, people, and groups from here. Filter results by sender, date range, or content type to quickly find what you need.'
    },
    {
      target: null,
      title: 'Privacy & Storage',
      desc: 'Privacy mode hides attachment previews and removes media from your gallery. Your data is stored locally — you control what to keep, export, or delete.',
      onEnter: function() {
        var pageIndex = this.currentPage;
        var self = this;
        if (window.SettingsModal) window.SettingsModal.open('data');
        setTimeout(function() {
          if (self.currentPage !== pageIndex) return;
          // ⚠ THE WHOLE CARD, NOT THE LABEL INSIDE IT. `#privacy-mode-label` is the
          // one-line row holding the checkbox and the title, so the ring hugged that
          // row and left the description — the part that explains what the setting
          // DOES — outside the highlight. `#privacy-mode-section` is the card: title,
          // checkbox and description in one box. Dan: "we should let the blue outline
          // the full box of the setting... not just the check mark button".
          var privacyEl = document.querySelector('#privacy-mode-section');
          if (privacyEl) {
            privacyEl.scrollIntoView({ block: 'center' });
            self._updateTarget('#privacy-mode-section', { preferLeft: true, gap: 30 });
          }
        }, 500);
      },
      onLeave: function() {
        if (window.SettingsModal && window.SettingsModal.close) {
          window.SettingsModal.close();
        }
      }
    },
    {
      target: null,
      title: 'You\'re Ready!',
      desc: 'You now know the basics of Orbit. Start a conversation, create a group, or customize your experience in Settings. The welcome tour is always available there if you need a refresher.'
    }
  ],

  init() {},

  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.currentPage = 0;
    this._highlightedEl = null;
    this._origStyles = {};
    this.render();
  },

  getCardHtml() {
    var page = this.pages[this.currentPage];
    var total = this.pages.length;
    var isFirst = this.currentPage === 0;
    var isLast = this.currentPage === total - 1;

    var icons = ['message-circle', 'file-up', 'wifi', 'users', 'search', 'shield', 'sparkles'];
    var iconHtml = this.currentPage === 0
      ? '<img src="icons/app/orbit_256.png" style="width:36px;height:36px;">'
      : '<i data-lucide="' + icons[this.currentPage - 1] + '" style="width:32px;height:32px;color:var(--accent-primary);"></i>';

    return '' +
      '<div class="tutorial-card" style="width:' + (page.width || 420) + 'px;background:var(--bg-surface);border-radius:var(--radius-lg);padding:28px;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
        // Progress bar
        '<div style="display:flex;gap:5px;margin-bottom:24px;">' +
          this.pages.map(function(p, i) {
            var filled = i <= this.currentPage;
            return '<div style="flex:1;height:3px;border-radius:2px;background:' + (filled ? 'var(--accent-primary)' : 'var(--bg-hover)') + ';transition:background 0.3s;"></div>';
          }.bind(this)).join('') +
        '</div>' +
        // Icon
        '<div class="tutorial-icon" style="display:flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:14px;background:var(--accent-soft);margin-bottom:20px;">' + iconHtml + '</div>' +
        // Title
        '<h2 class="tutorial-title" style="font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text-primary);margin:0 0 10px;">' + page.title + '</h2>' +
        // Description
        '<p class="tutorial-desc" style="font-size:13px;line-height:1.6;color:var(--text-secondary);margin:0 0 24px;">' + page.desc + '</p>' +
        // Navigation
        '<div class="tutorial-nav" style="display:flex;align-items:center;justify-content:space-between;">' +
          '<div>' +
            (isFirst
              ? '<button class="tutorial-btn-skip" style="padding:8px 16px;border-radius:10px;background:transparent;color:var(--text-muted);border:1px solid var(--border-subtle);cursor:pointer;font-size:12px;font-weight:500;"><i data-lucide="x" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>Skip</button>'
              : '<button class="tutorial-btn-back" style="padding:8px 16px;border-radius:10px;background:transparent;color:var(--text-secondary);border:1px solid var(--border-subtle);cursor:pointer;font-size:12px;font-weight:500;"><i data-lucide="arrow-left" style="width:13px;height:13px;vertical-align:middle;margin-right:3px;"></i>Back</button>') +
          '</div>' +
          '<div>' +
            (isLast
              ? '<button class="tutorial-btn-finish" style="padding:8px 24px;border-radius:10px;background:var(--accent-primary);color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:600;"><i data-lucide="check" style="width:13px;height:13px;vertical-align:middle;margin-right:4px;"></i>Done</button>'
              : '<button class="tutorial-btn-next" style="padding:8px 24px;border-radius:10px;background:var(--accent-primary);color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:600;">Next <i data-lucide="arrow-right" style="width:13px;height:13px;vertical-align:middle;margin-left:4px;"></i></button>') +
          '</div>' +
        '</div>' +
      '</div>';
  },

  getArrowHtml(dir, pct) {
    pct = pct || 50;
    var size = 12;
    var color = 'var(--bg-surface)';
    if (dir === 'top') {
      return '<div class="tutorial-arrow" style="position:absolute;top:-' + (size - 1) + 'px;left:50%;margin-left:-' + size + 'px;width:0;height:0;border-left:' + size + 'px solid transparent;border-right:' + size + 'px solid transparent;border-bottom:' + size + 'px solid ' + color + ';filter:drop-shadow(0 -1px 1px rgba(0,0,0,0.1));"></div>';
    }
    if (dir === 'bottom') {
      return '<div class="tutorial-arrow" style="position:absolute;bottom:-' + (size - 1) + 'px;left:50%;margin-left:-' + size + 'px;width:0;height:0;border-left:' + size + 'px solid transparent;border-right:' + size + 'px solid transparent;border-top:' + size + 'px solid ' + color + ';filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));"></div>';
    }
    if (dir === 'left') {
      return '<div class="tutorial-arrow" style="position:absolute;left:-' + (size - 1) + 'px;top:' + pct + '%;margin-top:-' + size + 'px;width:0;height:0;border-top:' + size + 'px solid transparent;border-bottom:' + size + 'px solid transparent;border-right:' + size + 'px solid ' + color + ';filter:drop-shadow(-1px 0 1px rgba(0,0,0,0.1));"></div>';
    }
    if (dir === 'right') {
      return '<div class="tutorial-arrow" style="position:absolute;right:-' + (size - 1) + 'px;top:' + pct + '%;margin-top:-' + size + 'px;width:0;height:0;border-top:' + size + 'px solid transparent;border-bottom:' + size + 'px solid transparent;border-left:' + size + 'px solid ' + color + ';filter:drop-shadow(1px 0 1px rgba(0,0,0,0.1));"></div>';
    }
    return '';
  },

  positionCard(card, targetRect, opts) {
    opts = opts || {};
    var gap = opts.gap !== undefined ? opts.gap : 16;
    var preferRight = opts.preferRight || false;
    var preferLeft = opts.preferLeft || false;
    var preferBelow = opts.preferBelow !== false;
    var align = opts.align || 'center';
    var cardW = card.offsetWidth || 420;
    var cardH = card.offsetHeight || 380;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var top, left, arrowDir, arrowPct = 50;

    function calcVertCenter(targetRect, cardH, align) {
      if (align === 'top') return targetRect.top - (cardH / 2);
      if (align === 'bottom') return targetRect.bottom - (cardH / 2);
      return targetRect.top + (targetRect.height / 2) - (cardH / 2);
    }

    function defaultPosition() {
      var belowSpace = vh - (targetRect.bottom + gap + cardH);
      var aboveSpace = targetRect.top - gap - cardH;
      if (preferBelow) {
        if (belowSpace >= 0 || belowSpace > aboveSpace) {
          top = targetRect.bottom + gap; arrowDir = 'top';
        } else {
          top = targetRect.top - gap - cardH; arrowDir = 'bottom';
        }
      } else {
        if (aboveSpace >= 0 || aboveSpace > belowSpace) {
          top = targetRect.top - gap - cardH; arrowDir = 'bottom';
        } else {
          top = targetRect.bottom + gap; arrowDir = 'top';
        }
      }
      var idealLeft = targetRect.left + (targetRect.width / 2) - (cardW / 2);
      left = Math.max(12, Math.min(idealLeft, vw - cardW - 12));
      top = Math.max(4, Math.min(top, vh - cardH - 4));
    }

    if (preferRight) {
      left = targetRect.right + gap;
      top = calcVertCenter(targetRect, cardH, align);
      if (left + cardW > vw + 200) {
        defaultPosition();
      } else {
        if (left + cardW + 12 > vw) left = vw - cardW - 12;
        left = Math.max(12, left);
        top = Math.max(4, Math.min(top, vh - cardH - 4));
        var targetCenterY = targetRect.top + (targetRect.height / 2);
        arrowPct = ((targetCenterY - top) / cardH) * 100;
        arrowPct = Math.max(8, Math.min(arrowPct, 92));
        arrowDir = 'left';
      }
    } else if (preferLeft) {
      left = targetRect.left - gap - cardW;
      top = calcVertCenter(targetRect, cardH, align);
      if (left < -200) {
        defaultPosition();
      } else {
        top = Math.max(4, Math.min(top, vh - cardH - 4));
        var targetCenterY = targetRect.top + (targetRect.height / 2);
        arrowPct = ((targetCenterY - top) / cardH) * 100;
        arrowPct = Math.max(8, Math.min(arrowPct, 92));
        arrowDir = 'right';
      }
    } else {
      defaultPosition();
    }

    card.style.top = Math.max(4, top) + 'px';
    card.style.left = left + 'px';

    return { dir: arrowDir, pct: Math.round(arrowPct) };
  },

  render() {
    var self = this;
    var existing = document.getElementById('tutorial-overlay');
    if (existing) existing.remove();

    var existingCard = document.querySelector('.tutorial-card');
    if (existingCard && existingCard.parentNode) existingCard.parentNode.remove();

    this._cleanupHighlight();

    var overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99998;';

    var page = this.pages[this.currentPage];

    if (page.target) {
      var targetEl = document.querySelector(page.target);
      if (targetEl) {
        var rect = targetEl.getBoundingClientRect();

        // Spotlight cutout via box-shadow
        var spotlight = document.createElement('div');
        spotlight.style.cssText = 'position:fixed;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);border-radius:8px;z-index:1;pointer-events:none;animation:fadeIn 0.3s ease;';
        overlay.appendChild(spotlight);

        // Highlight ring on target
        this._applyHighlight(targetEl);
      }
    } else {
      // Centered overlay background for non-targeted pages
      var bg = document.createElement('div');
      bg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);z-index:1;cursor:pointer;';
      bg.addEventListener('click', function(e) {
        if (e.target === bg) self.skip();
      });
      overlay.appendChild(bg);
    }

    document.body.appendChild(overlay);

    // Build card
    var cardWrapper = document.createElement('div');
    cardWrapper.style.cssText = 'position:fixed;z-index:99999;pointer-events:auto;';
    cardWrapper.innerHTML = this.getCardHtml();

    // Append to DOM first so offsetHeight/offsetWidth are accurate
    cardWrapper.style.visibility = 'hidden';
    document.body.appendChild(cardWrapper);

    if (page.target) {
      var targetEl = document.querySelector(page.target);
      if (targetEl) {
        var rect = targetEl.getBoundingClientRect();
        var pos = this.positionCard(cardWrapper, rect, { gap: page.gap, preferRight: page.preferRight, preferLeft: page.preferLeft, align: page.align });
        var arrow = this.getArrowHtml(pos.dir, pos.pct);
        cardWrapper.insertAdjacentHTML('afterbegin', arrow);
      } else {
        cardWrapper.style.top = '50%';
        cardWrapper.style.left = '50%';
        cardWrapper.style.transform = 'translate(-50%, -50%)';
      }
    } else {
      cardWrapper.style.top = '50%';
      cardWrapper.style.left = '50%';
      cardWrapper.style.transform = 'translate(-50%, -50%)';
    }

    cardWrapper.style.visibility = 'visible';

    if (window.lucide) {
      window.lucide.createIcons({ root: overlay });
      window.lucide.createIcons({ root: cardWrapper });
    }

    this.attachEvents(overlay, cardWrapper);

    if (page.onEnter) page.onEnter.call(this);
  },

  _applyHighlight(el) {
    this._highlightedEl = el;
    this._origStyles = {
      outline: el.style.outline,
      outlineOffset: el.style.outlineOffset,
      borderRadius: el.style.borderRadius,
      position: el.style.position,
      zIndex: el.style.zIndex
    };
    el.style.outline = '2px solid var(--accent-primary)';
    el.style.outlineOffset = '3px';
    el.style.borderRadius = '8px';
    el.style.position = 'relative';
    el.style.zIndex = '99999';
  },

  _cleanupHighlight() {
    if (this._highlightedEl) {
      var el = this._highlightedEl;
      el.style.outline = this._origStyles.outline || '';
      el.style.outlineOffset = this._origStyles.outlineOffset || '';
      el.style.borderRadius = this._origStyles.borderRadius || '';
      el.style.position = this._origStyles.position || '';
      el.style.zIndex = this._origStyles.zIndex || '';
      this._highlightedEl = null;
      this._origStyles = {};
    }
  },

  _updateTarget(selector, opts) {
    opts = opts || {};
    var el = document.querySelector(selector);
    if (!el) return;

    var overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;

    overlay.innerHTML = '';
    this._cleanupHighlight();

    var rect = el.getBoundingClientRect();
    var spotlight = document.createElement('div');
    spotlight.style.cssText = 'position:fixed;top:' + rect.top + 'px;left:' + rect.left + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55);border-radius:8px;z-index:1;pointer-events:none;';
    overlay.appendChild(spotlight);

    this._applyHighlight(el);

    var cardEl = document.querySelector('.tutorial-card');
    if (!cardEl) return;
    var cardWrapper = cardEl.parentNode;
    cardWrapper.style.transform = 'none';

    var oldArrow = cardWrapper.querySelector('.tutorial-arrow');
    if (oldArrow) oldArrow.remove();

    var pos = this.positionCard(cardWrapper, rect, opts);
    var arrow = this.getArrowHtml(pos.dir, pos.pct);
    cardWrapper.insertAdjacentHTML('afterbegin', arrow);
  },

  attachEvents(overlay, cardWrapper) {
    var self = this;

    var skipBtn = cardWrapper.querySelector('.tutorial-btn-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', function(e) { e.stopPropagation(); self.skip(); });
    }

    var backBtn = cardWrapper.querySelector('.tutorial-btn-back');
    if (backBtn) {
      backBtn.addEventListener('click', function(e) { e.stopPropagation(); self.prev(); });
    }

    var nextBtn = cardWrapper.querySelector('.tutorial-btn-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', function(e) { e.stopPropagation(); self.next(); });
    }

    var finishBtn = cardWrapper.querySelector('.tutorial-btn-finish');
    if (finishBtn) {
      finishBtn.addEventListener('click', function(e) { e.stopPropagation(); self.finish(); });
    }

    // Keyboard navigation (only when tutorial is the top overlay)
    document.addEventListener('keydown', this._keyHandler = function(e) {
      if (!document.getElementById('tutorial-overlay')) {
        document.removeEventListener('keydown', self._keyHandler);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); self.skip(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); self.next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.prev(); }
    });
  },

  next() {
    if (this.currentPage < this.pages.length - 1) {
      var oldPage = this.pages[this.currentPage];
      if (oldPage.onLeave) oldPage.onLeave.call(this);
      this.currentPage++;
      this.render();
    }
  },

  prev() {
    if (this.currentPage > 0) {
      var oldPage = this.pages[this.currentPage];
      if (oldPage.onLeave) oldPage.onLeave.call(this);
      this.currentPage--;
      this.render();
    }
  },

  skip() {
    this.close();
    var settings = window.store.getState().settings;
    var newSettings = { ...settings, tutorialSkipped: true };
    window.store.setState({ settings: newSettings });
    window.Storage.set('settings', newSettings);
  },

  finish() {
    this.close();
    var settings = window.store.getState().settings;
    var newSettings = { ...settings, tutorialCompleted: true, tutorialSkipped: false };
    window.store.setState({ settings: newSettings });
    window.Storage.set('settings', newSettings);
  },

  close() {
    var page = this.pages[this.currentPage];
    if (page && page.onLeave) page.onLeave.call(this);
    this._cleanupHighlight();
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    var overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.remove();
    var card = document.querySelector('.tutorial-card');
    if (card && card.parentNode) card.parentNode.remove();
    this.isOpen = false;
  },

  shouldShowOnStartup() {
    var s = window.store.getState().settings;
    if (s.showTutorialOnStartup === false) return false;
    if (s.tutorialCompleted) return false;
    if (s.tutorialSkipped) return false;
    return true;
  }
};

document.addEventListener('DOMContentLoaded', function() {
  window.TutorialModal.init();
});
