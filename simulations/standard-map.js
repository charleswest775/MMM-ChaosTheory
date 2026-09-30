/* The standard map (Chirikov 1969, 1979): a rotor, free but for a kick once a period whose
 * strength depends on the angle it is at. Its angle θ and its spin p from one kick to the next:
 *   p' = p + K sin θ,   θ' = θ + p'     (both mod 2π)
 * The simplest system in which order and chaos live side by side. Each orbit is plotted as the
 * dots of its first 2,000 kicks: a regular one draws a closed curve (a KAM torus) or a chain of
 * islands, a chaotic one scatters dust over the region it can reach.
 *
 * The map keeps area (its Jacobian's determinant is 1), like every Hamiltonian flow. For small K
 * most of the picture is curves that span θ from side to side: barriers no orbit can cross.
 * The last of them, the one turning by the golden mean each kick, breaks at K = 0.971635
 * (Greene 1979); beyond it a chaotic orbit can wander from any spin to any other.
 *
 * An orbit is chaotic or not by its Lyapunov exponent, the average log of how much it
 * stretches a small displacement each kick, taken from the tangent map alongside it.
 *
 * Drawn for the Pi: a whole orbit at a time, three a second, and nothing between; the dots of an
 * orbit are spread over the whole canvas, so what costs is how often the canvas changes, not how
 * much. Rests once the picture is done.
 */
