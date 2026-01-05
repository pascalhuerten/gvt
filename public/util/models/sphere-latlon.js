/**
 * Sphere generator - creates a sphere using a lat/lon grid.
 * This approach naturally maps to rectangular textures without seam issues.
 * Generates vertices on a regular grid of latitude and longitude lines.
 */
class SphereLatLon extends VertexDataGenerator {

    createVertexData() {
        // Get parameters
        const radius = Math.max(0, this.getParam('radius', 0.9));
        // latSegments = number of subdivisions along latitude (vertical)
        // lonSegments = number of subdivisions along longitude (horizontal)
        const latSegments = Math.max(3, Math.floor(this.getParam('latSegments', 32)));
        const lonSegments = Math.max(3, Math.floor(this.getParam('lonSegments', 64)));

        const vertices = [];
        const normals = [];
        const textureCoords = [];
        const indicesTris = [];
        const indicesLines = [];

        // Generate vertices on a lat/lon grid
        // v (latitude) goes from 0 (top/north pole) to π (bottom/south pole)
        // u (longitude) goes from 0 to 2π
        for (let latIdx = 0; latIdx <= latSegments; latIdx++) {
            const v = (latIdx / latSegments) * Math.PI;  // latitude angle [0, π]
            const sinV = Math.sin(v);
            const cosV = Math.cos(v);

            for (let lonIdx = 0; lonIdx <= lonSegments; lonIdx++) {
                const u = (lonIdx / lonSegments) * 2 * Math.PI;  // longitude angle [0, 2π]
                const sinU = Math.sin(u);
                const cosU = Math.cos(u);

                // Position on unit sphere, then scale by radius
                const x = cosU * sinV * radius;
                const y = cosV * radius;
                const z = sinU * sinV * radius;

                vertices.push(x, y, z);

                // Normal is same as position direction for unit sphere
                const nx = cosU * sinV;
                const ny = cosV;
                const nz = sinU * sinV;
                normals.push(nx, ny, nz);

                // Texture coordinates directly from parametric angles
                // s (u) in [0, 1], t (v) in [0, 1]
                // Flip s horizontally to correct for inverted triangle winding
                const s = 1.0 - (lonIdx / lonSegments);
                const t = latIdx / latSegments;
                textureCoords.push(s, t);
            }
        }

        // Generate triangle indices
        for (let latIdx = 0; latIdx < latSegments; latIdx++) {
            for (let lonIdx = 0; lonIdx < lonSegments; lonIdx++) {
                // Current quad corners
                const a = latIdx * (lonSegments + 1) + lonIdx;
                const b = latIdx * (lonSegments + 1) + (lonIdx + 1);
                const c = (latIdx + 1) * (lonSegments + 1) + lonIdx;
                const d = (latIdx + 1) * (lonSegments + 1) + (lonIdx + 1);

                // Two triangles per quad (CCW winding from outside)
                indicesTris.push(a, b, c);  // First triangle (inverted)
                indicesTris.push(b, d, c);  // Second triangle (inverted)

                // Lines for wireframe
                // Latitude lines (horizontal)
                if (lonIdx < lonSegments) {
                    indicesLines.push(a, b);
                    indicesLines.push(c, d);
                }
                // Longitude lines (vertical)
                if (latIdx < latSegments) {
                    indicesLines.push(a, c);
                    indicesLines.push(b, d);
                }
            }
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.textureCoord = new Float32Array(textureCoords);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }
}
