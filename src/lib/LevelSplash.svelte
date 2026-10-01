<script lang="ts">
	// The level-up step opens: a short, quiet splash for YOU — LEVEL UP (you can afford a
	// level) or PITY COIN (you can't; +1 coin when the round ends). Never blocks the board.
	// Two looks (demo switch): 'pips' — your level track, the next pip lights up / a coin
	// flips down onto the rule; 'rise' — the next level's numeral rises out of a shaft of light /
	// a coin falls through it and rings.
	import { onDestroy } from 'svelte';

	export let mobile = false;
	export let look: 'pips' | 'rise' = 'pips';

	const DUR = 2600;
	const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
	type Shown = { kind: 'up' | 'pity'; level: number; cost: number; key: number };
	let shown: Shown | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	/** `level` = your level now (1–7); a level-up costs `level` coins */
	export function play(kind: 'up' | 'pity', level = 1) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { kind, level: Math.max(1, Math.min(7, level)), cost: level, key: Date.now() };
			timer = setTimeout(() => (shown = null), DUR);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	const pips = Array.from({ length: 8 }, (_, i) => i + 1);
</script>

{#if shown}
	{#key shown.key}
		<div class="ls {look}" class:mob={mobile} aria-live="polite">
			<div class="col">
				{#if look === 'pips'}
					<div class="emb">
						{#if shown.kind === 'up'}
							<div class="track">
								{#each pips as p (p)}
									<i class:on={p <= shown.level} class:next={p === shown.level + 1} class:ult={p === 8}></i>
								{/each}
							</div>
						{:else}
							<span class="coin flipdrop"><b>1</b></span>
						{/if}
					</div>
				{:else}
					<div class="emb shaft">
						<span class="beam"></span>
						{#each [0, 1, 2, 3, 4, 5] as m (m)}<span class="mote" style="--m:{m}"></span>{/each}
						{#if shown.kind === 'up'}
							<span class="num">{ROMAN[shown.level + 1]}</span>
						{:else}
							<span class="coin fall"><b>1</b></span>
							<span class="ring"></span>
						{/if}
					</div>
				{/if}
				<div class="title">
					<span class="rule l"></span>
					<span class="ttl">{shown.kind === 'up' ? 'Level up' : 'Pity coin'}</span>
					<span class="rule r"></span>
				</div>
				<span class="sub">
					{#if shown.kind === 'up'}Level {shown.level} → {shown.level + 1} · {shown.cost} {shown.cost === 1 ? 'coin' : 'coins'}{:else}+1 coin when the round ends{/if}
				</span>
			</div>
		</div>
	{/key}
{/if}

<style>
	.ls { position: fixed; inset: 0; z-index: 62; pointer-events: none; display: grid; place-items: center; }
	/* a soft dark pool behind it, so it reads over a busy board */
	.ls::before { content: ''; position: absolute; left: 50%; top: 50%; width: min(760px, 120vw); height: 380px; transform: translate(-50%, -50%);
		background: radial-gradient(closest-side, rgba(5, 7, 12, .8), rgba(5, 7, 12, .45) 55%, transparent); animation: out 2.6s ease both; }
	.col { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; zoom: var(--uis, 1); animation: out 2.6s ease both; }
	.emb { position: relative; height: 96px; display: grid; place-items: center; }

	/* title between two gold rules that draw outwards (same language as the victory card) */
	.title { display: flex; align-items: center; gap: 18px; }
	.rule { width: 110px; height: 2px; animation: draw .7s cubic-bezier(.2, .7, .2, 1) .15s both; }
	.rule.l { background: linear-gradient(270deg, #f3cd72, transparent); transform-origin: right; }
	.rule.r { background: linear-gradient(90deg, #f3cd72, transparent); transform-origin: left; }
	.ttl { font-size: 3.2rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .65)) drop-shadow(0 0 16px rgba(0, 0, 0, .8)); animation: track .8s cubic-bezier(.2, .7, .2, 1) .1s both; }
	.sub { font-size: .95rem; letter-spacing: .16em; text-transform: uppercase; color: #f0dcae; text-shadow: 0 2px 6px #000; animation: fade .4s ease .55s both; }

	/* the coin: gold, raised rim, a stamped 1 */
	.coin { position: relative; width: 62px; height: 62px; border-radius: 50%; display: grid; place-items: center;
		background: radial-gradient(circle at 36% 30%, #fff1c4, #e2b04f 52%, #8a5d17);
		box-shadow: inset 0 0 0 4px #c8923a, inset 0 0 0 6px #fbe0a0, 0 0 26px rgba(255, 200, 100, .5), 0 8px 16px rgba(0, 0, 0, .6); }
	.coin b { font-size: 1.9rem; font-weight: normal; color: #5a3a0c; text-shadow: 0 1px 0 #fff3c8; }

	/* ── look: pips ── your level track; the next pip fills */
	.track { display: flex; gap: 10px; align-items: center; }
	.track i { width: 18px; height: 18px; transform: rotate(45deg); border: 2px solid rgba(243, 205, 114, .55); background: rgba(0, 0, 0, .4);
		animation: fadein .3s ease both; }
	.track i.on { background: linear-gradient(135deg, #fff1c4, #e2b04f 55%, #8a5d17); border-color: #fbe0a0; }
	.track i.ult { width: 22px; height: 22px; border-color: rgba(190, 150, 255, .6); }
	.track i.next { animation: fill 2s ease .35s both; }
	@keyframes fill {
		0% { background: rgba(0, 0, 0, .4); }
		20% { background: #fff8e0; transform: rotate(45deg) scale(1.9); box-shadow: 0 0 30px 8px rgba(255, 215, 130, .8); border-color: #fff; }
		40%, 100% { background: linear-gradient(135deg, #fff1c4, #e2b04f 55%, #8a5d17); transform: rotate(45deg) scale(1.25); box-shadow: 0 0 16px 3px rgba(255, 200, 100, .6); border-color: #fbe0a0; }
	}
	/* the pity coin flips down and lands */
	.flipdrop { animation: drop .75s cubic-bezier(.3, 0, .4, 1) both, flip .25s linear 3 both; }
	@keyframes drop { 0% { opacity: 0; transform: translateY(-90px); } 15% { opacity: 1; } 75% { transform: translateY(6px); } 100% { transform: none; } }
	@keyframes flip { 0%, 100% { scale: 1 1; } 50% { scale: .08 1; } }

	/* ── look: rise ── a shaft of light; the numeral rises / the coin falls and rings */
	.shaft { height: 130px; width: 160px; }
	.beam { position: absolute; left: 50%; bottom: 0; width: 90px; height: 170px; translate: -50% 0; transform-origin: bottom;
		background: linear-gradient(0deg, rgba(255, 214, 130, .55), rgba(255, 214, 130, .12) 60%, transparent);
		mask: linear-gradient(90deg, transparent, #000 35%, #000 65%, transparent); -webkit-mask: linear-gradient(90deg, transparent, #000 35%, #000 65%, transparent);
		animation: beam 2.2s ease both; }
	@keyframes beam { 0% { opacity: 0; transform: scaleY(0); } 25% { opacity: 1; transform: scaleY(1); } 70% { opacity: .8; } 100% { opacity: 0; } }
	.mote { position: absolute; bottom: 10px; left: calc(50% - 30px + var(--m) * 12px); width: 4px; height: 4px; border-radius: 50%;
		background: #ffe9b0; box-shadow: 0 0 6px #ffd27a; opacity: 0; animation: mote 1.4s ease-out calc(.2s + var(--m) * .17s) both; }
	@keyframes mote { 0% { opacity: 0; transform: none; } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-120px); } }
	.num { position: relative; font-size: 5.2rem; line-height: 1;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .7)) drop-shadow(0 0 20px rgba(255, 200, 100, .45)); animation: rise .9s cubic-bezier(.2, .7, .2, 1) .15s both; }
	@keyframes rise { from { opacity: 0; transform: translateY(46px) scale(.8); } to { opacity: 1; transform: none; } }
	.fall { animation: fall .6s cubic-bezier(.5, 0, .9, .6) .1s both, flip .2s linear .1s 3 both; }
	@keyframes fall { 0% { opacity: 0; transform: translateY(-110px); } 20% { opacity: 1; } 85% { transform: translateY(4px); } 100% { transform: none; } }
	.ring { position: absolute; left: 50%; top: 50%; width: 62px; height: 62px; margin: -31px 0 0 -31px; border-radius: 50%; border: 2px solid #ffe3a0;
		opacity: 0; animation: ring .8s ease-out .65s both; }
	@keyframes ring { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }

	@keyframes draw { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
	@keyframes track { from { opacity: 0; letter-spacing: .4em; filter: blur(6px); } to { opacity: 1; letter-spacing: .08em; } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
	.mob .col { zoom: .7; }
	.mob .rule { width: 50px; }
	.mob .sub { font-size: .8rem; letter-spacing: .06em; }
</style>
