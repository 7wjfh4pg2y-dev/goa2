<script lang="ts">
	// Takahide's dash button: a small fan of his three gold cards — the ones he holds lit, those in his deck dark. It
	// glows when he may swap (a gold of his is the card acting, or Bushido is), with a violet rim once Ready for War is
	// on. A tap opens the gold panel above it (the phone: a sheet over the dash): each gold tagged with where it lies;
	// while a swap is open, a tap on one in his deck hands it to the action ring, which confirms Swap.
	import { onDestroy } from 'svelte';
	import Card from '$lib/cards/Card.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { goldsOf, type PlayerCardState } from '$lib/cards/cardstate';
	import { heldGolds, spotOf } from '$lib/heropower';

	export let cs: PlayerCardState;
	/** 'gold' / 'bushido' = a swap is open now; null = look only */
	export let kind: 'gold' | 'bushido' | null = null;
	export let fx = true; // the Dashboard switch (the glow)
	export let size = 48;
	export let phone = false;
	export let turnIdx = 0;
	/** the panel as a centred window (the host fixing it from the Game lobby) instead of a pop-up from the button */
	export let modal = false;
	export let title = '';
	/** the gold from his deck to swap in (the ring confirms), or null when nothing is picked */
	export let onPick: (idx: number | null) => void = () => {};
	export let onClose: () => void = () => {};

	const ROMAN = ['I', 'II', 'III', 'IV'];
	const H = 'takahide';
	$: golds = goldsOf(H);
	$: held = heldGolds(cs);
	$: canPick = modal || kind != null;
	let open = modal;
	let pick: number | null = null;
	$: if (!canPick && pick != null) pick = null;
	// the swap landed: the picked card is now one he holds
	$: if (pick != null && held.includes(pick)) { pick = null; if (!modal) open = false; }
	$: onPick(pick);
	const tag = (i: number) => {
		const sp = spotOf(cs, i);
		if (!held.includes(i)) return { cls: 'deck', txt: 'Deck' };
		if (sp.at === 'hand') return { cls: 'hand', txt: 'Hand' };
		if (sp.at === 'pending') return { cls: 'act', txt: `Turn ${ROMAN[turnIdx] ?? ''}` };
		if (sp.at === 'turn') return { cls: 'act', txt: `Turn ${ROMAN[sp.t]}` };
		if (sp.at === 'discard') return { cls: 'disc', txt: 'Discard' };
		return { cls: 'deck', txt: 'Deck' };
	};
	const choose = (i: number) => { if (!canPick || held.includes(i)) return; pick = pick === i ? null : i; };
	// where the new card would land (shown on the picked one)
	$: lands = kind === 'gold' || !held.length ? '' : (() => { const sp = spotOf(cs, held[0]); return sp.at === 'turn' || sp.at === 'discard' ? 'face down' : ''; })();
	function toggle() { open = !open; if (!open) pick = null; }
	function close() { if (modal) onClose(); else { open = false; pick = null; } }
	const onKey = (e: KeyboardEvent) => { if (open && e.key === 'Escape') close(); };
	onDestroy(() => onPick(null));
</script>

