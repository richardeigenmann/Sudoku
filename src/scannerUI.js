/**
 * Sudoku Scanner UI Module
 * Handles camera/file upload, interactive 4-corner perspective adjustment,
 * grid detection, Tesseract OCR printed digit recognition, and pre-fill review.
 */
import {
    detectGridCornersPureJS,
    warpGridCanvas,
    applySharpeningFilter,
    applyLightingFilter,
    getTesseractWorker,
    extractCellCanvas,
    recognizeCellWithTesseract,
    validateSudokuGrid,
    applyScannedGrid
} from './scanner.js';

let modalEl = null;
let currentImage = null;
let cachedPreviewCanvas = null;
let corners = [];
let activeCornerIndex = -1;
let displayCanvas = null;
let displayCtx = null;
let scaleFactor = 1;
let currentGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
let rawWarpedCanvas = null;
let warpedCanvas = null;
let currentAnalysisId = 0;
let debounceTimer = null;

const CORNER_RADIUS = 12;
const CORNER_COLORS = ['#007bff', '#28a745', '#dc3545', '#fd7e14']; // TL, TR, BR, BL

const LIGHTING_CONFIGS = {
    1: { brightness: -20, contrast: 1.15, sensitivity: 0.88, label: 'Dark / Heavy Ink' },
    2: { brightness: -10, contrast: 1.08, sensitivity: 0.94, label: 'Medium-Dark' },
    3: { brightness: 0, contrast: 1.00, sensitivity: 1.00, label: 'Normal' },
    4: { brightness: 12, contrast: 1.08, sensitivity: 1.08, label: 'Medium-Bright' },
    5: { brightness: 24, contrast: 1.18, sensitivity: 1.16, label: 'Bright / Faint Ink' }
};

const SHARPEN_CONFIGS = {
    0: { strength: 0.0, label: 'Off' },
    1: { strength: 0.35, label: 'Low' },
    2: { strength: 0.70, label: 'Medium' },
    3: { strength: 1.05, label: 'High' },
    4: { strength: 1.40, label: 'Max' }
};

/**
 * Creates the modal markup and injects it into the DOM.
 */
