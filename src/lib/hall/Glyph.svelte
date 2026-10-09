<script lang="ts">
	// The Hall of Records' small line icons (stroke = currentColor): kill (crossed blades), death (skull), assist (two
	// hands), coin, throne (crown), final (the wave flag), life (heart), the team crests (gear / star), streak (flame),
	// rating (laurel), chev (open / close).
	export let name: 'kill' | 'death' | 'assist' | 'coin' | 'throne' | 'final' | 'life' | 'gear' | 'star' | 'fire' | 'laurel' | 'chev' | 'search';
	export let size = 14;
	const GEAR = Array.from({ length: 12 }, (_, i) => {
		const a = (i / 12) * Math.PI * 2, w = Math.PI / 24;
		const P = (r: number, t: number) => `${(12 + r * Math.sin(t)).toFixed(2)} ${(12 - r * Math.cos(t)).toFixed(2)}`;
		return `${i ? 'L' : 'M'} ${P(7, a - w * 1.6)} L ${P(10, a - w * 0.9)} L ${P(10, a + w * 0.9)} L ${P(7, a + w * 1.6)}`;
	}).join(' ') + ' Z';
	const STAR = Array.from({ length: 5 }, (_, i) => { const a = ((i * 144 - 90) * Math.PI) / 180; return `${i ? 'L' : 'M'} ${(12 + 9 * Math.cos(a)).toFixed(2)} ${(12 + 9 * Math.sin(a)).toFixed(2)}`; }).join(' ') + ' Z';
</script>

<svg class="g" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
	{#if name === 'kill'}<path d="M4 4l11 11M15 15l-2 2M15 15l2-2M20 4L9 15M9 15l2 2M9 15l-2-2M5 19l3-3M19 19l-3-3" />
	{:else if name === 'death'}<path d="M12 3a7 7 0 0 0-7 7c0 2.5 1.2 4 3 5v3h8v-3c1.8-1 3-2.5 3-5a7 7 0 0 0-7-7z" /><circle cx="9.3" cy="10.5" r="1.5" /><circle cx="14.7" cy="10.5" r="1.5" /><path d="M11 21v-3M13 21v-3" />
	{:else if name === 'assist'}<path d="M3 14l4-4 3 2 4-4M14 8h4v4M21 14l-4 4-3-2-4 4M10 20H6v-4" />
	{:else if name === 'coin'}<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="5" />
	{:else if name === 'throne'}<path d="M4 18h16M5 18l-1-10 5 4 3-6 3 6 5-4-1 10" />
	{:else if name === 'final'}<path d="M6 21V4M6 5c4-2 6 2 12 0v8c-6 2-8-2-12 0" />
	{:else if name === 'life'}<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
	{:else if name === 'gear'}<path d={GEAR} /><circle cx="12" cy="12" r="3" />
	{:else if name === 'star'}<path d={STAR} />
	{:else if name === 'fire'}<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 4 4 4 6 1-1 1.5-2 1.5-3 2 2 2.5 4 2.5 7 0 3-2 6-6 6z" />
	{:else if name === 'laurel'}<path d="M12 21V9M12 9c-3-1-5-3-5-6M12 9c3-1 5-3 5-6M12 14c-3 0-6-2-7-5M12 14c3 0 6-2 7-5M12 19c-3 0-6-1.5-7-4M12 19c3 0 6-1.5 7-4" />
	{:else if name === 'chev'}<path d="M6 9l6 6 6-6" />
	{:else}<circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" />
	{/if}
</svg>

<style>
	.g { flex: none; display: inline-block; vertical-align: -0.15em; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
</style>
