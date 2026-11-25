// Base pack: the white-haired bow huntress ("Huntress 2"). 100 × 100 cells, facing right, feet on y = 66, ~35 px tall.
// Every sheet is named by the canonical animation it feeds (see ../../lib/anims.mjs).
export default {
	id: 'huntress-bow',
	name: 'Huntress (bow)',
	cell: 100,
	foot: 66,
	bg: ['#FFFFFF', '#7E886C'], // the strips come on white, the preview on sage
	sheets: {
		idle: 'Character/Idle.png',
		run: 'Character/Run.png',
		attack: 'Character/Attack.png',
		jump: 'Character/Jump.png',
		fall: 'Character/Fall.png',
		hit: 'Character/Get Hit.png',
		death: 'Character/Death.png'
	},
	projectiles: { arrow: 'Arrow/Static.png', arrow2: 'Arrow/Move.png' },
	// the attack: holds per frame (extra frames), the frame the shot leaves on, and the projectile it fires
	attack: { holds: [0, 0, 0, 2, 0, 3], release: 4, projectile: 'arrow', nockFrame: 3 },
	// source colours by material, light → dark
	materials: {
		hair: ['#F9F7F1', '#B9B5AA', '#C2B5C2'],
		skin: ['#F3D0B3', '#DFA87B', '#C7A182', '#A78161'],
		tunic: ['#5C9867', '#3A6A43', '#203E26'],
		boots: ['#2C7824', '#21641A', '#1F551A'],
		breeches: ['#AA6D3A', '#935F33', '#754721'],
		bow: ['#612A1D', '#431C13'],
		string: ['#577833'],
		tie: ['#93A123', '#40250E', '#29180A'],
		eye: ['#000000'],
		shaft: ['#201207'] // arrow shafts + the bow grip
	}
};
