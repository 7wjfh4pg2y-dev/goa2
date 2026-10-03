// Colour clashes in the lobby, settled the same way on every client.
//
// Players choose from the colours nobody holds — as far as they can see. Presence
// takes a moment to arrive, so two people sitting down together can both take the
// first free colour. The rule: of the players holding one colour, whoever took it
// FIRST keeps it (`colorAt`, the moment they took it; ties and old clients without
// one go by the smaller id); the others move — in that same order — each to the
// first colour nobody holds. Every client works this out from the same presence
// list and gets the same answer, and only the player who has to move acts, so two
// players can never bump each other back and forth.
//
// "First" is by stamp. A stamp is the taker's clock pushed past every stamp they
// could see at the time (match.ts setSelf), so a player who saw you holding a colour
// always sorts after you, whatever their clock says; only two players who took a
// colour before either had seen the other are ordered by their raw clocks — the one
// case where no client can know who was first, and any fixed answer is as good.

export interface ColorHolder {
	id: string
	color: string
	colorAt?: number
}

const earlier = (a: ColorHolder, b: ColorHolder) =>
	(a.colorAt ?? 0) - (b.colorAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Who has to change colour, and to what (player id → new colour). Empty when
 * nobody clashes. `palette` is every colour, in the order they are offered. */
export function colorMoves(players: ColorHolder[], palette: string[]): Record<string, string> {
	const taken = new Set<string>()
	const movers: ColorHolder[] = []
	for (const p of players.filter((p) => p.color && p.color !== 'spectator').sort(earlier)) {
		if (taken.has(p.color)) movers.push(p)
		else taken.add(p.color)
	}
	const moves: Record<string, string> = {}
	for (const p of movers) {
		const free = palette.find((c) => !taken.has(c))
		if (!free) break // every colour is held: nothing to move to
		taken.add(free)
		moves[p.id] = free
	}
	return moves
}
