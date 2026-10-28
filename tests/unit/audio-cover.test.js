// Unit tests for shared/utils/audio-cover.js
//
// Plain Node, no browser: the module assigns to `window`, so point window at
// global first (same pattern as the other unit tests in this directory).
global.window = global;
require('../../shared/utils/audio-cover.js');

const assert = require('assert');
const Cover = global.window.OrbitAudioCover;

// A real 1x1 PNG — used as the "embedded artwork" payload.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(60, 0x20), Buffer.from([0xFF, 0xD9])]);

let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

function syncsafe(v) {
  return Buffer.from([(v >> 21) & 0x7f, (v >> 14) & 0x7f, (v >> 7) & 0x7f, v & 0x7f]);
}

// ---- builders ------------------------------------------------------------

function buildId3({ version = 3, image = PNG, mime = 'image/png', id = 'APIC' } = {}) {
  const mimeBuf = Buffer.concat([Buffer.from(mime, 'latin1'), Buffer.from([0])]);
  const frameBody = Buffer.concat([
    Buffer.from([0x00]),          // text encoding: latin1
    mimeBuf,                      // mime, NUL terminated
    Buffer.from([0x03]),          // picture type: cover (front)
    Buffer.from([0x00]),          // empty description, NUL terminated
    image
  ]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write(id, 0, 'latin1');
  if (version >= 4) syncsafe(frameBody.length).copy(frameHeader, 4);
  else frameHeader.writeUInt32BE(frameBody.length, 4);
  const frame = Buffer.concat([frameHeader, frameBody]);

  const header = Buffer.concat([
    Buffer.from('ID3', 'latin1'),
    Buffer.from([version, 0x00, 0x00]),
    syncsafe(frame.length)
  ]);
  // Trailing MPEG bytes so the file is not just a tag.
  return Buffer.concat([header, frame, Buffer.alloc(128, 0xFF)]);
}

function buildMp4({ image = JPEG, typeByte = 0x0D } = {}) {
  const dataPayload = Buffer.concat([Buffer.from([typeByte, 0x00, 0x00, 0x00]), image]);
  const dataBox = Buffer.concat([
    (function () { const b = Buffer.alloc(4); b.writeUInt32BE(8 + dataPayload.length, 0); return b; })(),
    Buffer.from('data', 'latin1'),
    dataPayload
  ]);
  const covrBox = Buffer.concat([
    (function () { const b = Buffer.alloc(4); b.writeUInt32BE(8 + dataBox.length, 0); return b; })(),
    Buffer.from('covr', 'latin1'),
    dataBox
  ]);
  // moov/udta/meta/ilst wrapping is not required — the scan is structural.
  return Buffer.concat([Buffer.from('ftypM4A ', 'latin1'), Buffer.alloc(40, 0), covrBox, Buffer.alloc(64, 0)]);
}

function buildFlac({ image = PNG, mime = 'image/png' } = {}) {
  const mimeBuf = Buffer.from(mime, 'latin1');
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v, 0); return b; };
  const body = Buffer.concat([
    u32(3),           // picture type
    u32(mimeBuf.length), mimeBuf,
    u32(0),           // empty description
    u32(1), u32(1), u32(24), u32(0), // width, height, depth, colors
    u32(image.length), image
  ]);
  const blockHeader = Buffer.from([0x80 | 6, (body.length >> 16) & 0xFF, (body.length >> 8) & 0xFF, body.length & 0xFF]);
  return Buffer.concat([Buffer.from('fLaC', 'latin1'), blockHeader, body]);
}

// ---- tests ---------------------------------------------------------------

console.log('audio-cover');

ok('extracts APIC cover art from an ID3v2.3 MP3', () => {
  const r = Cover.extract(buildId3());
  assert.ok(r, 'expected a result');
  assert.strictEqual(r.kind, 'id3');
  assert.strictEqual(r.mime, 'image/png');
  assert.ok(r.url.startsWith('data:image/png;base64,'));
  assert.strictEqual(Buffer.from(r.url.split(',')[1], 'base64').length, PNG.length);
});

ok('extracts APIC from an ID3v2.4 MP3 (syncsafe frame size)', () => {
  const r = Cover.extract(buildId3({ version: 4, image: JPEG, mime: 'image/jpeg' }));
  assert.ok(r);
  assert.strictEqual(r.mime, 'image/jpeg');
  assert.strictEqual(Buffer.from(r.url.split(',')[1], 'base64').length, JPEG.length);
});

ok('extracts the covr atom from an MP4/M4A', () => {
  const r = Cover.extract(buildMp4());
  assert.ok(r);
  assert.strictEqual(r.kind, 'mp4');
  assert.strictEqual(r.mime, 'image/jpeg');
  assert.strictEqual(Buffer.from(r.url.split(',')[1], 'base64').length, JPEG.length);
});

ok('extracts the PICTURE block from a FLAC', () => {
  const r = Cover.extract(buildFlac());
  assert.ok(r);
  assert.strictEqual(r.kind, 'flac');
  assert.strictEqual(r.mime, 'image/png');
  assert.strictEqual(Buffer.from(r.url.split(',')[1], 'base64').length, PNG.length);
});

ok('accepts a Uint8Array as well as an ArrayBuffer', () => {
  const buf = buildId3();
  const r = Cover.extract(new Uint8Array(buf));
  assert.ok(r);
  assert.strictEqual(r.kind, 'id3');
});

ok('returns null for an ID3 tag with no APIC frame', () => {
  const mimeBuf = Buffer.concat([Buffer.from('text/plain'), Buffer.from([0])]);
  const frameBody = Buffer.concat([Buffer.from([0x00]), mimeBuf]);
  const frameHeader = Buffer.alloc(10);
  frameHeader.write('TIT2', 0, 'latin1');
  frameHeader.writeUInt32BE(frameBody.length, 4);
  const frame = Buffer.concat([frameHeader, frameBody]);
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncsafe(frame.length)]);
  assert.strictEqual(Cover.extract(Buffer.concat([header, frame, Buffer.alloc(64)])), null);
});

ok('returns null for garbage, empty and truncated input', () => {
  assert.strictEqual(Cover.extract(Buffer.alloc(0)), null);
  assert.strictEqual(Cover.extract(null), null);
  assert.strictEqual(Cover.extract(Buffer.alloc(16)), null);
  assert.strictEqual(Cover.extract(Buffer.from('not an audio file at all, really not')), null);
  assert.strictEqual(Cover.extract(buildId3().subarray(0, 12)), null);
});

ok('never throws on a corrupted APIC frame', () => {
  const good = buildId3();
  // Declare a huge frame size so every bounds check has to catch it.
  good.writeUInt32BE(0xFFFFFF, 14);
  assert.doesNotThrow(() => Cover.extract(good));
});

ok('never throws on fuzzed input', () => {
  for (let i = 0; i < 200; i++) {
    const b = Buffer.alloc(64 + i);
    for (let j = 0; j < b.length; j++) b[j] = (i * 31 + j * 17) & 0xFF;
    // Seed a plausible magic byte sometimes so real parse paths get exercised.
    if (i % 3 === 0) b.write('ID3', 0, 'latin1');
    if (i % 5 === 0) b.write('covr', 8, 'latin1');
    if (i % 7 === 0) b.write('fLaC', 0, 'latin1');
    assert.doesNotThrow(() => Cover.extract(b));
  }
});

console.log('\n' + passed + ' passed');
