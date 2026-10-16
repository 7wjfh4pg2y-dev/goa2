<script lang="ts">
	// The OPENING BUILDER (GMs only): draw a hero's round-1 openings on the real island in the Openings Compendium's
	// style, and write the hero's guide (the hero page's Overview). Left: the hero's openings and the one being edited
	// (name, side, size, lane, goal, the card of each turn). Middle: the board — tap spaces with the tool picked on
	// the right (turn chips in the five card colours, alternatives dimmed, rings, arrows, areas, enemy / ally heroes,
	// labels, the hero's own tokens, its start, the eraser, pick). Undo / redo; every change is kept in this browser
	// until it is saved to Supabase, so nothing is lost. ?hero=id&id=openingId&new=1
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';
	import OpeningBoard from '$lib/openings/OpeningBoard.svelte';
	import { loadOpenings, saveOpening, saveGuide } from '$lib/openings/store';
	import { HEROES_ALPHA, heroById, portraitCss } from '$lib/heroes';
	import { HERO_KIT, COMPANIONS, tokenName } from '$lib/tokens';
	import {
		blankOpening, blankGuide, onSide, applyTool, markLabel, sortOpenings, newId, spawnsOf, turnCards,
		CARD_COLORS, CARD_HEX, CARD_NAME, MARK_HEX, LANES, SIZES, MINION_PREFS, GUIDE_TAGS, OPENINGS_SQL,
		type Opening, type HeroGuide, type Mark, type Tool, type ToolOpts, type Turn, type Side, type CardColor, type MinionPref, type GuideTag
	} from '$lib/openings';

	let ready = false;
	let status: 'loading' | 'ready' | 'missing' | 'error' = 'loading';
	let loadErr = '';
	let server: Opening[] = [];
	let guides: Record<string, HeroGuide> = {};
	let heroId = 'wasp';
	let mode: 'openings' | 'guide' = 'openings';

	// ── local drafts: every change is kept in this browser until it's saved ──
	const DKEY = 'goa2-op-drafts';
	let drafts: Record<string, Opening> = {};
	try { drafts = JSON.parse(localStorage.getItem(DKEY) ?? '{}') ?? {}; } catch { drafts = {}; }
	function keepDrafts() { try { localStorage.setItem(DKEY, JSON.stringify(drafts)); } catch { /* ignore */ } }
	$: merged = (() => {
		const byId = new Map(server.map((o) => [o.id, o]));
		for (const id in drafts) byId.set(id, drafts[id]);
		return [...byId.values()];
	})();
	$: heroOps = sortOpenings(merged.filter((o) => o.hero === heroId));
	$: otherOps = sortOpenings(merged.filter((o) => o.hero !== heroId));
	const unsaved = (id: string) => !!drafts[id];

	// ── the opening being edited ──
	let cur: Opening | null = null;
	let past: Opening[] = [];
	let future: Opening[] = [];
	function open(o: Opening | null) { cur = o; past = []; future = []; picked = null; areaId = null; arrowFrom = null; }
	function edit(next: Opening) {
		if (!cur) return;
		past = [...past.slice(-80), cur];
		future = [];
		cur = { ...next, updatedAt: Date.now() };
		drafts = { ...drafts, [cur.id]: cur };
		keepDrafts();
	}
	function patch(p: Partial<Opening>) { if (cur) edit({ ...cur, ...p }); }
	function undo() { if (!cur || !past.length) return; future = [cur, ...future]; cur = past[past.length - 1]; past = past.slice(0, -1); drafts = { ...drafts, [cur.id]: cur }; keepDrafts(); }
	function redo() { if (!cur || !future.length) return; past = [...past, cur]; cur = future[0]; future = future.slice(1); drafts = { ...drafts, [cur.id]: cur }; keepDrafts(); }

	// ── saving ──
	let msg = '';
	let msgT: ReturnType<typeof setTimeout> | null = null;
	function say(t: string) { msg = t; if (msgT) clearTimeout(msgT); msgT = setTimeout(() => (msg = ''), 3200); }
	let saving = false;
	async function save(o: Opening | null = cur): Promise<boolean> {
		if (!o) return false;
		saving = true;
		const err = await saveOpening(o);
		saving = false;
		if (err) { say(err); return false; }
		server = [...server.filter((x) => x.id !== o.id), o];
		const { [o.id]: _, ...rest } = drafts;
		drafts = rest;
		keepDrafts();
		say(o.deleted ? 'Opening deleted.' : 'Saved.');
		return true;
	}
	function newOpening(list: Opening[] = heroOps) {
		const o = { ...blankOpening(heroId, 'blue'), order: (list.at(-1)?.order ?? 0) + 1, start: spawnsOf('blue')[1] ?? '' };
		drafts = { ...drafts, [o.id]: o };
		keepDrafts();
		open(o);
	}
	function duplicate(src: Opening, hero = heroId) {
		const o: Opening = {
			...structuredClone(src), id: newId(), hero, name: hero === src.hero ? `${src.name} (copy)` : src.name, order: (heroOps.at(-1)?.order ?? 0) + 1, updatedAt: Date.now(),
			marks: hero === src.hero ? structuredClone(src.marks) : src.marks.filter((m) => m.kind !== 'token').map((m) => ({ ...structuredClone(m), id: newId('m') }))
		};
		delete o.deleted;
		drafts = { ...drafts, [o.id]: o };
		keepDrafts();
		open(o);
		say(hero === src.hero ? 'Copied.' : `Copied from ${heroById(src.hero)?.name ?? src.hero}.`);
	}
	let delArm = false;
	async function remove() {
		if (!cur) return;
		if (!delArm) { delArm = true; setTimeout(() => (delArm = false), 3000); return; }
		delArm = false;
		const gone = { ...cur, deleted: true };
		if (server.some((o) => o.id === cur?.id)) await save(gone);
		else { const { [gone.id]: _, ...rest } = drafts; drafts = rest; keepDrafts(); }
		open(null);
	}
	function discard() {
		if (!cur) return;
		const id = cur.id;
		const { [id]: _, ...rest } = drafts;
		drafts = rest;
		keepDrafts();
		const s = server.find((o) => o.id === id) ?? null;
		open(s);
		say(s ? 'Back to the saved version.' : 'Draft thrown away.');
	}
	async function move(o: Opening, d: -1 | 1) {
		const list = heroOps, k = list.findIndex((x) => x.id === o.id), j = k + d;
		if (k < 0 || j < 0 || j >= list.length) return;
		const a = { ...list[k], order: list[j].order }, b = { ...list[j], order: list[k].order };
		if (a.order === b.order) { a.order = j; b.order = k; }
		for (const x of [a, b]) { if (unsaved(x.id)) { drafts = { ...drafts, [x.id]: x }; } else await save(x); }
		keepDrafts();
		if (cur?.id === a.id) cur = a; else if (cur?.id === b.id) cur = b;
	}

	// ── the tools ──
	let tool: Tool = 'step';
	let turn: Turn = 1;
	let color: string = 'green';
	let alt = false;
	let taken = false;
	let stay = false;
	let areaStyle: 'fill' | 'outline' | 'both' = 'both';
	let unit: 'enemy' | 'ally' = 'enemy';
	let unitHero = '';
	let text = '';
	let token = '';
	let areaId: string | null = null;
	let arrowFrom: string | null = null;
	let picked: string | null = null;
	let preview = 0;
	let bview: OpeningBoard | null = null;
	let turned = false;
	const TOOLS: { k: Tool; label: string; hint: string; unit?: 'enemy' | 'ally' }[] = [
		{ k: 'step', label: 'Turn chip', hint: 'Tap a space: a chip for this turn in the card’s colour. Again = off; another colour = either card (hybrid).' },
		{ k: 'ring', label: 'Ring', hint: 'Ring a minion (the one you take) or a space. “Taken”: that minion fades from this turn on.' },
		{ k: 'arrow', label: 'Arrow', hint: 'Tap where it starts, then where it goes.' },
		{ k: 'area', label: 'Area', hint: 'Tap spaces to shade them; tap again to unshade. “New area” starts another.' },
		{ k: 'unit', unit: 'enemy', label: 'Enemy (E)', hint: 'An enemy hero — the E disc, or pick the hero for its token. Tap again to remove.' },
		{ k: 'unit', unit: 'ally', label: 'Ally (A)', hint: 'An allied hero — the A disc, or pick the hero for its token. Tap again to remove.' },
		{ k: 'label', label: 'Label', hint: 'Type the text, then tap a space (e.g. “Start”). Tap again to remove.' },
		{ k: 'token', label: 'Token', hint: 'One of the hero’s own tokens.' },
		{ k: 'start', label: 'Start', hint: 'Where the hero spawns (its token stands there before turn 1).' },
		{ k: 'erase', label: 'Eraser', hint: 'Tap a space to clear everything on it.' },
		{ k: 'pick', label: 'Pick', hint: 'Tap a space to pick a mark on it (again = the next one), then change or delete it.' }
	];
	$: toolHint = arrowFrom ? 'Now tap where the arrow goes (the same space cancels).' : TOOLS.find((t) => t.k === tool && (!t.unit || t.unit === unit))?.hint ?? '';
	$: curIdx = cur ? heroOps.findIndex((o) => o.id === cur?.id) : -1;
	$: kit = HERO_KIT[heroId] ?? [];
	$: if (tool === 'token' && !kit.includes(token)) token = kit[0] ?? '';
	$: if (tool !== 'arrow') arrowFrom = null;
	$: if (tool !== 'area') areaId = null;
	$: if (tool !== 'pick') picked = null;
	function setTurn(t: Turn) {
		turn = t;
		const c = cur && t ? cur.turns[t - 1]?.cards[0] : undefined;
		if (c && (tool === 'step' || tool === 'ring' || tool === 'arrow')) color = c;
	}
	$: chipColors = tool === 'step' ? (CARD_COLORS as string[]) : [...CARD_COLORS, 'white', 'black'];
	$: if (tool === 'step' && !(CARD_COLORS as string[]).includes(color)) color = 'green';
	function onHex(hex: string) {
		if (!cur) return;
		const o: ToolOpts = { turn, color, alt, taken, stay, areaStyle, unit, unitHero, text, token, areaId, arrowFrom, picked };
		const r = applyTool(cur, tool, hex, o);
		areaId = r.areaId; arrowFrom = r.arrowFrom; picked = r.picked;
		if (r.changed) edit(r.op);
	}
	$: pickedMark = cur && picked ? cur.marks.find((m) => m.id === picked) ?? null : null;
	function changeMark(id: string, p: Partial<Mark>) { if (cur) edit({ ...cur, marks: cur.marks.map((m) => (m.id === id ? ({ ...m, ...p } as Mark) : m)) }); }
	function dropMark(id: string) { if (cur) { edit({ ...cur, marks: cur.marks.filter((m) => m.id !== id) }); if (picked === id) picked = null; } }
	function clearAll() { if (cur && cur.marks.length && confirm('Clear every mark on this opening?')) edit({ ...cur, marks: [] }); }
	function setSide(s: Side) { if (cur && cur.side !== s) edit(onSide(cur, s)); }
	function toggleCard(t: number, c: CardColor) {
		if (!cur) return;
		const turns = cur.turns.map((x, k) => (k !== t ? x : { ...x, cards: x.cards.includes(c) ? x.cards.filter((y) => y !== c) : [...x.cards, c] }));
		patch({ turns });
	}
	function setNote(t: number, note: string) { if (cur) patch({ turns: cur.turns.map((x, k) => (k === t ? { ...x, note } : x)) }); }
	const hname = (id: string) => heroById(id)?.name ?? id;
	$: spawnHint = cur && !cur.start ? `Set the Start: one of the ${cur.side === 'orange' ? 'Atlantean' : 'Titan'} spawn points.` : '';
	$: startOk = !cur?.start || spawnsOf(cur.side).includes(cur.start);

	// ── the guide (the hero page's Overview) ──
	let g: HeroGuide = blankGuide(heroId);
	let gFor = '';
	$: if (gFor !== heroId || !ready) { gFor = heroId; g = structuredClone(guides[heroId] ?? blankGuide(heroId)); gDirty = false; }
	let gDirty = false;
	const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
	function gset(p: Partial<HeroGuide>) { g = { ...g, ...p }; gDirty = true; }
	function toggleIn<T>(list: T[], x: T) { return list.includes(x) ? list.filter((y) => y !== x) : [...list, x]; }
	function cycleTag(t: GuideTag) { const v = g.tags[t]; const tags = { ...g.tags }; if (!v) tags[t] = 1; else if (v === 1) tags[t] = 2; else delete tags[t]; gset({ tags }); }
	let muPick: 'strong' | 'weak' | 'partners' = 'strong';
	async function storeGuide() {
		const err = await saveGuide(g);
		if (err) { say(err); return; }
		guides = { ...guides, [g.hero]: { ...g, updatedAt: Date.now() } };
		gDirty = false;
		say('Guide saved.');
	}

	// ── keys: 1–4 = the turn, 0 = always, Ctrl+Z / Ctrl+Y, Esc = drop the arrow / area / pick ──
	function key(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.closest?.('input, textarea, select') || mode !== 'openings') return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
		if (e.key === 'Escape') { arrowFrom = null; areaId = null; picked = null; return; }
		if (/^[0-4]$/.test(e.key)) setTurn(+e.key as Turn);
		if (e.key === 'Delete' && picked) dropMark(picked);
	}

	async function boot() {
		const r = await loadOpenings();
		status = r.status; loadErr = r.error;
		server = r.openings;
		guides = r.guides;
		gFor = ''; // re-read the guide now that the saved ones are in
		const q = new URLSearchParams(location.search);
		const want = q.get('id');
		// (the reactive lists haven't caught up inside this async function: work them out here)
		const mine = sortOpenings([...server.filter((o) => o.hero === heroId && !drafts[o.id]), ...Object.values(drafts).filter((o) => o.hero === heroId)]);
		if (q.get('new') === '1') newOpening(mine);
		else open(mine.find((o) => o.id === want) ?? mine[0] ?? null);
	}
	function sync() { try { const q = new URL(location.href); q.searchParams.set('hero', heroId); q.searchParams.delete('new'); if (cur) q.searchParams.set('id', cur.id); else q.searchParams.delete('id'); history.replaceState(history.state, '', q); } catch { /* ignore */ } }
	$: if (ready) { heroId; cur?.id; sync(); }
	function setHero(id: string) { heroId = id; open(sortOpenings(merged.filter((o) => o.hero === id))[0] ?? null); }
	onMount(() => {
		const q = new URLSearchParams(location.search);
		const h = q.get('hero');
		if (h && HEROES_ALPHA.some((x) => x.id === h)) heroId = h;
		ready = true;
		if ($role === 'admin') void boot();
	});
	let sqlShown = false;
	async function copySql() { try { await navigator.clipboard.writeText(OPENINGS_SQL); say('SQL copied.'); } catch { sqlShown = true; } }
