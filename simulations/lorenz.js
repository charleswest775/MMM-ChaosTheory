/* Lorenz attractor: three trajectories released 10⁻⁵ apart trace the butterfly together,
 * then separate, while the view turns slowly in 3D. Drawn with additive blending, so while
 * the three coloured paths coincide they add up to white and then split into colour.
 */
(function (root) {
	const { FixedClock, sci } = root.ChaosCommon || require("./common.js");
	const SIGMA = 10, RHO = 28, BETA = 8 / 3;

	// dx/dt = σ(y − x),  dy/dt = x(ρ − z) − y,  dz/dt = xy − βz
	function derivs (x, y, z, out) {
		out[0] = SIGMA * (y - x);
		out[1] = x * (RHO - z) - y;
		out[2] = x * y - BETA * z;
	}

	// one RK4 step of s = [x, y, z] (Float64Array), in place
	const a = new Float64Array(3), b = new Float64Array(3), c = new Float64Array(3), d = new Float64Array(3);
	function rk4 (s, h) {
		const [x, y, z] = s;
		derivs(x, y, z, a);
		derivs(x + a[0] * h / 2, y + a[1] * h / 2, z + a[2] * h / 2, b);
		derivs(x + b[0] * h / 2, y + b[1] * h / 2, z + b[2] * h / 2, c);
		derivs(x + c[0] * h, y + c[1] * h, z + c[2] * h, d);
		for (let i = 0; i < 3; i++) s[i] += (h / 6) * (a[i] + 2 * b[i] + 2 * c[i] + d[i]);
	}

	const COLORS = ["#ff4d6d", "#3ddc97", "#4d9bff"]; // red + green + blue = white where they overlap
	const TRAIL = 1400;       // points kept per trajectory
	const SPEED = 0.55;       // Lorenz time units per second of real time
	const H = 0.004;          // integration step (Lorenz time)

	class Lorenz {
		constructor ({ separation = 1e-5 } = {}) {
			// start on the attractor (skip the transient) at a random point along it
			const s0 = new Float64Array([1, 1, 20]);
			const warm = 20 + Math.random() * 20;
			for (let t = 0; t < warm; t += H) rk4(s0, H);
			this.states = COLORS.map((_, i) => new Float64Array([s0[0] + i * separation, s0[1], s0[2]]));
			this.separation = separation;
			// trails store 3D points: x, y, z per slot
			this.trails = COLORS.map(() => new Float32Array(TRAIL * 3));
			this.head = 0;      // next slot to write
			this.count = 0;
			this.t = 0;         // Lorenz time since release
			this.clock = new FixedClock(H / SPEED);
			this.yaw = Math.random() * 2 * Math.PI;
			this.stride = 0;
		}

		step (dt) {
			this.clock.advance(dt, () => {
				for (const s of this.states) rk4(s, H);
				this.t += H;
				// record every 3rd step: plenty of resolution for the curve
				if (++this.stride % 3) return;
				for (let i = 0; i < this.states.length; i++) this.trails[i].set(this.states[i], this.head * 3);
				this.head = (this.head + 1) % TRAIL;
				this.count = Math.min(this.count + 1, TRAIL);
			});
			this.yaw += dt * 0.12; // one turn every ~50 s
		}

		// largest distance between the released trajectories
		spread () {
			let m = 0;
			for (let i = 1; i < this.states.length; i++) {
				const [x0, y0, z0] = this.states[0], [x, y, z] = this.states[i];
				m = Math.max(m, Math.hypot(x - x0, y - y0, z - z0));
			}
			return m;
		}

		draw (ctx, w, h) {
			ctx.globalCompositeOperation = "source-over";
			ctx.fillStyle = "#000";
			ctx.fillRect(0, 0, w, h);

			// rotate about the attractor's vertical (z) axis, tilt a little towards the viewer
			const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
			const scale = Math.min(w, h) / 62, ox = w / 2, oy = h / 2;
			const project = (x, y, z) => {
				const u = x * cy - y * sy, v = x * sy + y * cy, zz = z - 25;
				return [ox + u * scale, oy - (zz * ct - v * st) * scale];
			};

			ctx.globalCompositeOperation = "lighter";
			ctx.lineWidth = 1.6;
			const n = this.count, bands = 5;
			for (let i = 0; i < this.trails.length; i++) {
				const tr = this.trails[i];
				ctx.strokeStyle = COLORS[i];
				for (let bnd = 0; bnd < bands; bnd++) {
					const from = Math.floor((bnd * (n - 1)) / bands), to = Math.floor(((bnd + 1) * (n - 1)) / bands);
					if (to <= from) continue;
					ctx.globalAlpha = 0.12 + 0.75 * ((bnd + 1) / bands) ** 2;
					ctx.beginPath();
					for (let k = from; k <= to; k++) {
						const slot = ((this.head - n + k + TRAIL) % TRAIL) * 3;
						const [px, py] = project(tr[slot], tr[slot + 1], tr[slot + 2]);
						if (k === from) ctx.moveTo(px, py); else ctx.lineTo(px, py);
					}
					ctx.stroke();
				}
				// bright head
				const [hx, hy] = project(...this.states[i]);
				ctx.globalAlpha = 1;
				ctx.fillStyle = COLORS[i];
				ctx.beginPath(); ctx.arc(hx, hy, 4, 0, 2 * Math.PI); ctx.fill();
			}
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = "source-over";
		}

		readout () {
			const [x, y, z] = this.states[0];
			const f = (v) => v.toFixed(3).padStart(8, " ");
			return `t = ${this.t.toFixed(1)}    x = ${f(x)}  y = ${f(y)}  z = ${f(z)}\n` +
				`released ${sci(this.separation)} apart  →  now ${sci(this.spread())} apart`;
		}
	}

	Lorenz.info = {
		title: "The Lorenz attractor",
		subtitle: "Edward Lorenz, 1963 — a toy model of convection in the atmosphere",
		equations: [
			"dx/dt = σ (y − x)",
			"dy/dt = x (ρ − z) − y",
			"dz/dt = x y − β z",
			"σ = 10,  ρ = 28,  β = 8/3",
			"<span class=\"chaos-note\">Red, green and blue start 10⁻⁵ apart. While they agree they add up to white.</span>"
		]
	};
	Lorenz.derivs = derivs;
	Lorenz.rk4 = rk4;
	Lorenz.params = { SIGMA, RHO, BETA };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.lorenz = Lorenz;
	if (typeof module !== "undefined") module.exports = { Lorenz };
})(typeof window !== "undefined" ? window : globalThis);
