/**
 * The money-deciding half of POST /api/stripe/checkout.
 *
 * The production incident's second alert claimed buyers were "silently getting
 * the hardcoded fallback price". The real hazard was the inverse: the client
 * could override the price, and the route forwarded whatever priceId it was
 * handed straight into line_items. These tests pin the fix — the charged price
 * is derived from the tier alone and nothing in the request can move it.
 */
import { describe, it, expect } from "vitest";
import { buildCheckoutSessionParams } from "./checkoutSession";
import { LIVE_PRICE_IDS, type PlanTier } from "@shared/stripe-constants";
import { expectedUnitAmount, expectedInterval, PLAN_TIERS } from "@shared/stripe-catalog";

const BASE = "https://rxfit.ai";

function priceFor(tier: PlanTier) {
  const interval = expectedInterval(tier);
  return {
    id: LIVE_PRICE_IDS[tier],
    active: true,
    currency: "usd",
    unit_amount: expectedUnitAmount(tier),
    recurring: interval === null ? null : { interval },
  };
}

describe("buildCheckoutSessionParams", () => {
  it("charges the pinned price for each tier", () => {
    for (const tier of PLAN_TIERS) {
      const params = buildCheckoutSessionParams({ tier, priceObj: priceFor(tier), baseUrl: BASE });
      expect(params.line_items).toEqual([{ price: LIVE_PRICE_IDS[tier], quantity: 1 }]);
    }
  });

  it("ignores a mismatched priceObj.id — the tier decides the charge", () => {
    // price_1RKmNg… is a real $1.00/month price in this live account. Before the
    // fix, a request naming it would have been checkout-able.
    for (const tier of PLAN_TIERS) {
      const params = buildCheckoutSessionParams({
        tier,
        priceObj: { ...priceFor(tier), id: "price_1RKmNgFrMqe8QyNbWuvhgyF7" },
        baseUrl: BASE,
      });
      expect(params.line_items[0].price).toBe(LIVE_PRICE_IDS[tier]);
      expect(params.line_items[0].price).not.toBe("price_1RKmNgFrMqe8QyNbWuvhgyF7");
    }
  });

  it("selects subscription mode for recurring tiers and payment mode for one-time", () => {
    expect(buildCheckoutSessionParams({ tier: "kickstart", priceObj: priceFor("kickstart"), baseUrl: BASE }).mode)
      .toBe("subscription");
    expect(buildCheckoutSessionParams({ tier: "committed", priceObj: priceFor("committed"), baseUrl: BASE }).mode)
      .toBe("subscription");
    expect(buildCheckoutSessionParams({ tier: "transformation", priceObj: priceFor("transformation"), baseUrl: BASE }).mode)
      .toBe("payment");
  });

  it("derives the success and cancel URLs from the request's base URL", () => {
    const params = buildCheckoutSessionParams({
      tier: "kickstart",
      priceObj: priceFor("kickstart"),
      baseUrl: "http://localhost:5000",
    });
    expect(params.success_url).toBe("http://localhost:5000/success?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("http://localhost:5000/#pricing");
    expect(params.allow_promotion_codes).toBe(true);
  });

  it("omits customer_email for empty, missing and non-string values", () => {
    for (const email of ["", undefined, null, 42, {}]) {
      const params = buildCheckoutSessionParams({
        tier: "kickstart", priceObj: priceFor("kickstart"), baseUrl: BASE, email,
      });
      expect(params).not.toHaveProperty("customer_email");
    }
    const withEmail = buildCheckoutSessionParams({
      tier: "kickstart", priceObj: priceFor("kickstart"), baseUrl: BASE, email: "ada@example.com",
    });
    expect(withEmail.customer_email).toBe("ada@example.com");
  });

  it("passes a string clientReferenceId through, truncated to 200 chars", () => {
    const long = "u".repeat(500);
    const params = buildCheckoutSessionParams({
      tier: "committed", priceObj: priceFor("committed"), baseUrl: BASE, clientReferenceId: long,
    });
    expect(params.client_reference_id).toHaveLength(200);

    const nonString = buildCheckoutSessionParams({
      tier: "committed", priceObj: priceFor("committed"), baseUrl: BASE, clientReferenceId: { a: 1 },
    });
    expect(nonString).not.toHaveProperty("client_reference_id");
  });

  it("does not send subscription_data — the advertised trial is not applied today", () => {
    // Documents the known, deliberately-unfixed gap: the site promises a 7-day
    // free trial for kickstart but nothing sets trial_period_days. If the owner
    // decides to honour it, this expectation is what needs to flip.
    const params = buildCheckoutSessionParams({
      tier: "kickstart", priceObj: priceFor("kickstart"), baseUrl: BASE,
    });
    expect(params).not.toHaveProperty("subscription_data");
  });
});
