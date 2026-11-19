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
		const again = () => { if (leagueAsked && document.visibilityState === 'visible') void loadLeague(); };
		const t = setInterval(again, 5 * 60 * 1000);
		document.addEventListener('visibilitychange', again);
		return () => { clearInterval(t); document.removeEventListener('visibilitychange', again); };
	});
</script>

<svelte:head><title>GoA2 · Heroes</title></svelte:head>

{#if ready}
	<HeroPage {heroId} bind:tab {openings} {guide} {status} {record} local={localHero} gm beta noOpenings onHero={(id) => (heroId = id)} />
{/if}

