<script lang="ts">
	// One opening on the live island (BoardCanvas): the round-1 wave, the hero where it stands at `step`
	// (0 = the whole round: at its start), and the opening's marks under / over the pieces. Your base at the
	// bottom like in the game (`turned` = view it from the far edge instead). The builder makes it interactive.
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import MarkLayer from './MarkLayer.svelte';
	import { OPENING_MAP, openingWave, heroHexAt, marksAt, takenAt, islandBox, type Opening } from '$lib/openings';

	export let op: Opening;
	export let step = 0;
	export let turned = false;
	/** where the hero token stands: its place at `step`, its start, or not drawn */
	export let heroMode: 'step' | 'start' | 'none' = 'step';
	export let interactive = false;
	export let placing = false;
	export let picked: string | null = null;
	export let inset: { t: number; b: number; l?: number; r?: number } | null = null;
	export let effects = false; // a still sea and still minion rims: moving effects distract from the plan (the user, 2026-10-16)
	export let onHex: ((hex: string) => void) | null = null;
	export let onMovePiece: ((id: string, hex: string) => void) | null = null;
	export let uid = 'ob';
	/** marks drawn on top that aren't part of the opening (the builder's "arrow starts here") */
	export let extra: import('$lib/openings').Mark[] = [];

	let board: BoardCanvas;
	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	const wave = openingWave(OPENING_MAP);
	$: gone = takenAt(op, step);
	$: heroHex = heroMode === 'none' ? '' : heroMode === 'start' ? op.start : step > 0 ? heroHexAt(op, step) : op.start;
	$: pieces = [
		...wave.map((m) => ({ ...m, faded: gone.has(m.hex) })),
		...(heroHex ? [{ id: 'hero', hex: heroHex, team: op.side, hero: op.hero, color: TEAM[op.side], name: 'Start' }] : [])
	];
	$: shown = [...marksAt(op, step), ...extra];
	$: rotation = (op.side === 'orange' ? 180 : 0) + (turned ? 180 : 0);

	export const reset = () => board?.reset();
	export const zoomBtn = (f: number) => board?.zoomBtn(f);
	/** a still picture of the island (no pieces) as a data URL, for the snapshots; '' when the board isn't ready */
	export async function picture(width = 720): Promise<string> {
		const box = islandBox(OPENING_MAP);
		const cv = document.createElement('canvas');
		const w = width, h = Math.round((width * box.h) / box.w);
		try {
			const ok = await board?.paintPicture(cv, w, h, { t: 0, r: 0, b: 0, l: 0 }, box.sea);
			return ok ? cv.toDataURL('image/jpeg', 0.86) : '';
		} catch { return ''; }
	}
</script>

<BoardCanvas bind:this={board} map={OPENING_MAP} look="island" {rotation} {interactive} {placing} {pieces} {inset} {effects} sea={effects} rims={effects} wisps={false}
	activeZone="Center" onHex={onHex} onMovePiece={onMovePiece} onCancelPlace={() => {}}>
	{#snippet under(c)}<MarkLayer layer="under" marks={shown} {step} size={c.size} at={c.at} rot={c.rot} side={op.side} hero={op.hero} {picked} uid="{uid}u" />{/snippet}
	{#snippet over(c)}<MarkLayer layer="over" marks={shown} {step} size={c.size} at={c.at} rot={c.rot} side={op.side} hero={op.hero} {picked} uid="{uid}o" />{/snippet}
</BoardCanvas>
