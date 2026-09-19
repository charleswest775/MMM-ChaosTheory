// Checks for the fractal zoom: escape times, the targets being truly on the boundary, and
// the keyframe scheduling. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const ZM = require("../simulations/zoom-math.js");
const { Zoom } = require("../simulations/zoom.js");

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("escape times: inside points never escape, c = 1 escapes on schedule, ν is smooth", () => {
	for (const c of [[0, 0], [-1, 0], [-0.1, 0.1], [-1.75, 0], [0.25, 0]]) assert.strictEqual(ZM.escape(0, 0, c[0], c[1], 5000, 1e-12), -1, `${c}`);
	// 0, 1, 2, 5, 26, 677, 458330: |z| passes 256 at the 6th step
	const mu = ZM.escape(0, 0, 1, 0, 100, 1e-12);
	assert.ok(mu > 5 && mu < 7, `${mu}`);
	// continuous across whole iterations: nearby c on the real axis, beyond 1/4, differ little
	let prev = ZM.escape(0, 0, 0.3, 0, 10000, 0);
	for (let x = 0.3; x < 2; x += 0.001) {
		const v = ZM.escape(0, 0, x, 0, 10000, 0);
		assert.ok(v <= prev + 1e-9 && prev - v < 1, `jump at ${x}: ${prev} → ${v}`);
		prev = v;
	}
});

test("the cardioid and period-2 disc shortcut agrees with iterating", () => {
	let n = 0;
	for (let x = -2; x < 0.5; x += 0.013) for (let y = 0; y < 1.2; y += 0.013) {
		if (!ZM.inMainBulbs(x, y)) continue;
		n++;
		assert.strictEqual(ZM.escape(0, 0, x, y, 20000, 0), -1, `${x}, ${y}`);
	}
	assert.ok(n > 1000);
});

test("rendering a share of the rows gives the same pixels as the whole", () => {
	const job = { family: "mandelbrot", cx: -0.5, cy: 0, size: 3, w: 40, h: 30, maxIter: 300 };
	const all = new Float32Array(40 * 30);
	ZM.render(job, all);
	const part = new Float32Array(40 * 10);
	const st = ZM.render({ ...job, firstRow: 1, rowStep: 3 }, part);
	for (let k = 0; k < 10; k++) for (let i = 0; i < 40; i++) assert.strictEqual(part[k * 40 + i], all[(1 + 3 * k) * 40 + i]);
	assert.strictEqual(st.escaped + st.inside, 400);
});

test("every Mandelbrot target is a Misiurewicz point: 0 lands on a repelling cycle after exactly m steps", () => {
	for (const t of ZM.TARGETS.filter((t) => t.family === "mandelbrot")) {
		const r = ZM.resolve(t);
		const [cx, cy] = r.center;
		const [ax, ay] = ZM.orbit(0, 0, cx, cy, t.m), [bx, by] = ZM.orbit(ax, ay, cx, cy, t.p);
		assert.ok(Math.hypot(bx - ax, by - ay) < 1e-9, `${t.key}: f^(m+p)(0) = f^m(0)`);
		// not sooner: f^(m-1)(0) is not on the cycle, and the period is not shorter
		const [px, py] = ZM.orbit(0, 0, cx, cy, t.m - 1), [qx, qy] = ZM.orbit(px, py, cx, cy, t.p);
		assert.ok(Math.hypot(qx - px, qy - py) > 1e-3, `${t.key}: preperiod exactly ${t.m}`);
		for (let d = 1; d < t.p; d++) {
			const [dx, dy] = ZM.orbit(ax, ay, cx, cy, d);
			assert.ok(Math.hypot(dx - ax, dy - ay) > 1e-3, `${t.key}: period exactly ${t.p}`);
		}
		assert.ok(r.repeat > 1, `${t.key}: repelling, |ρ| = ${r.repeat}`);
		close(cx, t.guess[0], 1e-6, `${t.key}: Newton stayed by its guess`);
		close(cy, t.guess[1], 1e-6, `${t.key}: Newton stayed by its guess`);
		// 0's orbit stays on the cycle, until rounding errors, magnified by ρ each time round,
		// knock it off (the cycle repels)
		assert.strictEqual(ZM.escape(0, 0, cx, cy, t.m + 4 * t.p, 0), -1);
	}
});

