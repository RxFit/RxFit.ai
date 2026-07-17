/**
 * Tests for the per-IP rate limiters on the remaining public Stripe-touching
 * routes (server/stripeRateLimits.ts + wiring in routes.ts).
 *
 * Threat model (Denial of Service): every public endpoint that can trigger
 * Stripe API calls, email sends, or Sheets writes must bound abuse. Checkout
 * and /api/leads were already limited; these tests guard the rest:
 *
 * - GET  /api/stripe/session/:sessionId  (Stripe retrieve + welcome email +
 *   Sheets write side effects)                    -> strict limiter
 * - POST /api/stripe/customer-portal     (Stripe retrieve + portal create)
 *                                                 -> strict limiter
 * - GET  /api/diag/stripe-prices         (two live Stripe list calls)
 *                                                 -> strict limiter
 * - GET  /api/stripe/products            (Stripe list on cache miss)
 *                                                 -> generous read limiter
 * - GET  /api/stripe/publishable-key                -> generous read limiter
 *
 * Same structure as checkoutRoute.test.ts: real-express 429 proof for each
 * factory, plus source-level wiring guards so a limiter can't be silently
 * dropped from routes.ts.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import {
  createStripeSessionRateLimit,
  createStripeReadRateLimit,
  createPricingThrottleReporter,
  PRICING_THROTTLE_ALERT_THRESHOLD,
} from "./stripeRateLimits";

async function withServer(
  register: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(express.json());
  register(app);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address() as { port: number };
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const LIMIT_BODY = { message: "Too many requests. Please try again later." };

describe("createStripeSessionRateLimit — strict tier", () => {
  it("rejects the 11th rapid request from one IP with 429, while the first 10 pass", async () => {
    await withServer(
      (app) => {
        app.get(
          "/api/stripe/session/:sessionId",
          createStripeSessionRateLimit(),
          (_req, res) => {
            res.status(200).json({ ok: true });
          },
        );
      },
      async (base) => {
        const get = () => fetch(`${base}/api/stripe/session/cs_test_123`);
        for (let i = 1; i <= 10; i++) {
          const res = await get();
          expect(res.status, `request #${i} should not be rate limited`).toBe(200);
        }
        const eleventh = await get();
        expect(eleventh.status).toBe(429);
        expect(await eleventh.json()).toEqual(LIMIT_BODY);
      },
    );
  });

  it("normal success-page flow is unaffected: a handful of requests all pass", async () => {
    // A real buyer hits the session route once or twice (page load + maybe a
    // reload); prove that budget passes cleanly with headroom to spare.
    await withServer(
      (app) => {
        app.get(
          "/api/stripe/session/:sessionId",
          createStripeSessionRateLimit(),
          (_req, res) => {
            res.status(200).json({ status: "complete", payment_status: "paid" });
          },
        );
      },
      async (base) => {
        for (let i = 1; i <= 3; i++) {
          const res = await fetch(`${base}/api/stripe/session/cs_test_abc`);
          expect(res.status).toBe(200);
          expect(await res.json()).toEqual({ status: "complete", payment_status: "paid" });
        }
      },
    );
  });
});

describe("createStripeReadRateLimit — generous tier", () => {
  it("rejects the 101st rapid request from one IP with 429, while the first 100 pass", async () => {
    await withServer(
      (app) => {
        app.get("/api/stripe/products", createStripeReadRateLimit(), (_req, res) => {
          res.status(200).json({ data: [] });
        });
      },
      async (base) => {
        const get = () => fetch(`${base}/api/stripe/products`);
        // Batches of concurrent requests keep the test fast; the limiter
        // counts them all the same.
        for (let batch = 0; batch < 10; batch++) {
          const results = await Promise.all(Array.from({ length: 10 }, get));
          for (const res of results) {
            expect(res.status, `batch #${batch + 1} should not be rate limited`).toBe(200);
          }
        }
        const overLimit = await get();
        expect(overLimit.status).toBe(429);
        expect(await overLimit.json()).toEqual(LIMIT_BODY);
      },
    );
  }, 15000);
});

describe("createStripeReadRateLimit — onLimited hook (pricing-blackout monitor)", () => {
  it("calls onLimited on every 429 but never on a 200, and keeps the standard 429 body", async () => {
    let limitedCalls = 0;
    await withServer(
      (app) => {
        app.get(
          "/api/stripe/products",
          createStripeReadRateLimit({ onLimited: () => limitedCalls++ }),
          (_req, res) => {
            res.status(200).json({ data: [] });
          },
        );
      },
      async (base) => {
        const get = () => fetch(`${base}/api/stripe/products`);
        for (let batch = 0; batch < 10; batch++) {
          const results = await Promise.all(Array.from({ length: 10 }, get));
          for (const res of results) expect(res.status).toBe(200);
        }
        expect(limitedCalls).toBe(0);
        const first429 = await get();
        expect(first429.status).toBe(429);
        expect(await first429.json()).toEqual(LIMIT_BODY);
        expect(limitedCalls).toBe(1);
        const second429 = await get();
        expect(second429.status).toBe(429);
        expect(limitedCalls).toBe(2);
      },
    );
  }, 15000);

  it("a throwing onLimited hook never breaks the 429 response", async () => {
    await withServer(
      (app) => {
        app.get(
          "/api/stripe/products",
          createStripeReadRateLimit({
            onLimited: () => {
              throw new Error("monitoring blew up");
            },
          }),
          (_req, res) => {
            res.status(200).json({ data: [] });
          },
        );
      },
      async (base) => {
        const get = () => fetch(`${base}/api/stripe/products`);
        for (let batch = 0; batch < 10; batch++) {
          await Promise.all(Array.from({ length: 10 }, get));
        }
        const throttled = await get();
        expect(throttled.status).toBe(429);
        expect(await throttled.json()).toEqual(LIMIT_BODY);
      },
    );
  }, 15000);
});

describe("createPricingThrottleReporter — threshold-gated pricing report", () => {
  it("does not report below the threshold (one stray 429 never pages the owner)", () => {
    const reports: Array<{ ok: boolean; error?: unknown }> = [];
    const onLimited = createPricingThrottleReporter({
      report: (ok, error) => {
        reports.push({ ok, error });
      },
      threshold: 5,
      windowMs: 60_000,
      now: () => 1_000,
    });
    for (let i = 0; i < 4; i++) onLimited();
    expect(reports).toHaveLength(0);
  });

  it("reports broken (ok=false) once the 429 count reaches the threshold within the window", () => {
    const reports: Array<{ ok: boolean; error?: unknown }> = [];
    const onLimited = createPricingThrottleReporter({
      report: (ok, error) => {
        reports.push({ ok, error });
      },
      threshold: 5,
      windowMs: 60_000,
      now: () => 1_000,
    });
    for (let i = 0; i < 5; i++) onLimited();
    expect(reports).toHaveLength(1);
    expect(reports[0].ok).toBe(false);
    expect(String((reports[0].error as Error).message)).toMatch(/429/);
    expect(String((reports[0].error as Error).message)).toMatch(/pricing/i);
    // Continued throttling keeps reporting broken — recordOutcome dedupes
    // alerts (only the healthy→broken transition pages the owner), so this
    // is safe and keeps the status snapshot's lastCheckedAt fresh.
    onLimited();
    expect(reports).toHaveLength(2);
    expect(reports[1].ok).toBe(false);
  });

  it("old 429s outside the rolling window do not count toward the threshold", () => {
    const reports: Array<{ ok: boolean }> = [];
    let t = 0;
    const onLimited = createPricingThrottleReporter({
      report: (ok) => {
        reports.push({ ok });
      },
      threshold: 3,
      windowMs: 1_000,
      now: () => t,
    });
    onLimited(); // t=0
    t = 400;
    onLimited(); // t=400
    t = 2_000; // both prior hits now outside the 1s window
    onLimited();
    expect(reports).toHaveLength(0);
    t = 2_100;
    onLimited();
    t = 2_200;
    onLimited(); // 3 hits within window → report
    expect(reports).toHaveLength(1);
    expect(reports[0].ok).toBe(false);
  });

  it("a rejecting async report function is swallowed (fire-and-forget)", async () => {
    const onLimited = createPricingThrottleReporter({
      report: async () => {
        throw new Error("report channel down");
      },
      threshold: 1,
      windowMs: 60_000,
    });
    expect(() => onLimited()).not.toThrow();
    // Let the rejected promise settle; the .catch inside must swallow it
    // (an unhandled rejection would fail the test run).
    await new Promise((r) => setTimeout(r, 10));
  });

  it("default threshold is high enough that a single stray 429 can't page the owner", () => {
    expect(PRICING_THROTTLE_ALERT_THRESHOLD).toBeGreaterThan(1);
  });
});

describe("wiring guards — routes.ts keeps every Stripe-touching route behind its limiter", () => {
  const routesSrc = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");

  it("builds a separate limiter instance per route from the tested factories", () => {
    expect(routesSrc).toMatch(/const\s+sessionRateLimit\s*=\s*createStripeSessionRateLimit\(\)/);
    expect(routesSrc).toMatch(/const\s+customerPortalRateLimit\s*=\s*createStripeSessionRateLimit\(\)/);
    expect(routesSrc).toMatch(/const\s+stripeDiagRateLimit\s*=\s*createStripeSessionRateLimit\(\)/);
    expect(routesSrc).toMatch(
      /const\s+productsRateLimit\s*=\s*createStripeReadRateLimit\(\s*\{\s*onLimited:\s*createPricingThrottleReporter\(\s*\{\s*report:\s*reportPricingServing\s*\}\s*\)/,
    );
    expect(routesSrc).toMatch(/const\s+publishableKeyRateLimit\s*=\s*createStripeReadRateLimit\(\)/);
  });

  it("registers each route with its limiter as the first middleware", () => {
    expect(routesSrc).toMatch(
      /app\.get\(\s*["']\/api\/stripe\/session\/:sessionId["']\s*,\s*sessionRateLimit\s*,/,
    );
    expect(routesSrc).toMatch(
      /app\.post\(\s*["']\/api\/stripe\/customer-portal["']\s*,\s*customerPortalRateLimit\s*,/,
    );
    expect(routesSrc).toMatch(
      /app\.get\(\s*["']\/api\/diag\/stripe-prices["']\s*,\s*stripeDiagRateLimit\s*,/,
    );
    expect(routesSrc).toMatch(
      /app\.get\(\s*["']\/api\/stripe\/products["']\s*,\s*productsRateLimit\s*,/s,
    );
    expect(routesSrc).toMatch(
      /app\.get\(\s*["']\/api\/stripe\/publishable-key["']\s*,\s*publishableKeyRateLimit\s*,/,
    );
  });

  it("no Stripe-touching route is registered twice (no unlimited duplicate)", () => {
    for (const route of [
      "/api/stripe/session/:sessionId",
      "/api/stripe/customer-portal",
      "/api/diag/stripe-prices",
      "/api/stripe/products",
      "/api/stripe/publishable-key",
    ]) {
      const escaped = route.replace(/[/:.-]/g, (c) => `\\${c}`);
      const registrations = routesSrc.match(
        new RegExp(`app\\.(?:get|post)\\(\\s*["']${escaped}["']`, "g"),
      );
      expect(registrations?.length, `${route} should be registered exactly once`).toBe(1);
    }
  });
});
