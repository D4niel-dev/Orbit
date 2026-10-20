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
//
// ⚠ ONE EXCEPTION, AND IT EARNED ITSELF: "the retired brand purple appears in no
// renderer at all" reads the source, because the failure it guards is a string
// living in a file nobody opened. It walks EVERY renderer, not one — checking a
// single file is what let two copies of the purple survive a fix.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

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
    // ⚠ The redesign is opt-in. `settings.newUI` is false by default and the app
    // opens on the original UI, so every spec in this file has to turn the beta on
    // before launch — including the ones about turning it off again.
    ({ app, page } = await launchApp(seedNewUI(tmpUserDataDir('redesign'))));
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

  test('the search field paints no surface of its own — the pill is the only one', async () => {
    // ⚠ Dan: "the search bar on the 2nd panel looks weird". It was a BOX IN A BOX:
    // sidebar-middle.js writes the input's background, border and radius as
    // INLINE styles (`background: var(--bg-surface); border: 1px solid …;
    // border-radius: 8px`), so the field drew a second rounded rectangle inside
    // the pill — with its right edge cut off hard by the chevron beside it. An
    // inline declaration beats a stylesheet rule, so this needs `!important`, and
    // without the assertion it would come back the moment anyone tidied the file.
    const r = await page.evaluate(() => {
      const wrap = document.querySelector('.search-input-wrapper');
      const input = document.querySelector('.search-input');
      if (!wrap || !input) return null;
      const cs = (el) => {
        const c = getComputedStyle(el);
        return {
          bg: c.backgroundColor,
          borderWidth: parseFloat(c.borderWidth) || 0,
          radius: parseFloat(c.borderRadius) || 0,
          paddingLeft: parseFloat(c.paddingLeft) || 0,
          width: el.getBoundingClientRect().width
        };
      };
      return { wrap: cs(wrap), input: cs(input) };
    });

    expect(r).not.toBeNull();
    // The pill is a surface...
    expect(r.wrap.bg).not.toBe('rgba(0, 0, 0, 0)');
    // ...and the field inside it is not. All three, because the inline style sets
    // all three and any one of them left standing draws a visible box.
    expect(r.input.bg).toBe('rgba(0, 0, 0, 0)');
    expect(r.input.borderWidth).toBe(0);
    expect(r.input.radius).toBe(0);
    // And the field is wide enough to be worth typing in: the panel is 260px, so
    // anything under ~140px of text room means the padding is eating the field.
    expect(r.input.width - r.input.paddingLeft).toBeGreaterThan(140);
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

  test('the settings nav selects with a tint, and keeps it across a tab switch', async () => {
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(1200);

    const read = () => page.evaluate(() => {
      const a = document.querySelector('.settings-tab.active');
      const i = document.querySelector('.settings-tab:not(.active)');
      const cs = (e) => (e ? getComputedStyle(e) : null);
      return a && i ? {
        label: a.textContent.trim(),
        activeBg: cs(a).backgroundColor, activeColor: cs(a).color,
        idleBg: cs(i).backgroundColor
      } : null;
    });

    const first = await read();
    expect(first).not.toBeNull();
    // ⚠ An accent TINT, not the raised grey block it shipped as — the same
    // "selected = a filled surface" treatment the rail and the list rows moved
    // away from. Low alpha is what makes it a tint.
    const m = /rgba?\(([^)]+)\)/.exec(first.activeBg);
    const alpha = m ? (m[1].split(',').length === 4 ? parseFloat(m[1].split(',')[3]) : 1) : 0;
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(0.5);
    expect(first.activeBg).not.toBe(first.idleBg);

    // ⚠ The tab colours are written INLINE and the click handler rewrites them, so
    // this is really asking whether the `!important` block still wins after a
    // switch — the failure mode is a nav that reverts to the old look on click.
    await page.locator('.settings-tab[data-tab="notifications"]').click();
    await page.waitForTimeout(900);
    const second = await read();
    expect(second.label).toBe('Notifications');
    expect(second.activeBg).toBe(first.activeBg);
    expect(second.idleBg).toBe(first.idleBg);
  });

  test('the profile banner default has no second brand colour, and both paths agree', async () => {
    // ⚠ The default banner ran accent → #6C5CE7, a HARDCODED PURPLE — a second
    // brand colour in a design that has exactly one. And it was written out TWICE:
    // once in the render path and once in the live-preview path that rebuilds the
    // banner as you type. The first version of this fix changed only the first, so
    // the purple came back the moment anyone touched the banner field.
    //
    // ⚠⚠ AND THEN IT TURNED OUT TO BE THREE COPIES, IN THREE FILES. The same
    // default was spelled out again in the profile sidebar and in the Manage Group
    // modal, both still ending in the purple. Fixing one file and asserting on one
    // file is exactly what let the other two survive — so the value now lives in
    // styles/variables.css as `--banner-default` and all three read it.
    //
    // ⚠⚠ CHECKED BEHAVIOURALLY, NOT BY READING THE SOURCE. The first attempt
    // stripped comments out of a 188 KB file with a regex to look for the hex —
    // which silently swallowed one of the call sites, so the assertion failed for a
    // reason that had nothing to do with the banner.
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(1200);

    const readPreview = () => page.evaluate(() => {
      const b = document.getElementById('preview-banner');
      if (!b) return null;
      const cs = getComputedStyle(b);
      return {
        style: b.getAttribute('style') || '',
        // ⚠ The COMPUTED image, which is the only thing that proves color-mix()
        // actually resolved and painted. The declared value is a token reference.
        bgImage: cs.backgroundImage || '',
        height: Math.round(b.getBoundingClientRect().height)
      };
    });

    const rendered = await readPreview();
    expect(rendered).not.toBeNull();
    expect(rendered.style).not.toMatch(/#6C5CE7/i);
    // One definition, referenced — not a gradient spelled out at the call site.
    expect(rendered.style).toMatch(/var\(--banner-default\)/);
    // And it PAINTS. Chromium 111+ supports color-mix(); this app is Electron 32
    // (Chromium 128), so the gradient must resolve to real colour, not to `none`.
    expect(rendered.bgImage).toContain('gradient');
    expect(rendered.bgImage).not.toBe('none');
    expect(rendered.height).toBeGreaterThan(0);

    // Now drive the PREVIEW path: type a banner, then clear it. Clearing is what
    // makes the preview fall back to its own copy of the default.
    const input = page.locator('#input-banner');
    if (await input.isVisible().catch(() => false)) {
      await input.fill('#123456');
      await page.waitForTimeout(500);
      await input.fill('');
      await page.waitForTimeout(700);

      const afterClear = await readPreview();
      expect(afterClear.style).not.toMatch(/#6C5CE7/i);
      // ⚠ The two paths must produce the SAME default. This is the assertion that
      // would have caught the half-fix.
      expect(afterClear.style).toBe(rendered.style);
      expect(afterClear.bgImage).toBe(rendered.bgImage);
    }
  });

  test('the retired brand purple appears in no renderer at all', async () => {
    // ⚠ COUNTED ACROSS EVERY FILE, NOT CHECKED IN ONE. The fix that removed this
    // hex from settings-modal.js left it in profile-sidebar.js and
    // sidebar-middle.js, and a spec that read only the file I had edited reported
    // green. Comments are allowed to mention it — they are the note explaining why
    // it is gone — so this strips them and looks at code only.
    const dir = path.join(__dirname, '../../src/js');
    const offenders = [];
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.name.endsWith('.js')) continue;
        const src = fs.readFileSync(full, 'utf8');
        // Block comments, then line comments (sparing `https://`).
        const code = src
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        if (/#6C5CE7/i.test(code)) offenders.push(path.relative(dir, full));
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });

  test('one switch geometry for every switch in the app', async () => {
    // ⚠ FIVE HAND-BUILT SWITCHES, IN TWO SIZES AND THREE OFF-COLOURS, AND ONE OF
    // THEM TURNED RED. settings-modal.js had two at 44x24, sidebar-middle.js had
    // two at 36x20 with a hardcoded #323236, and profile-sidebar.js had one at
    // 36x20 off a translucent border token — and that one used --accent-danger for
    // "on", so the same action ("mute notifications") read as a failure in one
    // panel and a preference in the other.
    //
    // They all read `.orbit-switch` now, and the geometry and the travel come from
    // one place. This measures every switch the app can show at once.
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const s = window.store.getState().settings;
      window.store.setState({ settings: { ...s, enableExperimental: true } });
      window.SettingsModal.renderTab('security');
    });
    await page.waitForTimeout(900);

    const shapes = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.orbit-switch').forEach((sw) => {
        const track = sw.querySelector('.orbit-switch-track');
        const knob = sw.querySelector('.orbit-switch-knob');
        const input = sw.querySelector('input');
        if (!track || !knob || !input) { out.push({ shape: 'INCOMPLETE' }); return; }
        const tb = track.getBoundingClientRect();
        const kb = knob.getBoundingClientRect();
        out.push({
          box: Math.round(tb.width) + 'x' + Math.round(tb.height),
          radius: getComputedStyle(track).borderRadius,
          off: getComputedStyle(track).backgroundColor,
          knobInset: Math.round(kb.x - tb.x),
          // A zero-sized input is still tabbable; display:none would not be.
          tabbable: input.tabIndex >= 0
        });
      });
      return out;
    });

    expect(shapes.length).toBeGreaterThan(0);
    const first = shapes[0];
    for (const s of shapes) {
      expect(s.box).toBe(first.box);
      expect(s.radius).toBe(first.radius);
      expect(s.off).toBe(first.off);
      expect(s.tabbable).toBe(true);
    }
    // One size, and the knob sits at one consistent inset from the left when off.
    expect(first.box).toBe('40x22');
  });

  test('the knob reaches the far end — the travel is computed, not guessed', async () => {
    // ⚠ A hand-written travel value is a second writer: change the width and the
    // knob stops short of the end. The CSS computes it from the switch's own
    // dimensions, so this asserts the ON state is the MIRROR of the off state —
    // equal inset on the other side, which is the only way to know the arithmetic
    // is right rather than approximately right.
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.SettingsModal.renderTab('about'));
    await page.waitForTimeout(900);

    const off = await page.evaluate(() => {
      const sw = document.querySelector('#update-check-toggle').closest('.orbit-switch');
      const tb = sw.querySelector('.orbit-switch-track').getBoundingClientRect();
      const kb = sw.querySelector('.orbit-switch-knob').getBoundingClientRect();
      return { left: Math.round(kb.x - tb.x), right: Math.round(tb.right - kb.right) };
    });
    // Turn it ON by clicking the track — nothing in the app repaints the switch.
    await page.evaluate(() => document.querySelector('#update-check-toggle + .orbit-switch-track').click());
    await page.waitForTimeout(600);
    const on = await page.evaluate(() => {
      const sw = document.querySelector('#update-check-toggle').closest('.orbit-switch');
      const tb = sw.querySelector('.orbit-switch-track').getBoundingClientRect();
      const kb = sw.querySelector('.orbit-switch-knob').getBoundingClientRect();
      return { left: Math.round(kb.x - tb.x), right: Math.round(tb.right - kb.right) };
    });

    expect(off.left).toBe(on.right);
    expect(off.right).toBe(on.left);
    // And the state came from the checkbox, with no JS involved.
    expect(off.left).not.toBe(on.left);
  });

  test('muting is a preference, not a failure', async () => {
    // ⚠ The profile sidebar's mute switch turned RED when on — --accent-danger for
    // an ordinary setting. The group modal's switch for the very same action has
    // always been the accent, so one control read as an error in one panel and a
    // preference in the other.
    await page.evaluate(() => {
      const f = (window.store.getState().friends || [])[0];
      if (f && window.ProfileSidebar) window.ProfileSidebar.open(f);
    });
    await page.waitForTimeout(900);

    const before = await page.evaluate(() => {
      const t = document.querySelector('#profile-mute-input').closest('.orbit-switch')
        .querySelector('.orbit-switch-track');
      return getComputedStyle(t).backgroundColor;
    });
    await page.evaluate(() => document.querySelector('#profile-mute-row').click());
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => {
      const input = document.querySelector('#profile-mute-input');
      const track = input.closest('.orbit-switch').querySelector('.orbit-switch-track');
      const icon = document.querySelector('#profile-mute-icon');
      return {
        checked: input.checked,
        track: getComputedStyle(track).backgroundColor,
        icon: getComputedStyle(icon).color,
        // The theme's danger colour, so "is it red?" can be answered rather than
        // eyeballed.
        danger: getComputedStyle(document.documentElement).getPropertyValue('--accent-danger').trim()
      };
    });

    expect(after.checked).toBe(true);
    expect(after.track).not.toBe(before);
    // Neither the switch nor its icon may be the danger colour while muted.
    const toRgb = (hex) => {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
      return m ? 'rgb(' + [1, 2, 3].map((i) => parseInt(m[i], 16)).join(', ') + ')' : hex;
    };
    const danger = toRgb(after.danger);
    expect(after.track).not.toBe(danger);
    expect(after.icon).not.toBe(danger);
  });

  test('the profile banner has a height, and the avatar straddles it', async () => {
    // ⚠ THE BANNER HAD NEVER BEEN VISIBLE. The markup wrote the banner's
    // `background` in one `style` attribute and its `height:80px` in a SECOND one
    // on the same div — the parser keeps the first and silently drops the rest, so
    // the div measured 319x0 and the gradient was painted into nothing. Nothing
    // noticed because no spec had ever opened this panel.
    await page.evaluate(() => {
      const f = (window.store.getState().friends || [])[0];
      if (f && window.ProfileSidebar) window.ProfileSidebar.open(f);
    });
    await page.waitForTimeout(1000);

    const r = await page.evaluate(() => {
      const banner = document.querySelector('#profile-sidebar-content .pf-banner');
      const avatar = document.querySelector('#profile-sidebar-content .pf-avatar');
      if (!banner || !avatar) return null;
      const bb = banner.getBoundingClientRect();
      const ab = avatar.getBoundingClientRect();
      const bcs = getComputedStyle(banner);
      // The panel's own scroll container, which must be an ancestor of BOTH — a
      // negative margin is clipped by an overflow ancestor, and with the scroller
      // on the body the avatar's top half was cut off at the banner's edge.
      const scroller = banner.closest('.pf-scroll');
      return {
        bannerBox: Math.round(bb.width) + 'x' + Math.round(bb.height),
        paints: bcs.backgroundImage !== 'none' && bcs.backgroundImage.includes('gradient'),
        // The avatar must cross the banner's bottom edge, not sit below it.
        avatarOverlapsBanner: ab.top < bb.bottom,
        scrollerIsAncestorOfBoth: !!scroller && scroller.contains(banner) && scroller.contains(avatar),
        // And the banner must be inside the scroller, so it scrolls with the body.
        bannerClippedByNothing: bb.height > 0
      };
    });

    expect(r).not.toBeNull();
    // 80px tall — the height that never landed, and a real width.
    expect(r.bannerBox.split('x')[1]).toBe('80');
    expect(Number(r.bannerBox.split('x')[0])).toBeGreaterThan(100);
    expect(r.paints).toBe(true);
    expect(r.avatarOverlapsBanner).toBe(true);
    expect(r.scrollerIsAncestorOfBoth).toBe(true);
  });

  test('the Activity Center tabs are a segmented control, and survive a switch', async () => {
    await page.click('#btn-nav-activity');
    await page.waitForTimeout(1200);

    const read = () => page.evaluate(() => {
      const a = document.querySelector('.activity-tab.active');
      const i = document.querySelector('.activity-tab:not(.active)');
      const track = document.getElementById('activity-tabs');
      if (!a || !i || !track) return null;
      const cs = (e) => getComputedStyle(e);
      return {
        label: a.textContent.trim(),
        activeBg: cs(a).backgroundColor,
        idleBg: cs(i).backgroundColor,
        trackBg: cs(track).backgroundColor,
        // ⚠ The underline is inline (`border-bottom: 2px solid …`) and the click
        // handler rewrites `borderBottomColor`, so a non-zero width here means the
        // old treatment is back.
        activeBottomWidth: parseFloat(cs(a).borderBottomWidth) || 0,
        idleBottomWidth: parseFloat(cs(i).borderBottomWidth) || 0
      };
    });

    const first = await read();
    expect(first).not.toBeNull();
    expect(first.activeBottomWidth).toBe(0);
    expect(first.idleBottomWidth).toBe(0);
    // The selected tab is a SURFACE: it differs from its neighbour and from the
    // track behind them.
    expect(first.activeBg).not.toBe(first.idleBg);
    expect(first.activeBg).not.toBe(first.trackBg);

    await page.locator('.activity-tab[data-tab="mentions"]').click();
    await page.waitForTimeout(800);
    const second = await read();
    expect(second.label).toBe('Mentions');
    expect(second.activeBg).toBe(first.activeBg);
    expect(second.activeBottomWidth).toBe(0);

    await page.evaluate(() => { if (window.ActivityCenter) window.ActivityCenter.close(); });
  });

  test('every photo-less avatar is a solid accent disc, not a faint one', async () => {
    // ⚠ Dan: "why is the default avatar transparent? and i mean the activity
    // modal!" Two separate things were wrong, and the assertion covers both:
    //
    //   • the activity sender's fallback was the app's ONLY avatar that was not an
    //     accent disc — `--bg-hover` fill with a `--text-muted` letter, an opaque
    //     grey circle with a grey letter, which reads as an empty circle. Eleven
    //     other call sites (webrtc-call, chat-panel, profile-sidebar,
    //     settings-modal, sidebar-middle) all use `--accent-primary` + white.
    //   • the redesign had restyled the settings preview's avatar to
    //     `--accent-soft`, reasoning that it should match the phone's contact rows.
    //     That is 14% alpha, and the avatar straddles the profile banner and the
    //     card body, so it was invisible against BOTH and only the 4px ring showed.
    //     The phone uses a soft tint; the desktop uses a solid disc. Reverted.
    //
    // So the assertion is the principle, not one element: a photo-less avatar is a
    // solid accent disc with a light letter, everywhere.
    const accent = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim());
    const toRgb = (hex) => {
      const h = hex.replace('#', '');
      return 'rgb(' + parseInt(h.slice(0, 2), 16) + ', ' + parseInt(h.slice(2, 4), 16) + ', ' + parseInt(h.slice(4, 6), 16) + ')';
    };
    const disc = (el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    };

    // 1. The settings preview.
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(1400);
    const preview = await page.evaluate(() => {
      const el = document.querySelector('div#preview-avatar-img');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    expect(preview).not.toBeNull();
    expect(preview.bg).toBe(toRgb(accent));
    // ⚠ A light letter. White on the accent is the convention; an accent-coloured
    // letter on an accent disc is the same shape as the bug.
    expect(preview.color).toBe('rgb(255, 255, 255)');
    await page.evaluate(() => { if (window.SettingsModal) window.SettingsModal.close(); });
    await page.waitForTimeout(600);

    // 2. A real activity row: seed a friend with NO avatar and a message, so the
    //    fallback actually renders. The local-echo chat is excluded from activity,
    //    which is why a fresh account sees the empty state and nothing else.
    await page.evaluate(() => {
      const st = window.store.getState();
      window.store.setState({
        friends: [{ userId: 'p_ava', username: 'Ava Chen', status: 'online' }],
        messages: Object.assign({}, st.messages, {
          p_ava: [{ id: 1, sender: 'p_ava', text: 'hello', timestamp: new Date().toISOString() }]
        })
      });
    });
    await page.waitForTimeout(900);
    await page.click('#btn-nav-activity');

    // ⚠⚠ WAIT FOR THE ROW — DO NOT SLEEP AND HOPE. This was a flat 1600ms, and under
    // the full suite (31 Electron launches on one machine) the activity list had not
    // rendered yet: `rowAvatar` came back null and the failure read as "the avatar
    // lost its disc", which is not what happened. Polling keeps the assertion honest —
    // it still fails if the row NEVER renders, and the message says so.
    await expect.poll(() => page.evaluate(() => {
      const content = document.getElementById('activity-content');
      if (!content) return 0;
      return Array.from(content.querySelectorAll('div')).filter((el) => {
        const b = el.getBoundingClientRect();
        return Math.round(b.width) === 24 && Math.round(b.height) === 24;
      }).length;
    }), { timeout: 8000, message: 'the activity row never rendered' }).toBeGreaterThan(0);

    const rowAvatar = await page.evaluate(() => {
      const content = document.getElementById('activity-content');
      if (!content) return null;
      // The 24px sender disc, not the 16px chat chip.
      const d = Array.from(content.querySelectorAll('div')).find((el) => {
        const b = el.getBoundingClientRect();
        return Math.round(b.width) === 24 && Math.round(b.height) === 24;
      });
      if (!d) return null;
      const cs = getComputedStyle(d);
      return { bg: cs.backgroundColor, color: cs.color, text: d.textContent.trim() };
    });
    expect(rowAvatar).not.toBeNull();
    expect(rowAvatar.bg).toBe(toRgb(accent));
    expect(rowAvatar.color).toBe('rgb(255, 255, 255)');
    expect(rowAvatar.text).toBe('A');

    await page.evaluate(() => { if (window.ActivityCenter) window.ActivityCenter.close(); });
  });

  test('the layer holds the CHROME ONLY — the components the renderer owns are not in it', async () => {
    // ⚠⚠ A STRUCTURAL GUARD FOR THE "CLASSIC LOOK" TOGGLE. The switch and the
    // profile sidebar had their markup migrated out of inline styles in v0.9.0, so
    // their rules CANNOT live in a sheet that gets switched off — a rule here would
    // leave a bare checkbox and an unstyled panel the moment a user chose the
    // classic look, and nothing would throw.
    //
    // Reading the files is the right tool for this one: the failure is "a rule is in
    // the wrong sheet", which no runtime assertion can see, because with the layer ON
    // the rule works perfectly.
    const read = (f) => fs.readFileSync(path.join(__dirname, '../../src/styles', f), 'utf8');
    // ⚠ Comments stripped FIRST. My own header comment in the layer names
    // `.orbit-switch` and `.pf-*` to say where they went, and the first version of
    // this assertion failed on that comment — the prose most worth keeping. The
    // guard is about rules.
    const code = (src) => src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const layer = code(read('redesign.css'));
    const components = read('components.css');

    for (const sel of ['.orbit-switch', '.pf-']) {
      expect(layer).not.toContain(sel);
      expect(components).toContain(sel);
    }
    // And the tokens those rules need must resolve with the layer off.
    const variables = read('variables.css');
    for (const token of ['--switch-w', '--switch-h', '--switch-knob', '--switch-inset',
      '--switch-off', '--dur', '--ease', '--accent-ring']) {
      expect(variables).toContain(token + ':');
    }
  });

  test('turning the layer off reverts the chrome and both UIs stay whole', async () => {
    // The layer is the beta and the original UI is the default, so this is the
    // direction that has to keep working: switch the layer off and the app is
    // whole, not half-styled.
    // ⚠ Applied by disabling ONE <link> — the redesign is a layer — so this asserts
    // the chrome actually changes, not merely that the link flipped.
    //
    // ⚠ The LAYER is driven directly here, through apply(). The switch does not flip
    // it any more: it confirms and restarts (see the two tests below), so wiring this
    // assertion to a click on the switch would be testing a path that no longer runs.
    const chrome = () => page.evaluate(() => {
      const link = document.getElementById('redesign-css');
      const search = document.querySelector('.search-input-wrapper');
      const track = document.querySelector('.orbit-switch-track');
      const banner = document.querySelector('#profile-sidebar-content .pf-banner');
      return {
        layerOn: link ? !link.disabled : null,
        // A token ONLY the layer defines.
        iconBtn: getComputedStyle(document.documentElement).getPropertyValue('--icon-btn').trim() || '',
        // A real element it restyles: a 34px stadium in the redesign, square before it.
        searchRadius: search ? getComputedStyle(search).borderRadius : null,
        // ⚠ The two things that must be styled in BOTH modes.
        switchBox: track ? (() => { const b = track.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); })() : null,
        bannerHeight: banner ? Math.round(banner.getBoundingClientRect().height) : null
      };
    });

    const before = await chrome();
    expect(before.layerOn).toBe(true);
    expect(before.iconBtn).toBe('32px');
    expect(before.searchRadius).toBe('34px');

    // Classic.
    await page.evaluate(() => window.OrbitRedesign.apply(false));
    await page.waitForTimeout(500);
    const after = await chrome();
    expect(after.layerOn).toBe(false);
    // The layer's token is gone and the element it restyled is back to the old shape.
    expect(after.iconBtn).toBe('');
    expect(after.searchRadius).not.toBe('34px');

    // ⚠ The profile sidebar, with the layer off — and this is also where a switch is
    // finally IN THE DOM. Measured earlier, switchBox was null because nothing on
    // screen carried one, which is a fact about the test, not the app.
    await page.evaluate(() => {
      const f = (window.store.getState().friends || [])[0];
      if (f && window.ProfileSidebar) window.ProfileSidebar.open(f);
    });
    await page.waitForTimeout(1000);
    const classic = await chrome();
    // ⚠ The switch survives — it is in components.css precisely so this holds.
    expect(classic.switchBox).toBe('40x22');
    expect(classic.bannerHeight).toBe(80);

    // And back.
    await page.evaluate(() => window.OrbitRedesign.apply(true));
    await page.waitForTimeout(500);
    const back = await chrome();
    expect(back.layerOn).toBe(true);
    expect(back.iconBtn).toBe('32px');
    expect(back.searchRadius).toBe('34px');
  });

  // Open Settings and the tab the look switch lives on, returning the state a
  // test cares about.
  //
  // ⚠ IT IS UNDER ADVANCED → EXPERIMENTAL FEATURES, NOT APPEARANCE. The redesign
  // is the beta and the original UI is the default, so switching between them is
  // an experimental choice rather than a first-class appearance one.
  //
  // ⚠ THIS FILE SEEDS `newUI: true`, so the beta is ON when a test starts. That is
  // what makes it a spec about the redesign at all — see the beforeEach.
  const lookState = () => page.evaluate(() => ({
    layerOn: !document.getElementById('redesign-css').disabled,
    checked: document.getElementById('set-new-ui').checked,
    // ⚠ BOTH stores, because the restart reads them back.
    inElectronStore: (window.orbitAPI.storeGet('settings') || {}).newUI,
    inSqlite: (window.orbitAPI.dbGetSetting('settings', {}) || {}).newUI,
    // The confirm dialog mounts into #modal-container. `switch` = turning the beta
    // on, `back` = turning it off.
    dialogTitle: (() => {
      const c = document.getElementById('modal-container');
      if (!c || !c.textContent) return null;
      return c.textContent.includes('Switch to the new look?') ? 'switch'
        : c.textContent.includes('Switch back to the original look?') ? 'back' : null;
    })()
  }));

  const clickDialog = (label) => page.evaluate((t) => {
    const btn = Array.from(document.querySelectorAll('#modal-container button'))
      .find((b) => b.textContent.trim() === t);
    if (btn) btn.click();
    return !!btn;
  }, label);

  const openAppearance = async () => {
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(900);
    await page.evaluate(() => window.SettingsModal.renderTab('advanced'));
    await page.waitForTimeout(900);
  };

  test('the look switch asks first, and cancelling changes nothing', async () => {
    // ⚠⚠ A SWITCH THAT MOVES AND THEN ASKS PERMISSION IS SHOWING A STATE THAT IS NOT
    // SAVED. Changing the look restarts the app, so the control must not act on the
    // click: it goes back at once and only a confirmed choice may move it.
    await openAppearance();

    const before = await lookState();
    expect(before.layerOn).toBe(true);
    expect(before.checked).toBe(true);          // the beta is on — this file seeded it
    expect(before.inElectronStore).toBe(true);
    expect(before.dialogTitle).toBeNull();

    // Clicking the ROW (the label) opens the confirmation — asking to turn the beta
    // OFF, because that is the direction it is currently in.
    await page.evaluate(() => document.getElementById('set-new-ui').closest('label').click());
    await page.waitForTimeout(400);
    const asked = await lookState();
    expect(asked.dialogTitle).toBe('back');
    // ⚠ The switch is back where it started.
    expect(asked.checked).toBe(true);
    // And NOTHING has been written or applied while the question is open.
    expect(asked.layerOn).toBe(true);
    expect(asked.inElectronStore).toBe(true);

    // Cancel.
    expect(await clickDialog('Not now')).toBe(true);
    await page.waitForTimeout(500);
    const cancelled = await lookState();
    expect(cancelled.dialogTitle).toBeNull();
    expect(cancelled.checked).toBe(true);
    expect(cancelled.layerOn).toBe(true);
    expect(cancelled.inElectronStore).toBe(true);
    expect(cancelled.inSqlite).toBe(true);
  });

  test('confirming saves the choice and asks for a restart, without repainting first', async () => {
    // ⚠⚠ THE RESTART IS STUBBED ON window.OrbitRedesign, NOT ON orbitAPI. The preload
    // bridge is frozen and non-extensible — assigning to orbitAPI.relaunchApp
    // silently does nothing (verified) — so the real call would fire and this test
    // would relaunch Electron for real and leak a process. requestRestart exists as a
    // seam for exactly this.
    await page.evaluate(() => {
      window.__restarts = 0;
      window.OrbitRedesign.requestRestart = function () { window.__restarts += 1; return true; };
    });

    await openAppearance();
    await page.evaluate(() => document.getElementById('set-new-ui').closest('label').click());
    await page.waitForTimeout(400);
    expect(await clickDialog('Restart now')).toBe(true);
    await page.waitForTimeout(600);

    const r = await page.evaluate(() => ({
      restarts: window.__restarts,
      inElectronStore: (window.orbitAPI.storeGet('settings') || {}).newUI,
      inSqlite: (window.orbitAPI.dbGetSetting('settings', {}) || {}).newUI,
      layerOn: !document.getElementById('redesign-css').disabled,
      dialogGone: !document.getElementById('modal-container').textContent.includes('Switch to the new look?')
    }));

    expect(r.restarts).toBe(1);
    // ⚠ Both stores — the restart reads SQLite at boot, and electron-store is what
    // the pre-paint script reads. A write to only one of them is a half-fix.
    //
    // ⚠ `false` IS THE MEANINGFUL VALUE HERE, not a weak one. This file seeds
    // `newUI: true`, so the click asks to turn the beta OFF; a missing write would
    // leave `true` in place and fail. Asserting the value CHANGED is the point.
    expect(r.inElectronStore).toBe(false);
    expect(r.inSqlite).toBe(false);
    // ⚠⚠ AND THE WINDOW WAS NOT REPAINTED. Going through the store would have run
    // applySettings and flipped the layer under the user, then closed the window on
    // top of a half-transitioned UI. The change lands on the way back up.
    expect(r.layerOn).toBe(true);
    // And the dialog closed, so a stuck z-index-10000 overlay cannot block the app.
    expect(r.dialogGone).toBe(true);
  });

  test('the restart warning says so when a call is live', async () => {
    // ⚠ A restart ends a call, and the dialog is the ONLY place that can say so —
    // after the click there is no warning left to give. CallManager.activeCall is set
    // on every call start (outgoing, incoming, 1:1, group, and a call that is still
    // ringing) and cleared in the single cleanup(), so it is the honest signal.
    //
    // ⚠⚠ requestRestart IS STUBBED HERE, AND THAT IS NOT OPTIONAL. The first version
    // of this test did not, and clicking 'Restart now' relaunched Electron for real:
    // the page closed underneath the assertions ("Target page, context or browser has
    // been closed") and left a detached process behind. The preload bridge is frozen,
    // so the stub has to be on our own requestRestart.
    await page.evaluate(() => {
      window.__restarts = 0;
      window.OrbitRedesign.requestRestart = function () { window.__restarts += 1; return true; };
    });
    await openAppearance();

    const dialog = () => page.evaluate(() => {
      const c = document.getElementById('modal-container');
      const confirm = Array.from(c.querySelectorAll('button'))
        .find((b) => /restart/i.test(b.textContent));
      return {
        text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
        confirmLabel: confirm ? confirm.textContent.trim() : null,
        confirmBg: confirm ? getComputedStyle(confirm).backgroundColor : null,
        accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim(),
        danger: getComputedStyle(document.documentElement).getPropertyValue('--accent-danger').trim()
      };
    });

    const toRgb = (hex) => {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
      return m ? 'rgb(' + [1, 2, 3].map((i) => parseInt(m[i], 16)).join(', ') + ')' : hex;
    };

    // No call — the ordinary wording, and no alarm.
    await page.evaluate(() => document.getElementById('set-new-ui').closest('label').click());
    await page.waitForTimeout(400);
    const quiet = await dialog();
    expect(quiet.text).not.toMatch(/in a call/i);
    expect(quiet.confirmLabel).toBe('Restart now');
    expect(quiet.confirmBg).not.toBe(toRgb(quiet.danger));
    await clickDialog('Restart now');
    await page.waitForTimeout(500);

    // Now with a call live.
    await page.evaluate(() => {
      window.__savedActiveCall = window.CallManager.activeCall;
      window.CallManager.activeCall = { isVideo: false, direction: 'outgoing', isGroup: false };
    });
    await page.evaluate(() => document.getElementById('set-new-ui').closest('label').click());
    await page.waitForTimeout(400);
    const alarmed = await dialog();
    // ⚠ It has to SAY it, not merely change colour.
    expect(alarmed.text).toMatch(/in a call/i);
    expect(alarmed.text).toMatch(/will end it/i);
    expect(alarmed.confirmLabel).toBe('End call and restart');
    // ⚠ And the confirm is the danger colour, because the consequence is no longer
    // just a restart.
    expect(alarmed.confirmBg).toBe(toRgb(alarmed.danger));
    expect(alarmed.confirmBg).not.toBe(toRgb(alarmed.accent));

    // ⚠ Cancel, and put the app back — a live call left in the manager would leak
    // into every later assertion in this file.
    await clickDialog('Not now');
    await page.waitForTimeout(400);
    await page.evaluate(() => { window.CallManager.activeCall = window.__savedActiveCall; });
  });

  test('newUI fails toward the ORIGINAL ui — only exactly true turns the beta on', async () => {
    // ⚠⚠ THE SAFETY PROPERTY. A preference read that goes wrong must leave the user
    // in the complete, stable original UI rather than in a beta they did not ask
    // for — so anything that is not exactly `true` has to mean the redesign is OFF.
    // This is asserted for the values a corrupt store would realistically hold,
    // including the string "true", which a naive truthiness check would accept.
    const set = (value) => page.evaluate((v) => {
      const s = window.store.getState().settings;
      window.store.setState({ settings: Object.assign({}, s, { newUI: v }) });
    }, value);

    const layerOn = () => page.evaluate(() => {
      const link = document.getElementById('redesign-css');
      return link ? !link.disabled : null;
    });

    for (const value of [undefined, null, false, 0, '', 'true', 'yes', 1, {}]) {
      await set(value);
      await page.waitForTimeout(250);
      expect(await layerOn(), 'newUI=' + JSON.stringify(value) + ' must NOT turn the beta on').toBe(false);
    }
    // And the one value that does mean it.
    await set(true);
    await page.waitForTimeout(250);
    expect(await layerOn()).toBe(true);
  });

  test('the call screen is opaque, still, and one geometry', async () => {
    // ⚠⚠ THE OVERLAY WAS `rgba(0,0,0,0.85)` WITH NOTHING ON IT. It dimmed the app and
    // put the caller's name straight onto that dim — so 15% of whatever chat was open
    // showed through and the name sat on top of the messages behind it. A call is a
    // mode, not a dialog over the app.
    const call = () => page.evaluate(() => {
      const o = document.querySelector('.call-modal-overlay');
      if (!o) return null;
      const cs = getComputedStyle(o);
      return {
        bg: cs.backgroundColor,
        alpha: cs.backgroundColor.startsWith('rgba') ? cs.backgroundColor.split(',').pop().trim() : '1)',
        // ⚠ Every control used to carry an inline `onmouseover` that scaled it 1.08 —
        // the exact hover this file forbids, and unstylable because it is inline.
        inlineHover: Array.from(o.querySelectorAll('button')).filter((b) => b.getAttribute('onmouseover')).length,
        boxes: Array.from(o.querySelectorAll('.cal-btn')).map((b) => {
          const r = b.getBoundingClientRect();
          return Math.round(r.width) + 'x' + Math.round(r.height);
        }),
        wave: (() => { const s = o.querySelector('.cal-wave span'); return s ? getComputedStyle(s).animationName : null; })(),
        connected: (() => { const i = o.querySelector('#call-modal-inner'); return i ? i.classList.contains('is-connected') : null; })()
      };
    });

    // Incoming audio.
    await page.evaluate(() => window.CallModal.show({ username: 'Ava Lindqvist', avatar: '' }, false, true, false));
    await page.waitForTimeout(700);
    const incoming = await call();
    expect(incoming).not.toBeNull();
    // ⚠ Opaque: alpha must be exactly 1.
    expect(incoming.alpha).toBe('1)');
    expect(incoming.inlineHover).toBe(0);
    expect(incoming.boxes).toEqual(['62x62', '62x62']);
    expect(incoming.wave).toBe('audioWave');

    // ⚠⚠ A display name containing markup must be TEXT, not markup. The 1:1 name went
    // in raw while the group title beside it was escaped — one path was safe and the
    // other was not.
    await page.evaluate(() => {
      window.CallModal.show({ username: '<img src=x onerror="window.__pwned=1">', avatar: '' }, false, false, false);
    });
    await page.waitForTimeout(600);
    const escaped = await page.evaluate(() => {
      const n = document.getElementById('call-name-text');
      return { children: n.children.length, text: n.textContent, pwned: !!window.__pwned };
    });
    expect(escaped.children).toBe(0);
    expect(escaped.text).toContain('<img');
    expect(escaped.pwned).toBe(false);

    // ⚠ The waveform stops when the call connects. It animated whether or not anybody
    // was speaking — decoration pretending to be a level meter.
    await page.evaluate(() => window.CallModal.startTimer());
    await page.waitForTimeout(600);
    const connected = await call();
    expect(connected.connected).toBe(true);
    expect(connected.wave).toBe('none');

    // One geometry across the group layout too, and the hang-up is the big one.
    await page.evaluate(() => window.CallModal.showGroup('Design Sync', {
      p1: { name: 'Ava Lindqvist', avatar: null }, p2: { name: 'Kai Tanaka', avatar: null }
    }, true, false));
    await page.waitForTimeout(700);
    const group = await call();
    expect(group.alpha).toBe('1)');
    expect(group.inlineHover).toBe(0);
    expect(group.boxes.filter((b) => b === '62x62').length).toBe(1);
    expect(group.boxes.filter((b) => b === '52x52').length).toBe(3);
    // The participants carry real names, and each tile has something behind its video.
    const groupBits = await page.evaluate(() => ({
      names: Array.from(document.querySelectorAll('.cal-tile-name')).map((n) => n.textContent),
      tilesWithAvatar: document.querySelectorAll('.cal-tile-empty').length
    }));
    expect(groupBits.names).toEqual(['Ava Lindqvist', 'Kai Tanaka']);
    expect(groupBits.tilesWithAvatar).toBe(2);

    // Leave nothing on screen for whatever runs next.
    await page.evaluate(() => window.CallModal.hide());
    await page.waitForTimeout(400);
  });

  test('the gallery is a segmented control and a tint, not a fourth copy of each', async () => {
    // ⚠ The layer made the sidebar tabs, the Activity Center tabs and the settings nav
    // into ONE segmented control, and the gallery kept a fourth — hand-built from
    // inline styles, where the SELECTED segment was DARKER than the track behind it.
    // It also drew a selected filter as a fully saturated `--accent-primary` pill with
    // white text, i.e. a primary-button treatment on the one control that is not an
    // action. "All Chats" was the only saturated thing on the screen.
    await page.evaluate(() => window.store.setState({ activeTab: 'gallery' }));
    await page.waitForTimeout(1500);

    const g = await page.evaluate(() => {
      const hdr = document.querySelector('.gal-header');
      const chip = document.querySelector('.gallery-filter-btn.active');
      const seg = document.querySelector('.view-mode-btn.active');
      const idle = document.querySelector('.view-mode-btn:not(.active)');
      const track = document.querySelector('.gal-seg');
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        headerHeight: hdr ? Math.round(hdr.getBoundingClientRect().height) : null,
        imgsInHeader: document.querySelectorAll('.gal-header img').length,
        chipBg: cs(chip) ? cs(chip).backgroundColor : null,
        chipColor: cs(chip) ? cs(chip).color : null,
        segActive: cs(seg) ? cs(seg).backgroundColor : null,
        segIdle: cs(idle) ? cs(idle).backgroundColor : null,
        segTrack: cs(track) ? cs(track).backgroundColor : null,
        accent: cs(document.documentElement).getPropertyValue('--accent-primary').trim()
      };
    });

    // 48px, matching every other panel header — it was 64.
    expect(g.headerHeight).toBe(48);
    // ⚠ The app's own .ico used to sit in its own header, drawn in its own colours.
    expect(g.imgsInHeader).toBe(0);

    // ⚠ A TINT, not a filled block: the chip's background must not be the accent at
    // full strength. It is `--accent-soft` (the accent at 14%).
    const toRgb = (hex) => {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
      return m ? 'rgb(' + [1, 2, 3].map((i) => parseInt(m[i], 16)).join(', ') + ')' : hex;
    };
    expect(g.chipBg).not.toBe(toRgb(g.accent));
    expect(g.chipBg).toMatch(/^rgba\(/);
    // The text carries the accent instead, which is what makes it read as selected.
    expect(g.chipColor).toBe(toRgb(g.accent));

    // ⚠ The same assertion the sidebar tabs use: the selected segment is a SURFACE, so
    // it differs from both its neighbour and the track behind them.
    expect(g.segActive).not.toBe(g.segIdle);
    expect(g.segActive).not.toBe(g.segTrack);
  });

  test('the gallery view switcher actually switches — and saves', async () => {
    // ⚠⚠ THIS WAS BROKEN AND NOTHING SAID SO. The handler built `newSettings` with the
    // chosen mode and then never used it: `_persistSettings()` persists
    // `store.state.settings`, so the OLD mode went to disk, and because the store never
    // changed, the gallery's own subscription kept re-reading `galleryViewMode` (still
    // 'grid') and resetting `displayMode` on the next store change. Clicking a view
    // mode set the field, re-rendered once, and was silently undone.
    //
    // ⚠ Checked against the original before touching it — the same probe on the
    // unmodified file behaved identically, so this is a pre-existing bug, not one the
    // restyle introduced.
    await page.evaluate(() => window.store.setState({ activeTab: 'gallery' }));
    await page.waitForTimeout(1500);

    const read = () => page.evaluate(() => ({
      displayMode: window.GlobalGallery.displayMode,
      activeBtn: (() => { const b = document.querySelector('.view-mode-btn.active'); return b ? b.dataset.mode : null; })(),
      setting: (window.store.getState().settings || {}).galleryViewMode,
      // Is the list layout actually rendered? The mode is only real if the DOM moved.
      hasListLayout: !!document.querySelector('.gallery-list, [class*="gallery-list"]')
    }));

    expect((await read()).activeBtn).toBe('grid');

    await page.evaluate(() => document.querySelector('.view-mode-btn[data-mode="list"]').click());
    await page.waitForTimeout(900);
    const after = await read();
    expect(after.displayMode).toBe('list');
    expect(after.activeBtn).toBe('list');
    // ⚠ And it reached the STORE, which is the half that was missing.
    expect(after.setting).toBe('list');

    // ⚠ And it survives the next store change — the reset is what made it look like the
    // click did nothing at all.
    await page.evaluate(() => window.store.setState({ activeTab: 'gallery' }));
    await page.waitForTimeout(700);
    expect((await read()).activeBtn).toBe('list');

    // Put it back so nothing downstream inherits a list view.
    await page.evaluate(() => document.querySelector('.view-mode-btn[data-mode="grid"]').click());
    await page.waitForTimeout(700);
    expect((await read()).activeBtn).toBe('grid');
  });

  test('the boot skeleton predicts the real chrome', async () => {
    // ⚠⚠ IT IS THE FIRST THING EVERY LAUNCH SHOWS, AND ITS CSS IS IN components.css —
    // a sheet this layer never touched. So the app drew a 32px titlebar with a 28px
    // rail icon and a 36px square search box, then REPLACED all of it with a 34px
    // titlebar, 40px rail icons and a 34px pill. A visible jump on every single start.
    //
    // ⚠ The skeleton is removed after boot, so this re-injects its REAL markup —
    // parsed out of index.html rather than hand-built here — and compares it against
    // the chrome that is actually on screen. A skeleton whose whole job is to predict
    // the layout has to be checked against the layout.
    const html = fs.readFileSync(path.join(__dirname, '../../src/index.html'), 'utf8');
    const start = html.indexOf('<div id="app-skeleton">');
    expect(start).toBeGreaterThan(-1);
    let depth = 0, end = -1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    let m;
    while ((m = re.exec(html))) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) { end = re.lastIndex; break; }
    }
    expect(end).toBeGreaterThan(start);
    const markup = html.slice(start, end);

    const measured = await page.evaluate((sk) => {
      // What the chrome on screen actually is.
      const h = (sel) => { const e = document.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height) : null; };
      const box = (sel) => {
        const e = document.querySelector(sel);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return Math.round(r.width) + 'x' + Math.round(r.height);
      };
      const railBtn = document.querySelector('#panel-left .icon-btn') || document.querySelector('#panel-left button');
      const real = {
        titlebar: h('#titlebar'),
        icon: railBtn ? (() => { const r = railBtn.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })() : null,
        searchH: h('.search-input-wrapper'),
        rowH: h('.list-row'),
        avatar: box('.list-row-avatar'),
        titlebarBg: getComputedStyle(document.getElementById('titlebar')).backgroundColor
      };

      // And what the skeleton declares.
      const wrap = document.createElement('div');
      wrap.innerHTML = sk;
      const node = wrap.firstElementChild;
      document.body.appendChild(node);
      const sbox = (sel) => {
        const n = node.querySelector(sel);
        if (!n) return null;
        const r = n.getBoundingClientRect();
        return Math.round(r.width) + 'x' + Math.round(r.height);
      };
      const scs = (sel, prop) => { const n = node.querySelector(sel); return n ? getComputedStyle(n)[prop] : null; };
      const skel = {
        titlebarRow: parseFloat(getComputedStyle(node).gridTemplateRows),
        icon: sbox('.sk-icon'),
        searchH: Math.round(node.querySelector('.sk-search').getBoundingClientRect().height),
        rowH: Math.round(node.querySelector('.sk-row').getBoundingClientRect().height),
        avatar: sbox('.sk-avatar'),
        titlebarBg: scs('.sk-titlebar', 'backgroundColor')
      };
      node.remove();
      return { real, skel };
    }, markup);

    const { real, skel } = measured;
    expect(skel.titlebarRow).toBe(real.titlebar);
    expect(skel.icon).toBe(real.icon);
    expect(skel.searchH).toBe(real.searchH);
    expect(skel.rowH).toBe(real.rowH);
    expect(skel.avatar).toBe(real.avatar);
    // The strip changed shade on handover because the skeleton used the rail's colour
    // for a bar that is --bg-base in this design.
    expect(skel.titlebarBg).toBe(real.titlebarBg);
  });

  test('the group info modal is the same shell as Settings', async () => {
    // ⚠⚠ THEY ARE THE SAME OBJECT AND THEY DISAGREED ABOUT EVERY DIMENSION. Both are
    // an 800x600 panel with a 240px rail and a content pane, one click apart — and the
    // group modal had a 12px corner where Settings has 18, 24px of rail padding where
    // Settings has 20/16, a "Group Info" heading at 20px BOLD where this layer had
    // already decided the rail heading is a 14px LABEL, and a 24px "Manage Group" title
    // where Settings' page title is 19.
    //
    // ⚠⚠ AND MEASURING IT FOUND TWO DEAD RULES IN THE LAYER. The settings panel's
    // radius and its rail padding were written WITHOUT `!important`, against
    // `style.cssText` — so they had been silently doing nothing since they were
    // written, while looking perfectly correct. Measured before the fix: radius 12px
    // on BOTH panels, and Settings' rail at 24px. This test is what caught it.
    const seed = () => page.evaluate(() => {
      const me = window.store.getState().currentUser;
      window.store.setState({
        groups: [{
          groupId: 'shell-group', groupName: 'Design Sync', description: 'Weekly review.',
          ownerId: me.userId, inviteCode: 'a91f3c07', createdAt: Date.now() - 86400000 * 40,
          pinned: false, notificationMuted: false,
          members: [
            { userId: me.userId, username: me.username, usertag: me.usertag, status: 'online', role: 'owner', avatar: null },
            { userId: 'u-kai', username: 'Kai Tanaka', usertag: '4417', status: 'online', role: 'admin', avatar: null }
          ]
        }]
      });
    });
    const shell = (id) => page.evaluate((sel) => {
      const ov = document.getElementById(sel);
      if (!ov) return null;
      const panel = ov.firstElementChild;
      const rail = panel.children[0];
      const content = panel.children[1];
      const cs = (el, p) => (el ? getComputedStyle(el)[p] : null);
      return {
        radius: cs(panel, 'borderRadius'),
        railPadding: cs(rail, 'padding'),
        railH2: cs(rail.querySelector('h2'), 'fontSize'),
        contentPadding: cs(content, 'padding'),
        contentH3: cs(content.querySelector('h3'), 'fontSize')
      };
    }, id);

    await seed();
    await page.waitForTimeout(600);
    await page.evaluate(() => window.SidebarMiddle.showGroupInfo('shell-group'));
    await page.waitForTimeout(1200);
    const group = await shell('group-info-overlay');
    expect(group).not.toBeNull();

    // ⚠ "Overview" was a filled --bg-hover row with an 8px radius and 10px of padding —
    // byte-for-byte the shape of the settings nav's SELECTED item two inches to the
    // right. A static heading advertising itself as a control.
    const overview = await page.evaluate(() => {
      const el = document.querySelector('#group-info-overlay .gi-label');
      if (!el) return null;
      return { text: el.textContent.trim(), bg: getComputedStyle(el).backgroundColor, cls: el.className };
    });
    expect(overview).not.toBeNull();
    expect(overview.text).toBe('Overview');
    expect(overview.bg).toBe('rgba(0, 0, 0, 0)');

    // ⚠ The switches are the shared control, and they are inside a COLLAPSED section —
    // measured closed, the track is 0x0, which is a hidden element and not a broken one.
    const prefs = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('#group-info-overlay .collapsible-header'));
      const h = heads.find((x) => /Preferences/i.test(x.textContent));
      if (h && h.nextElementSibling && h.nextElementSibling.style.display === 'none') h.click();
      return !!h;
    });
    expect(prefs).toBe(true);
    await page.waitForTimeout(700);
    const sw = await page.evaluate(() => {
      const t = document.querySelector('#group-info-overlay .orbit-switch-track');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return Math.round(r.width) + 'x' + Math.round(r.height);
    });
    expect(sw).toBe('40x22');

    // Now the settings modal, and the two must agree.
    await page.evaluate(() => { document.getElementById('group-info-overlay').remove(); window.SettingsModal.open(); });
    await page.waitForTimeout(1200);
    const settings = await shell('settings-overlay');
    expect(settings).not.toBeNull();
    expect(group.radius).toBe(settings.radius);
    expect(group.railPadding).toBe(settings.railPadding);
    expect(group.railH2).toBe(settings.railH2);
    expect(group.contentPadding).toBe(settings.contentPadding);
    expect(group.contentH3).toBe(settings.contentH3);
    // And the value is the softer one, not the 12px both shipped with.
    expect(group.radius).toBe('18px');
    expect(group.railPadding).toBe('20px 16px');
    expect(group.railH2).toBe('14px');
    expect(group.contentH3).toBe('19px');

    await page.evaluate(() => window.SettingsModal.close());
    await page.waitForTimeout(500);
  });

  test('the settings nav collapses to icons — and only in the redesign', async () => {
    // ⚠ A REDESIGN-ONLY FEATURE. The class is applied either way; every rule that acts
    // on it lives in the layer, so with the layer off it is inert and the rail is
    // always the full 240px. This asserts BOTH halves — a control that visibly does
    // nothing in the classic look is worse than one that is not there.
    const nav = () => page.evaluate(() => {
      const ov = document.getElementById('settings-overlay');
      if (!ov) return null;
      const rail = ov.firstElementChild.children[0];
      const btn = document.getElementById('settings-nav-toggle');
      const tab = ov.querySelector('.settings-tab');
      const label = tab ? tab.querySelector('span') : null;
      const closeSpan = document.querySelector('#btn-close-settings > span');
      const closeSvg = document.querySelector('#btn-close-settings svg');
      const vis = (el) => !!el && getComputedStyle(el).display !== 'none';
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return Math.round(r.width) + 'x' + Math.round(r.height);
      };
      return {
        collapsed: ov.classList.contains('nav-collapsed'),
        railW: Math.round(rail.getBoundingClientRect().width),
        toggleVisible: vis(btn),
        toggleBox: box(btn),
        toggleTitle: btn ? btn.title : null,
        // ⚠ The glyph, not just "has an svg" — the icon is swapped by re-emitting it.
        // ⚠ lucide leaves BOTH classes on the svg: `lucide lucide-chevrons-left`. The
        // first version of this stripped the first `lucide ` and left `lucide-` on the
        // front, so it compared against a name that was never going to match.
        toggleIcon: (() => {
          const svg = btn && btn.querySelector('svg');
          if (!svg) return null;
          const c = Array.from(svg.classList).find((x) => x.startsWith('lucide-'));
          return c ? c.slice('lucide-'.length) : null;
        })(),
        labelShown: vis(label),
        tabBox: box(tab),
        closeWord: vis(closeSpan),
        closeGlyph: vis(closeSvg),
        saved: (window.orbitAPI.storeGet('settings') || {}).settingsNavCollapsed,
        inStore: window.store.getState().settings.settingsNavCollapsed
      };
    });

    await page.click('#btn-nav-settings');
    await page.waitForTimeout(1000);
    const open = await nav();
    expect(open.collapsed).toBe(false);
    expect(open.railW).toBe(240);
    expect(open.toggleVisible).toBe(true);
    expect(open.toggleIcon).toBe('chevrons-left');
    expect(open.labelShown).toBe(true);
    expect(open.closeWord).toBe(true);
    // The word, not the glyph — the expanded rail keeps what it always said.
    expect(open.closeGlyph).toBe(false);

    await page.evaluate(() => document.getElementById('settings-nav-toggle').click());
    await page.waitForTimeout(800);
    const shut = await nav();
    expect(shut.collapsed).toBe(true);
    // 64px, so the icons have a rail of their own and the content pane takes the rest.
    expect(shut.railW).toBe(64);
    expect(shut.labelShown).toBe(false);
    // ⚠ Centred, not left-aligned against a 64px box.
    expect(shut.tabBox).toBe('39x34');
    // The control stays, with the opposite glyph and a title that says what it does.
    expect(shut.toggleVisible).toBe(true);
    expect(shut.toggleIcon).toBe('chevrons-right');
    expect(shut.toggleTitle).toBe('Show labels');
    // "Close" is 40px of text and the rail is 64px wide.
    expect(shut.closeWord).toBe(false);
    expect(shut.closeGlyph).toBe(true);
    // ⚠ BOTH stores, and the store state — persisting without moving the store is how
    // the gallery's view mode came to be silently reverted by its own subscription.
    expect(shut.saved).toBe(true);
    expect(shut.inStore).toBe(true);

    // The nav still works collapsed.
    await page.evaluate(() => document.querySelector('.settings-tab[data-tab="notifications"]').click());
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => {
      const a = document.querySelector('.settings-tab.active');
      return a ? a.dataset.tab : null;
    })).toBe('notifications');
    expect(await page.evaluate(() => document.getElementById('settings-overlay').classList.contains('nav-collapsed'))).toBe(true);

    // ── And with the layer OFF, there is no control and the rail is untouched ────
    await page.evaluate(() => { window.SettingsModal.close(); window.OrbitRedesign.apply(false); });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.SettingsModal.open());
    await page.waitForTimeout(1000);
    const classic = await nav();
    expect(classic.collapsed).toBe(false);
    expect(classic.railW).toBe(240);
    expect(classic.toggleVisible).toBe(false);
    expect(classic.labelShown).toBe(true);
    // ⚠ And the glyph is hidden here too — the rule that hides it is in the
    // always-loaded sheet for exactly this reason. In the layer, classic would grow an
    // icon nobody asked for.
    expect(classic.closeGlyph).toBe(false);
    expect(classic.closeWord).toBe(true);

    await page.evaluate(() => { window.SettingsModal.close(); window.OrbitRedesign.apply(true); });
    await page.waitForTimeout(400);
  });

  test('collapsing the settings rail does not repaint the app', async () => {
    // ⚠⚠ DAN: "when opening/closing the navbar of the settings modal it seems to
    // refresh the whole app UI ??? (which it shouldn't cuz it may lag some
    // devices)". It did. The toggle called `store.setState({ settings })`, the
    // app.js subscriber answered with applySettings, and applySettings added
    // `theme-transitioning` — a document-wide `transition: … !important` — for
    // 600ms, rewrote the chat wallpaper, the font size and a dozen root classes,
    // and restarted the offline poller. A rail collapse is not an app-wide change.
    //
    // ⚠ NEITHER ASSERTION IS ABOUT THE RAIL. Both are observable side effects of
    // applySettings having run, which is the thing that must not happen. The rail
    // assertions come after, because the control still has to work.
    await page.click('#btn-nav-settings');
    await page.waitForTimeout(900);
    const pollerBefore = await page.evaluate(() => window._offlineCheckInterval);
    expect(pollerBefore, 'applySettings runs at boot and owns this interval').toBeTruthy();

    await page.evaluate(() => document.getElementById('settings-nav-toggle').click());
    // IMMEDIATELY — the class lives 600ms, so a later read would miss it.
    const after = await page.evaluate(() => ({
      transitioning: document.documentElement.classList.contains('theme-transitioning'),
      intervalId: window._offlineCheckInterval,
      collapsed: document.getElementById('settings-overlay').classList.contains('nav-collapsed'),
      inStore: window.store.getState().settings.settingsNavCollapsed,
      saved: (window.orbitAPI.storeGet('settings') || {}).settingsNavCollapsed
    }));

    expect(after.transitioning, 'the whole window must not start transitioning').toBe(false);
    expect(after.intervalId, 'applySettings must not have run at all').toBe(pollerBefore);

    // ...and the thing the control actually does still happens, in BOTH stores.
    expect(after.collapsed).toBe(true);
    expect(after.inStore).toBe(true);
    expect(after.saved).toBe(true);

    await page.evaluate(() => window.SettingsModal.close());
    await page.waitForTimeout(300);
  });

  test('the context menu stays open long enough to use it', async () => {
    // ⚠⚠ IT CLOSED ITSELF AFTER 1.5 SECONDS. `show()` set a timer — "so cursor doesn't
    // block buttons" — and the message menu pushes six or more items, so you had a
    // second and a half to read the list and hit one. Measured before the fix: visible
    // at 600ms, GONE BY 1200ms.
    //
    // ⚠ It was never needed. All seven call sites are click-driven — a `contextmenu`
    // event or a button click, never a hover — and a click anywhere outside already
    // closed it through the document listener. Nothing could be blocked.
    const show = () => page.evaluate(() => window.ContextMenu.show(140, 150, [
      { label: 'Reply', icon: 'reply', onClick: function () {} },
      { label: 'Copy Text', icon: 'copy', onClick: function () {} },
      'separator',
      { label: 'Pin Message', icon: 'pin', onClick: function () {} },
      { label: 'Delete Message', icon: 'trash-2', color: 'var(--accent-danger)', onClick: function () {} }
    ]));
    const visible = () => page.evaluate(() => {
      const c = document.getElementById('context-menu-container');
      return c ? getComputedStyle(c).display !== 'none' : null;
    });

    await show();
    // ⚠ Well past the old 1500ms timer.
    await page.waitForTimeout(2600);
    expect(await visible()).toBe(true);

    const parts = await page.evaluate(() => {
      const c = document.getElementById('context-menu-container');
      const items = Array.from(c.querySelectorAll('.context-item'));
      const danger = items.find((b) => /Delete/.test(b.textContent));
      const normal = items.find((b) => /Reply/.test(b.textContent));
      const sep = c.querySelector('.context-menu-sep');
      return {
        itemCount: items.length,
        // ⚠ The separator is a CLASS now. It was an inline `height:1px;background:…`
        // div, which no stylesheet can see — and §9 of the layer had a rule for
        // `.context-menu-item`, a name one word out from the `context-item` the
        // element actually carries.
        separator: !!sep,
        sepHeight: sep ? Math.round(sep.getBoundingClientRect().height) : null,
        dangerColor: danger ? getComputedStyle(danger).color : null,
        normalColor: normal ? getComputedStyle(normal).color : null,
        // ⚠ The hover handlers are gone; this is the stylesheet's, and it must not
        // touch the colour or a danger item would lose its red on hover.
        hoverRule: !!Array.from(document.styleSheets).some((s) => {
          try { return Array.from(s.cssRules || []).some((r) => r.selectorText === '.context-item:hover'); }
          catch (e) { return false; }
        })
      };
    });
    expect(parts.itemCount).toBe(4);
    expect(parts.separator).toBe(true);
    expect(parts.sepHeight).toBe(1);
    // The caller's danger colour survives, and a normal item is the primary text.
    expect(parts.dangerColor).toBe('rgb(255, 69, 58)');
    expect(parts.normalColor).not.toBe(parts.dangerColor);
    expect(parts.hoverRule).toBe(true);

    // ⚠ Escape closes it — it never did.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await visible()).toBe(false);

    // And a click outside still does.
    await show();
    await page.waitForTimeout(300);
    expect(await visible()).toBe(true);
    await page.mouse.click(700, 500);
    await page.waitForTimeout(400);
    expect(await visible()).toBe(false);
  });

  test('the modal search fields carry no permanent focus halo', async () => {
    // ⚠⚠ THEY AUTOFOCUS, SO THE GLOBAL HALO IS ON SCREEN FROM THE MOMENT THE MODAL
    // OPENS AND NEVER GOES AWAY — a solid blue rounded box drawn around the field,
    // which reads as decoration rather than as "you are here". The halo itself is
    // right; on a field the APP focused, it says nothing.
    //
    // ⚠ And it is scoped, not a blanket `outline: none`: every other field keeps the
    // halo, because for those the USER put the focus there and the halo is the only
    // thing that says so. The second half of this test is that scoping.
    await page.evaluate(() => window.ChatPanel.showSearchModal());
    await page.waitForTimeout(1200);

    const read = () => page.evaluate(() => {
      const input = document.getElementById('search-modal-input');
      const filter = document.getElementById('search-filter-from');
      // Focus each in turn and read what it paints.
      filter.focus();
      const filterShadow = getComputedStyle(filter).boxShadow;
      input.focus();
      const inputShadow = getComputedStyle(input).boxShadow;
      return {
        inputShadow,
        inputOutline: getComputedStyle(input).outlineStyle,
        filterShadow,
        // ⚠ And it really is focused — "no ring" must not be passing because nothing
        // has focus at all.
        inputIsActive: document.activeElement === input
      };
    });

    const r = await read();
    expect(r.inputIsActive).toBe(true);
    expect(r.inputShadow).toBe('none');
    expect(r.inputOutline).toBe('none');
    // ⚠ The halo is still defined — this is a scoped suppression, not a deletion. A
    // filter field the user tabbed into still shows it.
    expect(r.filterShadow).not.toBe('none');
    expect(r.filterShadow).toMatch(/0px 0px 0px 2px/);

    // The forward modal's search is the same autofocused field, so it gets the same.
    await page.evaluate(() => {
      document.querySelector('.search-modal-overlay').remove();
    });
    await page.waitForTimeout(300);
    const forward = await page.evaluate(() => {
      const el = document.getElementById('forward-search-input');
      if (!el) return null;
      el.focus();
      return { shadow: getComputedStyle(el).boxShadow, active: document.activeElement === el };
    });
    // Only assert if that modal is reachable from here; if it is not, the id simply
    // has no element and there is nothing to check.
    if (forward) {
      expect(forward.active).toBe(true);
      expect(forward.shadow).toBe('none');
    }
  });

  test('every panel takes its corner from the ladder, in both UIs', async () => {
    // ⚠⚠ THE PANEL RADIUS WAS 12, 14, 16 AND 18 FOR THE SAME JOB. Nine surfaces, four
    // values, none of them chosen together — the kind of thing that makes an app feel
    // unfinished without anyone being able to name why. Measured before: settings 12,
    // account switcher 16, emoji picker 14, search modal 16, pinned modal 14.
    //
    // ⚠ The fix is the token, not one number. `--radius-lg` is 18px in the redesign and
    // 16px in classic, so a surface that uses it follows whichever UI it is drawn in.
    // A literal cannot: it pins the panel to one look and the other mode inherits a
    // value nobody chose.
    const radii = () => page.evaluate(() => {
      const r = (sel) => {
        const el = document.querySelector(sel);
        return el ? getComputedStyle(el).borderRadius : null;
      };
      return {
        tokenLg: getComputedStyle(document.documentElement).getPropertyValue('--radius-lg').trim(),
        settings: r('#settings-overlay > div'),
        accountSwitcher: r('#account-switcher-panel'),
        emojiPicker: r('#emoji-picker-container'),
        searchModal: r('.search-modal-overlay > div'),
        // ⚠ The one that is NOT lg, and deliberately: a small transient menu is a `md`.
        contextMenu: r('#context-menu-container')
      };
    });

    const open = () => page.evaluate(() => {
      window.SettingsModal.open();
      window.AccountSwitcher.open();
      window.EmojiPicker.open();
      window.ChatPanel.showSearchModal();
      window.ContextMenu.show(300, 300, [{ label: 'x', icon: 'x', onClick: function () {} }]);
    });
    const shut = () => page.evaluate(() => {
      try { window.SettingsModal.close(); } catch (e) {}
      try { window.AccountSwitcher.close(); } catch (e) {}
      try { window.EmojiPicker.close(); } catch (e) {}
      try { window.ContextMenu.close(); } catch (e) {}
      const sm = document.querySelector('.search-modal-overlay');
      if (sm) sm.remove();
    });

    await open();
    await page.waitForTimeout(1400);
    const re = await radii();
    expect(re.tokenLg).toBe('18px');
    for (const k of ['settings', 'accountSwitcher', 'emojiPicker', 'searchModal']) {
      expect(re[k]).toBe(re.tokenLg);
    }
    // A menu is a `md`, and that is a choice — not an accident of which file it lives in.
    expect(re.contextMenu).toBe('12px');

    // ⚠ And the CLASSIC look follows its own ladder rather than inheriting the
    // redesign's numbers. 16px there, 18 here — same rule, different token.
    await shut();
    await page.evaluate(() => window.OrbitRedesign.apply(false));
    await page.waitForTimeout(500);
    await open();
    await page.waitForTimeout(1400);
    const classic = await radii();
    expect(classic.tokenLg).toBe('16px');
    for (const k of ['settings', 'accountSwitcher', 'emojiPicker', 'searchModal']) {
      expect(classic[k]).toBe('16px');
    }
    expect(classic.contextMenu).toBe('10px');

    await shut();
    await page.evaluate(() => window.OrbitRedesign.apply(true));
    await page.waitForTimeout(400);
  });

  test('the settings nav keeps its icons across a re-render', async () => {
    // ⚠⚠ THE ICONS ONLY APPEARED ON FIRST LOAD, BY ACCIDENT. `SettingsModal.render()`
    // writes `<i data-lucide="…">` into the rail and then called only `attachEvents()`;
    // all EIGHT `createIcons` calls in that file are scoped to `#settings-content`, so
    // nothing in the file ever converted the RAIL. They showed up on boot only because
    // app.js runs a global `lucide.createIcons()` that happens to sweep the DOM at that
    // moment.
    //
    // ⚠ So ANY re-render lost them, and the experimental-features toggle is a
    // re-render: turning it on made the Security item appear and every OTHER icon
    // vanish. Reported as "the security doesn't have an icon" — measured, ALL EIGHT
    // lose theirs. The item that just appeared is the one that looks guilty.
    const icons = () => page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.settings-tab'));
      return {
        count: tabs.length,
        // ⚠ An <i> lucide never converted stays an <i>, so this is the honest test.
        missing: tabs.filter((t) => !t.querySelector('svg')).map((t) => t.dataset.tab),
        unconverted: tabs.filter((t) => t.querySelector('i[data-lucide]')).map((t) => t.dataset.tab),
        sizes: [...new Set(tabs.map((t) => {
          const s = t.querySelector('svg');
          return s ? Math.round(s.getBoundingClientRect().width) + 'x' + Math.round(s.getBoundingClientRect().height) : 'none';
        }))]
      };
    });

    await page.evaluate(() => window.SettingsModal.open());
    await page.waitForTimeout(1200);
    const before = await icons();
    expect(before.count).toBe(7);
    expect(before.missing).toEqual([]);

    // The exact thing the Advanced tab's toggle does.
    await page.evaluate(() => {
      const s = window.store.getState().settings;
      window.store.setState({ settings: { ...s, enableExperimental: true } });
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.SettingsModal.render());
    await page.waitForTimeout(1200);

    const after = await icons();
    // The Security item is new, and it must bring an icon with it…
    expect(after.count).toBe(8);
    expect(after.missing).toEqual([]);
    expect(after.unconverted).toEqual([]);
    // …and the seven that were already there must still have theirs.
    expect(after.sizes).toEqual(['16x16']);

    await page.evaluate(() => {
      const s = window.store.getState().settings;
      window.store.setState({ settings: { ...s, enableExperimental: false } });
      window.SettingsModal.render();
      window.SettingsModal.close();
    });
    await page.waitForTimeout(900);
  });

  test('the nav icons are a redesign addition — classic has none', async () => {
    // ⚠ Dan's call: "in classic mode the settings navbar options shouldn't have icons
    // (only in the redesign*)". The original classic nav was plain text, so the icons are
    // a redesign feature and the HIDING has to live in the sheet both UIs load — the
    // layer only reveals them. Written the other way round, classic grows an icon column
    // nobody asked for.
    //
    // ⚠ `display: none` and not `opacity: 0`: a hidden flex item leaves layout entirely,
    // so the row's `gap` does not leave a 10px hole in front of every label.
    const read = () => page.evaluate(() => {
      const tab = document.querySelector('.settings-tab');
      if (!tab) return null;
      const svg = tab.querySelector('svg');
      const span = tab.querySelector('span');
      return {
        iconDisplay: svg ? getComputedStyle(svg).display : 'no-svg',
        iconWidth: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
        // Where the label starts relative to the row's own left edge.
        labelInset: span ? Math.round(span.getBoundingClientRect().left - tab.getBoundingClientRect().left) : null
      };
    });

    await page.evaluate(() => window.SettingsModal.open());
    await page.waitForTimeout(1200);
    const re = await read();
    expect(re.iconDisplay).toBe('block');
    expect(re.iconWidth).toBe(16);
    // padding 12 + icon 16 + gap 10.
    expect(re.labelInset).toBe(38);

    await page.evaluate(() => { window.SettingsModal.close(); window.OrbitRedesign.apply(false); });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.SettingsModal.open());
    await page.waitForTimeout(1200);
    const classic = await read();
    expect(classic.iconDisplay).toBe('none');
    expect(classic.iconWidth).toBe(0);
    // ⚠ The label sits at the row's own 16px padding — no leftover gap from the icon it
    // no longer has. That is what makes classic identical to what it was.
    expect(classic.labelInset).toBe(16);

    await page.evaluate(() => { window.SettingsModal.close(); window.OrbitRedesign.apply(true); });
    await page.waitForTimeout(400);
  });

  test('a side panel does not cover the chat controls', async () => {
    // ⚠⚠ THIS IS WHY THE CHAT HEADER'S ⋮ LOOKED DEAD. `#panel-gallery` (340px) and
    // `#panel-profile` (320px) are `position: absolute; right: 0` inside `#panel-right`,
    // so they sat ON the conversation. Measured with the gallery open, that covered
    // THREE controls: the header's `#btn-chat-more`, `#btn-gallery` — the button that had
    // just opened it — and **`#btn-send` in the composer**. Clicking where the ⋮ is
    // landed on the panel's close button instead, so the menu never appeared.
    //
    // ⚠ `elementFromPoint` at each control's centre is the test, not a rect comparison:
    // a control can be in the layout and still be underneath something.
    const cover = () => page.evaluate(() => {
      const out = {};
      for (const id of ['#btn-chat-more', '#btn-send', '#btn-gallery']) {
        const el = document.querySelector(id);
        if (!el) { out[id] = 'absent'; continue; }
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        out[id] = (top && top !== el && !el.contains(top)) ? 'covered' : 'clear';
      }
      const chat = document.getElementById('chat-container');
      const gal = document.getElementById('panel-gallery');
      out._chatRight = Math.round(chat.getBoundingClientRect().right);
      out._galLeft = gal && getComputedStyle(gal).display !== 'none' ? Math.round(gal.getBoundingClientRect().left) : null;
      return out;
    });

    await page.evaluate(() => window.GallerySidebar.toggle());
    await page.waitForTimeout(1400);
    const open = await cover();
    expect(open['#btn-chat-more']).toBe('clear');
    expect(open['#btn-send']).toBe('clear');
    expect(open['#btn-gallery']).toBe('clear');
    // ⚠ And the chat really did give up the space — its right edge is the panel's left
    // edge, not the window's.
    expect(open._galLeft).not.toBeNull();
    expect(open._chatRight).toBeLessThanOrEqual(open._galLeft + 1);

    // The button works, which is the whole point of the fix.
    await page.click('#btn-chat-more');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => {
      const c = document.getElementById('context-menu-container');
      return c ? getComputedStyle(c).display : null;
    })).toBe('flex');
    await page.evaluate(() => window.ContextMenu.close());

    // ⚠ And the space comes back. The panel closes on a 170ms timer, so the reservation
    // is released in that timer — assert after it, not before.
    await page.evaluate(() => window.GallerySidebar.toggle());
    await page.waitForTimeout(900);
    const shut = await cover();
    expect(shut._galLeft).toBeNull();
    expect(shut['#btn-chat-more']).toBe('clear');
    // Back to the full width of the panel-right.
    expect(await page.evaluate(() => {
      const chat = document.getElementById('chat-container');
      const right = document.getElementById('panel-right');
      return Math.abs(chat.getBoundingClientRect().right - right.getBoundingClientRect().right) < 2;
    })).toBe(true);
  });

  test('the global gallery is styled in classic too, not just the layer', async () => {
    // ⚠⚠ EVERY ONE OF THE GALLERY'S 15 STRUCTURAL CLASSES WAS STYLED ONLY IN THE LAYER,
    // so with the layer off — the original UI — the whole gallery rendered as bare HTML.
    // The filter row came out as six unstyled <button>s with no padding and no gap, which
    // reads as ONE RUN-ON WORD: "AllImagesFilesAllChatsOrbit EchoD4niel-dev". That is
    // Dan's screenshot.
    //
    // ⚠ This is the fourth time the same shape has come up — the settings nav's base, the
    // context menu, the close button's glyph. **Anything the renderer needs in BOTH UIs
    // has to live in a sheet that always loads.** The gallery's styling is now in
    // components.css; the layer keeps only what genuinely differs.
    const chips = () => page.evaluate(() => {
      const row = document.querySelector('.gal-filters');
      if (!row) return null;
      const all = Array.from(row.querySelectorAll('.gallery-type-filter, .gallery-filter-btn'));
      if (!all.length) return null;
      const first = all[0];
      const cs = getComputedStyle(first);
      return {
        count: all.length,
        // An unstyled <button> has `padding: 1px 6px`, `border-radius: 0` and no gap.
        padding: cs.padding,
        radius: cs.borderRadius,
        borderWidth: cs.borderTopWidth,
        rowGap: getComputedStyle(row).gap,
        gapBetween: all.length > 1
          ? Math.round(all[1].getBoundingClientRect().left - first.getBoundingClientRect().right)
          : null
      };
    });

    // ⚠ The type chips only render when there is media to filter, so the test has to
    // seed some — otherwise there is one chip and the run-on bug cannot even appear.
    await page.evaluate(() => {
      const st = window.store.getState();
      const att = (id, name, type, size, chatId) => ({
        id, name, type, size, chatId, msgId: 'm-' + id,
        url: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#4D7CFE"/></svg>'),
        timestamp: Date.now() - id * 3600000
      });
      window.store.setState({
        messages: Object.assign({}, st.messages, {
          'local-echo': [{ id: 'm-1', text: 'media', sender: 'local-echo', timestamp: new Date().toISOString(), mine: false, read: true, attachments: [att(1, 'clip.mp4', 'video', 5242880, 'local-echo')] }],
          'u-kai': [{ id: 'm-2', text: 'song', sender: 'u-kai', timestamp: new Date().toISOString(), mine: false, read: true, attachments: [att(2, 'track.mp3', 'audio', 3145728, 'u-kai')] }]
        })
      });
    });
    await page.waitForTimeout(1200);

    await page.evaluate(() => { const b = document.getElementById('btn-nav-gallery'); if (b) b.click(); });
    await page.waitForTimeout(1500);
    const re = await chips();
    expect(re).not.toBeNull();
    // ⚠ More than one, or the run-on bug this guards against is not reachable.
    expect(re.count).toBeGreaterThan(1);
    // Redesign: pill-shaped chips with tighter padding and gap.
    expect(re.padding).toBe('4px 10px');
    expect(re.radius).toBe('999px');
    expect(re.rowGap).toBe('6px');
    expect(re.gapBetween).toBeGreaterThan(0);

    // Classic keeps its own look — base values from components.css.
    await page.evaluate(() => window.OrbitRedesign.apply(false));
    await page.waitForTimeout(700);
    const classic = await chips();
    expect(classic.padding).toBe('4px 12px');
    expect(classic.radius).toBe('12px');
    expect(classic.rowGap).toBe('8px');
    expect(classic.gapBetween).toBeGreaterThan(0);

    await page.evaluate(() => { const b = document.getElementById('btn-nav-dms'); if (b) b.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.OrbitRedesign.apply(true));
    await page.waitForTimeout(400);
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

// ⚠⚠ OUTSIDE THE DESCRIBE, DELIBERATELY. The block above launches an app in
// beforeEach, and this test manages its own two launches — the whole point is that
// it closes the app and brings it back. Sitting inside would give it a second,
// unused instance and fight the teardown.
//
// ⚠⚠ THIS IS THE ONE PART THE TESTS ABOVE CANNOT COVER. They stub the restart,
// because the preload bridge is frozen — assigning to orbitAPI.relaunchApp silently
// does nothing — so a real click on "Restart now" would relaunch Electron for real
// and leak a process. The round trip therefore lives here: save the choice exactly
// as the toggle does, close, come back up, and check the app is the beta.
test('the new look survives a relaunch, and is applied before the first paint', async () => {
  const userDataDir = tmpUserDataDir('new-look');

  const read = (p) => p.evaluate(() => ({
    layerOn: !document.getElementById('redesign-css').disabled,
    iconBtn: getComputedStyle(document.documentElement).getPropertyValue('--icon-btn').trim() || '',
    searchRadius: (() => {
      const e = document.querySelector('.search-input-wrapper');
      return e ? getComputedStyle(e).borderRadius : null;
    })()
  }));

  // ⚠ Launch #1 is the ORIGINAL UI, unseeded. The redesign is opt-in, so this is
  // what a fresh profile gets — and asserting it here is what makes the second
  // launch a real round trip rather than a no-op.
  let { app, page } = await launchApp(userDataDir);
  const before = await read(page);
  expect(before.layerOn).toBe(false);
  expect(before.iconBtn).toBe('');
  expect(before.searchRadius).not.toBe('34px');

  // ⚠ Save it through commitLook with ONLY the restart stubbed, so the writes
  // under test are the real ones — both stores, exactly as production does them.
  await page.evaluate(() => {
    window.__restarts = 0;
    window.OrbitRedesign.requestRestart = function () { window.__restarts += 1; return true; };
    window.OrbitRedesign.commitLook(true);
  });
  expect(await page.evaluate(() => window.__restarts)).toBe(1);
  await app.close();

  // Launch #2 — same data dir. The beta, with no correction after boot.
  ({ app, page } = await launchApp(userDataDir));
  const after = await read(page);
  expect(after.layerOn).toBe(true);
  expect(after.iconBtn).toBe('32px');
  // And it is the value the app BOOTED with, not one it fixed up later.
  expect(await page.evaluate(() => window.store.getState().settings.newUI)).toBe(true);
  await app.close();

  // ⚠ And the anti-flash mechanism is pinned STRUCTURALLY, because the difference
  // between "applied before the first paint" and "applied a moment after" is not
  // observable from the outside once the app is up. The inline script has to sit
  // after the <link> it disables and before the app's own scripts, and it has to read
  // the preference through the synchronous bridge — moving it into app.js would leave
  // the behaviour identical and the flash back.
  const html = fs.readFileSync(path.join(__dirname, '../../src/index.html'), 'utf8');
  const linkAt = html.indexOf('id="redesign-css"');
  const scriptAt = html.indexOf("storeGet('settings')");
  const firstSrcAt = html.indexOf('<script src=');
  expect(linkAt).toBeGreaterThan(-1);
  expect(scriptAt).toBeGreaterThan(linkAt);
  expect(scriptAt).toBeLessThan(firstSrcAt);
  expect(html).toContain("settings.newUI !== true");
});