test("every Julia target is the repelling fixed point α, on the Julia set", () => {
	for (const t of ZM.TARGETS.filter((t) => t.family === "julia")) {
		const r = ZM.resolve(t);
		const [x, y] = r.center, [nx, ny] = ZM.orbit(x, y, t.c[0], t.c[1], 1);
		close(Math.hypot(nx - x, ny - y), 0, 1e-15, `${t.key}: fixed`);
		assert.ok(r.repeat > 1, `${t.key}: repelling`);
	}
});

test("there is detail all the way down: the deepest view is still varied, and its pixels resolvable in 64 bits", () => {
	// the middle 48×48 pixels of the deepest keyframe of a 700-pixel canvas
	const w = 48, h = 48, mu = new Float32Array(w * h);
	for (const t0 of ZM.TARGETS) {
		const t = ZM.resolve(t0);
		const depth = ZM.maxDepth(t.center, t.start, 700);
		assert.ok(depth >= 30 && depth <= 40, `${t.key}: ${depth}`);
		const st = ZM.render({ family: t.family, cx: t.center[0], cy: t.center[1], jx: t.c && t.c[0], jy: t.c && t.c[1],
			size: (t.start * 2 ** -depth * w) / 700, w, h, maxIter: 20000 }, mu);
		assert.ok(st.escaped > w * h * 0.3, `${t.key}: mostly escapes (${st.escaped})`);
		// and the pixels are still far apart compared with the rounding of their coordinates
		const pixel = (t.start * 2 ** -depth) / 700, ulp = 2 ** -52 * Math.max(1, Math.hypot(...t.center));
		assert.ok(pixel / ulp >= 1024, `${t.key}: pixel is ${pixel / ulp} ulp`);
		assert.ok(new Set(Array.from(mu, (v) => Math.round(v))).size > 5, `${t.key}: varies`);
	}
});

test("percentile of the escape times, from the histogram", () => {
	const mu = new Float32Array(10000).map((_, i) => (i < 9000 ? i / 100 : -1)); // 0…90, and 1000 inside
	const st = ZM.render({ family: "mandelbrot", cx: 0, cy: 0, size: 1e-9, w: 1, h: 1, maxIter: 1000 }, new Float32Array(1));
	assert.strictEqual(st.maxIter, 1000);
	const hist = new Uint32Array(256);
	for (const v of mu) if (v >= 0) hist[Math.floor((v * 256) / 1000)]++;
	const p = ZM.percentile({ hist, maxIter: 1000, escaped: 9000 }, 0.1); // 90% escape by 81
	assert.ok(p >= 81 && p <= 81 + 1000 / 256, `${p}`);
	const merged = Zoom.mergeStats([{ escaped: 1, inside: 2, sum: 3, maxSeen: 4, hist: new Uint32Array([1, 2]), maxIter: 9 },
		{ escaped: 1, inside: 0, sum: 1, maxSeen: 7, hist: new Uint32Array([0, 5]), maxIter: 9 }]);
	assert.deepStrictEqual({ ...merged, hist: [...merged.hist] }, { escaped: 2, inside: 2, sum: 4, maxSeen: 7, hist: [1, 7], maxIter: 9 });
});

test("colours: inside is black, and the gradient wraps round seamlessly", () => {
	const rgba = new Uint8ClampedArray(12);
	ZM.colorize(new Float32Array([-1, Math.E - 1, Math.exp(4 / 3) - 1]), rgba, { density: 3 });
	assert.deepStrictEqual([...rgba.subarray(0, 4)], [0, 0, 0, 255]);
	// log(ν + 1)·3 = 3 and 4: whole turns of the gradient, the same colour
	for (let ch = 0; ch < 3; ch++) close(rgba[4 + ch], rgba[8 + ch], 2, "wrap");
});

