<script lang="ts">
	// Hero page mock-up C — "The Field Guide": built around the hero's own deck. Every hero down the left
	// (tap to switch); in the middle the whole deck as the Ascension tree, and a build lights its path
	// through it with the pick order; on the right the guide, and the opening played out on the real
	// board, turn by turn. (Tide look; sample numbers.)
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import Card from '$lib/cards/Card.svelte';
	import { HEROES_ALPHA, portraitCss, heroLogo, TRAIT_LABELS, STAT_LABELS, statIcon } from '$lib/heroes';
	import { LEARN_MAP } from '$lib/learn';
	import { throneHex } from '$lib/match';
	import { ITEM_NAME, COLOR_HEX, OPENING_WAVE, type HeroSample } from './sample';

	export let s: HeroSample;
	export let onHero: (id: string) => void = () => {};
	let buildIx = 0, side: 'guide' | 'opening' = 'guide', turn = 1;
	$: h = s.hero;
	$: build = s.builds[buildIx];
	$: order = new Map(build.picks.map((i, k) => [i, k + 1]));
	$: hand = new Set(s.hand);
	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	$: tierCards = (c: string, t: number) => s.cards.map((x, i) => ({ x, i })).filter(({ x }) => x.color === c && x.level === t).map(({ i }) => i);
	$: basics = s.hand.filter((i) => s.cards[i].color === 'GOLD' || s.cards[i].color === 'SILVER');
	const roman = ['I', 'II', 'III', 'IV'];
	const thrones = (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(LEARN_MAP, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex);
	// the opening on the board: the hero where this turn leaves them; a minion defeated on turn 2 is gone from then on
	$: step = s.opening[turn - 1];
	$: gone = new Set(s.opening.filter((t) => t.turn <= turn && t.gone).map((t) => t.gone!));
	$: pieces = [
		...OPENING_WAVE.filter((m) => !gone.has(m.id)),
		{ id: 'hero', hex: step.hex, team: 'blue', hero: h.id, sym: heroLogo(h.id), label: h.name[0], color: '#eab308', name: h.name }
	];
	$: path = s.opening.slice(0, turn).map((t) => t.hex);
	$: areas = [{ hex: step.hex, r: 0, color: '#ffd75e', hexes: path, alpha: 0.35 }];
</script>

<div class="mc">
	<nav class="rail" aria-label="Heroes">
		{#each HEROES_ALPHA as x (x.id)}
			<button class="rf" class:on={x.id === h.id} title={x.name} on:click={() => onHero(x.id)}><span class="face" style={portraitCss(x.id)}></span></button>
		{/each}
	</nav>

	<section class="tree">
		<header class="th">
			<img src={heroLogo(h.id)} alt="" />
			<div><h1>{h.name}</h1><span class="t-label">{h.title} · {h.traits.map((t) => TRAIT_LABELS[t]).join(' · ')}</span></div>
			<div class="bsel">
				{#each s.builds as b, n (n)}<button class:on={buildIx === n} on:click={() => (buildIx = n)}>{b.name}<small>{b.win}%</small></button>{/each}
			</div>
		</header>
		<div class="grid">
			{#each [3, 2, 1] as t (t)}
				<span class="tl">Tier {roman[t - 1]}</span>
				{#each COLS as c (c)}
					<div class="cell" style="--c:{COLOR_HEX[c]}">
						{#each tierCards(c, t) as i (i)}
							{@const n = order.get(i)}
							<div class="tc" class:lit={n || (t === 1 && hand.has(i))} class:dim={t > 1 && !n}>
								{#if n}<span class="no">{n}</span>{/if}
								<Card heroId={h.id} card={s.cards[i]} />
							</div>
						{/each}
					</div>
				{/each}
			{/each}
			<span class="tl">Basics</span>
			<div class="cell basics">{#each basics as i (i)}<div class="tc lit"><Card heroId={h.id} card={s.cards[i]} /></div>{/each}</div>
		</div>
		<p class="bnote">{build.blurb} Items: {build.items.map((it) => '+1 ' + (ITEM_NAME[it] ?? it)).join(' · ')}. <span class="sample">Sample numbers</span></p>
	</section>

	<aside class="side panel">
		<nav class="tabs"><button class:on={side === 'guide'} on:click={() => (side = 'guide')}>Guide</button><button class:on={side === 'opening'} on:click={() => (side = 'opening')}>Opening</button></nav>
		{#if side === 'guide'}
			<div class="guide">
				<p class="play">{s.playstyle}</p>
				<div class="stats">{#each h.stats as [lo, hi], k (k)}<span><img src={statIcon(k)} alt="" />{STAT_LABELS[k]}<b>{lo === hi ? lo : `${lo}–${hi}`}</b></span>{/each}</div>
				<span class="t-label">How to play</span>
				<ol>{#each s.tips as tip (tip)}<li>{tip}</li>{/each}</ol>
				<span class="t-label">Strong against</span>
				<div class="mus">{#each s.strong as m (m.hero)}<span class="face sm" style={portraitCss(m.hero)} title={m.hero}></span>{/each}</div>
				<span class="t-label">Struggles against</span>
				<div class="mus">{#each s.weak as m (m.hero)}<span class="face sm" style={portraitCss(m.hero)} title={m.hero}></span>{/each}</div>
			</div>
		{:else}
			<div class="opening">
				<div class="mini"><BoardCanvas map={LEARN_MAP} look="island" {pieces} {thrones} glowZone="Center" activeZone="Center" {areas} /></div>
				<div class="steps">{#each s.opening as t (t.turn)}<button class:on={turn === t.turn} on:click={() => (turn = t.turn)}>{roman[t.turn - 1]}</button>{/each}</div>
				<div class="ostep">
					<div class="oc"><Card heroId={h.id} card={step.card} /></div>
					<div><span class="t-label">Turn {roman[turn - 1]} · {step.card.name}</span><p>{step.plan}</p></div>
				</div>
			</div>
		{/if}
	</aside>
</div>

<style>
	.mc { position: absolute; inset: 0; display: grid; grid-template-columns: 76px minmax(0, 1fr) 400px; grid-template-rows: minmax(0, 1fr); gap: 16px; padding: 16px; color: var(--ink); }
	.rail { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; scrollbar-width: none; padding: 4px; }
	.rf { padding: 0; border: 0; background: none; cursor: pointer; border-radius: 50%; }
	.rf .face { display: block; width: 56px; height: 56px; border-radius: 50%; background-color: #05070a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--hair); opacity: 0.6; transition: opacity 0.15s; }
	.rf:hover .face { opacity: 1; }
	.rf.on .face { opacity: 1; box-shadow: 0 0 0 3px var(--brass); }
	.tree { min-width: 0; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 10px; }
	.th { display: flex; align-items: center; gap: 14px; }
	.th img { width: 58px; height: 58px; object-fit: contain; }
	.th h1 { margin: 0; font-size: 40px; line-height: 1; color: var(--brass-hi); font-weight: inherit; }
	.bsel { margin-left: auto; display: flex; gap: 6px; }
	.bsel button { display: flex; flex-direction: column; align-items: center; padding: 6px 14px; border-radius: 10px; border: 1px solid var(--hair); background: rgba(4, 14, 26, 0.6); color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; }
	.bsel button small { font-size: 11px; color: var(--ink-3); }
	.bsel button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.bsel button.on small { color: var(--ink-dark); }
	.grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 70px repeat(3, minmax(0, 1fr)); grid-template-rows: repeat(4, minmax(0, 1fr)); gap: 10px 16px; align-items: center; }
	.tl { font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	.cell { height: 100%; min-width: 0; overflow: visible; display: flex; justify-content: center; align-items: center; gap: 8px; padding: 6px; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 14%, transparent), transparent); min-height: 0; }
	.cell.basics { grid-column: 2 / -1; background: none; justify-content: flex-start; }
	.tc { position: relative; height: 100%; aspect-ratio: 1192 / 1664; border-radius: 6%; }
	/* the canvas's own pixel size must not push the row open: pin the card into the box */
	.tc :global(.card) { position: absolute; inset: 0; width: 100%; height: 100%; }
	.tc :global(.cardface) { width: 100%; height: 100%; display: block; border-radius: 6%; }
	.tc.dim { opacity: 0.32; filter: grayscale(0.6); }
	.tc.lit :global(.cardface) { box-shadow: 0 0 0 2px var(--brass), 0 8px 20px rgba(0, 0, 0, 0.5); }
	.no { position: absolute; top: -8px; left: -8px; z-index: 1; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-size: 13px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
	.bnote { margin: 0; font-size: 13px; color: var(--ink-3); }
	.sample { margin-left: 6px; padding: 1px 8px; border-radius: 999px; border: 1px dashed var(--ink-3); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
	.side { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; min-height: 0; overflow: hidden; }
	.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--hair); }
	.tabs button { padding: 6px 14px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-3); font: inherit; font-size: 15px; cursor: pointer; }
	.tabs button.on { color: var(--brass-hi); border-bottom-color: var(--brass); }
	.guide { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
	.play { margin: 0; font-size: 15.5px; line-height: 1.5; }
	.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
	.stats span { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: 8px; background: rgba(4, 14, 26, 0.5); border: 1px solid var(--hair); font-size: 13px; color: var(--ink-2); }
	.stats img { width: 16px; height: 16px; }
	.stats b { margin-left: auto; font-weight: inherit; color: var(--ink); }
	ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.45; color: var(--ink-2); }
	.mus { display: flex; gap: 8px; }
	.face.sm { width: 40px; height: 40px; border-radius: 50%; background-color: #05070a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--hair); }
	.opening { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
	.mini { position: relative; flex: 1; min-height: 240px; border-radius: 12px; overflow: hidden; border: 1px solid var(--hair); }
	.steps { display: flex; gap: 6px; }
	.steps button { flex: 1; padding: 6px 0; border-radius: 8px; border: 1px solid var(--hair); background: none; color: var(--ink-2); font: inherit; cursor: pointer; }
	.steps button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.ostep { display: grid; grid-template-columns: 90px 1fr; gap: 12px; align-items: start; }
	.oc :global(.cardface) { width: 100%; display: block; border-radius: 6%; }
	.ostep p { margin: 4px 0 0; font-size: 14px; line-height: 1.45; color: var(--ink-2); }
</style>
