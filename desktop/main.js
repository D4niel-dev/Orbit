const { app, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, protocol, net, dialog, clipboard, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const os = require('os');
const tcpNet = require('net');
const crypto = require('crypto');
const dlog = require('./src/js/log');
const { exec } = require('child_process');
const uuidv4 = () => crypto.randomUUID();

function tryAddFirewallRule() {
  if (process.platform !== 'win32') return;
  const ruleName = 'Orbit P2P Discovery (UDP 45678)';
  exec('netsh advfirewall firewall show rule name="' + ruleName + '"', function(err, stdout) {
    if (err || !stdout.includes(ruleName)) {
      exec('netsh advfirewall firewall add rule name="' + ruleName + '" dir=in protocol=udp localport=45678 action=allow program="' + process.execPath.replace(/\\/g, '\\\\') + '"', function(addErr) {
        if (addErr) {
          dlog('[Firewall] Could not add rule (not running as admin). Run this to enable LAN discovery:');
          dlog('[Firewall]   netsh advfirewall firewall add rule name="Orbit P2P Discovery" dir=in protocol=udp localport=45678 action=allow program="' + process.execPath + '"');
        } else {
          dlog('[Firewall] Added inbound rule for UDP 45678');
        }
      });
    }
  });
}

function getLocalIPv4() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

// Ordered list of candidate IPv4 addresses for QR pairing.
// Unlike getLocalIPv4() this returns ALL of them, because a QR has no UDP source
// address to fall back on — the peer has to try candidates until one connects.
// Only here (not in the renderer) do we know interface names, so this is where
// virtual adapters get deprioritized and real LAN adapters get promoted.
var VIRTUAL_IFACE_RE = /docker|vethernet|wsl|vmware|virtualbox|hyper-v|hyperv|loopback|vpn|tailscale|zerotier|^utun|^tun\d|^tap\d|^br-|^virbr|^veth/i;
var PHYSICAL_IFACE_RE = /wi-?fi|wlan|wireless|ethernet|^eth\d|^en\d|^enp|^eno|^wlp/i;

function getLocalIPv4s() {
  const preferred = [];
  const rest = [];
  let interfaces;
  try {
    interfaces = os.networkInterfaces();
  } catch (e) {
    return [];
  }
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    const isVirtual = VIRTUAL_IFACE_RE.test(name);
    const isPhysical = PHYSICAL_IFACE_RE.test(name);
    for (const addr of iface) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address === '0.0.0.0') continue;
      const bucket = (isPhysical && !isVirtual) ? preferred : rest;
      if (bucket.indexOf(addr.address) === -1) bucket.push(addr.address);
    }
  }
  return preferred.concat(rest);
}

function scanBatch(socketMgr, subnet, localIp, start, end, onDone) {
  var remaining = [];
  for (var i = start; i <= end; i++) {
    var ip = subnet + i;
    if (ip !== localIp) remaining.push(ip);
  }
  if (remaining.length === 0) { if (onDone) onDone(); return; }

  var completed = 0;
  var total = remaining.length;

  remaining.forEach(function(ip) {
    var s = new tcpNet.Socket();
    var settled = false;

    function finish() {
      if (settled) return;
      settled = true;
      completed++;
      if (completed === total && onDone) onDone();
    }

    var scanPort = socketMgr ? socketMgr.TCP_PORT : 46000;
    s.connect(scanPort, ip, function() {
      // Dedup: skip if already connected to this IP
      for (var entry of socketMgr.connections.values()) {
        if (entry.remoteAddress === ip) {
          s.destroy();
          finish();
          return;
        }
      }
      dlog('[LAN-Scan] Found peer at ' + ip);
      socketMgr.setupSocket(s, null);
      socketMgr.sendBeacon(s);
      finish();
    });

    s.on('error', function() {
      s.destroy();
      finish();
    });

    setTimeout(function() {
      s.destroy();
      finish();
    }, 800);
  });
}

function startLanScan(socketMgr) {
  if (!socketMgr) return;
  var localIp = getLocalIPv4();
  if (!localIp) return;
  var parts = localIp.split('.');
  var subnet = parts[0] + '.' + parts[1] + '.' + parts[2] + '.';

  function scanAll() {
    scanBatch(socketMgr, subnet, localIp, 1, 254, function() {
      dlog('[LAN-Scan] Full scan complete');
    });
  }

  dlog('[LAN-Scan] Scanning ' + subnet + '1-254 for Orbit peers...');
  scanAll();
  if (_lanScanTimer) clearInterval(_lanScanTimer);
  _lanScanTimer = setInterval(scanAll, 60000);
}

let _lanScanTimer = null;
let _networkMonitorTimer = null;
let _lastLocalIP = null;

function startNetworkMonitor() {
  _lastLocalIP = getLocalIPv4();
  if (_networkMonitorTimer) clearInterval(_networkMonitorTimer);
  _networkMonitorTimer = setInterval(() => {
    var currentIP = getLocalIPv4();
    if (currentIP && currentIP !== _lastLocalIP) {
      dlog('[Network] IP changed from', _lastLocalIP, 'to', currentIP, '— restarting network');
      _lastLocalIP = currentIP;
      // Restart LAN scan with new subnet
      if (_lanScanTimer) {
        clearInterval(_lanScanTimer);
        _lanScanTimer = null;
      }
      startLanScan(socketInstance);
      // Restart discovery beacon interval by recreating discovery
      if (discoveryInstance) {
        var oldIdentity = currentIdentity;
        discoveryInstance.stop();
        discoveryInstance = new Discovery(() => currentIdentity, (peer) => {
          // Re-register the same callback
          dlog('[AutoConnect] Peer discovered:', peer.username, peer.userId, 'at IP', peer.ip);
          if (mainWindow) mainWindow.webContents.send('peer-found', peer);
          if (socketInstance && peer.userId && peer.ip) {
            var alreadyConnected = socketInstance.connections.has(peer.userId) ||
              socketInstance._pendingConnects.has(peer.userId);
            if (alreadyConnected) return;
            dlog('[AutoConnect] Initiating TCP connect to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
            socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).catch(function(err) {
              console.error('[AutoConnect] Connection to', peer.userId, 'failed:', err && err.message);
            });
          }
        });
        if (socketInstance && socketInstance.TCP_PORT) {
          discoveryInstance.TCP_PORT = socketInstance.TCP_PORT;
        }
        discoveryInstance.onPeerGone = function(peerId) {
          dlog('[AutoConnect] Peer gone:', peerId);
          if (mainWindow) mainWindow.webContents.send('peer-gone', peerId);
        };
        discoveryInstance.onAnyBeacon = _tryAutoConnect;
        discoveryInstance.start();
      }
    }
  }, 10000);
}

const Store = require('electron-store');
const Discovery = require('./src/js/network/discovery');
const SocketManager = require('./src/js/network/socket');
const TransferManager = require('./src/js/network/transfer');
const Protocol = require('./src/js/network/protocol');
const OrbitDatabase = require('./src/js/database/database');

const persistentStore = new Store();
// ⚠ Hand the settings store to the logging gate, HERE — everything above this
// line is silent by design, and everything below it can be switched on from
// Settings → Advanced → Debug Logs. See src/js/log.js.
dlog.init(persistentStore);
let globalDb = null;
let discoveryInstance = null;
let socketInstance = null;
let transferInstance = null;
let currentIdentity = null;
let mainWindow = null;
let tray = null;
let tempDirPath = null;
// E2EE key material is owned by desktop/e2ee.js (see the e2ee instance below).
const _autoConnectLastAttempt = new Map(); // peerId -> timestamp of last TCP attempt
const AUTO_CONNECT_THROTTLE = 30000; // Don't retry same peer more than once per 30s

// Throttled auto-connect: retries TCP on every beacon if not already connected
function _tryAutoConnect(peer) {
  if (!socketInstance) {
    dlog('[AutoConnect] SKIP: socketInstance not ready');
    return;
  }
  if (!peer.userId) {
    dlog('[AutoConnect] SKIP: peer.userId missing', JSON.stringify(peer));
    return;
  }
  if (!peer.ip) {
    dlog('[AutoConnect] SKIP: peer.ip missing for', peer.userId);
    return;
  }
  var alreadyConnected = socketInstance.connections.has(peer.userId) ||
    socketInstance._pendingConnects.has(peer.userId);
  if (alreadyConnected) {
    _autoConnectLastAttempt.delete(peer.userId);
    return;
  }
  var last = _autoConnectLastAttempt.get(peer.userId) || 0;
  if (Date.now() - last < AUTO_CONNECT_THROTTLE) {
    dlog('[AutoConnect] THROTTLED: skipping', peer.userId, 'last attempt was', (Date.now() - last) + 'ms ago');
    return;
  }
  _autoConnectLastAttempt.set(peer.userId, Date.now());
  dlog('[AutoConnect] Retry TCP to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
  socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).then(function() {
    dlog('[AutoConnect] Connected to', peer.userId);
    _autoConnectLastAttempt.delete(peer.userId);
    // Immediately update peer status in UI (don't wait for remote's response beacon)
    if (mainWindow) {
      mainWindow.webContents.send('peer-found', {
        userId: peer.userId,
        username: peer.username || peer.userId,
        avatar: peer.avatar || null,
        status: 'online',
        ip: peer.ip,
        tcpPort: peer.tcpPort || 46000,
        lastSeen: Date.now()
      });
    }
  }).catch(function(err) {
    console.error('[AutoConnect] Retry failed for', peer.userId, ':', err && err.message);
  });
}

