// bots/2048.js — 2048 AI: corner-greedy heuristic.
const { botName } = require('./lib/bot-name');
const { copy, move, maxTile } = require('../games/lib/game2048');

exports.name = '2048';

const DIRS = ['up', 'down', 'left', 'right'];

// Reward keeping the biggest tile in a corner. Corners are stable because the
// big tile can only grow along two axes instead of being pushed to the middle.
function cornerScore(grid) {
  const mt = maxTile(grid);
  if (grid[0][0] === mt || grid[0][3] === mt || grid[3][0] === mt || grid[3][3] === mt) {
    return mt;
  }
  return 0;
}

exports.createBot = (playerIndex) => ({
  name: botName(playerIndex, 'zh'),
  getMove(state) {
    const board = state.boards[playerIndex];
    let best = null;
    let bestScore = -Infinity;

    for (const dir of DIRS) {
      const res = move(copy(board), dir);
      if (!res.changed) continue;
      // Immediate merge score is the primary signal; corner retention breaks ties
      // and favors positions that keep the max tile anchored.
      const score = res.score * 4 + cornerScore(res.grid);
      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }

    if (!best) return { pass: true };
    return { dir: best };
  },
});
