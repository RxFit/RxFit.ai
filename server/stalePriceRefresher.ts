/**
 * Stale-price auto-refresh: after a PLAN_PRICING change deploys, any live
 * AI-published post whose body/FAQ/summary surfaces still quote the OLD
 * prices is detected and refreshed through the existing blogRefresher
 * pipeline (slug/URL never changes, same validation gates — which re-run
 * these very scanners, so the refreshed post is guaranteed price-correct
 * or the refresh fails loudly).
 *
 * Detection reuses the SAME scanners as the validate-seo build gate and
 * publish-time validateDraft (scanMdxPriceClaims / scanFaqPriceClaims /
 * scanSummaryPriceClaims from scripts/priceGuards.mjs with live pricing
 * from currentGuardPricing), so
 * "stale" here is exactly the condition that fails `npm run build` — once
 * the refreshes complete, `node scripts/validate-seo.mjs` passes again
 * without manual work.
 *
 * Failure behavior: each refresh failure already sends the loud failure
 * email (with sheet fallback) inside refreshOnePost; this runner continues
 * with the remaining stale posts and then throws an aggregate error so the
 * caller (scheduler run / CLI) still registers the run as failed.
 *
 * Give-up guard: the scheduler retries hourly, so a permanently broken post
 * (e.g. its topic makes the model keep producing drafts that fail
 * validation) would otherwise cost ~24 failure emails per day plus hourly
 * LLM spend until the owner intervenes. After
 * MAX_CONSECUTIVE_REFRESH_FAILURES consecutive failures for the same slug
 * (tracked in-memory, per process), the post is skipped on subsequent runs
 * with a one-time "giving up" log — no more refresh attempts, LLM calls, or
 * failure emails for it — until the process restarts or the post's scanned
 * content changes (fingerprint of the surfaces the price scanners read; a
 * manual edit or another instance's successful refresh resets the counter).
 * The manual CLI runs in a fresh process, so it always retries everything.
 */
import { storage } from "./storage";
import { refreshOnePost } from "./blogRefresher";
import { currentGuardPricing } from "./blogGenerator";
import {
  scanMdxPriceClaims,
  scanFaqPriceClaims,
  scanSummaryPriceClaims,
  type GuardPricing,
} from "../scripts/priceGuards.mjs";
import type { GeneratedPost } from "@shared/schema";

export interface StalePricePost {
  slug: string;
  errors: string[];
}

/**
 * Pure detection: returns the published posts whose body, FAQ, or summary
 * surfaces (tldr/description/keyTakeaways — they render on the live post
 * too) carry price/trial claims that no longer match the given pricing,
 * with the exact scanner errors. Must scan the SAME surfaces as the
 * validate-seo DB gate, or a stale post could block builds without ever
 * being auto-refreshed.
 */
export function findStalePricePosts(
  posts: GeneratedPost[],
  pricing: GuardPricing,
): StalePricePost[] {
  return posts.flatMap((post) => {
    const label = `/blog/${post.slug}`;
    const errors = [
      ...scanMdxPriceClaims(pricing, label, post.bodyMarkdown ?? ""),
      ...scanFaqPriceClaims(pricing, label, Array.isArray(post.faq) ? post.faq : []),
      ...scanSummaryPriceClaims(pricing, label, {
        tldr: post.tldr,
        description: post.description,
        keyTakeaways: post.keyTakeaways,
      }),
    ];
    return errors.length > 0 ? [{ slug: post.slug, errors }] : [];
  });
}

export interface RefreshStalePriceDeps {
  getPublishedPosts?: () => Promise<GeneratedPost[]>;
  refreshPost?: (slug: string) => Promise<unknown>;
  pricing?: GuardPricing;
}

export interface RefreshStalePriceResult {
  stale: StalePricePost[];
  refreshed: string[];
  failed: string[];
  /** Slugs skipped by the give-up guard (still stale, but not retried). */
  skipped: string[];
}

/** Consecutive refresh failures for one slug before the guard gives up on it. */
export const MAX_CONSECUTIVE_REFRESH_FAILURES = 3;

interface SlugFailureState {
  consecutiveFailures: number;
  /** Fingerprint of the post's scanned surfaces at the time of the failures. */
  fingerprint: string;
  gaveUp: boolean;
}

