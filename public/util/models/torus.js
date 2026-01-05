/**
 * Torus generator - creates a torus with parametric surface.
 */
class Torus extends VertexDataGenerator {

    createVertexData() {
        const n = Math.max(3, Math.floor(this.getParam('n', 16)));       // segments around the tube
        const m = Math.max(3, Math.floor(this.getParam('m', 32)));       // segments around the ring
        const r = Math.max(0.01, this.getParam('r', 0.3));              // tube radius
        const R = Math.max(0.01, this.getParam('R', 0.5));              // ring radius

        // Positions
        this.vertices = new Float32Array(3 * (n + 1) * (m + 1));
        // Normals
        this.normals = new Float32Array(3 * (n + 1) * (m + 1));
        // Texture coordinates
        this.textureCoord = new Float32Array(2 * (n + 1) * (m + 1));
        // Index data
        this.indicesLines = new Uint16Array(2 * 2 * n * m);
        this.indicesTris = new Uint16Array(3 * 2 * n * m);

        const vertices = this.vertices;
        const normals = this.normals;
        const textureCoord = this.textureCoord;
        const indicesLines = this.indicesLines;
        const indicesTris = this.indicesTris;

        const du = (2 * Math.PI) / n;
        const dv = (2 * Math.PI) / m;

        let iLines = 0;
        let iTris = 0;

        // Loop angle u (around tube)
        for (let i = 0, u = 0; i <= n; i++, u += du) {
            // Loop angle v (around ring)
            for (let j = 0, v = 0; j <= m; j++, v += dv) {

                const iVertex = i * (m + 1) + j;

                const x = (R + r * Math.cos(u)) * Math.cos(v);
                const y = (R + r * Math.cos(u)) * Math.sin(v);
                const z = r * Math.sin(u);

                // Set vertex positions
                vertices[iVertex * 3] = x;
                vertices[iVertex * 3 + 1] = y;
                vertices[iVertex * 3 + 2] = z;

                // Calculate and set normals
                const nx = Math.cos(u) * Math.cos(v);
                const ny = Math.cos(u) * Math.sin(v);
                const nz = Math.sin(u);
                normals[iVertex * 3] = nx;
                normals[iVertex * 3 + 1] = ny;
                normals[iVertex * 3 + 2] = nz;

                // Set texture coordinates
                // u maps to horizontal (around the ring), v maps to vertical (around the tube)
                textureCoord[iVertex * 2] = v / (2 * Math.PI);      // u texture coord [0, 1]
                textureCoord[iVertex * 2 + 1] = u / (2 * Math.PI);  // v texture coord [0, 1]

                // Set indices
                if (j > 0 && i > 0) {
                    // Line on beam
                    indicesLines[iLines++] = iVertex - 1;
                    indicesLines[iLines++] = iVertex;

                    // Line on ring
                    indicesLines[iLines++] = iVertex - (m + 1);
                    indicesLines[iLines++] = iVertex;

                    // Two triangles
                    indicesTris[iTris++] = iVertex;
                    indicesTris[iTris++] = iVertex - 1;
                    indicesTris[iTris++] = iVertex - (m + 1);

                    indicesTris[iTris++] = iVertex - 1;
                    indicesTris[iTris++] = iVertex - (m + 1) - 1;
                    indicesTris[iTris++] = iVertex - (m + 1);
                }
            }
        }
    }
}
