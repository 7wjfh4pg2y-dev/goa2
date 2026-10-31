<script lang="ts">
	// GM tools → CARDS: every hero's whole deck as its three colour trees, and a build you can change by tapping cards.
	// Tap a Tier II / III card to keep it (its twin becomes the item, the card below is replaced), tap a Tier I card to
	// go back down; the panel shows the level, the stat growth, the hand and a large preview. Maths in cardbuild.ts.
	// ?hero=id&path=3AA-2B-1&ult=1 (kept in the address, so a build can be sent as a link). GMs only (role.ts).
	import { onMount } from 'svelte';
	import { goBack } from '$lib/nav';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';
	import Card from '$lib/cards/Card.svelte';
	import StatBubbles from '$lib/hud2/StatBubbles.svelte';
	import { heroCards, heroStat } from '$lib/cards/deck';
	import { statDeltas } from '$lib/cards/cardstate';
	import { HEROES_ALPHA, heroAvatar, heroById } from '$lib/heroes';
	import { colourTree, basicCards, buildOf, choose, startPath, fullPath, pathCode, pathFromCode, type BuildPath, type Colour, type Side } from '$lib/cardbuild';

	const COLS: Colour[] = ['RED', 'BLUE', 'GREEN'];
	const COL_NAME: Record<Colour, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green' };
	const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Radius' };
	const ITEM_FILE: Record<string, string> = { ATTACK: 'attack', DEFENSE: 'defense', INITIATIVE: 'initiative', MOVEMENT: 'movement', RANGE: 'range', AREA: 'area' };
	const art = import.meta.glob('$lib/images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const statImg = (f: string) => Object.entries(art).find(([k]) => k.endsWith(`/${f}.png`))?.[1] ?? '';
	const ROLE_TAG = { hand: 'In hand', item: 'Item', replaced: 'Replaced', option: '' } as const;

	let heroId = 'arien';
	let path: BuildPath = startPath();
	let ult = false;
	let ready = false;
	let picker = false;
	let preview = -1;
	let pinned = -1;
	let copied = false;

	$: hero = heroById(heroId);
	$: cards = heroCards(heroId);
	$: trees = Object.fromEntries(COLS.map((c) => [c, colourTree(heroId, c)])) as Record<Colour, ReturnType<typeof colourTree>>;
	$: basics = basicCards(heroId);
	$: build = buildOf(heroId, path, ult);
	$: deltas = statDeltas(build.state);
	$: shown = preview >= 0 ? preview : pinned >= 0 ? pinned : build.hand[build.hand.length - 1] ?? -1;
	$: code = pathCode(path);
	$: base4 = [0, 1, 2, 3].map((i) => heroStat(heroId, i));

	// card size: as big as the tree area allows (3 rows tall; basics + 3 colours × 2 cards wide)
	let treeW = 0, treeH = 0;
	$: goldCols = Math.max(1, basics.golds.length);
	$: cw = Math.max(60, Math.floor(Math.min(((treeH - 44 - 3 * 30 - 2 * 10) / 3) * (1192 / 1664), (treeW - 3 * 22 - 7 * 10) / (6 + goldCols))));

	function pick(idx: number) { path = choose(path, heroId, idx); pinned = idx; }
	function setTier(col: Colour, t: 1 | 2 | 3) { path = { ...path, [col]: { ...path[col], tier: t } }; }
	function preset(k: 'start' | 'A' | 'B' | 'rand') {
		if (k === 'start') path = startPath();
		else if (k === 'rand') path = Object.fromEntries(COLS.map((c) => [c, { tier: 3, ii: (Math.random() < 0.5 ? 0 : 1) as Side, iii: (Math.random() < 0.5 ? 0 : 1) as Side }])) as BuildPath;
		else path = fullPath(k === 'A' ? 0 : 1);
		if (k === 'start') ult = false;
	}
	function setHero(id: string) { heroId = id; picker = false; preview = -1; pinned = -1; }
	async function copyLink() {
		try { await navigator.clipboard.writeText(location.href); copied = true; setTimeout(() => (copied = false), 1400); } catch { /* ignore */ }
	}
	function sync() {
		try { const q = new URL(location.href); q.searchParams.set('hero', heroId); q.searchParams.set('path', code); if (build.ultimate) q.searchParams.set('ult', '1'); else q.searchParams.delete('ult'); history.replaceState(history.state, '', q); } catch { /* ignore */ }
	}
	$: if (ready) { heroId; code; build.ultimate; sync(); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		const h = q.get('hero');
		if (h && HEROES_ALPHA.some((x) => x.id === h)) heroId = h;
		path = pathFromCode(q.get('path')) ?? startPath();
		ult = q.get('ult') === '1';
		ready = true;
	});
	function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && picker) picker = false; }
