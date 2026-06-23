import { useEffect, useContext, createContext } from "react";
import { SITE_URL, APP_URL } from "@shared/site";

export { SITE_URL, APP_URL };

/**
 * Shared Organization JSON-LD. The `sameAs` array (including app.rxfit.ai) is the
 * structured-data half of the cross-domain authority strategy — it tells search
 * and AI engines that rxfit.ai and app.rxfit.ai are one brand.
 */
export const ORGANIZATION_JSONLD = {
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

export const WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "RxFit.ai",
  url: SITE_URL,
  description:
    "RxFit.ai pairs an AI health dashboard with a real human coach to turn wearable data into daily, consistent action.",
  publisher: {
    "@type": "Organization",
    name: "RxFit.ai",
    url: SITE_URL,
  },
};

type JsonLd = Record<string, unknown>;

export interface SeoProps {
  title: string;
  description: string;
  canonicalPath: string;
  type?: "website" | "article";
  image?: string;
  /**
   * When set, this value is used as the Article JSON-LD `headline` instead of `title`.
   * Use this to pass the full editorial article title (`fm.title`) while keeping a shorter
   * `seoTitle` in the `<title>`/OG/Twitter tags.
   */
  schemaHeadline?: string;
  article?: {
    publishedTime?: string;
    modifiedTime?: string;
    author?: string;
    tags?: string[];
  };
  breadcrumbs?: { name: string; path: string }[];
  jsonLd?: JsonLd[];
  /** When true, emits <meta name="robots" content="noindex,nofollow"> (used for draft previews / non-indexable pages). */
  noindex?: boolean;
}

interface MetaTag {
  attr: "name" | "property";
  key: string;
  content: string;
}

interface ComputedSeo {
  title: string;
  canonical: string;
  metas: MetaTag[];
  articleTags: string[];
  jsonLd: JsonLd[];
  noindex: boolean;
}

/**
 * Pure computation of every SEO tag for a route. Shared by the client-side
 * effect (which mutates document.head) and the server-side prerender (which
 * serializes the result into the initial HTML head).
 */
function computeSeo(props: SeoProps): ComputedSeo {
  const {
    title,
    description,
    canonicalPath,
    type = "website",
    image,
    schemaHeadline,
    article,
    breadcrumbs,
    jsonLd,
    noindex = false,
  } = props;

  const canonical = `${SITE_URL}${canonicalPath}`;
  const absImage = image
    ? image.startsWith("http")
      ? image
      : `${SITE_URL}${image}`
    : `${SITE_URL}/opengraph.jpg`;

  const metas: MetaTag[] = [
    { attr: "name", key: "description", content: description },
    { attr: "property", key: "og:title", content: title },
    { attr: "property", key: "og:description", content: description },
    { attr: "property", key: "og:url", content: canonical },
    { attr: "property", key: "og:type", content: type },
    { attr: "property", key: "og:image", content: absImage },
    { attr: "name", key: "twitter:title", content: title },
    { attr: "name", key: "twitter:description", content: description },
    { attr: "name", key: "twitter:image", content: absImage },
  ];

  if (article?.publishedTime) {
    metas.push({ attr: "property", key: "article:published_time", content: article.publishedTime });
  }
  if (article?.modifiedTime) {
    metas.push({ attr: "property", key: "article:modified_time", content: article.modifiedTime });
  }
  if (article?.author) {
    metas.push({ attr: "property", key: "article:author", content: article.author });
  }

  const all: JsonLd[] = [ORGANIZATION_JSONLD, WEBSITE_JSONLD];

  if (breadcrumbs && breadcrumbs.length > 0) {
    all.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs.map((b, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: b.name,
        item: `${SITE_URL}${b.path}`,
      })),
    });
  }

  if (type === "article") {
    const articleHeadline = schemaHeadline ?? title;
    const datePublished = article?.publishedTime;
    const dateModified = article?.modifiedTime ?? datePublished;
    all.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: articleHeadline,
      description,
      image: absImage,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished,
      dateModified,
      author: article?.author
        ? { "@type": "Person", name: article.author }
        : { "@type": "Organization", name: "RxFit.ai" },
      publisher: {
        "@type": "Organization",
        name: "RxFit.ai",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
      },
    });
  }

  (jsonLd || []).forEach((j) => all.push(j));

  return { title, canonical, metas, articleTags: article?.tags || [], jsonLd: all, noindex };
}

