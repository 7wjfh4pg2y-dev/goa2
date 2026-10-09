<script lang="ts">
	// One award: its medal, the kind (single game / career / extra), name and what it's for, then who holds it —
	// the record in big numbers and each holder's main hero ringed in their colour — or, unclaimed, "Up for grabs".
	import type { Award } from '$lib/league';
	import { portraitCss } from '$lib/heroes';
	import Medal from './Medal.svelte';
	import Glyph, { type GlyphName } from './Glyph.svelte';

	export let a: Award;
	export let glyph: GlyphName = 'trophy';
	export let who: (key: string) => { name: string; hero: string; color: string } | null = () => null;
	export let onOpen: (key: string) => void = () => {};
	export let mine = false; // held by the player picked in the filter

	$: metal = (a.extra ? 'violet' : a.scope === 'career' ? 'gold' : 'silver') as 'gold' | 'silver' | 'violet';
	$: kind = a.extra ? 'Extra' : a.scope === 'career' ? 'Career' : 'Single game';
	$: open = !a.holders.length;
	// "5 kills" → a big 5 and a small "kills"
	$: parts = (() => { const m = /^([\d.,]+%?)\s+(.*)$/.exec(a.value); return m ? { n: m[1], u: m[2] } : { n: a.value, u: '' }; })();
	const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<article class="ac m-{metal}" class:open class:mine>
	<span class="glow" aria-hidden="true"></span>
	<div class="top">
		<Medal {metal} {glyph} locked={open} size={64} />
		<div class="tx">
			<span class="kind">{kind}</span>
			<h3>{a.title}</h3>
			<p>{a.blurb}</p>
		</div>
	</div>
	<div class="claim">
		{#if open}
			<span class="grab"><Glyph name="lock" size={14} /> Up for grabs</span>
		{:else}
			<div class="val"><b>{parts.n}</b>{#if parts.u}<span>{parts.u}</span>{/if}{#if a.at}<small>{day(a.at)}</small>{/if}</div>
			<div class="hold">
				{#each a.holders as h (h.key)}
					{@const w = who(h.key)}
					<button class="h" on:click={() => onOpen(h.key)} style="--pc:{w?.color ?? 'var(--brass)'}" title="Open {h.name}">
						{#if w?.hero}<span class="face" style={portraitCss(w.hero)}></span>{/if}<span class="nm">{h.name}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</article>

<style>
	.ac { --mt: #d8b36a; --mtl: rgba(216, 179, 106, 0.16); position: relative; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.96), rgba(6, 21, 38, 0.98)); border: 1px solid rgba(216, 179, 106, 0.22); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.45);
		transition: transform 0.15s ease, border-color 0.15s ease; }
	.ac:hover { transform: translateY(-3px); border-color: var(--mt); }
	.m-silver { --mt: #c3ccd6; --mtl: rgba(195, 204, 214, 0.13); }
	.m-violet { --mt: #b383f5; --mtl: rgba(179, 131, 245, 0.16); }
	.ac::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: linear-gradient(90deg, transparent, var(--mt), transparent); }
	.glow { position: absolute; left: -40px; top: -50px; width: 220px; height: 200px; background: radial-gradient(closest-side, var(--mtl), transparent); pointer-events: none; }
	.mine { border-color: var(--mt); box-shadow: 0 0 0 1px var(--mt), 0 10px 24px rgba(0, 0, 0, 0.45); }
	.top { position: relative; display: flex; gap: 14px; padding: 16px 16px 10px; }
	.tx { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 4px; }
	.kind { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mt); }
	h3 { margin: 0; font-size: 21px; font-weight: 400; line-height: 1.1; letter-spacing: 0.02em; color: #fff; }
	p { margin: 0; font-size: 13px; line-height: 1.3; color: var(--ink-3); }
	.claim { position: relative; margin-top: auto; display: flex; flex-direction: column; gap: 8px; padding: 10px 16px 14px; border-top: 1px solid rgba(255, 255, 255, 0.06); background: rgba(0, 0, 0, 0.18); }
	.val { display: flex; align-items: baseline; gap: 6px; }
	.val b { font-weight: 400; font-size: 30px; line-height: 1; color: var(--mt); }
	.val span { font-size: 15px; color: var(--ink-2); }
	.val small { margin-left: auto; font-size: 12px; color: var(--ink-3); }
	.hold { display: flex; flex-wrap: wrap; gap: 6px; }
	.h { display: inline-flex; align-items: center; gap: 7px; padding: 3px 11px 3px 3px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: var(--ink); font: inherit; font-size: 15px; cursor: pointer; }
	.h:hover { border-color: var(--mt); }
	.face { width: 26px; height: 26px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--pc); }
	.grab { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-3); }
	.open { border-style: dashed; border-color: rgba(255, 255, 255, 0.14); background: linear-gradient(180deg, rgba(12, 30, 50, 0.85), rgba(6, 18, 32, 0.9)); box-shadow: none; }
	.open h3 { color: var(--ink-2); }
	.open .glow, .open::before { opacity: 0.35; }
</style>
