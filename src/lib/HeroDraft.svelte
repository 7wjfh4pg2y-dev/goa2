<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Readable } from 'svelte/store';
	import {
		HEROES_ALPHA, heroAvatar, heroSplash, heroLogo, heroById,
		statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, PACK_LABELS
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

	$: inPool = d ? new Set(d.pool) : new Set<string>();
	// a hero is unavailable if it's outside the complexity pool, picked, or banned
	$: unavailable = (h: string) => !inPool.has(h) || blocked.has(h);

	let sel = '';
	let myWant = ''; // all-pick self-heal target
	// initial highlight: first available hero (don't reset after every action —
	// leave `sel` on what you just picked/banned)
	$: if (d && !sel) sel = HEROES_ALPHA.find((h) => inPool.has(h.id))?.id ?? HEROES_ALPHA[0].id;
	// when it BECOMES your turn, snap to a fresh valid option (once per step)
	let snapStep = -1;
	$: if (d && d.order.length && myTurn && d.step !== snapStep) {
		snapStep = d.step;
		sel = d.system === 'single-draft'
			? (d.offer[0] ?? sel)
			: (HEROES_ALPHA.find((h) => inPool.has(h.id) && !blocked.has(h.id))?.id ?? sel);
	}
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
			toastTimer = setTimeout(() => (toastAction = null), 4200);
		}
	}
	$: toastHero = toastAction ? heroById(toastAction.hero) : undefined;

	// ---- resilience: countdown + host watchdog --------------------------------
	let now = Date.now();
	$: secsLeft = d && d.deadline && !complete ? Math.max(0, Math.ceil((d.deadline - now) / 1000)) : null;
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
		if (!iAmHost || !d || complete) { absentActor = ''; return; }
		const timedOut = d.deadline > 0 && now >= d.deadline;
		if (d.order.length) {
			const actor = activeActor;
			const present = !!actor && $players.some((p) => p.id === actor);
			if (present) absentActor = '';
			else if (actor && absentActor !== actor) { absentActor = actor; absentAt = now; }
			const dropped = !present && !!actor && now - absentAt > 8000;
			if (timedOut || dropped) { absentActor = ''; autoAdvance(); }
		} else if (timedOut) {
			fillMissing(); // all-pick phase timer elapsed
		}
	}
	let ticker: ReturnType<typeof setInterval>;
	onMount(() => { ticker = setInterval(watchdog, 1000); });
	onDestroy(() => { clearInterval(ticker); clearTimeout(toastTimer); });

	// top banner text
	$: banner = (() => {
		if (!d) return '';
		if (complete) return 'Draft complete';
		if (d.system === 'all-pick') return myPick ? 'Waiting for the others…' : 'All Pick — choose your hero';
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
	function onAction() { if (complete) startGame(); else act(); }
</script>

{#if d && selHero}
<div class="draft">
	<button class="leave" on:click={onLeave} title="Leave">✕</button>
	<div class="stage">
		<img class="splash" src={heroSplash(sel)} alt={selHero.name} />
		<div class="scrim"></div>
		<div class="turn t-{bannerTeam ?? 'orange'}"><span class="dot"></span>{banner}{#if countdown}<span class="clock" class:urgent={secsLeft != null && secsLeft <= 10}>{countdown}</span>{/if}{#if !complete && d.order.length}<span class="mode">· {DRAFT_LABELS[d.system]}</span>{/if}</div>
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
			<div class="browse">
				{#each HEROES_ALPHA as h (h.id)}
					<button class="hero" class:on={sel === h.id} class:gone={unavailable(h.id)}
						class:dim={d.system === 'single-draft' && myTurn && inPool.has(h.id) && !d.offer.includes(h.id) && !blocked.has(h.id)}
						disabled={!inPool.has(h.id)}
						on:click={() => (sel = h.id)}>
						<img src={heroAvatar(h.id)} alt={h.name} />
					</button>
				{/each}
			</div>
			<button class="lockin" style="background:{actionBg}" disabled={!actionEnabled} on:click={onAction}>{actionLabel}</button>
		</div>
	</div>

	<footer class="rails">
		<div class="rail orange">
			<span class="rl">Orange</span>
			{#each rosters.orange as id (id)}
				<div class="rslot" class:filled={d.picks[id]} class:active={id === activeActor} title={nameOf(id)}>
					{#if d.picks[id]}<img src={heroAvatar(d.picks[id])} alt="" />{/if}
				</div>
			{/each}
		</div>
		<div class="banrail"><span class="rl">Bans</span>{#each d.bans as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}{#if !d.bans.length}<span class="nobans">—</span>{/if}</div>
		<div class="rail blue">
			{#each rosters.blue as id (id)}
				<div class="rslot" class:filled={d.picks[id]} class:active={id === activeActor} title={nameOf(id)}>
					{#if d.picks[id]}<img src={heroAvatar(d.picks[id])} alt="" />{/if}
				</div>
			{/each}
			<span class="rl">Blue</span>
		</div>
	</footer>
</div>
{/if}

<style>
	.draft { min-height: 100vh; display: flex; flex-direction: column; color: #f1f5f9; }
	.leave { position: absolute; top: 14px; left: 16px; z-index: 5; width: 34px; height: 34px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.4); color: #e5e7eb; cursor: pointer; font-size: 0.9rem; }
	.leave:hover { background: rgba(0,0,0,0.6); }
	.stage { position: relative; flex: 1; overflow: hidden; }
	.splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; }
	.scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(9,13,22,0.94) 0%, rgba(9,13,22,0.6) 40%, rgba(9,13,22,0.12) 66%, rgba(9,13,22,0.35) 100%); }
	.turn { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; font-weight: 700; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 7px 18px; font-size: 1.05rem; }
	.turn .mode { color: #94a3b8; font-weight: 600; font-size: 0.85rem; }
	.turn .clock { font-variant-numeric: tabular-nums; background: rgba(0,0,0,0.35); border-radius: 7px; padding: 1px 8px; font-size: 0.95rem; }
	.turn .clock.urgent { color: #fca5a5; box-shadow: 0 0 0 1px rgba(239,68,68,0.5); }
	.toast { position: absolute; top: 62px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px; background: linear-gradient(180deg, rgba(16,22,38,0.82), rgba(9,13,22,0.82)); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.12); border-left-width: 4px; border-radius: 12px; padding: 8px 16px 8px 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); white-space: nowrap; animation: toastIn 0.3s cubic-bezier(0.2,0.9,0.2,1); }
	.toast.t-orange { border-left-color: #ef7d22; }
	.toast.t-blue { border-left-color: #2f7fe6; }
	.tav { position: relative; width: 42px; height: 42px; flex: 0 0 auto; }
	.tav img { width: 42px; height: 42px; border-radius: 9px; object-fit: cover; border: 1px solid rgba(255,255,255,0.18); }
	.toast.ban .tav img { filter: grayscale(1) brightness(0.6); }
	.tban { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fca5a5; font-size: 1.5rem; font-weight: 800; text-shadow: 0 1px 4px #000; }
	.ttext { display: flex; flex-direction: column; gap: 1px; line-height: 1.15; }
	.twho { font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; color: #94a3b8; }
	.t-orange .tteam { color: #ef9a5a; font-weight: 700; }
	.t-blue .tteam { color: #6ea8f0; font-weight: 700; }
	.tact { font-family: 'Modesto Poster', serif; font-size: 1.15rem; letter-spacing: 0.01em; }
	.tverb { text-transform: uppercase; font-size: 0.9rem; letter-spacing: 0.05em; color: #6ee7b7; margin-right: 3px; }
	.toast.ban .tverb { color: #fca5a5; }
	.ttitle { color: #cbd5e1; font-size: 0.95rem; }
	@keyframes toastIn { from { opacity: 0; transform: translate(-50%, -10px) scale(0.96); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
	.hero:disabled { cursor: default; }
	.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #ef7d22; box-shadow: 0 0 10px #ef7d22; }
	.t-blue .dot { background: #2f7fe6; box-shadow: 0 0 10px #2f7fe6; }

	.stats { position: absolute; top: 26px; left: 34px; display: flex; flex-direction: column; gap: 9px; }
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

	.rightcol { position: absolute; top: 16px; right: 16px; width: 300px; display: flex; flex-direction: column; gap: 10px; }
	.browse { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 12px; background: rgba(9,13,22,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; backdrop-filter: blur(6px); }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 9px; padding: 0; cursor: pointer; overflow: hidden; transition: transform 0.1s; }
	.hero img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
	.hero:hover { transform: scale(1.06); }
	.hero.on { box-shadow: 0 0 0 2px #f59e0b; border-color: transparent; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }
	.hero.dim { filter: brightness(0.55); }
	.lockin { width: 100%; border: 1px solid rgba(255,255,255,0.32); color: #fff; border-radius: 12px; padding: 0.85rem 1rem; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
	.lockin:disabled { opacity: 0.45; cursor: not-allowed; }

	.rails { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding: 12px 24px; background: rgba(9,13,22,0.72); border-top: 1px solid rgba(255,255,255,0.1); }
	.rail { display: flex; align-items: center; gap: 8px; }
	.rail.blue { justify-content: flex-end; }
	.rl { font-family: 'Modesto Poster', serif; font-size: 1rem; letter-spacing: 0.03em; }
	.orange .rl { color: #ef9a5a; }
	.blue .rl { color: #6ea8f0; }
	.banrail .rl { color: #94a3b8; }
	.rslot { width: 50px; height: 50px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,18,32,0.6); overflow: hidden; }
	.orange .rslot { border-bottom: 3px solid #ef7d22; }
	.blue .rslot { border-bottom: 3px solid #2f7fe6; }
	.rslot img { width: 100%; height: 100%; object-fit: cover; }
	.rslot.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 14px rgba(245,158,11,0.5); }
	.banrail { display: flex; align-items: center; gap: 6px; justify-content: center; }
	.ban { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; filter: grayscale(1) brightness(0.45); }
	.nobans { color: #64748b; }
</style>
