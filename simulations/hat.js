/* The hat: the first "einstein", a single tile that covers the plane only in ways that never
 * repeat (D. Smith, J. S. Myers, C. S. Kaplan, C. Goodman-Strauss, "An aperiodic monotile",
 * 2023). Built by their substitution system of four metatiles, H, T, P and F, clusters of 4, 1,
 * 2 and 2 hats: each round of substitution puts together a patch of metatiles and cuts from it
 * four bigger metatiles of the same shapes, so the patch grows by about φ⁴ each round. After
 * Craig Kaplan's reference implementation (the rules below are the paper's).
 *
 * The hat is a polykite: eight kites of the hexagonal grid, its corners given here in the grid's
 * coordinates. Transforms are 2×3 affine matrices [a, b, c, d, e, f]: x' = ax + by + c,
 * y' = dx + ey + f. One hat in each H metatile (label "H1") is reflected. UMD-style.
 */
(function (root) {
	const hr3 = Math.sqrt(3) / 2;
	const pt = (x, y) => ({ x, y });
	const hexPt = (x, y) => pt(x + 0.5 * y, hr3 * y);
	const add = (p, q) => pt(p.x + q.x, p.y + q.y);
	const sub = (p, q) => pt(p.x - q.x, p.y - q.y);

	const IDENT = [1, 0, 0, 0, 1, 0];
	const inv = (T) => {
		const det = T[0] * T[4] - T[1] * T[3];
		return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det, -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
	};
	const mul = (A, B) => [
		A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
		A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]
	];
	const rot = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0];
	const trans = (x, y) => [1, 0, x, 0, 1, y];
	const rotAbout = (p, a) => mul(trans(p.x, p.y), mul(rot(a), trans(-p.x, -p.y)));
	const apply = (M, P) => pt(M[0] * P.x + M[1] * P.y + M[2], M[3] * P.x + M[4] * P.y + M[5]);
	// the similarity taking the unit segment (0,0)–(1,0) to p–q
	const matchSeg = (p, q) => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];
	// the similarity taking segment p1–q1 to p2–q2
	const matchTwo = (p1, q1, p2, q2) => mul(matchSeg(p2, q2), inv(matchSeg(p1, q1)));
	// where the lines p1–q1 and p2–q2 cross
	function intersect (p1, q1, p2, q2) {
		const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
		const u = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
		return pt(p1.x + u * (q1.x - p1.x), p1.y + u * (q1.y - p1.y));
	}

	const HAT = [
		hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2), hexPt(2, -1), hexPt(4, -2), hexPt(5, -1),
		hexPt(4, 0), hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2), hexPt(-1, 2)
	];

	class HatTile {
		constructor (label) { this.label = label; this.shape = HAT; }
	}

	class MetaTile {
		constructor (shape) { this.shape = shape; this.children = []; }
		add (T, geom) { this.children.push({ T, geom }); }
		// corner i of child n, in this tile's coordinates
		at (n, i) { return apply(this.children[n].T, this.children[n].geom.shape[i]); }
		// move the origin to the outline's centroid
		recentre () {
			const c = this.shape.reduce((s, p) => add(s, p), pt(0, 0));
			const cx = c.x / this.shape.length, cy = c.y / this.shape.length;
			this.shape = this.shape.map((p) => pt(p.x - cx, p.y - cy));
			const M = trans(-cx, -cy);
			for (const ch of this.children) ch.T = mul(M, ch.T);
		}
	}

	const H1 = new HatTile("H1"), Hh = new HatTile("H"), Th = new HatTile("T"), Ph = new HatTile("P"), Fh = new HatTile("F");

	// the first metatiles: outlines, and the hats in them
	function initH () {
		const outline = [pt(0, 0), pt(4, 0), pt(4.5, hr3), pt(2.5, 5 * hr3), pt(1.5, 5 * hr3), pt(-0.5, hr3)];
		const m = new MetaTile(outline);
		m.add(matchTwo(HAT[5], HAT[7], outline[5], outline[0]), Hh);
		m.add(matchTwo(HAT[9], HAT[11], outline[1], outline[2]), Hh);
		m.add(matchTwo(HAT[5], HAT[7], outline[3], outline[4]), Hh);
		m.add(mul(trans(2.5, hr3), mul([-0.5, -hr3, 0, hr3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), H1);
		return m;
	}
	function initT () {
		const m = new MetaTile([pt(0, 0), pt(3, 0), pt(1.5, 3 * hr3)]);
		m.add([0.5, 0, 0.5, 0, 0.5, hr3], Th);
		return m;
	}
	function initP () {
		const m = new MetaTile([pt(0, 0), pt(4, 0), pt(3, 2 * hr3), pt(-1, 2 * hr3)]);
		m.add([0.5, 0, 1.5, 0, 0.5, hr3], Ph);
		m.add(mul(trans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), Ph);
		return m;
	}
	function initF () {
		const m = new MetaTile([pt(0, 0), pt(3, 0), pt(3.5, hr3), pt(3, 2 * hr3), pt(-1, 2 * hr3)]);
		m.add([0.5, 0, 1.5, 0, 0.5, hr3], Fh);
		m.add(mul(trans(0, 2 * hr3), mul([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), Fh);
		return m;
	}

	// A patch of metatiles, each glued to one already placed: [child, its edge, new tile, the new
	// tile's edge], or [child, its corner, child, its corner, new tile, the new tile's edge] to
	// fit the new tile's edge between two corners
	const RULES = [
		["H"], [0, 0, "P", 2], [1, 0, "H", 2], [2, 0, "P", 2], [3, 0, "H", 2], [4, 4, "P", 2], [0, 4, "F", 3],
		[2, 4, "F", 3], [4, 1, 3, 2, "F", 0], [8, 3, "H", 0], [9, 2, "P", 0], [10, 2, "H", 0], [11, 4, "P", 2],
		[12, 0, "H", 2], [13, 0, "F", 3], [14, 2, "F", 1], [15, 3, "H", 4], [8, 2, "F", 1], [17, 3, "H", 0],
		[18, 2, "P", 0], [19, 2, "H", 2], [20, 4, "F", 3], [20, 0, "P", 2], [22, 0, "H", 2], [23, 4, "F", 3],
		[23, 0, "F", 3], [16, 0, "P", 2], [9, 4, 0, 2, "T", 2], [4, 0, "F", 3]
	];

	function constructPatch (H, T, P, F) {
		const shapes = { H, T, P, F }, patch = new MetaTile([]);
		for (const r of RULES) {
			if (r.length === 1) { patch.add(IDENT, shapes[r[0]]); continue; }
			let Pp, Qq, s, e;
			if (r.length === 4) {
				const { T: M, geom } = patch.children[r[0]], poly = geom.shape;
				Pp = apply(M, poly[(r[1] + 1) % poly.length]);
				Qq = apply(M, poly[r[1]]);
				[s, e] = [shapes[r[2]], r[3]];
			} else {
				const a = patch.children[r[0]], b = patch.children[r[2]];
				Pp = apply(b.T, b.geom.shape[r[3]]);
				Qq = apply(a.T, a.geom.shape[r[1]]);
				[s, e] = [shapes[r[4]], r[5]];
			}
			const poly = s.shape;
			patch.add(matchTwo(poly[e], poly[(e + 1) % poly.length], Pp, Qq), s);
		}
		return patch;
	}

	// the four bigger metatiles cut from a patch
	function constructMetatiles (patch) {
		const bps1 = patch.at(8, 2), bps2 = patch.at(21, 2);
		const rbps = apply(rotAbout(bps1, (-2 * Math.PI) / 3), bps2);
		const p72 = patch.at(7, 2), p252 = patch.at(25, 2);
		const llc = intersect(bps1, rbps, patch.at(6, 2), p72);
		let w = sub(patch.at(6, 2), llc);

		const hOut = [llc, bps1];
		w = apply(rot(-Math.PI / 3), w);
		hOut.push(add(hOut[1], w));
		hOut.push(patch.at(14, 2));
		w = apply(rot(-Math.PI / 3), w);
		hOut.push(sub(hOut[3], w));
		hOut.push(patch.at(6, 2));
		const H = new MetaTile(hOut);
		for (const k of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) H.add(patch.children[k].T, patch.children[k].geom);

		const P = new MetaTile([p72, add(p72, sub(bps1, llc)), bps1, llc]);
		for (const k of [7, 2, 3, 4, 28]) P.add(patch.children[k].T, patch.children[k].geom);

		const F = new MetaTile([bps2, patch.at(24, 2), patch.at(25, 0), p252, add(p252, sub(llc, bps1))]);
		for (const k of [21, 20, 22, 23, 24, 25]) F.add(patch.children[k].T, patch.children[k].geom);

		const A = hOut[2], B = add(hOut[1], sub(hOut[4], hOut[5])), C = apply(rotAbout(B, -Math.PI / 3), A);
		const T = new MetaTile([B, C, A]);
		T.add(patch.children[11].T, patch.children[11].geom);

		for (const m of [H, P, F, T]) m.recentre();
		return [H, T, P, F];
	}

	// The metatiles after `levels` rounds of substitution: [H, T, P, F]
	function metatiles (levels) {
		let tiles = [initH(), initT(), initP(), initF()];
		for (let i = 0; i < levels; i++) tiles = constructMetatiles(constructPatch(...tiles));
		return tiles;
	}

	// Every hat in a metatile: [{ label, T, pts: [x0, y0, x1, y1, …] }], in the metatile's coordinates;
	// `parent` is the label of the level-1 metatile each came from (H, T, P or F)
	function hats (tile, T = IDENT, out = [], parent = null) {
		for (const ch of tile.children) {
			const M = mul(T, ch.T);
			if (ch.geom instanceof HatTile) {
				out.push({ label: ch.geom.label, T: M, pts: HAT.flatMap((p) => { const q = apply(M, p); return [q.x, q.y]; }) });
			} else {
				hats(ch.geom, M, out, ch.geom.children.some((c) => c.geom instanceof HatTile) ? ch.geom.children[0].geom.label.replace("1", "") : parent);
			}
		}
		return out;
	}

	// a transform's determinant: negative for the reflected hats
	const det = (T) => T[0] * T[4] - T[1] * T[3];

	const Hat = { HAT, metatiles, hats, det, apply, mul, hexPt };
	root.ChaosHat = Hat;
	if (typeof module !== "undefined") module.exports = Hat;
})(typeof window !== "undefined" ? window : globalThis);
