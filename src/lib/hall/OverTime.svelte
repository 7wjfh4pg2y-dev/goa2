<script lang="ts">
	// Rating over time: one line per player in THEIR colour (the same colour they wear in the game), x = the games in
	// order, y = the rating after each game they played. The start (1200) is a dashed rule. A legend toggles players;
	// with four or fewer showing, each line also carries its name at its end. Hover = a crosshair on that game and
	// everyone who played it, with their rating and the change.
	import type { League } from '$lib/league';
	import { START_RATING } from '$lib/league';
	import { colorHex } from '$lib/match';

	export let league: League;
	export let onOpen: (key: string) => void = () => {};

	const T = 16, B = 30, L = 50;
	let cw = 1000, ch = 340;
	$: W = Math.max(300, cw);
	$: H = Math.max(200, ch);
	let hidden = new Set<string>();
	let hover: number | null = null;
	let wrap: HTMLDivElement;

	// a dark player colour on the navy would vanish: lift it towards white
	function lineColor(id: string) {
		const hex = id ? colorHex(id) : '#94a3b8';
		const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
		const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
		if (lum >= 0.22) return hex;
		const k = 0.5, mix = (c: number) => Math.round(c + (255 - c) * k);
		return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
	}
	$: games = league.games;
	$: idx = new Map(games.map((g, i) => [g.id, i]));
	// colour follows the PLAYER: their own colour when it is theirs alone, else a fixed slot of the chart palette,
	// handed out in name order (never by rank, so a re-sort never repaints anyone)
	const PALETTE = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#e66767', '#008300'];
	$: colours = (() => {
		const ps = [...league.players].sort((a, b) => a.key.localeCompare(b.key));
		const count = new Map<string, number>();
		for (const p of ps) if (p.color) count.set(p.color, (count.get(p.color) ?? 0) + 1);
		const out = new Map<string, string>();
		let slot = 0;
		for (const p of ps) out.set(p.key, p.color && count.get(p.color) === 1 ? lineColor(p.color) : PALETTE[slot++ % PALETTE.length]);
		return out;
	})();
	$: series = league.players.map((p) => ({
		key: p.key, name: p.name, color: colours.get(p.key) ?? '#94a3b8',
		pts: [...p.history].reverse().map((m) => ({ x: idx.get(m.id) ?? 0, y: m.rating, d: m.delta }))
	}));
	$: shown = series.filter((s) => !hidden.has(s.key));
	$: R = shown.length <= 4 ? 120 : 20;
	$: ys = shown.flatMap((s) => s.pts.map((p) => p.y)).concat(START_RATING);
	$: lo = Math.floor((Math.min(...ys) - 10) / 25) * 25;
	$: hi = Math.ceil((Math.max(...ys) + 10) / 25) * 25;
	$: X = (i: number) => L + (games.length <= 1 ? (W - L - R) / 2 : (i / (games.length - 1)) * (W - L - R));
	$: Y = (v: number) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
	$: yticks = (() => { const step = Math.max(25, Math.ceil((hi - lo) / 5 / 25) * 25); const out: number[] = []; for (let v = lo; v <= hi; v += step) out.push(v); return out; })();
	$: xticks = (() => { const n = games.length, k = Math.min(n, 6); return n ? Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, k - 1))).filter((v, i, a) => a.indexOf(v) === i) : []; })();
	const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	const toggle = (k: string) => { const h = new Set(hidden); if (h.has(k)) h.delete(k); else h.add(k); hidden = h; };

	function move(e: PointerEvent) {
		const r = wrap.getBoundingClientRect();
		const x = ((e.clientX - r.left) / r.width) * W;
		if (!games.length) return;
		let best = 0, bd = Infinity;
		for (let i = 0; i < games.length; i++) { const d = Math.abs(X(i) - x); if (d < bd) { bd = d; best = i; } }
		hover = best;
	}
	$: hg = hover != null ? games[hover] : null;
	$: rows = hover != null ? shown.map((s) => ({ s, p: s.pts.find((p) => p.x === hover) })).filter((x) => !!x.p) : [];
	$: tipLeft = hover != null ? (X(hover) / W) * 100 : 0;
</script>

