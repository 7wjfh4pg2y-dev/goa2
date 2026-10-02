<svelte:options namespace="svg" />
<script lang="ts">
	// A piece a hero puts on the board. TOKENS are hexes, which sets them apart from the round
	// heroes and minions; MARKERS (poison, bounty, runes) are round. Either way the rim is the
	// owner's colour. Needs PieceDefs on the page (the crests).
	// A token's hex is a small copy of the MAP hex it stands on: same orientation, corners
	// pointing at the map hex's corners — and it stays locked to the map when the board is
	// turned, while the art inside stays upright on screen. (The board draws every piece
	// counter-rotated by the board's rotation; `rot` turns just the frame back.) The painted
	// art is a flat-topped hex of its own, so it is drawn a little larger and clipped to the frame.
	import { tokenImg, isMarkerArt } from './tokenArt';
	export let x = 0;
	export let y = 0;
	/** the map's hex size (centre → corner); the token is sized from it */
	export let size = 60;
	/** the art's name: token_tree, marker_poison, rune_axe_marker … */
	export let token: string | undefined = undefined;
	/** the owner's colour (hex); falls back to the team's */
	export let color: string | undefined = undefined;
	export let team: string = 'neutral';
	/** picked up: the edge turns yellow */
	export let sel = false;
	/** Min's mines: 'down' = skull side up (what it is stays secret) */
	export let mine: 'down' | 'up' | undefined = undefined;
	/** the owner's private reminder of which mine this is */
	export let peek: string | undefined = undefined;
	/** a companion with no painted art: T = Trinkets' Turret, P = Widget's Pyro */
	export let letter: string | undefined = undefined;
	export let label: string | undefined = undefined;
	export let sym: string | undefined = undefined;
	/** the board's rotation on screen (degrees): the frame turns with the map, the art does not */
	export let rot = 0;
	/** unique on the page (the art's clip path) */
	export let uid = 'k';

	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	// a pointy-topped hexagon (a corner straight up), like the map's
	const hex = (cx: number, cy: number, r: number) => {
		let s = '';
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 2; s += `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `; }
		return s.trimEnd();
	};
	const FACE = 0.64; // the face's corner radius, in map-hex sizes
	$: turn = rot ? `rotate(${rot} ${x} ${y})` : undefined;
	$: band = color ?? TEAM[team] ?? '#9aa4b2';
	$: edge = sel ? '#fde047' : '#0d1118';
	$: img = tokenImg(token) ?? sym;
	$: round = !letter && mine !== 'down' && isMarkerArt(token);
</script>

{#if round}
	<circle cx={x} cy={y} r={size * 0.62} fill={edge} />
	<circle cx={x} cy={y} r={size * 0.575} fill={band} />
	<circle cx={x} cy={y} r={size * 0.505} fill="#0d1118" />
	{#if img}<image href={img} x={x - size * 0.5} y={y - size * 0.5} width={size} height={size} preserveAspectRatio="xMidYMid meet" pointer-events="none" />{/if}
{:else}
	<!-- the frame: locked to the map's hexes -->
	<g transform={turn}>
		<polygon points={hex(x, y, size * 0.8)} fill={edge} stroke={edge} stroke-width={size * 0.03} stroke-linejoin="round" />
		<polygon points={hex(x, y, size * 0.75)} fill={band} />
		<polygon points={hex(x, y, size * 0.705)} fill="none" stroke="#fff" stroke-opacity=".26" stroke-width={size * 0.025} stroke-linejoin="round" pointer-events="none" />
		<polygon points={hex(x, y, size * (FACE + 0.012))} fill={mine === 'down' ? 'none' : '#0d1118'} stroke={mine === 'down' ? '#3a2a12' : 'none'} stroke-opacity=".5" stroke-width={size * 0.035} stroke-linejoin="round" />
	</g>
	<clipPath id="kt-{uid}"><polygon points={hex(x, y, size * FACE)} transform={turn} /></clipPath>
	<!-- what is on it: always upright on screen -->
	{#if mine === 'down'}
		<use href="#crest-skull" x={x - size * 0.53} y={y - size * 0.53} width={size * 1.06} height={size * 1.06} pointer-events="none" />
	{:else if letter === 'T'}
		<use href="#crest-gun" x={x - size * 0.58} y={y - size * 0.58} width={size * 1.16} height={size * 1.16} pointer-events="none" />
	{:else if letter === 'P'}
		<use href="#crest-dragon" x={x - size * 0.58} y={y - size * 0.58} width={size * 1.16} height={size * 1.16} pointer-events="none" />
	{:else if img}
		<!-- the art's own hex is flat-topped: drawn big enough to cover the frame at any turn, then clipped to it -->
		<image href={img} x={x - size * 0.75} y={y - size * 0.65} width={size * 1.5} height={size * 1.3} preserveAspectRatio="xMidYMid meet" clip-path="url(#kt-{uid})" pointer-events="none" />
	{:else if letter || label}
		<text {x} {y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.62} font-weight="800" fill="#f6ead2" pointer-events="none">{letter ?? label?.[0]}</text>
	{/if}
	{#if peek}
		<!-- only its owner sees which mine this is -->
		<circle cx={x + size * 0.5} cy={y + size * 0.44} r={size * 0.2} fill="#0b1220" stroke="#f4ecd8" stroke-width={size * 0.04} pointer-events="none" />
		<text x={x + size * 0.5} y={y + size * 0.45} text-anchor="middle" dominant-baseline="central" font-size={size * 0.24} fill="#f4ecd8" pointer-events="none">{peek}</text>
	{/if}
{/if}
