/**
 * Test fixtures for the credential health check's Stripe plan-tier probe.
 * Builds a healthy prices.list response (product expanded) matching every
 * PLAN_PRICING tier, so tests exercising other services keep the products
 * check green. Import from tests only.
 */
import { PLAN_PRICING, type PlanTier } from "@shared/stripe-constants";
import type { TierPriceCandidate } from "./credentialHealthCheck";

export function healthyTierPrices(): TierPriceCandidate[] {
  return (Object.keys(PLAN_PRICING) as PlanTier[]).map((tier) => {
    const plan = PLAN_PRICING[tier] as { trialDays?: number };
    return {
      active: true,
      recurring: {
        interval: PLAN_PRICING[tier].interval === "month" ? "month" : "year",
        ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
      },
      unit_amount: PLAN_PRICING[tier].amount * 100,
      product: { active: true, metadata: { tier } },
    };
  });
}

/** vi-free mock factory: a stripe client whose probes all succeed. */
export function healthyStripeClientMock() {
  return {
    balance: { retrieve: async () => ({ object: "balance" }) },
    prices: { list: async () => ({ data: healthyTierPrices() }) },
  };
}
