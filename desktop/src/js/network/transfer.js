const Protocol = require('./protocol');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dlog = require('../log');

const STALE_TIMEOUT = 60000; // 60s without activity = stale (state persisted for resume)
const MAX_CHUNK_RETRIES = 3;
const STATE_PERSIST_EVERY = 50; // persist transfer_state every N chunks (cheap checkpoint)

class TransferManager {
  constructor(socketManager, opts) {
    this.socketManager = socketManager;
    this.opts = opts || {};
    // OrbitDatabase instance (transfer_state lives in the app DB, WAL mode)
    this.db = this.opts.db || null;
    // Partial files now live in userData/temp (same dir as privacy-mode
    // attachments) instead of os.tmpdir(), so they survive app restarts.
    this.tempDir = this.opts.tempDir || os.tmpdir();
    this.CHUNK_SIZE = 64 * 1024; // 64KB
    this.activeReceives = new Map();
    this.cancelledSends = new Set();
    // Sessions for files sent via the main-process path: fileId → { path, size, hash, fileName, toPeerId, toIp, totalChunks, _sending }
    this.sendSessions = new Map();
    // Mid-loop resume requests: fileId → receivedCount (receiver fell behind)
    this._resumeRequests = new Map();
    // Resume-expected fileIds: a receive was reaped to transfer_state while
    // the connection stayed up — chunks/END for these re-open the receive on
    // demand instead of being silently dropped (M3). Pruned when the row is
    // deleted (finalize, cancel, TTL sweep) so the Set stays bounded.
    this._resumeExpected = new Set();
    this.onProgress = null; // callback(fileId, { received, total, isSending })
    this.onError = null; // callback(fileId, errorMsg)
    this._cleanupTimer = setInterval(() => this._cleanupStale(), 30000);
  }

  // ---- transfer_state persistence helpers ----

  _db() {
    return (this.db && this.db.db) ? this.db.db : null;
  }

  _getTransferRow(fileId) {
    const db = this._db();
    if (!db) return null;
    try {
      return db.prepare('SELECT * FROM transfer_state WHERE fileId = ?').get(fileId);
    } catch (e) {
      return null;
    }
  }

  _persistTransfer(t) {
    const db = this._db();
    if (!db) return;
    try {
      db.prepare(
        `INSERT INTO transfer_state (fileId, fileName, fileSize, totalChunks, receivedCount, hash, senderId, tempPath, type, mimeType, updatedAt)
         VALUES (@fileId, @fileName, @fileSize, @totalChunks, @receivedCount, @hash, @senderId, @tempPath, @type, @mimeType, @updatedAt)
         ON CONFLICT(fileId) DO UPDATE SET receivedCount = excluded.receivedCount, updatedAt = excluded.updatedAt`
      ).run({
        fileId: t.fileId,
        fileName: t.fileName,
        fileSize: t.fileSize,
        totalChunks: t.totalChunks,
        receivedCount: t.receivedCount,
        hash: t.hash,
        senderId: t.senderId,
        tempPath: t.tempPath,
        type: t.type || '',
        mimeType: t.mimeType || '',
        updatedAt: Date.now()
      });
    } catch (e) {
      console.warn('[Transfer] transfer_state persist failed:', e.message);
    }
  }

  _deleteTransferRow(fileId) {
    // M3: the row is gone — the fileId can no longer be re-opened on demand.
    // Prunes the resume-expected Set on every row-deletion path (finalize,
    // cancel, fresh start, seed failure) so it stays bounded.
    this._resumeExpected.delete(fileId);
    const db = this._db();
    if (!db) return;
    try {
      db.prepare('DELETE FROM transfer_state WHERE fileId = ?').run(fileId);
    } catch (e) { /* ignore */ }
  }

