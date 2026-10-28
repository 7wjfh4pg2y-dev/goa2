<script lang="ts" context="module">
	/** One seated player at the reveal: `card` null = no card this turn (a pass); `card2` = Emmitt's second card */
	export type RevealEntry = { pid: string; name: string; hero: string; team: 'orange' | 'blue'; color: string; card: number | null; card2?: number | null; ini: number | null };
	export type RevealFace = 'brass' | 'player';
</script>

<script lang="ts">
	// The reveal curtain — 'Order of Play' (the user's pick, 2026-10-21): the cards are dealt face down in seat order
	// (the enemy first), turned highest initiative first, each initiative slammed in as a medallion (team-colour hex rim,
	// brass — or the player's colour — face, the number rolling up odometer-style, sparks + a ring), then slid into acting
	// order (rows when they don't fit one): brass arrows light in turn, a glow runs each row's track, and YOUR card
	// stands in the light (so every player sees their own place in the line-up; watchers see no spotlight). A coin sits where the tie-breaker settled a tie across the teams. Stays until a click / Esc.
	// The data is a SNAPSHOT taken as it opens (a later claim / Emmitt's pick doesn't re-deal it). Only transform /
	// opacity animate; one animation per element (pos = arrive · mv = sort · faces = flip · each medal layer its own).
	import { onMount } from 'svelte';
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroCards } from '$lib/cards/deck';

	export let entries: RevealEntry[] = [];
	/** acting order (match.ts turnPlan.order) and the indices whose card the coin settled (turnPlan.flips) */
	export let order: string[] = [];
	export let flips: number[] = [];
	export let turn = 1;
	export let myTeam: 'orange' | 'blue' = 'blue';
	/** the viewer's player id: their card gets the spotlight */
	export let me: string | null = null;
	export let mobile = false;
	export let face: RevealFace = 'brass';
	export let onClose: () => void = () => {};

	const coinArt = import.meta.glob('./images/hud/tiebreaker_*.webp', { eager: true, import: 'default' }) as Record<string, string>;
	const coin = (t: 'orange' | 'blue') => coinArt[`./images/hud/tiebreaker_${t}.webp`];
	const ROMAN = ['I', 'II', 'III', 'IV'];
	const AR = 1664 / 1192;
	const TINT = { orange: '#ef7d22', blue: '#2f7fe6' };
	const STEP = 0.42, FIRST = 0.9; // one card turns every STEP s from FIRST
	const SPARKS = Array.from({ length: 10 }, (_, k) => k * 36 + 8);
	let vw = 1440, vh = 900;
	let ready = false;
	onMount(() => (ready = true));

	// the number's ink on a player-colour face: dark on light colours, light on dark ones
	function inkOf(hex: string) {
		const m = /^#?([0-9a-f]{6})$/i.exec(hex);
		if (!m) return { ink: '#1a1206', sh: 'rgba(255,255,255,.45)' };
		const n = parseInt(m[1], 16), lin = (c: number) => { c /= 255; return c <= 0.04 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
		const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
		return L > 0.3 ? { ink: '#1a1206', sh: 'rgba(255,255,255,.45)' } : { ink: '#fff7e6', sh: 'rgba(0,0,0,.65)' };
	}

	type Item = RevealEntry & { x: number; y: number; ad: number; fd: number; mx: number; my: number; rank: number; play: boolean };
	let items: Item[] = [], coins: { x: number; y: number; d: number; team: 'orange' | 'blue' }[] = [];
	let tracks: { y: number; x0: number; x1: number }[] = [], arrows: { x: number; y: number; d: number }[] = [];
	let w = 120, ms = 40, sortT = 0, doneT = 0, title = 50, spot: Item | null = null;

	$: layout(entries, order, vw, vh, mobile, myTeam);
	function layout(..._: unknown[]) {
		items = []; coins = []; tracks = []; arrows = []; spot = null;
		const seat = [...entries.filter((e) => e.team !== myTeam), ...entries.filter((e) => e.team === myTeam)];
		// acting order first (only cards in play), then anyone without a card, in seat order
		const acting = order.map((pid) => seat.find((e) => e.pid === pid)).filter((e): e is RevealEntry => !!e && e.card != null);
		const ord = [...acting, ...seat.filter((e) => !acting.includes(e))];
		const n = ord.length, m = acting.length;
		if (!n) return;
		const flipAt = (rank: number) => FIRST + Math.min(rank, Math.max(0, m - 1)) * STEP;
		const gap = mobile ? 16 : 50; // between cards: room for an arrow or the coin
		const name = mobile ? 22 : 32, top = mobile ? 58 : 100, bottom = mobile ? 36 : 64, rowGap = mobile ? 12 : 22;
		title = mobile ? 30 : 52;
		const msOf = (cw: number) => Math.min(62, Math.max(mobile ? 28 : 34, cw * 0.26));
		// a row, top to bottom: the medallion sticking up over the card (1.15 × its size), the card, the name, the track, a gap
		// — so the track under one row never meets the medallions of the next
		const rowH = (cw: number) => msOf(cw) * 1.15 + cw * AR + 6 + name + 10 + 3 + rowGap;
		const avail = vh - top - bottom;
		let best = { cols: n, w: 0 };
		for (let c = 1; c <= n; c++) {
			const rows = Math.ceil(n / c);
			let hi = Math.min(250, (vw - 32 - (c - 1) * gap) / c), lo = 20;
			if (rows * rowH(hi) > avail) { for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (rows * rowH(mid) <= avail) lo = mid; else hi = mid; } hi = lo; }
			if (hi > best.w + 0.5) best = { cols: c, w: hi };
		}
		const cols = best.cols, rows = Math.ceil(n / cols);
		w = best.w; ms = msOf(w);
		const y0 = top + Math.max(0, (avail - rows * rowH(w)) / 2);
		const at = (k: number) => {
			const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
			return { x: vw / 2 + (c - (inRow - 1) / 2) * (w + gap), y: y0 + r * rowH(w) + ms * 1.15 + (w * AR) / 2, r };
		};
		sortT = flipAt(m - 1) + 0.75;
		items = ord.map((e, rank) => {
			const p = at(rank), f = at(seat.indexOf(e));
			return { ...e, x: p.x, y: p.y, ad: 0.12 + seat.indexOf(e) * 0.06, fd: flipAt(rank), mx: f.x - p.x, my: f.y - p.y, rank, play: rank < m };
		});
		for (let k = 0; k + 1 < m; k++) {
			const a = at(k), b = at(k + 1);
			if (a.r !== b.r) continue;
			const mid = { x: (a.x + b.x) / 2, y: a.y };
			if (flips.includes(k) && ord[k].team !== ord[k + 1].team) coins.push({ ...mid, d: sortT + 0.9 + k * 0.14, team: ord[k].team });
			else arrows.push({ ...mid, d: sortT + 0.9 + k * 0.14 });
		}
		for (let r = 0; r * cols < m; r++) {
			const a = at(r * cols), b = at(Math.min(m, (r + 1) * cols) - 1);
			tracks.push({ y: a.y + (w * AR) / 2 + 6 + name + 10, x0: a.x - w / 2, x1: b.x + w / 2 });
		}
		spot = items.find((it) => it.pid === me && it.play) ?? null;
		doneT = sortT + 1.2;
	}
	const close = () => onClose();
	// The curtain is opaque, so while it is up the game under it is not drawn at all: the curtain lives on <body> and
	// html.revealing hides the HUD layers of .gamewrap with content-visibility (measured 2026-10-21: the dash's 4★ buttons were being
	// re-layered on every step of the reveal — Emmitt's phone 320 → under 100 ms/s).
	function onTop(node: HTMLElement) {
		document.body.appendChild(node);
		document.documentElement.classList.add('revealing');
		return { destroy() { document.documentElement.classList.remove('revealing'); node.remove(); requestAnimationFrame(() => window.dispatchEvent(new Event('goa2-revealed'))); } };
	}
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={(e) => e.key === 'Escape' && close()} />

