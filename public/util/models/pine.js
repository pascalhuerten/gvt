/**
 * Pine tree generator - creates a pine tree with a cylindrical trunk
 * and three stacked cones for the foliage.
 */
class Pine extends VertexDataGenerator {

    createVertexData() {
        // Tree parameters
        const trunkRadius = this.getParam('trunkRadius', 0.1);
        const trunkHeight = this.getParam('trunkHeight', 0.3);
        const trunkSegments = Math.max(6, Math.floor(this.getParam('trunkSegments', 12)));
        const trunkColor = this.getParam('trunkColor', [0.50, 0.38, 0.28]);

        // Three cone layers for foliage
        const cone1Radius = this.getParam('cone1Radius', 0.5);
        const cone1Height = this.getParam('cone1Height', 0.6);

        const cone2Radius = this.getParam('cone2Radius', 0.4);
        const cone2Height = this.getParam('cone2Height', 0.5);

        const cone3Radius = this.getParam('cone3Radius', 0.3);
        const cone3Height = this.getParam('cone3Height', 0.4);

        const coneSegments = Math.max(8, Math.floor(this.getParam('coneSegments', 16)));

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];
        const colors = [];

        let vertexIndex = 0;

        // ===== TRUNK (Cylinder) =====
        const trunkBottom = -trunkHeight * 0.5;
        const trunkTop = trunkHeight * 0.5;

        // Bottom cap center
        vertices.push(0, trunkBottom, 0);
        normals.push(0, -1, 0);
        colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
        const trunkBottomCenterIdx = vertexIndex++;

        // Bottom cap ring
        const trunkBottomRingStart = vertexIndex;
        for (let i = 0; i < trunkSegments; i++) {
            const theta = (i / trunkSegments) * Math.PI * 2.0;
            const x = Math.cos(theta) * trunkRadius;
            const z = Math.sin(theta) * trunkRadius;
            vertices.push(x, trunkBottom, z);
            normals.push(0, -1, 0);
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            vertexIndex++;
        }

        // Top cap ring
        const trunkTopRingStart = vertexIndex;
        for (let i = 0; i < trunkSegments; i++) {
            const theta = (i / trunkSegments) * Math.PI * 2.0;
            const x = Math.cos(theta) * trunkRadius;
            const z = Math.sin(theta) * trunkRadius;
            vertices.push(x, trunkTop, z);
            normals.push(x / trunkRadius, 0, z / trunkRadius); // Side normal
            colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
            vertexIndex++;
        }

        // Top cap center
        vertices.push(0, trunkTop, 0);
        normals.push(0, 1, 0);
        colors.push(trunkColor[0], trunkColor[1], trunkColor[2]);
        const trunkTopCenterIdx = vertexIndex++;

        // Trunk bottom cap triangles
        for (let i = 0; i < trunkSegments; i++) {
            const a = trunkBottomCenterIdx;
            const b = trunkBottomRingStart + i;
            const c = trunkBottomRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(a, b, c);
        }

        // Trunk side triangles
        for (let i = 0; i < trunkSegments; i++) {
            const b1 = trunkBottomRingStart + i;
            const b2 = trunkBottomRingStart + ((i + 1) % trunkSegments);
            const t1 = trunkTopRingStart + i;
            const t2 = trunkTopRingStart + ((i + 1) % trunkSegments);

            indicesTris.push(b1, t1, t2);
            indicesTris.push(b1, t2, b2);

            indicesLines.push(b1, b2);
            indicesLines.push(b1, t1);
        }

        // Trunk top cap triangles
        for (let i = 0; i < trunkSegments; i++) {
            const a = trunkTopCenterIdx;
            const b = trunkTopRingStart + i;
            const c = trunkTopRingStart + ((i + 1) % trunkSegments);
            indicesTris.push(a, c, b);
        }

        // ===== HELPER: Add a cone at given Y position =====
        const addCone = (baseY, radius, height, foliageColor) => {
            const apexY = baseY + height;

            // Base center for base disk
            vertices.push(0, baseY, 0);
            normals.push(0, -1, 0);
            colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
            const baseCenterIdx = vertexIndex++;

            // Create base ring vertices for base disk (with downward normals)
            const baseRingStart = vertexIndex;
            for (let i = 0; i < coneSegments; i++) {
                const theta = (i / coneSegments) * Math.PI * 2.0;
                const x = Math.cos(theta) * radius;
                const z = Math.sin(theta) * radius;
                vertices.push(x, baseY, z);
                normals.push(0, -1, 0); // Base disk normal points down
                colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
                vertexIndex++;
            }

            // Cone base disk triangles
            for (let i = 0; i < coneSegments; i++) {
                const b = baseRingStart + ((i + 1) % coneSegments);
                const c = baseRingStart + i;
                indicesTris.push(baseCenterIdx, c, b);
                indicesLines.push(baseCenterIdx, b);
            }

            // Create separate vertices for each side triangle
            const sideNormalY = radius / Math.sqrt(radius * radius + height * height);
            const sideNormalXZ = height / Math.sqrt(radius * radius + height * height);

            for (let i = 0; i < coneSegments; i++) {
                const theta1 = (i / coneSegments) * Math.PI * 2.0;
                const theta2 = ((i + 1) / coneSegments) * Math.PI * 2.0;

                const x1 = Math.cos(theta1) * radius;
                const z1 = Math.sin(theta1) * radius;
                const x2 = Math.cos(theta2) * radius;
                const z2 = Math.sin(theta2) * radius;

                // Calculate normal for apex vertex (pointing outward from cone axis)
                const apexNormalX = 0;
                const apexNormalY = sideNormalY;
                const apexNormalZ = 0;

                // Add apex vertex for this triangle
                vertices.push(0, apexY, 0);
                normals.push(apexNormalX, apexNormalY, apexNormalZ);
                colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
                const apex = vertexIndex++;

                // Add base vertices for this triangle with their smooth normals
                vertices.push(x2, baseY, z2);
                normals.push(
                    (x2 * sideNormalXZ) / radius,
                    sideNormalY,
                    (z2 * sideNormalXZ) / radius
                );
                colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
                const b1 = vertexIndex++;

                vertices.push(x1, baseY, z1);
                normals.push(
                    (x1 * sideNormalXZ) / radius,
                    sideNormalY,
                    (z1 * sideNormalXZ) / radius
                );
                colors.push(foliageColor[0], foliageColor[1], foliageColor[2]);
                const b2 = vertexIndex++;

                // Triangle indices
                indicesTris.push(apex, b1, b2);

                // Lines for wireframe
                indicesLines.push(b2, b1);
                indicesLines.push(apex, b2);
            }
        };

        // Position the three cones above the trunk
        // Cone 1 (bottom layer) starts just above trunk top
        const cone1BaseY = trunkTop;
        const foliageColor = this.getParam('foliageColor', [0.20, 0.60, 0.28]);
        addCone(cone1BaseY, cone1Radius, cone1Height, foliageColor);

        // Cone 2 (middle layer) overlaps slightly with cone 1
        const cone2BaseY = cone1BaseY + cone1Height * 0.6;
        addCone(cone2BaseY, cone2Radius, cone2Height, foliageColor);

        // Cone 3 (top layer) overlaps slightly with cone 2
        const cone3BaseY = cone2BaseY + cone2Height * 0.6;
        addCone(cone3BaseY, cone3Radius, cone3Height, foliageColor);

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
        this.colors = new Float32Array(colors);
    }
}
