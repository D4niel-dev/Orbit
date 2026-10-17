// E2E: the presence glyphs.
//
// ⚠ THE BUG THIS EXISTS FOR IS A SHAPE, AND SHAPES ARE THE ONE THING A CLASS OR
// A TOKEN CHECK CANNOT SEE. The away glyph shipped as two arcs between two
// arbitrary points — a narrow sliver that, at badge size, read as a blob with a
// nick in it rather than a moon. Nothing was broken: it was the right colour,
// the right size, in the right place, and it passed every other test. Dan:
// "it doesn't look like a moon right now".
//
// So this measures the INK, not the markup. Each glyph is rasterised and its
// filled fraction of the box is compared against the others. A crescent that has
// collapsed back into a sliver drops out of the range; a glyph that has
// accidentally become a plain disc rises above it.
//
// The numbers are wide on purpose — this is a shape guard, not a pixel-exact
// one. What it catches is the failure that actually happened.
const { test, expect } = require('@playwright/test');
const { tmpUserDataDir, launchApp, seedNewUI } = require('./helpers');

// Rasterise each glyph's markup and return the fraction of pixels that got any
// ink. Only ALPHA is measured, so it does not matter that the CSS custom
// properties behind `color` do not resolve in a detached SVG.
const inkFractions = (page) =>
  page.evaluate(async () => {
    const out = {};
    const px = 64;
    for (const status of ['online', 'away', 'dnd', 'invisible']) {
      // ⚠ The xmlns has to be added here. Inline SVG in an HTML document gets the
      // namespace from the HTML parser, so the glyph markup correctly does not
      // carry one — but a standalone SVG loaded as an <img> is parsed as XML and
      // is rejected without it.
      const markup = window.OrbitPresence.glyph(status, px)
        .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = c.height = px;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, px, px);
      URL.revokeObjectURL(url);
      const d = ctx.getImageData(0, 0, px, px).data;
      let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 32) ink++;
      out[status] = +(ink / (px * px)).toFixed(4);
    }
    return out;
  });

