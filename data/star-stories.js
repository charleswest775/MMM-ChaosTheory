/* Stories of stars you can see from mid-northern latitudes, one shown per showing of the sky page
 * (the next in a shuffled deck that is well above the horizon at the time charted).
 *   name   as in data/stars.js (IAU proper names)
 *   ly     distance in light years, rounded; null where too uncertain for "the light left in …"
 *   text   what's interesting about it
 * Written for this module; hand-edited, so keep tests/sky.test.js passing.
 */
(function (root) {
	const STORIES = [
		{ name: "Sirius", ly: 8.6, text: "The brightest star of the night sky. Bessel saw it wobble in 1844 and guessed at an unseen companion; Alvan Graham Clark found it in 1862, testing a new lens: Sirius B, the first white dwarf, where a teaspoonful weighs tonnes." },
		{ name: "Arcturus", ly: 36.7, text: "Its light switched on the 1933 Chicago World's Fair: telescopes caught it and turned it into current, light thought to have set out in 1893, the year of the city's previous fair." },
		{ name: "Vega", ly: 25, text: "The first star after the Sun to be photographed (Harvard, 1850) and the first whose spectrum was (Henry Draper, 1872). In about 12,000 years precession will make it the pole star." },
		{ name: "Capella", ly: 42.9, text: "Not one star but four: two yellow giants circling each other every 104 days, far too close to see apart, and a pair of red dwarfs well away from them." },
		{ name: "Rigel", ly: 860, text: "A blue supergiant tens of thousands of times as bright as the Sun: Orion's left foot, and usually his brightest star, though Betelgeuse got the name α." },
		{ name: "Betelgeuse", ly: null, text: "A red supergiant so big that in the Sun's place it would reach past the orbit of Mars. In 2019–20 it dimmed by more than half, veiled by dust it had thrown off. One day it will explode as a supernova." },
		{ name: "Aldebaran", ly: 65, text: "\"The follower\" in Arabic: it follows the Pleiades across the sky. The Pioneer 10 probe is heading its way and will pass it in about two million years." },
		{ name: "Antares", ly: 550, text: "\"Rival of Mars\" in Greek, for its red colour: a red supergiant hundreds of times the Sun's width, at the heart of the Scorpion." },
		{ name: "Spica", ly: 250, text: "Around 130 BC Hipparchus compared its position with one recorded 150 years before, found it had moved, and so discovered the precession of the equinoxes." },
		{ name: "Altair", ly: 16.7, text: "It spins in under 9 hours, so fast that it bulges, a fifth or more wider at the equator than pole to pole. In 2007 it was the first star of its kind besides the Sun to have its surface imaged, bulge and all." },
		{ name: "Deneb", ly: null, text: "One of the most luminous stars known, tens of thousands of times the Sun, and so far away its distance is still uncertain. With Vega and Altair it makes the Summer Triangle." },
		{ name: "Polaris", ly: 430, text: "Less than a degree from the celestial pole, so it barely moves. Precession carries the pole round; when the pyramids were built, the pole star was Thuban, in Draco." },
		{ name: "Regulus", ly: 79, text: "It spins once in 16 hours, at over nine tenths of the speed that would tear it apart, and is squashed by it." },
		{ name: "Pollux", ly: 34, text: "An orange giant with a planet more than twice Jupiter's mass, found in 2006. Its twin, Castor, is fainter and nothing like it." },
		{ name: "Castor", ly: 51, text: "Six stars in one: three pairs, each circling its partner, and the pairs circling each other." },
		{ name: "Procyon", ly: 11.5, text: "\"Before the dog\" in Greek: it rises just before Sirius, the Dog Star. Like Sirius it has a white dwarf companion." },
		{ name: "Fomalhaut", ly: 25, text: "Ringed by a belt of dust like our Kuiper belt. A \"planet\" seen in it in 2008 turned out to be a spreading cloud of dust, perhaps from a collision." },
		{ name: "Mizar", ly: 83, text: "With faint Alcor beside it, the horse and rider: an old test of eyesight. Mizar was the first double star seen through a telescope (1617) and the first photographed (1857)." },
		{ name: "Dubhe", ly: 123, text: "With Merak, the Pointers: the line through them leads to Polaris. Five of the Big Dipper's seven stars travel through space together." },
		{ name: "Algol", ly: 90, text: "\"The demon's head\": every 2.87 days it fades by two thirds for ten hours as its companion passes in front. John Goodricke, 18 and deaf, explained it that way in 1783." },
		{ name: "Alcyone", ly: 440, text: "The brightest of the Pleiades, the Seven Sisters, a young cluster of about a thousand stars; most eyes see six. In Japanese they are Subaru, whose badge they are." },
		{ name: "Albireo", ly: 430, text: "Gold and blue: in a small telescope, one of the finest double stars in the sky, at the foot of the Northern Cross." },
		{ name: "Alnilam", ly: null, text: "The middle of Orion's Belt: Alnitak, Alnilam and Mintaka are all hot blue stars hundreds of times farther away than Sirius." },
		{ name: "Denebola", ly: 36, text: "\"The lion's tail\". It is young, a few hundred million years old, and ringed by dust, the debris of making planets." },
		{ name: "Alpheratz", ly: 97, text: "It is shared: the head of Andromeda and a corner of the Great Square of Pegasus. Andromeda's galaxy, 2.5 million light years off, is a fuzzy patch nearby." },
		{ name: "Alphecca", ly: 75, text: "The jewel of the Northern Crown. Its neighbour T Coronae Borealis, usually far too faint to see, flares up to naked-eye brightness about every 80 years, as it did in 1866 and 1946." },
		{ name: "Rasalhague", ly: 49, text: "\"The head of the serpent charmer\", Ophiuchus, the constellation the Sun passes through for three weeks each year but not a sign of the zodiac." }
	];
	root.ChaosStarStories = STORIES;
	if (typeof module !== "undefined") module.exports = STORIES;
})(typeof window !== "undefined" ? window : globalThis);
