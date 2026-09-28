<script lang="ts">
	// Desktop deck view. Left: the upgrade tree (three colour columns, Tier I → III
	// top to bottom) sized as large as the window allows. Right: an inspector that
	// shows the hovered / selected card big enough to read, what taking it gives
	// you, the actions, and the basics + Tier IV ultimate.
	// The design is DH px tall and as wide as the window's shape (clamped), then
	// scaled to fit, so every screen uses all of its space.
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

	// held this round = in hand, played, discarded or face down
	$: heldSet = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null), ...(cs.pending != null && cs.pending >= 0 ? [cs.pending] : [])]);
	$: zoneOf = (i: number): 'held' | 'upgrade' | 'removed' | null =>
		heldSet.has(i) ? 'held' : cs.upgrade.includes(i) ? 'upgrade' : cs.removed.includes(i) ? 'removed' : null;
	$: tierHeld = (c: string) => Math.max(1, ...[...heldSet].filter((i) => cards[i]?.color === c).map((i) => cards[i]?.level ?? 1));
	$: heldOf = (c: string) => [...heldSet].find((i) => cards[i]?.color === c);
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

	// the other card of the same colour + tier: taking one makes the other your item
	$: twinOf = (i: number) => { const c = cards[i]; if (!c || !COLS.includes(c.color as never) || (c.level ?? 1) < 2) return -1; return find(c.color, c.level ?? 1).find((x) => x !== i) ?? -1; };
	$: itemOf = (i: number) => cards[i]?.item ?? '';
	$: sub = (i: number) => { const c = cards[i]?.color; return c === 'GOLD' || c === 'SILVER' ? `${NAME[c]} basic` : c === 'PURPLE' ? 'Tier IV · Ultimate' : `${NAME[c]} · Tier ${ROM[(cards[i]?.level ?? 1) - 1]}`; };
	$: stateOf = (i: number) => { const c = cards[i]; if (!c || !COLS.includes(c.color as never)) return null; return state(i, c.color, c.level ?? 1); };

	// selection (for actions) + hover (for reading); the inspector shows hover first
	let sel: number | null = null;
	let hov: number | null = null;
	let last: number | null = null;
	$: selZone = sel == null ? null : zoneOf(sel);
	$: selState = sel == null ? null : stateOf(sel);
	$: firstNext = COLS.flatMap((c) => [...tr[c].II, ...tr[c].III]).find((i) => stateOf(i) === 'next');
	$: focus = hov ?? sel ?? last ?? firstNext ?? tr.RED?.I ?? 0;
	$: fState = stateOf(focus);
	$: fTwin = twinOf(focus);
	$: fOlder = cards[focus] && COLS.includes(cards[focus].color as never) ? heldOf(cards[focus].color) : undefined;
	function over(i: number) { hov = i; last = i; }
	function out() { hov = null; }
	function act(fn: () => void) { fn(); sel = null; }
	function toHand(i: number) { act(() => (selState === 'next' ? onTake(i) : onMove(i, 'hand'))); }
	function pick(i: number) { sel = sel === i ? null : i; last = i; }
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

	// design: DH tall, as wide as the window's shape allows, scaled to fit
	const DH = 900, PAD = 12, IGAP = 14;
	let vw = 1440, vh = 900;
	$: DW = Math.round(Math.min(1800, Math.max(1300, (DH * (vw - 24)) / Math.max(1, vh - 24))));
	$: scale = Math.min((vw - 24) / DW, (vh - 24) / DH, 2.2);
	// the inspector gives up some width on squarer screens so the tree keeps its size
	$: INS = Math.round(Math.min(360, Math.max(290, DW * 0.21)));

	// tree geometry (design px): three colour columns, each two cards wide
	const CGAP = 10, MID = 30, SP = 6, FOOT = 30, GY = 18, TH = DH - 2 * PAD;
	$: TW = DW - 2 * PAD - INS - IGAP;
	$: COLW = Math.floor((TW - 2 * CGAP) / 3);
	$: CW = Math.floor(Math.min((COLW - MID - 2 * SP) / 2, (((TH - 16 - 3 * FOOT - 2 * GY) / 3) * 1192) / 1664));
	$: CH = Math.round((CW * 1664) / 1192);
	$: ROW = CH + FOOT + GY;
	$: PT = Math.max(8, (TH - (3 * (CH + FOOT) + 2 * GY)) / 2);
	$: top = (r: number) => PT + r * ROW;
	$: xL = COLW / 2 - MID / 2 - CW / 2;
	$: xR = COLW / 2 + MID / 2 + CW / 2;
	$: xM = COLW / 2;
	$: colX = (k: number) => k * (COLW + CGAP);
	const elbow = (x1: number, y1: number, x2: number, y2: number) => { const my = (y1 + y2) / 2; return `M${x1} ${y1} V${my} H${x2} V${y2}`; };
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet itemChip(i: number, dim: boolean)}
	{#if itemOf(i)}<span class="ichip" class:dim title="Taking this card also gives you +1 {ITEM_NAME[itemOf(i)]} (from {cards[i]?.name})">+1<img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt="" />{ITEM_SHORT[itemOf(i)]}</span>{/if}
{/snippet}

{#snippet node(i: number, c: string, t: number, x: number, y: number)}
	{@const s = state(i, c, t)}
	{@const tw = twinOf(i)}
	<div class="nd {s}" class:sel={i === sel} class:foc={i === hov} style="left:{x - CW / 2}px; top:{y}px; width:{CW}px">
		<button class="nd-card" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i]?.name}><Card heroId={H} card={cards[i]} /></button>
		<div class="nd-foot">
			{#if s === 'cur'}<span class="pill cur">In hand</span>
			{:else if s === 'past'}<span class="pill past">Used</span>
			{:else if s === 'item'}<span class="pill item">{#if itemOf(i)}<img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt="" />{/if}Item +1 {ITEM_NAME[itemOf(i)] ?? ''}</span>
			{:else if s === 'next'}<button class="take" on:click={() => act(() => onTake(i))} on:pointerenter={() => over(i)} on:pointerleave={out}>Take</button>{#if tw >= 0}{@render itemChip(tw, false)}{/if}
			{:else if tw >= 0}{@render itemChip(tw, true)}
			{/if}
		</div>
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv" style="{teamStyle}; width:{DW}px; height:{DH}px; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<!-- the tree -->
		<div class="tree" style="width:{TW}px; height:{TH}px">
			{#each COLS as c, k}
				{@const L = tierHeld(c)}
				{@const t = tr[c]}
				{@const h = heldOf(c)}
				<div class="col" style="--c:{COL[c]}; left:{colX(k)}px; width:{COLW}px; height:{TH}px">
					<svg width={COLW} height={TH} aria-hidden="true">
						{#each t.II as ii, a}<path d={elbow(xL, top(0) + CH + FOOT - 6, a ? xR : xL, top(1))} class:lit={passed(ii)} class:open={L === 1 && nextTier === 2} />{/each}
						{#each t.II as ii, a}{#each t.III as iii, b}<path d={elbow(a ? xR : xL, top(1) + CH + FOOT - 6, b ? xR : xL, top(2))} class:lit={passed(ii) && passed(iii)} class:open={zoneOf(ii) === 'held' && nextTier === 3} />{/each}{/each}
					</svg>
					<!-- Tier I on the left, the colour's title + status beside it -->
					{#if t.I != null}{@render node(t.I, c, 1, xL, top(0))}{/if}
					<div class="colh" style="left:{xR - CW / 2}px; top:{top(0)}px; width:{CW}px; height:{CH}px">
						<b>{NAME[c]}</b>
						<span class="ct">Tier {ROM[L - 1]} in hand</span>
						{#if h != null}<span class="cn">{cards[h]?.name}</span>{/if}
						{#if canPick && L + 1 === nextTier}<span class="cnext">Level {LV + 1}: take a Tier {ROM[nextTier - 1]}</span>
						{:else if L >= 3}<span class="cdone">Path complete</span>{/if}
					</div>
					{#each t.II as i, a (i)}{@render node(i, c, 2, a ? xR : xL, top(1))}{/each}
					<span class="tb" class:lit={L >= 2} style="left:{xM}px; top:{top(1) + CH / 2}px" title="Tier II · {LVS[1]}">II</span>
					{#each t.III as i, a (i)}{@render node(i, c, 3, a ? xR : xL, top(2))}{/each}
					<span class="tb" class:lit={L >= 3} style="left:{xM}px; top:{top(2) + CH / 2}px" title="Tier III · {LVS[2]}">III</span>
				</div>
			{/each}
		</div>

		<!-- inspector -->
		<aside class="ins" style="width:{INS}px">
			<div class="ih">
				<div class="por"><img src={heroSplash(H)} alt="" /></div>
				<div class="hn">{hero?.name ?? H}<em>{hero?.title ?? ''}</em></div>
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

			<div class="icard">
				<button class="icw" style="--c:{COL[cards[focus]?.color] ?? '#888'}" on:click={() => onPreview(focus)} title="Open full size">{#key `${H}:${focus}`}<Card heroId={H} card={cards[focus]} />{/key}</button>
			</div>

			<div class="iinfo" style="--c:{COL[cards[focus]?.color] ?? '#888'}">
				<div class="in1"><b>{cards[focus]?.name}</b><em>{sub(focus)}</em></div>
				{#if fState === 'next' || fState === 'far'}
					<ul class="gets" class:dim={fState === 'far'}>
						<li><i class="k">Hand</i>{cards[focus]?.name}</li>
						{#if fTwin >= 0 && itemOf(fTwin)}<li><i class="k it">Item</i><img src={ic(`item_${itemOf(fTwin).toLowerCase()}`)} alt="" />+1 {ITEM_NAME[itemOf(fTwin)]} <small>from {cards[fTwin]?.name}</small></li>{/if}
						{#if fOlder != null && fOlder !== focus}<li><i class="k rm">Removed</i>{cards[fOlder]?.name}</li>{/if}
					</ul>
					{#if fState === 'far'}<p class="note">Tier {ROM[(cards[focus]?.level ?? 1) - 1]} · {LVS[(cards[focus]?.level ?? 1) - 1]}{(cards[focus]?.level ?? 1) === 3 ? ', after a Tier II in this colour' : ''}</p>{/if}
				{:else if fState === 'cur'}<p class="note">In your hand this round.</p>
				{:else if fState === 'item'}<p class="note">Your item: <b>+1 {ITEM_NAME[itemOf(focus)] ?? ''}</b> — it sits under your hero board.</p>
				{:else if fState === 'past'}<p class="note">Removed — replaced by a higher tier.</p>
				{:else if focus === ult}<p class="note">Unlocks at level 8 with all three Tier III · {t3done} / 3</p>
				{:else}<p class="note">Basic card — always in your hand.</p>{/if}
			</div>

			<div class="iact">
				{#if sel != null}
					<div class="asel">Selected · <b>{cards[sel]?.name}</b></div>
					<div class="agrid">
						<button class="a" on:click={() => sel != null && onPreview(sel)}>Preview <kbd>Space</kbd></button>
						{#if selZone !== 'held'}<button class="a hand" on:click={() => sel != null && toHand(sel)}>{selState === 'next' ? 'Take' : '→ Hand'} <kbd>H</kbd></button>{/if}
						{#if selZone !== 'upgrade'}<button class="a" on:click={() => act(() => onMove(sel!, 'upgrade'))}>→ Upgrade <kbd>U</kbd></button>{/if}
						{#if selZone !== 'removed'}<button class="a rem" on:click={() => act(() => onMove(sel!, 'removed'))}>→ Removed <kbd>R</kbd></button>{/if}
						{#if selZone !== null}<button class="a deck" on:click={() => act(() => onMove(sel!, 'deck'))}>→ Deck <kbd>D</kbd></button>{/if}
						<button class="a ghost" on:click={() => (sel = null)}>Cancel <kbd>Esc</kbd></button>
					</div>
				{:else}
					<p class="hint">Hover a card to read it · click to move it · double-click for full size</p>
				{/if}
			</div>

			<div class="ibot">
				{#each basics as i (i)}
					<button class="th" class:sel={i === sel} style="--c:{COL[cards[i].color]}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i].name}><Card heroId={H} card={cards[i]} /></button>
				{/each}
				{#if ult >= 0}
					<div class="ultp" class:on={cs.ultimate}>
						<button class="th u" on:click={() => onPreview(ult)} on:pointerenter={() => over(ult)} on:pointerleave={out} title="Your ultimate"><Card heroId={H} card={cards[ult]} /></button>
						<div class="ut">
							<span class="uh">Tier IV</span>
							<span>{cs.ultimate ? 'Unlocked' : 'Needs 3 Tier III'}<br /><em>{t3done} / 3</em></span>
							<span class="seg">{#each Array(8) as _, k (k)}<i class:on={k < LV}></i>{/each}</span>
							{#if cs.ultimate}<button class="ubtn ghost" on:click={() => onUlt(false)}>Re-lock</button>
							{:else if t3done === 3}<button class="ubtn" on:click={() => onUlt(true)}>Unlock ★</button>{/if}
						</div>
					</div>
				{/if}
			</div>
		</aside>
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
	.colh { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; gap: 6px; padding: 0 4px 0 10px; }
	.colh b { font-weight: normal; font-size: 1.9rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; color: var(--c); text-shadow: 0 0 18px color-mix(in srgb, var(--c) 50%, transparent); }
	.colh .ct { font-size: .86rem; color: #e5e7eb; }
	.colh .cn { font-size: .78rem; color: #93a3b8; }
	.colh .cnext { align-self: flex-start; margin-top: 4px; padding: 4px 10px; border-radius: 8px; font-size: .78rem; color: #fff; background: color-mix(in srgb, var(--c) 40%, transparent); border: 1px solid var(--c); box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent); }
	.colh .cdone { align-self: flex-start; margin-top: 4px; font-size: .74rem; color: #d7c4f5; }
	.tb { position: absolute; transform: translate(-50%, -50%); width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: .76rem; background: #0c0f16; border: 2px solid #4a4f5c; color: #8b93a6; z-index: 1; }
	.tb.lit { border-color: #d9b25e; color: #fff1c9; box-shadow: 0 0 10px rgba(217,178,94,.55); }
	.nd { position: absolute; display: flex; flex-direction: column; align-items: center; z-index: 2; transition: transform .12s; }
	.nd-card { display: block; width: 100%; padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
	.nd-card :global(canvas) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 5px 14px rgba(0,0,0,.6); }
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
	.take { height: 24px; padding: 0 16px; border-radius: 7px; border: none; background: var(--c); color: #fff; font-size: .8rem; cursor: pointer; box-shadow: 0 2px 0 rgba(0,0,0,.4); }
	.take:hover { filter: brightness(1.12); }
	.nd.cur :global(canvas) { box-shadow: 0 0 0 2px #d9b25e, 0 0 16px color-mix(in srgb, var(--c) 70%, transparent), 0 6px 14px rgba(0,0,0,.6); }
	.nd.next :global(canvas) { box-shadow: 0 0 0 2px var(--c), 0 0 14px var(--c); }
	.nd.item :global(canvas) { filter: saturate(.45) brightness(.55); box-shadow: 0 0 0 1px #3f7fe0; }
	.nd.past :global(canvas) { filter: grayscale(1) brightness(.4); }
	.nd.far :global(canvas) { filter: grayscale(.5) brightness(.55); }
	.nd.foc :global(canvas) { filter: none; }
	.nd.sel :global(canvas) { filter: none; box-shadow: 0 0 0 3px #fff, 0 0 26px var(--c); }

	/* inspector */
	.ins { flex: none; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
	.ih { flex: none; display: flex; align-items: center; gap: 10px; }
	.por { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; border: 2px solid #c79a4e; flex: none; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.hn { flex: 1; min-width: 0; font-size: 1.15rem; color: #f6ead2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hn em { display: block; font-style: normal; font-size: .62rem; color: #8b93a6; }
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
	.icw :global(canvas) { display: block; width: 100%; border-radius: 8px; box-shadow: 0 0 0 2px var(--c), 0 0 22px color-mix(in srgb, var(--c) 45%, transparent), 0 10px 26px rgba(0,0,0,.6); }
	.iinfo { flex: none; min-height: 92px; display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); box-shadow: inset 3px 0 0 var(--c); }
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
	.note { margin: 0; font-size: .76rem; color: #93a3b8; }
	.note b { font-weight: normal; color: #fff; }
	.iact { flex: none; min-height: 84px; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
	.asel { font-size: .74rem; color: #f0dcae; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.asel b { font-weight: normal; color: #fff; }
	.agrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
	.a { height: 30px; padding: 0 6px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; font-size: .72rem; display: flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; cursor: pointer; }
	.a:hover { filter: brightness(1.15); }
	.a.hand { background: var(--tc, #ef7d22); border-color: transparent; color: #fff; }
	.a.rem { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.a.deck { background: rgba(199,154,78,.2); border-color: rgba(199,154,78,.65); color: #f0dcae; }
	.a.ghost { background: transparent; }
	kbd { font-family: inherit; font-size: .54rem; padding: 0 3px; border-radius: 4px; background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.25); }
	.hint { margin: 0; text-align: center; font-size: .74rem; line-height: 1.4; color: #7c8aa0; }
	/* basics + ultimate */
	.ibot { flex: none; display: flex; gap: 8px; align-items: stretch; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.08); }
	.th { width: 70px; flex: none; padding: 0; border: none; background: none; cursor: pointer; border-radius: 5px; }
	.th :global(canvas) { display: block; width: 100%; border-radius: 5px; box-shadow: 0 0 0 2px var(--c), 0 4px 10px rgba(0,0,0,.6); }
	.th.sel :global(canvas) { box-shadow: 0 0 0 3px #fff, 0 0 14px var(--c); }
	.ultp { flex: 1; min-width: 0; display: flex; gap: 8px; padding: 6px; border-radius: 10px; background: linear-gradient(180deg, rgba(120,60,190,.28), rgba(40,20,70,.4)); border: 1px solid rgba(165,110,230,.55); }
	.ultp.on { border-color: rgba(210,175,255,.9); box-shadow: 0 0 18px rgba(165,110,230,.5); }
	.th.u { width: 58px; cursor: zoom-in; }
	.th.u :global(canvas) { filter: grayscale(.75) brightness(.5); box-shadow: 0 0 0 2px rgba(180,130,240,.6); }
	.ultp.on .th.u :global(canvas) { filter: none; box-shadow: 0 0 0 2px #b482f0, 0 0 12px rgba(165,110,230,.7); }
	.ut { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; font-size: .64rem; line-height: 1.2; color: #b9a7d6; }
	.ut .uh { font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: #d7c4f5; }
	.ut em { font-style: normal; color: #fff; }
	.ubtn { align-self: flex-start; padding: 3px 10px; border-radius: 7px; border: 1px solid rgba(210,175,255,.8); background: linear-gradient(180deg, #9a5ce6, #5b2aa0); color: #fff; cursor: pointer; font-size: .7rem; }
	.ubtn.ghost { background: transparent; color: #d7c4f5; }
	.seg { display: inline-flex; align-items: center; gap: 2px; }
	.seg i { width: 9px; height: 7px; background: rgba(255,255,255,.12); transform: skewX(-18deg); border-radius: 1px; }
	.seg i.on { background: linear-gradient(180deg, #d4a8ff, #8a4fd6); box-shadow: 0 0 5px rgba(180,130,240,.8); }
</style>
