/**
 * The Stripe health check must verify REAL API access, not just that the
 * secret key resolves: a resolved key can be revoked or rotated to an invalid
 * value, leaving checkout broken while the check stays green. checkStripe
 * therefore performs a minimal authenticated read (balance.retrieve) after
 * key resolution. Mirrors credentialHealthCheck.sheets-probe.test.ts.
 *
 * It then goes two steps further, because a working key still proves nothing
 * about what buyers are charged:
 *  - a TEST-mode key on a live deployment is an alert, not a pass (it would
 *    turn the monitor green while every live checkout 500s);
 *  - the three pinned LIVE_PRICE_IDS must still match PLAN_PRICING.
 * Both live in the SAME `stripe` service so that one root cause produces
 * exactly one alert email — the production incident produced two, and the
 * second one's prescribed remedy would have mischarged buyers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { healthyStripeClient, livePriceFixture, retrieveLivePriceFixture } from "./stripeHealthFixtures";
import { LIVE_PRICE_IDS } from "@shared/stripe-constants";
import { expectedUnitAmount, PLAN_TIERS } from "@shared/stripe-catalog";

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
}

describe("stripe health check API-access probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getStripeSecretKey.mockResolvedValue("sk_test_ok");
    getUncachableGmailClient.mockResolvedValue({});
    getUncachableGoogleSheetClient.mockResolvedValue({
      spreadsheets: { get: vi.fn().mockResolvedValue({ data: {} }) },
    });
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("performs a real balance.retrieve read when the key resolves", async () => {
    const retrieve = vi.fn().mockResolvedValue({ object: "balance" });
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve },
      prices: { retrieve: retrieveLivePriceFixture },
    });

    await freshRun();

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("alerts when the key resolves but the API call is rejected (revoked/invalid key)", async () => {
    const retrieve = vi.fn().mockRejectedValue(
      Object.assign(new Error("Invalid API Key provided"), { statusCode: 401 }),
    );
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve },
      prices: { retrieve: retrieveLivePriceFixture },
    });

    await freshRun();

    // Retried once (15s apart), then alerted for stripe specifically.
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
  });

  it("still alerts when the key itself resolves empty (probe never reached)", async () => {
    getStripeSecretKey.mockResolvedValue("");
    const retrieve = vi.fn();
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve },
      prices: { retrieve: retrieveLivePriceFixture },
    });

    await freshRun();

    expect(retrieve).not.toHaveBeenCalled();
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
  });

  it("passes against a catalog that matches PLAN_PRICING, retrieving every pinned price", async () => {
    const prices = { retrieve: vi.fn(retrieveLivePriceFixture) };
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve: vi.fn().mockResolvedValue({ object: "balance" }) },
      prices,
    });

    await freshRun();

    for (const tier of PLAN_TIERS) {
      expect(prices.retrieve).toHaveBeenCalledWith(LIVE_PRICE_IDS[tier]);
    }
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("alerts exactly once when a pinned price has been deactivated", async () => {
    getUncachableStripeClient.mockResolvedValue({
      ...healthyStripeClient(),
      prices: {
        retrieve: vi.fn(async (id: string) => {
          const price = await retrieveLivePriceFixture(id);
          return id === LIVE_PRICE_IDS.transformation ? { ...price, active: false } : price;
        }),
      },
    });

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
    const [, error] = sendCredentialAlertEmail.mock.calls[0];
    expect(error.message).toContain("no longer matches the site's advertised pricing");
    expect(error.message).toContain("not active");
    expect(error.message).toContain(LIVE_PRICE_IDS.transformation);
  });

  it("alerts when a pinned price's amount drifts, naming actual and expected", async () => {
    const drifted = expectedUnitAmount("kickstart") + 1000;
    getUncachableStripeClient.mockResolvedValue({
      ...healthyStripeClient(),
      prices: {
        retrieve: vi.fn(async (id: string) => {
          const price = await retrieveLivePriceFixture(id);
          return id === LIVE_PRICE_IDS.kickstart ? { ...price, unit_amount: drifted } : price;
        }),
      },
    });

    await freshRun();

    const [, error] = sendCredentialAlertEmail.mock.calls[0];
    expect(error.message).toContain(String(drifted));
    expect(error.message).toContain(String(expectedUnitAmount("kickstart")));
  });

  it("alerts when the pinned prices cannot be retrieved at all (test-mode key)", async () => {
    getUncachableStripeClient.mockResolvedValue({
      ...healthyStripeClient(),
      prices: { retrieve: vi.fn().mockRejectedValue(new Error("No such price")) },
    });

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    const [, error] = sendCredentialAlertEmail.mock.calls[0];
    expect(error.message).toContain("could not be retrieved");
  });

  it("reports every drifted price in one alert, not just the first", async () => {
    getUncachableStripeClient.mockResolvedValue({
      ...healthyStripeClient(),
      prices: {
        retrieve: vi.fn(async (id: string) => ({
          ...(await retrieveLivePriceFixture(id)),
          active: false,
        })),
      },
    });

    await freshRun();

    const [, error] = sendCredentialAlertEmail.mock.calls[0];
    for (const tier of PLAN_TIERS) expect(error.message).toContain(LIVE_PRICE_IDS[tier]);
  });

  it("alerts on a TEST-mode key on the live deployment, before touching the catalog", async () => {
    vi.stubEnv("REPLIT_DEPLOYMENT", "1");
    const pricesRetrieve = vi.fn(retrieveLivePriceFixture);
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve: vi.fn().mockResolvedValue({ object: "balance", livemode: false }) },
      prices: { retrieve: pricesRetrieve },
    });

    await freshRun();

    expect(pricesRetrieve).not.toHaveBeenCalled();
    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    const [, error] = sendCredentialAlertEmail.mock.calls[0];
    expect(error.message).toContain("TEST mode");
    vi.unstubAllEnvs();
  });

  it("does not alert on a test-mode key OUTSIDE the live deployment", async () => {
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve: vi.fn().mockResolvedValue({ object: "balance", livemode: false }) },
      prices: { retrieve: retrieveLivePriceFixture },
    });

    await freshRun();

    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("does not consult product metadata — no live product carries metadata.tier", async () => {
    // The removed "stripe plan tiers" check keyed on product.metadata.tier and
    // could therefore only ever fail. Guard against its return.
    const products = { list: vi.fn(), retrieve: vi.fn() };
    getUncachableStripeClient.mockResolvedValue({ ...healthyStripeClient(), products });

    await freshRun();

    expect(products.list).not.toHaveBeenCalled();
    expect(products.retrieve).not.toHaveBeenCalled();
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });
});

describe("stripe live-mode assertion (sandbox-fallback detection)", () => {
  const savedDeployment = process.env.REPLIT_DEPLOYMENT;
  const savedOverride = process.env.STRIPE_REQUIRE_LIVEMODE;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete process.env.REPLIT_DEPLOYMENT;
    delete process.env.STRIPE_REQUIRE_LIVEMODE;
    getStripeSecretKey.mockResolvedValue("sk_live_ok");
    getUncachableGmailClient.mockResolvedValue({});
    getUncachableGoogleSheetClient.mockResolvedValue({
      spreadsheets: { get: vi.fn().mockResolvedValue({ data: {} }) },
    });
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (savedDeployment === undefined) delete process.env.REPLIT_DEPLOYMENT;
    else process.env.REPLIT_DEPLOYMENT = savedDeployment;
    if (savedOverride === undefined) delete process.env.STRIPE_REQUIRE_LIVEMODE;
    else process.env.STRIPE_REQUIRE_LIVEMODE = savedOverride;
  });

  function mockStripeClient(livemode: boolean) {
    getUncachableStripeClient.mockResolvedValue({
      balance: { retrieve: vi.fn().mockResolvedValue({ object: "balance", livemode }) },
      prices: { retrieve: retrieveLivePriceFixture },
    });
  }

  it("alerts on a deployed app when balance.retrieve reports test mode (connector fallback)", async () => {
    // STRIPE_SECRET_KEY deleted → stripeClient falls back to the Replit
    // Connector sandbox: the key resolves and the API read succeeds, so only
    // the livemode flag exposes that no real revenue is arriving.
    process.env.REPLIT_DEPLOYMENT = "1";
    getStripeSecretKey.mockResolvedValue("sk_test_fallback");
    mockStripeClient(false);

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith(
      "stripe",
      expect.objectContaining({ message: expect.stringContaining("TEST mode") }),
    );
  });

  it("alerts on a deployed app when the key prefix is test even if livemode is true", async () => {
    process.env.REPLIT_DEPLOYMENT = "1";
    getStripeSecretKey.mockResolvedValue("sk_test_fallback");
    mockStripeClient(true);

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
  });

  it("stays quiet on a deployed app with a live key (livemode true)", async () => {
    process.env.REPLIT_DEPLOYMENT = "1";
    mockStripeClient(true);

    await freshRun();

    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("stays quiet in development even with a test-mode key (opt-out)", async () => {
    // Not deployed: sandbox mode via the connector is the legitimate setup.
    getStripeSecretKey.mockResolvedValue("sk_test_dev");
    mockStripeClient(false);

    await freshRun();

    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("STRIPE_REQUIRE_LIVEMODE=false opts a deployed app out explicitly", async () => {
    process.env.REPLIT_DEPLOYMENT = "1";
    process.env.STRIPE_REQUIRE_LIVEMODE = "false";
    getStripeSecretKey.mockResolvedValue("sk_test_fallback");
    mockStripeClient(false);

    await freshRun();

    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });
});
