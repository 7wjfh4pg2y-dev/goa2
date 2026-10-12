// How to play: the illustrated walkthrough (/learn). Each step = a short text + a board SCENE drawn on the
// real map (pieces, lit zones, coloured areas, defence badges) and, for the card steps, real cards.
// The order follows a teaching script for a first game (setup → winning → the map → a turn → moving →
// attacking → end of round → other rules → tips); the rules match the app's engine (tested in learn.test.ts:
// every scene's pieces stand on real, open, distinct hexes).
import M from './maps/forgotten_island.json'
import type { GameMap } from './maps'
import { zoneTable, hexCube, cubeDist } from './zones'
import { hexNeighbours } from './board/hexgeo'
import { heroLogo, heroById } from './heroes'
import { heroCards, type HeroCardJson } from './cards/deck'
import { spawnWave } from './battle'
import { startingHand } from './cards/cardstate'

export const LEARN_MAP = M as unknown as GameMap

export type ScenePiece = { id: string; hex: string; team: string; role?: string; hero?: string; sym?: string; label?: string; color?: string; name?: string; immune?: boolean }
export type Area = { hex: string; r: number; color: string; hexes?: string[]; alpha?: number }
export type Badge = { id: string; text: string; tone: 'up' | 'down' | 'even'; total?: boolean }
export type LearnCard = { hero: string; card: HeroCardJson; tag?: string; short?: string; tone?: 'hand' | 'item' | 'gone' | 'pick'; order?: number }
export type Scene = { pieces: ScenePiece[]; zone: string | null; areas?: Area[]; badges?: Badge[]; cards?: LearnCard[]; cardSize?: 'big' | 'row' }
export type Block =
	| { p: string }
	| { list: string[] }
	| { table: string[][] }
	| { tip: string }
	| { keys: { color: string; label: string; note: string; area: Area }[] }
export type Step = { id: string; chapter: string; title: string; blocks: Block[]; scene: Scene }

// ── the map ──
const cells = LEARN_MAP.cells ?? {}
const zones = zoneTable(LEARN_MAP)
const open = (h: string) => !!cells[h] && cells[h] !== 'terrain'
const of = (type: string) => Object.keys(cells).filter((h) => cells[h] === type).sort()
const zoneHexes = (z: string) => Object.keys(cells).filter((h) => zones[h] === z && open(h)).sort()
const dist = (a: string, b: string) => cubeDist(hexCube(a), hexCube(b))
const nbrs = (h: string) => hexNeighbours(h).filter(open)

// the first-game heroes (the script's pick): the Titans are "you", the Atlanteans the enemy
const HERO_COLOR: Record<string, string> = { wasp: '#eab308', xargatha: '#22c55e', arien: '#dc2626', brogan: '#a855f7' }
const hero = (id: string, hex: string, team: 'orange' | 'blue'): ScenePiece => ({ id: `h_${id}`, hex, team, hero: id, sym: heroLogo(id), label: heroById(id)?.name?.[0] ?? '?', color: HERO_COLOR[id], name: heroById(id)?.name })
const minion = (id: string, hex: string, team: 'orange' | 'blue', role: string): ScenePiece => ({ id, hex, team, role, name: `${team === 'orange' ? 'Atlantean' : 'Titan'} ${role} minion` })

const wave: ScenePiece[] = (LEARN_MAP.battleZone ?? []).map((b) => minion(`m_${b.hex}`, b.hex, b.team as 'orange' | 'blue', b.kind))
const blueSpawn = of('baseBlueSpawn'), orangeSpawn = of('baseOrangeSpawn')
const startHeroes = [hero('wasp', blueSpawn[0], 'blue'), hero('xargatha', blueSpawn[2] ?? blueSpawn[1], 'blue'), hero('arien', orangeSpawn[0], 'orange'), hero('brogan', orangeSpawn[2] ?? orangeSpawn[1], 'orange')]

