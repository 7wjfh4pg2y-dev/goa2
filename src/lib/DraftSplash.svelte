<script lang="ts" context="module">
	import type { DraftSystem, Team } from '$lib/match';
	// three looks on /splash-demo (2026-10-22): 'herald' = a mode banner slamming across (MOBA lobby announcer),
	// 'seal' = a crest stamped in the middle with the rules on a ribbon, 'order' = the whole draft order laid out
	export type DraftSplashLook = 'herald' | 'seal' | 'order';
	export const DRAFT_SPLASH_LOOKS: { id: DraftSplashLook; label: string }[] = [
		{ id: 'herald', label: 'A · Herald' },
		{ id: 'seal', label: 'B · Seal' },
		{ id: 'order', label: 'C · Draft order' }
	];
	export const DRAFT_SPLASH_MS = 4200;
	// the words for each system: a title, a battle-cry, the rules as chips
	export const DRAFT_COPY: Record<DraftSystem, { title: string; cry: string; rules: string[] }> = {
		'all-pick': { title: 'All Pick', cry: 'Every hero is on the table', rules: ['Everyone picks at once', '1:20 to choose'] },
		'all-random': { title: 'All Random', cry: 'Fate deals the heroes', rules: ['A hero dealt to each', 'Teammates may swap'] },
		'single-draft': { title: 'Single Draft', cry: 'Three heroes. One choice.', rules: ['3 heroes dealt to you', '30 s a pick', '30 s team overtime'] },
		'pick-ban': { title: 'Pick & Ban', cry: 'Deny them. Then choose.', rules: ['1 ban a team', '30 s a turn', '30 s team overtime'] }
	};
</script>

<script lang="ts">
	import { pickSequence } from '$lib/match';
	import { teamName } from '$lib/teams';
	import coinOrange from '$lib/images/tiebreaker_orange.png';
	import coinBlue from '$lib/images/tiebreaker_blue.png';

	export let look: DraftSplashLook = 'herald';
	export let system: DraftSystem = 'all-pick';
	export let seats = 4; // 4 or 6
	export let coin: Team = 'orange'; // the team holding the tie-breaker
	export let myTeam: Team | null = null; // viewer-relative: the enemy on the left
	export let mobile = false;
	export let onDone: (() => void) | null = null;

	$: copy = DRAFT_COPY[system];
	$: left = (myTeam === 'orange' ? 'blue' : 'orange') as Team;
	$: right = (left === 'orange' ? 'blue' : 'orange') as Team;
	// the draft order (look C): turn-based systems step through it; the others light every seat at once
	$: other = (coin === 'orange' ? 'blue' : 'orange') as Team;
	$: steps = (() => {
		const teams: [Team, Team] = [other, coin];
		const out: { team: Team; type: 'pick' | 'ban'; n: number }[] = [];
		if (system === 'pick-ban') for (const t of teams) out.push({ team: t, type: 'ban', n: 0 });
		if (system === 'pick-ban' || system === 'single-draft') {
			const c: Record<Team, number> = { orange: 0, blue: 0 };
			for (const k of pickSequence(seats)) { const t = teams[k]; out.push({ team: t, type: 'pick', n: ++c[t] }); }
		}
		return out;
	})();
	$: stepped = steps.length > 0;
	$: half = seats / 2;

	// one run: mounting plays it; it removes itself when done
	let alive = true;
	setTimeout(() => { alive = false; onDone?.(); }, DRAFT_SPLASH_MS);
</script>

