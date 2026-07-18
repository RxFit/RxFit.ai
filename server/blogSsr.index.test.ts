/**
 * Smoke-tests the OUTPUT of renderBlogIndexPage(): the crawler-facing /blog
 * page must contain ALL published posts (MDX + DB, already merged by the
 * route) in both the visible card grid and the Blog/ItemList JSON-LD, so
 * crawlers that don't execute JavaScript discover AI-published posts from
 * the index. Mirrors the fixture-template approach of blogSsr.render.test.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { renderBlogIndexPage, verifySsrTemplateMarkers, type BlogIndexCard } from "./blogSsr";
import {
  BLOG_INDEX_TITLE,
  BLOG_INDEX_DESCRIPTION,
  BLOG_INDEX_HERO_BADGE,
  BLOG_INDEX_HERO_HEADING_LEAD,
  BLOG_INDEX_HERO_HEADING_ACCENT,
  BLOG_INDEX_HERO_SUBTITLE,
} from "@shared/blog-index-seo";
import {
  BLOG_CARD_TAG_LIMIT,
  BLOG_INDEX_GRID_CLASS,
  BLOG_CARD_ARTICLE_CLASS,
  BLOG_CARD_HERO_FRAME_CLASS,
  BLOG_CARD_HERO_IMG_CLASS,
  BLOG_CARD_BODY_CLASS,
  BLOG_CARD_TAG_ROW_CLASS,
  BLOG_CARD_TAG_CHIP_CLASS,
  BLOG_CARD_TITLE_CLASS,
  BLOG_CARD_DESCRIPTION_CLASS,
  BLOG_CARD_FOOTER_CLASS,
  formatBlogCardDate,
  blogCardReadingTime,
} from "@shared/blog-index-card";
import { SITE_URL } from "@shared/site";

/** Every shared card/grid class constant, keyed by export name (used by both
 *  the SSR-output assertions and the source drift guards below). */
const CARD_CLASS_CONSTANTS: Record<string, string> = {
  BLOG_INDEX_GRID_CLASS,
  BLOG_CARD_ARTICLE_CLASS,
  BLOG_CARD_HERO_FRAME_CLASS,
  BLOG_CARD_HERO_IMG_CLASS,
  BLOG_CARD_BODY_CLASS,
  BLOG_CARD_TAG_ROW_CLASS,
  BLOG_CARD_TAG_CHIP_CLASS,
  BLOG_CARD_TITLE_CLASS,
  BLOG_CARD_DESCRIPTION_CLASS,
  BLOG_CARD_FOOTER_CLASS,
};

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

  it("renders the shared hero copy (badge, heading, subtitle) in the crawler HTML", () => {
    // Mirror the renderer's escaping so the test stays correct if the copy
    // ever gains &, <, or quote characters.
    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    expect(page).toContain(`>${esc(BLOG_INDEX_HERO_BADGE)}</div>`);
    expect(page).toContain(
      `${esc(BLOG_INDEX_HERO_HEADING_LEAD)} <span class="text-gradient-teal">${esc(BLOG_INDEX_HERO_HEADING_ACCENT)}</span>`,
    );
    expect(page).toContain(`>${esc(BLOG_INDEX_HERO_SUBTITLE)}</p>`);
  });
});

/**
 * Drift guard: the client page must render the SAME shared hero constants the
 * SSR uses. If someone edits the copy inline in BlogIndex.tsx instead of in
 * shared/blog-index-seo.ts, crawlers would see stale copy — fail loudly here.
 */
describe("BlogIndex.tsx hero copy wiring (drift guard)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/BlogIndex.tsx"),
    "utf-8",
  );

  it("imports every shared hero constant from @shared/blog-index-seo", () => {
    for (const name of [
      "BLOG_INDEX_HERO_BADGE",
      "BLOG_INDEX_HERO_HEADING_LEAD",
      "BLOG_INDEX_HERO_HEADING_ACCENT",
      "BLOG_INDEX_HERO_SUBTITLE",
    ]) {
      // Imported once, then rendered in JSX ({CONSTANT}) — 2+ occurrences.
      const uses = src.split(name).length - 1;
      expect(uses, `${name} must be imported AND rendered in BlogIndex.tsx`).toBeGreaterThanOrEqual(2);
    }
    expect(src).toMatch(/from "@shared\/blog-index-seo"/);
  });

  it("does not hardcode the hero copy inline (must come from the shared constants)", () => {
    for (const literal of [
      BLOG_INDEX_HERO_BADGE,
      BLOG_INDEX_HERO_HEADING_LEAD,
      BLOG_INDEX_HERO_HEADING_ACCENT,
      BLOG_INDEX_HERO_SUBTITLE,
    ]) {
      expect(src, `hero copy "${literal.slice(0, 40)}…" must not be duplicated inline`).not.toContain(literal);
    }
  });
});

/**
 * Card markup drift guards: the post cards on /blog are rendered twice — as
 * JSX for visitors (BlogIndex.tsx) and as raw HTML for crawlers
 * (buildIndexCardHtml in blogSsr.ts). Both must source their class lists, the
 * visible-tag cap, and the footer strings from shared/blog-index-card.ts, so
 * a client redesign can't silently leave crawlers a stale card.
 */
