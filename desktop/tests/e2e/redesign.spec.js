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
    await page.waitForTimeout(1600);

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
