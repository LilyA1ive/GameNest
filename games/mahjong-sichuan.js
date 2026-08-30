// games/mahjong-sichuan.js
// 四川麻将 (Sichuan Mahjong) — 血战到底, 定缺, 只碰不吃
// Uses the shared mahjong engine (games/lib/mahjong-core.js).

const core = require('./lib/mahjong-core');
const { SICHUAN, buildDeck, huCheck, sortTiles } = core;
const cantonese = require('./mahjong-cantonese');

exports.name = 'mahjong-sichuan';
exports.maxPlayers = 4;
exports.minPlayers = 2;

exports.createState = () => ({
  cfg: SICHUAN,
  deck: [],
  hands: [],
  melds: [],
  discards: [],
  currentPlayer: 0,
  phase: 'deal',
  voidSuit: [],
  drawn: null,
  lastDiscard: null,
  winner: null,
  winners: [],
  guessCount: [],
  _lastDiscardFrom: -1,
  _claimPending: 0,
  _variants: 'sichuan',
});

// Unified entry: room.game stays 'mahjong-sichuan', but the actual ruleset is
// chosen via state._options.mahjongMode (injected by server applyRuntimeState).
// mode === 'cantonese' → rebuild the state object in place (keep the reference)
// into the Cantonese structure; otherwise run the default Sichuan setup.
exports.initGame = function (state, playerCount) {
  const mode = state._options && state._options.mahjongMode;
  if (mode === 'cantonese') {
    switchToCantonese(state, playerCount);
    return;
  }

  const deck = buildDeck(SICHUAN);
  state.deck = deck;
  state.hands = [];
  state.melds = [];
  state.discards = [];
  state.voidSuit = new Array(playerCount).fill(undefined);
  state.winners = [];
  state.winner = null;
  state.drawn = null;
  state.lastDiscard = null;
  state._lastDiscardFrom = -1;
  state._claimPending = 0;
  state.guessCount = new Array(playerCount).fill(0);
  state.currentPlayer = 0;

  const hands = [];
  for (let i = 0; i < playerCount; i++) hands.push([]);
  // Deal round-robin: 13 each
  for (let r = 0; r < 13; r++) {
    for (let i = 0; i < playerCount; i++) {
      hands[i].push(deck.pop());
    }
  }
  // Dealer gets the 14th tile
  hands[0].push(deck.pop());

  for (let i = 0; i < playerCount; i++) {
    sortTiles(hands[i]);
    state.hands.push(hands[i]);
    state.melds.push([]);
    state.discards.push([]);
  }

  state.phase = 'void';
  state._variants = 'sichuan';
};

// Rebuild `state` in place into the Cantonese structure. Cannot reassign the
// reference (server holds room.state), so we clear all keys then copy the
// Cantonese createState()/initGame() output. Runtime meta-fields injected by
// applyRuntimeState (_options/_realPlayerCount/_hasBots/_lang) are preserved so
// server logic that reads them later keeps working.
function switchToCantonese(state, playerCount) {
  const options = state._options;
  const realPlayerCount = state._realPlayerCount;
  const hasBots = state._hasBots;
  const lang = state._lang;
  for (const k in state) delete state[k];
  Object.assign(state, cantonese.createState());
  if (options !== undefined) state._options = options;
  if (realPlayerCount !== undefined) state._realPlayerCount = realPlayerCount;
  if (hasBots !== undefined) state._hasBots = hasBots;
  if (lang !== undefined) state._lang = lang;
  cantonese.initGame(state, playerCount);
  state._variants = 'cantonese';
}

function validSuits() {
  return SICHUAN.suits || ['wan', 'tong', 'tiao'];
}

function findTileIndex(hand, tileId) {
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].id === tileId) return i;
  }
  return -1;
}

// Count tiles of a given suit in a hand
function countSuit(hand, suit) {
  let c = 0;
  for (const t of hand) if (t.k === suit) c++;
  return c;
}

// After void chosen by all: dealer (0) begins play, already holding 14.
function startPlayAfterVoid(state) {
  state.phase = 'play';
  state.currentPlayer = 0;
  state.drawn = null;
}

