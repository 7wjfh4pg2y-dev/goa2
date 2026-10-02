<svelte:options namespace="svg" />
<script lang="ts">
	// A piece a hero puts on the board. TOKENS are flat-topped hexes (the painted token art is
	// already that shape, and it sets them apart from the round heroes and minions and from the
	// pointy-topped map hexes they stand on — they are smaller than a map hex); MARKERS (poison,
	// bounty, runes) are round. Either way the rim is the owner's colour. Needs PieceDefs on the
	// page (the mine's skull).
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

	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	// a flat-topped hexagon: corners left and right
	const hex = (cx: number, cy: number, r: number) => {
		let s = '';
		for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; s += `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)} `; }
		return s.trimEnd();
	};
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
	<polygon points={hex(x, y, size * 0.76)} fill={edge} stroke={edge} stroke-width={size * 0.03} stroke-linejoin="round" />
	<polygon points={hex(x, y, size * 0.705)} fill={band} />
	<polygon points={hex(x, y, size * 0.665)} fill="none" stroke="#fff" stroke-opacity=".26" stroke-width={size * 0.025} stroke-linejoin="round" pointer-events="none" />
	{#if mine === 'down'}
		<!-- a mine, face down: the owner's colour, a brass line, skull & crossbones -->
		<polygon points={hex(x, y, size * 0.6)} fill="none" stroke="#3a2a12" stroke-opacity=".55" stroke-width={size * 0.05} stroke-linejoin="round" pointer-events="none" />
		<polygon points={hex(x, y, size * 0.6)} fill="none" stroke="#e2bd72" stroke-opacity=".9" stroke-width={size * 0.022} stroke-linejoin="round" pointer-events="none" />
		<use href="#mine-skull" x={x - size * 0.56} y={y - size * 0.56} width={size * 1.12} height={size * 1.12} pointer-events="none" />
	{:else}
		<polygon points={hex(x, y, size * 0.625)} fill="#0d1118" />
		{#if letter === 'T'}
			<!-- Trinkets' Turret, from above: a round mount and a barrel -->
			<g transform="translate({x} {y}) scale({size})" pointer-events="none">
				<circle r=".34" fill="#3b4252" stroke="#aab2c0" stroke-width=".035" />
				{#each [45, 135, 225, 315] as a}<circle transform="rotate({a})" cx=".27" cy="0" r=".035" fill="#aab2c0" />{/each}
				<rect x="-.075" y="-.52" width=".15" height=".42" rx=".03" fill="#8a93a3" stroke="#0d1118" stroke-width=".025" />
				<rect x="-.1" y="-.56" width=".2" height=".09" rx=".03" fill="#c7cdd8" stroke="#0d1118" stroke-width=".025" />
				<circle r=".17" fill="#c7cdd8" stroke="#0d1118" stroke-width=".03" /><circle r=".06" fill="#e0794a" />
			</g>
		{:else if letter === 'P'}
			<!-- Widget's Pyro: a flame -->
			<g transform="translate({x} {y}) scale({size})" pointer-events="none">
				<path d="M0 -.46C.2 -.24 .34 -.04 .32 .16C.3 .36 .15 .46 0 .46C-.15 .46 -.3 .36 -.32 .16C-.34 0 -.14 -.1 -.1 -.3C-.03 -.24 0 -.36 0 -.46Z" fill="#f2682a" stroke="#7a1e08" stroke-width=".03" stroke-linejoin="round" />
				<path d="M0 -.16C.1 -.04 .18 .08 .17 .2C.16 .32 .08 .38 0 .38C-.08 .38 -.16 .32 -.17 .2C-.18 .1 -.06 .02 0 -.16Z" fill="#ffd166" />
			</g>
		{:else if img}
			<image href={img} x={x - size * 0.62} y={y - size * 0.537} width={size * 1.24} height={size * 1.074} preserveAspectRatio="xMidYMid meet" pointer-events="none" />
		{:else if letter || label}
			<text {x} {y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.62} font-weight="800" fill="#f6ead2" pointer-events="none">{letter ?? label?.[0]}</text>
		{/if}
	{/if}
	{#if peek}
		<!-- only its owner sees which mine this is -->
		<circle cx={x + size * 0.5} cy={y + size * 0.44} r={size * 0.2} fill="#0b1220" stroke="#f4ecd8" stroke-width={size * 0.04} pointer-events="none" />
		<text x={x + size * 0.5} y={y + size * 0.45} text-anchor="middle" dominant-baseline="central" font-size={size * 0.24} fill="#f4ecd8" pointer-events="none">{peek}</text>
	{/if}
{/if}
