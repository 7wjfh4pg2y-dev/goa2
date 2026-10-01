<script lang="ts">
	// Demo page: replay the game's splashes on demand (no game needed).
	import BattleSplash from '$lib/BattleSplash.svelte';
	import PushSplash from '$lib/PushSplash.svelte';
	import DefeatSplash from '$lib/DefeatSplash.svelte';
	import TurnSplash from '$lib/TurnSplash.svelte';
	import VictorySplash from '$lib/VictorySplash.svelte';
	import type { BattleNews, DefeatNews, Team } from '$lib/match';
	import type { PushNews } from '$lib/battle';
	import type { PlayerCardState } from '$lib/cards/cardstate';

	let w = 1440;
	$: mobile = w <= 760;
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
	function pushed(winner: Team, to: string | null, won: string | null = null) {
		push = { id: id('p'), winner, from: 'Center', to, wavesBefore: 5, wavesAfter: won === 'won the final push' ? 0 : 4, won, at: Date.now() };
	}

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
	const roster = (t: Team) => (t === 'orange' ? ['a', 'c'] : ['b', 'd']).map((pid) => ({ pid, hero: (cards[pid] as unknown as { hero: string }).hero, name: names[pid] }));
	let me: Team = 'orange'; // whose eyes we watch through: your team sits on the right
	let turnSplash: TurnSplash;
	let round = 2, turn = 1;
</script>

<svelte:window bind:innerWidth={w} />
<svelte:head><title>Splash demo · GoA2</title></svelte:head>

<div class="page">
	<h1>Splash demo</h1>
	<div class="row view">
		<span>View as</span>
		<button class="o" class:off={me !== 'orange'} on:click={() => (me = 'orange')}>Orange player</button>
		<button class="b" class:off={me !== 'blue'} on:click={() => (me = 'blue')}>Blue player</button>
	</div>
	<section>
		<h2>Minion battle</h2>
		<div class="row">
			<button class="o" on:click={() => battle(6, 3)}>Orange wins (6 : 3)</button>
			<button class="b" on:click={() => battle(4, 6)}>Blue wins (4 : 6)</button>
			<button class="t" on:click={() => battle(5, 5)}>Deadlock (5 : 5)</button>
		</div>
		<div class="row custom">
			<label>Orange <input type="number" min="0" max="12" bind:value={orange} /></label>
			<label>Blue <input type="number" min="0" max="12" bind:value={blue} /></label>
			<button on:click={() => battle(orange, blue)}>Play</button>
		</div>
	</section>
	<section>
		<h2>The wave advances</h2>
		<div class="row">
			<button class="o" on:click={() => pushed('orange', 'Blue Beach')}>Orange pushes</button>
			<button class="b" on:click={() => pushed('blue', 'Orange Beach')}>Blue pushes</button>
		</div>
		<div class="row">
			<button class="o" on:click={() => pushed('orange', null, 'pushed into the Blue throne')}>Orange: the throne falls</button>
			<button class="b" on:click={() => pushed('blue', null, 'won the final push')}>Blue: final push</button>
		</div>
	</section>
	<section>
		<h2>Hero defeated</h2>
		<p class="note">Orange: Zaheen (Arien), Mo (Xargatha) · Blue: Priya (Brogan), Sam (Trinkets)</p>
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
			<button class="o" on:click={() => (won = { team: 'orange', reason: 'Blue ran out of Life' })}>Orange wins (life)</button>
			<button class="b" on:click={() => (won = { team: 'blue', reason: 'pushed into the Orange throne' })}>Blue wins (throne)</button>
			<button class="o" on:click={() => (won = { team: 'orange', reason: 'won the final push' })}>Orange wins (final push)</button>
		</div>
	</section>
	<section>
		<h2>Turn / round</h2>
		<div class="row">
			<button on:click={() => { turn = turn % 4 + 1; turnSplash.play('turn', round, turn); }}>Next turn</button>
			<button on:click={() => { round += 1; turn = 1; turnSplash.play('round', round, 1); }}>Next round</button>
		</div>
	</section>
</div>

<BattleSplash {news} {mobile} myTeam={me} />
<PushSplash news={push} {mobile} myTeam={me} />
<DefeatSplash news={kill} {cards} names={(i) => names[i] ?? i} {lifeArt} {mobile} myTeam={me} />
<TurnSplash bind:this={turnSplash} {mobile} />
{#if won}
	{#key won}<VictorySplash life={won.team === 'orange' ? { orange: 4, blue: 0 } : { orange: 2, blue: 5 }} waves={3} round={5} team={won.team} reason={won.reason} winners={roster(won.team)} myTeam={me} {mobile} onClose={() => (won = null)} />{/key}
{/if}

<style>
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
