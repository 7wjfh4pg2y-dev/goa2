<script lang="ts">
	// One hero on the Heroes tab: its painting behind the head (name, roles, pack · complexity), win rate, IMPACT (how
	// much better its players do on it than they do overall), how its games ended, K/D/A and gold, and the heroes it
	// wins with, beats and loses to. "Builds" opens the card picks and level-up paths.
	import type { HeroAgg, WinType } from '$lib/league';
	import { WIN_TYPES, WIN_LABEL } from '$lib/league';
	import { heroById, heroSplash, splashFace, portraitCss, traitIcon, TRAIT_LABELS, PACK_LABELS, type Trait } from '$lib/heroes';
	import WinBar from './WinBar.svelte';
	import Glyph from './Glyph.svelte';

	export let h: HeroAgg;
	export let onBuilds: () => void = () => {};

	$: hero = heroById(h.hero);
	$: art = (() => { const [fx, fy] = splashFace(h.hero); return `background-image:url('${heroSplash(h.hero)}');background-position:${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%;`; })();
	const pct = (t: { games: number; wins: number }) => Math.round((100 * t.wins) / t.games);
	const rank = (m: Record<string, { games: number; wins: number }>, dir: 1 | -1) =>
		Object.entries(m).filter(([, t]) => t.games > 0).sort((a, b) => dir * (b[1].wins / b[1].games - a[1].wins / a[1].games) || b[1].games - a[1].games).slice(0, 3);
	$: mates = rank(h.mates, 1).filter(([, t]) => t.wins / t.games >= 0.5);
	$: beats = rank(h.foes, 1).filter(([, t]) => t.wins / t.games >= 0.5);
	$: counters = rank(h.foes, -1).filter(([, t]) => t.wins / t.games < 0.5);
	$: groups = [{ lbl: 'Best with', list: mates }, { lbl: 'Beats', list: beats }, { lbl: 'Countered by', list: counters }];
	$: imp = h.impact;
	$: impX = imp == null ? 50 : 50 + Math.max(-50, Math.min(50, imp));
	const TY: Record<WinType, { g: 'throne' | 'final' | 'life'; c: string }> = { throne: { g: 'throne', c: '#c9a24a' }, final: { g: 'final', c: '#3aa6a0' }, life: { g: 'life', c: '#c0566b' }, other: { g: 'throne', c: '#666' } };
	$: wonTotal = WIN_TYPES.reduce((s, t) => s + h.byType[t].wins, 0);
	const avg = (n: number, d: number) => (d ? (n / d).toFixed(1) : '–');
</script>

