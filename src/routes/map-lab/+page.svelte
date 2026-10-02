<script lang="ts">
	// Map lab: the board on its own, to judge a new look before it goes into the game.
	// No game, no network — sample pieces only. Options can be preset in the address:
	// ?look=classic|island &team=orange|blue &pieces=0 &zone=Center &fx=0 &map=__editor
	import { onMount } from 'svelte';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import { availableMaps, editorMap, type GameMap, type MapChoice } from '$lib/maps';
	import { LANE } from '$lib/battle';
	import { throneHex } from '$lib/match';
	import { heroLogo, heroById } from '$lib/heroes';
	import { placeName } from '$lib/teams';

	let board: BoardCanvas;
	let maps: MapChoice[] = [];
	let mapId = '';
	let look: 'classic' | 'island' = 'island';
	let team: 'orange' | 'blue' = 'blue';
	let showPieces = true;
	let zone: string = 'Center';
	let still = false;
	let effects = true;
	let ready = false;

	$: map = (maps.find((m) => m.id === mapId)?.data ?? {}) as GameMap;
	$: thrones = (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(map, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex);

	type P = { id: string; hex: string; team: string; role?: string; hero?: string; sym?: string; label?: string; color?: string; token?: string; name?: string };
	let pieces: P[] = [];
	function sample(m: GameMap): P[] {
		const out: P[] = (m.battleZone ?? []).map((b) => ({ id: `m_${b.hex}`, hex: b.hex, team: b.team, role: b.kind, name: `${b.kind} minion` }));
		const cells = m.cells ?? {};
		const of = (t: string) => Object.keys(cells).filter((k) => cells[k] === t).sort();
		const hero = (id: string, hex: string | undefined, tm: string, color: string) => {
			if (hex) out.push({ id: `h_${id}`, hex, team: tm, hero: id, sym: heroLogo(id), label: heroById(id)?.name?.[0] ?? '?', color, name: heroById(id)?.name });
		};
		const ob = of('baseOrange'), bb = of('baseBlue'), mid = of('middle'), fo = of('forest'), be = of('beach');
		hero('arien', ob[2], 'orange', '#dc2626');
		hero('wasp', mid[Math.floor(mid.length * 0.3)], 'orange', '#eab308');
		hero('min', fo[Math.floor(fo.length * 0.2)], 'orange', '#16a34a');
		hero('brogan', bb[3], 'blue', '#06b6d4');
		hero('sabina', mid[Math.floor(mid.length * 0.7)], 'blue', '#a855f7');
		hero('wuk', be[Math.floor(be.length * 0.6)], 'blue', '#f8fafc');
		const tok = (i: number, hex: string | undefined, token: string, tm: string) => { if (hex) out.push({ id: `t_${i}`, hex, team: tm, token, name: token.replace('token_', '') }); };
		tok(1, be[Math.floor(be.length * 0.25)], 'token_tree', 'blue');
		tok(2, mid[Math.floor(mid.length * 0.5)], 'token_rock', 'orange');
		tok(3, fo[Math.floor(fo.length * 0.75)], 'token_zombie', 'blue');
		return out;
	}
	$: if (ready) pieces = sample(map);
	const move = (id: string, hex: string) => { pieces = pieces.map((p) => (p.id === id ? { ...p, hex } : p)); };

	onMount(() => {
		maps = availableMaps();
		const work = editorMap(); // whatever is open in the map editor right now
		if (work?.cells && Object.keys(work.cells).length) maps = [...maps, { id: '__editor', label: 'Editor (working map)', data: work }];
		mapId = maps[0]?.id ?? '';
		const q = new URLSearchParams(location.search);
		if (q.get('look') === 'classic') look = 'classic';
		if (q.get('team') === 'orange') team = 'orange';
		if (q.get('pieces') === '0') showPieces = false;
		if (q.get('still') === '1') still = true;
		if (q.get('fx') === '0') effects = false;
		if (q.has('zone')) zone = q.get('zone') ?? '';
		if (q.get('map') && maps.some((m) => m.id === q.get('map'))) mapId = q.get('map')!;
		ready = true;
	});
</script>

<svelte:head><title>GoA2 · Map lab</title></svelte:head>

<div class="lab">
	{#if ready}
		<BoardCanvas bind:this={board} {map} {look} rotation={team === 'orange' ? 180 : 0} pieces={showPieces ? pieces : []} {thrones}
			glowZone={zone || null} seaStill={still} {effects} onMovePiece={move} />
	{/if}
	<div class="bar">
		<b>Map lab</b>
		<span class="seg">
			<button class:on={look === 'island'} on:click={() => (look = 'island')}>Island</button>
			<button class:on={look === 'classic'} on:click={() => (look = 'classic')}>Classic</button>
		</span>
		<span class="seg">
			<button class:on={team === 'blue'} on:click={() => (team = 'blue')}>View as Titans</button>
			<button class:on={team === 'orange'} on:click={() => (team = 'orange')}>View as Atlanteans</button>
		</span>
		<label>Battle zone
			<select bind:value={zone}>
				<option value="">none</option>
				{#each LANE as z}<option value={z}>{placeName(z)}</option>{/each}
			</select>
		</label>
		{#if maps.length > 1}
			<label>Map <select bind:value={mapId}>{#each maps as m}<option value={m.id}>{m.label}</option>{/each}</select></label>
		{/if}
		<label class="chk"><input type="checkbox" bind:checked={showPieces} /> Pieces</label>
		<label class="chk"><input type="checkbox" bind:checked={effects} /> Effects</label>
		<span class="seg">
			<button on:click={() => board?.zoomBtn(1.25)}>+</button>
			<button on:click={() => board?.zoomBtn(0.8)}>−</button>
			<button on:click={() => board?.rotateBy(45)}>⟳</button>
			<button on:click={() => board?.reset()}>Reset</button>
		</span>
	</div>
</div>

<style>
	.lab { position: fixed; inset: 0; overflow: hidden; color: #f1f5f9; }
	.bar { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px;
		max-width: calc(100vw - 20px); padding: 8px 14px; border-radius: 14px; background: rgba(9, 14, 24, .82); border: 1px solid rgba(255, 255, 255, .14);
		box-shadow: 0 10px 30px rgba(0, 0, 0, .45); font-size: .86rem; backdrop-filter: blur(8px); }
	.bar b { letter-spacing: .04em; color: #ffe7a8; }
	.seg { display: inline-flex; border-radius: 9px; overflow: hidden; border: 1px solid rgba(255, 255, 255, .16); }
	.seg button { background: transparent; color: #cbd5e1; border: 0; padding: 5px 11px; font: inherit; cursor: pointer; }
	.seg button + button { border-left: 1px solid rgba(255, 255, 255, .12); }
	.seg button.on { background: linear-gradient(120deg, #ef7d22, #2f7fe6); color: #fff; }
	.seg button:hover:not(.on) { background: rgba(255, 255, 255, .1); }
	label { display: inline-flex; align-items: center; gap: 6px; color: #cbd5e1; }
	select { background: rgba(255, 255, 255, .08); color: #f1f5f9; border: 1px solid rgba(255, 255, 255, .16); border-radius: 8px; padding: 3px 26px 3px 8px; font: inherit; }
	select option { color: #0b1220; }
	.chk input { accent-color: #ef7d22; }
</style>
