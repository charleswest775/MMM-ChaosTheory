/* Where the planets are: JPL's "Keplerian Elements for Approximate Positions of the Major
 * Planets" (E. M. Standish, JPL/Caltech). Each planet's orbit is an ellipse whose six elements
 * drift linearly with time, fitted to JPL's DE ephemeris:
 *   Table 1, for 1800–2050: errors of a few arcseconds (Mercury, Venus, Earth) to a few
 *     arcminutes (Saturn);
 *   Table 2, for 3000 BC – AD 3000: coarser, with extra periodic terms for the great
 *     Jupiter–Saturn inequality.
 * Table 1 is used inside its range, Table 2 outside it.
 *
 * Positions are heliocentric, in au, in the ecliptic and equinox of J2000 (x towards the
 * vernal equinox, z towards the ecliptic north pole). "Earth" is the Earth–Moon barycentre,
 * at most 4700 km from the Earth's centre. Dates are JavaScript Dates (UT; the minute or so
 * between UT and the ephemeris's TT is ignored). UMD-style, so the tests run it in Node.
 */
(function (root) {
	const D = Math.PI / 180;
	const J2000 = 2451545.0;

	// [a (au), e, I (°), L (°), ϖ (°), Ω (°)] at J2000, and their rates per Julian century
	const TABLE1 = {
		Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
			[0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
		Venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
			[0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
		Earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
			[0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
		Mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
			[0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
		Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
			[-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
		Saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
			[-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
		Uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
			[-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
		Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
			[0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]]
	};

	const TABLE2 = {
		Mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819],
			[0.00000000, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
		Venus: [[0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496],
			[-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174]],
		Earth: [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389],
			[-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856]],
		Mars: [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984],
			[0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
		Jupiter: [[5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654],
			[-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
		Saturn: [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702],
			[-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
		Uranus: [[19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215],
			[-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
		Neptune: [[30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853],
			[0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302]]
	};
	// Table 2's extra terms in the mean anomaly: M = L − ϖ + bT² + c cos(fT) + s sin(fT)
	const EXTRA = {
		Jupiter: [-0.00012452, 0.06064060, -0.35635438, 38.35125000],
		Saturn: [0.00025899, -0.13434469, 0.87320147, 38.35125000],
		Uranus: [0.00058331, -0.97731848, 0.17689245, 7.67025000],
		Neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025000]
	};

	const PLANETS = Object.keys(TABLE1);

	const julian = (date) => date.getTime() / 86400000 + 2440587.5;
	const fromJulian = (jd) => new Date((jd - 2440587.5) * 86400000);
	// Julian centuries from J2000
	const centuries = (date) => (julian(date) - J2000) / 36525;
	const wrap180 = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
	const wrap360 = (deg) => ((deg % 360) + 360) % 360;

	// The elements at T centuries from J2000: { a, e, I, Omega, omega (argument of perihelion), M }
	// in au and degrees, from Table 1 inside its years and Table 2 outside (or from the one given)
	function elements (name, T, table = T >= -2 && T <= 0.5 ? TABLE1 : TABLE2) {
		const [e0, rate] = table[name];
		const [a, e, I, L, varpi, Omega] = e0.map((v, i) => v + rate[i] * T);
		let M = L - varpi;
		if (table === TABLE2 && EXTRA[name]) {
			const [b, c, s, f] = EXTRA[name];
			M += b * T * T + c * Math.cos(f * T * D) + s * Math.sin(f * T * D);
		}
		return { a, e, I, Omega, omega: varpi - Omega, M: wrap180(M) };
	}

	// Kepler's equation M = E − e sin E, by Newton's method (M, E in radians)
	function eccentricAnomaly (M, e) {
		let E = M + e * Math.sin(M);
		for (let k = 0; k < 20; k++) {
			const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
			E -= dE;
			if (Math.abs(dE) < 1e-14) break;
		}
		return E;
	}

	// heliocentric [x, y, z] in au, ecliptic J2000, of a planet at a Date (or at T centuries)
	function heliocentric (name, when, table) {
		const T = when instanceof Date ? centuries(when) : when;
		const { a, e, I, Omega, omega, M } = elements(name, T, table);
		const E = eccentricAnomaly(M * D, e);
		// in the plane of the orbit, x towards perihelion
		const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
		const cw = Math.cos(omega * D), sw = Math.sin(omega * D);
		const cO = Math.cos(Omega * D), sO = Math.sin(Omega * D);
		const cI = Math.cos(I * D), sI = Math.sin(I * D);
		return [
			(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
			(cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
			sw * sI * xp + cw * sI * yp
		];
	}

	// where planet `name` (or "Sun") is seen from Earth: [x, y, z] in au, ecliptic J2000
	function geocentric (name, when) {
		const e = heliocentric("Earth", when);
		if (name === "Sun") return [-e[0], -e[1], -e[2]];
		const p = heliocentric(name, when);
		return [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
	}

	// ecliptic longitude and latitude (°) of a vector
	const longitude = ([x, y]) => wrap360(Math.atan2(y, x) / D);
	const latitude = ([x, y, z]) => Math.atan2(z, Math.hypot(x, y)) / D;

	// How far the equinox has moved along the ecliptic since J2000, in degrees, T centuries on:
	// the general precession in longitude (IAU 2006), ~1.4° a century. Add it to a J2000
	// longitude to measure it from the equinox of the date, as the zodiac's signs are.
	const precession = (T) => (5028.796195 * T + 1.1054348 * T * T) / 3600;

	// sidereal period in days, from the mean longitude's rate (Table 1)
	const period = (name) => (360 / TABLE1[name][1][3]) * 36525;
	// the time between successive conjunctions of two planets (days): 1/S = |1/T₁ − 1/T₂|
	const synodic = (a, b) => 1 / Math.abs(1 / period(a) - 1 / period(b));

	// The next time after `from` (a Date) that f(date) (an angle in degrees) crosses zero going
	// up, stepping by `step` days and then refining by bisection. For conjunctions and oppositions.
	function nextZero (f, from, step, limitDays = 40000) {
		const t0 = julian(from);
		let prev = wrap180(f(fromJulian(t0)));
		for (let t = t0 + step; t < t0 + limitDays; t += step) {
			const cur = wrap180(f(fromJulian(t)));
			if (prev < 0 && cur >= 0 && cur - prev < 180) {
				let lo = t - step, hi = t;
				for (let k = 0; k < 50; k++) {
					const mid = (lo + hi) / 2;
					if (wrap180(f(fromJulian(mid))) < 0) lo = mid; else hi = mid;
				}
				return fromJulian((lo + hi) / 2);
			}
			prev = cur;
		}
		return null;
	}

	const Ephemeris = {
		PLANETS, TABLE1, TABLE2, julian, fromJulian, centuries, elements, eccentricAnomaly,
		heliocentric, geocentric, longitude, latitude, precession, period, synodic, nextZero, wrap180, wrap360
	};
	root.ChaosEphemeris = Ephemeris;
	if (typeof module !== "undefined") module.exports = Ephemeris;
})(typeof window !== "undefined" ? window : globalThis);
