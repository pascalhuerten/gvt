/**
 * Fullscreen Manager Utility
 * Provides a reusable fullscreen interface for web content
 * Handles special cases for WebGL canvases with proper resolution scaling
 * 
 * Usage:
 *   const fm = new FullscreenManager(element, { canvasElement, aspectRatio });
 *   fm.toggleFullscreen();
 */

(function (globalScope) {
    'use strict';

    class FullscreenManager {
        /**
         * @param {HTMLElement} containerElement - The main element to enter fullscreen
         * @param {Object} options - Configuration options
         * @param {HTMLCanvasElement|HTMLCanvasElement[]} options.canvasElement - Optional WebGL canvas(es) to resize
         * @param {number} options.aspectRatio - Optional aspect ratio (width/height)
         * @param {HTMLElement[]} options.hideElements - Elements to hide in fullscreen
         * @param {Object} options.containerClass - CSS class for fullscreen container
         * @param {Object} options.closeButtonClass - CSS class for close button
         * @param {Function} options.onEnter - Callback when entering fullscreen
         * @param {Function} options.onExit - Callback when exiting fullscreen
         */
        constructor(containerElement, options = {}) {
            if (!containerElement) {
                console.error('FullscreenManager: containerElement is required');
                return;
            }

            this.containerElement = containerElement;

            // Support both single canvas and array of canvases
            let canvasElements = options.canvasElement || null;
            if (canvasElements && !Array.isArray(canvasElements)) {
                canvasElements = [canvasElements];
            }
            this.canvasElements = canvasElements || [];

            this.aspectRatio = options.aspectRatio || null;
            this.hideElements = options.hideElements || [];
            this.containerClass = options.containerClass || 'fullscreen-container';
            this.closeButtonClass = options.closeButtonClass || 'fullscreen-close';
            this.onEnter = options.onEnter || null;
            this.onExit = options.onExit || null;

            // Internal state
            this.isFullscreen = false;
            this.fullscreenContainer = null;
            this.originalParent = null;
            this.originalNextSibling = null;
            this.restoreFunctions = [];
            this.savedStyles = {};
            this.savedCanvasProps = null;

            // Inject styles once
            this.injectStyles();
        }

        /**
         * Inject fullscreen CSS styles once per page
         */
        injectStyles() {
            if (document.getElementById('fullscreen-manager-styles')) {
                return; // Already injected
            }

            const style = document.createElement('style');
            style.id = 'fullscreen-manager-styles';
            style.textContent = `
                .fullscreen-container {
                    position: fixed !important;
                    left: 0;
                    top: 0;
                    width: 100vw;
                    height: 100vh;
                    z-index: 99999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #000;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .fullscreen-container > * {
                    max-width: 100%;
                    max-height: 100%;
                }

                .fullscreen-close {
                    position: fixed;
                    right: 1rem;
                    top: 1rem;
                    z-index: 100000;
                    color: #fff;
                    background: rgba(0, 0, 0, 0.5);
                    border: 1px solid #fff;
                    border-radius: 4px;
                    font-size: 1.4rem;
                    cursor: pointer;
                    padding: 0.4rem 0.6rem;
                    line-height: 1;
                    transition: background 0.2s;
                }

                .fullscreen-close:hover {
                    background: rgba(0, 0, 0, 0.8);
                }

                /* For elements that shouldn't scroll */
                body.fullscreen-active {
                    overflow: hidden;
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Calculate dimensions for a canvas in fullscreen while preserving aspect ratio
         * Uses the first canvas in the list as reference
         * @returns {Object} {width, height} in pixels
         */
        calculateCanvasDimensions() {
            if (!this.canvasElements || this.canvasElements.length === 0) {
                return { width: window.innerWidth, height: window.innerHeight };
            }

            // Get original aspect ratio from first canvas
            const firstCanvas = this.canvasElements[0];
            const originalWidth = firstCanvas.width;
            const originalHeight = firstCanvas.height;
            const canvasAspectRatio = originalWidth / originalHeight;

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const screenAspectRatio = screenWidth / screenHeight;

            let newWidth, newHeight;

            if (canvasAspectRatio > screenAspectRatio) {
                // Canvas is wider than screen - fit to width
                newWidth = screenWidth;
                newHeight = Math.floor(screenWidth / canvasAspectRatio);
            } else {
                // Canvas is taller than screen - fit to height
                newHeight = screenHeight;
                newWidth = Math.floor(screenHeight * canvasAspectRatio);
            }

            return { width: newWidth, height: newHeight };
        }

        /**
         * Enter fullscreen mode
         */
        enterFullscreen() {
            if (this.isFullscreen) {
                return; // Already fullscreen
            }

            // Save original DOM position
            this.originalParent = this.containerElement.parentNode;
            this.originalNextSibling = this.containerElement.nextSibling;

            // Create fullscreen container
            this.fullscreenContainer = document.createElement('div');
            this.fullscreenContainer.className = this.containerClass;

            // Create close button
            const closeBtn = document.createElement('button');
            closeBtn.className = this.closeButtonClass;
            closeBtn.setAttribute('aria-label', 'Exit fullscreen');
            closeBtn.textContent = '✕';
            closeBtn.addEventListener('click', () => this.toggleFullscreen());
            this.fullscreenContainer.appendChild(closeBtn);

            // Add to DOM
            document.body.appendChild(this.fullscreenContainer);

            // Move container element into fullscreen container
            this.fullscreenContainer.appendChild(this.containerElement);

            // Hide specified elements
            this.hideElements.forEach(el => {
                if (el) {
                    this.savedStyles[Math.random()] = el.style.display;
                    el.style.display = 'none';
                }
            });

            // Prevent body scrolling
            document.body.classList.add('fullscreen-active');

            // Handle canvas resizing
            if (this.canvasElements && this.canvasElements.length > 0) {
                // Check if any canvas can get context (is a WebGL canvas)
                const hasWebGLCanvas = this.canvasElements.some(c => c.getContext);
                if (hasWebGLCanvas) {
                    this.resizeCanvasesForFullscreen();
                }
            }

            this.isFullscreen = true;

            // Call enter callback
            if (typeof this.onEnter === 'function') {
                this.onEnter();
            }

            // Handle window resize while in fullscreen
            this._resizeHandler = () => {
                if (this.isFullscreen && this.canvasElements && this.canvasElements.length > 0) {
                    this.resizeCanvasesForFullscreen();
                }
            };
            window.addEventListener('resize', this._resizeHandler);
        }

        /**
         * Resize all canvases for fullscreen, maintaining aspect ratio
         * All canvases are set to the same dimensions
         */
        resizeCanvasesForFullscreen() {
            if (!this.canvasElements || this.canvasElements.length === 0) return;

            const { width, height } = this.calculateCanvasDimensions();

            // Save original properties only once
            if (!this.savedCanvasProps) {
                this.savedCanvasProps = this.canvasElements.map(canvas => ({
                    width: canvas.width,
                    height: canvas.height,
                    style: {
                        width: canvas.style.width,
                        height: canvas.style.height,
                    }
                }));
            }

            // Resize all canvases to the same dimensions
            this.canvasElements.forEach((canvas, index) => {
                // Set canvas drawing buffer size
                canvas.width = width;
                canvas.height = height;

                // Ensure CSS doesn't override the dimensions
                canvas.style.width = width + 'px';
                canvas.style.height = height + 'px';

                // If this is a WebGL canvas, update viewport
                const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                if (gl) {
                    // Call the optional viewport resize function if it exists
                    if (window.resizeCanvasToDisplaySize) {
                        window.resizeCanvasToDisplaySize(canvas);
                    }
                    // Also trigger a manual WebGL viewport update
                    gl.viewport(0, 0, width, height);
                }
            });
        }

        /**
         * Legacy method name for backward compatibility
         * @deprecated Use resizeCanvasesForFullscreen instead
         */
        resizeCanvasForFullscreen() {
            this.resizeCanvasesForFullscreen();
        }

        /**
         * Exit fullscreen mode
         */
        exitFullscreen() {
            if (!this.isFullscreen) {
                return; // Not in fullscreen
            }

            // Remove resize listener
            if (this._resizeHandler) {
                window.removeEventListener('resize', this._resizeHandler);
                this._resizeHandler = null;
            }

            // Restore original canvas properties
            if (this.canvasElements && this.canvasElements.length > 0 && this.savedCanvasProps) {
                this.canvasElements.forEach((canvas, index) => {
                    if (this.savedCanvasProps[index]) {
                        const props = this.savedCanvasProps[index];
                        canvas.width = props.width;
                        canvas.height = props.height;
                        canvas.style.width = props.style.width;
                        canvas.style.height = props.style.height;

                        // Restore WebGL viewport
                        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                        if (gl) {
                            if (window.resizeCanvasToDisplaySize) {
                                window.resizeCanvasToDisplaySize(canvas);
                            }
                            gl.viewport(0, 0, canvas.width, canvas.height);
                        }
                    }
                });

                this.savedCanvasProps = null;
            }

            // Restore hidden elements
            this.hideElements.forEach((el, idx) => {
                if (el) {
                    el.style.display = this.savedStyles[idx] || '';
                }
            });
            this.savedStyles = {};

            // Restore body scrolling
            document.body.classList.remove('fullscreen-active');

            // Move element back to original position
            if (this.originalParent) {
                if (this.originalNextSibling) {
                    this.originalParent.insertBefore(this.containerElement, this.originalNextSibling);
                } else {
                    this.originalParent.appendChild(this.containerElement);
                }
            }

            // Remove fullscreen container
            if (this.fullscreenContainer && this.fullscreenContainer.parentNode) {
                this.fullscreenContainer.remove();
            }
            this.fullscreenContainer = null;

            this.isFullscreen = false;

            // Call exit callback
            if (typeof this.onExit === 'function') {
                this.onExit();
            }
        }

        /**
         * Toggle fullscreen mode
         */
        toggleFullscreen() {
            if (this.isFullscreen) {
                this.exitFullscreen();
            } else {
                this.enterFullscreen();
            }
        }

        /**
         * Check if currently in fullscreen
         */
        getIsFullscreen() {
            return this.isFullscreen;
        }
    }

    // Export to global scope
    globalScope.FullscreenManager = FullscreenManager;

})(window);
