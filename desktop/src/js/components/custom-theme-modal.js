// src/js/components/custom-theme-modal.js

window.CustomThemeModal = {
  isOpen: false,

  init() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'custom-theme-overlay';
    this.overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;';
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', function(e) {
      if (e.target === this) window.CustomThemeModal.close();
    });

    document.addEventListener('keydown', this._escHandler = function(e) {
      if (e.key === 'Escape') window.CustomThemeModal.close();
    });
  },

  // The single list of what a custom theme can change. The defaults and the editor
  // used to each carry their own copy, which is how four tokens the theme defines
  // came to be missing from the editor entirely — and why a custom theme left them
  // at whatever the base theme happened to be.
  COLOR_SECTIONS: [
    { label: 'Backgrounds', keys: ['bg-base','bg-surface','bg-sidebar','bg-hover','bg-active'] },
    { label: 'Text',        keys: ['text-primary','text-secondary','text-muted','text-inverse'] },
    { label: 'Accents',     keys: ['accent-primary','accent-hover','accent-soft'] },
    { label: 'Status',      keys: ['accent-danger','accent-success','accent-warning'] },
    { label: 'Borders',     keys: ['border-subtle','border-strong'] }
  ],

  _allKeys() {
    var out = [];
    this.COLOR_SECTIONS.forEach(function(section) {
      section.keys.forEach(function(k) { out.push(k); });
    });
    return out;
  },

  // Resolve any CSS colour (hex, rgb(), rgba(), hsl(), a named colour) to the
  // #rrggbb that <input type="color"> insists on. Anything unusable becomes black
  // rather than silently showing the wrong swatch.
  _toHex(v) {
    var probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = v;
    if (!probe.style.color) return '#000000';
    var m = probe.style.color.match(/\d+/g);
    if (!m || m.length < 3) return '#000000';
    return '#' + m.slice(0, 3).map(function(n) {
      var h = parseInt(n, 10).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  },

  // True when the browser understands the value. Using the browser as the validator
  // is the only way to accept everything it accepts and reject the rest.
  _isValidColor(v) {
    var probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = v;
    return probe.style.color !== '';
  },

  _getDefaultColors() {
    var style = getComputedStyle(document.documentElement);
    var colors = {};
    this._allKeys().forEach(function(k) {
      colors[k] = style.getPropertyValue('--' + k).trim() || '#000';
    });
    return colors;
  },

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    var settings = window.store.getState().settings;
    this.colors = settings.customThemeColors ? JSON.parse(JSON.stringify(settings.customThemeColors)) : this._getDefaultColors();
    this.render();
    this.overlay.style.display = 'flex';
  },

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay.style.display = 'none';
  },

  render() {
    var self = this;

    var sections = this.COLOR_SECTIONS;

    var pickerHtml = sections.map(function(section) {
      return '<div style="margin-bottom:20px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;letter-spacing:0.5px;">' + section.label + '</div>' +
        section.keys.map(function(key) {
          var val = self.colors[key] || '#000';
          var safeVal = (window.Sanitize && window.Sanitize.escapeHtml) ? window.Sanitize.escapeHtml(val) : val;
          return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
            // A real colour picker, not just a swatch — it cannot produce an invalid
            // value, which the text field cheerfully could.
            '<input type="color" class="custom-swatch-input" data-key="' + key + '" value="' + self._toHex(val) + '" style="width:24px;height:24px;padding:0;border:1px solid var(--border-subtle);border-radius:4px;background:none;cursor:pointer;flex-shrink:0;">' +
            '<label style="font-size:11px;color:var(--text-muted);min-width:80px;flex-shrink:0;font-family:var(--font-mono);">' + key + '</label>' +
            '<input type="text" class="custom-color-input" data-key="' + key + '" value="' + safeVal + '" style="flex:1;padding:5px 8px;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-base);color:var(--text-primary);font-size:11px;font-family:var(--font-mono);outline:none;transition:border-color 0.15s;">' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('');

    // Build preview CSS variable string
    var previewVars = Object.keys(this.colors).map(function(key) {
      return '--' + key + ': ' + self.colors[key] + ';';
    }).join('');

    this.overlay.innerHTML =
      '<div style="width:960px;height:660px;display:flex;background:var(--bg-surface);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-xl);border:1px solid var(--border-subtle);">' +
        // Left: Color pickers
        '<div style="width:380px;padding:24px;overflow-y:auto;border-right:1px solid var(--border-subtle);">' +
          '<h2 style="font-family:var(--font-display);font-size:20px;margin:0 0 8px;color:var(--text-primary);">Custom Colors</h2>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:20px;line-height:1.6;">Type hex, rgb, or rgba values. Changes preview instantly.</div>' +
          pickerHtml +
          '<div style="display:flex;gap:10px;margin-top:24px;padding-top:20px;border-top:1px solid var(--border-subtle);">' +
            '<button id="custom-theme-apply" style="flex:1;padding:12px;border-radius:8px;border:none;background:var(--accent-primary);color:#fff;font-weight:600;cursor:pointer;font-size:13px;">Apply</button>' +
            '<button id="custom-theme-reset" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);cursor:pointer;font-size:13px;">Reset</button>' +
            '<button id="custom-theme-cancel" style="flex:1;padding:12px;border-radius:8px;border:1px solid var(--border-subtle);background:transparent;color:var(--text-primary);cursor:pointer;font-size:13px;">Cancel</button>' +
          '</div>' +
        '</div>' +
        // Right: Preview
        '<div style="flex:1;display:flex;flex-direction:column;background:var(--bg-base);' + previewVars + '" id="custom-theme-preview">' +
          '<div style="padding:20px 24px;border-bottom:1px solid var(--border-subtle);">' +
            '<h3 style="font-family:var(--font-display);font-size:14px;margin:0;color:var(--text-secondary);font-weight:500;">Preview</h3>' +
          '</div>' +
          '<div style="flex:1;display:flex;overflow:hidden;">' +
            // Sidebar mock
            '<div style="width:44px;background:var(--bg-sidebar);display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:8px;flex-shrink:0;">' +
              '<div style="width:24px;height:24px;border-radius:6px;background:var(--accent-primary);"></div>' +
              '<div style="width:20px;height:20px;border-radius:4px;background:var(--bg-hover);"></div>' +
              '<div style="width:20px;height:20px;border-radius:4px;background:var(--bg-hover);"></div>' +
            '</div>' +
            // Main area mock
            '<div style="flex:1;display:flex;flex-direction:column;padding:20px 24px;gap:14px;">' +
              '<div style="display:flex;align-items:flex-start;gap:10px;">' +
                '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-primary);flex-shrink:0;"></div>' +
                '<div style="flex:1;">' +
                  '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">Friend <span style="color:var(--text-muted);font-size:10px;">12:34 PM</span></div>' +
                  '<div style="padding:10px 14px;background:var(--bg-surface);border-radius:12px;border:1px solid var(--border-subtle);">' +
                    '<div style="font-size:13px;color:var(--text-primary);">Hey! How are you?</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div style="display:flex;align-items:flex-start;gap:10px;flex-direction:row-reverse;">' +
                '<div style="width:28px;height:28px;border-radius:50%;background:var(--accent-soft);flex-shrink:0;"></div>' +
                '<div style="flex:1;">' +
                  '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;text-align:right;">You <span style="color:var(--text-muted);font-size:10px;">12:35 PM</span></div>' +
                  '<div style="padding:10px 14px;background:var(--accent-primary);color:#fff;border-radius:12px;">' +
                    '<div style="font-size:13px;">I\'m doing great!</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border-subtle);">' +
                '<div style="display:flex;gap:8px;">' +
                  '<div style="flex:1;height:32px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-surface);"></div>' +
                  '<div style="width:60px;height:32px;border-radius:8px;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;">' +
                    '<span style="font-size:12px;color:#fff;font-weight:600;">Send</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div style="padding:10px 24px;border-top:1px solid var(--border-subtle);display:flex;gap:16px;font-size:11px;">' +
            '<span style="color:var(--text-primary);">Primary</span>' +
            '<span style="color:var(--text-secondary);">Secondary</span>' +
            '<span style="color:var(--text-muted);">Muted</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    this._bindEvents();
  },

  _bindEvents() {
    var self = this;

    // The picker drives the text field and the preview.
    this.overlay.querySelectorAll('.custom-swatch-input').forEach(function(picker) {
      picker.addEventListener('input', function(e) {
        var key = e.target.dataset.key;
        self.colors[key] = e.target.value;
        var text = self.overlay.querySelector('.custom-color-input[data-key="' + key + '"]');
        if (text) { text.value = e.target.value; text.style.borderColor = ''; }
        self._applyPreview();
      });
    });

    // The text field drives the picker and the preview — but only for a value the
    // browser accepts. An invalid custom property is invalid at computed-value time,
    // so the whole token is lost until it is corrected; mark the field instead of
    // applying a typo.
    this.overlay.querySelectorAll('.custom-color-input').forEach(function(input) {
      input.addEventListener('input', function(e) {
        var key = e.target.dataset.key;
        var val = e.target.value.trim();
        if (!self._isValidColor(val)) {
          e.target.style.borderColor = 'var(--accent-danger)';
          return;
        }
        e.target.style.borderColor = '';
        self.colors[key] = val;
        var picker = self.overlay.querySelector('.custom-swatch-input[data-key="' + key + '"]');
        if (picker) picker.value = self._toHex(val);
        self._applyPreview();
      });
    });

    this.overlay.querySelector('#custom-theme-apply').addEventListener('click', function() {
      var settings = window.store.getState().settings;
      var newSettings = Object.assign({}, settings);
      newSettings.customThemeColors = JSON.parse(JSON.stringify(self.colors));
      newSettings.theme = 'custom';
      window.store.setState({ settings: newSettings });
      window.Storage.set('settings', newSettings);
      if (window.App && window.App.applySettings) window.App.applySettings(newSettings);

      // This path does NOT go through updateSettings, so it needs the broadcast hook itself.
      // Without it a theme built here never reached the phone — the colours are the whole point
      // of a custom theme, and they were the one thing that did not travel.
      if (window.OrbitSettingsSync && window.OrbitSettingsSync.worthSending(settings, newSettings)) {
        window.store.broadcastSettings(newSettings);
      }
      self.close();
    });

    this.overlay.querySelector('#custom-theme-reset').addEventListener('click', function() {
      self.colors = self._getDefaultColors();
      self.render();
    });

    this.overlay.querySelector('#custom-theme-cancel').addEventListener('click', function() {
      self.close();
    });
  },

  _applyPreview() {
    var preview = this.overlay.querySelector('#custom-theme-preview');
    if (!preview) return;
    var self = this;
    Object.keys(this.colors).forEach(function(key) {
      preview.style.setProperty('--' + key, self.colors[key]);
    });
  }
};
