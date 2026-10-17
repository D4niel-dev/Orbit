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

  // The four shapes.
  //
  // ⚠ THE MOON WAS WRONG FIRST TIME, AND IT WAS THE THIN CRESCENT THAT DID IT.
  // The original path was two arcs between two arbitrary points, which came out
  // as a narrow sliver — at 10px it read as a blob with a nick in it, not a moon.
  // Dan: "it doesn't look like a moon right now". Redrawn the way Discord draws
  // theirs: a full disc with a circular BITE taken out of the upper-left, so the
  // crescent is thick enough to survive the badge size.
  //
  // The crescent is outer-minus-bite. The two horns are where those circles
  // cross; solved once here rather than computed at runtime:
  //     outer  centre (8, 8)     r 7     — the 16-unit viewBox
  //     bite   centre (5.2, 4.8) r 5.6
  //     horns  (9.45, 1.15) and (1.02, 8.53)
  // A <mask> would say this more directly, but it needs a unique id per instance
  // and these glyphs render many times on one page — one stray duplicate id and
  // the masks cross-wire silently.
  var SHAPES = {
    online: '<circle cx="8" cy="8" r="7" fill="currentColor"/>',
    away: '<path fill="currentColor" d="M9.45 1.15A7 7 0 1 1 1.02 8.53 5.6 5.6 0 0 0 9.45 1.15Z"/>',
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
      // ⚠ THE SIZE IS IN THE INLINE STYLE AS WELL AS THE ATTRIBUTES, ON PURPOSE.
      // `width`/`height` on an <svg> are presentation attributes, and ANY
      // stylesheet rule outranks a presentation attribute — so an ancestor
      // selector written for icon fonts silently resizes the glyph. There are a
      // dozen `.x svg { width: … }` rules in the redesign, and one of them
      // (`.icon-btn svg`) put this badge at 22px against 15px everywhere else.
      // An inline style wins that fight; the attributes stay so the markup still
      // reads as an SVG with a declared size.
      return '<svg class="orbit-presence-glyph" width="' + px + '" height="' + px + '" ' +
        'viewBox="0 0 16 16" aria-hidden="true" focusable="false" ' +
        'style="display:block;width:' + px + 'px;height:' + px + 'px;color:' + COLORS[s] + ';">' +
        shapeFor(s) + '</svg>';
    },

    /**
     * The glyph as a badge sitting on the corner of an avatar: absolutely
     * positioned, with a ring in `ringColor` so it reads against whatever it
     * overlaps. `size` is the glyph; the ring adds 1.5px on each side.
     *
     * ⚠ THE RING IS THIN AND THE GLYPH IS BIG, ON PURPOSE. The ring exists to
     * separate the badge from the avatar, but it is the PANEL colour
     * (`--bg-surface` #1C1C1E) sitting on an avatar that is `--bg-hover`
     * (#28282B) — so a fat ring is a dark halo, and a crescent's bite merges
     * into it and the moon reads as a blob. Dan: "the bg color behind it makes
     * it harder to see it". A thinner ring with a larger glyph puts the shape
     * back in charge of the silhouette.
     *
     * ⚠ It carries the existing `status-indicator` class on purpose. That is what
     * the positioning, the online pulse (animations.css) and the reduced-motion
     * opt-out (redesign.css) are all written against — so the badge inherits
     * them instead of adding a fourth name for the same idea. The class no
     * longer paints anything itself; the glyph is the paint.
     */
    badge: function (status, size, ringColor) {
      var s = norm(status);
      var px = size || 12;
      var ring = ringColor || 'var(--bg-surface)';
      return '<span class="status-indicator orbit-presence-badge ' + s + '" title="' + esc(LABELS[s]) + '" ' +
        'style="position:absolute;bottom:-1px;right:-1px;display:flex;align-items:center;' +
        'justify-content:center;border-radius:50%;background:' + ring + ';padding:1.5px;' +
        'box-sizing:content-box;pointer-events:none;">' + this.glyph(s, px) + '</span>';
    }
  };
})();
