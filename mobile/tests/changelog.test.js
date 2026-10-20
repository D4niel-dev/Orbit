// "What's New" must not fall behind the app version.
//
// This is a plain Node check — no browser, no server. It exists because the
// hand-maintained What's New lists DID fall behind: the mobile's stopped at
// 0.7.5-beta while the app was on 0.8.1-beta, so anyone who updated opened
// What's New and saw nothing newer than 0.7.5. Nothing failed; there was simply
// no check that the newest entry is the version being shipped.
//
// There are TWO hand-maintained lists, in two files, on two platforms:
//
//   mobile/src/js/app.js               showChangelog()  -> vBlock('…', 'Latest', …)
//   desktop/src/js/components/changelog.js              -> versionBlock('…', 'Latest', …)
//
// Different function names, so a grep for one finds nothing in the other. Both
// are checked here, because updating one and forgetting the other is exactly the
// shape of the bug.
//
// A release is not done until the newest block matches the version in the
// manifests. That is what this asserts.
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else {
    results.fail.push(label);
    console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
  }
}

function versionFromPkg(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8')).version;
}

/** The version of the FIRST block tagged 'Latest' — i.e. what the user sees on top. */
function newestBlock(file, fnName) {
  const src = fs.readFileSync(file, 'utf8');
  // ⚠ 'Latest' OR 'Stable'. A release can be both the newest one and a stable one,
  // and the tag is a single string — so v0.9.0, the first stable release since
  // v0.8.0, wears 'Stable' while it is still the top block. Requiring 'Latest'
  // exactly would have forced it to say 'Latest' and left the CHANGELOG's own
  // "Stable Release" marker unrepresented in both lists.
  const re = new RegExp(fnName + "\\(\\s*'([0-9][^']*)'\\s*,\\s*'(?:Latest|Stable)'");
  const m = src.match(re);
  if (m) return m[1];
  // No tag at all is its own bug — the tag is what the UI shows.
  const any = src.match(new RegExp(fnName + "\\(\\s*'([0-9][^']*)'"));
  return any ? { noLatestTag: any[1] } : null;
}

console.log('\n== the mobile What\'s New (app.js) ==');
const appVer = versionFromPkg(path.join(REPO, 'mobile/package.json'));
const appBlock = newestBlock(path.join(REPO, 'mobile/src/js/app.js'), 'vBlock');
console.log('  app version: ' + appVer + '   newest block: ' + JSON.stringify(appBlock));
check('the newest block carries a Latest or Stable tag', appBlock && typeof appBlock === 'string',
  appBlock && appBlock.noLatestTag ? 'no Latest/Stable tag — top entry is ' + appBlock.noLatestTag : appBlock);
check('the newest block IS the version in mobile/package.json', appBlock === appVer,
  { block: appBlock, package: appVer });

console.log('\n== the desktop What\'s New (changelog.js) ==');
const deskVer = versionFromPkg(path.join(REPO, 'desktop/package.json'));
const deskBlock = newestBlock(path.join(REPO, 'desktop/src/js/components/changelog.js'), 'versionBlock');
console.log('  app version: ' + deskVer + '   newest block: ' + JSON.stringify(deskBlock));
check('the newest block carries the Latest tag', deskBlock && typeof deskBlock === 'string',
  deskBlock && deskBlock.noLatestTag ? 'no Latest tag — top entry is ' + deskBlock.noLatestTag : deskBlock);
check('the newest block IS the version in desktop/package.json', deskBlock === deskVer,
  { block: deskBlock, package: deskVer });

console.log('\n== the two platforms agree ==');
check('both platforms show the same newest version', appBlock === deskBlock,
  { mobile: appBlock, desktop: deskBlock });

// The CHANGELOG is where a version is DECLARED stable ("## v0.5.0-beta — **Stable
// Release**"). Both What's New lists have to say so too, and they had drifted:
// 0.8.0 and 0.6.0 carried no tag at all, and 0.2.7 was missing from both lists
// entirely despite being a stable release.
console.log('\n== every stable release is tagged Stable in the lists ==');
const md = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
const stableVersions = [...md.matchAll(/^##\s+v([0-9][^\s]*)\s+—\s+\*\*Stable/gm)].map(m => m[1]);
console.log('  CHANGELOG marks stable: ' + stableVersions.join(', '));
check('the CHANGELOG declares at least one stable release', stableVersions.length > 0, stableVersions.length);

for (const [label, file, fn] of [
  ['mobile', 'mobile/src/js/app.js', 'vBlock'],
  ['desktop', 'desktop/src/js/components/changelog.js', 'versionBlock']
]) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const tags = {};
  for (const m of src.matchAll(new RegExp(fn + "\\(\\s*'([0-9][^']*)'\\s*,\\s*'([^']*)'", 'g'))) {
    tags[m[1]] = m[2];
  }
  const missing = stableVersions.filter(v => !/stable/i.test(tags[v] || ''));
  check(label + ': every stable release carries a Stable tag', missing.length === 0,
    missing.map(v => v + ' -> ' + JSON.stringify(tags[v] === undefined ? '(not in the list)' : tags[v])));
  // A version that is not stable must NOT wear the tag.
  const wrong = Object.keys(tags).filter(v => /stable/i.test(tags[v]) && stableVersions.indexOf(v) === -1);
  check(label + ': no non-stable release wears a Stable tag', wrong.length === 0,
    wrong.map(v => v + ' -> ' + JSON.stringify(tags[v])));
}

// ⚠ The list is ONE long expression: `vBlock(a) + vBlock(b) + vBlock(c)`.
// A COMMA where a `+` belongs turns it into a comma-expression, JavaScript keeps
// only the LAST operand, and the panel renders ONE version while every other
// check still passes — "it rendered a version heading" was true throughout.
//
// This shipped in v0.8.5 and Dan found it on a phone: the other 57 releases were
// simply not there. Caught by counting, not by looking.
console.log('\n== every block is joined with +, not a comma ==');
for (const [label, file, fn] of [
  ['mobile', 'mobile/src/js/app.js', 'vBlock'],
  ['desktop', 'desktop/src/js/components/changelog.js', 'versionBlock']
]) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const blocks = (src.match(new RegExp('^\\s*' + fn + "\\(\\s*'", 'gm')) || []).length;
  // Each block is closed by `])` and, unless it is the last, joined by `+`.
  const joins = (src.match(/^\s*\]\) \+$/gm) || []).length;
  check(label + ': every block is joined with + (found ' + blocks + ' blocks, ' + joins + ' joins)',
    blocks === joins, { blocks: blocks, joins: joins });

  // And no block is terminated by a comma, which is the exact bug.
  const commaEnded = (src.match(/^\s*\]\),\s*$/gm) || []).length;
  check(label + ': no block ends with a comma', commaEnded === 0, commaEnded);
}

// A version that appears twice would mean an entry was renamed rather than added,
// which is how a released version once vanished from the README history.
console.log('\n== no version appears twice ==');
for (const [label, file, fn] of [
  ['mobile', 'mobile/src/js/app.js', 'vBlock'],
  ['desktop', 'desktop/src/js/components/changelog.js', 'versionBlock']
]) {
  const src = fs.readFileSync(path.join(REPO, file), 'utf8');
  const all = [...src.matchAll(new RegExp(fn + "\\(\\s*'([0-9][^']*)'", 'g'))].map(m => m[1]);
  const dupes = all.filter((v, i) => all.indexOf(v) !== i);
  check(label + ': every version appears once', dupes.length === 0, dupes);
}

console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
if (results.fail.length) {
  results.fail.forEach(f => console.log('  ! ' + f));
  process.exitCode = 1;
}
