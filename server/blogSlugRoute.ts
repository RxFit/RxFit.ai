import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";

export interface BlogSlugRouteDeps {
  getPostBySlug: (slug: string) => Promise<GeneratedPost | undefined>;
  renderPage: (post: GeneratedPost) => string | null;
  /**
   * Optional event-driven health reporter (reportBlogSsrServing in
   * server/credentialHealthCheck.ts): called with `true` after a published
   * DB post is served as crawler HTML, `false` when storage/render throws
   * and the route degrades to cached content or 503 (crawlers silently get
   * thin client-side HTML for every AI post while the outage lasts). Called
   * fire-and-forget so monitoring can never break the route.
   */
  reportServing?: (ok: boolean, error?: unknown) => Promise<void>;
}

/**
 * Minimal SEO-safe 503 body: tells crawlers (and humans) the page is
 * temporarily unavailable so Googlebot retries instead of de-indexing.
 */
const UNAVAILABLE_HTML =
  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Temporarily Unavailable</title></head>" +
  "<body><p>This page is temporarily unavailable. Please try again shortly.</p></body></html>";

/**
 * The GET /blog/:slug handler, extracted into a factory with injectable
 * dependencies so the dispatch contract can be exercised by route-level
 * tests (server/blogSlugRoute.test.ts) without a real DB or template file:
 *
 * - published DB post + template → 200 crawler HTML (data-runtime-ssr)
 * - unknown slug or MDX slug (DB miss) → next() so the prerendered static
 *   file or the SPA/404 shell is served instead
 * - draft/unpublished DB post → next() WITHOUT rendering (never leaked as
 *   crawler HTML)
 * - render returns null (dev — no template) → next() so Vite's SPA shell
 *   takes over
 * - storage/render throws + cached page for this slug → serve cached HTML
 *   with Cache-Control stale-if-error so crawlers keep seeing real content
 *   through transient DB failures (reported as an outage — cache is a
 *   mitigation, not a fix)
 * - storage/render throws + no cache for this slug → 503 + Retry-After so
 *   Googlebot retries instead of indexing the SPA shell
 *
 * The per-slug cache is scoped to each factory closure so each
 * createBlogSlugHandler call starts with an empty cache (tests stay
 * isolated; the single production call in routes.ts warms each slug's
 * entry on first serve).
 */
export function createBlogSlugHandler(deps: BlogSlugRouteDeps) {
  const { getPostBySlug, renderPage, reportServing } = deps;

  // Per-slug cache: warmed on first successful render for each slug.
  const slugCache = new Map<string, string>();

  // Fire-and-forget: monitoring must never break (or delay) the route.
  const report = (ok: boolean, error?: unknown) => {
    try {
      void reportServing?.(ok, error)?.catch(() => {});
    } catch {
      // ignore — reporter must never affect the response
    }
  };

  return async function blogSlugHandler(
    req: Request<{ slug: string }>,
    res: Response,
    next: NextFunction,
  ) {
    const slug = req.params.slug;
    try {
      const post = await getPostBySlug(slug);
      if (!post || post.status !== "published") return next();
      const page = renderPage(post);
      if (!page) return next();
      slugCache.set(slug, page);
      report(true);
      return res.status(200).type("html").send(page);
    } catch (error) {
      console.error("Error rendering generated post page:", error);
      report(false, error);
      const cached = slugCache.get(slug);
      if (cached) {
        // Serve the last-good render so crawlers keep seeing real content.
        res.setHeader("Cache-Control", "max-age=300, stale-if-error=86400");
        return res.status(200).type("html").send(cached);
      }
      // No cache yet — 503 + Retry-After preserves the Googlebot index entry.
      res.setHeader("Retry-After", "300");
      return res.status(503).type("html").send(UNAVAILABLE_HTML);
    }
  };
}
