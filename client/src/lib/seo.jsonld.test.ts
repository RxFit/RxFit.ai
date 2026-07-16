/**
 * Shape guard for the blog's structured data. Landing and /compare JSON-LD
 * are guarded by shared constants + shape tests; the blog's Article +
 * BreadcrumbList + Organization JSON-LD is computed inside seo.tsx, so a
 * refactor there could silently drop Article JSON-LD from every post. These
 * tests pin the computeSeo() output for an article-typed route (the props
 * BlogPost.tsx passes — the wiring itself is guarded by
 * validateBlogPostJsonLdWiring in scripts/validate-seo.mjs).
 */
import { describe, it, expect } from "vitest";
import { computeSeo, ORGANIZATION_JSONLD, WEBSITE_JSONLD } from "./seo";
import { SITE_URL, APP_URL } from "@shared/site";

const ARTICLE_PROPS = {
  title: "Short SEO Title | RxFit.ai",
  schemaHeadline: "The Full Editorial Article Title",
  description: "A test description.",
  canonicalPath: "/blog/test-post",
  type: "article" as const,
  image: "/images/blog/test.webp",
  article: {
    publishedTime: "2026-07-01",
    modifiedTime: "2026-07-10",
    author: "Coach Test",
    tags: ["HRV"],
  },
  breadcrumbs: [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: "The Full Editorial Article Title", path: "/blog/test-post" },
  ],
};

describe("computeSeo JSON-LD for a blog post", () => {
  const { jsonLd } = computeSeo(ARTICLE_PROPS);
  const byType = (t: string) => jsonLd.filter((j) => j["@type"] === t);

  it("always includes Organization (with the app.rxfit.ai sameAs) and WebSite", () => {
    expect(byType("Organization")).toContainEqual(ORGANIZATION_JSONLD);
    expect(ORGANIZATION_JSONLD.sameAs).toContain(APP_URL);
    expect(byType("WebSite")).toContainEqual(WEBSITE_JSONLD);
  });

  it("emits exactly one Article with the schema headline, canonical url, and author", () => {
    const articles = byType("Article");
    expect(articles).toHaveLength(1);
    const a = articles[0] as Record<string, unknown>;
    expect(a.headline).toBe("The Full Editorial Article Title");
    expect(a.url).toBe(`${SITE_URL}/blog/test-post`);
    expect(a.mainEntityOfPage).toBe(`${SITE_URL}/blog/test-post`);
    expect(a.image).toBe(`${SITE_URL}/images/blog/test.webp`);
    expect(a.datePublished).toBe("2026-07-01");
    expect(a.dateModified).toBe("2026-07-10");
    expect(a.author).toEqual({ "@type": "Person", name: "Coach Test" });
    expect(a.publisher).toMatchObject({ "@type": "Organization", name: "RxFit.ai" });
  });

  it("emits a BreadcrumbList with ordered absolute items", () => {
    const crumbs = byType("BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    const items = (crumbs[0] as { itemListElement: Record<string, unknown>[] }).itemListElement;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` });
    expect(items[2]).toMatchObject({ position: 3, item: `${SITE_URL}/blog/test-post` });
  });

  it("falls back to title as headline and Organization author when not provided", () => {
    const { jsonLd: minimal } = computeSeo({
      title: "T",
      description: "D",
      canonicalPath: "/blog/x",
      type: "article",
    });
    const a = minimal.find((j) => j["@type"] === "Article") as Record<string, unknown>;
    expect(a.headline).toBe("T");
    expect(a.author).toEqual({ "@type": "Organization", name: "RxFit.ai" });
    expect(a.image).toBe(`${SITE_URL}/opengraph.jpg`);
  });

  it("emits no Article or BreadcrumbList for a plain website route", () => {
    const { jsonLd: site } = computeSeo({ title: "T", description: "D", canonicalPath: "/" });
    expect(site.some((j) => j["@type"] === "Article")).toBe(false);
    expect(site.some((j) => j["@type"] === "BreadcrumbList")).toBe(false);
  });
});
