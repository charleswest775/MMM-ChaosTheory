// Checks for the Chladni figures: the beam modes, the plate's frequencies against the published
// ones, the mode shapes, the data file, and the sand. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const Plate = require("../simulations/plate.js");
const MODES = require("../data/chladni-modes.js");
const { Chladni } = require("../simulations/chladni.js");

const close = (a, b, tol) => Math.abs(a - b) <= tol;

test("the free–free beam: its frequencies satisfy tan k ± tanh k = 0, and its modes are orthonormal", () => {
	for (const k of Plate.beamRoots(0, 6)) assert.ok(Math.abs(Math.tan(k) + Math.tanh(k)) < 1e-9, `even ${k}`);
	for (const k of Plate.beamRoots(1, 6)) assert.ok(Math.abs(Math.tan(k) - Math.tanh(k)) < 1e-9, `odd ${k}`);
	// the textbook values, for a beam of length 2: 2.365, 3.927, 5.498, 7.069
	assert.ok(close(Plate.beamRoots(0, 1)[0], 2.36502, 1e-5) && close(Plate.beamRoots(1, 1)[0], 3.92660, 1e-5));
	for (const parity of [0, 1]) {
		const modes = Plate.beamModes(parity, 8), { E00, E22 } = Plate.beamIntegrals(modes);
		for (let m = 0; m < 8; m++) {
			for (let p = 0; p < 8; p++) {
				assert.ok(close(E00[m][p], m === p ? 1 : 0, 1e-9), `∫X${m}X${p}`);
				// ∫X″X″ = k⁴ ∫XX, since X'''' = k⁴X and the ends are free
				assert.ok(close(E22[m][p], m === p ? modes[m].k ** 4 : 0, 1e-6 * (1 + modes[m].k ** 4)), `∫X${m}″X${p}″`);
			}
		}
	}
});

test("the square plate's frequencies match the published ones, from above as Ritz's method must", () => {
	// λ = ωa²√(ρh/D) for a square plate with free edges, ν = 0.3 (Leissa, Vibration of Plates, 1969)
	const published = [13.468, 19.596, 24.270, 34.801, 34.801, 61.093, 61.093, 63.686];
	const coarse = Plate.solve(8, 0.3), fine = Plate.solve(12, 0.3);
	published.forEach((ref, i) => {
		assert.ok(fine[i].lambda >= ref * 0.9999 && fine[i].lambda < ref * 1.004, `mode ${i + 1}: ${fine[i].lambda.toFixed(3)} vs ${ref}`);
		assert.ok(coarse[i].lambda >= fine[i].lambda - 1e-9, `mode ${i + 1} goes down as the basis grows`);
	});
});

test("the modes' shapes: the lowest twists, with nodal lines on the axes; the next two have the diagonals as lines of symmetry", () => {
	const modes = Plate.solve(12, 0.3), n = 41;
	const [twist, x, ring] = modes;
	assert.deepStrictEqual([twist.px, twist.py, x.px, x.py, ring.px, ring.py], [1, 1, 0, 0, 0, 0]);
	const at = (w, i, j) => w[j * n + i];
	const wt = Plate.grid(twist, n), wx = Plate.grid(x, n), wr = Plate.grid(ring, n);
	const max = (w) => Math.max(...w.map(Math.abs));
	for (let i = 0; i < n; i++) {
		// the middle row and column are the axes: the twisting mode is zero on them
		assert.ok(Math.abs(at(wt, i, 20)) < 1e-9 * max(wt) && Math.abs(at(wt, 20, i)) < 1e-9 * max(wt));
		for (let j = 0; j < n; j++) {
			// the X: w(y, x) = −w(x, y), so the diagonals are nodal lines; the ring: w(y, x) = w(x, y)
			assert.ok(Math.abs(at(wx, i, j) + at(wx, j, i)) < 1e-6 * max(wx), `X at ${i},${j}`);
			assert.ok(Math.abs(at(wr, i, j) - at(wr, j, i)) < 1e-6 * max(wr), `ring at ${i},${j}`);
		}
	}
	// and a pair of equal frequency is one mode and itself turned through 90°
	const pair = modes.filter((m) => m.px !== m.py && Math.abs(m.lambda - modes[3].lambda) < 1e-9);
	assert.strictEqual(pair.length, 2);
});

