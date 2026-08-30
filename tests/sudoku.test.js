const test = require('node:test');
const assert = require('node:assert/strict');

const sudokuGen = require('../games/lib/sudoku-gen');
const sudoku = require('../games/sudoku');
const sudokuBot = require('../bots/sudoku');

// ---- Helpers ----

// Find the first blank (puzzle[r][c] === 0) cell coordinates.
function findBlank(puzzle) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] === 0) return { r, c };
  return null;
}

// Find the first given (non-blank) cell coordinates.
function findGiven(puzzle) {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (puzzle[r][c] !== 0) return { r, c };
  return null;
}

function makeState(playerCount) {
  const state = sudoku.createState();
  sudoku.initGame(state, playerCount || 2);
  return state;
}

// A complete grid is valid if every row, column, and 3x3 box is a permutation of 1..9.
function assertValidGrid(solution) {
  for (let r = 0; r < 9; r++) {
    assert.equal(new Set(solution[r]).size, 9, 'row ' + r + ' has duplicates');
    for (const v of solution[r]) assert.ok(v >= 1 && v <= 9);
  }
  for (let c = 0; c < 9; c++) {
    const col = new Set();
    for (let r = 0; r < 9; r++) col.add(solution[r][c]);
    assert.equal(col.size, 9, 'col ' + c + ' has duplicates');
  }
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const box = new Set();
      for (let r = br * 3; r < br * 3 + 3; r++)
        for (let c = bc * 3; c < bc * 3 + 3; c++)
          box.add(solution[r][c]);
      assert.equal(box.size, 9, 'box ' + br + ',' + bc + ' has duplicates');
    }
}

// ---- Generator tests ----

test('sudoku-gen: generateSudoku returns 9x9 puzzle/solution/given', () => {
  const { puzzle, solution, given } = sudokuGen.generateSudoku();
  assert.equal(puzzle.length, 9);
  assert.equal(solution.length, 9);
  assert.equal(given.length, 9);
  for (let r = 0; r < 9; r++) {
    assert.equal(puzzle[r].length, 9);
    assert.equal(solution[r].length, 9);
    assert.equal(given[r].length, 9);
  }
});

test('sudoku-gen: solution is a valid complete grid', () => {
  const { solution } = sudokuGen.generateSudoku();
  assertValidGrid(solution);
});

test('sudoku-gen: given flags match non-blank puzzle cells', () => {
  const { puzzle, given } = sudokuGen.generateSudoku();
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      assert.equal(given[r][c], puzzle[r][c] !== 0, 'given mismatch at ' + r + ',' + c);
});

test('sudoku-gen: puzzle has at least one blank', () => {
  const { puzzle } = sudokuGen.generateSudoku();
  assert.ok(findBlank(puzzle), 'puzzle should contain blanks');
});

test('sudoku-gen: puzzle has a unique solution', () => {
  const { puzzle } = sudokuGen.generateSudoku();
  assert.equal(sudokuGen.countSolutions(puzzle, 2), 1);
});

test('sudoku-gen: countSolutions stops at the limit', () => {
  // An empty grid has astronomically many solutions; with limit=2 it must return <= 2.
  const empty = Array.from({ length: 9 }, () => Array(9).fill(0));
  const c = sudokuGen.countSolutions(empty, 2);
  assert.ok(c >= 1 && c <= 2, 'expected 1..2, got ' + c);
});

// ---- handleMove tests ----

test('sudoku: correct fill increments count and marks cell', () => {
  const state = makeState(2);
  const blank = findBlank(state.puzzle);
  const correct = state.solution[blank.r][blank.c];
  const before = state.counts[0];

  const err = sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: correct }, state, 0);
  assert.equal(err, null);
  assert.equal(state.counts[0], before + 1);
  assert.equal(state.filled[0][blank.r][blank.c], true);
});

test('sudoku: wrong fill returns su_wrong without mutating state', () => {
  const state = makeState(2);
  const blank = findBlank(state.puzzle);
  const correct = state.solution[blank.r][blank.c];
  const wrong = correct === 9 ? 8 : correct + 1;
  const countsBefore = state.counts[0];

  const err = sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: wrong }, state, 0);
  assert.equal(err, 'su_wrong');
  assert.equal(state.counts[0], countsBefore, 'count must not change on wrong fill');
  assert.equal(state.filled[0][blank.r][blank.c], false, 'filled must not change on wrong fill');
});

