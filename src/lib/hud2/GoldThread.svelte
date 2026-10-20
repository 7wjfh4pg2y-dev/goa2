<script lang="ts">
	// Hold my Saké (DEMO on /splash-demo, 2026-10-20): when a teammate takes Takahide's swap offer, a gold thread draws
	// itself from his token to theirs and a bead of light runs along it. Screen coords; transform / opacity only.
	type T = { key: number; x: number; y: number; len: number; ang: number }
	let threads: T[] = []
	export function play(a: { x: number; y: number }, b: { x: number; y: number }) {
		const t = { key: Date.now() + Math.random(), x: a.x, y: a.y, len: Math.hypot(b.x - a.x, b.y - a.y), ang: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI }
		threads = [...threads, t]
		setTimeout(() => (threads = threads.filter((v) => v !== t)), 2200)
	}
</script>

<div class="gt" aria-hidden="true">
	{#each threads as t (t.key)}
		<span class="th" style="left:{t.x}px;top:{t.y}px;width:{t.len}px;transform:rotate({t.ang}deg)">
			<i class="line"></i><i class="bead" style="--l:{t.len}px"></i>
		</span>
	{/each}
</div>

<style>
	.gt { position: fixed; inset: 0; z-index: 58; pointer-events: none; }
	.th { position: absolute; height: 0; transform-origin: 0 0; animation: gtout 2.2s linear both; }
	@keyframes gtout { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
	.line { position: absolute; left: 0; top: -1.5px; width: 100%; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #ffe7a0, #ffc23c); box-shadow: 0 0 8px rgba(255, 196, 60, 0.9); transform-origin: 0 50%; animation: gtdraw 0.5s ease-out both; }
	@keyframes gtdraw { from { transform: scaleX(0); } to { transform: scaleX(1); } }
	.bead { position: absolute; left: -7px; top: -7px; width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle, #fff 0 30%, #ffd25e 55%, transparent 75%); opacity: 0; animation: gtbead 0.9s 0.45s ease-in-out both; }
	@keyframes gtbead { 0% { opacity: 1; transform: translateX(0) scale(1.2); } 100% { opacity: 0.2; transform: translateX(var(--l)) scale(0.8); } }
</style>
