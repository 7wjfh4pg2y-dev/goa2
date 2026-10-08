<script lang="ts">
	// A player's board on the phone (2.0): a bottom sheet. The hero's painting with their name (white) and the player
	// (their team's colour); level pips · coins · their Poison / Bounty markers (tap = put on / take off); the six stats;
	// this round's turns I–IV with the discard pile at the end of the row; then two strips — DISCARDED (a trash mark)
	// and REMOVED (greyed, struck). A tap on any open card reads it, and the reader swipes through every card that's
	// open information: played (revealed) cards, discards, removed cards — never a face-down card or an upgrade.
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import Card from '$lib/cards/Card.svelte';
	import StatBubbles from './StatBubbles.svelte';
	import { heroCards, heroName } from '$lib/cards/deck';
	import { heroSplash, splashFace } from '$lib/heroes';
	import { levelOf, statDeltas, PASS, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let name = '';
	export let color = '#888';
	export let team: 'orange' | 'blue' = 'orange';
	export let turnIdx = 0;
	export let revealed = false;
	export let status: { poison?: unknown; bounty?: unknown } = {};
	export let markArt: (k: 'poison' | 'bounty') => string = () => '';
	export let fxAt: (t: number) => boolean = () => false;
	export let onStatus: (k: 'poison' | 'bounty') => void = () => {};
	export let onSlot: (e: Event, t: number) => void = () => {};
	export let onRead: (list: number[], at: number) => void = () => {};
	export let onClose: () => void = () => {};

	const ROMAN = ['I', 'II', 'III', 'IV'];
	$: lv = levelOf(cs);
	$: face = splashFace(cs.hero);
	$: top = cs.discard.length ? cs.discard[cs.discard.length - 1] : null;
	// every open card, in reading order: played turns, discards, removed
	$: played = cs.turns.filter((i): i is number => i != null && i !== PASS);
	$: open = [...played, ...(revealed && cs.pending != null && cs.pending !== PASS && !cs.turns.includes(cs.pending) ? [cs.pending] : []), ...cs.discard, ...cs.removed];
	const read = (idx: number) => onRead(open, Math.max(0, open.indexOf(idx)));
	// swipe down to close
	let y0: number | null = null, dy = 0;
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && onClose()} />
<div class="pbscrim" role="presentation" on:pointerdown|self={onClose}></div>
<div class="pb is-{team}" role="dialog" aria-label="{heroName(cs.hero)}'s board" style:transform={dy > 0 ? `translateY(${dy}px)` : null}>
	<div class="head" role="presentation" on:pointerdown={(e) => (y0 = e.clientY)} on:pointermove={(e) => { if (y0 != null) dy = Math.max(0, e.clientY - y0); }} on:pointerup={() => { if (dy > 70) onClose(); y0 = null; dy = 0; }} on:pointercancel={() => { y0 = null; dy = 0; }}>
		<span class="art" style="background-image:url({heroSplash(cs.hero)}); background-position:{face[0] * 100}% {face[1] * 100}%"></span>
		<span class="grab"></span>
		<span class="nm"><b>{heroName(cs.hero)}</b><em style="--pc:{color}"><i></i>{name}</em></span>
		<button class="x" on:click={onClose} aria-label="Close">✕</button>
	</div>
	<div class="row">
		<span class="pips" title="Level {lv}">{#each Array(8) as _, i (i)}<i class:on={i < lv || (i === 7 && cs.ultimate)} class:ult={i === 7}></i>{/each}</span>
		<span class="coin" title="Coins"><i class="gc"></i>{cs.coins}</span>
		<span class="marks">
			{#each ['poison', 'bounty'] as k (k)}
				<button class="mk" class:on={!!status[k as 'poison']} on:click={() => onStatus(k as 'poison')} title={k === 'poison' ? 'Poison' : 'Bounty'} aria-pressed={!!status[k as 'poison']}><img src={markArt(k as 'poison')} alt={k} /></button>
			{/each}
		</span>
	</div>
	<StatBubbles {cs} size={30} />
	<div class="turns">
		{#each [0, 1, 2, 3] as t (t)}
			<span class="tw" class:now={t === turnIdx} class:glow={fxAt(t)}><TurnSlot heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} examinable on:click={(e) => onSlot(e, t)} /></span>
		{/each}
		<span class="dv"></span>
		<button class="tw pile" disabled={top == null} on:click={() => top != null && read(top)} aria-label="Discard pile">
			{#if top != null}<Card heroId={cs.hero} card={heroCards(cs.hero)[top]} />{/if}
			<i class="tr"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></svg></i>
		</button>
	</div>
	<div class="strips">
		<div class="strip">
			<span class="sl"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></svg>Discarded</span>
			<span class="cards">{#each cs.discard as i (i)}<button class="sc disc" on:click={() => read(i)}><Card heroId={cs.hero} card={heroCards(cs.hero)[i]} /></button>{:else}<em>—</em>{/each}</span>
		</div>
		<div class="strip">
			<span class="sl rm"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M6.5 17.5l11-11" /></svg>Removed</span>
			<span class="cards">{#each cs.removed as i (i)}<button class="sc rmv" on:click={() => read(i)}><Card heroId={cs.hero} card={heroCards(cs.hero)[i]} /></button>{:else}<em>—</em>{/each}</span>
		</div>
	</div>
</div>

<style>
	.pbscrim { position: fixed; inset: 0; z-index: 38; background: rgba(2, 6, 12, 0.55); }
	.pb { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); position: fixed; left: 0; right: 0; bottom: 0; z-index: 39; max-height: 86dvh; overflow-y: auto; overscroll-behavior: contain;
		display: flex; flex-direction: column; gap: clamp(8px, 1.6dvh, 12px); padding: 0 12px calc(14px + env(safe-area-inset-bottom)); box-sizing: border-box; color: #f5f1e8; border-radius: 18px 18px 0 0;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.99), rgba(6, 21, 38, 0.995)); border-top: 3px solid var(--tc); box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.6); animation: up 0.22s ease-out both; }
	@keyframes up { from { transform: translateY(40px); opacity: 0; } }
	.is-orange { --tc: #ef7d22; --th: #ffb878; } .is-blue { --tc: #2f7fe6; --th: #9ccbff; }
	button { font: inherit; color: inherit; padding: 0; cursor: pointer; background: none; border: 0; }
	.head { position: relative; flex: none; height: clamp(84px, 13dvh, 112px); margin: 0 -12px; overflow: hidden; display: flex; align-items: flex-end; padding: 0 14px 10px; touch-action: none; }
	.art { position: absolute; inset: 0; background-size: cover; opacity: 0.55; -webkit-mask-image: linear-gradient(180deg, #000 30%, transparent); mask-image: linear-gradient(180deg, #000 30%, transparent); }
	.grab { position: absolute; left: 50%; top: 6px; width: 40px; height: 4px; margin-left: -20px; border-radius: 2px; background: rgba(255, 255, 255, 0.35); }
	.nm { position: relative; display: flex; flex-direction: column; gap: 2px; }
	.nm b { font-weight: 400; font-size: 26px; line-height: 1; color: #fff; text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8); }
	.nm em { display: inline-flex; align-items: center; gap: 6px; font-style: normal; font-size: 13px; color: var(--th); }
	.nm em i { width: 9px; height: 9px; border-radius: 50%; background: var(--pc); }
	.x { position: absolute; right: 12px; top: 14px; width: 32px; height: 32px; border-radius: 50%; color: #f4dfa8; background: rgba(0, 0, 0, 0.45); border: 1px solid var(--line); }
	.row { display: flex; align-items: center; gap: 12px; }
	.pips { display: flex; gap: 3px; }
	.pips i { width: 14px; height: 6px; border-radius: 2px; background: rgba(255, 255, 255, 0.14); transform: skewX(-18deg); }
	.pips i.on { background: var(--brass); }
	.pips i.ult { background: rgba(138, 79, 209, 0.45); } .pips i.ult.on { background: #a46be8; }
	.coin { display: inline-flex; align-items: center; gap: 4px; font-size: 16px; }
	.gc { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff2c0, #e8bd58 55%, #a8792a); box-shadow: inset 0 0 0 1.5px rgba(122, 86, 24, 0.55); }
	.marks { margin-left: auto; display: flex; gap: 6px; }
	.mk { width: 30px; height: 30px; border-radius: 50%; opacity: 0.3; filter: grayscale(1); box-shadow: 0 0 0 1px var(--line); }
	.mk img { width: 100%; height: 100%; border-radius: 50%; }
	.mk.on { opacity: 1; filter: none; box-shadow: 0 0 0 2px #f4dfa8; }
	.turns { display: grid; grid-template-columns: repeat(4, 1fr) 1px 1fr; gap: 8px; align-items: center; }
	.tw { position: relative; border-radius: 6px; }
	.tw :global(.slot) { aspect-ratio: 1192 / 1664; }
	.tw.now :global(.slot.blank) { border: 1.5px solid var(--brass); color: var(--brass-hi); }
	.tw.glow { box-shadow: 0 0 0 2px #fff, 0 0 10px 3px var(--tc); }
	.dv { align-self: stretch; margin: 8px 0; background: var(--line); }
	.pile { aspect-ratio: 1192 / 1664; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.22); box-sizing: border-box; }
	.pile :global(.card), .pile :global(.cardface) { width: 100%; }
	.tr { position: absolute; right: -6px; bottom: -6px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: #3a2a10; box-shadow: 0 0 0 1.5px #d8a24a; }
	.tr svg, .sl svg { width: 12px; height: 12px; fill: none; stroke: #ffd38a; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
	.strips { display: flex; flex-direction: column; gap: 8px; }
	.strip { display: flex; align-items: center; gap: 10px; min-height: 52px; }
	.sl { flex: none; width: 80px; display: inline-flex; align-items: center; gap: 5px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #ffd38a; }
	.sl.rm { color: #a8b3c2; } .sl.rm svg { stroke: #a8b3c2; }
	.cards { flex: 1; min-width: 0; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
	.cards em { font-style: normal; color: #5f7186; }
	.sc { position: relative; flex: none; width: 38px; border-radius: 4px; }
	.sc :global(.card), .sc :global(.cardface) { width: 100%; }
	.sc.disc { box-shadow: 0 0 0 1.5px #d8a24a; }
	.sc.rmv { filter: grayscale(1) brightness(0.6); }
	.sc.rmv::after { content: ''; position: absolute; left: -2px; right: -2px; top: 50%; height: 2px; background: #e0533f; transform: rotate(-35deg); }
</style>
