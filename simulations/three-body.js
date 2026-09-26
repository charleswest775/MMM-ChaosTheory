/* The three-body problem, where chaos was first found (Poincaré, 1889): three masses pulling on
 * one another by Newton's law, in a plane,
 *   r̈ᵢ = Σⱼ G mⱼ (rⱼ − rᵢ) / |rⱼ − rᵢ|³,   G = 1,
 * integrated by Dormand and Prince's adaptive Runge–Kutta 5(4) to a tolerance of 10⁻¹², which
 * follows the close encounters. One of three stories per showing:
 *   Burrau's Pythagorean problem (1913): masses 3, 4, 5 released from rest at the corners of a
 *     3-4-5 triangle. A chaotic dance of near-collisions, then two pair off and the third is
 *     thrown out, for ever (Szebehely and Peters, 1967).
 *   The figure-eight (Moore 1993; Chenciner and Montgomery 2000): three equal masses chasing
 *     one another round one curve. It is stable: disturbed, it stays.
 *   Lagrange's triangle (1772): three equal masses circling at the corners of an equilateral
 *     triangle. Unstable: the ghost's breaks up after four turns, and the real one after eight,
 *     broken by nothing but rounding errors of 10⁻¹⁵.
 * Each has a ghost: the same bodies started 10⁻⁶ away, drawn faintly. Where the motion is chaotic
 * the ghost follows, then leaves.
 *
 * Drawn as a long exposure for the Pi: each frame adds only the bodies' new trail.
 */
