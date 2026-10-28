// Unit tests for the desktop chunk/ACK/RESUME receive state machine
// (desktop/src/js/network/transfer.js).
//
// This is the engine behind the file-transfer release and it had no automated
// coverage. The invariants below are the ones that matter: a chunk must never be
// written out of order, and a gap must trigger a RESUME rather than corrupt the
// partial. That is the same failure the mobile sender hit when its
// FILE_TRANSFER_START was queued behind the chunks.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const Protocol = require('../../desktop/src/js/network/protocol.js');
const TransferManager = require('../../desktop/src/js/network/transfer.js');

const CHUNK = 64 * 1024; // must match TransferManager.CHUNK_SIZE
const PEER = 'peer1';
const OTHER_PEER = 'peer2';

let passed = 0;
function ok(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ok - ' + name); });
}

// ---- harness -------------------------------------------------------------

function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-xfer-'));
  const sent = [];
  const sockets = {
    sent,
    sendMessage(to, ip, type, payload) { sent.push({ to, ip, type, payload }); }
  };
  const tm = new TransferManager(sockets, { tempDir: dir, db: null });
  return {
    tm, sent, dir,
    of: (type) => sent.filter(s => s.type === type),
    cleanup() {
      tm.destroy();
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  };
}

const start = (fileId, totalChunks, hash, fileSize, from = PEER) => ({
  from, _fromIp: '127.0.0.1', type: Protocol.Types.FILE_TRANSFER_START,
  payload: { fileId, fileName: 'x.bin', fileSize, totalChunks, hash, type: 'file', mimeType: 'application/octet-stream' }
});
const chunk = (fileId, chunkIndex, buf, from = PEER) => ({
  from, _fromIp: '127.0.0.1', type: Protocol.Types.FILE_CHUNK,
  payload: { fileId, chunkIndex, data: buf.toString('base64') }
});
const end = (fileId, from = PEER) => ({
  from, _fromIp: '127.0.0.1', type: Protocol.Types.FILE_TRANSFER_END, payload: { fileId }
});

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// handleEnd finalizes on the stream's 'finish' event, so it is async.
function finish(tm, packet) {
  return new Promise((resolve) => {
    let settled = false;
    tm.handleEnd(packet,
      (tempPath, fileName, fileId, fileSize) => {
        if (settled) return; settled = true;
        resolve({ ok: true, tempPath, fileName, fileId, fileSize });
      },
      (err, fileId) => {
        if (settled) return; settled = true;
        resolve({ ok: false, err, fileId });
      });
    setTimeout(() => { if (!settled) { settled = true; resolve({ ok: false, err: 'timeout' }); } }, 4000);
  });
}

