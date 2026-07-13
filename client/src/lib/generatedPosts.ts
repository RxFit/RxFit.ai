import { useQuery } from "@tanstack/react-query";
import type { TocEntry, PostFrontmatter } from "./blogLoader";

/**
 * DB-backed posts published by the AI auto-publisher. They're fetched at
 * runtime (so new posts appear without a redeploy) and merged with the
 * build-time MDX posts on the blog index and post pages.
 */
export interface GeneratedPostMeta {
  slug: string;
  title: string;
  seoTitle?: string | null;
  description: string;
  pillar: string;
  tags: string[];
  author: string;
  authorBio?: string | null;
  heroImage?: string | null;
  recommendedPlan: string;
  date: string;
  readingMinutes: number;
}

export interface GeneratedPostFull extends GeneratedPostMeta {
  tldr: string;
  keyTakeaways: string[];
  bodyMarkdown: string;
  faq: { q: string; a: string }[];
  toc: TocEntry[];
}

export function toFrontmatter(p: GeneratedPostMeta): PostFrontmatter {
  return {
    title: p.title,
    seoTitle: p.seoTitle || undefined,
    slug: p.slug,
    date: p.date,
    author: p.author,
    authorBio: p.authorBio || undefined,
    description: p.description,
    heroImage: p.heroImage || undefined,
    tags: p.tags,
    pillar: p.pillar,
    recommendedPlan: p.recommendedPlan as PostFrontmatter["recommendedPlan"],
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json();
}

/** All published generated posts (meta only). Safe fallback: empty list on error. */
export function useGeneratedPosts() {
  return useQuery<GeneratedPostMeta[]>({
    queryKey: ["/api/blog/posts"],
    queryFn: () => fetchJson<GeneratedPostMeta[]>("/api/blog/posts"),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** One generated post with full content; `null` when it doesn't exist (404). */
export function useGeneratedPost(slug: string, enabled: boolean) {
  return useQuery<GeneratedPostFull | null>({
    queryKey: ["/api/blog/posts", slug],
    queryFn: async () => {
      const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to load post: ${res.status}`);
      return res.json();
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
