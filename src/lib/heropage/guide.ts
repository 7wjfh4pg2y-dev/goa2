// The hero page's Overview when no GM has written a guide yet: a line on how the hero plays and its strong /
// weak points, worked out from its roles and printed stats only (never from game results — the page stays
// neutral: no tier, win rate or pick rate).
import { heroById, TRAIT_LABELS, type Trait } from '../heroes'
import { blankGuide, type HeroGuide } from '../openings'

const STRENGTH: Record<Trait, string> = {
	damager: 'Big hits', disabler: 'Locks enemies down', durable: 'Hard to bring down', farming: 'Earns coins fast', healer: 'Keeps allies alive',
	melee: 'Strong up close', pusher: 'Moves units around', sniper: 'Hits from range', tactician: 'Sets up plays', tokens: 'Shapes the board'
}
const WEAK = ['Low damage', 'Fragile', 'Acts late', 'Slow']

/** the guide shown for a hero: the written one, else one worked out from its roles and stats (`auto` = which parts) */
export function guideFor(hero: string, written: HeroGuide | null): HeroGuide & { auto: { overview: boolean; strengths: boolean; weaknesses: boolean } } {
	const h = heroById(hero)
	const g = written ?? blankGuide(hero)
	const roles = (h?.traits ?? []).map((t) => TRAIT_LABELS[t].toLowerCase())
	const play = h
		? `${h.name} is a ${roles.slice(0, -1).join(', ')}${roles.length > 1 ? ' and ' : ''}${roles[roles.length - 1] ?? 'hero'}. ${h.stars <= 1 ? 'A good first hero: the cards do what they say.' : h.stars === 2 ? 'Easy to pick up, with a few tricks to learn.' : 'Takes a few games to master.'}`
		: ''
	const lows = (h?.stats ?? []).map((s, k) => ({ k, v: s[1] })).filter((s) => s.v <= 3).map((s) => WEAK[s.k])
	return {
		...g,
		overview: g.overview.trim() || play,
		strengths: g.strengths.length ? g.strengths : (h?.traits ?? []).slice(0, 4).map((t) => STRENGTH[t]),
		weaknesses: g.weaknesses.length ? g.weaknesses : lows.length ? lows : ['No single weak spot'],
		auto: { overview: !g.overview.trim(), strengths: !g.strengths.length, weaknesses: !g.weaknesses.length }
	}
}
