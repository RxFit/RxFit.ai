/**
 * Regression tests for the price-drift guard helpers (scripts/priceGuards.mjs)
 * used by scripts/validate-seo.mjs, so a refactor of the regex patterns can't
 * quietly stop catching hardcoded prices or stale MDX price claims.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error — plain .mjs module without type declarations
import { parsePlanPricing, scanCodeForHardcodedPrices, scanMdxPriceClaims } from "./priceGuards.mjs";

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

describe("validate-seo.mjs wiring", () => {
  it("still imports and calls the shared guard helpers", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "validate-seo.mjs"), "utf8");
    expect(src).toMatch(/from\s+["']\.\/priceGuards\.mjs["']/);
    expect(src).toContain("parsePlanPricing(");
    expect(src).toContain("scanCodeForHardcodedPrices(");
    expect(src).toContain("scanMdxPriceClaims(");
  });
});
