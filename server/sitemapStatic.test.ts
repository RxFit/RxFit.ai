/**
 * Guards against a static route silently dropping out of the sitemap:
 * /compare (and every other public route) is registered in three places —
 * shared/site.ts STATIC_ROUTES, STATIC_SITEMAP_URLS, and STATIC_PAGE_DATES.
 * This test fails if they ever drift apart.
 */
import { describe, it, expect } from "vitest";
import { STATIC_ROUTES } from "../shared/site";
import {
  STATIC_PAGE_DATES,
  STATIC_SITEMAP_URLS,
  SITEMAP_EXCLUDED_ROUTES,
} from "./sitemapStatic";

const expectedRoutes = STATIC_ROUTES.filter(
  (r) => !SITEMAP_EXCLUDED_ROUTES.includes(r),
);

describe("static sitemap consistency", () => {
  it("every public STATIC_ROUTES entry (except excluded ones) is in the sitemap", () => {
    const sitemapLocs = new Set(STATIC_SITEMAP_URLS.map((u) => u.loc));
    for (const route of expectedRoutes) {
      expect(sitemapLocs, `route ${route} missing from STATIC_SITEMAP_URLS`).toContain(route);
    }
  });

  it("every public STATIC_ROUTES entry has a STATIC_PAGE_DATES date", () => {
    for (const route of expectedRoutes) {
      expect(
        STATIC_PAGE_DATES[route],
        `route ${route} missing from STATIC_PAGE_DATES`,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("the sitemap contains no unknown routes or missing dates", () => {
    const known = new Set<string>(expectedRoutes);
    for (const u of STATIC_SITEMAP_URLS) {
      expect(known, `sitemap entry ${u.loc} is not in STATIC_ROUTES`).toContain(u.loc);
      expect(u.lastmod, `sitemap entry ${u.loc} has no lastmod`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Excluded routes must stay out of the sitemap.
    const locs = new Set(STATIC_SITEMAP_URLS.map((u) => u.loc));
    for (const route of SITEMAP_EXCLUDED_ROUTES) {
      expect(locs).not.toContain(route);
    }
  });
});
