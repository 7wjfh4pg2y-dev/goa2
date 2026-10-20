<script lang="ts">
	// Demo page: replay the game's splashes on demand (no game needed).
	import BattleSplash from '$lib/BattleSplash.svelte';
	import PushSplash from '$lib/PushSplash.svelte';
	import DefeatSplash from '$lib/DefeatSplash.svelte';
	import TurnSplash from '$lib/TurnSplash.svelte';
	import LevelSplash from '$lib/LevelSplash.svelte';
	import VictorySplash from '$lib/VictorySplash.svelte';
	import NebkherSplash from '$lib/hud2/NebkherSplash.svelte';
	import LaughBurst from '$lib/hud2/LaughBurst.svelte';
	import EssenceWisps from '$lib/hud2/EssenceWisps.svelte';
	import GydionBook from '$lib/hud2/GydionBook.svelte';
	import SpellToast from '$lib/hud2/SpellToast.svelte';
	import EmmittSplash from '$lib/hud2/EmmittSplash.svelte';
	import TimeSplash from '$lib/hud2/TimeSplash.svelte';
	import SnorriSplash from '$lib/hud2/SnorriSplash.svelte';
	import RuneMark from '$lib/hud2/RuneMark.svelte';
	import TokenWave from '$lib/hud2/TokenWave.svelte';
	import TakaSwapToast from '$lib/hud2/TakaSwapToast.svelte';
	import ReadyForWar from '$lib/hud2/ReadyForWar.svelte';
	import GoldThread from '$lib/hud2/GoldThread.svelte';
	import EquilibriumSwirl from '$lib/hud2/EquilibriumSwirl.svelte';
	import ChaosFlip from '$lib/hud2/ChaosFlip.svelte';
	import IgnatiaSplash from '$lib/hud2/IgnatiaSplash.svelte';
	import IgnatiaCoin from '$lib/hud2/IgnatiaCoin.svelte';
	import SnorriRunes from '$lib/hud2/SnorriRunes.svelte';
	import TakaGold from '$lib/hud2/TakaGold.svelte';
	import EmmittClock from '$lib/hud2/EmmittClock.svelte';
	import NebkherEye from '$lib/hud2/NebkherEye.svelte';
	import RazzleTop from '$lib/hud2/RazzleTop.svelte';
	import ComicPop, { type PopKind } from '$lib/hud2/ComicPop.svelte';
	import PoofCloud from '$lib/hud2/PoofCloud.svelte';
	import { newPlayerCardState } from '$lib/cards/cardstate';
	import { RUNES, type NkColor, type Rune } from '$lib/heropower';
	import { BOOK } from '$lib/gydion';
	import { schoolOf, SCHOOL_COLOR } from '$lib/cards/spells';
	import { portraitCss, altFace } from '$lib/heroes';
	import YourTurn, { TURN_CUE_LOOKS, TURN_CUE_DEFAULT, type TurnCueLook } from '$lib/YourTurn.svelte';
	import type { BattleNews, DefeatNews, Team } from '$lib/match';
	import type { PushNews } from '$lib/battle';
	import type { PlayerCardState } from '$lib/cards/cardstate';
	import type { GameStatsData } from '$lib/GameStats.svelte';
	import { teamAdj } from '$lib/teams';
	import { uiLayout, layoutVars } from '$lib/layout';
	import { HEROES } from '$lib/heroes';

	let w = 1440, h = 900;
	$: mobile = w <= 760;
	// the same UI scale the game puts on its wrapper (not on phones), so the splashes are sized as in a game
	$: vars = mobile ? '' : layoutVars(uiLayout(w, h));
	const id = (p: string) => `${p}_${Date.now()}`;

	// minion battle
	let news: BattleNews | null = null;
	let orange = 4, blue = 6;
	function battle(o: number, b: number) {
		const loser = o < b ? 'orange' : b < o ? 'blue' : null;
		news = { id: id('b'), orange: o, blue: b, loser, remove: loser ? Math.abs(o - b) : 0, at: Date.now() };
	}

	// the wave advances
	let push: PushNews | null = null;
	let wonT: ReturnType<typeof setTimeout> | null = null;
	function pushed(winner: Team, to: string | null, why: string | null = null) {
		push = { id: id('p'), winner, from: 'Center', to, wavesBefore: 5, wavesAfter: why === 'won the Final Push' ? 0 : 4, won: why, at: Date.now() };
		// a game-winning push: the victory card follows 5 s later, as in the game (GameView's `victoryHold`)
		if (wonT) clearTimeout(wonT);
		won = null;
		if (why) wonT = setTimeout(() => (won = { team: winner, reason: why }), 5000);
	}
	const throneOf = (loser: Team) => `pushed into the ${teamAdj(loser)} Throne`;

	// a hero falls (sample heroes / players)
	const names: Record<string, string> = { a: 'Zara', b: 'Priya', c: 'Mo', d: 'Sam' }; // a, c orange · b, d blue
	const cards = { a: { hero: 'arien' }, b: { hero: 'brogan' }, c: { hero: 'xargatha' }, d: { hero: 'trinkets' } } as unknown as Record<string, PlayerCardState>;
	const art = import.meta.glob('/src/lib/cards/images/life_counter_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const lifeArt = (t: Team, side: 'front' | 'back') => art[`/src/lib/cards/images/life_counter_${t}_${side}.png`] ?? '';
	let kill: DefeatNews | null = null;
	function defeat(victim: string, by: string, team: Team, coins: number, assists: string[], lives: number) {
		kill = { id: id('d'), victim, by, coins, assist: lives, assists, lives, team, at: Date.now() };
		// (the demo has no board: the splash reads each hero from `cards`)
	}

	// game over
	let won: { team: Team; reason: string } | null = null;
	let me: Team | null = 'orange'; // whose eyes we watch through: your team sits on the right (null = a spectator)
	$: side = (me ?? 'blue') as Team; // the lane / defeat splashes show spectators the Titan view
	let turnSplash: TurnSplash;
	// YOUR TURN: the three looks to choose from (the game uses TURN_CUE_DEFAULT)
	let cueLook: TurnCueLook = TURN_CUE_DEFAULT;
	let cue: YourTurn;
	const CUE_HEROES = [{ hero: 'tigerclaw', heroName: 'Tigerclaw', card: 'Hit and Run', color: '#e11d48', team: 'orange' as const }, { hero: 'xargatha', heroName: 'Xargatha', card: 'Stone Gaze', color: '#14b8a6', team: 'blue' as const }];
	function playCue(l: TurnCueLook) { cueLook = l; setTimeout(() => cue?.play(CUE_HEROES[me === 'blue' ? 1 : 0]), 0); }
	let levelSplash: LevelSplash;
	// NebKher (4★ lab) — demos only, not in games yet
	let nkSplash: NebkherSplash, nkBurst: LaughBurst, nkTok: HTMLElement, nkUlt = false, bx = 0, by = 0;
	function laughBurst() { const r = nkTok.getBoundingClientRect(); bx = r.left + r.width / 2; by = r.top + r.height / 2; setTimeout(() => nkBurst.play(), 0); }
	// Gydion's Prepare Spells: the essence wisps out of his token — into the token (everyone else) or the book (his screen)
	let ess: EssenceWisps, gyTok: HTMLElement, gyBook: HTMLElement;
	const ESS: Record<string, string> = { gold: '#ffd25e', red: '#ff5a4e', green: '#4fe07a', blue: '#5b9bff', purple: '#c08cff' };
	function wisps(n: number, intoBook: boolean) {
		const c = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
		const ids = [...BOOK].sort(() => Math.random() - 0.5).slice(0, n);
		ess.play(c(gyTok), c(intoBook ? gyBook : gyTok), ids.map((id) => ESS[SCHOOL_COLOR[schoolOf(id)] ?? 'gold']));
	}
	// ── the 4★ heroes: every splash and every dash-button state (the user, 2026-10-20) ──
	let fourFx = true; // the Dashboard switch (motion)
	let spellToast: SpellToast;
	const tbArt = import.meta.glob('/src/lib/cards/images/tiebreaker_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const coinArt = (t: Team) => tbArt[`/src/lib/cards/images/tiebreaker_${t}.png`] ?? '';
	let igFace: Team = 'orange', igSplit = false, igUlt = false, igReady = false, igUsed = false;
	let snRunes: Rune[] | null = [...RUNES], snTurn = 0, snEdit = false, snCan2 = false, snSecond: Rune | null = null, snUlt = false;
	let tkKind: 'gold' | 'bushido' | null = null, tkUlt = false;
	$: tkCs = { ...newPlayerCardState('takahide'), ultimate: tkUlt } as PlayerCardState;
	let emMode: 'idle' | 'run' | 'green' | 'rev' = 'idle';
	let emSplash: EmmittSplash, timeSplash: TimeSplash;
	let snSplash: SnorriSplash;
	let tokWave: TokenWave, tkToast: TakaSwapToast, rfw: ReadyForWar, thread: GoldThread, eqSwirl: EquilibriumSwirl, chaos: ChaosFlip, igSplash: IgnatiaSplash;
	let tkTok: HTMLElement, tkMate: HTMLElement, igTok: HTMLElement, tkFrom = 0;
	const mid = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
	function goldWave() { const m = mid(tkTok); tokWave.play(m.x, m.y, m.w); }
	function swapToast() { const a = tkFrom, b = (tkFrom + 1) % 3; tkFrom = b; tkToast.play(a, b); goldWave(); }
	function sake() { thread.play(mid(tkTok), mid(tkMate)); }
	function eq() { const m = mid(igTok); eqSwirl.play(m.x, m.y, m.w); }
	let nkKind: 'laugh' | 'grip' | 'name' | 'crack' | null = null, nkDoubt: NkColor | null = null, nkUltB = false;
	let rzN = 1, rzUlt = false, rzSparkle = true, rzKind: 'spawn' | 'clear' | 'retrieve' | null = null;
	let comic: ComicPop, poof: PoofCloud, rzFoe: HTMLElement, rzDbl: HTMLElement, rzDblOn = true;
	function bop(k: PopKind) { const m = mid(rzFoe); comic.play(m.x, m.y, m.w, k); }
	function poofDbl() { const m = mid(rzDbl), out = rzDblOn; poof.play(m.x, m.y, m.w, out); setTimeout(() => (rzDblOn = !out), poof.coverAt); }
	$: rzBodies = Array.from({ length: rzN }, (_, i) => ({ id: i ? `p~${i}` : 'p', face: i }));
	let gyMode: 'idle' | 'loaded' | 'open' | 'picked' | 'cast' = 'idle', gySchool = 'evocation', gyUlt = false, gyWishes = 0;
	const GY_SCHOOLS = ['cantrip', 'evocation', 'necromancy', 'abjuration', 'conjuration', 'enchantment', 'transmutation'];
	let round = 2, turn = 1;

	// sample battle reports: each is built from its list of hero defeats, so kills / deaths / assists add up
	type Seat = [id: string, name: string, color: string, hero: string, team: Team, level: number, minions: number, coins: number];
	type Fall = [turn: number, victim: string, killer: string, ...assists: string[]];
	function report(seats: Seat[], minutes: number, tide: number[], ev: Fall[]): GameStatsData {
		const players = seats.map(([id, name, color, hero, team, level, minions, coins]) => ({ id, name, color, hero, team, level, kills: 0, deaths: 0, assists: 0, minions, coins }));
		const by = (i: string) => players.find((p) => p.id === i)!;
		const falls = ev.map(([t, v, k, ...as]) => {
			by(v).deaths++; by(k).kills++; as.forEach((x) => by(x).assists++);
			return { turn: t, team: by(v).team, who: `${by(v).name} (${HEROES.find((x) => x.id === by(v).hero)?.name})` };
		});
		return { rounds: Math.ceil(tide.length / 4), minutes, players, tide, falls };
	}
	const REPORTS: { label: string; team: Team; reason: string; stats: GameStatsData }[] = [
		{ label: '2 v 2 · a short stomp', team: 'orange', reason: 'pushed into the Titan Throne', stats: report([
			['a', 'Zara', '#dc2626', 'arien', 'orange', 4, 7, 14], ['c', 'Mo', '#14b8a6', 'xargatha', 'orange', 4, 6, 12],
			['b', 'Priya', '#22d3ee', 'rowenna', 'blue', 3, 3, 7], ['d', 'Sam', '#84cc16', 'trinkets', 'blue', 2, 2, 5]
		], 41, [1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3],
		[[1, 'd', 'a'], [2, 'b', 'c', 'a'], [5, 'd', 'c', 'a'], [6, 'c', 'b', 'd'], [8, 'b', 'a', 'c'], [9, 'd', 'a'], [10, 'b', 'c', 'a']]) },
		{ label: '3 v 3 · final push', team: 'blue', reason: 'won the Final Push', stats: report([
			['a', 'Zara', '#dc2626', 'arien', 'orange', 5, 8, 19], ['c', 'Mo', '#14b8a6', 'xargatha', 'orange', 5, 11, 18], ['e', 'Ash', '#eab308', 'brogan', 'orange', 6, 6, 23],
			['b', 'Priya', '#22d3ee', 'rowenna', 'blue', 7, 9, 27], ['d', 'Sam', '#84cc16', 'trinkets', 'blue', 6, 13, 24], ['f', 'Jo', '#a855f7', 'misa', 'blue', 6, 5, 22]
		], 96, [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
		[[3, 'c', 'b', 'd'], [6, 'e', 'f'], [6, 'd', 'a', 'c'], [9, 'f', 'e', 'a'], [11, 'a', 'b', 'f'], [12, 'c', 'd', 'b'], [15, 'b', 'e', 'c'], [17, 'e', 'd', 'f'], [18, 'a', 'f', 'b'], [19, 'c', 'b', 'd']]) },
		{ label: '4 v 4 · long, back and forth', team: 'blue', reason: 'Atlanteans ran out of Life Tokens', stats: report([
			['a', 'Zara', '#dc2626', 'arien', 'orange', 7, 12, 37], ['c', 'Mo', '#14b8a6', 'xargatha', 'orange', 6, 17, 31],
			['e', 'Ash', '#eab308', 'brogan', 'orange', 8, 9, 44], ['g', 'Lee', '#f472b6', 'wasp', 'orange', 5, 8, 24],
			['b', 'Priya', '#22d3ee', 'rowenna', 'blue', 8, 14, 42], ['d', 'Sam', '#84cc16', 'trinkets', 'blue', 7, 19, 36],
			['f', 'Jo', '#a855f7', 'misa', 'blue', 8, 7, 45], ['h', 'Kit', '#f8fafc', 'wuk', 'blue', 6, 11, 29]
		], 214, [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
		[[2, 'h', 'a', 'c'], [5, 'd', 'e'], [5, 'b', 'a', 'g'], [9, 'f', 'c', 'e'], [10, 'g', 'b', 'f'], [13, 'c', 'f', 'd'], [14, 'g', 'h', 'b'], [14, 'a', 'd'], [17, 'f', 'e', 'a'],
			[19, 'b', 'g', 'c'], [21, 'h', 'a', 'e'], [22, 'd', 'c'], [25, 'e', 'f', 'h'], [26, 'c', 'b', 'd'], [29, 'g', 'd', 'f'], [30, 'a', 'f', 'b', 'h'], [32, 'f', 'e'],
			[33, 'c', 'h', 'd'], [34, 'e', 'b', 'f'], [35, 'g', 'f', 'b']]) },
		{ label: '5 v 5 · the throne falls', team: 'blue', reason: 'pushed into the Atlantean Throne', stats: report([
			['a', 'Zara', '#dc2626', 'arien', 'orange', 6, 9, 28], ['c', 'Mo', '#14b8a6', 'xargatha', 'orange', 5, 12, 22], ['e', 'Ash', '#eab308', 'brogan', 'orange', 7, 6, 33],
			['g', 'Lee', '#f472b6', 'wasp', 'orange', 5, 7, 21], ['i', 'Noor', '#c2410c', 'sabina', 'orange', 6, 10, 26],
			['b', 'Priya', '#22d3ee', 'rowenna', 'blue', 8, 11, 41], ['d', 'Sam', '#84cc16', 'trinkets', 'blue', 7, 15, 34], ['f', 'Jo', '#a855f7', 'misa', 'blue', 7, 6, 35],
			['h', 'Kit', '#f8fafc', 'wuk', 'blue', 6, 9, 27], ['j', 'Ravi', '#64748b', 'bain', 'blue', 6, 8, 29]
		], 161, [1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1],
		[[1, 'j', 'a'], [4, 'h', 'e', 'g'], [4, 'd', 'i', 'a'], [7, 'g', 'b', 'j'], [7, 'i', 'f', 'b', 'h'], [7, 'c', 'd'], [11, 'a', 'j', 'f'], [12, 'f', 'c', 'e'], [14, 'b', 'g', 'i'],
			[17, 'e', 'h', 'd', 'b'], [18, 'g', 'f'], [18, 'c', 'b', 'j'], [21, 'i', 'd', 'h'], [22, 'a', 'b', 'f'], [23, 'j', 'e'], [25, 'g', 'j', 'd'], [25, 'e', 'f', 'b'], [26, 'c', 'h', 'd'], [26, 'a', 'b']]) }
	];
	let stats: GameStatsData = REPORTS[2].stats;
	function over(team: Team, reason: string, s: GameStatsData = REPORTS[2].stats) { stats = s; won = { team, reason }; }
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />
<svelte:head><title>Splash demo · GoA2</title></svelte:head>

<div class="page">
	<h1>Splash demo</h1>
	<div class="row view">
		<span>View as</span>
		<button class="o" class:off={me !== 'orange'} on:click={() => (me = 'orange')}>Atlantean player</button>
		<button class="b" class:off={me !== 'blue'} on:click={() => (me = 'blue')}>Titan player</button>
		<button class:off={me !== null} on:click={() => (me = null)}>Spectator</button>
	</div>
	<section>
		<h2>Your turn <small>(pick a look)</small></h2>
		<div class="row">
			{#each TURN_CUE_LOOKS as l (l.id)}<button class:off={cueLook !== l.id} on:click={() => playCue(l.id)}>{l.label}{l.id === TURN_CUE_DEFAULT ? ' (in the game now)' : ''}</button>{/each}
		</div>
	</section>
	<section>
		<h2>Minion battle</h2>
		<div class="row">
			<button class="o" on:click={() => battle(6, 3)}>Atlanteans win (6 : 3)</button>
			<button class="b" on:click={() => battle(4, 6)}>Titans win (4 : 6)</button>
			<button class="t" on:click={() => battle(5, 5)}>Deadlock (5 : 5)</button>
		</div>
		<div class="row custom">
			<label>Atlanteans <input type="number" min="0" max="12" bind:value={orange} /></label>
			<label>Titans <input type="number" min="0" max="12" bind:value={blue} /></label>
			<button on:click={() => battle(orange, blue)}>Play</button>
		</div>
	</section>
	<section>
		<h2>The wave advances</h2>
		<div class="row">
			<button class="o" on:click={() => pushed('orange', 'Blue Beach')}>Atlanteans push</button>
			<button class="b" on:click={() => pushed('blue', 'Orange Beach')}>Titans push</button>
		</div>
	</section>
	<section>
		<h2>The game-winning push</h2>
		<div class="row">
			<button class="o" on:click={() => pushed('orange', null, throneOf('blue'))}>Atlanteans: the throne falls</button>
			<button class="b" on:click={() => pushed('blue', null, throneOf('orange'))}>Titans: the throne falls</button>
		</div>
		<div class="row">
			<button class="o" on:click={() => pushed('orange', null, 'won the Final Push')}>Atlanteans: final push</button>
			<button class="b" on:click={() => pushed('blue', null, 'won the Final Push')}>Titans: final push</button>
		</div>
	</section>
	<section>
		<h2>Hero defeated</h2>
		<p class="note">Atlanteans: Zara (Arien), Mo (Xargatha) · Titans: Priya (Brogan), Sam (Trinkets)</p>
		<div class="row">
			<button class="b" on:click={() => defeat('a', 'b', 'orange', 3, ['d'], 1)}>Priya kills Zara</button>
			<button class="o" on:click={() => defeat('b', 'a', 'blue', 4, ['c'], 2)}>Zara kills Priya</button>
			<button class="o" on:click={() => defeat('b', 'c', 'blue', 4, ['a'], 2)}>Mo kills Priya</button>
			<button class="b" on:click={() => defeat('c', 'd', 'orange', 7, ['b'], 3)}>Sam kills Mo</button>
		</div>
	</section>
	<section>
		<h2>Game over</h2>
		<div class="row">
			<button class="o" on:click={() => over('orange', 'Titans ran out of Life Tokens')}>Atlanteans win (life)</button>
			<button class="b" on:click={() => over('blue', 'pushed into the Atlantean Throne')}>Titans win (throne)</button>
			<button class="o" on:click={() => over('orange', 'won the Final Push')}>Atlanteans win (final push)</button>
		</div>
		<div class="row">
			{#each REPORTS as r (r.label)}
				<button class={r.team === 'orange' ? 'o' : 'b'} on:click={() => over(r.team, r.reason, r.stats)}>{r.label}</button>
			{/each}
		</div>
	</section>
	<section>
		<h2>Turn / round</h2>
		<div class="row">
			<button on:click={() => { turn = turn % 4 + 1; turnSplash.play('turn', round, turn); }}>Next turn</button>
			<button on:click={() => { round += 1; turn = 1; turnSplash.play('round', round, 1); }}>Next round</button>
		</div>
		<div class="row">
			<button on:click={() => levelSplash.play('up', 7)}>Level up</button>
			<button on:click={() => levelSplash.play('up', 18, true)}>Level up (ultimate in reach)</button>
			<button on:click={() => levelSplash.play('pity', 1)}>Pity coin</button>
		</div>
	</section>

	<!-- the 4★ heroes -->
	<section class="four">
		<h2>4★ heroes <small>(splashes, effects and every dash-button state)</small></h2>
		<div class="row"><button class:off={!fourFx} on:click={() => (fourFx = !fourFx)}>Dashboard motion: {fourFx ? 'on' : 'off'}</button></div>
		<div class="grid4">
			<!-- Gydion -->
			<div class="hc wide">
				<div class="hh"><span class="pt" style={portraitCss('gydion')}></span><b>Gydion</b><small>spell toast · essence wisps · grimoire</small></div>
				<div class="row sm">
					<button on:click={() => spellToast.play('fireball', 'Attack 6 · Range 3')}>Fireball</button>
					<button on:click={() => spellToast.play('shield', '')}>Shield</button>
					<button on:click={() => spellToast.play('create-undead', 'Range 3')}>Create Undead</button>
					<button on:click={() => spellToast.play('midas-touch', '+3 coins')}>Midas' Touch</button>
					<button on:click={() => spellToast.play('polymorph', 'Range 3')}>Polymorph</button>
					<button on:click={() => spellToast.play('prepare', '', 0, [...BOOK])}>Prepare (21)</button>
					<button on:click={() => spellToast.play('prepare', '', 0, ['fireball', 'shield', 'polymorph', 'midas-touch'])}>Prepare (4)</button>
					<button class="t" on:click={() => spellToast.play('wish', '', 1)}>Wish 1 of 3</button>
					<button class="t" on:click={() => spellToast.play('wish', '', 3)}>The third Wish</button>
				</div>
				<div class="row sm nkrow">
					<span class="nktok gy" bind:this={gyTok} style={portraitCss('gydion')}></span>
					<button on:click={() => wisps(21, false)}>Wisps: 21 → token</button>
					<button on:click={() => wisps(4, false)}>4 → token</button>
					<button on:click={() => wisps(21, true)}>21 → his book</button>
					<span class="gybook" bind:this={gyBook} title="His dash grimoire"><GydionBook size={48} mode={gyMode} school={gyMode === 'idle' ? null : gySchool} ult={gyUlt} wishes={gyWishes} left={14} fx={fourFx} /></span>
				</div>
				<div class="row sm">
					{#each ['idle', 'loaded', 'open', 'picked', 'cast'] as m}<button class:off={gyMode !== m} on:click={() => (gyMode = m as typeof gyMode)}>{m}</button>{/each}
					<select bind:value={gySchool}>{#each GY_SCHOOLS as s}<option value={s}>{s}</option>{/each}</select>
					<button class:off={!gyUlt} on:click={() => (gyUlt = !gyUlt)}>Archwizard</button>
					{#if gyUlt}<button on:click={() => (gyWishes = (gyWishes + 1) % 4)}>Wishes {gyWishes}</button>{/if}
				</div>
			</div>
			<!-- NebKher -->
			<div class="hc wide">
				<div class="hh"><span class="pt" style={portraitCss('nebkher')}></span><b>NebKher</b><small>toasts · laugh burst · eye</small></div>
				<div class="row sm">
					<button on:click={() => nkSplash.play('laugh')}>He laughs</button>
					<button class="t" on:click={() => nkSplash.play('laugh', '', true)}>He laughs (ultimate)</button>
					<button on:click={() => nkSplash.play('steal', 'Stone Gaze')}>Steals your spell</button>
					<button on:click={() => nkSplash.play('swap')}>Swaps your cards</button>
					<button on:click={() => nkSplash.play('doubt', 'Red')}>Discard a colour</button>
					<button on:click={() => nkSplash.play('crack')}>Cracks reality</button>
				</div>
				<div class="row sm nkrow">
					<span class="nktok" bind:this={nkTok} style={portraitCss('nebkher')}></span>
					<button on:click={laughBurst}>Laugh burst</button>
					<button class:off={!nkUlt} on:click={() => (nkUlt = !nkUlt)}>Burst: ultimate colours</button>
					<span class="dbtn"><NebkherEye size={48} fx={fourFx} ult={nkUltB} kind={nkKind} doubt={nkDoubt} /></span>
				</div>
				<div class="row sm">
					<button class:off={nkKind !== null} on:click={() => (nkKind = null)}>rest</button>
					{#each ['laugh', 'grip', 'name', 'crack'] as k}<button class:off={nkKind !== k} on:click={() => (nkKind = k as typeof nkKind)}>{k}</button>{/each}
					<button class:off={!nkDoubt} on:click={() => (nkDoubt = nkDoubt ? null : 'RED')}>Doubt gem</button>
					<button class:off={!nkUltB} on:click={() => (nkUltB = !nkUltB)}>Ultimate</button>
				</div>
			</div>
			<!-- Ignatia -->
			<div class="hc">
				<div class="hh"><span class="pt" style={portraitCss('ignatia')}></span><b>Ignatia</b><small>demo: equilibrium toast · swirl · chaos flip</small></div>
				<div class="row sm nkrow">
					<span class="nktok ig" bind:this={igTok} style={portraitCss('ignatia')}></span>
					<button on:click={() => igSplash.play()}>Equilibrium toast</button>
					<button on:click={eq}>Equilibrium swirl</button>
					<button class="b" on:click={() => chaos.play('blue')}>Chaos → Titans</button>
					<button class="o" on:click={() => chaos.play('orange')}>Chaos → Atlanteans</button>
				</div>
				<div class="stage"><span class="dbtn"><IgnatiaCoin size={46} face={igFace} split={igSplit} ult={igUlt} ready={igReady} used={igUsed} flames={fourFx} art={coinArt} /></span></div>
				<div class="row sm">
					<button on:click={() => (igFace = igFace === 'orange' ? 'blue' : 'orange')}>Coin: {igFace === 'orange' ? 'Atlanteans' : 'Titans'}</button>
					<button class:off={!igSplit} on:click={() => (igSplit = !igSplit)}>Equilibrium</button>
					<button class:off={!igUlt} on:click={() => (igUlt = !igUlt)}>Ultimate</button>
					<button class:off={!igReady} on:click={() => (igReady = !igReady)}>Can flip</button>
					<button class:off={!igUsed} on:click={() => (igUsed = !igUsed)}>Flipped</button>
				</div>
			</div>
			<!-- Snorri -->
			<div class="hc">
				<div class="hh"><span class="pt" style={portraitCss('snorri')}></span><b>Snorri</b><small>inscribe banner · rune ignite · rune circle</small></div>
				<div class="row sm">
					<button on:click={() => snSplash.play(snRunes ?? [...RUNES])}>Inscribe banner</button>
					<span class="rrow">{#each snRunes ?? RUNES as r, t (t)}<RuneMark rune={r} size={30} on={t === snTurn} second={!!snSecond && snSecond === r} fx={fourFx} />{/each}</span>
				</div>
				<p class="note">Turn ↓ = the next rune ignites (brass) · Second rune = it ignites in violet</p>
				<div class="stage"><span class="dbtn"><SnorriRunes size={48} runes={snRunes} turnIdx={snTurn} second={snSecond} ult={snUlt} canEdit={snEdit} canSecond={snCan2} fx={fourFx} /></span></div>
				<div class="row sm">
					<button class:off={!snRunes} on:click={() => (snRunes = snRunes ? null : [...RUNES])}>Inscribed</button>
					<button on:click={() => (snTurn = (snTurn + 1) % 4)}>Turn {['I', 'II', 'III', 'IV'][snTurn]}</button>
					<button class:off={!snEdit} on:click={() => { snEdit = !snEdit; snCan2 = false; }}>Silver acting</button>
					<button class:off={!snCan2} on:click={() => { snCan2 = !snCan2; snUlt = snCan2 || snUlt; snEdit = false; }}>Rune Mastery</button>
					<button class:off={!snSecond} on:click={() => (snSecond = snSecond ? null : (snRunes ?? RUNES).find((r, i) => i !== snTurn) ?? null)}>Second rune</button>
				</div>
			</div>
			<!-- Takahide -->
			<div class="hc">
				<div class="hh"><span class="pt" style={portraitCss('takahide')}></span><b>Takahide</b><small>demo: gold wave · swap · ready for war · saké</small></div>
				<div class="row sm nkrow">
					<span class="nktok tk" bind:this={tkTok} style={portraitCss('takahide')}></span>
					<button on:click={goldWave}>Gold wave</button>
					<button on:click={swapToast}>Gold swap toast</button>
					<button class="t" on:click={() => rfw.play()}>Ready for War splash</button>
					<button on:click={sake}>Hold my Saké</button>
					<span class="nktok tk2" bind:this={tkMate} style={portraitCss('brogan')}></span>
				</div>
				<div class="stage"><span class="dbtn"><TakaGold size={48} cs={tkCs} kind={tkKind} fx={fourFx} /></span></div>
				<div class="row sm">
					<button class:off={tkKind !== null} on:click={() => (tkKind = null)}>rest</button>
					<button class:off={tkKind !== 'gold'} on:click={() => (tkKind = 'gold')}>Gold acting</button>
					<button class:off={tkKind !== 'bushido'} on:click={() => (tkKind = 'bushido')}>Bushido</button>
					<button class:off={!tkUlt} on:click={() => (tkUlt = !tkUlt)}>Ready for War</button>
				</div>
			</div>
			<!-- Emmitt -->
			<div class="hc">
				<div class="hh"><span class="pt" style={portraitCss('emmitt')}></span><b>Emmitt</b><small>reverse toast · hourglass · clock</small></div>
				<div class="row sm">
					<button on:click={() => emSplash.play()}>Reverse Time (toast)</button>
					<button class="t" on:click={() => timeSplash.play()}>The reversed turn</button>
				</div>
				<div class="stage"><span class="dbtn"><EmmittClock size={48} mode={emMode} fx={fourFx} /></span></div>
				<div class="row sm">
					{#each [['idle', 'Rest'], ['run', 'Time runs'], ['green', 'Can reverse'], ['rev', 'Reversed']] as [m, l]}<button class:off={emMode !== m} on:click={() => (emMode = m as typeof emMode)}>{l}</button>{/each}
				</div>
			</div>
			<!-- Razzle -->
			<div class="hc">
				<div class="hh"><span class="pt" style={portraitCss('razzle')}></span><b>Razzle</b><small>big top · juggling balls · demo: comic hits · poof</small></div>
				<div class="row sm nkrow">
					<span class="nktok rz" style={portraitCss('razzle')}></span>
					<span class="nktok rzd" class:gone={!rzDblOn} bind:this={rzDbl} style="background-image:url({altFace('razzle', 1)});background-size:cover;background-position:center"></span>
					<span class="nktok rzf" bind:this={rzFoe} style={portraitCss('brogan')}></span>
				</div>
				<div class="row sm">
					<button class="o" on:click={() => bop('hit')}>Bop (attack)</button>
					<button class="o" on:click={() => bop('ko')}>Smash (defeat)</button>
					<button on:click={() => bop('whiff')}>Whiff (defended)</button>
					<button class="t" on:click={poofDbl}>{rzDblOn ? 'Poof out' : 'Poof in'}</button>
				</div>
				<div class="stage"><span class="dbtn"><RazzleTop size={48} fx={fourFx} sparkle={rzSparkle} ult={rzUlt} kind={rzKind} bodies={rzBodies} left={4 - rzN} /></span></div>
				<div class="row sm">
					<button on:click={() => (rzN = rzN % 4 + 1)}>Bodies {rzN}</button>
					<button class:off={rzKind !== 'spawn'} on:click={() => (rzKind = rzKind === 'spawn' ? null : 'spawn')}>Stunt Doubles</button>
					<button class:off={!rzUlt} on:click={() => (rzUlt = !rzUlt)}>Royal Big Top</button>
					<button class:off={!rzSparkle} on:click={() => (rzSparkle = !rzSparkle)}>Sparkles</button>
				</div>
			</div>
		</div>
	</section>
</div>

<div class="scale" style={vars}>
<BattleSplash {news} {mobile} myTeam={side} />
<PushSplash news={push} {mobile} myTeam={side} />
<DefeatSplash news={kill} {cards} names={(i) => names[i] ?? i} {lifeArt} {mobile} myTeam={side} />
<TurnSplash bind:this={turnSplash} {mobile} />
<YourTurn bind:this={cue} look={cueLook} {mobile} />
<LevelSplash bind:this={levelSplash} {mobile} />
<NebkherSplash bind:this={nkSplash} phone={mobile} />
<EssenceWisps bind:this={ess} />
<SpellToast bind:this={spellToast} phone={mobile} />
<EmmittSplash bind:this={emSplash} phone={mobile} />
<TimeSplash bind:this={timeSplash} phone={mobile} />
<SnorriSplash bind:this={snSplash} phone={mobile} />
<TokenWave bind:this={tokWave} />
<TakaSwapToast bind:this={tkToast} phone={mobile} />
<ReadyForWar bind:this={rfw} phone={mobile} />
<GoldThread bind:this={thread} />
<EquilibriumSwirl bind:this={eqSwirl} />
<ChaosFlip bind:this={chaos} phone={mobile} art={coinArt} />
<IgnatiaSplash bind:this={igSplash} phone={mobile} />
<ComicPop bind:this={comic} />
<PoofCloud bind:this={poof} />
<LaughBurst bind:this={nkBurst} x={bx} y={by} size={56} ult={nkUlt} />
{#if won}
	{#key won}<VictorySplash round={stats.rounds} team={won.team} reason={won.reason} myTeam={me} {mobile} {stats} onClose={() => (won = null)} />{/key}
{/if}
</div>

<style>
	.scale { display: contents; }
	.page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 16px; box-sizing: border-box; color: #f6ead2; }
	h1 { margin: 0; font-weight: normal; font-size: 2rem; }
	h2 { margin: 0 0 8px; font-weight: normal; font-size: 1rem; letter-spacing: .2em; text-transform: uppercase; color: #d9c79a; text-align: center; }
	section { padding: 14px 18px; border-radius: 14px; background: rgba(12, 18, 32, .46); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, .12); }
	.row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
	.row + .row { margin-top: 10px; }
	button { font: inherit; padding: 8px 16px; border-radius: 10px; cursor: pointer; border: 1px solid rgba(255, 255, 255, .2); background: rgba(255, 255, 255, .08); color: #f1f5f9; }
	button.o { background: #ef7d22; border-color: transparent; color: #fff; }
	button.b { background: #2f7fe6; border-color: transparent; color: #fff; }
	button.t { background: #7a4292; border-color: transparent; color: #fff; }
	.view { align-items: center; gap: 10px; font-size: .9rem; color: #e3cf9c; }
	button.off { opacity: .4; }
	.note { margin: -2px 0 10px; text-align: center; font-size: .78rem; color: #cbd5e1; }
	.nkrow { align-items: center; gap: 14px; margin-top: 28px !important; }
	.gybook { margin-left: auto; display: flex; }
	.rrow { display: inline-flex; gap: 10px; align-items: center; padding: 0 6px; }
	.nktok.tk { box-shadow: 0 0 0 3px #ef7d22, 0 0 0 6px #e8c24a; }
	.nktok.tk2 { margin-left: auto; box-shadow: 0 0 0 3px #ef7d22, 0 0 0 6px #6ab0ff; }
	.nktok.ig { box-shadow: 0 0 0 3px #2f7fe6, 0 0 0 6px #ef7d22; }
	.nktok.rz { box-shadow: 0 0 0 3px #2f7fe6, 0 0 0 6px #ff3bb4; }
	.nktok.rzd { box-shadow: 0 0 0 3px #2f7fe6, 0 0 0 6px #ff3bb4; }
	.nktok.rzd.gone { opacity: 0; }
	.nktok.rzf { margin-left: auto; box-shadow: 0 0 0 3px #ef7d22, 0 0 0 6px #e8c24a; }
	.nktok.gy { box-shadow: 0 0 0 3px #2f7fe6, 0 0 0 6px #e8e8e8; }
	.nktok { width: 56px; height: 56px; border-radius: 50%; display: block; background-color: #0b1b30; box-shadow: 0 0 0 3px #ef7d22, 0 0 0 6px #7a4292; }
	.four { width: min(1180px, 100%); box-sizing: border-box; }
	.four h2 small { font-size: .7rem; letter-spacing: .1em; color: #9fb0c4; }
	.grid4 { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; margin-top: 12px; }
	.hc { padding: 12px; border-radius: 12px; background: rgba(4, 10, 20, .55); border: 1px solid rgba(255, 255, 255, .1); display: flex; flex-direction: column; gap: 10px; min-width: 0; }
	.hc.wide { grid-column: 1 / -1; }
	.hh { display: flex; align-items: center; gap: 10px; }
	.hh b { font-weight: normal; font-size: 1.15rem; }
	.hh small { margin-left: auto; font-size: .72rem; color: #9fb0c4; letter-spacing: .05em; }
	.pt { width: 34px; height: 34px; border-radius: 50%; background-color: #0b1b30; box-shadow: 0 0 0 2px #d8b36a; flex: none; }
	.stage { height: 120px; display: grid; place-items: center; border-radius: 10px; background: linear-gradient(180deg, #13304f, #0a1a2e); }
	.dbtn { pointer-events: none; display: inline-flex; align-items: center; justify-content: center; }
	.row.sm button { padding: 5px 11px; font-size: .82rem; }
	.row.sm select { font: inherit; font-size: .82rem; padding: 5px 8px; border-radius: 10px; background: rgba(0, 0, 0, .35); color: #fff; border: 1px solid rgba(255, 255, 255, .2); }
	.hc .nkrow { margin-top: 18px !important; }
	.custom label { display: flex; align-items: center; gap: 6px; font-size: .9rem; }
	.custom input { width: 56px; padding: 6px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(0, 0, 0, .35); color: #fff; font: inherit; }
</style>
