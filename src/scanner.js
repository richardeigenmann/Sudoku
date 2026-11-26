/**
 * Sudoku Scanner Module
 * Built specifically for printed magazine and newspaper Sudokus.
 * Uses pure JS perspective warping and Tesseract.js OCR with digit whitelisting.
 */
import { clearSteps, pickNumber, recordStep } from './script.js';
import { createWorker, PSM } from 'tesseract.js';

let cachedWorker = null;
let workerInitPromise = null;

/**
 * Initializes and returns a singleton Tesseract.js Worker configured for digits 1-9.
 * @param {Function} [onProgress] - Optional progress callback
 * @returns {Promise<import('tesseract.js').Worker>}
 */
export async function getTesseractWorker(onProgress = null) {
    if (cachedWorker) return cachedWorker;
    if (workerInitPromise) return workerInitPromise;

    workerInitPromise = (async () => {
        const worker = await createWorker('eng', 1, {
            logger: (m) => {
                if (onProgress && m && m.status) {
                    onProgress(m);
                }
            }
        });

        await worker.setParameters({
            tessedit_char_whitelist: '123456789',
            tessedit_pageseg_mode: PSM.SINGLE_CHAR,
            load_system_dawg: '0',
            load_freq_dawg: '0',
        });

        cachedWorker = worker;
        return worker;
    })();

    return workerInitPromise;
}

/**
 * Terminates the cached Tesseract worker if active.
 */
export async function terminateTesseractWorker() {
    if (cachedWorker) {
        await cachedWorker.terminate();
        cachedWorker = null;
        workerInitPromise = null;
    }
}

/**
 * Applies brightness and contrast adjustment to a canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number} [brightness=0] - -100 to 100
 * @param {number} [contrast=1.0] - 0.5 to 2.0
 * @returns {HTMLCanvasElement}
 */
export function applyLightingFilter(canvas, brightness = 0, contrast = 1.0) {
    if (!canvas || !canvas.width || typeof document === 'undefined') return canvas;
    if (brightness === 0 && contrast === 1.0) return canvas;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return canvas;

    const outImgData = outCtx.createImageData(w, h);
    const dst = outImgData.data;

    for (let i = 0; i < src.length; i += 4) {
        for (let c = 0; c < 3; c++) {
            const val = contrast * (src[i + c] - 128) + 128 + brightness;
            dst[i + c] = Math.max(0, Math.min(255, val));
        }
        dst[i + 3] = src[i + 3];
    }

    outCtx.putImageData(outImgData, 0, 0);
    return outCanvas;
}

/**
 * Applies a 3x3 Laplacian sharpening filter to a canvas.
 * Kernel: [ 0, -k, 0; -k, 1+4k, -k; 0, -k, 0 ]
 * @param {HTMLCanvasElement} canvas
 * @param {number} [strength=0.7] - 0.0 (no sharpening) to 1.5 (heavy sharpening)
 * @returns {HTMLCanvasElement} A new sharpened canvas
 */
export function applySharpeningFilter(canvas, strength = 0.7) {
    if (!canvas || !canvas.width || typeof document === 'undefined') return canvas;
    if (strength <= 0) return canvas;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const imgData = ctx.getImageData(0, 0, w, h);
    const src = imgData.data;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return canvas;

    const outImgData = outCtx.createImageData(w, h);
    const dst = outImgData.data;

    const k = strength;
    const center = 1 + 4 * k;

    for (let y = 0; y < h; y++) {
        const row = y * w;
        const prevRow = (y > 0 ? y - 1 : 0) * w;
        const nextRow = (y < h - 1 ? y + 1 : h - 1) * w;

        for (let x = 0; x < w; x++) {
            const prevCol = x > 0 ? x - 1 : 0;
            const nextCol = x < w - 1 ? x + 1 : w - 1;

            const idx = (row + x) * 4;
            const topIdx = (prevRow + x) * 4;
            const bottomIdx = (nextRow + x) * 4;
            const leftIdx = (row + prevCol) * 4;
            const rightIdx = (row + nextCol) * 4;

            for (let c = 0; c < 3; c++) {
                const val = center * src[idx + c]
                    - k * (src[topIdx + c] + src[bottomIdx + c] + src[leftIdx + c] + src[rightIdx + c]);
                dst[idx + c] = Math.max(0, Math.min(255, val));
            }
            dst[idx + 3] = src[idx + 3]; // Alpha
        }
    }

    outCtx.putImageData(outImgData, 0, 0);
    return outCanvas;
}

