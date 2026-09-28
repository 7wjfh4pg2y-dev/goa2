<script lang="ts">
	// Desktop deck view: a full-card upgrade tree (Tier I → III, top to bottom)
	// across the whole window, with a side panel for the basics, the items you've
	// earned and the Tier IV ultimate. Fixed 1420×920 design, scaled to fit.
	// Rules shown (not enforced): levels 2–4 take Tier II, 5–7 take Tier III, the
	// ultimate needs all three Tier III. A pick = `take`: the card goes to hand, its
	// twin becomes an item, the older card of that colour is removed.
	// (The earlier all-cards banner list lives on in archive/DeckBannerList.svelte.)
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroSplash, HERO_BY_ID } from '$lib/heroes';
	import { levelOf, statDeltas, ultimateIndex, type PlayerCardState, type CardZone, type StatKey } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let teamStyle = '';
	export let onClose: () => void;
	export let onMove: (idx: number, to: CardZone) => void;
	export let onTake: (idx: number) => void;
	export let onPreview: (idx: number) => void;
	export let onUlt: (on: boolean) => void;

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const statArt = import.meta.glob('./images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const sa = (n: string) => statArt[`./images/stats/${n}.png`] ?? '';

	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', GOLD: 'Gold', SILVER: 'Silver' };
	const ROM = ['I', 'II', 'III', 'IV'];
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

	// selection + actions
	let sel: number | null = null;
	$: selZone = sel == null ? null : zoneOf(sel);
	$: selState = sel == null ? null : (() => { const c = cards[sel]?.color; const t = cards[sel]?.level ?? 1; return COLS.includes(c as never) ? state(sel, c, t) : null; })();
	$: twinOf = (i: number) => { const c = cards[i]; if (!c || !COLS.includes(c.color as never) || (c.level ?? 1) < 2) return -1; return find(c.color, c.level ?? 1).find((x) => x !== i) ?? -1; };
	$: sub = (i: number) => { const c = cards[i]?.color; return c === 'GOLD' || c === 'SILVER' ? NAME[c] : c === 'PURPLE' ? 'Tier IV' : `${NAME[c]} · Tier ${ROM[(cards[i]?.level ?? 1) - 1]}`; };
	function act(fn: () => void) { fn(); sel = null; }
	function toHand(i: number) { act(() => (selState === 'next' ? onTake(i) : onMove(i, 'hand'))); }
	function pick(i: number) { sel = sel === i ? null : i; }
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

	// tree geometry (px): three colour columns, the side panel to their right
	const GUT = 88, CGAP = 22, PANEL = 252, PGAP = 26, CARDS_W = 1392 - GUT - PANEL - PGAP;
	const COLW = Math.floor((CARDS_W - 2 * CGAP) / 3), GAP = 56, CW = Math.floor((COLW - GAP) / 2);
	const CH = Math.round((CW * 1664) / 1192), FOOT = 34, GY = 14, HEAD = 26;
	const ROW = CH + FOOT + GY;
	const top = (r: number) => HEAD + r * ROW;
	const xL = CW / 2, xR = COLW - CW / 2, xM = COLW / 2;
	const COLH = top(2) + CH + FOOT + 4;
	const colX = (k: number) => GUT + k * (COLW + CGAP);
	const PX = GUT + 3 * COLW + 2 * CGAP + PGAP;
	const RAIL = COLH + 12, TREEH = RAIL + 12;
	const elbow = (x1: number, y1: number, x2: number, y2: number) => { const my = (y1 + y2) / 2; return `M${x1} ${y1} V${my} H${x2} V${y2}`; };
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet node(i: number, c: string, t: number, x: number, y: number)}
	{@const s = state(i, c, t)}
	<div class="nd {s}" class:sel={i === sel} style="left:{x - CW / 2}px; top:{y}px; width:{CW}px">
		<button class="nd-card" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} title={cards[i]?.name}><Card heroId={H} card={cards[i]} /></button>
		<div class="nd-foot">
			{#if s === 'cur'}<span class="pill cur">In hand</span>
			{:else if s === 'past'}<span class="pill past">Used</span>
			{:else if s === 'item'}<span class="pill item">{#if cards[i]?.item}<img src={ic(`item_${cards[i].item?.toLowerCase()}`)} alt="" />{/if}+1 {ITEM_NAME[cards[i]?.item ?? ''] ?? 'item'}</span>
			{:else if s === 'next'}<button class="take" on:click={() => act(() => onTake(i))}>Take</button>
			{/if}
		</div>
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv" style="{teamStyle}; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<!-- header: hero · item pips per stat · level-up · close -->
		<div class="hd">
			<div class="por"><img src={heroSplash(H)} alt="" /><span>{LV}</span></div>
			<div class="hn">{hero?.name ?? H} · Deck<em>{hero?.title ?? ''}</em></div>
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
			<span class="sp"></span>
			{#if canPick}<div class="lvup" title="Levels 2–4 take Tier II · levels 5–7 take Tier III">⬆ Level {LV} → {LV + 1} · take a Tier {ROM[nextTier - 1]}</div>{/if}
			<button class="ix" on:click={onClose} aria-label="Close deck">✕</button>
		</div>

		<!-- tree + side panel share one coordinate space so the lines can reach the ultimate -->
		<div class="tree" style="height:{TREEH}px">
			<div class="tier" style="top:{top(0) + CH / 2}px">Tier I<em>start</em></div>
			<div class="tier" style="top:{top(1) + CH / 2}px">Tier II<em>levels 2–4</em></div>
			<div class="tier" style="top:{top(2) + CH / 2}px">Tier III<em>levels 5–7</em></div>
			<svg class="conv" width="1392" height={TREEH} aria-hidden="true">
				{#each COLS as c, k}<path d="M{colX(k) + xM} {COLH} V{RAIL} H{PX}" class:lit={tierHeld(c) >= 3} style="--c:{COL[c]}" />{/each}
			</svg>
			{#each COLS as c, k}
				{@const L = tierHeld(c)}
				{@const t = tr[c]}
				<div class="col" style="--c:{COL[c]}; left:{colX(k)}px; width:{COLW}px; height:{COLH}px">
					<div class="colh"><i></i>{NAME[c]}<b>Tier {ROM[L - 1]}</b></div>
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

			<!-- side panel: basics · items earned · the ultimate -->
			<div class="side" style="left:{PX}px; width:{PANEL}px; height:{TREEH}px">
				<div class="sec">Basics <em>always in hand</em></div>
				<div class="basics">
					{#each basics as i (i)}
						<button class="bc" class:sel={i === sel} style="--c:{COL[cards[i].color]}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} title={cards[i].name}><Card heroId={H} card={cards[i]} /></button>
					{/each}
				</div>
				<div class="sec">Items <em>{cs.upgrade.length} of 6</em></div>
				<div class="items">
					{#each cs.upgrade as i (i)}
						<button class="it" class:sel={i === sel} style="--c:{COL[cards[i]?.color] ?? '#888'}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)}>
							<span class="it-ic">{#if cards[i]?.item}<img src={ic(`item_${cards[i].item?.toLowerCase()}`)} alt="" />{/if}</span>
							<span class="it-t"><b>+1 {ITEM_NAME[cards[i]?.item ?? ''] ?? '?'}</b><em>{cards[i]?.name}</em></span>
						</button>
					{/each}
					{#each Array(Math.max(0, 6 - cs.upgrade.length)) as _, k (k)}<span class="it empty">level {cs.upgrade.length + k + 2}</span>{/each}
				</div>
				{#if ult >= 0}
					<div class="ultp" class:on={cs.ultimate}>
						<div class="sec u">Tier IV · Ultimate <em>level 8</em></div>
						<button class="uc" class:sel={sel === ult} on:click={() => onPreview(ult)} title="Preview your ultimate"><Card heroId={H} card={cards[ult]} /></button>
						<div class="ut">
							<span>{cs.ultimate ? 'Unlocked' : 'Needs all three Tier III'} · <em>{t3done} / 3</em></span>
							<span class="seg">{#each Array(8) as _, k (k)}<i class:on={k < LV}></i>{/each}<b>Lv {LV} / 8</b></span>
							{#if cs.ultimate}<button class="ubtn ghost" on:click={() => onUlt(false)}>Re-lock</button>
							{:else if t3done === 3}<button class="ubtn" on:click={() => onUlt(true)}>Unlock ★</button>{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- action bar -->
		<div class="abar">
			{#if sel != null}
				{@const tw = twinOf(sel)}
				<span class="asel">Selected · <b>{cards[sel]?.name}</b><em>{sub(sel)}{#if selState === 'next' && tw >= 0} — its twin {cards[tw]?.name} becomes +1 {ITEM_NAME[cards[tw]?.item ?? '']?.toLowerCase()}{/if}</em></span>
				<button class="a" on:click={() => sel != null && onPreview(sel)}>Preview <kbd>Space</kbd></button>
				{#if selZone !== 'held'}<button class="a hand" on:click={() => sel != null && toHand(sel)}>{selState === 'next' ? 'Take → Hand' : '→ Hand'} <kbd>H</kbd></button>{/if}
				{#if selZone !== 'upgrade'}<button class="a" on:click={() => act(() => onMove(sel!, 'upgrade'))}>→ Upgrade <kbd>U</kbd></button>{/if}
				{#if selZone !== 'removed'}<button class="a rem" on:click={() => act(() => onMove(sel!, 'removed'))}>→ Removed <kbd>R</kbd></button>{/if}
				{#if selZone !== null}<button class="a deck" on:click={() => act(() => onMove(sel!, 'deck'))}>→ Deck <kbd>D</kbd></button>{/if}
				<button class="a ghost" on:click={() => (sel = null)}>Cancel <kbd>Esc</kbd></button>
			{:else}
				<span class="asel idle">Click a card to manage it · double-click to read it{#if canPick} · press <b>Take</b> on a lit card to level up{/if}</span>
			{/if}
		</div>
	</div>
</div>

<style>
	.dv-scrim { position: fixed; inset: 0; z-index: 20; background: rgba(3,6,12,.66); backdrop-filter: blur(3px); }
	.dv { position: absolute; left: 50%; top: 50%; width: 1420px; height: 920px; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; transform-origin: 50% 50%;
		border-radius: 18px; color: #e5e7eb; background: rgba(11,16,26,.98); border: 1px solid rgba(199,154,78,.5); box-shadow: 0 30px 80px rgba(0,0,0,.7); }
	button { font: inherit; }

	/* header */
	.hd { display: flex; align-items: center; gap: 14px; padding: 2px 4px 10px; border-bottom: 1px solid rgba(255,255,255,.08); }
	.por { position: relative; width: 52px; height: 52px; border-radius: 10px; overflow: hidden; border: 2px solid #c79a4e; flex: none; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.por span { position: absolute; right: 1px; bottom: 1px; padding: 0 5px; background: #000c; border: 1px solid #c79a4e; font-size: .7rem; }
	.hn { font-size: 1.25rem; color: #f6ead2; flex: none; }
	.hn em { display: block; font-style: normal; font-size: .64rem; color: #8b93a6; }
	.sbar { display: flex; gap: 10px; margin-left: 16px; }
	.sb { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.sb.none { opacity: .35; }
	.sb-tile { width: 46px; height: 38px; border-radius: 8px; display: grid; place-items: center; background: linear-gradient(180deg, #1c2536, #101624); border: 1px solid rgba(255,255,255,.14); box-shadow: inset 0 0 10px rgba(0,0,0,.6); }
	.sb.up .sb-tile { border-color: rgba(214,170,92,.7); box-shadow: inset 0 0 10px rgba(0,0,0,.6), 0 0 8px rgba(214,170,92,.3); }
	.sb-tile img { width: 26px; height: 26px; object-fit: contain; }
	.sb-pips { display: flex; gap: 3px; height: 5px; }
	.sb-pips i { width: 11px; height: 5px; border-radius: 1px; background: rgba(255,255,255,.14); transform: skewX(-20deg); }
	.sb-pips i.on { background: var(--tc, #ef7d22); box-shadow: 0 0 5px var(--tc, #ef7d22); }
	.sp { flex: 1; }
	.lvup { padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,220,150,.7); background: linear-gradient(180deg, #e2a64a, #b8781f); color: #1a1206; font-size: .86rem; box-shadow: 0 0 14px rgba(226,166,74,.45); white-space: nowrap; }
	.ix { width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.05); color: #e5e7eb; cursor: pointer; flex: none; }
	.ix:hover { background: rgba(255,255,255,.14); }

	/* tree */
	.tree { position: relative; width: 1392px; flex: none; }
	.tier { position: absolute; left: 0; width: 80px; transform: translateY(-50%); font-size: .86rem; color: #cbb488; letter-spacing: .06em; }
	.tier em { display: block; font-style: normal; font-size: .62rem; color: #6f7b90; letter-spacing: .04em; }
	.conv { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.conv path { fill: none; stroke: rgba(180,130,240,.24); stroke-width: 2; stroke-dasharray: 4 4; }
	.conv path.lit { stroke: var(--c); stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 3px var(--c)); }
	.col { position: absolute; top: 0; border-radius: 12px; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 12%, transparent), transparent 85%); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); }
	.colh { position: absolute; left: 0; right: 0; top: 6px; display: flex; align-items: center; justify-content: center; gap: 7px; font-size: .8rem; letter-spacing: .12em; text-transform: uppercase; color: var(--c); }
	.colh i { width: 9px; height: 9px; border-radius: 50%; background: var(--c); }
	.colh b { font-weight: normal; font-size: .64rem; padding: 0 8px; border-radius: 999px; background: var(--c); color: #fff; letter-spacing: .02em; text-transform: none; }
	.col svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.col path { fill: none; stroke: rgba(255,255,255,.14); stroke-width: 2; stroke-dasharray: 4 4; }
	.col path.open { stroke: color-mix(in srgb, var(--c) 60%, transparent); }
	.col path.lit { stroke: var(--c); stroke-width: 3; stroke-dasharray: none; filter: drop-shadow(0 0 3px var(--c)); }
	.tb { position: absolute; transform: translate(-50%, -50%); width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: .78rem; background: #0c0f16; border: 2px solid #4a4f5c; color: #8b93a6; z-index: 1; }
	.tb.lit { border-color: #d9b25e; color: #fff1c9; box-shadow: 0 0 10px rgba(217,178,94,.55); }
	.nd { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 2; transition: transform .12s; }
	.nd-card { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
	.nd-card :global(canvas) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 5px 14px rgba(0,0,0,.6); }
	.nd:hover { transform: translateY(-3px); z-index: 3; }
	.nd-foot { height: 30px; display: flex; align-items: center; }
	.pill { display: inline-flex; align-items: center; gap: 4px; font-size: .64rem; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
	.pill img { width: 17px; height: 13px; object-fit: contain; }
	.pill.cur { background: #d9b25e; color: #1a1206; }
	.pill.past { background: rgba(150,160,175,.22); color: #9aa6b8; }
	.pill.item { background: #3f7fe0; color: #fff; }
	.take { padding: 5px 26px; border-radius: 8px; border: none; background: var(--c); color: #fff; font-size: .82rem; cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
	.take:hover { filter: brightness(1.12); }
	.nd.cur { transform: scale(1.05); }
	.nd.cur :global(canvas) { box-shadow: 0 0 0 2px #d9b25e, 0 0 16px color-mix(in srgb, var(--c) 70%, transparent), 0 6px 14px rgba(0,0,0,.6); }
	.nd.next :global(canvas) { box-shadow: 0 0 0 2px var(--c), 0 0 14px var(--c); }
	.nd.item :global(canvas) { filter: saturate(.45) brightness(.55); box-shadow: 0 0 0 1px #3f7fe0; }
	.nd.past :global(canvas) { filter: grayscale(1) brightness(.4); }
	.nd.far :global(canvas) { filter: grayscale(.75) brightness(.32); }
	.nd.sel :global(canvas) { filter: none; box-shadow: 0 0 0 3px #fff, 0 0 26px var(--c); }

	/* side panel */
	.side { position: absolute; top: 0; display: flex; flex-direction: column; gap: 8px; padding: 10px; box-sizing: border-box; border-radius: 12px; background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.08); }
	.sec { display: flex; align-items: baseline; justify-content: space-between; font-size: .68rem; letter-spacing: .12em; text-transform: uppercase; color: #cbd5e1; }
	.sec em { font-style: normal; font-size: .58rem; letter-spacing: .04em; text-transform: none; color: #7c8aa0; }
	.sec.u { color: #d7c4f5; }
	.basics { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.bc { padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
	.bc :global(canvas) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 0 0 2px var(--c), 0 5px 14px rgba(0,0,0,.6); }
	.bc.sel :global(canvas) { box-shadow: 0 0 0 3px #fff, 0 0 18px var(--c); }
	.items { display: flex; flex-direction: column; gap: 4px; }
	.it { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 8px 0 4px; border-radius: 7px; border: 1px solid rgba(63,127,224,.35); background: rgba(63,127,224,.1); color: inherit; cursor: pointer; text-align: left; box-shadow: inset 3px 0 0 var(--c, #3f7fe0); }
	.it.sel { border-color: #fff; }
	.it.empty { cursor: default; justify-content: center; font-size: .58rem; color: #4d5a70; border-style: dashed; border-color: rgba(255,255,255,.1); background: none; box-shadow: none; }
	.it-ic { width: 26px; height: 22px; flex: none; display: grid; place-items: center; border-radius: 5px; background: #3f7fe0; }
	.it-ic img { width: 20px; height: 15px; object-fit: contain; }
	.it-t { min-width: 0; display: flex; flex-direction: column; line-height: 1.1; }
	.it-t b { font-weight: normal; font-size: .76rem; color: #fff; }
	.it-t em { font-style: normal; font-size: .58rem; color: #93a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ultp { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; background: linear-gradient(180deg, rgba(120,60,190,.28), rgba(40,20,70,.4)); border: 1px solid rgba(165,110,230,.55); }
	.ultp .sec { align-self: stretch; }
	.ultp.on { border-color: rgba(210,175,255,.9); box-shadow: 0 0 22px rgba(165,110,230,.5); }
	.uc { width: 118px; padding: 0; border: none; background: none; cursor: zoom-in; }
	.uc :global(canvas) { display: block; width: 100%; border-radius: 6px; filter: grayscale(.75) brightness(.5); box-shadow: 0 0 0 2px rgba(180,130,240,.6); }
	.ultp.on .uc :global(canvas) { filter: none; box-shadow: 0 0 0 2px #b482f0, 0 0 14px rgba(165,110,230,.7); }
	.ut { display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: .66rem; color: #b9a7d6; }
	.ut em { font-style: normal; color: #fff; }
	.ubtn { padding: 6px 16px; border-radius: 8px; border: 1px solid rgba(210,175,255,.8); background: linear-gradient(180deg, #9a5ce6, #5b2aa0); color: #fff; cursor: pointer; font-size: .8rem; }
	.ubtn.ghost { background: transparent; color: #d7c4f5; }
	.seg { display: inline-flex; align-items: center; gap: 2px; }
	.seg i { width: 18px; height: 9px; background: rgba(255,255,255,.12); transform: skewX(-18deg); border-radius: 1px; }
	.seg i.on { background: linear-gradient(180deg, #d4a8ff, #8a4fd6); box-shadow: 0 0 5px rgba(180,130,240,.8); }
	.seg b { font-weight: normal; margin-left: 6px; font-size: .62rem; color: #d7c4f5; }

	/* action bar */
	.abar { margin-top: auto; flex: none; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; border: 1px solid rgba(199,154,78,.4); background: rgba(8,12,20,.9); }
	.asel { margin-right: auto; font-size: .82rem; color: #f0dcae; display: flex; flex-direction: column; min-width: 0; }
	.asel b { font-weight: normal; color: #fff; }
	.asel em { font-style: normal; font-size: .64rem; color: #93a3b8; }
	.asel.idle { flex-direction: row; gap: 4px; color: #7c8aa0; font-size: .78rem; }
	.a { padding: 8px 12px; border-radius: 9px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; font-size: .8rem; display: flex; align-items: center; gap: 6px; white-space: nowrap; cursor: pointer; }
	.a:hover { filter: brightness(1.15); }
	.a.hand { background: var(--tc, #ef7d22); border-color: transparent; color: #fff; }
	.a.rem { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.a.deck { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.65); color: #f0dcae; }
	.a.ghost { background: transparent; }
	kbd { font-family: inherit; font-size: .58rem; padding: 0 4px; border-radius: 4px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.25); }
</style>
