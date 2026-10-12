// E2E: the v0.9.0 desktop redesign.
//
// The redesign is ONE stylesheet (styles/redesign.css) loaded last, so the
// previous design is one deleted <link> away. These assertions exist because
// every failure mode this file guards against is SILENT:
//
//   • a token that resolves to nothing drops the whole declaration and says
//     nothing — `--shadow-xl` was used in eight components and defined nowhere,
//     so every modal, toast and menu has been rendering with no shadow at all
//   • a selector that matches nothing does nothing and says nothing — the first
//     version of the overlay section was nineteen such selectors, because the
//     overlays are built from inline styles and have no class names
//
// Both are checked here against the running app rather than by reading the CSS,
// because the CSS looks correct in both cases.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

const tokens = (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const names = [
      '--bg-base', '--bg-surface', '--bg-sidebar', '--bg-raised', '--bg-raised-2',
      '--bg-hover', '--bg-active', '--text-primary', '--text-secondary', '--text-muted',
      '--accent-primary', '--accent-soft', '--accent-ring',
      '--border-subtle', '--border-strong',
      '--radius-sm', '--radius-md', '--radius-lg',
      '--pill-sm', '--pill-md', '--pill-lg',
      '--ease', '--dur', '--transition',
      '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl'
    ];
    const out = {};
    names.forEach((n) => { out[n] = cs.getPropertyValue(n).trim(); });
    return out;
  });

// Give the feed something to look at. The local-echo greeting lands ~4s after
// boot, which is too slow and too flaky to depend on.
const seedConversation = (page) =>
  page.evaluate(() => {
    const st = window.store.getState();
    const now = Date.now();
    const mk = (id, text, mine, minsAgo) => ({
      id, text,
      sender: mine ? st.currentUser.userId : 'echo',
      timestamp: new Date(now - minsAgo * 60000).toISOString(),
      mine, read: true
    });
    window.store.setState({
      messages: Object.assign({}, st.messages, {
        'local-echo': [
          mk('r1', 'a message from them', false, 6),
          mk('r2', 'and one from me', true, 4)
        ]
      })
    });
  });

