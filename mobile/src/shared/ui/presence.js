// shared/ui/presence.js
//
// One presence indicator, drawn the same way everywhere.
//
// ⚠ THE PALETTE WAS ALREADY SHARED; THE SHAPE WAS NOT, AND A COLOUR CANNOT SAY
// FOUR THINGS. Presence was a filled dot tinted green / orange / red / grey, at
// thirteen call sites across two platforms, each with its own size and its own
// border. Two of them shared a hue on purpose — `dnd` and `busy` are both
// `--presence-busy`, `invisible` and `offline` are both `--presence-offline` —
// so red already meant two different things and grey meant two more.
//
// Dan's spec, which this implements literally:
//     Online             a FILLED green circle
//     Away / Idle        a FILLED orange moon
//     Do Not Disturb     a FILLED red circle with a line straight through it
//     Invisible/Offline  a grey RING — a circle with a hole in the middle,
//                        "not too transparent, but in full colours"
//
// ⚠ The shape carries the meaning and the colour reinforces it, so the states
// stay readable when the theme moves the hues (nord's green is not dark's green)
// and for anyone who cannot separate the hues at all.
//
// Every glyph is one inline <svg> at a 16-unit viewBox, so it is crisp at any
// size and needs no icon font and no `createIcons` pass — which matters, because
// a re-render that forgets `createIcons` is a silent way to lose every icon.
//
// Shared by both platforms like the other modules in shared/ui/: edit this file,
// then run `npm run shared:sync` in mobile/.

(function () {
  'use strict';

  // The token names live in styles/variables.css on both platforms. `busy` is an
  // alias of `dnd` and `invisible` of `offline` — one visual state, two labels.
  var COLORS = {
    online: 'var(--presence-online)',
    away: 'var(--presence-away)',
    dnd: 'var(--presence-busy)',
    busy: 'var(--presence-busy)',
    invisible: 'var(--presence-offline)',
    offline: 'var(--presence-offline)'
  };

  var LABELS = {
    online: 'Online',
    away: 'Away',
    dnd: 'Do Not Disturb',
    busy: 'Busy',
    invisible: 'Invisible',
    offline: 'Offline'
  };

  function norm(status) {
    var s = String(status == null ? '' : status).toLowerCase();
    return COLORS[s] ? s : 'offline';
  }

  // The four shapes. `fill-rule="evenodd"` on the dnd path is what makes the bar
  // a real hole rather than a second colour — so the glyph works over an avatar,
  // a panel or a photo without anyone having to know what is behind it.
  var SHAPES = {
    online: '<circle cx="8" cy="8" r="7" fill="currentColor"/>',
    away: '<path fill="currentColor" d="M11.6 10.1A5.4 5.4 0 0 1 5.9 4.4 5.5 5.5 0 1 0 11.6 10.1Z"/>',
    dnd: '<path fill="currentColor" fill-rule="evenodd" d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm-3.6 6h7.2v2H4.4Z"/>',
    ring: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="2.6"/>'
  };

  function shapeFor(status) {
    if (status === 'online') return SHAPES.online;
    if (status === 'away') return SHAPES.away;
    if (status === 'dnd' || status === 'busy') return SHAPES.dnd;
    return SHAPES.ring;
  }

  function esc(s) {
    if (window.Sanitize && window.Sanitize.escapeHtml) return window.Sanitize.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.OrbitPresence = {
    color: function (status) { return COLORS[norm(status)]; },
    label: function (status) { return LABELS[norm(status)]; },

    /**
     * Just the glyph — an inline <svg> sized `size` px, drawn in the status
     * colour, with a transparent background. Put it wherever a dot used to go.
     */
    glyph: function (status, size) {
      var s = norm(status);
      var px = size || 12;
      return '<svg class="orbit-presence-glyph" width="' + px + '" height="' + px + '" ' +
        'viewBox="0 0 16 16" aria-hidden="true" focusable="false" ' +
        'style="display:block;color:' + COLORS[s] + ';">' + shapeFor(s) + '</svg>';
    },

    /**
     * The glyph as a badge sitting on the corner of an avatar: absolutely
     * positioned, with a ring in `ringColor` so it reads against whatever it
     * overlaps. `size` is the glyph; the ring adds 2px on each side.
     *
     * ⚠ It carries the existing `status-indicator` class on purpose. That is what
     * the positioning, the online pulse (animations.css) and the reduced-motion
     * opt-out (redesign.css) are all written against — so the badge inherits
     * them instead of adding a fourth name for the same idea. The class no
     * longer paints anything itself; the glyph is the paint.
     */
    badge: function (status, size, ringColor) {
      var s = norm(status);
      var px = size || 10;
      var ring = ringColor || 'var(--bg-surface)';
      return '<span class="status-indicator orbit-presence-badge ' + s + '" title="' + esc(LABELS[s]) + '" ' +
        'style="position:absolute;bottom:-1px;right:-1px;display:flex;align-items:center;' +
        'justify-content:center;border-radius:50%;background:' + ring + ';padding:2px;' +
        'box-sizing:content-box;pointer-events:none;">' + this.glyph(s, px) + '</span>';
    }
  };
})();