function createModalDOM() {
    if (document.getElementById('scannerModal')) return;

    modalEl = document.createElement('div');
    modalEl.id = 'scannerModal';
    modalEl.className = 'scannerModal'; // Not active initially

    modalEl.innerHTML = `
        <div class="scannerDialog">
            <div class="scannerHeader">
                <h3 id="scannerTitle">Scan Sudoku from Magazine</h3>
                <button type="button" class="scannerCloseBtn" id="scannerCloseBtn">&times;</button>
            </div>

            <div class="scannerBody">
                <div id="scannerStatus" class="scannerStatus displayNone"></div>

                <!-- STEP 0: Choose Source -->
                <div id="scannerStepChoose" class="scannerStep">
                    <p class="scannerHelpText">
                        Upload a photo of a Sudoku puzzle from a magazine or newspaper, or try the included sample.
                    </p>
                    <div class="scannerSourceOptions">
                        <button id="scannerUploadBtn" class="scannerBtn primary large">
                            📷 Take Photo / Upload File
                        </button>
                        <button id="scannerSampleBtn" class="scannerBtn secondary large">
                            🧪 Try Full Sample (Sudoku1.jpg)
                        </button>
                        <button id="scannerSample4Btn" class="scannerBtn secondary large">
                            🧪 Try Cropped Sample (Sudoku4.jpg)
                        </button>
                    </div>
                </div>

                <!-- STEP 1: Corner / Grid Alignment -->
                <div id="scannerStepAlign" class="scannerStep displayNone">
                    <p class="scannerHelpText">
                        Drag the 4 corner pins to match the outer corners of the Sudoku puzzle grid.
                    </p>
                    <div class="canvasWrapper">
                        <canvas id="scannerCanvas"></canvas>
                    </div>
                    <div class="scannerActions">
                        <button id="scannerNewPhotoBtn" class="scannerBtn secondary">&larr; Choose Another Photo</button>
                        <button id="scannerResetCornersBtn" class="scannerBtn secondary">Reset Pins</button>
                        <button id="scannerAutoDetectBtn" class="scannerBtn secondary">Auto-Detect Grid</button>
                        <button id="scannerScanDigitsBtn" class="scannerBtn primary">Next: OCR Digits &rarr;</button>
                    </div>
                </div>

                <!-- STEP 2: Review & Verify -->
                <div id="scannerStepReview" class="scannerStep displayNone">
                    <p class="scannerHelpText">
                        Review detected numbers. Adjust lighting or sharpen to automatically re-analyse. Tap any cell to adjust.
                    </p>
                    
                    <div class="scannerControlPanel">
                        <div class="scannerControlGroup">
                            <label for="scannerLighting" class="scannerControlLabel">
                                Lighting: <span id="lightingValLabel" class="scannerValHighlight">Normal</span>
                            </label>
                            <input type="range" id="scannerLighting" min="1" max="5" value="3" step="1" class="scannerSlider">
                        </div>
                        <div class="scannerControlGroup">
                            <label for="scannerSharpen" class="scannerControlLabel">
                                Sharpen: <span id="sharpenValLabel" class="scannerValHighlight">Medium</span>
                            </label>
                            <input type="range" id="scannerSharpen" min="0" max="4" value="2" step="1" class="scannerSlider">
                        </div>
                        <button id="scannerReanalyseBtn" class="scannerBtn secondary">↻ Re-analyse</button>
                    </div>

                    <div class="scannerReviewContainer">
                        <div class="scannerPhotoPreview">
                            <h4>Processed Photo</h4>
                            <div class="warpedCanvasWrapper">
                                <canvas id="scannerWarpedCanvas"></canvas>
                            </div>
                        </div>
                        <div class="scannerGridPreview">
                            <h4>Detected Grid (<span id="clueCount">0</span> clues)</h4>
                            <div id="scannerReviewGrid" class="scannerReviewGrid"></div>
                            <div id="conflictAlert" class="conflictAlert displayNone">
                                ⚠ Duplicate numbers detected in rows, columns, or 3×3 blocks!
                            </div>
                        </div>
                    </div>
                    <div class="scannerActions">
                        <button id="scannerBackToAlignBtn" class="scannerBtn secondary">&larr; Re-align Grid</button>
                        <button id="scannerCancelBtn" class="scannerBtn secondary">Cancel</button>
                        <button id="scannerApplyBtn" class="scannerBtn primary">✓ Load to Analyzer</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalEl);

    // Event listeners
    document.getElementById('scannerCloseBtn').onclick = cancelOperation;
    document.getElementById('scannerCancelBtn').onclick = cancelOperation;
    document.getElementById('scannerUploadBtn').onclick = () => {
        const fileInput = document.getElementById('scannerFileInput');
        if (fileInput) fileInput.click();
    };
    document.getElementById('scannerSampleBtn').onclick = () => loadSamplePhoto('Sudoku1.jpg');
    document.getElementById('scannerSample4Btn').onclick = () => loadSamplePhoto('Sudoku4.jpg');
    document.getElementById('scannerNewPhotoBtn').onclick = () => showStep('choose');
    document.getElementById('scannerResetCornersBtn').onclick = resetCorners;
    document.getElementById('scannerAutoDetectBtn').onclick = runAutoDetect;
    document.getElementById('scannerScanDigitsBtn').onclick = proceedToStep2;
    document.getElementById('scannerBackToAlignBtn').onclick = onBackToAlign;
    document.getElementById('scannerReanalyseBtn').onclick = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        runDigitRecognition();
    };
    document.getElementById('scannerApplyBtn').onclick = onApplyClicked;

    displayCanvas = document.getElementById('scannerCanvas');
    displayCtx = displayCanvas.getContext('2d');

    const lightingSlider = document.getElementById('scannerLighting');
    const sharpenSlider = document.getElementById('scannerSharpen');

    if (lightingSlider) {
        lightingSlider.oninput = onSettingChanged;
    }
    if (sharpenSlider) {
        sharpenSlider.oninput = onSettingChanged;
    }

    setupCanvasInteraction();
}

/**
 * Initializes the scanner triggers on the page.
 */
export function setupScannerUI() {
    createModalDOM();

    // Create hidden file input for camera/gallery
    let fileInput = document.getElementById('scannerFileInput');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'scannerFileInput';
        fileInput.accept = 'image/*';
        fileInput.capture = 'environment';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);
    }

    fileInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            openWithFile(e.target.files[0]);
        }
    };

    // Attach scan button handler
    const scanBtn = document.getElementById('scanPuzzleBtn');
    if (scanBtn) {
        scanBtn.onclick = openScannerModal;
    }

    // Support drag and drop of image files
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                e.preventDefault();
                e.stopPropagation();
                openWithFile(file);
            }
        }
    });
}

/**
 * Opens the scanner modal.
 */
export function openScannerModal() {
    createModalDOM();
    modalEl.classList.add('active');
    if (!currentImage) {
        showStep('choose');
    } else {
        showStep('align');
        drawAlignmentCanvas();
    }
}

/**
 * Closes the scanner modal.
 */
export function closeScannerModal() {
    if (modalEl) {
        modalEl.classList.remove('active');
    }
}

function loadSamplePhoto(filename = 'Sudoku1.jpg') {
    setStatus(`Loading sample photo (${filename})...`);
    const baseUrl = import.meta.env?.BASE_URL || './';
    const sampleUrl = `${baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'}samples/${filename}`;
    const img = new Image();
    img.onload = () => {
        openScannerWithImage(img);
    };
    img.onerror = () => {
        setStatus(`Could not load sample photo from ${sampleUrl}.`);
    };
    img.src = sampleUrl;
}

/**
 * Opens the scanner modal with an image file.
 */
export function openWithFile(file) {
    createModalDOM();
    openScannerModal();
    setStatus('Loading uploaded photo...');
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            openScannerWithImage(img);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * Prepares the image for alignment with cached downscaled preview.
 */
export function openScannerWithImage(img) {
    createModalDOM();
    openScannerModal();
    currentImage = img;
    showStep('align');

    // Fit image to max 480px width/height for fast, responsive display
    const maxDim = 480;
    scaleFactor = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetW = Math.round(img.width * scaleFactor);
    const targetH = Math.round(img.height * scaleFactor);

    displayCanvas.width = targetW;
    displayCanvas.height = targetH;

    // Cache downscaled image once so dragging does not resample 12MP image every frame!
    cachedPreviewCanvas = document.createElement('canvas');
    cachedPreviewCanvas.width = targetW;
    cachedPreviewCanvas.height = targetH;
    const cpCtx = cachedPreviewCanvas.getContext('2d');
    cpCtx.drawImage(img, 0, 0, targetW, targetH);

    // Auto-detect initial corners using fast pure JS edge analysis
    try {
        const detected = detectGridCornersPureJS(cachedPreviewCanvas);
        if (detected && detected.length === 4) {
            corners = detected;
        } else {
            corners = [
                { x: targetW * 0.08, y: targetH * 0.08 },
                { x: targetW * 0.92, y: targetH * 0.08 },
                { x: targetW * 0.92, y: targetH * 0.92 },
                { x: targetW * 0.08, y: targetH * 0.92 }
            ];
        }
    } catch {
        corners = [
            { x: targetW * 0.08, y: targetH * 0.08 },
            { x: targetW * 0.92, y: targetH * 0.08 },
            { x: targetW * 0.92, y: targetH * 0.92 },
            { x: targetW * 0.08, y: targetH * 0.92 }
        ];
    }

    drawAlignmentCanvas();
    setStatus('Position the 4 corner pins on the Sudoku grid, then click Next.');
}

/**
 * Resets corner pins to a centered rectangular default.
 */
function resetCorners() {
    if (!cachedPreviewCanvas) return;
    const targetW = cachedPreviewCanvas.width;
    const targetH = cachedPreviewCanvas.height;
    corners = [
        { x: Math.round(targetW * 0.08), y: Math.round(targetH * 0.08) },
        { x: Math.round(targetW * 0.92), y: Math.round(targetH * 0.08) },
        { x: Math.round(targetW * 0.92), y: Math.round(targetH * 0.92) },
        { x: Math.round(targetW * 0.08), y: Math.round(targetH * 0.92) }
    ];
    drawAlignmentCanvas();
    setStatus('Pins reset. Position the 4 corners to match the puzzle grid.');
}

/**
 * Executes pure JS grid detection.
 */
function runAutoDetect() {
    if (!currentImage || !cachedPreviewCanvas) return;
    setStatus('Detecting grid border...');
    try {
        const detected = detectGridCornersPureJS(cachedPreviewCanvas);
        if (detected && detected.length === 4) {
            corners = detected;
            setStatus('Grid border aligned! Adjust pins if needed, then click Next.');
        } else {
            setStatus('Could not auto-detect border. Position the pins manually.');
        }
    } catch (err) {
        console.warn('Auto-detect error', err);
        setStatus('Drag the 4 corner pins to align with the puzzle.');
    }
    drawAlignmentCanvas();
}

/**
 * Sets up mouse and touch handlers for dragging corner pins with zero lag.
 */
function setupCanvasInteraction() {
    function getCanvasCoords(e) {
        const rect = displayCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (displayCanvas.width / rect.width),
            y: (clientY - rect.top) * (displayCanvas.height / rect.height)
        };
    }

    function onPointerDown(e) {
        if (!corners || corners.length !== 4) return;
        const pt = getCanvasCoords(e);
        activeCornerIndex = -1;
        for (let i = 0; i < 4; i++) {
            const dx = pt.x - corners[i].x;
            const dy = pt.y - corners[i].y;
            if (Math.sqrt(dx * dx + dy * dy) <= CORNER_RADIUS * 2) {
                activeCornerIndex = i;
                break;
            }
        }
        if (activeCornerIndex !== -1) {
            e.preventDefault();
        }
    }

    function onPointerMove(e) {
        if (activeCornerIndex === -1 || !corners[activeCornerIndex]) return;
        e.preventDefault();
        const pt = getCanvasCoords(e);
        corners[activeCornerIndex].x = Math.max(0, Math.min(displayCanvas.width, pt.x));
        corners[activeCornerIndex].y = Math.max(0, Math.min(displayCanvas.height, pt.y));
        drawAlignmentCanvas();
    }

    function onPointerUp() {
        activeCornerIndex = -1;
    }

    displayCanvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    displayCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
}

/**
 * Draws the cached preview image, corner pins, and perspective grid guidelines.
 */
function drawAlignmentCanvas() {
    if (!cachedPreviewCanvas || !displayCtx) return;

    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.drawImage(cachedPreviewCanvas, 0, 0);

    if (!corners || corners.length !== 4) return;

    // Draw outer boundary polygon
    displayCtx.strokeStyle = '#00e5ff';
    displayCtx.lineWidth = 2.5;
    displayCtx.beginPath();
    displayCtx.moveTo(corners[0].x, corners[0].y);
    displayCtx.lineTo(corners[1].x, corners[1].y);
    displayCtx.lineTo(corners[2].x, corners[2].y);
    displayCtx.lineTo(corners[3].x, corners[3].y);
    displayCtx.closePath();
    displayCtx.stroke();

    // Draw 3x3 block guidelines across quadrilateral using bilinear interpolation
    displayCtx.strokeStyle = 'rgba(0, 229, 255, 0.45)';
    displayCtx.lineWidth = 1.5;
    for (let i = 1; i < 3; i++) {
        const t = i / 3;
        const hStart = lerp2D(corners[0], corners[3], t);
        const hEnd = lerp2D(corners[1], corners[2], t);
        displayCtx.beginPath();
        displayCtx.moveTo(hStart.x, hStart.y);
        displayCtx.lineTo(hEnd.x, hEnd.y);
        displayCtx.stroke();

        const vStart = lerp2D(corners[0], corners[1], t);
        const vEnd = lerp2D(corners[3], corners[2], t);
        displayCtx.beginPath();
        displayCtx.moveTo(vStart.x, vStart.y);
        displayCtx.lineTo(vEnd.x, vEnd.y);
        displayCtx.stroke();
    }

    // Draw 4 corner pins
    for (let i = 0; i < 4; i++) {
        displayCtx.fillStyle = CORNER_COLORS[i];
        displayCtx.strokeStyle = '#ffffff';
        displayCtx.lineWidth = 2.5;
        displayCtx.beginPath();
        displayCtx.arc(corners[i].x, corners[i].y, CORNER_RADIUS, 0, Math.PI * 2);
        displayCtx.fill();
        displayCtx.stroke();
    }
}

function lerp2D(p1, p2, t) {
    return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
    };
}

