<script lang="ts">
	// One card as a slim banner (Legends of Runeterra deck-list style): a coloured
	// marker with the card's value printed over its action icon, the name, and the
	// secondary stats underneath. The ultimate shows an 8-segment level bar instead.
	import { heroCards, backgroundSlug } from '$lib/cards/deck';
	import ultGear from '$lib/images/ult_gear.png';

	export let heroId: string;
	export let idx: number;
	export let level = 1; // for the ultimate's level bar
	export let unlocked = false; // ultimate unlocked
	export let item = false; // in the upgrade area → show its item icon
	export let dim = false;
	export let sel = false;

	type C = ReturnType<typeof heroCards>[number] & {
		item?: string; initiative?: number; primaryAction?: string; primaryValue?: number; level?: number;
		secondaryMovement?: number; secondaryDefense?: number; modifier?: string; modifierValue?: number;
	};
	const cardArt = import.meta.glob('./cards/images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
	const icons = import.meta.glob('./cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => icons[`./cards/images/${n}.png`] ?? '';
	const COL: Record<string, string> = { RED: '#e0524a', BLUE: '#3f7fe0', GREEN: '#41ae59', GOLD: '#e8b64a', SILVER: '#c6d0db', PURPLE: '#b482f0' };
	const NAME: Record<string, string> = { RED: 'Red', BLUE: 'Blue', GREEN: 'Green', GOLD: 'Gold', SILVER: 'Silver' };
	const ROM = ['I', 'II', 'III', 'IV'];

	$: c = heroCards(heroId)[idx] as C | undefined;
	$: clr = (c?.color ?? 'gold').toLowerCase();
	$: act = (c?.primaryAction ?? '').toLowerCase();
	$: art = c ? cardArt[`./cards/images/cards/${heroId}/${backgroundSlug(c)}.webp`] ?? '' : '';
	$: isUlt = c?.color === 'PURPLE';
	$: sub = !c ? '' : c.color === 'GOLD' || c.color === 'SILVER' ? NAME[c.color] : isUlt ? 'Tier IV' : `${NAME[c.color]} · ${ROM[(c.level ?? 1) - 1]}`;
</script>

{#if c}
	<button class="bn" class:dim class:sel class:ult={isUlt} class:on={isUlt && unlocked} style="--c:{COL[c.color] ?? '#888'}" on:click on:dblclick title={c.name}>
		<span class="mark">
			{#if act}<img src={ic(`${act}_${clr}`)} alt={c.primaryAction} />{:else if isUlt}<img class="gear" src={ultGear} alt="Ultimate" />{:else}<span class="iv">IV</span>{/if}
			{#if c.primaryValue != null}<b>{c.primaryValue}</b>{/if}
		</span>
		<span class="body" style="background-image: linear-gradient(90deg, #0d121c 34%, rgba(13,18,28,.6) 64%, rgba(13,18,28,.2)), url({art})">
			<span class="l1"><span class="nm">{c.name}</span><em>{sub}</em></span>
			{#if isUlt}
				<span class="seg">{#each Array(8) as _, k (k)}<i class:on={k < level}></i>{/each}<b>{unlocked ? 'Unlocked' : `${Math.min(level, 8)}/8`}</b></span>
			{:else}
				<span class="st">
					{#if c.initiative != null}<span class="chip">{c.initiative}<img src={ic('initiative')} alt="Initiative" /></span>{/if}
					{#if c.secondaryMovement}<span class="chip">{c.secondaryMovement}<img src={ic('movement')} alt="Movement" /></span>{/if}
					{#if c.secondaryDefense}<span class="chip">{c.secondaryDefense}<img src={ic('defense')} alt="Defense" /></span>{/if}
					{#if c.modifier}<span class="chip">{c.modifierValue}<img src={ic(`${c.modifier.toLowerCase()}_${clr}`)} alt={c.modifier} /></span>{/if}
				</span>
			{/if}
		</span>
		{#if item && c.item}<span class="itm" title="Item: +1 {c.item.toLowerCase()}"><img src={ic(`item_${c.item.toLowerCase()}`)} alt="" /></span>{/if}
	</button>
{/if}

<style>
	/* sizes follow the banner's height (--bh) so it scales as a whole */
	.bn { --bh: 40px; --mw: calc(var(--bh) * 1.4); position: relative; display: flex; width: 100%; height: var(--bh); flex: none; padding: 0; border: none; border-radius: 5px; overflow: hidden; cursor: pointer;
		font: inherit; text-align: left; color: inherit; background: #0d121c; box-shadow: inset 0 0 0 1px rgba(255,255,255,.07);
		outline: 1.5px solid color-mix(in srgb, var(--c) 60%, #fff); outline-offset: -1.5px; } /* a lighter edge of its own colour */
	.bn:hover { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 70%, transparent); }
	.bn.dim { opacity: .42; filter: grayscale(.5); }
	.bn.sel { opacity: 1; filter: none; box-shadow: 0 0 0 2px #fff, 0 0 12px var(--c); }
	.bn.ult.on { box-shadow: inset 0 0 0 1px rgba(210,175,255,.8), 0 0 12px rgba(165,110,230,.5); }
	/* the coloured marker; its right edge is notched, so centre things on the solid part */
	.mark { position: relative; width: var(--mw); flex: none; display: grid; place-items: center; padding-right: calc(var(--mw) * .06); box-sizing: border-box;
		background: linear-gradient(180deg, color-mix(in srgb, var(--c) 45%, #0b0f18), color-mix(in srgb, var(--c) 18%, #0b0f18)); border-right: 2px solid var(--c); clip-path: polygon(0 0, 100% 0, 88% 50%, 100% 100%, 0 100%); }
	.mark img { grid-area: 1 / 1; width: calc(var(--bh) * .82); height: calc(var(--bh) * .74); object-fit: contain; filter: drop-shadow(0 1px 2px #000); }
	/* the value printed over its icon, dead centre of the coloured part */
	.mark b { grid-area: 1 / 1; position: relative; z-index: 1; font-weight: normal; font-size: calc(var(--bh) * .5); line-height: 1; color: #fff; -webkit-text-stroke: calc(var(--bh) * .075) #10131a; paint-order: stroke fill; text-shadow: 0 1px 3px rgba(0,0,0,.8); }
	.mark img.gear { width: calc(var(--bh) * .78); height: calc(var(--bh) * .78); }
	.iv { grid-area: 1 / 1; font-size: calc(var(--bh) * .34); color: #e6d2ff; letter-spacing: .06em; }
	.body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: calc(var(--bh) * .07); padding: 0 calc(var(--bh) * .2) 0 calc(var(--bh) * .22);
		background-size: 100%, 58%; background-position: 0 0, right 32%; background-repeat: no-repeat; }
	.l1 { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
	.nm { min-width: 0; font-size: calc(var(--bh) * .34); line-height: 1.1; color: #f1f5f9; text-shadow: 0 1px 2px #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.l1 em { flex: none; font-style: normal; font-size: calc(var(--bh) * .23); color: #93a3b8; text-shadow: 0 1px 2px #000; }
	.st { display: flex; gap: 3px; }
	.chip { display: inline-flex; align-items: center; gap: 1px; padding: 0 calc(var(--bh) * .1); border-radius: 4px; font-size: calc(var(--bh) * .27); line-height: calc(var(--bh) * .38); color: #fff; background: rgba(0,0,0,.62); border: 1px solid rgba(255,255,255,.12); }
	.chip img { width: calc(var(--bh) * .33); height: calc(var(--bh) * .3); object-fit: contain; }
	.itm { position: absolute; right: calc(var(--bh) * .18); top: 50%; transform: translateY(-50%); width: calc(var(--bh) * .7); height: calc(var(--bh) * .56); display: grid; place-items: center; border-radius: 5px; background: #3f7fe0; box-shadow: 0 0 6px rgba(63,127,224,.6); }
	.itm img { width: 76%; height: 70%; object-fit: contain; }
	.seg { display: inline-flex; align-items: center; gap: 2px; }
	.seg i { width: calc(var(--bh) * .3); height: calc(var(--bh) * .18); background: rgba(255,255,255,.12); transform: skewX(-18deg); border-radius: 1px; }
	.seg i.on { background: linear-gradient(180deg, #d4a8ff, #8a4fd6); box-shadow: 0 0 5px rgba(180,130,240,.8); }
	.seg b { font-weight: normal; margin-left: 6px; font-size: calc(var(--bh) * .24); color: #d7c4f5; }
</style>
