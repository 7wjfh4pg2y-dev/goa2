<script lang="ts" module>
	export type WheelItem = {
		id: string
		label: string
		/** svg markup inside a 24 × 24 viewBox (stroked) */
		icon: string
		/** a switch that is on (lit) */
		on?: boolean
		disabled?: boolean
		title?: string
		act: () => void
	}
</script>

<script lang="ts">
	// The control centre: ONE button opens this wheel over the board. The inner ring moves the view
	// (recentre, turn, zoom, saved views); the outer circle holds, at the top, the board's switches (the island
	// or the classic tiles, the battle-zone outline, the moving effects — the HOST's; nobody else gets them)
	// and, at the bottom when Views is pressed, the three saved views.
	// Nothing in it closes the wheel except the hub, a tap outside, or Esc, so you can turn / zoom
	// / flip switches and watch the board change behind it.
	export let open = false;
	export let view: WheelItem[] = [];
	export let board: WheelItem[] = [];
	/** shown over the outer arc (e.g. "Host only") */
	export let boardNote = '';
	export let mobile = false;
	/** saved views: three slots */
	export let views: (unknown | null)[] = [];
	export let viewLabel: (v: never) => string = () => '';
	export let onGo: (i: number) => void = () => {};
	export let onSave: (i: number) => void = () => {};
	export let onClose: () => void = () => {};

	let viewsOpen = false;
	$: if (!open) viewsOpen = false;
	// the inner ring: evenly round the hub, the first item on top
	const at = (i: number, n: number) => -90 + (360 / n) * i;
	// the outer circle: an arc centred on `mid` degrees (−90 = top, 90 = bottom), spread by `step`
	const arc = (i: number, n: number, step: number, mid = -90) => mid + (i - (n - 1) / 2) * step;
</script>

<svelte:window on:keydown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); onClose(); } }} />

{#if open}
	<div class="cw" class:mob={mobile} role="presentation" on:pointerdown|self={onClose}>
		<div class="wheel" role="dialog" aria-label="Control centre">
			<span class="ring r0" aria-hidden="true"></span>
			{#if board.length || viewsOpen}<span class="ring r1" aria-hidden="true"></span>{/if}
			{#if board.length}<span class="note" style="--a:-90deg">{boardNote || 'Board'}</span>{/if}

			{#each board as it, i (it.id)}
				<button class="wb outer" class:on={it.on} disabled={it.disabled} style="--a:{arc(i, board.length, mobile ? 40 : 34)}deg; --d:{0.06 + i * 0.03}s" title={it.title ?? it.label} on:click={it.act}>
					<svg viewBox="0 0 24 24" aria-hidden="true">{@html it.icon}</svg>
					<span class="lb">{it.label}</span>
				</button>
			{/each}
			{#each view as it, i (it.id)}
				{@const isViews = it.id === 'views'}
				<button class="wb inner" class:on={it.on || (isViews && viewsOpen)} disabled={it.disabled} style="--a:{at(i, view.length)}deg; --d:{i * 0.025}s" title={it.title ?? it.label}
					on:click={() => (isViews ? (viewsOpen = !viewsOpen) : it.act())}>
					<svg viewBox="0 0 24 24" aria-hidden="true">{@html it.icon}</svg>
					<span class="lb">{it.label}</span>
				</button>
			{/each}

			<button class="hub" on:click={onClose} title="Close (Esc)" aria-label="Close the control centre">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>

			<!-- the saved views, out on the circle round the Views button: a saved one jumps there, an empty one saves the
			     current view, ↻ saves over a saved one -->
			{#if viewsOpen}
				{#each views as v, i (i)}
					<div class="pos" style="--a:{arc(i, views.length, mobile ? -40 : -34, 90)}deg; --d:{i * 0.04}s">
						<button class="wb vb" class:empty={!v} on:click={() => (v ? onGo(i) : onSave(i))} title={v ? `Go to view ${i + 1}` : `Save the current view as view ${i + 1}`}>
							<b class="vn">{i + 1}</b>
							<span class="lb">{v ? viewLabel(v as never) : 'Save'}</span>
						</button>
						{#if v}<button class="vsv" on:click={() => onSave(i)} title="Save the current view over view {i + 1}" aria-label="Save the current view over view {i + 1}">↻</button>{/if}
					</div>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.cw { --r0: 104px; --r1: 202px; --b0: 62px; --b1: 66px; position: fixed; inset: 0; z-index: 45; display: grid; place-items: center;
		background: radial-gradient(closest-side, rgba(3, 11, 21, 0.55), rgba(3, 11, 21, 0.25)); animation: fade 0.18s ease both; }
	.cw.mob { --r0: 84px; --r1: 158px; --b0: 54px; --b1: 56px; }
	@keyframes fade { from { opacity: 0; } }
	.wheel { position: relative; width: 0; height: 0; }
	/* two faint guide rings */
	.ring { position: absolute; left: 0; top: 0; border-radius: 50%; pointer-events: none; transform: translate(-50%, -50%); border: 1px solid rgba(216, 179, 106, 0.22); }
	.r0 { width: calc(var(--r0) * 2); height: calc(var(--r0) * 2); background: radial-gradient(closest-side, rgba(6, 21, 38, 0.92), rgba(6, 21, 38, 0.82)); }
	.r1 { width: calc(var(--r1) * 2); height: calc(var(--r1) * 2); border-style: dashed; border-color: rgba(216, 179, 106, 0.16); }
	.note { position: absolute; left: 0; top: 0; white-space: nowrap; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: #d8b36a;
		transform: translate(-50%, calc(-1 * var(--r1) - var(--b1) / 2 - 30px)); text-shadow: 0 1px 4px #000; pointer-events: none; }

	/* a button on a ring: placed by its angle, flies out from the hub (transform + opacity only) */
	.wb { position: absolute; left: 0; top: 0; width: var(--b0); height: var(--b0); margin: calc(var(--b0) / -2) 0 0 calc(var(--b0) / -2); padding: 0; border-radius: 50%;
		display: grid; place-items: center; cursor: pointer; color: #f4dfa8;
		background: radial-gradient(circle at 50% 30%, #1d4468, #0a1f35 78%); border: 1.5px solid rgba(216, 179, 106, 0.55);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.1);
		transform: rotate(var(--a)) translate(var(--r0)) rotate(calc(-1 * var(--a)));
		animation: out 0.26s var(--d, 0s) cubic-bezier(0.2, 0.9, 0.3, 1.2) both; transition: background 0.12s, border-color 0.12s; }
	.wb.outer { width: var(--b1); height: var(--b1); margin: calc(var(--b1) / -2) 0 0 calc(var(--b1) / -2); transform: rotate(var(--a)) translate(var(--r1)) rotate(calc(-1 * var(--a))); }
	@keyframes out { from { opacity: 0; transform: rotate(var(--a)) translate(0) rotate(calc(-1 * var(--a))) scale(0.4); } }
	.wb svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; margin-top: -10px; }
	.lb { position: absolute; left: 50%; bottom: 7px; transform: translateX(-50%); font-size: 10px; line-height: 1; letter-spacing: 0.04em; white-space: nowrap; color: #e9dcc0; }
	.wb:hover:not(:disabled) { background: radial-gradient(circle at 50% 30%, #2a5a86, #10304e 78%); border-color: #f4dfa8; }
	/* a switch that is on: brass */
	.wb.on { color: #1c1408; background: linear-gradient(180deg, #f3dca0 0%, #d8b36a 55%, #b98e42 100%); border-color: #fff1c8; }
	.wb.on .lb { color: #2a1d08; }
	.wb:disabled { cursor: default; opacity: 0.45; }

	.hub { position: absolute; left: 0; top: 0; width: 52px; height: 52px; margin: -26px 0 0 -26px; padding: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
		color: #f4dfa8; background: radial-gradient(circle at 50% 30%, #2a1d44, #120c22); border: 2px solid #d8b36a; box-shadow: 0 0 0 5px rgba(216, 179, 106, 0.12), 0 6px 18px rgba(0, 0, 0, 0.6); }
	.hub svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
	.hub:hover { border-color: #fff1c8; }

	/* a saved-view slot on the outer circle: placed like an outer button, the button and its ↻ inside */
	.pos { position: absolute; left: 0; top: 0; width: 0; height: 0; transform: rotate(var(--a)) translate(var(--r1)) rotate(calc(-1 * var(--a)));
		animation: outPos 0.24s var(--d, 0s) cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
	@keyframes outPos { from { opacity: 0; transform: rotate(var(--a)) translate(var(--r0)) rotate(calc(-1 * var(--a))); } }
	.pos .wb.vb { width: var(--b1); height: var(--b1); margin: calc(var(--b1) / -2) 0 0 calc(var(--b1) / -2); transform: none; animation: none; }
	.vn { font-size: 24px; line-height: 1; color: #f4dfa8; margin-top: -10px; }
	.wb.vb.empty { border-style: dashed; background: rgba(6, 21, 38, 0.86); }
	.wb.vb.empty .vn { color: rgba(244, 223, 168, 0.5); }
	.vsv { position: absolute; left: calc(var(--b1) / 2 - 16px); top: calc(var(--b1) / -2 - 4px); width: 24px; height: 24px; padding: 0; border-radius: 50%; display: grid; place-items: center;
		cursor: pointer; font-size: 14px; line-height: 1; color: #1c1408; background: linear-gradient(180deg, #f3dca0, #c99a4c); border: 1px solid #fff1c8; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5); }
	@media (prefers-reduced-motion: reduce) { .wb, .cw { animation: none; } }
</style>
