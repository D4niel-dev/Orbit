// E2E: the "Classic Bubbles" setting — the desktop's first, borrowed from the mobile.
//
// ⚠ THE MOBILE HAS HAD THIS ROW FOR A WHILE and the desktop never did: "Classic
// Bubbles — Colour your own messages with the accent". Your own bubble is normally
// the same surface as theirs, and the redesign tints it with the accent; this puts
// the solid accent fill back.
//
// ⚠⚠ AND "CLASSIC" IS NOT ONLY A COLOUR. The redesign's bubble is 14px with a 5px
// tail and 9/13 padding; the message box this brings back was 16px with a SQUARE
// tail and 10/14. The first version changed the colour only and produced a hybrid —
// classic blue on a redesign-shaped bubble — which is what Dan photographed and
// called "not how the classic message box of desktop looked".
//
// ⚠ THE RULE LIVES IN components.css, NOT THE LAYER, because the setting has to do
// something in BOTH UIs — the desktop ships both and defaults to the original.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

// The exact inline style the renderer puts on an own bubble (chat-panel.js,
// `bubbleBgMine`). ⚠ Injected rather than relying on a seeded conversation: what
// this setting changes is the SHEET, and the sheet has to win over that inline
// declaration — which is the part worth asserting.
function ownBubble(id, extraClass) {
  return '<div id="' + id + '" class="message-row message-own">' +
    '<div class="message-bubble' + (extraClass ? ' ' + extraClass : '') + '" ' +
    // ⚠ The FULL inline declaration, including the radius and padding — without
    // them the probe measured a 0px radius in classic and could not tell "the
    // inline style won" from "there was no inline style".
    'style="background-color: var(--bg-surface); color: var(--text-primary); ' +
    'padding: 10px 14px; border-radius: 16px 16px 0 16px;">hi</div></div>';
}

async function openAppearance(page) {
  await page.evaluate(() => window.SettingsModal.open());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.settings-tab[data-tab="appearance"]').click());
  await page.waitForTimeout(600);
  // The row lives in the "Chat" section, which is collapsed by default.
  await page.evaluate(() => {
    const headers = [...document.querySelectorAll('#settings-content .collapsible-header')];
    const chat = headers.find((h) => h.textContent.trim().startsWith('Chat'));
    if (chat) chat.click();
  });
  await page.waitForTimeout(400);
}

async function bubble(page, id, extraClass) {
  return page.evaluate(([markup, key]) => {
    if (!document.getElementById(key)) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
    }
    const cs = getComputedStyle(document.querySelector('#' + key + ' .message-bubble'));
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      radius: cs.borderRadius,
      padding: cs.padding,
      attr: document.documentElement.getAttribute('data-classic-bubbles')
    };
  }, [ownBubble(id, extraClass), id]);
}

for (const newUI of [true, false]) {
  const label = newUI ? 'redesign' : 'original UI';

  test('a check mark in Chat, and it restores the classic bubble (' + label + ')', async () => {
    const dir = seedNewUI(tmpUserDataDir('cb-' + (newUI ? 'new' : 'old')), newUI);
    const { app, page } = await launchApp(dir);
    try {
      await openAppearance(page);

      const row = await page.evaluate(() => {
        const input = document.getElementById('set-classic-bubbles');
        if (!input) return { exists: false };
        const labelEl = input.closest('label');
        const section = labelEl.closest('.settings-collapsible');
        return {
          exists: true,
          checked: input.checked,
          type: input.type,
          // ⚠ A CHECK MARK, not the shared `.orbit-switch` — every other row in
          // this section is a checkbox, and a lone toggle among them reads as a
          // different kind of control.
          isSwitch: labelEl.classList.contains('orbit-switch'),
          section: section ? section.querySelector('.collapsible-header').textContent.trim() : null,
          text: labelEl.textContent.replace(/\s+/g, ' ').trim()
        };
      });

      expect(row.exists, 'the row must exist in ' + label).toBe(true);
      expect(row.type).toBe('checkbox');
      expect(row.isSwitch, 'a check mark, not the toggle').toBe(false);
      expect(row.checked, 'off by default').toBe(false);
      // ⚠ The Chat section — not Text & Layout, where it started.
      expect(row.section).toContain('Chat');
      expect(row.text).toContain('Classic Bubbles');
      expect(row.text).toContain('Colour your own messages with the accent');

      const off = await bubble(page, 'probe-own', '');
      expect(off.attr).toBeNull();

      await page.evaluate(() => document.getElementById('set-classic-bubbles').click());
      await page.waitForTimeout(600);

      const on = await bubble(page, 'probe-own', '');
      expect(on.attr, 'the attribute goes on <html>').toBe('true');
      expect(on.bg).not.toBe(off.bg);
      expect(on.color).toBe('rgb(255, 255, 255)');
      // ⚠ The classic geometry, or it is a hybrid.
      expect(on.radius, 'classic radius: a SQUARE tail').toBe('16px 16px 0px');
      expect(on.padding, 'classic padding').toBe('10px 14px');

      // ⚠⚠ A CALL LOG IS A CARD, NOT A MESSAGE BOX. It renders INSIDE the bubble,
      // and filling that with the accent turned it into a solid blue slab with the
      // card's own muted text on top — the "weird look" in the screenshot.
      const card = await bubble(page, 'probe-call', 'has-call-log');
      expect(card.bg, 'a call-log bubble must not be filled with the accent').not.toBe(on.bg);

      // Both stores, so it survives a relaunch and a settings write.
      expect(await page.evaluate(() => window.store.getState().settings.classicBubbles)).toBe(true);
      expect(await page.evaluate(() => (window.orbitAPI.storeGet('settings') || {}).classicBubbles)).toBe(true);

      // And off again.
      await page.evaluate(() => document.getElementById('set-classic-bubbles').click());
      await page.waitForTimeout(600);
      const back = await bubble(page, 'probe-own', '');
      expect(back.attr).toBeNull();
      expect(back.bg).toBe(off.bg);
    } finally {
      await app.close();
    }
  });
}