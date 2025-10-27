// Interactive WebGL drawing with multiple layers and custom shaders
(function () {
    'use strict';

    const clearColor = [0.98, 0.98, 1.0, 1.0];

    // Default shaders
    const DEFAULT_VS = `#version 300 es
in vec2 aPos;
void main(){
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    const DEFAULT_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main(){
    outColor = uColor;
}`;

    const layerColors = [
        [0.1, 0.2, 0.7, 1.0],    // blue
        [0.9, 0.2, 0.1, 1.0],    // red
        [0.1, 0.7, 0.2, 1.0],    // green
        [0.9, 0.7, 0.1, 1.0],    // orange
        [0.7, 0.1, 0.7, 1.0],    // purple
        [0.1, 0.7, 0.7, 1.0],    // cyan
    ];

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
            this.visible = true;
            this.color = layerColors[(id - 1) % layerColors.length];
            this.vertexShader = DEFAULT_VS;
            this.fragmentShader = DEFAULT_FS;
            this.program = null;
            this.shaderError = null;
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
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
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
            updateVertexCount();
            setLastPushFromLastVertex();
        }
    }

    // Clear all vertices in current layer
    function clearAll() {
        const currentLayer = getCurrentLayer();
        if (!currentLayer) return;
        currentLayer.vertices.length = 0;
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
            vertexShader: layer.vertexShader,
            fragmentShader: layer.fragmentShader,
            mode: modeSelection.value,
            lineWidth: Number(lineWidthInp.value)
        }));
        const out = { layers: layersData };
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

            // New multi-layer format
            if (parsed && Array.isArray(parsed.layers)) {
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
                    // Restore shaders if they exist
                    if (layerData.vertexShader) {
                        layer.vertexShader = layerData.vertexShader;
                    }
                    if (layerData.fragmentShader) {
                        layer.fragmentShader = layerData.fragmentShader;
                    }
                    layers.push(layer);
                    currentLayerId = layer.id;
                });

                if (parsed.layers.length > 0 && parsed.layers[0].mode) {
                    try { modeSelection.value = parsed.layers[0].mode; } catch (e) { }
                }
                if (parsed.layers.length > 0 && parsed.layers[0].lineWidth) {
                    lineWidthInp.value = parsed.layers[0].lineWidth;
                    lineWidthVal.textContent = parsed.layers[0].lineWidth;
                }

                updateLayerUI();
                updateVertexCount();
                console.log('Loaded multi-layer JSON, layers:', layers.length);
                return;
            }

            // Old single-layer formats
            let arr = null;
            if (Array.isArray(parsed)) {
                arr = parsed;
            } else if (parsed && Array.isArray(parsed.vertices)) {
                arr = parsed.vertices;
                if (parsed.mode) {
                    try { modeSelection.value = parsed.mode; } catch (e) { }
                }
                if (parsed.lineWidth) {
                    lineWidthInp.value = parsed.lineWidth; lineWidthVal.textContent = parsed.lineWidth;
                }
            }

            if (arr) {
                const currentLayer = getCurrentLayer();
                if (!currentLayer) return;
                currentLayer.vertices.length = 0;
                arr.forEach((p) => { currentLayer.vertices.push(p[0], p[1]); });
                updateVertexCount();
                setLastPushFromLastVertex();
                console.log('Loaded single-layer JSON vertices, count:', currentLayer.vertices.length / 2);
                return;
            }
        } catch (err) {
            console.warn('Failed to parse JSON', err);
        }

        console.warn('Unknown or unsupported file type for', name);
    }

    // Draw function - renders all visible layers
    function draw() {
        resizeCanvasToDisplaySize();
        gl.clearColor(...clearColor); gl.clear(gl.COLOR_BUFFER_BIT);

        // Calculate time in seconds since start
        const rawTime = (Date.now() - startTime) / 1000;
        const elapsedTime = rawTime % 60.0; // Reset every 60 seconds to avoid performance issues

        // Set line width
        const lw = Number(lineWidthInp.value) || 1; try { gl.lineWidth(lw); } catch (e) { /* ignore */ }

        // determine draw mode
        const modeVal = modeSelection.value;
        let mode = gl.LINE_STRIP;
        if (modeVal === 'LINES') mode = gl.LINES;
        else if (modeVal === 'LINE_LOOP') mode = gl.LINE_LOOP;
        else if (modeVal === 'TRIANGLES') mode = gl.TRIANGLES;
        else if (modeVal === 'TRIANGLE_STRIP') mode = gl.TRIANGLE_STRIP;
        else if (modeVal === 'TRIANGLE_FAN') mode = gl.TRIANGLE_FAN;

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

            // Get attribute location from this program
            const aPosLoc = gl.getAttribLocation(prog, 'aPos');
            if (aPosLoc >= 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                const vertArray = new Float32Array(layer.vertices);
                gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.DYNAMIC_DRAW);

                gl.enableVertexAttribArray(aPosLoc);
                gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
            }

            // Set color uniform if it exists
            const uColorLoc = gl.getUniformLocation(prog, 'uColor');
            if (uColorLoc !== -1) {
                gl.uniform4fv(uColorLoc, layer.color);
            }

            // Set time uniform if it exists
            const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
            if (uTimeLoc !== -1) {
                gl.uniform1f(uTimeLoc, elapsedTime);
            }

            // Set canvas resolution uniform if it exists
            const uResolutionLoc = gl.getUniformLocation(prog, 'uResolution');
            if (uResolutionLoc !== -1) {
                gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
            }

            const vertexCount = layer.vertices.length / 2;
            gl.drawArrays(mode, 0, vertexCount);
        });
    }

    // Show markers on overlay canvas (pixel coords) for current layer only
    function drawOverlay() {
        // overlay sized and scaled in resizeCanvasToDisplaySize; drawing here uses CSS pixels because context is scaled for DPR
        const dpr = window.devicePixelRatio || 1;
        overlayContext.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);

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
            overlayContext.beginPath(); overlayContext.fillStyle = color; overlayContext.arc(px, py, 2, 0, Math.PI * 2); overlayContext.fill();
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

    // Init Event listeners.
    lineWidthInp.addEventListener('input', () => { lineWidthVal.textContent = lineWidthInp.value; });

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
        // always add a single point on pointerdown
        addPointFromEvent(e);
        // if Ctrl is held, enable continuous drawing while dragging
        if (e.ctrlKey) {
            isDrawing = true; try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
        }
    });

    // continuous drawing on pointermove if isDrawing is true
    canvas.addEventListener('pointermove', (e) => {
        // continuous adding only if drawing mode is on AND Ctrl remains pressed
        if (!isDrawing || !e.ctrlKey) return;
        addPointFromEvent(e, true);
    });

    // stop drawing on pointerup
    canvas.addEventListener('pointerup', (e) => { isDrawing = false; try { canvas.releasePointerCapture(e.pointerId); } catch (err) { } });
    // right-click or contextmenu to undo last point
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); undoLast(); });

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
