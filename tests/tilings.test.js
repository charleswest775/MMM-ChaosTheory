// Checks for the tilings: that they are tilings (no gaps, no overlaps), with the right tiles in the
// right proportions, congruent in the hyperbolic plane, and the hat's known properties.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const Hat = require("../simulations/hat.js");
const { Tilings } = require("../simulations/tilings.js");

const PHI = (1 + Math.sqrt(5)) / 2;
const area = (p) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return a / 2; };
const inside = (p, x, y) => {
	let c = false;
	for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
		if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
	}
	return c;
};

// How many tiles cover each of a grid of sample points within radius r: [most, fewest]
function coverage (tiles, r, step = 0.23) {
	const cell = 2, grid = new Map();
	tiles.forEach((t, k) => {
		const key = `${Math.floor(t.cx / cell)},${Math.floor(t.cy / cell)}`;
		if (!grid.has(key)) grid.set(key, []);
		grid.get(key).push(k);
	});
	let most = 0, fewest = Infinity;
	for (let x = -r + 0.011; x < r; x += step) {
		for (let y = -r + 0.017; y < r; y += step) {
			if (Math.hypot(x, y) > r) continue;
			let n = 0;
			for (let i = -3; i <= 3; i++) {
				for (let j = -3; j <= 3; j++) {
					for (const k of grid.get(`${Math.floor(x / cell) + i},${Math.floor(y / cell) + j}`) || []) if (inside(tiles[k].pts, x, y)) n++;
				}
			}
			most = Math.max(most, n); fewest = Math.min(fewest, n);
		}
	}
	return [most, fewest];
}

test("de Bruijn's multigrid makes tilings: unit rhombs, no overlaps, no gaps", () => {
	for (const n of [4, 5, 6, 7]) {
		const gamma = Array.from({ length: n }, (_, i) => 0.1 + 0.137 * i + 0.01 * n);
		if (n === 5) gamma[4] = -(gamma[0] + gamma[1] + gamma[2] + gamma[3]);
		const tiles = Tilings.multigrid(n, gamma, 9);
		for (const t of tiles) {
			for (let k = 0; k < 8; k += 2) {
				const len = Math.hypot(t.pts[(k + 2) % 8] - t.pts[k], t.pts[(k + 3) % 8] - t.pts[k + 1]);
				assert.ok(Math.abs(len - 1) < 1e-9, "unit edges");
			}
			// the rhomb's area is the sine of the angle between its two families
			const angle = ((n % 2 ? 2 : 1) * Math.PI * t.type) / n;
			assert.ok(Math.abs(Math.abs(area(t.pts)) - Math.abs(Math.sin(angle))) < 1e-9, `type ${t.type} area`);
		}
		const [most, fewest] = coverage(tiles, 7);
		assert.strictEqual(most, 1, `${n} grids: overlapping tiles`);
		assert.strictEqual(fewest, 1, `${n} grids: a gap`);
	}
});

test("Penrose's thick and thin rhombs come in the golden ratio, Ammann–Beenker's in √2", () => {
	const penrose = Tilings.multigrid(5, [0.21, 0.43, 0.17, 0.62, -1.43], 40);
	const thick = penrose.filter((t) => t.type === 1).length, thin = penrose.filter((t) => t.type === 2).length;
	assert.ok(Math.abs(thick / thin / PHI - 1) < 0.01, `thick : thin = ${(thick / thin).toFixed(4)}`);
	const ab = Tilings.multigrid(4, [0.21, 0.43, 0.17, 0.62], 40);
	const rhombs = ab.filter((t) => t.type === 1).length, squares = ab.filter((t) => t.type === 2).length;
	assert.ok(Math.abs(rhombs / squares / Math.SQRT2 - 1) < 0.01, `rhombs : squares = ${(rhombs / squares).toFixed(4)}`);
	// and the caption's weights say the same
	const t = new Tilings({ kind: "penrose", seed: 1 });
	assert.ok(Math.abs(t.typeWeights()[0] - PHI) < 1e-12);
});

