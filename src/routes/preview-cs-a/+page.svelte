<script lang="ts">
	import { HEROES, heroAvatar, heroById, type Hero } from '$lib/heroes';
	// mock 5v5 draft state
	const orange = ['arien', 'brogan', '', '', ''];
	const blue = ['xargatha', 'misa', '', '', ''];
	const bansO = ['dodger', 'wasp'];
	const bansB = ['min', 'garrus'];
	const taken = new Set([...orange, ...blue, ...bansO, ...bansB].filter(Boolean));
	let sel: Hero = heroById('tigerclaw')!;
</script>

<main class="wrap">
	<header class="banner">
		<div class="phase"><span class="dot orange"></span>Orange team is picking</div>
		<div class="timer">0:24</div>
	</header>
	<div class="body">
		<aside class="team orange">
			{#each orange as id, i (i)}
				<div class="slot" class:filled={id} class:active={i === 2}>
					{#if id}<img src={heroAvatar(id)} alt="" /><span>{heroById(id)?.name}</span>{:else}<span class="empty">Pick {i + 1}</span>{/if}
				</div>
			{/each}
			<div class="bans">{#each bansO as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}</div>
		</aside>

		<section class="center">
			<div class="grid">
				{#each HEROES as h (h.id)}
					<button class="hero" class:on={sel.id === h.id} class:gone={taken.has(h.id)} on:click={() => (sel = h)}>
						<img src={heroAvatar(h.id)} alt={h.name} />
					</button>
				{/each}
			</div>
			<div class="pickbar">
				<img class="picart" src={heroAvatar(sel.id)} alt={sel.name} />
				<div class="picinfo"><b>{sel.name}</b><span>{sel.title}</span></div>
				<button class="lockin">Lock In</button>
			</div>
		</section>

		<aside class="team blue">
			{#each blue as id, i (i)}
				<div class="slot" class:filled={id}>
					{#if id}<img src={heroAvatar(id)} alt="" /><span>{heroById(id)?.name}</span>{:else}<span class="empty">Pick {i + 1}</span>{/if}
				</div>
			{/each}
			<div class="bans">{#each bansB as b (b)}<img class="ban" src={heroAvatar(b)} alt="" />{/each}</div>
		</aside>
	</div>
	<p class="cap">Option A · LoL-style — team rails + central grid</p>
</main>

<style>
	.wrap { --hl: linear-gradient(120deg, #ef7d22, #2f7fe6); min-height: 100vh; display: flex; flex-direction: column; color: #f1f5f9; padding: 18px 20px 12px; gap: 14px; }
	.banner { display: flex; align-items: center; justify-content: center; gap: 24px; }
	.phase { display: flex; align-items: center; gap: 10px; font-size: 1.15rem; font-weight: 700; letter-spacing: 0.02em; }
	.dot { width: 0.7rem; height: 0.7rem; border-radius: 50%; }
	.dot.orange { background: #ef7d22; box-shadow: 0 0 12px #ef7d22; }
	.timer { font-variant-numeric: tabular-nums; font-size: 1.3rem; font-weight: 700; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; padding: 2px 12px; }
	.body { flex: 1; display: grid; grid-template-columns: 190px 1fr 190px; gap: 16px; min-height: 0; }
	.team { display: flex; flex-direction: column; gap: 8px; }
	.slot { display: flex; align-items: center; gap: 10px; height: 62px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); background: rgba(12,18,32,0.5); padding: 6px 10px; overflow: hidden; }
	.team.orange .slot { border-left: 3px solid #ef7d22; }
	.team.blue .slot { border-right: 3px solid #2f7fe6; flex-direction: row-reverse; text-align: right; }
	.slot img { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; }
	.slot span { font-weight: 600; font-size: 0.9rem; }
	.slot .empty { color: #64748b; font-weight: 500; }
	.slot.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 18px rgba(245,158,11,0.4); }
	.bans { display: flex; gap: 6px; margin-top: 4px; }
	.ban { width: 34px; height: 34px; border-radius: 6px; object-fit: cover; filter: grayscale(1) brightness(0.5); position: relative; }
	.center { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
	.grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 7px; align-content: start; }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 10px; padding: 0; cursor: pointer; overflow: hidden; transition: transform 0.1s, border-color 0.12s; }
	.hero img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
	.hero:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.4); }
	.hero.on { outline: 2px solid transparent; border-color: transparent; box-shadow: 0 0 0 2px #f59e0b; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }
	.pickbar { display: flex; align-items: center; gap: 14px; background: rgba(12,18,32,0.55); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 10px 14px; }
	.picart { width: 60px; height: 60px; border-radius: 10px; object-fit: cover; }
	.picinfo { display: flex; flex-direction: column; }
	.picinfo b { font-size: 1.1rem; }
	.picinfo span { color: #cbd5e1; font-size: 0.85rem; }
	.lockin { margin-left: auto; border: 1px solid rgba(255,255,255,0.3); background: var(--hl); color: #fff; border-radius: 10px; padding: 0.7rem 2rem; font-weight: 700; font-size: 1rem; cursor: pointer; }
	.cap { text-align: center; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0; }
</style>
