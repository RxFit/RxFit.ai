/**
 * Contract tests for the owner-notification send wrappers in emailService.ts.
 *
 * Task #105 covered every template's HTML (palette/escaping); these tests lock
 * the thin wrappers themselves: the EXACT subject line (the owner filters the
 * inbox on these), the recipient (resolved via getOwnerEmail — here pinned by
 * OWNER_NOTIFICATION_EMAIL), and the failure contract each caller relies on:
 *
 * - Best-effort senders (sendPostFailureEmail, sendPostRefreshedEmail,
 *   sendCredentialAlertEmail) must NEVER throw and must return false when
 *   Gmail is down — that boolean drives the email→sheet fallback chain in
 *   blogGenerator/blogRefresher/credentialHealthCheck. A wrapper that starts
 *   throwing (or always returning true) silently kills the fallback.
 * - sendAlertsDigestEmailOrThrow must THROW on failure — the digest scheduler
 *   only advances its state after a successful send, and the hourly retry on
 *   throw is what guarantees sheet-only alerts eventually reach the inbox.
 * - sendPostPublishedEmail throws on failure (its caller handles the trail).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMock = vi.fn();
const getProfileMock = vi.fn();

vi.mock("./gmailClient", () => ({
  getUncachableGmailClient: vi.fn().mockImplementation(async () => ({
    users: { messages: { send: sendMock }, getProfile: getProfileMock },
  })),
}));

const OWNER = "owner@example.com";

/** Decode the base64url MIME message handed to gmail and pull out headers. */
function decodeSentMessage(callIndex = 0): { to: string; subject: string; mime: string } {
  const arg = sendMock.mock.calls[callIndex][0];
  const mime = Buffer.from(arg.requestBody.raw, "base64url").toString("utf8");
  const to = mime.match(/^To: (.*)$/m)?.[1] ?? "";
  const subject = mime.match(/^Subject: (.*)$/m)?.[1] ?? "";
  return { to, subject, mime };
}

const SAMPLE_POST = {
  title: "Wearable Data Deep Dive",
  slug: "wearable-data-deep-dive",
  keywordTheme: "wearables",
  pillar: "ai-health",
  readingMinutes: 8,
};

