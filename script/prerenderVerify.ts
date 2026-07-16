const NOT_FOUND_CANONICAL = /<link\s+rel="canonical"\s+href="[^"]*\/404"/;

/**
 * Build-time gate for prerendered routes. Throws if a route that should be a
 * real page (HTTP 200) rendered empty or fell through to the NotFound page —
 * which would mean crawlers get a 404 shell for a URL the sitemap advertises.
 */
export function verifyPrerenderedRoute(
  route: string,
  html: string,
  head: string,
): void {
  if (!html || html.trim().length === 0) {
    throw new Error(
      `Prerender verification failed: route "${route}" rendered an empty body.`,
    );
  }
  if (NOT_FOUND_CANONICAL.test(head)) {
    throw new Error(
      `Prerender verification failed: route "${route}" rendered the NotFound (404) page. ` +
        `Is it registered in client/src/App.tsx? Every route in shared/site.ts STATIC_ROUTES ` +
        `must render a real page during prerendering.`,
    );
  }
}
