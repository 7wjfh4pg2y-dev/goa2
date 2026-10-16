<script lang="ts">
	// Snorri's rune panel: the four runes in a row under I–IV. While he may inscribe (his silver acting, or the host
	// fixing them) a tap picks a rune and a second tap on another swaps the two — the action ring then confirms
	// "Inscribe". With his ultimate, on his own turn, a row of the three inactive runes picks Rune Mastery's second
	// rune for this turn (acts at once; tap it again to clear). variant: pop = above the dash button, sheet = the
	// phone's bottom sheet, modal = the host's window from the Game lobby.
	import { RUNES, RUNE_NAME, type Rune } from '$lib/heropower'
	import RuneMark from './RuneMark.svelte'

	export let runes: Rune[] | null = null
	export let draft: Rune[] = [...RUNES]
	export let turnIdx = 0
	export let canEdit = false
	export let canSecond = false
	export let second: Rune | null = null
	export let fx = true
	export let title = 'Inscribe the Runes'
	export let variant: 'pop' | 'sheet' | 'modal' = 'pop'
	export let onSecond: (r: Rune | null) => void = () => {}
	export let onClose: () => void = () => {}

	const ROMAN = ['I', 'II', 'III', 'IV']
	let pick: number | null = null
	$: shown = canEdit ? draft : runes
	$: if (!canEdit) pick = null
	function tap(i: number) {
		if (!canEdit) return
		if (pick == null) { pick = i; return }
		if (pick !== i) { const d = [...draft]; [d[pick], d[i]] = [d[i], d[pick]]; draft = d }
		pick = null
	}
	$: active = runes?.[turnIdx] ?? null
	$: inactive = runes ? runes.filter((r) => r !== active) : []
	$: big = variant === 'pop' ? 40 : 46
</script>

<div class="rp {variant}" role="dialog" tabindex="-1" aria-label={title} on:click|stopPropagation on:keydown|stopPropagation={(e) => e.key === 'Escape' && onClose()}>
	<div class="rh"><b>{title}</b><button class="rx" on:click={onClose} aria-label="Close">✕</button></div>
	<div class="row">
		{#each [0, 1, 2, 3] as i (i)}
			{@const r = shown?.[i] ?? null}
			<button class="cell" class:now={i === turnIdx} class:pick={pick === i} class:edit={canEdit} disabled={!canEdit} on:click={() => tap(i)}>
				<small>{ROMAN[i]}</small>
				<RuneMark rune={r} size={big} on={!canEdit && !!r && i === turnIdx} second={!canEdit && !!r && r === second} {fx} />
				<em>{r ? RUNE_NAME[r] : '—'}</em>
			</button>
		{/each}
	</div>
	{#if canSecond && runes}
		<div class="sec">
			<span class="sl">Second rune</span>
			{#each inactive as r (r)}
				<button class="chip" class:on={second === r} on:click={() => onSecond(second === r ? null : r)}><RuneMark rune={r} size={18} second={second === r} fx={false} />{RUNE_NAME[r]}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.rp { --brass: #d8b36a; --brass-hi: #f4dfa8; pointer-events: auto; z-index: 30; width: 300px; box-sizing: border-box; padding: 10px 12px 12px; border-radius: 14px; color: #f2ecdf; text-align: left;
		background: linear-gradient(180deg, rgba(16, 40, 66, 0.99), rgba(6, 19, 34, 0.99)); border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.6); }
	.rp.pop { position: absolute; bottom: calc(100% + 24px); left: 50%; transform: translateX(-50%); }
	.rp.pop::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; transform: translateX(-50%) rotate(45deg); background: rgb(6, 19, 34); border-right: 1px solid rgba(216, 179, 106, 0.45); border-bottom: 1px solid rgba(216, 179, 106, 0.45); }
	.rp.sheet { position: fixed; left: 8px; right: 8px; width: auto; bottom: calc(108px + env(safe-area-inset-bottom, 0px)); }
	.rp.modal { width: 340px; }
	.rh { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
	.rh b { flex: 1; font-size: 15px; font-weight: normal; color: var(--brass-hi); letter-spacing: 0.02em; }
	.rx { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: #c9d4df; font-size: 11px; cursor: pointer; }
	.row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
	.cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0 5px; border-radius: 10px; border: 1px solid transparent; background: rgba(0, 0, 0, 0.18); color: inherit; cursor: default; }
	.cell.edit { cursor: pointer; border-color: rgba(216, 179, 106, 0.2); }
	.cell.edit:hover { border-color: rgba(216, 179, 106, 0.5); }
	.cell.now small { color: var(--brass-hi); }
	.cell.pick { border: 1.5px dashed var(--brass-hi); background: rgba(216, 179, 106, 0.12); }
	.cell:disabled { opacity: 1; }
	.cell small { font-size: 11px; line-height: 1; color: #8a9fb3; letter-spacing: 0.08em; }
	.cell em { font-style: normal; font-size: 11px; line-height: 1; color: #c9d4df; }
	.cell.edit :global(.rm img) { opacity: 1; filter: brightness(1.45) contrast(1.05); }
	.sec { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 6px; margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(216, 179, 106, 0.22); }
	.sec .sl { grid-column: 1 / -1; }
	.sec .chip { min-width: 0; justify-content: center; white-space: nowrap; overflow: hidden; }
	.sl { font-size: 11px; color: #b98af0; letter-spacing: 0.04em; margin-right: 2px; }
	.chip { display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px 0 4px; border-radius: 13px; border: 1px solid rgba(185, 138, 240, 0.35); background: rgba(0, 0, 0, 0.25); color: #e6dcf5; font-size: 12px; cursor: pointer; }
	.chip.on { border-color: #b98af0; background: rgba(122, 70, 189, 0.35); color: #fff; }
</style>
