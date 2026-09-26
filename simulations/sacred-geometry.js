/* Sacred geometry: n-fold figures of circles and straight lines, a new one every time, made to be
 * drawn the way they are drawn by hand: from the centre out, the compass first, then the
 * straightedge.
 *
 * A figure is a stack of layers from the centre out. First a core: the Seed of Life, the Flower
 * of Life, Metatron's Cube, stars within stars, a whirl of pursuit polygons, a times-table
 * envelope, a mystic rose, golden spirals or a lotus. Then two or three bands, each on the
 * circle the last one ended on: star polygons whose sides touch that circle, lotus petals,
 * beads, an arcade, rings after Whorld, spirals, rays or rosettes; and a rim. Which, how many,
 * how big and in which colours is decided by one 32-bit seed, so a figure can be drawn again
 * from its number, and there are far more figures than showings.
 *
 * Every layer is a list of steps, and every step a set of strokes drawn at the same time: one
 * pen per symmetric copy, so the figure keeps its symmetry while it grows. In mirror-symmetric
 * figures each element is drawn symmetrically too: a circle by two pens setting off in opposite
 * directions from the point nearest the centre, a line from its middle out to both ends.
 * Turning figures (a third of them) have a sense of rotation instead: whirls, pinwheels,
 * leaning petals, and pens that all go round the same way.
 *
 * Units: the outermost circle has radius 1 (a figure is scaled to that once built), the centre
 * is (0, 0), y points up, and angles run clockwise from north: P(r, a) = (r sin a, r cos a), so
 * a star built at a = 0 points up. UMD-style, so tests can check the geometry in Node.
 */
