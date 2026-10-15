<script lang="ts">
	// GM tools → NAMES: one person, many spellings. Every name typed into a recorded game (online + table games) is
	// listed as a person with their spellings; tick people and Merge them under one name, Rename one, or split a
	// spelling back out (its ×). Look-alike names are offered as one-tap merges. Saved as aliases (aliases.ts →
	// Supabase goa2_aliases) that the Hall and the hero pages apply when they load — no game row is ever changed,
	// and the newest action can be undone. GMs only (the soft gate in role.ts).
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { role } from '$lib/role';
	import { supabase } from '$lib/supabase';
	import Icon from '$lib/ui/Icon.svelte';
	import { REPORT_TABLE } from '$lib/reports';
	import { playerKey } from '$lib/league';
	import { ALIAS_SQL, loadAliases, saveAliases, resolveAliases, peopleOf, lookalikes, mergeRows, splitRow, pairKey, type AliasRow, type Person, type Spelling } from '$lib/aliases';

	let phase: 'loading' | 'ready' | 'error' = 'loading';
	let aliasStatus: 'ready' | 'missing' | 'error' = 'ready';
	let errMsg = '';
	let seen: { raw: string; table: boolean; at: number }[] = [];
	let rows: AliasRow[] = [];
	let q = '';
	let picked = new Set<string>();
	let asName = '';
	let busy = false;
	let toast = '';
	let undoRows: AliasRow[] | null = null;
	let toastT: ReturnType<typeof setTimeout> | null = null;
	let skip = new Set<string>();
	let copied = false;
	let aliasMsg = '';
	let checking = false;
	const LOCKED = 'Run the one-time setup above first';
	async function recheck() {
		checking = true;
		const a = await loadAliases();
		aliasStatus = a.status; aliasMsg = a.message ?? ''; rows = a.rows;
		checking = false;
		if (a.status === 'ready') say('Setup found — merging is on');
	}

	$: map = resolveAliases(rows);
	$: people = peopleOf(seen, map);
	$: pairs = lookalikes(people, skip).slice(0, 12);
	$: shown = q.trim() ? people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) || p.spellings.some((s) => s.raw.toLowerCase().includes(q.trim().toLowerCase()))) : people;
	$: chosen = people.filter((p) => picked.has(p.key));
	$: if (chosen.length && !asName.trim()) asName = chosen[0].name;
	$: if (!chosen.length) asName = '';

	onMount(async () => {
		try { skip = new Set(JSON.parse(localStorage.getItem('goa2-names-skip') ?? '[]')); } catch { /* ignore */ }
		if ($role !== 'admin') return;
		try {
			const got: typeof seen = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await supabase.from('goa2_games').select('id,ended_at,players:data->players').order('ended_at', { ascending: true }).range(from, from + 999);
				if (error) throw error;
				for (const r of data ?? []) for (const p of Object.values((r.players ?? {}) as Record<string, { name?: string; hero?: string }>))
					if (p?.name && p.hero) got.push({ raw: p.name, table: false, at: Date.parse(r.ended_at) || 0 });
				if (!data || data.length < 1000) break;
			}
			try {
				const { data } = await supabase.from(REPORT_TABLE).select('played_on,data').eq('kind', 'irl');
				for (const r of data ?? []) {
					const d = (r.data ?? {}) as { deleted?: boolean; red?: { name?: string }[]; blue?: { name?: string }[] };
					if (d.deleted) continue
					for (const s of [...(d.red ?? []), ...(d.blue ?? [])]) if (s?.name?.trim()) got.push({ raw: s.name.replace(/[?!]+$/, ''), table: true, at: Date.parse(`${r.played_on}T12:00:00Z`) || 0 });
				}
			} catch { /* no table games */ }
			seen = got;
			const a = await loadAliases();
			aliasStatus = a.status;
			aliasMsg = a.message ?? '';
			rows = a.rows;
			phase = 'ready';
		} catch (e) {
			errMsg = (e as { message?: string })?.message ?? String(e);
			phase = 'error';
		}
	});

	function say(t: string, undo: AliasRow[] | null = null) {
		toast = t; undoRows = undo;
		if (toastT) clearTimeout(toastT);
		toastT = setTimeout(() => { toast = ''; undoRows = null; }, 9000);
	}
	// what these aliases were before (a spelling with none comes back as itself)
	function before(next: AliasRow[]): AliasRow[] {
		const raw = new Map(people.flatMap((p) => p.spellings.map((s) => [s.key, s.raw] as const)));
		return next.map((r) => rows.find((x) => playerKey(x.alias) === r.alias) ?? { alias: r.alias, name: raw.get(r.alias) ?? r.alias });
	}
	async function apply(next: AliasRow[], msg: string, undoable = true) {
		if (busy || !next.length) return;
		busy = true;
		const prev = undoable ? before(next) : null;
		const err = await saveAliases(next);
		busy = false;
		if (err) { say(`Couldn't save: ${err}`); return; }
		const keys = new Set(next.map((r) => r.alias));
		rows = [...rows.filter((r) => !keys.has(playerKey(r.alias))), ...next];
		picked = new Set();
		say(msg, prev);
	}
	function merge(list: Person[], name: string) {
		const n = name.trim();
		if (!n || !list.length) return;
		void apply(mergeRows(list, n), list.length > 1 ? `Merged ${list.map((p) => p.name).join(', ')} → ${n}` : `Renamed ${list[0].name} → ${n}`);
	}
	function split(s: Spelling) { void apply([splitRow(s)], `${s.raw} is on their own again`); }
	function undo() { if (undoRows) { const u = undoRows; undoRows = null; void apply(u, 'Undone', false); } }
	function notSame(a: Person, b: Person) {
		skip = new Set([...skip, pairKey(a.key, b.key)]);
		try { localStorage.setItem('goa2-names-skip', JSON.stringify([...skip])); } catch { /* ignore */ }
	}
	function toggle(k: string) { const s = new Set(picked); if (s.has(k)) s.delete(k); else s.add(k); picked = s; }
	async function copySql() { try { await navigator.clipboard.writeText(ALIAS_SQL); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* ignore */ } }
	const day = (t: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');
</script>

<svelte:head><title>GoA2 · Player names</title></svelte:head>

<div class="names tide">
	<header class="top">
		<a class="btn btn-ghost btn-sm" href={base + '/'}><Icon name="back" /> <span class="hidem">Home</span></a>
		<h1 class="ttl">Player names</h1>
		{#if phase === 'ready'}<span class="count">{people.length} people · {new Set(seen.map((s) => playerKey(s.raw))).size} spellings</span>{/if}
	</header>

	<main class="body">
		<div class="wrap">
			{#if $role !== 'admin'}
				<section class="panel msg"><h2 class="t-h2">GMs only</h2><p class="t-body c-muted">Sign in as Admin first.</p><a class="btn btn-ghost" href={base + '/'}>Home</a></section>
			{:else if phase === 'loading'}
				<p class="note">Reading the records…</p>
			{:else if phase === 'error'}
				<section class="panel msg"><h2 class="t-h2">Couldn't read the games</h2><p class="t-body c-muted">{errMsg}</p></section>
			{:else}
				{#if aliasStatus !== 'ready'}
					<section class="panel setup">
						<h2>One-time setup</h2>
						<p class="c-muted">Merging is off until the names table can be read. Copy this, run it in Supabase → SQL Editor (safe to run again), then press Check again.</p>
						{#if aliasMsg}<p class="why">Supabase says: {aliasMsg}</p>{/if}
						<pre>{ALIAS_SQL}</pre>
						<div class="sbtns">
							<button class="btn btn-primary btn-sm" on:click={copySql}>{copied ? 'Copied' : 'Copy SQL'}</button>
							<button class="btn btn-ghost btn-sm" disabled={checking} on:click={recheck}>{checking ? 'Checking…' : 'Check again'}</button>
						</div>
					</section>
				{/if}

				{#if pairs.length}
					<section class="panel">
						<h2>Look alike</h2>
						<div class="pairs">
							{#each pairs as [a, b] (pairKey(a.key, b.key))}
								<div class="pair">
									<span class="pn"><b>{a.name}</b><small>{a.games}</small></span>
									<span class="amp">&</span>
									<span class="pn"><b>{b.name}</b><small>{b.games}</small></span>
									<span class="pacts">
										<button class="btn btn-primary btn-sm" disabled={busy || aliasStatus !== 'ready'} title={aliasStatus !== 'ready' ? LOCKED : ''} on:click={() => merge([a, b], a.name)}>As {a.name}</button>
										<button class="btn btn-ghost btn-sm" disabled={busy || aliasStatus !== 'ready'} title={aliasStatus !== 'ready' ? LOCKED : ''} on:click={() => merge([a, b], b.name)}>As {b.name}</button>
										<button class="btn btn-ghost btn-sm" on:click={() => notSame(a, b)}>Different</button>
									</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<section class="panel">
					<div class="lhead">
						<h2>Everyone</h2>
						<label class="search"><span>⌕</span><input placeholder="Search names…" bind:value={q} /></label>
					</div>
					<div class="bar" class:on={chosen.length > 0}>
						{#if chosen.length}
							<span class="sel">{chosen.length} picked</span>
							<input class="as" bind:value={asName} maxlength="40" placeholder="Name to show" />
							<button class="btn btn-primary btn-sm" disabled={busy || !asName.trim() || aliasStatus !== 'ready'} title={aliasStatus !== 'ready' ? LOCKED : ''} on:click={() => merge(chosen, asName)}>{chosen.length > 1 ? 'Merge' : 'Rename'}</button>
							<button class="btn btn-ghost btn-sm" on:click={() => (picked = new Set())}>Clear</button>
						{:else}
							<span class="hint">Tick two or more people to merge them, or one to rename.</span>
						{/if}
					</div>
					<ul class="list">
						{#each shown as p (p.key)}
							<li class:on={picked.has(p.key)}>
								<label class="tick"><input type="checkbox" checked={picked.has(p.key)} on:change={() => toggle(p.key)} /></label>
								<span class="who"><b>{p.name}</b><small>{p.games} game{p.games === 1 ? '' : 's'} · last {day(p.last)}</small></span>
								<span class="spells">
									{#if p.spellings.length > 1 || p.spellings[0].raw !== p.name}
										{#each p.spellings as s (s.key)}
											<span class="sp" title="{s.online} online · {s.table} table">{s.raw}<i>{s.games}</i>{#if p.spellings.length > 1}<button class="x" disabled={busy || aliasStatus !== 'ready'} on:click={() => split(s)} aria-label="Split {s.raw} out" title="Split out">×</button>{/if}</span>
										{/each}
									{/if}
								</span>
							</li>
						{:else}<li class="none">No names match.</li>{/each}
					</ul>
				</section>
			{/if}
		</div>
	</main>

	{#if toast}<div class="toast">{toast}{#if undoRows}<button on:click={undo}>Undo</button>{/if}</div>{/if}
</div>

<style>
	.names { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); }
	.top { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 20px; border-bottom: 1px solid var(--brass-line); background: rgba(3, 11, 21, 0.72); }
	.ttl { margin: 0; font-weight: 400; font-size: 26px; color: var(--brass-hi); }
	.count { margin-left: auto; font-size: 13px; color: var(--ink-3); }
	.body { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
	.wrap { max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
	.note { text-align: center; color: var(--ink-3); }
	.msg { max-width: 420px; margin: 40px auto; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; text-align: center; }
	.panel { padding: 16px 18px; }
	h2 { margin: 0 0 10px; font-weight: 400; font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-hi); }
	.setup .why { margin: 8px 0 0; font-size: 13px; color: #ff9b8f; }
	.sbtns { display: flex; gap: 8px; }
	.setup pre { margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: rgba(0, 0, 0, 0.35); font-family: ui-monospace, monospace; font-size: 12px; color: var(--ink-2); white-space: pre-wrap; }
	.pairs { display: flex; flex-direction: column; gap: 8px; }
	.pair { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--hair); }
	.pn { display: inline-flex; align-items: baseline; gap: 6px; }
	.pn b { font-weight: 400; font-size: 17px; color: #fff; }
	.pn small, .who small { font-size: 12px; color: var(--ink-3); }
	.amp { color: var(--ink-3); }
	.pacts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
	.lhead { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
	.lhead h2 { margin: 0; }
	.search { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; height: 34px; border-radius: 9px; border: 1px solid var(--hair); background: rgba(4, 14, 26, 0.8); color: var(--ink-3); }
	.search input { border: 0; background: none; color: var(--ink); font: inherit; font-size: 14px; outline: none; width: 180px; }
	.bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-height: 44px; padding: 6px 10px; margin-bottom: 8px; border-radius: 10px; border: 1px dashed var(--hair); }
	.bar.on { border-style: solid; border-color: var(--brass-line); background: var(--brass-faint); }
	.hint { font-size: 13px; color: var(--ink-3); }
	.sel { font-size: 13px; color: var(--brass-hi); }
	.as { flex: 1 1 160px; min-width: 120px; height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--brass-line); background: rgba(4, 14, 26, 0.9); color: #fff; font: inherit; font-size: 15px; }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
	.list li { display: grid; grid-template-columns: 28px minmax(140px, 220px) 1fr; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
	.list li.on { background: var(--brass-faint); }
	.list li.none { display: block; color: var(--ink-3); }
	.tick input { width: 17px; height: 17px; accent-color: var(--brass); }
	.who { display: flex; flex-direction: column; min-width: 0; }
	.who b { font-weight: 400; font-size: 17px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.spells { display: flex; flex-wrap: wrap; gap: 6px; }
	.sp { display: inline-flex; align-items: center; gap: 5px; padding: 2px 4px 2px 10px; border-radius: 999px; font-size: 13px; color: var(--ink-2); border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.03); }
	.sp i { font-style: normal; font-size: 11px; color: var(--ink-3); }
	.x { width: 20px; height: 20px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, 0.06); color: var(--ink-2); line-height: 1; cursor: pointer; }
	.x:hover { background: rgba(239, 90, 75, 0.3); color: #fff; }
	.toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; background: rgba(3, 11, 21, 0.96); border: 1px solid var(--brass-line); font-size: 14px; max-width: 92vw; }
	.toast button { border: 0; background: none; color: var(--brass-hi); font: inherit; cursor: pointer; text-decoration: underline; }
	@media (max-width: 760px) {
		.top { padding: 8px 12px; } .ttl { font-size: 22px; } .hidem, .count { display: none; }
		.body { padding: 12px; }
		.search { margin-left: 0; width: 100%; } .search input { width: 100%; }
		.list li { grid-template-columns: 28px 1fr; }
		.spells { grid-column: 2; }
	}
</style>
