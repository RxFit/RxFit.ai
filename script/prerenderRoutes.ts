import { STATIC_ROUTES } from "../shared/site";

/**
 * Routes that are prerendered (so production serves them with HTTP 200) but
 * deliberately NOT in shared/site.ts STATIC_ROUTES — keeping them out of the
 * sitemap, the internal-link validation targets, and robots-visible surfaces.
 *
 * "/admin" is the internal ops dashboard: prerendered here, whitelisted in
 * server/vite.ts isKnownRoute for dev, and disallowed for every UA group in
 * robots.txt (server/robots.ts). Guarded by script/prerenderRoutes.test.ts so
 * a refactor can't silently drop it (404 in prod) or leak it into the sitemap.
 */
export const EXTRA_PRERENDER_ROUTES: readonly string[] = ["/admin"];

/** The full list of 200-status routes the build prerenders. */
export function prerenderRoutePaths(blogSlugs: string[]): string[] {
  return [
    ...STATIC_ROUTES,
    ...EXTRA_PRERENDER_ROUTES,
    ...blogSlugs.map((s) => `/blog/${s}`),
  ];
}
