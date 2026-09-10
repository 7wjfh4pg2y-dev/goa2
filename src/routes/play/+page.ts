// The board editor / game table is fully interactive and client-only
// (uses window, localStorage, pointer events, Supabase realtime). Disable
// server-side rendering so it isn't executed during static prerender;
// SvelteKit prerenders an app shell that hydrates in the browser.
export const ssr = false
export const prerender = true
