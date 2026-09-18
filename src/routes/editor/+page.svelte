<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { role } from '$lib/role';
	import boardUrl from '$lib/images/board/forgotten_island.webp';

	const BOARD = 2000;
	const SQRT3 = Math.sqrt(3);

	const PALETTE = [
		{ t: 'baseOrange', label: 'Orange base', c: '#ea580c' },
		{ t: 'baseBlue', label: 'Blue base', c: '#2563eb' },
		{ t: 'baseOrangeSpawn', label: 'Orange throne', c: '#c2410c' },
		{ t: 'baseBlueSpawn', label: 'Blue throne', c: '#1e40af' },
		{ t: 'forest', label: 'Forest', c: '#16a34a' },
		{ t: 'beach', label: 'Beach', c: '#eab308' },
		{ t: 'middle', label: 'Middle', c: '#9ca3af' },
		{ t: 'terrain', label: 'Terrain', c: '#111827' },
		{ t: 'spawnOrange', label: 'Orange spawn', c: '#ef4444' },
		{ t: 'spawnBlue', label: 'Blue spawn', c: '#a855f7' }
	] as const;
	type HexType = (typeof PALETTE)[number]['t'];
	const colorOf = (t: HexType) => PALETTE.find((p) => p.t === t)?.c ?? '#fff';

	const tileSprites = import.meta.glob('../../lib/images/tiles/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const minionSprites = import.meta.glob('../../lib/images/minions/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	type Minion = 'ranged' | 'melee' | 'heavy';
	function spriteFor(id: string, t: HexType): string | undefined {
		if (t === 'spawnOrange') return minionSprites[`../../lib/images/minions/orange_${meta[id]?.m ?? 'melee'}.png`];
		if (t === 'spawnBlue') return minionSprites[`../../lib/images/minions/blue_${meta[id]?.m ?? 'melee'}.png`];
		return tileSprites[`../../lib/images/tiles/${t}.png`];
	}
	const isSpawn = (t?: HexType | 'erase') => t === 'spawnOrange' || t === 'spawnBlue';
	const isThrone = (t?: HexType) => t === 'baseOrangeSpawn' || t === 'baseBlueSpawn';
	const baseTileFor = (t: HexType) => (t === 'baseOrangeSpawn' ? 'baseOrange' : 'baseBlue');

	const ZONE_TYPES: HexType[] = ['forest', 'beach', 'middle', 'terrain', 'baseOrange', 'baseBlue'];
	const ODDR = [
		[[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]],
		[[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]]
	];
	function zoneOf(id: string, src: Record<string, HexType>): HexType {
		const [c, r] = id.split('_').map(Number);
		const counts: Record<string, number> = {};
		for (const [dc, dr] of ODDR[r & 1]) {
			const n = src[`${c + dc}_${r + dr}`];
			if (n && ZONE_TYPES.includes(n)) counts[n] = (counts[n] ?? 0) + 1;
		}
		let best: HexType = 'middle', bc = 0;
		for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k as HexType; }
		return best;
	}
	const zoneTile = (z: HexType) => tileSprites[`../../lib/images/tiles/${z}.png`];

	let size = 62, originX = 150, originY = 150, rot = 0, cols = 22, rows = 22;
	let cells: Record<string, HexType> = {};
	let meta: Record<string, { m: Minion; dir: number; start?: boolean }> = {};
	let name = 'forgotten_island';
	let selected: HexType | 'erase' = 'beach';
	let minionKind: Minion = 'melee';
	let tool: 'paint' | 'rotate' | 'battle' = 'paint';

	let showImage = true, showEmpty = true, tileMode = true, painting = false, loaded = false;

	// map-only zoom/pan
	let wrapEl: HTMLDivElement;
	let scale = 1, panX = 0, panY = 0, panMode = false, panning = false, pstart = { x: 0, y: 0 };
	function clampPan() {
		if (!wrapEl) return;
		const W = wrapEl.clientWidth, mn = W * (1 - scale);
		if (scale <= 1) { panX = 0; panY = 0; } else { panX = Math.min(0, Math.max(mn, panX)); panY = Math.min(0, Math.max(mn, panY)); }
	}
	function zoomAt(ns: number, mx: number, my: number) {
		ns = Math.min(6, Math.max(1, ns));
		panX = mx - (mx - panX) * (ns / scale); panY = my - (my - panY) * (ns / scale);
		scale = ns; clampPan();
	}
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const r = wrapEl.getBoundingClientRect();
		if (e.ctrlKey) zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
		else { panX -= e.deltaX; panY -= e.deltaY; clampPan(); }
	}
	function zoomBtn(f: number) { const W = wrapEl?.clientWidth ?? 0; zoomAt(scale * f, W / 2, W / 2); }
	function resetView() { scale = 1; panX = 0; panY = 0; }
	function panDown(e: PointerEvent) {
		if (!(panMode || e.button === 1)) return;
		panning = true; pstart = { x: e.clientX - panX, y: e.clientY - panY }; wrapEl.setPointerCapture(e.pointerId);
	}
	function panMove(e: PointerEvent) { if (!panning) return; panX = e.clientX - pstart.x; panY = e.clientY - pstart.y; clampPan(); }
	function panUp(e: PointerEvent) { panning = false; try { wrapEl.releasePointerCapture(e.pointerId); } catch {} }

	function rotate(x: number, y: number, deg: number) {
		const a = (deg * Math.PI) / 180, dx = x - BOARD / 2, dy = y - BOARD / 2;
		return [BOARD / 2 + dx * Math.cos(a) - dy * Math.sin(a), BOARD / 2 + dx * Math.sin(a) + dy * Math.cos(a)];
	}
	function centerOf(c: number, r: number, sz: number, ox: number, oy: number, rotation: number): [number, number] {
		const x = ox + sz * SQRT3 * (c + 0.5 * (r & 1)), y = oy + sz * 1.5 * r;
		return rotate(x, y, rotation) as [number, number];
	}
	function poly(cx: number, cy: number, sz: number, rotation: number) {
		const p = [];
		for (let i = 0; i < 6; i++) { const ang = (Math.PI / 180) * (60 * i - 90 + rotation); p.push(`${(cx + sz * Math.cos(ang)).toFixed(1)},${(cy + sz * Math.sin(ang)).toFixed(1)}`); }
		return p.join(' ');
	}

	$: erot = tileMode ? 0 : rot;
	$: grid = (() => {
		const arr: { id: string; cx: number; cy: number }[] = [];
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const [cx, cy] = centerOf(c, r, size, originX, originY, erot); arr.push({ id: `${c}_${r}`, cx, cy }); }
		return arr;
	})();
	$: paintedCount = Object.keys(cells).length;
	$: zones = (() => { const z: Record<string, HexType> = {}; for (const id in cells) if (isSpawn(cells[id])) z[id] = zoneOf(id, cells); return z; })();

	// the starting minion wave = spawn hexes flagged as battle-zone
	$: battleZone = (() => {
		const bz: Array<{ hex: string; team: 'orange' | 'blue'; kind: Minion }> = [];
		for (const id in cells) {
			if (isSpawn(cells[id]) && meta[id]?.start)
				bz.push({ hex: id, team: cells[id] === 'spawnOrange' ? 'orange' : 'blue', kind: meta[id].m });
		}
		return bz;
	})();
	$: bzCount = (team: 'orange' | 'blue', kind: Minion) => battleZone.filter((b) => b.team === team && b.kind === kind).length;

	function paint(id: string) {
		if (selected === 'erase') { if (cells[id]) { delete cells[id]; delete meta[id]; cells = cells; meta = meta; } }
		else {
			cells[id] = selected;
			if (isSpawn(selected)) meta[id] = { m: minionKind, dir: meta[id]?.dir ?? 0, start: meta[id]?.start };
			else if (meta[id]) delete meta[id];
			cells = cells; meta = meta;
		}
	}
	function rotateHex(id: string, back = false) {
		if (!isSpawn(cells[id])) return;
		const cur = meta[id] ?? { m: 'melee' as Minion, dir: 0 };
		meta[id] = { ...cur, dir: (cur.dir + (back ? 5 : 1)) % 6 }; meta = meta;
	}
	function toggleBattle(id: string) {
		if (!isSpawn(cells[id])) return;
		const cur = meta[id] ?? { m: 'melee' as Minion, dir: 0 };
		meta[id] = { ...cur, start: !cur.start }; meta = meta;
	}
	function hexDown(e: PointerEvent, id: string) {
		e.preventDefault();
		if (tool === 'rotate') rotateHex(id, e.shiftKey);
		else if (tool === 'battle') toggleBattle(id);
		else { painting = true; paint(id); }
	}
	const hexEnter = (id: string) => { if (tool === 'paint' && painting) paint(id); };

	const WORK = 'goa2-map-work-v1', MAPS = 'goa2-maps-v1';
	let saved: Record<string, unknown> = {};
	function snapshot() { return { name, grid: { size, originX, originY, rot, cols, rows }, cells, meta, battleZone }; }
	function applyMap(m: Record<string, unknown>) {
		cells = (m.cells as typeof cells) ?? {}; meta = (m.meta as typeof meta) ?? {};
		const g = (m.grid as Record<string, number>) ?? {};
		size = g.size ?? size; originX = g.originX ?? originX; originY = g.originY ?? originY;
		rot = g.rot ?? rot; cols = g.cols ?? cols; rows = g.rows ?? rows;
		name = (m.name as string) ?? name;
	}
	function saveMap() { saved = { ...saved, [name]: snapshot() }; try { localStorage.setItem(MAPS, JSON.stringify(saved)); } catch {} }
	function loadMap(n: string) { if (saved[n]) applyMap(saved[n] as Record<string, unknown>); }
	function deleteMap(n: string) { const s = { ...saved }; delete s[n]; saved = s; try { localStorage.setItem(MAPS, JSON.stringify(saved)); } catch {} }
	function newMap() { if (confirm('Start a new blank map?')) { cells = {}; meta = {}; name = 'untitled'; } }
	function clearPaint() { if (confirm('Clear all painted hexes on this map?')) { cells = {}; meta = {}; } }

	$: workJson = JSON.stringify({ name, grid: { size, originX, originY, rot, cols, rows }, cells, meta, battleZone });
	let savedAt = 0, saveError = false;
	$: if (loaded && workJson) { try { localStorage.setItem(WORK, workJson); savedAt = Date.now(); saveError = false; } catch { saveError = true; } }
	$: savedClock = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

	onMount(() => {
		try { const s = localStorage.getItem(WORK); if (s) applyMap(JSON.parse(s)); } catch {}
		try { const m = localStorage.getItem(MAPS); if (m) saved = JSON.parse(m); } catch {}
		loaded = true;
		window.addEventListener('pointerup', () => (painting = false));
		wrapEl?.addEventListener('wheel', onWheel, { passive: false });
	});
	onDestroy(() => wrapEl?.removeEventListener('wheel', onWheel));

	let copied = false;
	async function exportMap() { try { await navigator.clipboard.writeText(JSON.stringify(snapshot())); copied = true; setTimeout(() => (copied = false), 1500); } catch {} }