<!-- the system's emblem, brass line art in a 100-unit box -->
{#snippet emblem()}
	<svg viewBox="0 0 100 100" class="emb" aria-hidden="true">
		{#if system === 'all-pick'}
			{#each [0, 1, 2] as r (r)}{#each [0, 1, 2] as c (c)}<rect x={19 + c * 22} y={19 + r * 22} width="18" height="18" rx="4" class:lit={r === 1 && c === 1} />{/each}{/each}
		{:else if system === 'all-random'}
			<g transform="rotate(-14 38 56)"><rect x="16" y="34" width="44" height="44" rx="9" /><circle cx="27" cy="45" r="3.6" class="pip" /><circle cx="38" cy="56" r="3.6" class="pip" /><circle cx="49" cy="67" r="3.6" class="pip" /></g>
			<g transform="rotate(12 66 42)"><rect x="46" y="20" width="40" height="40" rx="8" /><circle cx="56" cy="30" r="3.3" class="pip" /><circle cx="76" cy="30" r="3.3" class="pip" /><circle cx="56" cy="50" r="3.3" class="pip" /><circle cx="76" cy="50" r="3.3" class="pip" /></g>
		{:else if system === 'single-draft'}
			<rect x="30" y="22" width="40" height="58" rx="5" transform="rotate(-20 50 86)" />
			<rect x="30" y="22" width="40" height="58" rx="5" transform="rotate(20 50 86)" />
			<rect x="30" y="18" width="40" height="58" rx="5" class="lit" />
			<path d="M50 34l4.5 9 10 1.4-7.3 7 1.8 9.9L50 56.6l-9 4.7 1.8-9.9-7.3-7 10-1.4z" class="pip" />
		{:else}
			<path d="M50 14v54M40 60h20M50 68v14M45 82h10" />
			<path d="M50 14l-6 10v34h12V24z" class="lit" />
			<circle cx="50" cy="50" r="34" class="ban" /><path d="M26 26l48 48" class="ban" />
		{/if}
	</svg>
{/snippet}

{#if alive}
	<div class="ds {look}" class:ph={mobile} style="--l:var(--{left}); --r:var(--{right})" role="status" aria-live="polite">
		{#if look === 'herald'}
			<span class="dim"></span>
			<div class="band">
				<span class="bl"></span><span class="br"></span>
				<span class="blade"></span>
				<div class="hrow">
					<span class="hex">{@render emblem()}</span>
					<div class="htx">
						<span class="kick">Hero draft</span>
						<span class="ttl">{copy.title}</span>
						<span class="cry">{copy.cry}</span>
					</div>
				</div>
			</div>
			<div class="chips">{#each copy.rules as r, i (r)}<span class="chip" style="--i:{i}">{r}</span>{/each}</div>
		{:else if look === 'seal'}
			<span class="dim"></span>
			<div class="sealbox">
				<img class="coin cl" src={left === 'orange' ? coinOrange : coinBlue} alt="" />
				<img class="coin cr" src={right === 'orange' ? coinOrange : coinBlue} alt="" />
				<span class="shock"></span>
				<span class="runes"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" /><circle cx="100" cy="100" r="84" class="thin" />{#each Array(24) as _, k (k)}<path d="M100 10v10" transform="rotate({k * 15} 100 100)" class:long={k % 3 === 0} />{/each}</svg></span>
				<span class="crest"><svg viewBox="0 0 100 100" class="hexbg" aria-hidden="true"><path d="M50 4l40 23v46L50 96 10 73V27z" /><path d="M50 12l33 19v38L50 88 17 69V31z" class="in" /></svg>{@render emblem()}</span>
			</div>
			<div class="ribbon"><span class="rtail l"></span><span class="rbody">{copy.title}</span><span class="rtail r"></span></div>
			<span class="scry">{copy.cry}</span>
			<div class="chips">{#each copy.rules as r, i (r)}<span class="chip" style="--i:{i}">{r}</span>{/each}</div>
		{:else}
			<span class="dim"></span>
			<div class="otop">
				<span class="ohex">{@render emblem()}</span>
				<div class="otx"><span class="kick">Hero draft</span><span class="ttl">{copy.title}</span></div>
			</div>
			<div class="lane" class:flat={!stepped}>
				{#if stepped}
					{#each steps as st, i (i)}
						<div class="slot t-{st.team}" class:ban={st.type === 'ban'} style="--i:{i}">
							<span class="sface">{#if st.type === 'ban'}<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M6.5 6.5l11 11" /></svg>{:else}{st.n}{/if}</span>
							<span class="slab">{st.type === 'ban' ? 'Ban' : 'Pick'}</span>
						</div>
						{#if st.type === 'ban' && steps[i + 1]?.type === 'pick'}<span class="gap"></span>{/if}
					{/each}
					<span class="sweep" style="--n:{steps.length}"></span>
				{:else}
					{#each [left, right] as t (t)}
						<div class="side t-{t}">
							<span class="sname">{teamName(t)}</span>
							<div class="srow">{#each Array(half) as _, k (k)}<div class="slot t-{t} all" style="--i:{system === 'all-random' ? k * 2 + (t === left ? 0 : 1) : 0}"><span class="sface">{#if system === 'all-random'}?{:else}✓{/if}</span></div>{/each}</div>
						</div>
					{/each}
				{/if}
			</div>
			{#if stepped}<div class="legend"><span class="lg t-{other}">{teamName(other)} · first &amp; last pick</span><span class="lg t-{coin}">{teamName(coin)} · tie-breaker</span></div>{/if}
			<div class="chips">{#each copy.rules as r, i (r)}<span class="chip" style="--i:{i}">{r}</span>{/each}</div>
		{/if}
	</div>
{/if}

<style>
	/* sizes in --u (1 design px at ~1100 px wide, smaller on phones); only transform / opacity animate */
	.ds { --orange: #ef7d22; --blue: #2f7fe6; --brass: #d8b36a; --brass-hi: #f3d896; --ink: #f4efe3; --u: clamp(.5px, calc(100vw / 1150), 1.3px);
		position: fixed; inset: 0; z-index: 90; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: calc(var(--u) * 22); pointer-events: none; overflow: hidden; color: var(--ink); }
	.dim { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(3, 9, 18, .8), rgba(3, 9, 18, .94)); animation: dim 4.2s ease both; }
	@keyframes dim { 0% { opacity: 0; } 8%, 86% { opacity: 1; } 100% { opacity: 0; } }
	.emb { width: 100%; height: 100%; overflow: visible; }
	.emb rect, .emb path, .emb circle { fill: none; stroke: var(--brass-hi); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
	.emb .lit { fill: rgba(243, 216, 150, .22); }
	.emb .pip { fill: var(--brass-hi); stroke: none; }
	.emb .ban { stroke: #ff5a5f; stroke-width: 6; }
	.kick { font-size: calc(var(--u) * 16); letter-spacing: .32em; text-transform: uppercase; color: var(--brass); }
	.ttl { font-size: calc(var(--u) * 92); line-height: .95; letter-spacing: .05em; text-transform: uppercase; color: #fff; text-shadow: 0 calc(var(--u) * 4) calc(var(--u) * 18) rgba(0, 0, 0, .7); white-space: nowrap; }
	.chips { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: calc(var(--u) * 10); max-width: 92vw; }
	.chip { padding: calc(var(--u) * 7) calc(var(--u) * 16); border-radius: 999px; font-size: calc(var(--u) * 18); letter-spacing: .06em; color: var(--brass-hi);
		background: rgba(8, 22, 38, .92); border: 1px solid rgba(216, 179, 106, .55); white-space: nowrap; animation: chipin 4.2s cubic-bezier(.2, .9, .2, 1) both; animation-delay: calc(.95s + var(--i) * .14s); }
	@keyframes chipin { 0% { opacity: 0; transform: translateY(calc(var(--u) * 14)) scale(.9); } 8%, 80% { opacity: 1; transform: none; } 92%, 100% { opacity: 0; transform: translateY(calc(var(--u) * -6)); } }

	/* ── A · Herald: a band slams across, the mode name and its cry; team light at either end ── */
	.band { position: relative; width: 100%; height: calc(var(--u) * 210); display: grid; place-items: center;
		background: linear-gradient(180deg, rgba(10, 30, 52, .97), rgba(5, 16, 30, .97)); border-top: 2px solid var(--brass); border-bottom: 2px solid var(--brass);
		box-shadow: 0 0 calc(var(--u) * 40) rgba(0, 0, 0, .7); animation: band 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	@keyframes band { 0% { transform: scaleY(0); opacity: 0; } 7% { transform: scaleY(1.12); opacity: 1; } 11%, 84% { transform: scaleY(1); opacity: 1; } 94%, 100% { transform: scaleY(0); opacity: 0; } }
	.bl, .br { position: absolute; top: 0; bottom: 0; width: 38%; }
	.bl { left: 0; background: linear-gradient(90deg, var(--l), transparent); opacity: .35; }
	.br { right: 0; background: linear-gradient(270deg, var(--r), transparent); opacity: .35; }
	.blade { position: absolute; left: 0; top: 50%; width: 100%; height: calc(var(--u) * 3); margin-top: calc(var(--u) * -1.5); background: linear-gradient(90deg, transparent, #fff 45%, #fff 55%, transparent);
		transform-origin: 0 50%; animation: blade 4.2s ease-out both; }
	@keyframes blade { 0%, 6% { transform: scaleX(0); opacity: 0; } 9% { opacity: 1; } 16% { transform: scaleX(1); opacity: 0; } 100% { transform: scaleX(1); opacity: 0; } }
	.hrow { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 30); }
	.hex { width: calc(var(--u) * 140); height: calc(var(--u) * 140); padding: calc(var(--u) * 22); box-sizing: border-box; clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%);
		background: radial-gradient(circle at 50% 35%, #1d3a5c, #08182c); animation: hexin 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	@keyframes hexin { 0%, 8% { opacity: 0; transform: scale(.4) rotate(-30deg); } 16% { opacity: 1; transform: scale(1.08) rotate(4deg); } 20%, 86% { opacity: 1; transform: none; } 94%, 100% { opacity: 0; transform: scale(.8); } }
	.htx { display: flex; flex-direction: column; gap: calc(var(--u) * 6); }
	.herald .ttl { animation: ttlin 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	@keyframes ttlin { 0%, 9% { opacity: 0; transform: translateX(calc(var(--u) * 80)) skewX(-12deg); } 16% { opacity: 1; transform: translateX(calc(var(--u) * -6)) skewX(0); } 20%, 86% { opacity: 1; transform: none; } 94%, 100% { opacity: 0; transform: translateX(calc(var(--u) * -40)); } }
	.cry { font-size: calc(var(--u) * 24); color: var(--brass-hi); letter-spacing: .04em; animation: fade 4.2s ease both; animation-delay: .1s; }
	.herald .kick { animation: fade 4.2s ease both; }
	@keyframes fade { 0%, 14% { opacity: 0; } 22%, 84% { opacity: 1; } 94%, 100% { opacity: 0; } }

	/* ── B · Seal: the coins slide in, a crest stamps down between them, a ribbon unrolls under it ── */
	.sealbox { position: relative; width: calc(var(--u) * 260); height: calc(var(--u) * 260); display: grid; place-items: center; }
	.coin { position: absolute; top: 50%; width: calc(var(--u) * 76); height: calc(var(--u) * 76); margin-top: calc(var(--u) * -38); }
	.coin.cl { left: calc(var(--u) * -150); animation: cl 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	.coin.cr { right: calc(var(--u) * -150); animation: cr 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	@keyframes cl { 0% { opacity: 0; transform: translateX(-50vw) rotate(-360deg); } 14%, 86% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateX(calc(var(--u) * -60)); } }
	@keyframes cr { 0% { opacity: 0; transform: translateX(50vw) rotate(360deg); } 14%, 86% { opacity: 1; transform: none; } 96%, 100% { opacity: 0; transform: translateX(calc(var(--u) * 60)); } }
	.runes { position: absolute; inset: 0; animation: runes 4.2s linear both; }
	.runes svg { width: 100%; height: 100%; }
	.runes circle, .runes path { fill: none; stroke: var(--brass); stroke-width: 1.4; }
	.runes .thin { stroke-width: .7; stroke-dasharray: 2 4; }
	.runes .long { stroke-width: 2.4; }
	@keyframes runes { 0%, 14% { opacity: 0; transform: rotate(-40deg) scale(.9); } 22% { opacity: .9; } 86% { opacity: .9; transform: rotate(30deg) scale(1); } 100% { opacity: 0; transform: rotate(40deg) scale(1.05); } }
	.crest { position: relative; width: calc(var(--u) * 170); height: calc(var(--u) * 170); display: grid; place-items: center; animation: stamp 4.2s cubic-bezier(.3, 1.4, .5, 1) both; }
	.crest .hexbg { position: absolute; inset: 0; width: 100%; height: 100%; }
	.hexbg path { fill: #0b2440; stroke: var(--brass); stroke-width: 2.5; }
	.hexbg .in { fill: #10304f; stroke: rgba(243, 216, 150, .45); stroke-width: 1; }
	.crest .emb { position: relative; width: 58%; height: 58%; }
	@keyframes stamp { 0%, 9% { opacity: 0; transform: scale(2.2); } 16% { opacity: 1; transform: scale(.94); } 20%, 86% { opacity: 1; transform: none; } 95%, 100% { opacity: 0; transform: scale(.7); } }
	.shock { position: absolute; width: calc(var(--u) * 180); height: calc(var(--u) * 180); border-radius: 50%; background: radial-gradient(circle, transparent 55%, rgba(243, 216, 150, .8) 62%, transparent 70%); animation: shock 4.2s ease-out both; }
	@keyframes shock { 0%, 15% { opacity: 0; transform: scale(.6); } 16% { opacity: 1; } 30%, 100% { opacity: 0; transform: scale(2.2); } }
	.ribbon { position: relative; display: flex; align-items: center; animation: unroll 4.2s cubic-bezier(.2, .9, .2, 1) both; }
	@keyframes unroll { 0%, 18% { opacity: 0; transform: scaleX(0); } 26% { opacity: 1; transform: scaleX(1.04); } 30%, 86% { opacity: 1; transform: none; } 95%, 100% { opacity: 0; transform: scaleX(.6); } }
	.rbody { position: relative; z-index: 1; padding: calc(var(--u) * 10) calc(var(--u) * 46); font-size: calc(var(--u) * 54); letter-spacing: .08em; text-transform: uppercase; color: #1b1206;
		background: linear-gradient(180deg, #f6dfa3, #c79a4c); box-shadow: 0 calc(var(--u) * 6) calc(var(--u) * 16) rgba(0, 0, 0, .55); white-space: nowrap; }
	.rtail { width: calc(var(--u) * 40); height: calc(var(--u) * 54); background: #a87e38; }
	.rtail.l { margin-right: calc(var(--u) * -14); clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 35% 50%); transform: translateY(calc(var(--u) * 12)); }
	.rtail.r { margin-left: calc(var(--u) * -14); clip-path: polygon(0 0, 100% 0, 65% 50%, 100% 100%, 0 100%); transform: translateY(calc(var(--u) * 12)); }
	.scry { position: relative; font-size: calc(var(--u) * 24); color: var(--brass-hi); letter-spacing: .04em; animation: fade 4.2s ease both; animation-delay: .25s; }

	/* ── C · Draft order: the whole sequence as slots in team colours, a light running along them ── */
	.otop { position: relative; display: flex; align-items: center; gap: calc(var(--u) * 20); animation: fade2 4.2s ease both; }
	@keyframes fade2 { 0% { opacity: 0; transform: translateY(calc(var(--u) * -20)); } 8%, 86% { opacity: 1; transform: none; } 95%, 100% { opacity: 0; } }
	.ohex { width: calc(var(--u) * 84); height: calc(var(--u) * 84); padding: calc(var(--u) * 13); box-sizing: border-box; clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); background: radial-gradient(circle at 50% 35%, #1d3a5c, #08182c); }
	.otx { display: flex; flex-direction: column; gap: calc(var(--u) * 2); }
	.order .ttl { font-size: calc(var(--u) * 70); }
	.lane { position: relative; display: flex; align-items: flex-end; gap: calc(var(--u) * 12); padding: calc(var(--u) * 18) calc(var(--u) * 26); border-radius: calc(var(--u) * 16);
		background: rgba(6, 18, 32, .9); border: 1px solid rgba(216, 179, 106, .4); overflow: hidden; animation: fade2 4.2s ease both; }
	.lane.flat { gap: calc(var(--u) * 46); align-items: flex-start; }
	.slot { --tc: var(--orange); position: relative; display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 6); animation: slot 4.2s cubic-bezier(.2, .9, .2, 1) both; animation-delay: calc(.35s + var(--i) * .16s); }
	.slot.t-blue { --tc: var(--blue); }
	.sface { width: calc(var(--u) * 64); height: calc(var(--u) * 74); display: grid; place-items: center; font-size: calc(var(--u) * 34); color: #fff;
		clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); background: linear-gradient(180deg, var(--tc), color-mix(in srgb, var(--tc) 45%, #050d18)); }
	.slot.ban .sface { background: linear-gradient(180deg, #5a1418 0%, #210709 70%, var(--tc) 71%, var(--tc) 100%); }
	.slot.ban .sface svg { width: 55%; height: 55%; fill: none; stroke: #ff6b70; stroke-width: 2.4; stroke-linecap: round; }
	.slab { font-size: calc(var(--u) * 15); letter-spacing: .14em; text-transform: uppercase; color: color-mix(in srgb, var(--tc) 55%, #fff); }
	.slot.ban .sface { box-shadow: none; outline: none; }
	.slot.ban .sface svg { filter: none; }
	@keyframes slot { 0% { opacity: 0; transform: translateY(calc(var(--u) * 30)) scale(.6); } 6% { opacity: 1; transform: translateY(calc(var(--u) * -6)) scale(1.06); } 9%, 80% { opacity: 1; transform: none; } 90%, 100% { opacity: 0; transform: translateY(calc(var(--u) * 10)); } }
	.gap { width: 2px; align-self: stretch; margin: 0 calc(var(--u) * 6); background: linear-gradient(180deg, transparent, var(--brass), transparent); }
	.sweep { position: absolute; top: 0; bottom: 0; left: 0; width: 22%; background: linear-gradient(90deg, transparent, rgba(255, 244, 214, .18), transparent); animation: sweep 4.2s ease-in-out both; animation-delay: .9s; }
	@keyframes sweep { 0% { transform: translateX(-100%); opacity: 0; } 4% { opacity: 1; } 40% { transform: translateX(480%); opacity: 1; } 44%, 100% { transform: translateX(480%); opacity: 0; } }
	.side { display: flex; flex-direction: column; align-items: center; gap: calc(var(--u) * 10); }
	.sname { font-size: calc(var(--u) * 18); letter-spacing: .14em; text-transform: uppercase; color: color-mix(in srgb, var(--tc, #fff) 55%, #fff); }
	.side.t-orange { --tc: var(--orange); }
	.side.t-blue { --tc: var(--blue); }
	.srow { display: flex; gap: calc(var(--u) * 10); }
	.legend { position: relative; display: flex; gap: calc(var(--u) * 22); font-size: calc(var(--u) * 16); letter-spacing: .06em; animation: fade 4.2s ease both; }
	.lg { display: flex; align-items: center; gap: calc(var(--u) * 7); color: #cdd8e4; }
	.lg::before { content: ''; width: calc(var(--u) * 12); height: calc(var(--u) * 12); border-radius: 50%; background: var(--orange); }
	.lg.t-blue::before { background: var(--blue); }

	/* phones: everything a size down, the order lane may wrap */
	.ph .ttl { font-size: min(calc(var(--u) * 110), 11vw); }
	.ph.order .ttl { font-size: min(calc(var(--u) * 84), 9vw); }
	.ph .band { height: calc(var(--u) * 420); }
	.ph .hrow { flex-direction: column; gap: calc(var(--u) * 14); }
	.ph .htx { align-items: center; text-align: center; }
	.ph .hex { width: calc(var(--u) * 150); height: calc(var(--u) * 150); }
	.ph .chip { font-size: calc(var(--u) * 26); }
	.ph .cry, .ph .scry { font-size: calc(var(--u) * 30); }
	.ph .lane { flex-wrap: wrap; justify-content: center; max-width: 94vw; }
	.ph .rbody { font-size: calc(var(--u) * 66); }
	.ph .coin.cl { left: calc(var(--u) * -110); }
	.ph .coin.cr { right: calc(var(--u) * -110); }
</style>
