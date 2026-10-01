/* The abelian sandpile (Bak, Tang and Wiesenfeld 1987): a square grid of cells, grains dropped
 * on the middle one. A cell with four grains or more topples: it gives one to each of its four
 * neighbours, which may topple in turn. The avalanches come in all sizes, and what is left
 * behind is a fractal of cells holding 0, 1, 2 or 3 grains.
 *
 * Dhar (1990) showed that the order in which cells topple makes no difference: however it is
 * done, the pile ends the same, and so does how often each cell toppled. So grains can be added
 * a batch at a time and toppled together, and the pile after n grains is exactly the pile of n
 * grains dropped one by one. It follows too that the pile has the square's symmetry exactly
 * (turn it or reflect it and it's the same pile), so only an eighth of it is computed: the
 * cells x ≥ y ≥ 0 from the middle, each giving to its neighbours' mirror images as well.
 *
 * The pattern only shows at a cell a pixel, and that takes more toppling than a Pi 3 can do in
 * a page's time: the toppling grows as the square of the grains, and the 1,250,000 grains here
 * topple 27 billion times (under a minute on a Mac, a quarter of an hour on the Pi). So the
 * growth is computed ahead of time, exactly, with the Pile below (tools/render-sandpile.js) and
 * stored in assets/sandpile.bin: the pile four times a second for 42 s, grains dropped at a
 * steady rate, an eighth of each pile, two bits a cell. The page plays it back: four times a
 * second the next pile is unpacked into the canvas's pixels and put there in one go; then it rests.
 */
