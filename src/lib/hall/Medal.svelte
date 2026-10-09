<script lang="ts" context="module">
	let seq = 0;
</script>

<script lang="ts">
	// An award's medal: a pointy-topped hex (the board's hex) in its metal — gold = career, silver = a single game,
	// violet = the extras (the ultimate's purple) — on two ribbon tails, with the award's icon in the middle. Locked
	// (nobody holds it yet) = dull iron and a padlock.
	import Glyph, { type GlyphName } from './Glyph.svelte';
	export let metal: 'gold' | 'silver' | 'violet' = 'gold';
	export let glyph: GlyphName = 'trophy';
	export let locked = false;
	export let size = 72;
	const id = `md${++seq}`;
	const M = {
		gold: { a: '#fff1c8', b: '#d8b36a', c: '#7f5a1f', r1: '#9b2226', r2: '#6b1418', ink: '#f4dfa8' },
		silver: { a: '#ffffff', b: '#c3ccd6', c: '#5d6a78', r1: '#1f6f6a', r2: '#124743', ink: '#e8eef4' },
		violet: { a: '#efe2ff', b: '#b383f5', c: '#4c2590', r1: '#3b1f6b', r2: '#26134a', ink: '#e3d0ff' },
		iron: { a: '#8a95a3', b: '#566271', c: '#2a3440', r1: '#2b3542', r2: '#1b232d', ink: '#7c8796' }
	};
	$: m = M[locked ? 'iron' : metal];
</script>

<span class="medal" class:locked style="--s:{size}px;--ink:{m.ink}">
	<svg viewBox="0 0 80 96" aria-hidden="true">
		<defs>
			<linearGradient id="{id}g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color={m.a} /><stop offset="0.45" stop-color={m.b} /><stop offset="1" stop-color={m.c} /></linearGradient>
			<radialGradient id="{id}i" cx="0.5" cy="0.35" r="0.7"><stop offset="0" stop-color="#16314f" /><stop offset="1" stop-color="#06121f" /></radialGradient>
		</defs>
		<path d="M22 56 L36 56 L36 94 L29 87 L22 94 Z" fill={m.r1} />
		<path d="M44 56 L58 56 L58 94 L51 87 L44 94 Z" fill={m.r1} />
		<path d="M29 56 L36 56 L36 94 L29 87 Z" fill={m.r2} />
		<path d="M51 56 L58 56 L58 94 L51 87 Z" fill={m.r2} />
		<path d="M40 4 L71 22 V58 L40 76 L9 58 V22 Z" fill="url(#{id}g)" />
		<path d="M40 4 L71 22 V58 L40 76 L9 58 V22 Z" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1" />
		<path d="M40 13 L63 26.5 V53.5 L40 67 L17 53.5 V26.5 Z" fill="url(#{id}i)" stroke={m.c} stroke-width="1.5" />
		<path d="M40 8 L67 23.5" stroke="rgba(255,255,255,0.55)" stroke-width="1.5" stroke-linecap="round" fill="none" />
	</svg>
	<span class="ic"><Glyph name={locked ? 'lock' : glyph} size={Math.round(size * 0.36)} /></span>
</span>

<style>
	.medal { position: relative; flex: none; display: inline-block; width: var(--s); height: calc(var(--s) * 1.2); }
	.medal svg { position: absolute; inset: 0; width: 100%; height: 100%; filter: drop-shadow(0 5px 8px rgba(0, 0, 0, 0.55)); }
	.ic { position: absolute; left: 0; right: 0; top: 0; height: calc(var(--s) * 0.8); display: grid; place-items: center; color: var(--ink); }
	.locked .ic { opacity: 0.8; }
</style>
