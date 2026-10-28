// The hybrid transport's signalling order rules.
//
// ⚠ There is no RTCPeerConnection here and none is needed: the whole point of the module
// is that the ordering can be proven without a browser, a network or a second peer.
const { roleFor, createPeer, STATES } = require('../../shared/network/webrtc-signaling');

const results = { pass: 0, fail: [] };
function check(label, cond, detail) {
  if (cond) { results.pass++; console.log('  ok   ' + label); }
  else { results.fail.push(label); console.log('  FAIL ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); }
}
const ops = (r) => r.effects.map((e) => e.op);

console.log('\n== roleFor: exactly one side offers, and both agree ==');
{
  check('the smaller id offers', roleFor('a', 'b') === 'offerer');
  check('the larger id answers', roleFor('b', 'a') === 'answerer');
  // ⚠ The two sides must compute OPPOSITE roles from the same pair, or both offer.
  check('and the pair is symmetric', roleFor('a', 'b') !== roleFor('b', 'a'));
  check('a peer never negotiates with itself', roleFor('a', 'a') === null);
  check('nor with a missing id', roleFor('a', '') === null && roleFor(null, 'b') === null);
  check('long ids still resolve', roleFor('p_ava_0001', 'p_ava_0002') === 'offerer');
}

console.log('\n== offerer: the happy path ==');
{
  const p = createPeer({ role: 'offerer' });
  check('starts new', p.state === STATES.NEW);
  const start = p.dispatch({ type: 'start' });
  check('start asks for an offer', ops(start).includes('create-offer'), ops(start));
  check('and moves to local-offer', start.state === STATES.LOCAL_OFFER);

  const local = p.dispatch({ type: 'local-description', desc: { type: 'offer', sdp: 'v=0...' } });
  check('the offer is sent', ops(local).includes('send'), ops(local));
  check('still local-offer until the answer', local.state === STATES.LOCAL_OFFER);

  const answer = p.dispatch({ type: 'remote-description', desc: { type: 'answer', sdp: 'v=0...' } });
  check('the answer settles it', answer.state === STATES.STABLE);
  check('and the remote description is applied first',
    ops(answer)[0] === 'set-remote-description', ops(answer));
}

console.log('\n== ⚠⚠ candidates that arrive BEFORE the remote description ==');
{
  const p = createPeer({ role: 'offerer' });
  p.dispatch({ type: 'start' });
  p.dispatch({ type: 'local-description', desc: { type: 'offer', sdp: 'x' } });

  // Three candidates land before the answer, which is the normal case on a slow link.
  const c1 = p.dispatch({ type: 'remote-candidate', candidate: { candidate: 'c1' } });
  const c2 = p.dispatch({ type: 'remote-candidate', candidate: { candidate: 'c2' } });
  const c3 = p.dispatch({ type: 'remote-candidate', candidate: { candidate: 'c3' } });
  check('none of them is added yet',
    ops(c1).length === 0 && ops(c2).length === 0 && ops(c3).length === 0,
    [ops(c1), ops(c2), ops(c3)]);
  check('all three are buffered', p.pending().length === 3, p.pending().length);

  const answer = p.dispatch({ type: 'remote-description', desc: { type: 'answer', sdp: 'x' } });
  const drain = answer.effects.find((e) => e.op === 'add-buffered-candidates');
  check('the answer drains them', !!drain, ops(answer));
  check('in arrival order',
    drain && drain.candidates.map((c) => c.candidate).join(',') === 'c1,c2,c3',
    drain && drain.candidates);
  check('and the remote description is applied BEFORE them',
    ops(answer).indexOf('set-remote-description') < ops(answer).indexOf('add-buffered-candidates'),
    ops(answer));
  check('the buffer is emptied by draining', p.pending().length === 0);

  // A second answer must not re-apply them.
  const dup = p.dispatch({ type: 'remote-description', desc: { type: 'answer', sdp: 'x' } });
  check('a duplicate answer adds nothing', ops(dup).indexOf('add-buffered-candidates') === -1, ops(dup));
}

console.log('\n== candidates after the description go straight through ==');
{
  const p = createPeer({ role: 'offerer' });
  p.dispatch({ type: 'start' });
  p.dispatch({ type: 'local-description', desc: { type: 'offer', sdp: 'x' } });
  p.dispatch({ type: 'remote-description', desc: { type: 'answer', sdp: 'x' } });
  const c = p.dispatch({ type: 'remote-candidate', candidate: { candidate: 'late' } });
  check('added immediately', ops(c).includes('add-candidate'), ops(c));
  check('and not buffered', p.pending().length === 0);
}

console.log('\n== answerer: the other side of the same exchange ==');
{
  const p = createPeer({ role: 'answerer' });
  check('start does nothing for the answerer', ops(p.dispatch({ type: 'start' })).length === 0);

  const offer = p.dispatch({ type: 'remote-description', desc: { type: 'offer', sdp: 'x' } });
  check('an offer is applied and answered',
    ops(offer).includes('set-remote-description') && ops(offer).includes('create-answer'), ops(offer));
  check('state is remote-offer', offer.state === STATES.REMOTE_OFFER);

  const local = p.dispatch({ type: 'local-description', desc: { type: 'answer', sdp: 'x' } });
  check('our answer is sent', ops(local).includes('send'), ops(local));
  check('and we are stable', local.state === STATES.STABLE);

  const second = p.dispatch({ type: 'local-description', desc: { type: 'answer', sdp: 'y' } });
  check('a second answer is not sent', ops(second).length === 0, ops(second));
}

console.log('\n== glare is ignored, never rolled back ==');
{
  const p = createPeer({ role: 'offerer' });
  p.dispatch({ type: 'start' });
  p.dispatch({ type: 'local-description', desc: { type: 'offer', sdp: 'x' } });
  const glare = p.dispatch({ type: 'remote-description', desc: { type: 'offer', sdp: 'y' } });
  check('an offer to the offerer is ignored', ops(glare).includes('ignore'), ops(glare));
  check('and the state is untouched', glare.state === STATES.LOCAL_OFFER);
}

console.log('\n== duplicates and nonsense are ignored ==');
{
  const p = createPeer({ role: 'answerer' });
  const stray = p.dispatch({ type: 'remote-description', desc: { type: 'answer', sdp: 'x' } });
  check('an answer before any offer is ignored', ops(stray).includes('ignore'), ops(stray));
  check('state stays new', stray.state === STATES.NEW);

  p.dispatch({ type: 'remote-description', desc: { type: 'offer', sdp: 'x' } });
  const dupOffer = p.dispatch({ type: 'remote-description', desc: { type: 'offer', sdp: 'z' } });
  check('a duplicate offer is ignored', ops(dupOffer).includes('ignore'), ops(dupOffer));
  check('no second answer is created', ops(dupOffer).indexOf('create-answer') === -1);
}

console.log('\n== failed is terminal ==');
{
  const p = createPeer({ role: 'offerer' });
  p.dispatch({ type: 'start' });
  const f = p.dispatch({ type: 'failed', reason: 'ice' });
  check('failure is reported', f.state === STATES.FAILED && ops(f).includes('fail'), ops(f));
  check('nothing works afterwards',
    p.dispatch({ type: 'start' }).effects.length === 0 &&
    p.dispatch({ type: 'remote-candidate', candidate: { candidate: 'x' } }).effects.length === 0);
}

console.log('\n' + results.pass + ' passed, ' + results.fail.length + ' failed');
if (results.fail.length) process.exit(1);
