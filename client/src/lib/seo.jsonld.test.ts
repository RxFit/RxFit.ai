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
    expect(a.author).toEqual({ "@type": "Person", name: "Coach Test", url: SITE_URL });
    expect(a.publisher).toEqual({ "@id": `${SITE_URL}/#organization` });
  });

  it("emits a BreadcrumbList with ordered absolute items", () => {
    const crumbs = byType("BreadcrumbList");
    expect(crumbs).toHaveLength(1);
    const items = (crumbs[0] as { itemListElement: Record<string, unknown>[] }).itemListElement;
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` });
    expect(items[2]).toMatchObject({ position: 3, item: `${SITE_URL}/blog/test-post` });
  });

  it("does not emit an incomplete Article when its publication date is absent", () => {
    const { jsonLd: minimal } = computeSeo({
      title: "T",
      description: "D",
      canonicalPath: "/blog/x",
      type: "article",
    });
    expect(minimal.some((j) => j["@type"] === "Article")).toBe(false);
  });

  it("emits no Article or BreadcrumbList for a plain website route", () => {
    const { jsonLd: site } = computeSeo({ title: "T", description: "D", canonicalPath: "/" });
    expect(site.some((j) => j["@type"] === "Article")).toBe(false);
    expect(site.some((j) => j["@type"] === "BreadcrumbList")).toBe(false);
  });
});

describe("computeSeo social image metadata", () => {
  it("emits dimensions for the known fallback image and accessible Twitter alt text", () => {
    const { metas } = computeSeo({
      title: "Fallback Image Page",
      description: "D",
      canonicalPath: "/fallback",
    });
    const meta = Object.fromEntries(metas.map(({ key, content }) => [key, content]));

    expect(meta["og:image"]).toBe(`${SITE_URL}/opengraph.jpg`);
    expect(meta["og:image:width"]).toBe("1280");
    expect(meta["og:image:height"]).toBe("720");
    expect(meta["twitter:image:alt"]).toBe("Fallback Image Page — RxFit.ai");
  });

  it("emits known dimensions when the default image is passed explicitly", () => {
    const { metas } = computeSeo({
      title: "Explicit Default Image Page",
      description: "D",
      canonicalPath: "/explicit-default",
      image: "/opengraph.jpg",
    });
    const meta = Object.fromEntries(metas.map(({ key, content }) => [key, content]));

    expect(meta["og:image"]).toBe(`${SITE_URL}/opengraph.jpg`);
    expect(meta["og:image:width"]).toBe("1280");
    expect(meta["og:image:height"]).toBe("720");
  });

  it("does not claim fallback dimensions for a custom image of unknown size", () => {
    const { metas } = computeSeo(ARTICLE_PROPS);
    const meta = Object.fromEntries(metas.map(({ key, content }) => [key, content]));

    expect(meta["og:image:width"]).toBeUndefined();
    expect(meta["og:image:height"]).toBeUndefined();
    expect(meta["twitter:image:alt"]).toBe("Short SEO Title | RxFit.ai — RxFit.ai");
  });
});
