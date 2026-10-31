<script lang="ts">
	// The Awards tab as a trophy hall: a banner (claimed / up for grabs / decorated), the MOST DECORATED podium (tap a
	// player to see only their awards), a filter row, then the awards under ribbon headers — silver = a single game,
	// gold = career, violet = the extras, bronze = the match moments (everyone who has earned one) — claimed first, the open ones dashed at the end.
	import type { League, Award } from '$lib/league';
	import { portraitCss } from '$lib/heroes';
	import { colorHex } from '$lib/match';
	import AwardCard from './AwardCard.svelte';
	import Medal from './Medal.svelte';
	import Glyph, { type GlyphName } from './Glyph.svelte';

	export let league: League;
	export let onOpen: (key: string) => void = () => {};

	const ICON: Record<string, GlyphName> = {
		'double-killer': 'kill', 'triple-killer': 'kill', 'ultra-killer': 'kill', 'mega-killer': 'kill',
		bloodthirsty: 'drop', respawn: 'death', enabler: 'assist', 'last-hit': 'minion',
		'iron-wall': 'shield', wingman: 'assist', 'wicked-sick': 'minion',
		unstoppable: 'bolt', indomitable: 'shield', 'death-wish': 'death', swinging: 'kill',
		dominating: 'laurel', cursed: 'mask', 'first-blood': 'drop', godlike: 'star', rampages: 'fire', relentless: 'target', pacifist: 'dove',
		speedrun: 'hourglass', marathon: 'hourglass', hoard: 'coins', 'old-money': 'coins', commitment: 'swap', 'one-trick': 'target',
		ace: 'trophy', shutdown: 'lock', payback: 'swap', 'two-birds': 'kill', 'giant-slayer': 'target', 'bounty-hunter': 'coins',
		'heavy-lifter': 'minion', brink: 'life', 'throne-breaker': 'throne', ascended: 'gear', ultimate: 'bolt', fed: 'death', carry: 'trophy', 'sharks-prey': 'drop', duelist: 'swap', 'perfect-storm': 'bolt', 'coin-collector': 'coins', nemesis: 'target',
		'guardian-angel': 'shield', 'avenging-angel': 'kill', closer: 'death', denied: 'shield', unbroken: 'shield', clutch: 'life', undertow: 'minion', 'early-bird': 'drop', 'spring-tide': 'minion'
	};
	// the match moments' own medals (ids 'm-<moment>')
	const MICON: Record<string, GlyphName> = {
		eye: 'swap', spree: 'fire', rampage: 'fire', relentless: 'target', savior: 'shield', punisher: 'kill', coup: 'death', denied: 'shield', breakwater: 'shield',
		'last-stand': 'life', ace: 'trophy', 'clean-sweep': 'minion', 'opening-strike': 'drop', 'fast-start': 'minion', blood: 'drop', 'bounty-claimed': 'coins',
		riposte: 'swap', chain: 'bolt', treasure: 'coins', apex: 'target', pacifist: 'dove'
	};
	const iconOf = (a: Award): GlyphName => (a.moment ? MICON[a.id.slice(2)] : ICON[a.id]) ?? 'trophy';
	type Grp = 'moment' | 'game' | 'career' | 'extra';
	const grpOf = (a: Award): Grp => (a.moment ? 'moment' : a.extra ? 'extra' : a.scope);
	const GROUPS: { k: Grp; label: string; metal: string }[] = [
		{ k: 'game', label: 'Single game', metal: 'silver' },
		{ k: 'career', label: 'Career', metal: 'gold' },
		{ k: 'extra', label: 'Extras', metal: 'violet' },
		{ k: 'moment', label: 'Moments', metal: 'bronze' }
	];

	let show: 'all' | Grp | 'open' = 'all';
	let holder: string | null = null;

	$: list = league.awards; // every award, the 4v4 / 5v5 ones too (up for grabs until those games happen)
	$: claimed = list.filter((a) => a.holders.length);
	// who: their name, colour and main hero (most games)
	$: whoMap = new Map(league.players.map((p) => [p.key, { name: p.name, color: p.color ? colorHex(p.color) : '', hero: Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games)[0]?.[0] ?? '' }]));
	const who = (k: string) => whoMap.get(k) ?? null;
	// the medal count of each player, by metal
	$: tally = (() => {
		const m = new Map<string, { key: string; total: number; game: number; career: number; extra: number; moment: number }>();
		for (const a of claimed) for (const h of a.holders) {
			const t = m.get(h.key) ?? { key: h.key, total: 0, game: 0, career: 0, extra: 0, moment: 0 };
			if (!a.moment) t.total++; // the podium ranks by records held; moments show in their own pip
			t[grpOf(a)]++;
			m.set(h.key, t);
		}
		const rating = new Map(league.players.map((p) => [p.key, p.rating]));
		return [...m.values()].sort((a, b) => b.total - a.total || b.career - a.career || (rating.get(b.key) ?? 0) - (rating.get(a.key) ?? 0));
	})();
	$: podium = tally.slice(0, 3);
	$: rest = tally.slice(3);
	// podium order on screen: 2nd · 1st · 3rd
	$: steps = [podium[1], podium[0], podium[2]].map((t, i) => (t ? { t, place: [2, 1, 3][i] } : null));

	$: shown = list.filter((a) => (show === 'all' || (show === 'open' ? !a.holders.length : grpOf(a) === show)) && (!holder || a.holders.some((h) => h.key === holder)));
	$: sections = GROUPS.map((g) => ({ ...g, all: list.filter((a) => grpOf(a) === g.k), items: shown.filter((a) => grpOf(a) === g.k).sort((a, b) => (b.holders.length ? 1 : 0) - (a.holders.length ? 1 : 0)) })).filter((s) => s.items.length);
	const pick = (k: string) => (holder = holder === k ? null : k);
