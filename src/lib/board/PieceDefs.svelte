<svelte:options namespace="svg" />
<script lang="ts">
	// Every drawing the board's pieces share, defined once per page (put it inside an svg's <defs>):
	// the minion art and tokens (MinionDefs), the silver shield, and the mine's skull.
	import MinionDefs from './MinionDefs.svelte';
</script>

<MinionDefs />
<linearGradient id="shield-silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" /><stop offset=".45" stop-color="#cfd5dc" /><stop offset="1" stop-color="#7d8792" /></linearGradient>
<linearGradient id="mine-bone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4ecd9" /><stop offset="1" stop-color="#c7b894" /></linearGradient>
<radialGradient id="mine-shade"><stop offset=".55" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity=".42" /></radialGradient>
<!-- skull & crossbones for face-down mines (100×100 design space) -->
<symbol id="mine-skull" viewBox="0 0 100 100">
	<g transform="translate(50 50) scale(.8) translate(-50 -46)">
		<g stroke="#12161e" stroke-width="4.4" fill="#12161e"><g transform="translate(50 57) rotate(28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g><g transform="translate(50 57) rotate(-28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g></g>
		<g fill="url(#mine-bone)"><g transform="translate(50 57) rotate(28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g><g transform="translate(50 57) rotate(-28)"><rect x="-29" y="-2.6" width="58" height="5.2" rx="2.2"/><circle cx="-31" cy="-3.3" r="4"/><circle cx="-31" cy="3.3" r="4"/><circle cx="31" cy="-3.3" r="4"/><circle cx="31" cy="3.3" r="4"/></g></g>
		<path d="M50 12 C35 12 25 22 25 36 C25 42 27 46 29 49 C30 51 30 53 29.5 55 C29 58 31 60 34 60.5 C36 61 37.5 62.5 38 64.5 L39 70 C39.4 71.6 40.8 72.6 42.4 72.6 L57.6 72.6 C59.2 72.6 60.6 71.6 61 70 L62 64.5 C62.5 62.5 64 61 66 60.5 C69 60 71 58 70.5 55 C70 53 70 51 71 49 C73 46 75 42 75 36 C75 22 65 12 50 12 Z" fill="#12161e" stroke="#12161e" stroke-width="4.4" stroke-linejoin="round"/>
		<path d="M50 12 C35 12 25 22 25 36 C25 42 27 46 29 49 C30 51 30 53 29.5 55 C29 58 31 60 34 60.5 C36 61 37.5 62.5 38 64.5 L39 70 C39.4 71.6 40.8 72.6 42.4 72.6 L57.6 72.6 C59.2 72.6 60.6 71.6 61 70 L62 64.5 C62.5 62.5 64 61 66 60.5 C69 60 71 58 70.5 55 C70 53 70 51 71 49 C73 46 75 42 75 36 C75 22 65 12 50 12 Z" fill="url(#mine-bone)"/>
		<path d="M31.5 38.5 C34 36 40 35.5 45 37.5 C46.5 38.2 47 39.8 46.4 41.4 L44 47 C43 49.2 40.6 50.2 38.3 49.6 C34.5 48.6 31.8 45.5 31.2 41.6 C31 40.4 31.1 39.3 31.5 38.5 Z" fill="#12161e"/><path d="M68.5 38.5 C66.0 36 60.0 35.5 55.0 37.5 C53.5 38.2 53.0 39.8 53.6 41.4 L56.0 47 C57.0 49.2 59.4 50.2 61.7 49.6 C65.5 48.6 68.2 45.5 68.8 41.6 C69.0 40.4 68.9 39.3 68.5 38.5 Z" fill="#12161e"/>
		<path d="M50 49 C48.6 51.5 46.6 54.8 46.2 57 C46 58.3 47.2 59 48.3 58.4 L50 57.5 L51.7 58.4 C52.8 59 54 58.3 53.8 57 C53.4 54.8 51.4 51.5 50 49 Z" fill="#12161e"/>
		<path d="M39.6 65.6 H60.4 M42.6 62.8 V72 M46.3 62.4 V72.4 M50 62.3 V72.6 M53.7 62.4 V72.4 M57.4 62.8 V72" stroke="#12161e" stroke-width="1.3" fill="none"/>
		<path d="M31 56 C33 58.5 35.5 59.5 37.5 59.5" stroke="#12161e" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M69.0 56 C67.0 58.5 64.5 59.5 62.5 59.5" stroke="#12161e" stroke-opacity=".55" stroke-width="1.4" fill="none" stroke-linecap="round"/>
		<path d="M33 24 C37 18.5 43 16 48 15.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" fill="none" stroke-linecap="round"/>
	</g>
</symbol>
