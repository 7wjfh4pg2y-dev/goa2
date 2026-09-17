<script lang="ts">
	// Renders one real Guards of Atlantis II ability card to a canvas, using the
	// ported card-painter engine + the game's own frame art. High-fidelity: this
	// is the same pipeline the old encyclopedia used.
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { Color, Item, Modifier, Type, ValueSign } from './states';
	import { images, importCardImage, preloadImages, updateCanvas } from './card_painter';
	import { backgroundSlug, heroStat, type HeroCardJson } from './deck';

	export let heroId: string;
	export let card: HeroCardJson;
	export let extraSlotIndex: number | null = null;
	export let showNumbers = true;

	const cardArt = import.meta.glob('./images/cards/*/*.webp', { eager: true, import: 'default' }) as Record<string, string>;

	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let bg: HTMLImageElement | null = null;
	let ready = false;

	async function crop(image: HTMLImageElement): Promise<HTMLImageElement> {
		const sw = Math.min(744, image.width), sh = Math.min(1039, image.height);
		const sx = (image.width - sw) / 2, sy = (image.height - sh) / 2;
		const cv = document.createElement('canvas');
		cv.width = sw; cv.height = sh;
		const c = cv.getContext('2d');
		if (!c) return image;
		c.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
		const out = new Image();
		out.src = cv.toDataURL();
		return new Promise((res) => { out.onload = () => res(out); out.onerror = () => res(image); });
	}

	async function loadBg(): Promise<HTMLImageElement | null> {
		const slug = backgroundSlug(card, extraSlotIndex);
		const suffix = `/cards/${heroId}/${slug}.webp`;
		const url = Object.entries(cardArt).find(([k]) => k.endsWith(suffix))?.[1];
		if (typeof url === 'string') {
			const raw = new Image(); raw.src = url;
			const ok = await new Promise<boolean>((r) => { raw.onload = () => r(true); raw.onerror = () => r(false); });
			if (ok) return crop(raw);
		}
		await importCardImage(heroId, slug);
		const fb = images.get(slug);
		return fb instanceof HTMLImageElement ? crop(fb) : null;
	}

	function paint() {
		if (!canvas || !ctx || !bg) return;
		updateCanvas(
			canvas, ctx, [], bg,
			(card.color as Color) ?? Color.GOLD,
			card.handicapped ?? false, card.extra ?? false,
			card.name ?? '', card.description ?? '',
			'i'.repeat(card.level ?? 1),
			(card.item as Item) ?? Item.ATTACK,
			card.initiative ?? 0,
			(card.primaryAction as Type) ?? Type.ATTACK,
			card.primaryValue ?? 0,
			(card.primaryValueSign as ValueSign) ?? ValueSign.NONE,
			(card.modifier as Modifier) ?? Modifier.NONE,
			card.modifierValue ?? 0,
			(card.modifierValueSign as ValueSign) ?? ValueSign.NONE,
			card.secondaryMovement ?? 0,
			card.secondaryDefense ?? 0,
			card.secondaryAttack ?? null,
			0, 0, 0, 0, 0, 0,
			showNumbers,
			heroStat(heroId, 0), heroStat(heroId, 1), heroStat(heroId, 2), heroStat(heroId, 3)
		);
	}

	onMount(async () => {
		if (!browser) return;
		await Promise.all([preloadImages(), document.fonts.load('16px "Modesto Poster"'), document.fonts.ready]);
		ctx = canvas.getContext('2d');
		bg = await loadBg();
		ready = true;
		paint();
	});

	$: if (ready && ctx && bg) { void showNumbers; void card; paint(); }
</script>

<div class="card">
	<canvas bind:this={canvas} width="1192" height="1664"></canvas>
</div>

<style>
	.card { width: 100%; aspect-ratio: 1192 / 1664; }
	canvas { width: 100%; height: 100%; display: block; border-radius: 4%; }
</style>
