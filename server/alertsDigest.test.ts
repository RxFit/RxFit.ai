import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

vi.mock("./db", () => ({
  pool: { connect: vi.fn(async () => mockClient) },
}));

vi.mock("./sheetsService", async (importOriginal) => {
  const original = await importOriginal<typeof import("./sheetsService")>();
  return {
    parseAlertsDigestMeta: original.parseAlertsDigestMeta,
    getAlertRows: vi.fn(),
    getAlertsDigestState: vi.fn(),
    setAlertsDigestState: vi.fn(),
  };
});

vi.mock("./emailService", () => ({
  sendAlertsDigestEmailOrThrow: vi.fn(),
}));

import { isDigestDue, filterRowsSince, nextWatermark, runAlertsDigestIfDue } from "./alertsDigest";
import {
  getAlertRows,
  getAlertsDigestState,
  setAlertsDigestState,
  parseAlertsDigestMeta,
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

  it("keeps only rows after the watermark, plus unparseable dates", () => {
    const result = filterRowsSince(rows, new Date("2026-07-10T00:00:00Z"));
    expect(result.map((r) => r.title)).toEqual(["new", "garbage-date"]);
  });
});

describe("nextWatermark", () => {
  it("returns the max parseable row date", () => {
    const rows = [
      { date: "2026-07-14T00:00:00Z", title: "a", details: "" },
      { date: "2026-07-15T09:30:00Z", title: "b", details: "" },
      { date: "2026-07-13T00:00:00Z", title: "c", details: "" },
    ];
    expect(nextWatermark(rows, null)?.toISOString()).toBe("2026-07-15T09:30:00.000Z");
  });

  it("never moves backwards from the previous watermark", () => {
    const rows = [{ date: "2026-07-01T00:00:00Z", title: "old", details: "" }];
    const previous = new Date("2026-07-10T00:00:00Z");
    expect(nextWatermark(rows, previous)).toBe(previous);
  });

  it("keeps the previous watermark when all row dates are unparseable", () => {
    const rows = [{ date: "not-a-date", title: "garbage", details: "" }];
    const previous = new Date("2026-07-10T00:00:00Z");
    expect(nextWatermark(rows, previous)).toBe(previous);
    expect(nextWatermark(rows, null)).toBeNull();
  });
});

describe("parseAlertsDigestMeta", () => {
  it("reads both keys regardless of row order", () => {
    const state = parseAlertsDigestMeta([
      ["alertsDigestWatermark", "2026-07-15T09:30:00Z"],
      ["alertsDigestLastSentAt", "2026-07-16T12:00:00Z"],
    ]);
    expect(state.lastSentAt?.toISOString()).toBe("2026-07-16T12:00:00.000Z");
    expect(state.watermark?.toISOString()).toBe("2026-07-15T09:30:00.000Z");
  });

  it("tolerates pre-watermark sheets (lastSentAt only)", () => {
    const state = parseAlertsDigestMeta([["alertsDigestLastSentAt", "2026-07-16T12:00:00Z"]]);
    expect(state.lastSentAt).not.toBeNull();
    expect(state.watermark).toBeNull();
  });

  it("returns nulls for missing, empty, or unparseable values", () => {
    expect(parseAlertsDigestMeta(null)).toEqual({ lastSentAt: null, watermark: null });
    expect(parseAlertsDigestMeta([])).toEqual({ lastSentAt: null, watermark: null });
    expect(
      parseAlertsDigestMeta([
        ["alertsDigestLastSentAt", ""],
        ["alertsDigestWatermark", "not-a-date"],
      ]),
    ).toEqual({ lastSentAt: null, watermark: null });
  });
});

