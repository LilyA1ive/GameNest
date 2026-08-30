// games/sudoku.js
// Sudoku — Multiplayer speed race: same puzzle, independent progress per player.
// First to correctly fill every blank wins.

const { generateSudoku } = require('./lib/sudoku-gen');

exports.name = 'sudoku';
exports.minPlayers = 1;
exports.maxPlayers = 4;
exports.realtime = true; // racing, non-turn (like minesweeper)
exports.tickMs = 600;

exports.createState = () => ({
  puzzle: [],      // 9x9, 0 = blank
  solution: [],    // 9x9 full solution (server-only, never sent to clients)
  given: [],       // 9x9 bool: pre-filled cells (immutable)
  filled: [],      // per-player 9x9 bool: correctly filled cells
  counts: [],      // per-player count of correctly filled blanks
  blanks: 0,       // total blank cells (win target per player)
  currentPlayer: -1,
  winner: null,
});

exports.initGame = (state, playerCount) => {
  const { puzzle, solution, given } = generateSudoku();
  state.puzzle = puzzle;
  state.solution = solution;
  state.given = given;

  let blanks = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] === 0) blanks++;
  state.blanks = blanks;

  state.filled = [];
  state.counts = [];
  for (let p = 0; p < playerCount; p++) {
    const grid = [];
    for (let r = 0; r < 9; r++) grid.push(Array(9).fill(false));
    state.filled.push(grid);
    state.counts.push(0);
  }

  state.currentPlayer = -1;
  state.winner = null;
};

// Per-player view. NEVER includes the solution.
exports.playerView = (state, playerIndex) => {
  const board = [];
  for (let r = 0; r < 9; r++) {
    board[r] = [];
    for (let c = 0; c < 9; c++) {
      const isGiven = state.given[r][c];
      const mine = state.filled[playerIndex][r][c];
      const value = isGiven ? state.puzzle[r][c] : (mine ? state.solution[r][c] : 0);
      board[r][c] = { value: value, given: isGiven, mineFill: mine };
    }
  }
  return {
    board: board,
    doneCount: state.counts[playerIndex],
    blanks: state.blanks,
    winner: state.winner,
    currentPlayer: state.currentPlayer,
  };
};

exports.handleMove = (data, state, playerIndex) => {
  if (state.winner !== null) return 'g_game_over';

  const row = data.row, col = data.col, val = data.val;

  if (row < 0 || row > 8 || col < 0 || col > 8) return 'su_invalid';
  if (state.given[row][col]) return 'su_illegal_cell';
  if (typeof val !== 'number' || val < 1 || val > 9 || !isFinite(val)) return 'su_invalid';

  if (state.solution[row][col] !== val) return 'su_wrong';

  if (!state.filled[playerIndex][row][col]) {
    state.filled[playerIndex][row][col] = true;
    state.counts[playerIndex]++;
    if (state.counts[playerIndex] >= state.blanks) state.winner = playerIndex;
  }
  return null;
};

// No-op tick: the realtime loop in server.js already drives bots every tickMs.
exports.tick = (state) => {};
