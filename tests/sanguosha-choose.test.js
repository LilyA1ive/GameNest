// tests/sanguosha-choose.test.js
// 三国杀·身份局 — 选将阶段 (general selection) tests (node:test + node:assert/strict)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sanguosha = require('../games/sanguosha');

function makeState(playerCount, overrides) {
  const s = sanguosha.createState();
  sanguosha.initGame(s, playerCount);
  if (overrides) Object.assign(s, overrides);
  return s;
}

function chooseAll(s) {
  for (let i = 0; i < s.seats.length; i++) {
    const cand = s.candidateGenerals[i][0];
    const err = sanguosha.handleMove({ type: 'select_general', general: cand }, s, i);
    assert.equal(err, null, 'chooseAll seat ' + i + ' err: ' + err);
  }
  return s;
}

test('initGame enters choosing phase with 3 distinct candidates per player', () => {
  const s = makeState(4);
  assert.equal(s.phase, 'choosing');
  assert.equal(s.currentPlayer, -1, 'no turn owner during choosing');
  assert.equal(s.candidateGenerals.length, 4);
  for (const cands of s.candidateGenerals) {
    assert.equal(cands.length, 3);
    assert.equal(new Set(cands).size, 3, 'candidates within a player are distinct');
    for (const g of cands) assert.ok(typeof g === 'string' && g.length > 0, 'candidate is a non-empty string');
  }
  // no starting hand during choosing
  for (const seat of s.seats) assert.equal(seat.hand.length, 0);
  for (const seat of s.seats) assert.equal(seat.chosen, false);
  // king seat revealed
  const lord = s.seats.find(seat => seat.role === 'lord');
  assert.equal(s.king.seat, lord.seatIndex);
});

test('select_general accepts a candidate and marks seat chosen', () => {
  const s = makeState(4);
  const cand = s.candidateGenerals[0][0];
  const err = sanguosha.handleMove({ type: 'select_general', general: cand }, s, 0);
  assert.equal(err, null);
  assert.equal(s.seats[0].general, cand);
  assert.equal(s.seats[0].chosen, true);
  assert.equal(s.phase, 'choosing', 'not all chosen yet, still choosing');
});

test('select_general rejects a name not in candidates', () => {
  const s = makeState(4);
  const cand = s.candidateGenerals[0][0];
  // pick a general guaranteed not in player 0's candidates
  const cands = new Set(s.candidateGenerals[0]);
  const bad = (sanguosha.generals || []).find(g => !cands.has(g)) || '李逵';
  const err = sanguosha.handleMove({ type: 'select_general', general: bad }, s, 0);
  assert.equal(typeof err, 'string');
  assert.equal(s.seats[0].chosen, false);
  assert.notEqual(s.seats[0].general, bad);
});

test('select_general rejects invalid move type during choosing', () => {
  const s = makeState(4);
  const err = sanguosha.handleMove({ type: 'draw' }, s, 0);
  assert.equal(typeof err, 'string');
});

test('select_general raises error when already chosen', () => {
  const s = makeState(4);
  const cand = s.candidateGenerals[0][0];
  assert.equal(sanguosha.handleMove({ type: 'select_general', general: cand }, s, 0), null);
  const err = sanguosha.handleMove({ type: 'select_general', general: cand }, s, 0);
  assert.equal(typeof err, 'string');
});

test('all players chosen -> draw phase, 4 cards each, lord starts', () => {
  const s = makeState(4);
  chooseAll(s);
  assert.equal(s.phase, 'draw');
  assert.equal(s.currentPlayer, s.king.seat);
  for (const seat of s.seats) assert.equal(seat.hand.length, 4);
  for (const seat of s.seats) assert.equal(seat.chosen, true);
  assert.equal(s.king.general, s.seats[s.king.seat].general);
});

test('playerView exposes own candidates only', () => {
  const s = makeState(4);
  const view = sanguosha.playerView(s, 0);
  assert.deepEqual(view.candidateGenerals, s.candidateGenerals[0]);
  assert.equal(view.candidateGenerals.length, 3);
  assert.ok('chosen' in view.seats[0], 'seat view has chosen flag');
  assert.ok('general' in view.seats[0], 'seat view has general field');
});
