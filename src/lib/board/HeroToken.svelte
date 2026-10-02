<svelte:options namespace="svg" />
<script lang="ts">
	// A hero's piece on the board: built like the minion tokens (dark rim, the team's copper /
	// ice from MinionDefs) but bigger, with the PLAYER's colour as the outer band and the hero's
	// face filling the middle (heroes.ts frames each face). Needs PieceDefs on the page.
	import { portraitRect } from '$lib/heroes';
	export let x = 0;
	export let y = 0;
	/** the token's radius */
	export let r = 46;
	export let hero: string | undefined = undefined;
	export let team: string = 'orange';
	/** the player's colour (hex) — the outer band */
	export let color: string | undefined = undefined;
	/** unique on the page (the portrait's clip path) */
	export let uid = 'h';
	/** fallbacks when there is no hero art: an emblem image, or a letter */
	export let sym: string | undefined = undefined;
	export let label: string | undefined = undefined;

	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	$: pr = hero ? portraitRect(hero, x, y, r * 1.39) : null;
</script>

<circle cx={x} cy={y} {r} fill="#0d1118" />
<circle cx={x} cy={y} r={r * 0.95} fill={color ?? TEAM[team] ?? '#9aa4b2'} />
<circle cx={x} cy={y} r={r * 0.885} fill="none" stroke="#fff" stroke-opacity=".3" stroke-width={r * 0.035} stroke-linecap="round"
	stroke-dasharray="{r * 1.15} {r * 6}" transform="rotate(-150 {x} {y})" pointer-events="none" />
<circle cx={x} cy={y} r={r * 0.82} fill="#0d1118" />
<circle cx={x} cy={y} r={r * 0.795} fill={team === 'orange' ? 'url(#mn-face-orange)' : team === 'blue' ? 'url(#mn-face-blue)' : '#9aa4b2'} />
<circle cx={x} cy={y} r={r * 0.715} fill="#0d1118" />
{#if pr}
	<clipPath id="pc-{uid}"><circle cx={x} cy={y} r={r * 0.695} /></clipPath>
	<image href={pr.href} x={pr.x} y={pr.y} width={pr.w} height={pr.h} clip-path="url(#pc-{uid})" preserveAspectRatio="none" pointer-events="none" />
	<circle cx={x} cy={y} r={r * 0.675} fill="none" stroke="#000" stroke-opacity=".28" stroke-width={r * 0.045} pointer-events="none" />
{:else if sym}
	<image href={sym} x={x - r * 0.6} y={y - r * 0.6} width={r * 1.2} height={r * 1.2} preserveAspectRatio="xMidYMid meet" pointer-events="none" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))" />
{:else if label}
	<text {x} {y} text-anchor="middle" dominant-baseline="central" font-size={r * 0.9} font-weight="800" fill="#f6ead2" pointer-events="none">{label}</text>
{/if}
