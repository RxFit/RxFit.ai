import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import type { BlogIndexCard } from "./blogSsr";

/**
 * Parses the YAML frontmatter block at the top of an MDX source string.
 * Returns {} when the file has no frontmatter (or it can't be delimited).
 * Extracted from routes.ts so the hand-written-post index pipeline is
 * unit-testable (used by both the /blog index cards and the sitemap reader).
 */
export function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  return parseYaml(m[1]) ?? {};
}

/** Injectable filesystem seams so tests can use a fixture directory or fakes. */
export interface ReadMdxIndexCardsOptions {
  /** Directory containing the .mdx posts. Defaults to content/blog. */
  dir?: string;
  /** Lists file names in dir. Defaults to fs.readdirSync. */
  listFiles?: (dir: string) => string[];
  /** Reads one file as utf-8. Defaults to fs.readFileSync. */
  readFile?: (filePath: string) => string;
}

/**
 * Reads the hand-written MDX posts into BlogIndexCard entries for the
 * crawler-facing /blog index (frontmatter fields + word-count reading time
 * at 200 wpm, minimum 1 minute). Excludes `_`-prefixed drafts and files
 * without a frontmatter title — a regression here would silently drop
 * hand-written posts from the crawler HTML, so the mapping/filtering is
 * unit-tested in mdxIndexCards.test.ts.
 */
export function readMdxIndexCards(
  options: ReadMdxIndexCardsOptions = {},
): BlogIndexCard[] {
  const dir = options.dir ?? path.resolve(process.cwd(), "content", "blog");
  const listFiles = options.listFiles ?? ((d: string) => fs.readdirSync(d));
  const readFile =
    options.readFile ?? ((filePath: string) => fs.readFileSync(filePath, "utf-8"));

  const files = listFiles(dir).filter((f) => f.endsWith(".mdx"));
  return files
    .map((file) => {
      const raw = readFile(path.join(dir, file));
      const fm = parseFrontmatter(raw);
      const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "");
      const words = body.split(/\s+/).filter(Boolean).length;
      return {
        slug: (fm.slug as string) || file.replace(/\.mdx$/, ""),
        title: (fm.title as string) || "",
        description: (fm.description as string) || "",
        date: (fm.date as string) || "",
        updatedDate: (fm.updatedDate as string) || undefined,
        heroImage: (fm.heroImage as string) || undefined,
        author: (fm.author as string) || "",
        tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
        readingMinutes: Math.max(1, Math.round(words / 200)),
      };
    })
    .filter((p) => p.title && !p.slug.startsWith("_"));
}
