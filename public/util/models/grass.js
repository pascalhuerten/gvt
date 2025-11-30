/**
 * GrassBlade - Generates a multi-segment vertical blade with slight curve.
 * Base vertices lie on the X axis at y=0, tapers toward apex.
 * Multiple horizontal segments create a smooth bend.
 */
class GrassBlade extends VertexDataGenerator {
    constructor({ height = 0.8, width = 0.02, segments = 4 } = {}) {
        super();
        this.params = { height, width, segments };
    }

    createVertexData() {
        const h = this.params.height;
        const w = this.params.width;
        const segments = this.params.segments;
        const verts = [];
        const norms = [];
        const colors = [];
        const tris = [];
        const lines = [];

        // Create stacked segments with taper (no bend)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const y = h * t;
            // Taper width toward tip
            const currentWidth = w * (1.0 - t * 0.9); // Sharper taper for pointier tips

            // Color gradient: lighter at base, even lighter at tip
            const darkGreen = [0.40, 0.70, 0.45];
            const lightGreen = [0.70, 0.95, 0.60];
            const r = darkGreen[0] + (lightGreen[0] - darkGreen[0]) * t;
            const g = darkGreen[1] + (lightGreen[1] - darkGreen[1]) * t;
            const b = darkGreen[2] + (lightGreen[2] - darkGreen[2]) * t;

            // Left and right vertices at this height
            const vIdx = verts.length / 3;
            verts.push(
                -currentWidth / 2, y, 0,
                currentWidth / 2, y, 0
            );

            // All normals point upward for good lighting
            norms.push(
                0, 1, 0,
                0, 1, 0
            );

            // Per-vertex colors
            colors.push(
                r, g, b,
                r, g, b
            );

            // Create triangles (two per segment, except at base)
            if (i > 0) {
                const prevLeft = vIdx - 2;
                const prevRight = vIdx - 1;
                const currLeft = vIdx;
                const currRight = vIdx + 1;

                // Triangle 1: prevLeft, prevRight, currLeft
                tris.push(prevLeft, prevRight, currLeft);
                // Triangle 2: prevRight, currRight, currLeft
                tris.push(prevRight, currRight, currLeft);

                // Lines for wireframe
                lines.push(prevLeft, currLeft, prevRight, currRight);
                if (i === 1) {
                    lines.push(prevLeft, prevRight); // base
                }
            }
        }

        // Top edge line
        const lastLeft = verts.length / 3 - 2;
        const lastRight = verts.length / 3 - 1;
        lines.push(lastLeft, lastRight);

        this.vertices = new Float32Array(verts);
        this.normals = new Float32Array(norms);
        this.colors = new Float32Array(colors);
        this.indicesTris = new Uint16Array(tris);
        this.indicesLines = new Uint16Array(lines);
    }
}

/**
 * GrassPatch - Generates N grass blades merged into one geometry.
 * Each blade has its own triangle; vertex order groups blades sequentially.
 * Normals follow same rule per blade for lighting variation.
 */
class GrassPatch extends VertexDataGenerator {
    constructor({ bladeCount = 20, minHeight = 0.4, maxHeight = 0.9, minWidth = 0.08, maxWidth = 0.16, patchSize = 1.0 } = {}) {
        super();
        this.params = { bladeCount, minHeight, maxHeight, minWidth, maxWidth, patchSize };
    }

    createVertexData() {
        const { bladeCount, minHeight, maxHeight, minWidth, maxWidth, patchSize } = this.params;
        const verts = [];
        const norms = [];
        const colors = [];
        const tris = [];
        const lines = [];
        let index = 0;
        for (let i = 0; i < bladeCount; i++) {
            const h = minHeight + Math.random() * (maxHeight - minHeight);
            const w = minWidth + Math.random() * (maxWidth - minWidth);
            // Random local offset within patch square
            const ox = (Math.random() * 2 - 1) * patchSize * 0.5;
            const oz = (Math.random() * 2 - 1) * patchSize * 0.5;
            // Random rotation for variety
            const angle = Math.random() * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            // Build 3-segment blade with per-vertex colors
            const segments = 3;
            for (let seg = 0; seg <= segments; seg++) {
                const t = seg / segments;
                const y = h * t;
                const currentWidth = w * (1.0 - t * 0.9); // Sharper taper for pointier tips

                // Lighter color gradient
                const darkGreen = [0.30, 0.50, 0.25];
                const lightGreen = [0.50, 0.75, 0.40];
                const r = darkGreen[0] + (lightGreen[0] - darkGreen[0]) * t;
                const g = darkGreen[1] + (lightGreen[1] - darkGreen[1]) * t;
                const b = darkGreen[2] + (lightGreen[2] - darkGreen[2]) * t;

                // Rotate blade around Y axis
                const leftX = -currentWidth / 2;
                const rightX = currentWidth / 2;
                const rotLeftX = leftX * cos - 0 * sin;
                const rotLeftZ = leftX * sin + 0 * cos;
                const rotRightX = rightX * cos - 0 * sin;
                const rotRightZ = rightX * sin + 0 * cos;

                verts.push(
                    ox + rotLeftX, y, oz + rotLeftZ,
                    ox + rotRightX, y, oz + rotRightZ
                );
                norms.push(
                    0, 1, 0,
                    0, 1, 0
                );
                colors.push(
                    r, g, b,
                    r, g, b
                );

                if (seg > 0) {
                    const prevLeft = index - 2;
                    const prevRight = index - 1;
                    const currLeft = index;
                    const currRight = index + 1;
                    tris.push(prevLeft, prevRight, currLeft);
                    tris.push(prevRight, currRight, currLeft);
                    lines.push(prevLeft, currLeft, prevRight, currRight);
                }
                index += 2;
            }
        }
        this.vertices = new Float32Array(verts);
        this.normals = new Float32Array(norms);
        this.colors = new Float32Array(colors);
        this.indicesTris = new Uint16Array(tris);
        this.indicesLines = new Uint16Array(lines);
    }
}
