/**
 * EA2 - Interactive Vertex Editor
 * Uses modular vertex system (vertex-core, vertex-utils, vertex-editor)
 */

// Initialize the editor when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
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

    // Make editor globally accessible for debugging
    window.vertexEditor = editor;
}
