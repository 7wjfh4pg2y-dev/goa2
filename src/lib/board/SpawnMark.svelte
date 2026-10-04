<script lang="ts">
	// An EMPTY minion spawn point (svg namespace): a thin wash of the team's colour with that minion's emblem drawn
	// as an outline, facing the way it will march, and a darker corner bracket at each corner — a mark on the
	// ground that says "a minion goes here", so new players can't take it for a minion (the pieces are solid
	// discs). Shared by both board looks.
	import { MINION_ART, type MinionRole, type MinionTeam } from './minionArt';
	import { hexPoints } from './hexgeo';
	export let c: { x: number; y: number };
	export let size = 60;
	export let team: MinionTeam = 'orange';
	export let role: MinionRole = 'melee';
	export let dir = 0;
	const COL = { orange: '#ff8a2a', blue: '#4ea3ff' };
	const DARK = { orange: '#a44a0c', blue: '#174f9e' };
	$: a = MINION_ART[team][role];
	$: k = (size * 0.5) / a.r;
	const corner = (i: number, r: number) => { const ang = (Math.PI / 180) * (60 * i - 90); return { x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) }; };
	// from each corner, a short stroke along both of its edges
	$: brackets = Array.from({ length: 6 }, (_, i) => {
		const p = corner(i, size * 0.8), l = corner(i - 1, size * 0.8), r = corner(i + 1, size * 0.8);
		const f = 0.28;
		return `M${(p.x + (l.x - p.x) * f).toFixed(1)} ${(p.y + (l.y - p.y) * f).toFixed(1)}L${p.x.toFixed(1)} ${p.y.toFixed(1)}L${(p.x + (r.x - p.x) * f).toFixed(1)} ${(p.y + (r.y - p.y) * f).toFixed(1)}`;
	}).join('');
</script>

<polygon points={hexPoints(c, size * 0.9)} fill={COL[team]} fill-opacity=".16" stroke={COL[team]} stroke-opacity=".5" stroke-width={size * 0.03} />
<path d={a.d} transform="translate({c.x.toFixed(1)} {c.y.toFixed(1)}) rotate({dir * 60 - 30}) scale({k.toFixed(4)}) translate({-a.cx} {-a.cy})"
	fill="none" stroke={COL[team]} stroke-opacity=".85" stroke-width={(size * 0.04 / k).toFixed(2)} fill-rule="evenodd" stroke-linejoin="round" />
<path d={brackets} fill="none" stroke={DARK[team]} stroke-width={size * 0.085} stroke-linecap="round" stroke-linejoin="round" />
