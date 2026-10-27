// shared/security/content-filter.js
//
// Pillar 2: hash-based content filtering. A user flags a file they were sent; the hash
// goes on a local list; the same bytes arriving again are not rendered.
//
// ⚠⚠ SHA-256 MATCHES EXACT COPIES ONLY. Re-encode an image, add one byte, or screenshot
// it and the hash changes completely. So this stops a file being forwarded around
// unchanged — the actual complaint in most group chats — and does nothing about someone
// determined to redistribute the content. It is a filter, not a detector, and the UI
// should not promise more than that.
//
// ⚠ THE LIST IS LOCAL. Nothing here is shared with anyone. That is pillar 1's job
// (reputation.js), and keeping them separate means a user can hide something from their
// own screen without making any claim about another person.
(function () {
  var STORAGE_KEY = 'flagged_hashes';
  var ALGO = 'SHA-256';

  var memory = {};
  var storage = {
    get: function (k) {
      if (window.Storage && window.Storage.get) return window.Storage.get(k);
      if (typeof localStorage !== 'undefined') return localStorage.getItem('orbit_' + k);
      return memory[k] || null;
    },
    set: function (k, v) {
      if (window.Storage && window.Storage.set) return window.Storage.set(k, v);
      if (typeof localStorage !== 'undefined') return localStorage.setItem('orbit_' + k, v);
      memory[k] = v;
    }
  };

  // attachmentId -> hash. In-memory only: it saves re-hashing the same image on every
  // render, and a stale entry is harmless because the hash is of the bytes, not the id.
  var hashCache = {};

  function toHex(buf) {
    var bytes = new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var h = bytes[i].toString(16);
      out += h.length === 1 ? '0' + h : h;
    }
    return out;
  }

  /** SHA-256 of raw bytes, lowercase hex. */
  function hashBytes(bytes) {
    if (!bytes || !window.crypto || !crypto.subtle) return Promise.reject(new Error('WebCrypto is unavailable'));
    var view = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    return crypto.subtle.digest(ALGO, view).then(toHex);
  }

  /** SHA-256 of a data: URL's payload — the shape images already sit in on screen. */
  function hashDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('base64,') === -1) {
      return Promise.reject(new Error('not a base64 data URL'));
    }
    var b64 = dataUrl.slice(dataUrl.indexOf('base64,') + 7);
    try {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return hashBytes(bytes);
    } catch (e) {
      return Promise.reject(new Error('could not decode the data URL'));
    }
  }

  function readList() {
    var raw = storage.get(STORAGE_KEY);
    if (!raw) return [];
    try {
      var list = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function writeList(list) {
    storage.set(STORAGE_KEY, JSON.stringify(list));
  }

  /** Flag a hash. Idempotent — flagging the same bytes twice keeps one entry. */
  function flag(hash, meta) {
    if (!hash || typeof hash !== 'string') return readList();
    var list = readList();
    if (list.some(function (e) { return e.hash === hash; })) return list;
    list.push({
      hash: hash,
      ts: Date.now(),
      name: (meta && meta.name) || '',
      mimeType: (meta && meta.mimeType) || ''
    });
    writeList(list);
    return list;
  }

  function unflag(hash) {
    var list = readList().filter(function (e) { return e.hash !== hash; });
    writeList(list);
    return list;
  }

  function isFlagged(hash) {
    if (!hash) return false;
    return readList().some(function (e) { return e.hash === hash; });
  }

  function all() { return readList(); }

  /**
   * Should this attachment be hidden?
   * ⚠ Synchronous and cache-only: the render path must never wait on a digest, or the
   * message list stalls while an image is hashed. The hash is computed once, when the
   * attachment is first seen or reported, and this reads the cache.
   */
  function shouldHide(attachmentId) {
    var h = hashCache[attachmentId];
    return !!(h && isFlagged(h));
  }

  function remember(attachmentId, hash) {
    if (attachmentId && hash) hashCache[attachmentId] = hash;
    return hashCache[attachmentId];
  }

  function hashFor(attachmentId) {
    return hashCache[attachmentId] || null;
  }

  /**
   * Fetch an attachment's bytes, hash them, and cache the result. Resolves to
   * { hash, flagged }.
   *
   * ⚠ ONE FETCH PER ATTACHMENT, EVER. The hash is cached by attachment id, so re-rendering
   * a conversation does not re-download every image. The cache is in-memory on purpose: a
   * persisted one would go stale the moment a blob is replaced, and a wrong hash means
   * either hiding innocent content or showing flagged content.
   *
   * ⚠ IT RESOLVES, IT DOES NOT REJECT, on a fetch failure — an unreadable attachment is
   * "not flagged", not an error the render path has to handle.
   */
  function ensureHash(att) {
    if (!att || !att.id) return Promise.resolve({ hash: null, flagged: false });
    var cached = hashCache[att.id];
    if (cached) return Promise.resolve({ hash: cached, flagged: isFlagged(cached) });
    if (typeof fetch !== 'function' || !att.url) return Promise.resolve({ hash: null, flagged: false });

    return fetch(att.url)
      .then(function (res) { return res.arrayBuffer(); })
      .then(function (buf) { return hashBytes(new Uint8Array(buf)); })
      .then(function (h) {
        hashCache[att.id] = h;
        return { hash: h, flagged: isFlagged(h) };
      })
      .catch(function () { return { hash: null, flagged: false }; });
  }

  function _setStorage(adapter) {
    storage = adapter;
    memory = {};
    hashCache = {};
  }

  var api = {
    ALGO: ALGO,
    hashBytes: hashBytes,
    hashDataUrl: hashDataUrl,
    flag: flag,
    unflag: unflag,
    isFlagged: isFlagged,
    all: all,
    shouldHide: shouldHide,
    remember: remember,
    hashFor: hashFor,
    ensureHash: ensureHash,
    _setStorage: _setStorage
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.OrbitContentFilter = api;
})();
