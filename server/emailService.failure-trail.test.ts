/**
 * Customer-facing email failure trail: when a welcome or lead nurture email
 * can't be sent, the failure must be recorded as a row in the "RxFit Alerts"
 * sheet (including the recipient address so it can be re-sent manually), and
 * the customer flow must never throw — even when the sheet write also fails.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("./gmailClient", () => ({
  getUncachableGmailClient: vi.fn().mockImplementation(async () => ({
    users: { messages: { send: sendMock }, getProfile: vi.fn() },
  })),
}));

vi.mock("./sheetsService", () => ({
  appendAlertToSheet: vi.fn().mockResolvedValue(undefined),
}));

describe("customer email failure trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a welcome-email failure in the alerts sheet with the recipient", async () => {
    sendMock.mockRejectedValueOnce(new Error("gmail 500"));
    const { sendWelcomeEmail } = await import("./emailService");
    const { appendAlertToSheet } = await import("./sheetsService");

    await expect(
      sendWelcomeEmail("customer@example.com", "Casey Customer", "The Kickstart"),
    ).resolves.toBeUndefined();

    expect(appendAlertToSheet).toHaveBeenCalledTimes(1);
    const [alert] = vi.mocked(appendAlertToSheet).mock.calls[0];
    expect(alert.title).toContain("Welcome email FAILED");
    expect(alert.title).toContain("customer@example.com");
    expect(alert.message).toContain("customer@example.com");
    expect(alert.message).toContain("Casey Customer");
    expect(alert.message).toContain("gmail 500");
  });

  it("records a lead-email failure in the alerts sheet with the recipient", async () => {
    sendMock.mockRejectedValueOnce(new Error("token expired"));
    const { sendLeadEmail } = await import("./emailService");
    const { appendAlertToSheet } = await import("./sheetsService");

    await expect(sendLeadEmail("lead@example.com", "Lee")).resolves.toBeUndefined();

    expect(appendAlertToSheet).toHaveBeenCalledTimes(1);
    const [alert] = vi.mocked(appendAlertToSheet).mock.calls[0];
    expect(alert.title).toContain("Lead nurture email FAILED");
    expect(alert.title).toContain("lead@example.com");
    expect(alert.message).toContain("token expired");
  });

  it("does not touch the sheet when the email sends fine", async () => {
    sendMock.mockResolvedValueOnce({});
    const { sendWelcomeEmail } = await import("./emailService");
    const { appendAlertToSheet } = await import("./sheetsService");

    await sendWelcomeEmail("happy@example.com", "Happy", "The Committed");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(appendAlertToSheet).not.toHaveBeenCalled();
  });

  it("never throws even when the sheet write also fails", async () => {
    sendMock.mockRejectedValueOnce(new Error("gmail down"));
    const { appendAlertToSheet } = await import("./sheetsService");
    vi.mocked(appendAlertToSheet).mockRejectedValueOnce(new Error("sheets down too"));

    const { sendLeadEmail } = await import("./emailService");
    await expect(sendLeadEmail("lost@example.com", "Lou")).resolves.toBeUndefined();
  });
});
