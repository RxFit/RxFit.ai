/**
 * Guards the shared tier <-> price agreement layer.
 *
 * Context: the production "Stripe plan tiers" alert fired because the site
 * resolved tiers through `product.metadata.tier -> product.prices[0].id`,
 * which cannot express the real catalog (all three tiers are prices on ONE
 * product). These tests pin the replacement: tiers resolve to pinned price
 * IDs, and drift is detected by comparing a live price against PLAN_PRICING.
 *
 * Every expectation is derived from PLAN_PRICING/LIVE_PRICE_IDS rather than
 * written as a literal, so the tests cannot go stale when a price changes —
 * and so scripts/priceGuards.mjs has no hardcoded amount to flag.
 */
import { describe, it, expect } from "vitest";
import { LIVE_PRICE_IDS, PLAN_PRICING, type PlanTier } from "./stripe-constants";
import {
  PLAN_TIERS,
  resolvePlanTier,
  priceIdForTier,
  expectedUnitAmount,
  expectedInterval,
  trialDaysForTier,
  priceMismatches,
  type PriceShape,
} from "./stripe-catalog";

/** A price that agrees with PLAN_PRICING for `tier`, built from the source of truth. */
function goodPrice(tier: PlanTier): PriceShape {
  const interval = expectedInterval(tier);
  return {
    id: LIVE_PRICE_IDS[tier],
    active: true,
    currency: "usd",
    unit_amount: expectedUnitAmount(tier),
    recurring: interval === null ? null : { interval, trial_period_days: null },
  };
}

describe("resolvePlanTier", () => {
  it("resolves each advertised tier", () => {
    for (const tier of PLAN_TIERS) expect(resolvePlanTier(tier)).toBe(tier);
  });

  it("rejects anything that is not a tier", () => {
    for (const bad of ["", "KICKSTART", "vip", undefined, null, 42, {}, []]) {
      expect(resolvePlanTier(bad)).toBeNull();
    }
  });

  it("rejects prototype keys — `'__proto__' in LIVE_PRICE_IDS` is true", () => {
    for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
      expect(resolvePlanTier(key)).toBeNull();
    }
  });
});

describe("tier metadata derives from the single source of truth", () => {
  it("PLAN_TIERS matches both constant maps", () => {
    expect(PLAN_TIERS).toEqual(Object.keys(LIVE_PRICE_IDS));
    expect(PLAN_TIERS).toEqual(Object.keys(PLAN_PRICING));
  });

  it("priceIdForTier returns the pinned live price id", () => {
    for (const tier of PLAN_TIERS) expect(priceIdForTier(tier)).toBe(LIVE_PRICE_IDS[tier]);
  });

  it("expectedUnitAmount converts dollars to cents", () => {
    for (const tier of PLAN_TIERS) {
      expect(expectedUnitAmount(tier)).toBe(PLAN_PRICING[tier].amount * 100);
    }
  });

  it("trialDaysForTier only applies to kickstart", () => {
    expect(trialDaysForTier("kickstart")).toBe(PLAN_PRICING.kickstart.trialDays);
    expect(trialDaysForTier("committed")).toBeUndefined();
    expect(trialDaysForTier("transformation")).toBeUndefined();
  });

  it("maps the 'one-time' copy string to a null Stripe interval", () => {
    // The trap this pins: PLAN_PRICING.transformation.interval is the STRING
    // "one-time", which is not a Stripe interval and not null. Comparing it
    // directly against price.recurring?.interval is itself a bug.
    expect(PLAN_PRICING.transformation.interval).toBe("one-time");
    expect(expectedInterval("transformation")).toBeNull();
    expect(expectedInterval("kickstart")).toBe(PLAN_PRICING.kickstart.interval);
    expect(expectedInterval("committed")).toBe(PLAN_PRICING.committed.interval);
  });
});

describe("priceMismatches", () => {
  it("reports no mismatch for a price that agrees with PLAN_PRICING", () => {
    for (const tier of PLAN_TIERS) expect(priceMismatches(tier, goodPrice(tier))).toEqual([]);
  });

  it("treats a missing price as a mismatch rather than throwing", () => {
    expect(priceMismatches("kickstart", null)).toEqual(["price not found in Stripe"]);
    expect(priceMismatches("kickstart", undefined)).toEqual(["price not found in Stripe"]);
  });

  it("flags a deactivated price", () => {
    const out = priceMismatches("transformation", { ...goodPrice("transformation"), active: false });
    expect(out).toContain("price is not active in Stripe");
  });

  it("flags a non-USD price", () => {
    const out = priceMismatches("kickstart", { ...goodPrice("kickstart"), currency: "eur" });
    expect(out.join(" ")).toMatch(/currency is eur, expected usd/);
  });

  it("names both the actual and the expected amount when the price drifts", () => {
    const drifted = expectedUnitAmount("kickstart") + 1000;
    const out = priceMismatches("kickstart", { ...goodPrice("kickstart"), unit_amount: drifted });
    expect(out.join(" ")).toContain(String(drifted));
    expect(out.join(" ")).toContain(String(expectedUnitAmount("kickstart")));
  });

  it("flags a wrong billing interval", () => {
    const out = priceMismatches("kickstart", {
      ...goodPrice("kickstart"),
      recurring: { interval: "year" },
    });
    expect(out.join(" ")).toMatch(/interval is year, expected month/);
  });

  it("flags a one-time tier that became recurring", () => {
    const out = priceMismatches("transformation", {
      ...goodPrice("transformation"),
      recurring: { interval: "year" },
    });
    expect(out.join(" ")).toMatch(/expected a one-time price/);
  });

  it("flags a recurring tier that lost its recurrence", () => {
    const out = priceMismatches("committed", { ...goodPrice("committed"), recurring: null });
    expect(out.join(" ")).toMatch(/interval is one-time, expected year/);
  });

  it("does NOT flag a kickstart price whose trial_period_days is null", () => {
    // Regression guard. The live kickstart price has trial_period_days: null
    // while the site advertises a 7-day trial; the trial is honoured on the
    // checkout session, not on the price. Asserting it here would produce an
    // hourly alert that no code change could ever clear.
    const out = priceMismatches("kickstart", {
      ...goodPrice("kickstart"),
      recurring: { interval: "month", trial_period_days: null },
    });
    expect(out).toEqual([]);
  });
});
