<script lang="ts">
	// GAME REPLAY (GM tools, 2026-11-04, the user's ask): a recorded online game, step by step — the board on the LEFT,
	// what was played and what it did on the RIGHT (side by side, so a card and its move are seen together), the
	// timeline along the foot. ?game=<goa2_games id>. Steps come from $lib/replay (the recorder's board shots).
	import { onMount, tick } from 'svelte';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
	import { role } from '$lib/role';
	import { supabase } from '$lib/supabase';
	import BoardCanvas from '$lib/BoardCanvas.svelte';
	import Card from '$lib/cards/Card.svelte';
	import ReplayLayer from '$lib/hall/ReplayLayer.svelte';
	import { replayOf, stepLabel, type Replay, type Step, type TurnCard } from '$lib/replay';
	import type { ActItemKind } from '$lib/playbyplay';
	import { availableMaps, setPublished, type GameMap } from '$lib/maps';
	import { loadPublished } from '$lib/mapstore';
	import { throneHex, colorHex } from '$lib/match';
	import { heroById, heroLogo, portraitCss } from '$lib/heroes';
	import { heroCards } from '$lib/cards/deck';
	import { isMarkerArt } from '$lib/board/tokenArt';
	import { teamName, placeName } from '$lib/teams';
	import '$lib/hall/hall.css';

	type Row = { id: string; room: string | null; started_at: string; ended_at: string; winner: string | null; reason: string | null; rounds: number | null; data: Record<string, unknown> };
	let phase: 'loading' | 'locked' | 'missing' | 'old' | 'nomap' | 'error' | 'ready' = 'loading';
	let err = '';
	let row: Row | null = null;
	let rp: Replay | null = null;
	let map: GameMap | null = null;
	let at = 0;
	let board: BoardCanvas;

	const LANES = ['Orange Beach', 'Center', 'Blue Beach'];
	const CCOL: Record<string, string> = { RED: '#e2463a', BLUE: '#3d8bff', GREEN: '#3fbf63', GOLD: '#f2c14e', SILVER: '#d9dee6', PURPLE: '#a46bff' };
	const TEAMC: Record<string, string> = { orange: '#ef7d22', blue: '#2f7fe6' };

	onMount(async () => {
		if ($role !== 'admin') { phase = 'locked'; return; }
		const id = new URLSearchParams(location.search).get('game');
		if (!id) { phase = 'missing'; return; }
		try {
			const [{ data, error }, pub] = await Promise.all([
				supabase.from('goa2_games').select('id,room,started_at,ended_at,winner,reason,rounds,data').eq('id', id).single(),
				loadPublished().catch(() => null)
			]);
			if (error || !data) { phase = 'missing'; err = error?.message ?? ''; return; }
			row = data as Row;
			if (pub?.status === 'ready') setPublished(pub.maps);
			rp = replayOf(row.data);
			if (!rp) { phase = 'old'; return; }
			const mapId = String(row.data.mapId ?? '');
			map = availableMaps().find((m) => m.id === mapId)?.data ?? availableMaps().find((m) => m.label.toLowerCase() === 'forgotten island')?.data ?? null;
			if (!map) { phase = 'nomap'; return; }
			const k = Number(new URLSearchParams(location.search).get('step'));
			at = Number.isFinite(k) && k > 0 ? Math.min(k - 1, rp.steps.length - 1) : 0;
			phase = 'ready';
		} catch (e) { phase = 'error'; err = String(e); }
	});

	$: players = (rp?.st.players ?? {}) as Record<string, { name: string; hero: string; seat: number; team?: string; color?: string }>;
	$: pcs = rp?.st.pcs ?? {};
	$: step = rp ? rp.steps[at] : null;
	$: thrones = map ? (['orange', 'blue'] as const).map((t) => ({ hex: throneHex(map, t), team: t })).filter((t): t is { hex: string; team: 'orange' | 'blue' } => !!t.hex) : [];
	const heroOf = (pid: string) => players[pid]?.hero ?? pcs[pid]?.h ?? '';
	const heroName = (pid: string) => heroById(heroOf(pid))?.name ?? heroOf(pid);
	const userOf = (pid: string) => players[pid]?.name?.trim() || '?';
	const pcolor = (pid: string) => colorHex(players[pid]?.color ?? '');
	const teamOf = (pid: string) => (players[pid]?.team ?? pcs[pid]?.tm ?? '') as string;
	const colorOf = (id: string) => { const t = pcs[id]; if (!t) return '#fff'; if (t.k === 'hero') return pcolor(t.o ?? id); return TEAMC[t.tm] ?? '#d6b26a'; };
	const kindOf = (id: string) => pcs[id]?.k ?? 'token';

	$: pieces = step ? Object.entries(step.p).map(([id, hex]) => {
		const t = pcs[id] ?? { k: 'token', tm: 'neutral' };
		if (t.k === 'hero') { const h = t.h ?? heroOf(id); return { id, hex, team: t.tm, hero: h, sym: heroLogo(h), label: heroById(h)?.name?.[0] ?? '?', color: pcolor(t.o ?? id), locked: true, name: `${heroById(h)?.name ?? h} (${userOf(t.o ?? id)})` }; }
		if (t.k === 'minion') return { id, hex, team: t.tm, role: t.ro ?? 'melee', locked: true };
		const comp = t.tk?.startsWith('companion:');
		const rider = t.tk && isMarkerArt(t.tk) ? Object.entries(step.p).find(([o, h]) => h === hex && pcs[o]?.k === 'hero')?.[0] : undefined;
		return { id, hex, team: t.tm, token: comp ? undefined : t.tk, letter: comp ? (t.tk!.slice(10)[0] ?? '?').toUpperCase() : undefined, color: t.o ? pcolor(t.o) : undefined, attachTo: rider, locked: true };
	}) : [];
	$: zone = step ? LANES[step.score.lane] ?? 'Center' : 'Center';

	// ── playback ──
	let timer: ReturnType<typeof setInterval> | null = null;
	let speed = 1;
	const go = (i: number) => { if (!rp) return; at = Math.max(0, Math.min(rp.steps.length - 1, i)); };
	const stop = () => { if (timer) clearInterval(timer); timer = null; };
	function play() {
		if (timer) return stop();
		if (rp && at >= rp.steps.length - 1) go(0);
		timer = setInterval(() => { if (!rp || at >= rp.steps.length - 1) return stop(); go(at + 1); }, 2200 / speed);
	}
	const setSpeed = (s: number) => { speed = s; if (timer) { stop(); play(); } };
	function turnJump(dir: 1 | -1) {
		if (!rp) return;
		const key = (s: Step) => `${s.r}-${s.kind === 'battle' || s.kind === 'level' ? 9 : s.t}`;
		const here = key(rp.steps[at]);
		let i = at;
		if (dir > 0) { while (i < rp.steps.length - 1 && key(rp.steps[i]) === here) i++; }
		else {
			while (i > 0 && key(rp.steps[i]) === here) i--; // into the turn before
			const prev = key(rp.steps[i]);
			while (i > 0 && key(rp.steps[i - 1]) === prev) i--; // its first step
		}
		go(i);
	}
	function onKey(e: KeyboardEvent) {
		if (phase !== 'ready' || (e.target as HTMLElement)?.closest('input, textarea')) return;
		if (e.key === 'ArrowRight') { stop(); go(at + 1); e.preventDefault(); }
		else if (e.key === 'ArrowLeft') { stop(); go(at - 1); e.preventDefault(); }
		else if (e.key === 'ArrowUp') { stop(); turnJump(-1); e.preventDefault(); }
		else if (e.key === 'ArrowDown') { stop(); turnJump(1); e.preventDefault(); }
		else if (e.key === ' ') { play(); e.preventDefault(); }
		else if (e.key === 'Escape') preview = null;
	}
	// the tick in view
	let track: HTMLDivElement;
	$: if (track && phase === 'ready') tick().then(() => track?.querySelector('.tk.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));

	// ── the right column ──
	const ICON: Record<ActItemKind, [string, string]> = {
		kill: ['k', '☠'], hit: ['k', '⚔'], block: ['g', '🛡'], force: ['k', '!'], minion: ['m', '◆'], removed: ['m', '✕'], wave: ['p', '≋'],
		move: ['n', '→'], swap: ['n', '⇄'], spawn: ['g', '↓'], respawn: ['g', '↺'], off: ['k', '↑'], token: ['n', '◈'], tokenOff: ['n', '◇'],
		convert: ['m', '⇋'], disc: ['n', '▭'], fx: ['v', '★'], ace: ['k', 'A'], log: ['n', '·'], note: ['v', '✎']
	};
	$: items = step ? step.items.filter((x) => x.kind !== 'log' && x.kind !== 'note') : [];
	$: logs = step ? step.items.filter((x) => x.kind === 'log').map((x) => x.text.replace(/^log: /, '')) : [];
	$: notes = step ? step.items.filter((x) => x.kind === 'note').map((x) => x.text.replace(/^HOST NOTE: /, '')) : [];
	const tidy = (s: string) => s.replace(/ DEFEATED /, ' defeated ').replace(/: BLOCKED$/, ': blocked').replace(/ SWAPPED /, ' swapped ');
	let preview: TurnCard | null = null;
	const cardJson = (c: TurnCard | null) => (c && c.card != null ? heroCards(heroOf(c.pid))[c.card] : undefined);
	const actStepOf = (pid: string) => rp?.steps.find((s) => step && s.r === step.r && s.t === step.t && s.kind === 'act' && s.pid === pid)?.n ?? null;
	$: sides = (['orange', 'blue'] as const).map((t) => ({ t, ids: Object.keys(players).filter((id) => teamOf(id) === t).sort((a, b) => players[a].seat - players[b].seat) }));

	// ── the timeline ──
	type Group = { key: string; label: string; steps: Step[] };
	$: rounds = rp ? rp.rounds.map((r) => {
		const groups: Group[] = [];
		for (const s of rp!.steps) if (s.r === r) {
			const key = s.kind === 'battle' ? 'B' : s.kind === 'level' ? 'L' : `T${s.t}`;
			let g = groups.find((x) => x.key === key);
			if (!g) groups.push((g = { key, label: s.kind === 'battle' ? 'Battle' : s.kind === 'level' ? 'Lv' : `Turn ${s.t}`, steps: [] }));
			g.steps.push(s);
		}
		return { r, groups };
	}) : [];
	const mark = (s: Step) => { const k = new Set(s.items.map((x) => x.kind)); return k.has('kill') ? '☠' : k.has('wave') ? '≋' : k.has('block') ? '🛡' : k.has('respawn') ? '↺' : k.has('note') ? '✎' : ''; };
	const when = (t?: string) => (t ? new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
	let turned = false;
</script>

<svelte:window on:keydown={onKey} />
<svelte:head><title>Replay · GoA2</title></svelte:head>

<div class="hall rp">
	<header class="top">
		<button class="btn2" on:click={() => goBack('adminhub')}>← Back</button>
		<h1>Replay</h1>
		{#if row}
			<span class="meta">{row.room ?? ''} · {when(row.started_at)}{row.rounds ? ` · ${row.rounds} rounds` : ''}</span>
			<span class="vs">
				{#each sides as s, i (s.t)}
					{#if i === 1}<span class="meta">vs</span>{/if}
					<span class="tn t-{s.t}" class:won={row.winner === s.t}>{teamName(s.t)}{#if row.winner === s.t}<em>Won</em>{/if}</span>
					{#each s.ids as id (id)}<span class="face" style="--fs:28px; {portraitCss(heroOf(id))}; box-shadow: 0 0 0 2px {pcolor(id)}" title="{heroName(id)} · {userOf(id)}"></span>{/each}
				{/each}
			</span>
		{/if}
	</header>

	{#if phase === 'loading'}
		<p class="msg muted">Loading the game…</p>
	{:else if phase === 'locked'}
		<section class="card msg"><h3>GMs only</h3><p class="muted">Sign in as Admin to open replays.</p><a class="btn2" href={base + '/'}>Home</a></section>
	{:else if phase === 'missing'}
		<section class="card msg"><h3>Game not found</h3><p class="muted">Open a replay from the Hall of Records → Matches.{err ? ` (${err})` : ''}</p></section>
	{:else if phase === 'old'}
		<section class="card msg"><h3>No board for this game</h3><p class="muted">It was recorded before 12 October, when the board started being saved after every card. Its match report and play-by-play are in the Hall's Reports tab.</p></section>
	{:else if phase === 'nomap'}
		<section class="card msg"><h3>Map not found</h3><p class="muted">This game was played on a map that isn't bundled or published ({String(row?.data.mapId ?? '')}).</p></section>
	{:else if phase === 'error'}
		<section class="card msg"><h3>Couldn't load the game</h3><p class="muted">{err}</p></section>
	{:else if rp && step && map}
		<div class="main">
			<section class="boardcol">
				<div class="stage">
					<BoardCanvas bind:this={board} {map} look="island" {pieces} {thrones} glowZone={zone} activeZone={zone} rotation={turned ? 180 : 0} inset={{ t: 46, b: 8 }}>
						{#snippet over(c)}<ReplayLayer {step} size={c.size} at={c.at} rot={c.rot} {colorOf} {kindOf} />{/snippet}
					</BoardCanvas>
					<div class="cap">
						{#if step.kind === 'act' && step.pid}
							<span class="dot" style="background:{CCOL[step.card?.color ?? ''] ?? '#888'}"></span><b>{heroName(step.pid)}</b> · {step.card?.name || 'a card'}
						{:else}<b>{stepLabel(step).split(' · ').slice(1).join(' · ')}</b>{/if}
					</div>
					<div class="hud">
						{#each ['orange', 'blue'] as T (T)}
							<span class="lf t-{T}"><b>{teamName(T)}</b><span class="pips">{#each Array(rp.lifeMax) as _, k (k)}<i class:on={k < step.score.life[T as 'orange' | 'blue']}></i>{/each}</span></span>
						{/each}
						<span class="zl">{placeName(zone)} · waves <b>{step.score.waves}</b></span>
					</div>
					<div class="btools">
						<button class="btn2 sm" on:click={() => (turned = !turned)} title="Turn the board round">⟲ Turn</button>
						<button class="btn2 sm" on:click={() => board?.reset()} title="Recentre">◎</button>
					</div>
				</div>
			</section>

			<aside class="info">
				<div class="card head">
					<div class="stepno">Step {at + 1} of {rp.steps.length}</div>
					<h2>{stepLabel(step)}</h2>
					{#if step.kind === 'act' && step.pid && step.card}
						<button class="played" on:click={() => (preview = step.card)} title="Read the card">
							<span class="cf">{#if cardJson(step.card)}<Card heroId={heroOf(step.pid)} card={cardJson(step.card)!} />{/if}</span>
							<span class="pi">
								<span class="pname"><span class="face" style="--fs:30px; {portraitCss(heroOf(step.pid))}; box-shadow: 0 0 0 2px {pcolor(step.pid)}"></span><span><b>{heroName(step.pid)}</b><small>{userOf(step.pid)} · {teamName(teamOf(step.pid))}</small></span></span>
								<span class="cn"><span class="ini" style="background:{CCOL[step.card.color] ?? '#888'}">{step.card.ini ?? '–'}</span>{step.card.name}</span>
							</span>
						</button>
					{:else if step.kind === 'plan'}
						<p class="muted sm">{step.r === 1 && step.t === 1 ? 'The heroes take their places.' : 'Cards go down face down; the board before the reveal.'}</p>
					{:else if step.kind === 'battle'}
						<p class="muted sm">Battle zone: {placeName(zone)}. The side with fewer minions there removes the difference.</p>
					{:else}
						<p class="muted sm">Players spend their coins on upgrades.</p>
					{/if}
				</div>

				<div class="card">
					<h3 class="ch">Turn {step.t} · cards</h3>
					<div class="order">
						{#each step.order as o, k (o.pid)}
							{@const n = actStepOf(o.pid)}
							<div class="orow" class:now={step.kind === 'act' && step.pid === o.pid} class:done={step.kind !== 'plan' && (step.kind !== 'act' || k < step.pos)}>
								<span class="k">{k + 1}</span>
								<button class="oc" style="--c:{CCOL[o.color] ?? '#666'}" on:click={() => (preview = o)} title="Read {o.name}">
									<span class="ini">{o.ini ?? '–'}</span>
								</button>
								<button class="ow" on:click={() => n != null && (stop(), go(n))} disabled={n == null} title="Go to this card">
									<span class="face" style="--fs:24px; {portraitCss(heroOf(o.pid))}; box-shadow: 0 0 0 2px {pcolor(o.pid)}"></span>
									<span class="ot"><b>{heroName(o.pid)}</b><small>{o.name || '—'}</small></span>
								</button>
								<span class="pv" title="Level · coins">Lv <b>{step.score.lv[o.pid] ?? 1}</b> · {step.score.coins[o.pid] ?? 0}<i class="coin"></i></span>
							</div>
						{:else}<p class="muted sm">No cards recorded for this turn.</p>{/each}
					</div>
				</div>

				<div class="card story">
					<h3 class="ch">What happened</h3>
					{#if items.length}
						<ul class="evs">{#each items as it, i (i)}{@const ic = ICON[it.kind]}<li class:dim={it.kind === 'move'}><span class="ic {ic[0]}">{ic[1]}</span><span>{tidy(it.text)}</span></li>{/each}</ul>
					{:else}<p class="muted sm">Nothing changed on the board.</p>{/if}
					{#each notes as n, i (i)}<p class="note"><i>Host note</i>{n}</p>{/each}
					{#if logs.length}<div class="log">{#each logs as l, i (i)}<span>{l}</span>{/each}</div>{/if}
				</div>

			</aside>
		</div>

		<footer class="card tl">
			<div class="ctrl">
				<button class="cb" on:click={() => { stop(); go(0); }} aria-label="Start">⏮</button>
				<button class="cb" on:click={() => { stop(); turnJump(-1); }} aria-label="Turn back">«</button>
				<button class="cb" on:click={() => { stop(); go(at - 1); }} aria-label="Step back">‹</button>
				<button class="cb go" on:click={play}>{timer ? '❚❚ Pause' : '▶ Play'}</button>
				<button class="cb" on:click={() => { stop(); go(at + 1); }} aria-label="Step forward">›</button>
				<button class="cb" on:click={() => { stop(); turnJump(1); }} aria-label="Next turn">»</button>
				<span class="sp">{#each [1, 2, 4] as s (s)}<button class="cb" class:on={speed === s} on:click={() => setSpeed(s)}>{s}×</button>{/each}</span>
				<span class="hint">← → card · ↑ ↓ turn · Space play</span>
			</div>
			<div class="track" bind:this={track}>
				{#each rounds as rd (rd.r)}
					<div class="rnd">
						<span class="rl">Round {rd.r}</span>
						<div class="grp">
							{#each rd.groups as g (g.key)}
								<div class="g"><span class="gl">{g.label}</span><div class="tks">
									{#each g.steps as s (s.n)}
										{@const m = mark(s)}
										<button class="tk k-{s.kind}" class:cur={s.n === at} class:past={s.n < at} on:click={() => { stop(); go(s.n); }}
											title="{stepLabel(s)}{s.pid ? ` · ${heroName(s.pid)}` : ''}" style={s.pid ? `--pc:${pcolor(s.pid)}` : ''}>
											{#if s.pid}<span class="face" style="--fs:16px; {portraitCss(heroOf(s.pid))}"></span>{/if}
											{#if m}<span class="mk">{m}</span>{/if}
										</button>
									{/each}
								</div></div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</footer>
	{/if}

	{#if preview && cardJson(preview)}
		<div class="pvw" role="presentation" on:click={() => (preview = null)}>
			<div class="pvc"><Card heroId={heroOf(preview.pid)} card={cardJson(preview)!} /><p>{heroName(preview.pid)} · {userOf(preview.pid)}</p></div>
		</div>
	{/if}
</div>

<style>
	.rp { position: fixed; inset: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px max(12px, env(safe-area-inset-right, 0px)) max(10px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); overflow: hidden; }
	.top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; flex: none; }
	.top h1 { margin: 0; font-size: 20px; letter-spacing: .06em; color: var(--au); }
	.meta { color: var(--mu); font-size: 14px; }
	.vs { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.tn { font-family: 'Cinzel', Georgia, serif; font-weight: 700; font-size: 14px; margin-left: 6px; }
	.tn.t-orange { color: var(--or); } .tn.t-blue { color: #5b9cf0; }
	.tn em { font-style: normal; font-family: 'Alegreya Sans', sans-serif; font-size: 11px; color: var(--au); border: 1px solid var(--au); border-radius: 99px; padding: 0 6px; margin-left: 6px; vertical-align: 2px; }
	.face { display: inline-block; width: var(--fs); height: var(--fs); border-radius: 50%; flex: none; background-color: var(--p3); }
	.msg { margin: 40px auto; max-width: 520px; padding: 20px; }

	/* board LEFT, the story RIGHT — side by side on every landscape screen */
	.main { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 28vw, 400px); gap: 10px; }
	.boardcol { min-height: 0; min-width: 0; border-radius: 12px; overflow: hidden; border: 1px solid var(--ln); background: #071322; }
	.stage { position: relative; width: 100%; height: 100%; }
	.cap { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); max-width: calc(100% - 140px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 5px 14px; border-radius: 99px; background: rgba(10, 12, 16, .86); border: 1px solid var(--ln2); font-size: 15px; pointer-events: none; }
	.cap .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; vertical-align: 0; }
	.hud { position: absolute; left: 8px; bottom: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; max-width: calc(100% - 16px); padding: 6px 12px; border-radius: 10px; background: rgba(10, 12, 16, .86); border: 1px solid var(--ln2); font-size: 13px; color: var(--mu); pointer-events: none; }
	.hud .lf { display: inline-flex; align-items: center; gap: 6px; }
	.hud .lf b { font-weight: 600; } .hud .t-orange b { color: var(--or); } .hud .t-blue b { color: #5b9cf0; }
	.hud .zl b { color: var(--tx); }
	.btools { position: absolute; right: 8px; top: 8px; display: flex; gap: 6px; }
	.btn2.sm { padding: 4px 10px; font-size: 13px; }
	.info { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; }
	.info .card { padding: 12px 14px; }
	.info .ch { font-size: 13px; margin: 0 0 8px; color: var(--au); letter-spacing: .08em; text-transform: uppercase; }
	.stepno { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--mu2); }
	.head h2 { margin: 2px 0 8px; font-size: 18px; line-height: 1.25; text-wrap: balance; }
	.muted { color: var(--mu); } .sm { font-size: 14px; margin: 0; }
	.played { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 12px; align-items: center; width: 100%; text-align: left; padding: 8px; border-radius: 10px; border: 1px solid var(--ln2); background: var(--p2); color: inherit; cursor: zoom-in; }
	.played .cf { display: block; width: 92px; aspect-ratio: 1192 / 1664; }
	.played .cf :global(.cardface) { width: 100%; height: 100%; border-radius: 6px; }
	.pi { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
	.pname { display: flex; align-items: center; gap: 8px; }
	.pname b, .ot b { display: block; } .pname small, .ot small { display: block; color: var(--mu); font-size: 13px; }
	.cn { display: flex; align-items: center; gap: 8px; font-weight: 600; }
	.ini { display: inline-grid; place-items: center; width: 26px; height: 28px; clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); color: #0a0c10; font-weight: 800; font-size: 13px; }
	.order { display: flex; flex-direction: column; gap: 4px; }
	.orow { display: grid; grid-template-columns: 16px 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 3px 6px 3px 4px; border-radius: 8px; border: 1px solid transparent; }
	.orow.now { border-color: var(--au); background: rgba(243, 196, 84, .07); }
	.orow.done { opacity: .62; }
	.orow .k { color: var(--mu2); font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
	.oc { width: 30px; height: 32px; padding: 0; border: 0; background: none; cursor: zoom-in; }
	.oc .ini { width: 30px; height: 32px; background: var(--c); }
	.ow { display: flex; align-items: center; gap: 8px; min-width: 0; background: none; border: 0; color: inherit; text-align: left; padding: 0; cursor: pointer; }
	.ow:disabled { cursor: default; }
	.ot { min-width: 0; } .ot small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.evs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.evs li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; line-height: 1.35; font-size: 14.5px; }
	.evs li.dim { color: var(--mu); }
	.ic { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 12px; font-weight: 700; background: var(--p3); color: var(--mu); }
	.ic.k { background: rgba(239, 79, 92, .18); color: #ff8a92; } .ic.g { background: rgba(53, 208, 122, .16); color: #7fe0a8; }
	.ic.m { background: rgba(243, 196, 84, .14); color: var(--au); } .ic.p { background: rgba(243, 196, 84, .28); color: #ffe39a; } .ic.v { background: rgba(169, 120, 255, .18); color: #c9a6ff; }
	.note { margin: 10px 0 0; padding: 8px 10px; border-left: 3px solid var(--vi); background: rgba(169, 120, 255, .08); border-radius: 0 8px 8px 0; font-size: 14px; }
	.note i { display: block; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #c9a6ff; font-style: normal; }
	.log { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--ln); display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--mu); }
	.pips { display: flex; gap: 3px; flex-wrap: wrap; }
	.pips i { width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid currentColor; }
	.t-orange .pips { color: var(--or); } .t-blue .pips { color: var(--ti); }
	.pips i.on { background: currentColor; }
	.pv { color: var(--mu); font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; } .pv b { color: var(--tx); }
	.coin { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--au); margin-left: 3px; vertical-align: -1px; }

	/* timeline */
	.tl { flex: none; padding: 10px 12px; }
	.ctrl { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
	.cb { height: 32px; min-width: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--ln2); background: var(--p2); color: var(--tx); font-size: 15px; cursor: pointer; }
	.cb.go { background: var(--au); color: #1a1408; border-color: var(--au); font-weight: 700; min-width: 92px; }
	.cb.on { border-color: var(--au); color: var(--au); }
	.sp { display: inline-flex; gap: 4px; margin-left: 6px; }
	.hint { margin-left: auto; color: var(--mu2); font-size: 13px; }
	.track { display: flex; gap: 14px; overflow-x: auto; padding: 8px 2px 4px; scrollbar-width: thin; }
	.rnd { display: flex; flex-direction: column; gap: 3px; flex: none; }
	.rl { font-family: 'Cinzel', Georgia, serif; font-size: 11px; letter-spacing: .12em; color: var(--au); }
	.grp { display: flex; gap: 6px; }
	.g { display: flex; flex-direction: column; gap: 2px; }
	.gl { font-size: 11px; color: var(--mu2); white-space: nowrap; }
	.tks { display: flex; gap: 2px; }
	.tk { position: relative; width: 24px; height: 28px; border-radius: 5px; border: 1px solid var(--ln2); background: var(--p2); padding: 0; display: grid; place-items: center; cursor: pointer; }
	.tk.k-plan { width: 10px; background: transparent; }
	.tk.k-battle, .tk.k-level { width: 22px; background: var(--p3); }
	.tk.past { background: #222a38; }
	.tk.k-act { border-bottom: 3px solid var(--pc, var(--ln2)); }
	.tk.cur { border-color: var(--au); box-shadow: 0 0 0 2px var(--au); background: #3a3220; }
	.tk .face { opacity: .9; }
	.tk .mk { position: absolute; top: -9px; right: -6px; font-size: 11px; line-height: 1; pointer-events: none; }

	.pvw { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgba(4, 6, 10, .78); cursor: zoom-out; }
	.pvc { width: min(360px, 80vw, calc((100dvh - 80px) * 1192 / 1664)); text-align: center; }
	.pvc :global(.cardface) { width: 100%; height: auto; aspect-ratio: 1192 / 1664; border-radius: 12px; }
	.pvc p { color: var(--tx2); margin: 8px 0 0; }

	/* a narrow portrait screen: the board on top, the story under it (scrolls) */
	@media (max-width: 760px) and (orientation: portrait) {
		.main { grid-template-columns: minmax(0, 1fr); grid-template-rows: 46dvh minmax(0, 1fr); }
		.hint { display: none; }
		.vs { margin-left: 0; }
	}
	/* a phone on its side: everything in one screen — slim header, the timeline as one row, the board as big as it goes */
	@media (orientation: landscape) and (max-height: 520px) {
		.rp { gap: 6px; padding-top: 6px; padding-bottom: max(6px, env(safe-area-inset-bottom, 0px)); }
		.top { flex-wrap: nowrap; gap: 10px; }
		.top h1 { font-size: 15px; } .top .btn2 { padding: 3px 10px; font-size: 13px; }
		.top .meta { display: none; }
		.vs .face { --fs: 22px !important; }
		.main { grid-template-columns: minmax(0, 1fr) 270px; gap: 6px; }
		.info .card { padding: 8px 10px; }
		.head h2 { font-size: 15px; margin-bottom: 6px; }
		.played { grid-template-columns: 56px minmax(0, 1fr); padding: 6px; } .played .cf { width: 56px; }
		.hud { font-size: 11px; padding: 4px 8px; gap: 4px 8px; } .hud .pips i { width: 8px; height: 8px; }
		.cap { font-size: 13px; padding: 3px 10px; }
		.tl { display: flex; align-items: center; gap: 8px; padding: 4px 8px; }
		.ctrl { margin: 0; flex: none; flex-wrap: nowrap; gap: 4px; }
		.cb { height: 28px; min-width: 28px; padding: 0 6px; font-size: 13px; } .cb.go { min-width: 64px; }
		.sp, .hint { display: none; }
		.track { flex: 1 1 auto; min-width: 0; padding: 8px 2px 0; gap: 8px; }
		.rl, .gl { display: none; }
	}
	@media (max-width: 760px) and (orientation: portrait) {
		.cb { height: 30px; min-width: 30px; padding: 0 7px; } .cb.go { min-width: 72px; }
		.ctrl { flex-wrap: nowrap; } .sp { display: none; }
	}
</style>
