<svelte:options namespace="svg" />
<script lang="ts">
	// An opening's marks, drawn in board units inside any svg that shares the board's coordinates (BoardCanvas's
	// `under` / `over` layers, or a snapshot's own svg). Upright whatever the board's turn: every chip, token and
	// label is turned back by `rot` round its own centre, like the pieces. The compendium's look: turn chips in the
	// card's colour ("T2"), dimmed for an alternative route, split in two for a hybrid (either card), a dashed rim when
	// the hero acts from where it stands (no move); rings round the minion taken; arrows; shaded areas;
	// E / A discs (or real hero tokens); labels. `step` > 0 = one turn of a walk-through: that turn's marks bright,
	// earlier turns faded (later ones are already filtered out by the caller).
	import HeroToken from '$lib/board/HeroToken.svelte';
	import KitToken from '$lib/board/KitToken.svelte';
	import { outlineLoops, loopsPath } from '$lib/board/hexgeo';
	import { COMPANIONS } from '$lib/tokens';
	import { CARD_HEX, MARK_HEX, type Mark, type Side, type StepMark } from '$lib/openings';

	export let marks: Mark[] = [];
	export let layer: 'under' | 'over' = 'over';
	export let size = 60;
	export let at: (hex: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });
	export let rot = 0;
	export let step = 0;
	/** the opening's side: allies (A) and its own tokens wear this team, enemies (E) the other */
	export let side: Side = 'blue';
	export let hero = '';
	/** unique on the page (hero tokens' clip paths) */
	export let uid = 'mk';
	/** a mark picked in the builder: drawn with a dashed halo */
	export let picked: string | null = null;

	const col = (c: string) => MARK_HEX[c] ?? c;
	const other = (s: Side): Side => (s === 'orange' ? 'blue' : 'orange');
	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	// a mark's look in a walk-through: this turn bright, earlier turns faded
	const fade = (m: Mark) => (step > 0 && m.turn > 0 && m.turn < step ? 0.5 : 1) * (m.alt ? 0.5 : 1);
	const up = (x: number, y: number) => (rot ? `rotate(${-rot} ${x} ${y})` : undefined);

	$: areas = marks.filter((m) => m.kind === 'area');
	$: arrows = marks.filter((m) => m.kind === 'arrow');
	$: rings = marks.filter((m) => m.kind === 'ring');
	$: things = marks.filter((m) => m.kind === 'unit' || m.kind === 'token' || m.kind === 'label');
	$: steps = marks.filter((m): m is StepMark => m.kind === 'step');
	// chips sharing a space sit side by side ON SCREEN (the offset is turned back by the board's rotation)
	$: chipPos = (() => {
		const by: Record<string, StepMark[]> = {};
		for (const m of steps) (by[m.hex] ??= []).push(m);
		const out: Record<string, { x: number; y: number }> = {};
		const t = (-rot * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
		for (const hex in by) {
			const c = at(hex), list = by[hex], n = list.length, gap = size * 0.62;
			list.forEach((m, i) => {
				const dx = n === 1 ? 0 : (i - (n - 1) / 2) * gap, dy = n > 2 ? (i % 2 ? size * 0.22 : -size * 0.22) : 0;
				out[m.id] = { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
			});
		}
		return out;
	})();
	function arrowGeo(from: string, to: string) {
		const a = at(from), b = at(to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
		const ux = dx / len, uy = dy / len, s0 = size * 0.42, s1 = size * 0.52;
		const p = { x: a.x + ux * s0, y: a.y + uy * s0 }, q = { x: b.x - ux * s1, y: b.y - uy * s1 };
		const bend = Math.min(len * 0.16, size * 0.9), c = { x: (p.x + q.x) / 2 - uy * bend, y: (p.y + q.y) / 2 + ux * bend };
		const tx = q.x - c.x, ty = q.y - c.y, tl = Math.hypot(tx, ty) || 1, hx = tx / tl, hy = ty / tl, hl = size * 0.36, hw = size * 0.24;
		const tip = { x: q.x + hx * hl * 0.55, y: q.y + hy * hl * 0.55 };
		const head = `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${(q.x - hx * hl * 0.45 - hy * hw).toFixed(1)},${(q.y - hy * hl * 0.45 + hx * hw).toFixed(1)} ${(q.x - hx * hl * 0.45 + hy * hw).toFixed(1)},${(q.y - hy * hl * 0.45 - hx * hw).toFixed(1)}`;
		return { d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`, head };
	}
	const hexPts = (c: { x: number; y: number }, r: number) => [0, 1, 2, 3, 4, 5].map((i) => { const a = ((60 * i - 90) * Math.PI) / 180; return `${(c.x + r * Math.cos(a)).toFixed(1)},${(c.y + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
	const label = (m: StepMark) => m.text?.trim() || `T${m.turn}`;
	const chipInk = (c: string) => (c === 'silver' || c === 'gold' ? '#1a1206' : '#fff');
</script>

{#if layer === 'under'}
	{#each areas as m (m.id)}
		{#if m.kind === 'area' && m.hexes.length}
			<g opacity={fade(m)} pointer-events="none">
				{#if m.style !== 'outline'}{#each m.hexes as h (h)}<polygon points={hexPts(at(h), size * 0.98)} fill={col(m.color)} fill-opacity={m.color === 'white' ? 0.42 : 0.32} />{/each}{/if}
				{#if m.style !== 'fill'}<path d={loopsPath(outlineLoops(m.hexes, size), 0.25)} fill="none" stroke={col(m.color)} stroke-width={size * 0.09} stroke-linejoin="round" stroke-opacity=".95" />{/if}
				{#if picked === m.id}<path d={loopsPath(outlineLoops(m.hexes, size), 0.25)} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
			</g>
		{/if}
	{/each}
{:else}
	{#each rings as m (m.id)}
		{#if m.kind === 'ring'}
			{@const c = at(m.hex)}
			<g opacity={fade(m)} pointer-events="none">
				<circle cx={c.x} cy={c.y} r={size * 0.8} fill="none" stroke="#0b0e14" stroke-opacity=".7" stroke-width={size * 0.2} />
				<circle cx={c.x} cy={c.y} r={size * 0.8} fill="none" stroke={col(m.color)} stroke-width={size * 0.12} stroke-dasharray={m.alt ? `${size * 0.3} ${size * 0.18}` : undefined} />
				{#if picked === m.id}<circle cx={c.x} cy={c.y} r={size * 0.98} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
			</g>
		{/if}
	{/each}
	{#each arrows as m (m.id)}
		{#if m.kind === 'arrow' && m.from && m.to && m.from !== m.to}
			{@const g = arrowGeo(m.from, m.to)}
			<g opacity={fade(m)} pointer-events="none">
				<path d={g.d} fill="none" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.19} stroke-linecap="round" />
				<polygon points={g.head} fill="#0b0e14" fill-opacity=".6" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.08} stroke-linejoin="round" />
				<path d={g.d} fill="none" stroke={col(m.color)} stroke-width={size * 0.11} stroke-linecap="round" stroke-dasharray={m.alt ? `${size * 0.26} ${size * 0.18}` : undefined} />
				<polygon points={g.head} fill={col(m.color)} />
				{#if picked === m.id}<path d={g.d} fill="none" stroke="#fde047" stroke-width={size * 0.04} stroke-dasharray="{size * 0.15} {size * 0.12}" />{/if}
			</g>
		{/if}
	{/each}
	{#each things as m (m.id)}
		{@const c = at(m.kind === 'unit' || m.kind === 'token' || m.kind === 'label' ? m.hex : '')}
		<g opacity={fade(m)} pointer-events="none" transform={up(c.x, c.y)}>
			{#if m.kind === 'unit'}
				{#if m.hero}
					<HeroToken x={c.x} y={c.y} r={size * 0.66} hero={m.hero} team={m.unit === 'enemy' ? other(side) : side} color={TEAM[m.unit === 'enemy' ? other(side) : side]} uid="{uid}-{m.id}" />
				{:else}
					<circle cx={c.x} cy={c.y} r={size * 0.5} fill={m.unit === 'enemy' ? '#111318' : '#f4f1e8'} stroke={m.unit === 'enemy' ? '#f4f1e8' : '#111318'} stroke-width={size * 0.07} />
					<text x={c.x} y={c.y} dy=".35em" text-anchor="middle" font-size={size * 0.56} fill={m.unit === 'enemy' ? '#fff' : '#111318'} class="t">{m.unit === 'enemy' ? 'E' : 'A'}</text>
				{/if}
			{:else if m.kind === 'token'}
				{#if m.token === 'companion'}
					<KitToken x={c.x} y={c.y} {size} team={side} color={TEAM[side]} letter={(COMPANIONS[hero] ?? '?')[0]} label={COMPANIONS[hero]} rot={0} uid="{uid}-{m.id}" />
				{:else}
					<KitToken x={c.x} y={c.y} {size} token={m.token} team={side} color={TEAM[side]} rot={0} uid="{uid}-{m.id}" />
				{/if}
			{:else if m.kind === 'label'}
				{@const w = Math.max(1.4, m.text.length * 0.42 + 0.5) * size * 0.6}
				<rect x={c.x - w / 2} y={c.y - size * 0.27} width={w} height={size * 0.54} rx={size * 0.12} fill="#111318" stroke="#f4f1e8" stroke-opacity=".7" stroke-width={size * 0.035} />
				<text x={c.x} y={c.y} dy=".35em" text-anchor="middle" font-size={size * 0.34} fill="#fff" class="t" letter-spacing=".04em">{m.text}</text>
			{/if}
			{#if picked === m.id}<circle cx={c.x} cy={c.y} r={size * 0.82} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
		</g>
	{/each}
	{#each steps as m (m.id)}
		{@const c = chipPos[m.id] ?? at(m.hex)}
		{@const now = step > 0 && m.turn === step}
		<g opacity={fade(m)} pointer-events="none" transform={up(c.x, c.y)}>
			{#if now && !m.alt}<circle cx={c.x} cy={c.y} r={size * 0.5} fill="none" stroke="#fff" stroke-opacity=".85" stroke-width={size * 0.06} />{/if}
			<circle cx={c.x + size * 0.02} cy={c.y + size * 0.05} r={size * 0.37} fill="#000" fill-opacity=".35" />
			{#if m.color2}
				<!-- a hybrid: either card -->
				<path d="M{c.x} {c.y - size * 0.36}A{size * 0.36} {size * 0.36} 0 0 0 {c.x} {c.y + size * 0.36}Z" fill={CARD_HEX[m.color]} />
				<path d="M{c.x} {c.y - size * 0.36}A{size * 0.36} {size * 0.36} 0 0 1 {c.x} {c.y + size * 0.36}Z" fill={CARD_HEX[m.color2]} />
				<circle cx={c.x} cy={c.y} r={size * 0.36} fill="none" stroke="#fff" stroke-opacity=".9" stroke-width={size * 0.045} stroke-dasharray={m.stay ? `${size * 0.1} ${size * 0.07}` : undefined} />
				<text x={c.x} y={c.y} dy=".36em" text-anchor="middle" font-size={size * (label(m).length > 2 ? 0.26 : 0.32)} fill="#fff" stroke="#000" stroke-opacity=".75" stroke-width={size * 0.05} class="t chip">{label(m)}</text>
			{:else}
				<circle cx={c.x} cy={c.y} r={size * 0.36} fill={CARD_HEX[m.color]} stroke="#fff" stroke-opacity=".9" stroke-width={size * 0.045} stroke-dasharray={m.stay ? `${size * 0.1} ${size * 0.07}` : undefined} />
				<text x={c.x} y={c.y} dy=".36em" text-anchor="middle" font-size={size * (label(m).length > 2 ? 0.26 : 0.32)} fill={chipInk(m.color)} class="t chip">{label(m)}</text>
			{/if}
			{#if picked === m.id}<circle cx={c.x} cy={c.y} r={size * 0.5} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.16} {size * 0.12}" />{/if}
		</g>
	{/each}
{/if}

<style>
	.t { font-family: inherit; font-weight: 400; user-select: none; }
	.chip { paint-order: stroke; }
</style>
