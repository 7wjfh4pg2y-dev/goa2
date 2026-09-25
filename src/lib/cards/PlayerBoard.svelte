<script lang="ts">
	// A digital player mat, styled after the physical Guards of Atlantis II board:
	// ornate steel/brass frame, stat legend, initiative rail, four turn slots
	// holding real rendered cards, level token, discard rail, level-up tracks.
	import Card from './Card.svelte';
	import { heroCards, heroName, heroTitle, heroStat, type HeroCardJson } from './deck';

	export let heroId = 'trinkets';
	export let teamColor: 'orange' | 'blue' = 'orange';
	export let slots: (number | null)[] = [6, 0, 2, null]; // indices into the hero deck; null = empty
	export let level = 1;

	const ui = import.meta.glob('./images/*.png', { eager: true, import: 'default' }) as Record<string, string>;
	const icon = (n: string) => ui[`./images/${n}.png`];

	$: deck = heroCards(heroId);
	$: cardFor = (i: number | null): HeroCardJson | null => (i == null ? null : deck[i] ?? null);

	const LEGEND = [
		{ n: 'item_attack', l: 'Attack' },
		{ n: 'item_defense', l: 'Defense' },
		{ n: 'item_initiative', l: 'Initiative' },
		{ n: 'item_range', l: 'Range' },
		{ n: 'item_movement', l: 'Movement' },
		{ n: 'item_area', l: 'Radius' }
	];
	const levelIcon = (lv: number) => icon(['level_i', 'level_i', 'level_ii', 'level_iii', 'level_iv'][Math.min(lv, 4)]);
	const track = [8, 7, 6, 5, 4, 3, 2, 1];
	// small decorative stat gems down the rail (colour + value) — matches the mat look
	const gems: Record<number, { c: string; v: number }> = {
		8: { c: 'red', v: 3 }, 7: { c: 'red', v: 3 }, 6: { c: 'redblue', v: 2 }, 5: { c: 'blue', v: 2 },
		4: { c: 'redblue', v: 2 }, 3: { c: 'redblue', v: 2 }, 2: { c: 'redwhite', v: 2 }, 1: { c: 'redwhite', v: 2 }
	};
</script>