/**
 * Extracts a cell canvas with inner cropping and contrast stretching.
 * Checks if the cell contains enough ink to be a digit clue.
 * @param {HTMLCanvasElement} gridCanvas - Warped grid canvas
 * @param {number} r - Row 0..8
 * @param {number} c - Col 0..8
 * @param {Object} [options]
 * @param {number} [options.sensitivity=1.0] - Sensitivity multiplier (0.8 to 1.3)
 * @param {number} [options.marginRatio=0.12] - Margin crop ratio (default 12%)
 * @returns {{ isBlank: boolean, cellCanvas: HTMLCanvasElement | null }}
 */
export function extractCellCanvas(gridCanvas, r, c, options = {}) {
    if (!gridCanvas || !gridCanvas.width || typeof document === 'undefined') {
        return { isBlank: true, cellCanvas: null };
    }

    const sensitivity = options.sensitivity !== undefined ? options.sensitivity : 1.0;
    const marginRatio = options.marginRatio !== undefined ? options.marginRatio : 0.12;

    const cellSize = gridCanvas.width / 9;
    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = cellSize;
    cellCanvas.height = cellSize;
    const ctx = cellCanvas.getContext('2d');
    if (!ctx) return { isBlank: true, cellCanvas: null };

    ctx.drawImage(
        gridCanvas,
        c * cellSize, r * cellSize, cellSize, cellSize,
        0, 0, cellSize, cellSize
    );

    // Margin crop (default 12% to protect off-center digits while ignoring grid lines)
    const margin = Math.round(cellSize * marginRatio);
    const innerSize = cellSize - 2 * margin;
    if (innerSize <= 4) return { isBlank: true, cellCanvas: null };

    const imgData = ctx.getImageData(margin, margin, innerSize, innerSize);
    const pixels = imgData.data;

    let sum = 0;
    let minLum = 255;
    let maxLum = 0;
    const gray = new Uint8Array(innerSize * innerSize);

    for (let i = 0; i < pixels.length; i += 4) {
        const val = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
        const gIdx = i / 4;
        gray[gIdx] = val;
        sum += val;
        if (val < minLum) minLum = val;
        if (val > maxLum) maxLum = val;
    }

    // Dynamic range check: completely flat background has virtually no variance
    if (maxLum - minLum < 18) {
        return { isBlank: true, cellCanvas: null };
    }

    const mean = sum / (innerSize * innerSize);
    // Dynamic threshold based on local contrast and user sensitivity
    const thresholdFactor = 0.88 * sensitivity;
    const threshold = Math.min(maxLum - 8, mean * thresholdFactor);

    let minX = innerSize, maxX = 0, minY = innerSize, maxY = 0;
    let inkCount = 0;

    for (let y = 0; y < innerSize; y++) {
        for (let x = 0; x < innerSize; x++) {
            if (gray[y * innerSize + x] < threshold) {
                inkCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    // Lenient ink threshold: only ~1.0% or 14 pixels minimum so thin '1' and '7' pass
    const minInkPixels = Math.max(14, Math.round(innerSize * innerSize * 0.010));
    if (inkCount < minInkPixels || maxX <= minX || maxY <= minY) {
        return { isBlank: true, cellCanvas: null };
    }

    const digitW = maxX - minX + 1;
    const digitH = maxY - minY + 1;
    // Digits are at least 6px high and 2px wide
    if (digitH < 6 || digitW < 2) {
        return { isBlank: true, cellCanvas: null };
    }

    // Prepare clean 80x80 canvas with high contrast for Tesseract
    const ocrCanvas = document.createElement('canvas');
    const ocrSize = 80;
    ocrCanvas.width = ocrSize;
    ocrCanvas.height = ocrSize;
    const octx = ocrCanvas.getContext('2d');
    if (!octx) return { isBlank: true, cellCanvas: null };

    // Fill white background
    octx.fillStyle = '#ffffff';
    octx.fillRect(0, 0, ocrSize, ocrSize);

    // Scale digit to ~50px height with padding
    const scale = 50 / Math.max(digitW, digitH);
    const dw = Math.round(digitW * scale);
    const dh = Math.round(digitH * scale);
    const dx = Math.round((ocrSize - dw) / 2);
    const dy = Math.round((ocrSize - dh) / 2);

    octx.drawImage(
        cellCanvas,
        margin + minX, margin + minY, digitW, digitH,
        dx, dy, dw, dh
    );

    // High-contrast binarization
    const ocrImgData = octx.getImageData(0, 0, ocrSize, ocrSize);
    const ocrPixels = ocrImgData.data;
    for (let i = 0; i < ocrPixels.length; i += 4) {
        const g = 0.299 * ocrPixels[i] + 0.587 * ocrPixels[i + 1] + 0.114 * ocrPixels[i + 2];
        const val = g < threshold ? 0 : 255;
        ocrPixels[i] = val;
        ocrPixels[i + 1] = val;
        ocrPixels[i + 2] = val;
    }
    octx.putImageData(ocrImgData, 0, 0);

    return { isBlank: false, cellCanvas: ocrCanvas };
}

/**
 * Recognizes a digit (1-9) from an extracted cell canvas using Tesseract.
 * @param {import('tesseract.js').Worker} worker
 * @param {HTMLCanvasElement} cellCanvas
 * @returns {Promise<number>} Digit 1-9 or 0 if unreadable
 */
export async function recognizeCellWithTesseract(worker, cellCanvas) {
    if (!worker || !cellCanvas) return 0;
    try {
        const ret = await worker.recognize(cellCanvas);
        const text = ret.data.text.replace(/[^1-9]/g, '');
        if (text.length > 0) {
            return parseInt(text[0], 10);
        }
    } catch (e) {
        console.warn('Tesseract recognition warning:', e);
    }
    return 0;
}

let cachedTemplates = null;

/**
 * Generates reference templates for printed digits 1-9 using native browser fonts.
 */
export function getPrintedDigitTemplates() {
    if (cachedTemplates) return cachedTemplates;

    const fonts = [
        'bold 28px sans-serif',
        'bold 28px Arial',
        'bold 28px "Trebuchet MS"',
        'bold 28px "Segoe UI"'
    ];

    const templates = {};
    for (let d = 1; d <= 9; d++) {
        templates[d] = [];
    }

    for (const font of fonts) {
        for (let d = 1; d <= 9; d++) {
            const canvas = document.createElement('canvas');
            canvas.width = 36;
            canvas.height = 36;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 36, 36);

            ctx.fillStyle = '#ffffff';
            ctx.font = font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(d), 18, 18);

            const imgData = ctx.getImageData(0, 0, 36, 36);
            const data = imgData.data;
            let minX = 36, maxX = 0, minY = 36, maxY = 0;
            for (let y = 0; y < 36; y++) {
                for (let x = 0; x < 36; x++) {
                    if (data[(y * 36 + x) * 4] > 80) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (maxX > minX && maxY > minY) {
                const gw = maxX - minX + 1;
                const gh = maxY - minY + 1;
                const normCanvas = document.createElement('canvas');
                normCanvas.width = 32;
                normCanvas.height = 32;
                const nctx = normCanvas.getContext('2d');
                nctx.fillStyle = '#000000';
                nctx.fillRect(0, 0, 32, 32);

                const scale = 24 / Math.max(gw, gh);
                const targetW = Math.round(gw * scale);
                const targetH = Math.round(gh * scale);
                const ox = Math.round((32 - targetW) / 2);
                const oy = Math.round((32 - targetH) / 2);

                nctx.drawImage(canvas, minX, minY, gw, gh, ox, oy, targetW, targetH);
                const nData = nctx.getImageData(0, 0, 32, 32).data;
                const floatArr = new Float32Array(32 * 32);
                let mean = 0;
                for (let i = 0; i < 32 * 32; i++) {
                    const val = nData[i * 4] / 255.0;
                    floatArr[i] = val;
                    mean += val;
                }
                mean /= (32 * 32);
                let variance = 0;
                for (let i = 0; i < 32 * 32; i++) {
                    floatArr[i] -= mean;
                    variance += floatArr[i] * floatArr[i];
                }
                const std = Math.sqrt(variance) || 1e-5;
                for (let i = 0; i < 32 * 32; i++) {
                    floatArr[i] /= std;
                }

                templates[d].push({
                    font,
                    vector: floatArr,
                    aspectRatio: gw / gh
                });
            }
        }
    }

    cachedTemplates = templates;
    return templates;
}

/**
 * Counts enclosed holes (loops) in a binary digit glyph using flood fill.
 */
function countDigitHoles(gray, innerSize, minX, maxX, minY, maxY, threshold) {
    const pad = 2;
    const w = maxX - minX + 1 + 2 * pad;
    const h = maxY - minY + 1 + 2 * pad;
    const mask = new Uint8Array(w * h);

    for (let y = 0; y < maxY - minY + 1; y++) {
        for (let x = 0; x < maxX - minX + 1; x++) {
            if (gray[(minY + y) * innerSize + (minX + x)] < threshold) {
                mask[(y + pad) * w + (x + pad)] = 1;
            }
        }
    }

    const visited = new Uint8Array(w * h);
    const queue = [0];
    visited[0] = 1;

    while (queue.length > 0) {
        const idx = queue.pop();
        const cy = Math.floor(idx / w);
        const cx = idx % w;

        for (const [ny, nx] of [[cy + 1, cx], [cy - 1, cx], [cy, cx + 1], [cy, cx - 1]]) {
            if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                const nIdx = ny * w + nx;
                if (!visited[nIdx] && mask[nIdx] === 0) {
                    visited[nIdx] = 1;
                    queue.push(nIdx);
                }
            }
        }
    }

    let holes = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!visited[idx] && mask[idx] === 0) {
                holes++;
                const holeQueue = [idx];
                visited[idx] = 1;
                while (holeQueue.length > 0) {
                    const hIdx = holeQueue.pop();
                    const hy = Math.floor(hIdx / w);
                    const hx = hIdx % w;
                    for (const [ny, nx] of [[hy + 1, hx], [hy - 1, hx], [hy, hx + 1], [hy, hx - 1]]) {
                        if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
                            const nIdx = ny * w + nx;
                            if (!visited[nIdx] && mask[nIdx] === 0) {
                                visited[nIdx] = 1;
                                holeQueue.push(nIdx);
                            }
                        }
                    }
                }
            }
        }
    }

    return holes;
}

