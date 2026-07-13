import type { TocItem } from "./schema";

/**
 * Shared helpers for DB-backed (auto-generated) blog posts. Used by the
 * generation pipeline (server) and the runtime renderer (client + crawler
 * HTML) so heading ids, TOC, and reading time always agree.
 *
 * The slugify implementation mirrors remark-blog-meta.ts so generated posts
 * behave exactly like the build-time MDX posts.
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/** Extract H2 headings (markdown `## `) with de-duplicated anchor ids. */
export function extractToc(markdown: string): TocItem[] {
  const toc: TocItem[] = [];
  const seen = new Map<string, number>();
  for (const line of markdown.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[1].replace(/[*_`]/g, "").trim();
    let id = slugifyHeading(text);
    const count = seen.get(id);
    if (count !== undefined) {
      seen.set(id, count + 1);
      id = `${id}-${count + 1}`;
    } else {
      seen.set(id, 0);
    }
    toc.push({ id, text, depth: 2 });
  }
  return toc;
}

/** Words-per-minute reading estimate matching remark-blog-meta (200 wpm). */
export function computeReadingMinutes(markdown: string): number {
  const words = markdown
    .replace(/[#>*_`\[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Split the body at the H2 boundary nearest the middle so an inline CTA card
 * can be inserted at ~50-60% scroll depth (matching the hand-written posts).
 */
export function splitBodyForCta(markdown: string): [string, string] {
  const lines = markdown.split("\n");
  const h2Indexes = lines
    .map((line, i) => (/^##\s+/.test(line) ? i : -1))
    .filter((i) => i > 0);
  if (h2Indexes.length < 3) return [markdown, ""];
  const middle = lines.length / 2;
  let best = h2Indexes[0];
  for (const idx of h2Indexes) {
    if (Math.abs(idx - middle) < Math.abs(best - middle)) best = idx;
  }
  // Never split before the second H2 or at the very last H2.
  const pos = h2Indexes.indexOf(best);
  if (pos === 0) best = h2Indexes[1];
  if (best === h2Indexes[h2Indexes.length - 1] && h2Indexes.length > 2) {
    best = h2Indexes[h2Indexes.length - 2];
  }
  return [lines.slice(0, best).join("\n"), lines.slice(best).join("\n")];
}

/** Count internal links (markdown links whose target starts with "/"). */
export function countInternalLinks(markdown: string): number {
  const matches = markdown.match(/\]\(\/[^)]*\)/g);
  return matches ? matches.length : 0;
}

export const BLOG_PILLARS = ["AI Coaching", "Wearables", "Accountability"] as const;
export type BlogPillar = (typeof BLOG_PILLARS)[number];

/** Seed themes for the rotating keyword queue (brand + long-tail variants). */
export const SEED_KEYWORD_THEMES: { theme: string; pillar: BlogPillar; position: number }[] = [
  { theme: "AI coaching", pillar: "AI Coaching", position: 1 },
  { theme: "biological age", pillar: "Wearables", position: 2 },
  { theme: "fitness accountability", pillar: "Accountability", position: 3 },
  { theme: "biometric personal trainer", pillar: "AI Coaching", position: 4 },
  { theme: "wearable data coaching", pillar: "Wearables", position: 5 },
  { theme: "AI fitness coach vs human personal trainer", pillar: "AI Coaching", position: 6 },
  { theme: "how to lower your biological age", pillar: "Wearables", position: 7 },
  { theme: "fitness accountability partner", pillar: "Accountability", position: 8 },
  { theme: "HRV and recovery-based training", pillar: "Wearables", position: 9 },
  { theme: "why fitness apps fail without accountability", pillar: "Accountability", position: 10 },
  { theme: "AI personal trainer apps", pillar: "AI Coaching", position: 11 },
  { theme: "turning wearable data into action", pillar: "Wearables", position: 12 },
];
