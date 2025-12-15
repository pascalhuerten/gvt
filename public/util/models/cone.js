/**
 * Cone generator - creates a cone with apex, base disk, and side triangles.
 */
class Cone extends VertexDataGenerator {

    createVertexData() {
        const radius = this.getParam('radius', 0.5);
        const height = this.getParam('height', 1.0);
        const radialSegments = Math.max(3, Math.floor(this.getParam('radialSegments', 24)));
        const heightSegments = Math.max(1, Math.floor(this.getParam('heightSegments', 4)));

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];

        // Apex vertex (index 0)
        vertices.push(0, height * 0.5, 0);
        normals.push(0, 1, 0);

        // Side vertices: für jedes heightSegment und radialSegment
        // Height rings von apex (y=height/2) bis base (y=-height/2)
        let vertexIndex = 1;
        const heightRings = []; // Array zur Speicherung der Indices für jede Height-Ebene

        for (let h = 0; h <= heightSegments; h++) {
            const t = h / heightSegments; // 0 (apex) bis 1 (base)
            const y = height * 0.5 - t * height;
            const currentRadius = radius * t; // Radius verjüngt sich vom Apex zur Base

            const ringIndices = [];
            for (let i = 0; i < radialSegments; i++) {
                const theta = (i / radialSegments) * Math.PI * 2.0;
                const x = Math.cos(theta) * currentRadius;
                const z = Math.sin(theta) * currentRadius;

                vertices.push(x, y, z);

                // Normal für die Seitenflächen (zeigt nach außen)
                const sideNormalY = -radius / Math.sqrt(radius * radius + height * height);
                const sideNormalXZ = height / Math.sqrt(radius * radius + height * height);

                if (currentRadius > 0.0001) {
                    normals.push(
                        (Math.cos(theta) * sideNormalXZ),
                        sideNormalY,
                        (Math.sin(theta) * sideNormalXZ)
                    );
                } else {
                    // Apex-Umgebung
                    normals.push(0, -1, 0);
                }

                ringIndices.push(vertexIndex);
                vertexIndex++;
            }
            heightRings.push(ringIndices);
        }

        // Side triangles verbinden benachbarte Höhen-Ringe
        for (let h = 0; h < heightSegments; h++) {
            const ring1 = heightRings[h];
            const ring2 = heightRings[h + 1];

            for (let i = 0; i < radialSegments; i++) {
                const next_i = (i + 1) % radialSegments;

                const a = ring1[i];
                const b = ring1[next_i];
                const c = ring2[i];
                const d = ring2[next_i];

                // Zwei Dreiecke für jedes Segment (umgekehrte Winding Order)
                indicesTris.push(a, b, c);
                indicesTris.push(b, d, c);

                // Lines
                indicesLines.push(a, b);
                indicesLines.push(c, d);
                indicesLines.push(a, c);
            }
        }

        // Base center vertex (separate Vertices für Bodennormale)
        const baseCenter = vertexIndex++;
        vertices.push(0, -height * 0.5, 0);
        normals.push(0, -1, 0);

        // Base ring vertices (separate Kopien für unterschiedliche Normalen)
        const baseRingIndices = [];
        const baseRing = heightRings[heightSegments];
        for (let i = 0; i < radialSegments; i++) {
            const theta = (i / radialSegments) * Math.PI * 2.0;
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;

            vertices.push(x, -height * 0.5, z);
            normals.push(0, -1, 0); // Normalen zeigen nach unten (für den Boden)

            baseRingIndices.push(vertexIndex);
            vertexIndex++;
        }

        // Base disk triangles (fan around center)
        for (let i = 0; i < radialSegments; i++) {
            const b = baseRingIndices[(i + 1) % radialSegments];
            const c = baseRingIndices[i];
            // Wind so the base normal points down (outward)
            indicesTris.push(baseCenter, b, c);
            // Base rim lines
            indicesLines.push(baseCenter, b);
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }
}