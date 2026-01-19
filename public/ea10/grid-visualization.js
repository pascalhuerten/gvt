/**
 * Grid Visualization Module
 * Renders grid lines in 3D space
 */

var GridVisualization = (function () {
    var gridModel = null;
    var gl = null;
    var prog = null;
    var gridSpacing = 0.5;
    var gridColor = [0.8, 0.8, 0.8, 1.0];

    function init(glContext, shaderProgram) {
        gl = glContext;
        prog = shaderProgram;
        createGridModel();
    }

    /**
     * Create grid model with lines
     * Grid size is dynamic and should be set via updateGridSize
     */
    function createGridModel() {
        if (!gl) return;

        gridModel = {
            fillstyle: 'wireframe',
            color: gridColor,
            vertices: new Float32Array([]),
            normals: new Float32Array([]),
            indicesLines: new Uint16Array([]),
            indicesTris: new Uint16Array([]),
            translate: [0, 0, 0],
            rotate: [0, 0, 0],
            scale: [1, 1, 1],
            mMatrix: mat4.create(),
            mvMatrix: mat4.create(),
            nMatrix: mat3.create()
        };

        generateGridVertices(2.0); // Start with default size
        setupGridBuffers();
    }

    /**
     * Generate grid vertices and indices
     * Only shows X, Y, Z axes
     * @param gridSize - Size of the grid in each dimension
     */
    function generateGridVertices(gridSize) {
        var vertices = [];
        var indices = [];
        var vertexIndex = 0;

        var min = -gridSize / 2;
        var max = gridSize / 2;

        // X axis (red) - extends along X
        vertices.push(min, 0, 0);
        vertices.push(max, 0, 0);
        indices.push(vertexIndex);
        indices.push(vertexIndex + 1);
        vertexIndex += 2;

        // Y axis (green) - extends along Y
        vertices.push(0, min, 0);
        vertices.push(0, max, 0);
        indices.push(vertexIndex);
        indices.push(vertexIndex + 1);
        vertexIndex += 2;

        // Z axis (blue) - extends along Z
        vertices.push(0, 0, min);
        vertices.push(0, 0, max);
        indices.push(vertexIndex);
        indices.push(vertexIndex + 1);
        vertexIndex += 2;

        // Add normals (not really used for lines but required by system)
        var normals = [];
        for (var i = 0; i < vertices.length; i++) {
            normals.push(0, 0, 1);
        }

        gridModel.vertices = new Float32Array(vertices);
        gridModel.normals = new Float32Array(normals);
        gridModel.indicesLines = new Uint16Array(indices);
        gridModel.indicesTris = new Uint16Array([]); // No triangles for grid
    }

    /**
     * Setup grid buffers (similar to model setup)
     */
    function setupGridBuffers() {
        if (!gridModel || !gl) return;

        // Position buffer
        gridModel.vboPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridModel.vboPos);
        gl.bufferData(gl.ARRAY_BUFFER, gridModel.vertices, gl.STATIC_DRAW);

        // Normal buffer
        gridModel.vboNormal = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, gridModel.vboNormal);
        gl.bufferData(gl.ARRAY_BUFFER, gridModel.normals, gl.STATIC_DRAW);

        // Lines index buffer
        gridModel.iboLines = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridModel.iboLines);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridModel.indicesLines, gl.STATIC_DRAW);
        gridModel.iboLines.numberOfElements = gridModel.indicesLines.length;

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    /**
     * Update grid size and regenerate geometry
     */
    function updateGridSize(newSize) {
        if (!gridModel) return;
        generateGridVertices(newSize);
        setupGridBuffers();
    }

    function getGridModel() {
        return gridModel;
    }

    return {
        init: init,
        getGridModel: getGridModel,
        updateGridSize: updateGridSize
    };
}());
