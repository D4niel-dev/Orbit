// desktop/src/js/components/pinned-modal.js
//
// "Show all pinned messages", with reordering.
//
// The rules live in shared/utils/pinned.js — the limit, the pruning, the wording of the
// change note — so this file is only the interface: a list you can move rows around in,
// and a Save that hands the order to the store. The store is what actually persists it
// and announces the change.
//
// The reorder happens on a WORKING COPY. Nothing is committed until Save, so closing the
// dialog is a real cancel rather than a trail of half-applied moves.
window.PinnedModal = {
  _overlay: null,

  show(chatId) {
    var store = window.store;
    var P = window.OrbitPinned;
    if (!store || !P) return;
    this.close();

    var isGroup = store._isGroupChat(chatId);
    var limit = P.limitFor(isGroup);
    var working = store.getPinnedMessages(chatId).map(function (p) { return { msgId: p.msgId, text: p.text || '(attachment)' }; });

    var overlay = document.createElement('div');
    overlay.id = 'pinned-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.6);' +
      'display:flex;align-items:center;justify-content:center;';

    var modal = document.createElement('div');
    modal.style.cssText = 'width:420px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;' +
      'background:var(--bg-surface);border:1px solid var(--border-strong);border-radius:var(--radius-lg);overflow:hidden;' +
      'box-shadow:var(--shadow-xl);';

    modal.innerHTML =
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:8px;">' +
        '<i data-lucide="pin" style="width:16px;height:16px;color:var(--accent-primary);"></i>' +
        '<span style="font-weight:600;font-size:14px;color:var(--text-primary);">Pinned messages</span>' +
        '<span id="pinned-modal-count" style="margin-left:auto;font-size:11px;color:var(--text-muted);"></span>' +
      '</div>' +
      '<div id="pinned-modal-list" style="padding:8px;overflow-y:auto;flex:1;"></div>' +
      '<div style="padding:12px 16px;border-top:1px solid var(--border-subtle);display:flex;align-items:center;gap:8px;">' +
        '<span style="font-size:11px;color:var(--text-muted);flex:1;">Use the arrows to reorder.</span>' +
        '<button id="pinned-modal-cancel" style="padding:7px 14px;border-radius:8px;background:transparent;' +
          'border:1px solid var(--border-subtle);color:var(--text-secondary);font-size:13px;cursor:pointer;">Cancel</button>' +
        '<button id="pinned-modal-save" style="padding:7px 14px;border-radius:8px;background:var(--accent-primary);' +
          'border:none;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save order</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this._overlay = overlay;

    var listEl = modal.querySelector('#pinned-modal-list');
    var countEl = modal.querySelector('#pinned-modal-count');
    var esc = window.Sanitize.escapeHtml;

    var paint = () => {
      countEl.textContent = working.length + ' of ' + limit + ' pinned';
      if (!working.length) {
        listEl.innerHTML = '<div style="padding:24px;text-align:center;font-size:13px;color:var(--text-muted);">' +
          'Nothing is pinned in this chat yet.</div>';
        return;
      }
      var html = '';
      working.forEach(function (row, i) {
        html += '<div class="pinned-modal-row" data-index="' + i + '" style="display:flex;align-items:center;gap:8px;' +
            'padding:8px 10px;border-radius:10px;background:var(--bg-base);margin-bottom:6px;">' +
          '<span style="flex:1;min-width:0;font-size:12px;color:var(--text-secondary);' +
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(row.text) + '</span>' +
          '<button class="pinned-modal-up" data-index="' + i + '"' + (i === 0 ? ' disabled' : '') +
            ' style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-subtle);background:transparent;' +
            'color:var(--text-secondary);cursor:pointer;font-size:12px;line-height:1;' + (i === 0 ? 'opacity:0.35;' : '') + '">&uarr;</button>' +
          '<button class="pinned-modal-down" data-index="' + i + '"' + (i === working.length - 1 ? ' disabled' : '') +
            ' style="width:26px;height:26px;border-radius:7px;border:1px solid var(--border-subtle);background:transparent;' +
            'color:var(--text-secondary);cursor:pointer;font-size:12px;line-height:1;' +
            (i === working.length - 1 ? 'opacity:0.35;' : '') + '">&darr;</button>' +
        '</div>';
      });
      listEl.innerHTML = html;
    };
    paint();

    var move = (from, to) => {
      if (to < 0 || to >= working.length) return;
      var row = working.splice(from, 1)[0];
      working.splice(to, 0, row);
      paint();
    };

    listEl.addEventListener('click', (e) => {
      var up = e.target.closest('.pinned-modal-up');
      var down = e.target.closest('.pinned-modal-down');
      if (up) move(parseInt(up.getAttribute('data-index'), 10), parseInt(up.getAttribute('data-index'), 10) - 1);
      else if (down) move(parseInt(down.getAttribute('data-index'), 10), parseInt(down.getAttribute('data-index'), 10) + 1);
    });

    modal.querySelector('#pinned-modal-cancel').addEventListener('click', () => this.close());
    modal.querySelector('#pinned-modal-save').addEventListener('click', () => {
      // The store decides whether this was a real change, and announces it if so.
      store.reorderPinned(chatId, working.map(function (r) { return r.msgId; }));
      this.close();
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

    if (window.lucide) { try { window.lucide.createIcons({ root: modal }); } catch (e) { /* non-fatal */ } }
  },

  close() {
    if (this._overlay && this._overlay.parentNode) this._overlay.parentNode.removeChild(this._overlay);
    this._overlay = null;
  }
};

// A floating panel at the cursor: the pinned messages, right where the mouse is.
//
// Dan asked for this alongside the bar in the panel — "a floating panel where my mouse
// is, you can keep the current one, just add the one that I asked". It uses the app's
// existing ContextMenu, which is what every other right-click in the app uses, so it
// positions, styles and dismisses exactly like the rest of them.
window.PinnedMenu = {
  showAt(x, y, chatId) {
    var store = window.store;
    var P = window.OrbitPinned;
    if (!store || !window.ContextMenu) return;
    var pinned = store.getPinnedMessages(chatId);
    var items = [];

    if (!pinned.length) {
      items.push({ label: 'Nothing pinned here yet', icon: 'pin', color: 'var(--text-muted)', onClick: function () {} });
      window.ContextMenu.show(x, y, items);
      return;
    }

    // One row per pin, in the order they are pinned — the order the list shows, so the
    // two never disagree about which is first.
    pinned.forEach(function (p, i) {
      var label = String(p.text || '(attachment)').replace(/\s+/g, ' ').trim();
      if (label.length > 42) label = label.slice(0, 41) + '\u2026';
      items.push({
        label: (i + 1) + '. ' + label,
        icon: 'pin',
        onClick: function () { window.PinnedMenu.jumpTo(chatId, p.msgId); }
      });
    });

    items.push('separator');
    items.push({
      label: 'Reorder\u2026',
      icon: 'arrow-up-down',
      onClick: function () { window.PinnedModal.show(chatId); }
    });
    items.push({
      label: 'Unpin all',
      icon: 'pin-off',
      color: 'var(--accent-danger)',
      onClick: function () {
        // Through the store's own unpin so the peers hear about it, rather than editing
        // the list here.
        store.getPinnedMessages(chatId).forEach(function (p) {
          if (store.sendUnpinMessage) store.sendUnpinMessage(chatId, p.msgId);
          else store.unpinMessage(chatId, p.msgId);
        });
      }
    });

    window.ContextMenu.show(x, y, items);
  },

  // Scroll the chat to a pinned message, loading the chat first if it is not in the DOM.
  jumpTo(chatId, msgId) {
    var id = String(msgId);
    var find = function () { return document.querySelector('[data-msg-id="' + id + '"].message-row'); };
    var el = find();
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
    if (window.store && window.store.loadFullChatMessages) {
      window.store.loadFullChatMessages(chatId);
      setTimeout(function () {
        var again = find();
        if (again) again.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 250);
    }
    return false;
  }
};
