import { describe, test, expect } from 'vitest';
import {
    orderCorners,
    validateSudokuGrid,
    getInverseHomography,
    detectGridCornersPureJS,
    recognizePrintedCell,
    extractCellCanvas,
    recognizeCellWithTesseract,
    applySharpeningFilter,
    applyLightingFilter
} from '../src/scanner.js';

describe('Scanner helper functions', () => {
    test('orderCorners should correctly sort 4 arbitrary unordered corners into TL, TR, BR, BL', () => {
        const unordered = [
            { x: 300, y: 350 }, // Bottom-Right
            { x: 10, y: 15 },   // Top-Left
            { x: 20, y: 360 },  // Bottom-Left
            { x: 310, y: 20 }   // Top-Right
        ];

        const [tl, tr, br, bl] = orderCorners(unordered);

        expect(tl).toEqual({ x: 10, y: 15 });
        expect(tr).toEqual({ x: 310, y: 20 });
        expect(br).toEqual({ x: 300, y: 350 });
        expect(bl).toEqual({ x: 20, y: 360 });
    });

    test('orderCorners should throw on invalid input', () => {
        expect(() => orderCorners([{ x: 0, y: 0 }])).toThrow();
    });

    test('validateSudokuGrid detects row collisions', () => {
        const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
        grid[0][0] = 5;
        grid[0][4] = 5; // Duplicate in row 0

        const conflicts = validateSudokuGrid(grid);
        expect(conflicts.has('0,0')).toBe(true);
        expect(conflicts.has('0,4')).toBe(true);
        expect(conflicts.has('0,1')).toBe(false);
    });

    test('validateSudokuGrid detects column collisions', () => {
        const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
        grid[2][3] = 7;
        grid[8][3] = 7; // Duplicate in column 3

        const conflicts = validateSudokuGrid(grid);
        expect(conflicts.has('2,3')).toBe(true);
        expect(conflicts.has('8,3')).toBe(true);
    });

    test('validateSudokuGrid returns empty set for valid grid', () => {
        const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
        grid[0][0] = 1;
        grid[0][1] = 2;
        grid[1][0] = 3;

        const conflicts = validateSudokuGrid(grid);
        expect(conflicts.size).toBe(0);
    });

    test('getInverseHomography calculates valid 3x3 matrix for square mapping', () => {
        const src = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
        const dst = [{ x: 0, y: 0 }, { x: 450, y: 0 }, { x: 450, y: 450 }, { x: 0, y: 450 }];

        const H = getInverseHomography(src, dst);
        expect(H).toHaveLength(9);
        // Point (450, 450) in dst should map back to (100, 100) in src
        const denom = H[6] * 450 + H[7] * 450 + 1;
        const x = (H[0] * 450 + H[1] * 450 + H[2]) / denom;
        const y = (H[3] * 450 + H[4] * 450 + H[5]) / denom;

        expect(Math.round(x)).toBe(100);
        expect(Math.round(y)).toBe(100);
    });

    test('detectGridCornersPureJS returns 4 valid corners on canvas', () => {
        const mockCanvas = {
            width: 480,
            height: 360,
            getContext: () => ({
                getImageData: () => {
                    const data = new Uint8ClampedArray(480 * 360 * 4);
                    // Fill with white
                    data.fill(255);
                    return { data };
                }
            })
        };

        const corners = detectGridCornersPureJS(mockCanvas);
        expect(corners).toHaveLength(4);
        expect(corners[0].x).toBeLessThan(corners[1].x);
        expect(corners[0].y).toBeLessThan(corners[3].y);
    });

    test('recognizePrintedCell returns 0 when no canvas context is available or blank', () => {
        const dummyCanvas = { width: 450 };
        expect(recognizePrintedCell(dummyCanvas, 0, 0)).toBe(0);
    });

    test('extractCellCanvas returns isBlank=true when canvas context is unavailable or blank', () => {
        const dummyCanvas = { width: 450 };
        const result = extractCellCanvas(dummyCanvas, 0, 0);
        expect(result.isBlank).toBe(true);
        expect(result.cellCanvas).toBeNull();
    });

    test('recognizeCellWithTesseract handles null or mock worker safely', async () => {
        expect(await recognizeCellWithTesseract(null, null)).toBe(0);

        const mockWorker = {
            recognize: async () => ({ data: { text: ' 7 \n' } })
        };
        const dummyCanvas = {};
        const digit = await recognizeCellWithTesseract(mockWorker, dummyCanvas);
        expect(digit).toBe(7);
    });

    test('applySharpeningFilter safely handles invalid canvas or missing context', () => {
        expect(applySharpeningFilter(null)).toBeNull();
        const dummyCanvas = { width: 0 };
        expect(applySharpeningFilter(dummyCanvas)).toBe(dummyCanvas);
        const dummyCanvasPositive = { width: 100 };
        expect(applySharpeningFilter(dummyCanvasPositive, 0)).toBe(dummyCanvasPositive);
    });

    test('applyLightingFilter safely handles invalid canvas, identity parameters, and missing context', () => {
        expect(applyLightingFilter(null)).toBeNull();
        const dummyCanvas = { width: 0 };
        expect(applyLightingFilter(dummyCanvas, 10, 1.2)).toBe(dummyCanvas);
        const dummyCanvasPositive = { width: 100 };
        // Identity returns same canvas without processing
        expect(applyLightingFilter(dummyCanvasPositive, 0, 1.0)).toBe(dummyCanvasPositive);
    });
});
