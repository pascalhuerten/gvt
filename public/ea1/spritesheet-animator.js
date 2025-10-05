/* Sprite animation using a single img element inside a clipped viewport.
   Assumes the spritesheet contains 24 frames laid out horizontally (1 row), each frame size known.
*/
(function () {
    'use strict';

    // Configuration
    const TOTAL_FRAMES = 24;
    const FRAME_W = 720; // px per frame in source image
    const FRAME_H = 480;
    const FRAMES_PER_ROW = 6; // set to 0 for single row; set to 6 for a sheet with 6 frames per row

    // DOM
    const sheet = document.getElementById('spritesheet');
    const viewport = document.getElementById('viewport');
    const leftBtn = document.getElementById('leftBtn');
    const rightBtn = document.getElementById('rightBtn');
    const autoBtn = document.getElementById('autoBtn');
    const speedRange = document.getElementById('speedRange');
    const speedValue = document.getElementById('speedValue');

    let current = 0; // frame index 0..TOTAL_FRAMES-1
    let autoTimer = null;
    let fps = 24; // frames per second for auto rotation

    // Ensure image is loaded and sized correctly
    function updatePosition() {
        // Support grid arranged spritesheets. Compute column and row.
        const cols = FRAMES_PER_ROW > 0 ? FRAMES_PER_ROW : TOTAL_FRAMES;
        const col = current % cols;
        const row = Math.floor(current / cols);
        const x = -col * FRAME_W;
        const y = -row * FRAME_H;
        sheet.style.left = x + 'px';
        sheet.style.top = y + 'px';
        // Update accessible label (select the stage reliably)
        const stage = document.querySelector('.sprite-stage') || document.querySelector('.spitesheet-player');
        if (stage) stage.setAttribute('aria-label', `Rotierende Münze: Frame ${current + 1} von ${TOTAL_FRAMES}`);

        // keep frame slider/value in sync unless user is dragging it
        try {
            if (typeof userInteractingFrame === 'undefined' || !userInteractingFrame) {
                if (frameRange) frameRange.value = String(current + 1);
                if (frameValue) frameValue.textContent = String(current + 1);
            }
        } catch (e) {
            // ignore if elements not present yet
        }
    }

    function step(delta) {
        current = (current + delta + TOTAL_FRAMES) % TOTAL_FRAMES;
        updatePosition();
    }

    function startAuto() {
        if (autoTimer) return;
        autoBtn.setAttribute('aria-pressed', 'true');
        autoTimer = setInterval(() => step(1), 1000 / fps);
    }
    function stopAuto() {
        if (!autoTimer) return;
        clearInterval(autoTimer); autoTimer = null;
        autoBtn.setAttribute('aria-pressed', 'false');
    }

    // Preload and set initial sizing after sprite sheet loaded
    sheet.addEventListener('load', () => {
        // If the sheet is a grid, compute total pixel dimensions and set the image size accordingly.
        const cols = FRAMES_PER_ROW > 0 ? FRAMES_PER_ROW : TOTAL_FRAMES;
        const rows = Math.ceil(TOTAL_FRAMES / cols);
        sheet.style.width = (FRAME_W * cols) + 'px';
        sheet.style.height = (FRAME_H * rows) + 'px';
        updatePosition();
    });

    // Event handlers
    sheet.addEventListener('error', () => {
        console.error('Fehler beim Laden des Spritesheets: einheitsEuroSpritesheet.png');
        const info = document.createElement('p');
        info.textContent = 'Fehler: Spritesheet konnte nicht geladen werden.';
        info.style.color = 'crimson';
        document.querySelector('main').prepend(info);
    });

    // initialize: if already loaded
    if (sheet.complete && sheet.naturalWidth) {
        sheet.dispatchEvent(new Event('load'));
    }

    leftBtn.addEventListener('click', () => { stopAuto(); step(-1); });
    rightBtn.addEventListener('click', () => { stopAuto(); step(1); });
    autoBtn.addEventListener('click', () => { if (autoTimer) stopAuto(); else startAuto(); });

    // Accessibility: focus outlines and keyboard hints
    [leftBtn, rightBtn, autoBtn].forEach(b => b.addEventListener('keydown', e => {
        if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
            e.preventDefault(); b.click();
        }
    }));

    // Keyboard handling
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'l' || ev.key === 'L' || ev.key === 'ArrowLeft') {
            ev.preventDefault(); stopAuto(); step(-1);
        } else if (ev.key === 'r' || ev.key === 'R' || ev.key === 'ArrowRight') {
            ev.preventDefault(); stopAuto(); step(1);
        } else if (ev.key === 'a' || ev.key === 'A') {
            ev.preventDefault(); if (autoTimer) stopAuto(); else startAuto();
        }
    });

    // Speed control
    if (speedRange && speedValue) {
        speedRange.value = String(fps);
        speedValue.textContent = String(fps);
        speedRange.addEventListener('input', () => {
            const newFps = Math.max(1, Math.min(60, parseInt(speedRange.value, 10) || fps));
            fps = newFps;
            speedValue.textContent = String(fps);
            // if auto is running, restart interval with new fps
            if (autoTimer) { clearInterval(autoTimer); autoTimer = setInterval(() => step(1), 1000 / fps); }
        });
    }

    // Frame control elements
    const frameRange = document.getElementById('frameRange');
    const frameValue = document.getElementById('frameValue');
    let userInteractingFrame = false;
    if (frameRange && frameValue) {
        frameRange.max = String(TOTAL_FRAMES);
        frameValue.textContent = String(current + 1);

        frameRange.addEventListener('input', () => {
            userInteractingFrame = true;
            const v = Math.max(1, Math.min(TOTAL_FRAMES, parseInt(frameRange.value, 10) || 1));
            frameValue.textContent = String(v);
            current = v - 1;
            updatePosition();
        });

        frameRange.addEventListener('change', () => { userInteractingFrame = false; });
    }

})();