const taken = (ps: ScenePiece[]) => new Set(ps.map((p) => p.hex))
/** an open hex of the zone, as near `to` as possible, not under any of `ps` */
function nearFree(zone: string, to: string, ps: ScenePiece[], minD = 0): string {
	const t = taken(ps)
	return zoneHexes(zone).filter((h) => !t.has(h) && dist(h, to) >= minD).sort((a, b) => dist(a, to) - dist(b, to) || a.localeCompare(b))[0]
}
const minionsOf = (team: string, role?: string) => wave.filter((m) => m.team === team && (!role || m.role === role))

// ── colours ──
const C = { or: '#ef7d22', ti: '#2f7fe6', gold: '#f3c454', green: '#35d07a', red: '#ef4f5c', sand: '#e9d6a0', jungle: '#5fbf6a', violet: '#a978ff' }
const ZONES: { z: string; label: string; color: string; note: string }[] = [
	{ z: 'Orange Base', label: 'Atlantean Throne', color: C.or, note: 'The Atlanteans’ home. Their heroes start and respawn on its spawn points. The Titans win by pushing into it.' },
	{ z: 'Orange Beach', label: 'Atlantean Beach', color: C.sand, note: 'The battle zone moves here when the Titans push the lane. The last stop before the Atlantean throne.' },
	{ z: 'Orange Jungle', label: 'Atlantean Jungle', color: C.jungle, note: 'A path for heroes, past the middle. Minions never fight here.' },
	{ z: 'Center', label: 'Middle', color: C.gold, note: 'Where every game starts: the first battle zone, with a wave of minions from each team.' },
	{ z: 'Blue Jungle', label: 'Titan Jungle', color: C.jungle, note: 'A path for heroes, past the middle. Minions never fight here.' },
	{ z: 'Blue Beach', label: 'Titan Beach', color: C.sand, note: 'The battle zone moves here when the Atlanteans push the lane. The last stop before the Titan throne.' },
	{ z: 'Blue Base', label: 'Titan Throne', color: C.ti, note: 'The Titans’ home. Their heroes start and respawn on its spawn points. The Atlanteans win by pushing into it.' }
]
const zoneArea = (z: string, color: string, alpha = 0.42): Area => ({ hex: zoneHexes(z)[0], r: 0, color, hexes: zoneHexes(z), alpha })

// ── cards ──
const cardsOf = (h: string) => heroCards(h)
const card = (h: string, name: string): HeroCardJson => cardsOf(h).find((c) => c.name === name) ?? cardsOf(h)[0]
const tier1 = (h: string, color: string) => cardsOf(h).find((c) => c.level === 1 && c.color === color)
// the app's own starting hand (gold, silver, the three Tier I cards — the handicap variants left out)
const startHand = (h: string): LearnCard[] => startingHand(h).map((i) => ({ hero: h, card: cardsOf(h)[i] }))

