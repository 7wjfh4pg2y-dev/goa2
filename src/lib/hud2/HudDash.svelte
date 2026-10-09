<script lang="ts" module>
	// kind 'bad' = red (Defeated, Discard); 'next' = the lava lamp (blue and orange: the host moves the game on — Next
	// turn, Minion battle, Next round); 'lvl' = the trees' colours; everything else is silver unless a card tints it.
	// split = the ring in two halves, each its own choice (Defended | Defeated)
	export type Order = { label: string; sub?: string; kind: 'go' | 'quiet' | 'wait' | 'off' | 'team' | 'bad' | 'lvl' | 'next'; pulse?: boolean; run?: () => void; alt?: { label: string; run: () => void }; tint?: boolean;
		/** something is loaded on the ring (an armed card, a board action): the small × unloads it */
		cancel?: () => void;
		split?: { left: { label: string; run: () => void }; right: { label: string; run: () => void } } };
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
	import CardBanner from '$lib/CardBanner.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import StatBubbles from './StatBubbles.svelte';
	import { heroCards, heroName } from '$lib/cards/deck';
	import { portraitCss, heroLogo } from '$lib/heroes';
	import { levelOf, levelCost, type PlayerCardState } from '$lib/cards/cardstate';

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
	// the dock is as long as the hand: each card played takes its ribbon out, and the ring slides back left (transform)
	$: dockW = Math.max(56, 32 + 27 * hand.length);
	export let armed: number | null = null;
	export let ringColor = ''; // the card picked in your hand (to commit, defend or discard): the ring's middle takes its colour
	export let rowMax = 1400; // the widest the kept-up banner row may be (design px; it wraps to fit)
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
	// the ultimate's compartment: shut until the ultimate can be unlocked; then the level ring slides left (transform
	// only) and the compartment opens out from under it — the card (read it) or Unlock [coin]
	$: ultOpen = ultIdx >= 0 && (cs.ultimate || ultReady);
	let uslide = false;
	let uslideT: ReturnType<typeof setTimeout> | null = null;
	let wasUlt = ultOpen;
	$: if (ultOpen !== wasUlt) { wasUlt = ultOpen; uslide = true; if (uslideT) clearTimeout(uslideT); uslideT = setTimeout(() => (uslide = false), 460); }
	const arc = (i: number, r = 62) => {
		const a0 = ((i * 45 + 4) * Math.PI) / 180, a1 = ((i * 45 + 41) * Math.PI) / 180;
		return `M ${(70 + r * Math.sin(a0)).toFixed(2)} ${(70 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(70 + r * Math.sin(a1)).toFixed(2)} ${(70 - r * Math.cos(a1)).toFixed(2)}`;
	};
	$: top = cs.discard.length ? cs.discard[cs.discard.length - 1] : null;
	// the ring's word(s): packed into 1–3 lines (whichever gives the biggest type), sized so the widest line fits across
	// the ring and every line (plus the sub line) fits down it — nothing ever spills out of the circle
	function packLabel(label: string, hasSub: boolean): { lines: string[]; fs: number } {
		const ws = label.split(' ').filter(Boolean);
		const H = hasSub ? 40 : 56;
		let best = { lines: [label], fs: 0 };
		const tryLines = (lines: string[]) => {
			const fs = Math.min(16, 70 / (Math.max(...lines.map((l) => l.length)) * 0.62), H / (lines.length * 1.05));
			if (fs > best.fs) best = { lines, fs };
		};
		tryLines([ws.join(' ')]);
		for (let i = 1; i < ws.length; i++) {
			tryLines([ws.slice(0, i).join(' '), ws.slice(i).join(' ')]);
			for (let j = i + 1; j < ws.length; j++) tryLines([ws.slice(0, i).join(' '), ws.slice(i, j).join(' '), ws.slice(j).join(' ')]);
		}
		return best;
	}
	$: packed = packLabel(order.label, !!order.sub);
	$: words = packed.lines;
	$: labelFs = packed.fs;
	$: subLong = (order.sub ?? '').length > 16;
	// the kept-up banner row: as many a line as fit at a readable width (220+), centred, wrapping upward
	$: fit = Math.max(1, Math.min(hand.length, Math.floor((rowMax + 8) / 228))); // the most a line can hold
	$: perRow = Math.ceil(hand.length / Math.ceil(hand.length / fit)); // …spread evenly: 5 → 3 + 2, 4 → 2 + 2, 3 → 3
	$: cellW = Math.min(270, (rowMax - (fit - 1) * 8) / fit);
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
	onDestroy(() => { if (slideT) clearTimeout(slideT); if (uslideT) clearTimeout(uslideT); });
	// a ring that just changed ignores clicks for a moment: the second tap of a double-tap must not land on the NEXT
	// action (saying No to an effect used to end the turn that way)
	let ringKey = '', ringAt = 0;
	$: { const k = `${order.label}|${order.sub ?? ''}|${order.kind}`; if (k !== ringKey) { ringKey = k; ringAt = Date.now(); } }
	const fire = (fn?: () => void) => { if (Date.now() - ringAt < 450) return; fn?.(); };
