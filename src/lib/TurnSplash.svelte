<script lang="ts">
	// New turn / new round splash: a gold-trimmed crest drops from above and slams
	// down, light rays burst behind it and a shockwave rings out. Never blocks the board.
	import { onDestroy } from 'svelte';

	export let mobile = false;

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
	const DUR = 2300;
	let shown: { kind: 'turn' | 'round'; round: number; turn: number; key: number } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** Show the splash: a new round shows "Round N", a new turn "Turn N". */
	export function play(kind: 'turn' | 'round', round: number, turn: number) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { kind, round, turn, key: Date.now() };
			timer = setTimeout(() => (shown = null), DUR);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

{#if shown}
	{#key shown.key}
		<div class="ts" class:mob={mobile} class:round={shown.kind === 'round'} aria-live="polite">
			<div class="rays"></div>
			<div class="ring"></div>
			<div class="crestw">
				<svg viewBox="0 0 100 110" class="crest" aria-hidden="true">
					<defs><linearGradient id="ts-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b0" /><stop offset=".5" stop-color="#d9a845" /><stop offset="1" stop-color="#8a5d17" /></linearGradient></defs>
					<path d="M50 4 L92 18 V52 C92 80 72 98 50 106 C28 98 8 80 8 52 V18 Z" fill="#0b1220" stroke="url(#ts-g)" stroke-width="6" stroke-linejoin="round" />
					<path d="M50 14 L83 25 V52 C83 74 67 89 50 96 C33 89 17 74 17 52 V25 Z" fill="none" stroke="url(#ts-g)" stroke-width="1.5" opacity=".6" />
				</svg>
				<span class="num">{shown.kind === 'round' ? shown.round : ROMAN[shown.turn] ?? shown.turn}</span>
			</div>
			<div class="txt"><span class="big">{shown.kind === 'round' ? 'Round' : 'Turn'}</span><span class="small">{shown.kind === 'round' ? 'A new round begins' : `Round ${shown.round}`}</span></div>
		</div>
	{/key}
{/if}

<style>
	.ts { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; display: grid; place-items: center; }
	.crestw { position: relative; width: 220px; height: 242px; zoom: var(--uis, 1); display: grid; place-items: center; animation: drop .5s cubic-bezier(.3, 1.5, .5, 1) both, out 2.3s ease both; }
	.round .crestw { width: 250px; height: 275px; }
	.crest { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 10px 24px rgba(0, 0, 0, .75)) drop-shadow(0 0 22px rgba(217, 168, 69, .5)); }
	.num { position: relative; font-size: 5.4rem; color: #ffe3a0; text-shadow: 0 4px 0 rgba(0, 0, 0, .6); margin-top: -10px; }
	.round .num { font-size: 6.2rem; }
	.rays { position: absolute; width: 1200px; height: 1200px; zoom: var(--uis, 1); border-radius: 50%; opacity: 0;
		background: repeating-conic-gradient(from 0deg, rgba(255, 220, 140, .16) 0 6deg, transparent 6deg 18deg);
		mask-image: radial-gradient(circle, #000 10%, transparent 62%); -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 62%);
		animation: rays 2.3s ease-out .25s both; }
	.ring { position: absolute; width: 230px; height: 230px; zoom: var(--uis, 1); border-radius: 50%; border: 5px solid rgba(255, 220, 150, .85); opacity: 0; animation: ring .8s ease-out .38s both; }
	.txt { position: absolute; margin-top: 360px; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .55), 0 0 26px rgba(0, 0, 0, .9); }
	.round .txt { margin-top: 400px; }
	.big { font-size: 3.4rem; line-height: 1; letter-spacing: .04em; animation: fade .3s ease .45s both, out 2.3s ease both; }
	.round .big { color: #ffe3a0; }
	.small { font-size: 1rem; letter-spacing: .4em; text-transform: uppercase; color: #e3cf9c; animation: fade .3s ease .6s both, out 2.3s ease both; }
	@keyframes drop { 0% { transform: translateY(-120vh) scale(1.4); } 70% { transform: translateY(0) scale(1); } 85% { transform: scale(1.06, .94); } 100% { transform: none; } }
	@keyframes rays { 0% { opacity: 0; transform: rotate(0) scale(.5); } 20% { opacity: 1; } 85% { opacity: .8; } 100% { opacity: 0; transform: rotate(40deg) scale(1.1); } }
	@keyframes ring { 0% { opacity: .9; transform: scale(.6); } 100% { opacity: 0; transform: scale(4); border-width: 1px; } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	/* phones */
	.mob .crestw, .mob .ring, .mob .rays, .mob .txt { zoom: .62; }
</style>
