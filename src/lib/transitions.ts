import { cubicOut } from 'svelte/easing';

// Sleek cross-fade: fade + subtle lift, scale and de-blur. Shared across screens.
export function reveal(_node: Element, { duration = 300, delay = 0 } = {}) {
	return {
		duration,
		delay,
		easing: cubicOut,
		css: (t: number, u: number) =>
			`opacity:${t}; transform: translateY(${u * 14}px) scale(${0.97 + 0.03 * t}); filter: blur(${u * 7}px);`
	};
}
