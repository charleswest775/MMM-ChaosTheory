// Checks for the symmetric icons. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Icons: { ICONS, hop } } = require("../simulations/icons.js");

const orbit = (p, n, fn) => {
	let x = 0.01, y = 0.003;
	for (let i = 0; i < 1000; i++) [x, y] = hop(x, y, p);
	for (let i = 0; i < n; i++) { [x, y] = hop(x, y, p); fn(x, y); }
};

test("the map commutes with rotation by 2π/n (equivariance)", () => {
	for (const { name, p } of ICONS) {
		const n = p[5], c = Math.cos(2 * Math.PI / n), s = Math.sin(2 * Math.PI / n);
		const rot = (x, y) => [c * x - s * y, s * x + c * y];
		for (const [x, y] of [[0.3, -0.2], [0.7, 0.1], [-0.4, 0.5]]) {
			const [a, b] = rot(...hop(x, y, p)), [a2, b2] = hop(...rot(x, y), p);
			assert.ok(Math.hypot(a - a2, b - b2) < 1e-9, `${name}: F(Rz) ≠ R F(z)`);
		}
	}
});

test("every icon is a bounded, chaotic attractor (not a fixed point or cycle)", () => {
	for (const { name, p } of ICONS) {
		const cells = new Set();
		let r = 0;
		orbit(p, 200000, (x, y) => { r = Math.max(r, Math.hypot(x, y)); cells.add(Math.round(x * 200) * 10007 + Math.round(y * 200)); });
		assert.ok(isFinite(r) && r < 10, `${name}: orbit escaped (r = ${r})`);
		assert.ok(cells.size > 5000, `${name}: visits only ${cells.size} cells — periodic, not chaotic`);
	}
});

test("the long-run picture has the n-fold symmetry", () => {
	for (const { name, p } of ICONS) {
		// visits per angular sector, folded onto one sector: each of the n copies gets ~1/n
		const n = p[5], sectors = new Float64Array(n);
		orbit(p, 1000000, (x, y) => { sectors[Math.floor(((Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI / n))]++; });
		const mean = 1000000 / n;
		for (const v of sectors) assert.ok(Math.abs(v - mean) / mean < 0.03, `${name}: sector counts ${[...sectors]}`);
	}
});

test("the renderer's inlined hop matches hop()", () => {
	const { Icons } = require("../simulations/icons.js");
	globalThis.performance ??= require("node:perf_hooks").performance;
	for (let icon = 0; icon < ICONS.length; icon++) {
		const sim = new Icons({ icon, budgetMs: 0 });
		sim.layout(200, 200);
		let { x, y } = sim;
		sim.develop(); // at least one batch of 2000
		for (let i = 0; i < sim.iterations; i++) [x, y] = hop(x, y, ICONS[icon].p);
		assert.ok(Math.hypot(sim.x - x, sim.y - y) < 1e-9 || !isFinite(x), `${ICONS[icon].name} diverged from reference`);
	}
});
