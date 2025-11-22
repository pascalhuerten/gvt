/**
 * ModelAnimator - Manages animated models with time-based transformations.
 * 
 * Takes a Model instance and an animation function to update model
 * transformations (translation, rotation, scale) over time.
 * Preserves any initial transform set on the model.
 */
class ModelAnimator {
    /**
     * Create a ModelAnimator instance.
     * 
     * @param {Model} model - A Model instance to animate
     * @param {Object} animationConfig - Configuration for the animator
     * @param {Function} animationConfig.animationFn - Function called each frame
     *   Signature: animationFn(time, mvMatrix, model)
     *   - time: elapsed time in seconds
     *   - mvMatrix: mat4 model-view matrix to modify
     *   - model: reference to the model object
     * @param {Function} [animationConfig.updateTransform] - Alias for animationFn
     */
    constructor(model, animationConfig = {}) {
        if (!(model instanceof Model)) {
            throw new Error('ModelAnimator expects a Model instance');
        }

        this.model = model;
        // Support both animationFn and updateTransform parameter names
        this.updateTransform = animationConfig.animationFn || animationConfig.updateTransform || (() => { });
        this.startTime = null;
        this.pausedElapsedTime = 0; // Track elapsed time when paused
        this.isPaused = false;

        // Store the initial model matrix (includes any initial transform)
        this.initialMatrix = mat4.clone(model.mvMatrix);
    }

    /**
     * Update animation for this frame.
     * Should be called once per animation frame with the current timestamp.
     * @param {DOMHighResTimeStamp} timestamp - Current time from requestAnimationFrame
     */
    update(timestamp) {
        if (this.startTime === null && !this.isPaused) {
            this.startTime = timestamp;
        }

        let elapsedTime;
        if (this.isPaused) {
            // Use the paused elapsed time
            elapsedTime = this.pausedElapsedTime;
        } else {
            // Calculate elapsed time from start (subtracting any paused time)
            elapsedTime = (timestamp - this.startTime) / 1000.0 + this.pausedElapsedTime;
        }

        // Start from the initial matrix (preserves initial transform)
        mat4.copy(this.model.mvMatrix, this.initialMatrix);

        // Call the user-provided animation function
        this.updateTransform(elapsedTime, this.model.mvMatrix, this.model);
    }

    /**
     * Pause the animation and store the current elapsed time.
     */
    pause() {
        if (!this.isPaused && this.startTime !== null) {
            // Calculate the current elapsed time and store it
            this.pausedElapsedTime += (performance.now() - this.startTime) / 1000.0;
            this.startTime = null;
            this.isPaused = true;
        }
    }

    /**
     * Resume the animation from the paused point.
     */
    resume() {
        if (this.isPaused) {
            this.isPaused = false;
            this.startTime = performance.now();
        }
    }

    /**
     * Step the animation forward by a fixed amount of time while paused.
     * @param {number} deltaTime - Time to step forward in seconds
     */
    stepForward(deltaTime = 0.016) {
        if (this.isPaused) {
            this.pausedElapsedTime += deltaTime;
        }
    }

    /**
     * Reset the animation timer.
     */
    resetAnimation() {
        this.startTime = null;
        this.pausedElapsedTime = 0;
        this.isPaused = false;
    }

    /**
     * Get the model being animated.
     * @returns {Model} The model instance
     */
    getModel() {
        return this.model;
    }

    /**
     * Get elapsed time since animation started (in seconds).
     * Returns the current elapsed time whether playing or paused.
     * @returns {number|null} Elapsed time in seconds
     */
    getElapsedTime() {
        if (this.startTime === null && this.pausedElapsedTime === 0) return null;

        if (this.isPaused) {
            return this.pausedElapsedTime;
        }
        return (performance.now() - this.startTime) / 1000.0 + this.pausedElapsedTime;
    }

}

/**
 * Helper function to create common animations.
 */
class AnimationPresets {
    /**
     * Rotation around Y-axis animation.
     * 
     * @param {number} speed - Rotation speed in radians per second
     * @returns {Function} Animation update function
     */
    static rotateY(speed = 1.0) {
        return (time, mvMatrix) => {
            mat4.rotateY(mvMatrix, mvMatrix, speed * time);
        };
    }

    /**
     * Rotation around X-axis animation.
     * 
     * @param {number} speed - Rotation speed in radians per second
     */
    static rotateX(speed = 1.0) {
        return (time, mvMatrix) => {
            mat4.rotateX(mvMatrix, mvMatrix, speed * time);
        };
    }

    /**
     * Rotation around Z-axis animation.
     * 
     * @param {number} speed - Rotation speed in radians per second
     */
    static rotateZ(speed = 1.0) {
        return (time, mvMatrix) => {
            mat4.rotateZ(mvMatrix, mvMatrix, speed * time);
        };
    }