test.describe('presence glyphs', () => {
  test('each state is its own shape, and the moon has meat on it', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('presence'), [], { keepBootState: true });
    try {
      const f = await inkFractions(page);

      // Measured, as a fraction of the 64px box:
      //     online     0.6104   a filled disc          (pi*7^2/16^2 = 0.601)
      //     away       0.3376   a crescent             — the shape that broke
      //     dnd        0.5552   a disc with a bar cut out
      //     invisible  0.3767   a ring
      // Four states, four amounts of ink — which is the point: a colour alone
      // could not say four things.
      expect(f.online).toBeGreaterThan(0.5);            // a filled disc
      expect(f.invisible).toBeLessThan(f.online - 0.1); // a ring, so much less ink
      expect(f.dnd).toBeGreaterThan(0.45);              // a disc with a bar, not a ring
      expect(f.dnd).toBeLessThan(f.online);             // ...and the bar took something

      // ⚠ THE REGRESSION GUARD. Measured 0.3376, so both bounds carry >0.11 of
      // slack — wide enough not to be flaky, narrow enough that the sliver this
      // replaced (and a plain disc) would both fail.
      expect(f.away, 'the away glyph must be a crescent, not a sliver or a disc').toBeGreaterThan(0.22);
      expect(f.away).toBeLessThan(0.5);

      // Every state must be visually distinguishable from every other.
      const vals = Object.values(f);
      expect(new Set(vals).size, 'two states rasterise to the same shape: ' + JSON.stringify(f)).toBe(4);
    } finally {
      await app.close();
    }
  });

  test('a badge carries a glyph, and the class that drives its position and pulse', async () => {
    const { app, page } = await launchApp(tmpUserDataDir('presence-badge'), [], { keepBootState: true });
    try {
      const r = await page.evaluate(() => {
        const host = document.createElement('div');
        host.innerHTML = window.OrbitPresence.badge('away');
        document.body.appendChild(host);
        const b = host.querySelector('.orbit-presence-badge');
        const out = {
          // ⚠ `status-indicator` is what the positioning, the online pulse in
          // animations.css and the reduced-motion opt-out in redesign.css are all
          // keyed off. A badge that lost the class would still look right and
          // silently stop pulsing.
          hasPositionClass: !!b && b.classList.contains('status-indicator'),
          hasStatusClass: !!b && b.classList.contains('away'),
          glyphs: b ? b.querySelectorAll('svg.orbit-presence-glyph').length : 0,
          // The glyph must be most of the badge, or the ring swamps the shape.
          glyphPx: b ? b.querySelector('svg').getAttribute('width') : null,
          badgePx: b ? Math.round(b.getBoundingClientRect().width) : null
        };
        host.remove();
        return out;
      });
      expect(r.hasPositionClass).toBe(true);
      expect(r.hasStatusClass).toBe(true);
      expect(r.glyphs).toBe(1);
      // glyph + 1.5px ring on each side
      expect(r.badgePx).toBe(+r.glyphPx + 3);
    } finally {
      await app.close();
    }
  });

  // ⚠⚠ THE TEST ABOVE PASSES WHILE THE APP IS WRONG, AND THAT IS THE WHOLE POINT
  // OF THIS ONE. It renders the badge into a bare <div> on `document.body`, where
  // no ancestor rule can reach it — and the bug that shipped WAS an ancestor
  // rule. The profile button at the bottom of the icon rail is itself an
  // `.icon-btn`, and `.icon-btn svg { width: 19px }`, written for the rail's
  // lucide icons, also matched the presence glyph inside it. So the redesign's
  // profile badge rendered 22px against 15px for every other badge, and Dan saw
  // it: "the status icons in the new UI look way larger than the classic UI".
  //
  // A component measured out of context cannot see that. So this measures the
  // real badge, in the real rail, in BOTH looks — and asserts the invariant that
  // actually matters: every presence badge in the app is the same size. It is
  // also the `:not(.orbit-presence-glyph)` guard on that rule.
  test('every presence badge in the app is the same size, rail profile included', async () => {
    const sizesIn = async (newUI) => {
      const dir = seedNewUI(tmpUserDataDir('presence-rail-' + (newUI ? 'new' : 'old')), newUI);
      // ⚠ NOT `keepBootState` — the chat list and header badges are what this
      // compares against, and an empty comparison would be a vacuous green.
      const { app, page } = await launchApp(dir);
      try {
        return await page.evaluate(() => {
          const w = (el) => Math.round(el.getBoundingClientRect().width);
          const all = [...document.querySelectorAll('.orbit-presence-badge')];
          const rail = all.find((el) => el.closest('#btn-profile'));
          const rest = all.filter((el) => !el.closest('#btn-profile'));
          return {
            layerOn: !document.getElementById('redesign-css').disabled,
            rail: rail ? w(rail) : null,
            railGlyph: rail ? Math.round(rail.querySelector('svg').getBoundingClientRect().width) : null,
            others: rest.map(w)
          };
        });
      } finally {
        await app.close();
      }
    };

    const original = await sizesIn(false);
    const redesign = await sizesIn(true);

    // Seed the look each time; if either failed to take, the comparison is moot.
    expect(original.layerOn, 'the first launch must be the original UI').toBe(false);
    expect(redesign.layerOn, 'the second launch must be the redesign').toBe(true);

    for (const [name, m] of [['original', original], ['redesign', redesign]]) {
      expect(m.rail, name + ': the rail profile button must carry a presence badge').not.toBeNull();
      expect(m.others.length, name + ': need other badges to compare against').toBeGreaterThan(0);
      // Every badge the same, and the glyph most of the badge.
      expect([...new Set([m.rail, ...m.others])], name + ': badges differ in size').toHaveLength(1);
      expect(m.railGlyph, name + ': glyph should fill the badge minus its ring').toBe(m.rail - 3);
    }

    // And the two looks agree — the "new UI looks bigger" complaint.
    expect(redesign.rail, 'the redesign badge must match the original UI').toBe(original.rail);
  });
});
