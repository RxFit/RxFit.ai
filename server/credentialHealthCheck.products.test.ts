/**
 * The products health check verifies the live Stripe catalog still matches
 * the site's plan tiers: each PLAN_PRICING tier must resolve (via product
 * metadata.tier — the same mapping SignupModalProvider uses) to an active
 * recurring price with the advertised amount. If a product is renamed,
 * archived, or loses its tier metadata, buyers silently get the hardcoded
 * fallback price — this check alerts the owner instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PLAN_PRICING } from "@shared/stripe-constants";
import { healthyTierPrices } from "./credentialHealthCheck.fixtures";

const getStripeSecretKey = vi.fn();
const getUncachableStripeClient = vi.fn();
const getUncachableGmailClient = vi.fn();
const getUncachableGoogleSheetClient = vi.fn();
const sendCredentialAlertEmail = vi.fn();
const appendCredentialAlertToSheet = vi.fn();

vi.mock("./stripeClient", () => ({ getStripeSecretKey, getUncachableStripeClient }));
vi.mock("./gmailClient", () => ({ getUncachableGmailClient }));
vi.mock("./sheetsClient", () => ({ getUncachableGoogleSheetClient }));
vi.mock("./emailService", () => ({ sendCredentialAlertEmail }));
vi.mock("./sheetsService", () => ({ appendCredentialAlertToSheet }));

async function freshRun() {
  vi.resetModules();
  const mod = await import("./credentialHealthCheck");
  const promise = mod.runCredentialHealthCheck();
  await vi.advanceTimersByTimeAsync(60 * 1000);
  await promise;
  return mod;
}

function stripeClientWith(pricesData: unknown[]) {
  return {
    balance: { retrieve: vi.fn().mockResolvedValue({ object: "balance" }) },
    prices: { list: vi.fn().mockResolvedValue({ data: pricesData }) },
  };
}

describe("findTierPriceProblems (pure)", () => {
  async function problemsOf(prices: unknown[]) {
    vi.resetModules();
    const mod = await import("./credentialHealthCheck");
    return mod.findTierPriceProblems(prices as any);
  }

  it("returns no problems when every tier has a matching active recurring price", async () => {
    expect(await problemsOf(healthyTierPrices())).toEqual([]);
  });

  it("flags a tier whose metadata.tier is missing from every product", async () => {
    const prices = healthyTierPrices().filter((p) => p.product?.metadata?.tier !== "committed");
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("committed");
    expect(problems[0]).toContain("no active Stripe product");
  });

  it("flags a tier whose product was archived", async () => {
    const prices = healthyTierPrices().map((p) =>
      p.product?.metadata?.tier === "kickstart"
        ? { ...p, product: { ...p.product, active: false } }
        : p,
    );
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("kickstart");
    expect(problems[0]).toContain("archived");
  });

  it("flags a tier whose only price is inactive or non-recurring", async () => {
    const prices = healthyTierPrices().map((p) =>
      p.product?.metadata?.tier === "transformation" ? { ...p, recurring: null } : p,
    );
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("transformation");
    expect(problems[0]).toContain("no active recurring price");
  });

  it("flags a tier whose price amount drifted from PLAN_PRICING", async () => {
    const prices = healthyTierPrices().map((p) =>
      p.product?.metadata?.tier === "kickstart" ? { ...p, unit_amount: 5900 } : p,
    );
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("kickstart");
    expect(problems[0]).toContain(String(PLAN_PRICING.kickstart.amount * 100));
    expect(problems[0]).toContain("5900");
  });

  it("flags kickstart when the advertised free trial is missing from the price", async () => {
    const prices = healthyTierPrices().map((p) =>
      p.product?.metadata?.tier === "kickstart"
        ? { ...p, recurring: { interval: "month" } }
        : p,
    );
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("kickstart");
    expect(problems[0]).toContain(`${PLAN_PRICING.kickstart.trialDays}-day free trial is missing`);
    expect(problems[0]).toContain("found: none");
  });

  it("flags kickstart when the trial length drifted from PLAN_PRICING", async () => {
    const prices = healthyTierPrices().map((p) =>
      p.product?.metadata?.tier === "kickstart"
        ? { ...p, recurring: { interval: "month", trial_period_days: 3 } }
        : p,
    );
    const problems = await problemsOf(prices);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("kickstart");
    expect(problems[0]).toContain("found: 3");
  });

  it("does not require a trial on tiers that don't advertise one", async () => {
    // healthyTierPrices only sets trial_period_days where PLAN_PRICING has
    // trialDays — committed/transformation have none and must stay green.
    expect(await problemsOf(healthyTierPrices())).toEqual([]);
    expect((PLAN_PRICING.committed as { trialDays?: number }).trialDays).toBeUndefined();
  });

  it("accepts extra unrelated prices alongside the matching ones", async () => {
    const prices = [
      { active: true, recurring: null, unit_amount: 123, product: { active: true, metadata: {} } },
      ...healthyTierPrices(),
      { active: false, recurring: { interval: "month" }, unit_amount: 999, product: { active: true, metadata: { tier: "kickstart" } } },
    ];
    expect(await problemsOf(prices)).toEqual([]);
  });
});

describe("products service in runCredentialHealthCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getStripeSecretKey.mockResolvedValue("sk_test_ok");
    getUncachableStripeClient.mockResolvedValue(stripeClientWith(healthyTierPrices()));
    getUncachableGmailClient.mockResolvedValue({});
    getUncachableGoogleSheetClient.mockResolvedValue({
      spreadsheets: { get: vi.fn().mockResolvedValue({ data: {} }) },
    });
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
    process.env.LEADS_SPREADSHEET_ID ||= "test-spreadsheet-id";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays quiet when the catalog matches all tiers", async () => {
    const mod = await freshRun();
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
    expect(mod.getCredentialHealthStatus().services.products.healthy).toBe(true);
  });

  it("alerts as 'products' (email) when a tier stops resolving, while stripe stays healthy", async () => {
    const broken = healthyTierPrices().filter((p) => p.product?.metadata?.tier !== "committed");
    getUncachableStripeClient.mockResolvedValue(stripeClientWith(broken));

    const mod = await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("products", expect.any(Error));
    const s = mod.getCredentialHealthStatus().services;
    expect(s.stripe.healthy).toBe(true);
    expect(s.products.healthy).toBe(false);
    expect(s.products.lastError).toContain("committed");
  });

  it("falls back to the alerts sheet when the email fails", async () => {
    const broken = healthyTierPrices().filter((p) => p.product?.metadata?.tier !== "kickstart");
    getUncachableStripeClient.mockResolvedValue(stripeClientWith(broken));
    sendCredentialAlertEmail.mockResolvedValue(false);

    await freshRun();

    expect(appendCredentialAlertToSheet).toHaveBeenCalledTimes(1);
    expect(appendCredentialAlertToSheet).toHaveBeenCalledWith({
      service: "products",
      message: expect.stringContaining("kickstart"),
    });
  });

  it("surfaces the products snapshot as null before any run", async () => {
    vi.resetModules();
    const mod = await import("./credentialHealthCheck");
    expect(mod.getCredentialHealthStatus().services.products).toEqual({
      healthy: null,
      lastCheckedAt: null,
      lastError: null,
    });
  });
});
