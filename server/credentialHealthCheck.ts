/**
 * Periodic credential health check for the Stripe, Gmail, and Google Sheets
 * connectors (Sheets both syncs every lead and serves as the backup alert
 * channel, so its silent failure would otherwise go unnoticed).
 *
 * The Replit connector API once silently stopped returning credentials
 * (its name filter began returning empty results), which broke checkout
 * (500s on pricing/checkout) and outbound email until manually fixed.
 * This check verifies — shortly after boot and hourly thereafter — that
 * all three credential sets still resolve, and alerts loudly when they don't.
 *
 * False-alarm avoidance:
 *  - each failing check is retried once after a short delay (transient
 *    network blips to the connector API shouldn't page the owner);
 *  - the owner is emailed only on the healthy → broken transition for a
 *    service, not on every hourly re-check while it stays broken;
 *  - recovery is logged (and resets the alert state) so a future outage
 *    alerts again.
 *
 * Enabled in production automatically; in development set
 * CREDENTIAL_HEALTHCHECK=true to run it.
 */
import { getStripeSecretKey, getUncachableStripeClient } from "./stripeClient";
import { getUncachableGmailClient } from "./gmailClient";
import { getUncachableGoogleSheetClient } from "./sheetsClient";
import { sendCredentialAlertEmail } from "./emailService";
import { appendCredentialAlertToSheet } from "./sheetsService";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const BOOT_DELAY_MS = 45 * 1000;
const RETRY_DELAY_MS = 15 * 1000;

export type ServiceName = "stripe" | "gmail" | "sheets";

type ServiceState = { healthy: boolean; alerted: boolean };

const state: Record<ServiceName, ServiceState> = {
  stripe: { healthy: true, alerted: false },
  gmail: { healthy: true, alerted: false },
  sheets: { healthy: true, alerted: false },
};

/** On-demand status metadata (per service), surfaced by the internal
 *  /api/internal/credential-health endpoint. `healthy: null` = not yet checked. */
