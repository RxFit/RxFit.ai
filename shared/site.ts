/**
 * Canonical site origins. Single source of truth for SEO URLs so that
 * sitemap.xml, robots.txt, page canonicals, and prerendered metadata all
 * agree on one host (instead of echoing whatever hostname requested them).
 */
export const SITE_URL = "https://rxfit.ai";
export const APP_URL = "https://app.rxfit.ai";

/**
 * The site's one-line positioning sentence, used as the `description` of every
 * Organization/WebSite JSON-LD emitter (client/src/lib/seo.tsx and the
 * crawler-facing server/blogSsr.ts heads) and mirrored in the static
 * client/index.html shell. Single source of truth so a copy change can't leave
 * stale structured data on some pages — shared/site-description.test.ts fails
 * the build if any emitter re-inlines the sentence or index.html drifts.
 * (CROSS-DOMAIN-SEO.md also quotes it as documentation; update it manually on
 * a copy change — docs aren't build-guarded.)
 */
export const SITE_DESCRIPTION =
  "RxFit.ai pairs an AI health dashboard with a real human coach to turn wearable data into daily, consistent action.";

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
