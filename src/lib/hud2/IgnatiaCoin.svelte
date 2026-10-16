<script lang="ts">
	// Ignatia's dash button: her own copy of the tie-breaker coin, so she always sees which half of her cards
	// applies (the blue-symbol text while the coin shows the Titans, the orange one while it shows the Atlanteans).
	// Equilibrium (her silver) = both halves for the rest of the round: a split coin, half Atlantean, half Titan, in
	// orange and blue flames (the Dashboard effect switch). When the round ends the split goes and the coin shows the
	// real coin again — flipping first if the real one changed meanwhile. With her ultimate (Chaos Incarnate) the coin
	// has a purple rim and, on her own turn, can be pressed once to flip the real coin (the action ring confirms).
	import { onDestroy } from 'svelte';
	type Team = 'orange' | 'blue';
	export let face: Team = 'orange';
	export let split = false;
	export let ult = false;
	export let ready = false; // the flip can be used now
	export let used = false; // used this turn
	export let flames = true; // the Dashboard effects switch
	export let size = 46;
	export let art: (t: Team) => string;
	export let onPress: () => void = () => {};

	// the coin under the split keeps the face it had; it only turns to the real face once the split has gone
	let base: Team = face;
	let flipping = false;
	let wasSplit = split;
	let timers: ReturnType<typeof setTimeout>[] = [];
	$: sync(face, split);
	function sync(f: Team, sp: boolean) {
		const leaving = wasSplit && !sp;
		wasSplit = sp;
		if (sp || f === base) return;
		const wait = leaving ? 320 : 0; // let the split fade away first
		timers.push(setTimeout(() => { flipping = true; }, wait));
		timers.push(setTimeout(() => { base = f; }, wait + 170));
		timers.push(setTimeout(() => { flipping = false; }, wait + 360));
	}
	onDestroy(() => timers.forEach(clearTimeout));
	const NAME: Record<Team, string> = { orange: 'Atlanteans', blue: 'Titans' };
	$: tip = split ? 'Equilibrium — either half of your cards applies this round'
		: `Tie-breaker: the ${NAME[face]} — your ${face} text applies${ult ? (ready ? ' · tap to flip it (Chaos Incarnate)' : used ? ' · flipped this turn' : ' · flip it on your turn, after an action') : ''}`;
</script>

<button class="icoin" class:split class:ult class:ready class:used class:fx={flames} style="--s:{size}px" on:click={() => ready && onPress()} title={tip} aria-label={tip}>
	{#if split && flames}
		<span class="flames" aria-hidden="true">
			{#each [0, 1, 2, 3, 4, 5, 6, 7] as k (k)}<i class="fl {k < 4 ? 'o' : 'b'}" style="--k:{k}"></i>{/each}
		</span>
	{/if}
	<span class="glow" aria-hidden="true"></span>
	<span class="face" class:flip={flipping}><img src={art(base)} alt="" draggable="false" /></span>
	<span class="halves" aria-hidden="true">
		<span class="hl"><img src={art('orange')} alt="" draggable="false" /></span>
		<span class="hr"><img src={art('blue')} alt="" draggable="false" /></span>
		<span class="seam"></span>
	</span>
	{#if ult}<span class="rim" aria-hidden="true"></span>{/if}
</button>

<style>
	.icoin { position: relative; width: var(--s); height: var(--s); padding: 0; border: 0; border-radius: 50%; background: none; cursor: default; flex: none; }
	.icoin.ready { cursor: pointer; }
	.face, .halves, .glow, .rim, .flames { position: absolute; inset: 0; border-radius: 50%; }
	.face img, .halves img { display: block; width: 100%; height: 100%; border-radius: 50%; }
	.face { box-shadow: 0 0 0 2.5px #0a1a2c, 0 0 0 3.5px #d8b36a, 0 5px 12px rgba(0, 0, 0, 0.55); }
	.face.flip { animation: flip 0.36s ease-in-out; }
	@keyframes flip { 0%, 100% { transform: scaleX(1); } 47%, 53% { transform: scaleX(0.04); } }
	/* the split: the Atlantean face on the left, the Titan face on the right, a bright seam between */
	.halves { opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
	.split .halves { opacity: 1; }
	.hl, .hr { position: absolute; inset: 0; overflow: hidden; border-radius: 50%; }
	.hl { clip-path: inset(0 50% 0 0); }
	.hr { clip-path: inset(0 0 0 50%); }
	.seam { position: absolute; left: 50%; top: 4%; bottom: 4%; width: 2px; margin-left: -1px; background: linear-gradient(180deg, transparent, #fff8e0 30%, #fff8e0 70%, transparent); box-shadow: 0 0 6px 1px rgba(255, 240, 200, 0.8); }
	/* a still two-coloured glow under the split coin (no motion: it shows with the flames off too) */
	.glow { opacity: 0; transition: opacity 0.3s ease; box-shadow: -6px 0 14px 2px rgba(239, 125, 34, 0.75), 6px 0 14px 2px rgba(47, 127, 230, 0.75); }
	.split .glow { opacity: 1; }
	/* the flames: tongues round the rim, orange on the left half, blue on the right; transform + opacity only */
	.flames { inset: -22%; pointer-events: none; }
	/* each tongue stands on the coin's centre (its foot = the turning point), hidden under the coin but its tip */
	.fl { position: absolute; left: 50%; top: 50%; width: 30%; height: 44%; margin: -44% 0 0 -15%; border-radius: 50% 50% 45% 45% / 70% 70% 30% 30%;
		transform-origin: 50% 100%; opacity: 0.85;
		--a: calc(-157.5deg + var(--k) * 37.5deg); }
	.fl.o { background: radial-gradient(60% 75% at 50% 78%, #fff1b8 0%, #ffb347 35%, #ef7d22 62%, rgba(239, 125, 34, 0) 100%); }
	.fl.b { background: radial-gradient(60% 75% at 50% 78%, #e6f6ff 0%, #8fd0ff 35%, #2f7fe6 62%, rgba(47, 127, 230, 0) 100%); --a: calc(45deg + (var(--k) - 4) * 37.5deg); }
	.fl { animation: lick 1.1s ease-in-out infinite; animation-delay: calc(var(--k) * -0.17s); }
	@keyframes lick {
		0%, 100% { transform: rotate(var(--a)) translateY(-40%) scale(0.85, 0.8); opacity: 0.55; }
		50% { transform: rotate(var(--a)) translateY(-48%) scale(1, 1.15); opacity: 0.95; }
	}
	/* the ultimate: a purple rim; ready to flip = it breathes (opacity), used this turn = the coin dims */
	.rim { box-shadow: 0 0 0 3.5px #7a4292, 0 0 10px 2px rgba(160, 90, 220, 0.6); }
	.ready.fx .rim { animation: breathe 1.6s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
	.used .face, .used .halves { opacity: 0.55; }
	.used.split .halves { opacity: 0.55; }
	@media (prefers-reduced-motion: reduce) { .fl, .ready.fx .rim { animation: none; } }
</style>
