<script lang="ts">
	// A hero's GLOBAL stats (the community site's numbers, globalstats.ts) — tagged GLOBAL so they never read as ours:
	// win rate, hero impact (+ its 95% interval), the site's tag, how its games ended / were won, and its best
	// teammates, best matchups and counters.
	import { heroById, portraitCss } from '$lib/heroes';
	import { GLOBAL_SOURCE, GLOBAL_AS_OF, GLOBAL_TAG, globalGames, globalWin, type GlobalHero, type GlobalVs } from '$lib/globalstats';

	export let g: GlobalHero;
	export let onHero: (id: string) => void = () => {};

	const TYPES = [['throne', 'Throne', '♛'], ['final', 'Final push', '⚑'], ['life', 'Life', '☠']] as const;
	const sgn = (n: number) => `${n > 0 ? '+' : ''}${n}`;
	$: total = globalGames(g);
	$: wr = globalWin(g);
	$: wonAll = g.won.reduce((a, b) => a + b, 0);
	$: groups = [['Best teammates', g.mates], ['Best against', g.beats], ['Countered by', g.countered]] as [string, GlobalVs[]][];
</script>

<section class="card gl">
	<div class="ch">Global stats<span class="gtag" title="From {GLOBAL_SOURCE}'s global stats, {GLOBAL_AS_OF} — not our games">GLOBAL</span><small>{GLOBAL_SOURCE} · {GLOBAL_AS_OF}</small>{#if g.tag}<span class="r tg {g.tag}">{GLOBAL_TAG[g.tag]}</span>{/if}</div>
	<div class="top">
		<div class="blk">
			<div class="kv2"><span>Win rate</span><b class:up={wr >= 50} class:down={wr < 50}>{wr.toFixed(1)}%</b></div>
			<span class="split"><i style="--v:{total ? g.wins / total : 0}"></i></span>
			<div class="sm"><span>Wins {g.wins}</span><span>Losses {g.losses}</span><span>Total {total}</span></div>
		</div>
		<div class="blk">
			<div class="kv2"><span>Hero impact</span><b class:up={g.impact > 0} class:down={g.impact < 0}>{sgn(g.impact)}%</b></div>
			<span class="imp"><em style="--a:{(g.ate[1] + 50) / 100}; --b:{(g.ate[2] + 50) / 100}"></em><i style="--v:{(g.impact + 50) / 100}"></i></span>
			<div class="sm"><span>−50</span><span>ATE {sgn(g.ate[0])}% (95% CI {g.ate[1]}% to {sgn(g.ate[2])}%)</span><span>+50</span></div>
		</div>
		<div class="blk">
			<div class="kv2"><span>Victory types</span><small>{g.typed} of {total} games</small></div>
			<div class="stk" title="Games by type">{#each TYPES as [k, l, ic], i (k)}{#if g.games[i]}<i class="t-{k}" style="flex:{g.games[i]}" title="{l}: {g.games[i]} games">{ic} {g.games[i]}</i>{/if}{/each}</div>
			{#if wonAll}<div class="stk" title="Wins by type">{#each TYPES as [k, l, ic], i (k)}{#if g.won[i]}<i class="t-{k}" style="flex:{g.won[i]}" title="{l}: {g.won[i]} wins">{ic} {g.won[i]}</i>{/if}{/each}</div>{/if}
			<div class="sm"><span>Games{wonAll ? ' · wins' : ''}</span><span>♛ Throne · ⚑ Final push · ☠ Life</span></div>
		</div>
	</div>
	<div class="vs">
		{#each groups as [label, list] (label)}
			<div class="vg">
				<div class="sub">{label}</div>
				<div class="vrow">
					{#each list as [id, p, n] (id)}
						<button class="vh" on:click={() => onHero(id)} title="{heroById(id)?.name ?? id} · {p}% of {n} game{n === 1 ? '' : 's'}">
							<span class="face" style="--fs:40px; {portraitCss(id)}"></span>
							<b>{heroById(id)?.name ?? id}</b>
							<small class:up={p >= 50} class:down={p < 50}>{p}% ({n})</small>
						</button>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</section>

<style>
	.gl { border-color: rgba(64, 196, 186, 0.35); }
	.ch small { margin-left: 8px; }
	.tg { padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; }
	.tg.beginner { color: #6be39a; background: rgba(53, 208, 122, 0.14); }
	.tg.skill { color: #c9a2ff; background: rgba(123, 69, 201, 0.25); }
	.top { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-bottom: 18px; }
	.blk { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.kv2 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.kv2 span { color: var(--tx2); font-size: 13.5px; }
	.kv2 b { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
	.kv2 small { color: var(--mu); font-size: 12px; }
	.split { position: relative; height: 6px; border-radius: 3px; background: #ef4f5c; overflow: hidden; }
	.split i { position: absolute; inset: 0 auto 0 0; width: 100%; background: #35d07a; transform-origin: left; transform: scaleX(var(--v)); }
	.imp { position: relative; height: 12px; border-radius: 6px; background: var(--p3); }
	.imp::after { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--mu); }
	.imp em { position: absolute; top: 0; bottom: 0; left: calc(var(--a) * 100%); right: calc((1 - var(--b)) * 100%); border-radius: 6px; background: rgba(255, 255, 255, 0.14); }
	.imp i { position: absolute; top: 2px; width: 8px; height: 8px; margin-left: -4px; left: calc(var(--v) * 100%); border-radius: 50%; background: var(--tx); }
	.sm { display: flex; justify-content: space-between; gap: 6px; font-size: 11.5px; color: var(--mu); font-variant-numeric: tabular-nums; }
	.stk { display: flex; height: 20px; border-radius: 4px; overflow: hidden; }
	.stk i { display: grid; place-items: center; min-width: 0; overflow: hidden; white-space: nowrap; font-style: normal; font-size: 11.5px; font-weight: 700; color: #fff; }
	.t-throne { background: #d9a514; } .t-final { background: #3a7fe0; } .t-life { background: #d9434e; }
	.vs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
	.vrow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.vh { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border: 0; border-radius: 8px; background: var(--p3); color: inherit; cursor: pointer; min-width: 0; }
	.vh:hover { background: var(--ln2); }
	.vh b { max-width: 100%; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.vh small { font-size: 11.5px; font-variant-numeric: tabular-nums; }
	@media (max-width: 900px) { .top, .vs { grid-template-columns: 1fr; } }
</style>
