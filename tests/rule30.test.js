// Checks for rule 30: its first rows, its centre column, and how evenly that comes out.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const { Rule30 } = require("../simulations/rule30.js");

test("the first rows are rule 30's", () => {
	const { rows, c } = Rule30.run(5, true);
	const text = rows.map((row, r) => Array.from(row.slice(c - r, c + r + 1)).join(""));
	assert.deepStrictEqual(text, ["1", "111", "11001", "1101111", "110010001"]);
});

test("the centre column is OEIS A051023, and comes out evenly", () => {
	assert.strictEqual(Rule30.run(32).centre.join(""), "11011100110001011001001110101110");
	const { centre } = Rule30.run(20000);
	const ones = centre.reduce((a, b) => a + b, 0) / centre.length;
	assert.ok(Math.abs(ones - 0.5) < 0.01, `ones: ${ones}`);
});

test("the page draws its rows, one centre bit each, and rests", () => {
	const r = new Rule30();
	const ctx = { fillRect () {}, set fillStyle (v) {} };
	let frames = 0;
	while (!r.resting && frames < 2000) { r.step(1 / 20); r.draw(ctx, 900, 900); frames++; }
	assert.strictEqual(r.drawn, 300);
	assert.strictEqual(r.bits, Rule30.run(300).centre.join(""));
	assert.ok(frames / 20 <= 61, `${frames / 20} s`);
	assert.ok(!/NaN|undefined/.test(r.readout()));
});
