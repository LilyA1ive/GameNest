// games/heat.js — 情事对战卡游戏（规格 heat-dev-spec §1-§4，公式冻结）
'use strict';

const P = {
  doggy:{name:"后入",em:"🔫",ds:"你从后面",
    male:[["深顶",15,"deep"],["突然加速",16,"accelerate"],["拉腰",10,"angle"],["扣住后脑",12,"squeeze"],["突然刹住",9,"pause"],["顶到最深处",18,"deep"]],
    female:[["拱腰",11,"rhythm"],["夹腿",13,"squeeze"],["前后摆",10,"angle"],["扭腰",9,"rhythm"],["收缩夹紧",15,"squeeze"],["俯得再深",14,"deep"]],
    intro:"你绕到后面那格，我腰塌下去，后脑搁着枕头。你这一下顶进来，我喉咙里那口气没咽下去。"},
  cowgirl:{name:"骑乘",em:"🏇",ds:"我坐在上面",
    male:[["抬胯顶",14,"deep"],["攥你大腿",12,"squeeze"],["扣腰",10,"angle"],["按住别太快",9,"pause"],["顶腰",15,"deep"],["突然顶",16,"accelerate"]],
    female:[["上下颠",13,"rhythm"],["画圈磨",12,"angle"],["夹紧",15,"squeeze"],["俯身贴你",13,"deep"],["抬头轻点",8,"soft"],["突然加速",17,"accelerate"]],
    intro:"我跨上来的那格，你腿还虚着。我坐稳了，慢着开始动——先让你知道我到底了。"},
  missionary:{name:"传教士",em:"🛏",ds:"我躺着你看我",
    male:[["俯下身",11,"angle"],["抬起我的腿",14,"deep"],["换角度",10,"angle"],["突然深顶",17,"deep"],["抱紧我",9,"soft"],["突然加速",16,"accelerate"]],
    female:[["腿缠上去",13,"squeeze"],["拱腰迎你",12,"rhythm"],["翻身",11,"angle"],["夹紧收缩",15,"squeeze"],["拉你深入",14,"deep"],["轻轻点头",8,"soft"]],
    intro:"你压在我上面那格，我看着你的脸。你顶进来我没躲，腿缠上去了。"},
  spooning:{name:"侧卧",em:"🌙",ds:"你贴着我后背",
    male:[["慢慢顶",9,"soft"],["蹭",8,"soft"],["轻顶",10,"rhythm"],["突然深",15,"deep"],["揉我腿",7,"soft"],["顶腰",13,"deep"]],
    female:[["半翻身迎你",11,"angle"],["夹紧",14,"squeeze"],["勾住你腿",12,"squeeze"],["仰腰",10,"rhythm"],["缩着迎",9,"soft"],["突然收紧",15,"accelerate"]],
    intro:"我们侧着，你贴着我后头那格。我勾住你腿，你慢慢来，这格我应得深。"},
  oral:{name:"口",em:"💋",ds:"69 着",
    male:[["吹气",11,"soft"],["含住节奏",14,"rhythm"],["手指",13,"angle"],["舌尖",15,"deep"],["突然深",16,"accelerate"],["轻咬",9,"soft"]],
    female:[["吞吐",13,"rhythm"],["舌头画圈",14,"deep"],["手指",12,"angle"],["突然加深",16,"accelerate"],["吹气",11,"soft"],["轻咬下唇",10,"soft"]],
    intro:"我们 69 着那格，我含你的时候看着你——你脸那下红了我看见了，我没停。"},
  standing:{name:"站姿",em:"🚪",ds:"把你抵在门上",
    male:[["托起我",12,"angle"],["扶腰",10,"rhythm"],["拉我贴紧",13,"deep"],["抬我腿",14,"deep"],["顶",11,"rhythm"],["突然深",16,"accelerate"]],
    female:[["抬脚",9,"soft"],["勾腿",13,"squeeze"],["夹腿",14,"squeeze"],["俯身",12,"deep"],["夹紧",15,"squeeze"],["点头",8,"soft"]],
    intro:"我把你抵在门上那格，我抬脚，你托我。没站多久，但我记得你收紧的那一下。"}
};

