/**
 * The "pricing" service is event-driven: /api/stripe/products reports every
 * serving outcome via reportPricingServing. Serving a stale last-known-good
 * snapshot (or failing with no snapshot) is a broken state buyers actually
 * see, so it must trigger the same healthy→broken owner alert chain
 * (email → alerts-sheet fallback) used by the periodic credential checks:
 * one alert per outage, recovery resets the state, and the /admin health
 * snapshot reflects it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("reportPricingServing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
  });

  it("starts as not-yet-checked in the health snapshot", async () => {
    const mod = await freshModule();
    expect(mod.getCredentialHealthStatus().services.pricing).toEqual({
      healthy: null,
      lastCheckedAt: null,
      lastError: null,
    });
  });

  it("stays quiet and marks healthy on fresh serves", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(true);
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
    const s = mod.getCredentialHealthStatus().services.pricing;
    expect(s.healthy).toBe(true);
    expect(s.lastError).toBeNull();
    expect(s.lastCheckedAt).not.toBeNull();
  });

  it("alerts the owner (email) on the healthy→broken transition when a stale snapshot is served", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(true);
    await mod.reportPricingServing(false, new Error("Serving STALE snapshot — Stripe down"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("pricing", expect.any(Error));
    const s = mod.getCredentialHealthStatus().services.pricing;
    expect(s.healthy).toBe(false);
    expect(s.lastError).toContain("STALE");
  });

  it("does NOT re-alert on repeated stale serves during the same outage", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(false, new Error("stale serve 1"));
    await mod.reportPricingServing(false, new Error("stale serve 2"));
    await mod.reportPricingServing(false, new Error("stale serve 3"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("alerts again after a recovery when a NEW outage starts", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(false, new Error("outage one"));
    await mod.reportPricingServing(true);
    expect(mod.getCredentialHealthStatus().services.pricing.healthy).toBe(true);
    await mod.reportPricingServing(false, new Error("outage two"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(2);
  });

  it("falls back to the alerts sheet when the alert email fails", async () => {
    sendCredentialAlertEmail.mockResolvedValue(false);
    const mod = await freshModule();
    await mod.reportPricingServing(false, new Error("no pricing at all"));

    expect(appendCredentialAlertToSheet).toHaveBeenCalledTimes(1);
    expect(appendCredentialAlertToSheet).toHaveBeenCalledWith({
      service: "pricing",
      message: expect.stringContaining("no pricing at all"),
    });
  });

  it("never throws even when both alert channels fail", async () => {
    sendCredentialAlertEmail.mockRejectedValue(new Error("gmail down"));
    appendCredentialAlertToSheet.mockRejectedValue(new Error("sheets down"));
    const mod = await freshModule();
    await expect(
      mod.reportPricingServing(false, new Error("total outage")),
    ).resolves.toBeUndefined();
    expect(mod.getCredentialHealthStatus().services.pricing.healthy).toBe(false);
  });

  it("uses a default error message when none is provided", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(false);
    expect(mod.getCredentialHealthStatus().services.pricing.lastError).toContain(
      "Pricing endpoint failure",
    );
  });
});
