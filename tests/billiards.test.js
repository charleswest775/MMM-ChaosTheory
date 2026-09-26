// Checks for the billiards: the law of reflection, the ellipse's conserved quantity, and the
// stadium's chaos. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Billiards } = require("../simulations/billiards.js");

const { A, B, L, R } = Billiards.SIZE;
const inEllipse = (b) => (b.x * b.x) / (A * A) + (b.y * b.y) / (B * B) <= 1 + 1e-9;
const inStadium = (b) => (Math.abs(b.x) <= L && Math.abs(b.y) <= R + 1e-9) || Math.hypot(Math.abs(b.x) - L, b.y) <= R + 1e-9;

test("balls stay on their tables at unit speed, reflecting with equal angles", () => {
	for (const [hit, inside] of [[Billiards.hitEllipse, inEllipse], [Billiards.hitStadium, inStadium]]) {
		const table = new Billiards.Table(hit, [-0.31, 0.12], 0.7);
		for (let k = 0; k < 2000; k++) {
			const b = table.balls[0], before = [b.dx, b.dy], h = hit(b.x, b.y, b.dx, b.dy);
			table.advance(h.t + 1e-9);
			// reflected: the normal component flips, the tangential one stays
			const n = [h.nx, h.ny], t = [-h.ny, h.nx], after = [b.dx, b.dy];
			const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
			assert.ok(Math.abs(dot(after, n) + dot(before, n)) < 1e-9 && Math.abs(dot(after, t) - dot(before, t)) < 1e-9);
			assert.ok(Math.abs(Math.hypot(b.dx, b.dy) - 1) < 1e-9 && table.balls.every(inside));
		}
	}
});

test("in the ellipse, the product of the angular momenta about the two foci never changes", () => {
	const c = Math.sqrt(A * A - B * B), table = new Billiards.Table(Billiards.hitEllipse, [-0.31, 0.12], 1.1), b = table.balls[0];
	const invariant = () => ((b.x - c) * b.dy - b.y * b.dx) * ((b.x + c) * b.dy - b.y * b.dx);
	const I0 = invariant();
	for (let k = 0; k < 3000; k++) {
		table.advance(0.37);
		assert.ok(Math.abs(invariant() - I0) < 1e-9, `after ${b.bounces} bounces`);
	}
});

test("the stadium's balls part exponentially, the ellipse's barely; and a stadium ball goes everywhere", () => {
	const sim = new Billiards();
	while (sim.stadium.balls[0].bounces < 40) sim.step(0.05);
	assert.ok(sim.stadium.spread() > 1e-2, `stadium: ${sim.stadium.spread()}`);
	assert.ok(sim.ellipse.spread() < 1e-3, `ellipse: ${sim.ellipse.spread()}`);
	// one stadium ball, over many bounces, through all four quarters and both round ends
	const seen = new Set(), ball = sim.stadium.balls[0];
	for (let k = 0; k < 20000; k++) {
		sim.stadium.advance(0.05);
		seen.add(`${ball.x > 0}${ball.y > 0}${Math.abs(ball.x) > L}`);
	}
	assert.strictEqual(seen.size, 8);
	assert.ok(!/NaN|undefined/.test(sim.readout()));
});
