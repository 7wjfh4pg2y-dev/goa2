<script lang="ts">
	// Desktop deck view, in the Tide language.
	// Left: the Ascension — three colour currents rising from Tier I (bottom) through
	// Tier II to Tier III; a brass conduit per colour fills as far as you have climbed,
	// with a valve per tier and the two options of every upgrade either side of it; the
	// three conduits meet in the ultimate's crown. A taken card is lit, its twin is the
	// item it became (upside down, like on the table), a replaced card is struck out.
	// Right: the inspector — level steps, item gauges, the hovered / selected card big
	// enough to read (your hero's card back when nothing is picked), the manual moves,
	// and the basics + the ultimate.
	// Level-ups follow the rules in cardstate (levelUp / swapPick): only in the phase
	// after the minion battle, forced while affordable, each confirmed first; this
	// round's pick can still be swapped for its twin until the round ends.
	// The design is DH px tall and as wide as the window's shape (clamped), then
	// scaled to fit, so every screen uses all of its space.
	// Performance: nothing here animates but `transform` / `opacity`, and only on a few
	// small elements (the rising beads, the halo of a pick you can make).
	// (The earlier all-cards banner list lives on in archive/DeckBannerList.svelte.)
	import Card from '$lib/cards/Card.svelte';
	import LevelConfirm from '$lib/LevelConfirm.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroSplash, heroLogo, HERO_BY_ID } from '$lib/heroes';
	import {
		levelOf, levelCost, statDeltas, ultimateIndex, tierIn, canPick, canAfford, mustLevel, swapSource, twinOf, allowedMoves,
		type PlayerCardState, type CardZone, type StatKey
	} from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let teamStyle = '';
	/** the end-of-round level-up phase (after the minion battle) */
	export let levelPhase = false;
	export let onClose: () => void;
	export let onMove: (idx: number, to: CardZone) => void;
	export let onTake: (idx: number) => void;
	export let onSwap: (idx: number) => void;
	export let onPreview: (idx: number) => void;

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const statArt = import.meta.glob('./images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const sa = (n: string) => statArt[`./images/stats/${n}.png`] ?? '';

	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Area' };

	$: H = cs.hero;
	$: cards = heroCards(H);
	$: hero = HERO_BY_ID[H];
	$: find = (color: string, level?: number) =>
		cards.map((c, i) => ({ c, i })).filter((x) => x.c.color === color && !x.c.handicapped && (level == null || (x.c.level ?? 1) === level)).map((x) => x.i);
	$: tr = Object.fromEntries(COLS.map((c) => [c, { I: find(c, 1)[0], II: find(c, 2), III: find(c, 3) }])) as Record<string, { I: number; II: number[]; III: number[] }>;
	$: ult = ultimateIndex(H);
	$: basics = [find('GOLD')[0], find('SILVER')[0]].filter((i) => i != null && i >= 0);
	$: LV = levelOf(cs);
	$: afford = canAfford(cs);
	$: forced = levelPhase && mustLevel(cs);

	// held this round = in hand, played, discarded or face down
	$: heldSet = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null), ...(cs.pending != null && cs.pending >= 0 ? [cs.pending] : [])]);
	$: zoneOf = (i: number): 'held' | 'upgrade' | 'removed' | null =>
		heldSet.has(i) ? 'held' : cs.upgrade.includes(i) ? 'upgrade' : cs.removed.includes(i) ? 'removed' : null;
	$: state = (i: number) => {
		const z = zoneOf(i);
		if (z === 'held') return 'cur';
		if (z === 'removed') return 'past';
		if (z === 'upgrade') return 'item';
		return canPick(cs, i) ? 'next' : 'far';
	};
	$: tiers = COLS.map((c) => tierIn(cs, c));
	$: t3done = tiers.filter((t) => t >= 3).length;
	$: canTakeNow = (i: number) => levelPhase && afford && canPick(cs, i);
	$: canSwapNow = (i: number) => levelPhase && swapSource(cs, i) != null;

	// items only: the +N each stat has gained
	const STATS: Array<{ k: string; key: StatKey; n: string; a: string }> = [
		{ k: 'ATTACK', key: 'atk', n: 'Attack', a: 'attack' },
		{ k: 'DEFENSE', key: 'def', n: 'Defense', a: 'defense' },
		{ k: 'INITIATIVE', key: 'init', n: 'Initiative', a: 'initiative' },
		{ k: 'MOVEMENT', key: 'move', n: 'Movement', a: 'movement' },
		{ k: 'RANGE', key: 'range', n: 'Range', a: 'range' },
		{ k: 'AREA', key: 'radius', n: 'Area', a: 'area' }
	];
	$: deltas = statDeltas(cs);
	$: possible = (k: string) => cards.filter((c) => !c.handicapped && c.item === k).length;

	$: twin = (i: number) => twinOf(H, i);
	$: itemOf = (i: number) => cards[i]?.item ?? '';
	$: isTier = (i: number) => COLS.includes(cards[i]?.color as never);

	// hover (reading) beats selection (moving); nothing → your hero's card back
	let sel: number | null = null;
	let hov: number | null = null;
	$: focus = hov ?? sel;
	function over(i: number) { hov = i; }
	function out() { hov = null; }
	function act(fn: () => void) { fn(); sel = null; }
	function pick(i: number) { sel = sel === i ? null : i; }
	// a click on anything that isn't a card or a button puts the selection down
	function bgClick(e: MouseEvent) { if (!(e.target as HTMLElement | null)?.closest?.('button')) { sel = null; hov = null; } }

	// level-up / swap confirmation (the confirm can flip `idx` to the twin)
	let confirm: { kind: 'take' | 'swap'; idx: number } | null = null;
	function ask(kind: 'take' | 'swap', idx: number) { confirm = { kind, idx }; sel = null; }
	function doConfirm() {
		if (!confirm) return;
		// the ultimate unlocks through the (paid) manual move, so it works outside the level-up phase too
		if (confirm.idx === ult) onMove(ult, 'hand');
		else (confirm.kind === 'take' ? onTake : onSwap)(confirm.idx);
		confirm = null; hov = null;
	}
	// level 7 with the coins for 8 (and all three Tier III): the ultimate can be unlocked now
	$: ultReady = ult >= 0 && allowedMoves(cs, ult).includes('hand');

	// the only thing a card ever needs said about it: why it can't be taken yet
	$: need = levelCost(LV);
	$: allII = tiers.every((t) => t >= 2);
	$: why = (i: number): { t: string; coin?: number } | null => {
		if (i === ult) {
			if (cs.ultimate || ultReady) return null;
			return t3done < 3 ? { t: 'All Tier III first' } : { t: 'Costs', coin: need };
		}
		const c = cards[i];
		if (!c || !isTier(i)) return null;
		const t = c.level ?? 1, tw = twin(i);
		if (t < 2 || zoneOf(i) !== null || (tw >= 0 && zoneOf(tw) !== null)) return null;
		if (t === 3 && !allII) return { t: 'All Tier II first' };
		if (tierIn(cs, c.color) !== t - 1) return { t: 'Tier II first' };
		return cs.coins < need ? { t: 'Costs', coin: need } : null;
	};
	$: fWhy = focus != null ? why(focus) : null;

	// manual moves allowed for this card (cardstate.allowedMoves), in this order
	const MOVE_BTNS: Array<[CardZone, string, string, string]> = [['hand', 'Hand', 'H', 'hand'], ['upgrade', 'Upgrade', 'U', 'upg'], ['deck', 'Deck', 'D', 'deck'], ['removed', 'Remove', 'R', 'rem']];
	$: moves = (i: number | null): Array<[CardZone, string, string, string]> => {
		if (i == null) return [];
		const ok = allowedMoves(cs, i);
		// the ultimate unlocks from its own button (with the confirm); only the undo lives here
		if (i === ult) return ok.includes('deck') ? [['deck', '↺ Undo', 'D', 'deck']] : [];
		return MOVE_BTNS.filter(([to]) => ok.includes(to));
	};
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
		if (e.key === 'Escape') { if (confirm) confirm = null; else if (sel != null) sel = null; else onClose(); e.preventDefault(); return; }
		if (confirm) { if (e.key === 'Enter') { doConfirm(); e.preventDefault(); } return; }
		if (sel == null) return;
		const k = e.key.toLowerCase();
		if (k === ' ') { onPreview(sel); e.preventDefault(); return; }
		const m = moves(sel).find(([, , key]) => key.toLowerCase() === k);
		if (m) act(() => onMove(sel!, m[0]));
	}

	// design: DH tall, as wide as the window's shape allows, scaled to fit
	const DH = 900, PAD = 12, IGAP = 14;
	let vw = 1440, vh = 900;
	$: DW = Math.round(Math.min(1800, Math.max(1300, (DH * (vw - 24)) / Math.max(1, vh - 24))));
	$: scale = Math.min((vw - 24) / DW, (vh - 24) / DH, 2.2);
	$: INS = Math.round(Math.min(380, Math.max(320, DW * 0.23)));

	// the Ascension's geometry (design px, inside the tree box): the crown on top, then
	// Tier III, II and I; one conduit per colour up the middle of its column.
	const R = 1192 / 1664, TH = DH - 2 * PAD;
	const CROWN = 108, CY = 54, CR = 46; // crown zone height, crown centre, crown radius
	const FOOT = 34, GY = 10, MID = 34, SP = 28;
	$: TW = DW - 2 * PAD - INS - IGAP;
	$: COLW = TW / 3;
	$: CW = Math.floor(Math.min((COLW - MID - 2 * SP) / 2, (R * (TH - CROWN - 2 * FOOT - 2 * GY)) / 3));
	$: CH = Math.round(CW / R);
	$: SLACK = Math.max(0, TH - CROWN - 3 * CH - 2 * FOOT - 2 * GY) / 3;
	$: Y3 = CROWN + SLACK;
	$: Y2 = Y3 + CH + FOOT + GY + SLACK;
	$: Y1 = Y2 + CH + FOOT + GY + SLACK;
	$: V2 = Y2 + CH / 2;
	$: V3 = Y3 + CH / 2;
	$: rowY = [Y1, Y2, Y3];
	$: cx = (k: number) => Math.round(COLW * (k + 0.5));
	$: xOf = (k: number, r: number, a: number) => (r === 0 ? cx(k) - CW / 2 : a ? cx(k) + MID / 2 : cx(k) - MID / 2 - CW);
	// the conduit of column k: up from Tier I and into the crown (the outer two bend in from the sides)
	$: pipe = (k: number) => {
		const x = cx(k), mid = TW / 2, b = 16;
		if (k === 1) return `M${x} ${Y1 + 6} V${CY + CR - 2}`;
		const s = k === 0 ? 1 : -1;
		return `M${x} ${Y1 + 6} V${CY + b} Q${x} ${CY} ${x + s * b} ${CY} H${mid - s * (CR - 2)}`;
	};
	// …and how much of it your colour has filled
	$: lit = (k: number) => (cs.ultimate ? pipe(k) : `M${cx(k)} ${Y1 + 6} V${tiers[k] >= 3 ? V3 : tiers[k] === 2 ? V2 : Y1 - 14}`);
	$: litTop = (k: number) => (cs.ultimate ? CY + CR : tiers[k] >= 3 ? V3 : tiers[k] === 2 ? V2 : null);
	// the crown's ring: one arc per colour, lit once that colour is on Tier III
	const arc = (deg: number) => {
		const p = (a: number) => `${(42 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(42 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
		return `M${p(deg - 52)} A42 42 0 0 1 ${p(deg + 52)}`;
	};
	const ARCS = [arc(210), arc(90), arc(330)];
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet itemIcon(i: number)}<img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt={ITEM_NAME[itemOf(i)] ?? ''} />{/snippet}

{#snippet node(i: number, k: number, r: number, a: number)}
	{@const s = state(i)}
	{@const tw = twin(i)}
	{@const src = swapSource(cs, i)}
	{@const can = s === 'next' && canTakeNow(i)}
	<div class="nd {s}" class:can class:sel={i === sel} class:foc={i === hov} style="--c:{COL[cards[i]?.color]}; left:{xOf(k, r, a)}px; top:{rowY[r]}px; width:{CW}px">
		<button class="nd-card" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i]?.name}>
			<Card heroId={H} card={cards[i]} />
			{#if s === 'item' && itemOf(i)}<span class="ib">{@render itemIcon(i)}<b>+1</b></span>{/if}
		</button>
		{#if r > 0}
			<div class="nd-foot">
				{#if s === 'item' && canSwapNow(i) && src != null}
					<!-- this round's other path: swap it in, the pick becomes the item -->
					<button class="take swap" on:click={() => ask('swap', i)} on:pointerenter={() => over(i)} on:pointerleave={out}>Swap</button>
				{:else if can}
					<!-- one button: the card AND its twin's item -->
					<button class="take" on:click={() => ask('take', i)} on:pointerenter={() => over(i)} on:pointerleave={out}>Take{#if tw >= 0 && itemOf(tw)}<span class="tsep"></span>+1 {@render itemIcon(tw)}{/if}</button>
				{:else if (s === 'next' || s === 'far') && tw >= 0 && itemOf(tw)}
					<span class="ichip" class:dim={s === 'far'} title="+1 {ITEM_NAME[itemOf(tw)]}">+1 {@render itemIcon(tw)}</span>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv tide" style="{teamStyle}; width:{DW}px; height:{DH}px; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation={bgClick} on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<!-- the Ascension -->
		<div class="tree" style="width:{TW}px; height:{TH}px">
			<div class="rays">
				{#each COLS as c, k}<span class="ray t{tiers[k]}" style="--c:{COL[c]}; left:{cx(k)}px; width:{COLW * 1.5}px"></span>{/each}
			</div>
			<svg class="pipes" width={TW} height={TH} aria-hidden="true">
				{#each COLS as c, k}
					{@const p = pipe(k)}
					<path d={p} class="p0" /><path d={p} class="p1" /><path d={p} class="p2" />
					<path d={lit(k)} class="lg" stroke={COL[c]} /><path d={lit(k)} class="lc" stroke={COL[c]} /><path d={lit(k)} class="lh" />
				{/each}
			</svg>
			{#each COLS as c, k}
				{@const t = tr[c]}
				{@const top = litTop(k)}
				{#if top != null}<span class="bead" style="--c:{COL[c]}; left:{cx(k)}px; top:{Y1}px; --rise:{Y1 - top}px; animation-delay:{k * -1.1}s"></span>{/if}
				{#each [t.II, t.III] as pair, n}
					{#if pair.length && canTakeNow(pair[0])}<span class="halo" style="left:{cx(k) - MID / 2 - CW - 14}px; top:{rowY[n + 1] - 14}px; width:{2 * CW + MID + 28}px; height:{CH + 28}px"></span>{/if}
					<span class="valve" class:lit={tiers[k] >= n + 2} class:nx={pair.length > 0 && canPick(cs, pair[0])} style="--c:{COL[c]}; left:{cx(k)}px; top:{n ? V3 : V2}px"><img src={ic(n ? 'level_iii' : 'level_ii')} alt="" /></span>
				{/each}
				{#if t.I != null}{@render node(t.I, k, 0, 0)}{/if}
				{#each t.II as i, a (i)}{@render node(i, k, 1, a)}{/each}
				{#each t.III as i, a (i)}{@render node(i, k, 2, a)}{/each}
			{/each}
			<!-- the crown: the ultimate, fed by the three currents -->
			{#if ult >= 0}
				<button class="crn" class:lit={cs.ultimate} class:rdy={ultReady} class:sel={sel === ult} style="left:{TW / 2}px; top:{CY}px; width:{2 * CR}px; height:{2 * CR}px"
					on:click={() => pick(ult)} on:dblclick={() => onPreview(ult)} on:pointerenter={() => over(ult)} on:pointerleave={out} title={cards[ult]?.name}>
					{#if ultReady}<span class="crn-halo"></span>{/if}
					<svg viewBox="-50 -50 100 100" aria-hidden="true">
						{#each COLS as c, k}<path d={ARCS[k]} class:lit={tiers[k] >= 3} stroke={tiers[k] >= 3 ? COL[c] : 'rgba(255,255,255,.16)'} />{/each}
					</svg>
					<img src={ic('level_iv')} alt="" />
				</button>
			{/if}
		</div>

		<!-- inspector -->
		<aside class="ins" style="width:{INS}px">
			<div class="ih">
				<div class="por"><img src={heroSplash(H)} alt="" /></div>
				<b class="hn">{hero?.name ?? H}</b>
				<span class="money" title="Coins">{cs.coins}</span>
				<button class="ix" on:click={onClose} aria-label="Close deck"><Icon name="x" /></button>
			</div>
			<!-- level: eight steps, the eighth is the ultimate; the next step carries its price -->
			<div class="lvb" title="Level {LV}" aria-label="Level {LV}">
				{#each Array(8) as _, k (k)}
					<i class:got={k < LV} class:ul={k === 7} class:nx={k === LV} class:can={k === LV && cs.coins >= need}>
						{#if k === LV}{#if forced || ultReady}<span class="lv-glow"></span>{/if}<b>{need}</b>{/if}
					</i>
				{/each}
			</div>
			<div class="gau" aria-label="Items">
				{#each STATS as s}
					{@const o = deltas[s.key] ?? 0}
					{@const p = possible(s.k)}
					<div class="ga" class:up={o > 0} class:none={p === 0 && o === 0} title="{s.n}: {o} of {p}">
						<span class="gw"><img src={sa(s.a)} alt={s.n} /></span>
						{#if o > 0}<span class="gv">+{o}</span>{/if}
					</div>
				{/each}
			</div>

			<div class="icard">
				{#if focus != null}
					<button class="icw" style="--c:{COL[cards[focus]?.color] ?? '#888'}" on:click={() => focus != null && onPreview(focus)} title="Full size"><Card heroId={H} card={cards[focus]} /></button>
				{:else}
					<div class="icw back"><span class="bk top"></span><span class="emblem"><img src={heroLogo(H)} alt="" /></span><span class="bk bot"></span></div>
				{/if}
			</div>

			<div class="iact">
				{#if sel != null && moves(sel).length && (hov == null || hov === sel)}
					{#each moves(sel) as [to, lbl, key, cls] (to)}
						<button class="a {cls}" on:click={() => act(() => onMove(sel!, to))}>{lbl} <kbd>{key}</kbd></button>
					{/each}
				{:else if fWhy}
					<p class="why">{fWhy.t}{#if fWhy.coin != null}<span class="money sm">{fWhy.coin}</span>{/if}</p>
				{/if}
			</div>

			<div class="ibot">
				{#each basics as i (i)}
					<button class="th" class:sel={i === sel} style="--c:{COL[cards[i].color]}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i].name}><Card heroId={H} card={cards[i]} /></button>
				{/each}
				{#if ult >= 0}
					<div class="ultp" class:lit={cs.ultimate} class:rdy={ultReady}>
						{#if ultReady}<span class="ult-halo"></span>{/if}
						<button class="th u" class:sel={ult === sel} style="--c:{COL.PURPLE}" on:click={() => pick(ult)} on:dblclick={() => onPreview(ult)} on:pointerenter={() => over(ult)} on:pointerleave={out} title={cards[ult]?.name}><Card heroId={H} card={cards[ult]} /></button>
						{#if ultReady}<button class="ubtn" on:click={() => ask('take', ult)}>Unlock<span class="money sm">{need}</span></button>{/if}
					</div>
				{/if}
			</div>
		</aside>

		{#if confirm}
			<LevelConfirm {cs} bind:idx={confirm.idx} kind={confirm.kind} {teamStyle} onConfirm={doConfirm} onCancel={() => (confirm = null)} />
		{/if}
	</div>
</div>

<style>
	.dv-scrim { position: fixed; inset: 0; z-index: 20; background: rgba(2, 7, 14, .82); }
	.dv { position: absolute; left: 50%; top: 50%; box-sizing: border-box; display: flex; gap: 14px; padding: 12px; transform-origin: 50% 50%;
		border-radius: 18px; font-size: 15px; line-height: 1.2; color: var(--ink);
		background: radial-gradient(90% 70% at 38% 0%, #143a5c 0%, #0a2238 46%, #04101e 100%);
		border: 1px solid var(--brass-line); box-shadow: 0 30px 80px rgba(0, 0, 0, .7), inset 0 1px 0 rgba(255, 255, 255, .07);
		animation: dvin .18s ease-out; }
	@keyframes dvin { from { opacity: 0; } }

	/* ───────── the Ascension ───────── */
	.tree { position: relative; flex: none; }
	/* a shaft of each colour's light, taller the higher that colour has climbed */
	.rays { position: absolute; inset: 0; overflow: hidden; pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent); mask-image: linear-gradient(90deg, transparent, #000 9%, #000 91%, transparent); }
	.ray { --h: 44%; position: absolute; bottom: 0; height: 100%; transform: translateX(-50%); pointer-events: none; opacity: .5;
		background: radial-gradient(50% var(--h) at 50% 100%, color-mix(in srgb, var(--c) 72%, transparent), color-mix(in srgb, var(--c) 30%, transparent) 45%, transparent 100%); }
	.ray.t2 { --h: 70%; opacity: .62; }
	.ray.t3 { --h: 100%; opacity: .75; }
	.pipes { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.pipes path { fill: none; }
	.p0 { stroke: #030b15; stroke-width: 15; stroke-linecap: round; }
	.p1 { stroke: #c9a255; stroke-width: 11; }
	.p2 { stroke: #071726; stroke-width: 7; }
	.lg { stroke-width: 15; stroke-linecap: round; opacity: .28; }
	.lc { stroke-width: 6; stroke-linecap: round; }
	.lh { stroke: #fff; stroke-opacity: .4; stroke-width: 1.2; stroke-linecap: round; }
	/* a bead of light rising through the filled part of a conduit */
	.bead { position: absolute; width: 7px; height: 26px; margin: -13px 0 0 -3.5px; border-radius: 4px; pointer-events: none; opacity: 0;
		background: linear-gradient(180deg, #fff, color-mix(in srgb, var(--c) 40%, #fff) 40%, transparent); animation: rise 3.4s linear infinite; }
	@keyframes rise { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: .9; } 80% { opacity: .9; } 100% { transform: translateY(calc(-1 * var(--rise))); opacity: 0; } }
	/* the tier valves */
	.valve { position: absolute; z-index: 4; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
		background: radial-gradient(circle at 50% 30%, #12304d, #040e1a 75%); border: 2px solid #8f7238; box-shadow: 0 0 0 2px #030b15; }
	.valve img { height: 15px; width: auto; opacity: .4; }
	.valve.nx { border-color: var(--brass-hi); }
	.valve.nx img { opacity: .85; }
	.valve.lit { border-color: var(--brass-hi); background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--c) 78%, #fff), color-mix(in srgb, var(--c) 62%, #000) 75%); box-shadow: 0 0 0 2px #030b15, 0 0 18px var(--c); }
	.valve.lit img { opacity: 1; }
	/* the pair you can take now breathes */
	.halo { position: absolute; border-radius: 22px; pointer-events: none; background: radial-gradient(closest-side, rgba(244, 223, 168, .5), rgba(244, 223, 168, .16) 70%, transparent); animation: breathe 1.8s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

	.nd { position: absolute; z-index: 2; transition: transform .14s ease-out; }
	.nd:hover, .nd.foc { transform: translateY(-3px); z-index: 3; }
	.nd-card { position: relative; display: block; width: 100%; padding: 0; border: none; background: none; border-radius: 7px; }
	.nd-card :global(.cardface) { display: block; width: 100%; border-radius: 7px; box-shadow: 0 0 0 1px #030b15, 0 8px 18px rgba(0, 0, 0, .55); }
	.nd-foot { height: 34px; display: flex; align-items: center; justify-content: center; }
	/* in hand: lit */
	.nd.cur :global(.cardface) { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 24px color-mix(in srgb, var(--c) 80%, transparent), 0 8px 18px rgba(0, 0, 0, .5); }
	/* an item is turned upside down, like on the table; its mark says what it gives */
	.nd.item :global(.cardface) { transform: rotate(180deg); filter: brightness(.5) saturate(.6); }
	.ib { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
		background: radial-gradient(circle at 50% 30%, #1c4469, #06182a 75%); border: 2px solid var(--brass-hi); box-shadow: 0 0 0 2px #030b15, 0 0 16px rgba(244, 223, 168, .45); }
	.ib img { width: 38px; height: 30px; object-fit: contain; }
	.ib b { position: absolute; left: 50%; bottom: -11px; transform: translateX(-50%); height: 19px; padding: 0 8px; border-radius: 10px; font-weight: normal; font-size: 14px; line-height: 19px;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad, var(--brass)); box-shadow: 0 0 0 1px #030b15; }
	/* replaced: greyed and struck */
	.nd.past :global(.cardface) { filter: grayscale(1) brightness(.36); }
	.nd.past .nd-card::after { content: ''; position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; background: rgba(229, 72, 77, .8); transform: rotate(-54.4deg); pointer-events: none; }
	.nd.far :global(.cardface) { filter: brightness(.5) saturate(.7); }
	.nd.next :global(.cardface) { box-shadow: 0 0 0 1.5px var(--brass-line), 0 8px 18px rgba(0, 0, 0, .55); }
	.nd.can :global(.cardface) { box-shadow: 0 0 0 2px #fff3cf, 0 0 20px rgba(244, 223, 168, .5), 0 8px 18px rgba(0, 0, 0, .55); }
	.nd.foc :global(.cardface) { filter: none; }
	.nd.sel :global(.cardface) { filter: none; }
	.nd.sel .nd-card::before { content: ''; position: absolute; inset: -7px; border-radius: 12px; border: 2px solid #fff3cf; box-shadow: 0 0 18px rgba(244, 223, 168, .7); pointer-events: none; }
	/* what a branch also gives you: its twin's item */
	.ichip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 14px; line-height: 1; white-space: nowrap;
		color: var(--brass-hi); background: rgba(3, 11, 21, .82); border: 1px solid var(--brass-line); }
	.ichip img, .take img { width: 21px; height: 16px; object-fit: contain; }
	.ichip.dim { opacity: .55; }
	.take { height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 14px; border-radius: 9px; font-size: 16px; line-height: 1; white-space: nowrap;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border: 1px solid; border-color: #f9ebc6 #c9a355 #8a6a2c;
		box-shadow: 0 4px 12px rgba(0, 0, 0, .45), 0 0 0 1px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .5); transition: transform .12s; }
	.take img { filter: brightness(.22); }
	.take:hover { transform: translateY(-1px); }
	.tsep { width: 1px; height: 15px; margin: 0 4px; background: rgba(27, 18, 4, .4); }
	.take.swap { color: var(--ink); background: linear-gradient(180deg, rgba(26, 68, 104, .95), rgba(13, 40, 66, .95)); border-color: var(--brass-line); box-shadow: var(--sh-1), inset 0 1px 0 rgba(255, 255, 255, .08); }

	/* the crown */
	.crn { position: absolute; transform: translate(-50%, -50%); padding: 0; border: none; border-radius: 50%; z-index: 2;
		background: radial-gradient(circle at 50% 32%, #3b2463, #130a26 72%); box-shadow: 0 0 0 2px #8f7238, 0 0 0 4px #030b15, 0 8px 20px rgba(0, 0, 0, .5); transition: transform .14s ease-out; }
	.crn:hover { transform: translate(-50%, -50%) scale(1.05); }
	.crn svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.crn path { fill: none; stroke-width: 7; stroke-linecap: round; }
	.crn img { position: absolute; left: 50%; top: 50%; height: 26px; width: auto; transform: translate(-50%, -50%); opacity: .5; }
	.crn.rdy img, .crn.lit img { opacity: 1; }
	.crn.rdy, .crn.lit { background: radial-gradient(circle at 50% 32%, #a56ee6, #3a1c6b 72%); box-shadow: 0 0 0 2px var(--brass-hi), 0 0 0 4px #030b15, 0 0 30px rgba(165, 110, 230, .75); }
	.crn.sel { box-shadow: 0 0 0 2px #fff3cf, 0 0 0 4px #030b15, 0 0 22px rgba(244, 223, 168, .7); }
	.crn-halo, .ult-halo { position: absolute; inset: -16px; border-radius: 50%; pointer-events: none; background: radial-gradient(closest-side, rgba(190, 140, 255, .75), transparent); animation: breathe 1.6s ease-in-out infinite; }
	.ult-halo { inset: -8px; border-radius: 14px; }

	/* ───────── inspector ───────── */
	.ins { flex: none; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; padding: 12px 13px;
		border-radius: 14px; background: linear-gradient(180deg, rgba(16, 46, 76, .72), rgba(4, 16, 30, .78)); border: 1px solid var(--brass-line); }
	.ih { flex: none; display: flex; align-items: center; gap: 10px; }
	.por { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 2px var(--tc, var(--brass)), 0 0 0 4px #030b15; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.hn { flex: 1; min-width: 0; font-weight: normal; font-size: 26px; line-height: 1; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	/* the same gold coin as the rest of the game: the number sits on the coin */
	.money { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; box-sizing: border-box; padding: 0 7px; border-radius: 999px;
		background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: 19px; line-height: 1; font-variant-numeric: tabular-nums;
		border: 1px solid rgba(0, 0, 0, .3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45); }
	.money.sm { min-width: 22px; height: 22px; padding: 0 5px; font-size: 14px; }
	.ix { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .04); color: var(--ink-2); }
	.ix:hover { border-color: rgba(255, 255, 255, .45); color: var(--ink); }
	/* level steps */
	.lvb { flex: none; display: flex; gap: 4px; height: 22px; align-items: center; }
	.lvb i { position: relative; flex: 1; height: 10px; border-radius: 3px; background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
	.lvb i.ul { background: rgba(165, 110, 230, .22); box-shadow: inset 0 0 0 1.5px #a56ee6; }
	.lvb i.got { background: linear-gradient(180deg, #fff3cf, var(--brass)); box-shadow: 0 0 6px rgba(244, 223, 168, .5); }
	.lvb i.got.ul { background: linear-gradient(180deg, #e3c8ff, #9a5ce6); box-shadow: 0 0 8px rgba(165, 110, 230, .8); }
	.lvb i.nx.can { background: rgba(216, 179, 106, .2); box-shadow: inset 0 0 0 1.5px var(--brass); }
	.lvb i.nx.can.ul { background: rgba(165, 110, 230, .35); box-shadow: inset 0 0 0 1.5px #d4a8ff; }
	/* the price of the next step rides on it */
	.lvb b { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 4px; border-radius: 10px; font-weight: normal; font-size: 13px; line-height: 18px; text-align: center;
		color: var(--ink-3); background: #06182a; border: 1px solid var(--hair); }
	.lvb .can b { color: #3a2a10; background: linear-gradient(#f2d072, #c99a3e); border-color: rgba(0, 0, 0, .3); }
	.lv-glow { position: absolute; inset: -9px -5px; border-radius: 12px; background: radial-gradient(closest-side, rgba(244, 223, 168, .9), transparent); animation: breathe 1.6s ease-in-out infinite; }
	.ul .lv-glow { background: radial-gradient(closest-side, rgba(190, 140, 255, .95), transparent); }
	/* item gauges */
	.gau { flex: none; display: flex; justify-content: space-between; height: 54px; }
	.ga { position: relative; width: 42px; }
	.gw { display: grid; place-items: center; width: 42px; height: 42px; box-sizing: border-box; border-radius: 50%; background: radial-gradient(circle at 50% 30%, #12304d, #040e1a 75%); border: 1px solid rgba(255, 255, 255, .14); box-shadow: inset 0 2px 5px rgba(0, 0, 0, .6); }
	.gw img { width: 26px; height: 26px; object-fit: contain; opacity: .5; }
	.ga.none { opacity: .4; }
	.ga.up .gw { border-color: var(--brass); box-shadow: inset 0 2px 5px rgba(0, 0, 0, .6), 0 0 10px rgba(216, 179, 106, .35); }
	.ga.up img { opacity: 1; }
	.gv { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); min-width: 26px; height: 18px; box-sizing: border-box; padding: 0 5px; border-radius: 9px; font-size: 14px; line-height: 17px; text-align: center;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad, var(--brass)); border: 1px solid #030b15; }
	/* the card in view */
	.icard { flex: 1; min-height: 0; display: flex; justify-content: center; align-items: center; }
	.icw { height: 100%; max-width: 100%; max-height: 100%; aspect-ratio: 1192 / 1664; padding: 0; border: none; background: none; cursor: zoom-in; align-self: center; }
	.icw :global(.cardface) { display: block; width: 100%; border-radius: 9px; box-shadow: 0 0 0 1px #030b15, 0 0 26px color-mix(in srgb, var(--c) 40%, transparent), 0 10px 26px rgba(0, 0, 0, .6); }
	.icw.back { display: flex; flex-direction: column; cursor: default; overflow: hidden; border-radius: 9px; background: radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); box-shadow: inset 0 0 0 1px rgba(120, 95, 55, .4), 0 10px 26px rgba(0, 0, 0, .6); }
	.back .bk { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.back .bk::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.back .bk.top::after { bottom: 0; } .back .bk.bot::after { top: 0; }
	.back .emblem { flex: 1; display: grid; place-items: center; }
	.back .emblem img { width: 72%; }
	/* one line: the selected card's moves, or why the card in view can't be taken */
	.iact { flex: none; height: 34px; display: flex; align-items: center; justify-content: center; gap: 6px; }
	.a { flex: 1; height: 34px; padding: 0 6px; border-radius: 9px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .03); color: var(--ink-2); font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; transition: transform .12s; }
	.a:hover { transform: translateY(-1px); }
	.a.hand { color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border-color: #f9ebc6 #c9a355 #8a6a2c; }
	.a.upg { color: var(--ink); background: linear-gradient(180deg, rgba(26, 68, 104, .9), rgba(13, 40, 66, .9)); border-color: var(--brass-line); }
	.a.rem { color: var(--danger-hi); background: rgba(229, 72, 77, .1); border-color: rgba(229, 72, 77, .6); }
	kbd { font-family: inherit; font-size: 12px; line-height: 1; padding: 2px 4px; border-radius: 4px; background: rgba(0, 0, 0, .28); border: 1px solid rgba(255, 255, 255, .22); color: var(--ink-2); }
	.a.hand kbd { color: var(--ink-dark); background: rgba(255, 255, 255, .25); border-color: rgba(0, 0, 0, .25); }
	.why { display: flex; align-items: center; gap: 7px; font-size: 16px; color: var(--ink-3); white-space: nowrap; }
	/* basics + ultimate */
	.ibot { flex: none; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; align-items: start; }
	.th { position: relative; display: block; width: 100%; padding: 0; border: none; background: none; border-radius: 6px; transition: transform .14s ease-out; }
	.th:hover { transform: translateY(-2px); }
	.th :global(.cardface) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 0 0 1px #030b15, 0 4px 10px rgba(0, 0, 0, .6); }
	.th.sel::before { content: ''; position: absolute; inset: -5px; border-radius: 10px; border: 2px solid #fff3cf; box-shadow: 0 0 14px rgba(244, 223, 168, .7); pointer-events: none; }
	.ultp { position: relative; min-width: 0; }
	.th.u :global(.cardface) { filter: grayscale(.7) brightness(.45); }
	.ultp.lit .th.u :global(.cardface) { filter: none; box-shadow: 0 0 0 2px #d4a8ff, 0 0 18px rgba(165, 110, 230, .8); }
	.ultp.rdy .th.u :global(.cardface) { filter: none; box-shadow: 0 0 0 2px #d4a8ff, 0 4px 10px rgba(0, 0, 0, .6); }
	.ubtn { position: absolute; left: 5px; right: 5px; bottom: 6px; height: 30px; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 0; border-radius: 9px; font-size: 15px; line-height: 1; white-space: nowrap;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border: 1px solid; border-color: #f9ebc6 #c9a355 #8a6a2c; box-shadow: 0 4px 12px rgba(0, 0, 0, .5), 0 0 0 1px rgba(0, 0, 0, .35); }

	@media (prefers-reduced-motion: reduce) {
		.dv, .halo, .crn-halo, .ult-halo, .lv-glow { animation: none; }
		.bead { display: none; }
		.nd, .th, .crn, .take, .a { transition: none; }
	}
</style>
