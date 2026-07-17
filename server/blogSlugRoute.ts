import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";

export interface BlogSlugRouteDeps {
  getPostBySlug: (slug: string) => Promise<GeneratedPost | undefined>;
  renderPage: (post: GeneratedPost) => string | null;
  /**
   * Optional event-driven health reporter (reportBlogSsrServing in
   * server/credentialHealthCheck.ts): called with `true` after a published
   * DB post is served as crawler HTML, `false` when storage/render throws
   * and the route degrades to the SPA shell (crawlers silently get thin
   * client-side HTML for every AI post while the outage lasts). Called
   * fire-and-forget so monitoring can never break the route.
   */
  reportServing?: (ok: boolean, error?: unknown) => Promise<void>;
}

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
 * - storage/render throws → loud log + next() (a DB hiccup degrades to the
 *   SPA shell instead of a 500 for crawlers)
 */
export function createBlogSlugHandler(deps: BlogSlugRouteDeps) {
  const { getPostBySlug, renderPage, reportServing } = deps;

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
    try {
      const post = await getPostBySlug(req.params.slug);
      if (!post || post.status !== "published") return next();
      const page = renderPage(post);
      if (!page) return next();
      report(true);
      return res.status(200).type("html").send(page);
    } catch (error) {
      console.error("Error rendering generated post page:", error);
      report(false, error);
      return next();
    }
  };
}
