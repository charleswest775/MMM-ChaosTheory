// Checks for the sky page: the astronomy against Meeus's worked examples and the dates of
// eclipses, the chart's projection, the star data, and the choice of time. Run: node --test
const test = require("node:test");
const assert = require("node:assert");
const M = require("../simulations/sky-math.js");
const STARS = require("../data/stars.js");
const STORIES = require("../data/star-stories.js");
const { Sky } = require("../simulations/sky.js");

const close = (a, b, tol) => Math.abs(a - b) <= tol;
const RENO = { skyLatitude: 39.5296, skyLongitude: -119.8138, skyPlace: "Reno" };

test("sidereal time and the Sun match Meeus's worked examples", () => {
	// Example 12.a: 1987 April 10, 0h UT: 13h 10m 46.3668s
	assert.ok(close(M.gmst(new Date("1987-04-10T00:00:00Z")), (13 + 10 / 60 + 46.3668 / 3600) * 15, 1e-5));
	// Example 25.b (VSOP87): 1992 October 13, 0h TD: α = 13h 13m 30.749s, δ = −7° 47′ 01.74″
	const s = M.sun(new Date("1992-10-13T00:00:00Z"));
	assert.ok(close(s.ra, (13 + 13 / 60 + 30.749 / 3600) * 15, 0.01) && close(s.dec, -(7 + 47 / 60 + 1.74 / 3600), 0.01), `${s.ra}, ${s.dec}`);
});

test("the Moon matches Meeus's example 47.a, and its phases the eclipses of 2026", () => {
	const m = M.moonEcliptic(new Date("1992-04-12T00:00:00Z"));
	assert.ok(close(m.lon, 133.162655, 0.0005) && close(m.lat, -3.229126, 0.002) && close(m.dist, 368409.7, 1), JSON.stringify(m));
	for (const [from, angle, known] of [
		["2026-02-15", 0, "2026-02-17T12:01Z"],   // annular eclipse
		["2026-03-01", 180, "2026-03-03T11:38Z"], // total lunar eclipse
		["2026-08-10", 0, "2026-08-12T17:37Z"],   // total solar eclipse
		["2026-08-26", 180, "2026-08-28T04:18Z"]  // partial lunar eclipse
	]) {
		const t = M.nextPhase(new Date(`${from}T00:00:00Z`), angle);
		assert.ok(Math.abs(t - new Date(known)) < 3 * 60000, `${known}: ${t.toISOString()}`);
	}
});

test("precession moves the equinox 1.397° a century along the ecliptic", () => {
	for (const lon of [0, 73, 190, 300]) {
		const [ra, dec] = M.eclipticToEquatorial(lon, 0, 23.4392911);
		const [a, d] = M.precess(ra, dec, 1);
		// back to ecliptic longitude, with the obliquity of the date
		const eps = M.obliquity(1) * (Math.PI / 180), r = Math.PI / 180;
		const back = (Math.atan2(Math.sin(a * r) * Math.cos(eps) + Math.tan(d * r) * Math.sin(eps), Math.cos(a * r)) / r + 360) % 360;
		assert.ok(close(((back - lon + 540) % 360) - 180, 1.3969, 0.002), `λ ${lon}: ${back - lon}`);
	}
});

test("the chart: the zenith at the centre, the horizon at the rim, north up and east on the left", () => {
	assert.deepStrictEqual(M.project(90, 0).map((v) => Math.round(v * 1e9) / 1e9 + 0), [0, 0]);
	const [nx, ny] = M.project(0, 0), [ex, ey] = M.project(0, 90);
	assert.ok(close(nx, 0, 1e-12) && close(ny, -1, 1e-12), "north at the top");
	assert.ok(close(ex, -1, 1e-12) && close(ey, 0, 1e-12), "east on the left");
	assert.ok(close(Math.hypot(...M.project(45, 123)), Math.tan((22.5 * Math.PI) / 180), 1e-12), "stereographic");
});

test("the star data: the brightest stars in order, figures joining nearby stars, the stories' stars all there", () => {
	const name = (i) => Object.keys(STARS.names).find((n) => STARS.names[n] === i);
	assert.deepStrictEqual([0, 1, 2].map(name), ["Sirius", "Canopus", "Arcturus"]);
	const polaris = STARS.stars[STARS.names.Polaris];
	assert.ok(close(polaris[1], 89.264, 0.01), `Polaris at ${polaris[1]}`);
	assert.strictEqual(STARS.figures.length, 88);
	const r = Math.PI / 180;
	for (const f of STARS.figures) {
		for (const [a, b] of f.lines) {
			const [ra1, d1] = STARS.stars[a], [ra2, d2] = STARS.stars[b];
			const sep = Math.acos(Math.min(1, Math.sin(d1 * r) * Math.sin(d2 * r) + Math.cos(d1 * r) * Math.cos(d2 * r) * Math.cos((ra1 - ra2) * r))) / r;
			assert.ok(sep > 0 && sep < 40, `${f.abbr}: a line of ${sep.toFixed(1)}°`);
		}
	}
	for (const s of STORIES) {
		assert.ok(STARS.names[s.name] !== undefined, `${s.name} is in the catalogue`);
		assert.ok(s.text.length <= 260 && !/[<>&]/.test(s.text), `${s.name}: story`);
	}
});

test("star colours run from blue to orange with B − V", () => {
	const [br, , bb] = Sky.starColour(-0.3), [or, , ob] = Sky.starColour(1.6), sun = Sky.starColour(0.65);
	assert.ok(bb > br && or > ob, "hot stars bluer, cool ones redder");
	assert.ok(sun[0] >= sun[2] && sun[2] > 200, `the Sun's colour is a pale yellow-white: ${sun}`);
});

test("by day it charts tonight; after dark, now; and it knows a Harvest Moon", () => {
	const day = new Sky({ ...RENO, now: "2026-09-26T19:00:00Z" });   // noon in Reno
	assert.ok(!day.live && day.when > day.clock, "by day: tonight");
	assert.ok(close(M.sunAltitude(RENO.skyLatitude, RENO.skyLongitude)(day.when), -12, 0.05), "as it gets dark");
	const night = new Sky({ ...RENO, now: "2026-09-27T06:00:00Z" }); // 11 pm
	assert.ok(night.live && +night.when === +night.clock, "after dark: now");
	assert.ok(/Harvest Moon/.test(day.info.equations.join(" ")), "the full moon of 26 September 2026");
	const hunters = new Sky({ ...RENO, now: "2026-10-26T19:00:00Z" });
	assert.ok(/Hunter's Moon/.test(hunters.info.equations.join(" ")), "and the one after it");
	for (const s of [day, night, hunters]) {
		assert.ok(!/NaN|undefined|Invalid/.test([s.info.title, s.info.subtitle, ...s.info.equations, s.readout()].join(" ")));
		assert.ok(s.visibleStars().length > 800 && s.visibleFigures().length > 25);
	}
});
