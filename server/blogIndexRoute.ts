import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";
import type { BlogIndexCard } from "./blogSsr";

export interface BlogIndexRouteDeps {
  /** Build-time MDX posts as index cards (frontmatter + word-count reading time). */
  readMdxCards: () => BlogIndexCard[];
  /** Published DB posts (the storage layer already filters to status "published"). */
  getPublishedPosts: () => Promise<GeneratedPost[]>;
  /** Renders the crawler HTML; null when the SSR template is unavailable (dev). */
  renderPage: (posts: BlogIndexCard[]) => string | null;
  /**
   * Optional event-driven health reporter (reportBlogSsrServing in
   * server/credentialHealthCheck.ts — the same "blogSsr" service the
   * /blog/:slug route reports into, since both degrade the same way when
   * the DB is down): called with `true` after the full merged (MDX + DB)
   * index is served as crawler HTML, `false` when the DB merge / MDX read
   * throws and the route degrades to the prerendered static index — which
   * omits every AI-published post, so crawlers silently see a stale index
   * while the outage lasts. Called fire-and-forget so monitoring can never
   * break the route.
   */
  reportServing?: (ok: boolean, error?: unknown) => Promise<void>;
}

/**
 * Pure merge used by the /blog index route: MDX cards win slug conflicts
 * (a build-time post supersedes a DB post with the same slug), and the
 * combined list is sorted newest-first so the crawler HTML mirrors the
 * client page's ordering.
 */
export function mergeIndexCards(
  mdxCards: BlogIndexCard[],
  dbPosts: GeneratedPost[],
): BlogIndexCard[] {
  const mdxSlugs = new Set(mdxCards.map((p) => p.slug));
  const dbCards: BlogIndexCard[] = dbPosts
    .filter((p) => !mdxSlugs.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      date: p.date,
      updatedDate: p.updatedDate ?? undefined,
      heroImage: p.heroImage ?? undefined,
      author: p.author,
      tags: p.tags,
      readingMinutes: p.readingMinutes,
    }));
  return [...mdxCards, ...dbCards].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

/**
 * The GET /blog handler, extracted into a factory with injectable
 * dependencies (same pattern as blogSlugRoute.ts / productsRoute.ts) so the
 * route contract is testable without a real DB, filesystem, or template:
 *
 * - MDX + DB posts merged (MDX wins slug conflicts), newest-first, rendered
 *   as 200 crawler HTML so JS-less crawlers see AI-published posts in the
 *   index, not just on their own pages
 * - render returns null (dev — no template) → next() so the Vite SPA shell
 *   or prerendered static file serves instead (deliberately NOT reported as
 *   an outage — dev has no template by design)
 * - storage or filesystem throws → loud log + reportServing(false) + next()
 *   (a DB hiccup degrades to the prerendered static index instead of a 500
 *   for crawlers — but that static index omits every AI-published post, so
 *   the owner is alerted via the blogSsr health service)
 */
export function createBlogIndexHandler(deps: BlogIndexRouteDeps) {
  const { readMdxCards, getPublishedPosts, renderPage, reportServing } = deps;

  // Fire-and-forget: monitoring must never break (or delay) the route.
  const report = (ok: boolean, error?: unknown) => {
    try {
      void reportServing?.(ok, error)?.catch(() => {});
    } catch {
      // ignore — reporter must never affect the response
    }
  };

  return async function blogIndexHandler(_req: Request, res: Response, next: NextFunction) {
    try {
      const posts = mergeIndexCards(readMdxCards(), await getPublishedPosts());
      const page = renderPage(posts);
      if (!page) return next();
      report(true);
      return res.status(200).type("html").send(page);
    } catch (error) {
      console.error("Error rendering blog index page:", error);
      report(false, error);
      return next();
    }
  };
}
