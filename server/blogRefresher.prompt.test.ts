/**
 * Guards the refresh prompt's price-correction contract
 * (server/blogRefresher.ts buildRefreshPrompt):
 *
 * - The prompt MUST carry the current RXFIT PRICING FACTS (derived from
 *   PLAN_PRICING/TRIAL_COPY, same as the new-post prompt). Without it, a
 *   stale-price refresh feeds the model only the OLD post body — the model
 *   has no source for the new prices, validation rejects the draft twice,
 *   and the hourly stale-price scan degenerates into a failure-email loop.
 * - The retry after a failed validation MUST feed the exact errors back
 *   into the prompt (buildRetryFeedback), not blindly re-roll.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buildRefreshPrompt } from "./blogRefresher";
import { PLAN_PRICING, TRIAL_COPY } from "@shared/stripe-constants";
import type { GeneratedPost } from "@shared/schema";

const POST = {
  id: "prompt-test-id",
  slug: "prompt-test-post",
  title: "Prompt Test Post",
  seoTitle: "Prompt Test Post | RxFit.ai",
  description: "Fixture for refresh prompt tests.",
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
  bodyMarkdown: "## Heading\n\nBody text.",
  faq: [],
  toc: [],
  readingMinutes: 6,
  sources: [],
  status: "published",
  date: "2026-07-01",
  createdAt: new Date(),
} as unknown as GeneratedPost;

describe("buildRefreshPrompt", () => {
  it("includes the current RXFIT PRICING FACTS so a refresh can fix stale prices", () => {
    const prompt = buildRefreshPrompt(POST, [], [], []);
    expect(prompt).toContain("RXFIT PRICING FACTS");
    // Values come from the live constants — never hardcoded here (the
    // validate-seo guard bans price literals in server/ files anyway).
    expect(prompt).toContain(PLAN_PRICING.kickstart.perMonth);
    expect(prompt).toContain(TRIAL_COPY);
    expect(prompt).toContain(PLAN_PRICING.committed.perYear);
    expect(prompt).toContain(PLAN_PRICING.committed.savings);
    expect(prompt).toContain(PLAN_PRICING.transformation.oneTime);
  });

  it("still contains the existing post body and immutable slug instruction", () => {
    const prompt = buildRefreshPrompt(POST, [], [], []);
    expect(prompt).toContain(POST.bodyMarkdown);
    expect(prompt).toContain(`slug: return EXACTLY "${POST.slug}"`);
  });
});

describe("refresh retry wiring", () => {
  it("feeds first-attempt validation errors into the retry draft (no blind re-roll)", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "blogRefresher.ts"), "utf-8");
    // The retry call must pass the errors array into draftRefresh…
    expect(source).toMatch(
      /draftRefresh\(post, candidate\.queries, research, existingPosts, errors\)/,
    );
    // …and draftRefresh must append the shared retry-feedback block.
    expect(source).toContain("buildRetryFeedback(previousErrors)");
  });
});
