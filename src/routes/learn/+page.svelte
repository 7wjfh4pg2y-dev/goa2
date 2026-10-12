<script lang="ts">
	// How to play: an illustrated walkthrough. Text on the left (desktop) / below (phone), the real board on
	// the right / on top, staged per step (learn.ts). Read-only: pan and zoom, nothing moves.
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import Card from '$lib/cards/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { learnSteps, LEARN_MAP } from '$lib/learn';
	import { throneHex } from '$lib/match';

	const steps = learnSteps();
	let i = 0;
	let ready = false;
	let w = 1200, h = 800;
	let board: BoardCanvas;
	let textEl: HTMLElement;
	$: phone = w <= 760;
	$: step = steps[i];
	$: scene = step.scene;
	$: chapters = [...new Set(steps.map((s) => s.chapter))];
	const thrones = (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(LEARN_MAP, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex);
	// desktop: the island sits right of the text panel (and above the cards, when there are some)
	$: inset = phone ? null : { t: 24, b: scene.cards ? Math.min(h * 0.42, 360) : 24, l: Math.min(560, w * 0.4) + 24, r: 24 };

	function go(n: number) {
		const k = Math.max(0, Math.min(steps.length - 1, n));
		if (k === i) return;
		i = k;
		textEl?.scrollTo(0, 0);
		board?.reset();
		try { sessionStorage.setItem('goa2-learn', String(k)); } catch { /* ignore */ }
	}
	// **bold** in the step texts (they're ours, not user input)
	const md = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
	// keep the current chapter chip in view (the phone's chip row scrolls)
	$: if (ready && step) tick().then(() => document.querySelector('.learn .chap .on')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
	function key(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') go(i + 1);
		else if (e.key === 'ArrowLeft') go(i - 1);
	}
	onMount(() => {
		try { const k = Number(sessionStorage.getItem('goa2-learn')); if (k > 0 && k < steps.length) i = k; } catch { /* ignore */ }
		ready = true;
	});
</script>

<svelte:head><title>GoA2 · How to play</title></svelte:head>
<svelte:window bind:innerWidth={w} bind:innerHeight={h} on:keydown={key} />

{#snippet chapNav()}
	<nav class="chap" aria-label="Chapters">
		{#each chapters as c (c)}
			{@const first = steps.findIndex((s) => s.chapter === c)}
			<button class:on={step.chapter === c} class:done={first < i && step.chapter !== c} on:click={() => go(first)}>{c}</button>
		{/each}
	</nav>
{/snippet}

<div class="learn tide" class:phone>
	<div class="stage">
		{#if ready}
			<BoardCanvas bind:this={board} map={LEARN_MAP} look="island" pieces={scene.pieces} {thrones} glowZone={scene.zone} activeZone={scene.zone}
				areas={scene.areas ?? []} badges={scene.badges ?? []} {inset} />
		{/if}
		{#if scene.cards}
			{#key step.id}
				<div class="cards" class:big={scene.cardSize === 'big'} style="--n:{scene.cards.length}">
					{#each scene.cards as c, k (k)}
						<figure class="lc t-{c.tone ?? 'plain'}" style="--d:{k * 70}ms">
							{#if c.order}<span class="ord">{c.order}</span>{/if}
							<div class="cw"><Card heroId={c.hero} card={c.card} /></div>
							{#if c.tag}<figcaption>{phone ? c.short ?? c.tag : c.tag}</figcaption>{/if}
						</figure>
					{/each}
				</div>
			{/key}
		{/if}
	</div>

	<section class="panel side">
		<header class="sh">
			<a class="btn btn-ghost btn-sm home" href={base + '/'} aria-label="Home"><Icon name="back" /></a>
			{#if !phone}<span class="t-label">How to play</span>{/if}
			{#if phone}{@render chapNav()}{/if}
			<span class="cnt">{i + 1} / {steps.length}</span>
		</header>
		{#if !phone}{@render chapNav()}{/if}
		<div class="prog"><i style="transform: scaleX({(i + 1) / steps.length})"></i></div>
		<div class="txt" bind:this={textEl}>
			{#key step.id}
				<div class="in">
					<h1 class="t-h1">{step.title}</h1>
					{#each step.blocks as b, k (k)}
						{#if 'p' in b}<p>{@html md(b.p)}</p>
						{:else if 'list' in b}<ul>{#each b.list as li, n (n)}<li>{@html md(li)}</li>{/each}</ul>
						{:else if 'tip' in b}<p class="tip">{@html md(b.tip)}</p>
						{:else if 'keys' in b}<div class="keys">{#each b.keys as z (z.label)}<span><i style="background:{z.color}"></i>{z.label}</span>{/each}</div>
						{:else if 'table' in b}
							<table><tbody>{#each b.table as row, r (r)}<tr>{#each row as cell, c (c)}{#if r === 0 || c === 0}<th>{cell}</th>{:else}<td>{cell}</td>{/if}{/each}</tr>{/each}</tbody></table>
						{/if}
					{/each}
				</div>
			{/key}
		</div>
		<footer class="sf">
			<button class="btn btn-ghost" on:click={() => go(i - 1)} disabled={i === 0}><Icon name="back" /> Back</button>
			{#if i < steps.length - 1}
				<button class="btn btn-primary" on:click={() => go(i + 1)}>Next <Icon name="go" /></button>
			{:else}
				<a class="btn btn-duo" href={base + '/'}>Play</a>
			{/if}
		</footer>
	</section>
</div>

<style>
	.learn { position: fixed; inset: 0; overflow: hidden; color: var(--ink); }
	.stage { position: absolute; inset: 0; }
	.side { position: absolute; left: 16px; top: 16px; bottom: 16px; width: min(540px, 40vw); display: flex; flex-direction: column; gap: 10px; padding: 16px 18px; }
	.sh { display: flex; align-items: center; gap: 10px; }
	.sh .t-label { flex: 1; }
	.home { padding: 0 8px; }
	.cnt { font-size: 13px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
	.chap { display: flex; flex-wrap: wrap; gap: 6px; }
	.chap button { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--hair); background: transparent; color: var(--ink-3); font: inherit; font-size: 13px; cursor: pointer; }
	.chap button.done { color: var(--ink-2); }
	.chap button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.prog { height: 3px; border-radius: 2px; background: var(--brass-faint); overflow: hidden; }
	.prog i { display: block; height: 100%; background: var(--brass); transform-origin: left; transition: transform 0.3s; }
	.txt { flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
	.in { animation: rise 0.28s ease-out; }
	@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
	.txt h1 { margin: 6px 0 12px; color: var(--brass-hi); }
	.txt p, .txt li { font-size: 16px; line-height: 1.5; color: var(--ink-2); }
	.txt p { margin: 0 0 12px; }
	.txt ul { margin: 0 0 12px; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
	.txt li { position: relative; padding-left: 18px; }
	.txt li::before { content: ''; position: absolute; left: 2px; top: 0.62em; width: 6px; height: 6px; border-radius: 1px; transform: rotate(45deg); background: var(--brass); }
	.txt :global(b) { color: var(--ink); font-weight: inherit; }
	.tip { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--brass-line); background: var(--brass-faint); }
	.keys { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; margin: 4px 0 12px; }
	.keys span { display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--ink-2); }
	.keys i { width: 14px; height: 14px; border-radius: 3px; flex: none; opacity: 0.85; }
	table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 15px; }
	th, td { padding: 7px 8px; border-bottom: 1px solid var(--hair); text-align: left; }
	th { color: var(--ink-3); font-weight: inherit; }
	td { color: var(--ink); }
	.sf { display: flex; justify-content: space-between; gap: 10px; }
	.sf .btn { flex: 1; justify-content: center; }

	/* the cards: a row along the bottom of the stage, right of the panel */
	.cards { position: absolute; right: 24px; bottom: 20px; left: calc(min(540px, 40vw) + 40px); display: flex; justify-content: center; align-items: flex-end; gap: 14px; pointer-events: none; }
	.lc { --cw: min(170px, calc((100% - 14px * (var(--n) - 1)) / var(--n))); margin: 0; width: var(--cw); max-width: 170px; position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: deal 0.35s ease-out backwards; animation-delay: var(--d); pointer-events: auto; }
	@keyframes deal { from { opacity: 0; transform: translateY(24px); } }
	.cards.big .lc { max-width: 260px; width: min(260px, 32vh); }
	.cw { width: 100%; aspect-ratio: 1192 / 1664; border-radius: 6%; overflow: hidden; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55); }
	.cw :global(.cardface) { width: 100%; height: 100%; display: block; }
	.lc figcaption { padding: 2px 10px; border-radius: 999px; font-size: 13px; color: var(--ink); background: rgba(6, 14, 26, 0.85); border: 1px solid var(--hair); white-space: nowrap; }
	.t-item .cw { transform: rotate(180deg); }
	.t-gone .cw { opacity: 0.45; filter: grayscale(1); }
	.t-hand figcaption { border-color: rgba(53, 208, 122, 0.6); }
	.t-item figcaption { border-color: var(--brass-line); color: var(--brass-hi); }
	.ord { position: absolute; top: -12px; left: -8px; z-index: 1; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-size: 16px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5); }

	/* phone: board on top, the text below, all on one screen */
	.phone .stage { bottom: auto; height: 42dvh; }
	.phone .side { left: 0; right: 0; top: 42dvh; bottom: 0; width: auto; border-radius: 16px 16px 0 0; padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px)); gap: 8px; }
	.phone .chap { flex: 1; min-width: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
	.phone .chap button { flex: none; font-size: 12px; }
	.phone .txt h1 { font-size: 22px; margin: 2px 0 6px; }
	.phone .txt p, .phone .txt li { font-size: 14px; line-height: 1.45; }
	.phone .sf .btn { min-height: 42px; }
	.phone .cards { left: 10px; right: 10px; bottom: 8px; gap: 6px; }
	.phone .lc { max-width: 22vw; }
	.phone .cards.big .lc { width: 30vw; max-width: 30vw; }
	.phone .lc figcaption { font-size: 10.5px; padding: 1px 6px; }
	.phone .ord { width: 22px; height: 22px; font-size: 13px; top: -8px; left: -4px; }
	@media (prefers-reduced-motion: reduce) { .in, .lc { animation: none; } }
</style>
