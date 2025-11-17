var cone = (function () {

    function createVertexData() {
        var radius = (this.radius !== undefined) ? this.radius : (this.params && this.params.radius) || 0.5;
        var height = (this.height !== undefined) ? this.height : (this.params && this.params.height) || 1.0;
        var radialSegments = (this.radialSegments !== undefined) ? this.radialSegments : (this.params && this.params.radialSegments) || 24;

        var vertices = [];
        var normals = [];
        var indicesTris = [];
        var indicesLines = [];

        // Apex vertex (index 0)
        vertices.push(0, height * 0.5, 0);
        // temporary normal for apex: point roughly up
        normals.push(0, 1, 0);

        // Base center vertex (index 1)
        vertices.push(0, -height * 0.5, 0);
        normals.push(0, -1, 0);

        // base ring vertices start at indexOffset
        var indexOffset = 2;
        for (var i = 0; i < radialSegments; i++) {
            var theta = i / radialSegments * Math.PI * 2.0;
            var x = Math.cos(theta) * radius;
            var z = Math.sin(theta) * radius;
            vertices.push(x, -height * 0.5, z);
            // normal for smooth sides: slanted normal (approx)
            var sideNormalY = radius / Math.sqrt(radius * radius + height * height);
            var sideNormalXZ = height / Math.sqrt(radius * radius + height * height);
            normals.push(x * sideNormalXZ / radius, sideNormalY, z * sideNormalXZ / radius);
        }

        // Indices for side triangles (ensure outward-facing winding)
        for (var i = 0; i < radialSegments; i++) {
            var a = 0; // apex
            var b = indexOffset + i;
            var c = indexOffset + ((i + 1) % radialSegments);
            // swap b/c so triangle is wound counter-clockwise when viewed from outside
            indicesTris.push(a, c, b);
            // lines along edges
            indicesLines.push(b, c);
            indicesLines.push(a, b);
        }

        // Base disk triangles (fan around center index 1)
        for (var i = 0; i < radialSegments; i++) {
            var center = 1;
            var b = indexOffset + ((i + 1) % radialSegments);
            var c = indexOffset + i;
            // wind so the base normal points down (outward)
            indicesTris.push(center, c, b);
            // base rim lines
            indicesLines.push(center, b);
        }

        // Convert to typed arrays
        this.vertices = new Float32Array(vertices);
        this.normals = new Float32Array(normals);
        this.indicesTris = new Uint16Array(indicesTris);
        this.indicesLines = new Uint16Array(indicesLines);
    }

    return {
        createVertexData: createVertexData
    }

}());
