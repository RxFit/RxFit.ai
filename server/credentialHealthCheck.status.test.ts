/**
 * The internal status endpoint surfaces the in-memory health state via
 * getCredentialHealthStatus(). Guard the snapshot contract: null before any
 * run, per-service healthy/lastCheckedAt/lastError after a run, and error
 * details captured for the broken service only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { healthyStripeClient } from "./stripeHealthFixtures";

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

async function freshModule() {
  vi.resetModules();
  return import("./credentialHealthCheck");
}

describe("credential health status snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getStripeSecretKey.mockResolvedValue("sk_test_ok");
    getUncachableStripeClient.mockResolvedValue(healthyStripeClient());
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

  it("reports healthy: null for every service before any check has run", async () => {
    const mod = await freshModule();
    const s = mod.getCredentialHealthStatus();
    for (const name of ["stripe", "gmail", "sheets"] as const) {
      expect(s.services[name]).toEqual({ healthy: null, lastCheckedAt: null, lastError: null });
    }
  });

  it("names the build that produced the snapshot, so a stale deploy is visible", async () => {
    vi.stubEnv("RXFIT_BUILD_ID", "abc1234 built 2026-09-15T00:00Z");
    try {
      const mod = await freshModule();
      expect(mod.getCredentialHealthStatus().build).toBe("abc1234 built 2026-09-15T00:00Z");
    } finally {
      vi.unstubAllEnvs();
    }
    const mod = await freshModule();
    expect(mod.getCredentialHealthStatus().build).toMatch(/^dev /);
  });

  it("reports healthy services with a timestamp and no error after a run", async () => {
    const mod = await freshModule();
    const run = mod.runCredentialHealthCheck();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await run;

    const s = mod.getCredentialHealthStatus();
    for (const name of ["stripe", "gmail", "sheets"] as const) {
      expect(s.services[name].healthy).toBe(true);
      expect(s.services[name].lastCheckedAt).toEqual(expect.any(String));
      expect(s.services[name].lastError).toBeNull();
    }
  });

  it("captures the failing service's error message while others stay healthy", async () => {
    getUncachableStripeClient.mockResolvedValue({
      ...healthyStripeClient(),
      balance: { retrieve: vi.fn().mockRejectedValue(new Error("Invalid API Key provided")) },
    });
    const mod = await freshModule();
    const run = mod.runCredentialHealthCheck();
    await vi.advanceTimersByTimeAsync(60 * 1000);
    await run;

    const s = mod.getCredentialHealthStatus();
    expect(s.services.stripe.healthy).toBe(false);
    expect(s.services.stripe.lastError).toBe("Invalid API Key provided");
    expect(s.services.gmail.healthy).toBe(true);
    expect(s.services.sheets.healthy).toBe(true);
  });
});
