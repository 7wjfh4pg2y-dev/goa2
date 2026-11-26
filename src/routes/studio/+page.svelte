<script lang="ts">
	// GM tools → ANIMATION STUDIO: every sprite animation we have, in one player. The library (static/anim/library.json,
	// written by tools/sprites/studio.mjs) holds the GoA2 heroes built by the sprite engine (the shared animation set:
	// Idle · Run · Attack · Jump · Hit · Defeat, plus their raw strips), the ten base packs (one clip per strip) and the
	// CraftPix preview reels (one clip per reel), and those reels cut into characters and their actions (kind 'unique' =
	// a pack's own characters, 'general' = the generic prototype figures and effects; cuts in tools/sprites/reels.json). A clip = steps {s: sheet, f: frame, d: length in frames at the clip's
	// fps, kx: knockback px, flash: true white | n red, air: in the jump arc (H = its height)}. GMs only (role.ts).
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { goBack } from '$lib/nav';
	import { role } from '$lib/role';
	import Icon from '$lib/ui/Icon.svelte';

	type Step = { s: string; f: number; d: number; off?: boolean; kx?: number; flash?: boolean | number; air?: number; guard?: boolean; wx?: number; wy?: number };
	type Clip = { id: string; name: string; fps: number; loop: boolean; H?: number; raw?: boolean; steps: Step[] };
	type Sheet = { src: string; fw: number; fh: number; n: number; cols: number };
	type Entry = { id: string; kind: 'hero' | 'unique' | 'general' | 'pack' | 'reel'; name: string; sub: string; blurb?: string; credit?: string; chips?: [string, string][]; px?: number; glow?: string; ax: number; ay: number; bodyH: number; scale?: number; sheets: Record<string, Sheet>; clips: Clip[] };

	const GROUPS: [Entry['kind'], string][] = [['hero', 'GoA2 heroes'], ['unique', 'Characters'], ['general', 'General'], ['pack', 'Base packs'], ['reel', 'Whole reels']];
	const BGS = [['dark', 'Night'], ['light', 'Day'], ['check', 'Checker'], ['grass', 'Grass']] as const;
	const SPEEDS = [0.25, 0.5, 1, 2];
	const ZOOMS = [0, 1, 2, 3, 4, 6, 8]; // 0 = fit

	let entries: Entry[] = [];
	let failed = false;
	let q = '';
	let entry: Entry | null = null;
	let clip: Clip | null = null;
	let imgs: Record<string, HTMLImageElement> = {};
	let ready = false;
	let i = 0, t = 0, playing = true, done = false, speed = 1, zoom = 0, flip = false, onion = false, ground = true;
	let bg: (typeof BGS)[number][0] = 'dark';
	let shake = 0, shook = false;
	let sparks: { x: number; y: number; vx: number; vy: number; life: number; c: string }[] = [];
	let cv: HTMLCanvasElement, strip: HTMLDivElement;
	let raf = 0, last = 0;
	let fpsShown = 0;

	// FRAME EDITS (the user, 2026-11-26): any clip's steps can be switched off, reordered, duplicated, deleted and held
	// longer / shorter. Kept per browser in localStorage (`goa2-studio-edit:<entry>:<clip>`), laid over the library's
	// clip; Reset drops them, Copy steps hands the edited list over (paste it to Claude to make it the real one).
	let editing = false, edited = new Set<string>(), copied = false, dragFrom = -1, dragOver = -1;
	const ekey = (e: Entry, c: Clip) => `edit:${e.id}:${c.id}`;
	const clean = (st: Step[]) => st.map((x) => ({ ...x }));
	const P = (k: string) => { try { return localStorage.getItem('goa2-studio-' + k); } catch { return null; } };
	const S = (k: string, v: string) => { try { localStorage.setItem('goa2-studio-' + k, v); } catch { /* ignore */ } };

	$: list = entries.filter((e) => !q.trim() || (e.name + ' ' + e.sub).toLowerCase().includes(q.trim().toLowerCase()));
	$: clipCount = entries.reduce((n, e) => n + e.clips.length, 0);
	$: shaped = entry && clip ? clip.steps : [];

	onMount(async () => {
		try {
			const r = await fetch(`${base}/anim/library.json`);
			entries = (await r.json()).entries;
		} catch { failed = true; return; }
		editing = P('editing') === '1';
		const want = new URLSearchParams(location.search).get('e') || P('entry');
		bg = (P('bg') as typeof bg) || 'dark';
		await choose(entries.find((e) => e.id === want) ?? entries[0], new URLSearchParams(location.search).get('c') || P('clip'));
		last = performance.now();
		raf = requestAnimationFrame(tick);
	});
	onDestroy(() => { if (raf) cancelAnimationFrame(raf); });

	const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `${base}/anim/${src}`; });
	async function choose(e: Entry | undefined, clipId?: string | null) {
		if (!e) return;
		entry = e; ready = false; S('entry', e.id);
		edited = new Set(e.clips.filter((c) => P(ekey(e, c))).map((c) => c.id));
		const got = await Promise.all(Object.entries(e.sheets).map(async ([k, s]) => [k, await load(s.src).catch(() => null)] as const));
		if (entry !== e) return;
		imgs = Object.fromEntries(got.filter(([, v]) => v)) as Record<string, HTMLImageElement>;
		ready = true;
		pickClip(e.clips.find((c) => c.id === clipId) ?? e.clips[0]);
	}
	function pickClip(c: Clip) {
		let steps = clean(c.steps);
		if (entry) try { const v = JSON.parse(P(ekey(entry, c)) || 'null'); if (Array.isArray(v) && v.length) steps = v; } catch { /* ignore */ }
		clip = { ...c, steps }; i = 0; t = 0; done = false; playing = true; sparks = []; shake = 0; S('clip', c.id);
		requestAnimationFrame(drawStrip);
	}
	function stepBy(d: number) {
		if (!clip) return;
		const n = clip.steps.length;
		playing = false; done = false; i = (i + d + n) % n; t = 0;
	}
	const onCount = (c: Clip) => c.steps.filter((x) => !x.off).length;
	/** the original library clip of the open one */
	const orig = () => entry?.clips.find((c) => c.id === clip?.id);
	function commit(steps: Step[], sel = i) {
		if (!clip || !entry) return;
		clip = { ...clip, steps };
		i = Math.max(0, Math.min(steps.length - 1, sel)); t = 0; done = false;
		const o = orig(), k = ekey(entry, clip);
		if (o && JSON.stringify(clean(o.steps)) === JSON.stringify(steps)) { try { localStorage.removeItem('goa2-studio-' + k); } catch { /* ignore */ } edited.delete(clip.id); }
		else { S(k, JSON.stringify(steps)); edited.add(clip.id); }
		edited = edited;
		requestAnimationFrame(drawStrip);
	}
	const ed = {
		toggle: (k: number) => { if (!clip) return; const st = clean(clip.steps); st[k].off = !st[k].off; if (!st[k].off) delete st[k].off; commit(st, k); },
		move: (k: number, to: number) => { if (!clip || to < 0 || to >= clip.steps.length || to === k) return; const st = clean(clip.steps); const [x] = st.splice(k, 1); st.splice(to, 0, x); commit(st, to); },
		dup: (k: number) => { if (!clip) return; const st = clean(clip.steps); st.splice(k + 1, 0, { ...st[k] }); commit(st, k + 1); },
		del: (k: number) => { if (!clip || clip.steps.length < 2) return; const st = clean(clip.steps); st.splice(k, 1); commit(st, Math.min(k, st.length - 1)); },
		hold: (k: number, by: number) => { if (!clip) return; const st = clean(clip.steps); st[k].d = Math.max(1, Math.min(30, st[k].d + by)); commit(st, k); },
		reset: () => { const o = orig(); if (o) commit(clean(o.steps), 0); }
	};
	function setEditing(v: boolean) { editing = v; S('editing', v ? '1' : '0'); requestAnimationFrame(drawStrip); }
	async function copySteps() {
		if (!clip || !entry) return;
		const txt = JSON.stringify({ entry: entry.id, clip: clip.id, steps: clip.steps.filter((x) => !x.off).map(({ off, ...x }) => x) });
		try { await navigator.clipboard.writeText(txt); } catch { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* ignore */ } ta.remove(); }
		copied = true; setTimeout(() => (copied = false), 1600);
	}
	function onDrop(k: number) { if (dragFrom >= 0) ed.move(dragFrom, k); dragFrom = dragOver = -1; }
	function toggle() { if (done) { done = false; i = 0; } playing = !playing; }
	function setBg(b: typeof bg) { bg = b; S('bg', b); }

	// one parabola across the airborne steps
	function liftAt(c: Clip, k: number, tt: number, fps: number) {
		if (!c.H || !c.steps[k]?.air) return 0;
		let total = 0, before = 0;
		c.steps.forEach((s, j) => { if (s.air && !s.off) { total += s.d; if (j < k) before += s.d; } });
		const p = Math.min(1, (before + Math.min(tt * fps, c.steps[k].d)) / total);
		return c.H * 4 * p * (1 - p);
	}

	function tick(now: number) {
		const dt = Math.min(0.05, (now - last) / 1000); last = now;
		if (clip && ready) { advance(dt); draw(dt); }
		raf = requestAnimationFrame(tick);
	}
	function advance(dt: number) {
		if (!clip || !playing || done || !onCount(clip)) return;
		const st = clip.steps, fps = clip.fps * speed;
		// switched-off frames are skipped
		const first = st.findIndex((x) => !x.off), lastOn = st.length - 1 - [...st].reverse().findIndex((x) => !x.off);
		if (st[i]?.off) { i = first; t = 0; }
		t += dt;
		while (t >= st[i].d / fps) {
			t -= st[i].d / fps;
			do i++; while (i < st.length && st[i].off);
			if (i >= st.length) {
				if (clip.loop) i = first;
				else { i = lastOn; done = true; t = 0; const c = clip; setTimeout(() => { if (clip === c && done && playing) { i = first; done = false; } }, 1800); return; }
			}
		}
	}

	const off = typeof document !== 'undefined' ? document.createElement('canvas') : null;
	function frameRect(sh: Sheet, f: number) { return [(f % sh.cols) * sh.fw, Math.floor(f / sh.cols) * sh.fh, sh.fw, sh.fh] as const; }

	function draw(dt: number) {
		if (!cv || !entry || !clip) return;
		const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
		const W = Math.round(r.width * dpr), Ht = Math.round(r.height * dpr);
		if (cv.width !== W || cv.height !== Ht) { cv.width = W; cv.height = Ht; }
		const ctx = cv.getContext('2d'); if (!ctx) return;
		ctx.clearRect(0, 0, W, Ht); ctx.imageSmoothingEnabled = false;
		const e = entry, c = clip, cur = c.steps[i], sh = e.sheets[cur.s], im = imgs[cur.s];
		if (!sh || !im) return;
		const reel = e.kind === 'reel' || e.kind === 'unique' || e.kind === 'general', px = e.px || 1;
		// the view: a character-sized box for heroes / packs (every one the same height on screen), the frame for reels
		// heroes: ONE pixel scale for all, so heads, arms and bodies match and true heights show (sized from the tallest
		// hero + highest jump); a pack drawn at another scale carries a whole-number `scale` (base.mjs) to match the rest
		const hs = e.kind === 'hero' ? entries.filter((x) => x.kind === 'hero') : [e], k = e.scale || 1;
		const bh = Math.max(...hs.map((x) => x.bodyH * (x.scale || 1))), jh = Math.max(0, ...hs.flatMap((x) => x.clips.map((y) => (y.H || 0) * (x.scale || 1))));
		const vw = reel ? sh.fw + 8 : bh * 2.7, vh = reel ? sh.fh + 8 : bh * 1.75 + jh;
		// heroes ROUND to the nearest step (the stage height shifts a little with each hero's chip rows; flooring put
		// two heroes on different scales); everything else floors so it always fits
		const fit = e.kind === 'hero' ? Math.max(1, Math.round(Math.min(W / vw, Ht / vh) * 0.94)) * k : Math.max(1, Math.floor(Math.min(W / vw, Ht / vh) * 0.94));
		const s = zoom ? Math.max(0.5, (zoom * dpr) / px) : fit;
		const groundY = reel ? Math.round(Ht / 2 + (sh.fh / 2 - (sh.fh - e.ay)) * s) : Math.round(Ht * 0.74);
		const up = Math.round(liftAt(c, i, t, c.fps * speed));
		if (cur.flash && t < 0.03 && !shook) { const p = cur.flash === true ? 1 : +cur.flash; shake = p; shook = true; burst(e, p); }
		if (!cur.flash) shook = false;
		shake = Math.max(0, shake - dt * 4);
		const fl = flip ? -1 : 1, cx = W / 2;
		const kx = (cur.kx || 0) * fl, shx = shake ? Math.round((Math.random() - 0.5) * 3 * shake) * s : 0, shy = shake ? Math.round((Math.random() - 0.5) * 2 * shake) * s : 0;
		const ox = Math.round(cx - e.ax * s) + kx * s + shx, oy = Math.round(groundY - e.ay * s - up * s + shy);
		if (ground) {
			ctx.fillStyle = bg === 'light' || bg === 'check' ? 'rgba(20,30,50,.25)' : 'rgba(255,230,170,.18)';
			ctx.fillRect(0, groundY, W, Math.max(1, dpr));
			if (!reel) { const k = 1 - Math.min(0.55, up / (e.bodyH * 1.15)); ctx.fillStyle = `rgba(0,0,0,${0.3 * k})`; ctx.beginPath(); ctx.ellipse(cx, groundY + s * 0.5, e.bodyH * 0.4 * s * k, e.bodyH * 0.075 * s * k, 0, 0, Math.PI * 2); ctx.fill(); }
		}
		const mirror = () => { if (flip) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); } };
		const drawStep = (step: Step, alpha: number) => {
			const ss = e.sheets[step.s], ii = imgs[step.s]; if (!ss || !ii) return;
			const [sx, sy, sw, shh] = frameRect(ss, step.f);
			ctx.save(); ctx.globalAlpha = alpha; mirror(); ctx.drawImage(ii, sx, sy, sw, shh, ox, oy, sw * s, shh * s); ctx.restore();
		};
		if (onion && c.steps.length > 1) { const n = c.steps.length; drawStep(c.steps[(i - 1 + n) % n], 0.22); drawStep(c.steps[(i + 1) % n], 0.12); }
		drawStep(cur, cur.off ? 0.35 : 1);
		if (cur.flash && off) { // the hit: the silhouette flashes (white = hit, red = the killing blow), fading over the step
			const f = Math.max(0, 1 - (t * c.fps * speed) / cur.d), o = off.getContext('2d');
			const [sx, sy, sw, shh] = frameRect(sh, cur.f);
			if (o) {
				off.width = sw; off.height = shh;
				o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, sw, shh); o.drawImage(im, sx, sy, sw, shh, 0, 0, sw, shh);
				o.globalCompositeOperation = 'source-atop'; o.fillStyle = cur.flash === true ? '#fff4ea' : '#ff2a2a'; o.fillRect(0, 0, sw, shh);
				ctx.save(); ctx.globalAlpha = 0.8 * Math.max(f, 0.25); mirror(); ctx.drawImage(off, ox, oy, sw * s, shh * s); ctx.restore();
			}
		}
		if (cur.guard) { // Defend: a pixel ward in the hero's own colour in front of them, swelling in
			const k = Math.min(1, (t * c.fps * speed) / cur.d + 0.35), wc = ward(e);
			// posed Defend: in front of the raised palm (wx / wy from the library), else just in front of the body
			const wx = cur.wx ?? Math.round(e.ax + e.bodyH * 0.12), wy = Math.round((cur.wy ?? e.ay - e.bodyH * 0.5) - (wc.height - 1) / 2);
			ctx.save(); ctx.globalAlpha = k; mirror(); ctx.drawImage(wc, ox + wx * s, oy + wy * s, wc.width * s, wc.height * s); ctx.restore();
		}
		if (sparks.length) {
			ctx.save(); mirror();
			for (let k = sparks.length - 1; k >= 0; k--) {
				const p = sparks[k]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt;
				ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3)); ctx.fillStyle = p.c;
				ctx.fillRect(Math.round(ox + p.x * s), Math.round(oy + p.y * s), Math.ceil(s), Math.ceil(s));
				if (p.life <= 0) sparks.splice(k, 1);
			}
			ctx.restore();
		}
		fpsShown = Math.round(c.fps * speed * 10) / 10;
		// keep the live frame in view on the strip
		if (strip && playing) { const b = strip.children[i] as HTMLElement | undefined; if (b && (b.offsetLeft < strip.scrollLeft || b.offsetLeft + b.offsetWidth > strip.scrollLeft + strip.clientWidth)) strip.scrollLeft = b.offsetLeft - 8; }
		i = i; // refresh the counter / strip highlight
	}

	// the Defend ward as PIXELS at sprite scale (a crescent shield: rim in the hero's colour, a white inner glint,
	// a checker-dithered fill) — the same pixel art as the sprite, never a smooth vector shape
	function wardCanvas(h: number, glow: string) {
	const R = Math.max(6, Math.round(h * 0.46)), A = Math.max(3, Math.round(R * 0.42)), W = A + 2, Hh = 2 * R + 1;
	const c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d') as CanvasRenderingContext2D;
	const put = (px: number, py: number, col: string, a: number) => { x.globalAlpha = a; x.fillStyle = col; x.fillRect(px, py, 1, 1); };
	for (let dy = -R; dy <= R; dy++) {
		const o = Math.round(A * Math.sqrt(Math.max(0, 1 - (dy / R) ** 2))), y = dy + R;
		for (let dx = 0; dx < o; dx++) if ((dx + y) % 2 === 0) put(dx, y, glow, 0.35);
		put(o, y, glow, 1); if (o > 0) put(o - 1, y, glow, 0.8);
		if (Math.abs(dy) < R * 0.7 && o > 2) put(o - 2, y, '#ffffff', 0.85);
	}
	return c;
}
	const wards = new Map<string, HTMLCanvasElement>();
	const ward = (e: Entry) => { let w = wards.get(e.id); if (!w) { w = wardCanvas(e.bodyH, e.glow || '#9fd8ff'); wards.set(e.id, w); } return w; };
	function burst(e: Entry, p: number) {
		const x = e.ax + 6, y = e.ay - e.bodyH * 0.7, cols = p > 1 ? ['#ff3030', '#ff7a5a', '#ffffff', '#b81414'] : ['#ffffff', '#ffd9a0', '#ff8a4a'];
		for (let k = 0; k < 14 * p * p; k++) sparks.push({ x: x + Math.random() * 4, y: y + Math.random() * 6, vx: (-20 - Math.random() * 50) * p, vy: (-30 - Math.random() * 40) * p, life: 0.35 + Math.random() * 0.3, c: cols[k % cols.length] });
	}

	// the frame strip: one small canvas per step
	function drawStrip() {
		if (!strip || !entry || !clip) return;
		const e = entry;
		strip.querySelectorAll('canvas').forEach((c, k) => {
			const st = clip?.steps[k]; if (!st) return;
			const sh = e.sheets[st.s], im = imgs[st.s]; if (!sh || !im) return;
			// heroes / packs: the box round the character; reels: the whole frame
			const reel = e.kind === 'reel' || e.kind === 'unique' || e.kind === 'general';
			const bw = reel ? sh.fw : Math.min(sh.fw, Math.round(e.bodyH * 2.2)), bh = reel ? sh.fh : Math.min(sh.fh, Math.round(e.bodyH * 1.5));
			const bx = reel ? 0 : Math.max(0, Math.min(sh.fw - bw, Math.round(e.ax - bw / 2))), by = reel ? 0 : Math.max(0, Math.min(sh.fh - bh, e.ay - bh + 2));
			c.width = bw; c.height = bh;
			const x = c.getContext('2d'); if (!x) return;
			x.imageSmoothingEnabled = false;
			const [sx, sy] = frameRect(sh, st.f);
			x.drawImage(im, sx + bx, sy + by, bw, bh, 0, 0, bw, bh);
			c.style.width = Math.round((bw * 60) / bh) + 'px';
		});
	}

	function onKey(ev: KeyboardEvent) {
		const tg = ev.target as HTMLElement;
		if (!clip || !entry || tg?.tagName === 'INPUT') return;
		const k = ev.key.toLowerCase();
		if (k === ' ') { ev.preventDefault(); toggle(); }
		else if (k === 'arrowleft') stepBy(-1);
		else if (k === 'arrowright') stepBy(1);
		else if (k === 'arrowup' || k === 'arrowdown') {
			ev.preventDefault();
			const cs = entry.clips, j = cs.findIndex((c) => c.id === clip?.id);
			pickClip(cs[(j + (k === 'arrowdown' ? 1 : -1) + cs.length) % cs.length]);
		} else if (k === 'f') flip = !flip;
		else if (k === 'o') onion = !onion;
		else if (k === 'g') ground = !ground;
		else if (editing && !ev.ctrlKey && !ev.metaKey) { // frame edits on the picked frame
			if (k === 'e') ed.toggle(i);
			else if (k === 'd') ed.dup(i);
			else if (k === 'delete' || k === 'backspace') { ev.preventDefault(); ed.del(i); }
			else if (k === '[' || k === ',') ed.move(i, i - 1);
			else if (k === ']' || k === '.') ed.move(i, i + 1);
			else if (k === '-') ed.hold(i, -1);
			else if (k === '+' || k === '=') ed.hold(i, 1);
		}
	}
