/**
 * The Stripe health check must verify REAL API access, not just that the
 * secret key resolves: a resolved key can be revoked or rotated to an invalid
 * value, leaving checkout broken while the check stays green. checkStripe
 * therefore performs a minimal authenticated read (balance.retrieve) after
 * key resolution. Mirrors credentialHealthCheck.sheets-probe.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    getUncachableStripeClient.mockResolvedValue({ balance: { retrieve } });

    await freshRun();

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("alerts when the key resolves but the API call is rejected (revoked/invalid key)", async () => {
    const retrieve = vi.fn().mockRejectedValue(
      Object.assign(new Error("Invalid API Key provided"), { statusCode: 401 }),
    );
    getUncachableStripeClient.mockResolvedValue({ balance: { retrieve } });

    await freshRun();

    // Retried once (15s apart), then alerted for stripe specifically.
    expect(retrieve).toHaveBeenCalledTimes(2);
    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
  });

  it("still alerts when the key itself resolves empty (probe never reached)", async () => {
    getStripeSecretKey.mockResolvedValue("");
    const retrieve = vi.fn();
    getUncachableStripeClient.mockResolvedValue({ balance: { retrieve } });

    await freshRun();

    expect(retrieve).not.toHaveBeenCalled();
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("stripe", expect.any(Error));
  });
});
