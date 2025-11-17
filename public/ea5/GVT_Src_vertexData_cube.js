var cube = (function () {
    function lerp(a, b, t) {
        return [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
            a[2] + (b[2] - a[2]) * t
        ];
    }

    function createVertexData() {
        // allow params: size (edge length), depth (subdivision level)
        var size = (this.size !== undefined) ? this.size : (this.params && this.params.size !== undefined) ? this.params.size : 1.0;
        var depth = (this.depth !== undefined) ? this.depth : (this.params && this.params.depth !== undefined) ? this.params.depth : 0;
        // allow inward: boolean to flip faces/normals so cube can be used as room walls
        var inward = (this.inward !== undefined) ? this.inward : (this.params && this.params.inward !== undefined) ? this.params.inward : false;
        size = parseFloat(size) || 1.0;
        depth = Math.max(0, Math.min(4, parseInt(depth, 10) || 0)); // clamp to [0,4]

        var hs = size * 0.5;

        // Define 6 cube faces with proper winding order (CCW when viewed from outside)
        var cubeFaces = [
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

        var vertices = [];
        var triangles = [];
        var edges = [];

        // For each face, create subdivided triangles
        for (var f = 0; f < cubeFaces.length; f++) {
            var face = cubeFaces[f];
            var subdividedTris = subdivideFace(face.corners, depth);

            for (var t = 0; t < subdividedTris.length; t++) {
                var tri = subdividedTris[t];
                var baseIdx = vertices.length;

                // decide normal direction per-vertex (flip if inward)
                var fn = face.normal;
                if (inward) fn = [-fn[0], -fn[1], -fn[2]];
                for (var v = 0; v < 3; v++) {
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
        var posArray = new Float32Array(vertices.length * 3);
        var normalArray = new Float32Array(vertices.length * 3);
        for (var i = 0; i < vertices.length; i++) {
            var v = vertices[i];
            posArray[i * 3 + 0] = v.position[0];
            posArray[i * 3 + 1] = v.position[1];
            posArray[i * 3 + 2] = v.position[2];
            normalArray[i * 3 + 0] = v.normal[0];
            normalArray[i * 3 + 1] = v.normal[1];
            normalArray[i * 3 + 2] = v.normal[2];
        }

        var tris = new Uint16Array(triangles.length * 3);
        for (var t = 0; t < triangles.length; t++) {
            tris[t * 3 + 0] = triangles[t][0];
            tris[t * 3 + 1] = triangles[t][1];
            tris[t * 3 + 2] = triangles[t][2];
        }

        // Remove duplicate edges for wireframe
        var edgeSet = Object.create(null);
        function addEdge(i, j) {
            var key = (i < j) ? (i + '_' + j) : (j + '_' + i);
            if (!edgeSet[key]) edgeSet[key] = [i, j];
        }
        for (var e = 0; e < edges.length; e++) {
            addEdge(edges[e][0], edges[e][1]);
        }
        var uniqueEdges = Object.keys(edgeSet).map(function (k) { return edgeSet[k]; });
        var lines = new Uint16Array(uniqueEdges.length * 2);
        for (var e = 0; e < uniqueEdges.length; e++) {
            lines[e * 2 + 0] = uniqueEdges[e][0];
            lines[e * 2 + 1] = uniqueEdges[e][1];
        }

        // attach to model
        this.vertices = posArray;
        this.normals = normalArray;
        this.indicesTris = tris;
        this.indicesLines = lines;
    }

    function subdivideFace(corners, depth) {
        // Start with the face as two triangles
        var triangles = [
            [corners[0], corners[1], corners[2]],
            [corners[0], corners[2], corners[3]]
        ];

        // Subdivide each triangle
        for (var d = 0; d < depth; d++) {
            var newTriangles = [];
            for (var t = 0; t < triangles.length; t++) {
                var tri = triangles[t];
                var subdiv = subdivideTriangle(tri);
                newTriangles = newTriangles.concat(subdiv);
            }
            triangles = newTriangles;
        }

        return triangles;
    }

    function subdivideTriangle(tri) {
        var a = tri[0], b = tri[1], c = tri[2];
        var ab = lerp(a, b, 0.5);
        var bc = lerp(b, c, 0.5);
        var ca = lerp(c, a, 0.5);

        return [
            [a, ab, ca],
            [ab, b, bc],
            [ca, bc, c],
            [ab, bc, ca]
        ];
    }

    return {
        createVertexData: createVertexData
    };

}());
