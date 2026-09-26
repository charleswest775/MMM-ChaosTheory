/* Not chaos: sacred geometry. A figure no one has seen before (sacred-geometry.js makes one from a
 * random seed) draws itself from the centre out, circle by circle and line by line, every
 * symmetric copy at once, in light lines on black around a glow; then it holds, finished.
 *
 * Drawn incrementally for the Pi: each frame adds only what the pens drew since the last one,
 * and once the figure is complete the sim rests and the canvas is left alone. Lines are added
 * with "lighter" compositing, so where they cross they brighten, as light does.
 */
(function (root) {
	const SG = root.ChaosSacredGeometry || require("./sacred-geometry.js");

	const GLOW_SECONDS = 1.2;  // the glow fades in first, then the pens start
	const MARGIN = 0.95;       // the figure's radius, as a fraction of half the canvas
	const HALO = 4.5;          // each line also gets a faint halo this many times its width…
	const HALO_ALPHA = 0.07;   // …this bright
	const TONE_ALPHA = [0.8, 0.95];

	const ease = (x) => x * x * (3 - 2 * x);
	const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);

	// the side s of each symmetry order's regular polygon in a circle of radius r, exactly where
	// that is neat, and what is special about it
	const SIDES = {
		3: ["s = 2r sin 60° = r√3"],
		4: ["s = 2r sin 45° = r√2"],
		5: ["s = 2r sin 36°", "Its diagonal : side = φ = (1 + √5)/2, the golden ratio."],
		6: ["s = 2r sin 30° = r", "The compass, still set to the radius, steps exactly six times round the circle."],
		8: ["s = 2r sin 22.5° = r√(2 − √2)"],
		10: ["s = 2r sin 18° = r/φ", "Its side is the radius cut in the golden ratio."],
		12: ["s = 2r sin 15° = r√(2 − √3)"],
		16: ["s = 2r sin 11.25° = r√(2 − √(2 + √2))"],
		20: ["s = 2r sin 9° = r√(2 − √((5 + √5)/2))"],
		24: ["s = 2r sin 7.5° = r√(2 − √(2 + √3))"]
	};
	const NAMES = { 3: "equilateral triangle", 4: "square", 5: "regular pentagon", 6: "regular hexagon", 7: "regular heptagon", 8: "regular octagon", 9: "regular nonagon", 10: "regular decagon", 12: "regular dodecagon" };
	const SUP = { 2: "²", 3: "³", 4: "⁴", 5: "⁵" };

	// 12 → "2² · 3"
	function factor (n) {
		const parts = [];
		for (let p = 2, m = n; m > 1; p++) {
			let e = 0;
			while (m % p === 0) { m /= p; e++; }
			if (e) parts.push(p + (e > 1 ? SUP[e] || `^${e}` : ""));
		}
		return parts.join(" · ");
	}

	class Sacred {
		// sacredSeconds: time to draw a figure; sacredSeed: draw this one (its number, as shown);
		// sacredFolds / sacredPalettes: choose only among these symmetries / palette names
		constructor ({ sacredSeconds = 22, sacredSeed = null, sacredFolds = [], sacredPalettes = [] } = {}) {
			this.figure = Sacred.next(SG.parseSeed(sacredSeed), { folds: list(sacredFolds).map(Number), palettes: list(sacredPalettes) });
			this.steps = SG.schedule(this.figure, sacredSeconds);
			this.seconds = sacredSeconds;
			this.t = 0;
			this.glow = 0;       // how far the glow has faded in
			this.first = 0;      // steps before this one are finished
			this.resting = false;
			this.info = this.buildInfo();
		}

		step (dt) {
			this.t += dt;
		}

		// Size and colours for this canvas. Colours depend on the palette, the stroke's tone and its
		// distance from the centre; alphas on the layer, dense layers being fainter.
		layout (w, h) {
			if (this.w === w && this.h === h) return;
			const redraw = this.w !== undefined;
			this.w = w; this.h = h;
			this.cx = w / 2; this.cy = h / 2;
			this.S = (Math.min(w, h) / 2) * MARGIN;
			const px = Math.max(1, this.S / 300);
			const { palette } = this.figure;
			for (const st of this.steps) {
				for (const s of st.strokes) {
					const [r, g, b] = SG.colour(palette, st.tone, Math.hypot(...SG.pointAt(s, 0.5)));
					s.css = `rgb(${r},${g},${b})`;
					s.alpha = TONE_ALPHA[st.tone] * st.layer.intensity;
					s.width = px * st.layer.width * (st.tone === 1 ? 0.9 : 1.2);
					s.cursor = 0;
				}
				if (redraw) st.p = 0; // resized mid-figure: draw it all again
			}
			if (redraw) { this.first = 0; this.glow = 0; }
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (this.glow < 1) {
				this.glow = Math.min(1, this.t / GLOW_SECONDS);
				this.drawGlow(ctx, ease(this.glow));
			}
			const t = this.t - GLOW_SECONDS;
			if (t < 0) return;
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			ctx.lineCap = "butt";   // consecutive pieces of a stroke meet end to end, without overlapping
			ctx.lineJoin = "round";
			const steps = this.steps;
			for (let i = this.first; i < steps.length && steps[i].t0 <= t; i++) {
				const st = steps[i];
				const p = ease(Math.min(1, (t - st.t0) / st.dur));
				if (p > st.p) {
					for (const s of st.strokes) this.piece(ctx, s, st.p, p);
					st.p = p;
				}
			}
			while (this.first < steps.length && steps[this.first].p >= 1) this.first++;
			ctx.restore();
			if (this.first >= steps.length) this.resting = true;
		}

		// the glow behind the centre, in the palette's light: a gradient, redrawn only while fading in
		drawGlow (ctx, alpha) {
			const { cx, cy } = this, R = this.S * 0.62, [r, g, b] = SG.glowColour(this.figure.palette);
			const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
			[[0, 0.42], [0.15, 0.22], [0.45, 0.07], [1, 0]].forEach(([at, a]) => grad.addColorStop(at, `rgba(${r},${g},${b},${a * alpha})`));
			ctx.save();
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;
			ctx.fillStyle = "#000";
			ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
			ctx.fillStyle = grad;
			ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
			ctx.restore();
		}

		// the part of stroke s from fraction p0 to p1: a line and a faint wider halo round it
		piece (ctx, s, p0, p1) {
			const { cx, cy, S } = this;
			if (s.kind === "dot") {
				if (p1 < 1) return;
				ctx.globalAlpha = s.alpha;
				ctx.fillStyle = s.css;
				ctx.beginPath();
				ctx.arc(cx + S * s.x, cy - S * s.y, Math.max(1.5, S * s.r), 0, 2 * Math.PI);
				ctx.fill();
				return;
			}
			ctx.beginPath();
			if (s.kind === "arc") {
				// angles clockwise from north → canvas angles, clockwise from east
				const a0 = s.a + s.da * p0 - Math.PI / 2, a1 = s.a + s.da * p1 - Math.PI / 2;
				ctx.arc(cx + S * s.x, cy - S * s.y, S * s.r, a0, a1, s.da < 0);
			} else if (s.kind === "line") {
				ctx.moveTo(cx + S * (s.x0 + (s.x1 - s.x0) * p0), cy - S * (s.y0 + (s.y1 - s.y0) * p0));
				ctx.lineTo(cx + S * (s.x0 + (s.x1 - s.x0) * p1), cy - S * (s.y0 + (s.y1 - s.y0) * p1));
			} else {
				this.tracePath(ctx, s, p0, p1);
			}
			ctx.strokeStyle = s.css;
			ctx.globalAlpha = s.alpha * HALO_ALPHA;
			ctx.lineWidth = s.width * HALO;
			ctx.stroke();
			ctx.globalAlpha = s.alpha;
			ctx.lineWidth = s.width;
			ctx.stroke();
		}

		// a polyline from p0 to p1 of its length; s.cursor remembers the segment reached, as
		// successive pieces only move forward
		tracePath (ctx, s, p0, p1) {
			const { cx, cy, S } = this, { pts, cum } = s, last = cum.length - 1;
			const d0 = p0 * cum[last], d1 = p1 * cum[last];
			const at = (i, d) => {
				const seg = cum[i + 1] - cum[i], f = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i]) / seg)) : 0;
				return [cx + S * (pts[2 * i] + (pts[2 * i + 2] - pts[2 * i]) * f), cy - S * (pts[2 * i + 1] + (pts[2 * i + 3] - pts[2 * i + 1]) * f)];
			};
			let i = s.cursor;
			while (i < last - 1 && cum[i + 1] <= d0) i++;
			s.cursor = i;
			ctx.moveTo(...at(i, d0));
			while (i < last - 1 && cum[i + 1] < d1) {
				i++;
				ctx.lineTo(cx + S * pts[2 * i], cy - S * pts[2 * i + 1]);
			}
			ctx.lineTo(...at(i, d1));
		}

		buildInfo () {
			const { n, mirror, layers, seed } = this.figure;
			const deg = 180 / n, angle = Number.isInteger(deg * 4) ? ` ${deg}°` : `(180°/${n})`;
			const [side, note] = SIDES[n] || [`s = 2r sin${angle}`];
			const value = side.endsWith("= r") ? "" : ` = ${(2 * Math.sin(Math.PI / n)).toFixed(4)} r`;
			return {
				title: "Sacred geometry",
				subtitle: `${n}-fold ${mirror ? "symmetry" : "rotation"} · drawn from the centre out · figure ${SG.seedName(seed)}`,
				equations: [
					`the ${NAMES[n] || `regular ${n}-gon`}: &nbsp;${side}${value}`,
					`<span class="chaos-note">${note ? `${note} ` : ""}${Sacred.constructibility(n)}</span>`,
					`<span class="chaos-note">${layers.filter((L) => !L.plain).map((L) => L.name).join(" &nbsp;·&nbsp; ")}</span>`
				]
			};
		}

		// what the pens are doing: the tool, the layer, and at the end what it took
		readout () {
			const { layers, counts, seed } = this.figure;
			const shown = layers.filter((L) => !L.plain);
			if (this.resting) {
				const made = [["circles", counts.circles], ["arcs", counts.arcs], ["lines", counts.lines], ["curves", counts.curves]]
					.filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(", ");
				return `${shown.length} layers: ${made}, drawn in ${this.seconds} s\nfigure ${SG.seedName(seed)}`;
			}
			const st = this.steps[Math.max(0, Math.min(this.first, this.steps.length - 1))];
			if (this.t < GLOW_SECONDS || !st) return "\n";
			const kinds = new Set(st.strokes.map((s) => s.kind));
			const tool = kinds.has("path") ? "by hand" : kinds.has("line") ? "straightedge" : "compass";
			const L = st.layer, which = shown.indexOf(L);
			return `${tool.padEnd(12)} ${L.plain ? "a circle" : L.name}${which >= 0 ? `  (${which + 1} of ${shown.length})` : ""}\n` +
				`${Math.round((100 * (this.t - GLOW_SECONDS)) / this.seconds)}%`;
		}
	}

	// Whether a regular n-gon can be drawn with compass and straightedge, and why (Gauss–Wantzel)
	Sacred.constructibility = (n) => {
		const f = factor(n), odd = [];
		for (let p = 3, m = n; m > 1; p += 2) {
			while (m % 2 === 0) m /= 2;
			let e = 0;
			while (m % p === 0) { m /= p; e++; }
			if (e) odd.push([p, e]);
		}
		const fermat = (p) => [3, 5, 17, 257, 65537].includes(p);
		const bad = odd.find(([p]) => !fermat(p)), twice = odd.find(([, e]) => e > 1);
		const is = f === String(n) ? `${n} is` : `${n} = ${f}:`;
		if (bad) return `It cannot be drawn with compass and straightedge (${f === String(n) ? `${n} is not a Fermat prime` : `${n} = ${f}, and ${bad[0]} is not a Fermat prime`}; Wantzel 1837), so its corners here are computed.`;
		if (twice) return `It cannot be drawn with compass and straightedge (${n} = ${f}, the Fermat prime ${twice[0]} more than once; Wantzel 1837), so its corners here are computed.`;
		const why = !odd.length ? "a power of 2" : n === odd[0][0] ? "a Fermat prime" : `a power of 2 times ${odd.length > 1 ? "distinct Fermat primes" : "a Fermat prime"}`;
		return `It can be drawn with compass and straightedge alone: ${is} ${why} (Gauss 1801, Wantzel 1837).`;
	};

	// A figure from a random seed (or the one given), unlike the last: not the same core, palette
	// or symmetry twice in a row, unless the options leave no other choice.
	Sacred.next = (seed, options) => {
		const kind = (f) => [f.layers[0].name.replace(/[\d/{}]+/g, "#"), f.palette.name, f.n];
		const last = Sacred.last;
		let figure;
		for (let tries = 0; tries < 30; tries++) {
			figure = SG.generate(seed ?? Math.floor(Math.random() * 2 ** 32), options);
			const [core, palette, n] = kind(figure);
			if (seed !== null || !last) break;
			if (core !== last[0] && (palette !== last[1] || options.palettes.length === 1) && (n !== last[2] || options.folds.length === 1)) break;
		}
		Sacred.last = kind(figure);
		return figure;
	};

	Sacred.info = { title: "Sacred geometry", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.sacred = Sacred;
	if (typeof module !== "undefined") module.exports = { Sacred };
})(typeof window !== "undefined" ? window : globalThis);
