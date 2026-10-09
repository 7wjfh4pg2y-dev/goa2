<script lang="ts">
	// Every pair of players at once: a grid, rows read across — "Against": the row player's record against the
	// column player (green = they win more, red = they lose more, stronger with more games); "Together": their record
	// on the same side. A name opens that player.
	import type { League } from '$lib/league';
	export let league: League;
	export let onOpen: (key: string) => void = () => {};
	let mode: 'foes' | 'mates' = 'foes';
	$: ps = league.players;
	function cell(rk: string, ck: string) {
		const p = ps.find((x) => x.key === rk);
		const t = mode === 'foes' ? p?.foes.find((f) => f.key === ck) : p?.mates.find((m) => m.key === ck);
		if (!t || !t.games) return null;
		const r = t.wins / t.games;
		const a = Math.min(1, 0.25 + t.games * 0.15) * Math.abs(r - 0.5) * 2;
		const bg = r === 0.5 ? 'rgba(255,255,255,0.06)' : r > 0.5 ? `rgba(47,163,90,${(0.15 + 0.55 * a).toFixed(2)})` : `rgba(184,58,63,${(0.15 + 0.55 * a).toFixed(2)})`;
		return { txt: `${t.wins}–${t.games - t.wins}`, bg, tip: `${p?.name} ${mode === 'foes' ? 'vs' : 'with'} ${ps.find((x) => x.key === ck)?.name}: ${t.wins} won, ${t.games - t.wins} lost` };
	}
</script>

<section class="panel rv">
	<div class="seg" role="group" aria-label="Show">
		<button class:on={mode === 'foes'} on:click={() => (mode = 'foes')}>Against</button>
		<button class:on={mode === 'mates'} on:click={() => (mode = 'mates')}>Together</button>
	</div>
	<div class="scroll">
		<div class="grid" style="--n:{ps.length}">
			<span class="corner">{mode === 'foes' ? 'Row vs column' : 'Row with column'}</span>
			{#each ps as c (c.key)}<button class="ch" on:click={() => onOpen(c.key)} title={c.name}><span>{c.name}</span></button>{/each}
			{#each ps as r (r.key)}
				<button class="rh" on:click={() => onOpen(r.key)}>{r.name}</button>
				{#each ps as c (c.key)}
					{@const x = r.key === c.key ? null : cell(r.key, c.key)}
					<span class="c" class:self={r.key === c.key} style={x ? `background:${x.bg}` : ''} title={x?.tip ?? ''}>{x?.txt ?? ''}</span>
				{/each}
			{/each}
		</div>
	</div>
	<p class="fine">Read across: the row player's wins–losses. Green = they come out ahead, red = behind; the colour deepens with more games.</p>
</section>

<style>
	.rv { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
	.seg { align-self: flex-start; display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--well); border: 1px solid var(--hair); }
	.seg button { padding: 5px 14px; border-radius: 999px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 14px; cursor: pointer; }
	.seg button.on { color: var(--ink-dark); background: linear-gradient(180deg, var(--brass-hi), var(--brass)); }
	.scroll { overflow-x: auto; }
	.grid { display: grid; grid-template-columns: minmax(96px, auto) repeat(var(--n), minmax(54px, 1fr)); gap: 3px; min-width: max-content; }
	.corner { align-self: end; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); padding: 4px; }
	.ch { height: 88px; display: flex; align-items: flex-end; justify-content: center; padding: 0 0 6px; border: 0; background: none; color: var(--ink-2); font: inherit; font-size: 13.5px; cursor: pointer; }
	.ch span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; max-height: 82px; overflow: hidden; text-overflow: ellipsis; }
	.rh { text-align: left; padding: 0 8px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 14.5px; cursor: pointer; white-space: nowrap; }
	.ch:hover, .rh:hover { color: var(--brass-hi); }
	.c { height: 38px; display: grid; place-items: center; border-radius: 6px; font-size: 14px; background: rgba(255, 255, 255, 0.03); }
	.c.self { background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0 6px, transparent 6px 12px); }
	.fine { margin: 0; font-size: 12px; color: var(--ink-3); }
</style>