    /**
     * Orbit animation - circular motion around center with optional plane rotation.
     * 
     * @param {number} radius - Orbital radius
     * @param {number} speed - Rotation speed in radians per second
     * @param {Array} [center] - Center point [x, y, z] (default [0, 0, 0])
     * @param {number} [offsetAngle] - Initial angle offset in radians (default 0)
     * @param {Object} [planeRotation] - Rotate the orbital plane
     *   - @param {number} [planeRotation.x] - Rotation around X-axis in radians
     *   - @param {number} [planeRotation.y] - Rotation around Y-axis in radians
     *   - @param {number} [planeRotation.z] - Rotation around Z-axis in radians
     * @returns {Function} Animation update function
     * 
     * @example
     * // Orbit in tilted plane (45° tilt around X-axis)
     * AnimationPresets.orbit(1.5, 1.0, [0, 0, 0], 0, { x: Math.PI / 4 })
     */
    static orbit(radius = 2.0, speed = 1.0, center = [0, 0, 0], offsetAngle = 0, planeRotation = {}) {
        return (time, mvMatrix) => {
            const angle = speed * time + offsetAngle;

            // Base orbital position in XZ plane
            let x = radius * Math.cos(angle);
            let y = 0;
            let z = radius * Math.sin(angle);

            // Apply plane rotation if specified
            if (planeRotation.x || planeRotation.y || planeRotation.z) {
                // Create a temporary matrix for plane rotation
                const rotMat = mat4.create();
                if (planeRotation.z) mat4.rotateZ(rotMat, rotMat, planeRotation.z);
                if (planeRotation.y) mat4.rotateY(rotMat, rotMat, planeRotation.y);
                if (planeRotation.x) mat4.rotateX(rotMat, rotMat, planeRotation.x);

                // Apply rotation to orbital position
                const pos = vec3.fromValues(x, y, z);
                vec3.transformMat4(pos, pos, rotMat);
                x = pos[0];
                y = pos[1];
                z = pos[2];
            }

            // Translate to orbit position relative to center
            mat4.translate(mvMatrix, mvMatrix, [center[0] + x, center[1] + y, center[2] + z]);

            // Rotate against orbit direction to keep rotation aligned with movement
            const faceAngle = -angle;
            mat4.rotateY(mvMatrix, mvMatrix, faceAngle);
        };
    }

    /**
     * Bobbing animation - vertical oscillation.
     * 
     * @param {number} amplitude - Height of oscillation
     * @param {number} frequency - Oscillation frequency in Hz
     * @param {number} [baseY] - Base Y position
     * @returns {Function} Animation update function
     */
    static bob(amplitude = 0.5, frequency = 1.0, baseY = 0) {
        return (time, mvMatrix) => {
            const y = baseY + amplitude * Math.sin(2 * Math.PI * frequency * time);
            mat4.translate(mvMatrix, mvMatrix, [0, y, 0]);
        };
    }

    /**
     * Spinning animation with optional wobble.
     * 
     * @param {number} spinSpeed - Spin speed in radians per second
     * @param {number} wobbleAmount - Wobble amplitude (0-1)
     * @param {number} wobbleFreq - Wobble frequency in Hz
     * @returns {Function} Animation update function
     */
    static spin(spinSpeed = 2.0, wobbleAmount = 0.0, wobbleFreq = 1.0) {
        return (time, mvMatrix) => {
            // Main rotation
            mat4.rotateY(mvMatrix, mvMatrix, spinSpeed * time);

            // Optional wobble on X axis
            if (wobbleAmount > 0) {
                const wobble = wobbleAmount * Math.sin(2 * Math.PI * wobbleFreq * time);
                mat4.rotateX(mvMatrix, mvMatrix, wobble);
            }
        };
    }

    /**
     * Combined animation - rotation + oscillation.
     * 
     * @param {number} rotSpeed - Rotation speed in radians per second
     * @param {number} bobAmp - Bobbing amplitude
     * @param {number} bobFreq - Bobbing frequency in Hz
     * @returns {Function} Animation update function
     */
    static rotateAndBob(rotSpeed = 1.0, bobAmp = 0.5, bobFreq = 1.0) {
        return (time, mvMatrix) => {
            // Rotation
            mat4.rotateY(mvMatrix, mvMatrix, rotSpeed * time);
            // Bobbing
            const y = bobAmp * Math.sin(2 * Math.PI * bobFreq * time);
            mat4.translate(mvMatrix, mvMatrix, [0, y, 0]);
        };
    }

    /**
     * Scaling animation (pulsing effect).
     * 
     * @param {number} minScale - Minimum scale
     * @param {number} maxScale - Maximum scale
     * @param {number} frequency - Pulsing frequency in Hz
     * @returns {Function} Animation update function
     */
    static pulse(minScale = 0.8, maxScale = 1.2, frequency = 1.0) {
        return (time, mvMatrix) => {
            const scale = minScale + (maxScale - minScale) *
                (0.5 + 0.5 * Math.sin(2 * Math.PI * frequency * time));
            mat4.scale(mvMatrix, mvMatrix, [scale, scale, scale]);
        };
    }

    /**
     * Combine multiple animation functions into a single composite animation.
     * Animations are applied sequentially (order matters for transformations).
     * 
     * @param {...Function} animationFunctions - Variable number of animation functions to combine
     * @returns {Function} Composite animation update function
     * 
     * @example
     * // Orbit while rotating and bobbing
     * const composite = AnimationPresets.combine(
     *   AnimationPresets.orbit(1.0, 1.5, [0, 0, 0]),
     *   AnimationPresets.rotateY(2.0),
     *   AnimationPresets.bob(0.3, 1.0)
     * );
     * const animator = new ModelAnimator(model, { animationFn: composite });
     */
    static combine(...animationFunctions) {
        return (time, mvMatrix, model) => {
            // Apply each animation function in sequence
            for (const animFn of animationFunctions) {
                if (typeof animFn === 'function') {
                    animFn(time, mvMatrix, model);
                }
            }
        };
    }
}

