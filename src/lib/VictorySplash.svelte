<script lang="ts">
	// GAME OVER — three looks (being chosen), all viewer-relative: VICTORY (you won) ·
	// DEFEAT (you lost) · "<Team> wins" (spectators).
	//  · 'shatter' — the losing team's throne crystal shakes, cracks and bursts into shards;
	//                a gilded, winged plaque slams down; embers drift up   (LoL's Nexus)
	//  · 'hall'    — cinematic letterbox, god-rays in the winners' colour, the winning heroes'
	//                art panels march in under "Orange · Victorious"        (Dota / Smite)
	//  · 'stamp'   — a colour slash rips across, the title slams together from three slices
	//                with a glitch, then a scoreboard strip: both rosters, Life, waves (Valorant)
	import { heroById, heroSplash, heroAvatar } from '$lib/heroes';
	import type { Team } from '$lib/match';

	type Hero = { pid: string; hero: string; name: string };
	export let variant: 'shatter' | 'hall' | 'stamp' = 'shatter';
	export let team: Team; // the winning team
	export let reason = '';
	export let winners: Hero[] = [];
	export let losers: Hero[] = [];
	export let myTeam: Team | null = null; // null = spectator
	export let me = '';
	export let life: Record<Team, number> = { orange: 0, blue: 0 };
	export let waves = 0;
	export let round = 1;
	export let mobile = false;
	export let onClose: () => void = () => {};

	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
	$: loser = (team === 'orange' ? 'blue' : 'orange') as Team;
	$: lost = myTeam != null && myTeam !== team;
	$: title = myTeam == null ? `${cap(team)} wins` : lost ? 'Defeat' : 'Victory';
	$: line = /^(orange|blue)\b/i.test(reason) ? reason : `${cap(team)} ${reason}`;
	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	const L: Record<Team, string> = { orange: '#ffb27a', blue: '#8cc0ff' };
	// crystal facets: 8 wedges of an octagonal gem, each with its own shade + flight path
	const GEM = [[50, 0], [85, 18], [100, 50], [85, 82], [50, 100], [15, 82], [0, 50], [15, 18]];
	$: shards = GEM.map((p, i) => {
		const q = GEM[(i + 1) % GEM.length];
		const mx = (p[0] + q[0]) / 2 - 50, my = (p[1] + q[1]) / 2 - 50;
		return { poly: `50% 50%, ${p[0]}% ${p[1]}%, ${q[0]}% ${q[1]}%`, dx: mx * 9, dy: my * 9, r: (i % 2 ? 1 : -1) * (120 + i * 25), shade: [1, .78, .62, .5, .58, .7, .86, .95][i] };
	});
	const EMBERS = Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % 100, d: (i * 0.23) % 3, s: 3 + (i % 4) * 2, t: 4 + (i % 5) }));
	$: allHeroes = (t: Team) => (t === team ? winners : losers);
</script>

