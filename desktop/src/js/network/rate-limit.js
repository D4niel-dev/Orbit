'use strict';

/**
 * Token-bucket rate limiter for INBOUND packets.
 *
 * Orbit has no server in front of it, so nothing rate-limits a peer for you: a
 * misbehaving client can open a socket and send as fast as the link allows, and every
 * packet costs a JSON parse, a store write and a re-render. This is the local
 * equivalent of the rate limits a hosted messenger gets for free.
 *
 * ⚠⚠ IT TAKES `now` AS AN ARGUMENT rather than calling Date.now() itself. That is what
 * makes the refill testable: the alternative is fake timers around a class that has no
 * timers, which tests the harness instead of the maths. Callers pass nothing in
 * production and a number in tests.
 *
 * ⚠ A bucket per KEY, and the key is the peer once the peer is known and the source IP
 * before that. A handshake is a handful of packets, well inside the burst, so the
 * pre-identity window cannot lock anybody out.
 */
class TokenBucket {
  /**
   * @param {object} [opts]
   * @param {number} [opts.perSecond=20] sustained packets per second per key
   * @param {number} [opts.burst=60]     packets a key may send instantly from cold
   * @param {number} [opts.maxKeys=512]  above this, idle keys are swept
   */
  constructor(opts) {
    opts = opts || {};
    this.capacity = opts.burst != null ? opts.burst : 60;
    this.perSecond = opts.perSecond != null ? opts.perSecond : 20;
    this.maxKeys = opts.maxKeys != null ? opts.maxKeys : 512;

    // key -> { tokens: number, at: number }
    this.buckets = new Map();

    // Total packets refused since start. Exposed so a diagnostic can show that the
    // limiter is doing something — a limiter that silently drops is indistinguishable
    // from a network that silently loses packets.
    this.dropped = 0;
  }

  /**
   * Take one token for `key`. Returns true if the packet may be processed.
   * @param {string} key
   * @param {number} [now] ms since epoch; defaults to Date.now()
   */
  allow(key, now) {
    if (now == null) now = Date.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, at: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsed = now - bucket.at;
      // ⚠ Only forward in time. A backwards clock (NTP step, a test passing an older
      // stamp) must not mint tokens — `elapsed` negative would otherwise subtract.
      if (elapsed > 0) {
        bucket.tokens = Math.min(this.capacity, bucket.tokens + (elapsed * this.perSecond) / 1000);
        bucket.at = now;
      }
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      // Cheap amortised sweep: only once the map has grown past the ceiling.
      if (this.buckets.size > this.maxKeys) this.prune(now, 60000);
      return true;
    }

    this.dropped += 1;
    return false;
  }

  /** Drop buckets that have been idle for longer than `idleMs`. */
  prune(now, idleMs) {
    if (now == null) now = Date.now();
    const idle = idleMs != null ? idleMs : 60000;
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.at > idle) { this.buckets.delete(key); removed += 1; }
    }
    return removed;
  }

  /** Forget one key — called when a peer disconnects, so a reconnect starts cold. */
  forget(key) {
    return this.buckets.delete(key);
  }

  /** Tokens currently available to `key`, refilled to `now`. Read-only. */
  available(key, now) {
    if (now == null) now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket) return this.capacity;
    const elapsed = Math.max(0, now - bucket.at);
    return Math.min(this.capacity, bucket.tokens + (elapsed * this.perSecond) / 1000);
  }
}

module.exports = { TokenBucket };
