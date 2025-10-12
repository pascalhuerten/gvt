/* Sprite animation using a single img element inside a clipped viewport.
   Assumes the spritesheet contains 24 frames laid out horizontally (1 row), each frame size known.
*/
(function () {
    'use strict';

    // Default configuration; can be overridden per-player via data-attributes on the viewport or img
    const DEFAULTS = {
        totalFrames: 24,
        frameW: 720,
        frameH: 480,
        framesPerRow: 6,
        fps: 24
    };

    // Utility to parse integer data-attributes with fallback
    function intAttr(el, name, fallback) {
        if (!el) return fallback;
        const v = el.getAttribute(name);
        if (!v) return fallback;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : fallback;
    }

    // Initialize one player for each .spitesheet-player found
    const players = Array.from(document.querySelectorAll('.spitesheet-player'));

    // Active player functions for global keyboard handling. Set by focusing/clicking a player.
    let activePlayer = null; // { step, startAuto, stopAuto }

    function setActivePlayer(fns) {
        // remove active class from any previously active player element
        if (activePlayer && activePlayer.playerEl && activePlayer.playerEl.classList) {
            activePlayer.playerEl.classList.remove('active');
        }
        activePlayer = fns;
        // add active class to the newly active player element
        if (activePlayer && activePlayer.playerEl && activePlayer.playerEl.classList) {
            activePlayer.playerEl.classList.add('active');
            // ensure its frame is shown immediately
            if (typeof activePlayer.updatePosition === 'function') activePlayer.updatePosition();
        }
    }

    // Global keyboard handler: only route keys to the active player (if any)
    document.addEventListener('keydown', (ev) => {
        if (!activePlayer) return;
        if (ev.key === 'l' || ev.key === 'L' || ev.key === 'ArrowLeft') {
            ev.preventDefault(); activePlayer.stopAuto(); activePlayer.step(-1);
        } else if (ev.key === 'r' || ev.key === 'R' || ev.key === 'ArrowRight') {
            ev.preventDefault(); activePlayer.stopAuto(); activePlayer.step(1);
        } else if (ev.key === 'a' || ev.key === 'A') {
            ev.preventDefault(); if (activePlayer.autoRunning) activePlayer.stopAuto(); else activePlayer.startAuto();
        }
    });

    players.forEach(initPlayer);

    function initPlayer(playerEl) {
        // Find local viewport and sheet
        const viewport = playerEl.querySelector('.viewport');
        const sheet = viewport ? viewport.querySelector('img') : null;

        // Find the controls container.
        let controls = null;
        if (playerEl.nextElementSibling && playerEl.nextElementSibling.classList.contains('controls')) {
            controls = playerEl.nextElementSibling;
        }

        // Read configuration (support data- attributes on viewport or img)
        const cfgSource = viewport || sheet || playerEl;
        const TOTAL_FRAMES = intAttr(cfgSource, 'data-total-frames', DEFAULTS.totalFrames);
        const FRAME_W = intAttr(cfgSource, 'data-frame-w', DEFAULTS.frameW);
        const FRAME_H = intAttr(cfgSource, 'data-frame-h', DEFAULTS.frameH);
        const FRAMES_PER_ROW = intAttr(cfgSource, 'data-frames-per-row', DEFAULTS.framesPerRow);
        let fps = intAttr(cfgSource, 'data-fps', DEFAULTS.fps);

        // Find controls inside controls container (scoped queries). IDs in the markup are duplicated, so query within controls to get the correct elements.
        const leftBtn = controls ? controls.querySelector('#leftBtn') : null;
        const rightBtn = controls ? controls.querySelector('#rightBtn') : null;
        const autoBtn = controls ? controls.querySelector('#autoBtn') : null;
        const speedRange = controls ? controls.querySelector('#speedRange') : null;
        const speedValue = controls ? controls.querySelector('#speedValue') : null;
        const frameRange = controls ? controls.querySelector('#frameRange') : null;
        const frameValue = controls ? controls.querySelector('#frameValue') : null;

        // Local state
        let current = 0; // 0-based
        let autoTimer = null;
        let userInteractingFrame = false;

        function updatePosition() {
            if (!sheet) return;
            const cols = FRAMES_PER_ROW > 0 ? FRAMES_PER_ROW : TOTAL_FRAMES;
            const col = current % cols;
            const row = Math.floor(current / cols);
            const x = -col * FRAME_W;
            const y = -row * FRAME_H;
            sheet.style.position = 'relative';
            sheet.style.left = x + 'px';
            sheet.style.top = y + 'px';

            // keep frame slider/value in sync unless user is dragging it
            try {
                if (!userInteractingFrame) {
                    if (frameRange) frameRange.value = String(current + 1);
                    if (frameValue) frameValue.textContent = String(current + 1);
                }
            } catch (e) {
                // ignore
            }
        }

        function step(delta) {
            current = (current + delta + TOTAL_FRAMES) % TOTAL_FRAMES;
            updatePosition();
        }

        function startAuto() {
            if (autoTimer) return;
            if (autoBtn) autoBtn.setAttribute('aria-pressed', 'true');
            autoTimer = setInterval(() => step(1), 1000 / fps);
        }
        function stopAuto() {
            if (!autoTimer) return;
            clearInterval(autoTimer); autoTimer = null;
            if (autoBtn) autoBtn.setAttribute('aria-pressed', 'false');
        }

        // Image load handling: set sheet size and ensure viewport clipping
        if (sheet) {
            sheet.addEventListener('load', () => {
                const cols = FRAMES_PER_ROW > 0 ? FRAMES_PER_ROW : TOTAL_FRAMES;
                const rows = Math.ceil(TOTAL_FRAMES / cols);
                sheet.style.width = (FRAME_W * cols) + 'px';
                sheet.style.height = (FRAME_H * rows) + 'px';
                // Ensure viewport is clipped to single-frame size
                if (viewport) {
                    viewport.style.width = FRAME_W + 'px';
                    viewport.style.height = FRAME_H + 'px';
                    viewport.style.overflow = 'hidden';
                    viewport.style.position = 'relative';
                }
                updatePosition();
            });

            sheet.addEventListener('error', () => {
                console.error('Fehler beim Laden des Spritesheet:', sheet.src);
                const info = document.createElement('p');
                info.textContent = 'Fehler: Spritesheet konnte nicht geladen werden.';
                info.style.color = 'crimson';
                document.querySelector('main').prepend(info);
            });

            // if already loaded
            if (sheet.complete && sheet.naturalWidth) sheet.dispatchEvent(new Event('load'));
        }

        // Wire up controls
        if (leftBtn) leftBtn.addEventListener('click', () => { stopAuto(); step(-1); });
        if (rightBtn) rightBtn.addEventListener('click', () => { stopAuto(); step(1); });
        if (autoBtn) autoBtn.addEventListener('click', () => { if (autoTimer) stopAuto(); else startAuto(); });

        // Keyboard activation for buttons (space/enter)
        [leftBtn, rightBtn, autoBtn].forEach(b => {
            if (!b) return;
            b.addEventListener('keydown', e => {
                if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                    e.preventDefault(); b.click();
                }
            });
        });

        // Make the player focusable and set it active on click/focus so global keys target it
        if (!playerEl.hasAttribute('tabindex')) playerEl.setAttribute('tabindex', '0');
        const makeActive = () => setActivePlayer({ step, startAuto, stopAuto, playerEl, updatePosition, get autoRunning() { return !!autoTimer; } });
        playerEl.addEventListener('click', makeActive);
        playerEl.addEventListener('focus', makeActive);
        // If no active player yet, make the first one active by default
        if (!activePlayer) makeActive();

        // Speed control
        if (speedRange && speedValue) {
            speedRange.value = String(fps);
            speedValue.textContent = String(fps);
            speedRange.addEventListener('input', () => {
                const newFps = Math.max(1, Math.min(60, parseInt(speedRange.value, 10) || fps));
                fps = newFps;
                speedValue.textContent = String(fps);
                if (autoTimer) { clearInterval(autoTimer); autoTimer = setInterval(() => step(1), 1000 / fps); }
            });
        }

        // Frame control (slider)
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

        // initial position
        updatePosition();
    }

})();
