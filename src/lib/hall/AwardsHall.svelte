<script lang="ts">
	// The Awards tab as a trophy hall: a banner (claimed / up for grabs / decorated), the MOST DECORATED podium (tap a
	// player to see only their awards), a filter row, then the awards under ribbon headers — silver = a single game,
	// gold = career, violet = the extras — claimed first, the open ones dashed at the end.
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
		'killing-spree': 'fire', indomitable: 'shield', wingman: 'assist', 'wicked-sick': 'minion',
		unstoppable: 'bolt', untouchable: 'shield', 'death-wish': 'death', swinging: 'kill',
		dominating: 'laurel', cursed: 'mask', 'first-blood': 'drop', godlike: 'star', rampage: 'fire', relentless: 'target', pacifist: 'dove',
		speedrun: 'hourglass', marathon: 'hourglass', hoard: 'coins', 'old-money': 'coins', commitment: 'swap', 'one-trick': 'target',
		ace: 'trophy', shutdown: 'lock', payback: 'swap', 'two-birds': 'kill', 'giant-slayer': 'target', 'bounty-hunter': 'coins',
		'heavy-lifter': 'minion', brink: 'life', 'throne-breaker': 'throne', ascended: 'gear', fed: 'death', carry: 'trophy'
	};
	type Grp = 'game' | 'career' | 'extra';
	const grpOf = (a: Award): Grp => (a.extra ? 'extra' : a.scope);
	const GROUPS: { k: Grp; label: string; metal: string }[] = [
		{ k: 'game', label: 'Single game', metal: 'silver' },
		{ k: 'career', label: 'Career', metal: 'gold' },
		{ k: 'extra', label: 'Extras', metal: 'violet' }
	];

	let show: 'all' | Grp | 'open' = 'all';
	let holder: string | null = null;

	$: list = league.awards.filter((a) => !a.hidden);
	$: claimed = list.filter((a) => a.holders.length);
	// who: their name, colour and main hero (most games)
	$: whoMap = new Map(league.players.map((p) => [p.key, { name: p.name, color: p.color ? colorHex(p.color) : '', hero: Object.entries(p.heroes).sort((a, b) => b[1].games - a[1].games)[0]?.[0] ?? '' }]));
	const who = (k: string) => whoMap.get(k) ?? null;
	// the medal count of each player, by metal
	$: tally = (() => {
		const m = new Map<string, { key: string; total: number; game: number; career: number; extra: number }>();
		for (const a of claimed) for (const h of a.holders) {
			const t = m.get(h.key) ?? { key: h.key, total: 0, game: 0, career: 0, extra: 0 };
			t.total++; t[grpOf(a)]++;
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
		<span class="rays" aria-hidden="true"></span>
		<div class="bmed"><Medal metal="gold" glyph="trophy" size={92} /></div>
		<div class="btx">
			<span class="eyebrow">Hall of Records</span>
			<h2>The Trophy Hall</h2>
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
								<span class="pips"><i class="g">{s.t.career}</i><i class="s">{s.t.game}</i><i class="v">{s.t.extra}</i></span>
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
			{#each [['all', 'All'], ['game', 'Single game'], ['career', 'Career'], ['extra', 'Extras'], ['open', 'Up for grabs']] as [k, l] (k)}
				<button class:on={show === k} on:click={() => (show = k as typeof show)}>{l}</button>
			{/each}
		</div>
		{#if holder}<button class="hchip" on:click={() => (holder = null)}>Held by {who(holder)?.name} ✕</button>{/if}
	</div>

	{#each sections as sec (sec.k)}
		<section class="sec">
			<h3 class="ribbon m-{sec.metal}"><span>{sec.label}</span><small>{sec.all.filter((a) => a.holders.length).length} / {sec.all.length} claimed</small></h3>
			<div class="grid">
				{#each sec.items as a (a.id)}<AwardCard {a} glyph={ICON[a.id] ?? 'trophy'} {who} {onOpen} mine={!!holder && a.holders.some((h) => h.key === holder)} />{/each}
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
	.banner { position: relative; overflow: hidden; display: flex; align-items: center; gap: 22px; padding: 22px 28px; border-radius: 16px;
		background: radial-gradient(120% 140% at 12% 50%, rgba(216, 179, 106, 0.22), transparent 55%), linear-gradient(180deg, #123250, #071628); border: 1px solid rgba(216, 179, 106, 0.4); box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5); }
	.rays { position: absolute; left: -10%; top: 50%; width: 520px; height: 520px; margin-top: -260px; border-radius: 50%; pointer-events: none; opacity: 0.18;
		background: repeating-conic-gradient(from 0deg, rgba(244, 223, 168, 0.9) 0deg 5deg, transparent 5deg 15deg); -webkit-mask: radial-gradient(closest-side, #000 20%, transparent 100%); mask: radial-gradient(closest-side, #000 20%, transparent 100%); }
	.bmed { position: relative; flex: none; }
	.btx { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.eyebrow { font-size: 12px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--brass); }
	.btx h2 { margin: 0; font-size: 38px; font-weight: 400; letter-spacing: 0.04em; color: var(--brass-hi); text-shadow: 0 2px 10px rgba(0, 0, 0, 0.6); }
	.btx p { margin: 0; font-size: 14px; color: var(--ink-2); }
	.counts { position: relative; display: flex; gap: 10px; }
	.counts div { min-width: 92px; display: flex; flex-direction: column; align-items: center; padding: 10px 12px; border-radius: 12px; background: rgba(4, 14, 26, 0.6); border: 1px solid rgba(216, 179, 106, 0.25); }
	.counts b { font-weight: 400; font-size: 30px; line-height: 1; color: #fff; }
	.counts span { margin-top: 4px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-3); }
	/* ribbon headers */
	.ribbon { position: relative; align-self: center; display: flex; align-items: baseline; gap: 10px; margin: 0 auto; padding: 7px 34px; font-size: 16px; font-weight: 400; letter-spacing: 0.16em; text-transform: uppercase;
		color: #1b1204; background: linear-gradient(180deg, var(--ra), var(--rb)); clip-path: polygon(0 0, 100% 0, calc(100% - 14px) 50%, 100% 100%, 0 100%, 14px 50%); }
	.ribbon small { font-size: 11px; letter-spacing: 0.08em; opacity: 0.75; }
	.ribbon.m-gold { --ra: #f4dfa8; --rb: #c9a24a; }
	.ribbon.m-silver { --ra: #f1f5f9; --rb: #9aa7b5; }
	.ribbon.m-violet { --ra: #e3d0ff; --rb: #9b6be6; }
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
		.banner { flex-wrap: wrap; justify-content: center; text-align: center; padding: 18px; }
		.btx h2 { font-size: 30px; }
		.counts { width: 100%; justify-content: center; }
		.counts div { min-width: 0; flex: 1; }
		.grid { grid-template-columns: 1fr; }
		.steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.pface { width: 56px; height: 56px; } .p1 .pface { width: 66px; height: 66px; }
		.who b { font-size: 15px; }
	}
</style>
