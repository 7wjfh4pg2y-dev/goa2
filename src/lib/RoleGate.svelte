<script lang="ts">
	import { tryAdmin, enterAsPlayer } from '$lib/role'
	import logoImage from '$lib/images/goa-logo.png'

	let step: 'choose' | 'admin' = 'choose'
	let pw = ''
	let error = false
	let busy = false

	async function submitAdmin() {
		busy = true
		error = false
		const ok = await tryAdmin(pw)
		busy = false
		if (!ok) {
			error = true
			pw = ''
		}
		// on success the role store flips and the layout swaps to the app
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAdmin()
	}
</script>

<div class="gate">
	<div class="card">
		<div class="brand">
			<img src={logoImage} alt="Guards of Atlantis II" class="logo" />
		</div>

		{#if step === 'choose'}
			<h1>Who's playing?</h1>
			<div class="opts">
				<button class="opt player" on:click={enterAsPlayer}>
					<span class="big">Player</span>
				</button>
				<button class="opt admin" on:click={() => (step = 'admin')}>
					<span class="big">Admin</span>
				</button>
			</div>
		{:else}
			<h1>Admin access</h1>
			<p class="sub">Enter the GM password.</p>
			<input
				class="field"
				type="password"
				placeholder="Password"
				bind:value={pw}
				on:keydown={onKey}
				autocomplete="off"
			/>
			{#if error}<p class="err">Incorrect password.</p>{/if}
			<div class="row">
				<button class="ghost" on:click={() => (step = 'choose')}>← Back</button>
				<button class="primary" on:click={submitAdmin} disabled={busy || !pw}>
					{busy ? 'Checking…' : 'Unlock'}
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.gate {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		background: radial-gradient(circle at 50% 30%, #16233b, #0b1220 75%);
		color: #e5e7eb;
		z-index: 100;
	}
	.card {
		width: 100%;
		max-width: 420px;
		background: rgba(15, 21, 34, 0.95);
		border: 1px solid #374151;
		border-radius: 14px;
		padding: 28px 24px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
		text-align: center;
	}
	.brand { display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
	.logo { height: 120px; width: auto; }
	h1 { margin: 0 0 4px; font-size: 1.4rem; }
	.sub { margin: 0 0 18px; color: #9ca3af; font-size: 0.9rem; }
	.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.opt {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 26px 12px;
		border-radius: 10px;
		border: 1px solid #374151;
		background: #1f2937;
		color: #e5e7eb;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}
	.opt:hover { background: #263244; }
	.opt.player:hover { border-color: #22c55e; }
	.opt.admin:hover { border-color: #f59e0b; }
	.big { font-size: 1.2rem; font-weight: 700; }
	.field {
		width: 100%;
		border-radius: 8px;
		border: 1px solid #4b5563;
		background: #111827;
		padding: 0.6rem 0.7rem;
		color: white;
		margin-bottom: 8px;
	}
	.err { color: #fca5a5; font-size: 0.82rem; margin: 0 0 10px; }
	.row { display: flex; justify-content: space-between; gap: 10px; margin-top: 6px; }
	.primary {
		border: 1px solid #f59e0b;
		background: #d97706;
		color: white;
		border-radius: 8px;
		padding: 0.55rem 1.1rem;
		cursor: pointer;
	}
	.primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.ghost {
		border: 1px solid #4b5563;
		background: #1f2937;
		color: #e5e7eb;
		border-radius: 8px;
		padding: 0.55rem 1.1rem;
		cursor: pointer;
	}
</style>
