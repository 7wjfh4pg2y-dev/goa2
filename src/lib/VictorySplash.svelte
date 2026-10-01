<script lang="ts">
	// GAME OVER — the losing team's war banners hang for a beat, then their rods snap and
	// they fall away; the winners' banners drop in big under golden rays. Viewer-relative
	// title: VICTORY (you won) · DEFEAT (you lost) · "<Team> wins" (spectators).
	import { heroById, heroSplash, heroLogo } from '$lib/heroes';
	import type { Team } from '$lib/match';

	type Hero = { pid: string; hero: string; name: string };
	export let team: Team; // the winning team
	export let reason = '';
	export let winners: Hero[] = [];
	export let losers: Hero[] = [];
	export let myTeam: Team | null = null; // null = spectator
	export let me = '';
	export let mobile = false;
	export let onClose: () => void = () => {};

	const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
	$: loser = (team === 'orange' ? 'blue' : 'orange') as Team;
	$: title = myTeam == null ? `${cap(team)} wins` : myTeam === team ? 'Victory' : 'Defeat';
	$: lost = myTeam != null && myTeam !== team;
	// "Orange ran out of Life" reads on its own; push reasons read after the team's name
	$: line = /^(orange|blue)\b/i.test(reason) ? reason : `${cap(team)} ${reason}`;
	$: dense = Math.max(winners.length, losers.length) >= 4;
</script>

