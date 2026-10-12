// The ⋮ on a contact row must open a sheet with real actions in it — and the
// row itself must open the chat.
//
// Dan: "the three dots button when press did nothing...it's only the DMs, the
// groups are working."
//
// ⚠⚠ WHY THIS SPEC WAS GREEN WHILE EVERY CONTACT ROW WAS DEAD.
//
// The first version of this file seeded its friend as
//
//     { id: 'p_ava', name: 'Ava Chen', peerId: 'p_ava' }
//
// `peerId` is a field MStore has NEVER written on a friend record. A friend is
// keyed by `userId` (what MStore.addOrUpdatePeer writes) or by `id` (the seeded
// bots). Because the seed invented `peerId`, `renderFriendRow`'s
// `friend.peerId || ''` resolved fine *in the test* and to '' for every real
// contact — so the sheet opened here and nowhere else.
//
// An assertion that passes for the wrong reason is worse than one that fails: it
// buys confidence about a feature that does not work. The seed below is the shape
// the app actually produces, in both of its forms, and there is a direct
// assertion that the row carries a non-empty id — because that empty id WAS the
// bug, and no assertion looked at it.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  // Both real shapes, deliberately:
  //   p_ava  — `userId` only, exactly what MStore.addOrUpdatePeer writes for a peer
  //   bot_kai — `id` only, exactly how the seeded bots are built
  // Neither has `peerId`, because nothing in the app sets it.
  orbit_friends: [
    { userId: 'p_ava', name: 'Ava Chen', tag: '0001', status: 'online' },
    { id: 'bot_kai', name: 'Kai Bot', tag: 'BOT', status: 'online' }
  ],
  orbit_groups: [{ id: 'g_team', name: 'Orbit Team', members: ['u_dan'], ownerId: 'u_dan' }],
  orbit_chats: [
    { id: 'dm_p_ava', name: 'Ava Chen', lastMessage: '', lastTime: H.t(2) },
    { id: 'bot_kai', name: 'Kai Bot', lastMessage: '', lastTime: H.t(4) },
    { id: 'g_team', name: 'Orbit Team', lastMessage: '', lastTime: H.t(3) }
  ],
  orbit_msg_dm_p_ava: [],
  orbit_msg_bot_kai: [],
  orbit_msg_g_team: []
};

const SHEET = `(() => {
  const c = document.getElementById('bottom-sheet-content');
  if (!c) return { open: false };
  const items = Array.from(c.querySelectorAll('.bottom-sheet-item'));
  return {
    open: true,
    count: items.length,
    labels: items.map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim()),
    actions: items.map((b) => b.getAttribute('data-action'))
  };
})()`;

const rowByName = (name) => `(() => {
  const rows = Array.from(document.querySelectorAll('#friends-list .friend-row'));
  const row = rows.find((r) => /${name}/.test((r.querySelector('.chat-row-name') || {}).textContent || ''));
  if (!row) return { found: false };
  return {
    found: true,
    peerid: row.getAttribute('data-peerid'),
    userId: row.getAttribute('data-user-id'),
    hasMore: !!row.querySelector('.friend-more'),
    hasMessage: !!row.querySelector('.friend-action'),
    onclick: row.getAttribute('onclick') || ''
  };
})()`;

const clickMoreByName = (name) => `(() => {
  const rows = Array.from(document.querySelectorAll('#friends-list .friend-row'));
  const row = rows.find((r) => /${name}/.test((r.querySelector('.chat-row-name') || {}).textContent || ''));
  if (!row) return false;
  const b = row.querySelector('.friend-more');
  if (!b) return false;
  b.click();
  return true;
})()`;

