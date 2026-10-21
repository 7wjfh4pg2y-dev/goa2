<script lang="ts" context="module">
	export type RevealLook = 'tide' | 'clash' | 'order';
	export const REVEAL_LOOKS: { id: RevealLook; label: string; blurb: string }[] = [
		{ id: 'tide', label: 'A · The Tide Turns', blurb: 'A wave crest rolls across the line; each card turns as the tide passes over it' },
		{ id: 'clash', label: 'B · The Clash', blurb: 'Copper and ice charge in from either side, meet at a brass blade and every card flips on the impact' },
		{ id: 'order', label: 'C · Order of Play', blurb: 'The cards turn in initiative order, highest first, then line up on the brass track — the coin settles ties' }
	];
	export type RevealSeat = { pid: string; name: string; hero: string; team: 'orange' | 'blue'; color: string; card: number };
</script>

<script lang="ts">
	// Card-reveal mock-ups for /splash-demo (not in the game yet). Viewer-relative like every splash: the enemy left
	// (top on phones), your team right (bottom). Only transform / opacity animate; one animation per element
	// (arrive · move · flip are nested).
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
	let vw = 1440, vh = 900;
	let look: RevealLook | null = null, seats: RevealSeat[] = [], turn = 1, tieTeam: 'orange' | 'blue' = 'orange', run = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	export function play(l: RevealLook, s: RevealSeat[], t = 1, tie: 'orange' | 'blue' = 'orange') {
		look = l; seats = s; turn = t; tieTeam = tie; run++;
		if (timer) clearTimeout(timer);
		timer = setTimeout(close, l === 'order' ? 4200 + s.length * 320 : 6600);
	}
	function close() { look = null; if (timer) clearTimeout(timer); timer = null; }

	$: me = (myTeam ?? 'blue') as 'orange' | 'blue';
	$: foe = (me === 'orange' ? 'blue' : 'orange') as 'orange' | 'blue';
	const ini = (s: RevealSeat) => heroCards(s.hero)[s.card]?.initiative ?? 0;
	type Item = RevealSeat & { x: number; y: number; fx: number; fy: number; ad: number; fd: number; mx: number; my: number; rank: number };
	let items: Item[] = [], cw = 200;
	let wave = { S: 0, D: 0, W: 0 }, title = 40, track: { y: number; x0: number; x1: number } | null = null;
	let coins: { x: number; y: number; d: number; team: 'orange' | 'blue' }[] = [];
	const FLIP = 0.37; // the flat flip: back shuts 0.17 s, face opens 0.2 s

	$: layout(look, seats, vw, vh, mobile, me);
	function layout(..._: unknown[]) {
		items = []; coins = []; track = null;
		if (!look) return;
		const n = seats.length, gap = mobile ? 8 : 18, name = mobile ? 22 : 30;
		const seat = [...seats.filter((s) => s.team !== me), ...seats.filter((s) => s.team === me)];
		if (look === 'tide') {
			// one line (phones: rows of 3), the crest rolls left → right; a card turns the moment the crest reaches it
			const cols = mobile ? Math.min(3, n) : n, rows = Math.ceil(n / cols);
			const top = mobile ? 74 : 120;
			cw = Math.min(240, (vw - 32 - (cols - 1) * gap) / cols, ((vh - top - 50) / rows - name - gap) / AR);
			const ch = cw * AR, W = vw * 0.32, S = 0.95, D = mobile ? 1.5 : 1.9;
			wave = { S, D, W };
			const y0 = top + ((vh - top - 30) - rows * (ch + name + gap)) / 2;
			items = seat.map((s, k) => {
				const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
				const x = vw / 2 + (c - (inRow - 1) / 2) * (cw + gap), y = y0 + r * (ch + name + gap) + ch / 2;
				return { ...s, x, y, fx: 0, fy: 26, ad: 0.15 + k * 0.05, fd: S + (D * (x - cw * 0.15)) / (vw + W), mx: 0, my: 0, rank: 0 };
			});
			title = Math.max(mobile ? 34 : 56, y0 - (mobile ? 30 : 46));
		} else if (look === 'clash') {
			// two battle lines charge from their own edge; every card flips on the impact
			const halves = [seat.filter((s) => s.team !== me), seat.filter((s) => s.team === me)];
			const k = Math.max(halves[0].length, halves[1].length, 1);
			const cols = Math.min(3, k), rows = Math.ceil(k / cols);
			if (mobile) {
				const halfH = (vh - 70) / 2 - 24;
				cw = Math.min(150, (vw - 24 - (cols - 1) * gap) / cols, (halfH / rows - name - gap) / AR);
			} else {
				const halfW = vw / 2 - 70;
				cw = Math.min(230, (halfW - (cols - 1) * gap) / cols, ((vh - 150) / rows - name - gap) / AR);
			}
			const ch = cw * AR, IMPACT = 0.95;
			items = halves.flatMap((list, side) => list.map((s, j) => {
				const r = Math.floor(j / cols), c = j % cols, inRow = Math.min(cols, list.length - r * cols);
				const rowH = ch + name + gap;
				let x: number, y: number, fx = 0, fy = 0;
				if (mobile) {
					x = vw / 2 + (c - (inRow - 1) / 2) * (cw + gap);
					const blockH = Math.ceil(list.length / cols) * rowH;
					y = side === 0 ? vh / 2 - 24 - blockH + r * rowH + ch / 2 : vh / 2 + 24 + r * rowH + ch / 2;
					fy = side === 0 ? -vh * 0.6 : vh * 0.6;
				} else {
					// fill each half from the blade outward, so both lines meet in the middle
					const cc = side === 0 ? cols - 1 - c : c;
					const blockW = inRow * cw + (inRow - 1) * gap;
					const x0 = side === 0 ? vw / 2 - 60 - blockW : vw / 2 + 60;
					x = x0 + cc * (cw + gap) + cw / 2;
					const blockH = Math.ceil(list.length / cols) * rowH;
					y = vh / 2 + 20 - blockH / 2 + r * rowH + ch / 2;
					fx = side === 0 ? -vw * 0.6 : vw * 0.6;
				}
				return { ...s, x, y, fx, fy, ad: IMPACT - 0.62, fd: IMPACT + 0.04, mx: 0, my: 0, rank: 0 };
			}));
			title = mobile ? 30 : 52;
		} else {
			// dealt face down in seat order; turned highest initiative first; then onto the track in acting order
			const ord = [...seat].sort((a, b) => ini(b) - ini(a) || (a.team === b.team ? 0 : a.team === tieTeam ? -1 : 1));
			const cols = mobile ? Math.min(3, n) : n, rows = Math.ceil(n / cols);
			const top = mobile ? 74 : 130, badge = mobile ? 30 : 44;
			cw = Math.min(220, (vw - 32 - (cols - 1) * (gap + 10)) / cols, ((vh - top - 60) / rows - badge - name - gap) / AR);
			const ch = cw * AR, g2 = gap + 10;
			const slot = (k: number) => {
				const r = Math.floor(k / cols), c = k % cols, inRow = Math.min(cols, n - r * cols);
				return { x: vw / 2 + (c - (inRow - 1) / 2) * (cw + g2), y: top + badge + r * (ch + badge + name + gap) + ch / 2, r };
			};
			const step = 0.34, first = 0.9;
			items = ord.map((s, rank) => {
				const at = slot(rank), from = slot(seat.indexOf(s));
				return { ...s, x: at.x, y: at.y, fx: 0, fy: 40, ad: 0.12 + seat.indexOf(s) * 0.06, fd: first + rank * step, mx: from.x - at.x, my: from.y - at.y, rank };
			});
			const sortAt = first + n * step + 0.25;
			sortT = sortAt;
			for (let k = 0; k + 1 < ord.length; k++) {
				const a = ord[k], b = ord[k + 1], pa = slot(k), pb = slot(k + 1);
				if (ini(a) === ini(b) && a.team !== b.team && pa.r === pb.r) coins.push({ x: (pa.x + pb.x) / 2, y: pa.y, d: sortAt + 0.75, team: a.team });
			}
			if (!mobile) track = { y: slot(0).y + ch / 2 + name + 10, x0: slot(0).x - cw / 2, x1: slot(n - 1).x + cw / 2 };
			title = mobile ? 34 : 58;
		}
	}
	let sortT = 0;

	// the team emblems (the hero spawn emblems): a twelve-tooth gear for the Atlanteans, a five-point star in a ring for the Titans
	const GEAR = (() => {
		const pts: string[] = [];
		for (let i = 0; i < 24; i++) {
			const a0 = (i / 24) * Math.PI * 2, r = i % 2 ? 40 : 48;
			for (const d of [-0.09, 0.09]) pts.push(`${(50 + r * Math.cos(a0 + d)).toFixed(1)},${(50 + r * Math.sin(a0 + d)).toFixed(1)}`);
		}
		return pts.join(' ');
	})();
	const STAR = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * 2 * Math.PI) / 5; return `${(50 + 34 * Math.cos(a)).toFixed(1)},${(50 + 34 * Math.sin(a)).toFixed(1)}`; }).join(' ');
