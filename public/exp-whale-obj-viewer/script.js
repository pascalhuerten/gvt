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

    // Resize canvas for DPR and viewport
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(canvas.clientWidth * dpr);
        const h = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
        }
    }


    // --- Modular Shader Setup ---
    function createShaderProgram(vsSource, fsSource) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error('Vertex shader error:', gl.getShaderInfoLog(vs));
            gl.deleteShader(vs); return null;
        }
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error('Fragment shader error:', gl.getShaderInfoLog(fs));
            gl.deleteShader(fs); return null;
        }
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    // Vertex shader (adds optional point size)
    const vsSrc = `#version 300 es
    in vec2 aPos;
    uniform float uPointSize;
    void main(){ gl_Position = vec4(aPos.x, aPos.y, 0.0, 1.0); gl_PointSize = uPointSize; }
    `;
    // Normal fragment shader
    const fsSrc = `#version 300 es
    precision mediump float; uniform vec4 uColor; out vec4 outColor; void main(){ outColor = uColor; }
    `;


    // Toggle mode
    let showPoints = true;
    let showOutline = true;
    let renderTriangles = true; // show triangle edges
    let cullBackfaces = true;    // only render triangles whose face is front-facing
    // Compile programs
    const prog = createShaderProgram(vsSrc, fsSrc);

    // Use correct program and get locations
    function useProgram() {
        gl.useProgram(prog);
        return {
            aPosLoc: gl.getAttribLocation(prog, 'aPos'),
            uColorLoc: gl.getUniformLocation(prog, 'uColor'),
            uPointSizeLoc: gl.getUniformLocation(prog, 'uPointSize')
        };
    }



    // --- Whale Vertices Integration via JSON fetch ---
    const whaleColor = '#2a2a2a';
    let pointsVBO = gl.createBuffer();
    let outlineVBO = gl.createBuffer();
    let trianglesVBO = gl.createBuffer();
    let triLinesVertexCount = 0;
    let positions = null; // flat positions for all points
    let outlinePositions = null; // flat positions for outline
    let whale2D = null;
    let verticesLoaded = false;
    let frontFaceCount = 0;

    function getWhale2DVertices(walvertices) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        walvertices.forEach(v => {
            const x = v[0];
            const y = v[1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        });
        const scale = 1.6 / Math.max(maxX - minX, maxY - minY);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return walvertices.map(v => [
            (v[0] - cx) * scale,
            (v[1] - cy) * scale
        ]);
    }

    // Parse an OBJ file (vertices + faces). Returns {vertices: [[x,y,z],...], faces: [[i0,i1,i2],...]}
    function parseOBJ(text) {
        const verts = [];
        const faces = [];
        const lines = text.split(/\r?\n/);
        for (let line of lines) {
            line = line.trim();
            if (line.length === 0) continue;
            if (line.startsWith('v ')) {
                const parts = line.split(/\s+/).slice(1).map(Number);
                verts.push(parts);
            } else if (line.startsWith('f ')) {
                const parts = line.split(/\s+/).slice(1).map(tok => {
                    const idx = tok.split('/')[0];
                    return parseInt(idx, 10) - 1; // OBJ 1-based
                });
                // triangulate polygon faces (fan)
                for (let i = 1; i + 1 < parts.length; ++i) {
                    faces.push([parts[0], parts[i], parts[i + 1]]);
                }
            }
        }
        return { vertices: verts, faces };
    }

    // Build triangle-line positions and view-dependent silhouette outline from parsed OBJ
    // viewDir: normalized 3D vector pointing from camera into the scene
    function processOBJ(verts3D, faces, viewDir) {
        // Build orthonormal basis (u,v) for screen plane from viewDir
        const up = [0, 1, 0];
        const dotUp = Math.abs(viewDir[0] * up[0] + viewDir[1] * up[1] + viewDir[2] * up[2]);
        const worldUp = dotUp > 0.99 ? [0, 0, 1] : up;
        // u = normalize(cross(worldUp, viewDir))
        let u = [
            worldUp[1] * viewDir[2] - worldUp[2] * viewDir[1],
            worldUp[2] * viewDir[0] - worldUp[0] * viewDir[2],
            worldUp[0] * viewDir[1] - worldUp[1] * viewDir[0]
        ];
        let uLen = Math.hypot(u[0], u[1], u[2]) || 1;
        u = [u[0] / uLen, u[1] / uLen, u[2] / uLen];
        // v = cross(viewDir, u)
        const v = [
            viewDir[1] * u[2] - viewDir[2] * u[1],
            viewDir[2] * u[0] - viewDir[0] * u[2],
            viewDir[0] * u[1] - viewDir[1] * u[0]
        ];

        // Project vertices into (u,v) coordinates
        const proj = verts3D.map(p => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2], p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]);
        // Normalize/center
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        proj.forEach(p => { const x = p[0], y = p[1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; });
        const scale = 1.6 / Math.max(maxX - minX, maxY - minY || 1);
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        whale2D = proj.map(p => [(p[0] - cx) * scale, (p[1] - cy) * scale]);

        // Build flat positions for points
        positions = new Float32Array(whale2D.length * 2);
        for (let i = 0; i < whale2D.length; ++i) { positions[i * 2 + 0] = whale2D[i][0]; positions[i * 2 + 1] = whale2D[i][1]; }



        // Compute face normals (3D) and facing relative to viewDir
        const faceNormals = new Array(faces.length);
        const faceFacing = new Array(faces.length);
        for (let i = 0; i < faces.length; ++i) {
            const [a, b, c] = faces[i];
            const A = verts3D[a], B = verts3D[b], C = verts3D[c];
            const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
            const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const nlen = Math.hypot(nx, ny, nz) || 1; const nn = [nx / nlen, ny / nlen, nz / nlen];
            faceNormals[i] = nn;
            faceFacing[i] = (nn[0] * viewDir[0] + nn[1] * viewDir[1] + nn[2] * viewDir[2]) > 0;
        }

        // count front-facing faces
        frontFaceCount = faceFacing.reduce((s, v) => s + (v ? 1 : 0), 0);

        // Now build triangle edges (for wireframe) as lines (projected), honoring culling if enabled
        const triLines = [];
        for (let fi = 0; fi < faces.length; ++fi) {
            const [a, b, c] = faces[fi];
            // if culling is enabled and this face is back-facing, skip its edges
            if (cullBackfaces && !faceFacing[fi]) continue;
            const pa = whale2D[a], pb = whale2D[b], pc = whale2D[c];
            triLines.push(pa[0], pa[1], pb[0], pb[1]);
            triLines.push(pb[0], pb[1], pc[0], pc[1]);
            triLines.push(pc[0], pc[1], pa[0], pa[1]);
        }
        const triLinesArray = new Float32Array(triLines);
        triLinesVertexCount = triLinesArray.length / 2;

        // Map edges to adjacent faces
        const edgeFaces = new Map();
        function edgeKey(i, j) { return i < j ? i + '_' + j : j + '_' + i; }
        for (let fi = 0; fi < faces.length; ++fi) {
            const [a, b, c] = faces[fi];
            const keys = [[a, b], [b, c], [c, a]];
            for (let [i, j] of keys) {
                const k = edgeKey(i, j);
                if (!edgeFaces.has(k)) edgeFaces.set(k, []);
                edgeFaces.get(k).push(fi);
            }
        }

        // Collect silhouette edges: edges where adjacent faces have opposite facing, or open edges
        const silhouetteEdges = [];
        for (let [k, fidx] of edgeFaces.entries()) {
            if (fidx.length === 1) { silhouetteEdges.push(k.split('_').map(Number)); }
            else if (fidx.length === 2) {
                const f0 = fidx[0], f1 = fidx[1];
                if (faceFacing[f0] !== faceFacing[f1]) silhouetteEdges.push(k.split('_').map(Number));
            }
        }

        // Build adjacency for silhouette edges and extract loops
        const adjSil = new Map();
        for (let [a, b] of silhouetteEdges) {
            if (!adjSil.has(a)) adjSil.set(a, []); if (!adjSil.has(b)) adjSil.set(b, []);
            adjSil.get(a).push(b); adjSil.get(b).push(a);
        }
        const loops = [];
        const visitedEdge = new Set();
        for (let [start, neigh] of adjSil.entries()) {
            if (!neigh.length) continue;
            const used = Array.from(visitedEdge).some(k => k.startsWith(start + ':'));
            if (used) continue;
            let loop = [start]; let prev = null; let cur = start;
            while (true) {
                const neighbors = adjSil.get(cur) || [];
                let next = null;
                for (let n of neighbors) if (n !== prev) { next = n; break; }
                if (next === null) break;
                visitedEdge.add(cur + ':' + next);
                prev = cur; cur = next;
                if (cur === start) break;
                loop.push(cur);
                if (loop.length > 10000) break;
            }
            if (loop.length > 1) loops.push(loop);
        }

        // Do NOT fallback to convex hull; if no loops found, set outlinePositions empty
        if (loops.length) {
            outlinePositions = loops.map(loop => {
                const arr = new Float32Array(loop.length * 2);
                for (let i = 0; i < loop.length; ++i) { const idx = loop[i]; arr[i * 2 + 0] = whale2D[idx][0]; arr[i * 2 + 1] = whale2D[idx][1]; }
                return arr;
            });
        } else {
            outlinePositions = [];
        }

        // store triangle lines buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, trianglesVBO);
        gl.bufferData(gl.ARRAY_BUFFER, triLinesArray, gl.STATIC_DRAW);
    }

    let parsedOBJ = null;
    // Camera in spherical coordinates
    let camAz = 0.0; // radians
    let camEl = 0.0; // elevation
    function getViewDir() {
        const el = camEl; const az = camAz;
        const x = Math.cos(el) * Math.cos(az), y = Math.sin(el), z = Math.cos(el) * Math.sin(az);
        const len = Math.hypot(x, y, z) || 1; return [x / len, y / len, z / len];
    }

    function loadOBJ() {
        fetch('wal.obj')
            .then(r => r.text())
            .then(txt => {
                parsedOBJ = parseOBJ(txt);
                updateCameraAndProcess();
                verticesLoaded = true;
            })
            .catch(err => console.error('Failed to load wal.obj', err));
    }

    function updateCameraAndProcess() {
        const viewDir = getViewDir();
        if (!parsedOBJ) return;
        processOBJ(parsedOBJ.vertices, parsedOBJ.faces, viewDir);
    }

    loadOBJ();

    let start = performance.now() / 1000;

    // Debug overlay
    const debugOverlay = (() => {
        const d = document.createElement('div');
        d.style.position = 'fixed'; d.style.left = '12px'; d.style.top = '12px'; d.style.padding = '8px';
        d.style.background = 'rgba(255,255,255,0.9)'; d.style.border = '1px solid #ccc'; d.style.fontFamily = 'monospace'; d.style.fontSize = '12px'; d.style.zIndex = 9999;
        document.body.appendChild(d);
        return d;
    })();

    function updateDebug() {
        const triCount = parsedOBJ ? parsedOBJ.faces.length : 0;
        const vertCount = parsedOBJ ? parsedOBJ.vertices.length : 0;
        let renderedTris = 0;
        if (renderTriangles) {
            if (cullBackfaces) renderedTris = frontFaceCount;
            else renderedTris = triCount;
        }
        debugOverlay.innerText = `verts: ${vertCount}\nfaces: ${triCount}\nrendered tris: ${renderedTris}\noutline loops: ${outlinePositions ? outlinePositions.length : 0}\ncontrols: O outline ${showOutline} | P points ${showPoints} | T tris ${renderTriangles} | C cull ${cullBackfaces}`;
    }

    function draw() {
        if (!verticesLoaded || !positions) return;
        const { aPosLoc, uColorLoc, uPointSizeLoc } = useProgram();
        // Draw triangle edges (wireframe) - optionally cull backfaces
        if (renderTriangles && trianglesVBO && triLinesVertexCount > 0) {
            gl.bindBuffer(gl.ARRAY_BUFFER, trianglesVBO);
            gl.enableVertexAttribArray(aPosLoc);
            gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
            const tcol = hexToRgba('#999999');
            gl.uniform4fv(uColorLoc, tcol);
            gl.uniform1f(uPointSizeLoc, 1.0);
            // If culling is enabled we still draw all edges but make edges of back-facing triangles transparent by skipping them in buffer creation (handled in processOBJ)
            gl.drawArrays(gl.LINES, 0, triLinesVertexCount);
        }

        // Draw outline loops if available (outlinePositions is an array of Float32Array loops)
        if (showOutline && outlinePositions && outlinePositions.length > 0) {
            const col = hexToRgba(whaleColor);
            gl.uniform4fv(uColorLoc, col);
            gl.uniform1f(uPointSizeLoc, 1.0);
            for (let loopArr of outlinePositions) {
                gl.bindBuffer(gl.ARRAY_BUFFER, outlineVBO);
                gl.bufferData(gl.ARRAY_BUFFER, loopArr, gl.STATIC_DRAW);
                gl.enableVertexAttribArray(aPosLoc);
                gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
                gl.drawArrays(gl.LINE_LOOP, 0, loopArr.length / 2);
            }
        }

        // Optionally draw points
        if (showPoints) {
            gl.bindBuffer(gl.ARRAY_BUFFER, pointsVBO);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(aPosLoc);
            gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
            // small grey points
            const pcol = hexToRgba('#666666');
            gl.uniform4fv(uColorLoc, pcol);
            gl.uniform1f(uPointSizeLoc, 4.0);
            gl.drawArrays(gl.POINTS, 0, positions.length / 2);
        }

        updateDebug();
    }

    // Camera controls and toggles: arrow keys rotate azimuth/elevation; O/P/T/C toggle visual options
    window.addEventListener('keydown', (e) => {
        const step = 0.12;
        if (e.key === 'ArrowLeft') { camAz -= step; updateCameraAndProcess(); }
        if (e.key === 'ArrowRight') { camAz += step; updateCameraAndProcess(); }
        if (e.key === 'ArrowUp') { camEl = Math.min(camEl + step, Math.PI / 2 - 0.01); updateCameraAndProcess(); }
        if (e.key === 'ArrowDown') { camEl = Math.max(camEl - step, -Math.PI / 2 + 0.01); updateCameraAndProcess(); }
        // other toggles
        if (e.key === 'o' || e.key === 'O') { showOutline = !showOutline; console.log('showOutline=', showOutline); }
        if (e.key === 'p' || e.key === 'P') { showPoints = !showPoints; console.log('showPoints=', showPoints); }
        if (e.key === 't' || e.key === 'T') { renderTriangles = !renderTriangles; updateCameraAndProcess(); console.log('renderTriangles=', renderTriangles); }
        if (e.key === 'c' || e.key === 'C') { cullBackfaces = !cullBackfaces; updateCameraAndProcess(); console.log('cullBackfaces=', cullBackfaces); }
    });

    console.log('Controls: Arrow keys rotate camera | O outline | P points | T triangles | C cull backfaces');



    // Monotone chain convex hull
    function computeConvexHull(points) {
        // points: array of [x,y]
        if (points.length <= 3) return points.slice();
        const pts = points.map(p => p.slice()).sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
        function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
        const lower = [];
        for (let p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; --i) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop(); lower.pop();
        return lower.concat(upper);
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
        // clear
        gl.clearColor(1.0, 1.0, 1.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        draw();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

})();
