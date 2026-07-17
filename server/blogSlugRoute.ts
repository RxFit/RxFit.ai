import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";

export interface BlogSlugRouteDeps {
  getPostBySlug: (slug: string) => Promise<GeneratedPost | undefined>;
  renderPage: (post: GeneratedPost) => string | null;
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
  const { getPostBySlug, renderPage } = deps;

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
      return res.status(200).type("html").send(page);
    } catch (error) {
      console.error("Error rendering generated post page:", error);
      return next();
    }
  };
}
