import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getUncachableStripeClient, getStripePublishableKey, getStripeSecretKey } from "./stripeClient";

describe("stripeClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("fails closed when STRIPE_SECRET_KEY is missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_123";

    await expect(getUncachableStripeClient()).rejects.toThrow(/No Stripe secret key available/);
    await expect(getStripeSecretKey()).rejects.toThrow(/No Stripe secret key available/);
  });

  it("fails closed when STRIPE_PUBLISHABLE_KEY is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    delete process.env.STRIPE_PUBLISHABLE_KEY;

    await expect(getStripePublishableKey()).rejects.toThrow(/No Stripe publishable key available/);
  });

  it("resolves when both keys are present", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_123";

    const secretKey = await getStripeSecretKey();
    expect(secretKey).toBe("sk_test_123");

    const publishableKey = await getStripePublishableKey();
    expect(publishableKey).toBe("pk_test_123");

    const client = await getUncachableStripeClient();
    expect(client).toBeDefined();
  });
});
