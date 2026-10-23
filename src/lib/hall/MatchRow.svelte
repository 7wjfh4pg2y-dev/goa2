<script lang="ts">
	// One game in the Matches list: when, how it was won, the two teams as hero faces (winners lit), and — opened —
	// every seat with K / D / M (kills, deaths, minions), gold and level, plus the defeats in order.
	import type { LeagueGame } from '$lib/league';
	import { WIN_LABEL, momentsOf } from '$lib/league';
	import { heroById, portraitCss } from '$lib/heroes';
	import { teamName } from '$lib/teams';

	export let g: LeagueGame;
	export let onPlayer: (key: string) => void = () => {};
	export let onHero: (id: string) => void = () => {};
	export let onReport: (() => void) | null = null;
	let open = false;

	const heroName = (id: string) => heroById(id)?.name ?? id;
	const when = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
	const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
	$: sides = (['orange', 'blue'] as const).map((t) => ({ t, ps: g.players.filter((p) => p.team === t) }));
	$: nameOf = (k: string) => g.players.find((p) => p.key === k)?.name ?? k;
</script>

<div class="mr" class:open>
	<button class="ml" on:click={() => (open = !open)} aria-expanded={open}>
		<span class="md"><b>{when(g.at)}</b><small>{g.legacy ? 'Table game' : `${WIN_LABEL[g.type]} · R${g.rounds}${g.minutes ? ` · ${hm(g.minutes)}` : ''}`}</small></span>
		{#each sides as s, i (s.t)}
			{#if i === 1}<span class="vs">VS</span>{/if}
			<span class="side s-{s.t}" class:won={g.winner === s.t}>
				<span class="sl">{teamName(s.t)}{#if g.winner === s.t}<em>WIN</em>{/if}</span>
				<span class="faces">{#each s.ps as p (p.key + p.hero)}<span class="face" style="--fs:36px; {portraitCss(p.hero)}" title="{heroName(p.hero)} · {p.name}"></span>{/each}</span>
			</span>
		{/each}
		<span class="sz">{g.side}v{g.side}</span>
	</button>
	{#if open}
		<div class="mb">
			{#each sides as s (s.t)}
				<table class="tbl">
					<thead><tr><th class:team-o={s.t === 'orange'} class:team-b={s.t === 'blue'}>{teamName(s.t)} {g.winner === s.t ? '· Victory' : '· Defeat'}</th><th class="rt">K</th><th class="rt">D</th><th class="rt">M</th><th class="rt">Gold</th><th class="rt">Lv</th></tr></thead>
					<tbody>
						{#each s.ps as p (p.key + p.hero)}
							<tr on:click={() => onPlayer(p.key)}>
								<td><span class="pc"><button class="linky" on:click|stopPropagation={() => onHero(p.hero)} title={heroName(p.hero)}><span class="face" style="--fs:28px; {portraitCss(p.hero)}"></span></button><span><b>{p.name}</b><small>{heroName(p.hero)}</small></span></span></td>
								<td class="rt up">{p.kills ?? '–'}</td><td class="rt down">{p.deaths ?? '–'}</td><td class="rt b">{p.minions ?? '–'}</td><td class="rt au">{p.coins ?? '–'}</td><td class="rt">{p.level || '–'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/each}
			{#if g.players.some((p) => momentsOf(p.x).length)}
				<div class="tl mo"><span class="sub">Moments</span>{#each g.players as p (p.key + p.hero)}{#each momentsOf(p.x) as mo (mo.id)}<span class="dv" title={mo.blurb}><b class="mt">{mo.title}</b>{#if mo.n > 1} ×{mo.n}{/if} · {p.name}</span>{/each}{/each}</div>
			{/if}
			{#if g.defeats.length}
				<div class="tl"><span class="sub">Defeats</span>{#each g.defeats as d, i (i)}<span class="dv">{nameOf(d.by)} <i>→</i> {nameOf(d.v)} <small>R{d.r}·T{d.t}</small></span>{/each}</div>
			{/if}
			{#if onReport}<button class="btn2 rp" on:click={onReport}>Match report</button>{/if}
		</div>
	{/if}
</div>

<style>
	.mr { border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
	.mr.open { background: rgba(255, 255, 255, 0.02); }
	.ml { width: 100%; display: grid; grid-template-columns: 150px minmax(0, 1fr) 30px minmax(0, 1fr) 44px; align-items: center; gap: 14px; padding: 10px 6px; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
	.ml:hover { background: rgba(255, 255, 255, 0.025); }
	.md { display: flex; flex-direction: column; gap: 2px; }
	.md b { font-size: 14px; }
	.md small { font-size: 12px; color: var(--mu); }
	.vs { font-size: 11px; font-weight: 800; color: var(--mu2); text-align: center; }
	.side { display: flex; flex-direction: column; gap: 5px; min-width: 0; opacity: 0.55; }
	.side.won { opacity: 1; }
	.side.s-blue { align-items: flex-end; }
	.sl { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
	.s-orange .sl { color: var(--or); } .s-blue .sl { color: var(--ti); }
	.sl em { font-style: normal; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; color: #04230f; background: var(--gr); }
	.faces { display: flex; gap: 4px; flex-wrap: wrap; }
	.s-blue .faces { justify-content: flex-end; }
	.won .face { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 0 2px var(--gr); }
	.sz { font-size: 12px; font-weight: 700; color: var(--mu); text-align: right; }
	.mb { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; padding: 4px 8px 16px; }
	.pc { display: inline-flex; align-items: center; gap: 10px; }
	.pc span { display: flex; flex-direction: column; }
	.pc b { font-size: 13.5px; }
	.pc small { font-size: 11.5px; color: var(--mu); }
	.tl { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
	.tl .sub { margin: 0 6px 0 0; }
	.dv { padding: 3px 8px; border-radius: 6px; background: var(--p3); font-size: 12.5px; }
	.mt { font-weight: 400; color: #f4dfa8; }
	.dv i { font-style: normal; color: var(--rd); }
	.dv small { color: var(--mu); }
	.rp { grid-column: 1 / -1; justify-self: start; }
	@media (max-width: 760px) {
		.ml { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
		.md { grid-column: 1 / -1; }
		.vs, .sz { display: none; }
		.mb { grid-template-columns: minmax(0, 1fr); padding: 4px 0 14px; }
	}
</style>
