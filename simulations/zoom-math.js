/* The arithmetic behind the fractal zoom: escape times for the Mandelbrot set and Julia sets,
 * the points the zoom dives into, and the colouring. Shared by the page (zoom.js), the
 * workers that render keyframes off the main thread (zoom-worker.js) and the tests.
 *
 * Every target is a point exactly on the fractal's boundary, where there is detail at every
 * scale: a Misiurewicz point (the orbit of 0 lands on a repelling cycle) or the repelling
 * fixed point of a Julia set. Near such a point the picture repeats itself, scaled and turned
 * by the cycle's multiplier ρ, so the zoom can go on as long as the arithmetic holds out.
 */
(function (root) {
	const BAILOUT = 256;              // large, so the smooth iteration count is accurate
	const LOG2 = Math.log(2);
	const LOG_BAILOUT = Math.log(BAILOUT);
	const HIST_BINS = 256;

	// Smooth escape time of one point: z ← z² + c from z₀, or -1 if it never escapes within
	// maxIter (or its orbit is caught cycling: then it is inside for good).
	// ν = n + 1 − log₂(ln|zₙ| / ln R) is continuous across the bands of whole iterations.
	// tol: how close a return counts as cycling. It must be well below the pixel size, or
	// points just outside the set would be painted as inside.
	function escape (zx, zy, cx, cy, maxIter, tol) {
		let x2 = zx * zx, y2 = zy * zy;
		let sx = zx, sy = zy, next = 8;   // Brent's cycle detection: compare with a saved z
		for (let n = 0; n < maxIter; n++) {
			zy = 2 * zx * zy + cy;
			zx = x2 - y2 + cx;
			x2 = zx * zx; y2 = zy * zy;
			if (x2 + y2 > BAILOUT * BAILOUT) {
				return n + 2 - Math.log(Math.log(x2 + y2) / 2 / LOG_BAILOUT) / LOG2;
			}
			if (Math.abs(zx - sx) + Math.abs(zy - sy) < tol) return -1;
			if (n === next) { sx = zx; sy = zy; next *= 2; }
		}
		return -1;
	}

	// z ↦ z² + c applied to (x, y) n times; returns [x, y]
	function orbit (x, y, cx, cy, n) {
		for (let k = 0; k < n; k++) [x, y] = [x * x - y * y + cx, 2 * x * y + cy];
		return [x, y];
	}

	// Escape times for a w×h grid centred on (cx, cy), `size` wide across the shorter side
	// (pixels square). Writes into out (Float32Array, row-major) and returns a few statistics
	// for choosing the next keyframe's iteration limit.
	// family: "mandelbrot" (c = pixel, z₀ = 0) or "julia" (z₀ = pixel, c = (jx, jy)).
	// firstRow, rowStep: compute only every rowStep-th row, so workers can share a keyframe
	// (interleaved, each gets a fair share of the slow rows); out then holds just those rows.
	function render ({ family, cx, cy, size, w, h, maxIter, jx = 0, jy = 0, firstRow = 0, rowStep = 1 }, out) {
		const d = size / Math.min(w, h);
		const x0 = cx - (d * (w - 1)) / 2, y0 = cy + (d * (h - 1)) / 2; // y up
		const tol = d * 1e-4;
		const julia = family === "julia";
		const hist = new Uint32Array(HIST_BINS); // escape times, maxIter / HIST_BINS per bin
		const binOf = HIST_BINS / maxIter;
		let escaped = 0, maxSeen = 0, sum = 0, o = 0;
		for (let j = firstRow; j < h; j += rowStep) {
			const py = y0 - j * d;
			for (let i = 0; i < w; i++) {
				const px = x0 + i * d;
				let mu;
				if (julia) mu = escape(px, py, jx, jy, maxIter, tol);
				else if (inMainBulbs(px, py)) mu = -1;
				else mu = escape(0, 0, px, py, maxIter, tol);
				out[o++] = mu;
				if (mu >= 0) {
					escaped++; sum += mu; if (mu > maxSeen) maxSeen = mu;
					hist[Math.min(HIST_BINS - 1, (mu * binOf) | 0)]++;
				}
			}
		}
		return { escaped, inside: o - escaped, maxSeen, sum, hist, maxIter };
	}

	// The escape time that all but a fraction of the escaping pixels beat, from render()'s
	// histogram (to within a bin).
	function percentile ({ hist, maxIter, escaped }, fraction) {
		let left = escaped * fraction;
		for (let b = HIST_BINS - 1; b >= 0; b--) {
			left -= hist[b];
			if (left < 0) return ((b + 1) * maxIter) / HIST_BINS;
		}
		return 0;
	}

	// the main cardioid and the period-2 disc, where most of the black of the full set is
	function inMainBulbs (x, y) {
		const q = (x - 0.25) * (x - 0.25) + y * y;
		if (q * (q + (x - 0.25)) <= 0.25 * y * y) return true;
		return (x + 1) * (x + 1) + y * y <= 0.0625;
	}

	// ---- targets --------------------------------------------------------------------------

	// Newton's method for a Misiurewicz parameter: the c for which the orbit of 0 lands, after
	// exactly m steps, on a cycle of period p. Solves A(c) = f^(m+p)(0) − f^m(0) = 0 divided by
	// B(c) = f^(m−1+p)(0) − f^(m−1)(0), whose roots are the points that land sooner (and the
	// centres of cycles), which Newton on A alone likes to fall into. Starts from a guess good
	// to several digits and returns c to full double precision.
	function misiurewicz (m, p, [cx, cy], iterations = 100) {
		const div = (a, b, c, d) => { const q = c * c + d * d; return [(a * c + b * d) / q, (b * c - a * d) / q]; };
		for (let it = 0; it < iterations; it++) {
			// z and dz/dc along the orbit of 0
			const zs = [[0, 0, 0, 0]];
			let zx = 0, zy = 0, dx = 0, dy = 0;
			for (let n = 1; n <= m + p; n++) {
				[dx, dy] = [2 * (zx * dx - zy * dy) + 1, 2 * (zx * dy + zy * dx)];
				[zx, zy] = [zx * zx - zy * zy + cx, 2 * zx * zy + cy];
				zs.push([zx, zy, dx, dy]);
			}
			const diff = (a, b) => a.map((v, i) => v - b[i]);
			const A = diff(zs[m + p], zs[m]), B = diff(zs[m - 1 + p], zs[m - 1]);
			// (A/B)' / (A/B) = A'/A − B'/B
			const [ax, ay] = div(A[2], A[3], A[0], A[1]), [bx, by] = div(B[2], B[3], B[0], B[1]);
			const [sx, sy] = div(1, 0, ax - bx, ay - by);
			if (!isFinite(sx) || !isFinite(sy)) break;
			cx -= sx; cy -= sy;
			if (Math.hypot(sx, sy) < 1e-17) break;
		}
		return [cx, cy];
	}

	// The cycle the orbit of 0 lands on at c, found by iterating: its period and multiplier
	// ρ = (f^p)'(z) = Πₖ 2zₖ. |ρ| > 1 means the cycle repels, and then c is on the boundary
	// of the Mandelbrot set and the picture around it repeats, ×|ρ| larger and turned by arg ρ.
	function landingCycle (cx, cy, m, p) {
		let [zx, zy] = orbit(0, 0, cx, cy, m);
		let rx = 1, ry = 0;
		for (let k = 0; k < p; k++) {
			[rx, ry] = [2 * (rx * zx - ry * zy), 2 * (rx * zy + ry * zx)];
			[zx, zy] = [zx * zx - zy * zy + cx, 2 * zx * zy + cy];
		}
		return { rho: [rx, ry] };
	}

	// Julia set of z² + c: the fixed point α = (1 − √(1 − 4c)) / 2, where the set's arms meet.
	// It repels (|2α| > 1) for c outside the main cardioid, and then it is on the Julia set.
	function juliaAlpha (cx, cy) {
		const [sx, sy] = csqrt(1 - 4 * cx, -4 * cy);
		const ax = (1 - sx) / 2, ay = -sy / 2;
		return { point: [ax, ay], rho: [2 * ax, 2 * ay] };
	}

	function csqrt (x, y) {
		const r = Math.hypot(x, y);
		const re = Math.sqrt((r + x) / 2), im = Math.sqrt((r - x) / 2);
		return [re, y < 0 ? -im : im];
	}

	// The dives, in the order they are shown: Misiurewicz points of the Mandelbrot set (m, p
	// and a guess good to a few digits; the exact point is found by Newton's method) and Julia
	// sets. start: width of the first view, the whole set.
	const TARGETS = [
		{ key: "seahorse", family: "mandelbrot", name: "Seahorse Valley", m: 23, p: 2, guess: [-0.77661059, 0.13460896], start: 3 },
		{ key: "julia-spiral", family: "julia", name: "A Julia set's spiral", c: [-0.8, 0.156], start: 3.4 },
		{ key: "elephant", family: "mandelbrot", name: "Elephant Valley", m: 12, p: 3, guess: [0.36487409, 0.07292786], start: 3 },
		{ key: "star", family: "mandelbrot", name: "Where three arms meet", m: 4, p: 1, guess: [-0.10109636, 0.95628651], start: 3 },
		{ key: "north", family: "mandelbrot", name: "The north bulb's filigree", m: 12, p: 4, guess: [-0.40483550, 0.63952199], start: 3 }
	];

	// Where each target's dive ends: [x, y], the scale factor of its self-similarity, and
	// how that is known. Computed once, to full precision.
	function resolve (t) {
		if (t.family === "julia") {
			const { point, rho } = juliaAlpha(t.c[0], t.c[1]);
			return { ...t, center: point, repeat: Math.hypot(...rho), turn: Math.atan2(rho[1], rho[0]), why: "alpha" };
		}
		const center = misiurewicz(t.m, t.p, t.guess);
		const { rho } = landingCycle(center[0], center[1], t.m, t.p);
		return { ...t, center, repeat: Math.hypot(...rho), turn: Math.atan2(rho[1], rho[0]), why: "misiurewicz" };
	}

	// The deepest keyframe worth rendering at this centre and resolution: a pixel must stay
	// hundreds of units in the last place of the coordinates, or the picture dissolves into
	// rounding noise. (A double carries 53 bits: about 10⁻¹⁶ relative.)
	function maxDepth (center, start, pixels) {
		const scale = Math.max(1, Math.hypot(center[0], center[1]));
		return Math.floor(Math.log2(start / pixels / (scale * 2 ** -52 * 1024)));
	}

	// ---- colour ---------------------------------------------------------------------------

	// A cyclic gradient: deep blue, white, gold, rust, near black, and round again.
	const STOPS = [
		[0.00, [0, 7, 100]],
		[0.16, [32, 107, 203]],
		[0.42, [237, 255, 255]],
		[0.6425, [255, 170, 0]],
		[0.8575, [100, 2, 0]],
		[1.00, [0, 7, 100]]
	];
	const LUT_SIZE = 1024;
	const LUT = (() => {
		const lut = new Uint8Array(LUT_SIZE * 3);
		for (let i = 0; i < LUT_SIZE; i++) {
			const t = i / LUT_SIZE;
			let k = 0;
			while (STOPS[k + 1][0] < t) k++;
			const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
			const f = (t - t0) / (t1 - t0), s = f * f * (3 - 2 * f); // smoothstep between stops
			for (let ch = 0; ch < 3; ch++) lut[i * 3 + ch] = Math.round(c0[ch] + (c1[ch] - c0[ch]) * s);
		}
		return lut;
	})();

	// Escape times to RGBA. Colour follows log ν, so the bands stay about as wide on screen
	// at every depth although the escape times keep growing; offset shifts the gradient.
	function colorize (mu, rgba, { density = 3, offset = 0 } = {}) {
		for (let i = 0; i < mu.length; i++) {
			const v = mu[i], o = i * 4;
			if (v < 0) { rgba[o] = rgba[o + 1] = rgba[o + 2] = 0; rgba[o + 3] = 255; continue; }
			let t = Math.log(v + 1) * density + offset;
			t -= Math.floor(t);
			const k = ((t * LUT_SIZE) | 0) * 3;
			rgba[o] = LUT[k]; rgba[o + 1] = LUT[k + 1]; rgba[o + 2] = LUT[k + 2]; rgba[o + 3] = 255;
		}
	}

	const ZoomMath = { BAILOUT, escape, orbit, render, percentile, inMainBulbs, misiurewicz, landingCycle, juliaAlpha,
		TARGETS, resolve, maxDepth, colorize };
	root.ChaosZoomMath = ZoomMath;
	if (typeof module !== "undefined") module.exports = ZoomMath;
})(typeof window !== "undefined" ? window : globalThis);
