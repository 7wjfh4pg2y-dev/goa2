// Desktop / tablet game layout (phones ≤760px have their own layout).
// Everything is designed at 1440×900 and scaled by ONE factor `s` taken from the
// window, so the HUD, player panel, dash and hand keep the same proportions on a
// small laptop, a big monitor and an iPad. On narrow (portrait) screens the dash
// can't fit beside the HUD, so it spans the full width and both side panels sit
// above it.
export const DESIGN_W = 1440, DESIGN_H = 900;
export const DASH_W = 1180, DASH_H = 78;
export const HUD_W = 204, PANEL_W = 244, EDGE = 12;
/** inner edges of the side panels, in design px (panel + margin + breathing room) */
export const HUD_R = 224, PANEL_L = 268;

export interface UiLayout {
	/** the one UI scale (1 at 1440×900) */
	s: number;
	/** the dash's own scale (≤ s; smaller only when it has to span a narrow screen) */
	dashS: number;
	dashX: number;
	dashH: number;
	/** distance from the window bottom to the dash, px */
	dashBot: number;
	/** the dash runs under the HUD / player panel, so they stop above it */
	underHud: boolean;
	underPanel: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function uiScale(w: number, h: number): number {
	return clamp(Math.min(w / DESIGN_W, h / DESIGN_H), 0.7, 2.2);
}

export function uiLayout(w: number, h: number): UiLayout {
	const s = uiScale(w, h);
	const hudR = HUD_R * s, edge = EDGE * s;
	let dashS = s, dashX: number, underHud = false;
	if (hudR + DASH_W * s + edge <= w) {
		dashX = hudR + (w - hudR - edge - DASH_W * s) / 2;
	} else {
		underHud = true;
		dashS = Math.min(s, (w - 2 * edge) / DASH_W);
		dashX = (w - DASH_W * dashS) / 2;
	}
	return { s, dashS, dashX, dashH: DASH_H * dashS, dashBot: edge, underHud, underPanel: dashX + DASH_W * dashS > w - PANEL_L * s };
}

/** CSS custom properties for the layout (set on a wrapper; children read them) */
export function layoutVars(l: UiLayout): string {
	return `--uis:${l.s}; --ds:${l.dashS}; --dx:${l.dashX}px; --dh:${l.dashH}px; --db:${l.dashBot}px`;
}