</script>

<svelte:window bind:innerWidth={vw} bind:innerHeight={vh} on:keydown={(e) => look && e.key === 'Escape' && close()} />

{#snippet emblem(team: 'orange' | 'blue')}
	<svg viewBox="0 0 100 100" aria-hidden="true">
		{#if team === 'orange'}
			<polygon points={GEAR} fill="none" stroke="#e8a35c" stroke-width="2.4" stroke-linejoin="round" /><circle cx="50" cy="50" r="17" fill="none" stroke="#e8a35c" stroke-width="2.4" />
		{:else}
			<circle cx="50" cy="50" r="44" fill="none" stroke="#9fd8ff" stroke-width="2.4" /><polygon points={STAR} fill="none" stroke="#9fd8ff" stroke-width="2.4" stroke-linejoin="round" />
		{/if}
	</svg>
{/snippet}

{#if look}
	{#key run}
		<div class="rv {look}" class:ph={mobile} style="--cw:{cw}px" role="presentation" on:click={close}>
			<div class="scrim"></div>
			<div class="shk">
				{#if look === 'tide'}
					<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn} <span>· the tide turns</span></div>
					<div class="wave" style="--W:{wave.W}px; --S:{wave.S}s; --D:{wave.D}s"><i class="wash"></i><i class="crest"></i><i class="spray"></i></div>
				{:else if look === 'clash'}
					<div class="loom l" class:ph={mobile}>{@render emblem(foe)}</div>
					<div class="loom r" class:ph={mobile}>{@render emblem(me)}</div>
					<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn}</div>
					<div class="blade" class:ph={mobile}><i class="core"></i><i class="glow"></i></div>
					<div class="shock"></div>
				{:else}
					<div class="title" style="top:{title}px">Turn {ROMAN[turn - 1] ?? turn} <span>· order of play</span></div>
					{#if track}
						<div class="track" style="top:{track.y}px; left:{track.x0}px; width:{track.x1 - track.x0}px; --td:{sortT + 0.35}s">
							{#each items as _, k (k)}{#if k}<i class="chev" style="left:{(k / items.length) * 100}%"></i>{/if}{/each}
						</div>
					{/if}
				{/if}
				{#each items as it (it.pid)}
					<div class="pos" style="left:{it.x}px; top:{it.y}px; --fx:{it.fx}px; --fy:{it.fy}px; --ad:{it.ad}s; --tint:{TINT[it.team]}">
						<div class="mv" style="--mx:{it.mx}px; --my:{it.my}px; --sort:{sortT}s">
							{#if look === 'order'}
								<div class="badge" style="--bd:{it.fd + 0.3}s"><b>{ini(it)}</b></div>
								<div class="rank" style="--rd:{sortT + 0.55 + it.rank * 0.07}s">{it.rank + 1}</div>
							{/if}
							<div class="card">
								<div class="face back" style="--fd:{it.fd}s"><CardBack hero={it.hero} /></div>
								<div class="face front" style="--fd:{it.fd}s"><Card heroId={it.hero} card={heroCards(it.hero)[it.card]} /></div>
								<i class="flash" style="--fd:{it.fd}s"></i>
							</div>
							<div class="nm" style="--nd:{it.fd + FLIP}s"><PlayerIcon hero={it.hero} team={it.team} color={it.color} size={mobile ? '1.2em' : '1.5em'} ring={2} /><span>{it.name}</span></div>
						</div>
					</div>
				{/each}
				{#each coins as c, k (k)}
					<img class="coin" src={coin(c.team)} alt="" style="left:{c.x}px; top:{c.y}px; --cd:{c.d}s" />
				{/each}
			</div>
		</div>
	{/key}
{/if}

<style>
	.rv { position: fixed; inset: 0; z-index: 60; cursor: pointer; overflow: hidden; font-family: 'Modesto Poster', serif; color: #f6ead2; }
	.scrim { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(8, 24, 44, 0.97), rgba(2, 6, 12, 0.99)); animation: fade 0.35s ease both; }
	@keyframes fade { from { opacity: 0; } }
	.shk { position: absolute; inset: 0; }
	.title { position: absolute; left: 50%; transform: translate(-50%, -50%); white-space: nowrap; font-size: clamp(1.1rem, 3.4vw, 2.2rem); letter-spacing: 0.06em; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7), 0 0 22px rgba(199, 154, 78, 0.4); animation: fade 0.5s ease 0.2s both; z-index: 3; }
	.title span { color: #c79a4e; font-size: 0.66em; }

	/* a card's place: arrives (outer) · slides into order (middle) · flips (faces) */
	.pos { position: absolute; width: var(--cw); margin-left: calc(var(--cw) / -2); margin-top: calc(var(--cw) * -0.698); animation: arrive 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) var(--ad) both; z-index: 2; }
	@keyframes arrive { from { transform: translate(var(--fx), var(--fy)); opacity: 0; } 35% { opacity: 1; } }
	.mv { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; }
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
	.nm { display: flex; align-items: center; gap: 0.4em; max-width: 100%; font-size: clamp(0.62rem, calc(var(--cw) / 14), 1.1rem); animation: fade 0.4s ease var(--nd) both; }
	.nm span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* A · The Tide Turns: a band of sea with a foam crest on its leading edge rolls across, left → right */
	.wave { position: absolute; top: 0; bottom: 0; left: 0; width: var(--W); transform: translateX(calc(var(--W) * -1)); animation: roll var(--D) linear var(--S) both; z-index: 4; pointer-events: none; }
	@keyframes roll { to { transform: translateX(100vw); } }
	.wash { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(46, 128, 190, 0.1) 55%, rgba(120, 200, 240, 0.22)); }
	.crest { position: absolute; top: 0; bottom: 0; right: 0; width: 26px; background: linear-gradient(90deg, rgba(160, 225, 255, 0), rgba(220, 245, 255, 0.85) 70%, rgba(255, 255, 255, 0.95)); box-shadow: 0 0 34px 10px rgba(150, 215, 255, 0.35); border-radius: 50% / 8%; }
	.spray { position: absolute; top: 0; bottom: 0; right: -14px; width: 28px; background: radial-gradient(3px 3px at 30% 12%, #fff, transparent), radial-gradient(2px 2px at 70% 30%, #e6f7ff, transparent), radial-gradient(3px 3px at 40% 55%, #fff, transparent), radial-gradient(2px 2px at 80% 74%, #e6f7ff, transparent), radial-gradient(3px 3px at 25% 90%, #fff, transparent); opacity: 0.9; }
	.tide .flash { background: radial-gradient(closest-side, rgba(200, 240, 255, 0.75), transparent); }

	/* B · The Clash: the team emblems loom behind each line, a brass blade lands between, the arena shudders */
	.loom { position: absolute; top: 50%; width: min(52vh, 40vw); aspect-ratio: 1; opacity: 0; animation: loom 1.6s ease 0.2s both; }
	.loom.l { left: 25%; transform: translate(-50%, -50%); } .loom.r { left: 75%; transform: translate(-50%, -50%); }
	.loom.ph { width: 46vw; } .loom.l.ph { left: 50%; top: 27%; } .loom.r.ph { left: 50%; top: 73%; }
	.loom :global(svg) { width: 100%; height: 100%; }
	@keyframes loom { from { opacity: 0; } to { opacity: 0.13; } }
	.blade { position: absolute; left: 50%; top: 8%; bottom: 8%; width: 0; z-index: 3; }
	.blade .core { position: absolute; left: -2px; top: 0; bottom: 0; width: 4px; background: linear-gradient(180deg, transparent, #f3d48a 20%, #fff 50%, #f3d48a 80%, transparent); transform: scaleY(0); animation: bladeIn 0.22s cubic-bezier(0.6, 0, 1, 1) 0.92s both; }
	.blade .glow { position: absolute; left: -60px; top: 0; bottom: 0; width: 120px; background: radial-gradient(closest-side, rgba(243, 212, 138, 0.55), transparent); opacity: 0; animation: glowIn 0.9s ease-out 0.98s both; }
	.blade.ph { left: 8%; right: 8%; top: 50%; bottom: auto; width: auto; height: 0; }
	.blade.ph .core { left: 0; right: 0; top: -2px; bottom: auto; width: auto; height: 4px; background: linear-gradient(90deg, transparent, #f3d48a 20%, #fff 50%, #f3d48a 80%, transparent); transform: scaleX(0); animation-name: bladeInX; }
	.blade.ph .glow { left: 0; right: 0; top: -60px; height: 120px; width: auto; }
	@keyframes bladeIn { to { transform: scaleY(1); } }
	@keyframes bladeInX { to { transform: scaleX(1); } }
	@keyframes glowIn { 20% { opacity: 1; } to { opacity: 0.35; } }
	.shock { position: absolute; left: 50%; top: 50%; width: 60vmin; height: 60vmin; margin: -30vmin 0 0 -30vmin; border-radius: 50%; background: radial-gradient(closest-side, transparent 62%, rgba(255, 236, 190, 0.55) 70%, transparent 76%); transform: scale(0.1); opacity: 0; animation: shock 0.7s ease-out 0.97s both; z-index: 3; pointer-events: none; }
	@keyframes shock { 10% { opacity: 1; } to { transform: scale(2.2); opacity: 0; } }
	.clash .shk { animation: shake 0.42s linear 0.97s both; }
	@keyframes shake { 15% { transform: translate(-7px, 3px); } 35% { transform: translate(6px, -4px); } 55% { transform: translate(-4px, 2px); } 75% { transform: translate(2px, -1px); } to { transform: none; } }
	.clash .pos { animation-timing-function: cubic-bezier(0.55, 0, 1, 0.45); }

	/* C · Order of Play: turned one by one (highest first), stamped, then onto the brass track in acting order */
	.order .mv { animation: sortmv 0.75s cubic-bezier(0.5, 0, 0.2, 1) var(--sort) both; }
	@keyframes sortmv { from { transform: translate(var(--mx), var(--my)); } to { transform: none; } }
	.badge { position: absolute; left: 50%; top: 0; transform: translate(-50%, -112%); animation: stamp 0.38s cubic-bezier(0.3, 1.7, 0.5, 1) var(--bd) both; }
	.badge b { display: grid; place-items: center; min-width: 1.9em; height: 1.9em; padding: 0 0.3em; border-radius: 999px; font-weight: 400; font-size: clamp(0.9rem, calc(var(--cw) / 8), 1.6rem); background: radial-gradient(circle at 35% 30%, #f6dc98, #b98635); color: #1a1206; box-shadow: 0 0 0 2px var(--tint), 0 4px 14px rgba(0, 0, 0, 0.5); }
	@keyframes stamp { from { transform: translate(-50%, -112%) scale(2.4); opacity: 0; } 60% { opacity: 1; } }
	.rank { position: absolute; left: 2px; top: 0; transform: translateY(-118%); z-index: 2; width: 1.7em; height: 1.7em; display: grid; place-items: center; border-radius: 50%; font-size: clamp(0.75rem, calc(var(--cw) / 11), 1.2rem); background: #0b1a2e; color: #f3d48a; border: 2px solid #c79a4e; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55); animation: pop 0.3s cubic-bezier(0.3, 1.7, 0.5, 1) var(--rd) both; }
	@keyframes pop { from { transform: translateY(-118%) scale(0); } }
	.track { position: absolute; height: 3px; background: linear-gradient(90deg, transparent, #c79a4e 8%, #f3d48a 50%, #c79a4e 92%, transparent); transform-origin: left; transform: scaleX(0); animation: grow 0.6s ease-out var(--td) both; }
	@keyframes grow { to { transform: scaleX(1); } }
	.chev { position: absolute; top: 50%; width: 10px; height: 10px; margin: -6px 0 0 -5px; border-right: 3px solid #f3d48a; border-top: 3px solid #f3d48a; transform: rotate(45deg); }
	.coin { position: absolute; z-index: 5; width: clamp(34px, calc(var(--cw) * 0.32), 58px); aspect-ratio: 1; margin: calc(clamp(34px, calc(var(--cw) * 0.32), 58px) / -2) 0 0 calc(clamp(34px, calc(var(--cw) * 0.32), 58px) / -2); border-radius: 50%; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.6); animation: drop 0.55s cubic-bezier(0.3, 1.5, 0.5, 1) var(--cd) both; }
	@keyframes drop { from { transform: translateY(-60vh) rotate(-540deg); opacity: 0; } 30% { opacity: 1; } }

	@media (prefers-reduced-motion: reduce) { .rv * { animation-duration: 0.01s !important; } }
</style>
