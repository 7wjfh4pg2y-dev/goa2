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
	let tries = 0, retryT: ReturnType<typeof setTimeout> | null = null;
	async function load(k: string, h: string, c: HeroCardJson, x: number | null, n: boolean) {
		loading = k;
		try {
			const m = await cardMaster(h, c, x, n);
			if (k !== key) return;
			master = m;
			drawn = '';
			draw();
			tries = 0;
		} catch {
			// the paint failed (on a phone usually out of canvas memory): try again a little later, with a pause
			// (`loading` stays on this key, so the reactive line above doesn't retry it at once in a tight loop)
			if (retryT) clearTimeout(retryT);
			if (tries++ < 6) retryT = setTimeout(() => { if (card && key === k && !destroyed) load(k, h, c, x, n); }, 800 * tries);
		}
	}
	// the tab came back from the background: the master may have been painted again, the canvas cleared
	let destroyed = false;
	function revive() { drawn = ''; tries = 0; if (card && key) load(key, heroId, card, extraSlotIndex, showNumbers); }

	function draw() {
		if (!canvas || !master) return;
		// on-screen size (transforms/zoom included), with room for hover zoom
		const css = Math.max(canvas.getBoundingClientRect().width, canvas.clientWidth);
		if (!css) return; // hidden: the ResizeObserver draws it once it shows
		const w = Math.min(master.width || CARD_W, Math.max(96, Math.ceil(css * (window.devicePixelRatio || 1) * 2)));
		const tag = `${key}@${w}`;
		if (tag === drawn) return;
		const h = Math.round((w * CARD_H) / CARD_W);
		if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
		const ctx = canvas.getContext('2d');
		if (!ctx) { drawn = ''; return; }
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
		window.addEventListener('goa2-cards-redraw', revive);
		canvas.addEventListener('contextrestored', revive); // a 2D context the browser took away and gave back
		draw();
	});
	onDestroy(() => {
		destroyed = true;
		ro?.disconnect();
		if (retryT) clearTimeout(retryT);
		if (browser) { window.removeEventListener('resize', onWin); window.removeEventListener('goa2-cards-redraw', revive); }
	});
</script>

<div class="card">
	<canvas bind:this={canvas} class="cardface" width="1" height="1"></canvas>
</div>

<style>
	.card { width: 100%; aspect-ratio: 1192 / 1664; }
	.cardface { width: 100%; height: 100%; display: block; border-radius: 4%; }
</style>