(function (root) {
	// Dormand–Prince 5(4): nodes, stages and the two weightings
	const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
	const A = [
		[],
		[1 / 5],
		[3 / 40, 9 / 40],
		[44 / 45, -56 / 15, 32 / 9],
		[19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
		[9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
		[35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84]
	];
	const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
	const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

	// the state: [x₁, y₁, x₂, y₂, x₃, y₃, vx₁, vy₁, …]; out = its derivative
	function derivs (m, s, out) {
		for (let i = 0; i < 6; i++) out[i] = s[6 + i];
		for (let i = 0; i < 3; i++) { out[6 + 2 * i] = 0; out[7 + 2 * i] = 0; }
		for (let i = 0; i < 3; i++) {
			for (let j = i + 1; j < 3; j++) {
				const dx = s[2 * j] - s[2 * i], dy = s[2 * j + 1] - s[2 * i + 1];
				const r2 = dx * dx + dy * dy, f = 1 / (r2 * Math.sqrt(r2));
				out[6 + 2 * i] += m[j] * dx * f; out[7 + 2 * i] += m[j] * dy * f;
				out[6 + 2 * j] -= m[i] * dx * f; out[7 + 2 * j] -= m[i] * dy * f;
			}
		}
	}

	// One system of three bodies, advanced adaptively
	class System {
		constructor (m, state, tol = 1e-12) {
			this.m = m;
			this.s = Float64Array.from(state);
			this.t = 0;
			this.h = 1e-3;
			this.tol = tol;
			this.k = Array.from({ length: 7 }, () => new Float64Array(12));
			this.tmp = new Float64Array(12);
			this.steps = 0;
			this.closest = Infinity;
		}

		// one adaptive step, no longer than hMax; returns the time taken
		step (hMax) {
			const { m, s, k, tmp } = this;
			for (;;) {
				const h = Math.min(this.h, hMax);
				derivs(m, s, k[0]);
				for (let st = 1; st < 7; st++) {
					for (let i = 0; i < 12; i++) {
						let acc = s[i];
						for (let j = 0; j < st; j++) acc += h * A[st][j] * k[j][i];
						tmp[i] = acc;
					}
					derivs(m, tmp, k[st]);
				}
				let err = 0;
				for (let i = 0; i < 12; i++) {
					let y5 = s[i], e = 0;
					for (let j = 0; j < 7; j++) { y5 += h * B5[j] * k[j][i]; e += h * (B5[j] - B4[j]) * k[j][i]; }
					tmp[i] = y5;
					err = Math.max(err, Math.abs(e) / (this.tol * (1 + Math.abs(s[i]))));
				}
				if (err <= 1 || h < 1e-14) {
					s.set(tmp);
					this.t += h;
					this.steps++;
					this.h = h * Math.min(4, Math.max(0.2, 0.9 * (err || 1e-10) ** -0.2));
					for (let i = 0; i < 3; i++) {
						for (let j = i + 1; j < 3; j++) this.closest = Math.min(this.closest, Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]));
					}
					return h;
				}
				this.h = h * Math.max(0.1, 0.9 * err ** -0.2);
			}
		}

		// on to time T exactly
		advance (T) {
			while (this.t < T - 1e-15) this.step(T - this.t);
		}

		energy () {
			const { m, s } = this;
			let e = 0;
			for (let i = 0; i < 3; i++) e += 0.5 * m[i] * (s[6 + 2 * i] ** 2 + s[7 + 2 * i] ** 2);
			for (let i = 0; i < 3; i++) {
				for (let j = i + 1; j < 3; j++) e -= (m[i] * m[j]) / Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]);
			}
			return e;
		}

		momentum () {
			const { m, s } = this;
			let px = 0, py = 0, L = 0;
			for (let i = 0; i < 3; i++) {
				px += m[i] * s[6 + 2 * i]; py += m[i] * s[7 + 2 * i];
				L += m[i] * (s[2 * i] * s[7 + 2 * i] - s[2 * i + 1] * s[6 + 2 * i]);
			}
			return { px, py, L };
		}
	}

	// the stories: masses, the state at t = 0, how much time to show, and where to look
	const SCENES = {
		pythagorean: {
			title: "The three-body problem",
			subtitle: "Burrau's Pythagorean problem: masses 3, 4 and 5, released from rest at the corners of a 3-4-5 triangle",
			m: [3, 4, 5],
			state: [1, 3, -2, -1, 1, -1, 0, 0, 0, 0, 0, 0],
			duration: 75, view: 7.5, rate: 1.4,
			note: "Poincaré's prize essay of 1889 on three bodies had a mistake; fixing it, he found the tangle of paths now called chaos, and paid more to have the first printing destroyed than the prize was worth. Here the bodies dance for 60 time units, then two pair off and the third is thrown out, never to return."
		},
		"figure-eight": {
			title: "The three-body problem",
			subtitle: "the figure-eight: three equal masses chasing each other round one curve (Moore 1993; Chenciner and Montgomery 2000)",
			m: [1, 1, 1],
			state: [-0.97000436, 0.24308753, 0.97000436, -0.24308753, 0, 0, 0.466203685, 0.43236573, 0.466203685, 0.43236573, -0.93240737, -0.86473146],
			duration: 57, view: 1.35, rate: 1.0, period: 6.32591398,
			note: "Found on a computer by Cris Moore in 1993, and proved to exist by Alain Chenciner and Richard Montgomery in 2000. It is stable: the ghost, started a millionth away, stays with it. Whether any real star system moves like this is unknown."
		},
		lagrange: {
			title: "The three-body problem",
			subtitle: "Lagrange's triangle: three equal masses circling at the corners of an equilateral triangle",
			m: [1, 1, 1],
			// on the unit circle, going round at v = ωR = 3^(−1/4): the other two pull each one
			// towards the centre with 1/(√3 R²), which is m ω² R
			state: [0, 1, -Math.sqrt(3) / 2, -0.5, Math.sqrt(3) / 2, -0.5,
				-(3 ** -0.25), 0, 0.5 * 3 ** -0.25, -(Math.sqrt(3) / 2) * 3 ** -0.25, 0.5 * 3 ** -0.25, (Math.sqrt(3) / 2) * 3 ** -0.25],
			duration: 72, view: 2.4, rate: 1.25, period: 2 * Math.PI * 3 ** 0.25,
			note: "Lagrange found in 1772 that three bodies can keep this shape as they go round. With equal masses it is unstable: the ghost, started a millionth away, breaks up after four turns, and the real one after eight, from nothing but rounding errors. It holds only when one body is far heavier, as for the Trojan asteroids that share Jupiter's orbit, 60° ahead and behind."
		}
	};
	const ORDER = ["pythagorean", "lagrange", "figure-eight"];
	let turn = 0;

	const COLOURS = [[255, 120, 100], [120, 220, 150], [120, 170, 255]];
	const GHOST = 1e-6;

	class ThreeBody {
		// threeBodyScene: this one (pythagorean, lagrange, figure-eight); default: taking turns
		constructor ({ threeBodyScene } = {}) {
			this.key = SCENES[threeBodyScene] ? threeBodyScene : ORDER[turn++ % ORDER.length];
			const sc = (this.scene = SCENES[this.key]);
			this.sys = new System(sc.m, sc.state);
			const g = sc.state.slice();
			g[0] += GHOST; // the ghost: body 1 a millionth to the side
			this.ghost = new System(sc.m, g);
			this.E0 = this.sys.energy();
			this.T = 0;          // simulated time shown
			this.last = null;    // positions last drawn: [real, ghost]
			this.resting = false;
			this.info = { title: sc.title, subtitle: sc.subtitle, equations: ThreeBody.equations(sc) };
		}

		step (dt) {
			if (this.resting) return;
			const sc = this.scene;
			this.T = Math.min(sc.duration, this.T + dt * sc.rate);
			this.sys.advance(this.T);
			this.ghost.advance(this.T);
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.S = (Math.min(w, h) / 2) / this.scene.view;
			this.cx = w / 2; this.cy = h / 2;
			this.last = null;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const X = (x) => this.cx + x * this.S, Y = (y) => this.cy - y * this.S;
			const now = [Array.from(this.sys.s.slice(0, 6)), Array.from(this.ghost.s.slice(0, 6))];
			if (this.last) {
				ctx.save();
				ctx.globalCompositeOperation = "lighter";
				ctx.lineCap = "round";
				now.forEach((pos, g) => {
					for (let i = 0; i < 3; i++) {
						const [r, gr, b] = COLOURS[i];
						ctx.strokeStyle = `rgb(${r},${gr},${b})`;
						ctx.globalAlpha = g ? 0.28 : 0.85;
						ctx.lineWidth = g ? 1 : 1.6;
						const x0 = this.last[g][2 * i], y0 = this.last[g][2 * i + 1];
						// a body thrown far off the picture: stop drawing it
						if (Math.hypot(x0, y0) > this.scene.view * 1.5) continue;
						ctx.beginPath();
						ctx.moveTo(X(x0), Y(y0));
						ctx.lineTo(X(pos[2 * i]), Y(pos[2 * i + 1]));
						ctx.stroke();
					}
				});
				ctx.restore();
			}
			this.last = now;
			if (this.T >= this.scene.duration) this.resting = true;
		}

		readout () {
			const s = this.sys.s, g = this.ghost.s;
			let apart = 0;
			for (let i = 0; i < 6; i++) apart = Math.max(apart, Math.abs(s[i] - g[i]));
			const dE = Math.abs((this.sys.energy() - this.E0) / this.E0);
			const sci = (root.ChaosCommon || require("./common.js")).sci;
			return `t = ${this.T.toFixed(1)}    ghost ${sci(apart)} away    closest approach so far ${sci(this.sys.closest)}\n` +
				`energy kept to ${sci(dE)}    ${this.sys.steps.toLocaleString("en")} steps`;
		}
	}

	ThreeBody.equations = (sc) => [
		"r̈<sub>i</sub> = Σ<sub>j≠i</sub> G m<sub>j</sub> <span class=\"frac\"><span>r<sub>j</sub> − r<sub>i</sub></span><span>|r<sub>j</sub> − r<sub>i</sub>|³</span></span>, &nbsp; G = 1",
		`masses ${sc.m.join(", ")} · the ghost (faint) starts 10⁻⁶ away · Dormand–Prince 5(4), tolerance 10⁻¹²`,
		`<span class="chaos-note">${sc.note}</span>`
	];
	ThreeBody.System = System;
	ThreeBody.SCENES = SCENES;
	ThreeBody.info = { title: "The three-body problem", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.threeBody = ThreeBody;
	if (typeof module !== "undefined") module.exports = { ThreeBody };
})(typeof window !== "undefined" ? window : globalThis);