describe("crawler card markup uses the shared card contract", () => {
  const page = renderBlogIndexPage(POSTS, TEMPLATE)!;

  it("renders every shared card/grid class constant in the crawler HTML", () => {
    for (const [name, cls] of Object.entries(CARD_CLASS_CONSTANTS)) {
      expect(page, `${name} must appear as a class attribute in the SSR card grid`).toContain(
        `class="${cls}"`,
      );
    }
  });

  it("caps visible tags at BLOG_CARD_TAG_LIMIT", () => {
    // The fixture's first post carries MORE tags than the cap so this test
    // actually exercises the slice.
    expect(POSTS[0].tags.length).toBeGreaterThan(BLOG_CARD_TAG_LIMIT);
    expect(page).toContain(">HRV</span>");
    expect(page).toContain(">Recovery</span>");
    expect(page).not.toContain(">Extra</span>");
  });

  it("renders the shared footer strings (formatted date + reading time)", () => {
    expect(page).toContain(formatBlogCardDate("2026-07-10"));
    expect(page).toContain(blogCardReadingTime(6));
  });
});

describe("BlogIndex.tsx card markup wiring (drift guard)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/BlogIndex.tsx"),
    "utf-8",
  );

  it("imports and uses every shared card constant/helper", () => {
    expect(src).toMatch(/from "@shared\/blog-index-card"/);
    for (const name of [
      ...Object.keys(CARD_CLASS_CONSTANTS),
      "BLOG_CARD_TAG_LIMIT",
      "formatBlogCardDate",
      "blogCardReadingTime",
    ]) {
      // Imported once, then used in JSX — 2+ occurrences.
      const uses = src.split(name).length - 1;
      expect(uses, `${name} must be imported AND used in BlogIndex.tsx`).toBeGreaterThanOrEqual(2);
    }
  });

  it("does not hardcode the card class strings, tag cap, or footer label inline", () => {
    for (const [name, cls] of Object.entries(CARD_CLASS_CONSTANTS)) {
      expect(src, `class list of ${name} must not be duplicated inline`).not.toContain(cls);
    }
    expect(src, "tag cap must come from BLOG_CARD_TAG_LIMIT").not.toMatch(/\.slice\(0,\s*\d/);
    expect(src, '"min read" must come from blogCardReadingTime()').not.toContain("min read");
  });
});

describe("blogSsr.ts card markup wiring (drift guard)", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "./blogSsr.ts"), "utf-8");

  it("interpolates the shared constants instead of inlining the class strings", () => {
    expect(src).toMatch(/from "@shared\/blog-index-card"/);
    for (const name of Object.keys(CARD_CLASS_CONSTANTS)) {
      expect(src, `${name} must be interpolated into the card/grid HTML`).toContain(`\${${name}}`);
    }
    for (const [name, cls] of Object.entries(CARD_CLASS_CONSTANTS)) {
      expect(src, `class list of ${name} must not be duplicated inline`).not.toContain(cls);
    }
    expect(src, "tag cap must come from BLOG_CARD_TAG_LIMIT").toContain(
      ".slice(0, BLOG_CARD_TAG_LIMIT)",
    );
    expect(src, '"min read" must come from blogCardReadingTime()').not.toContain("min read");
    expect(
      src,
      "dates must come from formatBlogCardDate, not a local formatter",
    ).not.toContain("toLocaleDateString");
  });
});

/**
 * Post-page (/blog/:slug) byline drift guard: BlogPost.tsx renders the same
 * tag chips, byline dates, and reading-time label that blogSsr.ts
 * buildArticleHtml serves to crawlers. Both must source them from
 * shared/blog-index-card.ts — if BlogPost.tsx re-inlines the chip class
 * literal or a local date formatter, a shared-constant redesign would change
 * the crawler HTML while visitors keep the old style. Fail loudly here.
 */
describe("BlogPost.tsx tag/byline wiring (drift guard)", () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, "../client/src/pages/BlogPost.tsx"),
    "utf-8",
  );

  it("imports and uses the shared chip class, date formatter, and reading-time label", () => {
    expect(src).toMatch(/from "@shared\/blog-index-card"/);
    expect(src).toContain("className={BLOG_CARD_TAG_CHIP_CLASS}");
    expect(src).toContain("formatBlogCardDate(");
    expect(src).toContain("blogCardReadingTime(");
  });

  it("does not re-inline the chip class literal or a local date/reading-time formatter", () => {
    expect(
      src,
      "tag chip class list must not be duplicated inline",
    ).not.toContain(BLOG_CARD_TAG_CHIP_CLASS);
    expect(
      src,
      "byline dates must come from formatBlogCardDate, not a local formatter",
    ).not.toContain("toLocaleDateString");
    expect(src, "no local formatDate helper").not.toMatch(/function formatDate\(/);
    expect(src, '"min read" must come from blogCardReadingTime()').not.toContain("min read");
  });
});
