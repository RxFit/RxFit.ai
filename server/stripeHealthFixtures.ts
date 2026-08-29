/**
 * Test-only fixtures for the Stripe catalog probe in credentialHealthCheck.
 * Not imported by any runtime code path.
 *
 * Named WITHOUT `.test.` so vitest's test glob does not collect it as a suite.
 */
import { LIVE_PRICE_IDS, type PlanTier } from "@shared/stripe-constants";
import { expectedInterval, expectedUnitAmount, PLAN_TIERS } from "@shared/stripe-catalog";

/** A Stripe Price object that agrees with PLAN_PRICING for `tier`. */
export function livePriceFixture(tier: PlanTier) {
  const interval = expectedInterval(tier);
  return {
    id: LIVE_PRICE_IDS[tier],
    active: true,
    currency: "usd",
    unit_amount: expectedUnitAmount(tier),
    // trial_period_days is null on the REAL live kickstart price — kept here so
    // it stays obvious that priceMismatches must not assert on it.
    recurring: interval === null ? null : { interval, trial_period_days: null },
  };
}

/** Drop-in `stripe.prices.retrieve` whose catalog matches the site exactly. */
export async function retrieveLivePriceFixture(id: string) {
  const tier = PLAN_TIERS.find((t) => LIVE_PRICE_IDS[t] === id);
  if (!tier) throw new Error(`No such price: ${id}`);
  return livePriceFixture(tier);
}

/** A healthy Stripe client mock: balance probe + matching catalog. */
export function healthyStripeClient() {
  return {
    balance: { retrieve: async () => ({ object: "balance", livemode: true }) },
    prices: { retrieve: retrieveLivePriceFixture },
  };
}