// Advance to next non-winner player's turn: draw a tile, enter play phase.
function advanceTurn(state, playerCount) {
  let next = (state.currentPlayer + 1) % playerCount;
  let guard = 0;
  while (state.winners.includes(next) && guard < playerCount) {
    next = (next + 1) % playerCount;
    guard++;
  }
  if (state.deck.length === 0) {
    // pool empty -> game over
    state.phase = 'over';
    return false;
  }
  const tile = state.deck.pop();
  state.hands[next].push(tile);
  sortTiles(state.hands[next]);
  state.drawn = tile.id;
  state.currentPlayer = next;
  state.phase = 'play';
  state.lastDiscard = null;
  state._lastDiscardFrom = -1;
  return true;
}

// Check whether player has discarded all void-suit tiles (required to win)
function voidSatisfied(state, playerIndex) {
  const vs = state.voidSuit[playerIndex];
  if (!vs) return true; // no void chosen yet (shouldn't happen pre-win)
  return countSuit(state.hands[playerIndex], vs) === 0;
}

function checkWin(state, playerIndex, extraTile) {
  const hand = state.hands[playerIndex];
  const tiles = extraTile ? hand.concat([extraTile]) : hand;
  const res = huCheck(tiles, state.melds[playerIndex], SICHUAN);
  return res && res.win ? res : null;
}

function registerWin(state, playerIndex) {
  if (!state.winners.includes(playerIndex)) state.winners.push(playerIndex);
  if (state.winners.length >= 3) {
    state.phase = 'over';
  } else if (state.deck.length === 0) {
    state.phase = 'over';
  } else {
    // blood battle: continue. phase stays 'win' until next claim/draw.
    state.phase = 'win';
  }
}

