// tests/sanguosha.test.js
// 三国杀·身份局 — server-side logic tests (node:test + node:assert/strict)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const sanguosha = require('../games/sanguosha');

function makeState(playerCount, overrides) {
  const s = sanguosha.createState();
  sanguosha.initGame(s, playerCount);
  if (overrides) Object.assign(s, overrides);
  return s;
}

// Simulate every player picking their first candidate general to reach the draw phase.
function chooseAll(s) {
  for (let i = 0; i < s.seats.length; i++) {
    const cand = s.candidateGenerals[i][0];
    const err = sanguosha.handleMove({ type: 'select_general', general: cand }, s, i);
    if (err) throw new Error('chooseAll seat ' + i + ' err: ' + err);
  }
  return s;
}

// ── exports / createState ──

test('exports correct name and player bounds', () => {
  assert.equal(sanguosha.name, 'sanguosha');
  assert.equal(sanguosha.maxPlayers, 8);
  assert.equal(sanguosha.minPlayers, 4);
});

test('createState returns correct defaults', () => {
  const s = sanguosha.createState();
  assert.equal(s.phase, 'choosing');
  assert.equal(s.currentPlayer, 0);
  assert.equal(s.winner, null);
  assert.deepEqual(s.seats, []);
  assert.deepEqual(s.heap, []);
  assert.deepEqual(s.discard, []);
  assert.deepEqual(s.king, {});
  assert.deepEqual(s.candidateGenerals, []);
});

// ── role assignment ──

test('initGame: 4-player role distribution is 1/1/1/1', () => {
  const s = makeState(4);
  const roles = s.seats.map(seat => seat.role);
  const count = (r) => roles.filter(x => x === r).length;
  assert.equal(count('lord'), 1);
  assert.equal(count('loyalist'), 1);
  assert.equal(count('rebel'), 1);
  assert.equal(count('traitor'), 1);
});

test('initGame: 5-player role distribution is 1/1/2/1', () => {
  const s = makeState(5);
  const roles = s.seats.map(seat => seat.role);
  const count = (r) => roles.filter(x => x === r).length;
  assert.equal(count('lord'), 1);
  assert.equal(count('loyalist'), 1);
  assert.equal(count('rebel'), 2);
  assert.equal(count('traitor'), 1);
});

test('initGame: lord is revealed via king and has maxHp 5', () => {
  const s = makeState(4);
  const lordSeat = s.seats.find(seat => seat.role === 'lord');
  assert.ok(lordSeat, 'lord seat exists');
  assert.equal(s.king.seat, lordSeat.seatIndex);
  assert.equal(lordSeat.maxHp, 5);
  assert.equal(lordSeat.hp, 5);
  // others have maxHp 4
  for (const seat of s.seats) {
    if (seat.role !== 'lord') assert.equal(seat.maxHp, 4);
  }
});

test('initGame: choosing first, then each player dealt 4 cards, lord starts', () => {
  const s = makeState(4);
  assert.equal(s.seats.length, 4);
  assert.equal(s.phase, 'choosing');
  assert.equal(s.currentPlayer, -1);
  for (const seat of s.seats) assert.equal(seat.hand.length, 0);
  chooseAll(s);
  assert.equal(s.phase, 'draw');
  for (const seat of s.seats) assert.equal(seat.hand.length, 4);
  assert.equal(s.currentPlayer, s.king.seat);
});

// ── turn flow ──

test('turn flow: draw -> play -> discard -> next player', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  assert.equal(s.phase, 'draw');
  assert.equal(s.currentPlayer, lord);

  // draw phase: draw 2 cards
  const err = sanguosha.handleMove({ type: 'draw' }, s, lord);
  assert.equal(err, null);
  assert.equal(s.phase, 'play');
  assert.equal(s.seats[lord].hand.length, 6); // 4 + 2

  // play phase: end turn -> discard
  sanguosha.handleMove({ type: 'end' }, s, lord);
  assert.equal(s.phase, 'discard');

  // discard: hand (6) > hp (5), must discard 1
  const discardErr = sanguosha.handleMove({ type: 'discard', cardIds: [s.seats[lord].hand[0].id] }, s, lord);
  assert.equal(discardErr, null);
  assert.equal(s.phase, 'draw');
  assert.notEqual(s.currentPlayer, lord); // advanced to next player
});

test('discard auto-advances when hand <= hp', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  s.phase = 'play';
  // trim hand to hp so no discard needed
  s.seats[lord].hand = s.seats[lord].hand.slice(0, s.seats[lord].hp);
  sanguosha.handleMove({ type: 'end' }, s, lord);
  assert.equal(s.phase, 'discard');
  const err = sanguosha.handleMove({ type: 'end' }, s, lord);
  assert.equal(err, null);
  assert.equal(s.phase, 'draw');
});

// ── card play: 杀 / 闪 ──

test('杀 deals 1 damage when target has no 闪', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  const target = (lord + 1) % 4;
  s.phase = 'play';
  const sha = { id: 'sha_test', type: 'basic', name: '杀', suit: 'h', rank: 'A' };
  s.seats[lord].hand.push(sha);
  s.seats[target].hand = s.seats[target].hand.filter(c => c.name !== '闪');
  const hpBefore = s.seats[target].hp;
  const err = sanguosha.handleMove({ type: 'play', cardId: 'sha_test', targetIdx: target }, s, lord);
  assert.equal(err, null);
  assert.equal(s.seats[target].hp, hpBefore - 1);
});

