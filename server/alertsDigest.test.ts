import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock("./db", () => ({
  pool: { connect: vi.fn(async () => mockClient) },
}));

vi.mock("./sheetsService", () => ({
  getAlertRows: vi.fn(),
  getAlertsDigestLastSentAt: vi.fn(),
  setAlertsDigestLastSentAt: vi.fn(),
}));

vi.mock("./emailService", () => ({
  sendAlertsDigestEmailOrThrow: vi.fn(),
}));

import { isDigestDue, filterRowsSince, runAlertsDigestIfDue } from "./alertsDigest";
import {
  getAlertRows,
  getAlertsDigestLastSentAt,
  setAlertsDigestLastSentAt,
} from "./sheetsService";
import { sendAlertsDigestEmailOrThrow } from "./emailService";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-07-16T12:00:00Z");

function lockGranted(locked: boolean) {
  mockClient.query.mockImplementation(async (sql: string) => {
    if (typeof sql === "string" && sql.includes("pg_try_advisory_lock")) {
      return { rows: [{ locked }] };
    }
    return { rows: [] };
  });
}

describe("isDigestDue", () => {
  it("is due when never sent", () => {
    expect(isDigestDue(null, now)).toBe(true);
  });

  it("is not due before 7 days", () => {
    expect(isDigestDue(new Date(now.getTime() - 6 * DAY), now)).toBe(false);
  });

  it("is due at/after 7 days", () => {
    expect(isDigestDue(new Date(now.getTime() - 7 * DAY), now)).toBe(true);
    expect(isDigestDue(new Date(now.getTime() - 30 * DAY), now)).toBe(true);
  });
});

describe("filterRowsSince", () => {
  const rows = [
    { date: "2026-07-01T00:00:00Z", title: "old", details: "" },
    { date: "2026-07-15T00:00:00Z", title: "new", details: "" },
    { date: "not-a-date", title: "garbage-date", details: "" },
  ];

  it("returns everything when never digested", () => {
    expect(filterRowsSince(rows, null)).toHaveLength(3);
  });

  it("keeps only rows after the last digest, plus unparseable dates", () => {
    const result = filterRowsSince(rows, new Date("2026-07-10T00:00:00Z"));
    expect(result.map((r) => r.title)).toEqual(["new", "garbage-date"]);
  });
});

describe("runAlertsDigestIfDue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockGranted(true);
  });

  it("sends the digest and advances state when new rows exist", async () => {
    vi.mocked(getAlertsDigestLastSentAt).mockResolvedValue(null);
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-15T00:00:00Z", title: "Welcome email FAILED", details: "boom" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();

    expect(sendAlertsDigestEmailOrThrow).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAlertsDigestEmailOrThrow).mock.calls[0][0]).toHaveLength(1);
    expect(setAlertsDigestLastSentAt).toHaveBeenCalledOnce();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("skips the email but advances the window when there are no new rows", async () => {
    vi.mocked(getAlertsDigestLastSentAt).mockResolvedValue(new Date(now.getTime() - 8 * DAY));
    vi.mocked(getAlertRows).mockResolvedValue([]);

    await runAlertsDigestIfDue();

    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestLastSentAt).toHaveBeenCalledOnce();
  });

  it("does NOT advance state when the email fails, so the hourly check retries", async () => {
    vi.mocked(getAlertsDigestLastSentAt).mockResolvedValue(null);
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-15T00:00:00Z", title: "alert", details: "" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockRejectedValue(new Error("gmail down"));

    await runAlertsDigestIfDue();

    expect(setAlertsDigestLastSentAt).not.toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("does nothing when the digest is not due", async () => {
    vi.mocked(getAlertsDigestLastSentAt).mockResolvedValue(new Date());

    await runAlertsDigestIfDue();

    expect(getAlertRows).not.toHaveBeenCalled();
    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestLastSentAt).not.toHaveBeenCalled();
  });

  it("skips when another instance holds the advisory lock", async () => {
    vi.mocked(getAlertsDigestLastSentAt).mockResolvedValue(null);
    lockGranted(false);

    await runAlertsDigestIfDue();

    expect(getAlertRows).not.toHaveBeenCalled();
    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestLastSentAt).not.toHaveBeenCalled();
  });
});
