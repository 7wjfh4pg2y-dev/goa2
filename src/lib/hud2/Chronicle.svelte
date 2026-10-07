<script lang="ts" module>
	export type FxRow = { idx: number; name: string; color: string; dur: string };
	export type FxGroup = { pid: string; hero: string; heroName: string; team: string; color: string; list: FxRow[] };
	export type Who = { hero: string; color: string; team: string };
</script>

<script lang="ts">
	// The Chronicle: the game's log, the last slot of your team's column, the size of a board and never bigger.
	// A GOLD head — the host's Undo bubble (everyone else: their team's crest) · "Chronicle" · the faces of the heroes
	// with effects in play (one per hero, the ring split into one arc per effect in its card's colour, a count when
	// there are several) — over a SILVER log. Lines: the player's colour, then their hero; newest at the bottom (a
	// column-reverse scroller starts at its end and stays there). Hovering the faces lists every effect in play.
	import type { LogEntry } from '$lib/match';
	import { portraitCss } from '$lib/heroes';

	export let log: LogEntry[] = [];
	export let who: (name: string) => Who | null = () => null;
	export let fx: FxGroup[] = [];
	export let host = false;
	export let canUndo = false;
	export let team: 'orange' | 'blue' = 'orange';
	export let small = false;
	export let onUndo: () => void = () => {};
	export let onRead: (pid: string, hero: string, idx: number) => void = () => {};

	let show = false;
	let shut: ReturnType<typeof setTimeout> | null = null;
	const enter = () => { if (shut) clearTimeout(shut); shut = null; show = true; };
	const leave = () => { if (shut) clearTimeout(shut); shut = setTimeout(() => (show = false), 280); };
	$: lines = log.slice(-60).reverse();
	const ringOf = (g: FxGroup) => {
		const n = g.list.length;
		return `conic-gradient(${g.list.map((f, k) => `${f.color} ${(k / n) * 360 + 4}deg ${((k + 1) / n) * 360 - 4}deg, transparent ${((k + 1) / n) * 360 - 4}deg ${((k + 1) / n) * 360 + 4}deg`).join(', ')})`;
	};
	const GEAR = Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2, w = Math.PI / 24; const P = (r: number, t: number) => `${(r * Math.sin(t)).toFixed(2)} ${(-r * Math.cos(t)).toFixed(2)}`; return `${i ? 'L' : 'M'} ${P(7.6, a - w * 1.6)} L ${P(10.6, a - w * 0.9)} L ${P(10.6, a + w * 0.9)} L ${P(7.6, a + w * 1.6)}`; }).join(' ') + ' Z';
	const STAR = Array.from({ length: 5 }, (_, i) => { const a = ((i * 144 - 90) * Math.PI) / 180; return `${i ? 'L' : 'M'} ${(9.5 * Math.cos(a)).toFixed(2)} ${(9.5 * Math.sin(a)).toFixed(2)}`; }).join(' ') + ' Z';
	const tint = (t: string) => (t === 'blue' ? '#a8d0ff' : t === 'orange' ? '#ffc28a' : '#fff');
</script>

