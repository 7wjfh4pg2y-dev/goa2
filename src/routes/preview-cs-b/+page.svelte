<script lang="ts">
	import { HEROES, heroAvatar, heroById, STAT_LABELS, TRAIT_LABELS, PACK_LABELS, type Hero } from '$lib/heroes';
	const orange = ['arien', 'brogan', '', '', ''];
	const blue = ['xargatha', 'misa', 'hanu', '', ''];
	const bans = ['dodger', 'wasp', 'min', 'garrus'];
	const taken = new Set([...orange, ...blue, ...bans].filter(Boolean));
	let sel: Hero = heroById('tigerclaw')!;
	let star = 0;
</script>

<main class="wrap">
	<div class="rosters">
		<div class="roster orange">
			<span class="rlabel">Orange</span>
			{#each orange as id, i (i)}<div class="pslot" class:filled={id} class:active={i === 2}>{#if id}<img src={heroAvatar(id)} alt="" />{:else}<span>{i + 1}</span>{/if}</div>{/each}
		</div>
		<div class="turnpill"><span class="dot orange"></span>Orange picking · 0:24</div>
		<div class="roster blue">
			<span class="rlabel">Blue</span>
			{#each blue as id, i (i)}<div class="pslot" class:filled={id}>{#if id}<img src={heroAvatar(id)} alt="" />{:else}<span>{i + 1}</span>{/if}</div>{/each}
		</div>
	</div>

	<div class="main">
		<section class="left">
			<div class="filters">
				<input class="search" placeholder="Search heroes…" />
				<div class="stars">{#each [0, 1, 2, 3, 4] as s (s)}<button class="sbtn" class:on={star === s} on:click={() => (star = s)}>{s === 0 ? 'All' : '★'.repeat(s)}</button>{/each}</div>
			</div>
			<div class="grid">
				{#each HEROES.filter((h) => star === 0 || h.stars === star) as h (h.id)}
					<button class="hero" class:on={sel.id === h.id} class:gone={taken.has(h.id)} on:mouseenter={() => (sel = h)} on:click={() => (sel = h)}>
						<img src={heroAvatar(h.id)} alt={h.name} />
						<span class="hn">{h.name}</span>
					</button>
				{/each}
			</div>
		</section>

		<aside class="detail">
			<img class="big" src={heroAvatar(sel.id)} alt={sel.name} />
			<h2>{sel.name}</h2>
			<p class="title">{sel.title}</p>
			<p class="sub">{'★'.repeat(sel.stars)} · {PACK_LABELS[sel.pack]}</p>
			<div class="stats">
				{#each sel.stats as st, i (i)}
					<div class="stat"><span class="sl">{STAT_LABELS[i]}</span><div class="bar"><div class="fill" style="width:{(st[1] / 8) * 100}%"></div></div><span class="sv">{st[0] === st[1] ? st[1] : `${st[0]}–${st[1]}`}</span></div>
				{/each}
			</div>
			<div class="traits">{#each sel.traits as t (t)}<span class="chip">{TRAIT_LABELS[t]}</span>{/each}</div>
			<button class="lockin">Lock In</button>
		</aside>
	</div>
	<p class="cap">Option B · Dota-style — grid-forward, filters + stat panel</p>
</main>

<style>
	.wrap { --hl: linear-gradient(120deg, #ef7d22, #2f7fe6); min-height: 100vh; display: flex; flex-direction: column; color: #f1f5f9; padding: 16px 20px 10px; gap: 14px; }
	.rosters { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; }
	.roster { display: flex; align-items: center; gap: 8px; }
	.roster.blue { justify-content: flex-end; }
	.rlabel { font-weight: 700; font-size: 0.9rem; margin-right: 4px; }
	.orange .rlabel { color: #ef9a5a; }
	.blue .rlabel { color: #6ea8f0; }
	.pslot { width: 48px; height: 48px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(12,18,32,0.5); display: flex; align-items: center; justify-content: center; color: #64748b; overflow: hidden; }
	.orange .pslot { border-bottom: 3px solid #ef7d22; }
	.blue .pslot { border-bottom: 3px solid #2f7fe6; }
	.pslot img { width: 100%; height: 100%; object-fit: cover; }
	.pslot.active { border-color: #f59e0b; box-shadow: 0 0 0 1px #f59e0b, 0 0 14px rgba(245,158,11,0.4); }
	.turnpill { display: flex; align-items: center; gap: 8px; font-weight: 700; white-space: nowrap; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.16); border-radius: 999px; padding: 6px 16px; }
	.dot.orange { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: #ef7d22; box-shadow: 0 0 10px #ef7d22; }
	.main { flex: 1; display: grid; grid-template-columns: 1fr 300px; gap: 16px; min-height: 0; }
	.left { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
	.filters { display: flex; gap: 10px; align-items: center; }
	.search { flex: 1; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(8,12,22,0.6); padding: 0.5rem 0.8rem; color: #fff; }
	.stars { display: flex; gap: 6px; }
	.sbtn { border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); color: #e5e7eb; border-radius: 999px; padding: 0.4rem 0.8rem; font-size: 0.82rem; cursor: pointer; }
	.sbtn.on { background: var(--hl); border-color: transparent; color: #fff; }
	.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; align-content: start; overflow: hidden; }
	.hero { border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); border-radius: 10px; padding: 0; cursor: pointer; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.1s, border-color 0.12s; }
	.hero img { width: 100%; aspect-ratio: 1; object-fit: cover; }
	.hero .hn { font-size: 0.68rem; font-weight: 600; padding: 3px 2px; }
	.hero:hover { transform: translateY(-2px); border-color: rgba(255,255,255,0.4); }
	.hero.on { border-color: transparent; box-shadow: 0 0 0 2px #f59e0b; }
	.hero.gone { filter: grayscale(1) brightness(0.4); pointer-events: none; }
	.detail { background: rgba(12,18,32,0.55); border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 8px; align-items: center; text-align: center; }
	.big { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 12px; }
	.detail h2 { margin: 4px 0 0; font-size: 1.4rem; }
	.title { margin: 0; color: #cbd5e1; }
	.sub { margin: 0; color: #fcd34d; font-size: 0.82rem; }
	.stats { width: 100%; display: flex; flex-direction: column; gap: 5px; margin-top: 4px; }
	.stat { display: grid; grid-template-columns: 68px 1fr 34px; align-items: center; gap: 8px; font-size: 0.72rem; }
	.sl { text-align: left; color: #94a3b8; }
	.bar { height: 7px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; }
	.fill { height: 100%; background: var(--hl); }
	.sv { text-align: right; font-variant-numeric: tabular-nums; }
	.traits { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; }
	.chip { border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.05); border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.7rem; }
	.lockin { margin-top: 6px; width: 100%; border: 1px solid rgba(255,255,255,0.3); background: var(--hl); color: #fff; border-radius: 10px; padding: 0.7rem; font-weight: 700; cursor: pointer; }
	.cap { text-align: center; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin: 0; }
</style>
