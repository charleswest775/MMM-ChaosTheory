// Checks for the snow crystal: the twelfth of the grid against the whole grid, the symmetry
// bookkeeping, and the shapes. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const Snow = require("../simulations/snow-model.js");
const { SnowCrystal } = require("../simulations/snow.js");

test("the wedge stands for the whole grid: 1 + 3N(N − 1) cells, each once", () => {
	for (const N of [5, 12, 40]) {
		const m = new Snow({ N });
		let total = 0;
		for (const k of m.mult) total += k;
		assert.strictEqual(total, 1 + 3 * N * (N - 1), `N = ${N}`);
		assert.strictEqual(m.mult[0], 1, "the centre is its own image");
		// every cell of the grid maps to a wedge cell, and back out again
		for (let q = -N; q <= N; q++) {
			for (let r = -N; r <= N; r++) {
				const i = m.at(q, r), inside = Snow.hexDistance([q, r]) < N;
				assert.strictEqual(i >= 0, inside, `(${q}, ${r})`);
				if (inside) assert.ok(Snow.images(m.cells[i]).some(([a, b]) => a === q && b === r));
			}
		}
	}
});

// Reiter's model on the whole grid, cell by cell, with no symmetry: what the wedge must match
function fullGrid (N, beta, gamma, steps, alpha = 1) {
	const key = (q, r) => `${q},${r}`, cells = [];
	for (let q = -N; q <= N; q++) for (let r = -N; r <= N; r++) if (Snow.hexDistance([q, r]) < N) cells.push([q, r]);
	const s = new Map(cells.map(([q, r]) => [key(q, r), q === 0 && r === 0 ? 1 : beta]));
	const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
	const get = (q, r) => (s.has(key(q, r)) ? s.get(key(q, r)) : beta);
	for (let t = 0; t < steps; t++) {
		const frozen = (q, r) => s.has(key(q, r)) && s.get(key(q, r)) >= 1;
		const receptive = new Map(cells.map(([q, r]) => [key(q, r), frozen(q, r) || nb.some(([a, b]) => frozen(q + a, r + b))]));
		const u = (q, r) => (!s.has(key(q, r)) ? beta : receptive.get(key(q, r)) ? 0 : get(q, r));
		const next = new Map();
		for (const [q, r] of cells) {
			const mean = nb.reduce((sum, [a, b]) => sum + u(q + a, r + b), 0) / 6;
			const k = key(q, r), rec = receptive.get(k);
			next.set(k, (rec ? get(q, r) + gamma : 0) + u(q, r) + (alpha / 2) * (mean - u(q, r)));
		}
		for (const [k, v] of next) s.set(k, v);
	}
	return s;
}

test("computing a twelfth of the crystal gives exactly what computing all of it does", () => {
	for (const [beta, gamma] of [[0.4, 0.001], [0.25, 0.04], [0.6, 0.0005]]) {
		const N = 16, steps = 120, m = new Snow({ N, beta, gamma });
		for (let t = 0; t < steps; t++) m.step();
		const full = fullGrid(N, beta, gamma, steps);
		for (const [k, v] of full) {
			const [q, r] = k.split(",").map(Number);
			assert.ok(Math.abs(m.s[m.at(q, r)] - v) < 1e-12, `β ${beta}, γ ${gamma} at (${q}, ${r}): ${m.s[m.at(q, r)]} vs ${v}`);
		}
	}
});

test("plates fill their hexagon, dendrites don't", () => {
	const fill = (beta, gamma) => {
		const m = new Snow({ N: 60, beta, gamma });
		while (m.radius < 50 && m.steps < 20000) m.step();
		// ice cells over the cells of the hexagon out to the crystal's radius
		let ice = 0;
		for (let i = 0; i < m.cells.length; i++) if (m.frozen[i]) ice += m.mult[i];
		return ice / (1 + 3 * m.radius * (m.radius + 1));
	};
	const plate = fill(0.25, 0.04), dendrite = fill(0.4, 0.001);
	assert.ok(plate > 0.6, `a plate fills ${plate.toFixed(2)}`);
	assert.ok(dendrite < 0.35, `a dendrite fills ${dendrite.toFixed(2)}`);
});

test("every habit grows to size in its time, with a sensible caption", () => {
	for (const h of SnowCrystal.HABITS) {
		const c = new SnowCrystal({ habit: h.name, n: 80 });
		assert.ok(c.beta >= h.beta[0] && c.beta <= h.beta[1] && c.gamma >= h.gamma[0] * 0.99 && c.gamma <= h.gamma[1] * 1.01);
		let frames = 0;
		while (!c.grown && frames < 1000) { c.step(1 / 12); frames++; }
		assert.ok(c.model.radius >= c.target, `${h.name}: radius ${c.model.radius}`);
		assert.ok(frames / 12 <= c.seconds + 0.5, `${h.name}: ${(frames / 12).toFixed(1)} s`);
		const text = [c.info.subtitle, ...c.info.equations, c.readout()].join(" ");
		assert.ok(!/NaN|undefined/.test(text), text);
	}
});
