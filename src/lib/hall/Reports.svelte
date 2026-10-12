<script lang="ts">
	// The Hall of Records' REPORTS: the group's weekly game report for every game — online games drafted by the app
	// (from `goa2_games`), table games logged by hand — newest first. Copy puts the report on the clipboard for the
	// group chat; Edit opens the editor (tactics, banter, anything the app can't see). Saved in `goa2_reports`.
	// Table games are reports only: they never count for ratings, awards or any other number here.
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { GameRowIn } from '$lib/league';
	import {
		REPORT_TABLE, draftReport, matchNumbers, reportIdOf, newIrlId, reportOfRow, rowOfReport, reportText, reportMatches, dayOf, dotDate,
		type Report
	} from '$lib/reports';
	import ReportEditor from './ReportEditor.svelte';
	import { playByPlay } from '$lib/playbyplay';
	import Glyph from './Glyph.svelte';

	export let rows: GameRowIn[] = [];

	let status: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
	let err = '';
	let saved: Report[] = [];
	let q = '';
	let show: 'all' | 'online' | 'irl' = 'all';
	let editing: Report | null = null;
	let toast = '', toastT: ReturnType<typeof setTimeout> | null = null;
	const say = (t: string) => { toast = t; if (toastT) clearTimeout(toastT); toastT = setTimeout(() => (toast = ''), 3500); };

	// the table isn't there (or the anon key can't see it): Supabase says so in one of these ways
	const isMissing = (e: { code?: string; message?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? ''));

	// the board record + host notes (recorder evv ≥ 3) — not in the Hall's main read, which skips the heavy parts
	let extra: Record<string, Record<string, unknown>> = {};
	async function loadExtra() {
		try {
			const { data } = await supabase.from('goa2_games').select('id,d_shots:data->shots,d_zones:data->zones,d_pcs:data->pcs,d_notes:data->notes').not('data->shots', 'is', null).range(0, 999);
			const next: typeof extra = {};
			for (const r of (data ?? []) as Record<string, unknown>[]) next[String(r.id)] = { shots: r.d_shots, zones: r.d_zones, pcs: r.d_pcs, notes: r.d_notes };
			extra = next;
		} catch { /* the drafts just stay simpler */ }
	}

	onMount(async () => {
		void loadExtra();
		try {
			const { data, error } = await supabase.from(REPORT_TABLE).select('id,kind,game_id,played_on,data,updated_at');
			if (error) { status = isMissing(error) ? 'missing' : 'error'; err = error.message; return; }
			saved = (data ?? []).map(reportOfRow).filter((r): r is Report => !!r);
			status = 'ready';
		} catch (e) { status = 'error'; err = (e as { message?: string })?.message ?? String(e); }
	});

	// online games: the saved report, else the app's draft
	$: rowsX = rows.map((r) => (extra[r.id] ? { ...r, data: { ...r.data, ...extra[r.id] } } : r));
	$: games = rowsX.filter((r) => r.winner === 'orange' || r.winner === 'blue' || r.data?.final?.wonBy?.team);
	$: nums = matchNumbers(games.map((r) => ({ id: r.id, at: Date.parse(r.started_at) || Date.parse(r.ended_at) || 0 })));
	$: byId = new Map(saved.map((r) => [r.id, r]));
	$: draftOf = (row: GameRowIn) => draftReport(row, nums[row.id] ?? null);
	$: online = games.map((row) => {
		const s = byId.get(reportIdOf(row.id));
		return { r: s ?? draftOf(row), row, draft: !s, at: Date.parse(row.started_at) || 0 };
	});
	$: irl = saved.filter((r) => r.kind === 'irl' && !r.deleted).map((r) => ({ r, row: null as GameRowIn | null, draft: false, at: Date.parse(r.date) || 0 }));
	$: list = [...(show === 'irl' ? [] : online), ...(show === 'online' ? [] : irl)]
		.filter((x) => reportMatches(x.r, q))
		.sort((a, b) => b.r.date.localeCompare(a.r.date) || (b.r.match ?? 0) - (a.r.match ?? 0) || b.at - a.at);

	function newIrl(): Report {
		const today = dayOf(Date.now());
		const same = irl.filter((x) => x.r.date === today).length + online.filter((x) => x.r.date === today).length;
		return { id: newIrlId(), kind: 'irl', date: today, match: same + 1, red: [{ name: '', hero: '' }, { name: '', hero: '' }], blue: [{ name: '', hero: '' }, { name: '', hero: '' }],
			winner: 'red', winnerNote: '', condition: 'Last Push', wave: 3, highlights: '' };
	}

	async function store(r: Report): Promise<boolean> {
		if (status === 'missing') { say("The reports table isn't set up in Supabase yet."); return false; }
		try {
			const { error } = await supabase.from(REPORT_TABLE).upsert(rowOfReport(r), { onConflict: 'id' });
			if (error) { say(isMissing(error) ? "The reports table isn't set up in Supabase yet." : `Couldn't save: ${error.message}`); return false; }
		} catch (e) { say(`Couldn't save: ${(e as { message?: string })?.message ?? e}`); return false; }
		const next = { ...r, updatedAt: Date.now() };
		saved = [...saved.filter((x) => x.id !== r.id), next];
		return true;
	}
	async function save(r: Report) {
		const ok = await store(r);
		if (ok) { editing = null; say(r.deleted ? 'Report deleted.' : 'Report saved.'); }
		return ok;
	}

	async function copy(r: Report) {
		const text = reportText(r);
		try { await navigator.clipboard.writeText(text); say('Report copied — paste it in the group chat.'); return; } catch { /* fall back below */ }
		try {
			const ta = document.createElement('textarea');
			ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
			document.body.appendChild(ta); ta.select();
			const ok = document.execCommand('copy');
			ta.remove();
			say(ok ? 'Report copied — paste it in the group chat.' : "Couldn't copy — select the text and copy it by hand.");
		} catch { say("Couldn't copy — select the text and copy it by hand."); }
	}

	// the play-by-play: the whole game as text (fetched with its log), shown to copy — paste it to Claude with your notes
	let pbp: { title: string; text: string } | null = null;
	let pbpBusy = '';
	async function openPbp(row: GameRowIn, r: Report) {
		pbpBusy = row.id;
		try {
			const { data, error } = await supabase.from('goa2_games').select('id,room,started_at,ended_at,winner,reason,rounds,data').eq('id', row.id).single();
			if (error || !data) { say(`Couldn't load the game: ${error?.message ?? 'not found'}`); return; }
			pbp = { title: `${dotDate(r.date)} · Match ${r.match ?? '#'}`, text: playByPlay(data as GameRowIn, { match: r.match }) };
		} catch (e) { say(`Couldn't load the game: ${(e as { message?: string })?.message ?? e}`); }
		finally { pbpBusy = ''; }
	}
	let pbpBox: HTMLTextAreaElement;
	async function copyPbp() {
		if (!pbp) return;
		try { await navigator.clipboard.writeText(pbp.text); say('Play-by-play copied — paste it to Claude with your notes.'); return; } catch { /* fall back */ }
		try { pbpBox.select(); say(document.execCommand('copy') ? 'Play-by-play copied — paste it to Claude with your notes.' : 'Select the text and copy it by hand.'); } catch { say('Select the text and copy it by hand.'); }
	}

	let openId: Record<string, boolean> = {};
	const winLabel = (r: Report) => (r.winner === 'none' ? 'No winner' : r.winner === 'red' ? 'Atlanteans won' : 'Titans won');
	$: editRow = editing ? online.find((x) => x.r.id === editing!.id)?.row ?? null : null;
