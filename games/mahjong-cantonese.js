// games/mahjong-cantonese.js
// 广东麻将 / 鸡平胡 (Cantonese Mahjong)
// 136 tiles (WITH honours), chow only from upstream, no void, one winner ends round.
//
// State machine:
//   'play'  — currentPlayer has drawn, must discard (or self-draw win)
//   'claim' — a tile was discarded; eligible players may chow/pung/kong/win in turn order
//   'over'  — round ended (winner index, or -1 = 荒庄 draw game)

const core = require('./lib/mahjong-core');
const CANTONESE = core.CANTONESE;

exports.name = 'mahjong-cantonese';
exports.maxPlayers = 4;
exports.minPlayers = 2;

function nextPlayer(state, idx) {
  return (idx + 1) % state._playerCount;
}

function sortHand(hand) {
  core.sortTiles(hand);
}

// Count tiles in hand matching (k, n).
function countMatching(hand, k, n) {
  let c = 0;
  for (const t of hand) if (t.k === k && t.n === n) c++;
  return c;
}

// Find all valid chow pairs (each a [tile, tile]) from hand that form a sequence with `tile`.
function findChowPairs(hand, tile) {
  if (tile.k === 'feng' || tile.k === 'jian') return [];
  const k = tile.k, n = tile.n;
  const pairs = [];
  const has = (num) => hand.filter(t => t.k === k && t.n === num);
  // sequences: (n-2,n-1,n), (n-1,n,n+1), (n,n+1,n+2)
  const tryPair = (a, b) => {
    const ta = has(a), tb = has(b);
    if (ta.length && tb.length) pairs.push([ta[0], tb[0]]);
  };
  if (n - 2 >= 1) tryPair(n - 2, n - 1);
  if (n - 1 >= 1 && n + 1 <= 9) tryPair(n - 1, n + 1);
  if (n + 2 <= 9) tryPair(n + 1, n + 2);
  return pairs;
}

// Can `player` win by claiming `tile`? (hand + tile + melds = winning hand)
function canWinWith(state, player, tile) {
  const test = state.hands[player].slice();
  test.push(tile);
  return core.huCheck(test, state.melds[player], CANTONESE).win;
}

// Determine which claim types `player` can perform on `tile` (discarded by `discarder`).
function eligibleClaims(state, player, tile, discarder) {
  const claims = [];
  if (canWinWith(state, player, tile)) claims.push('win');
  if (countMatching(state.hands[player], tile.k, tile.n) >= 3) claims.push('kong');
  if (countMatching(state.hands[player], tile.k, tile.n) >= 2) claims.push('pung');
  // chow only from upstream (the player immediately after discarder)
  if (player === nextPlayer(state, discarder) && findChowPairs(state.hands[player], tile).length) claims.push('chow');
  return claims;
}

exports.createState = function () {
  return {
    phase: 'play',
    hands: [],          // concealed tiles per player
    melds: [],          // exposed melds per player: [{ type, tiles: [...], from }]
    discards: [],       // discard piles per player
    wall: [],           // remaining deck
    currentPlayer: 0,
    dealer: 0,
    hasDrawn: false,    // currentPlayer has drawn this turn
    lastDiscard: null,  // { tile, player }
    winner: null,       // player index, or -1 = 荒庄
    winInfo: null,      // { type, from, fan }
    claim: null,        // { tile, discarder, order: [players], idx, responses: {} }
  };
};

exports.initGame = function (state, playerCount) {
  state._playerCount = playerCount;
  const deck = core.buildDeck(CANTONESE);
  state.wall = deck;
  state.hands = [];
  state.melds = [];
  state.discards = [];
  for (let i = 0; i < playerCount; i++) {
    state.hands.push([]);
    state.melds.push([]);
    state.discards.push([]);
  }
  // deal 13 to each player
  for (let r = 0; r < 13; r++) {
    for (let i = 0; i < playerCount; i++) {
      state.hands[i].push(state.wall.pop());
    }
  }
  for (let i = 0; i < playerCount; i++) sortHand(state.hands[i]);
  state.dealer = 0;
  state.currentPlayer = 0;
  state.winner = null;
  state.winInfo = null;
  state.lastDiscard = null;
  state.claim = null;
  // dealer draws first tile
  beginTurn(state, 0);
};