{#snippet medal(it: Item)}
	{@const ink = inkOf(it.color)}
	<span class="med" class:pf={face === 'player'} style="--md:{it.fd + 0.28}s; --v:{it.ini ?? 0}; --tint:{TINT[it.team]}; --pc:{it.color}; --ink:{face === 'player' ? ink.ink : '#1a1206'}; --ish:{face === 'player' ? ink.sh : 'rgba(255,255,255,.45)'}">
		<span class="mring"></span>
		<span class="sps">{#each SPARKS as a (a)}<i class="sp" style="--a:{a}deg"></i>{/each}</span>
		<span class="mbody">
			<span class="hx"></span><span class="hx2"></span>
			<span class="roll"><span class="strip">{#each Array.from({ length: Math.max(0, it.ini ?? 0) + 1 }, (_, k) => k) as k (k)}<b>{k}</b>{/each}</span></span>
		</span>
	</span>
{/snippet}

{#snippet faces(hero: string, idx: number, fd: number)}
	<div class="face back" style="--fd:{fd}s"><CardBack {hero} /></div>
	<div class="face front" style="--fd:{fd}s"><Card heroId={hero} card={heroCards(hero)[idx]} /></div>
{/snippet}

{#if ready}
	<div class="rv" use:onTop class:ph={mobile} style="--cw:{w}px; --ms:{ms}px" role="presentation" on:click={close}>
		<div class="scrim"></div>
		<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn} <span>· order of play</span></div>
		{#if spot}<div class="spot" style="left:{spot.x}px; top:{spot.y}px; --sd:{sortT + 0.7}s"></div>{/if}
		{#each tracks as t, k (k)}
			<div class="track" style="top:{t.y}px; left:{t.x0}px; width:{t.x1 - t.x0}px; --td:{sortT + 0.6}s"><i class="comet" style="--cd:{sortT + 1.1}s"><b></b></i></div>
		{/each}
		{#each items as it (it.pid)}
			<div class="pos" style="left:{it.x}px; top:{it.y}px; --ad:{it.ad}s; --tint:{TINT[it.team]}">
				<div class="mv" style="--mx:{it.mx}px; --my:{it.my}px; --sort:{sortT}s">
					{#if it.play && it.card != null}
						{@render medal(it)}
						<div class="card">
							{#if it.card2 != null}<div class="alt">{@render faces(it.hero, it.card2, it.fd)}</div>{/if}
							{@render faces(it.hero, it.card, it.fd)}
						</div>
						{#if spot && it.pid === spot.pid}<i class="lit" style="--ld:{sortT + 0.7}s"></i>{/if}
					{:else}
						<div class="card none">—</div>
					{/if}
					<div class="nm" class:dim={!it.play} style="--nd:{it.play ? it.fd + 0.37 : 0.5}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.1em' : '1.4em'} ring={2} /><span>{it.name}</span></div>
				</div>
			</div>
		{/each}
		{#each arrows as a, k (k)}<i class="arrow" style="left:{a.x}px; top:{a.y}px; --ad2:{a.d}s"></i>{/each}
		{#each coins as c, k (k)}<img class="coin" src={coin(c.team)} alt="" style="left:{c.x}px; top:{c.y}px; --cd:{c.d}s" />{/each}
		<div class="hint" style="--hd:{doneT + 0.4}s">{mobile ? 'Tap' : 'Click'} anywhere to continue</div>
	</div>
{/if}

<style>
	/* the HUD under the curtain is not drawn (the board stays painted — it rests, and redrawing it on close was a 200 ms hitch) */
	:global(html.revealing .gamewrap > :not(.ocean, .boardarea)) { content-visibility: hidden; }
	.rv { position: fixed; inset: 0; z-index: 60; cursor: pointer; overflow: hidden; font-family: 'Modesto Poster', serif; color: #f6ead2; }
	.scrim { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, #08182c, #02060c); animation: fade 0.35s ease both; }
	@keyframes fade { from { opacity: 0; } }
	.title { position: absolute; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-size: clamp(1.1rem, 3.4vw, 2.2rem); letter-spacing: 0.06em; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7), 0 0 22px rgba(199, 154, 78, 0.4); animation: fade 0.5s ease 0.2s both; z-index: 3; }
	.title span { color: #c79a4e; font-size: 0.66em; }
	.hint { position: absolute; left: 50%; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: #8b7a52; white-space: nowrap; animation: fade 0.6s ease var(--hd) both; }

	/* a card's place: arrives (outer) · slides into order (middle) · flips (faces) */
	.pos { position: absolute; width: var(--cw); margin-left: calc(var(--cw) / -2); margin-top: calc(var(--cw) * -0.698); animation: arrive 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) var(--ad) both; z-index: 2; }
	@keyframes arrive { from { transform: translateY(40px); opacity: 0; } 35% { opacity: 1; } }
	.mv { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; animation: sortmv 0.75s cubic-bezier(0.5, 0, 0.2, 1) var(--sort) both; }
	@keyframes sortmv { from { transform: translate(var(--mx), var(--my)); } to { transform: none; } }
	.card { position: relative; width: var(--cw); aspect-ratio: 1192 / 1664; }
	.card.none { display: grid; place-items: center; border: 1.5px dashed rgba(255, 255, 255, 0.2); border-radius: 5%; color: #6b7a8d; font-size: 2rem; box-sizing: border-box; opacity: 0.6; }
	.face { position: absolute; inset: 0; z-index: 1; border-radius: 5%; overflow: hidden; box-shadow: 0 0 0 2px var(--tint), 0 14px 30px rgba(0, 0, 0, 0.6); }
	.face :global(.cardface) { display: block; width: 100%; height: 100%; }
	/* Emmitt's second card (Alternative Timelines): tucked behind the first, turned a little */
	.alt { position: absolute; inset: 0; z-index: 0; transform: translate(16%, -6%) rotate(7deg); }
	.alt .face { z-index: 0; filter: brightness(0.82); }
	/* a flat flip (3D flips broke under filters before): the back squashes to an edge, the face opens out of it */
	.face.back { animation: shut 0.17s ease-in var(--fd) both; }
	.face.front { animation: open 0.2s ease-out calc(var(--fd) + 0.17s) both; }
	@keyframes shut { to { transform: scaleX(0); } }
	@keyframes open { from { transform: scaleX(0); } to { transform: scaleX(1); } }
	.nm { display: flex; align-items: center; gap: 0.4em; max-width: 100%; font-size: clamp(0.62rem, calc(var(--cw) / 14), 1.25rem); animation: fade 0.4s ease var(--nd) both; }
	.nm.dim { color: #8d99a8; }
	.nm span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* the initiative medallion: hex rim in the team colour, a brass (or player-colour) face, the number rolling up, then a slam + sparks */
	.med { position: absolute; z-index: 3; left: 50%; top: calc(var(--ms) * -0.62); width: var(--ms); height: var(--ms); margin: calc(var(--ms) / -2) 0 0 calc(var(--ms) / -2); }
	/* ONE animation for the medallion's body: it pops in (0.25 s), holds while the number rolls, then slams (0.42 s) —
	   few, cheap animations: every start / end of one costs the page a style pass (measured 2026-10-21) */
	.mbody { position: absolute; inset: 0; display: grid; place-items: center; animation: medpop 1.17s linear var(--md) both; }
	@keyframes medpop { 0% { opacity: 0; transform: scale(0.4); animation-timing-function: ease-out; } 21% { opacity: 1; transform: scale(1); } 43% { transform: scale(1); animation-timing-function: ease-out; }
		55% { transform: scale(1.32); animation-timing-function: ease-in-out; } to { transform: scale(1); } }
	.hx, .hx2 { position: absolute; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); }
	.hx { inset: 0; background: linear-gradient(160deg, color-mix(in srgb, var(--tint) 55%, white), var(--tint) 45%, color-mix(in srgb, var(--tint) 60%, black)); }
	.hx2 { inset: 11%; background: radial-gradient(circle at 38% 30%, #fff3c4, #e2b65a 45%, #8a5b1c); }
	.pf .hx { inset: -3%; background: linear-gradient(160deg, color-mix(in srgb, var(--tint) 45%, white), var(--tint) 40%, color-mix(in srgb, var(--tint) 55%, black)); }
	.pf .hx2 { inset: 13%; background: radial-gradient(circle at 38% 30%, color-mix(in srgb, var(--pc) 45%, white), var(--pc) 52%, color-mix(in srgb, var(--pc) 55%, black)); }
	.roll { position: relative; height: 1em; overflow: hidden; font-size: calc(var(--ms) * 0.46); line-height: 1; color: var(--ink); text-shadow: 0 1px 0 var(--ish); }
	.strip { display: flex; flex-direction: column; align-items: center; animation: roll 0.5s cubic-bezier(0.25, 0.6, 0.3, 1) var(--md) both; transform: translateY(calc(var(--v) * -1em)); }
	.strip b { display: block; height: 1em; font-weight: 400; }
	@keyframes roll { from { transform: translateY(0); } }
	.mring { position: absolute; inset: -40%; border-radius: 50%; background: radial-gradient(closest-side, transparent 58%, color-mix(in srgb, var(--tint) 70%, white) 66%, transparent 74%); opacity: 0; animation: ring 0.6s ease-out calc(var(--md) + 0.5s) both; }
	@keyframes ring { 0% { opacity: 1; transform: scale(0.5); } to { opacity: 0; transform: scale(1.35); } }
	/* the ten sparks are still; their holder bursts outwards and fades (one animation, not ten) */
	.sps { position: absolute; inset: 0; opacity: 0; animation: burst 0.55s ease-out calc(var(--md) + 0.5s) both; }
	.sp { position: absolute; left: 50%; top: 50%; width: calc(var(--ms) * 0.24); height: 3px; margin: -1.5px 0 0 0; border-radius: 2px; background: linear-gradient(90deg, #fff6d0, var(--tint)); transform-origin: 0 50%; transform: rotate(var(--a)) translateX(calc(var(--ms) * 0.55)); }
	@keyframes burst { 0% { opacity: 1; transform: scale(0.6); } to { opacity: 0; transform: scale(1.7); } }

	/* arrows light in sequence, a glow runs the track, the first to act stands in the light */
	.spot { position: absolute; width: calc(var(--cw) * 2.2); height: calc(var(--cw) * 3); margin: calc(var(--cw) * -1.5) 0 0 calc(var(--cw) * -1.1); background: radial-gradient(closest-side, rgba(243, 212, 138, 0.28), transparent 70%); opacity: 0; animation: spotIn 0.8s ease var(--sd) both; z-index: 1; }
	@keyframes spotIn { to { opacity: 1; } }
	.lit { position: absolute; left: -6px; top: -6px; width: calc(var(--cw) + 12px); aspect-ratio: 1192 / 1664; border-radius: 8%; box-shadow: 0 0 0 3px #f3d48a, 0 0 30px rgba(243, 212, 138, 0.55); opacity: 0; animation: spotIn 0.6s ease var(--ld) both; pointer-events: none; }
	.track { position: absolute; height: 3px; background: linear-gradient(90deg, transparent, #c79a4e 8%, #f3d48a 50%, #c79a4e 92%, transparent); transform-origin: left; transform: scaleX(0); animation: grow 0.6s ease-out var(--td) both; }
	@keyframes grow { to { transform: scaleX(1); } }
	.comet { position: absolute; inset: 0; opacity: 0; animation: comet 2.8s ease-in-out var(--cd) infinite; }
	.comet b { position: absolute; top: 50%; left: 0; width: 70px; height: 10px; margin: -5px 0 0 -35px; border-radius: 50%; background: radial-gradient(closest-side, #fff8dc, rgba(243, 212, 138, 0.6) 45%, transparent); }
	@keyframes comet { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 55% { opacity: 1; } 62% { transform: translateX(100%); opacity: 0; } to { transform: translateX(100%); opacity: 0; } }
	.arrow { position: absolute; z-index: 3; width: 16px; height: 16px; margin: -8px 0 0 -12px; border-right: 4px solid #f3d48a; border-top: 4px solid #f3d48a; transform: rotate(45deg); filter: drop-shadow(0 0 6px rgba(243, 212, 138, 0.7)); opacity: 0; animation: arrowIn 0.35s cubic-bezier(0.3, 1.7, 0.5, 1) var(--ad2) both; }
	@keyframes arrowIn { from { opacity: 0; transform: rotate(45deg) translate(-8px, 8px); } to { opacity: 1; transform: rotate(45deg); } }
	.ph .arrow { width: 9px; height: 9px; margin: -5px 0 0 -6px; border-width: 3px; }
	.coin { position: absolute; z-index: 5; width: 46px; aspect-ratio: 1; margin: -23px 0 0 -23px; border-radius: 50%; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6); animation: drop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1) var(--cd) both; }
	.ph .coin { width: 22px; margin: -11px 0 0 -11px; }
	@keyframes drop { from { transform: translateY(-60vh) rotate(-540deg); opacity: 0; } 30% { opacity: 1; } }

	@media (prefers-reduced-motion: reduce) { .rv * { animation-duration: 0.01s !important; } }
</style>
