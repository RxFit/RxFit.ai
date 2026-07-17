/**
 * Smoke-tests the OUTPUT of renderBlogIndexPage(): the crawler-facing /blog
 * page must contain ALL published posts (MDX + DB, already merged by the
 * route) in both the visible card grid and the Blog/ItemList JSON-LD, so
 * crawlers that don't execute JavaScript discover AI-published posts from
 * the index. Mirrors the fixture-template approach of blogSsr.render.test.ts.
 */
import { describe, it, expect } from "vitest";
import { renderBlogIndexPage, verifySsrTemplateMarkers, type BlogIndexCard } from "./blogSsr";
import { BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION } from "@shared/blog-index-seo";
import { SITE_URL } from "@shared/site";

const TEMPLATE = `<!DOCTYPE html>
<html>
  <head>
    <!-- seo:start -->
    <title>RxFit.ai default</title>
    <!-- seo:end -->
  </head>
  <body>
    <div id="root"><!--app-html--></div>
  </body>
</html>`;

const POSTS: BlogIndexCard[] = [
  {
    slug: "db-generated-post",
    title: "A DB Generated Post & More",
    description: "An AI-published post that only exists in the database.",
    date: "2026-07-10",
    updatedDate: "2026-07-12",
    heroImage: "/blog-heroes/db-generated-post.webp",
    author: "Coach Test",
    tags: ["HRV", "Recovery", "Extra"],
    readingMinutes: 6,
  },
  {
    slug: "mdx-static-post",
    title: "An MDX Static Post",
    description: "A build-time MDX post.",
    date: "2026-06-02",
    heroImage: "/blog/mdx-static-post/hero.jpg",
    author: "Dr. Mara Ellison",
    tags: ["Wearables"],
    readingMinutes: 8,
  },
];

function extractJsonLd(page: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script type="application\/ld\+json" data-seo-jsonld="true">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(page))) out.push(JSON.parse(m[1]));
  return out;
}

describe("renderBlogIndexPage output", () => {
  const page = renderBlogIndexPage(POSTS, TEMPLATE)!;

  it("uses a fixture template the marker verifier accepts", () => {
    expect(verifySsrTemplateMarkers(TEMPLATE)).toEqual([]);
    expect(page).not.toBeNull();
  });

  it("injects the index head tags (title, canonical, description, og)", () => {
    expect(page).toContain(`<title>${BLOG_INDEX_TITLE.replace(/&/g, "&amp;")}</title>`);
    expect(page).not.toContain("RxFit.ai default");
    expect(page).toContain(`<link rel="canonical" href="${SITE_URL}/blog" data-seo="true" />`);
    expect(page).toContain(
      `<meta name="description" content="${BLOG_INDEX_DESCRIPTION}" data-seo="true" />`,
    );
    expect(page).toContain('<meta property="og:type" content="website" data-seo="true" />');
  });

  it("emits Blog/ItemList JSON-LD listing every post (DB posts included)", () => {
    const jsonLd = extractJsonLd(page);
    expect(jsonLd).toHaveLength(4); // Organization, WebSite, BreadcrumbList, Blog
    const blog = jsonLd.find((j: any) => j["@type"] === "Blog") as any;
    expect(blog).toBeTruthy();
    expect(blog.url).toBe(`${SITE_URL}/blog`);
    const list = blog.mainEntity;
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement[0].url).toBe(`${SITE_URL}/blog/db-generated-post`);
    expect(list.itemListElement[0].item.headline).toBe("A DB Generated Post & More");
    expect(list.itemListElement[0].item.dateModified).toBe("2026-07-12");
    expect(list.itemListElement[1].url).toBe(`${SITE_URL}/blog/mdx-static-post`);
  });

  it("renders every post as a visible card with a crawlable link", () => {
    expect(page).toContain('<div id="root" data-runtime-ssr="true">');
    expect(page).not.toContain("<!--app-html-->");
    expect(page).toContain('href="/blog/db-generated-post"');
    expect(page).toContain('href="/blog/mdx-static-post"');
    expect(page).toContain("A DB Generated Post &amp; More");
    expect(page).toContain("An AI-published post that only exists in the database.");
    expect(page).toContain('src="/blog-heroes/db-generated-post.webp"');
    expect(page).toContain("6 min read");
  });

  it("renders an empty grid without crashing when no posts exist", () => {
    const empty = renderBlogIndexPage([], TEMPLATE)!;
    const blog = extractJsonLd(empty).find((j: any) => j["@type"] === "Blog") as any;
    expect(blog.mainEntity.numberOfItems).toBe(0);
  });
});
