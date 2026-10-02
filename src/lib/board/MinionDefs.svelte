<svelte:options namespace="svg" />
<script lang="ts">
	// Everything minion, defined once for the page (goes inside an svg's <defs>):
	//   #mn-art-<team>-<role>    the emblem lifted from the 3D model (fill with the even-odd rule)
	//   #mn-token-<team>-<role>  the piece that stands on the board, radius 100
	//   #mn-role-<role>          a small glyph for the type (radius 10): sword / bullseye / shield
	// Other svgs on the page (the island's own svg) can <use> these too.
	// The Atlanteans are copper machines, the Titans are ice. A token's TYPE reads from its rim
	// even when it is too small to make the emblem out: plain = melee, four notches = ranged,
	// a thick studded rim = heavy.
	import { MINION_ART, type MinionTeam, type MinionRole } from './minionArt';
	const TEAMS: MinionTeam[] = ['orange', 'blue'];
	const ROLES: MinionRole[] = ['melee', 'ranged', 'heavy'];
	const LOOK = {
		orange: { rim: '#3a1c07', ink: '#3a1906', halo: '#ffe2b4', light: '#ffd49a' },
		blue: { rim: '#0c2444', ink: '#0f2f5c', halo: '#f4fbff', light: '#d2efff' }
	};
	const fit = (role: MinionRole) => (role === 'heavy' ? 64 : 71); // the emblem's radius on the token
</script>

<radialGradient id="mn-face-orange" cx="0.42" cy="0.36" r="0.8"><stop offset="0" stop-color="#ffcb8e" /><stop offset=".5" stop-color="#e58434" /><stop offset="1" stop-color="#a34e14" /></radialGradient>
<radialGradient id="mn-face-blue" cx="0.42" cy="0.36" r="0.8"><stop offset="0" stop-color="#f3fbff" /><stop offset=".5" stop-color="#97d3f6" /><stop offset="1" stop-color="#3c8ed2" /></radialGradient>

{#each TEAMS as team}
	{#each ROLES as role}
		{@const a = MINION_ART[team][role]}
		{@const k = fit(role) / a.r}
		{@const face = role === 'heavy' ? 81 : 89}
		<path id="mn-art-{team}-{role}" d={a.d} />
		<g id="mn-token-{team}-{role}">
			<circle r="100" fill={LOOK[team].rim} />
			{#if role === 'heavy'}
				{#each [0, 45, 90, 135, 180, 225, 270, 315] as deg}<circle transform="rotate({deg})" cx="0" cy="-90.5" r="5.2" fill={LOOK[team].light} />{/each}
			{:else if role === 'ranged'}
				{#each [0, 90, 180, 270] as deg}<rect transform="rotate({deg})" x="-7.5" y="-101" width="15" height="13" fill={LOOK[team].light} />{/each}
			{/if}
			<circle r={face} fill="url(#mn-face-{team})" />
			<circle r={face - 1.5} fill="none" stroke={LOOK[team].light} stroke-opacity=".55" stroke-width="3" />
			<!-- the models are flat-topped hexes; turned 30° they sit on the board's pointy-top hexes facing a neighbour -->
			<use href="#mn-art-{team}-{role}" transform="rotate(-30) scale({k.toFixed(4)}) translate({-a.cx} {-a.cy})"
				fill={LOOK[team].ink} fill-rule="evenodd" stroke={LOOK[team].halo} stroke-opacity=".75" stroke-width={(3.2 / k).toFixed(2)} stroke-linejoin="round" paint-order="stroke" />
		</g>
	{/each}
{/each}

<g id="mn-role-melee" stroke="none">
	<path d="M0 -8.2L2.5 1.2H-2.5Z" /><rect x="-4.8" y="1.2" width="9.6" height="2.1" rx="1" /><rect x="-1.2" y="3.3" width="2.4" height="4.6" rx="1.1" />
</g>
<g id="mn-role-ranged">
	<circle r="5.7" fill="none" stroke-width="1.9" /><circle r="2" stroke="none" />
	<path d="M0 -8.6V-5.7M0 8.6V5.7M-8.6 0H-5.7M8.6 0H5.7" fill="none" stroke-width="1.9" stroke-linecap="round" />
</g>
<g id="mn-role-heavy" stroke="none">
	<path d="M0 -8L6.6 -5.3V.4C6.6 4.3 3.6 6.9 0 8.2C-3.6 6.9 -6.6 4.3 -6.6 .4V-5.3Z" />
</g>
