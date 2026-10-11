/* ═══════════════════════════════════════════════════════════════════════════
   Orbit — motion layer (behaviour)
   ═══════════════════════════════════════════════════════════════════════════

   Pairs with motion.css. Everything here is progressive: if it fails, the page
   is still readable and every element is still in place — the CSS only ever
   moves things that JS has already marked as ready.

   ⚠ The one rule this file follows everywhere: read layout once, then write only
   transforms. Scroll handlers that call getBoundingClientRect() per frame are how
   a long page starts stuttering, so positions are cached and refreshed on resize.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Icons ───────────────────────────────────────────────────────────────
     Inline rather than a library: this page ships no JS dependencies, and six
     icons are not worth becoming one. */
  var I = {
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    wifiOff: '<path d="M1 1l22 22"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>'
  };
  function icon(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + (I[name] || '') + '</svg>';
  }

  /* ── 1. The hero headline, split into masked words ─────────────────────── */
  function splitHeadline() {
    var h1 = document.querySelector('.hero h1');
    if (!h1 || h1.dataset.split === '1') return;
    h1.dataset.split = '1';
    var n = 0;
    Array.prototype.forEach.call(h1.querySelectorAll('.hero-line'), function (line) {
      var words = line.textContent.trim().split(/\s+/);
      line.textContent = '';
      words.forEach(function (w, i) {
        var box = document.createElement('span');
        box.className = 'kw';
        var inner = document.createElement('i');
        inner.textContent = w;
        // Delay follows reading order across BOTH lines, so the second line does
        // not restart the stagger.
        box.style.setProperty('--kw-delay', (0.12 + n * 0.075).toFixed(3) + 's');
        n++;
        box.appendChild(inner);
        line.appendChild(box);
        if (i < words.length - 1) line.appendChild(document.createTextNode(' '));
      });
    });
  }

  /* ── 2. Section headings ──────────────────────────────────────────────────
     The same mask as the hero, on every h2 on the page. Written as a node walk
     rather than a textContent split because the Features heading contains a
     <br>, and splitting its text would silently flatten it onto one line.

     ⚠ `is-ready` is added when the heading scrolls into view, not at boot: the
     page is ~11,000px tall, so a heading masked at boot would have finished its
     reveal long before anyone reached it. The hero is the exception — it is on
     screen immediately. */
  function maskHeadings() {
    Array.prototype.forEach.call(document.querySelectorAll('.section-header h2'), function (h2) {
      if (h2.dataset.masked === '1') return;
      h2.dataset.masked = '1';
      var n = 0;
      var frag = document.createDocumentFragment();
      Array.prototype.slice.call(h2.childNodes).forEach(function (node) {
        // A <br> is structure, not content — keep it as it is.
        if (node.nodeType === 1 && node.tagName === 'BR') {
          frag.appendChild(document.createElement('br'));
          return;
        }
        node.textContent.split(/(\s+)/).forEach(function (piece) {
          if (!piece) return;
          if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(piece)); return; }
          var box = document.createElement('span');
          box.className = 'kw';
          var inner = document.createElement('i');
          inner.textContent = piece;
          box.style.setProperty('--kw-delay', (n * 0.055).toFixed(3) + 's');
          n++;
          box.appendChild(inner);
          frag.appendChild(box);
        });
      });
      h2.textContent = '';
      h2.appendChild(frag);
    });
  }

  function revealHeadings() {
    var heads = document.querySelectorAll('.section-header h2[data-masked="1"]');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(heads, function (h) { h.classList.add('is-ready'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-ready');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.2 });
    Array.prototype.forEach.call(heads, function (h) { io.observe(h); });
  }

  /* ── 3. The gradient line ─────────────────────────────────────────────────
     ⚠⚠ A CHROMIUM PAINT BUG, NOT A STYLE CHOICE. MEASURED, NOT GUESSED.

     `.hero-copy h1 .grad` paints its text with `background-clip: text` and a
     transparent fill. The moment that line's words are wrapped in
     `display: inline-block` masks, Chromium paints EVERY child's text at the
     PARENT's origin. The layout stays correct — the three word boxes measured
     416 / 512 / 757 — but the glyphs all land on top of each other, so the line
     rendered as "NInternet".

     Two screenshots pinned it down: with the mask removed it was still broken,
     and with the gradient removed the identical markup rendered perfectly.

     The fix is to move the gradient off the parent and onto the words, giving
     each one the slice of it that belongs at its own offset: background-size is
     the width of the whole line, background-position is minus the word's x. The
     line still reads as one continuous gradient, with no parent left to mis-paint.
     Re-fitted on resize and once webfonts land, because both change the widths. */
  function fitGradients() {
    Array.prototype.forEach.call(document.querySelectorAll('.hero h1 .hero-line'), function (line) {
      var words = line.querySelectorAll('.kw > i');
      if (!words.length) return;

      var cs = getComputedStyle(line);
      var grad = cs.backgroundImage;
      var lineBox = line.getBoundingClientRect();
      // The parent keeps no gradient of its own any more. Read before clearing.
      line.style.backgroundImage = 'none';
      line.style.webkitTextFillColor = 'currentColor';

      if (!grad || grad === 'none' || !lineBox.width) return;

      Array.prototype.forEach.call(words, function (w) {
        var box = w.parentNode.getBoundingClientRect();
        w.style.backgroundImage = grad;
        w.style.backgroundRepeat = 'no-repeat';
        w.style.backgroundSize = lineBox.width + 'px 100%';
        w.style.backgroundPosition = (-(box.left - lineBox.left)).toFixed(1) + 'px 0';
        w.style.webkitBackgroundClip = 'text';
        w.style.backgroundClip = 'text';
        w.style.webkitTextFillColor = 'transparent';
      });
    });
  }

  /* ── 4. CTA arrows ─────────────────────────────────────────────────────── */
  function addArrows() {
    Array.prototype.forEach.call(document.querySelectorAll('.hero-cta-row .btn'), function (btn) {
      if (btn.querySelector('.btn-arrow')) return;
      // The primary button already carries a download glyph; the circle replaces
      // it rather than sitting beside it.
      var old = btn.querySelector('svg');
      if (old) old.remove();
      var span = document.createElement('span');
      span.className = 'btn-arrow';
      span.innerHTML = icon('arrow', 14);
      btn.appendChild(span);
    });
  }

  /* ── 5. The marquee cards ─────────────────────────────────────────────────
     Real interface fragments. Each builder returns markup, and the column is
     filled with them twice so the -50% loop is seamless. */
  function card(inner) { return '<div class="mq-card">' + inner + '</div>'; }

  var CARDS = [
    function () {
      return card(
        '<div class="mq-head"><div class="mq-avatar">MN</div>' +
          '<div><div class="mq-name">Mai Nguyen</div><div class="mq-meta">on your LAN</div></div></div>' +
        '<div class="mq-bubble">Saturday works for me — the gallery rebuild is on main.</div>'
      );
    },
    function () {
      return card(
        '<div class="mq-row"><div class="mq-icon">' + icon('file', 15) + '</div>' +
          '<div><div class="mq-name">design-system.fig</div>' +
          '<div class="mq-meta">12.4 MB · direct, peer to peer</div></div></div>' +
        '<div class="mq-bar"><i></i></div>'
      );
    },
    function () {
      return card(
        '<div class="mq-pill ok">' + icon('lock', 12) + ' End-to-end encrypted</div>' +
        '<div class="mq-body" style="margin-top:10px;">Keys are generated on the device and ' +
          '<strong>never leave it</strong>. There is no server to hold them.</div>'
      );
    },
    function () {
      return card(
        '<div class="mq-row"><div class="mq-icon">' + icon('phone', 15) + '</div>' +
          '<div><div class="mq-name">Voice call</div><div class="mq-meta">4:12 · 38 ms round trip</div></div></div>' +
        '<div class="mq-reactions"><span class="mq-reaction">Clear as day</span></div>'
      );
    },
    function () {
      return card(
        '<div class="mq-pill">' + icon('wifiOff', 12) + ' No internet required</div>' +
        '<div class="mq-body" style="margin-top:10px;">Orbit finds the other device on the ' +
          '<strong>network you are already on</strong>. Router down, still works.</div>'
      );
    },
    function () {
      return card(
        '<div class="mq-head"><div class="mq-avatar">' + icon('users', 13) + '</div>' +
          '<div><div class="mq-name">Orbit Team</div><div class="mq-meta">4 members</div></div></div>' +
        '<div class="mq-bubble">Deploy is green. Rolling the vault change out tonight.</div>' +
        '<div class="mq-reactions"><span class="mq-reaction">🎉 3</span><span class="mq-reaction">👍 2</span></div>'
      );
    },
    function () {
      return card(
        '<div class="mq-pill ok">' + icon('check', 12) + ' Sent over the local network</div>' +
        '<div class="mq-body" style="margin-top:10px;">Nothing was uploaded. The file went ' +
          '<strong>straight to the other device</strong>.</div>'
      );
    },
    function () {
      return card(
        '<div class="mq-row"><div class="mq-icon">' + icon('zap', 15) + '</div>' +
          '<div><div class="mq-name">Connected in 240 ms</div>' +
          '<div class="mq-meta">no account, no sign-in</div></div></div>'
      );
    },
    function () {
      return card(
        '<div class="mq-bubble mine">shipping the mobile attach sheet tonight</div>' +
        '<div class="mq-bubble" style="margin-top:8px;">send it over, I will take a look</div>'
      );
    }
  ];

  function buildMarquee() {
    Array.prototype.forEach.call(document.querySelectorAll('.marquee-track'), function (track) {
      if (track.dataset.built === '1') return;
      track.dataset.built = '1';
      // A different slice per column, so the three do not read as one repeating
      // pattern marching past.
      var offset = parseInt(track.getAttribute('data-offset') || '0', 10);
      var html = '';
      for (var i = 0; i < CARDS.length; i++) {
        html += CARDS[(i + offset) % CARDS.length]();
      }
      // ⚠ Twice, and the animation moves exactly -50%. That is what makes the
      // loop seamless: the second copy lands where the first one started.
      track.innerHTML = html + html;
    });
  }

  /* ── 6. Statement sections: word-by-word ───────────────────────────────── */
  function splitStatement() {
    Array.prototype.forEach.call(document.querySelectorAll('.statement p'), function (p) {
      if (p.dataset.split === '1') return;
      p.dataset.split = '1';
      var frag = document.createDocumentFragment();
      var n = 0;
      // Walk the child nodes so an existing <span class="hl"> keeps its styling
      // and only its words get wrapped.
      Array.prototype.forEach.call(Array.prototype.slice.call(p.childNodes), function (node) {
        var hl = node.nodeType === 1 && node.classList.contains('hl');
        var text = node.textContent;
        text.split(/(\s+)/).forEach(function (piece) {
          if (!piece) return;
          if (/^\s+$/.test(piece)) { frag.appendChild(document.createTextNode(piece)); return; }
          var s = document.createElement('span');
          s.className = 'sw' + (hl ? ' hl' : '');
          s.style.setProperty('--sw-delay', (n * 0.035).toFixed(3) + 's');
          n++;
          s.textContent = piece;
          frag.appendChild(s);
        });
      });
      p.textContent = '';
      p.appendChild(frag);
    });
  }

  /* ── 7. Reveals ─────────────────────────────────────────────────────────── */
  function wireReveals() {
    var targets = document.querySelectorAll('.reveal, .statement');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        // One-shot: re-animating on the way back up makes a long page feel
        // restless, and the reader has already seen it.
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
    Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
  }

  /* ── 8. Kinetic dividers: horizontal drift tied to scroll ───────────────── */
  var kineticEls = [];
  function cacheKinetic() {
    kineticEls = [];
    Array.prototype.forEach.call(document.querySelectorAll('.kinetic'), function (el) {
      var track = el.querySelector('.kinetic-track');
      if (track) kineticEls.push({ el: el, track: track, top: 0, h: 0 });
    });
    refreshKinetic();
  }
  function refreshKinetic() {
    kineticEls.forEach(function (k) {
      var r = k.el.getBoundingClientRect();
      k.top = r.top + window.scrollY;
      k.h = r.height;
    });
  }

  /* ── 9. Parallax targets ────────────────────────────────────────────────── */
  var parallaxEls = [];
  function cacheParallax() {
    parallaxEls = [];
    Array.prototype.forEach.call(document.querySelectorAll('[data-parallax]'), function (el) {
      var r = el.getBoundingClientRect();
      parallaxEls.push({
        el: el,
        strength: parseFloat(el.getAttribute('data-parallax')) || 0.08,
        top: r.top + window.scrollY,
        h: r.height
      });
    });
  }

  /* ── 10. One scroll handler for everything ────────────────────────────────
     ⚠ One rAF-throttled listener, not one per effect. Three listeners each
     reading rects on every scroll event is the usual way this gets slow. */
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.scrollY;
      var vh = window.innerHeight;

      if (!reduced) {
        kineticEls.forEach(function (k) {
          // -1 when the band is a screen below, +1 when it is a screen above.
          var progress = ((y + vh) - k.top) / (vh + k.h);
          var shift = (progress - 0.5) * 2;
          k.track.style.transform = 'translateX(' + (shift * -14).toFixed(2) + '%)';
        });
        parallaxEls.forEach(function (p) {
          var centre = p.top + p.h / 2;
          var delta = (y + vh / 2) - centre;
          p.el.style.transform = 'translateY(' + (delta * p.strength).toFixed(2) + 'px)';
        });
      }
    });
  }

  /* ── 11. Magnetic buttons ────────────────────────────────────────────────── */
  function wireMagnetic() {
    if (reduced) return;
    if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    Array.prototype.forEach.call(document.querySelectorAll('.hero-cta-row .btn'), function (btn) {
      btn.classList.add('is-magnetic');
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        var dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        // A small pull, not a follow: the button should feel aware of the
        // pointer, not chase it.
        btn.style.transform = 'translate(' + (dx * 7).toFixed(2) + 'px,' + (dy * 5).toFixed(2) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ── 12. The icon rail ────────────────────────────────────────────────────
     Each button scrolls to the section that argues for it, and takes the
     highlight so the rail doubles as a progress indicator for the page. */
  function wireIconRail() {
    var rail = document.querySelector('.icon-rail');
    if (!rail) return;
    var buttons = Array.prototype.slice.call(rail.querySelectorAll('button'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.querySelector(btn.getAttribute('data-scroll-to') || '');
        buttons.forEach(function (b) { b.classList.toggle('on', b === btn); });
        if (target) {
          target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        }
      });
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */
  function boot() {
    splitHeadline();
    maskHeadings();
    fitGradients();
    addArrows();
    buildMarquee();
    splitStatement();
    wireReveals();
    revealHeadings();
    wireMagnetic();
    wireIconRail();
    cacheKinetic();
    cacheParallax();
    // ⚠ The gradient slices are measured in pixels, so they have to be re-fitted
    // once the webfonts arrive — before that the words are laid out in the
    // fallback face at different widths and every offset is wrong.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { fitGradients(); }).catch(function () {});
    }
    // The headline mask needs one frame in the "ready" state to be off-screen
    // before the transition runs, or the words are simply already there.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var hero = document.querySelector('.hero');
        if (hero) hero.classList.add('is-ready');
      });
    });
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () {
    // The gradient slices are pixel offsets against the line width, so a resize
    // invalidates every one of them.
    fitGradients();
    cacheKinetic();
    cacheParallax();
    onScroll();
  });
})();
