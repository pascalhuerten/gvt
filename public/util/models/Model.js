/**
 * Model - Wraps a VertexDataGenerator with rendering properties and WebGL buffers.
 * Handles model state: color, fill style, transformations, and buffer management.
 * Automatically generates vertex data and initializes WebGL buffers in constructor.
 */
class Model {
    /**
     * Create a Model from a geometry generator.
     * Automatically generates vertex data and initializes WebGL buffers.
     * @param {VertexDataGenerator} geometryGenerator - Generator instance (fresh, with params set)
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} prog - Shader program with attribute/uniform locations
     * @param {Object} [options={}] - Model configuration
     * @param {string} [options.fillstyle='fillwireframe'] - Rendering style (fill, wireframe, fillwireframe)
     * @param {Array} [options.color=[1,1,1]] - RGB color [r, g, b]
     * @param {Object} [options.transform] - Initial transformation (translation, rotation, scale)
     */
    constructor(geometryGenerator, gl, prog, options = {}) {
        if (!gl || !prog) {
            throw new Error('WebGL context and shader program required');
        }

        this.generator = geometryGenerator;
        this.fillstyle = options.fillstyle ?? 'fillwireframe';
        this.color = options.color ?? [1.0, 1.0, 1.0];
        this.mvMatrix = mat4.create();

        // Generate vertex data
        this.generator.createVertexData();

        // Copy vertex data from generator
        this.vertices = geometryGenerator.vertices;
        this.normals = geometryGenerator.normals;
        this.indicesTris = geometryGenerator.indicesTris;
        this.indicesLines = geometryGenerator.indicesLines;

        // Initialize WebGL buffers immediately
        this.#initWebGLBuffers(gl, prog);

        // Apply optional transform
        if (options.transform) {
            this.#applyTransform(options.transform);
        }
    }

    /**
     * Initialize WebGL buffers for this model (private, called in constructor).
     * @private
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} prog - Shader program with attribute/uniform locations
     */
    #initWebGLBuffers(gl, prog) {
        // Setup position VBO
        this.vboPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);
        prog.positionAttrib = gl.getAttribLocation(prog, 'aPosition');
        gl.enableVertexAttribArray(prog.positionAttrib);

        // Setup normal VBO
        this.vboNormal = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNormal);
        gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
        prog.normalAttrib = gl.getAttribLocation(prog, 'aNormal');
        gl.enableVertexAttribArray(prog.normalAttrib);

        // Optional color VBO if generator provides per-vertex colors
        if (this.generator.colors) {
            this.colors = this.generator.colors;
            this.vboColor = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboColor);
            gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
            prog.colorAttrib = gl.getAttribLocation(prog, 'aColor');
            if (prog.colorAttrib !== -1) {
                gl.enableVertexAttribArray(prog.colorAttrib);
            }
        } else {
            this.vboColor = null;
        }

        // Setup lines IBO
        this.iboLines = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboLines);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesLines, gl.STATIC_DRAW);
        this.iboLines.numberOfElements = this.indicesLines.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // Setup triangles IBO
        this.iboTris = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboTris);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesTris, gl.STATIC_DRAW);
        this.iboTris.numberOfElements = this.indicesTris.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    /**
     * Apply a transformation to this model's matrix after construction.
     * @param {Object} transform - Transform parameters
     * @param {Array} [transform.translation] - [x, y, z] translation
     * @param {Array} [transform.rotation] - [rx, ry, rz] in radians (applied Z, Y, X)
     * @param {number|Array} [transform.scale] - Scalar or [sx, sy, sz]
     */
    setTransform(transform) {
        this.#applyTransform(transform);
    }

    /**
     * Apply transformation to mvMatrix (private helper).
     * @private
     */
    #applyTransform(transform) {
        mat4.identity(this.mvMatrix);

        // Translation
        const t = transform.translation;
        if (Array.isArray(t) && t.length >= 3) {
            mat4.translate(this.mvMatrix, this.mvMatrix, [t[0], t[1], t[2]]);
        }

        // Rotation (Z, Y, X order)
        const r = transform.rotation;
        if (Array.isArray(r) && r.length >= 3) {
            if (r[2]) mat4.rotateZ(this.mvMatrix, this.mvMatrix, r[2]);
            if (r[1]) mat4.rotateY(this.mvMatrix, this.mvMatrix, r[1]);
            if (r[0]) mat4.rotateX(this.mvMatrix, this.mvMatrix, r[0]);
        }

        // Scale
        if (transform.scale !== undefined) {
            const scale = Array.isArray(transform.scale)
                ? transform.scale
                : [transform.scale, transform.scale, transform.scale];
            mat4.scale(this.mvMatrix, this.mvMatrix, scale);
        }
    }

    /**
     * Update geometry parameters and regenerate vertex data.
     * Useful for animating LOD (level of detail) changes.
     * @param {Object} newParams - New parameters for the geometry generator
     */
    updateGeometry(newParams) {
        // Update generator params and recreate geometry
        Object.assign(this.generator.params, newParams);
        this.generator.createVertexData();

        // Copy new vertex data
        this.vertices = this.generator.vertices;
        this.normals = this.generator.normals;
        this.indicesTris = this.generator.indicesTris;
        this.indicesLines = this.generator.indicesLines;
    }

    /**
     * Reinitialize WebGL buffers with current vertex data.
     * Must be called after updateGeometry() to push new data to GPU.
     * @param {WebGLRenderingContext} gl - WebGL context
     * @param {Object} prog - Shader program with attribute/uniform locations
     */
    _reinitializeWebGLBuffers(gl, prog) {
        // Update position VBO
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STATIC_DRAW);

        // Update normal VBO
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNormal);
        gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);

        // Update lines IBO
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboLines);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesLines, gl.STATIC_DRAW);
        this.iboLines.numberOfElements = this.indicesLines.length;

        // Update triangles IBO
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.iboTris);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesTris, gl.STATIC_DRAW);
        this.iboTris.numberOfElements = this.indicesTris.length;

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // Update color VBO if present
        if (this.vboColor && this.colors) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vboColor);
            gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.STATIC_DRAW);
        }
    }
}
