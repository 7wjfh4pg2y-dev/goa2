<script lang="ts">
	// The attacker's raised sword (2026-11-03, the user's pick A on artifact 'Attack Value Options'): gold and
	// steel, point up, the attack value on the guard's medallion — the partner of the defender's shield. A small
	// gem says an item is added in (the colour of the card behind it). Drawn inside BoardCanvas's badge layer at
	// the attacker (0, 0 = the token's centre; `s` = a hex's size in layer px). Hover / tap = the sum (`onCalc`).
	export let total = 0;
	export let pip = ''; // the gem's colour (css), '' = no item
	export let s = 40;
	export let uid = 'a';
	export let onCalc: (el: HTMLElement | null, tap?: boolean) => void = () => {};
	let hit: HTMLButtonElement;
</script>

<svg class="sword" width={s * 1.3} height={s * 1.95} viewBox="0 0 100 150" style="left:{-s * 0.65}px; top:{-s * 2.62}px" aria-hidden="true">
	<defs>
		<linearGradient id="swb{uid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f6f9fd"/><stop offset=".47" stop-color="#c3ccd8"/><stop offset=".53" stop-color="#7a8596"/><stop offset="1" stop-color="#3f4755"/></linearGradient>
		<linearGradient id="swg{uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2c8"/><stop offset=".5" stop-color="#d9ac55"/><stop offset="1" stop-color="#7e5a1e"/></linearGradient>
		<radialGradient id="swm{uid}" cx=".4" cy=".32" r=".75"><stop offset="0" stop-color="#ff8a5c"/><stop offset=".55" stop-color="#c22d18"/><stop offset="1" stop-color="#5c0d05"/></radialGradient>
		<radialGradient id="swr{uid}" cx=".35" cy=".3" r=".7"><stop offset="0" stop-color="#ffb3a6"/><stop offset=".5" stop-color="#d4231a"/><stop offset="1" stop-color="#5a0703"/></radialGradient>
	</defs>
	<g opacity=".4" transform="translate(3,5)"><path d="M37,98 L50,3 L63,98Z" fill="#000"/><circle cx="50" cy="100" r="29" fill="#000"/></g>
	<path d="M37,100 L39,26 L50,2 L61,26 L63,100Z" fill="url(#swb{uid})" stroke="#262c35" stroke-width="1.8" stroke-linejoin="round"/>
	<path d="M50,10 L50,78" stroke="rgba(28,34,44,.55)" stroke-width="3"/>
	<path d="M42,28 L41,84" stroke="rgba(255,255,255,.8)" stroke-width="2"/>
	<rect x="44" y="118" width="12" height="20" rx="3" fill="#3a2414" stroke="#1a0f07" stroke-width="1.4"/>
	<path d="M44,123 L56,121 M44,129 L56,127 M44,135 L56,133" stroke="#c9a15a" stroke-width="1.8"/>
	<circle cx="50" cy="142" r="7.5" fill="url(#swr{uid})" stroke="url(#swg{uid})" stroke-width="2.6"/>
	<path d="M2,104 Q8,94 18,100 Q34,108 50,106 Q66,108 82,100 Q92,94 98,104 Q94,114 84,110 Q66,118 50,117 Q34,118 16,110 Q6,114 2,104Z" fill="url(#swg{uid})" stroke="#5b3f12" stroke-width="1.6"/>
	<circle cx="50" cy="96" r="30" fill="url(#swg{uid})" stroke="#5b3f12" stroke-width="1.8"/>
	<circle cx="50" cy="96" r="23.5" fill="url(#swm{uid})"/>
	<path d="M33,85 Q50,72 67,85" stroke="rgba(255,255,255,.32)" stroke-width="3.5" fill="none" stroke-linecap="round"/>
	<text x="50" y="98" text-anchor="middle" dominant-baseline="middle" class="num" font-size={String(total).length > 1 ? 30 : 38}>{total}</text>
	{#if pip}<g transform="translate(74,118)"><polygon points="0,-10 8.7,-5 8.7,5 0,10 -8.7,5 -8.7,-5" fill="#1a1308" stroke="url(#swg{uid})" stroke-width="2.2"/><polygon points="0,-6 5.2,-3 5.2,3 0,6 -5.2,3 -5.2,-3" fill={pip}/></g>{/if}
</svg>
<!-- the part you can point at: the blade and the medallion (never the token under it) -->
<button class="hit" bind:this={hit} style="left:{-s * 0.42}px; top:{-s * 2.6}px; width:{s * 0.84}px; height:{s * 1.62}px"
	tabindex="-1" aria-label="Attack {total}"
	on:pointerenter={(e) => e.pointerType === 'mouse' && onCalc(hit)} on:pointerleave={(e) => e.pointerType === 'mouse' && onCalc(null)}
	on:pointerdown|stopPropagation on:click|stopPropagation={() => onCalc(hit, true)}></button>

<style>
	.sword { position: absolute; overflow: visible; pointer-events: none; animation: swin .35s cubic-bezier(.2, 1.5, .4, 1) both; }
	.num { font-family: 'Modesto Poster', Georgia, serif; fill: #fff; stroke: rgba(0, 0, 0, .55); stroke-width: 2.2px; paint-order: stroke; }
	.hit { position: absolute; pointer-events: auto; cursor: help; border-radius: 40%; padding: 0; border: 0; background: transparent; }
	@keyframes swin { from { transform: translateY(6px) scale(.3); opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .sword { animation: none; } }
</style>
