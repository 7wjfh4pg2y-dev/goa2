<script lang="ts">
	// The phone's bottom bar (2.0, 100 px). Row 1: your portrait in its eight level pips (the 8th purple), your
	// initiative this turn, the six stats, this round's wells I–IV, the discard pile, the deck and the ultimate.
	// Row 2: the tools (tokens · radius · ping · show / hide the hand · fan / side by side / banners) and the ONE
	// action pill — the desktop ring's `order` (Commit, End turn, Waiting · hero, Defended | Defeated …).
	import type { Snippet } from 'svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import StatBubbles from './StatBubbles.svelte';
	import RuneMark from './RuneMark.svelte';
	import type { RuneSlots } from './runes';
	import type { Order } from './HudDash.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { shelf } from './shelf';
	import { portraitCss } from '$lib/heroes';
	import { levelOf, statDeltas, isHidden, type PlayerCardState } from '$lib/cards/cardstate';

	/** null = the host without a hero of their own: just a line saying so, and the action pill */
	export let cs: PlayerCardState | null;
	export let color = '#888';
	export let team: 'orange' | 'blue' = 'orange';
	export let turnIdx = 0;
	export let revealed = false;
	export let ini: number | null = null;
	export let fxAt: (t: number) => boolean = () => false;
	export let deckCount = 0;
	export let levelUp = false;
	export let ultIdx = -1;
	export let ultReady = false;
	export let order: Order = { label: 'Commit', kind: 'off' };
	export let ringColor = '';
	export let autoHide = true;
	export let handStyle: 'fan' | 'spread' | 'banners' = 'fan';
	export let pingArmed = false;
	export let radius: Snippet | undefined = undefined;
	export let tokens: Snippet | undefined = undefined;
	export let power: Snippet<[number]> | undefined = undefined; // a 4★ hero's own button
	/** Snorri's runes under the slots (public), and whether the Dashboard effects run */
	export let runes: RuneSlots | null = null;
	export let runeFx = true;
	/** Takahide offers you a swap: your card in play glows gold */
	export let swapOffer = false;
	export let onMe: () => void = () => {};
	export let onSlot: (e: Event, t: number) => void = () => {};
	export let onDiscPick: (i: number) => void = () => {};
	export let onDeck: () => void = () => {};
	export let onUlt: () => void = () => {};
	export let onPing: () => void = () => {};
	export let onAutoHide: () => void = () => {};
	export let onStyle: () => void = () => {};
	/** a phone on its side: the dash becomes the right-hand column */
	export let land = false;
	// on its side the column can be shelved (dragged off to the right); the action pill stays
	export let shut = false;
	export let drag: number | null = null;
	export let onShelf: (open: boolean) => void = () => {};
	export let onDrag: (px: number | null) => void = () => {};
	$: slideCss = drag == null ? '' : `transform: translateX(${shut ? `calc(100% - ${drag}px)` : `${drag}px`}); transition: none`;

	const ROMAN = ['I', 'II', 'III', 'IV'];
	$: lv = cs ? levelOf(cs) : 0;
	const arc = (i: number, r = 21) => {
		const a0 = ((i * 45 + 5) * Math.PI) / 180, a1 = ((i * 45 + 40) * Math.PI) / 180;
		return `M ${(25 + r * Math.sin(a0)).toFixed(2)} ${(25 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(25 + r * Math.sin(a1)).toFixed(2)} ${(25 - r * Math.cos(a1)).toFixed(2)}`;
	};
	$: top = cs?.discard.length ? cs.discard[cs.discard.length - 1] : null;
	let discOpen = false;
	$: if (!cs?.discard.length) discOpen = false;
	// a ring that just changed ignores clicks for a moment: the second tap of a double-tap must not land on the NEXT
	// action (saying No to an effect used to end the turn that way)
	let ringKey = '', ringAt = 0;
	$: { const k = `${order.label}|${order.sub ?? ''}|${order.kind}`; if (k !== ringKey) { ringKey = k; ringAt = Date.now(); } }
	const fire = (fn?: () => void) => { if (Date.now() - ringAt < 450) return; fn?.(); };
</script>