</script>

<svelte:head><title>Map Editor — GoA2</title></svelte:head>

{#if $role !== 'admin'}
	<div class="locked">
		<h2>Map editor</h2>
		<p>This is a GM-only tool. Unlock Admin from the menu first.</p>
		<a class="back" href={base + '/'}>← Back</a>
	</div>
{:else}
<div class="page">
	<div class="board-wrap" bind:this={wrapEl} class:noimg={!showImage} class:panmode={panMode}
		role="application" aria-label="Map editor canvas"
		on:pointerdown={panDown} on:pointermove={panMove} on:pointerup={panUp} on:pointercancel={panUp}>
		<div class="viewport" style="transform: translate({panX}px,{panY}px) scale({scale});">
		{#if showImage && !tileMode}<img src={boardUrl} alt="tracing guide" draggable="false" />{/if}
		<svg class="overlay" class:nopick={panMode} viewBox="0 0 {BOARD} {BOARD}" preserveAspectRatio="xMidYMid meet">
			{#each grid as h (h.id)}
				{#if cells[h.id]}
					{#if tileMode}
						{#if isSpawn(cells[h.id]) || isThrone(cells[h.id])}
							<image href={zoneTile(isSpawn(cells[h.id]) ? (zones[h.id] ?? 'middle') : baseTileFor(cells[h.id]))} x={h.cx - SQRT3 * size * 0.53} y={h.cy - size * 1.06}
								width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none" style="pointer-events:none" />
							<image href={spriteFor(h.id, cells[h.id])} x={h.cx - SQRT3 * size * 1.06 * 0.36} y={h.cy - SQRT3 * size * 1.06 * 0.36}
								width={SQRT3 * size * 1.06 * 0.72} height={SQRT3 * size * 1.06 * 0.72} preserveAspectRatio="xMidYMid meet" style="pointer-events:none"
								transform={isSpawn(cells[h.id]) && meta[h.id]?.dir ? `rotate(${meta[h.id].dir * 60} ${h.cx} ${h.cy})` : undefined} />
						{:else}
							<image href={spriteFor(h.id, cells[h.id])} x={h.cx - SQRT3 * size * 0.53} y={h.cy - size * 1.06}
								width={SQRT3 * size * 1.06} height={size * 2 * 1.06} preserveAspectRatio="none" style="pointer-events:none" />
						{/if}
						{#if meta[h.id]?.start}
							<circle cx={h.cx} cy={h.cy} r={size * 0.92} fill="none" stroke="#fde047" stroke-width="5" stroke-dasharray="{size * 0.5} {size * 0.3}" style="pointer-events:none" />
						{/if}
						<polygon points={poly(h.cx, h.cy, size, erot)} class="cell hit" class:rotatable={tool === 'rotate' && isSpawn(cells[h.id])} class:battlable={tool === 'battle' && isSpawn(cells[h.id])} role="button" tabindex="-1" aria-label="hex"
							on:pointerdown={(e) => hexDown(e, h.id)} on:pointerenter={() => hexEnter(h.id)} />
					{:else}
						<polygon points={poly(h.cx, h.cy, size, erot)} style="fill:{colorOf(cells[h.id])}" class="cell painted" role="button" tabindex="-1" aria-label="hex"
							on:pointerdown={(e) => hexDown(e, h.id)} on:pointerenter={() => hexEnter(h.id)} />
					{/if}
				{:else if showEmpty}
					<polygon points={poly(h.cx, h.cy, size, erot)} class="cell empty" role="button" tabindex="-1" aria-label="hex"
						on:pointerdown={(e) => hexDown(e, h.id)} on:pointerenter={() => hexEnter(h.id)} />
				{/if}
			{/each}
		</svg>
		</div>
		<div class="zoomctl">
			<button on:click={() => zoomBtn(1 / 1.2)} title="Zoom out">−</button>
			<button on:click={() => zoomBtn(1.2)} title="Zoom in">+</button>
			<button class:on={panMode} on:click={() => (panMode = !panMode)} title="Pan mode">✋</button>
			<button on:click={resetView} title="Reset view">⟲</button>
		</div>
	</div>

	<div class="panel">
		<div class="phead"><h3>Map editor</h3><a class="back" href={base + '/'}>← Exit</a></div>
		<p class="sub">Paint hexes, then set spawn minion types and mark the starting battle zone.</p>

		<div class="palette">
			{#each PALETTE as p}
				<button class="sw" class:on={selected === p.t} on:click={() => (selected = p.t)}><span class="dot" style="background:{p.c}"></span>{p.label}</button>
			{/each}
			<button class="sw erase" class:on={selected === 'erase'} on:click={() => (selected = 'erase')}>⌫ Erase</button>
		</div>

		{#if isSpawn(selected)}
			<div class="submenu">
				<span class="lbl">Minion:</span>
				{#each ['ranged', 'melee', 'heavy'] as mk}
					<button class="mk" class:on={minionKind === mk} on:click={() => (minionKind = mk as Minion)}>{mk}</button>
				{/each}
			</div>
		{/if}

		<div class="row tools">
			<button class="tg" class:on={tool === 'paint'} on:click={() => (tool = 'paint')}>🖌 Paint</button>
			<button class="tg" class:on={tool === 'rotate'} on:click={() => (tool = 'rotate')}>🔄 Facing</button>
			<button class="tg" class:on={tool === 'battle'} on:click={() => (tool = 'battle')}>⚔ Battle zone</button>
		</div>
		{#if tool === 'rotate'}<p class="tip">Click a spawn hex to turn it 60° (Shift-click reverses).</p>{/if}
		{#if tool === 'battle'}<p class="tip">Click spawn hexes to add/remove them from the starting wave (gold ring). Each gets a minion of its painted type at game start.</p>{/if}

		<div class="bz">
			<b>Starting wave</b>
			<div class="bzrow"><span class="o">Orange</span> {bzCount('orange', 'melee')}M · {bzCount('orange', 'ranged')}R · {bzCount('orange', 'heavy')}H</div>
			<div class="bzrow"><span class="b">Blue</span> {bzCount('blue', 'melee')}M · {bzCount('blue', 'ranged')}R · {bzCount('blue', 'heavy')}H</div>
			<p class="tip">Rulebook default per team: 4 Melee · 1 Ranged · 1 Heavy.</p>
		</div>

		<div class="row">
			<label class="ck"><input type="checkbox" bind:checked={tileMode} /> 3D tiles</label>
			<label class="ck"><input type="checkbox" bind:checked={showImage} disabled={tileMode} /> tracing</label>
			<label class="ck"><input type="checkbox" bind:checked={showEmpty} /> empty hexes</label>
		</div>

		<details>
			<summary>Grid geometry</summary>
			<label class="sl"><span>Hex size<b>{size}</b></span><input type="range" min="30" max="110" step="0.5" bind:value={size} /></label>
			<label class="sl"><span>Origin X<b>{originX}</b></span><input type="range" min="0" max="500" step="1" bind:value={originX} /></label>
			<label class="sl"><span>Origin Y<b>{originY}</b></span><input type="range" min="0" max="500" step="1" bind:value={originY} /></label>
			<label class="sl"><span>Rotation°<b>{rot}</b></span><input type="range" min="-15" max="15" step="0.1" bind:value={rot} /></label>
			<label class="sl"><span>Columns<b>{cols}</b></span><input type="range" min="6" max="34" step="1" bind:value={cols} /></label>
			<label class="sl"><span>Rows<b>{rows}</b></span><input type="range" min="6" max="34" step="1" bind:value={rows} /></label>
		</details>

		<div class="maps">
			<label>Map name <input class="txt" bind:value={name} /></label>
			<div class="row">
				<button on:click={saveMap}>💾 Save</button>
				<button class="g" on:click={newMap}>New</button>
				<button class="danger" on:click={clearPaint}>Clear</button>
			</div>
			{#if Object.keys(saved).length}
				<div class="saved">
					{#each Object.keys(saved) as n}
						<div class="savedrow"><button class="link" on:click={() => loadMap(n)}>{n}</button><button class="x" on:click={() => deleteMap(n)}>✕</button></div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="row"><button on:click={exportMap} disabled={!paintedCount}>{copied ? 'Copied!' : 'Export map JSON'}</button></div>
		<p class="count"><b>{paintedCount}</b> hexes · <b>{battleZone.length}</b> in wave
			{#if saveError}<span class="savestat err">⚠ not saved</span>{:else if savedClock}<span class="savestat ok">Saved ✓ {savedClock}</span>{/if}
		</p>
	</div>
</div>
{/if}

<style>
	.locked { max-width: 480px; margin: 120px auto; text-align: center; color: #e5e7eb; }
	.locked .back, .phead .back { color: #93c5fd; text-decoration: none; font-size: 13px; }
	.page { max-width: 1200px; margin: 0 auto; padding: 24px 16px 32px; display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; color: #e5e7eb; }
	.board-wrap { position: relative; flex: 1 1 520px; max-width: 760px; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,.5); background: #0b1220; }
	.board-wrap.panmode { cursor: grab; } .board-wrap.panmode:active { cursor: grabbing; }
	.viewport { position: absolute; inset: 0; transform-origin: 0 0; }
	.board-wrap img { width: 100%; height: 100%; display: block; user-select: none; opacity: .85; }
	.overlay { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; }
	.overlay.nopick { pointer-events: none; }
	.zoomctl { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 4px; z-index: 5; }
	.zoomctl button { width: 34px; flex: none; padding: 6px 0; background: rgba(17,24,39,.9); border: 1px solid #374151; border-radius: 6px; color: #e5e7eb; font-size: 15px; cursor: pointer; }
	.zoomctl button.on { background: #2563eb; }
	.cell { stroke-width: 2; cursor: pointer; }
	.cell.painted { fill-opacity: .72; stroke: rgba(6,10,18,.75); stroke-width: 4; }
	.cell.painted:hover { fill-opacity: .9; }
	.cell.empty { fill: rgba(255,255,255,.04); stroke: rgba(148,163,184,.35); }
	.cell.empty:hover { fill: rgba(56,189,248,.35); }
	.cell.hit { fill: transparent; stroke: rgba(6,10,18,.7); stroke-width: 4; stroke-linejoin: round; }
	.cell.hit:hover { fill: rgba(56,189,248,.28); }
	.cell.hit.rotatable:hover { fill: rgba(250,204,21,.32); cursor: alias; }
	.cell.hit.battlable:hover { fill: rgba(250,204,21,.4); cursor: copy; }
	.panel { flex: 1 1 320px; max-width: 400px; background: #111827; border: 1px solid #374151; border-radius: 12px; padding: 16px; height: fit-content; }
	.phead { display: flex; justify-content: space-between; align-items: baseline; }
	.panel h3 { margin: 0 0 4px; } .sub { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
	.palette { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
	.sw { display: flex; align-items: center; gap: 7px; font-size: 12.5px; padding: 7px 9px; border-radius: 8px; background: #1f2937; color: #e5e7eb; border: 2px solid transparent; cursor: pointer; text-align: left; }
	.sw.on { border-color: #fff; }
	.sw .dot { width: 14px; height: 14px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,.3); }
	.sw.erase { grid-column: span 2; justify-content: center; }
	.submenu { display: flex; align-items: center; gap: 6px; margin: 2px 0 10px; }
	.submenu .lbl { font-size: 12px; color: #9ca3af; }
	.mk { flex: 1; font-size: 12px; padding: 6px; border-radius: 7px; background: #1f2937; color: #e5e7eb; border: 2px solid transparent; cursor: pointer; text-transform: capitalize; }
	.mk.on { border-color: #fff; }
	.tools .tg { background: #1f2937; border: 2px solid transparent; }
	.tools .tg.on { border-color: #38bdf8; background: #0b3a52; }
	.bz { border: 1px solid #374151; border-radius: 8px; padding: 8px 10px; margin: 8px 0; font-size: 12.5px; }
	.bz b { font-size: 13px; }
	.bzrow { margin-top: 4px; } .bzrow .o { color: #f2985a; font-weight: 700; } .bzrow .b { color: #6ea8f0; font-weight: 700; }
	.row { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
	.ck { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
	.tip { font-size: 11.5px; color: #93c5fd; margin: 2px 0 10px; }
	details { margin: 6px 0 12px; } summary { cursor: pointer; font-size: 13px; color: #cbd5e1; }
	label { display: block; font-size: 13px; margin-bottom: 8px; }
	label.sl span { display: flex; justify-content: space-between; margin-bottom: 3px; color: #cbd5e1; } label.sl b { color: #fff; }
	input[type=range] { width: 100%; }
	.txt { width: 100%; margin-top: 4px; background: #1f2937; color: #fff; border: 1px solid #374151; border-radius: 6px; padding: 6px; }
	.maps { border-top: 1px solid #374151; margin-top: 10px; padding-top: 10px; }
	.saved { margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
	.savedrow { display: flex; justify-content: space-between; align-items: center; background: #0b1220; border: 1px solid #1e293b; border-radius: 6px; padding: 2px 4px 2px 8px; }
	.link { background: none; border: none; color: #93c5fd; cursor: pointer; font-size: 13px; padding: 4px 0; }
	.x { background: none; border: none; color: #ef4444; cursor: pointer; }
	button { font-size: 13px; padding: 7px 12px; border-radius: 8px; background: #2563eb; color: #fff; border: none; cursor: pointer; flex: 1; }
	button:disabled { opacity: .4; cursor: default; }
	button.g { background: #374151; } button.danger { background: #7f1d1d; }
	.count { font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 8px; }
	.savestat { font-size: 11px; padding: 1px 7px; border-radius: 9999px; white-space: nowrap; margin-left: auto; }
	.savestat.ok { color: #6ee7b7; background: rgba(16,185,129,.14); border: 1px solid rgba(16,185,129,.35); }
	.savestat.err { color: #fca5a5; background: rgba(239,68,68,.14); border: 1px solid rgba(239,68,68,.4); }
</style>
