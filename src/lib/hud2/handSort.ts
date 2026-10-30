// Drag cards about in your hand — one gesture for every hand style (fan, side by side, banners, the ribbon rack).
// Put it on the container; each card carries `data-h={card index}`. Mouse: press and drag (a click still clicks).
// Touch / pen: press and HOLD (~0.4 s) until the card lifts, then slide — a quick tap still taps, so arming and the
// raised hand work as before. While a card is held the others re-flow live (onMove reorders the list); the held card
// stays under the pointer through a CSS `translate` (it stacks with the card's own fan transform).
export type HandSortOpts = { onMove: (card: number, onto: number) => void; off?: boolean };

const HOLD_MS = 420;
const SLOP = 7; // px a mouse must travel before a press becomes a drag (and a finger may wobble while holding)

export function handSort(node: HTMLElement, opts: HandSortOpts) {
	let o = opts;
	let el: HTMLElement | null = null;
	let card = -1;
	let pid = -1;
	let p0 = { x: 0, y: 0 }, pNow = { x: 0, y: 0 };
	let c0 = { x: 0, y: 0 }; // the held card's centre when the drag began (its natural place then)
	let dragging = false;
	let holdT: ReturnType<typeof setTimeout> | null = null;
	let raf = 0;
	const items = () => [...node.querySelectorAll<HTMLElement>('[data-h]')];
	const zoomOf = () => { const r = node.getBoundingClientRect(); return node.offsetWidth ? r.width / node.offsetWidth : 1; };
	const centre = (e: HTMLElement) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

	function begin() {
		if (!el) return;
		dragging = true;
		el.style.translate = '';
		c0 = centre(el);
		el.classList.add('hsort');
		node.classList.add('hsorting');
		try { node.setPointerCapture(pid); } catch { /* fine */ }
		try { navigator.vibrate?.(12); } catch { /* fine */ }
		follow();
	}
	// keep the held card under the pointer: its natural place moves whenever the list re-orders
	function follow() {
		if (!el || !dragging) return;
		const z = zoomOf() || 1;
		const t = el.style.translate.split(' ').map((v) => parseFloat(v) || 0);
		const now = centre(el);
		const nat = { x: now.x - (t[0] ?? 0) * z, y: now.y - (t[1] ?? 0) * z };
		el.style.translate = `${(pNow.x - p0.x + c0.x - nat.x) / z}px ${(pNow.y - p0.y + c0.y - nat.y) / z}px`;
	}
	function target() {
		// the card whose centre is nearest the pointer (its own natural place counts too, so it can stay put)
		let best = card, bd = Infinity;
		const z = zoomOf() || 1;
		for (const it of items()) {
			const k = Number(it.dataset.h);
			let c = centre(it);
			if (it === el) { const t = el.style.translate.split(' ').map((v) => parseFloat(v) || 0); c = { x: c.x - (t[0] ?? 0) * z, y: c.y - (t[1] ?? 0) * z }; }
			const d = Math.hypot(c.x - pNow.x, c.y - pNow.y);
			if (d < bd) { bd = d; best = k; }
		}
		return best;
	}
	function down(e: PointerEvent) {
		if (o.off || e.button > 0 || el) return;
		const it = (e.target as Element)?.closest?.('[data-h]') as HTMLElement | null;
		if (!it || !node.contains(it)) return;
		el = it; card = Number(it.dataset.h); pid = e.pointerId;
		p0 = pNow = { x: e.clientX, y: e.clientY };
		if (e.pointerType !== 'mouse') holdT = setTimeout(() => { holdT = null; begin(); }, HOLD_MS);
	}
	function move(e: PointerEvent) {
		if (!el || e.pointerId !== pid) return;
		pNow = { x: e.clientX, y: e.clientY };
		const far = Math.hypot(pNow.x - p0.x, pNow.y - p0.y) > SLOP;
		if (!dragging) {
			if (!far) return;
			if (holdT) { clearTimeout(holdT); holdT = null; reset(); return; } // a finger that moves before the hold = not a drag
			if (e.pointerType === 'mouse') begin(); else return;
		}
		const t = target();
		if (t !== card) o.onMove(card, t);
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(follow); // after the list has re-flowed
		follow();
	}
	function up(e: PointerEvent) {
		if (!el || e.pointerId !== pid) return;
		const was = dragging;
		reset();
		if (was) { // swallow the click that ends the drag (it would arm / open the card)
			const kill = (ev: Event) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
			window.addEventListener('click', kill, { capture: true, once: true });
			setTimeout(() => window.removeEventListener('click', kill, { capture: true }), 350);
		}
	}
	function reset() {
		if (holdT) { clearTimeout(holdT); holdT = null; }
		cancelAnimationFrame(raf);
		try { if (dragging) node.releasePointerCapture(pid); } catch { /* fine */ }
		if (el) { el.style.translate = ''; el.classList.remove('hsort'); }
		node.classList.remove('hsorting');
		el = null; dragging = false; card = -1; pid = -1;
	}
	// a held card must not scroll the page / open the long-press menu
	const touchMove = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
	const ctx = (e: Event) => { if (el) e.preventDefault(); };
	node.addEventListener('pointerdown', down);
	window.addEventListener('pointermove', move);
	window.addEventListener('pointerup', up);
	window.addEventListener('pointercancel', reset);
	node.addEventListener('touchmove', touchMove, { passive: false });
	node.addEventListener('contextmenu', ctx);
	return {
		update(n: HandSortOpts) { o = n; },
		destroy() {
			reset();
			node.removeEventListener('pointerdown', down);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', reset);
			node.removeEventListener('touchmove', touchMove);
			node.removeEventListener('contextmenu', ctx);
		}
	};
}
