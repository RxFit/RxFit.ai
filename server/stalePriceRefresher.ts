/**
 * Stale-price auto-refresh: after a PLAN_PRICING change deploys, any live
 * AI-published post whose body/FAQ still quotes the OLD prices is detected
 * and refreshed through the existing blogRefresher pipeline (slug/URL never
 * changes, same validation gates — which re-run these very scanners, so the
 * refreshed post is guaranteed price-correct or the refresh fails loudly).
 *
 * Detection reuses the SAME scanners as the validate-seo build gate and
 * publish-time validateDraft (scanMdxPriceClaims / scanFaqPriceClaims from
 * scripts/priceGuards.mjs with live pricing from currentGuardPricing), so
 * "stale" here is exactly the condition that fails `npm run build` — once
 * the refreshes complete, `node scripts/validate-seo.mjs` passes again
 * without manual work.
 *
 * Failure behavior: each refresh failure already sends the loud failure
 * email (with sheet fallback) inside refreshOnePost; this runner continues
 * with the remaining stale posts and then throws an aggregate error so the
 * caller (scheduler run / CLI) still registers the run as failed.
 */
import { storage } from "./storage";
import { refreshOnePost } from "./blogRefresher";
import { currentGuardPricing } from "./blogGenerator";
import {
  scanMdxPriceClaims,
  scanFaqPriceClaims,
  type GuardPricing,
} from "../scripts/priceGuards.mjs";
import type { GeneratedPost } from "@shared/schema";

export interface StalePricePost {
  slug: string;
  errors: string[];
}

/**
 * Pure detection: returns the published posts whose body or FAQ price/trial
 * claims no longer match the given pricing, with the exact scanner errors.
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

  const stale = findStalePricePosts(await getPublishedPosts(), pricing);
  if (stale.length === 0) {
    return { stale, refreshed: [], failed: [] };
  }

  console.log(
    `[stale-price] ${stale.length} published post(s) quote outdated prices — refreshing:\n` +
      stale.map((s) => `- /blog/${s.slug}\n  ${s.errors.join("\n  ")}`).join("\n"),
  );

  const refreshed: string[] = [];
  const failed: string[] = [];
  for (const post of stale) {
    try {
      await refreshPost(post.slug);
      refreshed.push(post.slug);
      console.log(`[stale-price] Refreshed /blog/${post.slug}`);
    } catch (error) {
      // Failure email (with sheet fallback) already sent inside refreshOnePost.
      failed.push(post.slug);
      console.error(`[stale-price] Refresh failed for /blog/${post.slug}:`, error);
    }
  }

  if (failed.length > 0) {
    throw new Error(
      `Stale-price refresh failed for ${failed.length} of ${stale.length} post(s): ${failed.join(", ")} (refreshed OK: ${refreshed.length > 0 ? refreshed.join(", ") : "none"})`,
    );
  }
  return { stale, refreshed, failed };
}
