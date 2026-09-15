<script lang="ts">
	import '../app.postcss';
	import { fly } from 'svelte/transition';
	import { Navbar, NavBrand, NavHamburger, NavLi, NavUl } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';

	import logoImage from '$lib/images/goa-logo.png';
	import RoleGate from '$lib/RoleGate.svelte';
	import { role, signOut } from '$lib/role';

	export let data;

	$: activeUrl = $page.url.pathname;
	// Player sees a trimmed nav; null (pre-gate) and admin see the full nav so
	// the prerender crawler can still discover every page.
	$: playerOnly = $role === 'player';

	// Players may only reach the Match Board — redirect anything else there.
	$: if (browser && $role === 'player') {
		const rel = $page.url.pathname.slice(base.length);
		if (rel !== '/table' && rel !== '/table/') {
			goto(`${base}/table`, { replaceState: true });
		}
	}
</script>

<Navbar class="fixed z-50 top-0 border-b bg-dark-800 border-b-dark-600">
	<NavBrand href={playerOnly ? `${base}/table` : `${base}/`}>
		<img src={logoImage} class="h-9 sm:h-12 w-auto" alt="Guards of Atlantis II" />
	</NavBrand>
	<NavHamburger class="text-dark-400 hover:bg-dark-600" />
	<NavUl
		{activeUrl}
		classUl="border-dark-600 bg-dark-800"
		activeClass="hover:text-white hover:bg-dark-700 font-semibold"
		nonActiveClass="hover:text-white hover:bg-dark-700 font-semibold"
	>
		{#if playerOnly}
			<NavLi class="text-dark-400" href="{base}/table">Match Board</NavLi>
		{:else}
			<NavLi class="text-dark-400" href="{base}/">Catalogue</NavLi>
			<NavLi class="text-dark-400" href="{base}/encyclopedia">Encyclopedia</NavLi>
			<NavLi class="text-dark-400" href="{base}/builder">Card Builder</NavLi>
			<NavLi class="text-dark-400" href="{base}/draft">Draft</NavLi>
			<NavLi class="text-dark-400" href="{base}/timer">Timer</NavLi>
			<NavLi class="text-dark-400" href="{base}/table">Match Board</NavLi>
			<NavLi class="text-dark-400" href="{base}/play">Map Editor</NavLi>
		{/if}
		{#if $role !== null}
			<NavLi class="text-dark-400" href="{base}/" on:click={(e) => { e.preventDefault(); signOut(); }}>
				{$role === 'admin' ? 'Sign out (Admin)' : 'Exit'}
			</NavLi>
		{/if}
	</NavUl>
</Navbar>

{#key data.url}
	<div in:fly={{ x: -200, duration: 300, delay: 300 }} out:fly={{ x: 200, duration: 300 }}>
		<slot />
	</div>
{/key}

{#if $role === null}
	<RoleGate />
{/if}
