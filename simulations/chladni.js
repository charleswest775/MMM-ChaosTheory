/* Not chaos: Chladni figures. Sand on a square plate with free edges, vibrating in one of its
 * modes (plate.js, data/chladni-modes.js). Where the plate moves, its acceleration throws the
 * grains up and they land a little way off; where it hardly moves, along the nodal lines, it
 * can't lift them. So the sand wanders off the moving parts and comes to rest on the still ones,
 * and draws the mode.
 *
 * A grain hops only where the plate's amplitude (and so its acceleration, ω² times it) is more
 * than a threshold, and hops farther the more the plate moves there: in a random direction, but
 * a little more often downhill, away from the bigger motion, as the tilted plate kicks it. Below
 * the threshold the plate can't throw it, only nudge it, and it creeps the rest of the way onto
 * the nodal line. Grains that hop off the edge fall off, as real sand does.
 *
 * For the Pi: the sand is a pixel buffer, and each frame changes only the pixels whose grains
 * moved, within their bounding box (putImageData's dirty rectangle). While the plate sings,
 * that is most of it; once the sand has settled the plate falls silent and the sim rests.
 */
(function (root) {
	const Plate = root.ChaosPlate || require("./plate.js");
	const MODES = root.ChaosChladniModes || require("../data/chladni-modes.js");

	// every figure, by frequency: a mode, or one of a pair's two combinations
	const FIGURES = MODES.flatMap((mode) => (mode.swaps ? mode.swaps.map((swap) => ({ mode, swap })) : [{ mode, swap: 0 }]))
		.sort((a, b) => a.mode.lambda - b.mode.lambda || b.swap - a.swap);
	FIGURES.forEach((f, i) => { f.number = i + 1; });

	// the plate the frequencies are for: 20 cm square, 1 mm thick, steel
	const PLATE = { side: 0.2, thickness: 0.001, E: 200e9, rho: 7850, nu: 0.3 };
	const rigidity = (p) => (p.E * p.thickness ** 3) / (12 * (1 - p.nu ** 2));
	// f = λ / (2π a²) · √(D / ρh)
	const hertz = (lambda, p = PLATE) => (lambda / (2 * Math.PI * p.side ** 2)) * Math.sqrt(rigidity(p) / (p.rho * p.thickness));

	const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
	// the nearest note of the equal-tempered scale (A4 = 440 Hz) and how far off, in cents
	function note (f) {
		const n = 69 + 12 * Math.log2(f / 440), k = Math.round(n), cents = Math.round((n - k) * 100);
		const name = `${NOTES[((k % 12) + 12) % 12]}${Math.floor(k / 12) - 1}`;
		return cents ? `${name} ${cents > 0 ? "+" : "−"}${Math.abs(cents)} cents` : name;
	}

	const GRID = 160;        // amplitude samples across the plate
	const THRESHOLD = 0.06;  // no hop where the amplitude is below this fraction of the largest
	const CREEP = 0.02;      // below it, a nudge towards the nodal line: this × the amplitude
	// The longest hop, at the antinodes, in half-widths of the plate, for a mode with λ = 100.
	// Nodal lines are closer together the higher the mode, as 1/√λ, and so are the hops, so every
	// figure takes about as long to form.
	const HOP = 0.026;
	const DOWNHILL = 0.3;    // how much of a hop, on average, is away from the bigger motion
	const RATE = 30;         // hops per second (each a substep)
	const APPEAR = 0.8;      // seconds before the bow starts: the sand lies scattered
	const RAMP = 1.5;        // seconds for the note to swell
	const MARGIN = 0.9;      // the plate's side, as a fraction of the canvas

	const STORIES = [
		"Ernst Chladni, who trained in law before he turned to music and sound, published these figures in 1787: he held a plate at one point, drew a violin bow across its edge, and let the sand show where it was still.",
		"Napoleon watched Chladni's demonstration in Paris and funded a prize for a theory of it. Sophie Germain, self-taught and as a woman barred from the universities, won it in 1816: the first woman to win a prize of the Paris Academy of Sciences.",
		"Germain's equation was right but her edge conditions were not; Kirchhoff found the right ones in 1850. The square plate with free edges held out until Walther Ritz solved it in 1909, by the method used here.",
		"Fine powder does the opposite and gathers where the plate moves most: in 1831 Michael Faraday showed that it is carried there by the air the plate stirs up.",
		"Violin makers still sprinkle glitter on their unfinished plates, and carve until the figures of the ring and X modes come out right."
	];

	// mulberry32: seeded, so the tests can repeat a run
	function random (seed) {
		let s = seed >>> 0;
		return () => {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	// decks still to show, shared by successive instances
	const decks = { figures: [], stories: [] };
	const deal = (name, n) => {
		if (!decks[name].length) {
			const deck = Array.from({ length: n }, (_, i) => i);
			for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
			decks[name] = deck;
		}
		return decks[name].shift();
	};

	class Chladni {
		// chladniSeconds: how long the plate sings; chladniGrains: grains of sand;
		// figure: this one (1…49); seed: for the sand
		constructor ({ chladniSeconds = 14, chladniGrains = 22000, figure, seed = Math.floor(Math.random() * 2 ** 32) } = {}) {
			this.figure = FIGURES[figure >= 1 && figure <= FIGURES.length ? figure - 1 : deal("figures", FIGURES.length)];
			this.story = STORIES[deal("stories", STORIES.length)];
			this.seconds = chladniSeconds;
			this.hop = HOP * Math.sqrt(100 / this.figure.mode.lambda);
			this.rnd = random(seed);
			// |w| on a grid, as a fraction of its largest; and w's sign, for the tint
			const { mode, swap } = this.figure;
			const w = Plate.grid(mode, GRID, swap);
			let max = 0;
			for (const v of w) max = Math.max(max, Math.abs(v));
			this.w = Float32Array.from(w, (v) => v / max);
			// which way |w| grows, as a unit vector: sign(w) ∇w / |∇w|
			this.ux = new Float32Array(GRID * GRID); this.uy = new Float32Array(GRID * GRID);
			for (let j = 0; j < GRID; j++) {
				for (let i = 0; i < GRID; i++) {
					const at = (a, b) => this.w[Math.min(GRID - 1, Math.max(0, b)) * GRID + Math.min(GRID - 1, Math.max(0, a))];
					const gx = at(i + 1, j) - at(i - 1, j), gy = at(i, j + 1) - at(i, j - 1), k = j * GRID + i;
					const sgn = Math.sign(this.w[k]) || 1, len = Math.hypot(gx, gy) || 1;
					this.ux[k] = (sgn * gx) / len; this.uy[k] = (sgn * gy) / len;
				}
			}
			// the sand, scattered evenly
			const n = chladniGrains;
			this.x = new Float32Array(n); this.y = new Float32Array(n);
			this.alive = new Uint8Array(n).fill(1);
			for (let i = 0; i < n; i++) { this.x[i] = this.rnd() * 2 - 1; this.y[i] = this.rnd() * 2 - 1; }
			this.t = 0;
			this.pending = 0;   // time not yet stepped
			this.hopping = n;   // grains that hopped in the last second
			this.hops = [];     // grains that hopped, per substep, for that count
			this.fallen = 0;
			this.resting = false;
			this.info = this.buildInfo();
		}

		// the plate's amplitude at (x, y), bilinear on the grid, as a fraction of the largest
		amplitude (x, y) {
			const gx = Math.min(GRID - 1.001, Math.max(0, ((x + 1) / 2) * GRID - 0.5));
			const gy = Math.min(GRID - 1.001, Math.max(0, ((y + 1) / 2) * GRID - 0.5));
			const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j, w = this.w, k = j * GRID + i;
			return Math.abs((w[k] * (1 - fx) + w[k + 1] * fx) * (1 - fy) + (w[k + GRID] * (1 - fx) + w[k + GRID + 1] * fx) * fy);
		}

		// the grid cell (x, y) is in
		cellOf (x, y) {
			const i = Math.min(GRID - 1, Math.max(0, Math.floor(((x + 1) / 2) * GRID)));
			const j = Math.min(GRID - 1, Math.max(0, Math.floor(((y + 1) / 2) * GRID)));
			return j * GRID + i;
		}

		// how loud the note is: nothing before the bow, swelling, then held until it stops
		loudness (t) {
			const s = t - APPEAR;
			if (s <= 0 || s >= this.seconds) return 0;
			return Math.min(1, s / RAMP);
		}

		step (dt) {
			if (this.resting) return;
			this.t += dt;
			this.pending += dt;
			const h = 1 / RATE, { x, y, alive, rnd } = this;
			while (this.pending >= h) {
				this.pending -= h;
				const loud = this.loudness(this.t - this.pending);
				let hopped = 0;
				if (loud > 0) {
					for (let i = 0; i < x.length; i++) {
						if (!alive[i]) continue;
						const a = this.amplitude(x[i], y[i]) * loud;
						if (a <= THRESHOLD) {
							if (a > 0.012) { const k = this.cellOf(x[i], y[i]); x[i] -= CREEP * a * this.ux[k]; y[i] -= CREEP * a * this.uy[k]; }
							continue;
						}
						const len = this.hop * a, r = rnd(), th = 2 * Math.PI * rnd(), k = this.cellOf(x[i], y[i]);
						x[i] += len * (r * Math.cos(th) - DOWNHILL * this.ux[k]);
						y[i] += len * (r * Math.sin(th) - DOWNHILL * this.uy[k]);
						hopped++;
						if (x[i] < -1 || x[i] > 1 || y[i] < -1 || y[i] > 1) { alive[i] = 0; this.fallen++; }
					}
				}
				this.hops.push(hopped);
				if (this.hops.length > RATE) this.hops.shift();
			}
			this.hopping = this.hops.reduce((a, b) => a + b, 0) / Math.max(1, this.hops.length);
			// silent once the bow has stopped, or when the sand has all but stopped moving anyway
			const singing = this.t - APPEAR;
			if (singing >= this.seconds || (singing > RAMP + 2 && this.hopping < 0.004 * x.length)) {
				this.silent = true;
			}
		}

		layout (w, h) {
			if (this.w0 === w && this.h0 === h) return;
			this.w0 = w; this.h0 = h;
			const P = (this.P = Math.round(Math.min(w, h) * MARGIN));
			this.ox = Math.round((w - P) / 2); this.oy = Math.round((h - P) / 2);
			this.img = null;
		}

		// Plate pixels: a faint tint of the mode (warm where w > 0, cool where w < 0, by |w|) under
		// the sand, and the sand's brightness by grains per pixel.
		makeBuffer (ctx) {
			const P = this.P;
			this.img = ctx.createImageData(P, P);
			this.px = new Uint32Array(this.img.data.buffer);
			this.base = new Uint32Array(P * P);
			const pack = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r; // little-endian RGBA
			for (let j = 0; j < P; j++) {
				const y = 1 - (2 * (j + 0.5)) / P; // canvas rows go down, y goes up
				for (let i = 0; i < P; i++) {
					const x = (2 * (i + 0.5)) / P - 1;
					const gx = Math.min(GRID - 1, Math.floor(((x + 1) / 2) * GRID)), gy = Math.min(GRID - 1, Math.floor(((y + 1) / 2) * GRID));
					const v = this.w[gy * GRID + gx], m = Math.abs(v) * 13;
					this.base[j * P + i] = v > 0 ? pack(8 + m, 6 + m * 0.6, 5) : pack(5, 6 + m * 0.6, 8 + m);
				}
			}
			this.sand = [pack(0, 0, 0), pack(140, 122, 90), pack(190, 168, 126), pack(222, 202, 158), pack(244, 230, 196)];
			this.count = new Uint16Array(P * P);
			this.cell = new Int32Array(this.x.length).fill(-1); // each grain's pixel, as drawn
			this.px.set(this.base);
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const first = !this.img;
			if (first) {
				this.makeBuffer(ctx);
				this.drawRim(ctx);
			}
			const { P, count, cell, px, base, sand, x, y, alive } = this;
			let x0 = P, y0 = P, x1 = -1, y1 = -1;
			const paint = (k) => {
				const c = count[k];
				px[k] = c ? sand[Math.min(4, c)] : base[k];
				const i = k % P, j = (k - i) / P;
				if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
			};
			for (let g = 0; g < x.length; g++) {
				let k = -1;
				if (alive[g]) {
					const i = Math.floor(((x[g] + 1) / 2) * P), j = Math.floor(((1 - y[g]) / 2) * P);
					if (i >= 0 && i < P && j >= 0 && j < P) k = j * P + i;
				}
				if (k === cell[g]) continue;
				if (cell[g] >= 0) { count[cell[g]]--; paint(cell[g]); }
				if (k >= 0) { count[k]++; paint(k); }
				cell[g] = k;
			}
			if (first) { x0 = 0; y0 = 0; x1 = P - 1; y1 = P - 1; }
			if (x1 >= 0) ctx.putImageData(this.img, this.ox, this.oy, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
			if (this.silent) this.resting = true;
		}

		// the plate's edge
		drawRim (ctx) {
			const { ox, oy, P } = this;
			ctx.save();
			ctx.globalAlpha = 1;
			ctx.strokeStyle = "#4a4640";
			ctx.lineWidth = 1.5;
			ctx.strokeRect(ox - 1.5, oy - 1.5, P + 3, P + 3);
			ctx.restore();
		}

		// How the mode is made to sound: modes odd in x or y are still at the centre, where Chladni
		// held his plates; the others can be driven there, by a vibrator as is done today.
		held () {
			const { mode } = this.figure;
			return mode.px === 0 && mode.py === 0 ? "shaken at its centre" : "held at its centre and bowed at an edge";
		}

		buildInfo () {
			const { mode, swap, number } = this.figure, f = hertz(mode.lambda);
			return {
				title: "Chladni figures",
				subtitle: `sand on a vibrating square plate with free edges, ${this.held()} · mode ${number} of ${FIGURES.length}${swap ? " (one of a pair)" : ""}`,
				equations: [
					"D ∇⁴w = ρh ω² w, &nbsp; D = <span class=\"frac\"><span>E h³</span><span>12 (1 − ν²)</span></span>",
					`λ = ω a² √(ρh / D) = ${mode.lambda.toFixed(2)}: &nbsp;on a 20 cm steel plate 1 mm thick, ${f.toFixed(0)} Hz, ${note(f)}`,
					`<span class="chaos-note">${this.story}</span>`
				]
			};
		}

		readout () {
			const n = this.x.length, left = n - this.fallen;
			const t = Math.max(0, this.t - APPEAR);
			if (this.resting) return `the sand has settled on the nodal lines: ${left.toLocaleString("en")} grains\n${this.fallen.toLocaleString("en")} of ${n.toLocaleString("en")} hopped off the edge`;
			if (this.t < APPEAR) return "sand scattered on the plate\n";
			return `singing ${t.toFixed(1)} s    grains hopping: ${Math.round(this.hopping).toLocaleString("en")}\n` +
				`${this.fallen.toLocaleString("en")} of ${n.toLocaleString("en")} hopped off the edge`;
		}
	}

	Chladni.FIGURES = FIGURES;
	Chladni.PLATE = PLATE;
	Chladni.hertz = hertz;
	Chladni.note = note;
	Chladni.THRESHOLD = THRESHOLD;
	Chladni.info = { title: "Chladni figures", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.chladni = Chladni;
	if (typeof module !== "undefined") module.exports = { Chladni };
})(typeof window !== "undefined" ? window : globalThis);
