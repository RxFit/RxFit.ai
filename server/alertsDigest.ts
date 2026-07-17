/**
 * Weekly digest of unresolved rows in the "RxFit Alerts" sheet tab.
 *
 * The alerts tab is the fallback channel for several failure types
 * (credential outages, failed publish notifications, missed welcome/lead
 * emails), but nothing prompted the owner to look at it — a row written
 * during a Gmail outage could sit unseen for weeks after email recovered.
 *
 * This scheduler follows the blogScheduler pattern: an hourly due-check
 * inside the Express process (plus one shortly after boot), guarded by a
 * Postgres advisory lock so only one autoscale instance sends. A digest is
 * due when the last one was sent ≥7 days ago (or never). If new alert rows
 * exist since the last digest, the owner gets a summary email; state
 * (stored in the hidden "RxFit Meta" sheet tab) is only advanced after a
 * successful send, so a failed send retries every hour — which is exactly
 * how sheet-only alerts eventually reach the inbox once Gmail is healthy
 * again.
 *
 * Cadence and row filtering are tracked SEPARATELY:
 * - `lastSentAt` (wall-clock send time) drives the weekly due-check.
 * - `watermark` (max row date actually included in the last digest) drives
 *   filterRowsSince. Advancing the filter boundary to `new Date()` instead
 *   would skip forever any row appended in the seconds between reading the
 *   sheet and persisting state — the watermark closes that miss window.
 *
 * Enabled in production automatically; in development set ALERTS_DIGEST=true.
 */
import { pool } from "./db";
import { getAlertRows, getAlertsDigestState, setAlertsDigestState, type AlertRow } from "./sheetsService";
import { sendAlertsDigestEmailOrThrow } from "./emailService";

const DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly due-check
const BOOT_DELAY_MS = 90 * 1000; // after the blog scheduler's 30s boot check
const ADVISORY_LOCK_KEY = 815_043; // app-unique; blogScheduler uses 815_042

let running = false;

export function isDigestDue(lastSentAt: Date | null, now = new Date()): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= DIGEST_INTERVAL_MS;
}

/** Rows dated after the watermark (all rows when never digested). */
export function filterRowsSince(rows: AlertRow[], watermark: Date | null): AlertRow[] {
  if (!watermark) return rows;
  return rows.filter((row) => {
    const rowDate = new Date(row.date);
    if (isNaN(rowDate.getTime())) return true; // unparseable date → surface it rather than drop it
    return rowDate.getTime() > watermark.getTime();
  });
}

/**
 * The next watermark after including `rows` in a digest: the max parseable
 * row date, never earlier than the previous watermark. Unparseable dates
 * can't advance it (they're surfaced in every digest instead of dropped).
 */
export function nextWatermark(rows: AlertRow[], previous: Date | null): Date | null {
  let max = previous;
  for (const row of rows) {
    const rowDate = new Date(row.date);
    if (isNaN(rowDate.getTime())) continue;
    if (!max || rowDate.getTime() > max.getTime()) max = rowDate;
  }
  return max;
}

export async function runAlertsDigestIfDue(): Promise<void> {
  if (running) return;
  running = true;
  const client = await pool.connect();
  let locked = false;
  try {
    const { lastSentAt } = await getAlertsDigestState();
    if (!isDigestDue(lastSentAt)) return;

    const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      ADVISORY_LOCK_KEY,
    ]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) {
      console.log("[alerts-digest] Another instance holds the digest lock — skipping");
      return;
    }

    // Re-check under the lock in case another instance just sent.
    const stateUnderLock = await getAlertsDigestState();
    if (!isDigestDue(stateUnderLock.lastSentAt)) return;

    // Filter from the watermark, not the send time. Pre-watermark sheets
    // (upgrade path) fall back to lastSentAt — the old behavior — once.
    const watermark = stateUnderLock.watermark ?? stateUnderLock.lastSentAt;
    const rows = filterRowsSince(await getAlertRows(), watermark);
    if (rows.length === 0) {
      // Nothing to report — advance the cadence clock so we don't re-scan
      // hourly, but keep the filter boundary where it is: a row appended
      // after our sheet read keeps a date > boundary and appears in the next
      // digest. Crucially, never persist a NULL watermark here: null would
      // make the next run fall back to the freshly advanced lastSentAt,
      // reopening the read/write miss window. With no boundary at all
      // (never-digested, empty sheet) persist epoch zero — every future row
      // is newer than that.
      await setAlertsDigestState({ lastSentAt: new Date(), watermark: watermark ?? new Date(0) });
      console.log("[alerts-digest] No new alert rows since last digest — window advanced");
      return;
    }

    // Send first, persist after: a failed send must NOT advance the window,
    // so the hourly check retries until Gmail is healthy again.
    await sendAlertsDigestEmailOrThrow(rows, watermark);
    // Watermark = max row date actually included — never `new Date()`, so a
    // row appended between the sheet read and this write can't be skipped.
    // nextWatermark is null only when there was no previous boundary AND
    // every included row date was unparseable; floor at epoch zero so the
    // persisted watermark is never null (see the no-rows comment above).
    await setAlertsDigestState({
      lastSentAt: new Date(),
      watermark: nextWatermark(rows, watermark) ?? new Date(0),
    });
    console.log(`[alerts-digest] Weekly digest sent (${rows.length} row(s))`);
  } catch (error) {
    // Loud log only — the digest IS the alerting fallback, so there is no
    // deeper channel to escalate to. The next hourly check retries.
    console.error("[alerts-digest] Digest run failed (will retry hourly):", error);
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
    running = false;
  }
}

export function startAlertsDigestScheduler(): void {
  const enabled = process.env.NODE_ENV === "production" || process.env.ALERTS_DIGEST === "true";
  if (!enabled) {
    console.log("[alerts-digest] Disabled in development (set ALERTS_DIGEST=true to enable)");
    return;
  }
  if (!process.env.LEADS_SPREADSHEET_ID) {
    console.warn("[alerts-digest] LEADS_SPREADSHEET_ID not set — digest disabled (no alerts sheet to read)");
    return;
  }
  console.log("[alerts-digest] Enabled — checking hourly whether the weekly digest is due");
  setTimeout(() => void runAlertsDigestIfDue(), BOOT_DELAY_MS);
  setInterval(() => void runAlertsDigestIfDue(), CHECK_INTERVAL_MS).unref();
}
