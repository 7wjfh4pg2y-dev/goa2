<script lang="ts">
	// GAME OVER — three thematic looks (being chosen), all viewer-relative: VICTORY (you won) ·
	// DEFEAT (you lost) · "<Team> wins" (spectators). Team emblems = the tie-breaker coins
	// (orange gear / blue star), team hearts = the Life counters (front whole, back broken).
	//  · 'gates' — THE GATES: two great bronze-bound doors sealed with the winners' emblem.
	//              Victory: light bleeds through the seam, the seal splits, the doors swing open
	//              on a lit hall where the winning heroes stand. Defeat: you glimpse the enemy's
	//              hall, then the doors SLAM shut on you (dust, shake) and a crossbar drops.
	//  · 'tide'  — THE TIDE (Atlantis): the losers' heart crystal cracks, the sea surges up and
	//              swallows it, then the winners' emblem rises spinning out of the water.
	//  · 'scroll'— THE DECREE: a scroll unrolls, the title is inked with an illuminated capital,
	//              the victors are listed and a wax seal stamps it. Defeat: then it burns.
	import { heroById, heroSplash, heroAvatar } from '$lib/heroes';
	import type { Team } from '$lib/match';
	import tieOrange from '$lib/images/tiebreaker_orange.png';
	import tieBlue from '$lib/images/tiebreaker_blue.png';

	type Hero = { pid: string; hero: string; name: string };
	export let variant: 'gates' | 'tide' | 'scroll' = 'gates';
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
	const EMBLEM: Record<Team, string> = { orange: tieOrange, blue: tieBlue };
	const lifeImgs = import.meta.glob('./cards/images/life_counter_*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const heart = (t: Team, side: 'front' | 'back') => lifeImgs[`./cards/images/life_counter_${t}_${side}.png`] ?? '';
	$: loser = (team === 'orange' ? 'blue' : 'orange') as Team;
	$: lost = myTeam != null && myTeam !== team;
	$: title = myTeam == null ? `${cap(team)} wins` : lost ? 'Defeat' : 'Victory';
	$: line = /^(orange|blue)\b/i.test(reason) ? reason : `${cap(team)} ${reason}`;
	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	const L: Record<Team, string> = { orange: '#ffb27a', blue: '#8cc0ff' };
	const D: Record<Team, string> = { orange: '#6b2d06', blue: '#0f2f63' };

	// particles (fixed pseudo-random spreads so every client sees the same thing)
	const MOTES = Array.from({ length: 34 }, (_, i) => ({ x: (i * 29 + 7) % 100, y: (i * 47 + 13) % 90, d: (i * 0.37) % 4, s: 2 + (i % 3), t: 6 + (i % 5) }));
	const DUST = Array.from({ length: 30 }, (_, i) => {
		const a = (i / 30) * Math.PI * 2;
		return { x: Math.cos(a) * (120 + (i % 5) * 50), y: Math.sin(a) * (60 + (i % 4) * 40) - 20, s: 10 + (i % 4) * 8, d: (i % 6) * 0.02 };
	});
	const BUBBLES = Array.from({ length: 22 }, (_, i) => ({ x: ((i * 37) % 120) - 60, d: (i * 0.11) % 1.6, s: 4 + (i % 4) * 3, t: 1.4 + (i % 3) * 0.5 }));
	const DROPS = Array.from({ length: 16 }, (_, i) => ({ x: ((i * 53) % 220) - 110, h: 60 + ((i * 31) % 90), d: (i % 5) * 0.03, s: 4 + (i % 3) * 2 }));
	const SPARKS = Array.from({ length: 26 }, (_, i) => ({ x: (i * 41 + 5) % 100, d: (i * 0.29) % 2.4, t: 1.6 + (i % 4) * 0.4, s: 2 + (i % 3) }));
	// a seamless wave crest (period λ, 3200 wide = 2 screens) — filled below, or just the line
	function wave(amp: number, lambda: number, fill = true) {
		let d = `M0 50 Q ${lambda / 4} ${50 - amp} ${lambda / 2} 50`;
		for (let x = lambda; x <= 3200; x += lambda / 2) d += ` T ${x} 50`;
		return fill ? d + ' L 3200 100 L 0 100 Z' : d;
	}
	const W1 = wave(44, 400), W1L = wave(44, 400, false), W2 = wave(56, 640), W3 = wave(40, 320);
</script>

<div class="vs v-{variant}" class:lost class:spec={myTeam == null} class:mob={mobile}
	style="--wc:{C[team]}; --wl:{L[team]}; --wd:{D[team]}; --lc:{C[loser]}; --ll:{L[loser]}" role="dialog" aria-label="Game over">
	{#if variant === 'gates'}
		<!-- ═════════ THE GATES ═════════ -->
		<div class="bg"></div>
		<div class="hall">
			<div class="glow"></div>
			<div class="rays"></div>
			<div class="pillar l"></div><div class="pillar r"></div>
			<div class="heroes">
				{#each winners as h, i (h.pid)}
					<div class="hz" style="--i:{i}">
						<img src={heroSplash(h.hero)} alt="" />
						<span class="hn"><b>{heroById(h.hero)?.name ?? ''}</b><em class:me={h.pid === me}>{h.name}</em></span>
					</div>
				{/each}
			</div>
			<div class="floor"></div>
			<div class="motes">{#each MOTES as m, i (i)}<i style="left:{m.x}%; top:{m.y}%; --d:{m.d}s; --s:{m.s}px; --t:{m.t}s"></i>{/each}</div>
		</div>
		<div class="gate">
			<div class="door l"><span class="band b1"></span><span class="band b2"></span><span class="ring"></span><div class="gseal"><img src={EMBLEM[team]} alt="" /></div></div>
			<div class="door r"><span class="band b1"></span><span class="band b2"></span><span class="ring"></span><div class="gseal"><img src={EMBLEM[team]} alt="" /></div></div>
			<div class="seam"></div>
			{#if lost}
				<div class="bar"><i></i><i></i></div>
				<div class="dust">{#each DUST as p, i (i)}<i style="--x:{p.x}px; --y:{p.y}px; --s:{p.s}px; --d:{p.d}s"></i>{/each}</div>
			{/if}
		</div>
		<div class="gtitle">
			<span class="ttl">{title}</span>
			<span class="why">{line}</span>
		</div>
		{#if lost}<div class="fallen">{#each losers as h (h.pid)}<span class="pc" class:me={h.pid === me}><img src={heroAvatar(h.hero)} alt="" /><em>{h.name}</em></span>{/each}</div>{/if}
	{:else if variant === 'tide'}
		<!-- ═════════ THE TIDE ═════════ -->
		<div class="bg"></div>
		<div class="stars"></div>
		<div class="rays"></div>
		<div class="heart">
			<img class="hf" src={heart(loser, 'front')} alt="" />
			<img class="hb" src={heart(loser, 'back')} alt="" />
			<span class="crack"></span>
		</div>
		<div class="bubbles">{#each BUBBLES as b, i (i)}<i style="--x:{b.x}px; --d:{b.d}s; --s:{b.s}px; --t:{b.t}s"></i>{/each}</div>
		<div class="coin"><div class="spin"><img src={EMBLEM[team]} alt="" /></div></div>
		<div class="sea">
			<svg class="wv w3" viewBox="0 0 3200 100" preserveAspectRatio="none" aria-hidden="true"><path d={W3} /></svg>
			<svg class="wv w2" viewBox="0 0 3200 100" preserveAspectRatio="none" aria-hidden="true"><path d={W2} /></svg>
			<svg class="wv w1" viewBox="0 0 3200 100" preserveAspectRatio="none" aria-hidden="true"><path d={W1} /><path class="foam" d={W1L} /></svg>
			<div class="deep"></div>
			<div class="shine"></div>
		</div>
		<div class="splash"><span class="sring"></span>{#each DROPS as p, i (i)}<i style="--x:{p.x}px; --h:{p.h}px; --d:{p.d}s; --s:{p.s}px"></i>{/each}</div>
		<div class="ttitle"><span class="ttl">{title}</span></div>
		<div class="float">
			{#each winners as h, i (h.pid)}<span class="pc" class:me={h.pid === me} style="--i:{i}"><img src={heroAvatar(h.hero)} alt="" /><em>{h.name}</em></span>{/each}
		</div>
		<span class="why twhy">{line}</span>
	{:else}
		<!-- ═════════ THE DECREE ═════════ -->
		<div class="bg"></div>
		<div class="candle"></div>
		<div class="stage">
			<div class="scroll">
				<div class="rod top"></div>
				<div class="paper">
					<div class="inner">
						<span class="decree">Let it be known</span>
						<span class="ttl"><span class="ill">{title[0]}</span><span class="ink">{title.slice(1)}</span></span>
						<span class="why">{line}</span>
						<svg class="flourish" viewBox="0 0 400 24" aria-hidden="true"><path d="M10 12 C60 2 100 22 150 12 S 190 4 200 12 S 240 22 250 12 S 340 2 390 12" /><circle cx="200" cy="12" r="4" /></svg>
						<span class="victors">{lost ? 'The victors' : myTeam == null ? `The ${cap(team)} champions` : 'Your champions'}</span>
						<div class="names">
							{#each winners as h, i (h.pid)}
								<span class="nm" class:me={h.pid === me} style="--i:{i}"><img src={heroAvatar(h.hero)} alt="" /><b>{heroById(h.hero)?.name ?? ''}</b><em>{h.name}</em></span>
							{/each}
						</div>
						<span class="stats">Round {round} · Life {life.orange} : {life.blue} · {waves} wave{waves === 1 ? '' : 's'} left</span>
					</div>
					{#if lost}<div class="char"></div><div class="flame"></div>{/if}
					<div class="wseal">
						<span class="tail a"></span><span class="tail b"></span>
						<div class="wax"><img src={EMBLEM[team]} alt="" /></div>
					</div>
				</div>
				<div class="rod bot"></div>
			</div>
		</div>
		{#if lost}<div class="sparks">{#each SPARKS as s, i (i)}<i style="left:{s.x}%; --d:{s.d}s; --t:{s.t}s; --s:{s.s}px"></i>{/each}</div>{/if}
	{/if}
	<div class="foot"><button class="close" on:click={onClose}>View the board</button></div>
</div>

<style>
	.vs { position: fixed; inset: 0; z-index: 70; overflow: hidden; color: #f6ead2; --z: var(--uis, 1); }
	.vs.mob { --z: 1; }
	/* zoom also scales an element's own vh insets, so every zoomed + vh-positioned box divides by --z */
	.bg { position: absolute; inset: 0; animation: fade .5s ease both; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes up { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(2.2); filter: blur(8px); } to { opacity: 1; transform: scale(1); filter: blur(0); } }
	.why { position: relative; font-size: 1.1rem; letter-spacing: .12em; color: #f0dcae; text-align: center; text-shadow: 0 2px 8px #000; }
	.foot { position: absolute; left: 0; right: 0; bottom: 4vh; display: grid; place-items: center; z-index: 20; }
	.close { font: inherit; font-size: 1.05rem; padding: .7rem 2rem; border-radius: 12px; cursor: pointer; color: #fff; letter-spacing: .05em; zoom: var(--uis, 1);
		background: color-mix(in srgb, var(--wc) 70%, #000); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); animation: up .5s ease var(--cd, 3.4s) both; }
	.close:hover { filter: brightness(1.12); }
	.pc { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.pc img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 3px solid var(--wc); box-shadow: 0 0 14px color-mix(in srgb, var(--wc) 60%, transparent); }
	.pc em { font-style: normal; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: #e5e7eb; }
	.pc.me em { color: #fff3d6; }
	/* the big engraved title: gold for the winners, cold stone for the defeated */
	.ttl { display: block; font-size: 6rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .65)) drop-shadow(0 0 26px var(--wc)); }
	.lost .ttl { background: linear-gradient(180deg, #f1f2f4 8%, #a3a9b3 50%, #4b5059 92%); -webkit-background-clip: text; background-clip: text;
		filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .7)) drop-shadow(0 0 26px #7f1d1d); }

	/* ═════════ THE GATES ═════════ */
	.v-gates { --cd: 3.4s; }
	.v-gates.lost { --cd: 2.6s; }
	.v-gates .bg { background: #05060a; }
	.hall { position: absolute; inset: 0; overflow: hidden;
		background: radial-gradient(70% 60% at 50% 62%, color-mix(in srgb, var(--wc) 40%, #1a120a), #0b0906 75%); }
	.hall .glow { position: absolute; left: 50%; top: 58%; width: 1200px; height: 900px; margin: -450px 0 0 -600px; border-radius: 50%;
		background: radial-gradient(closest-side, rgba(255, 244, 214, .9), color-mix(in srgb, var(--wc) 55%, transparent) 45%, transparent);
		animation: hallLit 1.4s ease 1.5s both; }
	.lost .hall .glow { animation: none; }
	@keyframes hallLit { from { opacity: 0; scale: .5; } to { opacity: 1; scale: 1; } }
	.hall .rays { position: absolute; left: 50%; top: -30%; width: 2400px; height: 2400px; margin-left: -1200px; opacity: .55;
		background: repeating-conic-gradient(from 0deg at 50% 0%, rgba(255, 236, 190, .22) 0deg 3deg, transparent 3deg 9deg);
		mask-image: radial-gradient(closest-side at 50% 0%, #000 30%, transparent 75%); -webkit-mask-image: radial-gradient(closest-side at 50% 0%, #000 30%, transparent 75%);
		animation: rayTurn 30s linear infinite; }
	@keyframes rayTurn { from { rotate: -6deg; } 50% { rotate: 6deg; } to { rotate: -6deg; } }
	.pillar { position: absolute; top: 0; bottom: 0; width: 9vw; background:
		repeating-linear-gradient(90deg, rgba(0, 0, 0, .35) 0 6px, transparent 6px 22px),
		linear-gradient(90deg, #2a2016, #6d5a40 45%, #3a2d1e); box-shadow: 0 0 60px rgba(0, 0, 0, .9); }
	.pillar.l { left: 8vw; } .pillar.r { right: 8vw; }
	.floor { position: absolute; left: 0; right: 0; bottom: 0; height: 26vh; background: linear-gradient(180deg, transparent, rgba(0, 0, 0, .75)); }
	.heroes { position: absolute; left: 0; right: 0; top: 24vh; bottom: 14vh; display: flex; justify-content: center; align-items: flex-end; gap: 1vw; z-index: 1; }
	.hz { position: relative; width: min(17vw, 260px); height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
		animation: standIn 1s ease calc(2s + var(--i) * .16s) both; }
	.lost .hz { animation: none; }
	.hz img { position: absolute; inset: 0 0 34px; width: 100%; height: calc(100% - 34px); object-fit: cover; object-position: center 20%;
		mask-image: radial-gradient(60% 62% at 50% 38%, #000 58%, transparent 100%); -webkit-mask-image: radial-gradient(60% 62% at 50% 38%, #000 58%, transparent 100%); }
	@keyframes standIn { 0% { opacity: 0; translate: 0 30px; filter: brightness(0); } 40% { opacity: 1; filter: brightness(0) drop-shadow(0 0 12px var(--wl)); } 100% { opacity: 1; translate: 0 0; filter: brightness(1); } }
	.hn { position: relative; display: flex; flex-direction: column; align-items: center; zoom: var(--uis, 1); }
	.hn b { font-weight: normal; font-size: 1.35rem; color: #fff3d6; text-shadow: 0 2px 6px #000; }
	.hn em { font-style: normal; font-size: .72rem; letter-spacing: .14em; text-transform: uppercase; color: var(--wl); }
	.hn em.me { color: #fff; }
	.motes i { position: absolute; width: var(--s); height: var(--s); border-radius: 50%; background: #fff1c8; box-shadow: 0 0 6px #ffd27a; opacity: 0;
		animation: mote var(--t) ease-in-out calc(1.8s + var(--d)) infinite; }
	.lost .motes { display: none; }
	@keyframes mote { 0% { opacity: 0; translate: 0 0; } 30% { opacity: .9; } 100% { opacity: 0; translate: 40px -80px; } }

	/* the doors: dark wood planks, iron bands with rivets, a gilded seam; perspective swing */
	.gate { position: absolute; inset: 0; perspective: 2600px; z-index: 2; pointer-events: none; }
	.door { position: absolute; top: 0; bottom: 0; width: 50.1%; overflow: hidden;
		background:
			radial-gradient(90% 60% at 100% 50%, rgba(255, 214, 150, .10), transparent 60%),
			repeating-linear-gradient(90deg, rgba(0, 0, 0, .45) 0 3px, rgba(255, 255, 255, .03) 3px 5px, transparent 5px 92px),
			linear-gradient(180deg, #3d2615, #5c3c22 30%, #4a2f1a 70%, #2e1c0f);
		box-shadow: inset 0 0 140px rgba(0, 0, 0, .85); }
	.door.l { left: 0; transform-origin: left center; border-right: 8px solid #a77d32; }
	.door.r { right: 0; transform-origin: right center; border-left: 8px solid #a77d32; }
	.band { position: absolute; left: 0; right: 0; height: 58px;
		background: radial-gradient(circle at 36px 50%, #c9ccd2 0 5px, #2b2e33 6px 7px, transparent 8px) 0 0 / 72px 100% repeat-x,
			linear-gradient(180deg, #5c6168, #33363c 50%, #1c1e22); box-shadow: 0 6px 14px rgba(0, 0, 0, .6); }
	.band.b1 { top: 22%; } .band.b2 { bottom: 9%; }
	.ring { position: absolute; top: 62%; width: 70px; height: 70px; border-radius: 50%; border: 9px solid #6e7279; box-shadow: 0 6px 12px rgba(0, 0, 0, .7), inset 0 0 0 2px #2a2c30; }
	.door.l .ring { right: 120px; } .door.r .ring { left: 120px; }
	/* the seal straddles the seam: each door shows its half */
	.gseal { position: absolute; top: 50%; width: 300px; height: 300px; margin-top: -150px; border-radius: 50%; display: grid; place-items: center; zoom: var(--uis, 1);
		background: radial-gradient(circle, #f7d989, #b8862f 60%, #6b4a14); box-shadow: 0 0 0 6px #3a2810, 0 10px 30px rgba(0, 0, 0, .8); }
	.door.l .gseal { right: -150px; } .door.r .gseal { left: -150px; }
	.gseal img { width: 250px; height: 250px; }
	.seam { position: absolute; left: 50%; top: 0; bottom: 0; width: 6px; margin-left: -3px; opacity: 0;
		background: linear-gradient(180deg, transparent, #fff8e1 20%, #fff 50%, #fff8e1 80%, transparent);
		box-shadow: 0 0 30px 8px var(--wl), 0 0 90px 30px color-mix(in srgb, var(--wc) 60%, transparent); }
	/* victory: the seam bleeds light, the doors strain, then swing open */
	.v-gates:not(.lost) .seam { animation: seam 1.6s ease .5s both; }
	@keyframes seam { 0% { opacity: 0; } 60% { opacity: .7; } 85% { opacity: 1; } 100% { opacity: 0; } }
	.v-gates:not(.lost) .gseal { animation: sealGlow 1.2s ease .4s both; }
	@keyframes sealGlow { from { filter: brightness(1); } to { filter: brightness(1.35) drop-shadow(0 0 30px var(--wl)); } }
	.v-gates:not(.lost) .door.l { animation: strain .8s linear .7s, openL 1.7s cubic-bezier(.5, 0, .15, 1) 1.5s both; }
	.v-gates:not(.lost) .door.r { animation: strain .8s linear .7s reverse, openR 1.7s cubic-bezier(.5, 0, .15, 1) 1.5s both; }
	@keyframes strain { 0%, 100% { translate: 0 0; } 20% { translate: -3px 0; } 40% { translate: 2px 0; } 60% { translate: -4px 0; } 80% { translate: 3px 0; } }
	@keyframes openL { from { transform: rotateY(0); } to { transform: rotateY(87deg); } }
	@keyframes openR { from { transform: rotateY(0); } to { transform: rotateY(-87deg); } }
	/* defeat: the enemy's hall is open… then the doors slam shut on you */
	.lost .door.l { animation: shutL 1.25s cubic-bezier(.6, 0, .9, .6) .25s both; }
	.lost .door.r { animation: shutR 1.25s cubic-bezier(.6, 0, .9, .6) .25s both; }
	@keyframes shutL { 0%, 30% { transform: rotateY(80deg); } 88% { transform: rotateY(0); } 94% { transform: rotateY(4deg); } 100% { transform: rotateY(0); } }
	@keyframes shutR { 0%, 30% { transform: rotateY(-80deg); } 88% { transform: rotateY(0); } 94% { transform: rotateY(-4deg); } 100% { transform: rotateY(0); } }
	.lost .gate { animation: quake .5s linear 1.35s both; }
	@keyframes quake { 0%, 100% { translate: 0 0; } 15% { translate: -10px 6px; } 30% { translate: 9px -5px; } 45% { translate: -7px 4px; } 60% { translate: 5px -3px; } 80% { translate: -2px 1px; } }
	.lost .hall { animation: dim .4s ease 1.3s forwards; }
	@keyframes dim { to { filter: brightness(.2); } }
	.dust i { position: absolute; left: 50%; top: 92%; width: var(--s); height: var(--s); border-radius: 50%; opacity: 0;
		background: radial-gradient(circle, rgba(210, 190, 160, .7), transparent 70%); animation: dust 1.4s ease-out calc(1.35s + var(--d)) both; }
	@keyframes dust { 0% { opacity: .9; translate: 0 0; scale: .4; } 100% { opacity: 0; translate: var(--x) var(--y); scale: 3; } }
	.bar { position: absolute; left: 6%; right: 6%; top: 70%; height: 54px; border-radius: 8px; opacity: 0;
		background: linear-gradient(180deg, #8a9099, #4a4f57 45%, #24272c); box-shadow: 0 12px 26px rgba(0, 0, 0, .8), inset 0 2px 0 rgba(255, 255, 255, .3);
		animation: barDrop .45s cubic-bezier(.5, 0, .7, 1.4) 1.85s forwards; }
	.bar i { position: absolute; top: -26px; width: 46px; height: 106px; border-radius: 6px; background: linear-gradient(90deg, #3a3d42, #6b7078 50%, #2b2d31); box-shadow: 0 6px 14px rgba(0, 0, 0, .7); }
	.bar i:first-child { left: 14%; } .bar i:last-child { right: 14%; }
	@keyframes barDrop { from { opacity: 1; translate: 0 -60vh; } to { opacity: 1; translate: 0 0; } }
	.gtitle { position: absolute; left: 0; right: 0; top: calc(var(--t, 8vh) / var(--z)); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 8px; zoom: var(--z); }
	.v-gates:not(.lost) .ttl { animation: slam .55s cubic-bezier(.2, 1.4, .3, 1) 2.5s both; }
	.v-gates:not(.lost) .why { animation: up .5s ease 2.9s both; }
	.v-gates.lost .gtitle { --t: 3vh; }
	.v-gates.lost .ttl { animation: slam .5s cubic-bezier(.2, 1.4, .3, 1) 1.5s both; }
	.v-gates.lost .why { animation: up .5s ease 2s both; }
	.fallen { position: absolute; left: 0; right: 0; bottom: calc(var(--b, 12vh) / var(--z)); z-index: 5; display: flex; justify-content: center; gap: 16px; zoom: var(--z); animation: up .5s ease 2.2s both; }
	.fallen .pc em { text-shadow: 0 2px 4px #000; }
	.fallen .pc img { border-color: var(--lc); filter: grayscale(.85) brightness(.7); box-shadow: none; }

	/* ═════════ THE TIDE ═════════ */
	.v-tide { --cd: 3.9s; }
	.v-tide .bg { background: linear-gradient(180deg, #02040b, #071530 55%, #0c2a4a); }
	.stars { position: absolute; inset: 0 0 40% 0; opacity: .7; animation: fade 1s ease both;
		background: radial-gradient(1.5px 1.5px at 12% 18%, #fff, transparent), radial-gradient(1px 1px at 28% 8%, #fff, transparent), radial-gradient(1.5px 1.5px at 44% 26%, #dbeafe, transparent),
			radial-gradient(1px 1px at 63% 12%, #fff, transparent), radial-gradient(1.5px 1.5px at 78% 22%, #fff, transparent), radial-gradient(1px 1px at 90% 6%, #dbeafe, transparent),
			radial-gradient(1px 1px at 6% 40%, #fff, transparent), radial-gradient(1.5px 1.5px at 94% 38%, #fff, transparent), radial-gradient(1px 1px at 55% 4%, #fff, transparent); }
	.v-tide .rays { position: absolute; left: 50%; top: 30vh; width: 1600px; height: 1600px; margin: -800px 0 0 -800px; border-radius: 50%; opacity: 0; z-index: 1;
		background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--wl) 45%, transparent) 0deg 4deg, transparent 4deg 15deg);
		mask-image: radial-gradient(closest-side, #000 10%, transparent 70%); -webkit-mask-image: radial-gradient(closest-side, #000 10%, transparent 70%);
		animation: raysIn 1s ease 3s forwards, spinRays 40s linear 3s infinite; }
	@keyframes raysIn { to { opacity: 1; } }
	@keyframes spinRays { to { rotate: 360deg; } }
	.lost.v-tide .rays { filter: saturate(.4) brightness(.7); }
	/* the losers' heart: shudders, cracks (front → broken back), then sinks */
	.heart { position: absolute; left: 50%; top: calc(34vh / var(--z)); width: 220px; height: 220px; margin: -110px 0 0 -110px; zoom: var(--z); z-index: 1;
		animation: heartIn .45s cubic-bezier(.3, 1.4, .5, 1) .15s both, sink 1.3s cubic-bezier(.5, 0, .8, .6) 1.75s forwards; }
	.heart img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 26px var(--lc)); }
	.heart .hf { animation: quiver .9s linear .45s both, gone .01s linear 1.25s forwards; }
	.heart .hb { opacity: 0; animation: crackIn .5s ease-out 1.25s forwards; }
	@keyframes heartIn { from { opacity: 0; scale: .3; } to { opacity: 1; scale: 1; } }
	@keyframes quiver { 0%, 100% { translate: 0 0; filter: drop-shadow(0 0 26px var(--lc)) brightness(1); } 25% { translate: -3px 1px; } 50% { translate: 4px -2px; } 75% { translate: -5px 2px; filter: drop-shadow(0 0 40px var(--lc)) brightness(1.4); } }
	@keyframes gone { to { opacity: 0; } }
	@keyframes crackIn { 0% { opacity: 1; scale: 1.12; } 100% { opacity: 1; scale: 1; } }
	.crack { position: absolute; inset: -40%; border-radius: 50%; background: radial-gradient(circle, rgba(255, 255, 255, .95), rgba(255, 255, 255, 0) 60%); opacity: 0; animation: crack .6s ease-out 1.25s; }
	@keyframes crack { 0% { opacity: 1; scale: .3; } 100% { opacity: 0; scale: 1.4; } }
	@keyframes sink { 0% { translate: 0 0; opacity: 1; } 80% { opacity: 1; } 100% { translate: 0 calc(62vh / var(--z)); opacity: 0; } }
	.bubbles { position: absolute; left: 50%; top: 80vh; z-index: 4; }
	.bubbles i { position: absolute; left: var(--x); width: var(--s); height: var(--s); border-radius: 50%; opacity: 0;
		border: 1.5px solid rgba(200, 240, 255, .8); background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, .7), transparent 50%);
		animation: bubble var(--t) ease-in calc(2s + var(--d)) both; }
	@keyframes bubble { 0% { opacity: 0; translate: 0 0; } 15% { opacity: .9; } 100% { opacity: 0; translate: 10px -22vh; } }
	/* the sea: surges up over the heart, then settles; three wave layers roll */
	.sea { position: absolute; left: 0; right: 0; bottom: 0; height: 80vh; z-index: 2; transform: translateY(100%);
		animation: surge 2.2s cubic-bezier(.3, .7, .3, 1) .95s forwards; }
	@keyframes surge { 0% { transform: translateY(100%); } 38% { transform: translateY(6%); } 62% { transform: translateY(14%); } 100% { transform: translateY(58%); } }
	.wv { position: absolute; left: 0; width: 200%; height: 90px; }
	.wv path { fill: #0d5372; }
	.wv.w1 { top: 0; animation: roll 7s linear infinite; }
	.wv.w1 .foam { fill: none; stroke: rgba(220, 250, 255, .7); stroke-width: 3; vector-effect: non-scaling-stroke; }
	.wv.w2 { top: -18px; animation: roll 11s linear infinite reverse; } .wv.w2 path { fill: #0f6688; opacity: .8; }
	.wv.w3 { top: -34px; animation: roll 15s linear infinite; } .wv.w3 path { fill: #2a86a6; opacity: .45; }
	@keyframes roll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
	.deep { position: absolute; left: 0; right: 0; top: 88px; bottom: 0; background: linear-gradient(180deg, #0d5372, #072e4d 35%, #030f22); }
	.shine { position: absolute; left: 50%; top: 70px; width: 60vw; height: 40vh; margin-left: -30vw; opacity: 0;
		background: radial-gradient(50% 30% at 50% 0%, color-mix(in srgb, var(--wl) 55%, transparent), transparent);
		animation: raysIn 1s ease 3s forwards; }
	/* the winners' emblem rises out of the water, spinning flat, and settles above it */
	.coin { position: absolute; left: 50%; top: calc(28vh / var(--z)); width: 230px; height: 230px; margin: -115px 0 0 -115px; zoom: var(--z); z-index: 1; opacity: 0;
		animation: rise 1.1s cubic-bezier(.25, .8, .3, 1.15) 2.55s forwards; }
	.coin .spin { width: 100%; height: 100%; animation: coinSpin 1.1s cubic-bezier(.2, .6, .3, 1) 2.55s both; }
	.coin img { width: 100%; height: 100%; filter: drop-shadow(0 0 30px var(--wc)) drop-shadow(0 10px 20px rgba(0, 0, 0, .7)); }
	@keyframes rise { 0% { opacity: 1; translate: 0 calc(50vh / var(--z)); } 100% { opacity: 1; translate: 0 0; } }
	@keyframes coinSpin { 0% { transform: scaleX(1); } 15% { transform: scaleX(.05); } 30% { transform: scaleX(1); } 48% { transform: scaleX(.05); } 68% { transform: scaleX(1); } 100% { transform: scaleX(1); } }
	.v-tide .coin { --bob: 0; }
	.splash { position: absolute; left: 50%; top: calc(66vh + 44px); z-index: 4; }
	.sring { position: absolute; left: -130px; top: -18px; width: 260px; height: 36px; border-radius: 50%; border: 3px solid rgba(220, 250, 255, .85); opacity: 0;
		animation: sring .9s ease-out 2.8s forwards; }
	@keyframes sring { 0% { opacity: 1; scale: .2; } 100% { opacity: 0; scale: 1.8; } }
	.splash i { position: absolute; left: var(--x); top: 0; width: var(--s); height: calc(var(--s) * 1.4); border-radius: 50%; background: rgba(210, 245, 255, .9); opacity: 0;
		animation: drop .9s cubic-bezier(.2, .6, .5, 1) calc(2.8s + var(--d)) forwards; }
	@keyframes drop { 0% { opacity: 1; translate: 0 0; } 45% { opacity: 1; translate: calc(var(--x) * .25) calc(var(--h) * -1); } 100% { opacity: 0; translate: calc(var(--x) * .45) 20px; } }
	.ttitle { position: absolute; left: 0; right: 0; top: calc(var(--t, 46vh) / var(--z)); z-index: 5; display: grid; place-items: center; zoom: var(--z); }
	.ttitle .ttl { animation: slam .55s cubic-bezier(.2, 1.4, .3, 1) 3.25s both; }
	.v-tide:not(.lost) .ttitle .ttl { background: linear-gradient(180deg, #ffffff 5%, #f8e6b0 45%, #c79a45 90%); -webkit-background-clip: text; background-clip: text; }
	.float { position: absolute; left: 0; right: 0; top: calc(66vh / var(--z) + 10px); z-index: 5; display: flex; justify-content: center; gap: 20px; zoom: var(--z); }
	.float .pc { animation: up .5s ease calc(3.45s + var(--i) * .12s) both, bob 3s ease-in-out calc(4s + var(--i) * .4s) infinite; }
	@keyframes bob { 0%, 100% { translate: 0 0; rotate: -2deg; } 50% { translate: 0 6px; rotate: 2deg; } }
	.lost .float .pc img { filter: saturate(.8); }
	.twhy { position: absolute; left: 0; right: 0; bottom: calc(var(--b, 14vh) / var(--z)); z-index: 5; zoom: var(--z); animation: up .5s ease 3.6s both; }

	/* ═════════ THE DECREE ═════════ */
	.v-scroll { --cd: 3.8s; }
	.v-scroll.lost { --cd: 4.6s; }
	.v-scroll .bg { background: radial-gradient(90% 80% at 50% 45%, #2a1a0c, #0a0604 75%); }
	.candle { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(60% 50% at 50% 45%, rgba(255, 190, 110, .18), transparent 70%); animation: flicker 2.6s ease-in-out infinite; }
	@keyframes flicker { 0%, 100% { opacity: 1; } 30% { opacity: .75; } 55% { opacity: .95; } 70% { opacity: .7; } }
	.stage { position: absolute; left: 50%; top: 46%; translate: -50% -50%; zoom: var(--uis, 1); z-index: 2; }
	.scroll { position: relative; width: 880px; animation: scrollIn .5s cubic-bezier(.3, 1.3, .5, 1) .1s both; }
	@keyframes scrollIn { from { opacity: 0; translate: 0 -40px; } to { opacity: 1; translate: 0 0; } }
	.rod { position: relative; z-index: 3; height: 34px; margin: 0 -46px; border-radius: 17px;
		background: linear-gradient(180deg, #a06a33, #d79a58 28%, #7a4a1e 65%, #3e230c); box-shadow: 0 8px 18px rgba(0, 0, 0, .7); }
	.rod::before, .rod::after { content: ''; position: absolute; top: -7px; width: 48px; height: 48px; border-radius: 50%;
		background: radial-gradient(circle at 38% 32%, #fff3c4, #e2b04f 45%, #7d5310); box-shadow: 0 4px 10px rgba(0, 0, 0, .6); }
	.rod::before { left: -26px; } .rod::after { right: -26px; }
	.rod.bot { animation: unrollRod 1.1s cubic-bezier(.45, 0, .2, 1) .5s both; }
	@keyframes unrollRod { from { translate: 0 -600px; } to { translate: 0 0; } }
	.paper { position: relative; height: 600px; margin: -6px 0; overflow: hidden;
		background:
			radial-gradient(ellipse at 22% 14%, rgba(255, 255, 255, .35), transparent 42%),
			radial-gradient(ellipse at 78% 88%, rgba(130, 85, 30, .28), transparent 46%),
			radial-gradient(circle at 60% 40%, rgba(140, 100, 50, .12) 0 2px, transparent 3px) 0 0 / 37px 41px,
			radial-gradient(circle at 20% 70%, rgba(140, 100, 50, .10) 0 1.5px, transparent 2.5px) 0 0 / 23px 29px,
			linear-gradient(180deg, #f3e2bb, #e8cf98 50%, #dcbb7a);
		box-shadow: inset 0 0 70px rgba(110, 70, 20, .6), inset 0 0 8px rgba(80, 50, 10, .7);
		animation: unroll 1.1s cubic-bezier(.45, 0, .2, 1) .5s both; }
	@keyframes unroll { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
	.inner { position: absolute; inset: 30px 60px 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #3b2410; text-align: center; }
	.decree { font-size: 1rem; letter-spacing: .5em; text-transform: uppercase; color: #7a5228; animation: fade .5s ease 1.4s both; }
	/* the title, inked left → right with an illuminated capital */
	.v-scroll .ttl { display: flex; align-items: center; gap: 4px; background: none; filter: none; color: #3b2410; font-size: 6.4rem; text-shadow: 0 1px 0 rgba(255, 255, 255, .4); letter-spacing: .06em; }
	.ill { display: grid; place-items: center; width: 1.15em; height: 1.15em; font-size: 1em; color: #fff7e0; border-radius: 6px;
		background: radial-gradient(circle at 35% 30%, var(--wl), var(--wc) 55%, var(--wd)); border: 4px solid #d9a845;
		box-shadow: 0 0 0 2px #7d5310, 0 6px 14px rgba(60, 30, 0, .5), inset 0 0 12px rgba(0, 0, 0, .35); text-shadow: 0 2px 0 rgba(0, 0, 0, .4);
		animation: illum .5s cubic-bezier(.2, 1.4, .3, 1) 1.55s both; }
	@keyframes illum { from { opacity: 0; scale: .4; rotate: -10deg; } to { opacity: 1; scale: 1; rotate: 0deg; } }
	.ink { animation: ink .9s steps(14) 1.85s both; }
	@keyframes ink { from { clip-path: inset(-10% 100% -10% 0); } to { clip-path: inset(-10% 0 -10% 0); } }
	.v-scroll .why { color: #5a3a17; text-shadow: none; font-size: 1.3rem; animation: fade .5s ease 2.7s both; }
	.flourish { width: 340px; height: 22px; margin: 4px 0; }
	.flourish path { fill: none; stroke: #7a5228; stroke-width: 2; stroke-dasharray: 520; stroke-dashoffset: 520; animation: draw .8s ease 2.85s forwards; }
	.flourish circle { fill: var(--wc); opacity: 0; animation: fade .3s ease 3.3s forwards; }
	@keyframes draw { to { stroke-dashoffset: 0; } }
	.victors { font-size: .9rem; letter-spacing: .4em; text-transform: uppercase; color: #7a5228; animation: fade .4s ease 3s both; }
	.names { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 30px; margin-top: 4px; }
	.nm { display: flex; flex-direction: column; align-items: center; gap: 2px; animation: fade .4s ease calc(3.1s + var(--i) * .15s) both; }
	.nm img { width: 78px; height: 78px; border-radius: 50%; object-fit: cover; border: 3px solid var(--wc); box-shadow: 0 0 0 2px #d9a845, 0 4px 10px rgba(60, 30, 0, .4); filter: sepia(.25); }
	.nm b { font-weight: normal; font-size: 1.35rem; color: #3b2410; }
	.nm em { font-style: normal; font-size: .7rem; letter-spacing: .14em; text-transform: uppercase; color: color-mix(in srgb, var(--wc) 70%, #3b2410); }
	.stats { margin-top: 10px; font-size: .85rem; letter-spacing: .18em; text-transform: uppercase; color: #8a6538; animation: fade .4s ease 3.4s both; }
	/* the wax seal stamps down on the corner, ribbon tails beneath */
	.wseal { position: absolute; right: 34px; bottom: 30px; width: 150px; height: 150px; z-index: 2; animation: stamp .45s cubic-bezier(.5, 0, .5, 1.4) 3.35s both; }
	@keyframes stamp { 0% { opacity: 0; scale: 2.6; rotate: -30deg; filter: blur(4px); } 70% { opacity: 1; scale: .92; rotate: -12deg; filter: none; } 100% { opacity: 1; scale: 1; rotate: -14deg; } }
	.wax { position: absolute; inset: 0; display: grid; place-items: center; border-radius: 47% 53% 50% 50% / 52% 46% 54% 48%;
		background: radial-gradient(circle at 38% 32%, var(--wl), var(--wc) 45%, var(--wd) 95%);
		box-shadow: 0 8px 16px rgba(40, 20, 0, .6), inset 0 0 0 12px color-mix(in srgb, var(--wd) 40%, transparent), inset 0 -6px 14px rgba(0, 0, 0, .35); }
	.wax img { width: 96px; height: 96px; filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .5)) saturate(.85); }
	.tail { position: absolute; top: 96px; width: 40px; height: 110px; background: linear-gradient(180deg, var(--wc), var(--wd)); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%); }
	.tail.a { left: 30px; rotate: 16deg; } .tail.b { right: 30px; rotate: -16deg; }
	.v-scroll .scroll { animation: scrollIn .5s cubic-bezier(.3, 1.3, .5, 1) .1s both, thud .3s ease 3.65s; }
	@keyframes thud { 0%, 100% { translate: 0 0; } 30% { translate: 0 5px; } 60% { translate: 0 -2px; } }
	/* defeat: after the seal, the decree burns up from the bottom edge */
	@property --burn { syntax: '<percentage>'; inherits: true; initial-value: 0%; }
	.lost .paper { mask-image: linear-gradient(0deg, transparent var(--burn), #000 calc(var(--burn) + 2.5%)); -webkit-mask-image: linear-gradient(0deg, transparent var(--burn), #000 calc(var(--burn) + 2.5%));
		animation: unroll 1.1s cubic-bezier(.45, 0, .2, 1) .5s both, burn 3.4s cubic-bezier(.3, .6, .4, 1) 3.9s forwards; }
	@keyframes burn { from { --burn: 0%; } to { --burn: 40%; } }
	.char { position: absolute; left: 0; right: 0; bottom: var(--burn); height: 24%; z-index: 3; opacity: 0;
		background: linear-gradient(0deg, rgba(25, 10, 2, .95), rgba(80, 40, 10, .55) 35%, rgba(120, 70, 20, .2) 70%, transparent); animation: fade .4s ease 3.9s forwards; }
	.lost .rod.bot { animation: unrollRod 1.1s cubic-bezier(.45, 0, .2, 1) .5s both, rodFall 1.1s cubic-bezier(.5, 0, .9, .5) 4.5s forwards; }
	@keyframes rodFall { from { translate: 0 0; rotate: 0deg; opacity: 1; } to { translate: 0 70vh; rotate: 10deg; opacity: 0; } }
	.flame { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; z-index: 4; opacity: 0;
		background: radial-gradient(16px 30px at 12px 100%, #fff1b0, #ffb347 30%, #ff6a10 60%, transparent 75%) 0 0 / 26px 100% repeat-x,
			linear-gradient(0deg, rgba(255, 120, 30, .9), transparent);
		bottom: calc(var(--burn) - 8px); filter: blur(1px) drop-shadow(0 0 10px #ff7a1a); animation: fade .3s ease 3.9s forwards, lick .25s steps(2) 3.9s infinite; }
		@keyframes lick { 50% { background-position: 13px 0, 0 0; } }
	.sparks { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
	.sparks i { position: absolute; top: 72%; width: var(--s); height: var(--s); border-radius: 50%; background: #ffb347; box-shadow: 0 0 8px #ff7a1a; opacity: 0;
		animation: spark var(--t) ease-out calc(4s + var(--d)) infinite; }
	@keyframes spark { 0% { opacity: 0; translate: 0 0; } 15% { opacity: 1; } 100% { opacity: 0; translate: 26px -40vh; } }
	.lost .scroll { filter: saturate(.9); }

	/* phones */
	.mob .ttl { font-size: min(3.2rem, 12vw); }
	.mob .why { font-size: .8rem; padding: 0 12px; }
	.mob .pc img { width: 40px; height: 40px; } .mob .pc em { font-size: .6rem; }
	.mob .gseal { zoom: .55; }
	.mob .ring { display: none; } .mob .band { height: 34px; background-size: 44px 100%, auto; }
	.mob .pillar { width: 7vw; } .mob .pillar.l { left: 4vw; } .mob .pillar.r { right: 4vw; }
	.mob .heroes { top: 30vh; bottom: 13vh; gap: 2px; padding: 0 6vw; } .mob .hz { width: auto; flex: 0 1 40vw; min-width: 0; } .mob .hn b { font-size: .72rem; } .mob .hn em { font-size: .52rem; letter-spacing: .06em; }
	.mob .gtitle { --t: 9vh; } .mob.v-gates.lost .gtitle { --t: 6vh; } .mob .fallen { gap: 8px; --b: 11vh; }
	.mob .bar { height: 34px; top: 66%; } .mob .bar i { width: 28px; height: 70px; top: -18px; }
	.mob .heart, .mob .coin { --z: .6; }
	.mob .ttitle { --t: 45vh; } .mob .float { gap: 10px; } .mob .twhy { --b: 13vh; }
	.mob .stage { zoom: 1; width: 92vw; top: 45%; }
	.mob .scroll { width: auto; margin: 0 20px; } .mob .rod { height: 22px; margin: 0 -22px; } .mob .rod::before, .mob .rod::after { width: 30px; height: 30px; top: -4px; } .mob .rod::before { left: -14px; } .mob .rod::after { right: -14px; }
	.mob .paper { height: 62vh; } .mob .nm img { width: 40px; height: 40px; } .mob .rod.bot { animation-name: unrollRodM; } .mob.lost .rod.bot { animation-name: unrollRodM, rodFall; }
	@keyframes unrollRodM { from { translate: 0 -62vh; } to { translate: 0 0; } }
	.mob .inner { inset: 18px 16px; gap: 4px; }
	.mob.v-scroll .ttl { font-size: min(3rem, 11vw); } .mob .decree { font-size: .62rem; letter-spacing: .3em; } .mob.v-scroll .why { font-size: .8rem; }
	.mob .flourish { width: 200px; } .mob .names { gap: 6px 12px; } .mob .nm img { width: 40px; height: 40px; } .mob .nm b { font-size: .8rem; } .mob .stats { font-size: .6rem; letter-spacing: .08em; }
	.mob.v-scroll .wseal { zoom: .55; right: 10px; bottom: 6px; }
</style>
