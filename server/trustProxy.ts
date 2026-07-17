import type { Express } from "express";

/**
 * Behind Replit's hosting proxy every request reaches Express from the
 * proxy's own address. Without `trust proxy`, req.ip is the proxy IP for
 * EVERY visitor, so all per-IP rate limiters (leads, checkout, Stripe
 * routes) would share ONE bucket — a single bot could lock every real
 * buyer out of checkout. express-rate-limit v8 also flags this setup
 * (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) when X-Forwarded-For arrives while
 * trust proxy is off.
 *
 * We trust exactly ONE hop (the Replit proxy directly in front of the
 * app), NOT `true`/unbounded: with hop count 1, Express takes the
 * RIGHTMOST X-Forwarded-For entry — the one the trusted proxy itself
 * appended with the real client socket address. Any earlier entries an
 * attacker stuffs into the header are ignored, so a spoofed
 * X-Forwarded-For cannot mint fresh rate-limit buckets or bypass limits.
 * (`trust proxy: true` would take the LEFTMOST entry, which is fully
 * attacker-controlled.)
 */
export const TRUST_PROXY_HOPS = 1;

export function applyTrustProxy(app: Express): void {
  app.set("trust proxy", TRUST_PROXY_HOPS);
}
