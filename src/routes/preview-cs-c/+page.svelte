<script lang="ts">
	import { HEROES, heroAvatar, heroSplash, heroById, TRAIT_LABELS, PACK_LABELS, type Hero } from '$lib/heroes';
	const orange = ['arien', 'brogan', '', '', ''];
	const blue = ['xargatha', 'misa', '', '', ''];
	const bans = ['dodger', 'wasp', 'min', 'garrus'];
	const taken = new Set([...orange, ...blue, ...bans].filter(Boolean));
	let sel: Hero = heroById('tigerclaw')!;
</script>

<main class="wrap">
	<div class="stage">
		<img class="splash" src={heroSplash(sel.id)} alt={sel.name} />
		<div class="scrim"></div>
		<div class="turn"><span class="dot"></span>Orange is picking · 0:24</div>
		<div class="heroinfo">
			<p class="pack">{'★'.repeat(sel.stars)} · {PACK_LABELS[sel.pack]}</p>
			<h1>{sel.name}</h1>
			<p class="title">{sel.title}</p>
			<div class="traits">{#each sel.traits as t (t)}<span class="chip">{TRAIT_LABELS[t]}</span>{/each}</div>
			<button class="lockin">Lock In {sel.name}</button>
		</div>
		<aside class="browse">
			{#each HEROES as h (h.id)}
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
		<div class="bans"><span class="rl">Bans</span>{#each bans as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}</div>
		<div class="rail blue">
			{#each blue as id, i (i)}<div class="rslot" class:filled={id}>{#if id}<img src={heroAvatar(id)} alt="" />{/if}</div>{/each}
			<span class="rl">Blue</span>
		</div>
	</footer>
	<p class="cap">Option C · Cinematic — full-art splash + browse strip</p>
</main>

<style>
	.wrap { --hl: linear-gradient(120deg, #ef7d22, #2f7fe6); min-height: 100vh; display: flex; flex-direction: column; color: #f1f5f9; }
	.stage { position: relative; flex: 1; overflow: hidden; }
	.splash { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
	.scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(9,13,22,0.92) 0%, rgba(9,13,22,0.55) 38%, rgba(9,13,22,0.15) 62%, rgba(9,13,22,0.4) 100%); }
	.turn { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; font-weight: 700; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; padding: 6px 16px; }
	.dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #ef7d22; box-shadow: 0 0 10px #ef7d22; }
	.heroinfo { position: absolute; left: 40px; bottom: 32px; max-width: 440px; }
	.pack { margin: 0; color: #fcd34d; font-size: 0.9rem; letter-spacing: 0.05em; }
	.heroinfo h1 { margin: 4px 0 0; font-size: 3.4rem; line-height: 1; text-shadow: 0 4px 20px rgba(0,0,0,0.6); }
	.title { margin: 4px 0 12px; font-size: 1.2rem; color: #cbd5e1; }
	.traits { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
	.chip { border: 1px solid rgba(255,255,255,0.22); background: rgba(0,0,0,0.35); border-radius: 999px; padding: 0.3rem 0.8rem; font-size: 0.82rem; }
	.lockin { border: 1px solid rgba(255,255,255,0.3); background: var(--hl); color: #fff; border-radius: 12px; padding: 0.8rem 2rem; font-weight: 700; font-size: 1.05rem; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,0.4); }
	.browse { position: absolute; top: 16px; right: 16px; bottom: 16px; width: 300px; display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: min-content; gap: 6px; align-content: start; overflow-y: auto; padding: 10px; background: rgba(9,13,22,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; backdrop-filter: blur(6px); }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 8px; padding: 0; cursor: pointer; overflow: hidden; transition: transform 0.1s; }
	.hero img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
	.hero:hover { transform: scale(1.06); }
	.hero.on { box-shadow: 0 0 0 2px #f59e0b; border-color: transparent; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }
	.rails { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 20px; padding: 12px 24px; background: rgba(9,13,22,0.7); border-top: 1px solid rgba(255,255,255,0.1); }
	.rail { display: flex; align-items: center; gap: 8px; }
	.rail.blue { justify-content: flex-end; }
	.rl { font-weight: 700; font-size: 0.85rem; }
	.orange .rl { color: #ef9a5a; }
	.blue .rl { color: #6ea8f0; }
	.bans .rl { color: #94a3b8; }
	.rslot { width: 50px; height: 50px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,18,32,0.6); overflow: hidden; }
	.orange .rslot { border-bottom: 3px solid #ef7d22; }
	.blue .rslot { border-bottom: 3px solid #2f7fe6; }
	.rslot img { width: 100%; height: 100%; object-fit: cover; }
	.rslot.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 14px rgba(245,158,11,0.4); }
	.bans { display: flex; align-items: center; gap: 6px; justify-content: center; }
	.ban { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; filter: grayscale(1) brightness(0.45); }
	.cap { text-align: center; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 6px 0; }
</style>
