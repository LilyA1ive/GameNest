// games/lib/mahjong-core.js — Shared mahjong engine (Sichuan + Cantonese)
// Pure functions only; no game state, no mutation of inputs.

// ---- Config objects ----

const SICHUAN = {
  suits: ['wan', 'tong', 'tiao'],
  honours: false,
  allowChow: false,
  requireVoid: true,
  blood: true,
  maxPlayers: 4,
  minPlayers: 2,
};

const CANTONESE = {
  suits: ['wan', 'tong', 'tiao'],
  honours: true,
  allowChow: true,
  requireVoid: false,
  blood: false,
  maxPlayers: 4,
  minPlayers: 2,
};

// ---- Tile helpers ----

function sortTiles(tiles) {
  const suitOrder = { wan: 0, tong: 1, tiao: 2, feng: 3, jian: 4 };
  tiles.sort((a, b) => {
    const sa = suitOrder[a.k] ?? 9, sb = suitOrder[b.k] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.n - b.n;
  });
}

let _tileId = 0;
function makeTile(k, n) {
  return { k, n, id: k + n + '#' + (_tileId++) };
}

// ---- buildDeck ----

function buildDeck(cfg) {
  _tileId = 0;
  const deck = [];
  const suits = cfg.suits || ['wan', 'tong', 'tiao'];
  for (const k of suits) {
    for (let n = 1; n <= 9; n++) {
      for (let c = 0; c < 4; c++) deck.push(makeTile(k, n));
    }
  }
  if (cfg.honours) {
    // Winds: 1-4 (East, South, West, North)
    for (let n = 1; n <= 4; n++) {
      for (let c = 0; c < 4; c++) deck.push(makeTile('feng', n));
    }
    // Dragons: 1-3 (中, 发, 白)
    for (let n = 1; n <= 3; n++) {
      for (let c = 0; c < 4; c++) deck.push(makeTile('jian', n));
    }
  }
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ---- huCheck: determine if hand + melds is a winning hand ----

function huCheck(hand, melds, cfg) {
  // Count tiles by (k, n)
  const counts = {};
  for (const t of hand) {
    const key = t.k + ':' + t.n;
    counts[key] = (counts[key] || 0) + 1;
  }

  const exposedMelds = melds ? melds.length : 0;

  // Try standard decomposition: find a pair, rest must form melds
  const keys = Object.keys(counts);
  for (const key of keys) {
    if (counts[key] >= 2) {
      const testCounts = Object.assign({}, counts);
      testCounts[key] -= 2;
      if (testCounts[key] === 0) delete testCounts[key];
      if (canFormMelds(testCounts)) {
        return { win: true, type: 'standard', pair: key };
      }
    }
  }

  // Try seven pairs (only if no exposed melds)
  if (exposedMelds === 0) {
    const qidui = trySevenPairs(counts);
    if (qidui) return { win: true, type: 'qidui' };
  }

  return { win: false };
}

function canFormMelds(counts) {
  // Check if remaining tiles can be fully decomposed into melds (triples/sequences)
  const keys = Object.keys(counts).filter(k => counts[k] > 0);
  if (keys.length === 0) return true;

  const key = keys[0];
  const [k, nStr] = key.split(':');
  const n = parseInt(nStr);

  // Try pung (triple)
  if (counts[key] >= 3) {
    const next = Object.assign({}, counts);
    next[key] -= 3;
    if (next[key] === 0) delete next[key];
    if (canFormMelds(next)) return true;
  }

  // Try chow (sequence) — only for number tiles, not honours
  if (k !== 'feng' && k !== 'jian' && n <= 7) {
    const key2 = k + ':' + (n + 1);
    const key3 = k + ':' + (n + 2);
    if (counts[key2] > 0 && counts[key3] > 0) {
      const next = Object.assign({}, counts);
      next[key]--; next[key2]--; next[key3]--;
      if (next[key] === 0) delete next[key];
      if (next[key2] === 0) delete next[key2];
      if (next[key3] === 0) delete next[key3];
      if (canFormMelds(next)) return true;
    }
  }

  return false;
}

function trySevenPairs(counts) {
  const keys = Object.keys(counts);
  if (keys.length !== 7) return false;
  for (const key of keys) {
    if (counts[key] !== 2) return false;
  }
  return true;
}

// ---- countFan: basic scoring ----

function countFan(hand, melds, winInfo, cfg) {
  // Delegate to detailed version for backward compatibility.
  return countFanDetailed(hand, melds, winInfo, cfg, {}).fan;
}

// ---- countFanDetailed: returns { fan, details: [{ name, fan }] } ----

function countFanDetailed(hand, melds, winInfo, cfg, options) {
  var details = [];
  options = options || {};
  var suitsUsed = new Set();
  for (var i = 0; i < hand.length; i++) suitsUsed.add(hand[i].k);
  if (melds) for (var m = 0; m < melds.length; m++) {
    if (melds[m].tile) suitsUsed.add(melds[m].tile.k);
    if (melds[m].tiles) for (var t = 0; t < melds[m].tiles.length; t++) suitsUsed.add(melds[m].tiles[t].k);
  }
  // 清一色 (one suit)
  if (suitsUsed.size === 1) {
    details.push({ name: '清一色', fan: cfg.honours ? 4 : 8 });
  }
  // 混一色 (two suits including honours)
  else if (suitsUsed.size === 2 && cfg.honours && (suitsUsed.has('feng') || suitsUsed.has('jian'))) {
    details.push({ name: '混一色', fan: 2 });
  }
  // 七对
  if (winInfo && winInfo.type === 'qidui') {
    details.push({ name: '七对', fan: cfg.honours ? 2 : 4 });
  }
  // 对对和 (all pungs, no chows) — approximation
  if (winInfo && winInfo.type === 'standard' && melds && melds.length >= 3) {
    details.push({ name: '对对和', fan: 2 });
  }
  // 断幺九 (no terminals or honours)
  var hasTerminal = false;
  for (var i2 = 0; i2 < hand.length; i2++) {
    if (hand[i2].k === 'feng' || hand[i2].k === 'jian' || hand[i2].n === 1 || hand[i2].n === 9) {
      hasTerminal = true; break;
    }
  }
  if (!hasTerminal) details.push({ name: '断幺', fan: 1 });
  // 自摸
  if (options.selfDraw) details.push({ name: '自摸', fan: 1 });
  // 海底捞 (last tile self-draw)
  if (options.selfDraw && options.wallCount === 0) details.push({ name: '海底捞', fan: 1 });
  // 杠上花
  if (options.gangShangHua) details.push({ name: '杠上花', fan: 1 });

  var total = details.reduce(function (s, d) { return s + d.fan; }, 0);
  // 平胡底分：没有任何番种时记 1 分（四川麻将平胡起码 1 番）
  if (total === 0) {
    details.push({ name: '平胡', fan: 1 });
    total = 1;
  }
  return { fan: total, details: details };
}

// ---- Export ----

module.exports = {
  SICHUAN,
  CANTONESE,
  buildDeck,
  huCheck,
  countFan,
  countFanDetailed,
  sortTiles,
};
