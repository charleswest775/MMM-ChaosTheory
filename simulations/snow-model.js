/* Reiter's model of a growing snow crystal (C. A. Reiter, "A local cellular model for snow crystal
 * growth", Chaos, Solitons & Fractals 23, 2005). A hexagonal grid of cells, each holding an
 * amount of water s; a cell is ice once s ≥ 1, and "receptive" if it is ice or touches ice.
 * Each step:
 *   receptive cells keep their water and gain γ (vapour arriving from outside the plane);
 *   the rest diffuse: u ← u + (α/2)(ū − u), ū the mean over the six neighbours (receptive
 *   neighbours counting as 0: they absorb what reaches them);
 *   s = what was kept + what diffused.
 * Far away, the cells hold β, a reservoir of vapour. From one frozen cell in a field of β the
 * crystal grows: plates, stars, ferns, depending on β and γ (α = 1 here).
 *
 * The crystal keeps the grid's twelve symmetries, so only a twelfth of it is computed: cells with
 * axial coordinates 0 ≤ r ≤ q, whose neighbours outside that wedge are mapped back into it.
 * UMD-style, so the tests can run it in Node.
 */
(function (root) {
	// the twelve symmetries of the hexagonal grid on axial coordinates (q, r)
	const rotate = ([q, r]) => [-r, q + r];        // by 60°
	const mirror = ([q, r]) => [q + r, -r];        // in the q axis
	function images (c) {
		const out = [];
		let p = c;
		for (let k = 0; k < 6; k++) { out.push(p, mirror(p)); p = rotate(p); }
		return out;
	}
	// the image of a cell in the wedge 0 ≤ r ≤ q
	const canonical = (c) => images(c).find(([q, r]) => r >= 0 && q >= r);
	const hexDistance = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
	const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

	class Snow {
		// N: the grid's radius in cells; the reservoir is the ring at distance N
		constructor ({ N = 150, alpha = 1, beta = 0.4, gamma = 0.001 } = {}) {
			Object.assign(this, { N, alpha, beta, gamma });
			// the wedge's cells, and for each its six neighbours' indices in the wedge (−1: reservoir)
			const index = new Map(), cells = [];
			for (let q = 0; q <= N; q++) {
				for (let r = 0; r <= q; r++) {
					if (hexDistance([q, r]) >= N) continue;
					index.set(`${q},${r}`, cells.length);
					cells.push([q, r]);
				}
			}
			this.cells = cells;
			this.index = index;
			const n = cells.length;
			// every cell of the whole grid → its wedge cell (−1 outside), at (q + N)(2N + 1) + (r + N);
			// and how many cells of the whole grid each wedge cell stands for
			const W = 2 * N + 1;
			this.full = new Int32Array(W * W).fill(-1);
			this.mult = new Uint8Array(n);
			cells.forEach((c, i) => {
				const seen = new Set();
				for (const [q, r] of images(c)) {
					this.full[(q + N) * W + (r + N)] = i;
					seen.add(`${q},${r}`);
				}
				this.mult[i] = seen.size;
			});
			this.nbr = new Int32Array(n * 6);
			cells.forEach(([q, r], i) => {
				NEIGHBOURS.forEach(([dq, dr], k) => {
					const c = canonical([q + dq, r + dr]);
					const j = hexDistance([q + dq, r + dr]) >= N ? -1 : index.get(`${c[0]},${c[1]}`);
					this.nbr[i * 6 + k] = j === undefined ? -1 : j;
				});
			});
			this.s = new Float64Array(n).fill(beta);
			this.s[0] = 1; // the seed, at the centre
			this.u = new Float64Array(n);
			this.frozen = new Uint8Array(n);
			this.frozen[0] = 1;
			this.receptive = new Uint8Array(n);
			this.steps = 0;
			this.radius = 0;       // the farthest frozen cell's hex distance
			this.frozenCount = 1;  // in the wedge
			this.markReceptive();
		}

		markReceptive () {
			const { frozen, nbr, receptive } = this;
			for (let i = 0; i < frozen.length; i++) {
				let rec = frozen[i];
				for (let k = 0; !rec && k < 6; k++) { const j = nbr[i * 6 + k]; if (j >= 0 && frozen[j]) rec = 1; }
				receptive[i] = rec;
			}
		}

		step () {
			const { s, u, nbr, receptive, frozen, alpha, beta, gamma } = this, n = s.length;
			// what diffuses: the water of cells that aren't receptive
			for (let i = 0; i < n; i++) u[i] = receptive[i] ? 0 : s[i];
			let changed = false;
			for (let i = 0; i < n; i++) {
				let sum = 0;
				for (let k = 0; k < 6; k++) { const j = nbr[i * 6 + k]; sum += j < 0 ? beta : u[j]; }
				const diffused = u[i] + (alpha / 2) * (sum / 6 - u[i]);
				const kept = receptive[i] ? s[i] + gamma : 0;
				s[i] = kept + diffused;
				if (!frozen[i] && s[i] >= 1) {
					frozen[i] = 1;
					changed = true;
					this.frozenCount++;
					const d = hexDistance(this.cells[i]);
					if (d > this.radius) this.radius = d;
				}
			}
			if (changed) this.markReceptive();
			this.steps++;
		}
	}

	// the wedge cell standing for grid cell (q, r), or −1 outside the grid
	Snow.prototype.at = function (q, r) {
		const { N } = this, W = 2 * N + 1;
		if (q < -N || q > N || r < -N || r > N) return -1;
		return this.full[(q + N) * W + (r + N)];
	};

	Snow.canonical = canonical;
	Snow.images = images;
	Snow.hexDistance = hexDistance;
	root.ChaosSnowModel = Snow;
	if (typeof module !== "undefined") module.exports = Snow;
})(typeof window !== "undefined" ? window : globalThis);
