// E2E: reaction pills are styled by the sheets, not inline, and each look gets its own.
//
// ⚠ THE BUG THIS EXISTS FOR IS STRUCTURAL. Every declaration on a reaction pill was
// inline in chat-panel.js — display, gap, padding, radius, background, border,
// font-size, and a hardcoded `color: white` for the "you reacted" count. Inline
// styles cannot be restyled by a stylesheet, so the redesign could not touch a
// control that sits inside the conversation it redesigned. The pill was therefore
// identical in both UIs, and it was the only place in the app where the accent is a
// background for TEXT — a contrast gamble on every theme.
//
// ⚠ AND A TRAP THAT CAME WITH THE MOVE. The sheet carried `.reaction-pill span`
// (0,1,1) for the emoji's font. It also matched the COUNT, which only stayed 11px
// because an inline font-size beat it. Remove the inline style and the count
// silently renders at the emoji's 15px. The selector is now `.reaction-emoji`, and
// this spec asserts the count's size so it cannot come back.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

const PILLS =
  '<div class="reactions-row" id="probe-reactions">' +
  '<div class="reaction-pill"><span class="reaction-emoji">\u{1F44D}</span><span class="reaction-count">2</span></div>' +
  '<div class="reaction-pill is-mine"><span class="reaction-emoji">\u{1F525}</span><span class="reaction-count">1</span></div>' +
  '</div>';

async function read(newUI) {
  const dir = seedNewUI(tmpUserDataDir('reactions-' + (newUI ? 'new' : 'old')), newUI);
  const { app, page } = await launchApp(dir);
  try {
    return await page.evaluate((markup) => {
      const host = document.createElement('div');
      host.innerHTML = markup;
      document.body.appendChild(host);
      const pills = host.querySelectorAll('.reaction-pill');
      const cs = (el) => getComputedStyle(el);
      const out = {
        layerOn: !document.getElementById('redesign-css').disabled,
        radius: cs(pills[0]).borderRadius,
        padTop: cs(pills[0]).paddingTop,
        plainBg: cs(pills[0]).backgroundColor,
        mineBg: cs(pills[1]).backgroundColor,
        mineBorder: cs(pills[1]).borderTopColor,
        countFont: cs(host.querySelector('.reaction-count')).fontSize,
        mineCountColor: cs(pills[1].querySelector('.reaction-count')).color
      };
      host.remove();
      return out;
    }, PILLS);
  } finally {
    await app.close();
  }
}

test.describe('reaction pills', () => {
  test('the look is not inline, and each UI paints its own', async () => {
    // ⚠ Source-level on purpose: the invariant is "no look declarations in the
    // renderer", which no computed style can express — a pill styled inline and a
    // pill styled by a sheet can compute identically.
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/js/views/chat-panel.js'), 'utf8');
    const pillLines = src.split(/\r?\n/).filter((l) => l.includes('reaction-pill'));
    expect(pillLines.length, 'the reaction pill markup must still be in chat-panel.js').toBeGreaterThan(0);
    pillLines.forEach((l) => {
      expect(l, 'a reaction pill must not carry inline look declarations: ' + l.trim()).not.toContain('style=');
    });

    const original = await read(false);
    const redesign = await read(true);
    expect(original.layerOn).toBe(false);
    expect(redesign.layerOn).toBe(true);

    // ⚠ The selector trap, in both looks.
    expect(original.countFont, 'classic: the count must not inherit the emoji font').toBe('11px');
    expect(redesign.countFont, 'redesign: the count must not inherit the emoji font').toBe('11px');

    // Classic keeps the filled accent pill; the redesign tints it instead.
    expect(original.mineBg).toBe(original.mineBorder);
    expect(redesign.mineBg, 'the redesign must not fill with the accent').not.toBe(redesign.mineBorder);

    // And they are genuinely different shapes, not the same rule twice.
    expect(original.radius).not.toBe(redesign.radius);
    expect(original.padTop).not.toBe(redesign.padTop);
  });
});