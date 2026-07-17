import type { Request, Response } from "express";
import { insertLeadSchema, type InsertLead } from "@shared/schema";

export interface CheckoutRouteDeps {
  getStripeClient: () => Promise<any>;
  leadStore: {
    getLeadByEmail: (email: string) => Promise<unknown | undefined>;
    createLead: (lead: InsertLead) => Promise<unknown>;
  };
}

/**
 * The lead `plan` comes straight from the request body (untrusted). Validate
 * it against the schema's allowed plan values; anything else falls back to
 * "kickstart" so best-effort lead capture never fails on a bad plan string.
 */
function sanitizePlan(plan: unknown): InsertLead["plan"] {
  const parsed = insertLeadSchema.shape.plan.safeParse(plan);
  return parsed.success && parsed.data ? parsed.data : "kickstart";
}

/**
 * The POST /api/stripe/checkout handler, extracted into a factory with
 * injectable dependencies (same pattern as productsRoute.ts /
 * blogSlugRoute.ts) so the trial contract can be enforced by a route-level
 * test (server/checkoutRoute.test.ts) without a real Stripe client:
 *
 * The session must be created against exactly the buyer's selected price
 * (`line_items: [{ price: priceId, quantity: 1 }]`) with NO
 * `subscription_data` / `trial_period_days` override anywhere in the params.
 * The advertised free trial (e.g. Kickstart's) lives on the Stripe
 * PRICE (`recurring.trial_period_days`, seeded from PLAN_PRICING by
 * server/seed-products.ts and guarded live by the credential health check's
 * "products" probe). Checkout must let that price-level trial flow through
 * untouched — a session-level override here would silently charge trial
 * buyers immediately WITHOUT tripping the catalog health check, which only
 * inspects the price object.
 */
export function createCheckoutHandler(deps: CheckoutRouteDeps) {
  const { getStripeClient, leadStore } = deps;

  return async function checkoutHandler(req: Request, res: Response) {
    try {
      const { priceId, email, name, plan, clientReferenceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required." });
      }

      const existing = email ? await leadStore.getLeadByEmail(email) : undefined;
      if (!existing && email) {
        try {
          await leadStore.createLead({ email, name: name || undefined, plan: sanitizePlan(plan) });
        } catch (e) {
          // Best-effort lead capture — never block checkout on it.
        }
      }

      const stripe = await getStripeClient();
      const priceObj = await stripe.prices.retrieve(priceId);

      const baseUrl = `${req.protocol}://${req.get("host")}`;

      // NOTE: keep this params object free of `subscription_data` (and any
      // trial override) — see the factory doc comment. The route-level test
      // deep-scans the object passed to stripe.checkout.sessions.create.
      const sessionParams: any = {
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/#pricing`,
        allow_promotion_codes: true,
      };
      sessionParams.mode = priceObj.recurring ? "subscription" : "payment";

      if (email) {
        sessionParams.customer_email = email;
      }

      if (clientReferenceId && typeof clientReferenceId === "string") {
        sessionParams.client_reference_id = clientReferenceId.slice(0, 200);
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", {
        priceId: req.body.priceId,
        error: error.message,
        code: error.code,
        type: error.type,
      });
      return res.status(500).json({ message: "Failed to create checkout session." });
    }
  };
}