exports.handleMove = function (data, state, playerIndex) {
  if (state._variants === 'cantonese') return cantonese.handleMove(data, state, playerIndex);

  const playerCount = state.hands.length;

  if (!data || !data.type) return 'g_bad_move';

  // ---- Void phase ----
  if (state.phase === 'void') {
    if (data.type !== 'void') return 'mj_choose_void';
    if (state.currentPlayer !== playerIndex) return 'g_not_your_turn';
    const suit = data.suit;
    if (!validSuits().includes(suit)) return 'mj_bad_void_suit';
    state.voidSuit[playerIndex] = suit;
    // If all players have chosen, start play; otherwise advance to next unchosen.
    if (state.voidSuit.every(v => v !== undefined)) {
      startPlayAfterVoid(state);
    } else {
      let next = (playerIndex + 1) % playerCount;
      while (state.voidSuit[next] !== undefined) {
        next = (next + 1) % playerCount;
      }
      state.currentPlayer = next;
    }
    return null;
  }

  // ---- Claim phase (after a discard) ----
  if (state.phase === 'claim') {
    const ld = state.lastDiscard;
    if (!ld) { state.phase = 'play'; }

    if (data.type === 'pass') {
      state._claimPending = Math.max(0, state._claimPending - 1);
      if (state._claimPending <= 0) {
        // No claimants left; if a winner was registered during blood battle, handle
        if (state.winners.length > 0 && state.deck.length === 0) {
          state.phase = 'over';
        } else if (!advanceTurn(state, playerCount)) {
          return null;
        }
      }
      return null;
    }

    if (data.type === 'win') {
      // Win by discard (点炮): the claimant takes ld as winning tile
      if (!voidSatisfied(state, playerIndex)) return 'mj_void_not_satisfied';
      const info = checkWin(state, playerIndex, ld);
      if (!info) return 'mj_not_winning';
      // remove the claimed discard from its owner's discard pile
      removeDiscard(state, state._lastDiscardFrom, ld.id);
      registerWin(state, playerIndex);
      return null;
    }

    if (data.type === 'pung') {
      if (!canPung(state, playerIndex)) return 'mj_cannot_pung';
      // remove 2 matching tiles from hand, form meld, take discard
      const suit = ld.k, num = ld.n;
      removeTileFromHand(state, playerIndex, suit, num);
      removeTileFromHand(state, playerIndex, suit, num);
      removeDiscard(state, state._lastDiscardFrom, ld.id);
      state.melds[playerIndex].push({ type: 'pung', tile: { k: suit, n: num }, tiles: [ld] });
      state.currentPlayer = playerIndex;
      state.phase = 'play';
      state.drawn = null;
      state.lastDiscard = null;
      state._claimPending = 0;
      return null;
    }

    if (data.type === 'kong') {
      if (!canKong(state, playerIndex)) return 'mj_cannot_kong';
      const suit = ld.k, num = ld.n;
      removeTileFromHand(state, playerIndex, suit, num);
      removeTileFromHand(state, playerIndex, suit, num);
      removeTileFromHand(state, playerIndex, suit, num);
      removeDiscard(state, state._lastDiscardFrom, ld.id);
      state.melds[playerIndex].push({ type: 'kong', tile: { k: suit, n: num }, tiles: [ld] });
      // Kong draws a replacement tile
      if (state.deck.length > 0) {
        const rep = state.deck.pop();
        state.hands[playerIndex].push(rep);
        sortTiles(state.hands[playerIndex]);
        state.drawn = rep.id;
      }
      state.currentPlayer = playerIndex;
      state.phase = 'play';
      state.lastDiscard = null;
      state._claimPending = 0;
      return null;
    }

    return 'mj_bad_claim';
  }

  // ---- Play phase (current player must discard) ----
  if (state.phase === 'play') {
    if (state.currentPlayer !== playerIndex) return 'g_not_your_turn';

    if (data.type === 'win') {
      // Self-draw (自摸): winning hand already in hand
      if (!voidSatisfied(state, playerIndex)) return 'mj_void_not_satisfied';
      const info = checkWin(state, playerIndex, null);
      if (!info) return 'mj_not_winning';
      registerWin(state, playerIndex);
      return null;
    }

    if (data.type === 'discard') {
      const tileId = data.tileId;
      const idx = findTileIndex(state.hands[playerIndex], tileId);
      if (idx < 0) return 'mj_tile_not_in_hand';
      const tile = state.hands[playerIndex].splice(idx, 1)[0];
      tile._discardSeq = (state._discardCounter || 0);
      state._discardCounter = (state._discardCounter || 0) + 1;
      state.discards[playerIndex].push(tile);
      state.lastDiscard = tile;
      state._lastDiscardFrom = playerIndex;
      state.drawn = null;
      // Enter claim phase: other players may pung/kong/win
      state.phase = 'claim';
      state._claimPending = playerCount - 1;
      return null;
    }

    return 'mj_must_discard';
  }

  // ---- Win (blood battle continuation) ----
  if (state.phase === 'win') {
    // After a win in blood battle, play resumes with next player drawing.
    // For simplicity, treat like play phase once a tile is drawn.
    if (state.currentPlayer !== playerIndex) return 'g_not_your_turn';
    if (data.type === 'win') {
      if (!voidSatisfied(state, playerIndex)) return 'mj_void_not_satisfied';
      const info = checkWin(state, playerIndex, null);
      if (!info) return 'mj_not_winning';
      registerWin(state, playerIndex);
      return null;
    }
    if (data.type === 'discard') {
      const tileId = data.tileId;
      const idx = findTileIndex(state.hands[playerIndex], tileId);
      if (idx < 0) return 'mj_tile_not_in_hand';
      const tile = state.hands[playerIndex].splice(idx, 1)[0];
      state.discards[playerIndex].push(tile);
      state.lastDiscard = tile;
      state._lastDiscardFrom = playerIndex;
      state.drawn = null;
      state.phase = 'claim';
      state._claimPending = playerCount - 1;
      return null;
    }
    return 'mj_must_discard';
  }

  if (state.phase === 'over') return 'g_game_over';

  return 'g_bad_move';
};

function removeTileFromHand(state, playerIndex, suit, num) {
  const hand = state.hands[playerIndex];
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].k === suit && hand[i].n === num) {
      hand.splice(i, 1);
      return true;
    }
  }
  return false;
}

