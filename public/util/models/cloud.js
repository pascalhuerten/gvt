/**
 * Cloud generator - builds a fluffy cloud from clustered spheres.
 */
class Cloud extends VertexDataGenerator {
    createVertexData() {
        const puffCount = Math.max(3, Math.floor(this.getParam('puffCount', 6)));
        const baseRadius = this.getParam('baseRadius', 0.6);
        const puffRadius = this.getParam('puffRadius', 0.35);
        const depth = Math.max(1, Math.min(4, Math.floor(this.getParam('depth', 2))));
        const verticalScale = this.getParam('verticalScale', 0.8);
        const stretchFactor = this.getParam('stretchFactor', 1.0);
        let dirX = this.getParam('stretchDirX', 1.0);
        let dirZ = this.getParam('stretchDirZ', 0.0);
        // normalize direction
        const dLen = Math.hypot(dirX, dirZ);
        if (dLen > 1e-5) { dirX /= dLen; dirZ /= dLen; } else { dirX = 1.0; dirZ = 0.0; }
        const perpX = -dirZ;
        const perpZ = dirX;

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];
        let idx = 0;

        for (let s = 0; s < puffCount; s++) {
            // Elliptical distribution stretched along (dirX, dirZ)
            const phi = Math.random() * Math.PI * 2;
            const dist = baseRadius * (0.3 + Math.random() * 0.5);
            const a = Math.cos(phi) * dist * stretchFactor; // along wind
            const b = Math.sin(phi) * dist;                  // across wind
            const x = dirX * a + perpX * b;
            const z = dirZ * a + perpZ * b;
            const y = (Math.random() - 0.3) * puffRadius * 0.4;

            const sphereGen = new Sphere({ depth: depth, radius: puffRadius });
            sphereGen.createVertexData();

            const vOffset = idx;
            const sVerts = sphereGen.vertices;
            const sNormals = sphereGen.normals;
            for (let i = 0; i < sVerts.length; i += 3) {
                vertices.push(
                    sVerts[i] + x,
                    y + sVerts[i + 1] * verticalScale,
                    sVerts[i + 2] + z
                );
                // adjust normals for vertical scaling
                const nx = sNormals[i];
                const ny = sNormals[i + 1] / verticalScale;
                const nz = sNormals[i + 2];
                const nl = Math.hypot(nx, ny, nz) || 1.0;
                normals.push(nx / nl, ny / nl, nz / nl);
                idx++;
            }
            const sTris = sphereGen.indicesTris;
            for (let i = 0; i < sTris.length; i += 3) {
                indicesTris.push(vOffset + sTris[i], vOffset + sTris[i + 1], vOffset + sTris[i + 2]);
            }
            const sLines = sphereGen.indicesLines;
            for (let i = 0; i < sLines.length; i += 2) {
                indicesLines.push(vOffset + sLines[i], vOffset + sLines[i + 1]);
            }
        }

        // Raise cloud base slightly so lowest point near 0
        let minY = Infinity;
        for (let i = 1; i < vertices.length; i += 3) {
            if (vertices[i] < minY) minY = vertices[i];
        }
        const lift = -minY + 0.1;
        for (let i = 1; i < vertices.length; i += 3) {
            vertices[i] += lift;
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }
}
