import type { ComponentType } from "react";

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

export interface PostFrontmatter {
  title: string;
  slug: string;
  date: string;
  author: string;
  authorBio?: string;
  authorPhoto?: string;
  description: string;
  heroImage?: string;
  tags?: string[];
  pillar?: string;
  targetKeyword?: string;
  recommendedPlan?: "kickstart" | "committed" | "transformation";
}

export interface Post {
  frontmatter: PostFrontmatter;
  Component: ComponentType<any>;
  readingMinutes: number;
  toc: TocEntry[];
}

interface MdxModule {
  default: ComponentType<any>;
  frontmatter?: Partial<PostFrontmatter>;
  readingMinutes?: number;
  toc?: TocEntry[];
}

// Eagerly load every MDX post at build time. Reading time and the table of
// contents are injected as named exports by the `remarkBlogMeta` build plugin.
const modules = import.meta.glob<MdxModule>("../../../content/blog/*.mdx", { eager: true });

function slugFromPath(path: string): string {
  return path.split("/").pop()!.replace(/\.mdx$/, "");
}

function toPost(path: string, mod: MdxModule): Post {
  const fm = (mod.frontmatter || {}) as Partial<PostFrontmatter>;
  const slug = fm.slug || slugFromPath(path);
  return {
    frontmatter: { ...fm, slug } as PostFrontmatter,
    Component: mod.default,
    readingMinutes: mod.readingMinutes ?? 1,
    toc: mod.toc ?? [],
  };
}

const posts: Post[] = Object.entries(modules)
  .map(([path, mod]) => toPost(path, mod))
  // Hide internal/test drafts whose slug starts with "_"
  .filter((p) => !p.frontmatter.slug.startsWith("_"))
  .sort(
    (a, b) =>
      new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
  );

export function getAllPosts(): Post[] {
  return posts;
}

export function getPostBySlug(slug: string): Post | undefined {
  // Allow direct access to drafts by slug even though they're hidden from the index.
  const all = Object.entries(modules).map(([path, mod]) => toPost(path, mod));
  return all.find((p) => p.frontmatter.slug === slug);
}

export function getRelatedPosts(slug: string, pillar?: string, limit = 3): Post[] {
  return posts
    .filter((p) => p.frontmatter.slug !== slug && (!pillar || p.frontmatter.pillar === pillar))
    .slice(0, limit);
}

export const PILLARS = ["AI Coaching", "Wearables", "Accountability"] as const;
