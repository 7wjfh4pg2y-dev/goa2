<script lang="ts">
	// The level-up step opens: a short, quiet splash for YOU — LEVEL UP (you can afford at
	// least one level; you may take several) or PITY COIN (you can't; +1 coin when the round
	// ends). A shaft of light: your three upgrade paths (red, blue, green gems) kindle in it —
	// and when your coins reach all the way to level 8, they fuse into one purple ultimate
	// gem — or a coin falls through it and rings. Never blocks the board.
	import { onDestroy } from 'svelte';

	export let mobile = false;

	type Shown = { kind: 'up' | 'pity'; coins: number; ult: boolean; key: number };
	let shown: Shown | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: dur = shown?.ult ? 3600 : 2600;
	/** `coins` = what you hold as the step opens; `ult` = they reach all the way to level 8 */
	/** returns how long it plays (ms) */
	export function play(kind: 'up' | 'pity', coins = 0, ult = false): number {
		const ms = kind === 'up' && ult ? 3600 : 2600;
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { kind, coins, ult: kind === 'up' && ult, key: Date.now() };
			timer = setTimeout(() => (shown = null), ms);
		});
		return ms;
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

{#if shown}
	{#key shown.key}
		<div class="ls" class:mob={mobile} class:ultm={shown.ult} style="--D:{dur}ms" aria-live="polite">
			<div class="col">
				<div class="emb">
					<span class="beam"></span>
					{#each [0, 1, 2, 3, 4, 5] as m (m)}<span class="mote" style="--m:{m}"></span>{/each}
					{#if shown.kind === 'pity'}
						<span class="coin fall"><b>1</b></span>
						<span class="ring"></span>
					{:else}
						<span class="gems" class:merge={shown.ult}>{#each ['#d8443a', '#3b7fe0', '#3fae5a'] as g, i (g)}<i style="--g:{g};--i:{i};--dx:{56 * (1 - i)}px"></i>{/each}</span>
						{#if shown.ult}
							<span class="flash"></span>
							<span class="ring ultring"></span>
							<span class="ultgem"></span>
						{/if}
					{/if}
				</div>
				<div class="title">
					<span class="rule l"></span>
					<span class="ttl">{shown.kind === 'up' ? 'Level up' : 'Pity coin'}</span>
					<span class="rule r"></span>
				</div>
				<span class="sub">
					{#if shown.kind === 'up'}{shown.coins} {shown.coins === 1 ? 'coin' : 'coins'}{:else}+1 coin at round end{/if}
				</span>
			</div>
		</div>
	{/key}
{/if}

<style>
	.ls { position: fixed; inset: 0; z-index: 62; pointer-events: none; display: grid; place-items: center; }
	/* a soft dark pool behind it, so it reads over a busy board */
	.ls::before { content: ''; position: absolute; left: 50%; top: 50%; width: min(760px, 120vw); height: 380px; transform: translate(-50%, -50%);
		background: radial-gradient(closest-side, rgba(5, 7, 12, .8), rgba(5, 7, 12, .45) 55%, transparent); animation: out var(--D, 2.6s) ease both; }
	.col { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; zoom: var(--uis, 1); animation: out var(--D, 2.6s) ease both; }
	.emb { position: relative; height: 130px; width: 160px; display: grid; place-items: center; }

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

	/* the shaft of light */
	.beam { position: absolute; left: 50%; bottom: 0; width: 90px; height: 170px; translate: -50% 0; transform-origin: bottom;
		background: linear-gradient(0deg, rgba(255, 214, 130, .55), rgba(255, 214, 130, .12) 60%, transparent);
		mask: linear-gradient(90deg, transparent, #000 35%, #000 65%, transparent); -webkit-mask: linear-gradient(90deg, transparent, #000 35%, #000 65%, transparent);
		animation: beam 2.2s ease both; }
	@keyframes beam { 0% { opacity: 0; transform: scaleY(0); } 25% { opacity: 1; transform: scaleY(1); } 70% { opacity: .8; } 100% { opacity: 0; } }
	.mote { position: absolute; bottom: 10px; left: calc(50% - 30px + var(--m) * 12px); width: 4px; height: 4px; border-radius: 50%;
		background: #ffe9b0; box-shadow: 0 0 6px #ffd27a; opacity: 0; animation: mote 1.4s ease-out calc(.2s + var(--m) * .17s) both; }
	@keyframes mote { 0% { opacity: 0; transform: none; } 20% { opacity: 1; } 100% { opacity: 0; transform: translateY(-120px); } }
	@keyframes flip { 0%, 100% { scale: 1 1; } 50% { scale: .08 1; } }
	/* level up: your three upgrade paths — red, blue, green gems — kindle in turn */
	.gems { position: relative; display: flex; gap: 22px; align-items: center; }
	.gems i { width: 30px; height: 30px; transform: rotate(45deg); border: 2px solid #fbe0a0; background: radial-gradient(circle at 35% 30%, #fff8, var(--g) 55%, #000a);
		box-shadow: 0 0 0 2px rgba(0, 0, 0, .5), 0 0 22px var(--g); animation: kindle .6s cubic-bezier(.2, 1.5, .4, 1) calc(.2s + var(--i) * .18s) both; }
	.gems i:nth-child(2) { width: 38px; height: 38px; translate: 0 -10px; }
	/* ultimate in reach: the three slide together and fuse — a flash, a purple shockwave, one big purple gem */
	.gems.merge i { animation: kindle .6s cubic-bezier(.2, 1.5, .4, 1) calc(.2s + var(--i) * .18s) both, merge .45s cubic-bezier(.6, 0, .9, .4) 1.05s forwards; }
	@keyframes merge { from { translate: 0 0; opacity: 1; filter: none; } to { translate: var(--dx) 0; opacity: 0; filter: brightness(2.6); } }
	.gems.merge i:nth-child(2) { animation-name: kindle, merge2; }
	@keyframes merge2 { from { translate: 0 -10px; opacity: 1; filter: none; } to { translate: 0 0; opacity: 0; filter: brightness(2.6); } }
	.flash { position: absolute; left: 50%; top: 50%; width: 180px; height: 180px; margin: -90px 0 0 -90px; border-radius: 50%; opacity: 0;
		background: radial-gradient(closest-side, #fff, rgba(225, 190, 255, .8) 35%, transparent); animation: flash .7s ease-out 1.42s forwards; }
	@keyframes flash { 0% { opacity: 1; transform: scale(.3); } 100% { opacity: 0; transform: scale(1.6); } }
	.ultring { border-color: #d6a8ff; box-shadow: 0 0 14px #a45cf0; animation: ring .9s ease-out 1.45s forwards; }
	.ultgem { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; transform: rotate(45deg); opacity: 0;
		border: 3px solid #fbe0a0; background: radial-gradient(circle at 32% 28%, #fff, #e7c8ff 14%, #a45cf0 45%, #5b1f9e 80%, #2a0b4d);
		box-shadow: 0 0 0 2px rgba(0, 0, 0, .55), inset 0 0 12px rgba(255, 255, 255, .35), 0 0 30px 6px rgba(164, 92, 240, .75), 0 0 70px rgba(164, 92, 240, .5);
		animation: forge .6s cubic-bezier(.2, 1.6, .4, 1) 1.45s forwards, pulse 1.1s ease-in-out 2.1s infinite; }
	@keyframes forge { from { opacity: 0; transform: rotate(-135deg) scale(.2); filter: brightness(3); } to { opacity: 1; transform: rotate(45deg) scale(1); filter: none; } }
	@keyframes pulse { 0%, 100% { opacity: 1; transform: rotate(45deg) scale(1); } 50% { opacity: 1; transform: rotate(45deg) scale(1.08); filter: brightness(1.25); } }
	/* the light turns violet as they fuse */
	.ultm .beam { animation: beam 3.2s ease both, violet .5s ease 1.4s forwards; }
	@keyframes violet { to { background: linear-gradient(0deg, rgba(190, 130, 255, .6), rgba(190, 130, 255, .14) 60%, transparent); } }
	.ultm .mote { background: #ecd6ff; box-shadow: 0 0 6px #b77cff; }
	@keyframes kindle { from { opacity: 0; transform: rotate(45deg) scale(.2); filter: brightness(3); } to { opacity: 1; transform: rotate(45deg) scale(1); filter: none; } }
	.fall { animation: fall .6s cubic-bezier(.5, 0, .9, .6) .1s both, flip .2s linear .1s 3 both; }
	@keyframes fall { 0% { opacity: 0; transform: translateY(-110px); } 20% { opacity: 1; } 85% { transform: translateY(4px); } 100% { transform: none; } }
	.ring { position: absolute; left: 50%; top: 50%; width: 62px; height: 62px; margin: -31px 0 0 -31px; border-radius: 50%; border: 2px solid #ffe3a0;
		opacity: 0; animation: ring .8s ease-out .65s forwards; }
	@keyframes ring { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(2.6); } }

	@keyframes draw { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
	@keyframes track { from { opacity: 0; letter-spacing: .4em; filter: blur(6px); } to { opacity: 1; letter-spacing: .08em; } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.mob .col { zoom: .7; }
	.mob .rule { width: 50px; }
	.mob .sub { font-size: .8rem; letter-spacing: .06em; }
</style>
