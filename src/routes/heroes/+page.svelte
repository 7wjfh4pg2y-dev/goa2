<script lang="ts">
	// Heroes (everyone, since 2026-11-19 — the beta page went live): one page per hero — art, stats, the guide, the
	// starting hand, matchups and our record. Openings + the opening builder stay off here until they're good enough
	// (/heroes-beta keeps them for GMs). ?hero=id
	import { onMount } from 'svelte';
	import { HEROES_ALPHA } from '$lib/heroes';
	import HeroPage from '$lib/heropage/HeroPage.svelte';
	import { loadOpenings } from '$lib/openings/store';
	import type { Opening, HeroGuide } from '$lib/openings';
	import { supabase } from '$lib/supabase';
	import { buildLeague, useAliases, leagueOf, gameOfReport, rowOfSelect, LEAGUE_SELECT, type GameRowIn, type LeagueGame, type League } from '$lib/league';
	import { REPORT_TABLE, reportOfRow, type Report } from '$lib/reports';
	import { loadAliases, resolveAliases } from '$lib/aliases';
	import { heroMatchupsAll } from '$lib/hallstats';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
	import { browseRooms, type RoomInfo } from '$lib/lobby';

	// LOCKED while any game is on (2026-11-25, the user: no looking up cards mid-game). The public room directory
	// (lobby.ts) says where every room is; a room in hero select or a game closes this page for everyone, live. If the
	// directory never answers (offline), the page opens after LOCK_WAIT_MS rather than staying shut.
	const LOCK_WAIT_MS = 6000;
	let rooms: RoomInfo[] = [];
	let heard = false;
	let waited = false;
	$: busy = rooms.filter((r) => r.started || r.phase === 'draft' || r.phase === 'game');
	$: locked = busy.length > 0;
	$: checking = !heard && !waited;
	const where = (r: RoomInfo) => (r.phase === 'draft' ? 'Hero select' : r.round ? `Round ${r.round}` : 'In progress');

	// Matchups from the records: every online game plus the table games (the Hall's Total) — read on opening, again
	// whenever the tab comes back into view and every 5 minutes, so a finished match shows without a reload.
	let league: League | null = null;
	let leagueAsked = false;
	let leagueBusy = false;
	async function loadLeague() {
		leagueAsked = true;
		if (leagueBusy) return;
		leagueBusy = true;
		try {
			const got: GameRowIn[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await supabase.from('goa2_games').select(LEAGUE_SELECT).order('ended_at', { ascending: true }).range(from, from + 999);
				if (error) throw error;
				got.push(...(data ?? []).map(rowOfSelect));
				if (!data || data.length < 1000) break;
			}
			let table: Report[] = [];
			try {
				const { data, error } = await supabase.from(REPORT_TABLE).select('id,kind,game_id,played_on,data,updated_at').eq('kind', 'irl');
				if (!error) table = (data ?? []).map(reportOfRow).filter((r): r is Report => !!r && !r.deleted);
			} catch { /* no table games */ }
			useAliases(resolveAliases((await loadAliases()).rows)); // the GM tools' merged names
			const legacy = table.map((r) => { try { return gameOfReport(r); } catch { return null; } }).filter((g): g is LeagueGame => !!g);
			league = leagueOf([...buildLeague(got).games, ...legacy]);
		} catch { /* keep what we had */ } finally { leagueBusy = false; }
	}
	$: if (ready && !leagueAsked) void loadLeague();
	$: record = heroMatchupsAll(league, heroId);
	$: localHero = league?.heroes.find((x) => x.hero === heroId) ?? null;

	let heroId = 'arien'; // the default hero (first alphabetically)
	let tab: 'overview' | 'openings' = 'overview';
	let ready = false;
	let status: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
	let openings: Opening[] = [];
	let guide: HeroGuide | null = null;
	let loadedFor = '';
	async function load(id: string) {
		loadedFor = id;
		status = 'loading';
		const r = await loadOpenings(id);
		if (loadedFor !== id) return;
		openings = r.openings;
		guide = r.guides[id] ?? null;
		status = r.status;
	}
	$: if (ready && heroId !== loadedFor) void load(heroId);
	function sync() { try { const q = new URL(location.href); q.searchParams.set('hero', heroId); q.searchParams.set('tab', tab); history.replaceState(history.state, '', q); } catch { /* ignore */ } }
	$: if (ready) { heroId; tab; sync(); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		const h = q.get('hero');
		if (h && HEROES_ALPHA.some((x) => x.id === h)) heroId = h;
		ready = true;
		const dir = browseRooms((l) => { rooms = l; heard = true; });
		const wait = setTimeout(() => (waited = true), LOCK_WAIT_MS);
		const again = () => { if (leagueAsked && document.visibilityState === 'visible') void loadLeague(); };
		const t = setInterval(again, 5 * 60 * 1000);
		document.addEventListener('visibilitychange', again);
		return () => { clearInterval(t); clearTimeout(wait); dir.leave(); document.removeEventListener('visibilitychange', again); };
	});
</script>

<svelte:head><title>GoA2 · Heroes</title></svelte:head>

{#if ready && (checking || locked)}
	<div class="lock">
		<div class="box">
			{#if checking}
				<p class="k">Heroes</p>
				<h1>Checking for games…</h1>
			{:else}
				<p class="k">Heroes · closed for now</p>
				<h1>A game is on</h1>
				<p>The hero pages open again once {busy.length === 1 ? 'it ends' : 'they all end'}.</p>
				<ul>{#each busy as r (r.room)}<li><b>{r.room}</b><span>{where(r)} · {r.count} player{r.count === 1 ? '' : 's'}</span></li>{/each}</ul>
			{/if}
			<a class="bk" href={base + '/?at=learn'} on:click|preventDefault={() => goBack('learn')}>← Back</a>
		</div>
	</div>
{:else if ready}
	<HeroPage {heroId} bind:tab {openings} {guide} {status} {record} local={localHero} gm beta noOpenings onHero={(id) => (heroId = id)} />
{/if}


<style>
	.lock { position: fixed; inset: 0; display: grid; place-items: center; background: #0c1220; color: #e9e2cf; padding: 16px; }
	.box { width: min(420px, 100%); text-align: center; border: 1px solid rgba(201, 162, 90, 0.4); border-radius: 12px; background: rgba(18, 27, 45, 0.92); padding: 28px 22px 22px; }
	.k { margin: 0; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #c9a25a; }
	h1 { margin: 8px 0 10px; font-size: 30px; font-weight: normal; }
	p { margin: 0 0 14px; color: #b9b2a0; }
	ul { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 6px; }
	li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); }
	li span { color: #b9b2a0; }
	.bk { display: inline-block; margin-top: 4px; padding: 9px 18px; border-radius: 999px; border: 1px solid rgba(201, 162, 90, 0.5); color: #e9c98a; text-decoration: none; }
	.bk:hover { background: rgba(201, 162, 90, 0.12); }
</style>
