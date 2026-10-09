<script lang="ts">
	// A player as a NAMEPLATE (the 2.0 HUD's compact boards): the portrait in its eight level arcs (all purple once the
	// ultimate is on) · the HERO over the player · this turn's card slot (face down once committed, flipping up on the
	// reveal; a green tick while planning when they're in) · cards in hand when there's room. Under it hang the STAT
	// PLATES: one little plate per item, stacked per stat in the stats' own order (3 attack items = 3 plates), each in
	// the colour of the card that gave it. A click opens the player's whole board; the slot reads the card.
	import TurnSlot from '$lib/cards/TurnSlot.svelte';
	import { heroName } from '$lib/cards/deck';
	import { portraitCss } from '$lib/heroes';
	import { levelOf, statDeltas, statColors, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let name = '';
	export let color = '#888'; // the player's colour
	export let team: 'orange' | 'blue' = 'orange';
	export let turnIdx = 0;
	export let revealed = false;
	export let ready = false;
	export let me = false;
	export let width = 170; // design px
	export let fx = false; // a lingering effect on this turn's card
	export let onOpen: () => void = () => {};
	export let onSlot: (e: Event, t: number) => void = () => {};

	const ROMAN = ['I', 'II', 'III', 'IV'];
	$: lv = levelOf(cs);
	const arc = (i: number, r = 22.5) => {
		const a0 = ((i * 45 + 5) * Math.PI) / 180, a1 = ((i * 45 + 40) * Math.PI) / 180;
		return `M ${(25 + r * Math.sin(a0)).toFixed(2)} ${(25 - r * Math.cos(a0)).toFixed(2)} A ${r} ${r} 0 0 1 ${(25 + r * Math.sin(a1)).toFixed(2)} ${(25 - r * Math.cos(a1)).toFixed(2)}`;
	};
	const art = import.meta.glob('$lib/images/stats/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const img = (n: string) => Object.entries(art).find(([k]) => k.endsWith(`/${n}.png`))?.[1] ?? '';
	const STATS = [['atk', 'attack', 'Attack'], ['def', 'defense', 'Defense'], ['init', 'initiative', 'Initiative'], ['move', 'movement', 'Movement'], ['range', 'range', 'Range'], ['radius', 'area', 'Radius']] as const;
	const HUE: Record<string, string> = { RED: '#c43d33', BLUE: '#2f6fd0', GREEN: '#2f9a4c', BRASS: '#b8913f' };
	$: dl = statDeltas(cs) as Record<string, number | undefined>;
	$: cl = statColors(cs) as Record<string, string[] | undefined>;
	$: plates = STATS.flatMap(([k, file, label]) => { const n = Math.max(0, Math.min(3, dl[k] ?? 0)); return n ? [{ k, src: img(file), label, n, hues: Array.from({ length: n }, (_, i) => HUE[cl[k]?.[i] ?? 'BRASS'] ?? HUE.BRASS) }] : []; });
	$: roomy = width >= 205; // the hand count, when there's room for it
	$: narrow = width < 150;
</script>

<div class="np is-{team}" class:me class:narrow class:ult={cs.ultimate} style="--w:{width}px">
	<button class="npb" on:click={onOpen} title="{heroName(cs.hero)} — {name}: open the board">
		<span class="ring" style="--pc:{color}">
			<span class="pf" style={portraitCss(cs.hero)}></span>
			<svg viewBox="0 0 50 50" aria-hidden="true">{#each Array(8) as _, i (i)}<path d={arc(i)} class:on={cs.ultimate || i < lv} class:u8={i === 7} />{/each}</svg>
		</span>
		<span class="nm"><b>{heroName(cs.hero)}</b><small>{name}</small></span>
	</button>
	<span class="slot" class:glow={fx}>
		<TurnSlot heroId={cs.hero} played={cs.turns[turnIdx]} pending={cs.pending} isCurrent {revealed} label={ROMAN[turnIdx] ?? ''} examinable on:click={(e) => onSlot(e, turnIdx)} />
		{#if !revealed && ready}<i class="ok" title="Card in">✓</i>{/if}
	</span>
	{#if roomy}<span class="hd" title="Cards in hand"><svg viewBox="0 0 24 24"><rect x="5" y="6" width="10" height="14" rx="2" /><path d="M9 3h8.5a2 2 0 0 1 2 2v12" /></svg>{cs.hand.length}</span>{/if}
	{#if plates.length}
		<span class="plates" aria-label="Items">
			{#each plates as p (p.k)}
				<span class="pcol" title="{p.label} +{p.n}" style="--n:{p.n}">
					{#each p.hues as h, i (i)}<span class="pl" style="--h:{h}; --i:{i}">{#if i === 0}<img src={p.src} alt="" />{/if}</span>{/each}
				</span>
			{/each}
		</span>
	{/if}
</div>

<style>
	.np { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); position: relative; width: var(--w); height: 50px; display: flex; align-items: center; gap: 6px; padding: 0 8px 0 4px; box-sizing: border-box;
		border-radius: 12px; color: #f5f1e8; pointer-events: auto; background: linear-gradient(180deg, var(--tg), transparent 60%), linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97));
		border: 1px solid var(--line); border-bottom: 3px solid var(--tc); box-shadow: 0 8px 18px rgba(0, 0, 0, 0.5); }
	.np.me { box-shadow: 0 0 0 1px var(--brass-hi), 0 8px 18px rgba(0, 0, 0, 0.5); }
	.is-orange { --tc: #ef7d22; --tg: rgba(239, 125, 34, 0.18); --th: #ffb878; } .is-blue { --tc: #2f7fe6; --tg: rgba(47, 127, 230, 0.2); --th: #9ccbff; }
	.npb { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
	.ring { position: relative; flex: none; width: 42px; height: 42px; display: grid; place-items: center; }
	.ring svg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.ring path { fill: none; stroke: rgba(255, 255, 255, 0.16); stroke-width: 3.4; stroke-linecap: round; }
	.ring path.on { stroke: var(--brass); }
	.ring path.u8 { stroke: rgba(138, 79, 209, 0.5); }
	.ring path.u8.on, .ult .ring path { stroke: #b383f5; }
	.ult .ring svg { filter: drop-shadow(0 0 3px rgba(179, 131, 245, 0.9)); }
	.pf { width: 72%; height: 72%; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--tc), 0 0 0 3.5px var(--pc); }
	.nm { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
	.nm b { font-weight: 400; font-size: 14.5px; line-height: 1; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.nm small { font-size: 10.5px; line-height: 1; color: var(--th); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.narrow .ring { width: 36px; height: 36px; }
	.narrow .nm b { font-size: 12.5px; }
	.narrow .nm small { font-size: 9.5px; }
	.narrow .plates { left: 42px; }
	.slot { position: relative; flex: none; width: 27px; border-radius: 4px; }
	.slot :global(.slot) { aspect-ratio: 1192 / 1664; }
	.slot.glow { box-shadow: 0 0 0 2px #fff, 0 0 10px 2px var(--tc); }
	.ok { position: absolute; right: -6px; bottom: -5px; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 9px; color: #fff; background: #16a34a; box-shadow: 0 0 0 1.5px #0a1a2c; }
	.hd { flex: none; display: inline-flex; align-items: center; gap: 2px; font-size: 12px; color: #bccbd9; }
	.hd svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; }
	/* the stat plates hanging from the nameplate's lower edge, a stack per stat */
	.plates { position: absolute; top: calc(100% + 1px); left: 50px; display: flex; gap: 3px; pointer-events: none; }
	.pcol { position: relative; width: 22px; height: calc(22px + (var(--n) - 1) * 5px); }
	.pl { position: absolute; left: 0; top: calc(var(--i) * 5px); z-index: calc(3 - var(--i)); width: 22px; height: 22px; display: grid; place-items: center; box-sizing: border-box; border-radius: 0 0 6px 6px;
		background: linear-gradient(180deg, color-mix(in srgb, var(--h) 60%, #0a1a2c), color-mix(in srgb, var(--h) 85%, #000)); border: 1px solid color-mix(in srgb, var(--h) 70%, #fff 30%); border-top: 0;
		box-shadow: 0 3px 6px rgba(0, 0, 0, 0.5); }
	.pl img { width: 15px; height: 15px; object-fit: contain; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7)); }
</style>