// Draw a tile for `player` and set them as current. Handles wall exhaustion.
function beginTurn(state, player) {
  if (state.wall.length === 0) {
    state.phase = 'over';
    state.winner = -1; // 荒庄 — draw game, no winner
    state.hasDrawn = false;
    return;
  }
  const tile = state.wall.pop();
  state.hands[player].push(tile);
  sortHand(state.hands[player]);
  state.currentPlayer = player;
  state.hasDrawn = true;
  state.phase = 'play';
}

exports.handleMove = function (data, state, playerIndex) {
  if (state.winner !== null && state.winner !== undefined) return 'g_game_over';

  if (state.phase === 'play') {
    if (playerIndex !== state.currentPlayer) return 'g_not_your_turn';
    if (!state.hasDrawn) return 'mj_must_draw';
    const d = data || {};

    // self-draw win
    if (d.type === 'win') {
      const info = core.huCheck(state.hands[playerIndex], state.melds[playerIndex], CANTONESE);
      if (!info.win) return 'mj_not_winning';
      state.winner = playerIndex;
      var scoreInfo = scoreHand(state.hands[playerIndex], state.melds[playerIndex], info, true, state.wall.length);
      state.winInfo = { type: info.type, from: -1, fan: scoreInfo.fan, details: scoreInfo.details };
      // 买码：胡牌后从牌尾买牌加分
      var buyResult = buyTiles(state, playerIndex);
      if (buyResult.bonusFan > 0) {
        state.winInfo.fan += buyResult.bonusFan;
        state.winInfo.buyDetails = buyResult.details;
      }
      state.winInfo.buyTiles = buyResult.tiles;
      state.winInfo.buyFan = buyResult.bonusFan;
      state.phase = 'over';
      return null;
    }

    if (d.type === 'discard') {
      const tileId = d.tileId;
      const hand = state.hands[playerIndex];
      const idx = hand.findIndex(t => t.id === tileId);
      if (idx === -1) return 'mj_tile_not_in_hand';
      const tile = hand.splice(idx, 1)[0];
      tile._discardSeq = (state._discardCounter || 0);
      state._discardCounter = (state._discardCounter || 0) + 1;
      state.discards[playerIndex].push(tile);
      state.lastDiscard = { tile, player: playerIndex };
      state.hasDrawn = false;

      // build claim list: eligible players in turn order starting after discarder
      const order = [];
      for (let step = 1; step < state._playerCount; step++) {
        const p = (playerIndex + step) % state._playerCount;
        if (eligibleClaims(state, p, tile, playerIndex).length) order.push(p);
      }
      if (order.length === 0) {
        beginTurn(state, nextPlayer(state, playerIndex));
      } else {
        state.phase = 'claim';
        state.claim = { tile, discarder: playerIndex, order, idx: 0, responses: {} };
      }
      return null;
    }

    return 'mj_invalid_move';
  }

  if (state.phase === 'claim') {
    const claim = state.claim;
    const actor = claim.order[claim.idx];
    if (playerIndex !== actor) return 'g_not_your_turn';
    const d = data || {};
    const tile = claim.tile;

    if (d.type === 'pass') {
      claim.responses[playerIndex] = { type: 'pass' };
    } else if (d.type === 'chow') {
      const pairs = findChowPairs(state.hands[playerIndex], tile);
      if (!pairs.length) return 'mj_cannot_chow';
      // pick the pair matching requested tile ids, else first
      let pair = pairs[0];
      if (d.tiles) {
        const match = pairs.find(p => p.some(t => d.tiles.indexOf(t.id) >= 0));
        if (match) pair = match;
      }
      claim.responses[playerIndex] = { type: 'chow', tiles: pair };
    } else if (d.type === 'pung') {
      if (countMatching(state.hands[playerIndex], tile.k, tile.n) < 2) return 'mj_cannot_pung';
      claim.responses[playerIndex] = { type: 'pung' };
    } else if (d.type === 'kong') {
      if (countMatching(state.hands[playerIndex], tile.k, tile.n) < 3) return 'mj_cannot_kong';
      claim.responses[playerIndex] = { type: 'kong' };
    } else if (d.type === 'win') {
      if (!canWinWith(state, playerIndex, tile)) return 'mj_not_winning';
      claim.responses[playerIndex] = { type: 'win' };
    } else {
      return 'mj_invalid_claim';
    }

    claim.idx++;
    if (claim.idx >= claim.order.length) {
      resolveClaims(state);
    }
    return null;
  }

  return 'g_unknown_action';
};

