// games/sanguosha.js
// 三国杀·身份局 (Sanguosha Identity Mode) — LAN multiplayer MVP
//
// Roles: 主公(lord) / 忠臣(loyalist) / 反贼(rebel) / 内奸(traitor)
// Turn: draw (2 cards) -> play -> discard (down to hp) -> next player
// Win:  lord+loyalist win when all rebels+traitor dead
//        rebels win when lord dies (while any rebel lives)
//        traitor wins as sole survivor after lord dies last

const SUITS = ['s', 'h', 'c', 'd']; // ♠♥♣♦
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Card definitions: name, type, count, optional sub (weapon/armor)
const CARD_DEFS = [
  { name: '杀', type: 'basic', count: 15 },
  { name: '闪', type: 'basic', count: 10 },
  { name: '桃', type: 'basic', count: 8 },
  { name: '酒', type: 'basic', count: 3 },
  { name: '过河拆桥', type: 'trick', count: 4 },
  { name: '顺手牵羊', type: 'trick', count: 4 },
  { name: '决斗', type: 'trick', count: 3 },
  { name: '无中生有', type: 'trick', count: 4 },
  { name: '南蛮入侵', type: 'trick', count: 3 },
  { name: '万箭齐发', type: 'trick', count: 2 },
  { name: '桃园结义', type: 'trick', count: 2 },
  { name: '诸葛连弩', type: 'equip', count: 1, sub: 'weapon' },
  { name: '仁王盾', type: 'equip', count: 1, sub: 'armor' },
  { name: '八卦阵', type: 'equip', count: 1, sub: 'armor' },
];

const GENERALS = [
  '刘备', '曹操', '孙权', '关羽', '张飞', '赵云', '诸葛亮',
  '周瑜', '吕布', '貂蝉', '司马懿', '黄盖', '马超', '甘宁',
];

exports.name = 'sanguosha';
exports.maxPlayers = 8;
exports.minPlayers = 4;

// ── helpers ──

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function buildDeck() {
  const deck = [];
  let id = 0;
  let si = 0, ri = 0;
  for (const def of CARD_DEFS) {
    for (let k = 0; k < def.count; k++) {
      deck.push({
        id: 'c' + (id++),
        type: def.type,
        name: def.name,
        suit: SUITS[si % 4],
        rank: RANKS[ri % 13],
        sub: def.sub || null,
      });
      si++; ri++;
    }
  }
  return deck;
}

function drawCards(state, playerIndex, count) {
  const seat = state.seats[playerIndex];
  for (let i = 0; i < count; i++) {
    if (state.heap.length === 0) {
      if (state.discard.length === 0) break;
      state.heap = shuffle(state.discard);
      state.discard = [];
    }
    seat.hand.push(state.heap.pop());
  }
}

function consumeCard(seat, cardIdx, state) {
  const card = seat.hand.splice(cardIdx, 1)[0];
  state.discard.push(card);
  return card;
}

function circularDist(n, a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, n - d);
}

function shaLimit(seat) {
  if (seat.equip.weapon && seat.equip.weapon.name === '诸葛连弩') return Infinity;
  return 1;
}

// Draw the top card for judgment (e.g. 八卦阵), discard it, return it.
function judgeTop(state) {
  if (state.heap.length === 0) {
    if (state.discard.length === 0) return null;
    state.heap = shuffle(state.discard);
    state.discard = [];
  }
  const card = state.heap.pop();
  state.discard.push(card);
  return card;
}

function dealDamage(state, targetIdx, amount, sourceIdx) {
  const target = state.seats[targetIdx];
  if (target.dead) return;
  target.hp -= amount;
  if (target.hp <= 0) {
    target.hp = 0;
    target.dead = true;
    state.discard.push(...target.hand.splice(0));
    if (target.equip.weapon) state.discard.push(target.equip.weapon);
    if (target.equip.armor) state.discard.push(target.equip.armor);
    target.equip.weapon = null;
    target.equip.armor = null;
    if (sourceIdx != null) checkWin(state);
  }
}

// Resolve a 杀 against target: armor checks -> 闪 dodge -> damage.
function resolveSha(state, playerIndex, targetIdx, card, damage) {
  const target = state.seats[targetIdx];
  // 仁王盾: blocks black (spade/club) 杀
  if (target.equip.armor && target.equip.armor.name === '仁王盾' &&
      (card.suit === 's' || card.suit === 'c')) {
    return;
  }
  // 八卦阵: judge top card, red = dodge
  if (target.equip.armor && target.equip.armor.name === '八卦阵') {
    const judged = judgeTop(state);
    if (judged && (judged.suit === 'h' || judged.suit === 'd')) return;
  }
  // 闪 dodge
  const shanIdx = target.hand.findIndex(c => c.name === '闪');
  if (shanIdx !== -1) {
    const shan = target.hand.splice(shanIdx, 1)[0];
    state.discard.push(shan);
    return;
  }
  dealDamage(state, targetIdx, damage, playerIndex);
}

