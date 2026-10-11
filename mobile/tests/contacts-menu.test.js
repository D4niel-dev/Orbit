// The ⋮ on a contact row must open a sheet with real actions in it.
//
// Dan: "The three dots button when press doesn't show anything currently...we
// need go add some keys functions/buttons to it."
//
// ⚠ THE CAUSE. showChatContextMenu only ever pushed GROUP items and folder items.
// For a DM with the experimental folder feature off — the default — `items` came
// out EMPTY, and `OrbitSheet.show([])` drew a sheet containing nothing but the
// Cancel pill. The button worked; there was simply nothing in the menu.
//
// The fix routes a DM to showUserActionsSheet, which already held the right set
// for a person (View Profile, Message, Mute, Close DM, Block) and is the same
// sheet the profile card opens. So the assertion that matters is "the DM sheet is
// not empty, and it offers the person's actions" — and the group assertions are
// here to prove the working path was not broken while doing it.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_ava', name: 'Ava Chen', tag: '0001', status: 'online', peerId: 'p_ava' }],
  orbit_groups: [{ id: 'g_team', name: 'Orbit Team', members: ['u_dan'], ownerId: 'u_dan' }],
  orbit_chats: [
    { id: 'dm_p_ava', name: 'Ava Chen', lastMessage: '', lastTime: H.t(2) },
    { id: 'g_team', name: 'Orbit Team', lastMessage: '', lastTime: H.t(3) }
  ],
  orbit_msg_dm_p_ava: [],
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

const clickMoreByName = (name) => `(() => {
  const rows = Array.from(document.querySelectorAll('#friends-list .friend-row'));
  const row = rows.find((r) => /${name}/.test((r.querySelector('.chat-row-name') || {}).textContent || ''));
  if (!row) return false;
  const b = row.querySelector('.friend-more');
  if (!b) return false;
  b.click();
  return true;
})()`;

(async () => {
  const server = await H.serve();
  const { browser, page, errors } = await H.boot(server, SEED);

  await page.evaluate(() => window.OrbitNav.switchTo('contacts'));
  await page.waitForTimeout(1200);

  // ── A DM, folders OFF (the default — the case that was empty) ────────────
  console.log('\n== a DM, with folders off ==');
  const ok1 = await page.evaluate(clickMoreByName('Ava'));
  await page.waitForTimeout(800);
  const dm = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(dm.labels));

  H.check('the DM row has a ⋮ button', ok1 === true);
  H.check('the sheet opens', dm.open === true, dm);
  H.check('and is NOT empty', dm.count > 0, dm.count);
  H.check('it offers View Profile', (dm.actions || []).indexOf('user_view_profile') !== -1, dm.actions);
  H.check('it offers Message', (dm.actions || []).indexOf('user_message') !== -1, dm.actions);
  H.check('it offers Mute Notifications', (dm.actions || []).indexOf('user_mute') !== -1, dm.actions);
  H.check('it offers Close DM', (dm.actions || []).indexOf('user_close_dm') !== -1, dm.actions);
  H.check('it offers Block', (dm.actions || []).indexOf('user_block') !== -1, dm.actions);
  await page.screenshot({ path: H.SHOTS + '/contacts-menu-dm.png' });

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

  H.check('no page errors', errors.length === 0, errors);
  await browser.close(); server.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
