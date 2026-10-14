<script lang="ts">
	// One hero's page (the user's pick, built from mock-up A): three areas —
	//  ┌──────────── stage ────────────┬── side ──┐   Overview: the painting with the hero's name, roles and stats ·
	//  │                               │          │   the card picked from the starting hand, large · the guide
	//  ├──────────────── strip ────────┴──────────┤   (overview, strengths, weaknesses, the starting hand side by
	//  └───────────────────────────────────────────┘   side, matchups).
	// Openings: the opening on the live island, turn by turn (either side of the board, or turned) · its four turns ·
	// every opening of the hero as a snapshot. No tier, win rate or pick rate (the user's call: nothing to sway a pick).
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import Card from '$lib/cards/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import OpeningBoard from '$lib/openings/OpeningBoard.svelte';
	import OpeningThumb from '$lib/openings/OpeningThumb.svelte';
	import { heroSplash, splashFace, heroLogo, statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, portraitCss, heroById, HEROES_ALPHA, type Trait } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { startingHand } from '$lib/cards/cardstate';
	import { onSide, turnCards, CARD_HEX, LANES, SIZES, MINION_PREFS, GUIDE_TAGS, type Opening, type HeroGuide, type Side } from '$lib/openings';
	import { guideFor } from './guide';
	import type { HeroMatchups, Matchup } from '$lib/hallstats';
	import type { HeroAgg } from '$lib/league';
	import { globalOf, globalWin, sharePct, GLOBAL_AS_OF, GLOBAL_TAG, type GlobalVs } from '$lib/globalstats';

	export let heroId: string;
	export let openings: Opening[] = [];
	export let guide: HeroGuide | null = null;
	export let status: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
	export let gm = false;
	export let tab: 'overview' | 'openings' = 'overview';
	export let onHero: (id: string) => void = () => {};
	/** matchups from the game records (null = none yet → the guide's hand-written lists) */
	export let record: HeroMatchups | null = null;
	type MuRow = { label: string; faces: { id: string; tip: string }[] };
	const tipOf = (m: Matchup, with_: boolean) => `${heroById(m.hero)?.name ?? m.hero} — ${m.wins}–${m.games - m.wins} ${with_ ? 'together' : 'against'}`;
	$: muFromData = !!record && (record.strong.length + record.weak.length + record.partners.length) > 0;
	/** our own record of this hero (the Hall's Total), for the Local side of the stats panel */
	export let local: HeroAgg | null = null;
	// ONE switch for the stats panel and Matchups: Local (our games, else the guide's lists) | Global (globalstats.ts)
	let srcPick: 'local' | 'global' | '' = '';
	$: gl = globalOf(h.id);
	$: hasLocal = !!local && local.games > 0;
	$: src = !gl ? 'local' : srcPick || (hasLocal || muFromData ? 'local' : 'global');
	$: muSrc = src;
	type StatView = { wr: number | null; impact: number | null; ci: [number, number, number] | null; won: number[] };
	$: view = (src === 'global' && gl
		? { wr: globalWin(gl), impact: gl.impact, ci: gl.ate, won: gl.won }
		: { wr: hasLocal && local ? (100 * local.wins) / local.games : null, impact: local?.impact ?? null, ci: null, won: local ? [local.byType.throne.wins, local.byType.final.wins, local.byType.life.wins] : [0, 0, 0] }) as StatView;
	const glTip = (v: GlobalVs) => `${heroById(v[0])?.name ?? v[0]} — ${v[1]}% win rate (global)`;
	$: muRows = (muSrc === 'global' && gl
		? [['Strong against', gl.beats], ['Struggles against', gl.countered], ['Best with', gl.mates]].map(([label, vs]) => ({ label, faces: (vs as GlobalVs[]).map((v) => ({ id: v[0], tip: glTip(v) })) }))
		: muFromData && record
		? [['Strong against', record.strong, false], ['Struggles against', record.weak, false], ['Best with', record.partners, true]].map(([label, ms, w]) => ({ label, faces: (ms as Matchup[]).map((m) => ({ id: m.hero, tip: tipOf(m, w as boolean) })) }))
		: [['Strong against', g.strong], ['Struggles against', g.weak], ['Best with', g.partners]].map(([label, ids]) => ({ label, faces: (ids as string[]).map((id) => ({ id, tip: heroById(id)?.name ?? id })) }))
	).filter((r) => r.faces.length) as MuRow[];

	$: h = heroById(heroId) ?? HEROES_ALPHA[0];
	$: face = splashFace(h.id);
	$: cards = heroCards(h.id);
	$: hand = startingHand(h.id);
	$: g = guideFor(h.id, guide);
	let preview: number | null = null;
	let lastHero = '';
	$: if (h.id !== lastHero) { lastHero = h.id; preview = null; selId = ''; }
	$: shownCard = preview ?? hand[0] ?? null;

	// ── openings ──
	let side: Side = 'blue';
	let turned = false;
	let selId = '';
	let step = 1;
	try { const s = localStorage.getItem('goa2-op-side'); if (s === 'orange' || s === 'blue') side = s; } catch { /* ignore */ }
	function setSide(s: Side) { side = s; try { localStorage.setItem('goa2-op-side', s); } catch { /* ignore */ } }
	$: list = openings.map((o) => onSide(o, side));
	$: if (list.length && !list.some((o) => o.id === selId)) selId = list[0].id;
	$: op = list.find((o) => o.id === selId) ?? null;
	function pick(id: string) { selId = id; step = 1; }
	// the snapshots' island picture, painted once by the live board
	let board: OpeningBoard | null = null;
	let pic = '';
	async function paint() {
		for (let k = 0; k < 12 && !pic; k++) {
			await new Promise((r) => setTimeout(r, k ? 500 : 250));
			if (!board) return;
			pic = await board.picture();
		}
	}
	$: if (tab === 'openings' && board && !pic) void paint();
	function key(e: KeyboardEvent) {
		if (tab !== 'openings' || !op || (e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
		if (e.key === 'ArrowRight') step = Math.min(4, step + 1);
		else if (e.key === 'ArrowLeft') step = Math.max(1, step - 1);
	}
	const firstCards = (o: Opening) => o.turns.map((t) => t.cards[0]).filter(Boolean);
	onMount(() => { void tick(); });
</script>

<svelte:window on:keydown={key} />

<!-- the hero's numbers: Local (our games) | Global (globalstats.ts) — the same switch as Matchups -->
{#snippet globalBox(cls: string)}
	{#if gl || hasLocal}
		{@const wr = view.wr}
		{@const wonN = view.won.reduce((a, b) => a + b, 0)}
		{@const wp = sharePct(view.won)}
		<div class="gbox {cls}">
			<div class="ghd">
				<button class="gsw" class:on={src === 'local'} on:click={() => (srcPick = 'local')} title="Our games">Local</button>
				{#if gl}<button class="gsw" class:on={src === 'global'} on:click={() => (srcPick = 'global')} title="Global stats ({GLOBAL_AS_OF}) — every recorded game, not just ours">Global</button>{/if}
				{#if src === 'global' && gl?.tag}<span class="gt {gl.tag}">{GLOBAL_TAG[gl.tag]}</span>{/if}
			</div>
			<div class="gl2"><span>Win rate</span><b class:up={wr != null && wr >= 50} class:down={wr != null && wr < 50}>{wr == null ? '—' : `${wr.toFixed(1)}%`}</b></div>
			<span class="gsplit" class:none={wr == null}><i style="--v:{(wr ?? 0) / 100}"></i></span>
			<div class="gsm"><span>{wr == null ? 'No games yet' : `${Math.round(wr)}% wins`}</span><span>{wr == null ? '' : `${100 - Math.round(wr)}% losses`}</span></div>
			<div class="gl2"><span>Hero impact</span><b class:up={(view.impact ?? 0) > 0} class:down={(view.impact ?? 0) < 0}>{view.impact == null ? '—' : `${view.impact > 0 ? '+' : ''}${view.impact}%`}</b></div>
			<span class="gimp" title={view.ci ? `ATE ${view.ci[0]}% (95% CI ${view.ci[1]}% to ${view.ci[2]}%)` : 'How much better its players do on it than they do overall'}>{#if view.ci}<em style="--a:{(view.ci[1] + 50) / 100}; --b:{(view.ci[2] + 50) / 100}"></em>{/if}{#if view.impact != null}<i style="--v:{(view.impact + 50) / 100}"></i>{/if}</span>
			<div class="gl2"><span>Victory types</span><small>% of wins</small></div>
			<div class="gstk" class:none={!wonN} title="Wins by win type">{#each [0, 1, 2] as k (k)}{#if view.won[k]}<i class="w{k}" style="flex:{view.won[k]}">{wp[k]}%</i>{/if}{/each}</div>
			<div class="gleg"><span><i class="w0"></i>♛ Throne</span><span><i class="w1"></i>⚑ Final push</span><span><i class="w2"></i>☠ Life</span></div>
		</div>
	{/if}
{/snippet}

<div class="hpage tide">
	<header class="bar">
		<a class="ib" href={base + '/'} aria-label="Home"><Icon name="back" /></a>
		<span class="ttl">Heroes</span>
		<label class="pick"><span class="sr">Hero</span>
			<select value={h.id} on:change={(e) => onHero(e.currentTarget.value)}>{#each HEROES_ALPHA as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select>
		</label>
		<nav class="tabs">
			<button class:on={tab === 'overview'} on:click={() => (tab = 'overview')}>Overview</button>
			<button class:on={tab === 'openings'} on:click={() => (tab = 'openings')}>Openings{#if openings.length}<i>{openings.length}</i>{/if}</button>
		</nav>
		{#if gm}<a class="build" href="{base}/opening-builder?hero={h.id}{op && tab === 'openings' ? `&id=${op.id}` : ''}"><Icon name="flag" /> Opening builder</a>{/if}
	</header>

	<!-- ───── stage (the big area) ───── -->
	<section class="stage">
		{#if tab === 'overview'}
			<img class="art" src={heroSplash(h.id)} alt="" style="object-position: {Math.round(face[0] * 100)}% {Math.round(face[1] * 100)}%" />
			<div class="shade"></div>
			<div class="id">
				<img class="logo" src={heroLogo(h.id)} alt="" />
				<h1 class="name">{h.name} <span>{h.title}</span></h1>
				<div class="meta">
					<span class="stars" title="Complexity {h.stars}">{#each Array(h.stars) as _, k (k)}<img src={starIcon()} alt="★" />{/each}</span>
					<span class="sep"></span>
					{#each h.traits as t (t)}<span class="role">{#if traitIcon(t as Trait)}<img src={traitIcon(t as Trait)} alt="" />{/if}{TRAIT_LABELS[t]}</span>{/each}
				</div>
				<div class="stats">
					{#each h.stats as [lo, hi], k (k)}
						<div class="st"><img src={statIcon(k)} alt="" /><span class="sl">{STAT_LABELS[k]}</span><span class="pips">{#each Array(STAT_PIPS) as _, p (p)}<i class:on={p < lo} class:up={p >= lo && p < hi}></i>{/each}</span></div>
					{/each}
				</div>
				{#if g.minions.length || Object.keys(g.tags).length}
					<div class="tags">
						{#if g.minions.length}<span class="pref">Preferred minions: <b>{g.minions.map((m) => MINION_PREFS[m]).join(', ')}</b></span>{/if}
						{#each GUIDE_TAGS.filter((t) => g.tags[t]) as t (t)}<span class="tag" class:later={g.tags[t] === 2} title={g.tags[t] === 2 ? 'From round 2 or later' : 'From round 1'}>{t}</span>{/each}
					</div>
				{/if}
			</div>
			{@render globalBox('onart')}
		{:else if op}
			{#key op.id}
				<OpeningBoard bind:this={board} {op} {step} {turned} uid="hp" inset={{ t: 56, b: 16, l: 12, r: 12 }} interactive />
			{/key}
			<div class="bctl">
				<span class="seg2"><button class:on={side === 'orange'} class="o" on:click={() => setSide('orange')}>Atlanteans</button><button class:on={side === 'blue'} class="b" on:click={() => setSide('blue')}>Titans</button></span>
				<button class="cb turnb" class:on={turned} on:click={() => (turned = !turned)} title="View from the other end of the table" aria-label="Turn board"><Icon name="turn" /><span>Turn board</span></button>
				<button class="cb" on:click={() => board?.zoomBtn(1.25)} title="Zoom in" aria-label="Zoom in"><Icon name="plus" /></button>
				<button class="cb" on:click={() => board?.zoomBtn(0.8)} title="Zoom out" aria-label="Zoom out"><Icon name="minus" /></button>
				<button class="cb" on:click={() => board?.reset()} title="Recentre" aria-label="Recentre"><Icon name="target" /></button>
			</div>
			<div class="stepbadge">
				<button on:click={() => (step = Math.max(1, step - 1))} disabled={step <= 1} aria-label="Previous turn">‹</button>
				{#if step > 0}<span class="sdot" style:background={CARD_HEX[op.turns[step - 1]?.cards[0] ?? 'silver']}></span><b>Turn {step}</b><em>{turnCards(op.turns[step - 1])}</em>{:else}<b>Whole round</b>{/if}
				<button on:click={() => (step = step === 0 ? 1 : Math.min(4, step + 1))} disabled={step >= 4} aria-label="Next turn">›</button>
			</div>
		{:else}
			<div class="empty">
				<img class="logo" src={heroLogo(h.id)} alt="" />
				{#if status === 'loading'}<p>Loading openings…</p>
				{:else if status === 'missing'}<p>The openings table isn't set up yet.</p>
				{:else}<p>No openings for {h.name} yet.</p>{#if gm}<a class="build big" href="{base}/opening-builder?hero={h.id}&new=1"><Icon name="plus" /> Build the first one</a>{/if}{/if}
			</div>
		{/if}
	</section>

	<!-- ───── side (the card / the turns) ───── -->
	<aside class="side">
		{#if tab === 'overview'}
			<div class="prev">
				{#if shownCard != null && cards[shownCard]}<div class="pcard"><Card heroId={h.id} card={cards[shownCard]} /></div>{/if}
				<small>Tap a card in the starting hand to read it</small>
			</div>
		{:else if op}
			<div class="opinfo">
				<h2>{op.name}</h2>
				<div class="ochips">{#if op.size !== 'any'}<span>{SIZES[op.size]}</span>{/if}{#if op.lane}<span>{LANES[op.lane]}</span>{/if}</div>
				{#if op.goal}<p class="goal">{op.goal}</p>{/if}
				<ol class="steps">
					{#each [1, 2, 3, 4] as t (t)}
						{@const tt = op.turns[t - 1]}
						<li><button class:on={step === t} on:click={() => (step = t)}>
							<span class="tn">Turn {t}</span>
							<span class="dots">{#each tt?.cards ?? [] as c (c)}<i style:background={CARD_HEX[c]}></i>{/each}</span>
							<b>{turnCards(tt)}</b>
							{#if tt?.note}<small>{tt.note}</small>{/if}
						</button></li>
					{/each}
					<li><button class="all" class:on={step === 0} on:click={() => (step = 0)}><span class="tn">All</span><b>Whole round</b></button></li>
				</ol>
			</div>
		{:else}
			<div class="opinfo"><p class="goal muted">Openings are a hero's round-1 plans, turn by turn.</p></div>
		{/if}
	</aside>

	<!-- ───── strip (the guide / every opening) ───── -->
	<section class="strip">
		{#if tab === 'overview'}
			<div class="ov">
				<div class="col over">
					<h3>Overview</h3>
					{#each g.overview.split(/\n+/).filter(Boolean) as para, k (k)}<p class:auto={g.auto.overview}>{para}</p>{/each}
				</div>
				<div class="col sw">
					<h3>Strengths</h3>
					<ul>{#each g.strengths as x, k (k)}<li class="good">{x}</li>{/each}</ul>
					<h3>Weaknesses</h3>
					<ul>{#each g.weaknesses as x, k (k)}<li class="bad">{x}</li>{/each}</ul>
				</div>
				<div class="col hand">
					<h3>Starting hand</h3>
					<div class="spread">
						{#each hand as i (i)}<button class="hc" class:on={shownCard === i} on:click={() => (preview = i)} aria-label={cards[i]?.name}><Card heroId={h.id} card={cards[i]} /></button>{/each}
					</div>
				</div>
				{#if gl}<div class="col gcol">{@render globalBox('instrip')}</div>{/if}
				<div class="col mu">
					<h3>Matchups
						{#if gl}<span class="msw"><button class:on={src === 'local'} on:click={() => (srcPick = 'local')}>Local</button><button class:on={src === 'global'} on:click={() => (srcPick = 'global')}>Global</button></span>{/if}</h3>
					{#if muRows.length}
						{#each muRows as r (r.label)}
							<div class="mrow"><small>{r.label}</small><span class="faces">{#each r.faces as f (f.id)}<span class="face" style={portraitCss(f.id)} title={f.tip}></span>{/each}</span></div>
						{/each}
					{:else}<p class="muted">Not enough games yet.</p>{/if}
				</div>
			</div>
		{:else}
			<div class="olist">
				{#each list as o (o.id)}
					<button class="ocard" class:on={o.id === selId} on:click={() => pick(o.id)}>
						<OpeningThumb op={o} {pic} {turned} uid="t{o.id}" />
						<span class="oname">{o.name}</span>
						<span class="oflow">{#each firstCards(o) as c, k (k)}{#if k}<em>→</em>{/if}<i style:background={CARD_HEX[c]} title={c}></i>{/each}{#if o.size !== 'any'}<small>{SIZES[o.size]}</small>{/if}</span>
					</button>
				{/each}
				{#if gm}<a class="ocard add" href="{base}/opening-builder?hero={h.id}&new=1"><Icon name="plus" /><span>New opening</span></a>{/if}
				{#if !list.length && !gm}<p class="muted">No openings yet.</p>{/if}
			</div>
		{/if}
	</section>
</div>

<style>
	.hpage { position: fixed; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) clamp(290px, 28vw, 440px); grid-template-rows: 52px minmax(0, 1fr) clamp(220px, 30vh, 300px);
		gap: 10px; padding: 0 10px 10px; box-sizing: border-box; color: var(--ink); background: var(--abyss); }
	button { font: inherit; color: inherit; }
	.bar { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; margin: 0 -10px; padding: 0 14px; background: rgba(3, 10, 20, 0.92); border-bottom: 1px solid var(--brass-line); }
	.ib { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--hair); color: var(--ink-2); }
	.ttl { font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-hi); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
	select { padding: 5px 28px 5px 10px; border-radius: 8px; border: 1px solid var(--hair); background-color: rgba(4, 14, 26, 0.8); color: var(--ink); font: inherit; font-size: 14px; }
	select option { color: #0b1220; }
	.tabs { display: flex; gap: 2px; height: 100%; }
	.tabs button { position: relative; display: flex; align-items: center; gap: 6px; padding: 0 16px; border: 0; background: none; color: var(--ink-3); font-size: 15px; cursor: pointer; border-bottom: 2px solid transparent; }
	.tabs button.on { color: var(--brass-hi); border-bottom-color: var(--brass); }
	.tabs i { font-style: normal; font-size: 11px; min-width: 18px; height: 18px; display: grid; place-items: center; border-radius: 9px; background: var(--brass-faint); color: var(--brass-hi); }
	.build { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 9px; font-size: 13px; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.build.big { margin: 6px 0 0; font-size: 15px; padding: 9px 16px; }

	.stage, .side, .strip { position: relative; min-width: 0; min-height: 0; overflow: hidden; border-radius: 16px; border: 1px solid var(--hair); background: var(--glass); }
	.stage { grid-column: 1; grid-row: 2; }
	.side { grid-column: 2; grid-row: 2; }
	.strip { grid-column: 1 / -1; grid-row: 3; }

	/* overview: the painting */
	.art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(3, 10, 20, 0.92) 0%, rgba(3, 10, 20, 0.6) 36%, rgba(3, 10, 20, 0) 64%), linear-gradient(0deg, rgba(3, 10, 20, 0.7), transparent 40%); }
	.id { position: absolute; left: 32px; top: 26px; bottom: 20px; width: min(560px, 54%); display: flex; flex-direction: column; gap: 10px; overflow: hidden; }
	.logo { width: 68px; height: 68px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6)); }
	.name { margin: 0; font-size: clamp(40px, 5.4vw, 76px); line-height: 0.95; font-weight: inherit; color: #fff; text-shadow: 0 6px 30px rgba(0, 0, 0, 0.6); }
	.name span { font-size: 0.42em; color: var(--brass-hi); letter-spacing: 0.04em; white-space: nowrap; }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
	.stars { display: flex; gap: 2px; }
	.stars img { width: 18px; height: 18px; }
	.sep { width: 1px; height: 18px; background: var(--brass-line); margin: 0 3px; }
	.role { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 5px; border-radius: 999px; font-size: 13px; color: var(--ink-2); background: rgba(4, 14, 26, 0.6); border: 1px solid var(--hair); }
	.role img { width: 18px; height: 18px; }
	.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; margin-top: 6px; max-width: 520px; }
	.st { display: grid; grid-template-columns: 22px 86px 1fr; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }
	.st img { width: 20px; height: 20px; }
	.pips { display: flex; gap: 3px; }
	.pips i { flex: 1; height: 8px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
	.pips i.on { background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.pips i.up { background: rgba(216, 179, 106, 0.42); }
	.tags { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 4px; }
	.pref { font-size: 14px; color: var(--ink-2); margin-right: 6px; }
	.pref b { font-weight: 400; color: var(--ink); }
	.tag { padding: 3px 14px; font-size: 13px; color: #fff; background: #111318; clip-path: polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%); }
	.tag.later { background: #6b7280; }

	/* overview: the GLOBAL panel (on the painting; on phones a block in the strip) */
	.gbox { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(64, 196, 186, 0.45); background: rgba(3, 10, 20, 0.86); font-size: 13px; color: var(--ink-2); }
	.gbox.onart { position: absolute; right: 18px; bottom: 18px; width: clamp(230px, 24vw, 280px); }
	.col.gcol { display: none; }
	.ghd { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; margin-bottom: 2px; min-width: 0; }
	.gsw { flex: none; padding: 1px 7px; border-radius: 4px; border: 1px solid rgba(64, 196, 186, 0.55); background: none; color: #8fdcd5; font: inherit; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
	.gsw.on { color: #071c1b; background: #40c4ba; border-color: #40c4ba; }
	.gt { margin-left: auto; flex: none; padding: 1px 8px; border-radius: 999px; font-size: 10.5px; white-space: nowrap; }
	.gt.beginner { color: #6be39a; background: rgba(53, 208, 122, 0.14); }
	.gt.skill { color: #c9a2ff; background: rgba(123, 69, 201, 0.25); }
	.gl2 { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 2px; }
	.gl2 b { font-weight: 400; font-size: 18px; color: #fff; }
	.gl2 b.up { color: #6be39a; }
	.gl2 b.down { color: #ff7d73; }
	.gl2 small { font-size: 11px; color: var(--ink-3); }
	.gsplit { position: relative; height: 5px; border-radius: 3px; background: #d9434e; overflow: hidden; }
	.gsplit i { position: absolute; inset: 0; background: #35d07a; transform-origin: left; transform: scaleX(var(--v)); }
	.gimp { position: relative; height: 10px; border-radius: 5px; background: rgba(255, 255, 255, 0.08); }
	.gimp::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--ink-3); }
	.gimp em { position: absolute; top: 0; bottom: 0; left: calc(var(--a) * 100%); right: calc((1 - var(--b)) * 100%); border-radius: 5px; background: rgba(255, 255, 255, 0.16); }
	.gimp i { position: absolute; top: 2px; width: 6px; height: 6px; margin-left: -3px; left: calc(var(--v) * 100%); border-radius: 50%; background: #fff; }
	.gsm { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--ink-3); }
	.gstk { display: flex; height: 16px; border-radius: 4px; overflow: hidden; }
	.gstk i { display: grid; place-items: center; min-width: 0; overflow: hidden; white-space: nowrap; font-style: normal; font-size: 10.5px; color: #fff; }
	.gstk .w0, .gleg .w0 { background: #c99512; }
	.gstk .w1, .gleg .w1 { background: #3a7fe0; }
	.gstk .w2, .gleg .w2 { background: #d9434e; }
	.gstk.none, .gsplit.none { background: rgba(255, 255, 255, 0.08); }
	.gleg { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; color: var(--ink-3); }
	.gleg span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
	.gleg i { width: 8px; height: 8px; border-radius: 2px; }

	/* openings: the board and its controls */
	.bctl { position: absolute; left: 12px; top: 12px; display: flex; gap: 8px; z-index: 2; }
	.seg2 { display: inline-flex; padding: 3px; gap: 3px; border-radius: 10px; background: rgba(3, 10, 20, 0.85); border: 1px solid var(--hair); }
	.seg2 button { padding: 5px 12px; border: 0; border-radius: 7px; background: none; color: var(--ink-2); font-size: 13px; cursor: pointer; }
	.seg2 button.on.o { color: #fff; background: var(--orange); }
	.seg2 button.on.b { color: #fff; background: var(--blue); }
	.cb { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; height: 36px; border-radius: 10px; border: 1px solid var(--hair); background: rgba(3, 10, 20, 0.85); color: var(--ink-2); font-size: 13px; cursor: pointer; }
	.cb.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.cb :global(svg) { width: 16px; height: 16px; }
	.stepbadge { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 2; display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 999px; background: rgba(3, 10, 20, 0.88); border: 1px solid var(--brass-line); }
	.stepbadge b { font-weight: 400; font-size: 17px; color: #fff; }
	.stepbadge em { font-style: normal; font-size: 13px; color: var(--ink-2); }
	.stepbadge button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--hair); background: none; font-size: 18px; line-height: 1; cursor: pointer; }
	.stepbadge button:disabled { opacity: 0.3; cursor: default; }
	.sdot { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 2px #fff; }
	.empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--ink-2); }

	/* the side: a card / the turns */
	.prev { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px; }
	.pcard { position: relative; height: calc(100% - 30px); max-width: 100%; aspect-ratio: 1192 / 1664; }
	.pcard :global(.card) { position: absolute; inset: 0; }
	.prev small { font-size: 12px; color: var(--ink-3); }
	.opinfo { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px; padding: 18px; overflow-y: auto; }
	.opinfo h2 { margin: 0; font-weight: 400; font-size: 26px; color: #fff; line-height: 1.1; }
	.ochips { display: flex; gap: 6px; }
	.ochips span { padding: 2px 10px; border-radius: 999px; font-size: 12px; color: var(--brass-hi); border: 1px solid var(--brass-line); }
	.goal { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ink-2); white-space: pre-wrap; }
	.steps { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.steps button { width: 100%; display: grid; grid-template-columns: 62px auto 1fr; align-items: center; gap: 4px 10px; padding: 9px 12px; border-radius: 11px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.03); text-align: left; cursor: pointer; }
	.steps button.on { border-color: var(--brass); background: var(--brass-faint); }
	.steps .tn { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brass-hi); }
	.steps b { font-weight: 400; font-size: 15px; color: #fff; }
	.steps small { grid-column: 1 / -1; font-size: 13px; line-height: 1.35; color: var(--ink-2); white-space: pre-wrap; }
	.steps .all { grid-template-columns: 62px 1fr; }
	.dots { display: flex; gap: 3px; }
	.dots i, .oflow i { width: 12px; height: 12px; border-radius: 50%; box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.8); }
	.muted { color: var(--ink-3); }

	/* the strip: the guide */
	.ov { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(200px, 1.2fr) minmax(150px, 0.8fr) auto minmax(180px, 1fr); gap: 18px; padding: 14px 18px; }
	.col { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; scrollbar-width: thin; }
	h3 { margin: 0; font-weight: 400; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-hi); }
	.over p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink); }
	.over p.auto { color: var(--ink-2); }
	.sw ul { margin: 0 0 8px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
	.sw li { font-size: 14px; padding-left: 14px; position: relative; }
	.sw li::before { content: ''; position: absolute; left: 0; top: 0.5em; width: 7px; height: 7px; border-radius: 50%; }
	.sw li.good::before { background: #35d07a; }
	.sw li.bad::before { background: #ef5a4b; }
	.hand { overflow: visible; }
	/* the hand's cards get a size from the strip's height (an aspect-ratio box sized by height alone has no width
	   for the grid to measure, and the cards spilled over Matchups) */
	.spread { --ch: min(196px, calc(clamp(220px, 30vh, 300px) - 62px)); display: flex; gap: 7px; }
	.hc { position: relative; flex: none; height: var(--ch); width: calc(var(--ch) * 1192 / 1664); padding: 0; border: 0; border-radius: 8px; background: none; cursor: pointer; transition: transform 0.15s; }
	.hc :global(.card) { position: absolute; inset: 0; }
	.hc:hover { transform: translateY(-3px); }
	.hc.on { box-shadow: 0 0 0 3px var(--brass); }
	.mu h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 0; }
	.msw { margin-left: auto; display: inline-flex; border: 1px solid var(--brass-line); border-radius: 6px; overflow: hidden; }
	.msw button { padding: 2px 8px; border: 0; background: none; color: var(--ink-3); font: inherit; font-size: 10.5px; letter-spacing: 0.06em; cursor: pointer; }
	.msw button.on { background: var(--brass-line); color: var(--brass-hi); }
	.mrow { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
	.mrow small { font-size: 12px; color: var(--ink-3); }
	.faces { display: flex; flex-wrap: wrap; gap: 6px; }
	.face { width: 36px; height: 36px; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--brass-line); }

	/* the strip: every opening */
	.olist { position: absolute; inset: 0; display: flex; gap: 12px; padding: 12px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
	/* each snapshot is an exact square sized from the strip's height (it used to stretch into whatever box was left) */
	.olist { --th: calc(clamp(220px, 30vh, 300px) - 92px); }
	.ocard { flex: none; width: calc(var(--th) + 14px); height: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 5px; padding: 6px; border-radius: 13px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.03); cursor: pointer; text-align: left; }
	.ocard :global(.thumb) { flex: none; width: var(--th); height: var(--th); }
	.ocard.on { border-color: var(--brass); box-shadow: 0 0 0 1px var(--brass); }
	.oname { font-size: 14px; color: #fff; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.oflow { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--ink-3); }
	.oflow em { font-style: normal; font-size: 10px; }
	.oflow small { margin-left: 6px; }
	.ocard.add { width: 150px; align-items: center; justify-content: center; gap: 8px; color: var(--brass-hi); border-style: dashed; font-size: 14px; }

	@media (max-width: 760px) {
		.hpage { position: absolute; min-height: 100%; grid-template-columns: 1fr; grid-template-rows: 52px 54vh auto auto; overflow-y: auto; }
		.bar { overflow-x: auto; gap: 8px; }
		.ttl { display: none; }
		.tabs button { padding: 0 9px; }
		.bctl { left: 8px; top: 8px; right: 8px; flex-wrap: wrap; gap: 6px; }
		.cb { height: 32px; padding: 0 9px; }
		.cb.turnb span { display: none; }
		.stepbadge b, .stepbadge em { white-space: nowrap; }
		.build { font-size: 0; padding: 7px; }
		.stage { grid-row: 2; }
		.side { grid-column: 1; grid-row: 3; min-height: 280px; }
		.strip { grid-row: 4; min-height: 260px; }
		.ov { position: relative; grid-template-columns: 1fr; }
		.spread { --ch: 150px; overflow-x: auto; }
		.olist { height: 240px; position: relative; --th: 160px; }
		.id { left: 16px; top: 16px; width: calc(100% - 32px); }
		.gbox.onart { display: none; }
		.col.gcol { display: flex; }
	}
</style>
