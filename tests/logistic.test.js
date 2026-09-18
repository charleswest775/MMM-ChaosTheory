// Checks for the logistic map against known results. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Logistic: { period, lyapunov } } = require("../simulations/logistic.js");

test("period doubling: 1, 2, 4, 8, then chaos", () => {
	assert.strictEqual(period(2.9), 1);
	assert.strictEqual(period(3.2), 2);
	assert.strictEqual(period(3.5), 4);
	assert.strictEqual(period(3.56), 8);
	assert.strictEqual(period(3.9), 0);
});

test("the period-3 window opens at r = 1 + √8", () => {
	assert.strictEqual(period(1 + Math.sqrt(8) + 1e-4), 3);
	assert.strictEqual(period(1 + Math.sqrt(8) - 1e-3), 0);
});

// first r where the period exceeds p, by bisection
const onset = (p, lo, hi) => {
	for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; const q = period(m, 256); (q > 0 && q <= p) ? (lo = m) : (hi = m); }
	return (lo + hi) / 2;
};

test("bifurcation points and Feigenbaum's ratio", () => {
	const r1 = onset(1, 2.9, 3.2), r2 = onset(2, 3.2, 3.5), r3 = onset(4, 3.5, 3.56);
	assert.ok(Math.abs(r1 - 3) < 2e-3, `r1 = ${r1}`);
	assert.ok(Math.abs(r2 - (1 + Math.sqrt(6))) < 2e-3, `r2 = ${r2}`);
	assert.ok(Math.abs(r3 - 3.54409) < 2e-3, `r3 = ${r3}`);
	const delta = (r2 - r1) / (r3 - r2);
	assert.ok(Math.abs(delta - 4.751) < 0.1, `first ratio ${delta} (→ 4.6692 in the limit)`);
});

test("Lyapunov exponent: negative when periodic, positive in chaos, ln 2 at r = 4", () => {
	assert.ok(lyapunov(3.2) < -0.1);
	assert.ok(lyapunov(3.9) > 0.3);
	assert.ok(Math.abs(lyapunov(4, 200000) - Math.LN2) < 0.02, `λ(4) = ${lyapunov(4, 200000)}`);
});
