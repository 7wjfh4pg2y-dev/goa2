// Lay a short text out in the action ring (tested in fitText.test.ts), the user's rules (2026-10-16): as many whole
// words as fit go on the first line; a word that overflows a line by only 1–3 letters is never broken — the type
// shrinks until it fits; a longer word that can't fit is cut with a hyphen ("EQUILIB-" / "RIUM"), never leaving a
// sliver of 1–3 letters on the next line. Widths are estimated from the character count (`k` = one character's width
// as a share of the font size, for the ring's uppercase letter-spaced type).
export type Fit = { lines: string[]; fs: number }

function layout(text: string, cap: number): { lines: string[]; shrinkTo: number } {
	const lines: string[] = []
	let cur = '', shrinkTo = cap
	const push = () => { if (cur) lines.push(cur); cur = '' }
	for (let w of text.split(/\s+/).filter(Boolean)) {
		if (!cur && w.length <= cap) { cur = w; continue }
		if (cur && cur.length + 1 + w.length <= cap) { cur += ' ' + w; continue }
		push()
		while (w.length > cap) {
			const rest = w.length - (cap - 1)
			// a near-fit (1–3 letters over), or a cut that would leave a sliver: keep the word whole and shrink instead
			if (w.length - cap <= 3 || rest < 4) { shrinkTo = Math.max(shrinkTo, w.length); break }
			lines.push(w.slice(0, cap - 1) + '-')
			w = w.slice(cap - 1)
		}
		cur = w
	}
	push()
	return { lines, shrinkTo }
}

/** fit `text` into `maxLines` lines `width` px wide, at `base` px or smaller (never under `minFs`) */
export function fitText(text: string, width: number, base: number, k = 0.68, maxLines = 2, minFs = 6): Fit {
	const t = text.trim()
	if (!t) return { lines: [], fs: base }
	for (let fs = base; fs >= minFs; fs -= 0.5) {
		const cap = Math.max(3, Math.floor(width / (k * fs)))
		const { lines, shrinkTo } = layout(t, cap)
		if (lines.length > maxLines) continue
		// a whole word kept on its line that is a little too long: the type shrinks to fit it
		const need = Math.max(...lines.map((l) => l.length), shrinkTo > cap ? shrinkTo : 0)
		return { lines, fs: Math.min(fs, width / (k * need)) }
	}
	const cap = Math.max(3, Math.floor(width / (k * minFs)))
	return { lines: layout(t, cap).lines.slice(0, maxLines), fs: minFs }
}
