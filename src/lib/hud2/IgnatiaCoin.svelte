<script lang="ts">
	// Ignatia's dash button: her own copy of the tie-breaker coin, so she always sees which half of her cards
	// applies (the blue-symbol text while the coin shows the Titans, the orange one while it shows the Atlanteans).
	// A ring of ten tomoe commas is ALWAYS round the coin (the user, 2026-10-16), still and in the coin's colour: all
	// fire while the coin shows the Atlanteans, all water while it shows the Titans. Equilibrium (her silver) = both
	// halves for the rest of the round: a split coin, half Atlantean, half Titan, the ring fire on one side and water on
	// the other, and it pulses (the Dashboard effect switch). With her ultimate the ring is purple, and pulses while she
	// may flip the coin (and under Equilibrium). When the round ends the split goes and the coin shows the
	// real coin again — flipping first if the real one changed meanwhile. With her ultimate (Chaos Incarnate) the coin
	// has a purple rim and, on her own turn, can be pressed once to flip the real coin (the action ring confirms).
	import { onDestroy } from 'svelte';
	import { TOMOE, TOMOE_BODY, TOMOE_INK, TOMOE_MID, TOMOE_KEY, type Comma } from './tomoe';
	type Team = 'orange' | 'blue';
	export let face: Team = 'orange';
	export let split = false;
	export let ult = false;
	export let ready = false; // the flip can be used now
	export let used = false; // used this turn
	export let flames = true; // the Dashboard effects switch
	export let size = 46;
	/** the phone's short tools row: a smaller coin, so the ring fits */
	export let phone = false;
	export let art: (t: Team) => string;
	export let onPress: () => void = () => {};
	/** Equilibrium's motion: 'pulse' (the game) or 'blur' (a /splash-demo try: the ring spins so fast it smears into orange and blue) */
	export let eqLook: 'pulse' | 'blur' = 'pulse';

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
	// each comma's element: purple with the ultimate; else fire / water by its side under Equilibrium, or the coin's colour
	type Kind = 'fire' | 'water' | 'ult';
	const ULT = { ink: '#1d0838', body: '#8a4fd8', mid: '#e2c6ff' };
	$: kindOf = (c: Comma): Kind => (ult ? 'ult' : split ? (c.fire ? 'fire' : 'water') : face === 'orange' ? 'fire' : 'water');
	const ink = (k: Kind) => (k === 'ult' ? ULT.ink : TOMOE_INK[k]);
	const body = (k: Kind) => (k === 'ult' ? ULT.body : TOMOE_BODY[k]);
	const mid = (k: Kind) => (k === 'ult' ? ULT.mid : TOMOE_MID[k]);
	$: moving = flames && (split || (ult && ready));
	$: cs = phone ? size - 7 : size;
	const NAME: Record<Team, string> = { orange: 'Atlanteans', blue: 'Titans' };
	$: tip = split ? 'Equilibrium — either half of your cards applies this round'
		: `Tie-breaker: the ${NAME[face]} — your ${face} text applies${ult ? (ready ? ' · tap to flip it (Chaos Incarnate)' : used ? ' · flipped this turn' : ' · flip it on your turn, after an action') : ''}`;
</script>

