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
 * The Stripe check goes further than credential resolution: it also asserts,
 * read-only, that the three pinned LIVE_PRICE_IDS still match the pricing the
 * site advertises, and that a live deployment is not silently running
 * test-mode keys. Both live inside the SAME `stripe` service on purpose — a
 * separate plan-tier service would re-alert on the identical root cause,
 * which is how one broken credential once produced two emails, the second
 * prescribing a Stripe metadata edit that would have mischarged buyers.
 *
 * Enabled in production automatically; in development set
 * CREDENTIAL_HEALTHCHECK=true to run it.
 */
import { getStripeSecretKey, getUncachableStripeClient } from "./stripeClient";
import { getUncachableGmailClient } from "./gmailClient";
import { getUncachableGoogleSheetClient } from "./sheetsClient";
import { sendCredentialAlertEmail } from "./emailService";
import { appendCredentialAlertToSheet } from "./sheetsService";
import { PLAN_TIERS, priceIdForTier, priceMismatches, type PriceShape } from "@shared/stripe-catalog";

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
  const balance = await stripe.balance.retrieve();

  // A TEST-mode key makes balance.retrieve() succeed while every live checkout
  // 500s on our livemode price IDs — the monitor goes green while the site is
  // dead. That is exactly what happens if a missing STRIPE_SECRET_KEY is
  // "fixed" by re-authorizing the connector, which stripeClient labels
  // "Sandbox mode".
  if (
    process.env.REPLIT_DEPLOYMENT === "1" &&
    (balance as { livemode?: boolean })?.livemode === false
  ) {
    throw new Error(
      "Stripe credentials resolved but they are TEST-mode keys (balance.livemode=false) on the live deployment. Live checkout will 500 — the site's pinned price IDs are livemode. Set the live sk_live_… key as STRIPE_SECRET_KEY in Replit Secrets.",
    );
  }

  // …then verify the CATALOG. A working key proves nothing about the prices
  // buyers are actually sent to.
  await checkStripeCatalog(stripe);
}

/**
 * Read-only agreement check between the three pinned LIVE_PRICE_IDS and the
 * pricing the site advertises. Three prices.retrieve calls, no writes.
 *
 * Deliberately consults NO product metadata: zero live products carry
 * metadata.tier, so a check keyed on it could only ever fail — which is what
 * made the old "stripe plan tiers" alert fire hourly with a remedy that would
 * have started mischarging buyers had anyone followed it.
 *
 * Folded into checkStripe rather than added as a fourth service so that one
 * root cause (an unresolvable credential) produces exactly ONE alert email.
 */
async function checkStripeCatalog(stripe: any): Promise<void> {
  const problems: string[] = [];
  for (const tier of PLAN_TIERS) {
    const id = priceIdForTier(tier);
    try {
      const price = await stripe.prices.retrieve(id);
      for (const m of priceMismatches(tier, price as PriceShape)) {
        problems.push(`${tier} (${id}): ${m}`);
      }
    } catch (error: any) {
      problems.push(`${tier} (${id}): could not be retrieved from Stripe — ${error?.message ?? String(error)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      "Live Stripe catalog no longer matches the site's advertised pricing:\n- " +
        problems.join("\n- ") +
        "\nCheckout will charge the wrong amount or fail. Fix the price in the Stripe dashboard, or update LIVE_PRICE_IDS / PLAN_PRICING in shared/stripe-constants.ts and redeploy.",
    );
  }
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
  console.log("[credential-check] Enabled — verifying Stripe (credentials + live price catalog), Gmail & Sheets at boot and hourly");
  setTimeout(() => void runCredentialHealthCheck(), BOOT_DELAY_MS);
  setInterval(() => void runCredentialHealthCheck(), CHECK_INTERVAL_MS).unref();
}
