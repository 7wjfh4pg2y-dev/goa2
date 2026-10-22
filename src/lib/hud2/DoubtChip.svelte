<script lang="ts">
	// NebKher's Imbue Doubt (and Time to Reconsider / An Illusion of Choice): the colour he named, shown on his player
	// board for everyone — this turn and the next — so the heroes it hits know which card colour to discard.
	import type { NkColor } from './../heropower';
	export let color: NkColor | null;
	export let size = 15;
	export let mini = false; // the gem alone (phone strip, nameplate)
	export let short = false; // the gem + the colour (the side board's top row is tight)
	const GEM: Record<NkColor, string> = { GOLD: '#e8bd52', SILVER: '#c9d2dc', RED: '#d6453a', BLUE: '#3b7fe0', GREEN: '#41ae59' };
	const CNAME: Record<NkColor, string> = { GOLD: 'Gold', SILVER: 'Silver', RED: 'Red', BLUE: 'Blue', GREEN: 'Green' };
	$: tip = !color ? '' : `Doubt: ${CNAME[color]} — named by NebKher (this turn and the next)`;
</script>

{#if color}
<span class="dc" class:mini style="--s:{size}px; --gc:{GEM[color]}" title={tip} aria-label={tip}>
	<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#0a1424" stroke="#ebbd4f" stroke-width="2" /><ellipse cx="20" cy="22" rx="10" ry="11" fill="var(--gc)" /><path d="M20 12 V33 M10 20 H30" stroke="rgba(0,0,0,.45)" stroke-width="1.6" /><ellipse cx="20" cy="11" rx="5" ry="3.4" fill="var(--gc)" /><path d="M12 15 L7 11 M28 15 L33 11 M11 28 L7 32 M29 28 L33 32" stroke="#ebbd4f" stroke-width="1.8" stroke-linecap="round" /></svg>
	{#if !mini}{#if !short}<span>Doubt</span>{/if}<b>{CNAME[color]}</b>{/if}
</span>
{/if}

<style>
	.dc { display: inline-flex; align-items: center; gap: 4px; flex: none; height: calc(var(--s) + 9px); padding: 0 8px 0 3px; border-radius: 999px; border: 1px solid var(--gc);
		background: rgba(10, 20, 36, 0.85); color: #e8eef5; font: 500 calc(var(--s) * 0.85) / 1 system-ui, sans-serif; white-space: nowrap; pointer-events: auto; }
	.dc svg { width: calc(var(--s) + 4px); height: calc(var(--s) + 4px); display: block; overflow: visible; }
	.dc b { font-weight: 700; color: var(--gc); }
	.mini { height: auto; padding: 0; border: 0; background: none; }
	.mini svg { width: var(--s); height: var(--s); }
</style>
