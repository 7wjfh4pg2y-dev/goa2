// Base pack: the "Fantasy Warrior" — a caped swordsman with a curved blade and cyan lightning slashes.
// 162 × 162 cells, facing right, feet on y = 101, ~45 px tall. No block / defend frames (the shared Defend is
// composed from the hit pose, see lib/anims.mjs). Every BODY colour appears in Idle; anything else is an effect
// (the cyan slash fills and the white / grey lightning) — the `torrent` pass reads it that way.
export default {
	id: 'fantasy-warrior',
	name: 'Fantasy Warrior',
	cell: 162,
	foot: 101,
	bg: [],
	sheets: {
		idle: 'Idle.png',
		run: 'Run.png',
		attack: 'Attack2.png', // the main Attack (the user's pick, 2026-11-26)
		attack1: 'Attack1.png',
		attack3: 'Attack3.png',
		jump: 'Jump.png',
		fall: 'Fall.png',
		hit: 'Take hit.png',
		death: 'Death.png'
	},
	attackName: 'Attack',
	attack: { holds: [0, 1, 0, 1, 0, 1, 1], release: null },
	// source colours by material, light → dark
	materials: {
		crown: ['#F1EBF5', '#D4CFD7', '#BCB2C2', '#CDC7BC'], // white hair (+ the eye highlights)
		skin: ['#9E8F72', '#8B7C5E'],
		collar: ['#D6DFD8', '#A5A69B'], // fur collar
		tunic: ['#24463F', '#1B392B', '#242F21', '#0B1B16'],
		under: ['#101511', '#0B130B', '#07100D', '#040804'], // trousers, belt, shadows
		leather: ['#4C252C', '#411F22', '#341510', '#2F1618'], // gloves, sleeves, boots
		buckle: ['#664C4E', '#51393A'],
		cape: ['#334F6C', '#34374C'],
		blade: ['#D2DDF7', '#7F89A0'],
		hilt: ['#112124']
	},
	// effect colours: the slash fill; everything else that is not a material is lightning
	fx: { fill: ['#2DFFF3'] }
};
