<script lang="ts">
	// The map editor (GM tools → Map editor), rebuilt 2026-10-23. A map is painted in LAYERS — ground, obstacles, zones,
	// minion spawn points, hero spawn points — over an optional trace image, with live symmetry (paint one half, the other
	// follows with the teams swapped), a check list of everything a playable map needs, and a preview on the real island.
	// The model and every rule live in $lib/mapedit.ts (tested); this page is the tools round it. The working map autosaves
	// to localStorage 'goa2-map-work-v1' and named maps to 'goa2-maps-v1' — both show up in Create game (maps.ts).
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
	import { role as gmRole } from '$lib/role';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import EditorCanvas from '$lib/mapeditor/EditorCanvas.svelte';
	import { SCATTER } from '$lib/board/scatter';
	import { hexCenter, type Pt } from '$lib/board/hexgeo';
	import { throneHex } from '$lib/match';
	import { placeName } from '$lib/teams';
	import type { GameMap } from '$lib/maps';
	import fiPainting from '$lib/images/board/forgotten_island.webp';
	import {
		GROUNDS, GROUND_BY, ZONES, ZONE_BY, blankDoc, fromMap, toMap, paint, brush, floodFill, pick, hexAtPoint, inGrid, twinOf,
		twinDir, symCentre, snapCentre, autoCentre, setSymMode, symmetryReport, symmetryScore, mirrorHalf, validate, zoneStats, minionTotal, autoZones,
		faceEnemy, growGrid, fitGrid, toImage, calibrate, fitTrace, legacyTrace, startingWave,
		type Doc, type Ground, type Paint, type Team, type Role, type SymMode, type Trace
	} from '$lib/mapedit';

	const WORK = 'goa2-map-work-v1', SAVED = 'goa2-maps-v1', TRACE = 'goa2-map-trace-v2';
	const store = {
		get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
		set: (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
		del: (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } }
	};

	// bundled maps (open a copy to edit it)
	const bundledFiles = import.meta.glob('$lib/maps/*.json', { eager: true, import: 'default' }) as Record<string, GameMap>;
	const builtins = Object.entries(bundledFiles).map(([p, m]) => ({ file: p.split('/').pop()!.replace(/\.json$/, ''), name: m.name ?? 'Map', map: m }));
	const builtinNames = builtins.map((b) => b.name);

	// ── the document + history ──
	let doc: Doc = blankDoc();
	let hist: string[] = [], fut: string[] = [];
	const freeze = () => JSON.stringify(doc);
	function push(before: string) { hist = [...hist.slice(-119), before]; fut = []; }
	function act(fn: () => void) { const b = freeze(); fn(); doc = doc; if (freeze() !== b) push(b); }
	function undo() { if (!hist.length) return; fut = [...fut, freeze()]; doc = JSON.parse(hist[hist.length - 1]); hist = hist.slice(0, -1); }
	function redo() { if (!fut.length) return; hist = [...hist, freeze()]; doc = JSON.parse(fut[fut.length - 1]); fut = fut.slice(0, -1); }

	// ── tools ──
	type Layer = 'ground' | 'obstacle' | 'zone' | 'minion' | 'hero' | 'erase';
	type Tool = 'paint' | 'pick' | 'pan' | 'centre' | 'calib' | 'trace';
	let layer: Layer = 'ground';
	let tool: Tool = 'paint';
	let ground: Ground = 'beach';
	let scatterKey = '';
	let zone = 'Center';
	let team: Team = 'orange';
	let mRole: Role = 'melee';
	let eraseKind: 'clear' | 'erase' = 'erase';
	let radius = 0;
	let fill = false;
	let mirror = true;
	/** zones follow the ground after every stroke (new maps), until you paint a zone yourself */
	let autoZ = true;
	let view: 'edit' | 'island' | 'classic' = 'edit';
	let panel: 'check' | 'sym' | 'trace' | 'map' = 'check';
	let showZones = true, showGrid = true, showMarks = true;
	let mapsOpen = false;
	let canvas: EditorCanvas;

	const LAYERS: Array<{ key: Layer; label: string; keyHint: string }> = [
		{ key: 'ground', label: 'Ground', keyHint: 'G' },
		{ key: 'obstacle', label: 'Obstacles', keyHint: 'O' },
		{ key: 'zone', label: 'Zones', keyHint: 'Z' },
		{ key: 'minion', label: 'Minion spawns', keyHint: 'N' },
		{ key: 'hero', label: 'Hero spawns', keyHint: 'H' },
		{ key: 'erase', label: 'Eraser', keyHint: 'E' }
	];
	const ROLES: Role[] = ['melee', 'ranged', 'heavy'];
	const teamLabel = (t: Team) => (t === 'orange' ? 'Atlanteans' : 'Titans');
	const zoneLabel = (z: string) => placeName(z);

	// the facing a new spawn point gets: what that team's spawn points already face, else towards the other end
	function dirFor(t: Team): number {
		const n: Record<number, number> = {};
		for (const h in doc.feat) { const f = doc.feat[h]; if (f.kind === 'minion' && f.team === t) n[f.dir] = (n[f.dir] ?? 0) + 1; }
		let best = t === 'orange' ? 0 : 3, bc = 0;
		for (const k in n) if (n[k] > bc) { bc = n[k]; best = +k; }
		return best;
	}
	$: paintValue = ((): Paint => {
		switch (layer) {
			case 'ground': return { layer: 'ground', ground };
			case 'obstacle': return { layer: 'obstacle', scatter: scatterKey || undefined };
			case 'zone': return { layer: 'zone', zone };
			case 'minion': return { layer: 'minion', team, role: mRole, dir: dirFor(team) };
			case 'hero': return { layer: 'hero', team };
			default: return { layer: eraseKind };
		}
	})();
	$: point = layer === 'minion' || layer === 'hero';
	$: rEff = point ? 0 : radius;
	$: mirrorOn = mirror && doc.sym.mode !== 'none';
	$: footColor = layer === 'erase' ? '#ff8a8a' : layer === 'ground' ? GROUND_BY[ground].color : layer === 'zone' ? ZONE_BY[zone]?.color ?? '#fff' : layer === 'minion' || layer === 'hero' ? (team === 'orange' ? '#ffb878' : '#9ccbff') : '#f4dfa8';

	// ── the pointer ──
	let hover: string | null = null;
	let stroke: { before: string; last: string; changed: boolean } | null = null;
	let traceDrag: { p: Pt; x: number; y: number } | null = null;
	const hexAt = (p: Pt) => hexAtPoint(p.x, p.y, doc.size);
	function region(h: string): string[] {
		if (!inGrid(doc, h)) return [];
		if (fill && !point) return floodFill(doc, h, layer === 'zone' ? 'zone' : 'ground');
		return brush(doc, h, rEff);
	}
	function apply(h: string) {
		if (!stroke) return;
		const hs = region(h);
		if (!hs.length) return;
		paint(doc, hs, paintValue, mirrorOn);
		doc = doc;
		stroke.changed = true;
	}
	function cDown(p: Pt, e: PointerEvent) {
		const h = hexAt(p);
		if (e.altKey || tool === 'pick') { eyedrop(h); return; }
		if (tool === 'centre') { act(() => { const c = snapCentre(p.x, p.y, doc.size, doc.sym.mode); doc.sym.cx = c.x; doc.sym.cy = c.y; }); tool = 'paint'; return; }
		if (tool === 'calib') { calibClick(p, h); return; }
		if (tool === 'trace') { if (trace) traceDrag = { p, x: trace.x, y: trace.y }; return; }
		if (tool !== 'paint' || !inGrid(doc, h)) return;
		// a tap on a spawn point of the team you're placing turns it (Shift: the other way); the twin turns with it
		const f = doc.feat[h];
		if (layer === 'minion' && f?.kind === 'minion' && f.team === team && f.role === mRole) {
			act(() => {
				const step = e.shiftKey ? 5 : 1;
				f.dir = (f.dir + step) % 6;
				const t = mirrorOn ? twinOf(doc, h) : null, tf = t ? doc.feat[t] : null;
				if (tf?.kind === 'minion') tf.dir = twinDir(f.dir, doc.sym.mode);
			});
			return;
		}
		stroke = { before: freeze(), last: h, changed: false };
		apply(h);
		if (fill) cUp();
	}
	function cMove(p: Pt) {
		const h = hexAt(p);
		hover = h;
		if (traceDrag && trace) { trace = { ...trace, x: traceDrag.x + (p.x - traceDrag.p.x), y: traceDrag.y + (p.y - traceDrag.p.y) }; return; }
		if (!stroke || h === stroke.last) return;
		// fill the gap between the last hex and this one, so a quick stroke leaves no holes
		const a = hexCenter(stroke.last, doc.size), steps = Math.ceil(Math.hypot(p.x - a.x, p.y - a.y) / (doc.size * 0.5));
		let prev = stroke.last;
		for (let i = 1; i <= steps; i++) {
			const q = hexAt({ x: a.x + ((p.x - a.x) * i) / steps, y: a.y + ((p.y - a.y) * i) / steps });
			if (q !== prev) { apply(q); prev = q; }
		}
		stroke.last = h;
	}
	function cUp() {
		if (traceDrag) { traceDrag = null; saveTrace(); }
		if (stroke?.changed) {
			if (layer === 'zone') autoZ = false;
			else if (autoZ) { autoZones(doc); doc = doc; }
			push(stroke.before);
		}
		stroke = null;
	}
	function eyedrop(h: string) {
		const want = layer === 'zone' ? 'zone' : layer === 'ground' ? 'ground' : 'feature';
		const pv = pick(doc, h, want);
		tool = 'paint';
		if (!pv) return;
		if (pv.layer === 'ground') { layer = 'ground'; ground = pv.ground; }
		else if (pv.layer === 'zone') { layer = 'zone'; zone = pv.zone; }
		else if (pv.layer === 'obstacle') { layer = 'obstacle'; scatterKey = pv.scatter ?? ''; }
		else if (pv.layer === 'minion') { layer = 'minion'; team = pv.team; mRole = pv.role; }
		else if (pv.layer === 'hero') { layer = 'hero'; team = pv.team; }
	}
	$: footprint = view === 'edit' && tool === 'paint' && hover ? region(hover) : [];
	$: twinPrint = mirrorOn && footprint.length && footprint.length < 400 ? footprint.map((h) => twinOf(doc, h)).filter((h): h is string => !!h && inGrid(doc, h)) : [];
	$: cursor = tool === 'pick' ? 'copy' : tool === 'trace' ? 'move' : tool === 'centre' || tool === 'calib' ? 'crosshair' : 'crosshair';

	// ── what's under the pointer ──
	$: hoverInfo = (() => {
		if (!hover) return '';
		const g = doc.ground[hover];
		if (!g) return `${hover} · empty`;
		const f = doc.feat[hover];
		const what = !f ? '' : f.kind === 'minion' ? ` · ${f.team === 'orange' ? 'Atlantean' : 'Titan'} ${f.role} spawn` : f.kind === 'hero' ? ` · ${f.team === 'orange' ? 'Atlantean' : 'Titan'} hero spawn` : ` · ${f.scatter ? SCATTER.find((s) => s.key === f.scatter)?.label ?? 'obstacle' : 'boulder'}`;
		return `${hover} · ${GROUND_BY[g]?.label ?? g} · ${zoneLabel(doc.zone[hover] ?? '—')}${what}`;
	})();

	// ── checks ──
	let highlight: string[] = [];
	let showDiff = false;
	$: issues = validate(doc, { builtinNames });
	$: stats = zoneStats(doc).filter((s) => s.hexes || ZONE_BY[s.zone]?.lane != null);
	$: diffs = doc.sym.mode === 'none' ? [] : symmetryReport(doc);
	$: score = symmetryScore(doc);
	$: centre = doc.sym.mode === 'none' ? null : symCentre(doc);
	$: shownHi = showDiff ? diffs.flatMap((x) => (x.twin ? [x.hex, x.twin] : [x.hex])) : highlight;
	$: errors = issues.filter((i) => i.level === 'error').length;
	$: warns = issues.filter((i) => i.level === 'warn').length;
	$: wave = startingWave(doc);
	const waveCount = (t: Team, r: Role) => wave.filter((w) => w.team === t && w.kind === r).length;
	function showIssue(hexes?: string[]) {
		showDiff = false;
		highlight = highlight === hexes || !hexes ? [] : hexes;
		if (highlight.length) canvas?.fit(highlight);
	}

	// ── the trace image ──
	let trace: Trace | null = null;
	let traceSrc = '';
	let traceOn = true;
	let traceNote = '';
	let fileIn: HTMLInputElement, jsonIn: HTMLInputElement;
	function saveTrace(name = '') {
		const src = traceSrc === fiPainting ? 'builtin:fi' : traceSrc;
		if (!trace || !src) { store.del(name ? `${TRACE}:${name}` : TRACE); return; }
		const ok = store.set(name ? `${TRACE}:${name}` : TRACE, JSON.stringify({ src, t: trace }));
		traceNote = ok ? '' : 'The image is too big to keep in this browser — it stays until you close the page.';
	}
	function loadTrace(name = ''): boolean {
		const raw = store.get(name ? `${TRACE}:${name}` : TRACE);
		if (!raw) return false;
		try { const x = JSON.parse(raw); traceSrc = x.src === 'builtin:fi' ? fiPainting : x.src; trace = x.t; return true; } catch { return false; }
	}
	function upload(file: File) {
		const r = new FileReader();
		r.onload = () => {
			const img = new Image();
			img.onload = () => {
				// keep it under ~2400 px so it fits in the browser's storage
				const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
				const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
				const c = document.createElement('canvas'); c.width = w; c.height = h;
				c.getContext('2d')!.drawImage(img, 0, 0, w, h);
				let src = c.toDataURL('image/webp', 0.85);
				if (!src.startsWith('data:image/webp')) src = c.toDataURL('image/jpeg', 0.85);
				traceSrc = src; trace = fitTrace(doc, w, h); traceOn = true;
				saveTrace();
			};
			img.src = r.result as string;
		};
		r.readAsDataURL(file);
	}
	function usePainting() {
		const fi = builtins.find((b) => b.file === 'forgotten_island')?.map;
		traceSrc = fiPainting;
		trace = legacyTrace(fi?.grid as { originX?: number; originY?: number; rot?: number });
		traceOn = true;
		saveTrace();
	}
	function setTrace(p: Partial<Trace>) { if (trace) { trace = { ...trace, ...p }; saveTrace(); } }
	function scaleTrace(f: number) {
		if (!trace) return;
		// about the middle of the image
		const mid = { x: trace.w / 2, y: trace.h / 2 };
		const a = (trace.rot * Math.PI) / 180, s = trace.scale;
		const cx = trace.x + (mid.x * s) * Math.cos(a) - (mid.y * s) * Math.sin(a), cy = trace.y + (mid.x * s) * Math.sin(a) + (mid.y * s) * Math.cos(a);
		const ns = s * f;
		setTrace({ scale: ns, x: cx - (mid.x * ns) * Math.cos(a) + (mid.y * ns) * Math.sin(a), y: cy - (mid.x * ns) * Math.sin(a) - (mid.y * ns) * Math.cos(a) });
	}
	function rotateTrace(deg: number) {
		if (!trace) return;
		const mid = { x: trace.w / 2, y: trace.h / 2 }, s = trace.scale;
		const a = (trace.rot * Math.PI) / 180, b = (deg * Math.PI) / 180;
		const cx = trace.x + mid.x * s * Math.cos(a) - mid.y * s * Math.sin(a), cy = trace.y + mid.x * s * Math.sin(a) + mid.y * s * Math.cos(a);
		setTrace({ rot: deg, x: cx - mid.x * s * Math.cos(b) + mid.y * s * Math.sin(b), y: cy - mid.x * s * Math.sin(b) - mid.y * s * Math.cos(b) });
	}
	// calibration: a point on the image → the hex it should be on, twice
	let cal: Pt[] = [];
	const CAL_STEPS = ['Click a landmark on the image', 'Click the hex it belongs on', 'Click a second landmark, far from the first', 'Click the hex that one belongs on'];
	function calibClick(p: Pt, h: string) {
		if (!trace) return;
		const step = cal.length;
		if (step === 0 || step === 2) cal = [...cal, p];
		else cal = [...cal, hexCenter(h, doc.size)];
		if (cal.length === 4) {
			const t = trace;
			trace = calibrate(t, toImage(t, cal[0]), toImage(t, cal[2]), cal[1], cal[3]);
			saveTrace();
			cal = []; tool = 'paint';
		}
	}
	$: calMarks = tool === 'calib' ? cal.map((p, i) => ({ ...p, label: `${i < 2 ? 1 : 2}${i % 2 ? '' : '′'}`, img: i % 2 === 0 })) : [];

	// ── maps ──
	let saved: Record<string, GameMap> = {};
	let savedAt = 0, saveFail = false, mapNote = '';
	let confirmKey = '';
	let confirmTimer: ReturnType<typeof setTimeout> | undefined;
	function sure(key: string, fn: () => void) {
		if (confirmKey === key) { confirmKey = ''; clearTimeout(confirmTimer); fn(); return; }
		confirmKey = key; clearTimeout(confirmTimer); confirmTimer = setTimeout(() => (confirmKey = ''), 3000);
	}
	async function open(m: GameMap, traceName = '') {
		act(() => { doc = fromMap(m); });
		highlight = []; showDiff = false; autoZ = false;
		trace = null; traceSrc = '';
		if (traceName && !loadTrace(traceName)) { /* none */ }
		saveTrace();
		mapsOpen = false;
		await tick(); canvas?.fit();
	}
	function openBuiltin(b: (typeof builtins)[number]) {
		open(b.map).then(() => { if (b.file === 'forgotten_island') usePainting(); });
	}
	async function newMap() {
		act(() => { doc = blankDoc('New map'); });
		autoZ = true; highlight = []; trace = null; traceSrc = ''; saveTrace();
		mapsOpen = false;
		await tick(); canvas?.fit();
	}
	function saveNamed() {
		const name = doc.name.trim() || 'Untitled map';
		doc.name = name;
		saved = { ...saved, [name]: toMap(doc) };
		const ok = store.set(SAVED, JSON.stringify(saved));
		saveTrace(name);
		mapNote = ok ? `Saved "${name}" — it is in Create game's map list on this browser.` : 'Could not save (browser storage full).';
		setTimeout(() => (mapNote = ''), 3500);
	}
	function delSaved(n: string) {
		const s = { ...saved }; delete s[n]; saved = s;
		store.set(SAVED, JSON.stringify(saved)); store.del(`${TRACE}:${n}`);
	}
	let pasteText = '', pasteErr = '';
	function importText(t: string) {
		try {
			const m = JSON.parse(t) as GameMap;
			if (!m || typeof m !== 'object' || !m.cells || !Object.keys(m.cells).length) throw new Error('no cells');
			pasteErr = ''; pasteText = '';
			open(m);
		} catch { pasteErr = 'That isn\'t a map (a GoA2 map JSON has "cells").'; }
	}
	function importFile(f: File) { const r = new FileReader(); r.onload = () => importText(String(r.result)); r.readAsText(f); }
	let copied = false;
	async function copyJson() {
		const t = JSON.stringify(toMap(doc));
		try { await navigator.clipboard.writeText(t); } catch {
			const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove();
		}
		copied = true; setTimeout(() => (copied = false), 1500);
	}
	function download() {
		const blob = new Blob([JSON.stringify(toMap(doc), null, '\t')], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${(doc.name.trim() || 'map').toLowerCase().replace(/[^a-z0-9]+/g, '_')}.json`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}

	// autosave the working map
	let loaded = false, saveTimer: ReturnType<typeof setTimeout> | undefined;
	$: if (loaded && doc) { clearTimeout(saveTimer); const m = toMap(doc); saveTimer = setTimeout(() => { saveFail = !store.set(WORK, JSON.stringify(m)); savedAt = Date.now(); }, 350); }
	$: savedClock = savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

	// ── preview ──
	$: previewMap = view === 'edit' ? null : toMap(doc);
	$: thrones = previewMap ? (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(previewMap, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex) : [];

	// ── keys ──
	function keydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
		const k = e.key.toLowerCase();
		if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
		if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); return; }
		if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); saveNamed(); return; }
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (k === 'escape') { tool = 'paint'; cal = []; highlight = []; showDiff = false; mapsOpen = false; return; }
		const L: Record<string, Layer> = { g: 'ground', o: 'obstacle', z: 'zone', n: 'minion', h: 'hero', e: 'erase' };
		if (L[k]) { layer = L[k]; tool = 'paint'; return; }
		if (k === 'f') fill = !fill;
		else if (k === 'i') tool = tool === 'pick' ? 'paint' : 'pick';
		else if (k === 'm') mirror = !mirror;
		else if (k === '[') radius = Math.max(0, radius - 1);
		else if (k === ']') radius = Math.min(3, radius + 1);
		else if (k >= '1' && k <= '4') { radius = +k - 1; fill = false; }
		else if (k === 't') team = team === 'orange' ? 'blue' : 'orange';
		else if (k === 'v') view = view === 'edit' ? 'island' : 'edit';
	}

	onMount(() => {
		try { const s = store.get(SAVED); if (s) saved = JSON.parse(s); } catch { /* ignore */ }
		try { const w = store.get(WORK); if (w) { const m = JSON.parse(w) as GameMap; if (m?.cells && Object.keys(m.cells).length) { doc = fromMap(m); autoZ = false; } } } catch { /* ignore */ }
		loadTrace();
		loaded = true;
		tick().then(() => canvas?.fit());
	});
	$: empty = !Object.keys(doc.ground).length;
	const g = (h: string) => GROUND_BY[h];
</script>

<svelte:head><title>Map editor — GoA2</title></svelte:head>
<svelte:window on:keydown={keydown} on:pointerup={() => cUp()} />

{#if $gmRole !== 'admin'}
	<div class="locked tide">
		<h2>Map editor</h2>
		<p>A GM tool — unlock Admin from the menu first.</p>
		<a class="back" href={base + '/?at=adminhub'} on:click|preventDefault={() => goBack('adminhub')}>← Back</a>
	</div>
{:else}
<div class="me">
	<!-- ── top bar ── -->
	<header class="bar">
		<a class="back" href={base + '/?at=adminhub'} on:click|preventDefault={() => goBack('adminhub')} aria-label="Back">←</a>
		<span class="ttl">Map editor</span>
		<input class="name" bind:value={doc.name} placeholder="Map name" aria-label="Map name" maxlength="40" />
		<span class="stat" class:bad={saveFail} title="The working map is kept in this browser as you go">{saveFail ? 'Not saved' : savedClock ? `Kept ${savedClock}` : ''}</span>
		<div class="sp"></div>
		<button class="ib" on:click={undo} disabled={!hist.length} title="Undo (Ctrl+Z)">↶</button>
		<button class="ib" on:click={redo} disabled={!fut.length} title="Redo (Ctrl+Y)">↷</button>
		<div class="seg" role="group" aria-label="View">
			<button class:on={view === 'edit'} on:click={() => (view = 'edit')}>Edit</button>
			<button class:on={view === 'island'} on:click={() => (view = 'island')}>Island</button>
			<button class:on={view === 'classic'} on:click={() => (view = 'classic')}>Classic</button>
		</div>
		<button class="b2" on:click={() => (mapsOpen = true)}>Maps</button>
		<button class="go" on:click={saveNamed} title="Save under this name (Ctrl+S)">Save</button>
	</header>
	<div class="note" class:show={!!mapNote}>{mapNote}</div>

	<!-- ── tools ── -->
	<aside class="tools">
		<div class="layers">
			{#each LAYERS as l (l.key)}
				<button class="lay" class:on={layer === l.key && tool === 'paint'} on:click={() => { layer = l.key; tool = 'paint'; }} title="{l.label} ({l.keyHint})">
					<span class="li li-{l.key}"></span><span class="ll">{l.label}</span><kbd>{l.keyHint}</kbd>
				</button>
			{/each}
		</div>
		<div class="pal">
			{#if layer === 'ground'}
				<div class="sw2">
					{#each GROUNDS as gr (gr.key)}
						<button class="sw" class:on={ground === gr.key} on:click={() => (ground = gr.key)}><span class="dot" style:background={gr.color}></span>{gr.label}</button>
					{/each}
				</div>
			{:else if layer === 'obstacle'}
				<div class="sw2 scroll">
					<button class="sw" class:on={scatterKey === ''} on:click={() => (scatterKey = '')}><span class="dot" style:background="#545a66"></span>Boulder</button>
					{#each SCATTER as k (k.key)}
						<button class="sw" class:on={scatterKey === k.key} on:click={() => (scatterKey = k.key)}><span class="dot" style:background={k.dot}></span>{k.label}</button>
					{/each}
				</div>
			{:else if layer === 'zone'}
				<div class="sw1">
					{#each ZONES as z (z.key)}
						<button class="sw" class:on={zone === z.key} on:click={() => (zone = z.key)}><span class="dot" style:background={z.color}></span>{zoneLabel(z.key)}{#if z.lane != null}<em>lane</em>{/if}</button>
					{/each}
				</div>
				<label class="ck" title="Bases, jungles and beaches get their zone from the ground (the side by the nearer base); everything else is the Center"><input type="checkbox" bind:checked={autoZ} on:change={() => { if (autoZ) act(() => autoZones(doc)); }} /> Follow the ground</label>
				<p class="hint">Painting a zone yourself turns this off.</p>
			{:else if layer === 'minion' || layer === 'hero'}
				<div class="seg full">
					<button class:on={team === 'orange'} class="o" on:click={() => (team = 'orange')}>Atlanteans</button>
					<button class:on={team === 'blue'} class="b" on:click={() => (team = 'blue')}>Titans</button>
				</div>
				{#if layer === 'minion'}
					<div class="seg full">
						{#each ROLES as r (r)}<button class:on={mRole === r} on:click={() => (mRole = r)}>{r[0].toUpperCase() + r.slice(1)}</button>{/each}
					</div>
					<p class="hint">Tap a spawn point of this kind again to turn it (Shift: back).</p>
					<button class="b2 wide" on:click={() => act(() => faceEnemy(doc))}>Face the enemy base</button>
				{:else}
					<p class="hint">Heroes start and respawn here. Three a team is the usual.</p>
				{/if}
			{:else}
				<div class="seg full">
					<button class:on={eraseKind === 'erase'} on:click={() => (eraseKind = 'erase')}>Remove hex</button>
					<button class:on={eraseKind === 'clear'} on:click={() => (eraseKind = 'clear')}>Clear feature</button>
				</div>
			{/if}
		</div>
		<div class="brush" class:off={point}>
			<span class="cap">Brush</span>
			<div class="seg full">
				{#each [0, 1, 2, 3] as r (r)}<button class:on={!fill && radius === r} on:click={() => { radius = r; fill = false; }} title="{1 + 3 * r * (r + 1)} hexes ({r + 1})">{1 + 3 * r * (r + 1)}</button>{/each}
				<button class:on={fill} on:click={() => (fill = !fill)} title="Fill the connected area (F)">Fill</button>
			</div>
		</div>
		<div class="row2">
			<button class="tg" class:on={tool === 'pick'} on:click={() => (tool = tool === 'pick' ? 'paint' : 'pick')} title="Pick up what's on a hex (I, or Alt+click)">Pick</button>
			<button class="tg" class:on={tool === 'pan'} on:click={() => (tool = tool === 'pan' ? 'paint' : 'pan')} title="Pan (or hold Space / right-drag)">Pan</button>
			<button class="tg" class:on={mirrorOn} disabled={doc.sym.mode === 'none'} on:click={() => (mirror = !mirror)} title="Paint both halves at once (M)">Mirror</button>
		</div>
		<div class="row2 views">
			<label><input type="checkbox" bind:checked={showZones} /> Zones</label>
			<label><input type="checkbox" bind:checked={showMarks} /> Marks</label>
			<label><input type="checkbox" bind:checked={showGrid} /> Grid</label>
			<label><input type="checkbox" bind:checked={traceOn} disabled={!traceSrc} /> Trace</label>
		</div>
	</aside>

	<!-- ── the board ── -->
	<main class="stage">
		{#if view === 'edit'}
			<EditorCanvas bind:this={canvas} {doc} {trace} {traceSrc} {traceOn} {showZones} {showGrid} {showMarks} highlight={shownHi} {footprint} {twinPrint} {footColor}
				{centre} symMode={doc.sym.mode} calib={calMarks} {cursor} panTool={tool === 'pan'}
				onDown={cDown} onMove={cMove} onUp={() => cUp()} onLeave={() => (hover = null)} />
			<div class="zoom">
				<button on:click={() => canvas.zoom(1.25)} aria-label="Zoom in">+</button>
				<button on:click={() => canvas.zoom(0.8)} aria-label="Zoom out">−</button>
				<button on:click={() => canvas.fit()} aria-label="Fit">⤢</button>
			</div>
			<div class="hov" class:gone={!hoverInfo && tool === 'paint'}>{tool === 'calib' ? `Calibrate · ${CAL_STEPS[cal.length]}` : tool === 'centre' ? 'Click where the symmetry centre goes' : tool === 'trace' ? 'Drag to move the trace image' : hoverInfo}</div>
			{#if empty}
				<div class="emptycard">
					<b>Start a map</b>
					<p>Paint hexes with the ground tools, or open Forgotten Island to change it.</p>
					<div class="row2">
						<button class="go" on:click={() => { const b = builtins.find((x) => x.file === 'forgotten_island'); if (b) openBuiltin(b); }}>Open Forgotten Island</button>
						<button class="b2" on:click={() => { panel = 'trace'; fileIn?.click(); }}>Trace an image</button>
					</div>
				</div>
			{/if}
		{:else if previewMap}
			{#key view}
				<BoardCanvas map={previewMap} look={view} {thrones} activeZone="Center" glowZone={view === 'island' ? 'Center' : null} />
			{/key}
			<div class="hov">Preview · the board as players see it ({view === 'island' ? 'island' : 'classic'} look)</div>
		{/if}
	</main>

	<!-- ── side panel ── -->
	<aside class="side">
		<nav class="tabs">
			<button class:on={panel === 'check'} on:click={() => (panel = 'check')}>Check{#if errors}<i class="n bad">{errors}</i>{:else if warns}<i class="n">{warns}</i>{/if}</button>
			<button class:on={panel === 'sym'} on:click={() => (panel = 'sym')}>Symmetry</button>
			<button class:on={panel === 'trace'} on:click={() => (panel = 'trace')}>Trace</button>
			<button class:on={panel === 'map'} on:click={() => (panel = 'map')}>Map</button>
		</nav>
		<div class="pbody">
			{#if panel === 'check'}
				<ul class="issues">
					{#each issues as i, k (k)}
						<li class={i.level}>
							<button disabled={!i.hexes?.length} class:sel={highlight === i.hexes && !!i.hexes} on:click={() => showIssue(i.hexes)}>
								<span class="ic">{i.level === 'error' ? '✕' : i.level === 'warn' ? '!' : '✓'}</span><span>{i.text}</span>
							</button>
						</li>
					{/each}
				</ul>
				<table class="zt">
					<thead><tr><th>Zone</th><th title="Hexes (open)">Hexes</th><th class="o" title="Atlantean minion spawn points · melee / ranged / heavy">Atl</th><th class="b" title="Titan minion spawn points · melee / ranged / heavy">Tit</th><th title="Hero spawn points">Hero</th></tr></thead>
					<tbody>
						{#each stats as s (s.zone)}
							<tr class:lane={ZONE_BY[s.zone]?.lane != null}>
								<td><span class="dot" style:background={ZONE_BY[s.zone]?.color ?? '#888'}></span>{zoneLabel(s.zone)}</td>
								<td>{s.hexes}<small>{s.open}</small></td>
								<td title="{s.minions.orange.melee} melee · {s.minions.orange.ranged} ranged · {s.minions.orange.heavy} heavy">{minionTotal(s, 'orange') || '—'}</td>
								<td title="{s.minions.blue.melee} melee · {s.minions.blue.ranged} ranged · {s.minions.blue.heavy} heavy">{minionTotal(s, 'blue') || '—'}</td>
								<td>{s.heroes.orange + s.heroes.blue || '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<div class="wave">
					<span class="cap">Starting wave (the Center)</span>
					<span><b class="o">Atlanteans</b> {waveCount('orange', 'melee')} melee · {waveCount('orange', 'ranged')} ranged · {waveCount('orange', 'heavy')} heavy</span>
					<span><b class="b">Titans</b> {waveCount('blue', 'melee')} melee · {waveCount('blue', 'ranged')} ranged · {waveCount('blue', 'heavy')} heavy</span>
					<span class="hint">Forgotten Island: 4 melee · 1 ranged · 1 heavy a team.</span>
				</div>
			{:else if panel === 'sym'}
				<span class="cap">Kind</span>
				<div class="seg full col2">
					{#each [['none', 'None'], ['rotate', 'Turn 180°'], ['mirrorV', 'Mirror ⟷'], ['mirrorH', 'Mirror ↕']] as [m, l] (m)}
						<button class:on={doc.sym.mode === m} on:click={() => act(() => setSymMode(doc, m as SymMode))}>{l}</button>
					{/each}
				</div>
				{#if doc.sym.mode !== 'none'}
					<p class="hint">{doc.sym.mode === 'rotate' ? 'Each hex has a twin straight through the centre, like Forgotten Island.' : doc.sym.mode === 'mirrorV' ? 'The left half mirrors the right.' : 'The top half mirrors the bottom.'} The twin gets the other team's base, spawns and zones.</p>
					<div class="score">
						<div class="ring" style:--v={score}><b>{score}%</b></div>
						<div>
							<b>{diffs.length ? `${diffs.length} difference${diffs.length === 1 ? '' : 's'}` : 'Symmetric'}</b>
							<button class="b2" disabled={!diffs.length} class:on={showDiff} on:click={() => { showDiff = !showDiff; highlight = []; if (showDiff) canvas?.fit(shownHi); }}>{showDiff ? 'Hide' : 'Show'}</button>
						</div>
					</div>
					<span class="cap">Centre</span>
					<div class="row2">
						<button class="b2" class:on={doc.sym.cx == null} on:click={() => act(() => { doc.sym = { mode: doc.sym.mode }; })} title="The middle of the grid">Grid</button>
						<button class="b2" disabled={empty} on:click={() => act(() => { const c = autoCentre(doc); doc.sym.cx = c.x; doc.sym.cy = c.y; })} title="The middle of what is painted">Map</button>
						<button class="b2" class:on={tool === 'centre'} on:click={() => { tool = tool === 'centre' ? 'paint' : 'centre'; view = 'edit'; }}>Place…</button>
					</div>
					<label class="ck"><input type="checkbox" bind:checked={mirror} /> Paint both halves at once (M)</label>
					<span class="cap">Copy one half onto the other</span>
					<div class="row2">
						<button class="b2 o" class:warn={confirmKey === 'mo'} on:click={() => sure('mo', () => act(() => mirrorHalf(doc, 'orange')))}>{confirmKey === 'mo' ? 'Replace the Titan half?' : 'Atlantean → Titan'}</button>
						<button class="b2 b" class:warn={confirmKey === 'mb'} on:click={() => sure('mb', () => act(() => mirrorHalf(doc, 'blue')))}>{confirmKey === 'mb' ? 'Replace the Atlantean half?' : 'Titan → Atlantean'}</button>
					</div>
				{/if}
			{:else if panel === 'trace'}
				<input type="file" accept="image/*" bind:this={fileIn} hidden on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) upload(f); e.currentTarget.value = ''; }} />
				<div class="row2">
					<button class="go" on:click={() => fileIn.click()}>Upload image</button>
					<button class="b2" on:click={usePainting}>Forgotten Island art</button>
				</div>
				{#if trace && traceSrc}
					<label class="ck"><input type="checkbox" bind:checked={traceOn} /> Show the trace</label>
					<label class="sl"><span>Opacity <b>{Math.round(trace.opacity * 100)}%</b></span><input type="range" min="0.05" max="1" step="0.01" value={trace.opacity} on:input={(e) => setTrace({ opacity: +e.currentTarget.value })} /></label>
					<label class="sl"><span>Rotation <b>{trace.rot.toFixed(1)}°</b></span><input type="range" min="-180" max="180" step="0.1" value={trace.rot} on:input={(e) => rotateTrace(+e.currentTarget.value)} /></label>
					<span class="cap">Size</span>
					<div class="row2">
						<button class="b2" on:click={() => scaleTrace(1 / 1.1)}>− 10%</button>
						<button class="b2" on:click={() => scaleTrace(1 / 1.01)}>− 1%</button>
						<button class="b2" on:click={() => scaleTrace(1.01)}>+ 1%</button>
						<button class="b2" on:click={() => scaleTrace(1.1)}>+ 10%</button>
					</div>
					<div class="row2">
						<button class="b2" class:on={tool === 'trace'} on:click={() => { tool = tool === 'trace' ? 'paint' : 'trace'; view = 'edit'; }}>Move (drag)</button>
						<button class="b2" class:on={tool === 'calib'} on:click={() => { tool = tool === 'calib' ? 'paint' : 'calib'; cal = []; view = 'edit'; }}>Line up…</button>
					</div>
					{#if tool === 'calib'}<p class="hint step">Step {cal.length + 1} of 4 · {CAL_STEPS[cal.length]}. Two landmarks set the size, turn and place at once.</p>{/if}
					<div class="row2">
						<button class="b2" on:click={() => trace && setTrace(fitTrace(doc, trace.w, trace.h, trace.opacity))}>Fit to grid</button>
						<button class="b2 danger" on:click={() => { trace = null; traceSrc = ''; saveTrace(); }}>Remove</button>
					</div>
					<p class="hint">The trace stays in this browser with the map; it never goes into games.</p>
				{:else}
					<p class="hint">Upload a picture of a board (a photo, a scan, a sketch) and paint the hexes over it. Line it up with two landmarks.</p>
				{/if}
				{#if traceNote}<p class="hint bad">{traceNote}</p>{/if}
			{:else}
				<span class="cap">Grid · {doc.cols} × {doc.rows}</span>
				<div class="grow">
					{#each [['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']] as [s, l] (s)}
						<div class="gr"><span>{l}</span>
							<button class="b2" on:click={() => act(() => growGrid(doc, s as 'top', s === 'top' || s === 'bottom' ? -2 : -1))} aria-label="Shrink {l}">−</button>
							<button class="b2" on:click={() => act(() => growGrid(doc, s as 'top', s === 'top' || s === 'bottom' ? 2 : 1))} aria-label="Grow {l}">+</button>
						</div>
					{/each}
				</div>
				<button class="b2 wide" on:click={() => act(() => fitGrid(doc))} disabled={empty}>Fit the grid to the map</button>
				<span class="cap">Wave counters</span>
				<div class="grow">
					{#each [['quick', 'Quick game'], ['long', 'Long game']] as [k, l] (k)}
						<div class="gr"><span>{l}</span>
							<button class="b2" on:click={() => act(() => { doc.waves[k as 'quick'] = Math.max(1, doc.waves[k as 'quick'] - 1); })}>−</button>
							<b class="num">{doc.waves[k as 'quick']}</b>
							<button class="b2" on:click={() => act(() => { doc.waves[k as 'quick'] = Math.min(12, doc.waves[k as 'quick'] + 1); })}>+</button>
						</div>
					{/each}
				</div>
				<span class="cap">Helpers</span>
				<button class="b2 wide" on:click={() => act(() => autoZones(doc))}>Zones from ground</button>
				<button class="b2 wide" on:click={() => act(() => faceEnemy(doc))}>Turn minions to face the enemy</button>
				<a class="b2 wide lnk" href="{base}/map-lab?map=__editor" target="_blank" rel="noreferrer">Open in the Map lab ↗</a>
				<button class="b2 wide danger" class:warn={confirmKey === 'clr'} on:click={() => sure('clr', () => act(() => { doc.ground = {}; doc.zone = {}; doc.feat = {}; }))}>{confirmKey === 'clr' ? 'Tap again to clear every hex' : 'Clear the map'}</button>
				<p class="hint">Keys: G O Z N H E layers · 1–4 brush · F fill · I pick · M mirror · T team · V preview · Space pan · Ctrl+Z / Y</p>
			{/if}
		</div>
	</aside>

	<!-- ── maps window ── -->
	{#if mapsOpen}
		<div class="scrim" role="presentation" on:pointerdown|self={() => (mapsOpen = false)}>
			<div class="maps" role="dialog" aria-label="Maps">
				<div class="mh"><b>Maps</b><button class="ib" on:click={() => (mapsOpen = false)} aria-label="Close">✕</button></div>
				<div class="mcols">
					<section>
						<span class="cap">Start</span>
						<button class="mrow" on:click={newMap}><b>New blank map</b><small>22 × 22 grid · turn-180° symmetry on</small></button>
						{#each builtins as b (b.file)}
							<button class="mrow" on:click={() => openBuiltin(b)}><b>{b.name}</b><small>Built-in · opens a copy with its painting as the trace</small></button>
						{/each}
						<span class="cap">Saved in this browser</span>
						{#each Object.keys(saved) as n (n)}
							<div class="mrow two">
								<button class="lk" on:click={() => open(saved[n], n)}><b>{n}</b><small>{Object.keys(saved[n].cells ?? {}).length} hexes</small></button>
								<button class="x" class:warn={confirmKey === `d:${n}`} on:click={() => sure(`d:${n}`, () => delSaved(n))}>{confirmKey === `d:${n}` ? 'Delete?' : '✕'}</button>
							</div>
						{:else}
							<p class="hint">None yet — Save keeps the map under its name.</p>
						{/each}
						<p class="hint">Opening a map replaces the working one — Undo brings it back.</p>
					</section>
					<section>
						<span class="cap">Import</span>
						<input type="file" accept="application/json,.json" bind:this={jsonIn} hidden on:change={(e) => { const f = e.currentTarget.files?.[0]; if (f) importFile(f); e.currentTarget.value = ''; }} />
						<button class="b2 wide" on:click={() => jsonIn.click()}>Open a .json file</button>
						<textarea bind:value={pasteText} placeholder="…or paste a map's JSON here" rows="5"></textarea>
						<button class="b2 wide" disabled={!pasteText.trim()} on:click={() => importText(pasteText)}>Import pasted map</button>
						<p class="hint bad slot">{pasteErr}</p>
						<span class="cap">Export</span>
						<div class="row2">
							<button class="b2" on:click={copyJson}>{copied ? 'Copied' : 'Copy JSON'}</button>
							<button class="b2" on:click={download}>Download .json</button>
						</div>
						<p class="hint">To ship a map with the game for everyone, send Claude the JSON.</p>
					</section>
				</div>
			</div>
		</div>
	{/if}
</div>
{/if}

<style>
	.locked { max-width: 480px; margin: 120px auto; text-align: center; color: #f5f1e8; }
	.locked .back { color: #d8b36a; }
	.me {
		--brass: #d8b36a; --brass-hi: #f4dfa8; --ink: #f5f1e8; --ink2: #bccbd9; --ink3: #8a9fb3; --line: rgba(216, 179, 106, 0.3); --hair: rgba(255, 255, 255, 0.1);
		--panel: linear-gradient(180deg, rgba(14, 40, 66, 0.96), rgba(6, 21, 38, 0.98)); --well: rgba(2, 11, 22, 0.55); --orange: #ef7d22; --blue: #2f7fe6;
		position: fixed; inset: 0; display: grid; grid-template-columns: 236px minmax(0, 1fr) 312px; grid-template-rows: 52px minmax(0, 1fr);
		grid-template-areas: 'bar bar bar' 'tools stage side'; background: #030b15; color: var(--ink); font-size: 13px;
	}
	button { font: inherit; color: inherit; cursor: pointer; background: none; border: 0; }
	button:disabled { opacity: 0.4; cursor: default; }
	.bar { grid-area: bar; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--panel); border-bottom: 1px solid var(--line); min-width: 0; }
	.back { color: var(--brass); text-decoration: none; font-size: 20px; width: 30px; text-align: center; }
	.ttl { color: var(--brass-hi); letter-spacing: 0.06em; white-space: nowrap; }
	.name { width: 200px; min-width: 90px; flex: 0 1 200px; background: var(--well); border: 1px solid var(--hair); border-radius: 8px; color: var(--ink); padding: 6px 9px; font: inherit; }
	.name:focus { outline: none; border-color: var(--brass); }
	.stat { color: var(--ink3); font-size: 11.5px; white-space: nowrap; width: 84px; overflow: hidden; }
	.stat.bad { color: #ffa3a3; }
	.sp { flex: 1; }
	.ib { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.04); font-size: 16px; }
	.seg { display: inline-flex; background: var(--well); border: 1px solid var(--hair); border-radius: 9px; padding: 2px; gap: 2px; }
	.seg button { padding: 5px 10px; border-radius: 7px; color: var(--ink2); white-space: nowrap; }
	.seg button.on { background: rgba(216, 179, 106, 0.18); color: var(--brass-hi); box-shadow: inset 0 0 0 1px var(--brass); }
	.seg button.o.on { background: rgba(239, 125, 34, 0.2); color: #ffb878; box-shadow: inset 0 0 0 1px var(--orange); }
	.seg button.b.on { background: rgba(47, 127, 230, 0.2); color: #9ccbff; box-shadow: inset 0 0 0 1px var(--blue); }
	.seg.full { display: flex; width: 100%; }
	.seg.full button { flex: 1; padding: 6px 4px; }
	.seg.col2 { flex-wrap: wrap; }
	.seg.col2 button { flex: 1 1 45%; }
	.b2 { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.05); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.b2:hover:not(:disabled) { border-color: var(--line); }
	.b2.on { border-color: var(--brass); color: var(--brass-hi); background: rgba(216, 179, 106, 0.14); }
	.b2.o { color: #ffb878; } .b2.b { color: #9ccbff; }
	.b2.danger { color: #ffa3a3; }
	.b2.warn { border-color: #e5484d; background: rgba(229, 72, 77, 0.16); color: #ffd0d0; }
	.b2.wide { width: 100%; display: block; text-align: center; }
	.lnk { text-decoration: none; box-sizing: border-box; }
	.go { padding: 7px 16px; border-radius: 8px; background: linear-gradient(180deg, #f4dfa8, #d8b36a 55%, #a8853f); color: #1b1204; font-weight: 600; white-space: nowrap; }
	.note { position: fixed; top: 60px; left: 50%; transform: translateX(-50%); z-index: 30; background: var(--panel); border: 1px solid var(--brass); border-radius: 10px; padding: 8px 14px; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
	.note.show { opacity: 1; }

	.tools { grid-area: tools; background: var(--panel); border-right: 1px solid var(--line); padding: 10px; display: flex; flex-direction: column; gap: 10px; min-height: 0; overflow: hidden; }
	.layers { display: grid; gap: 3px; }
	.lay { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 8px; border: 1px solid transparent; text-align: left; color: var(--ink2); }
	.lay.on { border-color: var(--brass); background: rgba(216, 179, 106, 0.12); color: var(--ink); }
	.lay .ll { flex: 1; }
	.lay kbd { font: inherit; font-size: 10.5px; color: var(--ink3); border: 1px solid var(--hair); border-radius: 4px; padding: 0 5px; }
	.li { width: 18px; height: 18px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); flex: none; }
	.li-ground { background: linear-gradient(135deg, #dcc07a 50%, #3f7a35 50%); }
	.li-obstacle { background: #545a66; }
	.li-zone { background: linear-gradient(90deg, #f2b04a 33%, #c9c3b2 33% 66%, #7fd0f0 66%); }
	.li-minion { background: linear-gradient(90deg, #ff8a2a 50%, #4ea3ff 50%); }
	.li-hero { background: radial-gradient(circle, #f4dfa8 30%, #5a1e22 32%); }
	.li-erase { background: repeating-linear-gradient(45deg, #ff8a8a 0 3px, transparent 3px 6px); border: 1px solid #ff8a8a; }
	.pal { display: flex; flex-direction: column; gap: 6px; min-height: 0; flex: 1; overflow: hidden; border-top: 1px solid var(--hair); padding-top: 10px; }
	.sw1, .sw2 { display: grid; gap: 3px; }
	.sw2 { grid-template-columns: 1fr 1fr; }
	.sw2.scroll { overflow: auto; min-height: 0; }
	.sw { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 7px; border: 1px solid transparent; text-align: left; color: var(--ink2); font-size: 12px; min-width: 0; }
	.sw.on { border-color: var(--brass); color: var(--ink); background: rgba(216, 179, 106, 0.1); }
	.sw em { margin-left: auto; font-style: normal; font-size: 10px; color: var(--brass); }
	.dot { width: 13px; height: 13px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35); display: inline-block; }
	.brush.off { opacity: 0.35; pointer-events: none; }
	.cap { display: block; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin: 2px 0 4px; }
	.row2 { display: flex; gap: 5px; }
	.row2 > * { flex: 1; min-width: 0; }
	.tg { padding: 6px 4px; border-radius: 8px; border: 1px solid var(--hair); color: var(--ink2); }
	.tg.on { border-color: var(--brass); color: var(--brass-hi); background: rgba(216, 179, 106, 0.14); }
	.row2.views { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
	.views label { display: flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--ink2); }
	.hint { color: var(--ink3); font-size: 11.5px; margin: 2px 0; line-height: 1.35; }
	.hint.bad { color: #ffa3a3; }
	.hint.step { color: var(--brass-hi); }
	.hint.slot { min-height: 1.35em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	.stage { grid-area: stage; position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #051424; }
	.zoom { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 4px; }
	.zoom button { width: 34px; height: 34px; border-radius: 9px; background: rgba(6, 21, 38, 0.92); border: 1px solid var(--line); font-size: 17px; }
	.hov { position: absolute; left: 12px; bottom: 12px; right: 60px; height: 28px; line-height: 28px; padding: 0 10px; border-radius: 8px; background: rgba(6, 21, 38, 0.86); border: 1px solid var(--hair); color: var(--ink2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; width: fit-content; max-width: calc(100% - 72px); }
	.hov.gone { opacity: 0; }
	.emptycard { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(380px, 86%); background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 18px; display: grid; gap: 8px; text-align: center; }
	.emptycard b { color: var(--brass-hi); font-size: 16px; }
	.emptycard p { color: var(--ink2); margin: 0 0 4px; }

	.side { grid-area: side; background: var(--panel); border-left: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; }
	.tabs { display: flex; border-bottom: 1px solid var(--hair); }
	.tabs button { flex: 1; padding: 11px 4px 10px; color: var(--ink3); border-bottom: 2px solid transparent; position: relative; }
	.tabs button.on { color: var(--brass-hi); border-bottom-color: var(--brass); }
	.n { font-style: normal; font-size: 10px; background: #a8853f; color: #1b1204; border-radius: 9px; padding: 0 5px; margin-left: 4px; }
	.n.bad { background: #e5484d; color: #fff; }
	.pbody { padding: 12px; overflow: auto; min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 7px; }
	.issues { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
	.issues button { width: 100%; display: flex; gap: 8px; text-align: left; padding: 7px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.03); border: 1px solid transparent; line-height: 1.35; }
	.issues button:disabled { opacity: 1; cursor: default; }
	.issues button.sel { border-color: #ff6b6f; }
	.issues .ic { width: 18px; height: 18px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 11px; }
	.issues .error .ic { background: #e5484d; color: #fff; }
	.issues .warn .ic { background: #a8853f; color: #1b1204; }
	.issues .ok .ic { background: #16a34a; color: #fff; }
	.zt { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; font-variant-numeric: tabular-nums; }
	.zt th { color: var(--ink3); font-weight: normal; text-align: right; padding: 3px 4px; font-size: 11px; }
	.zt th:first-child, .zt td:first-child { text-align: left; }
	.zt th.o { color: #ffb878; } .zt th.b { color: #9ccbff; }
	.zt td { padding: 4px; text-align: right; border-top: 1px solid var(--hair); white-space: nowrap; }
	.zt td small { color: var(--ink3); margin-left: 3px; }
	.zt td .dot { margin-right: 6px; vertical-align: -2px; }
	.zt tr.lane td:first-child { color: var(--brass-hi); }
	.wave { display: grid; gap: 3px; margin-top: 6px; font-size: 12px; color: var(--ink2); }
	.wave b.o { color: #ffb878; font-weight: normal; } .wave b.b { color: #9ccbff; font-weight: normal; }
	.score { display: flex; gap: 12px; align-items: center; padding: 6px 0; }
	.score > div:last-child { display: grid; gap: 5px; justify-items: start; }
	.ring { --v: 0; width: 58px; height: 58px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--brass) calc(var(--v) * 1%), rgba(255, 255, 255, 0.08) 0); position: relative; flex: none; }
	.ring::before { content: ''; position: absolute; inset: 5px; border-radius: 50%; background: #071b2e; }
	.ring b { position: relative; font-size: 13px; color: var(--brass-hi); }
	.ck { display: flex; gap: 6px; align-items: center; color: var(--ink2); }
	.sl { display: grid; gap: 3px; color: var(--ink2); }
	.sl span { display: flex; justify-content: space-between; }
	.sl b { color: var(--ink); font-weight: normal; }
	.sl input { width: 100%; accent-color: #d8b36a; }
	.grow { display: grid; gap: 4px; }
	.gr { display: grid; grid-template-columns: 1fr 34px auto 34px; gap: 4px; align-items: center; color: var(--ink2); }
	.gr .b2 { padding: 4px 0; text-align: center; }
	.gr:not(:has(.num)) { grid-template-columns: 1fr 34px 34px; }
	.num { min-width: 22px; text-align: center; color: var(--ink); font-weight: normal; }

	.scrim { position: fixed; inset: 0; background: rgba(2, 8, 16, 0.6); z-index: 40; display: grid; place-items: center; }
	.maps { width: min(760px, 94vw); max-height: 86dvh; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; }
	.mh { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--hair); }
	.mh b { color: var(--brass-hi); font-size: 15px; }
	.mcols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 14px; overflow: auto; }
	.mcols section { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
	.mrow { display: grid; text-align: left; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.03); }
	.mrow:hover { border-color: var(--line); }
	.mrow small { color: var(--ink3); }
	.mrow.two { grid-template-columns: 1fr auto; padding: 0; }
	.mrow .lk { display: grid; text-align: left; padding: 8px 10px; }
	.mrow .x { padding: 0 12px; color: #ffa3a3; }
	.mrow .x.warn { background: rgba(229, 72, 77, 0.2); }
	textarea { width: 100%; box-sizing: border-box; background: var(--well); border: 1px solid var(--hair); border-radius: 8px; color: var(--ink); padding: 8px; font: 12px ui-monospace, monospace; resize: none; }

	@media (max-width: 1100px) { .me { grid-template-columns: 210px minmax(0, 1fr) 280px; } .stat { display: none; } }
	@media (max-width: 860px) {
		.me { grid-template-columns: minmax(0, 1fr); grid-template-rows: 52px minmax(0, 1fr) auto 32dvh; grid-template-areas: 'bar' 'stage' 'tools' 'side'; }
		.ttl, .seg[aria-label='View'] button:last-child { display: none; }
		.bar { gap: 5px; padding: 0 8px; }
		.name { flex: 1 1 auto; width: auto; min-width: 60px; }
		.bar .b2, .bar .go { padding: 6px 8px; }
		.bar .ib { width: 28px; }
		.seg button { padding: 5px 7px; }
		.tools { border-right: 0; border-top: 1px solid var(--line); padding: 6px 8px; gap: 6px; height: 156px; overflow-y: auto; }
		.tools > * { flex: none; }
		.layers { grid-template-columns: repeat(6, minmax(0, 1fr)); }
		.lay { justify-content: center; padding: 6px 2px; }
		.lay .ll, .lay kbd { display: none; }
		.pal { border-top: 0; padding-top: 0; flex: none; overflow: visible; }
		.sw2, .sw1 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
		.row2.views { grid-template-columns: repeat(4, 1fr); }
		.bar .b2 { overflow: visible; }
		.side { border-left: 0; border-top: 1px solid var(--line); }
		.mcols { grid-template-columns: 1fr; }
	}
</style>