test('杀 is dodged when target has a 闪', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  const target = (lord + 1) % 4;
  s.phase = 'play';
  const sha = { id: 'sha_test', type: 'basic', name: '杀', suit: 'h', rank: 'A' };
  const shan = { id: 'shan_test', type: 'basic', name: '闪', suit: 'h', rank: 'K' };
  s.seats[lord].hand.push(sha);
  s.seats[target].hand = [shan]; // exactly one 闪, deterministic
  const hpBefore = s.seats[target].hp;
  const err = sanguosha.handleMove({ type: 'play', cardId: 'sha_test', targetIdx: target }, s, lord);
  assert.equal(err, null);
  assert.equal(s.seats[target].hp, hpBefore, 'no damage taken');
  const shanRemain = s.seats[target].hand.find(c => c.id === 'shan_test');
  assert.equal(shanRemain, undefined, '闪 is consumed');
});

// ── card play: 桃 ──

test('桃 heals 1 hp when damaged', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  s.phase = 'play';
  s.seats[lord].hp = 3;
  const tao = { id: 'tao_test', type: 'basic', name: '桃', suit: 'h', rank: 'A' };
  s.seats[lord].hand.push(tao);
  const err = sanguosha.handleMove({ type: 'play', cardId: 'tao_test' }, s, lord);
  assert.equal(err, null);
  assert.equal(s.seats[lord].hp, 4);
});

test('桃 rejected when at full hp', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  s.phase = 'play';
  const tao = { id: 'tao_test', type: 'basic', name: '桃', suit: 'h', rank: 'A' };
  s.seats[lord].hand.push(tao);
  const err = sanguosha.handleMove({ type: 'play', cardId: 'tao_test' }, s, lord);
  assert.equal(typeof err, 'string');
});

// ── damage / death ──

test('player dies when hp reaches 0', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  const target = (lord + 1) % 4;
  s.phase = 'play';
  s.seats[target].hp = 1;
  s.seats[target].hand = [];
  const sha = { id: 'sha_test', type: 'basic', name: '杀', suit: 'h', rank: 'A' };
  s.seats[lord].hand.push(sha);
  sanguosha.handleMove({ type: 'play', cardId: 'sha_test', targetIdx: target }, s, lord);
  assert.equal(s.seats[target].hp, 0);
  assert.equal(s.seats[target].dead, true);
});

// ── win detection ──

test('lord team wins when all rebels and traitor dead', () => {
  const s = makeState(4);
  s.seats.forEach(seat => {
    if (seat.role === 'rebel' || seat.role === 'traitor') {
      seat.hp = 0;
      seat.dead = true;
    }
  });
  sanguosha.checkWin(s);
  assert.equal(s.winner, 'lord');
});

test('rebels win when lord dies but rebels remain', () => {
  const s = makeState(4);
  s.seats.forEach(seat => {
    if (seat.role === 'lord') { seat.hp = 0; seat.dead = true; }
  });
  sanguosha.checkWin(s);
  assert.equal(s.winner, 'rebel');
});

test('traitor wins as sole survivor after lord dies last', () => {
  const s = makeState(4);
  const traitorIdx = s.seats.findIndex(seat => seat.role === 'traitor');
  s.seats.forEach((seat, i) => {
    if (i !== traitorIdx) { seat.hp = 0; seat.dead = true; }
  });
  sanguosha.checkWin(s);
  assert.equal(s.winner, 'traitor');
});

// ── playerView ──

test('playerView hides opponent hands and non-lord roles', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  const view = sanguosha.playerView(s, lord);
  assert.ok(view.myHand, 'myHand present');
  assert.ok(view.myHand.length > 0, 'lord sees own hand');
  // opponent hands hidden (empty), counts shown
  view.seats.forEach((vseat, i) => {
    if (i === lord) {
      assert.ok(vseat.hand.length > 0, 'own hand visible');
    } else {
      assert.equal(vseat.hand.length, 0, 'opponent hand hidden');
      assert.ok(vseat.handCount >= 0, 'hand count shown');
    }
  });
  // lord role visible to all, others hidden
  view.seats.forEach((vseat, i) => {
    const realRole = s.seats[i].role;
    if (realRole === 'lord' || i === lord) {
      assert.equal(vseat.role, realRole);
    } else {
      assert.equal(vseat.role, 'hidden');
    }
  });
});

test('playerView: non-lord sees own role and hand', () => {
  const s = makeState(4);
  chooseAll(s);
  const nonLord = s.seats.findIndex((seat, i) => i !== s.king.seat);
  const view = sanguosha.playerView(s, nonLord);
  assert.equal(view.seats[nonLord].role, s.seats[nonLord].role);
  assert.equal(view.seats[nonLord].hand.length, s.seats[nonLord].hand.length);
  assert.equal(view.myRole, s.seats[nonLord].role);
});

// ── guards ──

test('rejects move when not your turn', () => {
  const s = makeState(4);
  chooseAll(s);
  const lord = s.king.seat;
  const other = (lord + 1) % 4;
  const err = sanguosha.handleMove({ type: 'draw' }, s, other);
  assert.equal(typeof err, 'string');
});

test('rejects move after game over', () => {
  const s = makeState(4);
  s.winner = 'lord';
  const err = sanguosha.handleMove({ type: 'draw' }, s, s.currentPlayer);
  assert.equal(typeof err, 'string');
});
