<script lang="ts">
	// Edit one match report (an online game's draft, or a table game typed in by hand): date, match number, both
	// teams (player → hero), winner (+ a note), win condition, wave, and the highlights as free text — with the
	// finished report beside it, exactly as it will be copied.
	import { onMount } from 'svelte';
	import { HEROES_ALPHA } from '$lib/heroes';
	import { CONDITIONS, reportText, type Report, type ReportSeat } from '$lib/reports';
	import Icon from '$lib/ui/Icon.svelte';

	export let report: Report;
	/** saves; resolves false when it didn't (the editor then stays open) */
	export let onSave: (r: Report) => Promise<boolean>;
	export let onCancel: () => void;
	/** online games: the app's draft again (fills the form; nothing is saved until Save) */
	export let redraft: (() => Report) | null = null;
	/** table games: remove it (tap twice) */
	export let onDelete: (() => void) | null = null;

	// a working copy: nothing changes until Save
	let r: Report = clone(report);
	function clone(x: Report): Report { return { ...x, red: x.red.map((s) => ({ ...s })), blue: x.blue.map((s) => ({ ...s })) }; }
	let saving = false;
	let delArm = false, delT: ReturnType<typeof setTimeout> | null = null;
	let box: HTMLElement;
	onMount(() => box?.querySelector<HTMLElement>('input, textarea')?.focus());

	const seat = (): ReportSeat => ({ name: '', hero: '' });
	function add(side: 'red' | 'blue') { if (r[side].length < 5) r[side] = [...r[side], seat()]; }
	function drop(side: 'red' | 'blue', i: number) { if (r[side].length > 1) r[side] = r[side].filter((_, j) => j !== i); }
	const num = (v: string): number | null => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

	async function save() {
		if (saving) return;
		saving = true;
		const ok = await onSave({ ...r, red: r.red.filter((s) => s.name.trim() || s.hero.trim()), blue: r.blue.filter((s) => s.name.trim() || s.hero.trim()) });
		saving = false;
		if (!ok) return;
	}
	function delTap() {
		if (!onDelete) return;
		if (!delArm) { delArm = true; if (delT) clearTimeout(delT); delT = setTimeout(() => (delArm = false), 3000); return; }
		onDelete();
	}
	$: text = reportText(r);
</script>

