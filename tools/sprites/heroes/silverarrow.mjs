// Silverarrow, the Wind Spirit — the first hero, approved 2026-11-25.
// Card art (20 paintings; two of the blue cards show a water mage — not her): copper-orange hair in a HIGH PONYTAIL
// tied with teal bands, pointed elf ears, olive-green leathers, emerald thigh boots, a ridged leather pauldron with a
// teal rivet, wrapped bracers, a big bronze recurve with teal studs, glowing silver-green arrows (her signature glow).
export default {
	id: 'silverarrow',
	name: 'Silverarrow',
	base: 'huntress-bow',
	palette: {
		hair: ['#f6a24c', '#d0612a', '#8c3216', '#6a2410'], // highlight, mid, edge, tip
		glint: ['#f4fff0', '#bfe7c8'], // hair-coloured pixels that aren't hair (arrow tips, fletching)
		tunic: ['#9fb24a', '#6c8a2f', '#33491b'],
		boots: ['#2f8648', '#236c3a', '#18502b'],
		breeches: ['#b9783d', '#945a2d', '#6b3d1e'],
		bow: ['#b47a38', '#6c4420'],
		string: ['#d9f59a'],
		tie: ['#38c7b0', '#1d7d72', '#10484a'],
		eye: ['#2a120c']
	},
	projectile: { map: { '#201207': '#cfe9a8' }, other: '#ffffff', glow: '#c8ff7a' },
	skip: { gear: { death: 6 } }, // lying down: no shoulder to hang gear on
	passes: [
		['hair', { not: 'shaft', small: 6 }],
		['recolor'],
		['hairEdge'],
		['studs', { material: 'bow', every: 6, studAt: 2, hiAt: 4, stud: '#5fe0cc', hi: '#e2ab5e' }],
		['landmarks', { shoulderW: 4 }],
		['pauldron', { colors: { hi: '#d9a25a', mid: '#a86a32', dk: '#6b3d1e', edge: '#3e2210', rivet: '#38c7b0' } }],
		['quiver', {
			at: [-3, -4], len: 10, dx: 0.32, dy: 1,
			colors: { lt: '#9a5f2c', md: '#74431f', dk: '#4a2a14', band: '#38c7b0', fl: '#d9f59a', fl2: '#ffffff' },
			fletch: [[0, -1, 0], [-1, -2, 1], [1, -2, 0], [2, -1, 0], [-2, -3, 0], [0, -3, 1]]
		}],
		['strap', { over: 'tunic', len: 9, slope: 0.55, buckle: 4, color: '#5a3318', buckleColor: '#d9a25a' }],
		['ponytail', { byAnim: {
			idle: { L: 12, dx: -0.42, dy: 1, amp: 0.9 },
			run: { L: 12, dx: -1, dy: 0.35, amp: 1.3 },
			attack: { L: 12, dx: -0.45, dy: 1, amp: 0.8 },
			hit: { L: 11, dx: -0.75, dy: 0.7, amp: 0.9 },
			fall: { L: 11, dx: -0.7, dy: 0.75, amp: 1.2 },
			jump: { L: 11, dx: -0.9, dy: 0.45, amp: 1.2 },
			death: { L: 11, dx: -0.5, dy: 1, amp: 0.5, upto: 6 }
		} }]
	],
	chips: [['Copper', '#d0612a'], ['Flame', '#f6a24c'], ['Teal tie', '#38c7b0'], ['Olive leather', '#9fb24a'], ['Emerald', '#2f8648'], ['Bronze', '#b47a38'], ['Leather', '#a86a32'], ['Silver string', '#d9f59a']],
	blurb: 'Copper hair in a high ponytail with teal ties, olive leathers, a ridged leather pauldron, a quiver of glowing arrows and a bronze recurve with a silver string.'
};
