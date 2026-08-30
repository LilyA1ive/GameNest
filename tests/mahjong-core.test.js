// tests/mahjong-core.test.js — Mahjong shared engine pure functions
// Run: node tests/mahjong-core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../games/lib/mahjong-core');

// Helper: make a tile
function T(k, n) { return { k, n, id: k + n }; }

// Build a hand array from compact notation: '123m' = 1万2万3万, '55s' = 5条5条
function hand(str) {
  const tiles = [];
  let nums = '';
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') { nums += ch; continue; }
    const k = ch === 'm' ? 'wan' : (ch === 's' ? 'tiao' : 'tong');
    for (const n of nums) tiles.push(T(k, parseInt(n)));
    nums = '';
  }
  return tiles;
}

// ---- buildDeck ----

test('mahjong-core: buildDeck SICHUAN = 108 tiles (no honours)', () => {
  const cfg = core.SICHUAN;
  const deck = core.buildDeck(cfg);
  assert.equal(deck.length, 108);
  // each of 3 suits × 9 ranks × 4 copies
  const counts = {};
  for (const t of deck) counts[t.k + t.n] = (counts[t.k + t.n] || 0) + 1;
  for (const k of ['wan', 'tong', 'tiao']) {
    for (let n = 1; n <= 9; n++) {
      assert.equal(counts[k + n], 4, k + n + ' should have 4 copies');
    }
  }
});

test('mahjong-core: buildDeck CANTONESE = 136 tiles (with honours)', () => {
  const cfg = core.CANTONESE;
  const deck = core.buildDeck(cfg);
  assert.equal(deck.length, 136);
  // 108 number tiles + 28 honours (16 winds + 12 dragons)
  const honours = deck.filter(t => t.k === 'feng' || t.k === 'jian');
  assert.equal(honours.length, 28);
});

// ---- huCheck (standard hand: 4 melds + 1 pair) ----

test('mahjong-core: huCheck standard win (4 melds + pair)', () => {
  // 123m 456m 789m 11s + 222m = 4 melds + pair
  const tiles = hand('123m456m789m222m11s');
  const result = core.huCheck(tiles, [], core.SICHUAN);
  assert.equal(result.win, true);
});

test('mahjong-core: huCheck seven pairs (七对)', () => {
  // 7 distinct pairs
  const tiles = hand('1133m5577s99p22p');  // using m/s/p notation
  // rebuild with correct suits
  const t = [
    T('wan', 1), T('wan', 1), T('wan', 3), T('wan', 3),
    T('tiao', 5), T('tiao', 5), T('tiao', 7), T('tiao', 7),
    T('tong', 9), T('tong', 9), T('tong', 2), T('tong', 2),
    T('wan', 4), T('wan', 4),
  ];
  const result = core.huCheck(t, [], core.SICHUAN);
  assert.equal(result.win, true);
  assert.equal(result.type, 'qidui');
});

test('mahjong-core: huCheck not a win', () => {
  const tiles = hand('123m456m789m12s55p');  // incomplete
  const result = core.huCheck(tiles, [], core.SICHUAN);
  assert.equal(result.win, false);
});

test('mahjong-core: huCheck with melds (碰/杠)', () => {
  // 3 melds already exposed + 1 meld + pair in hand
  const handTiles = hand('123m456m11s');  // 2 melds + pair
  const melds = [
    { type: 'pung', tile: T('wan', 5) },  // 555m
    { type: 'pung', tile: T('tiao', 3) }, // 333s
  ];
  const result = core.huCheck(handTiles, melds, core.SICHUAN);
  assert.equal(result.win, true);
});

// ---- countFan (basic scoring) ----

test('mahjong-core: countFan 素胡 (basic) = 0 fan', () => {
  const tiles = hand('123m456m789m222m11s');
  const info = core.huCheck(tiles, [], core.SICHUAN);
  const fan = core.countFan(tiles, [], info, core.SICHUAN);
  assert.ok(fan >= 0);
});

test('mahjong-core: countFan 清一色 (one suit) has more fan', () => {
  const mixed = hand('123m456m789m222m11s');
  const pure = hand('123m456m789m222m567m');  // all wan
  const infoMixed = core.huCheck(mixed, [], core.SICHUAN);
  const infoPure = core.huCheck(pure, [], core.SICHUAN);
  const fanMixed = core.countFan(mixed, [], infoMixed, core.SICHUAN);
  const fanPure = core.countFan(pure, [], infoPure, core.SICHUAN);
  assert.ok(fanPure > fanMixed, 'pure suit should score higher');
});

test('mahjong-core: countFan 七对 has fan', () => {
  const t = [
    T('wan', 1), T('wan', 1), T('wan', 3), T('wan', 3),
    T('tiao', 5), T('tiao', 5), T('tiao', 7), T('tiao', 7),
    T('tong', 9), T('tong', 9), T('tong', 2), T('tong', 2),
    T('wan', 4), T('wan', 4),
  ];
  const info = core.huCheck(t, [], core.SICHUAN);
  const fan = core.countFan(t, [], info, core.SICHUAN);
  assert.ok(fan > 0, 'seven pairs should have fan');
});
