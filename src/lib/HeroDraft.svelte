<script lang="ts">
	import { teamName } from '$lib/teams';
	import { onMount, onDestroy } from 'svelte';
	import type { Readable } from 'svelte/store';
	import MatchupSplash from '$lib/MatchupSplash.svelte';
	import {
		HEROES_ALPHA, heroAvatar, heroSplash, heroLogo, heroById,
		statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, PACK_LABELS,
		type Hero, type Trait
	} from '$lib/heroes';
	import {
		teamRosters, teamForSeat, draftTurn, draftActor, draftBlocked, draftComplete,
		draftAdvance, draftSetPick, colorHex, DRAFT_LABELS, DRAFT_TURN_MS,
		type MatchState, type Player, type MatchSession, type Team, type DraftAction
	} from '$lib/match';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';

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
	const colorOf = (id: string) => colorHex($players.find((p) => p.id === id)?.color ?? '');

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
	// display only: how many heroes are still open, who took which hero (team bar on its tile), what is banned
	$: openCount = HEROES_ALPHA.filter((h) => inPool.has(h.id) && !blocked.has(h.id) && h.stars < 4).length;
	$: takenBy = (() => {
		const m: Record<string, { team: Team; name: string }> = {};
		if (!d) return m;
		for (const [pid, hid] of Object.entries(d.picks)) {
			const team: Team | null = rosters.orange.includes(pid) ? 'orange' : rosters.blue.includes(pid) ? 'blue' : null;
			if (team && hid) m[hid] = { team, name: $players.find((p) => p.id === pid)?.name ?? 'Player' };
		}
		return m;
	})();
	$: bannedSet = new Set(d ? d.bans : []);
	// phones: the ten roles live in a sheet behind one "Roles" button
	let rolesOpen = false;
	$: roleFilter = filter.startsWith('t:') ? (filter.slice(2) as Trait) : null;
	function pickRole(t: Trait) {
		chooseFilter(`t:${t}`);
		rolesOpen = false;
	}

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
	// display only: the share of the clock that is left (the line along the bottom of the turn pill)
	$: timeFrac = (() => {
		if (!d || !d.deadline || complete) return 0;
		const f = isAllPick && !myPick && now >= d.deadline ? (d.deadline + GRACE_MS - now) / GRACE_MS : (d.deadline - now) / DRAFT_TURN_MS;
		return Math.max(0, Math.min(1, f));
	})();

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
		if (d.system === 'all-pick') return myPick ? 'Waiting for the others…' : 'Choose your hero';
		if (d.system === 'all-random') return 'Heroes assigned';
		if (!turn) return '';
		if (turn.actor === clientId) return turn.type === 'ban' ? 'Your ban' : 'Your pick';
		return `${teamName(turn.team)} · ${nameOf(turn.actor)} is ${turn.type === 'ban' ? 'banning' : 'picking'}…`;
	})();
	// phones: the same message, short enough to sit beside Leave
	$: bannerShort = (() => {
		if (!d) return '';
		if (complete) return 'Complete';
		if (d.system === 'all-pick') return myPick ? 'Waiting…' : DRAFT_LABELS[d.system];
		if (d.system === 'all-random') return 'Assigned';
		if (!turn) return '';
		if (turn.actor === clientId) return turn.type === 'ban' ? 'Your ban' : 'Your pick';
		return `${nameOf(turn.actor)} ${turn.type === 'ban' ? 'bans' : 'picks'}…`;
	})();
	$: bannerTeam = complete ? myTeam : d?.order.length ? turn?.team : myTeam;

	// team-coloured action button (green once the draft is done, red on a ban turn)
	$: actionTone = complete ? 'btn-ready' : isBanTurn ? 'btn-team ban' : myTeam === 'blue' ? 'btn-team is-blue' : 'btn-team is-orange';
	// canAct reads the draft, your pick, the turn and the pool inside the call, where `$:` can't see them:
	// name them here so the button follows them (it used to stay lit after you had locked in)
	let actionEnabled = false;
	$: { d; myPick; myTurn; unavailable; actionEnabled = complete ? iAmHost : canAct(sel); }
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
	// the confirm arms after a beat, so a double-tap on Lock In can't swear the oath by accident
	let confirmAt = 0;
	function onAction() {
		if (complete) return startGame();
		if (confirmHero !== sel) { confirmHero = sel; confirmAt = Date.now(); return; }
		if (Date.now() - confirmAt < 450) return;
		confirmHero = '';
		act();
	}
</script>

