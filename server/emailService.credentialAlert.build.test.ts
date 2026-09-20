/**
 * The credential alert email must say which build sent it. The September
 * "Stripe plan tiers" email was produced by a deployment 18 days behind main,
 * and nothing in it revealed that — its (already-fixed-on-main) remedy read
 * as current advice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();

vi.mock("./gmailClient", () => ({
  getUncachableGmailClient: vi.fn().mockImplementation(async () => ({
    users: { messages: { send: sendMock }, getProfile: vi.fn() },
  })),
}));

vi.mock("./sheetsService", () => ({
  appendAlertToSheet: vi.fn().mockResolvedValue(undefined),
}));

function decodeRaw(raw: string): string {
  return Buffer.from(raw, "base64url").toString("utf-8");
}

describe("credential alert email build stamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the stamped build and warns that a stale deploy invalidates the advice", async () => {
    vi.stubEnv("RXFIT_BUILD_ID", "c116d85 built 2026-09-15T00:00Z");
    sendMock.mockResolvedValueOnce({});
    const { sendCredentialAlertEmail } = await import("./emailService");

    const sent = await sendCredentialAlertEmail(
      "stripe",
      new Error("Stripe production connection not found via Connector. Set STRIPE_SECRET_KEY in Replit Secrets instead."),
    );

    expect(sent).toBe(true);
    const body = decodeRaw(sendMock.mock.calls[0][0].requestBody.raw);
    expect(body).toContain("Sent by build c116d85 built 2026-09-15T00:00Z");
    expect(body).toMatch(/deployment is stale/);
    // Still the right remedy for the verbatim production error.
    expect(body).toContain("Set STRIPE_SECRET_KEY in Replit");
  });

  it("labels an unbundled dev process so nobody mistakes it for production", async () => {
    sendMock.mockResolvedValueOnce({});
    const { sendCredentialAlertEmail } = await import("./emailService");
    await sendCredentialAlertEmail("gmail", new Error("token fetch failed"));
    const body = decodeRaw(sendMock.mock.calls[0][0].requestBody.raw);
    expect(body).toContain("Sent by build dev (unbundled");
  });
});
