// Desktop / tablet game layout (phones ≤760px have their own layout).
// Everything is designed at 1440×900 and scaled by ONE factor `s` taken from the
// window, so the top bar, the helm console, the hand and the overlays keep the same
// proportions on a small laptop, a big monitor and an iPad.
//
// The design canvas is the window measured in design px: `w / s` wide, `h / s` tall.
// Because `s` never exceeds `w / 1440`, the canvas is NEVER narrower than 1440 (wider
// on wide screens, taller on tall ones): the top bar and the console are laid out from
// the centre line and always fit, so nothing needs a second scale.
//
//   y 8..64    top bar: ☰ · enemy chips · scoreline · your team's chips · view
//   y 70..118  initiative rail (after the reveal); the prompt line sits here, or under the rail while it is up
//   between    the board: the island at rest fits BOARD_TOP .. BOARD_BOTTOM from the edges
//   bottom     log tab, bottom-left, above the console
//   bottom     helm console, DASH_W × DASH_H, centred, EDGE from the bottom
export const DESIGN_W = 1440, DESIGN_H = 900;
/** the helm console (the old "dash") */
export const DASH_W = 1180, DASH_H = 112;
export const EDGE = 12;
/** the top bar and the rail under it, in design px from the top */
export const TOP_Y = 8, TOP_H = 56, RAIL_Y = 70, RAIL_H = 48;
/** the island at rest keeps clear of the top bar + the rail's lane, and of the console + the tips of the tucked hand over it */
export const BOARD_TOP = RAIL_Y + RAIL_H, BOARD_BOTTOM = 160;
/** a roster-chip zone: its inner edge is this far from the centre line, and it is this wide */
export const CHIPS_IN = 284, CHIPS_W = 372;

export interface UiLayout {
	/** the one UI scale (1 at 1440×900) */
	s: number;
	/** the console's scale — always `s` now (kept for older callers) */
	dashS: number;
	/** the console's left edge, px */
	dashX: number;
	/** the console's height, px */
	dashH: number;
	/** distance from the window bottom to the console, px */
	dashBot: number;
	/** always false: there are no side panels any more (kept for older callers) */
	underHud: boolean;
	underPanel: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function uiScale(w: number, h: number): number {
	return clamp(Math.min(w / DESIGN_W, h / DESIGN_H), 0.5, 2.2);
}

export function uiLayout(w: number, h: number): UiLayout {
	const s = uiScale(w, h);
	return { s, dashS: s, dashX: (w - DASH_W * s) / 2, dashH: DASH_H * s, dashBot: EDGE * s, underHud: false, underPanel: false };
}

/** CSS custom properties for the layout (set on a wrapper; children read them) */
export function layoutVars(l: UiLayout): string {
	return `--uis:${l.s}; --ds:${l.dashS}; --dx:${l.dashX}px; --dh:${l.dashH}px; --db:${l.dashBot}px`;
}
