import { priceIdForTier, type PriceShape } from "@shared/stripe-catalog";
import type { PlanTier } from "@shared/stripe-constants";

/**
 * Builds the Stripe Checkout session params for a tier.
 *
 * The price comes from priceIdForTier(tier) — NEVER from the caller and never
 * from priceObj.id — so it is structurally impossible for a request to select
 * a different price than the one the site advertises for that tier. Extracted
 * from the route handler so the money-deciding logic is unit-testable without
 * standing up Express.
 *
 * NOTE: the site advertises a free trial for kickstart (see TRIAL_COPY /
 * PLAN_PRICING.kickstart.trialDays) but the live kickstart price has
 * recurring.trial_period_days = null and nothing here sets subscription_data,
 * so kickstart buyers are charged immediately. That is a pre-existing,
 * revenue-affecting discrepancy left untouched deliberately — honouring it is
 * an owner decision, not a side effect of this fix.
 */
export function buildCheckoutSessionParams(args: {
  tier: PlanTier;
  priceObj: PriceShape;
  baseUrl: string;
  email?: unknown;
  clientReferenceId?: unknown;
}): Record<string, any> {
  const { tier, priceObj, baseUrl, email, clientReferenceId } = args;

  const params: Record<string, any> = {
    payment_method_types: ['card'],
    line_items: [{ price: priceIdForTier(tier), quantity: 1 }],
    success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/#pricing`,
    allow_promotion_codes: true,
    mode: priceObj.recurring ? 'subscription' : 'payment',
  };

  if (email && typeof email === 'string') params.customer_email = email;
  if (clientReferenceId && typeof clientReferenceId === 'string') {
    params.client_reference_id = clientReferenceId.slice(0, 200);
  }

  return params;
}
