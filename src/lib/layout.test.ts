import { describe, expect, it } from 'vitest';
import { uiLayout, DASH_W, DASH_H, DESIGN_W, DESIGN_H, CHIPS_IN, CHIPS_W } from './layout';

describe('uiLayout', () => {
	it('is 1:1 at the 1440×900 design size', () => {
		const l = uiLayout(1440, 900);
		expect(l.s).toBe(1);
		expect(l.dashS).toBe(1);
		expect(l.dashH).toBe(DASH_H);
	});
	it('scales by the tighter axis, so big and small screens keep proportions', () => {
		expect(uiLayout(2560, 1440).s).toBeCloseTo(1.6);
		expect(uiLayout(1280, 720).s).toBeCloseTo(0.8);
		expect(uiLayout(1024, 768).s).toBeCloseTo(1024 / 1440);
	});
	it('centres the console, at the one UI scale', () => {
		for (const [w, h] of [[1440, 900], [1920, 1080], [1024, 768], [820, 1180], [2560, 1080]]) {
			const l = uiLayout(w, h);
			expect(l.dashS).toBe(l.s);
			expect(l.dashX).toBeGreaterThan(0);
			expect(l.dashX * 2 + DASH_W * l.s).toBeCloseTo(w);
		}
	});
	it('never makes the design canvas narrower than 1440 or shorter than 900 (the top bar always fits)', () => {
		for (const [w, h] of [[1440, 900], [1920, 1080], [1024, 768], [820, 1180], [761, 1000], [2560, 1080], [1366, 600]]) {
			const s = uiLayout(w, h).s;
			expect(w / s).toBeGreaterThanOrEqual(DESIGN_W - 1e-6);
			expect(h / s).toBeGreaterThanOrEqual(DESIGN_H - 1e-6);
			// both chip zones sit inside the canvas
			expect(w / s / 2 - CHIPS_IN - CHIPS_W).toBeGreaterThanOrEqual(0);
		}
	});
	it('has no side panels to run under any more', () => {
		const l = uiLayout(820, 1180);
		expect(l.underHud).toBe(false);
		expect(l.underPanel).toBe(false);
	});
});