/* ------------------------------------------------------------------ */
/* Server-side head collection (used by the prerender build)           */
/* ------------------------------------------------------------------ */

export interface HeadCollector {
  title?: string;
  canonical?: string;
  metas: MetaTag[];
  articleTags: string[];
  jsonLd: JsonLd[];
  noindex: boolean;
}

export function createHeadCollector(): HeadCollector {
  return { metas: [], articleTags: [], jsonLd: [], noindex: false };
}

/** Present only during SSR/prerender. On the client it stays null and the
 *  effect-based path runs instead. */
export const HeadContext = createContext<HeadCollector | null>(null);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escape a closing-script sequence so JSON-LD can't break out of <script>. */
function jsonLdSafe(obj: JsonLd): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

/** Serialize a collected head into an HTML string injected into the prerendered shell. */
export function renderHeadToString(c: HeadCollector): string {
  const out: string[] = [];
  if (c.title) out.push(`<title>${escapeHtml(c.title)}</title>`);
  if (c.canonical) out.push(`<link rel="canonical" href="${escapeHtml(c.canonical)}" data-seo="true" />`);
  for (const m of c.metas) {
    out.push(`<meta ${m.attr}="${m.key}" content="${escapeHtml(m.content)}" data-seo="true" />`);
  }
  for (const t of c.articleTags) {
    out.push(`<meta property="article:tag" content="${escapeHtml(t)}" data-seo-tag="true" />`);
  }
  if (c.noindex) {
    out.push(`<meta name="robots" content="noindex,nofollow" data-seo="true" />`);
  }
  for (const j of c.jsonLd) {
    out.push(`<script type="application/ld+json" data-seo-jsonld="true">${jsonLdSafe(j)}</script>`);
  }
  return out.join("\n    ");
}

/* ------------------------------------------------------------------ */
/* Client-side head application                                         */
/* ------------------------------------------------------------------ */

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  el.setAttribute("data-seo", "true");
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  el.setAttribute("data-seo", "true");
}

export function Seo(props: SeoProps) {
  // During prerender, push the computed tags into the head collector so they
  // ship in the first HTML response. `useContext` is always called (hook rules);
  // it only resolves to a collector on the server.
  const collector = useContext(HeadContext);
  if (collector) {
    const c = computeSeo(props);
    collector.title = c.title;
    collector.canonical = c.canonical;
    c.metas.forEach((m) => collector.metas.push(m));
    c.articleTags.forEach((t) => collector.articleTags.push(t));
    c.jsonLd.forEach((j) => collector.jsonLd.push(j));
    if (c.noindex) collector.noindex = true;
  }

  useEffect(() => {
    const c = computeSeo(props);
    const prevTitle = document.title;
    document.title = c.title;
    setCanonical(c.canonical);
    c.metas.forEach((m) => setMeta(m.attr, m.key, m.content));
    if (c.noindex) {
      setMeta("name", "robots", "noindex,nofollow");
    }

    // Clear any pre-existing per-route tags (e.g. prerendered ones) before
    // re-adding, so hydration / client navigation never duplicates them.
    document.head.querySelectorAll('[data-seo-tag="true"]').forEach((el) => el.remove());
    document.head.querySelectorAll('[data-seo-jsonld="true"]').forEach((el) => el.remove());

    c.articleTags.forEach((tag) => {
      const el = document.createElement("meta");
      el.setAttribute("property", "article:tag");
      el.setAttribute("content", tag);
      el.setAttribute("data-seo-tag", "true");
      document.head.appendChild(el);
    });

    const scripts: HTMLScriptElement[] = [];
    c.jsonLd.forEach((data) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-seo-jsonld", "true");
      s.textContent = JSON.stringify(data);
      document.head.appendChild(s);
      scripts.push(s);
    });

    return () => {
      document.title = prevTitle;
      scripts.forEach((s) => s.remove());
      document.head.querySelectorAll('[data-seo-tag="true"]').forEach((el) => el.remove());
      if (c.noindex) {
        document.head.querySelector('meta[name="robots"]')?.remove();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(props)]);

  return null;
}
