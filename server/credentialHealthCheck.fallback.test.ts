/**
 * Tests for the alert fallback chain in runCredentialHealthCheck():
 * email first; if the email send reports failure, append an alert row to
 * the Google Sheet; if that also throws, log loudly but never crash.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getStripeSecretKey = vi.fn();
const getUncachableGmailClient = vi.fn();
const getUncachableGoogleSheetClient = vi.fn();
const sendCredentialAlertEmail = vi.fn();
const appendCredentialAlertToSheet = vi.fn();

vi.mock("./stripeClient", () => ({ getStripeSecretKey }));
vi.mock("./gmailClient", () => ({ getUncachableGmailClient }));
vi.mock("./sheetsClient", () => ({ getUncachableGoogleSheetClient }));
vi.mock("./emailService", () => ({ sendCredentialAlertEmail }));
vi.mock("./sheetsService", () => ({ appendCredentialAlertToSheet }));

async function freshRun() {
  vi.resetModules();
  const mod = await import("./credentialHealthCheck");
  const promise = mod.runCredentialHealthCheck();
  // Flush the 15s retry sleeps for any failing checks.
  await vi.advanceTimersByTimeAsync(60 * 1000);
  await promise;
}

describe("credential health check alert fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Default: both services healthy.
    getStripeSecretKey.mockResolvedValue("sk_test_ok");
    getUncachableGmailClient.mockResolvedValue({});
    getUncachableGoogleSheetClient.mockResolvedValue({});
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call the sheet fallback when the alert email succeeds", async () => {
    getStripeSecretKey.mockRejectedValue(new Error("connector returned empty"));
    sendCredentialAlertEmail.mockResolvedValue(true);

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
    expect(appendCredentialAlertToSheet).not.toHaveBeenCalled();
  });

  it("falls back to the Google Sheet only when the email send returns false", async () => {
    getUncachableGmailClient.mockRejectedValue(new Error("gmail connection missing"));
    sendCredentialAlertEmail.mockResolvedValue(false);

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(appendCredentialAlertToSheet).toHaveBeenCalledTimes(1);
    expect(appendCredentialAlertToSheet).toHaveBeenCalledWith({
      service: "gmail",
      message: "gmail connection missing",
    });
  });

  it("catches and logs sheet fallback errors without crashing the health check", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUncachableGmailClient.mockRejectedValue(new Error("gmail connection missing"));
    sendCredentialAlertEmail.mockResolvedValue(false);
    appendCredentialAlertToSheet.mockRejectedValue(new Error("sheets down too"));

    await expect(freshRun()).resolves.toBeUndefined();

    expect(appendCredentialAlertToSheet).toHaveBeenCalledTimes(1);
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("BOTH alert channels failed"),
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });

  it("alerts by email when the Sheets connector breaks", async () => {
    getUncachableGoogleSheetClient.mockRejectedValue(new Error("sheets connection missing"));
    sendCredentialAlertEmail.mockResolvedValue(true);

    await freshRun();

    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("sheets", expect.any(Error));
    expect(appendCredentialAlertToSheet).not.toHaveBeenCalled();
  });

  it("never uses the sheet fallback for a sheets outage — logs loudly when the email also fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getUncachableGoogleSheetClient.mockRejectedValue(new Error("sheets connection missing"));
    sendCredentialAlertEmail.mockResolvedValue(false);

    await expect(freshRun()).resolves.toBeUndefined();

    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("sheets", expect.any(Error));
    expect(appendCredentialAlertToSheet).not.toHaveBeenCalled();
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("owner is unreachable by both channels"),
      ),
    ).toBe(true);
    consoleError.mockRestore();
  });

  it("skips alerting entirely when all credentials resolve", async () => {
    await freshRun();

    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
    expect(appendCredentialAlertToSheet).not.toHaveBeenCalled();
  });
});
