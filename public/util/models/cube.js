/**
 * Cube generator - creates a cube with optional subdivision and inward option.
 */
class Cube extends VertexDataGenerator {

    createVertexData() {
        let size = this.getParam('size', 1.0);
        let depth = this.getParam('depth', 0);
        const inward = this.getParam('inward', false);

        size = parseFloat(size) || 1.0;
        depth = Math.max(0, Math.min(4, Math.floor(depth) || 0));

        const hs = size * 0.5;

        // Helper functions for subdivision
        const lerp = (a, b, t) => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];

        const subdivideTriangle = (tri) => {
            const a = tri[0], b = tri[1], c = tri[2];
            const ab = lerp(a, b, 0.5);
            const bc = lerp(b, c, 0.5);
            const ca = lerp(c, a, 0.5);
            return [
                [a, ab, ca],
                [ab, b, bc],
                [ca, bc, c],
                [ab, bc, ca]
            ];
        };

        const subdivideFace = (corners, d) => {
            let triangles = [
                [corners[0], corners[1], corners[2]],
                [corners[0], corners[2], corners[3]]
            ];
            for (let i = 0; i < d; i++) {
                const newTriangles = [];
                for (const tri of triangles) {
                    newTriangles.push(...subdivideTriangle(tri));
                }
                triangles = newTriangles;
            }
            return triangles;
        };

        // Define 6 cube faces with proper winding order (CCW when viewed from outside)
        const cubeFaces = [
            // back face (-z): looking from outside (positive z), vertices should be CCW
            { corners: [[-hs, -hs, -hs], [-hs, hs, -hs], [hs, hs, -hs], [hs, -hs, -hs]], normal: [0, 0, -1] },
            // front face (+z)
            { corners: [[hs, -hs, hs], [hs, hs, hs], [-hs, hs, hs], [-hs, -hs, hs]], normal: [0, 0, 1] },
            // left face (-x)
            { corners: [[-hs, -hs, hs], [-hs, hs, hs], [-hs, hs, -hs], [-hs, -hs, -hs]], normal: [-1, 0, 0] },
            // right face (+x)
            { corners: [[hs, -hs, -hs], [hs, hs, -hs], [hs, hs, hs], [hs, -hs, hs]], normal: [1, 0, 0] },
            // bottom face (-y)
            { corners: [[-hs, -hs, -hs], [hs, -hs, -hs], [hs, -hs, hs], [-hs, -hs, hs]], normal: [0, -1, 0] },
            // top face (+y)
            { corners: [[-hs, hs, hs], [hs, hs, hs], [hs, hs, -hs], [-hs, hs, -hs]], normal: [0, 1, 0] }
        ];

        const vertices = [];
        const triangles = [];
        const edges = [];

        // For each face, create subdivided triangles
        for (const face of cubeFaces) {
            const subdividedTris = subdivideFace(face.corners, depth);

            for (const tri of subdividedTris) {
                const baseIdx = vertices.length;

                // Decide normal direction per-vertex (flip if inward)
                let fn = [...face.normal];
                if (inward) {
                    fn = [-fn[0], -fn[1], -fn[2]];
                }

                for (let v = 0; v < 3; v++) {
                    vertices.push({
                        position: tri[v],
                        normal: fn
                    });
                }

                // Add triangle indices (reverse winding when inward so front faces point inside)
                if (inward) {
                    triangles.push([baseIdx, baseIdx + 2, baseIdx + 1]);
                } else {
                    triangles.push([baseIdx, baseIdx + 1, baseIdx + 2]);
                }

                // Add edges
                edges.push([baseIdx, baseIdx + 1]);
                edges.push([baseIdx + 1, baseIdx + 2]);
                edges.push([baseIdx + 2, baseIdx]);
            }
        }

        // Build typed arrays
        const posArray = new Float32Array(vertices.length * 3);
        const normalArray = new Float32Array(vertices.length * 3);
        vertices.forEach((v, i) => {
            posArray[i * 3] = v.position[0];
            posArray[i * 3 + 1] = v.position[1];
            posArray[i * 3 + 2] = v.position[2];
            normalArray[i * 3] = v.normal[0];
            normalArray[i * 3 + 1] = v.normal[1];
            normalArray[i * 3 + 2] = v.normal[2];
        });

        const tris = new Uint16Array(triangles.length * 3);
        triangles.forEach((t, idx) => {
            tris[idx * 3] = t[0];
            tris[idx * 3 + 1] = t[1];
            tris[idx * 3 + 2] = t[2];
        });

        // Remove duplicate edges for wireframe
        const edgeSet = new Map();
        const addEdge = (i, j) => {
            const key = (i < j) ? `${i}_${j}` : `${j}_${i}`;
            if (!edgeSet.has(key)) {
                edgeSet.set(key, [i, j]);
            }
        };

        edges.forEach(([i, j]) => addEdge(i, j));

        const uniqueEdges = Array.from(edgeSet.values());
        const lines = new Uint16Array(uniqueEdges.length * 2);
        uniqueEdges.forEach((edge, idx) => {
            lines[idx * 2] = edge[0];
            lines[idx * 2 + 1] = edge[1];
        });

        this.vertices = posArray;
        this.normals = normalArray;
        this.indicesTris = tris;
        this.indicesLines = lines;
    }
}