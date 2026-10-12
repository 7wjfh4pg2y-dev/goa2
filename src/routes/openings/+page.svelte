<script lang="ts">
	// Openings (work in progress): linked from the GM tools only until it is built; it then moves to
	// Learn to play beside the Tutorial.
	import { base } from '$app/paths';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';
</script>

<svelte:head><title>GoA2 · Openings</title></svelte:head>

<div class="op tide">
	<section class="panel box">
		<span class="t-label">Learn to play</span>
		<h1 class="t-h1">Openings</h1>
		{#if $role === 'admin'}
			<p class="t-body">Work in progress. This will be the first rounds of a game, hero by hero: where to go, what to play and why.</p>
			<p class="t-body c-muted">It shows up here, in the GM tools, until it's ready. Then it moves to Learn to play, next to the Tutorial.</p>
		{:else}
			<p class="t-body c-muted">Coming soon.</p>
		{/if}
		<a class="btn btn-ghost" href={base + '/'}><Icon name="back" /> Back</a>
	</section>
</div>

<style>
	.op { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; color: var(--ink); }
	.box { width: min(520px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 24px 26px; }
	.box h1 { margin: 0 0 4px; color: var(--brass-hi); }
	.box p { margin: 0; }
	.box .btn { align-self: flex-start; margin-top: 6px; }
</style>
