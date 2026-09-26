/* Rule 30: chaos from the simplest rule there is. A row of cells, each on or off; each new row,
 * a cell is on if its left neighbour, or else itself or its right neighbour, was on:
 *   new = left XOR (centre OR right)
 * (Wolfram's elementary cellular automaton number 30, 1983). From one cell it grows a pattern
 * regular on the left and random-looking on the right, whose centre column has passed every
 * test of randomness tried on it: Mathematica used it to make random numbers.
 *
 * Drawn a row at a time from the top, a strip at a time for the Pi; the rows are computed on a
 * line wide enough never to reach its ends, so what's shown is as on an endless line.
 */
(function (root) {
	const CELL = 3;          // px per cell
	const ROWS_PER_SECOND = 5; // 300 rows of a 900 px canvas in a minute

	// one generation: next[i] = cur[i−1] ^ (cur[i] | cur[i+1]); the ends stay off
	function generation (cur, next) {
		const n = cur.length;
		next[0] = 0; next[n - 1] = 0;
		for (let i = 1; i < n - 1; i++) next[i] = cur[i - 1] ^ (cur[i] | cur[i + 1]);
	}

	// the first `rows` rows from a single cell (kept only if `keep`), and the centre column
	function run (rows, keep = false) {
		const width = 2 * rows + 3, c = rows + 1;
		let cur = new Uint8Array(width), next = new Uint8Array(width);
		cur[c] = 1;
		const out = keep ? [cur.slice()] : null, centre = [1];
		for (let r = 1; r < rows; r++) {
			generation(cur, next);
			[cur, next] = [next, cur];
			if (keep) out.push(cur.slice());
			centre.push(cur[c]);
		}
		return { rows: out, centre, c };
	}

	class Rule30 {
		constructor () {
			this.t = 0;
			this.drawn = 0;
			this.ones = 0;
			this.bits = "";
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.cols = Math.floor(w / CELL);
			this.total = Math.floor(h / CELL);
			// wide enough that the pattern, growing a cell a row each way, never meets the ends
			this.width = this.cols + 2 * this.total + 4;
			this.c = Math.floor(this.width / 2);
			this.cur = new Uint8Array(this.width);
			this.next = new Uint8Array(this.width);
			this.cur[this.c] = 1;
			this.drawn = 0;
			this.ones = 0;
			this.bits = "";
			this.x0 = this.c - Math.floor(this.cols / 2); // the first cell shown
		}

		step (dt) {
			this.t += dt;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const due = Math.min(this.total, Math.floor(this.t * ROWS_PER_SECOND) + 1);
			while (this.drawn < due) {
				this.drawRow(ctx, this.drawn);
				this.bits += this.cur[this.c];
				this.ones += this.cur[this.c];
				generation(this.cur, this.next);
				[this.cur, this.next] = [this.next, this.cur];
				this.drawn++;
			}
			if (this.drawn >= this.total) this.resting = true;
		}

		// the row's runs of lit cells; the centre column in its own colour
		drawRow (ctx, r) {
			const { cur, x0, cols } = this, y = r * CELL;
			ctx.fillStyle = "#cdb996";
			let start = -1;
			for (let i = 0; i <= cols; i++) {
				const on = i < cols && cur[x0 + i] && x0 + i !== this.c;
				if (on && start < 0) start = i;
				if (!on && start >= 0) { ctx.fillRect(start * CELL, y, (i - start) * CELL, CELL); start = -1; }
			}
			if (cur[this.c]) {
				ctx.fillStyle = "#63d8ff";
				ctx.fillRect((this.c - x0) * CELL, y, CELL, CELL);
			}
		}

		readout () {
			const n = this.bits.length, tail = this.bits.slice(-48);
			return `row ${n}    the centre column (blue), latest bits: ${tail}\n` +
				`ones: ${n ? ((100 * this.ones) / n).toFixed(1) : "–"}% of ${n} (a fair coin: 50%, give or take ${n ? (50 / Math.sqrt(n)).toFixed(1) : "–"})`;
		}
	}

	Rule30.info = {
		title: "Rule 30",
		subtitle: "a row of cells, each new row made by one rule from the last, starting from a single cell",
		equations: [
			"next = left ⊕ (centre ∨ right) &nbsp; <span class=\"chaos-note\">(on if the left neighbour was on, or else if the cell or its right neighbour was, but not both kinds)</span>",
			"<span class=\"chaos-note\">Stephen Wolfram found in 1983 that this, rule 30 of the 256 such rules, makes randomness out of nothing: the centre column has passed every test for it, and Mathematica used it for random numbers. In 2019 he offered $30,000 for proofs about it, for instance that its 1s and 0s come equally often. The shell of the sea snail Conus textile grows a pattern much like it.</span>"
		]
	};
	Rule30.run = run;
	Rule30.generation = generation;

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.rule30 = Rule30;
	if (typeof module !== "undefined") module.exports = { Rule30 };
})(typeof window !== "undefined" ? window : globalThis);
