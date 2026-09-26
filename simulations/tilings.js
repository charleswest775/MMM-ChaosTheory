/* Not chaos: tilings that never repeat, and one of a plane with no edge. A tiling is laid tile
 * by tile, round and round from the centre, then held:
 *   - quasiperiodic rhombs from de Bruijn's multigrid (1981): n families of evenly spaced
 *     parallel lines, at random offsets, each crossing of two lines a rhomb. Five families make
 *     a Penrose tiling (offsets summing to 0), four the Ammann–Beenker's squares and rhombs,
 *     seven a heptagonal one, six a dodecagonal one. A new tiling every time.
 *   - Escher's Circle Limit: the hyperbolic plane in Poincaré's disc, tiled by regular p-gons,
 *     q at each corner, each the same size, shrinking only to us towards the rim, which is
 *     infinitely far away. Built by reflecting a p-gon in its sides; halves of its triangles
 *     shaded, as in Coxeter's figure that Escher saw.
 *   - the hat (hat.js): the single tile that covers the plane only without repeating.
 *
 * Drawn for the Pi like sacred geometry: each frame adds the tiles due, in a spiral, so a frame's
 * changes stay together; when the tiling is laid the sim rests.
 */
(function (root) {
	const Hat = root.ChaosHat || require("./hat.js");

	const PHI = (1 + Math.sqrt(5)) / 2;
	const MARGIN = 0.95;     // the tiling's radius, as a fraction of half the canvas
	const BANDS = 14;        // the spiral: rings, each laid round from the top

	// ---- de Bruijn's multigrid

	// Directions of the n families: 2πj/n for odd n (their opposites make 2n), πj/n for even n
	const directions = (n) => Array.from({ length: n }, (_, j) => {
		const a = (n % 2 ? 2 : 1) * Math.PI * j / n;
		return [Math.cos(a), Math.sin(a)];
	});

	// The rhombs of the tiling dual to the grids x·e_j + γ_j ∈ ℤ, within radius R (edge lengths):
	// [{ pts: [x0, y0, …], type: 1…⌊n/2⌋ (the angle between the two families, in steps) }]
	function multigrid (n, gamma, R) {
		const e = directions(n), tiles = [];
		// the tiling is about n/2 times the grid: look at grid points within 2R/n, and a margin
		const K = Math.ceil((2 * R) / n) + 3;
		for (let j = 0; j < n; j++) {
			for (let l = j + 1; l < n; l++) {
				const det = e[j][0] * e[l][1] - e[j][1] * e[l][0];
				for (let kj = -K; kj <= K; kj++) {
					for (let kl = -K; kl <= K; kl++) {
						// the crossing p of line kj of family j and line kl of family l
						const a = kj - gamma[j], b = kl - gamma[l];
						const px = (a * e[l][1] - b * e[j][1]) / det, py = (b * e[j][0] - a * e[l][0]) / det;
						// the vertex of the region p is in, for the other families: Σ K_i e_i
						let bx = kj * e[j][0] + kl * e[l][0], by = kj * e[j][1] + kl * e[l][1];
						for (let i = 0; i < n; i++) {
							if (i === j || i === l) continue;
							const Ki = Math.ceil(px * e[i][0] + py * e[i][1] + gamma[i]);
							bx += Ki * e[i][0]; by += Ki * e[i][1];
						}
						const pts = [bx, by, bx + e[j][0], by + e[j][1], bx + e[j][0] + e[l][0], by + e[j][1] + e[l][1], bx + e[l][0], by + e[l][1]];
						const cx = bx + (e[j][0] + e[l][0]) / 2, cy = by + (e[j][1] + e[l][1]) / 2;
						if (Math.hypot(cx, cy) > R) continue;
						tiles.push({ pts, cx, cy, type: Math.min(l - j, n - (l - j)) });
					}
				}
			}
		}
		return tiles;
	}

	// ---- the hyperbolic plane, in Poincaré's disc (points as [x, y], |z| < 1)

	// the circle through a and b orthogonal to the unit circle ({ cx, cy, r }), or null for a
	// diameter: the geodesic through them
	function geodesic (a, b) {
		const cross = a[0] * b[1] - a[1] * b[0];
		if (Math.abs(cross) < 1e-12) return null;
		// centre c with |c − a|² = |c|² − 1 and the same for b: c·a = (|a|² + 1)/2
		const ra = (a[0] * a[0] + a[1] * a[1] + 1) / 2, rb = (b[0] * b[0] + b[1] * b[1] + 1) / 2;
		const cx = (ra * b[1] - rb * a[1]) / cross, cy = (rb * a[0] - ra * b[0]) / cross;
		return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - 1) };
	}

	// reflect z in the geodesic through a and b
	function reflect (z, a, b) {
		const g = geodesic(a, b);
		if (!g) {
			// a line through the origin, along a (or b)
			const d = Math.hypot(a[0], a[1]) > 1e-12 ? a : b, L = Math.hypot(d[0], d[1]), ux = d[0] / L, uy = d[1] / L;
			const t = z[0] * ux + z[1] * uy;
			return [2 * t * ux - z[0], 2 * t * uy - z[1]];
		}
		const dx = z[0] - g.cx, dy = z[1] - g.cy, k = (g.r * g.r) / (dx * dx + dy * dy);
		return [g.cx + dx * k, g.cy + dy * k];
	}

	// The tiling {p, q}: tiles { v: corners, m: midpoints of the sides, c: centre }, each the
	// central p-gon reflected in sides; tiles smaller (across) than `smallest` are left out
	function hyperbolic (p, q, smallest, limit = 6000) {
		// the central p-gon's corners: hyperbolic circumradius R with cosh R = cot(π/p) cot(π/q)
		const Rh = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
		const rv = Math.tanh(Rh / 2);
		// and the midpoints of its sides: cosh(inradius) = cos(π/q) / sin(π/p)
		const rm = Math.tanh(Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p)) / 2);
		const first = {
			v: Array.from({ length: p }, (_, k) => [rv * Math.sin((2 * Math.PI * k) / p), rv * Math.cos((2 * Math.PI * k) / p)]),
			m: Array.from({ length: p }, (_, k) => [rm * Math.sin((2 * Math.PI * (k + 0.5)) / p), rm * Math.cos((2 * Math.PI * (k + 0.5)) / p)]),
			c: [0, 0], depth: 0
		};
		const key = (z) => `${Math.round(z[0] * 1e7)},${Math.round(z[1] * 1e7)}`;
		const seen = new Set([key(first.c)]), tiles = [first], queue = [first];
		while (queue.length && tiles.length < limit) {
			const t = queue.shift();
			for (let k = 0; k < p; k++) {
				const a = t.v[k], b = t.v[(k + 1) % p];
				const c = reflect(t.c, a, b), id = key(c);
				if (seen.has(id)) continue;
				seen.add(id);
				const v = t.v.map((z) => reflect(z, a, b)), m = t.m.map((z) => reflect(z, a, b));
				let size = 0;
				for (let i = 0; i < p; i++) size = Math.max(size, Math.hypot(v[i][0] - c[0], v[i][1] - c[1]));
				if (2 * size < smallest) continue;
				const tile = { v, m, c, depth: t.depth + 1 };
				tiles.push(tile);
				queue.push(tile);
			}
		}
		return tiles;
	}

	// the hyperbolic distance of z from the centre
	const hyperbolicRadius = (z) => 2 * Math.atanh(Math.min(0.999999999, Math.hypot(z[0], z[1])));

	// ---- the hat

	// Hats from three rounds of substitution, recentred, within radius R (in the hat's units, a
	// kite's long side = 1): [{ pts, label, reflected }]
	function hats (R, levels = 3) {
		const [H] = Hat.metatiles(levels);
		const all = Hat.hats(H).map((h) => {
			let cx = 0, cy = 0;
			for (let i = 0; i < h.pts.length; i += 2) { cx += h.pts[i]; cy += h.pts[i + 1]; }
			return { ...h, cx: (2 * cx) / h.pts.length, cy: (2 * cy) / h.pts.length, reflected: Hat.det(h.T) < 0 };
		});
		// centre on the middle of the patch (the mean of the hats' centres), where it's complete
		const mx = all.reduce((s, h) => s + h.cx, 0) / all.length, my = all.reduce((s, h) => s + h.cy, 0) / all.length;
		// the patch's hats are half-size in the metatiles' units: scale them back up
		return all.map((h) => ({
			pts: h.pts.map((v, i) => 2 * (v - (i % 2 ? my : mx))), cx: 2 * (h.cx - mx), cy: 2 * (h.cy - my),
			label: h.label, reflected: h.reflected
		})).filter((h) => Math.hypot(h.cx, h.cy) <= R);
	}

	// ---- the tilings shown, and their captions

	const PALETTES = [
		{ name: "gold", fills: [[214, 160, 70], [96, 130, 190], [170, 90, 120]], edge: [255, 236, 200] },
		{ name: "sea", fills: [[40, 150, 170], [220, 170, 90], [120, 90, 200]], edge: [220, 245, 250] },
		{ name: "rose", fills: [[200, 90, 130], [240, 190, 120], [90, 140, 210]], edge: [255, 225, 235] },
		{ name: "jade", fills: [[70, 170, 120], [200, 200, 110], [70, 110, 190]], edge: [225, 250, 230] },
		{ name: "violet", fills: [[140, 100, 220], [230, 150, 190], [80, 170, 200]], edge: [236, 228, 255] }
	];

	const KINDS = [
		{
			key: "penrose", title: "A Penrose tiling", n: 5, R: 12.5,
			subtitle: "two rhombs, thick and thin, that fit together in infinitely many ways and never repeat",
			types: ["thick (72°)", "thin (36°)"],
			story: "Roger Penrose found in 1974 that tiles like these can cover the plane only without repeating. In 1982 Dan Shechtman found a crystal with the same five-fold order; Linus Pauling said there were no quasicrystals, only quasi-scientists, and Shechtman won the Nobel prize in 2011."
		},
		{
			key: "ammann-beenker", title: "The Ammann–Beenker tiling", n: 4, R: 11,
			subtitle: "squares and 45° rhombs with eight-fold order, never repeating",
			types: ["45° rhombs", "squares"],
			story: "Robert Ammann, an amateur mathematician, found it in the 1970s, and F. P. M. Beenker described it in 1982. The squares and rhombs come in the ratio 1 : √2, which no repeating pattern could have."
		},
		{
			key: "heptagonal", title: "A heptagonal tiling", n: 7, R: 12,
			subtitle: "three rhombs, with angles of 1, 2 and 3 sevenths of 180°, never repeating",
			types: ["51° rhombs", "103° rhombs", "154° rhombs"],
			story: "Nicolaas de Bruijn showed in 1981 that every tiling like this is the dual of a multigrid: n families of evenly spaced lines, one tile for each crossing of two lines. Any n will do; here, seven."
		},
		{
			key: "dodecagonal", title: "A dodecagonal tiling", n: 6, R: 12,
			subtitle: "squares and rhombs of 30° and 60° with twelve-fold order, never repeating",
			types: ["30° rhombs", "60° rhombs", "squares"],
			story: "Quasicrystals with twelve-fold order were found in alloys of tantalum and tellurium in 1998. Each tile here is a crossing of two of six families of lines, and there are as many of each kind as the sine of its angle says."
		},
		...[[7, 3], [5, 4], [4, 5], [6, 4], [3, 7]].map(([p, q]) => ({
			key: `hyperbolic-${p}-${q}`, title: "Circle Limit", p, q,
			subtitle: `the hyperbolic plane in Poincaré's disc: regular ${p}-gons, ${q} at every corner, all the same size`,
			story: [
				"M. C. Escher saw a figure like this in a paper by the geometer H. S. M. Coxeter in 1957 and made his Circle Limit woodcuts (1958–1960) from it: fish, angels and devils, all the same size, smaller only to us.",
				"In the 1820s Bolyai and Lobachevsky found a geometry in which Euclid's fifth postulate fails: through a point beside a line run infinitely many lines that never meet it. Poincaré's disc (1882) shows it whole; its rim is infinitely far away.",
				"Here a triangle's angles add up to less than 180°, and what they fall short by is its area. Every tile has the same area, and the pieces of the plane grow exponentially with the distance from the centre."
			]
		})),
		{
			key: "hat", title: "The hat",
			subtitle: "one tile, and its mirror image, covering the plane without ever repeating",
			story: "In November 2022 David Smith, a retired print technician in Yorkshire who played with shapes cut from card, found the first einstein (one stone): a single tile that tiles the plane, but never periodically. With Joseph Myers, Craig Kaplan and Chaim Goodman-Strauss he proved it in 2023."
		}
	];

	// decks of kinds and palettes still to show, shared by successive instances
	const decks = { kinds: [], palettes: [] };
	const deal = (name, n) => {
		const d = decks[name];
		if (!d.length) {
			for (let i = 0; i < n; i++) d.push(i);
			for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
		}
		return d.shift();
	};

	const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

	// mulberry32: seeded, so a tiling can be drawn again
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

	class Tilings {
		// tilingsSeconds: time to lay a tiling; kind: this one; seed: its offsets
		constructor ({ tilingsSeconds = 22, kind, seed = Math.floor(Math.random() * 2 ** 32) } = {}) {
			this.kind = KINDS.find((k) => k.key === kind) || KINDS[deal("kinds", KINDS.length)];
			this.palette = PALETTES[deal("palettes", PALETTES.length)];
			this.seconds = tilingsSeconds;
			this.seed = seed;
			this.build();
			this.t = 0;
			this.next = 0;          // tiles drawn so far
			this.resting = false;
			this.info = this.buildInfo();
		}

		build () {
			const k = this.kind, rnd = random(this.seed);
			if (k.n) {
				// offsets: random, but for Penrose summing to 0, as his matching rules require
				const gamma = Array.from({ length: k.n }, () => rnd());
				if (k.n === 5) gamma[4] = -(gamma[0] + gamma[1] + gamma[2] + gamma[3]);
				this.gamma = gamma;
				this.tiles = multigrid(k.n, gamma, k.R);
				this.extent = k.R + 1;
			} else if (k.p) {
				this.tiles = hyperbolic(k.p, k.q, 0.004).map((t) => ({ ...t, cx: t.c[0], cy: t.c[1] }));
				this.extent = 1;
			} else {
				this.tiles = hats(52, 4);
				this.extent = 54;
			}
			// the spiral: rings from the centre, each laid clockwise from the top
			const band = (t) => Math.floor((Math.hypot(t.cx, t.cy) / this.extent) * BANDS);
			const angle = (t) => (Math.atan2(t.cx, t.cy) + 2 * Math.PI) % (2 * Math.PI);
			this.tiles.sort((a, b) => band(a) - band(b) || angle(a) - angle(b));
		}

		step (dt) {
			this.t += dt;
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.cx = w / 2; this.cy = h / 2;
			this.S = ((Math.min(w, h) / 2) * MARGIN) / this.extent;
			this.px = Math.max(1, Math.min(w, h) / 700);
			this.next = 0;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const due = Math.min(this.tiles.length, Math.ceil((this.t / this.seconds) * this.tiles.length));
			if (due > this.next) {
				ctx.save();
				ctx.lineJoin = "round";
				if (this.kind.p) this.drawHyperbolic(ctx, this.next, due);
				else this.drawPolygons(ctx, this.next, due);
				ctx.restore();
				this.next = due;
			}
			if (this.next >= this.tiles.length) this.resting = true;
		}

		// rhombs and hats: filled by kind, outlined
		drawPolygons (ctx, from, to) {
			const { cx, cy, S, px, palette } = this, hat = !this.kind.n;
			for (let i = from; i < to; i++) {
				const t = this.tiles[i];
				ctx.beginPath();
				for (let k = 0; k < t.pts.length; k += 2) {
					const x = cx + S * t.pts[k], y = cy - S * t.pts[k + 1];
					if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
				}
				ctx.closePath();
				const fill = hat ? this.hatColour(t) : palette.fills[(t.type - 1) % palette.fills.length];
				ctx.fillStyle = rgba(fill, hat ? 0.75 : 0.6);
				ctx.fill();
				ctx.strokeStyle = rgba(palette.edge, 0.85);
				ctx.lineWidth = 1.1 * px;
				ctx.stroke();
			}
		}

		// the hats as the paper colours them: by the metatile they began in, the reflected ones apart
		hatColour (t) {
			const [a, b, c] = this.palette.fills;
			if (t.reflected) return c;
			return { H: a, T: [235, 230, 220], P: a.map((v) => Math.round(v * 0.6 + 60)), F: b }[t.label] || a;
		}

		// Hyperbolic tiles: the triangles (centre, corner, midpoint) of one handedness shaded,
		// then the sides; every edge a geodesic arc
		drawHyperbolic (ctx, from, to) {
			const { cx, cy, S, px, palette } = this, p = this.kind.p;
			const X = (z) => cx + S * z[0], Y = (z) => cy - S * z[1];
			// a path along the geodesic from a to b (already at a)
			const edge = (a, b) => {
				const g = geodesic(a, b);
				if (!g) { ctx.lineTo(X(b), Y(b)); return; }
				const a0 = Math.atan2(-(a[1] - g.cy), a[0] - g.cx), a1 = Math.atan2(-(b[1] - g.cy), b[0] - g.cx);
				let d = a1 - a0;
				d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
				ctx.arc(cx + S * g.cx, cy - S * g.cy, S * g.r, a0, a1, d < 0);
			};
			for (let i = from; i < to; i++) {
				const t = this.tiles[i];
				ctx.fillStyle = rgba(palette.fills[0], 0.55);
				for (let k = 0; k < p; k++) {
					// the two triangles (centre, corner, midpoint) either side of midpoint k: mirror
					// images, so of opposite handedness; shade the anticlockwise ones
					for (const v of [t.v[k], t.v[(k + 1) % p]]) {
						const m = t.m[k], turn = (v[0] - t.c[0]) * (m[1] - t.c[1]) - (v[1] - t.c[1]) * (m[0] - t.c[0]);
						if (turn <= 0) continue;
						ctx.beginPath();
						ctx.moveTo(X(t.c), Y(t.c));
						edge(t.c, v); edge(v, m); edge(m, t.c);
						ctx.closePath();
						ctx.fill();
					}
				}
				ctx.beginPath();
				ctx.moveTo(X(t.v[0]), Y(t.v[0]));
				for (let k = 0; k < p; k++) edge(t.v[k], t.v[(k + 1) % p]);
				ctx.closePath();
				ctx.strokeStyle = rgba(palette.edge, 0.8);
				ctx.lineWidth = Math.max(0.5, Math.min(1.4, 1.4 * (1 - Math.hypot(...t.c) ** 2) + 0.3)) * px;
				ctx.stroke();
			}
		}

		buildInfo () {
			const k = this.kind;
			const equations = [];
			if (k.n) {
				const e = directions(k.n);
				equations.push(`${k.n} families of lines x · e<sub>j</sub> + γ<sub>j</sub> ∈ ℤ, e<sub>j</sub> at ${k.n % 2 ? `${(360 / k.n).toFixed(k.n === 7 ? 1 : 0)}°` : `${180 / k.n}°`} steps; each crossing of two families is a rhomb`);
				const weights = this.typeWeights(e);
				if (k.n === 5) equations.push("thick : thin → sin 72° : sin 36° = φ = 1.618…, the golden ratio");
				else if (k.n === 4) equations.push("rhombs : squares → 4 sin 45° : 2 sin 90° = √2");
				else equations.push(`${k.types.join(" : ")} → ${weights.map((w) => w.toFixed(3)).join(" : ")}`);
			} else if (k.p) {
				const { p, q } = k, area = Math.PI * (p - 2 - (2 * p) / q);
				equations.push(`{${p}, ${q}}: &nbsp;(p − 2)(q − 2) = ${(p - 2) * (q - 2)} > 4, so the corners' angles (2π/${q}) are too small for a flat plane`);
				equations.push(`each tile's area, by Gauss–Bonnet: (p − 2)π − p · 2π/q = ${area.toFixed(3)}, near the rim or not`);
			} else {
				equations.push("8 kites of the hexagonal grid; tiled by substitution: 4 kinds of cluster (metatiles), each round φ⁴ ≈ 6.85 times as many");
				equations.push("unreflected : reflected hats → φ⁴ = 6.854…");
			}
			const stories = [].concat(k.story);
			equations.push(`<span class="chaos-note">${stories[Math.floor(this.seed * 1000) % stories.length]}</span>`);
			return { title: k.title, subtitle: k.subtitle, equations };
		}

		// how often each kind of rhomb comes: the number of pairs of families at that angle, times its sine
		typeWeights (e = directions(this.kind.n)) {
			const n = this.kind.n, w = [];
			for (let j = 0; j < n; j++) {
				for (let l = j + 1; l < n; l++) {
					const type = Math.min(l - j, n - (l - j));
					w[type - 1] = (w[type - 1] || 0) + Math.abs(e[j][0] * e[l][1] - e[j][1] * e[l][0]);
				}
			}
			const min = Math.min(...w);
			return w.map((v) => v / min);
		}

		readout () {
			const k = this.kind, laid = this.tiles.slice(0, this.next);
			if (k.n) {
				const counts = new Array(Math.floor(k.n / 2)).fill(0);
				for (const t of laid) counts[t.type - 1]++;
				const text = counts.map((c, i) => `${k.types[i]} ${c}`).join("   ");
				if (k.n === 5 || k.n === 4) {
					const [a, b] = counts, ratio = b ? a / b : 0;
					return `${text}\n${k.n === 5 ? "thick : thin" : "rhombs : squares"} = ${ratio.toFixed(3)}    ${k.n === 5 ? `φ = ${PHI.toFixed(3)}` : `√2 = ${Math.SQRT2.toFixed(3)}`}`;
				}
				return `${text}\n${laid.length} tiles`;
			}
			if (k.p) {
				const far = laid.reduce((m, t) => Math.max(m, hyperbolicRadius(t.c)), 0);
				const shrink = laid.length ? Math.cosh(far / 2) ** 2 : 1;
				return `${laid.length.toLocaleString("en")} tiles, the farthest ${far.toFixed(2)} from the centre\n` +
					`drawn there ${shrink.toFixed(0)} times smaller than at the centre`;
			}
			const reflected = laid.filter((t) => t.reflected).length;
			return `${laid.length} hats, ${reflected} of them reflected\n` +
				`unreflected : reflected = ${reflected ? ((laid.length - reflected) / reflected).toFixed(2) : "–"}    φ⁴ = ${(PHI ** 4).toFixed(3)}`;
		}
	}

	Tilings.KINDS = KINDS;
	Tilings.multigrid = multigrid;
	Tilings.hyperbolic = hyperbolic;
	Tilings.geodesic = geodesic;
	Tilings.reflect = reflect;
	Tilings.hyperbolicRadius = hyperbolicRadius;
	Tilings.hats = hats;
	Tilings.directions = directions;
	Tilings.info = { title: "Tilings", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.tilings = Tilings;
	if (typeof module !== "undefined") module.exports = { Tilings };
})(typeof window !== "undefined" ? window : globalThis);
