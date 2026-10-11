// The composer's link preview bar — which links it recognises, and which it
// wrongly stays quiet about.
//
// ⚠ WHAT THIS EXISTS FOR
// Dan: "make it recognize the 'pasted' link too, not just the manually input one
// and when a link end with a '/'".
//
// Neither of those was what was happening. The bar reads the composer correctly
// and always did — `https://d4niel-dev.github.io/Orbit/` with its trailing slash
// included. The bug was the DISMISSAL: it was keyed by URL for the whole session,
// so once the card for a link had been dismissed, putting that SAME link into the
// composer showed nothing. The chat in his screenshot already held that link and
// its card had been dismissed, so pasting it back produced no preview — which
// reads as "pasted links are not recognised", and as "links ending in / are not
// recognised". One cause, two symptoms.
//
// The check that matters is therefore the LAST one: dismiss a link, then paste it
// back, and expect the bar. That assertion fails against the old build.
const H = require('./harness.js');

const SLASH_URL = 'https://d4niel-dev.github.io/Orbit/';

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
  orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
  // Exactly the screenshot: the same link already sent in this chat, so the
  // fallback path has something to offer and can be dismissed.
  orbit_msg_p_echo: [{ id: 'm1', from: 'me', text: SLASH_URL, time: '08:29' }]
};

const BAR = `(() => {
  const el = document.getElementById('link-preview-bar');
  const box = el && el.querySelector('.link-preview-bar');
  return {
    visible: !!(el && getComputedStyle(el).display !== 'none' && box),
    url: box ? box.getAttribute('data-url') : null,
    site: box ? (box.querySelector('.link-preview-bar-site') || {}).textContent : null,
    value: (document.getElementById('chat-input') || {}).value
  };
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  // Never touch the network — a preview must not depend on a real fetch.
  await page.route('**://**', (route) => {
    if (route.request().url().startsWith('http://127.0.0.1')) return route.continue();
    return route.fulfill({
      status: 200, contentType: 'text/html',
      body: '<html><head><meta property="og:title" content="OG TITLE">' +
            '<meta property="og:site_name" content="OG SITE"></head><body>x</body></html>'
    });
  });

  await page.evaluate(() => window.openChat('p_echo'));
  await page.waitForTimeout(1500);

  const clear = async () => {
    await page.evaluate(() => {
      const i = document.getElementById('chat-input');
      i.value = '';
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(300);
  };
  const type = async (text) => {
    await clear();
    await page.click('#chat-input');
    await page.keyboard.type(text, { delay: 10 });
    await page.waitForTimeout(500);
    return page.evaluate(BAR);
  };
  // insertText is the platform's paste path: no key events, one insertion.
  const paste = async (text) => {
    await clear();
    await page.click('#chat-input');
    await page.keyboard.insertText(text);
    await page.waitForTimeout(500);
    return page.evaluate(BAR);
  };

  console.log('\n== recognising the link ==');
  const typedPlain = await type('look at https://example.com here');
  const pastedPlain = await paste('look at https://example.com here');
  const typedSlash = await type(SLASH_URL);
  const pastedSlash = await paste(SLASH_URL);
  console.log('  typed, no slash    ' + JSON.stringify(typedPlain));
  console.log('  PASTED, no slash   ' + JSON.stringify(pastedPlain));
  console.log('  typed, trailing /  ' + JSON.stringify(typedSlash));
  console.log('  PASTED, trailing / ' + JSON.stringify(pastedSlash));

  H.check('a typed link shows the bar', typedPlain.visible === true, typedPlain);
  H.check('a PASTED link shows the bar', pastedPlain.visible === true, pastedPlain);
  H.check('a typed link ending in / shows the bar', typedSlash.visible === true, typedSlash);
  H.check('a PASTED link ending in / shows the bar', pastedSlash.visible === true, pastedSlash);
  H.check('and the trailing slash is KEPT, not trimmed',
    pastedSlash.url === SLASH_URL, pastedSlash.url);
  H.check('the bar names the real site, not the path',
    pastedSlash.site === 'OG SITE', pastedSlash.site);

  console.log('\n== a dismissed link, then pasted again ==');
  await clear();
  await page.waitForTimeout(400);
  const fallback = await page.evaluate(BAR);
  H.check('with an empty composer the chat supplies the link',
    fallback.visible === true && fallback.url === SLASH_URL, fallback);

  await page.evaluate(() => {
    const b = document.querySelector('.link-preview-bar .link-preview-bar-close');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const afterX = await page.evaluate(BAR);
  H.check('tapping the X hides it', afterX.visible === false, afterX);

  const repasted = await paste(SLASH_URL);
  console.log('  pasted the same link again  ' + JSON.stringify(repasted));
  // ⚠ THE ASSERTION THIS FILE EXISTS FOR. Red before the fix.
  H.check('a FRESHLY PASTED link is previewed even though it was dismissed before',
    repasted.visible === true && repasted.url === SLASH_URL, repasted);

  console.log('\n== but a dismissal still holds while you keep typing ==');
  await page.evaluate(() => {
    const b = document.querySelector('.link-preview-bar .link-preview-bar-close');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  const hiddenAgain = await page.evaluate(BAR);
  await page.click('#chat-input');
  await page.keyboard.press('End');
  await page.keyboard.type('x', { delay: 10 });
  await page.waitForTimeout(500);
  const stillHidden = await page.evaluate(BAR);
  H.check('dismissed with the link in the box, it stays hidden', hiddenAgain.visible === false, hiddenAgain);
  H.check('...and one more character does not bring it back',
    stillHidden.visible === false, stillHidden);

  console.log('\n== the IME paste path: text lands with no input event ==');
  await clear();
  await page.waitForTimeout(300);
  const ime = await page.evaluate((u) => {
    const i = document.getElementById('chat-input');
    // Text appears WITHOUT an `input` event, then a paste event fires — which is
    // what some Android keyboards do.
    i.value = u;
    i.dispatchEvent(new Event('paste', { bubbles: true }));
    return true;
  }, 'https://example.com/ime');
  await page.waitForTimeout(600);
  const imeBar = await page.evaluate(BAR);
  console.log('  after a bare paste event  ' + JSON.stringify(imeBar));
  H.check('a paste event alone is enough to show the bar',
    ime === true && imeBar.visible === true, imeBar);

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
