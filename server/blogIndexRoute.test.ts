/**
 * Route-level tests for the GET /blog index contract
 * (createBlogIndexHandler in server/blogIndexRoute.ts):
 *
 * - MDX + DB posts merged into one 200 crawler HTML page — exercised through
 *   the REAL renderBlogIndexPage with a minimal valid template, so a crawler
 *   that doesn't run JS sees AI-published posts in the index
 * - MDX wins slug conflicts (a build-time post supersedes a DB post with the
 *   same slug — no duplicate cards)
 * - merged list is sorted newest-first regardless of source
 * - DB error → next() so the prerendered static index serves instead of a 500
 * - MDX read error → next() (same degradation)
 * - render returns null (dev — no template) → next()
 *
 * blogSsr.index.test.ts covers WHAT the rendered index contains; these tests
 * cover WHETHER the route merges and serves it at all — a routes.ts refactor
 * that breaks the merge or the fall-through would pass every render test
 * while crawlers silently lose AI posts from the index.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";
import { createBlogIndexHandler, mergeIndexCards } from "./blogIndexRoute";
import { renderBlogIndexPage, type BlogIndexCard } from "./blogSsr";
import fs from "fs";
import path from "path";

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

const MDX_CARD: BlogIndexCard = {
  slug: "mdx-static-post",
  title: "An MDX Static Post",
  description: "A build-time MDX post.",
  date: "2026-06-02",
  heroImage: "/blog/mdx-static-post/hero.jpg",
  author: "Dr. Mara Ellison",
  tags: ["Wearables"],
  readingMinutes: 8,
};

function dbPost(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  return {
    id: "index-route-test-id",
    slug: "db-generated-post",
    title: "A DB Generated Post",
    seoTitle: "A DB Generated Post | RxFit.ai",
    description: "An AI-published post that only exists in the database.",
    keywordTheme: "hrv",
    targetKeyword: "hrv training",
    pillar: "recovery",
    tags: ["HRV"],
    author: "Coach Test",
    authorBio: "Test coach bio.",
    heroImage: "/blog-heroes/db-generated-post.webp",
    recommendedPlan: "kickstart",
    tldr: "Index route fixture.",
    keyTakeaways: ["One takeaway"],
    bodyMarkdown: "## Heading\n\nBody text.",
    faq: [],
    toc: [],
    readingMinutes: 6,
    sources: [],
    status: "published",
    date: "2026-07-10",
    createdAt: new Date(),
    ...overrides,
  } as GeneratedPost;
}

function mockRes() {
  const res = {
    statusCode: null as number | null,
    contentType: null as string | null,
    body: null as string | null,
    status: vi.fn(),
    type: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.type.mockImplementation((t: string) => {
    res.contentType = t;
    return res;
  });
  res.send.mockImplementation((b: string) => {
    res.body = b;
    return res;
  });
  return res;
}

function run(
  deps: Parameters<typeof createBlogIndexHandler>[0],
): Promise<{ res: ReturnType<typeof mockRes>; next: NextFunction }> {
  const handler = createBlogIndexHandler(deps);
  const req = {} as Request;
  const res = mockRes();
  const next = vi.fn();
  return handler(req, res as unknown as Response, next).then(() => ({ res, next }));
}

describe("GET /blog index route", () => {
  it("serves MDX + DB posts merged as 200 crawler HTML through the real renderer", async () => {
    const { res, next } = await run({
      readMdxCards: () => [MDX_CARD],
      getPublishedPosts: async () => [dbPost()],
      renderPage: (posts) => renderBlogIndexPage(posts, TEMPLATE),
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("html");
    expect(res.body).toContain('data-runtime-ssr="true"');
    // Both sources visible in the card grid with crawlable links.
    expect(res.body).toContain('href="/blog/db-generated-post"');
    expect(res.body).toContain('href="/blog/mdx-static-post"');
    // DB post also present in the Blog/ItemList JSON-LD.
    expect(res.body).toContain("/blog/db-generated-post");
    expect(res.body).not.toContain("<!--app-html-->");
  });

  it("lets MDX win slug conflicts (no duplicate card for the same slug)", async () => {
    const renderPage = vi.fn().mockReturnValue("<html>ok</html>");
    const conflicting = dbPost({
      slug: MDX_CARD.slug,
      title: "DB Post Shadowed By MDX",
    });
    await run({
      readMdxCards: () => [MDX_CARD],
      getPublishedPosts: async () => [conflicting, dbPost()],
      renderPage,
    });

    const rendered = renderPage.mock.calls[0][0] as BlogIndexCard[];
    expect(rendered).toHaveLength(2);
    const bySlug = rendered.filter((p) => p.slug === MDX_CARD.slug);
    expect(bySlug).toHaveLength(1);
    expect(bySlug[0].title).toBe(MDX_CARD.title); // the MDX card, not the DB one
    expect(rendered.some((p) => p.slug === "db-generated-post")).toBe(true);
  });

  it("sorts the merged list newest-first regardless of source", async () => {
    const renderPage = vi.fn().mockReturnValue("<html>ok</html>");
    await run({
      readMdxCards: () => [
        { ...MDX_CARD, slug: "old-mdx", date: "2026-01-15" },
        { ...MDX_CARD, slug: "newest-mdx", date: "2026-07-15" },
      ],
      getPublishedPosts: async () => [
        dbPost({ slug: "mid-db", date: "2026-05-01" }),
        dbPost({ slug: "recent-db", date: "2026-07-12" }),
      ],
      renderPage,
    });

    const rendered = renderPage.mock.calls[0][0] as BlogIndexCard[];
    expect(rendered.map((p) => p.slug)).toEqual([
      "newest-mdx",
      "recent-db",
      "mid-db",
      "old-mdx",
    ]);
  });

  it("falls through (not 500) when the DB throws, so the prerendered index serves", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const renderPage = vi.fn();
    const { res, next } = await run({
      readMdxCards: () => [MDX_CARD],
      getPublishedPosts: async () => {
        throw new Error("db down");
      },
      renderPage,
    });
    errorSpy.mockRestore();

    expect(next).toHaveBeenCalledOnce();
    expect(renderPage).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("falls through (not 500) when reading MDX cards throws", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const renderPage = vi.fn();
    const { res, next } = await run({
      readMdxCards: () => {
        throw new Error("fs unavailable");
      },
      getPublishedPosts: async () => [dbPost()],
      renderPage,
    });
    errorSpy.mockRestore();

    expect(next).toHaveBeenCalledOnce();
    expect(renderPage).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("falls through when the renderer returns null (dev — no template)", async () => {
    const { res, next } = await run({
      readMdxCards: () => [MDX_CARD],
      getPublishedPosts: async () => [dbPost()],
      // The real renderer with no template override and no dist build → null.
      renderPage: () => null,
    });

    expect(next).toHaveBeenCalledOnce();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe("mergeIndexCards", () => {
  it("maps DB null fields to undefined so the renderer's optional handling applies", () => {
    const merged = mergeIndexCards(
      [],
      [dbPost({ heroImage: null, updatedDate: null })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].heroImage).toBeUndefined();
    expect(merged[0].updatedDate).toBeUndefined();
  });
});

describe("routes.ts wiring", () => {
  it("registers /blog with createBlogIndexHandler (merge can't silently revert to an untested inline handler)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf-8");
    expect(source).toContain('from "./blogIndexRoute"');
    const registration = source.match(/app\.get\(\s*"\/blog",[\s\S]{0,400}?\);/);
    expect(registration).not.toBeNull();
    expect(registration![0]).toContain("createBlogIndexHandler");
    expect(registration![0]).toContain("readMdxIndexCards");
    expect(registration![0]).toContain("getPublishedGeneratedPosts");
    expect(registration![0]).toContain("renderBlogIndexPage");
  });

  it("passes the real, unit-tested MDX reader (not a re-inlined copy) into the handler", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf-8");
    // The reader must come from the extracted, unit-tested module...
    expect(source).toContain('from "./mdxIndexCards"');
    // ...and routes.ts must not grow its own frontmatter parser or card
    // mapper again (the exact regression this extraction closed: an inline
    // copy would be invisible to mdxIndexCards.test.ts).
    expect(source).not.toContain("function parseFrontmatter");
    expect(source).not.toMatch(/readingMinutes:\s*Math\.max/);
  });
});
