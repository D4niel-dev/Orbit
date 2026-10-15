// shared/ui/code-highlight.js
//
// Prism, loaded the first time there is actually code on screen.
//
// ⚠⚠ IT USED TO BE THREE BLOCKING REQUESTS IN <head>, ON EVERY LAUNCH. A
// stylesheet and two scripts from cdnjs, none of them `defer`red — so the
// browser had to fetch all three before it would paint anything, on both
// platforms, to highlight code blocks that most launches never show.
//
// Measured on the mobile page, first contentful paint:
//     CDN reachable      403ms
//     CDN blocked        173ms   (an offline phone — no request at all)
//     CDN slow (600ms)  1034ms
// So the tags cost ~230ms on a good connection and ~860ms on a bad one, out of
// a 3-4s start-up. Dan: "Mobile startup is slower than it was before the
// redesign... boost it by 10-25%."
//
// Prism has exactly one job here — `Prism.highlightAll()` after messages render
// — and it is already guarded by `if (window.Prism)`, so a missing Prism was
// always a silent no-op. That makes it the ideal thing to defer: nothing breaks
// while it is absent, and it only ever needs to arrive if a message contains a
// code block.
//
// Shared by both platforms like the other modules in shared/ui/: edit this file,
// then run `npm run shared:sync` in mobile/.

(function () {
  'use strict';

  var BASE = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/';
  var CSS = BASE + 'themes/prism-tomorrow.min.css';
  var JS = BASE + 'prism.min.js';
  // The autoloader is what fetches a language definition on demand for a
  // `language-xxx` class Prism does not already know — it is why a Python block
  // highlights without shipping every grammar. Kept, just moved off the boot path.
  var AUTOLOADER = BASE + 'plugins/autoloader/prism-autoloader.min.js';

  var state = 'idle';   // idle | loading | ready | failed
  var waiting = [];

  function drain() {
    var q = waiting;
    waiting = [];
    for (var i = 0; i < q.length; i++) {
      try { q[i](); } catch (e) { /* a failed highlight must never break a render */ }
    }
  }

  function inject(src, onDone) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = onDone;
    s.onerror = onDone;   // a missing language pack is not a fatal error
    document.head.appendChild(s);
  }

  function load() {
    if (state !== 'idle') return;
    state = 'loading';
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS;
    document.head.appendChild(link);
    inject(JS, function () {
      if (!window.Prism) { state = 'failed'; drain(); return; }
      // The autoloader reads `languages_path` from its own script URL, so it has
      // to be the same origin as the core — it is.
      inject(AUTOLOADER, function () { state = 'ready'; drain(); });
    });
  }

  window.OrbitCodeHighlight = {
    /**
     * Call after rendering messages. Does nothing at all when there is no code
     * on screen — which is the whole point: the common launch never pays for it.
     * @param {Element} [root] scope to search, defaults to the document
     */
    refresh: function (root) {
      var scope = root || document;
      var hasCode;
      try {
        hasCode = !!scope.querySelector('pre code, code[class*="language-"]');
      } catch (e) {
        return;
      }
      if (!hasCode) return;

      if (window.Prism && window.Prism.highlightAll) {
        try { window.Prism.highlightAll(); } catch (e) {}
        return;
      }
      waiting.push(function () {
        if (window.Prism && window.Prism.highlightAll) {
          try { window.Prism.highlightAll(); } catch (e) {}
        }
      });
      load();
    },

    /** For tests and diagnostics. */
    state: function () { return state; }
  };
})();
