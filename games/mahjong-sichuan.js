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
  _winSelfDraw: {},
  // Rule flags (read from state._options in initGame)
  _bloodBattle: true,
  _rain: false,
  _multiWinner: false,
  // Gang payment tracking: net points per player from 刮风下雨
  _gangScore: [],
  // Round-end penalty tracking (花猪/查大叫)
  _penalties: [],
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

  // Read Sichuan rule toggles from options (default: blood battle on, others off)
  const opt = state._options || {};
  state._bloodBattle = opt.mj_bloodBattle !== false; // default true
  state._rain = opt.mj_rain === true;
  state._multiWinner = opt.mj_multiWinner === true;

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
  state._winSelfDraw = {};
  state._gangScore = new Array(playerCount).fill(0);
  state._penalties = new Array(playerCount).fill(0);
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

// 一炮多响收尾：所有玩家响应完毕后，移除弃牌并推进
function finishMultiWinnerClaim(state, playerCount) {
  // 移除被胡的弃牌（只移除一张，即使多家胡）
  removeDiscard(state, state._lastDiscardFrom, state.lastDiscard ? state.lastDiscard.id : null);
  state._multiWinClaimants = [];
  // 推进：血战模式继续，非血战则已结束（registerWin 已设 over）
  if (state.phase === 'claim') {
    if (state.winners.length > 0 && state.deck.length === 0) {
      state.phase = 'over';
    } else if (!advanceTurn(state, playerCount)) {
      // deck empty → over
    }
  }
}

function registerWin(state, playerIndex) {
  if (!state.winners.includes(playerIndex)) state.winners.push(playerIndex);
  // 一炮多响模式：不立即推进，等所有玩家响应完毕
  if (state._multiWinner) {
    // 仅记录赢家，phase 推进由 finishMultiWinnerClaim 处理
    // 但如果非血战模式，最后一家胡了就直接结束
    if (!state._bloodBattle) {
      state.phase = 'over';
    }
    return;
  }
  // Non-blood-battle: one win ends the round immediately
  if (!state._bloodBattle) {
    state.phase = 'over';
    return;
  }
  // Blood battle: continue until 3 winners or deck empty
  if (state.winners.length >= 3 || state.deck.length === 0) {
    state.phase = 'over';
  } else {
    // 血战到底: 继续游戏。从胡牌者下一家开始，由下一家摸牌出牌。
    // 把 currentPlayer 设为胡牌家，advanceTurn 会跳过已胡牌的玩家。
    state.currentPlayer = playerIndex;
    advanceTurn(state, state.hands.length);
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
        // 一炮多响收尾：移除弃牌并推进
        if (state._multiWinner && state._multiWinClaimants && state._multiWinClaimants.length > 0) {
          finishMultiWinnerClaim(state, playerCount);
        } else if (state.winners.length > 0 && state.deck.length === 0) {
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
      // 把胡牌张加入手牌，保证计分（清一色/七对等）基于完整14张
      state.hands[playerIndex].push({ k: ld.k, n: ld.n, id: ld.id });
      sortTiles(state.hands[playerIndex]);
      state._winSelfDraw[playerIndex] = false;
      registerWin(state, playerIndex);

      if (state._multiWinner) {
        // 一炮多响: 不立即移除弃牌，允许其他玩家也胡这张牌
        state._claimPending = Math.max(0, state._claimPending - 1);
        // 记录已胡的玩家（用于后续移除弃牌）
        state._multiWinClaimants = state._multiWinClaimants || [];
        state._multiWinClaimants.push(playerIndex);
        if (state._claimPending <= 0) {
          // 所有玩家都已响应，移除弃牌并继续
          finishMultiWinnerClaim(state, playerCount);
        }
      } else {
        // 标准模式：移除弃牌，结束 claim 阶段
        removeDiscard(state, state._lastDiscardFrom, ld.id);
      }
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
      state._winSelfDraw[playerIndex] = true;
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
      state._multiWinClaimants = []; // 一炮多响：记录已胡玩家
      return null;
    }

    return 'mj_must_discard';
  }

  // 血战到底在 registerWin 里已自动推进到下一家（advanceTurn → phase 'play'），
  // 不再存在独立的 'win' 阶段。保留 cantonese 委托路径不会走到这里。

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
    _bloodBattle: state._bloodBattle,
    _rain: state._rain,
    _multiWinner: state._multiWinner,
    _gangScore: state._gangScore,
    _penalties: state._penalties,
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
  // 自摸：仅在摸牌时胡牌记一分。点炮（接炮）不记自摸分。
  var isSelfDraw = !!state._winSelfDraw[winnerIndex];

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
