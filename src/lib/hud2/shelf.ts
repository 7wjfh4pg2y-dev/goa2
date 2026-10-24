// A side column you can drag off the screen and back (a phone on its side: the other players on the left, your dash
// on the right). Svelte action: a sideways drag (not a scroll) reports how far it has gone through `drag(px)` and, on
// release past 40 px, calls `set(open)`; a click that ends a drag is swallowed so nothing under the finger fires.
export type ShelfOpts = { side: 'left' | 'right'; open: boolean; set: (open: boolean) => void; drag: (px: number | null) => void }

export function shelf(node: HTMLElement, opts: ShelfOpts) {
	let p = opts
	let id = -1, x0 = 0, y0 = 0, on = false, amt = 0, swallow = false
	const down = (e: PointerEvent) => { if (e.button > 0) return; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; on = false; amt = 0 }
	const move = (e: PointerEvent) => {
		if (e.pointerId !== id) return
		const dx = e.clientX - x0, dy = e.clientY - y0
		if (!on) {
			if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) { on = true; try { node.setPointerCapture(id) } catch { /* gone */ } }
			else if (Math.abs(dy) > 12) { id = -1; return } // a scroll, not a drag
			else return
		}
		// how far towards the other state: open → closing (left: to the left), shut → opening
		const toClose = p.side === 'left' ? -dx : dx
		amt = Math.max(0, p.open ? toClose : -toClose)
		p.drag(amt)
	}
	const up = (e: PointerEvent) => {
		if (e.pointerId !== id) return
		id = -1
		if (!on) return
		on = false
		swallow = true
		setTimeout(() => (swallow = false), 350)
		p.drag(null)
		if (amt > 40) p.set(!p.open)
	}
	const click = (e: MouseEvent) => { if (swallow) { e.preventDefault(); e.stopImmediatePropagation(); swallow = false } }
	node.addEventListener('pointerdown', down)
	node.addEventListener('pointermove', move)
	node.addEventListener('pointerup', up)
	node.addEventListener('pointercancel', up)
	node.addEventListener('click', click, true)
	return {
		update(o: ShelfOpts) { p = o },
		destroy() {
			node.removeEventListener('pointerdown', down)
			node.removeEventListener('pointermove', move)
			node.removeEventListener('pointerup', up)
			node.removeEventListener('pointercancel', up)
			node.removeEventListener('click', click, true)
		}
	}
}
