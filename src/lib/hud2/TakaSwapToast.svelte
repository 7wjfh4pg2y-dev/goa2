<script lang="ts">
	// Takahide swaps his gold (in games since 2026-10-20, Effects → Swap; also on /splash-demo): a toast under the top bar — his sun halo turning behind,
	// the old gold folding away and the new one swinging in with a sheen; the words follow the gold he draws (Tiger / Butterfly / Bee). A Bushido swap
	// is secret, so it never gets this toast (only the gold wave). ~3 s; transform / opacity only.
	import { heroCards, backgroundSlug } from '$lib/cards/deck'
	export let phone = false
	const ART = import.meta.glob('$lib/cards/images/cards/takahide/*.webp', { eager: true, import: 'default' }) as Record<string, string>
	const golds = heroCards('takahide').filter((c) => c.color === 'GOLD' && !c.handicapped)
	const artOf = (i: number) => { const c = golds[i]; return c ? Object.entries(ART).find(([k]) => k.endsWith(`/${backgroundSlug(c)}.webp`))?.[1] ?? '' : '' }
	let from = 0, to = 1, on = false, run = 0, timer: ReturnType<typeof setTimeout> | null = null
	/** a / b = his golds by index (0–2) or by card name */
	export function play(a: number | string = 0, b: number | string = 1) {
		const ix = (v: number | string) => (typeof v === 'number' ? v : Math.max(0, golds.findIndex((c) => c.name === v)))
		from = ix(a); to = ix(b); on = false; run++
		if (timer) clearTimeout(timer)
		requestAnimationFrame(() => { on = true; timer = setTimeout(() => (on = false), 3000) })
	}
	// what he says depends on the gold he draws (the user, 2026-10-20: one line per stance, in his voice)
	const LINES: { re: RegExp; title: string; sub: string }[] = [
		{ re: /tiger/i, title: 'The tiger wakes!', sub: 'Strike like a Tiger — no mercy' },
		{ re: /butterfly/i, title: 'Drift on the wind!', sub: 'Float like a Butterfly — untouchable' },
		{ re: /bee/i, title: 'Feel the sting!', sub: 'Sting like a Bee — swift, then gone' },
	]
	$: line = LINES.find((l) => l.re.test(golds[to]?.name ?? '')) ?? { title: 'The blade is drawn!', sub: '' }
	const RAYS = Array.from({ length: 24 }, (_, i) => i * 15)
</script>

{#if on}
	{#key run}
		<div class="tks" class:ph={phone} aria-live="polite">
			<div class="band">
				<span class="stage">
					<span class="halo"><svg viewBox="-100 -100 200 200">{#each RAYS as a, i}<line x1="0" y1={-38} x2="0" y2={i % 3 ? -70 : -92} transform="rotate({a})" />{/each}<circle r="34" /></svg></span>
					<span class="card old" style="background-image:url({artOf(from)})"></span>
					<span class="card new" style="background-image:url({artOf(to)})"><i class="sheen"></i></span>
				</span>
				<span class="copy">
					<small>Takahide swaps his gold</small>
					<b>{line.title}</b>
					<em>{line.sub || `${golds[from]?.name ?? ''} → ${golds[to]?.name ?? ''}`}</em>
				</span>
			</div>
		</div>
	{/key}
{/if}

<style>
	.tks { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 62; pointer-events: none; transform: translateX(-50%); animation: tkin 3s cubic-bezier(0.2, 1.2, 0.4, 1) both; }
	@keyframes tkin { 0% { opacity: 0; transform: translate(-50%, -20px) scale(0.94); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1); } 86% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -12px); } }
	.band { width: min(480px, 92vw); height: 104px; display: grid; grid-template-columns: 130px 1fr; align-items: center; overflow: hidden; border-radius: 12px;
		background: linear-gradient(90deg, rgba(36, 24, 6, 0.97), rgba(12, 14, 26, 0.97)); border: 1px solid rgba(255, 210, 94, 0.6); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55), 0 0 22px rgba(255, 196, 60, 0.2); }
	.stage { position: relative; height: 100%; display: grid; place-items: center; }
	.halo { position: absolute; width: 150px; height: 150px; opacity: 0.55; animation: tkspin 8s linear infinite; }
	.halo svg { width: 100%; height: 100%; stroke: #ffd25e; stroke-width: 2.4; fill: rgba(255, 210, 94, 0.12); }
	@keyframes tkspin { to { transform: rotate(360deg); } }
	.card { position: absolute; width: 60px; aspect-ratio: 1192 / 1664; border-radius: 5px; background: #000 center/cover; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.7), 0 0 0 1px #c9982f; overflow: hidden; }
	.old { animation: fold 0.5s 0.35s ease-in both; }
	@keyframes fold { from { transform: rotate(-6deg); } to { transform: rotate(-20deg) translateX(-20px) scaleX(0); opacity: 0; } }
	.new { animation: swing 0.6s 0.75s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
	@keyframes swing { from { opacity: 0; transform: translateX(40px) rotate(18deg) scale(0.8); } to { opacity: 1; transform: rotate(4deg); } }
	.sheen { position: absolute; top: -20%; bottom: -20%; width: 40%; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.7), transparent); transform: translateX(-140%) skewX(-12deg); animation: tksh 0.7s 1.3s ease-in-out both; }
	@keyframes tksh { to { transform: translateX(300%) skewX(-12deg); } }
	.copy { display: flex; flex-direction: column; gap: 2px; padding-right: 14px; min-width: 0; }
	.copy small { font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #ffd25e; }
	.copy b { font-weight: normal; font-size: 27px; line-height: 1; color: #fff8e6; -webkit-text-stroke: 1px #2a1a04; paint-order: stroke fill; text-shadow: 0 0 14px rgba(255, 196, 60, 0.45), 2px 3px 0 #2a1a04; animation: tkslam 0.45s 0.2s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
	@keyframes tkslam { from { opacity: 0; transform: scale(1.4); } to { opacity: 1; transform: none; } }
	.copy em { font-style: normal; font-size: 12.5px; color: #ecdcb8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.ph { top: 64px; }
	.ph .copy b { font-size: 21px; }
	.ph .copy em { white-space: normal; font-size: 12px; line-height: 1.2; }
</style>