{#if d && selHero}
<div class="draft tide">
	<div class="stage">
		<!-- the hero's splash art, left uncovered: words bottom-left, the grid on the right -->
		<div class="artbox" class:toasting={!!toastAction && !!toastHero}>
			<img class="splash" src={heroSplash(sel)} alt={selHero.name} />
			<div class="scrim"></div>

			<div class="ident">
				<div class="meta">
					<span class="cxstars" title="Complexity {selHero.stars}">{#each Array(selHero.stars) as _, i (i)}<img class="star" src={starIcon()} alt="★" />{/each}</span>
					<span class="mtag gold cxtag">Complexity {selHero.stars}</span>
					<span class="mtag">{PACK_LABELS[selHero.pack]}</span>
				</div>
				<div class="nameline">
					<img class="logo" src={heroLogo(sel)} alt="" />
					<div class="names"><span class="nm" class:long={selHero.name.length >= 10}>{selHero.name}</span><span class="ti">{selHero.title}</span></div>
				</div>
				<hr class="idrule" />
				<div class="cols">
					<div class="stats">
						{#each selHero.stats as st, i (i)}
							<div class="statrow" title="{STAT_LABELS[i]} {st[0]}{st[1] > st[0] ? ` to ${st[1]}` : ''}">
								<img class="sicon" src={statIcon(i)} alt={STAT_LABELS[i]} />
								<span class="slabel">{STAT_LABELS[i]}</span>
								<span class="pips">{#each Array(STAT_PIPS) as _, c (c)}<span class="pip p{pip(st, c)}"></span>{/each}</span>
								<span class="sval">{st[0]}{#if st[1] > st[0]}<i> to {st[1]}</i>{/if}</span>
							</div>
						{/each}
					</div>
					<div class="traits n{Math.min(selHero.traits.length, 6)}">
						{#each [...selHero.traits].sort((a, b) => TRAIT_LABELS[a].localeCompare(TRAIT_LABELS[b])) as t (t)}
							<div class="trait">
								{#if traitIcon(t)}<img src={traitIcon(t)} alt="" />{:else}<span class="tdot">◈</span>{/if}
								<span class="tl">{TRAIT_LABELS[t]}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<!-- top bar (outside the art box: Leave must stay above the matchup splash) -->
		<div class="dtop">
			<button class="btn btn-ghost on-art btn-sm leave" on:click={onLeave} title="Leave the draft">
				<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg> Leave
			</button>
			<div class="topmid">
				<div class="turn t-{bannerTeam ?? 'orange'}" class:wordy={!overtime && banner.length > 26} class:overtime class:urgent={secsLeft != null && secsLeft <= 10 && !complete}>
					<span class="dot"></span>
					<span class="btxt full" class:long={!overtime && banner.length > 20}>{overtime ? 'Lock in!' : banner}</span>
					<span class="btxt short">{overtime ? 'Lock in!' : bannerShort}</span>
					{#if countdown}<span class="sep"></span><span class="clock" class:urgent={secsLeft != null && secsLeft <= 10}>{countdown}</span>{/if}
					{#if !complete}<span class="sep modesep"></span><span class="mode">{DRAFT_LABELS[d.system]}</span>{/if}
					{#if countdown}<span class="left" style="--p:{timeFrac.toFixed(3)}"></span>{/if}
				</div>
				{#if toastAction && toastHero}
					<div class="toast dtoast t-{toastAction.team}" class:ban={toastAction.type === 'ban'}>
						<div class="tav"><img src={heroAvatar(toastAction.hero)} alt="" />{#if toastAction.type === 'ban'}<span class="tban">✕</span>{/if}</div>
						<div class="ttext">
							<span class="twho"><span class="tteam">{teamName(toastAction.team)}</span> · {nameOf(toastAction.actor)}{toastAction.auto ? ' · auto' : ''}</span>
							<span class="tact"><span class="tverb">{toastAction.type === 'ban' ? 'Banned' : 'Picked'}</span> {toastHero.name} <span class="ttitle">{toastHero.title}</span></span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<div class="rightcol">
			<div class="browsewrap">
				<!-- filters: a rail of tabs beside the hero panel (phones: one row, the roles behind a button) -->
				<div class="filters seg" class:off={lockedIn} role="group" aria-label="Filter heroes" on:pointerleave={(e) => hoverTab(e, null)}>
					<button class="ftab seg-opt seg-opt--ico all" class:is-on={filter === 'all'} class:peek={hoverFilter === 'all'} on:click={() => chooseFilter('all')} on:pointerenter={(e) => hoverTab(e, 'all')} title="All heroes">All</button>
					<span class="fsep" title="Complexity"></span>
					{#each [1, 2, 3, 4] as n (n)}
						<button class="ftab seg-opt seg-opt--ico cx" class:is-on={filter === `s${n}`} class:peek={hoverFilter === `s${n}`} on:click={() => chooseFilter(`s${n}`)} on:pointerenter={(e) => hoverTab(e, `s${n}`)} title="Complexity {n}">
							<img src={starIcon()} alt="" /><b>{n}</b>
						</button>
					{/each}
					<span class="fsep" title="Roles"></span>
					{#each ROLES as t (t)}
						<button class="ftab seg-opt seg-opt--ico role" class:is-on={filter === `t:${t}`} class:peek={hoverFilter === `t:${t}`} on:click={() => chooseFilter(`t:${t}`)} on:pointerenter={(e) => hoverTab(e, `t:${t}`)} title={TRAIT_LABELS[t]}>
							{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} />{:else}<span class="fdot">◈</span>{/if}
						</button>
					{/each}
					<button class="ftab seg-opt rolesbtn" class:is-on={!!roleFilter} on:click={() => (rolesOpen = !rolesOpen)} aria-expanded={rolesOpen}>
						<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
						<span>{roleFilter ? TRAIT_LABELS[roleFilter] : 'Roles'}</span>
					</button>
				</div>
				<div class="browse panel panel--tight">
					<div class="fcap"><span class="t-label">{lockedIn ? 'Locked in' : filterLabel}</span><span class="fcount">{lockedIn ? (selHero.name) : viewFilter === 'all' ? `${openCount} to choose from` : `${filterCount} heroes`}</span></div>
					<div class="grid">
						{#each HEROES_ALPHA as h (h.id)}
							{@const off = !matches(h, viewFilter)}
							{@const viewLocked = lockedIn && h.id !== myPick}
							{@const tk = takenBy[h.id]}
							<button class="hero" class:on={sel === h.id} class:gone={unavailable(h.id) && h.id !== myPick} class:locked={h.stars === 4}
								class:dim={d.system === 'single-draft' && myTurn && inPool.has(h.id) && !d.offer.includes(h.id) && !blocked.has(h.id)}
								class:filtered={off} class:viewlock={viewLocked}
								disabled={!inPool.has(h.id) || h.stars === 4 || off || viewLocked}
								title={h.stars === 4 ? `${h.name} — 4★ heroes coming soon` : tk ? `${h.name} — picked by ${tk.name}` : bannedSet.has(h.id) ? `${h.name} — banned` : h.name}
								on:click={() => (sel = h.id)}>
								<img src={heroAvatar(h.id)} alt={h.name} />
								{#if tk}<span class="tk t-{tk.team}"></span>{/if}
								{#if bannedSet.has(h.id)}<span class="bx">✕</span>{/if}
								{#if h.stars === 4}<span class="soon">soon</span>{/if}
							</button>
						{/each}
					</div>
				</div>
			</div>
			<!-- fixed-height action slot: the confirm is anchored to its foot and grows upward over the panel's edge, so the hero grid never moves -->
			<div class="actslot">
				{#if confirming}
					<!-- picks are final: a short oath before it's sworn -->
					<div class="oath" class:ban={isBanTurn}>
						<div class="oath-txt">
							<span class="oath-t">{isBanTurn ? `Ban ${selHero.name}?` : `Choose ${selHero.name}?`}</span>
							<span class="oath-s">{isBanTurn ? 'Bans are final.' : 'Oaths are binding.'}</span>
						</div>
						<!-- side by side, the sworn button on the far edge (away from where Lock In was tapped) -->
						<div class="oath-b">
							<button class="btn btn-ghost btn-sm oath-no" on:click={() => (confirmHero = '')}>Pick Another</button>
							<button class="btn btn-sm lockin {actionTone}" on:click={onAction}>{isBanTurn ? 'Ban Hero' : 'Select Hero'}</button>
						</div>
					</div>
				{:else}
					<button class="btn btn-lg btn-block lockin {actionTone}" class:done={!complete && !!myPick && d.system === 'all-pick'} disabled={!actionEnabled} on:click={onAction}>{actionLabel}</button>
				{/if}
			</div>
		</div>
	</div>

	<!-- the dash: both teams' players either side of the coins, the tide line along its top edge -->
	<footer class="rails" class:dense={Math.max(rosters.orange.length, rosters.blue.length) >= 3} class:packed={Math.max(rosters.orange.length, rosters.blue.length) >= 4}>
		{#each [{ team: 'orange', ids: rosters.orange }, { team: 'blue', ids: rosters.blue }] as r (r.team)}
			<div class="rail {r.team} is-{r.team}" aria-label="{teamName(r.team)}">
				{#each r.ids as id (id)}
					{@const ph = d.picks[id] ? heroById(d.picks[id]) : undefined}
					<div class="pcard" class:filled={!!ph} class:active={id === activeActor} class:me={id === clientId} title={ph ? `${nameOf(id)} — ${ph.name}, ${ph.title}` : nameOf(id)}>
						<div class="pav">{#if ph}<img src={heroAvatar(ph.id)} alt="" />{:else}<span class="pq">?</span>{/if}</div>
						<div class="pinfo">
							<span class="pn" class:long={!!ph && ph.name.length >= 9}>{ph ? ph.name : 'Choosing…'}</span>
							<span class="pp">{nameOf(id)}{#if id === clientId}<span class="you">&nbsp;(you)</span>{/if}</span>
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
					<div class="banrail"><span class="rl">Bans</span>{#each d.bans as b (b)}<span class="banav"><img src={heroAvatar(b)} alt="" /><i>✕</i></span>{/each}{#if !d.bans.length}<span class="nobans">—</span>{/if}</div>
				{:else}
					<div class="vs"><img src={coinOrange} alt={teamName('orange')} /><span>vs</span><img src={coinBlue} alt={teamName('blue')} /></div>
				{/if}
			{/if}
		{/each}
	</footer>

	<!-- phones: the ten roles, by name -->
	{#if rolesOpen}
		<div class="rolesheet">
			<button class="sheet-scrim" aria-label="Close the role list" on:click={() => (rolesOpen = false)}></button>
			<div class="sheet panel panel--tight" role="dialog" aria-label="Filter by role">
				<div class="sheet-head"><span class="t-label">Filter by role</span><button class="btn btn-ghost btn-sm" on:click={() => (rolesOpen = false)}>Close</button></div>
				<div class="sheet-grid">
					{#each ROLES as t (t)}
						<button class="chip rolechip" class:is-on={filter === `t:${t}`} on:click={() => pickRole(t)}>
							{#if traitIcon(t)}<img src={traitIcon(t)} alt="" />{:else}<span class="fdot">◈</span>{/if}
							<span>{TRAIT_LABELS[t]}</span>
						</button>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- every hero locked: Team vs Team war banners; the host begins from here -->
	{#if complete}
		<MatchupSplash orange={rosters.orange} blue={rosters.blue} picks={d.picks} {nameOf} {colorOf} {clientId} {iAmHost} onStart={startGame} />
	{/if}
</div>
{/if}

<style>
	/* The hero draft in the Tide language: tokens and shared controls come from ui/tide.css
	   (.tide on the root); this file only lays the screen out. Designed at 1440×900. */
	.draft { position: relative; height: 100%; min-height: 560px; display: flex; flex-direction: column; overflow: hidden; background: var(--abyss); container: draft / inline-size; }

	/* ───────────── stage: art, words, grid ───────────── */
	.stage { position: relative; flex: 1; min-height: 0; overflow: hidden; }
	.artbox { position: absolute; inset: 0; container: art / size; }
	.splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; }
	/* dark only where the words sit (bottom-left), behind the grid (right) and along the top */
	.scrim { position: absolute; inset: 0; background:
		radial-gradient(86% 100% at 0% 100%, rgba(3,11,21,0.97) 0%, rgba(3,11,21,0.86) 38%, rgba(3,11,21,0.3) 72%, transparent 100%),
		linear-gradient(270deg, rgba(3,11,21,0.9) 0%, rgba(3,11,21,0.72) 20%, transparent 42%),
		linear-gradient(180deg, rgba(3,11,21,0.62) 0%, transparent 20%); }

	/* top: Leave on the left, the turn pill centred over the art, the toast under it */
	.dtop { position: absolute; top: 18px; left: 24px; right: 496px; display: flex; justify-content: center; pointer-events: none; }
	.draft .leave { position: absolute; left: 0; top: 4px; z-index: 30; pointer-events: auto; gap: 8px; }
	.topmid { display: flex; flex-direction: column; align-items: center; gap: 12px; min-width: 0; max-width: calc(100% - 276px); }
	.turn { --tc: var(--orange); position: relative; display: flex; align-items: center; gap: 14px; max-width: 100%; min-height: 52px; padding: 0 26px; overflow: hidden;
		border-radius: var(--r-pill); background: rgba(3,11,21,0.88);
		border: 1px solid var(--brass-line); box-shadow: var(--sh-1), inset 0 1px 0 rgba(255,255,255,0.06);
		font-size: 24px; line-height: 1; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; pointer-events: auto; }
	.turn.t-blue { --tc: var(--blue); }
	/* a long turn message ("Atlanteans · Mia is banning…") takes the room of the mode label */
	.turn.wordy .mode, .turn.wordy .modesep { display: none; }
	.dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--tc); box-shadow: 0 0 10px var(--tc); }
	.btxt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.btxt.long { font-size: 20px; letter-spacing: 0.04em; }
	.btxt.short { display: none; }
	.sep { flex: none; width: 1px; height: 24px; background: var(--brass-line); }
	.clock { flex: none; font-size: 27px; color: var(--brass-hi); font-variant-numeric: tabular-nums; min-width: 2.3em; text-align: center; }
	.mode { flex: none; color: var(--ink-2); font-size: var(--fs-small); letter-spacing: 0.14em; }
	/* time left, as a line along the bottom of the pill */
	.left { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; transform-origin: 0 50%; transform: scaleX(var(--p, 1)); background: var(--brass); transition: transform 1s linear; }
	/* last 10 s: the words and the clock redden */
	.turn.urgent { border-color: rgba(229,72,77,0.7); }
	.turn.urgent .btxt, .clock.urgent { color: var(--danger-hi); }
	.turn.urgent .left { background: var(--danger); }
	/* all-pick grace/overtime: the whole pill goes red and pulses */
	.turn.overtime { border-color: var(--danger); background: rgba(60,10,14,0.9); box-shadow: 0 0 0 1px rgba(229,72,77,0.6), 0 0 22px rgba(229,72,77,0.5); animation: otpulse 1s ease-in-out infinite; }
	.turn.overtime .btxt, .turn.overtime .clock { color: var(--danger-hi); }
	.turn.overtime .dot { background: var(--danger); box-shadow: 0 0 10px var(--danger); }
	.turn.overtime .left { background: var(--danger); }
	@keyframes otpulse { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }

	/* pick / ban announcement */
	.draft .dtoast { --tc: var(--orange); --tc-hi: var(--orange-hi); gap: 16px; padding: 8px 24px 8px 8px; border-left-width: 5px; white-space: nowrap; pointer-events: auto;
		background: linear-gradient(90deg, var(--tw, rgba(239,125,34,0.3)) 0%, rgba(8,26,44,0.94) 46%, rgba(6,21,38,0.94) 100%);
		animation: toastIn 0.42s cubic-bezier(0.2,0.9,0.2,1); }
	.draft .dtoast.t-blue { --tc: var(--blue); --tc-hi: var(--blue-hi); --tw: rgba(47,127,230,0.32); }
	.draft .dtoast.ban { --tc: var(--danger); --tw: rgba(229,72,77,0.26); }
	.tav { position: relative; flex: none; width: 104px; height: 60px; }
	.draft .dtoast .tav img { width: 100%; height: 100%; border-radius: 8px; object-fit: cover; object-position: center 22%; border: 1px solid rgba(255,255,255,0.22); }
	.draft .dtoast.ban .tav img { filter: grayscale(1) brightness(0.55); }
	.tban { position: absolute; inset: 0; display: grid; place-items: center; color: var(--danger-hi); font-size: 30px; text-shadow: 0 1px 4px #000; }
	.ttext { display: flex; flex-direction: column; gap: 4px; line-height: 1.1; }
	.twho { font-size: var(--fs-small); letter-spacing: 0.06em; color: var(--ink-2); }
	.tteam { color: var(--tc-hi); }
	.dtoast.ban .tteam { color: var(--ink); }
	.tact { font-size: 26px; line-height: 1.05; color: var(--ink); }
	.tverb { color: var(--ready-hi); }
	.dtoast.ban .tverb { color: var(--danger-hi); }
	.ttitle { color: var(--ink-2); font-size: var(--fs-body); }
	@keyframes toastIn { 0% { opacity: 0; transform: translateY(-14px) scale(0.92); } 60% { opacity: 1; transform: translateY(2px) scale(1.02); } 100% { opacity: 1; transform: none; } }

	/* bottom-left: who this hero is */
	.ident { position: absolute; left: 48px; bottom: 30px; width: calc(100% - 48px - 512px); display: flex; flex-direction: column; gap: 16px; }
	.meta { display: flex; align-items: center; gap: 10px; }
	.cxstars { display: flex; gap: 3px; }
	.star { width: 26px; height: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
	.mtag { display: inline-flex; align-items: center; height: 30px; padding: 0 13px; border-radius: var(--r-pill); border: 1px solid rgba(255,255,255,0.24); background: rgba(3,11,21,0.72);
		color: var(--ink-2); font-size: 15px; line-height: 1; letter-spacing: 0.08em; white-space: nowrap; }
	.mtag.gold { border-color: var(--brass-line); color: var(--brass-hi); }
	.nameline { display: flex; align-items: center; gap: 18px; }
	.logo { flex: none; width: 108px; height: 108px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.7)); }
	.names { display: flex; flex-direction: column; min-width: 0; }
	.nm { font-size: var(--fs-hero); line-height: 0.92; letter-spacing: 0.01em; white-space: nowrap; text-shadow: 0 3px 18px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.6); }
	.ti { margin-top: 8px; font-size: var(--fs-h2); line-height: 1.1; color: var(--ink); opacity: 0.88; white-space: nowrap; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
	.idrule { width: 560px; max-width: 100%; height: 1px; margin: 0; border: 0; background: linear-gradient(90deg, var(--brass-line), transparent); }
	.cols { display: flex; align-items: center; gap: 44px; }
	.stats { flex: none; display: flex; flex-direction: column; gap: 11px; }
	.statrow { display: grid; grid-template-columns: 26px 104px auto 62px; align-items: center; gap: 12px; }
	.sicon { width: 26px; height: 22px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.7)); }
	.slabel { font-size: var(--fs-small); line-height: 1; letter-spacing: 0.06em; color: var(--ink-2); text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
	.pips { display: flex; gap: 4px; }
	.pip { width: 18px; height: 14px; border-radius: 3px; background: rgba(255,255,255,0.11); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.45); }
	.pip.p2 { background: linear-gradient(180deg, #fff3cf, var(--brass-hi)); box-shadow: 0 0 8px rgba(244,223,168,0.42); } /* what the hero starts with */
	.pip.p1 { background: rgba(216,179,106,0.2); box-shadow: inset 0 0 0 1.5px var(--brass); } /* what items can add */
	.sval { font-size: 21px; line-height: 1; color: var(--ink); white-space: nowrap; font-variant-numeric: tabular-nums; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
	.sval i { margin-left: 0.3em; font-style: normal; font-size: var(--fs-small); color: var(--ink-2); }
	/* roles on round medallions, captions under */
	.traits { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 12px 6px; }
	.traits.n4 { grid-template-columns: repeat(2, auto); }
	.trait { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 100px; }
	.trait img, .tdot { width: 52px; height: 52px; padding: 8px; border-radius: 50%; object-fit: contain;
		background: radial-gradient(circle at 50% 32%, rgba(132,176,214,0.62), rgba(34,76,116,0.62)); border: 1px solid var(--brass-line);
		box-shadow: 0 4px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.18); }
	.trait img { filter: brightness(1.12); }
	.tdot { display: grid; place-items: center; padding: 0; font-size: 24px; line-height: 1; color: var(--brass-hi); }
	.tl { font-size: var(--fs-label); line-height: 1; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; color: var(--ink); text-shadow: 0 2px 4px rgba(0,0,0,0.85); }

	/* ───────────── right: filter rail, hero panel, the action ───────────── */
	.rightcol { position: absolute; top: 16px; right: 16px; bottom: 16px; width: 456px; display: flex; flex-direction: column; gap: 12px; }
	.browsewrap { flex: 1; min-height: 0; display: flex; gap: 8px; }
	.draft .filters { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 3px;
		background: rgba(3,11,21,0.82); transition: opacity 0.15s; }
	.draft .filters.off { opacity: 0.35; pointer-events: none; }
	.draft .ftab { flex: 1 1 0; width: 44px; min-width: 0; min-height: 0; max-height: 60px; padding: 0; gap: 2px; font-size: 15px; color: var(--ink); background: rgba(255,255,255,0.045); }
	.draft .ftab:hover { background: rgba(255,255,255,0.12); }
	.draft .ftab.peek { border-color: var(--brass); background: rgba(216,179,106,0.16); }
	.draft .ftab.is-on { color: var(--ink-dark); background: linear-gradient(180deg, #f3dca0 0%, var(--brass) 55%, #b98e42 100%); }
	.draft .ftab.is-on img { filter: none; }
	.draft .ftab.cx img { width: 20px; height: 20px; filter: none; }
	.draft .ftab.cx b { font-size: 17px; line-height: 1; }
	.fdot { font-size: 20px; line-height: 1; color: var(--brass-hi); }
	.is-on .fdot { color: var(--ink-dark); }
	.fsep { flex: none; align-self: center; width: 24px; height: 1px; margin: 2px 0; background: var(--brass-line); }
	.draft .rolesbtn { display: none; }
	.draft .browse { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; }
	.fcap { flex: none; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; white-space: nowrap; }
	.fcount { font-size: var(--fs-small); color: var(--ink-2); }
	.grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-template-rows: repeat(8, minmax(0, 1fr)); gap: 7px; }
	.hero { position: relative; min-width: 0; min-height: 0; padding: 0; overflow: hidden; border-radius: var(--r-sm); background: #06121f; border: 1px solid rgba(255,255,255,0.16);
		transition: transform var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease); }
	.hero img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 22%; }
	.hero:hover { transform: scale(1.06); z-index: 2; box-shadow: 0 0 0 1px var(--brass), 0 8px 18px rgba(0,0,0,0.6); }
	.hero:disabled { cursor: default; }
	.hero.on { z-index: 1; border-color: transparent; box-shadow: 0 0 0 2px var(--brass-hi), 0 0 18px rgba(216,179,106,0.6); }
	.hero.gone { pointer-events: none; } /* outside the pool, taken or banned */
	.hero.gone img { filter: grayscale(1) brightness(0.36); }
	.hero.dim { filter: brightness(0.55); }
	.hero.locked { pointer-events: none; } /* 4★: coming soon */
	.hero.locked img { filter: grayscale(1) brightness(0.45); }
	.soon { position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 0 3px; background: rgba(3,11,21,0.84); color: var(--ink-2); font-size: var(--fs-micro); line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; text-align: center; }
	/* whose it is: a bar in the team's colour · banned: a red cross */
	.tk { position: absolute; inset: 0 0 auto 0; height: 5px; background: var(--orange); box-shadow: 0 1px 4px rgba(0,0,0,0.6); }
	.tk.t-blue { background: var(--blue); }
	.bx { position: absolute; inset: 0; display: grid; place-items: center; font-size: 30px; line-height: 1; color: var(--danger); text-shadow: 0 1px 4px #000; }
	/* filtered out by a tab, or browsing locked after lock-in */
	.hero.filtered { filter: brightness(0.3) saturate(0.4); pointer-events: none; }
	.hero.viewlock { filter: brightness(0.45) saturate(0.5); pointer-events: none; }

	.actslot { position: relative; flex: none; height: 64px; display: flex; }
	.draft .lockin { height: 100%; min-height: 0; }
	.draft .lockin.ban { background: linear-gradient(180deg, #f2777b 0%, var(--danger) 50%, #b3262b 100%); border-color: #ffb3b5 #e5484d #8f1c21; text-shadow: 0 1px 2px rgba(70,0,0,0.55);
		box-shadow: 0 8px 24px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.35), 0 0 26px rgba(229,72,77,0.35), inset 0 1px 0 rgba(255,255,255,0.4); }
	/* not yours to press right now ("Waiting…"): a quiet placeholder rather than a faded team button */
	.draft .lockin:disabled { opacity: 1; filter: none; background: rgba(3,11,21,0.62); border: 1px dashed rgba(255,255,255,0.26); color: var(--ink-3); text-shadow: none; box-shadow: none; }
	/* locked in: done, so it stops shouting — an outline in your team's colour */
	.draft .lockin.done:disabled { border-style: solid; background: linear-gradient(180deg, var(--tc-glass), rgba(3,11,21,0.5)), var(--deep); border-color: var(--tc-line); color: var(--tc-hi); text-shadow: none; box-shadow: none; }
	.oath { position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; padding: 8px 8px 7px; border-radius: 14px;
		background: linear-gradient(180deg, rgba(14,40,66,0.98), rgba(6,21,38,0.99)); border: 1px solid var(--brass);
		box-shadow: var(--sh-2), 0 0 22px rgba(216,179,106,0.22); animation: oathIn 0.22s ease; }
	.oath.ban { border-color: var(--danger); box-shadow: var(--sh-2), 0 0 22px rgba(229,72,77,0.25); }
	.oath-txt { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 8px; line-height: 1.1; }
	.oath-t { min-width: 0; font-size: 23px; color: var(--brass-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.oath-s { flex: none; font-size: var(--fs-small); color: var(--ink-2); white-space: nowrap; }
	.oath-b { flex: none; height: 46px; display: flex; gap: 8px; }
	.draft .oath-no { flex: 1 1 0; height: 100%; min-height: 0; padding: 0 12px; font-size: var(--fs-body); }
	.draft .oath .lockin { flex: 1.25 1 0; padding: 0 16px; font-size: var(--fs-h3); box-shadow: 0 0 0 1px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4); }
	@keyframes oathIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

	/* ───────────── the dash: two teams, the coins between ───────────── */
	.rails { position: relative; flex: none; height: 112px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 18px; padding: 0 20px;
		background: linear-gradient(180deg, rgba(12,36,60,0.98), rgba(5,18,33,1)); box-shadow: 0 -10px 30px rgba(0,6,14,0.5); }
	/* the tide line: where the two teams meet */
	.rails::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, var(--orange) 0%, var(--brass) 50%, var(--blue) 100%); }
	.rail { display: flex; gap: 10px; min-width: 0; }
	.rail.orange { justify-content: flex-end; }
	.rail.blue { justify-content: flex-start; }
	.pcard { flex: 1 1 0; max-width: 372px; min-width: 0; height: 84px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 8px; border-radius: var(--r-md);
		background: var(--well); border: 1px solid var(--hair); border-bottom: 3px solid var(--tc); transition: border-color 0.2s, box-shadow 0.2s; }
	.pav { flex: none; width: 76px; height: 60px; border-radius: 7px; overflow: hidden; display: grid; place-items: center; background: rgba(255,255,255,0.04); border: 1px solid var(--hair); }
	.pav img { width: 100%; height: 100%; object-fit: cover; object-position: center 22%; }
	.pcard:not(.filled) .pav { border-style: dashed; border-color: rgba(255,255,255,0.22); }
	.pq { font-size: var(--fs-h2); line-height: 1; color: var(--ink-3); }
	.pinfo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.pn { font-size: var(--fs-h3); line-height: 1.05; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pn.long { font-size: 18px; }
	.pcard:not(.filled) .pn { color: var(--ink-2); }
	.pp { font-size: var(--fs-small); line-height: 1.1; color: var(--tc-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.proles { display: flex; gap: 3px; overflow: hidden; }
	.proles img { flex: none; width: 18px; height: 18px; object-fit: contain; filter: brightness(1.35) saturate(1.1); }
	.prdot { flex: none; width: 18px; height: 18px; display: grid; place-items: center; font-size: 14px; line-height: 1; color: var(--brass-hi); }
	.pstats { flex: none; display: grid; grid-template-columns: auto auto; gap: 5px 9px; }
	.psr { display: flex; align-items: center; gap: 5px; }
	.psr img { width: 15px; height: 15px; object-fit: contain; opacity: 0.8; }
	.psr b { font-weight: 400; font-size: var(--fs-small); line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums; }
	/* you: outlined in your team's colour, your name in brass */
	.pcard.me { border-color: var(--tc-line); border-bottom-color: var(--tc); background: linear-gradient(180deg, var(--tc-glass), transparent), var(--well); }
	.pcard.me .pp { color: var(--brass-hi); }
	/* choosing right now (turn-based drafts): the edge breathes */
	.pcard.active { border-color: var(--tc); box-shadow: 0 0 0 1px var(--tc), 0 0 18px var(--tc-line); animation: breathe 2s ease-in-out infinite; }
	.pcard.active .pn { color: var(--brass-hi); }
	@keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
	.vs { flex: none; display: flex; align-items: center; gap: 10px; color: var(--brass); font-size: var(--fs-h2); line-height: 1; }
	.vs img { width: 40px; height: 40px; }
	.banrail { flex: none; display: flex; align-items: center; gap: 6px; justify-content: center; }
	.rl { flex: none; margin-right: 4px; font-size: var(--fs-label); letter-spacing: 0.16em; text-transform: uppercase; color: var(--brass); }
	.banav { position: relative; flex: none; width: 44px; height: 44px; border-radius: 7px; overflow: hidden; border: 1px solid rgba(229,72,77,0.5); display: grid; place-items: center; }
	.banav img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 22%; filter: grayscale(1) brightness(0.45); }
	.banav i { position: relative; font-style: normal; font-size: 22px; line-height: 1; color: var(--danger); text-shadow: 0 1px 3px #000; }
	.nobans { color: var(--ink-3); }
	/* 3 a side: smaller art, no stat block */
	.rails.dense { gap: 12px; padding: 0 14px; }
	.rails.dense .rail { gap: 8px; }
	.rails.dense .pcard { gap: 9px; padding: 8px 9px 8px 7px; }
	.rails.dense .pav { width: 54px; height: 50px; }
	.rails.dense .pstats { display: none; }
	.rails.dense .pn { font-size: 18px; }
	.rails.dense .pn.long { font-size: 16px; }
	.rails.dense .proles img, .rails.dense .prdot { width: 16px; height: 16px; }
	/* 4–5 a side: portrait, hero, player */
	.rails.packed .pcard { gap: 7px; padding: 6px 7px 6px 6px; }
	.rails.packed .pav { width: 44px; height: 44px; }
	.rails.packed .proles { display: none; }
	.rails.packed .pn, .rails.packed .pn.long { font-size: 16px; }
	.rails.packed .pp { font-size: 14px; }
	.rails.packed .vs img { width: 30px; height: 30px; }

	.rolesheet { display: none; }

	/* a narrower desktop / tablet (the screen is scaled as one piece, so this is about its shape) */
	@container draft (min-width: 761px) and (max-width: 1300px) {
		.ident { left: 32px; width: calc(100% - 32px - 496px); gap: 12px; }
		.nm { font-size: 72px; }
		.nm.long { font-size: 60px; }
		.logo { width: 84px; height: 84px; }
		.cols { flex-direction: column; align-items: flex-start; gap: 16px; }
		.traits, .traits.n4 { grid-template-columns: repeat(6, auto); }
		.trait { min-width: 84px; }
		.pcard .pstats { display: none; }
		.pav { width: 64px; height: 52px; }
		.pn { font-size: 19px; }
		/* the turn pill sits beside Leave instead of centred */
		.dtop { justify-content: flex-start; padding-left: 134px; }
		.topmid { align-items: flex-start; max-width: 100%; }
		.turn { font-size: 20px; padding: 0 20px; gap: 12px; }
		.mode, .modesep { display: none; }
		/* 3+ a side: the portrait over the names */
		.rails.dense .pcard { flex-direction: column; justify-content: center; gap: 3px; padding: 6px 4px; }
		.rails.dense .pav { width: 64px; height: 38px; }
		.rails.dense .pinfo { flex: none; width: 100%; align-items: center; text-align: center; gap: 1px; }
		.rails.dense .pn, .rails.dense .pn.long { font-size: 17px; max-width: 100%; }
		.rails.dense .pp { max-width: 100%; }
		.rails.dense .proles { display: none; }
	}

	/* ═══════════ phone (≤760px): portrait draft ═══════════
	   art on top (Leave, the turn pill, a stat plate; name and roles at its foot) ·
	   filter row · hero grid · Lock In · two team rows */
	@media (max-width: 760px) {
		.draft { min-height: 0; }
		.stage { display: flex; flex-direction: column; overflow: visible; }
		.artbox { position: relative; inset: auto; flex: 1 1 0; min-height: 0; overflow: hidden; }
		.splash { object-position: center 16%; }
		.scrim { background:
			linear-gradient(0deg, rgba(3,11,21,1) 0%, rgba(3,11,21,0.78) 30%, rgba(3,11,21,0) 62%),
			linear-gradient(180deg, rgba(3,11,21,0.75) 0%, rgba(3,11,21,0) 24%); }

		.dtop { top: 10px; left: 12px; right: 12px; justify-content: space-between; align-items: flex-start; gap: 8px; }
		.draft .leave { position: relative; top: auto; left: auto; flex: none; padding: 0 12px; }
		.topmid { align-items: flex-end; gap: 8px; max-width: none; }
		.turn { min-height: 44px; padding: 0 16px; gap: 10px; font-size: var(--fs-body); letter-spacing: 0.04em; }
		.btxt.full { display: none; }
		.btxt.short { display: block; }
		.clock { font-size: 22px; }
		.sep { height: 22px; }
		.mode, .modesep { display: none; }
		.draft .dtoast { position: absolute; top: 52px; left: 0; right: 0; gap: 10px; padding: 6px 12px 6px 6px; white-space: normal; }
		.tav { width: 72px; height: 44px; }
		.twho { font-size: var(--fs-small); letter-spacing: 0.02em; }
		.tact { font-size: 19px; }
		.ttitle { display: none; }
		/* the stat plate steps aside while an announcement is up */
		.stats { transition: opacity 0.2s; }
		.toasting .stats { opacity: 0; }
		.tban { font-size: 24px; }

		/* the ident layer covers the art: words at its foot, the stat plate top-right */
		.ident { inset: 0; left: 0; bottom: 0; width: auto; justify-content: flex-end; gap: 0; padding: 0 12px 8px; pointer-events: none; }
		.meta { gap: 8px; margin: 0 0 2px 66px; }
		.star { width: 18px; height: 18px; }
		.cxtag { display: none; }
		.mtag { height: 22px; padding: 0 8px; border-radius: 6px; border-color: var(--brass-line); background: rgba(216,179,106,0.14); color: var(--brass-hi); font-size: var(--fs-micro); letter-spacing: 0.12em; text-transform: uppercase; }
		.nameline { gap: 10px; }
		.logo { width: 56px; height: 56px; }
		.nm { font-size: var(--fs-hero); }
		.ti { margin-top: 2px; font-size: var(--fs-h3); color: var(--brass-hi); opacity: 1; }
		.idrule { display: none; }
		.cols { display: block; margin-top: 10px; }
		.stats { position: absolute; top: 64px; right: 12px; gap: 7px; padding: 10px 12px; border-radius: 14px; background: var(--glass); border: 1px solid var(--brass-line); box-shadow: var(--sh-1); }
		.statrow { grid-template-columns: 18px auto auto; gap: 8px; }
		.sicon { width: 18px; height: 18px; }
		.slabel { display: none; }
		.pips { gap: 3px; }
		.pip { width: 11px; height: 9px; border-radius: 2px; }
		.sval { min-width: 14px; font-size: var(--fs-small); text-align: right; }
		.sval i { font-size: var(--fs-small); }
		.traits, .traits.n4 { display: flex; flex-wrap: wrap; gap: 4px 10px; }
		.trait { min-width: 0; gap: 3px; }
		.trait img, .tdot { width: 32px; height: 32px; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; }
		.trait img { filter: brightness(1.3) drop-shadow(0 2px 4px rgba(0,0,0,0.7)); }
		.tl { font-size: var(--fs-label); letter-spacing: 0.02em; }
		/* six roles still sit on one row */
		.traits.n6 { gap: 4px 5px; }
		.traits.n6 .tl { font-size: var(--fs-micro); letter-spacing: 0; }

		.rightcol { position: relative; top: auto; right: auto; bottom: auto; width: auto; flex: none; gap: 8px; padding: 6px 12px 0; background: var(--abyss); }
		.browsewrap { flex: none; flex-direction: column; gap: 8px; }
		.draft .filters { align-self: stretch; height: auto; flex-direction: row; padding: 3px; gap: 2px; background: var(--well); -webkit-backdrop-filter: none; backdrop-filter: none; }
		.draft .ftab { flex: 1 1 0; width: auto; height: 44px; max-height: none; min-height: 44px; padding: 0 4px; gap: 4px; font-size: var(--fs-body); }
		.draft .ftab.cx img { width: 16px; height: 16px; }
		.draft .ftab.cx b { font-size: var(--fs-body); }
		.draft .ftab.role { display: none; }
		.draft .ftab.cx { flex: 0.95 1 0; }
		.draft .rolesbtn { display: inline-flex; flex: 2.9 1 0; min-width: 0; gap: 5px; }
		.draft .rolesbtn.is-on { font-size: 16px; letter-spacing: 0; }
		.rolesbtn .ico { width: 16px; height: 16px; }
		.rolesbtn span { overflow: hidden; text-overflow: ellipsis; }
		.fsep { display: none; }
		.draft .browse { flex: none; padding: 0; gap: 0; background: none; border: 0; border-radius: 0; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
		.fcap { display: none; }
		.grid { flex: none; grid-template-columns: repeat(8, 1fr); grid-template-rows: none; grid-auto-rows: max-content; gap: 4px; }
		.hero { aspect-ratio: 1; border-radius: 6px; }
		.hero:hover { transform: none; box-shadow: none; }
		.hero.on, .hero.on:hover { box-shadow: 0 0 0 2px var(--brass-hi), 0 0 12px rgba(216,179,106,0.6); }
		.soon { padding: 1px 0 2px; letter-spacing: 0.04em; }
		.tk { height: 4px; }
		.bx { font-size: 22px; }
		.actslot { height: 56px; }
		.oath-txt { gap: 10px; padding: 0 6px; }
		.oath-t { font-size: 19px; }
		.oath-b { height: 48px; }

		.rails, .rails.dense { height: auto; display: flex; flex-direction: column; align-items: stretch; gap: 5px; padding: 8px 12px calc(10px + env(safe-area-inset-bottom)); background: var(--abyss); box-shadow: none; }
		.rails::before { display: none; }
		.rail, .rails.dense .rail { gap: 6px; }
		.rail.orange, .rail.blue { justify-content: flex-start; }
		.pcard, .rails.dense .pcard { max-width: none; height: auto; gap: 8px; padding: 4px 8px 4px 4px; border-bottom-width: 2px; }
		.pav, .rails.dense .pav { width: 46px; height: 38px; border-radius: 6px; }
		.pq { font-size: var(--fs-h3); }
		.pinfo { gap: 1px; }
		.pn, .rails.dense .pn { font-size: var(--fs-body); }
		.pn.long, .rails.dense .pn.long { font-size: 15px; letter-spacing: 0; }
		.pp { font-size: var(--fs-small); }
		.proles, .pstats { display: none; }
		/* 3+ a side: both teams on ONE row of mini cards — the hero's art with the player's name under it */
		.rails.dense { flex-direction: row; gap: 10px; }
		.rails.dense .rail { flex: 1 1 0; gap: 4px; }
		.rails.dense .pcard { flex-direction: column; align-items: stretch; gap: 2px; padding: 3px 3px 2px; }
		.rails.dense .pav { width: 100%; height: 34px; }
		.rails.dense .pinfo { flex: none; width: 100%; align-items: center; text-align: center; }
		.rails.dense .pn { display: none; }
		.rails.dense .pp { max-width: 100%; font-size: var(--fs-micro); letter-spacing: 0; }
		.rails.dense .you { display: none; }
		.rails.dense .banrail { display: none; }
		.vs { display: none; }
		.banrail { justify-content: flex-start; }
		.banav { width: 34px; height: 34px; }

		/* the roles sheet */
		.rolesheet { display: block; position: absolute; inset: 0; z-index: 25; }
		.sheet-scrim { position: absolute; inset: 0; width: 100%; height: 100%; padding: 0; border: 0; background: rgba(3,11,21,0.66); }
		.draft .sheet { position: absolute; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); padding: 14px; display: flex; flex-direction: column; gap: 12px; animation: sheetIn 0.22s var(--ease); }
		.sheet-head { display: flex; align-items: center; justify-content: space-between; }
		.sheet-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

		/* a short art box (small phones, browser bars): the stat plate folds into a row of numbers under the title,
		   the roles lose their captions */
		@container art (max-height: 350px) {
			.meta { margin-left: 56px; }
			.logo { width: 46px; height: 46px; }
			.nm { font-size: 38px; }
			.ti { margin-top: 0; font-size: 16px; }
			.cols { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 6px; }
			.stats, .toasting .stats { position: static; opacity: 1; flex-direction: row; gap: 14px; padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
			.statrow { display: flex; gap: 5px; }
			.pips { display: none; }
			.sicon { width: 16px; height: 16px; }
			.sval { min-width: 0; }
			.traits, .traits.n4, .traits.n6 { gap: 4px 12px; }
			.trait img, .tdot { width: 28px; height: 28px; }
			.tl { display: none; }
		}
		@container art (max-height: 205px) {
			.meta { display: none; }
			.trait img, .tdot { width: 24px; height: 24px; }
		}
		.draft .rolechip { justify-content: flex-start; min-height: 48px; padding: 0 12px; gap: 10px; }
		.rolechip img { width: 28px; height: 28px; object-fit: contain; filter: brightness(1.35) saturate(1.1); }
		.rolechip.is-on img { filter: none; }
		@keyframes sheetIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
	}
</style>
