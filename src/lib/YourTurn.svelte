<script lang="ts" module>
	export type TurnCueLook = 'banner' | 'edge' | 'medal';
	export const TURN_CUE_LOOKS: { id: TurnCueLook; label: string }[] = [
		{ id: 'banner', label: 'Banner' },
		{ id: 'edge', label: 'Edge glow' },
		{ id: 'medal', label: 'Medal' }
	];
	/** the look the game uses (the user picks one on /splash-demo) */
	export const TURN_CUE_DEFAULT: TurnCueLook = 'banner';
</script>

<script lang="ts">
	// YOUR TURN — a short cue when the card acting now is yours (after the reveal, cards act one at a time), so nobody
	// has to say "hey, it's your turn". Three looks to choose from (see /splash-demo):
	//   banner — a band sweeps across the upper screen: your hero's face, YOUR TURN, the card's name; ~2.2 s
	//   edge   — the screen's edges glow in your colour twice and a small pill drops under the top bar; ~2.4 s
	//   medal  — your hero's face pops in the middle with a ring of light, then flies down to the action ring; ~2.4 s
	// Nothing to click (pointer-events: none) and only transform / opacity animate; it leaves the page when done.
	import PlayerIcon from '$lib/PlayerIcon.svelte';

	export let look: TurnCueLook = TURN_CUE_DEFAULT;
	export let mobile = false;

	type Cue = { id: number; hero: string; heroName: string; card: string; color: string; team: 'orange' | 'blue' };
	let cue: Cue | null = null;
	let n = 0;
	let t: ReturnType<typeof setTimeout> | null = null;
	const LEN: Record<TurnCueLook, number> = { banner: 2300, edge: 2500, medal: 2400 };
	/** play the cue (a new one replaces one still showing) */
	export function play(c: Omit<Cue, 'id'>) {
		if (t) clearTimeout(t);
		cue = { ...c, id: ++n };
		t = setTimeout(() => (cue = null), LEN[look]);
	}
	const TEAM: Record<string, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
</script>