function removeDiscard(state, playerIndex, tileId) {
  if (playerIndex < 0) return;
  const pile = state.discards[playerIndex];
  for (let i = 0; i < pile.length; i++) {
    if (pile[i].id === tileId) { pile.splice(i, 1); return; }
  }
}

function canPung(state, playerIndex) {
  const ld = state.lastDiscard;
  if (!ld) return false;
  if (state.winners.includes(playerIndex)) return false;
  let c = 0;
  for (const tile of state.hands[playerIndex]) {
    if (tile.k === ld.k && tile.n === ld.n) c++;
  }
  return c >= 2;
}

function canKong(state, playerIndex) {
  const ld = state.lastDiscard;
  if (!ld) return false;
  if (state.winners.includes(playerIndex)) return false;
  let c = 0;
  for (const tile of state.hands[playerIndex]) {
    if (tile.k === ld.k && tile.n === ld.n) c++;
  }
  return c >= 3;
}

// Per-player view: hide opponent hand tiles (show count only); reveal melds/discards/void/winners.
exports.playerView = function (state, playerIndex) {
  if (state._variants === 'cantonese') return cantonese.playerView(state, playerIndex);

  const hands = state.hands.map((hand, i) => {
    if (i === playerIndex) return hand;
    // hidden: array of placeholder tiles (count preserved)
    return hand.map(() => ({ k: undefined, n: undefined, id: undefined }));
  });
  return {
    cfg: state.cfg,
    deck: state.deck,
    hands,
    melds: state.melds,
    discards: state.discards,
    currentPlayer: state.currentPlayer,
    phase: state.phase,
    voidSuit: state.voidSuit,
    drawn: state.drawn,
    lastDiscard: state.lastDiscard,
    winner: state.winner,
    winners: state.winners,
    guessCount: state.guessCount,
    deckCount: state.deck.length,
  };
};

// Current actor for bot scheduling. Cantonese exposes its own (claim responder);
// Sichuan uses the plain currentPlayer (default behaviour).
exports.getCurrentActor = function (state) {
  if (state._variants === 'cantonese') return cantonese.getCurrentActor(state);
  return state.currentPlayer;
};

// server.js skipDisconnectedTurn calls setCurrentActor when a game exposes
// getCurrentActor. Sichuan advances plain currentPlayer; Cantonese has no
// setCurrentActor (matches standalone Cantonese, which also skips on disconnect).
exports.setCurrentActor = function (state, candidate) {
  if (state._variants === 'cantonese') return;
  state.currentPlayer = candidate;
};

// ---- Scoring (四川麻将完整番种) ----

function countGens(hand, melds) {
  // 根：手中有4张相同的牌（未杠出来的）
  var counts = {};
  for (var i = 0; i < hand.length; i++) {
    var key = hand[i].k + ':' + hand[i].n;
    counts[key] = (counts[key] || 0) + 1;
  }
  var gens = 0;
  for (var k in counts) if (counts[k] === 4) gens++;
  return gens;
}

function calculateScore(state, winnerIndex) {
  var hand = state.hands[winnerIndex];
  var melds = state.melds[winnerIndex];
  var winInfo = core.huCheck(hand, melds, SICHUAN);
  var isSelfDraw = (state._lastDiscardFrom !== winnerIndex);

  var result = core.countFanDetailed(hand, melds, winInfo, SICHUAN, {
    selfDraw: isSelfDraw,
    wallCount: state.deck.length,
    gangShangHua: false,
  });

  // 刮风/杠加分
  var gangFan = 0;
  for (var m = 0; m < melds.length; m++) {
    if (melds[m].type === 'kong') {
      gangFan += melds[m].from !== undefined ? 3 : 2;
    }
  }
  if (gangFan > 0) result.details.push({ name: '杠', fan: gangFan });
  result.fan += gangFan;

  // 根
  var genFan = countGens(hand, melds);
  if (genFan > 0) {
    result.details.push({ name: '根', fan: genFan });
    result.fan += genFan;
  }

  return result;
}

exports.calculateScore = calculateScore;