type ServiceStatus = {
  healthy: boolean | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

const status: Record<ServiceName, ServiceStatus> = {
  stripe: { healthy: null, lastCheckedAt: null, lastError: null },
  gmail: { healthy: null, lastCheckedAt: null, lastError: null },
  sheets: { healthy: null, lastCheckedAt: null, lastError: null },
};

export interface CredentialHealthStatus {
  services: Record<ServiceName, ServiceStatus>;
  checkedAt: string;
}

/** Snapshot of the in-memory credential health state (deep-copied). */
export function getCredentialHealthStatus(): CredentialHealthStatus {
  return {
    services: {
      stripe: { ...status.stripe },
      gmail: { ...status.gmail },
      sheets: { ...status.sheets },
    },
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Pure transition logic (unit-tested): given the previous state and the
 * latest check result, decide whether to alert and compute the next state.
 */
export function evaluateTransition(
  prev: ServiceState,
  ok: boolean,
): { next: ServiceState; shouldAlert: boolean; recovered: boolean } {
  if (ok) {
    return {
      next: { healthy: true, alerted: false },
      shouldAlert: false,
      recovered: !prev.healthy,
    };
  }
  return {
    next: { healthy: false, alerted: true },
    shouldAlert: !prev.alerted,
    recovered: false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkStripe(): Promise<void> {
  // Resolve the secret key (throws if neither the STRIPE_SECRET_KEY secret nor
  // the connector can provide one)…
  const key = await getStripeSecretKey();
  if (!key) throw new Error("Stripe secret key resolved empty");

  // …then verify REAL API access: a resolved key can be revoked or rotated to
  // an invalid value, leaving checkout broken while the key still "resolves".
  // balance.retrieve is the cheapest authenticated read (no list, no params)
  // and works for every account/mode.
  const stripe = await getUncachableStripeClient();
  await stripe.balance.retrieve();
}

async function checkGmail(): Promise<void> {
  // getUncachableGmailClient resolves the connector access token and throws
  // if the connection is missing or the token can't be fetched.
  await getUncachableGmailClient();
}

async function checkSheets(): Promise<void> {
  // Resolve the connector access token (throws if the connection is missing
  // or the token can't be fetched)…
  const sheets = await getUncachableGoogleSheetClient();

  // …then verify REAL API access: a token can resolve while actual access is
  // revoked (spreadsheet permission removed, OAuth scope revoked). A minimal
  // metadata read on the leads spreadsheet confirms the sync can still reach
  // it. (Gmail can't get the same upgrade — its connector token is send-only,
  // so any read probe like getProfile fails even when sending works.)
  const spreadsheetId = process.env.LEADS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    // Without the spreadsheet ID the sync/alert channel is unconfigured
    // anyway; token resolution is the deepest check available.
    return;
  }
  await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
}

async function checkWithRetry(fn: () => Promise<void>): Promise<{ ok: boolean; error?: unknown }> {
  try {
    await fn();
    return { ok: true };
  } catch (firstError) {
    await sleep(RETRY_DELAY_MS);
    try {
      await fn();
      return { ok: true };
    } catch (error) {
      void firstError;
      return { ok: false, error };
    }
  }
}

async function checkService(name: ServiceName, fn: () => Promise<void>): Promise<void> {
  const result = await checkWithRetry(fn);
  const { next, shouldAlert, recovered } = evaluateTransition(state[name], result.ok);
  state[name] = next;

  status[name] = {
    healthy: result.ok,
    lastCheckedAt: new Date().toISOString(),
    lastError: result.ok
      ? null
      : result.error instanceof Error
        ? result.error.message
        : String(result.error),
  };

  if (result.ok) {
    if (recovered) {
      console.log(`[credential-check] ${name} credentials RECOVERED — service healthy again`);
    }
    return;
  }

  const message =
    result.error instanceof Error ? result.error.message : String(result.error);
  console.error(
    `[credential-check] ALERT: ${name.toUpperCase()} credentials failed to resolve (twice, ${RETRY_DELAY_MS / 1000}s apart): ${message}`,
  );

  if (shouldAlert) {
    // Primary channel: email. If Gmail itself is the broken service the email
    // can't be sent — fall back to appending an alert row to the Google Sheet
    // (separate google-sheet connector, so it survives a Gmail outage).
    // Exception: when Sheets ITSELF is the broken service, the sheet fallback
    // is pointless — rely on email only and log loudly if that also fails.
    const emailSent = await sendCredentialAlertEmail(name, result.error);
    if (!emailSent) {
      if (name === "sheets") {
        console.error(
          `[credential-check] ALERT EMAIL FAILED for sheets and the Google Sheet fallback IS the broken service — owner is unreachable by both channels. Sheets error: ${message}`,
        );
      } else {
        try {
          await appendCredentialAlertToSheet({ service: name, message });
        } catch (sheetError) {
          console.error(
            `[credential-check] BOTH alert channels failed for ${name} — email and Google Sheet fallback. Sheet error:`,
            sheetError,
          );
        }
      }
    }
  } else {
    console.error(`[credential-check] ${name} still broken (owner already alerted)`);
  }
}

let running = false;

export async function runCredentialHealthCheck(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await checkService("stripe", checkStripe);
    await checkService("gmail", checkGmail);
    await checkService("sheets", checkSheets);
  } catch (error) {
    console.error("[credential-check] Unexpected error during health check:", error);
  } finally {
    running = false;
  }
}

export function startCredentialHealthCheck(): void {
  const enabled =
    process.env.NODE_ENV === "production" || process.env.CREDENTIAL_HEALTHCHECK === "true";
  if (!enabled) {
    console.log(
      "[credential-check] Disabled in development (set CREDENTIAL_HEALTHCHECK=true to enable)",
    );
    return;
  }
  console.log("[credential-check] Enabled — verifying Stripe, Gmail & Sheets credentials at boot and hourly");
  setTimeout(() => void runCredentialHealthCheck(), BOOT_DELAY_MS);
  setInterval(() => void runCredentialHealthCheck(), CHECK_INTERVAL_MS).unref();
}
