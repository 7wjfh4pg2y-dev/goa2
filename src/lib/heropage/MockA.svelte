<script lang="ts">
	// Hero page mock-up A — "The Splash": a game-client hero screen. The big painting fills the screen,
	// the hero's name, roles and stats sit over it on the left, and four tabs along the bottom hold the
	// guide: Overview · Builds · Opening · Matchups. (Tide look; sample numbers.)
	import Card from '$lib/cards/Card.svelte';
	import { heroSplash, splashFace, heroLogo, statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, portraitCss, heroById, type Trait } from '$lib/heroes';
	import { ITEM_NAME, type HeroSample } from './sample';

	export let s: HeroSample;
	let tab: 'overview' | 'builds' | 'opening' | 'matchups' = 'overview';
	$: h = s.hero;
	$: groups = [{ label: 'Strong against', list: s.strong, tone: 'good' }, { label: 'Struggles against', list: s.weak, tone: 'bad' }, { label: 'Best with', list: s.partners, tone: 'good' }];
	$: face = splashFace(h.id);
	const icons = import.meta.glob('../cards/images/item_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const item = (it: string) => icons[`../cards/images/item_${it.toLowerCase()}.png`] ?? '';
	const roman = ['I', 'II', 'III', 'IV'];
</script>

<div class="ma">
	<img class="art" src={heroSplash(h.id)} alt="" style="object-position: {Math.round(face[0] * 100)}% {Math.round(face[1] * 100)}%" />
	<div class="shade"></div>

	<section class="id">
		<img class="logo" src={heroLogo(h.id)} alt="" />
		<span class="t-label title">{h.title}</span>
		<h1 class="name">{h.name}</h1>
		<div class="meta">
			<span class="stars">{#each Array(h.stars) as _, k (k)}<img src={starIcon()} alt="" />{/each}</span>
			<span class="sep"></span>
			{#each h.traits as t (t)}<span class="role" title={TRAIT_LABELS[t]}>{#if traitIcon(t as Trait)}<img src={traitIcon(t as Trait)} alt="" />{/if}{TRAIT_LABELS[t]}</span>{/each}
		</div>
		<div class="stats">
			{#each h.stats as [lo, hi], k (k)}
				<div class="st">
					<img src={statIcon(k)} alt="" /><span class="sl">{STAT_LABELS[k]}</span>
					<span class="pips">{#each Array(STAT_PIPS) as _, p (p)}<i class:on={p < lo} class:up={p >= lo && p < hi}></i>{/each}</span>
				</div>
			{/each}
		</div>
		<div class="nums">
			<span class="grade g-{s.grade}">{s.grade}<small>tier</small></span>
			<span class="n"><b>{s.win}%</b><small>win rate</small></span>
			<span class="n"><b>{s.pick}%</b><small>pick rate</small></span>
			<span class="n"><b>{s.games}</b><small>games</small></span>
			<span class="sample">Sample numbers</span>
		</div>
	</section>

	<section class="dock panel">
		<nav class="tabs">
			{#each [['overview', 'Overview'], ['builds', 'Builds'], ['opening', 'Opening'], ['matchups', 'Matchups']] as [k, l] (k)}
				<button class:on={tab === k} on:click={() => (tab = k as typeof tab)}>{l}</button>
			{/each}
		</nav>
		<div class="body">
			{#if tab === 'overview'}
				<div class="ov">
					<div class="col">
						<p class="play">{s.playstyle}</p>
						<div class="sw">
							<div><span class="t-label">Strengths</span>{#each s.strengths as x (x)}<span class="pill good">{x}</span>{/each}</div>
							<div><span class="t-label">Watch out</span>{#each s.weaknesses as x (x)}<span class="pill bad">{x}</span>{/each}</div>
						</div>
					</div>
					<div class="hand">
						<span class="t-label">Starting hand</span>
						<div class="fan">{#each s.hand as i, k (i)}<div class="fc" style="--k:{k - (s.hand.length - 1) / 2}"><Card heroId={h.id} card={s.cards[i]} /></div>{/each}</div>
					</div>
				</div>
			{:else if tab === 'builds'}
				<div class="builds">
					{#each s.builds as b, n (n)}
						<div class="build">
							<div class="bh"><b>{b.name}</b><small>{b.blurb}</small><span class="bw">{b.win}% · {b.games} games</span></div>
							<div class="path">
								{#each b.picks as i, k (k)}
									<div class="pc"><span class="no">{k + 1}</span><div class="mini"><Card heroId={h.id} card={s.cards[i]} /></div>{#if b.items[k]}<span class="it"><img src={item(b.items[k])} alt="" />+1 {ITEM_NAME[b.items[k]]}</span>{/if}</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else if tab === 'opening'}
				<div class="turns">
					{#each s.opening as t (t.turn)}
						<div class="turn">
							<span class="tn">Turn {roman[t.turn - 1]}</span>
							<div class="mini"><Card heroId={h.id} card={t.card} /></div>
							<b>{t.card.name}</b>
							<p>{t.plan}</p>
						</div>
					{/each}
				</div>
			{:else}
				<div class="mus">
					{#each groups as { label, list, tone } (label)}
						<div class="mu">
							<span class="t-label">{label}</span>
							{#each list as m (m.hero)}
								<div class="mr"><span class="face" style={portraitCss(m.hero)}></span><b>{heroById(m.hero)?.name}</b><em class={tone}>{m.delta > 0 ? '+' : ''}{m.delta}</em></div>
							{/each}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	.ma { position: absolute; inset: 0; overflow: hidden; color: var(--ink); }
	.art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(3, 10, 20, 0.94) 0%, rgba(3, 10, 20, 0.7) 34%, rgba(3, 10, 20, 0.05) 62%), linear-gradient(0deg, rgba(3, 10, 20, 0.9) 0%, transparent 46%); }
	.id { position: absolute; left: 48px; top: 40px; width: min(560px, 44vw); display: flex; flex-direction: column; gap: 10px; }
	.logo { width: 76px; height: 76px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.6)); }
	.title { color: var(--brass-hi); letter-spacing: 0.2em; }
	.name { margin: -6px 0 0; font-size: 88px; line-height: 0.95; font-weight: inherit; color: #fff; text-shadow: 0 6px 30px rgba(0, 0, 0, 0.6); }
	.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
	.stars { display: flex; gap: 2px; }
	.stars img { width: 18px; height: 18px; }
	.sep { width: 1px; height: 18px; background: var(--brass-line); margin: 0 4px; }
	.role { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px 3px 5px; border-radius: 999px; font-size: 13px; color: var(--ink-2); background: rgba(4, 14, 26, 0.6); border: 1px solid var(--hair); }
	.role img { width: 18px; height: 18px; }
	.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 22px; margin-top: 8px; }
	.st { display: grid; grid-template-columns: 22px 92px 1fr; align-items: center; gap: 8px; font-size: 14px; color: var(--ink-2); }
	.st img { width: 20px; height: 20px; }
	.pips { display: flex; gap: 3px; }
	.pips i { flex: 1; height: 8px; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
	.pips i.on { background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.pips i.up { background: rgba(216, 179, 106, 0.42); }
	.nums { display: flex; align-items: center; gap: 22px; margin-top: 14px; flex-wrap: wrap; }
	.grade { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 14px; font-size: 34px; line-height: 1; color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.grade small { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }
	.grade.g-S { background: linear-gradient(180deg, #f5d0ff, #b06ae8); }
	.n { display: flex; flex-direction: column; }
	.n b { font-size: 28px; font-weight: inherit; color: #fff; }
	.n small, .sample { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	.sample { padding: 2px 8px; border-radius: 999px; border: 1px dashed var(--ink-3); }

	.dock { position: absolute; left: 32px; right: 32px; bottom: 24px; height: 300px; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
	.tabs { display: flex; gap: 4px; padding: 10px 14px 0; border-bottom: 1px solid var(--hair); }
	.tabs button { padding: 8px 18px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-3); font: inherit; font-size: 15px; cursor: pointer; }
	.tabs button.on { color: var(--brass-hi); border-bottom-color: var(--brass); }
	.body { flex: 1; min-height: 0; padding: 16px 20px; overflow: hidden; }
	.ov { display: grid; grid-template-columns: 1fr minmax(0, 520px); gap: 28px; height: 100%; }
	.play { margin: 0 0 14px; font-size: 17px; line-height: 1.5; color: var(--ink); }
	.sw { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	.sw > div { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
	.sw .t-label { width: 100%; }
	.pill { padding: 3px 10px; border-radius: 999px; font-size: 13px; }
	.pill.good { color: #c9f5d8; background: rgba(53, 208, 122, 0.12); border: 1px solid rgba(53, 208, 122, 0.4); }
	.pill.bad { color: #ffd0d0; background: rgba(239, 79, 92, 0.12); border: 1px solid rgba(239, 79, 92, 0.4); }
	.hand { display: flex; flex-direction: column; gap: 6px; }
	.fan { position: relative; flex: 1; display: flex; justify-content: center; align-items: flex-end; }
	.fc { width: 112px; margin: 0 -14px; transform: rotate(calc(var(--k) * 5deg)) translateY(calc(var(--k) * var(--k) * 4px)); transform-origin: 50% 120%; filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.5)); transition: transform 0.15s; }
	.fc:hover { transform: translateY(-14px) scale(1.06); z-index: 2; }
	.fc :global(.cardface), .mini :global(.cardface) { width: 100%; display: block; border-radius: 6%; }
	.builds { display: flex; flex-direction: column; gap: 14px; }
	.build { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: center; }
	.bh { display: flex; flex-direction: column; gap: 4px; }
	.bh b { font-weight: inherit; font-size: 18px; color: var(--brass-hi); }
	.bh small { font-size: 12.5px; color: var(--ink-3); }
	.bw { font-size: 13px; color: var(--ink-2); }
	.path { display: flex; gap: 10px; }
	.pc { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; }
	.pc .mini { width: 64px; }
	.no { position: absolute; top: -6px; left: -6px; z-index: 1; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; color: var(--ink-dark); background: var(--brass); }
	.it { display: flex; align-items: center; gap: 3px; font-size: 10.5px; color: var(--ink-2); white-space: nowrap; }
	.it img { width: 14px; height: 14px; }
	.turns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; height: 100%; }
	.turn { display: grid; grid-template-columns: 78px 1fr; grid-template-rows: auto auto 1fr; column-gap: 12px; align-content: start; }
	.turn .tn { grid-column: 1 / -1; margin-bottom: 6px; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass-hi); }
	.turn .mini { grid-row: 2 / 4; width: 78px; }
	.turn b { font-weight: inherit; font-size: 15px; }
	.turn p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.4; color: var(--ink-2); }
	.mus { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
	.mu { display: flex; flex-direction: column; gap: 8px; }
	.mr { display: flex; align-items: center; gap: 10px; font-size: 16px; }
	.mr b { flex: 1; font-weight: inherit; }
	.mr .face { width: 40px; height: 40px; border-radius: 50%; background-color: #05070a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--hair); }
	.mr em { font-style: normal; font-variant-numeric: tabular-nums; }
	.mr em.good { color: #6ee7a0; } .mr em.bad { color: #ff8a8a; }
</style>
