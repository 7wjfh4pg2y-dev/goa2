import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		paths: {
			// BASE_PATH lets the deploy build version 1.0 under /goa2/v1 (see siteVersion.ts)
			base: dev ? '' : (process.env.BASE_PATH ?? '/goa2'),
		},
		// Poll for new deploys so the app self-updates without a manual hard refresh.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
