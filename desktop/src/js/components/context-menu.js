// src/js/components/context-menu.js

window.ContextMenu = {
  init() {
    this.container = document.createElement('div');
    this.container.id = 'context-menu-container';
    // ⚠ The chrome is `.context-menu*` classes in styles/redesign.css now. Only the
    // POSITION stays inline, because it is computed per invocation.
    document.body.appendChild(this.container);

    var self = this;
    document.addEventListener('click', function() {
      if (self.container.style.display !== 'none') self.close();
    });
    // ⚠ Escape closes it, which it never did. A menu you can only dismiss by clicking
    // is a menu that fights the keyboard — and it is the first thing anyone tries.
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && self.container.style.display !== 'none') self.close();
    });

    // Prevent hiding if clicking inside (handled by click listeners mostly)
    this.container.addEventListener('click', function(e) {
      e.stopPropagation();
    });
  },

  show(x, y, items) {
    if (!this.container) return;
    var self = this;

    this.container.innerHTML = '';
    items.forEach(function(item) {
      if (item === 'separator') {
        var sep = document.createElement('div');
        // ⚠ A class, not `height:1px;background:…` written inline — an inline-styled
        // element is invisible to every stylesheet, so the separator could never be
        // themed and never matched the `.context-menu-item` rule §9 of the layer
        // thought it had written.
        sep.className = 'context-menu-sep';
        self.container.appendChild(sep);
      } else {
        var btn = document.createElement('button');
        btn.className = 'context-item';
        // ⚠ The only inline left, and the only one that is genuinely dynamic:
        // destructive items are handed a danger colour by their caller.
        if (item.color) btn.style.color = item.color;
        if (item.icon) {
          var icon = document.createElement('i');
          icon.setAttribute('data-lucide', item.icon);
          btn.appendChild(icon);
        }
        btn.appendChild(document.createTextNode(item.label));
        // ⚠ The `mouseover`/`mouseout` handlers are gone. The layer's `:hover` does
        // this now, and two writers for one state is how a hover ends up stuck on the
        // last item you touched.
        btn.addEventListener('click', function() {
          if (item.onClick) item.onClick();
          self.close();
        });
        self.container.appendChild(btn);
      }
    });

    lucide.createIcons({ root: this.container });

    // Ensure it doesn't go off screen
    this.container.style.display = 'flex';
    var rect = this.container.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 10;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 10;

    this.container.style.left = x + 'px';
    this.container.style.top = y + 'px';

    // ⚠⚠ THERE IS NO AUTO-DISMISS ANY MORE, AND REMOVING IT IS THE POINT OF THIS FILE.
    // It closed itself after 1.5 SECONDS — "so cursor doesn't block buttons" — and the
    // message menu pushes six or more items, so you had a second and a half to read the
    // list and hit one. Measured in the running app before the fix: visible at 600ms,
    // GONE BY 1200ms.
    //
    // ⚠ It was never needed. All seven call sites are click-driven — a `contextmenu`
    // event or a button click, never a hover — and a click anywhere outside already
    // closes it through the document listener above. Nothing could be blocked.
  },

  close() {
    if (this.container) this.container.style.display = 'none';
  }
};
