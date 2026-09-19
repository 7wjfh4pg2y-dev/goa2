<script lang="ts">
	// In-game card surface (manual digital tabletop).
	//
	// Reveal is DERIVED, not stored: when every seated player has committed, all
	// cards are considered revealed and flip face-up simultaneously on every client
	// — nothing to desync. Committing/advancing route through the host (single
	// writer for the card map). Advancing locks the turn's cards into their slots.
	import type { Readable } from 'svelte/store';
	import type { MatchSession, MatchState, Player } from '$lib/match';
	import { teamForSeat } from '$lib/match';
	import Card from '$lib/cards/Card.svelte';
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import { heroCards, heroName, heroTitle, heroStat } from '$lib/cards/deck';
	import { heroAvatar } from '$lib/heroes';
	import { PASS, type PlayerCardState, type StatKey } from '$lib/cards/cardstate';

	export let session: MatchSession;
	export let ms: Readable<MatchState>;
	export let players: Readable<Player[]>;
	export let clientId: string;
	export let onAdvanceTurn: () => void = () => {};

	const ORANGE = '#ef7d22';
	const BLUE = '#2f7fe6';
	const STAT_DEFS: { key: StatKey; icon: string; baseIdx: number | null; label: string }[] = [
		{ key: 'atk', icon: 'item_attack', baseIdx: 0, label: 'Attack' },
		{ key: 'def', icon: 'item_defense', baseIdx: 1, label: 'Defense' },
		{ key: 'init', icon: 'item_initiative', baseIdx: 2, label: 'Initiative' },
		{ key: 'move', icon: 'item_movement', baseIdx: 3, label: 'Mobility' },
		{ key: 'range', icon: 'item_range', baseIdx: null, label: 'Range' },
		{ key: 'radius', icon: 'item_area', baseIdx: null, label: 'Radius' }
	];
	const ui = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const icon = (n: string) => ui[`./cards/images/${n}.png`];
	const GLOW: Record<string, string> = { GOLD: '#e8b64a', SILVER: '#c6d0db', RED: '#e0524a', GREEN: '#41ae59', BLUE: '#3f7fe0', PURPLE: '#a56ee6' };
	const cardGlow = (hero: string, idx: number) => GLOW[heroCards(hero)[idx]?.color] ?? '#efb46a';

	$: seated = ($players ?? []).filter((p) => p.seat >= 0 && p.seat < $ms.seats).sort((a, b) => a.seat - b.seat);
	$: cards = $ms.cards ?? {};
	$: others = seated.filter((p) => p.id !== clientId);
	$: dense = others.length > 6;
	$: teamTint = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'orange' ? ORANGE : BLUE);
	$: teamName = (p: Player) => (teamForSeat(p.seat, $ms.seats) === 'orange' ? 'Orange' : 'Blue');
	$: firstBlueId = others.find((p) => teamForSeat(p.seat, $ms.seats) === 'blue')?.id ?? '';

	$: iAmHost = $ms.host === clientId;
	$: turnIdx = $ms.turn - 1;
	$: seatedWithCards = seated.filter((p) => cards[p.id]);
	// DERIVED reveal: everyone ready ⇒ all cards face-up (same for every client)
	$: readyCount = seatedWithCards.filter((p) => cards[p.id].pending != null).length;
	$: revealed = seatedWithCards.length > 0 && readyCount === seatedWithCards.length;

	const allStats = (cs: PlayerCardState) =>
		STAT_DEFS.map((d) => {
			const base = d.baseIdx !== null ? heroStat(cs.hero, d.baseIdx) : null;
			const delta = cs.items?.[d.key] ?? 0;
			return { ...d, base, delta, cur: (base ?? 0) + delta };
		});

	// overlay + examine
	let overlayId: string | null = null;
	let examine: { hid: string; idx: number } | null = null;
	$: ovPlayer = seated.find((p) => p.id === overlayId) ?? null;

	// local player
	$: mine = cards[clientId] ?? null;
	$: myReady = mine?.pending != null;
	$: canCommit = !!mine && !myReady && !revealed;
	let selected: number | null = null; // card being previewed (centered)
	let committing = false; // preview flip animation on commit
	$: myName = seated.find((p) => p.id === clientId)?.name ?? 'You';

	function preview(idx: number) { selected = idx; }
	function closePreview() { if (!committing) selected = null; }
	function commit(idx: number) {
		if (!canCommit) return;
		committing = true; // flip the preview to its back, then send + close
		setTimeout(() => {
			session.cardAction({ kind: 'commit', pid: clientId, idx });
			committing = false;
			selected = null;
		}, 460);
	}
	function pass() { if (mine && !myReady && !revealed) session.cardAction({ kind: 'pass', pid: clientId }); }
	function takeBack() { if (mine && !revealed) session.cardAction({ kind: 'uncommit', pid: clientId }); }
	function defend(idx: number) { if (mine) { session.cardAction({ kind: 'defend', pid: clientId, idx }); selected = null; } }
	function pullBack(idx: number) { if (mine) session.cardAction({ kind: 'undiscard', pid: clientId, idx }); }
	function forceReveal() { if (iAmHost) session.cardAction({ kind: 'forcepass', pid: clientId }); }

	const fan = (k: number, n: number) => {
		const t = n === 1 ? 0 : k / (n - 1) - 0.5;
		return { rot: t * 11, y: Math.abs(t) * Math.abs(t) * 34 };
	};
