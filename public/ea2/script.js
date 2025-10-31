// Interactive WebGL drawing with multiple layers and custom shaders
(function () {
    'use strict';

    const clearColor = [0.98, 0.98, 1.0, 1.0];

    // Default shaders
    const DEFAULT_VS = `#version 300 es
in vec2 aPos;
in vec3 aColor;
out vec3 vColor;
void main(){
    gl_Position = vec4(aPos, 0.0, 1.0);
    vColor = aColor;
}`;

    const DEFAULT_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
in vec3 vColor;
out vec4 outColor;
void main(){
    outColor = vec4(mix(uColor.rgb, vColor, 0.5), uColor.a);
}`;

    const layerColors = [
        [0.1, 0.2, 0.7, 1.0],    // blue
        [0.9, 0.2, 0.1, 1.0],    // red
        [0.1, 0.7, 0.2, 1.0],    // green
        [0.9, 0.7, 0.1, 1.0],    // orange
        [0.7, 0.1, 0.7, 1.0],    // purple
        [0.1, 0.7, 0.7, 1.0],    // cyan
    ];

    // Animation state
    let isPlaying = false;
    let lastDrawTime = Date.now();
    let elapsedTime = 0; // Counts up when playing
    let uTime = 0; // Periodic time uniform
    let period = 30.0; // seconds


    // Layer system
    let layers = [];
    let currentLayerId = null;
    let nextLayerId = 1;
    let editingLayerId = null;

    // Background image
    let backgroundImage = null;
    let backgroundOpacity = 0.5;

    // Overlay visibility
    let showOverlay = false;

    // Grid snap functionality
    let snapToGrid = false;
    let gridSize = 20; // pixels

    // Color mode functionality
    let colorMode = false;
    let selectedColor = [1.0, 0.0, 0.0]; // Default red
    const VERTEX_SELECT_RADIUS = 10; // pixels
    let colorAreaRadius = 20; // pixels for area coloring
    let isColoring = false; // whether we're currently coloring (mouse down)
    let lastColorPos = null; // last mouse position during coloring

    // Drawing state
    let isDrawing = false;
    const MIN_DIST = 12; // minimum pixel distance between pushed points
    let lastPush = null; // last pushed point in client coordinates {x,y}
    let startTime = Date.now(); // for uTime uniform

    // Canvas and WebGL context
    const canvas = document.getElementById('background-canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) { console.error('WebGL2 not available'); return; }

    // UI elements
    const bgImageCanvas = document.getElementById('background-image-canvas');
    const bgImageCtx = bgImageCanvas.getContext('2d');
    const modeSelection = document.getElementById('mode');
    const lineWidthInp = document.getElementById('lineWidth');
    const lineWidthVal = document.getElementById('lineWidthVal');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const exportBtn = document.getElementById('export');
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefault');
    const overlay = document.getElementById('overlay-canvas');
    const overlayContext = overlay.getContext('2d');
    const vertexCountEl = document.getElementById('vertex-count');
    const bgImageInput = document.getElementById('bgImage');
    const bgOpacityInput = document.getElementById('bgOpacity');
    const bgOpacityVal = document.getElementById('bgOpacityVal');
    const clearBgImageBtn = document.getElementById('clearBgImage');
    const layersContainer = document.getElementById('layers-container');
    const addLayerBtn = document.getElementById('addLayer');
    const showOverlayCheckbox = document.getElementById('showOverlay');
    const snapToGridCheckbox = document.getElementById('snapToGrid');
    const gridSizeInput = document.getElementById('gridSize');
    const gridSizeVal = document.getElementById('gridSizeVal');
    const colorModeCheckbox = document.getElementById('colorMode');
    const vertexColorInput = document.getElementById('vertexColor');
    const colorRadiusInput = document.getElementById('colorRadius');
    const colorRadiusVal = document.getElementById('colorRadiusVal');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const resetTimeBtn = document.getElementById('resetTimeBtn');
    const timeSlider = document.getElementById('timeSlider');
    const timeVal = document.getElementById('timeVal');
    const periodInput = document.getElementById('periodInput');
    const shaderDrawer = document.getElementById('shaderDrawer');
    const shaderDrawerClose = document.getElementById('shaderDrawerClose');
    const shaderLayerName = document.getElementById('shaderLayerName');
    const vertexShaderText = document.getElementById('vertexShaderText');
    const fragmentShaderText = document.getElementById('fragmentShaderText');
    const shaderApplyBtn = document.getElementById('shaderApply');
    const shaderResetBtn = document.getElementById('shaderReset');
    const shaderCancelBtn = document.getElementById('shaderCancel');
    const shaderError = document.getElementById('shaderError');

    class Layer {
        constructor(id, name) {
            this.id = id;
            this.name = name;
            this.vertices = [];
            this.colors = []; // Per-vertex colors (RGB, 3 floats per vertex)
            this.visible = true;
            this.color = layerColors[(id - 1) % layerColors.length];
            this.vertexShader = DEFAULT_VS;
            this.fragmentShader = DEFAULT_FS;
            this.program = null;
            this.shaderError = null;
            this.mode = 'LINE_STRIP';
            this.lineWidth = 1;
        }
    }

    function createNewLayer() {
        const layer = new Layer(nextLayerId++, `Layer ${nextLayerId}`);
        layers.push(layer);
        if (!currentLayerId) currentLayerId = layer.id;
        return layer;
    }

    function getCurrentLayer() {
        return layers.find(l => l.id === currentLayerId) || layers[0];
    }

    function setCurrentLayer(layerId) {
        if (layers.find(l => l.id === layerId)) {
            currentLayerId = layerId;
            updateLayerUI();
        }
    }

    function deleteLayer(layerId) {
        const idx = layers.findIndex(l => l.id === layerId);
        if (idx !== -1) {
            layers.splice(idx, 1);
            if (currentLayerId === layerId) {
                currentLayerId = layers.length > 0 ? layers[0].id : null;
                if (layers.length === 0) createNewLayer();
            }
            updateLayerUI();
        }
    }

    // Shader compilation functions
    function createShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const err = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            return { shader: null, error: err };
        }
        return { shader: s, error: null };
    }

    function createLayerProgram(layer) {
        const vs = createShader(gl.VERTEX_SHADER, layer.vertexShader);
        const fs = createShader(gl.FRAGMENT_SHADER, layer.fragmentShader);

        if (vs.error || fs.error) {
            const msg = (vs.error || '') + '\n' + (fs.error || '');
            layer.shaderError = msg;
            return null;
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, vs.shader);
        gl.attachShader(prog, fs.shader);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const err = gl.getProgramInfoLog(prog);
            gl.deleteProgram(prog);
            layer.shaderError = err;
            return null;
        }

        // Clean up shaders after linking
        gl.deleteShader(vs.shader);
        gl.deleteShader(fs.shader);

        // Clear previous error
        layer.shaderError = null;
        return prog;
    }

    // Initialize layer programs
    function initLayerProgram(layer) {
        if (!layer.program) {
            layer.program = createLayerProgram(layer);
        }
        return layer.program;
    }

    function applyShaders() {
        if (!editingLayerId) return;
        const layer = layers.find(l => l.id === editingLayerId);
        if (!layer) return;

        layer.vertexShader = vertexShaderText.value;
        layer.fragmentShader = fragmentShaderText.value;
        layer.program = null; // Clear cached program so it gets recompiled

        // Try to compile
        const prog = createLayerProgram(layer);
        if (prog) {
            layer.program = prog;
            shaderError.textContent = 'Shaders applied successfully!';
            shaderError.style.color = '#00aa00';
        } else {
            shaderError.textContent = 'Shader error: ' + layer.shaderError;
            shaderError.style.color = '#ff0000';
        }
    }

    function resetShaders() {
        const layer = layers.find(l => l.id === editingLayerId);
        if (!layer) return;

        vertexShaderText.value = DEFAULT_VS;
        fragmentShaderText.value = DEFAULT_FS;
        shaderError.textContent = '';
    }

    function updateVertexCount() {
        const currentLayer = getCurrentLayer();
        vertexCountEl.textContent = `Vertices: ${currentLayer ? currentLayer.vertices.length / 2 : 0}`;
    }

    function updateLayerUI() {
        layersContainer.innerHTML = '';
        layers.forEach(layer => {
            const div = document.createElement('div');
            div.className = 'layer-item' + (layer.id === currentLayerId ? ' active' : '');
            div.innerHTML = `
                <input type="checkbox" ${layer.visible ? 'checked' : ''} title="Toggle visibility">
                <input type="text" value="${layer.name}" placeholder="Layer name">
                <button class="shader-btn" title="Edit shaders">✎ Shader</button>
                <button class="delete" title="Delete layer">✕</button>
            `;

            // Click to select layer
            div.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.type !== 'checkbox' && e.target.type !== 'text') {
                    setCurrentLayer(layer.id);
                }
            });

            // Visibility toggle
            const visCheckbox = div.querySelector('input[type="checkbox"]');
            visCheckbox.addEventListener('change', () => {
                layer.visible = visCheckbox.checked;
            });

            // Layer name edit
            const nameInput = div.querySelector('input[type="text"]');
            nameInput.addEventListener('change', () => {
                layer.name = nameInput.value || `Layer ${layer.id}`;
                updateLayerUI();
            });
            nameInput.addEventListener('click', (e) => {
                e.stopPropagation();
                setCurrentLayer(layer.id);
            });

            // Shader editor button
            const shaderBtn = div.querySelector('.shader-btn');
            shaderBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openShaderEditor(layer.id);
            });

            // Delete button
            const deleteBtn = div.querySelector('.delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (layers.length > 1) {
                    deleteLayer(layer.id);
                } else {
                    alert('Cannot delete the last layer');
                }
            });

            layersContainer.appendChild(div);
        });

        // Update current layer draw settings.
        const currentLayer = getCurrentLayer();
        if (currentLayer) {
            modeSelection.value = currentLayer.mode || 'LINE_STRIP';
            lineWidthInp.value = currentLayer.lineWidth;
            lineWidthVal.textContent = currentLayer.lineWidth;
        }
    }

    function openShaderEditor(layerId) {
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;

        editingLayerId = layerId;
        shaderLayerName.textContent = layer.name;
        vertexShaderText.value = layer.vertexShader;
        fragmentShaderText.value = layer.fragmentShader;
        shaderError.textContent = '';

        // Show drawer with animation
        shaderDrawer.classList.add('open');

        // Scroll canvas into view
        setTimeout(() => {
            canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    }

    function closeShaderEditor() {
        shaderDrawer.classList.remove('open');
        editingLayerId = null;
    }

    function resizeCanvasToDisplaySize() {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round(canvas.clientWidth * dpr);
        const height = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width; canvas.height = height; gl.viewport(0, 0, width, height);
        }
        // keep overlay in sync (use CSS pixels scaled by DPR)
        if (overlay) {
            overlay.width = Math.round(canvas.clientWidth * dpr);
            overlay.height = Math.round(canvas.clientHeight * dpr);
            // draw in CSS pixel coordinates by scaling context
            overlayContext.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        // keep background image canvas in sync
        if (bgImageCanvas) {
            bgImageCanvas.width = Math.round(canvas.clientWidth * dpr);
            bgImageCanvas.height = Math.round(canvas.clientHeight * dpr);
            bgImageCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawBackgroundImage();
        }
    }

    // Convert mouse event to NDC coordinates
    function eventToNDC(e) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;

        // Apply grid snapping if enabled
        if (snapToGrid) {
            const pixelX = x * rect.width;
            const pixelY = y * rect.height;
            const snappedPixelX = Math.round(pixelX / gridSize) * gridSize;
            const snappedPixelY = Math.round(pixelY / gridSize) * gridSize;
            x = snappedPixelX / rect.width;
            y = snappedPixelY / rect.height;
        }

        // NDC -1..1
        const ndcX = x * 2 - 1;
        const ndcY = (1 - y) * 2 - 1;
        return [ndcX, ndcY];
    }

    // Convert NDC to client coordinates
    function ndcToClient(ndx, ndy) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + (ndx * 0.5 + 0.5) * rect.width;
        const cy = rect.top + (1 - (ndy * 0.5 + 0.5)) * rect.height;
        return { x: cx, y: cy };
    }

    // Convert NDC to pixel coordinates in overlay
    function ndcToPixel(x, y) {
        const rect = canvas.getBoundingClientRect();
        const px = (x * 0.5 + 0.5) * rect.width;
        const py = (1 - (y * 0.5 + 0.5)) * rect.height;
        return [px, py];
    }

    // Background image handling
    function drawBackgroundImage() {
        if (!backgroundImage) {
            bgImageCtx.clearRect(0, 0, bgImageCanvas.clientWidth, bgImageCanvas.clientHeight);
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        bgImageCtx.clearRect(0, 0, bgImageCanvas.width / dpr, bgImageCanvas.height / dpr);
        bgImageCtx.globalAlpha = backgroundOpacity;
        bgImageCtx.drawImage(backgroundImage, 0, 0, bgImageCanvas.clientWidth, bgImageCanvas.clientHeight);
        bgImageCtx.globalAlpha = 1.0;
    }

    function loadBackgroundImage(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                backgroundImage = img;
                drawBackgroundImage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function clearBackgroundImage() {
        backgroundImage = null;
        bgImageCtx.clearRect(0, 0, bgImageCanvas.clientWidth, bgImageCanvas.clientHeight);
    }

    // Check if point is far enough from last pushed point
    function isPointFarEnoughFromClient(clientX, clientY) {
        if (lastPush === null) return true;

        const dx = clientX - lastPush.x;
        const dy = clientY - lastPush.y;
        return ((dx * dx + dy * dy) > (MIN_DIST * MIN_DIST));
    }

    // Push point to current layer's vertices array and update lastPush
    function pushPoint(clientX, clientY, ndcX, ndcY) {
        const currentLayer = getCurrentLayer();
        if (!currentLayer) return false;
        currentLayer.vertices.push(ndcX, ndcY);
        // Use selected color if in color mode, otherwise layer default color
        currentLayer.colors.push(selectedColor[0], selectedColor[1], selectedColor[2]);
        lastPush = { x: clientX, y: clientY };
        updateVertexCount();
        return true;
    }

    // Add point from event, optionally only if far enough from last point
    function addPointFromEvent(e, onlyIfFarEnough = false) {
        const clientX = e.clientX;
        const clientY = e.clientY;
        const [ndx, ndy] = eventToNDC(e);
        // If onlyIfFarEnough is true, check distance from last pushed point
        // else always push
        if (!onlyIfFarEnough || isPointFarEnoughFromClient(clientX, clientY)) {
            return pushPoint(clientX, clientY, ndx, ndy);
        } else {
            return false;
        }
    }

    // Color mode functions
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [1, 0, 0];
    }

    function findNearestVertex(clientX, clientY) {
        const currentLayer = getCurrentLayer();
        if (!currentLayer || currentLayer.vertices.length === 0) return -1;

        let nearestIndex = -1;
        let nearestDistance = Infinity;

        for (let i = 0; i < currentLayer.vertices.length; i += 2) {
            const ndcX = currentLayer.vertices[i];
            const ndcY = currentLayer.vertices[i + 1];
            const [px, py] = ndcToPixel(ndcX, ndcY);

            const dx = clientX - px;
            const dy = clientY - py;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < VERTEX_SELECT_RADIUS && distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i / 2; // vertex index (not array index)
            }
        }

        return nearestIndex;
    }

    function findVerticesInArea(clientX, clientY, radius) {
        const currentLayer = getCurrentLayer();
        if (!currentLayer || currentLayer.vertices.length === 0) return [];

        const verticesInArea = [];

        for (let i = 0; i < currentLayer.vertices.length; i += 2) {
            const ndcX = currentLayer.vertices[i];
            const ndcY = currentLayer.vertices[i + 1];
            const [px, py] = ndcToPixel(ndcX, ndcY);

            const dx = clientX - px;
            const dy = clientY - py;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance <= radius) {
                verticesInArea.push(i / 2); // vertex index
            }
        }

        return verticesInArea;
    }

    function colorVerticesInArea(clientX, clientY, color) {
        const vertexIndices = findVerticesInArea(clientX, clientY, colorAreaRadius);
        vertexIndices.forEach(vertexIndex => {
            assignColorToVertex(vertexIndex, color);
        });
        return vertexIndices.length > 0;
    }

    function assignColorToVertex(vertexIndex, color) {
        const currentLayer = getCurrentLayer();
        if (!currentLayer || vertexIndex < 0 || vertexIndex >= currentLayer.vertices.length / 2) return;

        const colorIndex = vertexIndex * 3;
        currentLayer.colors[colorIndex] = color[0];
        currentLayer.colors[colorIndex + 1] = color[1];
        currentLayer.colors[colorIndex + 2] = color[2];
    }

    // Undo / clear functions
    function setLastPushFromLastVertex() {
        const currentLayer = getCurrentLayer();
        if (!currentLayer) return;
        if (currentLayer.vertices.length >= 2) {
            const nx = currentLayer.vertices[currentLayer.vertices.length - 2], ny = currentLayer.vertices[currentLayer.vertices.length - 1];
            const c = ndcToClient(nx, ny);
            lastPush = { x: c.x, y: c.y };
        } else {
            lastPush = null;
        }
    }

    // Undo last point (removes last two entries in current layer's vertices)
    function undoLast() {
        const currentLayer = getCurrentLayer();
        if (!currentLayer) return;
        if (currentLayer.vertices.length >= 2) {
            currentLayer.vertices.splice(-2, 2);
            currentLayer.colors.splice(-3, 3); // Remove last 3 color values (RGB)
            updateVertexCount();
            setLastPushFromLastVertex();
        }
    }

    // Clear all vertices in current layer
    function clearAll() {
        const currentLayer = getCurrentLayer();
        if (!currentLayer) return;
        currentLayer.vertices.length = 0;
        currentLayer.colors.length = 0;
        updateVertexCount();
        lastPush = null;
    }

    // Export vertices as extended JSON file with all layers: { layers: [{name, mode, lineWidth, vertices: [[x,y],...]},...] }
    function exportVerticesJSON() {
        const layersData = layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            vertices: layer.vertices.length > 0
                ? Array.from({ length: layer.vertices.length / 2 }, (_, i) => [layer.vertices[i * 2], layer.vertices[i * 2 + 1]])
                : [],
            colors: layer.colors.length > 0
                ? Array.from({ length: layer.colors.length / 3 }, (_, i) => [layer.colors[i * 3], layer.colors[i * 3 + 1], layer.colors[i * 3 + 2]])
                : [],
            vertexShader: layer.vertexShader,
            fragmentShader: layer.fragmentShader,
            mode: layer.mode,
            lineWidth: Number(layer.lineWidth) || 1,
        }));
        const out = {
            layers: layersData,
            period: period
        };
        const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'vertices.json'; a.click(); URL.revokeObjectURL(url);
    }

    // Load defaultVertices.json from server
    function loadDefault() {
        fetch('defaultVertices.json').then(r => {
            if (!r.ok) throw new Error('not found');
            return r.text();
        }).then(txt => { loadFileContent('defaultVertices.json', txt); }).catch(() => console.log('defaultVertices.json not loaded (missing) — you can press "Load default" or import a file.'));
    }

    // Load file content. Supports multiple formats:
    // - legacy: array of [x,y] (loaded into current layer)
    // - extended v1: { vertices: [[x,y],...], mode: 'TRIANGLE_STRIP', lineWidth: 2 }
    // - extended v2: { layers: [{name, vertices: [[x,y],...], mode, lineWidth}, ...] }
    function loadFileContent(name, txt) {
        try {
            const parsed = JSON.parse(txt);

            // Old one layer format no longer supported
            if (!parsed || !Array.isArray(parsed.layers)) {
                console.warn('Invalid multi-layer format in', name);
                return;
            }

            layers = [];
            nextLayerId = 1;
            currentLayerId = null;

            parsed.layers.forEach((layerData) => {
                const layer = new Layer(nextLayerId++, layerData.name || `Layer ${nextLayerId}`);
                if (Array.isArray(layerData.vertices)) {
                    layerData.vertices.forEach(p => {
                        layer.vertices.push(p[0], p[1]);
                    });
                }
                if (Array.isArray(layerData.colors)) {
                    layerData.colors.forEach(c => {
                        layer.colors.push(c[0], c[1], c[2]);
                    });
                } else {
                    // Initialize with default colors if none saved
                    for (let i = 0; i < layer.vertices.length / 2; i++) {
                        layer.colors.push(layer.color[0], layer.color[1], layer.color[2]);
                    }
                }
                // Restore shaders if they exist
                if (layerData.vertexShader) {
                    layer.vertexShader = layerData.vertexShader;
                }
                if (layerData.fragmentShader) {
                    layer.fragmentShader = layerData.fragmentShader;
                }
                if (layerData.mode) {
                    layer.mode = layerData.mode;
                }
                if (layerData.lineWidth) {
                    layer.lineWidth = layerData.lineWidth;
                }
                layers.push(layer);
            });

            // Set last layer current
            currentLayerId = layers.length > 0 ? layers[layers.length - 1].id : null;
            const currentLayer = getCurrentLayer();

            // Load period if it exists in the file
            if (parsed.period && typeof parsed.period === 'number' && parsed.period > 0) {
                period = parsed.period;
                periodInput.value = period;
            }

            modeSelection.value = currentLayer.mode || 'LINE_STRIP';
            lineWidthInp.value = currentLayer.lineWidth;
            lineWidthVal.textContent = currentLayer.lineWidth;
            updateLayerUI();
            updateVertexCount();
            updateTimeDisplay(); // Update time display to reflect new period
            console.log('Loaded multi-layer JSON, layers:', layers.length, 'period:', period);
        } catch (err) {
            console.warn('Failed to parse JSON', err);
        }
    }

    // Draw function - renders all visible layers
    function draw() {
        resizeCanvasToDisplaySize();
        gl.clearColor(...clearColor); gl.clear(gl.COLOR_BUFFER_BIT);
        // Update current elapsed time
        if (isPlaying) {
            elapsedTime = elapsedTime + (Date.now() - lastDrawTime) / 1000;
        }
        lastDrawTime = Date.now();

        uTime = elapsedTime % period; // Reset every period seconds to avoid performance issues
        updateTimeDisplay();

        // Draw all visible layers
        layers.forEach(layer => {
            if (!layer.visible || layer.vertices.length < 2) return;

            // Initialize or get layer program
            let prog = initLayerProgram(layer);
            if (!prog) {
                // Fall back to default program if shader compilation fails
                prog = defaultProg;
            }

            gl.useProgram(prog);

            // Get attribute locations from this program
            const aPosLoc = gl.getAttribLocation(prog, 'aPos');
            const aColorLoc = gl.getAttribLocation(prog, 'aColor');

            if (aPosLoc >= 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                const vertArray = new Float32Array(layer.vertices);
                gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.DYNAMIC_DRAW);

                gl.enableVertexAttribArray(aPosLoc);
                gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
            }

            if (aColorLoc >= 0 && layer.colors.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
                const colorArray = new Float32Array(layer.colors);
                gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.DYNAMIC_DRAW);

                gl.enableVertexAttribArray(aColorLoc);
                gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);
            }

            // Set color uniform if it exists
            const uColorLoc = gl.getUniformLocation(prog, 'uColor');
            if (uColorLoc !== -1) {
                gl.uniform4fv(uColorLoc, layer.color);
            }

            // Set time uniform if it exists
            const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
            if (uTimeLoc !== -1) {
                gl.uniform1f(uTimeLoc, uTime);
            }

            // Set period uniform if it exists
            const uPeriodLoc = gl.getUniformLocation(prog, 'uPeriod');
            if (uPeriodLoc !== -1) {
                gl.uniform1f(uPeriodLoc, period);
            }

            // Set canvas resolution uniform if it exists
            const uResolutionLoc = gl.getUniformLocation(prog, 'uResolution');
            if (uResolutionLoc !== -1) {
                gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
            }

            // Set line width
            const lw = Number(layer.lineWidth) || 1; try { gl.lineWidth(lw); } catch (e) { /* ignore */ }

            // Determine draw mode
            const modeVal = layer.mode;
            let mode = gl.LINE_STRIP;
            if (modeVal === 'LINES') mode = gl.LINES;
            else if (modeVal === 'LINE_LOOP') mode = gl.LINE_LOOP;
            else if (modeVal === 'TRIANGLES') mode = gl.TRIANGLES;
            else if (modeVal === 'TRIANGLE_STRIP') mode = gl.TRIANGLE_STRIP;
            else if (modeVal === 'TRIANGLE_FAN') mode = gl.TRIANGLE_FAN;

            const vertexCount = layer.vertices.length / 2;
            gl.drawArrays(mode, 0, vertexCount);
        });
    }

    // Show markers on overlay canvas (pixel coords) for current layer only
    function drawOverlay() {
        // overlay sized and scaled in resizeCanvasToDisplaySize; drawing here uses CSS pixels because context is scaled for DPR
        const dpr = window.devicePixelRatio || 1;
        overlayContext.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);

        // Draw grid if snap to grid is enabled
        if (snapToGrid) {
            const rect = canvas.getBoundingClientRect();
            overlayContext.strokeStyle = 'rgba(150, 150, 150, 0.3)';
            overlayContext.lineWidth = 1;
            overlayContext.setLineDash([1, 1]); // Fine dashed lines

            // Draw vertical grid lines
            for (let x = 0; x <= rect.width; x += gridSize) {
                overlayContext.beginPath();
                overlayContext.moveTo(x, 0);
                overlayContext.lineTo(x, rect.height);
                overlayContext.stroke();
            }

            // Draw horizontal grid lines
            for (let y = 0; y <= rect.height; y += gridSize) {
                overlayContext.beginPath();
                overlayContext.moveTo(0, y);
                overlayContext.lineTo(rect.width, y);
                overlayContext.stroke();
            }

            overlayContext.setLineDash([]); // Reset line dash
        }

        // Draw color brush area if in color mode and mouse is over canvas
        if (colorMode && lastColorPos) {
            overlayContext.strokeStyle = `rgb(${Math.round(selectedColor[0] * 255)}, ${Math.round(selectedColor[1] * 255)}, ${Math.round(selectedColor[2] * 255)})`;
            overlayContext.lineWidth = 2;
            overlayContext.setLineDash([3, 3]);
            overlayContext.beginPath();
            overlayContext.arc(lastColorPos.x, lastColorPos.y, colorAreaRadius, 0, Math.PI * 2);
            overlayContext.stroke();
            overlayContext.setLineDash([]);
        }

        // Only draw overlay if enabled
        if (!showOverlay) return;

        overlayContext.font = '12px sans-serif';

        const currentLayer = getCurrentLayer();
        if (!currentLayer || !currentLayer.visible) return;

        for (let i = 0; i < currentLayer.vertices.length; i += 2) {
            const ndx = currentLayer.vertices[i], ndy = currentLayer.vertices[i + 1];
            const [px, py] = ndcToPixel(ndx, ndy);
            let color = 'rgba(54, 71, 148, 0.68)';
            if (i === 0) color = '#24d64aff'; // first point = green
            else if (i === currentLayer.vertices.length - 2) color = '#f11f1fff'; // last point = red

            // Highlight vertices in color area
            if (colorMode && lastColorPos) {
                const dx = lastColorPos.x - px;
                const dy = lastColorPos.y - py;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance <= colorAreaRadius) {
                    color = `rgb(${Math.round(selectedColor[0] * 255)}, ${Math.round(selectedColor[1] * 255)}, ${Math.round(selectedColor[2] * 255)})`;
                }
            }

            overlayContext.beginPath();
            overlayContext.fillStyle = color;
            overlayContext.arc(px, py, 2, 0, Math.PI * 2);
            overlayContext.fill();
        }
    }

    // Default Animation loop.
    function frame() {
        draw();
        requestAnimationFrame(frame);
    }
    // Overlay animation loop.
    function overlayLoop() {
        drawOverlay();
        requestAnimationFrame(overlayLoop);
    }

    // GPU buffer
    let vbo = gl.createBuffer();
    let colorBuffer = gl.createBuffer();

    // Initialize with one default layer
    createNewLayer();
    updateLayerUI();

    // Initialize default program for fallback
    const defaultVS = createShader(gl.VERTEX_SHADER, DEFAULT_VS);
    const defaultFS = createShader(gl.FRAGMENT_SHADER, DEFAULT_FS);
    const defaultProg = gl.createProgram();
    if (defaultVS.shader && defaultFS.shader) {
        gl.attachShader(defaultProg, defaultVS.shader);
        gl.attachShader(defaultProg, defaultFS.shader);
        gl.linkProgram(defaultProg);
        if (!gl.getProgramParameter(defaultProg, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(defaultProg));
    }

    // Animation control functions
    function togglePlayPause() {
        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying ? '⏸️ Pause' : '▶️ Play';
    }

    function resetTime() {
        elapsedTime = 0;
        updateTimeDisplay();
    }

    function updateTimeDisplay() {
        timeVal.textContent = uTime.toFixed(2) + 's';
        // Update slider position (0-100% of period)
        const sliderValue = (uTime / period) * 100;
        timeSlider.value = sliderValue;
    }

    function setTimeFromSlider() {
        const sliderPercent = Number(timeSlider.value) / 100;
        elapsedTime = sliderPercent * period;
        uTime = elapsedTime % period;
        updateTimeDisplay();
    }

    function setPeriod() {
        const newPeriod = Number(periodInput.value);
        if (newPeriod > 0) {
            period = newPeriod;
            // Update slider max to reflect new period
            updateTimeDisplay();
        }
    }

    // Init Event listeners.
    lineWidthInp.addEventListener('input', () => {
        lineWidthVal.textContent = lineWidthInp.value;
        const currentLayer = getCurrentLayer();
        if (currentLayer) {
            currentLayer.lineWidth = Number(lineWidthInp.value);
        }
    });

    modeSelection.addEventListener('change', () => {
        const currentLayer = getCurrentLayer();
        if (currentLayer) {
            currentLayer.mode = modeSelection.value;
        }
    });

    // Initialize grid size display
    gridSizeVal.textContent = gridSizeInput.value;

    // Initialize animation controls
    periodInput.value = period;
    updateTimeDisplay();

    // Initialize color mode
    selectedColor = hexToRgb(vertexColorInput.value);
    colorRadiusVal.textContent = colorRadiusInput.value + 'px';

    // Background image controls
    bgImageInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) loadBackgroundImage(file);
        bgImageInput.value = '';
    });

    clearBgImageBtn.addEventListener('click', clearBackgroundImage);

    bgOpacityInput.addEventListener('input', () => {
        backgroundOpacity = Number(bgOpacityInput.value) / 100;
        bgOpacityVal.textContent = bgOpacityInput.value + '%';
        drawBackgroundImage();
    });

    // Overlay toggle
    showOverlayCheckbox.addEventListener('change', () => {
        showOverlay = showOverlayCheckbox.checked;
    });

    // Grid snap controls
    snapToGridCheckbox.addEventListener('change', () => {
        snapToGrid = snapToGridCheckbox.checked;
    });

    gridSizeInput.addEventListener('input', () => {
        gridSize = Number(gridSizeInput.value);
        gridSizeVal.textContent = gridSizeInput.value;
    });

    // Color mode controls
    colorModeCheckbox.addEventListener('change', () => {
        colorMode = colorModeCheckbox.checked;
        if (!colorMode) {
            lastColorPos = null; // Hide cursor when exiting color mode
        }
    });

    vertexColorInput.addEventListener('change', () => {
        selectedColor = hexToRgb(vertexColorInput.value);
    });

    colorRadiusInput.addEventListener('input', () => {
        colorAreaRadius = Number(colorRadiusInput.value);
        colorRadiusVal.textContent = colorRadiusInput.value + 'px';
    });

    // Animation controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    resetTimeBtn.addEventListener('click', resetTime);
    timeSlider.addEventListener('input', setTimeFromSlider);
    periodInput.addEventListener('change', setPeriod);

    // Shader editor drawer
    shaderDrawerClose.addEventListener('click', closeShaderEditor);
    shaderCancelBtn.addEventListener('click', closeShaderEditor);
    shaderApplyBtn.addEventListener('click', applyShaders);
    shaderResetBtn.addEventListener('click', resetShaders);

    // Layer management
    addLayerBtn.addEventListener('click', () => {
        const newLayer = createNewLayer();
        setCurrentLayer(newLayer.id);
        updateLayerUI();
        lastPush = null;
    });

    // pointerdown to add point, if ctrl is held start pointer capture for continuous drawing
    canvas.addEventListener('pointerdown', (e) => {
        if (e.button === 2) return; // ignore right-click

        // Handle color mode
        if (colorMode) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;

            isColoring = true;
            colorVerticesInArea(clientX, clientY, selectedColor);
            try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
            return; // Don't add new vertex in color mode
        }

        // Normal drawing mode
        // always add a single point on pointerdown
        addPointFromEvent(e);
        // if Ctrl is held, enable continuous drawing while dragging
        if (e.ctrlKey) {
            isDrawing = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
        }
    });

    // continuous drawing on pointermove if isDrawing is true
    canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        // Update cursor position for color mode
        if (colorMode) {
            lastColorPos = { x: clientX, y: clientY };

            // Continue coloring if mouse is down
            if (isColoring) {
                colorVerticesInArea(clientX, clientY, selectedColor);
            }
            return;
        }

        // Normal drawing mode
        // continuous adding only if drawing mode is on AND Ctrl remains pressed
        if (!isDrawing || !e.ctrlKey) return;
        addPointFromEvent(e, true);
    });

    // stop drawing on pointerup
    canvas.addEventListener('pointerup', (e) => {
        isDrawing = false;
        isColoring = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    });

    // Show/hide color cursor when entering/leaving canvas
    canvas.addEventListener('pointerenter', (e) => {
        if (colorMode) {
            const rect = canvas.getBoundingClientRect();
            lastColorPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }
    });

    canvas.addEventListener('pointerleave', (e) => {
        if (colorMode) {
            lastColorPos = null;
        }
    });
    // right-click or contextmenu to undo last point
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (!colorMode) { // Only undo in drawing mode
            undoLast();
        }
    });

    undoBtn.addEventListener('click', undoLast);
    clearBtn.addEventListener('click', clearAll);
    exportBtn.addEventListener('click', exportVerticesJSON);

    // File import (supports .json vertex array)
    fileInput.addEventListener('change', (ev) => {
        const f = ev.target.files && ev.target.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = (e) => { try { loadFileContent(f.name, e.target.result); } catch (err) { console.error(err); } };
        reader.readAsText(f);

        // reset input
        fileInput.value = '';
    });

    // Load default file button
    loadDefaultBtn.addEventListener('click', loadDefault);

    // attempt to load defaultVertices.json on startup
    loadDefault();

    // start animation loops
    requestAnimationFrame(frame);
    requestAnimationFrame(overlayLoop);

    console.log('Ready for drawing.');
})();
