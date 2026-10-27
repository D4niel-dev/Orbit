// shared/legal/consent.js
//
// The Terms of Service and Privacy Policy, and the consent gate in front of NAT.
//
// ⚠⚠ THE TEXT IS A DRAFT AND NEEDS A HUMAN REVIEW BEFORE v1.0.0 SHIPS. It is written
// from what the code actually does — no account, no server holding messages, update
// checks to GitHub, opt-in NAT through a relay — so it is factually checkable, but it is
// not legal advice and nobody qualified has read it.
//
// ⚠ THE DOCUMENTS ARE VERSIONED, and the version is stored when the user agrees. Bump
// `version` when the text changes materially and everyone is asked again — the whole
// point of a consent gate is that consent is to a specific document, not to "terms,
// whatever they say later".
(function () {
  var TERMS_VERSION = 1;
  var PRIVACY_VERSION = 1;

  var DOCS = {
    terms: {
      key: 'terms',
      title: 'Terms of Service',
      version: TERMS_VERSION,
      updated: '27 October 2026',
      sections: [
        {
          h: 'What Orbit is',
          p: [
            'Orbit is a peer-to-peer messenger for desktop and Android. There is no account to create, and there is no Orbit server that stores your messages: a conversation is between your device and the other person\u2019s.'
          ]
        },
        {
          h: 'Your responsibility',
          p: [
            'You choose who you connect to and what you send. Messages, files and calls are yours, and so is the consequence of sending them.',
            'You are responsible for keeping your own backups. Orbit is beta software: features change, and data loss is possible.'
          ]
        },
        {
          h: 'Acceptable use',
          p: [
            'Do not use Orbit to send illegal content, to harass anyone, or to interfere with another person\u2019s device or network.',
            'Do not use it to evade a network policy you are subject to.'
          ]
        },
        {
          h: 'Beta software, no warranty',
          p: [
            'Orbit is provided as-is, without warranty of any kind. It may contain defects, and it may change without notice. To the extent the law allows, the authors are not liable for any loss arising from its use.'
          ]
        },
        {
          h: 'Changes to these terms',
          p: [
            'When these terms change materially, the version number changes and the app asks you to agree again before the affected feature is enabled. Continuing to use the app after a change means you accept the new version.'
          ]
        }
      ]
    },
    privacy: {
      key: 'privacy',
      title: 'Privacy Policy',
      version: PRIVACY_VERSION,
      updated: '27 October 2026',
      sections: [
        {
          h: 'What Orbit does not collect',
          p: [
            'There is no analytics, no telemetry, no crash reporting and no account. Orbit does not have a server that receives your messages, your files or your contact list.'
          ]
        },
        {
          h: 'What stays on your device',
          p: [
            'Your messages, attachments, contacts, groups and settings are stored locally, in a database on your own device. Deleting the app\u2019s data removes them; export or back them up first if you want to keep them.'
          ]
        },
        {
          h: 'What the other device can see',
          p: [
            'To connect to somebody, your device tells them its IP address. That is how peer-to-peer works, and it is also true on a local network. The display name and avatar you set are visible to people you talk to.',
            'When both peers support it, message content is end-to-end encrypted with AES-256-GCM, so only the intended recipient can read it.'
          ]
        },
        {
          h: 'NAT traversal (off by default)',
          p: [
            'NAT traversal lets two devices reach each other when they are not on the same network. It is off unless you turn it on, and turning it on asks for your agreement first.',
            'When it is on, a relay may be used to introduce the two devices. A relay necessarily sees connection metadata \u2014 IP addresses, timing, and how much data moves \u2014 but not the content: WebRTC encrypts the channel in transit, and message content is additionally end-to-end encrypted when both peers have it enabled.'
          ]
        },
        {
          h: 'Update checks',
          p: [
            'Orbit asks GitHub for the latest release version so it can tell you an update exists. That request goes to GitHub and reveals your IP address to them, exactly like visiting a web page. It carries no message content and no identifier. You can turn automatic checks off in Settings.'
          ]
        },
        {
          h: 'Your control',
          p: [
            'Everything Orbit knows is on your device and under your control: export it, or delete it. There is no third party to send a deletion request to, because there is no third party holding it.'
          ]
        }
      ]
    }
  };

  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(String(s == null ? '' : s));
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icons(root) {
    if (window.lucide && window.lucide.createIcons) {
      try { window.lucide.createIcons({ root: root }); } catch (e) { /* non-fatal */ }
    }
  }

  // One overlay shell, shared by the consent gate and the documents, so a document
  // opened from the gate stacks on top of it instead of replacing it.
  function shell(id, width) {
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.6);' +
      'backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px;' +
      'box-sizing:border-box;';
    el.innerHTML =
      '<div style="width:' + width + 'px;max-width:100%;max-height:86vh;background:var(--bg-surface);' +
        'border-radius:var(--radius-lg);border:1px solid var(--border-subtle);box-shadow:var(--shadow-xl);' +
        'display:flex;flex-direction:column;overflow:hidden;"></div>';
    document.body.appendChild(el);
    return el;
  }

  function closeOnBackdrop(el) {
    el.addEventListener('mousedown', function (e) { if (e.target === el) el.remove(); });
  }

  /** Show one document. Returns the overlay element. */
  function openDoc(key) {
    var doc = DOCS[key];
    if (!doc) return null;

    var el = shell('orbit-legal-doc', 520);
    var box = el.firstElementChild;
    box.innerHTML =
      '<div style="padding:22px 24px 0;display:flex;align-items:flex-start;gap:12px;">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:700;font-size:16px;color:var(--text-primary);">' + esc(doc.title) + '</div>' +
          '<div style="font-size:11px;color:var(--text-muted);margin-top:3px;">Version ' + doc.version +
            ' \u00b7 updated ' + esc(doc.updated) + '</div>' +
        '</div>' +
        '<button class="orbit-legal-close" style="background:transparent;border:none;cursor:pointer;' +
          'color:var(--text-muted);padding:2px;flex-shrink:0;"><i data-lucide="x" style="width:18px;height:18px;"></i></button>' +
      '</div>' +
      '<div style="padding:18px 24px;overflow-y:auto;flex:1;">' +
        doc.sections.map(function (s) {
          return '<div style="margin-bottom:16px;">' +
            '<div style="font-size:12px;font-weight:700;color:var(--text-primary);margin-bottom:5px;">' + esc(s.h) + '</div>' +
            s.p.map(function (para) {
              return '<p style="margin:0 0 8px;font-size:12.5px;line-height:1.6;color:var(--text-secondary);">' + esc(para) + '</p>';
            }).join('') +
          '</div>';
        }).join('') +
      '</div>' +
      '<div style="padding:14px 24px 18px;border-top:1px solid var(--border-subtle);display:flex;justify-content:flex-end;">' +
        '<button class="orbit-legal-close" style="padding:9px 20px;border-radius:9px;border:none;' +
          'background:var(--accent-primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Close</button>' +
      '</div>';

    closeOnBackdrop(el);
    box.querySelectorAll('.orbit-legal-close').forEach(function (b) {
      b.addEventListener('click', function () { el.remove(); });
    });
    icons(box);
    return el;
  }

  /**
   * The consent gate. Resolves true if the user agreed, false if they dismissed it.
   * ⚠ It resolves false on Escape and on the backdrop, not just on Cancel — a gate
   * that can be dismissed without an answer must not be readable as consent.
   */
  function openConsent() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKey);
        el.remove();
        resolve(v);
      }
      function onKey(e) { if (e.key === 'Escape') finish(false); }

      var el = shell('orbit-legal-consent', 460);
      var box = el.firstElementChild;
      box.innerHTML =
        '<div style="padding:22px 24px 0;display:flex;align-items:flex-start;gap:12px;">' +
          '<div style="width:36px;height:36px;border-radius:10px;background:var(--accent-soft);' +
            'display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent-primary);">' +
            '<i data-lucide="globe" style="width:18px;height:18px;"></i>' +
          '</div>' +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-weight:700;font-size:15px;color:var(--text-primary);">Turn on NAT traversal?</div>' +
            '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;margin-top:6px;">' +
              'This lets Orbit reach friends who are not on your network. To do that, a relay may help ' +
              'your two devices find each other \u2014 it can see the connection, not what you send.' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="padding:14px 24px 0;font-size:12.5px;line-height:1.55;color:var(--text-secondary);">' +
          'By turning this on, you confirm you have read and agree to our ' +
          '<button class="orbit-legal-link" data-doc="terms" style="background:none;border:none;padding:0;' +
            'font:inherit;color:var(--accent-primary);cursor:pointer;text-decoration:underline;">Terms of Service</button> ' +
          'and ' +
          '<button class="orbit-legal-link" data-doc="privacy" style="background:none;border:none;padding:0;' +
            'font:inherit;color:var(--accent-primary);cursor:pointer;text-decoration:underline;">Privacy Policy</button>.' +
        '</div>' +
        '<div style="padding:18px 24px 20px;display:flex;gap:10px;justify-content:flex-end;">' +
          '<button id="orbit-consent-cancel" style="padding:9px 18px;border-radius:9px;' +
            'border:1px solid var(--border-subtle);background:transparent;color:var(--text-secondary);' +
            'font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap;">Cancel</button>' +
          '<button id="orbit-consent-agree" style="padding:9px 18px;border-radius:9px;border:none;' +
            'background:var(--accent-primary);color:#fff;font-size:13px;font-weight:600;cursor:pointer;' +
            'white-space:nowrap;">I agree \u2014 turn on NAT</button>' +
        '</div>';

      box.querySelectorAll('.orbit-legal-link').forEach(function (b) {
        b.addEventListener('click', function () { openDoc(b.getAttribute('data-doc')); });
      });
      box.querySelector('#orbit-consent-cancel').addEventListener('click', function () { finish(false); });
      box.querySelector('#orbit-consent-agree').addEventListener('click', function () { finish(true); });
      closeOnBackdrop(el);
      document.addEventListener('keydown', onKey);
      icons(box);
    });
  }

  /** Has this user already agreed to the CURRENT versions? */
  function needsConsent(settings) {
    settings = settings || {};
    return settings.natConsentTermsVersion !== TERMS_VERSION ||
           settings.natConsentPrivacyVersion !== PRIVACY_VERSION;
  }

  window.OrbitLegal = {
    DOCS: DOCS,
    TERMS_VERSION: TERMS_VERSION,
    PRIVACY_VERSION: PRIVACY_VERSION,
    openDoc: openDoc,
    openConsent: openConsent,
    needsConsent: needsConsent
  };
})();