const SAY = {
  youMove:{ deep:"你这一下沉到底了，我整个人绷住。",accelerate:"你突然快了，我喉咙里漏了半声。",pause:"你刹住了——就停在快到的那格，我痒得发紧。",
    squeeze:"你箍得我腿合不上。",angle:"你换了个角度，顶到另一块地方了。",rhythm:"你稳着压，一下一下都数得着。",soft:"你收着来，轻的，先吊着我。"},
  meMove:{ deep:"我这一记往深里落，你腰离床了。",accelerate:"我踩着你快的那格不停，你快跟不上了。",pause:"我悬住不给你那一口，看你脸憋红的。",
    squeeze:"我腿夹住你，让你出不来。",angle:"我扭了一下，顶到你没想到的地方。",rhythm:"我踩着你的点磨，磨到你发喘。",soft:"我轻着勾你，先不让你到。"},
  org:{ youWin:"……到这一下我整个人散架了，我应出来那声你自己听见了。我输了，我应得全——你把我先弄倒了。",
    meWin:"你先到那格，你脸那下我看得清清楚楚。我没停，撑到最后那下。我赢了，我让你先到的。",
    tie:"这一格，你我都到了。我没算好，你也没算好。"},
  big:{ youWin:"你 赢 · 你先把我弄倒了", meWin:"我 赢 · 我先让你到了", tie:"平 · 你们同时到点"}
};

exports.name = 'heat';
exports.maxPlayers = 2;

exports.createState = () => ({
  phase: 'select',
  position: null,
  meV: 0,
  youV: 0,
  currentPlayer: 0,
  pendingHuman: null,
  lastHuman: null,
  lastHuman2: null,
  lastMe: null,
  lastMe2: null,
  humanAggro: null,
  gH: 0,
  gB: 0,
  round: 0,
  lines: [],
  winner: null,
  meta: { p: P, say: SAY }
});

exports._settleSim = (positionKey, hIdx, bIdx, ctx = {}) => {
  const meV = ctx.meV !== undefined ? ctx.meV : 80;
  const youV = ctx.youV !== undefined ? ctx.youV : 10;
  const lastHuman = ctx.lastHuman !== undefined ? ctx.lastHuman : null;
  const lastHuman2 = ctx.lastHuman2 !== undefined ? ctx.lastHuman2 : null;
  const lastMe = ctx.lastMe !== undefined ? ctx.lastMe : null;
  const lastMe2 = ctx.lastMe2 !== undefined ? ctx.lastMe2 : null;

  const hCard = P[positionKey].male[hIdx];
  const bCard = P[positionKey].female[bIdx];
  const baseH = hCard[1], baseB = bCard[1];
  const hTag = hCard[2], bTag = bCard[2];

  let counterHmult = 1, counterBmult = 1, bonusH = 0, bonusB = 0;
  if (hTag === 'pause' && (bTag === 'accelerate' || bTag === 'deep')) { counterBmult *= 0.5; bonusH += 3; }
  if (bTag === 'pause' && (hTag === 'accelerate' || hTag === 'deep')) { counterHmult *= 0.5; bonusB += 3; }
  if (hTag === 'squeeze' && bTag === 'accelerate') { counterBmult *= 0.7; bonusH += 2; }
  if (bTag === 'squeeze' && hTag === 'accelerate') { counterHmult *= 0.7; bonusB += 2; }
  if (hTag === 'soft' && bTag === 'deep') { counterBmult *= 0.8; }
  if (bTag === 'soft' && hTag === 'deep') { counterHmult *= 0.8; }

  let ctxHmult = 1;
  if (meV >= 80 && (hTag === 'accelerate' || hTag === 'deep')) ctxHmult = 1.5;
  else if (meV >= 55 && meV <= 90 && hTag === 'pause') ctxHmult = 1.4;
  else if (meV < 20 && hTag === 'accelerate') ctxHmult = 0.85;

  let ctxBmult = 1;
  if (youV >= 80 && (bTag === 'accelerate' || bTag === 'deep')) ctxBmult = 1.5;
  else if (youV >= 55 && youV <= 90 && bTag === 'pause') ctxBmult = 1.4;
  else if (youV < 20 && bTag === 'accelerate') ctxBmult = 0.85;

  let desH = 1;
  if (hIdx === lastHuman) { desH = 0.7; if (hIdx === lastHuman2) desH = 0.4; }
  let desB = 1;
  if (bIdx === lastMe) { desB = 0.7; if (bIdx === lastMe2) desB = 0.4; }

  const gH = Math.round(baseH * counterHmult * ctxHmult * desH) + bonusH;
  const gB = Math.round(baseB * counterBmult * ctxBmult * desB) + bonusB;

  return { gH, gB };
};

