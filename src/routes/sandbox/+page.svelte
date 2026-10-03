<script lang="ts">
	// Preview portal's sandbox (/sandbox): a 2.0 game you can click around alone — nothing is sent anywhere (a local,
	// fake session; you are p1 and the host). ?n=4|6|10 players, ?scene=plan|levelup.
	import { readable, writable } from 'svelte/store';
	import GameView from '$lib/GameView.svelte';
	import { placeHeroes, placeMinions, applyCardReq, levelPatch, type CardReq, type MatchState, type Player, type MatchSession } from '$lib/match';
	import { firstMap } from '$lib/maps';
	import { initCards } from '$lib/cards/cardstate';

	const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
	const NQ = Math.max(2, Math.min(10, +(q.get('n') ?? 4) || 4));
	const scene = q.get('scene') ?? 'plan';
	const players: Player[] = [
		{ id: 'p1', name: 'You', color: 'green', ready: true, seat: 0 },
		{ id: 'p2', name: 'Priya', color: 'yellow', ready: true, seat: 1 },
		{ id: 'p3', name: 'Mo', color: 'purple', ready: true, seat: 2 },
		{ id: 'p4', name: 'Sam', color: 'white', ready: true, seat: 3 },
		{ id: 'p5', name: 'Alex', color: 'crimson', ready: true, seat: 4 },
		{ id: 'p6', name: 'Jo', color: 'pink', ready: true, seat: 5 },
		{ id: 'p7', name: 'Kit', color: 'cyan', ready: true, seat: 6 },
		{ id: 'p8', name: 'Ravi', color: 'black', ready: true, seat: 7 },
		{ id: 'p9', name: 'Lee', color: 'lime', ready: true, seat: 8 },
		{ id: 'p10', name: 'Nadia', color: 'teal', ready: true, seat: 9 }
	].map((p, i) => ({ ...p, seat: i })) as Player[];
	const seated = players.slice(0, NQ);
	const HS = [q.get('hero') ?? 'arien', 'brogan', 'xargatha', 'trinkets', 'tigerclaw', 'wasp', 'sabina', 'dodger', 'bain', 'silverarrow'];
	const picks = Object.fromEntries(seated.map((p, i) => [p.id, HS[i]]));
	const map = firstMap()?.data ?? null;
	const seatMap = Object.fromEntries(seated.map((p) => [p.seat, { id: p.id, name: p.name }]));

	let s = {
		round: 2, turn: scene === 'levelup' ? 4 : 1, phase: 'play', tieBreaker: 'orange', lastPush: null,
		waves: 4, wavesMax: 5, waveTok: [true, true, true, true, false],
		life: { orange: 7, blue: 9 }, lifeMax: 10,
		lifeTok: { orange: [true, true, false, true, true, false, true, true, true, true], blue: [true, true, true, true, true, true, true, true, false, true] },
		timer: null, mapId: '', map, pieces: {}, seats: NQ, host: 'p1', creator: 'p1', seatMap,
		draftSystem: 'all-pick', draftStars: [1, 2, 3], draft: { picks }, started: true, closed: false,
		startFlip: null, rev: 1, updatedBy: 'p1', updatedAt: Date.now(),
		log: [
			{ id: 'l1', at: Date.now() - 90000, by: 'Priya', text: 'moved Brogan → Center' },
			{ id: 'l2', at: Date.now() - 20000, by: 'Mo', text: 'defeated a Titan melee minion (+2)' }
		]
	} as unknown as MatchState;
	s.cards = initCards(picks);
	// some coins so the deck and the level-up step have something to show
	for (const p of seated) s.cards[p.id] = { ...s.cards[p.id], coins: p.id === 'p1' ? 9 : 4 };
	s.pieces = { ...placeMinions(s), ...placeHeroes(s, seated) };
	if (scene === 'levelup') s = { ...s, battlePhase: true, ...levelPatch(s) } as MatchState;

	const ms = writable<MatchState>(s);
	const session = {
		status: readable('connected'),
		clientId: 'p1',
		pings: readable([]),
		ping: () => {},
		hostNow: () => Date.now(),
		canUndo: readable(false),
		undo: () => {},
		act: (text: string, patch: Partial<MatchState>) =>
			ms.update((x) => ({ ...x, ...patch, log: [...x.log, { id: String(Math.random()), at: Date.now(), by: 'You', text }] })),
		update: (patch: Partial<MatchState>) => ms.update((x) => ({ ...x, ...patch })),
		cardAction: (req: CardReq) => ms.update((x) => ({ ...x, ...applyCardReq(x, req) }))
	} as unknown as MatchSession;
</script>

<svelte:head><title>Preview · 2.0 game · GoA2</title></svelte:head>

<GameView {session} {ms} players={readable(seated)} clientId="p1" room="PREVIEW" onLeave={() => history.back()} />
