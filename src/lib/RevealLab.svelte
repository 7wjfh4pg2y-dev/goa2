<script lang="ts" context="module">
	export type RevealLook = 'rows' | 'queue' | 'order';
	export const REVEAL_LOOKS: { id: RevealLook; label: string; blurb: string }[] = [
		{ id: 'rows', label: 'A · Order of Play, two rows', blurb: 'The same flow in two rows, so the cards can be much bigger; a brass track under each row' },
		{ id: 'queue', label: 'B · Order of Play, the queue', blurb: 'The same flow, but the first to act is the biggest and the rest step down along the track' },
		{ id: 'order', label: 'C · Order of Play', blurb: 'The cards turn in initiative order, highest first, then line up on the brass track — the coin settles ties' }
	];
	export type RevealSeat = { pid: string; name: string; hero: string; team: 'orange' | 'blue'; color: string; card: number };
</script>

<script lang="ts">
	// Card-reveal mock-ups for /splash-demo (not in the game yet), all 'Order of Play' (the user's pick): dealt face down
	// in seat order (the enemy first, like the boards), turned highest initiative first with a stamped badge, then they
	// slide into acting order and the tie-breaker coin drops between cross-team ties. Only transform / opacity animate;
	// one animation per element (pos = arrive · mv = sort · faces = flip).
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroCards } from '$lib/cards/deck';

	export let mobile = false;
	export let myTeam: 'orange' | 'blue' | null = 'blue';

	const coinArt = import.meta.glob('./cards/images/tiebreaker_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const coin = (t: 'orange' | 'blue') => coinArt[`./cards/images/tiebreaker_${t}.png`];
	const ROMAN = ['I', 'II', 'III', 'IV'];
	const AR = 1664 / 1192;
	const TINT = { orange: '#ef7d22', blue: '#2f7fe6' };
	const STEP = 0.34, FIRST = 0.9; // the turns: one card every STEP s from FIRST
	let vw = 1440, vh = 900;
	let look: RevealLook | null = null, seats: RevealSeat[] = [], turn = 1, tieTeam: 'orange' | 'blue' = 'orange', run = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	export function play(l: RevealLook, s: RevealSeat[], t = 1, tie: 'orange' | 'blue' = 'orange') {
		look = l; seats = s; turn = t; tieTeam = tie; run++;
		if (timer) clearTimeout(timer);
		timer = setTimeout(close, 5200 + s.length * 340);
	}
	function close() { look = null; if (timer) clearTimeout(timer); timer = null; }

	$: me = (myTeam ?? 'blue') as 'orange' | 'blue';
	const ini = (s: RevealSeat) => heroCards(s.hero)[s.card]?.initiative ?? 0;
	type Box = { x: number; y: number; w: number };
	type Item = RevealSeat & { x: number; y: number; cw: number; ad: number; fd: number; mx: number; my: number; sc: number; rank: number };
	let items: Item[] = [], tracks: { y: number; x0: number; x1: number }[] = [], coins: { x: number; y: number; team: 'orange' | 'blue' }[] = [];
	let sortT = 0, title = 50;

	$: layout(look, seats, vw, vh, mobile, me);
	function layout(..._: unknown[]) {
		items = []; tracks = []; coins = [];
		if (!look) return;
		const n = seats.length, gap = mobile ? 10 : 26, name = mobile ? 22 : 32, badge = mobile ? 30 : 46;
		const top = mobile ? 66 : 108, bottom = mobile ? 24 : 44;
		const seat = [...seats.filter((s) => s.team !== me), ...seats.filter((s) => s.team === me)];
		const ord = [...seat].sort((a, b) => ini(b) - ini(a) || (a.team === b.team ? 0 : a.team === tieTeam ? -1 : 1));
		const rowH = (w: number) => badge + w * AR + name + gap;
		// a uniform grid: `cols` a row, cards as big as the width and the height allow
		const grid = (cols: number, max: number) => {
			const rows = Math.ceil(n / cols);
			const w = Math.min(max, (vw - 32 - (cols - 1) * gap) / cols, ((vh - top - bottom) / rows - badge - name - gap) / AR);
			const y0 = top + Math.max(0, (vh - top - bottom - rows * rowH(w)) / 2);
			const at = (k: number): Box & { r: number } => {
				const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
				return { x: vw / 2 + (c - (inRow - 1) / 2) * (w + gap), y: y0 + r * rowH(w) + badge + (w * AR) / 2, w, r };
			};
			return { at, rows, cols, w };
		};
		let deal: (k: number) => Box, final: (k: number) => Box & { r: number };
		if (look === 'order') {
			const g = grid(mobile ? Math.min(3, n) : n, 240);
			deal = g.at; final = g.at;
			if (!mobile) tracks = [trackOf(g.at, 0, n - 1, name)];
		} else if (look === 'rows') {
			const g = grid(mobile ? 2 : Math.ceil(n / 2), 340);
			deal = g.at; final = g.at;
			for (let r = 0; r < g.rows; r++) tracks.push(trackOf(g.at, r * g.cols, Math.min(n, (r + 1) * g.cols) - 1, name));
		} else {
			// the queue: dealt evenly, then each card takes the size of its place — the first to act the biggest
			const d = grid(mobile ? Math.min(3, n) : n, 200);
			deal = d.at;
			const f = (k: number) => Math.max(0.5, 1 - 0.14 * k);
			if (mobile) {
				// the first big on top, the rest in rows of three under it
				const restN = n - 1, cols = Math.min(3, restN), rrows = Math.ceil(restN / cols);
				let small = Math.min(130, (vw - 24 - (cols - 1) * gap) / cols);
				let big = Math.min(vw * 0.56, (vh - top - bottom - rrows * rowH(small)) - badge - name - gap) / 1;
				big = Math.min(big / AR, vw * 0.56);
				if (big < small) small = big;
				const y1 = top + badge + (big * AR) / 2, yr = top + rowH(big);
				final = (k: number) => {
					if (k === 0) return { x: vw / 2, y: y1, w: big, r: 0 };
					const j = k - 1, r = Math.floor(j / cols), c = j % cols, inRow = Math.min(cols, restN - r * cols);
					return { x: vw / 2 + (c - (inRow - 1) / 2) * (small + gap), y: yr + r * rowH(small) + badge + (small * AR) / 2, w: small, r: r + 1 };
				};
			} else {
				const sum = Array.from({ length: n }, (_, k) => f(k)).reduce((a, b) => a + b, 0);
				const base = Math.min(400, (vw - 48 - (n - 1) * gap) / sum, (vh - top - bottom - badge - name - gap - (mobile ? 0 : 30)) / AR);
				const total = base * sum + (n - 1) * gap;
				const yb = top + badge + base * AR + (vh - top - bottom - (badge + base * AR + name + 40)) / 2; // the cards' feet
				const xs: number[] = []; let x = (vw - total) / 2;
				for (let k = 0; k < n; k++) { xs.push(x + (base * f(k)) / 2); x += base * f(k) + gap; }
				final = (k: number) => ({ x: xs[k], y: yb - (base * f(k) * AR) / 2, w: base * f(k), r: 0 });
				tracks = [{ y: yb + name + 12, x0: (vw - total) / 2, x1: (vw + total) / 2 }];
			}
		}
		items = ord.map((s, rank) => {
			const at = final(rank), si = seat.indexOf(s), from = deal(si);
			return { ...s, x: at.x, y: at.y, cw: at.w, ad: 0.12 + si * 0.06, fd: FIRST + rank * STEP, mx: from.x - at.x, my: from.y - at.y, sc: from.w / at.w, rank };
		});
		sortT = FIRST + n * STEP + 0.25;
		for (let k = 0; k + 1 < ord.length; k++) {
			const a = ord[k], b = ord[k + 1], pa = final(k), pb = final(k + 1);
			if (ini(a) === ini(b) && a.team !== b.team && pa.r === pb.r) coins.push({ x: (pa.x + pa.w / 2 + pb.x - pb.w / 2) / 2, y: pa.w < pb.w ? pa.y : pb.y, team: a.team });
		}
		title = mobile ? 32 : 56;
	}
	function trackOf(at: (k: number) => Box, k0: number, k1: number, name: number) {
		const a = at(k0), b = at(k1);
		return { y: a.y + (a.w * AR) / 2 + name + 12, x0: a.x - a.w / 2, x1: b.x + b.w / 2 };
	}
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={(e) => look && e.key === 'Escape' && close()} />

{#if look}
	{#key run}
		<div class="rv {look}" class:ph={mobile} role="presentation" on:click={close}>
			<div class="scrim"></div>
			<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn} <span>· order of play</span></div>
			{#each tracks as t, k (k)}
				<div class="track" style="top:{t.y}px; left:{t.x0}px; width:{t.x1 - t.x0}px; --td:{sortT + 0.35 + k * 0.15}s">
					{#each [0.25, 0.5, 0.75] as p (p)}<i class="chev" style="left:{p * 100}%"></i>{/each}
				</div>
			{/each}
			{#each items as it (it.pid)}
				<div class="pos" style="left:{it.x}px; top:{it.y}px; --cw:{it.cw}px; --ad:{it.ad}s; --tint:{TINT[it.team]}">
					<div class="mv" style="--mx:{it.mx}px; --my:{it.my}px; --sc:{it.sc}; --sort:{sortT}s">
						<div class="badge" style="--bd:{it.fd + 0.3}s"><b>{ini(it)}</b></div>
						<div class="rank" style="--rd:{sortT + 0.55 + it.rank * 0.07}s">{it.rank + 1}</div>
						{#if look === 'queue' && it.rank === 0}<div class="lead" style="--ld:{sortT + 0.7}s">Acts first</div>{/if}
						<div class="card">
							<div class="face back" style="--fd:{it.fd}s"><CardBack hero={it.hero} /></div>
							<div class="face front" style="--fd:{it.fd}s"><Card heroId={it.hero} card={heroCards(it.hero)[it.card]} /></div>
							<i class="flash" style="--fd:{it.fd}s"></i>
						</div>
						<div class="nm" style="--nd:{it.fd + 0.37}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.2em' : '1.5em'} ring={2} /><span>{it.name}</span></div>
					</div>
				</div>
			{/each}
			{#each coins as c, k (k)}
				<img class="coin" src={coin(c.team)} alt="" style="left:{c.x}px; top:{c.y}px; --cd:{sortT + 0.75}s" />
			{/each}
		</div>
	{/key}
{/if}

<style>
	.rv { position: fixed; inset: 0; z-index: 60; cursor: pointer; overflow: hidden; font-family: 'Modesto Poster', serif; color: #f6ead2; }
	.scrim { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(8, 24, 44, 0.97), rgba(2, 6, 12, 0.99)); animation: fade 0.35s ease both; }
	@keyframes fade { from { opacity: 0; } }
	.title { position: absolute; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-size: clamp(1.1rem, 3.4vw, 2.2rem); letter-spacing: 0.06em; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7), 0 0 22px rgba(199, 154, 78, 0.4); animation: fade 0.5s ease 0.2s both; z-index: 3; }
	.title span { color: #c79a4e; font-size: 0.66em; }

	/* a card's place: arrives (outer) · slides into order, taking its size (middle) · flips (faces) */
	.pos { position: absolute; width: var(--cw); margin-left: calc(var(--cw) / -2); margin-top: calc(var(--cw) * -0.698); animation: arrive 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) var(--ad) both; z-index: 2; }
	@keyframes arrive { from { transform: translateY(40px); opacity: 0; } 35% { opacity: 1; } }
	.mv { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; transform-origin: 50% calc(var(--cw) * 0.698); animation: sortmv 0.75s cubic-bezier(0.5, 0, 0.2, 1) var(--sort) both; }
	@keyframes sortmv { from { transform: translate(var(--mx), var(--my)) scale(var(--sc)); } to { transform: none; } }
	.card { position: relative; width: var(--cw); aspect-ratio: 1192 / 1664; }
	.face { position: absolute; inset: 0; border-radius: 5%; overflow: hidden; box-shadow: 0 0 0 2px var(--tint), 0 14px 30px rgba(0, 0, 0, 0.6); }
	.face :global(.cardface) { display: block; width: 100%; height: 100%; }
	/* a flat flip (3D flips broke under filters before): the back squashes to an edge, the face opens out of it */
	.face.back { animation: shut 0.17s ease-in var(--fd) both; }
	.face.front { animation: open 0.2s ease-out calc(var(--fd) + 0.17s) both; }
	@keyframes shut { to { transform: scaleX(0); } }
	@keyframes open { from { transform: scaleX(0); } to { transform: scaleX(1); } }
	.flash { position: absolute; inset: -8%; border-radius: 10%; pointer-events: none; opacity: 0; background: radial-gradient(closest-side, rgba(255, 244, 214, 0.7), transparent); animation: fl 0.55s ease-out calc(var(--fd) + 0.17s) both; }
	@keyframes fl { 25% { opacity: 1; } to { opacity: 0; } }
	.nm { display: flex; align-items: center; gap: 0.4em; max-width: 100%; font-size: clamp(0.62rem, calc(var(--cw) / 14), 1.25rem); animation: fade 0.4s ease var(--nd) both; }
	.nm span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.badge { position: absolute; left: 50%; top: 0; transform: translate(-50%, -112%); animation: stamp 0.38s cubic-bezier(0.3, 1.7, 0.5, 1) var(--bd) both; }
	.badge b { display: grid; place-items: center; min-width: 1.9em; height: 1.9em; padding: 0 0.3em; border-radius: 999px; font-weight: 400; font-size: clamp(0.9rem, calc(var(--cw) / 8), 1.9rem); background: radial-gradient(circle at 35% 30%, #f6dc98, #b98635); color: #1a1206; box-shadow: 0 0 0 2px var(--tint), 0 4px 14px rgba(0, 0, 0, 0.5); }
	@keyframes stamp { from { transform: translate(-50%, -112%) scale(2.4); opacity: 0; } 60% { opacity: 1; } }
	.rank { position: absolute; left: 2px; top: 0; transform: translateY(-118%); z-index: 2; width: 1.7em; height: 1.7em; display: grid; place-items: center; border-radius: 50%; font-size: clamp(0.75rem, calc(var(--cw) / 11), 1.4rem); background: #0b1a2e; color: #f3d48a; border: 2px solid #c79a4e; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55); animation: pop 0.3s cubic-bezier(0.3, 1.7, 0.5, 1) var(--rd) both; }
	@keyframes pop { from { transform: translateY(-118%) scale(0); } }
	.lead { position: absolute; right: 2px; top: 0; transform: translateY(-122%); z-index: 2; white-space: nowrap; padding: 0.2em 0.7em; border-radius: 999px; font-size: clamp(0.7rem, calc(var(--cw) / 16), 1.05rem); letter-spacing: 0.06em; color: #1a1206; background: linear-gradient(180deg, #f6dc98, #c79a4e); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5), 0 0 16px rgba(243, 212, 138, 0.35); animation: pop2 0.35s cubic-bezier(0.3, 1.7, 0.5, 1) var(--ld) both; }
	@keyframes pop2 { from { transform: translateY(-122%) scale(0); } }
	/* phones: the first card is narrow, so the ribbon sits beside it, clear of the initiative badge */
	.ph .lead { right: auto; left: 100%; margin-left: 6px; transform-origin: left; }
	.track { position: absolute; height: 3px; background: linear-gradient(90deg, transparent, #c79a4e 8%, #f3d48a 50%, #c79a4e 92%, transparent); transform-origin: left; transform: scaleX(0); animation: grow 0.6s ease-out var(--td) both; }
	@keyframes grow { to { transform: scaleX(1); } }
	.chev { position: absolute; top: 50%; width: 10px; height: 10px; margin: -6px 0 0 -5px; border-right: 3px solid #f3d48a; border-top: 3px solid #f3d48a; transform: rotate(45deg); }
	.coin { position: absolute; z-index: 5; width: 50px; aspect-ratio: 1; margin: -25px 0 0 -25px; border-radius: 50%; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6); animation: drop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1) var(--cd) both; }
	.ph .coin { width: 34px; margin: -17px 0 0 -17px; }
	@keyframes drop { from { transform: translateY(-60vh) rotate(-540deg); opacity: 0; } 30% { opacity: 1; } }

	@media (prefers-reduced-motion: reduce) { .rv * { animation-duration: 0.01s !important; } }
</style>