/**
 * Recognizes a printed digit (1-9) in cell (r, c) of the 450x450 warped grid.
 * Returns 0 if the cell is blank.
 * @param {HTMLCanvasElement} gridCanvas - 450x450 square canvas
 * @param {number} r - Row index 0..8
 * @param {number} c - Column index 0..8
 * @returns {number} Digit 1..9, or 0 if empty
 */
export function recognizePrintedCell(gridCanvas, r, c) {
    const cellSize = gridCanvas.width / 9;
    const cellCanvas = document.createElement('canvas');
    cellCanvas.width = cellSize;
    cellCanvas.height = cellSize;
    const ctx = cellCanvas.getContext('2d');
    if (!ctx) return 0;

    ctx.drawImage(
        gridCanvas,
        c * cellSize, r * cellSize, cellSize, cellSize,
        0, 0, cellSize, cellSize
    );

    // Deep margin crop: inner 22% to 78% of the cell to completely avoid grid lines
    const margin = Math.round(cellSize * 0.22);
    const innerSize = cellSize - 2 * margin;
    const imgData = ctx.getImageData(margin, margin, innerSize, innerSize);
    const pixels = imgData.data;

    let sum = 0;
    const gray = new Uint8Array(innerSize * innerSize);
    for (let i = 0; i < pixels.length; i += 4) {
        const val = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
        gray[i / 4] = val;
        sum += val;
    }
    const mean = sum / (innerSize * innerSize);
    const threshold = mean * 0.82;

    let minX = innerSize, maxX = 0, minY = innerSize, maxY = 0;
    let inkCount = 0;
    for (let y = 0; y < innerSize; y++) {
        for (let x = 0; x < innerSize; x++) {
            if (gray[y * innerSize + x] < threshold) {
                inkCount++;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    const minInkPixels = Math.round(innerSize * innerSize * 0.045);
    if (inkCount < minInkPixels || maxX <= minX || maxY <= minY) {
        return 0; // Blank cell
    }

    const digitW = maxX - minX + 1;
    const digitH = maxY - minY + 1;
    if (digitH < 8 || digitW < 3) {
        return 0;
    }

    const numHoles = countDigitHoles(gray, innerSize, minX, maxX, minY, maxY, threshold);

    const normCanvas = document.createElement('canvas');
    normCanvas.width = 32;
    normCanvas.height = 32;
    const nctx = normCanvas.getContext('2d');
    if (!nctx) return 0;

    nctx.fillStyle = '#000000';
    nctx.fillRect(0, 0, 32, 32);

    const digitCanvas = document.createElement('canvas');
    digitCanvas.width = digitW;
    digitCanvas.height = digitH;
    const dctx = digitCanvas.getContext('2d');
    if (!dctx) return 0;

    const dImg = dctx.createImageData(digitW, digitH);
    for (let y = 0; y < digitH; y++) {
        for (let x = 0; x < digitW; x++) {
            const isDark = gray[(minY + y) * innerSize + (minX + x)] < threshold;
            const idx = (y * digitW + x) * 4;
            dImg.data[idx] = isDark ? 255 : 0;
            dImg.data[idx + 1] = isDark ? 255 : 0;
            dImg.data[idx + 2] = isDark ? 255 : 0;
            dImg.data[idx + 3] = 255;
        }
    }
    dctx.putImageData(dImg, 0, 0);

    const scale = 24 / Math.max(digitW, digitH);
    const targetW = Math.round(digitW * scale);
    const targetH = Math.round(digitH * scale);
    const ox = Math.round((32 - targetW) / 2);
    const oy = Math.round((32 - targetH) / 2);
    nctx.drawImage(digitCanvas, 0, 0, digitW, digitH, ox, oy, targetW, targetH);

    const normData = nctx.getImageData(0, 0, 32, 32).data;
    const vector = new Float32Array(32 * 32);
    let vMean = 0;
    for (let i = 0; i < 32 * 32; i++) {
        const v = normData[i * 4] / 255.0;
        vector[i] = v;
        vMean += v;
    }
    vMean /= (32 * 32);
    let variance = 0;
    for (let i = 0; i < 32 * 32; i++) {
        vector[i] -= vMean;
        variance += vector[i] * vector[i];
    }
    const std = Math.sqrt(variance) || 1e-5;
    for (let i = 0; i < 32 * 32; i++) {
        vector[i] /= std;
    }

    const templates = getPrintedDigitTemplates();
    let bestDigit = 0;
    let bestScore = -1;

    for (let d = 1; d <= 9; d++) {
        const fontTemplates = templates[d] || [];
        for (const t of fontTemplates) {
            let dot = 0;
            for (let i = 0; i < 32 * 32; i++) {
                dot += vector[i] * t.vector[i];
            }
            const corr = dot / (32 * 32);

            let bonus = 0;
            if (numHoles === 2 && d === 8) bonus += 0.35;
            if (numHoles === 1 && (d === 6 || d === 9 || d === 4)) bonus += 0.25;
            if (numHoles === 0 && (d === 1 || d === 2 || d === 3 || d === 5 || d === 7)) bonus += 0.15;
            if (numHoles === 2 && d !== 8) bonus -= 0.4;
            if (numHoles === 1 && (d === 1 || d === 2 || d === 3 || d === 7)) bonus -= 0.3;

            if (d === 1 && digitW / digitH < 0.45) bonus += 0.25;
            if (d !== 1 && digitW / digitH < 0.35) bonus -= 0.3;

            const finalScore = corr + bonus;
            if (finalScore > bestScore) {
                bestScore = finalScore;
                bestDigit = d;
            }
        }
    }

    return bestDigit;
}

/**
 * Orders 4 points into [top-left, top-right, bottom-right, bottom-left].
 * @param {Array<{x: number, y: number}>} points 
 * @returns {Array<{x: number, y: number}>}
 */
export function orderCorners(points) {
    if (!points || points.length !== 4) {
        throw new Error('orderCorners requires exactly 4 points');
    }

    // Sort by sum (x + y): top-left has smallest sum, bottom-right has largest sum
    const sumSorted = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const topLeft = sumSorted[0];
    const bottomRight = sumSorted[3];

    // Top-right and bottom-left are the remaining two;
    // top-right has larger x - y (or smaller y)
    const remaining = [sumSorted[1], sumSorted[2]];
    remaining.sort((a, b) => (a.x - a.y) - (b.x - b.y));
    const bottomLeft = remaining[0];
    const topRight = remaining[1];

    return [topLeft, topRight, bottomRight, bottomLeft];
}

/**
 * Checks a 9x9 grid for duplicates in rows, columns, and 3x3 blocks.
 * @param {number[][]} grid - 9x9 numbers (0 = empty, 1-9 = clues)
 * @returns {Set<string>} - Set of conflict keys "row,col" (0-indexed)
 */
export function validateSudokuGrid(grid) {
    const conflicts = new Set();

    // Check rows
    for (let r = 0; r < 9; r++) {
        const seen = new Map();
        for (let c = 0; c < 9; c++) {
            const val = grid[r][c];
            if (val > 0) {
                if (seen.has(val)) {
                    conflicts.add(`${r},${c}`);
                    conflicts.add(`${r},${seen.get(val)}`);
                } else {
                    seen.set(val, c);
                }
            }
        }
    }

    // Check columns
    for (let c = 0; c < 9; c++) {
        const seen = new Map();
        for (let r = 0; r < 9; r++) {
            const val = grid[r][c];
            if (val > 0) {
                if (seen.has(val)) {
                    conflicts.add(`${r},${c}`);
                    conflicts.add(`${seen.get(val)},${c}`);
                } else {
                    seen.set(val, r);
                }
            }
        }
    }

    // Check 3x3 blocks
    for (let br = 0; br < 3; br++) {
        for (let bc = 0; bc < 3; bc++) {
            const seen = new Map();
            for (let r = br * 3; r < br * 3 + 3; r++) {
                for (let c = bc * 3; bc < 3 && c < bc * 3 + 3; c++) {
                    const val = grid[r][c];
                    if (val > 0) {
                        if (seen.has(val)) {
                            conflicts.add(`${r},${c}`);
                            conflicts.add(seen.get(val));
                        } else {
                            seen.set(val, `${r},${c}`);
                        }
                    }
                }
            }
        }
    }

    return conflicts;
}

/**
 * Detects the 4 corners of the Sudoku puzzle grid using pure JavaScript image analysis.
 * Analyzes horizontal and vertical edge gradients and 2D grid density.
 * Runs in ~5ms with 0 external dependencies (completely eliminating the 10MB OpenCV download/hang).
 * @param {HTMLCanvasElement} canvas - The downscaled preview canvas (~480px)
 * @returns {Array<{x: number, y: number}>} - [TL, TR, BR, BL]
 */
export function detectGridCornersPureJS(canvas) {
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        gray[i] = (data[i * 4] * 77 + data[i * 4 + 1] * 150 + data[i * 4 + 2] * 29) >> 8;
    }

    const hEdges = new Uint8Array(w * h);
    const vEdges = new Uint8Array(w * h);

    for (let y = 1; y < h - 1; y++) {
        const row = y * w;
        for (let x = 1; x < w - 1; x++) {
            const dy = Math.abs(gray[row + w + x] - gray[row - w + x]);
            const dx = Math.abs(gray[row + x + 1] - gray[row + x - 1]);
            if (dy > 25) hEdges[row + x] = 1;
            if (dx > 25) vEdges[row + x] = 1;
        }
    }

    const blockSize = 16;
    const cols = Math.floor(w / blockSize);
    const rows = Math.floor(h / blockSize);
    const gridScore = new Float32Array(cols * rows);
    let totalScore = 0;

    for (let ry = 0; ry < rows; ry++) {
        const startY = ry * blockSize;
        for (let rx = 0; rx < cols; rx++) {
            const startX = rx * blockSize;
            let sumH = 0, sumV = 0;
            for (let y = 0; y < blockSize; y++) {
                const r = (startY + y) * w;
                for (let x = 0; x < blockSize; x++) {
                    sumH += hEdges[r + startX + x];
                    sumV += vEdges[r + startX + x];
                }
            }
            const score = sumH * sumV;
            gridScore[ry * cols + rx] = score;
            totalScore += score;
        }
    }

    const meanScore = totalScore / (cols * rows);
    const threshold = meanScore * 1.3;

    let minBx = cols, maxBx = 0, minBy = rows, maxBy = 0;
    let found = false;

    for (let ry = 0; ry < rows; ry++) {
        for (let rx = 0; rx < cols; rx++) {
            if (gridScore[ry * cols + rx] > threshold) {
                found = true;
                if (rx < minBx) minBx = rx;
                if (rx > maxBx) maxBx = rx;
                if (ry < minBy) minBy = ry;
                if (ry > maxBy) maxBy = ry;
            }
        }
    }

    if (!found || maxBx <= minBx || maxBy <= minBy) {
        return [
            { x: Math.round(w * 0.08), y: Math.round(h * 0.08) },
            { x: Math.round(w * 0.92), y: Math.round(h * 0.08) },
            { x: Math.round(w * 0.92), y: Math.round(h * 0.92) },
            { x: Math.round(w * 0.08), y: Math.round(h * 0.92) }
        ];
    }

    const minX = Math.max(0, minBx * blockSize);
    const maxX = Math.min(w - 1, (maxBx + 1) * blockSize);
    const minY = Math.max(0, minBy * blockSize);
    const maxY = Math.min(h - 1, (maxBy + 1) * blockSize);

    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ];
}

/**
 * Solves an 8x8 linear system using Gaussian elimination with partial pivoting.
 */
function solve8x8(A, b) {
    for (let i = 0; i < 8; i++) {
        let maxRow = i;
        for (let j = i + 1; j < 8; j++) {
            if (Math.abs(A[j][i]) > Math.abs(A[maxRow][i])) maxRow = j;
        }
        if (maxRow !== i) {
            [A[i], A[maxRow]] = [A[maxRow], A[i]];
            [b[i], b[maxRow]] = [b[maxRow], b[i]];
        }
        const pivot = A[i][i];
        if (Math.abs(pivot) < 1e-10) continue;
        for (let j = i + 1; j < 8; j++) {
            const factor = A[j][i] / pivot;
            for (let k = i; k < 8; k++) A[j][k] -= factor * A[i][k];
            b[j] -= factor * b[i];
        }
    }
    const x = new Float64Array(8);
    for (let i = 7; i >= 0; i--) {
        let sum = b[i];
        for (let j = i + 1; j < 8; j++) sum -= A[i][j] * x[j];
        x[i] = Math.abs(A[i][i]) > 1e-10 ? sum / A[i][i] : 0;
    }
    return x;
}

/**
 * Computes the 3x3 homography matrix H that maps points from dst to src (inverse mapping).
 * @param {Array<{x: number, y: number}>} srcCorners - [TL, TR, BR, BL]
 * @param {Array<{x: number, y: number}>} dstCorners - [TL, TR, BR, BL]
 * @returns {number[]} 9-element array representing 3x3 matrix
 */
export function getInverseHomography(srcCorners, dstCorners) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
        const dx = dstCorners[i].x, dy = dstCorners[i].y;
        const sx = srcCorners[i].x, sy = srcCorners[i].y;
        A.push([dx, dy, 1, 0, 0, 0, -sx * dx, -sx * dy]);
        b.push(sx);
        A.push([0, 0, 0, dx, dy, 1, -sy * dx, -sy * dy]);
        b.push(sy);
    }
    const h = solve8x8(A, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Warps the quadrilateral defined by 4 corners into a square outputSize x outputSize canvas.
 * Uses high-speed pure JS inverse perspective mapping (0 dependencies, ~4ms).
 * @param {HTMLCanvasElement} sourceCanvas 
 * @param {Array<{x: number, y: number}>} corners - [TL, TR, BR, BL]
 * @param {number} outputSize - Default 450
 * @returns {HTMLCanvasElement} - Warped square canvas
 */
export function warpGridCanvas(sourceCanvas, corners, outputSize = 450) {
    const dstCorners = [
        { x: 0, y: 0 },
        { x: outputSize, y: 0 },
        { x: outputSize, y: outputSize },
        { x: 0, y: outputSize }
    ];

    const H = getInverseHomography(corners, dstCorners);

    const srcCtx = sourceCanvas.getContext('2d');
    const srcW = sourceCanvas.width;
    const srcH = sourceCanvas.height;
    const srcImgData = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcPixels = new Uint32Array(srcImgData.data.buffer);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outputSize;
    outCanvas.height = outputSize;
    const outCtx = outCanvas.getContext('2d');
    const outImgData = outCtx.createImageData(outputSize, outputSize);
    const outPixels = new Uint32Array(outImgData.data.buffer);

    for (let v = 0; v < outputSize; v++) {
        const rowOffset = v * outputSize;
        for (let u = 0; u < outputSize; u++) {
            const denom = H[6] * u + H[7] * v + 1;
            const x = (H[0] * u + H[1] * v + H[2]) / denom;
            const y = (H[3] * u + H[4] * v + H[5]) / denom;

            const ix = Math.floor(x);
            const iy = Math.floor(y);

            if (ix >= 0 && ix < srcW && iy >= 0 && iy < srcH) {
                outPixels[rowOffset + u] = srcPixels[iy * srcW + ix];
            } else {
                outPixels[rowOffset + u] = 0xffffffff;
            }
        }
    }

    outCtx.putImageData(outImgData, 0, 0);
    return outCanvas;
}

/**
 * Applies a 9x9 scanned puzzle array to the main game board.
 * @param {number[][]} grid - 9x9 numbers
 */
export function applyScannedGrid(grid) {
    clearSteps();
    for (let r = 1; r <= 9; r++) {
        for (let c = 1; c <= 9; c++) {
            const val = grid[r - 1][c - 1];
            if (val >= 1 && val <= 9) {
                pickNumber(r, c, val);
                recordStep(r, c, val, "show");
            }
        }
    }
}
