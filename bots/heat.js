const { botName } = require('./lib/bot-name');
const P = require('../games/heat')._P;

exports.name = 'heat';

exports.createBot = (playerIndex) => ({
  name: 'Lily',
  playerIndex,
  getMove(state) {
    if (!state || state.phase !== 'play' || state.currentPlayer !== 1 || state.pendingHuman === null) return null;
    if (!state.position) return null;

    const female = P[state.position].female;
    const t = state.youV;
    const A = (state.botA !== undefined && state.botA !== null) ? state.botA : 1;

    // 1) Situation pool
    let situationPool = [];
    if (t >= 80) {
      for (let i = 0; i < 6; i++) {
        if (['accelerate', 'deep'].includes(female[i][2])) situationPool.push(i);
      }
    } else if (state.meV > t && t >= 75) {
      for (let i = 0; i < 6; i++) {
        if (['accelerate', 'deep', 'squeeze'].includes(female[i][2])) situationPool.push(i);
      }
    } else if (t >= 50 && t < 80) {
      for (let i = 0; i < 6; i++) {
        if (female[i][1] >= 11) situationPool.push(i);
      }
    } else {
      for (let i = 0; i < 6; i++) {
        if (female[i][2] !== 'pause') situationPool.push(i);
      }
    }
    // §4.3 有来有回: A only re-weights the pool (you press -> I press back; you ease -> I tease)
    if (A >= 1.1) {
      const hard = [];
      for (let i = 0; i < 6; i++) {
        if (['accelerate', 'deep', 'squeeze'].includes(female[i][2])) hard.push(i);
      }
      if (hard.length > 0 && Math.random() < 0.70) situationPool = hard;
    } else if (A <= 0.6) {
      const soft = [];
      for (let i = 0; i < 6; i++) {
        if (['soft', 'rhythm'].includes(female[i][2])) soft.push(i);
      }
      if (soft.length > 0 && Math.random() < 0.60) situationPool = soft;
    }

    if (situationPool.length === 0) {
      situationPool = [0, 1, 2, 3, 4, 5];
    }

    // 2) 会意 (read your last male card)
    let chosenList = situationPool;
    if (state.lastHuman !== null && state.lastHuman !== undefined) {
      const hTag = P[state.position].male[state.lastHuman][2];
      if (Math.random() < 0.60) {
        let branchPool = [];
        if (hTag === 'deep' || hTag === 'accelerate') {
          const r = Math.random();
          if (r < 0.55) {
            for (let i = 0; i < 6; i++) {
              if (['squeeze', 'deep'].includes(female[i][2])) branchPool.push(i);
            }
          } else if (r < 0.55 + (state.meV - t >= 15 ? 0.40 : 0.25)) {
            for (let i = 0; i < 6; i++) {
              if (female[i][2] === 'soft') branchPool.push(i);
            }
          } else {
            branchPool = situationPool;
          }
        } else if (hTag === 'pause') {
          const r = Math.random();
          if (r < 0.50) {
            for (let i = 0; i < 6; i++) {
              if (['accelerate', 'deep'].includes(female[i][2])) branchPool.push(i);
            }
          } else if (r < 0.80) {
            for (let i = 0; i < 6; i++) {
              if (female[i][2] === 'soft') branchPool.push(i);
            }
          } else {
            branchPool = situationPool;
          }
        } else if (hTag === 'squeeze') {
          const r = Math.random();
          if (r < 0.50) {
            for (let i = 0; i < 6; i++) {
              if (['angle', 'accelerate'].includes(female[i][2])) branchPool.push(i);
            }
          } else if (r < 0.80) {
            for (let i = 0; i < 6; i++) {
              if (female[i][2] === 'rhythm') branchPool.push(i);
            }
          } else {
            branchPool = situationPool;
          }
        }

        if (branchPool.length > 0) {
          chosenList = branchPool;
        } else {
          chosenList = situationPool;
        }
      }
    }

    // 3) 脱敏 weight penalty & 4) Weighted random
    const weights = chosenList.map(idx => {
      let w = female[idx][1] * A;
      if (idx === state.lastMe2) {
        w *= 0.5;
      }
      return w;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let chosenIdx = chosenList[0];
    if (totalWeight > 0) {
      let r = Math.random() * totalWeight;
      for (let i = 0; i < chosenList.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          chosenIdx = chosenList[i];
          break;
        }
      }
    }

    // Repick if match lastMe and possible
    if (chosenIdx === state.lastMe && chosenList.length > 1) {
      const filtered = chosenList.filter(idx => idx !== state.lastMe);
      const randIdx = Math.floor(Math.random() * filtered.length);
      chosenIdx = filtered[randIdx];
    }

    return { card: chosenIdx };
  }
});
