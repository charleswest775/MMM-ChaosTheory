/* The logistic map x → r x (1 − x): the road to chaos by period doubling.
 * The bifurcation diagram paints itself column by column as a density image (only the
 * new columns are put to the canvas each frame), then a cobweb diagram below sweeps r
 * through period 1, 2, 4, 8 … into chaos, with its r marked on the diagram above.
 */
(function (root) {
	const R_MIN = 2.8, R_MAX = 4.0;
	const WARMUP = 400, SAMPLES = 600;

	// the long-run orbit's period at r (1..maxPeriod), or 0 if none found: chaos
	function period (r, maxPeriod = 64) {
		let x = 0.5;
		for (let i = 0; i < 20000; i++) x = r * x * (1 - x);
		const x0 = x;
		for (let p = 1; p <= maxPeriod; p++) {
			x = r * x * (1 - x);
			if (Math.abs(x - x0) < 1e-7) return p;
		}
		return 0;
	}

	// Lyapunov exponent: average stretching ln|f′(x)| = ln|r (1 − 2x)| along the orbit
	function lyapunov (r, n = 20000) {
		let x = 0.4, sum = 0;
		for (let i = 0; i < 1000; i++) x = r * x * (1 - x);
		for (let i = 0; i < n; i++) {
			x = r * x * (1 - x);
			sum += Math.log(Math.abs(r * (1 - 2 * x)) || 1e-300);
		}
		return sum / n;
	}

	// density → colour: deep blue through magenta and orange to white
	const STOPS = [[0, [0, 0, 0]], [0.08, [30, 20, 110]], [0.3, [150, 40, 170]], [0.6, [255, 120, 60]], [1, [255, 250, 220]]];
	const ramp = (v) => {
		for (let i = 1; i < STOPS.length; i++) {
			if (v <= STOPS[i][0]) {
				const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (v - a) / (b - a);
				return ca.map((c, k) => Math.round(c + (cb[k] - c) * f));
			}
		}
		return STOPS[STOPS.length - 1][1];
	};
	const LUT = Array.from({ length: 256 }, (_, i) => ramp(i / 255));

	class Logistic {
		constructor ({ paintSeconds = 12, sweepSeconds = 40 } = {}) {
			this.paintSeconds = paintSeconds;
			this.sweepSeconds = sweepSeconds;
			this.col = 0;          // next diagram column to paint
			this.t = 0;
			this.r = R_MIN;
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.pad = 40;
			this.diagram = { x: this.pad, y: 10, w: w - 2 * this.pad, h: Math.round(h * 0.58) };
			this.cobweb = { x: this.pad, y: this.diagram.y + this.diagram.h + 50, w: w - 2 * this.pad, h: h - (this.diagram.y + this.diagram.h + 50) - 10 };
			this.img = null;
		}

		rAt (col) { return R_MIN + (R_MAX - R_MIN) * (col + 0.5) / this.diagram.w; }

		step (dt) {
			this.t += dt;
			if (this.col < (this.diagram ? this.diagram.w : 0)) return;
			// after painting, sweep r back and forth across the diagram
			const s = ((this.t - this.paintSeconds) / this.sweepSeconds) % 2;
			const f = s < 1 ? s : 2 - s;
			this.r = R_MIN + (R_MAX - R_MIN) * (0.5 - 0.5 * Math.cos(Math.PI * f));
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const d = this.diagram;
			if (!this.img) {
				ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
				this.img = ctx.createImageData(d.w, d.h);
				this.drawAxes(ctx);
			}
			if (this.col < d.w) {
				// paint the columns due by now
				const due = Math.min(d.w, Math.ceil((this.t / this.paintSeconds) * d.w));
				const from = this.col;
				for (; this.col < due; this.col++) this.paintColumn(this.col);
				if (due > from) ctx.putImageData(this.img, d.x, d.y, from, 0, due - from, d.h);
				return;
			}
			// Sweep. Chromium redraws the bounding box of everything changed in a frame, so the
			// marker up on the diagram moves only twice a second; other frames touch just the
			// cobweb's square.
			const colOf = (r) => Math.round(((r - R_MIN) / (R_MAX - R_MIN)) * d.w - 0.5);
			if (this.markerCol === undefined || this.t - this.markerAt >= 0.5) {
				if (this.markerCol !== undefined) ctx.putImageData(this.img, d.x, d.y, this.markerCol - 2, 0, 5, d.h);
				this.markerCol = colOf(this.r);
				this.markerAt = this.t;
				ctx.fillStyle = "rgba(255,255,255,0.8)";
				ctx.fillRect(d.x + this.markerCol, d.y, 1, d.h);
			}
			this.drawCobweb(ctx);
		}

		paintColumn (col) {
			const d = this.diagram, r = this.rAt(col), counts = new Uint16Array(d.h);
			let x = 0.5;
			for (let i = 0; i < WARMUP; i++) x = r * x * (1 - x);
			let max = 1;
			for (let i = 0; i < SAMPLES; i++) {
				x = r * x * (1 - x);
				const y = Math.min(d.h - 1, Math.floor((1 - x) * d.h));
				if (++counts[y] > max) max = counts[y];
			}
			const data = this.img.data;
			for (let y = 0; y < d.h; y++) {
				// log scale so faint chaotic bands and bright periodic points both show
				const v = counts[y] ? Math.log(1 + counts[y]) / Math.log(1 + Math.max(max, 12)) : 0;
				const [cr, cg, cb] = LUT[Math.round(v * 255)];
				const k = (y * d.w + col) * 4;
				data[k] = cr; data[k + 1] = cg; data[k + 2] = cb; data[k + 3] = 255;
			}
		}

		drawAxes (ctx) {
			const d = this.diagram;
			ctx.fillStyle = "#777";
			ctx.font = "14px Roboto Condensed, sans-serif";
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			for (let r = 3; r <= 4; r += 0.25) ctx.fillText(`r = ${r}`, d.x + ((r - R_MIN) / (R_MAX - R_MIN)) * d.w, d.y + d.h + 6);
			ctx.textAlign = "right";
			ctx.textBaseline = "middle";
			ctx.fillText("x", d.x - 10, d.y + d.h / 2);
		}

		drawCobweb (ctx) {
			const c = this.cobweb, r = this.r;
			const size = Math.min(c.w, c.h), ox = c.x + (c.w - size) / 2, oy = c.y;
			ctx.fillStyle = "#000";
			ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
			const X = (x) => ox + x * size, Y = (y) => oy + size - y * size;
			ctx.lineWidth = 1;
			ctx.strokeStyle = "#444";
			ctx.strokeRect(ox, oy, size, size);
			ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke();
			// the parabola y = r x (1 − x)
			ctx.strokeStyle = "#ff8a3d";
			ctx.lineWidth = 2;
			ctx.beginPath();
			for (let i = 0; i <= 60; i++) { const x = i / 60; i ? ctx.lineTo(X(x), Y(r * x * (1 - x))) : ctx.moveTo(X(x), Y(0)); }
			ctx.stroke();
			// the orbit from x₀ = 0.1, drawn as a cobweb: up to the curve, across to the diagonal,
			// repeat. It spirals into a cycle when r is periodic and scribbles everywhere in chaos.
			let x = 0.1;
			ctx.strokeStyle = "#fff";
			ctx.globalAlpha = 0.45;
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.moveTo(X(x), Y(x));
			for (let i = 0; i < 150; i++) {
				const y = r * x * (1 - x);
				ctx.lineTo(X(x), Y(y)); ctx.lineTo(X(y), Y(y));
				x = y;
			}
			ctx.stroke();
			ctx.globalAlpha = 1;
		}

		readout () {
			if (this.col < (this.diagram ? this.diagram.w : 1)) return `painting the long-run values of x for each r …  r = ${this.rAt(Math.max(0, this.col - 1)).toFixed(4)}`;
			const p = period(this.r), l = lyapunov(this.r, 4000);
			const what = p ? `settles into a cycle of period ${p}` : "never repeats: chaos";
			return `r = ${this.r.toFixed(4)}   ${what}\nLyapunov exponent λ = ${l >= 0 ? " " : ""}${l.toFixed(3)}   (λ > 0 means nearby starts separate exponentially)`;
		}
	}

	Logistic.info = {
		title: "The road to chaos",
		subtitle: "the logistic map — a population model with one parameter, r",
		equations: [
			"x<sub>n+1</sub> = r x<sub>n</sub> (1 − x<sub>n</sub>)",
			"<span class=\"chaos-note\">each column shows where x ends up for that r: one value, then 2, 4, 8 … — the doublings come faster by Feigenbaum's ratio δ = 4.6692… until at r ≈ 3.5699 the orbit never repeats</span>"
		]
	};
	Logistic.period = period;
	Logistic.lyapunov = lyapunov;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.logistic = Logistic;
	if (typeof module !== "undefined") module.exports = { Logistic };
})(typeof window !== "undefined" ? window : globalThis);