{#if cue}
	{#key cue.id}
		<div class="yt {look}" class:mobile style="--pc:{cue.color}; --tc:{TEAM[cue.team]}" aria-live="polite">
			{#if look === 'banner'}
				<div class="band">
					<span class="face"><PlayerIcon hero={cue.hero} team={cue.team} color={cue.color} size="100%" ring={3} /></span>
					<span class="txt"><b>Your turn</b>{#if cue.card}<em>{cue.heroName} · {cue.card}</em>{/if}</span>
				</div>
			{:else if look === 'edge'}
				<i class="e t"></i><i class="e b"></i><i class="e l"></i><i class="e r"></i>
				<div class="pill"><b>Your turn</b>{#if cue.card}<em>{cue.card}</em>{/if}</div>
			{:else}
				<div class="medal">
					<span class="burst"></span>
					<span class="face"><PlayerIcon hero={cue.hero} team={cue.team} color={cue.color} size="100%" ring={4} /></span>
					<b>Your move</b>
				</div>
			{/if}
		</div>
	{/key}
{/if}

<style>
	.yt { position: fixed; inset: 0; z-index: 58; pointer-events: none; color: #fff7e6; }

	/* ── banner ── */
	.band { position: absolute; left: 0; right: 0; top: 22%; height: clamp(76px, 13vh, 132px); display: flex; align-items: center; justify-content: center; gap: clamp(14px, 2vw, 28px);
		background: linear-gradient(90deg, transparent, rgba(6, 18, 32, 0.92) 18%, rgba(6, 18, 32, 0.92) 82%, transparent);
		box-shadow: inset 0 2px 0 color-mix(in srgb, var(--tc) 80%, #fff), inset 0 -2px 0 color-mix(in srgb, var(--tc) 80%, #fff);
		animation: bandIn 2.3s cubic-bezier(.2, .8, .2, 1) both; }
	@keyframes bandIn {
		0% { transform: translateX(60%) skewX(-12deg); opacity: 0; }
		14% { transform: translateX(0) skewX(-12deg); opacity: 1; }
		20%, 80% { transform: translateX(0) skewX(0); opacity: 1; }
		100% { transform: translateX(-40%) skewX(-12deg); opacity: 0; }
	}
	.band .face { width: clamp(56px, 9.5vh, 100px); height: clamp(56px, 9.5vh, 100px); flex: none; }
	.band .txt { display: flex; flex-direction: column; gap: 2px; }
	.band b { font-weight: 400; font-size: clamp(30px, 6.4vh, 64px); line-height: 1; letter-spacing: 0.06em; text-transform: uppercase; color: #f4dfa8; text-shadow: 0 0 18px color-mix(in srgb, var(--tc) 70%, transparent), 0 2px 6px #000; }
	.band em { font-style: normal; font-size: clamp(13px, 2.1vh, 20px); color: #d6dee8; }

	/* ── edge glow ── */
	.e { position: absolute; opacity: 0; animation: edgePulse 2.5s ease-in-out both; }
	.e.t { left: 0; right: 0; top: 0; height: 9vh; background: linear-gradient(180deg, color-mix(in srgb, var(--pc) 75%, transparent), transparent); }
	.e.b { left: 0; right: 0; bottom: 0; height: 9vh; background: linear-gradient(0deg, color-mix(in srgb, var(--pc) 75%, transparent), transparent); }
	.e.l { top: 0; bottom: 0; left: 0; width: 7vw; background: linear-gradient(90deg, color-mix(in srgb, var(--pc) 75%, transparent), transparent); }
	.e.r { top: 0; bottom: 0; right: 0; width: 7vw; background: linear-gradient(270deg, color-mix(in srgb, var(--pc) 75%, transparent), transparent); }
	@keyframes edgePulse { 0% { opacity: 0; } 15% { opacity: 1; } 35% { opacity: 0.35; } 55% { opacity: 1; } 100% { opacity: 0; } }
	.pill { position: absolute; left: 50%; top: clamp(70px, 14vh, 130px); display: flex; align-items: baseline; gap: 10px; padding: 8px 20px; border-radius: 999px;
		background: rgba(6, 18, 32, 0.94); box-shadow: 0 0 0 2px var(--pc), 0 8px 24px rgba(0, 0, 0, 0.5);
		animation: pillIn 2.5s cubic-bezier(.2, .8, .2, 1) both; }
	@keyframes pillIn { 0% { transform: translate(-50%, -30px); opacity: 0; } 12%, 85% { transform: translate(-50%, 0); opacity: 1; } 100% { transform: translate(-50%, -12px); opacity: 0; } }
	.pill b { font-weight: 400; font-size: clamp(18px, 3vh, 28px); letter-spacing: 0.06em; text-transform: uppercase; color: #f4dfa8; }
	.pill em { font-style: normal; font-size: clamp(12px, 1.8vh, 17px); color: #d6dee8; }

	/* ── medal ── */
	.medal { position: absolute; left: 50%; top: 42%; display: flex; flex-direction: column; align-items: center; gap: 12px;
		animation: medalFly 2.4s cubic-bezier(.4, 0, .2, 1) both; }
	@keyframes medalFly {
		0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
		16% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
		20%, 70% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
		100% { transform: translate(calc(-50% + 30vw), calc(-50% + 42vh)) scale(0.25); opacity: 0; }
	}
	.mobile .medal { animation-name: medalFlyPh; }
	@keyframes medalFlyPh {
		0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
		16% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; }
		20%, 70% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
		100% { transform: translate(-50%, calc(-50% + 46vh)) scale(0.25); opacity: 0; }
	}
	.medal .face { position: relative; width: clamp(96px, 18vh, 170px); height: clamp(96px, 18vh, 170px); }
	.medal .burst { position: absolute; left: 50%; top: clamp(48px, 9vh, 85px); width: clamp(96px, 18vh, 170px); height: clamp(96px, 18vh, 170px); margin: calc(clamp(96px, 18vh, 170px) / -2) 0 0 calc(clamp(96px, 18vh, 170px) / -2);
		border-radius: 50%; box-shadow: 0 0 0 4px var(--pc), 0 0 40px 10px color-mix(in srgb, var(--pc) 60%, transparent); animation: burst 0.9s ease-out both; }
	@keyframes burst { from { transform: scale(0.8); opacity: 1; } to { transform: scale(2.2); opacity: 0; } }
	.medal b { font-weight: 400; font-size: clamp(24px, 4.6vh, 44px); letter-spacing: 0.08em; text-transform: uppercase; color: #f4dfa8; text-shadow: 0 2px 8px #000; white-space: nowrap; }

	@media (prefers-reduced-motion: reduce) {
		.band, .pill, .medal { animation-duration: 0.01s; animation-delay: 0s; }
		.band, .pill { animation: none; }
		.pill { transform: translateX(-50%); }
		.medal { animation: none; transform: translate(-50%, -50%); }
		.burst, .e { animation: none; opacity: 0.6; }
	}
</style>
