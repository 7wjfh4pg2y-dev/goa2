<script lang="ts" context="module">
	// Line icons for the in-game top bar, menu and log (24-unit grid, current text colour).
	// Sized and stroked by `.tide .ico` in tide.css, like the pre-game Icon.
	const PATHS = {
		menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
		x: '<path d="M6 6l12 12M18 6L6 18"/>',
		compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
		target: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/>',
		rotl: '<path d="M4 5v5h5"/><path d="M4.6 10A8 8 0 1 1 6 16.6"/>',
		rotr: '<path d="M20 5v5h-5"/><path d="M19.4 10A8 8 0 1 0 18 16.6"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		minus: '<path d="M5 12h14"/>',
		log: '<path d="M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8.5 9h7M8.5 13h7"/>',
		undo: '<path d="M8 5L4 9l4 4"/><path d="M4 9h10a5 5 0 0 1 0 10h-3"/>',
		up: '<path d="M6 15l6-6 6 6"/>',
		down: '<path d="M6 9l6 6 6-6"/>',
		door: '<path d="M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>',
		save: '<path d="M6 4h12v16l-6-4-6 4z"/>'
	} as const;
	export type TopIconName = keyof typeof PATHS;
</script>

<script lang="ts">
	export let name: TopIconName;
</script>

<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">{@html PATHS[name]}</svg>
