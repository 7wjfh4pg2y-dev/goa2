// Brogan, the Destroyer — rebuilt 2026-11-26 on the user's recipe: the ORC BRUTE's body, the SPARTAN's shield, the
// GLADIATOR's armour and the MINOTAUR BRUTE's axe (all four from the CraftPix reels in the Animation studio — one
// family, one pixel scale, so the parts fit as cut). Card art (19 cards + the splash): a huge bare-armed northern
// brute — FIERY RED hair in a topknot, a big red BEARD, tanned muscled arms, a heavy leather belt, a RED kilt to the
// knees, a round iron-rimmed shield and a broadsword / double axe. So: the orc's skin → a weathered tan, his topknot →
// flame red, the face's own pixels under the eye → the beard (tusks under it go red too), the green loincloth → the
// Gladiator's crimson skirt, the one-tone wraps → the Gladiator's bronze greaves and bracers (the belt and the haft
// in the Minotaur's leather), the spear head → the Minotaur Brute's axe head, the Spartan's bronze shield on the
// free forearm.
export default {
	id: 'brogan',
	name: 'Brogan',
	base: 'orc-brute',
	palette: {
		hair: ['#c8471d', '#7a2410'],
		tie: ['#e6aa49'],
		skin: ['#f4b17b', '#db8652', '#b8693f', '#7f3f38', '#6a3329', '#57312b', '#c87346'],
		kilt: ['#87102a', '#4a0e16'],
		head: ['#c6c8df', '#444563']
	},
	projectile: { glow: '#e6aa49' },
	noWard: true, // he has a real shield: Defend needs no drawn ward
	skip: { gear: { death: 2 } }, // lying down: no beard rule
	passes: [
		['hair', { not: 'outline', small: 0 }],
		['recolor'],
		['beard', { from: 2, depth: 5, back: 5, fwd: 3, light: 300, mid: 220, also: ['#fff1c0'], colors: { hi: '#e0703a', mid: '#c8471d', dk: '#9a3315' } }],
		['wraps', { material: 'wraps', legs: 22, bracer: '#c87630', greave: '#c87630', shaft: '#57312b' }],
		['axe', { head: ['#d1b18a', '#7f6756'], part: 'axe-minotaur', anchor: [9, 11], axis: [22, -8], side: 1, stub: 3 }],
		['shield', { part: 'shield-spartan', arm: ['idle', 'attack2', 'attack1'], front: ['crouch'] }]
	],
	chips: [['Flame hair', '#c8471d'], ['Red beard', '#a83a1a'], ['Crimson kilt', '#87102a'], ['Bronze', '#c87630'], ['Spartan shield', '#e6aa49'], ['Minotaur axe', '#444563']],
	blurb: 'The Orc Brute’s frame with a flame-red topknot and beard, the Gladiator’s bronze and crimson, the Spartan’s round shield and the Minotaur Brute’s axe.'
};