<div class="mat {teamColor}">
	<div class="rivets"></div>

	<!-- top: stat legend -->
	<div class="legend">
		{#each LEGEND as s}
			<div class="lg"><img src={icon(s.n)} alt="" /><span>{s.l}</span></div>
		{/each}
	</div>

	<!-- hero name ribbon -->
	<div class="ribbon">
		<span class="rend l"></span>
		<h2>{heroName(heroId)} <em>{heroTitle(heroId)}</em></h2>
		<span class="rend r"></span>
	</div>

	<div class="body">
		<!-- initiative rail + level token -->
		<div class="rail">
			{#each track as t}
				<div class="tick">
					<span class="num">{t}</span>
					<span class="gem {gems[t].c}">{gems[t].v}</span>
				</div>
			{/each}
			<div class="leveltab">
				<img src={levelIcon(level)} alt="" />
				<div><span class="ll">Level</span><span class="lv">{level}</span></div>
			</div>
		</div>

		<!-- turn slots -->
		<div class="slots">
			{#each slots as s, i}
				{@const c = cardFor(s)}
				<div class="slot">
					<div class="banner">Turn {i + 1}</div>
					<div class="holder">
						{#if c}
							<Card {heroId} card={c} />
						{:else}
							<div class="empty"><span>◆</span></div>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- discard rail -->
		<div class="discard"><span>Discard</span></div>
	</div>

	<!-- bottom: level-up tracks -->
	<div class="levelup">
		<div class="lgroup">
			<div class="meter"><img src={icon('item_attack')} alt="" /><div class="pips">{#each Array(7) as _, k}<i class:on={k < 5}></i>{/each}</div></div>
			<div class="meter"><img src={icon('item_defense')} alt="" /><div class="pips">{#each Array(7) as _, k}<i class:on={k < 3}></i>{/each}</div></div>
		</div>
		<div class="emblem">✦</div>
		<div class="lgroup">
			<div class="meter"><img src={icon('item_initiative')} alt="" /><div class="pips">{#each Array(7) as _, k}<i class:on={k < 6}></i>{/each}</div></div>
			<div class="meter"><img src={icon('item_movement')} alt="" /><div class="pips">{#each Array(7) as _, k}<i class:on={k < 4}></i>{/each}</div></div>
		</div>
	</div>
</div>

<style>
	.mat {
		--brass: #c79a4e;
		--brass-d: #7c5a24;
		--steel: #1a1420;
		--red: #7a1f16;
		position: relative;
		width: 100%;
		aspect-ratio: 2000 / 980;
		border-radius: 22px;
		padding: 1.1% 1.4% 1.4%;
		color: #f3e8d8;
		background:
			radial-gradient(120% 90% at 20% 0%, rgba(122,31,22,0.5), transparent 55%),
			radial-gradient(120% 90% at 85% 100%, rgba(30,60,110,0.35), transparent 55%),
			linear-gradient(160deg, #241a2c 0%, #180f1c 45%, #120b16 100%);
		border: 3px solid transparent;
		background-clip: padding-box;
		box-shadow:
			0 0 0 3px var(--brass-d),
			0 0 0 6px #2a1d12,
			0 30px 70px rgba(0,0,0,0.6),
			inset 0 0 60px rgba(0,0,0,0.6);
		display: flex; flex-direction: column; gap: 0.6%;
		overflow: hidden;
	}
	.mat::before { /* brass inner border line */
		content: ''; position: absolute; inset: 8px; border: 2px solid rgba(199,154,78,0.5);
		border-radius: 16px; pointer-events: none;
		box-shadow: inset 0 0 30px rgba(199,154,78,0.08);
	}
	.mat::after { /* red gearbelt hint along the frame */
		content: ''; position: absolute; inset: 10px; border-radius: 15px; pointer-events: none;
		background:
			repeating-linear-gradient(90deg, transparent 0 26px, rgba(122,31,22,0.28) 26px 30px) top/100% 4px no-repeat,
			repeating-linear-gradient(90deg, transparent 0 26px, rgba(122,31,22,0.28) 26px 30px) bottom/100% 4px no-repeat;
	}
	.rivets { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
	.rivets::before, .rivets::after { content: ''; position: absolute; width: 34px; height: 34px; border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, #e7c47e, #8a6626 60%, #4a3413); box-shadow: 0 2px 4px rgba(0,0,0,0.6); }
	.rivets::before { top: 14px; left: 16px; }
	.rivets::after { top: 14px; right: 16px; }

	.legend { display: flex; gap: 4%; justify-content: center; align-items: center; padding: 0.2% 8% 0; z-index: 2; }
	.lg { display: flex; align-items: center; gap: 6px; opacity: 0.62; }
	.lg img { height: 1.2vw; min-height: 15px; filter: brightness(0) invert(1); opacity: 0.85; }
	.lg span { font-size: 0.78vw; letter-spacing: 0.16em; text-transform: uppercase; color: #d8c8b0; font-weight: 700; white-space: nowrap; }

	.ribbon { display: flex; align-items: center; justify-content: center; gap: 10px; z-index: 2; margin-top: -0.2%; }
	.ribbon h2 { font-family: 'Modesto Poster', serif; font-weight: 900; font-size: 1.7vw; margin: 0;
		letter-spacing: 0.04em; color: #f6ead2; text-shadow: 0 2px 6px rgba(0,0,0,0.8), 0 0 18px rgba(199,154,78,0.25);
		background: linear-gradient(#fff6e6, #d9b978); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
	.ribbon em { font-style: normal; font-weight: 700; font-size: 0.9em; -webkit-text-fill-color: #caa863; }
	.rend { width: 5vw; height: 3px; background: linear-gradient(90deg, transparent, var(--brass)); border-radius: 2px; }
	.rend.r { background: linear-gradient(90deg, var(--brass), transparent); }

	.body { flex: 1; display: grid; grid-template-columns: auto 1fr auto; gap: 1%; min-height: 0; z-index: 2; }

	.rail { position: relative; display: flex; flex-direction: column; justify-content: space-between; padding: 0 2px 0 6px; }
	.tick { display: flex; align-items: center; gap: 6px; }
	.tick .num { font-family: 'Modesto Poster', serif; font-weight: 700; font-size: 1.1vw; color: #efe2cc; width: 1.1vw; text-align: right; }
	.gem { width: 1.35vw; height: 1.35vw; min-width: 17px; min-height: 17px; border-radius: 4px; display: grid; place-items: center;
		font-size: 0.8vw; font-weight: 800; color: #fff; box-shadow: inset 0 1px 2px rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.5); }
	.gem.red { background: linear-gradient(#e0473a, #9b1d13); }
	.gem.blue { background: linear-gradient(#4f97ef, #1e56b8); }
	.gem.redblue { background: linear-gradient(135deg, #e0473a 50%, #2f7fe6 50%); }
	.gem.redwhite { background: linear-gradient(135deg, #e0473a 50%, #e8eef7 50%); color: #7a1f16; }
	.leveltab { position: absolute; bottom: -4%; left: -3%; display: flex; align-items: center; gap: 7px;
		background: linear-gradient(#efe6d4, #cdbf9a); color: #2a1d12; border-radius: 8px; padding: 5px 10px 5px 6px;
		box-shadow: 0 4px 10px rgba(0,0,0,0.5); border: 1px solid #8a6626; }
	.leveltab img { height: 1.5vw; min-height: 20px; }
	.leveltab .ll { display: block; font-size: 0.6vw; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; opacity: 0.75; }
	.leveltab .lv { display: block; font-family: 'Modesto Poster', serif; font-weight: 900; font-size: 1.2vw; line-height: 1; }

	.slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.4%; min-height: 0; }
	.slot { display: flex; flex-direction: column; gap: 5px; min-height: 0; }
	.banner { align-self: center; font-family: 'Modesto Poster', serif; font-weight: 700; font-size: 0.85vw; letter-spacing: 0.1em;
		text-transform: uppercase; color: #2a1d12; background: linear-gradient(#f3e8d0, #d3bd8f);
		padding: 3px 16px; border-radius: 4px; border: 1px solid #8a6626; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.5); }
	.banner::before, .banner::after { content: ''; position: absolute; top: 50%; width: 10px; height: 8px; transform: translateY(-50%);
		background: #b99a5e; clip-path: polygon(0 0, 100% 50%, 0 100%); }
	.banner::before { left: -8px; transform: translateY(-50%) scaleX(-1); }
	.banner::after { right: -8px; }
	.holder { flex: 1; min-height: 0; display: flex; align-items: stretch; justify-content: center;
		background: rgba(0,0,0,0.35); border-radius: 8px; padding: 4px; box-shadow: inset 0 0 14px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(199,154,78,0.25); }
	.empty { flex: 1; display: grid; place-items: center; border: 2px dashed rgba(199,154,78,0.3); border-radius: 6px; color: rgba(199,154,78,0.4); font-size: 2vw; }

	.discard { writing-mode: vertical-rl; text-orientation: mixed; display: grid; place-items: center;
		background: linear-gradient(#2a1d2e, #17101a); border-radius: 8px; border: 1px solid rgba(199,154,78,0.3); padding: 2px 5px; }
	.discard span { font-family: 'Modesto Poster', serif; letter-spacing: 0.24em; text-transform: uppercase; font-size: 0.9vw; color: #b8a06a; font-weight: 700; }

	.levelup { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 2%; padding: 0 3% 0.4%; z-index: 2; }
	.lgroup { display: flex; gap: 6%; }
	.meter { flex: 1; display: flex; align-items: center; gap: 8px; background: linear-gradient(#241a2c, #160e1a);
		border: 1px solid rgba(199,154,78,0.4); border-radius: 999px; padding: 4px 10px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.6); }
	.meter img { height: 1.1vw; min-height: 14px; filter: brightness(0) invert(1); opacity: 0.85; }
	.pips { display: flex; gap: 3px; flex: 1; }
	.pips i { flex: 1; height: 0.55vw; min-height: 7px; border-radius: 3px; background: rgba(255,255,255,0.1); box-shadow: inset 0 0 2px rgba(0,0,0,0.6); }
	.pips i.on { background: linear-gradient(#7fc0ff, #2f7fe6); box-shadow: 0 0 6px rgba(47,127,230,0.7); }
	.emblem { width: 2.4vw; height: 2.4vw; min-width: 30px; min-height: 30px; display: grid; place-items: center; border-radius: 50%;
		background: radial-gradient(circle at 35% 30%, #e7c47e, #8a6626 65%, #3a2810); color: #2a1d12; font-size: 1.3vw;
		box-shadow: 0 3px 8px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.4); border: 2px solid #4a3413; }
</style>
