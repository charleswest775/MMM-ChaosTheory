#!/usr/bin/env node
/* Grows the sandpile ahead of time, exactly, with simulations/sandpile.js's Pile, and stores it
 * for the page to play back: assets/sandpile.bin, the pile four times a second for 42 s, an
 * eighth of each, two bits a cell, and assets/sandpile.json, where each pile is stored, how far
 * it reaches and its numbers.
 *
 * 1,250,000 grains, a cell a pixel, topple 27 billion times: under a minute on a Mac, a quarter of an
 * hour on a Pi 3, so it is done here:   node tools/render-sandpile.js
 */
const fs = require("node:fs");
const path = require("node:path");
const { Sandpile } = require("../simulations/sandpile.js");
const { Pile, GRAINS, SECONDS, UPDATES } = Sandpile;

const HALF = 460; // the grid's half-width: well beyond the pile, so no grain is lost over its edge
const steps = SECONDS * UPDATES, pile = new Pile(HALF), piles = [], chunks = [];
let offset = 0;
const t0 = Date.now();
for (let k = 1; k <= steps; k++) {
	pile.add(Math.round((GRAINS * k) / steps) - pile.added);
	// the eighth out to the pile's reach: cells (x, y), 0 ≤ y ≤ x ≤ r, four to a byte
	const r = pile.radius, n = Pile.index(r, r) + 1, packed = new Uint8Array(Math.ceil(n / 4));
	for (let i = 0; i < n; i++) packed[i >> 2] |= pile.h[i] << ((i & 3) << 1);
	const { grains, cells } = pile.census();
	piles.push({ offset, r, grains: pile.added, onPile: grains, topplings: pile.topplings, cells });
	chunks.push(packed);
	offset += packed.length;
	process.stdout.write(`\r${k}/${steps}: ${pile.added.toLocaleString("en")} grains, ${r} out, ${Math.round((Date.now() - t0) / 1000)} s`);
}
process.stdout.write("\n");
if (pile.radius > HALF - 3 || piles.at(-1).onPile !== GRAINS) throw new Error("grains were lost over the edge");

const dir = path.join(__dirname, "..", "assets");
fs.writeFileSync(path.join(dir, "sandpile.bin"), Buffer.concat(chunks));
fs.writeFileSync(path.join(dir, "sandpile.json"), `{"grains": ${GRAINS}, "seconds": ${SECONDS}, "updates": ${UPDATES}, "extent": ${pile.radius}, "piles": [\n` +
	piles.map((p) => JSON.stringify(p)).join(",\n") + "\n]}\n");
console.log(`assets/sandpile.bin: ${offset.toLocaleString("en")} bytes; ${pile.topplings.toLocaleString("en")} topplings`);
