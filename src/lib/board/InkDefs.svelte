<svelte:options namespace="svg" />
<script lang="ts" module>
	// Every drawing the Ink & wash pieces share (put it inside an svg's <defs>, once per page), in a 100-unit space:
	//   #ik-hero          a hero token's frame: the player's colour (--pc) washed in the outer band, the team's (--tc)
	//                     in the inner band, ink rings between, a paper window r 73 for the portrait
	//   #ik-ring73        the ink ring that goes over the portrait's edge
	//   #ik-mn-top-<team>-<role> / #ik-mn-rim-… / #ik-mn-token-…   the minion ink STAMP (paper face, the model's emblem in
	//                     the team's ink; the rim = a team wash with paper pips: 4 ranged, 6 melee, 8 heavy — it turns
	//                     in the board's rims layer like the island's)
	//   #ik-kit-hex / #ik-kit-round   a kit token's frame (pointy hex / round), the owner's colour (--pc) washed
	//   #ik-ring-hex / #ik-ring-round  the ink line over the art's edge
	//   #ik-crest-*       the three crests redrawn in ink
	// Watercolour = a soft bleed, the wash, paler / darker blooms and pigment pooled at the wet edge; ink = two passes
	// a little off true. Wobbles come from a fixed seed, so every page draws the same pieces.
	import { MINION_ART, type MinionRole, type MinionTeam } from './minionArt';
	import dragon from './crests/dragon.svg?raw';
	import gun from './crests/gun.svg?raw';
	import skull from './crests/skull.svg?raw';
	export const PAPER = '#ecdfc3';
	export const SEP = '#3b2614';
	export const INK_TEAM: Record<string, string> = { orange: 'hsl(24 70% 52%)', blue: 'hsl(205 58% 56%)' };
	export const INK_EMBLEM: Record<string, string> = { orange: '#6a2c0a', blue: '#163c70' };
	let seed = 29;
	const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const f = (n: number) => n.toFixed(1);
	const hexPts = (R: number, ox = 0, oy = 0) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${f(ox + R * Math.cos(a))},${f(oy + R * Math.sin(a))}`; }).join(' ');
	// two ink passes, a little off true
	const ring = (r: number) => [0, 1].map(() => ({ x: (rnd() - 0.5) * 1.2, y: (rnd() - 0.5) * 1.2, r: r + (rnd() - 0.5) * 1.2 }));
	const hexRing = (r: number) => [0, 1].map(() => hexPts(r + (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2, (rnd() - 0.5) * 1.2));
	const blooms = (R: number, n: number) => Array.from({ length: n }, () => {
		const a = rnd() * 6.28, d = rnd() * R * 0.55;
		return { x: Math.cos(a) * d, y: Math.sin(a) * d, rx: R * (0.18 + rnd() * 0.2), ry: R * (0.12 + rnd() * 0.14), r: Math.round(rnd() * 180), light: rnd() < 0.5 };
	});
	const wash = (R: number) => ({ bx: (rnd() - 0.5) * 8, by: (rnd() - 0.5) * 8, R, blooms: blooms(R, 4) });
	const W99 = wash(99), W84 = wash(84), WM = { orange: wash(99), blue: wash(99) }, WH = wash(99);
	const R99 = ring(99), R85 = ring(85), R73 = ring(73), R80 = ring(80), RM99 = ring(99), RK99 = ring(99), RK82 = ring(82);
	const H99 = hexRing(99), H85 = hexRing(85);
	const HB = { x: (rnd() - 0.5) * 8, y: (rnd() - 0.5) * 8 }, HBL = blooms(90, 3);
	const PIPS: Record<MinionRole, number> = { ranged: 4, melee: 6, heavy: 8 };
	const TEAMS: MinionTeam[] = ['orange', 'blue'];
	const ROLES: MinionRole[] = ['melee', 'ranged', 'heavy'];
	const MAP: Record<string, string> = { '#12161e': SEP, '#f4ecd9': PAPER, '#fffaf0': '#f6eedb', '#ffffff': '#f6eedb', '#dccfb0': '#d8c4a0', '#e3d8bd': '#dccaa6', '#2c8f9c': '#6b4d30', '#4cc2c8': '#a88a64', '#ef7d22': '#8f5e34', '#ffd166': '#cdb183', '#f6b48a': '#c9a37c' };
	const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/#[0-9a-fA-F]{6}/g, (c) => MAP[c.toLowerCase()] ?? c);
	const CRESTS = { dragon: inner(dragon), gun: inner(gun), skull: inner(skull) };
</script>

{#snippet washDisc(w: ReturnType<typeof wash>, fill: string, a: number)}
	<circle cx={f(w.bx)} cy={f(w.by)} r={w.R + 5} style="fill:{fill}" fill-opacity=".18" />
	<circle r={w.R} style="fill:{fill}" fill-opacity={a} />
	{#each w.blooms as b}<ellipse cx={f(b.x)} cy={f(b.y)} rx={f(b.rx)} ry={f(b.ry)} transform="rotate({b.r})" fill={b.light ? '#fff6e2' : '#2a1606'} fill-opacity={b.light ? 0.16 : 0.08} />{/each}
	<circle r={w.R - 3} fill="none" stroke="#2a1606" stroke-opacity=".16" stroke-width="6" />
{/snippet}
{#snippet ink(rs: ReturnType<typeof ring>, w: number)}
	{#each rs as r, i}<circle cx={f(r.x)} cy={f(r.y)} r={f(r.r)} fill="none" stroke={SEP} stroke-width={i ? w * 0.55 : w} opacity={i ? 0.7 : 1} />{/each}
{/snippet}

<g id="ik-hero">
	<circle r="100" fill={PAPER} />
	{@render washDisc(W99, 'var(--pc)', 0.78)}
	{@render ink(R99, 4.5)}
	<circle r="85" fill={PAPER} />
	{@render washDisc(W84, 'var(--tc)', 0.75)}
	{@render ink(R85, 3.2)}
	<circle r="73" fill={PAPER} />
</g>
<g id="ik-ring73">{@render ink(R73, 3.6)}</g>

{#each TEAMS as team}
	{#each ROLES as role}
		{@const a = MINION_ART[team][role]}
		{@const k = 62 / a.r}
		<g id="ik-mn-rim-{team}-{role}">
			<circle r="100" fill={PAPER} />
			{@render washDisc(WM[team], INK_TEAM[team], 0.7)}
			{@render ink(RM99, 4.5)}
			{#each Array(PIPS[role]) as _, i}<circle transform="rotate({(i * 360) / PIPS[role]})" cy="-90.5" r="6.4" fill={PAPER} stroke={SEP} stroke-width="2.4" />{/each}
		</g>
		<g id="ik-mn-top-{team}-{role}">
			<circle r="80" fill={PAPER} />
			{@render ink(R80, 3.4)}
			<path d={a.d} fill-rule="evenodd" transform="rotate(-30) scale({k.toFixed(4)}) translate({-a.cx} {-a.cy})" fill={INK_EMBLEM[team]} />
		</g>
		<g id="ik-mn-token-{team}-{role}"><use href="#ik-mn-rim-{team}-{role}" /><use href="#ik-mn-top-{team}-{role}" /></g>
	{/each}
{/each}

<g id="ik-kit-hex">
	<polygon points={hexPts(100)} fill={PAPER} />
	<polygon points={hexPts(104, HB.x, HB.y)} style="fill:var(--pc)" fill-opacity=".18" />
	<polygon points={hexPts(99)} style="fill:var(--pc)" fill-opacity=".78" />
	{#each HBL as b}<ellipse cx={f(b.x)} cy={f(b.y)} rx={f(b.rx)} ry={f(b.ry)} transform="rotate({b.r})" fill={b.light ? '#fff6e2' : '#2a1606'} fill-opacity={b.light ? 0.16 : 0.08} />{/each}
	{#each H99 as p, i}<polygon points={p} fill="none" stroke={SEP} stroke-width={i ? 2.5 : 4.5} stroke-linejoin="round" opacity={i ? 0.7 : 1} />{/each}
	<polygon points={hexPts(85)} fill={PAPER} />
</g>
<g id="ik-ring-hex">{#each H85 as p, i}<polygon points={p} fill="none" stroke={SEP} stroke-width={i ? 1.9 : 3.4} stroke-linejoin="round" opacity={i ? 0.7 : 1} />{/each}</g>
<g id="ik-kit-round">
	<circle r="100" fill={PAPER} />
	{@render washDisc(WH, 'var(--pc)', 0.78)}
	{@render ink(RK99, 4.5)}
	<circle r="82" fill={PAPER} />
</g>
<g id="ik-ring-round">{@render ink(RK82, 3.4)}</g>
{#each Object.entries(CRESTS) as [name, body]}
	<symbol id="ik-crest-{name}" viewBox="-50 -50 100 100">{@html body}</symbol>
{/each}