<div class="chron" class:small>
	<span class="head">
		{#if host}
			<button class="bub undo" on:click={onUndo} disabled={!canUndo} title={canUndo ? `Undo: ${log[log.length - 1]?.text ?? ''}` : 'Nothing to undo this turn'} aria-label="Undo"><svg viewBox="0 0 24 24"><path d="M9 4.5 4.5 9 9 13.5" /><path d="M5 9h9.5a5.25 5.25 0 0 1 0 10.5H11" /></svg></button>
		{:else}
			<span class="bub crest is-{team}" title={team === 'blue' ? 'The Titans' : 'The Atlanteans'}><svg viewBox="-12 -12 24 24">{#if team === 'blue'}<circle r="10.5" class="ring" /><path d={STAR} />{:else}<path d={GEAR} /><circle r="3.2" class="hole" />{/if}</svg></span>
		{/if}
		<b class="ttl">Chronicle</b>
		<span class="faces" role="group" aria-label="Effects in play" on:mouseenter={enter} on:mouseleave={leave}>
			{#each fx as g (g.pid)}
				<button class="face" style="--ring:{ringOf(g)}; {portraitCss(g.hero)}" title="{g.heroName}: {g.list.map((f) => f.name).join(', ')}" on:click={() => (show = !show)}>{#if g.list.length > 1}<b>{g.list.length}</b>{/if}</button>
			{/each}
			{#if show && fx.length}
				<div class="fxpop">
					<span class="fxph">Effects in play</span>
					{#each fx as g (g.pid)}
						<span class="fxg">
							<span class="fxw"><i class="pc" style="--pc:{g.color}"></i><b style:color={tint(g.team)}>{g.heroName}</b></span>
							{#each g.list as f, k (k)}
								<button class="fxrow" style="--c:{f.color}" on:click={() => onRead(g.pid, g.hero, f.idx)} title="Read the card"><i></i>{f.name}<em>{f.dur}</em></button>
							{/each}
						</span>
					{/each}
				</div>
			{/if}
		</span>
	</span>
	<span class="lines">
		{#each lines as e (e.id)}
			{@const w = who(e.by)}
			<span class="ll">{#if w}<i class="pc" style="--pc:{w.color}"></i><b style:color={tint(w.team)}>{w.hero}</b>{:else}<b>{e.by}</b>{/if} {e.text}</span>
		{:else}
			<span class="ll none">Nothing yet.</span>
		{/each}
	</span>
</div>

<style>
	.chron { position: relative; height: 200px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 0 14px 12px; border-radius: 16px; color: #f5f1e8; pointer-events: auto;
		background: linear-gradient(180deg, rgba(46, 51, 60, 0.98), rgba(22, 25, 31, 0.98)); border: 1px solid rgba(214, 222, 232, 0.3); border-top: 3px solid #f4dfa8; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5); }
	.chron.small { height: 180px; }
	.head { flex: none; display: flex; align-items: center; gap: 10px; margin: 0 -14px; padding: 8px 14px; border-radius: 13px 13px 0 0; border-bottom: 1px solid rgba(244, 223, 168, 0.4);
		background: linear-gradient(180deg, rgba(120, 92, 40, 0.55), rgba(64, 48, 20, 0.55)); }
	.small .head { padding: 6px 14px; }
	.bub { width: 36px; height: 36px; flex: none; padding: 0; border-radius: 50%; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); border: 0; box-shadow: 0 0 0 1.5px rgba(244, 223, 168, 0.5); }
	.bub svg { width: 19px; height: 19px; fill: none; stroke: #fbf0d2; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.bub.undo { cursor: pointer; background: radial-gradient(circle at 50% 35%, #5a4520, #2a200f); box-shadow: 0 0 0 1.5px #f4dfa8, 0 0 10px rgba(244, 223, 168, 0.25); }
	.bub.undo:disabled { cursor: default; opacity: 0.45; }
	.crest svg { width: 24px; height: 24px; stroke: #2a1608; stroke-width: 0.8; }
	.crest.is-orange svg path { fill: #ef7d22; } .crest .hole { fill: #2a1608; }
	.crest.is-blue svg path { fill: none; stroke: #8cc0ff; stroke-width: 1.6; } .crest .ring { fill: #12305a; stroke: #2f7fe6; stroke-width: 1.4; }
	.ttl { flex: 1; font-weight: 400; font-size: 19px; line-height: 1; color: #fbf0d2; }
	.faces { display: flex; align-items: center; } /* the list below is placed against the whole box */
	.face { position: relative; flex: none; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; cursor: pointer; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px #1e170b; }
	.face + .face { margin-left: -5px; }
	.face::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; background: var(--ring); -webkit-mask: radial-gradient(circle, transparent 13.5px, #000 14px); mask: radial-gradient(circle, transparent 13.5px, #000 14px); }
	.face b { position: absolute; z-index: 1; right: -6px; bottom: -6px; min-width: 14px; height: 14px; border-radius: 7px; display: grid; place-items: center; font-weight: 400; font-size: 9px; color: #1e170b; background: #fbf0d2; }
	.lines { flex: 1; min-height: 0; display: flex; flex-direction: column-reverse; gap: 4px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(214, 222, 232, 0.3) transparent;
		-webkit-mask-image: linear-gradient(180deg, transparent, #000 18px); mask-image: linear-gradient(180deg, transparent, #000 18px); }
	.ll { font-size: 12.5px; line-height: 1.25; color: #bccbd9; }
	.ll:first-child { color: #f5f1e8; }
	.ll b { font-weight: 400; color: #fff; }
	.ll.none { color: #8a9fb3; }
	.pc { display: inline-block; width: 8px; height: 8px; margin-right: 5px; border-radius: 50%; background: var(--pc); box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.6); vertical-align: 1px; }
	/* every effect in play, beside the box (it grows upward over the island; the box keeps its size) */
	.fxpop { position: absolute; right: calc(100% + 10px); bottom: 0; z-index: 3; width: 214px; display: flex; flex-direction: column; gap: 6px; padding: 0 12px 12px; border-radius: 12px; overflow: hidden; text-align: left;
		background: linear-gradient(180deg, rgba(46, 51, 60, 0.98), rgba(22, 25, 31, 0.98)); border-top: 3px solid #f4dfa8; box-shadow: 0 0 0 1px rgba(214, 222, 232, 0.3), 0 10px 24px rgba(0, 0, 0, 0.6); }
	.fxph { margin: 0 -12px; padding: 8px 12px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #fbf0d2; border-bottom: 1px solid rgba(244, 223, 168, 0.4); background: linear-gradient(180deg, rgba(120, 92, 40, 0.55), rgba(64, 48, 20, 0.55)); }
	.fxg { display: flex; flex-direction: column; gap: 3px; }
	.fxw { display: flex; align-items: center; font-size: 13px; line-height: 1.1; white-space: nowrap; }
	.fxw b { font-weight: 400; }
	.fxrow { display: flex; align-items: center; gap: 7px; margin-left: 15px; padding: 0; border: 0; background: none; font: inherit; font-size: 12px; line-height: 1.2; color: #fff; text-align: left; cursor: pointer; }
	.fxrow:hover { color: #fbf0d2; }
	.fxrow i { flex: none; width: 8px; height: 13px; border-radius: 2px; background: var(--c); box-shadow: 0 0 6px var(--c); }
	.fxrow em { margin-left: auto; font-style: normal; font-size: 10.5px; color: #9aa6b4; white-space: nowrap; }
</style>
