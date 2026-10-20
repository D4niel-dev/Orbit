// E2E: the emoji picker follows the app's theme.
//
// ⚠⚠ THE BUG: emoji-picker-element knows TWO looks — `.light` and `.dark` — and it
// drives `color-scheme` off them. Orbit has TEN themes, and the picker passed
// `data-theme` straight into the class list, so eight of them handed the library a
// name it has never heard of. With no recognised class it falls back to
// `color-scheme: light`: a WHITE scrollbar, caret and text selection inside a
// near-black panel — the only light-scheme surface in the app.
//
// The colours looked correct, which is why this survived so long: components.css
// bridges the library's custom properties onto our tokens, so backgrounds and text
// always matched. `color-scheme` was the part nothing covered, and it only shows up
// in NATIVE chrome — scrollbar, caret, selection, focus ring — none of which a
// token can reach.
//
// It also accumulated: only `light`/`dark` were removed before the next name was
// added, so dark → nord → midnight left `nord midnight` on the element.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

// Every value `data-theme` can hold (app.js maps `seasonal` to the four below).
const THEMES = [
  'dark', 'light', 'dark-purple', 'midnight', 'nord', 'sunset',
  'seasonal-spring', 'seasonal-summer', 'seasonal-fall', 'seasonal-winter'
];

test.describe('emoji picker theming', () => {
  test('every theme gives the library a look it understands', async () => {
    const dir = seedNewUI(tmpUserDataDir('emoji-theme'), true);
    const { app, page } = await launchApp(dir);
    try {
      const res = await page.evaluate(async (themes) => {
        window.EmojiPicker.open();
        const picker = document.querySelector('#emoji-picker-container emoji-picker');
        if (!picker) return { error: 'the picker element was never built' };

        const out = [];
        for (const t of themes) {
          document.documentElement.setAttribute('data-theme', t);
          // open() is the one path into a visible picker, and the one that syncs.
          window.EmojiPicker.open();
          const cs = getComputedStyle(picker);
          out.push({
            theme: t,
            colorScheme: cs.colorScheme,
            classes: [...picker.classList],
            scrollbar: cs.scrollbarColor
          });
        }
        return { out };
      }, THEMES);

      expect(res.error, 'the picker must be built by open()').toBeUndefined();

      for (const r of res.out) {
        // Only `light` is a light surface; the other nine are dark, whatever their hue.
        const want = r.theme === 'light' ? 'light' : 'dark';

        expect(r.colorScheme, r.theme + ': color-scheme must follow the look')
          .toBe(want);

        const looks = r.classes.filter((c) => c === 'light' || c === 'dark');
        expect(looks, r.theme + ': exactly one look class').toEqual([want]);

        // ⚠ The accumulation half. No theme NAME may survive on the element.
        const stale = r.classes.filter((c) => THEMES.includes(c) && c !== 'light' && c !== 'dark');
        expect(stale, r.theme + ': stale theme classes left on the element: [' + r.classes.join(', ') + ']')
          .toEqual([]);

        // The library's scrollbar lives inside its shadow root, where
        // `::-webkit-scrollbar` cannot reach it; `scrollbar-color` inherits, so the
        // declaration on the host is the mechanism. This asserts the declaration
        // landed, which is the part this repo controls.
        expect(r.scrollbar, r.theme + ': the picker scrollbar must not be left to the OS')
          .not.toBe('auto');
      }
    } finally {
      await app.close();
    }
  });
});