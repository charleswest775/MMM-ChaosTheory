/* Not chaos: a snow crystal, grown live in Reiter's model (snow-model.js), a new one each
 * showing: a hexagonal plate, a stellar plate, a sectored plate, a stellar dendrite or a fern,
 * with its parameters jittered so no two are alike. It grows from one frozen cell to the edge
 * of the picture in about 20 s, and holds. Brighter ice holds more water: the ridges along the
 * arms, as in photographs of real crystals.
 *
 * For the Pi: the model computes a twelfth of the crystal, a few hundred to a few thousand steps
 * in all, paced so the crystal reaches its size in `snowSeconds` (and never more than a
 * budget of milliseconds per frame); the picture is redrawn five times a second, only as far as
 * the crystal reaches; once grown, the sim rests.
 */
(function (root) {
	const Snow = root.ChaosSnowModel || require("./snow-model.js");

	const N = 140;             // the grid's radius, in cells
	const TARGET = 0.86;       // the crystal is grown when it reaches this fraction of N
	const MARGIN = 0.96;       // the target radius, as a fraction of half the canvas
	const REFRESH = 0.2;       // seconds between redraws while it grows
	const BUDGET = 14;         // at most this many ms of model per frame
	const ICE = [[60, 84, 120], [150, 190, 235], [238, 246, 255]];

	// Shapes the model makes, and where: less vapour around (β) and more at the surface (γ) make
	// plates; more vapour, branches
	const HABITS = [
		{ name: "hexagonal plate", beta: [0.15, 0.35], gamma: [0.035, 0.05] },
		{ name: "stellar plate", beta: [0.15, 0.35], gamma: [0.01, 0.02] },
		{ name: "sectored plate", beta: [0.3, 0.45], gamma: [0.004, 0.007] },
		{ name: "stellar dendrite", beta: [0.36, 0.5], gamma: [0.0008, 0.002] },
		{ name: "fernlike stellar dendrite", beta: [0.55, 0.72], gamma: [0.0001, 0.001] }
	];

	const STORIES = [
		"In 1611 Johannes Kepler gave his patron a little book, A New Year's Gift of Hexagonal Snow, asking why snowflakes have six corners. He guessed at packed spheres; the answer is the hexagonal rings of water molecules in ice.",
		"Wilson Bentley, a Vermont farmer, took the first photograph of a snowflake in 1885 through a microscope in an unheated shed, and more than 5,000 after it. No two, he said, were alike.",
		"In 1936 Ukichiro Nakaya grew the first artificial snow crystals, on a rabbit hair in a cold room in Sapporo, and mapped their shapes by temperature and humidity. A snow crystal, he wrote, is a letter sent from the sky.",
		"Why branches: a corner reaches farther into the vapour than a face, so it catches more and grows faster, and the faster it grows the farther it reaches. Growth by diffusion makes branches, here as in lightning and river deltas.",
		"The six arms match because they grow together, in the same changing air as the crystal falls; no two crystals fall through the same air. Real ones are rarely perfect; this one grows in a perfectly even field."
	];

	// each pixel's cell, by picture size: the same for every crystal, so made once
	const maps = new Map();

	const between = ([lo, hi], f) => lo + (hi - lo) * f;
	const mix = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
	// the ice's colours by water, 0…255, packed as canvas pixels (little-endian RGBA)
	const LUT = Uint32Array.from({ length: 256 }, (_, k) => {
		const f = k / 255, c = f < 0.5 ? mix(ICE[0], ICE[1], f * 2) : mix(ICE[1], ICE[2], f * 2 - 1);
		return ((255 << 24) | ((c[2] & 255) << 16) | ((c[1] & 255) << 8) | (c[0] & 255)) >>> 0;
	});

	// decks shared by successive instances
	const decks = { habits: [], stories: [] };
	const deal = (name, n) => {
		const d = decks[name];
		if (!d.length) {
			for (let i = 0; i < n; i++) d.push(i);
			for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
		}
		return d.shift();
	};

	class SnowCrystal {
		// snowSeconds: time to grow; habit: its name; beta, gamma: exactly these; N: grid radius
		constructor ({ snowSeconds = 20, habit, beta, gamma, n = N } = {}) {
			this.habit = HABITS.find((h) => h.name === habit) || HABITS[deal("habits", HABITS.length)];
			this.beta = beta ?? Number(between(this.habit.beta, Math.random()).toFixed(3));
			this.gamma = gamma ?? Number(between(this.habit.gamma, Math.random()).toPrecision(2));
			this.story = STORIES[deal("stories", STORIES.length)];
			this.model = new Snow({ N: n, beta: this.beta, gamma: this.gamma });
			this.N = n;
			this.target = Math.round(TARGET * n);
			this.seconds = snowSeconds;
			this.t = 0;
			this.lastDraw = -Infinity;
			this.grown = false;
			this.resting = false;
			this.info = this.buildInfo();
		}

		// how big the crystal should be by now: quickly at first, as a real one grows
		wanted (t) {
			return this.target * Math.min(1, t / this.seconds) ** 0.8;
		}

		step (dt) {
			if (this.grown) return;
			this.t += dt;
			const m = this.model, until = this.wanted(this.t), start = Date.now();
			while (m.radius < until && Date.now() - start < BUDGET && m.steps < 30000) m.step();
			if (m.radius >= this.target || m.steps >= 30000 || this.t > this.seconds + 8) this.grown = true;
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			// the size of a cell: the target radius fills the picture
			const R = (Math.min(w, h) / 2) * MARGIN, d = R / this.target, P = Math.min(w, h);
			this.P = P; this.d = d;
			this.ox = Math.round((w - P) / 2); this.oy = Math.round((h - P) / 2);
			// each pixel's cell in the model's wedge, or −1
			const key = `${P},${d},${this.N}`;
			if (maps.has(key)) { this.map = maps.get(key); this.img = null; this.lastDraw = -Infinity; return; }
			const model = this.model, map = (this.map = new Int32Array(P * P).fill(-1));
			maps.set(key, map);
			const c = P / 2, s3 = Math.sqrt(3);
			for (let py = 0; py < P; py++) {
				for (let px = 0; px < P; px++) {
					const x = (px + 0.5 - c) / d, y = (py + 0.5 - c) / d;
					if (x * x + y * y > (this.N - 1) ** 2) continue;
					// the hexagon the point is in: axial coordinates, rounded in cube coordinates
					const r = (2 * y) / s3, q = x - r / 2;
					let rq = Math.round(q), rr = Math.round(r);
					const rs = Math.round(-q - r), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
					if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
					map[py * P + px] = model.at(rq, rr);
				}
			}
			this.img = null;
			this.lastDraw = -Infinity;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (!this.grown && this.t - this.lastDraw < REFRESH) return;
			this.lastDraw = this.t;
			this.paint(ctx);
			if (this.grown) this.resting = true;
		}

		// the ice, as far as it reaches, coloured by its water
		paint (ctx) {
			const { P, d, map, model } = this, { s, frozen } = model;
			if (!this.img) {
				this.img = ctx.createImageData(P, P);
				this.px = new Uint32Array(this.img.data.buffer);
				this.px.fill(0xff000000);
			}
			let smax = 1.0001;
			for (let i = 0; i < s.length; i++) if (frozen[i] && s[i] > smax) smax = s[i];
			// the square round the crystal, and a margin for the cells just grown
			const reach = Math.min(P / 2, Math.ceil((model.radius + 2) * d * 1.16));
			const lo = Math.max(0, Math.floor(P / 2 - reach)), hi = Math.min(P, Math.ceil(P / 2 + reach));
			const px = this.px, scale = 255 / (smax - 1);
			for (let py = lo; py < hi; py++) {
				for (let x = lo; x < hi; x++) {
					const k = py * P + x, i = map[k];
					px[k] = i < 0 || !frozen[i] ? 0xff000000 : LUT[Math.min(255, ((s[i] - 1) * scale) | 0)];
				}
			}
			ctx.putImageData(this.img, this.ox, this.oy, lo, lo, hi - lo, hi - lo);
		}

		buildInfo () {
			return {
				title: "A snow crystal",
				subtitle: `a ${this.habit.name}, grown in Reiter's model · β = ${this.beta}, γ = ${this.gamma}, α = 1`,
				equations: [
					"away from the ice, vapour diffuses: &nbsp;u ← u + <span class=\"frac\"><span>α</span><span>2</span></span>(ū − u), &nbsp;ū the mean of the six neighbours",
					"at the ice and next to it, water stays and γ more arrives: &nbsp;s ← s + γ; &nbsp;a cell freezes when s ≥ 1",
					`<span class="chaos-note">${this.story}</span>`
				]
			};
		}

		readout () {
			const m = this.model, cells = this.frozenCells();
			return `step ${m.steps.toLocaleString("en")}    ${cells.toLocaleString("en")} cells of ice    ${m.radius} cells from the centre\n` +
				`${this.grown ? `grown in ${Math.min(this.t, this.seconds + 8).toFixed(0)} s` : "growing"}`;
		}

		// ice cells in the whole crystal: each wedge cell stands for as many as it has images
		frozenCells () {
			const m = this.model;
			let total = 0;
			for (let i = 0; i < m.mult.length; i++) if (m.frozen[i]) total += m.mult[i];
			return total;
		}
	}

	SnowCrystal.HABITS = HABITS;
	SnowCrystal.info = { title: "A snow crystal", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.snow = SnowCrystal;
	if (typeof module !== "undefined") module.exports = { SnowCrystal };
})(typeof window !== "undefined" ? window : globalThis);
