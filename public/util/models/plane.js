/**
 * Plane generator - creates a grid plane useful as a floor or reference surface.
 */
class Plane extends VertexDataGenerator {

	createVertexData() {
		const width = Math.max(0.1, this.getParam('width', 10.0));
		const height = Math.max(0.1, this.getParam('height', 10.0));
		const segmentsX = Math.max(1, Math.floor(this.getParam('segmentsX', 10)));
		const segmentsZ = Math.max(1, Math.floor(this.getParam('segmentsZ', 10)));
		const orientation = this.getParam('orientation', 'xz'); // 'xz' (floor), 'xy' (wall), 'yz' (wall)

		const hw = width * 0.5;
		const hh = height * 0.5;

		const vertices = [];
		const normals = [];
		const triangleIndices = [];
		const lineIndices = new Set();

		// Generate vertices based on orientation
		for (let z = 0; z <= segmentsZ; z++) {
			for (let x = 0; x <= segmentsX; x++) {
				const u = x / segmentsX;
				const v = z / segmentsZ;
				
				let pos, normal;

				if (orientation === 'xz') {
					// Horizontal floor (XZ plane, Y = 0, normal pointing up)
					pos = [u * width - hw, 0, v * height - hh];
					normal = [0, 1, 0];
				} else if (orientation === 'xy') {
					// Vertical wall (XY plane, Z = 0, normal pointing forward)
					pos = [u * width - hw, v * height - hh, 0];
					normal = [0, 0, 1];
				} else if (orientation === 'yz') {
					// Side wall (YZ plane, X = 0, normal pointing right)
					pos = [0, v * height - hh, u * width - hw];
					normal = [1, 0, 0];
				}

				vertices.push(...pos);
				normals.push(...normal);
			}
		}

		// Generate triangle indices (CCW when viewed from normal direction)
		for (let z = 0; z < segmentsZ; z++) {
			for (let x = 0; x < segmentsX; x++) {
				const i0 = z * (segmentsX + 1) + x;
				const i1 = i0 + 1;
				const i2 = i0 + (segmentsX + 1);
				const i3 = i2 + 1;

				// First triangle
				triangleIndices.push(i0, i2, i1);
				// Second triangle
				triangleIndices.push(i1, i2, i3);
			}
		}

		// Generate line indices for grid
		// Horizontal lines (along X axis)
		for (let z = 0; z <= segmentsZ; z++) {
			for (let x = 0; x < segmentsX; x++) {
				const i0 = z * (segmentsX + 1) + x;
				const i1 = i0 + 1;
				const key = `${Math.min(i0, i1)}_${Math.max(i0, i1)}`;
				lineIndices.add(key);
			}
		}

		// Vertical lines (along Z axis)
		for (let x = 0; x <= segmentsX; x++) {
			for (let z = 0; z < segmentsZ; z++) {
				const i0 = z * (segmentsX + 1) + x;
				const i1 = i0 + (segmentsX + 1);
				const key = `${Math.min(i0, i1)}_${Math.max(i0, i1)}`;
				lineIndices.add(key);
			}
		}

		// Convert line indices to array
		const lines = [];
		for (const key of lineIndices) {
			const [i0, i1] = key.split('_').map(Number);
			lines.push(i0, i1);
		}

		this.vertices = new Float32Array(vertices);
		this.normals = new Float32Array(normals);
		this.indicesTris = new Uint16Array(triangleIndices);
		this.indicesLines = new Uint16Array(lines);
	}
}
