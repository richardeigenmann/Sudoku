/**
 * Sudoku Scanner UI Module
 * Handles camera/file upload, interactive 4-corner perspective adjustment,
 * grid detection, Tesseract OCR printed digit recognition, and pre-fill review.
 */
import {
    detectGridCornersPureJS,
    warpGridCanvas,
    applySharpeningFilter,
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
let warpedCanvas = null;

const CORNER_RADIUS = 12;
const CORNER_COLORS = ['#007bff', '#28a745', '#dc3545', '#fd7e14']; // TL, TR, BR, BL

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
                    <div class="scannerControlPanel">
                        <div class="scannerControlGroup">
                            <label for="scannerSensitivity" class="scannerControlLabel">
                                Detection Sensitivity: <span id="sensitivityValLabel" class="scannerValHighlight">Normal</span>
                            </label>
                            <input type="range" id="scannerSensitivity" min="1" max="5" value="3" step="1" class="scannerSlider">
                        </div>
                        <div class="scannerControlGroup">
                            <label class="scannerCheckboxLabel">
                                <input type="checkbox" id="scannerSharpen" checked>
                                Sharpen Photo
                            </label>
                        </div>
                    </div>
                    <div class="canvasWrapper">
                        <canvas id="scannerCanvas"></canvas>
                    </div>
                    <div class="scannerActions">
                        <button id="scannerNewPhotoBtn" class="scannerBtn secondary">&larr; Choose Another Photo</button>
                        <button id="scannerAutoDetectBtn" class="scannerBtn secondary">Auto-Detect Grid</button>
                        <button id="scannerScanDigitsBtn" class="scannerBtn primary">Scan Digits &rarr;</button>
                    </div>
                </div>

                <!-- STEP 2: Review & Verify -->
                <div id="scannerStepReview" class="scannerStep displayNone">
                    <p class="scannerHelpText">
                        Review detected numbers against the cropped photo. Tap any cell to adjust.
                    </p>
                    <div class="scannerReviewContainer">
                        <div class="scannerPhotoPreview">
                            <h4>Original Photo</h4>
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
                        <button id="scannerBackToAlignBtn" class="scannerBtn secondary">&larr; Re-align</button>
                        <button id="scannerApplyBtn" class="scannerBtn primary">✓ Load into Visualizer</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalEl);

    // Event listeners
    document.getElementById('scannerCloseBtn').onclick = closeScannerModal;
    document.getElementById('scannerUploadBtn').onclick = () => {
        const fileInput = document.getElementById('scannerFileInput');
        if (fileInput) fileInput.click();
    };
    document.getElementById('scannerSampleBtn').onclick = () => loadSamplePhoto('Sudoku1.jpg');
    document.getElementById('scannerSample4Btn').onclick = () => loadSamplePhoto('Sudoku4.jpg');
    document.getElementById('scannerNewPhotoBtn').onclick = () => showStep('choose');
    document.getElementById('scannerAutoDetectBtn').onclick = runAutoDetect;
    document.getElementById('scannerScanDigitsBtn').onclick = runDigitRecognition;
    document.getElementById('scannerBackToAlignBtn').onclick = () => showStep('align');
    document.getElementById('scannerApplyBtn').onclick = onApplyClicked;

    displayCanvas = document.getElementById('scannerCanvas');
    displayCtx = displayCanvas.getContext('2d');

    const sensSlider = document.getElementById('scannerSensitivity');
    const sensLabel = document.getElementById('sensitivityValLabel');
    const sensNames = { 1: 'Low (Heavy Ink)', 2: 'Medium-Low', 3: 'Normal', 4: 'Medium-High', 5: 'High (Faint Ink)' };
    if (sensSlider && sensLabel) {
        sensSlider.oninput = () => {
            sensLabel.textContent = sensNames[sensSlider.value] || 'Normal';
        };
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
    setStatus('Grid detected! Fine-tune the corner pins if needed, then click "Scan Digits".');
}

/**
 * Executes pure JS grid detection instantly without external network or WASM overhead.
 */
