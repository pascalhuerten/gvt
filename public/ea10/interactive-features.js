/**
 * Interactive Features Module
 * Handles hover tooltips, click selection, and grid visualization
 * Uses proper MVP projection for accurate hit detection
 */

var InteractiveFeatures = (function () {
    var selectedModelIndex = -1;
    var hoveredModelIndex = -1;
    var showGridEnabled = true;
    var canvas = null;
    var models = [];
    var labels = [];
    var originalData = [];
    var seedTypes = {
        1: "Kama",
        2: "Rosa",
        3: "Canadian"
    };

    // Store camera and projection data for hit testing
    var cameraRef = null;
    var projectionMatrixRef = null;
    var viewMatrixRef = null;
    var viewportRef = null;

    function init(canvasElement, modelsArray, labelsArray, originalDataArray, cameraObj, projMatrix, viewMatrix, viewport) {
        canvas = canvasElement;
        models = modelsArray;
        labels = labelsArray;
        originalData = originalDataArray;
        cameraRef = cameraObj;
        projectionMatrixRef = projMatrix;
        viewMatrixRef = viewMatrix;
        viewportRef = viewport;

        // Add mouse move listener for hover tooltips
        canvas.addEventListener('mousemove', onCanvasMouseMove);
        canvas.addEventListener('click', onCanvasClick);

        // Add keyboard listener for escape and grid toggle
        document.addEventListener('keydown', onKeyDown);

        // Initialize grid checkbox
        var gridCheckbox = document.getElementById('showGrid');
        if (gridCheckbox) {
            gridCheckbox.checked = showGridEnabled;
        }
    }

    /**
     * Update projection matrices for current frame (call this during render)
     */
    function updateMatrices(projMatrix, viewMatrix, viewport) {
        projectionMatrixRef = projMatrix;
        viewMatrixRef = viewMatrix;
        viewportRef = viewport;
    }

    /**
     * Project a 3D point to 2D screen space using MVP matrices
     */
    function projectToScreen(pos3d) {
        if (!projectionMatrixRef || !viewMatrixRef || !viewportRef) {
            return null;
        }

        // Create position vector
        var worldPos = vec4.fromValues(pos3d[0], pos3d[1], pos3d[2], 1.0);

        // Apply view matrix
        vec4.transformMat4(worldPos, worldPos, viewMatrixRef);

        // Apply projection matrix
        vec4.transformMat4(worldPos, worldPos, projectionMatrixRef);

        // Perspective divide
        var w = worldPos[3];
        if (Math.abs(w) < 0.0001) return null;

        var x = worldPos[0] / w;
        var y = worldPos[1] / w;
        var z = worldPos[2] / w;

        // If z is outside [-1, 1], point is behind camera
        if (z < -1.0 || z > 1.0) return null;

        // Convert from NDC to screen coordinates
        var vp = viewportRef;
        var screenX = vp[0] + (x + 1.0) * vp[2] / 2.0;
        var screenY = vp[1] + (1.0 - (y + 1.0) / 2.0) * vp[3];

        return { x: screenX, y: screenY, z: z };
    }

    /**
     * Find closest model to mouse position in screen space
     */
    function getModelAtMouse(mouseX, mouseY) {
        if (!models || models.length === 0) return -1;

        var closestIndex = -1;
        var closestDist = Infinity;
        var threshold = 30; // pixels for hit detection

        // For each model, project its position to screen space
        for (var i = 0; i < models.length; i++) {
            var model = models[i];
            var pos = model.translate || [0, 0, 0];

            // Project to screen
            var screenPos = projectToScreen(pos);

            if (!screenPos) continue;

            // Calculate distance in screen space
            var dx = screenPos.x - mouseX;
            var dy = screenPos.y - mouseY;
            var dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < threshold && dist < closestDist) {
                closestDist = dist;
                closestIndex = i;
            }
        }

        return closestIndex;
    }

    function onCanvasMouseMove(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;

        // Get model at mouse position using proper projection
        var closestIndex = getModelAtMouse(x, y);

        // Update hovered state
        if (closestIndex !== hoveredModelIndex) {
            hoveredModelIndex = closestIndex;
            updateHoverTooltip(event.clientX, event.clientY);
        } else if (hoveredModelIndex !== -1) {
            // Update position even if same model
            updateHoverTooltip(event.clientX, event.clientY);
        }
    }

    function onCanvasClick(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;

        // Find model at click position
        var closestIndex = getModelAtMouse(x, y);

        if (closestIndex !== -1) {
            selectModel(closestIndex);
        }
    }

    function onKeyDown(event) {
        if (event.key === 'Escape') {
            clearSelection();
        } else if (event.key.toLowerCase() === 'g') {
            toggleGrid();
        }
    }

    function updateHoverTooltip(clientX, clientY) {
        var tooltip = document.getElementById('hover-tooltip');
        if (!tooltip) return;

        if (hoveredModelIndex !== -1 && hoveredModelIndex < labels.length) {
            var seedType = seedTypes[labels[hoveredModelIndex]] || 'Unknown';
            var dataIndex = hoveredModelIndex + 1;

            tooltip.innerHTML =
                '<strong>Seed ' + dataIndex + '</strong><br>' +
                'Type: ' + seedType + '<br>' +
                'Click to view details';

            tooltip.style.display = 'block';
            tooltip.style.left = (clientX + 10) + 'px';
            tooltip.style.top = (clientY + 10) + 'px';
        } else {
            tooltip.style.display = 'none';
        }
    }

    function selectModel(index) {
        selectedModelIndex = index;
        showInfoPanel(index);
    }

    function showInfoPanel(index) {
        var panel = document.getElementById('info-panel');
        var content = document.getElementById('info-content');

        if (!panel || !content) return;
        if (index < 0 || index >= models.length) return;

        var model = models[index];
        var label = labels[index] || 0;
        var seedType = seedTypes[label] || 'Unknown';
        var pos = model.translate || [0, 0, 0];

        // Get original data if available
        var origData = originalData[index] || [];

        var html = '<div>';
        html += '<strong>Index:</strong> ' + (index + 1) + '<br>';
        html += '<strong>Seed Type:</strong> ' + seedType + '<br><br>';

        html += '<strong>3D Position (reduced):</strong><br>';
        html += 'X: ' + pos[0].toFixed(4) + '<br>';
        html += 'Y: ' + pos[1].toFixed(4) + '<br>';
        html += 'Z: ' + pos[2].toFixed(4) + '<br><br>';

        if (origData.length > 0) {
            html += '<strong>Original Features (7D):</strong><br>';
            var featureNames = ['Area', 'Perimeter', 'Compactness', 'Length', 'Width', 'Asymmetry', 'Groove'];
            for (var i = 0; i < Math.min(origData.length, 7); i++) {
                html += featureNames[i] + ': ' + parseFloat(origData[i]).toFixed(4) + '<br>';
            }
        }

        html += '</div>';

        content.innerHTML = html;
        panel.style.display = 'block';
    }

    function clearSelection() {
        selectedModelIndex = -1;
        var panel = document.getElementById('info-panel');
        if (panel) panel.style.display = 'none';
    }

    function toggleGrid() {
        showGridEnabled = !showGridEnabled;
        var checkbox = document.getElementById('showGrid');
        if (checkbox) checkbox.checked = showGridEnabled;
    }

    function isGridEnabled() {
        return showGridEnabled;
    }

    function getSelectedModelIndex() {
        return selectedModelIndex;
    }

    return {
        init: init,
        updateMatrices: updateMatrices,
        selectModel: selectModel,
        clearSelection: clearSelection,
        toggleGrid: toggleGrid,
        isGridEnabled: isGridEnabled,
        getSelectedModelIndex: getSelectedModelIndex
    };
}());
