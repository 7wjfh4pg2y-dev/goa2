// Every hero's strengths and weaknesses on the hero page: at most three of each, short enough to read at a
// glance (the panel on the painting shows them all without scrolling). Written from each hero's own cards and
// printed stats, in the rulebook's terms. A guide written in the opening builder still wins (first three).

export const MAX_SW = 3

export const HERO_SW: Record<string, { s: string[]; w: string[] }> = {
	arien: { s: ['Wins one-on-one fights', 'Spell Break stops skills', 'Discards through a target'], w: ['Acts late', 'Must stand next to enemies', 'Few ways to help allies'] },
	bain: { s: ['Bounty rewards the whole team', 'Silver hook pulls targets in', 'Long crossbow shots'], w: ['Needs the Bounty out first', 'Straight lines are easy to block', 'Card guesses are a gamble'] },
	brogan: { s: ['Very hard to defeat', 'Protects his minions', 'Charges in a straight line'], w: ['Acts very late', 'Short reach', 'Slow to get around'] },
	brynn: { s: ['Deadly next to obstacles', 'Moves enemies into traps', 'Discards from a distance'], w: ['Needs 3+ obstacles round a target', 'Low attack early', 'Low defense'] },
	cutter: { s: ['Very mobile with her Silver', 'Discards from a distance', 'Earns coins fast'], w: ['Needs careful positioning', 'Low defense', 'Tokens and units block her lines'] },
	dodger: { s: ['Strong near empty spawn points', 'Attacks heroes with a discard', 'Earns coins in a stalled wave'], w: ['Very low defense', 'Weak in a full battle zone', 'Low attack'] },
	emmitt: { s: ['Reverses the turn order', 'Brings back discarded cards', 'Hard-to-defend Temporal attacks'], w: ['Reversing can hurt your team', 'Acts very late', 'Slow'] },
	garrus: { s: ['Very hard to defeat', 'Hits harder with a full discard', 'Slows enemies down'], w: ['Acts late', 'Short reach', 'Must be in the middle of the fight'] },
	gydion: { s: ['A spell for every situation', 'Enemies never know his spells', 'Strong from a distance'], w: ['Slow', 'Low defense', 'Must prepare his spells first'] },
	hanu: { s: ['Fastest support in the game', 'Hurry up! speeds up an ally', 'Swaps to save or set up allies'], w: ['Very low defense', 'Low attack', 'Needs teammates to shine'] },
	ignatia: { s: ['Attacks from range either way', 'Magma blocks spaces', 'Equilibrium doubles her effects'], w: ['Depends on the Tie Breaker coin', 'Acts late', 'Hard to master'] },
	min: { s: ['Very fast and mobile', 'Mines and grenades deny spaces', 'Smoke bomb blocks attacks'], w: ['Low defense early', 'Low attack values', 'Tokens take time to set up'] },
	misa: { s: ['Very hard to defeat', 'Places herself anywhere in reach', 'Displaces enemies'], w: ['Slow without movement items', 'Mostly attacks up close', 'Few discards'] },
	mortimer: { s: ['Zombies trap and block enemies', 'Very hard to defeat', 'Big attacks'], w: ['Acts very late', 'Slow on his own', 'Needs zombies out early'] },
	mrak: { s: ['Very hard to defeat', 'Rocks trap enemy heroes', 'Discard or be defeated from radius'], w: ['Acts very late', 'Slow', 'Few attack cards'] },
	nebkher: { s: ['Longest range in the game', 'Makes enemies discard a colour', 'Illusions swap and confuse'], w: ['Acts very late', 'Low attack', 'Weak against discards'] },
	razzle: { s: ['Fastest hero in the game', 'Doubles spread her threat', 'Crowd Control defends hard'], w: ['Low attack', 'Low defense without doubles', 'Hard to master'] },
	rowenna: { s: ['Great base stats', 'Heals allies and gives coins', 'Leaps next to enemy heroes'], w: ['Her Gold is a poor finisher', 'Must stand next to enemies', 'Slow without movement items'] },
	sabina: { s: ['Punishes heroes who attack', 'Controls minions and the wave', 'Pushes brawlers away'], w: ['Low attack early', 'Low defense', 'Needs her minions nearby'] },
	silverarrow: { s: ['Starts and finishes kills alone', 'Very fast and mobile', 'Stops enemies fast travelling'], w: ['Very low defense', 'Low attack', 'Hates ending next to heroes'] },
	snorri: { s: ['Runes make every card flexible', 'Hidden plan keeps enemies guessing', 'Hard to defeat'], w: ['Acts late', 'Runes fix the plan for the round', 'Hard to master'] },
	swift: { s: ['Long straight-line shots', 'Escapes fast with her Silver', 'Discards from a distance'], w: ['Acts late', 'Low defense', 'Weak next to enemies'] },
	takahide: { s: ['Three golds to switch between', 'Lets allies swap their cards', 'Punishes aggression'], w: ['Slow', 'Needs allies to discard', 'Hard to master'] },
	tali: { s: ['Strong healer', 'Ice slows enemy initiative', 'Moves whole groups at once'], w: ['Low attack', 'Low defense', 'Needs her teammates'] },
	tigerclaw: { s: ['Very fast and mobile', 'Steals coins', 'Poison weakens enemies'], w: ['Very low defense early', 'Low attack early', 'Needs terrain to hide'] },
	trinkets: { s: ['Very mobile', 'The Turret controls an area', 'Discards from a distance'], w: ['Low defense', 'Depends on the Turret', 'Low attack early'] },
	ursafar: { s: ['Attacks again and again', 'Hard to defeat', 'Earns coins from fights'], w: ['Very slow', 'Must be enraged first', 'Easily stranded far from the wave'] },
	wasp: { s: ['Moves units and tokens', 'Blocks ranged attacks', 'Silver denies spaces'], w: ['No standout stat', 'Needs the right upgrades', 'Mostly attacks up close'] },
	whisper: { s: ['Kills heroes on his own', 'Jumps to empty spawn points', 'Punishes heroes with a discard'], w: ['Below-average movement', 'Needs empty spawn points', 'Low defense'] },
	widget: { s: ['Gold repeats a skill', 'Pyro displaces and discards', 'Strong Silver defense'], w: ['Depends on Pyro', 'Average stats', 'Pyro is easy to misplace'] },
	wuk: { s: ['Best pusher in the game', 'Trees trap and protect', 'Very hard to defeat'], w: ['Acts very late', 'Slow', 'Must plan turns ahead'] },
	xargatha: { s: ['Hits harder when surrounded', "Siren's Call pulls enemies in", 'Stone Gaze stops movement'], w: ['Acts late', 'Weak on her own', 'Needs enemies close by'] }
}
