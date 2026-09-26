/* Not chaos: the sky over the mirror, tonight. The whole sky as a circle, the point overhead at
 * the centre and the horizon at the rim, north at the top and east on the left, as seen lying on
 * your back with your head to the north (a stereographic projection: shapes stay true). Stars
 * sized by brightness and coloured by their temperature (B − V); constellation figures; the
 * ecliptic; the planets where they are; the Moon in its phase, lit from the side the Sun is on.
 *
 * After dark it charts the sky now; by day, tonight's as soon as it's dark (the Sun 12° down).
 * One star's story per showing. Drawn in stages (stars, figures one by one, then the planets and
 * the Moon), then held.
 *
 * Stars and figures come from data/stars.js (see tools/build-stars.js); positions for J2000,
 * precessed to the date (sky-math.js).
 */
(function (root) {
	const M = root.ChaosSkyMath || require("./sky-math.js");
	const STARS = root.ChaosStars || (typeof module !== "undefined" ? (() => { try { return require("../data/stars.js"); } catch (e) { return null; } })() : null);
	const STORIES = root.ChaosStarStories || require("../data/star-stories.js");

	const MARGIN = 0.9;              // the horizon's radius, as a fraction of half the canvas
	const DARK = -12;                // the Sun this far down: dark enough for the chart
	const MOON_SCALE = 12;           // the Moon drawn this many times its size
	const PLANETS = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
	const PLANET_COLOURS = { Mercury: [210, 200, 185], Venus: [255, 250, 230], Mars: [255, 150, 110], Jupiter: [255, 235, 200], Saturn: [240, 220, 160] };
	const STAGES = { stars: [0, 3], figures: [3, 15], labels: [15, 16.5], bodies: [16.5, 18] }; // seconds

	const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
	const direction = (az) => DIRECTIONS[Math.round(az / 45) % 8];
	const time = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase().replace(" ", " ");

	// a star's colour from its B − V index: temperature (Ballesteros 2012), then that of a
	// black body of that temperature, as sRGB (Tanner Helland's fit)
	function starColour (bv) {
		const b = Math.max(-0.4, Math.min(2, bv ?? 0.6));
		const T = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62)), t = T / 100;
		const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592;
		const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492;
		const bl = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
		const c = (v) => Math.round(Math.max(0, Math.min(255, v)));
		// mix towards white: the eye sees star colours pale
		return [c(r), c(g), c(bl)].map((v) => Math.round(v * 0.55 + 255 * 0.45));
	}

	// decks shared by successive instances
	let storyDeck = [];

	class Sky {
		// skyLatitude, skyLongitude: where (default Greenwich); skyPlace: its name for the title;
		// now: chart this moment instead of the clock's
		constructor ({ skyLatitude = 51.4769, skyLongitude = -0.0005, skyPlace, now } = {}) {
			this.lat = Number(skyLatitude);
			this.lon = Number(skyLongitude);
			this.place = skyPlace || (skyLatitude === 51.4769 ? "Greenwich" : `${Math.abs(this.lat).toFixed(1)}° ${this.lat >= 0 ? "N" : "S"}`);
			this.clock = now ? new Date(now) : new Date();
			this.chooseTime();
			this.compute();
			this.t = 0;
			this.resting = false;
			this.info = this.buildInfo();
		}

		// now, if it's dark; otherwise tonight, when the Sun is 12° down
		chooseTime () {
			const sunAlt = M.sunAltitude(this.lat, this.lon);
			this.live = sunAlt(this.clock) < DARK;
			this.when = this.live ? this.clock : (M.crossing(sunAlt, this.clock, DARK, false, 30) || this.clock);
		}

		compute () {
			const { lat, lon, when } = this, t = M.T(when);
			// stars: precessed, then where they are in the sky
			this.stars = [];
			if (STARS) {
				STARS.stars.forEach(([ra, dec, mag, bv], i) => {
					const [a, d] = M.precess(ra, dec, t), h = M.horizontal(a, d, lat, lon, when);
					const alt = h.alt + M.refraction(h.alt);
					this.stars.push({ i, alt, az: h.az, mag, colour: starColour(bv) });
				});
			}
			// the planets, the Moon, the Sun
			this.planets = PLANETS.map((name) => {
				const p = M.planet(name, when), h = M.horizontal(p.ra, p.dec, lat, lon, when);
				return { name, alt: h.alt + M.refraction(h.alt), az: h.az, mag: p.mag };
			});
			this.moon = M.moonHorizontal(lat, lon, when);
			this.phase = M.moonPhase(when);
			const s = M.sun(when);
			this.sun = M.horizontal(s.ra, s.dec, lat, lon, when);
			this.lst = M.gmst(when) + lon;
			// the next rising or setting of each, from the time charted
			this.events = this.findEvents();
			this.story = this.chooseStory();
		}

		findEvents () {
			const { lat, lon, when } = this, from = new Date(when.getTime() - 12 * 3600000);
			const sunAlt = M.sunAltitude(lat, lon), moonAlt = M.moonAltitude(lat, lon);
			const next = (f, h0, rising) => M.crossing(f, from, h0, rising, 36);
			return {
				sunset: next(sunAlt, -0.833, false), sunrise: M.crossing(sunAlt, when, -0.833, true, 26),
				moonrise: next(moonAlt, 0.125, true), moonset: next(moonAlt, 0.125, false),
				full: M.nextPhase(new Date(when.getTime() - 3 * 86400000), 180),
				newMoon: M.nextPhase(new Date(when.getTime() - 3 * 86400000), 0)
			};
		}

		// the next star of the deck that is well up at the time charted
		chooseStory () {
			if (!STARS) return null;
			for (let tries = 0; tries < STORIES.length * 2; tries++) {
				if (!storyDeck.length) {
					storyDeck = STORIES.map((_, i) => i);
					for (let i = storyDeck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [storyDeck[i], storyDeck[j]] = [storyDeck[j], storyDeck[i]]; }
				}
				const story = STORIES[storyDeck.shift()], i = STARS.names[story.name];
				if (i !== undefined && this.stars[i].alt > 12) return { ...story, star: this.stars[i] };
			}
			return null;
		}

		step (dt) {
			this.t += dt;
		}

		layout (w, h) {
			if (this.w === w && this.h === h) return;
			this.w = w; this.h = h;
			this.cx = w / 2; this.cy = h / 2;
			this.R = (Math.min(w, h) / 2) * MARGIN;
			this.px = Math.max(1, Math.min(w, h) / 700);
			this.done = { stars: 0, figures: 0, labels: false, bodies: false, frame: false };
		}

		xy (alt, az) {
			const [x, y] = M.project(alt, az);
			return [this.cx + x * this.R, this.cy + y * this.R];
		}

		draw (ctx, w, h) {
			this.layout(w, h);
			const d = this.done, t = this.t;
			if (!d.frame) { this.drawFrame(ctx); d.frame = true; }
			// the stars, brightest first
			const visible = this.visibleStars();
			const nStars = Math.min(visible.length, Math.ceil(visible.length * Math.min(1, (t - STAGES.stars[0]) / (STAGES.stars[1] - STAGES.stars[0]))));
			if (nStars > d.stars) { this.drawStars(ctx, visible.slice(d.stars, nStars)); d.stars = nStars; }
			// the figures, one at a time
			const figs = this.visibleFigures();
			const nFigs = Math.min(figs.length, Math.max(0, Math.ceil(figs.length * (t - STAGES.figures[0]) / (STAGES.figures[1] - STAGES.figures[0]))));
			if (nFigs > d.figures) { this.drawFigures(ctx, figs.slice(d.figures, nFigs)); d.figures = nFigs; }
			if (!d.labels && t >= STAGES.labels[0]) { this.drawLabels(ctx); d.labels = true; }
			if (!d.bodies && t >= STAGES.bodies[0]) { this.drawBodies(ctx); d.bodies = true; }
			if (d.bodies && d.labels && d.stars >= visible.length && d.figures >= figs.length) this.resting = true;
		}

		visibleStars () {
			if (!this.sorted) this.sorted = this.stars.filter((s) => s.alt > 0).sort((a, b) => a.mag - b.mag);
			return this.sorted;
		}

		// figures with at least one line wholly above the horizon, west to east round the sky
		visibleFigures () {
			if (this.figs) return this.figs;
			const up = (i) => this.stars[i] && this.stars[i].alt > 0;
			this.figs = STARS ? STARS.figures.map((f) => ({ ...f, lines: f.lines.filter(([a, b]) => up(a) && up(b)) }))
				.filter((f) => f.lines.length)
				.map((f) => ({ ...f, az: this.stars[f.lines[0][0]].az }))
				.sort((a, b) => ((a.az + 90) % 360) - ((b.az + 90) % 360)) : [];
			return this.figs;
		}

		// the horizon, the altitude circles, the compass points and the ecliptic
		drawFrame (ctx) {
			const { cx, cy, R, px } = this;
			ctx.save();
			ctx.strokeStyle = "#3a4250";
			ctx.lineWidth = 1.2 * px;
			ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2 * Math.PI); ctx.stroke();
			ctx.strokeStyle = "#1c222b";
			ctx.lineWidth = 1 * px;
			for (const alt of [30, 60]) {
				const r = Math.tan(((90 - alt) / 2) * (Math.PI / 180)) * R;
				ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
			}
			ctx.fillStyle = "#8a93a3";
			ctx.font = `${Math.round(15 * px)}px "Roboto Condensed", sans-serif`;
			ctx.textAlign = "center"; ctx.textBaseline = "middle";
			for (const [label, az] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
				const [x, y] = M.project(0, az), k = 1 + 16 * px / R;
				ctx.fillText(label, cx + x * R * k, cy + y * R * k);
			}
			// the ecliptic, dashed
			const pts = [], t = M.T(this.when), eps = M.obliquity(t);
			for (let lon = 0; lon <= 360; lon += 2) {
				const [ra, dec] = M.eclipticToEquatorial(lon, 0, eps), h = M.horizontal(ra, dec, this.lat, this.lon, this.when);
				pts.push(h.alt > 0 ? this.xy(h.alt, h.az) : null);
			}
			ctx.strokeStyle = "#5a4a2a";
			ctx.setLineDash([3 * px, 5 * px]);
			ctx.beginPath();
			for (let k = 1; k < pts.length; k++) if (pts[k] && pts[k - 1]) { ctx.moveTo(...pts[k - 1]); ctx.lineTo(...pts[k]); }
			ctx.stroke();
			ctx.restore();
		}

		drawStars (ctx, list) {
			const { px } = this;
			ctx.save();
			for (const s of list) {
				const [x, y] = this.xy(s.alt, s.az), r = Math.max(0.6, 3.6 - 0.62 * s.mag) * px;
				const [cr, cg, cb] = s.colour;
				if (s.mag < 1.5) { // a soft glow round the brightest
					ctx.globalAlpha = 0.18;
					ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
					ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 2 * Math.PI); ctx.fill();
				}
				ctx.globalAlpha = Math.min(1, 0.45 + 0.12 * (6 - s.mag));
				ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
				ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
			}
			ctx.restore();
		}

		drawFigures (ctx, figs) {
			ctx.save();
			ctx.strokeStyle = "#4f6f95";
			ctx.globalAlpha = 0.75;
			ctx.lineWidth = 1 * this.px;
			for (const f of figs) {
				ctx.beginPath();
				for (const [a, b] of f.lines) {
					const p = this.xy(this.stars[a].alt, this.stars[a].az), q = this.xy(this.stars[b].alt, this.stars[b].az);
					// stop short of the stars, so the lines don't cover them
					const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), g = Math.min(0.3 * L, 4 * this.px);
					if (L < 1) continue;
					ctx.moveTo(p[0] + (dx * g) / L, p[1] + (dy * g) / L);
					ctx.lineTo(q[0] - (dx * g) / L, q[1] - (dy * g) / L);
				}
				ctx.stroke();
			}
			ctx.restore();
		}

		// the figures' names, the brightest stars' names, and a ring round the star of the story
		drawLabels (ctx) {
			const { px } = this;
			ctx.save();
			ctx.textAlign = "center"; ctx.textBaseline = "middle";
			ctx.font = `${Math.round(11 * px)}px "Roboto Condensed", sans-serif`;
			ctx.fillStyle = "#6f86a3";
			for (const f of this.visibleFigures()) {
				if (f.lines.length < 2) continue;
				let x = 0, y = 0, n = 0;
				for (const [a, b] of f.lines) for (const i of [a, b]) { const p = this.xy(this.stars[i].alt, this.stars[i].az); x += p[0]; y += p[1]; n++; }
				ctx.fillText(f.name.toUpperCase(), x / n, y / n + 12 * px);
			}
			ctx.font = `${Math.round(12 * px)}px "Roboto Condensed", sans-serif`;
			ctx.fillStyle = "#b9c2cf";
			ctx.textAlign = "left";
			for (const [name, i] of Object.entries(STARS ? STARS.names : {})) {
				const s = this.stars[i];
				if (!s || s.alt < 2 || s.mag > 1.6) continue;
				const [x, y] = this.xy(s.alt, s.az);
				ctx.fillText(name, x + 6 * px, y - 6 * px);
			}
			if (this.story) {
				const [x, y] = this.xy(this.story.star.alt, this.story.star.az);
				ctx.strokeStyle = "#e8c98a"; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.2 * px;
				ctx.beginPath(); ctx.arc(x, y, 9 * px, 0, 2 * Math.PI); ctx.stroke();
			}
			ctx.restore();
		}

		// the Moon in its phase, and the planets above the horizon, their names clear of the Moon
		drawBodies (ctx) {
			const { px } = this;
			const moon = this.moon.alt > -0.5 ? this.drawMoon(ctx) : null;
			ctx.save();
			ctx.font = `${Math.round(13 * px)}px "Roboto Condensed", sans-serif`;
			ctx.textBaseline = "middle";
			for (const p of this.planets) {
				if (p.alt <= 0) continue;
				const [x, y] = this.xy(p.alt, p.az), [r, g, b] = PLANET_COLOURS[p.name], rad = Math.max(2.2, 4.4 - 0.5 * p.mag) * px;
				ctx.globalAlpha = 0.25; ctx.fillStyle = `rgb(${r},${g},${b})`;
				ctx.beginPath(); ctx.arc(x, y, rad * 2.2, 0, 2 * Math.PI); ctx.fill();
				ctx.globalAlpha = 1;
				ctx.beginPath(); ctx.arc(x, y, rad, 0, 2 * Math.PI); ctx.fill();
				// the name on the right, unless the Moon is there: then below
				const w = ctx.measureText(p.name).width, right = [x + rad + 5 * px, y];
				const clash = moon && Math.hypot(Math.max(right[0], Math.min(moon.x, right[0] + w)) - moon.x, right[1] - moon.y) < moon.r + 10 * px;
				ctx.fillStyle = "#e9d9b0";
				ctx.textAlign = clash ? "center" : "left";
				ctx.fillText(p.name, clash ? x : right[0], clash ? y + (moon.y > y ? -1 : 1) * (rad + 11 * px) : y);
			}
			ctx.restore();
		}

		// the Moon, MOON_SCALE times its size: lit towards the Sun along the sky, its terminator an
		// ellipse whose width is |cos i| of the radius
		drawMoon (ctx) {
			const { px } = this, alt = Math.max(0, this.moon.alt), [x, y] = this.xy(alt, this.moon.az);
			// its radius, 0.26°, on the chart where it is: the projection's scale is (R/2) sec²(z/2)
			const half = ((90 - alt) / 2) * (Math.PI / 180);
			const r = Math.max(5 * px, MOON_SCALE * 0.2605 * (Math.PI / 180) * (this.R / 2) * (1 + Math.tan(half) ** 2));
			const [ux, uy] = M.chartDirection({ alt: this.moon.alt, az: this.moon.az }, { alt: this.sun.alt, az: this.sun.az });
			const angle = Math.atan2(uy, ux), k = Math.cos(this.phase.phaseAngle * (Math.PI / 180)); // 1 full, −1 new
			ctx.save();
			ctx.translate(x, y);
			ctx.rotate(angle);                       // +x now points at the Sun
			ctx.globalAlpha = 1;
			ctx.fillStyle = "#2a2d33";               // the dark part, faintly (earthshine)
			ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill();
			ctx.fillStyle = "#f4efe2";
			ctx.beginPath();
			ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);             // the lit half, towards the Sun
			ctx.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, k < 0); // the terminator
			ctx.fill();
			ctx.restore();
			// its name on the side away from the planets near it
			const near = this.planets.filter((p) => p.alt > 0).map((p) => this.xy(p.alt, p.az)).filter(([u, v]) => Math.hypot(u - x, v - y) < r + 60 * px);
			const left = near.some(([u]) => u > x);
			ctx.save();
			ctx.fillStyle = "#e9d9b0";
			ctx.font = `${Math.round(13 * px)}px "Roboto Condensed", sans-serif`;
			ctx.textBaseline = "middle"; ctx.textAlign = left ? "right" : "left";
			ctx.fillText("Moon", left ? x - r - 6 * px : x + r + 6 * px, near.length && !left ? y - r - 4 * px : y);
			ctx.restore();
			return { x, y, r };
		}

		// "the Harvest Moon": the full moon nearest the September equinox; the next, the Hunter's
		fullMoonName () {
			const full = this.events.full;
			if (!full || Math.abs(full - this.when) > 1.5 * 86400000) return null;
			const year = full.getUTCFullYear();
			const equinox = root.ChaosEphemeris.nextZero((d) => M.sun(d).lon - 180, new Date(Date.UTC(year, 8, 10)), 1, 30);
			const before = M.nextPhase(new Date(equinox.getTime() - 30 * 86400000), 180);
			const after = M.nextPhase(equinox, 180);
			const harvest = Math.abs(before - equinox) < Math.abs(after - equinox) ? before : after;
			if (Math.abs(harvest - full) < 86400000) return "the Harvest Moon, the full moon nearest the autumn equinox";
			const hunters = M.nextPhase(new Date(harvest.getTime() + 5 * 86400000), 180);
			if (Math.abs(hunters - full) < 86400000) return "the Hunter's Moon, the full moon after the Harvest Moon";
			return null;
		}

		buildInfo () {
			const e = this.events, when = this.when, ph = this.phase;
			const whenText = this.live ? `now, ${time(when)}` : `tonight at ${time(when)}, as it gets dark`;
			const lstH = (((this.lst % 360) + 360) % 360) / 15, lst = `${Math.floor(lstH)}h ${String(Math.floor((lstH % 1) * 60)).padStart(2, "0")}m`;
			const moonState = ph.fraction > 0.985 ? "full" : ph.fraction < 0.015 ? "new" : `${Math.round(ph.fraction * 100)}% lit, ${ph.waxing ? "waxing" : "waning"}`;
			const moonWhere = this.moon.alt > 0 ? `${Math.round(this.moon.alt)}° up in the ${direction(this.moon.az)}` : "below the horizon";
			const up = this.planets.filter((p) => p.alt > 0).sort((a, b) => a.mag - b.mag).map((p) => `${p.name} ${Math.round(p.alt)}° up in the ${direction(p.az)}`);
			const facts = [
				`The Moon: ${moonState}, ${moonWhere}${e.moonrise ? `; it rises at ${time(e.moonrise)}` : ""}${e.moonset ? `, sets at ${time(e.moonset)}` : ""}.`,
				up.length ? `${up.join(", ")}.` : "No bright planets up.",
				this.fullMoonName() ? `Full moon today: ${this.fullMoonName()}.` : null,
				e.sunset && e.sunrise ? `Sunset ${time(e.sunset)}, sunrise ${time(e.sunrise)}.` : null
			].filter(Boolean);
			const story = this.story ? `${this.story.name}${this.story.ly ? `, ${this.story.ly} light years away (the light you see left it around ${Math.round(when.getFullYear() - this.story.ly)})` : ""}: ${this.story.text}` : "";
			return {
				title: `The sky over ${this.place}`,
				subtitle: `${whenText} · looking up, north at the top, east on the left · the Moon ${MOON_SCALE}× its size`,
				equations: [
					`sin h = sin φ sin δ + cos φ cos δ cos(LST − α) &nbsp; <span class="chaos-note">φ = ${this.lat.toFixed(2)}°, sidereal time ${lst}</span>`,
					`<span class="chaos-note">${facts.join(" ")}</span>`,
					story ? `<span class="chaos-note">${story}</span>` : ""
				].filter(Boolean)
			};
		}

		readout () {
			const n = this.visibleStars().length;
			return `${n.toLocaleString("en")} stars above the horizon    ${this.visibleFigures().length} constellations\n` +
				`${this.live ? "charted" : "charted for"} ${this.when.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}`;
		}
	}

	Sky.starColour = starColour;
	Sky.info = { title: "The sky", equations: [] };

	root.ChaosSimulations = root.ChaosSimulations || {};
	root.ChaosSimulations.sky = Sky;
	if (typeof module !== "undefined") module.exports = { Sky };
})(typeof window !== "undefined" ? window : globalThis);
