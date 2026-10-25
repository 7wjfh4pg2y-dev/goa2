<svelte:options namespace="svg" />
<script lang="ts">
	// A hero's own piece in the Ink & wash retheme: TOKENS are pointy hexes locked to the map (like KitToken: the frame
	// turns with the board, the art stays upright), MARKERS and runes round; the owner's colour washed in the band, the
	// art in ink & wash (inkArt; its own flat-topped hex drawn at its true shape and big enough that only the picture
	// shows inside the frame). Face-down mines and the companions get the crests redrawn in ink. Same props as KitToken.
	import { inkToken } from './inkArt';
	import { tokenImg, isMarkerArt } from './tokenArt';
	import { INK_TEAM, SEP } from './InkDefs.svelte';
	export let x = 0;
	export let y = 0;
	export let size = 60;
	export let token: string | undefined = undefined;
	export let color: string | undefined = undefined;
	export let team: string = 'neutral';
	export let sel = false;
	export let mine: 'down' | 'up' | undefined = undefined;
	export let peek: string | undefined = undefined;
	export let letter: string | undefined = undefined;
	export let label: string | undefined = undefined;
	export let sym: string | undefined = undefined;
	export let rot = 0;
	export let uid = 'k';
	const hex = (cx: number, cy: number, r: number) => {
		let s = '';
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; s += `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `; }
		return s.trimEnd();
	};
	$: vars = `--pc:${color ?? INK_TEAM[team] ?? '#9aa4b2'}`;
	$: img = inkToken(token) ?? tokenImg(token) ?? sym;
	$: round = !letter && mine !== 'down' && isMarkerArt(token);
	$: crest = mine === 'down' ? 'skull' : letter === 'T' ? 'gun' : letter === 'P' ? 'dragon' : null;
	$: k = (size * (round ? 0.62 : 0.8)) / 100; // board units per drawing unit
	$: turn = rot ? `rotate(${rot} ${x} ${y})` : '';
</script>

{#if round}
	<use href="#ik-kit-round" transform="translate({x} {y}) scale({k})" style={vars} pointer-events="none" />
	<clipPath id="ik-{uid}"><circle cx={x} cy={y} r={81 * k} /></clipPath>
	{#if img}<image href={img} x={x - 81 * k} y={y - 81 * k} width={162 * k} height={162 * k} clip-path="url(#ik-{uid})" preserveAspectRatio="xMidYMid meet" pointer-events="none" />{/if}
	<use href="#ik-ring-round" transform="translate({x} {y}) scale({k})" pointer-events="none" />
	{#if sel}<circle cx={x} cy={y} r={101 * k} fill="none" stroke="#fde047" stroke-width={size * 0.06} />{/if}
{:else}
	<!-- the frame: locked to the map's hexes -->
	<g transform={turn}>
		<use href="#ik-kit-hex" transform="translate({x} {y}) scale({k})" style={vars} pointer-events="none" />
		{#if crest}<polygon points={hex(x, y, 84 * k)} style={vars + '; fill: var(--pc)'} fill-opacity=".42" pointer-events="none" />{/if}
	</g>
	<clipPath id="ik-{uid}"><polygon points={hex(x, y, 84 * k)} transform={turn || undefined} /></clipPath>
	{#if crest}
		<use href="#ik-crest-{crest}" x={x - 81 * k} y={y - 81 * k} width={162 * k} height={162 * k} pointer-events="none" />
	{:else if img}
		<image href={img} x={x - 110 * k} y={y - 95.3 * k} width={220 * k} height={190.5 * k} preserveAspectRatio="xMidYMid meet" clip-path="url(#ik-{uid})" pointer-events="none" />
	{:else if letter || label}
		<text {x} {y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.62} font-weight="800" fill={SEP} pointer-events="none">{letter ?? label?.[0]}</text>
	{/if}
	<g transform={turn}>
		<use href="#ik-ring-hex" transform="translate({x} {y}) scale({k})" pointer-events="none" />
		{#if sel}<polygon points={hex(x, y, 101 * k)} fill="none" stroke="#fde047" stroke-width={size * 0.06} stroke-linejoin="round" />{/if}
	</g>
	{#if peek}
		<!-- only its owner sees which mine this is -->
		<circle cx={x + size * 0.5} cy={y + size * 0.44} r={size * 0.2} fill={SEP} stroke="#ecdfc3" stroke-width={size * 0.04} pointer-events="none" />
		<text x={x + size * 0.5} y={y + size * 0.45} text-anchor="middle" dominant-baseline="central" font-size={size * 0.24} fill="#ecdfc3" pointer-events="none">{peek}</text>
	{/if}
{/if}
<!-- the click target -->
<circle cx={x} cy={y} r={size * 0.7} fill="transparent" />
