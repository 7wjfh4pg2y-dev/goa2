<script lang="ts">
	// The six stats as bubbles: the stat's own art in the middle, a rim of 3 segments (attack / defence / initiative)
	// or 1 (movement / range / radius) that lights up as items are taken, and +N over the art once it has items.
	// Each lit segment takes the colour of the card that gave that item, in the order taken (pass `cs`);
	// one-card stats (movement / range / radius) glow all round in that card's colour.
	import { statDeltas, statColors, type PlayerCardState } from '$lib/cards/cardstate';
	export let cs: PlayerCardState | null = null;
	export let deltas: Partial<Record<'atk' | 'def' | 'init' | 'move' | 'range' | 'radius', number>> = {};
	$: dl = cs ? statDeltas(cs) : deltas;
	$: cl = cs ? statColors(cs) : {};
	const HUE: Record<string, string> = { RED: '#ff6a5c', BLUE: '#5c9dff', GREEN: '#56d175', BRASS: '#f4dfa8' };
	const hue = (k: string, i: number) => HUE[(cl as Record<string, string[]>)[k]?.[i] ?? 'BRASS'] ?? HUE.BRASS;
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
		{@const lv = dl[k] ?? 0}
		<span class="bub" class:up={lv > 0} title="{label}{lv ? ` +${lv}` : ''}">
			<svg viewBox="0 0 50 50" aria-hidden="true">{#each SEG[n] as d, i (i)}{@const on = n === 1 ? lv > 0 : i < lv}{#if on}<path {d} class="gl" style:stroke={hue(k, i)} />{/if}<path {d} class:on style:stroke={on ? hue(k, i) : null} />{/each}</svg>
			<img src={img(file)} alt={label} />
			{#if lv}<b>+{lv}</b>{/if}
		</span>
	{/each}
</span>

<style>
	.bubs { display: flex; justify-content: space-between; }
	.bubs.grid { display: grid; grid-template-columns: repeat(3, var(--b)); gap: 5px 6px; }
	.bub { position: relative; width: var(--b); height: var(--b); display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #2a5378, #0d2540 78%); box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45); }
	/* a stat with items turns GOLD; its rim carries the colours of the cards behind them */
	.bub.up { background: radial-gradient(circle at 50% 32%, #fff0c0, #e2b85a 48%, #9a6c22 100%); box-shadow: 0 2px 5px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 240, 200, 0.5); }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	path { fill: none; stroke: rgba(255, 255, 255, 0.14); stroke-width: 3.6; stroke-linecap: round; }
	path.on { stroke-width: 4; }
	path.gl { stroke-width: 8; opacity: 0.35; }
	img { width: 58%; height: 58%; object-fit: contain; opacity: 0.6; } /* clear of the bubble's edge */
	.bub.up img { opacity: 1; filter: brightness(0.32) sepia(0.5); }
	/* the count: small, low in the bubble, so the stat's art stays readable */
	b { position: absolute; left: 0; right: 0; bottom: 6%; text-align: center; line-height: 1; font-weight: 400; font-size: calc(var(--b) * 0.3); color: #fff; text-shadow: 0 0 2px #000, 0 0 4px #000, 0 1px 1px #000; }
</style>
