/* Sprite animation using a single img element inside a clipped viewport.
   Assumes the spritesheet contains 24 frames laid out horizontally (1 row), each frame size known.
*/
// Simpler WebGL lines demo for beginners.
// Draws an animated Lissajous/spirograph-like curve using GL_LINES.
// The code is intentionally minimal and heavily commented so you can follow the WebGL basics.

// Render three interactive Lissajous curves with live controls.
(function () {
    'use strict';

    const canvas = document.getElementById('background-canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) { console.error('WebGL2 not available'); return; }

    // Default global params (editable with sliders)
    const GLOBAL = {
        points: 360,
        speed: 1.0,
        scale: 0.9,
        bg: [0.98, 0.98, 1.0, 1.0],
    };

    // Per-curve settings
    const curves = [
        { aBase: 3, bBase: 2, color: '#3ea0ff' },
        { aBase: 4, bBase: 3, color: '#ff6b6b' },
        { aBase: 5, bBase: 4, color: '#7be495' },
    ];

    // Create a small control panel appended to the document for live tweaking
    function createControls() {
        const panel = document.createElement('div');
        panel.style.position = 'fixed';
        panel.style.right = '12px';
        panel.style.top = '12px';
        panel.style.padding = '10px';
        panel.style.background = 'rgba(255,255,255,0.9)';
        panel.style.border = '1px solid #ddd';
        panel.style.borderRadius = '6px';
        panel.style.zIndex = 9999;
        panel.style.fontFamily = 'sans-serif';
        panel.style.fontSize = '13px';
        panel.innerHTML = `<strong>Controls</strong><br/>`;

        // points slider
        const pointsLabel = document.createElement('label');
        pointsLabel.textContent = 'Points: ';
        const pointsInp = document.createElement('input');
        pointsInp.type = 'range'; pointsInp.min = 80; pointsInp.max = 2000; pointsInp.value = GLOBAL.points; pointsInp.style.width = '160px';
        pointsInp.oninput = () => { GLOBAL.points = Number(pointsInp.value); pointsVal.textContent = GLOBAL.points; allocateBuffers(); };
        const pointsVal = document.createElement('span'); pointsVal.textContent = GLOBAL.points;
        panel.appendChild(pointsLabel); panel.appendChild(pointsInp); panel.appendChild(pointsVal); panel.appendChild(document.createElement('br'));

        // speed slider
        const speedLabel = document.createElement('label'); speedLabel.textContent = 'Speed: ';
        const speedInp = document.createElement('input'); speedInp.type = 'range'; speedInp.min = 0.1; speedInp.max = 3; speedInp.step = 0.05; speedInp.value = GLOBAL.speed; speedInp.style.width = '160px';
        speedInp.oninput = () => { GLOBAL.speed = Number(speedInp.value); speedVal.textContent = GLOBAL.speed; };
        const speedVal = document.createElement('span'); speedVal.textContent = GLOBAL.speed;
        panel.appendChild(speedLabel); panel.appendChild(speedInp); panel.appendChild(speedVal); panel.appendChild(document.createElement('br'));

        // scale slider
        const scaleLabel = document.createElement('label'); scaleLabel.textContent = 'Scale: ';
        const scaleInp = document.createElement('input'); scaleInp.type = 'range'; scaleInp.min = 0.2; scaleInp.max = 1.0; scaleInp.step = 0.01; scaleInp.value = GLOBAL.scale; scaleInp.style.width = '160px';
        scaleInp.oninput = () => { GLOBAL.scale = Number(scaleInp.value); scaleVal.textContent = GLOBAL.scale; };
        const scaleVal = document.createElement('span'); scaleVal.textContent = GLOBAL.scale;
        panel.appendChild(scaleLabel); panel.appendChild(scaleInp); panel.appendChild(scaleVal); panel.appendChild(document.createElement('hr'));

        // Per-curve color pickers and frequency knobs
        curves.forEach((c, i) => {
            const row = document.createElement('div');
            row.style.marginBottom = '6px';
            row.innerHTML = `<strong>Curve ${i + 1}</strong> `;
            const color = document.createElement('input'); color.type = 'color'; color.value = c.color; color.oninput = () => c.color = color.value;
            const aInp = document.createElement('input'); aInp.type = 'number'; aInp.value = c.aBase; aInp.style.width = '46px'; aInp.onchange = () => c.aBase = Number(aInp.value);
            const bInp = document.createElement('input'); bInp.type = 'number'; bInp.value = c.bBase; bInp.style.width = '46px'; bInp.onchange = () => c.bBase = Number(bInp.value);
            row.appendChild(color); row.appendChild(document.createTextNode(' a:')); row.appendChild(aInp); row.appendChild(document.createTextNode(' b:')); row.appendChild(bInp);
            panel.appendChild(row);
        });

        document.body.appendChild(panel);
    }

    createControls();

    // Resize canvas for DPR and viewport
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(canvas.clientWidth * dpr);
        const h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        }
    }

    // Shaders
    const vsSrc = `#version 300 es
    in vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
    `;
    const fsSrc = `#version 300 es
    precision mediump float; uniform vec4 uColor; out vec4 outColor; void main(){ outColor = uColor; }
    `;

    function compile(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; } return s; }
    const vs = compile(gl.VERTEX_SHADER, vsSrc); const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(prog));

    const aPosLoc = gl.getAttribLocation(prog, 'aPos');
    const uColorLoc = gl.getUniformLocation(prog, 'uColor');

    // GPU buffer (we reuse one buffer and update per-curve)
    let vbo = gl.createBuffer();

    // CPU-side array (will be reallocated when points changes)
    let positions = new Float32Array(GLOBAL.points * 2);

    function allocateBuffers() {
        positions = new Float32Array(GLOBAL.points * 2);
        if (vbo) gl.deleteBuffer(vbo);
        vbo = gl.createBuffer();
    }

    allocateBuffers();
    
    function lissajous(t, a, b, delta) {
        const r = 0.6
            + 0.12 * Math.sin(7.0 * t + delta * 1.3)
            + 0.06 * Math.sin(13.0 * t + delta * 0.7)
            + 0.04 * Math.sin((a + b) * t * 0.5);
        return [r * Math.cos(t), r * Math.sin(t)];
    }
    let start = performance.now() / 1000;

    function drawCurve(curveIndex, time) {
        const c = curves[curveIndex];
        const a = c.aBase + Math.sin(time * 0.13 + curveIndex) * 1.5;
        const b = c.bBase + Math.cos(time * 0.11 + curveIndex * 1.3) * 1.2;
        const delta = time * 0.6 + curveIndex * 0.5;

        const w = canvas.width, h = canvas.height;
        const aspect = w / h || 1;

        for (let i = 0; i < GLOBAL.points; i++) {
            const tt = (i / (GLOBAL.points - 1)) * Math.PI * 2 + time * 0.5;
            const p = lissajous(tt, a, b, delta);
            // scale + aspect correction
            positions[i * 2 + 0] = p[0] * GLOBAL.scale * (w > h ? 1.0 : aspect);
            positions[i * 2 + 1] = p[1] * GLOBAL.scale * (h > w ? 1.0 : 1.0 / aspect);
        }

        // upload and draw
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(aPosLoc);
        gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

        // set color from hex
        const col = hexToRgba(c.color);
        gl.uniform4fv(uColorLoc, col);
        gl.drawArrays(gl.LINE_STRIP, 0, GLOBAL.points);
    }

    // utility: convert #rrggbb to normalized rgba
    function hexToRgba(hex) {
        if (hex[0] === '#') hex = hex.slice(1);
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return [r, g, b, 1.0];
    }

    function frame(nowMs) {
        resize();
        const now = nowMs / 1000;
        const time = (now - start) * GLOBAL.speed;

        // clear
        gl.clearColor(GLOBAL.bg[0], GLOBAL.bg[1], GLOBAL.bg[2], GLOBAL.bg[3]);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(prog);
        // draw each curve in sequence
        for (let i = 0; i < curves.length; i++) drawCurve(i, time);

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

})();