test.describe('desktop redesign', () => {
  let app;
  let page;

  test.beforeEach(async () => {
    ({ app, page } = await launchApp(tmpUserDataDir('redesign')));
    await seedConversation(page);
    await page.waitForTimeout(1200);
  });

  test.afterEach(async () => {
    if (app) await app.close().catch(() => {});
  });

  test('the layer loads, and loads after every other stylesheet', async () => {
    const sheets = await page.evaluate(() =>
      // ⚠ Strip the ?v= cache-buster. The first version of this assertion
      // compared 'redesign.css' against 'redesign.css?v=20261012a' and failed
      // on a file that was loaded correctly — the assertion was wrong, not the app.
      Array.from(document.styleSheets).map((s) =>
        (s.href || '').split('/').pop().split('?')[0]));

    expect(sheets).toContain('redesign.css');
    // ⚠ LAST among the app's own sheets. If it is not last, components.css wins
    // on equal specificity and the redesign silently half-applies.
    const appSheets = sheets.filter((h) => /\.css$/.test(h) && !h.includes('family=') && !h.includes('prism'));
    expect(appSheets[appSheets.length - 1]).toBe('redesign.css');
  });

  test('every token it defines resolves to something', async () => {
    const t = await tokens(page);
    const empty = Object.keys(t).filter((k) => !t[k]);
    // A token that is empty is a token that is not defined, and every declaration
    // using it is dropped without a word.
    expect(empty).toEqual([]);
  });

  test('the shadow ladder is complete — the fix for eight shadowless surfaces', async () => {
    const t = await tokens(page);
    ['--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl'].forEach((k) => {
      expect(t[k]).not.toBe('');
    });
    expect(t['--shadow-xl']).not.toBe('none');
  });

  test('an overlay that uses --shadow-xl actually has a shadow', async () => {
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(1200);
    const shadow = await page.evaluate(() => {
      const overlay = document.getElementById('settings-overlay');
      if (!overlay || !overlay.firstElementChild) return null;
      return getComputedStyle(overlay.firstElementChild).boxShadow;
    });
    expect(shadow).not.toBeNull();
    expect(shadow).not.toBe('none');
  });

  test('the send button is inert with nothing to send and lit with text', async () => {
    const state = () =>
      page.evaluate(() => {
        const b = document.getElementById('btn-send');
        const cs = getComputedStyle(b);
        return { ready: b.classList.contains('ready'), color: cs.color, opacity: cs.opacity };
      });

    const idle = await state();
    expect(idle.ready).toBe(false);
    expect(Number(idle.opacity)).toBeLessThan(1);

    await page.fill('#chat-input', 'something to send');
    await page.waitForTimeout(400);
    const ready = await state();
    expect(ready.ready).toBe(true);
    // ⚠ `.ready` must carry the accent COLOUR. The redesign deliberately does not
    // give this button a filled disc — the mic and emoji beside it have no
    // background, so a disc made it look like a different kind of control.
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim());
    const toRgb = (hex) => {
      const h = hex.replace('#', '');
      return 'rgb(' + parseInt(h.slice(0, 2), 16) + ', ' + parseInt(h.slice(2, 4), 16) + ', ' + parseInt(h.slice(4, 6), 16) + ')';
    };
    expect(ready.color).toBe(toRgb(accent));
  });

  test('a message from them and a message from me do not look the same', async () => {
    const bubbles = await page.evaluate(() => {
      const own = document.querySelector('.message-row.message-own .message-bubble');
      const theirs = document.querySelector('.message-row:not(.message-own):not(.message-system) .message-bubble');
      if (!own || !theirs) return null;
      const cs = (el) => {
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, radius: c.borderRadius, border: c.borderTopColor };
      };
      return { own: cs(own), theirs: cs(theirs) };
    });

    expect(bubbles).not.toBeNull();
    // The speaker is the whole point of a bubble. If the two render the same,
    // the conversation is unreadable at a glance.
    expect(bubbles.own.bg).not.toBe(bubbles.theirs.bg);
    // ...and the anchored corner is the only square one.
    expect(bubbles.own.radius).not.toBe(bubbles.theirs.radius);
  });

  test('the active rail item is a tint, not a filled block', async () => {
    const active = await page.evaluate(() => {
      const el = document.querySelector('#left-sidebar-container .icon-btn.active');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    expect(active).not.toBeNull();
    // An accent-tinted surface at low alpha, not an opaque accent fill.
    const m = /rgba?\(([^)]+)\)/.exec(active.bg);
    expect(m).not.toBeNull();
    const parts = m[1].split(',').map((s) => parseFloat(s));
    const alpha = parts.length === 4 ? parts[3] : 1;
    expect(alpha).toBeLessThan(0.5);
    expect(active.color).not.toBe('rgb(255, 255, 255)');
  });

  test('the sidebar tabs are a segmented control, not underlined text', async () => {
    const tabs = await page.evaluate(() => {
      const active = document.querySelector('.tabs-container .tab.active');
      const idle = document.querySelector('.tabs-container .tab:not(.active)');
      if (!active || !idle) return null;
      const cs = (el) => getComputedStyle(el);
      return {
        containerBg: cs(document.querySelector('.tabs-container')).backgroundColor,
        activeBg: cs(active).backgroundColor,
        idleBg: cs(idle).backgroundColor,
        activeWeight: cs(active).fontWeight
      };
    });
    expect(tabs).not.toBeNull();
    // The selected tab is a SURFACE, so it differs from both its neighbour and
    // the track behind them.
    expect(tabs.activeBg).not.toBe(tabs.idleBg);
    expect(tabs.activeBg).not.toBe(tabs.containerBg);
  });

  test('hovering a button does not move it', async () => {
    // ⚠ components.css lifts EVERY button 1px and brightens it 10% on hover.
    // The redesign removes that: in a dense desktop UI a control that shifts when
    // you point at it reads as unstable. Asserted because it is invisible in the
    // stylesheet — it is a global rule in a different file.
    await page.hover('#btn-chat-more');
    await page.waitForTimeout(300);
    const t = await page.evaluate(() =>
      getComputedStyle(document.getElementById('btn-chat-more')).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(t);
  });

  test('the feed does not re-animate itself on every render', async () => {
    // ⚠ A REGRESSION GUARD FOR A MISTAKE I MADE. My first pass put a blanket
    // `animation` on `.message-row`. renderMessages() rebuilds the feed wholesale,
    // so the animation restarted on every re-render and the whole conversation
    // dropped to ~0.84 opacity whenever an incoming message arrived — a chat that
    // pulses every time somebody types. The app already had the right mechanism
    // (`messageEnter`, gated on `[data-msg-anim]`, so only NEW messages animate)
    // and my rule overrode it.
    //
    // Two checks, because the mistake had two shapes.
    const fs = require('fs');
    const path = require('path');

    // 1. No blanket rule in the layer. Read from disk: the point is what the file
    //    says, and this is the exact shape of the mistake. Precise rather than a
    //    loose regex — a selector LIST is split first, and at-rule preludes are
    //    skipped, because the first version of this check matched eleven things
    //    that were all correct.
    const css = fs.readFileSync(path.join(__dirname, '../../src/styles/redesign.css'), 'utf8');
    const bare = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, '')))) {
      const prelude = m[1].trim();
      if (prelude.startsWith('@')) continue;
      for (const sel of prelude.split(',').map((s) => s.trim())) {
        // ONLY an unqualified .message-row / .list-row — a `[data-msg-anim]` or
        // descendant variant is a different, deliberate thing.
        if (/^\.(message-row|list-row)$/.test(sel) && /animation\s*:/.test(m[2])) bare.push(sel);
      }
    }
    expect(bare).toEqual([]);

    // 2. Behaviour: after a re-render, only the new row animates — not the feed.
    //    ⚠ Not "no row animates": the entry animation for a NEW message is
    //    deliberate and correct. The bug was that ALL of them did.
    const counts = await page.evaluate(() => new Promise((resolve) => {
      const st = window.store.getState();
      const msgs = (st.messages['local-echo'] || []).slice();
      msgs.push({
        id: 'r-new', text: 'a new one', sender: 'echo',
        timestamp: new Date().toISOString(), mine: false, read: true
      });
      window.store.setState({ messages: Object.assign({}, st.messages, { 'local-echo': msgs }) });
      requestAnimationFrame(() => {
        const rows = Array.from(document.querySelectorAll('.message-row'));
        const animating = rows.filter((r) => getComputedStyle(r).animationName !== 'none');
        resolve({ total: rows.length, animating: animating.length });
      });
    }));

    expect(counts.total).toBeGreaterThan(1);
    expect(counts.animating).toBeLessThan(counts.total);
  });

  test('reduced motion stops the loops but keeps everything visible', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { anim: cs.animationName, opacity: cs.opacity, transform: cs.transform };
      };
      return {
        typingDot: pick('.typing-dot'),
        online: pick('.status-indicator.online'),
        bubble: pick('.message-bubble')
      };
    });

    // The loops that would otherwise run forever.
    if (r.typingDot) expect(r.typingDot.anim).toBe('none');
    if (r.online) expect(r.online.anim).toBe('none');

    // ⚠ And nothing is left INVISIBLE. Every entry animation in this app starts
    // at opacity 0, so switching animations off without pinning the end state
    // would hide the content instead of settling it.
    expect(r.bubble.opacity).toBe('1');
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(r.bubble.transform);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  test('the layer is the ONLY difference — disabling it restores the old accent', async () => {
    const accent = () =>
      page.evaluate(() => {
        const s = Array.from(document.styleSheets)
          .find((x) => (x.href || '').includes('redesign.css'));
        if (s) s.disabled = true;
        return getComputedStyle(document.documentElement)
          .getPropertyValue('--accent-primary').trim().toLowerCase();
      });

    // Before disabling, the redesign's accent.
    expect(await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim().toLowerCase()
    )).toBe('#4d7cfe');

    // With the layer off, dark.css's own value is back — which is what makes
    // "delete the <link> and the old design returns" a real promise rather than
    // a hopeful one.
    expect(await accent()).toBe('#0a84ff');
  });
});
