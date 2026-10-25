<svelte:options namespace="svg" />
<script lang="ts">
	// A hero's piece in the Ink & wash retheme: the frame from InkDefs (#ik-hero: the player's colour outside, the
	// team's inside, washed, ink rings between) and the portrait in ink & wash (inkArt). Same props as HeroToken.
	import { inkFace } from './inkArt';
	import { INK_TEAM } from './InkDefs.svelte';
	export let x = 0;
	export let y = 0;
	export let r = 46;
	export let hero: string | undefined = undefined;
	export let team: string = 'orange';
	export let color: string | undefined = undefined;
	export let uid = 'h';
	export let sym: string | undefined = undefined;
	export let label: string | undefined = undefined;
	export let face: number | undefined = undefined;
	$: k = r / 100;
	$: img = inkFace(hero, face);
	$: vars = `--pc:${color ?? INK_TEAM[team] ?? '#9aa4b2'}; --tc:${INK_TEAM[team] ?? '#9aa4b2'}`;
</script>

<use href="#ik-hero" transform="translate({x} {y}) scale({k})" style={vars} pointer-events="none" />
{#if img}
	<clipPath id="ip-{uid}"><circle cx={x} cy={y} r={r * 0.72} /></clipPath>
	<image href={img} x={x - r * 0.74} y={y - r * 0.74} width={r * 1.48} height={r * 1.48} clip-path="url(#ip-{uid})" preserveAspectRatio="xMidYMid slice" pointer-events="none" />
{:else if sym}
	<image href={sym} x={x - r * 0.55} y={y - r * 0.55} width={r * 1.1} height={r * 1.1} preserveAspectRatio="xMidYMid meet" pointer-events="none" />
{:else if label}
	<text {x} {y} text-anchor="middle" dominant-baseline="central" font-size={r * 0.9} font-weight="800" fill="#3b2614" pointer-events="none">{label}</text>
{/if}
<use href="#ik-ring73" transform="translate({x} {y}) scale({k})" pointer-events="none" />
<!-- the click target -->
<circle cx={x} cy={y} {r} fill="transparent" />
