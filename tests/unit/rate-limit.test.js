// Token bucket for inbound packets — the local stand-in for a server's rate limit.
//
// ⚠ `allow(key, now)` takes the clock as an argument, so these tests drive time
// directly. No fake timers, no waiting: a refill test that sleeps for a second tests
// setTimeout, not the bucket.
const { TokenBucket } = require('../../desktop/src/js/network/rate-limit');

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else { results.fail.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}

const T0 = 1000000;

console.log('\n== burst, then refusal ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 60 });
  let allowed = 0;
  for (let i = 0; i < 61; i++) if (b.allow('peer', T0)) allowed++;
  check('a cold key may spend its whole burst at once', allowed === 60, allowed);
  check('the 61st packet in the same millisecond is refused', b.allow('peer', T0) === false);
  check('refusals are counted', b.dropped === 2, b.dropped);
}

console.log('\n== refill ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 60 });
  for (let i = 0; i < 60; i++) b.allow('peer', T0);
  check('empty after the burst', b.allow('peer', T0) === false);
  // 20/s means one token every 50ms.
  check('half a second buys 10 packets', (function () {
    let n = 0;
    for (let i = 0; i < 12; i++) if (b.allow('peer', T0 + 500)) n++;
    return n === 10;
  })());
  check('and then it is empty again', b.allow('peer', T0 + 500) === false);
}

console.log('\n== the bucket never overfills ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 60 });
  b.allow('peer', T0);
  // Ten seconds idle would be 200 tokens if nothing capped it.
  let n = 0;
  for (let i = 0; i < 80; i++) if (b.allow('peer', T0 + 10000)) n++;
  check('a long idle refills to the burst, not beyond', n === 60, n);
}

console.log('\n== keys are independent ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 5 });
  for (let i = 0; i < 5; i++) b.allow('a', T0);
  check('a is empty', b.allow('a', T0) === false);
  check('b is untouched by a', b.allow('b', T0) === true);
}

console.log('\n== a backwards clock mints nothing ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 10 });
  for (let i = 0; i < 10; i++) b.allow('peer', T0);
  check('empty', b.allow('peer', T0) === false);
  check('an earlier timestamp does not refill it', b.allow('peer', T0 - 5000) === false);
}

console.log('\n== forget / prune ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 10 });
  for (let i = 0; i < 10; i++) b.allow('peer', T0);
  check('forget gives the key a full bucket', b.forget('peer') === true && b.allow('peer', T0) === true);

  const c = new TokenBucket({ perSecond: 20, burst: 10 });
  c.allow('idle', T0);
  c.allow('busy', T0 + 59000);
  const removed = c.prune(T0 + 61000, 60000);
  check('prune drops the key idle for longer than a minute', removed === 1, removed);
  check('and keeps the one that was just active', c.buckets.has('busy'));
  // ⚠ The boundary is "longer than", not "at least" — pinned, because an off-by-one
  // here would evict a key that is exactly at the threshold and silently reset it.
  check('exactly idleMs is not "longer than"', (function () {
    const d = new TokenBucket({ perSecond: 20, burst: 5 });
    d.allow('k', T0);
    return d.prune(T0 + 60000, 60000) === 0;
  })());
}

console.log('\n== available() reads without spending ==');
{
  const b = new TokenBucket({ perSecond: 20, burst: 10 });
  const before = b.available('peer', T0);
  b.available('peer', T0);
  check('a fresh key reports the full burst', before === 10, before);
  check('reading did not consume a token', b.available('peer', T0) === 10);
}

console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
if (results.fail.length) process.exit(1);
