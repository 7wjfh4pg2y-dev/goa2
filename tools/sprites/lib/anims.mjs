// THE shared animation set — every hero gets exactly these, composed from whatever frame counts their base pack has.
// Approved on Silverarrow (2026-11-25). Change a rule here, never per hero. Runs in Node (tests, build) AND is inlined
// into the viewer page (the build strips the `export`s), so keep it dependency-free.
//
// THE STANDARD SET (the user's, 2026-11-26) for every character: Idle · Attack · Defend · Hit · Death (Defeat) and,
// when the pack can, Movement (Run); Jump is an extra. A step = {s: sheet, f: frame, d: length in frames at the animation's fps, air?: in the jump arc,
// guard?: the defence ward shows (drawn by the viewer in the hero's glow colour),
//           flash?: true = white hit flash | number = red death flash of that strength, kx?: knockback px}.

export const FPS = { idle: 8, run: 12, attack: 9, defend: 10, jump: 9, hit: 10, defeat: 9 };
export const JUMP_HEIGHT = 0.69; // of the character's standing height (Silverarrow: 24 px)
export const REEL = [['idle', 2], ['run', 2], ['jump', 1], ['run', 1], ['attack', 1], ['defend', 1], ['attack', 1], ['hit', 1], ['run', 1], ['defend', 1], ['hit', 1], ['defeat', 1], ['idle', 1]];

const range = (s, n) => Array.from({ length: n }, (_, f) => ({ s, f, d: 1 }));

/**
 * frames = {idle, run, attack, jump, fall, hit, death (+ posed phit / pdeath)} frame counts; guard = the pack's
 * guard pose {sheet, lead, frames} (Defend); attack = the base pack's {holds, release};
 * charH = the character's standing height in sprite px. Returns the animation list the viewer plays.
 */
