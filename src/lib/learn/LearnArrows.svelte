<svelte:options namespace="svg" />
<script lang="ts">
	// The tutorial's arrows on the board (BoardCanvas `over`, board units; never hit-tested): a hero's walk along its
	// spaces, an attack line, a push, a dashed jump (fast travel / respawn) and the battle zone moving.
	import type { Arrow } from '$lib/learn';

	export let arrows: Arrow[] = [];
	export let at: (hex: string) => { x: number; y: number } = () => ({ x: 0, y: 0 });
	export let size = 60;
	// two of these can sit on one board (under + over the pieces): each keeps its own arrowhead id
	const uid = Math.random().toString(36).slice(2, 7);

	const HUE: Record<Arrow['kind'], string> = { move: '#f3c454', attack: '#ff5a4e', push: '#a978ff', jump: '#35d07a', zone: '#2f7fe6' };
	// a line through the spaces' centres, trimmed off the first piece and short of the last space's middle
	function line(a: Arrow): { d: string; end: { x: number; y: number } } {
		const pts = a.path.map(at);
		if (pts.length < 2) return { d: '', end: pts[0] ?? { x: 0, y: 0 } };
		const trim = (p: { x: number; y: number }, q: { x: number; y: number }, by: number) => {
			const dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy) || 1, k = Math.min(0.45, by / L);
			return { x: p.x + dx * k, y: p.y + dy * k };
		};
		const s0 = a.kind === 'zone' ? pts[0] : trim(pts[0], pts[1], size * 0.62);
		const e0 = trim(pts[pts.length - 1], pts[pts.length - 2], a.ghost ? size * 0.5 : a.kind === 'attack' ? size * 0.6 : size * 0.25);
		const mids = pts.slice(1, -1);
		return { d: [s0, ...mids, e0].map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '), end: pts[pts.length - 1] };
	}
</script>

<defs>
	<marker id="la-arw-{uid}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke" /></marker>
</defs>
{#each arrows as a, k (k)}
	{@const l = line(a)}
	{@const c = a.color ?? HUE[a.kind]}
	{@const w = a.kind === 'zone' ? size * 0.42 : size * 0.17}
	{#if l.d}
		{#if a.ghost}<circle cx={l.end.x} cy={l.end.y} r={size * 0.62} fill="none" stroke={c} stroke-width={size * 0.07} stroke-dasharray="{size * 0.18} {size * 0.12}" opacity="0.95" />{/if}
		<!-- a dark edge under the colour so it reads on any ground -->
		<path d={l.d} fill="none" stroke="#0b1424" stroke-width={w + size * 0.08} stroke-linecap="round" stroke-linejoin="round" opacity={a.kind === 'zone' ? 0.35 : 0.75} stroke-dasharray={a.kind === 'jump' ? `${size * 0.3} ${size * 0.2}` : undefined} />
		<path d={l.d} fill="none" stroke={c} stroke-width={w} stroke-linecap="round" stroke-linejoin="round" opacity={a.kind === 'zone' ? 0.7 : 1} stroke-dasharray={a.kind === 'jump' ? `${size * 0.3} ${size * 0.2}` : undefined} marker-end="url(#la-arw-{uid})" />
	{/if}
{/each}
