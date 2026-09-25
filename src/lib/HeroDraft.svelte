<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Readable } from 'svelte/store';
	import {
		HEROES_ALPHA, heroAvatar, heroSplash, heroLogo, heroById,
		statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, PACK_LABELS,
		type Hero, type Trait
	} from '$lib/heroes';
	import {
		teamRosters, teamForSeat, draftTurn, draftActor, draftBlocked, draftComplete,
		draftAdvance, draftSetPick, DRAFT_LABELS,
		type MatchState, type Player, type MatchSession, type Team, type DraftAction
	} from '$lib/match';

	export let session: MatchSession;
	export let state: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let onLeave: () => void;

	$: d = $state.draft;
	$: seats = $state.seats;
	$: rosters = teamRosters($players, seats);
	$: seatedIds = [...rosters.orange, ...rosters.blue];
	$: mySeat = $players.find((p) => p.id === clientId)?.seat ?? -1;
	$: myTeam = teamForSeat(mySeat, seats);
	$: iAmHost = $state.host === clientId;

	$: turn = d ? draftTurn(d) : null;
	$: activeActor = d ? draftActor(d) : null;
	$: myTurn = !!turn && turn.actor === clientId;
	$: blocked = d ? draftBlocked(d) : new Set<string>();
	$: complete = d ? draftComplete(d, seatedIds) : false;
	$: myPick = d ? d.picks[clientId] : undefined; // all-pick: my committed hero

	const nameOf = (id: string) => $players.find((p) => p.id === id)?.name ?? 'Player';

	// hero grid: always alphabetical. A filter tab (complexity tier or role) keeps
	// the matching heroes lit and greys out / disables the rest.
	// filter: 'all' | 's<stars>' | 't:<trait>'
	let filter = 'all';
	const ROLES = (Object.keys(TRAIT_LABELS) as Trait[]).sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b]));
	const matches = (h: Hero, f: string) =>
		f === 'all' || (f[0] === 's' ? h.stars === Number(f.slice(1)) : h.traits.includes(f.slice(2) as Trait));
	// hovering a tab (mouse) previews its highlight without committing to it
	let hoverFilter: string | null = null;
	$: viewFilter = hoverFilter ?? filter;
	$: filterLabel = viewFilter === 'all' ? 'All heroes' : viewFilter[0] === 's' ? `Complexity ${viewFilter.slice(1)}` : TRAIT_LABELS[viewFilter.slice(2) as Trait];
	$: filterCount = HEROES_ALPHA.filter((h) => matches(h, viewFilter)).length;
	$: inPool = d ? new Set(d.pool) : new Set<string>();
	// pickable right now: in the pool, not taken/banned, not a 4★ "soon"
	const pickable = (h: Hero) => inPool.has(h.id) && !blocked.has(h.id) && h.stars < 4;
	const firstFor = (f: string) => HEROES_ALPHA.find((h) => matches(h, f) && pickable(h))?.id;
	// choosing a tab (tap the active one again → All) jumps to its first available hero
	function chooseFilter(f: string) {
		filter = filter === f && f !== 'all' ? 'all' : f;
		hoverFilter = null;
		if (!lockedIn) sel = firstFor(filter) ?? sel;
	}
	const hoverTab = (e: PointerEvent, f: string | null) => { if (e.pointerType === 'mouse') hoverFilter = f; };
	// a hero is unavailable if it's outside the complexity pool, picked, or banned
	$: unavailable = (h: string) => !inPool.has(h) || blocked.has(h);

	let sel = '';
	let myWant = ''; // all-pick self-heal target
	// initial highlight: first available hero (don't reset after every action —
	// leave `sel` on what you just picked/banned)
	$: if (d && !sel) sel = HEROES_ALPHA.find((h) => inPool.has(h.id) && !blocked.has(h.id) && h.stars < 4)?.id ?? HEROES_ALPHA[0].id;
	// when it BECOMES your turn, snap to a fresh valid option (once per step)
	let snapStep = -1;
	$: if (d && d.order.length && myTurn && d.step !== snapStep) {
		snapStep = d.step;
		sel = d.system === 'single-draft'
			? (d.offer[0] ?? sel)
			: (HEROES_ALPHA.find((h) => inPool.has(h.id) && !blocked.has(h.id))?.id ?? sel);
	}
	// once you've locked in (and aren't acting), you can only view your own hero
	$: lockedIn = !!myPick && !myTurn;
	$: if (lockedIn && myPick && sel !== myPick) sel = myPick;
	// all-pick: if someone takes the hero you're looking at, move to the next available one
	$: if (d && d.system === 'all-pick' && !lockedIn && sel && blocked.has(sel) && sel !== myPick) sel = firstFor(filter) ?? sel;
	$: selHero = heroById(sel);
	const pip = (stat: [number, number], i: number) => (i < stat[0] ? 2 : i < stat[1] ? 1 : 0);

	// can the active player lock `h` right now?
	function canAct(h: string): boolean {
		if (!d || complete || unavailable(h)) return false;
		if (d.system === 'all-random') return false;
		if (d.system === 'all-pick') return !myPick;
		if (!myTurn) return false;
		if (d.system === 'single-draft') return d.offer.includes(h);
		return true; // pick-ban
	}
	$: isBanTurn = d?.order.length ? turn?.type === 'ban' : false;

	function act() {
		if (!d || !canAct(sel)) return;
		if (d.system === 'all-pick') {
			myWant = sel;
			session.update({ draft: draftSetPick(d, clientId, sel, myTeam ?? undefined) });
		} else {
			session.update({ draft: draftAdvance(d, sel) });
		}
	}
	// self-heal a rare all-pick clobber (two players locking at once)
	$: if (d && d.system === 'all-pick' && myWant && d.picks[clientId] !== myWant) {
		session.update({ draft: draftSetPick(d, clientId, myWant, myTeam ?? undefined) });
	}
	function startGame() {
		if (iAmHost) session.update({ started: true });
	}

	// ---- pick/ban announcement toast ------------------------------------------
	let toastAction: DraftAction | null = null;
	let toastAt = 0;
	let toastTimer: ReturnType<typeof setTimeout>;
	$: if (d?.lastAction && d.lastAction.at !== toastAt) {
		toastAt = d.lastAction.at;
		if (d.lastAction.actor !== clientId) { // the actor doesn't need to be told what they did
			toastAction = d.lastAction;
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => (toastAction = null), 5200);
		}
	}
	$: toastHero = toastAction ? heroById(toastAction.hero) : undefined;

	// ---- resilience: countdown + host watchdog --------------------------------
	const GRACE_MS = 10000; // all-pick: extra locked window after the clock runs out
	let now = Date.now();
	let selfLocked = false; // guard so the grace auto-lock only fires once
	$: isAllPick = !!d && d.order.length === 0 && d.system === 'all-pick';
	// my time is up but I haven't locked in → grace/overtime: extra time on a red
	// clock; you can still switch heroes, and whatever you're on locks in at 0.
	$: overtime = isAllPick && !!d && d.deadline > 0 && !complete && !myPick && now >= d.deadline;
	$: secsLeft = (() => {
		if (!d || !d.deadline || complete) return null;
		const dl = isAllPick && !myPick && now >= d.deadline ? d.deadline + GRACE_MS : d.deadline;
		return Math.max(0, Math.ceil((dl - now) / 1000));
	})();
	$: countdown = secsLeft == null ? '' : `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`;

	const randomFrom = (dd: typeof d): string => {
		if (!dd) return '';
		const src = dd.system === 'single-draft' ? dd.offer : dd.pool;
		const taken = new Set([...Object.values(dd.picks), ...dd.bans]);
		const choices = src.filter((h) => !taken.has(h));
		return choices[Math.floor(Math.random() * choices.length)] ?? '';
	};

	// turn-based: host auto-advances the current turn with a random valid hero
	function autoAdvance() {
		if (!d || complete || !d.order.length) return;
		const hero = randomFrom(d);
		if (hero) session.update({ draft: draftAdvance(d, hero, true) });
	}
	// all-pick: host fills any missing picks (for absent players on timeout)
	function fillMissing() {
		if (!d || complete) return;
		let nd = d;
		let changed = false;
		for (const id of seatedIds.filter((x) => !nd.picks[x])) {
			const hero = randomFrom(nd);
			if (hero) { nd = draftSetPick(nd, id, hero, teamForSeat($players.find((p) => p.id === id)?.seat ?? -1, seats) ?? undefined, true); changed = true; }
		}
		if (changed) session.update({ draft: nd });
	}

	// The host is the single authority that resolves a stall: the clock ran out,
	// or (turn-based) the active player has been gone from presence a few seconds.
	let absentActor = '';
	let absentAt = 0;
	function watchdog() {
		now = Date.now();
		if (!d || complete) { absentActor = ''; return; }
		// client-side: when MY grace window ends, lock in whatever hero I'm on
		if (isAllPick && d.deadline > 0 && !myPick && !selfLocked && now >= d.deadline + GRACE_MS) {
			selfLocked = true;
			if (sel && canAct(sel)) act();
		}
		if (!iAmHost) { absentActor = ''; return; }
		const timedOut = d.deadline > 0 && now >= d.deadline;
		if (d.order.length) {
			const actor = activeActor;
			const present = !!actor && $players.some((p) => p.id === actor);
			if (present) absentActor = '';
			else if (actor && absentActor !== actor) { absentActor = actor; absentAt = now; }
			const dropped = !present && !!actor && now - absentAt > 8000;
			if (timedOut || dropped) { absentActor = ''; autoAdvance(); }
		} else if (now >= d.deadline + GRACE_MS + 2000) {
			// safety net: after the grace window, the host fills anyone still missing
			// (disconnected players who couldn't self-lock) with a random hero
			fillMissing();
		}
	}
	let ticker: ReturnType<typeof setInterval>;
	onMount(() => { ticker = setInterval(watchdog, 1000); });
	onDestroy(() => { clearInterval(ticker); clearTimeout(toastTimer); });

	// top banner text
	$: banner = (() => {
		if (!d) return '';
		if (complete) return 'Draft complete';
		if (d.system === 'all-pick') return myPick ? 'Waiting for the others…' : DRAFT_LABELS[d.system];
		if (d.system === 'all-random') return 'Heroes assigned';
		if (!turn) return '';
		if (turn.actor === clientId) return turn.type === 'ban' ? 'Your ban' : 'Your pick';
		return `${turn.team === 'orange' ? 'Orange' : 'Blue'} · ${nameOf(turn.actor)} is ${turn.type === 'ban' ? 'banning' : 'picking'}…`;
	})();
	$: bannerTeam = complete ? myTeam : d?.order.length ? turn?.team : myTeam;

	// team-coloured action button
	const bg = (t: Team | null | undefined) =>
		t === 'blue' ? 'linear-gradient(120deg, #3b82f6, #2563eb)' : 'linear-gradient(120deg, #f59e0b, #dd6a12)';
	$: actionBg = complete ? 'linear-gradient(120deg, #16a34a, #15803d)' : isBanTurn ? 'linear-gradient(120deg, #ef4444, #b91c1c)' : bg(myTeam);
	$: actionEnabled = complete ? iAmHost : canAct(sel);
	$: actionLabel = (() => {
		if (complete) return iAmHost ? 'Start game →' : 'Waiting for host…';
		if (!d || !selHero) return '';
		if (d.system === 'all-random') return 'Heroes assigned';
		if (d.system === 'all-pick') return myPick ? 'Locked ✓' : `Lock in ${selHero.name}`;
		if (!myTurn) return 'Waiting…';
		return isBanTurn ? `Ban ${selHero.name}` : `Lock in ${selHero.name}`;
	})();
	// first press asks for confirmation (picks are final); the second swears it
	let confirmHero = '';
	$: confirming = !!confirmHero && confirmHero === sel && actionEnabled && !complete;
	function onAction() {
		if (complete) return startGame();
		if (confirmHero !== sel) { confirmHero = sel; return; }
		confirmHero = '';
		act();
	}
