// THE shared animation set — every hero gets exactly these, composed from whatever frame counts their base pack has.
// Approved on Silverarrow (2026-11-25). Change a rule here, never per hero. Runs in Node (tests, build) AND is inlined
// into the viewer page (the build strips the `export`s), so keep it dependency-free.
//
// A step = {s: sheet, f: frame, d: length in frames at the animation's fps, air?: in the jump arc,
//           flash?: true = white hit flash | number = red death flash of that strength, kx?: knockback px}.

export const FPS = { idle: 8, run: 12, attack: 9, jump: 9, hit: 10, defeat: 9 };
export const JUMP_HEIGHT = 0.69; // of the character's standing height (Silverarrow: 24 px)
export const REEL = [['idle', 2], ['run', 2], ['jump', 1], ['run', 1], ['jump', 1], ['attack', 1], ['idle', 1], ['attack', 1], ['hit', 1], ['run', 1], ['hit', 1], ['defeat', 1], ['idle', 1]];

const range = (s, n) => Array.from({ length: n }, (_, f) => ({ s, f, d: 1 }));

/**
 * frames = {idle, run, attack, jump, fall, hit, death} frame counts; attack = the base pack's {holds, release};
 * charH = the character's standing height in sprite px. Returns the animation list the viewer plays.
 */
export function compose(frames, attack, charH, names = {}) {
	const idleN = frames.idle;
	const idle = (f, d = 1) => ({ s: 'idle', f: Math.min(f, idleN - 1), d });
	const out = [];
	out.push({ id: 'idle', name: 'Idle', fps: FPS.idle, loop: true, steps: range('idle', idleN) });
	out.push({ id: 'run', name: 'Run', fps: FPS.run, loop: true, steps: range('run', frames.run) });
	out.push({
		id: 'attack', name: names.attack || 'Attack', fps: FPS.attack, loop: true,
		steps: range('attack', frames.attack).map((x, i) => ({ ...x, d: 1 + ((attack?.holds || [])[i] || 0) })),
		loose: attack?.release ?? null
	});
	// Jump: stance → take-off (jump frames) → descent (fall frames) on one parabola → land in the stance
	const up = range('jump', frames.jump).map((x, i) => ({ ...x, d: i === 0 ? 2 : 3, air: true }));
	const down = range('fall', frames.fall).map((x, i, a) => ({ ...x, d: i === a.length - 1 ? 2 : 3, air: true }));
	out.push({ id: 'jump', name: 'Jump', fps: FPS.jump, loop: true, H: Math.round(charH * JUMP_HEIGHT), steps: [idle(0, 2), ...up, ...down, idle(1, 3)] });
	// Hit: stance → white flash + knockback through the hit frames → recover through the back half of the idle
	const rec = [];
	for (let f = Math.floor(idleN * 0.4); f < idleN; f++) rec.push(idle(f, f === idleN - 1 ? 3 : 1));
	out.push({
		id: 'hit', name: 'Hit', fps: FPS.hit, loop: true,
		steps: [idle(0, 2), idle(1, 1), ...range('hit', frames.hit).map((x, i) => ({ ...x, d: 2, kx: -Math.max(0, 3 - i), ...(i === 0 ? { flash: true } : {}) })), ...rec]
	});
	// Defeat: stance → the killing blow (red flash, bigger shake, longer knockback) → the death strip, held at the end
	const hitN = frames.hit;
	out.push({
		id: 'defeat', name: 'Defeat', fps: FPS.defeat, loop: false,
		steps: [
			idle(0, 2), idle(1, 1),
			...range('hit', hitN).map((x, i) => ({ ...x, d: i === 0 ? 3 : i === hitN - 1 ? 1 : 2, kx: -Math.max(0, 5 - i), ...(i === 0 ? { flash: 1.7 } : {}) })),
			...range('death', frames.death).map((x, i, a) => ({ ...x, d: i === a.length - 1 ? 7 : 1, kx: -Math.max(0, 2 - i) }))
		]
	});
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
