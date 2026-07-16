/**
 * SEO feedback loop: ingest Google Search Console performance snapshots and
 * turn them into refresh decisions.
 *
 * - `ingestGscSnapshot()` pulls the last 28 days of page+query data and stores
 *   it in gsc_query_stats (one batch per day; old batches are pruned).
 * - `findStrikingDistancePosts()` maps the latest snapshot onto DB-published
 *   posts and surfaces those with queries in positions ~5-20 and meaningful
 *   impressions, ranked by opportunity.
 * - Pure helpers are exported for unit tests.
 */
import { storage } from "./storage";
import { fetchSearchAnalytics, isGscConfigured } from "./gscClient";
import { sendPostFailureEmail } from "./emailService";
import type { GscQueryStat, GeneratedPost } from "@shared/schema";

export const STRIKING_MIN_POSITION = 5;
export const STRIKING_MAX_POSITION = 20;
export const STRIKING_MIN_IMPRESSIONS = 20;
/** Keep at most this many days of snapshots in the DB. */
const SNAPSHOT_RETENTION_DAYS = 90;

export { isGscConfigured };

export interface StrikingQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface StrikingPost {
  slug: string;
  /** Total impressions across striking-distance queries (opportunity size). */
  opportunity: number;
  queries: StrikingQuery[];
}

/** /blog/<slug> → slug, or null for non-post pages. */
export function pageToSlug(page: string): string | null {
  const m = page.match(/^\/blog\/([^/]+)$/);
  return m ? m[1] : null;
}

/**
 * Pure striking-distance detection over snapshot rows.
 * Returns posts (by slug) with queries in positions 5-20 and impressions above
 * the threshold, ranked by total striking impressions descending.
 */
export function detectStrikingDistance(
  rows: Pick<GscQueryStat, "page" | "query" | "clicks" | "impressions" | "ctrBps" | "positionX100">[],
  opts?: { minImpressions?: number; minPosition?: number; maxPosition?: number },
): StrikingPost[] {
  const minImpressions = opts?.minImpressions ?? STRIKING_MIN_IMPRESSIONS;
  const minPosition = opts?.minPosition ?? STRIKING_MIN_POSITION;
  const maxPosition = opts?.maxPosition ?? STRIKING_MAX_POSITION;

  const bySlug = new Map<string, StrikingQuery[]>();
  for (const row of rows) {
    const slug = pageToSlug(row.page);
    if (!slug) continue;
    const position = row.positionX100 / 100;
    if (position < minPosition || position > maxPosition) continue;
    if (row.impressions < minImpressions) continue;
    const list = bySlug.get(slug) ?? [];
    list.push({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctrBps / 10000,
      position,
    });
    bySlug.set(slug, list);
  }

  return Array.from(bySlug.entries())
    .map(([slug, queries]) => ({
      slug,
      opportunity: queries.reduce((sum, q) => sum + q.impressions, 0),
      queries: queries.sort((a, b) => b.impressions - a.impressions).slice(0, 8),
    }))
    .sort((a, b) => b.opportunity - a.opportunity);
}

/**
 * Fetch the last 28 days from GSC and store today's snapshot batch.
 * Skips (without error) when today's batch already exists.
 * Fails loudly: failure email + rethrow. Never affects new-post publishing.
 */
export async function ingestGscSnapshot(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const existing = await storage.getGscSnapshotDates();
    if (existing.includes(today)) return 0;

    const rows = await fetchSearchAnalytics(28);
    await storage.replaceGscSnapshot(
      today,
      rows.map((r) => ({
        fetchDate: today,
        page: r.page,
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        ctrBps: Math.round(r.ctr * 10000),
        positionX100: Math.round(r.position * 100),
      })),
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - SNAPSHOT_RETENTION_DAYS);
    await storage.pruneGscSnapshotsBefore(cutoff.toISOString().slice(0, 10));

    console.log(`[seo-feedback] Stored GSC snapshot for ${today}: ${rows.length} page/query rows`);
    return rows.length;
  } catch (error) {
    console.error("[seo-feedback] GSC ingestion FAILED:", error);
    const emailSent = await sendPostFailureEmail("gsc-ingestion", error);
    if (!emailSent) {
      // Gmail itself may be down — fall back to the "RxFit Alerts" sheet tab
      // so a broken GSC pipeline doesn't fail silently.
      try {
        const { appendAlertToSheet } = await import("./sheetsService");
        const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
        await appendAlertToSheet({
          title: 'GSC snapshot ingestion FAILED (failure email could not be sent)',
          message,
        });
        console.log("[seo-feedback] Fallback failure alert row appended to Google Sheet");
      } catch (sheetError) {
        console.error(
          "[seo-feedback] BOTH failure alert channels failed (Gmail email + Google Sheet):",
          sheetError,
        );
      }
    }
    throw error;
  }
}

/** Striking-distance posts from the latest stored snapshot, restricted to DB posts. */
export async function findStrikingDistancePosts(): Promise<StrikingPost[]> {
  const rows = await storage.getLatestGscSnapshot();
  if (rows.length === 0) return [];
  const posts = await storage.getPublishedGeneratedPosts();
  const dbSlugs = new Set(posts.map((p) => p.slug));
  return detectStrikingDistance(rows).filter((s) => dbSlugs.has(s.slug));
}

/** Minimum age before a post qualifies for a freshness (non-GSC) refresh. */
export const FRESHNESS_MIN_AGE_DAYS = 45;

/**
 * Pure refresh-candidate selection: striking-distance posts first (by
 * opportunity), then the oldest stale post. `now` injectable for tests.
 * Returns null when nothing needs a refresh.
 */
export function pickRefreshCandidate(
  posts: Pick<GeneratedPost, "slug" | "date" | "updatedDate" | "createdAt">[],
  striking: StrikingPost[],
  now = new Date(),
): { slug: string; reason: "striking-distance" | "freshness"; queries: StrikingQuery[] } | null {
  const bySlug = new Map(posts.map((p) => [p.slug, p]));

  for (const s of striking) {
    const post = bySlug.get(s.slug);
    if (!post) continue;
    // Don't re-refresh a post we touched very recently.
    if (lastContentDate(post) > addDays(now, -14)) continue;
    return { slug: s.slug, reason: "striking-distance", queries: s.queries };
  }

  const stale = posts
    .filter((p) => lastContentDate(p) <= addDays(now, -FRESHNESS_MIN_AGE_DAYS))
    .sort((a, b) => lastContentDate(a).getTime() - lastContentDate(b).getTime());
  if (stale.length > 0) {
    return { slug: stale[0].slug, reason: "freshness", queries: [] };
  }
  return null;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function lastContentDate(p: Pick<GeneratedPost, "date" | "updatedDate" | "createdAt">): Date {
  if (p.updatedDate) return new Date(p.updatedDate);
  const d = new Date(p.date);
  return isNaN(d.getTime()) ? p.createdAt : d;
}
