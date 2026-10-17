// E2E: message markdown — the @mention pass must not reach inside a URL.
//
// ⚠ THE BUG THIS EXISTS FOR SHIPPED, AND IT LOOKED CATASTROPHIC: Dan sent
// `https://suno.com/@d4studio#page=songs` and the desktop rendered the link as
// visible scrambled markup instead of a link. The desktop carried its OWN copy of
// the sanitiser, whose mention pattern was an unanchored `/@(\w+)/g` — so `@d4studio`
// matched INSIDE the href and inside the already-escaped attributes, and a
// `<span class="chat-mention">` was injected into the middle of the URL. The
// anchor collapsed and its markup spilled onto the screen.
//
// The mobile's pattern was already right — `/(^|\s)@(\w{2,})/g`, i.e. an @ only
// counts at a word boundary — and the fix was to stop forking the file: the
// desktop now loads the shared `shared/utils/sanitize.js`. That is the reason
// this spec asserts BOTH directions. Disabling mentions entirely would also have
// made the scrambled link go away, so a test that only checks the URL would pass
// on a broken app.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

const CASES = [
  {
    name: 'a URL that contains an @handle keeps an intact href and no injected markup',
    text: 'listen: https://suno.com/@d4studio#page=songs ok',
    anchors: 1,
    href: 'https://suno.com/@d4studio#page=songs',
    mentions: 0
  },
  {
    name: 'a markdown link to the same URL is untouched',
    text: '[track](https://suno.com/@d4studio#page=songs)',
    anchors: 1,
    href: 'https://suno.com/@d4studio#page=songs',
    mentions: 0
  },
  {
    name: 'a real mention still renders',
    text: 'hey @d4studio look',
    anchors: 0,
    href: null,
    mentions: 1
  },
  {
    name: 'a URL and a real mention in one message both come out right',
    text: 'https://x.com/@abc yep @realuser',
    anchors: 1,
    href: 'https://x.com/@abc',
    mentions: 1
  },
  {
    name: 'an email address is not turned into a mention',
    text: 'mail me at bob@example.com',
    anchors: 0,
    href: null,
    mentions: 0
  }
];

test.describe('message markdown', () => {
  test('the @mention pass never reaches inside a URL', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('markdown'), [], { keepBootState: true });
    try {
      const out = await page.evaluate((cases) => {
        return cases.map((c) => {
          const html = window.Sanitize.markdown(c.text);
          const host = document.createElement('div');
          host.innerHTML = html;
          const a = host.querySelector('a');
          return {
            name: c.name,
            anchors: host.querySelectorAll('a').length,
            href: a ? a.getAttribute('href') : null,
            // ⚠ The signature of the bug: markup inside the attribute value.
            hrefHasMarkup: a ? /[<>]/.test(a.getAttribute('href') || '') : false,
            spansInsideAnchor: a ? a.querySelectorAll('span').length : 0,
            mentions: host.querySelectorAll('span.chat-mention').length
          };
        });
      }, CASES);

      out.forEach((r, i) => {
        const c = CASES[i];
        expect(r.hrefHasMarkup, r.name + ': markup leaked into the href').toBe(false);
        expect(r.spansInsideAnchor, r.name + ': a span was injected into the anchor').toBe(0);
        expect(r.anchors, r.name + ': anchor count').toBe(c.anchors);
        expect(r.href, r.name + ': href').toBe(c.href);
        expect(r.mentions, r.name + ': mention count').toBe(c.mentions);
      });

      // ⚠ NON-VACUITY. The whole point is that mentions are NOT simply switched
      // off, so require that at least one case produced one.
      expect(out.some((r) => r.mentions > 0), 'mentions must still work at all').toBe(true);
    } finally {
      await app.close();
    }
  });
});