/**
 * Transitions from Step 1 to Step 2, warps the perspective, and initiates OCR automatically.
 */
function proceedToStep2() {
    if (!currentImage || !corners || corners.length !== 4) return;
    setStatus('Warping perspective...');
    showStep('review');

    // Scale corners back to original image resolution
    const fullCorners = corners.map(pt => ({
        x: pt.x / scaleFactor,
        y: pt.y / scaleFactor
    }));

    // Create full-res image canvas for crisp warping
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = currentImage.width;
    fullCanvas.height = currentImage.height;
    const fullCtx = fullCanvas.getContext('2d');
    fullCtx.drawImage(currentImage, 0, 0);

    // Fast pure JS perspective warp to 540x540
    rawWarpedCanvas = warpGridCanvas(fullCanvas, fullCorners, 540);

    // Update settings labels, process lighting/sharpening, and update canvas preview
    processAndDisplayWarped();

    // Reset grid
    currentGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    renderReviewGrid();

    // Automatically trigger OCR without requiring an extra tap
    runDigitRecognition();
}

/**
 * Applies current lighting and sharpening settings to the warped canvas
 * and updates the preview canvas instantly.
 */
function processAndDisplayWarped() {
    if (!rawWarpedCanvas) return;

    const lightingLevel = parseInt(document.getElementById('scannerLighting')?.value || '3', 10);
    const sharpenLevel = parseInt(document.getElementById('scannerSharpen')?.value || '2', 10);

    const lConfig = LIGHTING_CONFIGS[lightingLevel] || LIGHTING_CONFIGS[3];
    const sConfig = SHARPEN_CONFIGS[sharpenLevel] || SHARPEN_CONFIGS[2];

    const lLabel = document.getElementById('lightingValLabel');
    if (lLabel) lLabel.textContent = lConfig.label;

    const sLabel = document.getElementById('sharpenValLabel');
    if (sLabel) sLabel.textContent = sConfig.label;

    let processed = rawWarpedCanvas;
    if (lConfig.brightness !== 0 || lConfig.contrast !== 1.0) {
        processed = applyLightingFilter(processed, lConfig.brightness, lConfig.contrast);
    }
    if (sConfig.strength > 0) {
        processed = applySharpeningFilter(processed, sConfig.strength);
    }
    warpedCanvas = processed;

    const previewCanvas = document.getElementById('scannerWarpedCanvas');
    if (previewCanvas) {
        previewCanvas.width = 540;
        previewCanvas.height = 540;
        const pctx = previewCanvas.getContext('2d');
        pctx.drawImage(warpedCanvas, 0, 0);
    }
}

