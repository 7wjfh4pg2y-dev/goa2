<script lang="ts">
	// Desktop deck view: a full-card upgrade tree (Tier I → IV) beside a list of
	// all of the hero's cards as banners. Fixed 1420×920 design, scaled to fit.
	// Rules shown (not enforced): levels 2–4 take Tier II, 5–7 take Tier III, the
	// ultimate (Tier IV) needs all three Tier III. A pick = `take`: the card goes
	// to hand, its twin becomes an item, the older card of that colour is removed.
	import Card from '$lib/cards/Card.svelte';
	import { heroCards, backgroundSlug } from '$lib/cards/deck';
	import { heroSplash, HERO_BY_ID } from '$lib/heroes';
	import { levelOf, statDeltas, ultimateIndex, type PlayerCardState, type CardZone, type StatKey } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let teamStyle = '';
	export let onClose: () => void;
	export let onMove: (idx: number, to: CardZone) => void;
	export let onTake: (idx: number) => void;
	export let onPreview: (idx: number) => void;
	export let onUlt: (on: boolean) => void;

	type C = ReturnType<typeof heroCards>[number] & {
		item?: string; initiative?: number; primaryAction?: string; primaryValue?: number; level?: number;
		secondaryMovement?: number; secondaryDefense?: number; modifier?: string; modifierValue?: number; handicapped?: boolean;
	};
	const cardArt = import.meta.glob('./cards/images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const statArt = import.meta.glob('./images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const sa = (n: string) => statArt[`./images/stats/${n}.png`] ?? '';

	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', GOLD: 'Gold', SILVER: 'Silver' };
	const ROM = ['I', 'II', 'III', 'IV'];

	$: H = cs.hero;
	$: cards = heroCards(H) as C[];
	$: hero = HERO_BY_ID[H];
	$: art = (i: number) => cardArt[`./cards/images/cards/${H}/${backgroundSlug(cards[i])}.webp`] ?? '';
	$: find = (color: string, level?: number) =>
		cards.map((c, i) => ({ c, i })).filter((x) => x.c.color === color && !x.c.handicapped && (level == null || (x.c.level ?? 1) === level)).map((x) => x.i);
	$: tr = Object.fromEntries(COLS.map((c) => [c, { I: find(c, 1)[0], II: find(c, 2), III: find(c, 3) }])) as Record<string, { I: number; II: number[]; III: number[] }>;
	$: ult = ultimateIndex(H);
	$: LV = levelOf(cs);

	// held this round = in hand, played, discarded or face down
	$: heldSet = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null), ...(cs.pending != null && cs.pending >= 0 ? [cs.pending] : [])]);
	$: zoneOf = (i: number): 'held' | 'upgrade' | 'removed' | null =>
		heldSet.has(i) ? 'held' : cs.upgrade.includes(i) ? 'upgrade' : cs.removed.includes(i) ? 'removed' : null;
	$: tierHeld = (c: string) => Math.max(1, ...[...heldSet].filter((i) => cards[i]?.color === c).map((i) => cards[i]?.level ?? 1));
	// the tier the next level-up offers: 2–4 → II, 5–7 → III, 8 → the ultimate
	$: nextTier = LV + 1 <= 4 ? 2 : LV + 1 <= 7 ? 3 : 4;
	$: state = (i: number, c: string, t: number) => {
		const z = zoneOf(i);
		if (z === 'held') return 'cur';
		if (z === 'removed') return 'past';
		if (z === 'upgrade') return 'item';
		return t === tierHeld(c) + 1 && t === nextTier && !cs.ultimate ? 'next' : 'far';
	};
	$: passed = (i: number) => { const z = zoneOf(i); return z === 'held' || z === 'removed'; };
	$: t3done = COLS.filter((c) => tierHeld(c) >= 3).length;
	$: canPick = nextTier <= 3 && COLS.some((c) => tierHeld(c) + 1 === nextTier);

	// all cards (a hero has 18), grouped for the list
	$: all = cards.map((_, i) => i).filter((i) => !cards[i].handicapped || heldSet.has(i));
	$: basics = all.filter((i) => cards[i].color === 'GOLD' || cards[i].color === 'SILVER');
	$: heldList = [...basics.filter((i) => heldSet.has(i)), ...COLS.flatMap((c) => all.filter((i) => cards[i].color === c && heldSet.has(i)))];
	$: deckList = all.filter((i) => i !== ult && !basics.includes(i) && zoneOf(i) === null);
	$: itemList = cs.upgrade.filter((i) => all.includes(i));
	$: removedList = cs.removed.filter((i) => all.includes(i));

	// stat bar: base + items, a pip per item this hero's deck can grant for that stat
	const STATS: Array<{ k: string; key: StatKey; n: string; a: string; base: number | null }> = [
		{ k: 'ATTACK', key: 'atk', n: 'Attack', a: 'attack', base: 0 },
		{ k: 'DEFENSE', key: 'def', n: 'Defense', a: 'defense', base: 1 },
		{ k: 'INITIATIVE', key: 'init', n: 'Initiative', a: 'initiative', base: 2 },
		{ k: 'MOVEMENT', key: 'move', n: 'Movement', a: 'movement', base: 3 },
		{ k: 'RANGE', key: 'range', n: 'Range', a: 'range', base: null },
		{ k: 'AREA', key: 'radius', n: 'Area', a: 'area', base: null }
	];
	$: deltas = statDeltas(cs);
	$: possible = (k: string) => all.filter((i) => cards[i].item === k).length;

	// banners: the value sits over the card's action icon, like the printed card
	$: clr = (i: number) => (cards[i]?.color ?? 'gold').toLowerCase();
	$: actIcon = (i: number) => { const a = (cards[i]?.primaryAction ?? '').toLowerCase(); return a ? ic(`${a}_${clr(i)}`) : ''; };
	$: sub = (i: number) => { const c = cards[i]?.color; return c === 'GOLD' || c === 'SILVER' ? NAME[c] : c === 'PURPLE' ? 'Tier IV' : `${NAME[c]} · ${ROM[(cards[i]?.level ?? 1) - 1]}`; };

	// selection + actions
	let sel: number | null = null;
	$: selZone = sel == null ? null : zoneOf(sel);
	$: selState = sel == null ? null : (() => { const c = cards[sel]?.color; const t = cards[sel]?.level ?? 1; return COLS.includes(c as never) ? state(sel, c, t) : null; })();
	$: twinOf = (i: number) => { const c = cards[i]; if (!c || !COLS.includes(c.color as never) || (c.level ?? 1) < 2) return -1; return find(c.color, c.level ?? 1).find((x) => x !== i) ?? -1; };
	function act(fn: () => void) { fn(); sel = null; }
	function toHand(i: number) { act(() => (selState === 'next' ? onTake(i) : onMove(i, 'hand'))); }
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
		if (e.key === 'Escape') { if (sel != null) sel = null; else onClose(); e.preventDefault(); return; }
		if (sel == null) return;
		const k = e.key.toLowerCase();
		if (k === ' ') { onPreview(sel); e.preventDefault(); }
		else if (k === 'h' && selZone !== 'held') toHand(sel);
		else if (k === 'u' && selZone !== 'upgrade') act(() => onMove(sel!, 'upgrade'));
		else if (k === 'r' && selZone !== 'removed') act(() => onMove(sel!, 'removed'));
		else if (k === 'd' && selZone !== null) act(() => onMove(sel!, 'deck'));
	}

	// fixed design size, scaled to the window
	const DW = 1420, DH = 920;
	let vw = 1440, vh = 900;
	$: scale = Math.min((vw - 32) / DW, (vh - 32) / DH, 1.25);

	// tree geometry (px)
	const CW = 92, CH = Math.round((CW * 1664) / 1192), FOOT = 34, GY = 16, HEAD = 30;
	const ROW = CH + FOOT + GY;
	const GAP = 50, COLW = CW * 2 + GAP, CGAP = 22, GUT = 96;
	const top = (r: number) => HEAD + r * ROW;
	const xL = CW / 2, xR = COLW - CW / 2, xM = COLW / 2;
	const COLH = top(2) + CH + FOOT + 6;
	const colX = (k: number) => GUT + k * (COLW + CGAP);
	const TREEW = GUT + 3 * COLW + 2 * CGAP;
	const RAIL = COLH + 18, ULT_T = COLH + 36, ULT_H = 96, TREEH = ULT_T + ULT_H;
	const UX = GUT + (3 * COLW + 2 * CGAP) / 2;
	const elbow = (x1: number, y1: number, x2: number, y2: number) => { const my = (y1 + y2) / 2; return `M${x1} ${y1} V${my} H${x2} V${y2}`; };
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet banner(i: number, dim = false)}
	{@const c = cards[i]}
	<button class="bn" class:dim class:sel={i === sel} style="--c:{COL[c.color]}" on:click={() => (sel = sel === i ? null : i)} on:dblclick={() => onPreview(i)}>
		<span class="bn-mark">
			{#if actIcon(i)}<img src={actIcon(i)} alt={c.primaryAction} />{:else}<span class="bn-ult">IV</span>{/if}
			{#if c.primaryValue != null}<b>{c.primaryValue}</b>{/if}
		</span>
		<span class="bn-body" style="background-image: linear-gradient(90deg, #0d121c 34%, rgba(13,18,28,.6) 64%, rgba(13,18,28,.2)), url({art(i)})">
			<span class="bn-l1"><span class="bn-n">{c.name}</span><em>{sub(i)}</em></span>
			{#if i === ult}
				<span class="seg" title="Unlocks at level 8">{#each Array(8) as _, k (k)}<i class:on={k < LV}></i>{/each}<b>{cs.ultimate ? 'Unlocked' : `${LV}/8`}</b></span>
			{:else}
				<span class="bn-st">
					{#if c.initiative != null}<span class="chip">{c.initiative}<img src={ic('initiative')} alt="Initiative" /></span>{/if}
					{#if c.secondaryMovement}<span class="chip">{c.secondaryMovement}<img src={ic('movement')} alt="Movement" /></span>{/if}
					{#if c.secondaryDefense}<span class="chip">{c.secondaryDefense}<img src={ic('defense')} alt="Defense" /></span>{/if}
					{#if c.modifier}<span class="chip">{c.modifierValue}<img src={ic(`${c.modifier.toLowerCase()}_${clr(i)}`)} alt={c.modifier} /></span>{/if}
				</span>
			{/if}
		</span>
		{#if cs.upgrade.includes(i) && c.item}<span class="itm" title="Item: +1 {c.item.toLowerCase()}"><img src={ic(`item_${c.item.toLowerCase()}`)} alt="" /></span>{/if}
	</button>
{/snippet}

{#snippet node(i: number, c: string, t: number, x: number, y: number)}
	{@const s = state(i, c, t)}
	<div class="nd {s}" class:sel={i === sel} style="left:{x - CW / 2}px; top:{y}px; width:{CW}px">
		<button class="nd-card" on:click={() => (sel = sel === i ? null : i)} on:dblclick={() => onPreview(i)} title={cards[i]?.name}><Card heroId={H} card={cards[i]} /></button>
		<div class="nd-foot">
			{#if s === 'cur'}<span class="pill cur">In hand</span>
			{:else if s === 'past'}<span class="pill past">Used</span>
			{:else if s === 'item'}<span class="pill item">{#if cards[i]?.item}<img src={ic(`item_${cards[i].item?.toLowerCase()}`)} alt="" />{/if}+1 item</span>
			{:else if s === 'next'}<button class="take" on:click={() => act(() => onTake(i))}>Take</button>
			{/if}
		</div>
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv" style="{teamStyle}; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<div class="left">
			<!-- header: hero · stat bar with item pips · level-up · close -->
			<div class="hd">
				<div class="por"><img src={heroSplash(H)} alt="" /><span>{LV}</span></div>
				<div class="hn">{hero?.name ?? H} · Deck<em>{hero?.title ?? ''}</em></div>
				<div class="sbar">
					{#each STATS as s}
						{@const o = deltas[s.key] ?? 0}
						{@const p = possible(s.k)}
						<div class="sb" class:up={o > 0} title="{s.n}: {o} of {p} items">
							<div class="sb-tile"><img src={sa(s.a)} alt={s.n} /><b>{s.base != null ? (hero?.stats[s.base][0] ?? 0) + o : o ? '+' + o : '–'}</b></div>
							<div class="sb-pips">{#each Array(Math.max(p, o)) as _, k (k)}<i class:on={k < o}></i>{/each}</div>
						</div>
					{/each}
				</div>
				<span class="sp"></span>
				{#if canPick}<div class="lvup" title="Levels 2–4 take Tier II · levels 5–7 take Tier III">⬆ Lv {LV} → {LV + 1} · Tier {ROM[nextTier - 1]}</div>{/if}
				<button class="ix" on:click={onClose} aria-label="Close deck">✕</button>
			</div>

			<!-- tree: Tier I at the top → Tier IV (ultimate) at the bottom -->
			<div class="tree" style="width:{TREEW}px; height:{TREEH}px">
				<div class="tier" style="top:{top(0) + CH / 2}px">Tier I<em>start</em></div>
				<div class="tier" style="top:{top(1) + CH / 2}px">Tier II<em>levels 2–4</em></div>
				<div class="tier" style="top:{top(2) + CH / 2}px">Tier III<em>levels 5–7</em></div>
				<div class="tier" style="top:{ULT_T + ULT_H / 2}px">Tier IV<em>level 8</em></div>
				<svg class="conv" width={TREEW} height={TREEH} aria-hidden="true">
					{#each COLS as c, k}<path d="M{colX(k) + xM} {COLH} V{RAIL} H{UX} V{ULT_T}" class:lit={tierHeld(c) >= 3} style="--c:{COL[c]}" />{/each}
				</svg>
				{#each COLS as c, k}
					{@const L = tierHeld(c)}
					{@const t = tr[c]}
					<div class="col" style="--c:{COL[c]}; left:{colX(k)}px; width:{COLW}px; height:{COLH}px">
						<div class="colh"><i></i>{NAME[c]}<b>{ROM[L - 1]}</b></div>
						<svg width={COLW} height={COLH} aria-hidden="true">
							{#each t.II as ii, a}<path d={elbow(xM, top(0) + CH + FOOT, a ? xR : xL, top(1))} class:lit={passed(ii)} class:open={L === 1 && nextTier === 2} />{/each}
							{#each t.II as ii, a}{#each t.III as iii, b}<path d={elbow(a ? xR : xL, top(1) + CH + FOOT, b ? xR : xL, top(2))} class:lit={passed(ii) && passed(iii)} class:open={zoneOf(ii) === 'held' && nextTier === 3} />{/each}{/each}
						</svg>
						{#if t.I != null}{@render node(t.I, c, 1, xM, top(0))}{/if}
						{#each t.II as i, a (i)}{@render node(i, c, 2, a ? xR : xL, top(1))}{/each}
						<span class="tb" class:lit={L >= 2} style="left:{xM}px; top:{top(1) + CH / 2}px">II</span>
						{#each t.III as i, a (i)}{@render node(i, c, 3, a ? xR : xL, top(2))}{/each}
						<span class="tb" class:lit={L >= 3} style="left:{xM}px; top:{top(2) + CH / 2}px">III</span>
					</div>
				{/each}
				{#if ult >= 0}
					<div class="ultn" class:on={cs.ultimate} style="left:{UX}px; top:{ULT_T}px; height:{ULT_H}px">
						<button class="ultc" class:sel={sel === ult} on:click={() => onPreview(ult)} title="Preview your ultimate"><Card heroId={H} card={cards[ult]} /></button>
						<div class="ult-t">
							<b>{cards[ult]?.name}</b>
							<span>{cs.ultimate ? 'Unlocked' : 'Needs all three Tier III'} · <em>{t3done} / 3</em></span>
							<span class="seg big">{#each Array(8) as _, k (k)}<i class:on={k < LV}></i>{/each}<b>Lv {LV} / 8</b></span>
						</div>
						{#if cs.ultimate}<button class="ubtn ghost" on:click={() => onUlt(false)}>Re-lock</button>
						{:else if t3done === 3}<button class="ubtn" on:click={() => onUlt(true)}>Unlock ★</button>{/if}
					</div>
				{/if}
			</div>

			<!-- action bar -->
			<div class="abar">
				{#if sel != null}
					{@const tw = twinOf(sel)}
					<span class="asel">Selected · <b>{cards[sel]?.name}</b><em>{sub(sel)}{#if selState === 'next' && tw >= 0} — its twin {cards[tw]?.name} becomes +1 {cards[tw]?.item?.toLowerCase()}{/if}</em></span>
					<button class="a" on:click={() => sel != null && onPreview(sel)}>Preview <kbd>Space</kbd></button>
					{#if selZone !== 'held'}<button class="a hand" on:click={() => sel != null && toHand(sel)}>{selState === 'next' ? 'Take → Hand' : '→ Hand'} <kbd>H</kbd></button>{/if}
					{#if selZone !== 'upgrade'}<button class="a" on:click={() => act(() => onMove(sel!, 'upgrade'))}>→ Upgrade <kbd>U</kbd></button>{/if}
					{#if selZone !== 'removed'}<button class="a rem" on:click={() => act(() => onMove(sel!, 'removed'))}>→ Removed <kbd>R</kbd></button>{/if}
					{#if selZone !== null}<button class="a deck" on:click={() => act(() => onMove(sel!, 'deck'))}>→ Deck <kbd>D</kbd></button>{/if}
					<button class="a ghost" on:click={() => (sel = null)}>Cancel <kbd>Esc</kbd></button>
				{:else}
					<span class="asel idle">Click a card to manage it · double-click to preview{#if canPick} · <b>Take</b> a lit card to level up{/if}</span>
				{/if}
			</div>
		</div>

		<!-- every card the hero owns -->
		<div class="list">
			<div class="ls">Hand <b>{heldList.length}</b></div>
			{#each heldList as i (i)}{@render banner(i)}{/each}
			<div class="ls">Deck <b>{deckList.length}</b></div>
			{#each deckList as i (i)}{@render banner(i)}{/each}
			<div class="ls">Items <b>{itemList.length}</b></div>
			{#each itemList as i (i)}{@render banner(i)}{/each}
			<div class="ls">Removed <b>{removedList.length}</b></div>
			{#each removedList as i (i)}{@render banner(i, true)}{/each}
			{#if ult >= 0}<div class="ls">Ultimate</div>{@render banner(ult, !cs.ultimate)}{/if}
		</div>
	</div>
</div>

<style>
	.dv-scrim { position: fixed; inset: 0; z-index: 20; background: rgba(3,6,12,.66); backdrop-filter: blur(3px); }
	.dv { position: absolute; left: 50%; top: 50%; width: 1420px; height: 920px; box-sizing: border-box; display: flex; gap: 16px; padding: 12px 14px; transform-origin: 50% 50%;
		border-radius: 18px; color: #e5e7eb; background: rgba(11,16,26,.98); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 30px 80px rgba(0,0,0,.7); }
	button { font: inherit; }
	.left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }

	/* header */
	.hd { display: flex; align-items: center; gap: 14px; padding: 2px 4px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
	.por { position: relative; width: 54px; height: 54px; border-radius: 10px; overflow: hidden; border: 2px solid #c79a4e; flex: none; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.por span { position: absolute; right: 1px; bottom: 1px; padding: 0 5px; background: #000c; border: 1px solid #c79a4e; font-size: .7rem; }
	.hn { font-size: 1.25rem; color: #f6ead2; flex: none; }
	.hn em { display: block; font-style: normal; font-size: .64rem; color: #8b93a6; }
	.sbar { display: flex; gap: 8px; margin-left: 8px; }
	.sb { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.sb-tile { position: relative; width: 54px; height: 42px; border-radius: 8px; display: grid; place-items: center; background: linear-gradient(180deg, #1c2536, #101624); border: 1px solid rgba(255,255,255,.14); box-shadow: inset 0 0 10px rgba(0,0,0,.6); }
	.sb.up .sb-tile { border-color: rgba(214,170,92,.7); box-shadow: inset 0 0 10px rgba(0,0,0,.6), 0 0 8px rgba(214,170,92,.3); }
	.sb-tile img { width: 24px; height: 24px; object-fit: contain; }
	.sb-tile b { position: absolute; right: 4px; bottom: 1px; font-weight: normal; font-size: .92rem; color: #fff; text-shadow: 0 1px 2px #000, 0 0 4px #000; }
	.sb-pips { display: flex; gap: 3px; height: 5px; }
	.sb-pips i { width: 12px; height: 5px; border-radius: 1px; background: rgba(255,255,255,.14); transform: skewX(-20deg); }
	.sb-pips i.on { background: var(--tc, #ef7d22); box-shadow: 0 0 5px var(--tc, #ef7d22); }
	.sp { flex: 1; }
	.lvup { padding: 7px 12px; border-radius: 10px; border: 1px solid rgba(255,220,150,.7); background: linear-gradient(180deg, #e2a64a, #b8781f); color: #1a1206; font-size: .8rem; box-shadow: 0 0 14px rgba(226,166,74,.45); white-space: nowrap; }
	.ix { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.05); color: #e5e7eb; cursor: pointer; flex: none; }
	.ix:hover { background: rgba(255,255,255,.14); }

	/* tree */
	.tree { position: relative; margin: 0 auto; }
	.tier { position: absolute; left: 0; width: 84px; transform: translateY(-50%); font-size: .8rem; color: #cbb488; letter-spacing: .06em; }
	.tier em { display: block; font-style: normal; font-size: .6rem; color: #6f7b90; letter-spacing: .04em; }
	.conv { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.conv path { fill: none; stroke: rgba(180,130,240,.22); stroke-width: 2; stroke-dasharray: 4 4; }
	.conv path.lit { stroke: var(--c); stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 3px var(--c)); }
	.col { position: absolute; top: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, transparent), transparent 85%); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
	.colh { position: absolute; left: 0; right: 0; top: 6px; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: .76rem; letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
	.colh i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); }
	.colh b { font-weight: normal; font-size: .64rem; padding: 0 7px; border-radius: 999px; background: var(--c); color: #fff; letter-spacing: 0; }
	.col svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.col path { fill: none; stroke: rgba(255,255,255,.14); stroke-width: 2; stroke-dasharray: 4 4; }
	.col path.open { stroke: color-mix(in srgb, var(--c) 60%, transparent); }
	.col path.lit { stroke: var(--c); stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 3px var(--c)); }
	.tb { position: absolute; transform: translate(-50%, -50%); width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: .72rem; background: #0c0f16; border: 2px solid #4a4f5c; color: #8b93a6; z-index: 1; }
	.tb.lit { border-color: #d9b25e; color: #fff1c9; box-shadow: 0 0 10px rgba(217,178,94,.55); }
	.nd { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 2; transition: transform .12s; }
	.nd-card { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
	.nd-card :global(canvas) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 5px 14px rgba(0,0,0,.6); }
	.nd:hover { transform: translateY(-3px); z-index: 3; }
	.nd-foot { height: 30px; display: flex; align-items: center; }
	.pill { display: inline-flex; align-items: center; gap: 3px; font-size: .6rem; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
	.pill img { width: 16px; height: 12px; object-fit: contain; }
	.pill.cur { background: #d9b25e; color: #1a1206; }
	.pill.past { background: rgba(150,160,175,.22); color: #9aa6b8; }
	.pill.item { background: #3f7fe0; color: #fff; }
	.take { padding: 4px 20px; border-radius: 7px; border: none; background: var(--c); color: #fff; font-size: .76rem; cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
	.take:hover { filter: brightness(1.12); }
	.nd.cur { transform: scale(1.06); }
	.nd.cur :global(canvas) { box-shadow: 0 0 0 2px #d9b25e, 0 0 16px color-mix(in srgb, var(--c) 70%, transparent), 0 6px 14px rgba(0,0,0,.6); }
	.nd.next :global(canvas) { box-shadow: 0 0 0 2px var(--c), 0 0 14px var(--c); }
	.nd.item :global(canvas) { filter: saturate(.45) brightness(.55); box-shadow: 0 0 0 1px #3f7fe0; }
	.nd.past :global(canvas) { filter: grayscale(1) brightness(.4); }
	.nd.far :global(canvas) { filter: grayscale(.75) brightness(.32); }
	.nd.sel :global(canvas) { filter: none; box-shadow: 0 0 0 3px #fff, 0 0 26px var(--c); }
	.ultn { position: absolute; transform: translateX(-50%); display: flex; align-items: center; gap: 14px; padding: 8px 14px 8px 8px; border-radius: 12px; box-sizing: border-box; white-space: nowrap;
		background: linear-gradient(90deg, rgba(120,60,190,.3), rgba(40,20,70,.45)); border: 1px solid rgba(165,110,230,.55); box-shadow: 0 0 20px rgba(165,110,230,.2); z-index: 2; }
	.ultn.on { border-color: rgba(210,175,255,.9); box-shadow: 0 0 26px rgba(165,110,230,.55); }
	.ultc { width: 56px; padding: 0; border: none; background: none; cursor: zoom-in; }
	.ultc :global(canvas) { display: block; width: 100%; border-radius: 5px; filter: grayscale(.75) brightness(.5); box-shadow: 0 0 0 2px rgba(180,130,240,.6); }
	.ultn.on .ultc :global(canvas) { filter: none; box-shadow: 0 0 0 2px #b482f0, 0 0 12px rgba(165,110,230,.7); }
	.ult-t { display: flex; flex-direction: column; gap: 5px; font-size: .66rem; color: #b9a7d6; }
	.ult-t > b { font-weight: normal; font-size: .95rem; color: #efe0ff; }
	.ult-t em { font-style: normal; color: #fff; }
	.ubtn { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(210,175,255,.8); background: linear-gradient(180deg, #9a5ce6, #5b2aa0); color: #fff; cursor: pointer; font-size: .78rem; }
	.ubtn.ghost { background: transparent; color: #d7c4f5; }

	/* segmented level bar (the ultimate fills it at 8) */
	.seg { display: inline-flex; align-items: center; gap: 2px; }
	.seg i { width: 11px; height: 7px; background: rgba(255,255,255,.12); transform: skewX(-18deg); border-radius: 1px; }
	.seg i.on { background: linear-gradient(180deg, #d4a8ff, #8a4fd6); box-shadow: 0 0 5px rgba(180,130,240,.8); }
	.seg b { font-weight: normal; margin-left: 6px; font-size: .62rem; color: #d7c4f5; }
	.seg.big i { width: 20px; height: 10px; }

	/* action bar */
	.abar { margin-top: auto; flex: none; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; border: 1px solid rgba(199,154,78,.4); background: rgba(8,12,20,.9); }
	.asel { margin-right: auto; font-size: .8rem; color: #f0dcae; display: flex; flex-direction: column; min-width: 0; }
	.asel b { font-weight: normal; color: #fff; }
	.asel em { font-style: normal; font-size: .62rem; color: #93a3b8; }
	.asel.idle { flex-direction: row; gap: 4px; color: #7c8aa0; font-size: .74rem; }
	.a { padding: 7px 11px; border-radius: 9px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; font-size: .78rem; display: flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer; }
	.a:hover { filter: brightness(1.15); }
	.a.hand { background: var(--tc, #ef7d22); border-color: transparent; color: #fff; }
	.a.rem { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.a.deck { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.65); color: #f0dcae; }
	.a.ghost { background: transparent; }
	kbd { font-family: inherit; font-size: .58rem; padding: 0 4px; border-radius: 4px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.25); }

	/* the card list (two-line banners) */
	.list { width: 470px; flex: none; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 12px; background: #0b111c; border: 1px solid #22314a; overflow-y: auto; scrollbar-width: thin; }
	.ls { margin-top: 5px; font-size: .6rem; letter-spacing: .14em; text-transform: uppercase; color: #6c7c96; }
	.ls:first-child { margin-top: 0; }
	.ls b { font-weight: normal; color: #cbd5e1; margin-left: 4px; }
	.bn { position: relative; display: flex; height: 39px; flex: none; padding: 0; border: none; border-radius: 5px; overflow: hidden; cursor: pointer; text-align: left; color: inherit; background: #0d121c; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
	.bn:hover { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 70%, transparent); }
	.bn.dim { opacity: .42; filter: grayscale(.5); }
	.bn.sel { opacity: 1; filter: none; box-shadow: 0 0 0 2px #fff, 0 0 12px var(--c); }
	.bn-mark { position: relative; width: 56px; flex: none; display: grid; place-items: center;
		background: linear-gradient(180deg, color-mix(in srgb, var(--c) 45%, #0b0f18), color-mix(in srgb, var(--c) 18%, #0b0f18)); border-right: 2px solid var(--c); clip-path: polygon(0 0, 100% 0, 90% 50%, 100% 100%, 0 100%); }
	.bn-mark img { width: 34px; height: 30px; object-fit: contain; filter: drop-shadow(0 1px 2px #000); }
	/* the value printed over its icon */
	.bn-mark b { position: absolute; left: 0; right: 4px; top: 50%; transform: translateY(-46%); text-align: center; font-weight: normal; font-size: 1.2rem; line-height: 1; color: #fff;
		-webkit-text-stroke: 3px #10131a; paint-order: stroke fill; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
	.bn-ult { font-size: .8rem; color: #e6d2ff; letter-spacing: .06em; }
	.bn-body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 0 8px 0 9px; background-size: 100%, 58%; background-position: 0 0, right 32%; background-repeat: no-repeat; }
	.bn-l1 { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
	.bn-n { min-width: 0; font-size: .82rem; line-height: 1.1; color: #f1f5f9; text-shadow: 0 1px 2px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.bn-l1 em { flex: none; font-style: normal; font-size: .56rem; color: #93a3b8; text-shadow: 0 1px 2px #000; }
	.bn-st { display: flex; gap: 3px; }
	.chip { display: inline-flex; align-items: center; gap: 1px; padding: 0 4px; border-radius: 4px; font-size: .64rem; line-height: 15px; color: #fff; background: rgba(0,0,0,.62); border: 1px solid rgba(255,255,255,.12); }
	.chip img { width: 13px; height: 12px; object-fit: contain; }
	.itm { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 28px; height: 23px; display: grid; place-items: center; border-radius: 5px; background: #3f7fe0; box-shadow: 0 0 6px rgba(63,127,224,.6); }
	.itm img { width: 21px; height: 16px; object-fit: contain; }
</style>