describe("runAlertsDigestIfDue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lockGranted(true);
  });

  it("sends the digest and advances state when new rows exist", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-15T00:00:00Z", title: "Welcome email FAILED", details: "boom" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();

    expect(sendAlertsDigestEmailOrThrow).toHaveBeenCalledOnce();
    expect(vi.mocked(sendAlertsDigestEmailOrThrow).mock.calls[0][0]).toHaveLength(1);
    expect(setAlertsDigestState).toHaveBeenCalledOnce();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("sets the watermark to the max INCLUDED row date, not the send time (race fix)", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-14T00:00:00Z", title: "a", details: "" },
      { date: "2026-07-15T09:30:00Z", title: "b", details: "" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();

    const state = vi.mocked(setAlertsDigestState).mock.calls[0][0];
    expect(state.watermark?.toISOString()).toBe("2026-07-15T09:30:00.000Z");
    // The cadence clock IS the send time — strictly after the last row date.
    expect(state.lastSentAt.getTime()).toBeGreaterThan(state.watermark!.getTime());
  });

  it("a row dated between the sheet read and the state write still appears in the NEXT digest", async () => {
    // Digest 1: reads the sheet, sends, persists state. While it runs, a new
    // alert row is appended — its date is before the new lastSentAt but after
    // the last included row. Under the old lastSentAt-only filtering this row
    // was skipped forever; the watermark must keep it in scope.
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    const includedRow = { date: "2026-07-15T09:30:00Z", title: "included", details: "" };
    vi.mocked(getAlertRows).mockResolvedValue([includedRow]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();
    const persisted = vi.mocked(setAlertsDigestState).mock.calls[0][0];

    // The racing row: appended during digest 1, dated before its lastSentAt.
    const racingRow = {
      date: new Date(persisted.lastSentAt.getTime() - 1).toISOString(),
      title: "raced",
      details: "",
    };
    expect(new Date(racingRow.date).getTime()).toBeLessThan(persisted.lastSentAt.getTime());

    // Digest 2 (a week later): filters from the persisted watermark.
    const rows2 = filterRowsSince([includedRow, racingRow], persisted.watermark);
    expect(rows2.map((r) => r.title)).toEqual(["raced"]);
  });

  it("skips the email and keeps the watermark (advancing only the cadence clock) when there are no new rows", async () => {
    const watermark = new Date("2026-07-08T09:00:00Z");
    vi.mocked(getAlertsDigestState).mockResolvedValue({
      lastSentAt: new Date(now.getTime() - 8 * DAY),
      watermark,
    });
    vi.mocked(getAlertRows).mockResolvedValue([]);

    await runAlertsDigestIfDue();

    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestState).toHaveBeenCalledOnce();
    const state = vi.mocked(setAlertsDigestState).mock.calls[0][0];
    expect(state.watermark).toBe(watermark); // unchanged — no rows were included
    expect(state.lastSentAt.getTime()).toBeGreaterThan(now.getTime() - DAY);
  });

  it("never persists a null watermark on a no-rows run: never-digested state gets epoch zero, so a racing row still reaches the next digest", async () => {
    // Steady state for this app: alerts are rare, so the sheet is often empty
    // and the watermark is still null. If a no-rows run persisted watermark:
    // null, the next run would fall back to the freshly advanced lastSentAt —
    // reopening the original miss window for a row appended between the sheet
    // read and the state write.
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([]);

    await runAlertsDigestIfDue();

    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    const state = vi.mocked(setAlertsDigestState).mock.calls[0][0];
    expect(state.watermark).not.toBeNull();
    expect(state.watermark!.getTime()).toBe(0); // epoch zero — every future row is newer

    // The racing row: appended during the run, dated just before lastSentAt.
    const racingRow = {
      date: new Date(state.lastSentAt.getTime() - 1).toISOString(),
      title: "raced-during-no-rows-run",
      details: "",
    };
    expect(filterRowsSince([racingRow], state.watermark).map((r) => r.title)).toEqual([
      "raced-during-no-rows-run",
    ]);
  });

  it("floors the watermark at epoch zero when every included row date is unparseable (never null after a send)", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "not-a-date", title: "garbage-date", details: "" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();

    const state = vi.mocked(setAlertsDigestState).mock.calls[0][0];
    expect(state.watermark).not.toBeNull();
    expect(state.watermark!.getTime()).toBe(0);
  });

  it("falls back to lastSentAt for filtering on pre-watermark sheets (upgrade path)", async () => {
    const lastSentAt = new Date("2026-07-08T12:00:00Z");
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-01T00:00:00Z", title: "already-digested", details: "" },
      { date: "2026-07-10T00:00:00Z", title: "new", details: "" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockResolvedValue();

    await runAlertsDigestIfDue();

    expect(vi.mocked(sendAlertsDigestEmailOrThrow).mock.calls[0][0].map((r) => r.title)).toEqual(["new"]);
    expect(vi.mocked(sendAlertsDigestEmailOrThrow).mock.calls[0][1]).toBe(lastSentAt);
  });

  it("does NOT advance state when the email fails, so the hourly check retries", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    vi.mocked(getAlertRows).mockResolvedValue([
      { date: "2026-07-15T00:00:00Z", title: "alert", details: "" },
    ]);
    vi.mocked(sendAlertsDigestEmailOrThrow).mockRejectedValue(new Error("gmail down"));

    await runAlertsDigestIfDue();

    expect(setAlertsDigestState).not.toHaveBeenCalled();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it("does nothing when the digest is not due", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: new Date(), watermark: null });

    await runAlertsDigestIfDue();

    expect(getAlertRows).not.toHaveBeenCalled();
    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestState).not.toHaveBeenCalled();
  });

  it("skips when another instance holds the advisory lock", async () => {
    vi.mocked(getAlertsDigestState).mockResolvedValue({ lastSentAt: null, watermark: null });
    lockGranted(false);

    await runAlertsDigestIfDue();

    expect(getAlertRows).not.toHaveBeenCalled();
    expect(sendAlertsDigestEmailOrThrow).not.toHaveBeenCalled();
    expect(setAlertsDigestState).not.toHaveBeenCalled();
  });
});
