// Verifies the relay end to end, the way a deploy should be checked.
//
// ⚠ It starts the relay, then drives TWO real peers through it inside one Electron
// renderer: they discover each other, exchange SDP and candidates, open DataChannels and
// pass a payload both ways. Nothing is mocked — only NAT is absent, because both peers are
// on this machine.
//
// Run from the repo root:  node relay/verify.js
// ⚠ It borrows the desktop's Electron and its e2e helpers, so the desktop's node_modules
// must be installed (it is, in a normal checkout).
//
// The full WAN path, minus real NAT: two peers find each other THROUGH THE RELAY, connect
// a DataChannel, and exchange a packet-shaped payload.
const path = require('path');
const { spawn } = require('child_process');
const { tmpUserDataDir, launchApp, seedNewUI } = require(path.resolve(__dirname, '../desktop/tests/e2e/helpers.js'));

const PORT = 8788;

(async () => {
  // Start the relay with ws resolved from the desktop's node_modules.
  const relay = spawn(process.execPath, [path.resolve(__dirname, 'server.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), NODE_PATH: path.resolve(__dirname, '../desktop/node_modules') }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let relayOut = '';
  relay.stdout.on('data', (d) => { relayOut += d.toString(); });
  relay.stderr.on('data', (d) => { relayOut += d.toString(); });
  await new Promise((r) => setTimeout(r, 1200));

  const { app, page } = await launchApp(seedNewUI(tmpUserDataDir('probe-relay'), true));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

  for (const f of ['signaling-client.js', 'webrtc-signaling.js', 'webrtc-transport.js']) {
    await page.addScriptTag({ path: path.resolve(__dirname, '../shared/network', f) });
  }

  const out = await page.evaluate(async (port) => {
    const url = 'ws://127.0.0.1:' + port;
    const res = { events: [], received: [] };
    let ta = null, tb = null;

    const ca = window.OrbitSignaling.create({
      url, room: 'probe-room', peerId: 'peer-a',
      onSignal: (s) => { res.events.push('a<-' + s.kind); ta.handleSignal(s.kind, s.payload); },
      onPeerJoined: (p) => res.events.push('a sees ' + p),
      onError: (m) => res.events.push('a err:' + m)
    });
    const cb = window.OrbitSignaling.create({
      url, room: 'probe-room', peerId: 'peer-b',
      onSignal: (s) => { res.events.push('b<-' + s.kind); tb.handleSignal(s.kind, s.payload); },
      onError: (m) => res.events.push('b err:' + m)
    });

    ta = window.OrbitWebRTC.createTransport({
      role: window.OrbitWebRTCSignaling.roleFor('peer-a', 'peer-b'),
      iceServers: [],
      sendSignal: (k, p) => ca.sendSignal(k, p),
      onOpen: () => res.events.push('a open'),
      onMessage: (m) => res.received.push('a:' + m)
    });
    tb = window.OrbitWebRTC.createTransport({
      role: window.OrbitWebRTCSignaling.roleFor('peer-b', 'peer-a'),
      iceServers: [],
      sendSignal: (k, p) => cb.sendSignal(k, p),
      onOpen: () => res.events.push('b open'),
      onMessage: (m) => res.received.push('b:' + m)
    });

    await ca.connect();
    await cb.connect();
    await new Promise((r) => setTimeout(r, 400));   // let the relay register both

    const done = new Promise((r) => setTimeout(r, 12000));
    await ta.start();

    // Poll for the channel instead of sleeping a fixed time.
    const t0 = Date.now();
    while (Date.now() - t0 < 11000) {
      if (ta.channel && ta.channel.readyState === 'open' && tb.channel && tb.channel.readyState === 'open') break;
      await new Promise((r) => setTimeout(r, 200));
    }

    res.sentA = ta.send(JSON.stringify({ type: 'MESSAGE', payload: { text: 'through the relay', e2ee: 'CIPHERTEXT' } }));
    await new Promise((r) => setTimeout(r, 700));
    res.sentB = tb.send('reply-via-relay');
    await new Promise((r) => setTimeout(r, 700));

    res.states = { a: ta.connectionState, b: tb.connectionState };
    res.channels = { a: ta.channel && ta.channel.readyState, b: tb.channel && tb.channel.readyState };
    await done;
    ta.close(); tb.close(); ca.close(); cb.close();
    return res;
  }, PORT);

  console.log('RELAY: ' + JSON.stringify(out));
  console.log('RELAY-LOG: ' + JSON.stringify(relayOut.trim().split('\n').slice(0, 4)));
  if (errors.length) console.log('PAGE-ERRORS: ' + JSON.stringify(errors.slice(0, 3)));

  relay.kill();
  await app.close();
})().catch((e) => { console.error('FAILED:', e && e.message); process.exit(1); });