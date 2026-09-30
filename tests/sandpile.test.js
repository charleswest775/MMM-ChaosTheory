// Checks for the sandpile: that the eighth computed is the whole grid's pile, cell for cell,
// that the order of toppling doesn't matter, that no grain is lost, and that the page stays
// within its time.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Sandpile } = require("../simulations/sandpile.js");
const { Pile } = Sandpile;

// the plain way: the whole grid, one cell toppling once at a time
function full (grains, half) {
	const n = 2 * half + 1, h = new Uint32Array(n * n), c = half * n + half;
	let topplings = 0;
	h[c] = grains;
	const todo = [c];
	while (todo.length) {
		const i = todo.pop();
		while (h[i] >= 4) {
			h[i] -= 4; topplings++;
			for (const j of [i - 1, i + 1, i - n, i + n]) { h[j]++; if (h[j] === 4) todo.push(j); }
		}
	}
	return { at: (x, y) => h[(y + half) * n + (x + half)], topplings };
}

test("the eighth computed is the whole grid's pile, cell for cell, toppling for toppling", () => {
	for (const grains of [4, 16, 100, 3000]) {
		const half = 40, p = new Pile(half), f = full(grains, half);
		p.add(grains);
		for (let y = -half + 1; y < half; y++) for (let x = -half + 1; x < half; x++) assert.strictEqual(p.at(x, y), f.at(x, y), `${grains} grains, (${x}, ${y})`);
		assert.strictEqual(p.topplings, f.topplings, `${grains} grains`);
	}
});

test("four grains topple once into a cross; the order of toppling never matters", () => {
	const p = new Pile(10);
	p.add(4);
	assert.deepStrictEqual([p.at(0, 0), p.at(1, 0), p.at(0, -1), p.at(1, 1)], [0, 1, 1, 0]);
	const once = new Pile(60), bits = new Pile(60);
	once.add(10000);
	for (let k = 0; k < 10000;) { const d = Math.min(10000 - k, 1 + (k % 37)); bits.add(d); k += d; }
	assert.deepStrictEqual(Array.from(once.h), Array.from(bits.h));
	assert.strictEqual(once.topplings, bits.topplings);
});

test("every cell ends with fewer than four grains, and no grain is lost", () => {
	const p = new Pile(80);
	p.add(20000);
	assert.ok(p.h.every((g) => g < 4));
	assert.strictEqual(p.census().grains, 20000);
});

test("the page grows its pile in 42 s, never reaching the edge, then rests", () => {
	const s = new Sandpile();
	const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
	let frames = 0, updates = 0, last = 0;
	while (!s.resting && frames < 2000) {
		s.step(1 / 20); s.draw(ctx, 900, 900); frames++;
		if (s.pile.added !== last) { updates++; last = s.pile.added; }
	}
	assert.ok(frames / 20 <= Sandpile.SECONDS + 0.5, `${frames / 20} s`);
	assert.ok(updates <= 4 * Sandpile.SECONDS + 2);
	assert.strictEqual(s.pile.census().grains, s.pile.added); // none fell off
	assert.ok(s.pile.radius < s.pile.half - 2);
	assert.ok(!/NaN|undefined/.test(s.readout()));
});
