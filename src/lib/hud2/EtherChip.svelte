<script lang="ts">
	// Gydion's player board: the spells drifting in the ether (out of his book) — public, a tap shows them large.
	export let count = 0;
	export let size = 15;
	export let label = false; // the large board view: 'Ether' beside the count
	export let onOpen: () => void = () => {};
</script>

<button class="ec" class:lab={label} style="--s:{size}px" title="The ether — {count} spell{count === 1 ? '' : 's'} out of the book" aria-label="The ether: {count} spells"
	disabled={!count} on:click|stopPropagation={onOpen} on:keydown|stopPropagation>
	<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5c4.7 0 8 3 8 6.6 0 3-2.4 5.2-5.4 5.2-2.4 0-4.1-1.6-4.1-3.6 0-1.6 1.3-2.8 2.9-2.8 1.3 0 2.2.9 2.2 2" /><path d="M4.2 9.6C3.2 14.8 6.5 20 12 20.5c2.6.2 4.6-.6 6-1.8" /><circle cx="5.6" cy="5.4" r="1.1" /><circle cx="19.4" cy="16.2" r="0.9" /></svg>
	{#if label}<span>Ether</span>{/if}<b>{count}</b>
</button>

<style>
	.ec { display: inline-flex; align-items: center; gap: 4px; flex: none; height: calc(var(--s) + 9px); padding: 0 8px 0 6px; border-radius: 999px; border: 1px solid rgba(192, 140, 255, 0.55);
		background: rgba(40, 18, 70, 0.8); color: #e2cdff; font: 600 calc(var(--s) * 0.9) / 1 system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
	.ec:hover:not(:disabled) { border-color: #c08cff; background: rgba(70, 32, 120, 0.9); }
	.ec:disabled { opacity: 0.45; cursor: default; }
	.ec svg { width: var(--s); height: var(--s); fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
	.ec circle { fill: currentColor; stroke: none; }
	.ec b { font-weight: 700; font-variant-numeric: tabular-nums; }
	.lab span { font-weight: 500; }
</style>
