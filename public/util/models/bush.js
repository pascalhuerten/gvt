/**
 * Bush generator - merges a cluster of spheres into one mesh.
 */
class Bush extends VertexDataGenerator {
    createVertexData() {
        const sphereCount = Math.max(1, Math.floor(this.getParam('sphereCount', 3)));
        const baseRadius = this.getParam('baseRadius', 0.4); // overall bush extent
        const sphereRadius = this.getParam('sphereRadius', 0.20);
        const depth = Math.max(1, Math.min(5, Math.floor(this.getParam('depth', 1))));
        const verticalScale = this.getParam('verticalScale', 0.9); // flatten vertically

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];
        let idx = 0;

        for (let s = 0; s < sphereCount; s++) {
            // Random position biased towards center
            const angle = Math.random() * Math.PI * 2;
            const dist = baseRadius * (Math.random() * 0.6); // keep relatively tight cluster
            const x = Math.cos(angle) * dist;
            const z = Math.sin(angle) * dist;
            const y = (Math.random() - 0.5) * sphereRadius * 0.3; // slight vertical variation

            const scaleY = verticalScale; // squash in Y for bush shape

            const sphereGen = new Sphere({ depth: depth, radius: sphereRadius });
            sphereGen.createVertexData();

            const vOffset = idx;
            const sVerts = sphereGen.vertices;
            const sNormals = sphereGen.normals;
            for (let i = 0; i < sVerts.length; i += 3) {
                vertices.push(
                    sVerts[i] + x,
                    y + sVerts[i + 1] * scaleY,
                    sVerts[i + 2] + z
                );
                // Adjust normals for vertical squash (re-normalize)
                const nx = sNormals[i];
                const ny = sNormals[i + 1] / scaleY;
                const nz = sNormals[i + 2];
                const nl = Math.hypot(nx, ny, nz) || 1.0;
                normals.push(nx / nl, ny / nl, nz / nl);
                idx++;
            }
            // Triangles
            const sTris = sphereGen.indicesTris;
            for (let i = 0; i < sTris.length; i += 3) {
                indicesTris.push(vOffset + sTris[i], vOffset + sTris[i + 1], vOffset + sTris[i + 2]);
            }
            // Lines
            const sLines = sphereGen.indicesLines;
            for (let i = 0; i < sLines.length; i += 2) {
                indicesLines.push(vOffset + sLines[i], vOffset + sLines[i + 1]);
            }
        }

        // Post-process: raise bush so lowest point sits at ground level and stretch slightly in Y
        let minY = Infinity;
        for (let i = 1; i < vertices.length; i += 3) {
            if (vertices[i] < minY) minY = vertices[i];
        }
        const clearance = -0.1; // keep base exactly at ground
        const lift = -minY + clearance;
        const stretch = 1.1; // subtle vertical stretch to appear a bit taller
        for (let i = 1; i < vertices.length; i += 3) {
            vertices[i] = (vertices[i] + lift) * stretch;
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }
}
