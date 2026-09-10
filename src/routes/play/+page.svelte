<script lang="ts">
	import { onMount, onDestroy } from 'svelte'
	import { supabase } from '$lib/supabase'
	import type { RealtimeChannel } from '@supabase/supabase-js'

	const clientId = Math.random().toString(36).slice(2, 10)

	let room = 'lobby'
	let shareUrl = ''
	let status: 'connecting' | 'connected' | 'error' = 'connecting'
	let peerCount = 1
	let loaded = false

	// Shared puck. `target` is the latest known logical position (0..1),
	// `render` is what's drawn — eased toward target each animation frame so
	// motion stays smooth between network samples and across browsers.
	let target = { x: 0.5, y: 0.5 }
	let render = { x: 0.5, y: 0.5 }

	let arena: HTMLDivElement
	let puckEl: HTMLDivElement
	let arenaW = 1
	let arenaH = 1
	let ro: ResizeObserver | undefined
	let raf = 0

	let channel: RealtimeChannel | undefined
	let dragging = false
	let lastSent = 0

	function measure() {
		if (!arena) return
		const r = arena.getBoundingClientRect()
		arenaW = r.width
		arenaH = r.height
	}

	function frame() {
		// Follow the cursor 1:1 while *you* drag; ease when receiving remote moves.
		const f = dragging ? 1 : 0.3
		render.x += (target.x - render.x) * f
		render.y += (target.y - render.y) * f
		if (puckEl) {
			const px = render.x * arenaW
			const py = render.y * arenaH
			puckEl.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%)`
		}
		raf = requestAnimationFrame(frame)
	}

	async function persist() {
		await supabase.from('rooms').upsert({
			id: room,
			state: { puck: target },
			updated_at: new Date().toISOString(),
		})
	}

	function broadcastLive() {
		const now = performance.now()
		if (now - lastSent < 33) return
		lastSent = now
		channel?.send({ type: 'broadcast', event: 'puck', payload: { id: clientId, ...target } })
	}

	function pointerToNorm(e: PointerEvent) {
		const r = arena.getBoundingClientRect()
		target = {
			x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
			y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
		}
		broadcastLive()
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
		if (!dragging) return
		dragging = false
		try { arena.releasePointerCapture(e.pointerId) } catch {}
		persist()
	}

	onMount(async () => {
		const params = new URLSearchParams(window.location.search)
		room = params.get('room') || 'lobby'
		shareUrl = window.location.origin + window.location.pathname + '?room=' + room

		measure()
		ro = new ResizeObserver(measure)
		ro.observe(arena)
		raf = requestAnimationFrame(frame)

		// Load persisted state (create the row if this room is new).
		const { data, error } = await supabase.from('rooms').select('state').eq('id', room).maybeSingle()
		if (error) status = 'error'
		if (data?.state?.puck) {
			target = data.state.puck
			render = { ...target } // snap on first load — no animation from center
		} else {
			await persist()
		}
		loaded = true

		channel = supabase.channel('goa2-play:' + room, {
			config: { broadcast: { self: false }, presence: { key: clientId } },
		})

		channel
			.on('broadcast', { event: 'puck' }, ({ payload }) => {
				const p = payload as { id: string; x: number; y: number }
				if (p.id === clientId || dragging) return
				target = { x: p.x, y: p.y }
			})
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + room },
				(payload) => {
					if (dragging) return
					const s = (payload.new as { state?: { puck?: { x: number; y: number } } }).state
					if (s?.puck) target = s.puck
				},
			)
			.on('presence', { event: 'sync' }, () => {
				peerCount = Object.keys(channel!.presenceState()).length
			})
			.subscribe(async (s) => {
				if (s === 'SUBSCRIBED') {
					status = 'connected'
					await channel!.track({ at: Date.now() })
				} else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
					status = 'error'
				}
			})
	})

	onDestroy(() => {
		if (raf) cancelAnimationFrame(raf)
		if (ro) ro.disconnect()
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
		<span class="pill">{loaded ? 'state loaded' : 'loading…'}</span>
		<span class="spacer"></span>
		<button on:click={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
	</div>

	<p class="hint">
		Drag the <span class="chip">★ shared puck</span> around. It moves live on every screen — and its
		position is <strong>saved to the database</strong>: refresh the page (or rejoin later) and it's
		right where you left it.
	</p>

	<div
		class="arena"
		bind:this={arena}
		on:pointerdown={onDown}
		on:pointermove={onMove}
		on:pointerup={onUp}
		on:pointercancel={onUp}
	>
		<div class="puck" bind:this={puckEl}>★</div>
	</div>

	<p class="foot">Phase 1a · persistent shared state · GPU transform + rAF interpolation</p>
</div>

<style>
	.wrap { max-width: 900px; margin: 0 auto; padding: 90px 16px 32px; color: #e5e7eb; }
	.bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
	.spacer { flex: 1 1 auto; }
	.dot-status { width: 10px; height: 10px; border-radius: 50%; background: #eab308; display: inline-block; }
	.dot-status.ok { background: #22c55e; }
	.dot-status.err { background: #ef4444; }
	.pill { font-size: 13px; padding: 2px 10px; border-radius: 999px; background: #1f2937; border: 1px solid #374151; }
	.chip { color: #eab308; font-weight: 600; }
	button { font-size: 13px; padding: 6px 12px; border-radius: 8px; background: #374151; color: #e5e7eb; border: 1px solid #4b5563; cursor: pointer; }
	button:hover { background: #4b5563; }
	.hint { font-size: 14px; color: #9ca3af; margin: 6px 0 14px; }
	.arena {
		position: relative; width: 100%; height: 60vh; min-height: 340px;
		border: 2px solid #374151; border-radius: 14px;
		background: radial-gradient(circle at 25px 25px, #1f2937 2px, transparent 0) 0 0 / 50px 50px, #0b1220;
		touch-action: none; overflow: hidden; cursor: grab;
	}
	.arena:active { cursor: grabbing; }
	.puck {
		position: absolute; top: 0; left: 0;
		width: 44px; height: 44px; border-radius: 50%;
		display: flex; align-items: center; justify-content: center;
		font-size: 22px; color: #1a1200;
		background: radial-gradient(circle at 35% 30%, #fde68a, #f59e0b);
		box-shadow: 0 4px 14px rgba(0,0,0,0.55); outline: 3px solid rgba(255,255,255,0.85);
		will-change: transform;
	}
	.foot { font-size: 12px; color: #6b7280; margin-top: 12px; }
</style>
