<script lang="ts">
	// One real Guards of Atlantis II ability card. The face is painted once per card
	// into a full-resolution master (render.ts); this component just copies that
	// master into its own canvas at the size it's actually shown (with headroom for
	// hover zoom), so it's sharp, uncompressed and costs ~1 ms per mount.
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { cardMaster, cardKey, CARD_W, CARD_H, type Master } from './render';
	import type { HeroCardJson } from './deck';

	export let heroId: string;
	export let card: HeroCardJson;
	export let extraSlotIndex: number | null = null;
	export let showNumbers = true;

	let canvas: HTMLCanvasElement;
	let master: Master | null = null;
	let loading = '';
	let drawn = ''; // `${key}@${width}` last drawn, so resizes don't redraw needlessly
	$: key = card ? cardKey(heroId, card, extraSlotIndex, showNumbers) : '';
	// keep showing the previous face until the new one is ready (no blank flash when swiping)
	$: if (browser && card && key && key !== loading) load(key, heroId, card, extraSlotIndex, showNumbers);
	async function load(k: string, h: string, c: HeroCardJson, x: number | null, n: boolean) {
		loading = k;
		try {
			const m = await cardMaster(h, c, x, n);
			if (k !== key) return;
			master = m;
			draw();
		} catch { loading = ''; /* painted next time it's asked for */ }
	}

	function draw() {
		if (!canvas || !master) return;
		// on-screen size (transforms/zoom included), with room for hover zoom
		const css = Math.max(canvas.getBoundingClientRect().width, canvas.clientWidth);
		if (!css) return; // hidden: the ResizeObserver draws it once it shows
		const w = Math.min(CARD_W, Math.max(96, Math.ceil(css * (window.devicePixelRatio || 1) * 2)));
		const tag = `${key}@${w}`;
		if (tag === drawn) return;
		const h = Math.round((w * CARD_H) / CARD_W);
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = 'high';
		ctx.clearRect(0, 0, w, h);
		ctx.drawImage(master, 0, 0, w, h);
		drawn = tag;
	}

	let ro: ResizeObserver | null = null;
	const onWin = () => draw();
	onMount(() => {
		if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => draw()); ro.observe(canvas); }
		window.addEventListener('resize', onWin); // scaled containers (deck view) change size without a layout resize
		draw();
	});
	onDestroy(() => { ro?.disconnect(); if (browser) window.removeEventListener('resize', onWin); });
</script>

<div class="card">
	<canvas bind:this={canvas} class="cardface" width="1" height="1"></canvas>
</div>

<style>
	.card { width: 100%; aspect-ratio: 1192 / 1664; }
	.cardface { width: 100%; height: 100%; display: block; border-radius: 4%; }
</style>
