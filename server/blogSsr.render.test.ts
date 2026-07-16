/**
 * Smoke-tests the OUTPUT of renderGeneratedPostPage(): the marker checks in
 * blogSsr.template.test.ts prove the shell has the injection points, but a
 * regression inside buildHead/buildArticleHtml (e.g. a broken replace) would
 * still pass them. These tests feed a fixture GeneratedPost plus a minimal
 * valid template through the real render path and assert the three injection
 * outcomes: head tags (title/canonical/JSON-LD), the data-runtime-ssr root
 * marker, and the article body replacing the <!--app-html--> placeholder.
 */
import { describe, it, expect } from "vitest";
import type { GeneratedPost } from "@shared/schema";
import { renderGeneratedPostPage, verifySsrTemplateMarkers } from "./blogSsr";
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

const POST: GeneratedPost = {
  id: "test-id",
  slug: "hrv-smoke-test",
  title: "HRV Smoke Test Post",
  seoTitle: "HRV Smoke Test Post | RxFit.ai",
  description: "A fixture post used to smoke-test the runtime crawler HTML.",
  keywordTheme: "hrv",
  targetKeyword: "hrv training",
  pillar: "recovery",
  tags: ["HRV", "Recovery"],
  author: "Coach Test",
  authorBio: "Test coach bio.",
  heroImage: "/blog-heroes/hrv-smoke-test.webp",
  recommendedPlan: "kickstart",
  tldr: "HRV only helps when a coach turns it into action.",
  keyTakeaways: ["Trends beat single readings", "Act on the data"],
  bodyMarkdown: [
    "## Why HRV matters",
    "Wearable data only helps when someone acts on it daily.",
    "See [our blog](/blog) for more.",
    "## Reading the trend",
    "Look at 7-day trends, not single readings.",
  ].join("\n\n"),
  faq: [{ q: "What is HRV?", a: "Heart rate variability." }],
  toc: [],
  readingMinutes: 4,
  sources: [],
  status: "published",
  date: "2026-07-01",
  createdAt: new Date(),
};

