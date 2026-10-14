<script lang="ts">
	// Heroes (work in progress; GMs only until it's done, then it moves to Learn to play): one page per hero —
	// Overview (art, stats, the guide, the starting hand) and Openings (built in the opening builder).
	// ?hero=id&tab=openings&op=id
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';
	import { HEROES_ALPHA } from '$lib/heroes';
	import HeroPage from '$lib/heropage/HeroPage.svelte';
	import { loadOpenings } from '$lib/openings/store';
	import type { Opening, HeroGuide } from '$lib/openings';
	import { supabase } from '$lib/supabase';
	import { buildLeague, leagueOf, gameOfReport, rowOfSelect, LEAGUE_SELECT, type GameRowIn, type LeagueGame, type League } from '$lib/league';
	import { REPORT_TABLE, reportOfRow, type Report } from '$lib/reports';
	import { heroMatchups } from '$lib/hallstats';

	// Matchups from the records: every online game plus the table games (the Hall's Total), read once.
	let league: League | null = null;
	let leagueAsked = false;
	async function loadLeague() {
		leagueAsked = true;
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
			const legacy = table.map((r) => { try { return gameOfReport(r); } catch { return null; } }).filter((g): g is LeagueGame => !!g);
			league = leagueOf([...buildLeague(got).games, ...legacy]);
		} catch { league = null; }
	}
	$: if (ready && $role === 'admin' && !leagueAsked) void loadLeague();
	$: record = heroMatchups(league, heroId);
	$: localHero = league?.heroes.find((x) => x.hero === heroId) ?? null;

	let heroId = 'wasp';
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
	$: if (ready && $role === 'admin' && heroId !== loadedFor) void load(heroId);
	function sync() { try { const q = new URL(location.href); q.searchParams.set('hero', heroId); q.searchParams.set('tab', tab); history.replaceState(history.state, '', q); } catch { /* ignore */ } }
	$: if (ready) { heroId; tab; sync(); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		const h = q.get('hero');
		if (h && HEROES_ALPHA.some((x) => x.id === h)) heroId = h;
		if (q.get('tab') === 'openings') tab = 'openings';
		ready = true;
	});
</script>

<svelte:head><title>GoA2 · Heroes</title></svelte:head>

{#if $role !== 'admin'}
	<div class="hp tide">
		<section class="panel lock"><h1 class="t-h1">Heroes</h1><p class="t-body c-muted">Coming soon.</p><a class="btn btn-ghost" href={base + '/'}><Icon name="back" /> Back</a></section>
	</div>
{:else if ready}
	<HeroPage {heroId} bind:tab {openings} {guide} {status} {record} local={localHero} gm onHero={(id) => (heroId = id)} />
{/if}

<style>
	.hp { position: fixed; inset: 0; color: var(--ink); }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 92vw); display: flex; flex-direction: column; gap: 12px; }
	.lock h1 { margin: 0; color: var(--brass-hi); }
	.lock .btn { align-self: flex-start; }
</style>
