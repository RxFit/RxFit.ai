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

/**
 * Pricing-blackout monitor hook for the products limiter. When the limiter
 * answers 429, the products handler (and its reportPricingServing call)
 * never runs — so a mass-throttling event (aggressive bot on a shared
 * corporate IP, or a proxy misconfiguration collapsing all traffic into one
 * IP bucket) would silently block real buyers from seeing pricing while the
 * "Pricing served to buyers" health card stayed green.
 *
 * createPricingThrottleReporter returns a callback invoked once per 429.
 * It counts throttled responses in a rolling window and only reports the
 * outage into the pricing-monitor chain once the count reaches a threshold —
 * so one stray 429 from a single over-eager client never pages the owner,
 * but sustained mass throttling does. The report goes through the existing
 * `reportPricingServing(false, ...)` → recordOutcome transition logic, so
 * the one-alert-per-outage / recovery-on-next-healthy-serve semantics are
 * preserved (repeated broken reports don't re-alert; the next fresh 200
 * serve reports healthy and resets the state). The callback is fully
 * fire-and-forget and swallows every error: monitoring must never break
 * the 429 response itself.
 */
export const PRICING_THROTTLE_ALERT_THRESHOLD = 10;

export function createPricingThrottleReporter({
  report,
  threshold = PRICING_THROTTLE_ALERT_THRESHOLD,
  windowMs = WINDOW_MS,
  now = Date.now,
}: {
  report: (ok: boolean, error?: unknown) => Promise<void> | void;
  threshold?: number;
  windowMs?: number;
  now?: () => number;
}): () => void {
  let hits: number[] = [];
  return () => {
    try {
      const t = now();
      hits.push(t);
      hits = hits.filter((h) => t - h < windowMs);
      if (hits.length >= threshold) {
        void Promise.resolve(
          report(
            false,
            new Error(
              `Rate limiter returned ${hits.length} 429s on /api/stripe/products in the last ${Math.round(windowMs / 60000)} min — buyers may be blocked from seeing pricing`,
            ),
          ),
        ).catch((e) => {
          console.error("[pricing-throttle] Failed to report throttled pricing serves:", e);
        });
      }
    } catch (e) {
      // Never let monitoring break the endpoint's 429 response.
      console.error("[pricing-throttle] Throttle reporter failed:", e);
    }
  };
}

export function createStripeReadRateLimit(options?: { onLimited?: () => void }) {
  const onLimited = options?.onLimited;
  return rateLimit({
    windowMs: WINDOW_MS,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: LIMIT_MESSAGE,
    handler: (_req, res) => {
      if (onLimited) {
        try {
          onLimited();
        } catch (e) {
          console.error("[pricing-throttle] onLimited hook threw:", e);
        }
      }
      res.status(429).json(LIMIT_MESSAGE);
    },
  });
}
