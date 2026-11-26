// Brogan, the Destroyer — rebuilt 2026-11-26 on the user's recipe: the ORC BRUTE's body, the SPARTAN's shield, the
// GLADIATOR's armour and the MINOTAUR BRUTE's axe (all four from the CraftPix reels in the Animation studio — one
// family, one pixel scale, so the parts fit as cut). Card art (19 cards + the splash): a huge bare-armed northern
// brute — FIERY RED hair in a topknot, a big red BEARD, tanned muscled arms, a heavy leather belt, a RED kilt to the
// knees, a round iron-rimmed shield and a broadsword / double axe. So: the orc's skin → a weathered tan, his topknot →
// flame red, the face's own pixels under the eye → the beard (tusks under it go red too), the green loincloth → the
// Gladiator's crimson skirt, the one-tone wraps → the Gladiator's bronze greaves and bracers (the belt and the haft
// in the Minotaur's leather), the spear head → the Minotaur Brute's axe head, the Spartan's bronze shield on the
// free forearm.
// Redesign (2026-11-26, the user): an ELF barbarian — pointed ear, a full head of red hair pulled back into a thick
// ponytail, a more human face, a spiked leather cuirass with a fur collar, an iron pauldron, dark shaggy fur boots
// and a big curved double axe (parts/axe-brogan.png, drawn from the card art, in the Minotaur axe's steel). The head
// and the pauldron were hand-edited on idle frame 0 (parts/brogan-head.png, brogan-pauldron.png = the changed
// pixels, magenta = cleared): the head FOLLOWS the eye in every frame (kit `follow`: the pack's own head pixels
// matched for shift + turn), the pauldron sits on the back of the shoulders (`shoulderplate`, dropped under the beard
// where he turns side-on); the cuirass and the boots are rebuilt from each frame's own pixels (`cuirass`, `furboots`).
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
		['axe', { head: ['#d1b18a', '#7f6756'], part: 'axe-brogan', anchor: [15, 15], axis: [1, 0], side: 1, stub: 3 }],
		['regrip', { part: 'axe-brogan-long', anchor: [1, 15.5], axis: [1, 0], outline: '#020203', grips: { attack3: { 5: [[65, 76], [81, 93]] } } }],
		['cuirass', { head: [8, 8], chest: [-5, 18], neck: 7, half: 11, bottom: 5, belt: 7, ramp: ['#8a5a3a', '#6e4429', '#5a3720', '#462a18', '#341f12'], collar: ['#d8c39a', '#9b8060'], bronze: ['#e6aa49', '#a8732a'], iron: ['#b9c2cf', '#7f8794', '#4b515d'], outline: '#020203', studs: [[3, 22], [8, 23], [13, 22], [6, 18], [11, 18], [16, 18], [3, 14], [8, 14], [13, 14], [6, 10], [11, 10], [16, 10]], edge: [22, 18, 14, 10] }],
		['furboots', { len: 14, bulk: 2, fur: ['#6b4628', '#4c2f1a', '#34200f', '#211309'], sole: ['#5a3a26', '#3a2418'], outline: '#020203' }],
		['armrig', { head: [8, 8], row: 9, scan: 26, sx: 6, reach: 3, clear: 14 }],
		['shoulderplate', { part: 'brogan-pauldron', pin: [6, 6], follow: 0.5, max: 40 }],
		['follow', { part: 'brogan-head', origin: [32, 25], clearHair: true, file: 'Idle.png', box: [44, 18, 64, 44], eye: [55, 33], head: [8, 8], reach: 8 }],
		['shield', { part: 'shield-spartan', grip: [0, 0], behind: { attack: [1, 2, 3, 4, 5], attack3: [5] } }]
	],
	chips: [['Flame ponytail', '#c8471d'], ['Red beard', '#a83a1a'], ['Spiked leather', '#6e4429'], ['Iron pauldron', '#7f8794'], ['Fur boots', '#4c2f1a'], ['Crimson kilt', '#87102a'], ['Spartan shield', '#e6aa49'], ['Double axe', '#444563']],
	blurb: 'The elf barbarian on the Orc Brute’s frame: a full head of flame-red hair in a thick ponytail, a red beard, a spiked leather cuirass and iron pauldron, dark fur boots, the Spartan’s shield and a curved double axe.'
};
