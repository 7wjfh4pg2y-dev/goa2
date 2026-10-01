<script lang="ts">
	// New turn / new round splash. Never blocks the board. Looks (being chosen):
	//  · 'slots'  — the round's four turn cards I–IV drop in; done turns are stamped, this
	//               turn's card flips face-up and slams; a new round sweeps them all clean
	//  · 'dial'   — a war clock of four quarters: a gold sword-hand swings to this turn's
	//               quarter, which lights up; a new round spins it a full circle
	//  · 'banner' — a purple war banner unrolls from the top, sways, and rolls back up
	//  · 'crest'  — the gold-trimmed crest drops and slams with rays + a shockwave
	import { onDestroy } from 'svelte';

	export let mobile = false;
	export let variant: 'slots' | 'dial' | 'banner' | 'crest' = 'crest';

	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
	const DUR = 2400;
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
	$: t = shown?.turn ?? 1;
	$: isRound = shown?.kind === 'round';
	$: label = isRound ? `Round ${shown?.round}` : `Turn ${ROMAN[t] ?? t}`;
	$: sub = isRound ? 'A new round begins' : `Round ${shown?.round}`;
</script>

{#if shown}
	{#key shown.key}
		<div class="ts v-{variant}" class:mob={mobile} class:round={isRound} aria-live="polite">
			{#if variant === 'slots'}
				<div class="row">
					{#each [1, 2, 3, 4] as n (n)}
						<div class="slot" class:done={!isRound && n < t} class:now={!isRound && n === t} class:wipe={isRound} style="--i:{n}">
							<div class="face back"><span class="sym">✦</span></div>
							<div class="face front"><span class="rn">{ROMAN[n]}</span></div>
							{#if !isRound && n < t}<span class="stamp">✓</span>{/if}
						</div>
					{/each}
				</div>
				<div class="txt slotstxt"><span class="big">{label}</span><span class="small">{sub}</span></div>
			{:else if variant === 'dial'}
				<div class="dialw" style="--from:{isRound ? -315 : (t - 2) * 90 + 45}deg; --to:{isRound ? 45 : (t - 1) * 90 + 45}deg; --done:{isRound ? 0 : (t - 1) * 90}deg; --at:{isRound ? 0 : (t - 1) * 90}deg">
					<div class="dial">
						<div class="past"></div>
						<div class="lit"></div>
						{#each [1, 2, 3, 4] as n (n)}<span class="q" class:on={!isRound && n === t} style="--a:{(n - 1) * 90 + 45}deg">{ROMAN[n]}</span>{/each}
						<div class="hand"><svg viewBox="0 0 20 120" aria-hidden="true"><path d="M10 0 L16 18 L12 22 L12 92 L18 96 L18 102 L12 102 L12 112 L8 112 L8 102 L2 102 L2 96 L8 92 L8 22 L4 18 Z" fill="#ffe3a0" stroke="#6b4a10" stroke-width="1.5" /></svg></div>
						<div class="hub"></div>
					</div>
					<div class="flare"></div>
				</div>
				<div class="txt dialtxt"><span class="big">{label}</span><span class="small">{sub}</span></div>
			{:else if variant === 'banner'}
				<div class="bannerw">
					<div class="rod"></div>
					<div class="cloth">
						<svg class="emb" viewBox="0 0 100 110" aria-hidden="true"><path d="M50 4 L92 18 V52 C92 80 72 98 50 106 C28 98 8 80 8 52 V18 Z" fill="none" stroke="#ffd27a" stroke-width="7" stroke-linejoin="round" /></svg>
						<span class="bk">{isRound ? 'Round' : 'Turn'}</span>
						<span class="bn">{isRound ? shown.round : ROMAN[t] ?? t}</span>
						<span class="bs">{sub}</span>
					</div>
				</div>
			{:else}
				<div class="rays"></div>
				<div class="ring"></div>
				<div class="crestw">
					<svg viewBox="0 0 100 110" class="crest" aria-hidden="true">
						<defs><linearGradient id="ts-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9b0" /><stop offset=".5" stop-color="#d9a845" /><stop offset="1" stop-color="#8a5d17" /></linearGradient></defs>
						<path d="M50 4 L92 18 V52 C92 80 72 98 50 106 C28 98 8 80 8 52 V18 Z" fill="#0b1220" stroke="url(#ts-g)" stroke-width="6" stroke-linejoin="round" />
						<path d="M50 14 L83 25 V52 C83 74 67 89 50 96 C33 89 17 74 17 52 V25 Z" fill="none" stroke="url(#ts-g)" stroke-width="1.5" opacity=".6" />
					</svg>
					<span class="num">{isRound ? shown.round : ROMAN[t] ?? t}</span>
				</div>
				<div class="txt crtxt"><span class="big">{isRound ? 'Round' : 'Turn'}</span><span class="small">{sub}</span></div>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.ts { position: fixed; inset: 0; z-index: 58; pointer-events: none; overflow: hidden; display: grid; place-items: center; }
	.txt { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1);
		color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .55), 0 0 26px rgba(0, 0, 0, .9); }
	.big { font-size: 3.4rem; line-height: 1; letter-spacing: .04em; animation: fade .3s ease .45s both, out 2.4s ease both; }
	.round .big { color: #ffe3a0; }
	.small { font-size: 1rem; letter-spacing: .4em; text-transform: uppercase; color: #e3cf9c; animation: fade .3s ease .6s both, out 2.4s ease both; }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }

	/* ── SLOTS: the four turn cards (flat flips: squash to an edge, swap the face, open up) ── */
	.row { display: flex; gap: 22px; zoom: var(--uis, 1); margin-top: -70px; animation: out 2.4s ease both; }
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
	.slotstxt { margin-top: 250px; }
	.slotstxt .big { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .7s both, out 2.4s ease both; }

	/* ── DIAL: a four-quarter war clock ── */
	.dialw { position: relative; width: 250px; height: 250px; zoom: var(--uis, 1); margin-top: -60px; animation: dialIn .5s cubic-bezier(.3, 1.4, .5, 1) both, out 2.4s ease both; }
	@keyframes dialIn { from { opacity: 0; scale: .4; rotate: -40deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
	.dial { position: absolute; inset: 0; border-radius: 50%; background: radial-gradient(circle, #1a1430 0%, #0b0818 70%);
		border: 6px solid #d9a845; box-shadow: 0 0 0 2px #6b4a10, 0 14px 40px rgba(0, 0, 0, .75), inset 0 0 30px rgba(0, 0, 0, .8); overflow: hidden; }
	.dial::before { content: ''; position: absolute; inset: 0; background: conic-gradient(from 0deg, transparent 0 89.4deg, rgba(217, 168, 69, .55) 89.4deg 90.6deg, transparent 90.6deg 179.4deg, rgba(217, 168, 69, .55) 179.4deg 180.6deg, transparent 180.6deg 269.4deg, rgba(217, 168, 69, .55) 269.4deg 270.6deg, transparent 270.6deg 359.4deg, rgba(217, 168, 69, .55) 359.4deg); }
	.past { position: absolute; inset: 0; background: conic-gradient(from 0deg, rgba(217, 168, 69, .18) 0 var(--done), transparent var(--done)); }
	.lit { position: absolute; inset: 0; background: conic-gradient(from var(--at), rgba(255, 214, 130, .75) 0 90deg, transparent 90deg); opacity: 0; animation: lit .5s ease .8s both; }
	.round .lit { display: none; }
	@keyframes lit { from { opacity: 0; } 50% { opacity: 1; filter: brightness(1.6); } to { opacity: 1; } }
	.q { position: absolute; left: 50%; top: 50%; font-size: 1.5rem; color: rgba(246, 234, 210, .5); transform: translate(-50%, -50%) rotate(var(--a)) translateY(-78px) rotate(calc(-1 * var(--a))); }
	.q.on { color: #2a1a04; animation: qOn .4s ease .85s both; }
	@keyframes qOn { from { color: rgba(246, 234, 210, .5); } to { color: #2a1a04; } }
	.hand { position: absolute; left: 50%; top: 50%; width: 20px; height: 120px; margin-left: -10px; margin-top: -100px; transform-origin: 10px 100px;
		filter: drop-shadow(0 3px 4px rgba(0, 0, 0, .7)); animation: swing .75s cubic-bezier(.3, 1.5, .5, 1) .25s both; }
	.hand svg { width: 100%; height: 100%; display: block; }
	@keyframes swing { from { transform: rotate(var(--from)); } to { transform: rotate(var(--to)); } }
	.round .hand { animation: spin 1s cubic-bezier(.2, .8, .3, 1) .2s both; }
	@keyframes spin { from { transform: rotate(-315deg); } to { transform: rotate(405deg); } }
	.hub { position: absolute; left: 50%; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff3c4, #d9a845 55%, #6b4a10); box-shadow: 0 2px 6px rgba(0, 0, 0, .7); }
	.flare { position: absolute; inset: -30px; border-radius: 50%; border: 4px solid rgba(255, 220, 150, .9); opacity: 0; animation: flare .8s ease-out .85s both; }
	.round .flare { animation-delay: 1.1s; }
	@keyframes flare { 0% { opacity: .9; scale: .8; } 100% { opacity: 0; scale: 1.8; } }
	.dialtxt { margin-top: 330px; }
	.dialtxt .big { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .85s both, out 2.4s ease both; }

	/* ── BANNER: a war banner unrolls from the top ── */
	.bannerw { position: absolute; top: 0; left: 50%; width: 230px; margin-left: -115px; zoom: var(--uis, 1); transform-origin: 50% 0; animation: sway 2.4s ease-in-out both; }
	.round .bannerw { width: 270px; margin-left: -135px; }
	@keyframes sway { 0%, 25% { rotate: 0deg; } 40% { rotate: 2.2deg; } 55% { rotate: -1.6deg; } 70% { rotate: .8deg; } 82%, 100% { rotate: 0deg; } }
	.rod { position: relative; z-index: 2; height: 16px; margin: 0 -18px; border-radius: 8px; background: linear-gradient(180deg, #ffe9b0, #c9933a 50%, #6b4a10); box-shadow: 0 4px 10px rgba(0, 0, 0, .6); }
	.cloth { height: 470px; margin-top: -4px; display: flex; flex-direction: column; align-items: center; padding-top: 52px; gap: 4px; transform-origin: 50% 0;
		background: linear-gradient(90deg, rgba(0, 0, 0, .35), transparent 18%, transparent 82%, rgba(0, 0, 0, .35)), linear-gradient(180deg, #8f4fb0, #5e2c7c 55%, #3b1f52);
		border-left: 5px solid #d9a845; border-right: 5px solid #d9a845; box-shadow: 0 18px 40px rgba(0, 0, 0, .6);
		clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%); animation: unroll 2.4s cubic-bezier(.3, 1.15, .4, 1) both; }
	.round .cloth { height: 520px; }
	@keyframes unroll { 0% { transform: scaleY(0); } 26% { transform: scaleY(1.04); } 32%, 80% { transform: scaleY(1); } 100% { transform: scaleY(0); } }
	.emb { width: 70px; height: 77px; filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .5)); }
	.bk { font-size: 1.4rem; letter-spacing: .35em; text-transform: uppercase; color: #ffe3a0; margin-top: 6px; text-shadow: 0 2px 0 rgba(0, 0, 0, .5); }
	.bn { font-size: 6.4rem; line-height: 1; color: #fff3d6; text-shadow: 0 4px 0 #2a1238, 0 0 26px rgba(255, 210, 120, .6); animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .55s both; }
	.round .bn { font-size: 7.4rem; }
	.bs { font-size: .8rem; letter-spacing: .3em; text-transform: uppercase; color: #e9d5ff; }

	/* ── CREST ── */
	.crestw { position: relative; width: 220px; height: 242px; zoom: var(--uis, 1); display: grid; place-items: center; animation: drop .5s cubic-bezier(.3, 1.5, .5, 1) both, out 2.4s ease both; }
	.round .crestw { width: 250px; height: 275px; }
	.crest { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 10px 24px rgba(0, 0, 0, .75)) drop-shadow(0 0 22px rgba(217, 168, 69, .5)); }
	.num { position: relative; font-size: 5.4rem; color: #ffe3a0; text-shadow: 0 4px 0 rgba(0, 0, 0, .6); margin-top: -10px; }
	.round .num { font-size: 6.2rem; }
	.rays { position: absolute; width: 1200px; height: 1200px; zoom: var(--uis, 1); border-radius: 50%; opacity: 0;
		background: repeating-conic-gradient(from 0deg, rgba(255, 220, 140, .16) 0 6deg, transparent 6deg 18deg);
		mask-image: radial-gradient(circle, #000 10%, transparent 62%); -webkit-mask-image: radial-gradient(circle, #000 10%, transparent 62%);
		animation: rays 2.4s ease-out .25s both; }
	.ring { position: absolute; width: 230px; height: 230px; zoom: var(--uis, 1); border-radius: 50%; border: 5px solid rgba(255, 220, 150, .85); opacity: 0; animation: ring .8s ease-out .38s both; }
	.crtxt { margin-top: 360px; }
	.round .crtxt { margin-top: 400px; }
	@keyframes drop { 0% { transform: translateY(-120vh) scale(1.4); } 70% { transform: translateY(0) scale(1); } 85% { transform: scale(1.06, .94); } 100% { transform: none; } }
	@keyframes rays { 0% { opacity: 0; transform: rotate(0) scale(.5); } 20% { opacity: 1; } 85% { opacity: .8; } 100% { opacity: 0; transform: rotate(40deg) scale(1.1); } }
	@keyframes ring { 0% { opacity: .9; transform: scale(.6); } 100% { opacity: 0; transform: scale(4); border-width: 1px; } }

	/* phones */
	.mob .crestw, .mob .ring, .mob .rays, .mob .txt, .mob .row, .mob .dialw, .mob .bannerw { zoom: .62; }
</style>
