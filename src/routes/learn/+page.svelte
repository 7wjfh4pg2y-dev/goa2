<script lang="ts">
	// How to play: an illustrated walkthrough. Text on the left (desktop) / below (phone), the real board on
	// the right / on top, staged per step (learn.ts). Read-only: pan and zoom, nothing moves.
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
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
	// the board step: tap (or hover) a zone in the key and only that zone lights up on the island
	let zonePick = -1, zoneHover = -1;
	$: keyBlock = step.blocks.find((b) => 'keys' in b) as { keys: { color: string; label: string; note: string; area: { hex: string; r: number; color: string; hexes?: string[]; alpha?: number } }[] } | undefined;
	$: zoneOn = zoneHover >= 0 ? zoneHover : zonePick;
	$: areas = keyBlock ? (zoneOn >= 0 ? [keyBlock.keys[zoneOn].area] : []) : scene.areas ?? [];
	$: chapters = [...new Set(steps.map((s) => s.chapter))];
	const thrones = (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(LEARN_MAP, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex);
	// desktop: the island sits right of the text panel (and above the cards, when there are some)
	$: inset = phone ? null : { t: 100, b: scene.cards ? Math.min(h * 0.42, 360) : 24, l: Math.min(560, w * 0.4) + 24, r: 24 };
	// where this step sits in its chapter (desktop kicker: "The board · 2 / 2")
	$: inChap = steps.filter((s) => s.chapter === step.chapter);
	$: chapPos = inChap.indexOf(step) + 1;
	$: chapIdx = chapters.indexOf(step.chapter);

	function go(n: number) {
		const k = Math.max(0, Math.min(steps.length - 1, n));
		if (k === i) return;
		i = k;
		zonePick = -1; zoneHover = -1;
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
	{#if !phone}
		<!-- desktop: one bar across the top — home, the chapters as a stepper, the count -->
		<header class="bar panel">
			<a class="btn btn-ghost btn-sm home" href={base + '/?at=learn'} on:click|preventDefault={() => goBack('learn')} aria-label="Back"><Icon name="back" /></a>
			<span class="t-label brand">How to play</span>
			<nav class="steps" aria-label="Chapters">
				{#each chapters as c, n (c)}
					{@const first = steps.findIndex((s) => s.chapter === c)}
					{#if n > 0}<span class="ln" class:done={n <= chapIdx}></span>{/if}
					<button class="st" class:on={n === chapIdx} class:done={n < chapIdx} on:click={() => go(first)} title={c}>
						<span class="num">{#if n < chapIdx}<Icon name="check" />{:else}{n + 1}{/if}</span><span class="lbl">{c}</span>
					</button>
				{/each}
			</nav>
			<span class="cnt">{i + 1} / {steps.length}</span>
			<div class="barprog"><i style="transform: scaleX({(i + 1) / steps.length})"></i></div>
		</header>
	{/if}
	<div class="stage">
		{#if ready}
			<BoardCanvas bind:this={board} map={LEARN_MAP} look="island" pieces={scene.pieces} {thrones} glowZone={scene.zone} activeZone={scene.zone}
				{areas} badges={scene.badges ?? []} {inset} />
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
		{#if phone}
			<header class="sh">
				<a class="btn btn-ghost btn-sm home" href={base + '/?at=learn'} on:click|preventDefault={() => goBack('learn')} aria-label="Back"><Icon name="back" /></a>
				{@render chapNav()}
				<span class="cnt">{i + 1} / {steps.length}</span>
			</header>
			<div class="prog"><i style="transform: scaleX({(i + 1) / steps.length})"></i></div>
		{/if}
		<div class="txt" bind:this={textEl}>
			{#key step.id}
				<div class="in">
					{#if !phone}<span class="t-label kick">{step.chapter}{#if inChap.length > 1}<em>{chapPos} / {inChap.length}</em>{/if}</span>{/if}
					<h1 class="t-h1">{step.title}</h1>
					{#each step.blocks as b, k (k)}
						{#if 'p' in b}<p>{@html md(b.p)}</p>
						{:else if 'list' in b}<ul>{#each b.list as li, n (n)}<li>{@html md(li)}</li>{/each}</ul>
						{:else if 'tip' in b}<p class="tip">{@html md(b.tip)}</p>
						{:else if 'keys' in b}
							<div class="keys">{#each b.keys as z, n (z.label)}<button class:on={zonePick === n} on:click={() => (zonePick = zonePick === n ? -1 : n)} on:mouseenter={() => (zoneHover = n)} on:mouseleave={() => (zoneHover = -1)}><i style="background:{z.color}"></i>{z.label}</button>{/each}</div>
							<p class="znote">{zoneOn >= 0 ? b.keys[zoneOn].note : 'Pick a zone to see it on the island.'}</p>
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
	.keys button { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hair); background: rgba(4, 14, 26, 0.4); color: var(--ink-2); font: inherit; font-size: 15px; text-align: left; cursor: pointer; }
	.keys button:hover { border-color: var(--brass-line); color: var(--ink); }
	.keys button.on { border-color: var(--brass); color: var(--ink); background: var(--brass-faint); }
	.znote { min-height: 4.5em; color: var(--ink-2); }
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

	/* desktop: the top bar + the text panel under it */
	.learn .bar { position: absolute; z-index: 2; left: 16px; right: 16px; top: 16px; height: 64px; display: flex; align-items: center; gap: 16px; padding: 0 16px; overflow: hidden; }
	.bar .brand { flex: none; color: var(--brass-hi); }
	.steps { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; }
	.st { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 4px; border: 0; background: none; color: var(--ink-3); font: inherit; font-size: 13px; white-space: nowrap; cursor: pointer; }
	.st:hover { color: var(--ink); }
	.st.done { color: var(--ink-2); }
	.st.on { color: var(--ink); }
	.num { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--hair); font-size: 12px; font-variant-numeric: tabular-nums; }
	.num :global(.ico) { width: 14px; height: 14px; }
	.st.done .num { border-color: var(--brass-line); color: var(--brass-hi); }
	.st.on .num { border-color: transparent; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.ln { flex: 1 1 10px; min-width: 6px; max-width: 34px; height: 1px; margin: 0 6px; background: var(--hair); }
	.ln.done { background: var(--brass-line); }
	.barprog { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--brass-faint); }
	.barprog i { display: block; height: 100%; background: var(--brass); transform-origin: left; transition: transform 0.3s; }
	.learn:not(.phone) .side { top: 96px; padding: 20px 22px 18px; gap: 12px; }
	.kick { display: flex; align-items: center; gap: 10px; color: var(--ink-3); }
	.kick em { font-style: normal; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--hair); font-size: 11px; }
	/* narrower windows: only the current chapter keeps its name */
	@media (max-width: 1380px) { .st:not(.on) .lbl { display: none; } .ln { max-width: 22px; } }

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