</script>

<div class="panel tbar">
	<label class="srch"><Glyph name="search" size={16} /><input placeholder="Search by player, hero or highlight…" bind:value={q} /></label>
	<div class="sorts" role="group" aria-label="Show">
		<button class:on={show === 'all'} on:click={() => (show = 'all')}>All</button>
		<button class:on={show === 'online'} on:click={() => (show = 'online')}>Online</button>
		<button class:on={show === 'irl'} on:click={() => (show = 'irl')}>Table games</button>
	</div>
	<button class="btn btn-primary btn-sm logb" on:click={() => (editing = newIrl())} disabled={status === 'loading'}>+ Log a table game</button>
</div>

{#if status === 'missing'}
	<p class="warn">The reports table isn't set up in Supabase yet: you can read and copy the drafts below, but saving and table games need it.</p>
{:else if status === 'error'}
	<p class="warn">Couldn't read the saved reports ({err}). The drafts below still work; saving may not.</p>
{/if}
<p class="fine">Table games are kept here as reports only: they don't count for ratings, awards or any other stats.</p>

<div class="rlist">
	{#each list as x (x.r.id)}
		{@const r = x.r}
		<article class="panel rc is-{r.winner}">
			<header class="rh">
				<span class="kind" class:irl={r.kind === 'irl'}>{r.kind === 'irl' ? 'Table game' : 'Online'}</span>
				<span class="rt"><b>{dotDate(r.date)} · Match {r.match ?? '#'} · {r.red.length}v{r.blue.length}</b><small>{winLabel(r)}{r.condition ? ` · ${r.condition}` : ''}{x.draft ? ' · draft' : ''}</small></span>
				<span class="acts">
					<button class="btn btn-sm cp" on:click={() => copy(r)}>Copy</button>
					{#if x.row}{@const gr = x.row}<button class="btn btn-ghost btn-sm" on:click={() => openPbp(gr, r)} disabled={pbpBusy === gr.id} title="The whole game, round by round — paste it to Claude to write the report">{pbpBusy === gr.id ? 'Loading…' : 'Play-by-play'}</button>{/if}
					<button class="btn btn-ghost btn-sm" on:click={() => (editing = r)}>Edit</button>
				</span>
			</header>
			<pre class:clip={!openId[r.id]}>{reportText(r)}</pre>
			<button class="more" on:click={() => (openId = { ...openId, [r.id]: !openId[r.id] })}>{openId[r.id] ? 'Show less' : 'Show the whole report'}</button>
		</article>
	{:else}
		<p class="note">{q ? 'No report matches.' : 'No reports yet.'}</p>
	{/each}
</div>

{#if editing}
	{@const er = editRow}
	<ReportEditor report={editing} onSave={save} onCancel={() => (editing = null)}
		redraft={er ? () => draftOf(er) : null}
		onDelete={editing.kind === 'irl' && byId.has(editing.id) ? () => editing && save({ ...editing, deleted: true }) : null} />
{/if}
{#if pbp}
	<div class="pbpscrim" role="presentation" on:click|self={() => (pbp = null)}>
		<div class="panel pbp" role="dialog" aria-label="Play-by-play">
			<header><b>Play-by-play · {pbp.title}</b><button class="btn btn-ghost btn-sm" on:click={() => (pbp = null)} aria-label="Close">✕</button></header>
			<p class="fine">The whole game round by round, with a request at the top — paste it to Claude and add anything else you remember.</p>
			<textarea bind:this={pbpBox} readonly value={pbp.text}></textarea>
			<footer><button class="btn btn-sm cp" on:click={copyPbp}>Copy play-by-play</button></footer>
		</div>
	</div>
{/if}
{#if toast}<div class="toast toast--plain pretoast rtoast">{toast}</div>{/if}

<style>
	.tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px; margin-bottom: 10px; }
	.srch { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 40px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); color: var(--ink-3); }
	.srch input { flex: 1; min-width: 0; height: 100%; border: 0; outline: 0; background: none; color: var(--ink); font: inherit; font-size: 15px; padding: 0; }
	.srch:focus-within { border-color: var(--brass-line); }
	.sorts { display: flex; gap: 4px; padding: 3px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); }
	.sorts button { padding: 6px 12px; border-radius: 8px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; }
	.sorts button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.warn { margin: 0 0 8px; padding: 8px 12px; border-radius: 8px; font-size: 13.5px; color: #ffd9a8; background: rgba(239, 125, 34, 0.12); border: 1px solid rgba(239, 125, 34, 0.4); }
	.fine { font-size: 12px; color: var(--ink-3); margin: 0 0 12px; }
	.rlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; align-items: start; }
	.rc { padding: 0; overflow: hidden; border-top: 3px solid var(--tc, var(--brass-line)); }
	.rc.is-red { --tc: #ef7d22; } .rc.is-blue { --tc: #2f7fe6; }
	.rh { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--hair); }
	.kind { flex: none; padding: 2px 9px; border-radius: 999px; font-size: 11.5px; letter-spacing: 0.04em; color: var(--ink-2); background: var(--well); border: 1px solid var(--hair); }
	.kind.irl { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
	.rt b { font-weight: 400; font-size: 15.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rt small { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.acts { flex: none; display: flex; gap: 6px; }
	.cp { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); border: 0; }
	pre { margin: 0; padding: 12px 14px 4px; font: inherit; font-size: 14px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; word-break: break-word; user-select: text; }
	pre.clip { max-height: 300px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, #000 78%, transparent); mask-image: linear-gradient(180deg, #000 78%, transparent); }
	.more { display: block; width: 100%; padding: 6px 0 10px; border: 0; background: none; color: var(--brass-hi); font: inherit; font-size: 13px; cursor: pointer; }
	.note { text-align: center; color: var(--ink-3); margin-top: 12vh; grid-column: 1 / -1; }
	.pbpscrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(2, 8, 16, 0.72); }
	.pbp { width: min(860px, 100%); height: min(86dvh, 900px); display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; }
	.pbp header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.pbp header b { font-weight: 400; font-size: 17px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pbp .fine { margin: 0; }
	.pbp textarea { flex: 1; min-height: 0; resize: none; padding: 10px 12px; border-radius: 10px; background: var(--well); border: 1px solid var(--hair); color: var(--ink); font: inherit; font-size: 13px; line-height: 1.45; white-space: pre-wrap; }
	.pbp footer { display: flex; justify-content: flex-end; }
	.rtoast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 70; }
	@media (max-width: 760px) {
		.rlist { grid-template-columns: 1fr; }
		.logb { width: 100%; }
		.rh { flex-wrap: wrap; }
		.acts { width: 100%; }
		.acts .btn { flex: 1; }
	}
</style>
