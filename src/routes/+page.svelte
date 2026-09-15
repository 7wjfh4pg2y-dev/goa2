<script lang="ts">
	import logoImage from '$lib/images/goa-logo.png';
	import { role, tryAdmin, enterAsPlayer, signOut } from '$lib/role';
	import { cubicOut } from 'svelte/easing';

	// sleek cross-fade: fade + subtle lift, scale and de-blur
	function reveal(_node: Element, { duration = 300 } = {}) {
		return {
			duration,
			easing: cubicOut,
			css: (t: number, u: number) =>
				`opacity:${t}; transform: translateY(${u * 14}px) scale(${0.97 + 0.03 * t}); filter: blur(${u * 7}px);`
		};
	}

	let step: 'choose' | 'admin' = 'choose';
	let pw = '';
	let error = false;
	let busy = false;

	async function submitAdmin() {
		busy = true;
		error = false;
		const ok = await tryAdmin(pw);
		busy = false;
		if (!ok) {
			error = true;
			pw = '';
		}
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAdmin();
	}
	function backToChoose() {
		step = 'choose';
		pw = '';
		error = false;
	}
</script>

<svelte:head><title>Guards of Atlantis II</title></svelte:head>

<main class="wrap">
	<img class="logo" src={logoImage} alt="Guards of Atlantis II" />

	<div class="panel">
		{#if $role}
			<div class="step" transition:reveal>
				<div class="card solo">
					<p class="hub">You're in as <b class:isadmin={$role === 'admin'}>{$role === 'admin' ? 'Admin' : 'Player'}</b>.</p>
					<p class="s">More coming soon.</p>
					<button class="ghost" on:click={signOut}>Sign out</button>
				</div>
			</div>
		{:else if step === 'choose'}
			<div class="step" transition:reveal>
				<div class="cards">
					<button class="card p" on:click={enterAsPlayer}>
						<span class="ic">
							<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#7dd3fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
						</span>
						<span class="t">Player</span>
						<span class="s">Join or create a match</span>
					</button>
					<button class="card a" on:click={() => (step = 'admin')}>
						<span class="ic">
							<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<g transform="rotate(45 12 12)"><path d="M12 20.5 V10.5" /><path d="M8.7 5.4 a3.4 3.4 0 1 0 6.6 0 l-2.1 2.1 h-2.4 l-2.1 -2.1 z" /></g>
							</svg>
						</span>
						<span class="t">Admin</span>
						<span class="s">GM tools</span>
					</button>
				</div>
			</div>
		{:else}
			<div class="step" transition:reveal>
				<div class="card solo">
					<input class="field" type="password" placeholder="Password" bind:value={pw} on:keydown={onKey} autocomplete="off" />
					{#if error}<p class="err">Incorrect password.</p>{/if}
					<div class="row">
						<button class="ghost" on:click={backToChoose}>← Back</button>
						<button class="primary" on:click={submitAdmin} disabled={busy || !pw}>{busy ? 'Checking…' : 'Unlock'}</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</main>

<style>
	.wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 34px; padding: 24px; color: #f1f5f9; }
	.logo { width: min(300px, 62vw); filter: drop-shadow(0 12px 34px rgba(0, 0, 0, 0.55)); }

	/* fixed-height stage so swapping steps never moves the logo */
	.panel { position: relative; width: 100%; max-width: 480px; min-height: 240px; }
	.step { position: absolute; inset: 0; display: flex; align-items: flex-start; justify-content: center; will-change: opacity, transform, filter; }

	.cards { display: flex; gap: 22px; flex-wrap: wrap; justify-content: center; }
	.card {
		width: 210px; padding: 30px 22px; border-radius: 18px;
		background: rgba(12, 18, 32, 0.42); backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.14);
		display: flex; flex-direction: column; align-items: center; gap: 12px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35); cursor: pointer; color: inherit;
		transition: transform 0.15s, background 0.15s;
	}
	.card:hover { transform: translateY(-4px); background: rgba(20, 28, 46, 0.6); }
	.card.p { border-bottom: 3px solid #38bdf8; }
	.card.a { border-bottom: 3px solid #f97316; }
	.card.solo { width: min(340px, 88vw); cursor: default; }
	.card.solo:hover { transform: none; background: rgba(12, 18, 32, 0.42); }
	.ic { width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
	.t { font-size: 1.5rem; font-weight: 700; }
	.s { font-size: 0.8rem; color: #cbd5e1; }
	.hub { font-size: 1.1rem; margin: 0; }
	.hub b { color: #7dd3fc; }
	.hub b.isadmin { color: #fdba74; }

	.field { width: 100%; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(8, 12, 22, 0.6); padding: 0.6rem 0.7rem; color: white; }
	.err { color: #fca5a5; font-size: 0.82rem; margin: 0; }
	.row { display: flex; justify-content: space-between; gap: 10px; width: 100%; }
	.primary { border: 1px solid #f59e0b; background: #d97706; color: white; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); color: #e5e7eb; border-radius: 10px; padding: 0.55rem 1.1rem; cursor: pointer; }
</style>
