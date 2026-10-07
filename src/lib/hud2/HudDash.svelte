<script lang="ts" module>
	export type Order = { label: string; sub?: string; kind: 'go' | 'quiet' | 'wait' | 'off' | 'team'; pulse?: boolean; run?: () => void; alt?: { label: string; run: () => void } };
</script>

<script lang="ts">
	// Your dash (2.0 HUD, design px, 88 tall). A matching cap at each end: on the left your portrait with the eight
	// level arcs as its outer ring (the 8th purple), your initiative this turn, the crown and the status markers; on the
	// right the gold action ring (the one thing to do, in a word). Between them: your hero (the player under it) and
	// your coins on a coin with − / +, the six stats 3 × 2, this round's wells I–IV, the discard pile, the deck and the
	// ultimate, the tools (tokens · radius · ping) over the hand options (auto-hide · fan / side by side · dock). Docking
	// the hand slides the action ring out to the right and the ribbon rack out from behind it — nothing else moves.
	import { onDestroy, type Snippet } from 'svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import Card from '$lib/cards/Card.svelte';
	import DockHand from '$lib/DockHand.svelte';
	import StatBubbles from './StatBubbles.svelte';
	import { heroCards, heroName } from '$lib/cards/deck';
	import { portraitCss, heroLogo } from '$lib/heroes';
	import { levelOf, statDeltas, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let name = '';
	export let color = '#888';
	export let team: 'orange' | 'blue' = 'orange';
	export let turnIdx = 0;
	export let revealed = false;
	export let ini: number | null = null;
	export let marks: { poison?: number | boolean; bounty?: number | boolean } = {};
	export let markArt: (k: 'poison' | 'bounty') => string = () => '';
	export let ultIdx = -1;
	export let ultReady = false;
	export let deckCount = 0;
	export let levelUp = false; // a level-up is waiting: the deck glows
	export let order: Order = { label: 'Commit', kind: 'off' };
	export let fxAt: (t: number) => boolean = () => false;
	// hand options (1.0)
	export let autoHide = true;
	export let spread = false;
	export let docked = false;
	export let hand: number[] = [];
	export let armed: number | null = null;
	export let pingArmed = false;
	export let discOpen = false;
	export let radius: Snippet | undefined = undefined;
	export let tokens: Snippet | undefined = undefined;
	export let onMe: () => void = () => {};
	export let onCoins: (d: number) => void = () => {};
	export let onSlot: (e: Event, t: number) => void = () => {};
	export let onDiscard: () => void = () => {};
	export let onDiscPick: (i: number) => void = () => {};
	export let onDeck: () => void = () => {};
	export let onUlt: () => void = () => {};
	export let onPing: () => void = () => {};
	export let onAutoHide: () => void = () => {};
	export let onSpread: () => void = () => {};
	export let onDock: () => void = () => {};
	export let onPick: (i: number) => void = () => {};

	const ROMAN = ['I', 'II', 'III', 'IV'];
	$: lv = levelOf(cs);
	const arc = (i: number, r = 62) => {
		const a0 = ((i * 45 + 4) * Math.PI) / 180, a1 = ((i * 45 + 41) * Math.PI) / 180;
		return `M ${(70 + r * Math.sin(a0)).toFixed(2)} ${(70 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(70 + r * Math.sin(a1)).toFixed(2)} ${(70 - r * Math.cos(a1)).toFixed(2)}`;
	};
	$: top = cs.discard.length ? cs.discard[cs.discard.length - 1] : null;
	// the ring's word(s): one line per word, sized so the longest fits across the ring
	$: words = order.label.split(' ');
	$: labelFs = Math.min(16, 70 / (Math.max(...words.map((w) => w.length)) * 0.62));
	$: subLong = (order.sub ?? '').length > 16;
	// the dock slides (transform only); the rack is clipped only while it moves, so its pop-ups can rise above the dash
	let sliding = false;
	let slideT: ReturnType<typeof setTimeout> | null = null;
	let wasDocked = docked;
	$: if (docked !== wasDocked) { wasDocked = docked; slide(); }
	function slide() {
		sliding = true;
		if (slideT) clearTimeout(slideT);
		slideT = setTimeout(() => (sliding = false), 460);
	}
	onDestroy(() => { if (slideT) clearTimeout(slideT); });
</script>

<div class="mydash is-{team}" class:docked>
	<div class="dbody">
		<button class="cap medal" on:click={onMe} title="Your board">
			<span class="capin">
				<svg class="mring" viewBox="0 0 140 140" aria-hidden="true">
					<defs><linearGradient id="h2-md-br" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0c2" /><stop offset="0.5" stop-color="#d8b36a" /><stop offset="1" stop-color="#8f6a28" /></linearGradient></defs>
					{#each Array(8) as _, i (i)}<path d={arc(i)} class="lv" class:on={i < lv || (i === 7 && cs.ultimate)} class:ult={i === 7} />{/each}
				</svg>
				<span class="mface" style="--pc:{color}; {portraitCss(cs.hero)}"></span>
			</span>
			{#if cs.ultimate}<span class="crown">♛</span>{/if}
			<span class="mini" class:off={ini == null} title="Your initiative this turn"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 3h5" /></svg>{ini ?? '–'}</span>
			{#if marks.poison || marks.bounty}<span class="mmk">{#if marks.poison}<img src={markArt('poison')} alt="Poison" title="Poisoned" />{/if}{#if marks.bounty}<img src={markArt('bounty')} alt="Bounty" title="Bounty" />{/if}</span>{/if}
		</button>

		<div class="dme">
			<button class="dmn" on:click={onMe}>{heroName(cs.hero)}</button>
			<span class="dmh">{name}</span>
			<span class="purse" title="Coins">
				<button on:click={() => onCoins(-1)} aria-label="Remove a coin">−</button>
				<span class="gcoin">{cs.coins}</span>
				<button on:click={() => onCoins(1)} aria-label="Add a coin">+</button>
			</span>
		</div>
		<StatBubbles deltas={statDeltas(cs)} size={27} cols={3} />

		<div class="dwells">
			{#each [0, 1, 2, 3] as t (t)}
				<span class="dw" class:now={t === turnIdx} class:glow={fxAt(t)}>
					<span class="dwc"><TurnSlot heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} peekable examinable on:click={(e) => onSlot(e, t)} /></span>
					<small>{ROMAN[t]}</small>
				</span>
			{/each}
			<span class="dsep"></span>
			<span class="dw pile">
				<button class="dwc" on:click={onDiscard} title="Discard pile" disabled={top == null}>
					{#if top != null}<Card heroId={cs.hero} card={heroCards(cs.hero)[top]} /><em>{cs.discard.length}</em>
					{:else}<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></svg>{/if}
				</button>
				<small>Discard</small>
				{#if discOpen && cs.discard.length > 1}
					<span class="discpop">{#each cs.discard as i (i)}<button on:click={() => onDiscPick(i)} title="Read (you can recover it)"><Card heroId={cs.hero} card={heroCards(cs.hero)[i]} /></button>{/each}</span>
				{/if}
			</span>
			<button class="dw deckw" class:lvup={levelUp} on:click={onDeck} title="Your deck">
				<span class="dwc stack"><i></i><i></i><span class="top"><img src={heroLogo(cs.hero)} alt="" /></span><em>{deckCount}</em></span>
				<small>Deck</small>
			</button>
			<button class="dw ultw" class:on={cs.ultimate} class:ready={ultReady} on:click={onUlt} title={cs.ultimate ? 'Your ultimate' : ultReady ? 'Unlock your ultimate' : 'Ultimate — unlocks at level 8'} disabled={ultIdx < 0}>
				<span class="dwc">{#if cs.ultimate && ultIdx >= 0}<Card heroId={cs.hero} card={heroCards(cs.hero)[ultIdx]} />{:else}<b>IV</b>{/if}</span>
				<small>Ult</small>
			</button>
		</div>

		<div class="dtools">
			<span class="tslot">{#if tokens}{@render tokens()}{/if}</span>
			<span class="tslot">{#if radius}{@render radius()}{/if}</span>
			<button class="tl" class:on={pingArmed} on:click={onPing} title={pingArmed ? 'Tap the board to ping — or press again to ping your hero' : 'Ping (or Alt+click the board)'} aria-label="Ping"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6" class="f" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17" /></svg></button>
			<button class="tl" class:on={autoHide} on:click={onAutoHide} title={autoHide ? 'Auto-hide hand: on' : 'Auto-hide hand: off'} aria-label="Auto-hide hand">
				<svg viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="8" height="11" rx="1.4" class="cardf" transform="rotate(-9 8.5 8)" /><rect x="11.5" y="2.5" width="8" height="11" rx="1.4" class="cardf" transform="rotate(9 15.5 8)" /><path d="M2.5 15.5h19" />{#if autoHide}<path d="M9 18.5l3 3 3-3" />{:else}<path d="M9 21.5l3-3 3 3" />{/if}</svg>
			</button>
			<button class="tl" class:on={spread} disabled={docked} on:click={onSpread} title={spread ? 'Hand: side by side' : 'Hand: fanned'} aria-label="Hand layout">
				<svg viewBox="0 0 24 24">{#if spread}<rect x="1.5" y="6" width="6.2" height="10" rx="1.2" class="cardf" /><rect x="8.9" y="6" width="6.2" height="10" rx="1.2" class="cardf" /><rect x="16.3" y="6" width="6.2" height="10" rx="1.2" class="cardf" />{:else}<rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cardf" transform="rotate(-22 12 21)" /><rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cardf" transform="rotate(22 12 21)" /><rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cardf" />{/if}</svg>
			</button>
			<button class="tl" class:on={docked} on:click={onDock} title={docked ? 'Hand docked in the dash' : 'Dock the hand in the dash'} aria-label="Dock the hand">
				<svg viewBox="0 0 24 24"><rect x="2.5" y="12.5" width="19" height="9" rx="2" /><rect x="6" y="14.5" width="3.4" height="5" rx="0.6" class="f" /><rect x="10.3" y="14.5" width="3.4" height="5" rx="0.6" class="f" /><rect x="14.6" y="14.5" width="3.4" height="5" rx="0.6" class="f" />{#if docked}<path d="M9 7.5l3-3 3 3M12 4.5v6" />{:else}<path d="M9 7l3 3 3-3M12 3.5v6.5" />{/if}</svg>
			</button>
		</div>

		<div class="dexw" class:open={docked} class:sliding aria-hidden={!docked}>
			<div class="dext">
				{#if docked || sliding}<div class="dock" class:armed={armed != null}><DockHand heroId={cs.hero} {hand} fanned={!autoHide} {onPick} /></div>{/if}
			</div>
		</div>

		<div class="dgo">
			<button class="cap gob {order.kind}" class:pulse={order.pulse} disabled={!order.run} on:click={() => order.run?.()}>
				<span class="gin">
					<i></i>
					<b style="font-size:{labelFs.toFixed(1)}px">{#each words as w, i (i)}{#if i}<br />{/if}{w}{/each}</b>
					<span class="gsub">{#if order.sub}<small class:long={subLong}>{order.sub}</small>{/if}</span>
				</span>
			</button>
			{#if order.alt}<button class="galt" on:click={order.alt.run}>{order.alt.label}</button>{/if}
		</div>
	</div>
</div>

<style>
	.mydash { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); --cap: 104px; --dw: 170px; height: 88px; color: #f5f1e8; pointer-events: auto; }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.18); --th: #ffb878; } .is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.2); --th: #9ccbff; }
	.dbody { position: relative; height: 100%; display: flex; align-items: center; gap: 16px; padding: 0 calc(var(--cap) - 2px); box-sizing: border-box; border-radius: 44px;
		background: linear-gradient(180deg, var(--tg), transparent 50%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); border-top: 2px solid var(--tc); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6); }
	button { font: inherit; color: inherit; }
	/* the caps: the same size at both ends, each half over the bar's end */
	.cap { position: absolute; top: 50%; width: var(--cap); height: var(--cap); border-radius: 50%; padding: 7px; border: 0; cursor: pointer; box-sizing: border-box; transform: translateY(-50%); }
	.medal { left: -14px; padding: 0; background: radial-gradient(circle at 50% 35%, #1d3d60, #0b1d33 70%, #06111f); box-shadow: 0 0 0 2px #0a1a2c, 0 12px 26px rgba(0, 0, 0, 0.65); }
	.capin { position: relative; display: block; width: 100%; height: 100%; border-radius: 50%; }
	.mring { position: absolute; inset: 0; width: 100%; height: 100%; }
	.mring .lv { fill: none; stroke: rgba(255, 255, 255, 0.14); stroke-width: 12; }
	.mring .lv.on { stroke: url(#h2-md-br); }
	.mring .lv.ult { stroke: rgba(138, 79, 209, 0.45); }
	.mring .lv.ult.on { stroke: #a46be8; }
	.mface { position: absolute; inset: 15%; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a;
		box-shadow: 0 0 0 3px var(--tc), 0 0 0 4.5px var(--pc), 0 0 12px 3px color-mix(in srgb, var(--tc) 55%, transparent); }
	.crown { position: absolute; left: 50%; top: -14px; transform: translateX(-50%); font-size: 20px; color: #c9a2ff; text-shadow: 0 0 8px rgba(160, 100, 240, 0.8); }
	.mini { position: absolute; right: -12px; top: -4px; display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 7px 0 5px; border-radius: 999px; font-size: 13px; color: #f5f1e8; background: #0a1a2c; box-shadow: 0 0 0 1.5px var(--brass); }
	.mini svg { width: 13px; height: 13px; fill: none; stroke: var(--brass-hi); stroke-width: 1.9; stroke-linecap: round; }
	.mini.off { color: #8a9fb3; box-shadow: 0 0 0 1px var(--line); }
	.mmk { position: absolute; left: -8px; bottom: -2px; display: flex; flex-direction: column; gap: 2px; }
	.mmk img { width: 22px; height: 22px; border-radius: 50%; box-shadow: 0 0 0 2px #0a1a2c; }
	.dme { display: flex; flex-direction: column; gap: 4px; width: 96px; }
	.dmn { padding: 0; border: 0; background: none; text-align: left; font-size: 19px; line-height: 1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
	.dmh { font-size: 11px; line-height: 1; color: var(--th); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.purse { align-self: flex-start; margin-top: 4px; display: inline-flex; align-items: center; gap: 4px; }
	.purse button { width: 18px; height: 18px; border-radius: 50%; padding: 0; border: 1px solid var(--line); background: rgba(0, 0, 0, 0.3); color: var(--brass-hi); font-size: 13px; line-height: 1; cursor: pointer; }
	.gcoin { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; line-height: 1; color: #3a2606; text-shadow: 0 1px 0 rgba(255, 240, 200, 0.6);
		background: radial-gradient(circle at 35% 30%, #fff2c0, #e8bd58 55%, #a8792a); box-shadow: inset 0 0 0 2px rgba(122, 86, 24, 0.55), 0 0 0 1px #5a3f10, 0 2px 4px rgba(0, 0, 0, 0.5); }
	.dwells { display: flex; align-items: flex-start; gap: 6px; }
	.dw { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 0; border: 0; background: none; }
	.dw small { font-size: 9px; line-height: 1; color: #8a9fb3; letter-spacing: 0.08em; text-transform: uppercase; }
	.dwc { position: relative; width: 46px; aspect-ratio: 1192 / 1664; border-radius: 5px; display: grid; place-items: center; padding: 0; border: 0; background: none; box-sizing: border-box; }
	.dwc :global(.slot) { aspect-ratio: 1192 / 1664; }
	.dwc :global(.card), .dwc :global(.cardface) { width: 100%; }
	.dw.now :global(.slot.blank) { border: 1.5px solid var(--brass); color: var(--brass-hi); }
	.dw.now :global(.flip), .dw.now :global(.static) { box-shadow: 0 0 0 2px var(--brass-hi); border-radius: 6px; }
	.dw.now small { color: var(--brass-hi); }
	.dw.glow .dwc { box-shadow: 0 0 0 2px #fff, 0 0 12px 3px var(--tc); border-radius: 6px; }
	.dsep { align-self: stretch; width: 1px; margin: 3px 2px 14px; background: var(--line); }
	.pile .dwc { border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.22); cursor: pointer; }
	.pile .dwc:disabled { cursor: default; }
	.pile svg { width: 17px; height: 17px; fill: none; stroke: rgba(255, 255, 255, 0.3); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.dwc em { position: absolute; right: -5px; bottom: -5px; z-index: 1; min-width: 17px; height: 17px; border-radius: 9px; display: grid; place-items: center; font-style: normal; font-size: 10px; background: #0a1a2c; border: 1px solid var(--line); }
	.discpop { position: absolute; bottom: calc(100% + 14px); left: 50%; transform: translateX(-50%); z-index: 5; display: flex; gap: 6px; padding: 8px; border-radius: 12px; background: rgba(8, 22, 38, 0.97); border: 1px solid var(--line); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6); }
	.discpop button { width: 78px; padding: 0; border: 0; background: none; cursor: pointer; }
	.deckw, .ultw { cursor: pointer; }
	.stack i, .stack .top { position: absolute; inset: 0; border-radius: 5px; background: linear-gradient(160deg, #1d3c5e, #0b1b2e); box-shadow: 0 0 0 1px var(--line), 0 2px 5px rgba(0, 0, 0, 0.5); }
	.stack i:nth-child(1) { transform: translate(3px, -3px); opacity: 0.6; } .stack i:nth-child(2) { transform: translate(1.5px, -1.5px); opacity: 0.8; }
	.stack .top { display: grid; place-items: center; }
	.stack .top img { width: 74%; opacity: 0.9; }
	.deckw.lvup .stack .top { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 14px 3px rgba(244, 223, 168, 0.55); }
	.ultw .dwc { border: 1px solid rgba(164, 107, 232, 0.35); background: rgba(90, 50, 150, 0.18); }
	.ultw .dwc b { font-weight: 400; font-size: 14px; color: rgba(196, 160, 255, 0.5); }
	.ultw.ready .dwc { border-color: #a46be8; box-shadow: 0 0 10px 2px rgba(164, 107, 232, 0.55); }
	.ultw.on .dwc { border: 0; box-shadow: 0 0 0 2px #a46be8, 0 0 10px 2px rgba(164, 107, 232, 0.5); }
	.ultw:disabled { cursor: default; }
	.dtools { display: grid; grid-template-columns: repeat(3, 28px); gap: 5px; }
	.tl, .tslot :global(.radbtn), .tslot :global(.tokbtn) { position: relative; width: 28px; height: 28px; min-width: 0; border-radius: 50%; display: grid; place-items: center; padding: 0; color: var(--brass-hi);
		background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); cursor: pointer; box-sizing: border-box; }
	.tslot { position: relative; width: 28px; height: 28px; }
	.tslot :global(.radbtn b) { position: absolute; right: -4px; bottom: -4px; min-width: 14px; height: 14px; border-radius: 7px; display: grid; place-items: center; font-weight: 400; font-size: 9px; color: #f5f1e8; background: #0a1a2c; border: 1px solid var(--line); }
	.tslot :global(.radbtn svg), .tslot :global(.tokbtn img) { width: 16px; height: 16px; }
	.tslot :global(.radbtn.on), .tslot :global(.tokbtn.on) { color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.tslot :global(.radpop), .tslot :global(.tokdrawer) { bottom: calc(100% + 16px); top: auto; }
	.tl svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.tl svg .f { fill: currentColor; stroke: none; }
	.tl svg .cardf { fill: rgba(9, 13, 22, 0.9); }
	.tl.on svg .cardf { fill: rgba(255, 240, 200, 0.6); }
	.tl.on { color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.tl:disabled { opacity: 0.35; cursor: default; }
	/* the dock: a length of the dash that slides out from under the action ring (which slides --dw to the right) */
	.dexw { position: absolute; z-index: 1; top: -2px; bottom: -1px; left: calc(100% - var(--cap)); width: calc(var(--cap) + var(--dw)); visibility: hidden; pointer-events: none; }
	.dexw.open, .dexw.sliding { visibility: visible; }
	.dexw.open { pointer-events: auto; }
	.dexw.sliding { overflow: hidden; }
	.dext { position: absolute; inset: 0; display: flex; align-items: center; padding-left: 14px; box-sizing: border-box; border-radius: 0 44px 44px 0; transform: translateX(-100%);
		background: linear-gradient(180deg, var(--tg), transparent 50%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97));
		border: 1px solid var(--line); border-left: 0; border-top: 2px solid var(--tc); transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.open .dext { transform: none; }
	.dock { height: 76px; padding-left: 10px; border-left: 1px solid var(--line); }
	/* the action cap */
	.dgo { position: absolute; z-index: 2; right: -14px; top: 50%; width: var(--cap); height: var(--cap); transform: translateY(-50%); transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.docked .dgo { transform: translate(var(--dw), -50%); }
	.gob { top: 0; left: 0; transform: none;
		background: conic-gradient(from 200deg, #8f6a28, #f6e2a6, #c9a050, #fff3c8, #9c7a34, #e8c97c, #8f6a28);
		box-shadow: 0 0 0 2px #0a1a2c, 0 0 0 3px rgba(244, 223, 168, 0.5), 0 12px 26px rgba(0, 0, 0, 0.65); }
	.gob:disabled { cursor: default; }
	/* the word(s) dead centre, the second line in the lower half (never wider than the ring there) */
	.gin { width: 100%; height: 100%; border-radius: 50%; display: grid; grid-template-rows: 1fr auto 1fr; justify-items: center; text-align: center; overflow: hidden;
		background: radial-gradient(circle at 50% 35%, #1d3d60, #0b1d33 70%, #06111f); box-shadow: inset 0 0 0 2px #0a1a2c, inset 0 6px 14px rgba(0, 0, 0, 0.6); color: var(--brass-hi); }
	.gin b { font-weight: 400; line-height: 1.05; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.7); }
	.gsub { align-self: start; width: 66%; padding-top: 4px; }
	.gin small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; font-size: 9px; line-height: 1.2; letter-spacing: 0.05em; text-transform: uppercase; text-align: center; text-wrap: balance; overflow-wrap: anywhere; color: #bccbd9; }
	.gin small.long { font-size: 8px; }
	.gob.go .gin, .gob.team .gin { background: radial-gradient(circle at 50% 40%, #3a5f86, #13304f 62%, #081626); color: #fff3c8; }
	.gob.team .gin { background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--tc) 70%, #fff 10%), color-mix(in srgb, var(--tc) 55%, #000) 70%); color: #fff; }
	.gob.pulse::after { content: ''; position: absolute; inset: -10px; border-radius: 50%; box-shadow: 0 0 22px 7px rgba(244, 223, 168, 0.5); opacity: 0.35; animation: gopulse 1.6s ease-in-out infinite; pointer-events: none; }
	@keyframes gopulse { 50% { opacity: 1; } }
	.gob.quiet { filter: saturate(0.4) brightness(0.85); }
	.gob.wait .gin, .gob.off .gin { color: #8a9fb3; }
	.gob.off { filter: saturate(0.5) brightness(0.8); }
	.galt { position: absolute; left: 50%; bottom: -12px; transform: translateX(-50%); padding: 3px 10px; border-radius: 999px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #fff; background: #b42318; border: 2px solid #0a1a2c; cursor: pointer; }
	@media (prefers-reduced-motion: reduce) { .gob.pulse::after { animation: none; opacity: 0.7; } }
</style>
