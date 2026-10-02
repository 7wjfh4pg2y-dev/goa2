<script lang="ts" context="module">
	// The pre-game screens' line icons (24-unit grid, drawn with the current text colour).
	// Sized and stroked by `.tide .ico` in tide.css; `fill` makes a solid one (star, crown).
	const PATHS = {
		user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
		wrench: '<g transform="rotate(45 12 12)"><path d="M12 20.5V10.5"/><path d="M8.7 5.4a3.4 3.4 0 1 0 6.6 0l-2.1 2.1h-2.4z"/></g>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		join: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
		pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
		back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
		go: '<path d="M9 5l7 7-7 7"/>',
		link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
		check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		x: '<path d="M6 6l12 12M18 6L6 18"/>',
		eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
		lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		crown: '<path d="M2.5 18.5h19l1-11-5.6 4.2L12 4.5 7.1 11.7 1.5 7.5z"/>',
		coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>',
		star: '<path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7L12 17.6 6 20.9l1.3-6.7-5-4.7 6.8-.8z"/>',
		minus: '<path d="M5 12h14"/>'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	export let name: IconName;
	export let fill = false;
</script>

<svg class="ico" class:fill viewBox="0 0 24 24" aria-hidden="true">{@html PATHS[name]}</svg>
