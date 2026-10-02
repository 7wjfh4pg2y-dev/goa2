<svelte:options namespace="svg" />
<script lang="ts">
	// Every drawing the board's pieces share, defined once per page (put it inside an svg's <defs>):
	// the minion art and tokens (MinionDefs), the silver shield, and three crests drawn for the pieces that
	// have no painted art — #crest-dragon (Widget's Pyro), #crest-gun (Trinkets' Turret) and #crest-skull (the
	// hidden side of Min's mines; it sits on the owner's colour, so it carries its own dark outline).
	// The crests are plain svg files in ./crests (viewBox -50 -50 100 100, shapes only, no ids).
	import MinionDefs from './MinionDefs.svelte';
	import dragon from './crests/dragon.svg?raw';
	import gun from './crests/gun.svg?raw';
	import skull from './crests/skull.svg?raw';
	const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
	const CRESTS = { dragon: inner(dragon), gun: inner(gun), skull: inner(skull) };
</script>

<MinionDefs />
<linearGradient id="shield-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset=".45" stop-color="#cfd5dc" /><stop offset="1" stop-color="#7d8792" /></linearGradient>
{#each Object.entries(CRESTS) as [name, body]}
	<symbol id="crest-{name}" viewBox="-50 -50 100 100">{@html body}</symbol>
{/each}
