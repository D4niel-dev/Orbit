// src/js/log.js — the main process's logging gate.
//
// ⚠⚠ NOTHING IN THE MAIN PROCESS PRINTS UNLESS THE USER ASKED FOR IT.
// Every `console.log` in main.js, discovery.js, socket.js, transfer.js and
// database.js used to be unconditional. Launching Orbit from a terminal — which
// is what `npm start` does — printed a wall of `[Discovery]` beacons, `[OVP-IPC]`
// duration probes and a full MediaInfo dump on every single launch, for everyone.
// Dan: "these logs in the cmd should only be shown when they are in dev mode and
// enable debug logs in the settings".
//
// ⚠ THE GATE IS THE SETTINGS, NOT `app.isPackaged`. Dan runs from source with
// `npm start`, so a packaged-build-only check would not have silenced one line of
// what he was looking at. It is `devMode` AND `debugLogs` — Developer Mode is the
// master switch for developer tooling, `debugLogs` is the one that decides whether
// that tooling talks to the terminal.
//
// ⚠⚠ IT HAS TO ANSWER BEFORE THE APP HAS FINISHED WIRING ITSELF UP. Discovery
// starts, the TCP server binds and the database migrates — all of them log — and
// several of those happen before or around the point where the settings store is
// handed over. A gate that threw, or that read a missing store and guessed, would
// be one more silent failure in a file full of them. So:
//   * it reads electron-store, which is the DURABLE source and is constructed
//     near the top of main.js (`Database`'s constructor copies electron-store
//     *over* SQLite on every launch, so SQLite is the cache, not the truth);
//   * "I cannot tell yet" is OFF. The default is quiet, and it stays quiet until
//     something positively says otherwise.
//
// ⚠ Cached for a second. This is consulted on every UDP beacon and every socket
// event, and reading a JSON store that often is its own cost.
//
// ⚠ `console.error` AND `console.warn` ARE NOT GATED, deliberately. A failed
// write, a rejected connection and a crash are not debug chatter, and hiding them
// behind a setting would hide the one line that explains a bug report.

'use strict';

var _store = null;
var _cache = null;
var _cacheAt = 0;
var CACHE_MS = 1000;

/**
 * Hand the gate the settings store. Called once from main.js, as soon as the
 * electron-store instance exists. Until then, everything is quiet.
 * @param {{get: function(string): any}} store
 */
function init(store) {
  _store = store || null;
  _cache = null;
}

/** Is debug logging on right now? Developer Mode AND Debug Logs. */
function enabled() {
  var now = Date.now();
  if (_cache !== null && (now - _cacheAt) < CACHE_MS) return _cache;
  _cacheAt = now;

  var s = null;
  try {
    s = _store ? _store.get('settings') : null;
  } catch (e) {
    s = null;
  }
  _cache = !!(s && typeof s === 'object' && s.devMode === true && s.debugLogs === true);
  return _cache;
}

/** console.log, but only when Developer Mode and Debug Logs are both on. */
function dlog() {
  if (enabled()) console.log.apply(console, arguments);
}

dlog.init = init;
dlog.enabled = enabled;

module.exports = dlog;