function assignRoles(n) {
  let rebels, loyalists;
  if (n === 4) { rebels = 1; loyalists = 1; }
  else if (n === 5) { rebels = 2; loyalists = 1; }
  else {
    const rest = n - 2;
    rebels = Math.ceil(rest / 2);
    loyalists = rest - rebels;
  }
  const roles = ['lord', 'traitor'];
  for (let i = 0; i < rebels; i++) roles.push('rebel');
  for (let i = 0; i < loyalists; i++) roles.push('loyalist');
  return shuffle(roles);
}

function pickGenerals(n) {
  const pool = shuffle(GENERALS.slice());
  return pool.slice(0, n);
}

function endTurn(state) {
  const seat = state.seats[state.currentPlayer];
  seat.shaUsed = 0;
  seat.wine = false;
  const n = state.seats.length;
  let next = state.currentPlayer;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (!state.seats[next].dead) break;
  }
  state.currentPlayer = next;
  state.phase = 'draw';
  state.turn++;
}

// ── card play ──

function playCard(state, playerIndex, cardId, targetIdx) {
  const seat = state.seats[playerIndex];
  const cardIdx = seat.hand.findIndex(c => c.id === cardId);
  if (cardIdx === -1) return 'sgs_card_not_found';
  const card = seat.hand[cardIdx];

  if (card.type === 'equip') return equipCard(state, playerIndex, card, cardIdx);

  switch (card.name) {
    case '杀': return playSha(state, playerIndex, card, cardIdx, targetIdx);
    case '桃': return playTao(state, playerIndex, card, cardIdx);
    case '酒': return playJiu(state, playerIndex, card, cardIdx);
    case '过河拆桥': return playDismantle(state, playerIndex, card, cardIdx, targetIdx);
    case '顺手牵羊': return playSnatch(state, playerIndex, card, cardIdx, targetIdx);
    case '决斗': return playDuel(state, playerIndex, card, cardIdx, targetIdx);
    case '无中生有': return playExNihilo(state, playerIndex, card, cardIdx);
    case '南蛮入侵': return playBarbarian(state, playerIndex, card, cardIdx);
    case '万箭齐发': return playArrows(state, playerIndex, card, cardIdx);
    case '桃园结义': return playPeachGarden(state, playerIndex, card, cardIdx);
    default: return 'sgs_unknown_card';
  }
}

function equipCard(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  consumeCard(seat, cardIdx, state);
  const slot = card.sub; // 'weapon' | 'armor'
  const old = seat.equip[slot];
  if (old) state.discard.push(old);
  seat.equip[slot] = card;
  return null;
}

function playSha(state, playerIndex, card, cardIdx, targetIdx) {
  const seat = state.seats[playerIndex];
  if (seat.shaUsed >= shaLimit(seat)) return 'sgs_sha_limit';
  if (targetIdx == null) return 'sgs_need_target';
  const target = state.seats[targetIdx];
  if (!target || target.dead) return 'sgs_target_dead';
  if (targetIdx === playerIndex) return 'sgs_target_self';
  const range = 1; // MVP: base range 1 (crossbow extends count, not range)
  if (circularDist(state.seats.length, playerIndex, targetIdx) > range) return 'sgs_out_of_range';
  consumeCard(seat, cardIdx, state);
  seat.shaUsed++;
  let damage = 1;
  if (seat.wine) { damage = 2; seat.wine = false; }
  resolveSha(state, playerIndex, targetIdx, card, damage);
  return null;
}

function playTao(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  if (seat.hp >= seat.maxHp) return 'sgs_full_hp';
  consumeCard(seat, cardIdx, state);
  seat.hp++;
  return null;
}

function playJiu(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  if (seat.wine) return 'sgs_wine_used';
  consumeCard(seat, cardIdx, state);
  seat.wine = true;
  return null;
}

function playDismantle(state, playerIndex, card, cardIdx, targetIdx) {
  const seat = state.seats[playerIndex];
  if (targetIdx == null) return 'sgs_need_target';
  const target = state.seats[targetIdx];
  if (!target || target.dead || targetIdx === playerIndex) return 'sgs_invalid_target';
  consumeCard(seat, cardIdx, state);
  if (target.hand.length > 0) {
    const c = target.hand.splice(0, 1)[0];
    state.discard.push(c);
  }
  return null;
}

