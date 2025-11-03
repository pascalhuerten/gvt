/**
 * EA2 - Interactive Vertex Editor
 * Uses modular vertex system (vertex-core, vertex-utils, vertex-editor)
 */

// Initialize the editor when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
    document.addEventListener('DOMContentLoaded', initFullscreenManager);
} else {
    initEditor();
    initFullscreenManager();
}


function initEditor() {
    // Create and initialize the vertex editor
    const editor = new VertexEditor({
        canvas: document.getElementById('background-canvas'),
        overlayCanvas: document.getElementById('overlay-canvas'),
        backgroundImageCanvas: document.getElementById('background-image-canvas'),
    });

    // Initialize display and start animation loops
    editor.initializeDisplay();
    editor.start();

    // Toggle play/pause on 'a' key press (only when not typing in input)
    document.addEventListener('keydown', (event) => {
        // Don't trigger if user is typing in input, textarea, or contenteditable element
        const isTextInput = document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.contentEditable === 'true';

        if (event.key === 'a' && !isTextInput) {
            editor.togglePlayPause();
        }
    });

    // Make editor globally accessible for debugging
    window.vertexEditor = editor;
}
/**
 * EA2 Fullscreen Integration Example
 * Shows how to use FullscreenManager with the EA2 vertex editor
 */

// Initialize fullscreen manager for EA2
function initFullscreenManager() {
    // Wait for editor to be initialized
    if (!window.vertexEditor) {
        console.warn('Vertex editor not yet initialized');
        return;
    }

    console.log('Initializing EA2 FullscreenManager');

    const fullscreenManager = new FullscreenManager(
        document.getElementById('canvas-wrap'),
        {
            canvasElement: [
                document.getElementById('background-canvas'),
                document.getElementById('background-image-canvas'),
                document.getElementById('overlay-canvas')
            ],
            hideElements: [
                document.querySelector('#controls'),
            ],
            onEnter: () => {
                // Optional: Pause controls or adjust UI
                console.log('EA2 entered fullscreen');
            },
            onExit: () => {
                // Optional: Resume controls or adjust UI
                console.log('EA2 exited fullscreen');
            }
        }
    );

    // Store reference for external access
    window.ea2FullscreenManager = fullscreenManager;

    // Bind to a fullscreen button if it exists
    const fsBtn = document.querySelector('.fullscreenBtn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
            fullscreenManager.toggleFullscreen();
        });
        // Add visual feedback
        fsBtn.setAttribute('aria-pressed', 'false');
        fsBtn.addEventListener('click', () => {
            fsBtn.setAttribute('aria-pressed', String(fullscreenManager.getIsFullscreen()));
        });
    }

    // Also toggle fullscreen on pressing 'F' key (only when not typing in input)
    document.addEventListener('keydown', (event) => {
        // Don't trigger if user is typing in input, textarea, or contenteditable element
        const isTextInput = document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.contentEditable === 'true';

        if ((event.key === 'f' || event.key === 'F') && !isTextInput) {
            fullscreenManager.toggleFullscreen();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && fullscreenManager.getIsFullscreen()) {
            fullscreenManager.exitFullscreen();
        }
    });
}