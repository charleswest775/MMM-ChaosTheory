/* Infinite zoom: a dive into the Mandelbrot set or a Julia set, towards a point on its
 * boundary, with new detail at every scale until the computer's arithmetic runs out
 * (about 10¹⁰×, a few minutes in; see maxDepth).
 *
 * Each view is drawn from keyframes, rendered ahead by workers on the Pi's other cores: one
 * for every doubling of the magnification, each at the canvas's resolution. Between two
 * keyframes the outer one is stretched up to 2× and the inner one drawn over the middle, at
 * half size and sharp, so the centre, where the eye is, never looks enlarged. The zoom goes
 * as fast as `zoomSeconds` per doubling, and slows down when the keyframes can't keep up.
 *
 * Costly on the Pi either way: the whole canvas changes every frame, and the workers compute
 * while the page is shown. They stop when it is hidden (nothing is asked of them) and are
 * shut down when the dive is over.
 */
(function (root) {
	const ZM = root.ChaosZoomMath || require("./zoom-math.js");
	const sci = (root.ChaosCommon || require("./common.js")).sci;

	const LOOKAHEAD = 2;      // keyframes rendered beyond the two on screen
	const FADE_IN = 1.5;      // seconds
	const MIN_ITER = 500;
	const PIXEL_PITCH = 0.2715e-3; // m: the mirror's Dell U2413, for "how big the whole set would be"

	// the next target, taking turns through the list (shared by successive instances)
	let turn = 0;

	// Keyframes shared out over web workers by interleaved rows.
	class WorkerPool {
		constructor (url, n) {
			this.workers = Array.from({ length: n }, () => new Worker(url));
			this.jobs = new Map();
			this.nextId = 1;
			for (const w of this.workers) w.onmessage = ({ data }) => this.receive(data);
		}

		// job: the parameters of ZoomMath.render; calls done({ rgba, stats }) with the whole keyframe
		render (job, done) {
			const id = this.nextId++, n = this.workers.length;
			this.jobs.set(id, { job, done, rgba: new Uint8ClampedArray(job.w * job.h * 4), left: n, stats: [] });
			this.workers.forEach((w, i) => w.postMessage({ ...job, id, firstRow: i, rowStep: n }));
		}

		receive ({ id, firstRow, rgba, stats }) {
			const entry = this.jobs.get(id);
			if (!entry) return;
			const { w, h } = entry.job, n = this.workers.length, row = w * 4;
			for (let j = firstRow, k = 0; j < h; j += n, k++) entry.rgba.set(rgba.subarray(k * row, (k + 1) * row), j * row);
			entry.stats.push(stats);
			if (--entry.left) return;
			this.jobs.delete(id);
			entry.done({ rgba: entry.rgba, stats: Zoom.mergeStats(entry.stats) });
		}

		close () {
			for (const w of this.workers) w.terminate();
			this.jobs.clear();
		}
	}

	class Zoom {
		// zoomTargets: keys of ZoomMath.TARGETS to take turns through (default all); zoomSeconds:
		// seconds per doubling at full speed; zoomWorkers: how many cores render keyframes;
		// pool: something with render(job, done) and close(), for tests
		constructor ({ width = 700, height = 700, zoomTargets = [], zoomSeconds = 2, zoomWorkers = 2, target, file, pool } = {}) {
			this.target = ZM.resolve(Zoom.pick(target, zoomTargets));
			this.w = width; this.h = height;
			this.zoomSeconds = zoomSeconds;
			this.limit = ZM.maxDepth(this.target.center, this.target.start, Math.min(width, height));
			this.z = 0;             // depth: log₂ of the magnification
			this.t = 0;
			this.shownAt = null;    // this.t when the first view was ready
			this.frames = new Map(); // depth → { image, maxIter, stats, ms }
			this.pending = null;    // depth being rendered
			this.maxIter = MIN_ITER;
			this.pool = pool || new WorkerPool(file("simulations/zoom-worker.js"), Math.max(1, zoomWorkers));
			this.info = this.buildInfo();
			this.request();
		}

		static pick (key, keys) {
			const all = ZM.TARGETS;
			if (key) return all.find((t) => t.key === key) || all[0];
			const list = all.filter((t) => keys.includes(t.key));
			const from = list.length ? list : all;
			return from[turn++ % from.length];
		}

		// start the next keyframe needed, if the workers are free
		request () {
			if (this.pending !== null || this.done) return;
			const base = Math.floor(this.z);
			for (let k = base; k <= Math.min(base + 1 + LOOKAHEAD, this.limit); k++) {
				if (this.frames.has(k)) continue;
				const t = this.target, maxIter = this.iterationsFor(k), started = Zoom.now();
				this.pending = k;
				this.pool.render({
					family: t.family, cx: t.center[0], cy: t.center[1], jx: t.c ? t.c[0] : 0, jy: t.c ? t.c[1] : 0,
					size: t.start * 2 ** -k, w: this.w, h: this.h, maxIter
				}, ({ rgba, stats }) => {
					if (this.closed) return;
					this.frames.set(k, { image: Zoom.toImage(rgba, this.w, this.h), maxIter, stats, ms: Zoom.now() - started });
					this.pending = null;
					this.request();
				});
				return;
			}
		}

		// Escape times grow as the view closes in on the boundary. Allow twice the escape time
		// that all but one pixel in 1000 of the deepest keyframe so far beat. Too few iterations
		// paint the slowest escapers black, as if inside; but near the big bulbs of the first
		// views a few pixels take tens of thousands, and aren't worth waiting for.
		iterationsFor (k) {
			let deepest = null;
			for (const [d, f] of this.frames) if (d < k && (!deepest || d > deepest.d)) deepest = { d, f };
			if (deepest) this.maxIter = Math.max(MIN_ITER, Math.ceil(ZM.percentile(deepest.f.stats, 0.001) * 2 + 100));
			return this.maxIter;
		}

		// the statistics of a keyframe's shares, added up
		static mergeStats (parts) {
			const sum = (key) => parts.reduce((a, s) => a + s[key], 0);
			const hist = parts[0].hist.slice();
			for (const p of parts.slice(1)) p.hist.forEach((v, i) => { hist[i] += v; });
			return { escaped: sum("escaped"), inside: sum("inside"), sum: sum("sum"), maxSeen: Math.max(...parts.map((s) => s.maxSeen)), hist, maxIter: parts[0].maxIter };
		}

		// highest depth up to which every keyframe from base on is ready
		readyTo (base) {
			let k = base;
			while (this.frames.has(k + 1)) k++;
			return this.frames.has(base) ? k : base - 1;
		}

		step (dt) {
			this.t += dt;
			const base = Math.min(Math.floor(this.z), this.limit - 1);
			const ready = this.readyTo(base);
			if (this.shownAt === null && ready >= base + 1) this.shownAt = this.t;
			// full speed with a keyframe to spare, easing to a stop at the last one ready
			// (dt capped: after a stall the module polls every 500 ms, and that would be a jump)
			const room = ready >= this.limit ? 1 : ready - this.z;
			const speed = Math.max(0, Math.min(1, room)) / this.zoomSeconds;
			const z = Math.min(this.z + speed * Math.min(dt, 0.1), this.limit);
			const moved = z !== this.z;
			this.z = z;
			if (this.z >= this.limit && !this.done) this.finish();
			for (const d of this.frames.keys()) if (d < Math.floor(this.z) && d < this.limit) this.frames.delete(d);
			this.request();
			// nothing to redraw while waiting, or at the end: let the module poll slowly
			const fading = this.shownAt !== null && this.t - this.shownAt < FADE_IN + 0.1;
			this.resting = !moved && !fading;
		}

		finish () {
			this.done = true;
			this.dispose();
		}

		dispose () {
			if (this.closed) return;
			this.closed = true;
			this.pool.close();
		}

		draw (ctx, w, h) {
			const k = Math.min(Math.floor(this.z), this.limit - 1);
			const outer = this.frames.get(k), inner = this.frames.get(k + 1);
			if (!outer || !inner || this.shownAt === null) return;
			const s = 2 ** (this.z - k); // 1…2
			ctx.imageSmoothingEnabled = true;
			ctx.globalAlpha = 1;
			// the outer keyframe, stretched: only the part that is still on screen
			const sw = this.w / s, sh = this.h / s;
			ctx.drawImage(outer.image, (this.w - sw) / 2, (this.h - sh) / 2, sw, sh, 0, 0, w, h);
			// the next one in, sharp, over the middle
			const iw = (w * s) / 2, ih = (h * s) / 2;
			ctx.drawImage(inner.image, (w - iw) / 2, (h - ih) / 2, iw, ih);
			const fade = Math.min(1, (this.t - this.shownAt) / FADE_IN);
			if (fade < 1) {
				ctx.globalAlpha = 1 - fade;
				ctx.fillStyle = "#000";
				ctx.fillRect(0, 0, w, h);
				ctx.globalAlpha = 1;
			}
		}

		static toImage (rgba, w, h) {
			if (typeof document === "undefined") return null; // tests
			const c = document.createElement("canvas");
			c.width = w; c.height = h;
			c.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
			return c;
		}

		static now () {
			return typeof performance !== "undefined" ? performance.now() : Date.now();
		}

		// how wide the whole set would be, drawn at this magnification on the mirror
		static wholeSetWidth (widthPx, z) {
			const m = widthPx * PIXEL_PITCH * 2 ** z;
			const earth = 12742e3, moon = 384400e3, sun = 149.6e9, ly = 9.4607e15;
			if (m < 1) return `${Math.round(m * 100)} cm`;
			if (m < 1000) return `${m.toFixed(m < 10 ? 1 : 0)} m`;
			const km = `${sci(m / 1000, 1)} km`;
			if (m < earth) return km;
			if (m < moon) return `${km}, ${(m / earth).toFixed(m < 10 * earth ? 1 : 0)}× the Earth`;
			if (m < sun) return `${km}, ${(m / moon).toFixed(m < 10 * moon ? 1 : 0)}× the distance to the Moon`;
			if (m < ly / 10) return `${km}, ${(m / sun).toFixed(m < 10 * sun ? 1 : 0)}× the distance to the Sun`;
			return `${km}, ${(m / ly).toFixed(1)} light years`;
		}

		buildInfo () {
			const t = this.target;
			const cplx = ([x, y], digits) => `${x.toFixed(digits).replace("-", "−")} ${y < 0 ? "−" : "+"} ${Math.abs(y).toFixed(digits)}i`;
			const turnDeg = Math.round((Math.abs(t.turn) * 180) / Math.PI);
			const repeats = `the picture there repeats itself every ×${t.repeat.toFixed(2)}${turnDeg ? `, turned ${turnDeg}°` : ""}`;
			const mandel = t.family === "mandelbrot";
			return {
				title: t.name,
				subtitle: mandel ? "a dive into the Mandelbrot set, towards a point on its edge" : `a dive into the Julia set of c = ${cplx(t.c, 3)}`,
				equations: [
					mandel
						? "z<sub>n+1</sub> = z<sub>n</sub>² + c,   z<sub>0</sub> = 0,   c = the point on screen"
						: `z<sub>n+1</sub> = z<sub>n</sub>² + c,   c = ${cplx(t.c, 3)},   z<sub>0</sub> = the point on screen`,
					"<span class=\"chaos-note\">black: z stays bounded for ever. Elsewhere it escapes to infinity, and the colour tells how fast: " +
						"ν = n + 1 − log₂ log<sub>R</sub>|z<sub>n</sub>|</span>",
					mandel
						? `<span class="chaos-note">heading for c = ${cplx(t.center, 16)}, where the orbit of 0 lands on a repelling cycle of period ${t.p} after ${t.m} steps (a Misiurewicz point): ${repeats}</span>`
						: `<span class="chaos-note">heading for the fixed point z = ${cplx(t.center, 16)}, where the set's arms meet: ${repeats}</span>`
				]
			};
		}

		readout () {
			const t = this.target, size = t.start * 2 ** -this.z;
			const deepest = [...this.frames.values()].pop();
			if (this.shownAt === null) return "rendering the first view…";
			const lines = [
				`magnified ${sci(2 ** this.z, 1)}×    view ${sci(size, 1)} wide    up to ${this.maxIter} iterations`,
				`at this scale the whole ${t.family === "mandelbrot" ? "set" : "picture"} would be ${Zoom.wholeSetWidth(this.w, this.z)} across`
			];
			if (this.done) lines.push(`the end: pixels ${sci(size / Math.min(this.w, this.h), 1)} apart, the limit of 64-bit arithmetic`);
			else if (deepest && this.readyTo(Math.floor(this.z)) < this.z + 1) lines.push(`slowing for the next view: ${(deepest.ms / 1000).toFixed(1)} s per keyframe`);
			return lines.join("\n");
		}
	}

	Zoom.WorkerPool = WorkerPool;
	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.zoom = Zoom;
	if (typeof module !== "undefined") module.exports = { Zoom };
})(typeof window !== "undefined" ? window : globalThis);
