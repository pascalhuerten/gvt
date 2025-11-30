/**
 * Skydome generator - creates a hemisphere (or full sphere) with vertical gradient colors.
 */
class Skydome extends VertexDataGenerator {
    createVertexData() {
        const radius = this.getParam('radius', 50.0);
        const stacks = Math.max(4, Math.floor(this.getParam('stacks', 16)));
        const slices = Math.max(8, Math.floor(this.getParam('slices', 32)));
        const fullSphere = !!this.getParam('fullSphere', false);
        const horizonColor = this.getParam('horizonColor', [0.75, 0.93, 0.99]);
        const zenithColor = this.getParam('zenithColor', [0.25, 0.60, 0.95]);

        const vertices = [];
        const normals = [];
        const colors = [];
        const indicesTris = [];
        const indicesLines = [];

        // Latitude from 0 (horizon) to pi/2 (zenith) for hemisphere
        const phiMax = fullSphere ? Math.PI : Math.PI / 2;
        for (let i = 0; i <= stacks; i++) {
            const phi = (i / stacks) * phiMax; // vertical angle
            const y = radius * Math.cos(phi); // y up
            const ringR = radius * Math.sin(phi);
            for (let j = 0; j <= slices; j++) {
                const theta = (j / slices) * Math.PI * 2;
                const x = ringR * Math.cos(theta);
                const z = ringR * Math.sin(theta);
                vertices.push(x, y, z);
                // Outward normal
                const nx = x / radius;
                const ny = y / radius;
                const nz = z / radius;
                normals.push(nx, ny, nz);
                // Gradient: blend horizon to zenith based on y (normalize y to 0..1)
                const t = clamp01((ny + 0.05) / 1.05); // small offset for horizon lift
                const r = horizonColor[0] * (1.0 - t) + zenithColor[0] * t;
                const g = horizonColor[1] * (1.0 - t) + zenithColor[1] * t;
                const b = horizonColor[2] * (1.0 - t) + zenithColor[2] * t;
                colors.push(r, g, b);
            }
        }

        // Indices
        const stride = slices + 1;
        for (let i = 0; i < stacks; i++) {
            for (let j = 0; j < slices; j++) {
                const a = i * stride + j;
                const b = a + 1;
                const c = a + stride;
                const d = c + 1;
                // Two tris per quad
                indicesTris.push(a, c, d);
                indicesTris.push(a, d, b);
                // Lines for wireframe
                indicesLines.push(a, c);
                indicesLines.push(a, b);
            }
        }

        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.colors = new Float32Array(colors);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
        this.radius = radius;
    }
}

function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }