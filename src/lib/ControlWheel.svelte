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
		/** a fan of switches on the outer circle, opened by this item (e.g. Effects) */
		sub?: WheelItem[]
	}
</script>

<script lang="ts">
	// The control centre: ONE button opens this wheel over the board. The hub (the very centre) recenters the view;
	// the ring around it turns, zooms, opens the saved views (they fan out on the outer circle below) and, at the
	// top, the Effects (they fan out on the outer circle above: the minions' rims, the battle zone, the waves, the
	// map's look — every player's own choice, nobody else's). Nothing in it closes the wheel except a tap outside
	// it or Esc, so you can turn / zoom / flip switches and watch the board change behind it.
	export let open = false;
	export let ring: WheelItem[] = [];
	export let hub: WheelItem | null = null;
	export let mobile = false;
	/** saved views: three slots */
	export let views: (unknown | null)[] = [];
	export let viewLabel: (v: never) => string = () => '';
	export let onGo: (i: number) => void = () => {};
	export let onSave: (i: number) => void = () => {};
	export let onClose: () => void = () => {};

	let fans: Record<string, boolean> = {};
	$: if (!open) fans = {};
	const toggle = (id: string) => (fans = { ...fans, [id]: !fans[id] });
	// the inner ring: evenly round the hub, the first item on top
	const at = (i: number, n: number) => -90 + (360 / n) * i;
	// the outer circle: an arc centred on `mid` degrees, spread by `step`
	const arc = (i: number, n: number, step: number, mid: number) => mid + (i - (n - 1) / 2) * step;
	$: anyFan = Object.values(fans).some(Boolean);
</script>

<svelte:window on:keydown={(e) => { if (open && e.key === 'Escape') { e.stopPropagation(); onClose(); } }} />

{#if open}
	<div class="cw" class:mob={mobile} role="presentation" on:pointerdown|self={onClose}>
		<div class="wheel" role="dialog" aria-label="Control centre">
			<span class="ring r0" aria-hidden="true"></span>
			{#if anyFan}<span class="ring r1" aria-hidden="true"></span>{/if}

			{#each ring as it, i (it.id)}
				{@const a = at(i, ring.length)}
				{@const isViews = it.id === 'views'}
				{@const hasFan = isViews || !!it.sub}
				<button class="wb inner" class:on={it.on || (hasFan && fans[it.id])} disabled={it.disabled} style="--a:{a}deg; --d:{i * 0.025}s" title={it.title ?? it.label}
					on:click={() => (hasFan ? toggle(it.id) : it.act())}>
					<svg viewBox="0 0 24 24" aria-hidden="true">{@html it.icon}</svg>
					<span class="lb">{it.label}</span>
				</button>
				{#if it.sub && fans[it.id]}
					{#each it.sub as sb, j (sb.id)}
						<button class="wb outer" class:on={sb.on} disabled={sb.disabled} style="--a:{arc(j, it.sub.length, mobile ? 40 : 34, a)}deg; --d:{j * 0.03}s" title={sb.title ?? sb.label} on:click={sb.act}>
							<svg viewBox="0 0 24 24" aria-hidden="true">{@html sb.icon}</svg>
							<span class="lb">{sb.label}</span>
						</button>
					{/each}
				{/if}
				<!-- the saved views, out on the circle round the Views button: a saved one jumps there, an empty one saves the
				     current view, ↻ saves over a saved one -->
				{#if isViews && fans[it.id]}
					{#each views as v, j (j)}
						<div class="pos" style="--a:{arc(j, views.length, mobile ? -40 : -34, a)}deg; --d:{j * 0.04}s">
							<button class="wb vb" class:empty={!v} on:click={() => (v ? onGo(j) : onSave(j))} title={v ? `Go to view ${j + 1}` : `Save the current view as view ${j + 1}`}>
								<b class="vn">{j + 1}</b>
								<span class="lb">{v ? viewLabel(v as never) : 'Save'}</span>
							</button>
							{#if v}<button class="vsv" on:click={() => onSave(j)} title="Save the current view over view {j + 1}" aria-label="Save the current view over view {j + 1}">↻</button>{/if}
						</div>
					{/each}
				{/if}
			{/each}

			{#if hub}
				<button class="hub" on:click={hub.act} title={hub.title ?? hub.label} aria-label={hub.label}>
					<svg viewBox="0 0 24 24" aria-hidden="true">{@html hub.icon}</svg>
					<span class="lb">{hub.label}</span>
				</button>
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

	.hub { position: absolute; left: 0; top: 0; width: 64px; height: 64px; margin: -32px 0 0 -32px; padding: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
		color: #f4dfa8; background: radial-gradient(circle at 50% 30%, #2a5a86, #0f2a46 78%); border: 2px solid #d8b36a; box-shadow: 0 0 0 5px rgba(216, 179, 106, 0.12), 0 6px 18px rgba(0, 0, 0, 0.6); }
	.hub svg { width: 26px; height: 26px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; margin-top: -10px; }
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
