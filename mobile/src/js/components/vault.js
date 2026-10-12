/**
 * Orbit Local Vault — format v2.
 *
 * WHY THIS EXISTS
 * ---------------
 * v1 built the entire backup as one in-memory object, ran one JSON.stringify over
 * it and wrote it in a single writeFile. On a real account that is 500 MB+ of data,
 * which cannot fit in an Android WebView heap — so v1 could only ever produce a
 * partial backup, and it needed a byte budget (and an "attachmentsExcluded" note)
 * to avoid being killed outright.
 *
 * v2 writes a DIRECTORY instead of one file:
 *
 *   vault/OrbitVault-<stamp>/manifest.json    small: settings + an index of chunks
 *   vault/OrbitVault-<stamp>/d/0001.bin       one file per chunk of attachment data
 *   vault/OrbitVault-<stamp>/d/0002.bin
 *
 * Why a directory rather than one big file: Capacitor's Filesystem plugin can
 * APPEND, but readFile has no offset/length — it always returns the whole file. So a
 * single-file vault could be written incrementally but could never be *restored*
 * without loading all of it at once. One file per chunk means both directions stay
 * bounded: peak memory is one chunk (~8 MB), not the whole account.
 *
 * Each chunk is base64 in the file (the plugin takes strings), and when encryption
 * is on each chunk is sealed independently with its own IV, which is what makes
 * per-chunk streaming possible at all — v1 sealed the whole payload as one
 * ciphertext. The IV is prefixed to the sealed bytes, so the manifest stays an index
 * and does not have to carry per-chunk key material.
 *
 * v1 vaults still restore (see restoreLegacy).
 */