// ── E2EE helpers (Node crypto) ──────────────────────────────────────────────
//
// UNIFIED SCHEME — desktop now speaks the same scheme as mobile:
//   key encoding : SPKI DER hex (was a raw uncompressed point)
//   derivation   : HKDF-SHA256(secret, salt, info)   (was SHA-256(secret))
//   envelope     : ciphertext + nonce as separate fields (was one packed string)
//
// Negotiation needs no handshake and no new beacon field: the peer's key FORMAT
// is itself the capability signal. SPKI means the peer speaks the unified
// scheme; raw hex means an older desktop build, which still gets the legacy
// derivation and envelope.
//
// See plans/docs/Orbit E2EE Unification Design.md

// The implementation lives in desktop/e2ee.js so it can be unit-tested without
// booting Electron — see tests/unit/e2ee-interop.test.js. A test that merely
// mirrored this logic would pass while the shipped code drifted.
var createE2EE = require('./e2ee.js');
var e2ee = createE2EE(persistentStore);

protocol.registerSchemesAsPrivileged([
  { scheme: 'orbit-file', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-db', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  { scheme: 'orbit-avatar', privileges: { secure: true, standard: true, supportFetchAPI: true } },
  // ⚠ The bundled emoji dataset. See the handler below.
  { scheme: 'orbit-emoji', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

app.whenReady().then(() => {
  // Windows App User Model ID — tells the taskbar to group this as "Orbit" instead of "Electron"
  if (process.platform === 'win32') app.setAppUserModelId('com.orbit.desktop');

  protocol.handle('orbit-file', (request) => {
    const urlPath = request.url.replace('orbit-file://', '');
    const decodedPath = decodeURIComponent(urlPath).replace(/\\/g, '/');
    return net.fetch('file:///' + decodedPath).then(r => {
      return new Response(r.body, { headers: cacheHeaders({ 'Content-Type': r.headers.get('Content-Type') || 'application/octet-stream' }) });
    });
  });

  // ⚠ THE EMOJI DATASET, SERVED FROM THE APP ITSELF.
  //
  // The picker's data source was a jsDelivr URL, so a fresh install with no network
  // had no emoji at all — the one thing a local-first app cannot afford. The data is
  // bundled at src/data/emojis.json (~430 KB, 1923 records) and served from here.
  //
  // ⚠ RESOLVED IN THE MAIN PROCESS ON PURPOSE. The renderer would have to rebuild an
  // absolute path from `location.href`, and that means per-platform path math
  // (`/C:/…` on Windows, `/Users/…` elsewhere) that I can only test on one of them.
  // `path.join(__dirname, …)` is correct everywhere by construction.
  //
  // ⚠ AND IT ANSWERS `HEAD`. The library probes the source with a HEAD before
  // reading it; returning a body for a HEAD is a protocol error.
  protocol.handle('orbit-emoji', (request) => {
    // ⚠ `Access-Control-Allow-Origin` is not optional here. The page is `file://`,
    // so a `fetch()` to `orbit-emoji://` is CROSS-ORIGIN and Chromium fails it with
    // "Failed to fetch" before the handler's body is even read. `<img src>` on the
    // other schemes never needed this because images are not CORS-checked.
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    const file = path.join(__dirname, 'src', 'data', 'emojis.json');
    return net.fetch(pathToFileURL(file).toString()).then((r) => {
      return new Response(r.body, { headers: cacheHeaders(headers) });
    });
  });

  function detectMimeFromHeader(data, fallbackExt) {
    if (!data || data.length < 16) return null;
    var header = '';
    for (var i = 0; i < Math.min(16, data.length); i++) {
      header += String.fromCharCode(data[i]);
    }
    if (header.substring(4, 8) === 'ftyp') {
      var brand = header.substring(8, 12);
      if (brand === 'M4A ' || brand === 'M4B ' || brand === 'M4P ') return 'audio/mp4';
      return 'video/mp4';
    }
    if (header.substring(4, 8) === 'moov') return 'video/quicktime';
    if (header.substring(0, 4) === '\x1a\x45\xdf\xa3') {
      if (data.length > 40) {
        var docType = '';
        for (var i = 31; i < 40 && data[i] !== 0; i++) docType += String.fromCharCode(data[i]);
        if (docType.indexOf('webm') !== -1 || docType.indexOf('WebM') !== -1) return 'video/webm';
      }
      return 'video/x-matroska';
    }
    if (header.substring(0, 4) === 'RIFF' && header.substring(8, 12) === 'AVI ') return 'video/x-msvideo';
    if (header.substring(0, 3) === 'FLV') return 'video/x-flv';
    if (header.substring(0, 3) === 'ID3') return 'audio/mpeg';
    if (data[0] === 0xFF && (data[1] & 0xE0) === 0xE0) return 'audio/mpeg';
    if (header.substring(0, 4) === 'OggS') {
      if (fallbackExt === 'ogv' || fallbackExt === 'video') return 'video/ogg';
      return 'audio/ogg';
    }
    if (header.substring(0, 4) === 'RIFF' && header.substring(8, 12) === 'WAVE') return 'audio/wav';
    if (header.substring(0, 4) === 'fLaC') return 'audio/flac';
    if (header.substring(0, 4) === 'Opus') return 'audio/opus';
    if (header.substring(0, 6) === '\x30\x26\xb2\x75\x8e\x66') return 'video/x-ms-wmv';
    return null;
  }
  function contentTypeFromAtt(att, data) {
    if (!att) return 'application/octet-stream';
    if (att.type && att.type.indexOf('/') !== -1) return att.type;
    if (att.mimeType) return att.mimeType;
    if ((!att.type || att.type === 'file') && data) {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var magicMime = detectMimeFromHeader(data, ext);
      if (magicMime) return magicMime;
    }
    if (att.type === 'image') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var mimeMap = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon' };
      return mimeMap[ext] || 'image/png';
    }
    if (att.type === 'audio') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var audioMimeMap = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', wma: 'audio/x-ms-wma', webm: 'audio/webm', opus: 'audio/opus', mka: 'audio/x-matroska' };
      return audioMimeMap[ext] || 'audio/webm';
    }
    if (att.type === 'video') {
      var ext = (att.name || '').split('.').pop().toLowerCase();
      var videoMimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', ogv: 'video/ogg', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime', m4v: 'video/mp4', '3gp': 'video/3gpp', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', f4v: 'video/mp4', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t' };
      return videoMimeMap[ext] || 'video/mp4';
    }
    return 'application/octet-stream';
  }

  function cacheHeaders(extra) {
    var h = { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Access-Control-Allow-Origin': '*' };
    if (extra) Object.assign(h, extra);
    return h;
  }

  protocol.handle('orbit-db', (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'thumbnail' || url.pathname.startsWith('/thumbnail/')) {
        const id = url.hostname === 'thumbnail' ? url.pathname.slice(1) : url.pathname.replace('/thumbnail/', '');
        return new Promise((resolve) => {
          if (globalDb) {
            const att = globalDb.getAttachmentThumbnail(id);
            if (att && att.thumbnail && att.thumbnail.length > 0) {
              resolve(new Response(att.thumbnail, {
                headers: cacheHeaders({ 'Content-Type': 'image/webp' })
              }));
              return;
            } else if (att && att.data && att.data.length > 0) {
              // Fallback to original image if no thumbnail yet
              resolve(new Response(att.data, {
                headers: cacheHeaders({ 'Content-Type': contentTypeFromAtt(att, att.data) })
              }));
              return;
            } else if (att && att.localPath && fs.existsSync(att.localPath)) {
              // Fallback for privacy mode: serve from filesystem
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/')).then(r => {
                return new Response(r.body, {
                  headers: cacheHeaders({ 'Content-Type': contentTypeFromAtt(att) })
                });
              }));
              return;
            }
          }
          resolve(new Response(null, { status: 404 }));
        });
      }

      if (url.hostname === 'attachment' || url.pathname.startsWith('/attachment/')) {
        const id = url.hostname === 'attachment' ? url.pathname.slice(1) : url.pathname.replace('/attachment/', '');
        return new Promise((resolve) => {
          if (globalDb) {
            const att = globalDb.getAttachment(id);
            if (att && att.data && att.data.length > 0) {
              var ct = contentTypeFromAtt(att, att.data);
              var extraHeaders = { 'Content-Type': ct, 'Content-Length': String(att.data.length) };
              if (ct.startsWith('audio/') || ct.startsWith('video/')) {
                extraHeaders['Accept-Ranges'] = 'bytes';
              }
              
              const rangeHeader = request.headers.get('Range');
              if (rangeHeader && (ct.startsWith('audio/') || ct.startsWith('video/'))) {
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] && parts[1] !== '' ? parseInt(parts[1], 10) : att.data.length - 1;
                const chunksize = (end - start) + 1;
                extraHeaders['Content-Range'] = `bytes ${start}-${end}/${att.data.length}`;
                extraHeaders['Content-Length'] = String(chunksize);
                
                let slicedData;
                if (Buffer.isBuffer(att.data)) {
                  slicedData = att.data.subarray(start, end + 1);
                } else if (att.data.slice) {
                  slicedData = att.data.slice(start, end + 1);
                } else {
                  slicedData = Buffer.from(att.data).subarray(start, end + 1);
                }
                
                resolve(new Response(slicedData, {
                  status: 206,
                  headers: cacheHeaders(extraHeaders)
                }));
                return;
              }


              resolve(new Response(att.data, {
                headers: cacheHeaders(extraHeaders)
              }));
              return;
            }
            // Fallback: serve from localPath (privacy mode temp files)
            if (att && att.localPath && fs.existsSync(att.localPath)) {
              resolve(net.fetch('file:///' + att.localPath.replace(/\\/g, '/'), { headers: request.headers }).then(r => {
                const h = cacheHeaders({ 'Content-Type': contentTypeFromAtt(att) });
                r.headers.forEach((v, k) => {
                  if (k.toLowerCase() !== 'content-type') h[k] = v;
                });
                return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
              }));
              return;
            }
            // Debug: log why attachment failed to load
            if (att) {
              console.warn('[orbit-db] Attachment "' + att.name + '" (id=' + id + ') has no data: data=' + (att.data ? att.data.length : 'null') + ', localPath=' + att.localPath);
            } else {
              console.warn('[orbit-db] Attachment not found for id=' + id);
            }
          }
          resolve(new Response(null, { status: 404 }));
        });
      }
    } catch (e) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, { status: 404 });
  });
  protocol.handle('orbit-avatar', (request) => {
    try {
      const groupId = request.url.replace('orbit-avatar://', '').split('/')[0];
      return new Promise((resolve) => {
        if (globalDb) {
          const group = globalDb.getGroup(groupId);
          if (group && group.avatarPath && fs.existsSync(group.avatarPath)) {
            resolve(net.fetch('file:///' + group.avatarPath.replace(/\\/g, '/')).then(r => {
              return new Response(r.body, { headers: cacheHeaders({ 'Content-Type': 'image/webp' }) });
            }));
            return;
          }
        }
        resolve(new Response(null, { status: 404 }));
      });
    } catch (e) {
      return new Response(null, { status: 404 });
    }
  });

  // Init DB
  globalDb = new OrbitDatabase(app.getPath('userData'));
  tempDirPath = path.join(app.getPath('userData'), 'temp');

  // ── One-time: retire the `classicUI` setting ────────────────────────────────
  //
  // ⚠⚠ THE KEY IS DELETED, NOT INVERTED, AND THAT IS THE POINT. `classicUI` was
  // a boolean whose DEFAULT was `false`, so a stored `false` cannot be told apart
  // from "never touched it" — and since the app persisted the whole settings
  // object on any change, almost every profile has one. Inverting it would have
  // kept exactly those people on the redesign, which is the opposite of what the
  // change is for.
  //
  // So it is dropped and the new `newUI` default applies: everyone lands on the
  // original UI and can opt into the beta. The only profiles with an explicit
  // `classicUI: true` also land on the original UI, which is what they had.
  //
  // ⚠ BOTH STORES. electron-store is the durable source, but `store.js` reads
  // SQLite at boot through `getAllStartupData`, and the Database constructor has
  // already copied electron-store over it by this line — so cleaning only one
  // leaves the other to reintroduce the key.
  //
  // ⚠ A migration that throws must not stop the app booting; a stale key costs
  // one wrong default, a crash costs everything.
  try {
    const stored = persistentStore.get('settings');
    if (stored && Object.prototype.hasOwnProperty.call(stored, 'classicUI')) {
      const cleaned = Object.assign({}, stored);
      delete cleaned.classicUI;
      persistentStore.set('settings', cleaned);
      globalDb.setSetting('settings', cleaned);
      dlog('[Startup] Retired the classicUI setting; the original UI is the default now');
    }
  } catch (e) {
    console.error('[Startup] Could not retire the classicUI setting:', e && e.message);
  }

  // Check attachment integrity on startup
  try {
    const attCheck = globalDb.checkAttachmentIntegrity();
    if (!attCheck.ok) {
      console.warn('[Startup] Attachment integrity issues found:', attCheck.warnings);
      // Auto-clean broken attachments with empty data
      const cleanup = globalDb.cleanupBrokenAttachments();
      if (cleanup.ok && cleanup.removed > 0) {
        dlog('[Startup] Removed ' + cleanup.removed + ' broken attachment(s)');
      }
    }
  } catch(e) { /* ignore */ }

  // Ensure avatars directory exists
  const avatarDirPath = path.join(app.getPath('userData'), 'avatars');
  if (!fs.existsSync(avatarDirPath)) {
    fs.mkdirSync(avatarDirPath, { recursive: true });
  }
  if (!fs.existsSync(tempDirPath)) {
    fs.mkdirSync(tempDirPath, { recursive: true });
  }

  // Periodic temp dir cleanup for orphaned files (every hour)
  setInterval(() => {
    // Resumable-transfer TTL: drop transfer_state rows + partial files older
    // than 24h (updatedAt). Runs regardless of privacy mode.
    if (transferInstance && transferInstance.sweepStaleTransfers) {
      transferInstance.sweepStaleTransfers(24 * 60 * 60 * 1000);
    }
    if (globalDb && tempDirPath && fs.existsSync(tempDirPath)) {
      const settings = globalDb.getSetting('settings', {});
      if (settings.privacyMode === true) {
        // In privacy mode, clean temp files that aren't referenced by active sessions
        try {
          const files = fs.readdirSync(tempDirPath);
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          const now = Date.now();
          files.forEach(f => {
            const filePath = path.join(tempDirPath, f);
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) {
              fs.unlinkSync(filePath);
              // L2: drop the matching transfer_state row too — the partial it
              // references is gone, so keep the DB consistent (rows are keyed
              // by fileId; temp files are named orbit_<fileId>).
              if (transferInstance && transferInstance._deleteTransferRow) {
                const rowFileId = f.indexOf('orbit_') === 0 ? f.slice(6) : f;
                transferInstance._deleteTransferRow(rowFileId);
              }
            }
          });
        } catch(e) { /* ignore cleanup errors */ }
      }
    }
  }, 3600000);

  // Start background attachment cleanup
  setInterval(() => {
    if (globalDb) {
      const settings = globalDb.getSetting('settings', {});
      let cleanupMinutes = 0; // Default to Never
      if (settings.deleteAttachmentsAfter !== undefined && settings.deleteAttachmentsAfter !== null) {
        cleanupMinutes = settings.deleteAttachmentsAfter;
      }
      if (cleanupMinutes > 0) {
        globalDb.cleanupOldAttachments(cleanupMinutes);
      }
    }
  }, 60000); // Check every minute

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 860,
    minHeight: 600,
    frame: false,          // Custom titlebar
    transparent: true,
    backgroundColor: '#0E0F14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'src/icons/app/orbit.ico'),
    titleBarStyle: 'hidden',
  });
  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
  mainWindow.maximize();

  // Handle window controls
  ipcMain.on('window-controls', (event, action) => {
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    if (action === 'close') {
      // By default, just hide to tray
      mainWindow.hide();
    }
  });

  ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // Authoritative app version. preload's `version` field reads
  // process.env.npm_package_version, which is only set when the app is started
  // through an npm script — in a packaged build it is undefined and falls back
  // to a hardcoded string. The update check compares against this value, so a
  // stale answer would report "update available" forever.
  ipcMain.on('app-version', (event) => {
    event.returnValue = app.getVersion();
  });

  // Open a link in the user's browser. Restricted to https GitHub hosts on
  // purpose: this is reachable from the renderer, and a blanket openExternal
  // would let any injected string launch arbitrary schemes (file:, smb:,
  // custom protocol handlers) on the host.
  //
  // NOTE: event.returnValue is assigned exactly once, at the end. Electron
  // reads it when the handler returns, but only the first assignment appears to
  // stick — setting it up front as a default and again on success leaves the
  // renderer with the initial value.
  ipcMain.on('open-external', (event, url) => {
    let opened = false;
    if (typeof url === 'string' && url.length <= 2048) {
      let parsed = null;
      try {
        parsed = new URL(url);
      } catch (e) {
        parsed = null;
      }
      if (parsed && parsed.protocol === 'https:') {
        const host = parsed.hostname.toLowerCase();
        const allowed = host === 'github.com' || host.endsWith('.github.com') || host.endsWith('.githubusercontent.com');
        if (allowed) {
          try {
            const pending = shell.openExternal(url);
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
            opened = true;
          } catch (e) {
            // ⚠ console.error, not dlog: the user asked to open a page and it did
            // not open. That is a failure, not debug chatter, and it is exactly
            // the line a bug report needs.
            console.error('[Update] openExternal failed:', e && e.message);
          }
        }
      }
    }
    event.returnValue = opened;
  });

  // Update checks fetch GitHub over the network. The renderer cannot do this
  // itself: index.html pins a Content-Security-Policy whose connect-src lists
  // only a few origins, so api.github.com / raw.githubusercontent.com are
  // blocked there ("Failed to fetch"). Rather than widen the CSP for this, the
  // request happens here — where there is no CSP and no CORS — and only the
  // response body crosses back. Hosts are allowlisted for the same reason
  // open-external is.
  const UPDATE_HOSTS = ['api.github.com', 'raw.githubusercontent.com'];
  ipcMain.handle('update-fetch', async (event, url) => {
    if (typeof url !== 'string' || url.length > 2048) return { ok: false, status: 0, body: '', error: 'bad url' };
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { ok: false, status: 0, body: '', error: 'bad url' };
    }
    if (parsed.protocol !== 'https:' || UPDATE_HOSTS.indexOf(parsed.hostname.toLowerCase()) === -1) {
      return { ok: false, status: 0, body: '', error: 'host not allowed' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'Orbit/' + app.getVersion() }
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body: body };
    } catch (e) {
      return { ok: false, status: 0, body: '', error: String((e && e.message) || e) };
    } finally {
      clearTimeout(timer);
    }
  });

  /* ---- Update download ----
     Orbit builds are unsigned, so there is no silent self-install: electron-updater
     needs a signed NSIS/dmg before it may replace the binary in place. What this
     does instead is fetch the installer for the user's platform into a folder
     they can find, verify it against the release's SHA256SUMS.txt, and then let
     the UI offer Open / Show in folder.

     GitHub serves release assets from github.com and REDIRECTS to
     objects.githubusercontent.com, so both hosts are allowed and fetch follows
     the redirect. Everything here treats the release payload as untrusted input. */
  const _downloadedFiles = new Set();
  let _activeDownload = null;

  // Extracted to desktop/lib/update-assets.js so it can be tested; the logic is
  // unchanged. Closures in here are unreachable from a test, and the mobile updater
  // proved what that costs.
  const _updateAssets = require('./lib/update-assets');
  const _isAllowedUpdateHost = _updateAssets.isAllowedUpdateHost;

  const _safeAssetName = _updateAssets.safeAssetName;

  function _updateDownloadDir() {
    let base;
    try {
      base = app.getPath('downloads');
    } catch (e) {
      base = app.getPath('userData');
    }
    return path.join(base, 'Orbit Updates');
  }

  function _sha256File(file) {
    return new Promise((resolve, reject) => {
      const h = crypto.createHash('sha256');
      const s = fs.createReadStream(file);
      s.on('error', reject);
      s.on('data', (d) => h.update(d));
      s.on('end', () => resolve(h.digest('hex')));
    });
  }

  // Parse a SHA256SUMS.txt manifest. Entries are "<hash>  <name>" or
  // "<hash> *<name>", and the name may carry a path prefix — compare basenames.
  //
  // The name can also differ cosmetically from the asset: GitHub rewrites spaces
  // in uploaded filenames to dots, so the manifest says
  // "Orbit Setup 0.6.4-beta.exe" while the asset is
  // "Orbit.Setup.0.6.4-beta.exe". Comparing normalized forms as well is what
  // makes Windows verification actually match.
  function _normalizeAssetName(n) {
    return String(n || '').trim().toLowerCase().replace(/\s+/g, '.');
  }

  function _manifestHash(text, filename) {
    const want = path.basename(String(filename || ''));
    const wantNorm = _normalizeAssetName(want);
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
      const m = line.trim().match(/^([0-9a-fA-F]{64})\s+\*?(.+)$/);
      if (!m) continue;
      const entry = path.basename(m[2].trim());
      if (entry === want || _normalizeAssetName(entry) === wantNorm) return m[1].toLowerCase();
    }
    return null;
  }

  ipcMain.handle('update-download', async (event, payload) => {
    if (_activeDownload) return { ok: false, error: 'a download is already running' };

    const url = payload && payload.url;
    const manifestUrl = payload && payload.manifestUrl;
    if (typeof url !== 'string' || url.length > 2048) return { ok: false, error: 'bad url' };
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return { ok: false, error: 'bad url' };
    }
    if (parsed.protocol !== 'https:' || !_isAllowedUpdateHost(parsed.hostname)) {
      return { ok: false, error: 'host not allowed' };
    }
    if (manifestUrl) {
      let mp;
      try {
        mp = new URL(manifestUrl);
      } catch (e) {
        return { ok: false, error: 'bad manifest url' };
      }
      if (mp.protocol !== 'https:' || !_isAllowedUpdateHost(mp.hostname)) {
        return { ok: false, error: 'host not allowed' };
      }
    }

    const dir = _updateDownloadDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: 'could not create ' + dir };
    }
    const name = _safeAssetName(payload && payload.name);
    const dest = path.join(dir, name);
    const part = dest + '.part';
    const controller = new AbortController();
    _activeDownload = { controller, part };

    const send = (data) => {
      try { event.sender.send('update-download-progress', data); } catch (e) { /* window gone */ }
    };

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Orbit/' + app.getVersion() }
      });
      if (!res.ok) return { ok: false, error: 'GitHub responded ' + res.status };
      if (!res.body) return { ok: false, error: 'empty response body' };

      const total = Number(res.headers.get('content-length')) || 0;
      let received = 0;
      let lastEmit = 0;
      const out = fs.createWriteStream(part);
      const reader = res.body.getReader();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.length;
        if (!out.write(Buffer.from(chunk.value))) {
          await new Promise((r) => out.once('drain', r));
        }
        const now = Date.now();
        if (now - lastEmit > 150) {
          lastEmit = now;
          send({ received, total, percent: total ? Math.round((received / total) * 100) : 0 });
        }
      }
      await new Promise((resolve, reject) => {
        out.on('error', reject);
        out.end(() => resolve());
      });
      send({ received, total, percent: 100, done: true });

      fs.renameSync(part, dest);
      const sha256 = await _sha256File(dest);

      // Verification is best-effort: a release without a manifest reports
      // "not verified" (null) rather than blocking the user.
      let verified = null;
      if (manifestUrl) {
        try {
          const mres = await fetch(manifestUrl, { headers: { 'User-Agent': 'Orbit/' + app.getVersion() } });
          if (mres.ok) {
            const expected = _manifestHash(await mres.text(), name);
            if (expected) verified = (expected === sha256);
          }
        } catch (e) { /* manifest is optional */ }
      }

      if (verified === false) {
        // Never leave a file we know is wrong where it can be run by hand.
        try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
        return { ok: false, error: 'checksum mismatch', sha256 };
      }

      _downloadedFiles.add(dest);
      return { ok: true, path: dest, name, size: received, sha256, verified };
    } catch (e) {
      try { fs.rmSync(part, { force: true }); } catch (e2) { /* ignore */ }
      if (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) return { ok: false, cancelled: true };
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      _activeDownload = null;
    }
  });

  ipcMain.on('update-download-cancel', () => {
    if (_activeDownload) {
      try { _activeDownload.controller.abort(); } catch (e) { /* ignore */ }
    }
  });

  // Only a file this process downloaded may be opened or revealed, so a
  // compromised renderer cannot use these as a general "run anything" primitive.
  ipcMain.handle('update-open-file', async (event, file) => {
    if (typeof file !== 'string' || !_downloadedFiles.has(file)) {
      return { ok: false, error: 'not a downloaded file' };
    }
    const err = await shell.openPath(file);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle('update-reveal-file', (event, file) => {
    if (typeof file !== 'string' || !_downloadedFiles.has(file)) {
      return { ok: false, error: 'not a downloaded file' };
    }
    shell.showItemInFolder(file);
    return { ok: true };
  });

  // Tray Setup
  const iconPath = path.join(__dirname, 'src/icons/app/orbit.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  // The tray menu mirrors live app state, so it is rebuilt rather than built
  // once. The RENDERER is the single writer for presence and mute — main only
  // reflects what it is told and asks the renderer to act, which keeps one owner
  // per setting instead of two places racing to write it.
  const trayState = {
    status: 'online',
    muted: false,
    name: '',
    tag: ''
  };

  function traySend(action, value) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tray-action', { action, value });
    }
  }

  function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }

  // Electron fires no "menu is about to open" event for a tray, so the menu is
  // rebuilt whenever the renderer reports a state change.
  const TRAY_STATUSES = [
    { id: 'online', label: 'Online' },
    { id: 'away', label: 'Away' },
    { id: 'busy', label: 'Busy' },
    { id: 'offline', label: 'Invisible' }
  ];

  function buildTrayMenu() {
    const pinEnabled = persistentStore.get('pin_enabled', false);
    const handle = trayState.name
      ? (trayState.name + (trayState.tag ? '#' + trayState.tag : ''))
      : '';

    const template = [
      { label: 'Open Orbit', click: showMainWindow },
      { type: 'separator' },
      {
        label: handle ? ('Copy My Orbit ID  —  ' + handle) : 'Copy My Orbit ID',
        enabled: !!handle,
        click: () => {
          try {
            clipboard.writeText(handle);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('toast', 'Orbit ID copied to clipboard', 'success');
            }
          } catch (e) { /* clipboard unavailable — nothing to do */ }
        }
      },
      {
        label: 'My Status',
        submenu: TRAY_STATUSES.map(s => ({
          label: s.label,
          type: 'radio',
          checked: trayState.status === s.id,
          click: () => traySend('set-status', s.id)
        }))
      },
      {
        label: 'Mute Notifications',
        type: 'checkbox',
        checked: !!trayState.muted,
        click: () => traySend('toggle-mute')
      },
      { type: 'separator' },
      {
        label: 'Check for Updates',
        click: () => { showMainWindow(); traySend('check-updates'); }
      }
    ];

    if (pinEnabled) {
      template.push({ label: 'Lock Orbit', click: () => traySend('lock') });
    }

    template.push({ type: 'separator' }, { label: 'Quit Orbit', click: () => app.quit() });

    return Menu.buildFromTemplate(template);
  }

  function refreshTrayMenu() {
    if (!tray) return;
    try {
      tray.setContextMenu(buildTrayMenu());
    } catch (e) {
      // Log rather than swallow: a broken menu would otherwise be invisible.
      console.warn('[Tray] failed to build context menu:', e && e.message);
    }
  }

  // The renderer reports presence / mute / identity changes here.
  ipcMain.on('tray-state', (event, patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (typeof patch.status === 'string') trayState.status = patch.status;
    if (typeof patch.muted === 'boolean') trayState.muted = patch.muted;
    if (typeof patch.name === 'string') trayState.name = patch.name;
    if (typeof patch.tag === 'string') trayState.tag = patch.tag;
    refreshTrayMenu();
  });

  tray.setToolTip('Orbit');
  refreshTrayMenu();
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  // Notification Handler
  ipcMain.on('show-notification', (event, title, body, iconData) => {
    if (Notification.isSupported()) {
      // The Orbit app icon, deliberately — not the sender's avatar. The icon is
      // how a user tells which app a notification came from, and swapping in a
      // face made Orbit's toasts look like they came from whatever contact sent
      // them. iconData is still accepted so the callers keep working.
      const notif = new Notification({ title, body, icon: icon });
      notif.on('click', () => {
        if (mainWindow) {
           if (mainWindow.isMinimized()) mainWindow.restore();
           mainWindow.show();
        }
      });
      notif.show();
    }
  });

  // Handle storage and system info synchronously
  ipcMain.on('store-get', (event, key) => {
    event.returnValue = persistentStore.get(key);
  });
  ipcMain.on('store-set', (event, key, val) => {
    persistentStore.set(key, val);
    event.returnValue = true;
  });
  ipcMain.on('store-delete', (event, key) => {
    persistentStore.delete(key);
    event.returnValue = true;
  });
  ipcMain.on('get-hostname', (event) => {
    event.returnValue = os.hostname();
  });
  ipcMain.on('get-uuid', (event) => {
    event.returnValue = uuidv4();
  });
  ipcMain.handle('get-local-ips', () => {
    return getLocalIPv4s();
  });
  ipcMain.on('write-clipboard', (event, text) => {
    clipboard.writeText(text || '');
    event.returnValue = true;
  });

  // E2EE IPC
  ipcMain.on('e2ee-get-public-key', (event) => {
    // SPKI hex — the unified format both platforms advertise.
    event.returnValue = e2ee.getPublicKey();
  });
  // Returns { v:2, ciphertext, nonce } for a unified peer, { v:1, packed } for a
  // legacy peer, or null when the message cannot be encrypted.
  ipcMain.on('e2ee-encrypt', (event, plaintext, peerKey) => {
    try {
      event.returnValue = e2ee.encrypt(plaintext, peerKey);
    } catch (e) {
      event.returnValue = null;
    }
  });
  // Legacy envelope — a single packed base64 string (iv || ct || tag).
  ipcMain.on('e2ee-decrypt', (event, packedB64, peerKey) => {
    try {
      event.returnValue = e2ee.decryptPacked(packedB64, peerKey);
    } catch (e) {
      event.returnValue = null;
    }
  });
  // Unified envelope — ciphertext and nonce as separate fields.
  ipcMain.on('e2ee-decrypt-v2', (event, ciphertextB64, nonceB64, peerKey) => {
    try {
      event.returnValue = e2ee.decryptFields(ciphertextB64, nonceB64, peerKey);
    } catch (e) {
      event.returnValue = null;
    }
  });

  ipcMain.on('pin-verify', (event, pin) => {
    var currentHash = persistentStore.get('pin_hash');
    if (!currentHash) { event.returnValue = false; return; }
    var hash = crypto.createHash('sha256').update(String(pin)).digest('hex');
    event.returnValue = hash === currentHash;
  });

  ipcMain.on('pin-set', (event, pin) => {
    var hash = crypto.createHash('sha256').update(String(pin)).digest('hex');
    persistentStore.set('pin_hash', hash);
    persistentStore.set('pin_enabled', true);
    event.returnValue = true;
  });

  ipcMain.on('pin-disable', (event, currentPin) => {
    var currentHash = persistentStore.get('pin_hash');
    if (currentHash) {
      var hash = crypto.createHash('sha256').update(String(currentPin)).digest('hex');
      if (hash !== currentHash) { event.returnValue = false; return; }
    }
    persistentStore.delete('pin_hash');
    persistentStore.set('pin_enabled', false);
    event.returnValue = true;
  });

  ipcMain.on('pin-status', (event) => {
    event.returnValue = persistentStore.get('pin_enabled', false);
  });

  ipcMain.on('pin-forgot', () => {
    persistentStore.delete('pin_hash');
    persistentStore.set('pin_enabled', false);
  });

  // Database IPC
  ipcMain.on('db-get-all-startup-data', (event, userId) => {
    if (!globalDb) { event.returnValue = null; return; }
    event.returnValue = globalDb.getAllStartupData(userId || null);
  });
  ipcMain.on('db-get-local-user', (event) => {
    event.returnValue = globalDb.getLocalUser();
  });
  ipcMain.on('db-get-user', (event, userId) => {
    event.returnValue = globalDb.getUser(userId);
  });
  ipcMain.on('db-get-all-users', (event) => {
    event.returnValue = globalDb.getAllUsers();
  });
  ipcMain.on('db-delete-user', (event, userId) => {
    globalDb.deleteUser(userId);
    event.returnValue = true;
  });
  ipcMain.on('db-save-user', (event, user) => {
    globalDb.saveUser(user);
    event.returnValue = true;
  });
  ipcMain.on('db-get-friends', (event) => {
    event.returnValue = globalDb.getFriends();
  });
  ipcMain.on('db-save-friend', (event, friend) => {
    globalDb.saveFriend(friend);
    event.returnValue = true;
  });
  ipcMain.on('db-get-messages', (event, chatId) => {
    event.returnValue = globalDb.getMessages(chatId);
  });
  ipcMain.on('db-all-messages-raw', (event) => {
    event.returnValue = globalDb.getAllMessagesRaw();
  });
  ipcMain.on('db-search-messages', (event, query, options) => {
    event.returnValue = globalDb.searchMessages(query, options);
  });
  ipcMain.on('db-add-message', (event, chatId, msg) => {
    globalDb.addMessage(chatId, msg);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-message', (event, chatId, msgId) => {
    globalDb.deleteMessage(chatId, msgId);
    event.returnValue = true;
  });
  ipcMain.on('db-save-attachment', (event, msgId, attachment) => {
    event.returnValue = globalDb.saveAttachment(msgId, attachment);
  });
  ipcMain.on('db-get-attachment', (event, attachmentId) => {
    event.returnValue = globalDb.getAttachment(attachmentId);
  });
  ipcMain.on('db-delete-attachment', (event, attachmentId) => {
    globalDb.stmts.deleteAttachment.run(attachmentId);
    event.returnValue = true;
  });
  ipcMain.on('db-edit-message', (event, chatId, msgId, newText) => {
    globalDb.editMessage(chatId, msgId, newText);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-message', (event, chatId, msgId) => {
    globalDb.deleteMessage(chatId, msgId);
    event.returnValue = true;
  });
  ipcMain.on('db-clear-attachments', (event) => {
    globalDb.clearAllAttachments();
    event.returnValue = true;
  });
  ipcMain.on('db-get-setting', (event, key, def) => {
    event.returnValue = globalDb.getSetting(key, def);
  });
  ipcMain.on('db-set-setting', (event, key, val) => {
    globalDb.setSetting(key, val);
    event.returnValue = true;
  });

  // Group IPC
  ipcMain.on('db-get-groups', (event) => {
    event.returnValue = globalDb.getGroups();
  });
  ipcMain.on('db-get-group', (event, groupId) => {
    event.returnValue = globalDb.getGroup(groupId);
  });
  ipcMain.on('db-save-group', (event, group) => {
    globalDb.saveGroup(group);
    event.returnValue = true;
  });
  ipcMain.on('db-add-group-member', (event, groupId, user) => {
    globalDb.addGroupMember(groupId, user);
    event.returnValue = true;
  });
  ipcMain.on('db-remove-group-member', (event, groupId, userId) => {
    globalDb.removeGroupMember(groupId, userId);
    event.returnValue = true;
  });
  ipcMain.on('db-get-group-members', (event, groupId) => {
    event.returnValue = globalDb.getGroupMembers(groupId);
  });
  ipcMain.on('db-set-member-role', (event, groupId, userId, role) => {
    globalDb.setMemberRole(groupId, userId, role);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-group', (event, groupId) => {
    globalDb.deleteGroup(groupId);
    event.returnValue = true;
  });
  ipcMain.on('db-delete-friend', (event, userId) => {
    globalDb.deleteFriend(userId);
    event.returnValue = true;
  });
  ipcMain.on('db-update-group-field', (event, groupId, field, value) => {
    globalDb.updateGroupField(groupId, field, value);
    event.returnValue = true;
  });
  ipcMain.on('db-get-group-by-invite', (event, code) => {
    event.returnValue = globalDb.getGroupByInviteCode(code);
  });
  ipcMain.handle('save-avatar', async (event, groupId, base64Data) => {
    try {
      const avatarDirPath = path.join(app.getPath('userData'), 'avatars');
      const filePath = path.join(avatarDirPath, groupId + '.webp');
      const buf = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filePath, buf);
      if (globalDb) globalDb.updateGroupField(groupId, 'avatarUpdatedAt', Date.now());
      return filePath;
    } catch (e) {
      return null;
    }
  });

  // Read State
  ipcMain.on('db-get-read-state', (event, chatId) => {
    if (!globalDb) { event.returnValue = null; return; }
    event.returnValue = globalDb.getReadState(chatId);
  });
  ipcMain.on('db-set-read-state', (event, chatId, lastReadMsgId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.setReadState(chatId, lastReadMsgId);
    event.returnValue = true;
  });
  ipcMain.on('db-add-mention', (event, chatId, msgId, senderId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.addMention(chatId, msgId, senderId);
    event.returnValue = true;
  });
  ipcMain.on('db-get-mentions', (event, chatId) => {
    if (!globalDb) { event.returnValue = []; return; }
    event.returnValue = globalDb.getMentions(chatId);
  });
  ipcMain.on('db-clear-mentions', (event, chatId) => {
    if (!globalDb) { event.returnValue = false; return; }
    globalDb.clearMentions(chatId);
    event.returnValue = true;
  });

  // Database Health Check
  ipcMain.on('db-health-check', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, errors: ['Database not initialized'], warnings: [] }; return; }
    event.returnValue = globalDb.healthCheck();
  });

  // Database Repair
  ipcMain.on('db-repair', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, repaired: [], warnings: ['Database not initialized'] }; return; }
    event.returnValue = globalDb.repairDatabase();
  });

  // Attachment Integrity Check
  ipcMain.on('db-check-attachment-integrity', (event) => {
    if (!globalDb) { event.returnValue = { ok: false, warnings: ['Database not initialized'] }; return; }
    event.returnValue = globalDb.checkAttachmentIntegrity();
  });

  // The account bundle, in memory. Used by "Link a phone", which encrypts it and
  // sends it over the socket rather than writing it to a file.
  ipcMain.handle('account-bundle', async () => {
    try {
      if (!globalDb) return { ok: false, error: 'Database not ready' };
      return { ok: true, backup: globalDb.buildBackupPackage() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Backup dialog
  ipcMain.handle('backup-create', async (event, format) => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'Orbit-Backup-' + new Date().toISOString().split('T')[0] + (format === 'orzip' ? '.orzip' : '.zip'),
        filters: [
          { name: 'Orbit Backup', extensions: ['orzip'] },
          { name: 'ZIP Archive', extensions: ['zip'] }
        ]
      });
      if (result.canceled) return { canceled: true };
      if (format === 'orzip') {
        return { ...globalDb.exportBackupAsOrzip(result.filePath), canceled: false };
      } else {
        return { ...await globalDb.exportBackupAsZip(result.filePath), canceled: false };
      }
    } catch (e) {
      return { canceled: false, error: e.message };
    }
  });

  // Restore dialog
  ipcMain.handle('backup-restore', async (event) => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        filters: [{ name: 'Orbit Backup', extensions: ['orzip', 'zip'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) return { canceled: true };
      const filePath = result.filePaths[0];
      const validation = globalDb.validateBackup(filePath);
      if (!validation.valid) return { ok: false, error: validation.error };
      const restoreResult = globalDb.restoreBackup(filePath);
      if (restoreResult.ok && mainWindow) mainWindow.webContents.send('state-invalidate');
      return restoreResult;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Backup validation (dry-run)
  ipcMain.handle('backup-validate', async (event, filePath) => {
    return globalDb.validateBackup(filePath);
  });

  // Renderer → main process logging (appears in terminal)
  ipcMain.on('log', (event, ...args) => {
    dlog('[OVP-IPC]', ...args);
  });

  // Networking IPC
  ipcMain.on('toggle-devtools', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'bottom' });
      }
    }
  });

  function setupNetworkInstances() {
    if (socketInstance) return;
    socketInstance = new SocketManager(() => currentIdentity);
    transferInstance = new TransferManager(socketInstance, { tempDir: tempDirPath, db: globalDb });

    transferInstance.onProgress = (fileId, progressData) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer-progress', { fileId, ...progressData });
      }
    };

    transferInstance.onError = (fileId, errorMsg) => {
      if (mainWindow) {
        mainWindow.webContents.send('transfer-error', { fileId, error: errorMsg });
      }
    };

    socketInstance.on('message', (packet) => {
      if (packet.type === Protocol.Types.FILE_TRANSFER_START) {
        transferInstance.handleStart(packet);
      } else if (packet.type === Protocol.Types.FILE_CHUNK) {
        transferInstance.handleChunk(packet);
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_END) {
        transferInstance.handleEnd(packet, (savedPath, fileName, fileId, fileSize, type, mimeType) => {
           mainWindow.webContents.send('file-received', { path: savedPath, name: fileName, sender: packet.from, fileId: fileId, size: fileSize, type: type || undefined, mimeType: mimeType || undefined });
        }, (errorMsg, fileId) => {
           console.error('File Transfer Error:', errorMsg);
           if (mainWindow) {
             mainWindow.webContents.send('transfer-error', { fileId, error: errorMsg });
           }
        });
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_CANCEL) {
        transferInstance.handleCancel(packet);
        if (mainWindow) {
          // Mirror the FILE_TRANSFER_RESUME forward (M4): the renderer chat
          // path may own a send session for this fileId, so tell it to abort.
          mainWindow.webContents.send('transfer-cancel', { fileId: packet.payload.fileId, senderId: packet.from });
          mainWindow.webContents.send('transfer-error', { fileId: packet.payload.fileId, error: 'Sender cancelled the transfer' });
        }
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_RESUME) {
        // Receiver → sender: the peer asks us to continue a partial transfer.
        // If a main-process send session owns this fileId, resume internally;
        // otherwise the renderer chat path may own it, so forward the packet.
        const handled = transferInstance.handleResume(packet);
        if (!handled && mainWindow) {
          mainWindow.webContents.send('network-message', packet);
        }
      } else if (packet.type === Protocol.Types.FILE_TRANSFER_REJECT) {
        if (mainWindow) {
          var reason = packet.payload.reason === 'disk_space' ? 'Recipient has insufficient disk space' : 'Transfer rejected by recipient';
          mainWindow.webContents.send('transfer-error', { fileId: packet.payload.fileId, error: reason });
        }
      } else if (packet.type === Protocol.Types.BEACON) {
        if (packet.payload && mainWindow) {
          var peerData = packet.payload;
          // Bug #1: mobile BEACON lacks ip — fall back to socket remote address
          peerData.ip = peerData.ip || packet._fromIp || null;
          mainWindow.webContents.send('peer-found', peerData);
        }
      } else {
        mainWindow.webContents.send('network-message', packet);
      }
    });

    // Reconnect hook: after the socket re-establishes with a peer, ask them to
    // resume any partial chunked transfers they sent us (persisted or in-flight).
    socketInstance.on('peer-connected', (peerId) => {
      if (transferInstance) {
        transferInstance.resumeIncompleteForPeer(peerId);
      }
    });

    socketInstance.startServer();
  }

  ipcMain.on('network-start', (event, identity, reconnectEnabled, reconnectIntervalMs) => {
    currentIdentity = identity;
    setupNetworkInstances();

    // Apply stored reconnect settings
    if (socketInstance) {
      socketInstance.setReconnect(reconnectEnabled !== false, reconnectIntervalMs || 10000);
    }

    if (!discoveryInstance) {
      discoveryInstance = new Discovery(() => currentIdentity, (peer) => {
        dlog('[AutoConnect] Peer discovered:', peer.username, peer.userId, 'at IP', peer.ip);
        mainWindow.webContents.send('peer-found', peer);
        if (socketInstance && peer.userId && peer.ip) {
          // Check if already connected before auto-connecting
          var alreadyConnected = socketInstance.connections.has(peer.userId) ||
            socketInstance._pendingConnects.has(peer.userId);
          if (alreadyConnected) {
            dlog('[AutoConnect] Already connected or connecting to', peer.userId);
            return;
          }
          dlog('[AutoConnect] Initiating TCP connect to', peer.userId, peer.ip + ':' + (peer.tcpPort || 46000));
          socketInstance.connectToPeer(peer.userId, peer.ip, peer.tcpPort || 46000).then(function() {
            dlog('[AutoConnect] Connected to', peer.userId);
          }).catch(function(err) {
            console.error('[AutoConnect] Connection to', peer.userId, 'failed:', err && err.message);
          });
        } else {
          dlog('[AutoConnect] Skipped — socket:', !!socketInstance, 'userId:', !!peer.userId, 'ip:', !!peer.ip);
        }
      });
      // Sync TCP port from socket instance so beacon broadcasts the right port
      if (socketInstance && socketInstance.TCP_PORT) {
        discoveryInstance.TCP_PORT = socketInstance.TCP_PORT;
      }
      discoveryInstance.onPeerGone = function(peerId) {
        dlog('[AutoConnect] Peer gone:', peerId);
        mainWindow.webContents.send('peer-gone', peerId);
      };
      discoveryInstance.onAnyBeacon = _tryAutoConnect;
      discoveryInstance.start();
      tryAddFirewallRule();
      startLanScan(socketInstance);
      startNetworkMonitor();
    }
    event.returnValue = true;
  });

  ipcMain.on('network-set-reconnect', (event, enabled, intervalMs) => {
    if (socketInstance) {
      socketInstance.setReconnect(enabled, intervalMs);
    }
    event.returnValue = true;
  });

  ipcMain.on('network-stop', () => {
    if (_lanScanTimer) {
      clearInterval(_lanScanTimer);
      _lanScanTimer = null;
    }
    if (_networkMonitorTimer) {
      clearInterval(_networkMonitorTimer);
      _networkMonitorTimer = null;
    }
    if (socketInstance) {
      socketInstance.stop();
      socketInstance = null;
    }
    if (discoveryInstance) {
      discoveryInstance.stop();
      discoveryInstance = null;
    }
    if (transferInstance) {
      transferInstance.destroy();
      transferInstance = null;
    }
  });

  ipcMain.on('network-connect', (event, ip, port) => {
    if (socketInstance) {
      var localIp = getLocalIPv4();
      if (ip === localIp || ip === '127.0.0.1' || ip === 'localhost' || ip === '0.0.0.0' || ip === '::1') {
        if (mainWindow) mainWindow.webContents.send('toast', 'Cannot connect to yourself', 'error');
        return;
      }
      socketInstance.connectToPeer('manual', ip, port || 46000);
    }
  });

  ipcMain.on('network-send', (event, toPeerId, toIp, type, payload) => {
    if (socketInstance) {
      const success = socketInstance.sendMessage(toPeerId, toIp, type, payload);
      event.returnValue = success;
    } else {
      event.returnValue = false;
    }
  });

  ipcMain.handle('network-send-file', async (event, toPeerId, toIp, filePath, fileName) => {
    if (transferInstance) {
      try {
        const fid = await transferInstance.sendFile(toPeerId, toIp, filePath, fileName);
        return fid;
      } catch (e) {
        throw e;
      }
    }
    throw new Error('Network not started');
  });

  ipcMain.on('cancel-transfer', (event, fileId) => {
    if (transferInstance) {
      transferInstance.cancelSend(fileId);
    }
  });

  ipcMain.on('broadcast-beacon', (event, identity) => {
    if (identity) {
      currentIdentity = identity;
    }
    // Send BEACON over all connected TCP sockets so peers get updated profile data in real time
    if (socketInstance) {
      socketInstance.connections.forEach((socket, peerId) => {
        if (!socket.destroyed) {
          socketInstance.sendBeacon(socket);
        }
      });
    }
    // UDP discovery runs on a 5s interval and will pick up the new currentIdentity automatically
  });

  // Open Graph metadata fetch for link previews
  ipcMain.handle('fetch-og', async (event, url) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(function() { controller.abort(); }, 5000);
      const resp = await net.fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) return { url: url, title: '', description: '', image: '', domain: '' };
      const html = await resp.text();
      var domain = '';
      try { domain = new URL(url).hostname; } catch(e) { domain = url; }
      var og = { url: url, title: '', description: '', image: '', domain: domain };
      var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) og.title = titleMatch[1].trim();
      var ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogTitleMatch) og.title = ogTitleMatch[1];
      var ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogDescMatch) { og.description = ogDescMatch[1]; }
      else {
        var descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
        if (descMatch) og.description = descMatch[1];
      }
      var ogImgMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
      if (ogImgMatch) {
        og.image = ogImgMatch[1];
        if (og.image && !og.image.startsWith('http')) {
          try { og.image = new URL(og.image, url).href; } catch(e) {}
        }
      }
      if (!og.image && !og.title && !og.description) {
        og.description = html.replace(/<[^>]+>/g, '').substring(0, 200).trim();
      }
      return og;
    } catch (e) {
      return { url: url, title: '', description: '', image: '', domain: '', error: e.message };
    }
  });

  ipcMain.handle('check-disk-space', () => {
    try {
      const statfs = require('fs').statfsSync(require('os').tmpdir());
      const available = statfs.bavail * statfs.bsize;
      return { ok: true, available };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('get-attachment-duration', (event, url) => {
    try {
      dlog('[IPC-get-attachment-duration] url=' + url);
      const u = new URL(url);
      dlog('[IPC-get-attachment-duration] protocol=' + u.protocol + ' hostname=' + u.hostname + ' pathname=' + u.pathname);
      if (u.protocol !== 'orbit-db:') { dlog('[IPC-get-attachment-duration] wrong protocol'); return null; }
      if (u.hostname !== 'attachment' && !u.pathname.startsWith('/attachment/')) { dlog('[IPC-get-attachment-duration] wrong hostname/path'); return null; }
      const id = u.hostname === 'attachment' ? u.pathname.slice(1) : u.pathname.replace('/attachment/', '');
      dlog('[IPC-get-attachment-duration] id=' + id + ' globalDb=' + (globalDb ? 'yes' : 'no'));
      if (!globalDb) { dlog('[IPC-get-attachment-duration] no globalDb'); return null; }
      const att = globalDb.getAttachment(id);
      dlog('[IPC-get-attachment-duration] att=' + (att ? 'found' : 'null') + ' data=' + (att && att.data ? att.data.length + ' bytes' : 'null') + ' localPath=' + (att && att.localPath ? att.localPath : 'null'));
      if (!att || !att.data || att.data.length < 16) { dlog('[IPC-get-attachment-duration] no data'); return null; }
      const buf = Buffer.isBuffer(att.data) ? att.data : Buffer.from(att.data);
      const len = buf.length;
      dlog('[IPC-get-attachment-duration] buf len=' + len);

      // Unsigned 32-bit big-endian read (safe for MP4 atom sizes & durations)
      function u32(o) {
        if (o + 4 > len) return 0;
        return buf.readUInt32BE(o);
      }
      function str4(o) {
        return String.fromCharCode(buf[o], buf[o+1], buf[o+2], buf[o+3]);
      }

      // Find moov box
      var moovStart = -1, moovEnd = -1;
      var i = 0;
      while (i < len - 8) {
        var size = u32(i);
        var type = str4(i + 4);
        if (size === 0) { size = len - i; }
        else if (size === 1) {
          if (i + 16 > len) break;
          // 64-bit extended size — read high 32 bits and low 32 bits
          size = u32(i + 8) * 4294967296 + u32(i + 12);
        }
        if (size < 8) break;
        if (type === 'moov') { moovStart = i; moovEnd = i + size; break; }
        i += size;
      }
      if (moovStart < 0) { dlog('[IPC-get-attachment-duration] no moov found'); return null; }
      dlog('[IPC-get-attachment-duration] found moov at ' + moovStart + ' size=' + (moovEnd - moovStart));

      // Scan children of moov for mvhd, trak→tkhd, trak→mdia→mdhd
      var mvhdDur = null, mvhdTs = 0;
      var bestTrackDur = null;
      var trexDefaultDurMap = null;
      var trackTimescaleMap = {};

      function scanBox(start, end, depth, currentTrackId) {
        var p = start;
        while (p < end - 8) {
          var bSize = u32(p);
          var bType = str4(p + 4);
          if (bSize === 0) bSize = end - p;
          else if (bSize === 1) {
            if (p + 16 > end) break;
            bSize = u32(p + 8) * 4294967296 + u32(p + 12);
          }
          if (bSize < 8) break;
          var bEnd = p + bSize;
          if (bEnd > end) bEnd = end;
          dlog('[IPC-get-attachment-duration] moov child: ' + bType + ' size=' + bSize + ' offset=' + p);

          if (bType === 'mvhd') {
            var ver = buf[p + 8];
            var ts, dur;
            if (ver === 0) {
              ts = u32(p + 20);
              dur = u32(p + 24);
            } else {
              ts = u32(p + 28);
              dur = u32(p + 32) * 4294967296 + u32(p + 36);
            }
            dlog('[IPC-get-attachment-duration] mvhd ver=' + ver + ' ts=' + ts + ' dur=' + dur);
            mvhdTs = ts;
            if (ts > 0 && dur > 0) {
              mvhdDur = dur / ts;
              dlog('[IPC-get-attachment-duration] mvhd duration=' + mvhdDur + 's');
            }
          } else if (bType === 'tkhd') {
            var ver = buf[p + 8];
            var tkDur, tkTs, tkId;
            if (ver === 0) {
              tkId = u32(p + 20);
              tkTs = mvhdTs || 1000;
              tkDur = u32(p + 28);
            } else {
              tkId = u32(p + 28);
              tkTs = mvhdTs || 1000;
              tkDur = u32(p + 36) * 4294967296 + u32(p + 40);
            }
            dlog('[IPC-get-attachment-duration] tkhd ver=' + ver + ' id=' + tkId + ' dur=' + tkDur + ' ts=' + tkTs + ' => ' + (tkTs > 0 && tkDur > 0 ? tkDur/tkTs + 's' : '0'));
            if (tkTs > 0 && tkDur > 0) {
              var d = tkDur / tkTs;
              if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
            }
          } else if (bType === 'mdhd') {
            if (currentTrackId !== undefined) {
              var ver = buf[p + 8];
              var mdTs, mdDur;
              if (ver === 0) {
                mdTs = u32(p + 20);
                mdDur = u32(p + 24);
              } else {
                mdTs = u32(p + 28);
                mdDur = u32(p + 32) * 4294967296 + u32(p + 36);
              }
              dlog('[IPC-get-attachment-duration] mdhd ver=' + ver + ' id=' + currentTrackId + ' ts=' + mdTs + ' dur=' + mdDur + ' => ' + (mdTs > 0 && mdDur > 0 ? mdDur/mdTs + 's' : '0'));
              trackTimescaleMap[currentTrackId] = mdTs;
              if (mdTs > 0 && mdDur > 0) {
                var d = mdDur / mdTs;
                if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
              }
            }
          } else if (bType === 'mehd') {
            var ver = buf[p + 8];
            var meDur;
            if (ver === 0) {
              meDur = u32(p + 12);
            } else {
              meDur = u32(p + 12) * 4294967296 + u32(p + 16);
            }
            if (meDur > 0) {
              var d = meDur / (mvhdTs || 1000);
              dlog('[IPC-get-attachment-duration] mehd ver=' + ver + ' dur=' + meDur + ' ts=' + (mvhdTs || 1000) + ' => ' + d + 's');
              if (bestTrackDur === null || d > bestTrackDur) bestTrackDur = d;
            }
          } else if (bType === 'trak') {
            // Container — recurse and pass track ID from the tkhd inside
            var trappedTrackId;
            (function() {
              var sp = p + 8;
              while (sp < bEnd - 8) {
                var sbSize = u32(sp);
                var sbType = str4(sp + 4);
                if (sbSize === 0) sbSize = bEnd - sp;
                else if (sbSize === 1) { if (sp + 16 > bEnd) break; sbSize = u32(sp + 8) * 4294967296 + u32(sp + 12); }
                if (sbSize < 8) break;
                if (sbType === 'tkhd') {
                  var tver = buf[sp + 8];
                  trappedTrackId = tver === 0 ? u32(sp + 20) : u32(sp + 28);
                  break;
                }
                sp += sbSize;
              }
            })();
            dlog('[IPC-get-attachment-duration] trak id=' + trappedTrackId);
            scanBox(p + 8, bEnd, depth + 1, trappedTrackId);
          } else if (bType === 'mdia' || bType === 'minf' || bType === 'stbl') {
            // Container boxes — recurse into children
            scanBox(p + 8, bEnd, depth + 1, currentTrackId);
          } else if (bType === 'mvex') {
            // Parse trex children for default sample durations
            scanBox(p + 8, bEnd, depth + 1, currentTrackId);
            var trexMap = {};
            var tx = p + 8;
            while (tx < bEnd - 8) {
              var txSize = u32(tx);
              var txType = str4(tx + 4);
              if (txSize === 0) txSize = bEnd - tx;
              else if (txSize === 1) { if (tx + 16 > bEnd) break; txSize = u32(tx + 8) * 4294967296 + u32(tx + 12); }
              if (txSize < 8) break;
              if (txType === 'trex') {
                var trackId = u32(tx + 12);
                var defDur = u32(tx + 20);
                if (defDur > 0) { trexMap[trackId] = defDur; }
              }
              tx += txSize;
            }
            if (Object.keys(trexMap).length > 0) trexDefaultDurMap = trexMap;
          }
          p += bSize;
        }
      }

      scanBox(moovStart + 8, moovEnd, 0);

      // If moov had no duration, scan the ENTIRE file for moof→traf→trun boxes
      // (fragmented MP4 stores sample durations in movie fragments)
      if (bestTrackDur === null || bestTrackDur <= 0) {
        dlog('[IPC-get-attachment-duration] scanning entire file for moof fragments');
        var trackFragDurs = {};
        var i2 = 0;
        while (i2 < len - 8) {
          var fSize = u32(i2);
          var fType = str4(i2 + 4);
          if (fSize === 0) fSize = len - i2;
          else if (fSize === 1) { if (i2 + 16 > len) break; fSize = u32(i2+8) * 4294967296 + u32(i2+12); }
          if (fSize < 8) break;
          var fEnd = Math.min(i2 + fSize, len);
          if (fType === 'moof') {
            // Scan traf→trun boxes inside this moof
            var p = i2 + 8;
            while (p < fEnd - 8) {
              var tSize = u32(p);
              var tType = str4(p + 4);
              if (tSize === 0) tSize = fEnd - p;
              else if (tSize === 1) { if (p + 16 > fEnd) break; tSize = u32(p+8)*4294967296 + u32(p+12); }
              if (tSize < 8) break;
              var tEnd = Math.min(p + tSize, fEnd);
              if (tType === 'traf') {
                // Scan children: tfhd (default duration) then trun (sample durations)
                var defaultSampleDur = 0;
                var trafTrackId;
                var q = p + 8;
                while (q < tEnd - 8) {
                  var rSize = u32(q);
                  var rType = str4(q + 4);
                  if (rSize === 0) rSize = tEnd - q;
                  else if (rSize === 1) { if (q + 16 > tEnd) break; rSize = u32(q+8)*4294967296 + u32(q+12); }
                  if (rSize < 8) break;
                  if (rType === 'tfhd') {
                    var tfFlags = u32(q + 8) & 0x00FFFFFF;
                    var tfOff = 12;
                    trafTrackId = u32(q + tfOff); tfOff += 4;
                    if (tfFlags & 0x000001) tfOff += 8;
                    if (tfFlags & 0x000002) tfOff += 4;
                    if (tfFlags & 0x000008) { defaultSampleDur = u32(q + tfOff); tfOff += 4; }
                    else if (trexDefaultDurMap && trexDefaultDurMap[trafTrackId]) { defaultSampleDur = trexDefaultDurMap[trafTrackId]; }
                    if (tfFlags & 0x000010) tfOff += 4;
                    if (tfFlags & 0x000020) tfOff += 4;
                  } else if (rType === 'trun') {
                    var trFlags = u32(q + 8) & 0x00FFFFFF;
                    var sampleCount = u32(q + 12);
                    var offset = 16;
                    if (trFlags & 0x000001) offset += 4;
                    if (trFlags & 0x000004) offset += 4;
                    var trackSum = 0;
                    for (var s = 0; s < sampleCount; s++) {
                      if (trFlags & 0x000100) { trackSum += u32(q + offset); offset += 4; }
                      else if (defaultSampleDur > 0) { trackSum += defaultSampleDur; }
                      if (trFlags & 0x000200) offset += 4;
                      if (trFlags & 0x000400) offset += 4;
                      if (trFlags & 0x000800) offset += 4;
                    }
                    if (trackSum > 0 && trafTrackId !== undefined) {
                      if (!trackFragDurs[trafTrackId]) trackFragDurs[trafTrackId] = 0;
                      trackFragDurs[trafTrackId] += trackSum;
                    }
                  }
                  q += rSize;
                }
              }
              p += tSize;
            }
          }
          i2 += fSize;
        }
        // Convert per-track fragment sums to seconds using each track's timescale, take max
        if (Object.keys(trackFragDurs).length > 0) {
          var maxFragDur = 0;
          for (var tid in trackFragDurs) {
            var ts = trackTimescaleMap[tid] || mvhdTs || 1000;
            var d = trackFragDurs[tid] / ts;
            dlog('[IPC-get-attachment-duration] track ' + tid + ' fragment sum: ' + trackFragDurs[tid] + ' / ' + ts + ' = ' + d + 's');
            if (d > maxFragDur) maxFragDur = d;
          }
          dlog('[IPC-get-attachment-duration] max per-track fragment duration: ' + maxFragDur + 's');
          if (bestTrackDur === null || maxFragDur > bestTrackDur) bestTrackDur = maxFragDur;
        } else {
          dlog('[IPC-get-attachment-duration] no moof fragments found or all trun had no sample_duration flag');
        }
      }

      // Priority: mvhd duration > tkhd/mdhd/mehd/fragment duration
      if (mvhdDur !== null && mvhdDur > 0) {
        dlog('[IPC-get-attachment-duration] RESULT (mvhd): ' + mvhdDur + 's');
        return mvhdDur;
      }
      if (bestTrackDur !== null && bestTrackDur > 0) {
        dlog('[IPC-get-attachment-duration] RESULT (tkhd/mdhd/fragment): ' + bestTrackDur + 's');
        return bestTrackDur;
      }

      dlog('[IPC-get-attachment-duration] no valid duration found, returning null');
      return null;
    } catch (e) {
      dlog('[IPC-get-attachment-duration] EXCEPTION: ' + e.message);
      return null;
    }
  });
});

app.on('before-quit', () => {
  if (transferInstance) transferInstance.destroy();
  if (discoveryInstance) discoveryInstance.stop();
  if (socketInstance) socketInstance.stop();
  // Only clean up temp directory when privacy mode is enabled
  if (globalDb) {
    const settings = globalDb.getSetting('settings', {});
    if (settings.privacyMode === true && tempDirPath && fs.existsSync(tempDirPath)) {
      try {
        fs.rmSync(tempDirPath, { recursive: true, force: true });
      } catch(e) {
        console.error('Failed to clean up temp directory:', e.message);
      }
    }
    // Ensure WAL is checkpointed before exit to prevent data loss
    try { globalDb.db.pragma('wal_checkpoint(TRUNCATE)'); } catch(e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
