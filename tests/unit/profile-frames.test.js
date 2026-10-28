// The profile-frame list must match the files that actually exist, on BOTH
// platforms.
//
// This is the guard for a real drift: the desktop enumerated 1..55 and the mobile
// stopped at 42, so the phone silently offered twelve fewer frames than it had.
// Nothing errored — a picker missing its last entries looks exactly like a picker
// that ends there — and it took Dan asking "it has less than desktop" to find it.
//
// A pure filesystem check, so it runs anywhere with no browser.
const fs = require('fs');
const path = require('path');

global.window = global;
require(path.join(__dirname, '..', '..', 'shared', 'ui', 'profile-frames.js'));
const PF = global.ProfileFrames;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}

const ROOT = path.join(__dirname, '..', '..');

console.log('\n== the list ==');
check('ProfileFrames is defined', !!PF, typeof PF);
check('COUNT is a positive integer', PF && Number.isInteger(PF.COUNT) && PF.COUNT > 0, PF && PF.COUNT);
check('numbers runs 1..COUNT with no gaps',
  PF && PF.numbers.length === PF.COUNT && PF.numbers[0] === 1 && PF.numbers[PF.COUNT - 1] === PF.COUNT,
  PF && PF.numbers.length);

console.log('\n== frame 0 is the "None" option, not a frame ==');
check('0 is not a frame', PF && PF.isFrame(0) === false);
check('0 has no path', PF && PF.path(0) === null);
check('out of range is not a frame', PF && PF.isFrame(PF.COUNT + 1) === false);
check('a real frame is a frame', PF && PF.isFrame(1) === true && PF.isFrame(PF.COUNT) === true);

// Both platforms ship their own copy of icons/frames/ and they must agree.
const PLATFORMS = [
  { name: 'mobile', dir: path.join(ROOT, 'mobile', 'src', 'icons', 'frames') },
  { name: 'desktop', dir: path.join(ROOT, 'desktop', 'src', 'icons', 'frames') }
];

for (const p of PLATFORMS) {
  console.log('\n== ' + p.name + ' has every frame the list claims ==');
  if (!fs.existsSync(p.dir)) { check(p.name + ': icons/frames exists', false, p.dir); continue; }
  const files = new Set(fs.readdirSync(p.dir));
  const missing = PF.numbers.filter((n) => !files.has('pfp_frame_' + n + '.png'));
  check(p.name + ': every number has a file', missing.length === 0, missing.slice(0, 8));

  // And nothing is shipped that the list does not know about — an orphan file is
  // a frame nobody can choose.
  const orphans = [...files]
    .map((f) => { const m = /^pfp_frame_(\d+)\.png$/.exec(f); return m ? parseInt(m[1], 10) : null; })
    .filter((n) => n !== null && !PF.numbers.includes(n));
  check(p.name + ': no frame file is left out of the list', orphans.length === 0, orphans.slice(0, 8));
}

console.log('\n== both platforms offer the same set ==');
const counts = PLATFORMS.map((p) => {
  try {
    return fs.readdirSync(p.dir).filter((f) => /^pfp_frame_\d+\.png$/.test(f)).length;
  } catch (e) { return -1; }
});
check('mobile and desktop have the same number of frames', counts[0] === counts[1], counts);
check('and it equals the list', counts.every((c) => c === PF.COUNT), { counts: counts, list: PF.COUNT });

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
