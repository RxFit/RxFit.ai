import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import type { InsertLead } from "@shared/schema";
import { resolvePlanTier, priceIdForTier } from "@shared/stripe-catalog";
import { buildCheckoutSessionParams } from "./checkoutSession";

/**
 * Per-IP rate limiter for POST /api/stripe/checkout. Checkout is the most
 * expensive public route (DB read + possible lead write + two Stripe API
 * calls), so bots hammering it could exhaust Stripe quota and pollute the
 * leads table (threat model: Denial of Service). Legitimate buyers retry a
 * handful of times at most, so 10 requests per 15 minutes (same window as
 * leadsRateLimit) is generous for humans and hostile to bots.
 *
 * Exposed as a factory so the route-level test can build a fresh limiter
 * (no shared hit-counting state between tests) and prove the max+1th rapid
 * request gets a 429.
 */
export function createCheckoutRateLimit() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." },
  });
}

export interface CheckoutRouteDeps {
  getStripeClient: () => Promise<any>;
  leadStore: {
    getLeadByEmail: (email: string) => Promise<unknown | undefined>;
    createLead: (lead: { email: string; name?: string; plan: NonNullable<InsertLead["plan"]> }) => Promise<unknown>;
  };
}

/**
 * The POST /api/stripe/checkout handler, extracted into a factory with
 * injectable dependencies (same pattern as productsRoute.ts /
 * blogSlugRoute.ts) so the pricing contract can be enforced by a route-level
 * test (server/checkoutRoute.test.ts) without a real Stripe client:
 *
 * The charged price is derived from the request's `plan` alone, via
 * resolvePlanTier + priceIdForTier + buildCheckoutSessionParams. A
 * client-supplied `priceId` is accepted for compatibility with cached
 * browser bundles but is NEVER used to retrieve or charge — /api/stripe/*
 * routes publicly enumerate active price IDs, so trusting it would let any
 * caller check out against a cheaper active price.
 *
 * The session must carry NO session-level trial override (no
 * `subscription_data` anywhere in the params): the advertised free trial
 * lives on the Stripe PRICE, and the route-level test deep-scans the params
 * object handed to stripe.checkout.sessions.create.
 */
export function createCheckoutHandler(deps: CheckoutRouteDeps) {
  const { getStripeClient, leadStore } = deps;

  return async function checkoutHandler(req: Request, res: Response) {
    try {
      const { priceId, email, name, plan, clientReferenceId } = req.body;

      const tier = resolvePlanTier(plan);
      if (!tier) {
        return res.status(400).json({ message: "A valid plan is required." });
      }
      const resolvedPriceId = priceIdForTier(tier);
      if (priceId && priceId !== resolvedPriceId) {
        console.warn("[checkout] ignoring client-supplied priceId", {
          plan: tier,
          supplied: priceId,
          using: resolvedPriceId,
        });
      }

      const existing = email ? await leadStore.getLeadByEmail(email) : undefined;
      if (!existing && email) {
        try {
          await leadStore.createLead({ email, name: name || undefined, plan: tier });
        } catch (e) {
          // Best-effort lead capture — never block checkout on it.
        }
      }

      const stripe = await getStripeClient();
      const priceObj = await stripe.prices.retrieve(resolvedPriceId);

      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const sessionParams = buildCheckoutSessionParams({
        tier,
        priceObj,
        baseUrl,
        email,
        clientReferenceId,
      });

      const session = await stripe.checkout.sessions.create(sessionParams as any);

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", {
        plan: req.body.plan,
        error: error.message,
        code: error.code,
        type: error.type,
      });
      return res.status(500).json({ message: "Failed to create checkout session." });
    }
  };
}