exports._settleForTest = (hCardIdx, bCardIdx) => {
  const accelIdx = P.cowgirl.male.findIndex(c => c[2] === 'accelerate');
  const res = exports._settleSim('cowgirl', hCardIdx, bCardIdx, {
    meV: 80,
    youV: 10,
    lastHuman: accelIdx,
    lastHuman2: accelIdx
  });
  return { humanGain: res.gH, botGain: res.gB };
};

exports.handleMove = (data, state, playerIndex) => {
  if (state.phase === 'over') return 'heat_over';

  if (data && data.select !== undefined) {
    if (playerIndex !== 0) return 'heat_select_only_human';
    if (state.phase !== 'select') return 'heat_wrong_phase';
    if (!P[data.select]) return 'heat_bad_select';

    state.position = data.select;
    state.phase = 'play';
    state.currentPlayer = 0;
    state.lines.push({ who: 'sys', text: P[data.select].intro });
    return null;
  }

  if (data && data.card !== undefined) {
    if (state.phase !== 'play') return 'heat_wrong_phase';
    if (playerIndex !== state.currentPlayer) return 'heat_not_your_turn';
    if (typeof data.card !== 'number' || data.card < 0 || data.card > 5 || !Number.isInteger(data.card)) {
      return 'heat_bad_card';
    }

    if (playerIndex === 0) {
      if (state.pendingHuman !== null) return 'heat_wrong_phase';
      state.pendingHuman = data.card;
      state.currentPlayer = 1;
      return null;
    } else {
      if (state.pendingHuman === null) return 'heat_not_your_turn';
      const h = state.pendingHuman;
      const b = data.card;

      const res = exports._settleSim(state.position, h, b, {
        meV: state.meV,
        youV: state.youV,
        lastHuman: state.lastHuman,
        lastHuman2: state.lastHuman2,
        lastMe: state.lastMe,
        lastMe2: state.lastMe2
      });

      const gH = res.gH;
      const gB = res.gB;

      if (!state._gHHist) state._gHHist = [];
      state._gHHist.push(gH);
      if (state._gHHist.length > 3) state._gHHist.shift();
      state.humanAggro = state._gHHist.reduce((acc, val) => acc + val, 0) / state._gHHist.length;
      state.botA = Math.min(1.3, Math.max(0.4, state.humanAggro / 15));

      state.meV = Math.max(0, state.meV - 3 + gH);
      state.youV = Math.max(0, state.youV - 3 + gB);

      state.lastHuman2 = state.lastHuman;
      state.lastHuman = h;
      state.lastMe2 = state.lastMe;
      state.lastMe = b;

      const hTag = P[state.position].male[h][2];
      const bTag = P[state.position].female[b][2];
      state.lines.push({ who: 'you', text: SAY.youMove[hTag], gain: gH });
      state.lines.push({ who: 'me', text: SAY.meMove[bTag], gain: gB });

      state.gH = gH;
      state.gB = gB;

      let winner = null;
      if (state.meV >= 100 && state.youV >= 100) {
        winner = 'tie';
      } else if (state.meV >= 100) {
        winner = 0;
      } else if (state.youV >= 100) {
        winner = 1;
      }

      if (winner !== null) {
        state.phase = 'over';
        state.winner = winner;
        const wKey = winner === 'tie' ? 'tie' : (winner === 0 ? 'youWin' : 'meWin');
        state.lines.push({ who: 'sys', text: SAY.big[wKey] });
        state.lines.push({ who: 'sys', text: SAY.org[wKey] });
      }

      state.round += 1;
      state.pendingHuman = null;
      state.currentPlayer = 0;
      return null;
    }
  }

  return 'heat_wrong_phase';
};

exports._P = P;
exports._SAY = SAY;
