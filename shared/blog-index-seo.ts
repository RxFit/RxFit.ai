import { SITE_URL } from "./site";

/**
 * Blog index (/blog) SEO surfaces. The title/description feed both the meta
 * tags and the Blog JSON-LD so the two can never drift, and the Blog +
 * ItemList structured data is built by a pure function so its shape can be
 * unit-tested (shared/blog-index-seo.test.ts) and its wiring into
 * BlogIndex.tsx guarded by scripts/validate-seo.mjs.
 */
export const BLOG_INDEX_TITLE = "The RxFit.ai Blog — AI Coaching, Wearables & Accountability";
export const BLOG_INDEX_DESCRIPTION =
  "Evidence-based guides on AI fitness coaching, reading your wearable data, and closing the accountability gap that makes most fitness apps fail.";

/** Minimal post-card data the blog index JSON-LD needs (MDX and DB posts both map to this). */
export interface BlogIndexPostInput {
  slug: string;
  title: string;
  description: string;
  date: string;
  updatedDate?: string;
  heroImage?: string;
  author: string;
}

function absoluteImage(src: string): string {
  return src.startsWith("http") ? src : `${SITE_URL}${src}`;
}

/**
 * Build the Blog + ItemList JSON-LD for /blog. Posts should already be sorted
 * newest-first (the ItemList mirrors the on-page order).
 */
export function buildBlogCollectionJsonLd(posts: BlogIndexPostInput[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "The RxFit.ai Blog",
    description: BLOG_INDEX_DESCRIPTION,
    url: `${SITE_URL}/blog`,
    publisher: {
      "@type": "Organization",
      name: "RxFit.ai",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
    mainEntity: {
      "@type": "ItemList",
      name: "RxFit.ai Blog Posts",
      numberOfItems: posts.length,
      itemListElement: posts.map((post, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}/blog/${post.slug}`,
        name: post.title,
        item: {
          "@type": "BlogPosting",
          headline: post.title,
          url: `${SITE_URL}/blog/${post.slug}`,
          datePublished: post.date,
          ...(post.updatedDate ? { dateModified: post.updatedDate } : {}),
          description: post.description,
          ...(post.heroImage ? { image: absoluteImage(post.heroImage) } : {}),
          author: {
            "@type": "Person",
            name: post.author,
          },
        },
      })),
    },
  };
}
