import rateLimit from "express-rate-limit";

/**
 * Per-IP rate limiters for the remaining public Stripe-touching routes
 * (threat model: Denial of Service — public endpoints that trigger Stripe
 * API calls, email sends, or Sheets writes must bound abuse). The checkout
 * limiter lives in checkoutRoute.ts (createCheckoutRateLimit); these cover
 * the rest, in two tiers:
 *
 * - createStripeSessionRateLimit — strict (same 10-per-15-minutes budget as
 *   checkout). For routes a real buyer hits once or twice per purchase:
 *   GET /api/stripe/session/:sessionId (Stripe session retrieve + can fire
 *   the welcome email and a Sheets write), POST /api/stripe/customer-portal
 *   (Stripe retrieve + billing portal session create), and the diagnostic
 *   GET /api/diag/stripe-prices (two live Stripe list calls).
 *
 * - createStripeReadRateLimit — generous (100 per 15 minutes). For
 *   GET /api/stripe/products and GET /api/stripe/publishable-key, which
 *   every landing-page visitor may hit: many legitimate visitors can share
 *   one IP (corporate NAT, campus networks), so the budget must comfortably
 *   exceed real browsing while still bounding a bot hammering the Stripe
 *   list fallback on cache misses.
 *
 * Both are factories (not shared instances) for the same reason as
 * createCheckoutRateLimit: route-level tests build a fresh limiter with no
 * shared hit-counting state and prove the max+1th rapid request gets a 429.
 * routes.ts builds a SEPARATE instance per route so abuse of one route
 * cannot consume another route's budget.
 */

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT_MESSAGE = { message: "Too many requests. Please try again later." };

export function createStripeSessionRateLimit() {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: LIMIT_MESSAGE,
  });
}

export function createStripeReadRateLimit() {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: LIMIT_MESSAGE,
  });
}
