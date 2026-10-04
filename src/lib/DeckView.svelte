<script lang="ts">
	// Desktop deck view. Left: the upgrade tree (three colour columns, Tier I → III
	// top to bottom); the row of the tier you're on is drawn larger. Right: an
	// inspector — the hovered / selected card big enough to read (your hero's card
	// back when nothing is picked), what a pick gives you, the manual moves, and the
	// basics + the ultimate.
	// Level-ups follow the rules in cardstate (levelUp / swapPick): only in the phase
	// after the minion battle, forced while affordable, each confirmed first; this
	// round's pick can still be swapped for its twin until the round ends.
	// The design is DH px tall and as wide as the window's shape (clamped), then
	// scaled to fit, so every screen uses all of its space.
	// (The earlier all-cards banner list lives on in archive/DeckBannerList.svelte.)
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import LevelConfirm from '$lib/LevelConfirm.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroSplash, HERO_BY_ID } from '$lib/heroes';
	import {
		levelOf, levelCost, statDeltas, ultimateIndex, pickTier, tierIn, canPick, canAfford, mustLevel, swapSource, twinOf, allowedMoves, pickedThisRound,
		MAX_LEVEL, type PlayerCardState, type CardZone, type StatKey
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
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', GOLD: 'Gold', SILVER: 'Silver' };
	const ROM = ['I', 'II', 'III', 'IV'];
	const LVS = ['', 'levels 2–4', 'levels 5–7'];
	const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Area' };
	const ITEM_SHORT: Record<string, string> = { ATTACK: 'Atk', DEFENSE: 'Def', INITIATIVE: 'Init', MOVEMENT: 'Move', RANGE: 'Range', AREA: 'Area' };

	$: H = cs.hero;
	$: cards = heroCards(H);
	$: hero = HERO_BY_ID[H];
	$: find = (color: string, level?: number) =>
		cards.map((c, i) => ({ c, i })).filter((x) => x.c.color === color && !x.c.handicapped && (level == null || (x.c.level ?? 1) === level)).map((x) => x.i);
	$: tr = Object.fromEntries(COLS.map((c) => [c, { I: find(c, 1)[0], II: find(c, 2), III: find(c, 3) }])) as Record<string, { I: number; II: number[]; III: number[] }>;
	$: ult = ultimateIndex(H);
	$: basics = [find('GOLD')[0], find('SILVER')[0]].filter((i) => i != null && i >= 0);
	$: LV = levelOf(cs);
	$: nextTier = pickTier(cs);
	$: afford = canAfford(cs);
	$: forced = levelPhase && mustLevel(cs);
	$: picks = cs.roundPicks ?? [];

	// held this round = in hand, played, discarded or face down
	$: heldSet = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null), ...(cs.pending != null && cs.pending >= 0 ? [cs.pending] : [])]);
	$: zoneOf = (i: number): 'held' | 'upgrade' | 'removed' | null =>
		heldSet.has(i) ? 'held' : cs.upgrade.includes(i) ? 'upgrade' : cs.removed.includes(i) ? 'removed' : null;
	$: heldOf = (c: string) => [...heldSet].find((i) => cards[i]?.color === c);
	$: state = (i: number) => {
		const z = zoneOf(i);
		if (z === 'held') return 'cur';
		if (z === 'removed') return 'past';
		if (z === 'upgrade') return 'item';
		return canPick(cs, i) ? 'next' : 'far';
	};
	$: passed = (i: number) => { const z = zoneOf(i); return z === 'held' || z === 'removed'; };
	$: t3done = COLS.filter((c) => tierIn(cs, c) >= 3).length;
	$: canTakeNow = (i: number) => levelPhase && afford && canPick(cs, i);
	$: canSwapNow = (i: number) => levelPhase && swapSource(cs, i) != null;

	// items only: one pip per item this hero's deck can grant for that stat
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
	$: sub = (i: number) => { const c = cards[i]?.color; return c === 'GOLD' || c === 'SILVER' ? `${NAME[c]} basic` : c === 'PURPLE' ? 'Tier IV · Ultimate' : `${NAME[c]} · Tier ${ROM[(cards[i]?.level ?? 1) - 1]}`; };
	$: isTier = (i: number) => COLS.includes(cards[i]?.color as never);
	$: isBasic = (i: number) => ['GOLD', 'SILVER'].includes(cards[i]?.color ?? '');

	// hover (reading) beats selection (moving); nothing → your hero's card back
	let sel: number | null = null;
	let hov: number | null = null;
	$: selZone = sel == null ? null : zoneOf(sel);
	$: fState = focus != null && isTier(focus) ? state(focus) : null;
	$: fTwin = focus != null ? twin(focus) : -1;
	$: fOlder = focus != null && isTier(focus) ? heldOf(cards[focus].color) : undefined;
	$: focus = hov ?? sel;
	function over(i: number) { hov = i; }
	function out() { hov = null; }
	function act(fn: () => void) { fn(); sel = null; }
	function pick(i: number) { sel = sel === i ? null : i; }
	// a click on anything that isn't a card or a button puts the selection down
	function bgClick(e: MouseEvent) { if (!(e.target as HTMLElement | null)?.closest?.('button')) { sel = null; hov = null; } }

	// level-up / swap confirmation
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

	// one plain message per card saying what it takes to level into it (or why it can't move)
	$: need = levelCost(LV);
	$: broke = cs.coins < need;
	$: noMoney = `Not enough money — level ${LV} → ${LV + 1} costs ${need} (you have ${cs.coins}).`;
	$: allII = COLS.every((c) => tierIn(cs, c) >= 2);
	$: why = (i: number): string => {
		if (isBasic(i)) return 'Basics always stay in your hand.';
		if (i === ult) {
			if (cs.ultimate) return picks.includes(ult) ? 'Unlocked this round — you can still undo it.' : 'Active — a passive ability, not part of your hand.';
			if (t3done < 3) return `Unlocks at level 7, once all three colours are on Tier III (${t3done}/3).`;
			return broke ? noMoney : `Ready — unlock it for ${need} coins.`;
		}
		const c = cards[i];
		if (!c || !isTier(i)) return '';
		const t = c.level ?? 1, z = zoneOf(i), tw = twin(i);
		const fresh = z === null && (tw < 0 || zoneOf(tw) === null);
		if (fresh) {
			if (t === 3 && !allII) return broke ? `${noMoney} Level all three colours to Tier II first.` : 'Level all three colours to Tier II first.';
			if (broke) return noMoney;
			if (tierIn(cs, c.color) !== t - 1) return `Take ${NAME[c.color]} Tier ${ROM[t - 2]} first.`;
			return `Level ${LV} → ${LV + 1} for ${need} coins.`;
		}
		if (z === 'removed') return allowedMoves(cs, i).includes('hand') ? 'Removed — send it back to your hand to undo that level-up.' : 'Replaced in an earlier round — that level-up stays.';
		return 'Picked in an earlier round — that level-up stays.';
	};
	$: note = (i: number): string => {
		if (i === ult && ultReady) return `Ready — unlock it from the ultimate tile for ${need} coins.`;
		const s = isTier(i) ? state(i) : null;
		if (s === 'cur') return pickedThisRound(cs, i) ? 'In your hand — picked this round, you can still change it.' : 'In your hand.';
		if (s === 'item') return `Your item: +1 ${ITEM_NAME[itemOf(i)] ?? ''} — under your hero board.`;
		return why(i);
	};

	// manual moves allowed for this card (cardstate.allowedMoves), in this order
	const MOVE_BTNS: Array<[CardZone, string, string, string]> = [['hand', '→ Hand', 'H', 'hand'], ['upgrade', '→ Upgrade', 'U', 'upg'], ['deck', '→ Deck', 'D', 'deck'], ['removed', '→ Remove', 'R', 'rem']];
	$: moves = (i: number | null): Array<[CardZone, string, string, string]> => {
		if (i == null) return [];
		const ok = allowedMoves(cs, i);
		if (i === ult) return ok.includes('deck') ? [['deck', '↺ Undo unlock', 'D', 'deck']] : [];
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
	// the inspector gives up some width on squarer screens so the tree keeps its size
	$: INS = Math.round(Math.min(360, Math.max(290, DW * 0.21)));

	// tree geometry (design px): three colour columns. The row of the tier you're on
	// (your highest held tier) is the big one; the others are at most K of its size.
	const CGAP = 10, MID = 30, SP = 6, FOOT = 30, GY = 18, TITLE = 128, K = 0.82, R = 1192 / 1664, TH = DH - 2 * PAD;
	$: TW = DW - 2 * PAD - INS - IGAP;
	$: COLW = Math.floor((TW - 2 * CGAP) / 3);
	// each colour enlarges ITS current tier (the one it holds); every tier gets the same big size
	$: rowW = [COLW - 2 * SP - TITLE, (COLW - MID - 2 * SP) / 2, (COLW - MID - 2 * SP) / 2];
	$: AV = TH - 16 - 3 * FOOT - 2 * GY;
	$: BIG = Math.floor(Math.min(rowW[1], (AV / (1 + 2 * K)) * R));
	$: SMALL = Math.floor(K * BIG);
	type Geo = { F: number; cw: number[]; ch: number[]; tops: number[]; x0: number; xL: (r: number) => number; xR: (r: number) => number };
	$: geo = COLS.map((c): Geo => {
		const F = tierIn(cs, c) - 1;
		const cw = [0, 1, 2].map((r) => (r === F ? BIG : SMALL));
		const ch = cw.map((w) => Math.round(w / R));
		const PT = Math.max(8, (TH - (ch[0] + ch[1] + ch[2] + 3 * FOOT + 2 * GY)) / 2);
		const tops = [PT, PT + ch[0] + FOOT + GY, PT + ch[0] + ch[1] + 2 * (FOOT + GY)];
		return { F, cw, ch, tops, x0: SP + cw[0] / 2, xL: (r) => COLW / 2 - MID / 2 - cw[r] / 2, xR: (r) => COLW / 2 + MID / 2 + cw[r] / 2 };
	});
	$: xM = COLW / 2;
	$: colX = (k: number) => k * (COLW + CGAP);
	const elbow = (x1: number, y1: number, x2: number, y2: number) => { const my = (y1 + y2) / 2; return `M${x1} ${y1} V${my} H${x2} V${y2}`; };
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet itemIcon(i: number)}<img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt="" />{/snippet}

