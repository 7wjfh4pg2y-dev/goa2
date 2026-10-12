<script lang="ts">
	// One hero, stats-site style: the banner, Win Rate and Pick Rate over time (with its place among the heroes),
	// Matchups (against / with: best and worst three in win-rate points), how it does by game size and side, who
	// plays it, the card picks per tier (taken + won with, like talents) and the builds. Online + table games.
	import type { HeroAgg, LeagueGame, Path } from '$lib/league';
	import { WIN_LABEL, WIN_TYPES } from '$lib/league';
	import { heroById, heroSplash, splashFace, portraitCss, traitIcon, TRAIT_LABELS, type Trait } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { heroTrend, matchups, heroSplits } from '$lib/hallstats';
	import Line from './Line.svelte';

	export let h: HeroAgg;
	export let games: LeagueGame[] = [];
	export let rank: { win: number; pick: number; of: number } | null = null;
	export let onPlayer: (key: string) => void = () => {};
	export let onHero: (id: string) => void = () => {};
	export let onBack: () => void = () => {};

	const heroName = (id: string) => heroById(id)?.name ?? id;
	const pct = (w: number, g: number) => (g ? (100 * w) / g : 0);
	const f1 = (n: number) => n.toFixed(1);
	$: info = heroById(h.hero);
	$: [fx, fy] = splashFace(h.hero);
	$: wr = pct(h.wins, h.games);
	$: trend = heroTrend(games, h.hero);
	$: pickNow = games.length ? pct(h.games, games.length) : 0;
	let mside: 'against' | 'with' = 'against';
	$: mu = matchups(h, mside);
	$: sp = heroSplits(games, h.hero);
	$: cards = [...sp.sizes, ...sp.sides];
	$: maxShare = Math.max(1, ...cards.map((c) => c.share));

	// the card picks: each colour's two options per tier — how often taken (of the two), and the win rate with it
	const TIER = ['', 'I', 'II', 'III', 'IV'];
	$: deck = heroCards(h.hero);
	$: tally = (() => {
		const m = new Map<number, { games: number; wins: number }>();
		for (const t of h.paths) for (const i of t.path.cards) { const x = m.get(i) ?? { games: 0, wins: 0 }; x.games += t.games; x.wins += t.wins; m.set(i, x); }
		return m;
	})();
	$: builtGames = h.paths.reduce((s, t) => s + t.games, 0);
	$: builtWins = h.paths.reduce((s, t) => s + t.wins, 0);
	$: baseBuilt = pct(builtWins, builtGames);
	$: pickRows = [2, 3].flatMap((tier) => ['RED', 'BLUE', 'GREEN'].map((colour) => {
		const opts = deck.map((c, i) => ({ c, i })).filter((x) => x.c.color === colour && x.c.level === tier)
			.map((x) => ({ i: x.i, name: x.c.name, ...(tally.get(x.i) ?? { games: 0, wins: 0 }) }));
		const all = opts.reduce((s, o) => s + o.games, 0);
		return { tier, colour: colour.toLowerCase(), all, opts };
	})).filter((r) => r.opts.length);
	$: ult = h.paths.filter((t) => t.path.ult).reduce((s, t) => ({ games: s.games + t.games, wins: s.wins + t.wins }), { games: 0, wins: 0 });
	$: ultName = deck.find((c) => c.level === 4)?.name ?? 'Ultimate';
	function chips(path: Path) {
		const out = path.cards.map((i) => ({ name: deck[i]?.name ?? '?', colour: (deck[i]?.color ?? '').toLowerCase(), tier: TIER[deck[i]?.level ?? 0] ?? '' }));
		if (path.ult) out.push({ name: ultName, colour: 'purple', tier: 'IV' });
		return out;
	}
	$: typeTotal = WIN_TYPES.reduce((s, t) => s + h.byType[t].games, 0) + h.byType.other.games;
	$: players = Object.entries(h.players).sort((a, b) => b[1] - a[1]);
	$: who = sp.all.players;
</script>

