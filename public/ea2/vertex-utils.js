/**
 * Vertex Utils Module
 * Pure utility functions for color conversions and distance calculations
 */

(function (globalScope) {
    'use strict';

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

    // Export public API - pure utilities only
    globalScope.VertexUtils = {
        hexToRgb,
        rgbToHex,
        distanceSquared,
        distance,
    };

})(window);
