// Arien, the Tidemaster — second hero (2026-11-26). Base: Fantasy Warrior (a caped swordsman with a curved blade).
// Card art (19 cards + the splash, all him): dark steel-teal LAYERED SCALE ARMOUR, a closed helmet with a tall
// spiked FIN CREST (no face shows — a dark visor), violet AMETHYST gems on chest / shoulders / belt / helm, a pale
// CRESCENT SCIMITAR, a dark sea-teal cloak (Ultimate / the wave cards), and WATER magic everywhere: aqua torrents
// with white foam rims, seafoam spray, deep teal swirls. So: the pack's white hair → a steel-teal crest, the face →
// the visor (eye glints aqua), the fur collar → pauldrons, the green tunic → scale armour (its checker = scales),
// the maroon gloves / boots → gunmetal gauntlets and greaves, the belt buckle → an amethyst, the cape → deep sea,
// the lightning → water (`torrent`: the cyan slash fills become a wave with a foam rim, the bolts break into spray).
export default {
	id: 'arien',
	name: 'Arien',
	base: 'fantasy-warrior',
	palette: {
		crown: ['#8ff1e6', '#9cc9c4', '#5f9693', '#8ff1e6'],
		skin: ['#3d6b72', '#24434c'],
		collar: ['#8fc1bd', '#4f8483'],
		tunic: ['#3c7c7a', '#2a5e60', '#1f4a4f', '#102a30'],
		under: ['#16242b', '#111c22', '#0c151a', '#060b0e'],
		leather: ['#5d7685', '#46606f', '#34495a', '#2a3a48'],
		buckle: ['#d49cff', '#8a4fd0'],
		cape: ['#2a5f78', '#1b3550'],
		blade: ['#e4fbf7', '#86b9bb'],
		hilt: ['#2b3d47']
	},
	projectile: { glow: '#7fe6e0' },
	skip: { gear: { death: 4 } }, // lying down: no crest
	passes: [
		['recolor'],
		['crest', { from: ['#D4CFD7', '#BCB2C2'], spikes: [4, 3, 2], gap: 2, colors: { hi: '#c9f2ec', mid: '#6fa8a6', dk: '#2f5f63' } }],
		['torrent', { colors: { foam: '#effffb', light: '#9ff3ea', mid: '#43c9cc', deep: '#1f8fa6', spray: '#c9fbf5', drop: '#5fd8dc' } }]
	],
	chips: [['Scale armour', '#3c7c7a'], ['Gauntlets', '#5d7685'], ['Amethyst', '#d49cff'], ['Cloak', '#2a5f78'], ['Crescent', '#e4fbf7'], ['Torrent', '#43c9cc'], ['Foam', '#effffb']],
	blurb: 'Steel-teal scale armour, a visored crest, an amethyst at the belt and a crescent blade — his slashes are torrents of water, not lightning.'
};
