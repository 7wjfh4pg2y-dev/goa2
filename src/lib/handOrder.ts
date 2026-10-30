// Your own order for the cards in your hand (drag them about). It is PRIVATE: kept in this tab only, never in the
// shared state — every game action names the card itself, not where it sits in your hand.

/** The hand in your order: cards you placed keep their places; a card new to the hand (retrieved, picked at a level-up)
 *  joins beside the cards that come before it in the default order, i.e. in its colour's usual place. */
export function arrangeHand(def: number[], custom: number[] | null | undefined): number[] {
	if (!custom?.length) return def;
	const inHand = new Set(def);
	const out: number[] = [];
	for (const i of custom) if (inHand.has(i) && !out.includes(i)) out.push(i);
	const rank = new Map(def.map((i, k) => [i, k]));
	for (const i of def) {
		if (out.includes(i)) continue;
		let at = 0;
		for (let k = 0; k < out.length; k++) if ((rank.get(out[k]) ?? 0) < (rank.get(i) ?? 0)) at = k + 1;
		out.splice(at, 0, i);
	}
	return out;
}

/** Move card `a` to where card `b` is (the cards between shift over by one). */
export function moveCard(list: number[], a: number, b: number): number[] {
	const from = list.indexOf(a), to = list.indexOf(b);
	if (from < 0 || to < 0 || from === to) return list;
	const out = [...list];
	out.splice(from, 1);
	out.splice(to, 0, a);
	return out;
}