</script>

<svelte:window on:keydown={onKey} />
<svelte:head><title>Animation studio · GoA2</title></svelte:head>

{#if $role !== 'admin'}
	<div class="st tide"><section class="panel lock"><h1 class="t-h1">Animation studio</h1><p class="t-body c-muted">GMs only.</p><button class="btn btn-ghost" on:click={() => goBack('adminhub')}><Icon name="back" /> Back</button></section></div>
{:else}
	<div class="st tide">
		<header class="bar">
			<button class="btn btn-ghost bk" on:click={() => goBack('adminhub')} aria-label="Back"><Icon name="back" /></button>
			<h1>Animation studio</h1>
			<span class="cnt">{entries.length} sets · {clipCount} animations</span>
		</header>
		{#if failed}
			<p class="msg">The library couldn't be loaded.</p>
		{:else}
			<div class="body">
				<aside class="lib">
					<input class="search" placeholder="Search" bind:value={q} aria-label="Search animations" />
					<div class="list">
						{#each GROUPS as [kind, label]}
							{@const rows = list.filter((e) => e.kind === kind)}
							{#if rows.length}
								<div class="gh">{label} <span>{rows.length}</span></div>
								{#each rows as e (e.id)}
									<button class="row" class:on={entry?.id === e.id} on:click={() => choose(e)}>
										<span class="nm">{e.name}</span>
										<span class="sb">{e.kind === 'reel' ? e.sub.replace('Preview reel · ', '') : `${e.clips.length}`}</span>
									</button>
								{/each}
							{/if}
						{/each}
					</div>
				</aside>

				<main class="main">
					{#if entry}
						<div class="head">
							<div class="ttl">
								<h2>{entry.name}</h2>
								<p>{entry.sub}{entry.credit ? ` · Art: ${entry.credit}` : ''}</p>
							</div>
							{#if entry.chips?.length}
								<div class="chips">{#each entry.chips as [n, c]}<span class="chip"><i style:background={c}></i>{n}</span>{/each}</div>
							{/if}
						</div>
						<div class="clips" role="tablist">
							{#each entry.clips as c (c.id)}
								<button role="tab" class="cb" class:raw={c.raw} class:ed={edited.has(c.id)} aria-selected={clip?.id === c.id} on:click={() => pickClip(c)} title={edited.has(c.id) ? 'Edited on this browser' : ''}>{c.name}<small>{clip?.id === c.id ? onCount(clip) : c.steps.length}</small></button>
							{/each}
						</div>
						<div class="stage bg-{bg}">
							<canvas bind:this={cv}></canvas>
							{#if !ready}<span class="ld">Loading…</span>{/if}
							<span class="fc">{clip ? `${i + 1} / ${clip.steps.length}` : ''}{done ? ' · end' : ''}</span>
						</div>
						<div class="ctl">
							<div class="grp">
								<button class="ib" on:click={() => stepBy(-1)} aria-label="Previous frame" title="Previous frame (←)">‹</button>
								<button class="ib play" on:click={toggle} aria-label={playing && !done ? 'Pause' : 'Play'} title="Play / pause (Space)">{playing && !done ? '❚❚' : '▶'}</button>
								<button class="ib" on:click={() => stepBy(1)} aria-label="Next frame" title="Next frame (→)">›</button>
							</div>
							<div class="grp" aria-label="Speed">
								{#each SPEEDS as v}<button class="sg" aria-pressed={speed === v} on:click={() => (speed = v)}>{v}×</button>{/each}
								<span class="fps">{clip?.fps === 100 ? (speed === 1 ? 'GIF timing' : speed + '× GIF') : fpsShown + ' fps'}</span>
							</div>
							<div class="grp" aria-label="Zoom">
								{#each ZOOMS as z}<button class="sg" aria-pressed={zoom === z} on:click={() => (zoom = z)}>{z ? z + '×' : 'Fit'}</button>{/each}
							</div>
							<div class="grp">
								<button class="sg" aria-pressed={flip} on:click={() => (flip = !flip)} title="Face the other way (F)">Flip</button>
								<button class="sg" aria-pressed={onion} on:click={() => (onion = !onion)} title="Onion skin (O)">Onion</button>
								<button class="sg" aria-pressed={ground} on:click={() => (ground = !ground)} title="Ground line (G)">Ground</button>
							</div>
							<div class="grp">
								<button class="sg" aria-pressed={editing} on:click={() => setEditing(!editing)} title="Edit frames">Edit frames</button>
							</div>
							<div class="grp" aria-label="Background">
								{#each BGS as [k, n]}<button class="sw bg-{k}" aria-pressed={bg === k} on:click={() => setBg(k)} title={n} aria-label={n}></button>{/each}
							</div>
						</div>
						{#if editing && clip}
							<div class="edbar">
								<span class="et">Editing <b>{clip.name}</b> · {onCount(clip)} of {clip.steps.length} frames on{edited.has(clip.id) ? ' · edited' : ''}</span>
								<span class="ek">Drag to reorder · E on/off · D duplicate · Del delete · [ ] move · − + hold</span>
								<button class="sg" on:click={copySteps} title="Copy the edited steps (JSON) — paste them to Claude to keep them">{copied ? 'Copied' : 'Copy steps'}</button>
								<button class="sg rs" disabled={!edited.has(clip.id)} on:click={ed.reset} title="Back to the library's version">Reset</button>
							</div>
						{/if}
						<div class="strip" role="list" class:editing bind:this={strip}>
							{#each shaped as st, k}
								<div class="fi" role="listitem" class:off={st.off} class:over={editing && dragOver === k && dragFrom !== k} draggable={editing}
									on:dragstart={(ev) => { dragFrom = k; ev.dataTransfer?.setData('text/plain', String(k)); }}
									on:dragover|preventDefault={() => (dragOver = k)} on:dragleave={() => { if (dragOver === k) dragOver = -1; }}
									on:drop|preventDefault={() => onDrop(k)} on:dragend={() => (dragFrom = dragOver = -1)}>
									<button class="fb" class:on={k === i} class:fx={st.flash} on:click={() => { i = k; t = 0; playing = false; done = false; }} title={`${st.s} ${st.f + 1}${st.d > 1 ? ` · held ${st.d}` : ''}${st.off ? ' · off' : ''}`}>
										<canvas></canvas><span>{k + 1}{st.d > 1 ? ` ×${st.d}` : ''}</span>
									</button>
									{#if editing}
										<div class="fe">
											<button on:click={() => ed.toggle(k)} title={st.off ? 'Switch on (E)' : 'Switch off (E)'} aria-label={st.off ? 'Switch on' : 'Switch off'}>{st.off ? '○' : '●'}</button>
											<button on:click={() => ed.move(k, k - 1)} disabled={k === 0} title="Move left ([)" aria-label="Move left">‹</button>
											<button on:click={() => ed.move(k, k + 1)} disabled={k === shaped.length - 1} title="Move right (])" aria-label="Move right">›</button>
										</div>
										<div class="fe">
											<button on:click={() => ed.hold(k, -1)} disabled={st.d <= 1} title="Shorter (−)" aria-label="Shorter">−</button>
											<button on:click={() => ed.hold(k, 1)} title="Hold longer (+)" aria-label="Hold longer">+</button>
											<button on:click={() => ed.dup(k)} title="Duplicate (D)" aria-label="Duplicate">⧉</button>
											<button class="x" on:click={() => ed.del(k)} disabled={shaped.length < 2} title="Delete (Del)" aria-label="Delete">✕</button>
										</div>
									{/if}
								</div>
							{/each}
						</div>
						{#if entry.blurb}<p class="blurb">{entry.blurb}</p>{/if}
						<div class="foot">
							{#each Object.entries(entry.sheets) as [k, sh]}
								{#if clip?.steps.some((x) => x.s === k)}<a class="dl" href={`${base}/anim/${sh.src}`} download>Sprite sheet{k === "f" || k === "reel" ? "" : ": " + k} · {sh.n} frames · {sh.fw}×{sh.fh}</a>{/if}
							{/each}
							<span class="keys">Space play · ← → frame · ↑ ↓ animation · F flip · O onion</span>
						</div>
					{/if}
				</main>
			</div>
		{/if}
	</div>
{/if}

<style>
	.st { position: fixed; inset: 0; display: flex; flex-direction: column; color: var(--ink); background: radial-gradient(120% 90% at 50% 0%, #0d2a44, #061424 60%, #030b15); }
	.lock { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 92vw); display: flex; flex-direction: column; gap: 12px; }
	.lock h1 { margin: 0; color: var(--brass-hi); }
	.lock .btn { align-self: flex-start; }
	.bar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--hair); flex: none; }
	.bar h1 { margin: 0; font-size: 24px; color: var(--brass-hi); font-weight: 400; }
	.bar .cnt { margin-left: auto; color: var(--muted, #9fb0c8); font-size: 14px; }
	.bk { padding: 6px 10px; }
	.msg { padding: 24px; }
	.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 270px minmax(0, 1fr); }
	.lib { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--hair); padding: 10px; gap: 8px; }
	.search { width: 100%; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--hair); background: #08182a; color: var(--ink); font: inherit; font-size: 15px; }
	.list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; scrollbar-width: thin; }
	.gh { margin: 10px 4px 4px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brass, #c9a25a); }
	.gh span { opacity: 0.6; }
	.row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; text-align: left; padding: 6px 9px; border-radius: 7px; border: 1px solid transparent; background: none; color: var(--ink); font: inherit; cursor: pointer; }
	.row:hover { background: rgba(255, 255, 255, 0.05); }
	.row.on { border-color: var(--brass, #c9a25a); background: rgba(201, 162, 90, 0.12); }
	.row .nm { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.row .sb { font-size: 12px; color: var(--muted, #9fb0c8); white-space: nowrap; }
	.main { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 16px; }
	.head { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
	.ttl h2 { margin: 0; font-size: 28px; font-weight: 400; color: var(--ink); }
	.ttl p { margin: 2px 0 0; font-size: 14px; color: var(--muted, #9fb0c8); }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
	.chip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 2px 8px; border: 1px solid var(--hair); border-radius: 999px; color: var(--muted, #9fb0c8); }
	.chip i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
	.clips { display: flex; flex-wrap: wrap; gap: 6px; }
	.cb { display: inline-flex; align-items: baseline; gap: 6px; padding: 5px 11px; border-radius: 8px; border: 1px solid var(--hair); background: #0a1b2e; color: var(--ink); font: inherit; font-size: 15px; cursor: pointer; }
	.cb small { font-size: 11px; color: var(--muted, #9fb0c8); }
	.cb.raw { opacity: 0.75; border-style: dashed; }
	.cb[aria-selected='true'] { border-color: var(--brass, #c9a25a); background: rgba(201, 162, 90, 0.16); opacity: 1; }
	.stage { position: relative; flex: 1; min-height: 200px; border-radius: 12px; border: 1px solid var(--hair); overflow: hidden; }
	.stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
	.stage .ld { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); color: var(--muted, #9fb0c8); }
	.stage .fc { position: absolute; right: 10px; top: 8px; font-size: 13px; padding: 2px 8px; border-radius: 6px; background: rgba(0, 0, 0, 0.45); color: #e8eef8; font-variant-numeric: tabular-nums; }
	.bg-dark { background: radial-gradient(90% 80% at 50% 40%, #1d3047, #0b1624); }
	.bg-light { background: linear-gradient(#dfe7ef, #c6d2de); }
	.bg-check { background: repeating-conic-gradient(#cfd6de 0 25%, #f1f4f7 0 50%) 0 0 / 24px 24px; }
	.bg-grass { background: linear-gradient(#5d8ea8 0 62%, #4f7a3a 62%); }
	.ctl { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }
	.grp { display: flex; align-items: center; gap: 4px; }
	.ib, .sg { font: inherit; color: var(--ink); background: #0a1b2e; border: 1px solid var(--hair); border-radius: 7px; cursor: pointer; }
	.ib { width: 36px; height: 32px; font-size: 18px; line-height: 1; }
	.ib.play { width: 46px; background: linear-gradient(#e0bb6e, #a87c34); color: #1a1206; border-color: #e7c983; font-size: 14px; }
	.sg { padding: 5px 9px; font-size: 13px; }
	.sg[aria-pressed='true'] { border-color: var(--brass, #c9a25a); background: rgba(201, 162, 90, 0.2); }
	.fps { font-size: 12px; color: var(--muted, #9fb0c8); margin-left: 4px; min-width: 64px; }
	.sw { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--hair); cursor: pointer; }
	.sw[aria-pressed='true'] { outline: 2px solid var(--brass, #c9a25a); outline-offset: 1px; }
	.strip { flex: none; display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
	.fb { flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 3px; border-radius: 6px; border: 1px solid var(--hair); background: #0a1b2e; cursor: pointer; }
	.fb canvas { height: 60px; image-rendering: pixelated; display: block; }
	.fb span { font-size: 11px; color: var(--muted, #9fb0c8); font-variant-numeric: tabular-nums; }
	.fb.on { border-color: var(--brass, #c9a25a); background: rgba(201, 162, 90, 0.18); }
	.fb.fx span { color: #ff8a6a; }
	.fi { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 3px; border-radius: 7px; }
	.strip.editing .fi { cursor: grab; }
	.fi.off .fb { opacity: 0.35; border-style: dashed; }
	.fi.over { outline: 2px solid var(--brass, #c9a25a); outline-offset: 1px; }
	.fe { display: flex; gap: 2px; justify-content: center; }
	.fe button { flex: 1; min-width: 20px; height: 22px; padding: 0; font: inherit; font-size: 13px; line-height: 1; color: var(--ink); background: #0a1b2e; border: 1px solid var(--hair); border-radius: 5px; cursor: pointer; }
	.fe button:hover:not(:disabled) { border-color: var(--brass, #c9a25a); }
	.fe button:disabled { opacity: 0.3; cursor: default; }
	.fe .x { color: #ff8a6a; }
	.edbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 10px; border: 1px solid rgba(201, 162, 90, 0.4); border-radius: 8px; background: rgba(201, 162, 90, 0.07); font-size: 13px; }
	.edbar .et b { color: var(--brass-hi, #e7c983); font-weight: 400; }
	.edbar .ek { color: var(--muted, #9fb0c8); margin-right: auto; }
	.edbar .sg:disabled { opacity: 0.4; cursor: default; }
	.cb.ed::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--brass-hi, #e7c983); align-self: center; }
	.blurb { margin: 0; font-size: 14px; color: var(--muted, #9fb0c8); }
	.foot { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; font-size: 13px; }
	.dl { color: var(--brass-hi, #e7c983); text-decoration: none; }
	.dl:hover { text-decoration: underline; }
	.keys { margin-left: auto; color: var(--muted, #9fb0c8); }
	@media (max-width: 760px) {
		.body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
		.lib { border-right: 0; border-bottom: 1px solid var(--hair); max-height: 32dvh; }
		.main { padding: 10px; }
		.ttl h2 { font-size: 22px; }
		.keys, .blurb, .chips { display: none; }
		.main { overflow-y: auto; }
		.stage { flex: none; height: 46dvh; min-height: 240px; }
		.lib { max-height: 24dvh; }
		.bar h1 { font-size: 20px; }
	}
</style>
