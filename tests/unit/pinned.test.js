// Unit tests for shared/utils/pinned.js
//
// Plain Node, no browser: the module assigns to `window`, so point window at global first
// (same pattern as the other unit tests in this directory).
global.window = global;
require('../../shared/utils/pinned.js');

const assert = require('assert');
const P = global.window.OrbitPinned;

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

console.log('pinned');

// ── the limits ──────────────────────────────────────────────────────────────
ok('a direct message takes three pins', () => {
  assert.strictEqual(P.limitFor(false), 3);
  assert.strictEqual(P.MAX_DM, 3);
});

ok('a group takes five', () => {
  assert.strictEqual(P.limitFor(true), 5);
  assert.strictEqual(P.MAX_GROUP, 5);
});

ok('canPin says no at the limit, and says why', () => {
  const full = [{ msgId: 'a' }, { msgId: 'b' }, { msgId: 'c' }];
  const dm = P.canPin(full, false);
  assert.strictEqual(dm.ok, false);
  assert.strictEqual(dm.limit, 3);
  assert.ok(/up to 3/.test(dm.message), dm.message);
  // the same three are fine in a group
  assert.strictEqual(P.canPin(full, true).ok, true);
});

ok('add refuses past the limit and leaves the list alone', () => {
  let list = [];
  for (const id of ['a', 'b', 'c']) list = P.add(list, { msgId: id }, false).list;
  const out = P.add(list, { msgId: 'd' }, false);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'limit');
  assert.strictEqual(out.list.length, 3);
  // and a group still accepts it
  assert.strictEqual(P.add(list, { msgId: 'd' }, true).ok, true);
});

ok('add KEEPS the fields it does not own', () => {
  // The assertion that was missing. add() rebuilt the entry with only msgId/pinnedAt/
  // pinnedBy, so the label vanished and every pin rendered as "(attachment)" — the same
  // mistake normalise() made, and the tests checked normalise for it but not add.
  const out = P.add([], { msgId: 'a', text: 'holiday.jpg', sender: 'peer-1' }, false);
  assert.strictEqual(out.list[0].text, 'holiday.jpg');
  assert.strictEqual(out.list[0].sender, 'peer-1');
});

ok('add is idempotent', () => {
  const once = P.add([], { msgId: 'x' }, false);
  const twice = P.add(once.list, { msgId: 'x' }, false);
  assert.strictEqual(twice.list.length, 1);
  assert.strictEqual(twice.unchanged, true);
});

ok('add rejects an entry with no id', () => {
  for (const bad of [null, {}, { msgId: '' }, { msgId: null }]) {
    assert.strictEqual(P.add([], bad, false).ok, false, JSON.stringify(bad));
  }
});

// ── the string/number id trap ───────────────────────────────────────────────
ok('ids are compared as strings, not by type', () => {
  // Own messages carry string ids and incoming ones carry numbers in this codebase, so a
  // pinned list has to match across the two or the same message can be pinned twice.
  const list = [{ msgId: 12345 }];
  assert.strictEqual(P.isPinned(list, '12345'), true);
  assert.strictEqual(P.isPinned(list, 12345), true);
  const again = P.add(list, { msgId: '12345' }, false);
  assert.strictEqual(again.list.length, 1, 'must not double-pin');
  assert.strictEqual(again.unchanged, true);
});

ok('normalise KEEPS the fields it does not own', () => {
  // The bug this was written for: normalise rebuilt each entry and dropped everything
  // except msgId/pinnedAt/pinnedBy, so the text the UI shows vanished and every pinned
  // row rendered as "(attachment)". The other tests only checked msgId, which is exactly
  // why they passed while the feature was broken on screen.
  const out = P.normalise([{ msgId: 'a', text: 'the wifi password', sender: 'peer-1', timestamp: 'T' }]);
  assert.strictEqual(out[0].text, 'the wifi password');
  assert.strictEqual(out[0].sender, 'peer-1');
  assert.strictEqual(out[0].timestamp, 'T');
});

ok('prune keeps them too', () => {
  const out = P.prune([{ msgId: 'a', text: 'keep me' }], () => true);
  assert.strictEqual(out[0].text, 'keep me');
});

ok('normalise coerces ids and drops duplicates and rubbish', () => {
  const out = P.normalise([{ msgId: 1 }, { msgId: '1' }, { msgId: 'b' }, null, 'x', { msgId: '' }, {}]);
  assert.deepStrictEqual(out.map(p => p.msgId), ['1', 'b']);
});

// ── a deleted message must not linger ───────────────────────────────────────
ok('prune drops messages that no longer exist', () => {
  const list = [{ msgId: 'keep-1' }, { msgId: 'gone' }, { msgId: 'keep-2' }];
  const live = { 'keep-1': true, 'keep-2': true };
  const out = P.prune(list, id => !!live[id]);
  assert.deepStrictEqual(out.map(p => p.msgId), ['keep-1', 'keep-2']);
});

ok('prune keeps the order it was given', () => {
  const list = [{ msgId: 'c' }, { msgId: 'a' }, { msgId: 'b' }];
  const out = P.prune(list, () => true);
  assert.deepStrictEqual(out.map(p => p.msgId), ['c', 'a', 'b']);
});

ok('prune with no predicate just cleans the list', () => {
  assert.strictEqual(P.prune([{ msgId: 'a' }, { msgId: 'a' }]).length, 1);
  assert.deepStrictEqual(P.prune(null), []);
});

