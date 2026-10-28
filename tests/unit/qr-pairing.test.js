// tests/unit/qr-pairing.test.js
// Unit tests for shared/network/qr-pairing.js
//
// Run with: npm run test:unit
//
// This module parses untrusted input (a QR code can be printed by anyone), so
// every validation branch is covered here. No browser or Electron needed — the
// module is loaded with `window` aliased to the Node global, which is how the
// rest of the shared/ modules expect to find their globals.

const path = require('path');

global.window = global;
require(path.join(__dirname, '..', '..', 'shared', 'network', 'qr-pairing.js'));
const QP = global.window.Orbit.QRPairing;

let pass = 0;
let fail = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log('FAIL  ' + name);
    console.log('      got      ' + JSON.stringify(actual));
    console.log('      expected ' + JSON.stringify(expected));
  }
}

// Fixtures. The SPKI body must be a realistic length (124) with the real P-256
// prefix, because that is exactly what the validator keys off.
const HEX_KEY = '04' + 'a'.repeat(128);
const SPKI_B64 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' + 'b'.repeat(88);
const SPKI_PEM = '-----BEGIN PUBLIC KEY-----\n' + SPKI_B64 + '\n-----END PUBLIC KEY-----';

console.log('qr-pairing: address validation');

check('192.168.x allowed', QP.isAllowedAddress('192.168.1.42'), true);
check('10.x allowed', QP.isAllowedAddress('10.0.0.7'), true);
check('172.16 allowed', QP.isAllowedAddress('172.16.5.9'), true);
check('172.31 allowed', QP.isAllowedAddress('172.31.255.1'), true);
check('172.32 rejected', QP.isAllowedAddress('172.32.0.1'), false);
check('link-local allowed', QP.isAllowedAddress('169.254.10.1'), true);
check('loopback rejected', QP.isAllowedAddress('127.0.0.1'), false);
check('public rejected', QP.isAllowedAddress('8.8.8.8'), false);
check('multicast rejected', QP.isAllowedAddress('224.0.0.251'), false);
check('broadcast rejected', QP.isAllowedAddress('255.255.255.255'), false);
check('zero rejected', QP.isAllowedAddress('0.0.0.0'), false);
check('garbage rejected', QP.isAllowedAddress('not-an-ip'), false);
check('out-of-range octet rejected', QP.isAllowedAddress('192.168.1.999'), false);
check('short address rejected', QP.isAllowedAddress('192.168.1'), false);
// Virtual adapters are RFC1918 and only distinguishable by interface name, so
// they pass the address check and are filtered during enumeration instead.
check('docker-range passes address check', QP.isAllowedAddress('172.17.0.1'), true);

console.log('qr-pairing: key normalization');

check('hex key', QP.normalizeKey(HEX_KEY), { format: 'hex', value: HEX_KEY });
check('hex uppercased lowered', QP.normalizeKey('04' + 'A'.repeat(128)).value, HEX_KEY);
check('pem -> spki, armor stripped', QP.normalizeKey(SPKI_PEM), { format: 'spki', value: SPKI_B64 });
check('bare base64 -> spki', QP.normalizeKey(SPKI_B64), { format: 'spki', value: SPKI_B64 });
check('short hex rejected', QP.normalizeKey('04' + 'a'.repeat(126)), null);
check('wrong prefix rejected', QP.normalizeKey('05' + 'a'.repeat(128)), null);
check('non-p256 base64 rejected', QP.normalizeKey('A'.repeat(124)), null);
check('garbage rejected', QP.normalizeKey('not-a-key'), null);
check('null rejected', QP.normalizeKey(null), null);
check('isValidPublicKey hex', QP.isValidPublicKey(HEX_KEY), true);
check('isValidPublicKey pem', QP.isValidPublicKey(SPKI_PEM), true);
check('exportKey hex unchanged', QP.exportKey(QP.normalizeKey(HEX_KEY)), HEX_KEY);
check('exportKey spki re-wraps as PEM', QP.exportKey(QP.normalizeKey(SPKI_B64)).indexOf('-----BEGIN PUBLIC KEY-----'), 0);
check('exportKey round-trips', QP.normalizeKey(QP.exportKey(QP.normalizeKey(SPKI_B64))).value, SPKI_B64);

console.log('qr-pairing: local key format');

Orbit.env = {};
check('unknown env -> null', QP.localKeyFormat(), null);
Orbit.env = { isElectron: true };
check('electron -> spki (unified)', QP.localKeyFormat(), 'spki');
Orbit.env = { isAndroid: true };
check('android -> spki', QP.localKeyFormat(), 'spki');

console.log('qr-pairing: build');

Orbit.env = { isElectron: true };
const built = JSON.parse(QP.buildPayload(
  { userId: 'u-1', username: 'Dan', usertag: 'dan#1' },
  { ips: ['192.168.1.5', '8.8.8.8', '127.0.0.1', '192.168.1.5', '10.0.0.2'], port: 46000, publicKey: HEX_KEY }
));
check('version is 2', built.v, 2);
check('bad addresses filtered and deduped', built.ips, ['192.168.1.5', '10.0.0.2']);
check('key included', built.pk, HEX_KEY);
check('key format tagged', built.pkf, 'hex');

