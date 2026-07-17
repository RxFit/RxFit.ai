/**
 * Route-level tests for the GET /blog/:slug dispatch contract
 * (createBlogSlugHandler in server/blogSlugRoute.ts):
 *
 * - published DB slug → 200 crawler HTML (data-runtime-ssr) — exercised
 *   through the REAL renderGeneratedPostPage with a minimal valid template
 * - unknown/MDX slug (DB miss) → next() so static files / SPA shell serve it
 * - draft or archived DB post → next() without ever rendering (no leak)
 * - render returns null (dev — no template) → next()
 * - storage throws → next() (degrade to SPA shell, not a 500)
 *
 * blogSsr.render.test.ts covers WHAT the rendered page contains; these tests
 * cover WHETHER the route serves it at all — a refactor that stops checking
 * `status` or breaks the fall-through would pass every render test while
 * serving wrong content to crawlers.
 */
import { describe, it, expect, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import type { GeneratedPost } from "@shared/schema";
import { createBlogSlugHandler } from "./blogSlugRoute";
import { renderGeneratedPostPage } from "./blogSsr";
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

const POST: GeneratedPost = {
  id: "route-test-id",
  slug: "route-test-post",
  title: "Route Test Post",
  seoTitle: "Route Test Post | RxFit.ai",
  description: "Fixture post for the /blog/:slug dispatch tests.",
  keywordTheme: "hrv",
  targetKeyword: "hrv training",
  pillar: "recovery",
  tags: ["HRV"],
  author: "Coach Test",
  authorBio: "Test coach bio.",
  heroImage: null,
  recommendedPlan: "kickstart",
  tldr: "Route dispatch fixture.",
  keyTakeaways: ["One takeaway"],
  bodyMarkdown: "## Heading\n\nBody text.",
  faq: [],
  toc: [],
  readingMinutes: 3,
  sources: [],
  status: "published",
  date: "2026-07-01",
  createdAt: new Date(),
};

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
  deps: Parameters<typeof createBlogSlugHandler>[0],
  slug = POST.slug,
): Promise<{ res: ReturnType<typeof mockRes>; next: NextFunction }> {
  const handler = createBlogSlugHandler(deps);
  const req = { params: { slug } } as unknown as Request;
  const res = mockRes();
  const next = vi.fn();
  return handler(req, res as unknown as Response, next).then(() => ({ res, next }));
}

describe("GET /blog/:slug dispatch", () => {
  it("serves a published DB post as 200 crawler HTML through the real renderer", async () => {
    const getPostBySlug = vi.fn().mockResolvedValue(POST);
    const { res, next } = await run({
      getPostBySlug,
      renderPage: (post) => renderGeneratedPostPage(post, TEMPLATE),
    });

    expect(getPostBySlug).toHaveBeenCalledWith(POST.slug);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.contentType).toBe("html");
    expect(res.body).toContain('data-runtime-ssr="true"');
    expect(res.body).toContain("Route Test Post");
    expect(res.body).not.toContain("<!--app-html-->");
  });

  it("falls through for an unknown or MDX slug (DB miss) without rendering", async () => {
    const renderPage = vi.fn();
    const { res, next } = await run(
      { getPostBySlug: vi.fn().mockResolvedValue(undefined), renderPage },
      "some-mdx-or-unknown-slug",
    );

    expect(next).toHaveBeenCalledOnce();
    expect(renderPage).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it.each(["draft", "archived"])(
    "never serves a %s DB post as crawler HTML (falls through without rendering)",
    async (status) => {
      const renderPage = vi.fn();
      const { res, next } = await run({
        getPostBySlug: vi.fn().mockResolvedValue({ ...POST, status }),
        renderPage,
      });

      expect(next).toHaveBeenCalledOnce();
      expect(renderPage).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    },
  );

  it("falls through when the renderer returns null (dev — no template)", async () => {
    const { res, next } = await run({
      getPostBySlug: vi.fn().mockResolvedValue(POST),
      // The real renderer with no template override and no dist build → null.
      renderPage: () => null,
    });

    expect(next).toHaveBeenCalledOnce();
    expect(res.send).not.toHaveBeenCalled();
  });

  it("falls through (not 500) when storage throws, so crawlers get the SPA shell", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { res, next } = await run({
      getPostBySlug: vi.fn().mockRejectedValue(new Error("db down")),
      renderPage: vi.fn(),
    });
    errorSpy.mockRestore();

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });
});

describe("routes.ts wiring", () => {
  it("registers /blog/:slug with createBlogSlugHandler (dispatch can't silently revert to an untested inline handler)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "routes.ts"), "utf-8");
    expect(source).toContain('from "./blogSlugRoute"');
    const registration = source.match(/app\.get\(\s*"\/blog\/:slug",[\s\S]{0,300}?\);/);
    expect(registration).not.toBeNull();
    expect(registration![0]).toContain("createBlogSlugHandler");
    expect(registration![0]).toContain("getGeneratedPostBySlug");
    expect(registration![0]).toContain("renderGeneratedPostPage");
  });
});