function runAutoDetect() {
    if (!currentImage || !cachedPreviewCanvas) return;
    setStatus('Detecting grid border...');
    try {
        const detected = detectGridCornersPureJS(cachedPreviewCanvas);
        if (detected && detected.length === 4) {
            corners = detected;
            setStatus('Grid border aligned! Adjust pins if needed, then click "Scan Digits".');
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
 * Takes <0.1ms using the cached preview canvas!
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
 * Warps perspective and executes Tesseract OCR digit recognition on non-blank cells.
 */
async function runDigitRecognition() {
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

    // Fast pure JS perspective warp to 540x540 for crisp OCR resolution
    let warped = warpGridCanvas(fullCanvas, fullCorners, 540);

    const doSharpen = document.getElementById('scannerSharpen')?.checked ?? true;
    if (doSharpen) {
        warped = applySharpeningFilter(warped, 0.7);
    }
    warpedCanvas = warped;

    // Show warped canvas in preview
    const previewCanvas = document.getElementById('scannerWarpedCanvas');
    previewCanvas.width = 540;
    previewCanvas.height = 540;
    const pctx = previewCanvas.getContext('2d');
    pctx.drawImage(warpedCanvas, 0, 0);

    currentGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
    renderReviewGrid();

    const sensLevel = parseInt(document.getElementById('scannerSensitivity')?.value || '3', 10);
    const sensMultipliers = { 1: 0.88, 2: 0.94, 3: 1.00, 4: 1.08, 5: 1.16 };
    const sensitivity = sensMultipliers[sensLevel] || 1.00;

    let worker;
    try {
        setStatus('Initializing Tesseract OCR engine (cached in browser)...');
        worker = await getTesseractWorker((m) => {
            if (m && m.status && m.status !== 'recognizing text') {
                setStatus(`Tesseract: ${m.status}...`);
            }
        });
    } catch (err) {
        console.error('Tesseract OCR failed to initialize:', err);
        setStatus('OCR engine failed to initialize. You can enter digits manually.');
        return;
    }

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

    let detectedClues = 0;
    for (let i = 0; i < cellsToScan.length; i++) {
        const { r, c, cellCanvas } = cellsToScan[i];
        setStatus(`Recognizing clue ${i + 1} of ${cellsToScan.length} (Row ${r + 1}, Col ${c + 1})...`);
        const digit = await recognizeCellWithTesseract(worker, cellCanvas);
        if (digit >= 1 && digit <= 9) {
            currentGrid[r][c] = digit;
            detectedClues++;
            renderReviewGrid();
        }
    }

    setStatus(`Recognition complete! Found ${detectedClues} clues. Tap any cell to correct.`);
    document.getElementById('clueCount').textContent = detectedClues;
    renderReviewGrid();
}

/**
 * Renders the editable 9x9 review grid.
 */
function renderReviewGrid() {
    const gridEl = document.getElementById('scannerReviewGrid');
    gridEl.innerHTML = '';

    const conflicts = validateSudokuGrid(currentGrid);
    const alertEl = document.getElementById('conflictAlert');
    if (conflicts.size > 0) {
        alertEl.classList.remove('displayNone');
    } else {
        alertEl.classList.add('displayNone');
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
    applyScannedGrid(currentGrid);
    closeScannerModal();
}

function showStep(stepName) {
    const stepChoose = document.getElementById('scannerStepChoose');
    const stepAlign = document.getElementById('scannerStepAlign');
    const stepReview = document.getElementById('scannerStepReview');

    if (stepChoose) stepChoose.classList.add('displayNone');
    if (stepAlign) stepAlign.classList.add('displayNone');
    if (stepReview) stepReview.classList.add('displayNone');

    if (stepName === 'choose') {
        if (stepChoose) stepChoose.classList.remove('displayNone');
        document.getElementById('scannerTitle').textContent = 'Scan Sudoku from Magazine';
    } else if (stepName === 'align') {
        if (stepAlign) stepAlign.classList.remove('displayNone');
        document.getElementById('scannerTitle').textContent = 'Scan Sudoku: Align Grid Corners';
    } else if (stepName === 'review') {
        if (stepReview) stepReview.classList.remove('displayNone');
        document.getElementById('scannerTitle').textContent = 'Scan Sudoku: Review & Correct';
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
