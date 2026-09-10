<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { supabase } from '$lib/supabase'
	import type { RealtimeChannel } from '@supabase/supabase-js'

	// --- Local identity for this browser tab ---
	const clientId = Math.random().toString(36).slice(2, 10)
	const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899']
	const myColor = colors[Math.floor(Math.random() * colors.length)]

	let room = 'lobby'
	let shareUrl = ''
	let status: 'connecting' | 'connected' | 'error' = 'connecting'
	let peerCount = 1

	// Normalized positions (0..1) so different window sizes agree.
	let me = { x: 0.5, y: 0.5 }
	// Other participants' cursors, keyed by their clientId.
	let others: Record<string, { x: number; y: number; color: string }> = {}

	let arena: HTMLDivElement
	let channel: RealtimeChannel | undefined
	let dragging = false
	let lastSent = 0

	function sendMove() {
		const now = performance.now()
		if (now - lastSent < 33) return // ~30/sec cap
		lastSent = now
		channel?.send({
			type: 'broadcast',
			event: 'move',
			payload: { id: clientId, x: me.x, y: me.y, color: myColor },
		})
	}

	function pointerToNorm(e: PointerEvent) {
		const r = arena.getBoundingClientRect()
		me = {
			x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
			y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
		}
		sendMove()
	}

	function onDown(e: PointerEvent) {
		dragging = true
		arena.setPointerCapture(e.pointerId)
		pointerToNorm(e)
	}
	function onMove(e: PointerEvent) {
		if (dragging) pointerToNorm(e)
	}
	function onUp(e: PointerEvent) {
		dragging = false
		try { arena.releasePointerCapture(e.pointerId) } catch {}
	}

	onMount(() => {
		const params = new URLSearchParams(window.location.search)
		room = params.get('room') || 'lobby'
		shareUrl = window.location.origin + window.location.pathname + '?room=' + room

		channel = supabase.channel('goa2-play:' + room, {
			config: { broadcast: { self: false }, presence: { key: clientId } },
		})

		channel
			.on('broadcast', { event: 'move' }, ({ payload }) => {
				const p = payload as { id: string; x: number; y: number; color: string }
				if (p.id === clientId) return
				others[p.id] = { x: p.x, y: p.y, color: p.color }
				others = others
			})
			.on('presence', { event: 'sync' }, () => {
				const state = channel!.presenceState()
				const ids = new Set(Object.keys(state))
				peerCount = ids.size
				// Drop cursors for anyone who has left.
				for (const id of Object.keys(others)) {
					if (!ids.has(id)) delete others[id]
				}
				others = others
			})
			.subscribe(async (s) => {
				if (s === 'SUBSCRIBED') {
					status = 'connected'
					await channel!.track({ color: myColor })
				} else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
					status = 'error'
				}
			})
	})

	onDestroy(() => {
		if (channel) supabase.removeChannel(channel)
	})

	let copied = false
	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl)
			copied = true
			setTimeout(() => (copied = false), 1500)
		} catch {}
	}
</script>

<svelte:head>
	<title>Realtime Test — Guards of Atlantis</title>
</svelte:head>

<div class="wrap">
	<div class="bar">
		<span class="dot-status" class:ok={status === 'connected'} class:err={status === 'error'}></span>
		<strong>
			{#if status === 'connecting'}Connecting…{:else if status === 'connected'}Connected{:else}Connection error{/if}
		</strong>
		<span class="pill">Room: {room}</span>
		<span class="pill">{peerCount} here</span>
		<span class="spacer"></span>
		<button on:click={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
	</div>

	<p class="hint">
		Drag anywhere in the box to move <span style="color:{myColor}">your dot</span>. Open this page in a
		second window (or send the invite link) — the dots move on both screens in real time.
	</p>

	<div
		class="arena"
		bind:this={arena}
		on:pointerdown={onDown}
		on:pointermove={onMove}
		on:pointerup={onUp}
		on:pointercancel={onUp}
	>
		{#each Object.entries(others) as [id, o] (id)}
			<div class="cursor other" style="left:{o.x * 100}%; top:{o.y * 100}%; background:{o.color}"></div>
		{/each}
		<div class="cursor mine" style="left:{me.x * 100}%; top:{me.y * 100}%; background:{myColor}"></div>
	</div>

	<p class="foot">Phase 0 · realtime pipe test · Supabase Broadcast + Presence</p>
</div>

<style>
	.wrap {
		max-width: 900px;
		margin: 0 auto;
		padding: 90px 16px 32px;
		color: #e5e7eb;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.spacer { flex: 1 1 auto; }
	.dot-status {
		width: 10px; height: 10px; border-radius: 50%;
		background: #eab308; display: inline-block;
	}
	.dot-status.ok { background: #22c55e; }
	.dot-status.err { background: #ef4444; }
	.pill {
		font-size: 13px; padding: 2px 10px; border-radius: 999px;
		background: #1f2937; border: 1px solid #374151;
	}
	button {
		font-size: 13px; padding: 6px 12px; border-radius: 8px;
		background: #374151; color: #e5e7eb; border: 1px solid #4b5563; cursor: pointer;
	}
	button:hover { background: #4b5563; }
	.hint { font-size: 14px; color: #9ca3af; margin: 6px 0 14px; }
	.arena {
		position: relative;
		width: 100%;
		height: 60vh;
		min-height: 340px;
		border: 2px solid #374151;
		border-radius: 14px;
		background:
			radial-gradient(circle at 25px 25px, #1f2937 2px, transparent 0) 0 0 / 50px 50px,
			#0b1220;
		touch-action: none;
		overflow: hidden;
		cursor: crosshair;
	}
	.cursor {
		position: absolute;
		width: 26px; height: 26px; border-radius: 50%;
		transform: translate(-50%, -50%);
		box-shadow: 0 2px 8px rgba(0,0,0,0.5);
		transition: left 0.05s linear, top 0.05s linear;
	}
	.cursor.mine { outline: 3px solid rgba(255,255,255,0.8); z-index: 2; }
	.cursor.other { opacity: 0.9; }
	.foot { font-size: 12px; color: #6b7280; margin-top: 12px; }
</style>
