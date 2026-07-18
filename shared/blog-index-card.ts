/**
 * Shared markup contract for the /blog post cards.
 *
 * The visitor page (client/src/pages/BlogIndex.tsx) renders these cards as
 * JSX; the crawler-facing runtime SSR (server/blogSsr.ts buildIndexCardHtml)
 * mirrors them as raw HTML strings. Both MUST source the class lists, the
 * visible-tag cap, and the footer text from here so a redesign on the client
 * can't silently leave crawlers a stale card — the same drift class the
 * shared hero copy in blog-index-seo.ts closed. Drift-guarded in
 * server/blogSsr.index.test.ts (SSR output must contain these constants, and
 * neither renderer may inline the literals).
 *
 * The tag chip class, date formatter, and reading-time label are ALSO the
 * post-page (/blog/:slug) byline contract: client/src/pages/BlogPost.tsx and
 * blogSsr.ts buildArticleHtml both consume them, guarded the same way.
 */

/** How many tags a card shows (both renderers must slice to this). */
export const BLOG_CARD_TAG_LIMIT = 2;

/** The card grid wrapper on /blog. */
export const BLOG_INDEX_GRID_CLASS = "grid gap-8 md:grid-cols-2 lg:grid-cols-3";

export const BLOG_CARD_ARTICLE_CLASS =
  "hud-corner glass-card glass-card-hover rounded-2xl overflow-hidden flex flex-col";
export const BLOG_CARD_HERO_FRAME_CLASS = "aspect-[1200/630] bg-muted overflow-hidden";
export const BLOG_CARD_HERO_IMG_CLASS = "w-full h-full object-cover";
export const BLOG_CARD_BODY_CLASS = "p-6 flex flex-col flex-1";
export const BLOG_CARD_TAG_ROW_CLASS = "flex flex-wrap gap-2 mb-3";
export const BLOG_CARD_TAG_CHIP_CLASS =
  "px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20";
export const BLOG_CARD_TITLE_CLASS =
  "text-xl font-bold text-foreground mb-2 hover:text-primary transition-colors";
export const BLOG_CARD_DESCRIPTION_CLASS =
  "text-muted-foreground text-sm leading-relaxed mb-4 flex-1";
export const BLOG_CARD_FOOTER_CLASS =
  "flex items-center justify-between text-xs text-muted-foreground/70 pt-4 border-t border-border";

/** Card footer date ("July 10, 2026"); falls back to the raw string. */
export function formatBlogCardDate(date: string): string {
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

/** Card footer reading-time label ("6 min read"). */
export function blogCardReadingTime(minutes: number): string {
  return `${minutes} min read`;
}
