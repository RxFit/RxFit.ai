/**
 * Canonical site origins. Single source of truth for SEO URLs so that
 * sitemap.xml, robots.txt, page canonicals, and prerendered metadata all
 * agree on one host (instead of echoing whatever hostname requested them).
 */
export const SITE_URL = "https://rxfit.ai";
export const APP_URL = "https://app.rxfit.ai";

/** Public routes prerendered/served as crawlable HTML (excludes dynamic /blog/:slug). */
export const STATIC_ROUTES = [
  "/",
  "/blog",
  "/compare",
  "/success",
  "/privacy",
  "/terms",
  "/contact",
] as const;
