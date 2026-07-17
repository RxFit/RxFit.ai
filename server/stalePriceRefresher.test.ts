/**
 * Tests for the stale-price auto-refresh (server/stalePriceRefresher.ts):
 *
 * - findStalePricePosts reuses the SAME priceGuards scanners as the
 *   validate-seo build gate, so "stale" here is exactly what fails a build
 *   after a PLAN_PRICING change: wrong RxFit dollar amounts in the body,
 *   wrong trial-length claims in body or FAQ, and stale claims on the
 *   summary surfaces (tldr/description/keyTakeaways). Non-RxFit
 *   (competitor) sentences are never flagged.
 * - refreshStalePricePosts refreshes each stale post through the injected
 *   refresh pipeline, never touches clean posts, continues past a single
 *   failure, and throws an aggregate error at the end so scheduler/CLI runs
 *   register as failed.
 * - Give-up guard: after MAX_CONSECUTIVE_REFRESH_FAILURES consecutive
 *   failures for one slug, later runs skip it (no refresh attempt, so no
 *   LLM spend or failure email) with a one-time "giving up" notice — until
 *   resetStalePriceFailureTracking() (process restart) or the post's
 *   scanned content changes; a successful refresh resets the counter.
 * - Wiring guards: the scheduler and the CLI both go through this module,
 *   so the auto-refresh can't silently drop out of the boot/hourly checks.
 *
 * NOTE: fixture pricing is deliberately fake (amounts 111/222, 9-day trial).
 * Real plan amounts or trial phrases written literally in a server/ file
 * would themselves trip the validate-seo hardcoded-price guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  findStalePricePosts,
  refreshStalePricePosts,
  resetStalePriceFailureTracking,
  MAX_CONSECUTIVE_REFRESH_FAILURES,
} from "./stalePriceRefresher";
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

  it("flags a post whose ONLY stale claims live in the summary surfaces (tldr/description/keyTakeaways)", () => {
    const stale = post({
      slug: "old-price-summary",
      tldr: "RxFit is $777 per month.",
      description: "RxFit membership now runs $888 monthly for everyone.",
      keyTakeaways: ["RxFit includes a 21-day free trial."],
      // Body and FAQ are clean — detection must come from the summary scan.
      bodyMarkdown: "## Heading\n\nNeutral body with no price claims.",
      faq: [],
    });
    const result = findStalePricePosts([stale], PRICING);
    expect(result).toHaveLength(1);
    expect(result[0].slug).toBe("old-price-summary");
    const joined = result[0].errors.join("\n");
    expect(joined).toContain("/blog/old-price-summary: tldr");
    expect(joined).toContain("/blog/old-price-summary: description");
    expect(joined).toContain("/blog/old-price-summary: keyTakeaways[0]");
    expect(joined).toContain("$777");
    expect(joined).toContain("$888");
    expect(joined).toContain("21-day free trial");
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
  beforeEach(() => {
    // The give-up guard is module-level, per-process state — isolate tests.
    resetStalePriceFailureTracking();
  });

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
    expect(result.skipped).toEqual([]);
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
    expect(result).toEqual({ stale: [], refreshed: [], failed: [], skipped: [] });
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

describe("give-up guard (skip after consecutive failures)", () => {
  beforeEach(() => {
    resetStalePriceFailureTracking();
  });

  const stalePosts = () => [post({ slug: "broken", bodyMarkdown: "RxFit costs $998 monthly." })];

  const runOnce = (refreshPost: ReturnType<typeof vi.fn>, posts = stalePosts()) =>
    refreshStalePricePosts({
      getPublishedPosts: async () => posts,
      refreshPost,
      pricing: PRICING,
    });

  it("skips a slug after MAX consecutive failures: no more refresh attempts and no aggregate throw", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshPost = vi.fn().mockRejectedValue(new Error("draft keeps failing validation"));

    for (let i = 0; i < MAX_CONSECUTIVE_REFRESH_FAILURES; i++) {
      await expect(runOnce(refreshPost)).rejects.toThrow(/broken/);
    }
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES);

    // Next hourly run: skipped, no attempt (=> no LLM call / failure email), resolves.
    const result = await runOnce(refreshPost);
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES);
    expect(result.skipped).toEqual(["broken"]);
    expect(result.failed).toEqual([]);
    expect(result.refreshed).toEqual([]);
    errorSpy.mockRestore();
  });

  it("logs the giving-up notice exactly once, then only the quieter skip line", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const refreshPost = vi.fn().mockRejectedValue(new Error("nope"));

    for (let i = 0; i < MAX_CONSECUTIVE_REFRESH_FAILURES; i++) {
      await runOnce(refreshPost).catch(() => {});
    }
    await runOnce(refreshPost); // skipped run 1
    await runOnce(refreshPost); // skipped run 2

    const givingUp = errorSpy.mock.calls.filter((c) =>
      String(c[0]).includes("Giving up on /blog/broken"),
    );
    expect(givingUp).toHaveLength(1);
    const skips = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes("Skipping /blog/broken"),
    );
    expect(skips).toHaveLength(2);
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("a successful refresh resets the consecutive-failure counter", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshPost = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("fails again"));

    await runOnce(refreshPost).catch(() => {});
    await runOnce(refreshPost).catch(() => {});
    await runOnce(refreshPost); // succeeds → counter reset
    // Two more failures = only 2 consecutive — still below MAX, so still attempted.
    await runOnce(refreshPost).catch(() => {});
    await runOnce(refreshPost).catch(() => {});
    const result = await runOnce(refreshPost).catch((e) => e);
    // 6th call happened (not skipped): counter was reset by the success.
    expect(refreshPost).toHaveBeenCalledTimes(6);
    expect(result).toBeInstanceOf(Error);
    errorSpy.mockRestore();
  });

  it("retries a given-up slug when the post's scanned content changes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshPost = vi.fn().mockRejectedValue(new Error("nope"));

    for (let i = 0; i < MAX_CONSECUTIVE_REFRESH_FAILURES; i++) {
      await runOnce(refreshPost).catch(() => {});
    }
    await runOnce(refreshPost); // given up, skipped
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES);

    // Same slug, different (still stale) body — e.g. manually edited.
    const edited = [post({ slug: "broken", bodyMarkdown: "RxFit now costs $997 monthly." })];
    await runOnce(refreshPost, edited).catch(() => {});
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES + 1);
    errorSpy.mockRestore();
  });

  it("resetStalePriceFailureTracking (process restart) makes it retry again", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshPost = vi.fn().mockRejectedValue(new Error("nope"));

    for (let i = 0; i < MAX_CONSECUTIVE_REFRESH_FAILURES; i++) {
      await runOnce(refreshPost).catch(() => {});
    }
    await runOnce(refreshPost);
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES);

    resetStalePriceFailureTracking();
    await runOnce(refreshPost).catch(() => {});
    expect(refreshPost).toHaveBeenCalledTimes(MAX_CONSECUTIVE_REFRESH_FAILURES + 1);
    errorSpy.mockRestore();
  });

  it("skips only the given-up slug — other stale posts still refresh, run resolves", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = post({ slug: "broken", bodyMarkdown: "RxFit costs $998 monthly." });
    const other = post({ slug: "other", bodyMarkdown: "RxFit costs $999 monthly." });

    // Give up on "broken" (alone in the list so counts stay per-slug).
    const alwaysFails = vi.fn().mockRejectedValue(new Error("nope"));
    for (let i = 0; i < MAX_CONSECUTIVE_REFRESH_FAILURES; i++) {
      await runOnce(alwaysFails, [broken]).catch(() => {});
    }

    const refreshPost = vi.fn().mockResolvedValue(undefined);
    const result = await refreshStalePricePosts({
      getPublishedPosts: async () => [broken, other],
      refreshPost,
      pricing: PRICING,
    });
    expect(refreshPost.mock.calls.map((c) => c[0])).toEqual(["other"]);
    expect(result.skipped).toEqual(["broken"]);
    expect(result.refreshed).toEqual(["other"]);
    expect(result.failed).toEqual([]);
    errorSpy.mockRestore();
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