test("hyperbolic tiles are all congruent: equal sides and angles in the hyperbolic metric", () => {
	const d = (u, v) => Math.acosh(1 + (2 * ((u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2)) / ((1 - u[0] ** 2 - u[1] ** 2) * (1 - v[0] ** 2 - v[1] ** 2)));
	for (const [p, q] of [[7, 3], [5, 4], [4, 5], [3, 7]]) {
		const tiles = Tilings.hyperbolic(p, q, 0.02);
		assert.ok(tiles.length > 50, `{${p},${q}}: ${tiles.length} tiles`);
		// the side of a regular {p, q}: cosh s = (cos(π/q)... ) via the circumradius R: sinh(s/2) = sinh R sin(π/p)
		const R = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
		const side = 2 * Math.asinh(Math.sinh(R) * Math.sin(Math.PI / p));
		const centres = new Set();
		for (const t of tiles) {
			for (let k = 0; k < p; k++) {
				assert.ok(Math.abs(d(t.v[k], t.v[(k + 1) % p]) - side) < 1e-6, `{${p},${q}} side`);
				assert.ok(Math.abs(d(t.c, t.v[k]) - R) < 1e-6, `{${p},${q}} circumradius`);
			}
			centres.add(`${t.c[0].toFixed(9)},${t.c[1].toFixed(9)}`);
		}
		assert.strictEqual(centres.size, tiles.length, "no tile twice");
		// q tiles meet at each corner: the corners of the central tile are each shared by q tiles
		const corner = tiles[0].v[0];
		const sharing = tiles.filter((t) => t.v.some((v) => Math.hypot(v[0] - corner[0], v[1] - corner[1]) < 1e-9)).length;
		assert.strictEqual(sharing, q, `{${p},${q}}: ${sharing} tiles at a corner`);
	}
});

test("the hat: Fibonacci-square counts, all hats congruent, no overlaps, reflected ones φ⁴ times rarer", () => {
	const counts = [0, 1, 2, 3].map((level) => Hat.hats(Hat.metatiles(level)[0]).length);
	assert.deepStrictEqual(counts, [4, 25, 169, 1156]); // 2², 5², 13², 34²
	const hats = Hat.hats(Hat.metatiles(4)[0]);
	const sides = (p) => Array.from({ length: p.length / 2 }, (_, k) => Math.hypot(p[(2 * k + 2) % p.length] - p[2 * k], p[(2 * k + 3) % p.length] - p[2 * k + 1]).toFixed(6)).sort().join();
	const first = sides(hats[0].pts), a0 = Math.abs(area(hats[0].pts));
	for (const h of hats) {
		assert.strictEqual(sides(h.pts), first, "the same sides");
		assert.ok(Math.abs(Math.abs(area(h.pts)) - a0) < 1e-9, "the same area");
	}
	const reflected = hats.filter((h) => Hat.det(h.T) < 0).length;
	assert.ok(Math.abs((hats.length - reflected) / reflected / PHI ** 4 - 1) < 0.01, `${hats.length - reflected} : ${reflected}`);
	// the patch the page shows: a disc, covered once everywhere
	const shown = Tilings.hats(30, 4);
	const [most, fewest] = coverage(shown, 26, 0.37);
	assert.strictEqual(most, 1, "overlapping hats");
	assert.strictEqual(fewest, 1, "a gap between hats");
});

test("every kind builds, fits and is laid in its time, with a sensible caption", () => {
	for (const kind of Tilings.KINDS) {
		const t = new Tilings({ kind: kind.key, seed: 5, tilingsSeconds: 22 });
		assert.ok(t.tiles.length > 100, `${kind.key}: ${t.tiles.length} tiles`);
		for (const tile of t.tiles) assert.ok(Math.hypot(tile.cx, tile.cy) <= t.extent + 1e-9, `${kind.key}: fits`);
		const text = [t.info.title, t.info.subtitle, ...t.info.equations].join(" ");
		assert.ok(!/NaN|undefined|Infinity/.test(text), `${kind.key}: ${text}`);
		t.next = t.tiles.length;
		assert.ok(!/NaN|undefined|Infinity/.test(t.readout()), `${kind.key}: ${t.readout()}`);
	}
	const seen = new Set();
	for (let k = 0; k < Tilings.KINDS.length; k++) seen.add(new Tilings({}).kind.key);
	assert.strictEqual(seen.size, Tilings.KINDS.length, "all kinds before any repeats");
});