</script>

<div class="mydash is-{team}" class:docked class:ulted={ultOpen} class:ascended={cs.ultimate} style="--dw:{dockW}px">
	<div class="dbody">
		<!-- the ultimate's compartment (opens out from under the level ring, which slides left) -->
		<div class="uexw" class:open={ultOpen} class:sliding={uslide} aria-hidden={!ultOpen}>
			<div class="uext">
				{#if (ultOpen || uslide) && ultIdx >= 0}
					<button class="ucard" class:on={cs.ultimate} on:click={onUlt} title={cs.ultimate ? 'Your ultimate — read it' : 'Unlock your ultimate'}>
						<span class="ucw"><Card heroId={cs.hero} card={heroCards(cs.hero)[ultIdx]} /></span>
						{#if cs.ultimate}<small>Ultimate</small>{:else}<small class="unl">Unlock <i class="ucoin">{levelCost(lv)}</i></small>{/if}
					</button>
				{/if}
			</div>
		</div>
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
		<StatBubbles {cs} size={27} cols={3} />

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
				<span class="dwc stack"><i><CardBack hero={cs.hero} blank /></i><i><CardBack hero={cs.hero} blank /></i><span class="top"><CardBack hero={cs.hero} /></span><em>{deckCount}</em></span>
				<small>Deck</small>
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

		<!-- the hand kept up (auto-hide off) while docked: every banner in one row above the dash, edge to edge if need be -->
		{#if docked && !autoHide && hand.length}
			<div class="brow" style="width:{(perRow * cellW + (perRow - 1) * 8).toFixed(0)}px; --cw:{cellW.toFixed(1)}px">
				{#each hand as i, k (i)}<div class="bcell" style="--k:{k}"><CardBanner heroId={cs.hero} idx={i} sel={armed === i} on:click={() => onPick(i)} /></div>{/each}
			</div>
		{/if}
		<div class="dexw" class:open={docked} class:sliding aria-hidden={!docked}>
			<div class="dext">
				{#if docked || sliding}<div class="dock" class:armed={armed != null}><DockHand heroId={cs.hero} {hand} fanned={!autoHide} stack={false} {onPick} /></div>{/if}
			</div>
		</div>

		<div class="dgo">
			{#if order.split}
				<div class="cap gob split">
					<span class="gin">
						<button class="half l" on:click={() => fire(order.split?.left.run)} title={order.split.left.label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9.5C8 18.5 5 15.5 5 11V6z" /></svg><b>{order.split.left.label}</b></button>
						<button class="half r" on:click={() => fire(order.split?.right.run)} title={order.split.right.label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5a7 7 0 0 0-7 7c0 2.3 1.1 4 2.8 5v3.2h8.4v-3.2c1.7-1 2.8-2.7 2.8-5a7 7 0 0 0-7-7z" /><circle cx="9.3" cy="11" r="1.5" class="f" /><circle cx="14.7" cy="11" r="1.5" class="f" /></svg><b>{order.split.right.label}</b></button>
					</span>
				</div>
			{:else}
			<button class="cap gob {order.kind}" class:tinted={!!ringColor && (order.kind !== 'bad' || !!order.tint)} style={ringColor ? `--rc:${ringColor}` : ''} class:pulse={order.pulse} disabled={!order.run} on:click={() => fire(order.run)}>
				<span class="gin">
					{#if order.kind === 'next' && !ringColor}<span class="lava" aria-hidden="true"><i class="lb"></i><i class="lo"></i><i class="lb2"></i><i class="lo2"></i></span>{/if}
					<i></i>
					<b style="font-size:{labelFs.toFixed(1)}px">{#each words as w, i (i)}{#if i}<br />{/if}{w}{/each}</b>
					<span class="gsub">{#if order.sub}<small class:long={subLong}>{order.sub}</small>{/if}</span>
				</span>
			</button>
			{/if}
			{#if order.alt && !order.split}<button class="galt" class:left={!!order.cancel} on:click={() => fire(order.alt?.run)} title={order.alt.label} aria-label={order.alt.label}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6l8 6-8 6z" class="f" /><path d="M17 6v12" /></svg></button>{/if}
			{#if order.cancel}<button class="gx" on:click={order.cancel} title="Cancel" aria-label="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg></button>{/if}
		</div>
	</div>
</div>

<style>
	.mydash { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); --cap: 104px; --dw: 170px; --uw: 96px; height: 88px; color: #f5f1e8; pointer-events: auto; }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.18); --th: #ffb878; } .is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.2); --th: #9ccbff; }
	.dbody { position: relative; height: 100%; display: flex; align-items: center; gap: 20px; padding: 0 calc(var(--cap) - 2px); box-sizing: border-box; border-radius: 44px;
		background: linear-gradient(180deg, var(--tg), transparent 50%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); border-top: 2px solid var(--tc); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6); }
	button { font: inherit; color: inherit; }
	/* the caps: the same size at both ends, each half over the bar's end */
	.cap { position: absolute; top: 50%; width: var(--cap); height: var(--cap); border-radius: 50%; padding: 7px; border: 0; cursor: pointer; box-sizing: border-box; transform: translateY(-50%); }
	.medal { z-index: 2; left: -14px; padding: 0; transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); background: radial-gradient(circle at 50% 35%, #1d3d60, #0b1d33 70%, #06111f); box-shadow: 0 0 0 2px #0a1a2c, 0 12px 26px rgba(0, 0, 0, 0.65); }
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
	.dme { flex: none; display: flex; flex-direction: column; gap: 4px; width: 112px; }
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
	.deckw { cursor: pointer; }
	.stack i, .stack .top { position: absolute; inset: 0; border-radius: 5px; overflow: hidden; box-shadow: 0 0 0 1px rgba(120, 95, 55, 0.5), 0 2px 5px rgba(0, 0, 0, 0.5); }
	.stack i:nth-child(1) { transform: translate(3px, -3px); opacity: 0.6; } .stack i:nth-child(2) { transform: translate(1.5px, -1.5px); opacity: 0.8; }
	.deckw.lvup .stack .top { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 14px 3px rgba(244, 223, 168, 0.55); }
	/* the ultimate's compartment: the level ring slides --uw to the left and this opens out from under it (transform only) */
	.ulted .medal { transform: translate(calc(-1 * var(--uw)), -50%); }
	/* …and the names keep clear of the open compartment */
	.ulted .dbody { padding-left: calc(var(--cap) + 14px); }
	.dbody { transition: padding-left 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.uexw { position: absolute; z-index: 1; top: -2px; bottom: -1px; right: calc(100% - var(--cap)); width: calc(var(--cap) + var(--uw)); visibility: hidden; pointer-events: none; }
	.uexw.open, .uexw.sliding { visibility: visible; }
	.uexw.open { pointer-events: auto; }
	.uexw.sliding { overflow: hidden; }
	.uext { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding-left: 86px; box-sizing: border-box; border-radius: 44px 0 0 44px; transform: translateX(100%);
		background: radial-gradient(ellipse at 70% 50%, rgba(140, 80, 220, 0.28), transparent 70%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97));
		border: 1px solid rgba(180, 130, 255, 0.45); border-right: 0; border-top: 2px solid #a46be8; transition: transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }
	.open .uext { transform: none; }
	.ucard { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: 0; background: none; cursor: pointer; }
	.ucw { width: 44px; aspect-ratio: 1192 / 1664; border-radius: 5px; overflow: hidden; opacity: 0.55; box-shadow: 0 0 0 1px rgba(196, 160, 255, 0.5); }
	.ucw :global(.card), .ucw :global(.cardface) { width: 100%; }
	.ucard.on .ucw { opacity: 1; box-shadow: 0 0 0 2px #a46be8, 0 0 12px 3px rgba(164, 107, 232, 0.6); }
	.ucard small { font-size: 9px; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; color: #d9c2ff; white-space: nowrap; }
	.ucard small.unl { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 999px; color: #1b1204; background: linear-gradient(180deg, #e6d2ff, #a46be8); }
	.ucoin { width: 13px; height: 13px; border-radius: 50%; display: inline-grid; place-items: center; font-style: normal; font-size: 8px; color: #3a2606; background: radial-gradient(circle at 35% 30%, #fff2c0, #e8bd58 55%, #a8792a); }
	/* level 8: the whole ring turns purple and breathes (opacity only, over a still glow) */
	.ascended .mring .lv { stroke: #b383f5; }
	.ascended .mring { filter: drop-shadow(0 0 4px rgba(179, 131, 245, 0.85)); }
	.ascended .medal::after { content: ''; position: absolute; inset: -8px; border-radius: 50%; box-shadow: 0 0 22px 6px rgba(164, 107, 232, 0.65); opacity: 0.35; animation: ascend 2.6s ease-in-out infinite; pointer-events: none; }
	@keyframes ascend { 50% { opacity: 1; } }
	.dtools { display: grid; grid-template-columns: repeat(3, 28px); gap: 5px; }
	.tl, .tslot :global(.radbtn), .tslot :global(.tokbtn) { position: relative; width: 28px; height: 28px; min-width: 0; border-radius: 50%; display: grid; place-items: center; padding: 0; color: var(--brass-hi);
		background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); cursor: pointer; box-sizing: border-box; }
	.tslot { position: relative; width: 28px; height: 28px; }
	.tslot :global(.radbtn b) { position: absolute; right: -4px; bottom: -4px; min-width: 14px; height: 14px; border-radius: 7px; display: grid; place-items: center; font-weight: 400; font-size: 9px; color: #f5f1e8; background: #0a1a2c; border: 1px solid var(--line); }
	.tslot :global(.radbtn svg), .tslot :global(.tokbtn img) { width: 16px; height: 16px; }
	.tslot :global(.tokbtn) { border: 1.5px solid var(--brass); background: radial-gradient(circle at 50% 35%, #3a5f86, #13304f 70%); box-shadow: 0 0 0 2px rgba(216, 179, 106, 0.18), 0 0 10px 1px rgba(244, 223, 168, 0.35); }
	.tslot :global(.tokbtn img) { width: 19px; height: 19px; }
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
	.brow { position: absolute; z-index: 3; left: 50%; bottom: calc(100% + 26px); transform: translateX(-50%); display: flex; flex-wrap: wrap-reverse; justify-content: center; gap: 8px; }
	.bcell { width: var(--cw); }
	.bcell:not(:empty) { filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.6)); animation: bup 0.22s ease-out both; animation-delay: calc(var(--k) * 40ms); }
	@keyframes bup { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
	@media (prefers-reduced-motion: reduce) { .bcell { animation: none; } }
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
	/* silver: every action without a colour of its own (a card's colour or the team's takes over — see .tinted / .team) */
	.gob.go .gin, .gob.quiet .gin { background: radial-gradient(circle at 50% 32%, #ffffff, #c9d1db 40%, #7c8796 80%, #55606e); color: #13202f; }
	.gob.go .gin b, .gob.quiet .gin b { text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6); }
	.gob.go .gin small, .gob.quiet .gin small { color: #2a3747; }
	.gob.wait .gin { background: radial-gradient(circle at 50% 32%, #aab4c0, #6d7887 55%, #3f4855); color: #eef2f6; }
	.gob.wait .gin small { color: #dce3ea; }
	.gob.off .gin { background: radial-gradient(circle at 50% 32%, #7d8794, #4d5662 60%, #2f363f); color: #c7cfd8; }
	.gob.team .gin { background: radial-gradient(circle at 50% 40%, #3a5f86, #13304f 62%, #081626); color: #fff3c8; }
	/* Next turn / Minion battle / Next round: a lava lamp — blue and orange blobs drifting (transform only) */
	.gob.next .gin { position: relative; isolation: isolate; color: #fff; background: #120d24; }
	.gob.next .gin b { text-shadow: 0 1px 3px #000, 0 0 8px rgba(0, 0, 0, 0.8); }
	.gob.next .gin small { color: #fff; text-shadow: 0 1px 3px #000; }
	.lava { position: absolute; inset: 0; z-index: -1; border-radius: 50%; overflow: hidden; }
	.lava i { position: absolute; left: 0; top: 0; width: 78%; height: 78%; border-radius: 50%; will-change: transform; }
	.lava .lb { background: radial-gradient(circle, #4d9bff 0, rgba(47, 127, 230, 0.85) 30%, rgba(47, 127, 230, 0) 68%); animation: lavaA 7s ease-in-out infinite alternate; }
	.lava .lo { background: radial-gradient(circle, #ffad5c 0, rgba(239, 125, 34, 0.85) 30%, rgba(239, 125, 34, 0) 68%); animation: lavaB 8.5s ease-in-out infinite alternate; }
	.lava .lb2 { width: 55%; height: 55%; background: radial-gradient(circle, rgba(120, 180, 255, 0.9), rgba(47, 127, 230, 0) 68%); animation: lavaC 6s ease-in-out infinite alternate; }
	.lava .lo2 { width: 55%; height: 55%; background: radial-gradient(circle, rgba(255, 170, 90, 0.9), rgba(239, 125, 34, 0) 68%); animation: lavaD 9s ease-in-out infinite alternate; }
	@keyframes lavaA { 0% { transform: translate(-18%, 30%) scale(1); } 50% { transform: translate(30%, -10%) scale(1.25); } 100% { transform: translate(-5%, -25%) scale(0.9); } }
	@keyframes lavaB { 0% { transform: translate(40%, -15%) scale(1.1); } 50% { transform: translate(-10%, 35%) scale(0.85); } 100% { transform: translate(35%, 40%) scale(1.2); } }
	@keyframes lavaC { 0% { transform: translate(70%, 70%); } 100% { transform: translate(10%, 5%); } }
	@keyframes lavaD { 0% { transform: translate(5%, 60%); } 100% { transform: translate(75%, 10%); } }
	.gob.team .gin { background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--tc) 70%, #fff 10%), color-mix(in srgb, var(--tc) 55%, #000) 70%); color: #fff; }
	.gob.tinted .gin { background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--rc) 80%, #fff 12%), color-mix(in srgb, var(--rc) 62%, #000) 72%); color: #fff; }
	.gob.tinted .gin small { color: rgba(255, 255, 255, 0.82); }
	.gob.bad.tinted .gin { background: radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--rc) 80%, #fff 12%), color-mix(in srgb, var(--rc) 62%, #000) 72%); }
	.gob.pulse::after { content: ''; position: absolute; inset: -10px; border-radius: 50%; box-shadow: 0 0 22px 7px rgba(244, 223, 168, 0.5); opacity: 0.35; animation: gopulse 1.6s ease-in-out infinite; pointer-events: none; }
	@keyframes gopulse { 50% { opacity: 1; } }
	/* Level up: the three colours of the trees, turning slowly (transform only) under a dark centre */
	.gob.lvl .gin { position: relative; isolation: isolate; color: #fff; background: #120f22; }
	.gob.lvl .gin::before { content: ''; position: absolute; inset: -25%; z-index: -2; background: conic-gradient(from 0deg, #e0524a, #b45cd6, #3f7fe0, #2fb3a0, #41ae59, #d8b36a, #e0524a); animation: irid 5s linear infinite; }
	.gob.lvl .gin::after { content: ''; position: absolute; inset: 7px; z-index: -1; border-radius: 50%; background: radial-gradient(circle at 50% 40%, rgba(40, 30, 70, 0.72), rgba(10, 8, 24, 0.9) 75%); }
	.gob.lvl .gin small { color: rgba(255, 255, 255, 0.85); }
	@keyframes irid { to { transform: rotate(360deg); } }
	.gob.bad .gin { background: radial-gradient(circle at 50% 38%, #e0533f, #8f1d12 72%); color: #fff; }
	.gob.bad .gin small { color: rgba(255, 255, 255, 0.85); }
	/* the split ring: the team's colour (Defended) on the left, red (Defeated) on the right, a gold seam between */
	.gob.split .gin { display: flex; padding: 0; position: relative; }
	.gob.split .gin::after { content: ''; position: absolute; left: 50%; top: 8%; bottom: 8%; width: 2px; margin-left: -1px; background: linear-gradient(180deg, transparent, #f4dfa8 20%, #f4dfa8 80%, transparent); pointer-events: none; }
	.half { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: #fff; }
	.half svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
	.half svg .f { fill: currentColor; stroke: none; }
	.half b { font-weight: 400; font-size: 6.6px; letter-spacing: 0; text-transform: uppercase; white-space: nowrap; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7); }
	.half.l { background: radial-gradient(circle at 80% 45%, color-mix(in srgb, var(--tc) 75%, #fff 10%), color-mix(in srgb, var(--tc) 50%, #000) 80%); }
	.half.l { padding: 0 6px 0 2px; }
	.half.r { background: radial-gradient(circle at 20% 45%, #e0533f, #8f1d12 80%); }
	.half.r { padding: 0 2px 0 6px; }
	.half:hover { filter: brightness(1.15); }
	.gx { position: absolute; right: 0; bottom: 0; z-index: 3; width: 28px; height: 28px; padding: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
		color: #ffd9d3; background: linear-gradient(180deg, #5a1712, #2a0806); border: 2px solid #0a1a2c; box-shadow: 0 0 0 1px rgba(229, 72, 77, 0.7), 0 3px 8px rgba(0, 0, 0, 0.6); }
	.gx svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; }
	.gx:hover { color: #fff; }
	/* a second choice (the host's Skip): a small bubble on the ring's lower right, like the × (lower left if both show) */
	.galt { position: absolute; right: 0; bottom: 0; z-index: 3; width: 28px; height: 28px; padding: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
		color: #ffd9d3; background: linear-gradient(180deg, #5a1712, #2a0806); border: 2px solid #0a1a2c; box-shadow: 0 0 0 1px rgba(229, 72, 77, 0.7), 0 3px 8px rgba(0, 0, 0, 0.6); }
	.galt.left { right: auto; left: 0; }
	.galt svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
	.galt svg .f { fill: currentColor; stroke: none; }
	.galt:hover { color: #fff; }
	@media (prefers-reduced-motion: reduce) { .gob.pulse::after { animation: none; opacity: 0.7; } .gob.lvl .gin::before, .lava i, .ascended .medal::after { animation: none; } }
</style>
