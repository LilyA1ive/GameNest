// tests/mahjong-wildcard.test.js — 红中万能百搭 + 特殊番型 (十三幺/大三元/大四喜)
// Run: node tests/mahjong-wildcard.test.js
// TDD: these tests are written BEFORE the implementation. They should FAIL initially.
//
// 红中 (jian 1 = 中) 做万能百搭：可替代任意牌凑面子/对子。
// 通过 cfg.wildcard = { k: 'jian', n: 1 } 启用，不配置则所有牌都是普通牌。

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../games/lib/mahjong-core');
const game = require('../games/mahjong-cantonese');

// ---- Helpers (mirror mahjong-cantonese.test.js) ----
let _tid = 0;
function T(k, n) { return { k, n, id: k + n + '#' + (_tid++) }; }

function hand(str) {
  const tiles = [];
  let nums = '';
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') { nums += ch; continue; }
    let k;
    if (ch === 'm') k = 'wan';
    else if (ch === 's') k = 'tiao';
    else if (ch === 'p') k = 'tong';
    else if (ch === 'E') { tiles.push(T('feng', 1)); continue; }
    else if (ch === 'S') { tiles.push(T('feng', 2)); continue; }
    else if (ch === 'W') { tiles.push(T('feng', 3)); continue; }
    else if (ch === 'N') { tiles.push(T('feng', 4)); continue; }
    else if (ch === 'C') { tiles.push(T('jian', 1)); continue; }
    else if (ch === 'F') { tiles.push(T('jian', 2)); continue; }
    else if (ch === 'B') { tiles.push(T('jian', 3)); continue; }
    else continue;
    for (const n of nums) tiles.push(T(k, parseInt(n)));
    nums = '';
  }
  return tiles;
}

// 广东配置 + 红中百搭
const CANTONESE_WILD = { ...core.CANTONESE, wildcard: { k: 'jian', n: 1 } };

// ============================================================
// 红中万能百搭 (Wildcard)
// ============================================================

test('wildcard: 红中替代缺牌组成顺子 (1万 + 红中 + 3万 = 123万)', () => {
  // 1万, 红中(百搭), 3万 + 完整面子对子 → 应胡
  const h = [
    T('wan', 1), T('jian', 1), T('wan', 3),  // 红中当2万
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 1), T('tong', 1),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
    T('feng', 1), T('feng', 1),
  ];
  const r = core.huCheck(h, [], CANTONESE_WILD);
  assert.equal(r.win, true, '红中当2万应能胡');
});

test('wildcard: 红中替代缺牌组成刻子 (5万+5万+红中 = 刻子)', () => {
  const h = [
    T('wan', 5), T('wan', 5), T('jian', 1),  // 红中当5万
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tong', 1), T('tong', 2), T('tong', 3),
    T('tiao', 4), T('tiao', 5), T('tiao', 6),
    T('feng', 2), T('feng', 2),
  ];
  const r = core.huCheck(h, [], CANTONESE_WILD);
  assert.equal(r.win, true, '红中当5万组成刻子应能胡');
});

test('wildcard: 红中替代雀头 (红中+7万 = 对子)', () => {
  // 标准胡牌：1雀头 + 4面子。红中+7万做雀头，其余4组面子为数牌顺子/刻子
  const h = [
    T('wan', 7), T('jian', 1),  // 红中当7万做雀头
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tong', 1), T('tong', 2), T('tong', 3),
    T('tiao', 4), T('tiao', 5), T('tiao', 6),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
  ];
  const r = core.huCheck(h, [], CANTONESE_WILD);
  assert.equal(r.win, true, '红中当7万做雀头应能胡');
});

test('wildcard: 没有红中配置时红中不能当百搭 (不启用规则)', () => {
  // 同样手牌，不配 wildcard → 不能胡
  const h = [
    T('wan', 1), T('jian', 1), T('wan', 3),
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 1), T('tong', 1),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
    T('feng', 1), T('feng', 1),
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, false, '不配 wildcard 时红中不能当百搭');
});

test('wildcard: 两个红中同时当百搭', () => {
  const h = [
    T('wan', 1), T('jian', 1), T('jian', 1),  // 两个红中当2万3万
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 2), T('tong', 3),
    T('tiao', 4), T('tiao', 5), T('tiao', 6),
    T('feng', 1), T('feng', 1),
  ];
  const r = core.huCheck(h, [], CANTONESE_WILD);
  assert.equal(r.win, true, '两个红中同时当百搭应能胡');
});