describe("owner notification senders — subjects, recipient, failure contract", () => {
  let savedOwnerEmail: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({});
    savedOwnerEmail = process.env.OWNER_NOTIFICATION_EMAIL;
    process.env.OWNER_NOTIFICATION_EMAIL = OWNER;
  });

  afterEach(() => {
    if (savedOwnerEmail === undefined) delete process.env.OWNER_NOTIFICATION_EMAIL;
    else process.env.OWNER_NOTIFICATION_EMAIL = savedOwnerEmail;
  });

  it("OWNER_NOTIFICATION_EMAIL takes priority — no Gmail getProfile lookup", async () => {
    const { sendPostFailureEmail } = await import("./emailService");
    await sendPostFailureEmail("research", new Error("boom"));
    expect(getProfileMock).not.toHaveBeenCalled();
    expect(decodeSentMessage().to).toBe(OWNER);
  });

  describe("sendPostPublishedEmail (throws on failure)", () => {
    it("sends to the owner with the exact publish subject", async () => {
      const { sendPostPublishedEmail } = await import("./emailService");
      await sendPostPublishedEmail(SAMPLE_POST);
      const { to, subject } = decodeSentMessage();
      expect(to).toBe(OWNER);
      expect(subject).toBe("✅ New RxFit.ai blog post live: Wearable Data Deep Dive");
    });

    it("throws when Gmail send fails (caller owns the failure trail)", async () => {
      sendMock.mockRejectedValueOnce(new Error("gmail down"));
      const { sendPostPublishedEmail } = await import("./emailService");
      await expect(sendPostPublishedEmail(SAMPLE_POST)).rejects.toThrow("gmail down");
    });
  });

  describe("sendPostFailureEmail (best-effort boolean)", () => {
    it("sends to the owner with the exact failure subject and returns true", async () => {
      const { sendPostFailureEmail } = await import("./emailService");
      await expect(sendPostFailureEmail("validation", new Error("bad draft"))).resolves.toBe(true);
      const { to, subject } = decodeSentMessage();
      expect(to).toBe(OWNER);
      expect(subject).toBe("❌ RxFit.ai blog auto-publish failed (validation)");
    });

    it("returns false (never throws) when Gmail send fails", async () => {
      sendMock.mockRejectedValueOnce(new Error("gmail down"));
      const { sendPostFailureEmail } = await import("./emailService");
      await expect(sendPostFailureEmail("research", new Error("boom"))).resolves.toBe(false);
    });
  });

  describe("sendPostRefreshedEmail (best-effort boolean)", () => {
    const refreshed = { title: "Wearable Data Deep Dive", slug: "wearable-data-deep-dive", refreshCount: 2 };

    it("sends to the owner with the exact refresh subject and returns true", async () => {
      const { sendPostRefreshedEmail } = await import("./emailService");
      await expect(
        sendPostRefreshedEmail(refreshed, "striking distance", ["best wearable"]),
      ).resolves.toBe(true);
      const { to, subject } = decodeSentMessage();
      expect(to).toBe(OWNER);
      expect(subject).toBe("🔄 RxFit.ai post refreshed: Wearable Data Deep Dive");
    });

    it("returns false (never throws) when Gmail send fails", async () => {
      sendMock.mockRejectedValueOnce(new Error("gmail down"));
      const { sendPostRefreshedEmail } = await import("./emailService");
      await expect(sendPostRefreshedEmail(refreshed, "stale", [])).resolves.toBe(false);
    });
  });

  describe("sendCredentialAlertEmail (best-effort boolean)", () => {
    it("sends to the owner with the exact alert subject (friendly service label) and returns true", async () => {
      const { sendCredentialAlertEmail } = await import("./emailService");
      await expect(sendCredentialAlertEmail("sheets", new Error("token revoked"))).resolves.toBe(true);
      const { to, subject } = decodeSentMessage();
      expect(to).toBe(OWNER);
      expect(subject).toBe("🚨 RxFit.ai: Google Sheets credentials are broken");
    });

    it("labels every known service correctly in the subject", async () => {
      const { sendCredentialAlertEmail } = await import("./emailService");
      const expected: Record<string, string> = {
        stripe: "🚨 RxFit.ai: Stripe credentials are broken",
        gmail: "🚨 RxFit.ai: Gmail credentials are broken",
        pricing: "🚨 RxFit.ai: Pricing served to buyers credentials are broken",
        blogSsr: "🚨 RxFit.ai: Blog SSR to crawlers credentials are broken",
      };
      let call = 0;
      for (const [service, subject] of Object.entries(expected)) {
        await sendCredentialAlertEmail(service, new Error("x"));
        expect(decodeSentMessage(call++).subject).toBe(subject);
      }
    });

    it("returns false (never throws) when Gmail send fails", async () => {
      sendMock.mockRejectedValueOnce(new Error("gmail down"));
      const { sendCredentialAlertEmail } = await import("./emailService");
      await expect(sendCredentialAlertEmail("gmail", new Error("boom"))).resolves.toBe(false);
    });
  });

  describe("sendAlertsDigestEmailOrThrow (throws on failure)", () => {
    const rows = [
      { date: "2026-07-10T08:00:00Z", title: "Welcome email FAILED", details: "gmail 500" },
      { date: "2026-07-12T09:00:00Z", title: "Stripe credentials BROKEN", details: "revoked" },
    ];

    it("sends to the owner with the exact digest subject including the row count", async () => {
      const { sendAlertsDigestEmailOrThrow } = await import("./emailService");
      await expect(sendAlertsDigestEmailOrThrow(rows, new Date("2026-07-09"))).resolves.toBeUndefined();
      const { to, subject } = decodeSentMessage();
      expect(to).toBe(OWNER);
      expect(subject).toBe("📋 RxFit.ai weekly alerts digest — 2 unresolved alert row(s)");
    });

    it("THROWS when Gmail send fails so the scheduler retries without advancing state", async () => {
      sendMock.mockRejectedValueOnce(new Error("gmail down"));
      const { sendAlertsDigestEmailOrThrow } = await import("./emailService");
      await expect(sendAlertsDigestEmailOrThrow(rows, null)).rejects.toThrow("gmail down");
    });
  });
});