<button class="icoin" class:split class:ult class:ready class:used class:fx={moving} class:ph={phone} class:blur={eqLook === 'blur' && split && flames} style="--s:{cs}px" on:click={() => ready && onPress()} title={tip} aria-label={tip}>
	<!-- the tomoe ring: ten commas all round, in the coin's colour; fire / water halves under Equilibrium; purple with the ultimate -->
	<span class="ring" aria-hidden="true">
		{#each TOMOE as c, k (k)}
			{@const e = kindOf(c)}
			<svg class="tm" viewBox="0 0 200 200" style="--k:{k}">
				<path d={c.d} fill="none" stroke={TOMOE_KEY} stroke-width="5.5" stroke-linejoin="round" />
				<path d={c.d} fill={body(e)} stroke={ink(e)} stroke-width="2.4" stroke-linejoin="round" />
				<circle cx={c.head[0]} cy={c.head[1]} r={c.r * 0.55} fill={mid(e)} />
				<path d={c.swirl} fill="none" stroke={ink(e)} stroke-width="1.6" stroke-linecap="round" />
			</svg>
		{/each}
	</span>
	{#if eqLook === 'blur' && split && flames}<span class="smear" aria-hidden="true"><span class="sm1"></span><span class="sm2"></span></span>{/if}
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
	/* room either side for the ring (it reaches 0.8 of the coin's size out from its centre) */
	.icoin { position: relative; width: var(--s); height: var(--s); margin: 0 calc(var(--s) * 0.34); padding: 0; border: 0; border-radius: 50%; background: none; cursor: default; flex: none; }
	.icoin.ready { cursor: pointer; }
	.face, .halves, .glow, .rim, .ring { position: absolute; inset: 0; border-radius: 50%; }
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
	.glow { opacity: 0; transition: opacity 0.3s ease; box-shadow: -5px 0 12px 1px rgba(239, 125, 34, 0.45), 5px 0 12px 1px rgba(47, 127, 230, 0.45); }
	.split .glow { opacity: 1; }
	/* the tomoe ring: drawn in a box twice the coin, under it; at rest it is still and a little dim; while it matters a
	   soft pulse runs round the ten commas (Dashboard switch) */
	.tm { opacity: 0.8; }
	.ring { inset: -50%; border-radius: 0; pointer-events: none; }
	.tm { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; transform-origin: 50% 50%; }
	.fx .tm { animation: tpulse 2s ease-in-out infinite; animation-delay: calc(var(--k) * -0.2s); }
	@keyframes tpulse { 0%, 100% { transform: scale(0.96); opacity: 0.85; } 50% { transform: scale(1.04); opacity: 1; } }
	/* the ultimate: a purple rim; ready to flip = it breathes (opacity), used this turn = the coin dims */
	.rim { box-shadow: 0 0 0 3.5px #7a4292, 0 0 10px 2px rgba(160, 90, 220, 0.6); }
	.ready.fx .rim { animation: breathe 1.6s ease-in-out infinite; }
	@keyframes breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
	.used .face, .used .halves { opacity: 0.55; }
	.used.split .halves { opacity: 0.55; }
	/* the blur try: the comma ring whips round (0.32 s a turn) under a smeared orange / blue band spinning with it, so
	   the eye reads one blur of both colours (transform only; the band's blur is static) */
	.blur .ring { animation: whirl 0.32s linear infinite; }
	.blur .tm { animation: none; opacity: 0.45; }
	.smear { position: absolute; inset: -50%; pointer-events: none; }
	.smear > span { position: absolute; inset: 0; border-radius: 50%; -webkit-mask: radial-gradient(circle, transparent 27%, #000 31%, #000 41%, transparent 46%); mask: radial-gradient(circle, transparent 27%, #000 31%, #000 41%, transparent 46%); }
	.sm1 { background: conic-gradient(from 0deg, #ff8a2a, #ffd27a 10%, #ef7d22 22%, #2f7fe6 30%, #8fd8ff 40%, #2f7fe6 50%, #ef7d22 58%, #ffd27a 68%, #ef7d22 76%, #2f7fe6 84%, #8fd8ff 92%, #ff8a2a); filter: blur(2.5px); opacity: 0.9; animation: whirl 0.24s linear infinite; }
	.sm2 { background: conic-gradient(from 90deg, transparent, rgba(255, 255, 255, 0.55) 6%, transparent 14%, transparent 50%, rgba(255, 255, 255, 0.4) 56%, transparent 64%); filter: blur(3px); animation: whirl 0.4s linear infinite; }
	@keyframes whirl { to { transform: rotate(360deg); } }
	@media (prefers-reduced-motion: reduce) { .tm, .ready.fx .rim, .blur .ring, .smear > span { animation: none; } }
</style>
