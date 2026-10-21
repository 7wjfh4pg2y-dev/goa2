/** A hero button's panel closes when you tap anywhere outside it (the user, 2026-10-21). Taps on the action ring /
 *  phone pill and its little buttons don't count: confirming a move the panel loaded must not shut it under you. */
const KEEP = '.cap.gob, .galt, .gx, .pdash .act, .pdash .px, .gyb'
export function outside(node: HTMLElement, p: { on: boolean; close: () => void }) {
	let cur = p
	const down = (e: PointerEvent) => {
		const t = e.target as Element | null
		if (!cur.on || !t || node.contains(t) || t.closest?.(KEEP)) return
		cur.close()
	}
	window.addEventListener('pointerdown', down, true)
	return { update(n: typeof p) { cur = n }, destroy() { window.removeEventListener('pointerdown', down, true) } }
}
