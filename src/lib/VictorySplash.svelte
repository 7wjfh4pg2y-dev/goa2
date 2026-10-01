<script lang="ts">
	// GAME OVER — three simple, thematic looks (being chosen), all viewer-relative: VICTORY
	// (you won) · DEFEAT (you lost) · "<Team> wins" (spectators). Team emblems = the tie-breaker
	// coins (orange gear / blue star); team hearts = the Life counters (front whole, back broken).
	//  · 'coin'  — the winners' emblem drops in with a flat coin flip (like the tie-breaker) and
	//              lands with a ring of light; the title settles beneath it
	//  · 'heart' — both teams' Life hearts, the enemy on the left and yours on the right (like the
	//              other splashes): the winners' heart beats and glows, the losers' cracks and dims
	//  · 'card'  — a quiet title card: the emblem, two gold rules drawing out from the centre,
	//              the title tracking in between them, the champions named below
	import { heroAvatar } from '$lib/heroes';
	import type { Team } from '$lib/match';
	import tieOrange from '$lib/images/tiebreaker_orange.png';
	import tieBlue from '$lib/images/tiebreaker_blue.png';

	type Hero = { pid: string; hero: string; name: string };
	export let variant: 'coin' | 'heart' | 'card' = 'coin';
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
	const C: Record<Team, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
	const L: Record<Team, string> = { orange: '#ffb27a', blue: '#8cc0ff' };
	$: loser = (team === 'orange' ? 'blue' : 'orange') as Team;
	$: lost = myTeam != null && myTeam !== team;
	$: title = myTeam == null ? `${cap(team)} wins` : lost ? 'Defeat' : 'Victory';
	$: line = /^(orange|blue)\b/i.test(reason) ? reason : `${cap(team)} ${reason}`;
	$: mine = (myTeam ?? 'blue') as Team; // your side sits on the right (spectators: blue)
	$: enemy = (mine === 'orange' ? 'blue' : 'orange') as Team;
</script>

