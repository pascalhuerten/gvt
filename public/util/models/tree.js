/**
 * Tree generator - cylinder trunk + single sphere foliage.
 */
class Tree extends VertexDataGenerator {
    createVertexData() {
        const trunkRadius = this.getParam('trunkRadius', 0.12);
        const trunkHeight = this.getParam('trunkHeight', 0.6);
        const trunkSegments = Math.max(6, Math.floor(this.getParam('trunkSegments', 16)));
        const foliageRadius = this.getParam('foliageRadius', 0.5);
        const foliageDepth = Math.max(1, Math.min(6, Math.floor(this.getParam('foliageDepth', 2))));
        const foliageYOffset = this.getParam('foliageYOffset', trunkHeight * 0.35);
        const trunkColor = this.getParam('trunkColor', [0.58, 0.44, 0.34]); // brown
        const foliageColor = this.getParam('foliageColor', [0.35, 0.65, 0.18]); // green

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];
        const colors = [];
        let idx = 0;

        // Cylinder trunk similar to Pine trunk
        const bottomY = -trunkHeight * 0.5;
        const topY = trunkHeight * 0.5;

        // Create separate geometry for caps and sides so normals are correct
        // Bottom center (cap)
        vertices.push(0, bottomY, 0); normals.push(0, -1, 0); colors.push(trunkColor[0], trunkColor[1], trunkColor[2]); const bottomCenter = idx++;
        // Bottom cap ring (vertical -Y normals)
        const bottomCapRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, bottomY, z);
            normals.push(0, -1, 0);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        // Top center (cap)
        vertices.push(0, topY, 0); normals.push(0, 1, 0); colors.push(trunkColor[0], trunkColor[1], trunkColor[2]); const topCenter = idx++;
        // Top cap ring (vertical +Y normals)
        const topCapRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, topY, z);
            normals.push(0, 1, 0);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        // Bottom cap triangles
        for (let i = 0; i < trunkSegments; i++) {
            const b = bottomCapRingStart + i;
            const c = bottomCapRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(bottomCenter, b, c);
        }
        // Top cap triangles
        for (let i = 0; i < trunkSegments; i++) {
            const b = topCapRingStart + i;
            const c = topCapRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(topCenter, c, b);
        }

        // Side rings with radial normals (use separate vertices from caps)
        const sideBottomRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, bottomY, z);
            // radial normal
            const nx = x / trunkRadius;
            const nz = z / trunkRadius;
            normals.push(nx, 0, nz);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        const sideTopRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, topY, z);
            const nx = x / trunkRadius;
            const nz = z / trunkRadius;
            normals.push(nx, 0, nz);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        // Side quads (two triangles per segment)
        for (let i = 0; i < trunkSegments; i++) {
            const b1 = sideBottomRingStart + i;
            const b2 = sideBottomRingStart + ((i + 1) % trunkSegments);
            const t1 = sideTopRingStart + i;
            const t2 = sideTopRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(b1, t1, t2);
            indicesTris.push(b1, t2, b2);
            // wireframe indices
            indicesLines.push(b1, b2);
            indicesLines.push(b1, t1);
        }

        // Foliage sphere: use existing Sphere generator
        const sphereGen = new Sphere({ depth: foliageDepth, radius: foliageRadius });
        sphereGen.createVertexData();
        const sVerts = sphereGen.vertices;
        const sNormals = sphereGen.normals;
        const sTris = sphereGen.indicesTris;
        const sLines = sphereGen.indicesLines;

        const sphereOffset = idx;
        // Translate foliage upward relative to trunk top
        const translateY = topY + foliageYOffset;
        for (let i = 0; i < sVerts.length; i += 3) {
            vertices.push(sVerts[i], sVerts[i + 1] + translateY, sVerts[i + 2]);
            normals.push(sNormals[i], sNormals[i + 1], sNormals[i + 2]);
            colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
            idx++;
        }
        for (let i = 0; i < sTris.length; i += 3) {
            indicesTris.push(sphereOffset + sTris[i], sphereOffset + sTris[i + 1], sphereOffset + sTris[i + 2]);
        }
        for (let i = 0; i < sLines.length; i += 2) {
            indicesLines.push(sphereOffset + sLines[i], sphereOffset + sLines[i + 1]);
        }

        // Lift entire tree so trunk base sits at y = 0 (was centered previously)
        const lift = trunkHeight * 0.5;
        for (let i = 1; i < vertices.length; i += 3) {
            vertices[i] += lift;
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
        // Optional per-vertex colors for trunk vs foliage
        this.colors = new Float32Array(colors);
    }
}