// ── scenes ──
function sceneMovement(): Scene {
	const d = nearFree('Center', '9_12', wave)
	return { pieces: [...wave, hero('wasp', d, 'blue')], zone: 'Center', areas: [{ hex: d, r: card('wasp', 'Shock').secondaryMovement ?? 4, color: HERO_COLOR.wasp }] }
}
function sceneFastTravel(): Scene {
	const at = nearFree('Blue Beach', '13_14', wave)
	const pieces = [...wave, hero('wasp', at, 'blue')]
	const enemyIn = (z: string) => pieces.some((p) => p.team === 'orange' && zones[p.hex] === z)
	const here = zones[at]
	const touching = new Set<string>()
	for (const h of zoneHexes(here)) for (const n of nbrs(h)) if (zones[n] && zones[n] !== here) touching.add(zones[n])
	const areas: Area[] = [zoneArea(here, C.green)]
	for (const z of touching) areas.push(zoneArea(z, enemyIn(z) ? C.red : C.green))
	return { pieces, zone: 'Center', areas }
}
function sceneAttackMinion(): Scene {
	const target = minionsOf('orange', 'melee')[0]
	const d = nearFree('Center', target.hex, wave)
	const pieces = [...wave.map((m) => (m.team === 'orange' && m.role === 'heavy' ? { ...m, immune: true } : m)), hero('wasp', d, 'blue')]
	return { pieces, zone: 'Center', areas: [{ hex: d, r: 1, color: HERO_COLOR.wasp }] }
}
/** Arien (the defender) in the open middle, ringed by the minions that change the fight */
function attackSetup() {
	const mid = zoneHexes('Center').filter((h) => nbrs(h).length === 6 && hexNeighbours(h).every((n) => zones[n] === 'Center')).sort((a, b) => dist(a, '9_9') - dist(b, '9_9'))[0]
	const n = hexNeighbours(mid)
	const ring2 = zoneHexes('Center').filter((h) => dist(h, mid) === 2).sort()
	const ranged = ring2.find((h) => !n.includes(h))!
	const pieces: ScenePiece[] = [
		hero('arien', mid, 'orange'),
		hero('wasp', n[1], 'blue'),
		hero('xargatha', n[5], 'blue'),
		minion('bm', n[3], 'blue', 'melee'),
		minion('br', ranged, 'blue', 'ranged'),
		minion('om', n[0], 'orange', 'melee'),
		minion('or', ring2.find((h) => h !== ranged && dist(h, ranged) > 2) ?? ring2[ring2.length - 1], 'orange', 'ranged')
	]
	return { mid, pieces }
}
function sceneAttackHero(): Scene {
	const { pieces } = attackSetup()
	const badges: Badge[] = [{ id: 'bm', text: '−1', tone: 'down' }, { id: 'br', text: '−1', tone: 'down' }, { id: 'om', text: '+1', tone: 'up' }, { id: 'h_arien', text: '−1', tone: 'down', total: true }]
	return { pieces, zone: 'Center', badges, areas: [{ hex: pieces[1].hex, r: 1, color: HERO_COLOR.wasp }] }
}
function sceneDefeat(): Scene {
	const { pieces } = attackSetup()
	return { pieces: pieces.filter((p) => p.id !== 'h_arien'), zone: 'Center', areas: [{ hex: orangeSpawn[0], r: 0, color: C.or, hexes: orangeSpawn }] }
}
function sceneBattle(): Scene {
	const gone = minionsOf('orange', 'melee').slice(0, 2).map((m) => m.id)
	return { pieces: wave.filter((m) => !gone.includes(m.id)), zone: 'Center', areas: [zoneArea('Center', C.gold)] }
}
function scenePush(): Scene {
	const next = Object.values(spawnWave(LEARN_MAP, 'Orange Beach', {}, 'learn').minions).map((m) => minion(m.id, m.hex, m.team as 'orange' | 'blue', m.role ?? 'melee'))
	return { pieces: next, zone: 'Orange Beach', areas: [zoneArea('Orange Beach', C.ti)] }
}
function sceneOrder(): Scene {
	// Wasp 10 · Arien 9 · then Xargatha and Brogan tie on 7: the Titans hold the coin, so Xargatha goes first
	const pick = (h: string, color: string) => ({ hero: h, card: tier1(h, color)! })
	const order = [pick('wasp', 'BLUE'), pick('arien', 'BLUE'), pick('xargatha', 'RED'), pick('brogan', 'RED')]
		.filter((x) => x.card)
		.map((x, i, all) => { const tie = all.some((y) => y !== x && y.card.initiative === x.card.initiative) ? ' · tie' : ''; return { ...x, order: i + 1, tag: `Initiative ${x.card.initiative}${tie}`, short: `${x.card.initiative}${tie}` } })
	return { pieces: [...wave, ...startHeroes], zone: 'Center', cards: order, cardSize: 'row' }
}
function sceneLevel(): Scene {
	const old = card('wasp', 'Shock'), a = card('wasp', 'Electrocute'), b = card('wasp', 'Charged Boomerang')
	return {
		pieces: [...wave, ...startHeroes], zone: 'Center', cardSize: 'row',
		cards: [
			{ hero: 'wasp', card: old, tone: 'gone', tag: 'Back to the deck', short: 'Deck' },
			{ hero: 'wasp', card: a, tone: 'hand', tag: 'Into your hand', short: 'Hand' },
			{ hero: 'wasp', card: b, tone: 'item', tag: `Item · +1 ${(b.item ?? '').toLowerCase()}`, short: 'Item' }
		]
	}
}

