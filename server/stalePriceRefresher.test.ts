/**
 * Tests for the stale-price auto-refresh (server/stalePriceRefresher.ts):
 *
 * - findStalePricePosts reuses the SAME priceGuards scanners as the
 *   validate-seo build gate, so "stale" here is exactly what fails a build
 *   after a PLAN_PRICING change: wrong RxFit dollar amounts in the body,
 *   wrong trial-length claims in body or FAQ. Non-RxFit (competitor)
 *   sentences are never flagged.
 * - refreshStalePricePosts refreshes each stale post through the injected
 *   refresh pipeline, never touches clean posts, continues past a single
 *   failure, and throws an aggregate error at the end so scheduler/CLI runs
 *   register as failed.
 * - Wiring guards: the scheduler and the CLI both go through this module,
 *   so the auto-refresh can't silently drop out of the boot/hourly checks.
 *
 * NOTE: fixture pricing is deliberately fake (amounts 111/222, 9-day trial).
 * Real plan amounts or trial phrases written literally in a server/ file
 * would themselves trip the validate-seo hardcoded-price guard.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { findStalePricePosts, refreshStalePricePosts } from "./stalePriceRefresher";
import type { GuardPricing } from "../scripts/priceGuards.mjs";
import type { GeneratedPost } from "@shared/schema";

const PRICING: GuardPricing = { amounts: [111, 222], savings: [333], trialDays: 9 };

function post(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  return {
    id: `id-${overrides.slug ?? "fixture"}`,
    slug: "fixture-post",
    title: "Fixture Post",
    seoTitle: "Fixture Post | RxFit.ai",
    description: "A fixture post for stale-price detection tests.",
    keywordTheme: "hrv",
    targetKeyword: "hrv training",
    pillar: "recovery",
    tags: ["HRV"],
    author: "Coach Test",
    authorBio: "Test coach bio.",
    heroImage: null,
    recommendedPlan: "kickstart",
    tldr: "Fixture.",
    keyTakeaways: ["One takeaway"],
    bodyMarkdown: "## Heading\n\nNeutral body with no price claims.",
    faq: [],
    toc: [],
    readingMinutes: 6,
    sources: [],
    status: "published",
    date: "2026-07-01",
    createdAt: new Date(),
    ...overrides,
  } as GeneratedPost;
}

describe("findStalePricePosts", () => {
  it("flags a post whose body quotes an RxFit price that no longer matches PLAN_PRICING", () => {
    const stale = post({
      slug: "old-price-body",
      bodyMarkdown: "RxFit costs $555 per month and it changed my training.",
    });
    const result = findStalePricePosts([stale], PRICING);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("old-price-body");
    expect(result[0].errors.join("\n")).toContain("$555");
    expect(result[0].errors.join("\n")).toContain("/blog/old-price-body");
  });

  it("flags a post whose FAQ quotes an outdated trial length", () => {
    const stale = post({
      slug: "old-trial-faq",
      faq: [{ q: "Does RxFit have a free trial?", a: "Yes — a 14-day free trial." }],
    });
    const result = findStalePricePosts([stale], PRICING);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("old-trial-faq");
    expect(result[0].errors.join("\n")).toContain("14-day free trial");
  });

  it("does not flag current prices or competitor prices in non-RxFit sentences", () => {
    const clean = post({
      slug: "clean-post",
      bodyMarkdown:
        "RxFit costs $111 per month with a 9-day free trial. A personal trainer typically charges $400 per session.",
      faq: [{ q: "Is RxFit worth it?", a: "At $222 for the annual plan, most members think so." }],
    });
    expect(findStalePricePosts([clean], PRICING)).toEqual([]);
  });

  it("returns only the stale posts from a mixed list", () => {
    const clean = post({ slug: "clean", bodyMarkdown: "RxFit costs $111 monthly." });
    const stale = post({ slug: "stale", bodyMarkdown: "RxFit costs $999 monthly." });
    const result = findStalePricePosts([clean, stale], PRICING);
    expect(result.map((r) => r.slug)).toEqual(["stale"]);
  });

  it("handles posts with empty body and non-array faq defensively", () => {
    const weird = post({
      slug: "weird",
      bodyMarkdown: "" as any,
      faq: null as any,
    });
    expect(findStalePricePosts([weird], PRICING)).toEqual([]);
  });
});

describe("refreshStalePricePosts", () => {
  it("refreshes every stale post and leaves clean posts untouched", async () => {
    const refreshPost = vi.fn().mockResolvedValue(undefined);
    const posts = [
      post({ slug: "clean", bodyMarkdown: "RxFit costs $111 monthly." }),
      post({ slug: "stale-a", bodyMarkdown: "RxFit costs $998 monthly." }),
      post({ slug: "stale-b", faq: [{ q: "RxFit trial?", a: "A 30-day free trial." }] }),
    ];
    const result = await refreshStalePricePosts({
      getPublishedPosts: async () => posts,
      refreshPost,
      pricing: PRICING,
    });
    expect(refreshPost.mock.calls.map((c) => c[0])).toEqual(["stale-a", "stale-b"]);
    expect(result.refreshed).toEqual(["stale-a", "stale-b"]);
    expect(result.failed).toEqual([]);
    expect(result.stale.map((s) => s.slug)).toEqual(["stale-a", "stale-b"]);
  });

  it("does nothing when no post is stale", async () => {
    const refreshPost = vi.fn();
    const result = await refreshStalePricePosts({
      getPublishedPosts: async () => [post({ slug: "clean", bodyMarkdown: "RxFit costs $111." })],
      refreshPost,
      pricing: PRICING,
    });
    expect(refreshPost).not.toHaveBeenCalled();
    expect(result).toEqual({ stale: [], refreshed: [], failed: [] });
  });

  it("continues past a failed refresh and throws an aggregate error at the end", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshPost = vi
      .fn()
      .mockRejectedValueOnce(new Error("LLM validation failed twice"))
      .mockResolvedValueOnce(undefined);
    const posts = [
      post({ slug: "fails", bodyMarkdown: "RxFit costs $998 monthly." }),
      post({ slug: "succeeds", bodyMarkdown: "RxFit costs $999 monthly." }),
    ];
    await expect(
      refreshStalePricePosts({
        getPublishedPosts: async () => posts,
        refreshPost,
        pricing: PRICING,
      }),
    ).rejects.toThrow(/failed for 1 of 2 post\(s\): fails.*refreshed OK: succeeds/);
    errorSpy.mockRestore();
    // The failure did not stop the second refresh.
    expect(refreshPost.mock.calls.map((c) => c[0])).toEqual(["fails", "succeeds"]);
  });

  it("propagates a DB read failure instead of swallowing it", async () => {
    const refreshPost = vi.fn();
    await expect(
      refreshStalePricePosts({
        getPublishedPosts: async () => {
          throw new Error("db down");
        },
        refreshPost,
        pricing: PRICING,
      }),
    ).rejects.toThrow("db down");
    expect(refreshPost).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  it("blogScheduler runs the stale-price scan at boot + hourly under its own advisory lock", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "blogScheduler.ts"), "utf-8");
    expect(source).toContain('from "./stalePriceRefresher"');
    expect(source).toContain("findStalePricePosts");
    expect(source).toContain("refreshStalePricePosts()");
    expect(source).toContain("STALE_PRICE_ADVISORY_LOCK_KEY = 815_045");
    // Registered on both the boot timeout and the hourly interval.
    expect(source).toMatch(/setTimeout\(\(\) => void runStalePriceRefreshIfNeeded\(\)/);
    expect(source).toMatch(
      /setInterval\(\(\) => void runStalePriceRefreshIfNeeded\(\), CHECK_INTERVAL_MS\)/,
    );
  });

  it("the manual CLI goes through the same refreshStalePricePosts pipeline", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "refresh-stale-prices.ts"), "utf-8");
    expect(source).toContain('from "./stalePriceRefresher"');
    expect(source).toContain("refreshStalePricePosts()");
  });
});
