// src/js/components/emoji-picker.js

window.EmojiPicker = {
  isOpen: false,
  targetInput: null,

  init() {
    this.container = document.createElement('div');
    this.container.id = 'emoji-picker-container';
    // Only behaviour here. Position, radius, shadow and border live in components.css:
    // they were inline, which meant the stylesheet could not change them — an inline
    // border-radius quietly beat the themed one, and the panel kept the library-era
    // 8px corners. Anything that is a look belongs where the theme can reach it.
    this.container.style.display = 'none';

    // ⚠ THE <emoji-picker> ELEMENT IS NOT BUILT HERE ANY MORE. Creating it makes
    // the library fetch its whole emoji dataset over the network — measured at
    // boot as `https://cdn.jsdelivr.net/npm/emoji-picker-element-data@^1/en/
    // emojibase/data.json`. That is a start-up cost and a hard dependency on the
    // internet for an app whose whole premise is that it works without one, and
    // it is paid on every launch for a picker most launches never open.
    //
    // The element is created on first open instead. `_fitToScrollbar` already
    // returns early when the picker is missing, so nothing before the first open
    // has to care.
    document.body.appendChild(this.container);
    this._wireDocument();
  },

  /** Build the picker once, the first time it is actually shown. */
  _ensurePicker() {
    if (this._picker) return this._picker;
    var picker = document.createElement('emoji-picker');
    this.container.appendChild(picker);
    this._picker = picker;
    this._wirePicker(picker);
    return picker;
  },

  /**
   * How much space this platform's scrollbar takes.
   *
   * Zero where scrollbars overlay the content — macOS, and Chrome's overlay setting.
   * Around 17px on Windows, where they do not.
   */
  _scrollbarWidth() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll;';
    document.body.appendChild(probe);
    var width = probe.offsetWidth - probe.clientWidth;
    document.body.removeChild(probe);
    return width > 0 ? width : 0;
  },

  /**
   * Make room for the scrollbar.
   *
   * The picker sizes its grid to the full width of the element and then scrolls it.
   * Where the scrollbar overlays the content that is free; on Windows it is not, and
   * the grid runs underneath it — which is why the desktop picker's last column was
   * half-hidden behind the scrollbar.
   *
   * The first attempt at this looked for an element overflowing its box inside the
   * library's shadow DOM. That was the wrong symptom: nothing overflows, the grid is
   * simply drawn under the scrollbar. It also named a class (`.scroll`) that this
   * version of emoji-picker-element does not have, so it silently did nothing. This
   * version measures the platform instead of inspecting the library.
   */
  _fitToScrollbar() {
    var picker = this.container && this.container.querySelector('emoji-picker');
    if (!picker) return;
    // Measure at the natural width first, so repeated calls cannot ratchet the
    // container wider and wider.
    this.container.style.width = '';
    picker.style.width = '';
    var gutter = this._scrollbarWidth();
    if (!gutter) return;
    var natural = picker.getBoundingClientRect().width;
    if (natural <= 0) return;
    // The width has to go on the PICKER, not just the container: the element has its
    // own intrinsic width, so a wider container only leaves empty space beside it and
    // the grid keeps running under the element's own scrollbar. Widening the element
    // gives the grid its full width back and puts the scrollbar in the extra gutter.
    var total = Math.ceil(natural + gutter);
    picker.style.width = total + 'px';
    this.container.style.width = total + 'px';
  },

  _wireDocument() {
    // Close on outside click. On the document, not the picker, so it is wired
    // once at init rather than waiting for the element to exist.
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container.contains(e.target) && !e.target.closest('#btn-emoji')) {
        this.close();
      }
    });
  },

  _wirePicker(picker) {
    // Remember the chosen skin tone, the way mobile does. The value MUST be validated
    // on both sides: the picker renders whatever it is handed in its tone button, and
    // a `skin-tone-change` event with no detail stored the literal string "undefined"
    // once — which then painted across the search row. A tone is a non-ASCII grapheme,
    // so anything ASCII is rejected without enumerating the good values.
    const isValidTone = (v) => typeof v === 'string' && v.length > 0 && v.length <= 12 && !/[\x00-\x7F]/.test(v);
    try {
      const saved = localStorage.getItem('orbit_emoji_skin_tone');
      if (saved) {
        if (isValidTone(saved)) picker.skinToneEmoji = saved;
        else localStorage.removeItem('orbit_emoji_skin_tone');   // self-heal
      }
    } catch (e) { /* storage blocked — the default tone stands */ }
    picker.addEventListener('skin-tone-change', (e) => {
      try {
        const tone = e && e.detail ? e.detail.skinToneEmoji : null;
        if (isValidTone(tone)) localStorage.setItem('orbit_emoji_skin_tone', tone);
      } catch (e2) {}
    });

    picker.addEventListener('emoji-click', (e) => {
      if (this.targetInput) {
        this.targetInput.value += e.detail.unicode;
        this.targetInput.focus();
      }
    });
  },

  toggle(targetInput) {
    this.targetInput = targetInput;
    if (this.isOpen) {
      this.close();
    } else {
      var picker = this._ensurePicker();
      this.open();
      // Sync theme
      const theme = document.documentElement.getAttribute('data-theme') || 'dark';
      picker.classList.remove('light', 'dark');
      picker.classList.add(theme);
    }
  },

  open() {
    this._ensurePicker();
    this.container.style.display = 'block';
    this.isOpen = true;
    var self = this;
    // Once now, and once after the picker has laid out its grid — the shadow root is
    // not populated synchronously on first open.
    this._fitToScrollbar();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function() { self._fitToScrollbar(); });
    }
    setTimeout(function() { self._fitToScrollbar(); }, 150);
  },

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
  }
};
