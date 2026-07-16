/**
 * The Sheets health check must verify REAL API access, not just that the
 * connector token resolves: a token can resolve while spreadsheet permission
 * or the OAuth scope has been revoked. checkSheets therefore performs a
 * minimal spreadsheets.get metadata read on LEADS_SPREADSHEET_ID.
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

const ORIGINAL_SPREADSHEET_ID = process.env.LEADS_SPREADSHEET_ID;

async function freshRun() {
  vi.resetModules();
  const mod = await import("./credentialHealthCheck");
  const promise = mod.runCredentialHealthCheck();
  await vi.advanceTimersByTimeAsync(60 * 1000);
  await promise;
}

describe("sheets health check API-access probe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    getStripeSecretKey.mockResolvedValue("sk_test_ok");
    getUncachableGmailClient.mockResolvedValue({});
    sendCredentialAlertEmail.mockResolvedValue(true);
    appendCredentialAlertToSheet.mockResolvedValue(undefined);
    process.env.LEADS_SPREADSHEET_ID = "test-spreadsheet-id";
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_SPREADSHEET_ID === undefined) delete process.env.LEADS_SPREADSHEET_ID;
    else process.env.LEADS_SPREADSHEET_ID = ORIGINAL_SPREADSHEET_ID;
  });

  it("probes the leads spreadsheet with a minimal metadata read when healthy", async () => {
    const get = vi.fn().mockResolvedValue({ data: { spreadsheetId: "test-spreadsheet-id" } });
    getUncachableGoogleSheetClient.mockResolvedValue({ spreadsheets: { get } });

    await freshRun();

    expect(get).toHaveBeenCalledWith({
      spreadsheetId: "test-spreadsheet-id",
      fields: "spreadsheetId",
    });
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });

  it("alerts when the token resolves but the API call is rejected (revoked access)", async () => {
    const get = vi.fn().mockRejectedValue(
      Object.assign(new Error("The caller does not have permission"), { code: 403 }),
    );
    getUncachableGoogleSheetClient.mockResolvedValue({ spreadsheets: { get } });

    await freshRun();

    // Retried once, then alerted for sheets specifically.
    expect(get).toHaveBeenCalledTimes(2);
    expect(sendCredentialAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendCredentialAlertEmail).toHaveBeenCalledWith("sheets", expect.any(Error));
  });

  it("falls back to token-resolution-only when LEADS_SPREADSHEET_ID is unset", async () => {
    delete process.env.LEADS_SPREADSHEET_ID;
    const get = vi.fn();
    getUncachableGoogleSheetClient.mockResolvedValue({ spreadsheets: { get } });

    await freshRun();

    expect(get).not.toHaveBeenCalled();
    expect(sendCredentialAlertEmail).not.toHaveBeenCalled();
  });
});