<section class="panel ot">
	<div class="legend" role="group" aria-label="Players">
		{#each series as s (s.key)}
			<button class="lg" class:off={hidden.has(s.key)} on:click={() => toggle(s.key)} title={hidden.has(s.key) ? 'Show' : 'Hide'}><i style="background:{s.color}"></i>{s.name}</button>
		{/each}
	</div>
	<div class="plot" bind:this={wrap} bind:clientWidth={cw} bind:clientHeight={ch} on:pointermove={move} on:pointerleave={() => (hover = null)} role="img" aria-label="Rating after each game, one line per player">
		<svg viewBox="0 0 {W} {H}">
			{#each yticks as v (v)}<line class="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text class="yl" x={L - 8} y={Y(v) + 4}>{v}</text>{/each}
			<line class="base" x1={L} x2={W - R} y1={Y(START_RATING)} y2={Y(START_RATING)} />
			{#each xticks as i (i)}<text class="xl" x={X(i)} y={H - 8}>{day(games[i].at)}</text>{/each}
			{#if hover != null}<line class="cross" x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} />{/if}
			{#each shown as s (s.key)}
				<polyline class="ln" points={s.pts.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')} style="stroke:{s.color}" />
				{#each s.pts as p (p.x)}<circle class="dot" class:on={hover === p.x} cx={X(p.x)} cy={Y(p.y)} r={hover === p.x ? 5 : 3.5} style="fill:{s.color}" />{/each}
				{#if shown.length <= 4 && s.pts.length}
					{@const last = s.pts[s.pts.length - 1]}
					<text class="dl" x={X(last.x) + 9} y={Y(last.y) + 4}>{s.name} · {last.y}</text>
				{/if}
			{/each}
		</svg>
		{#if hg}
			<div class="tip" style="left:{tipLeft}%" class:flip={tipLeft > 60}>
				<b>Game {hover! + 1}</b> <small>{day(hg.at)} · {hg.winner === 'orange' ? 'Atlanteans' : 'Titans'} won</small>
				{#each rows as r (r.s.key)}
					<button class="tr" on:click={() => onOpen(r.s.key)}><i style="background:{r.s.color}"></i><span>{r.s.name}</span><b>{r.p?.y}</b><em class:up={(r.p?.d ?? 0) > 0} class:down={(r.p?.d ?? 0) < 0}>{(r.p?.d ?? 0) > 0 ? '+' : ''}{r.p?.d}</em></button>
				{/each}
			</div>
		{/if}
	</div>
	<p class="fine">Rating after each game · dashed line = the start ({START_RATING}). Tap a name above to hide or show it.</p>
</section>

<style>
	.ot { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
	.legend { display: flex; flex-wrap: wrap; gap: 6px; }
	.lg { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font: inherit; font-size: 13.5px; color: var(--ink); background: var(--raise); border: 1px solid var(--hair); cursor: pointer; }
	.lg i { width: 12px; height: 3px; border-radius: 2px; }
	.lg.off { opacity: 0.4; }
	.plot { position: relative; height: clamp(240px, 46vh, 420px); }
	svg { width: 100%; height: 100%; overflow: visible; }
	.grid { stroke: rgba(255, 255, 255, 0.07); stroke-width: 1; }
	.base { stroke: var(--brass-line); stroke-dasharray: 5 5; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.cross { stroke: rgba(255, 255, 255, 0.35); stroke-width: 1; vector-effect: non-scaling-stroke; }
	.yl, .xl, .dl { font-family: inherit; font-size: 12px; fill: var(--ink-3); }
	.yl { text-anchor: end; }
	.xl { text-anchor: middle; }
	.dl { fill: var(--ink-2); }
	.ln { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
	.dot { stroke: #0b1a2c; stroke-width: 2; vector-effect: non-scaling-stroke; }
	.tip { position: absolute; top: 6px; transform: translateX(12px); min-width: 190px; padding: 8px 10px; border-radius: 8px; background: rgba(6, 18, 32, 0.97); border: 1px solid var(--brass-line); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5); font-size: 13px; pointer-events: auto; z-index: 2; }
	.tip.flip { transform: translateX(calc(-100% - 12px)); }
	.tip small { color: var(--ink-3); }
	.tip .tr { width: 100%; display: grid; grid-template-columns: 10px 1fr auto 36px; align-items: center; gap: 6px; margin-top: 4px; padding: 0; border: 0; background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
	.tip .tr i { width: 10px; height: 10px; border-radius: 50%; }
	.tip .tr b { font-weight: 400; }
	.tip em { font-style: normal; text-align: right; color: var(--ink-3); }
	.tip em.up { color: var(--ready-hi); } .tip em.down { color: var(--danger-hi); }
	.fine { margin: 0; font-size: 12px; color: var(--ink-3); }
</style>
