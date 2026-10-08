<script lang="ts">
	// The phone's deck (2.0, the Ascension on a phone): one full screen, no scrolling.
	// Head: your token · level steps (the next one carries its price) · coins · ✕.
	// Tabs: HAND (basics · the card you hold in each colour — it follows your level-ups · the ultimate, whose rim
	// glows once the trees are done, pulses when it can be bought and turns purple once it's on) · RED · BLUE ·
	// GREEN (that colour's tree: Tier III pair, Tier II pair, Tier I, a brass conduit up the middle lit as far
	// as you've climbed) · REMOVED. A brass dot marks a colour with a pick to take.
	// Cards look as on the desktop: in hand = lit + pill · item = upside down with a +1 bubble in the tree's
	// colour (a fresh one flips into place) · removed = grey + pill · an option = its +1 pill in the tree's
	// colour, or brass Take. Tap = select (the bar below shows Read + only the legal moves), tap again = read.
	// Rules: cardstate, exactly as the desktop deck (Take / Swap open the level-up confirm via onAsk).
	import { onMount } from 'svelte';
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { heroSplash } from '$lib/heroes';
	import ultGear from '$lib/images/ult_gear.png';
	import {
		levelOf, levelCost, ultimateIndex, tierIn, canPick, canAfford, swapSource, twinOf, allowedMoves,
		type PlayerCardState, type CardZone
	} from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let levelPhase = false;
	export let teamStyle = '';
	export let tab: 'hand' | 'RED' | 'BLUE' | 'GREEN' | 'removed' = 'hand';
	export let onClose: () => void;
	export let onMove: (idx: number, to: CardZone) => void;
	export let onAsk: (kind: 'take' | 'swap', idx: number) => void;
	export let onRead: (idx: number) => void;

	const icons = import.meta.glob('../cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`../cards/images/${n}.png`] ?? '';
	const COLS = ['RED', 'BLUE', 'GREEN'] as const;
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green' };
	const ROM = ['I', 'II', 'III'];
	const ITEM: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Init', MOVEMENT: 'Move', RANGE: 'Range', AREA: 'Area' };

	$: H = cs.hero;
	$: cards = heroCards(H);
	$: find = (color: string, level?: number) =>
		cards.map((c, i) => ({ c, i })).filter((x) => x.c.color === color && !x.c.handicapped && (level == null || (x.c.level ?? 1) === level)).map((x) => x.i);
	$: ult = ultimateIndex(H);
	$: basics = [find('GOLD')[0], find('SILVER')[0]].filter((i) => i != null && i >= 0);
	$: LV = levelOf(cs);
	$: need = levelCost(LV);
	$: heldSet = new Set<number>([...cs.hand, ...cs.discard, ...cs.turns.filter((x): x is number => x != null), ...(cs.pending != null && cs.pending >= 0 ? [cs.pending] : [])]);
	$: state = (i: number) => (heldSet.has(i) ? 'cur' : cs.upgrade.includes(i) ? 'item' : cs.removed.includes(i) ? 'past' : canPick(cs, i) ? 'next' : 'far');
	$: tiers = COLS.map((c) => tierIn(cs, c));
	$: canTake = (i: number) => levelPhase && canAfford(cs) && canPick(cs, i);
	$: canSwap = (i: number) => levelPhase && swapSource(cs, i) != null;
	$: hot = (c: string) => [...find(c, 2), ...find(c, 3)].some((i) => canTake(i) || canSwap(i));
	$: heldOf = (c: string) => [...heldSet].filter((i) => cards[i]?.color === c).sort((a, b) => (cards[b]?.level ?? 1) - (cards[a]?.level ?? 1))[0];
	$: itemOf = (i: number) => cards[i]?.item ?? '';
	$: ultReady = ult >= 0 && allowedMoves(cs, ult).includes('hand');
	$: ultCharging = ult >= 0 && !cs.ultimate && !ultReady && tiers.every((t) => t >= 3);

	// a card that has just become an item flips into place
	let prevItems: Set<number> | null = null;
	let fresh = new Set<number>();
	$: watchItems(cs.upgrade);
	function watchItems(up: number[]) {
		const now = new Set(up);
		if (prevItems) {
			const nw = [...now].filter((i) => !prevItems!.has(i));
			if (nw.length) { fresh = new Set([...fresh, ...nw]); setTimeout(() => (fresh = new Set([...fresh].filter((i) => !nw.includes(i)))), 1200); }
		}
		prevItems = now;
	}

	let sel: number | null = null;
	function tap(i: number) { if (sel === i) onRead(i); else sel = i; }
	$: if (tab) sel = sel != null && visible(sel) ? sel : null;
	function visible(i: number) {
		const c = cards[i]?.color ?? '';
		if (tab === 'removed') return cs.removed.includes(i);
		if (tab === 'hand') return basics.includes(i) || i === ult || COLS.some((k) => heldOf(k) === i);
		return c === tab;
	}
	$: moves = (i: number): Array<[CardZone, string, string]> => {
		const ok = allowedMoves(cs, i);
		if (i === ult) return ok.includes('deck') ? [['deck', '↺ Undo', 'deck']] : [];
		return ([['hand', 'Hand', 'hand'], ['upgrade', 'Item', 'upg'], ['deck', 'Deck', 'deck'], ['removed', 'Remove', 'rem']] as Array<[CardZone, string, string]>).filter(([to]) => ok.includes(to));
	};

	// the gear's ring: red upper left, blue under, green upper right (lit at Tier III)
	const arc = (deg: number) => {
		const p = (a: number) => `${(44 * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(44 * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
		return `M${p(deg - 54)} A44 44 0 0 1 ${p(deg + 54)}`;
	};
	const ARCS = [arc(210), arc(90), arc(330)];
	// opened during the level-up step: go straight to a colour with a pick to make
	onMount(() => { if (levelPhase && tab === 'hand') { const c = COLS.find((k) => hot(k)); if (c) tab = c; } });

	// sizes follow the screen so a tab always fits without scrolling
	let vw = 390, vh = 800;
	const R = 1192 / 1664;
	$: body = vh - 56 - 46 - 62 - 20;
	$: TCW = Math.floor(Math.min((vw - 64 - 44 - 16) / 2, ((body - 3 * 26 - 2 * 8) / 3) * R));
	$: HCW = Math.floor(Math.min((vw - 32 - 20) / 3, ((body - 3 * 18 - 28 - 72 - 18) / 1.8) * R));
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={(e) => e.key === 'Escape' && (sel != null ? (sel = null) : onClose())} />

{#snippet face(i: number, w: number, foot: boolean)}
	{@const s = state(i)}
	{@const tw = twinOf(H, i)}
	<div class="cd {s}" class:can={s === 'next' && canTake(i)} class:sel={sel === i} class:fresh={fresh.has(i)} style="--c:{COL[cards[i]?.color] ?? '#888'}; width:{w}px">
		<button class="cb" on:click={() => tap(i)} aria-label={cards[i]?.name}>
			<span class="fc"><Card heroId={H} card={cards[i]} /></span>
			{#if s === 'item' && itemOf(i)}<span class="ib"><img src={ic(`item_${itemOf(i).toLowerCase()}`)} alt="" /><b>+1</b></span>{/if}
		</button>
		{#if foot}
			<span class="ft">
				{#if s === 'cur'}<span class="pill cur">In hand</span>
				{:else if s === 'past'}<span class="pill past">Removed</span>
				{:else if s === 'item' && canSwap(i)}<button class="pill swap" on:click={() => onAsk('swap', i)}>Swap</button>
				{:else if s === 'item'}<span class="pill item">Item</span>
				{:else if s === 'next' && canTake(i)}<button class="pill take" on:click={() => onAsk('take', i)}>Take{#if tw >= 0 && itemOf(tw)} · +1 <img src={ic(`item_${itemOf(tw).toLowerCase()}`)} alt="" />{/if}</button>
				{:else if tw >= 0 && itemOf(tw)}<span class="pill chip" class:dim={s === 'far'}>+1 <img src={ic(`item_${itemOf(tw).toLowerCase()}`)} alt="" />{ITEM[itemOf(tw)]}</span>{/if}
			</span>
		{/if}
	</div>
{/snippet}

<div class="pd tide" style={teamStyle} role="dialog" aria-label="Deck">
	<div class="hd">
		<span class="por"><img src={heroSplash(H)} alt="" /></span>
		<span class="lvb" aria-label="Level {LV}">
			{#each Array(8) as _, k (k)}<i class:got={k < LV || (k === 7 && cs.ultimate)} class:ul={k === 7} class:can={k === LV && cs.coins >= need}>{#if k === LV && LV < 8}<b>{need}</b>{/if}</i>{/each}
		</span>
		<span class="money">{cs.coins}</span>
		<button class="x" on:click={onClose} aria-label="Close">✕</button>
	</div>
	<div class="tabs" role="tablist">
		<button class="tb" class:on={tab === 'hand'} on:click={() => (tab = 'hand')}>Hand</button>
		{#each COLS as c (c)}<button class="tb col" class:on={tab === c} style="--c:{COL[c]}" on:click={() => (tab = c)}>{NAME[c]}{#if hot(c)}<i class="dot"></i>{/if}</button>{/each}
		<button class="tb" class:on={tab === 'removed'} on:click={() => (tab = 'removed')}>Removed<b>{cs.removed.length}</b></button>
	</div>

	<div class="body" role="presentation" on:click|self={() => (sel = null)}>
		{#if tab === 'hand'}
			<div class="sh"><span>Basics</span></div>
			<div class="row">{#each basics as i (i)}{@render face(i, Math.round(HCW * 0.8), false)}{/each}</div>
			<div class="sh"><span>Your colours</span></div>
			<div class="row">
				{#each COLS as c (c)}
					{@const h = heldOf(c)}
					<div class="slot" style="--c:{COL[c]}">
						{#if h != null}{@render face(h, HCW, false)}{:else}<span class="empty" style="width:{HCW}px"></span>{/if}
						<span class="pill tag">{NAME[c]} · {ROM[tiers[COLS.indexOf(c)] - 1]}</span>
					</div>
				{/each}
			</div>
			{#if ult >= 0}
				<div class="ult" class:on={cs.ultimate} class:rdy={ultReady} class:chg={ultCharging} class:sel={sel === ult}>
					<span class="ug"></span>
					<button class="uhit" on:click={() => tap(ult)} aria-label={cards[ult]?.name}></button>
					<span class="gear">
						<svg viewBox="-50 -50 100 100" aria-hidden="true">
							<circle r="44" class="gtrack" />
							{#each COLS as c, k}<path d={ARCS[k]} stroke="rgba(255,255,255,.14)" />{/each}
						</svg>
						{#each COLS as c, k}
							{#if tiers[k] >= 3 || cs.ultimate}
								<svg class="arcl" viewBox="-50 -50 100 100" style="--c:{cs.ultimate ? '#b482f0' : COL[c]}" aria-hidden="true"><path d={ARCS[k]} class="glow" /><path d={ARCS[k]} /></svg>
								<svg class="arcl fl" viewBox="-50 -50 100 100" aria-hidden="true"><path d={ARCS[k]} /></svg>
							{/if}
						{/each}
						<img src={ultGear} alt="" />
						<b class="iv" class:on={cs.ultimate}>IV</b>
						{#if cs.ultimate}<b class="iv glow">IV</b>{/if}
					</span>
					<span class="utx"><em>Ultimate · Level 8</em><b>{cards[ult]?.name}</b></span>
					{#if ultReady}<button class="ubtn" on:click={() => onAsk('take', ult)}>Unlock<span class="money sm">{need}</span></button>{/if}
				</div>
			{/if}
		{:else if tab === 'removed'}
			{#if cs.removed.length}
				<div class="grid">{#each cs.removed as i (i)}{@render face(i, HCW, true)}{/each}</div>
			{:else}<p class="none">No removed cards</p>{/if}
		{:else}
			{@const k = COLS.indexOf(tab)}
			{@const ch = Math.round(TCW / R)}
			<div class="tree" style="--c:{COL[tab]}; --f:{cs.ultimate ? '#b482f0' : COL[tab]}">
				<span class="pipe"></span>
				<span class="fill" style="height:{tiers[k] >= 3 ? 100 : tiers[k] === 2 ? 50 : 0}%"></span>
				{#each [3, 2, 1] as t (t)}
					<div class="tier" style="height:{ch + 26}px">
						<span class="tn">{ROM[t - 1]}</span>
						{#if t === 1}
							{#each find(tab, 1) as i (i)}{@render face(i, TCW, true)}{/each}
						{:else}
							{@const pair = find(tab, t)}
							{#if pair[0] != null}{@render face(pair[0], TCW, true)}{/if}
							<span class="valve" class:lit={tiers[k] >= t}><img src={ic(t === 3 ? 'level_iii' : 'level_ii')} alt="" /></span>
							{#if pair[1] != null}{@render face(pair[1], TCW, true)}{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="bar">
		{#if sel != null}
			<span class="sn">{cards[sel]?.name}</span>
			<button class="hb" on:click={() => sel != null && onRead(sel)}>Read</button>
			{#each moves(sel) as [to, lbl, cls] (to)}<button class="hb {cls}" on:click={() => { onMove(sel!, to); sel = null; }}>{lbl}</button>{/each}
		{:else}
			<span class="hint">Tap a card · tap again to read</span>
		{/if}
	</div>
</div>

<style>
	.pd { position: fixed; inset: 0; z-index: 38; display: flex; flex-direction: column; color: var(--ink); font-size: 14px; line-height: 1.2;
		background: radial-gradient(120% 70% at 50% 0%, #143a5c, #0a2238 50%, #04101e); padding-bottom: env(safe-area-inset-bottom); animation: in .18s ease-out; }
	@keyframes in { from { opacity: 0; } }
	button { font: inherit; color: inherit; cursor: pointer; }
	.hd { flex: none; height: 56px; display: flex; align-items: center; gap: 10px; padding: 0 12px; }
	.por { flex: none; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; box-shadow: 0 0 0 2px var(--tc, var(--brass)), 0 0 0 4px #030b15; }
	.por img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
	.lvb { flex: 1; display: flex; gap: 3px; height: 20px; align-items: center; }
	.lvb i { position: relative; flex: 1; height: 9px; border-radius: 3px; background: rgba(255, 255, 255, .1); }
	.lvb i.ul { background: rgba(165, 110, 230, .25); box-shadow: inset 0 0 0 1.5px #a56ee6; }
	.lvb i.got { background: linear-gradient(180deg, #fff3cf, var(--brass)); }
	.lvb i.got.ul { background: linear-gradient(180deg, #e3c8ff, #9a5ce6); }
	.lvb b { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: 18px; height: 18px; border-radius: 9px; font-weight: normal; font-size: 12px; line-height: 17px; text-align: center; color: var(--ink-3); background: #06182a; border: 1px solid var(--hair); box-sizing: border-box; }
	.lvb .can b { color: #3a2a10; background: linear-gradient(#f2d072, #c99a3e); }
	.money { flex: none; display: inline-flex; align-items: center; justify-content: center; min-width: 30px; height: 30px; box-sizing: border-box; padding: 0 6px; border-radius: 999px; background: linear-gradient(#f2d072, #c99a3e); color: #3a2a10; font-size: 16px; border: 1px solid rgba(0, 0, 0, .3); }
	.money.sm { min-width: 20px; height: 20px; font-size: 12px; padding: 0 4px; }
	.x { flex: none; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .05); }
	.tabs { flex: none; height: 46px; display: flex; gap: 5px; padding: 0 10px; align-items: center; }
	.tb { position: relative; flex: 1; height: 36px; padding: 0 4px; border-radius: 999px; font-size: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap;
		background: rgba(3, 11, 21, .6); border: 1px solid rgba(255, 255, 255, .14); color: var(--ink-2); }
	.tb.col { color: color-mix(in srgb, var(--c) 70%, #fff); }
	.tb.on { color: #2a1c06; background: linear-gradient(180deg, #f6e2ad, var(--brass)); border-color: #f9ebc6; }
	.tb.col.on { color: #fff; background: color-mix(in srgb, var(--c) 60%, #04101e); border-color: var(--c); }
	.tb b { font-weight: normal; font-size: 11px; opacity: .8; }
	.dot { position: absolute; top: 3px; right: 6px; width: 7px; height: 7px; border-radius: 50%; background: var(--brass-hi); box-shadow: 0 0 6px var(--brass-hi); }
	.body { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; padding: 6px 12px; gap: 6px; overflow: hidden; }
	.sh { align-self: stretch; height: 18px; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: var(--brass-hi); }
	.row { display: flex; gap: 10px; justify-content: center; align-items: flex-start; }
	.slot { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.empty { display: block; aspect-ratio: 1192 / 1664; border-radius: 6px; border: 1px dashed rgba(255, 255, 255, .2); }
	.cd { position: relative; display: flex; flex-direction: column; align-items: center; }
	.cb { position: relative; display: block; width: 100%; padding: 0; border: 0; background: none; border-radius: 6px; }
	.fc { display: block; border-radius: 6px; }
	.fc :global(.cardface) { display: block; width: 100%; border-radius: 6px; box-shadow: 0 0 0 1px #030b15, 0 5px 12px rgba(0, 0, 0, .55); transition: filter .4s; }
	.cd.cur .fc :global(.cardface) { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 16px color-mix(in srgb, var(--c) 75%, transparent); }
	.cd.can .fc :global(.cardface) { box-shadow: 0 0 0 2px #fff3cf, 0 0 14px rgba(244, 223, 168, .5); }
	.cd.item .fc { transform: rotate(180deg); }
	.cd.item .fc :global(.cardface) { filter: brightness(.5) saturate(.6); }
	.cd.past .fc :global(.cardface) { filter: grayscale(1) brightness(.42); }
	.cd.far .fc :global(.cardface) { filter: brightness(.55) saturate(.7); }
	.cd.sel .cb::before { content: ''; position: absolute; inset: -5px; border-radius: 9px; border: 2px solid #fff3cf; box-shadow: 0 0 12px rgba(244, 223, 168, .6); pointer-events: none; z-index: 1; }
	.ib { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; display: grid; place-items: center; pointer-events: none;
		background: radial-gradient(circle at 50% 32%, color-mix(in srgb, var(--c) 60%, transparent), color-mix(in srgb, var(--c) 30%, transparent) 75%); border: 2px solid color-mix(in srgb, var(--c) 80%, #fff); box-shadow: 0 0 12px color-mix(in srgb, var(--c) 55%, transparent); }
	.ib img { width: 26px; height: 22px; object-fit: contain; }
	.ib b { position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%); height: 16px; padding: 0 6px; border-radius: 8px; font-weight: normal; font-size: 12px; line-height: 16px; color: #fff; background: color-mix(in srgb, var(--c) 75%, #000); }
	.cd.fresh .fc { animation: flipin .9s cubic-bezier(.4, 0, .2, 1) both; }
	.cd.fresh .ib { animation: ibin .5s cubic-bezier(.2, 1.5, .4, 1) .55s both; }
	@keyframes flipin { from { transform: rotate(0deg); } to { transform: rotate(180deg); } }
	@keyframes ibin { from { transform: scale(0); opacity: 0; } }
	.ft { height: 26px; display: flex; align-items: center; }
	.pill { display: inline-flex; align-items: center; gap: 3px; height: 21px; padding: 0 9px; border-radius: 999px; font-size: 12px; line-height: 1; white-space: nowrap; border: 1px solid transparent; box-sizing: border-box; }
	.pill img { width: 16px; height: 12px; object-fit: contain; }
	.pill.cur { color: #2a1c06; background: linear-gradient(180deg, #f6e2ad, var(--brass)); }
	.pill.past { color: #b8c2cf; background: rgba(150, 160, 175, .2); border-color: rgba(150, 160, 175, .35); }
	.pill.item, .pill.tag { color: #fff; background: color-mix(in srgb, var(--c) 45%, transparent); border-color: color-mix(in srgb, var(--c) 80%, #fff); }
	.pill.chip { color: #fff; background: color-mix(in srgb, var(--c) 30%, rgba(3, 11, 21, .8)); border-color: color-mix(in srgb, var(--c) 70%, transparent); }
	.pill.chip.dim { opacity: .6; }
	.pill.take { height: 24px; color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad, var(--brass) 50%, #b98e42); border-color: #f9ebc6; }
	.pill.take img { filter: brightness(.22); }
	.pill.swap { height: 24px; color: #fff; background: color-mix(in srgb, var(--c) 40%, rgba(3, 11, 21, .9)); border-color: var(--c); }
	/* the ultimate */
	.ult { position: relative; align-self: stretch; height: 72px; margin-top: 4px; display: flex; align-items: center; gap: 12px; padding: 0 12px 0 8px; border-radius: 14px; box-sizing: border-box;
		background: linear-gradient(180deg, rgba(58, 30, 100, .92), rgba(22, 10, 44, .95)); border: 1.5px solid rgba(165, 110, 230, .45); }
	.uhit { position: absolute; inset: 0; padding: 0; border: 0; background: none; border-radius: inherit; }
	.ult.sel { border-color: #fff3cf; }
	.ug { position: absolute; inset: -3px; border-radius: 16px; pointer-events: none; opacity: 0; border: 2px solid #c79bff; box-shadow: 0 0 18px 3px rgba(170, 110, 240, .7); }
	.ult.chg .ug { animation: chg 2.8s ease-in-out infinite; }
	@keyframes chg { 0%, 100% { opacity: .15; } 50% { opacity: .55; } }
	.ult.rdy .ug { animation: rdy 1.1s ease-in-out infinite; }
	@keyframes rdy { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
	.ult.on { border: 3px solid #a56ee6; }
	.ult.on .ug { opacity: .5; }
	.gear { position: relative; flex: none; width: 58px; height: 58px; display: grid; place-items: center; pointer-events: none; }
	.gear svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.gtrack { fill: rgba(3, 8, 16, .7); stroke: rgba(255, 255, 255, .08); stroke-width: 9; }
	.gear path { fill: none; stroke-width: 9; stroke-linecap: round; }
	.arcl { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.arcl path { stroke: var(--c); }
	.arcl path.glow { stroke-width: 16; opacity: .35; }
	.arcl.fl path { stroke: #fff; stroke-width: 6; }
	.arcl.fl { opacity: 0; animation: arcfl 3.6s linear infinite; }
	@keyframes arcfl { 0%, 86% { opacity: 0; } 91% { opacity: 1; } 100% { opacity: 0; } }
	.iv { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; font-weight: normal; font-size: 17px; line-height: 1; color: #e9dcc0; text-shadow: 0 0 3px #000, 0 1px 2px #000; }
	.iv.on { color: #e9d4ff; text-shadow: 0 0 6px #a56ee6, 0 0 12px rgba(165, 110, 230, .8), 0 1px 2px #000; }
	.iv.glow { opacity: 0; color: #fff; text-shadow: 0 0 8px #c79bff, 0 0 18px #a56ee6; animation: arcfl 3.6s linear infinite; }
	.gear img { position: relative; width: 42px; height: 42px; border-radius: 50%; }
	.utx { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; pointer-events: none; }
	.utx em { font-style: normal; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #d4a8ff; }
	.utx b { font-weight: normal; font-size: 18px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ubtn { position: relative; flex: none; height: 30px; display: inline-flex; align-items: center; gap: 5px; padding: 0 12px; border-radius: 999px; font-size: 14px; color: #fff; background: linear-gradient(180deg, #b47cf0, #6a30b8); border: 1px solid #e3c8ff; }
	/* a colour's tree */
	.tree { position: relative; display: flex; flex-direction: column; gap: 8px; padding-left: 26px; }
	.pipe, .fill { position: absolute; left: calc(50% + 13px); width: 8px; margin-left: -4px; bottom: 30px; border-radius: 4px; pointer-events: none; }
	.pipe { top: 30px; background: #071726; box-shadow: 0 0 0 2.5px #c9a255, 0 0 0 4px #030b15; }
	.fill { max-height: calc(100% - 60px); background: var(--f); box-shadow: 0 0 10px var(--f); }
	.tier { position: relative; display: flex; align-items: flex-start; justify-content: center; gap: 22px; }
	.tn { position: absolute; left: -26px; top: 30%; font-size: 22px; color: var(--ink-3); }
	.valve { position: absolute; left: 50%; top: calc(50% - 13px); z-index: 2; width: 30px; height: 30px; margin: -15px 0 0 -15px; border-radius: 50%; display: grid; place-items: center;
		background: radial-gradient(circle at 50% 30%, #12304d, #040e1a 75%); border: 2px solid #8f7238; }
	.valve img { height: 12px; opacity: .45; }
	.valve.lit { border-color: var(--brass-hi); background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--c) 78%, #fff), color-mix(in srgb, var(--c) 62%, #000) 75%); box-shadow: 0 0 12px var(--c); }
	.valve.lit img { opacity: 1; }
	.grid { display: grid; grid-template-columns: repeat(3, auto); gap: 8px 10px; justify-content: center; }
	.none { margin: 40px 0 0; color: var(--ink-3); }
	/* the bar */
	.bar { flex: none; height: 62px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-top: 1px solid var(--brass-line); background: rgba(3, 11, 21, .7); }
	.sn { flex: 1; min-width: 0; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hint { flex: 1; text-align: center; font-size: 13px; color: var(--ink-3); }
	.hb { flex: none; height: 38px; padding: 0 12px; border-radius: 999px; font-size: 14px; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .05); }
	.hb.hand { color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad, var(--brass) 50%, #b98e42); border-color: #f9ebc6; }
	.hb.upg { background: rgba(26, 68, 104, .9); border-color: var(--brass-line); }
	.hb.rem { color: var(--danger-hi); border-color: rgba(229, 72, 77, .6); background: rgba(229, 72, 77, .1); }
	@media (prefers-reduced-motion: reduce) { .pd, .ug, .arcl.fl, .iv.glow, .cd.fresh .fc, .cd.fresh .ib { animation: none !important; } }
</style>
