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

    // Layer class - represents a drawable layer with indexed vertices
    class Layer {
        constructor(id, name) {
            this.id = id;
            this.name = name;
            // Indexed geometry (unique vertices/colors + indices)
            this.vertices = new Float32Array();    // Unique vertices [x, y, x, y, ...] or flat if not indexed
            this.colors = new Float32Array();      // Unique colors [r, g, b, r, g, b, ...] or flat if not indexed
            this.indices = new Uint32Array();      // Index buffer (empty if flat format)
            this.isIndexed = true;                 // Flag: true = indexed, false = flat
            this.visible = true;
            this.mode = 'LINE_STRIP';
            this.lineWidth = 1;
            this.vertexShader = DEFAULT_VS;
            this.fragmentShader = DEFAULT_FS;
            this.program = null;
            this.shaderError = null;
            this.indexBuffer = null;               // GPU index buffer
        }

        /**
         * Adds a new vertex to this layer using indexed representation.
         * Automatically deduplicates if vertex already exists.
         */
        addVertexIndexed(x, y, color = [1, 1, 1], tolerance = 1e-6) {
            // Ensure we're in indexed format for editing
            if (!this.isIndexed) {
                this.convertToIndexed(this.vertices, this.colors);
            }

            const result = IndexManager.addVertexIndexed(
                this.vertices, this.colors, this.indices,
                x, y, color, tolerance
            );
            this.vertices = result.vertices;
            this.colors = result.colors;
            this.indices = result.indices;
            return result.newIndex;
        }

        /**
         * Removes the last vertex from this layer.
         */
        removeLastVertexIndexed() {
            if (!this.isIndexed) return null;

            const result = IndexManager.removeLastVertexIndexed(
                this.indices, this.vertices
            );
            this.indices = result.indices;
            return result.removedVertexIndex;
        }

        /**
         * Compacts this layer by removing orphaned vertices and remapping indices.
         * Call this after undo/delete operations to clean up memory.
         */
        compactGeometry() {
            if (!this.isIndexed) return; // No compaction needed for flat format

            const result = IndexManager.compactIndexedGeometry(
                this.vertices, this.colors, this.indices
            );
            this.vertices = result.vertices;
            this.colors = result.colors;
            this.indices = result.indices;
            this.indexBuffer = null; // Invalidate GPU buffer
        }

        /**
         * Converts flat vertex arrays to indexed representation.
         * Call this after loading non-indexed data.
         */
        convertToIndexed(flatVertices, flatColors, tolerance = 1e-6) {
            if (this.isIndexed) return; // Already indexed

            const result = IndexManager.toIndexed(
                flatVertices, flatColors, tolerance
            );
            this.vertices = result.vertices;
            this.colors = result.colors;
            this.indices = result.indices;
            this.isIndexed = true;
        }

        /**
         * Gets memory savings statistics for this layer.
         * Returns null if in flat format.
         */
        getMemorySavings() {
            if (!this.isIndexed) return null;
            return IndexManager.getMemorySavings(
                this.vertices.length / 2,
                this.indices.length
            );
        }

        /**
         * Gets the total number of vertices to render
         * (handles both indexed and flat formats)
         */
        getVertexCount() {
            return this.isIndexed ? this.indices.length : this.vertices.length / 2;
        }
    }

    // ========================================================================
    // IndexManager Class - Handles indexed/flat vertex representation conversion
    // ========================================================================

    class IndexManager {
        /**
         * Converts flat vertex/color arrays to indexed representation.
         * Automatically deduplicates vertices.
         * @param {Float32Array|number[]} vertices - Flat array of [x, y, x, y, ...]
         * @param {Float32Array|number[]} colors - Flat array of [r, g, b, r, g, b, ...]
         * @param {number} tolerance - Epsilon for vertex comparison (default: 1e-6)
         * @returns {{vertices: Float32Array, colors: Float32Array, indices: Uint32Array}}
         */
        static toIndexed(vertices, colors, tolerance = 1e-6) {
            const uniqueVertices = [];
            const uniqueColors = [];
            const indices = [];
            const vertexMap = new Map(); // key: "x,y" -> index

            const vertexCount = vertices.length / 2;
            const hasColors = colors && colors.length > 0;

            for (let i = 0; i < vertexCount; i++) {
                const x = vertices[i * 2];
                const y = vertices[i * 2 + 1];
                const key = this._getVertexKey(x, y, tolerance);

                let vertexIndex;
                if (vertexMap.has(key)) {
                    vertexIndex = vertexMap.get(key);
                } else {
                    vertexIndex = uniqueVertices.length / 2;
                    uniqueVertices.push(x, y);

                    if (hasColors) {
                        uniqueColors.push(
                            colors[i * 3],
                            colors[i * 3 + 1],
                            colors[i * 3 + 2]
                        );
                    } else {
                        uniqueColors.push(1, 1, 1); // default white
                    }

                    vertexMap.set(key, vertexIndex);
                }

                indices.push(vertexIndex);
            }

            return {
                vertices: new Float32Array(uniqueVertices),
                colors: new Float32Array(uniqueColors),
                indices: new Uint32Array(indices),
            };
        }

        /**
         * Converts indexed representation back to flat arrays.
         * @param {Float32Array|number[]} vertices - Unique vertices
         * @param {Float32Array|number[]} colors - Unique colors
         * @param {Uint32Array|number[]} indices - Index array
         * @returns {{vertices: Float32Array, colors: Float32Array}}
         */
        static toFlat(vertices, colors, indices) {
            const flatVertices = [];
            const flatColors = [];

            for (const idx of indices) {
                flatVertices.push(vertices[idx * 2], vertices[idx * 2 + 1]);
                flatColors.push(colors[idx * 3], colors[idx * 3 + 1], colors[idx * 3 + 2]);
            }

            return {
                vertices: new Float32Array(flatVertices),
                colors: new Float32Array(flatColors),
            };
        }

        /**
         * Finds duplicate indices in an indexed geometry.
         * @param {Uint32Array|number[]} indices - Index array
         * @returns {number[]} Array of duplicate indices
         */
        static findDuplicates(indices) {
            const seen = new Set();
            const duplicates = [];

            for (const idx of indices) {
                if (seen.has(idx)) {
                    if (!duplicates.includes(idx)) {
                        duplicates.push(idx);
                    }
                } else {
                    seen.add(idx);
                }
            }

            return duplicates;
        }

        /**
         * Adds a new vertex to indexed representation, deduplicating if it already exists.
         * @param {Float32Array|number[]} vertices - Unique vertices
         * @param {Float32Array|number[]} colors - Unique colors
         * @param {Uint32Array|number[]} indices - Current indices
         * @param {number} x - New vertex X coordinate
         * @param {number} y - New vertex Y coordinate
         * @param {number[]} color - RGB color [r, g, b]
         * @param {number} tolerance - Epsilon for vertex comparison
         * @returns {{vertices: Float32Array, colors: Float32Array, indices: Uint32Array, newIndex: number}}
         */
        static addVertexIndexed(vertices, colors, indices, x, y, color, tolerance = 1e-6) {
            const key = this._getVertexKey(x, y, tolerance);
            const existingVertices = vertices ? vertices.length / 2 : 0;
            let vertexIndex = -1;

            // Check for existing vertex
            if (vertices) {
                for (let i = 0; i < existingVertices; i++) {
                    const vx = vertices[i * 2];
                    const vy = vertices[i * 2 + 1];
                    if (this._getVertexKey(vx, vy, tolerance) === key) {
                        vertexIndex = i;
                        break;
                    }
                }
            }

            // Create new vertex if doesn't exist
            if (vertexIndex === -1) {
                const newVertices = new Float32Array((existingVertices + 1) * 2);
                if (vertices) newVertices.set(vertices);
                newVertices[existingVertices * 2] = x;
                newVertices[existingVertices * 2 + 1] = y;

                const newColors = new Float32Array((existingVertices + 1) * 3);
                if (colors) newColors.set(colors);
                newColors[existingVertices * 3] = color[0];
                newColors[existingVertices * 3 + 1] = color[1];
                newColors[existingVertices * 3 + 2] = color[2];

                vertices = newVertices;
                colors = newColors;
                vertexIndex = existingVertices;
            }

            // Add index
            const newIndices = new Uint32Array(indices.length + 1);
            newIndices.set(indices);
            newIndices[indices.length] = vertexIndex;

            return {
                vertices,
                colors,
                indices: newIndices,
                newIndex: vertexIndex,
            };
        }

        /**
         * Removes the last vertex from indexed representation.
         * @param {Uint32Array|number[]} indices - Current indices
         * @param {Float32Array|number[]} vertices - Unique vertices (for cleanup)
         * @returns {{indices: Uint32Array, removedVertexIndex: number | null}}
         */
        static removeLastVertexIndexed(indices, vertices) {
            if (indices.length === 0) return { indices, removedVertexIndex: null };

            const removedVertexIndex = indices[indices.length - 1];
            const newIndices = new Uint32Array(indices.length - 1);
            newIndices.set(indices.slice(0, -1));

            return { indices: newIndices, removedVertexIndex };
        }

        /**
         * Compacts indexed geometry by removing orphaned vertices and remapping indices.
         * Call this to clean up memory after undo/delete operations.
         * @param {Float32Array|number[]} vertices - Unique vertices [x, y, x, y, ...]
         * @param {Float32Array|number[]} colors - Unique colors [r, g, b, r, g, b, ...]
         * @param {Uint32Array|number[]} indices - Index buffer
         * @returns {{vertices: Float32Array, colors: Float32Array, indices: Uint32Array}}
         */
        static compactIndexedGeometry(vertices, colors, indices) {
            if (indices.length === 0) {
                return {
                    vertices: new Float32Array(),
                    colors: new Float32Array(),
                    indices: new Uint32Array()
                };
            }

            // Find which vertex indices are actually used
            const usedIndices = new Set(indices);
            if (usedIndices.size === vertices.length / 2) {
                // No orphaned vertices, return as-is
                return { vertices, colors, indices };
            }

            // Build old-to-new index mapping
            const indexMap = new Map();
            let newVertexCount = 0;
            for (let i = 0; i < vertices.length / 2; i++) {
                if (usedIndices.has(i)) {
                    indexMap.set(i, newVertexCount++);
                }
            }

            // Compact vertices and colors arrays
            const newVertices = new Float32Array(newVertexCount * 2);
            const newColors = new Float32Array(newVertexCount * 3);

            for (const [oldIdx, newIdx] of indexMap.entries()) {
                newVertices[newIdx * 2] = vertices[oldIdx * 2];
                newVertices[newIdx * 2 + 1] = vertices[oldIdx * 2 + 1];
                newColors[newIdx * 3] = colors[oldIdx * 3];
                newColors[newIdx * 3 + 1] = colors[oldIdx * 3 + 1];
                newColors[newIdx * 3 + 2] = colors[oldIdx * 3 + 2];
            }

            // Remap indices
            const newIndices = new Uint32Array(indices.length);
            for (let i = 0; i < indices.length; i++) {
                newIndices[i] = indexMap.get(indices[i]);
            }

            return { vertices: newVertices, colors: newColors, indices: newIndices };
        }

        /**
         * Computes a quantized key for vertex deduplication.
         * @private
         */
        static _getVertexKey(x, y, tolerance) {
            const quantX = Math.round(x / tolerance);
            const quantY = Math.round(y / tolerance);
            return `${quantX},${quantY}`;
        }

        /**
         * Calculates memory savings from indexing.
         * @param {number} uniqueVertexCount - Number of unique vertices
         * @param {number} totalIndexCount - Number of indices
         * @returns {object} Statistics about memory usage
         */
        static getMemorySavings(uniqueVertexCount, totalIndexCount) {
            const flatSize = totalIndexCount * 2 * 4 + totalIndexCount * 3 * 4; // vertices + colors
            const indexedSize = uniqueVertexCount * 2 * 4 + uniqueVertexCount * 3 * 4 + totalIndexCount * 4;
            const savings = ((flatSize - indexedSize) / flatSize * 100).toFixed(2);

            return {
                flatSize,
                indexedSize,
                savingsPercent: savings,
                savingsBytes: flatSize - indexedSize,
            };
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

    // File I/O - Always export as indexed format
    // Simplified format: indices array presence indicates indexed vs flat format

    function exportVerticesJSON(layers, period = 30.0) {
        const layersData = layers.map(layer => {
            const uniqueVertexCount = layer.vertices.length / 2;
            const indexCount = layer.indices.length;

            let layerData = {
                id: layer.id,
                name: layer.name,
                vertexShader: layer.vertexShader,
                fragmentShader: layer.fragmentShader,
                mode: layer.mode,
                lineWidth: Number(layer.lineWidth) || 1,
            };

            // Always export as indexed: unique vertices + indices
            const verticesArray = [];
            for (let i = 0; i < layer.vertices.length; i += 2) {
                verticesArray.push([layer.vertices[i], layer.vertices[i + 1]]);
            }

            const colorsArray = [];
            for (let i = 0; i < layer.colors.length; i += 3) {
                colorsArray.push([layer.colors[i], layer.colors[i + 1], layer.colors[i + 2]]);
            }

            layerData.vertices = verticesArray;
            layerData.colors = colorsArray;

            // Export indices as flat array - presence indicates indexed format
            if (indexCount > 0) {
                layerData.indices = Array.from(layer.indices);
            }

            return layerData;
        });

        const out = {
            layers: layersData,
            period: period,
            format: 'indexed-v2', // Simplified format: indices indicate indexation
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

            // Check if valid format
            if (!data.layers || !Array.isArray(data.layers)) {
                throw new Error('Unknown file format');
            }

            const newLayers = [];
            let nextId = Math.max(...existingLayers.map(l => l.id), 0) + 1;

            data.layers.forEach(layerData => {
                const layer = new Layer(nextId++, layerData.name || 'Imported Layer');

                // Load vertices
                if (layerData.vertices) {
                    const verts = [];
                    for (const [x, y] of layerData.vertices) {
                        verts.push(x, y);
                    }
                    layer.vertices = new Float32Array(verts);
                }

                // Load colors
                if (layerData.colors) {
                    const cols = [];
                    for (const [r, g, b] of layerData.colors) {
                        cols.push(r, g, b);
                    }
                    layer.colors = new Float32Array(cols);
                }

                // Load indices if present - presence indicates indexed format
                const hasIndices = layerData.indices && Array.isArray(layerData.indices) && layerData.indices.length > 0;
                if (hasIndices) {
                    layer.indices = new Uint32Array(layerData.indices);
                    layer.isIndexed = true;
                } else {
                    layer.indices = new Uint32Array(); // Empty indices for flat format
                    layer.isIndexed = false;
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

    // Rendering with support for both indexed and flat formats
    function draw(gl, layers, clearColor, vbo, colorBuffer, uTime, period, canvas) {
        gl.clearColor(...clearColor);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(null);

        layers.forEach(layer => {
            const vertexCount = layer.getVertexCount();
            if (!layer.visible || vertexCount === 0) return;

            const prog = initLayerProgram(gl, layer);
            if (!prog) return;

            gl.useProgram(prog);

            // Bind position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, layer.vertices, gl.DYNAMIC_DRAW);
            const aPosLoc = gl.getAttribLocation(prog, 'aPos');
            gl.enableVertexAttribArray(aPosLoc);
            gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

            // Bind color buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, layer.colors, gl.DYNAMIC_DRAW);
            const aColorLoc = gl.getAttribLocation(prog, 'aColor');
            gl.enableVertexAttribArray(aColorLoc);
            gl.vertexAttribPointer(aColorLoc, 3, gl.FLOAT, false, 0, 0);

            // Use drawElements or drawArrays depending on format
            if (layer.isIndexed && layer.indices.length > 0) {
                // Indexed format: use drawElements
                if (!layer.indexBuffer) {
                    layer.indexBuffer = gl.createBuffer();
                }
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, layer.indexBuffer);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, layer.indices, gl.DYNAMIC_DRAW);
            } else {
                // Flat format: unbind element buffer for drawArrays
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            }

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

            // Draw using appropriate method based on format
            if (layer.isIndexed && layer.indices.length > 0) {
                gl.drawElements(mode, layer.indices.length, gl.UNSIGNED_INT, 0);
            } else {
                gl.drawArrays(mode, 0, vertexCount);
            }
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
        IndexManager,
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
