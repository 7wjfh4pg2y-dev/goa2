// GLOBAL hero stats (tested in globalstats.test.ts): the community stats site's hero cards (Aurelis Noble's global
// stats, copied in by hand on 14 Oct 2026 from the user's screenshots) — shown in the Hall and on the hero page with a
// GLOBAL tag, never mixed into our own numbers. Win types: throne = the crown, final = the flag, life = the skull.
// A win-type count the site drew too narrow to print was read off the bar's width.
export const GLOBAL_SOURCE = 'Aurelis Noble'
export const GLOBAL_AS_OF = '14 Oct 2026'

/** [hero id, win %, games] */
export type GlobalVs = [string, number, number]
export type GlobalHero = {
	wins: number; losses: number
	/** hero impact, win-rate points */
	impact: number
	/** average treatment effect and its 95% interval, points */
	ate: [number, number, number]
	tag: 'beginner' | 'skill' | null
	/** games whose win type is known */
	typed: number
	/** games / wins by win type: throne · final · life */
	games: [number, number, number]
	won: [number, number, number]
	mates: GlobalVs[]
	beats: GlobalVs[]
	countered: GlobalVs[]
}

export const GLOBAL_TAG: Record<'beginner' | 'skill', string> = { beginner: 'Beginner friendly', skill: 'Rewards skill' }

const H = (wins: number, losses: number, impact: number, ate: [number, number, number], tag: GlobalHero['tag'], typed: number,
	games: [number, number, number], won: [number, number, number], mates: GlobalVs[], beats: GlobalVs[], countered: GlobalVs[]): GlobalHero =>
	({ wins, losses, impact, ate, tag, typed, games, won, mates, beats, countered })

