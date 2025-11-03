/**
 * EA3 - Vertex Viewer (Display Only)
 * Simple viewer for displaying created geometries without editing interface
 * Uses VertexCore module for rendering
 */

class SimpleVertexViewer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.gl = this.canvas.getContext('webgl2');
        if (!this.gl) {
            console.error('WebGL2 not available. Please use a browser with WebGL2 support, or update your graphics drivers.');
            // Show user-friendly error message
            if (this.canvas.parentElement) {
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'padding: 20px; background: #fee; color: #c33; border: 1px solid #fcc; border-radius: 4px; font-family: Arial, sans-serif; margin: 10px 0;';
                errorMsg.innerHTML = '<strong>WebGL2 not supported</strong><br>Your browser does not support WebGL2. Please try:<ul style="margin: 10px 0;"><li>Enable webgl2 in browser settings</li><li>Update your graphics drivers</li><li>Try a different browser</li></ul>';
                this.canvas.parentElement.insertBefore(errorMsg, this.canvas);
                // remove canvas to avoid confusion
                this.canvas.remove();
            }
            return;
        }

        // Data
        this.layers = [];
        this.clearColor = [0.98, 0.98, 1.0, 1.0];

        // Animation
        this.isPlaying = true;
        this.elapsedTime = 0;
        this.uTime = 0;
        this.period = 30.0;

        // GPU buffers
        this.vbo = this.gl.createBuffer();
        this.colorBuffer = this.gl.createBuffer();
        this.lastDrawTime = Date.now();
        this.startTime = Date.now();

        console.log('Vertex Viewer initialized');
    }

    // Load geometry from JSON data
    loadGeometry(data) {
        try {
            const result = VertexCore.loadFileContent(JSON.stringify(data), this.layers);
            this.layers = result.layers;
            this.period = result.period;
            console.log('Geometry loaded successfully');
        } catch (err) {
            console.error('Error loading geometry:', err);
        }
    }

    // Load geometry from a file URL
    async loadGeometryFromUrl(url) {
        try {
            const response = await fetch(url);
            const text = await response.text();
            this.loadGeometry(JSON.parse(text));
        } catch (err) {
            console.error('Error loading geometry from URL:', err);
        }
    }

    // Get total vertex count across all layers
    getVertexCount() {
        return this.layers.reduce((sum, layer) => sum + (layer.vertices.length / 2), 0);
    }

    // Update animation
    update(deltaTime) {
        if (this.isPlaying) {
            this.elapsedTime += deltaTime;
            this.uTime = this.elapsedTime % this.period;
        }
    }

    // Render the geometry
    draw() {
        VertexCore.resizeCanvasToDisplaySize(this.canvas);
        VertexCore.draw(this.gl, this.layers, this.clearColor, this.vbo, this.colorBuffer, this.uTime, this.period, this.canvas);
    }

    // Toggle playback
    play() {
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
    }

    togglePlayPause() {
        this.isPlaying = !this.isPlaying;
    }

    // Reset animation
    resetTime() {
        this.elapsedTime = 0;
        this.uTime = 0;
    }

    // Start animation loop
    start() {
        let lastFrameTime = performance.now();

        const frame = () => {
            const now = performance.now();
            const deltaTime = (now - lastFrameTime) / 1000;
            lastFrameTime = now;

            this.update(deltaTime);
            this.draw();
            requestAnimationFrame(frame);
        };

        requestAnimationFrame(frame);
    }

    // Set all layer visibility
    setAllLayersVisible(visible) {
        this.layers.forEach(layer => {
            layer.visible = visible;
        });
    }

    // Get layer by index
    getLayer(index) {
        return this.layers[index];
    }

    // Get layer by ID
    getLayerById(id) {
        return this.layers.find(l => l.id === id);
    }

    // Get all layers
    getAllLayers() {
        return this.layers;
    }

    // Export current geometry
    exportGeometry() {
        return VertexCore.exportVerticesJSON(this.layers, this.period);
    }

    // Download current geometry as JSON
    downloadGeometry(filename = 'geometry.json') {
        const data = this.exportGeometry();
        VertexCore.downloadJSON(data, filename);
    }
}

// Make viewer globally accessible
window.SimpleVertexViewer = SimpleVertexViewer;

// Optional: Auto-initialize if a default canvas exists
function autoInitializeViewer() {
    const canvas = document.getElementById('background-canvas');
    if (canvas) {
        const viewer = new SimpleVertexViewer('background-canvas');
        window.vertexViewer = viewer;
        viewer.start();

        // Try to load default geometry if it exists
        viewer.loadGeometryFromUrl('defaultVertices.json').catch(() => {
            console.log('No default geometry file found');
        });

        // Toggle play/pause on 'a' key press (only when not typing in input)
        document.addEventListener('keydown', (event) => {
            // Don't trigger if user is typing in input, textarea, or contenteditable element
            const isTextInput = document.activeElement.tagName === 'INPUT' ||
                document.activeElement.tagName === 'TEXTAREA' ||
                document.activeElement.contentEditable === 'true';

            if (event.key === 'a' && !isTextInput) {
                viewer.togglePlayPause();
            }
        });
    }
}

// Initialize fullscreen manager for EA3
function initFullscreenManager() {
    // Wait for viewer to be initialized
    if (!window.vertexViewer) {
        console.warn('Vertex viewer not yet initialized');
        return;
    }

    const fullscreenManager = new FullscreenManager(
        document.getElementById('canvas-wrap'),
        {
            canvasElement: document.getElementById('background-canvas'),
            hideElements: [],
        }
    );

    // Store reference for external access
    window.ea3FullscreenManager = fullscreenManager;

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

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInitializeViewer);
    document.addEventListener('DOMContentLoaded', initFullscreenManager);
} else {
    autoInitializeViewer();
    initFullscreenManager();
}

