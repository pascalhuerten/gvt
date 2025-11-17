// Attribution: Sphere subdivision algorithm adapted from Paul Bourke(C reference)
// See: https://paulbourke.net/geometry/circlesphere/csource3.c
var sphere = (function () {

    function normalize(v) {
        var l = Math.hypot(v[0], v[1], v[2]) || 1.0;
        return [v[0] / l, v[1] / l, v[2] / l];
    }

    function createVertexData() {
        // `this` is the model object. Allow radius/depth on model or defaults.
        var depth = (this.depth !== undefined) ? this.depth : (this.params && this.params.depth !== undefined) ? this.params.depth : 3;
        var radius = (this.radius !== undefined) ? this.radius : (this.params && this.params.radius !== undefined) ? this.params.radius : 0.9;

        // clamp depth to [0,6]
        depth = Math.max(0, Math.min(6, parseInt(depth, 10) || 0));

        // initial octahedron vertices and faces
        var V = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        // Fixed face winding order to be CCW when viewed from outside
        var faces = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [0, 5, 2], [2, 5, 1], [1, 5, 3], [3, 5, 0]];

        // dynamic arrays while subdividing
        var vertices = [];
        for (var i = 0; i < V.length; i++) {
            var s = normalize(V[i]);
            vertices.push([s[0] * radius, s[1] * radius, s[2] * radius]);
        }

        var faceIndices = faces.map(function (f) { return f.slice(); });

        function edgeKey(a, b) { return (a < b) ? (a + '_' + b) : (b + '_' + a); }

        for (var it = 0; it < depth; it++) {
            var newFaces = [];
            var midCache = Object.create(null);

            function midpointIndex(iA, iB) {
                var key = edgeKey(iA, iB);
                if (midCache[key] !== undefined) return midCache[key];
                var A = vertices[iA];
                var B = vertices[iB];
                var m = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5, (A[2] + B[2]) * 0.5];
                var n = normalize(m);
                var idx = vertices.length;
                vertices.push([n[0] * radius, n[1] * radius, n[2] * radius]);
                midCache[key] = idx;
                return idx;
            }

            for (var fi = 0; fi < faceIndices.length; fi++) {
                var f = faceIndices[fi];
                var i0 = f[0], i1 = f[1], i2 = f[2];
                var a = midpointIndex(i0, i1);
                var b = midpointIndex(i1, i2);
                var c = midpointIndex(i2, i0);
                newFaces.push([i0, a, c]);
                newFaces.push([a, i1, b]);
                newFaces.push([c, b, i2]);
                newFaces.push([a, b, c]);
            }

            faceIndices = newFaces;
        }

        // build flat typed arrays
        var posArray = new Float32Array(vertices.length * 3);
        var normalArray = new Float32Array(vertices.length * 3);
        for (var vi = 0; vi < vertices.length; vi++) {
            var v = vertices[vi];
            posArray[vi * 3 + 0] = v[0];
            posArray[vi * 3 + 1] = v[1];
            posArray[vi * 3 + 2] = v[2];
            var n = normalize(v);
            normalArray[vi * 3 + 0] = n[0];
            normalArray[vi * 3 + 1] = n[1];
            normalArray[vi * 3 + 2] = n[2];
        }

        var tris = new Uint16Array(faceIndices.length * 3);
        for (var f = 0; f < faceIndices.length; f++) {
            tris[f * 3 + 0] = faceIndices[f][0];
            tris[f * 3 + 1] = faceIndices[f][1];
            tris[f * 3 + 2] = faceIndices[f][2];
        }

        // unique edges for wireframe
        var edgeSet = Object.create(null);
        function addEdge(i, j) { var k = edgeKey(i, j); if (!edgeSet[k]) edgeSet[k] = [i, j]; }
        for (var f2 = 0; f2 < faceIndices.length; f2++) { var ff = faceIndices[f2]; addEdge(ff[0], ff[1]); addEdge(ff[1], ff[2]); addEdge(ff[2], ff[0]); }
        var edges = Object.keys(edgeSet).map(function (k) { return edgeSet[k]; });
        var lines = new Uint16Array(edges.length * 2);
        for (var e = 0; e < edges.length; e++) { lines[e * 2 + 0] = edges[e][0]; lines[e * 2 + 1] = edges[e][1]; }

        // attach to model (this)
        this.vertices = posArray;
        this.normals = normalArray;
        this.indicesTris = tris;
        this.indicesLines = lines;
    }

    return {
        createVertexData: createVertexData
    };

}());