const all = (): Scene => ({ pieces: [...wave, ...startHeroes], zone: 'Center' })

export function learnSteps(): Step[] {
	const shock = card('wasp', 'Shock')
	return [
		{
			id: 'welcome', chapter: 'Welcome', title: 'Guards of Atlantis II',
			blocks: [
				{ p: 'A team game: every player controls one hero. Two teams, the **Atlanteans** and the **Titans**, fight over one lane of minions.' },
				{ p: 'This walkthrough uses the first-game heroes: **Wasp** and **Xargatha** (Titans) against **Arien** and **Brogan** (Atlanteans). In 3 v 3 add Tigerclaw to the Titans and Sabina to the Atlanteans.' },
				{ tip: 'Use the arrow keys, or Back / Next. Pan and zoom the board as you like.' }
			],
			scene: all()
		},
		{
			id: 'win', chapter: 'Welcome', title: 'Three ways to win',
			blocks: [
				{ list: [
					'**Push into their throne.** Win a lane push while the battle zone is right next to the enemy throne.',
					'**Run them out of Life.** Every enemy hero you defeat costs their team Life counters. A team with none left loses.',
					'**Win the final push.** Each push removes a wave counter. Whoever pushes when the last one goes wins.'
				] }
			],
			scene: { ...all(), areas: [zoneArea('Orange Base', C.or), zoneArea('Blue Base', C.ti)] }
		},
		{
			id: 'map', chapter: 'The board', title: 'Seven zones',
			blocks: [
				{ p: 'The island is split into seven zones. Each team has a **throne** zone at its end. Minions only ever fight in the **middle** or on one of the two **beaches**. The two **jungles** are paths for heroes.' },
				{ keys: ZONES.map((z) => ({ color: z.color, label: z.label, note: z.note, area: zoneArea(z.z, '#ffd75e', 0.55) })) } // one strong highlight, whatever the zone's own colour
			],
			scene: { pieces: startHeroes, zone: null }
		},
		{
			id: 'zone', chapter: 'The board', title: 'The battle zone',
			blocks: [
				{ p: 'The zone with the minions in it is the **battle zone**. It starts in the middle and moves one zone at a time as the teams push.' },
				{ p: 'Three kinds of minion, told apart by the pips on their rim: **melee** (6 pips), **ranged** (4) and **heavy** (8).' },
				{ p: 'Your team’s minions turn **one way**, the enemy’s the **other**. That is also how you tell a minion from the empty spawn point under it.' }
			],
			scene: all()
		},
		{
			id: 'setup', chapter: 'Setup', title: 'Setting up',
			blocks: [
				{ table: [['', '2 v 2', '3 v 3'], ['Short game', '3 waves · 4 Life', '3 waves · 5 Life'], ['Long game', '5 waves · 6 Life', '5 waves · 8 Life']] },
				{ list: [
					'Toss the **tie-breaker coin**. It decides ties all game.',
					'Each hero starts at **level 1** on one of the spawn points in their own throne.',
					'A wave of minions stands on the spawn points of the middle zone.'
				] },
				{ tip: 'The app sets all of this up for you. Each player places their hero at the start.' }
			],
			scene: { ...all(), areas: [{ hex: blueSpawn[0], r: 0, color: C.ti, hexes: blueSpawn }, { hex: orangeSpawn[0], r: 0, color: C.or, hexes: orangeSpawn }] }
		},
		{
			id: 'hand', chapter: 'Your cards', title: 'Your starting hand',
			blocks: [
				{ p: 'Every hero has a deck of 18 cards. You start with **five**: the two basic cards (**gold** and **silver**) and your three **Tier I** cards (**red**, **blue** and **green**).' },
				{ p: 'The rest wait in your deck until you level up.' }
			],
			scene: { ...all(), cards: startHand('wasp'), cardSize: 'row' }
		},
		{
			id: 'card', chapter: 'Your cards', title: 'Reading a card',
			blocks: [
				{ list: [
					`**Initiative** (top left): who goes first. This card: **${shock.initiative}**.`,
					`**Primary action** (along the bottom): this card attacks for **${shock.primaryValue}**. Any text on the card belongs to the primary action.`,
					`**Secondary actions** (down the left): a plain move of **${shock.secondaryMovement}** or a defence of **${shock.secondaryDefense}**.`
				] },
				{ p: 'When your card resolves you do **either** the primary action **or** one secondary action. There are four kinds: attack, skill, movement and defence.' }
			],
			scene: { ...all(), cards: [{ hero: 'wasp', card: shock }], cardSize: 'big' }
		},
		{
			id: 'turn', chapter: 'A turn', title: 'Playing a turn',
			blocks: [
				{ p: 'A game is played in **rounds** of **four turns**.' },
				{ list: [
					'Everyone picks a card from their hand and plays it **face down**, all at once.',
					'The cards are revealed together.',
					'They resolve **one at a time**, the highest initiative first.'
				] },
				{ p: '**Ties:** against an enemy, the team holding the tie-breaker goes first, then the coin flips to the other side. Here Xargatha and Brogan both have 7 and the Titans hold the coin, so Xargatha goes first. Tied with a teammate, you two choose (no flip).' },
				{ p: 'Once your card has resolved it stays face up in this turn’s slot. If you have no cards left you pass.' }
			],
			scene: sceneOrder()
		},
		{
			id: 'move', chapter: 'Moving', title: 'Movement',
			blocks: [
				{ p: 'A movement action moves your hero **up to** the number on the boot. Wasp’s Shock moves 4: the ring shows how far that reaches.' },
				{ p: 'You can’t move **through** obstacles: heroes, minions, terrain and tokens all block. Water counts as terrain.' },
				{ p: 'If the boot is the card’s **primary** action, you move **and** do what the card says.' }
			],
			scene: sceneMovement()
		},
		{
			id: 'fast', chapter: 'Moving', title: 'Fast travel',
			blocks: [
				{ p: 'Instead of moving normally, a movement action can **fast travel**: ignore the number and jump to any space in your zone or in a zone next to it.' },
				{ p: 'Allowed only when **neither** zone has an enemy hero or minion in it. Here Wasp can fast travel to the **green** zones, but not into the **red** one: enemy minions are standing there.' },
				{ p: 'Fast travel skips the card’s text.' }
			],
			scene: sceneFastTravel()
		},
		{
			id: 'minions', chapter: 'Fighting', title: 'Attacking minions',
			blocks: [
				{ p: 'The sword shows the attack value; a range or radius icon shows how far it reaches. **Range 1** = a space next to you.' },
				{ p: 'Any attack on a minion **defeats it**, whatever the strength. You earn **2 coins** for a melee or ranged minion and **4** for a heavy.' },
				{ p: 'A **heavy** minion is immune (the silver shield) while any other minion of its team is still in the battle zone.' }
			],
			scene: sceneAttackMinion()
		},
		{
			id: 'heroes', chapter: 'Fighting', title: 'Attacking a hero',
			blocks: [
				{ p: 'An attacked hero may **block** by discarding a card whose **defence** is at least the attack’s strength. Some defences carry a **!** and block anything if their condition is met.' },
				{ list: [
					'The card’s attack value, **+1 per attack item** the attacker has.',
					'**+1** for each of the attacker’s melee or heavy minions **next to** the defender, and each of their ranged minions **within 2**.',
					'**−1** for each of the defender’s own melee or heavy minions next to them (their ranged minions don’t help), and **−1 per defence item**.',
					'Heroes nearby change nothing.'
				] },
				{ tip: 'The shields show this for Arien: two Titan minions count against him, one Atlantean melee helps. The app shows the same shields during every attack.' }
			],
			scene: sceneAttackHero()
		},
		{
			id: 'defeat', chapter: 'Fighting', title: 'A hero is defeated',
			blocks: [
				{ p: 'Not blocked (or not able to)? The hero is **defeated** and leaves the board.' },
				{ list: [
					'Their team loses **Life**: 1 at levels 1–3, 2 at levels 4–6, 3 at levels 7–8.',
					'The attacker earns **coins equal to the defeated hero’s level**, and each of the attacker’s teammates earns the same amount as the Life lost.',
					'An unresolved card goes to its slot unused. Their lasting effects end, and markers on them come off. Their tokens stay.',
					'**Next turn**, when their card comes up, they return on a spawn point in their throne and then resolve the card.'
				] }
			],
			scene: sceneDefeat()
		},
		{
			id: 'battle', chapter: 'End of a round', title: 'The minion battle',
			blocks: [
				{ p: 'After the fourth turn, count each team’s minions in the battle zone. The team with **fewer** removes minions until they are even.' },
				{ p: 'Here the Titans have 6 and the Atlanteans 4, so the Atlanteans remove 2 more. A tie removes nothing.' }
			],
			scene: sceneBattle()
		},
		{
			id: 'push', chapter: 'End of a round', title: 'Pushing the lane',
			blocks: [
				{ p: 'The moment a team’s **last** minion in the battle zone is gone (always the heavy, thanks to its immunity), the other team **pushes**. This can happen mid-turn.' },
				{ list: [
					'A wave counter is removed.',
					'The battle zone moves one zone **towards the losing team’s throne**.',
					'Every minion is cleared off the board and a fresh wave spawns in the new battle zone.'
				] },
				{ p: 'A token on a spawn point is removed first. If a hero or another obstacle is on the spawn point, the minion’s team picks the nearest empty space instead.' }
			],
			scene: scenePush()
		},
		{
			id: 'level', chapter: 'End of a round', title: 'Levelling up',
			blocks: [
				{ p: 'Everyone takes back their played and discarded cards (a hand of five again). Then, if you can afford it, you **must** level up, as many times as you can pay for.' },
				{ list: [
					'A level costs **coins equal to your current level**.',
					'Return one coloured card to your deck. Take the two cards of that colour one tier higher: one goes into your hand, the other becomes an **item**, a lasting +1 bonus (upside down under your board).',
					'All three colours reach **Tier II** before any goes to Tier III.',
					'At **level 8** your **Ultimate** switches on for the rest of the game.',
					'Couldn’t afford a level this round? Take a **pity coin** (no level this round even if you now could).'
				] }
			],
			scene: sceneLevel()
		},
		{
			id: 'rules', chapter: 'Good to know', title: 'Other rules',
			blocks: [
				{ list: [
					'**No line of sight:** you can target through heroes, minions, terrain and tokens.',
					'You can’t defend on your own turn, only in answer to an attack.',
					'An attack can be swapped for a **clear**: remove any tokens next to you (none of the card’s text happens).',
					'**Hold:** do nothing with your card.',
					'“This turn / Next turn / This round” effects last that long. The app lights the card while it runs.',
					'A minion pushed out of the battle zone walks straight back to the nearest empty space of it.',
					'Tokens and markers leave at the end of the round unless the card says otherwise.',
					'Pushes go in a straight line, and units that can’t move can still be pushed.',
					'If you can’t do something a card says, stop there.',
					'You can’t attack your own team’s heroes or minions.'
				] }
			],
			scene: all()
		},
		{
			id: 'tips', chapter: 'Good to know', title: 'Team talk & first tips',
			blocks: [
				{ p: '**Plan out loud, before the reveal.** While cards are face down you may talk openly with your team (the other team can hear). Once the cards are face up, you’re on your own.' },
				{ list: [
					'Turn 1: use your **green** card to fast travel to the action.',
					'Try to defeat a minion in the first round.',
					'After the reveal, read everyone’s cards, especially **red** and **gold**.'
				] },
				{ tip: 'That’s everything for a first game. Create a game or join your friends from the menu.' }
			],
			scene: all()
		}
	]
}
