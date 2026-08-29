/**
 * Shared, framework-free agreement layer between the site's advertised plan
 * tiers and the live Stripe catalog.
 *
 * Both the checkout route (which decides what a buyer is charged) and the
 * credential health check (which decides whether to page the owner) import
 * from here, so "which price is this tier" and "what does a correct price
 * look like" can never disagree between them.
 *
 * Kept OUT of shared/stripe-constants.ts on purpose: scripts/priceGuards.mjs
 * regex-parses that file's PLAN_PRICING block and scripts/validate-seo.mjs
 * reads it as text, so adding functions there risks tripping the price-drift
 * guards on this file's own derived arithmetic.
 */
import { LIVE_PRICE_IDS, PLAN_PRICING, type PlanTier } from "./stripe-constants";

export const PLAN_TIERS = Object.keys(LIVE_PRICE_IDS) as PlanTier[];

/**
 * Server-side resolution of a request's `plan` field. The checkout route uses
 * this INSTEAD of trusting a client-supplied priceId, so no caller can select
 * a different price. Returns null for anything that is not one of the tiers.
 */
export function resolvePlanTier(plan: unknown): PlanTier | null {
  if (typeof plan !== "string") return null;
  // hasOwnProperty, not `in`: `"__proto__" in LIVE_PRICE_IDS` is true.
  if (!Object.prototype.hasOwnProperty.call(LIVE_PRICE_IDS, plan)) return null;
  return plan as PlanTier;
}

export function priceIdForTier(tier: PlanTier): string {
  return LIVE_PRICE_IDS[tier];
}

/** Cents the site advertises for a tier. Derived, never a literal. */
export function expectedUnitAmount(tier: PlanTier): number {
  return PLAN_PRICING[tier].amount * 100;
}

/**
 * Stripe's recurring.interval for a tier, or null for a one-time price.
 * PLAN_PRICING.transformation.interval is the STRING "one-time", not null and
 * not a Stripe interval — a naive
 * `price.recurring?.interval === PLAN_PRICING[tier].interval` comparison is
 * itself a bug. This is the only place that mapping lives.
 */
export function expectedInterval(tier: PlanTier): "month" | "year" | null {
  const i = PLAN_PRICING[tier].interval;
  return i === "one-time" ? null : i;
}

/** Trial days the site advertises for a tier, or undefined. Written as a
 *  ternary because only the kickstart member of the PLAN_PRICING union has
 *  a `trialDays` property — `PLAN_PRICING[tier].trialDays` does not typecheck. */
export function trialDaysForTier(tier: PlanTier): number | undefined {
  return tier === "kickstart" ? PLAN_PRICING.kickstart.trialDays : undefined;
}

/** The subset of a Stripe Price we assert against. Structural, so a
 *  Stripe.Price, a row from /api/stripe/products and a test fixture all fit
 *  without importing the Stripe SDK into client-reachable code. */
export type PriceShape = {
  id?: string | null;
  active?: boolean | null;
  currency?: string | null;
  unit_amount?: number | null;
  recurring?: { interval?: string | null; trial_period_days?: number | null } | null;
};

/**
 * Read-only agreement check between a live Stripe price and what the site
 * advertises for `tier`. [] means they agree. Never throws, never writes.
 *
 * Deliberately does NOT assert recurring.trial_period_days: the live kickstart
 * price legitimately has it null while PLAN_PRICING.kickstart.trialDays is 7.
 * Asserting it would emit an hourly alert that no code change could clear and
 * that only a live Stripe write could silence — the never-passable-check
 * failure mode this module exists to remove.
 */
export function priceMismatches(tier: PlanTier, price: PriceShape | null | undefined): string[] {
  if (!price) return ["price not found in Stripe"];
  const out: string[] = [];
  if (price.active !== true) out.push("price is not active in Stripe");
  if (price.currency !== "usd") out.push(`currency is ${price.currency ?? "missing"}, expected usd`);
  const want = expectedUnitAmount(tier);
  if (price.unit_amount !== want) {
    out.push(`unit_amount is ${price.unit_amount ?? "missing"}, expected ${want} (${PLAN_PRICING[tier].display})`);
  }
  const wantInterval = expectedInterval(tier);
  if (wantInterval === null) {
    if (price.recurring) out.push(`price is recurring (${price.recurring.interval}), expected a one-time price`);
  } else if (price.recurring?.interval !== wantInterval) {
    out.push(`interval is ${price.recurring?.interval ?? "one-time"}, expected ${wantInterval}`);
  }
  return out;
}
