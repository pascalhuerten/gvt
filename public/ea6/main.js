var app = (() => {

	let gl;

	// The shader program object is also used to
	// store attribute and uniform locations.
	let prog;

	// Array of model objects.
	const models = [];

	// Array of animated model animators.
	const animators = [];

	// Global light defined in world space. We'll transform it into view space
	// every frame so lighting stays fixed relative to the scene (not the camera).
	const light = {
		direction: [0.2, -0.5, -0.1]
	};

	let camera = {
		// Initial position of the camera.
		eye: [0, 0, 0],
		// Point to look at.
		center: [0, 0, 0],
		// Roll and pitch of the camera.
		up: [0, 1, 0],
		// Opening angle given in radian.
		// radian = degree*2*PI/360.
		fovy: 80.0 * Math.PI / 180,
		// Camera near plane dimensions:
		// value for left right top bottom in projection.
		lrtb: 2.0,
		// View matrix.
		vMatrix: mat4.create(),
		// Projection matrix.
		pMatrix: mat4.create(),
		// Projection types: ortho, perspective, frustum.
		projectionType: "perspective",
		// Angle to Z-Axis for camera when orbiting the center
		// given in radian.
		zAngle: Math.PI / 4 + Math.PI,
		// Angle above the XZ-plane (pitch) in radian. 0 = horizon, positive = above.
		xAngle: 0.2,
		// Distance in XZ-Plane from center when orbiting.
		distance: 1.5,
	};


	// Animation controls
	let isPlaying = true;
	let _lastAnimTime = null;

	function start() {
		init();
		// start the continuous animation loop (rendering occurs each frame)
		_lastAnimTime = null;
		requestAnimationFrame(animate);
	}

	/**
	 * Animation loop. Uses requestAnimationFrame and advances camera.zAngle
	 * when `isPlaying` is true. Always renders the scene each frame.
	 */
	function animate(timestamp) {
		if (!_lastAnimTime) _lastAnimTime = timestamp;
		const dt = (timestamp - _lastAnimTime) / 1000.0;
		_lastAnimTime = timestamp;
		if (isPlaying) {
			// rotate clockwise by increasing zAngle
			// camera.zAngle += playSpeed * dt;

			// Update all animators
			for (const animator of animators) {
				animator.update(timestamp);
			}
		}

		render();
		requestAnimationFrame(animate);
	}

	function togglePlayPause() {
		isPlaying = !isPlaying;
		if (isPlaying) {
			// Resume all animators
			for (const animator of animators) {
				animator.resume();
			}
		} else {
			// Pause all animators
			for (const animator of animators) {
				animator.pause();
			}
		}
		if (typeof document !== 'undefined') {
			const btn = document.getElementById('play-pause');
			if (btn) btn.textContent = isPlaying ? 'Pause ❚❚' : 'Play ▶';
		}
	}

	function pauseAnimation() {
		isPlaying = false;
		// Pause all animators
		for (const animator of animators) {
			animator.pause();
		}
		if (typeof document !== 'undefined') {
			const btn = document.getElementById('play-pause');
			if (btn) btn.textContent = 'Play ▶';
		}
	}

	/**
	 * Step all animations forward by a fixed amount (one frame at 60fps).
	 */
	function stepAnimationForward() {
		for (const animator of animators) {
			animator.stepForward(0.016); // ~60fps frame time
			// Update the animator with a dummy timestamp to apply the stepped time
			animator.update(performance.now());
		}
	}

	function init() {
		initWebGL();
		initShaderProgram();
		initUniforms();
		initLighting();
		initModels();
		initEventHandler();
		initPipline();
		// after pipeline & models are ready, wire up UI
		_postInitUI();
	}

	function initWebGL() {
		// Get canvas and WebGL context.
		canvas = document.getElementById('canvas');
		gl = canvas.getContext('webgl2');
		gl.viewportWidth = canvas.width;
		gl.viewportHeight = canvas.height;
	}

	/**
	 * Init pipeline parameters that will not change again.
	 * If projection or viewport change, their setup must
	 * be in render function.
	 */
	function initPipline() {
		gl.clearColor(.95, .95, .95, 1);

		// Backface culling.
		gl.frontFace(gl.CCW);
		gl.enable(gl.CULL_FACE);
		gl.cullFace(gl.BACK);

		// Depth(Z)-Buffer.
		gl.enable(gl.DEPTH_TEST);

		// Polygon offset of rastered Fragments.
		gl.enable(gl.POLYGON_OFFSET_FILL);
		gl.polygonOffset(0.5, 0);

		// Set viewport.
		gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

		// Init camera.
		// Set projection aspect ratio.
		camera.aspect = gl.viewportWidth / gl.viewportHeight;
	}

	function initShaderProgram() {
		// Init vertex shader.
		const vs = initShader(gl.VERTEX_SHADER, "vertexshader");
		// Init fragment shader.
		const fs = initShader(gl.FRAGMENT_SHADER, "fragmentshader");
		// Link shader into a shader program.
		prog = gl.createProgram();
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.bindAttribLocation(prog, 0, "aPosition");
		gl.linkProgram(prog);
		gl.useProgram(prog);
	}

	/**
	 * Create and init shader from source.
	 * 
	 * @parameter shaderType: openGL shader type.
	 * @parameter SourceTagId: Id of HTML Tag with shader source.
	 * @returns shader object.
	 */
	function initShader(shaderType, SourceTagId) {
		const shader = gl.createShader(shaderType);
		const shaderSource = document.getElementById(SourceTagId).text;
		gl.shaderSource(shader, shaderSource);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.log(SourceTagId + ": " + gl.getShaderInfoLog(shader));
			return null;
		}
		return shader;
	}

	function initUniforms() {
		// Projection Matrix.
		prog.pMatrixUniform = gl.getUniformLocation(prog, "uPMatrix");

		// Model-View-Matrix.
		prog.mvMatrixUniform = gl.getUniformLocation(prog, "uMVMatrix");

		// Normal Matrix.
		prog.normalMatrixUniform = gl.getUniformLocation(prog, "uNormalMatrix");

		// Model color and lighting.
		prog.modelColorUniform = gl.getUniformLocation(prog, "uModelColor");
		prog.lightDirectionUniform = gl.getUniformLocation(prog, "uLightDirection");
		prog.ambientStrengthUniform = gl.getUniformLocation(prog, "uAmbientStrength");
		// Shadow / tint uniforms
		prog.shadowStrengthUniform = gl.getUniformLocation(prog, "uShadowStrength");
		prog.shadowExpUniform = gl.getUniformLocation(prog, "uShadowExponent");
	}

	/**
	 * Initialize lighting parameters.
	 */
	function initLighting() {
		gl.uniform1f(prog.ambientStrengthUniform, 0.35);
		gl.uniform1f(prog.shadowStrengthUniform, 0.6);
		gl.uniform1f(prog.shadowExpUniform, 2.0);
	}

	function initModels() {
		// Create 4 animated spheres at opposite points orbiting on tilted paths toward center
		const colors = [
			[1.0, 0.5, 0.5],  // red
			[0.5, 0.5, 1.0],  // blue
			[0.5, 1.0, 0.5],  // green
			[1.0, 1.0, 0.5]   // yellow
		];

		const orbitRadius = 1.42;
		const orbitSpeed = 1.0; // radians per second

		// 4 opposite points on XY plane, tilted toward center
		const sphereOffsets = [
			{ center: [0, 1, 1], offset: Math.PI, plane: { x: -Math.PI / 4, y: 0 } },
			{ center: [0, -1, -1], offset: Math.PI / 2 * 6, plane: { x: -Math.PI / 4, y: 0 } },
			{ center: [1, 1, 0], offset: Math.PI, plane: { x: 0, y: 0, z: Math.PI / 4 } },
			{ center: [-1, -1, 0], offset: Math.PI / 2 * 6, plane: { x: 0, y: 0, z: Math.PI / 4 } }
		];

		// Create 4 spheres orbiting around offset centers
		for (let i = 0; i < 4; i++) {
			const sphereModel = new Model(
				new Sphere({ radius: 0.2, depth: 3 }),
				gl, prog,
				{
					fillstyle: 'fillwireframe',
					color: colors[i]
				}
			);

			const offset = sphereOffsets[i];

			// Each sphere orbits around its offset center, passes through torus center during orbit
			const animator = new ModelAnimator(sphereModel, {
				animationFn: AnimationPresets.orbit(
					orbitRadius,
					orbitSpeed,
					offset.center,     // Orbit around this offset center
					offset.offset,     // Offset angle around its orbit
					offset.plane       // Tilted plane toward center
				)
			});

			models.push(sphereModel);
			animators.push(animator);
		}

		// Create a dynamic torus in the center that rotates tangent to sphere paths
		const torusModel = new Model(
			new Torus({ n: 20, m: 40, r: 0.05, R: 0.35 }),
			gl, prog,
			{
				fillstyle: 'fillwireframe',
				color: [0.8, 0.6, 0.9],
				transform: {
					translation: [0, 0, 0],
					rotation: [0, 0, 0]
				}
			}
		);

		// Calculate bob frequency to sync with rotation
		// For N complete bob cycles per full rotation:
		// frequency = (bobsPerRotation × orbitSpeed) / (2π)
		const bobsPerRotation = 4;  // Complete 4 bobs during one full rotation
		const bobFrequency = (bobsPerRotation * orbitSpeed) / (2 * Math.PI);
		const bobPhaseOffset = Math.PI / 4;
		const bobHeight = 0.17;
		const bobOffset = -bobHeight / 2;

		// Torus rotates to face the moving spheres when they pass through center
		const torusAnimator = new ModelAnimator(torusModel, {
			animationFn: AnimationPresets.combine(
				AnimationPresets.rotateY(-orbitSpeed),
				AnimationPresets.rotateX(-orbitSpeed * 2),
				AnimationPresets.bob(bobHeight, bobFrequency, bobOffset, bobPhaseOffset),
			)
		});

		models.push(torusModel);
		animators.push(torusAnimator);

		// Create floor plane as reference surface
		const floorModel = new Model(
			new Plane({ width: 8.0, height: 8.0, segmentsX: 16, segmentsZ: 16 }),
			gl, prog,
			{
				fillstyle: 'wireframe',
				color: [0.5, 0.5, 0.5],
				transform: { translation: [0, -0.7, 0] }
			}
		);

		models.push(floorModel);
	}

	// Update UI after models are initialized
	function _postInitUI() {
		// Wire up buttons if present
		if (typeof document !== 'undefined') {
			const play = document.getElementById('play-pause');
			if (play) play.addEventListener('click', () => togglePlayPause());
			// Set initial label according to play state
			if (play) play.textContent = isPlaying ? 'Pause ❚❚' : 'Play ▶';
		}
	}

	function initEventHandler() {

		window.onkeydown = function (evt) {
			const c = evt.key;
			const shift = evt.shiftKey;
			// console.log("key: " + c + " shift: " + shift);
			// Change projection of scene.
			switch (c) {
				case ('o'):
					camera.projectionType = "ortho";
					camera.lrtb = 2;
					console.log("ortho");
					break;
				case ('p'):
					camera.projectionType = "perspective";
					console.log("perspective");
					break;
				case ('f'):
					camera.projectionType = "frustum";
					console.log("frustum");
					break;
				case ('c'):
				case ('ArrowRight'):
				case ('d'):
					console.log("right");
					// user manually rotated -> pause automatic animation
					// pauseAnimation();
					camera.zAngle += 0.03;
					break;
				case ('C'):
				case ('ArrowLeft'):
				case ('a'):
					console.log("left");
					// user manually rotated -> pause automatic animation
					// pauseAnimation();
					camera.zAngle -= 0.03;
					break;
				case ('w'):
					// look more from above (increase pitch)
					camera.xAngle += 0.08;
					// clamp to avoid gimbal flip
					if (camera.xAngle > Math.PI / 2 - 0.01) camera.xAngle = Math.PI / 2 - 0.01;
					break;
				case ('s'):
					// look more from below (decrease pitch)
					camera.xAngle -= 0.08;
					console.log("xAngle:", camera.xAngle);
					if (camera.xAngle <= 0.05) camera.xAngle = 0.05;
					break;
				case ('n'):
					console.log("away");
					camera.distance += 0.1;
					if (camera.projectionType === 'ortho') camera.lrtb += 0.1;
					break;
				case ('N'):
					console.log("closer");
					camera.distance -= 0.1;
					if (camera.distance < 1.0)
						camera.distance = 1.0;
					if (camera.projectionType === 'ortho') {
						camera.lrtb -= 0.1;
						if (camera.lrtb < 0.0) camera.lrtb = 0.0;
					}
					break;
				case ('k'):
					// K: step animation forward one frame (only while paused)
					pauseAnimation();
					stepAnimationForward();
					console.log('Sphere animation stepped forward');
					break;
				case ('K'):
					togglePlayPause();
					break;

			}			// Render the scene again on any key pressed.
			render();
		};
	}

	/**
	 * Calculate camera eye position for an orbiting camera around camera.center.
	 * The camera orbits in the XZ-plane at distance `camera.distance` and uses
	 * `camera.zAngle` as angle around the Z-axis. `camera.xAngle` is the pitch
	 * (angle above XZ-plane). Result is stored in `camera.eye`.
	 */
	function calculateCameraOrbit() {
		const cosX = Math.cos(camera.xAngle);
		camera.eye[0] = camera.center[0] + camera.distance * cosX * Math.sin(camera.zAngle);
		camera.eye[1] = camera.center[1] + camera.distance * Math.sin(camera.xAngle);
		camera.eye[2] = camera.center[2] + camera.distance * cosX * Math.cos(camera.zAngle);
	}

	/**
	 * Run the rendering pipeline.
	 */
	function render() {
		// Clear framebuffer and depth-/z-buffer.
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		setProjection();

		// compute camera eye position and view matrix
		calculateCameraOrbit();
		// build view matrix
		mat4.lookAt(camera.vMatrix, camera.eye, camera.center, camera.up);

		// Transform world-space light direction into view space so lighting
		// remains fixed relative to the scene (not the camera).
		if (prog.lightDirectionUniform) {
			const lightDirView = vec3.create();
			const _tmpMat3 = mat3.create();
			mat3.fromMat4(_tmpMat3, camera.vMatrix);
			vec3.transformMat3(lightDirView, light.direction, _tmpMat3);
			vec3.normalize(lightDirView, lightDirView);
			gl.uniform3fv(prog.lightDirectionUniform, lightDirView);
		}

		// Loop over models.
		for (let i = 0; i < models.length; i++) {
			const model = models[i];

			// models[i].mvMatrix holds the model (local) transform.
			// Compute ModelView = View * Model
			const mv = mat4.create();
			mat4.multiply(mv, camera.vMatrix, model.mvMatrix);

			// Calculate normal matrix (inverse transpose of model-view)
			const normalMatrix = mat3.create();
			mat3.normalFromMat4(normalMatrix, mv);

			// Set uniforms for model.
			gl.uniformMatrix4fv(prog.mvMatrixUniform, false, mv);
			gl.uniformMatrix3fv(prog.normalMatrixUniform, false, normalMatrix);
			gl.uniform3fv(prog.modelColorUniform, model.color || [1.0, 1.0, 1.0]);

			draw(model);
		}
	}

	function setProjection() {
		// Set projection Matrix.
		switch (camera.projectionType) {
			case ("ortho"):
				const v = camera.lrtb;
				mat4.ortho(camera.pMatrix, -v, v, -v, v, -10, 10);
				break;
			case ("perspective"):
				mat4.perspective(camera.pMatrix, camera.fovy,
					camera.aspect, 0.1, 100);
				break;
			case ("frustum"):
				const fv = camera.lrtb;
				mat4.frustum(camera.pMatrix, -fv / 2 * camera.aspect, fv / 2 * camera.aspect,
					-fv / 2, fv / 2, 1, 100);
				break;
		}
		// Set projection uniform.
		gl.uniformMatrix4fv(prog.pMatrixUniform, false, camera.pMatrix);
	}

	function draw(model) {
		// Setup position VBO.
		gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
		gl.vertexAttribPointer(prog.positionAttrib, 3, gl.FLOAT, false, 0, 0);

		// Setup normal VBO.
		gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
		gl.vertexAttribPointer(prog.normalAttrib, 3, gl.FLOAT, false, 0, 0);

		// Setup rendering tris.
		const fill = (model.fillstyle.search(/fill/) != -1);
		if (fill) {
			gl.enableVertexAttribArray(prog.normalAttrib);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
			gl.drawElements(gl.TRIANGLES, model.iboTris.numberOfElements,
				gl.UNSIGNED_SHORT, 0);
		}

		// Setup rendering lines.
		const wireframe = (model.fillstyle.search(/wireframe/) != -1);
		if (wireframe) {
			gl.disableVertexAttribArray(prog.normalAttrib);
			gl.vertexAttrib3f(prog.normalAttrib, 0, 0, 0);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
			gl.drawElements(gl.LINES, model.iboLines.numberOfElements,
				gl.UNSIGNED_SHORT, 0);
		}
	}

	// App interface.
	return {
		start: start,
	}

})();