test('sudoku: given cell is rejected', () => {
  const state = makeState(2);
  const given = findGiven(state.puzzle);
  assert.ok(given, 'puzzle should have a given cell');
  const err = sudoku.handleMove({ type: 'fill', row: given.r, col: given.c, val: state.puzzle[given.r][given.c] }, state, 0);
  assert.equal(err, 'su_illegal_cell');
});

test('sudoku: out-of-bounds row/col rejected', () => {
  const state = makeState(2);
  assert.equal(sudoku.handleMove({ type: 'fill', row: -1, col: 0, val: 5 }, state, 0), 'su_invalid');
  assert.equal(sudoku.handleMove({ type: 'fill', row: 0, col: 9, val: 5 }, state, 0), 'su_invalid');
  assert.equal(sudoku.handleMove({ type: 'fill', row: 9, col: 0, val: 5 }, state, 0), 'su_invalid');
});

test('sudoku: invalid value rejected', () => {
  const state = makeState(2);
  const blank = findBlank(state.puzzle);
  assert.equal(sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: 0 }, state, 0), 'su_invalid');
  assert.equal(sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: 10 }, state, 0), 'su_invalid');
  assert.equal(sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: 'x' }, state, 0), 'su_invalid');
});

test('sudoku: move rejected after game over', () => {
  const state = makeState(2);
  state.winner = 0;
  const blank = findBlank(state.puzzle);
  const err = sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: state.solution[blank.r][blank.c] }, state, 1);
  assert.equal(err, 'g_game_over');
});

test('sudoku: filling all blanks wins the game', () => {
  const state = makeState(2);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.puzzle[r][c] === 0)
        sudoku.handleMove({ type: 'fill', row: r, col: c, val: state.solution[r][c] }, state, 1);
  assert.equal(state.winner, 1);
  assert.equal(state.counts[1], state.blanks);
});

// ---- playerView tests ----

test('sudoku: playerView hides the solution', () => {
  const state = makeState(2);
  const view = sudoku.playerView(state, 0);
  assert.equal(view.board.length, 9);
  assert.equal(view.solution, undefined, 'playerView must never expose solution');
  // Given cells show their value; blanks show 0.
  const blank = findBlank(state.puzzle);
  assert.equal(view.board[blank.r][blank.c].value, 0);
  assert.equal(view.board[blank.r][blank.c].given, false);
  assert.equal(view.doneCount, state.counts[0]);
  assert.equal(view.winner, state.winner);
});

test('sudoku: playerView shows own correct fills', () => {
  const state = makeState(2);
  const blank = findBlank(state.puzzle);
  const correct = state.solution[blank.r][blank.c];
  sudoku.handleMove({ type: 'fill', row: blank.r, col: blank.c, val: correct }, state, 0);
  const view = sudoku.playerView(state, 0);
  assert.equal(view.board[blank.r][blank.c].value, correct);
  assert.equal(view.board[blank.r][blank.c].mineFill, true);
  assert.equal(view.doneCount, 1);
});

// ---- Bot tests ----

test('sudoku: bot returns a structurally valid fill', () => {
  const state = makeState(2);
  const bot = sudokuBot.createBot(0);
  const move = bot.getMove(state);
  assert.equal(move.type, 'fill');
  assert.ok(move.row >= 0 && move.row <= 8);
  assert.ok(move.col >= 0 && move.col <= 8);
  assert.ok(move.val >= 1 && move.val <= 9);
  // Must target a blank the bot has not yet filled.
  assert.equal(state.puzzle[move.row][move.col], 0);
  assert.equal(state.filled[0][move.row][move.col], false);
});

test('sudoku: bot returns pass when nothing left to fill', () => {
  const state = makeState(2);
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.puzzle[r][c] === 0)
        state.filled[0][r][c] = true;
  const bot = sudokuBot.createBot(0);
  assert.deepEqual(bot.getMove(state), { pass: true });
});

test('sudoku: bot fill is correct (no mistake) on a fresh board', () => {
  // 3% mistake chance means this could rarely fail; run against a fresh board
  // and verify the returned value matches the solution for the targeted cell.
  const state = makeState(2);
  const bot = sudokuBot.createBot(0);
  const move = bot.getMove(state);
  assert.equal(move.val, state.solution[move.row][move.col]);
});
