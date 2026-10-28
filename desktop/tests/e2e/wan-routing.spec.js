// Packets route over WAN when TCP has no route — including reactions.
//
// ⚠⚠ TWO REAL APP INSTANCES, NOT TWO OBJECTS IN ONE PAGE. A single instance cannot show
// this: the bug that cost a whole round here (an offerer offering into an empty room) only
// appears when two processes meet through a relay. WebRTC ignores the fixed TCP port, so
// two instances coexist without fighting over it.
//
// ⚠ THE RELAY IS STARTED HERE, on a port of its own, and killed at the end.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers.js');

const PORT = 8795;

let relay = null;
let relayErr = '';

test.beforeAll(async () => {
  relay = spawn(process.execPath, [path.resolve(__dirname, '../../../relay/server.js')], {
    // ⚠ __dirname is desktop/tests/e2e, so the desktop's node_modules is two levels up.
    env: Object.assign({}, process.env, { PORT: String(PORT), NODE_PATH: path.resolve(__dirname, '../../node_modules') }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  relay.stderr.on('data', (d) => { relayErr += String(d); });
  // Wait for the listener rather than sleeping a guessed interval.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('relay did not start in 8s; stderr: ' + relayErr)), 8000);
    relay.stdout.on('data', (d) => {
      if (String(d).indexOf('listening') !== -1) { clearTimeout(timer); resolve(); }
    });
    relay.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('relay exited with code ' + code + '; stderr: ' + relayErr));
    });
  });
});

test.afterAll(async () => {
  if (relay) relay.kill();
});

test('a MESSAGE and a REACTION reach a peer with no TCP route', async () => {
  const a = await launchApp(seedNewUI(tmpUserDataDir('wan-route-a'), true));
  const b = await launchApp(seedNewUI(tmpUserDataDir('wan-route-b'), true));
  try {
    const idA = await a.page.evaluate(() => window.store.getState().currentUser.userId);
    const idB = await b.page.evaluate(() => window.store.getState().currentUser.userId);

    // Record what actually reaches B's dispatcher.
    await b.page.evaluate(() => {
      window.__pkts = [];
      const orig = window.orbitHandleIncomingPacket;
      window.orbitHandleIncomingPacket = function (p) {
        window.__pkts.push({ type: p.type, payload: p.payload });
        return orig.apply(this, arguments);
      };
    });

    const url = 'ws://127.0.0.1:' + PORT;
    await a.page.evaluate((o) => window.orbitWanConnect(o.remote, { relayUrl: o.url, room: 'e2e-room' }), { remote: idB, url });
    await b.page.evaluate((o) => window.orbitWanConnect(o.remote, { relayUrl: o.url, room: 'e2e-room' }), { remote: idA, url });

    // Both channels up.
    await expect.poll(async () => await a.page.evaluate((id) => window.OrbitWan.isConnected(id), idB),
      { timeout: 20000 }).toBe(true);
    await expect.poll(async () => await b.page.evaluate((id) => window.OrbitWan.isConnected(id), idA),
      { timeout: 20000 }).toBe(true);

    // ⚠ There is deliberately NO TCP connection between these two, so `sendMessage` fails
    // and main must fall back to the renderer's DataChannel.
    const sent = await a.page.evaluate((id) =>
      window.orbitAPI.networkSend(id, '', 'MESSAGE', { text: 'over wan', msgId: 7 }), idB);
    expect(sent, 'network-send must accept the packet for WAN delivery').toBe(true);

    await expect.poll(async () => (await b.page.evaluate(() => window.__pkts)).length, { timeout: 10000 }).toBeGreaterThan(0);
    const first = await b.page.evaluate(() => window.__pkts[0]);
    expect(first.type).toBe('MESSAGE');
    expect(first.payload.text).toBe('over wan');

    // ⚠ REACTIONS TAKE THE SAME ROUTE. This is the regression this test exists for: reactions
    // are just packets, and they must not be a special case that only works on a LAN.
    await a.page.evaluate((id) =>
      window.orbitAPI.networkSend(id, '', 'REACTION', { msgId: 7, emoji: '\uD83D\uDD25', action: 'add', userId: 'x' }), idB);
    await expect.poll(async () => (await b.page.evaluate(() => window.__pkts)).length, { timeout: 10000 }).toBeGreaterThan(1);
    const types = await b.page.evaluate(() => window.__pkts.map((p) => p.type));
    expect(types).toContain('REACTION');
    const reaction = await b.page.evaluate(() => window.__pkts.find((p) => p.type === 'REACTION'));
    expect(reaction.payload.emoji).toBe('\uD83D\uDD25');
  } finally {
    await a.app.close();
    await b.app.close();
  }
});
