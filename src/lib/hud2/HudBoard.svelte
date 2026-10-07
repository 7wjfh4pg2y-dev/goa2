<script lang="ts">
	// One player's board in a side column (2.0 HUD). Header: the portrait in its level ring · the HERO · the player ·
	// Lv · cards in hand. Then this round's four turn slots (face-down once committed, flipping up on the reveal) and
	// the discard pile, then the six stat bubbles. The hero's whole painting sits faintly behind. A click anywhere
	// opens the full board (gold and the status markers live there); a face-up card in a slot reads it.
	// compact: just the header and four little wells in the cards' colours (a nameplate).
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import Card from '$lib/cards/Card.svelte';
	import StatBubbles from './StatBubbles.svelte';
	import { heroCards, heroName } from '$lib/cards/deck';
	import { portraitCss, heroSplash, splashFace } from '$lib/heroes';
	import { levelOf, statDeltas, PASS, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let name = '';
	export let color = '#888'; // the player's colour
	export let team: 'orange' | 'blue' = 'orange';
	export let turnIdx = 0;
	export let revealed = false;
	export let ready = false;
	export let compact = false;
	export let small = false; // 3 to a column
	export let fxAt: (t: number) => boolean = () => false; // a lingering effect on that slot's card
	export let onOpen: () => void = () => {};
	export let onSlot: (e: Event, t: number) => void = () => {};

	const COL: Record<string, string> = { GOLD: '#c9982f', SILVER: '#8d99a8', RED: '#b8322f', BLUE: '#2a64c4', GREEN: '#2b8a43', PURPLE: '#7a46bd' };
	const ROMAN = ['I', 'II', 'III', 'IV'];
	$: lv = levelOf(cs);
	$: face = splashFace(cs.hero);
	const arc = (i: number, r = 23) => {
		const a0 = ((i * 45 + 5) * Math.PI) / 180, a1 = ((i * 45 + 40) * Math.PI) / 180;
		return `M ${(25 + r * Math.sin(a0)).toFixed(2)} ${(25 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(25 + r * Math.sin(a1)).toFixed(2)} ${(25 - r * Math.cos(a1)).toFixed(2)}`;
	};
	// the compact wells: played cards in their colour, this turn's state, the rest empty
	const wellOf = (t: number) => {
		const i = cs.turns[t] ?? (t === turnIdx && revealed ? cs.pending : null);
		if (i != null && i !== PASS) return { col: COL[heroCards(cs.hero)[i]?.color] ?? '#666', kind: 'played' };
		if (t === turnIdx) return { col: '', kind: cs.pending != null ? 'in' : 'now' };
		return { col: '', kind: 'future' };
	};
	$: top = cs.discard.length ? cs.discard[cs.discard.length - 1] : null;
</script>

<div class="xb is-{team}" class:compact class:small role="button" tabindex="0" on:click={onOpen} on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
	<span class="xart" style="background-image:url({heroSplash(cs.hero)}); background-position:{face[0] * 100}% {face[1] * 100}%"></span>
	<span class="xtop">
		<span class="ring" style="--pc:{color}">
			<span class="pf" style={portraitCss(cs.hero)}></span>
			<svg viewBox="0 0 50 50" aria-hidden="true">{#each Array(8) as _, i (i)}<path d={arc(i)} class:on={i < lv || (i === 7 && cs.ultimate)} class:ult={i === 7} />{/each}</svg>
		</span>
		<span class="xname"><span class="hn">{heroName(cs.hero)}</span><span class="ph">{name} · Lv {lv}</span></span>
		{#if compact}
			<span class="wells">{#each [0, 1, 2, 3] as t (t)}{@const w = wellOf(t)}<i class="w {w.kind}" class:glow={fxAt(t)} style={w.col ? `--c:${w.col}` : ''}></i>{/each}</span>
		{/if}
		{#if !revealed}<i class="rdy" class:ok={ready} title={ready ? 'Ready' : 'Choosing'}></i>{/if}
		<span class="hand" title="Cards in hand"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="11" height="15" rx="2" /><path d="M9 3h9a2 2 0 0 1 2 2v13" /></svg>{cs.hand.length}</span>
	</span>
	{#if !compact}
		<span class="slots">
			{#each [0, 1, 2, 3] as t (t)}
				<span class="ws" class:now={t === turnIdx} class:glow={fxAt(t)}>
					<TurnSlot heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} examinable on:click={(e) => onSlot(e, t)} />
				</span>
			{/each}
			<span class="sdiv"></span>
			<span class="ws disc" title="Discard pile">
				{#if top != null}<Card heroId={cs.hero} card={heroCards(cs.hero)[top]} /><em>{cs.discard.length}</em>
				{:else}<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></svg>{/if}
			</span>
		</span>
		<StatBubbles deltas={statDeltas(cs)} size={small ? 32 : 38} />
	{/if}
</div>

<style>
	.xb { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); position: relative; overflow: hidden; isolation: isolate; display: flex; flex-direction: column; gap: 10px; padding: 10px 14px 14px; border-radius: 16px;
		text-align: left; color: #f5f1e8; cursor: pointer; pointer-events: auto; box-sizing: border-box;
		background: linear-gradient(180deg, var(--tg), transparent 45%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); border-top: 3px solid var(--tc); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5); }
	.xb.small { gap: 8px; padding: 8px 14px 12px; }
	.xb.compact { gap: 0; padding: 8px 12px; }
	.xb:focus-visible { outline: 2px solid var(--brass-hi); outline-offset: 2px; }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.18); --th: #ffb878; }
	.is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.2); --th: #9ccbff; }
	.xart { position: absolute; inset: 0; z-index: -1; background-size: cover; background-repeat: no-repeat; opacity: 0.32; pointer-events: none;
		-webkit-mask-image: linear-gradient(100deg, rgba(0, 0, 0, 0.35) 10%, #000 70%); mask-image: linear-gradient(100deg, rgba(0, 0, 0, 0.35) 10%, #000 70%); }
	.xtop { display: flex; align-items: center; gap: 10px; height: 38px; }
	.ring { position: relative; flex: none; width: 38px; height: 38px; display: grid; place-items: center; }
	.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.ring path { fill: none; stroke: rgba(255, 255, 255, 0.16); stroke-width: 3.2; stroke-linecap: round; }
	.ring path.on { stroke: var(--brass); }
	.ring path.ult { stroke: rgba(138, 79, 209, 0.55); }
	.ring path.ult.on { stroke: #a46be8; }
	.pf { width: 70%; height: 70%; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--tc), 0 0 0 3.5px var(--pc); }
	.xname { flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; white-space: nowrap; overflow: hidden; }
	.hn { flex: none; font-size: 19px; line-height: 1; color: #fff; }
	.small .hn { font-size: 18px; }
	.ph { font-size: 12px; line-height: 1; color: var(--th); overflow: hidden; text-overflow: ellipsis; }
	.rdy { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1.5px dashed rgba(255, 255, 255, 0.35); box-sizing: border-box; }
	.rdy.ok { border: 0; background: #16a34a; box-shadow: 0 0 6px rgba(22, 163, 74, 0.7); }
	.hand { display: inline-flex; align-items: center; gap: 4px; font-size: 15px; color: #bccbd9; }
	.hand svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; }
	.slots { display: grid; grid-template-columns: repeat(4, 1fr) 1px 1fr; gap: 8px; align-items: center; }
	.small .slots { padding: 0 6px; gap: 10px; }
	.ws { position: relative; border-radius: 6px; }
	.ws :global(.slot) { aspect-ratio: 1192 / 1664; }
	.ws.now :global(.slot.blank) { border: 1.5px solid var(--brass); color: var(--brass-hi); }
	.ws.now :global(.flip), .ws.now :global(.static) { box-shadow: 0 0 0 2px var(--brass-hi); border-radius: 6px; }
	.ws.glow { box-shadow: 0 0 0 2px #fff, 0 0 12px 3px var(--tc); }
	.sdiv { align-self: stretch; margin: 6px 0; background: var(--line); }
	.ws.disc { aspect-ratio: 1192 / 1664; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.22); box-sizing: border-box; }
	.ws.disc :global(.card), .ws.disc :global(.cardface) { width: 100%; }
	.ws.disc svg { width: 20px; height: 20px; fill: none; stroke: rgba(255, 255, 255, 0.3); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.ws.disc em { position: absolute; right: -6px; bottom: -6px; min-width: 20px; height: 20px; border-radius: 10px; display: grid; place-items: center; font-style: normal; font-size: 12px; background: #0a1a2c; border: 1px solid var(--line); }
	.wells { display: flex; gap: 3px; }
	.w { width: 12px; height: 16px; border-radius: 3px; box-sizing: border-box; }
	.w.played { background: var(--c); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25); }
	.w.now { border: 1.5px dashed var(--brass); }
	.w.in { background: #f2ede0; border: 1.5px solid var(--brass); }
	.w.future { background: rgba(0, 0, 0, 0.35); }
	.w.glow { box-shadow: 0 0 0 1.5px #fff, 0 0 6px 2px var(--tc); }
</style>