function playSnatch(state, playerIndex, card, cardIdx, targetIdx) {
  const seat = state.seats[playerIndex];
  if (targetIdx == null) return 'sgs_need_target';
  const target = state.seats[targetIdx];
  if (!target || target.dead || targetIdx === playerIndex) return 'sgs_invalid_target';
  const range = 1;
  if (circularDist(state.seats.length, playerIndex, targetIdx) > range) return 'sgs_out_of_range';
  consumeCard(seat, cardIdx, state);
  if (target.hand.length > 0) {
    const c = target.hand.splice(0, 1)[0];
    seat.hand.push(c);
  }
  return null;
}

function playDuel(state, playerIndex, card, cardIdx, targetIdx) {
  const seat = state.seats[playerIndex];
  if (targetIdx == null) return 'sgs_need_target';
  const target = state.seats[targetIdx];
  if (!target || target.dead || targetIdx === playerIndex) return 'sgs_invalid_target';
  consumeCard(seat, cardIdx, state);
  // Simplified: target takes 1 undodgeable damage
  dealDamage(state, targetIdx, 1, playerIndex);
  return null;
}

function playExNihilo(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  consumeCard(seat, cardIdx, state);
  drawCards(state, playerIndex, 2);
  return null;
}

function playBarbarian(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  consumeCard(seat, cardIdx, state);
  for (let i = 0; i < state.seats.length; i++) {
    if (i === playerIndex) continue;
    const other = state.seats[i];
    if (other.dead) continue;
    if (state.winner) break; // game already decided; stop resolving
    const shaIdx = other.hand.findIndex(c => c.name === '杀');
    if (shaIdx !== -1) {
      const c = other.hand.splice(shaIdx, 1)[0];
      state.discard.push(c);
    } else {
      dealDamage(state, i, 1, playerIndex);
    }
  }
  return null;
}

function playArrows(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  consumeCard(seat, cardIdx, state);
  for (let i = 0; i < state.seats.length; i++) {
    if (i === playerIndex) continue;
    const other = state.seats[i];
    if (other.dead) continue;
    if (state.winner) break; // game already decided; stop resolving
    const shanIdx = other.hand.findIndex(c => c.name === '闪');
    if (shanIdx !== -1) {
      const c = other.hand.splice(shanIdx, 1)[0];
      state.discard.push(c);
    } else {
      dealDamage(state, i, 1, playerIndex);
    }
  }
  return null;
}

function playPeachGarden(state, playerIndex, card, cardIdx) {
  const seat = state.seats[playerIndex];
  consumeCard(seat, cardIdx, state);
  for (const s of state.seats) {
    if (!s.dead && s.hp < s.maxHp) s.hp++;
  }
  return null;
}

// ── win detection ──

function checkWin(state) {
  const lord = state.seats.find(s => s.role === 'lord');
  if (lord.dead) {
    const alive = state.seats.filter(s => !s.dead);
    if (alive.length === 1 && alive[0].role === 'traitor') {
      state.winner = 'traitor';
    } else if (state.seats.some(s => s.role === 'rebel' && !s.dead)) {
      state.winner = 'rebel';
    }
    // else: lord dead but only loyalist(s)+traitor remain and no rebel —
    // game continues; the traitor must still be the last survivor to win.
    return state.winner;
  }
  const rebelsAlive = state.seats.some(s => s.role === 'rebel' && !s.dead);
  const traitorAlive = state.seats.some(s => s.role === 'traitor' && !s.dead);
  if (!rebelsAlive && !traitorAlive) state.winner = 'lord';
  return state.winner;
}

// ── exports ──

exports.createState = function() {
  return {
    heap: [],
    discard: [],
    seats: [],
    turn: 0,
    phase: 'choosing',
    winner: null,
    king: {},
    candidateGenerals: [],
    currentPlayer: 0,
  };
};

exports.initGame = function(state, playerCount) {
  const roles = assignRoles(playerCount);
  // Each player gets 3 distinct candidate generals (players may share between each other).
  state.candidateGenerals = [];
  for (let i = 0; i < playerCount; i++) {
    state.candidateGenerals.push(pickGenerals(3));
  }
  state.seats = [];
  for (let i = 0; i < playerCount; i++) {
    const isLord = roles[i] === 'lord';
    state.seats.push({
      role: roles[i],
      general: null, // chosen in the choosing phase
      chosen: false,
      hp: isLord ? 5 : 4,
      maxHp: isLord ? 5 : 4,
      hand: [],
      equip: { weapon: null, armor: null },
      judging: [],
      chain: false,
      dead: false,
      seatIndex: i,
      shaUsed: 0,
      wine: false,
    });
  }
  const lordIdx = roles.indexOf('lord');
  state.king = { seat: lordIdx, general: null };
  state.heap = shuffle(buildDeck());
  state.discard = [];
  // Choosing phase: no turn owner, no starting hand yet.
  state.currentPlayer = -1;
  state.phase = 'choosing';
  state.winner = null;
  state.turn = 0;
};

