<script lang="ts">
	// The Hall of Records' REPORTS: the group's weekly game report for every game — online games drafted by the app
	// (from `goa2_games`), table games logged by hand — newest first. Copy puts the report on the clipboard for the
	// group chat; Edit opens the editor (tactics, banter, anything the app can't see). Saved in `goa2_reports`.
	// Table games (with a winner) count as LEGACY games in the Hall: their own player records and awards, and the hero stats.
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import type { GameRowIn } from '$lib/league';
	import {
		REPORT_TABLE, draftReport, matchNumbers, reportIdOf, newIrlId, reportOfRow, rowOfReport, reportText, reportMatches, dayOf, dotDate,
		type Report
	} from '$lib/reports';
	import ReportEditor from './ReportEditor.svelte';
	import { playByPlay } from '$lib/playbyplay';
	import { heroIdOfName } from '$lib/league';
	import { portraitCss } from '$lib/heroes';

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
	const face = (hero: string) => { const id = heroIdOfName(hero); return id ? portraitCss(id) : ''; };
	$: counts = { all: online.length + irl.length, online: online.length, irl: irl.length };
	$: editRow = editing ? online.find((x) => x.r.id === editing!.id)?.row ?? null : null;
</script>

<div class="tbar">
	<label class="search grow"><span>⌕</span><input placeholder="Search by player, hero or highlight…" bind:value={q} /></label>
	<span class="seg" role="group" aria-label="Show">
		<button class:on={show === 'all'} on:click={() => (show = 'all')}>All <small>{counts.all}</small></button>
		<button class:on={show === 'online'} on:click={() => (show = 'online')}>Online <small>{counts.online}</small></button>
		<button class:on={show === 'irl'} on:click={() => (show = 'irl')}>Table <small>{counts.irl}</small></button>
	</span>
	<button class="btn2 pri" on:click={() => (editing = newIrl())} disabled={status === 'loading'}>+ Log a table game</button>
</div>