/**
 * Called whenever the lighting or sharpen knob is adjusted.
 * Updates preview immediately and triggers re-analyse after a short debounce.
 */
function onSettingChanged() {
    processAndDisplayWarped();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        runDigitRecognition();
    }, 250);
}

/**
 * Warps perspective and executes Tesseract OCR digit recognition on non-blank cells.
 * Supports cancellation if settings change or operation is cancelled.
 */
async function runDigitRecognition() {
    const analysisId = ++currentAnalysisId;
    if (!rawWarpedCanvas) return;

    processAndDisplayWarped();

    const lightingLevel = parseInt(document.getElementById('scannerLighting')?.value || '3', 10);
    const lConfig = LIGHTING_CONFIGS[lightingLevel] || LIGHTING_CONFIGS[3];
    const sensitivity = lConfig.sensitivity;

    let worker;
    try {
        setStatus('Initializing Tesseract OCR engine (cached in browser)...');
        worker = await getTesseractWorker((m) => {
            if (analysisId === currentAnalysisId && m && m.status && m.status !== 'recognizing text') {
                setStatus(`Tesseract: ${m.status}...`);
            }
        });
    } catch (err) {
        if (analysisId !== currentAnalysisId) return;
        console.error('Tesseract OCR failed to initialize:', err);
        setStatus('OCR engine failed to initialize. You can enter digits manually.');
        return;
    }

    if (analysisId !== currentAnalysisId) return;

    // Pre-filter blank cells using rapid ink detection with dynamic sensitivity
    setStatus('Detecting clue cells...');
    const cellsToScan = [];
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const { isBlank, cellCanvas } = extractCellCanvas(warpedCanvas, r, c, {
                sensitivity,
                marginRatio: 0.12
            });
            if (!isBlank && cellCanvas) {
                cellsToScan.push({ r, c, cellCanvas });
            }
        }
    }

    if (analysisId !== currentAnalysisId) return;

    // Reset grid for fresh analysis run
    currentGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    renderReviewGrid();
    updateClueCount();

    let detectedClues = 0;
    for (let i = 0; i < cellsToScan.length; i++) {
        if (analysisId !== currentAnalysisId) return; // Superseded by knob change or cancelled
        const { r, c, cellCanvas } = cellsToScan[i];
        setStatus(`Recognizing clue ${i + 1} of ${cellsToScan.length} (Row ${r + 1}, Col ${c + 1})...`);
        const digit = await recognizeCellWithTesseract(worker, cellCanvas);
        if (analysisId !== currentAnalysisId) return;
        if (digit >= 1 && digit <= 9) {
            currentGrid[r][c] = digit;
            detectedClues++;
            renderReviewGrid();
            updateClueCount();
        }
    }

    if (analysisId !== currentAnalysisId) return;
    setStatus(`Recognition complete! Found ${detectedClues} clues. Tap any cell to correct.`);
    updateClueCount();
    renderReviewGrid();
}

