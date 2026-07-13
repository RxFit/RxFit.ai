/**
 * Runtime crawler-facing HTML for DB-backed (AI-generated) blog posts.
 *
 * Prerendered MDX posts ship as static files; generated posts appear after the
 * deploy, so this module renders their full HTML on request: SEO head tags
 * (mirroring client/src/lib/seo.tsx) + the article body converted from
 * markdown. The client bundle then mounts and takes over (main.tsx sees the
 * data-runtime-ssr marker and renders fresh instead of hydrating).
 *
 * Requires dist/public/template.html — the raw SPA shell saved by the
 * prerender step before it overwrites index.html. In dev the template doesn't
 * exist and callers should fall through to the Vite SPA shell.
 */
import fs from "fs";
import path from "path";
import { marked } from "marked";
import type { GeneratedPost } from "@shared/schema";
import { extractToc } from "@shared/generated-blog";
import { SITE_URL, APP_URL } from "@shared/site";

const SEO_BLOCK = /<!-- seo:start[\s\S]*?seo:end -->/;

function templatePath(): string {
  // In production the bundle runs from dist/, alongside dist/public.
  return path.resolve(__dirname, "public", "template.html");
}

let templateCache: string | null | undefined;

function loadTemplate(): string | null {
  if (templateCache !== undefined) return templateCache;
  try {
    templateCache = fs.readFileSync(templatePath(), "utf-8");
  } catch {
    templateCache = null;
  }
  return templateCache;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonLdSafe(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/* ------------------------------------------------------------------ */
/* Head tags — mirrors computeSeo() in client/src/lib/seo.tsx           */
/* ------------------------------------------------------------------ */

function buildHead(post: GeneratedPost): string {
  const title = post.seoTitle || `${post.title} | RxFit.ai`;
  const description = post.description;
  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const image = post.heroImage
    ? post.heroImage.startsWith("http")
      ? post.heroImage
      : `${SITE_URL}${post.heroImage}`
    : `${SITE_URL}/opengraph.jpg`;

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "RxFit.ai",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    description:
      "RxFit.ai pairs an AI health dashboard with a real human coach to turn wearable data into daily, consistent action.",
    sameAs: [
      APP_URL,
      "https://twitter.com/rxfitai",
      "https://www.instagram.com/rxfitai",
      "https://www.linkedin.com/company/rxfitai",
    ],
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "RxFit.ai",
    url: SITE_URL,
    description:
      "RxFit.ai pairs an AI health dashboard with a real human coach to turn wearable data into daily, consistent action.",
    publisher: { "@type": "Organization", name: "RxFit.ai", url: SITE_URL },
  };
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: canonical },
    ],
  };
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    image,
    url: canonical,
    mainEntityOfPage: canonical,
    datePublished: post.date,
    dateModified: post.date,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "RxFit.ai",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
  };
  const faqPage =
    post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  const out: string[] = [
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" data-seo="true" />`,
    `<meta name="description" content="${escapeHtml(description)}" data-seo="true" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" data-seo="true" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" data-seo="true" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" data-seo="true" />`,
    `<meta property="og:type" content="article" data-seo="true" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" data-seo="true" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" data-seo="true" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" data-seo="true" />`,
    `<meta name="twitter:image" content="${escapeHtml(image)}" data-seo="true" />`,
    `<meta property="article:published_time" content="${escapeHtml(post.date)}" data-seo="true" />`,
    `<meta property="article:modified_time" content="${escapeHtml(post.date)}" data-seo="true" />`,
    `<meta property="article:author" content="${escapeHtml(post.author)}" data-seo="true" />`,
    ...post.tags.map(
      (t) => `<meta property="article:tag" content="${escapeHtml(t)}" data-seo-tag="true" />`,
    ),
  ];
  for (const j of [organization, website, breadcrumbs, article, faqPage]) {
    if (!j) continue;
    out.push(`<script type="application/ld+json" data-seo-jsonld="true">${jsonLdSafe(j)}</script>`);
  }
  return out.join("\n    ");
}

/* ------------------------------------------------------------------ */
/* Body HTML — markdown via marked + brand classes + heading ids        */
/* ------------------------------------------------------------------ */

const ELEMENT_CLASSES: Record<string, string> = {
  h2: "text-3xl font-bold text-foreground mt-12 mb-4 scroll-mt-24",
  h3: "text-2xl font-bold text-foreground mt-8 mb-3 scroll-mt-24",
  p: "text-lg text-foreground/80 leading-relaxed mb-6",
  ul: "list-disc list-outside pl-6 space-y-2 mb-6 text-lg text-foreground/80 marker:text-primary",
  ol: "list-decimal list-outside pl-6 space-y-2 mb-6 text-lg text-foreground/80 marker:text-primary",
  li: "leading-relaxed",
  blockquote: "border-l-4 border-primary pl-6 my-8 text-xl italic text-foreground/90",
};

// Only allow http(s)/mailto/tel and relative URLs in generated content.
// Anything with another scheme (javascript:, data:, vbscript:, ...) is dropped.
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME_RE = /^(https?:|mailto:|tel:)/i;

export function sanitizeUrl(url: string): string {
  const trimmed = url.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!HAS_SCHEME_RE.test(trimmed)) return trimmed; // relative, /path, #anchor
  return SAFE_SCHEME_RE.test(trimmed) ? trimmed : "#";
}

