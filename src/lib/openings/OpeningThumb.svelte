<script lang="ts">
	// An opening as a still SNAPSHOT (the hero page's list), framed like the compendium's pictures: a square round
	// where the action is (the wave, every mark, the start), cut from the island picture the live board paints once.
	// One image and a few dozen shapes in one small svg, however many openings a hero has. Your base at the bottom.
	import MarkLayer from './MarkLayer.svelte';
	import { OPENING_MAP, openingWave, islandBox, hexAt, spawnDirs, takenAt, marksOn, type Opening } from '$lib/openings';

	export let op: Opening;
	export let pic = '';
	export let turned = false;
	export let uid = 'th';

	const box = islandBox(OPENING_MAP);
	const wave = openingWave(OPENING_MAP);
	const dirs = spawnDirs(OPENING_MAP);
	const at = (h: string) => hexAt(h, box.size);
	const ref = (team: string, role: string) => `#mn-token-${team === 'blue' ? 'blue' : 'orange'}-${role === 'ranged' || role === 'heavy' ? role : 'melee'}`;
	$: rot = (op.side === 'orange' ? 180 : 0) + (turned ? 180 : 0);
	$: gone = takenAt(op, 0);
	// the frame: every space in play, a hex and a half round it, made square
	$: frame = (() => {
		const hexes = [...wave.map((m) => m.hex), ...op.marks.flatMap(marksOn), ...(op.start ? [op.start] : [])].filter(Boolean);
		const pts = hexes.map(at), pad = box.size * 1.6;
		const x0 = Math.min(...pts.map((p) => p.x)) - pad, x1 = Math.max(...pts.map((p) => p.x)) + pad;
		const y0 = Math.min(...pts.map((p) => p.y)) - pad, y1 = Math.max(...pts.map((p) => p.y)) + pad;
		const s = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		return { x: cx - s / 2, y: cy - s / 2, s, cx, cy };
	})();
</script>

<div class="thumb">
	<svg viewBox="{frame.x} {frame.y} {frame.s} {frame.s}" aria-hidden="true">
		<rect x={frame.x} y={frame.y} width={frame.s} height={frame.s} fill="#0b2a44" />
		<g transform={rot % 360 ? `rotate(${rot} ${frame.cx} ${frame.cy})` : undefined}>
			{#if pic}<image href={pic} x={box.x} y={box.y} width={box.w} height={box.h} preserveAspectRatio="none" />{/if}
			<MarkLayer layer="under" marks={op.marks} size={box.size} {at} {rot} side={op.side} hero={op.hero} uid="{uid}u" />
			{#each wave as m (m.id)}
				{@const c = at(m.hex)}
				<use href={ref(m.team, m.role)} opacity={gone.has(m.hex) ? 0.3 : 1} transform="translate({c.x} {c.y}) rotate({(dirs[m.team] ?? 0) * 60}) scale({(box.size * 0.72) / 100})" />
			{/each}
			<MarkLayer layer="over" marks={op.marks} size={box.size} {at} {rot} side={op.side} hero={op.hero} uid="{uid}o" />
		</g>
	</svg>
</div>

<style>
	.thumb { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 10px; background: #0b2a44; }
	svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
