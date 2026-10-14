// desktop/src/js/components/qr-scanner.js
// Desktop QR pairing — decode a QR *image* (paste, drag-drop, or file picker).
// Desktop has no camera, so this is the image-based counterpart to the mobile
// camera scanner. See plans/docs/Orbit QR Pairing v2 Design.md
//
// Exposes:
//   window.OrbitQRScanner.open()               — standalone modal overlay
//   window.OrbitQRScanner.mount(el, opts)      — inline panel inside a host
//                                                (used by the Add-a-Friend
//                                                modal's QR tab). Returns a
//                                                handle with .destroy().
//
// Both entry points share the same decode + pairing pipeline; only the chrome
// differs. Pairing success is signalled through the onPaired callback so the
// host can close itself.

(function() {
  var overlayEl = null;
  var busy = false;
  var inlineSession = null;   // only one inline scanner may be live at a time

  function toast(title, msg, type) {
    if (window.Toast && window.Toast.show) window.Toast.show(title, msg, type || 'info');
  }

  /* -- decode -- */

  function decodeImageElement(img) {
    if (typeof jsQR === 'undefined') return null;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    var imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return null;   // tainted canvas or unsupported source
    }
    // attemptBoth handles inverted codes (white-on-black screenshots)
    return jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  }

  function decodeDataUrl(dataUrl, onResult) {
    var img = new Image();
    img.onload = function() {
      var code = decodeImageElement(img);
      onResult(code && code.data ? code.data : null);
    };
    img.onerror = function() { onResult(null); };
    img.src = dataUrl;
  }

  function readFileAsDataUrl(file, onResult) {
    var reader = new FileReader();
    reader.onload = function() { onResult(reader.result); };
    reader.onerror = function() { onResult(null); };
    reader.readAsDataURL(file);
  }

  /* -- pairing -- */

  function connectToPeer(ip, port, name) {
    if (!window.orbitAPI || !window.orbitAPI.connect) return;
    try {
      window.orbitAPI.connect(ip, port);
      toast('Connecting', 'Connecting to ' + name + ' at ' + ip + ':' + port + '…', 'info');
    } catch (e) {
      toast('Connect failed', String(e && e.message || e), 'error');
    }
  }

  // `onPaired` fires only on a successful pairing. Every failure path returns
  // without calling it, so the host keeps its UI open for a retry.
  function applyPairing(raw, onPaired) {
    if (!window.Orbit || !Orbit.QRPairing) {
      toast('Unavailable', 'Pairing module not loaded.', 'error');
      return;
    }

    // Own addresses are needed so a QR never makes us connect to ourselves.
    Orbit.QRPairing.listLocalIPv4().then(function(ownIps) {
      var res = Orbit.QRPairing.parsePayload(raw, { ownIps: ownIps });

      if (!res.ok) {
        toast('Not paired', Orbit.QRPairing.describeReason(res.reason), 'error');
        return;
      }

      var data = res.data;
      var name = data.n || 'Unknown';

      // A key we cannot encrypt to is worse than no key — storing it would make
      // E2EE fail later with no explanation. Cross-platform keys land here.
      var publicKey = null;
      if (Orbit.QRPairing.isUsableKey(data)) {
        publicKey = Orbit.QRPairing.exportKey(data.key);
      } else if (data.key) {
        toast('Key not used', 'That device uses a different encryption key format, so this pairing skipped key pinning.', 'info');
      }

      if (window.store && window.store.addOrUpdatePeer) {
        window.store.addOrUpdatePeer({
          userId: data.id,
          username: name,
          usertag: data.t || '',
          status: 'offline',
          ip: data.ips.length ? data.ips[0] : null,
          tcpPort: data.port,
          publicKey: publicKey
        });
        toast('Paired', 'Added ' + name + '.', 'success');
      }

      if (data.ips.length) {
        connectToPeer(data.ips[0], data.port, name);
      } else {
        // v1 codes and mobile codes with no reachable address fall back to
        // discovery — this is expected, not a failure.
        toast('Added ' + name, 'No address in the code — waiting for it to appear on your network.', 'info');
      }

      if (onPaired) onPaired();
    }).catch(function() {
      toast('Pairing failed', 'Could not read local network addresses.', 'error');
    });
  }

  /* -- input handlers -- */

  function onRawPayload(raw, onPaired) {
    if (busy) return;
    if (!raw) {
      toast('No QR code found', 'That image does not contain a readable QR code.', 'error');
      return;
    }
    busy = true;
    applyPairing(raw, onPaired);
    setTimeout(function() { busy = false; }, 1500);
  }

  function handleFile(file, onPaired) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) {
      toast('Unsupported file', 'Drop an image of a QR code.', 'error');
      return;
    }
    readFileAsDataUrl(file, function(url) {
      if (!url) { toast('Read failed', 'Could not read that file.', 'error'); return; }
      decodeDataUrl(url, function(raw) { onRawPayload(raw, onPaired); });
    });
  }

  // Wires drop / paste / file-picker onto a zone. Returns a teardown function.
  // Shared by the overlay and the inline mount so both behave identically.
  function wireScanner(zone, fileInput, chooseBtn, onPaired) {
    function onPaste(e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          var file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file, onPaired);
            return;
          }
        }
      }
    }

    function onDragOver(e) {
      e.preventDefault();
      zone.style.borderColor = 'var(--accent-primary)';
    }

    function onDragLeave() {
      zone.style.borderColor = 'var(--border-subtle)';
    }

    function onDrop(e) {
      e.preventDefault();
      zone.style.borderColor = 'var(--border-subtle)';
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) handleFile(files[0], onPaired);
    }

    function onFileChange(e) {
      if (e.target.files && e.target.files.length) handleFile(e.target.files[0], onPaired);
      e.target.value = '';
    }

    function onChooseClick() { fileInput.click(); }

    zone.addEventListener('dragover', onDragOver);
    zone.addEventListener('dragleave', onDragLeave);
    zone.addEventListener('drop', onDrop);
    if (chooseBtn) chooseBtn.addEventListener('click', onChooseClick);
    if (fileInput) fileInput.addEventListener('change', onFileChange);
    document.addEventListener('paste', onPaste);

    return function teardown() {
      document.removeEventListener('paste', onPaste);
      zone.removeEventListener('dragover', onDragOver);
      zone.removeEventListener('dragleave', onDragLeave);
      zone.removeEventListener('drop', onDrop);
      if (chooseBtn) chooseBtn.removeEventListener('click', onChooseClick);
      if (fileInput) fileInput.removeEventListener('change', onFileChange);
    };
  }

  /* -- UI -- */

  function build() {
    var el = document.createElement('div');
    el.id = 'qr-scanner-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:4000;background:rgba(0,0,0,0.72);' +
      'display:flex;align-items:center;justify-content:center;';

    el.innerHTML =
      '<div style="width:440px;max-width:92vw;background:var(--bg-base);border:1px solid var(--border-subtle);' +
      'border-radius:var(--radius-lg);padding:22px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
          '<h3 style="margin:0;font-size:16px;font-weight:600;color:var(--text-primary);">Pair by QR code</h3>' +
          '<button id="qr-scan-close" style="background:transparent;border:none;color:var(--text-muted);' +
          'font-size:20px;cursor:pointer;line-height:1;padding:0 4px;">&times;</button>' +
        '</div>' +
        '<p style="font-size:12px;color:var(--text-muted);margin:0 0 16px;">' +
          'Paste, drop, or choose an image of a QR code from another Orbit device.' +
        '</p>' +
        '<div id="qr-scan-zone" style="border:2px dashed var(--border-subtle);border-radius:10px;' +
        'padding:28px 16px;text-align:center;color:var(--text-muted);font-size:12px;transition:border-color .15s;">' +
          'Drop a QR image here, or press <strong style="color:var(--text-secondary);">Ctrl+V</strong> to paste one' +
        '</div>' +
        '<div style="margin-top:14px;text-align:center;">' +
          '<button id="qr-scan-choose" style="padding:9px 18px;background:var(--accent-primary);color:#fff;' +
          'border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Choose image…</button>' +
        '</div>' +
        '<input id="qr-scan-file" type="file" accept="image/*" style="display:none;">' +
      '</div>';

    return el;
  }

  function close() {
    if (overlayEl) {
      if (overlayEl._teardown) overlayEl._teardown();
      overlayEl.remove();
      overlayEl = null;
    }
  }

  function open() {
    if (overlayEl) return;

    if (typeof jsQR === 'undefined') {
      toast('Scanner unavailable', 'The QR decoder failed to load.', 'error');
      return;
    }

    overlayEl = build();
    document.body.appendChild(overlayEl);

    var zone = overlayEl.querySelector('#qr-scan-zone');
    var fileInput = overlayEl.querySelector('#qr-scan-file');
    var chooseBtn = overlayEl.querySelector('#qr-scan-choose');

    overlayEl.querySelector('#qr-scan-close').addEventListener('click', close);
    overlayEl._teardown = wireScanner(zone, fileInput, chooseBtn, close);

    // Click outside to dismiss
    overlayEl.addEventListener('mousedown', function(e) {
      if (e.target === overlayEl) close();
    });
  }

  /* -- inline mount (Add-a-Friend modal, QR tab) -- */

  function buildInline() {
    var panel = document.createElement('div');
    panel.innerHTML =
      '<div class="qr-inline-zone" style="border:2px dashed var(--border-subtle);border-radius:10px;' +
      'padding:26px 16px;text-align:center;color:var(--text-muted);font-size:12px;transition:border-color .15s;">' +
        '<i data-lucide="qr-code" style="width:26px;height:26px;display:block;margin:0 auto 10px;color:var(--text-secondary);"></i>' +
        'Drop a QR image here, or press <strong style="color:var(--text-secondary);">Ctrl+V</strong> to paste one' +
      '</div>' +
      '<div style="margin-top:12px;text-align:center;">' +
        '<button class="qr-inline-choose" style="padding:9px 18px;background:var(--accent-primary);color:#fff;' +
        'border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Choose image…</button>' +
      '</div>' +
      '<input class="qr-inline-file" type="file" accept="image/*" style="display:none;">';
    return panel;
  }

  // mount(container, { onPaired }) → { destroy } | null
  function mount(container, opts) {
    opts = opts || {};
    if (!container) return null;

    if (typeof jsQR === 'undefined') {
      toast('Scanner unavailable', 'The QR decoder failed to load.', 'error');
      return null;
    }

    destroyInline();   // never allow two live inline scanners

    var panel = buildInline();
    container.appendChild(panel);
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons({ root: panel }); } catch (e) { /* non-fatal */ }
    }

    var zone = panel.querySelector('.qr-inline-zone');
    var fileInput = panel.querySelector('.qr-inline-file');
    var chooseBtn = panel.querySelector('.qr-inline-choose');

    var teardown = null;
    var handle = {
      panel: panel,
      destroy: function() {
        if (teardown) teardown();
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (inlineSession === handle) inlineSession = null;
      }
    };

    teardown = wireScanner(zone, fileInput, chooseBtn, function() {
      // Paired — tear the panel down and let the host close itself.
      handle.destroy();
      if (opts.onPaired) opts.onPaired();
    });

    inlineSession = handle;
    return handle;
  }

  function destroyInline() {
    if (inlineSession) inlineSession.destroy();
  }

  window.OrbitQRScanner = { open: open, mount: mount, close: close };
})();