<div class="vs {team}" class:lost class:dense class:mob={mobile} role="dialog" aria-label="Game over">
	<div class="wash"></div>
	<div class="rays"></div>

	<div class="titles">
		<span class="kick">{cap(team)} wins the battle</span>
		<span class="title">{title}</span>
		<span class="why">{line}</span>
	</div>

	<div class="stage">
		<!-- the losers hang, then fall -->
		<div class="row losers">
			{#each losers as h, i (h.pid)}
				<div class="banner fall" style="--d:{i * 0.1}s; --r:{i % 2 ? 14 : -16}deg">
					<div class="rod"></div>
					<div class="cloth {loser}"><div class="cloth-in">
						<div class="art"><img src={heroSplash(h.hero)} alt="" /></div>
						<img class="sigil" src={heroLogo(h.hero)} alt="" />
						<div class="hname">{heroById(h.hero)?.name ?? ''}</div>
						<div class="who">{h.name}</div>
					</div></div>
				</div>
			{/each}
		</div>
		<!-- the winners drop in -->
		<div class="row winners">
			{#each winners as h, i (h.pid)}
				<div class="banner rise" style="--d:{1.55 + i * 0.13}s">
					<div class="rod"></div>
					<div class="cloth {team}"><div class="cloth-in">
						<div class="art"><img src={heroSplash(h.hero)} alt="" /></div>
						<img class="sigil" src={heroLogo(h.hero)} alt="" />
						<div class="hname">{heroById(h.hero)?.name ?? ''}</div>
						<div class="who" class:me={h.pid === me}>{h.name}{h.pid === me ? ' · you' : ''}</div>
					</div></div>
				</div>
			{/each}
		</div>
	</div>

	<div class="foot"><button class="close" on:click={onClose}>View the board</button></div>
</div>

<style>
	.vs { position: fixed; inset: 0; z-index: 70; display: flex; flex-direction: column; align-items: center; overflow: hidden; color: #f6ead2;
		background: radial-gradient(120% 90% at 50% 45%, rgba(18, 16, 26, .9), rgba(4, 5, 10, .97)); animation: fade .5s ease both;
		--bw: 210px; --bh: 430px; --wc: #ef7d22; }
	.vs.blue { --wc: #2f7fe6; }
	.vs.dense { --bw: 168px; --bh: 380px; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	.wash { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(60% 55% at 50% 60%, color-mix(in srgb, var(--wc) 32%, transparent), transparent 70%); opacity: 0; animation: fade 1.2s 1.4s ease forwards; }
	.rays { position: absolute; left: 50%; top: 60%; width: 1600px; height: 1600px; margin: -800px 0 0 -800px; border-radius: 50%; pointer-events: none; opacity: 0;
		background: repeating-conic-gradient(from 0deg, rgba(255, 220, 140, .12) 0 5deg, transparent 5deg 15deg);
		mask-image: radial-gradient(circle, #000 8%, transparent 60%); -webkit-mask-image: radial-gradient(circle, #000 8%, transparent 60%);
		animation: rays 1.4s ease-out 1.5s forwards, spin 60s linear 1.5s infinite; }
	@keyframes rays { to { opacity: 1; } }
	@keyframes spin { to { rotate: 360deg; } }

	.titles { position: relative; z-index: 2; margin-top: 3vh; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; zoom: var(--uis, 1); }
	.kick { font-size: 1rem; letter-spacing: .4em; text-transform: uppercase; color: #d9c79a; animation: up .5s ease .3s both; }
	.title { font-size: 6rem; line-height: 1; text-transform: uppercase; letter-spacing: .04em; color: #fff3d6;
		text-shadow: 0 5px 0 color-mix(in srgb, var(--wc) 50%, #000), 0 0 40px var(--wc), 0 0 80px rgba(0, 0, 0, .8); animation: slam .55s cubic-bezier(.2, 1.4, .3, 1) 1.6s both; }
	.lost .title { color: #d9dde3; text-shadow: 0 5px 0 #1a1d24, 0 0 30px rgba(120, 130, 150, .6), 0 0 80px rgba(0, 0, 0, .9); }
	.why { font-size: 1.1rem; letter-spacing: .1em; color: #f0dcae; animation: up .5s ease 2s both; }
	@keyframes up { from { opacity: 0; translate: 0 10px; } to { opacity: 1; translate: 0 0; } }
	@keyframes slam { from { opacity: 0; transform: scale(2.2); filter: blur(6px); } to { opacity: 1; transform: none; filter: none; } }

	.stage { position: relative; flex: 1; width: 100%; zoom: var(--uis, 1); }
	.row { position: absolute; left: 0; right: 0; top: 18px; display: flex; justify-content: center; gap: 22px; }
	.dense .row { gap: 14px; }
	.row.losers { transform: scale(.82); transform-origin: top center; filter: saturate(.55) brightness(.75); }

	.banner { width: var(--bw); transform-origin: top center; }
	/* losers: drop in first, hang… then the rod snaps and they tumble away */
	.banner.fall { animation: hangFall 2.4s var(--d) cubic-bezier(.4, 0, .6, 1) both; }
	@keyframes hangFall {
		0% { transform: translateY(-110%); opacity: 0; } 18% { transform: translateY(2%) rotate(1deg); opacity: 1; } 28% { transform: none; }
		55% { transform: rotate(0); } 62% { transform: rotate(calc(var(--r) * .3)) translateY(2%); }
		100% { transform: translateY(130vh) rotate(var(--r)); opacity: .2; }
	}
	/* winners: drop in big and swing to rest */
	.banner.rise { opacity: 0; animation: drop 1s var(--d) cubic-bezier(.25, .9, .3, 1) both; }
	@keyframes drop { 0% { transform: translateY(-115%); opacity: 0; } 45% { opacity: 1; } 62% { transform: translateY(3%) rotate(2.2deg); } 80% { transform: translateY(-1%) rotate(-1.4deg); } 100% { transform: none; opacity: 1; } }
	.rise .cloth { filter: drop-shadow(0 18px 26px rgba(0, 0, 0, .6)) drop-shadow(0 0 22px color-mix(in srgb, var(--wc) 60%, transparent)); }

	.rod { position: relative; z-index: 2; height: 11px; margin: 0 -6px -3px; border-radius: 6px; background: linear-gradient(180deg, #8a6431, #4a3218 60%, #2e1f0e); box-shadow: 0 4px 10px rgba(0, 0, 0, .6); }
	.cloth { position: relative; height: var(--bh); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 90%, 0 100%); background: linear-gradient(180deg, #f0d48a, #b88a38 50%, #8a6424); }
	.cloth-in { position: absolute; inset: 0 4px 4px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 4px), 50% calc(90% - 3px), 0 calc(100% - 4px));
		display: flex; flex-direction: column; align-items: center; background: repeating-linear-gradient(90deg, rgba(255, 255, 255, .035) 0 2px, transparent 2px 6px), var(--cloth); }
	.cloth.orange { --cloth: linear-gradient(180deg, #b9561c 0%, #86380f 48%, #561f07 100%); }
	.cloth.blue { --cloth: linear-gradient(180deg, #2a64b8 0%, #1a4585 48%, #0d2a55 100%); }
	.art { width: 100%; height: 50%; flex: none; overflow: hidden; }
	.art img { width: 100%; height: 100%; object-fit: cover; object-position: center 24%; display: block; }
	.sigil { width: 64px; height: 64px; object-fit: contain; margin-top: -34px; filter: drop-shadow(0 3px 7px rgba(0, 0, 0, .8)); }
	.hname { margin-top: 2px; font-size: 1.6rem; line-height: 1; text-align: center; padding: 0 8px; text-shadow: 0 2px 8px rgba(0, 0, 0, .7); }
	.dense .hname { font-size: 1.25rem; }
	.who { margin-top: 9px; padding: 3px 12px; border-radius: 999px; font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: #fff;
		background: rgba(0, 0, 0, .3); border: 1px solid rgba(255, 255, 255, .18); max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.who.me { border-color: rgba(246, 234, 210, .8); box-shadow: 0 0 10px rgba(246, 234, 210, .35); }

	.foot { position: relative; z-index: 2; height: 90px; display: grid; place-items: center; }
	.close { font: inherit; font-size: 1.05rem; padding: .7rem 2rem; border-radius: 12px; cursor: pointer; color: #fff; letter-spacing: .05em;
		background: color-mix(in srgb, var(--wc) 70%, #000); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); animation: up .5s ease 2.8s both; }
	.close:hover { filter: brightness(1.12); }

	/* phones */
	.mob { --bw: 104px; --bh: 250px; }
	.mob.dense { --bw: 74px; --bh: 210px; }
	.mob .title { font-size: 3.2rem; } .mob .kick { font-size: .7rem; } .mob .why { font-size: .8rem; }
	.mob .row { gap: 8px; } .mob .hname { font-size: .95rem; } .mob .sigil { width: 40px; height: 40px; margin-top: -22px; } .mob .who { font-size: .55rem; padding: 2px 6px; }
</style>
