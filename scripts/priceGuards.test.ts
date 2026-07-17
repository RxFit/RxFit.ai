/**
 * Regression tests for the price-drift guard helpers (scripts/priceGuards.mjs)
 * used by scripts/validate-seo.mjs, so a refactor of the regex patterns can't
 * quietly stop catching hardcoded prices or stale MDX price claims.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parsePlanPricing,
  scanCodeForHardcodedPrices,
  scanMdxPriceClaims,
  scanFaqPriceClaims,
  scanSummaryPriceClaims,
} from "./priceGuards.mjs";

const PRICING = { amounts: [49, 490, 997], savings: [98], trialDays: 7 };

describe("parsePlanPricing", () => {
  it("parses amounts, savings, and trialDays from the real stripe-constants.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "shared", "stripe-constants.ts"),
      "utf8",
    );
    const parsed = parsePlanPricing(src);
    expect(parsed.error).toBeUndefined();
    expect(parsed.amounts.length).toBeGreaterThanOrEqual(3);
    expect(parsed.trialDays).toBeGreaterThan(0);
  });

  it("returns an error when the PLAN_PRICING block is missing", () => {
    expect(parsePlanPricing("export const OTHER = 1;").error).toContain("PLAN_PRICING");
  });

  it("does not let numbers outside the PLAN_PRICING block leak into the allowed set", () => {
    const src = `
      const NOISE = { amount: 123 };
      export const PLAN_PRICING = {
        kickstart: { amount: 49, trialDays: 7 },
      } as const;
      const MORE_NOISE = { amount: 456 };
    `;
    const parsed = parsePlanPricing(src);
    expect(parsed.amounts).toEqual([49]);
  });
});

describe("scanCodeForHardcodedPrices", () => {
  it("flags a literal plan price in a page file", () => {
    const errs = scanCodeForHardcodedPrices(PRICING, "client/src/pages/X.tsx", `const p = "$49/mo";`);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('hardcoded plan price "$49"');
    expect(errs[0]).toContain("line 1");
  });

  it("flags hardcoded trial phrases (both forms)", () => {
    const errs = scanCodeForHardcodedPrices(
      PRICING,
      "client/src/components/Y.tsx",
      `a("7-day free trial");\nb("free for 7 days");`,
    );
    expect(errs).toHaveLength(2);
    expect(errs.every((e: string) => e.includes("hardcoded trial copy"))).toBe(true);
  });

  it("does not flag non-plan amounts or larger numbers that merely contain a plan amount", () => {
    const errs = scanCodeForHardcodedPrices(
      PRICING,
      "client/src/pages/Z.tsx",
      `const trainer = "$400-$800/mo"; const big = "$4900"; const cents = "$49.99";`,
    );
    expect(errs).toEqual([]);
  });

  it("flags literal Stripe unit_amount and trial_period_days in server code", () => {
    const errs = scanCodeForHardcodedPrices(
      PRICING,
      "server/seed-products.ts",
      `await stripe.prices.create({\n  unit_amount: 4900,\n  recurring: { interval: 'month', trial_period_days: 7 },\n});`,
    );
    expect(errs).toHaveLength(2);
    expect(errs[0]).toContain("hardcoded Stripe unit_amount");
    expect(errs[1]).toContain("hardcoded Stripe trial_period_days");
  });

  it("accepts unit_amount/trial_period_days derived from PLAN_PRICING", () => {
    const errs = scanCodeForHardcodedPrices(
      PRICING,
      "server/seed-products.ts",
      `unit_amount: PLAN_PRICING.kickstart.amount * 100,\nrecurring: { interval: 'month', trial_period_days: PLAN_PRICING.kickstart.trialDays },`,
    );
    expect(errs).toEqual([]);
  });
});

describe("scanMdxPriceClaims", () => {
  it("flags an RxFit sentence with a non-matching dollar amount", () => {
    const errs = scanMdxPriceClaims(
      PRICING,
      "content/blog/post.mdx",
      "RxFit costs just $59 per month. That is the whole pitch.",
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('"$59"');
  });

  it("accepts RxFit sentences quoting current amounts or savings", () => {
    const errs = scanMdxPriceClaims(
      PRICING,
      "content/blog/post.mdx",
      "RxFit starts at $49 a month, or $490 a year — saving you $98 annually.",
    );
    expect(errs).toEqual([]);
  });

  it("flags stale trial-length claims anywhere in the body", () => {
    const errs = scanMdxPriceClaims(
      PRICING,
      "content/blog/post.mdx",
      "Sign up for the 14-day free trial today. You train free for 30 days.",
    );
    expect(errs).toHaveLength(2);
  });

  it("ignores '7-day trend' prose and competitor prices in non-RxFit sentences", () => {
    const errs = scanMdxPriceClaims(
      PRICING,
      "content/blog/post.mdx",
      "Watch your 7-day trend in HRV. A personal trainer costs $500 per month. RxFit is different.",
    );
    expect(errs).toEqual([]);
  });
});

describe("scanSummaryPriceClaims", () => {
  it("flags a wrong RxFit price in each summary field with a per-field label", () => {
    const errs = scanSummaryPriceClaims(PRICING, "generated_posts/x", {
      tldr: "RxFit costs just $59 per month.",
      description: "RxFit plans start at $59 with coaching included.",
      keyTakeaways: ["Sleep matters.", "RxFit is $59 a month."],
    });
    expect(errs).toHaveLength(3);
    expect(errs[0]).toContain("generated_posts/x: tldr");
    expect(errs[1]).toContain("generated_posts/x: description");
    expect(errs[2]).toContain("generated_posts/x: keyTakeaways[1]");
    expect(errs.every((e: string) => e.includes('"$59"'))).toBe(true);
  });

  it("flags stale trial-length claims in any field, RxFit mention or not", () => {
    const errs = scanSummaryPriceClaims(PRICING, "x", {
      tldr: "Start with the 14-day free trial.",
      description: "You can train free for 30 days.",
      keyTakeaways: ["A 21-day free trial beats none."],
    });
    expect(errs).toHaveLength(3);
    expect(errs.every((e: string) => e.includes("trialDays"))).toBe(true);
  });

  it("accepts current prices in RxFit sentences and competitor prices in non-RxFit sentences", () => {
    const errs = scanSummaryPriceClaims(PRICING, "x", {
      tldr: "RxFit starts at $49 a month with a 7-day free trial.",
      description: "A personal trainer costs $400 per month. RxFit is $490 a year (save $98).",
      keyTakeaways: ["Trainers charge $500+ monthly.", "RxFit is $997 one-time for Transformation."],
    });
    expect(errs).toEqual([]);
  });

  it("handles missing or malformed fields without throwing", () => {
    expect(scanSummaryPriceClaims(PRICING, "x", {})).toEqual([]);
    expect(scanSummaryPriceClaims(PRICING, "x", null as never)).toEqual([]);
    expect(
      scanSummaryPriceClaims(PRICING, "x", {
        tldr: null,
        description: undefined,
        keyTakeaways: [null, 42, "RxFit costs $49."] as never,
      }),
    ).toEqual([]);
  });
});

describe("scanFaqPriceClaims", () => {
  it("flags a wrong price in the answer when only the question names RxFit", () => {
    const errs = scanFaqPriceClaims(PRICING, "generated_posts/x", [
      { q: "How much does RxFit cost?", a: "Plans start at $59 per month." },
    ]);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain("faq[0]");
    expect(errs[0]).toContain('"$59"');
  });

  it("flags stale trial-length claims in any pair, RxFit mention or not", () => {
    const errs = scanFaqPriceClaims(PRICING, "generated_posts/x", [
      { q: "Is there a trial?", a: "Yes, a 14-day free trial." },
      { q: "Anything else?", a: "You train free for 30 days." },
    ]);
    expect(errs).toHaveLength(2);
    expect(errs[0]).toContain("faq[0]");
    expect(errs[1]).toContain("faq[1]");
  });

  it("accepts current prices in RxFit pairs and competitor prices in non-RxFit pairs", () => {
    const errs = scanFaqPriceClaims(PRICING, "generated_posts/x", [
      { q: "How much does RxFit cost?", a: "Plans start at $49/month or $490 a year (save $98), with a 7-day free trial." },
      { q: "What does a personal trainer cost?", a: "Typically $200 to $600 per month." },
    ]);
    expect(errs).toEqual([]);
  });

  it("handles malformed input (non-array faq, missing q/a) without throwing", () => {
    expect(scanFaqPriceClaims(PRICING, "x", null as never)).toEqual([]);
    expect(scanFaqPriceClaims(PRICING, "x", [null, { q: "RxFit?" }, {}] as never)).toEqual([]);
  });
});

describe("validate-seo.mjs wiring", () => {
  it("still imports and calls the shared guard helpers", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "validate-seo.mjs"), "utf8");
    expect(src).toMatch(/from\s+["']\.\/priceGuards\.mjs["']/);
    expect(src).toContain("parsePlanPricing(");
    expect(src).toContain("scanCodeForHardcodedPrices(");
    expect(src).toContain("scanMdxPriceClaims(");
  });

  it("re-validates DB-published posts' price claims (body + faq + summary fields) in the DB gate", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "validate-seo.mjs"), "utf8");
    expect(src).toContain("scanFaqPriceClaims(");
    expect(src).toContain("scanSummaryPriceClaims(");
    // The DB gate must fetch every scanned column and receive the parsed pricing.
    expect(src).toMatch(
      /SELECT slug, body_markdown, faq, tldr, description, key_takeaways FROM generated_posts/,
    );
    expect(src).toMatch(/validateDbPostLinks\(planPricing,/);
  });

  it("scans server code (email copy, generator prompt, seed script) too", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "validate-seo.mjs"), "utf8");
    const dirs = src.match(/const codeDirs = \[([^\]]*)\]/);
    expect(dirs).not.toBeNull();
    expect(dirs![1]).toContain('"server"');
  });
});
