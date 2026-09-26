/* Not chaos: the planets' dance. Real orbits (JPL's elements, see ephemeris.js), from today,
 * drawn as figures that look like sacred geometry and are nothing but clockwork:
 *   lines: the line between two planets every few days (Earth and Venus: a five-petalled rose,
 *     because 8 Earth years ≈ 13 Venus years ≈ 5 times Venus laps Earth);
 *   loops: one planet as seen from Earth, looping back each time Earth overtakes it or it
 *     overtakes Earth;
 *   trigon: every meeting of Jupiter and Saturn, joined in order: Kepler's turning triangle.
 * One figure per showing, drawn in `orbitsSeconds` with time running evenly (so a planet
 * lingers where it really moves slowly), then held.
 *
 * Drawn incrementally for the Pi: each frame adds only what was drawn since the last, with
 * `lighter` compositing so crossings brighten, and the finished figure rests.
 * Coordinates: au, heliocentric (or geocentric for loops), ecliptic J2000, seen from the
 * north: x towards the vernal equinox, y 90° on, so the planets go round anticlockwise.
 */
(function (root) {
	const E = root.ChaosEphemeris || require("./ephemeris.js");

	const DAY = 86400000;
	const YEAR = 365.25 * DAY;
	const GLOW_SECONDS = 1.2;  // the centre's glow fades in first
	const MARGIN = 0.94;       // the figure's radius, as a fraction of half the canvas
	const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

	const COLOURS = {
		Sun: [255, 206, 120], Earth: [110, 170, 255], Mercury: [180, 205, 235], Venus: [255, 214, 150],
		Mars: [255, 120, 84], Jupiter: [240, 196, 140], Saturn: [226, 206, 150]
	};
	const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;
	const mix = (p, q, f) => p.map((v, i) => Math.round(v + (q[i] - v) * f));
	const ease = (x) => x * x * (3 - 2 * x);
	const list = (v) => [].concat(v ?? []).flatMap((x) => String(x).split(",")).map((x) => x.trim()).filter(Boolean);

	const iso = (d) => d.toISOString().slice(0, 10);
	const longDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
	const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
	const days = (name) => E.period(name);

	// Seen from Earth, `name` is in conjunction with the Sun (inner planets) or opposite it (outer)
	// when its heliocentric longitude equals Earth's: the next such moment after `from`.
	const nextMeeting = (name, from, outer) => E.nextZero(
		(d) => outer ? E.longitude(E.heliocentric("Earth", d)) - E.longitude(E.heliocentric(name, d))
			: E.longitude(E.heliocentric(name, d)) - E.longitude(E.heliocentric("Earth", d)),
		from, 1);
	// the next conjunction of Jupiter and Saturn seen from the Sun
	const nextGreat = (from) => E.nextZero(
		(d) => E.longitude(E.heliocentric("Jupiter", d)) - E.longitude(E.heliocentric("Saturn", d)), from, 5);

	// ---- the figures. Each build(start) returns series of strokes, in au, with times 0…1:
	//   { type: "lines", xy: [x0, y0, x1, y1, …], t: [...], colour, alpha, width }
	//   { type: "path", xy: [x, y, …], t: [...], colour, alpha, width, halo }
	//   { type: "dots", xy: [...], t: [...], colour, alpha, r }
	// plus `centre` ("Sun" or "Earth") and `span` (ms of simulated time).

	// the positions of planets at n + 1 times from start over `years`
	function track (names, start, years, every, geo = false) {
		const n = Math.round((years * 365.25) / every), out = names.map(() => []), t = [];
		for (let i = 0; i <= n; i++) {
			const d = new Date(start.getTime() + i * every * DAY);
			names.forEach((name, k) => out[k].push(geo ? E.geocentric(name, d) : E.heliocentric(name, d)));
			t.push(i / n);
		}
		return { pos: out, t, n };
	}

	// A planet tracing its orbit: laps drawn over each other with `lighter` add up, so each pass
	// is fainter the more of them there are, and the orbit ends up about as bright either way.
	const orbitTrace = (pos, t, name, laps) => ({
		type: "path", xy: pos.flatMap(([x, y]) => [x, y]), t, colour: COLOURS[name],
		alpha: 1 - 0.35 ** (1 / Math.max(1, laps)), width: 1.1, halo: false
	});

	// the line between two planets every `every` days, and each planet tracing its orbit
	function lines ({ a, b, years, every, alpha, colour }) {
		return (start) => {
			const { pos: [pa, pb], t } = track([a, b], start, years, every);
			const xy = [];
			pa.forEach((p, i) => xy.push(p[0], p[1], pb[i][0], pb[i][1]));
			return {
				centre: "Sun", span: years * YEAR,
				series: [
					{ type: "lines", xy, t, colour: colour || mix(COLOURS[a], COLOURS[b], 0.5), alpha, width: 1 },
					orbitTrace(pa, t, a, (years * 365.25) / days(a)), orbitTrace(pb, t, b, (years * 365.25) / days(b))
				]
			};
		};
	}

	// One planet as seen from Earth, and the Sun's yearly circle round the Earth, drawn whole at
	// the start: only the planet's path grows after that, so each frame's changes stay together.
	function loops ({ planet, years, every }) {
		return (start) => {
			const { pos: [pp], t } = track([planet], start, years, every, true);
			const { pos: [sun] } = track(["Sun"], start, 1, 2, true);
			return {
				centre: "Earth", span: years * YEAR,
				series: [
					{ type: "path", xy: sun.flatMap(([x, y]) => [x, y]), t: sun.map(() => 0), colour: COLOURS.Sun, alpha: 0.4, width: 1, halo: false },
					{ type: "path", xy: pp.flatMap(([x, y]) => [x, y]), t, colour: COLOURS[planet], alpha: 0.9, width: 1.6, halo: true }
				]
			};
		};
	}

	// the signs of the zodiac, 30° each from the equinox, and their elements
	const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
	const ELEMENTS = ["fire", "earth", "air", "water"];
	const sign = (lon) => { const k = Math.floor(E.wrap360(lon) / 30); return `${SIGNS[k]}, ${ELEMENTS[k % 4]}`; };
	// a J2000 longitude measured instead from the equinox of the date, as the signs are
	const ofDate = (lon, date) => E.wrap360(lon + E.precession(E.centuries(date)));

	// Every conjunction of Jupiter and Saturn (seen from the Sun), joined in order, on the circle
	// of the zodiac, with longitudes from the equinox of each date (which drifts 1.4° a century)
	// as Kepler measured them.
	function trigon ({ count }) {
		return (start) => {
			let d = nextGreat(new Date(start.getTime() - 20 * YEAR)); // the last one before `start`, or so
			while (d.getTime() > start.getTime()) d = nextGreat(new Date(d.getTime() - 25 * YEAR));
			const when = [];
			for (let k = 0; k < count; k++) {
				when.push(d);
				d = nextGreat(new Date(d.getTime() + 15 * YEAR));
			}
			const lon = when.map((w) => ofDate(E.longitude(E.heliocentric("Jupiter", w)), w) * (Math.PI / 180));
			const at = (k) => [Math.cos(lon[k]), Math.sin(lon[k])];
			const t = when.map((w) => (w - when[0]) / (when[count - 1] - when[0]));
			// each chord coloured by its date, gold to rose, so the triangle's turning shows
			const chords = [], ct = [], colours = [], dots = [];
			for (let k = 1; k < count; k++) {
				chords.push(...at(k - 1), ...at(k));
				ct.push(t[k]);
				colours.push(mix([255, 206, 110], [255, 110, 170], t[k]));
			}
			for (let k = 0; k < count; k++) dots.push(...at(k));
			// the circle of the zodiac, divided into its twelve signs, drawn first
			const ring = [], rt = [], ticks = [], tt = [];
			for (let i = 0; i <= 240; i++) { ring.push(Math.cos((i / 240) * 2 * Math.PI), Math.sin((i / 240) * 2 * Math.PI)); rt.push(0); }
			for (let s = 0; s < 12; s++) { const a = (s * Math.PI) / 6; ticks.push(1.0 * Math.cos(a), 1.0 * Math.sin(a), 1.06 * Math.cos(a), 1.06 * Math.sin(a)); tt.push(0); }
			return {
				centre: "Sun", span: when[count - 1] - when[0], when, lon,
				series: [
					{ type: "path", xy: ring, t: rt, colour: [150, 140, 120], alpha: 0.35, width: 1, halo: false },
					{ type: "lines", xy: ticks, t: tt, colour: [150, 140, 120], alpha: 0.5, width: 1 },
					{ type: "lines", xy: chords, t: ct, colour: [255, 200, 120], colours, alpha: 0.65, width: 1.3 },
					{ type: "dots", xy: dots, t, colour: [255, 236, 190], alpha: 0.95, r: 2.2 }
				]
			};
		};
	}

	// ---- the dances, with their captions. `note(start)` may look things up (the next meeting).
	const DANCES = [
		{
			key: "venus", title: "Earth and Venus", build: lines({ a: "Earth", b: "Venus", years: 8, every: 4, alpha: 0.2, colour: [255, 200, 150] }),
			subtitle: "8 years from today · the line between them every 4 days",
			equations: () => [
				`8 Earth years = ${(8 * days("Earth")).toFixed(1)} days ≈ 13 Venus years = ${(13 * days("Venus")).toFixed(1)} days`,
				`≈ 5 laps of Earth by Venus, each <span class="frac"><span>1</span><span>1/T<sub>Venus</sub> − 1/T<sub>Earth</sub></span></span> = ${E.synodic("Earth", "Venus").toFixed(1)} days`
			],
			note: () => "Five laps in eight years make five petals. The Maya counted the same cycle: the Venus table of the Dresden Codex sets five 584-day cycles of Venus against eight 365-day years."
		},
		{
			key: "venus-loops", title: "Venus, seen from Earth", build: loops({ planet: "Venus", years: 8, every: 1 }),
			subtitle: "8 years from today · Earth at the centre, and the Sun circling it once a year",
			equations: () => [
				"r<sub>Venus</sub>(t) − r<sub>Earth</sub>(t)",
				`it loops back each time it passes between us and the Sun: every ${E.synodic("Earth", "Venus").toFixed(1)} days, 5 times in 8 years`
			],
			note: (start) => `The five loops sit at the corners of a pentagram, which turns back 2.4° every eight years. The next time Venus passes the Sun on our side is ${longDate(nextMeeting("Venus", start, false))}.`
		},
		{
			key: "mercury", title: "Earth and Mercury", build: lines({ a: "Earth", b: "Mercury", years: 7, every: 3, alpha: 0.16, colour: [170, 200, 255] }),
			subtitle: "7 years from today · the line between them every 3 days",
			equations: () => [
				`Mercury goes round the Sun in ${days("Mercury").toFixed(1)} days, and laps Earth every ${E.synodic("Earth", "Mercury").toFixed(1)} days:`,
				`22 laps in 7 years = ${(7 * days("Earth")).toFixed(0)} days ≈ 29 Mercury years = ${(29 * days("Mercury")).toFixed(0)} days`
			],
			note: () => "It crosses the face of the Sun only when a lap ends near where the two orbits cross, in May or November: the next time on 13 November 2032."
		},
		{
			key: "mars", title: "Mars, seen from Earth", build: loops({ planet: "Mars", years: 15, every: 2 }),
			subtitle: "15 years from today · Earth at the centre, and the Sun circling it once a year",
			equations: () => [
				"r<sub>Mars</sub>(t) − r<sub>Earth</sub>(t)",
				`Earth overtakes Mars every ${E.synodic("Earth", "Mars").toFixed(1)} days, 7 times in 15 years, and each time Mars seems to go backwards`
			],
			note: () => "Ptolemy explained the loops with epicycles, circles riding on circles, around AD 150; Copernicus, in 1543, as Earth overtaking Mars on the inside track. Fitting Tycho Brahe's observations of Mars, Kepler found in 1609 that orbits are ellipses."
		},
		{
			key: "jupiter-saturn", title: "Jupiter and Saturn", build: lines({ a: "Jupiter", b: "Saturn", years: (3 * E.synodic("Jupiter", "Saturn")) / 365.25, every: 30, alpha: 0.22, colour: [245, 205, 145] }),
			subtitle: "60 years from today · the line between them every month",
			equations: () => {
				const S = E.synodic("Jupiter", "Saturn");
				return [
					`Jupiter laps Saturn every ${(S / 365.25).toFixed(2)} years, ${(E.wrap360((S / days("Jupiter")) * 360)).toFixed(1)}° further round each time,`,
					`so three laps come back ${(E.wrap180(3 * (S / days("Jupiter")) * 360)).toFixed(1)}° from where they began`
				];
			},
			note: (start) => `Their meetings, the great conjunctions, step round a slowly turning triangle: the last in December 2020, the next in ${nextGreat(start).getUTCFullYear()}. Kepler drew the triangle in 1606.`
		},
		{
			key: "trigon", title: "Kepler's trigon", build: trigon({ count: 41 }),
			subtitle: (f) => `every meeting of Jupiter and Saturn from ${f.when[0].getUTCFullYear()} to ${f.when[f.when.length - 1].getUTCFullYear()}, joined in order`,
			// the mean step between the meetings drawn, measured from the moving equinox
			equations: (f) => {
				const n = f.when.length - 1, S = (f.when[n] - f.when[0]) / n / YEAR;
				let total = 0;
				for (let k = 1; k <= n; k++) total += E.wrap360((f.lon[k] - f.lon[k - 1]) * (180 / Math.PI));
				const step = total / n, turn = 3 * step - 720;
				return [
					`each ${S.toFixed(2)} years, ${step.toFixed(1)}° further round the zodiac`,
					`three meetings: ${(3 * step).toFixed(1)}° = 2 × 360° + ${turn.toFixed(1)}°: the triangle turns ${turn.toFixed(1)}° every ${(3 * S).toFixed(0)} years, a third of a turn in ${((120 / turn) * 3 * S).toFixed(0)}`
				];
			},
			note: () => "From Kepler's De Stella Nova (1606). In about 800 years the meetings move through the fire, earth, air and water signs and back; the one of December 2020 began a run in the air signs. Kepler wondered whether a triple conjunction in 7 BC was the Star of Bethlehem."
		},
		{
			key: "jupiter", title: "Jupiter, seen from Earth", build: loops({ planet: "Jupiter", years: 12, every: 3 }),
			subtitle: "12 years from today · Earth at the centre, and the Sun circling it once a year",
			equations: () => [
				"r<sub>Jupiter</sub>(t) − r<sub>Earth</sub>(t)",
				`Earth overtakes Jupiter every ${E.synodic("Earth", "Jupiter").toFixed(1)} days: 11 loops while Jupiter goes round once, in ${(days("Jupiter") / 365.25).toFixed(2)} years`
			],
			note: () => "In January 1610 Galileo saw four moons circling Jupiter: proof that not everything in the sky goes round the Earth."
		},
		{
			key: "saturn", title: "Saturn, seen from Earth", build: loops({ planet: "Saturn", years: 29.5, every: 4 }),
			subtitle: "29½ years from today · Earth at the centre, and the Sun circling it once a year",
			equations: () => [
				"r<sub>Saturn</sub>(t) − r<sub>Earth</sub>(t)",
				`Earth overtakes Saturn every ${E.synodic("Earth", "Saturn").toFixed(1)} days: 28 loops while Saturn goes round once, in ${(days("Saturn") / 365.25).toFixed(2)} years`
			],
			note: () => "Twice each time round, its rings turn edge-on to us and all but vanish, as they last did in March 2025. When they vanished in 1612, Galileo asked whether Saturn had swallowed its children."
		}
	];

	// decks of dances still to show, by list, shared by successive instances
	const decks = new Map();

	class Orbits {
		// orbitsSeconds: time to draw a figure; orbitsDances: keys to choose among (default all);
		// dance: this one; start: from this Date (default now)
		constructor ({ orbitsSeconds = 22, orbitsDances = [], dance, start } = {}) {
			this.dance = DANCES.find((d) => d.key === dance) || Orbits.next(list(orbitsDances));
			this.start = start ? new Date(start) : new Date();
			this.figure = this.dance.build(this.start);
			this.seconds = orbitsSeconds;
			this.t = 0;
			this.glow = 0;
			this.resting = false;
			this.info = this.buildInfo();
		}

		static next (keys) {
			const chosen = DANCES.filter((d) => keys.includes(d.key));
			const from = chosen.length ? chosen : DANCES;
			const key = from.map((d) => d.key).join();
			let deck = decks.get(key);
			if (!deck || !deck.length) {
				deck = from.slice();
				for (let i = deck.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[deck[i], deck[j]] = [deck[j], deck[i]];
				}
				decks.set(key, deck);
			}
			return deck.shift();
		}

		step (dt) {
			this.t += dt;
		}

		// fraction of the figure drawn by now
		progress () {
			return Math.min(1, Math.max(0, (this.t - GLOW_SECONDS) / this.seconds));
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.cx = w / 2; this.cy = h / 2;
			let extent = 0;
			for (const s of this.figure.series) {
				for (let i = 0; i < s.xy.length; i += 2) extent = Math.max(extent, Math.hypot(s.xy[i], s.xy[i + 1]));
			}
			this.scale = ((Math.min(w, h) / 2) * MARGIN) / extent;
			this.px = Math.max(1, Math.min(w, h) / 700);
			for (const s of this.figure.series) s.drawn = 0; // items drawn so far
			this.glow = 0;
			this.drawnTo = -1;
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			if (this.glow < 1) {
				this.glow = Math.min(1, this.t / GLOW_SECONDS);
				this.drawCentre(ctx, ease(this.glow));
			}
			if (this.t < GLOW_SECONDS) return;
			const p = this.progress();
			ctx.save();
			ctx.globalCompositeOperation = "lighter";
			ctx.lineCap = "butt";   // each frame's piece of a path meets the last end to end, without overlapping
			ctx.lineJoin = "round";
			for (const s of this.figure.series) this.drawSeries(ctx, s, p);
			ctx.restore();
			if (p >= 1) this.resting = true;
		}

		// the items of a series due by progress p that haven't been drawn yet
		drawSeries (ctx, s, p) {
			const { cx, cy, scale, px } = this;
			const X = (x) => cx + x * scale, Y = (y) => cy - y * scale;
			let end = s.drawn;
			while (end < s.t.length && s.t[end] <= p) end++;
			if (end === s.drawn) return;
			ctx.strokeStyle = ctx.fillStyle = rgb(s.colour);
			if (s.type === "lines") {
				ctx.globalAlpha = s.alpha;
				ctx.lineWidth = s.width * px;
				ctx.beginPath();
				for (let i = s.drawn; i < end; i++) {
					ctx.moveTo(X(s.xy[4 * i]), Y(s.xy[4 * i + 1]));
					ctx.lineTo(X(s.xy[4 * i + 2]), Y(s.xy[4 * i + 3]));
					if (s.colours) { // one colour each: few of them
						ctx.strokeStyle = rgb(s.colours[i]);
						ctx.stroke();
						ctx.beginPath();
					}
				}
				ctx.stroke();
			} else if (s.type === "path") {
				// from the last point drawn (or the first) to the newest
				const from = Math.max(0, s.drawn - 1);
				if (end - from >= 2) {
					ctx.beginPath();
					ctx.moveTo(X(s.xy[2 * from]), Y(s.xy[2 * from + 1]));
					for (let i = from + 1; i < end; i++) ctx.lineTo(X(s.xy[2 * i]), Y(s.xy[2 * i + 1]));
					if (s.halo) {
						ctx.globalAlpha = s.alpha * 0.08;
						ctx.lineWidth = s.width * px * 4.5;
						ctx.stroke();
					}
					ctx.globalAlpha = s.alpha;
					ctx.lineWidth = s.width * px;
					ctx.stroke();
				}
			} else {
				ctx.globalAlpha = s.alpha;
				for (let i = s.drawn; i < end; i++) {
					ctx.beginPath();
					ctx.arc(X(s.xy[2 * i]), Y(s.xy[2 * i + 1]), s.r * px, 0, 2 * Math.PI);
					ctx.fill();
				}
			}
			s.drawn = end;
		}

		// the Sun or the Earth at the centre: a small body in a glow, faded in over GLOW_SECONDS
		drawCentre (ctx, alpha) {
			const { cx, cy, px } = this, sun = this.figure.centre === "Sun";
			const [r, g, b] = sun ? COLOURS.Sun : COLOURS.Earth;
			const R = (sun ? 26 : 18) * px;
			const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
			[[0, 0.9], [0.18, 0.75], [0.3, 0.25], [1, 0]].forEach(([at, a]) => grad.addColorStop(at, `rgba(${r},${g},${b},${a * alpha})`));
			ctx.save();
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;
			ctx.fillStyle = "#000";
			ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
			ctx.fillStyle = grad;
			ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
			ctx.restore();
		}

		// the simulated date the drawing has reached
		now () {
			return new Date(this.start.getTime() + this.progress() * this.figure.span);
		}

		buildInfo () {
			const d = this.dance;
			return {
				title: "The planets' dance",
				subtitle: `${d.title} · ${typeof d.subtitle === "function" ? d.subtitle(this.figure) : d.subtitle}`,
				equations: [...d.equations(this.figure), `<span class="chaos-note">${d.note(this.start)}</span>`]
			};
		}

		readout () {
			const d = this.dance, f = this.figure;
			if (d.key === "trigon") {
				const k = f.when.findIndex((w) => w.getTime() > this.start.getTime() + this.progress() * f.span + 1);
				const shown = k < 0 ? f.when.length : Math.max(1, k);
				const w = f.when[shown - 1];
				const lon = f.lon[shown - 1] * (180 / Math.PI);
				return `${String(shown).padStart(2)} of ${f.when.length} great conjunctions    ${iso(w)}\n` +
					`at ${lon.toFixed(1)}°: ${Math.floor(lon % 30)}° ${sign(lon)}`;
			}
			const now = this.now();
			if (f.centre === "Sun") {
				const [a, b] = d.key === "venus" ? ["Earth", "Venus"] : d.key === "mercury" ? ["Earth", "Mercury"] : ["Jupiter", "Saturn"];
				const gap = dist(E.heliocentric(a, now), E.heliocentric(b, now));
				return `${iso(now)}    ${a} to ${b}: ${gap.toFixed(2)} au\n${this.resting ? `${(f.span / YEAR).toFixed(0)} years drawn in ${this.seconds} s` : ""}`;
			}
			const planet = d.title.split(",")[0];
			const g = E.geocentric(planet, now);
			const dt = 2 * DAY, later = E.geocentric(planet, new Date(now.getTime() + dt));
			const backwards = E.wrap180(E.longitude(later) - E.longitude(g)) < 0;
			return `${iso(now)}    ${planet} ${Math.hypot(...g).toFixed(2)} au from Earth${backwards ? ", going backwards" : ""}\n` +
				`${this.resting ? `${(f.span / YEAR).toFixed(f.span / YEAR % 1 ? 1 : 0)} years drawn in ${this.seconds} s` : ""}`;
		}
	}

	Orbits.DANCES = DANCES;
	Orbits.nextMeeting = nextMeeting;
	Orbits.nextGreat = nextGreat;
	Orbits.info = { title: "The planets' dance", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.orbits = Orbits;
	if (typeof module !== "undefined") module.exports = { Orbits };
})(typeof window !== "undefined" ? window : globalThis);
