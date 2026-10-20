// E2E: the Add a Friend modal — "Your address", and host:port.
//
// ⚠⚠ TWO THINGS THE MODAL COULD NOT DO, both in the direction of the SAME mistake:
//
//   1. It only helped you connect OUT. It never said how someone reaches YOU, which is
//      the other half of adding a friend over a LAN — so you had to go find your own IP
//      somewhere else and read it out. `getLocalIPv4s()` already existed and returns
//      every interface, because which one is right depends on which network the other
//      device is on.
//
//   2. `orbitAPI.connect(ip, port)` HAS ALWAYS TAKEN A PORT — the preload defaults it
//      to 46000, the main process passes it to `connectToPeer('manual', ip, port)` —
//      and the modal always sent just the host. A peer listening anywhere else could
//      not be reached by typing it, and nothing explained why: the only feedback was a
//      toast, and the dialog had already closed.
//
// Both UIs share this modal, so both are checked.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

async function openModal(page) {
  await page.evaluate(() => window.SidebarMiddle.showAddFriendModal());
  await page.waitForTimeout(1200);
}

for (const newUI of [true, false]) {
  const label = newUI ? 'redesign' : 'original UI';

  test('it shows YOUR address, not just the field for theirs (' + label + ')', async () => {
    const dir = seedNewUI(tmpUserDataDir('af-mine-' + (newUI ? 'n' : 'o')), newUI);
    const { app, page } = await launchApp(dir);
    try {
      await openModal(page);

      const r = await page.evaluate(() => {
        const box = document.getElementById('af-your-address');
        const rows = box ? [...box.querySelectorAll('.af-addr')] : [];
        return {
          count: rows.length,
          ips: rows.map((b) => b.getAttribute('data-ip')),
          // ⚠ What is ON SCREEN — the thing that must not be the address.
          visible: rows.map((b) => b.querySelector('.af-addr-val').textContent),
          says: box ? box.textContent.replace(/\s+/g, ' ').trim() : ''
        };
      });

      expect(r.count, 'at least one address must be offered').toBeGreaterThan(0);
      // ⚠ They have to be this machine's REAL addresses, not decoration.
      const local = await page.evaluate(() => window.orbitAPI.getLocalIPv4s());
      expect(local.length).toBeGreaterThan(0);
      r.ips.forEach((ip) => expect(local, ip + ' must be a local interface').toContain(ip));

      // ⚠⚠ AND NONE OF THEM MAY BE ON SCREEN. A full LAN address in a dialog is
      // readable over a shoulder and permanent in a screenshot, and the copy button
      // means nobody has to read it.
      r.visible.forEach((text, i) => {
        expect(text, 'the address must be masked').not.toContain(r.ips[i]);
        expect(text, 'masked with bullets').toMatch(/^\u2022/);
      });
      expect(r.says, 'the address must not appear anywhere in the block').not.toContain(r.ips[0]);
      expect(r.says).toContain('Your address');

      // The eye reveals it, deliberately.
      await page.click('#af-your-address .af-addr .af-reveal');
      await page.waitForTimeout(200);
      const revealed = await page.evaluate(() =>
        document.querySelector('#af-your-address .af-addr-val').textContent);
      expect(revealed, 'the eye must show the real address').toBe(r.ips[0]);

      // Copying works while hidden — that is the point of hiding it.
      await page.click('#af-your-address .af-addr .af-copy');
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => !!document.getElementById('connect-ip-input')),
        'the modal must survive a copy').toBe(true);
    } finally {
      await app.close();
    }
  });

  test('host:port is understood, and bad input is refused in place (' + label + ')', async () => {
    const dir = seedNewUI(tmpUserDataDir('af-parse-' + (newUI ? 'n' : 'o')), newUI);
    const { app, page } = await launchApp(dir);
    try {
      await openModal(page);

      // ⚠ The parse is asserted directly because `window.orbitAPI` is FROZEN: the port
      // cannot be observed at the boundary it is actually sent through, so the decision
      // that produces it is what gets pinned.
      const c = await page.evaluate(() => {
        const p = window.SidebarMiddle._parseAddress;
        return {
          plain: p('192.168.1.42'),
          withPort: p('192.168.1.42:47000'),
          hostname: p('orbit.local:47000'),
          pastedUrl: p('http://192.168.1.42:46000/'),
          v6: p('[fe80::1]:47000'),
          badOctet: p('999.1.1.1'),
          badPort: p('1.2.3.4:99999'),
          empty: p('   ')
        };
      });
      expect(c.plain).toEqual({ ip: '192.168.1.42', port: null });
      expect(c.withPort).toEqual({ ip: '192.168.1.42', port: 47000 });
      expect(c.hostname).toEqual({ ip: 'orbit.local', port: 47000 });
      // People paste these out of messages.
      expect(c.pastedUrl).toEqual({ ip: '192.168.1.42', port: 46000 });
      expect(c.v6).toEqual({ ip: 'fe80::1', port: 47000 });
      expect(c.badOctet.error, 'an octet over 255').toBeTruthy();
      expect(c.badPort.error, 'a port out of range').toBeTruthy();
      expect(c.empty.error).toBeTruthy();

      // A refused address must stay in the dialog, with the reason beside it.
      await page.fill('#connect-ip-input', '999.1.1.1');
      await page.click('#btn-confirm-connect');
      await page.waitForTimeout(250);
      const bad = await page.evaluate(() => ({
        err: document.getElementById('af-error').textContent,
        visible: getComputedStyle(document.getElementById('af-error')).display !== 'none',
        open: !!document.getElementById('connect-ip-input'),
        btn: document.getElementById('btn-confirm-connect').textContent,
        ring: getComputedStyle(document.getElementById('connect-ip-input')).boxShadow,
        errColor: getComputedStyle(document.getElementById('af-error')).color
      }));
      expect(bad.visible, 'the error must be inline, not a toast').toBe(true);
      expect(bad.err).toContain('not a valid IPv4');
      expect(bad.open, 'a refused address must not close the modal').toBe(true);
      expect(bad.btn, 'and must not start connecting').toBe('Connect');
      // ⚠⚠ THE RING, NOT JUST THE BORDER. Both sheets draw the focus ring as
      // `box-shadow: … !important`, and a field with an error in it is focused — so
      // the accent ring sat over the red border and the field read as "focused", not
      // "wrong". The ring has to carry the error colour too, and it has to agree with
      // the message beside it.
      expect(bad.ring, 'the focus ring must go red with the error').toContain(bad.errColor);

      // Your own address, which the main process only refuses AFTER the modal is gone.
      const mine = (await page.evaluate(() => window.orbitAPI.getLocalIPv4s()))[0];
      await page.fill('#connect-ip-input', mine);
      await page.click('#btn-confirm-connect');
      await page.waitForTimeout(250);
      const self = await page.evaluate(() => document.getElementById('af-error').textContent);
      expect(self, 'adding yourself must be caught where the mistake is').toContain('own address');

      // And a good one goes through.
      await page.fill('#connect-ip-input', '192.168.1.9:47000');
      await page.click('#btn-confirm-connect');
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => document.getElementById('btn-confirm-connect').textContent),
        'a valid address must be accepted').toBe('Connecting...');
    } finally {
      await app.close();
    }
  });
}