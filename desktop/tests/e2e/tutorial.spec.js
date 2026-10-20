// E2E: the welcome tour's two targeted steps.
//
// ⚠⚠ STEP 3 DID NOT SHOW WHAT IT DESCRIBED. "File & Image Sharing" is about the input
// area and the upload buttons, and on a fresh install NOTHING IS OPEN — so
// `.chat-input-area` did not exist when the step rendered, the card fell back to dead
// centre with no spotlight, and the composer was not on screen at all. Dan: "we should
// open the bot chat to show the users the input message box and the upload buttons".
//
// ⚠⚠ STEP 7 RANG THE WRONG BOX. "Privacy & Storage" highlighted
// `#privacy-mode-label` — the one-line row holding the checkbox and the title — so the
// ring hugged that row and left the description, the part that explains what the
// setting DOES, outside the highlight. Dan: "we should let the blue outline the full
// box of the setting... not just the check mark button".
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

async function openStep(page, n) {
  await page.evaluate(() => window.TutorialModal.show());
  await page.waitForTimeout(300);
  await page.evaluate((steps) => {
    for (let i = 0; i < steps; i++) window.TutorialModal.next();
  }, n);
}

test.describe('welcome tour', () => {
  test('File & Image Sharing opens a conversation so the composer is on screen', async () => {
    const dir = seedNewUI(tmpUserDataDir('tut-chat'), true);
    const { app, page } = await launchApp(dir);
    try {
      // ⚠⚠ START WHERE A FRESH INSTALL STARTS: NOTHING OPEN. The harness opens the
      // bot chat for its own convenience, so without this the step could do nothing
      // at all and every assertion below would still pass — a vacuous green, which
      // is worse than a red because it buys confidence.
      await page.evaluate(() => window.store.setState({ activeChatId: null }));
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => !!document.querySelector('.chat-input-area')),
        'the test must start with no conversation open').toBe(false);

      await openStep(page, 2);
      await page.waitForTimeout(1100);

      const r = await page.evaluate(() => {
        const t = window.TutorialModal;
        const area = document.querySelector('.chat-input-area');
        const spot = document.querySelector('#tutorial-overlay > div');
        const rb = (el) => el.getBoundingClientRect();
        return {
          title: t.pages[t.currentPage].title,
          activeChatId: window.store.getState().activeChatId,
          hasArea: !!area,
          // ⚠ The two things the step talks about.
          hasPlus: !!document.getElementById('btn-plus'),
          hasEmoji: !!document.getElementById('btn-emoji'),
          hasField: !!document.getElementById('chat-input'),
          highlighted: t._highlightedEl ? String(t._highlightedEl.className) : null,
          spotMatches: !!(area && spot &&
            Math.abs(rb(area).top - rb(spot).top) < 2 &&
            Math.abs(rb(area).height - rb(spot).height) < 2)
        };
      });

      expect(r.title).toBe('File & Image Sharing');
      expect(r.activeChatId, 'the bot chat must be opened by the step').toBe('local-echo');
      expect(r.hasArea, 'the composer must exist').toBe(true);
      expect(r.hasPlus && r.hasEmoji && r.hasField, 'the upload, emoji and text controls must be on screen').toBe(true);
      expect(r.highlighted, 'the input area is what gets highlighted').toContain('chat-input-area');
      // ⚠ The spotlight must land on the thing it describes, not just exist.
      expect(r.spotMatches).toBe(true);
    } finally {
      await app.close();
    }
  });

  test('Privacy & Storage rings the whole card, not the label', async () => {
    const dir = seedNewUI(tmpUserDataDir('tut-privacy'), true);
    const { app, page } = await launchApp(dir);
    try {
      await openStep(page, 6);
      await page.waitForTimeout(1700);

      const r = await page.evaluate(() => {
        const t = window.TutorialModal;
        const hi = t._highlightedEl;
        const card = document.getElementById('privacy-mode-section');
        const label = document.getElementById('privacy-mode-label');
        const h = (el) => el ? Math.round(el.getBoundingClientRect().height) : 0;
        return {
          title: t.pages[t.currentPage].title,
          highlightedId: hi ? hi.id : null,
          outline: hi ? hi.style.outline : '',
          isCard: !!(hi && card && hi === card),
          cardH: h(card),
          labelH: h(label),
          // The description has to be inside the ring, or the ring explains nothing.
          descInside: !!(hi && hi.querySelector && hi.querySelector('p'))
        };
      });

      expect(r.title).toBe('Privacy & Storage');
      expect(r.highlightedId, 'the card, not the label row').toBe('privacy-mode-section');
      expect(r.outline).toContain('accent-primary');
      expect(r.isCard).toBe(true);
      expect(r.descInside, 'the description must be inside the ring').toBe(true);
      // ⚠ Guard against a vacuous pass: if the card were the same box as the label,
      // the id assertion above would prove nothing.
      expect(r.cardH).toBeGreaterThan(r.labelH * 2);
    } finally {
      await app.close();
    }
  });
});