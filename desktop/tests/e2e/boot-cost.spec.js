// E2E: what the app is allowed to fetch on the way up.
//
// ⚠ THE FAILURE THIS GUARDS IS INVISIBLE FROM THE CODE. Prism was loaded as a
// stylesheet and two scripts from cdnjs, none of them deferred, straight in the
// boot path on both platforms — to highlight code blocks most launches never
// show. Nothing looks wrong: the app works, and it works offline too, because a
// failed CDN request is a silent no-op. What it costs is time, and only on the
// one launch where you are watching the splash.
//
// Measured on the mobile page, first contentful paint:
//     CDN reachable      403ms   ->  177ms
//     CDN slow (600ms)  1034ms   ->  309ms
//
// ⚠ ONE EXTERNAL DEPENDENCY IS STILL EXPECTED, AND IT IS NAMED HERE ON PURPOSE.
// The desktop loads its three font families from Google Fonts — a render-blocking
// stylesheet on fonts.googleapis.com, and the .woff2 files it points at on
// fonts.gstatic.com. The mobile bundles the same faces in fonts/*.woff2 and asks
// the network for nothing. So the desktop is the odd one out and this is a known,
// unfixed difference — listed rather than waved through, so a second one cannot
// hide behind it.
const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp } = require('./helpers');

const externalRequests = (page) =>
  page.evaluate(() =>
    performance.getEntriesByType('resource')
      .filter((r) => /^https?:/i.test(r.name))
      .map((r) => r.name)
  );

// ⚠ WAIT FOR THE BOOT TO SETTLE BEFORE LOOKING. The first version of this read
// the resource list the moment the app shell appeared, and PASSED — but only
// because it read too early: run on its own the emoji picker's data fetch had
// not started yet, and in the full suite it had. A green that depends on how
// fast the machine is, is not a green. Wait until the resource count has stopped
// moving.
async function settled(page) {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => performance.getEntriesByType('resource').length);
    if (n === last) return n;
    last = n;
    await page.waitForTimeout(250);
  }
  return last;
}

test.describe('boot cost', () => {
  test('a cold launch fetches nothing but the font stylesheet', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('boot-ext'), [], { keepBootState: true });
    try {
      // It really did boot — the welcome slides are the cold-start surface.
      expect(await page.evaluate(() => !!document.querySelector('.ows-root'))).toBe(true);
      await settled(page);

      const ext = await externalRequests(page);
      const unexpected = ext.filter((u) => !FONT_HOSTS.some((h) => u.indexOf(h) === 0));
      expect(unexpected, 'nothing but fonts may be fetched at boot: ' + unexpected.join(', ')).toEqual([]);

      // And the old culprits specifically, by name.
      const cdn = await page.evaluate(() =>
        performance.getEntriesByType('resource')
          .filter((r) => r.name.indexOf('cdnjs') !== -1).map((r) => r.name)
      );
      expect(cdn, 'no CDN library may sit in the boot path: ' + cdn.join(', ')).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('the emoji picker is not built until it is opened', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('boot-emoji'), [], { keepBootState: true });
    try {
      await settled(page);
      // ⚠ The element is what triggers the dataset fetch, so asserting on the
      // ELEMENT is the same assertion as asserting on the request — and it does
      // not depend on the network being up in CI.
      expect(await page.evaluate(() =>
        !!document.querySelector('#emoji-picker-container emoji-picker')
      )).toBe(false);
      expect(await page.evaluate(() =>
        performance.getEntriesByType('resource').filter((r) => r.name.indexOf('emoji-picker-element-data') !== -1).length
      )).toBe(0);

      // Opening it builds it, once.
      await page.evaluate(() => window.EmojiPicker.open());
      await page.waitForTimeout(600);
      expect(await page.evaluate(() =>
        !!document.querySelector('#emoji-picker-container emoji-picker')
      )).toBe(true);

      // And a second open does not build a second one.
      await page.evaluate(() => { window.EmojiPicker.close(); window.EmojiPicker.open(); });
      await page.waitForTimeout(400);
      expect(await page.evaluate(() =>
        document.querySelectorAll('#emoji-picker-container emoji-picker').length
      )).toBe(1);

      // It still does its job: picking an emoji lands in the composer.
      // A chat has to be open for #chat-input to exist — this spec boots with
      // `keepBootState`, so it does not yet.
      await page.evaluate(() => window.store.setState({ activeChatId: 'local-echo' }));
      await page.waitForSelector('#chat-input', { timeout: 15000 });
      const inserted = await page.evaluate(() => {
        const input = document.getElementById('chat-input');
        const picker = document.querySelector('#emoji-picker-container emoji-picker');
        if (!picker || !input) return null;
        input.value = '';
        window.EmojiPicker.targetInput = input;
        picker.dispatchEvent(new CustomEvent('emoji-click', { detail: { unicode: '\u{1F600}' } }));
        return input.value;
      });
      expect(inserted).toBe('\u{1F600}');
    } finally {
      await app.close();
    }
  });

  test('Prism is fetched only when a message actually has code', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('boot-prism'), [], { keepBootState: true });
    try {
      // Nothing to highlight yet — so nothing was fetched.
      expect(await page.evaluate(() => !!window.Prism)).toBe(false);
      expect(await page.evaluate(() => window.OrbitCodeHighlight.state())).toBe('idle');

      // Put a fenced code block in the feed.
      await page.evaluate(() => {
        const st = window.store.getState();
        window.store.setState({
          activeChatId: 'local-echo',
          messages: Object.assign({}, st.messages, {
            'local-echo': [{
              id: 'code-1',
              text: 'here is some code\n\n```js\nconst x = 1;\nfunction f() { return x; }\n```\n',
              sender: 'local-echo',
              timestamp: new Date().toISOString(),
              mine: false,
              read: true
            }]
          })
        });
      });
      await page.waitForSelector('#chat-message-feed pre code', { timeout: 15000 });

      // Now it is worth loading, and it did.
      await expect.poll(() => page.evaluate(() => window.OrbitCodeHighlight.state()), { timeout: 20000 })
        .toBe('ready');
      expect(await page.evaluate(() => !!window.Prism)).toBe(true);

      // ⚠ And it actually highlighted, rather than merely arriving — an
      // assertion that only checked `window.Prism` would pass for a loader that
      // fetched the script and never ran it.
      await expect.poll(
        () => page.evaluate(() => document.querySelectorAll('#chat-message-feed pre code span.token').length),
        { timeout: 20000 }
      ).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
