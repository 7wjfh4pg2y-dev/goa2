<script lang="ts">
	// Token lab: every piece that can stand on the board, drawn exactly as the board draws it,
	// big enough to judge. No game, no network.
	import PieceDefs from '$lib/board/PieceDefs.svelte';
	import HeroToken from '$lib/board/HeroToken.svelte';
	import KitToken from '$lib/board/KitToken.svelte';
	import { HEROES_ALPHA } from '$lib/heroes';
	import { HERO_KIT, COMPANIONS, tokenName } from '$lib/tokens';

	// a spread of player colours, so every band colour gets seen
	const COLORS = ['#dc2626', '#f472b6', '#b45309', '#eab308', '#84cc16', '#16a34a', '#14b8a6', '#06b6d4', '#a855f7', '#d946ef', '#f8fafc', '#64748b', '#0f172a', '#fb7185'];
	const heroes = HEROES_ALPHA.map((h, i) => ({ ...h, color: COLORS[i % COLORS.length], team: i % 2 ? 'blue' : 'orange' }));
	// each hero's own pieces
	const kit = Object.entries(HERO_KIT).flatMap(([hero, list], i) =>
		list.map((t) => ({
			key: `${hero}-${t}`, hero, color: COLORS[(i * 3) % COLORS.length], team: i % 2 ? 'blue' : 'orange',
			token: t === 'companion' ? undefined : t, letter: t === 'companion' ? COMPANIONS[hero]?.[0] : undefined,
			name: t === 'companion' ? COMPANIONS[hero] ?? 'companion' : tokenName(t)
		})));
	const minions = (['orange', 'blue'] as const).flatMap((team) => (['melee', 'ranged', 'heavy'] as const).map((role) => ({ team, role })));
	let ground: 'sand' | 'earth' | 'jungle' | 'dark' = 'sand';
	const GROUND = { sand: '#e9d39a', earth: '#b98d57', jungle: '#5f9a3c', dark: '#141a26' };
</script>

<svelte:head><title>GoA2 · Token lab</title></svelte:head>

<!-- the shared drawings (minion art, skull, gradients) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><PieceDefs /></defs></svg>

<div class="lab" style="--g:{GROUND[ground]}">
	<header>
		<h1>Token lab</h1>
		<span class="seg">
			{#each Object.keys(GROUND) as g}<button class:on={ground === g} on:click={() => (ground = g as typeof ground)}>{g}</button>{/each}
		</span>
		<span class="note">Each piece is shown large, and at the size it has on the board.</span>
	</header>

	<h2>Heroes <small>— the outer band is the player's colour, the inner band the team (copper = Atlanteans, ice = Titans)</small></h2>
	<div class="grid heroes">
		{#each heroes as h (h.id)}
			<figure>
				<div class="pad">
					<svg class="big" viewBox="-60 -60 120 120"><HeroToken r={56} hero={h.id} team={h.team} color={h.color} uid="L{h.id}" /></svg>
					<svg class="small" viewBox="-60 -60 120 120"><HeroToken r={56} hero={h.id} team={h.team === 'blue' ? 'orange' : 'blue'} color={h.color} uid="S{h.id}" /></svg>
				</div>
				<figcaption>{h.name}</figcaption>
			</figure>
		{/each}
	</div>

	<h2>Hero tokens and markers <small>— tokens are hexes, markers are round; the rim is the owner's colour</small></h2>
	<div class="grid">
		{#each kit as k (k.key)}
			<figure>
				<div class="pad">
					<svg class="big" viewBox="-60 -60 120 120"><KitToken size={72} token={k.token} letter={k.letter} color={k.color} team={k.team} /></svg>
					<svg class="small" viewBox="-60 -60 120 120"><KitToken size={72} token={k.token} letter={k.letter} color={k.color} team={k.team} /></svg>
				</div>
				<figcaption>{k.name}<em>{k.hero}</em></figcaption>
			</figure>
		{/each}
		<figure>
			<div class="pad">
				<svg class="big" viewBox="-60 -60 120 120"><KitToken size={72} token="token_blast" mine="down" peek="B" color="#16a34a" /></svg>
				<svg class="small" viewBox="-60 -60 120 120"><KitToken size={72} token="token_dud" mine="down" color="#16a34a" /></svg>
			</div>
			<figcaption>mine, face down<em>min</em></figcaption>
		</figure>
	</div>

	<h2>Minions <small>— pips on the rim: 4 ranged · 6 melee · 8 heavy (they turn on the board)</small></h2>
	<div class="grid">
		{#each minions as m (m.team + m.role)}
			<figure>
				<div class="pad">
					<svg class="big" viewBox="-110 -110 220 220"><use href="#mn-token-{m.team}-{m.role}" /></svg>
					<svg class="small" viewBox="-110 -110 220 220"><use href="#mn-token-{m.team}-{m.role}" /></svg>
				</div>
				<figcaption>{m.role}<em>{m.team === 'orange' ? 'Atlanteans' : 'Titans'}</em></figcaption>
			</figure>
		{/each}
	</div>
</div>

<style>
	.lab { position: fixed; inset: 0; overflow: auto; padding: 18px 22px 40px; color: #f1f5f9; background: #0e1420; }
	header { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 6px; }
	h1 { margin: 0; font-size: 1.5rem; color: #ffe7a8; }
	h2 { font-size: 1.1rem; margin: 22px 0 10px; color: #e2e8f0; }
	h2 small { font-size: .8rem; color: #94a3b8; }
	.note { font-size: .8rem; color: #94a3b8; }
	.seg { display: inline-flex; border-radius: 9px; overflow: hidden; border: 1px solid rgba(255, 255, 255, .16); }
	.seg button { background: transparent; color: #cbd5e1; border: 0; padding: 5px 12px; font: inherit; cursor: pointer; text-transform: capitalize; }
	.seg button + button { border-left: 1px solid rgba(255, 255, 255, .12); }
	.seg button.on { background: linear-gradient(120deg, #ef7d22, #2f7fe6); color: #fff; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
	figure { margin: 0; text-align: center; }
	.pad { display: flex; align-items: flex-end; justify-content: center; gap: 8px; padding: 10px 6px; border-radius: 12px; background: var(--g); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .2); }
	svg.big { width: 104px; height: 104px; }
	svg.small { width: 44px; height: 44px; }
	figcaption { margin-top: 5px; font-size: .9rem; text-transform: capitalize; }
	figcaption em { display: block; font-style: normal; font-size: .72rem; color: #94a3b8; }
</style>
