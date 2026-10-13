<script lang="ts">
	// Heroes (work in progress; GMs only until it's built, then it moves to Learn to play): one page per hero with
	// stats, a guide, builds and openings. For now three MOCK-UPS of that page to choose from (?mock=a|b|c, ?hero=id),
	// on real art and cards with sample numbers.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';
	import { HEROES_ALPHA } from '$lib/heroes';
	import { heroSample } from '$lib/heropage/sample';
	import MockA from '$lib/heropage/MockA.svelte';
	import MockB from '$lib/heropage/MockB.svelte';
	import MockC from '$lib/heropage/MockC.svelte';

	type Mock = 'a' | 'b' | 'c';
	const MOCKS: [Mock, string][] = [['a', 'A · Splash'], ['b', 'B · Stats site'], ['c', 'C · Field guide']];
	let mock: Mock = 'a';
	let heroId = 'wasp';
	let ready = false;
	$: s = heroSample(heroId);
	function sync() { try { const q = new URL(location.href); q.searchParams.set('mock', mock); q.searchParams.set('hero', heroId); history.replaceState(history.state, '', q); } catch { /* ignore */ } }
	$: if (ready) { mock; heroId; sync(); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		const m = q.get('mock');
		if (m === 'a' || m === 'b' || m === 'c') mock = m;
		const h = q.get('hero');
		if (h && HEROES_ALPHA.some((x) => x.id === h)) heroId = h;
		ready = true;
	});
</script>

<svelte:head><title>GoA2 · Heroes</title></svelte:head>

<div class="hp tide">
	{#if $role !== 'admin'}
		<section class="panel lock"><h1 class="t-h1">Heroes</h1><p class="t-body c-muted">Coming soon.</p><a class="btn btn-ghost" href={base + '/'}><Icon name="back" /> Back</a></section>
	{:else}
		<header class="mbar">
			<a class="btn btn-ghost btn-sm" href={base + '/'} aria-label="Home"><Icon name="back" /></a>
			<span class="t-label">Heroes · mock-ups</span>
			<span class="seg">{#each MOCKS as [k, l] (k)}<button class:on={mock === k} on:click={() => (mock = k)}>{l}</button>{/each}</span>
			<label class="pick">Hero
				<select bind:value={heroId}>{#each HEROES_ALPHA as h (h.id)}<option value={h.id}>{h.name}</option>{/each}</select>
			</label>
		</header>
		<main class="stage">
			{#if ready}
				{#key mock}
					{#if mock === 'a'}<MockA {s} />{:else if mock === 'b'}<MockB {s} />{:else}<MockC {s} onHero={(id) => (heroId = id)} />{/if}
				{/key}
			{/if}
		</main>
	{/if}
</div>

<style>
	.hp { position: fixed; inset: 0; color: var(--ink); }
	.mbar { position: absolute; left: 0; right: 0; top: 0; height: 52px; z-index: 5; display: flex; align-items: center; gap: 14px; padding: 0 14px; background: rgba(3, 10, 20, 0.92); border-bottom: 1px solid var(--brass-line); }
	.mbar .t-label { color: var(--brass-hi); }
	.seg { display: flex; gap: 4px; margin-left: auto; padding: 3px; border-radius: 10px; border: 1px solid var(--hair); }
	.seg button { padding: 5px 12px; border-radius: 8px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; }
	.seg button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.pick { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-3); }
	select { padding: 5px 28px 5px 10px; border-radius: 8px; border: 1px solid var(--hair); background-color: rgba(4, 14, 26, 0.8); color: var(--ink); font: inherit; font-size: 14px; }
	select option { color: #0b1220; }
	.stage { position: absolute; left: 0; right: 0; top: 52px; bottom: 0; overflow: hidden; }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 92vw); display: flex; flex-direction: column; gap: 12px; }
	.lock h1 { margin: 0; color: var(--brass-hi); }
	.lock .btn { align-self: flex-start; }
</style>
