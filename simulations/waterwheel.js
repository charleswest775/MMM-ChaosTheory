/* Malkus's chaotic waterwheel (Willem Malkus and Lou Howard, MIT, 1970s): a wheel on a tilted
 * axle with leaking cups round its rim, and water poured steadily over the top. The top gets
 * heavy and the wheel starts to turn; it speeds up, slows, and reverses, never settling and
 * never repeating. Its equations are Lorenz's, exactly.
 *
 * The model is Strogatz's (Nonlinear Dynamics and Chaos, §9.1): water spread continuously round
 * the rim, with mass m(θ, t) per radian at angle θ (measured anticlockwise from the bottom),
 * poured in at Q(θ) and leaking out at rate K·m; the wheel has moment of inertia I and
 * friction ν. Following each bit of the rim as it turns,
 *   dm/dt = Q(θ) − K m,     I dω/dt = −ν ω − g r ∫ m sin θ dθ,     dφ/dt = ω
 * The spin ω and the first harmonics of the water, a₁ = (1/π)∫ m sin θ, b₁ = (1/π)∫ m cos θ,
 * then obey Lorenz's equations with b = 1:
 *   x = −ω/K,  y = (π g r / Kν) a₁,  z = ρ + (π g r / Kν) b₁,  time τ = K t,
 *   σ = ν / (K I),  ρ = −π g r q₁ / (K² ν)     (q₁: the inflow's first harmonic)
 * Here K = I = g r = 1, ν = σ = 10 and ρ = 28, where Lorenz's system with b = 1 is chaotic.
 *
 * The rim is followed at 96 points. The inflow, Q = C (1 − cos θ)⁴, peaked at the top, has no
 * harmonics above the fourth, and neither then does the water (it starts empty), so the sums over
 * 96 points are the integrals exactly: this is the continuous wheel, not an approximation to it.
 * It is drawn as 8 cups, each holding the water of its eighth of the rim.
 *
 * Drawn for the Pi in turns: one frame redraws the wheel's box, the next adds the latest stretch
 * of (x, z), the butterfly, below it as a long exposure, so each frame changes one compact area.
 */
