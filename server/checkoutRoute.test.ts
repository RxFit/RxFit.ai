/**
 * Route-level tests for POST /api/stripe/checkout (server/checkoutRoute.ts).
 *
 * The core contract under guard: the advertised free trial (e.g. Kickstart's)
 * lives on the Stripe PRICE (recurring.trial_period_days, seeded from
 * PLAN_PRICING and watched live by the credential health check's "products"
 * probe). The checkout session must therefore be created against exactly the
 * buyer's selected price with NO session-level trial override — a
 * `subscription_data.trial_period_days` (or any trial key) in the session
 * params would silently replace the price-level trial and charge trial
 * buyers immediately WITHOUT tripping the catalog health check, which only
 * inspects the price object.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import type { Server } from "node:http";
import { createCheckoutHandler, createCheckoutRateLimit } from "./checkoutRoute";
import { PLAN_PRICING } from "@shared/stripe-constants";

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function mockReq(body: Record<string, any>) {
  return {
    body,
    protocol: "https",
    get: (h: string) => (h.toLowerCase() === "host" ? "rxfit.ai" : undefined),
  } as any;
}

function makeDeps(overrides: Partial<{ recurring: any; retrieveError: Error; createError: Error; existingLead: unknown }> = {}) {
  const sessionsCreate = vi.fn(async (params: any) => {
    if (overrides.createError) throw overrides.createError;
    return { url: "https://checkout.stripe.com/c/pay/cs_test_123", id: "cs_test_123", params };
  });
  const pricesRetrieve = vi.fn(async (id: string) => {
    if (overrides.retrieveError) throw overrides.retrieveError;
    return {
      id,
      recurring:
        "recurring" in overrides
          ? overrides.recurring
          : { interval: "month", trial_period_days: PLAN_PRICING.kickstart.trialDays },
    };
  });
  const stripe = {
    prices: { retrieve: pricesRetrieve },
    checkout: { sessions: { create: sessionsCreate } },
  };
  const leadStore = {
    getLeadByEmail: vi.fn(async () => overrides.existingLead),
    createLead: vi.fn(async () => ({})),
  };
  const handler = createCheckoutHandler({ getStripeClient: async () => stripe, leadStore });
  return { handler, sessionsCreate, pricesRetrieve, leadStore };
}

/** Collect every key present anywhere in a nested params object. */
function allKeysDeep(obj: any, keys: string[] = []): string[] {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      keys.push(k);
      allKeysDeep(v, keys);
    }
  }
  return keys;
}

const KICKSTART_PRICE_ID = "price_kickstart_test";