test("the data file is what the solver gives, and its figures are different modes", () => {
	const fresh = Plate.solve(12, 0.3);
	for (const m of MODES) {
		const match = fresh.find((f) => f.px === m.px && f.py === m.py && Math.abs(f.lambda - m.lambda) < 1e-3);
		assert.ok(match, `λ = ${m.lambda}`);
		const n = 24, a = Plate.grid(m, n), b = Plate.grid(match, n);
		const scale = Math.max(...b.map(Math.abs)), sign = Math.sign(a[5 * n + 7] * b[5 * n + 7]) || 1;
		a.forEach((v, i) => assert.ok(Math.abs(v - sign * b[i]) < 2e-4 * scale, `λ = ${m.lambda}: shape`));
	}
	// modes of different frequencies are orthogonal (the sum over the plate of their product)
	const n = 64, figures = Chladni.FIGURES.slice(0, 12).map((f) => Plate.grid(f.mode, n, f.swap));
	for (let i = 0; i < figures.length; i++) {
		for (let j = i + 1; j < figures.length; j++) {
			let dot = 0, ni = 0, nj = 0;
			for (let k = 0; k < n * n; k++) { dot += figures[i][k] * figures[j][k]; ni += figures[i][k] ** 2; nj += figures[j][k] ** 2; }
			assert.ok(Math.abs(dot) / Math.sqrt(ni * nj) < 0.01, `figures ${i + 1} and ${j + 1}`);
		}
	}
});

test("frequencies and notes: a 20 cm steel plate 1 mm thick twists at 82 Hz", () => {
	// D = Eh³/12(1 − ν²), f = λ √(D/ρh) / 2πa²
	const D = (200e9 * 1e-9) / (12 * 0.91), f = (13.468 * Math.sqrt(D / 7.85)) / (2 * Math.PI * 0.04);
	assert.ok(close(Chladni.hertz(13.468), f, 1e-9) && close(f, 81.86, 0.01));
	assert.strictEqual(Chladni.note(440), "A4");
	assert.strictEqual(Chladni.note(261.6256), "C4");
	assert.strictEqual(Chladni.note(452), "A4 +47 cents");
	assert.strictEqual(Chladni.note(415.3047), "G♯4");
});

test("the sand ends up on the nodal lines, and little of it falls off", () => {
	for (const figure of [1, 2, 3, 12, 25, 49]) {
		const c = new Chladni({ figure, seed: 11, chladniGrains: 6000 });
		let frames = 0;
		while (!c.silent && frames < 1000) { c.step(1 / 12); frames++; }
		assert.ok(frames / 12 < 0.8 + 14 + 0.1, `figure ${figure} falls silent in time`);
		let still = 0, left = 0;
		for (let i = 0; i < c.x.length; i++) {
			if (!c.alive[i]) continue;
			left++;
			if (c.amplitude(c.x[i], c.y[i]) <= Chladni.THRESHOLD) still++;
		}
		assert.ok(still / left > 0.95, `figure ${figure}: ${((100 * still) / left).toFixed(1)}% on the lines`);
		assert.ok(c.fallen / c.x.length < 0.06, `figure ${figure}: ${c.fallen} fell off`);
		assert.ok(!/NaN|undefined/.test(c.readout() + c.info.subtitle + c.info.equations.join("")));
	}
});

test("each showing brings the next figure of a shuffled deck, all 49 before any repeats", () => {
	const seen = new Set();
	for (let k = 0; k < Chladni.FIGURES.length; k++) seen.add(new Chladni({ chladniGrains: 10 }).figure.number);
	assert.strictEqual(seen.size, Chladni.FIGURES.length);
	assert.strictEqual(Chladni.FIGURES.length, 49);
});