</script>

<div class="hall">
	<section class="banner">
		<span class="rays" aria-hidden="true"><i></i></span>
		<span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span><span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>
		<div class="bmed"><span class="halo" aria-hidden="true"></span><Medal metal="gold" glyph="trophy" size={124} art="tier-gold" /></div>
		<div class="btx">
			<span class="eyebrow">Hall of Records</span>
			<h2>The Trophy Hall</h2>
			<span class="brule" aria-hidden="true"><i></i></span>
			<p>Every award, and who holds it now. Beat the record and it's yours.</p>
		</div>
		<div class="counts">
			<div><b>{claimed.length}</b><span>claimed</span></div>
			<div><b>{list.length - claimed.length}</b><span>up for grabs</span></div>
			<div><b>{tally.length}</b><span>decorated</span></div>
		</div>
	</section>

	{#if podium.length}
		<section class="podium" aria-label="Most decorated">
			<h3 class="ribbon m-gold"><span>Most decorated</span></h3>
			<div class="steps">
				{#each steps as s, i (i)}
					{#if s}
						{@const w = who(s.t.key)}
						<button class="step p{s.place}" class:on={holder === s.t.key} on:click={() => pick(s.t.key)} title="Show only {w?.name}'s awards">
							<span class="who">
								<span class="pface" style="{w?.hero ? portraitCss(w.hero) : ''};--pc:{w?.color || 'var(--brass)'}"></span>
								<b>{w?.name}</b>
								<span class="pips"><i class="g">{s.t.career}</i><i class="s">{s.t.game}</i><i class="v">{s.t.extra}</i><i class="b">{s.t.moment}</i></span>
							</span>
							<span class="block"><em>{s.place}</em><small>{s.t.total} award{s.t.total === 1 ? '' : 's'}</small></span>
						</button>
					{:else}<span></span>{/if}
				{/each}
			</div>
			{#if rest.length}
				<div class="also">
					{#each rest as t (t.key)}
						{@const w = who(t.key)}
						<button class="chip" class:on={holder === t.key} on:click={() => pick(t.key)}><span class="cface" style="{w?.hero ? portraitCss(w.hero) : ''};--pc:{w?.color || 'var(--brass)'}"></span>{w?.name}<small>{t.total}</small></button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<div class="filters">
		<div class="seg" role="group" aria-label="Show">
			{#each [['all', 'All'], ['game', 'Single game'], ['career', 'Career'], ['extra', 'Extras'], ['moment', 'Moments'], ['open', 'Up for grabs']] as [k, l] (k)}
				<button class:on={show === k} on:click={() => (show = k as typeof show)}>{l}</button>
			{/each}
		</div>
		{#if holder}<button class="hchip" on:click={() => (holder = null)}>Held by {who(holder)?.name} ✕</button>{/if}
	</div>

	{#each sections as sec (sec.k)}
		<section class="sec">
			<h3 class="ribbon m-{sec.metal}"><span>{sec.label}</span><small>{sec.all.filter((a) => a.holders.length).length} / {sec.all.length} claimed</small></h3>
			<div class="grid">
				{#each sec.items as a (a.id)}<AwardCard {a} glyph={iconOf(a)} {who} {onOpen} mine={!!holder && a.holders.some((h) => h.key === holder)} />{/each}
			</div>
		</section>
	{:else}
		<p class="none">Nothing here yet.</p>
	{/each}
	{#if league.withClashes < league.games.length}<p class="fine">Defences and aces count the {league.withClashes} game{league.withClashes === 1 ? '' : 's'} recorded with them{league.withClashes ? '' : ' — they start with the next game'}.</p>{/if}
</div>

<style>
	.hall { display: flex; flex-direction: column; gap: 22px; }
	/* the banner */
	/* bold and epic (2026-10-31, the user): a deep gilded plaque — slowly turning sunburst (transform only), brass
	   corner brackets and a double frame, a big medal in a breathing halo (opacity only), the title in heavy
	   gold-leaf capitals over a rule with a diamond */
	.banner { position: relative; overflow: hidden; display: flex; align-items: center; gap: 30px; padding: 34px 44px; border-radius: 18px;
		background: radial-gradient(70% 160% at 14% 50%, rgba(232, 190, 98, 0.34), transparent 60%), radial-gradient(60% 120% at 100% 0%, rgba(47, 127, 230, 0.16), transparent 60%), linear-gradient(180deg, #14385c 0%, #0a2036 55%, #050f1c 100%);
		border: 1px solid rgba(232, 196, 120, 0.7); box-shadow: inset 0 0 0 5px rgba(3, 10, 20, 0.55), inset 0 0 0 6px rgba(216, 179, 106, 0.35), inset 0 -40px 60px rgba(0, 0, 0, 0.35), 0 18px 40px rgba(0, 0, 0, 0.6); }
	.rays { position: absolute; left: -330px; top: 50%; width: 1000px; height: 1000px; margin-top: -500px; pointer-events: none; opacity: 0.26;
		-webkit-mask: radial-gradient(closest-side, #000 12%, transparent 100%); mask: radial-gradient(closest-side, #000 12%, transparent 100%); }
	.rays i { position: absolute; inset: 0; border-radius: 50%; background: repeating-conic-gradient(from 0deg, rgba(255, 228, 160, 0.95) 0deg 4deg, transparent 4deg 12deg); animation: sun 120s linear infinite; }
	@keyframes sun { to { transform: rotate(360deg); } }
	.corner { position: absolute; width: 26px; height: 26px; border: 2px solid rgba(244, 223, 168, 0.75); pointer-events: none; }
	.corner.tl { left: 12px; top: 12px; border-right: 0; border-bottom: 0; border-top-left-radius: 6px; }
	.corner.tr { right: 12px; top: 12px; border-left: 0; border-bottom: 0; border-top-right-radius: 6px; }
	.corner.bl { left: 12px; bottom: 12px; border-right: 0; border-top: 0; border-bottom-left-radius: 6px; }
	.corner.br { right: 12px; bottom: 12px; border-left: 0; border-top: 0; border-bottom-right-radius: 6px; }
	.bmed { position: relative; flex: none; display: grid; place-items: center; }
	.halo { position: absolute; left: 50%; top: 42%; width: 220px; height: 220px; margin: -110px 0 0 -110px; border-radius: 50%; pointer-events: none;
		background: radial-gradient(closest-side, rgba(255, 220, 140, 0.55), rgba(255, 200, 100, 0.12) 55%, transparent 75%); animation: halo 4.5s ease-in-out infinite; }
	@keyframes halo { 0%, 100% { opacity: 0.55; transform: scale(0.94); } 50% { opacity: 1; transform: scale(1.04); } }
	.btx { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
	.eyebrow { font-family: 'Cinzel', Georgia, serif; font-weight: 700; font-size: 13px; letter-spacing: 0.34em; text-transform: uppercase; color: var(--brass); }
	.btx h2 { margin: 0; font-size: clamp(40px, 4.6vw, 64px); font-weight: 900; line-height: 1; letter-spacing: 0.06em; text-transform: uppercase;
		background: linear-gradient(180deg, #fffbe8 0%, #f7e3a6 32%, #d9b056 58%, #a7782a 82%, #e8c46e 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 3px 0 rgba(20, 10, 0, 0.55)) drop-shadow(0 0 18px rgba(255, 200, 100, 0.25)); }
	.brule { position: relative; display: block; width: min(440px, 100%); height: 2px; margin: 4px 0 2px; background: linear-gradient(90deg, rgba(244, 223, 168, 0.9), rgba(244, 223, 168, 0.25) 70%, transparent); }
	.brule i { position: absolute; left: 0; top: 50%; width: 10px; height: 10px; margin-top: -5px; transform: rotate(45deg); background: #f4dfa8; box-shadow: 0 0 8px rgba(255, 220, 140, 0.8); }
	.btx p { margin: 0; font-size: 15px; color: var(--ink-2); }
	.counts { position: relative; display: flex; gap: 12px; }
	.counts div { min-width: 104px; display: flex; flex-direction: column; align-items: center; padding: 12px 14px; border-radius: 12px;
		background: linear-gradient(180deg, rgba(10, 28, 48, 0.85), rgba(3, 10, 20, 0.85)); border: 1px solid rgba(232, 196, 120, 0.45); box-shadow: inset 0 1px 0 rgba(255, 230, 170, 0.15); }
	.counts b { font-family: 'Cinzel', Georgia, serif; font-weight: 900; font-size: 36px; line-height: 1; color: #f4dfa8; text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5); }
	@media (prefers-reduced-motion: reduce) { .rays i, .halo { animation: none; } }
	.counts span { margin-top: 4px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	/* ribbon headers */
	.ribbon { position: relative; align-self: center; display: flex; align-items: baseline; gap: 10px; margin: 0 auto; padding: 7px 34px; font-size: 16px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase;
		color: #1b1204; background: linear-gradient(180deg, var(--ra), var(--rb)); clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 50%, 100% 100%, 0 100%, 14px 50%); }
	.ribbon small { font-size: 11px; letter-spacing: 0.08em; opacity: 0.75; }
	.ribbon.m-gold { --ra: #f4dfa8; --rb: #c9a24a; }
	.ribbon.m-silver { --ra: #f1f5f9; --rb: #9aa7b5; }
	.ribbon.m-violet { --ra: #e3d0ff; --rb: #9b6be6; }
	.ribbon.m-bronze { --ra: #ffd6b0; --rb: #c27a44; }
	.sec { display: flex; flex-direction: column; gap: 14px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
	/* the podium */
	.podium { display: flex; flex-direction: column; gap: 14px; }
	.steps { display: grid; grid-template-columns: repeat(3, minmax(0, 220px)); justify-content: center; align-items: end; gap: 12px; }
	.step { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; cursor: pointer; }
	.who { display: flex; flex-direction: column; align-items: center; gap: 6px; transition: transform 0.15s ease; }
	.step:hover .who, .step.on .who { transform: translateY(-4px); }
	.pface { width: 76px; height: 76px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 3px var(--pc), 0 0 0 5px rgba(0, 0, 0, 0.5), 0 8px 18px rgba(0, 0, 0, 0.6); }
	.p1 .pface { width: 92px; height: 92px; }
	.who b { font-weight: 400; font-size: 18px; }
	.pips { display: flex; gap: 5px; }
	.pips i { min-width: 24px; padding: 1px 6px; border-radius: 6px; font-style: normal; font-size: 12px; text-align: center; color: #1b1204; }
	.pips .g { background: linear-gradient(180deg, #f4dfa8, #c9a24a); }
	.pips .s { background: linear-gradient(180deg, #f1f5f9, #9aa7b5); }
	.pips .v { background: linear-gradient(180deg, #e3d0ff, #9b6be6); }
	.pips .b { background: linear-gradient(180deg, #ffd6b0, #c27a44); }
	.block { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 10px 10px 0 0; border: 1px solid rgba(255, 255, 255, 0.1); border-bottom: 0; }
	.block em { font-style: normal; font-size: 34px; line-height: 1; color: #1b1204; }
	.block small { font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(27, 18, 4, 0.75); }
	.p1 .block { height: 110px; background: linear-gradient(180deg, #f4dfa8, #b98a3a); }
	.p2 .block { height: 82px; background: linear-gradient(180deg, #eef2f6, #8d99a8); }
	.p3 .block { height: 64px; background: linear-gradient(180deg, #f0c49c, #a8642f); }
	.step.on .block { box-shadow: 0 0 0 2px #fff; }
	.also { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
	.chip, .hchip { display: inline-flex; align-items: center; gap: 7px; padding: 3px 11px 3px 3px; border-radius: 999px; border: 1px solid var(--hair); background: var(--raise); color: var(--ink); font: inherit; font-size: 14px; cursor: pointer; }
	.chip.on { border-color: var(--brass); }
	.chip small { color: var(--brass-hi); }
	.cface { width: 24px; height: 24px; border-radius: 50%; background-color: #0b101a; background-repeat: no-repeat; box-shadow: 0 0 0 2px var(--pc); }
	/* filters */
	.filters { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; }
	.seg { display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--well); border: 1px solid var(--hair); max-width: 100%; overflow-x: auto; }
	.seg button { padding: 6px 16px; border-radius: 999px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; white-space: nowrap; cursor: pointer; }
	.seg button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.hchip { padding: 5px 14px; border-color: var(--brass); color: var(--brass-hi); }
	.none, .fine { margin: 0; text-align: center; color: var(--ink-3); }
	.fine { font-size: 12px; }
	@media (max-width: 760px) {
		.banner { flex-wrap: wrap; justify-content: center; text-align: center; padding: 26px 18px; gap: 16px; }
		.btx h2 { font-size: 34px; }
		.brule { margin-inline: auto; background: linear-gradient(90deg, transparent, rgba(244, 223, 168, 0.9), transparent); }
		.brule i { left: 50%; margin-left: -5px; }
		.counts { width: 100%; justify-content: center; }
		.counts div { min-width: 0; flex: 1; }
		.grid { grid-template-columns: 1fr; }
		.steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.pface { width: 56px; height: 56px; } .p1 .pface { width: 66px; height: 66px; }
		.who b { font-size: 15px; }
	}
</style>
