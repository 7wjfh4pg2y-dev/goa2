<script lang="ts">
	// One player on the Players tab: a hex medallion with their place (gold / silver / bronze for the top three), name
	// and rating, the win-rate bar, streaks, K/D/A · K/D · gold, favourite heroes and roles, the awards they hold.
	import type { PlayerAgg } from '$lib/league';
	import { colorHex } from '$lib/match';
	import { heroById, portraitCss, traitIcon, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import WinBar from './WinBar.svelte';
	import Glyph from './Glyph.svelte';

	export let p: PlayerAgg;
	export let rank = 0;
	export let titles: { title: string; blurb: string }[] = [];
	export let onOpen: () => void = () => {};

	$: heroes = Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins).slice(0, 3);
	$: roles = (Object.entries(p.roles) as [Trait, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3);
	$: kd = p.kdaGames ? (p.deaths ? (p.kills / p.deaths).toFixed(2) : `${p.kills}.00`) : '–';
	$: gold = p.coinGames ? Math.round(p.coins / p.coinGames) : null;
	const streak = (s: number) => (s > 0 ? `W${s}` : s < 0 ? `L${-s}` : '–');
	$: medal = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
	$: pc = p.color ? colorHex(p.color) : 'var(--brass)';
</script>

<article class="panel pc" style="--pc:{pc}">
	<span class="hex {medal}" title="#{rank} by rating"><svg viewBox="0 0 40 46" aria-hidden="true"><path d="M20 2 L38 12.5 V33.5 L20 44 L2 33.5 V12.5 Z" /></svg><b>{rank}</b></span>
	<header>
		<h3 class="nm">{p.name}</h3>
		<span class="rt {medal}" title="Rating (team Elo, starts at 1200)"><Glyph name="laurel" size={17} /><b>{p.rating}</b></span>
	</header>
	<WinBar wins={p.wins} games={p.games} />
	<div class="two">
		<div class="tile"><span><Glyph name="fire" size={13} /> Current</span><b class:w={p.streak > 0} class:l={p.streak < 0}>{streak(p.streak)}</b></div>
		<div class="tile"><span><Glyph name="laurel" size={13} /> Best</span><b>{p.bestStreak ? `W${p.bestStreak}` : '–'}</b></div>
	</div>
	<div class="three">
		<div class="tile"><span><Glyph name="kill" size={13} /> K/D/A</span><b>{p.kdaGames ? `${p.kills}/${p.deaths}/${p.assists}` : '–'}</b></div>
		<div class="tile"><span>K/D</span><b>{kd}</b></div>
		<div class="tile"><span><Glyph name="coin" size={13} /> Avg gold</span><b>{gold ?? '–'}</b></div>
	</div>
	<h4>Favourite heroes</h4>
	<div class="chips">
		{#each heroes as [h, t] (h)}<span class="chip"><i class="face" style={portraitCss(h)}></i>{heroById(h)?.name ?? h} <small>{t.games}</small></span>{/each}
	</div>
	<h4>Favourite roles</h4>
	<div class="chips">
		{#each roles as [t, n] (t)}<span class="chip">{#if traitIcon(t)}<img src={traitIcon(t)} alt="" />{/if}{TRAIT_LABELS[t]} <small>{n}</small></span>{/each}
	</div>
	{#if titles.length}
		<h4>Awards held</h4>
		<div class="chips">
			{#each titles.slice(0, 4) as t (t.title)}<span class="chip aw" title={t.blurb}>{t.title}</span>{/each}
			{#if titles.length > 4}<span class="chip more" title={titles.slice(4).map((t) => t.title).join(' · ')}>+{titles.length - 4} more</span>{/if}
		</div>
	{/if}
	<button class="btn btn-primary view" on:click={onOpen}>View player</button>
</article>

<style>
	.pc { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 18px 18px 16px 18px; border-top: 3px solid var(--pc); }
	.hex { position: absolute; left: -12px; top: -16px; width: 40px; height: 46px; display: grid; place-items: center; }
	.hex svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.hex path { fill: #0d2238; stroke: var(--brass-line); stroke-width: 2; }
	.hex b { position: relative; font-weight: 400; font-size: 17px; color: var(--ink-2); }
	.hex.gold path { fill: #d8b36a; stroke: #fff1c8; }
	.hex.silver path { fill: #b9c4cf; stroke: #f1f5f9; }
	.hex.bronze path { fill: #c07a43; stroke: #ffd9b3; }
	.hex.gold b, .hex.silver b, .hex.bronze b { color: #1b1204; }
	header { display: flex; align-items: center; gap: 10px; padding-left: 26px; }
	.nm { flex: 1; min-width: 0; margin: 0; font-size: 22px; font-weight: 400; letter-spacing: 0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rt { display: inline-flex; align-items: center; gap: 5px; color: var(--ink-2); }
	.rt b { font-weight: 400; font-size: 18px; color: var(--ink); }
	.rt.gold { color: #d8b36a; } .rt.silver { color: #c8d2dc; } .rt.bronze { color: #d38a52; }
	.two, .three { display: grid; gap: 8px; }
	.two { grid-template-columns: 1fr 1fr; }
	.three { grid-template-columns: repeat(3, 1fr); }
	.tile { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 6px; border-radius: 8px; background: var(--well); border: 1px solid var(--hair); }
	.tile span { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--brass); }
	.tile b { font-weight: 400; font-size: 19px; }
	.tile b.w { color: var(--ready-hi); } .tile b.l { color: var(--danger-hi); }
	h4 { margin: 0 0 -4px; font-size: 12.5px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; min-height: 28px; }
	.chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 4px; border-radius: 999px; font-size: 14px; background: var(--raise); border: 1px solid var(--hair); }
	.chip small { font-size: 12px; color: var(--ink-3); }
	.chip img { width: 18px; height: 18px; margin-left: 3px; }
	.chip .face { width: 22px; height: 22px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 1.5px var(--brass-line); }
	.chip.more { padding: 3px 10px; font-size: 12.5px; color: var(--brass-hi); border-color: var(--brass-line); }
	.chip.aw { padding: 2px 9px; font-size: 12.5px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); border-color: transparent; }
	.view { margin-top: auto; width: 100%; justify-content: center; }
</style>
