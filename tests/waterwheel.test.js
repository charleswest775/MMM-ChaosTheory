// Checks for the waterwheel: that its spin and water follow Lorenz's equations exactly, that the
// water is conserved, that it is chaotic, and that the cups never overflow.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Waterwheel } = require("../simulations/waterwheel.js");
const { Wheel } = Waterwheel;

// Lorenz's equations with b = 1, RK4
function lorenz ([x, y, z], sigma, rho, h, n) {
	const f = (x, y, z) => [sigma * (y - x), rho * x - y - x * z, x * y - z];
	for (let i = 0; i < n; i++) {
		const k1 = f(x, y, z);
		const k2 = f(x + (h / 2) * k1[0], y + (h / 2) * k1[1], z + (h / 2) * k1[2]);
		const k3 = f(x + (h / 2) * k2[0], y + (h / 2) * k2[1], z + (h / 2) * k2[2]);
		const k4 = f(x + h * k3[0], y + h * k3[1], z + h * k3[2]);
		x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
		y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
		z += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
	}
	return [x, y, z];
}

test("the wheel's spin and water are Lorenz's x, y, z", () => {
	const w = new Wheel({ omega: 0.02 });
	let l = w.lorenz();
	assert.deepStrictEqual(l, [-0.02, 0, 28]); // an empty wheel: no weight anywhere
	let worst = 0;
	for (let i = 0; i < 40; i++) { // to t = 8, by which time it has reversed several times
		for (let k = 0; k < 100; k++) w.step(0.002);
		l = lorenz(l, 10, 28, 0.002, 100);
		const got = w.lorenz();
		worst = Math.max(worst, ...got.map((v, j) => Math.abs(v - l[j])));
	}
	assert.ok(worst < 1e-6, `${worst}`);
});

test("the water is conserved: what's on the wheel settles to what pours in over what leaks", () => {
	const w = new Wheel({ omega: 0.5 });
	for (let i = 0; i < 10000; i++) w.step(0.002); // 20 leak times
	const total = w.cups().reduce((a, b) => a + b, 0);
	const poured = 2 * Math.PI * (35 / 8) * w.c; // ∫ C (1 − cos θ)⁴ dθ = 2π · 35/8 · C
	assert.ok(Math.abs(total / poured - 1) < 1e-6, `${total} vs ${poured}`);
});

test("too little water (ρ < 1) and the wheel comes to rest; enough and it never does", () => {
	const slow = new Wheel({ rho: 0.5, omega: 1 });
	for (let i = 0; i < 10000; i++) slow.step(0.002);
	assert.ok(Math.abs(slow.omega) < 1e-3, `${slow.omega}`);
	const fast = new Wheel({ omega: 1 });
	let least = Infinity;
	for (let i = 0; i < 50000; i++) { fast.step(0.002); if (i > 10000) least = Math.min(least, Math.abs(fast.omega) + Math.abs(fast.lorenz()[1])); }
	assert.ok(least > 1e-3); // never at rest (only its x can pass through 0, at a reversal)
});

test("it is chaotic: wheels started 10⁻⁸ apart part company, at Lorenz's rate", () => {
	const a = new Wheel({ omega: 0.02 }), b = new Wheel({ omega: 0.02 + 1e-8 });
	let apart = 0, t = 0;
	while (apart < 1 && t < 100) {
		for (let k = 0; k < 50; k++) { a.step(0.002); b.step(0.002); }
		t += 0.1;
		apart = Math.abs(a.omega - b.omega);
	}
	assert.ok(t < 60, `still together at t = ${t}`);
	assert.ok(t > 15, `parted too soon: t = ${t}`); // ln(10⁸)/0.5 ≈ 37 leak times
});

test("the cups never overflow, and the water level fills its share of a cup", () => {
	const w = new Wheel({ omega: -0.03 });
	let most = 0;
	for (let i = 0; i < 50000; i++) { w.step(0.002); if (i % 10 === 0) most = Math.max(most, ...w.cups()); }
	assert.ok(most / Waterwheel.capacity < 1, `${most / Waterwheel.capacity}`);
	assert.ok(Math.abs(Waterwheel.level(0.5) - 1) < 1e-6);
	assert.ok(Waterwheel.level(0) < 1e-6 && Math.abs(Waterwheel.level(1) - 2) < 1e-6);
});

test("the page draws in turns, wheel then butterfly, and its readout is whole", () => {
	const sim = new Waterwheel();
	const calls = { fillRect: 0, stroke: 0 };
	const ctx = new Proxy({}, { get: (_, k) => (k in calls ? () => calls[k]++ : () => {}), set: () => true });
	for (let f = 0; f < 1200; f++) { sim.step(1 / 20); sim.draw(ctx, 900, 900); }
	assert.ok(sim.wheel.t > 60 * Waterwheel.SPEED - 0.01);
	assert.ok(sim.reversals >= 1);
	assert.ok(calls.fillRect > 600 && calls.stroke > 600);
	assert.ok(!/NaN|undefined/.test(sim.readout()));
});
