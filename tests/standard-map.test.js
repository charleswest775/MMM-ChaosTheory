// Checks for the standard map against what is known of it: it keeps area, its fixed point's
// stability, Chirikov's Lyapunov exponent for strong kicks, and Greene's critical K.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { StandardMap } = require("../simulations/standard-map.js");

const TAU = 2 * Math.PI;

// one kick, p kept unwrapped
const kick = (K, [th, p]) => { p += K * Math.sin(th); return [th + p, p]; };

// how far p wanders from where it started in n kicks, unwrapped
function spread (K, th, p, n) {
	let lo = p, hi = p;
	for (let i = 0; i < n; i++) {
		[th, p] = kick(K, [th, p]);
		if (p < lo) lo = p; if (p > hi) hi = p;
	}
	return hi - lo;
}

test("it keeps area: the Jacobian's determinant is 1", () => {
	const K = 1.7, h = 1e-6;
	for (const [th, p] of [[0.3, 1.1], [2.9, -0.4], [5.5, 3.0]]) {
		const a = kick(K, [th + h, p]), b = kick(K, [th - h, p]), c = kick(K, [th, p + h]), d = kick(K, [th, p - h]);
		const j11 = (a[0] - b[0]) / (2 * h), j21 = (a[1] - b[1]) / (2 * h);
		const j12 = (c[0] - d[0]) / (2 * h), j22 = (c[1] - d[1]) / (2 * h);
		assert.ok(Math.abs(j11 * j22 - j12 * j21 - 1) < 1e-8);
	}
});

test("the fixed point (π, 0) is stable below K = 4 and unstable above", () => {
	const near = (K) => {
		let s = [Math.PI + 1e-4, 0], far = 0;
		for (let i = 0; i < 10000; i++) { s = kick(K, s); far = Math.max(far, Math.hypot(s[0] - Math.PI, s[1])); }
		return far;
	};
	assert.ok(near(3.5) < 1e-3, `K 3.5: ${near(3.5)}`);
	assert.ok(near(4.5) > 0.1, `K 4.5: ${near(4.5)}`);
});

test("strong kicks: the Lyapunov exponent is Chirikov's ln(K/2)", () => {
	for (const K of [10, 20]) {
		const { lyapunov } = StandardMap.orbit(K, 1.1, 0.3, 200000);
		assert.ok(Math.abs(lyapunov / Math.log(K / 2) - 1) < 0.02, `K ${K}: ${lyapunov} vs ${Math.log(K / 2)}`);
	}
});

test("below Greene's K = 0.9716 no orbit gets across; above, one does", () => {
	// from the chaotic layer at the hyperbolic point (0, 0), kept in by the tori above and below
	assert.ok(spread(0.9, 1e-3, 0, 2e6) < TAU); // never a whole period
	assert.ok(spread(1.2, 1e-3, 0, 2e6) > 5 * TAU);
});

test("regular orbits stretch nothing and turn by their rotation number; chaotic ones stretch", () => {
	// a KAM curve at K = 0.5 turns at a steady rate
	const reg = StandardMap.orbit(0.5, 0, 2.0, 20000);
	assert.ok(reg.lyapunov < 0.002, `${reg.lyapunov}`);
	const again = StandardMap.orbit(0.5, 0, 2.0, 40000);
	assert.ok(Math.abs(again.rotation - reg.rotation) < 1e-3);
	// the island around (π, 0) turns not at all
	assert.ok(StandardMap.orbit(0.5, Math.PI + 0.3, 0, 20000).rotation < 1e-3 ||
		StandardMap.orbit(0.5, Math.PI + 0.3, 0, 20000).rotation > 1 - 1e-3);
	assert.ok(StandardMap.orbit(2.4, 0.01, 0.01).lyapunov > 0.1);
});

test("the page plots its orbits within a 45 s page, then rests; each scene in turn", () => {
	const seen = [];
	for (let s = 0; s < 4; s++) {
		const m = new StandardMap();
		seen.push(m.K);
		const ctx = { fillRect () {}, set fillStyle (v) {}, set globalAlpha (v) {} };
		let frames = 0;
		while (!m.resting && frames < 2000) { m.step(1 / 20); m.draw(ctx, 900, 1400); frames++; }
		assert.strictEqual(m.done, StandardMap.ORBITS);
		assert.ok(frames / 20 <= 43, `${frames / 20} s`); // done within a 45 s page
		assert.ok(!/NaN|undefined/.test(m.readout()));
	}
	assert.deepStrictEqual(seen, StandardMap.SCENES.map((s) => s.K));
	assert.strictEqual(new StandardMap({ standardMapK: 1.3 }).K, 1.3);
});
