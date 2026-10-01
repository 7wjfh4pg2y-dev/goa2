<script lang="ts">
	// THE WAVE ADVANCES — a lane push: an arrow-shaped band in the pushing team's colour
	// storms across in the push direction, drawn from the viewer's side: your base is
	// bottom-right, so YOUR team pushes right → left and the enemy pushes left → right
	// (same sides as the battle splash), chevrons streaming through it. A game-winning push reads
	// THE THRONE FALLS / FINAL PUSH instead. Played by every client from `pushNews`.
	import { teamName, placeName } from '$lib/teams';
	import { onDestroy } from 'svelte';
	import type { PushNews } from '$lib/battle';
	import type { Team } from '$lib/match';

	export let news: PushNews | null = null;
	export let mobile = false;
	export let myTeam: Team = 'blue'; // the viewer's team sits on the right (spectators: blue)

	let seen = news?.id ?? null; // joining mid-game: don't replay an old push
	let shown: PushNews | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: if (news && news.id !== seen) {
		seen = news.id;
		if (Date.now() - news.at < 20000) play(news);
	}
	function play(n: PushNews) {
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = n;
			timer = setTimeout(() => (shown = null), n.won ? 4800 : 3300);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	// the arrow is ONE svg (body + head) clipped to its own shape, so the chevrons and the
	// glint run all the way into the tip; sized from the measured box
	let aw = 0, ah = 0;
	$: fromR = !!shown && shown.winner === myTeam;
	$: hw = ah * 0.55; // head length
	$: shape = !aw || !ah ? '' : fromR
		? `M${aw} 0 H${hw} L0 ${ah / 2} L${hw} ${ah} H${aw} Z`
		: `M0 0 H${aw - hw} L${aw} ${ah / 2} L${aw - hw} ${ah} H0 Z`;
	$: sp = ah * 0.58; // chevron spacing (= one loop of the stream)
	$: chevs = !aw || !ah ? [] : Array.from({ length: Math.ceil(aw / sp) + 3 }, (_, i) => {
		const x = (i - 1) * sp, h = ah * 0.24, w = ah * 0.24, m = ah / 2;
		return fromR ? `${x + w},${m - h} ${x},${m} ${x + w},${m + h}` : `${x},${m - h} ${x + w},${m} ${x},${m + h}`;
	});
</script>

{#if shown}
	{#key shown.id}
		<div class="ps {shown.winner}" class:won={!!shown.won} class:fromR={shown.winner === myTeam} class:mob={mobile} aria-live="polite">
			<!-- one plain arrow pointing the way the wave moves; chevrons stream right into the tip -->
			<div class="arrow" bind:clientWidth={aw} bind:clientHeight={ah}>
				{#if shape}
					<svg width={aw} height={ah} viewBox="0 0 {aw} {ah}" aria-hidden="true">
						<defs>
							<clipPath id="pc-{shown.id}"><path d={shape} /></clipPath>
							<linearGradient id="pg-{shown.id}" x1={fromR ? 1 : 0} x2={fromR ? 0 : 1} y1="0" y2="0">
								<stop offset="0" style="stop-color: var(--cd)" /><stop offset=".45" style="stop-color: var(--c)" /><stop offset="1" style="stop-color: var(--c2)" />
							</linearGradient>
							<linearGradient id="pl-{shown.id}" x1="0" x2="1" y1="0" y2="0">
								<stop offset="0" stop-color="#fff" stop-opacity="0" /><stop offset=".5" stop-color="#fff" stop-opacity=".45" /><stop offset="1" stop-color="#fff" stop-opacity="0" />
							</linearGradient>
						</defs>
						<g clip-path="url(#pc-{shown.id})">
							<rect width={aw} height={ah} fill="url(#pg-{shown.id})" />
							<g class="chevs" stroke-width={ah * 0.08}>
								{#each chevs as pts, i (i)}<polyline points={pts} />{/each}
								<animateTransform attributeName="transform" type="translate" from="{fromR ? sp : -sp} 0" to="0 0" dur=".55s" repeatCount="indefinite" />
							</g>
							<rect y="0" height={ah} width={aw * 0.3} x={fromR ? aw : -aw * 0.3} fill="url(#pl-{shown.id})">
								<animate attributeName="x" from={fromR ? aw : -aw * 0.3} to={fromR ? -aw * 0.3 : aw} begin=".25s" dur="1.1s" fill="freeze" />
							</rect>
						</g>
						{#if shown.won}<path d={shape} fill="none" stroke="#ffd27a" stroke-width="5" stroke-linejoin="round" />{/if}
					</svg>
				{/if}
			</div>
			<div class="txt">
				<span class="kick">{teamName(shown.winner)} push</span>
				{#if shown.won}
					<span class="big">{shown.to === null && /throne/i.test(shown.won) ? 'The throne falls' : 'Final push'}</span>
					<span class="sub">{teamName(shown.winner)} win the game!</span>
				{:else}
					<span class="big">The wave advances</span>
					<span class="sub">Battle zone → <b>{placeName(shown.to)}</b> · Waves {shown.wavesBefore} → {shown.wavesAfter}</span>
				{/if}
			</div>
		</div>
	{/key}
{/if}

<style>
	.ps { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; display: grid; place-items: center; --T: 3.3s; }
	.ps.won { --T: 4.8s; }
	.ps.orange { --c: #ef7d22; --c2: #ffb36b; --cd: #6b2d06; }
	.ps.blue { --c: #2f7fe6; --c2: #8cc0ff; --cd: #0f2f63; }

	/* the arrow: storms in from behind, holds while the chevrons race, then shoots off ahead.
	   One SVG clipped to the arrow shape (chevrons + glint reach the tip), moved with
	   transform only — no CSS clip-path, blur or `scale: -1` mirroring. Your team pushes
	   right → left (.fromR: head on the left, its own keyframes). */
	.arrow { position: absolute; left: -3vw; right: 5vw; top: calc(50% - var(--h) / 2); height: var(--h); --h: calc(200px * var(--uis, 1));
		animation: stormL var(--T) cubic-bezier(.2, .85, .25, 1) both; }
	.fromR .arrow { left: 5vw; right: -3vw; animation-name: stormR; }
	.arrow svg { display: block; }
	@keyframes stormL { 0% { transform: translateX(-110vw); } 12% { transform: translateX(0); } 86% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(110vw); opacity: .3; } }
	@keyframes stormR { 0% { transform: translateX(110vw); } 12% { transform: translateX(0); } 86% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(-110vw); opacity: .3; } }
	.chevs { fill: none; stroke: rgba(255, 255, 255, .22); stroke-linejoin: miter; }

	.txt { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; zoom: var(--uis, 1); text-align: center;
		color: #fff; text-shadow: 0 3px 0 var(--cd), 0 0 26px rgba(0, 0, 0, .85), 0 0 50px rgba(0, 0, 0, .6); }
	.kick { font-size: 1rem; letter-spacing: .45em; text-transform: uppercase; color: #fff4e0; animation: fade .3s ease .25s both, out var(--T) ease both; }
	.big { font-size: 4.2rem; line-height: 1; text-transform: uppercase; letter-spacing: .03em; animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .2s both, out var(--T) ease both; }
	.sub { font-size: 1.1rem; letter-spacing: .1em; color: #fff4e0; animation: fade .3s ease .45s both, out var(--T) ease both; }
	.sub b { font-weight: normal; color: #fff; }
	.won .big { font-size: 5rem; color: #ffe3a0; text-shadow: 0 4px 0 #5a3a08, 0 0 30px rgba(255, 210, 120, .9), 0 0 70px rgba(0, 0, 0, .8); }
	@keyframes slam { from { opacity: 0; transform: scale(1.9); filter: blur(5px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }

	/* phones: the title always fits one line; a slimmer arrow */
	.mob .arrow { --h: 150px; }
	.mob .txt { zoom: 1; padding: 0 10px; }
	.mob .big { font-size: min(2.2rem, 7vw); white-space: nowrap; } .mob.won .big { font-size: min(2.6rem, 7.6vw); }
	.mob .sub { font-size: .74rem; letter-spacing: .04em; } .mob .kick { font-size: .7rem; letter-spacing: .3em; }
</style>
