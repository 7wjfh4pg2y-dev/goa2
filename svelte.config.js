import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const dev = process.argv.includes('dev');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess({})],

	kit: {
		adapter: adapter(),
		paths: {
			// BASE_PATH: the GitHub Pages deploy builds under /goa2 (its workflow sets it); any other host
			// (e.g. Cloudflare Pages) serves the site from the root, so the default is ''
			base: dev ? '' : (process.env.BASE_PATH ?? ''),
		},
		// Poll for new deploys so the app self-updates without a manual hard refresh.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