</script>

<svelte:head><title>GoA2 · Opening builder</title></svelte:head>
<svelte:window on:keydown={key} />

<div class="ob tide">
	{#if $role !== 'admin'}
		<section class="lock"><h1>Opening builder</h1><p>GMs only.</p><a href={base + '/'}>Back</a></section>
	{:else}
		<header class="bar">
			<a class="ib" href={base + '/?at=adminhub'} on:click|preventDefault={() => goBack('adminhub')} aria-label="Back"><Icon name="back" /></a>
			<span class="ttl">Opening builder</span>
			<label class="pick"><span class="face" style={portraitCss(heroId)}></span>
				<select value={heroId} on:change={(e) => setHero(e.currentTarget.value)}>{#each HEROES_ALPHA as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select>
			</label>
			<span class="seg"><button class:on={mode === 'openings'} on:click={() => (mode = 'openings')}>Openings</button><button class:on={mode === 'guide'} on:click={() => (mode = 'guide')}>Guide{#if gDirty}<i>•</i>{/if}</button></span>
			<a class="lnk" href="{base}/heroes?hero={heroId}&tab={mode === 'guide' ? 'overview' : 'openings'}">See the hero page <Icon name="go" /></a>
			<span class="msg" class:on={!!msg}>{msg}</span>
		</header>

		{#if status === 'missing' || status === 'error'}
			<div class="warn">
				{#if status === 'missing'}The openings table isn't in Supabase yet — your work is kept in this browser until it is. Run this once in the Supabase SQL editor:
				{:else}Couldn't read the openings ({loadErr}). Your work is kept in this browser.{/if}
				{#if status === 'missing'}<button on:click={copySql}><Icon name="copy" /> Copy the SQL</button>{/if}
				{#if sqlShown}<pre>{OPENINGS_SQL}</pre>{/if}
			</div>
		{/if}

		{#if mode === 'openings'}
			<!-- ───── left: the hero's openings + the one being edited ───── -->
			<aside class="left">
				<div class="list">
					<div class="lh"><b>{hname(heroId)}'s openings · {heroOps.length}</b><button class="sm pri" on:click={() => newOpening()}><Icon name="plus" /> New</button></div>
					<!-- one dropdown, however many openings there are (the panel never grows) -->
					<div class="pickrow">
						<select value={cur?.id ?? ''} on:change={(e) => open(heroOps.find((o) => o.id === e.currentTarget.value) ?? null)} disabled={!heroOps.length}>
							{#if !heroOps.length}<option value="">None yet</option>{/if}
							{#if cur && !heroOps.some((o) => o.id === cur?.id)}<option value={cur.id}>{cur.name}</option>{/if}
							{#each heroOps as o, k (o.id)}<option value={o.id}>{k + 1}. {o.name}{unsaved(o.id) ? '  ●' : ''}</option>{/each}
						</select>
						{#if cur && curIdx >= 0}
							<button class="mv" disabled={curIdx === 0} on:click={() => cur && move(cur, -1)} aria-label="Move up the list" title="Earlier in the list">▲</button>
							<button class="mv" disabled={curIdx === heroOps.length - 1} on:click={() => cur && move(cur, 1)} aria-label="Move down the list" title="Later in the list">▼</button>
						{/if}
					</div>
					{#if otherOps.length}
						<label class="copyfrom">Copy from another hero
							<select value="" on:change={(e) => { const s = otherOps.find((o) => o.id === e.currentTarget.value); if (s) duplicate(s); e.currentTarget.value = ''; }}>
								<option value="">Pick an opening…</option>
								{#each otherOps as o (o.id)}<option value={o.id}>{hname(o.hero)} · {o.name}</option>{/each}
							</select>
						</label>
					{/if}
				</div>

				{#if cur}
					<div class="form">
						<label>Name<input value={cur.name} maxlength="40" on:input={(e) => patch({ name: e.currentTarget.value })} /></label>
						<div class="row2">
							<span class="fl">Built on</span>
							<span class="seg sm2"><button class:on={cur.side === 'orange'} class="o" on:click={() => setSide('orange')}>Atlanteans</button><button class:on={cur.side === 'blue'} class="b" on:click={() => setSide('blue')}>Titans</button></span>
						</div>
						<div class="row2">
							<span class="fl">Size</span>
							<span class="seg sm2">{#each Object.entries(SIZES) as [k, l] (k)}<button class:on={cur.size === k} on:click={() => patch({ size: k as Opening['size'] })}>{l}</button>{/each}</span>
						</div>
						<div class="row2">
							<span class="fl">Minion</span>
							<span class="seg sm2">{#each Object.entries(LANES) as [k, l] (k)}<button class:on={cur.lane === k} on:click={() => patch({ lane: k as Opening['lane'] })}>{l}</button>{/each}</span>
						</div>
						<label>Goal &amp; notes<textarea rows="4" value={cur.goal} maxlength="1200" on:input={(e) => patch({ goal: e.currentTarget.value })} placeholder="The goal of this opening is to…"></textarea></label>
						<div class="turns">
							{#each cur.turns as t, k (k)}
								<div class="trow">
									<span class="tl">Turn {k + 1}</span>
									<span class="cc">{#each CARD_COLORS as c (c)}{@const at = t.cards.indexOf(c)}<button class="cdot" class:on={at >= 0} style="--c:{CARD_HEX[c]}" title={CARD_NAME[c]} on:click={() => toggleCard(k, c)}>{at >= 0 && t.cards.length > 1 ? at + 1 : ''}</button>{/each}</span>
									<input class="note" value={t.note} maxlength="300" placeholder={turnCards(t) === '—' ? 'Pick the card(s), add a note' : 'Note (optional)'} on:input={(e) => setNote(k, e.currentTarget.value)} />
								</div>
							{/each}
						</div>
						<div class="acts">
							<button class="sm pri" disabled={saving || !unsaved(cur.id)} on:click={() => save()}>{saving ? 'Saving…' : unsaved(cur.id) ? 'Save' : 'Saved'}</button>
							<button class="sm" on:click={() => cur && duplicate(cur)}><Icon name="copy" /> Duplicate</button>
							{#if unsaved(cur.id)}<button class="sm" on:click={discard}>Discard changes</button>{/if}
							<button class="sm bad" on:click={remove}>{delArm ? 'Tap again' : 'Delete'}</button>
						</div>
					</div>
				{/if}
			</aside>

			<!-- ───── middle: the board ───── -->
			<section class="mid">
				{#if cur}
					{#key cur.id}
						<OpeningBoard bind:this={bview} op={cur} step={preview} {turned} heroMode={preview === 0 ? 'start' : 'step'} interactive placing {onHex} {picked} uid="ob"
							extra={arrowFrom ? [{ id: 'tmp', kind: 'ring', hex: arrowFrom, turn: 0, color: 'white' }] : []} inset={{ t: 60, b: 50, l: 10, r: 10 }} effects={false} />
					{/key}
					<div class="btop">
						<span class="seg"><button class:on={preview === 0} on:click={() => (preview = 0)}>All</button>{#each [1, 2, 3, 4] as s (s)}<button class:on={preview === s} on:click={() => (preview = s)}>Turn {s}</button>{/each}</span>
						<button class="cb" class:on={turned} on:click={() => (turned = !turned)} title="View from the other end"><Icon name="turn" /></button>
						<button class="cb" on:click={() => bview?.zoomBtn(1.25)} title="Zoom in"><Icon name="plus" /></button>
						<button class="cb" on:click={() => bview?.zoomBtn(0.8)} title="Zoom out"><Icon name="minus" /></button>
						<button class="cb" on:click={() => bview?.reset()} title="Recentre"><Icon name="target" /></button>
						<button class="cb" disabled={!past.length} on:click={undo} title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
						<button class="cb" disabled={!future.length} on:click={redo} title="Redo (Ctrl+Y)"><Icon name="redo" /></button>
						<button class="cb" disabled={!cur.marks.length} on:click={clearAll} title="Clear every mark"><Icon name="trash" /></button>
					</div>
					<div class="hint">{#if spawnHint}<b>{spawnHint}</b>&nbsp; {/if}{#if !startOk}<b>The start isn't one of this side's spawn points.</b>&nbsp; {/if}{toolHint}{#if preview}<em> · showing turn {preview}: later marks are hidden</em>{/if}</div>
				{:else}
					<div class="none"><p>Pick an opening on the left, or start a new one.</p><button class="sm pri" on:click={() => newOpening()}><Icon name="plus" /> New opening</button></div>
				{/if}
			</section>

			<!-- ───── right: the tools ───── -->
			<aside class="right">
				<div class="tools">
					{#each TOOLS as t (t.label)}<button class:on={tool === t.k && (!t.unit || t.unit === unit)} class:e={t.unit === 'enemy'} class:a={t.unit === 'ally'} disabled={t.k === 'token' && !kit.length} on:click={() => { tool = t.k; if (t.unit) unit = t.unit; }}>{t.label}</button>{/each}
				</div>
				{#if tool !== 'erase' && tool !== 'pick' && tool !== 'start'}
					<div class="opt">
						<span class="fl">Turn</span>
						<span class="seg sm2">{#if tool !== 'step'}<button class:on={turn === 0} on:click={() => setTurn(0)} title="Shown at every turn">Always</button>{/if}{#each [1, 2, 3, 4] as s (s)}<button class:on={turn === s || (tool === 'step' && turn === 0 && s === 1)} on:click={() => setTurn(s as Turn)}>T{s}</button>{/each}</span>
					</div>
					{#if tool === 'step' || tool === 'ring' || tool === 'arrow' || tool === 'area'}
						<div class="opt">
							<span class="fl">Colour</span>
							<span class="sw">{#each chipColors as c (c)}<button class="cdot" class:on={color === c} style="--c:{MARK_HEX[c]}" title={c} on:click={() => (color = c)}></button>{/each}</span>
						</div>
					{/if}
					<label class="opt chk"><input type="checkbox" bind:checked={alt} /> Alternative (dimmed)</label>
				{/if}
				{#if tool === 'step'}
					<div class="opt"><span class="fl">Hero</span><span class="seg sm2"><button class:on={!stay} on:click={() => (stay = false)} title="The hero moves to this space">Moves here</button><button class:on={stay} on:click={() => (stay = true)} title="The hero stays where it is (an attack or a skill aimed here) — dashed rim">Stays</button></span></div>
				{/if}
				{#if tool === 'step'}<label class="opt">Chip text <input bind:value={text} maxlength="5" placeholder="T{turn || 1}" /></label>{/if}
				{#if tool === 'ring'}<label class="opt chk"><input type="checkbox" bind:checked={taken} /> Taken (the minion fades from this turn)</label>{/if}
				{#if tool === 'area'}
					<div class="opt"><span class="fl">Look</span><span class="seg sm2">{#each [['both', 'Shade + edge'], ['fill', 'Shade'], ['outline', 'Edge']] as [k, l] (k)}<button class:on={areaStyle === k} on:click={() => (areaStyle = k as typeof areaStyle)}>{l}</button>{/each}</span></div>
					<button class="sm" on:click={() => (areaId = null)} disabled={!areaId}>New area</button>
				{/if}
				{#if tool === 'unit'}
					<label class="opt">Token<select bind:value={unitHero}><option value="">Letter ({unit === 'enemy' ? 'E' : 'A'})</option>{#each HEROES_ALPHA as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
				{/if}
				{#if tool === 'label'}<label class="opt">Text <input bind:value={text} maxlength="18" placeholder="Start" /></label>{/if}
				{#if tool === 'token'}
					<div class="opt kit">{#each kit as k (k)}<button class:on={token === k} on:click={() => (token = k)}>{k === 'companion' ? COMPANIONS[heroId] ?? 'Companion' : tokenName(k)}</button>{/each}</div>
				{/if}

				{#if pickedMark}
					<div class="picked">
						<b>{markLabel(pickedMark, hname)}</b>
						<span class="seg sm2">{#if pickedMark.kind !== 'step'}<button class:on={pickedMark.turn === 0} on:click={() => pickedMark && changeMark(pickedMark.id, { turn: 0 })}>Always</button>{/if}{#each [1, 2, 3, 4] as s (s)}<button class:on={pickedMark.turn === s} on:click={() => pickedMark && changeMark(pickedMark.id, { turn: s as Turn })}>T{s}</button>{/each}</span>
						{#if pickedMark.kind === 'step'}
							<span class="sw">{#each CARD_COLORS as c (c)}<button class="cdot" class:on={pickedMark.color === c} style="--c:{CARD_HEX[c]}" title={c} on:click={() => pickedMark && changeMark(pickedMark.id, { color: c, ...(pickedMark.color2 === c ? { color2: undefined } : {}) })}></button>{/each}</span>
							<span class="sw"><span class="fl">or</span><button class="cdot none" class:on={!pickedMark.color2} title="One colour" on:click={() => pickedMark && changeMark(pickedMark.id, { color2: undefined })}></button>{#each CARD_COLORS as c (c)}{#if c !== pickedMark.color}<button class="cdot" class:on={pickedMark.color2 === c} style="--c:{CARD_HEX[c]}" title="or {c}" on:click={() => pickedMark && changeMark(pickedMark.id, { color2: c })}></button>{/if}{/each}</span>
							<span class="seg sm2"><button class:on={!pickedMark.stay} on:click={() => pickedMark && changeMark(pickedMark.id, { stay: undefined })}>Moves here</button><button class:on={!!pickedMark.stay} on:click={() => pickedMark && changeMark(pickedMark.id, { stay: true })}>Stays</button></span>
						{:else if pickedMark.kind === 'ring' || pickedMark.kind === 'arrow' || pickedMark.kind === 'area'}
							<span class="sw">{#each [...CARD_COLORS, 'white', 'black'] as c (c)}<button class="cdot" class:on={pickedMark.color === c} style="--c:{MARK_HEX[c]}" title={c} on:click={() => pickedMark && changeMark(pickedMark.id, { color: c })}></button>{/each}</span>
						{/if}
						<label class="chk"><input type="checkbox" checked={!!pickedMark.alt} on:change={(e) => pickedMark && changeMark(pickedMark.id, { alt: e.currentTarget.checked || undefined })} /> Alternative</label>
						{#if pickedMark.kind === 'ring'}<label class="chk"><input type="checkbox" checked={!!pickedMark.taken} on:change={(e) => pickedMark && changeMark(pickedMark.id, { taken: e.currentTarget.checked || undefined })} /> Taken</label>{/if}
						<button class="sm bad" on:click={() => picked && dropMark(picked)}>Delete mark</button>
					</div>
				{/if}

				{#if cur}
					<div class="marks">
						<span class="fl">Marks · {cur.marks.length}</span>
						{#each [...cur.marks].sort((a, b) => a.turn - b.turn) as m (m.id)}
							<div class="mrow" class:on={picked === m.id}>
								<button class="mlab" on:click={() => { tool = 'pick'; picked = m.id; }}>{#if m.kind === 'step'}<i style:background={CARD_HEX[m.color]}></i>{:else if 'color' in m}<i style:background={MARK_HEX[m.color] ?? m.color}></i>{/if}{markLabel(m, hname)}</button>
								<button class="mx" on:click={() => dropMark(m.id)} aria-label="Delete">×</button>
							</div>
						{/each}
					</div>
				{/if}
			</aside>
		{:else}
			<!-- ───── the guide ───── -->
			<section class="guide">
				<div class="gcol">
					<label>Overview<textarea rows="7" value={g.overview} maxlength="2000" on:input={(e) => gset({ overview: e.currentTarget.value })} placeholder="How the hero plays, what it's good at, how to get the most out of it…"></textarea></label>
					<div class="g2">
						<label>Strengths <small>one per line</small><textarea rows="5" value={g.strengths.join('\n')} on:input={(e) => gset({ strengths: lines(e.currentTarget.value) })}></textarea></label>
						<label>Weaknesses <small>one per line</small><textarea rows="5" value={g.weaknesses.join('\n')} on:input={(e) => gset({ weaknesses: lines(e.currentTarget.value) })}></textarea></label>
					</div>
					<div class="opt"><span class="fl">Preferred minions</span><span class="kit">{#each Object.entries(MINION_PREFS) as [k, l] (k)}<button class:on={g.minions.includes(k as MinionPref)} on:click={() => gset({ minions: toggleIn(g.minions, k as MinionPref) })}>{l}</button>{/each}</span></div>
					<div class="opt"><span class="fl">Tags <small>tap: round 1 → round 2+ → off</small></span><span class="kit">{#each GUIDE_TAGS as t (t)}<button class="tagb" class:on={!!g.tags[t]} class:later={g.tags[t] === 2} on:click={() => cycleTag(t)}>{t}{g.tags[t] === 2 ? ' (R2+)' : ''}</button>{/each}</span></div>
				</div>
				<div class="gcol">
					<span class="fl">Matchups</span>
					<span class="seg sm2">{#each [['strong', 'Strong against'], ['weak', 'Struggles against'], ['partners', 'Best with']] as [k, l] (k)}<button class:on={muPick === k} on:click={() => (muPick = k as typeof muPick)}>{l} · {g[k as 'strong' | 'weak' | 'partners'].length}</button>{/each}</span>
					<div class="heroes">
						{#each HEROES_ALPHA.filter((x) => x.id !== heroId) as x (x.id)}
							<button class="hb" class:on={g[muPick].includes(x.id)} on:click={() => gset({ [muPick]: toggleIn(g[muPick], x.id) })} title={x.name}><span class="face" style={portraitCss(x.id)}></span><small>{x.name}</small></button>
						{/each}
					</div>
					<div class="acts"><button class="sm pri" disabled={!gDirty} on:click={storeGuide}>{gDirty ? 'Save guide' : 'Saved'}</button>{#if gDirty}<button class="sm" on:click={() => { gFor = ''; }}>Discard</button>{/if}</div>
				</div>
			</section>
		{/if}
	{/if}
</div>

<style>
	.ob { position: fixed; inset: 0; display: grid; grid-template-columns: 320px minmax(0, 1fr) 290px; grid-template-rows: 52px auto minmax(0, 1fr); color: var(--ink); background: var(--abyss); font-size: 14px; }
	button { font: inherit; color: inherit; cursor: pointer; }
	button:disabled { opacity: 0.4; cursor: default; }
	input, textarea, select { font: inherit; font-size: 14px; color: var(--ink); background: rgba(0, 0, 0, 0.3); border: 1px solid var(--hair); border-radius: 8px; padding: 6px 9px; outline: 0; box-sizing: border-box; }
	input:focus, textarea:focus { border-color: var(--brass); }
	textarea { width: 100%; resize: vertical; line-height: 1.4; }
	select option { color: #0b1220; }
	.fl { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--brass-hi); }
	.fl small, label small { text-transform: none; letter-spacing: 0; color: var(--ink-3); font-size: 11px; }
	.bar { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 0 14px; background: rgba(3, 10, 20, 0.92); border-bottom: 1px solid var(--brass-line); }
	.ib { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--hair); color: var(--ink-2); }
	.ttl { font-size: 13px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass-hi); }
	.pick { display: flex; align-items: center; gap: 8px; }
	.face { display: inline-block; width: 30px; height: 30px; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--brass-line); flex: none; }
	.lnk { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--ink-2); }
	.lnk :global(svg) { width: 14px; height: 14px; }
	.msg { margin-left: auto; font-size: 13px; color: var(--brass-hi); opacity: 0; transition: opacity 0.2s; }
	.msg.on { opacity: 1; }
	.seg { display: inline-flex; flex-wrap: wrap; gap: 3px; padding: 3px; border-radius: 10px; background: rgba(0, 0, 0, 0.3); border: 1px solid var(--hair); }
	.seg button { padding: 5px 11px; border: 0; border-radius: 7px; background: none; color: var(--ink-2); font-size: 13px; }
	.seg button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.seg button.on.o { color: #fff; background: var(--orange); }
	.seg button.on.b { color: #fff; background: var(--blue); }
	.seg i { font-style: normal; color: var(--orange-hi); margin-left: 3px; }
	.sm2 button { padding: 4px 8px; font-size: 12px; }
	.sm { display: inline-flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 9px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.04); font-size: 13px; }
	.sm :global(svg) { width: 14px; height: 14px; }
	.sm.pri { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.sm.bad { color: #fecaca; border-color: rgba(239, 68, 68, 0.5); }
	.warn { grid-column: 1 / -1; padding: 10px 16px; font-size: 13px; color: #fde68a; background: rgba(120, 80, 10, 0.35); border-bottom: 1px solid rgba(250, 204, 21, 0.3); display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
	.warn button { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(250, 204, 21, 0.5); background: none; color: #fde68a; }
	.warn pre { width: 100%; margin: 0; padding: 8px; font-size: 11px; white-space: pre-wrap; background: rgba(0, 0, 0, 0.4); border-radius: 8px; user-select: all; }

	.left, .right { grid-row: 3; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 12px; display: flex; flex-direction: column; gap: 12px; background: rgba(6, 21, 38, 0.92); }
	.left { grid-column: 1; border-right: 1px solid var(--hair); }
	.right { grid-column: 3; border-left: 1px solid var(--hair); }
	.mid { grid-column: 2; grid-row: 3; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
	.list { display: flex; flex-direction: column; gap: 4px; }
	.lh { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
	.lh b { font-weight: 400; color: #fff; }
	.pickrow { display: flex; align-items: center; gap: 4px; }
	.pickrow select { flex: 1; min-width: 0; }
	.mv { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--ink-3); font-size: 10px; }
	.copyfrom { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; font-size: 12px; color: var(--ink-3); }
	.form { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; border-top: 1px solid var(--hair); }
	.form label, .opt { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-3); }
	.row2 { display: flex; flex-direction: column; gap: 5px; }
	.turns { display: flex; flex-direction: column; gap: 7px; }
	.trow { display: grid; grid-template-columns: 56px 1fr; gap: 4px 8px; align-items: center; }
	.tl { font-size: 12px; color: var(--brass-hi); }
	.cc, .sw { display: flex; gap: 5px; flex-wrap: wrap; }
	.note { grid-column: 1 / -1; }
	.cdot { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.25); background: var(--c); opacity: 0.45; font-size: 11px; color: #fff; text-shadow: 0 1px 2px #000; }
	.cdot.on { opacity: 1; border-color: #fff; box-shadow: 0 0 0 2px var(--brass); }
	.cdot.none { background: repeating-linear-gradient(45deg, #2a3242 0 4px, #1a2030 4px 8px); }
	.acts { display: flex; flex-wrap: wrap; gap: 6px; }

	.btop { position: absolute; left: 10px; top: 10px; right: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; z-index: 2; pointer-events: none; }
	.btop > * { pointer-events: auto; }
	.btop .seg { background: rgba(3, 10, 20, 0.88); }
	.cb { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--hair); background: rgba(3, 10, 20, 0.88); color: var(--ink-2); }
	.cb.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.cb :global(svg) { width: 17px; height: 17px; }
	.hint { position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 2; padding: 8px 12px; border-radius: 10px; font-size: 13px; color: var(--ink-2); background: rgba(3, 10, 20, 0.88); border: 1px solid var(--hair); pointer-events: none; }
	.hint b { font-weight: 400; color: var(--orange-hi); }
	.hint em { font-style: normal; color: var(--ink-3); }
	.none { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--ink-2); }

	.tools { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
	.tools button { padding: 8px 6px; border-radius: 9px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.04); font-size: 13px; }
	.tools button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.opt.chk, .chk { flex-direction: row; align-items: center; gap: 7px; font-size: 13px; color: var(--ink-2); }
	.kit { display: flex; flex-wrap: wrap; gap: 5px; }
	.kit button { padding: 5px 10px; border-radius: 8px; border: 1px solid var(--hair); background: rgba(255, 255, 255, 0.04); font-size: 12px; text-transform: capitalize; }
	.kit button.on { color: var(--ink-dark); border-color: transparent; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.kit .tagb.on { color: #fff; background: #111318; border-color: #fff; }
	.kit .tagb.on.later { background: #6b7280; }
	.picked { display: flex; flex-direction: column; gap: 7px; padding: 10px; border-radius: 10px; border: 1px solid #fde047; background: rgba(253, 224, 71, 0.06); }
	.picked b { font-weight: 400; color: #fff; }
	.marks { display: flex; flex-direction: column; gap: 3px; }
	.mrow { display: flex; align-items: center; gap: 4px; border-radius: 7px; }
	.mrow.on { background: rgba(253, 224, 71, 0.1); }
	.mlab { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; padding: 4px 6px; border: 0; background: none; text-align: left; font-size: 12px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.mlab i { width: 10px; height: 10px; border-radius: 50%; flex: none; box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6); }
	.mx { width: 22px; height: 22px; padding: 0; border: 0; background: none; color: var(--ink-3); font-size: 15px; }
	.mx:hover { color: #ef4444; }

	.guide { grid-column: 1 / -1; grid-row: 3; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; padding: 18px 22px; }
	.gcol { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.gcol label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--ink-3); }
	.g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 6px; }
	.hb { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 2px; border-radius: 10px; border: 1px solid transparent; background: rgba(255, 255, 255, 0.03); opacity: 0.6; }
	.hb.on { opacity: 1; border-color: var(--brass); background: var(--brass-faint); }
	.hb .face { width: 40px; height: 40px; }
	.hb small { font-size: 11px; color: var(--ink-2); }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; }

	@media (max-width: 1100px) {
		.ob { grid-template-columns: 280px minmax(0, 1fr); grid-template-rows: 52px auto minmax(0, 1fr) auto; }
		.right { grid-column: 1 / -1; grid-row: 4; max-height: 40vh; border-left: 0; border-top: 1px solid var(--hair); }
	}
</style>
