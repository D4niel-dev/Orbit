// The startup permission pass.
//
// Dan: "Add a 'Ask for permission' start up, like every permission that the app
// needs when they first start the app or after they v0.8.7, if they are still
// missing some permissions, on start up of the new version, it'll ask for those
// permissions. If the users has already accept the permissions then it ask."
//
// WHAT WAS THERE BEFORE, and why this file has a second half:
// three unrelated places asked for permissions and none could read the current
// state, so a granted permission was asked for again on every launch. One of
// them opened the CAMERA on every start — getUserMedia({video:true}) then
// stopping the tracks — purely to provoke the OS dialog. That is the regression
// the last section guards: a full boot with a getUserMedia spy installed, which
// must record ZERO calls.
const H = require('./harness.js');

const SEED = {
  orbit_user: { id: 'u_dan', name: 'Dan', tag: '2847', status: 'online' },
  orbit_friends: [{ id: 'p_echo', name: 'Orbit Echo', tag: '0001', status: 'online' }],
  orbit_chats: [{ id: 'p_echo', name: 'Orbit Echo', lastMessage: '', lastTime: H.t(2) }],
  orbit_msg_p_echo: []
};

const SHEET = `(() => {
  const c = document.getElementById('bottom-sheet-content');
  const sheet = c && c.querySelector('.perm-sheet');
  const ov = document.getElementById('bottom-sheet-overlay');
  // ⚠ The signal is the overlay's CLASS. hide() removes 'active' and leaves the
  // content in the DOM, so reading display or looking for the content's absence
  // reports "still open" forever.
  const shown = !!(ov && ov.classList.contains('active') && sheet);
  return {
    shown: shown,
    rows: sheet ? Array.from(sheet.querySelectorAll('.perm-row')).map((r) => ({
      name: (r.querySelector('.perm-name') || {}).textContent,
      granted: r.classList.contains('is-granted')
    })) : [],
    allow: sheet ? (sheet.querySelector('#perm-allow') || {}).textContent || null : null,
    done: !!(sheet && sheet.querySelector('#perm-done')),
    battery: !!(sheet && sheet.querySelector('.perm-battery')),
    // ⚠ The bug this catches: the action was in the DOM but scrolled below the
    // sheet's cap, so the only thing to press was invisible.
    allowVisible: (() => {
      const b = sheet && sheet.querySelector('#perm-allow');
      if (!b) return null;
      const rb = b.getBoundingClientRect();
      const sheetEl = document.getElementById('bottom-sheet');
      const rs = sheetEl ? sheetEl.getBoundingClientRect() : null;
      return { top: Math.round(rb.top), bottom: Math.round(rb.bottom), inView: rb.top >= 0 && rb.bottom <= window.innerHeight && (!rs || rb.top >= rs.top - 1) };
    })()
  };
})()`;

/** Install a fake native plugin and reset the "already asked" marker. */
const setup = (states) => `(() => {
  window.__requested = 0;
  window.Capacitor = window.Capacitor || {};
  window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  window.Capacitor.Plugins.OrbitPermissions = {
    check: function () { return Promise.resolve(${JSON.stringify(states)}); },
    request: function () {
      window.__requested++;
      // Granting everything is what "Allow" is for.
      return Promise.resolve({ notifications: 'granted', camera: 'granted', microphone: 'granted', nearby: 'granted', battery: 'prompt' });
    },
    requestBatteryExemption: function () { window.__batteryAsked = (window.__batteryAsked || 0) + 1; return Promise.resolve({}); }
  };
  if (window.OrbitSheet) OrbitSheet.hide();
  window.MStore.settings.permissionsAskedVersion = '';
  window.MStore.save();
  return true;
})()`;

