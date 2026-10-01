<script lang="ts">
	// New turn / new round splash — the round's four turn cards I–IV drop in; turns already
	// played sit face-up, dimmed and stamped ✓; this turn's card flips face-up, slams bigger
	// and glows. A new round flips all four back over in a sweep. Never blocks the board.
	import { onDestroy } from 'svelte';

	export let mobile = false;

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
	const DUR = 2400, ROUND_DUR = 3000; // a new round also turns card I face-up after the sweep
	let shown: { kind: 'turn' | 'round'; round: number; turn: number; key: number } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** Show the splash: a new round shows "Round N", a new turn "Turn N". */
	export function play(kind: 'turn' | 'round', round: number, turn: number) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { kind, round, turn, key: Date.now() };
			timer = setTimeout(() => (shown = null), kind === 'round' ? ROUND_DUR : DUR);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	$: t = shown?.turn ?? 1;
	$: isRound = shown?.kind === 'round';
	$: label = isRound ? `Round ${shown?.round}` : `Turn ${ROMAN[t] ?? t}`;
	$: sub = isRound ? 'A new round begins' : `Round ${shown?.round}`;
</script>

{#if shown}
	{#key shown.key}
		<div class="ts" class:mob={mobile} class:round={isRound} aria-live="polite">
				<div class="row">
					{#each [1, 2, 3, 4] as n (n)}
						<div class="slot" class:done={!isRound && n < t} class:now={!isRound && n === t} class:wipe={isRound && n > 1} class:first={isRound && n === 1} style="--i:{n}">
							<div class="face back"><span class="sym">✦</span></div>
							<div class="face front"><span class="rn">{ROMAN[n]}</span></div>
							{#if !isRound && n < t}<span class="stamp">✓</span>{/if}
						</div>
					{/each}
				</div>
				<div class="txt slotstxt"><span class="big">{label}</span><span class="small">{sub}</span></div>
		</div>
	{/key}
{/if}

<style>
	.ts.round { --D: 3s; }
	.ts { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; display: grid; place-items: center; }
	.txt { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .55), 0 0 26px rgba(0, 0, 0, .9); }
	.big { font-size: 3.4rem; line-height: 1; letter-spacing: .04em; animation: fade .3s ease .45s both, out var(--D, 2.4s) ease both; }
	.round .big { color: #ffe3a0; }
	.small { font-size: 1rem; letter-spacing: .4em; text-transform: uppercase; color: #e3cf9c; animation: fade .3s ease .6s both, out var(--D, 2.4s) ease both; }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }

	/* ── SLOTS: the four turn cards (flat flips: squash to an edge, swap the face, open up) ── */
	.row { display: flex; gap: 22px; zoom: var(--uis, 1); margin-top: -70px; animation: out var(--D, 2.4s) ease both; }
	.slot { position: relative; width: 108px; height: 150px; animation: slotIn .45s cubic-bezier(.3, 1.4, .5, 1) calc(var(--i) * 60ms) both; }
	@keyframes slotIn { from { opacity: 0; translate: 0 -120px; rotate: -8deg; } to { opacity: 1; translate: 0 0; rotate: 0deg; } }
	.face { position: absolute; inset: 0; border-radius: 12px; display: grid; place-items: center; box-shadow: 0 10px 26px rgba(0, 0, 0, .65); }
	.back { background: radial-gradient(circle at 50% 40%, #2a1d44, #120c22); border: 2px solid rgba(217, 168, 69, .55); }
	.back .sym { color: rgba(217, 168, 69, .5); font-size: 2rem; }
	.front { background: linear-gradient(170deg, #fff1cf, #e9c27a 55%, #b9832f); border: 3px solid #ffe3a0; opacity: 0; }
	.front .rn { font-size: 3.4rem; color: #3b2508; text-shadow: 0 2px 0 rgba(255, 255, 255, .4); }
	/* done turns sit face-up but dimmed and stamped */
	.slot.done .front { opacity: 1; }
	.slot.done .face { filter: brightness(.55) saturate(.6); }
	.stamp { position: absolute; right: -10px; top: -10px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 1.1rem;
		background: #16a34a; color: #fff; border: 2px solid #c7f9d4; animation: pop .3s ease calc(.35s + var(--i) * 60ms) both; }
	@keyframes pop { from { scale: 0; } 70% { scale: 1.3; } to { scale: 1; } }
	/* this turn: flips face-up, slams bigger, glows */
	.slot.now { z-index: 2; animation: slotIn .45s cubic-bezier(.3, 1.4, .5, 1) calc(var(--i) * 60ms) both, flipNow .6s ease .55s both; }
	@keyframes flipNow { 0% { transform: scale(1, 1); } 45% { transform: scale(0, 1.12); } 80% { transform: scale(1.32, 1.32); } 100% { transform: scale(1.22, 1.22); } }
	.slot.now .front { animation: faceIn .6s .55s both; box-shadow: 0 0 0 3px #fff3, 0 0 40px 10px rgba(255, 210, 120, .7), 0 10px 26px rgba(0, 0, 0, .65); }
	@keyframes faceIn { 0%, 44% { opacity: 0; } 45%, 100% { opacity: 1; } }
	/* new round: all four flip back to their backs in a sweep */
	.slot.wipe { animation: slotIn .45s cubic-bezier(.3, 1.4, .5, 1) calc(var(--i) * 60ms) both, wipe .5s ease calc(.45s + var(--i) * 90ms) both; }
	@keyframes wipe { 0% { transform: scaleX(1); } 50% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
	.slot.wipe .front { animation: faceOut .5s calc(.45s + var(--i) * 90ms) both; }
	@keyframes faceOut { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
	/* …then card I flips face-up again: the new round's first turn (one timeline: sweep → pause → reveal) */
	.slot.first { z-index: 2; animation: slotIn .45s cubic-bezier(.3, 1.4, .5, 1) calc(var(--i) * 60ms) both, firstFlip 1.9s ease .54s both; }
	@keyframes firstFlip {
		0% { transform: scale(1, 1); } 13% { transform: scale(0, 1); } 26% { transform: scale(1, 1); }
		62% { transform: scale(1, 1); } 72% { transform: scale(0, 1.12); } 86% { transform: scale(1.32, 1.32); } 100% { transform: scale(1.22, 1.22); }
	}
	.slot.first .front { animation: firstFace 1.9s .54s both; box-shadow: 0 0 0 3px #fff3, 0 0 40px 10px rgba(255, 210, 120, .7), 0 10px 26px rgba(0, 0, 0, .65); }
	@keyframes firstFace { 0%, 12.9% { opacity: 1; } 13%, 71.9% { opacity: 0; } 72%, 100% { opacity: 1; } }
	.slotstxt { margin-top: 250px; }
	.slotstxt .big { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .7s both, out var(--D, 2.4s) ease both; }

	/* phones */
	.mob .txt, .mob .row { zoom: .62; }
</style>
