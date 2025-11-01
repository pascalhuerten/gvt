/**
 * Vertex Utils Module
 * Helper functions for coordinate conversions and utility operations
 */

(function (globalScope) {
    'use strict';

    // Coordinate conversion functions
    function eventToNDC(e, canvas, snapToGrid = false, gridSize = 20) {
        const rect = canvas.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;

        // Apply grid snapping if enabled
        if (snapToGrid) {
            const pixelX = x * rect.width;
            const pixelY = y * rect.height;
            const snappedPixelX = Math.round(pixelX / gridSize) * gridSize;
            const snappedPixelY = Math.round(pixelY / gridSize) * gridSize;
            x = snappedPixelX / rect.width;
            y = snappedPixelY / rect.height;
        }

        // NDC -1..1
        const ndcX = x * 2 - 1;
        const ndcY = (1 - y) * 2 - 1;
        return [ndcX, ndcY];
    }

    function ndcToClient(ndx, ndy, canvas) {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + (ndx * 0.5 + 0.5) * rect.width;
        const cy = rect.top + (1 - (ndy * 0.5 + 0.5)) * rect.height;
        return { x: cx, y: cy };
    }

    function ndcToPixel(x, y, canvas) {
        const rect = canvas.getBoundingClientRect();
        const px = (x * 0.5 + 0.5) * rect.width;
        const py = (1 - (y * 0.5 + 0.5)) * rect.height;
        return [px, py];
    }

    function clientToNDC(clientX, clientY, canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const ndcX = x * 2 - 1;
        const ndcY = (1 - y) * 2 - 1;
        return [ndcX, ndcY];
    }

    // Color utilities
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : [1, 0, 0];
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    // Distance utilities
    function distanceSquared(x1, y1, x2, y2) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        return dx * dx + dy * dy;
    }

    function distance(x1, y1, x2, y2) {
        return Math.sqrt(distanceSquared(x1, y1, x2, y2));
    }

    // Vertex finding utilities
    function findNearestVertexNdc(ndcX, ndcY, layers, maxRadius = 0.15, searchLayerId = null) {
        let nearestNdc = null;
        let nearestDistance = Infinity;

        for (const layer of layers) {
            if (searchLayerId !== null && layer.id !== searchLayerId) continue;
            if (layer.vertices.length === 0) continue;

            for (let i = 0; i < layer.vertices.length; i += 2) {
                const vertexNdcX = layer.vertices[i];
                const vertexNdcY = layer.vertices[i + 1];

                const dx = ndcX - vertexNdcX;
                const dy = ndcY - vertexNdcY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < maxRadius && dist < nearestDistance) {
                    nearestDistance = dist;
                    nearestNdc = [vertexNdcX, vertexNdcY];
                }
            }
        }

        return nearestNdc;
    }

    function findVerticesInAreaPixel(clientX, clientY, canvas, layers, radius, currentLayerId = null) {
        const currentLayer = currentLayerId
            ? layers.find(l => l.id === currentLayerId)
            : layers[0];

        if (!currentLayer || currentLayer.vertices.length === 0) return [];

        const verticesInArea = [];

        for (let i = 0; i < currentLayer.vertices.length; i += 2) {
            const [px, py] = VertexUtils.ndcToPixel(currentLayer.vertices[i], currentLayer.vertices[i + 1], canvas);
            const dx = clientX - px;
            const dy = clientY - py;
            const d = Math.sqrt(dx * dx + dy * dy);

            if (d <= radius) {
                verticesInArea.push(i / 2);
            }
        }

        return verticesInArea;
    }

    // Export public API
    globalScope.VertexUtils = {
        eventToNDC,
        ndcToClient,
        ndcToPixel,
        clientToNDC,
        hexToRgb,
        rgbToHex,
        distanceSquared,
        distance,
        findNearestVertexNdc,
        findVerticesInAreaPixel,
    };

})(window);
