<script lang="ts">
	// A small line chart in the stats-site style: a faint grid, a dashed reference line, one smooth line per
	// series, the labels underneath. Sized from its box (never stretched text); the strokes keep their width.
	export let series: { values: (number | null)[]; color: string }[] = [];
	export let labels: string[] = [];
	/** the dashed reference (e.g. 50 for a win rate, the starting rating) */
	export let ref: number | null = null;
	export let min: number | null = null;
	export let max: number | null = null;
	export let height = 110;
	/** highlight the last label (the latest) */
	export let lastHot = true;
	// the labels sit evenly across the width; when they would crowd, every k-th is shown (and always the last)
	$: L = labels.length;
	$: stepL = Math.max(1, Math.ceil((L * 64) / Math.max(1, w)));
	$: shown = labels.map((l, i) => ({ l, i, x: L > 1 ? i / (L - 1) : 0.5 })).filter((x) => x.i === L - 1 || (x.i % stepL === 0 && (L - 1 - x.i) >= stepL));

	let w = 300;
	$: all = series.flatMap((s) => s.values).filter((v): v is number => v != null).concat(ref != null ? [ref] : []);
	$: lo = min ?? (all.length ? Math.min(...all) : 0);
	$: hi = max ?? (all.length ? Math.max(...all) : 1);
	$: span = hi - lo || 1;
	$: n = Math.max(1, ...series.map((s) => s.values.length));
	$: X = (i: number) => (n > 1 ? 6 + (i / (n - 1)) * (w - 12) : w / 2);
	$: Y = (v: number) => 8 + (1 - (v - lo) / span) * (height - 16);
	// a smooth path through the known points (Catmull-Rom → cubic Bézier); gaps (null) are skipped
	function path(values: (number | null)[], _w: number, _lo: number, _span: number): string {
		const pts = values.map((v, i) => (v == null ? null : [X(i), Y(v)] as [number, number])).filter((p): p is [number, number] => !!p);
		if (!pts.length) return '';
		if (pts.length === 1) return `M${pts[0][0] - 4},${pts[0][1]}L${pts[0][0] + 4},${pts[0][1]}`;
		let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
			const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
			d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
		}
		return d;
	}
</script>

<div class="line" bind:clientWidth={w}>
	<svg width={w} {height} viewBox="0 0 {w} {height}" aria-hidden="true">
		<rect x="0.5" y="0.5" width={w - 1} height={height - 1} class="frame" />
		{#each Array.from({ length: n }) as _, i (i)}{#if i > 0 && i < n - 1}<line x1={X(i)} x2={X(i)} y1="0" y2={height} class="grid" />{/if}{/each}
		{#if ref != null}<line x1="0" x2={w} y1={Y(ref)} y2={Y(ref)} class="ref" />{/if}
		{#each series as s, k (k)}<path d={path(s.values, w, lo, span)} stroke={s.color} class="ln" />{/each}
	</svg>
	{#if labels.length}
		<div class="lbls">{#each shown as s (s.i)}<span class:hot={lastHot && s.i === L - 1} class:first={s.i === 0} class:last={s.i === L - 1 && L > 1} style="left:{s.x * 100}%">{s.l}</span>{/each}</div>
	{/if}
</div>

<style>
	.line { position: relative; width: 100%; }
	svg { display: block; }
	.frame { fill: none; stroke: rgba(255, 255, 255, 0.06); }
	.grid { stroke: rgba(255, 255, 255, 0.05); }
	.ref { stroke: rgba(255, 255, 255, 0.22); stroke-dasharray: 5 6; }
	.ln { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.lbls { position: relative; height: 22px; margin-top: 6px; font-size: 12px; color: var(--mu, #8a93a2); font-variant-numeric: tabular-nums; }
	.lbls span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
	.lbls span.first { transform: none; }
	.lbls span.last { transform: translateX(-100%); }
	.lbls span.hot { color: var(--au, #f3c454); }
</style>
