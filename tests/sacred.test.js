// Checks for the sacred geometry figures. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const SG = require("../simulations/sacred-geometry.js");
const { Sacred } = require("../simulations/sacred.js");

const { PHI } = SG;
const strokes = (figure) => figure.layers.flatMap((L) => L.steps.flatMap((S) => S.strokes));
const seeds = (count, from = 1) => Array.from({ length: count }, (_, i) => (Math.imul(from + i, 2654435761) >>> 0));

// the first figure (trying seeds in turn) whose first layer's name matches
function find (pattern, options = {}) {
	for (const seed of seeds(5000)) {
		const f = SG.generate(seed, options);
		if (pattern.test(f.layers[0].name)) return f;
	}
	throw new Error(`no figure starting with ${pattern}`);
}

// Points every `spacing` along every stroke, and a lookup for "is there a point of the figure near here"
function sampler (figure, spacing = 0.004) {
	const cell = 0.01, grid = new Map(), points = [];
	for (const s of strokes(figure)) {
		const m = Math.max(1, Math.ceil(SG.strokeLength(s) / spacing));
		for (let i = 0; i <= m; i++) {
			const p = SG.pointAt(s, i / m);
			points.push(p);
			const key = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
			if (!grid.has(key)) grid.set(key, []);
			grid.get(key).push(p);
		}
	}
	const near = ([x, y], tol) => {
		const i = Math.floor(x / cell), j = Math.floor(y / cell);
		for (let di = -1; di <= 1; di++) {
			for (let dj = -1; dj <= 1; dj++) {
				for (const q of grid.get(`${i + di},${j + dj}`) || []) if (Math.hypot(q[0] - x, q[1] - y) < tol) return true;
			}
		}
		return false;
	};
	return { points, near };
}

test("constructible polygons are those Gauss and Wantzel said (OEIS A003401)", () => {
	const known = [3, 4, 5, 6, 8, 10, 12, 15, 16, 17, 20, 24, 30, 32, 34, 40, 48, 51, 60, 64, 68, 80, 85, 96];
	for (let n = 3; n <= 100; n++) assert.strictEqual(SG.constructible(n), known.includes(n), `n = ${n}`);
});

test("the caption says the same about constructibility", () => {
	for (let n = 3; n <= 100; n++) assert.strictEqual(Sacred.constructibility(n).startsWith("It can "), SG.constructible(n), `n = ${n}`);
});