(function (root) {
	const PI = Math.PI;
	const TAU = 2 * PI;
	const PHI = (1 + Math.sqrt(5)) / 2;

	// ---- randomness: seeded (mulberry32), so a figure's number is enough to draw it again

	function random (seed) {
		let s = seed >>> 0;
		const rnd = () => {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
		rnd.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * rnd());
		rnd.chance = (p) => rnd() < p;
		rnd.pick = (list) => list[Math.floor(rnd() * list.length)];
		// [[item, weight], …] → one item, in proportion to its weight
		rnd.weighted = (pairs) => {
			const live = pairs.filter(([, w]) => w > 0);
			let x = rnd() * live.reduce((sum, [, w]) => sum + w, 0);
			for (const [item, w] of live) if ((x -= w) < 0) return item;
			return live.length ? live[live.length - 1][0] : undefined;
		};
		return rnd;
	}

	// ---- plane geometry

	const P = (r, a) => [r * Math.sin(a), r * Math.cos(a)];
	const angleOf = (x, y) => Math.atan2(x, y);
	const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
	const lerp = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
	// multiples of n from lo to hi: the orders a layer may have and keep the figure's symmetry
	const multiples = (n, lo, hi) => {
		const out = [];
		for (let k = n * Math.max(1, Math.ceil(lo / n)); k <= hi; k += n) out.push(k);
		return out;
	};

	// Strokes. An arc starts at angle a on the circle about (x, y) and sweeps da (clockwise when
	// positive); a path is a polyline, with its cumulative length for drawing part of it.
	const arc = (x, y, r, a, da) => ({ kind: "arc", x, y, r, a, da });
	const line = (x0, y0, x1, y1) => ({ kind: "line", x0, y0, x1, y1 });
	const dot = (x, y, r) => ({ kind: "dot", x, y, r });
	function path (pts) {
		const cum = new Float64Array(pts.length / 2);
		for (let i = 1; i < cum.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[2 * i] - pts[2 * i - 2], pts[2 * i + 1] - pts[2 * i - 1]);
		return { kind: "path", pts: Float64Array.from(pts), cum };
	}

	function strokeLength (s) {
		switch (s.kind) {
			case "arc": return Math.abs(s.da) * s.r;
			case "line": return Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
			case "path": return s.cum[s.cum.length - 1];
			default: return 0;
		}
	}

	// the point a fraction f of the way along a stroke
	function pointAt (s, f) {
		switch (s.kind) {
			case "arc": { const [x, y] = P(s.r, s.a + s.da * f); return [s.x + x, s.y + y]; }
			case "line": return [s.x0 + (s.x1 - s.x0) * f, s.y0 + (s.y1 - s.y0) * f];
			case "path": {
				const { pts, cum } = s, d = f * cum[cum.length - 1];
				let i = 0;
				while (i < cum.length - 2 && cum[i + 1] < d) i++;
				const seg = cum[i + 1] - cum[i], g = seg > 0 ? clamp((d - cum[i]) / seg, 0, 1) : 0;
				return [pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * g, pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * g];
			}
			default: return [s.x, s.y];
		}
	}

	// how far from the centre a stroke reaches
	function reach (s) {
		switch (s.kind) {
			case "arc": {
				const d = Math.hypot(s.x, s.y);
				if (d < 1e-12) return s.r;
				// the circle's farthest point, if the arc passes it; otherwise one of its ends
				const lo = Math.min(s.a, s.a + s.da), far = angleOf(s.x, s.y);
				if ((((far - lo) % TAU) + TAU) % TAU <= Math.abs(s.da)) return d + s.r;
				return Math.max(Math.hypot(...pointAt(s, 0)), Math.hypot(...pointAt(s, 1)));
			}
			case "line": return Math.max(Math.hypot(s.x0, s.y0), Math.hypot(s.x1, s.y1));
			case "path": {
				let m = 0;
				for (let i = 0; i < s.pts.length; i += 2) m = Math.max(m, Math.hypot(s.pts[i], s.pts[i + 1]));
				return m;
			}
			default: return Math.hypot(s.x, s.y) + s.r;
		}
	}

	function scaleStroke (s, f) {
		for (const key of ["x", "y", "r", "x0", "y0", "x1", "y1"]) if (key in s) s[key] *= f;
		if (s.pts) { for (let i = 0; i < s.pts.length; i++) s.pts[i] *= f; for (let i = 0; i < s.cum.length; i++) s.cum[i] *= f; }
	}

	// The parts of the circle about (x, y) of radius rho that lie between radius r0 and r1 of the
	// centre, as [middle angle, half-width] of the circle, each part symmetric about its middle.
	// On the circle |p|² = d² + ρ² + 2dρ cos δ, with δ measured from the point farthest out.
	function clip (x, y, rho, r0, r1) {
		const d = Math.hypot(x, y);
		if (d < 1e-12) return rho >= r0 - 1e-12 && rho <= r1 + 1e-12 ? [[0, PI]] : [];
		const out = angleOf(x, y);
		const cosAt = (r) => (r * r - d * d - rho * rho) / (2 * d * rho);
		// (a circle that just touches the ring's edge is whole, not short by a rounding error)
		const hi = cosAt(r1), lo = cosAt(r0);
		const A = hi >= 1 - 1e-9 ? 0 : Math.acos(Math.max(-1, hi)); // |p| ≤ r1 where |δ| ≥ A
		const B = lo <= -1 + 1e-9 ? PI : Math.acos(Math.min(1, lo)); // |p| ≥ r0 where |δ| ≤ B
		if (B - A < 1e-9) return [];
		if (A < 1e-9 && B > PI - 1e-9) return [[out + PI, PI]];  // all of it: start nearest the centre
		if (A < 1e-9) return [[out, B]];                         // one arc, through the farthest point
		if (B > PI - 1e-9) return [[out + PI, PI - A]];          // one arc, through the nearest point
		return [[out + (A + B) / 2, (B - A) / 2], [out - (A + B) / 2, (B - A) / 2]];
	}

	// the circular arc from A to B bulging out by `bulge` × |AB| to the left of A→B (side 1) or the right (−1)
	function bow (A, B, bulge, side) {
		const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy);
		const h = bulge * L, rho = (L * L / 4 + h * h) / (2 * h);
		const nx = (-dy / L) * side, ny = (dx / L) * side;
		const cx = (A[0] + B[0]) / 2 - nx * (rho - h), cy = (A[1] + B[1]) / 2 - ny * (rho - h);
		const a0 = angleOf(A[0] - cx, A[1] - cy);
		let da = angleOf(B[0] - cx, B[1] - cy) - a0;
		da -= TAU * Math.round(da / TAU); // the minor arc: bulge < ½, so less than a half circle
		return arc(cx, cy, rho, a0, da);
	}

	// a logarithmic spiral from radius r0 out to r1, turning by `turn` (radians, clockwise if
	// positive) and starting at angle a; points evenly spaced along it
	function spiral (r0, r1, turn, a, spacing = 0.008) {
		const T = Math.abs(turn), b = Math.log(r1 / r0) / T;
		const len = ((r1 - r0) * Math.sqrt(1 + b * b)) / b;
		const m = Math.max(8, Math.ceil(len / spacing)), grow = Math.exp(b * T) - 1, pts = [];
		for (let i = 0; i <= m; i++) {
			const th = Math.log(1 + (grow * i) / m) / b; // arc length from the start ∝ e^(bθ) − 1
			pts.push(...P(r0 * Math.exp(b * th), a + Math.sign(turn) * th));
		}
		return pts;
	}

	// The star polygon {k/q}: k points on a circle, each joined to the q-th point on. Its sides
	// pass the centre at R cos(πq/k), and neighbouring sides cross at R cos(πq/k) / cos(π/k),
	// halfway between two points: the corners of the smaller star inside.
	const starTangent = (k, q) => Math.cos((PI * q) / k);
	const starInner = (k, q) => Math.cos((PI * q) / k) / Math.cos(PI / k);

	// One of Whorld's rings (victimofleisure.github.io/Whorld): 2k corners alternating between
	// radius r and r·q, the odd ones turned on by pin·π/k (its "pinwheel"); each side a cubic
	// Bézier whose control points lie along the corners' tangents, c × the radius away ("curve";
	// negative makes loops). Returns the 2k sides as polylines.
	function whorldRing (k, r, q, pin, rot, cEven, cOdd, samples = 14) {
		const corners = [];
		for (let m = 0; m < 2 * k; m++) {
			const odd = m & 1, a = rot + (PI * m) / k + (odd ? (pin * PI) / k : 0), rr = odd ? r * q : r, c = odd ? cOdd : cEven;
			corners.push({ p: P(rr, a), t: [c * rr * Math.cos(a), -c * rr * Math.sin(a)] });
		}
		return corners.map((A, m) => {
			const B = corners[(m + 1) % (2 * k)];
			if (!cEven && !cOdd) return [...A.p, ...B.p];
			const c1 = [A.p[0] + A.t[0], A.p[1] + A.t[1]], c2 = [B.p[0] - B.t[0], B.p[1] - B.t[1]], pts = [];
			for (let i = 0; i <= samples; i++) {
				const u = i / samples, v = 1 - u;
				const w0 = v * v * v, w1 = 3 * v * v * u, w2 = 3 * v * u * u, w3 = u * u * u;
				pts.push(w0 * A.p[0] + w1 * c1[0] + w2 * c2[0] + w3 * B.p[0], w0 * A.p[1] + w1 * c1[1] + w2 * c2[1] + w3 * B.p[1]);
			}
			return pts;
		});
	}

	// Gauss–Wantzel: a regular n-gon can be constructed with compass and straightedge exactly when
	// n is a power of 2 times distinct Fermat primes (3, 5, 17, 257, 65537).
	function constructible (n) {
		let m = n;
		while (m % 2 === 0) m /= 2;
		for (const p of [3, 5, 17, 257, 65537]) {
			if (m % p) continue;
			m /= p;
			if (m % p === 0) return false;
		}
		return m === 1;
	}

	// ---- colours: [r, g, b] by tone (0: lines, 1: accents) and distance from the centre

	const PALETTES = [
		{ name: "gold", main: [236, 188, 100], accent: [255, 234, 180], glow: [255, 196, 110] },
		{ name: "sapphire", main: [100, 148, 255], accent: [200, 224, 255], glow: [130, 170, 255] },
		{ name: "rose", main: [255, 116, 166], accent: [255, 208, 150], glow: [255, 140, 185] },
		{ name: "jade", main: [76, 212, 168], accent: [236, 224, 150], glow: [110, 225, 195] },
		{ name: "amethyst", main: [172, 132, 255], accent: [255, 180, 232], glow: [180, 150, 255] },
		{ name: "silver", main: [192, 204, 224], accent: [240, 212, 158], glow: [200, 214, 255] },
		{ name: "spectrum", hues: [10, 330] },  // a rainbow from the centre out, as Whorld cycles its hue
		{ name: "fire", hues: [50, -8] },       // gold at the centre, red at the rim
		{ name: "aurora", hues: [160, 285] }    // teal to violet
	];

	function hsl (h, s, l) {
		const f = (k) => {
			const m = (k + h / 30) % 12;
			return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(m - 3, 9 - m, 1))));
		};
		return [f(0), f(8), f(4)];
	}

	function colour (palette, tone, r) {
		if (!palette.hues) return tone === 1 ? palette.accent : palette.main;
		const [h0, h1] = palette.hues, h = ((h0 + (h1 - h0) * clamp(r, 0, 1)) % 360 + 360) % 360;
		return tone === 1 ? hsl((h + 25) % 360, 0.9, 0.78) : hsl(h, 0.85, 0.62);
	}

	const glowColour = (palette) => palette.glow || hsl(((palette.hues[0] % 360) + 360) % 360, 0.8, 0.7);

	// ---- building a figure

	const POLYGONS = { 3: "triangle", 4: "square", 5: "pentagon", 6: "hexagon", 7: "heptagon", 8: "octagon" };

	class Builder {
		constructor (rnd, n, mirror) {
			this.rnd = rnd;
			this.n = n;
			this.mirror = mirror;
			this.layers = [];
			this.circleAt = -1; // radius of the last circle about the centre
		}

		// a new layer: its steps follow each other, starting `overlap` of a step before the last ends.
		// chiral: its finished shape has no mirror symmetry (a whirl, a pinwheel, leaning petals)
		layer (name, { plain = false, intensity = 1, width = 1, overlap = 0, chiral = false } = {}) {
			this.L = { name, plain, intensity, width, overlap, chiral, steps: [], circles: 0, arcs: 0, lines: 0, curves: 0 };
			this.layers.push(this.L);
		}

		step (strokes, { tone = 0, quick = false } = {}) {
			if (strokes.length) this.L.steps.push({ strokes, tone, quick });
		}

		// 0 or half a step of k: the offsets that keep a k-fold layer symmetric about the vertical
		offset (k) { return this.rnd.chance(0.5) ? 0 : PI / k; }

		around (k, t, fn) {
			const out = [];
			for (let i = 0; i < k; i++) out.push(...fn(t + (TAU * i) / k, i));
			return out;
		}

		// a whole circle about (x, y) started at its point at angle a
		circle (x, y, r, a) {
			this.L.circles++;
			return this.mirror ? [arc(x, y, r, a, PI), arc(x, y, r, a, -PI)] : [arc(x, y, r, a, TAU)];
		}

		// a circle about the centre, drawn by pens starting from k symmetric points
		ring (r, k, t) {
			this.L.circles++;
			this.circleAt = r;
			const out = [];
			for (let i = 0; i < k; i++) {
				const a = t + (TAU * i) / k;
				if (this.mirror) out.push(arc(0, 0, r, a, PI / k), arc(0, 0, r, a, -PI / k));
				else out.push(arc(0, 0, r, a, TAU / k));
			}
			return out;
		}

		// the arc of the circle about (x, y) symmetric about angle mid, half-width h: from its
		// middle out, or (inwards) from both ends to the middle
		arcAbout (x, y, r, mid, h, inwards = false) {
			if (h > PI - 1e-9) this.L.circles++; else this.L.arcs++;
			if (!this.mirror) return [arc(x, y, r, mid - h, 2 * h)];
			return inwards ? [arc(x, y, r, mid - h, h), arc(x, y, r, mid + h, -h)] : [arc(x, y, r, mid, h), arc(x, y, r, mid, -h)];
		}

		// the parts of a circle between radius r0 and r1
		clipped (x, y, r, r0, r1, inwards = false) {
			return clip(x, y, r, r0, r1).flatMap(([mid, h]) => this.arcAbout(x, y, r, mid, h, inwards));
		}

		// a straight line from p to q, or from its middle out to both ends
		segment (p, q, fromMiddle = true) {
			this.L.lines++;
			if (!this.mirror || !fromMiddle) return [line(p[0], p[1], q[0], q[1])];
			const m = lerp(p, q, 0.5);
			return [line(m[0], m[1], p[0], p[1]), line(m[0], m[1], q[0], q[1])];
		}

		curve (pts) {
			this.L.curves++;
			return path(pts);
		}

		// the sides of the star {k/q} with its points on radius R, the first at angle t
		star (k, q, R, t) {
			const out = [];
			for (let i = 0; i < (2 * q === k ? k / 2 : k); i++) out.push(...this.segment(P(R, t + (TAU * i) / k), P(R, t + (TAU * (i + q)) / k)));
			return out;
		}

		// A petal on axis a: from a base w wide (as an angle) on radius r0 to its tip on r1, turned
		// by `lean`; each side a circular arc bulging out by `bulge` × its chord. Mirror figures draw
		// both sides from the base up; turning ones go round, up one side and down the other.
		petal (a, r0, r1, w, bulge, lean = 0) {
			this.L.arcs += 2;
			const left = P(r0, a - w / 2), right = P(r0, a + w / 2), tip = P(r1, a + lean);
			return this.mirror ? [bow(left, tip, bulge, 1), bow(right, tip, bulge, -1)] : [bow(left, tip, bulge, 1), bow(tip, right, bulge, 1)];
		}

		// a circle about the centre at r, unless the last layer ended on one; sometimes doubled
		boundary (r) {
			if (Math.abs(this.circleAt - r) > 1e-9) {
				this.layer("circle", { plain: true });
				this.step(this.ring(r, this.n, 0));
			}
			if (this.rnd.chance(0.25)) {
				r += 0.012;
				this.layer("circle", { plain: true });
				this.step(this.ring(r, this.n, 0));
			}
			return r;
		}
	}

	// ---- cores: from the centre out to radius c. Each returns its outer radius, or null (before
	// adding anything) if it can't be made for this figure.

	function seedCore (g, c) {
		const { n, rnd } = g;
		const k = 6 % n === 0 && rnd.chance(0.65) ? 6 : rnd.pick(multiples(n, 8, 30));
		const a = c / 2, t = g.offset(k);
		// six circles through the centre, each centred on the first: the compass never changes
		g.layer(k === 6 ? "the Seed of Life" : `${k} circles through the centre`, { intensity: Math.min(1, 12 / k) });
		if (k === 6) g.step(g.circle(0, 0, a, t));
		g.step(g.around(k, t, (u) => g.circle(...P(a, u), a, u + PI)));
		g.step(g.ring(c, k, t));
		return c;
	}

	// circles on a triangular lattice, as many as reach into a disc, cut off at its edge:
	// with two rings round the centre, the Flower of Life's 19 circles and the arcs completing its petals
	function flowerCore (g, c) {
		if (6 % g.n) return null;
		const rings = g.rnd.chance(0.6) ? 2 : 3, a = c / (rings + 1), t = g.rnd.pick([0, PI / 6]);
		g.layer(rings === 2 ? "the Flower of Life" : "the Flower of Life, a ring larger", { intensity: 0.8 });
		const e1 = P(a, t), e2 = P(a, t + PI / 3), byRing = [];
		for (let i = -rings - 3; i <= rings + 3; i++) {
			for (let j = -rings - 3; j <= rings + 3; j++) {
				const x = i * e1[0] + j * e2[0], y = i * e1[1] + j * e2[1];
				if (Math.hypot(x, y) >= c + a - 1e-9) continue;
				const h = Math.max(Math.abs(i), Math.abs(j), Math.abs(i + j)); // lattice steps from the centre
				(byRing[h] = byRing[h] || []).push([x, y]);
			}
		}
		for (const centres of byRing) if (centres) g.step(centres.flatMap(([x, y]) => g.clipped(x, y, a, 0, c)));
		g.step(g.ring(c, 6, t));
		return c;
	}

	// the Fruit of Life's 13 circles and the 78 lines joining their centres
	function metatronCore (g, c) {
		if (6 % g.n) return null;
		const a = c / 5, t = g.rnd.pick([0, PI / 6]);
		g.layer("Metatron's Cube", { intensity: 0.75, overlap: 0.35 });
		const inner = [], outer = [];
		for (let i = 0; i < 6; i++) { inner.push(P(2 * a, t + (PI * i) / 3)); outer.push(P(4 * a, t + (PI * i) / 3)); }
		g.step(g.circle(0, 0, a, t));
		g.step(inner.flatMap(([x, y]) => g.circle(x, y, a, angleOf(x, y) + PI)));
		g.step(outer.flatMap(([x, y]) => g.circle(x, y, a, angleOf(x, y) + PI)));
		// a family at a time: lines as long as each other with middles as far from the centre are
		// copies of each other (under rotation and reflection)
		const pts = [[0, 0], ...inner, ...outer], families = new Map();
		for (let i = 0; i < pts.length; i++) {
			for (let j = i + 1; j < pts.length; j++) {
				const [p, q] = [pts[i], pts[j]], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
				const key = `${len.toFixed(6)} ${Math.hypot(...lerp(p, q, 0.5)).toFixed(6)}`;
				if (!families.has(key)) families.set(key, { len, lines: [] });
				families.get(key).lines.push([p, q]);
			}
		}
		[...families.values()].sort((A, B) => A.len - B.len)
			.forEach(({ lines }) => g.step(lines.flatMap(([p, q]) => g.segment(p, q))));
		return c;
	}

	// a star, the smaller star made by its crossing sides, and so on inwards: for {5/2} each
	// pentagram is 1/φ² the size of the last
	function cascadeCore (g, c) {
		const { n, rnd } = g, options = [];
		for (const k of multiples(n, 5, 24)) {
			for (let q = 2; 2 * q < k; q++) if (starInner(k, q) > 0.3 && starInner(k, q) < 0.72) options.push([k, q]);
		}
		if (!options.length) return null;
		const [k, q] = n === 5 ? [5, 2] : rnd.pick(options), shrink = starInner(k, q);
		let t = g.offset(k), R = c;
		g.layer(k === 5 ? "pentagrams within pentagrams" : `stars {${k}/${q}} within stars`, { overlap: 0.3 });
		g.step(g.ring(c, k, t));
		for (let level = 0; R > 0.03 && level < 7; level++) {
			g.step(g.star(k, q, R, t));
			R *= shrink;
			t += (PI * (q + 1)) / k; // the next star's points are this one's inner corners
		}
		return c;
	}

	// Pursuit polygons (the "mice problem"): each polygon's corners a fraction f along the last
	// one's sides, so they shrink and turn, and every corner runs in on a logarithmic spiral.
	// Either one n-gon or n triangles, one per sector. Turning figures only.
	function whirlCore (g, c) {
		const { n, rnd } = g;
		if (g.mirror) return null;
		const t = g.offset(n), polygon = n <= 8 && rnd.chance(0.55);
		let shapes;
		if (polygon) {
			const shrink = (f) => Math.hypot(1 - f + f * Math.cos(TAU / n), f * Math.sin(TAU / n));
			let f = rnd.range(0.06, 0.14);
			while (Math.log(0.04) / Math.log(shrink(f)) > 60) f += 0.02; // at most ~60 polygons
			g.layer(`a whirl of ${POLYGONS[n]}s`, { overlap: 0.7, intensity: 0.75, chiral: true });
			shapes = [Array.from({ length: n }, (_, i) => P(c, t + (TAU * i) / n))];
			while (shapes.length < 70 && Math.hypot(...shapes[shapes.length - 1][0]) > 0.04 * c) {
				const s = shapes[shapes.length - 1];
				shapes.push(s.map((p, i) => lerp(p, s[(i + 1) % n], f)));
			}
		} else {
			const f = rnd.range(0.08, 0.14);
			g.layer(`${n} whirling triangles`, { overlap: 0.7, intensity: 0.7, chiral: true });
			shapes = [];
			let tris = Array.from({ length: n }, (_, i) => [[0, 0], P(c, t + (TAU * i) / n), P(c, t + (TAU * (i + 1)) / n)]);
			const size = (tri) => Math.hypot(tri[1][0] - tri[0][0], tri[1][1] - tri[0][1]);
			for (let level = 0; level < 40 && size(tris[0]) > 0.035 * c; level++) {
				shapes.push(...tris);
				tris = tris.map((tri) => tri.map((p, i) => lerp(p, tri[(i + 1) % 3], f)));
			}
			// group the triangles back into levels of n
			shapes = Array.from({ length: shapes.length / n }, (_, l) => shapes.slice(l * n, (l + 1) * n));
		}
		g.step(g.ring(c, n, t));
		for (const level of shapes) {
			const polys = polygon ? [level] : level;
			g.step(polys.flatMap((poly) => poly.flatMap((p, i) => g.segment(p, poly[(i + 1) % poly.length], false))));
		}
		return c;
	}

	// N points round a circle, point j joined to point m·j (mod N): the lines' envelope is an
	// epicycloid with m − 1 cusps (m = 2 gives the cardioid), or for negative m a hypocycloid
	// with 1 − m. Here m = n + 1 or 1 − n, so the envelope has the figure's n-fold symmetry.
	function stringsCore (g, c) {
		const { n, rnd } = g;
		const per = Math.max(3, Math.round(rnd.range(100, 160) / n)), N = n * per;
		const epi = rnd.chance(0.65), m = epi ? n + 1 : N + 1 - n;
		g.layer(`${N} chords, j to ${epi ? m : `−${n - 1}`}·j`, { overlap: 0.85, intensity: 0.55 });
		g.step(g.ring(c, n, 0));
		const chord = (j) => {
			const k = (m * j) % N;
			return k === j ? [] : g.segment(P(c, (TAU * j) / N), P(c, (TAU * k) / N), false);
		};
		const orbit = (s) => Array.from({ length: n }, (_, i) => chord(((s % per) + per) % per + i * per)).flat();
		// all n copies of a chord at once; in mirror figures its reflection too, so the envelope
		// is drawn from the top down both sides at once
		if (g.mirror) {
			for (let s = 0; 2 * s <= per; s++) g.step(s === 0 || 2 * s === per ? orbit(s) : [...orbit(s), ...orbit(-s)]);
		} else {
			for (let s = 0; s < per; s++) g.step(orbit(s));
		}
		return c;
	}

	// every chord between m points: the stars {m/1}, {m/2} … in turn
	function roseCore (g, c) {
		const m = g.n >= 7 ? g.n : 2 * g.n;
		if (m > 18) return null;
		const t = g.offset(m);
		g.layer(`a mystic rose, all ${(m * (m - 1)) / 2} chords of ${m} points`, { overlap: 0.4, intensity: 0.6 });
		g.step(g.ring(c, m, t));
		for (let q = 1; 2 * q <= m; q++) g.step(g.star(m, q, c, t));
		return c;
	}

	// spirals out of a small circle, both ways in mirror figures, crossing like a sunflower's
	// seeds. Golden ones grow by φ every quarter turn.
	function sunflowerCore (g, c) {
		const { n, rnd } = g;
		const k = n >= 8 ? n : 2 * n, golden = rnd.chance(0.5), r0 = c * rnd.range(0.06, 0.1);
		const turn = golden ? Math.log(c / r0) / (Math.log(PHI) / (PI / 2)) : rnd.range(0.35, 0.9) * TAU;
		const t = g.offset(k);
		g.layer(`${golden ? "golden spirals" : "spirals"}, ${g.mirror ? `${k} each way` : k}`, { intensity: 0.7, chiral: !g.mirror });
		g.step(g.ring(r0, k, t));
		g.step(g.around(k, t, (a) => (g.mirror ? [1, -1] : [1]).map((dir) => g.curve(spiral(r0, c, dir * turn, a)))));
		g.step(g.ring(c, k, t));
		return c;
	}

	// rings of petals from a small circle, each ring longer and turned half a petal
	function lotusCore (g, c) {
		const { n, rnd } = g;
		const ks = multiples(n, 5, 16);
		const k = ks.length ? rnd.pick(ks) : n, rings = rnd.int(2, 3), r0 = c * rnd.range(0.14, 0.22), t = g.offset(k);
		const lean = g.mirror ? 0 : rnd.range(0.12, 0.3) * (TAU / k);
		g.layer(`a lotus, ${rings} rings of ${k} petals`, { overlap: 0.15, chiral: lean !== 0 });
		g.step(g.circle(0, 0, r0, t));
		for (let j = 0; j < rings; j++) {
			const tip = r0 + ((c - r0) * (j + 1)) / rings, w = (TAU / k) * rnd.range(1, 1.5), bulge = rnd.range(0.14, 0.3);
			g.step(g.around(k, t + (j * PI) / k, (a) => g.petal(a, r0, tip, w, bulge, lean)));
		}
		g.circleAt = -1;
		return c;
	}

	// ---- bands: from the circle at r out towards rMax, filling most of that room. Each returns
	// its outer radius, or null (before adding anything) if it can't be made to fit.

	// star polygons whose sides touch the circle inside them
	function starBand (g, r, rMax) {
		const { n, rnd } = g, options = [];
		for (const k of multiples(n, 5, 36)) {
			for (let q = 2; 2 * q < k; q++) {
				const R = r / starTangent(k, q);
				if (R >= r * 1.12 && R <= rMax) options.push({ k, q, R });
			}
		}
		if (!options.length) return null;
		options.sort((A, B) => B.R - A.R); // the larger ones fill the band
		const { k, q, R } = rnd.pick(options.slice(0, 3)), t = g.offset(k);
		if (!g.mirror && k >= 12 && rnd.chance(0.4)) {
			// a turbine: from each point, the line that touches the inner circle, on one side only
			g.layer(`a turbine of ${k} blades`, { chiral: true });
			g.step(g.ring(R, k, t));
			const turn = Math.acos(r / R);
			g.step(g.around(k, t, (a) => g.segment(P(R, a), P(r, a + turn), false)));
			return R;
		}
		const style = rnd.weighted([["one", 3], ["two", 2], ["all", q <= 5 ? 1.5 : 0]]);
		const qs = style === "one" ? [q] : style === "two" ? [q - 1, q] : Array.from({ length: q }, (_, i) => i + 1);
		g.layer(style === "one" ? `the star {${k}/${q}}` : style === "two" ? `stars {${k}/${q - 1}} and {${k}/${q}}` : `stars {${k}/1} to {${k}/${q}}`, { overlap: 0.25 });
		g.step(g.ring(R, k, t));
		for (const qq of qs) g.step(g.star(k, qq, R, t));
		if (rnd.chance(0.4)) g.step(g.around(k, t, (a) => [dot(...P(R, a), 0.008)]), { tone: 1, quick: true });
		return R;
	}

	// petals standing on the circle, about as wide at the base as they are tall
	function lotusBand (g, r, rMax) {
		const { n, rnd } = g, h = (rMax - r) * rnd.range(0.8, 1);
		if (h < 0.045) return null;
		const ks = multiples(n, 5, 96).filter((k) => (TAU * r) / k >= Math.max(0.035, 0.45 * h) && (TAU * r) / k <= 1.3 * h);
		if (!ks.length) return null;
		const k = rnd.pick(ks), t = g.offset(k), bulge = rnd.range(0.12, 0.34);
		const double = rnd.chance(0.45), h1 = double ? h / 1.35 : h;
		const lean = g.mirror ? 0 : rnd.range(0.12, 0.3) * (TAU / k);
		g.layer(double ? `a double lotus, ${2 * k} petals` : `a lotus of ${k} petals`, { chiral: lean !== 0 });
		g.step(g.around(k, t, (a) => g.petal(a, r, r + h1, TAU / k, bulge, lean)));
		if (double) g.step(g.around(k, t + PI / k, (a) => g.petal(a, r, r + h, TAU / k, bulge, lean)));
		if (rnd.chance(0.35)) g.step(g.around(k, t, (a) => g.petal(a, r, r + 0.6 * h1, (0.5 * TAU) / k, bulge, lean * 0.6)), { tone: 1 });
		if (!double && rnd.chance(0.3)) g.step(g.around(k, t, (a) => [dot(...P(r + h + 0.014, a + lean), 0.006)]), { tone: 1, quick: true });
		g.circleAt = -1;
		return r + h + (double ? 0 : 0.014);
	}

	// circles in a ring, touching the circle inside them and each other, or overlapping in a chain
	function beadBand (g, r, rMax) {
		const { n, rnd } = g, s = rnd.chance(0.55) ? 1 : rnd.range(1.25, 1.7), want = (rMax - r) * rnd.range(0.75, 1);
		let best = null;
		for (const k of multiples(n, 6, 144)) {
			const sig = s * Math.sin(PI / k);
			if (sig >= 0.9) continue;
			const rho = (r * sig) / (1 - sig); // centres at r + ρ: touching the circle inside
			if (2 * rho > rMax - r || rho < 0.012) continue;
			if (!best || Math.abs(2 * rho - want) < Math.abs(2 * best.rho - want)) best = { k, rho };
		}
		if (!best) return null;
		const { k, rho } = best, t = g.offset(k), d = r + rho;
		g.layer(s === 1 ? `${k} beads` : `a chain of ${k} circles`, { intensity: s > 1 ? 0.85 : 1 });
		g.step(g.around(k, t, (a) => g.circle(...P(d, a), rho, a + PI)));
		if (rnd.chance(0.45)) {
			const f = rnd.range(0.35, 0.6);
			g.step(g.around(k, t, (a) => g.circle(...P(d, a), rho * f, a + PI)), { tone: 1 });
		} else if (rnd.chance(0.4)) {
			g.step(g.around(k, t, (a) => [dot(...P(d, a), Math.min(0.008, rho * 0.3))]), { tone: 1, quick: true });
		}
		return r + 2 * rho;
	}

	// arches standing on the circle, each a circle centred on it and cut off where it dips inside:
	// a little more than half circles
	function archBand (g, r, rMax) {
		const { n, rnd } = g, h = (rMax - r) * rnd.range(0.8, 1);
		if (h < 0.035) return null;
		const ks = multiples(n, 8, 144).filter((k) => (TAU * r) / k >= Math.max(0.03, 0.5 * h) && (TAU * r) / k <= 1.15 * h);
		if (!ks.length) return null;
		const k = rnd.pick(ks), t = g.offset(k), twice = (TAU * r) / k >= 0.05 && rnd.chance(0.35);
		g.layer(`an arcade of ${twice ? 2 * k : k} arches`);
		const arches = (u) => g.around(k, u, (a) => g.clipped(...P(r, a), h, r, r + h, true));
		g.step(arches(t));
		if (twice) g.step(arches(t + PI / k));
		g.step(g.ring(r + h, n, 0));
		return r + h;
	}

	// Rings after Whorld, which spawns a ring at the centre every few frames and grows it
	// outwards, turning it as it grows, while oscillators vary its parameters: here a ring every
	// step apart, its star factor swinging on a sine as Whorld's oscillators do. In turning
	// figures the rings twist further the farther out they are, and pinwheel.
	function whorlBand (g, r, rMax) {
		const { n, rnd, mirror } = g;
		const ks = multiples(n, 5, 24), k = ks.length ? rnd.pick(ks) : n;
		const rOut = r + (rMax - r) * rnd.range(0.85, 1);
		if (rOut - r < 0.08) return null;
		const q0 = rnd.range(0.55, 0.95), qa = rnd.chance(0.55) ? rnd.range(0.08, 0.22) : 0;
		const period = rnd.int(3, 7), phase = rnd() * TAU;
		const pin = mirror ? 0 : rnd.range(-0.6, 0.6), twist = mirror ? 0 : rnd.pick([-1, 1]) * rnd.range(0.8, 3);
		const bend = () => (rnd.chance(0.55) ? rnd.range(-0.2, 0.35) : 0), cEven = bend(), cOdd = bend();
		const qj = (j) => Math.max(0.35, q0 + qa * Math.sin((TAU * j) / period + phase));
		// the rings' extents at radius 1, to fit them between r and rOut
		const extent = (j) => {
			let lo = Infinity, hi = 0;
			for (const pts of whorldRing(k, 1, qj(j), pin, 0, cEven, cOdd)) {
				for (let i = 0; i < pts.length; i += 2) { const d = Math.hypot(pts[i], pts[i + 1]); lo = Math.min(lo, d); hi = Math.max(hi, d); }
			}
			return [lo, hi];
		};
		let J = rnd.int(6, 11), gap = 0, r0 = 0;
		for (; J >= 5; J--) {
			const ext = Array.from({ length: J }, (_, j) => extent(j));
			r0 = r / Math.min(...ext.map(([lo]) => lo));
			gap = (rOut / Math.max(...ext.map(([, hi]) => hi)) - r0) / (J - 1);
			if (gap >= 0.012) break;
		}
		if (gap < 0.012) return null;
		const t = g.offset(k);
		g.layer(`${J} rings after Whorld`, { overlap: 0.55, intensity: 0.85, chiral: pin !== 0 || twist !== 0 });
		for (let j = 0; j < J; j++) {
			const rj = r0 + j * gap;
			const sides = whorldRing(k, rj, qj(j), pin, t + twist * rj, cEven, cOdd);
			// mirror figures draw each side away from the odd corner, where the ring's mirror lines are
			g.step(sides.map((pts, m) => {
				if (mirror && m % 2 === 0) { const rev = []; for (let i = pts.length - 2; i >= 0; i -= 2) rev.push(pts[i], pts[i + 1]); pts = rev; }
				return g.curve(pts);
			}));
		}
		g.circleAt = -1;
		return rOut;
	}

	// logarithmic spirals crossing the band, both ways in mirror figures
	function spiralBand (g, r, rMax) {
		const { n, rnd } = g, rOut = Math.min(rMax, r * 1.9);
		if (rOut - r < 0.07) return null;
		const k = rnd.pick(multiples(n, 8, 48)), turn = (rnd.range(1, 2.2) * TAU) / k, t = g.offset(k);
		g.layer(g.mirror ? `${k} + ${k} spirals` : `${k} spirals`, { intensity: 0.8, chiral: !g.mirror });
		g.step(g.around(k, t, (a) => (g.mirror ? [1, -1] : [1]).map((dir) => g.curve(spiral(r, rOut, dir * turn, a)))));
		g.step(g.ring(rOut, k, t));
		return rOut;
	}

	function rayBand (g, r, rMax) {
		const { n, rnd } = g, h = (rMax - r) * rnd.range(0.75, 1) - 0.012;
		if (h < 0.035) return null;
		const k = rnd.pick(multiples(n, 12, 72)), t = g.offset(k);
		g.layer(`${2 * k} rays`);
		g.step(g.around(k, t, (a) => g.segment(P(r, a), P(r + h, a), false)));
		g.step(g.around(k, t + PI / k, (a) => g.segment(P(r, a), P(r + 0.55 * h, a), false)));
		if (rnd.chance(0.5)) g.step(g.around(k, t, (a) => [dot(...P(r + h + 0.012, a), 0.006)]), { tone: 1, quick: true });
		g.circleAt = -1;
		return r + h + 0.012;
	}

	// small Seeds of Life in circles touching each other and the circle inside them: the figure
	// repeated in miniature, as OmniGeometry draws a shape at the points of itself
	function rosetteBand (g, r, rMax) {
		const { n, rnd } = g, want = (rMax - r) * rnd.range(0.75, 1);
		let best = null;
		for (const k of multiples(n, 6, 72)) {
			const s = Math.sin(PI / k), rho = (r * s) / (1 - s);
			if (2 * rho > rMax - r || rho < 0.022) continue;
			if (!best || Math.abs(2 * rho - want) < Math.abs(2 * best.rho - want)) best = { k, rho };
		}
		if (!best) return null;
		const { k, rho } = best, t = g.offset(k), d = r + rho;
		g.layer(`${k} rosettes`);
		g.step(g.around(k, t, (a) => g.circle(...P(d, a), rho, a + PI)));
		g.step(g.around(k, t, (a) => {
			const [x, y] = P(d, a);
			return g.around(6, a, (u) => { const [px, py] = P(rho / 2, u); return g.circle(x + px, y + py, rho / 2, u + PI); });
		}), { tone: 1 });
		g.circleAt = -1;
		return r + 2 * rho;
	}

	const CORES = [
		{ build: seedCore, size: [0.26, 0.38], weight: (g) => (6 % g.n === 0 ? 3 : 2) },
		{ build: flowerCore, size: [0.34, 0.48], weight: (g) => (6 % g.n === 0 ? 3 : 0) },
		{ build: metatronCore, size: [0.36, 0.5], weight: (g) => (6 % g.n === 0 ? 2 : 0) },
		{ build: cascadeCore, size: [0.28, 0.42], weight: (g) => (g.n === 5 ? 3 : 1.5) },
		{ build: whirlCore, size: [0.3, 0.44], weight: (g) => (g.mirror ? 0 : 3) },
		{ build: stringsCore, size: [0.34, 0.48], weight: () => 1.5 },
		{ build: roseCore, size: [0.32, 0.46], weight: () => 1.5 },
		{ build: sunflowerCore, size: [0.28, 0.42], weight: () => 1.5 },
		{ build: lotusCore, size: [0.28, 0.42], weight: () => 2 }
	];

	// Bands that carry a figure, and thinner ones between and round them
	const MAJOR = [[starBand, () => 3], [lotusBand, () => 2.5], [whorlBand, (g) => (g.mirror ? 1.5 : 3)], [spiralBand, () => 1.2], [rosetteBand, () => 0.8]];
	const MINOR = [[beadBand, () => 3], [archBand, () => 2], [lotusBand, () => 1.5], [rayBand, () => 1], [rosetteBand, () => 1.2]];
	const PLANS = [[["major", "minor"], 3], [["major"], 2], [["major", "major"], 1.5], [["minor", "major"], 1.2], [["major", "minor", "major"], 0.8]];
	const SHARE = { major: 3, minor: 1, rim: 0.7 }; // of the room outside the core

	// symmetry orders, and how often each comes up
	const FOLDS = [[6, 3], [12, 3], [8, 2], [5, 1.5], [10, 1.5], [16, 1], [7, 0.6], [9, 0.6], [24, 0.4], [18, 0.4], [4, 0.4], [3, 0.3], [20, 0.3]];

	function compose (g) {
		const { rnd } = g;
		let r = null;
		const cores = CORES.map((C) => [C, C.weight(g)]);
		while (r === null) {
			const core = rnd.weighted(cores);
			r = core.build(g, rnd.range(...core.size));
			if (r === null) cores.find((e) => e[0] === core)[1] = 0;
		}
		// then the bands, each given a share of the room left, and a rim (a thin band) or not
		const parts = [...rnd.weighted(PLANS), ...(rnd.chance(0.7) ? ["rim"] : [])];
		let last = null;
		parts.forEach((part, i) => {
			r = g.boundary(r);
			const rest = parts.slice(i).reduce((sum, p) => sum + SHARE[p], 0);
			const rMax = r + (Math.max(0, 0.96 - r) * SHARE[part] * rnd.range(0.9, 1.15)) / rest;
			const pool = (part === "major" ? MAJOR : MINOR).filter(([B]) => B !== last).map(([B, w]) => [B, w(g)]);
			while (pool.some(([, w]) => w > 0)) {
				const band = rnd.weighted(pool), got = band(g, r, rMax);
				if (got !== null) { r = got; last = band; break; }
				pool.find((e) => e[0] === band)[1] = 0;
			}
		});
		// the circle closing the figure, sometimes doubled
		if (Math.abs(g.circleAt - r) > 1e-9) {
			g.layer("circle", { plain: true });
			g.step(g.ring(r, g.n, 0));
		}
		if (rnd.chance(0.6)) {
			g.layer("circle", { plain: true });
			g.step(g.ring(r + 0.014, g.n, 0));
		}
	}

	// scale the figure so its outermost stroke reaches radius 1
	function normalize (layers) {
		let max = 0;
		for (const L of layers) for (const S of L.steps) for (const s of S.strokes) max = Math.max(max, reach(s));
		for (const L of layers) for (const S of L.steps) for (const s of S.strokes) scaleStroke(s, 1 / max);
	}

	// Time for a step: a pen's journey (its longest stroke), with a floor so short strokes are
	// still seen being drawn. In unscaled seconds; schedule() stretches them to the time given.
	const stepTime = (S) => (S.quick ? 0.25 : 0.3 + 1.1 * S.strokes.reduce((m, s) => Math.max(m, strokeLength(s)), 0) ** 0.75);
	const LAYER_GAP = 0.15;
	const LAYER_MAX = 4.5; // no layer takes longer than this: many-stepped ones (Metatron's 78 lines) go faster

	// [start, duration] of each step of a layer, from its own start, in unscaled seconds
	function layerTimes (L) {
		let start = 0, end = 0;
		const times = L.steps.map((S) => {
			const d = stepTime(S), at = [start, d];
			end = Math.max(end, start + d);
			start += d * (1 - L.overlap);
			return at;
		});
		const f = Math.min(1, LAYER_MAX / end);
		return { span: end * f, times: times.map(([t0, d]) => [t0 * f, d * f]) };
	}

	const duration = (layers) => layers.reduce((t, L) => t + layerTimes(L).span, 0) + LAYER_GAP * (layers.length - 1);

	// A new figure from a seed. folds, palettes: only these symmetry orders / palette names.
	function generate (seed, { folds = [], palettes = [] } = {}) {
		const rnd = random(seed);
		const allowedFolds = FOLDS.filter(([n]) => folds.includes(n));
		const n = rnd.weighted(allowedFolds.length ? allowedFolds : FOLDS);
		const mirror = rnd.chance(0.68);
		const allowedPalettes = PALETTES.filter((p) => palettes.includes(p.name));
		const palette = rnd.pick(allowedPalettes.length ? allowedPalettes : PALETTES);
		// a figure that would take too long to draw in its time is composed again
		let g;
		for (let attempt = 0; attempt < 6; attempt++) {
			g = new Builder(rnd, n, mirror);
			compose(g);
			if (duration(g.layers) < 34) break;
		}
		normalize(g.layers);
		const count = (key) => g.layers.reduce((sum, L) => sum + L[key], 0);
		return {
			// mirror: drawn symmetrically; chiral: the finished figure has no mirror symmetry
			seed: seed >>> 0, n, mirror, chiral: g.layers.some((L) => L.chiral), palette, layers: g.layers,
			counts: { circles: count("circles"), arcs: count("arcs"), lines: count("lines"), curves: count("curves") }
		};
	}

	// Start times and durations for every step, in seconds, the whole figure taking `seconds`:
	// steps in time order, each knowing its layer. Resets drawing progress.
	function schedule (figure, seconds) {
		const f = seconds / duration(figure.layers), steps = [];
		let t = 0;
		for (const L of figure.layers) {
			const { span, times } = layerTimes(L);
			L.steps.forEach((S, i) => {
				Object.assign(S, { layer: L, t0: (t + times[i][0]) * f, dur: times[i][1] * f, p: 0 });
				steps.push(S);
			});
			t += span + LAYER_GAP;
		}
		return steps;
	}

	// "3a7f21c0", "#3A7F21C0", 0x3a7f21c0 → the number; anything else → null
	function parseSeed (v) {
		if (typeof v === "number" && isFinite(v)) return v >>> 0;
		if (typeof v === "string" && /^#?[0-9a-f]{1,8}$/i.test(v.trim())) return parseInt(v.trim().replace("#", ""), 16) >>> 0;
		return null;
	}

	const seedName = (seed) => (seed >>> 0).toString(16).toUpperCase().padStart(8, "0");

	const SacredGeometry = {
		generate, schedule, parseSeed, seedName, constructible, colour, glowColour,
		strokeLength, pointAt, reach, clip, bow, spiral, whorldRing, starTangent, starInner, random,
		PALETTES, FOLDS, PHI
	};
	root.ChaosSacredGeometry = SacredGeometry;
	if (typeof module !== "undefined") module.exports = SacredGeometry;
})(typeof window !== "undefined" ? window : globalThis);