const builtMobile = JSON.parse(QP.buildPayload(
  { id: 'm-1', name: 'Dan', tag: 'd#1' },
  { ips: ['10.0.0.3'], publicKey: SPKI_PEM }
));
check('mobile identity shape id', builtMobile.id, 'm-1');
check('mobile identity shape name', builtMobile.n, 'Dan');
check('mobile identity shape tag', builtMobile.t, 'd#1');
check('pem armor not carried', builtMobile.pk, SPKI_B64);
check('mobile key format tagged', builtMobile.pkf, 'spki');

check('empty ips still valid', JSON.parse(QP.buildPayload({ userId: 'u-2' }, {})).ips, []);
check('default port applied', JSON.parse(QP.buildPayload({ userId: 'u-2' }, {})).port, 46000);
check('invalid key dropped not fatal', 'pk' in JSON.parse(QP.buildPayload({ userId: 'u-3' }, { publicKey: 'nope' })), false);
check('missing user -> null', QP.buildPayload(null, {}), null);

console.log('qr-pairing: parse and version branching');

check('v1 accepted', QP.parsePayload(JSON.stringify({ v: 1, id: 'abc', n: 'Dan', t: 'x' })).version, 1);
check('v1 has no addresses', QP.parsePayload(JSON.stringify({ v: 1, id: 'abc' })).data.ips, []);
check('v3 -> newer-version', QP.parsePayload(JSON.stringify({ v: 3, id: 'abc' })).reason, 'newer-version');
check('v0 -> not-orbit', QP.parsePayload(JSON.stringify({ v: 0, id: 'abc' })).reason, 'not-orbit');
check('url -> malformed', QP.parsePayload('https://example.com').reason, 'malformed');
// The exact regression this module was written to fix.
check('bare string -> malformed', QP.parsePayload('some-user-id').reason, 'malformed');
check('array -> not-orbit', QP.parsePayload('[1,2,3]').reason, 'not-orbit');
check('null -> not-orbit', QP.parsePayload('null').reason, 'not-orbit');
check('missing id -> malformed', QP.parsePayload(JSON.stringify({ v: 2, ips: [] })).reason, 'malformed');
check('bad id charset -> malformed', QP.parsePayload(JSON.stringify({ v: 2, id: 'a b/c' })).reason, 'malformed');
check('oversized -> too-large', QP.parsePayload('{"v":2,"id":"' + 'a'.repeat(3000) + '"}').reason, 'too-large');

console.log('qr-pairing: own-address filtering');

const filtered = QP.parsePayload(
  JSON.stringify({ v: 2, id: 'x', ips: ['192.168.1.9', '10.0.0.4'] }),
  { ownIps: ['192.168.1.9'] }
);
check('own address removed', filtered.data.ips, ['10.0.0.4']);
const allOwn = QP.parsePayload(
  JSON.stringify({ v: 2, id: 'x', ips: ['192.168.1.9'] }),
  { ownIps: ['192.168.1.9'] }
);
check('all-own is empty but still ok', [allOwn.ok, allOwn.data.ips], [true, []]);

console.log('qr-pairing: port handling');

check('invalid port falls back', QP.parsePayload(JSON.stringify({ v: 2, id: 'x', port: 99999 })).data.port, 46000);
check('valid port kept', QP.parsePayload(JSON.stringify({ v: 2, id: 'x', port: 1234 })).data.port, 1234);

console.log('qr-pairing: key usability across platforms');

// Both platforms now speak SPKI (desktop adopted it in the E2EE unification),
// so a key from either one is usable by the other. A legacy raw-hex key is not
// usable anywhere — nothing speaks that format any more.
Orbit.env = { isElectron: true };
check('spki key usable on desktop', QP.isUsableKey(QP.parsePayload(JSON.stringify({ v: 2, id: 'x', pk: SPKI_B64, pkf: 'spki' })).data), true);
const hexOnDesktop = QP.parsePayload(JSON.stringify({ v: 2, id: 'x', pk: HEX_KEY, pkf: 'hex' })).data;
check('legacy hex key NOT usable on desktop', QP.isUsableKey(hexOnDesktop), false);
check('legacy hex key still retained', hexOnDesktop.key.format, 'hex');

Orbit.env = { isAndroid: true };
check('spki key usable on mobile', QP.isUsableKey(QP.parsePayload(JSON.stringify({ v: 2, id: 'x', pk: SPKI_B64, pkf: 'spki' })).data), true);
check('legacy hex key NOT usable on mobile', QP.isUsableKey(QP.parsePayload(JSON.stringify({ v: 2, id: 'x', pk: HEX_KEY, pkf: 'hex' })).data), false);

Orbit.env = { isElectron: true };
check('pkf contradicting encoding drops key', QP.parsePayload(JSON.stringify({ v: 2, id: 'x', pk: HEX_KEY, pkf: 'spki' })).data.key, null);
check('v1 has no key', QP.isUsableKey(QP.parsePayload(JSON.stringify({ v: 1, id: 'x' })).data), false);

console.log('qr-pairing: filterLocalIps');

check('filters and dedupes', QP.filterLocalIps(['192.168.1.1', '8.8.8.8', '192.168.1.1', '127.0.0.1']), ['192.168.1.1']);
check('non-array -> empty', QP.filterLocalIps(null), []);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
