import { useEffect } from "react";

export const SITE_URL = "https://rxfit.ai";
export const APP_URL = "https://app.rxfit.ai";

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

type JsonLd = Record<string, unknown>;

export interface SeoProps {
  title: string;
  description: string;
  canonicalPath: string;
  type?: "website" | "article";
  image?: string;
  article?: {
    publishedTime?: string;
    author?: string;
    tags?: string[];
  };
  breadcrumbs?: { name: string; path: string }[];
  jsonLd?: JsonLd[];
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  el.setAttribute("data-seo", "true");
  return el;
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

export function Seo({
  title,
  description,
  canonicalPath,
  type = "website",
  image,
  article,
  breadcrumbs,
  jsonLd,
}: SeoProps) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;
    const canonical = `${SITE_URL}${canonicalPath}`;

    // Standard + OG + Twitter meta. We deliberately do NOT touch og:image /
    // twitter:image unless an explicit `image` is provided, so the defaults in
    // client/index.html are preserved.
    setMeta("name", "description", description);
    setCanonical(canonical);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:type", type);
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", description);
    if (image) {
      const absImage = image.startsWith("http") ? image : `${SITE_URL}${image}`;
      setMeta("property", "og:image", absImage);
      setMeta("name", "twitter:image", absImage);
    }
    if (article?.publishedTime) {
      setMeta("property", "article:published_time", article.publishedTime);
    }
    if (article?.author) {
      setMeta("property", "article:author", article.author);
    }
    (article?.tags || []).forEach((tag) => {
      const el = document.createElement("meta");
      el.setAttribute("property", "article:tag");
      el.setAttribute("content", tag);
      el.setAttribute("data-seo-tag", "true");
      document.head.appendChild(el);
    });

    // JSON-LD blocks
    const scripts: HTMLScriptElement[] = [];
    const addJsonLd = (data: JsonLd) => {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.setAttribute("data-seo-jsonld", "true");
      s.textContent = JSON.stringify(data);
      document.head.appendChild(s);
      scripts.push(s);
    };

    addJsonLd(ORGANIZATION_JSONLD);

    if (breadcrumbs && breadcrumbs.length > 0) {
      addJsonLd({
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
      addJsonLd({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: title,
        description,
        image: image ? (image.startsWith("http") ? image : `${SITE_URL}${image}`) : `${SITE_URL}/hero-dashboard.png`,
        url: canonical,
        mainEntityOfPage: canonical,
        datePublished: article?.publishedTime,
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

    (jsonLd || []).forEach(addJsonLd);

    return () => {
      document.title = prevTitle;
      scripts.forEach((s) => s.remove());
      document.head.querySelectorAll('[data-seo-tag="true"]').forEach((el) => el.remove());
    };
  }, [title, description, canonicalPath, type, image, JSON.stringify(article), JSON.stringify(breadcrumbs), JSON.stringify(jsonLd)]);

  return null;
}
