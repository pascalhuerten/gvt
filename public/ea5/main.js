var app = (() => {

	let gl;

	// The shader program object is also used to
	// store attribute and uniform locations.
	let prog;

	// Array of model objects.
	const models = [];

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
		zAngle: -0.1,
		// Angle above the XZ-plane (pitch) in radian. 0 = horizon, positive = above.
		xAngle: 0.4,
		// Distance in XZ-Plane from center when orbiting.
		distance: 2.5,
	};

	// Animation controls
	let isPlaying = true; // whether auto-rotation is active (start playing by default)
	const playSpeed = 0.3; // radians per second (rotation speed)
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
			camera.zAngle += playSpeed * dt;
		}
		render();
		requestAnimationFrame(animate);
	}

	function togglePlayPause() {
		isPlaying = !isPlaying;
		if (typeof document !== 'undefined') {
			const btn = document.getElementById('play-pause');
			if (btn) btn.textContent = isPlaying ? 'Pause ❚❚' : 'Play ▶';
		}
	}

	function pauseAnimation() {
		isPlaying = false;
		if (typeof document !== 'undefined') {
			const btn = document.getElementById('play-pause');
			if (btn) btn.textContent = 'Play ▶';
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
		// fill-style
		const fs = "fillwireframe";
		const cubeModel = new Model(
			new Cube({ size: 8, depth: 4, inward: true }),
			gl, prog,
			{
				fillstyle: 'fill',
				color: [1.0, 0.8, 0.5],
				transform: { translation: [0, 3.28, 0], rotation: [0, Math.PI / 4, 0] }
			}
		);
		models.push(cubeModel);
		const torusModel = new Model(
			new Torus(),
			gl, prog,
			{
				fillstyle: fs,
				color: [0.6, 1.0, 0.7],
				transform: { translation: [-0.55, 0, 0.58], rotation: [-0.6, -Math.PI / 6, 0] }
			}
		);
		models.push(torusModel);
		// createModel("torus", fs, { position: , color:  });
		const sphereModel = new Model(
			new Sphere({ radius: 1.0, depth: 3 }),
			gl, prog,
			{
				fillstyle: fs,
				color: [0.3, 0.8, 1.0],
				transform: { translation: [0.5, 0.25, -0.6] }
			}
		);
		models.push(sphereModel);
		// createModel("sphere", fs, { , position: , color:  });
		const coneModel = new Model(
			new Cone({ radius: 0.47, height: 1.1, radialSegments: 32 }),
			gl, prog,
			{
				fillstyle: fs,
				color: [0.9, 0.5, 0.7],
				transform: { translation: [0.5, -0.17, 0.7] }
			}
		);
		models.push(coneModel);

	}

	// Update UI after models are initialized
	function _postInitUI() {
		// Ensure recursion display reflects initial model state
		updateRecursionDisplay();
		// Wire up buttons if present
		if (typeof document !== 'undefined') {
			const inc = document.getElementById('recursion-increase');
			const dec = document.getElementById('recursion-decrease');
			if (inc) inc.addEventListener('click', () => changeSphereRecursion(1));
			if (dec) dec.addEventListener('click', () => changeSphereRecursion(-1));
			const play = document.getElementById('play-pause');
			if (play) play.addEventListener('click', () => togglePlayPause());
			// Set initial label according to play state
			if (play) play.textContent = isPlaying ? 'Pause ❚❚' : 'Play ▶';
		}
	}

	/**
	 * Find all models of a given geometry type.
	 * Checks the generator class name (e.g., 'Sphere', 'Cube', etc..)
	 */
	function findModelsByGeometry(geometry) {
		return models.filter(m => m.generator && m.generator.constructor.name.toLowerCase() === geometry.toLowerCase());
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
					pauseAnimation();
					camera.zAngle += 0.03;
					break;
				case ('C'):
				case ('ArrowLeft'):
				case ('a'):
					console.log("left");
					// user manually rotated -> pause automatic animation
					pauseAnimation();
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

				// increase / decrease sphere recursion
				case ('+'):
					// increase
					changeSphereRecursion(1);
					break;
				case ('-'):
					// decrease
					changeSphereRecursion(-1);
					break;

			}

			// Render the scene again on any key pressed.
			render();
		};
	}

	/**
	 * Helper to change sphere recursion by delta (+1 or -1)
	 */
	function changeSphereRecursion(delta) {
		// find all sphere models and adjust each by delta
		const sphereModels = findModelsByGeometry('sphere');
		if (!sphereModels || sphereModels.length === 0) {
			console.log('No sphere model to change recursion.');
			return;
		}

		let changed = 0;
		for (const model of sphereModels) {
			const currentDepth = model.generator.getParam('depth', 3);
			const newDepth = Math.max(0, Math.min(6, currentDepth + delta));

			if (newDepth !== currentDepth) {
				// Update geometry with new depth parameter and reinitialize buffers
				model.updateGeometry({ depth: newDepth });
				// Reinitialize WebGL buffers with new geometry data
				model._reinitializeWebGLBuffers(gl, prog);
				changed++;
			}
		}

		if (changed > 0) {
			render();
			updateRecursionDisplay();
			console.log('Adjusted recursion by', delta, 'for', changed, 'sphere(s)');
		} else {
			console.log('Sphere recursion already at limit for all spheres');
		}
	}

	/**
	 * Return recursion depth for the first sphere model found or null if none.
	 */
	function getSphereRecursion() {
		const sphereModels = findModelsByGeometry('sphere');
		if (!sphereModels || sphereModels.length === 0) return null;
		return sphereModels[0].generator.getParam('depth', 3);
	}

	/**
	 * Update DOM element with id 'recursion-value' if present.
	 */
	function updateRecursionDisplay() {
		if (typeof document === 'undefined') return;
		const el = document.getElementById('recursion-value');
		if (!el) return;
		const v = getSphereRecursion();
		el.textContent = (v === null) ? '-' : String(v);
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
			// models[i].mvMatrix holds the model (local) transform.
			// Compute ModelView = View * Model
			const mv = mat4.create();
			mat4.multiply(mv, camera.vMatrix, models[i].mvMatrix);

			// Calculate normal matrix (inverse transpose of model-view)
			const normalMatrix = mat3.create();
			mat3.normalFromMat4(normalMatrix, mv);

			// Set uniforms for model.
			gl.uniformMatrix4fv(prog.mvMatrixUniform, false, mv);
			gl.uniformMatrix3fv(prog.normalMatrixUniform, false, normalMatrix);
			gl.uniform3fv(prog.modelColorUniform, models[i].color || [1.0, 1.0, 1.0]);

			draw(models[i]);
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
		changeSphereRecursion: changeSphereRecursion,
		getSphereRecursion: getSphereRecursion
	}

})();
