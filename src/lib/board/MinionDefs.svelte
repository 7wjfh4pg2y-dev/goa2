<svelte:options namespace="svg" />
<script lang="ts">
	// Everything minion, defined once for the page (goes inside an svg's <defs>):
	//   #mn-art-<team>-<role>    the emblem lifted from the 3D model (fill with the even-odd rule)
	//   #mn-top-<team>-<role>    the face of the piece with its emblem, radius 81
	//   #mn-rim-<team>-<role>    the pips that ride round the dark rim (radius 100)
	//   #mn-token-<team>-<role>  the whole piece, standing still (the ghost under the cursor)
	// On the board the rim is NOT drawn here: BoardCanvas puts each minion's rim in its own little
	// html layer under the pieces and lets the GPU turn it (see `.rims` there).
	// Other svgs on the page (the island's own svg) can <use> these too.
	// The Atlanteans are copper machines, the Titans are ice. A token's TYPE reads from the pips
	// on its rim even when it is too small to make the emblem out: 4 = ranged, 6 = melee,
	// 8 = heavy. The pips turn (clockwise for the Atlanteans, anticlockwise for the Titans), which
	// is also what tells a minion standing on a spawn point from the spawn point's own engraving.
	import { MINION_ART, type MinionTeam, type MinionRole } from './minionArt';
	const TEAMS: MinionTeam[] = ['orange', 'blue'];
	const ROLES: MinionRole[] = ['melee', 'ranged', 'heavy'];
	const PIPS: Record<MinionRole, number> = { ranged: 4, melee: 6, heavy: 8 };
	const LOOK = {
		orange: { rim: '#34180a', ink: '#3a1906', halo: '#ffe2b4', light: '#ffd49a', pip: '#ffc27a' },
		blue: { rim: '#0b2140', ink: '#0f2f5c', halo: '#f4fbff', light: '#d2efff', pip: '#c4ecff' }
	};
	const FACE = 81; // the face's radius; the rim runs from here to 100
	const FIT = 64; // the emblem's radius on the face
</script>

<radialGradient id="mn-face-orange" cx="0.42" cy="0.36" r="0.8"><stop offset="0" stop-color="#ffcb8e" /><stop offset=".5" stop-color="#e58434" /><stop offset="1" stop-color="#a34e14" /></radialGradient>
<radialGradient id="mn-face-blue" cx="0.42" cy="0.36" r="0.8"><stop offset="0" stop-color="#f3fbff" /><stop offset=".5" stop-color="#97d3f6" /><stop offset="1" stop-color="#3c8ed2" /></radialGradient>

{#each TEAMS as team}
	{#each ROLES as role}
		{@const a = MINION_ART[team][role]}
		{@const k = FIT / a.r}
		<path id="mn-art-{team}-{role}" d={a.d} />
		<g id="mn-top-{team}-{role}">
			<circle r={FACE} fill="url(#mn-face-{team})" />
			<circle r={FACE - 1.5} fill="none" stroke={LOOK[team].light} stroke-opacity=".55" stroke-width="3" />
			<!-- the models are flat-topped hexes; turned 30° they sit on the board's pointy-top hexes facing a neighbour -->
			<use href="#mn-art-{team}-{role}" transform="rotate(-30) scale({k.toFixed(4)}) translate({-a.cx} {-a.cy})"
				fill={LOOK[team].ink} fill-rule="evenodd" stroke={LOOK[team].halo} stroke-opacity=".75" stroke-width={(3.2 / k).toFixed(2)} stroke-linejoin="round" paint-order="stroke" />
		</g>
		<g id="mn-rim-{team}-{role}">
			<circle r="100" fill={LOOK[team].rim} />
			<circle r="99" fill="none" stroke={LOOK[team].light} stroke-opacity=".28" stroke-width="1.6" />
			{#each Array(PIPS[role]) as _, i}
				<rect transform="rotate({(i * 360) / PIPS[role]})" x="-10.5" y="-97.5" width="21" height="13.5" rx="6" fill={LOOK[team].pip} stroke={LOOK[team].rim} stroke-width="1.4" />
			{/each}
		</g>
		<g id="mn-token-{team}-{role}"><use href="#mn-rim-{team}-{role}" /><use href="#mn-top-{team}-{role}" /></g>
	{/each}
{/each}