<article class="panel hc">
	<header style={art}>
		<span class="face" style={portraitCss(h.hero)}></span>
		<div class="hd">
			<h3>{hero?.name ?? h.hero}</h3>
			<span class="roles">{(hero?.traits ?? []).slice(0, 3).map((t) => TRAIT_LABELS[t as Trait]).join(' · ')}</span>
			<span class="pack">{hero ? PACK_LABELS[hero.pack] : ''} · {'★'.repeat(hero?.stars ?? 1)}</span>
		</div>
		{#if hero?.stars === 1}<span class="easy">Beginner friendly</span>{/if}
	</header>
	<div class="body">
		<WinBar wins={h.wins} games={h.games} />

		<div class="imp" title="Its players' win rate on this hero, minus their win rate overall (players with 2+ games)">
			<div class="ih"><span>Hero impact</span><b class:up={(imp ?? 0) > 0} class:down={(imp ?? 0) < 0}>{imp == null ? '–' : `${imp > 0 ? '+' : ''}${imp.toFixed(1)}%`}</b></div>
			<div class="track"><i class="zero"></i><i class="knob" class:none={imp == null} style="left:{impX}%"></i></div>
			<div class="ic"><span>−50%</span><span>{imp == null ? 'needs players with 2+ games' : `${h.impactN} pick${h.impactN === 1 ? '' : 's'} counted`}</span><span>+50%</span></div>
		</div>

		<div class="vt">
			<h4>How its games ended</h4>
			<div class="vrow"><small>Games</small><div class="stack">{#each WIN_TYPES as t (t)}{#if h.byType[t].games}<span style="flex:{h.byType[t].games};background:{TY[t].c}" title="{WIN_LABEL[t]}: {h.byType[t].games}"><Glyph name={TY[t].g} size={12} />{h.byType[t].games}</span>{/if}{/each}</div></div>
			<div class="vrow"><small>Wins</small><div class="stack">{#each WIN_TYPES as t (t)}{#if h.byType[t].wins}<span style="flex:{h.byType[t].wins};background:{TY[t].c}" title="{WIN_LABEL[t]}: {h.byType[t].wins}"><Glyph name={TY[t].g} size={12} />{h.byType[t].wins}</span>{/if}{/each}{#if !wonTotal}<em>no wins yet</em>{/if}</div></div>
			<div class="key">{#each WIN_TYPES as t (t)}<span><i style="background:{TY[t].c}"></i>{WIN_LABEL[t]}</span>{/each}</div>
		</div>

		<div class="three">
			<div class="tile"><span><Glyph name="kill" size={12} /> K/D/A a game</span><b>{h.kdaGames ? `${avg(h.kills, h.kdaGames)}/${avg(h.deaths, h.kdaGames)}/${avg(h.assists, h.kdaGames)}` : '–'}</b></div>
			<div class="tile"><span><Glyph name="coin" size={12} /> Gold a game</span><b>{h.coinGames ? Math.round(h.coins / h.coinGames) : '–'}</b></div>
			<div class="tile"><span>Picked by</span><b class="sm">{Object.entries(h.players).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n).join(', ')}</b></div>
		</div>

		{#each groups as grp (grp.lbl)}
			{@const list = grp.list}
			<h4>{grp.lbl}</h4>
			<div class="hs">
				{#each list as [id, t] (id)}
					<div class="ht"><span class="mini" style={portraitCss(id)}></span><span class="hn">{heroById(id)?.name ?? id}</span><small>{pct(t)}% <i>({t.games})</i></small></div>
				{:else}<span class="none">—</span>{/each}
			</div>
		{/each}
		<button class="btn btn-ghost builds" on:click={onBuilds}>Card picks &amp; builds</button>
	</div>
</article>

<style>
	.hc { display: flex; flex-direction: column; padding: 0; overflow: hidden; }
	header { position: relative; display: flex; align-items: center; gap: 12px; padding: 16px; min-height: 104px; background-size: 260%; background-repeat: no-repeat; }
	header::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(6, 18, 32, 0.95) 30%, rgba(6, 18, 32, 0.55)); }
	header > * { position: relative; }
	.face { flex: none; width: 64px; height: 64px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--brass), 0 4px 12px rgba(0, 0, 0, 0.6); }
	.hd { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	h3 { margin: 0; font-size: 24px; font-weight: 400; letter-spacing: 0.03em; }
	.roles { font-size: 14px; color: var(--ink-2); }
	.pack { font-size: 12.5px; color: var(--brass-hi); letter-spacing: 0.04em; }
	.easy { align-self: flex-start; padding: 2px 10px; border-radius: 999px; font-size: 12px; color: #bff3cf; background: rgba(47, 163, 90, 0.22); border: 1px solid rgba(74, 222, 128, 0.45); }
	.body { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px 16px; }
	.imp { display: flex; flex-direction: column; gap: 5px; }
	.ih { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; color: var(--ink-2); }
	.ih b { font-weight: 400; font-size: 18px; color: var(--ink); }
	.ih b.up { color: var(--ready-hi); } .ih b.down { color: var(--danger-hi); }
	.track { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, rgba(184, 58, 63, 0.55), rgba(255, 255, 255, 0.08) 50%, rgba(47, 163, 90, 0.55)); }
	.zero { position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: rgba(255, 255, 255, 0.5); }
	.knob { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--brass-hi); box-shadow: 0 0 0 2px #0b1a2c; }
	.knob.none { opacity: 0.25; }
	.ic { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-3); }
	h4 { margin: 0 0 -4px; font-size: 12.5px; font-weight: 400; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.vt { display: flex; flex-direction: column; gap: 6px; }
	.vrow { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 8px; }
	.vrow small { font-size: 11.5px; color: var(--ink-3); }
	.stack { display: flex; gap: 2px; height: 20px; border-radius: 4px; overflow: hidden; }
	.stack span { display: inline-flex; align-items: center; justify-content: center; gap: 3px; min-width: 28px; font-size: 12px; color: #0b1626; }
	.stack em { font-style: normal; font-size: 12px; color: var(--ink-3); }
	.key { display: flex; gap: 12px; font-size: 11.5px; color: var(--ink-3); }
	.key i { display: inline-block; width: 9px; height: 9px; margin-right: 4px; border-radius: 2px; }
	.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.tile { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 6px; border-radius: 8px; background: var(--well); border: 1px solid var(--hair); text-align: center; }
	.tile span { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--brass); }
	.tile b { font-weight: 400; font-size: 17px; }
	.tile b.sm { font-size: 13.5px; }
	.hs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; min-height: 52px; }
	.ht { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border-radius: 8px; background: var(--raise); }
	.mini { width: 34px; height: 34px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 1.5px var(--brass-line); }
	.hn { font-size: 13.5px; }
	.ht small { font-size: 12px; color: var(--ink-2); }
	.ht small i { font-style: normal; color: var(--ink-3); }
	.none { grid-column: 1 / -1; align-self: center; color: var(--ink-3); }
	.builds { align-self: stretch; justify-content: center; }
</style>
