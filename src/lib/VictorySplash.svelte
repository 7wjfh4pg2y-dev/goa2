<script lang="ts">
	// GAME OVER — a quiet title card, viewer-relative: VICTORY (you won) · DEFEAT (you lost) ·
	// "<Team> wins" (spectators). Above the title, how it was won:
	//  · a push (throne / final push) — the two-sided team coin (orange gear / blue star, the
	//    tie-breaker art) drops in flipping and lands on the winners' face
	//  · Life ran out — both teams' Life hearts (enemy left, yours right, like the other splashes):
	//    the winners' beats and glows, the losers' shakes and cracks to its broken back
	// Then two gold rules draw out, the title tracks in between them, and ONE line below
	// says how: "Titans ran out of Life Tokens" / "Atlanteans pushed into the Titan Throne" /
	// "Titans won the Final Push". (Names / numbers belong on the battle report.)
	// With `stats`, the battle report (GameStats — a full page of its own, with its own headline and
	// "View the board") covers the card after a few seconds, or straight away from "Battle report".
	import type { Team } from '$lib/match';
	import { teamName } from '$lib/teams';
	import tieOrange from '$lib/images/tiebreaker_orange.png';
	import tieBlue from '$lib/images/tiebreaker_blue.png';
	import { onDestroy, onMount } from 'svelte';
	import GameStats, { type GameStatsData } from '$lib/GameStats.svelte';

	export let team: Team; // the winning team
	export let reason = '';
	export let myTeam: Team | null = null; // null = spectator
	export let round = 1;
	export let mobile = false;
	export let onClose: () => void = () => {};
	export let stats: GameStatsData | null = null;

	const REPORT_AFTER = 5500;
	let report = false;
	let timer: ReturnType<typeof setTimeout> | null = null;
	onMount(() => { if (stats) timer = setTimeout(() => (report = true), REPORT_AFTER); });
	onDestroy(() => { if (timer) clearTimeout(timer); });

	const EMBLEM: Record<Team, string> = { orange: tieOrange, blue: tieBlue };
	const lifeImgs = import.meta.glob('./cards/images/life_counter_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const heart = (t: Team, side: 'front' | 'back') => lifeImgs[`./cards/images/life_counter_${t}_${side}.png`] ?? '';
	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	const L: Record<Team, string> = { orange: '#ffb27a', blue: '#8cc0ff' };
	$: loser = (team === 'orange' ? 'blue' : 'orange') as Team;
	$: lost = myTeam != null && myTeam !== team;
	$: title = myTeam == null ? `${teamName(team)} win` : lost ? 'Defeat' : 'Victory';
	$: line = /^(atlanteans|titans|orange|blue)\b/i.test(reason) ? reason : `${teamName(team)} ${reason}`;
	$: byLife = /life/i.test(reason); // won on Life → the hearts; a push → the coin
	$: mine = (myTeam ?? 'blue') as Team; // your side sits on the right (spectators: blue)
	$: enemy = (mine === 'orange' ? 'blue' : 'orange') as Team;
</script>

<div class="vs" class:lost class:mob={mobile} class:hearts={byLife} class:report style="--wc:{C[team]}; --wl:{L[team]}" role="dialog" aria-label="Game over">
	<div class="bg"></div>
	<div class="col">
		<div class="sign">
			{#if byLife}
				<div class="pair">
					{#each [enemy, mine] as t (t)}
						<div class="ht" class:win={t === team} class:lose={t !== team} style="--tc:{C[t]}">
							<img class="f" src={heart(t, 'front')} alt="" />
							{#if t !== team}<img class="b" src={heart(t, 'back')} alt="" />{/if}
						</div>
					{/each}
				</div>
			{:else}
				<div class="coin">
					<span class="halo"></span><span class="ring"></span>
					<div class="spin">
						<img class="face l" src={EMBLEM[loser]} alt="" />
						<img class="face w" src={EMBLEM[team]} alt="" />
					</div>
				</div>
			{/if}
		</div>
		<span class="kick">{teamName(team)} · Round {round}</span>
		<span class="rule"></span>
		<span class="ttl">{title}</span>
		<span class="rule"></span>
		<span class="why">{line}</span>
	</div>
	<div class="foot">
		{#if stats}<button class="close alt" on:click={() => (report = true)}>Battle report</button>{/if}
		<button class="close" on:click={onClose}>View the board</button>
	</div>
	<!-- the battle report: its own page over the card -->
	{#if report && stats}<GameStats data={stats} {myTeam} winner={team} {reason} {mobile} {onClose} />{/if}
</div>

<style>
	.vs { position: fixed; inset: 0; z-index: 70; overflow: hidden; color: #f6ead2; --z: var(--uis, 1); --td: 1.15s; }
	.vs.mob { --z: .62; }
	.bg { position: absolute; inset: 0; animation: fade .5s ease both; background: radial-gradient(70% 60% at 50% 45%, rgba(14, 14, 20, .95), rgba(2, 2, 4, .99)); }
	/* one centred column; zoom scales it (percent insets are untouched by zoom) */
	.col { position: absolute; left: 50%; top: 46%; translate: -50% -50%; zoom: var(--z); display: flex; flex-direction: column; align-items: center; gap: 12px; width: max-content; max-width: calc(96vw / var(--z)); }
	.sign { height: 170px; display: grid; place-items: center; margin-bottom: 4px; }
	/* the battle report covers the card: the card and its buttons leave the page (no tab stops under the report) */
	.report :is(.col, .foot) { opacity: 0; visibility: hidden; transition: opacity .2s ease, visibility 0s .2s; }
	.kick { font-size: .9rem; letter-spacing: .5em; text-transform: uppercase; color: var(--wl); animation: fade .6s ease var(--td) both; }
	.rule { width: 560px; max-width: calc(88vw / var(--z)); height: 2px; background: linear-gradient(90deg, transparent, #d9a845 20%, #ffe3a0 50%, #d9a845 80%, transparent);
		animation: draw .9s cubic-bezier(.3, .8, .3, 1) calc(var(--td) + .1s) both; }
	.lost .rule { background: linear-gradient(90deg, transparent, #6b7280 20%, #c9ced6 50%, #6b7280 80%, transparent); }
	.ttl { font-size: 6rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .65)); animation: track 1.2s cubic-bezier(.2, .7, .2, 1) calc(var(--td) + .3s) both; }
	.lost .ttl { background: linear-gradient(180deg, #f1f2f4 8%, #a3a9b3 50%, #4b5059 92%); -webkit-background-clip: text; background-clip: text; }
	.why { font-size: 1.35rem; letter-spacing: .1em; color: #f0dcae; text-align: center; animation: up .5s ease calc(var(--td) + .9s) both; }
	.foot { position: absolute; left: 0; right: 0; bottom: 5vh; display: flex; justify-content: center; gap: 12px; z-index: 5; }
	.close.alt { background: rgba(12, 18, 32, .7); }
	.close { font: inherit; font-size: 1.05rem; padding: .7rem 2rem; border-radius: 12px; cursor: pointer; color: #fff; letter-spacing: .05em; zoom: var(--uis, 1);
		background: color-mix(in srgb, var(--wc) 70%, #000); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); animation: up .5s ease calc(var(--td) + 1.3s) both; }
	.close:hover { filter: brightness(1.12); }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes up { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
	@keyframes draw { from { scale: 0 1; opacity: 0; } to { scale: 1 1; opacity: 1; } }
	@keyframes track { from { opacity: 0; letter-spacing: .5em; filter: blur(8px); } to { opacity: 1; letter-spacing: .08em; } }

	/* ═════ the coin: two-sided (loser's face up first), three flat flips, lands on the winners' ═════ */
	.coin { position: relative; width: 160px; height: 160px; }
	.spin { position: absolute; inset: 0; animation: drop .9s cubic-bezier(.3, .1, .4, 1) .15s both, flip .9s cubic-bezier(.2, .5, .4, 1) .15s both; }
	.face { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 10px 18px rgba(0, 0, 0, .7)); }
	.face.w { animation: faceW .9s cubic-bezier(.2, .5, .4, 1) .15s both; }
	.face.l { animation: faceL .9s cubic-bezier(.2, .5, .4, 1) .15s both; }
	@keyframes drop { 0% { opacity: 0; translate: 0 -380px; } 15% { opacity: 1; } 78% { translate: 0 6px; } 100% { opacity: 1; translate: 0 0; } }
	@keyframes flip { 0% { transform: scaleX(1); } 12% { transform: scaleX(.04); } 26% { transform: scaleX(1); } 42% { transform: scaleX(.04); } 60% { transform: scaleX(1); } 76% { transform: scaleX(.04); } 100% { transform: scaleX(1); } }
	/* the faces swap at each edge-on moment (12% / 42% / 76%) */
	@keyframes faceW { 0%, 11.9% { opacity: 0; } 12%, 41.9% { opacity: 1; } 42%, 75.9% { opacity: 0; } 76%, 100% { opacity: 1; } }
	@keyframes faceL { 0%, 11.9% { opacity: 1; } 12%, 41.9% { opacity: 0; } 42%, 75.9% { opacity: 1; } 76%, 100% { opacity: 0; } }
	.halo { position: absolute; inset: -45%; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--wl) 50%, transparent), transparent); opacity: 0; animation: fade .8s ease 1s forwards; }
	.ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid #ffe3a0; opacity: 0; animation: ring .8s ease-out 1.05s forwards; }
	@keyframes ring { 0% { opacity: .9; scale: .9; } 100% { opacity: 0; scale: 2.1; border-width: 1px; } }

	/* ═════ the hearts: the winners' beats, the losers' shakes and cracks ═════ */
	.vs.hearts { --td: 1.35s; }
	.pair { display: flex; gap: 70px; }
	.ht { position: relative; width: 150px; height: 150px; animation: up .5s ease .1s both; }
	.ht img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
	.ht.win img { filter: drop-shadow(0 0 26px var(--tc)); animation: beat 1.1s ease .5s 2; }
	@keyframes beat { 0%, 100% { scale: 1; } 14% { scale: 1.12; } 28% { scale: 1; } 42% { scale: 1.08; } 70% { scale: 1; } }
	.ht.lose .f { filter: drop-shadow(0 0 20px var(--tc)); animation: shake .6s linear .45s, gone .01s linear 1.05s forwards; }
	.ht.lose .b { opacity: 0; animation: crackIn .5s ease-out 1.05s forwards; }
	@keyframes shake { 0%, 100% { translate: 0 0; } 20% { translate: -4px 1px; } 40% { translate: 5px -2px; } 60% { translate: -6px 2px; } 80% { translate: 6px -1px; } }
	@keyframes gone { to { opacity: 0; } }
	@keyframes crackIn { 0% { opacity: 1; scale: 1.15; filter: brightness(2); } 100% { opacity: 1; scale: 1; filter: brightness(.6) saturate(.6) drop-shadow(0 6px 10px rgba(0, 0, 0, .7)); } }

	/* phones: the column is zoomed down (--z); keep the title on one line */
	.mob .ttl { font-size: min(6rem, calc(15vw / var(--z))); }
	.mob .pair { gap: 40px; }
	.mob .why { font-size: 1.3rem; }
	.mob .close { zoom: 1; font-size: .92rem; padding: .6rem 1.1rem; white-space: nowrap; }
	.mob .foot { gap: 8px; padding: 0 12px; }
</style>