(function (root) {
	const TAU = 2 * Math.PI;
	const KICKS = 2000;          // dots per orbit
	const WARMUP = 500;          // kicks to settle the tangent vector before measuring stretch
	const ORBITS_PER_SECOND = 3;
	const ORBITS = 126;          // then rest (42 s: a 45 s page)
	const CHAOTIC = 0.02;        // Lyapunov exponent per kick above which an orbit counts as chaotic
	const SEA_DOTS = 500;        // dots drawn of a chaotic orbit: the sea is one region, and fills soon
	const K_CRITICAL = 0.971635; // Greene: the golden torus breaks

	// the stories told, one per showing, in turn
	const SCENES = [
		{ K: 0.5, subtitle: "K = 0.5: order almost everywhere. Curves span the picture from side to side, and chaos is only a thin layer along the edges of the islands" },
		{ K: K_CRITICAL, subtitle: "K = 0.9716: the critical kick. The last curve from side to side, the one that turns by the golden mean each kick, is about to break" },
		{ K: 1.3, subtitle: "K = 1.3: every barrier broken. One chaotic orbit can now wander from the bottom of the picture to the top" },
		{ K: 2.4, subtitle: "K = 2.4: a chaotic sea, and islands of order left in it" }
	];

	const mod = (x) => x - TAU * Math.floor(x / TAU);

	// n kicks from (θ, p): the points visited (θ, p in [0, 2π)), the Lyapunov exponent per kick,
	// and the rotation number (how far θ turns per kick, in turns, mod 1)
	function orbit (K, theta, p, n = KICKS, warmup = WARMUP) {
		const pts = new Float64Array(2 * n);
		let u = 1, v = 0, stretch = 0, turned = 0;
		for (let i = -warmup; i < n; i++) {
			const c = K * Math.cos(theta);
			p += K * Math.sin(theta);
			theta += p;
			// the tangent map: dp' = dp + K cos θ dθ, dθ' = dθ + dp'
			const dp = v + c * u, dth = u + dp;
			const r = Math.hypot(dth, dp);
			u = dth / r; v = dp / r;
			theta = mod(theta);
			if (i >= 0) {
				stretch += Math.log(r);
				turned += p; // p is kept unwrapped, so this adds up the whole turn
				pts[2 * i] = theta; pts[2 * i + 1] = mod(p);
			}
		}
		const rotation = mod(turned / n) / TAU;
		return { pts, lyapunov: stretch / n, rotation };
	}

	// Halton points: evenly spread starting points, none repeated
	const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };

	class StandardMap {
		constructor (config = {}) {
			const k = config.standardMapK;
			if (typeof k === "number") this.scene = SCENES.find((s) => s.K === k) || { K: k, subtitle: `K = ${k}` };
			else this.scene = SCENES[StandardMap.shown++ % SCENES.length];
			this.K = this.scene.K;
			this.info = { ...StandardMap.info, subtitle: this.scene.subtitle };
			this.t = 0;
			this.done = 0;
			this.regular = 0;
			this.last = null;
			this.shift = [Math.random(), Math.random()]; // a different set of starts each time
		}

		// the i-th orbit's start, spread evenly over the picture
		start (i) {
			return [TAU * mod(halton(i + 1, 2) + this.shift[0]), TAU * mod(halton(i + 1, 3) + this.shift[1])];
		}

		nextOrbit () {
			const [th, p] = this.start(this.done);
			const o = orbit(this.K, th, p);
			o.chaotic = o.lyapunov > CHAOTIC;
			if (!o.chaotic) this.regular++;
			this.done++;
			return (this.last = o);
		}

		step (dt) {
			this.t += dt;
		}

		draw (ctx, w, h) {
			const due = Math.min(ORBITS, Math.floor(this.t * ORBITS_PER_SECOND) + 1);
			if (this.done < due) this.plot(ctx, w, h, this.nextOrbit()); // one a frame at most
			if (this.done >= ORBITS) this.resting = true;
		}

		// θ across, [0, 2π); p up, centred on 0 and as many periods as the canvas is tall for its width
		plot (ctx, w, h, o) {
			const sx = w / TAU, sy = sx, span = h / sy, lo = -span / 2;
			const copies = Math.ceil(span / TAU) + 1;
			// hue by how far the orbit turns each kick, give or take a little so that neighbours
			// with the same turn (the rings of one island) can be told apart
			const hue = 200 + 360 * o.rotation + 50 * (((this.done * 0.618034) % 1) - 0.5);
			ctx.fillStyle = o.chaotic ? "#9aa3b8" : `hsl(${hue % 360}, 85%, 62%)`;
			ctx.globalAlpha = o.chaotic ? 0.5 : 0.9;
			const pts = o.pts, s = o.chaotic ? 1.3 : 1.6, n = o.chaotic ? 2 * SEA_DOTS : pts.length;
			for (let i = 0; i < n; i += 2) {
				const x = pts[i] * sx;
				// every copy of this p (mod 2π) in view
				let q = pts[i + 1] - TAU * Math.ceil((pts[i + 1] - lo) / TAU);
				for (let c = 0; c <= copies; c++, q += TAU) {
					if (q < lo || q >= lo + span) continue;
					ctx.fillRect(x - s / 2, h - (q - lo) * sy - s / 2, s, s);
				}
			}
			ctx.globalAlpha = 1;
		}

		readout () {
			const o = this.last;
			const kind = !o ? "" : o.chaotic
				? `chaotic: nearby starts part by ×${Math.exp(o.lyapunov).toFixed(2)} a kick (Lyapunov exponent ${o.lyapunov.toFixed(3)})`
				: `regular: turns ${o.rotation.toFixed(4)} of a circle a kick, and stretches nothing (${o.lyapunov.toFixed(4)})`;
			return `K = ${this.K}    orbit ${this.done} of ${ORBITS}: ${this.regular} regular, ${this.done - this.regular} chaotic\n` +
				(o ? `the latest is ${kind}` : "");
		}
	}

	StandardMap.shown = 0;
	StandardMap.info = {
		title: "The standard map",
		subtitle: "",
		equations: [
			"p<sub>n+1</sub> = p<sub>n</sub> + K sin θ<sub>n</sub>, &nbsp; θ<sub>n+1</sub> = θ<sub>n</sub> + p<sub>n+1</sub> &nbsp; (mod 2π)",
			"<span class=\"chaos-note\">A rotor kicked once a turn of the clock, by a kick that depends on its angle θ (across); p (up) is its spin. Each colour is one orbit, 2,000 kicks from one start: a curve or a chain of islands if it is regular, coloured by how far it turns each kick, and grey dust if it is chaotic. The curves that span the picture are the tori of the KAM theorem (Kolmogorov, Arnold, Moser); no orbit can cross one. The last of them breaks at K = 0.971635 (John Greene, 1979). Boris Chirikov used this map to explain why particles escape from magnetic traps.</span>"
		]
	};
	StandardMap.orbit = orbit;
	StandardMap.SCENES = SCENES;
	StandardMap.K_CRITICAL = K_CRITICAL;
	StandardMap.ORBITS = ORBITS;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.standardMap = StandardMap;
	if (typeof module !== "undefined") module.exports = { StandardMap };
})(typeof window !== "undefined" ? window : globalThis);
