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
	let levelSplash: LevelSplash;
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
</div>

<div class="scale" style={vars}>
<BattleSplash {news} {mobile} myTeam={side} />
<PushSplash news={push} {mobile} myTeam={side} />
<DefeatSplash news={kill} {cards} names={(i) => names[i] ?? i} {lifeArt} {mobile} myTeam={side} />
<TurnSplash bind:this={turnSplash} {mobile} />
<LevelSplash bind:this={levelSplash} {mobile} />
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
	.custom label { display: flex; align-items: center; gap: 6px; font-size: .9rem; }
	.custom input { width: 56px; padding: 6px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, .2); background: rgba(0, 0, 0, .35); color: #fff; font: inherit; }
</style>