ok('pruning frees a slot', () => {
  const full = [{ msgId: 'a' }, { msgId: 'b' }, { msgId: 'c' }];
  const afterDelete = P.prune(full, id => id !== 'b');
  assert.strictEqual(P.canPin(afterDelete, false).ok, true, 'deleting a pinned message must free a slot');
});

// ── removing ────────────────────────────────────────────────────────────────
ok('remove takes one out, by either id type', () => {
  const list = [{ msgId: 'a' }, { msgId: 'b' }];
  assert.deepStrictEqual(P.remove(list, 'a').map(p => p.msgId), ['b']);
  assert.deepStrictEqual(P.remove([{ msgId: 7 }], 7), []);
});

// ── reordering ──────────────────────────────────────────────────────────────
ok('reorder moves an entry', () => {
  const list = [{ msgId: 'a' }, { msgId: 'b' }, { msgId: 'c' }];
  const out = P.reorder(list, 2, 0);
  assert.strictEqual(out.ok, true);
  assert.deepStrictEqual(out.list.map(p => p.msgId), ['c', 'a', 'b']);
});

ok('reorder clamps an out-of-range index rather than throwing', () => {
  const list = [{ msgId: 'a' }, { msgId: 'b' }];
  assert.deepStrictEqual(P.reorder(list, 0, 99).list.map(p => p.msgId), ['b', 'a']);
  assert.deepStrictEqual(P.reorder(list, -5, 0).list.map(p => p.msgId), ['a', 'b']);
});

ok('reorder reports when nothing moved', () => {
  const list = [{ msgId: 'a' }, { msgId: 'b' }];
  assert.strictEqual(P.reorder(list, 1, 1).ok, false);
  assert.strictEqual(P.reorder([{ msgId: 'a' }], 0, 0).ok, false, 'one entry cannot be reordered');
});

ok('orderChanged only fires on a real change', () => {
  const a = [{ msgId: 'x' }, { msgId: 'y' }];
  assert.strictEqual(P.orderChanged(a, [{ msgId: 'y' }, { msgId: 'x' }]), true);
  assert.strictEqual(P.orderChanged(a, [{ msgId: 'x' }, { msgId: 'y' }]), false);
  // the same order with different timestamps is not a change
  assert.strictEqual(P.orderChanged(a, [{ msgId: 'x', pinnedAt: 9 }, { msgId: 'y', pinnedAt: 8 }]), false);
  assert.strictEqual(P.orderChanged(a, [{ msgId: 'x' }]), true, 'a removal is a change');
});

// ── what a pin is called ────────────────────────────────────────────────────
ok('a text message is labelled by its text', () => {
  assert.strictEqual(P.labelFor({ text: 'the wifi password is on the fridge' }), 'the wifi password is on the fridge');
});

ok('a file message is labelled by its file name, NOT (attachment)', () => {
  // Both platforms shipped the literal '(attachment)' here, so a pinned photo was
  // labelled '(attachment)' and told you nothing about which one it was.
  assert.strictEqual(P.labelFor({ text: '', attachments: [{ type: 'image', name: 'holiday.jpg' }] }), 'holiday.jpg');
  assert.strictEqual(P.labelFor({ attachments: [{ type: 'video', name: 'clip.mp4' }] }), 'clip.mp4');
  assert.strictEqual(P.labelFor({ attachments: [{ name: 'report.pdf', mimeType: 'application/pdf' }] }), 'report.pdf');
});

ok('a nameless attachment falls back to what kind of thing it is', () => {
  assert.strictEqual(P.labelFor({ attachments: [{ type: 'image' }] }), 'Photo');
  assert.strictEqual(P.labelFor({ attachments: [{ type: 'video' }] }), 'Video');
  assert.strictEqual(P.labelFor({ attachments: [{ type: 'audio' }] }), 'Voice message');
  assert.strictEqual(P.labelFor({ attachments: [{ mimeType: 'image/png' }] }), 'Photo', 'the mime type counts');
  assert.strictEqual(P.labelFor({ attachments: [{ name: '' }] }), 'File');
});

ok('a caption beats the file name', () => {
  assert.strictEqual(P.labelFor({ text: 'look at this', attachments: [{ type: 'image', name: 'thing.png' }] }), 'look at this');
});

ok('(attachment) survives only as the last resort', () => {
  assert.strictEqual(P.labelFor({ text: '' }), '(attachment)');
  assert.strictEqual(P.labelFor({}), '(attachment)');
  assert.strictEqual(P.labelFor(null), '(attachment)');
});

ok('a single attachment object works too, not just an array', () => {
  assert.strictEqual(P.labelFor({ attachment: { type: 'image', name: 'one.png' } }), 'one.png');
});

// ── the note other people see ───────────────────────────────────────────────
ok('the change note names the person', () => {
  assert.strictEqual(P.orderChangedText('Dan'), 'Dan has changed the pinned message order.');
  assert.strictEqual(P.orderChangedText('  Dan  '), 'Dan has changed the pinned message order.');
});

ok('the change note never renders an empty name', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.ok(/^Someone has/.test(P.orderChangedText(v)), JSON.stringify(v) + ' -> ' + P.orderChangedText(v));
  }
});

console.log('\n' + passed + ' passed');
