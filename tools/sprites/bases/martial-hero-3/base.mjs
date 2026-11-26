// Base pack: "Martial Hero 3" (CC0) — a bare-chested swordsman with a long black braid, baggy trousers, an olive
// loincloth over a grey sash and a heavy blade; white crescent slashes. 126 × 126 cells, facing right, feet on y = 82,
// ~39 px tall, drawn at the same scale as the Fantasy Warrior / Huntress (torso ~10–12 px, face ~4, arms 2–3).
// His arm is skin-coloured and joined to the body, so the rig finds the free HAND (the forward-most skin pixel)
// instead of lifting an arm piece.
export default {
	id: 'martial-hero-3',
	name: 'Martial Hero 3',
	cell: 126,
	foot: 82,
	bg: [],
	sheets: {
		idle: 'Idle.png',
		run: 'Run.png',
		attack: 'Attack1.png', // the overhead chop
		attack2: 'Attack2.png',
		attack3: 'Attack3.png',
		jump: 'Going Up.png',
		fall: 'Going Down.png',
		hit: 'Take Hit.png',
		death: 'Death.png'
	},
	attackName: 'Attack',
	attack: { holds: [1, 1, 0, 1, 0, 0, 1], release: null },
	// the pose stage: no separate arm piece; the sash's first row is where the lean starts; crouches 10 rows above the feet
	rig: { hip: 'sash', hand: 'skin', knee: 10 },
	// Defend: Attack3's wind-up = the artist's own pose of the sword drawn back, free hand thrust forward
	guard: { sheet: 'attack3', lead: [0, 1], frames: [2, 3] },
	// source colours by material, light → dark
	materials: {
		hair: ['#181624', '#0b0a10'], // the braid; #0b0a10 is also the hilt's shadow — the hair pass sorts them
		eye: ['#ffffff'],
		skin: ['#f2b898', '#e7af91', '#dfa98c', '#dca78a', '#cf9d82', '#c4957b', '#c09279', '#b98c74', '#b68a73', '#b58972', '#b48971', '#b7876e', '#b2836b', '#a37b65', '#a17761', '#9b7654', '#997460', '#8f6a56', '#896856', '#836352', '#83614f', '#7e5e4c'],
		blade: ['#cfc7e9', '#b8b1cf', '#9a9ab5', '#7d7d93'],
		hilt: ['#201d2f', '#12101a'],
		sash: ['#84866f', '#6e6f5c'],
		kilt: ['#4d5131'],
		boots: ['#5e5a32', '#56522d', '#454225'], // #454225 also outlines the loincloth
		pants: ['#2f2b3a', '#2b2735', '#23202e', '#1a1725', '#181620', '#0e0d15'],
		slash: ['#fafaff']
	}
};