</script>

{#if d && selHero}
<div class="draft">
	<button class="leave" on:click={onLeave} title="Leave the draft"><span class="lv-x">←</span> Leave</button>
	<div class="stage">
		<img class="splash" src={heroSplash(sel)} alt={selHero.name} />
		<div class="scrim"></div>
		<div class="turn t-{bannerTeam ?? 'orange'}" class:overtime class:urgent={secsLeft != null && secsLeft <= 10 && !complete}><span class="dot"></span><span class="btxt">{overtime ? 'Lock in!' : banner}</span>{#if countdown}<span class="sep">—</span><span class="clock" class:urgent={secsLeft != null && secsLeft <= 10}>{countdown}</span>{/if}{#if !complete && d.order.length}<span class="mode">· {DRAFT_LABELS[d.system]}</span>{/if}</div>
		{#if toastAction && toastHero}
			<div class="toast t-{toastAction.team}" class:ban={toastAction.type === 'ban'}>
				<div class="tav"><img src={heroAvatar(toastAction.hero)} alt="" />{#if toastAction.type === 'ban'}<span class="tban">✕</span>{/if}</div>
				<div class="ttext">
					<span class="twho"><span class="tteam">{toastAction.team === 'orange' ? 'Orange' : 'Blue'}</span> · {nameOf(toastAction.actor)}{toastAction.auto ? ' · auto' : ''}</span>
					<span class="tact"><span class="tverb">{toastAction.type === 'ban' ? 'Banned' : 'Picked'}</span> {toastHero.name} <span class="ttitle">{toastHero.title}</span></span>
				</div>
			</div>
		{/if}

		<div class="stats">
			<div class="cx">{#each Array(selHero.stars) as _, i (i)}<img class="star" src={starIcon()} alt="★" />{/each}<span class="pack">{PACK_LABELS[selHero.pack]}</span></div>
			{#each selHero.stats as st, i (i)}
				<div class="statrow">
					<img class="sicon" src={statIcon(i)} alt={STAT_LABELS[i]} />
					<div class="pips">{#each Array(STAT_PIPS) as _, c (c)}<span class="pip p{pip(st, c)}"></span>{/each}</div>
				</div>
			{/each}
		</div>

		<div class="idblock">
			<div class="nameline">
				<img class="logo" src={heroLogo(sel)} alt="" />
				<div class="names"><span class="nm">{selHero.name}</span><span class="ti">{selHero.title}</span></div>
			</div>
			<div class="traits">
				{#each [...selHero.traits].sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b])) as t (t)}
					<div class="trait">
						{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} />{:else}<span class="tdot">◈</span>{/if}
						<span class="tl">{TRAIT_LABELS[t]}</span>
					</div>
				{/each}
			</div>
		</div>

		<div class="rightcol">
			<div class="browsewrap">
				<!-- filter tabs: a see-through strip running the full height of the hero panel -->
				<div class="filters" class:off={lockedIn} role="group" aria-label="Filter heroes" on:pointerleave={(e) => hoverTab(e, null)}>
					<button class="ftab all" class:on={filter === 'all'} class:peek={hoverFilter === 'all'} on:click={() => chooseFilter('all')} on:pointerenter={(e) => hoverTab(e, 'all')} title="All heroes">All</button>
					<span class="fsep" title="Complexity"></span>
					{#each [1, 2, 3, 4] as n (n)}
						<button class="ftab" class:on={filter === `s${n}`} class:peek={hoverFilter === `s${n}`} on:click={() => chooseFilter(`s${n}`)} on:pointerenter={(e) => hoverTab(e, `s${n}`)} title="Complexity {n}">
							<img src={starIcon()} alt="" /><b>{n}</b>
						</button>
					{/each}
					<span class="fsep" title="Roles"></span>
					{#each ROLES as t (t)}
						<button class="ftab" class:on={filter === `t:${t}`} class:peek={hoverFilter === `t:${t}`} on:click={() => chooseFilter(`t:${t}`)} on:pointerenter={(e) => hoverTab(e, `t:${t}`)} title={TRAIT_LABELS[t]}>
							{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} />{:else}<span class="fdot">◈</span>{/if}
						</button>
					{/each}
				</div>
				<div class="browse">
					<div class="fcap">{lockedIn ? 'Locked in' : filterLabel}<span>{lockedIn ? '' : viewFilter === 'all' ? '' : `${filterCount} heroes`}</span></div>
					{#each HEROES_ALPHA as h (h.id)}
						{@const off = !matches(h, viewFilter)}
						{@const viewLocked = lockedIn && h.id !== myPick}
						<button class="hero" class:on={sel === h.id} class:gone={unavailable(h.id) && h.id !== myPick} class:locked={h.stars === 4}
							class:dim={d.system === 'single-draft' && myTurn && inPool.has(h.id) && !d.offer.includes(h.id) && !blocked.has(h.id)}
							class:filtered={off} class:viewlock={viewLocked}
							disabled={!inPool.has(h.id) || h.stars === 4 || off || viewLocked}
							title={h.stars === 4 ? `${h.name} — 4★ heroes coming soon` : h.name}
							on:click={() => (sel = h.id)}>
							<img src={heroAvatar(h.id)} alt={h.name} />
							{#if h.stars === 4}<span class="soon">soon</span>{/if}
						</button>
					{/each}
				</div>
			</div>
			{#if confirming}
				<!-- picks are final: a short oath before it's sworn -->
				<div class="oath">
					<div class="oath-t">{isBanTurn ? `Banish ${selHero.name}?` : `Swear to ${selHero.name}?`}</div>
					<div class="oath-s">{isBanTurn ? 'A banishment cannot be undone.' : 'Oaths are binding — no changing heroes after.'}</div>
					<div class="oath-b">
						<button class="lockin" style="background:{actionBg}" on:click={onAction}>{isBanTurn ? 'Banish' : 'Swear it'}</button>
						<button class="oath-no" on:click={() => (confirmHero = '')}>Not yet</button>
					</div>
				</div>
			{:else}
				<button class="lockin" style="background:{actionBg}" disabled={!actionEnabled} on:click={onAction}>{actionLabel}</button>
			{/if}
		</div>
	</div>

	<footer class="rails" class:dense={Math.max(rosters.orange.length, rosters.blue.length) >= 3}>
		{#each [{ team: 'orange', ids: rosters.orange }, { team: 'blue', ids: rosters.blue }] as r (r.team)}
			<div class="rail {r.team}" aria-label="{r.team === 'orange' ? 'Orange' : 'Blue'} team">
				{#each r.ids as id (id)}
					{@const ph = d.picks[id] ? heroById(d.picks[id]) : undefined}
					<div class="pcard" class:filled={!!ph} class:active={id === activeActor} class:me={id === clientId} title={ph ? `${nameOf(id)} — ${ph.name}, ${ph.title}` : nameOf(id)}>
						<div class="pav">{#if ph}<img src={heroAvatar(ph.id)} alt="" />{:else}<span class="pq">?</span>{/if}</div>
						<div class="pinfo">
							<span class="pn">{ph ? ph.name : 'Choosing…'}</span>
							<span class="pp">{nameOf(id)}{id === clientId ? ' (you)' : ''}</span>
							{#if ph}
								<span class="proles">
									{#each [...ph.traits].sort((x, y) => TRAIT_LABELS[x].localeCompare(TRAIT_LABELS[y])) as t (t)}
										{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} title={TRAIT_LABELS[t]} />{:else}<span class="prdot" title={TRAIT_LABELS[t]}>◈</span>{/if}
									{/each}
								</span>
							{/if}
						</div>
						{#if ph}
							<!-- base stats (tooltip shows how far each can grow) -->
							<div class="pstats">
								{#each ph.stats as st, i (i)}
									<span class="psr" title="{STAT_LABELS[i]} {st[0]}{st[1] > st[0] ? ` → ${st[1]}` : ''}"><img src={statIcon(i)} alt={STAT_LABELS[i]} /><b>{st[0]}</b></span>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
			{#if r.team === 'orange'}
				{#if d.system === 'pick-ban' || d.bans.length}
					<div class="banrail"><span class="rl">Bans</span>{#each d.bans as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}{#if !d.bans.length}<span class="nobans">—</span>{/if}</div>
				{:else}
					<div class="vs">VS</div>
				{/if}
			{/if}
		{/each}
	</footer>
</div>
{/if}

<style>
	.draft { height: 100%; min-height: 560px; display: flex; flex-direction: column; color: #f1f5f9; }
	.leave { position: absolute; top: 16px; left: 18px; z-index: 6; display: inline-flex; align-items: center; gap: 7px;
		padding: 8px 15px; border-radius: 999px; border: 1px solid rgba(239,68,68,0.5); background: rgba(40,12,14,0.6); backdrop-filter: blur(6px);
		color: #fca5a5; cursor: pointer; font-weight: 700; font-size: 0.86rem; letter-spacing: 0.02em; box-shadow: 0 6px 18px rgba(0,0,0,0.45); }
	.leave:hover { background: rgba(120,28,32,0.72); color: #fecaca; border-color: rgba(239,68,68,0.75); }
	.leave .lv-x { font-size: 1rem; line-height: 1; }
	.stage { position: relative; flex: 1; overflow: hidden; }
	.splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; }
	.scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(9,13,22,0.94) 0%, rgba(9,13,22,0.6) 40%, rgba(9,13,22,0.12) 66%, rgba(9,13,22,0.35) 100%); }
	.turn { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; font-weight: 700; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 7px 20px; }
	.turn .btxt { font-family: 'Modesto Poster', serif; font-size: 1.4rem; letter-spacing: 0.05em; text-transform: uppercase; }
	.turn .sep { color: #cbb488; font-family: 'Modesto Poster', serif; font-size: 1.2rem; }
	.turn .mode { color: #94a3b8; font-weight: 600; font-size: 0.85rem; }
	.turn .clock { font-family: 'Modesto Poster', serif; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; font-size: 1.3rem; padding: 0 4px; }
	.turn .clock.urgent { color: #fca5a5; }
	/* all-pick grace/overtime: the whole banner + timer go red and pulse */
	.turn.overtime { border-color: rgba(239,68,68,0.7); background: rgba(60,10,12,0.6); box-shadow: 0 0 0 1px rgba(239,68,68,0.45), 0 0 22px rgba(239,68,68,0.5); animation: otpulse 1s ease-in-out infinite; }
	.turn.overtime .btxt, .turn.overtime .sep, .turn.overtime .clock { color: #fca5a5; }
	/* last 10s of the normal clock: redden the whole banner text, not just the timer */
	.turn.urgent .btxt, .turn.urgent .sep { color: #fca5a5; }
	.turn.overtime .dot { background: #ef4444; box-shadow: 0 0 10px #ef4444; }
	@keyframes otpulse { 0%, 100% { box-shadow: 0 0 0 1px rgba(239,68,68,0.4), 0 0 14px rgba(239,68,68,0.35); } 50% { box-shadow: 0 0 0 1px rgba(239,68,68,0.6), 0 0 26px rgba(239,68,68,0.6); } }
	.toast { position: absolute; top: 76px; left: 50%; transform: translateX(-50%); z-index: 5; display: flex; align-items: center; gap: 18px; min-width: 420px;
		background: linear-gradient(90deg, var(--tc, rgba(239,125,34,0.34)) 0%, rgba(12,18,32,0.9) 42%, rgba(9,13,22,0.92) 100%); backdrop-filter: blur(10px);
		border: 1px solid rgba(255,255,255,0.16); border-left-width: 6px; border-radius: 16px; padding: 12px 28px 12px 12px;
		box-shadow: 0 18px 48px rgba(0,0,0,0.6), 0 0 34px var(--tg, rgba(239,125,34,0.35)); white-space: nowrap; animation: toastIn 0.42s cubic-bezier(0.2,0.9,0.2,1); }
	.toast.t-orange { border-left-color: #ef7d22; --tc: rgba(239,125,34,0.36); --tg: rgba(239,125,34,0.4); }
	.toast.t-blue { border-left-color: #2f7fe6; --tc: rgba(47,127,230,0.36); --tg: rgba(47,127,230,0.4); }
	.tav { position: relative; width: 76px; height: 76px; flex: 0 0 auto; }
	.tav img { width: 76px; height: 76px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(255,255,255,0.28); box-shadow: 0 6px 18px rgba(0,0,0,0.5); }
	.toast.ban .tav img { filter: grayscale(1) brightness(0.6); }
	.tban { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fca5a5; font-size: 1.5rem; font-weight: 800; text-shadow: 0 1px 4px #000; }
	.ttext { display: flex; flex-direction: column; gap: 1px; line-height: 1.15; }
	.twho { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: #cbd5e1; }
	.t-orange .tteam { color: #ef9a5a; font-weight: 700; }
	.t-blue .tteam { color: #6ea8f0; font-weight: 700; }
	.tact { font-family: 'Modesto Poster', serif; font-size: 2rem; letter-spacing: 0.01em; line-height: 1.05; text-shadow: 0 2px 10px rgba(0,0,0,0.6); }
	.tverb { text-transform: uppercase; font-size: 1.05rem; letter-spacing: 0.08em; color: #6ee7b7; margin-right: 6px; vertical-align: 0.2em; }
	.toast.ban .tverb { color: #fca5a5; }
	.ttitle { display: block; color: #cbd5e1; font-size: 1.05rem; }
	@keyframes toastIn { 0% { opacity: 0; transform: translate(-50%, -14px) scale(0.9); } 60% { opacity: 1; transform: translate(-50%, 2px) scale(1.03); } 100% { opacity: 1; transform: translate(-50%, 0) scale(1); } }
	.hero:disabled { cursor: default; }
	.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #ef7d22; box-shadow: 0 0 10px #ef7d22; }
	.t-blue .dot { background: #2f7fe6; box-shadow: 0 0 10px #2f7fe6; }

	.stats { position: absolute; top: 70px; left: 34px; display: flex; flex-direction: column; gap: 9px; }
	.cx { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
	.star { width: 26px; height: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
	.pack { font-family: 'Modesto Poster', serif; letter-spacing: 0.04em; font-size: 1.1rem; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
	.statrow { display: flex; align-items: center; gap: 10px; }
	.sicon { width: 30px; height: 22px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.7)); }
	.pips { display: flex; gap: 3px; }
	.pip { width: 15px; height: 15px; border-radius: 3px; background: rgba(255,255,255,0.12); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4); }
	.pip.p2 { background: #45b1ff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35), 0 0 6px rgba(69,177,255,0.6); }
	.pip.p1 { background: rgba(69,177,255,0.4); box-shadow: inset 0 0 0 1px rgba(69,177,255,0.7); }

	.idblock { position: absolute; left: 40px; bottom: 30px; max-width: 560px; }
	.nameline { display: flex; align-items: center; gap: 14px; }
	.logo { width: 74px; height: 74px; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.7)); }
	.names { display: flex; flex-direction: column; line-height: 1; }
	.nm { font-family: 'Modesto Poster', serif; font-size: 3.6rem; text-shadow: 0 4px 18px rgba(0,0,0,0.7); }
	.ti { font-family: 'Modesto Poster', serif; font-size: 1.5rem; color: #dbe4ee; text-shadow: 0 2px 10px rgba(0,0,0,0.7); margin-top: 2px; }
	.traits { display: flex; gap: 10px; margin: 14px 0 4px; }
	.trait { display: flex; flex-direction: column; align-items: center; gap: 5px; width: 76px; }
	.trait img { width: 36px; height: 36px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.7)); }
	.tdot { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 1.35rem; color: #fbbf24; border: 2px solid #fbbf24; border-radius: 50%; }
	.tl { font-family: 'Modesto Poster', serif; font-size: 0.62rem; letter-spacing: 0.02em; text-transform: uppercase; white-space: nowrap; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }

	.rightcol { position: absolute; top: 16px; right: 16px; bottom: 16px; width: 372px; display: flex; flex-direction: column; gap: 10px; }
	.browsewrap { position: relative; flex: 1; min-height: 0; display: flex; }
	.browse { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: auto repeat(8, minmax(0, 1fr)); gap: 8px; padding: 12px; background: rgba(9,13,22,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; backdrop-filter: blur(6px); }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 9px; padding: 0; cursor: pointer; overflow: hidden; transition: transform 0.1s; }
	.hero img { width: 100%; height: 100%; object-fit: cover; object-position: center 22%; display: block; }
	.hero { min-height: 0; }
	.hero:hover { transform: scale(1.06); }
	.hero.on { box-shadow: 0 0 0 2px #f59e0b; border-color: transparent; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }
	.hero.dim { filter: brightness(0.55); }
	.hero { position: relative; }
	.hero.locked { filter: grayscale(1) brightness(0.42); pointer-events: none; }
	.hero.locked img { opacity: 0.9; }
	.hero .soon { position: absolute; left: 0; right: 0; bottom: 0; font-size: 0.5rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; text-align: center; color: #f1f5f9; background: rgba(0,0,0,0.72); padding: 1px 0; }
	/* filter tab strip — sits just outside the panel's left edge, see-through until used */
	.filters { position: absolute; top: 0; bottom: 0; right: calc(100% + 6px); display: flex; flex-direction: column; align-items: center; gap: 4px;
		padding: 5px 4px; border-radius: 12px; background: rgba(9,13,22,0.22); border: 1px solid rgba(255,255,255,0.08); opacity: 0.72; transition: opacity 0.15s; }
	.filters:hover { opacity: 1; }
	.filters.off { opacity: 0.3; pointer-events: none; }
	.ftab { position: relative; flex: 1 1 0; min-height: 22px; max-height: 52px; width: 36px; display: grid; place-items: center; padding: 0; border-radius: 8px; cursor: pointer; color: #e5e7eb;
		background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); transition: background 0.12s, border-color 0.12s; }
	.ftab:hover { background: rgba(255,255,255,0.14); }
	.ftab.peek { background: rgba(255,255,255,0.16); border-color: rgba(245,158,11,0.5); }
	.ftab.on { background: rgba(245,158,11,0.26); border-color: rgba(245,158,11,0.8); box-shadow: 0 0 10px rgba(245,158,11,0.35); }
	.ftab img { width: 20px; height: 20px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
	.ftab b { position: absolute; right: 2px; bottom: 0; font-size: 0.62rem; font-weight: 900; color: #fff; text-shadow: 0 1px 2px #000; }
	.ftab.all { font-size: 0.64rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
	.fdot { font-size: 0.95rem; color: #fbbf24; }
	.fsep { width: 20px; height: 1px; margin: 2px 0; background: rgba(255,255,255,0.2); }
	.fcap { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: baseline; margin: -2px 2px 0;
		font-family: 'Modesto Poster', serif; font-size: 0.82rem; letter-spacing: 0.04em; color: #f0dcae; }
	.fcap span { font-family: inherit; font-size: 0.66rem; color: #94a3b8; }
	/* filtered out by a tab, or browsing locked after lock-in */
	.hero.filtered { filter: grayscale(1) brightness(0.36); opacity: 0.6; pointer-events: none; }
	.hero.viewlock { filter: brightness(0.45) saturate(0.5); pointer-events: none; }
	.lockin { width: 100%; border: 1px solid rgba(255,255,255,0.32); color: #fff; border-radius: 12px; padding: 0.85rem 1rem; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
	.oath { padding: 12px 12px 10px; border-radius: 14px; background: linear-gradient(180deg, rgba(40,28,10,0.82), rgba(12,14,22,0.9)); border: 1px solid rgba(240,200,120,0.5);
		box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 18px rgba(240,190,90,0.18); animation: oathIn 0.22s ease; }
	.oath-t { font-family: 'Modesto Poster', serif; font-size: 1.35rem; color: #f6ead2; text-align: center; }
	.oath-s { font-size: 0.78rem; color: #cbb488; text-align: center; margin: 2px 0 10px; font-style: italic; }
	.oath-b { display: flex; gap: 8px; }
	.oath-b .lockin { flex: 1; padding: 0.7rem 1rem; }
	.oath-no { flex: none; padding: 0 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); color: #e5e7eb; font-weight: 700; cursor: pointer; }
	.oath-no:hover { background: rgba(255,255,255,0.14); }
	@keyframes oathIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
	.lockin:disabled { opacity: 0.45; cursor: not-allowed; }

	.rails { display: flex; align-items: stretch; justify-content: space-between; gap: 18px; padding: 10px 20px; background: rgba(9,13,22,0.78); border-top: 1px solid rgba(255,255,255,0.1); }
	.rail { flex: 1 1 0; min-width: 0; display: flex; align-items: center; gap: 10px; }
	.rail.blue { justify-content: flex-end; }
	.rl { flex: none; font-family: 'Modesto Poster', serif; font-size: 1rem; letter-spacing: 0.03em; }
	.banrail .rl { color: #94a3b8; }
	.banrail { flex: none; display: flex; align-items: center; gap: 6px; justify-content: center; }
	.pcard { flex: 0 1 290px; min-width: 0; display: flex; align-items: center; gap: 9px; padding: 7px 10px 7px 7px; border-radius: 12px;
		background: rgba(12,18,32,0.62); border: 1px solid rgba(255,255,255,0.1); transition: border-color 0.2s, box-shadow 0.2s; }
	.orange .pcard { border-bottom: 3px solid #ef7d22; }
	.blue .pcard { border-bottom: 3px solid #2f7fe6; }
	.pcard.me { background: rgba(28,34,52,0.75); }
	.pcard.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 14px rgba(245,158,11,0.45); }
	.pav { width: 54px; height: 54px; flex: none; border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.05); display: grid; place-items: center; }
	.pav img { width: 100%; height: 100%; object-fit: cover; object-position: center 22%; }
	.pq { font-family: 'Modesto Poster', serif; font-size: 1.4rem; color: #475569; }
	.pcard:not(.filled) .pav { border: 1px dashed rgba(255,255,255,0.18); }
	.pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; line-height: 1.1; }
	.pn { font-family: 'Modesto Poster', serif; font-size: 1.02rem; color: #f6ead2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pcard:not(.filled) .pn { color: #7c8aa0; font-size: 0.9rem; }
	.pp { font-size: 0.66rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.proles { display: flex; gap: 2px; margin-top: 3px; overflow: hidden; }
	.proles img { flex: none; width: 15px; height: 15px; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.7)); }
	.prdot { width: 16px; height: 16px; display: grid; place-items: center; font-size: 0.7rem; color: #fbbf24; }
	.pstats { flex: none; display: grid; grid-template-columns: auto auto; gap: 3px 8px; }
	.psr { display: flex; align-items: center; gap: 3px; }
	.psr img { width: 13px; height: 11px; object-fit: contain; opacity: 0.9; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.7)); }
	.psr b { font-size: 0.8rem; font-weight: 800; color: #cfe6ff; font-variant-numeric: tabular-nums; }
	/* 3+ per team: tighter cards so hero names still fit */
	.rails.dense { gap: 12px; padding: 10px 14px; }
	.rails.dense .rail { gap: 7px; }
	.rails.dense .pcard { gap: 7px; padding: 6px 8px 6px 6px; }
	.rails.dense .pav { width: 46px; height: 46px; }
	.rails.dense .pn { font-size: 0.92rem; }
	.rails.dense .pstats { gap: 3px 5px; }
	.vs { flex: none; align-self: center; font-family: 'Modesto Poster', serif; font-size: 1.15rem; letter-spacing: 0.08em; color: #cbb488; text-shadow: 0 2px 8px rgba(0,0,0,0.6); }
	.ban { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; filter: grayscale(1) brightness(0.45); }
	.nobans { color: #64748b; }
</style>
