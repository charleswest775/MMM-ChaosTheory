/* The vibrations of a square plate with free edges, the plate of Chladni's figures, by the
 * method Walther Ritz invented to solve it (1909): write the deflection as a mix of simple
 * shapes, products of the modes of a free–free beam in x and in y,
 *   w(x, y) = Σ A_mn X_m(x) X_n(y),
 * and let the energy choose the mix. The bending energy of a thin (Kirchhoff) plate,
 *   U = (D/2) ∬ (w_xx + w_yy)² − 2(1 − ν)(w_xx w_yy − w_xy²) dx dy,
 * against the kinetic energy (ρh ω²/2) ∬ w² gives a matrix eigenproblem K A = μ A (the beam
 * modes are orthonormal), whose eigenvalues are the plate's frequencies:
 *   λ = ω a² √(ρh / D) = 4 √μ   on a plate of side a = 2 (x, y from −1 to 1).
 * The free edges need no special care: the beam modes are free at their ends, and the energy
 * does the rest (that is the beauty of Ritz's method).
 *
 * The square's symmetry splits the modes by parity in x and in y, so each parity class is
 * solved on its own. Used by tools/chladni-modes.js to make data/chladni-modes.js, by the
 * tests to check it, and by chladni.js to evaluate a mode. UMD-style.
 */
