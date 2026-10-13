<script lang="ts">
	// Hero page mock-up B — "The Stats Site": the Hall of Records look (dark cards, tabular numbers), like a
	// MOBA stats site's champion page: a header with the grade and key numbers, the build as talent rows
	// (each pair of cards with how often it's taken and how it wins), the best two builds, the round-1 opening
	// as a table, win rate over time and matchups. One long page that scrolls. (Sample numbers.)
	import '$lib/hall/hall.css';
	import Card from '$lib/cards/Card.svelte';
	import Line from '$lib/hall/Line.svelte';
	import { heroSplash, splashFace, portraitCss, heroById, TRAIT_LABELS, traitIcon, type Trait } from '$lib/heroes';
	import { ITEM_NAME, COLOR_HEX, type HeroSample, type Option } from './sample';

	export let s: HeroSample;
	$: h = s.hero;
	$: groups = [{ label: 'Strong against', list: s.strong, tone: 'good' }, { label: 'Struggles against', list: s.weak, tone: 'bad' }, { label: 'Best with', list: s.partners, tone: 'good' }];
	$: face = splashFace(h.id);
	const icons = import.meta.glob('../cards/images/item_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const item = (it?: string) => (it ? icons[`../cards/images/item_${it.toLowerCase()}.png`] ?? '' : '');
	const roman = ['I', 'II', 'III', 'IV'];
	const better = (a: Option, b: Option) => a.taken >= b.taken;
</script>

<div class="mb hall">
	<header class="hero">
		<div class="bg" style="background-image: url({heroSplash(h.id)}); background-position: {Math.round(face[0] * 100)}% {Math.round(face[1] * 100)}%"></div>
		<div class="hin">
			<span class="face big" style={portraitCss(h.id)}></span>
			<div class="who">
				<h1>{h.name} <small>{h.title}</small></h1>
				<div class="roles">{#each h.traits as t (t)}<span class="chip">{#if traitIcon(t as Trait)}<img src={traitIcon(t as Trait)} alt="" />{/if}{TRAIT_LABELS[t]}</span>{/each}<span class="chip">{'★'.repeat(h.stars)}</span></div>
			</div>
			<div class="kpis">
				<div class="grade g-{s.grade}"><b>{s.grade}</b><span>Tier</span></div>
				<div class="kv"><span>Win rate</span><b class:up={s.win >= 50} class:down={s.win < 50}>{s.win}%</b></div>
				<div class="kv"><span>Pick rate</span><b class="b">{s.pick}%</b></div>
				<div class="kv"><span>Games</span><b>{s.games}</b></div>
				<span class="chip sample">Sample numbers</span>
			</div>
		</div>
	</header>

	<div class="wrap">
		<div class="row">
			<section class="card">
				<h3 class="ch">Card picks <small>which card of each pair players take, and how it does</small></h3>
				<table class="tbl picks">
					<thead><tr><th>Tier</th><th>Option</th><th class="rt">Taken</th><th class="rt">Win</th><th></th><th>Option</th><th class="rt">Taken</th><th class="rt">Win</th></tr></thead>
					<tbody>
						{#each s.tiers as t (t.color + t.tier)}
							<tr>
								<td><span class="tier" style="--c:{COLOR_HEX[t.color]}">{roman[t.tier - 1]}</span></td>
								{#each [t.a, t.b] as o, k (k)}
									{#if k === 1}<td class="vs">or</td>{/if}
									<td><span class="opt" class:top={better(o, k ? t.a : t.b)}><span class="thumb"><Card heroId={h.id} card={o.card} /></span><span><b>{o.card.name}</b><small>item: +1 {ITEM_NAME[s.cards[k ? t.a.idx : t.b.idx]?.item ?? ''] ?? '–'}</small></span></span></td>
									<td class="barcell rt"><span class="bv"><b class="b">{o.taken}%</b><span class="bar thin"><i style="--v:{o.taken / 100}"></i></span></span></td>
									<td class="rt" class:up={o.win >= 50} class:down={o.win < 50}>{o.win}%</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		</div>

		<div class="row c3">
			{#each s.builds as b, n (n)}
				<section class="card">
					<h3 class="ch">{n === 0 ? 'Most popular build' : 'Alternative build'} <small>{b.name}</small><span class="r" class:up={b.win >= 50} class:down={b.win < 50}>{b.win}% <small>· {b.games} games</small></span></h3>
					<div class="bpath">
						{#each b.picks as i, k (k)}
							{#if k === 3}<span class="tsep">III</span>{:else if k === 0}<span class="tsep">II</span>{/if}
							<div class="bp"><span class="thumb"><Card heroId={h.id} card={s.cards[i]} /></span><span class="bi">{#if item(b.items[k])}<img src={item(b.items[k])} alt="" />{/if}+1</span></div>
						{/each}
					</div>
				</section>
			{/each}
			<section class="card">
				<h3 class="ch">Win rate over time</h3>
				<Line series={[{ values: s.trend, color: '#35d07a' }]} labels={['', '', '', '', '', '', '', 'Now']} ref={50} min={30} max={70} height={130} />
				<div class="splits">
					{#each [...s.bySize, ...s.bySide] as x (x.label)}
						<div class="sp"><span>{x.label}</span><span class="bar half" class:gr={x.win >= 50} class:rd={x.win < 50}><i style="--v:{x.win / 100}"></i></span><b class:up={x.win >= 50} class:down={x.win < 50}>{x.win}%</b><small>{x.games}</small></div>
					{/each}
				</div>
			</section>
		</div>

		<div class="row c21">
			<section class="card">
				<h3 class="ch">Round 1 opening <small>the most common first four turns</small></h3>
				<table class="tbl">
					<thead><tr><th>Turn</th><th>Card</th><th>Plan</th><th class="rt">Played</th></tr></thead>
					<tbody>
						{#each s.opening as t (t.turn)}
							<tr><td><b>{roman[t.turn - 1]}</b></td><td><span class="opt"><span class="thumb"><Card heroId={h.id} card={t.card} /></span><b>{t.card.name}</b></span></td><td class="wrapc">{t.plan}</td><td class="rt b">{60 - t.turn * 7}%</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
			<section class="card">
				<h3 class="ch">Matchups</h3>
				{#each groups as { label, list } (label)}
					<p class="sub">{label}</p>
					<div class="mus">
						{#each list as m (m.hero)}<span class="mu"><span class="face" style="--fs:34px; {portraitCss(m.hero)}"></span><span><b>{heroById(m.hero)?.name}</b><small class:up={m.delta > 0} class:down={m.delta < 0}>{m.delta > 0 ? '+' : ''}{m.delta}</small></span></span>{/each}
					</div>
				{/each}
			</section>
		</div>
	</div>
</div>

<style>
	.mb { position: absolute; inset: 0; overflow-y: auto; background: var(--bg); color: var(--tx); }
	.hero { position: relative; height: 210px; overflow: hidden; border-bottom: 1px solid var(--ln); }
	.bg { position: absolute; inset: 0; background-size: cover; opacity: 0.45; }
	.hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--bg) 18%, rgba(10, 12, 16, 0.6) 60%, rgba(10, 12, 16, 0.2)), linear-gradient(0deg, var(--bg), transparent 60%); }
	.hin { position: relative; z-index: 1; max-width: 1300px; height: 100%; margin: 0 auto; padding: 0 24px; display: flex; align-items: center; gap: 22px; }
	.face.big { --fs: 104px; border-radius: 18px; box-shadow: 0 0 0 2px var(--au), 0 10px 30px rgba(0, 0, 0, 0.6); }
	.who { flex: 1; min-width: 0; }
	.who h1 { margin: 0 0 10px; font-size: 38px; font-weight: 800; letter-spacing: -0.02em; }
	.who h1 small { font-size: 16px; font-weight: 500; color: var(--mu); }
	.roles { display: flex; flex-wrap: wrap; gap: 6px; }
	.kpis { display: flex; align-items: center; gap: 26px; }
	.grade { display: grid; place-items: center; width: 70px; height: 70px; border-radius: 14px; background: var(--p2); border: 2px solid var(--au); }
	.grade b { font-size: 32px; line-height: 1; color: var(--au); }
	.grade span { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--mu); }
	.grade.g-S { border-color: var(--vi); } .grade.g-S b { color: var(--vi); }
	.sample { border-style: dashed; }
	.wrap { max-width: 1300px; margin: 0 auto; padding: 20px 24px 40px; }
	.thumb { display: inline-block; width: 34px; flex: none; border-radius: 4px; overflow: hidden; }
	.thumb :global(.cardface) { width: 100%; display: block; }
	.opt { display: inline-flex; align-items: center; gap: 10px; min-width: 0; opacity: 0.72; }
	.opt.top { opacity: 1; }
	.opt b { display: block; font-size: 13.5px; }
	.opt small { font-size: 11.5px; color: var(--mu); }
	.picks td { padding: 6px 8px; }
	.tier { display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; font-weight: 800; font-size: 13px; color: #fff; background: var(--c); }
	.vs { color: var(--mu2); font-size: 12px; text-align: center; }
	.tbl tbody tr { cursor: default; }
	.wrapc { white-space: normal !important; color: var(--tx2); font-size: 13px; line-height: 1.4; min-width: 220px; }
	.splits { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
	.sp { display: grid; grid-template-columns: 90px 1fr 54px 26px; align-items: center; gap: 10px; font-size: 13px; }
	.sp b { text-align: right; font-weight: 700; }
	.sp small { color: var(--mu); text-align: right; }
	.bpath { display: flex; align-items: center; gap: 6px; }
	.bp { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.bp .thumb { width: 44px; }
	.bi { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--au); }
	.bi img { width: 14px; height: 14px; }
	.tsep { font-size: 12px; font-weight: 800; color: var(--mu); padding: 0 2px; }
	.mus { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 14px; }
	.mu { display: flex; align-items: center; gap: 8px; }
	.mu b { display: block; font-size: 13.5px; }
	.mu small { font-size: 12.5px; font-weight: 700; }
	.chip img { width: 14px; height: 14px; }
	/* the card component's own .card box is not a Hall card */
	.mb :global(.thumb .card) { padding: 0; border: 0; border-radius: 0; background: none; }
</style>
