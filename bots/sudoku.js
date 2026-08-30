// bots/sudoku.js — Sudoku AI: fills the next blank with the correct answer.
const { botName } = require('./lib/bot-name');

exports.name = 'sudoku';

exports.createBot = (playerIndex) => ({
  name: botName(playerIndex, 'zh'),
  getMove(state) {
    if (state.eliminated && state.eliminated[playerIndex]) return {};
    const filled = state.filled[playerIndex];
    // Find the first blank cell this player hasn't filled yet.
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (state.puzzle[r][c] !== 0) continue;   // not a blank
        if (filled[r][c]) continue;               // already filled by this bot

        const val = state.solution[r][c];            // the bot "cheats" — it's a bot
        return { type: 'fill', row: r, col: c, val: val };
      }
    }
    return { pass: true };
  },
});