// ============================================================
// 十三幺 (Thirteen Orphans / 国士无双)
// ============================================================

test('十三幺: 标准13种幺九字牌各1张+1张成对 → 应识别为特殊胡牌', () => {
  const h = [
    T('wan', 1), T('wan', 9),  // 幺九
    T('tong', 1), T('tong', 9),
    T('tiao', 1), T('tiao', 9),
    T('feng', 1), T('feng', 2), T('feng', 3), T('feng', 4),  // 四风
    T('jian', 1), T('jian', 2),  // 中发
    T('jian', 3), T('jian', 3),  // 白板成对
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, true, '十三幺应能胡');
  assert.equal(r.type, 'shisanyao', '应识别为十三幺类型');
});

test('十三幺: 缺一种幺九牌 → 不应胡', () => {
  const h = [
    T('wan', 1), T('wan', 9),
    T('tong', 1), T('tong', 9),
    T('tiao', 1), T('tiao', 9),
    T('feng', 1), T('feng', 2), T('feng', 3), T('feng', 4),
    T('jian', 1), T('jian', 2),
    T('jian', 3),  // 只有1张白板，不成对
    T('wan', 5),  // 多一张无关牌
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, false, '缺牌+无对子不应胡');
});

// ============================================================
// 大三元 (Three Great Dragons / 大三元)
// ============================================================

test('大三元: 中发白三组刻子 + 其他面子对子 → 应识别为 special', () => {
  const h = [
    T('jian', 1), T('jian', 1), T('jian', 1),  // 中刻子
    T('jian', 2), T('jian', 2), T('jian', 2),  // 发刻子
    T('jian', 3), T('jian', 3), T('jian', 3),  // 白刻子
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tong', 1), T('tong', 1),  // 雀头
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, true, '大三元应能胡');
  assert.equal(r.type, 'dasanyuan', '应识别为大三元');
});

test('大三元: 只有两组龙刻子不算大三元', () => {
  const h = [
    T('jian', 1), T('jian', 1), T('jian', 1),
    T('jian', 2), T('jian', 2), T('jian', 2),
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tiao', 1), T('tiao', 2), T('tiao', 3),
    T('tong', 5), T('tong', 5),
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, true, '能胡但不是大三元');
  assert.notEqual(r.type, 'dasanyuan', '两组龙刻子不算大三元');
});

// ============================================================
// 大四喜 (Four Great Winds / 大四喜)
// ============================================================

test('大四喜: 东南西北四组刻子 + 雀头 → 应识别为 special', () => {
  const h = [
    T('feng', 1), T('feng', 1), T('feng', 1),
    T('feng', 2), T('feng', 2), T('feng', 2),
    T('feng', 3), T('feng', 3), T('feng', 3),
    T('feng', 4), T('feng', 4), T('feng', 4),
    T('wan', 5), T('wan', 5),
  ];
  const r = core.huCheck(h, [], core.CANTONESE);
  assert.equal(r.win, true, '大四喜应能胡');
  assert.equal(r.type, 'dasixi', '应识别为大四喜');
});

// ============================================================
// 计分: 特殊番型应在 countFanDetailed 中加番
// ============================================================

test('计分: 大三元应加番 (至少 +8番)', () => {
  const h = [
    T('jian', 1), T('jian', 1), T('jian', 1),
    T('jian', 2), T('jian', 2), T('jian', 2),
    T('jian', 3), T('jian', 3), T('jian', 3),
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tong', 1), T('tong', 1),
  ];
  const winInfo = { type: 'dasanyuan' };
  const r = core.countFanDetailed(h, [], winInfo, core.CANTONESE, {});
  const hasDasanyuan = r.details.some(d => d.name === '大三元');
  assert.equal(hasDasanyuan, true, '计分应含大三元番型');
  assert.ok(r.fan >= 8, '大三元至少 8 番');
});

test('计分: 大四喜应加番 (至少 +8番)', () => {
  const h = [
    T('feng', 1), T('feng', 1), T('feng', 1),
    T('feng', 2), T('feng', 2), T('feng', 2),
    T('feng', 3), T('feng', 3), T('feng', 3),
    T('feng', 4), T('feng', 4), T('feng', 4),
    T('wan', 5), T('wan', 5),
  ];
  const winInfo = { type: 'dasixi' };
  const r = core.countFanDetailed(h, [], winInfo, core.CANTONESE, {});
  const hasDasixi = r.details.some(d => d.name === '大四喜');
  assert.equal(hasDasixi, true, '计分应含大四喜番型');
  assert.ok(r.fan >= 8, '大四喜至少 8 番');
});