<div class="hp">
	<header class="ban" style="--img:url({heroSplash(h.hero)}); --fx:{fx * 100}%; --fy:{fy * 100}%">
		<button class="btn2 back" on:click={onBack}>← All heroes</button>
		<div class="bt">
			<span class="face big" style="--fs:84px; {portraitCss(h.hero)}"></span>
			<div class="bn">
				<h2>{info?.name ?? h.hero}</h2>
				<span class="bs">{info?.title ?? ''}{#if info} · {info.pack} · {'★'.repeat(info.stars)}{/if}</span>
				<span class="roles">{#each (info?.traits ?? []) as t (t)}<span class="chip">{#if traitIcon(t as Trait)}<img src={traitIcon(t as Trait)} alt="" />{/if}{TRAIT_LABELS[t as Trait]}</span>{/each}</span>
			</div>
			<div class="bk">
				<div class="kv"><span>Games</span><b>{h.games}</b></div>
				<div class="kv"><span>W – L</span><b>{h.wins}–{h.games - h.wins}</b></div>
				<div class="kv"><span>K / D / A</span><b>{h.kdaGames ? `${f1(h.kills / h.kdaGames)} / ${f1(h.deaths / h.kdaGames)} / ${f1(h.assists / h.kdaGames)}` : '–'}</b></div>
				<div class="kv"><span>Gold / game</span><b>{h.coinGames ? f1(h.coins / h.coinGames) : '–'}</b></div>
				<div class="kv"><span>Impact</span><b class:up={(h.impact ?? 0) > 0} class:down={(h.impact ?? 0) < 0}>{h.impact == null ? '–' : `${h.impact > 0 ? '+' : ''}${h.impact}`}</b></div>
			</div>
		</div>
	</header>

	<div class="row c3">
		<section class="card">
			<div class="rate"><h3>Win Rate</h3><span class="big" class:g={wr >= 50} class:r-={wr < 50}>{f1(wr)}%</span>{#if rank}<span class="rk">#{rank.win} of {rank.of}</span>{/if}</div>
			<Line series={[{ values: trend.win, color: wr >= 50 ? '#35d07a' : '#ef4f5c' }]} labels={trend.labels} ref={50} min={0} max={100} />
		</section>
		<section class="card">
			<div class="rate"><h3>Pick Rate</h3><span class="big b">{f1(pickNow)}%</span>{#if rank}<span class="rk">#{rank.pick} of {rank.of}</span>{/if}</div>
			<Line series={[{ values: trend.pick, color: '#3aa3ff' }]} labels={trend.labels} ref={pickNow} min={0} />
		</section>
		<section class="card mu">
			<div class="ch">Matchups<span class="r seg"><button class:on={mside === 'against'} on:click={() => (mside = 'against')}>Against</button><button class:on={mside === 'with'} on:click={() => (mside = 'with')}>With</button></span></div>
			<div class="mus">
				<div class="mg">
					{#each mu.best as m (m.hero)}
						<button class="mh" on:click={() => onHero(m.hero)} title="{heroName(m.hero)} · {m.wins}–{m.games - m.wins} ({m.games} games)">
							<span class="face" style="--fs:44px; {portraitCss(m.hero)}"></span><span class="bar thin au"><i style="--v:{Math.min(1, m.games / Math.max(1, h.games))}"></i></span><b class="up">+{f1(m.delta)}</b>
						</button>
					{:else}<span class="none">—</span>{/each}
				</div>
				<span class="div"></span>
				<div class="mg">
					{#each mu.worst as m (m.hero)}
						<button class="mh" on:click={() => onHero(m.hero)} title="{heroName(m.hero)} · {m.wins}–{m.games - m.wins} ({m.games} games)">
							<span class="face" style="--fs:44px; {portraitCss(m.hero)}"></span><span class="bar thin au"><i style="--v:{Math.min(1, m.games / Math.max(1, h.games))}"></i></span><b class="down">{f1(m.delta)}</b>
						</button>
					{:else}<span class="none">—</span>{/each}
				</div>
			</div>
			<div class="mfoot"><span>Best {mside}</span><span class="dot"></span><span>Worst {mside}</span></div>
		</section>
	</div>

	{#if cards.length}
		<div class="row splits" style="grid-template-columns: repeat({Math.min(5, cards.length)}, minmax(0, 1fr))">
			{#each cards as s (s.key)}
				<section class="card spl">
					<div class="ch"><span class="si si-{s.key}">{s.key === 'orange' ? '⚙' : s.key === 'blue' ? '★' : '⚔'}</span>{s.label}{#if s.share === maxShare && cards.length > 1}<span class="r mp">Most played</span>{/if}</div>
					<div class="bl"><b>{f1(s.share)}%</b><span class="bar"><i style="--v:{s.share / 100}"></i></span></div>
					<div class="bl"><b>{f1(s.win)}%</b><span class="bar half" class:gr={s.win >= 50} class:rd={s.win < 50}><i style="--v:{s.win / 100}"></i></span></div>
					<div class="st5">
						<span><i class="up">K</i>{s.k ?? '–'}</span><span><i class="down">D</i>{s.d ?? '–'}</span><span><i class="b">A</i>{s.a ?? '–'}</span><span><i class="au">M</i>{s.minions ?? '–'}</span><span><i class="au">G</i>{s.gold ?? '–'}</span>
					</div>
					<div class="sub c">Played by</div>
					<div class="pby">
						{#each s.players.slice(0, 4) as p (p.key)}<button class="pb" on:click={() => onPlayer(p.key)} title="{p.wins}–{p.games - p.wins}">{p.name}<small>{p.games}</small></button>{/each}
					</div>
				</section>
			{/each}
		</div>
	{/if}

	<div class="row c21">
		<section class="card">
			<div class="ch">Card picks <small>{builtGames ? `${builtGames} game${builtGames === 1 ? '' : 's'} with a recorded build` : 'no builds recorded yet'}</small></div>
			{#if builtGames}
				<div class="talents">
					{#each pickRows as row (row.tier + row.colour)}
						<div class="tal">
							<span class="tier c-{row.colour}">{TIER[row.tier]}</span>
							{#each row.opts as o (o.i)}
								{@const share = row.all ? o.games / row.all : 0}
								{@const d = o.games ? pct(o.wins, o.games) - baseBuilt : null}
								<div class="opt" class:hot={row.all > 0 && o.games === Math.max(...row.opts.map((x) => x.games)) && o.games > 0}>
									<div class="on"><b>{o.name}</b>{#if d != null}<em class:up={d > 0} class:down={d < 0}>{d > 0 ? '+' : ''}{f1(d)}%</em>{/if}</div>
									<span class="bar thin"><i style="--v:{share}"></i></span>
									<small>{o.games ? `taken ${Math.round(share * 100)}% · ${o.wins}–${o.games - o.wins}` : 'never taken'}</small>
								</div>
							{/each}
						</div>
					{/each}
					<div class="tal">
						<span class="tier c-purple">IV</span>
						<div class="opt wide" class:hot={ult.games > 0}>
							<div class="on"><b>{ultName}</b>{#if ult.games}<em class:up={pct(ult.wins, ult.games) > baseBuilt} class:down={pct(ult.wins, ult.games) < baseBuilt}>{f1(pct(ult.wins, ult.games) - baseBuilt)}%</em>{/if}</div>
							<span class="bar thin vi"><i style="--v:{builtGames ? ult.games / builtGames : 0}"></i></span>
							<small>{ult.games ? `unlocked in ${ult.games} of ${builtGames} · ${ult.wins}–${ult.games - ult.wins}` : 'never unlocked'}</small>
						</div>
					</div>
				</div>
				<p class="fine">% after a card = its win rate against this hero's win rate in games with a build.</p>
			{:else}
				<p class="muted">Builds are recorded in online games; table games don't keep them.</p>
			{/if}
		</section>
		<section class="card">
			<div class="ch">Players</div>
			<table class="tbl">
				<thead><tr><th>Player</th><th class="rt">Games</th><th>Win %</th></tr></thead>
				<tbody>
					{#each who as p (p.key)}
						<tr on:click={() => onPlayer(p.key)}><td>{p.name}</td><td class="rt">{p.games}</td><td class="barcell"><span class="bv"><b class:up={pct(p.wins, p.games) >= 50} class:down={pct(p.wins, p.games) < 50}>{Math.round(pct(p.wins, p.games))}%</b><span class="bar thin half" class:gr={pct(p.wins, p.games) >= 50} class:rd={pct(p.wins, p.games) < 50}><i style="--v:{p.wins / p.games}"></i></span></span></td></tr>
					{/each}
				</tbody>
			</table>
			<div class="sub sp">How its games ended</div>
			<div class="types">
				{#each [...WIN_TYPES, 'other' as const] as t (t)}
					{#if h.byType[t].games}
						<div class="ty"><span>{t === 'other' ? 'Other / table' : WIN_LABEL[t]}</span><span class="bar"><i style="--v:{h.byType[t].games / Math.max(1, typeTotal)}"></i></span><b>{h.byType[t].wins}–{h.byType[t].games - h.byType[t].wins}</b></div>
					{/if}
				{/each}
			</div>
		</section>
	</div>

	{#if h.paths.length}
		<section class="card">
			<div class="ch">Builds <small>in the order the cards were taken</small></div>
			<div class="builds">
				{#each h.paths as b (b.path.cards.join('.') + b.path.ult)}
					<div class="build">
						<span class="bw"><b>{b.wins}–{b.games - b.wins}</b><small>{b.by.join(', ')}</small></span>
						<span class="path">{#each chips(b.path) as c, i (i)}{#if i && b.path.ordered}<span class="arr">›</span>{/if}<span class="cc c-{c.colour}"><i>{c.tier}</i>{c.name}</span>{/each}</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	{#if players.length === 0}<p class="muted">No games yet.</p>{/if}
</div>

<style>
	.hp { display: flex; flex-direction: column; }
	.ban { position: relative; margin-bottom: 16px; padding: 18px 22px 20px; border-radius: 14px; overflow: hidden; border: 1px solid var(--ln); min-height: 190px; display: flex; flex-direction: column; justify-content: space-between;
		background: linear-gradient(0deg, rgba(10, 12, 16, 0.92) 0%, rgba(10, 12, 16, 0.2) 70%), linear-gradient(90deg, rgba(10, 12, 16, 0.96) 0%, rgba(10, 12, 16, 0.7) 45%, rgba(10, 12, 16, 0.45) 100%), var(--img) var(--fx) var(--fy) / cover no-repeat; }
	.back { align-self: flex-start; }
	.bt { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; margin-top: 18px; }
	.bn { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
	.bn h2 { margin: 0; font-size: 34px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
	.bs { font-size: 14px; color: var(--tx2); }
	.roles { display: flex; flex-wrap: wrap; gap: 6px; }
	.bk { margin-left: auto; display: flex; gap: 28px; flex-wrap: wrap; }
	.mu .mus { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 10px; }
	.mg { display: flex; justify-content: space-around; gap: 6px; }
	.mh { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
	.mh .bar { width: 44px; }
	.mh b { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.div { width: 1px; align-self: stretch; background: var(--ln2); }
	.none { color: var(--mu2); padding: 14px 0; }
	.mfoot { display: flex; align-items: center; gap: 10px; margin-top: 14px; font-size: 13px; color: var(--mu); }
	.mfoot .dot { flex: 1; height: 1px; background: var(--ln2); }
	.splits { display: grid; }
	@media (max-width: 1100px) { .splits { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
	.spl .ch { font-size: 16px; }
	.si { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; font-size: 13px; background: var(--p3); color: var(--bl); }
	.si-orange { color: var(--or); } .si-blue { color: var(--ti); }
	.mp { font-size: 13px; font-weight: 700; color: var(--bl); }
	.bl { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: 10px; margin-bottom: 12px; }
	.bl b { font-size: 14px; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
	.st5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 4px 0 14px; text-align: center; }
	.st5 span { display: flex; flex-direction: column; gap: 3px; font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
	.st5 i { font-style: normal; font-size: 12px; font-weight: 800; }
	.sub.c { text-align: center; }
	.pby { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
	.pb { display: inline-flex; align-items: baseline; gap: 5px; padding: 3px 8px; border: 0; border-radius: 6px; background: var(--p3); color: var(--tx); font-size: 12.5px; cursor: pointer; }
	.pb:hover { background: var(--ln2); }
	.pb small { color: var(--mu); font-size: 11px; }
	.talents { display: flex; flex-direction: column; }
	.tal { display: grid; grid-template-columns: 34px 1fr 1fr; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
	.tal:last-child { border-bottom: 0; }
	.tier { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; font-size: 12px; font-weight: 800; color: #fff; }
	.tier.c-red { background: #b8322f; } .tier.c-blue { background: #2a64c4; } .tier.c-green { background: #2b8a43; } .tier.c-purple { background: #7b45c9; }
	.opt { display: flex; flex-direction: column; gap: 5px; min-width: 0; opacity: 0.7; }
	.opt.hot { opacity: 1; }
	.opt.wide { grid-column: span 2; }
	.on { display: flex; align-items: baseline; gap: 8px; }
	.on b { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.on em { margin-left: auto; font-style: normal; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
	.opt small { font-size: 12px; color: var(--mu); }
	.sub.sp { margin-top: 20px; }
	.types { display: flex; flex-direction: column; gap: 8px; }
	.ty { display: grid; grid-template-columns: 100px 1fr 48px; align-items: center; gap: 10px; font-size: 13px; }
	.ty span:first-child { color: var(--tx2); }
	.ty b { text-align: right; font-variant-numeric: tabular-nums; }
	.builds { display: flex; flex-direction: column; gap: 8px; }
	.build { display: grid; grid-template-columns: 160px 1fr; gap: 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
	.bw { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.bw small { color: var(--mu); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.path { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
	.arr { color: var(--mu2); }
	.cc { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 3px; border-radius: 999px; font-size: 12.5px; background: var(--p3); }
	.cc i { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 3px; border-radius: 999px; font-style: normal; font-size: 10.5px; font-weight: 800; color: #fff; }
	.cc.c-red i { background: #b8322f; } .cc.c-blue i { background: #2a64c4; } .cc.c-green i { background: #2b8a43; } .cc.c-purple i { background: #7b45c9; }
	@media (max-width: 760px) {
		.bk { margin-left: 0; gap: 18px; }
		.bn h2 { font-size: 28px; }
		.tal { grid-template-columns: 30px 1fr; row-gap: 10px; }
		.tal .opt, .opt.wide { grid-column: 2; }
		.tal .tier { grid-row: span 2; align-self: start; }
		.build { grid-template-columns: 1fr; gap: 6px; }
	}
</style>
