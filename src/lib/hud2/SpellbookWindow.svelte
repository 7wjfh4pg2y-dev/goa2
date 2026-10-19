<script lang="ts">
	// Gydion's spellbook window (the user's design, 2026-10-19, artifact "Gydion's Spellbook"; only his screen shows it).
	// Desktop: one colour at a time — a tab per colour (its schools' symbols, spells left, a dot where the acting card can
	// cast), that colour's schools as rows of three readable cards (Cantrips — '· Wish' and a violet tab once he is The
	// Archwizard: Wish in the middle of the second row between two arcane circles, sealed until then), a big preview with
	// Invoke on the right, and along the bottom THE ETHER (2026-10-19, the user's ask): every spell out of the book — all
	// 21 before the first Prepare, then each spent / struck one — as a STACK; hover (or tap) shuffles through it, a
	// double-click opens it large with ‹ › to shuffle; plus what Sunburst / Dimension Door / Midas' Touch are worth now.
	// Host mode (`host` = whose book, from the Game lobby's Book): every spell toggles between the book and the ether.
	// After a cast, the right column turns into that spell's follow-up: strike up to three spells (Find Familiar), make a
	// hero discard (Burning Hands, Cloud Kill, Energy Drain), take a discard back (Vampiric Touch).
	// Phone: a sheet — the tabs (+ Gone), three cards a row, the picked spell's line with Cast; tap it again to read it.
	import Card from '$lib/cards/Card.svelte'
	import { heroCards } from '$lib/cards/deck'
	import { SPELLS, spellOf, schoolIcon, SCHOOL_COLOR } from '$lib/cards/spells'
	import { heroLogo, portraitCss } from '$lib/heroes'
	import { BOOK, type SpellNums } from '$lib/gydion'
	import { fly, fade } from 'svelte/transition'

	export let open = false
	export let phone = false
	export let ult = false
	export let wishes = 0
	/** spells in the book now / out of it this cycle (in order) / struck by Find Familiar */
	export let book: string[] = []
	export let gone: string[] = []
	export let struck: string[] = []
	/** spells he may cast right now */
	export let options: string[] = []
	/** the acting card of his (name + colour), or null */
	export let acting: { name: string; color: string } | null = null
	/** his silver acting: Prepare (and Wish) */
	export let preparing = false
	/** the spell loaded onto the action ring */
	export let picked: string | null = null
	export let nums: (id: string) => SpellNums = () => ({})
	/** the follow-up of the spell just cast */
	export let follow: { kind: 'strike' | 'force' | 'drink'; spell: string; targets?: { pid: string; hero: string; name: string }[]; discard?: number[] } | null = null
	export let onPick: (id: string | null) => void = () => {}
	export let onStrike: (ids: string[]) => void = () => {}
	export let onForce: (pid: string) => void = () => {}
	export let onDrink: (idx: number) => void = () => {}
	/** the book has been prepared at least once (before that every spell drifts in the ether) */
	export let prepared = true
	/** host mode: whose book this is (their name); null = his own */
	export let host: string | null = null
	export let onFix: (id: string, on: boolean) => void = () => {}
	export let onWish: (n: number) => void = () => {}

	const COL: Record<string, string> = { gold: '#e0b440', red: '#d8443c', green: '#41ae59', blue: '#3d7be0', purple: '#9a5ce0', silver: '#c3ccd6' }
	const TABS0: [string, string[], string][] = [['gold', ['cantrip', 'wish'], 'Cantrips'], ['red', ['evocation', 'necromancy'], 'Evocation · Necromancy'], ['green', ['abjuration', 'conjuration'], 'Abjuration · Conjuration'], ['blue', ['enchantment', 'transmutation'], 'Enchantment · Transmutation']]
	const school = (id: string) => spellOf(id)?.school.toLowerCase() ?? ''
	const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
	const logo = heroLogo('gydion')
	const inSchool = (s: string) => SPELLS.filter((x) => school(x.id) === s)

	// the tab and the spell previewed (local); the tab follows the acting card when the window opens
	let tab = 'red', sel = 'fireball', wasOpen = false, ticks: string[] = [], zoom = false
	// the tab a spell sits on (Wish lives on the gold tab)
	const tabOf = (id: string) => { const c = SCHOOL_COLOR[school(id)]; return c === 'purple' || !c ? 'gold' : c }
	$: if (open && !wasOpen) {
		wasOpen = true
		// open where there is something to do: Wish on his silver, else the first spell he may cast, else his card's colour
		tab = preparing && ult && book.includes('wish') ? 'gold' : options.length ? tabOf(options[0]) : acting && TABS.some((t) => t[0] === acting!.color) ? acting.color : tab
		sel = preparing && ult && book.includes('wish') ? 'wish' : options[0] ?? firstOf(tab)
		ticks = []; zoom = false
	}
	$: if (!open) wasOpen = false
	$: if (follow?.kind !== 'strike') ticks = []
	function firstOf(t: string) { const ss = TABS0.find((x) => x[0] === t)![1]; return SPELLS.find((x) => ss.includes(school(x.id)) && (x.id !== 'wish' || ult))?.id ?? 'fireball' }
	function goTab(t: string) { tab = t; sel = options.find((id) => TABS0.find((x) => x[0] === t)![1].includes(school(id))) ?? firstOf(t); zoom = false }
	// reactive (it reads book / options / ult): a plain function called from the template would not refresh
	$: tabCount = (ss: string[]) => { const ids = SPELLS.filter((x) => ss.includes(school(x.id)) && (x.id !== 'wish' || ult)); return { left: ids.filter((x) => book.includes(x.id)).length, all: ids.length, can: ids.some((x) => options.includes(x.id)) } }
	function tap(id: string) {
		if (follow?.kind === 'strike') { if (book.includes(id) && id !== 'wish' && id !== follow.spell) ticks = ticks.includes(id) ? ticks.filter((x) => x !== id) : ticks.length < 3 ? [...ticks, id] : ticks; sel = id; return }
		// a tap on any spell but the loaded one unloads it, unless that spell loads in its place (below)
		if (picked && picked !== id && !options.includes(id)) onPick(null)
		// phone: a second tap reads the card — but a castable spell not yet on the ring loads first
		if (phone && sel === id && (picked === id || !options.includes(id))) { zoom = !zoom; return }
		sel = id
		zoom = false
		// a spell the card can cast loads onto the ring at once (the ring confirms it); any other just previews — and
		// unloads whatever was on the ring, so a spell is never left loaded behind another one (the user, 2026-10-19)
		if (options.includes(id)) onPick(id)
	}
	$: selSpell = spellOf(sel)
	$: selGone = !book.includes(sel)
	$: why = host ? (book.includes(sel) ? 'In the book.' : sel === 'wish' && !ult ? 'Sealed until The Archwizard.' : 'Drifting in the ether.')
		: sel === 'wish'
		? !ult ? 'Sealed until The Archwizard.' : preparing && book.includes('wish') ? `Wish instead of preparing your spells. ${wishes} of 3 wished.` : !book.includes('wish') ? 'Wished for — drifting in the ether.' : 'Wished for from Prepare Spells, instead of refilling the book.'
		: !prepared ? 'The book is empty: Prepare Spells draws the spells in from the ether.'
		: selGone ? (struck.includes(sel) ? 'Struck by Find Familiar — drifting in the ether.' : 'Spent — drifting in the ether.')
		: options.includes(sel) ? `${acting?.name ?? 'Wish'} is attuned to this spell.`
		: acting ? `${acting.name} isn't attuned to this one.` : 'Browse freely: invoke a spell when one of your casting cards is acting.'
	// THE ETHER: every spell out of the book (all 21 before the first Prepare), stacked
	$: ether = prepared ? gone : [...BOOK, ...gone.filter((x) => !BOOK.includes(x))]
	let eIdx = 0, eBig = false
	$: if (eIdx >= ether.length) eIdx = Math.max(0, ether.length - 1)
	$: eId = ether[eIdx] ?? ''
	const eStep = (d: number) => { if (ether.length) eIdx = (eIdx + d + ether.length) % ether.length }
	function eKey(e: KeyboardEvent) {
		if (!eBig) return
		if (e.key === 'ArrowRight') eStep(1); else if (e.key === 'ArrowLeft') eStep(-1); else if (e.key === 'Escape') eBig = false; else return
		e.stopPropagation(); e.preventDefault()
	}
	$: if (!ether.length || !open) eBig = false
	$: eWhat = (id: string) => (!prepared && BOOK.includes(id) ? 'Unprepared' : struck.includes(id) ? 'Struck' : id === 'wish' ? 'Wished' : 'Spent')
	const numLine = (n: SpellNums) => [n.attack != null && `Attack ${n.attack}`, n.move != null && `Move ${n.move}`, n.range != null && `Range ${n.range}`, n.radius != null && `Radius ${n.radius}`, n.coins != null && `+${n.coins} coins`].filter(Boolean) as string[]
	$: g = gone.length
	// the cantrips' tab: 'Cantrips' — with The Archwizard 'Cantrips · Wish' on a violet tab
	$: TABS = TABS0.map(([c, ss, l]) => (c === 'gold' ? [c, ult ? ss : ['cantrip'], ult ? 'Cantrips · Wish' : l] : [c, ss, l]) as [string, string[], string])
	$: tabs = TABS
	$: cur = TABS.find((x) => x[0] === tab) ?? TABS[1]
	$: curBody = TABS0.find((x) => x[0] === tab) ?? TABS0[1] // the body keeps the sealed Wish row
	/** a tab's colour: the cantrips' gold turns violet with the ultimate */
	$: tabCol = (c: string) => COL[c === 'gold' && ult ? 'purple' : c]
