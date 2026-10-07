// The top bar's beam: the two armies' energy meeting under the bar. Measured as a length along the beam (0 = its
// left end, L = its right end). Resting points: the middle zone = L / 2 (the bottom of the tie-breaker coin), a beach =
// halfway across that side's Life box, a throne = the outer end of that box. Inside a zone the clash is a tug of
// war of minion health: the team losing more of its wave is pushed back towards its own end, and the clash reaches
// the next resting point exactly when that team's last minion falls — which is the push.
import type { Team } from '$lib/match'

export type BeamInput = {
	/** beam length and one Life box's width, in the same units */
	L: number
	lifeW: number
	/** the team drawn on the LEFT (the viewer's enemy) */
	left: Team
	/** battle zone index (0 = the Atlantean beach … zones - 1 = the Titan beach) and how many zones the lane has */
	zone: number
	zones: number
	/** minions alive in the battle zone, and how many each team's wave started with there */
	orange: number
	blue: number
	startO: number
	startB: number
	/** the game is over: the clash sits on the loser's throne */
	won?: Team | null
}

const other = (t: Team): Team => (t === 'orange' ? 'blue' : 'orange')

/** where one zone's resting point sits on the beam */
export function restAt(b: Pick<BeamInput, 'L' | 'lifeW' | 'left' | 'zones'>, zone: number): number {
	const mid = (t: Team) => (t === b.left ? b.lifeW / 2 : b.L - b.lifeW / 2)
	const n = Math.max(1, b.zones)
	if (n === 1) return b.L / 2
	const u = Math.min(1, Math.max(0, zone / (n - 1))) // 0 = Atlantean beach, 1 = Titan beach
	const o = mid('orange'), bl = mid('blue')
	return u <= 0.5 ? o + (b.L / 2 - o) * (u / 0.5) : b.L / 2 + (bl - b.L / 2) * ((u - 0.5) / 0.5)
}

/** the thrones: a team's own end of the beam */
export const endOf = (b: Pick<BeamInput, 'L' | 'left'>, t: Team) => (t === b.left ? 0 : b.L)

export function clashAt(b: BeamInput): number {
	if (b.won) return endOf(b, other(b.won))
	const here = restAt(b, b.zone)
	const ho = b.startO > 0 ? Math.min(1, b.orange / b.startO) : 0
	const hb = b.startB > 0 ? Math.min(1, b.blue / b.startB) : 0
	if (ho === hb) return here
	// the stronger side pushes towards the other team's throne (a higher zone index = towards the Titans)
	const orangeAhead = ho > hb
	const nextZone = b.zone + (orangeAhead ? 1 : -1)
	const target = nextZone >= 0 && nextZone < b.zones ? restAt(b, nextZone) : endOf(b, orangeAhead ? 'blue' : 'orange')
	const t = orangeAhead ? (ho - hb) / ho : (hb - ho) / hb
	return here + (target - here) * t
}
