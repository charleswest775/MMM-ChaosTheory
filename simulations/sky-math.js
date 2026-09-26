/* The sky from a place on Earth at a moment: sidereal time, precession, the Sun, the Moon and the
 * planets, altitudes and azimuths, phases, risings and settings. After Meeus, Astronomical
 * Algorithms (2nd ed., 1998):
 *   sidereal time (12.4); precession of equatorial coordinates from J2000 to the date (21.3);
 *   the Moon from the main terms of ELP-2000/82 (chapter 47), good to a few hundredths of a
 *     degree; the Sun and planets from JPL's elements (ephemeris.js), precessed to the date;
 *   planets' magnitudes (41, the Astronomical Almanac's 1984 formulas); the Moon's illuminated
 *     fraction and the position angle of its bright limb (48); refraction (Bennett, 16.4).
 * Angles in degrees unless named otherwise. UMD-style, so the tests can check it in Node.
 */
(function (root) {
	const E = root.ChaosEphemeris || require("./ephemeris.js");

	const D = Math.PI / 180;
	const sin = (x) => Math.sin(x * D), cos = (x) => Math.cos(x * D), tan = (x) => Math.tan(x * D);
	const asin = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / D, atan2 = (y, x) => Math.atan2(y, x) / D;
	const norm = E.wrap360;

	const jd = (date) => E.julian(date);
	const T = (date) => (jd(date) - 2451545.0) / 36525;

	// mean sidereal time at Greenwich (°)
	const gmst = (date) => {
		const d = jd(date) - 2451545.0, t = d / 36525;
		return norm(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t - (t * t * t) / 38710000);
	};

	// the mean obliquity of the ecliptic (°)
	const obliquity = (t) => 23.4392911 - (46.815 * t + 0.00059 * t * t - 0.001813 * t * t * t) / 3600;

	// ecliptic longitude/latitude → right ascension/declination (°), obliquity eps
	function eclipticToEquatorial (lon, lat, eps) {
		const ra = atan2(sin(lon) * cos(eps) - tan(lat) * sin(eps), cos(lon));
		const dec = asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon));
		return [norm(ra), dec];
	}

	// from the mean equator and equinox of J2000 to those of the date (rigorous, Meeus 21.3)
	function precess (ra, dec, t) {
		const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) / 3600;
		const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) / 3600;
		const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) / 3600;
		const A = cos(dec) * sin(ra + zeta);
		const B = cos(theta) * cos(dec) * cos(ra + zeta) - sin(theta) * sin(dec);
		const C = sin(theta) * cos(dec) * cos(ra + zeta) + cos(theta) * sin(dec);
		return [norm(atan2(A, B) + z), asin(C)];
	}

	// a geocentric ecliptic J2000 vector → RA/Dec of the date, and the distance (au)
	function vectorToDate (v, date) {
		const r = Math.hypot(...v), lon = E.longitude(v), lat = E.latitude(v);
		const [ra, dec] = eclipticToEquatorial(lon, lat, 23.4392911);
		const [a, d] = precess(ra, dec, T(date));
		return { ra: a, dec: d, dist: r };
	}

	// The Sun: RA/Dec of the date, corrected for aberration (−20.5″ in longitude)
	function sun (date) {
		const e = E.heliocentric("Earth", date), v = [-e[0], -e[1], -e[2]];
		const t = T(date), lon = E.longitude(v) + E.precession(t) - 20.4898 / 3600, lat = E.latitude(v);
		const [ra, dec] = eclipticToEquatorial(lon, lat, obliquity(t));
		return { ra, dec, dist: Math.hypot(...v), lon: norm(lon) };
	}

	// ---- the Moon (Meeus 47): the main periodic terms. [D, M, M′, F, Σl (10⁻⁶ °), Σr (10⁻³ km)]
	const LR = [
		[0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
		[0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
		[2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
		[2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
		[0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
		[0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
		[4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
		[1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
		[2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
		[0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
		[1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
		[0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
		[2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
		[3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
		[0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
		[2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
		[4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
		[0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
		[4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
		[1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
	];
	// [D, M, M′, F, Σb (10⁻⁶ °)]
	const B = [
		[0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
		[2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
		[2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
		[2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
		[2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
		[0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
		[0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
		[4, 0, 0, -1, 1021], [4, 0, -1, 1, 833]
	];

	// geocentric ecliptic longitude, latitude (of the date) and distance (km)
	function moonEcliptic (date) {
		const t = T(date);
		const Lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t * t + t ** 3 / 538841 - t ** 4 / 65194000;
		const Dm = 297.8501921 + 445267.1114034 * t - 0.0018819 * t * t + t ** 3 / 545868 - t ** 4 / 113065000;
		const M = 357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + t ** 3 / 24490000;
		const Mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t * t + t ** 3 / 69699 - t ** 4 / 14712000;
		const F = 93.2720950 + 483202.0175233 * t - 0.0036539 * t * t - t ** 3 / 3526000 + t ** 4 / 863310000;
		const Ec = 1 - 0.002516 * t - 0.0000074 * t * t;
		const A1 = 119.75 + 131.849 * t, A2 = 53.09 + 479264.29 * t, A3 = 313.45 + 481266.484 * t;
		let sl = 0, sr = 0, sb = 0;
		for (const [d, m, mp, f, l, r] of LR) {
			const arg = d * Dm + m * M + mp * Mp + f * F, e = Math.abs(m) === 1 ? Ec : Math.abs(m) === 2 ? Ec * Ec : 1;
			sl += l * e * sin(arg); sr += r * e * cos(arg);
		}
		for (const [d, m, mp, f, b] of B) {
			const arg = d * Dm + m * M + mp * Mp + f * F, e = Math.abs(m) === 1 ? Ec : Math.abs(m) === 2 ? Ec * Ec : 1;
			sb += b * e * sin(arg);
		}
		sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
		sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
		return { lon: norm(Lp + sl / 1e6), lat: sb / 1e6, dist: 385000.56 + sr / 1000 };
	}

	function moon (date) {
		const { lon, lat, dist } = moonEcliptic(date);
		const [ra, dec] = eclipticToEquatorial(lon, lat, obliquity(T(date)));
		return { ra, dec, dist, lon, lat, parallax: asin(6378.14 / dist) };
	}

	// the Moon's illuminated fraction and the position angle of its bright limb (from north, east)
	function moonPhase (date) {
		const m = moon(date), s = sun(date);
		const cosPsi = sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra);
		const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) / D; // elongation
		const R = s.dist * 149597870.7;
		const i = atan2(R * sin(psi), m.dist - R * cos(psi));   // phase angle
		const chi = atan2(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra));
		const waxing = norm(m.lon - s.lon) < 180;
		return { fraction: (1 + cos(i)) / 2, phaseAngle: i, elongation: psi, brightLimb: norm(chi), waxing, moonLon: m.lon, sunLon: s.lon };
	}

	// The next moment after `from` when the Moon is `angle` degrees east of the Sun in longitude
	// (0 new, 90 first quarter, 180 full, 270 last quarter)
	function nextPhase (from, angle) {
		const f = (d) => { const p = moonEcliptic(d).lon - sun(d).lon - angle; return E.wrap180(p); };
		return E.nextZero(f, from, 0.5, 40);
	}

	// ---- the planets

	// magnitudes (Astronomical Almanac 1984): r, Δ in au, i the phase angle (°)
	const MAG = {
		Mercury: (i) => -0.42 + 0.038 * i - 0.000273 * i * i + 0.000002 * i ** 3,
		Venus: (i) => -4.40 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3,
		Mars: (i) => -1.52 + 0.016 * i,
		Jupiter: (i) => -9.40 + 0.005 * i,
		Saturn: (i) => -8.88 + 0.044 * i,
		Uranus: () => -7.19,
		Neptune: () => -6.87
	};

	function planet (name, date) {
		const h = E.heliocentric(name, date), e = E.heliocentric("Earth", date), g = [h[0] - e[0], h[1] - e[1], h[2] - e[2]];
		const { ra, dec, dist } = vectorToDate(g, date), r = Math.hypot(...h), R = Math.hypot(...e);
		const i = Math.acos(Math.max(-1, Math.min(1, (r * r + dist * dist - R * R) / (2 * r * dist)))) / D;
		return { ra, dec, dist, mag: MAG[name](i) + 5 * Math.log10(r * dist), phaseAngle: i };
	}

	// ---- where it is in the sky

	// altitude and azimuth (from north through east) at latitude lat, east longitude lon
	function horizontal (ra, dec, lat, lon, date) {
		const H = norm(gmst(date) + lon - ra);
		const alt = asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));
		const az = norm(atan2(-cos(dec) * sin(H), sin(dec) * cos(lat) - cos(dec) * sin(lat) * cos(H)));
		return { alt, az, H };
	}

	// how much refraction lifts an object at true altitude h (°): Bennett's formula
	const refraction = (h) => (h < -2 ? 0 : 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D) / 60);

	// the Moon seen from the ground: its geocentric altitude lowered by parallax, then refracted
	function moonHorizontal (lat, lon, date) {
		const m = moon(date), h = horizontal(m.ra, m.dec, lat, lon, date);
		const topo = h.alt - m.parallax * cos(h.alt);
		return { ...h, alt: topo + refraction(topo), geoAlt: h.alt };
	}

	// the next time after `from` (within `hours`) the body's altitude crosses h0 going up (rise) or
	// down (set): altitude(date) → degrees
	function crossing (altitude, from, h0, rising, hours = 26) {
		const step = 10 * 60000;
		let t0 = from.getTime(), a0 = altitude(new Date(t0)) - h0;
		for (let t = t0 + step; t <= t0 + hours * 3600000; t += step) {
			const a = altitude(new Date(t)) - h0;
			if ((rising && a0 < 0 && a >= 0) || (!rising && a0 > 0 && a <= 0)) {
				let lo = t - step, hi = t;
				for (let k = 0; k < 30; k++) {
					const mid = (lo + hi) / 2, am = altitude(new Date(mid)) - h0;
					if ((am < 0) === rising) lo = mid; else hi = mid;
				}
				return new Date((lo + hi) / 2);
			}
			a0 = a;
		}
		return null;
	}

	const sunAltitude = (lat, lon) => (d) => { const s = sun(d); return horizontal(s.ra, s.dec, lat, lon, d).alt; };
	const moonAltitude = (lat, lon) => (d) => moonHorizontal(lat, lon, d).alt;

	// ---- the chart: stereographic from the zenith, north up, east left (as seen lying on your
	// back, head to the north); the horizon at radius 1
	function project (alt, az) {
		const z = 90 - alt, r = Math.tan((z / 2) * D);
		return [-r * sin(az), -r * cos(az)]; // x right, y down: east (az 90) to the left, north up
	}

	// the direction on the chart (unit vector) from a point at (alt, az) towards another along the
	// great circle joining them, e.g. the Moon's bright limb towards the Sun
	function chartDirection (from, to) {
		const vec = ({ alt, az }) => [cos(alt) * sin(az), cos(alt) * cos(az), sin(alt)];
		const a = vec(from), b = vec(to), dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
		// a little way along the great circle from a towards b
		const w = b.map((v, i) => v - dot * a[i]), n = Math.hypot(...w) || 1, eps = 0.01;
		const p = a.map((v, i) => v * Math.cos(eps) + (w[i] / n) * Math.sin(eps));
		const alt = asin(p[2]), az = norm(atan2(p[0], p[1]));
		const [x0, y0] = project(from.alt, from.az), [x1, y1] = project(alt, az), L = Math.hypot(x1 - x0, y1 - y0) || 1;
		return [(x1 - x0) / L, (y1 - y0) / L];
	}

	const SkyMath = {
		jd, T, gmst, obliquity, eclipticToEquatorial, precess, sun, moon, moonEcliptic, moonPhase, nextPhase,
		planet, horizontal, refraction, moonHorizontal, crossing, sunAltitude, moonAltitude, project, chartDirection
	};
	root.ChaosSkyMath = SkyMath;
	if (typeof module !== "undefined") module.exports = SkyMath;
})(typeof window !== "undefined" ? window : globalThis);