</script>

{#snippet mi(s: string, c: string, cls = '')}<span class="mi {cls}" style="--ic:{c};--m:url({schoolIcon(s)})"></span>{/snippet}

{#snippet spellBtn(id: string)}
	{@const out = !book.includes(id)}
	{@const can = options.includes(id)}
	{@const tick = ticks.includes(id)}
	<button class="sp" class:out class:can class:dim={!out && !can && follow?.kind !== 'strike'} class:sel={sel === id} class:pk={picked === id} class:tick
		style="background-image:url({spellOf(id)?.art})" on:click={() => tap(id)} title={spellOf(id)?.name}>
		{#if tick}<span class="tag tk">Strike</span>{:else if out}<span class="tag">{eWhat(id)}</span>{:else if can}<span class="tag cc">Attuned</span>{/if}
	</button>
{/snippet}

{#snippet arcane(flip: boolean, live: boolean)}
	{@const c = live ? '#c9a2ff' : '#7d6a9e'}
	{@const H = Array.from({ length: 6 }, (_, i) => { const t = ((-90 + i * 60) * Math.PI) / 180; return [70 + 40 * Math.cos(t), 70 + 40 * Math.sin(t)] })}
	<svg viewBox="0 0 200 140" class="arcsv" class:live style={flip ? 'transform:scaleX(-1)' : ''}><g fill="none" stroke={c} stroke-width="1.1" stroke-linecap="round" opacity={live ? 0.9 : 0.55}>
		<circle cx="70" cy="70" r="55" /><circle cx="70" cy="70" r="46" />
		{#each Array.from({ length: 36 }, (_, i) => i) as i}{@const t = (i * Math.PI) / 18}<line x1={70 + 46 * Math.cos(t)} y1={70 + 46 * Math.sin(t)} x2={70 + (i % 3 ? 49 : 52) * Math.cos(t)} y2={70 + (i % 3 ? 49 : 52) * Math.sin(t)} />{/each}
		<polygon points={[0, 2, 4].map((i) => H[i].join(',')).join(' ')} /><polygon points={[1, 3, 5].map((i) => H[i].join(',')).join(' ')} /><polygon points={H.map((p) => p.join(',')).join(' ')} />
		<circle cx="70" cy="70" r="14" /><circle cx="70" cy="70" r="5" />
		{#each H as p}<line x1="70" y1="70" x2={p[0]} y2={p[1]} />{/each}
		{#each H as p, i}<circle cx={p[0]} cy={p[1]} r={i % 2 ? 3.5 : 5.5} fill="#0b1020" />{/each}
		<path d="M125 70 H200 M125 70 l8 -6 M125 70 l8 6 M150 62 v16 M168 58 v24 M186 64 v12" /><circle cx="150" cy="70" r="4" /><circle cx="186" cy="70" r="3" />
	</g></svg>
{/snippet}

{#snippet wishRow()}
	{@const sealed = !ult}
	<div class="school">
		<div class="sh">{@render mi('wish', COL.purple)}Wish<small>{sealed ? 'Sealed until The Archwizard' : preparing && book.includes('wish') ? 'Wish instead of preparing' : 'Wished for from Prepare Spells'}</small></div>
		<div class="wishrow">
			<div class="arc">{@render arcane(false, !sealed)}</div>
			{#if sealed}
				<button class="sp wish locked" disabled style="background-image:url({spellOf('wish')?.art})"><span class="seal"><span class="sring"></span>{@render mi('wish', '#d9c2ff', 'big')}<em>Sealed</em></span></button>
			{:else}{@render spellBtn('wish')}{/if}
			<div class="arc">{@render arcane(true, !sealed)}</div>
		</div>
	</div>
{/snippet}

{#snippet followUp()}
	{#if follow}
		{@const sp = spellOf(follow.spell)}
		<div class="fu">
			<div class="fh">{@render mi(school(follow.spell), COL[SCHOOL_COLOR[school(follow.spell)]])}<b>{sp?.name}</b><small>invoked</small></div>
			{#if follow.kind === 'strike'}
				<p>Find Familiar: tap up to three other spells in the book to strike them (they leave face up).</p>
				<div class="fbtns"><button class="castbtn" on:click={() => onStrike(ticks)}>{ticks.length ? `Strike ${ticks.length}` : 'Strike none'}</button>{#if ticks.length}<button class="ghost" on:click={() => (ticks = [])}>Clear</button>{/if}</div>
			{:else if follow.kind === 'force'}
				<p>{follow.spell === 'energy-drain' ? 'An enemy hero in range discards a non-basic card, if able.' : follow.spell === 'cloud-kill' ? 'An enemy hero in radius discards a basic card, if able.' : 'Up to one enemy hero next to the target discards a card, if able.'}</p>
				<div class="faces">{#each follow.targets ?? [] as t}<button class="fc" on:click={() => onForce(t.pid)}><span class="face" style={portraitCss(t.hero)}></span><small>{t.name}</small></button>{:else}<em class="none">No enemy hero in reach</em>{/each}</div>
			{:else if follow.kind === 'drink'}
				<p>Vampiric Touch: take one discarded card back.</p>
				<div class="disc">{#each follow.discard ?? [] as idx}<button class="cd" on:click={() => onDrink(idx)} title="Take {heroCards('gydion')[idx]?.name} back"><Card heroId="gydion" card={heroCards('gydion')[idx]} /></button>{/each}</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet scaling(short: boolean)}
	{#if short}<div class="gx2 ph2"><i>Sunburst <b>+{g}/+{g}</b></i><i>Dim. Door <b>+{g}</b></i><i>Midas <b>+{Math.floor(g / 2)}</b></i></div>
	{:else}<span class="gx2"><i>{@render mi('evocation', COL.red)}Sunburst <b>+{g} Attack · +{g} Range</b></i><i>{@render mi('conjuration', COL.green)}Dimension Door <b>Radius +{g}</b></i><i>{@render mi('transmutation', COL.blue)}Midas' Touch <b>+{Math.floor(g / 2)} coins</b></i></span>{/if}
{/snippet}

<!-- the ether's stack: hover / tap shuffles, a double-click (double tap) opens it large -->
{#snippet pile()}
	<!-- a tidy deck: the card on top, straight edges behind it for the rest; ‹ › and the pips (one per spell, in its
	     school's colour) move through it — hover a pip on desktop, tap on a phone; the card itself opens it large -->
	{#if ether.length}
		<div class="erow" role="group" aria-label="The ether — {ether.length} spells">
			<div class="deck" out:fly={{ y: -40, duration: 420 }}>
				{#each Array(Math.min(3, ether.length - 1)) as _, k}<span class="edge" style="--k:{k + 1}"></span>{/each}
				{#key eId}<button class="ecard" style="background-image:url({spellOf(eId)?.art})" on:click={() => (eBig = true)} title="Read {spellOf(eId)?.name}" in:fade={{ duration: 140 }}></button>{/key}
			</div>
			<div class="einfo">
				<span class="pn">{@render mi(school(eId), COL[SCHOOL_COLOR[school(eId)]])}<b>{spellOf(eId)?.name}</b></span>
				<div class="enavr">
					<button class="enav sm" on:click={() => eStep(-1)} aria-label="Previous" disabled={ether.length < 2}>‹</button>
					<small class="est">{eWhat(eId)} · {eIdx + 1} of {ether.length}</small>
					<button class="enav sm" on:click={() => eStep(1)} aria-label="Next" disabled={ether.length < 2}>›</button>
				</div>
				<div class="pips">{#each ether as id, i (id)}<button class="pip" class:on={i === eIdx} style="--c:{COL[SCHOOL_COLOR[school(id)] ?? 'gold']}" title={spellOf(id)?.name} aria-label={spellOf(id)?.name}
					on:pointerenter={(e) => { if (e.pointerType === 'mouse') eIdx = i }} on:click={() => (eIdx = i)}></button>{/each}</div>
			</div>
		</div>
	{:else}<em class="none">The ether is still — every spell is in the book.</em>{/if}
{/snippet}

{#if open}
	{#if !phone}
		<div class="sbw" role="dialog" aria-label="Spellbook">
			<div class="hd">
				<div class="tt"><img src={logo} alt="" /><b>{host ? `${host}'s spellbook` : 'Spellbook'}</b>{#if host}<span class="htag">Host</span>{/if}</div>
				<span class="meta"><b>{book.filter((x) => x !== 'wish').length}</b> in the book · <b>{ether.length}</b> in the ether{#if struck.length} · <b>{struck.length}</b> struck{/if}</span>
				{#if host}<span class="meta acting">{#if ult}Wishes <button class="wst" disabled={wishes <= 0} on:click={() => onWish(wishes - 1)}>−</button><b>{wishes}</b> of 3<button class="wst" disabled={wishes >= 2} on:click={() => onWish(wishes + 1)}>+</button>{:else}Tap a spell to move it{/if}</span>
				{:else}<span class="meta acting">{#if acting}Acting <b style="color:{COL[acting.color] ?? '#fff'}">{acting.name}</b>{:else}Browsing · nothing to invoke now{/if}</span>{/if}
				<button class="wx" on:click={() => (open = false)} aria-label="Close">✕</button>
			</div>
			<div class="tabs2">
				{#each tabs as [c, ss, label]}{@const n = tabCount(ss)}
					<button class="tab2" class:on={c === tab} style="--c:{tabCol(c)}" on:click={() => goTab(c)}><span class="ics">{#each ss as s}{@render mi(s, s === 'wish' ? COL.purple : COL[c])}{/each}</span><span class="tl">{label}</span><span class="lf">{n.left}/{n.all}</span>{#if n.can}<i class="dot"></i>{/if}</button>
				{/each}
			</div>
			<div class="sbody">
				<div class="slist">
					{#each curBody[1] as s}
						{#if s === 'wish'}{@render wishRow()}{:else}
							{@const ids = inSchool(s)}
							<div class="school">
								<div class="sh">{@render mi(s, COL[SCHOOL_COLOR[s]])}{cap(s)}<small>{ids.filter((x) => book.includes(x.id)).length} of {ids.length} in the book</small></div>
								<div class="srow">{#each ids as x}{@render spellBtn(x.id)}{/each}</div>
							</div>
						{/if}
					{/each}
				</div>
				{#if follow && !host}{@render followUp()}{:else}
					<div class="pv2">
						<div class="big" style="background-image:url({selSpell?.art})"></div>
						{#if selSpell}<div class="pn">{@render mi(school(sel), COL[SCHOOL_COLOR[school(sel)]])}<b>{selSpell.name}</b><small>{cap(school(sel))}</small></div>{/if}
						<div class="live">{#each numLine(nums(sel)) as t}<span>{t}</span>{/each}</div>
						<div class="why">{why}</div>
						{#if host}{#if sel !== 'wish' || ult}<button class="castbtn" class:out={book.includes(sel)} on:click={() => onFix(sel, !book.includes(sel))}>{book.includes(sel) ? 'Send to the ether' : 'Return to the book'}</button>{/if}
						{:else if options.includes(sel)}<button class="castbtn" class:on={picked === sel} on:click={() => onPick(picked === sel ? null : sel)}>{picked === sel ? 'Channelling · release it on the ring' : `Invoke ${selSpell?.name}`}</button>{/if}
					</div>
				{/if}
			</div>
			<div class="gone">
				<div class="gh"><b>The Ether</b><span class="gn">{ether.length}</span>{#if prepared}{@render scaling(false)}{/if}</div>
				{@render pile()}
			</div>
		</div>
	{:else}
		<div class="psheet" role="dialog" aria-label="Spellbook">
			<div class="ph"><img src={logo} alt="" /><b>{host ? `${host}'s book` : 'Spellbook'} · {book.filter((x) => x !== 'wish').length}</b>{#if host}{#if ult}<span class="pws"><button class="wst" disabled={wishes <= 0} on:click={() => onWish(wishes - 1)}>−</button>Wish {wishes}<button class="wst" disabled={wishes >= 2} on:click={() => onWish(wishes + 1)}>+</button></span>{/if}{:else if acting}<small style="color:{COL[acting.color] ?? '#fff'}">{acting.name}</small>{/if}<button class="wx" on:click={() => (open = false)} aria-label="Close">✕</button></div>
			<div class="ptabs">
				{#each tabs as [c, ss]}{@const n = tabCount(ss)}<button class:on={c === tab} style="--c:{tabCol(c)}" on:click={() => goTab(c)}>{#each ss as s}{@render mi(s, s === 'wish' ? COL.purple : COL[c])}{/each}{#if n.can}<i class="dot"></i>{/if}</button>{/each}
				<button class="gtab" class:on={tab === 'gone'} on:click={() => (tab = 'gone')}>Ether {ether.length}</button>
			</div>
			{#if follow && follow.kind !== 'strike' && !host}{@render followUp()}
			{:else if zoom}
				<button class="zoomed" style="background-image:url({selSpell?.art})" on:click={() => (zoom = false)} aria-label="Back"></button>
			{:else if tab === 'gone'}
				{#if prepared}{@render scaling(true)}{/if}
				{@render pile()}
			{:else}
				<div class="pgrid">
					{#each curBody[1] as s}
						{#if s === 'wish'}{#if ult}{@render spellBtn('wish')}{:else}<button class="sp wish locked" disabled style="background-image:url({spellOf('wish')?.art})"><span class="seal">{@render mi('wish', '#d9c2ff', 'big')}<em>Sealed</em></span></button>{/if}
						{:else}{#each inSchool(s) as x}{@render spellBtn(x.id)}{/each}{/if}
					{/each}
				</div>
			{/if}
			<!-- Find Familiar strikes from the grid itself: its bar sits under it -->
			{#if follow?.kind === 'strike' && !host}{@render followUp()}{/if}
			{#if (!follow || host) && tab !== 'gone'}
				<div class="pfoot"><span class="pn">{#if selSpell}{@render mi(school(sel), COL[SCHOOL_COLOR[school(sel)]])}<b>{selSpell.name}</b>{/if}<small>{numLine(nums(sel)).join(' · ')}</small></span>
					{#if host}{#if sel !== 'wish' || ult}<button class="castbtn" on:click={() => onFix(sel, !book.includes(sel))}>{book.includes(sel) ? 'To the ether' : 'To the book'}</button>{/if}
					{:else if options.includes(sel)}<button class="castbtn" on:click={() => onPick(picked === sel ? null : sel)}>{picked === sel ? 'Channelling' : 'Invoke'}</button>{:else}<small class="why">{zoom ? 'Tap to go back' : 'Tap again to read'}</small>{/if}</div>
			{/if}
		</div>
	{/if}
	<!-- the ether, large: ‹ › (← →) shuffle, Esc / a tap outside closes -->
	{#if eBig && eId}
		<div class="epv" class:ph={phone} role="dialog" tabindex="-1" aria-label="The ether" on:pointerdown|self={() => (eBig = false)}>
			<div class="epc">
				<div class="ebig" style="background-image:url({spellOf(eId)?.art})"></div>
				<div class="ebar">
					<button class="enav" on:click={() => eStep(-1)} aria-label="Previous">‹</button>
					<span class="pn">{@render mi(school(eId), COL[SCHOOL_COLOR[school(eId)]])}<b>{spellOf(eId)?.name}</b><small>{eWhat(eId)} · {eIdx + 1} / {ether.length}</small></span>
					<button class="enav" on:click={() => eStep(1)} aria-label="Next">›</button>
					<button class="wx" on:click={() => (eBig = false)} aria-label="Close">✕</button>
				</div>
			</div>
		</div>
	{/if}
{/if}
<svelte:window on:keydown|capture={eKey} />

<style>
	.mi { display: inline-block; flex: none; width: 18px; height: 18px; background: var(--ic, #fff); -webkit-mask: var(--m) center/contain no-repeat; mask: var(--m) center/contain no-repeat; }
	.mi.big { width: 34%; height: auto; aspect-ratio: 1; opacity: 0.85; }
	.sbw { width: 1060px; max-width: calc(100vw / var(--uis, 1) - 40px); display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; color: #f5f1e8;
		background: linear-gradient(180deg, rgba(16, 44, 72, 0.985), rgba(6, 21, 38, 0.99)); border: 1px solid rgba(216, 179, 106, 0.45); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65); pointer-events: auto; font-family: system-ui, sans-serif; }
	.hd { display: flex; align-items: center; gap: 8px 16px; }
	.tt { display: flex; align-items: center; gap: 8px; }
	.tt img { width: 26px; height: 26px; }
	.tt b { font-size: 19px; color: #f4dfa8; letter-spacing: 0.04em; }
	.meta { font-size: 12.5px; color: #8a9fb3; }
	.meta b { color: #f5f1e8; }
	.acting { margin-left: auto; }
	.wx { width: 30px; height: 30px; border-radius: 50%; border: 1px solid rgba(216, 179, 106, 0.4); background: rgba(2, 11, 22, 0.55); color: #f5f1e8; cursor: pointer; font: 700 14px system-ui; }
	.tabs2 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
	.tab2 { position: relative; display: flex; align-items: center; gap: 8px; justify-content: center; min-height: 42px; padding: 5px 10px; border-radius: 10px; background: rgba(2, 11, 22, 0.55); border: 1px solid rgba(255, 255, 255, 0.11); border-bottom: 3px solid var(--c); cursor: pointer; color: #bccbd9; font: 600 12.5px system-ui; min-width: 0; }
	.tab2.on { background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.1)); color: #fff; border-color: var(--c); }
	.ics { display: flex; gap: 4px; }
	.tl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
	.lf { font-size: 11px; color: #8a9fb3; margin-left: auto; }
	.dot { position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: #f4dfa8; box-shadow: 0 0 8px #d8b36a; }
	.sbody { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
	.slist { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
	.school { display: flex; flex-direction: column; gap: 6px; }
	.sh { display: flex; align-items: center; gap: 8px; font: 700 12px system-ui; letter-spacing: 0.14em; text-transform: uppercase; }
	.sh small { margin-left: auto; font: 500 12px system-ui; letter-spacing: 0; text-transform: none; color: #8a9fb3; }
	.srow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
	.sp { position: relative; aspect-ratio: 1192 / 831; border-radius: 9px; background: #000 center/cover; border: 2px solid transparent; padding: 0; cursor: pointer; transition: transform 0.15s; }
	.sp:hover { transform: translateY(-2px); }
	.sp.dim { filter: brightness(0.62) saturate(0.75); }
	.sp.out { filter: grayscale(1) brightness(0.42); }
	.sp.can { border-color: #d8b36a; box-shadow: 0 0 0 1px #000, 0 0 12px rgba(244, 223, 168, 0.55); }
	.sp.pk { border-color: #fff; box-shadow: 0 0 0 2px #d8b36a, 0 0 18px rgba(244, 223, 168, 0.8); }
	.sp.sel { outline: 2px solid #fff; outline-offset: 1px; }
	.sp.tick { border-color: #41ae59; filter: none; box-shadow: 0 0 0 1px #000, 0 0 12px rgba(65, 174, 89, 0.7); }
	.tag { position: absolute; right: 6px; bottom: 6px; padding: 1px 6px; border-radius: 5px; font: 700 10px/14px system-ui; letter-spacing: 0.06em; text-transform: uppercase; background: rgba(0, 0, 0, 0.78); color: #bccbd9; }
	.tag.cc { background: #d8b36a; color: #1b1204; }
	.tag.tk { background: #41ae59; color: #04140a; }
	.wishrow { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; align-items: center; }
	.arc { display: flex; align-items: center; justify-content: center; min-width: 0; }
	.arcsv { width: 100%; max-height: 130px; }
	.arcsv.live { animation: gybreathe 4s ease-in-out infinite; }
	@keyframes gybreathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
	.sp.wish.locked { cursor: not-allowed; }
	.sp.wish.locked::before { content: ''; position: absolute; inset: 0; background: linear-gradient(160deg, rgba(40, 20, 70, 0.93), rgba(14, 8, 30, 0.97)); border-radius: 7px; }
	.seal { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
	.sring { position: absolute; width: 62%; aspect-ratio: 1; border-radius: 50%; border: 1.5px dashed rgba(201, 162, 255, 0.55); }
	.seal em { font: 700 10px system-ui; letter-spacing: 0.2em; text-transform: uppercase; color: #d9c2ff; font-style: normal; }
	.pv2, .fu { display: flex; flex-direction: column; gap: 9px; }
	.big { border-radius: 12px; aspect-ratio: 1192 / 831; background: #000 center/cover; border: 1px solid rgba(216, 179, 106, 0.4); }
	.pn { display: flex; align-items: center; gap: 8px; }
	.pn b { font-size: 16px; }
	.pn small { margin-left: auto; color: #8a9fb3; font-size: 12px; }
	.live { display: flex; flex-wrap: wrap; gap: 6px; min-height: 22px; }
	.live span { font-size: 12px; padding: 3px 9px; border-radius: 99px; background: rgba(216, 179, 106, 0.13); border: 1px solid rgba(216, 179, 106, 0.38); color: #f4dfa8; }
	.why { font-size: 13px; color: #bccbd9; min-height: 2.6em; }
	.castbtn { align-self: flex-start; padding: 9px 18px; border-radius: 99px; background: #d8b36a; color: #1b1204; font: 700 14px system-ui; border: 0; cursor: pointer; }
	.castbtn.on { background: #f4dfa8; }
	.ghost { padding: 8px 14px; border-radius: 99px; background: none; color: #bccbd9; border: 1px solid rgba(255, 255, 255, 0.2); font: 600 13px system-ui; cursor: pointer; }
	.fh { display: flex; align-items: center; gap: 8px; }
	.fh b { font-size: 17px; }
	.fh small { color: #8a9fb3; font-size: 12px; }
	.fu p { margin: 0; font-size: 13px; color: #bccbd9; }
	.fbtns { display: flex; gap: 8px; }
	.faces { display: flex; flex-wrap: wrap; gap: 10px; }
	.fc { display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: 0; color: #f5f1e8; cursor: pointer; font: 600 11px system-ui; }
	.face { width: 54px; height: 54px; border-radius: 50%; border: 2px solid #2f7fe6; background-size: cover; display: block; }
	.fc:hover .face { border-color: #d8b36a; }
	.none { font-size: 12.5px; color: #8a9fb3; }
	.disc { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.cd { padding: 0; border: 0; background: none; cursor: pointer; }
	.cd :global(.cardface) { width: 100%; height: auto; display: block; border-radius: 6px; }
	.gone { border-top: 1px solid rgba(216, 179, 106, 0.38); padding-top: 9px; display: flex; flex-direction: column; gap: 8px; }
	.gh { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
	.gh > b { font-size: 13px; color: #f4dfa8; letter-spacing: 0.04em; }
	.gn { min-width: 22px; height: 20px; padding: 0 7px; border-radius: 10px; background: #d8b36a; color: #1b1204; font: 800 12px/20px system-ui; text-align: center; }
	.gx2 { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
	.gx2 i { display: inline-flex; align-items: center; gap: 6px; font: 500 12px system-ui; font-style: normal; color: #bccbd9; padding: 3px 10px 3px 6px; border-radius: 99px; background: rgba(2, 11, 22, 0.55); border: 1px solid rgba(255, 255, 255, 0.11); }
	.gx2 i :global(.mi) { width: 14px; height: 14px; }
	.gx2 b { color: #f5f1e8; }
	/* the ether: a tidy deck + pips */
	.erow { display: flex; align-items: center; gap: 22px; min-height: 104px; }
	.deck { position: relative; flex: none; width: 128px; aspect-ratio: 1192 / 831; margin: 0 12px 0 0; }
	.edge { position: absolute; inset: 0; border-radius: 7px; background: linear-gradient(135deg, #2a1f44, #120d22); border: 1px solid rgba(185, 140, 245, 0.35);
		transform: translate(calc(var(--k) * 4px), calc(var(--k) * -4px)); opacity: calc(1 - var(--k) * 0.22); z-index: calc(4 - var(--k)); }
	.ecard { position: absolute; inset: 0; z-index: 5; padding: 0; border-radius: 7px; background: #000 center/cover; border: 1px solid rgba(216, 179, 106, 0.75); cursor: zoom-in;
		box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55), 0 0 14px rgba(185, 140, 245, 0.25); }
	.einfo { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
	.einfo .pn b { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.enavr { display: flex; align-items: center; gap: 8px; }
	.est { font-size: 12px; color: #c9b4ef; min-width: 0; white-space: nowrap; }
	.enav.sm { width: 26px; height: 26px; font-size: 17px; padding: 0 0 2px; }
	.enav:disabled { opacity: 0.3; cursor: default; }
	.pips { display: flex; flex-wrap: wrap; gap: 5px; max-width: 330px; }
	.pip { width: 9px; height: 9px; padding: 0; border-radius: 50%; border: 0; background: var(--c); opacity: 0.4; cursor: pointer; transition: transform 0.12s, opacity 0.12s; }
	.pip.on { opacity: 1; transform: scale(1.45); box-shadow: 0 0 0 1.5px #0b1422, 0 0 6px var(--c); }
	.htag { font: 700 10px/16px system-ui; letter-spacing: 0.12em; text-transform: uppercase; padding: 0 7px; border-radius: 5px; background: #d8b36a; color: #1b1204; }
	.wst { width: 22px; height: 22px; margin: 0 5px; border-radius: 50%; border: 1px solid rgba(216, 179, 106, 0.5); background: rgba(2, 11, 22, 0.55); color: #f4dfa8; font: 700 13px/1 system-ui; cursor: pointer; padding: 0; }
	.wst:disabled { opacity: 0.35; cursor: default; }
	.castbtn.out { background: rgba(185, 140, 245, 0.2); color: #e3d3ff; border: 1px solid rgba(185, 140, 245, 0.6); }
	.epv { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgba(2, 8, 16, 0.72); pointer-events: auto; }
	.epc { width: 860px; max-width: calc(100vw / var(--uis, 1) - 60px); display: flex; flex-direction: column; gap: 10px; }
	.ebig { width: 100%; aspect-ratio: 1192 / 831; border-radius: 16px; background: #000 center/contain no-repeat; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(185, 140, 245, 0.25); }
	.ebar { display: flex; align-items: center; gap: 12px; color: #f5f1e8; }
	.ebar .pn { flex: 1; justify-content: center; }
	.ebar .pn small { margin-left: 8px; color: #c9b4ef; }
	.enav { width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(216, 179, 106, 0.5); background: rgba(2, 11, 22, 0.75); color: #f4dfa8; font: 700 24px/1 system-ui; cursor: pointer; padding: 0 0 3px; }
	.epv.ph .epc { width: calc(100vw - 20px); max-width: none; }
	.epv.ph .ebar .pn b { font-size: 13px; }
	/* phone sheet */
	.psheet { display: flex; flex-direction: column; gap: 7px; padding: 10px 10px 12px; color: #f5f1e8; font-family: system-ui, sans-serif; pointer-events: auto;
		background: linear-gradient(180deg, #0f2a44, #06182a); border-top: 1px solid rgba(216, 179, 106, 0.45); border-radius: 16px 16px 0 0; }
	.ph { display: flex; align-items: center; gap: 8px; }
	.ph img { width: 22px; height: 22px; }
	.ph b { font-size: 14px; color: #f4dfa8; }
	.ph small { font-size: 11px; }
	.ph .wx { margin-left: auto; width: 28px; height: 28px; }
	.pws { display: inline-flex; align-items: center; font-size: 12px; color: #e3d3ff; }
	.psheet .erow { gap: 10px; }
	.psheet .deck { width: 118px; margin-right: 10px; }
	.psheet .pip { width: 11px; height: 11px; }
	.psheet .pips { gap: 6px; }
	.psheet .einfo .pn b { font-size: 13px; }
	.ptabs { display: flex; gap: 4px; }
	.ptabs button { position: relative; flex: 1; height: 32px; border-radius: 7px; background: rgba(2, 11, 22, 0.55); border: 0; border-bottom: 3px solid var(--c, #d8b36a); display: flex; gap: 4px; align-items: center; justify-content: center; cursor: pointer; }
	.ptabs button.on { background: rgba(255, 255, 255, 0.1); }
	.ptabs .gtab { flex: 0.9; font: 800 11px system-ui; color: #f4dfa8; letter-spacing: 0.04em; }
	.ptabs .dot { top: 3px; right: 3px; }
	.pgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
	.pgrid .tag { font-size: 8px; line-height: 11px; padding: 0 4px; right: 3px; bottom: 3px; }
	.pgrid .seal em { font-size: 8px; }
	.pfoot { display: flex; align-items: center; gap: 8px; min-height: 40px; }
	.pfoot .pn { flex: 1; min-width: 0; flex-wrap: wrap; gap: 2px 6px; }
	.pfoot .pn b { font-size: 13px; }
	.pfoot .pn small { margin-left: 0; font-size: 11px; color: #8a9fb3; flex-basis: 100%; }
	.pfoot .castbtn { padding: 8px 16px; font-size: 13px; }
	.pfoot .why { min-height: 0; font-size: 11px; color: #8a9fb3; }
	.zoomed { width: 100%; aspect-ratio: 1192 / 831; border-radius: 10px; background: #000 center/cover; border: 1px solid rgba(216, 179, 106, 0.4); padding: 0; }
	.ph2 { margin-left: 0; }
	.ph2 i { font-size: 11px; padding: 2px 8px; }
	.psheet .face { width: 44px; height: 44px; }
	.psheet .disc { grid-template-columns: repeat(4, minmax(0, 1fr)); }
</style>
