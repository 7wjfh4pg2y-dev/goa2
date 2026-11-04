<svelte:options namespace="svg" />
<script lang="ts">
	// The replay's marks over the board (BoardCanvas `over`, board units): where each piece came from this step
	// (a faint ring + a dashed arrow in the mover's colour), attack lines (red, a ⚔ midway), a skull where a hero
	// fell, and a ghost of each minion / token that left. Never hit-tested; nothing here animates but one fade-in.
	import type { Step } from '$lib/replay';

	export let step: Step;
	export let size = 60;
	export let at: (hex: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });
	export let rot = 0;
	/** the colour of a piece id (heroes: the player's, minions / tokens: the team's) */
	export let colorOf: (id: string) => string = () => '#fff';
	export let kindOf: (id: string) => string = () => 'token';

	// the arrow stops short of both centres (it starts at the old ring, ends at the token's rim)
	function arrow(from: string, to: string, inset = 0.62) {
		const a = at(from), b = at(to)
		const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1
		const k0 = Math.min(0.45, (size * 0.42) / L), k1 = Math.max(0.55, 1 - (size * inset) / L)
		return { x1: a.x + dx * k0, y1: a.y + dy * k0, x2: a.x + dx * k1, y2: a.y + dy * k1, mx: a.x + dx / 2, my: a.y + dy / 2 }
	}
	$: moves = step.moved
	$: hexOf = (id: string) => step.p[id] ?? step.prev[id] ?? ''
	$: fights = step.clashes.map((c) => ({ ...c, a: hexOf(c.by), b: step.prev[c.v] ?? step.p[c.v] ?? '' })).filter((c) => c.a && c.b && c.a !== c.b)
	$: fellIds = new Set(step.fell.map((f) => f.id))
</script>

<defs>
	<marker id="rp-arw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke" /></marker>
</defs>
{#key step.n}
	<g class="fx">
		{#each step.gone as g (g.id)}
			{#if !fellIds.has(g.id) && kindOf(g.id) !== 'hero'}
				{@const c = at(g.hex)}
				<circle cx={c.x} cy={c.y} r={size * 0.42} fill={colorOf(g.id)} opacity=".22" stroke="#f1d9a0" stroke-width={size * 0.04} stroke-dasharray="{size * 0.08} {size * 0.06}" />
				<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.4} fill="#f1d9a0" opacity=".85" transform="rotate({-rot} {c.x} {c.y})">✕</text>
			{/if}
		{/each}
		{#each moves as m (m.id)}
			{@const a = arrow(m.from, m.to)}
			{@const f = at(m.from)}
			<circle cx={f.x} cy={f.y} r={size * 0.5} fill="none" stroke={colorOf(m.id)} stroke-width={size * 0.08} opacity=".9" stroke-dasharray="{size * 0.14} {size * 0.09}" />
			<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#0b111d" stroke-width={size * 0.24} stroke-linecap="round" opacity=".55" />
			<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={colorOf(m.id)} stroke-width={size * 0.14} stroke-linecap="round" marker-end="url(#rp-arw)" />
		{/each}
		{#each fights as c, i (i)}
			{@const a = arrow(c.a, c.b, 0.55)}
			<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke="#0b111d" stroke-width={size * 0.16} stroke-linecap="round" opacity=".6" />
			<line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={c.out === 'defended' ? '#8be0a4' : '#ff6b5c'} stroke-width={size * 0.09} stroke-linecap="round" marker-end="url(#rp-arw)" />
			<circle cx={a.mx} cy={a.my} r={size * 0.3} fill="#0b111d" stroke={c.out === 'defended' ? '#8be0a4' : '#ff6b5c'} stroke-width={size * 0.05} />
			<text x={a.mx} y={a.my} text-anchor="middle" dominant-baseline="central" font-size={size * 0.34} transform="rotate({-rot} {a.mx} {a.my})">{c.out === 'defended' ? '🛡' : '⚔'}</text>
		{/each}
		{#each step.fell as f (f.id)}
			{@const c = at(f.hex)}
			<circle cx={c.x} cy={c.y} r={size * 0.62} fill="rgba(226,70,58,.22)" stroke="#ff6b5c" stroke-width={size * 0.07} />
			<text x={c.x} y={c.y} text-anchor="middle" dominant-baseline="central" font-size={size * 0.62} transform="rotate({-rot} {c.x} {c.y})">☠</text>
		{/each}
		{#each step.came as id (id)}
			{#if kindOf(id) === 'hero'}
				{@const c = at(step.p[id])}
				<circle cx={c.x} cy={c.y} r={size * 0.66} fill="none" stroke="#8be0a4" stroke-width={size * 0.07} />
			{/if}
		{/each}
	</g>
{/key}

<style>
	.fx { animation: rpin 0.35s ease-out both; }
	@keyframes rpin { from { opacity: 0; } }
	@media (prefers-reduced-motion: reduce) { .fx { animation: none; } }
</style>
