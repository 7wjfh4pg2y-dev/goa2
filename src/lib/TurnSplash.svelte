<script lang="ts">
	// New turn / new round splash — fast, thematic, never blocks the board.
	// Three looks (pick one): 'blade' (a gold slash band), 'crest' (an emblem slams
	// down with a shockwave), 'clash' (orange and blue charge in and collide).
	import { onDestroy } from 'svelte';

	export let variant: 'blade' | 'crest' | 'clash' = 'blade';
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
	$: big = shown ? (shown.kind === 'round' ? `Round ${shown.round}` : `Turn ${ROMAN[shown.turn] ?? shown.turn}`) : '';
	$: small = shown ? (shown.kind === 'round' ? 'A new round begins' : `Round ${shown.round}`) : '';
</script>

{#if shown}
	{#key shown.key}
		<div class="ts {variant}" class:mob={mobile} class:round={shown.kind === 'round'} aria-live="polite">
			{#if variant === 'blade'}
				<div class="band"><div class="streaks"></div><div class="edge"></div></div>
				<div class="txt"><span class="big">{big}</span><span class="small">{small}</span></div>
			{:else if variant === 'crest'}
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
				<div class="txt below"><span class="big">{shown.kind === 'round' ? 'Round' : 'Turn'}</span><span class="small">{shown.kind === 'round' ? 'A new round begins' : `Round ${shown.round}`}</span></div>
			{:else}
				<div class="half o"></div>
				<div class="half b"></div>
				<div class="spark"></div>
				<div class="txt"><span class="big">{big}</span><span class="small">{small}</span></div>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.ts { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; display: grid; place-items: center; }
	.txt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .55), 0 0 26px rgba(0, 0, 0, .9); }
	.big { font-size: 4.2rem; line-height: 1; letter-spacing: .04em; }
	.small { font-size: .95rem; letter-spacing: .4em; text-transform: uppercase; color: #e3cf9c; }
	.round .big { font-size: 5rem; color: #ffe3a0; }

	/* ── A · blade: a gold slash band races across, the number slams in ── */
	.blade .band { position: absolute; left: -10%; width: 120%; top: 50%; height: 150px; zoom: var(--uis, 1); transform: translateY(-50%) skewY(-3deg);
		background: linear-gradient(90deg, transparent, rgba(8, 12, 20, .92) 18%, rgba(8, 12, 20, .92) 82%, transparent);
		border-top: 2px solid #d9a845; border-bottom: 2px solid #d9a845; animation: bladeIn 2.3s cubic-bezier(.16, .9, .2, 1) both; }
	.round.blade .band { height: 180px; background: linear-gradient(90deg, transparent, rgba(40, 26, 6, .92) 18%, rgba(40, 26, 6, .92) 82%, transparent); }
	.blade .streaks { position: absolute; inset: 0; opacity: .5; mix-blend-mode: screen;
		background: repeating-linear-gradient(180deg, transparent 0 11px, rgba(255, 220, 150, .1) 11px 12px), repeating-linear-gradient(90deg, transparent 0 120px, rgba(255, 220, 150, .14) 120px 220px, transparent 220px 380px);
		animation: race .45s linear infinite; }
	.blade .edge { position: absolute; top: 0; bottom: 0; width: 40%; left: -40%; background: linear-gradient(90deg, transparent, rgba(255, 235, 190, .55), transparent); animation: shine .9s ease-out .1s both; }
	.blade .txt { transform: skewY(-3deg); }
	.blade .big { animation: slam .42s cubic-bezier(.2, 1.4, .3, 1) .12s both, out 2.3s ease both; }
	.blade .small { animation: fade .3s ease .3s both, out 2.3s ease both; }
	@keyframes bladeIn {
		0% { transform: translateY(-50%) skewY(-3deg) translateX(-100%); filter: blur(5px); }
		12% { transform: translateY(-50%) skewY(-3deg) translateX(0); filter: blur(0); }
		85% { transform: translateY(-50%) skewY(-3deg) translateX(0); opacity: 1; }
		100% { transform: translateY(-50%) skewY(-3deg) translateX(100%); opacity: 0; filter: blur(5px); }
	}
	@keyframes shine { to { left: 120%; } }

	/* ── B · crest: an emblem drops and slams, rays burst, a shockwave rings out ── */
	.crestw { position: relative; width: 150px; height: 165px; zoom: var(--uis, 1); display: grid; place-items: center; animation: drop .5s cubic-bezier(.3, 1.5, .5, 1) both, out 2.3s ease both; }
	.crest { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 8px 20px rgba(0, 0, 0, .7)) drop-shadow(0 0 18px rgba(217, 168, 69, .45)); }
	.crestw .num { position: relative; font-size: 3.6rem; color: #ffe3a0; text-shadow: 0 3px 0 rgba(0, 0, 0, .6); margin-top: -6px; }
	.rays { position: absolute; width: 900px; height: 900px; zoom: var(--uis, 1); border-radius: 50%; opacity: 0;
		background: repeating-conic-gradient(from 0deg, rgba(255, 220, 140, .16) 0 6deg, transparent 6deg 18deg);
		mask-image: radial-gradient(circle, #000 10%, transparent 62%); -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 62%);
		animation: rays 2.3s ease-out .25s both; }
	.ring { position: absolute; width: 160px; height: 160px; zoom: var(--uis, 1); border-radius: 50%; border: 4px solid rgba(255, 220, 150, .85); opacity: 0; animation: ring .8s ease-out .38s both; }
	.txt.below { margin-top: 250px; position: absolute; }
	.txt.below .big { font-size: 2.6rem; animation: fade .3s ease .45s both, out 2.3s ease both; }
	.txt.below .small { animation: fade .3s ease .6s both, out 2.3s ease both; }
	@keyframes drop { 0% { transform: translateY(-120vh) scale(1.4); } 70% { transform: translateY(0) scale(1); } 85% { transform: scale(1.06, .94); } 100% { transform: none; } }
	@keyframes rays { 0% { opacity: 0; transform: rotate(0) scale(.5); } 20% { opacity: 1; } 85% { opacity: .8; } 100% { opacity: 0; transform: rotate(40deg) scale(1.1); } }
	@keyframes ring { 0% { opacity: .9; transform: scale(.6); } 100% { opacity: 0; transform: scale(4); border-width: 1px; } }

	/* ── C · clash: orange charges from the left, blue from the right — they meet in a flash ── */
	.half { position: absolute; top: 50%; height: 170px; width: 60%; zoom: var(--uis, 1); transform: translateY(-50%); }
	.half.o { left: 0; background: linear-gradient(90deg, transparent, rgba(239, 125, 34, .9) 60%, #ffb36b);
		clip-path: polygon(0 0, 100% 0, 88% 100%, 0 100%); animation: chargeL 2.3s cubic-bezier(.2, .9, .2, 1) both; }
	.half.b { right: 0; background: linear-gradient(270deg, transparent, rgba(47, 127, 230, .9) 60%, #8cc0ff);
		clip-path: polygon(12% 0, 100% 0, 100% 100%, 0 100%); animation: chargeR 2.3s cubic-bezier(.2, .9, .2, 1) both; }
	.spark { position: absolute; width: 18px; height: 280px; zoom: var(--uis, 1); background: linear-gradient(180deg, transparent, #fff, transparent); transform: rotate(14deg); opacity: 0;
		box-shadow: 0 0 40px 18px rgba(255, 255, 255, .55); animation: spark .7s ease-out .28s both; }
	.clash .big { animation: slam .4s cubic-bezier(.2, 1.4, .3, 1) .3s both, out 2.3s ease both; text-shadow: 0 3px 0 rgba(0,0,0,.6), 0 0 30px rgba(0,0,0,.9), 0 0 60px rgba(0,0,0,.8); }
	.clash .small { animation: fade .3s ease .45s both, out 2.3s ease both; }
	@keyframes chargeL { 0% { transform: translateY(-50%) translateX(-100%); } 14% { transform: translateY(-50%) translateX(-14%); } 18% { transform: translateY(-50%) translateX(-18%); } 85% { transform: translateY(-50%) translateX(-18%); opacity: 1; } 100% { transform: translateY(-50%) translateX(-100%); opacity: 0; } }
	@keyframes chargeR { 0% { transform: translateY(-50%) translateX(100%); } 14% { transform: translateY(-50%) translateX(14%); } 18% { transform: translateY(-50%) translateX(18%); } 85% { transform: translateY(-50%) translateX(18%); opacity: 1; } 100% { transform: translateY(-50%) translateX(100%); opacity: 0; } }
	@keyframes spark { 0% { opacity: 1; transform: rotate(14deg) scaleY(.2); } 30% { opacity: 1; transform: rotate(14deg) scaleY(1.2); } 100% { opacity: 0; transform: rotate(14deg) scaleY(1.4) scaleX(6); } }

	@keyframes race { to { background-position: 0 0, -380px 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }

	/* phones: everything a size down */
	.mob .big { font-size: 2.6rem; } .mob.round .big { font-size: 3rem; } .mob .small { font-size: .7rem; letter-spacing: .3em; }
	.mob.blade .band { height: 110px; zoom: 1; } .mob .half { height: 120px; zoom: 1; } .mob .crestw { zoom: .7; } .mob .txt.below { margin-top: 180px; }
	.mob .txt.below .big { font-size: 1.8rem; }
</style>