</script>

{#if $ms.cards}
	<!-- ───────── right side: the OTHER players ───────── -->
	<div class="ppanel" class:dense>
		<div class="pptitle">
			Players
			<span class="phasetag" class:resolve={revealed}>
				{revealed ? `Revealed · Turn ${$ms.turn}` : `Planning · Turn ${$ms.turn} · ${readyCount}/${seatedWithCards.length} ready`}
			</span>
		</div>
		{#each others as p (p.id)}
			{@const cs = cards[p.id]}
			{#if p.id === firstBlueId}<div class="ppdiv"></div>{/if}
			<button class="prow" style="--tint:{teamTint(p)}" on:click={() => (overlayId = p.id)}>
				<div class="prtop">
					<span class="pav" class:ult={cs?.ultimate}>
						<img src={heroAvatar(cs?.hero ?? '')} alt="" />
						{#if cs?.ultimate}<span class="crown">♛</span>{/if}
					</span>
					<span class="pmid">
						<span class="pname">
							{p.name}<em>Lv {cs?.level ?? 1}</em>
							{#if !revealed && cs?.pending != null}<span class="rdy">Ready</span>{/if}
						</span>
						<span class="phero">{cs ? heroName(cs.hero) : ''}</span>
					</span>
					{#if cs && dense}
						<span class="dslot">
							<TurnSlot heroId={cs.hero} played={cs.turns[turnIdx]} pending={cs.pending} isCurrent {revealed} />
						</span>
					{/if}
				</div>
				{#if cs}
					<div class="pstats">
						{#each allStats(cs) as r}
							<span class="pstat" class:up={r.delta > 0}>
								<span class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</span>
								<img src={icon(r.icon)} alt={r.label} />
								<b>{r.base === null && r.delta === 0 ? '–' : r.cur}</b>
							</span>
						{/each}
					</div>
					{#if !dense}
						<div class="pturns">
							{#each [0, 1, 2, 3] as t}
								<TurnSlot heroId={cs.hero} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} label={`${t + 1}`} />
							{/each}
						</div>
					{/if}
				{/if}
			</button>
		{/each}
	</div>

	<!-- ───────── overlay: a player's whole board ───────── -->
	{#if overlayId && ovPlayer && cards[overlayId]}
		{@const cs = cards[overlayId]}
		{@const oh = cs.hero}
		{@const od = heroCards(oh)}
		<div class="scrim" on:click={() => (overlayId = null)} on:keydown={(e) => e.key === 'Escape' && (overlayId = null)} role="presentation">
			<div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true" tabindex="-1">
				<div class="mhead">
					<span class="mav" class:ult={cs.ultimate} style="--tint:{teamTint(ovPlayer)}"><img src={heroAvatar(oh)} alt="" /></span>
					<div class="mtitle">
						<div class="mnm">{ovPlayer.name} · {heroName(oh)}</div>
						<div class="mtt">{heroTitle(oh)} · {teamName(ovPlayer)} · Lv {cs.level}</div>
					</div>
					{#if cs.ultimate}<span class="mult">♛ Ultimate</span>{/if}
					<button class="ix" on:click={() => (overlayId = null)}>✕</button>
				</div>
				<div class="stats6">
					{#each allStats(cs) as r}
						<div class="stat6" class:up={r.delta > 0}>
							<div class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</div>
							<img class="si" src={icon(r.icon)} alt={r.label} />
							<div class="sv">{r.base === null && r.delta === 0 ? '–' : r.cur}{#if r.delta > 0}<em>+{r.delta}</em>{/if}</div>
							<div class="slbl">{r.label}</div>
						</div>
					{/each}
				</div>
				<div class="ilabel">This round <span class="hint">played cards are open · unplayed are hidden</span></div>
				<div class="turns">
					{#each [0, 1, 2, 3] as t}
						<div class="tbox" class:current={t === turnIdx} style="--tint:{teamTint(ovPlayer)}">
							<div class="tlabel">Turn {t + 1}</div>
							<TurnSlot heroId={oh} played={cs.turns[t]} pending={cs.pending} isCurrent={t === turnIdx} {revealed} examinable
								on:click={() => { const i = cs.turns[t] ?? (t === turnIdx && revealed ? cs.pending : null); if (i != null && i !== PASS) examine = { hid: oh, idx: i }; }} />
						</div>
					{/each}
				</div>
				<div class="piles">
					<div class="pile grow">
						<div class="ilabel">Discard <span class="ct">{cs.discard.length}</span></div>
						<div class="pilerow">
							{#each cs.discard as i}<button class="mini" on:click={() => (examine = { hid: oh, idx: i })}><Card heroId={oh} card={od[i]} /></button>{/each}
							{#if !cs.discard.length}<span class="empty-note">—</span>{/if}
						</div>
					</div>
					<div class="pile">
						<div class="ilabel">Removed <span class="ct">{cs.removed.length}</span></div>
						<div class="rstack">
							{#each cs.removed as i, ri}<button class="rcard" style="--i:{ri}" on:click={() => (examine = { hid: oh, idx: i })}><Card heroId={oh} card={od[i]} /></button>{/each}
							{#if !cs.removed.length}<span class="empty-note">—</span>{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- ───────── examine one card ───────── -->
	{#if examine}
		<div class="scrim2" on:click={() => (examine = null)} on:keydown={(e) => e.key === 'Escape' && (examine = null)} role="presentation">
			<div class="bigcard" role="dialog" aria-modal="true" tabindex="-1"><Card heroId={examine.hid} card={heroCards(examine.hid)[examine.idx]} /></div>
		</div>
	{/if}

	<!-- ───────── centered preview of a picked hand card ───────── -->
	{#if mine && selected != null}
		<div class="pvscrim" on:click={closePreview} on:keydown={(e) => e.key === 'Escape' && closePreview()} role="presentation"></div>
		<div class="pvwrap" role="presentation">
			<div class="pvcard" style="--glow:{cardGlow(mine.hero, selected)}">
				<div class="pvflip" class:up={committing}>
					<div class="pvface front"><Card heroId={mine.hero} card={heroCards(mine.hero)[selected]} /></div>
					<div class="pvface back">
						<span class="band top"></span><span class="emblem"><img src={heroAvatar(mine.hero)} alt="" /></span><span class="band bot"></span>
					</div>
				</div>
			</div>
			<div class="pvbar">
				{#if canCommit}
					<button class="act primary" on:click={() => commit(selected!)}>Commit · Turn {$ms.turn}</button>
					<button class="act danger" on:click={() => defend(selected!)}>Defend (discard)</button>
				{/if}
				<button class="act" on:click={closePreview}>Close</button>
			</div>
		</div>
	{/if}

	<!-- ───────── bottom dashboard: your board + hand + your turns ───────── -->
	{#if mine}
		<div class="dash">
			<!-- left: your stats -->
			<button class="dself" on:click={() => (overlayId = clientId)} title="Open your board">
				<span class="dav" class:ult={mine.ultimate}>
					<img src={heroAvatar(mine.hero)} alt="" />{#if mine.ultimate}<span class="crown">♛</span>{/if}
				</span>
				<span class="dsmid">
					<span class="dsname">{myName}<em>Lv {mine.level}</em></span>
					<span class="dshero">{heroName(mine.hero)}</span>
				</span>
				<span class="dstats">
					{#each allStats(mine) as r}
						<span class="pstat" class:up={r.delta > 0}>
							<span class="stripes">{#each Array(r.delta) as _}<span class="stripe"></span>{/each}</span>
							<img src={icon(r.icon)} alt={r.label} /><b>{r.base === null && r.delta === 0 ? '–' : r.cur}</b>
						</span>
					{/each}
				</span>
			</button>

			<!-- centre: hand + status line -->
			<div class="dhand">
				<div class="tray">
					{#each mine.hand as idx, k (idx)}
						{@const f = fan(k, mine.hand.length)}
						<button class="hc" class:committed={mine.pending === idx} style="--rot:{f.rot}deg; --y:{f.y}px" on:click={() => preview(idx)}>
							<Card heroId={mine.hero} card={heroCards(mine.hero)[idx]} />
						</button>
					{/each}
				</div>
				<div class="dstatus">
					{#if revealed}
						<span class="pill">Cards revealed — resolve on the board</span>
						<button class="act primary sm" on:click={onAdvanceTurn}>Next turn →</button>
					{:else if myReady}
						<span class="pill">{mine.pending === PASS ? 'Passing' : 'Ready'} ✓ · {readyCount}/{seatedWithCards.length} ready</span>
						<button class="act sm" on:click={takeBack}>Take back</button>
						{#if iAmHost}<button class="act ghost sm" on:click={forceReveal} title="Reveal now — auto-pass anyone not ready">Force reveal</button>{/if}
					{:else}
						<span class="hint2">Tap a card to preview — {readyCount}/{seatedWithCards.length} ready</span>
						<button class="act ghost sm" on:click={pass}>Pass</button>
						{#if mine.discard.length}<span class="recover">Recover: {#each mine.discard as i}<button class="rec" on:click={() => pullBack(i)}>{heroCards(mine.hero)[i].name}</button>{/each}</span>{/if}
					{/if}
				</div>
			</div>

			<!-- right: your round at a glance (4 turns + discard) -->
			<div class="dmine">
				<div class="dm-label">This round</div>
				<div class="dm-turns">
					{#each [0, 1, 2, 3] as t}
						<div class="dm-slot">
							<span class="dm-n">{t + 1}</span>
							<TurnSlot heroId={mine.hero} played={mine.turns[t]} pending={mine.pending} isCurrent={t === turnIdx} {revealed}
								examinable on:click={() => { const i = mine.turns[t] ?? (t === turnIdx && revealed ? mine.pending : null); if (i != null && i !== PASS) examine = { hid: mine.hero, idx: i }; }} />
						</div>
					{/each}
					<div class="dm-disc">
						<span class="dm-n">Disc {mine.discard.length}</span>
						<div class="dm-dstack">
							{#each mine.discard.slice(-3) as i, di}<button class="dm-dc" style="--i:{di}" on:click={() => (examine = { hid: mine.hero, idx: i })}><Card heroId={mine.hero} card={heroCards(mine.hero)[i]} /></button>{/each}
							{#if !mine.discard.length}<span class="dm-empty">—</span>{/if}
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}

<style>
	/* right-side player panel */
	.ppanel { position: absolute; top: 12px; right: 12px; bottom: 12px; z-index: 6; width: 244px; padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; color: #e5e7eb; background: rgba(9,13,22,.72); backdrop-filter: blur(9px); border: 1px solid rgba(199,154,78,.4); border-radius: 14px; }
	.pptitle { font-size: .6rem; letter-spacing: .16em; text-transform: uppercase; font-weight: 800; color: #b8a06a; padding: 2px 4px 4px; display: flex; flex-direction: column; gap: 3px; }
	.phasetag { font-size: .56rem; letter-spacing: .04em; font-weight: 700; color: #7d8ba0; text-transform: none; }
	.phasetag.resolve { color: #efb46a; }
	.ppdiv { height: 1px; margin: 5px 2px; background: linear-gradient(90deg, transparent, rgba(199,154,78,.35), transparent); }
	.prow { display: flex; flex-direction: column; gap: 5px; padding: 7px; border-radius: 12px; cursor: pointer; text-align: left; background: rgba(12,18,32,.44); border: 1px solid rgba(255,255,255,.1); border-left: 3px solid var(--tint); color: #e5e7eb; transition: transform .12s, background .12s; }
	.prow:hover { background: rgba(20,28,46,.6); transform: translateY(-2px); }
	.prtop { display: flex; align-items: center; gap: 9px; }
	.pav { position: relative; width: 2.4rem; height: 2.4rem; border-radius: 50%; overflow: visible; border: 2px solid var(--tint); flex: none; }
	.pav img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.pav.ult { border-color: #b482f0; box-shadow: 0 0 9px rgba(160,110,235,.65); }
	.pav .crown { position: absolute; top: -8px; right: -6px; font-size: .82rem; color: #d9b6ff; text-shadow: 0 1px 3px #000; }
	.pmid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; line-height: 1.05; }
	.pname { font-family: 'Modesto Poster', serif; font-size: .9rem; color: #f3f6fb; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
	.pname em { font-style: normal; font-size: .58rem; font-weight: 700; color: #8b9bb0; }
	.rdy { font-family: 'Inter', sans-serif; font-size: .5rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #16351f; background: #4ade80; border-radius: 5px; padding: 1px 5px; }
	.phero { font-size: .62rem; color: #93a3b8; }
	.dslot { width: 2rem; flex: none; }
	.pstats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }
	.pstat { position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 3px 0 2px; border-radius: 6px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); }
	.pstat img { height: .82rem; filter: brightness(0) invert(1); opacity: .55; }
	.pstat b { font-size: .68rem; font-weight: 800; color: #b9c4d2; font-variant-numeric: tabular-nums; }
	.pstat .stripes { position: absolute; top: 2px; left: 0; right: 0; display: flex; justify-content: center; gap: 1.5px; height: 3px; }
	.pstat .stripe { width: 4px; height: 2px; transform: skewX(-24deg); background: #ffb774; border-radius: 1px; }
	.pstat.up { background: rgba(239,125,34,.16); border-color: rgba(239,125,34,.45); padding-top: 6px; }
	.pstat.up img { opacity: 1; } .pstat.up b { color: #ffcfa3; }
	.pturns { display: grid; grid-template-columns: repeat(4, 47px); gap: 4px; justify-content: center; }
	.ppanel.dense .prow { gap: 4px; padding: 5px 6px; }
	.ppanel.dense .pav { width: 1.9rem; height: 1.9rem; }
	.ppanel.dense .pname { font-size: .78rem; }
	.ppanel.dense .phero { font-size: .56rem; }
	.ppanel.dense .pstat b { font-size: .62rem; }
	.ppanel.dense .pstat img { height: .72rem; }

	/* overlay */
	.scrim { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(3,6,12,.62); backdrop-filter: blur(3px); }
	.modal { width: min(780px, 94vw); max-height: 90vh; overflow-y: auto; padding: 16px 18px; color: #e5e7eb; background: rgba(11,16,26,.94); border: 1px solid rgba(199,154,78,.5); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.7); }
	.mhead { display: flex; align-items: center; gap: 11px; margin-bottom: 12px; }
	.mav { position: relative; width: 3rem; height: 3rem; border-radius: 50%; overflow: hidden; border: 2px solid var(--tint); flex: none; }
	.mav img { width: 100%; height: 100%; object-fit: cover; }
	.mav.ult { border-color: #b482f0; box-shadow: 0 0 11px rgba(160,110,235,.7); }
	.mnm { font-family: 'Modesto Poster', serif; font-size: 1.25rem; color: #f6ead2; }
	.mtt { font-size: .72rem; color: #b8a06a; }
	.mult { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 8px; font-size: .72rem; font-weight: 800; letter-spacing: .04em; color: #efe0ff; background: linear-gradient(90deg, rgba(139,79,214,.34), rgba(139,79,214,.14)); border: 1px solid rgba(180,130,240,.55); }
	.ix { margin-left: auto; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: #cbd5e1; border-radius: 7px; width: 1.9rem; height: 1.9rem; cursor: pointer; flex: none; }
	.ilabel { font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #93a3b8; display: flex; align-items: center; gap: 6px; margin: 10px 0 6px; }
	.ilabel .ct { color: #f1f5f9; background: rgba(255,255,255,.08); border-radius: 5px; padding: 0 6px; }
	.ilabel .hint { margin-left: auto; font-size: .54rem; letter-spacing: .04em; text-transform: none; font-weight: 600; color: #6b7a8d; }
	.stats6 { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
	.stat6 { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 4px 7px; border-radius: 12px; background: rgba(12,18,32,.5); border: 1px solid rgba(255,255,255,.1); }
	.stat6 .si { height: 1.3rem; filter: brightness(0) invert(1); opacity: .55; }
	.stat6 .sv { font-size: 1.1rem; font-weight: 800; color: #c3ccd8; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 3px; }
	.stat6 .sv em { font-style: normal; font-size: .66rem; font-weight: 800; color: #8b9bb0; }
	.stat6 .slbl { font-size: .5rem; letter-spacing: .08em; text-transform: uppercase; color: #6b7a8d; }
	.stat6 .stripes { position: absolute; top: 5px; left: 0; right: 0; display: flex; justify-content: center; gap: 3px; height: 5px; }
	.stat6 .stripe { width: 9px; height: 3px; transform: skewX(-24deg); border-radius: 1px; background: linear-gradient(90deg, #efb46a, #ef7d22); box-shadow: 0 0 5px rgba(239,125,34,.6); }
	.stat6.up { background: linear-gradient(180deg, rgba(239,125,34,.2), rgba(239,125,34,.05)); border-color: rgba(239,125,34,.5); box-shadow: 0 0 0 1px rgba(239,125,34,.15), 0 6px 18px rgba(239,125,34,.12); }
	.stat6.up .si { opacity: 1; } .stat6.up .sv { color: #ffd7ad; } .stat6.up .sv em { color: #ffb774; } .stat6.up .slbl { color: #d8a878; }
	.turns { display: flex; align-items: stretch; gap: 10px; }
	.tbox { flex: 1; display: flex; flex-direction: column; gap: 7px; padding: 9px 8px 10px; border-radius: 16px; background: rgba(12,18,32,.46); border: 1px solid rgba(255,255,255,.12); border-bottom: 3px solid var(--tint); box-shadow: 0 12px 30px rgba(0,0,0,.4); }
	.tbox.current { border-color: rgba(199,154,78,.5); border-bottom-color: #efb46a; box-shadow: 0 0 0 1px rgba(199,154,78,.3), 0 12px 34px rgba(199,154,78,.18); }
	.tlabel { text-align: center; font-family: 'Modesto Poster', serif; font-size: .78rem; letter-spacing: .04em; color: #f6ead2; }
	.piles { display: flex; gap: 22px; align-items: flex-start; }
	.pile { display: flex; flex-direction: column; } .pile.grow { flex: 1; }
	.pilerow { display: flex; flex-wrap: wrap; gap: 5px; }
	.mini { width: 46px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,.5); }
	.mini:hover { outline: 2px solid rgba(199,154,78,.6); }
	.rstack { display: flex; padding-left: 6px; }
	.rcard { width: 40px; margin-left: -18px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; opacity: .8; box-shadow: 0 2px 6px rgba(0,0,0,.6); transition: transform .12s, opacity .12s; }
	.rcard:first-child { margin-left: 0; }
	.rcard:hover { transform: translateY(-6px); opacity: 1; z-index: 2; }
	.empty-note { color: #55637a; font-size: .8rem; padding: 4px; }

	/* examine */
	.scrim2 { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(2,4,9,.8); backdrop-filter: blur(4px); }
	.bigcard { width: min(360px, 62vw); filter: drop-shadow(0 20px 50px rgba(0,0,0,.7)); }
	.bigcard :global(canvas) { border-radius: 4%; }

	/* centered preview of a picked hand card */
	.pvscrim { position: fixed; inset: 0; z-index: 30; background: rgba(3,6,12,.55); backdrop-filter: blur(3px); }
	.pvwrap { position: fixed; inset: 0; z-index: 31; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; pointer-events: none; }
	.pvcard { width: min(320px, 56vw); border-radius: 5%; pointer-events: auto; perspective: 1400px; }
	.pvflip { position: relative; width: 100%; aspect-ratio: 1192 / 1664; transform-style: preserve-3d; transition: transform .46s cubic-bezier(.4,.15,.2,1); }
	.pvflip.up { transform: rotateY(180deg); }
	.pvface { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 3%; overflow: hidden; }
	.pvface.front :global(canvas) { display: block; width: 100%; border-radius: 3%; }
	.pvcard { box-shadow: 0 0 0 3px var(--glow), 0 0 44px var(--glow), 0 24px 60px rgba(0,0,0,.7); }
	.pvface.back { transform: rotateY(180deg); display: flex; flex-direction: column; background: radial-gradient(115% 78% at 50% 40%, #fdfcf8, #efe9db 62%, #ddd4c1 100%); box-shadow: inset 0 0 0 1px rgba(120,95,55,.4); }
	.pvface.back .band { position: relative; height: 13%; background: linear-gradient(180deg, #2c333f, #1a1f28); }
	.pvface.back .band::after { content: ''; position: absolute; left: 8%; right: 8%; height: 2px; background: linear-gradient(90deg, transparent, #caa25e 25%, #f2d89e 50%, #caa25e 75%, transparent); }
	.pvface.back .band.top::after { bottom: 0; } .pvface.back .band.bot::after { top: 0; }
	.pvface.back .emblem { flex: 1; display: grid; place-items: center; padding: 12%; }
	.pvface.back .emblem img { width: 60%; border-radius: 50%; opacity: .85; }
	.pvbar { pointer-events: auto; display: flex; gap: 8px; }

	/* bottom dashboard */
	.dash { position: absolute; left: 224px; right: 260px; bottom: 12px; z-index: 9; display: flex; align-items: flex-end; gap: 12px; padding: 10px 14px; border-radius: 16px; background: rgba(9,13,22,.82); backdrop-filter: blur(9px); border: 1px solid rgba(199,154,78,.45); box-shadow: 0 12px 34px rgba(0,0,0,.5); color: #e5e7eb; }
	.dself { display: grid; grid-template-columns: auto 1fr; grid-template-areas: 'av mid' 'stats stats'; gap: 5px 8px; align-items: center; background: none; border: none; cursor: pointer; color: inherit; text-align: left; flex: none; }
	.dself:hover .dsname { color: #fff; }
	.dav { grid-area: av; position: relative; width: 2.6rem; height: 2.6rem; border-radius: 50%; overflow: visible; border: 2px solid rgba(199,154,78,.6); flex: none; }
	.dav img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
	.dav.ult { border-color: #b482f0; box-shadow: 0 0 10px rgba(160,110,235,.7); }
	.dav .crown { position: absolute; top: -8px; right: -6px; font-size: .9rem; color: #d9b6ff; text-shadow: 0 1px 3px #000; }
	.dsmid { grid-area: mid; display: flex; flex-direction: column; gap: 2px; line-height: 1.05; }
	.dsname { font-family: 'Modesto Poster', serif; font-size: 1rem; color: #f6ead2; display: flex; align-items: baseline; gap: 5px; }
	.dsname em { font-style: normal; font-size: .6rem; font-weight: 700; color: #9aa8bc; }
	.dshero { font-size: .64rem; color: #93a3b8; }
	.dstats { grid-area: stats; display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; width: 12.5rem; }

	.dhand { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
	.tray { display: flex; align-items: flex-end; justify-content: center; height: 130px; }
	.hc { width: 92px; margin: 0 -12px; padding: 0; background: none; border: none; cursor: pointer; transform-origin: bottom center; transform: translateY(var(--y)) rotate(var(--rot)); transition: transform .16s; }
	.hc :global(canvas) { display: block; width: 100%; border-radius: 6%; box-shadow: 0 8px 18px rgba(0,0,0,.55); }
	.hc:hover { transform: translateY(calc(var(--y) - 20px)) rotate(var(--rot)) scale(1.07); z-index: 5; }
	.hc.committed :global(canvas) { outline: 2px solid #efb46a; opacity: .75; }
	.dstatus { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center; }
	.pill { font-size: .74rem; font-weight: 700; color: #cdd6e2; }
	.hint2 { font-size: .72rem; color: #93a3b8; }
	.recover { font-size: .64rem; color: #93a3b8; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
	.rec { font-size: .6rem; padding: 2px 7px; border-radius: 6px; border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #cbd5e1; cursor: pointer; }
	.act { border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.08); color: #e5e7eb; border-radius: 8px; padding: 6px 14px; font-weight: 700; cursor: pointer; font-size: .82rem; }
	.act.sm { padding: 4px 10px; font-size: .76rem; }
	.act.primary { background: #ef7d22; color: #1a0f06; border-color: transparent; box-shadow: 0 3px 0 #a8560f; }
	.act.danger { background: rgba(220,60,60,.25); border-color: rgba(220,60,60,.5); color: #ffb4b4; }
	.act.ghost { background: transparent; }

	.dmine { flex: none; display: flex; flex-direction: column; gap: 4px; }
	.dm-label { font-size: .56rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; color: #b8a06a; }
	.dm-turns { display: flex; gap: 5px; align-items: flex-start; }
	.dm-slot { width: 42px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
	.dm-n { font-size: .5rem; font-weight: 700; color: #8b9bb0; letter-spacing: .04em; }
	.dm-disc { display: flex; flex-direction: column; align-items: center; gap: 2px; padding-left: 6px; border-left: 1px solid rgba(255,255,255,.12); }
	.dm-dstack { display: flex; width: 52px; height: 56px; align-items: flex-start; }
	.dm-dc { width: 40px; margin-left: -24px; padding: 0; background: none; border: none; cursor: zoom-in; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,.6); }
	.dm-dc:first-child { margin-left: 0; }
	.dm-dc :global(canvas) { display: block; width: 100%; border-radius: 4px; }
	.dm-empty { color: #55637a; font-size: .8rem; }
</style>
