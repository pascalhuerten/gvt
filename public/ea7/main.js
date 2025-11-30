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
		direction: [0.2, -0.3, -0.1]
	};

	let camera = {
		// First-person camera state
		eye: [0, 0.3, 0], // start slightly above ground and away from center
		center: [0, 0.3, 2],
		up: [0, 1, 0],
		fovy: 80.0 * Math.PI / 180,
		lrtb: 2.0,
		vMatrix: mat4.create(),
		pMatrix: mat4.create(),
		projectionType: "perspective",
		// FPS angles
		yaw: 0.0,   // left/right rotation around Y
		pitch: 0.0, // up/down rotation
		// Movement
		moveSpeed: 2.0, // units per second
		turnSpeed: 1.5, // radians per second for arrows
		// Bounds
		minPitch: -Math.PI / 2 + 0.05,
		maxPitch: Math.PI / 2 - 0.05,
	};


	// Animation controls
	let isPlaying = true;
	let _lastAnimTime = null;
	// Global render mode: 'fill' or 'wireframefill'
	let _renderMode = 'fill';
	function setRenderMode(mode) {
		_renderMode = (mode === 'wireframefill') ? 'wireframefill' : 'fill';
		for (const m of models) {
			m.fillstyle = _renderMode;
		}
	}

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

			// Handle FPS movement when keys are pressed
			updateFpsCamera(dt);
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
		gl.clearColor(.75, .85, .95, 1);

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
		// Curvature uniforms (vertex shader)
		prog.curveStartUniform = gl.getUniformLocation(prog, "uCurveStart");
		prog.curveStrengthUniform = gl.getUniformLocation(prog, "uCurveStrength");
		prog.curveExponentUniform = gl.getUniformLocation(prog, "uCurveExponent");
		prog.curveRadiusUniform = gl.getUniformLocation(prog, "uCurveRadius");

		// Model color and lighting.
		prog.modelColorUniform = gl.getUniformLocation(prog, "uModelColor");
		prog.useVertexColorUniform = gl.getUniformLocation(prog, "uUseVertexColor");
		prog.lightDirectionUniform = gl.getUniformLocation(prog, "uLightDirection");
		prog.ambientStrengthUniform = gl.getUniformLocation(prog, "uAmbientStrength");
		// Shadow / tint uniforms
		prog.shadowStrengthUniform = gl.getUniformLocation(prog, "uShadowStrength");
		prog.shadowExpUniform = gl.getUniformLocation(prog, "uShadowExponent");
		// Fog uniforms
		prog.fogColorUniform = gl.getUniformLocation(prog, "uFogColor");
		prog.fogNearUniform = gl.getUniformLocation(prog, "uFogNear");
		prog.fogStrengthUniform = gl.getUniformLocation(prog, "uFogStrength");
		prog.fogDensityUniform = gl.getUniformLocation(prog, "uFogDensity");
		// Sky uniforms
		prog.isSkyUniform = gl.getUniformLocation(prog, "uIsSky");
		prog.skyRadiusUniform = gl.getUniformLocation(prog, "uSkyRadius");
		prog.skyHazeStrengthUniform = gl.getUniformLocation(prog, "uSkyHazeStrength");
		prog.skyDesatStrengthUniform = gl.getUniformLocation(prog, "uSkyDesatStrength");
		prog.wireframePassUniform = gl.getUniformLocation(prog, "uWireframePass");
	}

	/**
	 * Initialize lighting parameters.
	 */
	function initLighting() {
		// Store defaults so we can override per-model in render
		prog._defaultAmbient = 0.35;
		prog._defaultShadowStrength = 0.6;
		prog._defaultShadowExp = 2.0;
		gl.uniform1f(prog.ambientStrengthUniform, prog._defaultAmbient);
		gl.uniform1f(prog.shadowStrengthUniform, prog._defaultShadowStrength);
		gl.uniform1f(prog.shadowExpUniform, prog._defaultShadowExp);
		// Depth curvature defaults: Earth-like shape based on radius
		// uCurveStrength scales drop (1.0 = physical sagitta, <1.0 softer)
		gl.uniform1f(prog.curveStartUniform, 5.0);
		gl.uniform1f(prog.curveStrengthUniform, 1.0);
		gl.uniform1f(prog.curveExponentUniform, 1.0);
		if (prog.curveRadiusUniform) gl.uniform1f(prog.curveRadiusUniform, 150.0);
		// Fog setup: soft bright sky-like fog
		gl.uniform3fv(prog.fogColorUniform, new Float32Array([0.85, 0.92, 0.98]));
		gl.uniform1f(prog.fogNearUniform, 4);
		gl.uniform1f(prog.fogStrengthUniform, 0.95);
		gl.uniform1f(prog.fogDensityUniform, 0.15);
		// Sky effect defaults
		if (prog.skyHazeStrengthUniform) gl.uniform1f(prog.skyHazeStrengthUniform, 0.35);
		if (prog.skyDesatStrengthUniform) gl.uniform1f(prog.skyDesatStrengthUniform, 0.12);
	}

	function initModels() {
		// Create skydome first (background). Use large radius.
		const skyGen = new Skydome({ radius: 60.0, stacks: 24, slices: 64 });
		const skyModel = new Model(skyGen, gl, prog, {
			fillstyle: 'fill',
			color: [1, 1, 1], // unused when vertex colors active
			transform: { translation: [0, -10, 0] }
		});
		skyModel.isSky = true;
		models.push(skyModel);
		// Generate a forest of pine trees randomly on the XZ plane
		createForest({
			count: 160,
			areaSize: 22.0, // trees distributed within +/- areaSize/2 on X and Z
			minSpacing: 1.2, // minimum distance between any two trees
			excludeRadius: 1.0 // keep a clear radius around the origin
		});

		// Create floor plane as reference surface
		const floorModel = new Model(
			new Plane({ width: 32.0, height: 32.0, segmentsX: 16, segmentsZ: 16 }),
			gl, prog,
			{
				fillstyle: 'fill',
				color: [0.5, 0.7, 0.4],
				transform: { translation: [0, 0, 0] }
			}
		);

		models.push(floorModel);

		// Create a few slow-moving clouds
		createClouds({
			count: 10,
			areaSize: 32.0,
			baseY: 4.5,
			minSpacing: 1.0
		});
	}

	/**
	 * Create a set of Pine models distributed randomly on the ground plane.
	 * Ensures minimum spacing between trees and an exclusion radius around center.
	 */
	function createForest({ count = 20, areaSize = 20.0, minSpacing = 1.5, excludeRadius = 2.5 } = {}) {
		const half = areaSize * 0.5;
		const positions = [];
		const maxAttemptsPerTree = 200;

		function isValidPosition(x, z) {
			// Exclude central radius
			const r2 = x * x + z * z;
			if (r2 < excludeRadius * excludeRadius) return false;
			// Maintain spacing
			for (const p of positions) {
				const dx = x - p[0];
				const dz = z - p[1];
				if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
			}
			return true;
		}

		for (let i = 0; i < count; i++) {
			let placed = false;
			for (let attempt = 0; attempt < maxAttemptsPerTree && !placed; attempt++) {
				const x = (Math.random() * 2 - 1) * half;
				const z = (Math.random() * 2 - 1) * half;
				if (!isValidPosition(x, z)) continue;
				positions.push([x, z]);
				placed = true;
			}
		}

		// Weighted mix configuration (can be extended)
		const mix = [
			{ type: 'pine', weight: 0.6 },
			{ type: 'tree', weight: 0.3 },
			{ type: 'bush', weight: 0.2 },
		];
		const totalWeight = mix.reduce((s, m) => s + m.weight, 0);
		function pickType() {
			let r = Math.random() * totalWeight;
			for (const m of mix) {
				if ((r -= m.weight) <= 0) return m.type;
			}
			return mix[mix.length - 1].type; // fallback
		}

		function randomColor(base) {
			// Slight variation around base color
			return base.map(c => Math.min(1.0, Math.max(0.0, c + (Math.random() - 0.5) * 0.15)));
		}

		for (const [x, z] of positions) {
			const choice = pickType();
			let generator;
			let colorBase;
			// Randomized transform components
			let scaleVal;
			if (choice === 'bush') {
				scaleVal = 0.6 + Math.random() * 0.4;
			} else if (choice === 'tree') {
				scaleVal = 0.8 + Math.random() * 0.9;
			} else { // pine
				scaleVal = 0.7 + Math.random() * 0.8;
			}
			let rotY = Math.random() * Math.PI * 2; // Y rotation for variation

			if (choice === 'pine') {
				generator = new Pine();
				colorBase = [0.20, 0.55, 0.40];
			} else if (choice === 'tree') {
				generator = new Tree();
				colorBase = [0.24, 0.60, 0.32];
			} else { // bush
				generator = new Bush({
					sphereCount: 3 + Math.floor(Math.random() * 2),
				});
				colorBase = [0.18, 0.50, 0.28];
			}
			const model = new Model(
				generator,
				gl, prog,
				{
					fillstyle: 'fill',
					color: randomColor(colorBase),
					transform: {
						translation: [x, 0.0, z],
						rotation: [0, rotY, 0],
						scale: scaleVal
					}
				}
			);
			models.push(model);
		}
	}

	/**
	 * Create cloud models distributed in the sky with gentle motion.
	 */
	function createClouds({ count = 4, areaSize = 18.0, baseY = 5.0, minSpacing = 2.5 } = {}) {
		const half = areaSize * 0.5;
		const positions = [];
		const maxAttempts = 200;
		// Shared drift direction for all clouds
		const globalDir = Math.random() * Math.PI * 2;

		function isValid(x, z) {
			for (const p of positions) {
				const dx = x - p[0];
				const dz = z - p[1];
				if (dx * dx + dz * dz < minSpacing * minSpacing) return false;
			}
			return true;
		}

		for (let i = 0; i < count; i++) {
			let placed = false;
			for (let a = 0; a < maxAttempts && !placed; a++) {
				const x = (Math.random() * 2 - 1) * half;
				const z = (Math.random() * 2 - 1) * half;
				if (!isValid(x, z)) continue;
				positions.push([x, z]);
				placed = true;
			}
		}

		for (const [x, z] of positions) {
			const puffCount = 6 + Math.floor(Math.random() * 3);
			const puffRadius = 0.75 + Math.random() * 0.4;
			const verticalScale = 0.65 + Math.random() * 0.15;
			const cloud = new Model(
				new Cloud({ puffCount, puffRadius, verticalScale, baseRadius: 0.7, stretchFactor: 2.5, stretchDirX: Math.cos(globalDir), stretchDirZ: Math.sin(globalDir) }),
				gl, prog,
				{
					fillstyle: 'fill',
					color: [0.97, 0.98, 1.0],
					transform: { translation: [x, baseY, z], scale: 1.0 + Math.random() * 0.4 }
				}
			);
			// Softer lighting for clouds
			cloud.lighting = { ambient: 0.95, shadowStrength: 0.2, shadowExp: 6.0 };
			models.push(cloud);

			// Animate cloud with slow drift along XZ
			const speed = 0.1 + Math.random() * 0.08; // units/sec
			const vx = Math.cos(globalDir) * speed;
			const vz = Math.sin(globalDir) * speed;
			const animFn = (time, mv) => {
				const dx = vx * time;
				const dz = vz * time;
				mat4.translate(mv, mv, [dx, 0, dz]);
			};
			const animator = new ModelAnimator(cloud, { animationFn: animFn });
			animators.push(animator);
		}
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

	// Track pressed keys for smooth FPS movement
	const _keys = new Set();

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
				// FPS movement keys tracked in set
				case ('w'): _keys.add('w'); break;
				case ('a'): _keys.add('a'); break;
				case ('s'): _keys.add('s'); break;
				case ('d'): _keys.add('d'); break;
				case ('ArrowLeft'): _keys.add('ArrowLeft'); break;
				case ('ArrowRight'): _keys.add('ArrowRight'); break;
				case ('ArrowUp'): _keys.add('ArrowUp'); break;
				case ('ArrowDown'): _keys.add('ArrowDown'); break;
				case ('k'):
					// K: step animation forward one frame (only while paused)
					pauseAnimation();
					stepAnimationForward();
					console.log('Sphere animation stepped forward');
					break;
				case ('K'):
					togglePlayPause();
					break;
				case ('1'): // set fill
					setRenderMode('fill');
					break;
				case ('2'): // set wireframe overlay
					setRenderMode('wireframefill');
					break;
				case ('m'): // toggle render mode
					setRenderMode(_renderMode === 'fill' ? 'wireframefill' : 'fill');
					break;

			}			// Render the scene again on any key pressed.
			render();
		};

		window.onkeyup = function (evt) {
			const c = evt.key;
			switch (c) {
				case ('w'): _keys.delete('w'); break;
				case ('a'): _keys.delete('a'); break;
				case ('s'): _keys.delete('s'); break;
				case ('d'): _keys.delete('d'); break;
				case ('ArrowLeft'): _keys.delete('ArrowLeft'); break;
				case ('ArrowRight'): _keys.delete('ArrowRight'); break;
				case ('ArrowUp'): _keys.delete('ArrowUp'); break;
				case ('ArrowDown'): _keys.delete('ArrowDown'); break;
			}
		};
	}

	function updateFpsCamera(dt) {
		// Update yaw/pitch from arrow keys
		if (_keys.has('ArrowLeft')) camera.yaw += camera.turnSpeed * dt;
		if (_keys.has('ArrowRight')) camera.yaw -= camera.turnSpeed * dt;
		if (_keys.has('ArrowUp')) camera.pitch += camera.turnSpeed * dt;
		if (_keys.has('ArrowDown')) camera.pitch -= camera.turnSpeed * dt;
		// Clamp pitch
		if (camera.pitch > camera.maxPitch) camera.pitch = camera.maxPitch;
		if (camera.pitch < camera.minPitch) camera.pitch = camera.minPitch;

		// Compute forward and right vectors from yaw/pitch
		const cosPitch = Math.cos(camera.pitch);
		const sinPitch = Math.sin(camera.pitch);
		const cosYaw = Math.cos(camera.yaw);
		const sinYaw = Math.sin(camera.yaw);
		const forward = [
			cosPitch * sinYaw,
			sinPitch,
			cosPitch * cosYaw
		];
		// Right vector (camera's right on XZ): use cross(forward, up) sign to match A/D
		const right = [
			-forward[2],
			0,
			forward[0]
		];
		// Normalize right
		const rLen = Math.sqrt(right[0] * right[0] + right[2] * right[2]);
		if (rLen > 0.0001) { right[0] /= rLen; right[2] /= rLen; }

		// Move with WASD on XZ plane
		let move = [0, 0, 0];
		if (_keys.has('w')) { move[0] += forward[0]; move[2] += forward[2]; }
		if (_keys.has('s')) { move[0] -= forward[0]; move[2] -= forward[2]; }
		if (_keys.has('a')) { move[0] -= right[0]; move[2] -= right[2]; }
		if (_keys.has('d')) { move[0] += right[0]; move[2] += right[2]; }
		// Normalize move
		const mLen = Math.sqrt(move[0] * move[0] + move[2] * move[2]);
		if (mLen > 0.0001) { move[0] /= mLen; move[2] /= mLen; }
		// Apply movement (keep Y at current eye.y)
		camera.eye[0] += move[0] * camera.moveSpeed * dt;
		camera.eye[2] += move[2] * camera.moveSpeed * dt;

		// Update center from eye + forward
		camera.center[0] = camera.eye[0] + forward[0];
		camera.center[1] = camera.eye[1] + forward[1];
		camera.center[2] = camera.eye[2] + forward[2];
	}

	/**
	 * Calculate camera eye position for an orbiting camera around camera.center.
	 * The camera orbits in the XZ-plane at distance `camera.distance` and uses
	 * `camera.zAngle` as angle around the Z-axis. `camera.xAngle` is the pitch
	 * (angle above XZ-plane). Result is stored in `camera.eye`.
	 */
	function calculateCameraOrbit() {
		// Orbit camera disabled in FPS mode; eye/center updated in updateFpsCamera.
		// Keeping function for compatibility.
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
			// If model has per-vertex colors, set flag and skip uniform color
			const hasVertexColor = !!model.vboColor;
			if (prog.useVertexColorUniform) {
				gl.uniform1i(prog.useVertexColorUniform, hasVertexColor ? 1 : 0);
			}
			if (!hasVertexColor && prog.modelColorUniform) {
				gl.uniform3fv(prog.modelColorUniform, model.color || [1.0, 1.0, 1.0]);
			}
			// Sky flag
			if (prog.isSkyUniform) gl.uniform1i(prog.isSkyUniform, model.isSky ? 1 : 0);
			if (model.isSky && prog.skyRadiusUniform && model.generator && model.generator.radius) {
				gl.uniform1f(prog.skyRadiusUniform, model.generator.radius);
			}

			// Per-model lighting override (e.g., softer for clouds)
			const amb = (model.lighting && model.lighting.ambient !== undefined) ? model.lighting.ambient : prog._defaultAmbient;
			const sh = (model.lighting && model.lighting.shadowStrength !== undefined) ? model.lighting.shadowStrength : prog._defaultShadowStrength;
			const shExp = (model.lighting && model.lighting.shadowExp !== undefined) ? model.lighting.shadowExp : prog._defaultShadowExp;
			gl.uniform1f(prog.ambientStrengthUniform, amb);
			gl.uniform1f(prog.shadowStrengthUniform, sh);
			gl.uniform1f(prog.shadowExpUniform, shExp);

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

		// Setup color VBO if present
		if (model.vboColor && prog.colorAttrib !== undefined && prog.colorAttrib !== -1) {
			gl.bindBuffer(gl.ARRAY_BUFFER, model.vboColor);
			gl.vertexAttribPointer(prog.colorAttrib, 3, gl.FLOAT, false, 0, 0);
			gl.enableVertexAttribArray(prog.colorAttrib);
		} else {
			// If no color buffer, disable attribute to be safe
			if (prog.colorAttrib !== undefined && prog.colorAttrib !== -1) {
				gl.disableVertexAttribArray(prog.colorAttrib);
			}
		}

		// Setup rendering tris.
		const fill = (model.fillstyle.search(/fill/) != -1);
		if (fill) {
			// For sky: disable depth write so scene draws over it
			if (model.isSky) gl.depthMask(false);
			// Ensure wireframe override is off for fill pass
			if (prog.wireframePassUniform) gl.uniform1i(prog.wireframePassUniform, 0);
			gl.enableVertexAttribArray(prog.normalAttrib);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
			gl.drawElements(gl.TRIANGLES, model.iboTris.numberOfElements,
				gl.UNSIGNED_SHORT, 0);
			if (model.isSky) gl.depthMask(true);
		}

		// Setup rendering lines.
		const wireframe = (model.fillstyle.search(/wireframe/) != -1);
		if (wireframe) {
			gl.disableVertexAttribArray(prog.normalAttrib);
			gl.vertexAttrib3f(prog.normalAttrib, 0, 0, 0);
			// Force black lines regardless of material
			if (prog.wireframePassUniform) gl.uniform1i(prog.wireframePassUniform, 1);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
			gl.drawElements(gl.LINES, model.iboLines.numberOfElements,
				gl.UNSIGNED_SHORT, 0);
			if (prog.wireframePassUniform) gl.uniform1i(prog.wireframePassUniform, 0);
		}
	}

	// App interface.
	return {
		start: start,
	}

})();
