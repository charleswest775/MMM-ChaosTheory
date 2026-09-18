/* Symmetric chaotic "icons" (Field & Golubitsky, Symmetry in Chaos, 1992).
 * A single point hops about under
 *   z → (λ + α z z̄ + β Re(zⁿ) + i ω) z + γ z̄ⁿ⁻¹
 * which commutes with rotation by 2π/n and with reflection, so although each hop is
 * chaotic, the cloud of millions of visits is symmetric. The picture develops like a
 * photograph: visits are counted per pixel under a fixed time budget each frame, and
 * the counts are turned into colour a couple of times a second.
 */
(function (root) {
	// [λ, α, β, γ, ω, n]. Each set is checked by tests/icons.test.js to give a bounded chaotic
	// attractor with the full n-fold symmetry (some published-looking sets break symmetry).
	const ICONS = [
		{ name: "seven-fold flower", p: [-2.08, 1.0, -0.1, 0.167, 0, 7] },
		{ name: "spinning pentagram", p: [-2.5, 5.0, -1.9, 1.0, 0.188, 5] },
		{ name: "triple swirl", p: [1.56, -1.0, 0.1, -0.82, 0.12, 3] },
		{ name: "square vortex", p: [-1.86, 2.0, 0.0, 1.0, 0.1, 4] },
		{ name: "hexagonal lace", p: [-2.7, 5.0, 1.5, 1.0, 0, 6] }
	];

	// colour ramps: black → … → near white
	const PALETTES = [
		[[0, 0, 0], [20, 30, 120], [40, 150, 220], [180, 240, 255], [255, 255, 255]],
		[[0, 0, 0], [90, 10, 60], [220, 60, 90], [255, 180, 90], [255, 250, 230]],
		[[0, 0, 0], [10, 60, 50], [30, 170, 120], [200, 240, 140], [255, 255, 240]],
		[[0, 0, 0], [60, 20, 110], [170, 60, 220], [255, 150, 230], [255, 245, 255]]
	];
	const lut = (stops) => Array.from({ length: 256 }, (_, i) => {
		const v = (i / 255) * (stops.length - 1), k = Math.min(stops.length - 2, Math.floor(v)), f = v - k;
		return stops[k].map((c, j) => Math.round(c + (stops[k + 1][j] - c) * f));
	});

	// one hop of the map; returns [x, y]
	function hop (x, y, [lambda, alpha, beta, gamma, omega, n]) {
		const zz = x * x + y * y;
		// zⁿ⁻¹ by repeated multiplication; zⁿ = zⁿ⁻¹ z
		let px = x, py = y;
		for (let k = 1; k < n - 1; k++) { const t = px * x - py * y; py = px * y + py * x; px = t; }
		const re = px * x - py * y; // Re(zⁿ)
		const p = lambda + alpha * zz + beta * re;
		// z̄ⁿ⁻¹ is the conjugate of zⁿ⁻¹
		return [p * x - omega * y + gamma * px, p * y + omega * x - gamma * py];
	}

	class Icons {
		constructor ({ icon, budgetMs = 9, developSeconds = 45 } = {}) {
			this.icon = icon !== undefined ? ICONS[icon] : ICONS[Math.floor(Math.random() * ICONS.length)];
			this.lut = lut(PALETTES[Math.floor(Math.random() * PALETTES.length)]);
			this.budgetMs = budgetMs;
			this.developSeconds = developSeconds;
			this.x = 0.01; this.y = 0.003;
			for (let i = 0; i < 1000; i++) [this.x, this.y] = hop(this.x, this.y, this.icon.p);
			this.iterations = 0;
			this.t = 0;
			this.lastPaint = -1;
			this.resting = false;
		}

		layout (w, h) {
			if (this.counts && this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.counts = new Uint32Array(w * h);
			this.max = 1;
			// scale: from the extent of a short sample orbit
			let r = 0, x = this.x, y = this.y;
			for (let i = 0; i < 20000; i++) { [x, y] = hop(x, y, this.icon.p); r = Math.max(r, Math.abs(x), Math.abs(y)); }
			this.scale = (Math.min(w, h) / 2) * 0.94 / r;
			this.img = null;
		}

		step (dt) {
			this.t += dt;
			if (this.t > this.developSeconds && !this.resting) this.finishing = true;
		}

		// iterate for up to budgetMs, counting visits per pixel
		develop () {
			const { w, h, counts, scale, icon: { p: [lambda, alpha, beta, gamma, omega, n] } } = this;
			const cx = w / 2, cy = h / 2, end = performance.now() + this.budgetMs;
			let { x, y, max } = this, total = 0;
			do {
				for (let k = 0; k < 2000; k++) {
					// hop() inlined: no array per hop in this loop of millions
					let px = x, py = y;
					for (let m = 1; m < n - 1; m++) { const t = px * x - py * y; py = px * y + py * x; px = t; }
					const q = lambda + alpha * (x * x + y * y) + beta * (px * x - py * y);
					const nx = q * x - omega * y + gamma * px;
					y = q * y + omega * x - gamma * py;
					x = nx;
					const i = Math.round(cx + x * scale), j = Math.round(cy - y * scale);
					if (i >= 0 && j >= 0 && i < w && j < h) {
						const c = ++counts[j * w + i];
						if (c > max) max = c;
					}
				}
				total += 2000;
			} while (performance.now() < end);
			Object.assign(this, { x, y, max });
			this.iterations += total;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (!this.img) this.img = ctx.createImageData(w, h);
			this.develop();
			// colour the counts twice a second (a full-canvas copy is not free), and a last time when done
			if (this.t - this.lastPaint < 0.5 && !this.finishing) return;
			this.lastPaint = this.t;
			const { counts, lut } = this, data = this.img.data, norm = 255 / Math.log(1 + this.max);
			for (let k = 0, q = 0; k < counts.length; k++, q += 4) {
				const [r, g, b] = lut[counts[k] ? Math.min(255, Math.round(Math.log(1 + counts[k]) * norm * 1.15)) : 0];
				data[q] = r; data[q + 1] = g; data[q + 2] = b; data[q + 3] = 255;
			}
			ctx.putImageData(this.img, 0, 0);
			if (this.finishing) this.resting = true;
		}

		readout () {
			const [l, a, b, g, o, n] = this.icon.p;
			return `“${this.icon.name}”   λ = ${l}  α = ${a}  β = ${b}  γ = ${g}  ω = ${o}  n = ${n}\n` +
				`${(this.iterations / 1e6).toFixed(1)} million hops of a single point${this.resting ? " — done" : " …"}`;
		}
	}

	Icons.info = {
		title: "Symmetry in chaos",
		subtitle: "one point, hopping chaotically, millions of times",
		equations: [
			"z<sub>n+1</sub> = (λ + α z<sub>n</sub> z̄<sub>n</sub> + β Re(z<sub>n</sub><sup>n</sup>) + iω) z<sub>n</sub> + γ z̄<sub>n</sub><sup>n−1</sup>",
			"<span class=\"chaos-note\">each hop is unpredictable, yet the map has the symmetry of a regular n-gon, so the places the point visits (brighter = more often) form a symmetric picture — after Field &amp; Golubitsky, Symmetry in Chaos</span>"
		]
	};
	Icons.ICONS = ICONS;
	Icons.hop = hop;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.icons = Icons;
	if (typeof module !== "undefined") module.exports = { Icons };
})(typeof window !== "undefined" ? window : globalThis);
