// Checks for the sandpile: that the eighth computed is the whole grid's pile, cell for cell,
// that the order of toppling doesn't matter, that no grain is lost, that the stored growth the
// page plays is that pile, and that the page stays within its time.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
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

// the stored growth, as the page loads it
const dir = path.join(__dirname, "..", "assets");
const growth = { ...JSON.parse(fs.readFileSync(path.join(dir, "sandpile.json"))), cells: new Uint8Array(fs.readFileSync(path.join(dir, "sandpile.bin"))) };

test("the stored growth is the pile, cell for cell, as it grows", () => {
	const p = new Pile(200);
	for (const stored of growth.piles.filter((s) => s.grains < 150000)) {
		p.add(stored.grains - p.added);
		const { grains, cells } = p.census();
		assert.deepStrictEqual(stored, { offset: stored.offset, r: p.radius, grains: p.added, onPile: grains, topplings: p.topplings, cells });
		for (let y = -stored.r - 1; y <= stored.r + 1; y++) {
			for (let x = -stored.r - 1; x <= stored.r + 1; x++) assert.strictEqual(Sandpile.at(growth, stored, x, y), p.at(x, y), `${stored.grains} grains, (${x}, ${y})`);
		}
	}
});

test("every stored pile holds all its grains, dropped at a steady rate, and fits on the canvas", () => {
	const { piles } = growth, steps = Sandpile.SECONDS * Sandpile.UPDATES;
	assert.strictEqual(piles.length, steps);
	assert.strictEqual(piles.at(-1).grains, Sandpile.GRAINS);
	let end = 0, r = 0;
	piles.forEach((s, k) => {
		assert.strictEqual(s.grains, Math.round((Sandpile.GRAINS * (k + 1)) / steps));
		assert.strictEqual(s.offset, end);
		end += Math.ceil((Pile.index(s.r, s.r) + 1) / 4);
		assert.ok(s.r >= r); r = s.r; // a pile never shrinks
		let grains = 0;
		for (let x = 0; x <= s.r; x++) for (let y = 0; y <= x; y++) grains += Sandpile.at(growth, s, x, y) * Pile.copies(x, y);
		assert.strictEqual(grains, s.grains, `pile ${k + 1}`);
		assert.strictEqual(s.onPile, s.grains);
	});
	assert.strictEqual(end, growth.cells.length);
	assert.strictEqual(growth.extent, r);
	assert.ok(2 * r + 1 <= 900);
});

test("the page plays the growth in 42 s, four piles a second, then rests", () => {
	const s = new Sandpile({ growth });
	const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
	let frames = 0, updates = 0, last = 0;
	while (!s.resting && frames < 2000) {
		s.step(1 / 20); s.draw(ctx, 900, 900); frames++;
		if (s.shown !== last) { updates++; last = s.shown; }
	}
	assert.ok(Math.abs(frames / 20 - Sandpile.SECONDS) < 0.1, `${frames / 20} s`);
	assert.strictEqual(updates, Sandpile.SECONDS * Sandpile.UPDATES);
	assert.match(s.readout(), /grains dropped: 1,250,000 {4}on the pile: 1,250,000/);
	assert.ok(!/NaN|undefined/.test(s.readout()));
});