</script>

<svelte:head><title>GoA2 · Cards</title></svelte:head>
<svelte:window on:keydown={onKey} />

{#snippet cell(idx: number, kind: 'colour' | 'basic' | 'ult' = 'colour')}
	{@const r = kind === 'colour' ? build.role(idx) : kind === 'ult' ? (build.ultimate ? 'hand' : 'option') : 'hand'}
	{@const c = cards[idx]}
	{#if c}
		<button class="cc {r}" class:pin={pinned === idx} style="--cw:{cw}px" on:mouseenter={() => (preview = idx)} on:mouseleave={() => (preview = -1)} on:focus={() => (preview = idx)} on:blur={() => (preview = -1)}
			on:click={() => (kind === 'colour' ? pick(idx) : kind === 'ult' ? (build.canUltimate ? (ult = !ult, pinned = idx) : (pinned = idx)) : (pinned = idx))}
			title={c.name}>
			<span class="face"><Card heroId={heroId} card={c} /></span>
			<span class="lab">
				{#if r === 'item' && c.item}<img src={statImg(ITEM_FILE[c.item])} alt="" />+1 {ITEM_NAME[c.item]}
				{:else if kind === 'ult'}{build.ultimate ? 'Unlocked' : build.canUltimate ? 'Tap to unlock' : 'Needs Tier III ×3'}
				{:else}{ROLE_TAG[r]}{/if}
			</span>
		</button>
	{/if}
{/snippet}

{#if $role !== 'admin'}
	<div class="cg tide"><section class="panel lock"><h1 class="t-h1">Cards</h1><p class="t-body c-muted">GMs only.</p><button class="btn btn-ghost" on:click={() => goBack('adminhub')}><Icon name="back" /> Back</button></section></div>
{:else if ready && hero}
	<div class="cg tide">
		<header class="top">
			<button class="btn btn-ghost sm" on:click={() => goBack('adminhub')}><Icon name="back" /> Back</button>
			<h1>Cards</h1>
			<div class="hsel">
				<button class="hbtn" on:click={() => (picker = !picker)} aria-expanded={picker}>
					<img src={heroAvatar(heroId)} alt="" /><span class="hn">{hero.name}<small>{hero.title}</small></span><span class="chev">▾</span>
				</button>
				{#if picker}
					<div class="pop" role="dialog" aria-label="Pick a hero">
						{#each HEROES_ALPHA as h (h.id)}
							<button class="pf" class:on={h.id === heroId} on:click={() => setHero(h.id)} title="{h.name} {h.title}"><img src={heroAvatar(h.id)} alt="" /><span>{h.name}</span></button>
						{/each}
					</div>
				{/if}
			</div>
			<div class="presets">
				<span class="lbl">Build</span>
				<button class="chip" on:click={() => preset('start')}>Start</button>
				<button class="chip" on:click={() => preset('A')}>All A</button>
				<button class="chip" on:click={() => preset('B')}>All B</button>
				<button class="chip" on:click={() => preset('rand')}>Random</button>
			</div>
		</header>

		<main class="body">
			<section class="tree" bind:clientWidth={treeW} bind:clientHeight={treeH}>
				<div class="col basics" style="--n:{goldCols}">
					<div class="ch"><span class="cn">Basics</span></div>
					<div class="row r3">{#if basics.ultimate >= 0}{@render cell(basics.ultimate, 'ult')}{/if}</div>
					<div class="row r2">{#each basics.golds as g (g)}{@render cell(g, 'basic')}{/each}</div>
					<div class="row r1">{#if basics.silver >= 0}{@render cell(basics.silver, 'basic')}{/if}</div>
				</div>
				{#each COLS as col (col)}
					{@const t = trees[col]}
					<div class="col c-{col}">
						<div class="ch">
							<span class="cn">{COL_NAME[col]}</span>
							<span class="tiers" role="group" aria-label="{COL_NAME[col]} tier">
								{#each [1, 2, 3] as n (n)}<button class:on={path[col].tier === n} on:click={() => setTier(col, n as 1 | 2 | 3)}>{'I'.repeat(n)}</button>{/each}
							</span>
						</div>
						<div class="row r3"><span class="tl">III</span>{@render cell(t.t3[0])}{@render cell(t.t3[1])}</div>
						<div class="row r2"><span class="tl">II</span>{@render cell(t.t2[0])}{@render cell(t.t2[1])}</div>
						<div class="row r1"><span class="tl">I</span>{@render cell(t.t1)}</div>
					</div>
				{/each}
			</section>

			<aside class="side panel">
				<div class="lv">
					<span class="lvn">Level <b>{build.level}</b></span>
					<span class="pips">{#each Array(8) as _, i (i)}<i class:on={i < build.level} class:u={i === 7}></i>{/each}</span>
				</div>
				<div class="stats">
					<StatBubbles cs={build.state} size={38} />
					<div class="base">
						{#each ['Attack', 'Defense', 'Initiative', 'Movement'] as s, i (s)}
							{@const k = (['atk', 'def', 'init', 'move'] as const)[i]}
							<span><em>{s}</em><b>{base4[i] + (deltas[k] ?? 0)}</b>{#if deltas[k]}<small>+{deltas[k]}</small>{/if}</span>
						{/each}
						<span><em>Range</em><b>{deltas.range ? `+${deltas.range}` : '–'}</b></span>
						<span><em>Radius</em><b>{deltas.radius ? `+${deltas.radius}` : '–'}</b></span>
					</div>
				</div>
				<div class="pv">
					{#if shown >= 0 && cards[shown]}
						<div class="pvc"><Card heroId={heroId} card={cards[shown]} /></div>
					{/if}
				</div>
				<div class="hand">
					{#each build.hand as h (h)}<button class="hc" class:on={shown === h} on:mouseenter={() => (preview = h)} on:mouseleave={() => (preview = -1)} on:click={() => (pinned = h)} title={cards[h]?.name}><Card heroId={heroId} card={cards[h]} /></button>{/each}
				</div>
				<div class="code">
					<span class="lbl">Path</span><code>{code}{build.ultimate ? ' + Ult' : ''}</code>
					<button class="chip" on:click={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
				</div>
			</aside>
		</main>
	</div>
{/if}

<style>
	.cg { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); background: radial-gradient(120% 90% at 50% 0%, #0d2a44, #061424 60%, #030b15); }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 92vw); display: flex; flex-direction: column; gap: 12px; }
	.lock h1 { margin: 0; color: var(--brass-hi); }
	.lock .btn { align-self: flex-start; }

	.top { flex: none; height: 60px; display: flex; align-items: center; gap: 16px; padding: 0 16px; border-bottom: 1px solid var(--brass-faint); }
	.top h1 { margin: 0; font-size: 26px; color: var(--brass-hi); font-weight: normal; letter-spacing: .04em; }
	.btn.sm { min-height: 38px; height: 38px; padding: 0 12px; }
	.hsel { position: relative; }
	.hbtn { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px 0 4px; border-radius: 999px; border: 1px solid var(--brass-line); background: var(--well); color: var(--ink); cursor: pointer; }
	.hbtn img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 1px solid var(--brass); }
	.hn { display: flex; flex-direction: column; line-height: 1.05; text-align: left; font-size: 18px; }
	.hn small { font-size: 13px; color: var(--brass); }
	.chev { color: var(--brass); }
	.pop { position: absolute; top: 52px; left: 0; z-index: 20; display: grid; grid-template-columns: repeat(8, 76px); gap: 6px; padding: 12px; border-radius: 14px; border: 1px solid var(--brass-line); background: var(--glass); box-shadow: 0 18px 40px rgba(0,0,0,.5); }
	.pf { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border: 1px solid transparent; border-radius: 10px; background: none; color: var(--ink); cursor: pointer; font-size: 13px; }
	.pf img { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1px solid var(--hair); }
	.pf:hover { background: var(--raise); }
	.pf.on { border-color: var(--brass); }
	.pf.on img { border-color: var(--brass); }
	.presets { margin-left: auto; display: flex; align-items: center; gap: 6px; }
	.lbl { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--brass); margin-right: 4px; }
	.chip { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--brass-line); background: var(--raise); color: var(--ink); cursor: pointer; font-size: 15px; white-space: nowrap; }
	.chip:hover { border-color: var(--brass); }

	.body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 14px; padding: 14px 16px 16px; }
	.tree { min-width: 0; min-height: 0; display: flex; justify-content: center; gap: 22px; }
	.col { display: grid; grid-template-rows: 34px 1fr 1fr 1fr; gap: 10px; justify-items: center; align-items: center; }
	.ch { display: flex; align-items: center; gap: 10px; align-self: end; }
	.cn { font-size: 19px; letter-spacing: .06em; }
	.c-RED .cn { color: #ff8a7a; } .c-BLUE .cn { color: #8fbaff; } .c-GREEN .cn { color: #7fe09a; } .basics .cn { color: var(--brass-hi); }
	.tiers { display: inline-flex; border: 1px solid var(--hair); border-radius: 999px; overflow: hidden; }
	.tiers button { min-width: 34px; height: 26px; border: 0; background: none; color: var(--ink); opacity: .6; cursor: pointer; font-size: 14px; }
	.tiers button.on { background: var(--brass); color: var(--ink-dark); opacity: 1; }
	.row { position: relative; display: flex; gap: 10px; align-items: flex-start; }
	.tl { position: absolute; left: -22px; top: 30%; font-size: 13px; color: var(--brass); opacity: .7; letter-spacing: .06em; }
	.c-RED .tl, .c-BLUE .tl, .c-GREEN .tl { left: -24px; }

	.cc { width: var(--cw); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: 0; background: none; cursor: pointer; color: var(--ink); }
	.face { display: block; width: 100%; border-radius: 6%; transition: transform .25s ease, opacity .25s ease, filter .25s ease; box-shadow: 0 6px 16px rgba(0,0,0,.45); }
	.cc:hover .face { transform: translateY(-3px); }
	.cc.hand .face { box-shadow: 0 0 0 2px var(--brass), 0 0 18px rgba(216,179,106,.45), 0 6px 16px rgba(0,0,0,.45); }
	.cc.item .face { transform: rotate(180deg); opacity: .78; }
	.cc.item:hover .face { transform: rotate(180deg) translateY(3px); }
	.cc.replaced .face { opacity: .32; filter: grayscale(1); }
	.cc.option .face { opacity: .55; }
	.cc.pin .face { outline: 2px dashed rgba(244,223,168,.6); outline-offset: 3px; }
	.lab { height: 20px; display: flex; align-items: center; gap: 3px; font-size: min(13px, calc(var(--cw) * .088)); letter-spacing: .02em; white-space: nowrap; color: var(--brass-hi); max-width: 100%; overflow: hidden; }
	.cc.item .lab { color: #cfe3ff; }
	.cc.replaced .lab { color: rgba(245,241,232,.45); }
	.lab img { width: 15px; height: 15px; flex: none; }

	.side { min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; }
	.lv { display: flex; align-items: center; justify-content: space-between; }
	.lvn { font-size: 18px; color: var(--brass); }
	.lvn b { font-weight: normal; font-size: 30px; color: var(--brass-hi); margin-left: 4px; }
	.pips { display: flex; gap: 4px; }
	.pips i { width: 18px; height: 8px; border-radius: 3px; background: rgba(255,255,255,.12); }
	.pips i.on { background: var(--brass); }
	.pips i.u.on { background: #b07cff; }
	.stats { display: flex; flex-direction: column; gap: 8px; align-items: center; }
	.base { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; width: 100%; }
	.base span { display: flex; align-items: baseline; gap: 5px; font-size: 14px; }
	.base em { font-style: normal; color: rgba(245,241,232,.6); flex: 1; }
	.base b { font-weight: normal; font-size: 17px; }
	.base small { color: var(--brass-hi); font-size: 13px; }
	.pv { flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; }
	.pvc { height: 100cqh; max-width: 100cqw; aspect-ratio: 1192 / 1664; }
	.pvc :global(.card) { width: 100%; height: 100%; }
	.hand { display: flex; gap: 6px; justify-content: center; }
	.hc { width: 58px; padding: 0; border: 0; background: none; cursor: pointer; border-radius: 6%; opacity: .75; }
	.hc.on, .hc:hover { opacity: 1; box-shadow: 0 0 0 2px var(--brass); }
	.code { display: flex; align-items: center; gap: 8px; }
	.code code { flex: 1; font-family: inherit; font-size: 16px; color: var(--brass-hi); }

	/* phones: the panel on top, each colour as one row (I · II · III left to right), the page scrolls */
	@media (max-width: 760px) {
		.cg { overflow-y: auto; }
		.top { height: auto; flex-wrap: wrap; padding: 10px 12px; gap: 10px; }
		.top h1 { font-size: 22px; }
		.presets { margin-left: 0; width: 100%; }
		.pop { grid-template-columns: repeat(4, 72px); }
		.body { flex: none; display: flex; flex-direction: column-reverse; padding: 10px 12px 20px; }
		.tree { min-height: auto; }
		.tree { flex-direction: column; gap: 16px; }
		.col { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: auto; gap: 6px; justify-items: stretch; }
		.col > .ch { grid-column: 1 / -1; align-self: center; }
		.col > .row { display: contents; }
		.col > .row > .tl { display: none; }
		.row.r1 > .cc { order: 1; } .row.r2 > .cc { order: 2; } .row.r3 > .cc { order: 3; }
		.cc { width: 100% !important; }
		.lab { font-size: 10px; }
		.side { flex: none; }
		.pv { height: 300px; flex: none; }
	}
</style>