{#snippet node(i: number, r: number, x: number, g: Geo)}
	{@const s = state(i)}
	{@const tw = twin(i)}
	{@const src = swapSource(cs, i)}
	<div class="nd {s}" class:big={r === g.F} class:sel={i === sel} class:foc={i === hov} style="left:{x - g.cw[r] / 2}px; top:{g.tops[r]}px; width:{g.cw[r]}px">
		<button class="nd-card" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i]?.name}><Card heroId={H} card={cards[i]} /></button>
		<div class="nd-foot">
			{#if s === 'cur'}<span class="pill cur">In hand</span>
			{:else if s === 'past'}<span class="pill past">Removed</span>
			{:else if s === 'item' && canSwapNow(i) && src != null}
				<!-- this round's other path: swap it in, the pick becomes the item -->
				<button class="take swap" on:click={() => ask('swap', i)} on:pointerenter={() => over(i)} on:pointerleave={out} title="Swap to this path — {cards[src]?.name} becomes your item">Swap{#if itemOf(src)}<span class="tsep"></span>+1 {@render itemIcon(src)}{ITEM_SHORT[itemOf(src)]}{/if}</button>
			{:else if s === 'item'}<span class="pill item">{#if itemOf(i)}{@render itemIcon(i)}{/if}Item +1 {ITEM_NAME[itemOf(i)] ?? ''}</span>
			{:else if s === 'next' && canTakeNow(i)}
				<!-- one button: the card AND its twin's item -->
				<button class="take" on:click={() => ask('take', i)} on:pointerenter={() => over(i)} on:pointerleave={out} title="Take {cards[i]?.name} + the {ITEM_NAME[itemOf(tw)] ?? ''} item from {cards[tw]?.name}">Take{#if tw >= 0 && itemOf(tw)}<span class="tsep"></span>+1 {@render itemIcon(tw)}{ITEM_SHORT[itemOf(tw)]}{/if}</button>
			{:else if tw >= 0 && itemOf(tw)}
				<span class="ichip" class:dim={s === 'far'} title="Taking this card also gives you +1 {ITEM_NAME[itemOf(tw)]} (from {cards[tw]?.name})">+1 {@render itemIcon(tw)}{ITEM_SHORT[itemOf(tw)]}</span>
			{/if}
		</div>
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv" style="{teamStyle}; width:{DW}px; height:{DH}px; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation={bgClick} on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<!-- the tree -->
		<div class="tree" style="width:{TW}px; height:{TH}px">
			{#each COLS as c, k}
				{@const L = tierIn(cs, c)}
				{@const t = tr[c]}
				{@const g = geo[k]}
				{@const h = heldOf(c)}
				{@const nextHere = nextTier === L + 1 && nextTier <= 3}
				<div class="col" style="--c:{COL[c]}; left:{colX(k)}px; width:{COLW}px; height:{TH}px">
					<svg width={COLW} height={TH} aria-hidden="true">
						{#each t.II as ii, a}<path d={elbow(g.x0, g.tops[0] + g.ch[0] + FOOT - 6, a ? g.xR(1) : g.xL(1), g.tops[1])} class:lit={passed(ii)} class:open={L === 1 && nextTier === 2} />{/each}
						{#each t.II as ii, a}{#each t.III as iii, b}<path d={elbow(a ? g.xR(1) : g.xL(1), g.tops[1] + g.ch[1] + FOOT - 6, b ? g.xR(2) : g.xL(2), g.tops[2])} class:lit={passed(ii) && passed(iii)} class:open={zoneOf(ii) === 'held' && nextTier === 3} />{/each}{/each}
					</svg>
					<!-- Tier I on the left, the colour's title + status beside it -->
					{#if t.I != null}{@render node(t.I, 0, g.x0, g)}{/if}
					<div class="colh" style="left:{SP + g.cw[0] + 8}px; top:{g.tops[0]}px; right:{SP}px; height:{g.ch[0]}px">
						<b>{NAME[c]}</b>
						<span class="ct">Tier {ROM[L - 1]} in hand</span>
						{#if h != null}<span class="cn">{cards[h]?.name}</span>{/if}
						{#if nextHere && forced}<span class="cnext hot">Level up: take a Tier {ROM[nextTier - 1]}</span>
						{:else if nextHere}<span class="cnext">Next: a Tier {ROM[nextTier - 1]} · {LVS[nextTier - 1]}</span>
						{:else if L >= 3}<span class="cdone">Path complete</span>{/if}
					</div>
					{#each t.II as i, a (i)}{@render node(i, 1, a ? g.xR(1) : g.xL(1), g)}{/each}
					<span class="tb" class:lit={L >= 2} style="left:{xM}px; top:{g.tops[1] + g.ch[1] / 2}px" title="Tier II · {LVS[1]}">II</span>
					{#each t.III as i, a (i)}{@render node(i, 2, a ? g.xR(2) : g.xL(2), g)}{/each}
					<span class="tb" class:lit={L >= 3} style="left:{xM}px; top:{g.tops[2] + g.ch[2] / 2}px" title="Tier III · {LVS[2]}">III</span>
				</div>
			{/each}
		</div>

		<!-- inspector -->
		<aside class="ins" style="width:{INS}px">
			<div class="ih">
				<div class="por"><img src={heroSplash(H)} alt="" /></div>
				<div class="hn">{hero?.name ?? H}<em>{hero?.title ?? ''}</em></div>
				<span class="money" title="Coins">{cs.coins}</span>
				<div class="lvl"><span>Level</span><b>{LV}</b></div>
				<button class="ix" on:click={onClose} aria-label="Close deck">✕</button>
			</div>
			<div class="sbar" aria-label="Item upgrades">
				{#each STATS as s}
					{@const o = deltas[s.key] ?? 0}
					{@const p = possible(s.k)}
					<div class="sb" class:up={o > 0} class:none={p === 0 && o === 0} title="{s.n}: {o} of {p} item{p === 1 ? '' : 's'}">
						<div class="sb-tile"><img src={sa(s.a)} alt={s.n} /></div>
						<div class="sb-pips">{#each Array(Math.max(p, o)) as _, k (k)}<i class:on={k < o}></i>{/each}</div>
					</div>
				{/each}
			</div>
			<!-- where you stand on levelling -->
			<div class="lvbar" class:hot={forced} class:done={levelPhase && !forced}>
				{#if LV >= MAX_LEVEL}Max level — your ultimate is active
				{:else if forced}⬆ Level up! {LV} → {LV + 1} costs {levelCost(LV)} · {nextTier === 4 ? 'unlock your ultimate' : `take a Tier ${ROM[nextTier - 1]}`}
				{:else if levelPhase && picks.length}Levelled up · you can swap this round's pick until the round ends
				{:else if levelPhase}Not enough coins · +1 pity coin at round end
				{:else}Next level costs {levelCost(LV)}{/if}
			</div>

			<div class="icard">
				{#if focus != null}
					<button class="icw" style="--c:{COL[cards[focus]?.color] ?? '#888'}" on:click={() => focus != null && onPreview(focus)} title="Open full size"><Card heroId={H} card={cards[focus]} /></button>
				{:else}
					<div class="icw back"><CardBack hero={H} /></div>
				{/if}
			</div>

			<!-- the card in view: name, and for an option what it would put where (the note is in the line below) -->
			<div class="iinfo" style="--c:{focus != null ? COL[cards[focus]?.color] ?? '#888' : '#c79a4e'}">
				{#if focus == null}
					<div class="in1"><b>{hero?.name ?? H}'s deck</b></div>
				{:else}
					<div class="in1"><b>{cards[focus]?.name}</b><em>{sub(focus)}</em></div>
					{#if fState === 'next' || fState === 'far'}
						<ul class="gets" class:dim={fState === 'far'}>
							<li><i class="k">Hand</i>{cards[focus]?.name}</li>
							{#if fTwin >= 0 && itemOf(fTwin)}<li><i class="k it">Item</i>{@render itemIcon(fTwin)}+1 {ITEM_NAME[itemOf(fTwin)]} <small>from {cards[fTwin]?.name}</small></li>{/if}
							{#if fOlder != null && fOlder !== focus}<li><i class="k rm">Removed</i>{cards[fOlder]?.name}</li>{/if}
						</ul>
					{/if}
				{/if}
			</div>

			<div class="iact">
				{#if sel != null && moves(sel).length && (hov == null || hov === sel)}
					<div class="agrid">
						{#each moves(sel) as [to, lbl, key, cls] (to)}
							<button class="a {cls}" on:click={() => act(() => onMove(sel!, to))}>{lbl} <kbd>{key}</kbd></button>
						{/each}
					</div>
				{:else}
					<p class="hint">{focus != null ? note(focus) : 'Hover a card to read it · click to move it'}</p>
				{/if}
			</div>

			<div class="ibot">
				{#each basics as i (i)}
					<button class="th" class:sel={i === sel} style="--c:{COL[cards[i].color]}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i].name}><Card heroId={H} card={cards[i]} /></button>
				{/each}
				{#if ult >= 0}
					<div class="ultp" class:on={cs.ultimate} class:ready={ultReady}>
						<button class="th u" on:click={() => onPreview(ult)} on:pointerenter={() => over(ult)} on:pointerleave={out} title="Your ultimate"><Card heroId={H} card={cards[ult]} /></button>
						<span class="uh">Tier IV · {cs.ultimate ? 'active' : `${t3done}/3`}</span>
						<span class="seg">{#each Array(8) as _, k (k)}<i class:on={k < LV || (k === 7 && ultReady)} class:rdy={k === 7 && ultReady}></i>{/each}</span>
						{#if ultReady}<button class="ubtn" on:click={() => ask('take', ult)}>Unlock ★</button>{/if}
					</div>
				{/if}
			</div>
		</aside>

		{#if confirm}
			<LevelConfirm {cs} idx={confirm.idx} kind={confirm.kind} {teamStyle} onConfirm={doConfirm} onCancel={() => (confirm = null)} />
		{/if}
	</div>
</div>

<style>
	.dv-scrim { position: fixed; inset: 0; z-index: 20; background: rgba(3,6,12,.66); backdrop-filter: blur(3px); }
	.dv { position: absolute; left: 50%; top: 50%; box-sizing: border-box; display: flex; gap: 14px; padding: 12px; transform-origin: 50% 50%;
		border-radius: 18px; color: #e5e7eb; background: rgba(11,16,26,.98); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 30px 80px rgba(0,0,0,.7); }
	button { font: inherit; }

	/* tree */
	.tree { position: relative; flex: none; }
	.col { position: absolute; top: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 13%, transparent), transparent 80%); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); box-sizing: border-box; }
	.col svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.col path { fill: none; stroke: rgba(255,255,255,.14); stroke-width: 2; stroke-dasharray: 4 4; }
	.col path.open { stroke: color-mix(in srgb, var(--c) 60%, transparent); }
	.col path.lit { stroke: var(--c); stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 3px var(--c)); }
	/* colour title, beside Tier I */
	.colh { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 0 2px 0 4px; min-width: 0; }
	.colh b { font-weight: normal; font-size: 1.9rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 50%, transparent); }
	.colh .ct { font-size: .86rem; color: #e5e7eb; }
	.colh .cn { font-size: .78rem; color: #93a3b8; }
	.colh .cnext { align-self: flex-start; margin-top: 4px; padding: 4px 10px; border-radius: 8px; font-size: .78rem; color: #fff; background: color-mix(in srgb, var(--c) 40%, transparent); border: 1px solid var(--c); box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent); }
	.colh .cnext.hot { background: color-mix(in srgb, var(--c) 70%, #000); animation: hot 1.6s ease-in-out infinite; }
	@keyframes hot { 0%, 100% { box-shadow: 0 0 8px color-mix(in srgb, var(--c) 45%, transparent); } 50% { box-shadow: 0 0 20px var(--c); } }
	.colh .cdone { align-self: flex-start; margin-top: 4px; font-size: .74rem; color: #d7c4f5; }
	.tb { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: .76rem; background: #0c0f16; border: 2px solid #4a4f5c; color: #8b93a6; z-index: 1; }
	.tb.lit { border-color: #d9b25e; color: #fff1c9; box-shadow: 0 0 10px rgba(217,178,94,.55); }
	.nd { position: absolute; display: flex; flex-direction: column; align-items: center; z-index: 2; transition: transform .12s, left .3s ease, top .3s ease, width .3s ease; }
	.nd-card { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
	.nd-card :global(.cardface) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 5px 14px rgba(0,0,0,.6); transition: transform .5s cubic-bezier(.3,.7,.2,1), filter .3s; }
	.nd:hover, .nd.foc { transform: translateY(-3px); z-index: 3; }
	.nd-foot { height: 30px; display: flex; align-items: center; justify-content: center; gap: 6px; }
	.pill { display: inline-flex; align-items: center; gap: 4px; font-size: .7rem; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
	.pill img { width: 17px; height: 13px; object-fit: contain; }
	.pill.cur { background: #d9b25e; color: #1a1206; }
	.pill.past { background: rgba(150,160,175,.22); color: #9aa6b8; }
	.pill.item { background: #3f7fe0; color: #fff; }
	/* the item this branch also gives (its twin's) */
	.ichip { display: inline-flex; align-items: center; gap: 3px; height: 22px; padding: 0 8px 0 6px; border-radius: 7px; font-size: .7rem; white-space: nowrap; color: #dbe8ff; background: rgba(63,127,224,.24); border: 1px solid rgba(63,127,224,.6); }
	.ichip img { width: 17px; height: 13px; object-fit: contain; }
	.ichip.dim { opacity: .55; }
	.take { height: 26px; display: inline-flex; align-items: center; gap: 4px; padding: 0 12px; border-radius: 7px; border: none; background: var(--c); color: #fff; font-size: .8rem; white-space: nowrap; cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,.4), 0 0 12px color-mix(in srgb, var(--c) 55%, transparent); }
	.take img { width: 17px; height: 13px; object-fit: contain; }
	.tsep { width: 1px; height: 14px; margin: 0 4px; background: rgba(255,255,255,.5); }
	.take.swap { background: #3f7fe0; box-shadow: 0 2px 0 rgba(0,0,0,.4), 0 0 10px rgba(63,127,224,.55); }
	.take:hover { filter: brightness(1.12); }
	.nd.cur :global(.cardface) { box-shadow: 0 0 0 2px #d9b25e, 0 0 16px color-mix(in srgb, var(--c) 70%, transparent), 0 6px 14px rgba(0,0,0,.6); }
	.nd.next :global(.cardface) { box-shadow: 0 0 0 2px var(--c), 0 0 14px var(--c); }
	/* an upgrade is turned upside down, like on the table — only its item symbol (now upright) matters */
	.nd.item :global(.cardface) { transform: rotate(180deg); filter: saturate(.55) brightness(.7); box-shadow: 0 0 0 1px #3f7fe0; }
	.nd.past :global(.cardface) { filter: grayscale(1) brightness(.4); }
	.nd.far :global(.cardface) { filter: grayscale(.5) brightness(.55); }
	.nd.foc :global(.cardface) { filter: none; }
	.nd.sel :global(.cardface) { filter: none; box-shadow: 0 0 0 3px #fff, 0 0 26px var(--c); }

	/* inspector */
	.ins { flex: none; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
	.ih { flex: none; display: flex; align-items: center; gap: 10px; }
	.por { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; border: 2px solid #c79a4e; flex: none; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.hn { flex: 1; min-width: 0; font-size: 1.15rem; color: #f6ead2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hn em { display: block; font-style: normal; font-size: .62rem; color: #8b93a6; }
	/* the same gold coin as the rest of the game: the number sits on the coin */
	.money { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 2.3rem; height: 2rem; padding: 0 7px; border-radius: 999px;
		background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: 1.05rem; font-variant-numeric: tabular-nums;
		border: 1px solid rgba(0,0,0,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.45); }
	.lvbar { flex: none; padding: 2px 8px; border-radius: 7px; font-size: .62rem; line-height: 1.2; text-align: center; color: #93a3b8; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); }
	.lvbar.hot { color: #1a1206; background: linear-gradient(180deg, #f0c060, #c98a26); border-color: #fbe7b0; animation: lvpulse 1.6s ease-in-out infinite; }
	@keyframes lvpulse { 0%, 100% { box-shadow: 0 0 6px rgba(240,192,96,.35); } 50% { box-shadow: 0 0 18px rgba(240,192,96,.8); } }
	.lvbar.done { color: #cfe3ff; border-color: rgba(63,127,224,.5); background: rgba(63,127,224,.14); }
	.lvl { flex: none; display: flex; flex-direction: column; align-items: center; line-height: 1; padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(199,154,78,.5); background: rgba(199,154,78,.12); }
	.lvl span { font-size: .5rem; letter-spacing: .1em; text-transform: uppercase; color: #b8a06a; }
	.lvl b { font-weight: normal; font-size: 1.1rem; color: #f6e3b4; }
	.ix { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.05); color: #e5e7eb; cursor: pointer; flex: none; }
	.ix:hover { background: rgba(255,255,255,.14); }
	.sbar { flex: none; display: flex; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.08); }
	.sb { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.sb.none { opacity: .35; }
	.sb-tile { width: 44px; height: 36px; border-radius: 8px; display: grid; place-items: center; background: linear-gradient(180deg, #1c2536, #101624); border: 1px solid rgba(255,255,255,.14); box-shadow: inset 0 0 10px rgba(0,0,0,.6); }
	.sb.up .sb-tile { border-color: rgba(214,170,92,.7); box-shadow: inset 0 0 10px rgba(0,0,0,.6), 0 0 8px rgba(214,170,92,.3); }
	.sb-tile img { width: 25px; height: 25px; object-fit: contain; }
	.sb-pips { display: flex; gap: 3px; height: 5px; }
	.sb-pips i { width: 10px; height: 5px; border-radius: 1px; background: rgba(255,255,255,.14); transform: skewX(-20deg); }
	.sb-pips i.on { background: var(--tc, #ef7d22); box-shadow: 0 0 5px var(--tc, #ef7d22); }
	.icard { flex: 1; min-height: 0; display: flex; justify-content: center; }
	.icw { height: 100%; max-width: 100%; aspect-ratio: 1192 / 1664; padding: 0; border: none; background: none; cursor: zoom-in; }
	.icw :global(.cardface) { display: block; width: 100%; border-radius: 8px; box-shadow: 0 0 0 2px var(--c), 0 0 22px color-mix(in srgb, var(--c) 45%, transparent), 0 10px 26px rgba(0,0,0,.6); }
	.icw.back { position: relative; cursor: default; overflow: hidden; border-radius: 8px; box-shadow: 0 10px 26px rgba(0,0,0,.6); }
	.icw.back::after { content: ''; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 1px rgba(120,95,55,.4); pointer-events: none; }
	.iinfo { flex: none; height: 112px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); box-shadow: inset 3px 0 0 var(--c); }
	.in1 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
	.in1 b { font-weight: normal; font-size: 1rem; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.in1 em { flex: none; margin-left: auto; font-style: normal; font-size: .66rem; color: #93a3b8; }
	.gets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; font-size: .8rem; color: #e5e7eb; }
	.gets.dim { opacity: .75; }
	.gets li { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
	.gets small { font-size: .64rem; color: #7c8aa0; overflow: hidden; text-overflow: ellipsis; }
	.gets img { width: 18px; height: 14px; object-fit: contain; }
	.k { flex: none; width: 58px; font-style: normal; font-size: .6rem; text-align: center; padding: 1px 0; border-radius: 5px; letter-spacing: .06em; text-transform: uppercase; background: var(--tc, #ef7d22); color: #fff; }
	.k.it { background: #3f7fe0; }
	.k.rm { background: rgba(220,60,60,.35); color: #ffc9c9; }
	.iact { flex: none; min-height: 30px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
	.agrid { display: flex; gap: 5px; } .agrid .a { flex: 1; }
	.a { height: 24px; padding: 0 6px; border-radius: 7px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; font-size: .72rem; display: flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; cursor: pointer; }
	.a:hover { filter: brightness(1.15); }
	.a.hand { background: var(--tc, #ef7d22); border-color: transparent; color: #fff; }
	.a.upg { background: rgba(63,127,224,.22); border-color: rgba(63,127,224,.55); color: #cfe3ff; }
	.a.rem { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.a.deck { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.65); color: #f0dcae; }
	.a.ghost { background: transparent; }
	kbd { font-family: inherit; font-size: .54rem; padding: 0 3px; border-radius: 4px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.25); }
	.hint { margin: 0; text-align: center; font-size: .74rem; line-height: 1.4; color: #7c8aa0; }
	/* basics + ultimate */
	.ibot { flex: none; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; align-items: start; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
	.th { width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 5px; }
	.th :global(.cardface) { display: block; width: 100%; border-radius: 5px; box-shadow: 0 0 0 2px var(--c), 0 4px 10px rgba(0,0,0,.6); }
	.th.sel :global(.cardface) { box-shadow: 0 0 0 3px #fff, 0 0 14px var(--c); }
	.ultp { min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 5px 6px; border-radius: 9px; background: linear-gradient(180deg, rgba(120,60,190,.28), rgba(40,20,70,.4)); border: 1px solid rgba(165,110,230,.55); box-sizing: border-box; }
	.ultp.on, .ultp.ready { border-color: rgba(210,175,255,.9); box-shadow: 0 0 18px rgba(165,110,230,.5); }
	.th.u { width: 64%; cursor: zoom-in; }
	.th.u :global(.cardface) { filter: grayscale(.75) brightness(.5); box-shadow: 0 0 0 2px rgba(180,130,240,.6); }
	.ultp.on .th.u :global(.cardface), .ultp.ready .th.u :global(.cardface) { filter: none; box-shadow: 0 0 0 2px #b482f0, 0 0 12px rgba(165,110,230,.7); }
	.uh { font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; color: #d7c4f5; white-space: nowrap; }
	.ubtn { padding: 3px 10px; border-radius: 7px; border: 1px solid rgba(210,175,255,.8); background: linear-gradient(180deg, #9a5ce6, #5b2aa0); color: #fff; cursor: pointer; font-size: .7rem; }
	.seg { display: inline-flex; align-items: center; gap: 2px; }
	.seg i { width: 9px; height: 7px; background: rgba(255,255,255,.12); transform: skewX(-18deg); border-radius: 1px; }
	.seg i.rdy { animation: rdy 1.2s ease-in-out infinite; }
	@keyframes rdy { 50% { filter: brightness(1.6); box-shadow: 0 0 10px rgba(212,168,255,1); } }
	.seg i.on { background: linear-gradient(180deg, #d4a8ff, #8a4fd6); box-shadow: 0 0 5px rgba(180,130,240,.8); }
</style>
