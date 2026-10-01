<script lang="ts">
	// The level-up step opens: a short, simple splash for YOU — LEVEL UP (you can afford a
	// level) or PITY COIN (you can't; +1 coin when the round ends). Never blocks the board.
	import { onDestroy } from 'svelte';

	export let mobile = false;

	const DUR = 2200;
	let shown: { kind: 'up' | 'pity'; key: number } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	export function play(kind: 'up' | 'pity') {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { kind, key: Date.now() };
			timer = setTimeout(() => (shown = null), DUR);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
</script>

{#if shown}
	{#key shown.key}
		<div class="ls" class:mob={mobile} aria-live="polite">
			<div class="col">
				{#if shown.kind === 'up'}
					<span class="badge up"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l7 8h-4.5v8h-5v-8H5z" /></svg></span>
					<span class="ttl">Level up</span>
					<span class="sub">Choose your upgrade</span>
				{:else}
					<span class="badge coin">+1</span>
					<span class="ttl">Pity coin</span>
					<span class="sub">Not enough coins to level · +1 when the round ends</span>
				{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.ls { position: fixed; inset: 0; z-index: 62; pointer-events: none; display: grid; place-items: center; }
	/* a soft dark pool behind it, so it reads over a busy board */
	.ls::before { content: ''; position: absolute; left: 50%; top: 50%; width: min(820px, 120vw); height: 420px; transform: translate(-50%, -50%);
		background: radial-gradient(closest-side, rgba(5, 7, 12, .82), rgba(5, 7, 12, .5) 55%, transparent); animation: out 2.2s ease both; }
	.col { position: relative; }
	.col { display: flex; flex-direction: column; align-items: center; gap: 8px; zoom: var(--uis, 1); animation: out 2.2s ease both; }
	.badge { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; animation: pop .5s cubic-bezier(.2, 1.5, .4, 1) both;
		box-shadow: 0 0 0 3px rgba(255, 227, 160, .35), 0 0 34px rgba(255, 200, 100, .55), 0 10px 22px rgba(0, 0, 0, .6); }
	.badge.up { background: radial-gradient(circle at 38% 30%, #fff1c4, #e2b04f 55%, #8a5d17); }
	.badge.up svg { width: 46px; height: 46px; fill: #3b2508; }
	.badge.coin { background: radial-gradient(circle at 35% 30%, #ffe7a1, #d4a64a 60%, #9a6f22); border: 2px solid #fbe7b0; color: #3b2508; font-size: 1.9rem; }
	.ttl { font-size: 3.6rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .65)) drop-shadow(0 0 18px rgba(0, 0, 0, .8)); animation: track .8s cubic-bezier(.2, .7, .2, 1) .1s both; }
	.sub { font-size: .95rem; letter-spacing: .14em; text-transform: uppercase; color: #f0dcae; text-shadow: 0 2px 6px #000; animation: fade .4s ease .45s both; }
	@keyframes pop { from { opacity: 0; transform: scale(.3); } to { opacity: 1; transform: scale(1); } }
	@keyframes track { from { opacity: 0; letter-spacing: .4em; filter: blur(6px); } to { opacity: 1; letter-spacing: .08em; } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 85% { opacity: 1; } 100% { opacity: 0; } }
	.mob .col { zoom: .7; }
	.mob .sub { font-size: .8rem; letter-spacing: .06em; }
</style>
