<script lang="ts">
	// One finished game: a band in the winners' colour with their crest (gear = Atlanteans, star = Titans), the date
	// and how / how long; the two sides (Atlanteans left, Titans right; the winners outlined), each player with hero,
	// roles and K / D / A · gold · level; the game's feats; and its timeline of hero defeats (round · turn).
	import type { LeagueGame, GamePlayer } from '$lib/league';
	import { WIN_LABEL } from '$lib/league';
	import { teamName } from '$lib/teams';
	import { colorHex } from '$lib/match';
	import { heroById, portraitCss, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import Glyph from './Glyph.svelte';

	export let g: LeagueGame;
	export let onPlayer: (key: string) => void = () => {};
	let open = true;
	let timeline = false;

	const SIDES = ['orange', 'blue'] as const;
	const when = (t: number) => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
	const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
	const nameOf = (k: string) => g.players.find((p) => p.key === k)?.name ?? k;
	const roles = (id: string) => (heroById(id)?.traits ?? []).slice(0, 2).map((t) => TRAIT_LABELS[t as Trait]).join(', ');
	$: feats = (() => {
		const out: string[] = [];
		const fb = g.players.find((p) => p.x?.firstBlood);
		if (fb) out.push(`First blood · ${fb.name}`);
		for (const p of g.players) {
			if (p.x?.wipe) out.push(`Rampage · ${p.name}`);
			if (p.won && p.deaths === 0) out.push(`Flawless · ${p.name}`);
			if (p.x?.multis) out.push(`Double kill${p.x.multis > 1 ? ` ×${p.x.multis}` : ''} · ${p.name}`);
			if (p.x?.shutdowns) out.push(`Shutdown · ${p.name}`);
			if (p.brink) out.push(`Comeback · ${p.name}`);
		}
		for (const t of SIDES) { const a = g.players.find((p) => p.team === t)?.x?.aces ?? 0; if (a) out.push(`Ace${a > 1 ? ` ×${a}` : ''} · ${teamName(t)}`); }
		return out;
	})();
	const chips = (p: GamePlayer) => p;
</script>

<article class="panel gc is-{g.winner}">
	<button class="band" on:click={() => (open = !open)} aria-expanded={open}>
		<span class="crest"><Glyph name={g.winner === 'orange' ? 'gear' : 'star'} size={22} /></span>
		<span class="tt"><b>{teamName(g.winner)} Victory</b><small>{when(g.at)}{g.room ? ` · room ${g.room}` : ''}</small></span>
		<span class="tags"><span class="tag">{WIN_LABEL[g.type]}</span><span class="tag">{g.rounds} round{g.rounds === 1 ? '' : 's'}</span><span class="tag">{hm(g.minutes)}</span><span class="tag">{g.side} v {g.side}</span></span>
		<span class="chev" class:up={open}><Glyph name="chev" size={18} /></span>
	</button>
	{#if open}
		<div class="sides">
			{#each SIDES as t (t)}
				<section class="side is-{t}" class:won={g.winner === t}>
					<h4><i></i>{teamName(t)}{#if g.winner === t}<span class="win">Winner</span>{/if}</h4>
					{#each g.players.filter((p) => p.team === t) as p (p.id)}
						{@const q = chips(p)}
						<div class="pr">
							<span class="face" style="{portraitCss(q.hero)};--pc:{q.color ? colorHex(q.color) : 'var(--brass)'}"></span>
							<span class="who"><button on:click={() => onPlayer(q.key)}>{q.name}</button><small>{heroById(q.hero)?.name ?? q.hero} · {roles(q.hero)}</small></span>
							<span class="st">
								{#if q.kills != null}
									<span class="s k" title="Kills"><Glyph name="kill" size={12} />{q.kills}</span>
									<span class="s d" title="Deaths"><Glyph name="death" size={12} />{q.deaths}</span>
									<span class="s a" title="Assists"><Glyph name="assist" size={12} />{q.assists}</span>
								{/if}
								{#if q.coins != null}<span class="s c" title="Gold earned"><Glyph name="coin" size={12} />{q.coins}</span>{/if}
								<span class="s l" title="Level reached">Lv {q.level}</span>
							</span>
						</div>
					{/each}
				</section>
			{/each}
		</div>
		{#if feats.length || g.defeats.length}
			<div class="foot">
				<div class="feats">{#each feats as f (f)}<span class="feat">{f}</span>{/each}</div>
				{#if g.defeats.length}<button class="tl" on:click={() => (timeline = !timeline)}>{timeline ? 'Hide' : 'Show'} timeline ({g.defeats.length})</button>{/if}
			</div>
			{#if timeline}
				<ol class="line">
					{#each [...g.defeats].map((d, i) => ({ d, i })).sort((a, b) => a.d.r - b.d.r || a.d.t - b.d.t || a.i - b.i).map((x) => x.d) as d, i (i)}
						{@const by = g.players.find((p) => p.key === d.by)}
						<li class="is-{by?.team}"><span class="rt">R{d.r}·T{d.t}</span><b>{nameOf(d.by)}</b> <Glyph name="kill" size={12} /> <b>{nameOf(d.v)}</b>{#if d.a.length}<small> · assist {d.a.map(nameOf).join(', ')}</small>{/if}</li>
					{/each}
				</ol>
			{/if}
		{/if}
	{/if}
</article>

<style>
	.gc { padding: 0; overflow: hidden; }
	.is-orange { --tc: #ef7d22; --tl: rgba(239, 125, 34, 0.22); --th: #ffb878; }
	.is-blue { --tc: #2f7fe6; --tl: rgba(47, 127, 230, 0.24); --th: #9ccbff; }
	.band { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 0; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
		background: linear-gradient(90deg, var(--tl), rgba(255, 255, 255, 0.02)); border-bottom: 1px solid var(--hair); }
	.crest { flex: none; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; color: var(--th); background: rgba(6, 18, 32, 0.7); box-shadow: 0 0 0 2px var(--tc); }
	.tt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.tt b { font-weight: 400; font-size: 19px; color: var(--th); letter-spacing: 0.03em; }
	.tt small { font-size: 12.5px; color: var(--ink-3); }
	.tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
	.tag { padding: 2px 9px; border-radius: 999px; font-size: 12px; color: var(--ink-2); background: rgba(6, 18, 32, 0.6); border: 1px solid var(--hair); }
	.chev { flex: none; color: var(--ink-3); }
	.chev.up :global(svg) { transform: rotate(180deg); }
	.sides { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 14px 16px; }
	.side { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 10px; background: var(--tl); border: 1px solid var(--hair); }
	.side.won { border: 2px solid var(--tc); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4); }
	.side h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; font-size: 15px; font-weight: 400; color: var(--th); }
	.side h4 i { width: 9px; height: 9px; border-radius: 50%; background: var(--tc); }
	.win { padding: 1px 8px; border-radius: 999px; font-size: 11.5px; color: #fff; background: var(--tc); }
	.pr { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; background: rgba(6, 18, 32, 0.55); }
	.face { flex: none; width: 34px; height: 34px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--pc); }
	.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
	.who button { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; cursor: pointer; }
	.who button:hover { color: var(--brass-hi); }
	.who small { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.st { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
	.s { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 6px; font-size: 13px; background: rgba(255, 255, 255, 0.05); }
	.s.k { color: #9fe3b4; } .s.d { color: #f3a3a6; } .s.a { color: #b9d3f2; } .s.c { color: #f1d38a; } .s.l { color: var(--ink-2); }
	.foot { display: flex; align-items: center; gap: 10px; padding: 0 16px 12px; }
	.feats { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; }
	.feat { padding: 2px 10px; border-radius: 999px; font-size: 12.5px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.tl { flex: none; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--brass-line); background: none; color: var(--brass-hi); font: inherit; font-size: 13px; cursor: pointer; }
	.line { margin: 0; padding: 0 16px 14px 34px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
	.line li::marker { color: var(--tc); }
	.line .rt { display: inline-block; min-width: 54px; color: var(--ink-3); font-size: 12px; }
	.line b { font-weight: 400; }
	.line small { color: var(--ink-3); }
	@media (max-width: 760px) {
		.sides { grid-template-columns: 1fr; }
		.band { flex-wrap: wrap; }
		.tags { justify-content: flex-start; order: 3; width: 100%; }
		.pr { flex-wrap: wrap; }
		.st { width: 100%; justify-content: flex-start; padding-left: 44px; }
	}
</style>
