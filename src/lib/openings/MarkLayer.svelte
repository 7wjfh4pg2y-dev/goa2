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
	import { CARD_HEX, MARK_HEX, OPENING_MAP, spawnDirs, chipColors, type Mark, type Side, type StepMark } from '$lib/openings';

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
	/** spaces a board piece stands on (the wave's minions, the hero): marks there sit round its rim, small (E / A units count too) */
	export let occupied: Set<string> = new Set();

	const col = (c: string) => MARK_HEX[c] ?? c;
	const other = (s: Side): Side => (s === 'orange' ? 'blue' : 'orange');
	const TEAM: Record<string, string> = { orange: '#ea6a1e', blue: '#2f79e6' };
	// a mark's look in a walk-through: this turn bright, earlier turns faded
	const fade = (m: Mark) => (step > 0 && m.turn > 0 && m.turn < step ? 0.5 : 1) * (m.alt ? 0.5 : 1);
	const up = (x: number, y: number) => (rot ? `rotate(${-rot} ${x} ${y})` : undefined);
	const DIRS = spawnDirs(OPENING_MAP);
	const minionRef = (team: Side, role: string) => `#mn-token-${team}-${role === 'ranged' || role === 'heavy' ? role : 'melee'}`;
	// a pie slice of a chip (a hybrid of 2 or 3 cards), from the top, clockwise
	function slice(c: { x: number; y: number }, r: number, k: number, n: number) {
		const a0 = -Math.PI / 2 + (k * 2 * Math.PI) / n, a1 = a0 + (2 * Math.PI) / n;
		const p = (a: number) => `${(c.x + r * Math.cos(a)).toFixed(2)} ${(c.y + r * Math.sin(a)).toFixed(2)}`;
		return n === 2 ? `M${c.x} ${c.y - r}A${r} ${r} 0 0 ${k ? 0 : 1} ${c.x} ${c.y + r}Z` : `M${c.x} ${c.y}L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}Z`;
	}

	$: areas = marks.filter((m) => m.kind === 'area');
	$: arrows = marks.filter((m) => m.kind === 'arrow');
	$: rings = marks.filter((m) => m.kind === 'ring');
	$: minions = marks.filter((m) => m.kind === 'minion');
	$: things = marks.filter((m) => m.kind === 'unit' || m.kind === 'token' || m.kind === 'label');
	$: steps = marks.filter((m): m is StepMark => m.kind === 'step');
	// Everything that sits ON a space (E / A units, tokens, turn chips) shares it: one alone fills the middle; several
	// fan out in a circle INSIDE the space, smaller the more there are; on a space a piece stands on (a minion, the
	// hero) they sit round its rim. Laid out ON SCREEN (turned back by the board's rotation), so the fan reads the same
	// whichever way the board faces. `s` = the scale against the mark's own size.
	type Slot = { x: number; y: number; s: number };
	const NATURAL = (m: Mark) => (m.kind === 'step' ? 0.36 : m.kind === 'token' ? (m.token === 'double' ? 0.5 : 0.8) : m.kind === 'unit' ? (m.hero ? 0.66 : 0.5) : 0.36);
	const ORDER: Record<string, number> = { unit: 0, token: 1, step: 2 };
	$: slots = (() => {
		const by: Record<string, Mark[]> = {};
		for (const m of marks) if (m.kind === 'unit' || m.kind === 'token' || m.kind === 'step') (by[m.hex] ??= []).push(m);
		const out: Record<string, Slot> = {};
		const t = (-rot * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
		for (const hex in by) {
			const c = at(hex);
			let list = by[hex].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.turn - b.turn);
			// an E / A unit stands on its space like a piece: full size in the middle, the rest round its rim
			const unit = list.find((m) => m.kind === 'unit');
			if (unit) { out[unit.id] = { ...c, s: 1 }; list = list.filter((m) => m !== unit); }
			const occ = occupied.has(hex) || !!unit || marks.some((x) => x.kind === 'minion' && x.hex === hex), n = list.length;
			if (!n) continue;
			if (n === 1 && !occ) { out[list[0].id] = { ...c, s: 1 }; continue; }
			// round the rim of a piece: up to six places from the top right, clockwise; else a circle filling the space
			const rr = occ ? 0.64 : n === 2 ? 0.42 : Math.min(0.52, 0.36 + 0.035 * n);
			const r = occ ? 0.23 : Math.min(0.36, rr * Math.sin(Math.PI / n) * 0.94, 0.82 - rr); // stays inside the space
			const step = occ ? (2 * Math.PI) / Math.max(6, n) : (2 * Math.PI) / n;
			const a0 = occ ? -Math.PI / 3 : n === 2 ? Math.PI : -Math.PI / 2 + (n % 2 ? 0 : Math.PI / n);
			list.forEach((m, i) => {
				const a = a0 + i * step, dx = Math.cos(a) * rr * size, dy = Math.sin(a) * rr * size;
				out[m.id] = { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs, s: r / NATURAL(m) };
			});
		}
		return out;
	})();
	// (reactive, so the template redraws when the layout changes)
	$: slotOf = (m: Mark, c: { x: number; y: number }): Slot => slots[m.id] ?? { ...c, s: 1 };
	// a label shares its space by sitting under the rest (screen-down), a little smaller
	$: labelAt = (hex: string, c: { x: number; y: number }): Slot => {
		const busy = occupied.has(hex) || marks.some((x) => (x.kind === 'unit' || x.kind === 'token' || x.kind === 'step') && x.hex === hex);
		if (!busy) return { ...c, s: 1 };
		const t = (-rot * Math.PI) / 180, d = size * 0.6;
		return { x: c.x - d * Math.sin(t), y: c.y + d * Math.cos(t), s: 0.75 };
	};
	// a ring circles its space, and so whatever stands there (a minion, the hero, an E / A unit), all kept in the middle
	$: ringAt = (m: Mark & { hex: string }) => ({ ...at(m.hex), r: size * 0.8 });
	function arrowGeo(from: string, to: string, both = false) {
		const a = at(from), b = at(to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
		const ux = dx / len, uy = dy / len, s0 = size * (both ? 0.52 : 0.42), s1 = size * 0.52;
		const p = { x: a.x + ux * s0, y: a.y + uy * s0 }, q = { x: b.x - ux * s1, y: b.y - uy * s1 };
		const bend = Math.min(len * 0.16, size * 0.9), c = { x: (p.x + q.x) / 2 - uy * bend, y: (p.y + q.y) / 2 + ux * bend };
		const tx = q.x - c.x, ty = q.y - c.y, tl = Math.hypot(tx, ty) || 1, hx = tx / tl, hy = ty / tl, hl = size * 0.36, hw = size * 0.24;
		const tip = { x: q.x + hx * hl * 0.55, y: q.y + hy * hl * 0.55 };
		const head = `${tip.x.toFixed(1)},${tip.y.toFixed(1)} ${(q.x - hx * hl * 0.45 - hy * hw).toFixed(1)},${(q.y - hy * hl * 0.45 + hx * hw).toFixed(1)} ${(q.x - hx * hl * 0.45 + hy * hw).toFixed(1)},${(q.y - hy * hl * 0.45 - hx * hw).toFixed(1)}`;
		// the head at the start (a swap): the same shape, along the curve's first tangent
		const sx = p.x - c.x, sy = p.y - c.y, sl = Math.hypot(sx, sy) || 1, gx = sx / sl, gy = sy / sl;
		const tip0 = { x: p.x + gx * hl * 0.55, y: p.y + gy * hl * 0.55 };
		const tail = `${tip0.x.toFixed(1)},${tip0.y.toFixed(1)} ${(p.x - gx * hl * 0.45 - gy * hw).toFixed(1)},${(p.y - gy * hl * 0.45 + gx * hw).toFixed(1)} ${(p.x - gx * hl * 0.45 + gy * hw).toFixed(1)},${(p.y - gy * hl * 0.45 - gx * hw).toFixed(1)}`;
		return { d: `M${p.x.toFixed(1)} ${p.y.toFixed(1)}Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`, head, tail };
	}
	// a plain line (no head) runs centre to centre, straight: the compendium's links between rings
	function lineGeo(from: string, to: string) {
		const a = at(from), b = at(to), dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, s = size * 0.8;
		return `M${(a.x + ux * s).toFixed(1)} ${(a.y + uy * s).toFixed(1)}L${(b.x - ux * s).toFixed(1)} ${(b.y - uy * s).toFixed(1)}`;
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
			{@const c = ringAt(m)}
			{@const w = c.r / (size * 0.8)}
			<g opacity={fade(m)} pointer-events="none">
				<circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke="#0b0e14" stroke-opacity=".7" stroke-width={size * 0.2 * Math.max(0.5, w)} />
				<circle cx={c.x} cy={c.y} r={c.r} fill="none" stroke={col(m.color)} stroke-width={size * 0.12 * Math.max(0.5, w)} stroke-dasharray={m.alt ? `${size * 0.3 * w} ${size * 0.18 * w}` : undefined} />
				{#if picked === m.id}<circle cx={c.x} cy={c.y} r={c.r + size * 0.18} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
			</g>
		{/if}
	{/each}
	{#each minions as m (m.id)}
		{#if m.kind === 'minion'}
			{@const c = at(m.hex)}
			{@const team = m.team === 'enemy' ? other(side) : side}
			<g opacity={0.55 * fade(m)} pointer-events="none">
				<use href={minionRef(team, m.role)} transform="translate({c.x} {c.y}) rotate({(DIRS[team] ?? 0) * 60}) scale({(size * 0.72) / 100})" />
				<circle cx={c.x} cy={c.y} r={size * 0.74} fill="none" stroke="#f4f1e8" stroke-opacity=".8" stroke-width={size * 0.05} stroke-dasharray="{size * 0.16} {size * 0.12}" />
			</g>
			{#if picked === m.id}<circle cx={c.x} cy={c.y} r={size * 0.88} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
		{/if}
	{/each}
	{#each arrows as m (m.id)}
		{#if m.kind === 'arrow' && m.from && m.to && m.from !== m.to && m.head === 'none'}
			{@const d = lineGeo(m.from, m.to)}
			<g opacity={fade(m)} pointer-events="none">
				<path {d} fill="none" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.17} stroke-linecap="round" />
				<path {d} fill="none" stroke={col(m.color)} stroke-width={size * 0.1} stroke-linecap="round" stroke-dasharray={m.alt ? `${size * 0.26} ${size * 0.18}` : undefined} />
				{#if picked === m.id}<path {d} fill="none" stroke="#fde047" stroke-width={size * 0.04} stroke-dasharray="{size * 0.15} {size * 0.12}" />{/if}
			</g>
		{:else if m.kind === 'arrow' && m.from && m.to && m.from !== m.to}
			{@const g = arrowGeo(m.from, m.to, m.head === 'both')}
			<g opacity={fade(m)} pointer-events="none">
				{#if m.head === 'both'}<polygon points={g.tail} fill="#0b0e14" fill-opacity=".6" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.08} stroke-linejoin="round" />{/if}
				<path d={g.d} fill="none" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.19} stroke-linecap="round" />
				<polygon points={g.head} fill="#0b0e14" fill-opacity=".6" stroke="#0b0e14" stroke-opacity=".6" stroke-width={size * 0.08} stroke-linejoin="round" />
				<path d={g.d} fill="none" stroke={col(m.color)} stroke-width={size * 0.11} stroke-linecap="round" stroke-dasharray={m.alt ? `${size * 0.26} ${size * 0.18}` : undefined} />
				<polygon points={g.head} fill={col(m.color)} />
				{#if m.head === 'both'}<polygon points={g.tail} fill={col(m.color)} />{/if}
				{#if picked === m.id}<path d={g.d} fill="none" stroke="#fde047" stroke-width={size * 0.04} stroke-dasharray="{size * 0.15} {size * 0.12}" />{/if}
			</g>
		{/if}
	{/each}
	{#each things as m (m.id)}
		{@const c0 = at(m.kind === 'unit' || m.kind === 'token' || m.kind === 'label' ? m.hex : '')}
		{@const sl = m.kind === 'label' ? labelAt(m.hex, c0) : slotOf(m, c0)}
		{@const c = { x: sl.x, y: sl.y }}
		{@const k = sl.s}
		<g opacity={fade(m)} pointer-events="none" transform={up(c.x, c.y)}>
			{#if m.kind === 'unit'}
				{@const ur = (m.hero ? 0.66 : 0.5) * size * k}
				{#if m.hero}
					<HeroToken x={c.x} y={c.y} r={size * 0.66 * k} hero={m.hero} team={m.unit === 'enemy' ? other(side) : side} color={m.color ? col(m.color) : TEAM[m.unit === 'enemy' ? other(side) : side]} uid="{uid}-{m.id}" />
				{:else}
					<circle cx={c.x} cy={c.y} r={ur} fill={m.unit === 'enemy' ? '#111318' : '#f4f1e8'} stroke={m.unit === 'enemy' ? '#f4f1e8' : '#111318'} stroke-width={size * 0.07 * k} />
					<text x={c.x} y={c.y} dy=".35em" text-anchor="middle" font-size={size * 0.56 * k} fill={m.unit === 'enemy' ? '#fff' : '#111318'} class="t">{m.unit === 'enemy' ? 'E' : 'A'}</text>
					{#if m.color}<circle cx={c.x} cy={c.y} r={ur + size * 0.09 * k} fill="none" stroke={col(m.color)} stroke-width={size * 0.13 * k} />{/if}
				{/if}
				{#if m.tag}
					{@const tw = Math.max(0.5, m.tag.length * 0.2) * size * k}
					<rect x={c.x + ur * 0.35} y={c.y + ur * 0.3} width={tw} height={size * 0.3 * k} rx={size * 0.08 * k} fill={m.color ? col(m.color) : '#111318'} stroke="#fff" stroke-width={size * 0.025 * k} />
					<text x={c.x + ur * 0.35 + tw / 2} y={c.y + ur * 0.3 + size * 0.15 * k} dy=".35em" text-anchor="middle" font-size={size * 0.22 * k} fill={m.color === 'gold' || m.color === 'silver' || m.color === 'white' ? '#111318' : '#fff'} class="t">{m.tag}</text>
				{/if}
			{:else if m.kind === 'token'}
				{#if m.token === 'double'}
					<HeroToken x={c.x} y={c.y} r={size * 0.5 * k} hero="razzle" face={1} team={side} color={TEAM[side]} uid="{uid}-{m.id}" />
				{:else if m.token === 'companion'}
					<KitToken x={c.x} y={c.y} size={size * k} team={side} color={TEAM[side]} letter={(COMPANIONS[hero] ?? '?')[0]} label={COMPANIONS[hero]} rot={0} uid="{uid}-{m.id}" />
				{:else}
					<KitToken x={c.x} y={c.y} size={size * k} token={m.token} team={side} color={TEAM[side]} rot={0} uid="{uid}-{m.id}" />
				{/if}
			{:else if m.kind === 'label'}
				{@const w = Math.max(1.4, m.text.length * 0.42 + 0.5) * size * k * 0.6}
				<rect x={c.x - w / 2} y={c.y - size * k * 0.27} width={w} height={size * k * 0.54} rx={size * k * 0.12} fill="#111318" stroke="#f4f1e8" stroke-opacity=".7" stroke-width={size * k * 0.035} />
				<text x={c.x} y={c.y} dy=".35em" text-anchor="middle" font-size={size * k * 0.34} fill="#fff" class="t" letter-spacing=".04em">{m.text}</text>
			{/if}
			{#if picked === m.id}<circle cx={c.x} cy={c.y} r={size * (m.kind === 'label' ? 0.82 : NATURAL(m) * k + 0.14)} fill="none" stroke="#fde047" stroke-width={size * 0.05} stroke-dasharray="{size * 0.2} {size * 0.15}" />{/if}
		</g>
	{/each}
	{#each steps as m (m.id)}
		{@const sl = slotOf(m, at(m.hex))}
		{@const c = { x: sl.x, y: sl.y }}
		{@const z = size * sl.s}
		{@const now = step > 0 && m.turn === step}
		<g opacity={fade(m)} pointer-events="none" transform={up(c.x, c.y)}>
			{#if now && !m.alt}<circle cx={c.x} cy={c.y} r={z * 0.5} fill="none" stroke="#fff" stroke-opacity=".85" stroke-width={z * 0.06} />{/if}
			<circle cx={c.x + z * 0.02} cy={c.y + z * 0.05} r={z * 0.37} fill="#000" fill-opacity=".35" />
			{#if m.color2}
				<!-- a hybrid: any of these cards -->
				{@const cols = chipColors(m)}
				{#each cols as cc, i (i)}<path d={slice(c, z * 0.36, i, cols.length)} fill={CARD_HEX[cc]} />{/each}
				<circle cx={c.x} cy={c.y} r={z * 0.36} fill="none" stroke="#fff" stroke-opacity=".9" stroke-width={z * 0.045} stroke-dasharray={m.stay ? `${z * 0.1} ${z * 0.07}` : undefined} />
				<text x={c.x} y={c.y} dy=".36em" text-anchor="middle" font-size={z * (label(m).length > 2 ? 0.26 : 0.32)} fill="#fff" stroke="#000" stroke-opacity=".75" stroke-width={z * 0.05} class="t chip">{label(m)}</text>
			{:else}
				<circle cx={c.x} cy={c.y} r={z * 0.36} fill={CARD_HEX[m.color]} stroke="#fff" stroke-opacity=".9" stroke-width={z * 0.045} stroke-dasharray={m.stay ? `${z * 0.1} ${z * 0.07}` : undefined} />
				<text x={c.x} y={c.y} dy=".36em" text-anchor="middle" font-size={z * (label(m).length > 2 ? 0.26 : 0.32)} fill={chipInk(m.color)} class="t chip">{label(m)}</text>
			{/if}
			{#if picked === m.id}<circle cx={c.x} cy={c.y} r={z * 0.5} fill="none" stroke="#fde047" stroke-width={z * 0.05} stroke-dasharray="{z * 0.16} {z * 0.12}" />{/if}
		</g>
	{/each}
{/if}

<style>
	.t { font-family: inherit; font-weight: 400; user-select: none; }
	.chip { paint-order: stroke; }
</style>
