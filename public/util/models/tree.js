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

        // Bottom center
        vertices.push(0, bottomY, 0); normals.push(0, -1, 0); colors.push(trunkColor[0], trunkColor[1], trunkColor[2]); const bottomCenter = idx++;
        // Bottom ring
        const bottomRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, bottomY, z);
            normals.push(0, -1, 0);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        // Top ring (side normals approximated)
        const topRingStart = idx;
        for (let i = 0; i < trunkSegments; i++) {
            const th = (i / trunkSegments) * Math.PI * 2;
            const x = Math.cos(th) * trunkRadius;
            const z = Math.sin(th) * trunkRadius;
            vertices.push(x, topY, z);
            normals.push(x / trunkRadius, 0, z / trunkRadius);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            idx++;
        }
        // Top center
        vertices.push(0, topY, 0); normals.push(0, 1, 0); colors.push(trunkColor[0], trunkColor[1], trunkColor[2]); const topCenter = idx++;

        // Bottom cap
        for (let i = 0; i < trunkSegments; i++) {
            const b = bottomRingStart + i;
            const c = bottomRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(bottomCenter, b, c);
        }
        // Sides
        for (let i = 0; i < trunkSegments; i++) {
            const b1 = bottomRingStart + i;
            const b2 = bottomRingStart + ((i + 1) % trunkSegments);
            const t1 = topRingStart + i;
            const t2 = topRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(b1, t1, t2);
            indicesTris.push(b1, t2, b2);
            indicesLines.push(b1, b2);
            indicesLines.push(b1, t1);
        }
        // Top cap
        for (let i = 0; i < trunkSegments; i++) {
            const b = topRingStart + i;
            const c = topRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(topCenter, c, b);
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
