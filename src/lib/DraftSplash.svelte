<script lang="ts" context="module">
	import type { DraftSystem, Team } from '$lib/match';
	// The hero-draft splash: ONE ceremony per draft system, made from the game's own art (2026-10-22, second
	// round — the first three looks were generic emblems + chips):
	//   All Pick     = THE MUSTER  — every hero's symbol drops onto a honeycomb of board hexes, rippling out from the middle
	//   All Random   = THE DEAL    — a deck of hero cards is riffled, dealt face down to every seat, then turned up
	//   Single Draft = THREE FATES — three cards rise into your hand and turn over: your three heroes, yours alone
	//   Pick & Ban   = THE STRIKE  — a frieze of hero paintings; each team's blade cuts one in two
	// Mounting plays it once (after the art has loaded, ≤ 1.2 s), then it fades and removes itself.
	export const DRAFT_SPLASH_MS: Record<DraftSystem, number> = { 'all-pick': 4800, 'all-random': 6000, 'single-draft': 5400, 'pick-ban': 5400 };
	export const DRAFT_TITLES: Record<DraftSystem, string> = { 'all-pick': 'All Pick', 'all-random': 'All Random', 'single-draft': 'Single Draft', 'pick-ban': 'Pick & Ban' };
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { HEROES, heroById, heroLogo, heroSplash, splashFace } from '$lib/heroes';
	import { teamName } from '$lib/teams';
	import CardBack from '$lib/cards/CardBack.svelte';

	export let system: DraftSystem = 'all-pick';
	export let seats = 4; // 4 or 6
	export let coin: Team = 'orange'; // the team holding the tie-breaker
	export let myTeam: Team | null = null; // viewer-relative: the enemy on the left (top on phones)
	export let mobile = false;
	/** the room's hero pool (All Pick's honeycomb, Pick & Ban's frieze); empty = every hero */
	export let pool: string[] = [];
	/** Single Draft: the viewer's three dealt heroes (fewer = a watcher: the cards stay face down) */
	export let offer: string[] = [];
	/** All Random: the hero dealt to each seat, in seat order (first half Atlanteans); empty = made up (demo) */
	export let dealt: string[] = [];
	export let onDone: (() => void) | null = null;

	// everything below is fixed once per run (a reactive pick would re-deal on every prop change)
	const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
	const mixed = shuffle((pool.length ? pool : HEROES.map((h) => h.id)).filter((id) => heroById(id)));
	const left: Team = myTeam === 'orange' ? 'blue' : 'orange';
	const right: Team = left === 'orange' ? 'blue' : 'orange';
	const other: Team = coin === 'orange' ? 'blue' : 'orange'; // turn-based drafts: this team picks (and bans) first
	const ph = mobile;
	const half = seats / 2;

	const face = (id: string) => { const [x, y] = splashFace(id); return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`; };
	const nm = (id: string) => heroById(id)?.name ?? '';

	// ── All Pick: the honeycomb (pointy-top hexes, rows alternate long / short, the last row centred) ──
	const HW = ph ? 100 : 88, HH = HW * 1.1547, HG = 6;
	const tiles = (() => {
		if (system !== 'all-pick') return [];
		const cols = ph ? 6 : 9, rows: string[][] = [];
		for (let i = 0; i < mixed.length; ) { const n = rows.length % 2 ? cols - 1 : cols; rows.push(mixed.slice(i, i + n)); i += n; }
		const pitchY = HH * 0.75 + HG;
		return rows.flatMap((row, r) => row.map((id, c) => {
			const x = (c - (row.length - 1) / 2) * (HW + HG), y = (r - (rows.length - 1) / 2) * pitchY;
			return { id, x, y, d: Math.hypot(x, y) / (HW + HG) };
		}));
	})();
	const combH = tiles.length ? Math.max(...tiles.map((t) => t.y)) * 2 + HH : 0;

	// ── All Random: seats (desktop: enemy left / yours right, from the middle out; phone: enemy row on top),
	// the deck in the gap between the teams; dealt alternately enemy, yours, enemy … ──
	const CW = ph ? 180 : 128, CH = CW / 0.716, CG = 14, MID = 72;
	const deals = (() => {
		if (system !== 'all-random') return [];
		const ids = dealt.length === seats ? dealt : mixed.slice(0, seats);
		const byTeam: Record<Team, string[]> = { orange: ids.slice(0, half), blue: ids.slice(half) };
		const out: { id: string; team: Team; x: number; y: number; k: number }[] = [];
		for (const [t, side] of [[left, -1], [right, 1]] as [Team, number][])
			byTeam[t].forEach((id, j) => out.push({
				id, team: t, k: j * 2 + (side < 0 ? 0 : 1),
				x: ph ? (j - (half - 1) / 2) * (CW + CG) : side * (MID + CW / 2 + j * (CW + CG)),
				y: ph ? side * (CH / 2 + 62) : 0
			}));
		return out;
	})();
	const deck = { x: 0, y: 0 };
	const deckW = ph ? 84 : 96;
	const teamW = half * (CW + CG) - CG;

	// ── Single Draft: the fan ──
	const FW = ph ? 212 : 210, FH = FW / 0.716;
	const watcher = system === 'single-draft' && offer.length < 3;
	const fan = system === 'single-draft' ? [0, 1, 2].map((k) => ({ k, id: offer[k] ?? '', x: (k - 1) * (FW + (ph ? 8 : 22)), y: k === 1 ? 0 : 16, r: (k - 1) * 7 })) : [];

	// ── Pick & Ban: the frieze; the second slice falls to the left team's blade, the second-last to the right's ──
	const SN = ph ? 5 : 7, SW = ph ? 112 : 116, SH = ph ? 380 : 330;
	const slices = system === 'pick-ban' ? mixed.slice(0, SN).map((id, i) => ({ id, i })) : [];
	const cut = (i: number): Team | null => (i === 1 ? left : i === SN - 2 ? right : null);
	const cutAt = (t: Team) => (t === other ? 1.5 : 2.15); // seconds: the team without the coin strikes first

	// wait for the art (≤ 1.2 s) so nothing slams in blank, then play; fade out at the end
	let go = false, out = false, alive = true;
	const timers: ReturnType<typeof setTimeout>[] = [];
	function urls(): string[] {
		if (system === 'all-pick') return tiles.map((t) => heroLogo(t.id));
		if (system === 'all-random') return deals.flatMap((d) => [heroSplash(d.id), heroLogo(d.id)]);
		if (system === 'single-draft') return offer.map(heroSplash);
		return slices.map((s) => heroSplash(s.id));
	}
	onMount(() => {
		const load = (u: string) => new Promise<void>((res) => {
			const im = new Image();
			im.onload = () => (im.decode ? im.decode().catch(() => {}).then(() => res()) : res());
			im.onerror = () => res();
			im.src = u;
		});
		Promise.race([Promise.all(urls().filter(Boolean).map(load)), new Promise((r) => setTimeout(r, 1200))]).then(() => {
			if (!alive) return;
			go = true;
			const ms = DRAFT_SPLASH_MS[system];
			timers.push(setTimeout(() => (out = true), ms - 500));
			timers.push(setTimeout(() => { alive = false; onDone?.(); }, ms));
		});
	});
	onDestroy(() => { alive = false; timers.forEach(clearTimeout); });
</script>

{#snippet heading(line: 'first' | 'swap' | 'pool' | 'mine')}
	<div class="head">
		<span class="kick">Hero draft</span>
		<span class="ttl">{DRAFT_TITLES[system]}</span>
		<span class="rule"></span>
		<span class="line">
			{#if line === 'pool'}Every hero in the pool <i>·</i> everyone picks at once
			{:else if line === 'swap'}One hero dealt to each <i>·</i> teammates may trade
			{:else if line === 'mine'}{watcher ? 'Three heroes for each player' : 'Dealt to you alone'} <i>·</i> <b class="t-{other}">the {teamName(other)}</b> pick first
			{:else}One ban a team <i>·</i> <b class="t-{other}">the {teamName(other)}</b> strike first{/if}
		</span>
	</div>
{/snippet}

{#if alive}
	<div class="ds {system}" class:ph class:go class:out role="status" aria-live="polite" aria-label="Hero draft: {DRAFT_TITLES[system]}"
		style="--l:var(--{left}); --r:var(--{right})">
		<span class="veil"></span>
		<span class="edge el"></span><span class="edge er"></span>

		{#if system === 'all-pick'}
			<div class="stage">
				<div class="comb" style="--hw:{HW}; --hh:{HH}; height:calc(var(--u) * {combH})">
					<span class="ripple"></span>
					{#each tiles as t (t.id)}
						<span class="tile" style="--x:{t.x}; --y:{t.y}; --d:{t.d.toFixed(2)}">
							<span class="bob">
								<svg viewBox="0 0 100 115.47" aria-hidden="true"><path d="M50 2.5L97.5 29.9V85.6L50 113 2.5 85.6V29.9z" class="hexf" /><path d="M50 9L91.5 33V82.5L50 106.5 8.5 82.5V33z" class="hexi" /></svg>
								<img src={heroLogo(t.id)} alt="" />
							</span>
						</span>
					{/each}
				</div>
				{@render heading('pool')}
			</div>

		{:else if system === 'all-random'}
			<div class="stage">
				{@render heading('swap')}
				<div class="table" style="height:calc(var(--u) * {ph ? CH * 2 + 240 : CH + 90})">
					<div class="deck" style="--x:{deck.x}; --y:{deck.y}; width:calc(var(--u) * {deckW})">
						<span class="dk">
							{#each Array(8) as _, k (k)}
								<span class="rf" style="--k:{k}; --s:{k % 2 ? 1 : -1}"><CardBack hero={k === 7 ? mixed[0] : ''} blank={k !== 7} /></span>
							{/each}
						</span>
					</div>
					{#each deals as s (s.k)}
						<div class="seat t-{s.team}" style="--x:{s.x}; --y:{s.y}; --k:{s.k}; --dx:{deck.x - s.x}; --dy:{deck.y - s.y}; --sp:{s.team === left ? -1 : 1}; width:calc(var(--u) * {CW})">
							<span class="flip">
								<span class="back"><CardBack hero={s.id} /></span>
								<span class="front">
									<img src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" />
									<span class="plate">{nm(s.id)}</span>
									<span class="glint"></span>
								</span>
							</span>
						</div>
					{/each}
					{#each [left, right] as t (t)}
						<span class="tname t-{t}" style="--tx:{ph ? 0 : (t === left ? -1 : 1) * (MID + teamW / 2)}; --ty:{ph ? (t === left ? -1 : 1) * (CH + 104) : CH / 2 + 34}">{teamName(t)}</span>
					{/each}
				</div>
			</div>

		{:else if system === 'single-draft'}
			<div class="stage">
				{@render heading('mine')}
				<div class="hand" style="height:calc(var(--u) * {FH + 40})">
					{#each fan as c (c.k)}
						<div class="fc" style="--x:{c.x}; --y:{c.y}; --r:{c.r}; --k:{c.k}; width:calc(var(--u) * {FW})">
							<span class="flip" class:still={watcher}>
								<span class="back"><CardBack hero={watcher ? '' : c.id} /></span>
								{#if !watcher}
									<span class="front">
										<img src={heroSplash(c.id)} alt="" style="object-position:{face(c.id)}" />
										<span class="plate"><b>{nm(c.id)}</b><small>{heroById(c.id)?.title ?? ''}</small></span>
										<span class="glint"></span>
									</span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
			</div>

		{:else}
			<div class="stage">
				<div class="frieze" style="height:calc(var(--u) * {SH + 30})">
					{#each slices as s (s.id)}
						{@const t = cut(s.i)}
						<div class="sl" class:cut={t} style="--i:{s.i}; --n:{SN}; --at:{t ? cutAt(t) : 0}s; --c:var(--{t ?? 'orange'}); width:calc(var(--u) * {SW}); height:calc(var(--u) * {SH})">
							<span class="sin">
								{#if t}
									<span class="half a"><img class="grey" src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" /><img class="col" src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" /></span>
									<span class="half b"><img class="grey" src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" /><img class="col" src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" /></span>
									<span class="slash"></span>
								{:else}
									<span class="whole"><img src={heroSplash(s.id)} alt="" style="object-position:{face(s.id)}" /></span>
								{/if}
							</span>
						</div>
					{/each}
				</div>
				{@render heading('first')}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* sizes in --u (one design px); only transform / opacity animate, and only once .go is set */
	.ds { --orange: #ef7d22; --blue: #2f7fe6; --orange-hi: #ffb878; --blue-hi: #8fc0ff; --brass: #d8b36a; --brass-hi: #f4dfa8; --ink: #f4efe3;
		--u: clamp(.42px, min(calc(100vw / 1150), calc(100dvh / 800)), 1.4px);
		position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; pointer-events: none; overflow: hidden; color: var(--ink);
		opacity: 1; transition: opacity .5s ease; }
	.ds.ph { --u: clamp(.3px, min(calc(100vw / 760), calc(100dvh / 1120)), 1px); }
	.ds.out { opacity: 0; }
	.ds:not(.go) .stage, .ds:not(.go) .edge { visibility: hidden; }
	.veil { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 46%, rgba(6, 20, 36, .96), rgba(2, 7, 14, .99)); }
	.go .veil { animation: fadein .35s ease both; }
	.edge { position: absolute; top: 0; bottom: 0; width: 34%; opacity: 0; }
	.el { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--l) 30%, transparent), transparent); }
	.er { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--r) 30%, transparent), transparent); }
	.ph .edge { left: 0; right: 0; width: auto; height: 28%; }
	.ph .el { top: 0; bottom: auto; background: linear-gradient(180deg, color-mix(in srgb, var(--l) 26%, transparent), transparent); }
	.ph .er { top: auto; bottom: 0; background: linear-gradient(0deg, color-mix(in srgb, var(--r) 26%, transparent), transparent); }
	.go .edge { animation: fadein .9s ease .2s both; }
	@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }

	.stage { position: relative; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 34); }
	.t-orange { --tc: var(--orange); --th: var(--orange-hi); }
	.t-blue { --tc: var(--blue); --th: var(--blue-hi); }

	/* ── the heading: a small kicker, the name in brass, a rule drawing out, one line of plain facts ── */
	.head { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 8); text-align: center; }
	.kick { font-size: calc(var(--u) * 15); letter-spacing: .42em; padding-left: .42em; text-transform: uppercase; color: var(--brass); opacity: 0; }
	.ttl { font-size: calc(var(--u) * 86); line-height: .95; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap; opacity: 0;
		background: linear-gradient(180deg, #fff8e4 0%, #f4dfa8 45%, #b88a3e 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 calc(var(--u) * 4) calc(var(--u) * 10) rgba(0, 0, 0, .75)); }
	.ph .ttl { font-size: calc(var(--u) * 82); }
	.rule { width: calc(var(--u) * 420); height: calc(var(--u) * 2); background: linear-gradient(90deg, transparent, var(--brass) 20%, var(--brass-hi) 50%, var(--brass) 80%, transparent); transform: scaleX(0); }
	.line { font-size: calc(var(--u) * 22); letter-spacing: .04em; color: #cfd8e3; opacity: 0; white-space: nowrap; }
	.ph .line { font-size: calc(var(--u) * 28); }
	.line i { font-style: normal; color: var(--brass); padding: 0 .3em; }
	.line b { font-weight: normal; color: var(--th); }
	.go .kick { animation: rise .6s cubic-bezier(.2, .9, .2, 1) var(--hd, .25s) both; }
	.go .ttl { animation: titlein .75s cubic-bezier(.16, 1, .3, 1) calc(var(--hd, .25s) + .08s) both; }
	.go .rule { animation: draw .8s cubic-bezier(.6, 0, .2, 1) calc(var(--hd, .25s) + .35s) both; }
	.go .line { animation: rise .6s cubic-bezier(.2, .9, .2, 1) var(--ld, 1.2s) both; }
	@keyframes rise { from { opacity: 0; transform: translateY(calc(var(--u) * 12)); } to { opacity: 1; transform: none; } }
	@keyframes titlein { from { opacity: 0; transform: scale(1.18); } to { opacity: 1; transform: none; } }
	@keyframes draw { from { transform: scaleX(0); } to { transform: scaleX(1); } }

	/* ── ALL PICK · the muster ── */
	.all-pick { --hd: 1.05s; --ld: 1.6s; }
	.comb { position: relative; width: 1px; }
	.tile { position: absolute; left: 0; top: 50%; width: calc(var(--u) * var(--hw)); height: calc(var(--u) * var(--hh));
		margin: calc(var(--u) * var(--hh) / -2) 0 0 calc(var(--u) * var(--hw) / -2);
		transform: translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))); opacity: 0; }
	.go .tile { animation: land .55s cubic-bezier(.3, 1.4, .5, 1) calc(.15s + var(--d) * .1s) both; }
	@keyframes land {
		from { opacity: 0; transform: translate(calc(var(--u) * var(--x)), calc(var(--u) * (var(--y) - 46))) scale(1.35); }
		40% { opacity: 1; }
		to { opacity: 1; transform: translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))) scale(1); } }
	.bob { position: absolute; inset: 0; display: grid; place-items: center; }
	.go .bob { animation: lift .7s ease-in-out calc(1.75s + var(--d) * .09s) both; }
	@keyframes lift { 0%, 100% { transform: none; } 45% { transform: translateY(calc(var(--u) * -9)) scale(1.07); } }
	.bob svg { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 calc(var(--u) * 5) calc(var(--u) * 6) rgba(0, 0, 0, .55)); }
	.hexf { fill: #0c1f33; stroke: var(--brass); stroke-width: 3; }
	.hexi { fill: rgba(255, 255, 255, .03); stroke: rgba(216, 179, 106, .32); stroke-width: 1.2; }
	.bob img { position: relative; width: 70%; height: 62%; object-fit: contain; filter: drop-shadow(0 calc(var(--u) * 2) calc(var(--u) * 3) rgba(0, 0, 0, .6)); }
	/* the swell that runs out from the middle, lifting each symbol as it passes */
	.ripple { position: absolute; left: 0; top: 50%; width: calc(var(--u) * 200); height: calc(var(--u) * 200); margin: calc(var(--u) * -100) 0 0 calc(var(--u) * -100);
		border-radius: 50%; border: calc(var(--u) * 3) solid rgba(244, 223, 168, .55); opacity: 0; }
	.go .ripple { animation: swell 1.6s cubic-bezier(.2, .6, .3, 1) 1.65s both; }
	@keyframes swell { from { opacity: .9; transform: scale(.2); } to { opacity: 0; transform: scale(5.4); } }

	/* ── shared: a card that turns over (flat scaleX squash; the faces swap edge-on) ── */
	.flip { position: relative; display: block; width: 100%; aspect-ratio: 0.716; }
	.back, .front { position: absolute; inset: 0; border-radius: calc(var(--u) * 9); overflow: hidden; box-shadow: 0 calc(var(--u) * 10) calc(var(--u) * 22) rgba(0, 0, 0, .6); }
	.front { transform: scaleX(0); background: #0b1626; outline: calc(var(--u) * 3) solid var(--tc, var(--brass)); outline-offset: calc(var(--u) * -1); }
	.front::after { content: ''; position: absolute; inset: calc(var(--u) * 6); border: 1px solid rgba(244, 223, 168, .55); border-radius: calc(var(--u) * 5); }
	.front img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
	.plate { position: absolute; left: 0; right: 0; bottom: 0; padding: calc(var(--u) * 34) calc(var(--u) * 8) calc(var(--u) * 12); text-align: center;
		background: linear-gradient(180deg, transparent, rgba(3, 9, 18, .92) 60%); font-size: calc(var(--u) * 22); letter-spacing: .06em; text-transform: uppercase; color: #fff; }
	.glint { position: absolute; inset: -20% -60%; background: linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, .55) 50%, transparent 60%); transform: translateX(-70%); opacity: 0; }
	@keyframes flipout { from { transform: scaleX(1); } to { transform: scaleX(0); } }
	@keyframes flipin { 0% { transform: scaleX(0); } 70% { transform: scaleX(1.06) scaleY(1.03); } 100% { transform: none; } }
	@keyframes glint { 0% { opacity: 0; transform: translateX(-70%); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateX(70%); } }

	/* ── ALL RANDOM · the deal ── */
	.all-random { --hd: .2s; --ld: 3.9s; }
	.table { position: relative; width: 1px; }
	.deck { position: absolute; left: 0; top: 50%; aspect-ratio: 0.716; transform: translate(-50%, -50%) translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))); opacity: 0; }
	.go .deck { animation: deckin .45s cubic-bezier(.2, .9, .2, 1) .1s both; }
	@keyframes deckin { from { opacity: 0; transform: translate(-50%, -50%) translate(calc(var(--u) * var(--x)), calc(var(--u) * (var(--y) + 60))); } to { opacity: 1; transform: translate(-50%, -50%) translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))); } }
	.dk { position: absolute; inset: 0; }
	.go .dk { animation: deckout .4s ease 3.25s forwards; }
	@keyframes deckout { to { opacity: 0; transform: scale(.85); } }
	.rf { position: absolute; inset: 0; border-radius: calc(var(--u) * 7); overflow: hidden; box-shadow: 0 calc(var(--u) * 3) calc(var(--u) * 6) rgba(0, 0, 0, .5);
		transform: translateY(calc(var(--u) * var(--k) * -1.6)); }
	.go .rf { animation: riffle 1.05s cubic-bezier(.5, 0, .3, 1) calc(.55s + var(--k) * .035s) both; }
	@keyframes riffle {
		0% { transform: translateY(calc(var(--u) * var(--k) * -1.6)); }
		30%, 48% { transform: translate(calc(var(--u) * var(--s) * 74), calc(var(--u) * (var(--k) * -1.6 - 10))) rotate(calc(var(--s) * 11deg)); }
		100% { transform: translateY(calc(var(--u) * var(--k) * -1.6)); } }
	.seat { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%) translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))); }
	.seat .flip { opacity: 0; }
	.go .seat .flip { animation: deal .6s cubic-bezier(.2, .8, .25, 1) calc(1.7s + var(--k) * .17s) both; }
	@keyframes deal {
		0% { opacity: 0; transform: translate(calc(var(--u) * var(--dx)), calc(var(--u) * var(--dy))) rotate(calc(var(--sp) * -200deg)) scale(.7); }
		12% { opacity: 1; }
		100% { opacity: 1; transform: none; } }
	.go .seat .back { animation: flipout .14s ease-in calc(3.25s + var(--k) * .12s) forwards; }
	.go .seat .front { animation: flipin .3s ease-out calc(3.39s + var(--k) * .12s) forwards; }
	.go .seat .glint { animation: glint .7s ease-out calc(3.6s + var(--k) * .12s) both; }
	.seat .plate { font-size: calc(var(--u) * 19); }
	.ph .seat .plate { font-size: calc(var(--u) * 24); }
	.tname { position: absolute; left: 0; top: 50%; white-space: nowrap; font-size: calc(var(--u) * 20); letter-spacing: .3em; text-transform: uppercase; color: var(--th); opacity: 0;
		transform: translate(-50%, -50%) translate(calc(var(--u) * var(--tx)), calc(var(--u) * var(--ty))); }
	.ph .tname { font-size: calc(var(--u) * 26); }
	.go .tname { animation: fadein .6s ease 2.9s both; }

	/* ── SINGLE DRAFT · three fates ── */
	.single-draft { --hd: .2s; --ld: 2.5s; }
	.hand { position: relative; width: 1px; }
	.fc { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%) translate(calc(var(--u) * var(--x)), calc(var(--u) * var(--y))) rotate(calc(var(--r) * 1deg)); transform-origin: 50% 120%; }
	.fc .flip { opacity: 0; }
	.go .fc .flip { animation: rise3 .8s cubic-bezier(.16, 1, .3, 1) calc(.35s + var(--k) * .12s) both; }
	@keyframes rise3 { from { opacity: 0; transform: translate(calc(var(--u) * var(--x) * -1), calc(var(--u) * 340)) rotate(calc(var(--r) * -1deg)) scale(.8); } 30% { opacity: 1; } to { opacity: 1; transform: none; } }
	.go .fc .back { animation: flipout .16s ease-in calc(1.45s + var(--k) * .38s) forwards; }
	.go .fc .front { animation: flipin .34s ease-out calc(1.61s + var(--k) * .38s) forwards; }
	.go .fc .glint { animation: glint .8s ease-out calc(1.85s + var(--k) * .38s) both; }
	.go .fc .still .back { animation: none; }
	.fc .plate { display: flex; flex-direction: column; gap: calc(var(--u) * 3); }
	.fc .plate b { font-weight: normal; font-size: calc(var(--u) * 30); }
	.fc .plate small { font-size: calc(var(--u) * 15); letter-spacing: .1em; color: var(--brass-hi); text-transform: none; }

	/* ── PICK & BAN · the strike ── */
	.pick-ban { --hd: .9s; --ld: 2.9s; }
	.frieze { display: flex; align-items: center; gap: calc(var(--u) * 12); }
	.sl { position: relative; flex: none; opacity: 0; transform: skewX(-8deg); }
	.go .sl { animation: slicein .6s cubic-bezier(.16, 1, .3, 1) calc(.1s + var(--i) * .07s) both; }
	@keyframes slicein { from { opacity: 0; transform: translateY(calc(var(--u) * (var(--i) - var(--n) / 2) * 30)) skewX(-8deg) scaleY(.6); } to { opacity: 1; transform: skewX(-8deg); } }
	.sin { position: absolute; inset: 0; }
	.go .cut .sin { animation: jolt .3s ease-out calc(var(--at) + .05s); }
	@keyframes jolt { 30% { transform: translateX(calc(var(--u) * 8)); } }
	.whole, .half { position: absolute; inset: 0; overflow: hidden; border: calc(var(--u) * 2) solid rgba(216, 179, 106, .7); box-shadow: 0 calc(var(--u) * 10) calc(var(--u) * 20) rgba(0, 0, 0, .55); }
	.sl img { max-width: none; position: absolute; top: 0; left: -25%; width: 150%; height: 100%; object-fit: cover; transform: skewX(8deg); }
	.half.a { clip-path: polygon(-5% -5%, 105% -5%, 105% 40%, -5% 60%); }
	.half.b { clip-path: polygon(-5% 60%, 105% 40%, 105% 105%, -5% 105%); }
	.half .grey { filter: grayscale(1) brightness(.45) contrast(1.1); }
	.go .half .col { animation: drain .5s ease calc(var(--at) + .12s) forwards; }
	@keyframes drain { to { opacity: 0; } }
	.go .half.a { animation: parta .7s cubic-bezier(.2, .9, .3, 1) calc(var(--at) + .08s) forwards; }
	.go .half.b { animation: partb .7s cubic-bezier(.2, .9, .3, 1) calc(var(--at) + .08s) forwards; }
	@keyframes parta { to { transform: translate(calc(var(--u) * -9), calc(var(--u) * -14)) rotate(-3deg); } }
	@keyframes partb { to { transform: translate(calc(var(--u) * 9), calc(var(--u) * 16)) rotate(3deg); } }
	/* the blade: a white-hot core in the striking team's colour, drawn across the slice along the cut */
	.slash { position: absolute; left: -45%; right: -45%; top: 50%; height: calc(var(--u) * 7); margin-top: calc(var(--u) * -3.5); border-radius: 999px;
		background: linear-gradient(90deg, transparent, var(--c) 18%, #fff 50%, var(--c) 82%, transparent);
		box-shadow: 0 0 calc(var(--u) * 14) var(--c); transform: rotate(-34deg) scaleX(0); opacity: 0; }
	.go .slash { animation: slash .55s cubic-bezier(.7, 0, .2, 1) var(--at) both; }
	@keyframes slash { 0% { opacity: 1; transform: rotate(-34deg) scaleX(0); } 35% { opacity: 1; transform: rotate(-34deg) scaleX(1); } 100% { opacity: .55; transform: rotate(-34deg) scaleX(1); } }

	@media (prefers-reduced-motion: reduce) {
		.go * { animation-duration: .01s !important; animation-delay: 0s !important; }
	}
</style>
