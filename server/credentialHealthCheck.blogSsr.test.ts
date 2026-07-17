/**
 * The "blogSsr" service is event-driven: BOTH crawler-facing blog routes
 * report their serving outcomes via reportBlogSsrServing — GET /blog/:slug
 * (server/blogSlugRoute.ts) and the GET /blog index
 * (server/blogIndexRoute.ts). When storage throws, each route deliberately
 * degrades (good for visitors): the slug route serves the SPA shell, the
 * index route serves the prerendered static index that omits every
 * AI-published post — but crawlers then silently see thin or stale HTML
 * while the outage lasts — a broken state search engines actually see,
 * so it must trigger the same healthy→broken owner alert chain
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

describe("reportBlogSsrServing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
  });

  it("starts as not-yet-checked in the health snapshot", async () => {
    const mod = await freshModule();
    expect(mod.getCredentialHealthStatus().services.blogSsr).toEqual({
      healthy: null,
      lastCheckedAt: null,
      lastError: null,
    });
  });

  it("stays quiet and marks healthy on successful DB-post serves", async () => {
    const mod = await freshModule();
    await mod.reportBlogSsrServing(true);
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
    const s = mod.getCredentialHealthStatus().services.blogSsr;
    expect(s.healthy).toBe(true);
    expect(s.lastError).toBeNull();
    expect(s.lastCheckedAt).not.toBeNull();
  });

  it("alerts the owner (email) on the healthy→broken transition when storage throws", async () => {
    const mod = await freshModule();
    await mod.reportBlogSsrServing(true);
    await mod.reportBlogSsrServing(false, new Error("DB down — crawlers getting SPA shell"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("blogSsr", expect.any(Error));
    const s = mod.getCredentialHealthStatus().services.blogSsr;
    expect(s.healthy).toBe(false);
    expect(s.lastError).toContain("SPA shell");
  });

  it("does NOT re-alert on repeated failures during the same outage", async () => {
    const mod = await freshModule();
    await mod.reportBlogSsrServing(false, new Error("failure 1"));
    await mod.reportBlogSsrServing(false, new Error("failure 2"));
    await mod.reportBlogSsrServing(false, new Error("failure 3"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
  });

  it("alerts again after a recovery when a NEW outage starts", async () => {
    const mod = await freshModule();
    await mod.reportBlogSsrServing(false, new Error("outage one"));
    await mod.reportBlogSsrServing(true);
    expect(mod.getCredentialHealthStatus().services.blogSsr.healthy).toBe(true);
    await mod.reportBlogSsrServing(false, new Error("outage two"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(2);
  });

  it("falls back to the alerts sheet when the alert email fails", async () => {
    sendCredentialAlertEmail.mockResolvedValue(false);
    const mod = await freshModule();
    await mod.reportBlogSsrServing(false, new Error("db unreachable"));

    expect(appendCredentialAlertToSheet).toHaveBeenCalledTimes(1);
    expect(appendCredentialAlertToSheet).toHaveBeenCalledWith({
      service: "blogSsr",
      message: expect.stringContaining("db unreachable"),
    });
  });

  it("never throws even when both alert channels fail", async () => {
    sendCredentialAlertEmail.mockRejectedValue(new Error("gmail down"));
    appendCredentialAlertToSheet.mockRejectedValue(new Error("sheets down"));
    const mod = await freshModule();
    await expect(
      mod.reportBlogSsrServing(false, new Error("total outage")),
    ).resolves.toBeUndefined();
    expect(mod.getCredentialHealthStatus().services.blogSsr.healthy).toBe(false);
  });

  it("uses a default error message when none is provided", async () => {
    const mod = await freshModule();
    await mod.reportBlogSsrServing(false);
    expect(mod.getCredentialHealthStatus().services.blogSsr.lastError).toContain(
      "Blog SSR serving failure",
    );
  });

  it("is independent of the pricing service state (separate outages, separate alerts)", async () => {
    const mod = await freshModule();
    await mod.reportPricingServing(false, new Error("pricing outage"));
    await mod.reportBlogSsrServing(false, new Error("blog ssr outage"));

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(2);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("pricing", expect.any(Error));
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("blogSsr", expect.any(Error));
  });
});