<div class="vs v-{variant}" class:lost class:mob={mobile} style="--wc:{C[team]}; --wl:{L[team]}" role="dialog" aria-label="Game over">
	<div class="bg"></div>
	<div class="col">
		{#if variant === 'coin'}
			<div class="emb">
				<span class="halo"></span><span class="ring"></span>
				<img src={EMBLEM[team]} alt="" />
			</div>
		{:else if variant === 'heart'}
			<div class="hearts">
				{#each [enemy, mine] as t (t)}
					<div class="ht" class:win={t === team} class:lose={t !== team} style="--tc:{C[t]}">
						<img class="f" src={heart(t, 'front')} alt="" />
						{#if t !== team}<img class="b" src={heart(t, 'back')} alt="" />{/if}
						<span class="lbl" style:color={L[t]}>{t === mine && myTeam != null ? 'You' : cap(t)} · {life[t]} Life</span>
					</div>
				{/each}
			</div>
		{:else}
			<img class="mini" src={EMBLEM[team]} alt="" />
			<span class="kick">{cap(team)} team · Round {round}</span>
			<span class="rule"></span>
		{/if}
		<span class="ttl">{title}</span>
		{#if variant === 'card'}<span class="rule"></span>{/if}
		<span class="why">{line}</span>
		{#if variant === 'card'}
			<span class="champs">{winners.map((h) => h.name).join('  ·  ')}</span>
			<span class="stats">{waves} wave{waves === 1 ? '' : 's'} left · Life {life.orange} : {life.blue}</span>
		{:else}
			<div class="crew">{#each lost ? losers : winners as h (h.pid)}<span class="pc" class:me={h.pid === me}><img src={heroAvatar(h.hero)} alt="" /><em>{h.name}</em></span>{/each}</div>
		{/if}
	</div>
	<div class="foot"><button class="close" on:click={onClose}>View the board</button></div>
</div>

<style>
	.vs { position: fixed; inset: 0; z-index: 70; overflow: hidden; color: #f6ead2; --z: var(--uis, 1); }
	.vs.mob { --z: .62; }
	.bg { position: absolute; inset: 0; animation: fade .5s ease both;
		background: radial-gradient(60% 55% at 50% 42%, color-mix(in srgb, var(--wc) 22%, rgba(8, 10, 18, .96)), rgba(3, 4, 8, .985)); }
	.lost .bg { background: radial-gradient(60% 55% at 50% 42%, rgba(30, 30, 36, .96), rgba(2, 2, 4, .985)); }
	/* one centred column; zoom scales it (percent insets are untouched by zoom) */
	.col { position: absolute; left: 50%; top: 45%; translate: -50% -50%; zoom: var(--z); display: flex; flex-direction: column; align-items: center; gap: 12px; width: max-content; max-width: calc(96vw / var(--z)); }
	.ttl { font-size: 6rem; line-height: 1; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap;
		background: linear-gradient(180deg, #fff8e0 8%, #f3cd72 50%, #a8701f 92%); -webkit-background-clip: text; background-clip: text; color: transparent;
		filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .65)) drop-shadow(0 0 24px color-mix(in srgb, var(--wc) 70%, transparent)); animation: settle .6s cubic-bezier(.2, 1.3, .4, 1) var(--td, 1s) both; }
	.lost .ttl { background: linear-gradient(180deg, #f1f2f4 8%, #a3a9b3 50%, #4b5059 92%); -webkit-background-clip: text; background-clip: text;
		filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .7)) drop-shadow(0 0 24px rgba(127, 29, 29, .8)); }
	.why { font-size: 1.15rem; letter-spacing: .12em; color: #f0dcae; text-align: center; text-shadow: 0 2px 8px #000; animation: up .5s ease calc(var(--td, 1s) + .35s) both; }
	.crew { display: flex; gap: 18px; margin-top: 6px; animation: up .5s ease calc(var(--td, 1s) + .55s) both; }
	.pc { display: flex; flex-direction: column; align-items: center; gap: 4px; }
	.pc img { width: 58px; height: 58px; border-radius: 50%; object-fit: cover; border: 3px solid var(--wc); box-shadow: 0 0 14px color-mix(in srgb, var(--wc) 60%, transparent); }
	.pc em { font-style: normal; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: #e5e7eb; }
	.pc.me em { color: #fff3d6; }
	.lost .pc img { border-color: #6b7280; box-shadow: none; filter: grayscale(.8) brightness(.75); } /* defeat: your fallen team */
	.foot { position: absolute; left: 0; right: 0; bottom: 5vh; display: grid; place-items: center; z-index: 5; }
	.close { font: inherit; font-size: 1.05rem; padding: .7rem 2rem; border-radius: 12px; cursor: pointer; color: #fff; letter-spacing: .05em; zoom: var(--uis, 1);
		background: color-mix(in srgb, var(--wc) 70%, #000); border: 1px solid rgba(255, 255, 255, .3); box-shadow: 0 8px 24px rgba(0, 0, 0, .5); animation: up .5s ease calc(var(--td, 1s) + 1s) both; }
	.close:hover { filter: brightness(1.12); }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	@keyframes up { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
	@keyframes settle { from { opacity: 0; transform: scale(1.5); filter: blur(6px); } to { opacity: 1; transform: none; } }

	/* ═════ COIN: the emblem drops in flipping, lands with a ring of light ═════ */
	.v-coin { --td: 1.15s; }
	.emb { position: relative; width: 220px; height: 220px; margin-bottom: 6px; }
	.emb img { position: relative; width: 100%; height: 100%; filter: drop-shadow(0 12px 22px rgba(0, 0, 0, .7));
		animation: drop .9s cubic-bezier(.3, .1, .4, 1) .15s both, flip .9s cubic-bezier(.2, .5, .4, 1) .15s both; }
	@keyframes drop { 0% { opacity: 0; translate: 0 -420px; } 15% { opacity: 1; } 78% { translate: 0 8px; } 100% { opacity: 1; translate: 0 0; } }
	@keyframes flip { 0% { transform: scaleX(1); } 12% { transform: scaleX(.04); } 26% { transform: scaleX(1); } 42% { transform: scaleX(.04); } 60% { transform: scaleX(1); } 76% { transform: scaleX(.04); } 100% { transform: scaleX(1); } }
	.halo { position: absolute; inset: -40%; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--wl) 55%, transparent), transparent); opacity: 0; animation: fade .8s ease 1s forwards; }
	.ring { position: absolute; inset: 0; border-radius: 50%; border: 4px solid #ffe3a0; opacity: 0; animation: ring .8s ease-out 1.05s forwards; }
	@keyframes ring { 0% { opacity: .9; scale: .9; } 100% { opacity: 0; scale: 2.1; border-width: 1px; } }
	.lost .emb img { animation: drop .9s cubic-bezier(.3, .1, .4, 1) .15s both, flip .9s cubic-bezier(.2, .5, .4, 1) .15s both, dimE .8s ease 1.4s forwards; }
	@keyframes dimE { to { filter: drop-shadow(0 12px 22px rgba(0, 0, 0, .7)) brightness(.7) saturate(.7); } }
	.lost .ring { border-color: #9ca3af; }

	/* ═════ HEART: the winners' heart beats, the losers' cracks and dims ═════ */
	.v-heart { --td: 1.5s; }
	.hearts { display: flex; gap: 90px; margin-bottom: 10px; }
	.ht { position: relative; width: 200px; height: 200px; display: flex; flex-direction: column; align-items: center; animation: up .5s ease .1s both; }
	.ht img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
	.ht .lbl { position: absolute; top: calc(100% + 8px); white-space: nowrap; font-size: .85rem; letter-spacing: .2em; text-transform: uppercase; animation: up .4s ease 1.3s both; }
	.ht.win img { filter: drop-shadow(0 0 30px var(--tc)); animation: beat 1.1s ease .5s 2; }
	@keyframes beat { 0%, 100% { scale: 1; } 14% { scale: 1.12; } 28% { scale: 1; } 42% { scale: 1.08; } 70% { scale: 1; } }
	.ht.lose .f { filter: drop-shadow(0 0 22px var(--tc)); animation: shake .6s linear .45s, gone .01s linear 1.05s forwards; }
	.ht.lose .b { opacity: 0; animation: crackIn .5s ease-out 1.05s forwards; }
	@keyframes shake { 0%, 100% { translate: 0 0; } 20% { translate: -4px 1px; } 40% { translate: 5px -2px; } 60% { translate: -6px 2px; } 80% { translate: 6px -1px; } }
	@keyframes gone { to { opacity: 0; } }
	@keyframes crackIn { 0% { opacity: 1; scale: 1.15; filter: brightness(2); } 100% { opacity: 1; scale: 1; filter: brightness(.6) saturate(.6) drop-shadow(0 6px 10px rgba(0, 0, 0, .7)); } }
	.v-heart .ttl { margin-top: 34px; }

	/* ═════ CARD: a quiet title card between two gold rules ═════ */
	.v-card { --td: .7s; }
	.v-card .bg { background: radial-gradient(70% 60% at 50% 45%, rgba(14, 14, 20, .94), rgba(2, 2, 4, .99)); }
	.mini { width: 92px; height: 92px; filter: drop-shadow(0 0 18px color-mix(in srgb, var(--wc) 70%, transparent)); animation: fade .8s ease .1s both; }
	.lost .mini { filter: grayscale(.6) brightness(.8); }
	.kick { font-size: .9rem; letter-spacing: .5em; text-transform: uppercase; color: var(--wl); animation: fade .6s ease .4s both; }
	.rule { width: 560px; height: 2px; background: linear-gradient(90deg, transparent, #d9a845 20%, #ffe3a0 50%, #d9a845 80%, transparent); animation: draw .9s cubic-bezier(.3, .8, .3, 1) .5s both; }
	.lost .rule { background: linear-gradient(90deg, transparent, #6b7280 20%, #c9ced6 50%, #6b7280 80%, transparent); }
	@keyframes draw { from { scale: 0 1; opacity: 0; } to { scale: 1 1; opacity: 1; } }
	.v-card .ttl { animation: track 1.2s cubic-bezier(.2, .7, .2, 1) .7s both; filter: drop-shadow(0 4px 0 rgba(0, 0, 0, .65)); }
	@keyframes track { from { opacity: 0; letter-spacing: .5em; filter: blur(8px); } to { opacity: 1; letter-spacing: .08em; } }
	.champs { font-size: 1.3rem; letter-spacing: .14em; text-transform: uppercase; color: #fff3d6; animation: up .5s ease 1.5s both; }
	.stats { font-size: .78rem; letter-spacing: .3em; text-transform: uppercase; color: #8b93a1; animation: up .5s ease 1.7s both; }

	/* phones: the whole column is zoomed down (--z), only the long lines need care */
	.mob .ttl { font-size: min(6rem, calc(15vw / var(--z))); }
	.mob .hearts { gap: 40px; }
	.mob .rule { width: calc(88vw / var(--z)); }
	.mob .why { font-size: 1.3rem; }
	.mob .close { zoom: 1; }
</style>