/** In-memory, per-process. Cleared on restart (deliberate: restart = retry). */
const failureStateBySlug = new Map<string, SlugFailureState>();

/** Test/ops hook: forget all give-ups, as a process restart would. */
export function resetStalePriceFailureTracking(): void {
  failureStateBySlug.clear();
}

/**
 * Fingerprint of exactly the surfaces the price scanners read. If any of
 * them changes (manual edit, or another instance refreshed the post), the
 * failure counter no longer applies — the guard resets and retries.
 */
function scannedSurfacesFingerprint(post: GeneratedPost): string {
  return JSON.stringify([
    post.bodyMarkdown ?? "",
    Array.isArray(post.faq) ? post.faq : [],
    post.tldr ?? "",
    post.description ?? "",
    post.keyTakeaways ?? [],
  ]);
}

/**
 * Detect and refresh every published post with stale price claims.
 * Sequential (one LLM refresh at a time); a single post's failure never
 * blocks the rest — failures are collected and thrown as one aggregate
 * error at the end (per-post failure emails already sent by refreshOnePost).
 */
export async function refreshStalePricePosts(
  deps: RefreshStalePriceDeps = {},
): Promise<RefreshStalePriceResult> {
  const getPublishedPosts =
    deps.getPublishedPosts ?? (() => storage.getPublishedGeneratedPosts());
  const refreshPost = deps.refreshPost ?? ((slug: string) => refreshOnePost(slug));
  const pricing = deps.pricing ?? currentGuardPricing();

  const posts = await getPublishedPosts();
  const stale = findStalePricePosts(posts, pricing);
  if (stale.length === 0) {
    return { stale, refreshed: [], failed: [], skipped: [] };
  }
  const postBySlug = new Map(posts.map((p) => [p.slug, p]));

  console.log(
    `[stale-price] ${stale.length} published post(s) quote outdated prices — refreshing:\n` +
      stale.map((s) => `- /blog/${s.slug}\n  ${s.errors.join("\n  ")}`).join("\n"),
  );

  const refreshed: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  for (const post of stale) {
    const fullPost = postBySlug.get(post.slug);
    const fingerprint = fullPost ? scannedSurfacesFingerprint(fullPost) : "";
    const prior = failureStateBySlug.get(post.slug);
    if (prior && prior.fingerprint !== fingerprint) {
      // The post's scanned content changed since the failures — start fresh.
      failureStateBySlug.delete(post.slug);
    }
    const state = failureStateBySlug.get(post.slug);
    if (state?.gaveUp) {
      skipped.push(post.slug);
      console.log(
        `[stale-price] Skipping /blog/${post.slug} — gave up after ${state.consecutiveFailures} consecutive refresh failures (retries resume on restart or when the post's content changes)`,
      );
      continue;
    }
    try {
      await refreshPost(post.slug);
      refreshed.push(post.slug);
      failureStateBySlug.delete(post.slug);
      console.log(`[stale-price] Refreshed /blog/${post.slug}`);
    } catch (error) {
      // Failure email (with sheet fallback) already sent inside refreshOnePost.
      failed.push(post.slug);
      console.error(`[stale-price] Refresh failed for /blog/${post.slug}:`, error);
      const consecutiveFailures = (state?.consecutiveFailures ?? 0) + 1;
      const gaveUp = consecutiveFailures >= MAX_CONSECUTIVE_REFRESH_FAILURES;
      failureStateBySlug.set(post.slug, { consecutiveFailures, fingerprint, gaveUp });
      if (gaveUp) {
        // One-time notice; subsequent runs only emit the quieter skip log.
        console.error(
          `[stale-price] Giving up on /blog/${post.slug} until restart or content change — ${consecutiveFailures} consecutive refresh failures; no further hourly retries, LLM calls, or failure alerts for this post`,
        );
      }
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `Stale-price refresh failed for ${failed.length} of ${stale.length} post(s): ${failed.join(", ")} (refreshed OK: ${refreshed.length > 0 ? refreshed.join(", ") : "none"}${skipped.length > 0 ? `; skipped as given-up: ${skipped.join(", ")}` : ""})`,
    );
  }
  return { stale, refreshed, failed, skipped };
}