// After all claimers respond, pick highest-priority claim (win > kong > pung > chow),
// tie-break by turn order (earlier in claim.order wins).
function resolveClaims(state) {
  const claim = state.claim;
  const tile = claim.tile;
  const priority = { win: 4, kong: 3, pung: 2, chow: 1 };
  let best = null;
  for (const p of claim.order) {
    const r = claim.responses[p];
    if (!r || r.type === 'pass') continue;
    if (!best || priority[r.type] > priority[best.type]) {
      best = r;
      best.player = p;
    }
  }

  state.claim = null;

  if (!best) {
    // everyone passed → next player draws
    beginTurn(state, nextPlayer(state, claim.discarder));
    return;
  }

  const p = best.player;

  if (best.type === 'win') {
    const test = state.hands[p].slice();
    test.push(tile);
    const info = core.huCheck(test, state.melds[p], CANTONESE);
    state.winner = p;
    var scoreInfo = scoreHand(test, state.melds[p], info, false, state.wall.length);
    state.winInfo = { type: info.type, from: claim.discarder, fan: scoreInfo.fan, details: scoreInfo.details };
    // 买码：胡牌后从牌尾买牌加分
    var buyResult = buyTiles(state, p);
    if (buyResult.bonusFan > 0) {
      state.winInfo.fan += buyResult.bonusFan;
      state.winInfo.buyDetails = buyResult.details;
    }
    state.winInfo.buyTiles = buyResult.tiles;
    state.winInfo.buyFan = buyResult.bonusFan;
    state.phase = 'over';
    return;
  }

  // form the meld
  const meld = { type: best.type, from: claim.discarder, tiles: [tile] };
  const hand = state.hands[p];

  if (best.type === 'chow') {
    const pair = best.tiles;
    for (const t of pair) {
      const i = hand.findIndex(x => x.id === t.id);
      if (i >= 0) { hand.splice(i, 1); meld.tiles.push(t); }
    }
    sortHand(meld.tiles);
  } else if (best.type === 'pung') {
    let need = 2;
    for (let i = hand.length - 1; i >= 0 && need > 0; i--) {
      if (hand[i].k === tile.k && hand[i].n === tile.n) {
        meld.tiles.push(hand.splice(i, 1)[0]);
        need--;
      }
    }
  } else if (best.type === 'kong') {
    let need = 3;
    for (let i = hand.length - 1; i >= 0 && need > 0; i--) {
      if (hand[i].k === tile.k && hand[i].n === tile.n) {
        meld.tiles.push(hand.splice(i, 1)[0]);
        need--;
      }
    }
  }
  state.melds[p].push(meld);

  // Remove the claimed tile from the discard pile so it no longer shows in the center.
  const discardPile = state.discards[claim.discarder];
  for (let di = discardPile.length - 1; di >= 0; di--) {
    if (discardPile[di].id === tile.id) { discardPile.splice(di, 1); break; }
  }

  // kong draws a replacement tile; chow/pung go straight to discard
  state.currentPlayer = p;
  if (best.type === 'kong') {
    if (state.wall.length === 0) {
      // no replacement available — still must discard; hand is short by one
      state.hasDrawn = true;
      state.phase = 'play';
      return;
    }
    const rep = state.wall.pop();
    state.hands[p].push(rep);
    sortHand(state.hands[p]);
  }
  state.hasDrawn = true;
  state.phase = 'play';
}

