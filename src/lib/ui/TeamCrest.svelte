<script context="module" lang="ts">
	let made = 0; // one id per instance, so gradients never collide
	const rad = (d: number) => (d * Math.PI) / 180;
	const pt = (r: number, d: number) => `${(r * Math.cos(rad(d))).toFixed(2)} ${(r * Math.sin(rad(d))).toFixed(2)}`;
	// a 12-tooth gear ring (even-odd: the middle is open)
	function gearPath(n = 12, ro = 68, rr = 55.5, tip = 6.4, root = 9.4, hole = 37.5): string {
		let d = '';
		for (let i = 0; i < n; i++) {
			const a = (360 / n) * i - 90;
			d += `${i ? 'L' : 'M'}${pt(rr, a - root)}L${pt(ro, a - tip)}A${ro} ${ro} 0 0 1 ${pt(ro, a + tip)}L${pt(rr, a + root)}A${rr} ${rr} 0 0 1 ${pt(rr, a + 360 / n - root)}`;
		}
		return `${d}ZM${hole} 0A${hole} ${hole} 0 1 0 ${-hole} 0A${hole} ${hole} 0 1 0 ${hole} 0Z`;
	}
	const GEAR = gearPath();
	// a five-point star drawn in one line (the same star as the board's spawn emblem)
	const STAR = 'M' + [0, 2, 4, 1, 3].map((i) => pt(47.5, -90 + 72 * i)).join('L') + 'Z';
	const STUDS = [0, 1, 2, 3, 4].map((i) => -54 + 72 * i);
	const TEETH = Array.from({ length: 12 }, (_, i) => i * 30);
	// metal (light → body → deep), outline, the field behind the emblem (centre → edge), glint
	const PAL = {
		orange: { hi: '#ffdcae', mid: '#e8883a', lo: '#8a4210', line: '#351703', f1: '#6f7887', f2: '#2a2f39', glint: '#fff3dc' },
		blue: { hi: '#e6f7ff', mid: '#56a9ea', lo: '#1a4990', line: '#071a3a', f1: '#96604a', f2: '#4c281c', glint: '#f4fcff' },
		ash: { hi: '#a9b0ba', mid: '#646b76', lo: '#2c3038', line: '#0c0e12', f1: '#3b3f48', f2: '#191b20', glint: '#cfd4db' }
	};
</script>

<script lang="ts">
	// A team's emblem as a struck medallion — the two faces of the tie-breaker coin, drawn as
	// vectors so they stay sharp at any size: the Atlanteans' copper gear on slate, the Titans'
	// ice star on red stone. `ash` = the fallen look (the same piece, its colour gone).
	// Static: no filters, nothing animates in here — move the whole <svg> from outside with
	// transform / opacity. The soft shadow spills a little past the box (overflow: visible).
	import type { Team } from '$lib/match';
	export let team: Team;
	export let ash = false;
	const id = `tc${++made}`;
	$: p = ash ? PAL.ash : PAL[team];
</script>

<svg class="crest" viewBox="-100 -100 200 200" aria-hidden="true">
	<defs>
		<linearGradient id="{id}m" gradientUnits="userSpaceOnUse" x1="-62" y1="-78" x2="62" y2="78">
			<stop offset="0" stop-color={p.hi} /><stop offset=".42" stop-color={p.mid} /><stop offset="1" stop-color={p.lo} />
		</linearGradient>
		<linearGradient id="{id}r" gradientUnits="userSpaceOnUse" x1="-62" y1="-78" x2="62" y2="78">
			<stop offset="0" stop-color={p.lo} /><stop offset=".6" stop-color={p.mid} /><stop offset="1" stop-color={p.hi} />
		</linearGradient>
		<radialGradient id="{id}f" gradientUnits="userSpaceOnUse" cx="-14" cy="-20" r="96">
			<stop offset="0" stop-color={p.f1} /><stop offset="1" stop-color={p.f2} />
		</radialGradient>
		<radialGradient id="{id}s" gradientUnits="userSpaceOnUse" cx="0" cy="9" r="112">
			<stop offset=".8" stop-color="#000" stop-opacity=".55" /><stop offset="1" stop-color="#000" stop-opacity="0" />
		</radialGradient>
	</defs>
	<circle cy="9" r="112" fill="url(#{id}s)" />
	<!-- the rim: a raised band, a chamfer running down to the field -->
	<circle r="97.5" fill="url(#{id}m)" stroke={p.line} stroke-width="3" />
	<circle r="85.5" fill="url(#{id}r)" stroke={p.line} stroke-width="1.6" />
	<circle r="80" fill="url(#{id}f)" stroke={p.line} stroke-width="2.2" />
	<path d="M-88.4 -23.7A91.5 91.5 0 0 1 23.7 -88.4" fill="none" stroke={p.glint} stroke-opacity=".7" stroke-width="2.6" stroke-linecap="round" />
	<path d="M88.4 23.7A91.5 91.5 0 0 1 -23.7 88.4" fill="none" stroke={p.line} stroke-opacity=".35" stroke-width="2.6" stroke-linecap="round" />
	{#if team === 'orange'}
		<!-- the gear: its shadow on the slate, six spokes, the toothed ring, the hub -->
		<g transform="translate(2.6 4.4)" fill="#000" fill-opacity=".42">
			<path d={GEAR} fill-rule="evenodd" />
			{#each [0, 60, 120] as a}<rect transform="rotate({a})" x="-5" y="-40" width="10" height="80" />{/each}
		</g>
		{#each [0, 60, 120] as a}<rect transform="rotate({a})" x="-5" y="-40" width="10" height="80" fill="url(#{id}m)" stroke={p.line} stroke-width="2" />{/each}
		<path d={GEAR} fill-rule="evenodd" fill="url(#{id}m)" stroke={p.line} stroke-width="2.4" stroke-linejoin="round" />
		{#each TEETH as a}<path transform="rotate({a})" d="M-4.6 -65.2H4.6" stroke={p.glint} stroke-opacity=".55" stroke-width="1.5" stroke-linecap="round" />{/each}
		<circle r="46.5" fill="none" stroke={p.line} stroke-opacity=".5" stroke-width="1.6" />
		<circle r="48" fill="none" stroke={p.glint} stroke-opacity=".4" stroke-width="1.1" />
		<circle r="12.5" fill="url(#{id}m)" stroke={p.line} stroke-width="2" />
		<circle r="5" fill={p.lo} stroke={p.line} stroke-width="1.4" />
	{:else}
		<!-- the star: its shadow on the stone, five studs between the points, the bars with a ridge -->
		<path transform="translate(2.6 4.4)" d={STAR} fill="none" stroke="#000" stroke-opacity=".42" stroke-width="17.5" stroke-linejoin="miter" stroke-miterlimit="4" />
		{#each STUDS as a}
			<g transform="rotate({a})"><circle cx="47" r="6.6" fill={p.lo} stroke={p.line} stroke-width="1.8" /><circle cx="47" r="3.9" fill="none" stroke={p.mid} stroke-width="2.2" /></g>
		{/each}
		<path d={STAR} fill="none" stroke={p.line} stroke-width="18" stroke-linejoin="miter" stroke-miterlimit="4" />
		<path d={STAR} fill="none" stroke="url(#{id}m)" stroke-width="13" stroke-linejoin="miter" stroke-miterlimit="4" />
		<path d={STAR} fill="none" stroke={p.glint} stroke-opacity=".5" stroke-width="1.3" stroke-linejoin="miter" stroke-miterlimit="4" />
	{/if}
</svg>

<style>
	.crest { display: block; width: 100%; height: 100%; overflow: visible; }
</style>
