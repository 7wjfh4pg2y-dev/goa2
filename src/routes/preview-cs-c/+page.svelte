<script lang="ts">
	import {
		HEROES_ALPHA, heroAvatar, heroSplash, heroLogo, heroById,
		statIcon, traitIcon, starIcon, STAT_LABELS, STAT_PIPS, TRAIT_LABELS, PACK_LABELS,
		type Hero
	} from '$lib/heroes';
	const orange = ['arien', 'brogan', '', '', ''];
	const blue = ['xargatha', 'misa', '', '', ''];
	const bans = ['dodger', 'wasp', 'min', 'garrus'];
	const taken = new Set([...orange, ...blue, ...bans].filter(Boolean));
	let sel: Hero = heroById('arien')!;
	// pip state for a cell: 2 = full, 1 = partial (within the min–max range), 0 = empty
	const pip = (stat: [number, number], i: number) => (i < stat[0] ? 2 : i < stat[1] ? 1 : 0);
</script>

<main class="wrap">
	<div class="stage">
		<img class="splash" src={heroSplash(sel.id)} alt={sel.name} />
		<div class="scrim"></div>
		<div class="turn"><span class="dot"></span>Orange is picking · 0:24</div>

		<!-- stat block, top-left (Stats-of-Atlantis style) -->
		<div class="stats">
			<div class="cx">{#each Array(sel.stars) as _, i (i)}<img class="star" src={starIcon()} alt="★" />{/each}<span class="pack">{PACK_LABELS[sel.pack]}</span></div>
			{#each sel.stats as st, i (i)}
				<div class="statrow">
					<img class="sicon" src={statIcon(i)} alt={STAT_LABELS[i]} />
					<div class="pips">{#each Array(STAT_PIPS) as _, c (c)}<span class="pip p{pip(st, c)}"></span>{/each}</div>
				</div>
			{/each}
		</div>

		<!-- name + emblem, bottom-left -->
		<div class="idblock">
			<div class="nameline">
				<img class="logo" src={heroLogo(sel.id)} alt="" />
				<div class="names"><span class="nm">{sel.name}</span><span class="ti">{sel.title}</span></div>
			</div>
			<div class="traits">
				{#each sel.traits as t (t)}
					<div class="trait">
						{#if traitIcon(t)}<img src={traitIcon(t)} alt={TRAIT_LABELS[t]} />{:else}<span class="tdot">◈</span>{/if}
						<span class="tl">{TRAIT_LABELS[t]}</span>
					</div>
				{/each}
			</div>
			<button class="lockin">Lock In {sel.name}</button>
		</div>

		<!-- browse grid, right, alphabetical, rows of 4 -->
		<aside class="browse">
			{#each HEROES_ALPHA as h (h.id)}
				<button class="hero" class:on={sel.id === h.id} class:gone={taken.has(h.id)} on:mouseenter={() => (sel = h)} on:click={() => (sel = h)}>
					<img src={heroAvatar(h.id)} alt={h.name} />
				</button>
			{/each}
		</aside>
	</div>

	<footer class="rails">
		<div class="rail orange">
			<span class="rl">Orange</span>
			{#each orange as id, i (i)}<div class="rslot" class:filled={id} class:active={i === 2}>{#if id}<img src={heroAvatar(id)} alt="" />{/if}</div>{/each}
		</div>
		<div class="banrail"><span class="rl">Bans</span>{#each bans as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}</div>
		<div class="rail blue">
			{#each blue as id, i (i)}<div class="rslot" class:filled={id}>{#if id}<img src={heroAvatar(id)} alt="" />{/if}</div>{/each}
			<span class="rl">Blue</span>
		</div>
	</footer>
	<p class="cap">Option C · Cinematic — Stats-of-Atlantis pips, symbols &amp; emblem</p>
</main>

<style>
	.wrap { --hl: linear-gradient(120deg, #ef7d22, #2f7fe6); min-height: 100vh; display: flex; flex-direction: column; color: #f1f5f9; }
	.stage { position: relative; flex: 1; overflow: hidden; }
	.splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; }
	.scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(9,13,22,0.94) 0%, rgba(9,13,22,0.6) 40%, rgba(9,13,22,0.12) 66%, rgba(9,13,22,0.35) 100%); }
	.turn { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; font-weight: 700; background: rgba(0,0,0,0.42); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 16px; }
	.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #ef7d22; box-shadow: 0 0 10px #ef7d22; }

	.stats { position: absolute; top: 26px; left: 34px; display: flex; flex-direction: column; gap: 9px; }
	.cx { display: flex; align-items: center; gap: 8px; margin-bottom: 2px; }
	.star { width: 26px; height: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6)); }
	.pack { font-family: 'Modesto Poster', serif; letter-spacing: 0.04em; font-size: 1.1rem; color: #f8fafc; text-shadow: 0 2px 6px rgba(0,0,0,0.7); }
	.statrow { display: flex; align-items: center; gap: 10px; }
	.sicon { width: 30px; height: 22px; object-fit: contain; filter: drop-shadow(0 2px 3px rgba(0,0,0,0.7)); }
	.pips { display: flex; gap: 3px; }
	.pip { width: 15px; height: 15px; border-radius: 3px; background: rgba(255,255,255,0.12); box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4); }
	.pip.p2 { background: #45b1ff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.35), 0 0 6px rgba(69,177,255,0.6); }
	.pip.p1 { background: rgba(69,177,255,0.4); box-shadow: inset 0 0 0 1px rgba(69,177,255,0.7); }

	.idblock { position: absolute; left: 40px; bottom: 30px; max-width: 560px; }
	.nameline { display: flex; align-items: center; gap: 14px; }
	.logo { width: 74px; height: 74px; object-fit: contain; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.7)); }
	.names { display: flex; flex-direction: column; line-height: 1; }
	.nm { font-family: 'Modesto Poster', serif; font-size: 3.6rem; letter-spacing: 0.01em; text-shadow: 0 4px 18px rgba(0,0,0,0.7); }
	.ti { font-family: 'Modesto Poster', serif; font-size: 1.5rem; color: #dbe4ee; text-shadow: 0 2px 10px rgba(0,0,0,0.7); margin-top: 2px; }
	.traits { display: flex; gap: 18px; margin: 16px 0 18px; }
	.trait { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 62px; }
	.trait img { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.7)); }
	.tdot { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: #fbbf24; border: 2px solid #fbbf24; border-radius: 50%; }
	.tl { font-family: 'Modesto Poster', serif; font-size: 0.92rem; letter-spacing: 0.03em; text-transform: uppercase; text-shadow: 0 2px 4px rgba(0,0,0,0.8); }
	.lockin { border: 1px solid rgba(255,255,255,0.3); background: var(--hl); color: #fff; border-radius: 12px; padding: 0.8rem 2rem; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }

	.browse { position: absolute; top: 16px; right: 16px; bottom: 16px; width: 300px; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: min-content; gap: 8px; align-content: start; overflow-y: auto; padding: 12px; background: rgba(9,13,22,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; backdrop-filter: blur(6px); }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 9px; padding: 0; cursor: pointer; overflow: hidden; transition: transform 0.1s; }
	.hero img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
	.hero:hover { transform: scale(1.06); }
	.hero.on { box-shadow: 0 0 0 2px #f59e0b; border-color: transparent; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }

	.rails { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding: 12px 24px; background: rgba(9,13,22,0.72); border-top: 1px solid rgba(255,255,255,0.1); }
	.rail { display: flex; align-items: center; gap: 8px; }
	.rail.blue { justify-content: flex-end; }
	.rl { font-family: 'Modesto Poster', serif; font-size: 1rem; letter-spacing: 0.03em; }
	.orange .rl { color: #ef9a5a; }
	.blue .rl { color: #6ea8f0; }
	.banrail .rl { color: #94a3b8; }
	.rslot { width: 50px; height: 50px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,18,32,0.6); overflow: hidden; }
	.orange .rslot { border-bottom: 3px solid #ef7d22; }
	.blue .rslot { border-bottom: 3px solid #2f7fe6; }
	.rslot img { width: 100%; height: 100%; object-fit: cover; }
	.rslot.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 14px rgba(245,158,11,0.4); }
	.banrail { display: flex; align-items: center; gap: 6px; justify-content: center; }
	.ban { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; filter: grayscale(1) brightness(0.45); }
	.cap { text-align: center; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 6px 0; }
</style>
