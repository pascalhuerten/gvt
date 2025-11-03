/**
 * Vertex Editor Module
 * Handles all UI interactions, event listeners, and drawing-specific functionality
 * Requires: VertexCore, VertexUtils, and corresponding HTML elements
 */

(function (globalScope) {
    'use strict';

    // ========================================================================
    // Coordinate Conversion Functions (WebGL NDC conversions)
    // ========================================================================

    /**
     * Convert mouse event coordinates to WebGL Normalized Device Coordinates
     * @param {MouseEvent} e - Mouse event
     * @param {HTMLCanvasElement} canvas - Canvas element (main canvas for NDC calculation)
     * @param {boolean} snapToGrid - Enable grid snapping
     * @param {number} gridColumns - Number of grid columns (scales grid with canvas size)
     * @returns {[number, number]} [ndcX, ndcY] in range [-1, 1]
     */
    function eventToNDC(e, canvas, snapToGrid = false, gridColumns = 45) {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        // Use display dimensions for proportion calculation
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;

        // Apply grid snapping if enabled
        // Grid snapping based on columns - scales with canvas size
        if (snapToGrid) {
            const canvasBufferWidth = canvas.width / dpr;
            const canvasBufferHeight = canvas.height / dpr;

            // Calculate column and row size based on canvas dimensions
            const cellWidth = canvasBufferWidth / gridColumns;
            // Maintain aspect ratio for rows
            const cellHeight = cellWidth;

            const pixelX = x * canvasBufferWidth;
            const pixelY = y * canvasBufferHeight;

            // Snap to grid cells
            const snappedPixelX = Math.round(pixelX / cellWidth) * cellWidth;
            const snappedPixelY = Math.round(pixelY / cellHeight) * cellHeight;

            x = snappedPixelX / canvasBufferWidth;
            y = snappedPixelY / canvasBufferHeight;
        }

        // NDC -1..1
        const ndcX = x * 2 - 1;
        const ndcY = (1 - y) * 2 - 1;
        return [ndcX, ndcY];
    }

    /**
     * Convert WebGL NDC coordinates to mouse event coordinates
     * @param {number} ndx - NDC X coordinate
     * @param {number} ndy - NDC Y coordinate
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @returns {{x: number, y: number}} Mouse coordinates
     */
    function ndcToClient(ndx, ndy, canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + (ndx * 0.5 + 0.5) * rect.width;
        const cy = rect.top + (1 - (ndy * 0.5 + 0.5)) * rect.height;
        return { x: cx, y: cy };
    }

    /**
     * Convert WebGL NDC coordinates to pixel coordinates
     * @param {number} x - NDC X coordinate
     * @param {number} y - NDC Y coordinate
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @returns {[number, number]} [pixelX, pixelY]
     */
    function ndcToPixel(x, y, canvas) {
        const rect = canvas.getBoundingClientRect();
        const px = (x * 0.5 + 0.5) * rect.width;
        const py = (1 - (y * 0.5 + 0.5)) * rect.height;
        return [px, py];
    }

    /**
     * Convert mouse coordinates to WebGL NDC coordinates
     * @param {number} clientX - Mouse X coordinate
     * @param {number} clientY - Mouse Y coordinate
     * @param {HTMLCanvasElement} canvas - Canvas element
     * @returns {[number, number]} [ndcX, ndcY] in range [-1, 1]
     */
    function clientToNDC(clientX, clientY, canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const ndcX = x * 2 - 1;
        const ndcY = (1 - y) * 2 - 1;
        return [ndcX, ndcY];
    }

    // ========================================================================
    // Vertex Query Functions
    // ========================================================================

    /**
     * Find the nearest vertex to a point in NDC coordinates
     * @param {number} ndcX - Point X in NDC coordinates
     * @param {number} ndcY - Point Y in NDC coordinates
     * @param {Array} layers - Array of Layer objects to search
     * @param {number} maxRadius - Maximum search radius in NDC coordinates
     * @param {number|null} searchLayerId - Optional: search only in specific layer
     * @returns {[number, number]|null} [ndcX, ndcY] of nearest vertex or null if not found
     */
    function findNearestVertexNdc(ndcX, ndcY, layers, maxRadius = 0.15, searchLayerId = null) {
        let nearestNdc = null;
        let nearestDistance = Infinity;

        for (const layer of layers) {
            if (searchLayerId !== null && layer.id !== searchLayerId) continue;
            if (layer.vertices.length === 0) continue;

            for (let i = 0; i < layer.vertices.length; i += 2) {
                const vertexNdcX = layer.vertices[i];
                const vertexNdcY = layer.vertices[i + 1];

                const dx = ndcX - vertexNdcX;
                const dy = ndcY - vertexNdcY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxRadius && dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestNdc = [vertexNdcX, vertexNdcY];
                }
            }
        }

        return nearestNdc;
    }

    class VertexEditor {
        constructor(config = {}) {
            // Canvas and WebGL
            this.canvas = config.canvas || document.getElementById('background-canvas');
            this.overlayCanvas = config.overlayCanvas || document.getElementById('overlay-canvas');
            this.backgroundImageCanvas = config.backgroundImageCanvas || document.getElementById('background-image-canvas');

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
                    errorMsg.style.cssText = 'padding: 20px; background: #fee; color: #c33; border: 1px solid #fcc; border-radius: 4px; font-family: Arial, sans-serif;';
                    errorMsg.innerHTML = '<strong>WebGL2 not supported</strong><br>Your browser does not support WebGL2. Please try:<ul style="margin: 10px 0;"><li>Enable webgl2 in browser settings</li><li>Update your graphics drivers</li><li>Try a different browser</li></ul>';
                    this.canvas.parentElement.insertBefore(errorMsg, this.canvas);
                    // remove canvas to avoid confusion
                    this.canvas.remove();
                }
                return;
            }

            this.overlayContext = this.overlayCanvas?.getContext('2d');
            this.bgImageCtx = this.backgroundImageCanvas?.getContext('2d');

            // Data
            this.layers = [];
            this.currentLayerId = null;
            this.nextLayerId = 1;
            this.editingLayerId = null;

            // State
            this.isDrawing = false;
            this.isColoring = false;
            this.lastPush = null;
            this.lastColorPos = null;
            this.lastMouseNdc = null;
            this.snappedVertexNdc = null;

            // Settings
            this.clearColor = [0.98, 0.98, 1.0, 1.0];
            this.showOverlay = false;
            this.snapToGrid = true;
            this.gridColumns = 45; // Number of columns (scales with canvas size)
            this.snapToVertex = false;
            this.colorMode = false;
            this.selectedColor = [1.0, 0.0, 0.0];
            this.colorAreaRadius = 20;
            this.isPlaying = false;
            this.elapsedTime = 0;
            this.uTime = 0;
            this.period = 30.0;
            this.backgroundImage = null;
            this.backgroundOpacity = 0.5;

            // Drawing constants
            this.MIN_DIST = 12;
            this.VERTEX_SNAP_RADIUS_NDC = 0.15;

            // GPU buffers
            this.vbo = this.gl.createBuffer();
            this.colorBuffer = this.gl.createBuffer();
            this.lastDrawTime = Date.now();
            this.startTime = Date.now();

            // UI elements
            this.uiElements = {};
            this.cacheUIElements(config);

            // Initialize
            this.createNewLayer();
            this.setupEventListeners();
        }

        // Cache UI element references
        cacheUIElements(config) {
            const ids = [
                'mode', 'lineWidth', 'lineWidthVal', 'undo', 'clear', 'export',
                'fileInput', 'loadDefault', 'vertexCount',
                'bgImage', 'bgOpacity', 'bgOpacityVal', 'clearBgImage',
                'layers-container', 'addLayer', 'showOverlay',
                'snapToGrid', 'gridSize', 'gridSizeVal',
                'colorMode', 'vertexColor', 'colorRadius', 'colorRadiusVal',
                'playPauseBtn', 'resetTimeBtn', 'timeSlider', 'timeVal', 'periodInput',
                'shaderDrawer', 'shaderDrawerClose', 'shaderLayerName',
                'vertexShaderText', 'fragmentShaderText', 'shaderApply', 'shaderReset', 'shaderCancel', 'shaderError'
            ];

            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) { this.uiElements[id] = el; } else { console.warn(`UI element with ID "${id}" not found`); }
            });
        }

        // Layer management
        createNewLayer() {
            const layerNumber = this.layers.length + 1;
            const layer = new VertexCore.Layer(this.nextLayerId++, `Layer ${layerNumber}`);
            this.layers.push(layer);
            if (!this.currentLayerId) this.currentLayerId = layer.id;
            return layer;
        }

        getCurrentLayer() {
            return this.layers.find(l => l.id === this.currentLayerId) || this.layers[0];
        }

        setCurrentLayer(layerId) {
            if (this.layers.find(l => l.id === layerId)) {
                this.currentLayerId = layerId;
                this.updateLayerUI();
                this.updateVertexCount();
            }
        }

        deleteLayer(layerId) {
            const idx = this.layers.findIndex(l => l.id === layerId);
            if (idx !== -1) {
                this.layers.splice(idx, 1);
                if (this.currentLayerId === layerId) {
                    this.currentLayerId = this.layers[0]?.id || null;
                }
                this.updateLayerUI();
            }
        }

        moveLayerUp(layerId) {
            const idx = this.layers.findIndex(l => l.id === layerId);
            if (idx > 0) {
                [this.layers[idx], this.layers[idx - 1]] = [this.layers[idx - 1], this.layers[idx]];
                this.updateLayerUI();
            }
        }

        moveLayerDown(layerId) {
            const idx = this.layers.findIndex(l => l.id === layerId);
            if (idx < this.layers.length - 1) {
                [this.layers[idx], this.layers[idx + 1]] = [this.layers[idx + 1], this.layers[idx]];
                this.updateLayerUI();
            }
        }

        renameLayer(layerId) {
            const layer = this.layers.find(l => l.id === layerId);
            if (!layer) return;

            const newName = prompt(`Rename layer "${layer.name}" to:`, layer.name);
            if (newName && newName.trim()) {
                layer.name = newName.trim();
                this.updateLayerUI();
            }
        }

        // UI Updates
        updateVertexCount() {
            const currentLayer = this.getCurrentLayer();
            if (this.uiElements['vertexCount']) {
                if (!currentLayer) {
                    this.uiElements['vertexCount'].textContent = 'Vertices: 0';
                } else if (currentLayer.isIndexed) {
                    const uniqueCount = currentLayer.vertices.length / 2;
                    const indexCount = currentLayer.indices.length;
                    this.uiElements['vertexCount'].textContent = `Vertices: ${indexCount} (${uniqueCount} unique)`;
                } else {
                    const flatCount = currentLayer.vertices.length / 2;
                    this.uiElements['vertexCount'].textContent = `Vertices: ${flatCount} (flat format)`;
                }
            }
        }

        updateLayerUI() {
            const container = this.uiElements['layers-container'];
            if (!container) return;

            container.innerHTML = '';
            this.layers.forEach((layer, index) => {
                const div = document.createElement('div');
                div.className = 'layer-item';
                if (layer.id === this.currentLayerId) div.classList.add('active');

                const visibility = document.createElement('input');
                visibility.type = 'checkbox';
                visibility.checked = layer.visible;
                visibility.addEventListener('change', () => {
                    layer.visible = visibility.checked;
                });

                const label = document.createElement('label');
                label.textContent = layer.name;
                label.className = 'layer-label';
                label.style.cursor = 'pointer';
                label.addEventListener('click', () => this.setCurrentLayer(layer.id));

                const renameBtn = document.createElement('button');
                renameBtn.textContent = '✎';
                renameBtn.className = 'layer-rename-btn';
                renameBtn.title = 'Rename layer';
                renameBtn.addEventListener('click', () => this.renameLayer(layer.id));

                const moveUpBtn = document.createElement('button');
                moveUpBtn.textContent = '↑';
                moveUpBtn.className = 'layer-move-btn';
                moveUpBtn.title = 'Move layer up';
                moveUpBtn.disabled = index === 0;
                moveUpBtn.addEventListener('click', () => this.moveLayerUp(layer.id));

                const moveDownBtn = document.createElement('button');
                moveDownBtn.textContent = '↓';
                moveDownBtn.className = 'layer-move-btn';
                moveDownBtn.title = 'Move layer down';
                moveDownBtn.disabled = index === this.layers.length - 1;
                moveDownBtn.addEventListener('click', () => this.moveLayerDown(layer.id));

                const shaderBtn = document.createElement('button');
                shaderBtn.textContent = '✎ Shader';
                shaderBtn.className = 'layer-shader-btn';
                shaderBtn.addEventListener('click', () => this.openShaderEditor(layer.id));

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '✕';
                deleteBtn.className = 'layer-delete-btn';
                deleteBtn.addEventListener('click', () => this.deleteLayer(layer.id));

                div.appendChild(visibility);
                div.appendChild(label);
                div.appendChild(renameBtn);
                div.appendChild(moveUpBtn);
                div.appendChild(moveDownBtn);
                div.appendChild(shaderBtn);
                div.appendChild(deleteBtn);
                container.appendChild(div);
            });

            const currentLayer = this.getCurrentLayer();
            if (currentLayer) {
                if (this.uiElements.mode) this.uiElements.mode.value = currentLayer.mode;
                if (this.uiElements.lineWidth) this.uiElements.lineWidth.value = currentLayer.lineWidth;
                if (this.uiElements.lineWidthVal) this.uiElements.lineWidthVal.textContent = currentLayer.lineWidth;
            }
        }

        // Shader editor
        openShaderEditor(layerId) {
            const layer = this.layers.find(l => l.id === layerId);
            if (!layer) return;

            this.editingLayerId = layerId;
            if (this.uiElements.shaderLayerName) this.uiElements.shaderLayerName.textContent = layer.name;
            if (this.uiElements.vertexShaderText) this.uiElements.vertexShaderText.value = layer.vertexShader;
            if (this.uiElements.fragmentShaderText) this.uiElements.fragmentShaderText.value = layer.fragmentShader;
            if (this.uiElements.shaderError) this.uiElements.shaderError.textContent = '';

            if (this.uiElements.shaderDrawer) {
                this.uiElements.shaderDrawer.classList.add('open');
                setTimeout(() => {
                    this.canvas.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 50);
            }
        }

        closeShaderEditor() {
            if (this.uiElements.shaderDrawer) this.uiElements.shaderDrawer.classList.remove('open');
            this.editingLayerId = null;
        }

        applyShaders() {
            if (!this.editingLayerId) return;
            const layer = this.layers.find(l => l.id === this.editingLayerId);
            if (!layer) return;

            layer.vertexShader = this.uiElements.vertexShaderText?.value || VertexCore.DEFAULT_VS;
            layer.fragmentShader = this.uiElements.fragmentShaderText?.value || VertexCore.DEFAULT_FS;
            layer.program = null;

            const prog = VertexCore.createLayerProgram(this.gl, layer);
            if (prog) {
                if (this.uiElements.shaderError) this.uiElements.shaderError.textContent = '';
            } else {
                if (this.uiElements.shaderError) this.uiElements.shaderError.textContent = layer.shaderError || 'Compilation error';
            }
        }

        resetShaders() {
            if (this.uiElements.vertexShaderText) this.uiElements.vertexShaderText.value = VertexCore.DEFAULT_VS;
            if (this.uiElements.fragmentShaderText) this.uiElements.fragmentShaderText.value = VertexCore.DEFAULT_FS;
            if (this.uiElements.shaderError) this.uiElements.shaderError.textContent = '';
        }

        // Drawing operations
        pushPoint(clientX, clientY, ndcX, ndcY) {
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer) return false;

            // Use indexed representation - automatically deduplicates vertices
            currentLayer.addVertexIndexed(ndcX, ndcY, this.selectedColor, 1e-6);

            this.lastPush = { x: clientX, y: clientY };
            this.updateVertexCount();
            return true;
        }

        isPointFarEnoughFromClient(clientX, clientY) {
            if (this.lastPush === null) return true;
            const dx = clientX - this.lastPush.x;
            const dy = clientY - this.lastPush.y;
            return (dx * dx + dy * dy) > (this.MIN_DIST * this.MIN_DIST);
        }

        addPointFromEvent(e, onlyIfFarEnough = false) {
            const clientX = e.clientX;
            const clientY = e.clientY;
            let [ndx, ndy] = eventToNDC(e, this.canvas, this.snapToGrid, this.gridColumns);

            if (this.snapToVertex) {
                const snappedNdc = findNearestVertexNdc(ndx, ndy, this.layers, this.VERTEX_SNAP_RADIUS_NDC, this.currentLayerId);
                if (snappedNdc) {
                    [ndx, ndy] = snappedNdc;
                }
            }

            if (!onlyIfFarEnough || this.isPointFarEnoughFromClient(clientX, clientY)) {
                return this.pushPoint(clientX, clientY, ndx, ndy);
            }
            return false;
        }

        undoLast() {
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer) return;
            if (currentLayer.indices.length > 0) {
                currentLayer.removeLastVertexIndexed();
                // Clean up orphaned vertices
                currentLayer.compactGeometry();
            }
            this.updateVertexCount();
        }

        clearAll() {
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer) return;
            currentLayer.vertices = new Float32Array();
            currentLayer.colors = new Float32Array();
            currentLayer.indices = new Uint32Array();
            currentLayer.indexBuffer = null;
            this.updateVertexCount();
            this.lastPush = null;
        }

        // Color mode - updated to work with indexed geometry
        findVerticesInArea(clientX, clientY, radius) {
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer || currentLayer.vertices.length === 0) return [];

            const vertexIndices = [];
            const rect = this.canvas.getBoundingClientRect();

            // Iterate through unique vertices and find which are in area
            for (let i = 0; i < currentLayer.vertices.length; i += 2) {
                const [px, py] = ndcToPixel(
                    currentLayer.vertices[i],
                    currentLayer.vertices[i + 1],
                    this.canvas
                );
                const dx = clientX - px;
                const dy = clientY - py;
                const d = Math.sqrt(dx * dx + dy * dy);

                if (d <= radius) {
                    vertexIndices.push(i / 2); // Unique vertex index
                }
            }

            return vertexIndices;
        }

        colorVerticesInArea(clientX, clientY, color) {
            const uniqueVertexIndices = this.findVerticesInArea(clientX, clientY, this.colorAreaRadius);
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer) return false;

            // Update color for each unique vertex found in area
            uniqueVertexIndices.forEach(uniqueVertexIdx => {
                const colorIndex = uniqueVertexIdx * 3;
                currentLayer.colors[colorIndex] = color[0];
                currentLayer.colors[colorIndex + 1] = color[1];
                currentLayer.colors[colorIndex + 2] = color[2];
            });
            return uniqueVertexIndices.length > 0;
        }

        // File I/O
        exportVertices() {
            const data = VertexCore.exportVerticesJSON(this.layers, this.period);
            VertexCore.downloadJSON(data, 'vertices.json');
        }

        loadDefault() {
            fetch('defaultVertices.json')
                .then(r => r.text())
                .then(txt => this.loadFileContent(txt))
                .catch(() => console.error('Error loading default vertices'));
        }

        loadFileContent(txt) {
            try {
                const result = VertexCore.loadFileContent(txt, this.layers);
                this.layers = result.layers;
                this.period = result.period;
                this.currentLayerId = this.layers[this.layers.length - 1]?.id || null;
                this.nextLayerId = Math.max(...this.layers.map(l => l.id), 0) + 1;
                this.updateLayerUI();
                this.updateVertexCount();
                this.updateTimeDisplay();
            } catch (err) {
                console.error('Error loading file:', err);
            }
        }

        // Background image
        drawBackgroundImage() {
            if (!this.backgroundImage || !this.bgImageCtx) return;
            const dpr = window.devicePixelRatio || 1;
            this.bgImageCtx.clearRect(0, 0, this.backgroundImageCanvas.width / dpr, this.backgroundImageCanvas.height / dpr);
            this.bgImageCtx.globalAlpha = this.backgroundOpacity;
            this.bgImageCtx.drawImage(this.backgroundImage, 0, 0, this.backgroundImageCanvas.clientWidth, this.backgroundImageCanvas.clientHeight);
            this.bgImageCtx.globalAlpha = 1.0;
        }

        loadBackgroundImage(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.backgroundImage = img;
                    this.drawBackgroundImage();
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        clearBackgroundImage() {
            this.backgroundImage = null;
            if (this.bgImageCtx) {
                this.bgImageCtx.clearRect(0, 0, this.backgroundImageCanvas.clientWidth, this.backgroundImageCanvas.clientHeight);
            }
        }

        // Animation
        togglePlayPause() {
            this.isPlaying = !this.isPlaying;
            if (this.uiElements.playPauseBtn) {
                this.uiElements.playPauseBtn.textContent = this.isPlaying ? '⏸️ Pause' : '▶️ Play';
            }
        }

        resetTime() {
            this.elapsedTime = 0;
            this.uTime = 0;
            this.updateTimeDisplay();
        }

        updateTimeDisplay() {
            if (this.uiElements.timeVal) this.uiElements.timeVal.textContent = this.uTime.toFixed(2) + 's';
            if (this.uiElements.timeSlider) {
                const sliderValue = (this.uTime / this.period) * 100;
                this.uiElements.timeSlider.value = sliderValue;
                this.uiElements.periodInput.value = this.period.toFixed(2);
            }
        }

        setTimeFromSlider() {
            const sliderPercent = Number(this.uiElements.timeSlider?.value) / 100;
            this.elapsedTime = sliderPercent * this.period;
            this.uTime = this.elapsedTime % this.period;
            this.updateTimeDisplay();
        }

        setPeriod() {
            const newPeriod = Number(this.uiElements.periodInput?.value);
            if (newPeriod > 0) {
                this.period = newPeriod;
                this.updateTimeDisplay();
            }
        }

        // Rendering
        update(deltaTime) {
            if (this.isPlaying) {
                this.elapsedTime += deltaTime;
                this.uTime = this.elapsedTime % this.period;
                this.updateTimeDisplay();
            }
        }

        draw() {
            VertexCore.resizeCanvasToDisplaySize(this.canvas);
            VertexCore.draw(this.gl, this.layers, this.clearColor, this.vbo, this.colorBuffer, this.uTime, this.period, this.canvas);
        }

        drawOverlay() {
            if (!this.overlayContext) return;

            const dpr = window.devicePixelRatio || 1;
            this.overlayContext.clearRect(0, 0, this.overlayCanvas.width / dpr, this.overlayCanvas.height / dpr);

            // Draw grid if snap to grid is enabled
            if (this.snapToGrid) {
                // Use canvas buffer dimensions for precise grid calculation
                const canvasWidth = this.overlayCanvas.width / dpr;
                const canvasHeight = this.overlayCanvas.height / dpr;

                // Calculate cell dimensions based on fixed column count
                const cellWidth = canvasWidth / this.gridColumns;
                const cellHeight = cellWidth; // Square cells for consistent snapping

                this.overlayContext.strokeStyle = 'rgba(150, 150, 150, 0.3)';
                this.overlayContext.lineWidth = 1;
                this.overlayContext.setLineDash([1, 1]);

                // Draw vertical grid lines
                for (let col = 0; col <= this.gridColumns; col++) {
                    const x = col * cellWidth;
                    this.overlayContext.beginPath();
                    this.overlayContext.moveTo(x, 0);
                    this.overlayContext.lineTo(x, canvasHeight);
                    this.overlayContext.stroke();
                }

                // Draw horizontal grid lines
                const gridRows = Math.ceil(canvasHeight / cellHeight);
                for (let row = 0; row <= gridRows; row++) {
                    const y = row * cellHeight;
                    this.overlayContext.beginPath();
                    this.overlayContext.moveTo(0, y);
                    this.overlayContext.lineTo(canvasWidth, y);
                    this.overlayContext.stroke();
                }

                this.overlayContext.setLineDash([]);
            }

            // Draw color brush area
            if (this.colorMode && this.lastColorPos) {
                this.overlayContext.strokeStyle = `rgb(${Math.round(this.selectedColor[0] * 255)}, ${Math.round(this.selectedColor[1] * 255)}, ${Math.round(this.selectedColor[2] * 255)})`;
                this.overlayContext.lineWidth = 2;
                this.overlayContext.setLineDash([3, 3]);
                this.overlayContext.beginPath();
                this.overlayContext.arc(this.lastColorPos.x, this.lastColorPos.y, this.colorAreaRadius, 0, Math.PI * 2);
                this.overlayContext.stroke();
                this.overlayContext.setLineDash([]);
            }

            // Draw vertex snapping feedback
            if (this.snapToVertex && this.snappedVertexNdc) {
                const [px, py] = ndcToPixel(this.snappedVertexNdc[0], this.snappedVertexNdc[1], this.canvas);
                this.overlayContext.strokeStyle = '#00ff00';
                this.overlayContext.lineWidth = 3;
                this.overlayContext.setLineDash([5, 5]);
                this.overlayContext.beginPath();
                this.overlayContext.arc(px, py, 12, 0, Math.PI * 2);
                this.overlayContext.stroke();
                this.overlayContext.setLineDash([]);

                if (this.lastMouseNdc) {
                    const [cursorPx, cursorPy] = ndcToPixel(this.lastMouseNdc[0], this.lastMouseNdc[1], this.canvas);
                    this.overlayContext.strokeStyle = 'rgba(0, 255, 0, 0.5)';
                    this.overlayContext.lineWidth = 1;
                    this.overlayContext.setLineDash([2, 2]);
                    this.overlayContext.beginPath();
                    this.overlayContext.moveTo(px, py);
                    this.overlayContext.lineTo(cursorPx, cursorPy);
                    this.overlayContext.stroke();
                    this.overlayContext.setLineDash([]);
                }
            }

            if (!this.showOverlay) return;

            this.overlayContext.font = '12px sans-serif';
            const currentLayer = this.getCurrentLayer();
            if (!currentLayer || !currentLayer.visible) return;

            // Draw vertices
            for (let i = 0; i < currentLayer.vertices.length; i += 2) {
                const ndx = currentLayer.vertices[i], ndy = currentLayer.vertices[i + 1];
                const [px, py] = ndcToPixel(ndx, ndy, this.canvas);
                let color = 'rgba(54, 71, 148, 0.68)';
                if (i === 0) color = '#24d64aff';
                else if (i === currentLayer.vertices.length - 2) color = '#f11f1fff';

                this.overlayContext.beginPath();
                this.overlayContext.fillStyle = color;
                this.overlayContext.arc(px, py, 2, 0, Math.PI * 2);
                this.overlayContext.fill();
            }
        }

        // Event listeners setup
        setupEventListeners() {
            // Mode and line width
            if (this.uiElements.mode) {
                this.uiElements.mode.addEventListener('change', () => {
                    const currentLayer = this.getCurrentLayer();
                    if (currentLayer) currentLayer.mode = this.uiElements.mode.value;
                });
            }

            if (this.uiElements.lineWidth) {
                this.uiElements.lineWidth.addEventListener('input', () => {
                    if (this.uiElements.lineWidthVal) this.uiElements.lineWidthVal.textContent = this.uiElements.lineWidth.value;
                    const currentLayer = this.getCurrentLayer();
                    if (currentLayer) currentLayer.lineWidth = Number(this.uiElements.lineWidth.value);
                });
            }

            // Buttons
            if (this.uiElements.undo) this.uiElements.undo.addEventListener('click', () => this.undoLast());
            if (this.uiElements.clear) this.uiElements.clear.addEventListener('click', () => this.clearAll());
            if (this.uiElements.export) this.uiElements.export.addEventListener('click', () => this.exportVertices());
            if (this.uiElements.addLayer) {
                this.uiElements.addLayer.addEventListener('click', () => {
                    const newLayer = this.createNewLayer();
                    this.setCurrentLayer(newLayer.id);
                    this.updateLayerUI();
                    this.lastPush = null;
                });
            }

            // Grid snap
            if (this.uiElements.snapToGrid) {
                this.uiElements.snapToGrid.addEventListener('change', () => {
                    this.snapToGrid = this.uiElements.snapToGrid.checked;
                });
            }

            if (this.uiElements.gridSize) {
                this.uiElements.gridSize.addEventListener('input', () => {
                    this.gridColumns = Number(this.uiElements.gridSize.value);
                    if (this.uiElements.gridSizeVal) this.uiElements.gridSizeVal.textContent = this.uiElements.gridSize.value + ' columns';
                });
            }

            // Overlay
            if (this.uiElements.showOverlay) {
                this.uiElements.showOverlay.addEventListener('change', () => {
                    this.showOverlay = this.uiElements.showOverlay.checked;
                });
            }

            // Color mode
            if (this.uiElements.colorMode) {
                this.uiElements.colorMode.addEventListener('change', () => {
                    this.colorMode = this.uiElements.colorMode.checked;
                    if (!this.colorMode) this.lastColorPos = null;
                });
            }

            if (this.uiElements.vertexColor) {
                this.uiElements.vertexColor.addEventListener('change', () => {
                    this.selectedColor = VertexUtils.hexToRgb(this.uiElements.vertexColor.value);
                });
            }

            if (this.uiElements.colorRadius) {
                this.uiElements.colorRadius.addEventListener('input', () => {
                    this.colorAreaRadius = Number(this.uiElements.colorRadius.value);
                    if (this.uiElements.colorRadiusVal) this.uiElements.colorRadiusVal.textContent = this.uiElements.colorRadius.value + 'px';
                });
            }

            // Background image
            if (this.uiElements.bgImage) {
                this.uiElements.bgImage.addEventListener('change', (e) => {
                    const file = e.target.files?.[0];
                    if (file) this.loadBackgroundImage(file);
                    this.uiElements.bgImage.value = '';
                });
            }

            if (this.uiElements.clearBgImage) {
                this.uiElements.clearBgImage.addEventListener('click', () => this.clearBackgroundImage());
            }

            if (this.uiElements.bgOpacity) {
                this.uiElements.bgOpacity.addEventListener('input', () => {
                    this.backgroundOpacity = Number(this.uiElements.bgOpacity.value) / 100;
                    if (this.uiElements.bgOpacityVal) this.uiElements.bgOpacityVal.textContent = this.uiElements.bgOpacity.value + '%';
                    this.drawBackgroundImage();
                });
            }

            // Animation
            if (this.uiElements.playPauseBtn) {
                this.uiElements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
            }
            if (this.uiElements.resetTimeBtn) {
                this.uiElements.resetTimeBtn.addEventListener('click', () => this.resetTime());
            }
            if (this.uiElements.timeSlider) {
                this.uiElements.timeSlider.addEventListener('input', () => this.setTimeFromSlider());
            }
            if (this.uiElements.periodInput) {
                this.uiElements.periodInput.addEventListener('change', () => this.setPeriod());
                this.uiElements.periodInput.value = this.period;
            }

            // Shader editor
            if (this.uiElements.shaderDrawerClose) {
                this.uiElements.shaderDrawerClose.addEventListener('click', () => this.closeShaderEditor());
            }
            if (this.uiElements.shaderCancel) {
                this.uiElements.shaderCancel.addEventListener('click', () => this.closeShaderEditor());
            }
            if (this.uiElements.shaderApply) {
                this.uiElements.shaderApply.addEventListener('click', () => this.applyShaders());
            }
            if (this.uiElements.shaderReset) {
                this.uiElements.shaderReset.addEventListener('click', () => this.resetShaders());
            }

            // File import
            if (this.uiElements.fileInput) {
                this.uiElements.fileInput.addEventListener('change', (ev) => {
                    const f = ev.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            this.loadFileContent(e.target.result);
                        } catch (err) {
                            console.error(err);
                        }
                    };
                    reader.readAsText(f);
                    this.uiElements.fileInput.value = '';
                });
            }

            if (this.uiElements.loadDefault) {
                this.uiElements.loadDefault.addEventListener('click', () => this.loadDefault());
            }

            // Keyboard controls
            document.addEventListener('keydown', (e) => {
                if (e.key.toLowerCase() === 's') {
                    this.snapToVertex = true;
                }
            });

            document.addEventListener('keyup', (e) => {
                if (e.key.toLowerCase() === 's') {
                    this.snapToVertex = false;
                    this.snappedVertexNdc = null;
                }
            });

            // Canvas interactions
            this.canvas.addEventListener('pointerdown', (e) => {
                if (e.button === 2) return;

                if (this.colorMode) {
                    const rect = this.canvas.getBoundingClientRect();
                    const clientX = e.clientX - rect.left;
                    const clientY = e.clientY - rect.top;
                    this.isColoring = true;
                    this.colorVerticesInArea(clientX, clientY, this.selectedColor);
                    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { }
                    return;
                }

                this.addPointFromEvent(e);
                if (e.ctrlKey) {
                    this.isDrawing = true;
                    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { }
                }
            });

            this.canvas.addEventListener('pointermove', (e) => {
                const rect = this.canvas.getBoundingClientRect();
                const clientX = e.clientX - rect.left;
                const clientY = e.clientY - rect.top;

                const [ndcX, ndcY] = eventToNDC(e, this.canvas, this.snapToGrid, this.gridColumns);
                this.lastMouseNdc = [ndcX, ndcY];

                if (this.colorMode) {
                    this.lastColorPos = { x: clientX, y: clientY };
                    if (this.isColoring) {
                        this.colorVerticesInArea(clientX, clientY, this.selectedColor);
                    }
                    return;
                }

                if (this.snapToVertex) {
                    this.snappedVertexNdc = findNearestVertexNdc(ndcX, ndcY, this.layers, this.VERTEX_SNAP_RADIUS_NDC, this.currentLayerId);
                } else {
                    this.snappedVertexNdc = null;
                }

                if (!this.isDrawing || !e.ctrlKey) return;
                this.addPointFromEvent(e, true);
            });

            this.canvas.addEventListener('pointerup', (e) => {
                this.isDrawing = false;
                this.isColoring = false;
                try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { }
            });

            this.canvas.addEventListener('pointerenter', (e) => {
                if (this.colorMode) {
                    const rect = this.canvas.getBoundingClientRect();
                    this.lastColorPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
                }
            });

            this.canvas.addEventListener('pointerleave', (e) => {
                if (this.colorMode) {
                    this.lastColorPos = null;
                }
            });

            this.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (!this.colorMode) {
                    this.undoLast();
                }
            });
        }

        // Initialize display
        initializeDisplay() {
            this.loadDefault();
            this.updateLayerUI();
            this.updateTimeDisplay();
            this.selectedColor = VertexUtils.hexToRgb(this.uiElements.vertexColor?.value || '#ff0000');
            if (this.uiElements.gridSizeVal) this.uiElements.gridSizeVal.textContent = this.gridColumns + ' columns';
            if (this.uiElements.colorRadiusVal) this.uiElements.colorRadiusVal.textContent = this.colorAreaRadius + 'px';
            if (this.uiElements.bgOpacityVal) this.uiElements.bgOpacityVal.textContent = Math.round(this.backgroundOpacity * 100) + '%';
        }

        // Animation loop
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

            const overlayLoop = () => {
                this.drawOverlay();
                requestAnimationFrame(overlayLoop);
            };

            requestAnimationFrame(frame);
            requestAnimationFrame(overlayLoop);

            console.log('Vertex Editor initialized');
        }
    }

    // Export public API
    globalScope.VertexEditor = VertexEditor;

})(window);
