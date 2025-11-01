/**
 * Vertex Core Module
 * Handles WebGL rendering, layer management, shader compilation, and file I/O
 * Can be used independently for viewing rendered geometries
 */

(function (globalScope) {
    'use strict';

    // Constants
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
    outColor = vec4(vColor, uColor.a);
}`;

    const LAYER_COLORS = [
        [0.1, 0.2, 0.7, 1.0],    // blue
        [0.9, 0.2, 0.1, 1.0],    // red
        [0.1, 0.7, 0.2, 1.0],    // green
        [0.9, 0.7, 0.1, 1.0],    // orange
        [0.7, 0.1, 0.7, 1.0],    // purple
        [0.1, 0.7, 0.7, 1.0],    // cyan
    ];

    // Layer class - represents a drawable layer with vertices and properties
    class Layer {
        constructor(id, name) {
            this.id = id;
            this.name = name;
            this.vertices = [];
            this.colors = [];
            this.visible = true;
            this.mode = 'LINE_STRIP';
            this.lineWidth = 1;
            this.vertexShader = DEFAULT_VS;
            this.fragmentShader = DEFAULT_FS;
            this.program = null;
            this.shaderError = null;
        }
    }

    // Shader compilation
    function createShader(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(s);
            console.error('Shader compilation error:', error);
            gl.deleteShader(s);
            return { shader: null, error };
        }
        return { shader: s, error: null };
    }

    function createLayerProgram(gl, layer) {
        const vs = createShader(gl, gl.VERTEX_SHADER, layer.vertexShader);
        const fs = createShader(gl, gl.FRAGMENT_SHADER, layer.fragmentShader);

        if (vs.error || fs.error) {
            layer.shaderError = vs.error || fs.error;
            return null;
        }

        const prog = gl.createProgram();
        gl.attachShader(prog, vs.shader);
        gl.attachShader(prog, fs.shader);
        gl.linkProgram(prog);

        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            const error = gl.getProgramInfoLog(prog);
            console.error('Program link error:', error);
            layer.shaderError = error;
            return null;
        }

        gl.deleteShader(vs.shader);
        gl.deleteShader(fs.shader);
        layer.shaderError = null;
        return prog;
    }

    function initLayerProgram(gl, layer) {
        if (!layer.program) {
            layer.program = createLayerProgram(gl, layer);
        }
        return layer.program;
    }

    // File I/O - Import/Export
    function exportVerticesJSON(layers, period = 30.0) {
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
        return out;
    }

    function downloadJSON(data, filename = 'vertices.json') {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    function loadFileContent(txt, existingLayers = []) {
        try {
            const data = JSON.parse(txt);

            // Extended v2 format: { layers: [...], period: ... }
            if (!data.layers || !Array.isArray(data.layers)) {
                throw new Error('Unknown file format');
            }

            const newLayers = [];
            let nextId = Math.max(...existingLayers.map(l => l.id), 0) + 1;

            data.layers.forEach(layerData => {
                const layer = new Layer(nextId++, layerData.name || 'Imported Layer');
                if (layerData.vertices) {
                    layerData.vertices.forEach(v => {
                        layer.vertices.push(v[0], v[1]);
                    });
                }
                if (layerData.colors) {
                    layerData.colors.forEach(c => {
                        layer.colors.push(c[0], c[1], c[2]);
                    });
                }
                layer.mode = layerData.mode || 'LINE_STRIP';
                layer.lineWidth = layerData.lineWidth || 1;
                layer.vertexShader = layerData.vertexShader || DEFAULT_VS;
                layer.fragmentShader = layerData.fragmentShader || DEFAULT_FS;

                newLayers.push(layer);
            });

            return { layers: newLayers, period: data.period || 30.0 };
        } catch (err) {
            console.error('Error loading file:', err);
            throw err;
        }
    }

    // Rendering
    function draw(gl, layers, clearColor, vbo, colorBuffer, uTime, period, canvas) {
        gl.clearColor(...clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(null);

        layers.forEach(layer => {
            if (!layer.visible || layer.vertices.length === 0) return;

            const prog = initLayerProgram(gl, layer);
            if (!prog) return;

            gl.useProgram(prog);

            // Bind position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(layer.vertices), gl.DYNAMIC_DRAW);
            const aPosLoc = gl.getAttribLocation(prog, 'aPos');
            gl.enableVertexAttribArray(aPosLoc);
            gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

            // Bind color buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(layer.colors), gl.DYNAMIC_DRAW);
            const aColorLoc = gl.getAttribLocation(prog, 'aColor');
            gl.enableVertexAttribArray(aColorLoc);
            gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);

            // Set uniforms
            const uColorLoc = gl.getUniformLocation(prog, 'uColor');
            const color = LAYER_COLORS[layer.id % LAYER_COLORS.length];
            gl.uniform4f(uColorLoc, color[0], color[1], color[2], color[3]);

            const uTimeLoc = gl.getUniformLocation(prog, 'uTime');
            if (uTimeLoc !== -1) {
                gl.uniform1f(uTimeLoc, uTime % period);
            }

            const uPeriodLoc = gl.getUniformLocation(prog, 'uPeriod');
            if (uPeriodLoc !== -1) {
                gl.uniform1f(uPeriodLoc, period);
            }

            // Normalized time uniforms (0...1 and 0...2π)
            const normalizedTime = (uTime % period) / period;

            const uNormalizedTimeLoc = gl.getUniformLocation(prog, 'uNormalizedTime');
            if (uNormalizedTimeLoc !== -1) {
                gl.uniform1f(uNormalizedTimeLoc, normalizedTime);
            }

            const uPhaseLoc = gl.getUniformLocation(prog, 'uPhase');
            if (uPhaseLoc !== -1) {
                gl.uniform1f(uPhaseLoc, normalizedTime * 6.283185307179586); // 2π
            }

            const uResolutionLoc = gl.getUniformLocation(prog, 'uResolution');
            if (uResolutionLoc !== -1) {
                gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
            }

            // Set line width
            const lw = Number(layer.lineWidth) || 1;
            try { gl.lineWidth(lw); } catch (e) { /* ignore */ }

            // Determine draw mode
            const modeVal = layer.mode;
            let mode = gl.LINE_STRIP;
            if (modeVal === 'LINES') mode = gl.LINES;
            else if (modeVal === 'LINE_LOOP') mode = gl.LINE_LOOP;
            else if (modeVal === 'TRIANGLES') mode = gl.TRIANGLES;
            else if (modeVal === 'TRIANGLE_STRIP') mode = gl.TRIANGLE_STRIP;
            else if (modeVal === 'TRIANGLE_FAN') mode = gl.TRIANGLE_FAN;

            // Cull backfaces for filled modes
            if (mode === gl.TRIANGLES || mode === gl.TRIANGLE_STRIP || mode === gl.TRIANGLE_FAN) {
                gl.enable(gl.CULL_FACE);
                gl.cullFace(gl.BACK);
            } else {
                gl.disable(gl.CULL_FACE);
            }

            const vertexCount = layer.vertices.length / 2;
            gl.drawArrays(mode, 0, vertexCount);
        });
    }

    function resizeCanvasToDisplaySize(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.round(canvas.clientWidth * dpr);
        const height = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            return true;
        }
        return false;
    }

    // Export public API
    globalScope.VertexCore = {
        Layer,
        createShader,
        createLayerProgram,
        initLayerProgram,
        exportVerticesJSON,
        downloadJSON,
        loadFileContent,
        draw,
        resizeCanvasToDisplaySize,
        DEFAULT_VS,
        DEFAULT_FS,
        LAYER_COLORS,
    };

})(window);
