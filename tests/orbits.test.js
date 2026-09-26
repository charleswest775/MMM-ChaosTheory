// Checks for the planets' dance: the ephemeris against dates of known events, and the figures.
// Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const E = require("../simulations/ephemeris.js");
const { Orbits } = require("../simulations/orbits.js");

const DAY = 86400000;
const date = (s) => new Date(`${s}T00:00:00Z`);
const daysApart = (a, b) => Math.abs(a - b) / DAY;
// the angle (°) between two vectors
const angle = (p, q) => Math.acos((p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / Math.hypot(...p) / Math.hypot(...q)) * (180 / Math.PI);

test("Venus passes between Earth and the Sun on the dates it did", () => {
	// inferior conjunctions, from the almanacs
	for (const known of ["2020-06-03", "2022-01-09", "2023-08-13", "2025-03-23", "2026-10-24"]) {
		const found = Orbits.nextMeeting("Venus", new Date(date(known) - 60 * DAY), false);
		assert.ok(daysApart(found, date(known)) < 1.5, `${known}: found ${found.toISOString()}`);
	}
});

test("Mars is opposite the Sun on the dates it was", () => {
	for (const known of ["2018-07-27", "2020-10-13", "2022-12-08", "2025-01-16", "2027-02-19"]) {
		const found = Orbits.nextMeeting("Mars", new Date(date(known) - 60 * DAY), true);
		assert.ok(daysApart(found, date(known)) < 1.5, `${known}: found ${found.toISOString()}`);
	}
});

test("Jupiter and Saturn were a tenth of a degree apart on 21 December 2020, and met in December 1603", () => {
	const j = E.geocentric("Jupiter", new Date("2020-12-21T18:00:00Z")), s = E.geocentric("Saturn", new Date("2020-12-21T18:00:00Z"));
	assert.ok(Math.abs(angle(j, s) - 0.102) < 0.02, `separation ${angle(j, s).toFixed(3)}°`);
	// the conjunction Kepler watched (Table 2's years): 18 December 1603, in longitude
	const lon = (p, d) => E.longitude(E.geocentric(p, d));
	const met = E.nextZero((d) => lon("Jupiter", d) - lon("Saturn", d), date("1603-06-01"), 1);
	assert.ok(daysApart(met, date("1603-12-18")) < 3, `found ${met.toISOString()}`);
});

test("JPL's two tables agree where they overlap", () => {
	// Table 2, fitted over six thousand years, is the coarser: for Saturn by up to a third of a degree
	const tolerance = { Jupiter: 0.2, Saturn: 0.4, Uranus: 0.2 };
	for (let year = 1850; year <= 2050; year += 25) {
		const T = E.centuries(date(`${year}-01-01`));
		for (const p of E.PLANETS) {
			const a = E.heliocentric(p, T, E.TABLE1), b = E.heliocentric(p, T, E.TABLE2);
			assert.ok(angle(a, b) < (tolerance[p] || 0.1), `${p} in ${year}: ${angle(a, b).toFixed(3)}°`);
		}
	}
});

test("the orbits obey Kepler's third law, a³ = T² in au and years", () => {
	for (const p of E.PLANETS) {
		const a = E.TABLE1[p][0][0], T = E.period(p) / 365.25;
		assert.ok(Math.abs(a ** 3 / T ** 2 - 1) < 0.002, `${p}: ${(a ** 3 / T ** 2).toFixed(4)}`);
	}
	// and a planet stays on its ellipse: between perihelion and aphelion
	for (const p of E.PLANETS) {
		const { a, e } = E.elements(p, 0.26);
		for (let d = 0; d < 400; d++) {
			const r = Math.hypot(...E.heliocentric(p, 0.26 + d / 36525));
			assert.ok(r > a * (1 - e) - 1e-9 && r < a * (1 + e) + 1e-9, `${p}, day ${d}`);
		}
	}
});

test("Venus's cycle: 8 Earth years ≈ 13 Venus years ≈ 5 synodic periods, and the pentagram turns 2.4° in 8 years", () => {
	const S = E.synodic("Earth", "Venus");
	assert.ok(Math.abs(S - 583.92) < 0.05, `synodic ${S}`);
	const earth = 8 * E.period("Earth"), venus = 13 * E.period("Venus");
	assert.ok(Math.abs(earth / venus - 1) < 0.0004 && Math.abs(earth / (5 * S) - 1) < 0.001);
	// successive inferior conjunctions are 144° apart (5 × 144° = 720°), give or take 8° as
	// Earth's eccentric orbit makes the laps 580 to 588 days long; the fifth one on is 2.4° short
	// of the first
	const lonAt = (d) => E.longitude(E.heliocentric("Earth", d));
	let d = Orbits.nextMeeting("Venus", date("2020-01-01"), false);
	const lons = [lonAt(d)];
	for (let k = 0; k < 5; k++) {
		d = Orbits.nextMeeting("Venus", new Date(d.getTime() + 30 * DAY), false);
		lons.push(lonAt(d));
	}
	for (let k = 1; k <= 5; k++) assert.ok(Math.abs(E.wrap360(lons[k] - lons[k - 1]) - 216) < 9, `step ${k}: ${E.wrap360(lons[k] - lons[k - 1]).toFixed(1)}° (= −144°)`);
	const slip = E.wrap180(lons[5] - lons[0]);
	assert.ok(slip < -1.5 && slip > -3.5, `the pentagram turns ${slip.toFixed(2)}° in 8 years`);
});

test("Mars goes backwards around opposition, and forwards between", () => {
	const lon = (d) => E.longitude(E.geocentric("Mars", d));
	const motion = (s) => E.wrap180(lon(new Date(date(s).getTime() + DAY)) - lon(date(s)));
	assert.ok(motion("2025-01-16") < 0, "retrograde at opposition");
	assert.ok(motion("2024-10-01") > 0 && motion("2025-05-01") > 0, "prograde months away from it");
});

test("great conjunctions come every 19.9 years, 243° on, so the triangle turns ~9° a round from the moving equinox", () => {
	const orbits = new Orbits({ dance: "trigon", start: date("2026-09-26") });
	const { when, lon } = orbits.figure;
	assert.strictEqual(when.length, 41);
	assert.ok(when[0].getUTCFullYear() === 2020, `the first is the one of 2020, not ${when[0].toISOString()}`);
	const deg = lon.map((a) => a * (180 / Math.PI));
	// the conjunction of late 2020 was at the start of Aquarius, in longitude of date
	assert.ok(deg[0] > 300 && deg[0] < 303, `2020: ${deg[0].toFixed(1)}°`);
	let turn = 0;
	for (let k = 1; k < when.length; k++) {
		const years = (when[k] - when[k - 1]) / (365.25 * DAY);
		assert.ok(years > 18.5 && years < 21, `interval ${k}: ${years.toFixed(2)} years`);
		if (k % 3 === 0) turn += E.wrap180(deg[k] - deg[k - 3]);
	}
	const mean = turn / Math.floor((when.length - 1) / 3);
	assert.ok(mean > 7.5 && mean < 10.5, `turn per three: ${mean.toFixed(2)}°`);
	// In 40 steps (~800 years) the triangle turns a third of a turn, so each corner has moved on
	// to the next one's place and the meetings are back where they began: 40 × 243° ≈ 27 × 360°
	const back = E.wrap180(deg[40] - deg[0]);
	assert.ok(Math.abs(back) < 15, `after 40 steps: ${back.toFixed(1)}° from the first`);
});

test("every dance builds, fits, and is drawn in its time", () => {
	for (const dance of Orbits.DANCES) {
		const o = new Orbits({ dance: dance.key, start: date("2026-09-26"), orbitsSeconds: 22 });
		assert.strictEqual(o.dance.key, dance.key);
		for (const s of o.figure.series) {
			assert.ok(s.xy.every(Number.isFinite), `${dance.key}: coordinates`);
			assert.ok(s.t.every((t, i) => t >= 0 && t <= 1 && (i === 0 || t >= s.t[i - 1])), `${dance.key}: times in order`);
			const per = s.type === "lines" ? 4 : 2;
			assert.strictEqual(s.xy.length, s.t.length * per, `${dance.key}: one time per item`);
		}
		const text = [o.info.subtitle, ...o.info.equations].join(" ");
		assert.ok(!/NaN|undefined|Infinity/.test(text), `${dance.key}: ${text}`);
		assert.ok(!/NaN|undefined/.test(o.readout()), `${dance.key}: readout at the start`);
		// at 12 fps it is finished in its 22 s and the glow, and then rests
		let frames = 0;
		while (o.progress() < 1 && frames < 1000) { o.step(1 / 12); frames++; }
		assert.ok(frames <= Math.ceil((22 + 1.2) * 12) + 1, `${dance.key}: ${frames} frames`);
		assert.ok(!/NaN|undefined/.test(o.readout()), `${dance.key}: readout at the end`);
	}
});

test("each showing brings the next dance of a shuffled deck, all before any repeats", () => {
	const keys = Orbits.DANCES.map((d) => d.key);
	const seen = [];
	for (let k = 0; k < keys.length; k++) seen.push(new Orbits({ start: date("2026-09-26") }).dance.key);
	assert.deepStrictEqual([...seen].sort(), [...keys].sort());
	// and a list narrows it
	for (let k = 0; k < 4; k++) assert.ok(["venus", "mars"].includes(new Orbits({ orbitsDances: ["venus", "mars"] }).dance.key));
});
