import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		paths: {
			// The site lives at the root of goa2digital.pages.dev (Cloudflare Pages builds this branch on every
			// push). BASE_PATH only matters for a copy served from a sub-folder (the old GitHub Pages site used /goa2)
			base: dev ? '' : (process.env.BASE_PATH ?? ''),
		},
		// Poll for new deploys so the app self-updates without a manual hard refresh.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
