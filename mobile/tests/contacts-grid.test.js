// The Contacts screen's GRID display.
//
// Dan: "about the grid display, might need to rework it cuz it feel kinda too
// space out with the layout".
//
// ⚠ MEASURING FOUND MORE THAN SPACING. The grid was `1fr 1fr`, which is
// `minmax(auto, 1fr)` — and an `auto` minimum is the content's MIN-CONTENT width.
// So one long unbreakable name pushed its column wider than its share and the
// whole grid grew past the screen. On a 390px phone the columns measured
// 188px + 229px = 426px and the right-hand cards were cut off, which is why the
// ellipsis on a long name never appeared: the column had simply made room.
//
// So the assertions here are about LAYOUT FACTS, not about how it looks:
//   - the columns are equal
//   - the grid does not exceed the screen
//   - no card's right edge is past the viewport
//   - a long name ellipsizes rather than widening its column
//   - the cards are shorter than the old fixed 168px floor
const H = require('./harness.js');

// Deliberately long names — the case that broke the columns.
const F = (id, name, status) => ({
  id: 'p_' + id, name, tag: '000' + id, status, peerId: 'p_' + id, lastSeen: Date.now()
});

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [
    F('ava', 'Ava Chen', 'online'),
    F('marcus', 'Marcus Reed', 'online'),
    F('sofia', 'Sofia Lindqvist-Worthington', 'offline'),
    F('tomas', 'Tomas Rivera', 'offline'),
    F('june', 'June Park', 'offline')
  ],
  orbit_chats: [{ id: 'dm_p_ava', name: 'Ava Chen', lastMessage: '', lastTime: H.t(2) }],
  orbit_msg_dm_p_ava: []
};

const MEASURE = `(() => {
  const list = document.getElementById('friends-list');
  if (!list) return { missing: true };
  const cards = Array.from(list.querySelectorAll(':scope > .friend-row'));
  const cs = getComputedStyle(list);
  const first = cards[0];
  const fcs = first ? getComputedStyle(first) : null;
  const av = first ? first.querySelector('.chat-row-avatar') : null;
  const more = first ? first.querySelector('.friend-more') : null;
  return {
    grid: cs.display,
    columns: cs.gridTemplateColumns.split(' ').map(parseFloat),
    gap: cs.gap,
    cards: cards.length,
    cardH: first ? Math.round(first.getBoundingClientRect().height) : null,
    cardW: first ? Math.round(first.getBoundingClientRect().width) : null,
    avatar: av ? Math.round(av.getBoundingClientRect().height) : null,
    minHeight: fcs ? fcs.minHeight : null,
    overflows: list.scrollWidth > list.clientWidth + 1,
    listScrollW: list.scrollWidth,
    listClientW: list.clientWidth,
    widestCardRight: cards.length ? Math.max.apply(null, cards.map((c) => Math.round(c.getBoundingClientRect().right))) : null,
    viewportW: window.innerWidth,
    // A name that does not fit must be clipped, not allowed to widen the column.
    longestNameClipped: (() => {
      const c = cards.find((x) => /Sofia/.test((x.querySelector('.chat-row-name') || {}).textContent || ''));
      if (!c) return null;
      const n = c.querySelector('.chat-row-name');
      return { scroll: n.scrollWidth, client: n.clientWidth, clipped: n.scrollWidth > n.clientWidth };
    })(),
    moreInsideCard: (() => {
      if (!first || !more) return null;
      const cb = first.getBoundingClientRect(), mb = more.getBoundingClientRect();
      return mb.right <= cb.right + 0.5 && mb.left >= cb.left - 0.5 &&
             mb.bottom <= cb.bottom + 0.5 && mb.top >= cb.top - 0.5;
    })()
  };
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.waitForTimeout(1800);

  await page.evaluate(() => {
    (window.MStore.friends || []).forEach((f) => {
      if (/Ava|Marcus/.test(f.name || '')) { f.status = 'online'; f.lastSeen = Date.now(); }
      else { f.status = 'offline'; f.lastSeen = Date.now() - 900000; }
    });
  });
  await page.evaluate(() => window.OrbitNav.switchTo('contacts'));
  await page.waitForTimeout(900);

  // Start from the list, then switch, so the toggle is exercised rather than
  // the class being assumed to be there.
  await page.evaluate(() => {
    const b = document.querySelector('.contacts-style');
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  const m = await page.evaluate(MEASURE);
  console.log(JSON.stringify(m, null, 1));

  H.check('it is actually a grid', m.grid === 'grid', m.grid);
  H.check('the cards rendered', m.cards >= 5, m.cards);
  H.check('two columns', m.columns.length === 2, m.columns);
  // ⚠ THE REGRESSION THIS FILE EXISTS FOR: 188 vs 229 before the fix.
  H.check('the two columns are EQUAL width',
    Math.abs(m.columns[0] - m.columns[1]) < 1.5, m.columns);
  H.check('the grid does NOT overflow the screen',
    m.overflows === false, { scroll: m.listScrollW, client: m.listClientW });
  H.check('no card reaches past the viewport',
    m.widestCardRight <= m.viewportW, { right: m.widestCardRight, vw: m.viewportW });
  H.check('a name too long for the card is CLIPPED, not given more room',
    m.longestNameClipped && m.longestNameClipped.clipped === true, m.longestNameClipped);
  H.check('the cards are denser than the old 168px floor', m.cardH < 160, m.cardH);
  H.check('the ⋮ is inside the card, not below it', m.moreInsideCard === true, m.moreInsideCard);

  await page.screenshot({ path: H.SHOTS + '/contacts-grid.png' });

  // Back to the list, and the layout must actually go back.
  await page.evaluate(() => {
    const b = document.querySelector('.contacts-style');
    if (b) b.click();
  });
  await page.waitForTimeout(900);
  const back = await page.evaluate(MEASURE);
  H.check('switching back gives a list, not a grid', back.grid !== 'grid', back.grid);
  H.check('and the rows are full width again', back.cardW > m.cardW, { list: back.cardW, grid: m.cardW });

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