<svelte:window on:keydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} />
<datalist id="rep-heroes">{#each HEROES_ALPHA as h (h.id)}<option value={h.name}></option>{/each}</datalist>

<div class="scrim" role="presentation" on:click|self={onCancel}>
	<div class="panel ed" bind:this={box} role="dialog" aria-modal="true" aria-label="Edit report" tabindex="-1">
		<header class="eh">
			<h2>{r.kind === 'irl' ? 'Table game' : 'Online game'} report</h2>
			<button class="btn btn-ghost btn-icon" on:click={onCancel} aria-label="Close"><Icon name="x" /></button>
		</header>
		<div class="eb">
			<div class="form">
				<div class="row2">
					<label class="f"><span>Date</span><input type="date" bind:value={r.date} /></label>
					<label class="f sm"><span>Match</span><input type="number" min="1" value={r.match ?? ''} on:input={(e) => (r.match = num(e.currentTarget.value))} /></label>
					<label class="f sm"><span>Wave</span><input type="number" min="1" placeholder="–" value={r.wave ?? ''} on:input={(e) => (r.wave = num(e.currentTarget.value))} /></label>
				</div>

				{#each [['red', 'Red Team', 'Atlanteans'], ['blue', 'Blue Team', 'Titans']] as [side, label, team] (side)}
					{@const sd = side as 'red' | 'blue'}
					<fieldset class="team is-{sd}">
						<legend><i></i>{label} <small>({team})</small></legend>
						{#each r[sd] as s, i (i)}
							<div class="seat">
								<input placeholder="Player" bind:value={s.name} aria-label="{label} player {i + 1}" />
								<span class="arr">→</span>
								<input placeholder="Hero" list="rep-heroes" bind:value={s.hero} aria-label="{label} hero {i + 1}" />
								<button class="x" on:click={() => drop(sd, i)} disabled={r[sd].length <= 1} aria-label="Remove">✕</button>
							</div>
						{/each}
						{#if r[sd].length < 5}<button class="addp" on:click={() => add(sd)}>+ Player</button>{/if}
					</fieldset>
				{/each}

				<div class="f">
					<span>Winner</span>
					<div class="seg">
						<button class="w-red" class:on={r.winner === 'red'} on:click={() => (r.winner = 'red')}>Red</button>
						<button class="w-blue" class:on={r.winner === 'blue'} on:click={() => (r.winner = 'blue')}>Blue</button>
						<button class:on={r.winner === 'none'} on:click={() => (r.winner = 'none')}>Nobody</button>
					</div>
					<input placeholder="Note (optional) — e.g. but it doesn't count" bind:value={r.winnerNote} />
				</div>

				<div class="f">
					<span>Win condition</span>
					<div class="chips">{#each CONDITIONS as c (c)}<button class:on={r.condition === c} on:click={() => (r.condition = c)}>{c}</button>{/each}</div>
					<input placeholder="Or type your own" bind:value={r.condition} />
				</div>

				<label class="f grow">
					<span>Highlights <small>· tactics, close calls, banter — anything the app can't see</small></span>
					<textarea rows="10" bind:value={r.highlights} placeholder="- One line per highlight"></textarea>
				</label>
			</div>

			<div class="prev">
				<span class="pl">Preview</span>
				<pre>{text}</pre>
			</div>
		</div>
		<footer class="ef">
			{#if redraft}<button class="btn btn-ghost btn-sm" on:click={() => redraft && (r = clone(redraft()))} title="Fill the form with the app's draft again (nothing is saved until Save)">Redraft</button>{/if}
			{#if onDelete}<button class="btn btn-sm del" class:arm={delArm} on:click={delTap}>{delArm ? 'Tap again to delete' : 'Delete'}</button>{/if}
			<span class="sp"></span>
			<button class="btn btn-ghost btn-sm" on:click={onCancel}>Cancel</button>
			<button class="btn btn-primary btn-sm" on:click={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
		</footer>
	</div>
</div>

<style>
	.scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(2, 7, 14, 0.78); }
	.ed { width: min(1060px, 100%); max-height: calc(100dvh - 32px); display: flex; flex-direction: column; padding: 0; overflow: hidden; }
	.eh { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--hair); }
	.eh h2 { margin: 0; font-size: 22px; font-weight: 400; color: var(--brass-hi); }
	.eb { flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; padding: 16px; }
	.form { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
	.row2 { display: flex; gap: 10px; flex-wrap: wrap; }
	.f { display: flex; flex-direction: column; gap: 6px; flex: 1 1 160px; min-width: 0; }
	.f.sm { flex: 0 1 96px; }
	.f > span { font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	.f > span small { text-transform: none; letter-spacing: 0; }
	input, textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--hair); background: var(--well); color: var(--ink); font: inherit; font-size: 15px; }
	input:focus, textarea:focus { outline: 0; border-color: var(--brass-line); }
	textarea { resize: vertical; min-height: 180px; line-height: 1.4; }
	.team { margin: 0; padding: 10px 12px 12px; border-radius: 10px; border: 1px solid var(--hair); background: var(--tl); display: flex; flex-direction: column; gap: 6px; }
	.team.is-red { --tc: #ef7d22; --tl: rgba(239, 125, 34, 0.1); }
	.team.is-blue { --tc: #2f7fe6; --tl: rgba(47, 127, 230, 0.12); }
	legend { padding: 0 6px; display: flex; align-items: center; gap: 8px; font-size: 15px; color: var(--ink); }
	legend i { width: 9px; height: 9px; border-radius: 50%; background: var(--tc); }
	legend small { color: var(--ink-3); }
	.seat { display: grid; grid-template-columns: 1fr auto 1fr 30px; align-items: center; gap: 6px; }
	.arr { color: var(--ink-3); }
	.x { width: 30px; height: 30px; padding: 0; border-radius: 8px; border: 1px solid transparent; background: none; color: var(--ink-3); cursor: pointer; }
	.x:hover:not(:disabled) { color: var(--danger-hi); border-color: rgba(229, 72, 77, 0.5); }
	.x:disabled { opacity: 0.3; cursor: default; }
	.addp { align-self: flex-start; padding: 3px 12px; border-radius: 999px; border: 1px dashed var(--brass-line); background: none; color: var(--brass-hi); font: inherit; font-size: 13px; cursor: pointer; }
	.seg, .chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.seg button, .chips button { padding: 6px 14px; border-radius: 999px; border: 1px solid var(--hair); background: var(--well); color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; }
	.chips button { padding: 4px 11px; font-size: 13px; }
	.seg button.on, .chips button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.seg .w-red.on { color: #fff; background: #ef7d22; }
	.seg .w-blue.on { color: #fff; background: #2f7fe6; }
	.prev { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
	.pl { font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
	pre { margin: 0; flex: 1; padding: 12px 14px; border-radius: 10px; background: rgba(3, 11, 21, 0.6); border: 1px solid var(--hair); color: var(--ink); font: inherit; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
	.ef { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--hair); }
	.sp { flex: 1; }
	.del { color: #ffb4a8; border: 1px solid rgba(194, 65, 47, 0.6); background: rgba(0, 0, 0, 0.3); }
	.del.arm { color: #fff; border-color: #ffb4a8; background: linear-gradient(180deg, #e5484d, #8f1d1d); }
	@media (max-width: 760px) {
		.scrim { padding: 0; }
		.ed { max-height: 100dvh; height: 100dvh; border-radius: 0; }
		.eb { grid-template-columns: 1fr; }
		.ef { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
	}
</style>
