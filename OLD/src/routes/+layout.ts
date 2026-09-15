import type { PageLoad } from "../../.svelte-kit/types/src/routes/$types";
import { base } from "$app/paths"

export const prerender = true

// @ts-ignore
export const load: PageLoad = ({ url }) => {
  return {
    // Strip the configured base path so downstream routes (e.g. [hero])
    // see a base-relative pathname like "/arien" instead of "/goa2/arien".
    url: url.pathname.slice(base.length),
  }
}