export const GLOBAL: Record<string, GlobalHero> = {
	tigerclaw: H(77, 75, -0.6, [-1, -7, 7], 'beginner', 78, [19, 28, 31], [8, 15, 12],
		[['nebkher', 100, 3], ['gydion', 100, 2], ['hanu', 80, 5]], [['emmitt', 100, 2], ['cutter', 80, 5], ['wuk', 67, 6]], [['ignatia', 0, 2], ['takahide', 0, 1], ['swift', 17, 6]]),
	brogan: H(75, 68, 2.5, [2, -6, 11], 'beginner', 58, [14, 18, 26], [9, 9, 17],
		[['snorri', 100, 2], ['widget', 100, 1], ['emmitt', 100, 1]], [['tali', 100, 2], ['brynn', 83, 6], ['silverarrow', 80, 10]], [['wuk', 0, 1], ['takahide', 0, 1], ['bain', 29, 14]]),
	arien: H(71, 69, -0.9, [-1, -9, 7], null, 59, [12, 25, 22], [6, 11, 13],
		[['ignatia', 100, 1], ['tali', 100, 3], ['brynn', 100, 3]], [['widget', 100, 1], ['ignatia', 100, 1], ['snorri', 100, 2]], [['mortimer', 0, 1], ['nebkher', 0, 1], ['sabina', 31, 26]]),
	xargatha: H(72, 66, 2.6, [3, -5, 10], 'skill', 61, [7, 22, 32], [5, 13, 11],
		[['tali', 100, 1], ['takahide', 100, 1], ['gydion', 100, 1]], [['razzle', 100, 3], ['widget', 100, 1], ['min', 88, 8]], [['gydion', 0, 3], ['mortimer', 0, 3], ['hanu', 0, 1]]),
	wasp: H(66, 61, 5.1, [5, -3, 14], 'beginner', 57, [12, 18, 27], [7, 11, 15],
		[['misa', 100, 4], ['min', 100, 1], ['razzle', 100, 1]], [['trinkets', 100, 3], ['gydion', 100, 1], ['hanu', 100, 1]], [['razzle', 0, 3], ['nebkher', 0, 2], ['widget', 33, 3]]),
	dodger: H(51, 56, 3.9, [4, -3, 13], 'beginner', 44, [12, 13, 19], [6, 5, 10],
		[['razzle', 100, 1], ['swift', 100, 1], ['misa', 100, 2]], [['garrus', 78, 9], ['cutter', 67, 6], ['silverarrow', 64, 11]], [['widget', 0, 1], ['brynn', 0, 1], ['emmitt', 0, 1]]),
	sabina: H(59, 40, 2.6, [3, -5, 12], 'skill', 47, [12, 17, 18], [7, 9, 13],
		[['silverarrow', 100, 1], ['wuk', 100, 1], ['takahide', 100, 1]], [['brynn', 100, 1], ['takahide', 100, 1], ['hanu', 100, 2]], [['nebkher', 0, 1], ['tali', 25, 4], ['ignatia', 25, 4]]),
	garrus: H(43, 53, -4.4, [-4, -15, 5], 'skill', 44, [11, 17, 16], [3, 7, 8],
		[['arien', 78, 9], ['brynn', 67, 3], ['hanu', 67, 6]], [['mortimer', 100, 1], ['cutter', 75, 8], ['wuk', 75, 4]], [['gydion', 0, 1], ['hanu', 0, 3], ['dodger', 22, 9]]),
	bain: H(53, 42, 10.0, [10, 2, 18], null, 43, [5, 15, 23], [1, 5, 16],
		[['gydion', 100, 1], ['brynn', 100, 1], ['widget', 80, 5]], [['emmitt', 100, 3], ['brynn', 91, 11], ['swift', 78, 9]], [['mortimer', 0, 1], ['hanu', 0, 1], ['min', 0, 4]]),
	rowenna: H(46, 46, 4.0, [4, -5, 12], 'skill', 49, [8, 17, 24], [1, 9, 11],
		[['hanu', 100, 3], ['widget', 100, 1], ['brynn', 100, 1]], [['razzle', 100, 2], ['mortimer', 100, 1], ['ignatia', 100, 1]], [['emmitt', 0, 2], ['arien', 17, 6], ['brogan', 21, 14]]),
	misa: H(45, 39, -0.1, [0, -9, 10], 'beginner', 40, [7, 21, 12], [6, 10, 6],
		[['ignatia', 100, 1], ['wasp', 100, 4], ['dodger', 100, 2]], [['emmitt', 100, 2], ['mortimer', 100, 3], ['takahide', 100, 1]], [['gydion', 0, 1], ['swift', 14, 7], ['wuk', 17, 6]]),
	whisper: H(31, 47, -2.9, [-3, -11, 6], 'skill', 44, [6, 17, 21], [1, 7, 5],
		[['xargatha', 67, 9], ['wasp', 67, 3], ['garrus', 57, 7]], [['takahide', 100, 1], ['wuk', 100, 1], ['cutter', 75, 4]], [['widget', 0, 2], ['snorri', 0, 1], ['mrak', 0, 3]]),
	silverarrow: H(35, 43, 2.2, [2, -5, 9], 'skill', 47, [12, 13, 22], [7, 7, 9],
		[['emmitt', 100, 1], ['gydion', 100, 1], ['nebkher', 100, 1]], [['takahide', 100, 1], ['ignatia', 100, 1], ['mrak', 80, 5]], [['snorri', 0, 1], ['gydion', 0, 1], ['emmitt', 0, 2]]),
	ursafar: H(32, 39, -0.3, [0, -11, 9], 'skill', 39, [12, 9, 18], [5, 5, 8],
		[['emmitt', 100, 1], ['widget', 100, 2], ['hanu', 100, 1]], [['min', 75, 4], ['emmitt', 75, 4], ['whisper', 69, 13]], [['cutter', 0, 2], ['ignatia', 0, 1], ['takahide', 0, 1]]),
	mrak: H(33, 27, 4.1, [4, -6, 16], null, 31, [10, 11, 10], [5, 8, 5],
		[['widget', 100, 1], ['wuk', 100, 1], ['takahide', 100, 1]], [['brynn', 100, 3], ['hanu', 100, 4], ['whisper', 100, 3]], [['ignatia', 0, 1], ['wuk', 0, 2], ['silverarrow', 20, 5]]),
	cutter: H(22, 35, -13.3, [-13, -22, -1], 'skill', 22, [4, 11, 7], [2, 6, 5],
		[['widget', 100, 1], ['xargatha', 71, 7], ['tali', 67, 6]], [['ursafar', 100, 2], ['snorri', 100, 1], ['widget', 100, 2]], [['ignatia', 0, 1], ['gydion', 0, 2], ['arien', 10, 10]]),
	swift: H(28, 27, -0.9, [-1, -12, 8], 'beginner', 25, [5, 12, 8], [3, 7, 4],
		[['tali', 100, 2], ['arien', 100, 2], ['dodger', 100, 1]], [['takahide', 100, 2], ['misa', 86, 7], ['tigerclaw', 83, 6]], [['mrak', 20, 5], ['xargatha', 20, 5], ['nebkher', 20, 5]]),
	min: H(26, 29, -4.0, [-4, -13, 9], 'beginner', 30, [9, 12, 9], [4, 5, 6],
		[['brogan', 100, 1], ['wasp', 100, 1], ['razzle', 100, 2]], [['snorri', 100, 1], ['mortimer', 100, 3], ['takahide', 100, 2]], [['emmitt', 0, 1], ['brynn', 0, 2], ['razzle', 0, 2]]),
	trinkets: H(18, 30, -14.3, [-14, -25, -3], 'skill', 21, [4, 10, 7], [1, 5, 2],
		[['razzle', 100, 2], ['tali', 100, 2], ['ursafar', 100, 2]], [['tali', 100, 2], ['takahide', 100, 1], ['widget', 100, 1]], [['emmitt', 0, 1], ['wasp', 0, 3], ['gydion', 0, 2]]),
	tali: H(19, 22, -5.1, [-5, -17, 9], 'beginner', 24, [3, 11, 10], [3, 5, 2],
		[['nebkher', 100, 1], ['trinkets', 100, 2], ['takahide', 100, 1]], [['silverarrow', 100, 4], ['whisper', 100, 3], ['ursafar', 80, 5]], [['widget', 0, 3], ['razzle', 0, 1], ['gydion', 0, 1]]),
	nebkher: H(22, 16, -1.9, [-2, -15, 15], 'skill', 12, [6, 4, 2], [4, 1, 1],
		[['razzle', 100, 2], ['snorri', 100, 1], ['xargatha', 100, 1]], [['takahide', 100, 1], ['ignatia', 100, 3], ['wuk', 100, 2]], [['misa', 0, 1], ['mortimer', 0, 2], ['emmitt', 0, 3]]),
	hanu: H(17, 20, -0.3, [0, -14, 13], 'skill', 19, [2, 9, 8], [2, 2, 2],
		[['brynn', 100, 1], ['xargatha', 100, 2], ['ursafar', 100, 1]], [['garrus', 100, 3], ['xargatha', 100, 1], ['dodger', 100, 1]], [['brynn', 0, 3], ['razzle', 0, 2], ['mrak', 0, 4]]),
	wuk: H(21, 16, 1.5, [1, -13, 15], 'skill', 17, [6, 5, 6], [3, 4, 4],
		[['tali', 100, 1], ['hanu', 100, 2], ['snorri', 100, 1]], [['takahide', 100, 2], ['mrak', 100, 2], ['brogan', 100, 1]], [['nebkher', 0, 2], ['whisper', 0, 1], ['razzle', 0, 1]]),
	mortimer: H(16, 20, -5.6, [-6, -19, 13], null, 22, [6, 11, 5], [2, 6, 3],
		[['dodger', 100, 1], ['snorri', 100, 1], ['tali', 100, 1]], [['snorri', 100, 2], ['nebkher', 100, 2], ['xargatha', 100, 3]], [['rowenna', 0, 1], ['emmitt', 0, 4], ['garrus', 0, 1]]),
	brynn: H(15, 20, -8.0, [-8, -22, 9], 'beginner', 16, [4, 6, 6], [3, 3, 3],
		[['arien', 100, 3], ['hanu', 100, 1], ['rowenna', 100, 1]], [['xargatha', 100, 1], ['dodger', 100, 1], ['hanu', 100, 3]], [['razzle', 0, 1], ['mrak', 0, 3], ['wasp', 0, 1]]),
	widget: H(18, 15, -1.3, [-1, -19, 18], 'skill', 23, [6, 10, 7], [3, 4, 7],
		[['brogan', 100, 1], ['cutter', 100, 1], ['razzle', 100, 1]], [['dodger', 100, 1], ['gydion', 100, 3], ['hanu', 100, 1]], [['nebkher', 0, 1], ['arien', 0, 1], ['razzle', 0, 1]]),
	razzle: H(18, 10, 2.8, [3, -17, 17], 'skill', 13, [3, 7, 3], [3, 3, 2],
		[['nebkher', 100, 2], ['widget', 100, 1], ['dodger', 100, 1]], [['wasp', 100, 3], ['hanu', 100, 2], ['min', 100, 2]], [['xargatha', 0, 3], ['rowenna', 0, 2], ['arien', 0, 1]]),
	emmitt: H(17, 10, 10.1, [10, -6, 31], 'skill', 17, [3, 7, 7], [1, 6, 4],
		[['mortimer', 100, 3], ['swift', 100, 1], ['arien', 100, 1]], [['rowenna', 100, 2], ['min', 100, 1], ['ignatia', 100, 2]], [['widget', 0, 3], ['bain', 0, 3], ['misa', 0, 2]]),
	snorri: H(12, 15, 0.2, [0, -15, 16], 'beginner', 14, [4, 8, 2], [1, 5, 1],
		[['brogan', 100, 2], ['arien', 100, 1], ['mortimer', 100, 1]], [['takahide', 100, 1], ['silverarrow', 100, 1], ['whisper', 100, 1]], [['ignatia', 0, 1], ['mortimer', 0, 2], ['arien', 0, 2]]),
	gydion: H(13, 10, 1.5, [2, -18, 19], 'beginner', 9, [0, 6, 3], [0, 4, 2],
		[['snorri', 100, 2], ['brogan', 100, 1], ['xargatha', 100, 1]], [['nebkher', 100, 3], ['cutter', 100, 2], ['tali', 100, 1]], [['widget', 0, 3], ['wuk', 0, 1], ['sabina', 0, 1]]),
	ignatia: H(9, 10, 5.5, [6, -17, 8], 'skill', 7, [2, 4, 1], [2, 2, 0],
		[['emmitt', 100, 2], ['wuk', 100, 1], ['misa', 100, 1]], [['ursafar', 100, 1], ['cutter', 100, 1], ['snorri', 100, 1]], [['brynn', 0, 1], ['misa', 0, 1], ['gydion', 0, 1]]),
	takahide: H(6, 11, -16.7, [-17, -20, -12], 'skill', 8, [2, 4, 2], [0, 0, 0],
		[['xargatha', 100, 1], ['snorri', 100, 1], ['sabina', 100, 1]], [['ursafar', 100, 1], ['tigerclaw', 100, 1], ['brogan', 100, 1]], [['arien', 0, 1], ['silverarrow', 0, 1], ['wasp', 0, 1]])
}

export const globalOf = (hero: string): GlobalHero | null => GLOBAL[hero] ?? null
export const globalGames = (g: GlobalHero) => g.wins + g.losses
export const globalWin = (g: GlobalHero) => (globalGames(g) ? (100 * g.wins) / globalGames(g) : 0)
/** wins in a matchup entry (its % of its games, rounded) */
export const vsWins = (v: GlobalVs) => Math.round((v[1] * v[2]) / 100)
/** each count as a whole % of their sum (largest remainder, so the parts add up to 100) */
export function sharePct(xs: number[]): number[] {
	const t = xs.reduce((a, b) => a + b, 0)
	if (!t) return xs.map(() => 0)
	const raw = xs.map((x) => (100 * x) / t)
	const out = raw.map(Math.floor)
	let left = 100 - out.reduce((a, b) => a + b, 0)
	for (const i of raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]).map((x) => x[1])) { if (left-- <= 0) break; out[i]++ }
	return out
}
