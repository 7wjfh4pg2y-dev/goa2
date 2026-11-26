// The hero sprite viewer (inlined into viewer.html by build.mjs, after anims.mjs). HEROES = one entry per built hero:
// {id, name, blurb, chips, base, baseName, cell, foot, attack, glow, sheets: {sheet: {frames, bbox}}, art, orig, proj}.
(() => {
	const $ = (s) => document.querySelector(s);
	const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
	const ui = { hero: 0, anim: 'idle', i: 0, t: 0, playing: true, fps: 8, flip: false, onion: false, compare: false, reel: false, ri: 0, rloops: 0, done: false, shake: 0 };
	const shots = [], sparks = [], hits = [];
	let H, ANIMS, body, img, orig, proj, nock = null;
	const off = document.createElement('canvas');
	const loaded = new Map();

	async function useHero(k) {
		ui.hero = k; H = HEROES[k];
		if (!loaded.has(H.id)) {
			const get = async (o) => Object.fromEntries(await Promise.all(Object.entries(o).map(async ([n, v]) => [n, await load(v)])));
			loaded.set(H.id, { img: await get(H.art), orig: await get(H.orig), proj: await get(H.proj) });
		}
		({ img, orig, proj } = loaded.get(H.id));
		body = bodyOf(H.sheets.idle.bbox, H.foot);
		ANIMS = compose(Object.fromEntries(Object.entries(H.sheets).map(([s, v]) => [s, v.frames])), H.attack, body.h, { attack: H.attack?.name });
		off.width = off.height = H.cell;
		nock = findNock();
		$('#htitle').textContent = H.name;
		$('#hblurb').textContent = H.blurb || '';
		$('#hbase').textContent = `Base: ${H.baseName} · ${H.cell} px cells · ${body.h} px tall`;
		$('#sw').innerHTML = (H.chips || []).map(([n, c]) => `<span class="sw"><i style="background:${c}"></i>${n}</span>`).join('');
		document.querySelectorAll('.hp').forEach((b, i) => b.setAttribute('aria-pressed', i === k));
		buildTabs(); pick(ANIMS.some((a) => a.id === ui.anim) ? ui.anim : 'idle', ui.reel);
	}
	// where the shot leaves: the furthest-forward pixel of the frame before the release, in the upper body
	function findNock() {
		const a = H.attack; if (!a || a.release == null || !img.attack) return null;
		const c = document.createElement('canvas'); c.width = c.height = H.cell; const x = c.getContext('2d');
		x.drawImage(img.attack, -(a.nockFrame ?? a.release - 1) * H.cell, 0);
		const d = x.getImageData(0, 0, H.cell, H.cell).data, y0 = Math.round(H.foot - body.h * 1.4), y1 = Math.round(H.foot - body.h * 0.2);
		for (let col = H.cell - 1; col > body.cx; col--) for (let y = Math.max(0, y0); y < y1; y++) if (d[(y * H.cell + col) * 4 + 3]) return [col, y];
		return null;
	}

	function buildTabs() {
		$('#anims').innerHTML = ANIMS.map((a) => `<button class="ab" data-a="${a.id}" aria-pressed="false">${a.name}<small>${a.steps.length} f</small></button>`).join('') + `<button class="ab reel" data-a="reel" aria-pressed="false">▶ Showreel</button>`;
		$('#anims').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => (b.dataset.a === 'reel' ? startReel() : (ui.reel = false, pick(b.dataset.a)))));
	}
	const A = () => ANIMS.find((a) => a.id === ui.anim);
	function pick(id, keepReel) {
		ui.anim = id; ui.i = 0; ui.t = 0; ui.fps = A().fps; ui.done = false;
		$('#spd').value = ui.fps; $('#spdo').textContent = ui.fps + ' fps';
		if (!keepReel) ui.reel = false;
		document.querySelectorAll('[data-a]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.a === (ui.reel ? 'reel' : id)));
		buildStrip(); ui.playing = true; $('#pp').textContent = 'Pause';
	}
	function startReel() { ui.reel = true; ui.ri = 0; ui.rloops = 0; pick(REEL[0][0], true); }
	function buildStrip() {
		const box = $('#frames'); box.innerHTML = '';
		const cw = Math.round(body.h * 2.2), chh = Math.round(body.h * 1.5), sx = Math.round(body.cx - cw / 2), sy = H.foot - chh + 2;
		A().steps.forEach((st, i) => {
			const b = document.createElement('button'); b.className = 'fb'; b.dataset.i = i;
			const c = document.createElement('canvas'); c.width = cw; c.height = chh; const k = 78 / chh; c.style.width = Math.round(cw * k) + 'px'; c.style.height = '78px';
			c.getContext('2d').drawImage(img[st.s], st.f * H.cell + sx, sy, cw, chh, 0, 0, cw, chh);
			b.append(c); const s = document.createElement('span'); s.textContent = i + 1; b.append(s);
			b.addEventListener('click', () => { ui.i = i; ui.t = 0; ui.playing = false; ui.done = false; $('#pp').textContent = 'Play'; });
			box.append(b);
		});
	}

	const cv = $('#cv'), ctx = cv.getContext('2d');
	function size() { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
	new ResizeObserver(size).observe(cv); size();

	function advance(dt) {
		const a = A(), st = a.steps, n = st.length;
		if (!ui.playing || ui.done) return;
		ui.t += dt;
		while (ui.t >= st[ui.i].d / ui.fps) {
			ui.t -= st[ui.i].d / ui.fps;
			ui.i++;
			if (a.loose != null && st[ui.i] && st[ui.i].s === 'attack' && st[ui.i].f === a.loose) loose();
			if (ui.i >= n) {
				if (ui.reel) { if (++ui.rloops >= REEL[ui.ri][1]) { ui.ri = (ui.ri + 1) % REEL.length; ui.rloops = 0; pick(REEL[ui.ri][0], true); return; } ui.i = 0; }
				else if (a.loop) ui.i = 0;
				else { ui.i = n - 1; ui.done = true; ui.t = 0; setTimeout(() => { if (ui.anim === a.id && ui.done && ui.playing) { ui.i = 0; ui.done = false; } }, 1800); return; }
			}
		}
	}
	function loose() {
		if (!nock || !proj[H.attack.projectile]) return;
		shots.push({ x: nock[0] - 20, y: nock[1], v: 160, life: 1.4 });
		for (let i = 0; i < 10; i++) sparks.push({ x: nock[0], y: nock[1], vx: 20 + Math.random() * 60, vy: (Math.random() - 0.5) * 50, life: 0.35 + Math.random() * 0.3 });
	}
	// impact sparks off the chest, thrown back the way the hero is knocked (p > 1 = the killing blow: red, more, further)
	function hitBurst(p) {
		const x = body.cx + 6, y = H.foot - body.h * 0.7;
		for (let i = 0; i < 14 * p * p; i++) hits.push({ x: x + Math.random() * 4, y: y + Math.random() * 6, vx: (-20 - Math.random() * 50) * p, vy: (-30 - Math.random() * 40) * p, life: 0.35 + Math.random() * 0.3, c: (p > 1 ? ['#ff3030', '#ff7a5a', '#ffffff', '#b81414'] : ['#ffffff', '#ffd9a0', '#ff8a4a'])[i % (p > 1 ? 4 : 3)] });
	}

	let last = performance.now();
	function tick(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (H) { advance(dt); draw(dt); } requestAnimationFrame(tick); }
	function draw(dt) {
		const W = cv.width, Ht = cv.height, CELL = H.cell;
		ctx.clearRect(0, 0, W, Ht); ctx.imageSmoothingEnabled = false;
		const a = A(), st = a.steps, cur = st[ui.i];
		// ONE pixel scale for every hero (sized from the tallest), so each keeps its true size and the same pixel size
		const refH = Math.max(...HEROES.map((h) => bodyOf(h.sheets.idle.bbox, h.foot).h));
		const vw = refH * 2.65, vh = refH * 1.66 + refH * 0.72;
		const s = Math.max(1, Math.floor(Math.min(W / (vw * (ui.compare ? 2 : 1)), Ht / vh) * 0.95));
		const groundY = Math.round(Ht * 0.74), up = Math.round(liftAt(a, ui.i, ui.t, ui.fps));
		if (cur.flash && ui.t < 0.03 && !ui.shook) { const p = cur.flash === true ? 1 : cur.flash; ui.shake = p; ui.shook = true; hitBurst(p); }
		if (!cur.flash) ui.shook = false;
		ui.shake = Math.max(0, ui.shake - dt * 4);
		const kx = (cur.kx || 0) * (ui.flip ? -1 : 1), shx = ui.shake ? Math.round((Math.random() - 0.5) * 3 * ui.shake) * s : 0, shy = ui.shake ? Math.round((Math.random() - 0.5) * 2 * ui.shake) * s : 0;
		const panels = ui.compare ? [[orig, W * 0.27, 'Before'], [img, W * 0.73, H.name]] : [[img, W * 0.5, '']];
		document.querySelectorAll('.compare-tag').forEach((e) => e.remove());
		for (const [set, cx, label] of panels) {
			const ox = Math.round(cx - body.cx * s) + kx * s + shx, oy = groundY - H.foot * s - up * s + shy;
			const k = 1 - Math.min(0.55, up / (body.h * 1.15));
			ctx.fillStyle = `rgba(0,0,0,${0.32 * k})`; ctx.beginPath(); ctx.ellipse(cx, groundY + s * 0.5, body.h * 0.4 * s * k, body.h * 0.075 * s * k, 0, 0, Math.PI * 2); ctx.fill();
			const mirror = () => { if (ui.flip) { ctx.translate(cx * 2, 0); ctx.scale(-1, 1); } };
			const drawF = (step, alpha) => { if (!set[step.s]) return; ctx.save(); ctx.globalAlpha = alpha; mirror(); ctx.drawImage(set[step.s], step.f * CELL, 0, CELL, CELL, ox, oy, CELL * s, CELL * s); ctx.restore(); };
			if (ui.onion) { const n = st.length; drawF(st[(ui.i - 1 + n) % n], 0.22); drawF(st[(ui.i + 1) % n], 0.12); }
			drawF(cur, 1);
			if (cur.flash && set[cur.s]) { // the hit: the silhouette flashes (white = hit, red = the killing blow), fading over the step
				const f = Math.max(0, 1 - (ui.t * ui.fps) / cur.d), o = off.getContext('2d');
				o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, CELL, CELL); o.drawImage(set[cur.s], cur.f * CELL, 0, CELL, CELL, 0, 0, CELL, CELL);
				o.globalCompositeOperation = 'source-atop'; o.fillStyle = cur.flash === true ? '#fff4ea' : '#ff2a2a'; o.fillRect(0, 0, CELL, CELL);
				ctx.save(); ctx.globalAlpha = 0.8 * Math.max(f, 0.25); mirror(); ctx.drawImage(off, ox, oy, CELL * s, CELL * s); ctx.restore();
			}
			if (cur.guard) { // Defend: a pixel ward in the hero's own colour in front of them, swelling in
				const k = Math.min(1, (ui.t * ui.fps) / cur.d + 0.35), wc = wardCanvas(body.h, H.glow || '#9fd8ff');
				const wx = Math.round(body.cx + body.h * 0.12), wy = Math.round(H.foot - body.h * 0.5 - (wc.height - 1) / 2);
				ctx.save(); ctx.globalAlpha = k; mirror(); ctx.drawImage(wc, ox + wx * s, oy + wy * s, wc.width * s, wc.height * s); ctx.restore();
			}
			if (set === img) {
				ctx.save(); mirror();
				drawShots(ox - kx * s - shx, groundY - H.foot * s, s, dt);
				for (let i = hits.length - 1; i >= 0; i--) { const p = hits[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.life -= dt; ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3)); ctx.fillStyle = p.c; ctx.fillRect(Math.round(ox + p.x * s), Math.round(oy + p.y * s), s, s); if (p.life <= 0) hits.splice(i, 1); }
				ctx.globalAlpha = 1; ctx.restore();
			}
			if (label) { const t = document.createElement('div'); t.className = 'compare-tag'; t.textContent = label; t.style.left = (cx / W) * 100 + '%'; t.style.transform = 'translateX(-50%)'; $('#stage').append(t); }
		}
		$('#hname').textContent = ui.reel ? 'Showreel · ' + a.name : a.name;
		$('#hframe').textContent = `${ui.i + 1} / ${st.length}`;
		document.querySelectorAll('.fb').forEach((b) => b.classList.toggle('on', +b.dataset.i === ui.i));
	}
	function drawShots(ox, oy, s, dt) {
		const arrow = proj[H.attack?.projectile];
		for (let i = shots.length - 1; i >= 0; i--) {
			const a = shots[i]; a.x += a.v * dt; a.life -= dt;
			const px = ox + a.x * s, py = oy + a.y * s;
			const g = ctx.createLinearGradient(px - 40 * s, 0, px, 0); g.addColorStop(0, 'rgba(200,255,140,0)'); g.addColorStop(1, (H.glow || '#d2ff96') + 'bf');
			ctx.fillStyle = g; ctx.fillRect(px - 40 * s, py - s, 40 * s, 2 * s);
			ctx.shadowColor = H.glow || '#c8ff7a'; ctx.shadowBlur = 6 * s;
			if (arrow) ctx.drawImage(arrow, px, py - 2 * s, arrow.width * s, arrow.height * s);
			ctx.shadowBlur = 0;
			if (Math.random() < 0.6) sparks.push({ x: a.x - 2, y: a.y + (Math.random() - 0.5) * 3, vx: -10 - Math.random() * 20, vy: (Math.random() - 0.5) * 12, life: 0.4 });
			if (a.life <= 0) shots.splice(i, 1);
		}
		for (let i = sparks.length - 1; i >= 0; i--) {
			const p = sparks[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
			ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 3));
			ctx.fillStyle = Math.random() < 0.3 ? '#ffffff' : '#d4ff8a';
			ctx.fillRect(Math.round(ox + p.x * s), Math.round(oy + p.y * s), s, s);
			if (p.life <= 0) sparks.splice(i, 1);
		}
		ctx.globalAlpha = 1;
	}


	// the Defend ward as PIXELS at sprite scale (a crescent shield: rim in the hero's colour, a white inner glint,
	// a checker-dithered fill) — the same pixel art as the sprite, never a smooth vector shape
	function wardCanvas(h, glow) {
	const R = Math.max(6, Math.round(h * 0.46)), A = Math.max(3, Math.round(R * 0.42)), W = A + 2, Hh = 2 * R + 1;
	const c = document.createElement('canvas'); c.width = W; c.height = Hh; const x = c.getContext('2d');
	const put = (px, py, col, a) => { x.globalAlpha = a; x.fillStyle = col; x.fillRect(px, py, 1, 1); };
	for (let dy = -R; dy <= R; dy++) {
		const o = Math.round(A * Math.sqrt(Math.max(0, 1 - (dy / R) ** 2))), y = dy + R;
		for (let dx = 0; dx < o; dx++) if ((dx + y) % 2 === 0) put(dx, y, glow, 0.35);
		put(o, y, glow, 1); if (o > 0) put(o - 1, y, glow, 0.8);
		if (Math.abs(dy) < R * 0.7 && o > 2) put(o - 2, y, '#ffffff', 0.85);
	}
	return c;
}
	const tog = (k) => { ui[k] = !ui[k]; document.querySelectorAll(`[data-t="${k}"]`).forEach((b) => b.setAttribute('aria-pressed', ui[k])); };
	document.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => tog(b.dataset.t)));
	document.querySelectorAll('[data-bg]').forEach((b) => b.addEventListener('click', () => { $('#bg').className = 'bg ' + b.dataset.bg; document.querySelectorAll('[data-bg]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
	const playToggle = () => { ui.playing = !ui.playing; if (ui.done) { ui.done = false; ui.i = 0; } $('#pp').textContent = ui.playing ? 'Pause' : 'Play'; };
	const step = (d) => { const st = A().steps, n = st.length; ui.playing = false; ui.done = false; $('#pp').textContent = 'Play'; ui.i = (ui.i + d + n) % n; ui.t = 0; if (d > 0 && st[ui.i].s === 'attack' && st[ui.i].f === A().loose) loose(); };
	$('#pp').addEventListener('click', playToggle);
	$('#prev').addEventListener('click', () => step(-1));
	$('#next').addEventListener('click', () => step(1));
	$('#spd').addEventListener('input', (e) => { ui.fps = +e.target.value; $('#spdo').textContent = ui.fps + ' fps'; });
	addEventListener('keydown', (e) => {
		if (e.target.tagName === 'INPUT' || !H) return;
		const k = e.key.toLowerCase();
		if (k === ' ') { e.preventDefault(); playToggle(); }
		else if (k === 'arrowleft') step(-1);
		else if (k === 'arrowright') step(1);
		else if (k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); const i = ANIMS.findIndex((a) => a.id === ui.anim); pick(ANIMS[(i + (k === 'arrowdown' ? 1 : -1) + ANIMS.length) % ANIMS.length].id); }
		else if (k === 'm') tog('flip'); else if (k === 'o') tog('onion'); else if (k === 'c') tog('compare');
	});
	$('#heroes').innerHTML = HEROES.length > 1 ? HEROES.map((h, i) => `<button class="hp" data-h="${i}" aria-pressed="false">${h.name}</button>`).join('') : '';
	document.querySelectorAll('.hp').forEach((b) => b.addEventListener('click', () => useHero(+b.dataset.h)));
	useHero(0).then(() => requestAnimationFrame(tick));
	window.__ui = ui;
})();