(async () => {
  const server = await H.serve();

  // ── Part 1: what the gate decides ───────────────────────────────────────
  const { browser, page, errors } = await H.boot(server, SEED);
  await page.waitForTimeout(1200);

  console.log('\n== everything already granted ==');
  await page.evaluate(setup({ notifications: 'granted', camera: 'granted', microphone: 'granted', nearby: 'granted', battery: 'granted' }));
  const all = await page.evaluate(() => window.OrbitPermissionGate.maybeAsk());
  await page.waitForTimeout(500);
  const allSheet = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(all));
  H.check('nothing missing means nothing is asked', all.asked === false, all);
  H.check('and the reason says so', all.reason === 'all-granted', all.reason);
  H.check('no sheet is shown at all', allSheet.shown === false, allSheet);

  console.log('\n== three of four missing, never asked before ==');
  await page.evaluate(setup({ notifications: 'granted', camera: 'prompt', microphone: 'prompt', nearby: 'denied', battery: 'prompt' }));
  const some = await page.evaluate(() => window.OrbitPermissionGate.maybeAsk());
  await page.waitForTimeout(600);
  const sheet = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(some));
  console.log('  rows: ' + JSON.stringify(sheet.rows));
  H.check('it asks', some.asked === true, some);
  H.check('it names exactly the missing ones',
    JSON.stringify(some.missing) === JSON.stringify(['camera', 'microphone', 'nearby']), some.missing);
  H.check('the sheet is shown', sheet.shown === true, sheet);
  H.check('every permission is listed, granted ones included', sheet.rows.length === 4, sheet.rows);
  H.check('the granted one is marked granted',
    (sheet.rows.find((r) => r.name === 'Notifications') || {}).granted === true, sheet.rows);
  H.check('the missing ones are not',
    (sheet.rows.find((r) => r.name === 'Camera') || {}).granted === false, sheet.rows);
  H.check('the button counts what it will ask for', /3/.test(sheet.allow || ''), sheet.allow);
  H.check('the battery exemption is offered as its own row', sheet.battery === true, sheet);
  H.check('the Allow button is VISIBLE, not scrolled out of the sheet',
    sheet.allowVisible && sheet.allowVisible.inView === true, sheet.allowVisible);
  await page.screenshot({ path: H.SHOTS + '/permissions.png' });

  console.log('\n== asking again in the same version ==');
  await page.evaluate(() => { if (window.OrbitSheet) OrbitSheet.hide(); });
  await page.waitForTimeout(400);
  const again = await page.evaluate(() => window.OrbitPermissionGate.maybeAsk());
  await page.waitForTimeout(500);
  const againSheet = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(again));
  H.check('it does NOT ask twice in one version', again.asked === false, again);
  H.check('and says why', again.reason === 'already-asked-this-version', again.reason);
  H.check('no second sheet', againSheet.shown === false, againSheet);

  console.log('\n== after an update (the version changed) ==');
  const bumped = await page.evaluate(() => {
    window.MStore.settings.permissionsAskedVersion = 'v0.0.0-old';
    window.MStore.save();
    return window.OrbitPermissionGate.maybeAsk();
  });
  await page.waitForTimeout(600);
  const bumpSheet = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(bumped));
  H.check('a new version asks again while something is still missing', bumped.asked === true, bumped);
  H.check('and the sheet is back', bumpSheet.shown === true, bumpSheet);

  console.log('\n== tapping Allow ==');
  const beforeReq = await page.evaluate(() => window.__requested);
  await page.evaluate(() => { const b = document.getElementById('perm-allow'); if (b) b.click(); });
  await page.waitForTimeout(800);
  const afterReq = await page.evaluate(() => window.__requested);
  const afterSheet = await page.evaluate(SHEET);
  console.log('  request() calls ' + beforeReq + ' -> ' + afterReq + '; rows ' + JSON.stringify(afterSheet.rows));
  H.check('it asks the OS exactly once', afterReq === beforeReq + 1, { beforeReq, afterReq });
  H.check('the rows re-render as granted',
    afterSheet.rows.every((r) => r.granted === true), afterSheet.rows);
  H.check('and the button becomes Done, with nothing left to allow',
    afterSheet.done === true && afterSheet.allow === null, afterSheet);

  console.log('\n== no native plugin at all (a plain browser) ==');
  const noPlugin = await page.evaluate(() => {
    delete window.Capacitor.Plugins.OrbitPermissions;
    if (window.OrbitSheet) OrbitSheet.hide();
    window.MStore.settings.permissionsAskedVersion = '';
    var supported = window.OrbitPermissionGate.supported();
    return window.OrbitPermissionGate.maybeAsk().then(function (r) {
      return { supported: supported, r: r };
    });
  });
  await page.waitForTimeout(500);
  const noSheet = await page.evaluate(SHEET);
  console.log('  ' + JSON.stringify(noPlugin));
  H.check('without the plugin it reports unsupported', noPlugin.supported === false, noPlugin);
  H.check('and asks nothing rather than guessing', noPlugin.r.asked === false, noPlugin.r);
  H.check('and shows no sheet', noSheet.shown === false, noSheet);

  H.check('no page errors in part 1', errors.length === 0, errors);
  await browser.close();

  // ── Part 2: nothing opens the camera at startup ─────────────────────────
  // A fresh page with the spy installed BEFORE any app script runs, because the
  // removed pre-request fired during boot and cannot be caught afterwards.
  console.log('\n== startup must not open the camera ==');
  const server2 = await H.serve();
  const b2 = await H.boot(server2, SEED);   // warms nothing; the spy needs a fresh page
  const ctx = await b2.browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx.newPage();
  const p2errors = [];
  p2.on('pageerror', (e) => p2errors.push(e.message.slice(0, 200)));
  await p2.addInitScript((s) => {
    for (const k of Object.keys(s)) localStorage.setItem(k, JSON.stringify(s[k]));
    localStorage.setItem('orbit_migrated_v2', 'true');
    // Count every attempt to open the camera or the microphone.
    window.__gum = [];
    if (!navigator.mediaDevices) {
      try { Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true }); } catch (e) {}
    }
    const real = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = function (c) {
        window.__gum.push(c || {});
        if (real) return real.call(navigator.mediaDevices, c);
        return Promise.reject(new Error('no camera in this browser'));
      };
    }
  }, SEED);
  await p2.goto('http://127.0.0.1:' + server2.address().port + '/index.html', { waitUntil: 'load', timeout: 30000 });
  await p2.waitForTimeout(5000);

  const gum = await p2.evaluate(() => window.__gum || []);
  console.log('  getUserMedia calls during a full boot: ' + JSON.stringify(gum));
  H.check('getUserMedia is NEVER called at startup', gum.length === 0, gum);
  H.check('no video request at all', !gum.some((c) => c && c.video), gum);
  H.check('no audio request at all', !gum.some((c) => c && c.audio), gum);
  H.check('no page errors in part 2', p2errors.length === 0, p2errors);

  await b2.browser.close();
  server.close(); server2.close(); H.report();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