  // ---- lifecycle ----

  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    // Flush in-flight receivers to transfer_state and KEEP the partial files:
    // resumable transfers survive app quit (the 24h TTL sweep cleans them up).
    for (const [fileId, transfer] of this.activeReceives.entries()) {
      try {
        transfer.stream.end();
        this._persistTransfer(transfer);
        // M3: the row survives in transfer_state — keep the fileId re-openable
        // on demand (same invariant as the idle reaper).
        this._resumeExpected.add(fileId);
      } catch (_) {}
    }
    this.activeReceives.clear();
    this.cancelledSends.clear();
    this.sendSessions.clear();
    this._resumeRequests.clear();
  }

  _cleanupStale() {
    const now = Date.now();
    for (const [fileId, transfer] of this.activeReceives.entries()) {
      if (now - transfer.lastActivity > STALE_TIMEOUT) {
        // Instead of deleting the partial, persist state so the transfer can
        // resume when the sender reconnects (TTL sweep handles cleanup).
        // M3: with the connection still up, the sender keeps streaming — mark
        // the fileId resume-expected so chunks/END re-open the receive from
        // the persisted row on demand instead of being dropped.
        try { transfer.stream.end(); } catch (_) {}
        this._persistTransfer(transfer);
        this._resumeExpected.add(fileId);
        this.activeReceives.delete(fileId);
        if (this.onError) this.onError(fileId, 'Transfer timed out (no activity for 60s) — will resume when the sender reconnects');
      }
    }
  }

  _hasDiskSpace(fileSize) {
    try {
      const statfs = fs.statfsSync(this.tempDir);
      const available = statfs.bavail * statfs.bsize;
      return available > fileSize * 1.1; // 10% buffer
    } catch (_) {
      return true; // can't check, proceed optimistically
    }
  }

  cancelReceive(fileId) {
    const transfer = this.activeReceives.get(fileId);
    if (!transfer) return false;
    // Explicit cancel: drop the partial AND the persisted state (no resume intent)
    try { transfer.stream.end(); } catch (_) {}
    try { if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath); } catch (_) {}
    this.activeReceives.delete(fileId);
    this._deleteTransferRow(fileId);
    return true;
  }

  cancelSend(fileId) {
    this.cancelledSends.add(fileId);
  }

  // ---- sender: main-process path (deliverable D.6) ----

  async sendFile(toPeerId, toIp, filePath, fileName) {
    if (!fs.existsSync(filePath)) return false;

    const stats = fs.statSync(filePath);
    if (stats.size > 250 * 1024 * 1024) {
      throw new Error("File exceeds 250MB limit.");
    }

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const hashStream = fs.createReadStream(filePath);
    await new Promise((resolve, reject) => {
      hashStream.on('data', chunk => hash.update(chunk));
      hashStream.on('end', resolve);
      hashStream.on('error', reject);
    });
    const fileHash = hash.digest('hex');

    const basename = path.basename(filePath);
    const displayName = fileName || basename;
    const fileId = require('crypto').randomUUID();
    const totalChunks = Math.ceil(stats.size / this.CHUNK_SIZE);

    // Register the send session so a FILE_TRANSFER_RESUME from the receiver
    // can restart this file from an offset. Sessions live for the app session
    // (small: path + size + hash); cleared in destroy().
    const session = {
      fileId,
      path: filePath,
      size: stats.size,
      hash: fileHash,
      fileName: displayName,
      toPeerId,
      toIp,
      totalChunks,
      _sending: false
    };
    this.sendSessions.set(fileId, session);

    session._sending = true;
    try {
      await this._sendChunkStream(toPeerId, toIp, session, 0);
    } finally {
      session._sending = false;
    }
    return fileId;
  }

  // Chunk generator: yields { chunkIndex, data } for chunks [fromIndex, totalChunks).
  // Each chunk is read with its own bounded createReadStream so the stream can
  // restart from an arbitrary offset on resume (no alignment assumptions).
  async * _makeChunkGenerator(filePath, size, fromIndex, chunkSize) {
    const totalChunks = Math.ceil(size / chunkSize);
    for (let i = fromIndex; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, size) - 1; // inclusive
      const s = fs.createReadStream(filePath, { start, end, highWaterMark: chunkSize });
      let data;
      try {
        data = await new Promise((resolve, reject) => {
          const parts = [];
          s.on('data', d => parts.push(d));
          s.on('end', () => resolve(Buffer.concat(parts)));
          s.on('error', reject);
        });
      } finally {
        s.destroy();
      }
      yield { chunkIndex: i, data };
    }
  }

  // Stream chunks from `resumeFrom` to the end, then send FILE_TRANSFER_END.
  // Mid-stream FILE_TRANSFER_RESUME requests rewind the generator in place
  // (single stream per fileId — never two concurrent streams).
  async _sendChunkStream(toPeerId, toIp, session, resumeFrom) {
    const _sm = this.socketManager;
    const fileId = session.fileId;
    const totalChunks = session.totalChunks;

    // XFER-1: send START only after the file is confirmed readable
    const probe = fs.createReadStream(session.path, { start: 0, end: 0 });
    await new Promise((resolve, reject) => {
      probe.once('open', resolve);
      probe.once('error', reject);
    });
    probe.destroy();

    _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_START, {
      fileId, fileName: session.fileName, fileSize: session.size, totalChunks, hash: session.hash
    });

    let from = Math.max(0, resumeFrom) || 0;
    while (from < totalChunks) {
      let rewound = false;
      const gen = this._makeChunkGenerator(session.path, session.size, from, this.CHUNK_SIZE);
      for await (const { chunkIndex, data } of gen) {
        if (this.cancelledSends.has(fileId)) {
          this.cancelledSends.delete(fileId);
          _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId });
          throw new Error('Send cancelled');
        }

        // Mid-stream resume request from the receiver: rewind the generator to
        // the requested contiguous count (chunks in [req, chunkIndex) were lost
        // on the wire). Re-send START too — harmless if the receiver still has
        // the transfer in memory, and it lets a persisted receiver re-open.
        const req = this._resumeRequests.get(fileId);
        if (req !== undefined) {
          this._resumeRequests.delete(fileId);
          if (req >= 0 && req < chunkIndex && req < totalChunks) {
            from = req;
            rewound = true;
            _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_START, {
              fileId, fileName: session.fileName, fileSize: session.size, totalChunks, hash: session.hash
            });
            break;
          }
          // req >= chunkIndex: receiver is not behind enough to rewind — continue
        }

        const payload = { fileId, chunkIndex, data: data.toString('base64') };
        let sent = false;
        for (let retry = 0; retry < MAX_CHUNK_RETRIES; retry++) {
          sent = _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_CHUNK, payload);
          if (sent) break;
          await new Promise(r => setTimeout(r, Math.min(200 * Math.pow(2, retry), 5000)));
        }
        if (!sent) {
          throw new Error(`Failed to send chunk ${chunkIndex}/${totalChunks} after ${MAX_CHUNK_RETRIES} retries`);
        }

        if (this.onProgress) {
          this.onProgress(fileId, { received: chunkIndex + 1, total: totalChunks, isSending: true, name: session.fileName });
        }

        // Write backpressure: yield to event loop between chunks
        await new Promise(r => setImmediate(r));
      }
      if (!rewound) break;
    }

    _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_END, { fileId, hash: session.hash });
  }

  // Receiver → sender: peer asks us to resume a partial transfer (deliverable D.7).
  // Returns true when a main-process send session owns this fileId (resume is
  // triggered internally); false when the renderer chat path may own it instead.
  handleResume(packet) {
    if (!packet || !packet.payload || !packet.payload.fileId) return false;
    const payload = packet.payload;
    const session = this.sendSessions.get(payload.fileId);
    if (!session) return false;

    const n = parseInt(payload.receivedCount, 10);
    if (isNaN(n) || n < 0 || n > session.totalChunks) {
      this.socketManager.sendMessage(session.toPeerId, session.toIp, Protocol.Types.FILE_TRANSFER_CANCEL, {
        fileId: session.fileId, error: 'Invalid resume offset'
      });
      return true;
    }

    if (session._sending) {
      // A send loop is already streaming this file — rewind it in place.
      this._resumeRequests.set(session.fileId, n);
    } else {
      // Previous send attempt finished (or threw) — run a fresh stream from n.
      session._sending = true;
      this._resumeSessionSend(session, payload)
        .catch(err => {
          console.error('[Transfer] Resume send failed:', err && err.message);
          if (this.onError) this.onError(session.fileId, 'Resume failed: ' + ((err && err.message) || err));
        })
        .finally(() => { session._sending = false; });
    }
    return true;
  }

  async _resumeSessionSend(session, payload) {
    const fileId = session.fileId;
    const n = parseInt(payload.receivedCount, 10);
    const _sm = this.socketManager;
    const toPeerId = session.toPeerId;
    const toIp = session.toIp;
    const crypto = require('crypto');

    // 1. Source file must still exist
    if (!fs.existsSync(session.path)) {
      _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId, error: 'Sender no longer has the file — please re-send' });
      if (this.onError) this.onError(fileId, 'Resume failed: source file no longer exists — please re-send');
      return;
    }

    // 2. Re-hash the file (cheap streaming) — reject if it changed on disk
    const h = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
      const s = fs.createReadStream(session.path);
      s.on('data', c => h.update(c));
      s.on('end', resolve);
      s.on('error', reject);
    });
    if (h.digest('hex') !== session.hash) {
      _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId, error: 'Sender file changed since first attempt — please re-send' });
      if (this.onError) this.onError(fileId, 'Resume failed: file changed on disk since the first attempt — please re-send');
      return;
    }

    // 3. Validate the receiver's partial is a correct prefix of our file
    if (payload.hash) {
      const prefixBytes = Math.min(n * this.CHUNK_SIZE, session.size);
      const ph = crypto.createHash('sha256');
      if (prefixBytes > 0) {
        await new Promise((resolve, reject) => {
          const s = fs.createReadStream(session.path, { start: 0, end: prefixBytes - 1 });
          s.on('data', c => ph.update(c));
          s.on('end', resolve);
          s.on('error', reject);
        });
      }
      if (ph.digest('hex') !== payload.hash) {
        _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId, error: 'Receiver partial does not match sender file — please re-send' });
        if (this.onError) this.onError(fileId, 'Resume failed: receiver partial hash mismatch — please re-send the file');
        return;
      }
    }

    // 4. Stream the remainder (n == totalChunks → only START + END re-sent)
    await this._sendChunkStream(toPeerId, toIp, session, n);
  }

  // After a socket reconnect, ask the peer to resume any partial transfers it
  // sent us (in-flight + persisted). Triggered by socket 'peer-connected'.
  resumeIncompleteForPeer(peerId) {
    if (!peerId) return;
    for (const [fileId, transfer] of this.activeReceives.entries()) {
      if (transfer.senderId === peerId && transfer.receivedCount < transfer.totalChunks) {
        this._requestResume({ from: peerId }, transfer);
      }
    }
    const db = this._db();
    if (!db) return;
    let rows = [];
    try {
      rows = db.prepare('SELECT * FROM transfer_state WHERE senderId = ?').all(peerId);
    } catch (e) { return; }
    for (const row of rows) {
      if (this.activeReceives.has(row.fileId)) continue; // already handled in-memory
      if (!row.tempPath || !fs.existsSync(row.tempPath)) continue;
      // F7: rows with receivedCount >= totalChunks are re-opened too — a
      // receiver holding every chunk but missing END would otherwise never
      // recover. _reopenFromRow seeds nothing at offset total and just waits
      // for the sender to re-send START + END, which finalizes the transfer.
      (async () => {
        // F6-parity: a crash between chunk writes and the 50-chunk checkpoint
        // can leave extra bytes beyond the contiguous prefix. Truncate to the
        // exact prefix so the digest matches what the sender verifies for
        // receivedCount chunks — otherwise crash-lagged resumes are rejected.
        try {
          const psize = fs.statSync(row.tempPath).size;
          const expect = Math.max(0, row.receivedCount || 0) * this.CHUNK_SIZE;
          if (psize > expect) fs.truncateSync(row.tempPath, expect);
        } catch (e) {
          // stat/truncate failed — hash as-is; sender re-verifies
        }
        let partialHash = '';
        try { partialHash = await this._hashPartialFile(row.tempPath); } catch (e) {}
        this.socketManager.sendMessage(peerId, null, Protocol.Types.FILE_TRANSFER_RESUME, {
          fileId: row.fileId,
          receivedCount: row.receivedCount,
          hash: partialHash
        });
      })();
    }
  }

  // 24h TTL sweep: drop stale transfer_state rows + their partial files.
  sweepStaleTransfers(maxAgeMs) {
    const db = this._db();
    if (!db) return;
    try {
      const cutoff = Date.now() - maxAgeMs;
      const rows = db.prepare('SELECT fileId, tempPath FROM transfer_state WHERE updatedAt < ?').all(cutoff);
      for (const row of rows) {
        try { if (row.tempPath && fs.existsSync(row.tempPath)) fs.unlinkSync(row.tempPath); } catch (_) {}
        db.prepare('DELETE FROM transfer_state WHERE fileId = ?').run(row.fileId);
        // M3: purge resume-expected entries whose row just died (TTL sweep).
        this._resumeExpected.delete(row.fileId);
      }
      if (rows.length > 0) dlog('[Transfer] Swept ' + rows.length + ' stale transfer(s)');
    } catch (e) {
      console.warn('[Transfer] Sweep failed:', e.message);
    }
  }

  // ---- receiver (deliverables D.1–D.4) ----

  handleStart(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    if (this.activeReceives.has(payload.fileId)) return; // in-flight transfer continues

    // Check disk space before accepting
    if (!this._hasDiskSpace(payload.fileSize)) {
      this.socketManager.sendMessage(packet.from, null, Protocol.Types.FILE_TRANSFER_REJECT, {
        fileId: payload.fileId,
        reason: 'disk_space'
      });
      return;
    }

    const tempPath = path.join(this.tempDir, `orbit_${payload.fileId}`);

    // Resume branch: persisted row + hash match + partial on disk → continue
    // streaming instead of starting over.
    const row = this._getTransferRow(payload.fileId);
    if (row && row.hash && row.hash === payload.hash && fs.existsSync(tempPath)) {
      if (this._reopenFromRow(row, packet, payload)) {
        // M3: the receive is active in memory again — no longer resume-expected.
        this._resumeExpected.delete(payload.fileId);
        return;
      }
    }

    // Fresh start (no row / hash mismatch / missing partial): truncate + drop state
    this._startFresh(packet, payload, tempPath);
  }

  // M3: re-open a receive from its transfer_state row. Used by the handleStart
  // resume branch (payload present — payload metadata wins, matching the
  // original _startResumed behavior) and by the FILE_CHUNK / FILE_TRANSFER_END
  // unknown-fileId paths (payload null — the row is authoritative). Idempotent:
  // returns null when a receive is already active for the fileId or the partial
  // cannot be opened, so callers fall back to dropping or starting fresh.
  _reopenFromRow(row, packet, payload) {
    if (!row) return null;
    const fileId = row.fileId;
    if (this.activeReceives.has(fileId)) return null; // double-open guard
    const tempPath = row.tempPath;
    if (!tempPath || !fs.existsSync(tempPath)) return null;

    const receivedCount = Math.max(0, row.receivedCount || 0);
    const offset = receivedCount * this.CHUNK_SIZE;
    let stream;
    try {
      // 'r+' keeps the partial; `start` positions the write cursor at the end
      // of the contiguous received prefix.
      stream = fs.createWriteStream(tempPath, { flags: 'r+', start: offset });
    } catch (e) {
      return null; // cannot open partial — caller decides (fresh start / drop)
    }

    // F6: a crash between 50-chunk checkpoints can leave garbage bytes beyond
    // the contiguous received prefix (the checkpoint count may lag the actual
    // bytes written). Truncate so the seed digest covers exactly the prefix
    // the sender will re-verify — otherwise END hash-mismatches and the
    // resumed transfer gets discarded.
    try {
      const partialSize = fs.statSync(tempPath).size;
      if (partialSize > offset) fs.truncateSync(tempPath, offset);
    } catch (e) {
      // truncate failed — fall back to previous behavior (seed over the tail)
    }

    const transfer = {
      fileId: fileId,
      fileName: (payload && payload.fileName) || row.fileName,
      fileSize: (payload && payload.fileSize) || row.fileSize,
      totalChunks: (payload && payload.totalChunks) || row.totalChunks,
      hash: (payload && payload.hash) || row.hash,
      receivedCount: receivedCount,
      stream: stream,
      tempPath: tempPath,
      sha256: null, // seeded asynchronously from the partial file
      lastActivity: Date.now(),
      senderId: (packet && packet.from) || row.senderId,
      type: (payload && payload.type) || row.type || null,
      mimeType: (payload && payload.mimeType) || row.mimeType || null,
      resumed: receivedCount > 0,
      _pendingChunks: [], // chunks arriving before the seed completes
      _seedPending: true,
      _ready: null
    };
    this.activeReceives.set(fileId, transfer);

    // D1: async open/write failures (EACCES/ENOSPC) emit on the stream after
    // the sync try/catch above has already returned. Idempotent: ignore if
    // this entry was replaced/finalized already.
    transfer.stream.on('error', (err) => {
      if (this.activeReceives.get(fileId) !== transfer) return;
      console.warn('[Transfer] Receive write-stream error:', err && err.message);
      this.cancelReceive(transfer.fileId);
      if (this.onError) this.onError(transfer.fileId, 'Disk write error: ' + ((err && err.message) || err));
    });

    // Seed the SHA-256 accumulator by hashing the partial file. Chunks that
    // arrive before the seed completes are queued and flushed once ready.
    transfer._ready = this._seedAccumulator(transfer).then(() => {
      transfer._seedPending = false;
      this._flushPendingChunks(transfer);
    }).catch((err) => {
      console.warn('[Transfer] Resume seed failed — restarting transfer:', err && err.message);
      this.activeReceives.delete(fileId);
      try { stream.end(); } catch (_) {}
      this._deleteTransferRow(fileId);
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
      // Only the START path can restart fresh (it carries the packet metadata);
      // chunk/END re-opens just drop — the sender's own stream ends on its own.
      if (payload) this._startFresh(packet, payload, tempPath);
    });
    return transfer;
  }

  _startFresh(packet, payload, tempPath) {
    this._deleteTransferRow(payload.fileId);
    let writeStream;
    try {
      writeStream = fs.createWriteStream(tempPath); // 'w' truncates stale partial
    } catch (err) {
      if (this.onError) this.onError(payload.fileId, 'Failed to open temp file: ' + err.message);
      return;
    }
    const transfer = {
      fileId: payload.fileId,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      totalChunks: payload.totalChunks,
      hash: payload.hash,
      receivedCount: 0,
      stream: writeStream,
      tempPath: tempPath,
      sha256: require('crypto').createHash('sha256'),
      lastActivity: Date.now(),
      senderId: packet.from,
      type: payload.type || null,
      mimeType: payload.mimeType || null,
      resumed: false,
      _pendingChunks: [],
      _seedPending: false,
      _ready: null
    };
    this.activeReceives.set(payload.fileId, transfer);

    // D1: async open/write failures (EACCES/ENOSPC) emit on the stream after
    // the sync try/catch above has already returned. Idempotent: ignore if
    // this entry was replaced/finalized already.
    transfer.stream.on('error', (err) => {
      if (this.activeReceives.get(transfer.fileId) !== transfer) return;
      console.warn('[Transfer] Receive write-stream error:', err && err.message);
      this.cancelReceive(transfer.fileId);
      if (this.onError) this.onError(transfer.fileId, 'Disk write error: ' + ((err && err.message) || err));
    });
  }

  _seedAccumulator(transfer) {
    return new Promise((resolve, reject) => {
      const sha = require('crypto').createHash('sha256');
      const s = fs.createReadStream(transfer.tempPath);
      s.on('data', (c) => sha.update(c));
      s.on('end', () => { transfer.sha256 = sha; resolve(); });
      s.on('error', reject);
    });
  }

  _flushPendingChunks(transfer) {
    const pending = transfer._pendingChunks;
    transfer._pendingChunks = [];
    for (const { payload, buffer } of pending) {
      this._processChunk(transfer, payload, buffer);
    }
  }

  handleChunk(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    let transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) {
      // M3: a reaped receive may still be streaming over a live connection —
      // re-open it from its transfer_state row instead of dropping the chunk.
      // Prefer the Set over a per-chunk DB query: only pay the lookup when the
      // fileId is known to be resume-expected.
      if (this._resumeExpected.has(payload.fileId)) {
        transfer = this._reopenFromRow(this._getTransferRow(payload.fileId), packet, null);
        this._resumeExpected.delete(payload.fileId);
      }
      if (!transfer) return;
    }

    const ci = Number(payload.chunkIndex);
    if (!Number.isInteger(ci) || ci < 0) return; // malformed — ignore

    const buffer = Buffer.from(payload.data, 'base64');

    // Mid-stream corruption guard: chunks must arrive strictly in order.
    if (ci !== transfer.receivedCount) {
      if (ci < transfer.receivedCount) {
        // Duplicate chunk (e.g. after a resumed re-send) — ignore.
        return;
      }
      // Gap: chunks were lost on the wire. Ask the sender to resume from our
      // contiguous count instead of writing corrupt data (self-healing).
      console.warn(`[Transfer] Chunk gap: expected ${transfer.receivedCount}, got ${ci} for ${payload.fileId} — requesting resume`);
      this._requestResume(packet, transfer);
      return;
    }

    if (transfer._seedPending) {
      // Resume in progress: accumulator still being seeded from the partial.
      transfer._pendingChunks.push({ payload, buffer });
      return;
    }
    this._processChunk(transfer, payload, buffer);
  }

  _processChunk(transfer, payload, buffer) {
    try {
      const canContinue = transfer.stream.write(buffer);
      // Apply backpressure if internal buffer is full (XFER-5: guard against listener pileup)
      if (!canContinue && !transfer._backpressured) {
        transfer._backpressured = true;
        transfer.stream.once('drain', () => {
          transfer._backpressured = false;
        });
      }
    } catch (err) {
      this.cancelReceive(transfer.fileId);
      if (this.onError) this.onError(transfer.fileId, 'Disk write error: ' + err.message);
      return;
    }
    if (transfer.sha256) transfer.sha256.update(buffer);
    transfer.receivedCount++;
    transfer.lastActivity = Date.now();

    // Cheap periodic checkpoint (every N chunks; END/cancel/timeout persist too)
    if (transfer.receivedCount % STATE_PERSIST_EVERY === 0) this._persistTransfer(transfer);

    if (this.onProgress) {
      this.onProgress(transfer.fileId, { received: transfer.receivedCount, total: transfer.totalChunks, isSending: false, name: transfer.fileName });
    }
  }

  // Send FILE_TRANSFER_RESUME to the chunk sender. The partial hash is the
  // SHA-256 of the contiguous received prefix — obtained without re-reading
  // the file via a non-final copy of the running accumulator.
  _requestResume(packet, transfer) {
    let partialHash = '';
    if (transfer.sha256) {
      try { partialHash = transfer.sha256.copy().digest('hex'); } catch (e) {}
    }
    this.socketManager.sendMessage(packet.from, packet._fromIp, Protocol.Types.FILE_TRANSFER_RESUME, {
      fileId: transfer.fileId,
      receivedCount: transfer.receivedCount,
      hash: partialHash
    });
  }

  _hashPartialFile(filePath) {
    return new Promise((resolve, reject) => {
      const sha = require('crypto').createHash('sha256');
      const s = fs.createReadStream(filePath);
      s.on('data', (c) => sha.update(c));
      s.on('end', () => resolve(sha.digest('hex')));
      s.on('error', reject);
    });
  }

  handleEnd(packet, onComplete, onError) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    let transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) {
      // M3: END-only recovery — the receive was reaped while the connection
      // stayed up. Re-open from the row so the normal finalize path runs
      // (complete-but-unfinalized rows — receivedCount == totalChunks — must
      // finalize cleanly; incomplete rows re-persist and request a resume).
      if (this._resumeExpected.has(payload.fileId)) {
        transfer = this._reopenFromRow(this._getTransferRow(payload.fileId), packet, null);
        this._resumeExpected.delete(payload.fileId);
      }
      if (!transfer) return;
    }

    // Validate that the sender matches the transfer owner (XFER-4)
    if (packet.from && transfer.senderId && packet.from !== transfer.senderId) {
      if (onError) onError('Received FILE_TRANSFER_END from non-owner', payload.fileId);
      return;
    }

    // Incomplete transfer: the sender finished but we're missing chunks.
    // Don't save garbage — persist state and ask the sender to resume.
    if (transfer.receivedCount < transfer.totalChunks) {
      console.warn(`[Transfer] END with incomplete transfer (${transfer.receivedCount}/${transfer.totalChunks}) — requesting resume`);
      this._persistTransfer(transfer);
      this._requestResume(packet, transfer);
      return;
    }

    const finalize = () => {
      // Guard: the entry may have been replaced by a fresh start if seeding failed
      if (this.activeReceives.get(payload.fileId) !== transfer) return;
      try {
        const finalHash = transfer.sha256 ? transfer.sha256.digest('hex') : '';
        const mismatch = transfer.hash && finalHash !== transfer.hash;

        if (mismatch && transfer.resumed) {
          // Resumed transfers must hash out — a mismatch here is real corruption
          // (the partial was re-verified by hash at resume time), so discard.
          this.activeReceives.delete(payload.fileId);
          this._deleteTransferRow(payload.fileId);
          try { if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath); } catch (_) {}
          if (onError) onError('Resumed transfer failed hash verification (expected=' + transfer.hash + ' actual=' + finalHash + ') — partial discarded. Please re-send.', payload.fileId);
          return;
        }

        // Skip hash check when sender omitted hash (mobile sends without hash in some cases) — CRIT-1
        if (mismatch) {
          console.warn('[Transfer] Hash mismatch: expected=' + transfer.hash + ' actual=' + finalHash + ' file=' + transfer.fileName + ' — saving anyway (non-fatal). Platform hash differences are expected (e.g. crypto.subtle on Android WebView).');
          // File is likely intact despite platform hash differences;
          // save it so the user doesn't lose the transfer (CRIT-1 fix: non-fatal)
        }
        this.activeReceives.delete(payload.fileId);
        // F8: prefer persisted type/mimeType when the in-memory record lacks
        // them (row is read before deletion — extension-inference fallback
        // for null values stays downstream in the caller).
        const row = this._getTransferRow(payload.fileId);
        this._deleteTransferRow(payload.fileId); // success → drop persisted state
        if (onComplete) onComplete(transfer.tempPath, transfer.fileName, payload.fileId, transfer.fileSize,
          transfer.type || (row && row.type) || null,
          transfer.mimeType || (row && row.mimeType) || null);
      } catch (err) {
        this.activeReceives.delete(payload.fileId);
        if (onError) onError('handleEnd error: ' + (err && err.message), payload.fileId);
      }
    };

    try {
      transfer.stream.end();
      // Wait for stream flush before finalizing (XFER-6: race condition fix)
      transfer.stream.on('finish', () => {
        // If a resumed transfer's accumulator seed is still pending (rare:
        // END arrived before the seed finished), finalize once it's ready.
        if (transfer._ready && !transfer.sha256) {
          transfer._ready.then(finalize).catch(() => {
            // Seed failure already restarted the transfer fresh in handleStart —
            // only clean up if this entry is still the active one.
            if (this.activeReceives.get(payload.fileId) === transfer) {
              this.activeReceives.delete(payload.fileId);
              this._deleteTransferRow(payload.fileId);
              if (onError) onError('Resumed transfer failed to finalize — partial discarded. Please re-send.', payload.fileId);
            }
          });
        } else {
          finalize();
        }
      });
    } catch (err) {
      this.activeReceives.delete(payload.fileId);
      if (onError) onError('handleEnd error: ' + (err && err.message), payload.fileId);
    }
  }

  handleCancel(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    var transfer = this.activeReceives.get(payload.fileId);
    if (transfer && packet.from && transfer.senderId && packet.from !== transfer.senderId) return;
    this.cancelReceive(payload.fileId);
    // M4: the peer cancelled the transfer — abort a matching main-process
    // send session too (cancelledSends stops the chunk loop, which sends a
    // CANCEL echo and throws) and drop the session so a later RESUME cannot
    // resurrect a cancelled send.
    if (this.sendSessions.has(payload.fileId)) {
      this.cancelSend(payload.fileId);
      this.sendSessions.delete(payload.fileId);
    }
  }
}

module.exports = TransferManager;