export function compose(frames, attack, charH, names = {}, guard = null, combo = null) {
	const idleN = frames.idle;
	const idle = (f, d = 1) => ({ s: 'idle', f: Math.min(f, idleN - 1), d });
	const out = [];
	out.push({ id: 'idle', name: 'Idle', fps: FPS.idle, loop: true, steps: range('idle', idleN) });
	if (frames.run) out.push({ id: 'run', name: 'Movement', fps: FPS.run, loop: true, steps: range('run', frames.run) });
	out.push({
		id: 'attack', name: names.attack || 'Attack', fps: FPS.attack, loop: true,
		steps: range('attack', frames.attack).map((x, i) => ({ ...x, d: 1 + ((attack?.holds || [])[i] || 0) })),
		loose: attack?.release ?? null
	});
	// Defend (no pack has block frames, so it is composed): stance → BRACE in the first hit pose, the ward up, a small
	// shove back (no flash: nothing got through) → recover through the back of the idle
	if (guard && frames[guard.sheet]) { // the pack's own guard pose (base.mjs `guard`): lead in → hold with the ward up → back out
		const back = [], g = (f, d, kx) => ({ s: guard.sheet, f, d, guard: true, ...(kx ? { kx } : {}) }), lead = guard.lead || [], [g1, g2 = g1] = guard.frames;
		for (let f = Math.floor(idleN * 0.6); f < idleN; f++) back.push(idle(f, f === idleN - 1 ? 3 : 1));
		out.push({
			id: 'defend', name: 'Defend', fps: FPS.defend, loop: true,
			steps: [idle(0, 1), ...lead.map((f) => ({ s: guard.sheet, f, d: 1 })), g(g1, 2, -1), g(g2, 4, -2), g(g1, 2, -1), ...[...lead].reverse().map((f) => ({ s: guard.sheet, f, d: 1 })), ...back]
		});
	} else if (frames.hit) {
		const back = [];
		for (let f = Math.floor(idleN * 0.6); f < idleN; f++) back.push(idle(f, f === idleN - 1 ? 3 : 1));
		out.push({
			id: 'defend', name: 'Defend', fps: FPS.defend, loop: true,
			steps: [idle(0, 2), { s: 'hit', f: 0, d: 2, kx: -1, guard: true }, { s: 'hit', f: 0, d: 4, kx: -2, guard: true }, { s: 'hit', f: 0, d: 2, kx: -1 }, ...back]
		});
	}
	// Jump: stance → take-off (jump frames) → descent (fall frames) on one parabola → land in the stance
	const up = range('jump', frames.jump).map((x, i) => ({ ...x, d: i === 0 ? 2 : 3, air: true }));
	const down = range('fall', frames.fall).map((x, i, a) => ({ ...x, d: i === a.length - 1 ? 2 : 3, air: true }));
	out.push({ id: 'jump', name: 'Jump', fps: FPS.jump, loop: true, H: Math.round(charH * JUMP_HEIGHT), steps: [idle(0, 2), ...up, ...down, idle(1, 3)] });
	// posed hit / death frames (lib/pose.mjs) stand in for the pack's own when there are some
	const hitS = frames.phit ? 'phit' : 'hit', deathS = frames.pdeath ? 'pdeath' : 'death';
	// Hit: stance → white flash + knockback through the hit frames → recover through the back half of the idle
	const rec = [];
	for (let f = Math.floor(idleN * 0.4); f < idleN; f++) rec.push(idle(f, f === idleN - 1 ? 3 : 1));
	out.push({
		id: 'hit', name: 'Hit', fps: FPS.hit, loop: true,
		steps: [idle(0, 2), idle(1, 1), ...range(hitS, frames[hitS]).map((x, i) => ({ ...x, d: 2, kx: -Math.max(0, 3 - i), ...(i === 0 ? { flash: true } : {}) })), ...rec]
	});
	// Defeat: stance → the killing blow (red flash, bigger shake, longer knockback) → the death strip, held at the end
	const hitN = frames[hitS];
	out.push({
		id: 'defeat', name: 'Defeat', fps: FPS.defeat, loop: false,
		steps: [
			idle(0, 2), idle(1, 1),
			// posed death frames carry the blow themselves (thrown back → head lolls → knees give); else the hit frames do
			...(frames.pdeath ? [] : range(hitS, hitN).map((x, i) => ({ ...x, d: i === 0 ? 3 : i === hitN - 1 ? 1 : 2, kx: -Math.max(0, 5 - i), ...(i === 0 ? { flash: 1.7 } : {}) }))),
			...range(deathS, frames[deathS]).map((x, i, a) => frames.pdeath
				? { ...x, d: i === a.length - 1 ? 7 : i < 3 ? (i === 0 ? 3 : 2) : 1, kx: -Math.max(0, 5 - 2 * i), ...(i === 0 ? { flash: 1.7 } : {}) }
				: { ...x, d: i === a.length - 1 ? 7 : 1, kx: -Math.max(0, 2 - i) })
		]
	});
	// a combo (base.mjs `combo`, an extra): the pack's attacks flowing straight into each other (no beat between
	// hits), the last frame of the last one lingered on (9 frames) — then back to the stance
	if (combo && combo.sheets.every((s) => frames[s])) {
		const steps = [idle(0, 1)];
		combo.sheets.forEach((s, k) => steps.push(...range(s, frames[s]).map((x, i, a) => ({ ...x, d: i === a.length - 1 && k === combo.sheets.length - 1 ? 9 : 1 }))));
		// then back to the stance — through the pack's own recovery frames when it names some (base.mjs combo.recover)
		for (const [s, f, d] of combo.recover || []) if (frames[s] > f) steps.push({ s, f, d });
		steps.push(idle(1, 3));
		out.push({ id: 'combo', name: combo.name || 'Combo', fps: FPS.attack, loop: true, steps });
	}
	// the standard five (+ Movement) first, extras after
	const j = out.findIndex((a) => a.id === 'jump'); if (j >= 0) out.push(...out.splice(j, 1));
	return out;
}

/** Height above the ground (sprite px) at step `i`, `t` seconds into it: one parabola across the airborne steps. */
export function liftAt(anim, i, t, fps) {
	if (!anim.H || !anim.steps[i]?.air) return 0;
	let total = 0, before = 0;
	anim.steps.forEach((s, k) => { if (s.air) { total += s.d; if (k < i) before += s.d; } });
	const p = Math.min(1, (before + Math.min(t * fps, anim.steps[i].d)) / total);
	return anim.H * 4 * p * (1 - p);
}

/** A character's standing height and body centre (sprite px) from the idle strip's frame boxes. */
export function bodyOf(idleBoxes, foot) {
	const hs = idleBoxes.map((b) => foot - b[1] + 1).sort((a, b) => a - b), cs = idleBoxes.map((b) => (b[0] + b[2]) / 2).sort((a, b) => a - b);
	return { h: hs[hs.length >> 1], cx: cs[cs.length >> 1] };
}
