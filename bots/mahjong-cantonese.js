// bots/mahjong-cantonese.js — AI for Cantonese Mahjong (鸡平胡)
// Strategy: keep tiles that connect toward a winning hand, discard isolated tiles.
// In claim phase: win if possible, else pung/kong number tiles, chow when beneficial.

const { botName } = require('./lib/bot-name');
const core = require('../games/lib/mahjong-core');
const CANTONESE = core.CANTONESE;

exports.name = 'mahjong-cantonese';

// Count tiles in hand matching (k, n).
function matchCount(hand, k, n) {
  let c = 0;
  for (const t of hand) if (t.k === k && t.n === n) c++;
  return c;
}

// Connectivity score: how many tiles in hand are "useful" alongside this tile.
// Higher = more connected = keep. Honours with no pair score low (dump first).
function connectivity(hand, tile) {
  if (tile.k === 'feng' || tile.k === 'jian') {
    const m = matchCount(hand, tile.k, tile.n);
    if (m >= 3) return 6;     // triple → kong candidate
    if (m === 2) return 4;    // pair → keep (could be the pair / pung)
    return 1;                 // single honour → dump
  }
  let score = 0;
  const k = tile.k, n = tile.n;
  // duplicates
  const dup = matchCount(hand, k, n);
  if (dup >= 3) score += 6;
  else if (dup === 2) score += 4;
  // sequence neighbors (within ±2)
  for (let d = -2; d <= 2; d++) {
    if (d === 0) continue;
    const nn = n + d;
    if (nn < 1 || nn > 9) continue;
    if (matchCount(hand, k, nn)) score += (Math.abs(d) === 1 ? 2 : 1);
  }
  return score;
}

// Find the best chow pair for `tile`: the pair whose removal leaves the best hand.
function bestChowPair(hand, tile) {
  if (tile.k === 'feng' || tile.k === 'jian') return null;
  const k = tile.k, n = tile.n;
  const pairs = [];
  const has = (num) => hand.filter(t => t.k === k && t.n === num);
  const tryPair = (a, b) => {
    const ta = has(a), tb = has(b);
    if (ta.length && tb.length) pairs.push([ta[0], tb[0]]);
  };
  if (n - 2 >= 1) tryPair(n - 2, n - 1);
  if (n - 1 >= 1 && n + 1 <= 9) tryPair(n - 1, n + 1);
  if (n + 2 <= 9) tryPair(n + 1, n + 2);
  return pairs.length ? pairs[0] : null;
}

exports.createBot = function (playerIndex) {
  return {
    name: botName(playerIndex, 'zh'),

    getMove: function (state) {
      const hand = state.hands[playerIndex];

      // ---- claim phase: only act if this bot is the current responder ----
      if (state.phase === 'claim' && state.claim) {
        const actor = state.claim.order[state.claim.idx];
        if (actor !== playerIndex) return { type: 'pass' };
        const tile = state.claim.tile;
        const n = state._playerCount;
        const isUpstream = playerIndex === (state.claim.discarder + 1) % n;

        // win if possible
        const test = hand.slice();
        test.push(tile);
        if (core.huCheck(test, state.melds[playerIndex], CANTONESE).win) {
          return { type: 'win' };
        }
        const m = matchCount(hand, tile.k, tile.n);
        // kong: only for number tiles with 3 copies (avoid konging honours — less useful)
        if (m >= 3 && tile.k !== 'feng' && tile.k !== 'jian') {
          return { type: 'kong' };
        }
        // pung: number tiles with a pair
        if (m >= 2 && tile.k !== 'feng' && tile.k !== 'jian') {
          return { type: 'pung' };
        }
        // chow: upstream only, and only if it improves connectivity
        if (isUpstream) {
          const pair = bestChowPair(hand, tile);
          if (pair) return { type: 'chow', tiles: pair.map(t => t.id) };
        }
        return { type: 'pass' };
      }

      // ---- play phase ----
      if (state.phase === 'play' && state.currentPlayer === playerIndex) {
        // self-draw win?
        if (core.huCheck(hand, state.melds[playerIndex], CANTONESE).win) {
          return { type: 'win' };
        }
        // discard the least-connected tile
        let worst = hand[0], worstScore = Infinity;
        for (const t of hand) {
          const sc = connectivity(hand, t);
          if (sc < worstScore) { worstScore = sc; worst = t; }
        }
        return { type: 'discard', tileId: worst.id };
      }

      return { type: 'pass' };
    },
  };
};
