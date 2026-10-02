<script lang="ts">
	// The log (desktop / tablet): a slim tab in the bottom-left corner showing the newest line; opened, it grows
	// upward into the activity list with the card effects in play under it and, for the host, Undo.
	import { afterUpdate } from 'svelte';
	import TopIcon from './TopIcon.svelte';
	import type { LogEntry } from '$lib/match';

	export let log: LogEntry[] = [];
	/** card effects in play: one row per hero that has any (dots = the colours of their live cards) */
	export let fx: Array<{ id: string; name: string; when: string; dots: string[] }> = [];
	export let open = false;
	/** host only (null hides the button) */
	export let undo: (() => void) | null = null;
	export let canUndo = false;
	export let onFx: (id: string) => void = () => {};
	/** design px from the top that the open log must stay under (a player board hanging on the left); 0 = free */
	export let top = 0;

	$: last = log[log.length - 1];
	const hhmm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	// keep the list pinned to the newest line
	let body: HTMLDivElement | undefined;
	let seen = -1;
	afterUpdate(() => {
		if (body && log.length !== seen) { body.scrollTop = body.scrollHeight; seen = log.length; }
		if (!body) seen = -1;
	});
</script>

{#if open}
	<div class="logpanel" style:max-height={top ? `calc(100% - ${136 + top}px)` : null}>
		<div class="hd">
			<span class="t-label">Log</span>
			{#if undo}<button class="pbtn" on:click={undo} disabled={!canUndo} title={canUndo ? `Undo: ${last?.text ?? ''}` : 'Nothing to undo this turn'}><TopIcon name="undo" />Undo</button>{/if}
			<button class="pbtn x" on:click={() => (open = false)} aria-label="Close the log"><TopIcon name="down" /></button>
		</div>
		<div class="lines" bind:this={body}>
			{#each log.slice(-40) as e (e.id)}<p title={hhmm(e.at)}><b>{e.by}</b> {e.text}</p>{/each}
		</div>
		{#if fx.length}
			<div class="fx">
				{#each fx as f (f.id)}
					<button class="fxrow" on:click={() => onFx(f.id)} title="Read the card">
						<span class="dots">{#each f.dots as c}<i style="background:{c}"></i>{/each}</span>
						<span class="who">{f.name}</span>
						<small>{f.when}</small>
					</button>
				{/each}
			</div>
		{/if}
	</div>
{:else}
	<button class="logtab" on:click={() => (open = true)} title="Log" aria-label="Open the log">
		<TopIcon name="log" />
		<span class="last">{#if last}<b>{last.by}</b> {last.text}{:else}Log{/if}</span>
		{#if fx.length}<span class="dots">{#each fx as f (f.id)}{#each f.dots as c}<i style="background:{c}"></i>{/each}{/each}</span>{/if}
	</button>
{/if}

<style>
	.logtab, .logpanel { position: absolute; left: 12px; bottom: 136px; z-index: 5; width: 300px;
		background: var(--hull); border: 1px solid var(--brass-line); border-radius: 12px; box-shadow: var(--sh-hud); }
	.logtab { display: flex; align-items: center; gap: 9px; height: 40px; padding: 0 12px; color: var(--brass); text-align: left; }
	.logtab:hover { border-color: var(--brass); }
	.last { flex: 1; min-width: 0; font-size: 14px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	b { font-weight: 400; color: var(--ink); }
	.dots { flex: none; display: flex; gap: 3px; }
	.dots i { width: 8px; height: 8px; border-radius: 50%; }

	.logpanel { display: flex; flex-direction: column; max-height: min(520px, calc(100% - 216px)); }
	.hd { flex: none; display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 14px; border-bottom: 1px solid var(--brass-faint); }
	.hd .t-label { margin-right: auto; }
	.lines { flex: 1; min-height: 44px; overflow-y: auto; padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; }
	.lines p { font-size: 14px; line-height: 1.25; color: var(--ink-2); }
	.fx { flex: none; display: flex; flex-direction: column; gap: 4px; padding: 8px; border-top: 1px solid var(--brass-faint); }
	.fxrow { display: flex; align-items: center; gap: 9px; height: 32px; padding: 0 10px; border-radius: 8px; font-size: 15px; text-align: left;
		color: var(--ink); background: var(--well); border: 1px solid var(--hair); }
	.fxrow:hover { border-color: var(--brass-line); }
	.fxrow .who { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.fxrow small { font-size: 13px; color: var(--brass); }
</style>
