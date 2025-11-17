var app = (function () {

	var gl;

	// The shader program object is also used to
	// store attribute and uniform locations.
	var prog;

	// Array of model objects.
	var models = [];

	// Global light defined in world space. We'll transform it into view space
	// every frame so lighting stays fixed relative to the scene (not the camera).
	var light = {
		direction: [0.2, -0.5, -0.1]
	};

	var camera = {
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

	function start() {
		init();
		render();
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
		var vs = initShader(gl.VERTEX_SHADER, "vertexshader");
		// Init fragment shader.
		var fs = initShader(gl.FRAGMENT_SHADER, "fragmentshader");
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
		var shader = gl.createShader(shaderType);
		var shaderSource = document.getElementById(SourceTagId).text;
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
		var fs = "fillwireframe";
		createModel("cube", 'fill', { size: 8, depth: 4, position: [0, 3.28, 0], rotation: [0, Math.PI / 4, 0], color: [1.0, 0.8, 0.5], inward: true });
		createModel("torus", fs, { position: [-0.55, 0, 0.58], rotation: [-0.6, -Math.PI / 6, 0], color: [0.6, 1.0, 0.7] });
		createModel("sphere", fs, { radius: 1.0, depth: 3, position: [0.5, 0.25, -0.6], color: [0.3, 0.8, 1.0] });
		createModel("cone", fs, { radius: 0.47, height: 1.1, radialSegments: 32, position: [0.5, -0.17, 0.7], color: [0.9, 0.5, 0.7] });
	}

	// Update UI after models are initialized
	function _postInitUI() {
		// Ensure recursion display reflects initial model state
		updateRecursionDisplay();
		// Wire up buttons if present
		if (typeof document !== 'undefined') {
			var inc = document.getElementById('recursion-increase');
			var dec = document.getElementById('recursion-decrease');
			if (inc) inc.addEventListener('click', function () { changeSphereRecursion(1); });
			if (dec) dec.addEventListener('click', function () { changeSphereRecursion(-1); });
		}
	}

	/**
	 * Create model object, fill it and push it in models array.
	 * 
	 * @parameter geometryname: string with name of geometry.
	 * @parameter fillstyle: wireframe, fill, fillwireframe.
	 */
	function createModel(geometryname, fillstyle, params) {
		var model = {};
		// remember geometry name for dynamic updates
		model.geometry = geometryname;
		model.fillstyle = fillstyle;
		// copy any provided params onto model for the createVertexData to use
		if (params) {
			for (var k in params) {
				if (Object.prototype.hasOwnProperty.call(params, k)) model[k] = params[k];
			}
			// also provide a params object for backward compatibility
			model.params = params;
		}
		initDataAndBuffers(model, geometryname);
		// Create and initialize Model-View-Matrix.
		model.mvMatrix = mat4.create();
		// Apply optional placement transform (position/translate, rotation, scale)
		setModelTransform(model, params || model.params || {});

		models.push(model);
	}

	/**
	 * Update the recursion level of the sphere model.
	 * level: integer 0..6
	 */
	function findModelsByGeometry(geometry) {
		var found = [];
		for (var i = 0; i < models.length; i++) {
			if (models[i].geometry === geometry) found.push(models[i]);
		}
		return found;
	}

	/**
	 * Apply a model transform (translation, rotation, scale) to model.mvMatrix.
	 * params may contain `position` or `translate` = [x,y,z],
	 * `rotation` = [rx,ry,rz] in radians (applied Z then Y then X),
	 * and `scale` = scalar or [sx,sy,sz].
	 */
	function setModelTransform(model, params) {
		if (!model || !model.mvMatrix) return;
		params = params || {};
		// start with identity
		mat4.identity(model.mvMatrix);
		// translation
		var t = params.position || params.translate;
		if (Array.isArray(t) && t.length >= 3) {
			mat4.translate(model.mvMatrix, model.mvMatrix, [t[0], t[1], t[2]]);
		}
		// rotation: apply Z, then Y, then X (if provided)
		var r = params.rotation;
		if (Array.isArray(r) && r.length >= 3) {
			if (r[2]) mat4.rotateZ(model.mvMatrix, model.mvMatrix, r[2]);
			if (r[1]) mat4.rotateY(model.mvMatrix, model.mvMatrix, r[1]);
			if (r[0]) mat4.rotateX(model.mvMatrix, model.mvMatrix, r[0]);
		}
		// scaling
		if (params.scale !== undefined) {
			if (Array.isArray(params.scale)) {
				mat4.scale(model.mvMatrix, model.mvMatrix, [params.scale[0], params.scale[1], params.scale[2]]);
			} else {
				mat4.scale(model.mvMatrix, model.mvMatrix, [params.scale, params.scale, params.scale]);
			}
		}
		// Store model color (default to white if not specified)
		model.color = params.color || [1.0, 1.0, 1.0];
	}

	/**
	 * Init data and buffers for model object.
	 * 
	 * @parameter model: a model object to augment with data.
	 * @parameter geometryname: string with name of geometry.
	 */
	function initDataAndBuffers(model, geometryname) {
		// Provide model object with vertex data arrays.
		// Fill data arrays for Vertex-Positions, Normals, Index data:
		// vertices, normals, indicesLines, indicesTris;
		// Pointer this refers to the window.
		this[geometryname]['createVertexData'].apply(model);

		// Setup position vertex buffer object.
		model.vboPos = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
		gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);
		// Bind vertex buffer to attribute variable.
		prog.positionAttrib = gl.getAttribLocation(prog, 'aPosition');
		gl.enableVertexAttribArray(prog.positionAttrib);

		// Setup normal vertex buffer object.
		model.vboNormal = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
		gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
		// Bind buffer to attribute variable.
		prog.normalAttrib = gl.getAttribLocation(prog, 'aNormal');
		gl.enableVertexAttribArray(prog.normalAttrib);

		// Setup lines index buffer object.
		model.iboLines = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesLines,
			gl.STATIC_DRAW);
		model.iboLines.numberOfElements = model.indicesLines.length;
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

		// Setup triangle index buffer object.
		model.iboTris = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesTris,
			gl.STATIC_DRAW);
		model.iboTris.numberOfElements = model.indicesTris.length;
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
	}

	function initEventHandler() {

		window.onkeydown = function (evt) {
			var c = evt.key;
			var shift = evt.shiftKey;
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
					camera.zAngle += 0.1;
					break;
				case ('C'):
				case ('ArrowLeft'):
				case ('a'):
					console.log("left");
					camera.zAngle -= 0.1;
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
					if (camera.xAngle <= 0) camera.xAngle = 0;
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
		var list = findModelsByGeometry('sphere');
		if (!list || list.length === 0) {
			console.log('No sphere model to change recursion.');
			return;
		}
		var changed = 0;
		for (var i = 0; i < list.length; i++) {
			var m = list[i];
			var cur = (m.depth !== undefined) ? m.depth : (m.params && m.params.depth !== undefined) ? m.params.depth : 4;
			var next = Math.max(0, Math.min(6, cur + delta));
			if (next !== cur) {
				m.depth = next;
				if (!m.params) m.params = {};
				m.params.depth = next;
				initDataAndBuffers(m, 'sphere');
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
		var list = findModelsByGeometry('sphere');
		if (!list || list.length === 0) return null;
		var m = list[0];
		return (m.depth !== undefined) ? m.depth : (m.params && m.params.depth !== undefined) ? m.params.depth : 4;
	}

	/**
	 * Update DOM element with id 'recursion-value' if present.
	 */
	function updateRecursionDisplay() {
		if (typeof document === 'undefined') return;
		var el = document.getElementById('recursion-value');
		if (!el) return;
		var v = getSphereRecursion();
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
			var lightDirView = vec3.create();
			var _tmpMat3 = mat3.create();
			mat3.fromMat4(_tmpMat3, camera.vMatrix);
			vec3.transformMat3(lightDirView, light.direction, _tmpMat3);
			vec3.normalize(lightDirView, lightDirView);
			gl.uniform3fv(prog.lightDirectionUniform, lightDirView);
		}

		// Loop over models.
		for (var i = 0; i < models.length; i++) {
			// models[i].mvMatrix holds the model (local) transform.
			// Compute ModelView = View * Model
			var mv = mat4.create();
			mat4.multiply(mv, camera.vMatrix, models[i].mvMatrix);

			// Calculate normal matrix (inverse transpose of model-view)
			var normalMatrix = mat3.create();
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
				var v = camera.lrtb;
				mat4.ortho(camera.pMatrix, -v, v, -v, v, -10, 10);
				break;
			case ("perspective"):
				mat4.perspective(camera.pMatrix, camera.fovy,
					camera.aspect, 0.1, 100);
				break;
			case ("frustum"):
				var v = camera.lrtb;
				mat4.frustum(camera.pMatrix, -v / 2 * camera.aspect, v / 2 * camera.aspect,
					-v / 2, v / 2, 1, 100);
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
		var fill = (model.fillstyle.search(/fill/) != -1);
		if (fill) {
			gl.enableVertexAttribArray(prog.normalAttrib);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
			gl.drawElements(gl.TRIANGLES, model.iboTris.numberOfElements,
				gl.UNSIGNED_SHORT, 0);
		}

		// Setup rendering lines.
		var wireframe = (model.fillstyle.search(/wireframe/) != -1);
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

}());
