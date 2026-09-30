/* The abelian sandpile (Bak, Tang and Wiesenfeld 1987): a square grid of cells, grains dropped
 * on the middle one. A cell with four grains or more topples: it gives one to each of its four
 * neighbours, which may topple in turn. The avalanches come in all sizes, and what is left
 * behind is a fractal of cells holding 0, 1, 2 or 3 grains.
 *
 * Dhar (1990) showed that the order in which cells topple makes no difference: however it is
 * done, the pile ends the same, and so does how often each cell toppled. So grains can be added
 * a frame's worth at a time and toppled together, and the picture after n grains is exactly the
 * pile of n grains dropped one by one. It follows too that the pile has the square's symmetry
 * exactly (turn it or reflect it and it's the same pile), so only an eighth of it is computed:
 * the cells x ≥ y ≥ 0 from the middle, each giving to its neighbours' mirror images as well.
 *
 * Grains are added at a steady rate for 42 s, until the pile is a little short of the canvas's
 * edge, so no grain is ever lost over it; then it rests.
 *
 * Drawn for the Pi: the pile is kept as an image a pixel a cell, scaled up onto the canvas four
 * times a second. The toppling grows as the square of the grains: on the Pi (node 22), a 900 px
 * pile of 4 px cells (78,000 grains) takes 4 s of toppling over its 42 s; of 3 px cells (138,000),
 * 12.6 s, most of a core by the end.
 */
(function (root) {
	const CELL = 4;              // px per cell (config sandpileCell)
	const SECONDS = 42;          // to grow to full size, then rest (a 45 s page)
	const UPDATES = 4;           // canvas changes a second
	const DENSITY = 2.125;       // grains per cell covered, near enough, to size the pile
	const COLOURS = [[0, 0, 0], [245, 190, 80], [40, 170, 185], [28, 44, 110]]; // 0 to 3 grains

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

	class Sandpile {
		constructor ({ sandpileCell = CELL } = {}) {
			this.cell = sandpileCell;
			this.t = 0;
			this.lastUpdate = -1;
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			const half = Math.floor(Math.min(w, h) / this.cell / 2);
			this.pile = new Pile(half + 2);
			this.full = Math.floor(0.92 * Math.PI * half * half * DENSITY); // grains when grown
			this.half = half;
			this.image = null;
		}

		step (dt) {
			this.t += dt;
		}

		// grains by time t, at a steady rate: the toppling a grain sets off grows with the pile, so
		// this keeps the work late in the growth within what the Pi can do in time
		due () {
			return Math.min(this.full, Math.round((this.full * this.t) / SECONDS));
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (this.t - this.lastUpdate < 1 / UPDATES - 1e-9) return;
			this.lastUpdate = this.t;
			const due = this.due();
			if (due > this.pile.added) this.pile.add(due - this.pile.added);
			this.paint(ctx, w, h);
			if (this.pile.added >= this.full) this.resting = true;
		}

		// the pile's square, a pixel a cell, into an image, then scaled up onto the canvas
		paint (ctx, w, h) {
			const r = Math.min(this.half, this.pile.radius + 2), side = 2 * r + 1;
			if (typeof document === "undefined") return this.painted = side; // tests: nothing to draw on
			if (!this.image || this.image.width < side) {
				const c = document.createElement("canvas");
				c.width = c.height = 2 * this.half + 1;
				this.image = c;
				this.pixels = c.getContext("2d").createImageData(c.width, c.height);
			}
			const px = this.pixels.data, stride = this.pixels.width, o = this.half;
			for (let y = -r; y <= r; y++) {
				for (let x = -r; x <= r; x++) {
					const col = COLOURS[this.pile.at(x, y)], k = 4 * ((y + o) * stride + (x + o));
					px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2]; px[k + 3] = 255;
				}
			}
			this.image.getContext("2d").putImageData(this.pixels, 0, 0, o - r, o - r, side, side);
			ctx.imageSmoothingEnabled = false;
			const c = this.cell, cx = Math.round(w / 2 - (c * (2 * o + 1)) / 2), cy = Math.round(h / 2 - (c * (2 * o + 1)) / 2);
			ctx.drawImage(this.image, o - r, o - r, side, side, cx + c * (o - r), cy + c * (o - r), c * side, c * side);
			this.painted = side;
		}

		readout () {
			const p = this.pile;
			if (!p) return "";
			const { grains, cells } = p.census();
			return `grains dropped: ${p.added.toLocaleString("en")}    on the pile: ${grains.toLocaleString("en")}    topplings: ${p.topplings.toLocaleString("en")}\n` +
				`cells reached: ${cells.toLocaleString("en")}, ${p.radius} from the middle    grains per cell: ${cells ? (grains / cells).toFixed(3) : "–"}`;
		}
	}

	Sandpile.info = {
		title: "The sandpile",
		subtitle: "grains dropped on one cell; any cell with four topples, one to each neighbour",
		equations: [
			"<i>h</i>(<i>x</i>) ≥ 4 &nbsp;⟹&nbsp; <i>h</i>(<i>x</i>) −= 4, &nbsp; <i>h</i>(<i>y</i>) += 1 for each neighbour <i>y</i> &nbsp; <span class=\"chaos-note\">(black: no grains; gold 1, teal 2, blue 3)</span>",
			"<span class=\"chaos-note\">Per Bak, Chao Tang and Kurt Wiesenfeld made this model in 1987 of how a system can organise itself to the brink of avalanches of every size. Deepak Dhar showed in 1990 that the order of toppling never matters, which is why the pile has the square's symmetry exactly. Nobody has a formula for the pattern: Wesley Pegden and Charles Smart proved in 2013 that it tends to a definite limit as the pile grows, and in 2016, with Lionel Levine, traced its patches to the circles of an Apollonian packing.</span>"
		]
	};
	Sandpile.Pile = Pile;
	Sandpile.COLOURS = COLOURS;
	Sandpile.SECONDS = SECONDS;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.sandpile = Sandpile;
	if (typeof module !== "undefined") module.exports = { Sandpile };
})(typeof window !== "undefined" ? window : globalThis);
