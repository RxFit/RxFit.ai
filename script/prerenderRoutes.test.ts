/**
 * Guards the /admin routing contract on the build side: /admin must be
 * prerendered (or production serves a 404 shell for it) while staying OUT of
 * STATIC_ROUTES and the static sitemap entries (or it would leak into the
 * sitemap and internal-link validation). See also server/robots.test.ts for
 * the crawler-side half of the contract.
 */
import { describe, it, expect } from "vitest";
import { EXTRA_PRERENDER_ROUTES, prerenderRoutePaths } from "./prerenderRoutes";
import { STATIC_ROUTES } from "../shared/site";
import { STATIC_SITEMAP_URLS, STATIC_PAGE_DATES } from "../server/sitemapStatic";

describe("prerender route list", () => {
  it("includes /admin so production serves it with HTTP 200", () => {
    expect(EXTRA_PRERENDER_ROUTES).toContain("/admin");
    expect(prerenderRoutePaths([])).toContain("/admin");
  });

  it("includes every STATIC_ROUTES route and maps blog slugs", () => {
    const routes = prerenderRoutePaths(["post-a", "post-b"]);
    for (const r of STATIC_ROUTES) expect(routes).toContain(r);
    expect(routes).toContain("/blog/post-a");
    expect(routes).toContain("/blog/post-b");
  });

  it("keeps /admin OUT of STATIC_ROUTES (sitemap + link-validation surface)", () => {
    expect(STATIC_ROUTES).not.toContain("/admin");
  });

  it("keeps /admin OUT of the static sitemap entries", () => {
    expect(STATIC_SITEMAP_URLS.map((u) => u.loc)).not.toContain("/admin");
    expect(Object.keys(STATIC_PAGE_DATES)).not.toContain("/admin");
  });
});