{#if status === 'missing'}
	<p class="warn">The reports table isn't set up in Supabase yet: you can read and copy the drafts below, but saving and table games need it.</p>
{:else if status === 'error'}
	<p class="warn">Couldn't read the saved reports ({err}). The drafts below still work; saving may not.</p>
{/if}

<div class="rlist">
	{#each list as x (x.r.id)}
		{@const r = x.r}
		<article class="card rc is-{r.winner}">
			<header class="rh">
				<span class="rt"><b>{dotDate(r.date)} · Match {r.match ?? '#'}</b><small>{r.red.length}v{r.blue.length}{r.condition ? ` · ${r.condition}` : ''}{r.wave ? ` · Wave ${r.wave}` : ''}</small></span>
				<span class="tags">
					<span class="chip">{r.kind === 'irl' ? 'Table game' : 'Online'}</span>
					{#if x.draft}<span class="chip dr">Draft</span>{/if}
					<span class="chip win w-{r.winner}">{winLabel(r)}</span>
				</span>
			</header>
			<div class="sides">
				{#each [['red', 'Atlanteans'], ['blue', 'Titans']] as [sd, nm] (sd)}
					{@const seats = sd === 'red' ? r.red : r.blue}
					<div class="side s-{sd}" class:won={r.winner === sd}>
						<span class="sl">{nm}{#if r.winner === sd}<em>WIN</em>{/if}</span>
						{#each seats as st, i (i)}
							<span class="st"><span class="face" style="--fs:26px; {face(st.hero)}"></span><span><b>{st.name || '—'}</b><small>{st.hero || '—'}</small></span></span>
						{/each}
					</div>
				{/each}
			</div>
			<pre class:clip={!openId[r.id]}>{reportText(r)}</pre>
			<div class="fold" class:open={openId[r.id]}>
				<button class="more" on:click={() => (openId = { ...openId, [r.id]: !openId[r.id] })} aria-expanded={!!openId[r.id]}>
					<span>{openId[r.id] ? 'Collapse' : 'Read the report'}</span>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<footer class="rf">
				<span class="sp"></span>
				<button class="btn2" on:click={() => (editing = r)}>Edit</button>
				{#if x.row}{@const gr = x.row}<button class="btn2" on:click={() => openPbp(gr, r)} disabled={pbpBusy === gr.id} title="The whole game, round by round — paste it to Claude to write the report">{pbpBusy === gr.id ? 'Loading…' : 'Play-by-play'}</button>{/if}
				<button class="btn2 pri" on:click={() => copy(r)}>Copy</button>
			</footer>
		</article>
	{:else}
		<section class="card msg"><h3>{q ? 'No report matches' : 'No reports yet'}</h3><p class="muted">{q ? 'Try a player, a hero or a word from the highlights.' : 'Online games get a drafted report when they are won; table games are logged with + Log a table game.'}</p></section>
	{/each}
</div>
<p class="fine">Table games count in the Hall's <b>Legacy</b> and <b>Total</b> records. A cancelled game, or one marked "doesn't count", is left out.</p>

{#if editing}
	{@const er = editRow}
	<ReportEditor report={editing} onSave={save} onCancel={() => (editing = null)}
		redraft={er ? () => draftOf(er) : null}
		onDelete={editing.kind === 'irl' && byId.has(editing.id) ? () => editing && save({ ...editing, deleted: true }) : null} />
{/if}
{#if pbp}
	<div class="pbpscrim" role="presentation" on:click|self={() => (pbp = null)}>
		<div class="card pbp" role="dialog" aria-label="Play-by-play">
			<header class="ch">Play-by-play <small>{pbp.title}</small><button class="btn2 r" on:click={() => (pbp = null)} aria-label="Close">✕</button></header>
			<p class="fine top">The whole game round by round, with a request at the top — paste it to Claude and add anything else you remember.</p>
			<textarea bind:this={pbpBox} readonly value={pbp.text}></textarea>
			<footer><button class="btn2 pri" on:click={copyPbp}>Copy play-by-play</button></footer>
		</div>
	</div>
{/if}
{#if toast}<div class="rtoast" role="status">{toast}</div>{/if}

<style>
	.tbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
	.tbar .grow { flex: 1 1 260px; }
	.seg small { margin-left: 4px; font-size: 11.5px; color: var(--mu2); font-variant-numeric: tabular-nums; }
	.seg button.on small { color: var(--mu); }
	.btn2:disabled { opacity: 0.5; cursor: default; }
	.warn { margin: 0 0 12px; padding: 9px 12px; border-radius: 8px; font-size: 13.5px; color: #ffd9a8; background: rgba(239, 125, 34, 0.1); border: 1px solid rgba(239, 125, 34, 0.35); }
	.rlist { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; align-items: start; }
	.rc { padding: 0; overflow: hidden; border-top: 2px solid var(--tc, var(--ln2)); }
	.rc.is-red { --tc: var(--or); } .rc.is-blue { --tc: var(--ti); }
	.rh { display: flex; align-items: center; gap: 12px; padding: 14px 18px 12px; }
	.rt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.rt b { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.rt small { font-size: 12.5px; color: var(--mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.tags { flex: none; display: flex; gap: 6px; }
	.chip.dr { color: var(--au); border-color: rgba(243, 196, 84, 0.35); background: rgba(243, 196, 84, 0.08); }
	.chip.w-red { color: #fff; background: var(--or); border-color: transparent; }
	.chip.w-blue { color: #fff; background: var(--ti); border-color: transparent; }
	.sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 18px; padding: 0 18px 12px; border-bottom: 1px solid var(--ln); }
	.side { display: flex; flex-direction: column; gap: 6px; min-width: 0; opacity: 0.6; }
	.side.won { opacity: 1; }
	.sl { display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
	.s-red .sl { color: var(--or); } .s-blue .sl { color: var(--ti); }
	.sl em { font-style: normal; padding: 1px 6px; border-radius: 4px; font-size: 10.5px; color: #04230f; background: var(--gr); }
	.st { display: flex; align-items: center; gap: 8px; min-width: 0; }
	.st > span:last-child { display: flex; flex-direction: column; min-width: 0; }
	.st b { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.st small { font-size: 11.5px; color: var(--mu); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.won .face { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1), 0 0 0 2px var(--gr); }
	pre { margin: 0; padding: 12px 18px 4px; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; word-break: break-word; user-select: text; }
	pre.clip { max-height: 220px; overflow: hidden; -webkit-mask-image: linear-gradient(180deg, #000 70%, transparent); mask-image: linear-gradient(180deg, #000 70%, transparent); }
	.rf { display: flex; align-items: center; gap: 8px; padding: 8px 18px 14px; }
	.rf .sp { flex: 1; }
	.fold { position: relative; display: flex; justify-content: center; margin-top: -22px; padding-bottom: 4px; }
	.fold.open { margin-top: 4px; }
	.more { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px 0 14px; border-radius: 999px; border: 1px solid var(--ln2); background: var(--p2); color: var(--tx2); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45); transition: color 0.15s, border-color 0.15s; }
	.more:hover { color: var(--tx); border-color: var(--bl); }
	.more svg { transition: transform 0.2s; }
	.fold.open .more svg { transform: rotate(180deg); }
	.msg { grid-column: 1 / -1; text-align: center; padding: 40px 20px; }
	.msg h3 { margin: 0 0 6px; font-size: 17px; }
	.msg p { margin: 0; }
	.fine b { color: var(--tx2); }
	.pbpscrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, 0.7); }
	.pbp { width: min(860px, 100%); height: min(86dvh, 900px); display: flex; flex-direction: column; gap: 10px; }
	.pbp .ch { margin: 0; }
	.pbp .fine.top { margin: 0; }
	.pbp textarea { flex: 1; min-height: 0; resize: none; padding: 12px 14px; border-radius: 8px; background: var(--bg); border: 1px solid var(--ln); color: var(--tx); font: inherit; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
	.pbp footer { display: flex; justify-content: flex-end; }
	.rtoast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 70; padding: 10px 16px; border-radius: 8px; background: var(--p3); border: 1px solid var(--ln2); color: var(--tx); font-size: 13.5px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
	@media (max-width: 760px) {
		.rlist { grid-template-columns: minmax(0, 1fr); }
		.tbar .btn2 { width: 100%; justify-content: center; }
		.rh { flex-wrap: wrap; padding: 12px 14px 10px; }
		.sides, pre { padding-left: 14px; padding-right: 14px; }
		.rf { flex-wrap: wrap; padding: 8px 14px 12px; }
	}
</style>
