<script lang="ts">
	// The host's NOTES box (2.0 HUD, bottom-right, the compact Chronicle's size): jot what the app can't see —
	// misreads, fake-outs, tactics — as the game goes. Each note is stamped with the round · turn and kept with the
	// game record (the recorder), so the Hall's match report and play-by-play show it. Only the host sees the box.
	import type { GameNote } from '$lib/match';

	export let notes: GameNote[] = [];
	export let round = 1;
	export let turn = 1;
	export let onAdd: (text: string) => void = () => {};
	export let onDrop: (id: string) => void = () => {};
	/** expanded: a big writing window (grows up and to the left from the corner); the parent lifts its layer while it's open */
	export let big = false;

	const KEY = 'goa2-notes-min';
	let min = false;
	try { min = localStorage.getItem(KEY) === '1'; } catch { /* ignore */ }
	const toggle = () => { if (big) { big = false; return; } min = !min; try { localStorage.setItem(KEY, min ? '1' : '0'); } catch { /* ignore */ } };

	let text = '';
	function add() {
		const t = text.trim();
		if (!t) return;
		onAdd(t.slice(0, 1000));
		text = '';
	}
	let area: HTMLTextAreaElement | null = null;
	function expand() { big = !big; if (big) { min = false; setTimeout(() => area?.focus(), 0); } }
	// the big window: Enter starts a new line; Ctrl / ⌘ + Enter adds the note; Esc folds the window back
	function bigKey(e: KeyboardEvent) {
		e.stopPropagation();
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); add(); }
		else if (e.key === 'Escape') { e.preventDefault(); big = false; }
	}
	function key(e: KeyboardEvent) {
		e.stopPropagation(); // the game's shortcuts (Esc, Space, H / U / D / R …) never see typing here
		if (e.key === 'Enter') { e.preventDefault(); add(); }
		else if (e.key === 'Escape') (e.currentTarget as HTMLInputElement).blur();
	}
	$: live = notes.filter((n) => !n.del);
	$: shown = [...live].reverse();
</script>

