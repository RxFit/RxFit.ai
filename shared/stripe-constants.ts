export type PlanTier = keyof typeof PLAN_PRICING;

/**
 * Single source of truth for tier display pricing. Pricing cards, the hero
 * definition sentence, FAQ answers, compare-page copy, and the Product/Offer
 * JSON-LD all derive from these values — change a price here (and in Stripe)
 * and every surface plus the structured data updates together.
 * Guarded by shared/landing-seo.test.ts.
 */
export const PLAN_PRICING = {
  kickstart: {
    name: "The Kickstart",
    amount: 49,
    display: "$49",
    interval: "month" as const,
    perMonth: "$49/month",
    perMonthShort: "$49/mo",
    trialDays: 7,
  },
  committed: {
    name: "The Committed",
    amount: 490,
    display: "$490",
    interval: "year" as const,
    perYear: "$490/year",
    savings: "$98",
  },
  transformation: {
    name: "The Transformation",
    amount: 997,
    display: "$997",
    interval: "one-time" as const,
    oneTime: "$997 one-time",
  },
} as const;

/** "7-day free trial" — used verbatim across hero, FAQ, and compare copy. */
export const TRIAL_COPY = `${PLAN_PRICING.kickstart.trialDays}-day free trial`;

/** Price string for schema.org Offer JSON-LD (e.g. "49.00"). */
export function jsonLdPrice(tier: PlanTier): string {
  return PLAN_PRICING[tier].amount.toFixed(2);
}
