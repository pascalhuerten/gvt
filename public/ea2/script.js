// Interactive WebGL drawing
(function () {
    'use strict';

    const drawColor = [0.1, 0.2, 0.7, 1.0];
    const clearColor = [0.98, 0.98, 1.0, 1.0];

    // Fattened list of vertices (x,y) in NDC (-1..1) NDC = Normalized Device Coordinates
    const vertices = [];

    // Drawing state
    let isDrawing = false;
    const MIN_DIST = 12; // minimum pixel distance between pushed points
    let lastPush = null; // last pushed point in client coordinates {x,y}

    // Shaders (simple pass-through for 2D positions)
    const vsSrc = `#version 300 es
    in vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
    `;
    const fsSrc = `#version 300 es
    precision mediump float; uniform vec4 uColor; out vec4 outColor; void main(){ outColor = uColor; }
    `;

    // UI elements
    const canvas = document.getElementById('background-canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) { console.error('WebGL2 not available'); return; }
    const modeSelection = document.getElementById('mode');
    const lineWidthInp = document.getElementById('lineWidth');
    const lineWidthVal = document.getElementById('lineWidthVal');
    const undoBtn = document.getElementById('undo');
    const clearBtn = document.getElementById('clear');
    const exportBtn = document.getElementById('export');
    const fileInput = document.getElementById('fileInput');
    const loadDefaultBtn = document.getElementById('loadDefault');
    const overlay = document.getElementById('overlay-canvas');
    const overlayContenxt = overlay.getContext('2d');
    const vertexCountEl = document.getElementById('vertex-count');

    const vs = createShader(gl.VERTEX_SHADER, vsSrc);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));

    const aPosLoc = gl.getAttribLocation(prog, 'aPos');
    const uColorLoc = gl.getUniformLocation(prog, 'uColor');

    // GPU buffer
    let vbo = gl.createBuffer();

    function updateVertexCount() { vertexCountEl.textContent = `Vertices: ${vertices.length / 2}`; }

    function createShader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; } return s; }

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
            overlayContenxt.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // Check if point is far enough from last pushed point
    function isPointFarEnoughFromClient(clientX, clientY) {
        if (lastPush === null) return true;

        const dx = clientX - lastPush.x;
        const dy = clientY - lastPush.y;
        return ((dx * dx + dy * dy) > (MIN_DIST * MIN_DIST));
    }

    // Push point to vertices array and update lastPush
    function pushPoint(clientX, clientY, ndcX, ndcY) {
        vertices.push(ndcX, ndcY);
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

    // Undo / clear / export
    function setLastPushFromLastVertex() {
        if (vertices.length >= 2) {
            const nx = vertices[vertices.length - 2], ny = vertices[vertices.length - 1];
            const c = ndcToClient(nx, ny);
            lastPush = { x: c.x, y: c.y };
        } else {
            lastPush = null;
        }
    }

    // Undo last point (removes last two entries in vertices)
    function undoLast() { if (vertices.length >= 2) { vertices.splice(-2, 2); updateVertexCount(); setLastPushFromLastVertex(); } }

    // Clear all vertices
    function clearAll() { vertices.length = 0; updateVertexCount(); lastPush = null; }

    // Export vertices as extended JSON file: { vertices: [[x,y],...], mode: '...', lineWidth: n }
    function exportVerticesJSON() {
        const arr = [];
        for (let i = 0; i < vertices.length; i += 2) arr.push([vertices[i], vertices[i + 1]]);
        const out = { vertices: arr, mode: modeSelection.value, lineWidth: Number(lineWidthInp.value) };
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

    // Load file content based on extension. Supports JSON in two forms:
    // - legacy: array of [x,y]
    // - extended: { vertices: [[x,y],...], mode: 'TRIANGLE_STRIP', lineWidth: 2 }
    function loadFileContent(name, txt) {
        try {
            const parsed = JSON.parse(txt);
            let arr = null;
            if (Array.isArray(parsed)) {
                arr = parsed;
            } else if (parsed && Array.isArray(parsed.vertices)) {
                arr = parsed.vertices;
                if (parsed.mode) {
                    // attempt to set the UI draw mode if valid
                    try { modeSelection.value = parsed.mode; } catch (e) { }
                }
                if (parsed.lineWidth) {
                    lineWidthInp.value = parsed.lineWidth; lineWidthVal.textContent = parsed.lineWidth;
                }
            }

            if (arr) {
                vertices.length = 0;
                arr.forEach((p) => { vertices.push(p[0], p[1]); });
                updateVertexCount();
                setLastPushFromLastVertex();
                console.log('Loaded JSON vertices, count:', vertices.length / 2);
                return;
            }
        } catch (err) {
            console.warn('Failed to parse JSON', err);
        }

        console.warn('Unknown or unsupported file type for', name);
    }

    // Draw function
    function draw() {
        resizeCanvasToDisplaySize();
        gl.clearColor(...clearColor); gl.clear(gl.COLOR_BUFFER_BIT);

        // Require at least two vertices to draw
        if (vertices.length < 2) return;

        // Upload vertices to GPU
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        const vertArray = new Float32Array(vertices);
        gl.bufferData(gl.ARRAY_BUFFER, vertArray, gl.DYNAMIC_DRAW);

        gl.useProgram(prog);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        gl.uniform4fv(uColorLoc, drawColor);

        // Set line width
        const lw = Number(lineWidthInp.value) || 1; try { gl.lineWidth(lw); } catch (e) { /* ignore */ }

        // determine draw mode and vertices count
        const modeVal = modeSelection.value;
        let mode = gl.LINE_STRIP;
        if (modeVal === 'LINES') mode = gl.LINES;
        else if (modeVal === 'LINE_LOOP') mode = gl.LINE_LOOP;
        else if (modeVal === 'TRIANGLES') mode = gl.TRIANGLES;
        else if (modeVal === 'TRIANGLE_STRIP') mode = gl.TRIANGLE_STRIP;
        else if (modeVal === 'TRIANGLE_FAN') mode = gl.TRIANGLE_FAN;

        const vertexCount = vertices.length / 2;
        gl.drawArrays(mode, 0, vertexCount);
    }

    // Show markers on overlay canvas (pixel coords)
    function drawOverlay() {
        // overlay sized and scaled in resizeCanvasToDisplaySize; drawing here uses CSS pixels because context is scaled for DPR
        const dpr = window.devicePixelRatio || 1;
        overlayContenxt.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);
        overlayContenxt.font = '12px sans-serif';

        for (let i = 0; i < vertices.length; i += 2) {
            const ndx = vertices[i], ndy = vertices[i + 1];
            const [px, py] = ndcToPixel(ndx, ndy);
            let color = '#364794af';
            if (i === 0) color = '#24d64aff'; // first point = green
            else if (i === vertices.length - 2) color = '#f11f1fff'; // last point = red
            overlayContenxt.beginPath(); overlayContenxt.fillStyle = color; overlayContenxt.arc(px, py, 2, 0, Math.PI * 2); overlayContenxt.fill();
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

    // Init Event listeners.
    lineWidthInp.addEventListener('input', () => { lineWidthVal.textContent = lineWidthInp.value; });

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
        addPointFromEvent(e, { onlyIfFarEnough: true });
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