<div class="notes" class:min={min && !big} class:big>
	<span class="head">
		<span class="bub" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg></span>
		<b class="ttl">Notes</b>
		<span class="cnt">{live.length ? live.length : ''}</span>
		<button class="bub mn" on:click={expand} title={big ? 'Shrink the notes back' : 'Open a big window to write in'} aria-label={big ? 'Shrink the notes' : 'Expand the notes'}>
			<svg viewBox="0 0 24 24">{#if big}<path d="M14 10l6-6M14 10V5M14 10h5M10 14l-6 6M10 14v5M10 14H5" />{:else}<path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />{/if}</svg>
		</button>
		<button class="bub mn" on:click={toggle} title={min ? 'Open the notes' : 'Fold the notes away'} aria-label={min ? 'Open the notes' : 'Fold the notes away'}>
			<svg viewBox="0 0 24 24"><path d={min ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></svg>
		</button>
	</span>
	{#if big}
		<span class="lines">
			{#each shown as n (n.id)}
				<span class="ll"><em>R{n.r}·T{n.t}</em> {n.text}<button class="x" on:click={() => onDrop(n.id)} title="Delete this note" aria-label="Delete this note">×</button></span>
			{:else}
				<span class="ll none">Misreads, fake-outs, tactics… they go in the match report.</span>
			{/each}
		</span>
		<span class="bin">
			<textarea bind:this={area} bind:value={text} on:keydown={bigKey} maxlength="1000" placeholder="Note for R{round}·T{turn}…  (Ctrl + Enter to add)" aria-label="Write a note"></textarea>
			<span class="bfoot"><small>{text.length} / 1000</small><button class="addb" on:click={add} disabled={!text.trim()}>Add note</button></span>
		</span>
	{:else if !min}
		<span class="lines">
			{#each shown as n (n.id)}
				<span class="ll"><em>R{n.r}·T{n.t}</em> {n.text}<button class="x" on:click={() => onDrop(n.id)} title="Delete this note" aria-label="Delete this note">×</button></span>
			{:else}
				<span class="ll none">Misreads, fake-outs, tactics… they go in the match report.</span>
			{/each}
		</span>
		<span class="in">
			<input bind:value={text} on:keydown={key} maxlength="400" placeholder="Note for R{round}·T{turn}…" aria-label="Write a note" />
			<button class="add" on:click={add} disabled={!text.trim()} aria-label="Add the note">+</button>
		</span>
	{/if}
</div>

<style>
	.notes { position: relative; height: 108px; box-sizing: border-box; display: flex; flex-direction: column; gap: 4px; padding: 0 10px 6px; border-radius: 14px; color: #f5f1e8; pointer-events: auto;
		background: linear-gradient(180deg, rgba(46, 51, 60, 0.98), rgba(22, 25, 31, 0.98)); border: 1px solid rgba(214, 222, 232, 0.3); border-top: 2px solid #f4dfa8; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5); }
	.notes.min { height: auto; padding-bottom: 0; }
	/* the big window: anchored to the corner, it grows up and to the left over the board */
	.notes.big { position: absolute; right: 0; bottom: 0; width: 600px; height: 460px; gap: 8px; padding: 0 14px 12px; }
	.big .head { margin: 0 -14px; padding: 6px 14px; }
	.big .ttl { font-size: 15px; }
	.big .ll { font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; padding-right: 20px; }
	.bin { flex: none; display: flex; flex-direction: column; gap: 6px; }
	.bin textarea { height: 130px; resize: none; padding: 8px 10px; border-radius: 9px; border: 1px solid rgba(214, 222, 232, 0.25); background: rgba(0, 0, 0, 0.35); color: #f5f1e8; font: inherit; font-size: 14px; line-height: 1.4; outline: 0; }
	.bin textarea:focus { border-color: #f4dfa8; }
	.bfoot { display: flex; align-items: center; gap: 10px; }
	.bfoot small { flex: 1; font-size: 11px; color: #8a9fb3; }
	.addb { height: 30px; padding: 0 16px; border-radius: 8px; border: 0; cursor: pointer; font: inherit; font-size: 13px; color: #1e170b; background: linear-gradient(180deg, #f4dfa8, #c9a24a); }
	.addb:disabled { opacity: 0.4; cursor: default; }
	.head { flex: none; display: flex; align-items: center; gap: 7px; margin: 0 -10px; padding: 4px 10px; border-radius: 12px 12px 0 0; border-bottom: 1px solid rgba(244, 223, 168, 0.4);
		background: linear-gradient(180deg, rgba(120, 92, 40, 0.55), rgba(64, 48, 20, 0.55)); }
	.min .head { border-radius: 12px; border-bottom: 0; }
	.bub { width: 24px; height: 24px; flex: none; padding: 0; border-radius: 50%; display: grid; place-items: center; background: rgba(0, 0, 0, 0.35); border: 0; box-shadow: 0 0 0 1.5px rgba(244, 223, 168, 0.5); }
	.bub svg { width: 14px; height: 14px; fill: none; stroke: #fbf0d2; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
	.bub.mn { cursor: pointer; }
	.ttl { flex: 1; font-weight: 400; font-size: 13px; letter-spacing: 0.04em; line-height: 1; color: #fbf0d2; }
	.cnt { font-size: 11px; color: #d8c79d; }
	.lines { flex: 1; min-height: 0; display: flex; flex-direction: column-reverse; gap: 2px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(214, 222, 232, 0.3) transparent;
		-webkit-mask-image: linear-gradient(180deg, transparent, #000 10px); mask-image: linear-gradient(180deg, transparent, #000 10px); }
	.ll { position: relative; padding-right: 16px; font-size: 11px; line-height: 1.25; color: #bccbd9; overflow-wrap: anywhere; }
	.ll:first-child { color: #f5f1e8; }
	.ll em { font-style: normal; color: #f4dfa8; }
	.ll.none { color: #8a9fb3; }
	.x { position: absolute; right: 0; top: -1px; width: 14px; height: 14px; padding: 0; border: 0; background: none; color: #8a9fb3; font: inherit; font-size: 13px; line-height: 1; cursor: pointer; opacity: 0; }
	.ll:hover .x, .x:focus-visible { opacity: 1; }
	.x:hover { color: #ef4444; }
	.in { flex: none; display: flex; gap: 5px; }
	.in input { flex: 1; min-width: 0; height: 24px; padding: 0 8px; border-radius: 7px; border: 1px solid rgba(214, 222, 232, 0.25); background: rgba(0, 0, 0, 0.35); color: #f5f1e8; font: inherit; font-size: 11.5px; outline: 0; }
	.in input:focus { border-color: #f4dfa8; }
	.add { flex: none; width: 24px; height: 24px; padding: 0; border-radius: 7px; border: 0; cursor: pointer; font: inherit; font-size: 16px; line-height: 1; color: #1e170b; background: linear-gradient(180deg, #f4dfa8, #c9a24a); }
	.add:disabled { opacity: 0.4; cursor: default; }
	@media (hover: none) { .x { opacity: 0.7; } }
</style>
