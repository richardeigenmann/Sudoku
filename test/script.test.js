const { isSingleton, drawGrid, setNumber, removeOption, getNumber } = require('../src/script');

describe('Sudoku functions', () => {
  beforeEach(() => {
    // Set up the DOM with the Sudoku grid
    document.body.innerHTML = '<div id="Sudoku"></div>';
    drawGrid();
  });

  test('isSingleton should return true for a singleton in a row', () => {
    // Example Scenario:
    // In row 1, only cell (1,1) can be the number 5.
    
    // Set up the grid state
    // Let's assume we have a mostly empty grid.
    // We want to check if the number 5 is a singleton in cell (1,1).

    // First, let's "remove" the option '5' from all other cells in the same row, column, and block.
    // For simplicity, we'll focus on the row.
    for (let col = 2; col <= 9; col++) {
      removeOption(1, col, 5);
    }

    // Now, check if 5 is a singleton at (1,1)
    // The function checks a number (index) at a given row and col.
    const result = isSingleton(1, 1, 5);

    // Because we removed 5 from all other cells in the row, it should be a singleton.
    expect(result).toBe(true);
  });

  test('isSingleton should return false when number is not a singleton', () => {
    // No options are removed, so 5 is a possible number in all cells of row 1.
    const result = isSingleton(1, 1, 5);
    expect(result).toBe(false);
  });

  test('getNumber should return 0 for an empty cell', () => {
    expect(getNumber(1, 1)).toBe(0);
  });

  test('setNumber should place a number in a cell', () => {
    setNumber(2, 3, 7);
    expect(getNumber(2, 3)).toBe("7");
  });
});