describe("POST /api/stripe/checkout — trial contract", () => {
  it("creates the session against exactly the selected price, quantity 1", async () => {
    const { handler, sessionsCreate } = makeDeps();
    const res = mockRes();
    await handler(mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com" }), res);

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const params = sessionsCreate.mock.calls[0][0];
    expect(params.line_items).toEqual([{ price: KICKSTART_PRICE_ID, quantity: 1 }]);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_123" });
  });

  it("never sets subscription_data or any trial override anywhere in the session params", async () => {
    const { handler, sessionsCreate } = makeDeps();
    await handler(
      mockReq({
        priceId: KICKSTART_PRICE_ID,
        email: "buyer@example.com",
        name: "Buyer",
        plan: "kickstart",
        clientReferenceId: "utm_source=x",
      }),
      mockRes(),
    );

    const params = sessionsCreate.mock.calls[0][0];
    expect(params.subscription_data).toBeUndefined();
    const keys = allKeysDeep(params);
    expect(keys).not.toContain("subscription_data");
    expect(keys.some((k) => k.includes("trial"))).toBe(false);
    // Belt-and-braces: no trial key hides in a nested string/value either.
    expect(JSON.stringify(params)).not.toMatch(/trial/i);
  });

  it("PLAN_PRICING sanity: at least one tier advertises a free trial, so the price-level trial path matters", () => {
    // If every advertised trial were removed from PLAN_PRICING, these tests
    // would silently guard a vacuous contract — surface that loudly instead.
    const tiersWithTrial = Object.values(PLAN_PRICING).filter((p: any) => p.trialDays && p.trialDays > 0);
    expect(tiersWithTrial.length).toBeGreaterThan(0);
  });

  it("uses subscription mode for recurring prices (price-level trial flows through)", async () => {
    const { handler, sessionsCreate } = makeDeps({
      recurring: { interval: "month", trial_period_days: PLAN_PRICING.kickstart.trialDays },
    });
    await handler(mockReq({ priceId: KICKSTART_PRICE_ID }), mockRes());
    expect(sessionsCreate.mock.calls[0][0].mode).toBe("subscription");
  });

  it("uses payment mode for one-time prices", async () => {
    const { handler, sessionsCreate } = makeDeps({ recurring: null });
    await handler(mockReq({ priceId: "price_onetime" }), mockRes());
    expect(sessionsCreate.mock.calls[0][0].mode).toBe("payment");
  });
});

describe("POST /api/stripe/checkout — request handling", () => {
  it("400s without a priceId and never touches Stripe", async () => {
    const { handler, sessionsCreate, pricesRetrieve } = makeDeps();
    const res = mockRes();
    await handler(mockReq({ email: "buyer@example.com" }), res);
    expect(res.statusCode).toBe(400);
    expect(pricesRetrieve).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("passes customer_email and truncated client_reference_id through", async () => {
    const { handler, sessionsCreate } = makeDeps();
    const longRef = "x".repeat(500);
    await handler(
      mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com", clientReferenceId: longRef }),
      mockRes(),
    );
    const params = sessionsCreate.mock.calls[0][0];
    expect(params.customer_email).toBe("buyer@example.com");
    expect(params.client_reference_id).toBe("x".repeat(200));
  });

  it("lead capture is best-effort: createLead failure does not block checkout", async () => {
    const { handler, sessionsCreate, leadStore } = makeDeps();
    leadStore.createLead.mockRejectedValueOnce(new Error("db down"));
    const res = mockRes();
    await handler(mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com" }), res);
    expect(res.statusCode).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it("sanitizes an untrusted plan string: invalid plan falls back to kickstart", async () => {
    const { handler, leadStore } = makeDeps();
    await handler(
      mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com", plan: "<script>evil" }),
      mockRes(),
    );
    expect(leadStore.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ email: "buyer@example.com", plan: "kickstart" }),
    );
  });

  it("passes a valid plan through to lead capture", async () => {
    const { handler, leadStore } = makeDeps();
    await handler(
      mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com", plan: "transformation" }),
      mockRes(),
    );
    expect(leadStore.createLead).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "transformation" }),
    );
  });

  it("does not re-create an existing lead", async () => {
    const { handler, leadStore } = makeDeps({ existingLead: { id: 1 } });
    await handler(mockReq({ priceId: KICKSTART_PRICE_ID, email: "buyer@example.com" }), mockRes());
    expect(leadStore.createLead).not.toHaveBeenCalled();
  });

  it("500s (without leaking details) when Stripe fails", async () => {
    const { handler } = makeDeps({ createError: new Error("stripe boom") });
    const res = mockRes();
    await handler(mockReq({ priceId: KICKSTART_PRICE_ID }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Failed to create checkout session." });
  });
});

describe("wiring + source guards", () => {
  const routesSrc = fs.readFileSync(path.join(__dirname, "routes.ts"), "utf8");
  const handlerSrc = fs.readFileSync(path.join(__dirname, "checkoutRoute.ts"), "utf8");

  it("routes.ts registers /api/stripe/checkout via the tested factory, behind the rate limiter", () => {
    expect(routesSrc).toMatch(
      /app\.post\(\s*["']\/api\/stripe\/checkout["']\s*,\s*checkoutRateLimit\s*,\s*createCheckoutHandler\(\s*\{[^}]*getStripeClient:\s*getUncachableStripeClient[^}]*leadStore:\s*storage[^}]*\}\s*\)/s,
    );
    // The limiter must be built from the tested factory in checkoutRoute.ts.
    expect(routesSrc).toMatch(/const\s+checkoutRateLimit\s*=\s*createCheckoutRateLimit\(\)/);
  });

  it("no inline /api/stripe/checkout handler remains in routes.ts", () => {
    // The dispatch must not silently revert to an untested inline handler.
    expect(routesSrc.match(/\/api\/stripe\/checkout/g)?.length).toBe(1);
    expect(routesSrc).not.toMatch(/\/api\/stripe\/checkout["']\s*,\s*async/);
  });

  it("checkout source sets no session-level trial override", () => {
    // Static guard alongside the runtime deep-scan: neither subscription_data
    // nor a trial override may appear as code in the checkout path.
    expect(handlerSrc).not.toMatch(/subscription_data\s*[:=[]/);
    expect(handlerSrc).not.toMatch(/trial_period_days\s*[:=]/);
  });
});

describe("checkout rate limiting", () => {
  it("rejects the 11th rapid request from one IP with 429, while the first 10 pass", async () => {
    // Real express app + the REAL limiter from createCheckoutRateLimit(),
    // fronting a stub handler — proves the limiter itself returns 429 after
    // max requests, not just that it's mentioned in routes.ts.
    const app = express();
    app.use(express.json());
    app.post("/api/stripe/checkout", createCheckoutRateLimit(), (_req, res) => {
      res.status(200).json({ ok: true });
    });

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const { port } = server.address() as { port: number };
      const url = `http://127.0.0.1:${port}/api/stripe/checkout`;
      const post = () =>
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priceId: "price_x" }),
        });

      for (let i = 1; i <= 10; i++) {
        const res = await post();
        expect(res.status, `request #${i} should not be rate limited`).toBe(200);
      }

      const eleventh = await post();
      expect(eleventh.status).toBe(429);
      expect(await eleventh.json()).toEqual({
        message: "Too many requests. Please try again later.",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
