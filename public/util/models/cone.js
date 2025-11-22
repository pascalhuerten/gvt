/**
 * Cone generator - creates a cone with apex, base disk, and side triangles.
 */
class Cone extends VertexDataGenerator {

    createVertexData() {
        const radius = this.getParam('radius', 0.5);
        const height = this.getParam('height', 1.0);
        const radialSegments = Math.max(3, Math.floor(this.getParam('radialSegments', 24)));

        const vertices = [];
        const normals = [];
        const indicesTris = [];
        const indicesLines = [];

        // Apex vertex (index 0)
        vertices.push(0, height * 0.5, 0);
        normals.push(0, 1, 0);

        // Base center vertex (index 1)
        vertices.push(0, -height * 0.5, 0);
        normals.push(0, -1, 0);

        // Base ring vertices start at indexOffset
        const indexOffset = 2;
        for (let i = 0; i < radialSegments; i++) {
            const theta = (i / radialSegments) * Math.PI * 2.0;
            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;
            vertices.push(x, -height * 0.5, z);

            // Normal for smooth sides: slanted normal (approx)
            const sideNormalY = radius / Math.sqrt(radius * radius + height * height);
            const sideNormalXZ = height / Math.sqrt(radius * radius + height * height);
            normals.push(
                (x * sideNormalXZ) / radius,
                sideNormalY,
                (z * sideNormalXZ) / radius
            );
        }

        // Indices for side triangles (ensure outward-facing winding)
        for (let i = 0; i < radialSegments; i++) {
            const a = 0; // apex
            const b = indexOffset + i;
            const c = indexOffset + ((i + 1) % radialSegments);
            // Swap b/c so triangle is wound counter-clockwise when viewed from outside
            indicesTris.push(a, c, b);
            // Lines along edges
            indicesLines.push(b, c);
            indicesLines.push(a, b);
        }

        // Base disk triangles (fan around center index 1)
        for (let i = 0; i < radialSegments; i++) {
            const center = 1;
            const b = indexOffset + ((i + 1) % radialSegments);
            const c = indexOffset + i;
            // Wind so the base normal points down (outward)
            indicesTris.push(center, c, b);
            // Base rim lines
            indicesLines.push(center, b);
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }
}