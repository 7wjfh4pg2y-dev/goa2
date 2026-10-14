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
	<HeroPage {heroId} bind:tab {openings} {guide} {status} gm onHero={(id) => (heroId = id)} />
{/if}

<style>
	.hp { position: fixed; inset: 0; color: var(--ink); }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 92vw); display: flex; flex-direction: column; gap: 12px; }
	.lock h1 { margin: 0; color: var(--brass-hi); }
	.lock .btn { align-self: flex-start; }
</style>