(function (root) {
	// ---- the free–free beam on [−1, 1]: X'''' = k⁴ X, with X'' = X''' = 0 at both ends

	// Roots of tan k + tanh k = 0 (even modes) or tan k − tanh k = 0 (odd modes), by Newton's
	// method from their asymptotes (n − ¼)π and (n + ¼)π
	function beamRoots (parity, count) {
		const sign = parity === 0 ? 1 : -1, roots = [];
		for (let n = 1; n <= count; n++) {
			let k = (n + (parity === 0 ? -0.25 : 0.25)) * Math.PI;
			for (let it = 0; it < 50; it++) {
				// f = sin k cosh k ± cos k sinh k (tan k ± tanh k, times cos k cosh k)
				const f = Math.sin(k) * Math.cosh(k) + sign * Math.cos(k) * Math.sinh(k);
				const df = Math.cos(k) * Math.cosh(k) + Math.sin(k) * Math.sinh(k) + sign * (-Math.sin(k) * Math.sinh(k) + Math.cos(k) * Math.cosh(k));
				const dk = f / df;
				k -= dk;
				if (Math.abs(dk) < 1e-15 * k) break;
			}
			roots.push(k);
		}
		return roots;
	}

	// Gauss–Legendre nodes and weights on [−1, 1], n points (Newton on Legendre polynomials)
	function gaussLegendre (n) {
		const x = new Float64Array(n), w = new Float64Array(n);
		for (let i = 0; i < Math.ceil(n / 2); i++) {
			let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)), dp = 0;
			for (let it = 0; it < 100; it++) {
				let p0 = 1, p1 = z;
				for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
				dp = (n * (z * p1 - p0)) / (z * z - 1);
				const dz = p1 / dp;
				z -= dz;
				if (Math.abs(dz) < 1e-16) break;
			}
			x[i] = -z; x[n - 1 - i] = z;
			w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
		}
		return { x, w };
	}

	// composite rule: `pieces` panels of `per` points each
	function quadrature (pieces = 24, per = 10) {
		const g = gaussLegendre(per), x = [], w = [];
		for (let p = 0; p < pieces; p++) {
			const a = -1 + (2 * p) / pieces, h = 1 / pieces;
			for (let i = 0; i < per; i++) { x.push(a + h * (g.x[i] + 1)); w.push(h * g.w[i]); }
		}
		return { x: Float64Array.from(x), w: Float64Array.from(w) };
	}

	// The beam's modes of one parity (0 even, 1 odd), `count` of them: the rigid one (1, or x)
	// and then the bending ones. Each is { k, f(x) → [X, X', X''] }, normalised so ∫X² = 1.
	function beamModes (parity, count) {
		const modes = [];
		if (parity === 0) modes.push({ k: 0, f: () => [Math.SQRT1_2, 0, 0] });
		else modes.push({ k: 0, f: (x) => [x * Math.sqrt(1.5), Math.sqrt(1.5), 0] });
		const q = quadrature();
		for (const k of beamRoots(parity, count - 1)) {
			let raw;
			if (parity === 0) {
				const c = Math.cos(k), ch = Math.cosh(k);
				raw = (x) => [Math.cos(k * x) / c + Math.cosh(k * x) / ch,
					k * (-Math.sin(k * x) / c + Math.sinh(k * x) / ch),
					k * k * (-Math.cos(k * x) / c + Math.cosh(k * x) / ch)];
			} else {
				const s = Math.sin(k), sh = Math.sinh(k);
				raw = (x) => [Math.sin(k * x) / s + Math.sinh(k * x) / sh,
					k * (Math.cos(k * x) / s + Math.cosh(k * x) / sh),
					k * k * (-Math.sin(k * x) / s + Math.sinh(k * x) / sh)];
			}
			let norm = 0;
			for (let i = 0; i < q.x.length; i++) norm += q.w[i] * raw(q.x[i])[0] ** 2;
			const n = 1 / Math.sqrt(norm);
			modes.push({ k, f: (x) => raw(x).map((v) => v * n) });
		}
		return modes;
	}

	// ∫ of products of the beam modes and their derivatives: E[a][b][m][p] = ∫ X_m⁽ᵃ⁾ X_p⁽ᵇ⁾ dx
	function beamIntegrals (modes) {
		const q = quadrature(), M = modes.length;
		const vals = modes.map((m) => Array.from(q.x, (x) => m.f(x)));
		const E = (a, b) => Array.from({ length: M }, (_, m) => Array.from({ length: M }, (_, p) => {
			let s = 0;
			for (let i = 0; i < q.x.length; i++) s += q.w[i] * vals[m][i][a] * vals[p][i][b];
			return s;
		}));
		return { E00: E(0, 0), E11: E(1, 1), E22: E(2, 2), E02: E(0, 2) };
	}

	// ---- the symmetric eigenproblem, by cyclic Jacobi rotations: returns eigenvalues ascending
	// and the eigenvectors as rows
	function jacobi (A) {
		const n = A.length, a = A.map((r) => Float64Array.from(r));
		const v = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
		for (let sweep = 0; sweep < 100; sweep++) {
			let off = 0;
			for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
			if (off < 1e-26) break;
			for (let p = 0; p < n; p++) {
				for (let q = p + 1; q < n; q++) {
					if (Math.abs(a[p][q]) < 1e-300) continue;
					const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
					const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
					const c = 1 / Math.sqrt(t * t + 1), s = t * c;
					for (let k = 0; k < n; k++) { // rows p, q
						const akp = a[k][p], akq = a[k][q];
						a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
					}
					for (let k = 0; k < n; k++) { // columns p, q
						const apk = a[p][k], aqk = a[q][k];
						a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
					}
					for (let k = 0; k < n; k++) {
						const vpk = v[p][k], vqk = v[q][k];
						v[p][k] = c * vpk - s * vqk; v[q][k] = s * vpk + c * vqk;
					}
				}
			}
		}
		const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
		return { values: order.map((i) => a[i][i]), vectors: order.map((i) => Array.from(v[i])) };
	}

	// The modes of one parity class (px, py ∈ {0 even, 1 odd}) with M beam modes each way:
	// [{ lambda, A (M × M, row m for X_m(x), column n for X_n(y)) }], rigid motions left out
	function solveClass (px, py, M, nu) {
		const bx = beamIntegrals(beamModes(px, M)), by = px === py ? bx : beamIntegrals(beamModes(py, M));
		const N = M * M, K = Array.from({ length: N }, () => new Float64Array(N));
		for (let m = 0; m < M; m++) {
			for (let n = 0; n < M; n++) {
				for (let p = 0; p < M; p++) {
					for (let q = 0; q < M; q++) {
						K[m * M + n][p * M + q] =
							bx.E22[m][p] * by.E00[n][q] + bx.E00[m][p] * by.E22[n][q] +
							nu * (bx.E02[p][m] * by.E02[n][q] + bx.E02[m][p] * by.E02[q][n]) +
							2 * (1 - nu) * bx.E11[m][p] * by.E11[n][q];
					}
				}
			}
		}
		// symmetrise away rounding
		for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) K[i][j] = K[j][i] = (K[i][j] + K[j][i]) / 2;
		const { values, vectors } = jacobi(K);
		const out = [];
		values.forEach((mu, i) => {
			if (mu < 1e-6) return; // a rigid motion: w = 1, x or y
			const A = Array.from({ length: M }, (_, m) => vectors[i].slice(m * M, (m + 1) * M));
			out.push({ lambda: 4 * Math.sqrt(mu), A });
		});
		return out;
	}

	// All four classes: [{ px, py, lambda, A }], by frequency
	function solve (M = 12, nu = 0.3) {
		const all = [];
		for (const [px, py] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
			for (const m of solveClass(px, py, M, nu)) all.push({ px, py, ...m });
		}
		return all.sort((a, b) => a.lambda - b.lambda);
	}

	// ---- evaluating a mode

	// the beam modes' values (not derivatives) at points xs: rows by mode
	function beamTable (parity, M, xs) {
		return beamModes(parity, M).map((m) => Float64Array.from(xs, (x) => m.f(x)[0]));
	}

	// w on an n × n grid over the plate (x, y from −1 to 1, cell centres), row by row from
	// y = −1: for a mode { px, py, A } and, if `swap` is ±1, plus or minus the same mode turned
	// through 90° (w(x, y) ± w(y, x): a degenerate pair's combinations)
	function grid (mode, n, swap = 0) {
		const M = mode.A.length, xs = Array.from({ length: n }, (_, i) => -1 + (2 * i + 1) / n);
		const X = beamTable(mode.px, M, xs), Y = beamTable(mode.py, M, xs);
		const w = new Float64Array(n * n);
		// w(x, y) = Σ_m X_m(x) Σ_n A_mn Y_n(y)
		const B = Array.from({ length: M }, (_, m) => {
			const row = new Float64Array(n);
			for (let q = 0; q < M; q++) { const a = mode.A[m][q]; if (a) for (let j = 0; j < n; j++) row[j] += a * Y[q][j]; }
			return row;
		});
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < n; i++) {
				let s = 0;
				for (let m = 0; m < M; m++) s += X[m][i] * B[m][j];
				w[j * n + i] = s;
			}
		}
		if (swap) {
			const t = Float64Array.from(w);
			for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) w[j * n + i] = t[j * n + i] + swap * t[i * n + j];
		}
		return w;
	}

	const Plate = { beamRoots, beamModes, beamIntegrals, gaussLegendre, quadrature, jacobi, solveClass, solve, beamTable, grid };
	root.ChaosPlate = Plate;
	if (typeof module !== "undefined") module.exports = Plate;
})(typeof window !== "undefined" ? window : globalThis);
