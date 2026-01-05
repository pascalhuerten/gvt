/**
 * Abstract base class for vertex data generators.
 * Defines the interface that all geometry generators must implement.
 * 
 * @abstract
 */
class VertexDataGenerator {
    /**
     * Create a vertex data generator with optional parameters.
     * @param {Object} [params={}] - Configuration parameters for the generator
     */
    constructor(params = {}) {
        this.params = params;

        // These will be set by subclass implementation of createVertexData()
        this.vertices = null;      // Float32Array - flattened [x, y, z, x, y, z, ...]
        this.normals = null;       // Float32Array - flattened [nx, ny, nz, nx, ny, nz, ...]
        this.textureCoord = null;  // Float32Array - texture coordinates [u, v, u, v, ...]
        this.indicesTris = null;   // Uint16Array - triangle indices [i0, i1, i2, i0, i1, i2, ...]
        this.indicesLines = null;  // Uint16Array - line indices [i0, i1, i0, i1, ...]
    }

    /**
     * Generate vertex data. Must be implemented by subclasses.
     * After calling this method, the instance should have:
     * - this.vertices (Float32Array)
     * - this.normals (Float32Array)
     * - this.indicesTris (Uint16Array)
     * - this.indicesLines (Uint16Array)
     * 
     * @abstract
     * @throws {Error} If not implemented by subclass
     */
    createVertexData() {
        throw new Error('createVertexData() must be implemented by subclass');
    }

    /**
     * Get all vertex data as an object.
     * @returns {Object} Object with vertices, normals, indicesTris, indicesLines
     */
    getVertexData() {
        if (!this.vertices) {
            throw new Error('Vertex data not generated. Call createVertexData() first.');
        }
        return {
            vertices: this.vertices,
            normals: this.normals,
            indicesTris: this.indicesTris,
            indicesLines: this.indicesLines
        };
    }

    /**
     * Get the number of vertices.
     * @returns {number}
     */
    getVertexCount() {
        return this.vertices ? this.vertices.length / 3 : 0;
    }

    /**
     * Get the number of triangles.
     * @returns {number}
     */
    getTriangleCount() {
        return this.indicesTris ? this.indicesTris.length / 3 : 0;
    }

    /**
     * Get the number of lines.
     * @returns {number}
     */
    getLineCount() {
        return this.indicesLines ? this.indicesLines.length / 2 : 0;
    }

    /**
     * Helper: Get parameter value with fallback chain.
     * Checks in order: direct property, params object, default value
     * @param {string} key - Parameter name
     * @param {*} defaultValue - Fallback value if not found
     * @returns {*} The parameter value
     */
    getParam(key, defaultValue) {
        if (this[key] !== undefined) return this[key];
        if (this.params && this.params[key] !== undefined) return this.params[key];
        return defaultValue;
    }
}
