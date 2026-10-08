<script lang="ts">
	// Desktop deck: THE ASCENSION (the user's pick, 2026-10-08).
	// Left: three colour trees rising from Tier I (bottom) through II to III. A brass conduit runs up the
	// middle of each tree, filled with the colour as far as that colour has climbed; once a colour is on
	// Tier III its beam runs on into the ULTIMATE BOX on top (red bends in from the left, blue rises into the
	// bottom, green bends in from the right) and lights that side of the box. One pulse of light rides every
	// lit conduit, all three in step (Web Animations on transform / opacity, one shared start time), and the
	// box side flashes as it lands. The box: the black ult gear ringed by a red / blue / green arc (each lit at
	// Tier III), the name, the card. Its rim GLOWS once the trees are done (level 7) but the coins aren't
	// there yet, PULSES when the ultimate can be bought (Unlock), and turns ult purple all round once it's on.
	// Card states: in hand = lit + "In hand" pill · item = turned upside down with a round +1 bubble in the
	// tree's translucent colour (a fresh item FLIPS into place) + "Item" pill · removed = greyed + "Removed"
	// pill · an option = its +1 item pill in the tree's colour, or brass Take when it can be taken now.
	// Right: the inspector — level steps, the hovered / selected card big, an info box under it (what it is,
	// where it stands, what taking it gives), your items, and the selected card's moves (H / U / D / R).
	// Rules: cardstate (levelUp / swapPick / allowedMoves) — the same as before; a round end locks picks.
	// The design is DH px tall and as wide as the window's shape (clamped), then scaled to fit.
	import { onMount } from 'svelte';
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import LevelConfirm from '$lib/LevelConfirm.svelte';
	import StatBubbles from '$lib/hud2/StatBubbles.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroSplash, HERO_BY_ID } from '$lib/heroes';
	import ultGear from '$lib/images/ult_gear.png';
	import {
		levelOf, levelCost, ultimateIndex, tierIn, canPick, canAfford, mustLevel, swapSource, twinOf, allowedMoves, pickedThisRound,
		type PlayerCardState, type CardZone
	} from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let teamStyle = '';
	export let player = '';
	/** the end-of-round level-up phase (after the minion battle) */
	export let levelPhase = false;
	export let onClose: () => void;
	export let onMove: (idx: number, to: CardZone) => void;
	export let onTake: (idx: number) => void;
	export let onSwap: (idx: number) => void;
	export let onPreview: (idx: number) => void;

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';

	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', GOLD: 'Gold', SILVER: 'Silver', PURPLE: 'Ultimate' };
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

	$: twin = (i: number) => twinOf(H, i);
	$: itemOf = (i: number) => cards[i]?.item ?? '';
	$: isTier = (i: number) => COLS.includes(cards[i]?.color as never);
	$: heldOf = (c: string) => [...heldSet].find((i) => cards[i]?.color === c);

	// a card that has just become an item flips over into place (the one you didn't pick)
	let prevItems: Set<number> | null = null;
	let fresh = new Set<number>();
	$: watchItems(cs.upgrade);
	function watchItems(up: number[]) {
		const now = new Set(up);
		if (prevItems) {
			const nw = [...now].filter((i) => !prevItems!.has(i));
			if (nw.length) {
				fresh = new Set([...fresh, ...nw]);
				setTimeout(() => (fresh = new Set([...fresh].filter((i) => !nw.includes(i)))), 1200);
			}
		}
		prevItems = now;
	}

	// hover (reading) beats selection (moving); nothing → your hero's card back
	let sel: number | null = null;
	let hov: number | null = null;
	$: focus = hov ?? sel;
	function over(i: number) { hov = i; }
	function out() { hov = null; }
	function act(fn: () => void) { fn(); sel = null; }
	function pick(i: number) { sel = sel === i ? null : i; }
	function bgClick(e: MouseEvent) { if (!(e.target as HTMLElement | null)?.closest?.('button')) { sel = null; hov = null; } }

	let confirm: { kind: 'take' | 'swap'; idx: number } | null = null;
	function ask(kind: 'take' | 'swap', idx: number) { confirm = { kind, idx }; sel = null; }
	function doConfirm() {
		if (!confirm) return;
		if (confirm.idx === ult) onMove(ult, 'hand');
		else (confirm.kind === 'take' ? onTake : onSwap)(confirm.idx);
		confirm = null; hov = null;
	}
	$: ultReady = ult >= 0 && allowedMoves(cs, ult).includes('hand');
	// the trees are done (level 7) but the coins aren't there yet: the rim starts to glow
	$: ultCharging = ult >= 0 && !cs.ultimate && !ultReady && t3done === 3;

	$: need = levelCost(LV);
	$: allII = tiers.every((t) => t >= 2);
	// what stops a card being taken, in a few words
	$: why = (i: number): string => {
		const c = cards[i];
		if (!c || !isTier(i)) return '';
		const t = c.level ?? 1;
		if (t === 3 && !allII) return 'All three colours to Tier II first';
		if (tierIn(cs, c.color) !== t - 1) return `${NAME[c.color]} Tier ${ROM[t - 2]} first`;
		if (cs.coins < need) return `Needs ${need} coins`;
		if (!levelPhase) return 'After the minion battle';
		return `${need} coins`;
	};
	// the info box: a pill for where the card stands and one short line about it
	$: info = (i: number): { pill: string; cls: string; note: string } => {
		const c = cards[i];
		if (!c) return { pill: '', cls: '', note: '' };
		if (c.color === 'GOLD' || c.color === 'SILVER') return { pill: 'Basic', cls: 'i-basic', note: 'Always in your hand' };
		if (i === ult) {
			if (cs.ultimate) return { pill: 'Active', cls: 'i-ult', note: picksHas(ult) ? 'Unlocked this round — you can still undo it' : 'A passive ability — locked in' };
			if (ultReady) return { pill: 'Ready', cls: 'i-ult', note: `Unlock it for ${need} coins` };
			return t3done < 3 ? { pill: 'Locked', cls: 'i-far', note: `Every colour to Tier III first (${t3done}/3)` } : { pill: 'Locked', cls: 'i-far', note: `Needs ${need} coins` };
		}
		const s = state(i);
		if (s === 'cur') return { pill: 'In hand', cls: 'i-hand', note: (c.level ?? 1) === 1 ? 'Your starting card' : pickedThisRound(cs, i) ? 'Taken this round — you can still change it' : 'Taken in an earlier round — locked in' };
		if (s === 'item') return { pill: 'Item', cls: 'i-item', note: canSwapNow(i) ? 'Swap to take this path instead' : `Your item: +1 ${ITEM_NAME[itemOf(i)] ?? ''}` };
		if (s === 'past') return { pill: 'Removed', cls: 'i-rem', note: allowedMoves(cs, i).includes('hand') ? 'Back to your hand undoes that level-up' : 'Replaced — locked in' };
		return { pill: canTakeNow(i) ? 'Take it' : 'Option', cls: canTakeNow(i) ? 'i-can' : 'i-far', note: why(i) };
	};
	const picksHas = (i: number) => (cs.roundPicks ?? []).includes(i);

	const MOVE_BTNS: Array<[CardZone, string, string, string]> = [['hand', 'Hand', 'H', 'hand'], ['upgrade', 'Item', 'U', 'upg'], ['deck', 'Deck', 'D', 'deck'], ['removed', 'Remove', 'R', 'rem']];
	$: moves = (i: number | null): Array<[CardZone, string, string, string]> => {
		if (i == null) return [];
		const ok = allowedMoves(cs, i);
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

	// ── design: DH tall, as wide as the window's shape allows, scaled to fit ──
	const DH = 900, PAD = 12, IGAP = 14;
	let vw = 1440, vh = 900;
	$: DW = Math.round(Math.min(1800, Math.max(1300, (DH * (vw - 24)) / Math.max(1, vh - 24))));
	$: scale = Math.min((vw - 24) / DW, (vh - 24) / DH, 2.2);
	$: INS = Math.round(Math.min(380, Math.max(330, DW * 0.23)));

	// ── the Ascension's geometry (design px inside the tree box) ──
	const R = 1192 / 1664, TH = DH - 2 * PAD;
	const LBL = 92; // the tier labels on the left
	const BY = 46, BH = 104; // the ultimate box
	const BAS = 72; // the basics strip at the bottom
	const FOOT = 32, GY = 8, MID = 36, SP = 6;
	$: TW = DW - 2 * PAD - INS - IGAP;
	$: AW = TW - LBL;
	$: COLW = AW / 3;
	$: BW = Math.round(Math.min(520, AW * 0.5));
	$: BX = LBL + AW / 2 - BW / 2;
	const BYm = BY + BH / 2;
	const RT = BY + BH + 24;
	$: RB = TH - BAS - 14;
	$: CW = Math.floor(Math.min((COLW - MID - 2 * SP) / 2, (R * (RB - RT - 3 * FOOT - 2 * GY)) / 3));
	$: CH = Math.round(CW / R);
	$: SLACK = Math.max(0, RB - RT - 3 * (CH + FOOT) - 2 * GY) / 3;
	$: Y3 = RT + SLACK / 2;
	$: Y2 = Y3 + CH + FOOT + GY + SLACK;
	$: Y1 = Y2 + CH + FOOT + GY + SLACK;
	$: V2 = Y2 + CH / 2;
	$: V3 = Y3 + CH / 2;
	$: rowY = [Y1, Y2, Y3];
	$: cx = (k: number) => Math.round(LBL + COLW * (k + 0.5));
	$: xOf = (k: number, r: number, a: number) => (r === 0 ? cx(k) - CW / 2 : a ? cx(k) + MID / 2 : cx(k) - MID / 2 - CW);
	const BEND = 22;
	// conduit k: up from Tier I into the box (the outer two bend in to its sides)
	$: pipe = (k: number) => {
		const x = cx(k), y0 = Y1 + 6;
		if (k === 1) return `M${x} ${y0} V${BY + BH}`;
		const s = k === 0 ? 1 : -1, end = k === 0 ? BX : BX + BW;
		return `M${x} ${y0} V${BYm + BEND} Q${x} ${BYm} ${x + s * BEND} ${BYm} H${end}`;
	};
	// …and how much of it this colour has filled: to Tier II, to Tier III, or all the way into the box
	$: litTo = (k: number) => (tiers[k] >= 3 ? 'box' : tiers[k] === 2 ? V2 : null);
	$: lit = (k: number) => { const to = litTo(k); return to === 'box' ? pipe(k) : `M${cx(k)} ${Y1 + 6} V${to ?? Y1 - 12}`; };

	// the pulse: the points of a lit conduit → transform keyframes (bottom → top → round the bend → into the box)
	type KF = { transform: string; opacity?: number; offset: number };
	function beadFrames(k: number): KF[] | null {
		const to = litTo(k);
		if (to == null) return null;
		const x = cx(k), y0 = Y1 + 6;
		const pts: Array<[number, number, number]> = [[x, y0, 0]];
		if (to !== 'box') pts.push([x, to, 0]);
		else if (k === 1) pts.push([x, BY + BH, 0]);
		else {
			const s = k === 0 ? 1 : -1, end = k === 0 ? BX : BX + BW;
			pts.push([x, BYm + BEND, 0]);
			// the bend, as a quarter circle
			for (let n = 1; n <= 6; n++) {
				const a = (n / 6) * (Math.PI / 2);
				pts.push([x + s * BEND * (1 - Math.cos(a)), BYm + BEND - BEND * Math.sin(a), s * 90 * (n / 6)]);
			}
			pts.push([end, BYm, s * 90]);
		}
		const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
		const total = seg.reduce((a, b) => a + b, 0) || 1;
		let run = 0;
		// it travels for 90% of the beat (landing as the box side flashes), fading in over its first 30 px
		const kf: KF[] = pts.map((p, i) => {
			if (i) run += seg[i - 1];
			return { transform: `translate(${p[0]}px, ${p[1]}px) rotate(${p[2]}deg)`, opacity: i ? 0.95 : 0, offset: Math.min(1, run / total) * 0.9 };
		});
		const f30 = Math.min(30, seg[0] / 2) / total * 0.9;
		kf.splice(1, 0, { transform: `translate(${x}px, ${y0 - Math.min(30, seg[0] / 2)}px) rotate(0deg)`, opacity: 0.95, offset: f30 });
		kf.push({ transform: kf[kf.length - 1].transform, opacity: 0, offset: 1 });
		return kf;
	}
	const PULSE = 3600;
	let still = false;
	onMount(() => { still = matchMedia('(prefers-reduced-motion: reduce)').matches; });
	// every pulse (and every box-side flash) shares one start time, so the three trees move in step
	function glide(node: Element, frames: Keyframe[] | null) {
		let a: Animation | null = null;
		const run = (f: Keyframe[] | null) => {
			a?.cancel(); a = null;
			if (!f || still || !node.animate) return;
			a = node.animate(f, { duration: PULSE, iterations: Infinity, easing: 'linear' });
			a.startTime = 0;
		};
		run(frames);
		return { update: run, destroy: () => a?.cancel() };
	}
	// level 8: every beam, pulse and curve turns ult purple
	const ULT = '#b482f0';
	$: beam = (c: string) => (cs.ultimate ? ULT : COL[c]);
	const FLASH: Keyframe[] = [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.86 }, { opacity: 1, offset: 0.91 }, { opacity: 0, offset: 1 }];

	// the gear's ring: one arc per colour, lit once that colour is on Tier III (red left, blue under, green right)
	const arc = (deg: number) => {
		const p = (a: number) => `${(44 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(44 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
		return `M${p(deg - 54)} A44 44 0 0 1 ${p(deg + 54)}`;
	};
	const ARCS = [arc(210), arc(90), arc(330)];
	const LVS = ['the start', 'levels 2–4', 'levels 5–7'];
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={onKey} />

{#snippet itemIcon(i: number)}<img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt="" />{/snippet}

{#snippet node(i: number, k: number, r: number, a: number)}
	{@const s = state(i)}
	{@const tw = twin(i)}
	{@const src = swapSource(cs, i)}
	{@const can = s === 'next' && canTakeNow(i)}
	<div class="nd {s}" class:can class:fresh={fresh.has(i)} class:sel={i === sel} class:foc={i === hov} style="--c:{COL[cards[i]?.color]}; left:{xOf(k, r, a)}px; top:{rowY[r]}px; width:{CW}px">
		<button class="nd-card" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i]?.name}>
			<span class="face"><Card heroId={H} card={cards[i]} /></span>
			{#if s === 'item' && itemOf(i)}<span class="ib">{@render itemIcon(i)}<b>+1</b></span>{/if}
		</button>
		<div class="nd-foot">
			{#if s === 'cur'}<span class="pill cur">In hand</span>
			{:else if s === 'past'}<span class="pill past">Removed</span>
			{:else if s === 'item' && canSwapNow(i) && src != null}
				<button class="pill swap" on:click={() => ask('swap', i)} on:pointerenter={() => over(i)} on:pointerleave={out}>Swap</button>
			{:else if s === 'item'}<span class="pill item">Item</span>
			{:else if can}
				<button class="pill take" on:click={() => ask('take', i)} on:pointerenter={() => over(i)} on:pointerleave={out}>Take{#if tw >= 0 && itemOf(tw)}<span class="tsep"></span>+1 {@render itemIcon(tw)}{/if}</button>
			{:else if tw >= 0 && itemOf(tw)}
				<span class="pill chip" class:dim={s === 'far'}>+1 {@render itemIcon(tw)}{ITEM_NAME[itemOf(tw)]}</span>
			{/if}
		</div>
	</div>
{/snippet}

<div class="dv-scrim" on:click={onClose} on:keydown={() => {}} role="presentation">
	<div class="dv tide" style="{teamStyle}; width:{DW}px; height:{DH}px; transform: translate(-50%, -50%) scale({scale})" on:click|stopPropagation={bgClick} on:keydown={() => {}} role="dialog" aria-modal="true" aria-label="Deck" tabindex="-1">
		<div class="tree" style="width:{TW}px; height:{TH}px">
			<div class="ttl"><b>The Ascension</b><em>{hero?.name ?? H}{hero?.title ? ` ${hero.title}` : ''} · your deck</em></div>
			<div class="rays">
				{#each COLS as c, k}<span class="ray t{tiers[k]}" style="--c:{COL[c]}; left:{cx(k)}px; width:{COLW * 1.4}px"></span>{/each}
			</div>
			<!-- tier labels -->
			{#each [2, 1, 0] as r (r)}
				<div class="tl" style="top:{rowY[r] + CH / 2}px; width:{LBL}px"><b>{ROM[r]}</b><span>Tier {ROM[r]}</span><em>{LVS[r]}</em></div>
			{/each}
			<svg class="pipes" width={TW} height={TH} aria-hidden="true">
				{#each COLS as c, k}
					{@const p = pipe(k)}
					<path d={p} class="p0" /><path d={p} class="p1" /><path d={p} class="p2" />
					<path d={lit(k)} class="lg" stroke={beam(c)} /><path d={lit(k)} class="lc" stroke={beam(c)} /><path d={lit(k)} class="lh" />
				{/each}
			</svg>
			{#each COLS as c, k}
				{@const t = tr[c]}
				<span class="bead" style="--c:{beam(c)}" use:glide={beadFrames(k)}></span>
				{#each [t.II, t.III] as pair, n}
					{#if pair.length && canTakeNow(pair[0])}<span class="halo" style="left:{cx(k) - MID / 2 - CW - 14}px; top:{rowY[n + 1] - 12}px; width:{2 * CW + MID + 28}px; height:{CH + 24}px"></span>{/if}
					<span class="valve" class:lit={tiers[k] >= n + 2} class:nx={pair.length > 0 && canPick(cs, pair[0])} style="--c:{COL[c]}; left:{cx(k)}px; top:{n ? V3 : V2}px"><img src={ic(n ? 'level_iii' : 'level_ii')} alt="" /></span>
				{/each}
				{#if t.I != null}{@render node(t.I, k, 0, 0)}{/if}
				<div class="cl" style="--c:{COL[c]}; left:{cx(k) + CW / 2 + 14}px; top:{Y1 + CH / 2}px"><b>{NAME[c]}</b><em>Tier {ROM[tiers[k] - 1]}</em></div>
				{#each t.II as i, a (i)}{@render node(i, k, 1, a)}{/each}
				{#each t.III as i, a (i)}{@render node(i, k, 2, a)}{/each}
			{/each}

			<!-- the ultimate box: fed by the three beams -->
			{#if ult >= 0}
				<div class="ubox" class:on={cs.ultimate} class:rdy={ultReady} class:chg={ultCharging} class:sel={sel === ult} style="left:{BX}px; top:{BY}px; width:{BW}px; height:{BH}px">
					<span class="ug"></span>
					<button class="uhit" on:click={() => pick(ult)} on:dblclick={() => onPreview(ult)} on:pointerenter={() => over(ult)} on:pointerleave={out} aria-label={cards[ult]?.name}></button>
					<span class="gear">
						<svg viewBox="-50 -50 100 100" aria-hidden="true">
							<circle r="44" class="gtrack" />
							{#each COLS as c, k}<path d={ARCS[k]} class="dim" />{/each}
						</svg>
						<!-- a colour on Tier III lights its curve; each pulse that lands makes it flare (all three at level 7, purple at 8) -->
						{#each COLS as c, k}
							{#if tiers[k] >= 3 || cs.ultimate}
								<svg class="arcl" viewBox="-50 -50 100 100" style="--c:{beam(c)}" aria-hidden="true"><path d={ARCS[k]} class="glow" /><path d={ARCS[k]} /></svg>
								<svg class="arcl fl" viewBox="-50 -50 100 100" style="--c:{beam(c)}" use:glide={FLASH} aria-hidden="true"><path d={ARCS[k]} class="glow" /><path d={ARCS[k]} class="hot" /></svg>
							{/if}
						{/each}
						<img src={ultGear} alt="" />
					</span>
					<span class="utx">
						<em>Ultimate · Level 8</em>
						<b>{cards[ult]?.name}</b>
						{#if ultReady}<button class="ubtn" on:click={() => ask('take', ult)}>Unlock<span class="money sm">{need}</span></button>{/if}
					</span>
					<span class="uc"><Card heroId={H} card={cards[ult]} /></span>
				</div>
			{/if}

			<!-- the basics -->
			<div class="bas" style="left:{LBL}px; width:{AW}px; top:{TH - BAS}px; height:{BAS}px">
				{#each basics as i (i)}
					<button class="bth" class:sel={i === sel} style="--c:{COL[cards[i].color]}" on:click={() => pick(i)} on:dblclick={() => onPreview(i)} on:pointerenter={() => over(i)} on:pointerleave={out} title={cards[i].name}><Card heroId={H} card={cards[i]} /></button>
				{/each}
				<span class="btx"><em>Basics</em><b>{basics.map((i) => cards[i]?.name).join(' · ')}</b><small>Always in your hand</small></span>
			</div>
		</div>

		<!-- the inspector -->
		<aside class="ins" style="width:{INS}px">
			<div class="ih">
				<div class="por"><img src={heroSplash(H)} alt="" /></div>
				<div class="hn"><b>{hero?.name ?? H}</b>{#if player}<em>{player}</em>{/if}</div>
				<span class="money" title="Coins">{cs.coins}</span>
				<button class="ix" on:click={onClose} aria-label="Close deck">✕</button>
			</div>
			<div class="lvrow">
				<span class="lvn">Level <b>{LV}</b></span>
				<div class="lvb" aria-label="Level {LV}">
					{#each Array(8) as _, k (k)}
						<i class:got={k < LV || (k === 7 && cs.ultimate)} class:ul={k === 7} class:nx={k === LV} class:can={k === LV && cs.coins >= need}>
							{#if k === LV && LV < 8}{#if forced || ultReady}<span class="lv-glow"></span>{/if}<b>{need}</b>{/if}
						</i>
					{/each}
				</div>
			</div>

			<div class="icard">
				{#if focus != null}
					<button class="icw" style="--c:{COL[cards[focus]?.color] ?? '#888'}" on:click={() => focus != null && onPreview(focus)} title="Full size"><Card heroId={H} card={cards[focus]} /></button>
				{:else}
					<div class="icw back"><CardBack hero={H} /></div>
				{/if}
			</div>

			<!-- the card in view: what it is, where it stands, what taking it gives -->
			<div class="iinfo" style="--c:{focus != null ? COL[cards[focus]?.color] ?? '#888' : '#c79a4e'}">
				{#if focus == null}
					<div class="in1"><b>{hero?.name ?? H}'s deck</b></div>
					<p class="nt">Hover a card to read it · click to move it</p>
				{:else}
					{@const f = info(focus)}
					{@const c = cards[focus]}
					<div class="in1"><b>{c?.name}</b><em>{NAME[c?.color ?? ''] ?? ''}{isTier(focus) ? ` · Tier ${ROM[(c?.level ?? 1) - 1]}` : ''}</em></div>
					<div class="in2"><span class="pill {f.cls}">{f.pill}</span><span class="nt">{f.note}</span></div>
					{#if isTier(focus) && (state(focus) === 'next' || state(focus) === 'far') && (c?.level ?? 1) > 1}
						{@const tw = twin(focus)}
						{@const older = heldOf(c?.color ?? '')}
						<ul class="gets">
							{#if tw >= 0 && itemOf(tw)}<li><i class="k it">Item</i>{@render itemIcon(tw)}+1 {ITEM_NAME[itemOf(tw)]}<small>from {cards[tw]?.name}</small></li>{/if}
							{#if older != null && older !== focus}<li><i class="k rm">Removed</i>{cards[older]?.name}</li>{/if}
						</ul>
					{:else if state(focus) === 'cur' && isTier(focus) && twin(focus) >= 0 && itemOf(twin(focus))}
						<ul class="gets"><li><i class="k it">Twin</i>{cards[twin(focus)]?.name}<small>your +1 {ITEM_NAME[itemOf(twin(focus))]}</small></li></ul>
					{/if}
				{/if}
			</div>

			<div class="gau" aria-label="Your items"><StatBubbles {cs} size={44} /></div>

			<div class="iact">
				{#if sel != null && moves(sel).length}
					{#each moves(sel) as [to, lbl, key, cls] (to)}
						<button class="a {cls}" on:click={() => act(() => onMove(sel!, to))}>{lbl} <kbd>{key}</kbd></button>
					{/each}
				{/if}
			</div>
		</aside>

		{#if confirm}
			<LevelConfirm {cs} idx={confirm.idx} kind={confirm.kind} {teamStyle} onConfirm={doConfirm} onCancel={() => (confirm = null)} />
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
	button { font: inherit; color: inherit; }

	/* ───────── the Ascension ───────── */
	.tree { position: relative; flex: none; }
	.ttl { position: absolute; left: 4px; top: 2px; display: flex; align-items: baseline; gap: 14px; white-space: nowrap; }
	.ttl b { font-weight: normal; font-size: 30px; line-height: 1; letter-spacing: .04em; color: var(--brass-hi); text-shadow: 0 2px 10px rgba(0, 0, 0, .6); }
	.ttl em { font-style: normal; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
	.rays { position: absolute; inset: 0; overflow: hidden; pointer-events: none; -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 92%, transparent); }
	.ray { --h: 44%; position: absolute; bottom: 0; height: 100%; transform: translateX(-50%); opacity: .45;
		background: radial-gradient(50% var(--h) at 50% 100%, color-mix(in srgb, var(--c) 70%, transparent), color-mix(in srgb, var(--c) 28%, transparent) 45%, transparent 100%); }
	.ray.t2 { --h: 70%; opacity: .55; }
	.ray.t3 { --h: 100%; opacity: .7; }
	.tl { position: absolute; left: 0; transform: translateY(-50%); display: flex; flex-direction: column; gap: 3px; padding-left: 8px; box-sizing: border-box; }
	.tl b { font-weight: normal; font-size: 34px; line-height: 1; color: var(--ink); }
	.tl span { font-size: 15px; letter-spacing: .08em; text-transform: uppercase; color: var(--brass-hi); }
	.tl em { font-style: normal; font-size: 12px; color: var(--ink-3); }
	.cl { position: absolute; transform: translateY(-50%); display: flex; flex-direction: column; gap: 4px; white-space: nowrap; }
	.cl b { font-weight: normal; font-size: 22px; line-height: 1; letter-spacing: .12em; text-transform: uppercase; color: var(--c); text-shadow: 0 0 16px color-mix(in srgb, var(--c) 50%, transparent); }
	.cl em { font-style: normal; font-size: 13px; color: var(--ink-3); }
	.pipes { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
	.pipes path { fill: none; }
	.p0 { stroke: #030b15; stroke-width: 15; stroke-linecap: round; }
	.p1 { stroke: #c9a255; stroke-width: 11; }
	.p2 { stroke: #071726; stroke-width: 7; }
	.lg { stroke-width: 15; stroke-linecap: round; opacity: .28; }
	.lc { stroke-width: 6; stroke-linecap: round; }
	.lh { stroke: #fff; stroke-opacity: .4; stroke-width: 1.2; stroke-linecap: round; }
	/* the pulse riding a lit conduit (moved by the Web Animations API: transform + opacity only) */
	.bead { position: absolute; left: 0; top: 0; z-index: 1; width: 8px; height: 30px; margin: -15px 0 0 -4px; border-radius: 4px; pointer-events: none; opacity: 0;
		background: linear-gradient(180deg, #fff, color-mix(in srgb, var(--c) 40%, #fff) 40%, transparent); box-shadow: 0 0 10px var(--c); }
	.valve { position: absolute; z-index: 4; width: 36px; height: 36px; margin: -18px 0 0 -18px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
		background: radial-gradient(circle at 50% 30%, #12304d, #040e1a 75%); border: 2px solid #8f7238; box-shadow: 0 0 0 2px #030b15; }
	.valve img { height: 15px; width: auto; opacity: .4; }
	.valve.nx { border-color: var(--brass-hi); }
	.valve.nx img { opacity: .85; }
	.valve.lit { border-color: var(--brass-hi); background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--c) 78%, #fff), color-mix(in srgb, var(--c) 62%, #000) 75%); box-shadow: 0 0 0 2px #030b15, 0 0 18px var(--c); }
	.valve.lit img { opacity: 1; }
	.halo { position: absolute; border-radius: 22px; pointer-events: none; background: radial-gradient(closest-side, rgba(244, 223, 168, .45), rgba(244, 223, 168, .14) 70%, transparent); animation: breathe 1.8s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }

	.nd { position: absolute; z-index: 2; transition: transform .14s ease-out; }
	.nd:hover, .nd.foc { transform: translateY(-3px); z-index: 3; }
	.nd-card { position: relative; display: block; width: 100%; padding: 0; border: none; background: none; border-radius: 7px; cursor: pointer; }
	.face { display: block; border-radius: 7px; }
	.face :global(.cardface) { display: block; width: 100%; border-radius: 7px; box-shadow: 0 0 0 1px #030b15, 0 8px 18px rgba(0, 0, 0, .55); transition: filter .4s; }
	.nd-foot { height: 32px; display: flex; align-items: center; justify-content: center; }
	.nd.cur .face :global(.cardface) { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 24px color-mix(in srgb, var(--c) 80%, transparent), 0 8px 18px rgba(0, 0, 0, .5); }
	/* an item is turned upside down, like on the table; its bubble says what it gives */
	.nd.item .face { transform: rotate(180deg); }
	.nd.item .face :global(.cardface) { filter: brightness(.5) saturate(.6); }
	.ib { position: absolute; left: 50%; top: 50%; width: 60px; height: 60px; margin: -30px 0 0 -30px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
		background: radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--c) 60%, transparent), color-mix(in srgb, var(--c) 30%, transparent) 75%);
		border: 2px solid color-mix(in srgb, var(--c) 80%, #fff); box-shadow: 0 0 0 2px rgba(3, 11, 21, .7), 0 0 18px color-mix(in srgb, var(--c) 55%, transparent); }
	.ib img { width: 36px; height: 30px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, .8)); }
	.ib b { position: absolute; left: 50%; bottom: -10px; transform: translateX(-50%); height: 19px; padding: 0 8px; border-radius: 10px; font-weight: normal; font-size: 14px; line-height: 19px; color: #fff;
		background: color-mix(in srgb, var(--c) 75%, #000); box-shadow: 0 0 0 1px rgba(255, 255, 255, .35); }
	/* the card you didn't pick flips over into its item */
	.nd.fresh .face { animation: flipin .9s cubic-bezier(.4, 0, .2, 1) both; }
	.nd.fresh .ib { animation: ibin .5s cubic-bezier(.2, 1.5, .4, 1) .55s both; }
	@keyframes flipin { from { transform: rotate(0deg); } to { transform: rotate(180deg); } }
	@keyframes ibin { from { transform: scale(0); opacity: 0; } }
	.nd.past .face :global(.cardface) { filter: grayscale(1) brightness(.42); }
	.nd.far .face :global(.cardface) { filter: brightness(.5) saturate(.7); }
	.nd.next .face :global(.cardface) { box-shadow: 0 0 0 1.5px var(--brass-line), 0 8px 18px rgba(0, 0, 0, .55); }
	.nd.can .face :global(.cardface) { box-shadow: 0 0 0 2px #fff3cf, 0 0 20px rgba(244, 223, 168, .5), 0 8px 18px rgba(0, 0, 0, .55); }
	.nd.foc:not(.past):not(.item) .face :global(.cardface), .nd.sel:not(.past):not(.item) .face :global(.cardface) { filter: none; }
	.nd.sel .nd-card::before { content: ''; position: absolute; inset: -7px; border-radius: 12px; border: 2px solid #fff3cf; box-shadow: 0 0 18px rgba(244, 223, 168, .7); pointer-events: none; }

	/* the pills under the cards (and in the info box) */
	.pill { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 12px; border-radius: 999px; font-size: 13px; line-height: 1; white-space: nowrap; border: 1px solid transparent; box-sizing: border-box; }
	.pill img { width: 20px; height: 15px; object-fit: contain; }
	.pill.cur { color: #2a1c06; background: linear-gradient(180deg, #f6e2ad, var(--brass)); }
	.pill.past { color: #b8c2cf; background: rgba(150, 160, 175, .2); border-color: rgba(150, 160, 175, .35); }
	.pill.item { color: #fff; background: color-mix(in srgb, var(--c) 45%, transparent); border-color: color-mix(in srgb, var(--c) 80%, #fff); }
	.pill.chip { color: #fff; background: color-mix(in srgb, var(--c) 30%, rgba(3, 11, 21, .8)); border-color: color-mix(in srgb, var(--c) 70%, transparent); }
	.pill.chip.dim { opacity: .6; }
	/* the info box's pills: one colour per state */
	.pill.i-hand { color: #fff; background: #1f8a45; border-color: #4fd884; }
	.pill.i-item { color: #fff; background: color-mix(in srgb, var(--c) 55%, #04101e); border-color: var(--c); }
	.pill.i-rem { color: #fff; background: #8e2a2a; border-color: #e5484d; }
	.pill.i-can { color: #2a1c06; background: linear-gradient(180deg, #fff3cf, var(--brass)); }
	.pill.i-far { color: var(--ink-2); background: rgba(255, 255, 255, .08); border-color: rgba(255, 255, 255, .2); }
	.pill.i-basic { color: #2a1c06; background: linear-gradient(180deg, #f6e2ad, #c9a050); }
	.pill.i-ult { color: #fff; background: linear-gradient(180deg, #a56ee6, #5b2aa0); }
	button.pill { cursor: pointer; transition: transform .12s; }
	button.pill:hover { transform: translateY(-1px); }
	.pill.take { height: 28px; padding: 0 14px; font-size: 15px; color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border-color: #f9ebc6 #c9a355 #8a6a2c;
		box-shadow: 0 4px 12px rgba(0, 0, 0, .45), 0 0 0 1px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .5); }
	.pill.take img { filter: brightness(.22); }
	.tsep { width: 1px; height: 14px; margin: 0 3px; background: rgba(27, 18, 4, .4); }
	.pill.swap { height: 28px; padding: 0 16px; font-size: 15px; color: #fff; background: color-mix(in srgb, var(--c) 40%, rgba(3, 11, 21, .9)); border-color: var(--c); box-shadow: 0 0 12px color-mix(in srgb, var(--c) 45%, transparent); }

	/* ───────── the ultimate box ───────── */
	.ubox { position: absolute; z-index: 3; box-sizing: border-box; display: flex; align-items: center; gap: 16px; padding: 0 14px 0 10px; border-radius: 16px;
		background: linear-gradient(180deg, rgba(58, 30, 100, .92), rgba(22, 10, 44, .95)); border: 1.5px solid rgba(165, 110, 230, .45); box-shadow: 0 10px 26px rgba(0, 0, 0, .55), inset 0 1px 0 rgba(255, 255, 255, .08); }
	.uhit { position: absolute; inset: 0; z-index: 0; padding: 0; border: 0; background: none; border-radius: inherit; cursor: pointer; }
	.ubox.sel { border-color: #fff3cf; }
	/* the rim: glows once the trees are done, pulses when it can be bought, turns ult purple once it's on */
	.ug { position: absolute; inset: -3px; border-radius: 18px; pointer-events: none; opacity: 0; border: 2px solid #c79bff; box-shadow: 0 0 22px 4px rgba(170, 110, 240, .7), inset 0 0 14px rgba(170, 110, 240, .45); }
	.ubox.chg .ug { animation: chg 2.8s ease-in-out infinite; }
	@keyframes chg { 0%, 100% { opacity: .15; } 50% { opacity: .55; } }
	.ubox.rdy .ug { animation: rdy 1.1s ease-in-out infinite; }
	@keyframes rdy { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
	.ubox.on { border: 3px solid #a56ee6; box-shadow: 0 0 26px rgba(165, 110, 230, .6), 0 10px 26px rgba(0, 0, 0, .55); }
	.ubox.on .ug { opacity: .5; }
	.gear { position: relative; flex: none; width: 88px; height: 88px; display: grid; place-items: center; pointer-events: none; }
	.gear svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.gtrack { fill: rgba(3, 8, 16, .7); stroke: rgba(255, 255, 255, .08); stroke-width: 9; }
	.gear path { fill: none; stroke-width: 8; stroke-linecap: round; }
	.gear path.dim { stroke: rgba(255, 255, 255, .14); }
	.arcl { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.arcl path { stroke: var(--c); }
	.arcl path.glow { stroke-width: 16; opacity: .35; }
	.arcl path.hot { stroke: #fff; stroke-width: 6; }
	.arcl.fl { opacity: 0; }
	.gear img { position: relative; width: 66px; height: 66px; border-radius: 50%; }
	.ubox:not(.on):not(.rdy) .gear img { filter: brightness(.75); }
	.utx { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; pointer-events: none; }
	.utx em { font-style: normal; font-size: 13px; letter-spacing: .16em; text-transform: uppercase; color: #d4a8ff; }
	.utx b { font-weight: normal; font-size: 26px; line-height: 1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ubtn { pointer-events: auto; align-self: flex-start; height: 28px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; border-radius: 999px; font-size: 15px; cursor: pointer;
		color: #fff; background: linear-gradient(180deg, #b47cf0, #6a30b8); border: 1px solid #e3c8ff; box-shadow: 0 0 14px rgba(170, 110, 240, .7); }
	.uc { position: relative; flex: none; width: 62px; pointer-events: none; }
	.uc :global(.cardface) { display: block; width: 100%; border-radius: 5px; box-shadow: 0 0 0 1px #030b15, 0 4px 10px rgba(0, 0, 0, .6); }
	.ubox:not(.on):not(.rdy) .uc :global(.cardface) { filter: grayscale(.6) brightness(.55); }

	/* the basics */
	.bas { position: absolute; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 0 14px; border-radius: 12px; background: rgba(3, 11, 21, .55); border: 1px solid var(--brass-line); }
	.bth { flex: none; width: 42px; padding: 0; border: 0; background: none; border-radius: 4px; cursor: pointer; position: relative; transition: transform .12s; }
	.bth:hover { transform: translateY(-2px); }
	.bth :global(.cardface) { display: block; width: 100%; border-radius: 4px; box-shadow: 0 0 0 1.5px var(--c), 0 3px 8px rgba(0, 0, 0, .6); }
	.bth.sel::before { content: ''; position: absolute; inset: -4px; border-radius: 7px; border: 2px solid #fff3cf; pointer-events: none; }
	.btx { display: flex; flex-direction: column; gap: 3px; margin-left: 8px; min-width: 0; }
	.btx em { font-style: normal; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--brass-hi); }
	.btx b { font-weight: normal; font-size: 16px; color: var(--ink); white-space: nowrap; }
	.btx small { font-size: 12px; color: var(--ink-3); }

	/* ───────── inspector ───────── */
	.ins { flex: none; min-height: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 10px; padding: 12px 13px;
		border-radius: 14px; background: linear-gradient(180deg, rgba(16, 46, 76, .72), rgba(4, 16, 30, .78)); border: 1px solid var(--brass-line); }
	.ih { flex: none; display: flex; align-items: center; gap: 10px; }
	.por { width: 46px; height: 46px; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 2px var(--tc, var(--brass)), 0 0 0 4px #030b15; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.hn { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.hn b { font-weight: normal; font-size: 24px; line-height: 1; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hn em { font-style: normal; font-size: 13px; color: var(--ink-3); }
	.money { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; box-sizing: border-box; padding: 0 7px; border-radius: 999px;
		background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: 19px; line-height: 1; font-variant-numeric: tabular-nums;
		border: 1px solid rgba(0, 0, 0, .3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .45); }
	.money.sm { min-width: 22px; height: 22px; padding: 0 5px; font-size: 14px; }
	.ix { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .04); color: var(--ink-2); cursor: pointer; }
	.ix:hover { border-color: rgba(255, 255, 255, .45); color: var(--ink); }
	.lvrow { flex: none; display: flex; align-items: center; gap: 10px; }
	.lvn { flex: none; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
	.lvn b { font-weight: normal; font-size: 18px; color: var(--brass-hi); }
	.lvb { flex: 1; display: flex; gap: 4px; height: 22px; align-items: center; }
	.lvb i { position: relative; flex: 1; height: 10px; border-radius: 3px; background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
	.lvb i.ul { background: rgba(165, 110, 230, .22); box-shadow: inset 0 0 0 1.5px #a56ee6; }
	.lvb i.got { background: linear-gradient(180deg, #fff3cf, var(--brass)); box-shadow: 0 0 6px rgba(244, 223, 168, .5); }
	.lvb i.got.ul { background: linear-gradient(180deg, #e3c8ff, #9a5ce6); box-shadow: 0 0 8px rgba(165, 110, 230, .8); }
	.lvb i.nx.can { background: rgba(216, 179, 106, .2); box-shadow: inset 0 0 0 1.5px var(--brass); }
	.lvb b { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 20px; height: 20px; box-sizing: border-box; padding: 0 4px; border-radius: 10px; font-weight: normal; font-size: 13px; line-height: 18px; text-align: center;
		color: var(--ink-3); background: #06182a; border: 1px solid var(--hair); }
	.lvb .can b { color: #3a2a10; background: linear-gradient(#f2d072, #c99a3e); border-color: rgba(0, 0, 0, .3); }
	.lv-glow { position: absolute; inset: -9px -5px; border-radius: 12px; background: radial-gradient(closest-side, rgba(244, 223, 168, .9), transparent); animation: breathe 1.6s ease-in-out infinite; }
	.ul .lv-glow { background: radial-gradient(closest-side, rgba(190, 140, 255, .95), transparent); }
	.icard { flex: 1; min-height: 0; display: flex; justify-content: center; align-items: center; }
	.icw { height: 100%; max-width: 100%; max-height: 100%; aspect-ratio: 1192 / 1664; padding: 0; border: none; background: none; cursor: zoom-in; }
	.icw :global(.cardface) { display: block; width: 100%; border-radius: 9px; box-shadow: 0 0 0 2px var(--c), 0 0 26px color-mix(in srgb, var(--c) 40%, transparent), 0 10px 26px rgba(0, 0, 0, .6); }
	.icw.back { cursor: default; overflow: hidden; border-radius: 9px; box-shadow: 0 10px 26px rgba(0, 0, 0, .6); }
	/* the info box under the card */
	.iinfo { flex: none; height: 94px; box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; gap: 6px; padding: 9px 12px; border-radius: 10px;
		background: rgba(3, 11, 21, .5); border: 1px solid rgba(255, 255, 255, .1); box-shadow: inset 3px 0 0 var(--c); }
	.in1 { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
	.in1 b { font-weight: normal; font-size: 20px; line-height: 1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.in1 em { flex: none; margin-left: auto; font-style: normal; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: color-mix(in srgb, var(--c) 70%, #fff); }
	.in2 { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.in2 .pill { flex: none; height: 22px; font-size: 12px; padding: 0 10px; }
	.nt { margin: 0; font-size: 13px; line-height: 1.25; color: var(--ink-2); min-width: 0; }
	.gets { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--ink); }
	.gets li { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
	.gets small { font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; }
	.gets img { width: 18px; height: 14px; object-fit: contain; }
	.k { flex: none; width: 64px; font-style: normal; font-size: 11px; text-align: center; padding: 2px 0; border-radius: 999px; letter-spacing: .06em; text-transform: uppercase; color: #fff; }
	.k.it { background: color-mix(in srgb, var(--c) 55%, transparent); }
	.k.rm { background: rgba(150, 160, 175, .25); color: #c6cfdb; }
	/* your items */
	.gau { flex: none; }
	/* the selected card's moves */
	.iact { flex: none; height: 34px; display: flex; align-items: center; justify-content: center; gap: 6px; }
	.a { flex: 1; height: 34px; padding: 0 6px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .03); color: var(--ink-2); font-size: 16px; line-height: 1; display: flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; cursor: pointer; transition: transform .12s; }
	.a:hover { transform: translateY(-1px); }
	.a.hand { color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border-color: #f9ebc6 #c9a355 #8a6a2c; }
	.a.upg { color: var(--ink); background: linear-gradient(180deg, rgba(26, 68, 104, .9), rgba(13, 40, 66, .9)); border-color: var(--brass-line); }
	.a.rem { color: var(--danger-hi); background: rgba(229, 72, 77, .1); border-color: rgba(229, 72, 77, .6); }
	kbd { font-family: inherit; font-size: 12px; line-height: 1; padding: 2px 4px; border-radius: 4px; background: rgba(0, 0, 0, .28); border: 1px solid rgba(255, 255, 255, .22); color: var(--ink-2); }
	.a.hand kbd { color: var(--ink-dark); background: rgba(255, 255, 255, .25); border-color: rgba(0, 0, 0, .25); }

	@media (prefers-reduced-motion: reduce) {
		.dv, .halo, .lv-glow, .ug, .nd.fresh .face, .nd.fresh .ib { animation: none !important; }
		.bead { display: none; }
		.nd, .pill, .a { transition: none; }
	}
</style>