(function (root) {
	const GRAINS = 1250000;      // dropped in all
	const SECONDS = 42;          // to drop them, then rest (a 45 s page)
	const UPDATES = 4;           // piles a second
	const COLOURS = [[0, 0, 0], [255, 210, 120], [205, 62, 130], [46, 34, 120]]; // 0 to 3 grains

	// A pile on the eighth x ≥ y ≥ 0 of a square grid of half-width `half` cells, grains added at
	// (0, 0). Cells at x = half are the edge: grains that reach them are lost.
	class Pile {
		constructor (half) {
			this.half = half;
			const n = ((half + 1) * (half + 2)) / 2;
			this.h = new Uint32Array(n);        // grains on each cell
			this.stack = new Int32Array(n);
			this.onStack = new Uint8Array(n);
			this.reached = new Uint8Array(n);   // has ever held a grain
			this.reached[0] = 1;
			this.sp = 0;
			// to[4i+k], w[4i+k]: where cell i's topplings send grains, and how many a toppling
			// (the neighbours' canonical cells; a cell next to the mirror lines receives from its
			// neighbour's mirror image too)
			this.to = new Int32Array(4 * n).fill(-1);
			this.w = new Uint8Array(4 * n);
			const canon = (x, y) => { x = Math.abs(x); y = Math.abs(y); return x >= y ? [x, y] : [y, x]; };
			const nbrs = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
			for (let x = 0; x < half; x++) {
				for (let y = 0; y <= x; y++) {
					const i = Pile.index(x, y), targets = new Map();
					for (const [nx, ny] of nbrs(x, y)) {
						const [tx, ty] = canon(nx, ny), t = Pile.index(tx, ty);
						if (targets.has(t)) continue;
						// how many of the target's neighbours are images of this cell
						const count = nbrs(tx, ty).filter(([ux, uy]) => { const [cx, cy] = canon(ux, uy); return cx === x && cy === y; }).length;
						targets.set(t, tx >= half ? 0 : count); // the edge keeps nothing
					}
					let k = 0;
					for (const [t, c] of targets) { this.to[4 * i + k] = t; this.w[4 * i + k] = c; k++; }
				}
			}
			this.copies = new Uint8Array(n); // how many copies of each cell the whole grid has
			for (let x = 0; x <= half; x++) for (let y = 0; y <= x; y++) this.copies[Pile.index(x, y)] = Pile.copies(x, y);
			this.added = 0;
			this.topplings = 0; // over the whole grid, all eight parts
			this.radius = 0;    // how far from the middle, across or up, the pile reaches
		}

		static index (x, y) { return (x * (x + 1)) / 2 + y; }

		// how many copies of cell (x, y) there are in the whole grid
		static copies (x, y) { return x === 0 ? 1 : y === 0 || y === x ? 4 : 8; }

		add (k) {
			this.h[0] += k;
			this.added += k;
			this.push(0);
			this.settle();
		}

		push (i) {
			if (!this.onStack[i] && this.h[i] >= 4) { this.onStack[i] = 1; this.stack[this.sp++] = i; }
		}

		// topple until every cell has fewer than four grains; a cell topples as many times at once
		// as it can, which is the same as one at a time (Dhar)
		settle () {
			const { h, to, w, stack, onStack, reached, copies } = this;
			let sp = this.sp, topplings = 0;
			while (sp) {
				const i = stack[--sp];
				onStack[i] = 0;
				const q = h[i] >> 2;
				if (!q) continue;
				h[i] &= 3;
				topplings += q * copies[i];
				for (let k = 4 * i, end = k + 4; k < end; k++) {
					const t = to[k];
					if (t < 0) break;
					if (!w[k]) continue;
					h[t] += q * w[k];
					reached[t] = 1;
					if (!onStack[t] && h[t] >= 4) { onStack[t] = 1; stack[sp++] = t; }
				}
			}
			this.sp = sp;
			this.topplings += topplings;
			while (this.radius < this.half - 1 && this.reachedColumn(this.radius + 1)) this.radius++;
		}

		reachedColumn (x) {
			for (let y = 0; y <= x; y++) if (this.reached[Pile.index(x, y)]) return true;
			return false;
		}

		// grains on cell (x, y) anywhere on the grid
		at (x, y) {
			x = Math.abs(x); y = Math.abs(y);
			if (y > x) [x, y] = [y, x];
			return x > this.half ? 0 : this.h[Pile.index(x, y)];
		}

		// grains on the grid, all eight parts, and how many cells the pile covers (have ever held one)
		census () {
			let grains = 0, cells = 0;
			for (let x = 0; x < this.half; x++) for (let y = 0; y <= x; y++) {
				const g = this.h[Pile.index(x, y)], c = Pile.copies(x, y);
				grains += g * c; if (this.reached[Pile.index(x, y)]) cells += c;
			}
			return { grains, cells };
		}
	}

	// the stored growth, fetched once and kept: the module starts a new pile each time it's shown
	let stored = null;

	class Sandpile {
		constructor ({ file = (f) => f, growth = null } = {}) {
			this.t = 0;
			this.shown = 0; // piles shown so far
			this.growth = growth;
			if (!growth) Sandpile.load(file).then((g) => { this.growth = g; }, () => {});
		}

		// assets/sandpile.json (the piles: where each is stored, how far it reaches, its numbers)
		// and assets/sandpile.bin (their cells)
		static load (file) {
			if (!stored) {
				const get = (f) => fetch(file(f)).then((r) => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r; });
				stored = Promise.all([get("assets/sandpile.json").then((r) => r.json()), get("assets/sandpile.bin").then((r) => r.arrayBuffer())])
					.then(([meta, buf]) => ({ ...meta, cells: new Uint8Array(buf) }));
				stored.catch((e) => { console.error(`sandpile: ${e.message}`); stored = null; }); // try again next showing
			}
			return stored;
		}

		// grains on cell (x, y) of a stored pile, anywhere on the grid
		static at (growth, pile, x, y) {
			x = Math.abs(x); y = Math.abs(y);
			if (y > x) [x, y] = [y, x];
			if (x > pile.r) return 0;
			const i = Pile.index(x, y);
			return (growth.cells[pile.offset + (i >> 2)] >> ((i & 3) << 1)) & 3;
		}

		step (dt) {
			if (this.growth) this.t += dt; // the clock waits for the piles to arrive
		}

		draw (ctx, w, h) {
			const g = this.growth;
			if (!g) return;
			const k = Math.min(g.piles.length, Math.floor(this.t * g.updates + 1e-9));
			if (k === this.shown) return;
			this.shown = k;
			this.paint(ctx, w, h, g.piles[k - 1]);
			if (k === g.piles.length) this.resting = true;
		}

		// the pile a pixel a cell: its eighth unpacked into all eight parts, then put on the canvas
		paint (ctx, w, h, pile) {
			if (typeof document === "undefined") return; // tests: nothing to draw on
			const g = this.growth, o = g.extent, side = 2 * o + 1, r = pile.r, n = 2 * r + 1;
			if (!this.image) {
				this.image = new ImageData(side, side);
				this.px = new Uint32Array(this.image.data.buffer);
				this.colours = COLOURS.map(([R, G, B]) => ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0);
			}
			const { px, colours } = this, cells = g.cells, at = pile.offset;
			for (let x = 0, i = 0; x <= r; x++) {
				const left = o - x, right = o + x, up = (o - x) * side, down = (o + x) * side;
				for (let y = 0; y <= x; y++, i++) {
					const c = colours[(cells[at + (i >> 2)] >> ((i & 3) << 1)) & 3];
					const a = (o - y) * side, b = (o + y) * side;
					px[a + left] = px[a + right] = px[b + left] = px[b + right] = c;            // (±x, ±y)
					px[up + o - y] = px[up + o + y] = px[down + o - y] = px[down + o + y] = c; // (±y, ±x)
				}
			}
			// a pixel a cell where it fits; scaled down where the canvas is smaller
			const s = Math.min(1, Math.min(w, h) / side);
			const X = Math.floor(w / 2 - s * (o + 0.5)), Y = Math.floor(h / 2 - s * (o + 0.5));
			if (s === 1) return ctx.putImageData(this.image, X, Y, o - r, o - r, n, n);
			if (!this.canvas) { this.canvas = document.createElement("canvas"); this.canvas.width = this.canvas.height = side; }
			this.canvas.getContext("2d").putImageData(this.image, 0, 0, o - r, o - r, n, n);
			ctx.imageSmoothingEnabled = true;
			ctx.imageSmoothingQuality = "high";
			ctx.drawImage(this.canvas, o - r, o - r, n, n, X + s * (o - r), Y + s * (o - r), s * n, s * n);
		}

		readout () {
			const p = this.shown && this.growth.piles[this.shown - 1];
			if (!p) return "";
			const f = (v) => v.toLocaleString("en");
			return `grains dropped: ${f(p.grains)}    on the pile: ${f(p.onPile)}    topplings: ${f(p.topplings)}\n` +
				`cells reached: ${f(p.cells)}, ${p.r} from the middle    grains per cell: ${(p.onPile / p.cells).toFixed(3)}`;
		}
	}

	Sandpile.info = {
		title: "The sandpile",
		subtitle: "grains dropped on one cell; any cell with four topples, one to each neighbour",
		equations: [
			"<i>h</i>(<i>x</i>) ≥ 4 &nbsp;⟹&nbsp; <i>h</i>(<i>x</i>) −= 4, &nbsp; <i>h</i>(<i>y</i>) += 1 for each neighbour <i>y</i> &nbsp; <span class=\"chaos-note\">(black: no grains; gold 1, rose 2, indigo 3)</span>",
			"<span class=\"chaos-note\">Per Bak, Chao Tang and Kurt Wiesenfeld made this model in 1987 of how a system can organise itself to the brink of avalanches of every size. Deepak Dhar showed in 1990 that the order of toppling never matters, which is why the pile has the square's symmetry exactly. Nobody has a formula for the pattern: Wesley Pegden and Charles Smart proved in 2013 that it tends to a definite limit as the pile grows, and in 2016, with Lionel Levine, traced its patches to the circles of an Apollonian packing.</span>"
		]
	};
	Sandpile.Pile = Pile;
	Sandpile.COLOURS = COLOURS;
	Sandpile.GRAINS = GRAINS;
	Sandpile.SECONDS = SECONDS;
	Sandpile.UPDATES = UPDATES;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.sandpile = Sandpile;
	if (typeof module !== "undefined") module.exports = { Sandpile };
})(typeof window !== "undefined" ? window : globalThis);
