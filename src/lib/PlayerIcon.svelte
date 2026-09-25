<script lang="ts">
	// THE player icon, used everywhere a player is shown (dash, boards, the
	// right-hand rows, the reveal): the hero's portrait framed on its face, an
	// inner ring in the team colour and an outer ring in the player's own colour.
	// The board piece (BoardCanvas) draws the same thing in SVG.
	import { portraitCss } from '$lib/heroes';

	export let hero: string;
	export let team: 'orange' | 'blue' | string = 'orange';
	export let color = '#94a3b8'; // the player's chosen colour (hex)
	export let size = '2.5rem';
	export let ring = 3; // px per ring
	export let ult = false; // level-8 glow

	const TEAM_HEX: Record<string, string> = { orange: '#ef7d22', blue: '#2f7fe6' };
</script>

<span class="picon" class:ult style="--sz:{size}; --tc:{TEAM_HEX[team] ?? '#94a3b8'}; --pc:{color}; --rg:{ring}px">
	<span class="face" style={hero ? portraitCss(hero) : ''}></span>
	<slot />
</span>

<style>
	.picon { position: relative; flex: none; display: inline-block; width: var(--sz); height: var(--sz); border-radius: 50%;
		border: var(--rg) solid var(--tc); box-shadow: 0 0 0 var(--rg) var(--pc), 0 2px 8px calc(var(--rg) * 0.5) rgba(0, 0, 0, 0.55);
		margin: var(--rg); background: #0b101a; }
	.face { position: absolute; inset: 0; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; }
	.picon.ult { box-shadow: 0 0 0 var(--rg) var(--pc), 0 0 12px 3px rgba(165, 110, 230, 0.75); }
</style>