// Cantonese scoring wrapper.
//  - core honours-mode returns 清一色 = 4, but rules (and tutorial) = 8
//  - 平胡 = 1 is the base for a plain hand; 自摸 = +1 always stacks on top
//  - minimum winning hand = 1 fan
function scoreHand(hand, melds, winInfo, selfDraw, wallCount) {
  // Compute pattern fans WITHOUT self-draw (handled separately below).
  var result = core.countFanDetailed(hand, melds, winInfo, CANTONESE, {
    selfDraw: false,
    wallCount: wallCount || 0,
  });
  // 清一色: core honours-mode returns 4, but Cantonese rules = 8 (per tutorial)
  for (var i = 0; i < result.details.length; i++) {
    if (result.details[i].name === '清一色') { result.details[i].fan = 8; }
  }
  // Base: a plain hand with no pattern fans is 平胡 = 1
  if (result.fan === 0) { result.details.push({ name: '平胡', fan: 1 }); result.fan = 1; }
  // 自摸 always stacks as +1 on top of the base/pattern fans
  if (selfDraw) { result.details.push({ name: '自摸', fan: 1 }); result.fan += 1; }
  return result;
}

// 买码：胡牌后从牌尾买牌加分（花牌/字牌每张 +1 番）
function buyTiles(state, winnerIndex) {
  if (!state.wall || state.wall.length === 0) return { tiles: [], bonusFan: 0, details: [] };
  var count = Math.min(4, state.wall.length); // 买 4 张
  var bought = [];
  var bonusFan = 0;
  var details = [];
  for (var i = 0; i < count; i++) {
    var tile = state.wall.pop();
    bought.push(tile);
    if (tile.k === 'feng' || tile.k === 'jian') {
      bonusFan += 1;
      details.push(tile.k === 'feng' ? 'mj_buytile_wind' : 'mj_buytile_jian');
    }
  }
  return { tiles: bought, bonusFan: bonusFan, details: details };
}

// currentActor for bot scheduling: during claim, it's the current responder.
exports.getCurrentActor = function (state) {
  if (state.phase === 'claim' && state.claim) {
    return state.claim.order[state.claim.idx];
  }
  return state.currentPlayer;
};

exports.playerView = function (state, playerIndex) {
  return {
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    dealer: state.dealer,
    winner: state.winner,
    winInfo: state.winInfo,
    buyTiles: state.winInfo && state.winInfo.buyTiles ? state.winInfo.buyTiles.map(t => ({ k: t.k, n: t.n, id: t.id })) : null,
    buyFan: state.winInfo ? state.winInfo.buyFan || 0 : 0,
    hasDrawn: state.hasDrawn,
    // own hand: full tiles; others: count only
    hands: state.hands.map((h, i) => {
      if (i === playerIndex) return h.map(t => ({ k: t.k, n: t.n, id: t.id }));
      return h.length;
    }),
    melds: state.melds.map(m => m.map(md => ({
      type: md.type, from: md.from, tiles: md.tiles.map(t => ({ k: t.k, n: t.n, id: t.id })),
    }))),
    discards: state.discards.map(d => d.map(t => ({ k: t.k, n: t.n, id: t.id }))),
    wall: state.wall.length, // hide actual wall tiles
    lastDiscard: state.lastDiscard ? { tile: { k: state.lastDiscard.tile.k, n: state.lastDiscard.tile.n, id: state.lastDiscard.tile.id }, player: state.lastDiscard.player } : null,
    claim: state.claim ? {
      tile: { k: state.claim.tile.k, n: state.claim.tile.n, id: state.claim.tile.id },
      discarder: state.claim.discarder,
      order: state.claim.order.slice(),
      idx: state.claim.idx,
    } : null,
    _playerCount: state._playerCount,
  };
};