/**
 * Renders the editable 9x9 review grid.
 */
function renderReviewGrid() {
    const gridEl = document.getElementById('scannerReviewGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const conflicts = validateSudokuGrid(currentGrid);
    const alertEl = document.getElementById('conflictAlert');
    if (alertEl) {
        if (conflicts.size > 0) {
            alertEl.classList.remove('displayNone');
        } else {
            alertEl.classList.add('displayNone');
        }
    }

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 1;
            input.inputMode = 'numeric';
            input.className = 'scannerCellInput';

            // Add block borders
            if (c % 3 === 2 && c !== 8) input.classList.add('borderRight');
            if (r % 3 === 2 && r !== 8) input.classList.add('borderBottom');

            const val = currentGrid[r][c];
            input.value = val > 0 ? val : '';

            if (conflicts.has(`${r},${c}`)) {
                input.classList.add('conflictCell');
            }

            input.onfocus = () => input.select();
            input.oninput = (e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 1 && v <= 9) {
                    currentGrid[r][c] = v;
                    e.target.value = v;
                    focusNextCell(r, c);
                } else {
                    currentGrid[r][c] = 0;
                    e.target.value = '';
                }
                updateClueCount();
                renderReviewGrid();
            };

            input.onkeydown = (e) => {
                if (e.key === 'Backspace' && !input.value) {
                    focusPrevCell(r, c);
                }
            };

            gridEl.appendChild(input);
        }
    }
}

