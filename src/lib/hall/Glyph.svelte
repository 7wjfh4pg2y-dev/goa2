<script lang="ts" context="module">
	export type GlyphName = 'kill' | 'death' | 'assist' | 'coin' | 'throne' | 'final' | 'life' | 'gear' | 'star' | 'fire' | 'laurel' | 'chev' | 'search'
		| 'drop' | 'shield' | 'bolt' | 'hourglass' | 'target' | 'dove' | 'lock' | 'trophy' | 'mask' | 'swap' | 'minion' | 'coins';
</script>

<script lang="ts">
	// The Hall of Records' small line icons (stroke = currentColor): kill (crossed blades), death (skull), assist (two
	// hands), coin, throne (crown), final (the wave flag), life (heart), the team crests (gear / star), streak (flame),
	// rating (laurel), chev (open / close).
	export let name: GlyphName;
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
	{:else if name === 'drop'}<path d="M12 3c3.5 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6 6-11z" /><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
	{:else if name === 'shield'}<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M12 7v10M8 11h8" />
	{:else if name === 'bolt'}<path d="M13 2L5 13h6l-1 9 8-11h-6z" />
	{:else if name === 'hourglass'}<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />
	{:else if name === 'target'}<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /><path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
	{:else if name === 'dove'}<path d="M3 13c3 0 5-1 7-4 1 3 3 4 5 4l6-3-3 5c-1 3-4 5-8 5-3 0-5-1-7-3zM10 9c0-3 1-5 3-6 0 2 1 4 2 5" />
	{:else if name === 'lock'}<rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
	{:else if name === 'trophy'}<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4c0 3 2 5 4 5M16 6h4c0 3-2 5-4 5M12 13v4M8 21h8M9 17h6v4H9z" />
	{:else if name === 'mask'}<path d="M4 6c5 2 11 2 16 0v6c0 5-4 8-8 8s-8-3-8-8z" /><path d="M8 11c1 1 2 1 3 0M13 11c1 1 2 1 3 0M9 16c2 1 4 1 6 0" />
	{:else if name === 'swap'}<path d="M4 8h14l-4-4M20 16H6l4 4" />
	{:else if name === 'minion'}<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 8l3.5 2v4L12 16l-3.5-2v-4z" />
	{:else if name === 'coins'}<ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-6c0-1.7-2.7-3-6-3" />
	{:else if name === 'chev'}<path d="M6 9l6 6 6-6" />
	{:else}<circle cx="11" cy="11" r="6.5" /><path d="M16 16l5 5" />
	{/if}
</svg>

<style>
	.g { flex: none; display: inline-block; vertical-align: -0.15em; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
</style>
