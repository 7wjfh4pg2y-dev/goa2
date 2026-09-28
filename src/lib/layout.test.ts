import { describe, expect, it } from 'vitest';
import { uiLayout, DASH_W, HUD_R } from './layout';

describe('uiLayout', () => {
	it('is 1:1 at the 1440×900 design size', () => {
		const l = uiLayout(1440, 900);
		expect(l.s).toBe(1);
		expect(l.dashS).toBe(1);
		expect(l.underHud).toBe(false);
	});
	it('scales by the tighter axis, so big and small screens keep proportions', () => {
		expect(uiLayout(2560, 1440).s).toBeCloseTo(1.6);
		expect(uiLayout(1280, 720).s).toBeCloseTo(0.8);
	});
	it('keeps the dash beside the HUD in landscape', () => {
		const l = uiLayout(1180, 820);
		expect(l.dashX).toBeGreaterThanOrEqual(HUD_R * l.s);
		expect(l.dashX + DASH_W * l.dashS).toBeLessThanOrEqual(1180);
	});
	it('spans the dash under both panels on a portrait tablet', () => {
		const l = uiLayout(820, 1180);
		expect(l.underHud).toBe(true);
		expect(l.underPanel).toBe(true);
		expect(l.dashX).toBeGreaterThan(0);
		expect(l.dashX + DASH_W * l.dashS).toBeLessThanOrEqual(820);
	});
});