exports.handleMove = function(data, state, playerIndex) {
  if (state.winner !== null) return 'g_game_over';

  // choosing phase (before the turn check: currentPlayer is -1 during choosing)
  if (state.phase === 'choosing') {
    if (!data || data.type !== 'select_general') return 'sgs_invalid_move';
    const seat = state.seats[playerIndex];
    if (!seat) return 'sgs_seat_missing';
    if (seat.chosen) return 'sgs_already_chosen';
    const general = data.general;
    const candidates = state.candidateGenerals[playerIndex] || [];
    if (candidates.indexOf(general) === -1) return 'sgs_invalid_general';
    seat.general = general;
    seat.chosen = true;
    // Once everyone has chosen, deal the starting hands and begin with the lord.
    if (state.seats.every(s => s.chosen)) {
      for (let i = 0; i < state.seats.length; i++) drawCards(state, i, 4);
      const lordIdx = state.king.seat;
      state.currentPlayer = lordIdx;
      state.phase = 'draw';
      state.king.general = state.seats[lordIdx].general;
    }
    return null;
  }

  if (playerIndex !== state.currentPlayer) return 'g_not_your_turn';

  // draw phase
  if (state.phase === 'draw') {
    if (data && (data.type === 'draw' || data.draw)) {
      drawCards(state, playerIndex, 2);
      state.phase = 'play';
      return null;
    }
    return 'sgs_draw_first';
  }

  // play phase
  if (state.phase === 'play') {
    if (data && (data.type === 'end' || data.pass)) {
      state.phase = 'discard';
      return null;
    }
    if (data && data.type === 'play') {
      return playCard(state, playerIndex, data.cardId, data.targetIdx);
    }
    return 'sgs_invalid_move';
  }

  // discard phase
  if (state.phase === 'discard') {
    const seat = state.seats[playerIndex];
    const excess = seat.hand.length - seat.hp;
    if (data && data.type === 'discard') {
      if (!Array.isArray(data.cardIds) || data.cardIds.length !== excess) {
        return 'sgs_discard_count';
      }
      // verify all cards are in hand
      const handIds = {};
      for (const c of seat.hand) handIds[c.id] = (handIds[c.id] || 0) + 1;
      for (const id of data.cardIds) {
        if (!handIds[id]) return 'sgs_card_not_found';
        handIds[id]--;
      }
      // Remove the specified cards from hand, push them to discard
      const toRemove = data.cardIds.slice();
      const removed = [];
      seat.hand = seat.hand.filter(c => {
        const idx = toRemove.indexOf(c.id);
        if (idx !== -1) { toRemove.splice(idx, 1); removed.push(c); return false; }
        return true;
      });
      state.discard.push(...removed);
      endTurn(state);
      return null;
    }
    // 'end' or anything else: only allowed when no discard needed
    if (excess > 0) return 'sgs_must_discard';
    endTurn(state);
    return null;
  }

  return 'sgs_invalid_phase';
};

exports.checkWin = checkWin;

exports.playerView = function(state, playerIndex) {
  return {
    heap: state.heap.length,
    discard: state.discard.length,
    seats: state.seats.map((seat, i) => {
      const isSelf = i === playerIndex;
      const isLord = seat.role === 'lord';
      return {
        seatIndex: seat.seatIndex,
        role: (isLord || isSelf) ? seat.role : 'hidden',
        general: seat.general,
        chosen: seat.chosen,
        hp: seat.hp,
        maxHp: seat.maxHp,
        hand: isSelf ? seat.hand : [],
        handCount: seat.hand.length,
        equip: seat.equip,
        dead: seat.dead,
        chain: seat.chain,
        shaUsed: isSelf ? seat.shaUsed : undefined,
        wine: isSelf ? seat.wine : undefined,
      };
    }),
    turn: state.turn,
    phase: state.phase,
    winner: state.winner,
    king: state.king,
    currentPlayer: state.currentPlayer,
    candidateGenerals: state.candidateGenerals[playerIndex] || [],
    myHand: state.seats[playerIndex] ? state.seats[playerIndex].hand : [],
    myRole: state.seats[playerIndex] ? state.seats[playerIndex].role : null,
  };
};