function focusNextCell(r, c) {
    const nextIdx = r * 9 + c + 1;
    const inputs = document.querySelectorAll('.scannerCellInput');
    if (nextIdx < inputs.length) {
        inputs[nextIdx].focus();
    }
}

function focusPrevCell(r, c) {
    const prevIdx = r * 9 + c - 1;
    const inputs = document.querySelectorAll('.scannerCellInput');
    if (prevIdx >= 0) {
        inputs[prevIdx].focus();
    }
}

function updateClueCount() {
    let count = 0;
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (currentGrid[r][c] > 0) count++;
        }
    }
    const clueEl = document.getElementById('clueCount');
    if (clueEl) clueEl.textContent = count;
}

/**
 * Handles applying the scanned grid to the visualizer board.
 */
function onApplyClicked() {
    currentAnalysisId++;
    if (debounceTimer) clearTimeout(debounceTimer);
    applyScannedGrid(currentGrid);
    closeScannerModal();
}

/**
 * Returns from Step 2 to Step 1 corner alignment.
 */
function onBackToAlign() {
    currentAnalysisId++;
    if (debounceTimer) clearTimeout(debounceTimer);
    showStep('align');
    drawAlignmentCanvas();
}

/**
 * Cancels the current scanning operation and closes modal.
 */
function cancelOperation() {
    currentAnalysisId++;
    if (debounceTimer) clearTimeout(debounceTimer);
    closeScannerModal();
}

function showStep(stepName) {
    const stepChoose = document.getElementById('scannerStepChoose');
    const stepAlign = document.getElementById('scannerStepAlign');
    const stepReview = document.getElementById('scannerStepReview');

    if (stepChoose) stepChoose.classList.add('displayNone');
    if (stepAlign) stepAlign.classList.add('displayNone');
    if (stepReview) stepReview.classList.add('displayNone');

    const titleEl = document.getElementById('scannerTitle');
    if (stepName === 'choose') {
        if (stepChoose) stepChoose.classList.remove('displayNone');
        if (titleEl) titleEl.textContent = 'Scan Sudoku from Magazine';
    } else if (stepName === 'align') {
        if (stepAlign) stepAlign.classList.remove('displayNone');
        if (titleEl) titleEl.textContent = 'Scan Sudoku: Step 1 of 2 (Find Grid)';
    } else if (stepName === 'review') {
        if (stepReview) stepReview.classList.remove('displayNone');
        if (titleEl) titleEl.textContent = 'Scan Sudoku: Step 2 of 2 (OCR & Review)';
    }
}

function setStatus(text) {
    const el = document.getElementById('scannerStatus');
    if (el) {
        if (text) {
            el.textContent = text;
            el.classList.remove('displayNone');
        } else {
            el.classList.add('displayNone');
        }
    }
}