// renders keyframes when told to, so the scheduling can be run step by step
class FakePool {
	constructor () { this.queue = []; this.closed = false; }
	render (job, done) { this.queue.push({ job, done }); }
	finish () {
		const { job, done } = this.queue.shift();
		// escape times all at 100 + 50 per doubling
		const mu = new Float32Array([100 + 50 * Math.log2(3 / job.size)]);
		const hist = new Uint32Array(256);
		hist[Math.floor((mu[0] * 256) / job.maxIter)] = 1;
		done({ rgba: null, stats: { escaped: 1, inside: 0, sum: mu[0], maxSeen: mu[0], hist, maxIter: job.maxIter } });
		return job;
	}
	close () { this.closed = true; }
}

test("the zoom waits for its keyframes, renders one at a time, and never gets ahead of them", () => {
	const pool = new FakePool();
	const zoom = new Zoom({ target: "elephant", width: 64, height: 64, zoomSeconds: 2, pool });
	assert.strictEqual(pool.queue.length, 1);
	for (let i = 0; i < 20; i++) zoom.step(0.05);
	assert.strictEqual(zoom.z, 0, "no view yet");
	assert.ok(zoom.resting);
	assert.strictEqual(pool.finish().size, 3);
	assert.strictEqual(pool.finish().size, 1.5);
	assert.strictEqual(pool.queue.length, 1, "one at a time");
	for (let i = 0; i < 200; i++) {
		zoom.step(0.05);
		assert.ok(zoom.z <= 1, "never past the last keyframe it has");
	}
	assert.ok(zoom.z > 0.9, "eases up to it");
	while (pool.queue.length) pool.finish();
	// three ahead at most, and the iteration limit grows with depth
	assert.ok([...zoom.frames.keys()].every((k) => k <= Math.floor(zoom.z) + 3));
	const limits = [...zoom.frames.values()].map((f) => f.maxIter);
	assert.ok(limits.every((m, i) => i === 0 || m >= limits[i - 1]));
	assert.ok(limits[0] === 500 && limits[limits.length - 1] > 500);
	assert.ok(limits[limits.length - 1] < 1500, `limits grow with the escape times, not on their own: ${limits}`);
});

test("at full speed, a doubling every zoomSeconds; at the end the workers are shut down", () => {
	const pool = new FakePool();
	const zoom = new Zoom({ target: "star", width: 64, height: 64, zoomSeconds: 2, pool });
	let t = 0;
	while (!zoom.done && t < 1000) {
		while (pool.queue.length) pool.finish();
		zoom.step(0.05);
		t += 0.05;
	}
	assert.ok(zoom.done && pool.closed);
	assert.strictEqual(zoom.z, zoom.limit);
	close(t, zoom.limit * 2, zoom.limit * 0.2 + 2, "seconds for the whole dive");
	assert.ok(zoom.readout().includes("the limit of 64-bit arithmetic"));
});

test("targets take turns; the caption names the point", () => {
	const keys = Array.from({ length: ZM.TARGETS.length }, () => new Zoom({ pool: new FakePool() }).target.key);
	assert.strictEqual(new Set(keys).size, ZM.TARGETS.length);
	const only = [1, 2, 3].map(() => new Zoom({ pool: new FakePool(), zoomTargets: ["seahorse"] }).target.key);
	assert.deepStrictEqual(only, ["seahorse", "seahorse", "seahorse"]);
	const html = new Zoom({ target: "seahorse", pool: new FakePool() }).info.equations.join("");
	assert.ok(html.includes("−0.7766105925997") && html.includes("period 2 after 23 steps"), html);
});

test("how big the whole set would be on the mirror", () => {
	assert.strictEqual(Zoom.wholeSetWidth(700, 0), "19 cm");
	assert.ok(Zoom.wholeSetWidth(700, 26).includes("× the Earth"));
	assert.ok(Zoom.wholeSetWidth(700, 34).includes("× the distance to the Moon"));
	assert.ok(Zoom.wholeSetWidth(700, 40).includes("Sun"));
});
