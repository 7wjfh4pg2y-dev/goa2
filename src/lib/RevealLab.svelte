<script lang="ts" context="module">
	export type RevealLook = 'loading' | 'path' | 'order';
	export const REVEAL_LOOKS: { id: RevealLook; label: string; blurb: string }[] = [
		{ id: 'loading', label: 'A · Loading Screen', blurb: 'Each player in a portrait frame of their hero, teams facing off; the order fills a top bar of faces as the cards turn' },
		{ id: 'path', label: 'B · Draft Path', blurb: 'Enemy row above, yours below; a glowing path draws itself card to card in acting order, the initiative on each node' },
		{ id: 'order', label: 'C · Order of Play', blurb: 'One row in acting order: brass arrows light in sequence, a glow runs the track, the first to act stands in the light' }
	];
	export type RevealSeat = { pid: string; name: string; hero: string; team: 'orange' | 'blue'; color: string; card: number };
</script>

<script lang="ts">
	// Card-reveal mock-ups for /splash-demo (not in the game yet). The user's pick so far: 'Order of Play' — dealt face
	// down, turned highest initiative first, the initiative slammed in as a medallion (an odometer roll + sparks), the order
	// shown without numbers. Stays until a click / Esc. Viewer-relative (the enemy left / on top). Only transform / opacity
	// animate; one animation per element (pos = arrive · mv = sort · faces = flip · medal layers each their own).
	import Card from '$lib/cards/Card.svelte';
	import CardBack from '$lib/cards/CardBack.svelte';
	import PlayerIcon from '$lib/PlayerIcon.svelte';
	import { heroCards, heroName } from '$lib/cards/deck';
	import { heroSplash, splashFace } from '$lib/heroes';

	export let mobile = false;
	export let myTeam: 'orange' | 'blue' | null = 'blue';

	const coinArt = import.meta.glob('./cards/images/tiebreaker_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const coin = (t: 'orange' | 'blue') => coinArt[`./cards/images/tiebreaker_${t}.png`];
	const ROMAN = ['I', 'II', 'III', 'IV'];
	const AR = 1664 / 1192;
	const TINT = { orange: '#ef7d22', blue: '#2f7fe6' };
	const STEP = 0.42, FIRST = 0.9; // the turns: one card every STEP s from FIRST (highest initiative first)
	let vw = 1440, vh = 900;
	let look: RevealLook | null = null, seats: RevealSeat[] = [], turn = 1, tieTeam: 'orange' | 'blue' = 'orange', run = 0;

	export function play(l: RevealLook, s: RevealSeat[], t = 1, tie: 'orange' | 'blue' = 'orange') { look = l; seats = s; turn = t; tieTeam = tie; run++; }
	function close() { look = null; }

	$: me = (myTeam ?? 'blue') as 'orange' | 'blue';
	const ini = (s: RevealSeat) => heroCards(s.hero)[s.card]?.initiative ?? 0;
	type Item = RevealSeat & { x: number; y: number; cw: number; ad: number; fd: number; mx: number; my: number; rank: number; up?: boolean; fw?: number; fh?: number };
	let items: Item[] = [], coins: { x: number; y: number; d: number; team: 'orange' | 'blue'; sm?: boolean }[] = [];
	let tracks: { y: number; x0: number; x1: number }[] = [], arrows: { x: number; y: number; d: number }[] = [];
	let tokens: { x: number; y: number; s: number; d: number; it: Item; lead: boolean }[] = [], bar: { y: number; h: number } | null = null;
	let segs: { d: string; at: number }[] = [], seam: { x?: number; y?: number } = {};
	let sortT = 0, doneT = 0, title = 50, spot: Item | null = null;

	$: layout(look, seats, vw, vh, mobile, me);
	function layout(..._: unknown[]) {
		items = []; coins = []; tracks = []; arrows = []; tokens = []; segs = []; bar = null; spot = null; seam = {};
		if (!look) return;
		const n = seats.length, gap = mobile ? 10 : 26, name = mobile ? 22 : 32;
		const seat = [...seats.filter((s) => s.team !== me), ...seats.filter((s) => s.team === me)];
		const ord = [...seat].sort((a, b) => ini(b) - ini(a) || (a.team === b.team ? 0 : a.team === tieTeam ? -1 : 1));
		const rankOf = (s: RevealSeat) => ord.indexOf(s);
		const flipAt = (rank: number) => FIRST + rank * STEP;
		const tie = (k: number) => ini(ord[k]) === ini(ord[k + 1]) && ord[k].team !== ord[k + 1].team;
		doneT = flipAt(n - 1) + 1;
		title = mobile ? 30 : 52;
		if (look === 'order') {
			// dealt in seat order, turned in acting order, then one row (phones: rows of 3) in acting order
			const medal = mobile ? 34 : 54, top = mobile ? 62 : 104, bottom = mobile ? 40 : 70;
			const cols = mobile ? Math.min(3, n) : n, rows = Math.ceil(n / cols);
			const g = gap + (mobile ? 6 : 24); // room for the arrows
			const rowH = (w: number) => medal + w * AR + name + gap;
			const w = Math.min(250, (vw - 32 - (cols - 1) * g) / cols, ((vh - top - bottom) / rows - medal - name - gap) / AR);
			const y0 = top + Math.max(0, (vh - top - bottom - rows * rowH(w)) / 2);
			const at = (k: number) => {
				const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
				return { x: vw / 2 + (c - (inRow - 1) / 2) * (w + g), y: y0 + r * rowH(w) + medal + (w * AR) / 2, r };
			};
			sortT = flipAt(n - 1) + 0.75;
			items = ord.map((s, rank) => {
				const p = at(rank), f = at(seat.indexOf(s));
				return { ...s, x: p.x, y: p.y, cw: w, ad: 0.12 + seat.indexOf(s) * 0.06, fd: flipAt(rank), mx: f.x - p.x, my: f.y - p.y, rank };
			});
			for (let k = 0; k + 1 < n; k++) {
				const a = at(k), b = at(k + 1);
				if (a.r !== b.r) continue;
				const m = { x: (a.x + b.x) / 2, y: a.y };
				if (tie(k)) coins.push({ ...m, d: sortT + 0.9 + k * 0.14, team: ord[k].team });
				else arrows.push({ ...m, d: sortT + 0.9 + k * 0.14 });
			}
			for (let r = 0; r < rows; r++) {
				const a = at(r * cols), b = at(Math.min(n, (r + 1) * cols) - 1);
				tracks.push({ y: a.y + (w * AR) / 2 + name + 14, x0: a.x - w / 2, x1: b.x + w / 2 });
			}
			spot = items[0];
			doneT = sortT + 1.2;
		} else if (look === 'loading') {
			// portrait frames (the hero's painting, the card set in it); the turn order fills a bar of faces on top
			const barH = mobile ? 52 : 84, top = (mobile ? 50 : 84) + barH, bottom = mobile ? 30 : 56;
			bar = { y: (mobile ? 50 : 82) + barH / 2 - 6, h: barH };
			const halves = [seat.filter((s) => s.team !== me), seat.filter((s) => s.team === me)];
			const k = Math.max(halves[0].length, halves[1].length, 1);
			const pad = mobile ? 5 : 9, band = 0.42; // the painting shows above the card: band × card width
			const fhOf = (fw: number) => (fw - 2 * pad) * (AR + band) + pad;
			let fw: number;
			if (mobile) {
				const cols = Math.min(3, k);
				fw = Math.min(140, (vw - 24 - (cols - 1) * gap) / cols);
				const avail = (vh - top - bottom - 34) / 2 - name;
				fw = Math.min(fw, (avail - pad) / (AR + band) + 2 * pad);
			} else {
				const cols = Math.min(3, k), rows = Math.ceil(k / cols);
				fw = Math.min(280, (vw / 2 - 70 - (cols - 1) * gap) / cols);
				fw = Math.min(fw, (((vh - top - bottom) / rows - name - gap) - pad) / (AR + band) + 2 * pad);
			}
			const fh = fhOf(fw), cw = fw - 2 * pad, cols = Math.min(3, k);
			halves.forEach((list, side) => list.forEach((s, j) => {
				const r = Math.floor(j / cols), c = j % cols, inRow = Math.min(cols, list.length - r * cols);
				let x: number, y: number;
				if (mobile) {
					x = vw / 2 + (c - (inRow - 1) / 2) * (fw + gap);
					const mid = top + (vh - top - bottom) / 2;
					y = side === 0 ? mid - 17 - name - fh / 2 : mid + 17 + fh / 2;
				} else {
					const cc = side === 0 ? cols - 1 - c : c, blockW = inRow * fw + (inRow - 1) * gap;
					const x0 = side === 0 ? vw / 2 - 50 - blockW : vw / 2 + 50;
					x = x0 + cc * (fw + gap) + fw / 2;
					const rowsHere = Math.ceil(list.length / cols), blockH = rowsHere * (fh + name + gap) - gap;
					y = top + (vh - top - bottom - blockH) / 2 + r * (fh + name + gap) + fh / 2;
				}
				const rank = rankOf(s);
				items.push({ ...s, x, y, cw, fw, fh, ad: 0.15 + (side * 3 + j) * 0.07, fd: flipAt(rank), mx: 0, my: 0, rank });
			}));
			seam = mobile ? { y: top + (vh - top - bottom) / 2 } : { x: vw / 2 };
			const ts = mobile ? 30 : 46, tw = Math.min(mobile ? 50 : 86, (vw - 40) / n);
			tokens = ord.map((s, rank) => ({ x: vw / 2 + (rank - (n - 1) / 2) * tw, y: bar!.y, s: rank === 0 ? ts * 1.22 : ts, d: flipAt(rank) + 0.25, it: items.find((i) => i.pid === s.pid)!, lead: rank === 0 }));
			for (let r = 0; r + 1 < n; r++) {
				const m = { x: (tokens[r].x + tokens[r + 1].x) / 2, y: bar.y };
				if (tie(r)) coins.push({ ...m, d: flipAt(r + 1) + 0.4, team: ord[r].team, sm: true }); else arrows.push({ ...m, d: flipAt(r + 1) + 0.3 });
			}
			spot = items.find((i) => i.rank === 0) ?? null;
		} else {
			// the enemy row above, yours below; the path joins the cards' inner edges in acting order
			const medal = mobile ? 34 : 54, top = mobile ? 56 : 92, bottom = mobile ? 26 : 50, mid = mobile ? 70 : 120;
			const rowsT = [seat.filter((s) => s.team !== me), seat.filter((s) => s.team === me)];
			const k = Math.max(rowsT[0].length, rowsT[1].length, 1), g = gap + (mobile ? 0 : 20);
			const w = Math.min(250, (vw - 32 - (k - 1) * g) / k, (vh - top - bottom - mid - 2 * name) / 2 / AR);
			const ch = w * AR, total = 2 * ch + mid + 2 * name, y0 = top + (vh - top - bottom - total) / 2;
			rowsT.forEach((list, side) => list.forEach((s, j) => {
				const x = vw / 2 + (j - (list.length - 1) / 2) * (w + g);
				const y = side === 0 ? y0 + name + ch / 2 : y0 + name + ch + mid + ch / 2;
				const rank = rankOf(s);
				items.push({ ...s, x, y, cw: w, ad: 0.15 + (side * 3 + j) * 0.07, fd: flipAt(rank), mx: 0, my: 0, rank, up: side === 0 });
			}));
			const node = (s: RevealSeat) => { const it = items.find((i) => i.pid === s.pid)!; return { x: it.x, y: it.up ? it.y + ch / 2 : it.y - ch / 2 }; };
			const bandY = y0 + name + ch + mid / 2, cut = medal * 0.6; // links stop short of the medallions
			for (let r = 0; r + 1 < n; r++) {
				const a = node(ord[r]), b = node(ord[r + 1]);
				// along one row the link bows into the band between the rows (so it never runs through a card's medallion)
				const c = Math.abs(a.y - b.y) < 1 ? { x: (a.x + b.x) / 2, y: a.y + (bandY - a.y) * 1.7 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				const off = (p: { x: number; y: number }) => { const dx = c.x - p.x, dy = c.y - p.y, l = Math.hypot(dx, dy) || 1; return { x: p.x + (dx / l) * cut, y: p.y + (dy / l) * cut }; };
				const p0 = off(a), p1 = off(b);
				segs.push({ d: `M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`, at: flipAt(r + 1) + 0.05 });
				if (tie(r)) coins.push({ x: 0.25 * a.x + 0.5 * c.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * c.y + 0.25 * b.y, d: flipAt(r + 1) + 0.4, team: ord[r].team });
			}
			spot = items.find((i) => i.rank === 0) ?? null;
		}
	}
	// a medallion: the team's hex rim, a brass face, the number rolling up to its value, then a slam with sparks
	const SPARKS = Array.from({ length: 10 }, (_, k) => k * 36 + 8);
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={(e) => look && e.key === 'Escape' && close()} />

{#snippet medal(it: Item, where: string)}
	<span class="med {where}" style="--md:{it.fd + 0.28}s; --v:{ini(it)}; --tint:{TINT[it.team]}">
		<span class="mring"></span>
		{#each SPARKS as a (a)}<i class="sp" style="--a:{a}deg"></i>{/each}
		<span class="mbody">
			<span class="hx"></span><span class="hx2"></span>
			<span class="roll"><span class="strip">{#each Array.from({ length: ini(it) + 1 }, (_, k) => k) as k (k)}<b>{k}</b>{/each}</span></span>
		</span>
	</span>
{/snippet}

{#snippet cardFaces(it: Item)}
	<div class="card">
		<div class="face back" style="--fd:{it.fd}s"><CardBack hero={it.hero} /></div>
		<div class="face front" style="--fd:{it.fd}s"><Card heroId={it.hero} card={heroCards(it.hero)[it.card]} /></div>
		<i class="flash" style="--fd:{it.fd}s"></i>
	</div>
{/snippet}

{#if look}
	{#key run}
		<div class="rv {look}" class:ph={mobile} role="presentation" on:click={close}>
			<div class="scrim"></div>
			<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn} <span>· order of play</span></div>

			{#if look === 'order'}
				{#if spot}<div class="spot" style="left:{spot.x}px; top:{spot.y}px; --cw:{spot.cw}px; --sd:{sortT + 0.7}s"></div>{/if}
				{#each tracks as t, k (k)}
					<div class="track" style="top:{t.y}px; left:{t.x0}px; width:{t.x1 - t.x0}px; --td:{sortT + 0.6}s"><i class="comet" style="--cd:{sortT + 1.1}s"><b></b></i></div>
				{/each}
			{:else if look === 'loading'}
				{#if bar}<div class="bar" style="top:{bar.y}px; height:{bar.h}px"></div>{/if}
				{#if seam.x != null}<div class="vs v" style="left:{seam.x}px"><i></i><b>VS</b><i></i></div>{:else if seam.y != null}<div class="vs h" style="top:{seam.y}px"><i></i><b>VS</b><i></i></div>{/if}
			{:else}
				{#each segs as sg, k (k)}
					<svg class="seg" viewBox="0 0 {vw} {vh}" style="--gd:{sg.at}s" aria-hidden="true">
						<defs><marker id="rvh{run}-{k}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" markerUnits="strokeWidth" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#fff1c2" /></marker></defs>
						<path d={sg.d} class="glow" /><path d={sg.d} class="line" marker-end="url(#rvh{run}-{k})" />
					</svg>
				{/each}
			{/if}

			{#each items as it (it.pid)}
				{#if look === 'loading'}
					<div class="frm" style="left:{it.x}px; top:{it.y}px; width:{it.fw}px; height:{it.fh}px; --cw:{it.cw}px; --ad:{it.ad}s; --tint:{TINT[it.team]}" class:lead={it.rank === 0}>
						<img class="art" src={heroSplash(it.hero)} alt="" style="object-position:{splashFace(it.hero)[0] * 100}% {splashFace(it.hero)[1] * 100}%" />
						<i class="fshade"></i>
						<i class="lit" style="--ld:{doneT}s"></i>
						<span class="hn">{heroName(it.hero)}</span>
						<div class="cardslot">{@render cardFaces(it)}</div>
						{@render medal(it, 'corner')}
						<div class="nm under" style="--nd:{it.fd + 0.37}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.1em' : '1.4em'} ring={2} /><span>{it.name}</span></div>
					</div>
				{:else}
					<div class="pos" style="left:{it.x}px; top:{it.y}px; --cw:{it.cw}px; --ad:{it.ad}s; --tint:{TINT[it.team]}">
						<div class="mv" style="--mx:{it.mx}px; --my:{it.my}px; --sort:{sortT}s" class:sorting={look === 'order'}>
							{@render medal(it, look === 'order' ? 'top' : it.up ? 'bottom' : 'topedge')}
							{#if look === 'path' && it.up}<div class="nm above" style="--nd:{it.fd + 0.37}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.1em' : '1.4em'} ring={2} /><span>{it.name}</span></div>{/if}
							{@render cardFaces(it)}
							{#if look === 'order' && it.rank === 0}<i class="lit card-lit" style="--ld:{sortT + 0.7}s"></i>{/if}
							{#if !(look === 'path' && it.up)}<div class="nm" style="--nd:{it.fd + 0.37}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.1em' : '1.4em'} ring={2} /><span>{it.name}</span></div>{/if}
						</div>
					</div>
					{#if look === 'path' && it.rank === 0}
						<div class="startring" style="left:{it.x}px; top:{it.up ? it.y + (it.cw * AR) / 2 : it.y - (it.cw * AR) / 2}px; --sd:{doneT}s"></div>
					{/if}
				{/if}
			{/each}

			{#each tokens as t, k (k)}
				<div class="tok" class:lead={t.lead} style="left:{t.x}px; top:{t.y}px; --ts:{t.s}px; --td:{t.d}s; --tint:{TINT[t.it.team]}">
					<PlayerIcon hero={t.it.hero} team={t.it.team} color={t.it.color} size="{t.s}px" ring={2} />
				</div>
			{/each}
			{#each arrows as a, k (k)}<i class="arrow" style="left:{a.x}px; top:{a.y}px; --ad2:{a.d}s"></i>{/each}
			{#each coins as c, k (k)}<img class="coin" class:sm={c.sm} src={coin(c.team)} alt="" style="left:{c.x}px; top:{c.y}px; --cd:{c.d}s" />{/each}
			<div class="hint" style="--hd:{doneT + 0.4}s">{mobile ? 'Tap' : 'Click'} anywhere to continue</div>
		</div>
	{/key}
{/if}

<style>
	.rv { position: fixed; inset: 0; z-index: 60; cursor: pointer; overflow: hidden; font-family: 'Modesto Poster', serif; color: #f6ead2; }
	.scrim { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, #08182c, #02060c); animation: fade 0.35s ease both; }
	@keyframes fade { from { opacity: 0; } }
	.title { position: absolute; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-size: clamp(1.1rem, 3.4vw, 2.2rem); letter-spacing: 0.06em; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7), 0 0 22px rgba(199, 154, 78, 0.4); animation: fade 0.5s ease 0.2s both; z-index: 3; }
	.title span { color: #c79a4e; font-size: 0.66em; }
	.hint { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: #8b7a52; white-space: nowrap; animation: fade 0.6s ease var(--hd) both; }

	/* a card's place: arrives (outer) · slides into order (middle) · flips (faces) */
	.pos { position: absolute; width: var(--cw); margin-left: calc(var(--cw) / -2); margin-top: calc(var(--cw) * -0.698); animation: arrive 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) var(--ad) both; z-index: 2; }
	@keyframes arrive { from { transform: translateY(40px); opacity: 0; } 35% { opacity: 1; } }
	.mv { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
	.mv.sorting { animation: sortmv 0.75s cubic-bezier(0.5, 0, 0.2, 1) var(--sort) both; }
	@keyframes sortmv { from { transform: translate(var(--mx), var(--my)); } to { transform: none; } }
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

	/* the initiative medallion: hex rim in the team colour, a brass face, the number rolling up, then a slam + sparks */
	.med { --ms: clamp(34px, calc(var(--cw) * 0.26), 62px); position: absolute; z-index: 3; width: var(--ms); height: var(--ms); margin: calc(var(--ms) / -2) 0 0 calc(var(--ms) / -2); animation: medIn 0.25s ease-out var(--md) both; }
	.med.top { left: 50%; top: calc(var(--ms) * -0.62); }
	.med.bottom { left: 50%; top: calc(var(--cw) * 1.396); } /* the top row's card: on its lower edge (the path's node) */
	.med.topedge { left: 50%; top: 0; } /* the bottom row's card: on its upper edge */
	.med.corner { left: calc(var(--ms) * 0.42); top: calc(var(--ms) * 0.42); }
	@keyframes medIn { from { opacity: 0; transform: scale(0.4); } }
	.mbody { position: absolute; inset: 0; display: grid; place-items: center; animation: slam 0.42s cubic-bezier(0.3, 1.8, 0.5, 1) calc(var(--md) + 0.5s) both; }
	@keyframes slam { 0% { transform: scale(1); } 35% { transform: scale(1.32); } to { transform: scale(1); } }
	.hx, .hx2 { position: absolute; clip-path: polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%); }
	.hx { inset: 0; background: linear-gradient(160deg, color-mix(in srgb, var(--tint) 55%, white), var(--tint) 45%, color-mix(in srgb, var(--tint) 60%, black)); }
	.hx2 { inset: 11%; background: radial-gradient(circle at 38% 30%, #fff3c4, #e2b65a 45%, #8a5b1c); }
	.roll { position: relative; height: 1em; overflow: hidden; font-size: calc(var(--ms) * 0.46); line-height: 1; color: #1a1206; text-shadow: 0 1px 0 rgba(255, 255, 255, 0.45); }
	.strip { display: flex; flex-direction: column; align-items: center; animation: roll 0.5s cubic-bezier(0.25, 0.6, 0.3, 1) var(--md) both; transform: translateY(calc(var(--v) * -1em)); }
	.strip b { display: block; height: 1em; font-weight: 400; }
	@keyframes roll { from { transform: translateY(0); } }
	.mring { position: absolute; inset: -40%; border-radius: 50%; background: radial-gradient(closest-side, transparent 58%, color-mix(in srgb, var(--tint) 70%, white) 66%, transparent 74%); opacity: 0; animation: ring 0.6s ease-out calc(var(--md) + 0.5s) both; }
	@keyframes ring { 0% { opacity: 1; transform: scale(0.5); } to { opacity: 0; transform: scale(1.35); } }
	.sp { position: absolute; left: 50%; top: 50%; width: calc(var(--ms) * 0.22); height: 3px; margin: -1.5px 0 0 0; border-radius: 2px; background: linear-gradient(90deg, #fff6d0, var(--tint)); transform-origin: 0 50%; opacity: 0; animation: spark 0.55s ease-out calc(var(--md) + 0.5s) both; }
	@keyframes spark { 0% { opacity: 1; transform: rotate(var(--a)) translateX(calc(var(--ms) * 0.35)) scaleX(0.4); } to { opacity: 0; transform: rotate(var(--a)) translateX(calc(var(--ms) * 1)) scaleX(1); } }

	/* C · Order of Play: arrows light in sequence, a glow runs the track, the first to act stands in the light */
	.spot { position: absolute; width: calc(var(--cw) * 2.2); height: calc(var(--cw) * 3); margin: calc(var(--cw) * -1.5) 0 0 calc(var(--cw) * -1.1); background: radial-gradient(closest-side, rgba(243, 212, 138, 0.28), transparent 70%); opacity: 0; animation: spotIn 0.8s ease var(--sd) both; z-index: 1; }
	@keyframes spotIn { to { opacity: 1; } }
	.track { position: absolute; height: 3px; background: linear-gradient(90deg, transparent, #c79a4e 8%, #f3d48a 50%, #c79a4e 92%, transparent); transform-origin: left; transform: scaleX(0); animation: grow 0.6s ease-out var(--td) both; }
	@keyframes grow { to { transform: scaleX(1); } }
	.comet { position: absolute; inset: 0; opacity: 0; animation: comet 2.8s ease-in-out var(--cd) infinite; }
	.comet b { position: absolute; top: 50%; left: 0; width: 70px; height: 10px; margin: -5px 0 0 -35px; border-radius: 50%; background: radial-gradient(closest-side, #fff8dc, rgba(243, 212, 138, 0.6) 45%, transparent); }
	/* the glow runs the track in acting order (left → right), rests, runs again */
	@keyframes comet { 0% { transform: translateX(0); opacity: 0; } 8% { opacity: 1; } 55% { opacity: 1; } 62% { transform: translateX(100%); opacity: 0; } to { transform: translateX(100%); opacity: 0; } }
	.arrow { position: absolute; z-index: 3; width: 16px; height: 16px; margin: -8px 0 0 -12px; border-right: 4px solid #f3d48a; border-top: 4px solid #f3d48a; transform: rotate(45deg); filter: drop-shadow(0 0 6px rgba(243, 212, 138, 0.7)); opacity: 0; animation: arrowIn 0.35s cubic-bezier(0.3, 1.7, 0.5, 1) var(--ad2) both; }
	@keyframes arrowIn { from { opacity: 0; transform: rotate(45deg) translate(-8px, 8px); } to { opacity: 1; transform: rotate(45deg); } }
	.ph .arrow { width: 9px; height: 9px; margin: -5px 0 0 -6px; border-width: 3px; }

	/* A · Loading Screen: portrait frames, the VS seam, a bar of faces filling in acting order */
	.frm { position: absolute; transform: translate(-50%, -50%); border-radius: 10px; overflow: visible; animation: arriveF 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) var(--ad) both; z-index: 2; }
	@keyframes arriveF { from { transform: translate(-50%, calc(-50% + 40px)); opacity: 0; } 35% { opacity: 1; } }
	.frm .art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: 10px; box-shadow: 0 0 0 2px var(--tint), 0 16px 34px rgba(0, 0, 0, 0.65); }
	.frm .fshade { position: absolute; inset: 0; border-radius: 10px; background: linear-gradient(180deg, rgba(4, 10, 20, 0) 18%, rgba(4, 10, 20, 0.86) 48%, rgba(4, 10, 20, 0.96)); }
	.frm .lit { position: absolute; inset: -6px; border-radius: 14px; box-shadow: 0 0 0 3px #f3d48a, 0 0 30px rgba(243, 212, 138, 0.55); opacity: 0; }
	.frm.lead .lit { animation: fade2 0.6s ease var(--ld) both; }
	.card-lit { position: absolute; left: -6px; top: -6px; width: calc(var(--cw) + 12px); aspect-ratio: 1192 / 1664; border-radius: 8%; box-shadow: 0 0 0 3px #f3d48a, 0 0 30px rgba(243, 212, 138, 0.55); opacity: 0; animation: fade2 0.6s ease var(--ld) both; pointer-events: none; }
	@keyframes fade2 { to { opacity: 1; } }
	.hn { position: absolute; right: 10px; top: 8px; font-size: clamp(0.7rem, calc(var(--cw) / 12), 1.15rem); letter-spacing: 0.05em; text-shadow: 0 2px 6px #000; }
	.cardslot { position: absolute; left: 50%; bottom: calc(var(--cw) * 0.04); transform: translateX(-50%); }
	.nm.under { position: absolute; left: 0; right: 0; top: 100%; margin-top: 6px; justify-content: center; }
	.bar { position: absolute; left: 6%; right: 6%; transform: translateY(-50%); border-top: 1px solid rgba(199, 154, 78, 0.6); border-bottom: 1px solid rgba(199, 154, 78, 0.6); background: linear-gradient(90deg, transparent, rgba(9, 22, 40, 0.9) 15%, rgba(9, 22, 40, 0.9) 85%, transparent); animation: fade 0.5s ease 0.3s both; }
	.tok { position: absolute; z-index: 4; transform: translate(-50%, -50%); animation: tokIn 0.4s cubic-bezier(0.3, 1.7, 0.5, 1) var(--td) both; }
	@keyframes tokIn { from { transform: translate(-50%, -50%) scale(0); } }
	.tok.lead::after { content: ''; position: absolute; inset: -7px; border-radius: 50%; box-shadow: 0 0 0 2px #f3d48a, 0 0 16px rgba(243, 212, 138, 0.7); }
	.vs { position: absolute; display: flex; align-items: center; gap: 10px; z-index: 1; animation: fade 0.6s ease 0.5s both; }
	.vs.v { top: 24%; bottom: 8%; flex-direction: column; transform: translateX(-50%); }
	.vs.h { left: 6%; right: 6%; transform: translateY(-50%); }
	.vs i { flex: 1; background: linear-gradient(180deg, transparent, rgba(199, 154, 78, 0.7), transparent); }
	.vs.v i { width: 2px; } .vs.h i { height: 2px; background: linear-gradient(90deg, transparent, rgba(199, 154, 78, 0.7), transparent); }
	.vs b { font-weight: 400; font-size: clamp(1rem, 2.4vw, 1.7rem); color: #f3d48a; letter-spacing: 0.1em; text-shadow: 0 0 14px rgba(243, 212, 138, 0.5); }

	/* B · Draft Path: segments drawn card to card in acting order (scaleX, transform only); the start node rings */
	.seg { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; opacity: 0; animation: fade2 0.35s ease-out var(--gd) both; }
	.seg path { fill: none; stroke-linecap: round; }
	.seg .glow { stroke: rgba(243, 212, 138, 0.28); stroke-width: 12; }
	.seg .line { stroke: #f3d48a; stroke-width: 3.5; }
	.ph .seg .glow { stroke-width: 8; } .ph .seg .line { stroke-width: 2.5; }
	.nm.above { position: absolute; bottom: 100%; margin-bottom: 6px; left: 0; right: 0; justify-content: center; }
	.startring { position: absolute; z-index: 2; width: 92px; height: 92px; margin: -46px 0 0 -46px; border-radius: 50%; box-shadow: 0 0 0 3px #f3d48a, 0 0 24px rgba(243, 212, 138, 0.6); opacity: 0; animation: breathe 2.2s ease-in-out var(--sd) infinite; }
	.ph .startring { width: 56px; height: 56px; margin: -28px 0 0 -28px; }
	@keyframes breathe { 0%, 100% { opacity: 0.25; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.06); } }

	.coin { position: absolute; z-index: 5; width: 46px; aspect-ratio: 1; margin: -23px 0 0 -23px; border-radius: 50%; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6); animation: drop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1) var(--cd) both; }
	.ph .coin, .coin.sm { width: 30px; margin: -15px 0 0 -15px; }
	.ph .coin.sm { width: 22px; margin: -11px 0 0 -11px; }
	@keyframes drop { from { transform: translateY(-60vh) rotate(-540deg); opacity: 0; } 30% { opacity: 1; } }

	@media (prefers-reduced-motion: reduce) { .rv * { animation-duration: 0.01s !important; } }
</style>
