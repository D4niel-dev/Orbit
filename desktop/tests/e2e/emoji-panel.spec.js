// E2E: the redesign's own emoji panel.
//
// ⚠ WHY IT EXISTS. `emoji-picker-element` renders inside a SHADOW ROOT, so no rule
// of ours could reach it and it floated at a hardcoded `bottom: 80px; right: 40px`
// against the VIEWPORT — a third-party widget in the middle of the composer, never
// attached to the control that opened it. The redesign now draws its own panel and
// hangs it off `.chat-input-wrapper`. Dan: "rather than opening a weird floating
// modal... we make it open a pill that is under the message input box".
//
// ⚠ The data is still the library's — its `Database`, not its UI. That is why the
// interaction test SKIPS when the dataset cannot be fetched: the records come from
// a CDN on first use (then IndexedDB). A skip is honest; a red that says "the
// picker is broken" when the network is down is not.
const path = require('path');
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

async function clickEmojiButton(page) {
  const box = await page.evaluate(() => {
    const b = document.getElementById('btn-emoji').getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  // A REAL pointer click: the composer swaps the button's icon on open, so a
  // synthetic `el.click()` would target a node that no longer exists.
  await page.mouse.click(box.x, box.y);
}

test.describe('redesign emoji panel', () => {
  test('it hangs off the composer instead of floating over the window', async () => {
    const dir = seedNewUI(tmpUserDataDir('epanel-geom'), true);
    const { app, page } = await launchApp(dir);
    try {
      await clickEmojiButton(page);
      await page.waitForTimeout(2200);

      const g = await page.evaluate(() => {
        const p = document.getElementById('emoji-panel');
        const w = document.querySelector('.chat-input-wrapper');
        if (!p || !w) return { error: 'no panel or no wrapper' };
        const pr = p.getBoundingClientRect();
        const wr = w.getBoundingClientRect();
        return {
          parentIsWrapper: p.parentElement === w,
          // ⚠ The panel is positioned from the WRAPPER, not the viewport — that is
          // the difference between "attached" and "floating".
          positioned: getComputedStyle(p).position,
          widthMatches: Math.abs(pr.width - wr.width) <= 2,
          gap: Math.round(wr.top - pr.bottom),
          aboveComposer: pr.bottom <= wr.top,
          // The library element must not be built in the redesign at all.
          libraryElement: !!document.querySelector('#emoji-picker-container emoji-picker'),
          tabs: p.querySelectorAll('.ep-tab').length,
          facadeOpen: window.EmojiPicker.isOpen,
          panelOpen: window.EmojiPanel.isOpen
        };
      });

      expect(g.error).toBeUndefined();
      expect(g.parentIsWrapper, 'the panel must live in the composer, not on <body>').toBe(true);
      expect(g.positioned).toBe('absolute');
      expect(g.widthMatches, 'the panel should be exactly as wide as the composer').toBe(true);
      expect(g.aboveComposer, 'the panel must sit above the composer').toBe(true);
      // 8px, plus the composer's own 1px border.
      expect(g.gap).toBeGreaterThanOrEqual(6);
      expect(g.gap).toBeLessThanOrEqual(10);
      expect(g.libraryElement, 'the redesign must not create the library element').toBe(false);
      expect(g.tabs, 'recents plus nine categories').toBe(10);
      expect(g.panelOpen).toBe(true);
      expect(g.facadeOpen, 'the facade and the panel must agree').toBe(true);

      // ⚠⚠ ONE RING, NOT TWO. The panel focuses the search field on open, and the
      // universal `*:focus-visible:not(.chat-input-field)` rule in the layer is
      // (0,2,0) — it outranks `.ep-search input` (0,1,1) — so it painted its own
      // halo on the <input> INSIDE the pill's ring. Two concentric focus rings on
      // one field; Dan spotted it immediately. The input is excluded by id now.
      const ring = await page.evaluate(() => {
        const input = document.getElementById('ep-search');
        const pill = document.querySelector('.ep-search');
        return {
          focused: document.activeElement === input,
          inputShadow: getComputedStyle(input).boxShadow,
          inputOutline: getComputedStyle(input).outlineStyle,
          pillShadow: getComputedStyle(pill).boxShadow
        };
      });
      expect(ring.focused, 'the field must actually be focused for this to mean anything').toBe(true);
      expect(ring.inputShadow, 'the input must not draw a halo of its own').toBe('none');
      expect(ring.inputOutline).toBe('none');
      expect(ring.pillShadow, 'the pill draws the only ring').not.toBe('none');
    } finally {
      await app.close();
    }
  });

  test('classic still uses the library picker, untouched', async () => {
    const dir = seedNewUI(tmpUserDataDir('epanel-classic'), false);
    const { app, page } = await launchApp(dir);
    try {
      await clickEmojiButton(page);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(() => ({
        panel: !!document.getElementById('emoji-panel'),
        libraryElement: !!document.querySelector('#emoji-picker-container emoji-picker')
      }));
      // ⚠ The panel is only ever built by the redesign's path, so its absence here
      // proves the facade did not delegate.
      expect(r.panel, 'the new panel must not appear in classic').toBe(false);
      expect(r.libraryElement, 'classic must still get the library element').toBe(true);
    } finally {
      await app.close();
    }
  });

  test('it inserts at the caret, searches, and closes on Escape', async () => {
    const dir = seedNewUI(tmpUserDataDir('epanel-use'), true);
    const { app, page } = await launchApp(dir);
    try {
      await clickEmojiButton(page);
      await page.waitForTimeout(2200);

      const loaded = await page.evaluate(() => ({
        count: document.querySelectorAll('#emoji-panel .ep-emoji').length,
        error: document.querySelector('#emoji-panel .ep-empty')
          ? document.querySelector('#emoji-panel .ep-empty').textContent
          : null
      }));
      test.skip(!loaded.count, 'the emoji dataset is unavailable (CDN unreachable): ' + loaded.error);

      // Insert at a caret in the MIDDLE of existing text.
      const inserted = await page.evaluate(() => {
        const input = document.getElementById('chat-input');
        input.focus();
        input.value = 'ab';
        input.setSelectionRange(1, 1);
        window.EmojiPanel.open(input);
        return new Promise((resolve) => setTimeout(() => {
          const btn = document.querySelector('#emoji-panel .ep-emoji');
          const uni = btn.getAttribute('data-unicode');
          btn.click();
          resolve({ uni, value: input.value, caret: input.selectionStart, open: window.EmojiPanel.isOpen });
        }, 300));
      });
      // The emoji must land where the caret was, and the panel must stay open.
      expect(inserted.value).toBe('a' + inserted.uni + 'b');
      expect(inserted.caret).toBe(1 + inserted.uni.length);
      expect(inserted.open, 'picking an emoji must not close the panel').toBe(true);

      // Search
      await page.evaluate(() => {
        const s = document.getElementById('ep-search');
        s.value = 'pizza';
        s.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForTimeout(600);
      const searched = await page.evaluate(() => ({
        count: document.querySelectorAll('#emoji-panel .ep-emoji').length,
        heading: document.querySelector('#emoji-panel .ep-group-title')
          ? document.querySelector('#emoji-panel .ep-group-title').textContent : null
      }));
      expect(searched.count, 'a search must narrow the grid').toBeGreaterThan(0);
      expect(searched.count, 'a search must not return the whole category').toBeLessThan(loaded.count);
      expect(searched.heading).toMatch(/result/);

      // Escape closes BOTH, so the next click opens rather than "closing".
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
      const closed = await page.evaluate(() => ({
        panel: window.EmojiPanel.isOpen, facade: window.EmojiPicker.isOpen,
        hidden: document.getElementById('emoji-panel').hidden
      }));
      expect(closed.panel).toBe(false);
      expect(closed.facade, 'the facade must be told, or the next click does nothing').toBe(false);
      expect(closed.hidden).toBe(true);
    } finally {
      await app.close();
    }
  });

  // ⚠⚠ THE PICKER USED TO REQUIRE THE INTERNET ON FIRST USE. Its data source was a
  // jsDelivr URL, so a fresh install with no network had NO EMOJI AT ALL — the one
  // thing a local-first app cannot afford. The dataset now ships at
  // src/data/emojis.json (1923 records) and the main process serves it from
  // `orbit-emoji://`; see the handler in main.js for why the path is resolved there.
  //
  // ⚠ A FRESH PROFILE IS WHAT MAKES THIS MEANINGFUL. The library caches into
  // IndexedDB, so a reused profile would pass with the network blocked and prove
  // nothing at all.
  test('the dataset is bundled: it loads with the network blocked', async () => {
    const dir = seedNewUI(tmpUserDataDir('epanel-offline'), true);
    const { app, page } = await launchApp(dir);
    const cdn = [];
    try {
      await page.route('**cdn.jsdelivr.net**', (route) => { cdn.push(route.request().url()); route.abort(); });
      page.on('request', (r) => { if (r.url().includes('jsdelivr')) cdn.push(r.url()); });

      await page.evaluate(() => window.EmojiPanel.open(document.getElementById('chat-input')));
      await page.waitForTimeout(3000);

      const r = await page.evaluate(() => {
        const p = document.getElementById('emoji-panel');
        return {
          count: p.querySelectorAll('.ep-emoji').length,
          empty: p.querySelector('.ep-empty') ? p.querySelector('.ep-empty').textContent : null
        };
      });

      expect(r.empty, 'the panel must not fall back to its error state').toBeNull();
      expect(r.count, 'emoji must render from the bundled dataset').toBeGreaterThan(50);
      // ⚠ And nothing may have reached for the network at all — not even a probe.
      expect(cdn, 'the picker must not request the CDN').toEqual([]);
    } finally {
      await app.close();
    }
  });
});