test('计分: 十三幺应加番 (至少 +8番)', () => {
  const h = [
    T('wan', 1), T('wan', 9),
    T('tong', 1), T('tong', 9),
    T('tiao', 1), T('tiao', 9),
    T('feng', 1), T('feng', 2), T('feng', 3), T('feng', 4),
    T('jian', 1), T('jian', 2),
    T('jian', 3), T('jian', 3),
  ];
  const winInfo = { type: 'shisanyao' };
  const r = core.countFanDetailed(h, [], winInfo, core.CANTONESE, {});
  const hasShisanyao = r.details.some(d => d.name === '十三幺');
  assert.equal(hasShisanyao, true, '计分应含十三幺番型');
  assert.ok(r.fan >= 8, '十三幺至少 8 番');
});

test('计分: 红中百搭胡牌应加番 (混一色/对对和等 + 百搭番)', () => {
  const h = [
    T('wan', 1), T('jian', 1), T('wan', 3),  // 红中当2万
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 1), T('tong', 1),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
    T('feng', 1), T('feng', 1),
  ];
  // 红中百搭胡牌，winInfo.type 是 standard，但应标记使用了百搭
  const winInfo = { type: 'standard', wildcard: true };
  const r = core.countFanDetailed(h, [], winInfo, core.CANTONESE, {});
  const hasWild = r.details.some(d => d.name === '百搭');
  assert.equal(hasWild, true, '百搭胡牌应加百搭番');
});

// ============================================================
// 集成测试：广东游戏模块端到端使用 wildcard 配置
// ============================================================

test('集成: 广东游戏启用红中百搭后能胡牌（自摸）', () => {
  // 创建一个启用百搭的广东游戏状态
  const s = game.createState();
  s._options = { mj_wildcard: true };
  game.initGame(s, 4);
  // 玩家0手牌：1万, 红中, 3万 + 完整面子对子（红中当2万）
  s.hands[0] = [
    T('wan', 1), T('jian', 1), T('wan', 3),
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 1), T('tong', 1),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
    T('feng', 1), T('feng', 1),
  ];
  s.currentPlayer = 0;
  s.hasDrawn = true;
  s.phase = 'play';
  // 自摸胡牌
  const err = game.handleMove({ type: 'win' }, s, 0);
  assert.equal(err, null, '启用百搭时应能自摸胡');
  assert.equal(s.winner, 0, '玩家0应获胜');
});

test('集成: 广东游戏不启用百搭时同样手牌不能胡', () => {
  const s = game.createState();
  s._options = {}; // 不启用百搭
  game.initGame(s, 4);
  s.hands[0] = [
    T('wan', 1), T('jian', 1), T('wan', 3),
    T('wan', 4), T('wan', 5), T('wan', 6),
    T('tong', 1), T('tong', 1), T('tong', 1),
    T('tiao', 7), T('tiao', 8), T('tiao', 9),
    T('feng', 1), T('feng', 1),
  ];
  s.currentPlayer = 0;
  s.hasDrawn = true;
  s.phase = 'play';
  const err = game.handleMove({ type: 'win' }, s, 0);
  assert.notEqual(err, null, '不启用百搭时同样手牌不能胡');
});

test('集成: 大三元自摸胡牌（无百搭）', () => {
  const s = game.createState();
  s._options = {};
  game.initGame(s, 4);
  s.hands[0] = [
    T('jian', 1), T('jian', 1), T('jian', 1),
    T('jian', 2), T('jian', 2), T('jian', 2),
    T('jian', 3), T('jian', 3), T('jian', 3),
    T('wan', 1), T('wan', 2), T('wan', 3),
    T('tong', 1), T('tong', 1),
  ];
  s.currentPlayer = 0;
  s.hasDrawn = true;
  s.phase = 'play';
  const err = game.handleMove({ type: 'win' }, s, 0);
  assert.equal(err, null, '大三元应能胡');
  assert.equal(s.winInfo.type, 'dasanyuan', '应识别为大三元');
  assert.ok(s.winInfo.fan >= 8, '大三元至少8番');
});
