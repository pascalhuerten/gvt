/**
 * Sphere generator - creates a sphere via recursive octahedron subdivision.
 * Attribution: Sphere subdivision algorithm adapted from Paul Bourke (C reference)
 * See: https://paulbourke.net/geometry/circlesphere/csource3.c
 */
class Sphere extends VertexDataGenerator {

    createVertexData() {
        // Get parameters with fallback chain
        let depth = Math.max(0, Math.min(6, Math.floor(this.getParam('depth', 3))));
        const radius = Math.max(0, this.getParam('radius', 0.9));

        // Initial octahedron vertices and faces
        const V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        // Fixed face winding order to be CCW when viewed from outside
        let faceIndices = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [0, 5, 2], [2, 5, 1], [1, 5, 3], [3, 5, 0]];



        const normalize = (v) => {
            const l = Math.hypot(v[0], v[1], v[2]) || 1.0;
            return [v[0] / l, v[1] / l, v[2] / l];
        }

        const edgeKey = (a, b) => {
            return (a < b) ? `${a}_${b}` : `${b}_${a}`;
        }

        // Dynamic arrays while subdividing
        const vertices = V.map(v => {
            const s = normalize(v);
            return [s[0] * radius, s[1] * radius, s[2] * radius];
        });

        // Subdivision iterations
        for (let it = 0; it < depth; it++) {
            const newFaces = [];
            const midCache = new Map();

            const midpointIndex = (iA, iB) => {
                const key = edgeKey(iA, iB);
                if (midCache.has(key)) return midCache.get(key);

                const A = vertices[iA];
                const B = vertices[iB];
                const m = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5, (A[2] + B[2]) * 0.5];
                const n = normalize(m);
                const idx = vertices.length;
                vertices.push([n[0] * radius, n[1] * radius, n[2] * radius]);
                midCache.set(key, idx);
                return idx;
            };

            for (const f of faceIndices) {
                const [i0, i1, i2] = f;
                const a = midpointIndex(i0, i1);
                const b = midpointIndex(i1, i2);
                const c = midpointIndex(i2, i0);
                newFaces.push([i0, a, c], [a, i1, b], [c, b, i2], [a, b, c]);
            }

            faceIndices = newFaces;
        }

        // Build flat typed arrays
        const posArray = new Float32Array(vertices.length * 3);
        const normalArray = new Float32Array(vertices.length * 3);

        vertices.forEach((v, vi) => {
            posArray[vi * 3] = v[0];
            posArray[vi * 3 + 1] = v[1];
            posArray[vi * 3 + 2] = v[2];
            const n = normalize(v);
            normalArray[vi * 3] = n[0];
            normalArray[vi * 3 + 1] = n[1];
            normalArray[vi * 3 + 2] = n[2];
        });

        const tris = new Uint16Array(faceIndices.length * 3);
        faceIndices.forEach((f, idx) => {
            tris[idx * 3] = f[0];
            tris[idx * 3 + 1] = f[1];
            tris[idx * 3 + 2] = f[2];
        });

        // Unique edges for wireframe
        const edgeSet = new Map();
        const addEdge = (i, j) => {
            const key = edgeKey(i, j);
            if (!edgeSet.has(key)) edgeSet.set(key, [i, j]);
        };

        faceIndices.forEach(f => {
            addEdge(f[0], f[1]);
            addEdge(f[1], f[2]);
            addEdge(f[2], f[0]);
        });

        const lines = new Uint16Array(edgeSet.size * 2);
        let lineIdx = 0;
        edgeSet.forEach(([i, j]) => {
            lines[lineIdx++] = i;
            lines[lineIdx++] = j;
        });

        this.vertices = posArray;
        this.normals = normalArray;
        this.indicesTris = tris;
        this.indicesLines = lines;
    }
}