describe("renderGeneratedPostPage output", () => {
  const page = renderGeneratedPostPage(POST, TEMPLATE)!;

  it("uses a fixture template the marker verifier accepts", () => {
    expect(verifySsrTemplateMarkers(TEMPLATE)).toEqual([]);
    expect(page).not.toBeNull();
  });

  it("injects the head tags: title, canonical, description, og/article meta", () => {
    expect(page).toContain("<title>HRV Smoke Test Post | RxFit.ai</title>");
    expect(page).not.toContain("RxFit.ai default"); // seo block replaced, not appended
    expect(page).toContain(
      `<link rel="canonical" href="${SITE_URL}/blog/hrv-smoke-test" data-seo="true" />`,
    );
    expect(page).toContain(
      '<meta name="description" content="A fixture post used to smoke-test the runtime crawler HTML." data-seo="true" />',
    );
    expect(page).toContain('<meta property="og:type" content="article" data-seo="true" />');
    expect(page).toContain(
      `<meta property="og:image" content="${SITE_URL}/blog-heroes/hrv-smoke-test.webp" data-seo="true" />`,
    );
  });

  it("injects the JSON-LD scripts (Article, BreadcrumbList, FAQPage)", () => {
    const scripts = page.match(/<script type="application\/ld\+json" data-seo-jsonld="true">([\s\S]*?)<\/script>/g) ?? [];
    expect(scripts.length).toBe(5); // Organization, WebSite, BreadcrumbList, Article, FAQPage
    const types = scripts.map((s) => JSON.parse(s.replace(/<\/?script[^>]*>/g, ""))["@type"]);
    expect(types).toContain("Article");
    expect(types).toContain("BreadcrumbList");
    expect(types).toContain("FAQPage");
    const article = scripts
      .map((s) => JSON.parse(s.replace(/<\/?script[^>]*>/g, "")))
      .find((j) => j["@type"] === "Article")!;
    expect(article.headline).toBe("HRV Smoke Test Post");
    expect(article.url).toBe(`${SITE_URL}/blog/hrv-smoke-test`);
  });

  it("marks the root with data-runtime-ssr so the client renders fresh", () => {
    expect(page).toContain('<div id="root" data-runtime-ssr="true">');
    expect(page).not.toContain('<div id="root"><!--app-html-->');
  });

  it("replaces the app-html placeholder with the rendered article body", () => {
    expect(page).not.toContain("<!--app-html-->");
    expect(page).toContain("Why HRV matters"); // H2 from markdown
    expect(page).toContain('<h2 id="why-hrv-matters"'); // TOC-matching heading id
    expect(page).toContain("HRV only helps when a coach turns it into action."); // TLDR
    expect(page).toContain("Frequently Asked Questions");
    expect(page).toContain("What is HRV?");
  });

  it("returns null when no template is available (dev fall-through)", () => {
    // No override and no dist/public/template.html in the test environment.
    expect(renderGeneratedPostPage(POST)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Edge-case fixtures — real generated posts vary: hero generation is   */
/* best-effort (can publish without an image), FAQ can come back empty, */
/* and titles/descriptions can contain characters needing HTML escaping.*/
/* ------------------------------------------------------------------ */

function jsonLdScripts(html: string): Record<string, any>[] {
  const scripts =
    html.match(/<script type="application\/ld\+json" data-seo-jsonld="true">([\s\S]*?)<\/script>/g) ?? [];
  return scripts.map((s) => JSON.parse(s.replace(/<\/?script[^>]*>/g, "")));
}

describe("renderGeneratedPostPage edge cases", () => {
  it("hero-less post: default OG image, no hero <img>, Article JSON-LD uses the default", () => {
    const page = renderGeneratedPostPage({ ...POST, heroImage: null }, TEMPLATE)!;
    expect(page).not.toBeNull();
    expect(page).toContain(
      `<meta property="og:image" content="${SITE_URL}/opengraph.jpg" data-seo="true" />`,
    );
    expect(page).toContain(
      `<meta name="twitter:image" content="${SITE_URL}/opengraph.jpg" data-seo="true" />`,
    );
    expect(page).not.toContain("blog-heroes");
    expect(page).not.toContain("<img"); // hero block omitted entirely
    const article = jsonLdScripts(page).find((j) => j["@type"] === "Article")!;
    expect(article.image).toBe(`${SITE_URL}/opengraph.jpg`);
  });

  it("empty faq: 4 JSON-LD scripts (no FAQPage) and no FAQ section", () => {
    const page = renderGeneratedPostPage({ ...POST, faq: [] }, TEMPLATE)!;
    const jsonLd = jsonLdScripts(page);
    expect(jsonLd.length).toBe(4); // Organization, WebSite, BreadcrumbList, Article
    expect(jsonLd.map((j) => j["@type"])).not.toContain("FAQPage");
    expect(page).not.toContain("Frequently Asked Questions");
  });

  it("title/description with quotes, ampersands, angle brackets: escaped in title, meta, and JSON-LD", () => {
    const page = renderGeneratedPostPage(
      {
        ...POST,
        title: `Zone 2 & "HRV" <basics>`,
        seoTitle: `Zone 2 & "HRV" <basics> | RxFit.ai`,
        description: `Data & coaching: "trends" > <single readings>.`,
      },
      TEMPLATE,
    )!;

    // Head: escaped everywhere, never raw.
    expect(page).toContain(
      "<title>Zone 2 &amp; &quot;HRV&quot; &lt;basics&gt; | RxFit.ai</title>",
    );
    expect(page).toContain(
      '<meta property="og:title" content="Zone 2 &amp; &quot;HRV&quot; &lt;basics&gt; | RxFit.ai" data-seo="true" />',
    );
    expect(page).toContain(
      '<meta name="description" content="Data &amp; coaching: &quot;trends&quot; &gt; &lt;single readings&gt;." data-seo="true" />',
    );
    expect(page).not.toContain(`<title>Zone 2 & "HRV" <basics>`);
    expect(page).not.toContain('content="Zone 2 & "');

    // Body: H1 and breadcrumb use the escaped title.
    expect(page).toContain("Zone 2 &amp; &quot;HRV&quot; &lt;basics&gt;</h1>");
    expect(page).toContain(
      'aria-current="page">Zone 2 &amp; &quot;HRV&quot; &lt;basics&gt;</span>',
    );

    // JSON-LD: parses back to the raw strings, with < escaped as \u003c in
    // the serialized script so it can never close the tag early.
    const article = jsonLdScripts(page).find((j) => j["@type"] === "Article")!;
    expect(article.headline).toBe(`Zone 2 & "HRV" <basics>`);
    expect(article.description).toBe(`Data & coaching: "trends" > <single readings>.`);
    const breadcrumbs = jsonLdScripts(page).find((j) => j["@type"] === "BreadcrumbList")!;
    expect(breadcrumbs.itemListElement[2].name).toBe(`Zone 2 & "HRV" <basics>`);
    expect(page).toContain("\\u003cbasics>"); // jsonLdSafe applied
    const rawScripts =
      page.match(/<script type="application\/ld\+json" data-seo-jsonld="true">([\s\S]*?)<\/script>/g) ?? [];
    for (const s of rawScripts) {
      expect(s.replace(/<\/?script[^>]*>/g, "")).not.toContain("<");
    }
  });
});