{#snippet meB(c: PlayerCardState)}<button class="me" on:click={onMe} aria-label="Your board">
			<svg viewBox="0 0 50 50" aria-hidden="true">{#each Array(8) as _, i (i)}<path d={arc(i)} class:on={i < lv || (i === 7 && c.ultimate)} class:ult={i === 7} />{/each}</svg>
			<span class="face" style="--pc:{color}; {portraitCss(c.hero)}"></span>
			<span class="ini" class:off={ini == null}>{ini ?? '–'}</span>
		</button>{/snippet}
{#snippet wellsB(c: PlayerCardState)}{#each [0, 1, 2, 3] as t (t)}
				<span class="w" class:now={t === turnIdx} class:glow={fxAt(t)} class:swapme={swapOffer && t === turnIdx}><TurnSlot heroId={c.hero} played={c.turns[t]} pending={c.pending} isCurrent={t === turnIdx} {revealed} label={ROMAN[t]} veil={isHidden(c, c.turns[t])} peekable examinable on:click={(e) => onSlot(e, t)} />{#if runes}<span class="wr"><RuneMark rune={runes.at[t] ?? null} size={13} on={t === turnIdx && !!runes.at[t]} second={!!runes.second && runes.second === runes.at[t]} fx={runeFx} /></span>{/if}</span>
			{/each}{/snippet}
{#snippet pilesB(c: PlayerCardState)}<span class="w pile">
				<button class="wc" on:click={() => (c.discard.length === 1 ? onDiscPick(c.discard[0]) : (discOpen = !discOpen))} disabled={top == null} aria-label="Discard pile">
					{#if top != null}<Card heroId={c.hero} card={heroCards(c.hero)[top]} /><em>{c.discard.length}</em>
					{:else}<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13" /></svg>{/if}
				</button>
				{#if discOpen}<span class="dpop">{#each c.discard as i (i)}<button on:click={() => { discOpen = false; onDiscPick(i); }}><Card heroId={c.hero} card={heroCards(c.hero)[i]} /></button>{/each}</span>{/if}
			</span>
			<button class="w deck" class:lvup={levelUp} on:click={onDeck} aria-label="Your deck"><span class="wc"><CardBack hero={c.hero} /><em>{deckCount}</em></span></button>
			<button class="w ult" class:on={c.ultimate} class:ready={ultReady} on:click={onUlt} disabled={ultIdx < 0} aria-label="Ultimate">
				<span class="wc">{#if c.ultimate && ultIdx >= 0}<Card heroId={c.hero} card={heroCards(c.hero)[ultIdx]} />{:else}<b>IV</b>{/if}</span>
			</button>{/snippet}
{#snippet toolsB()}<span class="tools">
			{#if power}<span class="ts pw">{@render power(30)}</span>{/if}
			<span class="ts">{#if tokens}{@render tokens()}{/if}</span>
			<span class="ts">{#if radius}{@render radius()}{/if}</span>
			<button class="tl" class:on={pingArmed} on:click={onPing} aria-label="Ping"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.6" class="f" /><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" /></svg></button>
			<button class="tl" class:on={!autoHide} on:click={onAutoHide} aria-label="Show / hide the hand"><svg viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="8" height="11" rx="1.4" class="cf" transform="rotate(-9 8.5 8)" /><rect x="11.5" y="2.5" width="8" height="11" rx="1.4" class="cf" transform="rotate(9 15.5 8)" /><path d="M2.5 15.5h19" />{#if autoHide}<path d="M9 18.5l3 3 3-3" />{:else}<path d="M9 21.5l3-3 3 3" />{/if}</svg></button>
			<button class="tl" class:on={handStyle !== 'fan'} on:click={onStyle} aria-label="Hand: fan, side by side or banners">
				<svg viewBox="0 0 24 24">{#if handStyle === 'banners'}<path d="M3 4.5h18v4H3zM3 10h18v4H3zM3 15.5h18v4H3z" class="cf" />{:else if handStyle === 'spread'}<rect x="1.5" y="6" width="6.2" height="10" rx="1.2" class="cf" /><rect x="8.9" y="6" width="6.2" height="10" rx="1.2" class="cf" /><rect x="16.3" y="6" width="6.2" height="10" rx="1.2" class="cf" />{:else}<rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cf" transform="rotate(-22 12 21)" /><rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cf" transform="rotate(22 12 21)" /><rect x="8.5" y="4" width="7" height="11" rx="1.3" class="cf" />{/if}</svg>
			</button>
		</span>{/snippet}
{#snippet actB()}{#if order.split}
			<span class="act split"><button class="h l" style:background={order.split.left.bg} on:click={() => fire(order.split?.left.run)}>{order.split.left.label}</button><button class="h r" style:background={order.split.right.bg} on:click={() => fire(order.split?.right.run)}>{order.split.right.label}</button></span>
		{:else if order.alt}
			<!-- a second choice rides on the same pill: two thirds the main one (e.g. Waiting · hero), a third the other (Skip) -->
			<span class="act joined {order.kind}">
				<button class="m" disabled={!order.run} on:click={() => fire(order.run)}><b>{order.short ?? order.label}</b>{#if order.sub && !order.card}<small>{order.subShort ?? order.sub}</small>{/if}</button>
				<button class="o" on:click={() => fire(order.alt?.run)}>{order.alt.label}</button>
			</span>
		{:else}
			<button class="act {order.kind}" class:tinted={!!ringColor && (order.kind !== 'bad' || !!order.tint)} style={ringColor ? `--rc:${ringColor}` : ''} class:pulse={order.pulse} class:snug={!!order.cancel && ((order.short ?? order.label).length > 5 || (order.short ?? order.label).length + (order.card ? 0 : (order.subShort ?? order.sub)?.length ?? 0) > 9)} disabled={!order.run} on:click={() => fire(order.run)}>
				<b>{order.short ?? order.label}</b>{#if order.sub && !order.card}<small>{order.subShort ?? order.sub}</small>{/if}
			</button>
		{/if}
		{#if order.cancel}<button class="px" on:click={order.cancel} aria-label="Cancel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg></button>{/if}
	{/snippet}

{#if land}
<!-- a phone on its side: the dash is the right-hand column — you, your stats, this round's wells, the piles, the tools,
     and the action pill at the bottom under the right thumb -->
<div class="pdash land is-{team}" class:shut>
	<div class="lpanel" style={slideCss} use:shelf={{ side: 'right', open: !shut, set: onShelf, drag: onDrag }}>
	{#if !cs}
	<div class="lhost"><b>Host</b><small>watching · you move the game on</small></div>
	{:else}
	<div class="lid">{@render meB(cs)}<StatBubbles {cs} size={20} cols={3} /></div>
	<div class="lwells wells">{@render wellsB(cs)}</div>
	<div class="lpiles wells">{@render pilesB(cs)}</div>
	<div class="ltools">{@render toolsB()}</div>
	{/if}
	</div>
	<div class="lact">{@render actB()}</div>
</div>
{:else}
<div class="pdash is-{team}">
	{#if !cs}
	<div class="r1 host"><b>Host</b><small>watching · you move the game on</small></div>
	{:else}
	<div class="r1">
		{@render meB(cs)}
		<StatBubbles {cs} size={21} cols={3} />
		<span class="wells">
			{@render wellsB(cs)}
			<span class="sep"></span>
			{@render pilesB(cs)}
		</span>
	</div>
	{/if}
	<div class="r2">
		{#if cs}
		{@render toolsB()}
		{/if}
		{@render actB()}
	</div>
</div>
{/if}

<style>
	.pdash { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); position: absolute; left: 0; right: 0; bottom: 0; z-index: 11; height: calc(100px + env(safe-area-inset-bottom, 0px)); box-sizing: border-box;
		display: flex; flex-direction: column; gap: 4px; padding: 5px 6px calc(5px + env(safe-area-inset-bottom)); color: #f5f1e8; pointer-events: auto;
		background: linear-gradient(180deg, var(--tg), transparent 60%), linear-gradient(180deg, rgba(16, 44, 72, 0.98), rgba(6, 21, 38, 0.99)); border-top: 2px solid var(--tc); }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.16); } .is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.18); }
	button { font: inherit; color: inherit; padding: 0; cursor: pointer; }
	.r1.host { justify-content: center; gap: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
	.r1.host b { font-weight: 400; font-size: 16px; color: var(--brass-hi); }
	.r1.host small { font-size: 11px; color: #bccbd9; }
	.r1 { flex: 1; min-height: 0; display: flex; align-items: center; gap: 5px; }
	.me { position: relative; flex: none; width: 50px; height: 50px; border: 0; background: none; }
	.me svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.me path { fill: none; stroke: rgba(255, 255, 255, 0.16); stroke-width: 3.4; stroke-linecap: round; }
	.me path.on { stroke: var(--brass); }
	.me path.ult { stroke: rgba(138, 79, 209, 0.5); } .me path.ult.on { stroke: #a46be8; }
	.face { position: absolute; inset: 9px; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--tc), 0 0 0 3.5px var(--pc); }
	.ini { position: absolute; right: -4px; bottom: -2px; min-width: 18px; height: 16px; padding: 0 3px; border-radius: 8px; box-sizing: border-box; font-size: 10px; line-height: 16px; text-align: center; background: #0a1a2c; box-shadow: 0 0 0 1px var(--brass); }
	.ini.off { color: #8a9fb3; box-shadow: 0 0 0 1px var(--line); }
	.wells { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 3px; }
	.w { position: relative; flex: 1; min-width: 0; max-width: 30px; border: 0; background: none; }
	.w :global(.slot) { aspect-ratio: 1192 / 1664; }
	.w.now :global(.slot.blank) { border: 1.5px solid var(--brass); color: var(--brass-hi); }
	.w.now :global(.flip), .w.now :global(.static) { box-shadow: 0 0 0 1.5px var(--brass-hi); border-radius: 4px; }
	.w.swapme { box-shadow: 0 0 0 1.5px #e3b341, 0 0 10px 2px rgba(227, 179, 65, 0.6); border-radius: 4px; }
	.w.glow { box-shadow: 0 0 0 1.5px #fff, 0 0 8px 2px var(--tc); border-radius: 4px; }
	.sep { flex: none; align-self: stretch; width: 1px; margin: 6px 1px; background: var(--line); }
	.wr { position: absolute; left: 50%; bottom: 0; transform: translate(-50%, 50%); z-index: 1; display: grid; pointer-events: none; }
	.wc { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 1192 / 1664; border-radius: 4px; overflow: visible; border: 0; background: none; }
	.wc :global(.card), .wc :global(.cardface), .wc :global(.cardback) { width: 100%; border-radius: 4px; }
	.pile .wc { border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.22); box-sizing: border-box; }
	.pile svg { width: 14px; height: 14px; fill: none; stroke: rgba(255, 255, 255, 0.35); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
	.wc em { position: absolute; right: -4px; bottom: -4px; z-index: 1; min-width: 15px; height: 15px; border-radius: 8px; display: grid; place-items: center; font-style: normal; font-size: 9px; background: #0a1a2c; border: 1px solid var(--line); }
	.deck.lvup .wc { box-shadow: 0 0 0 1.5px var(--brass-hi), 0 0 10px 2px rgba(244, 223, 168, 0.55); }
	.ult .wc { border: 1px solid rgba(164, 107, 232, 0.35); background: rgba(90, 50, 150, 0.18); box-sizing: border-box; }
	.ult .wc b { font-weight: 400; font-size: 10px; color: rgba(196, 160, 255, 0.55); }
	.ult.ready .wc { border-color: #a46be8; box-shadow: 0 0 8px 2px rgba(164, 107, 232, 0.55); }
	.ult.on .wc { border: 0; box-shadow: 0 0 0 1.5px #a46be8; }
	.dpop { position: absolute; bottom: calc(100% + 10px); right: -40px; z-index: 5; display: flex; gap: 5px; padding: 6px; border-radius: 10px; background: rgba(8, 22, 38, 0.98); border: 1px solid var(--line); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.6); }
	.dpop button { width: 54px; border: 0; background: none; }
	.r2 { flex: none; height: 34px; display: flex; align-items: center; gap: 5px; }
	.tools { flex: none; display: flex; gap: 4px; }
	.tl, .ts :global(.radbtn), .ts :global(.tokbtn) { position: relative; width: 30px; height: 30px; min-width: 0; border-radius: 50%; display: grid; place-items: center; padding: 0; color: var(--brass-hi); background: rgba(0, 0, 0, 0.3); border: 1px solid var(--line); box-sizing: border-box; }
	.ts { position: relative; width: 30px; height: 30px; }
	.ts.pw { width: auto; min-width: 30px; margin: 0 6px 0 10px; } /* room for Ignatia's ring round her coin */
	.ts :global(.tokbtn) { border: 1.5px solid var(--brass); background: radial-gradient(circle at 50% 35%, #3a5f86, #13304f 70%); box-shadow: 0 0 8px 1px rgba(244, 223, 168, 0.3); }
	.ts :global(.radbtn svg), .ts :global(.tokbtn img) { width: 16px; height: 16px; }
	.ts :global(.radbtn b) { position: absolute; right: -4px; bottom: -4px; min-width: 13px; height: 13px; border-radius: 7px; display: grid; place-items: center; font-weight: 400; font-size: 8px; background: #0a1a2c; border: 1px solid var(--line); }
	.ts :global(.radbtn.on), .ts :global(.tokbtn.on), .tl.on { color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.ts :global(.radpop), .ts :global(.tokdrawer) { bottom: calc(100% + 12px); top: auto; left: 0; }
	.tl svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.tl svg .f { fill: currentColor; stroke: none; }
	.tl svg .cf { fill: rgba(9, 13, 22, 0.9); }
	.tl.on svg .cf { fill: rgba(255, 240, 200, 0.6); }
	/* the ONE action: brass when it's yours to press */
	.act { position: relative; flex: 1; min-width: 0; height: 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 12px; overflow: hidden;
		color: #8a9fb3; background: rgba(0, 0, 0, 0.35); border: 1px solid var(--line); }
	/* a longer word beside the ×: a little smaller so it fits whole */
	.act.snug { padding: 0 7px; }
	.act.snug b { font-size: 12.5px; letter-spacing: 0.02em; }
	.act b { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; }
	.act small { min-width: 0; font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85; }
	.act.lvl { color: #fff; border-color: rgba(255, 255, 255, 0.5); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7); background: linear-gradient(100deg, #c2412f, #8a3fb8 30%, #2f6fd0 55%, #2f9e72 80%, #b8902f); }
	.act.go, .act.team { color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); border-color: #fff1c8; }
	.act.team { color: #fff; background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 85%, #fff 10%), color-mix(in srgb, var(--tc) 70%, #000)); }
	.act.tinted { color: #fff; background: linear-gradient(180deg, color-mix(in srgb, var(--rc) 85%, #fff 12%), color-mix(in srgb, var(--rc) 70%, #000)); }
	.act.bad { color: #fff; background: linear-gradient(180deg, #e0533f, #8f1d12); border-color: rgba(255, 170, 160, 0.7); }
	/* Next turn / Minion battle / Next round: blue and orange drifting through the pill (a strip slid by transform) */
	.act.next { color: #fff; background: #13213f; border-color: rgba(255, 255, 255, 0.5); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); }
	.act.next::before { content: ''; position: absolute; top: 0; bottom: 0; left: -200%; width: 300%; background: linear-gradient(90deg, #2f7fe6, #ef7d22 25%, #2f7fe6 50%, #ef7d22 75%, #2f7fe6); animation: pnext 6s ease-in-out infinite alternate; }
	.act.next b, .act.next small { position: relative; }
	@keyframes pnext { to { transform: translateX(50%); } }
	@media (prefers-reduced-motion: reduce) { .act.next::before { animation: none; } }
	.act.bad.tinted { background: linear-gradient(180deg, color-mix(in srgb, var(--rc) 85%, #fff 12%), color-mix(in srgb, var(--rc) 70%, #000)); }
	.act.quiet { color: #e9dcc0; }
	.act:disabled { cursor: default; }
	.act.pulse::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: rgba(255, 255, 255, 0.35); opacity: 0; animation: gp 1.6s ease-in-out infinite; pointer-events: none; }
	@keyframes gp { 50% { opacity: 1; } }
	.act.split { padding: 0; gap: 0; border: 1px solid var(--line); }
	.h { flex: 1; height: 100%; border: 0; font-size: 13px; letter-spacing: 0.05em; text-transform: uppercase; color: #fff; }
	.h.l { background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 85%, #fff 10%), color-mix(in srgb, var(--tc) 65%, #000)); }
	.h.r { background: linear-gradient(180deg, #e0533f, #8f1d12); border-left: 1px solid #f4dfa8; }
	.act.joined { padding: 0; gap: 0; }
	.px { flex: none; width: 30px; height: 30px; margin-left: -4px; padding: 0; border-radius: 50%; display: grid; place-items: center; color: #ffd9d3; background: linear-gradient(180deg, #5a1712, #2a0806); border: 1px solid rgba(229, 72, 77, 0.7); }
	.px svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; }
	.joined .m { flex: 2; min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px; border: 0; color: inherit; background: none; overflow: hidden; }
	.joined .m b { flex: none; font-weight: 400; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; }
	.joined .m small { min-width: 0; font-size: 10px; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85; }
	.joined .o { flex: 1; min-width: 0; height: 100%; border: 0; border-left: 1px solid rgba(255, 170, 160, 0.6); font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; background: linear-gradient(180deg, #e0533f, #8f1d12); }
	.alt { flex: none; height: 30px; padding: 0 10px; border-radius: 999px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #fff; background: #b42318; border: 1px solid rgba(255, 170, 160, 0.6); }
	@media (prefers-reduced-motion: reduce) { .act.pulse::after { animation: none; } }
	/* ── a phone on its side: the right-hand column (width = GameView's --rw), under the top bar ── */
	.pdash.land { left: auto; right: 0; top: 54px; bottom: 0; width: var(--rwo, 200px); height: auto; padding: 0; border: 0; background: none; pointer-events: none; }
	.land .lpanel { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 6px; justify-content: space-between; pointer-events: auto; touch-action: pan-y;
		padding: 7px calc(7px + env(safe-area-inset-right, 0px)) calc(58px + env(safe-area-inset-bottom, 0px)) 7px; border-left: 2px solid var(--tc);
		background: linear-gradient(270deg, var(--tg), transparent 70%), linear-gradient(180deg, rgba(16, 44, 72, 0.98), rgba(6, 21, 38, 0.99)); transition: transform 0.25s ease; }
	.pdash.land.shut .lpanel { transform: translateX(100%); pointer-events: none; }
	.land .lact { position: absolute; left: 7px; right: calc(7px + env(safe-area-inset-right, 0px)); bottom: calc(7px + env(safe-area-inset-bottom, 0px)); pointer-events: auto; }
	/* shelved: the pill shrinks to a thumb-sized button in the corner */
	.pdash.land.shut .lact { left: auto; width: 150px; }
	.land .lid { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
	.land .lid .me { width: 54px; height: 54px; }
	.land .lwells { flex: none; justify-content: space-between; gap: 5px; }
	.land .lwells .w { max-width: none; flex: 1; }
	.land .lpiles { flex: none; justify-content: center; gap: 10px; }
	.land .lpiles .w { flex: none; width: 30px; }
	.land .ltools .tools { width: 100%; justify-content: space-between; flex-wrap: wrap; gap: 4px 2px; }
	.land .tl, .land .ts, .land .ts :global(.radbtn), .land .ts :global(.tokbtn) { width: 28px; height: 28px; }
	.land .ts.pw { width: auto; }
	/* the token drawer / radius pop open from the column's right edge, inside the screen */
	.land .ltools { position: relative; }
	.land .ts:not(.pw) { position: static; }
	.land .ts :global(.radpop), .land .ts :global(.tokdrawer) { left: auto; right: 0; bottom: calc(100% + 8px); max-width: calc(100vw - 16px); }
	.land .ltools .ts.pw { margin: 0 4px; }
	.land .lact { display: flex; align-items: center; gap: 5px; }
	.land .lact .act { height: 44px; }
	.land .lact .act b { font-size: 15px; }
	.land .lact .act small { display: none; }
	.land .lact .act:not(.joined):not(.split) { flex-direction: column; gap: 0; padding: 0 10px; }
	.land .lact .act:not(.joined):not(.split) small { display: block; max-width: 100%; }
	.land .lact .px { width: 34px; height: 34px; }
	.land .dpop { right: auto; left: auto; bottom: calc(100% + 8px); }
	.lhost { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 20px; text-transform: uppercase; letter-spacing: 0.08em; }
	.lhost b { font-weight: 400; font-size: 16px; color: var(--brass-hi); }
	.lhost small { font-size: 11px; color: #bccbd9; text-align: center; }
</style>
