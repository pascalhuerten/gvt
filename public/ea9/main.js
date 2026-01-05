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
		distance: 3,
	};

	// Animation controls
	let isPlaying = false; // whether auto-rotation is active
	let isLightsPlaying = false; // whether light animation is active
	let isToonShadingEnabled = false; // whether toon shading is enabled
	const playSpeed = 0.3; // radians per second (rotation speed)
	let _lastAnimTime = null;


	// Objekt with light sources characteristics in the scene.
	const illumination = {
		ambientLight: [.5, .5, .5],
		light: [
			{
				isOn: true,
				position: [3., 1., 3.],
				color: [1., 1., 1.],
				// Orbit properties for animation
				distance: 3.5,
				height: 0.5,
				zAngle: 0.0,
				speed: 2.5  // radians per second
			},
			{
				isOn: true,
				position: [-3., 1., -3.],
				color: [1., 1., 1.],
				// Orbit properties for animation
				distance: 4.0,
				height: 2.5,
				zAngle: Math.PI,  // Start opposite to first light
				speed: -1  // Different speed
			},
		]
	};

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
		// Update light positions
		if (isLightsPlaying) {
			updateLights(dt);
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

	function toggleLightPlayPause() {
		isLightsPlaying = !isLightsPlaying;
		if (typeof document !== 'undefined') {
			const btn = document.getElementById('light-play-pause');
			if (btn) btn.textContent = isLightsPlaying ? 'Pause ❚❚' : 'Play ▶';
		}
	}

	function toggleToonShading() {
		isToonShadingEnabled = !isToonShadingEnabled;
		console.log("Toon shading: " + (isToonShadingEnabled ? "ON" : "OFF"));
		render();
	}

	/**
	 * Update light positions based on their orbit properties.
	 * Each light orbits independently around the scene center.
	 */
	function updateLights(dt) {
		for (let i = 0; i < illumination.light.length; i++) {
			const light = illumination.light[i];
			// Update angle based on speed and delta time
			light.zAngle += light.speed * dt;
			// Calculate new position in XZ plane, with height offset
			light.position[0] = light.distance * Math.sin(light.zAngle);
			light.position[1] = light.height;
			light.position[2] = light.distance * Math.cos(light.zAngle);
		}
	}

	/**
	 * Manually step light animation by a fixed amount.
	 * Pauses the animation and advances lights by the step amount.
	 */
	function stepLightsForward(stepTime = .1) {
		// Pause the lights animation
		if (isLightsPlaying) {
			isLightsPlaying = false;
			if (typeof document !== 'undefined') {
				const btn = document.getElementById('light-play-pause');
				if (btn) btn.textContent = 'Play ▶';
			}
		}
		if (isPlaying) {
			isPlaying = false;
			if (typeof document !== 'undefined') {
				const btn = document.getElementById('play-pause');
				if (btn) btn.textContent = 'Play ▶';
			}
		}
		// Update lights by the step amount
		updateLights(stepTime);
		// Re-render to show the new light positions
		render();
	}

	function init() {
		initWebGL();
		initShaderProgram();
		initUniforms();
		initModels();
		initEventHandler();
		initPipline();
		// after pipeline & models are ready, wire up UI
		_postInitUI();
	}

	function initWebGL() {
		// Get canvas and WebGL context.
		canvas = document.getElementById('canvas');
		gl = canvas.getContext('experimental-webgl');
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
		prog.nMatrixUniform = gl.getUniformLocation(prog, "uNMatrix");

		// Color.
		prog.colorUniform = gl.getUniformLocation(prog, "uColor");

		// Light.
		prog.ambientLightUniform = gl.getUniformLocation(prog,
			"ambientLight");
		// Array for light sources uniforms.
		prog.lightUniform = [];
		// Loop over light sources.
		for (var j = 0; j < illumination.light.length; j++) {
			var lightNb = "light[" + j + "]";
			// Store one object for every light source.
			var l = {};
			l.isOn = gl.getUniformLocation(prog, lightNb + ".isOn");
			l.position = gl.getUniformLocation(prog, lightNb + ".position");
			l.color = gl.getUniformLocation(prog, lightNb + ".color");
			prog.lightUniform[j] = l;
		}

		// Material.
		prog.materialKaUniform = gl.getUniformLocation(prog, "material.ka");
		prog.materialKdUniform = gl.getUniformLocation(prog, "material.kd");
		prog.materialKsUniform = gl.getUniformLocation(prog, "material.ks");
		prog.materialKeUniform = gl.getUniformLocation(prog, "material.ke");

		// Toon Shading.
		prog.toonShadingUniform = gl.getUniformLocation(prog, "uToonShading");

		// Texture.
		prog.textureUniform = gl.getUniformLocation(prog, "uTexture");
		prog.hasTextureUniform = gl.getUniformLocation(prog, "uHasTexture");
	}

	/**
	 * @paramter material : objekt with optional ka, kd, ks, ke.
	 * @retrun material : objekt with ka, kd, ks, ke.
	 */
	function createPhongMaterial(material) {
		material = material || {};
		// Set some default values,
		// if not defined in material paramter.
		material.ka = material.ka || [0.3, 0.3, 0.3];
		material.kd = material.kd || [0.6, 0.6, 0.6];
		material.ks = material.ks || [0.8, 0.8, 0.8];
		material.ke = material.ke || 10.;

		return material;
	}

	function initModels() {
		// fill-style
		const fs = "fill";

		// Create some default material.
		var mDefault = createPhongMaterial();// Create some default material.
		var mRed = createPhongMaterial({ kd: [1., 0., 0.] });
		var mGreen = createPhongMaterial({ kd: [0., 1., 0.] });
		var mBlue = createPhongMaterial({ kd: [0., 0., 1.] });
		var mWhite = createPhongMaterial({
			ka: [1., 1., 1.], kd: [.5, .5, .5],
			ks: [0., 0., 0.]
		});
		// Matte planetary material - less shiny, better for textured surfaces
		var mPlanetary = createPhongMaterial({
			ka: [0.4, 0.4, 0.4],
			kd: [0.8, 0.8, 0.8],
			ks: [0.2, 0.2, 0.2],
			ke: 8.0
		});

		const cubeModel = new Model(
			new Cube({ size: 8, depth: 4, inward: true }),
			gl, prog,
			{
				fillstyle: 'fill',
				color: [1.0, 0.8, 0.5],
				material: mWhite,
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
				material: mPlanetary,
				transform: { translation: [-0.55, 0, 0.58], rotation: [-0.6, -Math.PI / 6, 0] }
			}
		);
		models.push(torusModel);
		torusModel.loadTexture(gl, '2k_mars.jpg');

		const sphereModel = new Model(
			new SphereLatLon({ radius: 1.0 }),
			gl, prog,
			{
				fillstyle: fs,
				color: [0.3, 0.8, 1.0],
				material: mPlanetary,
				transform: { translation: [0.5, 0.25, -0.6] }
			}
		);
		models.push(sphereModel);
		sphereModel.loadTexture(gl, '2k_mars.jpg');

		const pineModel = new Model(
			// new Cone({ radius: 0.47, height: 1.1, radialSegments: 32 }),
			new Pine(),
			gl, prog,
			{
				fillstyle: fs,
				color: [0.9, 0.5, 0.7],
				material: mPlanetary,
				transform: { translation: [0.5, -0.47, 0.7], scale: [0.7, 0.7, 0.7] }
			}
		);
		models.push(pineModel);
		pineModel.loadTexture(gl, '2k_mars.jpg');

	}

	// Update UI after models are initialized
	function _postInitUI() {
		// Wire up buttons if present
		if (typeof document !== 'undefined') {
			const play = document.getElementById('play-pause');
			if (play) {
				play.addEventListener('click', () => togglePlayPause());
				play.textContent = isPlaying ? 'Pause ❚❚' : 'Play ▶';
			}
			const lightPlay = document.getElementById('light-play-pause');
			if (lightPlay) {
				lightPlay.addEventListener('click', () => toggleLightPlayPause());
				lightPlay.textContent = isLightsPlaying ? 'Pause ❚❚' : 'Play ▶';
			}
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
				case ('k'):
				case ('K'):
					console.log("toggle lights");
					toggleLightPlayPause();
					break;
				case ('l'):
				case ('L'):
					console.log("step lights forward");
					stepLightsForward();
					break;
				case ('t'):
				case ('T'):
					console.log("toggle toon shading");
					toggleToonShading();
					break;
			}

			// Render the scene again on any key pressed.
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

		// NEW
		// Set light uniforms.
		gl.uniform3fv(prog.ambientLightUniform, illumination.ambientLight);
		// Loop over light sources.
		for (var j = 0; j < illumination.light.length; j++) {
			// bool is transferred as integer.
			gl.uniform1i(prog.lightUniform[j].isOn,
				illumination.light[j].isOn);
			// Tranform light postion in eye coordinates.
			// Copy current light position into a new array.
			var lightPos = [].concat(illumination.light[j].position);
			// Add homogenious coordinate for transformation.
			lightPos.push(1.0);
			vec4.transformMat4(lightPos, lightPos, camera.vMatrix);
			// Remove homogenious coordinate.
			lightPos.pop();
			gl.uniform3fv(prog.lightUniform[j].position, lightPos);
			gl.uniform3fv(prog.lightUniform[j].color,
				illumination.light[j].color);
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
			gl.uniformMatrix3fv(prog.nMatrixUniform, false, normalMatrix);
			gl.uniform4fv(prog.colorUniform, models[i].color || [1.0, 1.0, 1.0, 1.0]);
			// NEW
			// Material.
			gl.uniform3fv(prog.materialKaUniform, models[i].material.ka);
			gl.uniform3fv(prog.materialKdUniform, models[i].material.kd);
			gl.uniform3fv(prog.materialKsUniform, models[i].material.ks);
			gl.uniform1f(prog.materialKeUniform, models[i].material.ke);

			// Toon Shading.
			gl.uniform1i(prog.toonShadingUniform, isToonShadingEnabled ? 1 : 0);

			// Texture
			const hasTexture = models[i].texture && models[i].texture.loaded;
			gl.uniform1i(prog.hasTextureUniform, hasTexture ? 1 : 0);
			if (hasTexture) {
				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, models[i].texture);
				gl.uniform1i(prog.textureUniform, 0);
			}

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

		// Setup texture coordinate VBO if present
		if (model.vboTexCoord && prog.texCoordAttrib !== undefined) {
			gl.bindBuffer(gl.ARRAY_BUFFER, model.vboTexCoord);
			gl.vertexAttribPointer(prog.texCoordAttrib, 2, gl.FLOAT, false, 0, 0);
		}

		// Setup rendering tris.
		const fill = (model.fillstyle.search(/fill/) != -1);
		if (fill) {
			gl.enableVertexAttribArray(prog.normalAttrib);
			if (model.vboTexCoord && prog.texCoordAttrib !== undefined) {
				gl.enableVertexAttribArray(prog.texCoordAttrib);
			}
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