<svelte:window on:keydown={onKey} />
<span class="tg" class:modal style="--z:{size}px">
	{#if !modal}
		<button class="gb" class:ready={kind != null} class:ult={cs.ultimate} class:open on:click={toggle} title={kind ? 'Swap your gold card' : 'Your gold cards'} aria-label="Gold cards">
			{#if kind && fx}<i class="glow"></i>{/if}
			<span class="fan">
				{#each [golds[1], golds[0], golds[2]] as g (g)}
					{#if g != null}<span class="mini" class:dim={!held.includes(g)}><Card heroId={H} card={heroCards(H)[g]} /></span>{/if}
				{/each}
			</span>
		</button>
	{/if}
	{#if open}
		<div class="gp" class:sheet={phone && !modal} class:win={modal} role="dialog" tabindex="-1" aria-label="Gold cards" on:click|stopPropagation on:keydown|stopPropagation={(e) => e.key === 'Escape' && close()}>
			<div class="hd"><b>{title || (kind === 'bushido' ? 'Bushido' : 'Gold cards')}</b><span>{canPick ? 'tap one in your deck' : ''}</span><button class="x" on:click={close} aria-label="Close">✕</button></div>
			<div class="row">
				{#each golds as g (g)}
					{@const t = tag(g)}
					<button class="gc {t.cls}" class:pick={pick === g} class:can={canPick && !held.includes(g)} disabled={!canPick || held.includes(g)} on:click={() => choose(g)}>
						<span class="cw"><Card heroId={H} card={heroCards(H)[g]} /></span>
						<em class="tag {t.cls}">{t.txt}{#if pick === g && lands} · {lands}{/if}</em>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</span>

<style>
	.tg { position: relative; display: inline-grid; place-items: center; width: var(--z); height: var(--z); }
	.tg.modal { width: auto; height: auto; }
	.gb { position: relative; width: 100%; height: 100%; padding: 0; border: 0; border-radius: 50%; display: grid; place-items: center; cursor: pointer; pointer-events: auto;
		background: radial-gradient(circle at 50% 40%, #1d3550, #08131f); box-shadow: inset 0 0 0 1.5px rgba(216, 179, 106, 0.55), 0 2px 6px rgba(0, 0, 0, 0.5); }
	.gb.ult { box-shadow: inset 0 0 0 2px #a46be8, 0 2px 6px rgba(0, 0, 0, 0.5); }
	.gb.ready { box-shadow: inset 0 0 0 2px #e3b341, 0 0 12px rgba(227, 179, 65, 0.6); }
	.gb.open { box-shadow: inset 0 0 0 2px #f4dfa8; }
	.glow { position: absolute; inset: -18%; border-radius: 50%; background: radial-gradient(closest-side, rgba(255, 214, 120, 0.55), transparent); animation: tgg 1.8s ease-in-out infinite; pointer-events: none; }
	@keyframes tgg { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }
	.fan { position: relative; width: 78%; height: 74%; }
	.mini { position: absolute; left: 50%; bottom: 0; width: 42%; transform-origin: 50% 110%; border-radius: 3px; overflow: hidden; box-shadow: 0 0 0 1px #e3b341, 0 2px 4px rgba(0, 0, 0, 0.6); }
	.mini :global(.cardface) { display: block; width: 100%; }
	.mini:nth-child(1) { transform: translateX(-50%) rotate(-22deg); }
	.mini:nth-child(2) { transform: translateX(-50%); z-index: 1; }
	.mini:nth-child(3) { transform: translateX(-50%) rotate(22deg); }
	.mini.dim { filter: grayscale(0.7) brightness(0.72); }

	.gp { position: absolute; bottom: calc(100% + 24px); left: 50%; transform: translateX(-50%); z-index: 30; width: 330px; box-sizing: border-box; padding: 10px 12px 12px; border-radius: 14px; pointer-events: auto; color: #f2ecdf; text-align: left;
		background: linear-gradient(180deg, rgba(16, 40, 66, 0.99), rgba(6, 19, 34, 0.99)); border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); }
	.gp::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: rgb(6, 19, 34); border-right: 1px solid rgba(216, 179, 106, 0.45); border-bottom: 1px solid rgba(216, 179, 106, 0.45); }
	.gp.sheet { position: fixed; left: 8px; right: 8px; width: auto; transform: none; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); }
	.gp.win { position: relative; left: auto; bottom: auto; transform: none; width: 360px; }
	.gp.sheet::after, .gp.win::after { display: none; }
	.hd { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
	.hd b { font-size: 15px; font-weight: normal; color: #f4dfa8; }
	.hd span { flex: 1; text-align: right; font-size: 11px; color: #a9b6c6; }
	.x { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #c9d4df; font-size: 11px; cursor: pointer; }
	.row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.gc { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0 7px; border-radius: 10px; border: 1px solid transparent; background: rgba(0, 0, 0, 0.2); color: inherit; font: inherit; cursor: default; }
	.gc:disabled { opacity: 1; }
	.gc.can { cursor: pointer; border-color: rgba(227, 179, 65, 0.35); }
	.gc.can:hover { border-color: rgba(227, 179, 65, 0.7); }
	.gc.pick { border: 1.5px solid #e3b341; background: rgba(227, 179, 65, 0.12); }
	.cw { width: 78%; border-radius: 6px; overflow: hidden; box-shadow: 0 0 0 1.5px #e3b341, 0 4px 10px rgba(0, 0, 0, 0.5); }
	.cw :global(.cardface) { display: block; width: 100%; }
	.gc.deck:not(.pick) .cw { filter: brightness(0.72); }
	.tag { font-style: normal; font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 8px; border-radius: 9px; color: #c9d4df; background: rgba(255, 255, 255, 0.08); white-space: nowrap; }
	.tag.hand { color: #c9f0d2; background: rgba(22, 163, 74, 0.25); }
	.tag.act { color: #1b1206; background: #d8b36a; }
	.tag.disc { color: #ffd0cc; background: rgba(184, 50, 47, 0.3); }
	.tag.deck { color: #f4dfa8; background: rgba(227, 179, 65, 0.16); }
</style>
