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

    // Helper to move a node into a target parent before a reference child and
    // return a restore function that puts the node back to its original place.
    // Uses native Element.moveBefore where available to preserve element state,
    // falling back to insertBefore when necessary.
    function moveBefore(node, targetParent, referenceNode) {
        if (!node || !targetParent) return function noop() { };
        const originalParent = node.parentNode;
        const originalNext = node.nextSibling; // may be null

        try {
            if (typeof targetParent.moveBefore === 'function') {
                targetParent.moveBefore(node, referenceNode || null);
            } else {
                targetParent.insertBefore(node, referenceNode || null);
            }
        } catch (e) {
            // fallback
            try { targetParent.insertBefore(node, referenceNode || null); } catch (e2) { /* ignore */ }
        }

        return function restore() {
            if (!originalParent) return;
            try {
                if (typeof originalParent.moveBefore === 'function') {
                    originalParent.moveBefore(node, originalNext || null);
                } else if (originalNext && originalNext.parentNode === originalParent) {
                    originalParent.insertBefore(node, originalNext);
                } else {
                    originalParent.appendChild(node);
                }
            } catch (e) {
                try { originalParent.appendChild(node); } catch (e2) { /* ignore */ }
            }
        };
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
        } else if (ev.key === 'f' || ev.key === 'F') {
            ev.preventDefault(); // toggle fullscreen for active player
            if (typeof activePlayer.toggleFullscreen === 'function') activePlayer.toggleFullscreen();
        } else if (ev.key === 'Escape' || ev.key === 'Esc') {
            // If active player is fullscreen, exit it
            if (typeof activePlayer.isFullscreen !== 'undefined' && activePlayer.isFullscreen && typeof activePlayer.toggleFullscreen === 'function') {
                ev.preventDefault(); activePlayer.toggleFullscreen();
            }
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

        // Inject fullscreen styles once
        if (!document.getElementById('spritesheet-animator-fullscreen-styles')) {
            const style = document.createElement('style');
            style.id = 'spritesheet-animator-fullscreen-styles';
            style.textContent = `
            .spitesheet-fullscreen-container{
                position:fixed!important;left:0;top:0;width:100vw;height:100vh;z-index:99999;
                display:flex;align-items:center;justify-content:center;background:#000;
            }
            .spitesheet-fullscreen-container .spitesheet-player{outline:none}
            .spitesheet-fullscreen-close{position:absolute;right:1rem;top:1rem;z-index:100000}
            `;
            document.head.appendChild(style);
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
        let current = 0; // Current frame index
        let autoTimer = null;
        let userInteractingFrame = false;
        // Fullscreen state
        let fullscreenContainer = null;
        let restoreFns = null; // array of restore functions for nodes moved
        let savedViewportTransform = '';

        // Calculate x/y offset of current frame and position the sheet inside the viewport
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

        // Move to the next/previous frame, looping around at the ends using modulo arithmetic
        function step(delta) {
            current = (current + delta + TOTAL_FRAMES) % TOTAL_FRAMES;
            updatePosition();
        }

        function startAuto() {
            if (autoTimer) return;
            if (autoBtn) autoBtn.setAttribute('aria-pressed', 'true');
            // Call step(1) at the configured fps by setting an interval timer
            autoTimer = setInterval(() => step(1), 1000 / fps);
        }
        function stopAuto() {
            if (!autoTimer) return;
            clearInterval(autoTimer); autoTimer = null;
            if (autoBtn) autoBtn.setAttribute('aria-pressed', 'false');
        }

        // Fullscreen helpers
        function enterFullscreen() {
            if (fullscreenContainer) return; // already fullscreen
            // create container
            fullscreenContainer = document.createElement('div');
            fullscreenContainer.className = 'spitesheet-fullscreen-container';

            // close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'spitesheet-fullscreen-close';
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => toggleFullscreen());
            fullscreenContainer.appendChild(closeBtn);

            document.body.appendChild(fullscreenContainer);

            // move only the playerEl into the container preserving the node
            restoreFns = [];
            restoreFns.push(moveBefore(playerEl, fullscreenContainer, closeBtn));

            // hide controls in place (do not move them)
            if (controls) {
                controls._savedDisplay = controls.style.display || '';
                controls.style.display = 'none';
            }

            // scale viewport to fill full screen height while preserving aspect
            if (viewport) {
                try {
                    const scale = FRAME_H ? (window.innerHeight / FRAME_H) : 1;
                    savedViewportTransform = viewport.style.transform || '';
                    viewport.style.transformOrigin = 'center center';
                    viewport.style.transform = `scale(${scale})`;
                    // center horizontally when scaled
                    viewport.style.margin = '0 auto';
                } catch (e) { /* ignore */ }
            }

            if (controls) {
                // make sure controls are visible above
                controls.style.zIndex = '100001';
            }
        }

        function exitFullscreen() {
            if (!fullscreenContainer) return;
            // restore moved nodes in reverse order
            if (restoreFns && restoreFns.length) {
                for (let i = restoreFns.length - 1; i >= 0; --i) {
                    try { restoreFns[i](); } catch (e) { /* ignore */ }
                }
            }
            restoreFns = null;
            // restore controls visibility
            if (controls) {
                controls.style.display = controls._savedDisplay || '';
                delete controls._savedDisplay;
            }

            // restore viewport transform
            if (viewport) {
                viewport.style.transform = savedViewportTransform || '';
                viewport.style.transformOrigin = '';
            }

            // remove container
            try { fullscreenContainer.remove(); } catch (e) { /* ignore */ }
            fullscreenContainer = null;
        }

        function toggleFullscreen() {
            if (fullscreenContainer) {
                exitFullscreen();
            } else {
                enterFullscreen();
            }
        }

        if (sheet) {
            // Set sheet size and ensure viewport clipping once image load completes
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

        // fullscreen button from HTML (if present)
        const fsBtn = controls ? controls.querySelector('.fullscreenBtn') : null;
        if (fsBtn) fsBtn.addEventListener('click', () => { toggleFullscreen(); fsBtn.setAttribute('aria-pressed', String(!!fullscreenContainer)); });

        // Keyboard activation for buttons (space/enter) after focusing them with tab
        [leftBtn, rightBtn, autoBtn, fsBtn].forEach(b => {
            if (!b) return;
            b.addEventListener('keydown', e => {
                if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
                    e.preventDefault(); b.click();
                }
            });
        });

        // Make the player focusable and set it active on click/focus so global keys target it
        if (!playerEl.hasAttribute('tabindex')) playerEl.setAttribute('tabindex', '0');
        const makeActive = () => setActivePlayer({ step, startAuto, stopAuto, playerEl, updatePosition, toggleFullscreen, get autoRunning() { return !!autoTimer; }, get isFullscreen() { return !!fullscreenContainer; } });
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

        // set initial position
        updatePosition();
    }

})();
