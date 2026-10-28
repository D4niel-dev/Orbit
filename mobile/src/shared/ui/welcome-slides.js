// shared/ui/welcome-slides.js
//
// The first-run feature carousel. It renders into whatever container the host
// hands it — desktop puts it in the chat panel's empty state (the third column),
// mobile in the conversation list's empty state — so it is deliberately
// self-contained and has no idea which platform it is on.
//
// Shared by both platforms like the other modules in shared/ui/: edit this file,
// then run `npm run shared:sync` in mobile/.
(function () {
  'use strict';

  // Each slide is one thing Orbit actually does. Written to be true of the
  // shipped app rather than aspirational — if a feature is not in the build,
  // it does not belong here.
  var SLIDES = [
    {
      icon: 'wifi',
      title: 'No server in the middle',
      body: 'Orbit talks device to device. On the same Wi-Fi it finds the other side automatically, and your messages never pass through anyone else\u2019s computer.'
    },
    {
      icon: 'lock',
      title: 'Encrypted end to end',
      body: 'Messages are sealed for the person you are talking to, not for a server. Your keys are generated on your own devices and never leave them.'
    },
    {
      icon: 'paperclip',
      title: 'Send files, photos and video',
      body: 'Drop in an image, a document or a whole video and it goes straight to the other device \u2014 with album art on audio, a first-frame preview on video, and transfers that survive an interrupted connection.'
    },
    {
      icon: 'phone',
      title: 'Calls and voice messages',
      body: 'Start a voice or video call, or hold the mic and send a voice note. Group calls work across desktop peers.'
    },
    {
      icon: 'users-round',
      title: 'Groups that stay private',
      body: 'Make a group, invite people with a code, and give each member a role. Group messages are encrypted pairwise, so there is no shared secret to leak.'
    },
    {
      icon: 'hard-drive',
      title: 'Your data stays yours',
      body: 'Everything lives on your machine. Privacy mode hides previews, the Local Vault backs up a whole account \u2014 encrypted, and it can leave the device.'
    },
    {
      icon: 'palette',
      title: 'Make it yours',
      body: 'Themes, custom accents, avatar frames, chat folders and per-chat mute. The tour in Settings \u2192 About walks through the rest whenever you want it.'
    }
  ];

  var _mounted = null; // the live instance, so a re-render cannot leak listeners

  // Where the tour is, for THIS run of the app.
  //
  // Deliberately in memory rather than in storage. A tour should start at the
  // beginning every time the app starts — but the chat panel re-renders on every
  // store change, and with no memory at all the tour snapped back to slide 1 the
  // moment anything happened: a message arriving, a peer coming online, a tick.
  // Per-run state gives both: the beginning on launch, and no reset while you read.
  var _index = 0;
  // Dismissed for this run. "Done" means done — without this it came back the next
  // time the panel re-rendered, seconds after the user dismissed it.
  var _done = false;

  // The collapsed state after "Done". Built on demand rather than at load: the
  // helper is a separate script, and a load-order dependency is not worth the
  // couple of microseconds.
  function doneHtml() {
    if (window.OrbitEmpty && window.OrbitEmpty.html) {
      return window.OrbitEmpty.html({
        icon: 'message-circle',
        title: 'Select a friend to start chatting',
        // \u26a0\u26a0 THE ONE SENTENCE THAT PREVENTS "IT'S BROKEN". Orbit has no server, so a peer
        // is only reachable while they are actually online \u2014 and a new user's first
        // experience is adding somebody and seeing nothing happen. Saying it here, where
        // they are already looking at an empty panel, costs one line and saves the whole
        // first impression.
        hint: 'Nothing is stored on a server, so a friend appears only while they are online \u2014 ' +
              'instantly on the same Wi-Fi, or across the internet through a relay.',
        muted: true
      });
    }
    return '<div class="ows-done"><i data-lucide="message-circle"></i><span>Select a friend to start chatting</span></div>';
  }

  window.OrbitWelcome = {
    slides: SLIDES,

    // Render the carousel into `host`. Safe to call repeatedly: an earlier mount
    // is torn down first, which matters because the chat panel re-renders on
    // every store change.
    render: function (host) {
      if (!host) return;
      this.destroy();

      // Dismissed in this run — leave the plain empty state alone.
      if (_done) {
        host.innerHTML = doneHtml();
        if (window.lucide && window.lucide.createIcons) {
          try { window.lucide.createIcons({ root: host }); } catch (e) {}
        }
        return;
      }

      var index = _index;
      var root = document.createElement('div');
      root.className = 'ows-root';

      var card = document.createElement('div');
      card.className = 'ows-card';

      var iconWrap = document.createElement('div');
      iconWrap.className = 'ows-icon';

      var title = document.createElement('div');
      title.className = 'ows-title';

      var body = document.createElement('div');
      body.className = 'ows-body';

      card.appendChild(iconWrap);
      card.appendChild(title);
      card.appendChild(body);

      // ---- controls ----
      var footer = document.createElement('div');
      footer.className = 'ows-footer';

      var dots = document.createElement('div');
      dots.className = 'ows-dots';

      var spacer = document.createElement('div');
      spacer.style.cssText = 'flex:1';

      var prev = document.createElement('button');
      prev.className = 'ows-btn';
      prev.type = 'button';
      prev.textContent = 'Back';

      var next = document.createElement('button');
      next.className = 'ows-btn ows-btn-primary';
      next.type = 'button';
      next.textContent = 'Next';

      footer.appendChild(dots);
      footer.appendChild(spacer);
      footer.appendChild(prev);
      footer.appendChild(next);

      root.appendChild(card);
      root.appendChild(footer);

      var dotEls = [];
      for (var i = 0; i < SLIDES.length; i++) {
        var d = document.createElement('button');
        d.className = 'ows-dot';
        d.type = 'button';
        d.setAttribute('aria-label', 'Slide ' + (i + 1));
        (function (target) {
          d.addEventListener('click', function (e) { e.stopPropagation(); go(target); });
        })(i);
        dots.appendChild(d);
        dotEls.push(d);
      }

      function paint() {
        var s = SLIDES[index];
        title.textContent = s.title;
        body.textContent = s.body;
        iconWrap.innerHTML = '<i data-lucide="' + s.icon + '"></i>';
        for (var i = 0; i < dotEls.length; i++) {
          dotEls[i].classList.toggle('is-active', i === index);
        }
        prev.disabled = index === 0;
        prev.style.visibility = index === 0 ? 'hidden' : 'visible';
        next.textContent = (index === SLIDES.length - 1) ? 'Done' : 'Next';

        // Replay the entrance animation on each slide change. Removing the class,
        // forcing a reflow and re-adding it is what makes it run again — without
        // the reflow the browser coalesces both class changes into no animation at
        // all. The styles are desktop-side (components.css); mobile never mounts
        // this component, and the class is inert wherever they are absent.
        card.classList.remove('ows-enter');
        void card.offsetWidth;
        card.classList.add('ows-enter');
        // lucide is loaded by both platforms, but never assume it resolved.
        if (window.lucide && window.lucide.createIcons) {
          try { window.lucide.createIcons({ root: root }); } catch (e) {}
        }
      }

      function go(i) {
        index = Math.max(0, Math.min(SLIDES.length - 1, i));
        _index = index;
        paint();
      }

      function onPrev(e) { e.stopPropagation(); go(index - 1); }
      function onNext(e) {
        e.stopPropagation();
        if (index === SLIDES.length - 1) {
          // "Done" collapses back to the plain empty state rather than pretending
          // the carousel is a gate — the chat panel is still just waiting for a chat.
          this.destroy();
          _done = true;   // and stays dismissed for the rest of the run
          if (host) host.innerHTML = doneHtml();
          if (window.lucide && window.lucide.createIcons) {
            try { window.lucide.createIcons({ root: host }); } catch (e2) {}
          }
          return;
        }
        go(index + 1);
      }
      var nextHandler = onNext.bind(this);

      // Arrow keys, but only while the carousel is the thing on screen.
      function onKey(e) {
        if (!root.isConnected) return;
        var tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft') onPrev(e);
        else if (e.key === 'ArrowRight') { e.stopPropagation(); go(index + 1); }
      }

      prev.addEventListener('click', onPrev);
      next.addEventListener('click', nextHandler);
      document.addEventListener('keydown', onKey);

      host.innerHTML = '';
      host.appendChild(root);
      paint();

      _mounted = {
        root: root,
        destroy: function () {
          document.removeEventListener('keydown', onKey);
          prev.removeEventListener('click', onPrev);
          next.removeEventListener('click', nextHandler);
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    },

    destroy: function () {
      if (_mounted) {
        try { _mounted.destroy(); } catch (e) {}
        _mounted = null;
      }
    }
  };
})();
