<script lang="ts">
	// 2.0 preview portal (/goa2/v2/preview): everything 2.0 has that 1.0 doesn't, each with a
	// way to see it and a tick box. Opening this page turns on preview mode for the TAB
	// (siteVersion.ts), so the version switch doesn't send it back to 1.0 while you look around.
	// Ticks are kept in this browser; "Copy my picks" gives a list to paste to Claude.
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { setPreview } from '$lib/siteVersion';

	type See = { label: string; href: string; note?: string };
	type Item = { id: string; title: string; what: string; see: See[]; tag?: string };
	type Group = { name: string; items: Item[] };

	const app = `${base}/`;
	const demo = `${base}/splash-demo`;
	const game = (q = '') => `${base}/sandbox${q}`;
	const GROUPS: Group[] = [
		{ name: 'Before the game', items: [
			{ id: 'tide', title: 'The Tide look', what: 'Deep-sea navy, brass buttons, the live island and sea behind every menu. New landing page, menus, Create form, lobby with the live board in the middle, and the full-art hero select.', see: [{ label: 'Open the 2.0 app', href: app, note: 'click around freely — this tab stays on 2.0' }] },
			{ id: 'matchup', title: 'Matchup slices', what: '"The battle lines are drawn": heroes slash in as leaning slices of their big paintings, team symbols loom behind, a blade lands between the teams.', see: [{ label: 'Play a 1-player game', href: app, note: 'Enter → Player → Create game → sit → Ready → Begin → pick a hero → Select Hero → Begin the battle' }] },
			{ id: 'symbols', title: 'New hero symbols', what: 'Sharper hero symbols on every card back, the deck button and hero select; the gear-and-ice crest on the turn / round cards.', see: [{ label: 'Sandbox game', href: game() }, { label: 'Splash demo → Next turn', href: demo }] }
		] },
		{ name: 'In the game (desktop)', items: [
			{ id: 'topbar', title: 'Top bar', what: 'One scoreline (each team\'s Life, round + turn pips, the lane, waves, tie-breaker coin), the ☰ menu, a slim log tab, one-line prompts and a smaller piece toolbar.', see: [{ label: 'Sandbox game', href: game() }] },
			{ id: 'helm', title: 'Console, roster and player boards', what: 'Player chips along the top with this turn\'s card, drop-down player boards, the initiative rail after the reveal, and the bottom console with ONE action button. Hand cards: click to arm, click the button to commit.', see: [{ label: '4 players', href: game('?n=4') }, { label: '6 players', href: game('?n=6') }, { label: '10 players', href: game('?n=10') }] },
			{ id: 'deck', title: 'Ascension deck + level-up choice', what: 'The deck as three rising colour columns with a crown for the ultimate, a cleaner inspector, and a two-card choice when you level up.', see: [{ label: 'Sandbox in the level-up step', href: game('?scene=levelup'), note: 'the deck opens itself — or use the deck well in the console' }] }
		] },
		{ name: 'In the game (phone)', items: [
			{ id: 'phone', title: 'Phone layout', what: 'One-row scoreline, a roster row, the hand over the board, a two-row bar with one action pill, and a colour-tab deck.', see: [{ label: 'Sandbox game', href: game(), note: 'open this page on your phone' }, { label: 'Level-up step', href: game('?scene=levelup') }] }
		] },
		{ name: 'End of the game', items: [
			{ id: 'report', title: 'Battle report from real games', what: 'After a win, the victory card glides up into the stats screen — filled from the game itself (kills, deaths, assists, minions, coins earned, the tide of battle).', see: [{ label: 'Splash demo → Game over', href: demo, note: 'the report buttons under Game over' }] },
			{ id: 'crest', title: 'The game-winning push', what: 'A winning push plays as one sequence straight into the victory card.', see: [{ label: 'Splash demo → The game-winning push', href: demo }] },
			{ id: 'endgame', title: 'End-game polish', what: 'Fixes from a review of the end of the game. Built but never checked on screen.', tag: 'unfinished', see: [{ label: 'Splash demo', href: demo }] }
		] },
		{ name: 'Under the hood (nothing to look at)', items: [
			{ id: 'reliable', title: 'Reliability fixes', what: 'A host alone in a room who reloads gets back in; two players sitting down together never get the same colour; joining never hangs on "connecting".', tag: 'recommended', see: [] },
			{ id: 'speed', title: 'Speed pass', what: '60 fps on weak computers (was 18–20) — mostly by rebuilding the 2.0 screens\' effects; some of it carries over to 1.0.', see: [] }
		] }
	];

	const KEY = 'goa2-preview-picks';
	let picks: Record<string, boolean> = {};
	let copied = false;
	onMount(() => {
		setPreview(true);
		try { picks = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { picks = {}; }
	});
	function toggle(id: string) {
		picks = { ...picks, [id]: !picks[id] };
		try { localStorage.setItem(KEY, JSON.stringify(picks)); } catch { /* ignore */ }
	}
	$: chosen = GROUPS.flatMap((g) => g.items).filter((i) => picks[i.id]);
	async function copy() {
		const text = `Bring these from 2.0 into 1.0:\n${chosen.map((i) => `- ${i.title}`).join('\n')}`;
		try { await navigator.clipboard.writeText(text); copied = true; setTimeout(() => (copied = false), 1800); }
		catch { prompt('Copy this:', text); }
	}
	function leave() { setPreview(false); location.href = '/goa2/'; }
</script>

<svelte:head><title>2.0 preview · GoA2</title></svelte:head>

<div class="pv">
	<header>
		<div>
			<h1>2.0 preview</h1>
			<p>Everything 2.0 has that 1.0 doesn't. Tick what you want brought over. This tab stays on 2.0 until you close it or leave.</p>
		</div>
		<button class="leave" on:click={leave}>Back to the live site</button>
	</header>

	{#each GROUPS as g (g.name)}
		<section>
			<h2>{g.name}</h2>
			{#each g.items as it (it.id)}
				<article class:on={picks[it.id]}>
					<label class="tick">
						<input type="checkbox" checked={!!picks[it.id]} on:change={() => toggle(it.id)} />
						<span class="box" aria-hidden="true"></span>
					</label>
					<div class="body">
						<h3>{it.title}{#if it.tag}<span class="tag {it.tag}">{it.tag}</span>{/if}</h3>
						<p>{it.what}</p>
						{#if it.see.length}
							<div class="see">
								{#each it.see as s (s.label)}
									<a href={s.href}>{s.label} →</a>{#if s.note}<span class="note">{s.note}</span>{/if}
								{/each}
							</div>
						{/if}
					</div>
				</article>
			{/each}
		</section>
	{/each}

	<footer>
		<span>{chosen.length ? `${chosen.length} picked` : 'Nothing picked yet'}</span>
		<button class="copy" disabled={!chosen.length} on:click={copy}>{copied ? 'Copied!' : 'Copy my picks'}</button>
	</footer>
</div>

<style>
	.pv { max-width: 860px; margin: 0 auto; padding: 28px 16px 110px; color: #e9eef6; }
	header { display: flex; gap: 16px; align-items: flex-start; justify-content: space-between; margin-bottom: 18px; }
	h1 { margin: 0; font-size: 2.2rem; font-weight: normal; letter-spacing: .04em; color: #f3d48a; }
	header p { margin: 6px 0 0; color: #a9b6c8; font-size: .95rem; line-height: 1.4; }
	.leave { flex: none; font: inherit; font-size: .85rem; padding: 8px 14px; border-radius: 10px; cursor: pointer; color: #e9eef6;
		background: rgba(255, 255, 255, .06); border: 1px solid rgba(255, 255, 255, .2); }
	section { margin-top: 22px; }
	h2 { margin: 0 0 8px; font-size: .78rem; font-weight: normal; letter-spacing: .16em; text-transform: uppercase; color: #c9a75e; }
	article { display: flex; gap: 14px; padding: 14px 16px; margin-bottom: 10px; border-radius: 14px;
		background: rgba(10, 22, 38, .82); border: 1px solid rgba(255, 255, 255, .1); }
	article.on { border-color: #d9a845; box-shadow: inset 0 0 0 1px rgba(217, 168, 69, .35); }
	.tick { position: relative; flex: none; width: 26px; height: 26px; margin-top: 2px; cursor: pointer; }
	.tick input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
	.box { position: absolute; inset: 0; border-radius: 7px; border: 2px solid rgba(217, 168, 69, .6); background: rgba(0, 0, 0, .25); pointer-events: none; }
	article.on .box { background: linear-gradient(180deg, #f3d48a, #c9952f); border-color: #f3d48a; }
	article.on .box::after { content: '✓'; position: absolute; inset: 0; display: grid; place-items: center; color: #2a1c05; font-size: 1rem; }
	.body { min-width: 0; }
	h3 { margin: 0; font-size: 1.15rem; font-weight: normal; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
	.body p { margin: 4px 0 0; color: #b7c3d3; font-size: .9rem; line-height: 1.45; }
	.tag { font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; }
	.tag.unfinished { color: #fca5a5; border: 1px solid rgba(239, 68, 68, .5); }
	.tag.recommended { color: #86efac; border: 1px solid rgba(34, 197, 94, .5); }
	.see { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px; margin-top: 10px; }
	.see a { color: #f3d48a; text-decoration: none; font-size: .9rem; padding: 5px 10px; border-radius: 8px;
		background: rgba(217, 168, 69, .12); border: 1px solid rgba(217, 168, 69, .4); }
	.see a:hover { background: rgba(217, 168, 69, .22); }
	.note { color: #8796aa; font-size: .78rem; }
	footer { position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; align-items: center; gap: 14px; padding: 12px 16px;
		background: rgba(6, 16, 28, .96); border-top: 1px solid rgba(217, 168, 69, .35); color: #a9b6c8; }
	.copy { font: inherit; font-size: .95rem; padding: 9px 18px; border-radius: 10px; cursor: pointer; color: #2a1c05;
		background: linear-gradient(180deg, #f3d48a, #c9952f); border: 1px solid #f3d48a; }
	.copy:disabled { opacity: .45; cursor: default; }
	@media (max-width: 560px) {
		header { flex-direction: column; }
		h1 { font-size: 1.8rem; }
	}
</style>
