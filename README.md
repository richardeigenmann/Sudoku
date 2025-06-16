# Sudoku visualiser

A tool to help you solve Sudoku puzzles yourself.

My method of solving Sudo puzzles involves me writing all possible numbers into the free squares. This way I can identify the squares where only one number is possible and then pick that.

As my partner is better at solving Sudoku puzzles, I wrote this JavaScript app in 2013 to get even.

## Try it out (for free)

https://richardeigenmann.github.io/Sudoku/

Give me a Star if you like it!

## Description

This app draws a Sudoku grid and allows the user to pick the numbers she wants to place in the grid. As each number is picked, the options that are no longer possible in the other fields are removed.

If a number is "forced" because it is the only one that can take that place in the row, colum or grid then it is highlighted.

The steps and puzzle can be saved by clicking the save button. To reload a saved puzzle drag the saved file over the list of steps.

## What it doesn't do

This is not a Sudoku solver. It just shows you the cells that are populated and shows what numbers remain possible in the other cells.

## Additional reading

Wikipedia on Sudoku: http://en.wikipedia.org/wiki/Sudoku 
Scientific American on Sudoku: http://www.cs.virginia.edu/~robins/The_Science_Behind_SudoKu.pdf