(async () => {
  console.log('transfer-state-machine');

  // ---- the happy path ----------------------------------------------------

  await ok('in-order chunks assemble a byte-exact file and finalize', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const b = Buffer.from('tail');
      const whole = Buffer.concat([a, b]);
      const fileId = 'f-happy';
      h.tm.handleStart(start(fileId, 2, sha(whole), whole.length));
      assert.strictEqual(h.tm.activeReceives.size, 1, 'receive should be active');

      h.tm.handleChunk(chunk(fileId, 0, a));
      h.tm.handleChunk(chunk(fileId, 1, b));
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 2);

      const res = await finish(h.tm, end(fileId));
      assert.strictEqual(res.ok, true, 'should complete: ' + res.err);
      assert.deepStrictEqual(fs.readFileSync(res.tempPath), whole, 'bytes must match');
      assert.strictEqual(h.tm.activeReceives.size, 0, 'receive should be released');
      assert.strictEqual(h.of(Protocol.Types.FILE_TRANSFER_RESUME).length, 0, 'no resume needed');
    } finally { h.cleanup(); }
  });

  // ---- the critical ordering invariant -----------------------------------

  await ok('a gap triggers RESUME and writes NOTHING (no corruption)', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const b = Buffer.alloc(CHUNK, 0x42);
      const fileId = 'f-gap';
      h.tm.handleStart(start(fileId, 2, sha(Buffer.concat([a, b])), a.length + b.length));

      h.tm.handleChunk(chunk(fileId, 0, a));
      // chunk 2 arrives, chunk 1 was lost
      h.tm.handleChunk(chunk(fileId, 2, b));

      const t = h.tm.activeReceives.get(fileId);
      assert.strictEqual(t.receivedCount, 1, 'out-of-order chunk must not advance the count');
      const resumes = h.of(Protocol.Types.FILE_TRANSFER_RESUME);
      assert.strictEqual(resumes.length, 1, 'exactly one RESUME expected');
      assert.strictEqual(resumes[0].payload.receivedCount, 1, 'RESUME must carry the contiguous count');
      assert.strictEqual(resumes[0].payload.fileId, fileId);

      // The partial must contain only chunk 0 — the gap must not be written.
      await finish(h.tm, end(fileId));
      const onDisk = fs.readFileSync(path.join(h.dir, 'orbit_' + fileId));
      assert.strictEqual(onDisk.length, CHUNK, 'only the contiguous prefix may be on disk');
      assert.ok(onDisk.equals(a), 'the prefix must be chunk 0');
    } finally { h.cleanup(); }
  });

  await ok('a duplicate chunk is ignored, not double-written', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const b = Buffer.alloc(CHUNK, 0x42);
      const whole = Buffer.concat([a, b]);
      const fileId = 'f-dup';
      h.tm.handleStart(start(fileId, 2, sha(whole), whole.length));
      h.tm.handleChunk(chunk(fileId, 0, a));
      h.tm.handleChunk(chunk(fileId, 0, a)); // replay
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 1);
      h.tm.handleChunk(chunk(fileId, 1, b));
      const res = await finish(h.tm, end(fileId));
      assert.strictEqual(res.ok, true, 'should complete: ' + res.err);
      assert.deepStrictEqual(fs.readFileSync(res.tempPath), whole);
      assert.strictEqual(h.of(Protocol.Types.FILE_TRANSFER_RESUME).length, 0, 'a duplicate is not a gap');
    } finally { h.cleanup(); }
  });

  await ok('a chunk with no receive and no resume-intent is dropped silently', async () => {
    const h = harness();
    try {
      h.tm.handleChunk(chunk('f-unknown', 0, Buffer.from('x')));
      assert.strictEqual(h.tm.activeReceives.size, 0, 'must not open a receive from a bare chunk');
      assert.strictEqual(h.of(Protocol.Types.FILE_TRANSFER_RESUME).length, 0, 'and must not reply');
    } finally { h.cleanup(); }
  });

  await ok('malformed chunkIndex is ignored', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(16, 0x41);
      const fileId = 'f-bad';
      h.tm.handleStart(start(fileId, 2, '', a.length + 16));
      for (const bad of [-1, 'nope', undefined, 1.5, NaN]) {
        h.tm.handleChunk({ from: PEER, type: Protocol.Types.FILE_CHUNK, payload: { fileId, chunkIndex: bad, data: a.toString('base64') } });
      }
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 0, 'none may be written');
    } finally { h.cleanup(); }
  });

  await ok('a numeric STRING chunkIndex is accepted (wire tolerance)', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(16, 0x41);
      const fileId = 'f-str';
      h.tm.handleStart(start(fileId, 1, sha(a), a.length));
      // The engine runs chunkIndex through Number(), so "0" is valid. Pinned
      // because tightening this to a strict typeof check would break any
      // transport that stringifies the index.
      h.tm.handleChunk({ from: PEER, type: Protocol.Types.FILE_CHUNK, payload: { fileId, chunkIndex: '0', data: a.toString('base64') } });
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 1);
    } finally { h.cleanup(); }
  });

  await ok('a null chunkIndex is coerced to 0 by Number() (known quirk)', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(16, 0x41);
      const fileId = 'f-null';
      h.tm.handleStart(start(fileId, 1, sha(a), a.length));
      // Number(null) === 0, so this is accepted as chunk 0 rather than rejected
      // as malformed. Harmless in practice (writing chunk 0 while expecting
      // chunk 0 is correct) but pinned here so the coercion is deliberate and
      // visible rather than a surprise.
      h.tm.handleChunk({ from: PEER, type: Protocol.Types.FILE_CHUNK, payload: { fileId, chunkIndex: null, data: a.toString('base64') } });
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 1);
    } finally { h.cleanup(); }
  });

  // ---- START handling ----------------------------------------------------

  await ok('a repeated START for an in-flight fileId does not reset progress', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const b = Buffer.alloc(CHUNK, 0x42);
      const fileId = 'f-restart';
      h.tm.handleStart(start(fileId, 2, sha(Buffer.concat([a, b])), a.length + b.length));
      h.tm.handleChunk(chunk(fileId, 0, a));
      h.tm.handleStart(start(fileId, 2, sha(Buffer.concat([a, b])), a.length + b.length));
      assert.strictEqual(h.tm.activeReceives.get(fileId).receivedCount, 1,
        'the in-flight transfer must continue, not restart');
    } finally { h.cleanup(); }
  });

  await ok('START is rejected when there is not enough disk space', async () => {
    const h = harness();
    try {
      // 1e18 bytes clears any real disk's 10%-buffered free space.
      h.tm.handleStart(start('f-big', 1, '', 1e18));
      const rejects = h.of(Protocol.Types.FILE_TRANSFER_REJECT);
      assert.strictEqual(rejects.length, 1, 'a REJECT must be sent');
      assert.strictEqual(rejects[0].payload.reason, 'disk_space');
      assert.strictEqual(h.tm.activeReceives.size, 0, 'no receive should be opened');
    } finally { h.cleanup(); }
  });

  // ---- END handling ------------------------------------------------------

  await ok('END with missing chunks requests RESUME and does not complete', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const b = Buffer.alloc(CHUNK, 0x42);
      const fileId = 'f-short';
      h.tm.handleStart(start(fileId, 2, sha(Buffer.concat([a, b])), a.length + b.length));
      h.tm.handleChunk(chunk(fileId, 0, a));
      const res = await finish(h.tm, end(fileId));
      assert.strictEqual(res.ok, false, 'must NOT complete on a short transfer');
      const resumes = h.of(Protocol.Types.FILE_TRANSFER_RESUME);
      assert.strictEqual(resumes.length, 1, 'a RESUME must be requested');
      assert.strictEqual(resumes[0].payload.receivedCount, 1);
      assert.ok(h.tm.activeReceives.has(fileId), 'the receive must stay open for the resume');
    } finally { h.cleanup(); }
  });

  await ok('END from a peer that does not own the transfer is refused', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(16, 0x41);
      const fileId = 'f-owner';
      h.tm.handleStart(start(fileId, 1, sha(a), a.length, PEER));
      h.tm.handleChunk(chunk(fileId, 0, a, PEER));
      const res = await finish(h.tm, end(fileId, OTHER_PEER));
      assert.strictEqual(res.ok, false, 'a foreign END must not complete the transfer');
      assert.ok(/non-owner/.test(res.err), 'the error should name the ownership check: ' + res.err);
    } finally { h.cleanup(); }
  });

  await ok('a hash mismatch on a FRESH transfer is non-fatal (CRIT-1)', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(16, 0x41);
      const fileId = 'f-hash';
      // Wrong hash on purpose — Android WebView vs desktop hashing differs, so the
      // engine deliberately saves anyway rather than losing the user's file.
      h.tm.handleStart(start(fileId, 1, 'deadbeef'.repeat(8), a.length));
      h.tm.handleChunk(chunk(fileId, 0, a));
      const res = await finish(h.tm, end(fileId));
      assert.strictEqual(res.ok, true, 'a fresh-transfer mismatch must still save: ' + res.err);
      assert.deepStrictEqual(fs.readFileSync(res.tempPath), a);
    } finally { h.cleanup(); }
  });

  // ---- cancel ------------------------------------------------------------

  await ok('cancelReceive drops the receive and deletes the partial', async () => {
    const h = harness();
    try {
      const a = Buffer.alloc(CHUNK, 0x41);
      const fileId = 'f-cancel';
      h.tm.handleStart(start(fileId, 2, '', a.length + 16));
      h.tm.handleChunk(chunk(fileId, 0, a));
      const tempPath = path.join(h.dir, 'orbit_' + fileId);
      // createWriteStream opens asynchronously — wait for the bytes to land.
      await new Promise(r => setTimeout(r, 60));
      assert.ok(fs.existsSync(tempPath), 'partial should exist before cancel');
      assert.strictEqual(h.tm.cancelReceive(fileId), true);
      assert.strictEqual(h.tm.activeReceives.size, 0);
      assert.strictEqual(fs.existsSync(tempPath), false, 'partial must be removed');
      assert.strictEqual(h.tm.cancelReceive(fileId), false, 'second cancel is a no-op');
    } finally { h.cleanup(); }
  });

  console.log('\n' + passed + ' passed');
})();
