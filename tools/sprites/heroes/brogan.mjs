// Brogan, the Destroyer — third hero (2026-11-26). Base: Martial Hero 3 (a bare-chested swordsman with a long braid).
// Card art (19 cards + the splash, all him): a huge bare-armed northern brute — FIERY RED hair in a topknot / long
// braid and a big red BEARD, tanned muscled arms, dark iron pauldrons with fur (not drawable here: no shoulder piece
// in the pack), a heavy leather belt, a RED kilt / sash cloth hanging to the knees, dark leather trousers and boots,
// a round iron-rimmed shield (not in the pack — he fights two-handed here) and either a broadsword (splash) or a
// double-headed axe (gold) — the pack's heavy blade stands in as the broadsword. So: the braid → red, the skin under
// the eye → the beard (`beard`: the face's own pixels, nothing drawn), the olive loincloth → his red kilt, the grey
// sash → a studded leather belt, trousers + boots → dark leathers, the lavender blade → cold steel, the white slash
// crescents → a hot ember-white (his fury), the skin stays the pack's tan.
export default {
	id: 'brogan',
	name: 'Brogan',
	base: 'martial-hero-3',
	palette: {
		hair: ['#c8471d', '#7a2410'], // flame red, deep rust (the braid's two tones)
		blade: ['#e4e8ee', '#c5ccd6', '#959eab', '#6c7380'],
		hilt: ['#3a2414', '#1e120a'],
		sash: ['#8a5a32', '#5e3a1e'],
		kilt: ['#a8261b'],
		boots: ['#6e4a2c', '#583a22', '#3a1a10'],
		pants: ['#4a3426', '#46301f', '#3c281a', '#2e1e14', '#2a1a12', '#1c110b'],
		slash: ['#fff0dc']
	},
	projectile: { glow: '#ff9a4a' },
	skip: { gear: { death: 4 } }, // lying down: no beard rule
	passes: [
		['hair', { not: 'hilt', small: 8 }],
		['recolor'],
		['beard', { depth: 3, back: 2, fwd: 4, colors: { hi: '#d4572a', mid: '#a83a1a', dk: '#6e200e' } }]
	],
	chips: [['Flame hair', '#c8471d'], ['Red beard', '#b8431c'], ['Kilt', '#a8261b'], ['Leather', '#8a5a32'], ['Steel', '#c5ccd6'], ['Ember slash', '#ff9a4a']],
	blurb: 'A bare-armed brute with a flame-red braid and beard, a red kilt over dark leathers and a heavy steel blade — his slashes burn ember-white.'
};
