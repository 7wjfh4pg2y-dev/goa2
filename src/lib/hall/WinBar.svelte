<script lang="ts">
	// Win rate as one split bar: green wins, red losses, a hairline at 50 %, the counts under it.
	export let wins = 0;
	export let games = 0;
	export let label = 'Win rate';
	$: losses = games - wins;
	$: pct = games ? (100 * wins) / games : 0;
</script>

<div class="wb">
	<div class="wh"><span>{label}</span><b>{games ? `${pct.toFixed(1)}%` : '–'}</b></div>
	<div class="bar" aria-hidden="true"><i class="w" style="transform:scaleX({games ? wins / games : 0})"></i><i class="mid"></i></div>
	<div class="wc"><span>Wins <b>{wins}</b></span><span>Losses <b>{losses}</b></span><span>Games <b>{games}</b></span></div>
</div>

<style>
	.wb { display: flex; flex-direction: column; gap: 5px; }
	.wh { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; color: var(--ink-2); }
	.wh b { font-weight: 400; font-size: 19px; color: var(--ink); }
	.bar { position: relative; height: 7px; border-radius: 4px; overflow: hidden; background: #b83a3f; }
	.bar .w { position: absolute; inset: 0; transform-origin: left; background: #2fa35a; box-shadow: 2px 0 0 #0a1626; }
	.bar .mid { position: absolute; left: 50%; top: -1px; bottom: -1px; width: 1px; background: rgba(255, 255, 255, 0.45); }
	.wc { display: flex; justify-content: space-between; font-size: 12px; color: var(--ink-3); }
	.wc b { font-weight: 400; color: var(--ink-2); }
</style>