(function (root) {
	const SIGMA = 10, RHO = 28;
	const N = 96;               // points followed round the rim
	const CUPS = 8;
	const H = 0.002;            // RK4 step, in units of the leak time 1/K
	const SPEED = 0.22;         // leak times per second shown
	const C = (RHO * SIGMA) / (7 * Math.PI); // (1 − cos θ)⁴ has q₁ = −7: this makes ρ = 28
	const DPSI = (2 * Math.PI) / N;
	const SIN = new Float64Array(N), COS = new Float64Array(N);
	for (let j = 0; j < N; j++) { SIN[j] = Math.sin(j * DPSI); COS[j] = Math.cos(j * DPSI); }

	// the inflow at a point of the rim whose angle from the bottom has cosine c
	const inflow = (c) => C * (1 - c) ** 4;

	class Wheel {
		constructor ({ sigma = SIGMA, rho = RHO, omega = 0 } = {}) {
			this.sigma = sigma;
			this.c = (rho * sigma) / (7 * Math.PI);
			this.rho = rho;
			this.phi = 0;           // how far the wheel has turned, anticlockwise
			this.omega = omega;
			this.m = new Float64Array(N); // water per radian at each point, starting empty
			this.t = 0;
			// RK4 scratch
			this.k = [0, 1, 2, 3].map(() => ({ m: new Float64Array(N), w: 0, p: 0 }));
			this.tmp = new Float64Array(N);
		}

		// derivatives at (phi, omega, m) into out
		derivs (phi, omega, m, out) {
			const cp = Math.cos(phi), sp = Math.sin(phi);
			let torque = 0;
			for (let j = 0; j < N; j++) {
				const s = SIN[j] * cp + COS[j] * sp, c = COS[j] * cp - SIN[j] * sp; // sin, cos of θⱼ = ψⱼ + φ
				out.m[j] = this.c * (1 - c) ** 4 - m[j];
				torque -= m[j] * s;
			}
			out.w = -this.sigma * omega + torque * DPSI;
			out.p = omega;
		}

		step (h = H) {
			const [k1, k2, k3, k4] = this.k, m = this.m, tmp = this.tmp;
			this.derivs(this.phi, this.omega, m, k1);
			for (let j = 0; j < N; j++) tmp[j] = m[j] + (h / 2) * k1.m[j];
			this.derivs(this.phi + (h / 2) * k1.p, this.omega + (h / 2) * k1.w, tmp, k2);
			for (let j = 0; j < N; j++) tmp[j] = m[j] + (h / 2) * k2.m[j];
			this.derivs(this.phi + (h / 2) * k2.p, this.omega + (h / 2) * k2.w, tmp, k3);
			for (let j = 0; j < N; j++) tmp[j] = m[j] + h * k3.m[j];
			this.derivs(this.phi + h * k3.p, this.omega + h * k3.w, tmp, k4);
			for (let j = 0; j < N; j++) m[j] += (h / 6) * (k1.m[j] + 2 * k2.m[j] + 2 * k3.m[j] + k4.m[j]);
			this.omega += (h / 6) * (k1.w + 2 * k2.w + 2 * k3.w + k4.w);
			this.phi += (h / 6) * (k1.p + 2 * k2.p + 2 * k3.p + k4.p);
			this.t += h;
		}

		// Lorenz's (x, y, z), from the spin and the water's first harmonics
		lorenz () {
			const cp = Math.cos(this.phi), sp = Math.sin(this.phi);
			let a = 0, b = 0;
			for (let j = 0; j < N; j++) {
				a += this.m[j] * (SIN[j] * cp + COS[j] * sp);
				b += this.m[j] * (COS[j] * cp - SIN[j] * sp);
			}
			return [-this.omega, (a * DPSI) / this.sigma, this.rho + (b * DPSI) / this.sigma];
		}

		// the water in each cup: the rim's points shared out, N / CUPS to a cup, the cup at their middle
		cups () {
			const per = N / CUPS, out = new Float64Array(CUPS);
			for (let j = 0; j < N; j++) out[Math.floor(((j + per / 2) % N) / per)] += this.m[j] * DPSI;
			return out;
		}
	}

	// the most a cup can hold: what the top one has with the wheel held still, and some to spare
	let capacity = 0;
	for (let j = -N / CUPS / 2; j < N / CUPS / 2; j++) capacity += inflow(Math.cos(Math.PI + j * DPSI)) * DPSI;
	capacity *= 1.15;

	// the height of water filling a fraction f of a circle of radius 1, from the bottom
	function level (f) {
		let lo = 0, hi = 2;
		for (let i = 0; i < 30; i++) {
			const h = (lo + hi) / 2, d = 1 - h;
			const area = Math.acos(d) - d * Math.sqrt(Math.max(0, 1 - d * d));
			if (area / Math.PI < f) lo = h; else hi = h;
		}
		return (lo + hi) / 2;
	}

	const WATER = "#3aa0ff", CW = "#ffb35c", ACW = "#63d8ff";

	class Waterwheel {
		constructor () {
			this.wheel = new Wheel({ omega: (Math.random() < 0.5 ? -1 : 1) * (0.01 + 0.02 * Math.random()) });
			this.pending = 0;
			this.frame = 0;
			this.reversals = 0;
			this.sign = Math.sign(this.wheel.omega);
			this.path = [];     // (x, z) since the butterfly was last drawn
			this.last = null;   // where it was drawn up to
		}

		step (dt) {
			this.pending += dt * SPEED;
			const w = this.wheel;
			while (this.pending >= H) {
				w.step();
				this.pending -= H;
				// a reversal: the spin changes sign after having got going (not the first wobble)
				if (Math.abs(w.omega) > 1) this.going = true;
				const s = Math.sign(w.omega);
				if (s && s !== this.sign) { if (this.going) this.reversals++; this.going = false; this.sign = s; }
				if (Math.round(w.t / H) % 5 === 0) {
					const [x, , z] = w.lorenz();
					this.path.push(x, z, w.omega);
				}
			}
		}

		// portrait: the wheel above, the butterfly below; otherwise side by side
		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			const tall = h > 1.3 * w;
			const R = tall ? w * 0.2 : Math.min(w * 0.19, h * 0.3);
			this.R = R;
			this.cup = R * 0.22;
			const half = R + this.cup + 4;
			this.cx = tall ? w / 2 : w * 0.26;
			this.cy = tall ? R * 0.62 + half : Math.max(R * 0.62 + half, h / 2);
			this.box = [this.cx - half, this.cy - half, 2 * half, 2 * half + 22]; // redrawn each wheel frame
			// the butterfly: x across (−17 to 17), z up (5 to 47)
			const [x0, x1, y0, y1] = tall ? [0, w, this.box[3] + 16, h - 10] : [w * 0.52, w, 10, h - 10];
			const s = Math.min((0.92 * (x1 - x0)) / 34, (y1 - y0) / 42);
			const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
			this.map = (x, z) => [mx + x * s, my - (z - 26) * s];
			this.sprayed = false;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (this.frame++ % 2 === 0) this.drawWheel(ctx);
			else this.drawPath(ctx);
		}

		// the latest stretch of (x, z), coloured by which way the wheel turns
		drawPath (ctx) {
			const p = this.path;
			if (p.length < 3) return;
			ctx.lineWidth = 1.3;
			ctx.globalAlpha = 0.7;
			let i = 0;
			if (!this.last) this.last = [p[0], p[1]];
			while (i < p.length) {
				const colour = p[i + 2] >= 0 ? ACW : CW;
				ctx.strokeStyle = colour;
				ctx.beginPath();
				ctx.moveTo(...this.map(this.last[0], this.last[1]));
				while (i < p.length && (p[i + 2] >= 0 ? ACW : CW) === colour) {
					ctx.lineTo(...this.map(p[i], p[i + 1]));
					this.last = [p[i], p[i + 1]];
					i += 3;
				}
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
			this.path = [];
		}

		drawWheel (ctx) {
			const { cx, cy, R, cup } = this, wh = this.wheel;
			ctx.fillStyle = "#000";
			ctx.fillRect(...this.box);

			// the spray over the top, each stream as strong as the inflow where it lands: above the
			// wheel's box it never changes, so it is drawn there only once
			const from = this.sprayed ? this.box[1] : 2;
			this.sprayed = true;
			ctx.strokeStyle = WATER;
			ctx.lineWidth = 2;
			for (let a = -60; a <= 60; a += 15) {
				const t = (a * Math.PI) / 180, q = inflow(Math.cos(Math.PI + t)) / inflow(-1);
				ctx.globalAlpha = 0.15 + 0.6 * q;
				const x = cx - R * Math.sin(t), y = cy - R * Math.cos(t) - cup;
				ctx.beginPath(); ctx.moveTo(x, from); ctx.lineTo(x, y); ctx.stroke();
			}
			ctx.globalAlpha = 1;

			// rim, spokes (one marked, so the eye can follow the turning) and hub
			ctx.strokeStyle = "#777";
			ctx.lineWidth = 3;
			ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
			ctx.lineWidth = 2;
			for (let k = 0; k < CUPS; k++) {
				const th = wh.phi + (2 * Math.PI * k) / CUPS;
				ctx.strokeStyle = k === 0 ? "#bbb" : "#444";
				ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(th), cy + R * Math.cos(th)); ctx.stroke();
			}
			ctx.fillStyle = "#999";
			ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fill();

			// the cups, water settled at the bottom of each, and a drip as fast as it leaks
			const water = wh.cups();
			for (let k = 0; k < CUPS; k++) {
				const th = wh.phi + (2 * Math.PI * k) / CUPS, x = cx + R * Math.sin(th), y = cy + R * Math.cos(th);
				const f = Math.min(1, water[k] / capacity);
				ctx.fillStyle = "#000";
				ctx.beginPath(); ctx.arc(x, y, cup, 0, 2 * Math.PI); ctx.fill();
				if (f > 0.002) {
					ctx.save();
					ctx.beginPath(); ctx.arc(x, y, cup, 0, 2 * Math.PI); ctx.clip();
					ctx.fillStyle = WATER;
					const top = y + cup - cup * level(f);
					ctx.fillRect(x - cup, top, 2 * cup, y + cup - top);
					ctx.restore();
					ctx.globalAlpha = 0.6;
					ctx.strokeStyle = WATER;
					ctx.lineWidth = 1.5;
					ctx.beginPath(); ctx.moveTo(x, y + cup + 2); ctx.lineTo(x, y + cup + 2 + 16 * f); ctx.stroke();
					ctx.globalAlpha = 1;
				}
				ctx.strokeStyle = "#ccc";
				ctx.lineWidth = 2;
				ctx.beginPath(); ctx.arc(x, y, cup, 0, 2 * Math.PI); ctx.stroke();
			}
		}

		readout () {
			const [x, y, z] = this.wheel.lorenz(), om = this.wheel.omega;
			const dir = Math.abs(om) < 0.05 ? "barely turning" : om > 0 ? "anticlockwise" : "clockwise";
			return `t = ${this.wheel.t.toFixed(1)} leak times    spin ω = ${om >= 0 ? "+" : "−"}${Math.abs(om).toFixed(2)} (${dir})    reversals: ${this.reversals}\n` +
				`Lorenz's x = ${x.toFixed(2)}, y = ${y.toFixed(2)}, z = ${z.toFixed(2)}`;
		}
	}

	Waterwheel.info = {
		title: "The chaotic waterwheel",
		subtitle: "leaking cups on a wheel, water poured over the top: it turns one way, then the other, and never settles",
		equations: [
			"<i>ṁ</i> = <i>Q</i>(θ) − <i>K m</i>, &nbsp; <i>I</i> ω̇ = −ν ω − <i>g r</i> ∫ <i>m</i> sin θ dθ &nbsp; <span class=\"chaos-note\">(water in, water leaking out; the torque of its weight)</span>",
			"ẋ = σ(y − x), &nbsp; ẏ = ρx − y − xz, &nbsp; ż = xy − z &nbsp; <span class=\"chaos-note\">σ = 10, ρ = 28: Lorenz's equations, with x the spin and y, z where the water's weight sits</span>",
			"<span class=\"chaos-note\">Willem Malkus and Lou Howard built this wheel at MIT in the 1970s to show that Lorenz's equations, found in a model of the weather, describe a real machine. Beside it, x (its spin) across and z (how top-heavy it is) up, drawn blue while it turns anticlockwise and orange while it turns clockwise: the butterfly. Each cup holds an eighth of the rim's water and leaks as fast as it holds.</span>"
		]
	};
	Waterwheel.Wheel = Wheel;
	Waterwheel.level = level;
	Waterwheel.capacity = capacity;
	Waterwheel.SPEED = SPEED;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.waterwheel = Waterwheel;
	if (typeof module !== "undefined") module.exports = { Waterwheel };
})(typeof window !== "undefined" ? window : globalThis);