<div class="vs v-{variant}" class:lost class:mob={mobile} style="--wc:{C[team]}; --wl:{L[team]}; --lc:{C[loser]}; --ll:{L[loser]}" role="dialog" aria-label="Game over">
	{#if variant === 'shatter'}
		<div class="bg"></div>
		<div class="flash"></div>
		<div class="gemw">
			<div class="gem">
				{#each shards as s, i (i)}
					<div class="shard" style="clip-path: polygon({s.poly}); --dx:{s.dx}px; --dy:{s.dy}px; --r:{s.r}deg; --sh:{s.shade}"></div>
				{/each}
				<div class="core"></div>
			</div>
			<div class="ring r1"></div><div class="ring r2"></div>
		</div>
		<div class="plaque">
			<svg class="wing l" viewBox="0 0 200 120" aria-hidden="true"><path d="M200 60 C150 20 90 6 0 0 C40 18 70 30 92 44 C60 40 32 42 6 50 C44 56 76 62 100 70 C72 72 46 80 22 96 C70 88 120 84 200 80 Z" /></svg>
			<div class="plate"><span class="ttl">{title}</span></div>
			<svg class="wing r" viewBox="0 0 200 120" aria-hidden="true"><path d="M200 60 C150 20 90 6 0 0 C40 18 70 30 92 44 C60 40 32 42 6 50 C44 56 76 62 100 70 C72 72 46 80 22 96 C70 88 120 84 200 80 Z" /></svg>
		</div>
		<div class="under">
			<span class="why">{line}</span>
			<div class="crew">{#each winners as h (h.pid)}<span class="pc" class:me={h.pid === me}><img src={heroAvatar(h.hero)} alt="" /><em>{h.name}</em></span>{/each}</div>
		</div>
		<div class="embers">{#each EMBERS as e, i (i)}<i style="left:{e.x}%; --d:{e.d}s; --s:{e.s}px; --t:{e.t}s"></i>{/each}</div>
	{:else if variant === 'hall'}
		<div class="bg"></div>
		<div class="rays"></div>
		<div class="bar top"></div><div class="bar bot"></div>
		<div class="htitle">
			<span class="teamline">{lost ? `The ${cap(team)} team is victorious` : `The ${cap(team)} team`}</span>
			<span class="ttl">{lost ? 'Defeat' : myTeam == null ? 'Victorious' : 'Victory'}</span>
			<span class="sweep"></span>
		</div>
		<div class="panels">
			{#each winners as h, i (h.pid)}
				<div class="panel" style="--i:{i}">
					<div class="pin"><img src={heroSplash(h.hero)} alt="" /></div>
					<div class="ptag"><b>{heroById(h.hero)?.name ?? ''}</b><em class:me={h.pid === me}>{h.name}</em></div>
				</div>
			{/each}
		</div>
		<span class="why hwhy">{line}</span>
	{:else}
		<div class="bg"></div>
		<div class="flash"></div>
		<div class="slash"></div>
		<div class="stampw">
			{#each [0, 1, 2] as k (k)}<span class="ttl slice s{k}" aria-hidden={k > 0}>{title}</span>{/each}
		</div>
		<span class="why swhy">{line}</span>
		<div class="board">
			{#each [loser, team] as t, side (t)}
				{#if side === 1}
					<div class="score">
						<div class="sc"><span class="lbl">Life</span><b><i style="color:{L.orange}">{life.orange}</i> : <i style="color:{L.blue}">{life.blue}</i></b></div>
						<div class="sc"><span class="lbl">Waves left</span><b>{waves}</b></div>
						<div class="sc"><span class="lbl">Round</span><b>{round}</b></div>
					</div>
				{/if}
				<div class="roster" class:win={t === team} style="--tc:{C[t as Team]}; --tl:{L[t as Team]}">
					<span class="rt">{cap(t)}{t === team ? ' · Winner' : ''}</span>
					<div class="ppl">{#each allHeroes(t as Team) as h (h.pid)}<span class="pc" class:me={h.pid === me}><img src={heroAvatar(h.hero)} alt="" /><em>{h.name}</em></span>{/each}</div>
				</div>
			{/each}
		</div>
	{/if}
	<div class="foot"><button class="close" on:click={onClose}>View the board</button></div>
</div>

<style>
	.vs { position: fixed; inset: 0; z-index: 70; overflow: hidden; color: #f6ead2; display: flex; flex-direction: column; align-items: center; }
	.bg { position: absolute; inset: 0; background: radial-gradient(110% 90% at 50% 45%, rgba(14, 12, 22, .88), rgba(3, 4, 8, .97)); animation: fade .5s ease both; }
	.lost .bg { background: radial-gradient(110% 90% at 50% 45%, rgba(16, 16, 20, .9), rgba(2, 2, 4, .98)); }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes up { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
	.why { position: relative; font-size: 1.1rem; letter-spacing: .12em; color: #f0dcae; text-align: center; }
	.foot { position: absolute; left: 0; right: 0; bottom: 4vh; display: grid; place-items: center; z-index: 5; }
	.close { font: inherit; font-size: 1.05rem; padding: .7rem 2rem; border-radius: 12px; cursor: pointer; color: #fff; letter-spacing: .05em; zoom: var(--uis, 1);
		background: color-mix(in srgb, var(--wc) 70%, #000); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); animation: up .5s ease 3.2s both; }
	.close:hover { filter: brightness(1.12); }
	.pc { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.pc img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 3px solid var(--wc); box-shadow: 0 0 14px color-mix(in srgb, var(--wc) 60%, transparent); }
	.pc em { font-style: normal; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: #e5e7eb; }
	.pc.me em { color: #fff3d6; }

	/* ═════════ A · THRONE SHATTER ═════════ */
	.v-shatter .flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 3; pointer-events: none; animation: whiteout .9s ease-out 1.35s forwards; }
	@keyframes whiteout { 0% { opacity: .95; } 100% { opacity: 0; } }
	.gemw { position: absolute; left: 50%; top: 40%; width: 220px; height: 220px; margin: -110px 0 0 -110px; zoom: var(--uis, 1); }
	.gem { position: absolute; inset: 0; animation: gemIn .5s cubic-bezier(.3, 1.4, .5, 1) both, quake 1s linear .35s both; filter: drop-shadow(0 0 24px var(--lc)); }
	@keyframes gemIn { from { opacity: 0; scale: .3; } to { opacity: 1; scale: 1; } }
	@keyframes quake { 0%, 100% { translate: 0 0; } 10% { translate: -2px 1px; } 20% { translate: 3px -2px; } 30% { translate: -4px 2px; } 40% { translate: 4px 1px; }
		50% { translate: -5px -2px; } 60% { translate: 6px 2px; } 70% { translate: -6px 1px; } 80% { translate: 7px -3px; } 90% { translate: -8px 2px; } }
	.shard { position: absolute; inset: 0; background: linear-gradient(160deg, color-mix(in srgb, var(--ll) calc(var(--sh) * 100%), #fff), color-mix(in srgb, var(--lc) calc(var(--sh) * 100%), #000));
		animation: crack 1.4s linear both, burst 1.1s cubic-bezier(.2, .7, .3, 1) 1.35s both; }
	@keyframes crack { 0% { filter: brightness(1); } 80% { filter: brightness(1.5); } 100% { filter: brightness(2.2); } }
	@keyframes burst { from { transform: none; opacity: 1; } to { transform: translate(var(--dx), var(--dy)) rotate(var(--r)) scale(.6); opacity: 0; } }
	.core { position: absolute; inset: 35%; border-radius: 50%; background: radial-gradient(circle, #fff, rgba(255, 255, 255, 0) 70%); opacity: 0; animation: coreGlow 1.4s ease-in both; }
	@keyframes coreGlow { 0%, 30% { opacity: 0; scale: .5; } 100% { opacity: 1; scale: 2.2; } }
	.ring { position: absolute; inset: 0; border-radius: 50%; border: 6px solid #fff; opacity: 0; }
	.ring.r1 { animation: ring 1s ease-out 1.35s both; } .ring.r2 { border-color: var(--wl); animation: ring 1.3s ease-out 1.5s both; }
	@keyframes ring { from { opacity: .9; scale: .3; } to { opacity: 0; scale: 5; border-width: 1px; } }
	.plaque { position: absolute; left: 50%; top: 40%; translate: -50% -50%; zoom: var(--uis, 1); display: flex; align-items: center; z-index: 4; animation: plaque .6s cubic-bezier(.2, 1.5, .4, 1) 1.55s both; }
	@keyframes plaque { from { opacity: 0; scale: 2.6; filter: blur(8px); } to { opacity: 1; scale: 1; filter: none; } }
	.wing { width: 190px; height: 114px; fill: #d9a845; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .6)); }
	.wing.r { transform: scaleX(-1); }
	.wing.l { margin-right: -20px; } .wing.r { margin-left: -20px; }
	.lost .wing { fill: #6b7280; }
	.plate { position: relative; padding: 18px 46px 22px; clip-path: polygon(6% 0, 94% 0, 100% 50%, 94% 100%, 6% 100%, 0 50%);
		background: linear-gradient(180deg, #ffe9b0, #d9a845 45%, #8a5d17); }
	.plate::before { content: ''; position: absolute; inset: 5px; clip-path: inherit; background: linear-gradient(180deg, #1b1430, #0b0818); }
	.lost .plate { background: linear-gradient(180deg, #e5e7eb, #8b93a1 45%, #3b414c); }
	.plate .ttl { position: relative; display: block; font-size: 5.6rem; line-height: 1; letter-spacing: .06em; text-transform: uppercase;
		background: linear-gradient(180deg, #fff6d8 10%, #f0c86a 55%, #b9832f 90%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .6)) drop-shadow(0 0 20px var(--wc)); }
	.lost .plate .ttl { background: linear-gradient(180deg, #f3f4f6 10%, #a9b0bb 55%, #5b616c 90%); -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 3px 0 rgba(0, 0, 0, .6)) drop-shadow(0 0 20px #7f1d1d); }
	.under { position: absolute; left: 0; right: 0; top: 58%; display: flex; flex-direction: column; align-items: center; gap: 16px; zoom: var(--uis, 1); z-index: 4; animation: up .5s ease 2.2s both; }
	.crew { display: flex; gap: 18px; }
	.embers { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
	.embers i { position: absolute; bottom: -10px; width: var(--s); height: var(--s); border-radius: 50%; background: #ffd27a; box-shadow: 0 0 10px #ffb84a; opacity: 0;
		animation: ember var(--t) linear calc(1.6s + var(--d)) infinite; }
	.lost .embers i { background: #9ca3af; box-shadow: none; }
	@keyframes ember { 0% { opacity: 0; translate: 0 0; } 10% { opacity: .9; } 100% { opacity: 0; translate: 30px -105vh; } }

	/* ═════════ B · HALL OF HEROES ═════════ */
	.v-hall .rays { position: absolute; left: 50%; top: -20%; width: 1800px; height: 1800px; margin-left: -900px; pointer-events: none; opacity: 0;
		background: conic-gradient(from 160deg at 50% 0%, transparent 0deg, color-mix(in srgb, var(--wc) 35%, transparent) 8deg, transparent 14deg, color-mix(in srgb, var(--wc) 25%, transparent) 22deg, transparent 30deg, color-mix(in srgb, var(--wc) 30%, transparent) 36deg, transparent 44deg);
		mask-image: linear-gradient(180deg, #000 20%, transparent 70%); -webkit-mask-image: linear-gradient(180deg, #000 20%, transparent 70%); animation: fade 1.5s ease .5s forwards; }
	.lost.v-hall .rays { filter: grayscale(1) brightness(.6); }
	.bar { position: absolute; left: 0; right: 0; height: 11vh; background: #000; z-index: 3; }
	.bar.top { top: 0; animation: barT .6s cubic-bezier(.3, .9, .3, 1) both; } .bar.bot { bottom: 0; animation: barB .6s cubic-bezier(.3, .9, .3, 1) both; }
	@keyframes barT { from { translate: 0 -100%; } } @keyframes barB { from { translate: 0 100%; } }
	.htitle { position: relative; z-index: 4; margin-top: 12.5vh; display: flex; flex-direction: column; align-items: center; zoom: var(--uis, 1); overflow: hidden; padding: 0 30px; }
	.teamline { font-size: 1.05rem; letter-spacing: .5em; text-transform: uppercase; color: var(--wl); animation: up .5s ease .5s both; }
	.htitle .ttl { font-size: 5rem; line-height: 1; letter-spacing: .12em; text-transform: uppercase; color: #fff3d6; text-shadow: 0 4px 0 rgba(0, 0, 0, .6), 0 0 34px var(--wc);
		animation: spread .9s cubic-bezier(.2, .8, .3, 1) .7s both; }
	.lost .htitle .ttl { color: #c9ced6; text-shadow: 0 4px 0 rgba(0, 0, 0, .6), 0 0 30px rgba(0, 0, 0, .9); }
	@keyframes spread { from { opacity: 0; letter-spacing: -.1em; filter: blur(6px); } to { opacity: 1; letter-spacing: .12em; filter: none; } }
	.sweep { position: absolute; top: 0; bottom: 0; width: 120px; left: -160px; background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .55), transparent); transform: skewX(-20deg); animation: sweep 1.1s ease-in-out 1.6s both; }
	@keyframes sweep { to { left: 110%; } }
	.panels { position: relative; z-index: 2; flex: 1; width: 100%; display: flex; justify-content: center; align-items: center; gap: 1.2vw; padding-bottom: 14vh; }
	.panel { width: min(16vw, 230px); height: 48vh; transform: skewX(-10deg); opacity: 0; animation: march .7s cubic-bezier(.2, .9, .3, 1) calc(1.1s + var(--i) * .18s) both; display: flex; flex-direction: column; gap: 8px; }
	@keyframes march { from { opacity: 0; translate: 0 60px; filter: brightness(3) blur(4px); } to { opacity: 1; translate: 0 0; filter: none; } }
	.pin { flex: 1; overflow: hidden; border: 2px solid var(--wl); box-shadow: 0 0 26px color-mix(in srgb, var(--wc) 55%, transparent), 0 16px 40px rgba(0, 0, 0, .7); }
	.pin img { width: 140%; height: 100%; margin-left: -20%; object-fit: cover; object-position: center 22%; transform: skewX(10deg); display: block; }
	.lost .pin img { filter: saturate(.75); }
	.ptag { transform: skewX(10deg); display: flex; flex-direction: column; align-items: center; }
	.ptag b { font-weight: normal; font-size: 1.4rem; color: #fff3d6; text-shadow: 0 2px 6px #000; }
	.ptag em { font-style: normal; font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--wl); }
	.ptag em.me { color: #fff; }
	.hwhy { position: absolute; bottom: 12.5vh; z-index: 4; zoom: var(--uis, 1); animation: up .5s ease 2s both; }
	.v-hall .foot { bottom: 2.5vh; }

	/* ═════════ C · IMPACT STAMP ═════════ */
	.v-stamp .flash { position: absolute; inset: 0; background: var(--wl); opacity: 0; animation: whiteout .6s ease-out .55s forwards; z-index: 1; }
	.slash { position: absolute; left: -10%; right: -10%; top: 34%; height: 180px; z-index: 1;
		background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--wc) 85%, #000) 15%, var(--wc) 50%, color-mix(in srgb, var(--wc) 85%, #000) 85%, transparent);
		transform: skewY(-6deg); animation: slash .45s cubic-bezier(.3, .9, .3, 1) .15s both; }
	.lost .slash { background: linear-gradient(90deg, transparent, #3a0d0d 15%, #7f1d1d 50%, #3a0d0d 85%, transparent); }
	@keyframes slash { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
	.stampw { position: absolute; top: 34%; left: 0; right: 0; height: 180px; display: grid; place-items: center; z-index: 2; transform: skewY(-6deg); zoom: var(--uis, 1); animation: thump .25s ease .75s both; }
	@keyframes thump { 0% { scale: 1.08; } 100% { scale: 1; } }
	.slice { grid-area: 1 / 1; font-size: 7.4rem; line-height: 1; letter-spacing: .04em; text-transform: uppercase; color: #fff; transform: skewY(6deg);
		text-shadow: 0 6px 0 rgba(0, 0, 0, .45), 0 0 40px rgba(0, 0, 0, .5); }
	.slice.s0 { clip-path: inset(0 0 66% 0); animation: sliceL .45s cubic-bezier(.2, .9, .3, 1) .35s both, glitch .5s steps(2) .8s both; }
	.slice.s1 { clip-path: inset(34% 0 33% 0); animation: sliceR .45s cubic-bezier(.2, .9, .3, 1) .42s both, glitch .5s steps(2) .85s both; }
	.slice.s2 { clip-path: inset(67% 0 0 0); animation: sliceL .45s cubic-bezier(.2, .9, .3, 1) .49s both, glitch .5s steps(2) .9s both; }
	@keyframes sliceL { from { translate: -120vw 0; filter: blur(12px); } to { translate: 0 0; filter: none; } }
	@keyframes sliceR { from { translate: 120vw 0; filter: blur(12px); } to { translate: 0 0; filter: none; } }
	@keyframes glitch { 0% { text-shadow: -6px 0 #ff2d55, 6px 0 #22d3ee, 0 6px 0 rgba(0, 0, 0, .45); } 50% { text-shadow: 4px 0 #ff2d55, -4px 0 #22d3ee, 0 6px 0 rgba(0, 0, 0, .45); } 100% { text-shadow: 0 6px 0 rgba(0, 0, 0, .45), 0 0 40px rgba(0, 0, 0, .5); } }
	.swhy { position: absolute; top: calc(34% + 200px); z-index: 2; zoom: var(--uis, 1); animation: up .4s ease 1.1s both; }
	.board { position: absolute; left: 50%; bottom: 14vh; translate: -50% 0; z-index: 2; zoom: var(--uis, 1); display: flex; align-items: stretch; gap: 0;
		border-radius: 14px; overflow: hidden; background: rgba(9, 13, 22, .92); border: 1px solid rgba(255, 255, 255, .14); box-shadow: 0 18px 40px rgba(0, 0, 0, .6); animation: rise .55s cubic-bezier(.2, .9, .3, 1) 1.4s both; }
	@keyframes rise { from { opacity: 0; translate: -50% 60px; } to { opacity: 1; translate: -50% 0; } }
	.roster { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 22px; background: linear-gradient(180deg, color-mix(in srgb, var(--tc) 22%, transparent), transparent); }
	.roster:not(.win) { filter: grayscale(.85) brightness(.7); }
	.rt { font-size: .8rem; letter-spacing: .28em; text-transform: uppercase; color: var(--tl); }
	.ppl { display: flex; gap: 14px; }
	.roster .pc img { border-color: var(--tc); box-shadow: 0 0 12px color-mix(in srgb, var(--tc) 55%, transparent); width: 52px; height: 52px; }
	.score { display: flex; gap: 22px; align-items: center; padding: 0 26px; border-left: 1px solid rgba(255, 255, 255, .1); border-right: 1px solid rgba(255, 255, 255, .1); }
	.sc { display: flex; flex-direction: column; align-items: center; gap: 2px; }
	.sc .lbl { font-size: .62rem; letter-spacing: .2em; text-transform: uppercase; color: #8b9bb0; }
	.sc b { font-weight: normal; font-size: 1.7rem; color: #fff; } .sc b i { font-style: normal; }

	/* phones */
	.mob .plate .ttl { font-size: 3rem; } .mob .wing { width: 80px; height: 48px; } .mob .plate { padding: 10px 24px 12px; }
	.mob .gemw { zoom: .6; } .mob .pc img { width: 40px; height: 40px; } .mob .crew { gap: 8px; }
	.mob .htitle .ttl { font-size: 2.8rem; } .mob .teamline { font-size: .62rem; letter-spacing: .3em; } .mob .panel { width: 21vw; height: 38vh; } .mob .ptag b { font-size: .85rem; }
	.mob .slice { font-size: 3.4rem; } .mob .slash, .mob .stampw { height: 110px; } .mob .swhy { top: calc(34% + 120px); font-size: .8rem; }
	.mob .board { flex-direction: column; width: 92vw; } .mob .score { border: none; padding: 8px; justify-content: center; } .mob .roster { padding: 8px; }
	.mob .why { font-size: .8rem; }
</style>
