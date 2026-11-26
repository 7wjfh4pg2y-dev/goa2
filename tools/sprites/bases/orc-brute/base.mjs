// Base pack: the ORC BRUTE from CraftPix's orc reel (a library character, brought back to its native pixels by
// charbase.mjs — every reel pixel was a 2 × 2 block). A huge bare-chested brute with a topknot, a green loincloth,
// one-tone orange wraps (forearm bracers, shin wraps, belt — and the spear's shaft) and a stone spear head. 105 × 105
// cells, facing right, feet on y = 104, ~80 px tall. Drawn finer than the free packs (face ~10 px, arms ~5): the
// CraftPix family (Spartan, Gladiator, Minotaur…) shares this scale, so their gear fits him as cut.
export default {
	id: 'orc-brute',
	name: 'Orc Brute',
	cell: 105,
	foot: 104,
	bg: [],
	sheets: {
		idle: 'Idle.png',
		run: 'Run.png',
		walk: 'Walk.png',
		attack: 'Jump attack.png', // the overhead chop — the axe's swing
		attack1: 'Attack.png',
		attack2: 'Attack 2.png',
		attack3: 'Attack 3.png',
		runattack: 'Run attack.png',
		crouch: 'Crouch.png',
		hit: 'Hurt.png',
		death: 'Death.png'
	},
	attackName: 'Attack',
	// the attack = a run-up into a leaping two-handed strike (the user, 2026-11-26): Run → the Jump attack's wind-up and
	// raise → Attack 3's lunge (the weapon brought down two-handed by the hero's `regrip`) → back to the stance
	attack: { holds: [1, 0, 0, 1, 0, 3], release: null, seq: [['run', 0, 1], ['run', 1, 1], ['run', 2, 1], ['run', 3, 1], ['run', 4, 1], ['run', 5, 1], ['attack', 0, 1], ['attack', 1, 1], ['attack', 3, 2], ['attack3', 5, 5], ['idle', 0, 2]] },
	// Defend: the artist's crouch (hunched, braced) — a shield-bearer puts the shield in front of it (hero `shield` front)
	guard: { sheet: 'crouch', lead: [0], frames: [1, 2] },
	materials: {
		outline: ['#020203'],
		hair: ['#0e070b'],
		tie: ['#87102a'],
		eye: ['#fff1c0'],
		skin: ['#a05151', '#7f3f38', '#672d35', '#491f30', '#421020', '#401a22', '#74362d'],
		kilt: ['#00422b', '#001a1b'],
		wraps: ['#d17642'],
		head: ['#d1b18a', '#7f6756']
	}
};
