/* Chaotic billiards: order or chaos from the shape of the table alone. Above, an elliptical
 * table; below, Bunimovich's stadium, two half circles joined by straight sides, as long and
 * as wide. In each, three balls leave the same point 10⁻⁶ rad apart, red, green and blue, so
 * while they agree they add up to white. Angle of incidence = angle of reflection, and nothing
 * else: no friction, no spin.
 *
 * In the ellipse every path stays tangent to one confocal ellipse or hyperbola (its caustic),
 * which it never crosses: the balls drift apart only in proportion to the bounces (it is
 * integrable). In the stadium the gap doubles every bounce or two, and each ball visits every
 * part of the table (Bunimovich 1974, 1979).
 *
 * Drawn as a long exposure for the Pi: each frame adds only the balls' new paths, one table per
 * frame in turn, so a frame's changes stay in one half of the picture.
 */
(function (root) {
	const A = 1, B = 0.5;            // the ellipse's semi-axes
	const L = 0.5, R = 0.5;          // the stadium: straight sides 2L long, ends of radius R
	const SPEED = 1.6;               // table-units per second
	const SPREAD = 1e-6;             // radians between the balls' first directions
	const COLOURS = ["rgb(255,90,80)", "rgb(90,255,120)", "rgb(90,140,255)"];
	const EPS = 1e-12;

	// the smallest t > EPS at which p + t d meets the table's wall, and the wall's inward normal there
	function hitEllipse (x, y, dx, dy) {
		const a = (dx * dx) / (A * A) + (dy * dy) / (B * B), b = 2 * ((x * dx) / (A * A) + (y * dy) / (B * B));
		const c = (x * x) / (A * A) + (y * y) / (B * B) - 1;
		const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
		const hx = x + t * dx, hy = y + t * dy, nx = -hx / (A * A), ny = -hy / (B * B), n = Math.hypot(nx, ny);
		return { t, nx: nx / n, ny: ny / n };
	}

	function hitStadium (x, y, dx, dy) {
		let best = { t: Infinity };
		// the straight sides, y = ±R for |x| ≤ L
		for (const side of [1, -1]) {
			if (dy * side <= 0) continue;
			const t = (side * R - y) / dy;
			if (t > EPS && Math.abs(x + t * dx) <= L && t < best.t) best = { t, nx: 0, ny: -side };
		}
		// the round ends, centres (±L, 0), only their outer halves
		for (const side of [1, -1]) {
			const cx = side * L, ox = x - cx;
			const b = ox * dx + y * dy, c = ox * ox + y * y - R * R, disc = b * b - c;
			if (disc < 0) continue;
			const t = -b + Math.sqrt(disc);
			if (t <= EPS || t >= best.t) continue;
			const hx = x + t * dx, hy = y + t * dy;
			if ((hx - cx) * side < -1e-12) continue;
			const n = Math.hypot(hx - cx, hy);
			best = { t, nx: -(hx - cx) / n, ny: -hy / n };
		}
		return best;
	}

	class Table {
		constructor (hit, start, angle) {
			this.hit = hit;
			this.balls = [0, 1, 2].map((k) => {
				const a = angle + k * SPREAD;
				return { x: start[0], y: start[1], dx: Math.cos(a), dy: Math.sin(a), bounces: 0, path: [start[0], start[1]] };
			});
		}

		// move every ball on by distance s, bouncing; each ball's path collects its corners
		advance (s) {
			for (const b of this.balls) {
				let left = s;
				for (let guard = 0; guard < 100 && left > 0; guard++) {
					const h = this.hit(b.x, b.y, b.dx, b.dy);
					if (h.t > left) {
						b.x += left * b.dx; b.y += left * b.dy;
						break;
					}
					b.x += h.t * b.dx; b.y += h.t * b.dy;
					left -= h.t;
					const dot = b.dx * h.nx + b.dy * h.ny;
					b.dx -= 2 * dot * h.nx; b.dy -= 2 * dot * h.ny;
					b.bounces++;
					b.path.push(b.x, b.y);
				}
				b.path.push(b.x, b.y);
			}
		}

		// the largest distance between two of the balls
		spread () {
			const [p, q, r] = this.balls;
			return Math.max(Math.hypot(p.x - q.x, p.y - q.y), Math.hypot(q.x - r.x, q.y - r.y), Math.hypot(p.x - r.x, p.y - r.y));
		}
	}

	class Billiards {
		constructor () {
			// the same start in both: a point off the axes, heading off at a random angle
			const angle = Math.random() * 2 * Math.PI, start = [-0.31, 0.12];
			this.ellipse = new Table(hitEllipse, start, angle);
			this.stadium = new Table(hitStadium, start, angle);
			this.t = 0;
			this.turn = 0;
			this.drawnOutline = false;
		}

		step (dt) {
			this.t += dt;
			this.ellipse.advance(SPEED * dt);
			this.stadium.advance(SPEED * dt);
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			// two tables, 2 × 1 each, one above the other
			this.S = Math.min(w / 2.1, h / 2.3);
			this.cx = w / 2;
			this.cy = [h / 2 - this.S * 0.58, h / 2 + this.S * 0.58];
			this.drawnOutline = false;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (!this.drawnOutline) {
				this.drawTables(ctx);
				this.drawnOutline = true;
			}
			// one table per frame; the other's paths wait for the next
			const k = this.turn++ % 2, table = k ? this.stadium : this.ellipse, oy = this.cy[k];
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			ctx.lineWidth = 1.3;
			ctx.lineJoin = "round";
			ctx.globalAlpha = 0.55;
			table.balls.forEach((b, i) => {
				if (b.path.length < 4) return;
				ctx.strokeStyle = COLOURS[i];
				ctx.beginPath();
				ctx.moveTo(this.cx + b.path[0] * this.S, oy - b.path[1] * this.S);
				for (let j = 2; j < b.path.length; j += 2) ctx.lineTo(this.cx + b.path[j] * this.S, oy - b.path[j + 1] * this.S);
				ctx.stroke();
				b.path = [b.x, b.y];
			});
			ctx.restore();
		}

		drawTables (ctx) {
			const { S, cx, cy } = this;
			ctx.save();
			ctx.strokeStyle = "#555";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.ellipse(cx, cy[0], A * S, B * S, 0, 0, 2 * Math.PI);
			ctx.stroke();
			ctx.beginPath();
			ctx.arc(cx + L * S, cy[1], R * S, -Math.PI / 2, Math.PI / 2);
			ctx.lineTo(cx - L * S, cy[1] + R * S);
			ctx.arc(cx - L * S, cy[1], R * S, Math.PI / 2, (3 * Math.PI) / 2);
			ctx.closePath();
			ctx.stroke();
			ctx.restore();
		}

		readout () {
			const sci = (root.ChaosCommon || require("./common.js")).sci;
			const e = this.ellipse, s = this.stadium;
			return `ellipse: ${e.balls[0].bounces} bounces, the balls ${sci(e.spread())} apart\n` +
				`stadium: ${s.balls[0].bounces} bounces, the balls ${sci(s.spread())} apart`;
		}
	}

	Billiards.info = {
		title: "Chaotic billiards",
		subtitle: "above an elliptical table, below Bunimovich's stadium: three balls in each, leaving the same point 10⁻⁶ rad apart",
		equations: [
			"angle of incidence = angle of reflection; &nbsp;no friction",
			"<span class=\"chaos-note\">In the ellipse every path keeps touching the same confocal ellipse or hyperbola, which it never crosses, so the balls stay together. In the stadium the gap doubles every bounce or two, and each ball goes everywhere: Leonid Bunimovich proved in the 1970s that a table needs no inward-curving wall to be chaotic, the straight sides and round ends are enough.</span>"
		]
	};
	Billiards.hitEllipse = hitEllipse;
	Billiards.hitStadium = hitStadium;
	Billiards.Table = Table;
	Billiards.SIZE = { A, B, L, R };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.billiards = Billiards;
	if (typeof module !== "undefined") module.exports = { Billiards };
})(typeof window !== "undefined" ? window : globalThis);
