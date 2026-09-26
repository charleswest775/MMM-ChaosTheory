// Checks for the three-body problem: conservation laws, Burrau's outcome, and the periodic orbits.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { ThreeBody } = require("../simulations/three-body.js");

const { System, SCENES } = ThreeBody;
const dist = (s, i, j) => Math.hypot(s[2 * j] - s[2 * i], s[2 * j + 1] - s[2 * i + 1]);

test("energy, momentum and angular momentum are kept", () => {
	for (const key of Object.keys(SCENES)) {
		const sc = SCENES[key], sys = new System(sc.m, sc.state);
		const E0 = sys.energy(), p0 = sys.momentum();
		sys.advance(sc.duration);
		const p = sys.momentum();
		assert.ok(Math.abs((sys.energy() - E0) / E0) < 1e-7, `${key}: energy`);
		assert.ok(Math.abs(p.px - p0.px) < 1e-9 && Math.abs(p.py - p0.py) < 1e-9, `${key}: momentum`);
		assert.ok(Math.abs(p.L - p0.L) < 1e-7 * (1 + Math.abs(p0.L)), `${key}: angular momentum`);
	}
});

test("Burrau's problem ends as Szebehely and Peters found: masses 4 and 5 pair off and 3 is thrown out", () => {
	const sc = SCENES.pythagorean, sys = new System(sc.m, sc.state);
	// the triangle's sides are 3, 4, 5, each mass opposite the side of its own length
	assert.deepStrictEqual([dist(sys.s, 1, 2), dist(sys.s, 0, 2), dist(sys.s, 0, 1)].map((d) => Number(d.toFixed(9))), [3, 4, 5]);
	sys.advance(75);
	const s = sys.s;
	assert.ok(dist(s, 1, 2) < 2, "4 and 5 together");
	assert.ok(dist(s, 0, 1) > 25 && dist(s, 0, 2) > 25, "3 far away");
	// the pair is bound: its own energy is negative; and 3 is leaving faster than it could fall back
	const m = sc.m, v = (i) => [s[6 + 2 * i], s[7 + 2 * i]];
	const M = m[1] + m[2], vc = [(m[1] * v(1)[0] + m[2] * v(2)[0]) / M, (m[1] * v(1)[1] + m[2] * v(2)[1]) / M];
	const kinetic = [1, 2].reduce((k, i) => k + 0.5 * m[i] * ((v(i)[0] - vc[0]) ** 2 + (v(i)[1] - vc[1]) ** 2), 0);
	assert.ok(kinetic - (m[1] * m[2]) / dist(s, 1, 2) < 0, "the pair is bound");
	const r3 = Math.hypot(s[0], s[1]), v3 = Math.hypot(...v(0));
	assert.ok(0.5 * v3 * v3 > (m[1] + m[2]) / r3, "3 escapes");
	assert.ok(sys.closest < 1e-3, `close encounters: ${sys.closest}`);
});

test("the figure-eight is periodic and stable; Lagrange's triangle is periodic and unstable", () => {
	const eight = SCENES["figure-eight"], a = new System(eight.m, eight.state);
	a.advance(eight.period);
	eight.state.forEach((v, i) => assert.ok(Math.abs(a.s[i] - v) < 1e-6, "figure-eight returns"));
	const fig = new ThreeBody({ threeBodyScene: "figure-eight" });
	fig.step(eight.duration / eight.rate + 1);
	let apart = 0;
	for (let i = 0; i < 6; i++) apart = Math.max(apart, Math.abs(fig.sys.s[i] - fig.ghost.s[i]));
	assert.ok(apart < 1e-3, `its ghost stays: ${apart}`);

	const tri = SCENES.lagrange, b = new System(tri.m, tri.state);
	b.advance(tri.period);
	tri.state.forEach((v, i) => assert.ok(Math.abs(b.s[i] - v) < 1e-9, "the triangle returns after one turn"));
	const shape = (s) => { const d = [dist(s, 0, 1), dist(s, 1, 2), dist(s, 0, 2)]; return Math.max(...d) / Math.min(...d) - 1; };
	const lag = new ThreeBody({ threeBodyScene: "lagrange" });
	lag.step(40 / tri.rate);
	assert.ok(shape(lag.ghost.s) > 0.5, `the ghost's triangle has broken: ${shape(lag.ghost.s)}`);
	assert.ok(shape(lag.sys.s) < 1e-4, `the real one still holds: ${shape(lag.sys.s)}`);
	lag.step(32 / tri.rate);
	assert.ok(shape(lag.sys.s) > 0.1, "…and then breaks too");
});

test("each showing takes the next scene in turn, with a sensible caption", () => {
	const seen = new Set();
	for (let k = 0; k < 3; k++) {
		const t = new ThreeBody({});
		seen.add(t.key);
		assert.ok(!/NaN|undefined/.test(t.info.subtitle + t.info.equations.join("") + t.readout()));
	}
	assert.strictEqual(seen.size, 3);
});
