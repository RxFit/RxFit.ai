/**
 * Static-page sitemap data, extracted from routes.ts so a unit test can
 * assert it stays in sync with shared/site.ts STATIC_ROUTES (a route
 * accidentally dropped from the sitemap would silently lose search
 * visibility).
 *
 * Update a page's date here whenever its content is intentionally changed
 * so crawlers receive accurate freshness signals rather than "today" on
 * every request.
 */

/** Routes that are intentionally excluded from the sitemap (noindex-style pages). */
export const SITEMAP_EXCLUDED_ROUTES: readonly string[] = ["/success"];

export const STATIC_PAGE_DATES: Record<string, string> = {
  "/": "2026-06-18",
  "/blog": "2026-06-18",
  "/compare": "2026-07-16",
  "/privacy": "2026-06-18",
  "/terms": "2026-06-18",
  "/contact": "2026-06-18",
};

export const STATIC_SITEMAP_URLS: { loc: string; lastmod: string; priority: string }[] = [
  { loc: "/", lastmod: STATIC_PAGE_DATES["/"], priority: "1.0" },
  { loc: "/blog", lastmod: STATIC_PAGE_DATES["/blog"], priority: "0.8" },
  { loc: "/compare", lastmod: STATIC_PAGE_DATES["/compare"], priority: "0.8" },
  { loc: "/privacy", lastmod: STATIC_PAGE_DATES["/privacy"], priority: "0.3" },
  { loc: "/terms", lastmod: STATIC_PAGE_DATES["/terms"], priority: "0.3" },
  { loc: "/contact", lastmod: STATIC_PAGE_DATES["/contact"], priority: "0.4" },
];
