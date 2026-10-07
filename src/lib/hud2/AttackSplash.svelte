<script lang="ts">
	// An attack, for EVERYONE (2.0 HUD): the defeat strike's look with both heroes in colour (nobody has fallen yet).
	// Viewer-relative like every splash: the enemy on the LEFT, your team on the right (spectators watch as the
	// Titans). An enemy attacks one of yours: "Enemy attacks Ally" (the strike comes from the left); one of yours
	// attacks: "Enemy attacked by Ally" (from the right). Played once per new attack in `attacks` — nothing is stored
	// for it, so joining mid-attack plays nothing.
	import { onDestroy } from 'svelte';
	import { heroSplash } from '$lib/heroes';
	import type { Team } from '$lib/match';

	export let attacks: Record<string, { by: string; defending?: boolean }> = {};
	export let heroOf: (pid: string) => { id: string; name: string } | null = () => null;
	export let nameOf: (pid: string) => string = (id) => id;
	export let teamOf: (pid: string) => Team | null = () => null;
	export let myTeam: Team = 'blue';

	let seen = new Set(Object.entries(attacks).map(([t, a]) => `${t}<${a.by}`));
	let shown: { left: string; right: string; enemyAttacks: boolean } | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	$: watch(attacks);
	function watch(a: typeof attacks) {
		const now = new Set(Object.entries(a).map(([t, x]) => `${t}<${x.by}`));
		for (const k of now) if (!seen.has(k)) { const [target, by] = k.split('<'); play(target, by); }
		seen = now;
	}
	function play(target: string, by: string) {
		const enemyAttacks = teamOf(by) !== myTeam; // the attacker is on the left (the enemy)
		shown = null;
		if (timer) clearTimeout(timer);
		requestAnimationFrame(() => {
			shown = { left: enemyAttacks ? by : target, right: enemyAttacks ? target : by, enemyAttacks };
			timer = setTimeout(() => (shown = null), 3200);
		});
	}
	onDestroy(() => { if (timer) clearTimeout(timer); });
	const TINT: Record<Team, string> = { orange: '#ffb27a', blue: '#8cc0ff' };
	const tint = (pid: string) => TINT[teamOf(pid) ?? 'blue'];
</script>

{#if shown}
	{@const L = heroOf(shown.left)}
	{@const R = heroOf(shown.right)}
	<div class="atks" class:fromR={!shown.enemyAttacks} aria-live="polite">
		<div class="aband" style="--lc:{teamOf(shown.left) === 'orange' ? '#ef7d22' : '#2f7fe6'}; --rc:{teamOf(shown.right) === 'orange' ? '#ef7d22' : '#2f7fe6'}">
			{#if L}<img class="aart l" src={heroSplash(L.id)} alt="" />{/if}
			{#if R}<img class="aart r" src={heroSplash(R.id)} alt="" />{/if}
			<div class="atxt">
				<div class="anm a"><span style:color={tint(shown.left)}>{L?.name ?? 'A hero'}</span> <small>({nameOf(shown.left)})</small></div>
				<div class="al2">{shown.enemyAttacks ? 'attacks' : 'attacked by'}</div>
				<div class="anm b"><span style:color={tint(shown.right)}>{R?.name ?? 'a hero'}</span> <small>({nameOf(shown.right)})</small></div>
			</div>
		</div>
	</div>
{/if}

<style>
	.atks { position: fixed; inset: 0; z-index: 59; pointer-events: none; overflow: hidden; }
	.aband { position: absolute; left: -12%; width: 124%; top: 50%; height: 230px; zoom: var(--uis, 1); transform: translateY(-50%) skewY(-4deg); overflow: hidden;
		background: linear-gradient(90deg, color-mix(in srgb, var(--lc) 55%, #05070c) 0%, #070a12 38%, #070a12 62%, color-mix(in srgb, var(--rc) 55%, #05070c) 100%);
		border-top: 3px solid color-mix(in srgb, var(--lc) 70%, #fff); border-bottom: 3px solid color-mix(in srgb, var(--rc) 70%, #fff);
		box-shadow: 0 0 60px rgba(0, 0, 0, 0.8); animation: astrike 3.2s cubic-bezier(.16, .9, .2, 1) forwards; }
	.fromR .aband { animation-name: astrikeR; }
	.aart { position: absolute; top: 50%; height: 175%; width: 34%; transform: translateY(-50%) skewY(4deg); object-fit: cover; opacity: 0.9; filter: saturate(1.2); }
	.aart.l { left: 6%; -webkit-mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent); mask-image: linear-gradient(90deg, transparent, #000 25%, #000 60%, transparent); }
	.aart.r { right: 6%; -webkit-mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent); mask-image: linear-gradient(270deg, transparent, #000 25%, #000 60%, transparent); }
	.atxt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transform: skewY(4deg); color: #f6ead2; text-align: center; text-shadow: 0 3px 0 rgba(0, 0, 0, .6), 0 0 22px rgba(0, 0, 0, .9); }
	.anm { font-size: 40px; line-height: 1.05; }
	.anm small { font-size: 0.55em; color: #cbd5e1; }
	.anm.a { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .12s both; }
	.anm.b { animation: slam .45s cubic-bezier(.2, 1.4, .3, 1) .34s both; }
	.al2 { font-size: 15px; letter-spacing: 0.35em; text-transform: uppercase; color: #ffd6a0; animation: fade .3s ease .3s both; }
	@keyframes astrike { 0% { transform: translateY(-50%) skewY(-4deg) translateX(-105%); } 10% { transform: translateY(-50%) skewY(-4deg) translateX(1.5%); } 13%, 86% { transform: translateY(-50%) skewY(-4deg) translateX(0); opacity: 1; } 100% { transform: translateY(-50%) skewY(-4deg) translateX(105%); opacity: 0.2; } }
	@keyframes astrikeR { 0% { transform: translateY(-50%) skewY(-4deg) translateX(105%); } 10% { transform: translateY(-50%) skewY(-4deg) translateX(-1.5%); } 13%, 86% { transform: translateY(-50%) skewY(-4deg) translateX(0); opacity: 1; } 100% { transform: translateY(-50%) skewY(-4deg) translateX(-105%); opacity: 0.2; } }
	@keyframes slam { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: scale(1); } }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
</style>