test("a star {k/q}: sides pass the centre at R cos(πq/k), neighbouring sides cross at R cos(πq/k)/cos(π/k)", () => {
	const P = (a) => [Math.sin(a), Math.cos(a)];
	for (const [k, q] of [[5, 2], [6, 2], [7, 3], [8, 3], [12, 5], [16, 7]]) {
		const side = (i) => [P((2 * Math.PI * i) / k), P((2 * Math.PI * (i + q)) / k)];
		const [a, b] = side(0), [c, d] = side(1);
		// distance of side 0 from the centre
		const dist = Math.abs(a[0] * b[1] - a[1] * b[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]);
		assert.ok(Math.abs(dist - SG.starTangent(k, q)) < 1e-12, `{${k}/${q}} tangent`);
		// where sides 0 and 1 cross
		const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
		const u = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den;
		const x = [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
		assert.ok(u > 0 && u < 1, `{${k}/${q}}: the sides cross within themselves`);
		assert.ok(Math.abs(Math.hypot(...x) - SG.starInner(k, q)) < 1e-12, `{${k}/${q}} inner corner`);
	}
	// the pentagram's inner pentagon is 1/φ² of it
	assert.ok(Math.abs(SG.starInner(5, 2) - 1 / PHI ** 2) < 1e-12);
});

test("clipping a circle to a ring keeps exactly the parts inside it", () => {
	const rnd = SG.random(7);
	for (let trial = 0; trial < 500; trial++) {
		const x = rnd.range(-1, 1), y = rnd.range(-1, 1), rho = rnd.range(0.05, 1), r0 = rnd.range(0, 0.8), r1 = r0 + rnd.range(0.05, 0.8);
		const parts = SG.clip(x, y, rho, r0, r1);
		const inside = (a) => { const d = Math.hypot(x + rho * Math.sin(a), y + rho * Math.cos(a)); return d >= r0 - 1e-9 && d <= r1 + 1e-9; };
		// every sampled point of the circle is inside the ring exactly when it's on a kept part
		for (let i = 0; i < 360; i++) {
			const a = (2 * Math.PI * (i + 0.5)) / 360;
			const kept = parts.some(([mid, h]) => Math.abs(Math.atan2(Math.sin(a - mid), Math.cos(a - mid))) <= h + 1e-9);
			assert.strictEqual(kept, inside(a), `circle (${x}, ${y}) ρ ${rho}, ring ${r0}–${r1}, angle ${a}`);
		}
	}
});

test("a bow is a circular arc from A to B, bulging to the given side by the given amount", () => {
	const A = [0.1, 0.2], B = [0.5, 0.9], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
	for (const side of [1, -1]) {
		const s = SG.bow(A, B, 0.2, side);
		const [p0, p1, mid] = [SG.pointAt(s, 0), SG.pointAt(s, 1), SG.pointAt(s, 0.5)];
		assert.ok(Math.hypot(p0[0] - A[0], p0[1] - A[1]) < 1e-12 && Math.hypot(p1[0] - B[0], p1[1] - B[1]) < 1e-12);
		// the middle of the arc, measured off the chord: 0.2 × its length, to the left for side 1
		const cross = ((B[0] - A[0]) * (mid[1] - A[1]) - (B[1] - A[1]) * (mid[0] - A[0])) / L;
		assert.ok(Math.abs(cross - side * 0.2 * L) < 1e-12);
	}
});

test("a golden spiral grows by φ every quarter turn", () => {
	const pts = SG.spiral(0.05, 0.05 * PHI ** 4, 2 * Math.PI, 0); // a full turn: φ⁴
	for (let i = 0; i < pts.length; i += 2) {
		const r = Math.hypot(pts[i], pts[i + 1]);
		let a = Math.atan2(pts[i], pts[i + 1]);
		if (a < 0) a += 2 * Math.PI;
		if (i === pts.length - 2) a = 2 * Math.PI;
		if (i === 0) a = 0;
		assert.ok(Math.abs(r - 0.05 * PHI ** (a / (Math.PI / 2))) < 1e-9, `r = ${r} at ${a}`);
	}
});

test("the Flower of Life: 19 whole circles and a boundary, the rest cut off at it", () => {
	const f = find(/^the Flower of Life$/, { folds: [6] }), L = f.layers[0];
	assert.strictEqual(L.circles, 19 + 1);
	const boundary = Math.max(...L.steps.flatMap((S) => S.strokes).map(SG.reach));
	for (const s of L.steps.flatMap((S) => S.strokes)) assert.ok(SG.reach(s) <= boundary + 1e-9);
	assert.ok(L.arcs > 0);
});

test("Metatron's Cube: 13 circles and the 78 lines joining their centres", () => {
	const L = find(/^Metatron's Cube$/, { folds: [6] }).layers[0];
	assert.strictEqual(L.circles, 13);
	assert.strictEqual(L.lines, 78);
});

test("a mystic rose has every chord of its points", () => {
	const L = find(/^a mystic rose/).layers[0];
	const m = Number(/of (\d+) points/.exec(L.name)[1]);
	assert.strictEqual(L.lines, (m * (m - 1)) / 2);
});

test("pentagrams within pentagrams shrink by 1/φ² each time", () => {
	const L = find(/^pentagrams within pentagrams$/, { folds: [5] }).layers[0];
	const radii = L.steps.slice(1).map((S) => Math.max(...S.strokes.map(SG.reach)));
	assert.ok(radii.length >= 2);
	for (let i = 1; i < radii.length; i++) assert.ok(Math.abs(radii[i] / radii[i - 1] - 1 / PHI ** 2) < 1e-9);
});

test("pursuit polygons: each polygon's corners lie on the last one's sides", () => {
	const L = find(/^a whirl of/).layers[0];
	const levels = L.steps.slice(1).map((S) => S.strokes);
	for (let j = 1; j < levels.length; j++) {
		for (const s of levels[j]) {
			const onSide = levels[j - 1].some((e) => {
				const cross = (e.x1 - e.x0) * (s.y0 - e.y0) - (e.y1 - e.y0) * (s.x0 - e.x0);
				const along = ((s.x0 - e.x0) * (e.x1 - e.x0) + (s.y0 - e.y0) * (e.y1 - e.y0)) / ((e.x1 - e.x0) ** 2 + (e.y1 - e.y0) ** 2);
				return Math.abs(cross) < 1e-12 && along > 0 && along < 1;
			});
			assert.ok(onSide, `level ${j}`);
		}
	}
});

test("the same seed draws the same figure; different seeds, different figures", () => {
	const json = (f) => JSON.stringify(f.layers, (k, v) => (v instanceof Float64Array ? Array.from(v) : v));
	for (const seed of seeds(20)) assert.strictEqual(json(SG.generate(seed)), json(SG.generate(seed)));
	const recipes = new Set(seeds(500).map((seed) => { const f = SG.generate(seed); return `${f.n} ${f.palette.name} ${f.layers.map((L) => L.name).join("|")}`; }));
	assert.ok(recipes.size > 490, `${recipes.size} different recipes in 500`);
});

test("every figure fills the unit circle exactly, and has the symmetry it claims", () => {
	let mirrored = 0;
	for (const seed of seeds(120)) {
		const f = SG.generate(seed), all = strokes(f);
		const reach = Math.max(...all.map(SG.reach));
		assert.ok(Math.abs(reach - 1) < 1e-9, `figure ${SG.seedName(seed)} reaches ${reach}`);
		const { points, near } = sampler(f);
		const c = Math.cos((2 * Math.PI) / f.n), s = Math.sin((2 * Math.PI) / f.n);
		for (let i = 0; i < points.length; i += 7) {
			const [x, y] = points[i];
			assert.ok(near([c * x - s * y, s * x + c * y], 0.004), `figure ${SG.seedName(seed)} (${f.n}-fold): (${x}, ${y}) turned has no match`);
			if (!f.chiral) assert.ok(near([-x, y], 0.004), `figure ${SG.seedName(seed)}: (${x}, ${y}) mirrored has no match`);
		}
		if (!f.chiral && !f.mirror) mirrored++;
	}
	assert.ok(mirrored > 0, "some figures drawn turning still come out mirror-symmetric");
});

test("a figure without mirror symmetry says so", () => {
	// one with a whirl, turbine, pinwheel, leaning petals or one-way spirals: its mirror image differs
	for (const seed of seeds(60)) {
		const f = SG.generate(seed);
		if (!f.chiral) continue;
		const { points, near } = sampler(f);
		const misses = points.filter((p, i) => i % 5 === 0 && !near([-p[0], p[1]], 0.004)).length;
		assert.ok(misses > 0, `figure ${SG.seedName(seed)} is marked chiral but is its own mirror image`);
	}
});

test("drawing: each stroke is drawn once, end to end, in its time; then the sim rests", () => {
	for (const seed of seeds(15, 900)) {
		const sim = new Sacred({ sacredSeed: seed, sacredSeconds: 20 });
		const done = new Map();
		sim.piece = (ctx, s, p0, p1) => {
			assert.strictEqual(p0, done.get(s) || 0, "pieces follow on from each other");
			assert.ok(p1 > p0);
			done.set(s, p1);
		};
		const ctx = new Proxy({}, { get: (o, k) => (k === "createRadialGradient" ? () => ({ addColorStop () {} }) : () => {}) });
		let t = 0;
		while (!sim.resting && t < 60) {
			sim.step(1 / 12);
			t += 1 / 12;
			sim.draw(ctx, 700, 700);
		}
		assert.ok(sim.resting, "rests once drawn");
		assert.ok(t >= 20 && t <= 20 + 1.2 + 0.2, `drawn in ${t} s`);
		for (const s of strokes(sim.figure)) assert.strictEqual(done.get(s), 1, "every stroke drawn to its end");
	}
});

test("the steps of a figure are in time order and take the time asked for", () => {
	for (const seed of seeds(50)) {
		const steps = SG.schedule(SG.generate(seed), 22);
		for (let i = 1; i < steps.length; i++) assert.ok(steps[i].t0 >= steps[i - 1].t0);
		const end = Math.max(...steps.map((S) => S.t0 + S.dur));
		assert.ok(Math.abs(end - 22) < 1e-9, `ends at ${end}`);
	}
});

test("seeds read back as they are shown", () => {
	for (const seed of seeds(20)) assert.strictEqual(SG.parseSeed(SG.seedName(seed)), seed);
	assert.strictEqual(SG.parseSeed("#3a7f21c0"), 0x3a7f21c0);
	assert.strictEqual(SG.parseSeed("not a seed"), null);
});
