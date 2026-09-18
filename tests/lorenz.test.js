// Physics checks for the Lorenz system. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Lorenz } = require("../simulations/lorenz.js");
const { derivs, rk4, params: { RHO, BETA } } = Lorenz;

const H = 0.004;
const run = (s, t) => { for (let k = 0; k < Math.round(t / H); k++) rk4(s, H); };

test("the fixed points C± = (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1) are equilibria", () => {
	const q = Math.sqrt(BETA * (RHO - 1));
	for (const sign of [1, -1]) {
		const out = new Float64Array(3);
		derivs(sign * q, sign * q, RHO - 1, out);
		for (const v of out) assert.ok(Math.abs(v) < 1e-12, `derivative ${v} at C${sign > 0 ? "+" : "−"}`);
	}
});

test("trajectories stay on the bounded attractor", () => {
	const s = new Float64Array([1, 1, 1]);
	run(s, 20);
	for (let k = 0; k < 50000; k++) {
		rk4(s, H);
		assert.ok(Math.abs(s[0]) < 25 && Math.abs(s[1]) < 30 && s[2] > 0 && s[2] < 55, `left the attractor at ${[...s]}`);
	}
});

test("largest Lyapunov exponent is ≈ 0.906 (Benettin renormalisation)", () => {
	const a = new Float64Array([1, 1, 20]);
	run(a, 50);
	const d0 = 1e-8;
	const b = new Float64Array([a[0] + d0, a[1], a[2]]);
	let sum = 0, T = 0;
	for (let n = 0; n < 2000; n++) { // 2000 intervals of 0.5 time units
		run(a, 0.5); run(b, 0.5); T += 0.5;
		const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		sum += Math.log(d / d0);
		for (let i = 0; i < 3; i++) b[i] = a[i] + (b[i] - a[i]) * (d0 / d);
	}
	const lambda = sum / T;
	assert.ok(Math.abs(lambda - 0.906) < 0.05, `λ = ${lambda}`);
});

test("sensitive dependence: 1e-9 apart becomes attractor-sized", () => {
	const a = new Float64Array([1, 1, 20]);
	run(a, 20);
	const b = new Float64Array([a[0] + 1e-9, a[1], a[2]]);
	run(a, 40); run(b, 40);
	assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 5);
});

test("simulation's trajectories start together and separate within a showing", () => {
	const sim = new Lorenz();
	const early = (() => { sim.step(5); return sim.spread(); })();
	for (let t = 0; t < 55; t += 0.05) sim.step(0.05);
	assert.ok(early < 1e-2, `already ${early} apart after 5 s`);
	assert.ok(sim.spread() > 1, `only ${sim.spread()} apart after 60 s`);
});
