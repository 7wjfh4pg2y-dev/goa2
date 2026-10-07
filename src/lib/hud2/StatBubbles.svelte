<script lang="ts">
	// The six stats as bubbles: the stat's own art in the middle, a rim of 3 segments (attack / defence / initiative)
	// or 1 (movement / range / radius) that lights up as items are taken, and +N over the art once it has items.
	export let deltas: Partial<Record<'atk' | 'def' | 'init' | 'move' | 'range' | 'radius', number>> = {};
	export let size = 32;
	export let cols = 6; // 6 = one row, 3 = a 3 × 2 block

	const art = import.meta.glob('$lib/images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const img = (n: string) => Object.entries(art).find(([k]) => k.endsWith(`/${n}.png`))?.[1] ?? '';
	const STATS = [['atk', 'attack', 3, 'Attack'], ['def', 'defense', 3, 'Defense'], ['init', 'initiative', 3, 'Initiative'], ['move', 'movement', 1, 'Movement'], ['range', 'range', 1, 'Range'], ['radius', 'area', 1, 'Radius']] as const;
	function segs(n: number, r = 21) {
		if (n === 1) return [`M 25 ${25 - r} A ${r} ${r} 0 1 1 24.99 ${25 - r}`];
		return Array.from({ length: n }, (_, i) => {
			const a0 = ((i * 120 + 8) * Math.PI) / 180, a1 = ((i * 120 + 112) * Math.PI) / 180;
			return `M ${(25 + r * Math.sin(a0)).toFixed(2)} ${(25 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(25 + r * Math.sin(a1)).toFixed(2)} ${(25 - r * Math.cos(a1)).toFixed(2)}`;
		});
	}
	const SEG = { 1: segs(1), 3: segs(3) } as const;
</script>

<span class="bubs" class:grid={cols === 3} style="--b:{size}px">
	{#each STATS as [k, file, n, label] (k)}
		{@const lv = deltas[k] ?? 0}
		<span class="bub" class:up={lv > 0} title="{label}{lv ? ` +${lv}` : ''}">
			<svg viewBox="0 0 50 50" aria-hidden="true">{#each SEG[n] as d, i (i)}<path {d} class:on={n === 1 ? lv > 0 : i < lv} />{/each}</svg>
			<img src={img(file)} alt={label} />
			{#if lv}<b>+{lv}</b>{/if}
		</span>
	{/each}
</span>

<style>
	.bubs { display: flex; justify-content: space-between; }
	.bubs.grid { display: grid; grid-template-columns: repeat(3, var(--b)); gap: 5px 6px; }
	.bub { position: relative; width: var(--b); height: var(--b); display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #2a5378, #0d2540 78%); box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45); }
	.bub.up { background: radial-gradient(circle at 50% 35%, #3a6890, #12304e 78%); }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	path { fill: none; stroke: rgba(255, 255, 255, 0.14); stroke-width: 3.6; stroke-linecap: round; }
	path.on { stroke: #f4dfa8; }
	img { width: 58%; height: 58%; object-fit: contain; opacity: 0.6; } /* clear of the bubble's edge */
	.bub.up img { opacity: 0.55; }
	b { position: absolute; inset: 0; display: grid; place-items: center; font-weight: 400; font-size: calc(var(--b) * 0.42); color: #fff; text-shadow: 0 0 3px #000, 0 0 6px #000, 0 1px 2px #000; }
</style>
