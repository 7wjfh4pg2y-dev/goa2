<script lang="ts">
	// The sum behind an attack / defence number: a small bubble above the sword or shield (BoardCanvas places it
	// in screen px, so it stays readable at any zoom). Lines = card, items (with their gem), minions …
	import { PIP_HUE, type CalcLine } from '$lib/attackValue';
	export let x = 0; // the bubble's arrow tip, in px of the board box
	export let y = 0;
	export let title = '';
	export let lines: CalcLine[] = [];
	export let total = '';
	export let note = '';
	export let tone: 'atk' | 'def' = 'atk';
	const sg = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
</script>

<div class="cb {tone}" style="left:{x}px; top:{y}px" role="tooltip">
	<div class="in">
		<div class="hd">{title}</div>
		{#each lines as l}
			<div class="r">
				<span class="lb">{#if l.pip}<i class="gem" style="background:{PIP_HUE[l.pip] ?? l.pip}"></i>{/if}{l.label}</span>
				<span class="v">{l.plain ? l.value : sg(l.value)}</span>
			</div>
		{/each}
		<div class="r sum"><span class="lb">{title}</span><span class="v">{total}</span></div>
		{#if note}<div class="note">{note}</div>{/if}
	</div>
</div>

<style>
	.cb { position: absolute; z-index: 6; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; animation: cbin .14s ease-out both; }
	.in { min-width: 150px; max-width: 240px; padding: 8px 11px 9px; border-radius: 10px; background: rgba(9, 15, 29, .96);
		border: 1px solid rgba(214, 178, 106, .6); box-shadow: 0 8px 22px rgba(0, 0, 0, .5), inset 0 1px 0 rgba(255, 240, 200, .12);
		font-family: 'Modesto Poster', Georgia, serif; color: #e9eef8; font-variant-numeric: tabular-nums; }
	.cb::after { content: ''; position: absolute; left: 50%; bottom: -6px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg);
		background: rgba(9, 15, 29, .96); border-right: 1px solid rgba(214, 178, 106, .6); border-bottom: 1px solid rgba(214, 178, 106, .6); }
	.hd { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #d6b26a; margin-bottom: 4px; }
	.atk .hd { color: #ff9b7a; }
	.r { display: flex; justify-content: space-between; align-items: baseline; gap: 14px; font-size: 14px; line-height: 1.45; }
	.lb { display: inline-flex; align-items: center; gap: 6px; color: #b7c3da; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.v { color: #fff; }
	.sum { margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(214, 178, 106, .35); font-size: 16px; }
	.sum .lb { color: #fff; }
	.note { margin-top: 3px; font-size: 11px; color: #93a1bd; }
	.gem { flex: none; width: 10px; height: 11px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); box-shadow: 0 0 0 1px #000; }
	@keyframes cbin { from { opacity: 0; transform: translate(-50%, calc(-100% - 4px)); } }
	@media (prefers-reduced-motion: reduce) { .cb { animation: none; } }
</style>
