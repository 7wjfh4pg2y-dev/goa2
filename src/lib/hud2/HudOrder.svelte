<script lang="ts" module>
	export type OrderEntry = { pid: string; hero: string; heroName: string; player: string; team: 'orange' | 'blue'; idx: number; ini: number; tied: boolean; portrait: string; color: string };
</script>

<script lang="ts">
	// The row under the top bar. While players choose: "Planning", a dot per player (filled once they're in), "N of M
	// ready" — or the countdown. After the reveal: the cards as banners, highest initiative first (a tie goes to the
	// team holding the tie-breaker coin, marked by the coin between them). The lit banner is who acts now — LOCAL to
	// this screen (the game doesn't say who is acting): click a later banner to move the light there, click the lit
	// one (or one already done) to read the card.
	import { heroCards, backgroundSlug } from '$lib/cards/deck';

	export let planning = true;
	export let countdown = '';
	export let dots: { team: string; ok: boolean }[] = [];
	export let order: OrderEntry[] = [];
	export let bonus: (pid: string, act: string) => number = () => 0;
	export let tieArt = '';
	export let small = false;
	export let turnKey = '';
	export let onRead: (pid: string, hero: string, idx: number) => void = () => {};

	const ui = import.meta.glob('$lib/cards/images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const ic = (n: string) => Object.entries(ui).find(([k]) => k.endsWith(`/${n}.png`))?.[1] ?? '';
	const cardArt = import.meta.glob('$lib/cards/images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>;
	const artOf = (hero: string, i: number) => { const c = heroCards(hero)[i]; return c ? Object.entries(cardArt).find(([k]) => k.endsWith(`/cards/${hero}/${backgroundSlug(c)}.webp`))?.[1] ?? '' : ''; };
	const COL: Record<string, string> = { GOLD: '#c9982f', SILVER: '#8d99a8', RED: '#b8322f', BLUE: '#2a64c4', GREEN: '#2b8a43', PURPLE: '#7a46bd' };
	let acting = 0;
	let lastKey = '';
	$: if (turnKey !== lastKey) { lastKey = turnKey; acting = 0; }
	$: ready = dots.filter((d) => d.ok).length;
	function act(e: OrderEntry) {
		const c = heroCards(e.hero)[e.idx] as { primaryAction?: string; primaryValue?: number; color?: string } | undefined;
		const a = (c?.primaryAction ?? '').toLowerCase();
		return { icon: a ? ic(`${a}_${(c?.color ?? '').toLowerCase()}`) : '', value: c?.primaryValue, bonus: a ? bonus(e.pid, a) : 0, label: a };
	}
	function click(k: number, e: OrderEntry) {
		if (k > acting) acting = k;
		else onRead(e.pid, e.hero, e.idx);
	}
</script>

<div class="orow" class:small>
	{#if planning}
		<div class="status">
			{#if countdown}<b>Revealing</b><span class="cd">{countdown}</span>
			{:else}<b>Planning</b><span class="sdots">{#each dots as d, i (i)}<i class="t-{d.team}" class:ok={d.ok}></i>{/each}</span><em>{ready} of {dots.length} ready</em>{/if}
		</div>
	{:else}
		{#each order as e, k (e.pid)}
			{@const c = heroCards(e.hero)[e.idx]}
			{@const a = act(e)}
			{#if k}{#if e.tied}<img class="tiemark" src={tieArt} alt="Tie" title="A tie — the coin's holders go first" />{:else}<i class="chev">›</i>{/if}{/if}
			<button class="ban is-{e.team}" class:done={k < acting} class:now={k === acting} style="--c:{COL[c?.color ?? ''] ?? '#666'}; --art:url({artOf(e.hero, e.idx)})" on:click={() => click(k, e)} title={k > acting ? 'Mark as acting' : 'Read the card'}>
				<span class="bini">{e.ini}</span>
				<span class="bbody">
					<span class="bname">{c?.name ?? ''}</span>
					<span class="bline">
						<span class="bwho">{e.heroName}{#if !small}<em class="bpl">{e.player}</em>{/if}</span>
						{#if a.icon}<span class="bact"><img src={a.icon} alt={a.label} />{#if a.value != null}<b>{a.value}</b>{/if}</span>{#if a.bonus}<span class="bplus">+{a.bonus}</span>{/if}{/if}
					</span>
				</span>
				{#if !small}<span class="face" style="--pc:{e.color}; {e.portrait}"></span>{/if}
				{#if k === acting}<span class="btag">Acting</span>{:else if k < acting}<span class="bdone">✓</span>{/if}
			</button>
		{/each}
	{/if}
</div>

<style>
	.orow { --brass: #d8b36a; --brass-hi: #f4dfa8; --line: rgba(216, 179, 106, 0.4); display: flex; align-items: center; justify-content: center; gap: 12px; height: 60px; color: #f5f1e8; }
	.orow.small { gap: 8px; }
	.status { display: flex; align-items: center; gap: 16px; height: 40px; padding: 0 24px; border-radius: 999px; pointer-events: auto;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.97), rgba(6, 21, 38, 0.97)); border: 1px solid var(--line); box-shadow: 0 6px 16px rgba(0, 0, 0, 0.45); font-size: 15px; }
	.status b { font-weight: 400; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--brass-hi); }
	.status em { font-style: normal; color: #bccbd9; }
	.cd { min-width: 28px; text-align: center; font-size: 22px; color: #fff; }
	.sdots { display: flex; gap: 6px; }
	.sdots i { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--tc); box-sizing: border-box; opacity: 0.6; }
	.sdots i.ok { background: var(--tc); opacity: 1; }
	.t-orange, .is-orange { --tc: #ef7d22; --th: #ffb878; } .t-blue, .is-blue { --tc: #2f7fe6; --th: #9ccbff; }
	.ban { position: relative; display: flex; align-items: center; gap: 12px; height: 60px; width: 240px; padding: 0 10px 0 0; border-radius: 10px; box-sizing: border-box; font: inherit; color: inherit; text-align: left; cursor: pointer; pointer-events: auto;
		background: linear-gradient(90deg, rgba(8, 20, 34, 0.96) 35%, rgba(8, 20, 34, 0.72) 70%, rgba(8, 20, 34, 0.5)), var(--art) center / cover, #081420; border: 1px solid rgba(255, 255, 255, 0.14); border-bottom: 3px solid var(--tc); box-shadow: 0 8px 18px rgba(0, 0, 0, 0.5); }
	.small .ban { width: 184px; gap: 10px; }
	.ban.done { opacity: 0.6; }
	.ban.now { box-shadow: 0 0 0 2px var(--brass-hi), 0 8px 20px rgba(0, 0, 0, 0.55); }
	.bini { align-self: stretch; width: 48px; flex: none; display: grid; place-items: center; font-size: 28px; color: #fff; border-radius: 9px 0 0 7px; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
		background: linear-gradient(180deg, color-mix(in srgb, var(--c) 80%, #fff 20%), var(--c) 60%, color-mix(in srgb, var(--c) 70%, #000)); }
	.small .bini { width: 42px; font-size: 24px; }
	.bbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
	.bname { font-size: 16px; line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.small .bname { font-size: 14px; }
	.bline { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #bccbd9; }
	.bwho { color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.bpl { margin-left: 5px; font-style: normal; font-size: 10px; color: var(--th); }
	.bact { position: relative; flex: none; width: 24px; height: 24px; display: grid; place-items: center; }
	.bact img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
	.bact b { position: relative; font-weight: 400; font-size: 13px; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000; }
	.bplus { font-size: 13px; color: #fff; }
	.face { flex: none; width: 34px; height: 34px; border-radius: 50%; background-repeat: no-repeat; background-color: #0b101a; box-shadow: 0 0 0 2px var(--tc), 0 0 0 3.5px var(--pc); }
	.btag { position: absolute; left: 50%; bottom: -11px; transform: translateX(-50%); padding: 2px 10px; border-radius: 999px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #1b1204; background: linear-gradient(180deg, var(--brass-hi), var(--brass)); white-space: nowrap; }
	.bdone { position: absolute; right: -6px; top: -7px; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; color: #fff; background: #16a34a; }
	.chev { font-style: normal; color: var(--brass-hi); font-size: 20px; }
	.tiemark { width: 30px; height: 30px; border-radius: 50%; box-shadow: 0 0 0 2px #0a1a2c, 0 0 0 3px var(--brass); }
</style>
