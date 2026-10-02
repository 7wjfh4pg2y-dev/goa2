<script lang="ts">
	// The level-up choice (also a same-round swap to the other path, and the ultimate's
	// unlock): the card you take, big and lit; its twin beside it, becoming the item;
	// the card it replaces, small and struck; one brass Confirm carrying the price.
	// During a level-up the ⇄ (or a tap on the twin) flips the choice — `idx` is bound,
	// so the caller confirms whichever card is showing. Fills its positioned parent
	// (the scaled desktop deck, or the phone's full-screen wrapper).
	import Card from '$lib/cards/Card.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import { heroCards } from '$lib/cards/deck';
	import { levelOf, levelCost, twinOf, swapSource, tierIn, canPick, type PlayerCardState } from '$lib/cards/cardstate';

	export let cs: PlayerCardState;
	export let idx: number;
	export let kind: 'take' | 'swap' = 'take';
	export let teamStyle = '';
	export let onConfirm: () => void;
	export let onCancel: () => void;

	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const ITEM_NAME: Record<string, string> = { ATTACK: 'Attack', DEFENSE: 'Defense', INITIATIVE: 'Initiative', MOVEMENT: 'Movement', RANGE: 'Range', AREA: 'Area' };
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', PURPLE: '#b482f0' };

	$: cards = heroCards(cs.hero);
	$: c = cards[idx];
	$: isUlt = c?.color === 'PURPLE';
	$: LV = levelOf(cs);
	$: cost = levelCost(LV);
	// take: the twin becomes the item; swap: this round's pick becomes the item
	$: itemCard = kind === 'swap' ? swapSource(cs, idx) ?? -1 : twinOf(cs.hero, idx);
	$: item = itemCard >= 0 ? cards[itemCard]?.item ?? '' : '';
	$: older = kind === 'take' && c && !isUlt
		? [...cs.hand, ...cs.discard, ...cs.turns, cs.pending].find((i) => i != null && i >= 0 && cards[i]?.color === c.color && (cards[i]?.level ?? 1) === tierIn(cs, c.color))
		: undefined;
	$: canFlip = kind === 'take' && itemCard >= 0 && canPick(cs, itemCard);

	let pickEl: HTMLElement, twinEl: HTMLElement;
	function flip() {
		if (!canFlip) return;
		idx = itemCard;
		if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		const o = { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' };
		pickEl?.animate?.([{ transform: 'translateX(18%) scale(.9)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], o);
		twinEl?.animate?.([{ transform: 'translateX(-22%) scale(1.08)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], o);
	}
</script>

<div class="lc tide" style="{teamStyle}; --c:{COL[c?.color] ?? '#d8b36a'}" on:click|self={onCancel} on:keydown={(e) => e.key === 'Escape' && onCancel()} role="presentation">
	<button class="lx" on:click={onCancel} aria-label="Back"><Icon name="x" /></button>
	<div class="stage" role="dialog" aria-modal="true" aria-label="Confirm level-up">
		<h3>{kind === 'swap' ? 'Swap' : isUlt ? 'Ultimate' : 'Level up'}</h3>
		{#if kind === 'take'}<div class="lvb" aria-hidden="true">{#each Array(8) as _, k (k)}<i class:got={k < LV} class:nw={k === LV} class:ul={k === 7}></i>{/each}</div>{/if}
		<div class="grid" class:noold={older == null} class:solo={itemCard < 0}>
			{#if older != null}<div class="old"><Card heroId={cs.hero} card={cards[older]} /></div>{/if}
			<div class="pick" bind:this={pickEl}><Card heroId={cs.hero} card={c} /></div>
			{#if itemCard >= 0}
				<div class="side">
					{#if canFlip}<button class="sw" on:click={flip} aria-label="Take the other card" title="Take the other card"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15M15 4l4 4-4 4" /><path d="M20 16H5M9 12l-4 4 4 4" /></svg></button>{/if}
					<button class="twin" class:fixed={!canFlip} bind:this={twinEl} on:click={flip} title={cards[itemCard]?.name}>
						<Card heroId={cs.hero} card={cards[itemCard]} />
						{#if item}<span class="plus"><img src={ic(`item_${item.toLowerCase()}`)} alt="" />+1 {ITEM_NAME[item]}</span>{/if}
					</button>
				</div>
			{/if}
			<button class="ok" on:click={onConfirm}>{kind === 'swap' ? 'Swap' : isUlt ? 'Unlock' : 'Confirm'}{#if kind === 'take'}<span class="money">{cost}</span>{/if}</button>
		</div>
	</div>
</div>

<style>
	.lc { --pw: 372px; --tw: 280px; --ow: 128px; position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; border-radius: inherit; overflow: hidden; color: var(--ink); font-size: 16px; line-height: 1.2;
		background: radial-gradient(56% 62% at 50% 46%, color-mix(in srgb, var(--c) 30%, #06182a) 0%, rgba(4, 13, 24, .95) 64%, rgba(2, 7, 14, .97) 100%); animation: lcin .18s ease-out; }
	@keyframes lcin { from { opacity: 0; } }
	.lx { position: absolute; right: 20px; top: 20px; width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; border: 1px solid rgba(255, 255, 255, .22); background: rgba(255, 255, 255, .04); color: var(--ink-2); }
	.lx:hover { border-color: rgba(255, 255, 255, .45); color: var(--ink); }
	.stage { display: flex; flex-direction: column; align-items: center; max-width: 100%; }
	h3 { margin: 0; font-weight: normal; font-size: 44px; line-height: 1; letter-spacing: .04em; color: var(--brass-hi); text-shadow: 0 3px 18px rgba(0, 0, 0, .6); }
	.lvb { display: flex; gap: 4px; margin-top: 14px; }
	.lvb i { width: 34px; height: 9px; border-radius: 3px; background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
	.lvb i.ul { background: rgba(165, 110, 230, .25); box-shadow: inset 0 0 0 1.5px #a56ee6; }
	.lvb i.got { background: linear-gradient(180deg, #fff3cf, var(--brass)); box-shadow: none; }
	.lvb i.nw { background: linear-gradient(180deg, #fff, #f4dfa8); box-shadow: 0 0 10px rgba(244, 223, 168, .9); animation: stepin .5s .15s cubic-bezier(.2, .7, .2, 1) both; }
	.lvb i.nw.ul { background: linear-gradient(180deg, #f1e2ff, #b482f0); box-shadow: 0 0 12px rgba(180, 130, 240, .95); }
	@keyframes stepin { from { opacity: 0; transform: scaleX(.2); } }

	.grid { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; column-gap: 26px; row-gap: 24px; margin-top: 26px; }
	.grid :global(.cardface) { display: block; width: 100%; }
	/* the card it replaces: small, greyed, struck */
	.old { position: relative; grid-column: 1; justify-self: end; width: var(--ow); }
	.old :global(.cardface) { border-radius: 6px; filter: grayscale(1) brightness(.4); box-shadow: 0 0 0 1px #030b15; }
	.old::after { content: ''; position: absolute; left: 6%; right: 6%; top: 50%; height: 2px; background: rgba(229, 72, 77, .8); transform: rotate(-54.4deg); }
	/* your pick: big and lit */
	.pick { grid-column: 2; width: var(--pw); animation: pickin .32s cubic-bezier(.2, .7, .2, 1) both; }
	@keyframes pickin { from { opacity: 0; transform: scale(.94); } }
	.pick :global(.cardface) { border-radius: 12px; box-shadow: 0 0 0 3px #fff3cf, 0 0 46px color-mix(in srgb, var(--c) 85%, transparent), 0 18px 40px rgba(0, 0, 0, .6); }
	/* its twin: becomes the item */
	.side { grid-column: 3; justify-self: start; display: flex; align-items: center; gap: 22px; }
	.sw { width: 48px; height: 48px; flex: none; display: grid; place-items: center; border-radius: 50%; font-size: 20px; color: var(--ink);
		background: linear-gradient(180deg, rgba(26, 68, 104, .95), rgba(13, 40, 66, .95)); border: 1px solid var(--brass-line); box-shadow: var(--sh-1); transition: transform .14s ease-out; }
	.sw:hover { transform: rotate(180deg); }
	.twin { position: relative; width: var(--tw); padding: 0; border: none; background: none; }
	.twin.fixed { cursor: default; }
	.twin :global(.cardface) { border-radius: 9px; filter: brightness(.72) saturate(.8); box-shadow: 0 0 0 1px #030b15, 0 12px 28px rgba(0, 0, 0, .55); }
	.twin:not(.fixed):hover :global(.cardface) { filter: none; }
	.plus { position: absolute; left: 50%; bottom: -16px; width: max-content; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 18px 0 12px; border-radius: 20px; font-size: 21px; line-height: 1; white-space: nowrap;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad, var(--brass)); border: 1px solid #030b15; box-shadow: 0 6px 14px rgba(0, 0, 0, .5); }
	.plus img { width: 28px; height: 22px; object-fit: contain; filter: brightness(.22); }
	/* the one action */
	.ok { grid-column: 2; grid-row: 2; height: 62px; display: flex; align-items: center; justify-content: center; gap: 12px; border-radius: 14px; font-size: 27px; line-height: 1;
		color: var(--ink-dark); background: linear-gradient(180deg, #f6e2ad 0%, var(--brass) 48%, #b98e42 100%); border: 1px solid; border-color: #f9ebc6 #c9a355 #8a6a2c;
		box-shadow: 0 6px 18px rgba(0, 0, 0, .4), 0 0 0 1px rgba(0, 0, 0, .35), inset 0 1px 0 rgba(255, 255, 255, .5); transition: transform .12s; }
	.ok:hover { transform: translateY(-1px); }
	.ok:active { transform: translateY(1px); }
	.money { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; box-sizing: border-box; padding: 0 7px; border-radius: 999px;
		background: linear-gradient(#f7dc8c, #d6a646); color: #3a2a10; font-size: 20px; line-height: 1; border: 1px solid rgba(0, 0, 0, .45); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5); }

	/* phones: the pick on top, the old card and the twin in a row under it */
	@media (max-width: 760px) {
		.lc { --pw: min(64vw, 31vh); --tw: min(30vw, 14.5vh); --ow: min(17vw, 8.2vh); background: radial-gradient(90% 50% at 50% 38%, color-mix(in srgb, var(--c) 26%, #06182a) 0%, #040d18 70%, #02070e 100%); }
		.lx { right: 10px; top: 10px; width: 40px; height: 40px; }
		.stage { width: 100%; box-sizing: border-box; padding: 0 16px; }
		h3 { font-size: 30px; }
		.lvb { margin-top: 10px; }
		.lvb i { width: 26px; height: 8px; }
		.grid { grid-template-columns: auto auto; justify-content: center; column-gap: 18px; row-gap: 3.4vh; margin-top: 2.4vh; width: 100%; }
		.pick { grid-column: 1 / -1; grid-row: 1; justify-self: center; }
		.old { grid-column: 1; grid-row: 2; justify-self: end; align-self: center; }
		.side { grid-column: 2; grid-row: 2; gap: 14px; }
		.grid.noold .side { grid-column: 1 / -1; justify-self: center; }
		.sw { width: 44px; height: 44px; }
		.plus { bottom: -14px; height: 30px; padding: 0 12px 0 8px; gap: 6px; font-size: 16px; }
		.plus img { width: 22px; height: 17px; }
		.ok { grid-column: 1 / -1; grid-row: 3; height: 56px; font-size: 24px; margin-top: 6px; }
		.grid.solo .ok { grid-row: 2; }
	}
	@media (prefers-reduced-motion: reduce) {
		.lc, .pick, .lvb i.nw { animation: none; }
		.sw, .ok { transition: none; }
	}
</style>
