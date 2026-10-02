<script lang="ts">
	// Demo page: replay the game's splashes on demand (no game needed).
	import BattleSplash from '$lib/BattleSplash.svelte';
	import PushSplash from '$lib/PushSplash.svelte';
	import DefeatSplash from '$lib/DefeatSplash.svelte';
	import TurnSplash from '$lib/TurnSplash.svelte';
	import LevelSplash from '$lib/LevelSplash.svelte';
	import VictorySplash from '$lib/VictorySplash.svelte';
	import type { BattleNews, DefeatNews, Team } from '$lib/match';
	import type { PushNews } from '$lib/battle';
	import type { PlayerCardState } from '$lib/cards/cardstate';
	import type { GameStatsData } from '$lib/GameStats.svelte';
	import { teamAdj } from '$lib/teams';
	import { uiLayout, layoutVars } from '$lib/layout';

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
	const names: Record<string, string> = { a: 'Zaheen', b: 'Priya', c: 'Mo', d: 'Sam' }; // a, c orange · b, d blue
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
	let me: Team = 'orange'; // whose eyes we watch through: your team sits on the right
	let turnSplash: TurnSplash;
	let levelSplash: LevelSplash;
	let round = 2, turn = 1;
	// sample battle report (mockup data)
	const P = (id: string, name: string, color: string, hero: string, team: Team, level: number, kills: number, deaths: number, assists: number, minions: number, coins: number) =>
		({ id, name, color, hero, team, level, kills, deaths, assists, minions, coins });
	const sample: GameStatsData = {
		rounds: 6, minutes: 156,
		players: [
			P('a', 'Zaheen', '#dc2626', 'arien', 'orange', 7, 4, 2, 5, 9, 31), P('c', 'Mo', '#14b8a6', 'xargatha', 'orange', 6, 2, 3, 6, 14, 27),
			P('e', 'Anas', '#eab308', 'brogan', 'orange', 8, 5, 1, 3, 6, 38), P('g', 'Lee', '#f472b6', 'wasp', 'orange', 5, 1, 4, 4, 7, 22),
			P('b', 'Priya', '#22d3ee', 'rowenna', 'blue', 7, 3, 3, 5, 11, 30), P('d', 'Sam', '#84cc16', 'trinkets', 'blue', 6, 2, 2, 4, 16, 29),
			P('f', 'Jo', '#a855f7', 'misa', 'blue', 7, 4, 3, 2, 5, 33), P('h', 'Kit', '#f8fafc', 'wuk', 'blue', 5, 1, 2, 6, 8, 21)
		],
		tide: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0],
		falls: [
			{ turn: 2, team: 'blue', who: 'Kit (Wuk)' }, { turn: 5, team: 'blue', who: 'Sam (Trinkets)' }, { turn: 9, team: 'orange', who: 'Lee (Wasp)' },
			{ turn: 12, team: 'orange', who: 'Mo (Xargatha)' }, { turn: 13, team: 'orange', who: 'Lee (Wasp)' }, { turn: 17, team: 'blue', who: 'Jo (Misa)' },
			{ turn: 19, team: 'blue', who: 'Priya (Rowenna)' }, { turn: 21, team: 'orange', who: 'Zaheen (Arien)' }, { turn: 22, team: 'blue', who: 'Jo (Misa)' }
		]
	};
</script>

<svelte:window bind:innerWidth={w} bind:innerHeight={h} />
<svelte:head><title>Splash demo · GoA2</title></svelte:head>

<div class="page">
	<h1>Splash demo</h1>
	<div class="row view">
		<span>View as</span>
		<button class="o" class:off={me !== 'orange'} on:click={() => (me = 'orange')}>Atlantean player</button>
		<button class="b" class:off={me !== 'blue'} on:click={() => (me = 'blue')}>Titan player</button>
	</div>
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
		<p class="note">Atlanteans: Zaheen (Arien), Mo (Xargatha) · Titans: Priya (Brogan), Sam (Trinkets)</p>
		<div class="row">
			<button class="b" on:click={() => defeat('a', 'b', 'orange', 3, ['d'], 1)}>Priya kills Zaheen</button>
			<button class="o" on:click={() => defeat('b', 'a', 'blue', 4, ['c'], 2)}>Zaheen kills Priya</button>
			<button class="o" on:click={() => defeat('b', 'c', 'blue', 4, ['a'], 2)}>Mo kills Priya</button>
			<button class="b" on:click={() => defeat('c', 'd', 'orange', 7, ['b'], 3)}>Sam kills Mo</button>
		</div>
	</section>
	<section>
		<h2>Game over</h2>
		<div class="row">
			<button class="o" on:click={() => (won = { team: 'orange', reason: 'Titans ran out of Life Tokens' })}>Atlanteans win (life)</button>
			<button class="b" on:click={() => (won = { team: 'blue', reason: 'pushed into the Atlantean Throne' })}>Titans win (throne)</button>
			<button class="o" on:click={() => (won = { team: 'orange', reason: 'won the Final Push' })}>Atlanteans win (final push)</button>
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
</div>

<div class="scale" style={vars}>
<BattleSplash {news} {mobile} myTeam={me} />
<PushSplash news={push} {mobile} myTeam={me} />
<DefeatSplash news={kill} {cards} names={(i) => names[i] ?? i} {lifeArt} {mobile} myTeam={me} />
<TurnSplash bind:this={turnSplash} {mobile} />
<LevelSplash bind:this={levelSplash} {mobile} />
{#if won}
	{#key won}<VictorySplash round={6} team={won.team} reason={won.reason} myTeam={me} {mobile} stats={sample} onClose={() => (won = null)} />{/key}
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
	.custom label { display: flex; align-items: center; gap: 6px; font-size: .9rem; }
	.custom input { width: 56px; padding: 6px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(0, 0, 0, .35); color: #fff; font: inherit; }
</style>
