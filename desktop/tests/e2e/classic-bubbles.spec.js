// E2E: the "Classic Bubbles" setting — the desktop's first, borrowed from the mobile.
//
// ⚠ THE MOBILE HAS HAD THIS ROW FOR A WHILE and the desktop never did: "Classic
// Bubbles — Colour your own messages with the accent". Your own bubble is normally
// the same surface as theirs, and the redesign tints it with the accent; this puts
// the solid accent fill back, which is the look the app had before the redesign.
//
// ⚠ THE RULE LIVES IN components.css, NOT THE LAYER, because the setting has to do
// something in BOTH UIs — the desktop ships both and defaults to the original. That
// is why this spec checks both looks: a setting that silently does nothing in the
// UI you are actually using is worse than no setting.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

// The exact inline style the renderer puts on an own bubble (chat-panel.js,
// `bubbleBgMine`). ⚠ Injected rather than relying on a seeded conversation: what
// this setting changes is the SHEET, and the sheet has to win over that inline
// declaration — which is the part worth asserting.
const OWN_BUBBLE =
  '<div id="probe-own" class="message-row message-own">' +
  '<div class="message-bubble" style="background-color: var(--bg-surface); color: var(--text-primary);">hi</div>' +
  '</div>';

async function openAppearance(page) {
  await page.evaluate(() => window.SettingsModal.open());
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.settings-tab[data-tab="appearance"]').click());
  await page.waitForTimeout(600);
}

async function bubble(page) {
  return page.evaluate((markup) => {
    if (!document.getElementById('probe-own')) {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
    }
    const cs = getComputedStyle(document.querySelector('#probe-own .message-bubble'));
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      attr: document.documentElement.getAttribute('data-classic-bubbles')
    };
  }, OWN_BUBBLE);
}

for (const newUI of [true, false]) {
  const label = newUI ? 'redesign' : 'original UI';

  test('the row exists, defaults off, and fills the accent (' + label + ')', async () => {
    const dir = seedNewUI(tmpUserDataDir('cb-' + (newUI ? 'new' : 'old')), newUI);
    const { app, page } = await launchApp(dir);
    try {
      await openAppearance(page);

      const row = await page.evaluate(() => {
        const input = document.getElementById('set-classic-bubbles');
        if (!input) return { exists: false };
        const rowEl = input.closest('label').parentElement;
        return {
          exists: true,
          checked: input.checked,
          // ⚠ The one shared switch, not a bespoke control.
          isSwitch: input.closest('label').classList.contains('orbit-switch'),
          text: rowEl.textContent.replace(/\s+/g, ' ').trim()
        };
      });

      expect(row.exists, 'the row must exist in ' + label).toBe(true);
      expect(row.checked, 'off by default').toBe(false);
      expect(row.isSwitch).toBe(true);
      expect(row.text).toContain('Classic Bubbles');
      expect(row.text).toContain('Colour your own messages with the accent');

      const off = await bubble(page);
      expect(off.attr).toBeNull();

      await page.evaluate(() => document.getElementById('set-classic-bubbles').closest('label').click());
      await page.waitForTimeout(600);

      const on = await bubble(page);
      expect(on.attr, 'the attribute goes on <html>').toBe('true');
      // The accent fill and white text, over the inline `--bg-surface`.
      expect(on.bg).not.toBe(off.bg);
      expect(on.color).toBe('rgb(255, 255, 255)');
      // Both stores, so it survives a relaunch and a settings write.
      expect(await page.evaluate(() => window.store.getState().settings.classicBubbles)).toBe(true);
      expect(await page.evaluate(() => (window.orbitAPI.storeGet('settings') || {}).classicBubbles)).toBe(true);

      // And off again.
      await page.evaluate(() => document.getElementById('set-classic-bubbles').closest('label').click());
      await page.waitForTimeout(600);
      const back = await bubble(page);
      expect(back.attr).toBeNull();
      expect(back.bg).toBe(off.bg);
    } finally {
      await app.close();
    }
  });
}