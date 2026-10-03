<script lang="ts">
	// THE WAVE ADVANCES — a lane push: an arrow-shaped band in the pushing team's colour
	// storms across in the push direction, drawn from the viewer's side: your base is
	// bottom-right, so YOUR team pushes right → left and the enemy pushes left → right
	// (same sides as the battle splash), chevrons streaming through it. Played by every client
	// from `pushNews`.
	//
	// A push that WINS THE GAME is a ceremony instead — THE CREST CLAIMED (quiet, then big):
	// the board sinks into deep sea, the two team crests stand as medallions (enemy left, yours
	// right), the losers' crest loses its colour and falls away, the winners' crest takes the
	// middle and rises large and whole in its metal, two brass rules draw out and the title
	// tracks in between them.
	//  · THE THRONE FALLS (a place is taken): the losers' crest sits in a brass seat, tips and
	//    drops out of it; the seat stands empty for a beat; the winners' crest crosses into it.
	//  · FINAL PUSH (the last wave breaks through): the crests face each other on a line; the
	//    winners' draws back, drives through and shoves the losers' off its side.
	// Gold when the viewer's team won (a spectator sees gold for whoever won), pewter when it
	// lost. The crest then stays where it is: the victory card (VictorySplash) takes it over —
	// see winstage.ts.
	import { teamName, placeName } from '$lib/teams';
	import { onDestroy } from 'svelte';
	import type { PushNews } from '$lib/battle';
	import type { Team } from '$lib/match';
	import TeamCrest from '$lib/ui/TeamCrest.svelte';
	import { winStage, STAGE_TOP, CREST_D, CREST_Y, WIN_MS, WIN_HOLD_MS } from '$lib/winstage';

	export let news: PushNews | null = null;
	export let mobile = false;
	export let myTeam: Team | null = 'blue'; // the viewer's team sits on the right; null = a spectator (watches as blue)
	$: view = (myTeam ?? 'blue') as Team;

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
		// the hand-over is posted NOW, not a frame later: the victory card may be mounting in this
		// very tick (GameView holds it 5 s from the push; after a minion battle the ceremony starts
		// late, and the card must find these times and wait for it)
		if (n.won) { winStage.ready = Date.now() + WIN_MS; winStage.gone = Date.now() + WIN_HOLD_MS; }
		requestAnimationFrame(() => {
			shown = n;
			timer = setTimeout(() => (shown = null), n.won ? WIN_HOLD_MS : 3300);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });

	// the game-winning ceremony
	$: throne = !!shown?.won && shown.to === null && /throne/i.test(shown.won);
	$: title = throne ? 'The Throne Falls' : 'Final Push';
	$: letters = title.split('');
	$: loser = (shown?.winner === 'orange' ? 'blue' : 'orange') as Team;
	$: gold = !!shown && (myTeam == null || shown.winner === myTeam);
	const stageVars = `--top:${STAGE_TOP * 100}%; --cd:${CREST_D}px; --cy:${CREST_Y}px; --T:${WIN_MS}ms; --hold:${WIN_HOLD_MS}ms`;

	// the arrow is ONE svg (body + head) clipped to its own shape, so the chevrons and the
	// glint run all the way into the tip; sized from the measured box
	let aw = 0, ah = 0;
	$: fromR = !!shown && shown.winner === view;
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
		{#if shown.won}
			<!-- the win. --d: the winners' side (1 = the viewer's right: their own team; -1 = the left) -->
			<div class="pw {throne ? 'throne' : 'final'} {shown.winner}" class:mine={gold} class:mob={mobile}
				style="{stageVars}; --d:{shown.winner === view ? 1 : -1}; --n:{letters.length}" role="status" aria-label="{title}. {teamName(shown.winner)} win the game.">
				<div class="scrim"></div>
				<div class="stage" aria-hidden="true">
					<span class="orbit"></span>
					<span class="halo"></span>
					{#if !throne}<span class="wake"><i></i><i></i><i></i></span>{/if}
					<span class="seat"></span>
					<div class="cr lose"><TeamCrest team={loser} /><div class="ash"><TeamCrest team={loser} ash /></div></div>
					<div class="cr win"><TeamCrest team={shown.winner} /><span class="shine"><i></i></span></div>
					<span class="rule a"></span>
					<div class="ttl">
						<div class="sh">{#each letters as ch, i (i)}<span>{ch}</span>{/each}</div>
						<div class="tx">{#each letters as ch, i (i)}<span style="--o:{i - (letters.length - 1) / 2}">{ch}</span>{/each}</div>
					</div>
					<span class="rule b"></span>
				</div>
			</div>
		{:else}
			<div class="ps {shown.winner}" class:fromR={fromR} class:mob={mobile} aria-live="polite">
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
						</svg>
					{/if}
				</div>
				<div class="txt">
					<span class="kick">{teamName(shown.winner)} push</span>
					<span class="big">The wave advances</span>
					<span class="sub">Battle zone → <b>{placeName(shown.to)}</b> · Waves {shown.wavesBefore} → {shown.wavesAfter}</span>
				</div>
			</div>
		{/if}
	{/key}
{/if}

<style>
	.ps { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; display: grid; place-items: center; --T: 3.3s; }
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
	@keyframes slam { from { opacity: 0; transform: scale(1.9); } to { opacity: 1; transform: scale(1); } } /* transform + opacity only (a blur here ran on the main thread on every push) */
	@keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	@keyframes out { 0%, 86% { opacity: 1; } 100% { opacity: 0; } }

	/* phones: the title always fits one line; a slimmer arrow */
	.mob .arrow { --h: 150px; }
	.mob .txt { zoom: 1; padding: 0 10px; }
	.mob .big { font-size: min(2.2rem, 7vw); white-space: nowrap; }
	.mob .sub { font-size: .74rem; letter-spacing: .04em; } .mob .kick { font-size: .7rem; letter-spacing: .3em; }

	/* ═════ the game-winning push: THE CREST CLAIMED ═════
	   Everything sits at its END state in plain CSS and animates TO it with transform / opacity
	   only, so "reduce motion" (no animation at all) shows the finished picture. The stage is
	   a point (50% / --top) zoomed by the UI scale; every size below is in design px. */
	.pw { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; --z: var(--uis, 1); --sx: 350px;
		--brass: linear-gradient(90deg, transparent, #d9a845 20%, #ffe3a0 50%, #d9a845 80%, transparent);
		--ink: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); --ring: #e6bd62;
		animation: pwOut .5s ease calc(var(--hold) - .5s) forwards; }
	.pw.orange { --glow: rgba(255, 170, 110, .5); }
	.pw.blue { --glow: rgba(130, 190, 255, .5); }
	/* the viewer's team lost: pewter instead of gold, a colder and darker sea */
	.pw:not(.mine) { --brass: linear-gradient(90deg, transparent, #6b7280 20%, #c9ced6 50%, #6b7280 80%, transparent);
		--ink: linear-gradient(180deg, #f1f2f4 8%, #a3a9b3 50%, #4b5059 92%); --ring: #aab1bb; }
	.pw.mob { --z: .62; --sx: 228px; }
	/* deep sea: opaque (a translucent one let the HUD and the hexes ghost through the ceremony) */
	.scrim { position: absolute; inset: 0; background: radial-gradient(75% 65% at 50% 42%, #0b243c, #030b15); animation: pwIn .45s ease both; }
	.pw:not(.mine) .scrim { background: radial-gradient(75% 65% at 50% 42%, #09131f, #02050a); }
	.stage { position: absolute; left: 50%; top: var(--top); width: 0; height: 0; zoom: var(--z); }
	.stage > * { position: absolute; }
	@keyframes pwIn { from { opacity: 0; } }
	@keyframes pwOut { to { opacity: 0; } }

	/* the two crests, both laid out where the winners' ends (full size, so it is drawn sharp) */
	.cr { left: calc(var(--cd) / -2); top: calc(var(--cy) - var(--cd) / 2); width: var(--cd); height: var(--cd); }
	.cr.lose { opacity: 0; }
	.ash { position: absolute; inset: 0; }
	@keyframes ashIn { from { opacity: 0; } }
	/* one gleam across the winners' crest once it has risen (a band sliding inside a round window) */
	.shine { position: absolute; inset: 1.4%; border-radius: 50%; overflow: hidden; }
	.shine i { position: absolute; top: -10%; bottom: -10%; left: 0; width: 34%; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .5), transparent);
		transform: translateX(330%) skewX(-20deg); animation: shine .85s cubic-bezier(.4, 0, .3, 1) 2.75s both; }
	@keyframes shine { from { transform: translateX(-140%) skewX(-20deg); } }
	/* the winners' light, and the brass ring: the seat, then the ring of light as the crest swells */
	.halo { left: calc(var(--cd) * -1.06); top: calc(var(--cy) - var(--cd) * 1.06); width: calc(var(--cd) * 2.12); height: calc(var(--cd) * 2.12); border-radius: 50%;
		background: radial-gradient(closest-side, var(--glow), transparent); animation: haloIn 1s ease 2.05s both; }
	.pw:not(.mine) .halo { opacity: .5; }
	@keyframes haloIn { from { opacity: 0; transform: scale(.45); } }
	/* two faint brass rings round the stage, slowly closing in: the seal the ceremony happens on */
	.orbit { left: -330px; top: calc(var(--cy) - 330px); width: 660px; height: 660px; border-radius: 50%; border: 1px solid var(--ring); opacity: .2;
		animation: orbit var(--T) cubic-bezier(.2, .6, .2, 1) both; }
	.orbit::after { content: ''; position: absolute; inset: -120px; border-radius: 50%; border: 1px solid var(--ring); opacity: .55; }
	@keyframes orbit { from { opacity: 0; transform: scale(1.22); } }
	.seat { left: calc(var(--cd) / -2 - 15px); top: calc(var(--cy) - var(--cd) / 2 - 15px); width: calc(var(--cd) + 30px); height: calc(var(--cd) + 30px);
		border-radius: 50%; border: 3px solid var(--ring); opacity: 0; }

	/* THE THRONE FALLS — the losers' crest in the seat: it greys, tips and drops out; only then
	   does the winners' crest come in from its own side, at the seat's height, crosses into the
	   empty seat and swells (for the first 1.5 s the seat stands alone, centred) */
	.throne .seat { background: radial-gradient(closest-side, rgba(1, 6, 12, .7) 84%, rgba(1, 6, 12, 0)); animation: seatT var(--T) both; }
	@keyframes seatT {
		0% { opacity: 0; transform: scale(.56); }
		8%, 46% { opacity: 1; transform: scale(.62); animation-timing-function: cubic-bezier(.2, .7, .3, 1); }
		64%, 100% { opacity: 0; transform: scale(1.5); }
	}
	.throne .ash { animation: ashIn .5s ease .42s both; }
	.throne .cr.lose { animation: loseT var(--T) both; }
	@keyframes loseT {
		0% { opacity: 0; transform: translateY(14px) scale(.62); }
		8%, 19% { opacity: 1; transform: scale(.62); animation-timing-function: ease-in-out; }
		23% { opacity: 1; transform: translateY(4px) rotate(calc(var(--d) * -6deg)) scale(.62); animation-timing-function: cubic-bezier(.55, 0, .9, .5); }
		33% { opacity: 1; }
		36%, 100% { opacity: 0; transform: translate(calc(var(--d) * -130px), 640px) rotate(calc(var(--d) * -42deg)) scale(.56); }
	}
	.throne .cr.win { animation: winT var(--T) both; }
	@keyframes winT {
		0%, 27% { opacity: 0; transform: translate(calc(var(--d) * (var(--sx) + 70px)), 0) scale(.4); animation-timing-function: cubic-bezier(.2, .6, .3, 1); }
		33%, 36% { opacity: 1; transform: translate(calc(var(--d) * var(--sx)), 0) scale(.4); animation-timing-function: cubic-bezier(.6, 0, .2, 1); }
		44%, 46% { opacity: 1; transform: scale(.62); animation-timing-function: cubic-bezier(.3, 0, .3, 1); }
		57% { opacity: 1; transform: scale(1.035); animation-timing-function: ease-in-out; }
		62%, 100% { opacity: 1; transform: none; }
	}
	.throne .rule.a { animation: shelfT var(--T) both; }
	@keyframes shelfT {
		0% { opacity: 0; transform: translateY(-82px) scaleX(.1); }
		8%, 46% { opacity: 1; transform: translateY(-82px) scaleX(.3); animation-timing-function: cubic-bezier(.5, 0, .2, 1); }
		62%, 100% { opacity: 1; transform: none; }
	}

	/* FINAL PUSH — the crests face each other on a line; the winners' draws back, drives
	   through (a brass wake behind it) and shoves the losers' off its side; then it swells */
	.final .seat { animation: seatF var(--T) both; }
	@keyframes seatF {
		0%, 45% { opacity: 0; transform: scale(.5); }
		46% { opacity: 1; transform: scale(.5); animation-timing-function: cubic-bezier(.2, .7, .3, 1); }
		64%, 100% { opacity: 0; transform: scale(1.5); }
	}
	.final .ash { animation: ashIn .4s ease 1.1s both; }
	.final .cr.lose { animation: loseF var(--T) both; }
	@keyframes loseF {
		0% { opacity: 0; transform: translate(calc(var(--d) * -170px), 14px) scale(.5); }
		8%, 25% { opacity: 1; transform: translate(calc(var(--d) * -170px), 0) scale(.5); animation-timing-function: cubic-bezier(.1, .6, .4, 1); }
		33% { opacity: 1; }
		38%, 100% { opacity: 0; transform: translate(calc(var(--d) * -700px), 76px) rotate(calc(var(--d) * -32deg)) scale(.46); }
	}
	.final .cr.win { animation: winF var(--T) both; }
	@keyframes winF {
		0% { opacity: 0; transform: translate(calc(var(--d) * 170px), 14px) scale(.5); }
		8%, 11% { opacity: 1; transform: translate(calc(var(--d) * 170px), 0) scale(.5); animation-timing-function: ease-in-out; }
		20% { opacity: 1; transform: translate(calc(var(--d) * 212px), 0) scale(.5); animation-timing-function: cubic-bezier(.7, 0, .5, 1); }
		28% { opacity: 1; transform: translate(calc(var(--d) * -56px), 0) scale(.5); animation-timing-function: ease-in-out; }
		38%, 46% { opacity: 1; transform: scale(.5); animation-timing-function: cubic-bezier(.3, 0, .3, 1); }
		57% { opacity: 1; transform: scale(1.035); animation-timing-function: ease-in-out; }
		62%, 100% { opacity: 1; transform: none; }
	}
	.final .rule.a { animation: shelfF var(--T) both; }
	@keyframes shelfF {
		0% { opacity: 0; transform: translateY(-102px) scaleX(.2); }
		8%, 46% { opacity: 1; transform: translateY(-102px) scaleX(.74); animation-timing-function: cubic-bezier(.5, 0, .2, 1); }
		62%, 100% { opacity: 1; transform: none; }
	}
	.wake { left: 0; top: var(--cy); width: 0; height: 0; }
	.wake i { position: absolute; left: calc(var(--d) * 350px - 280px); width: 560px; height: 2px; opacity: 0;
		background: linear-gradient(calc(var(--d) * -90deg), transparent, var(--ring)); transform-origin: calc(50% + var(--d) * 50%) 50%; animation: wake var(--T) both; }
	.wake i:nth-child(1) { top: -53px; } .wake i:nth-child(2) { top: -1px; } .wake i:nth-child(3) { top: 51px; }
	@keyframes wake { 0%, 20% { opacity: 0; transform: scaleX(0); } 28% { opacity: .9; transform: scaleX(1); } 42%, 100% { opacity: 0; transform: scaleX(1); } }

	/* the title card: the shelf under the crests slides down and draws out into the top rule,
	   the second rule draws out, and the title tracks in between them (each letter slides in
	   from a wider spacing — a transform, never letter-spacing) */
	.rule { left: -390px; width: 780px; height: 2px; background: var(--brass); }
	.rule.a { top: 134px; }
	.rule.b { top: 226px; animation: draw .7s cubic-bezier(.3, .8, .3, 1) 2.35s both; }
	@keyframes draw { from { opacity: 0; transform: scaleX(0); } }
	.ttl { left: -700px; width: 1400px; top: 147px; text-align: center; white-space: nowrap; font-size: 60px; line-height: 1.1;
		letter-spacing: .14em; text-indent: .14em; text-transform: uppercase; font-kerning: none; }
	.ttl span { display: inline-block; white-space: pre; letter-spacing: 0; }
	.tx { position: relative; }
	.tx span { background: var(--ink); -webkit-background-clip: text; background-clip: text; color: transparent; animation: trackIn .95s cubic-bezier(.2, .7, .2, 1) 2.4s both; }
	/* the letters' shadow: the same letters in black underneath, in once they have settled */
	.sh { position: absolute; inset: 0; transform: translate(1px, 4px); color: rgba(0, 0, 0, .62); animation: pwIn .5s ease 3s both; }
	@keyframes trackIn { from { opacity: 0; transform: translateX(calc(var(--o) * var(--tr, .42em))); } }
	/* phones: the title (--n letters, measured ≈ .74em each with its spacing) plus the track-in
	   travel at both ends (--tr × the outer letters' offset) fits between 18 px gutters at any
	   width — 390 px wide: ≈ 42 px type, 26 css px */
	.pw.mob .ttl { --tr: .12em; font-size: min(48px, calc((100vw - 36px) / var(--z) / (var(--n) * .74 + 1.8))); }
	.pw.mob .rule { left: -280px; width: 560px; }

	@media (prefers-reduced-motion: reduce) {
		.pw, .pw * { animation: none !important; }
	}
</style>
