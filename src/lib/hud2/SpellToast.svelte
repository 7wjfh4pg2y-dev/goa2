<script lang="ts">
	// Gydion casting, for everyone (GameView plays each gyNews once; Effects → Spells switches it off): a toast under the
	// top bar — the printed spell card tilted in, the school's symbol faint behind, "Gydion casts / Fireball / Evocation ·
	// Attack 5 · Range 3", in the school's colour. Prepare Spells and Wish get their own lines. ~3 s, transform / opacity.
	import { spellOf, schoolIcon, SCHOOL_COLOR } from '$lib/cards/spells'
	import { heroLogo } from '$lib/heroes'

	export let phone = false
	const COL: Record<string, string> = { gold: '#e0b440', red: '#ff6a5e', green: '#55d071', blue: '#6a9cff', purple: '#b98cf5', silver: '#dfe6ee' }
	let shown: { key: number; spell: string; title: string; line: string; color: string; art: string; sym: string } | null = null
	let timer: ReturnType<typeof setTimeout> | null = null
	/** spell = a spell id, 'prepare' or 'wish' (with the Wish count); line = the numbers */
	export function play(spell: string, line = '', wish = 0) {
		const sp = spellOf(spell === 'prepare' ? '' : spell)
		const school = sp?.school.toLowerCase() ?? ''
		const color = spell === 'prepare' ? COL.silver : COL[SCHOOL_COLOR[school]] ?? COL.gold
		shown = {
			key: Date.now(), spell, color,
			title: spell === 'prepare' ? 'Prepare Spells' : sp?.name ?? spell,
			line: spell === 'prepare' ? 'Every spell is back in the book' : spell === 'wish' ? `Wish ${wish} of 3${wish >= 3 ? ' — his team wins!' : ''}` : [school && school[0].toUpperCase() + school.slice(1), line].filter(Boolean).join(' · '),
			art: sp?.art ?? '', sym: spell === 'prepare' ? heroLogo('gydion') : schoolIcon(school)
		}
		if (timer) clearTimeout(timer)
		timer = setTimeout(() => (shown = null), 3200)
	}
</script>

{#if shown}
	{#key shown.key}
		<div class="st" class:ph={phone} style="--c:{shown.color}" role="status">
			{#if shown.art}<span class="card" style="background-image:url({shown.art})"></span>{:else}<span class="sig"><img src={shown.sym} alt="" /></span>{/if}
			<span class="txt"><em>Gydion {shown.spell === 'prepare' ? 'prepares' : 'casts'}</em><b>{shown.title}</b><small>{shown.line}</small></span>
			<span class="ghost" style="--m:url({shown.sym})"></span>
		</div>
	{/key}
{/if}

<style>
	.st { position: fixed; left: 50%; top: calc(86px * var(--uis, 1)); z-index: 58; width: 460px; max-width: 92vw; display: flex; align-items: center; gap: 14px; padding: 10px 16px 10px 10px; pointer-events: none; overflow: hidden;
		border-radius: 14px; background: linear-gradient(100deg, rgba(14, 10, 24, 0.97), rgba(10, 24, 40, 0.97) 60%); border: 1px solid var(--c); box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55), inset 0 0 22px -10px var(--c);
		transform: translateX(-50%); animation: stin 3.2s ease both; font-family: system-ui, sans-serif; }
	.st.ph { top: 64px; width: 340px; padding: 8px 12px 8px 8px; gap: 10px; }
	@keyframes stin { 0% { opacity: 0; transform: translate(-50%, -14px) scale(0.96); } 10% { opacity: 1; transform: translate(-50%, 0) scale(1); } 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -8px); } }
	.card { flex: none; width: 150px; aspect-ratio: 1192 / 831; border-radius: 7px; background: #000 center/cover; transform: rotate(-3deg); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6); animation: stcard 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.3) both; }
	.ph .card { width: 104px; }
	@keyframes stcard { from { transform: rotate(-14deg) translateX(-30px); opacity: 0; } to { transform: rotate(-3deg); opacity: 1; } }
	.sig { flex: none; width: 70px; height: 70px; display: grid; place-items: center; }
	.sig img { width: 100%; height: 100%; object-fit: contain; }
	.txt { display: flex; flex-direction: column; min-width: 0; z-index: 1; }
	.txt em { font: 700 10.5px system-ui; letter-spacing: 0.16em; text-transform: uppercase; color: var(--c); font-style: normal; }
	.txt b { font-size: 22px; line-height: 1.15; color: #fff; letter-spacing: 0.02em; }
	.ph .txt b { font-size: 17px; }
	.txt small { font-size: 12.5px; color: #bccbd9; }
	.ghost { position: absolute; right: -14px; bottom: -20px; width: 110px; height: 110px; background: var(--c); opacity: 0.12; -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; }
</style>