(function () {
  'use strict';

  var CHUNK_BYTES = 8 * 1024 * 1024;   // plaintext bytes per chunk file
  var KDF_ITERATIONS = 100000;

  function fs() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem) || null;
  }

  function b64FromBuffer(buf) {
    var bytes = new Uint8Array(buf);
    var out = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(out);
  }

  function bufferFromB64(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function stamp() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /**
   * Chunk file name.
   *
   * Named by ENTRY index and CHUNK index — both unique by construction — with the
   * sanitised key only as a readable suffix. It must not depend on the key for
   * uniqueness: two different keys can sanitise to the same string ("a@b" and "a#b"
   * both become "ab"), and two entries sharing a filename means the second write
   * overwrites the first and BOTH restore from the survivor. That is silent data
   * corruption, not a cosmetic issue.
   */
  function chunkFileName(entryIndex, chunkIndex, key) {
    var safe = String(key).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'blob';
    return ('0000' + entryIndex).slice(-4) + '-' + ('00' + chunkIndex).slice(-2) + '-' + safe + '.bin';
  }

  /* ── crypto (per chunk) ── */

  function deriveKey(passphrase, salt, iterations) {
    var enc = new TextEncoder();
    return window.crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return window.crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: iterations || KDF_ITERATIONS, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /** iv(12 bytes) || ciphertext, base64. */
  function seal(key, plainBuf) {
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plainBuf)
      .then(function (ct) {
        var out = new Uint8Array(12 + ct.byteLength);
        out.set(iv, 0);
        out.set(new Uint8Array(ct), 12);
        return b64FromBuffer(out.buffer);
      });
  }

  function unseal(key, b64) {
    var raw = new Uint8Array(bufferFromB64(b64));
    var iv = raw.subarray(0, 12);
    var ct = raw.subarray(12);
    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
  }

  /* ── export ── */

  /**
   * @param {object} opts
   *   passphrase   string|null   encrypt when provided
   *   onProgress   fn(done, total, label)
   *   includePartials bool       default true
   */
  function exportVault(opts) {
    opts = opts || {};
    var F = fs();
    if (!F) return Promise.reject(new Error('Filesystem plugin unavailable'));

    var dirName = 'OrbitVault-' + stamp();
    var root = 'vault/' + dirName;
    var manifest = {
      v: 2,
      app: 'orbit',
      created: new Date().toISOString(),
      encrypted: !!opts.passphrase,
      chunkBytes: CHUNK_BYTES,
      entries: [],
      partials: [],
      // dataBytes covers the localStorage payload — messages, settings, and any
      // attachment small enough to be stored inline as a data URL. Those are NOT in
      // the blob store, so a summary built from `bytes` alone reports 0.0 MB on an
      // account that is full of images. Both numbers are kept so the toast can show
      // where the weight actually is.
      counts: { blobs: 0, partials: 0, bytes: 0, dataBytes: 0, skipped: 0 }
    };

    var cryptoKey = null;
    var saltB64 = null;

    var start = Promise.resolve()
      .then(function () { return F.mkdir({ path: root, directory: 'DATA', recursive: true }); })
      .then(function () { return F.mkdir({ path: root + '/d', directory: 'DATA', recursive: true }); });

    if (opts.passphrase) {
      var salt = window.crypto.getRandomValues(new Uint8Array(16));
      saltB64 = b64FromBuffer(salt.buffer);
      manifest.kdf = { salt: saltB64, iterations: KDF_ITERATIONS };
      start = start.then(function () { return deriveKey(opts.passphrase, salt); })
        .then(function (k) { cryptoKey = k; });
    }

    return start.then(function () {
      // 1. settings + messages (localStorage) — small, one unit
      //
      // ONLY the active account. Since v0.8.1 every account's data lives under
      // its own `orbit_acct_<id>_` prefix, so sweeping every `orbit_*` key would
      // put every account on the device in the vault and — worse — a restore
      // would write one account's history over another's.
      var data = {};
      try {
        var activeId = (window.MStore && window.MStore.accountId) || null;
        var acctPrefix = activeId ? 'orbit_acct_' + activeId + '_' : null;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (!k || k.indexOf('orbit_') !== 0) continue;
          // The registry is metadata about which accounts exist, not another
          // account's data. It is a few hundred bytes and without it a restore
          // onto a fresh device produces data nothing can reach.
          if (k === 'orbit_accounts' || k === 'orbit_active_account') {
            data[k] = localStorage.getItem(k);
            continue;
          }
          if (acctPrefix && k.indexOf(acctPrefix) !== 0) continue;  // another account
          data[k] = localStorage.getItem(k);
        }
      } catch (e) { /* storage unavailable */ }
      // never back up vault bookkeeping itself
      delete data.orbit_vault_lastbackup;

      var serialised = JSON.stringify(data);
      manifest.counts.dataBytes = serialised.length;

      if (cryptoKey) {
        return seal(cryptoKey, new TextEncoder().encode(serialised).buffer)
          .then(function (sealed) { manifest.data = { sealed: sealed }; });
      }
      manifest.data = { plain: data };
    }).then(function () {
      // 2. attachments, one blob at a time
      return readStore('blobs', function (key, value) {
        return writeEntry(root, manifest, 'blob', key, value, cryptoKey, opts);
      });
    }).then(function () {
      // 3. in-progress transfer state (opt out via includePartials:false)
      if (opts.includePartials === false) return null;
      return readStore('partials', function (key, value) {
        var size = new TextEncoder().encode(JSON.stringify(value)).length;
        return writeEntry(root, manifest, 'partial', key, value, cryptoKey, opts);
      });
    }).then(function () {
      // 4. the manifest, written last so a partial export is never mistaken for a
      //    complete one — restore refuses a directory without a manifest.
      return F.writeFile({
        path: root + '/manifest.json',
        directory: 'DATA',
        encoding: 'utf8',
        data: JSON.stringify(manifest)
      });
    }).then(function () {
      return { dir: root, counts: manifest.counts, encrypted: manifest.encrypted };
    });
  }

  /**
   * Walks one IndexedDB store, invoking handler(key, value) sequentially.
   * BlobStoreDB.eachKey fetches one value per transaction and awaits the handler
   * between records, so a slow write (sealing an 8 MB chunk) never pulls the next
   * record into memory — and never lets the transaction go inactive mid-walk.
   */
  function readStore(storeName, handler) {
    if (!window.BlobStoreDB || typeof BlobStoreDB.eachKey !== 'function') {
      return Promise.resolve();
    }
    return BlobStoreDB.eachKey(storeName, handler);
  }

  /** Splits one value into chunks and writes each as its own file. */
  function writeEntry(root, manifest, kind, key, value, cryptoKey, opts) {
    var F = fs();
    var raw = value instanceof ArrayBuffer ? value
            : (value && value.buffer) ? value.buffer
            : new TextEncoder().encode(JSON.stringify(value)).buffer;

    var total = raw.byteLength;
    var nChunks = Math.max(1, Math.ceil(total / CHUNK_BYTES));
    // Index of this entry within the vault — the manifest is appended to only after
    // every chunk is written, so entries.length is this entry's index.
    var entryIndex = manifest.entries.length;
    var entry = { kind: kind, key: key, size: total, chunks: [] };

    var seq = Promise.resolve();
    for (var c = 0; c < nChunks; c++) {
      (function (index) {
        seq = seq.then(function () {
          var slice = raw.slice(index * CHUNK_BYTES, Math.min(total, (index + 1) * CHUNK_BYTES));
          var payload = cryptoKey ? seal(cryptoKey, slice) : Promise.resolve(b64FromBuffer(slice));
          return payload.then(function (b64) {
            var name = chunkFileName(entryIndex, index, key);
            entry.chunks.push({ f: 'd/' + name, n: slice.byteLength });
            return F.writeFile({
              path: root + '/d/' + name,
              directory: 'DATA',
              encoding: 'utf8',      // the payload is base64 text
              data: b64
            });
          });
        });
      })(c);
    }

    return seq.then(function () {
      manifest.entries.push(entry);
      manifest.counts[kind === 'blob' ? 'blobs' : 'partials'] =
        (manifest.counts[kind === 'blob' ? 'blobs' : 'partials'] || 0) + 1;
      manifest.counts.bytes += total;
      if (opts && typeof opts.onProgress === 'function') {
        opts.onProgress(manifest.entries.length, null, kind === 'blob' ? 'attachments' : 'transfers');
      }
    });
  }

  /* ── restore ── */

  function readManifest(root) {
    var F = fs();
    return F.readFile({ path: root + '/manifest.json', directory: 'DATA', encoding: 'utf8' })
      .then(function (res) {
        var text = typeof res.data === 'string' ? res.data : String(res.data);
        return JSON.parse(text);
      });
  }

  /** Lists vault directories, newest first. */
  function listVaults() {
    var F = fs();
    if (!F) return Promise.resolve([]);
    return F.readdir({ path: 'vault', directory: 'DATA' })
      .then(function (res) {
        return (res.files || [])
          .map(function (f) { return typeof f === 'string' ? { name: f } : f; })
          .filter(function (f) { return f.name && f.name.indexOf('OrbitVault-') === 0; })
          .map(function (f) { return 'vault/' + f.name; })
          .sort().reverse();
      })
      .catch(function () { return []; });
  }

  /**
   * Restores a v2 vault directory.
   * @param {string} root      'vault/OrbitVault-...'
   * @param {string} passphrase required when the manifest says encrypted
   * @param {object} opts      { onProgress, writeLocalStorage, writeBlob }
   */
  function restoreVault(root, passphrase, opts) {
    opts = opts || {};
    var F = fs();
    if (!F) return Promise.reject(new Error('Filesystem plugin unavailable'));

    var manifest, cryptoKey = null;
    var stats = { keys: 0, blobs: 0, partials: 0, bytes: 0 };
    // Snapshot the account registry BEFORE the restore overwrites it, so the
    // accounts already on this device survive restoring someone else's vault.
    var registryBefore = null;
    try { registryBefore = JSON.parse(localStorage.getItem('orbit_accounts') || 'null'); } catch (e) {}

    return readManifest(root).then(function (m) {
      manifest = m;
      if (!manifest || manifest.v !== 2) throw new Error('Not a v2 vault');
      if (!manifest.encrypted) return null;
      if (!passphrase) throw new Error('This backup is encrypted — a passphrase is required');
      var salt = new Uint8Array(bufferFromB64(manifest.kdf.salt));
      return deriveKey(passphrase, salt, manifest.kdf.iterations).then(function (k) { cryptoKey = k; });
    }).then(function () {
      // settings + messages
      if (manifest.data.plain) {
        Object.keys(manifest.data.plain).forEach(function (k) {
          try { localStorage.setItem(k, manifest.data.plain[k]); stats.keys++; } catch (e) {}
        });
        return null;
      }
      return unseal(cryptoKey, manifest.data.sealed).then(function (plain) {
        var obj = JSON.parse(new TextDecoder().decode(plain));
        Object.keys(obj).forEach(function (k) {
          try { localStorage.setItem(k, obj[k]); stats.keys++; } catch (e) {}
        });
      });
    }).then(function () {
      // The restore just wrote the backup's registry over this device's. Union
      // them — the backup is a snapshot from some earlier point and may predate
      // accounts that exist here now.
      if (!Array.isArray(registryBefore)) return null;
      var after = null;
      try { after = JSON.parse(localStorage.getItem('orbit_accounts') || 'null'); } catch (e) {}
      if (!Array.isArray(after)) return null;
      var seen = {};
      after.forEach(function (a) { if (a && a.id) seen[a.id] = true; });
      var merged = after.slice();
      registryBefore.forEach(function (a) { if (a && a.id && !seen[a.id]) merged.push(a); });
      if (merged.length !== after.length) {
        try { localStorage.setItem('orbit_accounts', JSON.stringify(merged)); } catch (e) {}
      }
      return null;
    }).then(function () {
      // attachments, one chunk file at a time
      var seq = Promise.resolve();
      manifest.entries.forEach(function (entry, idx) {
        seq = seq.then(function () {
          var parts = [];
          var cseq = Promise.resolve();
          entry.chunks.forEach(function (ch) {
            cseq = cseq.then(function () {
              return F.readFile({ path: root + '/' + ch.f, directory: 'DATA' })
                .then(function (res) {
                  var text = typeof res.data === 'string' ? res.data : String(res.data);
                  if (!cryptoKey) return bufferFromB64(text);
                  return unseal(cryptoKey, text);
                })
                .then(function (buf) { parts.push(new Uint8Array(buf)); });
            });
          });
          return cseq.then(function () {
            var total = parts.reduce(function (a, p) { return a + p.length; }, 0);
            var joined = new Uint8Array(total);
            var off = 0;
            parts.forEach(function (p) { joined.set(p, off); off += p.length; });
            parts = null;

            if (entry.kind === 'blob') {
              if (opts.writeBlob) return opts.writeBlob(entry.key, joined.buffer);
              return null;
            }
            if (opts.writePartial) {
              var rec = JSON.parse(new TextDecoder().decode(joined));
              return opts.writePartial(entry.key, rec);
            }
            return null;
          }).then(function () {
            if (entry.kind === 'blob') stats.blobs++; else stats.partials++;
            stats.bytes += entry.size;
            if (typeof opts.onProgress === 'function') opts.onProgress(idx + 1, manifest.entries.length);
          });
        });
      });
      return seq;
    }).then(function () {
      return { stats: stats, created: manifest.created, encrypted: manifest.encrypted };
    });
  }

  /* ══ Finding a backup FILE to restore from ══════════════════════════════════
     Two different things are called "a backup" in this app and they are not
     interchangeable:

       a VAULT   — a directory this app writes (vault/OrbitVault-…), chunked, and
                   optionally encrypted. listVaults()/restoreVault() handle it.
       a BACKUP  — a single .orzip/.zip file, holding the whole account as one
                   JSON blob.

     Dan's ask is the second one, and the reason is recovery: **deleting and
     reinstalling the app does not remove a file you saved, but it does remove
     everything in the app's own data directory** — so a fresh install should
     look for its own old backups instead of making the user go hunting.

     So this scans every place a file can plausibly be:
       • the app data root   (what survived, or what a share put there)
       • vault/              (where a user is told to put things)
       • the public Downloads folder  ← see below

     ⚠⚠ THE EXPORT AND THE RESTORE USED TO DISAGREE ABOUT WHERE A BACKUP LIVES.

     runVaultExport() offers "Save a copy to Downloads now?", and that copy is the
     ONLY one that survives deleting the app — everything under the app's data
     directory goes with the reinstall. It is written through MediaStore into the
     PUBLIC Downloads folder. This scan only ever looked at app-private storage,
     so the recovery path for the exact case it exists for found nothing: the
     export worked, the restore worked, and the file was invisible.

     Listing and reading Downloads is native (OrbitP2PPlugin) because a WebView
     cannot reach that folder itself. Both fail closed — no plugin, no permission,
     or no folder all mean "no files found", never an exception. */

  var BACKUP_EXT = /\.(orzip|zip)$/i;

  /** The native plugin that can see the public Downloads folder, or null. */
  function _downloadsPlugin() {
    var plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    var P2P = plugins.OrbitP2P;
    return (P2P && typeof P2P.listDownloadBackups === 'function') ? P2P : null;
  }

  /** Backups sitting in the public Downloads folder. Never rejects. */
  function _listDownloadBackups() {
    var P2P = _downloadsPlugin();
    if (!P2P) return Promise.resolve([]);
    return P2P.listDownloadBackups()
      .then(function (res) {
        return ((res && res.files) || []).map(function (f) {
          return {
            name: f.name,
            // Prefixed so it can never collide with a private-storage path in the
            // de-dup below, and so the sheet has something to show.
            path: 'downloads/' + f.name,
            source: 'downloads',
            size: f.size || 0,
            mtime: f.mtime || null
          };
        }).filter(function (f) { return f.name && BACKUP_EXT.test(f.name); });
      })
      .catch(function () { return []; });
  }

  function _readDir(F, path) {
    return F.readdir({ path: path, directory: 'DATA' })
      .then(function (res) {
        return (res.files || []).map(function (f) {
          return typeof f === 'string' ? { name: f } : f;
        });
      })
      .catch(function () { return []; });   // no such directory is not an error
  }

  /** One candidate file, with the facts a person needs to choose between them. */
  function _describeFile(F, dirPath, entry) {
    var full = dirPath ? dirPath + '/' + entry.name : entry.name;
    return F.stat({ path: full, directory: 'DATA' })
      .then(function (st) {
        return {
          name: entry.name,
          path: full,
          source: dirPath ? 'vault' : 'app',
          size: st.size || 0,
          mtime: st.mtime || null
        };
      })
      .catch(function () {
        return { name: entry.name, path: full, source: dirPath ? 'vault' : 'app', size: 0, mtime: null };
      });
  }

  /**
   * Every restorable backup file, newest first.
   *
   * ⚠ The app root is read with path '' — Capacitor's readdir on the Data
   * directory with an empty path lists the root itself. Listings are
   * de-duplicated by path, because a user who put a file in vault/ AND left a
   * copy at the root should not see it twice.
   */
  function findBackupFiles() {
    var F = fs();

    var privateFiles = F
      ? Promise.all([_readDir(F, ''), _readDir(F, 'vault')]).then(function (results) {
          var jobs = [];
          results.forEach(function (entries, i) {
            var dirPath = i === 0 ? '' : 'vault';
            entries.forEach(function (e) {
              if (!e || !e.name || !BACKUP_EXT.test(e.name)) return;
              jobs.push(_describeFile(F, dirPath, e));
            });
          });
          return Promise.all(jobs);
        })
      : Promise.resolve([]);

    return Promise.all([privateFiles, _listDownloadBackups()])
      .then(function (both) {
        var seen = {};
        return both[0].concat(both[1]).filter(function (f) {
          if (seen[f.path]) return false;
          seen[f.path] = true;
          return true;
        }).sort(function (a, b) {
          // Newest first; a file with no mtime sorts last rather than winning.
          var am = a.mtime || 0, bm = b.mtime || 0;
          return bm - am;
        });
      })
      .catch(function () { return []; });
  }

  /**
   * Read one candidate. Returns {kind, backup, account} ready to restore.
   *
   * `source` decides the reader: 'downloads' goes through the native plugin (a
   * WebView cannot open a public Downloads file), everything else through the
   * Filesystem plugin. Both hand back the same bytes, and both feed the same
   * OrbitBackupArchive.read() — so a file from Downloads and a file from the app
   * folder cannot disagree about the format.
   */
  function readBackupFile(path, source) {
    if (!window.OrbitBackupArchive) return Promise.reject(new Error('Backup reader unavailable'));

    var bytesPromise;

    if (source === 'downloads') {
      var P2P = _downloadsPlugin();
      if (!P2P || typeof P2P.readDownloadBackup !== 'function') {
        return Promise.reject(new Error('Restoring from Downloads needs a newer Android build'));
      }
      var name = String(path).replace(/^downloads\//, '');
      bytesPromise = P2P.readDownloadBackup({ name: name }).then(function (res) {
        var b64 = (res && res.data) ? String(res.data) : '';
        if (!b64) throw new Error('The file is empty');
        return b64ToBytes(b64);
      });
    } else {
      var F = fs();
      if (!F) return Promise.reject(new Error('Filesystem plugin unavailable'));
      bytesPromise = F.readFile({ path: path, directory: 'DATA' }).then(function (res) {
        // Capacitor hands back base64 for binary reads.
        var b64 = typeof res.data === 'string' ? res.data : '';
        if (!b64) throw new Error('The file is empty');
        return b64ToBytes(b64);
      });
    }

    return bytesPromise
      .then(function (bytes) { return window.OrbitBackupArchive.read(bytes); })
      .then(function (r) {
        // The translator already exists (shared/network/transfer.js) — the same
        // one "Link a phone" uses, so a restored file and a transferred account
        // cannot disagree about what the desktop's data means.
        var T = window.OrbitAccountTransfer;
        var account = (T && T.toMobileAccount) ? T.toMobileAccount(r.backup) : null;
        return {
          kind: r.kind,
          backup: r.backup,
          account: account,
          summary: window.OrbitBackupArchive.describe(r.backup)
        };
      });
  }

  function b64ToBytes(b64) {
    var clean = String(b64).replace(/\s/g, '');
    var bin = atob(clean);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  window.OrbitVault = {
    CHUNK_BYTES: CHUNK_BYTES,
    exportVault: exportVault,
    restoreVault: restoreVault,
    listVaults: listVaults,
    readManifest: readManifest,
    findBackupFiles: findBackupFiles,
    readBackupFile: readBackupFile
  };
})();