function markdownToHtml(markdown: string): string {
  // Generated posts must not contain raw HTML; escape any that slipped in so
  // LLM output can never inject markup or scripts into the crawler page.
  const safeMarkdown = markdown.replace(/</g, "&lt;");
  let html = marked.parse(safeMarkdown, {
    async: false,
    walkTokens: (token) => {
      if (token.type === "link" || token.type === "image") {
        token.href = sanitizeUrl(String(token.href ?? ""));
      }
    },
  }) as string;

  // Apply the same tailwind classes the MDX element overrides use.
  for (const [tag, cls] of Object.entries(ELEMENT_CLASSES)) {
    html = html.replaceAll(`<${tag}>`, `<${tag} class="${cls}">`);
  }
  html = html.replaceAll(
    "<a href=",
    '<a class="text-primary hover:text-primary/80 underline underline-offset-2" href=',
  );

  // Assign heading ids matching the stored TOC (same slugify + dedupe order).
  const toc = extractToc(markdown);
  let h2Index = 0;
  html = html.replace(/<h2 class="/g, () => {
    const entry = toc[h2Index++];
    return entry ? `<h2 id="${entry.id}" class="` : '<h2 class="';
  });
  return html;
}

function formatDate(date: string): string {
  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return date;
  }
}

function buildArticleHtml(post: GeneratedPost): string {
  const bodyHtml = markdownToHtml(post.bodyMarkdown);
  const tags = post.tags
    .map(
      (t) =>
        `<span class="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">${escapeHtml(t)}</span>`,
    )
    .join("");
  const takeaways = post.keyTakeaways
    .map(
      (k) =>
        `<li class="flex items-start gap-3 text-foreground/90"><span class="text-primary shrink-0">✓</span><span>${escapeHtml(k)}</span></li>`,
    )
    .join("");
  const faq = post.faq
    .map(
      (f) =>
        `<div class="glass-card rounded-xl px-5 py-4"><h3 class="text-foreground font-medium mb-2">${escapeHtml(f.q)}</h3><p class="text-foreground/80 leading-relaxed">${escapeHtml(f.a)}</p></div>`,
    )
    .join("");

  return `
<div class="min-h-screen bg-background text-foreground overflow-x-hidden">
  <article class="pt-28 pb-20 px-6">
    <div class="container mx-auto max-w-6xl">
      <nav class="text-sm text-muted-foreground/70 mb-8 flex items-center gap-2" aria-label="Breadcrumb">
        <a href="/" class="hover:text-primary">Home</a><span>/</span>
        <a href="/blog" class="hover:text-primary">Blog</a><span>/</span>
        <span class="text-foreground/80" aria-current="page">${escapeHtml(post.title)}</span>
      </nav>
      <div class="max-w-3xl">
        <div class="flex flex-wrap gap-2 mb-4">${tags}</div>
        <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight mb-6">${escapeHtml(post.title)}</h1>
        <div class="flex items-center gap-4 text-sm text-muted-foreground mb-8">
          <div class="w-10 h-10 rounded-full bg-muted"></div>
          <div>
            <div class="text-foreground font-medium">${escapeHtml(post.author)}</div>
            <div class="flex items-center gap-3"><span>${escapeHtml(formatDate(post.date))}</span><span>${post.readingMinutes} min read</span></div>
          </div>
        </div>
      </div>
      <div class="max-w-3xl min-w-0">
        <div class="glass-card rounded-2xl p-6 my-8 border-l-4 border-l-primary">
          <div class="hud-label font-bold text-primary mb-3">TL;DR</div>
          <div class="text-foreground/90 leading-relaxed"><p>${escapeHtml(post.tldr)}</p></div>
        </div>
        ${bodyHtml}
        ${
          takeaways
            ? `<div class="rounded-2xl p-6 my-8 bg-primary/5 border border-primary/20"><div class="hud-label font-bold text-primary mb-4">Key Takeaways</div><ul class="space-y-3">${takeaways}</ul></div>`
            : ""
        }
        ${
          faq
            ? `<div class="my-10"><h2 class="text-2xl font-bold text-foreground mb-6">Frequently Asked Questions</h2><div class="space-y-3">${faq}</div></div>`
            : ""
        }
        <div class="glass-card rounded-2xl p-6 mt-12 flex gap-4 items-start">
          <div class="w-14 h-14 rounded-full bg-muted shrink-0"></div>
          <div>
            <div class="text-foreground font-bold mb-1">${escapeHtml(post.author)}</div>
            <p class="text-sm text-muted-foreground leading-relaxed mb-2">${escapeHtml(post.authorBio || "")}</p>
            <a href="${escapeHtml(APP_URL)}" rel="noopener" class="text-sm text-primary">Open the RxFit web app →</a>
          </div>
        </div>
        <p class="mt-10"><a href="/blog" class="text-primary underline underline-offset-2">← Back to the blog</a></p>
      </div>
    </div>
  </article>
</div>`;
}

/**
 * Render the full page HTML for a generated post, or null when the template
 * is unavailable (dev mode) — caller should fall through to the SPA shell.
 */
export function renderGeneratedPostPage(post: GeneratedPost): string | null {
  const template = loadTemplate();
  if (!template) return null;
  let page = template.replace(SEO_BLOCK, buildHead(post));
  // Mark the root so main.tsx renders fresh (createRoot) instead of hydrating
  // — this server HTML is intentionally not React-generated markup.
  page = page.replace('<div id="root">', '<div id="root" data-runtime-ssr="true">');
  page = page.replace("<!--app-html-->", buildArticleHtml(post));
  return page;
}