const clickRowByName = (name) => `(() => {
  const rows = Array.from(document.querySelectorAll('#friends-list .friend-row'));
  const row = rows.find((r) => /${name}/.test((r.querySelector('.chat-row-name') || {}).textContent || ''));
  if (!row) return false;
  row.click();
  return true;
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  await page.evaluate(() => window.OrbitNav.switchTo('contacts'));
  await page.waitForTimeout(1200);

  // ── The id is actually there ─────────────────────────────────────────────
  // This is the assertion the old file was missing, and the bug was precisely
  // this attribute being empty.
  console.log('\n== the row carries a real id ==');
  const ava = await page.evaluate(rowByName('Ava'));
  const kai = await page.evaluate(rowByName('Kai Bot'));
  const grp0 = await page.evaluate(rowByName('Orbit Team'));
  console.log('  ava: ' + JSON.stringify(ava));
  console.log('  kai: ' + JSON.stringify(kai));

  H.check('the userId-shaped friend row exists', ava.found === true);
  H.check('and its data-peerid is NOT empty', !!ava.peerid, ava);
  H.check('and its data-user-id is NOT empty', !!ava.userId, ava);
  // ⚠ The onclick carries the RESOLVED id, bare — not the raw 'dm_' string. The
  // old code emitted the literal 'dm_' for every contact, so this is the exact
  // regression to pin: the argument must name the person.
  H.check('and its onclick names the person, not a bare "dm_"',
    /_onFriendClick\('p_ava'\)/.test(ava.onclick), ava.onclick);
  H.check('the id-shaped friend row also resolves', !!kai.peerid, kai);
  H.check('and its onclick names that person too',
    /_onFriendClick\('bot_kai'\)/.test(kai.onclick), kai.onclick);
  // A group row deliberately carries no `data-peerid` (that attribute means "this
  // row is a person"); it is identified by data-user-id and by its onclick.
  H.check('the group row still carries its id',
    grp0.userId === 'g_team' && /_onChatClick\('g_team'\)/.test(grp0.onclick), grp0);

  // ── A DM whose friend is keyed by `userId` — the case that was dead ───────
  console.log('\n== a DM (friend keyed by userId), folders off ==');
  const ok1 = await page.evaluate(clickMoreByName('Ava'));
  await page.waitForTimeout(800);
  const dm = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(dm.labels));

  H.check('the DM row has a ⋮ button', ok1 === true);
  H.check('the sheet opens', dm.open === true, dm);
  H.check('and is NOT empty', dm.count > 0, dm.count);
  H.check('it offers View Profile', (dm.actions || []).indexOf('user_view_profile') !== -1, dm.actions);
  H.check('it offers Message', (dm.actions || []).indexOf('user_message') !== -1, dm.actions);
  // ⚠ Mute and Close DM are the tell that the PERSON was resolved, not just the
  // sheet drawn. Both are gated on `u.isFriend`, and _resolveUserForSheet only
  // reported isFriend when it found the record — which it never did for a real
  // contact, so the sheet offered "Add Friend" to someone already a friend.
  H.check('it offers Mute Notifications (so the person was resolved)',
    (dm.actions || []).indexOf('user_mute') !== -1, dm.actions);
  H.check('it offers Close DM', (dm.actions || []).indexOf('user_close_dm') !== -1, dm.actions);
  H.check('it offers Block', (dm.actions || []).indexOf('user_block') !== -1, dm.actions);
  H.check('and does NOT offer Add Friend to an existing friend',
    (dm.actions || []).indexOf('user_add_friend') === -1, dm.actions);
  await page.screenshot({ path: H.SHOTS + '/contacts-menu-dm.png' });

  // ── A DM whose friend is keyed by `id` — the seeded-bot shape ────────────
  console.log('\n== a DM keyed by id (the bot shape) ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(500);
  const okBot = await page.evaluate(clickMoreByName('Kai Bot'));
  await page.waitForTimeout(800);
  const bot = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(bot.labels));

  H.check('the bot-shaped DM sheet opens', okBot === true && bot.open === true, bot);
  H.check('and offers Message', (bot.actions || []).indexOf('user_message') !== -1, bot.actions);

  // ── A group, which already worked ───────────────────────────────────────
  console.log('\n== a group, unchanged ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(500);
  const ok2 = await page.evaluate(clickMoreByName('Orbit Team'));
  await page.waitForTimeout(800);
  const grp = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(grp.labels));

  H.check('the group sheet still opens', ok2 === true && grp.open === true, grp);
  H.check('and still offers Group Info', (grp.actions || []).indexOf('group_info') !== -1, grp.actions);
  H.check('and still offers Mark as Read', (grp.actions || []).indexOf('group_mark_read') !== -1, grp.actions);
  H.check('and still offers Pin Chat', (grp.actions || []).indexOf('group_pin') !== -1, grp.actions);
  H.check('and still offers Delete Group (the owner sees delete, not leave)',
    (grp.actions || []).indexOf('group_delete') !== -1 &&
    (grp.actions || []).indexOf('group_leave') === -1, grp.actions);

  // ── A DM with folders ON — the folder entries must survive ──────────────
  console.log('\n== a DM, with folders on ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(500);
  const withFolders = await page.evaluate(() => {
    window.MStore.settings.experimentalFolders = true;
    var fid = window.MStore.createFolder('Work', 'briefcase');
    window.OrbitHome.renderFriendsList();
    return fid;
  });
  await page.waitForTimeout(700);
  const ok3 = await page.evaluate(clickMoreByName('Ava'));
  await page.waitForTimeout(800);
  const dmf = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(dmf.labels));

  H.check('the folder-enabled DM sheet opens', ok3 === true && dmf.open === true, dmf);
  H.check('the person actions are still there',
    (dmf.actions || []).indexOf('user_view_profile') !== -1, dmf.actions);
  H.check('AND the folder entry came through, not dropped',
    (dmf.actions || []).some((a) => /^add_folder_/.test(a || '')), dmf.actions);
  H.check('and New Folder is offered', (dmf.actions || []).indexOf('new_folder') !== -1, dmf.actions);
  H.check('the folder id is the one that was created',
    (dmf.actions || []).indexOf('add_folder_' + withFolders) !== -1, { actions: dmf.actions, withFolders });

  // ── Tapping the ROW (not the ⋮) — the other half that was dead ──────────
  //
  // ⚠ This is not a bonus check. A legacy document-level handler read
  // `data-friend` (never emitted) and then called
  // `document.querySelector('.nav-btn[data-view="chats"]').click()` on a selector
  // that does not exist — so every tap on a contact row threw
  // "Cannot read properties of null (reading 'click')" and opened nothing. Two
  // handlers, one job, both broken.
  console.log('\n== tapping the row itself ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(400);
  errors.length = 0;
  const rowClicked = await page.evaluate(clickRowByName('Ava'));
  await page.waitForTimeout(1000);
  const afterRow = await page.evaluate(() => ({
    // ⚠ NOT MStore.activeChatId — that field does not exist (activeChatId is
    // module-scoped inside app.js). Asserting on it would have been a check that
    // can never pass, which is its own kind of broken test.
    currentChatId: (window.OrbitChat || {})._currentChatId || null,
    header: (document.getElementById('chat-header-info') || {}).textContent || ''
  }));
  console.log('  ' + JSON.stringify(afterRow));

  H.check('tapping the row reports success', rowClicked === true);
  H.check('and it opens that contact\u2019s chat',
    afterRow.currentChatId === 'dm_p_ava', afterRow);
  H.check('and the header names them',
    /Ava Chen/.test(afterRow.header), afterRow.header);
  H.check('and nothing threw on the way', errors.length === 0, errors);

  H.check('no page errors overall', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
