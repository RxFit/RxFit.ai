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

// "pricing" and "blogSsr" are EVENT-DRIVEN services: they are not probed on
// the hourly timer (there is nothing to poll — serving outcomes only exist
// when a request is served). The /api/stripe/products route reports every
// serving outcome via reportPricingServing, and both crawler-facing blog
// routes report via reportBlogSsrServing.
export type ServiceName = "stripe" | "gmail" | "sheets" | "pricing" | "blogSsr";

type ServiceState = { healthy: boolean; alerted: boolean };

const state: Record<ServiceName, ServiceState> = {
  stripe: { healthy: true, alerted: false },
  gmail: { healthy: true, alerted: false },
  sheets: { healthy: true, alerted: false },
  pricing: { healthy: true, alerted: false },
  blogSsr: { healthy: true, alerted: false },
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
  pricing: { healthy: null, lastCheckedAt: null, lastError: null },
  blogSsr: { healthy: null, lastCheckedAt: null, lastError: null },
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
      pricing: { ...status.pricing },
      blogSsr: { ...status.blogSsr },
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

/**
 * Whether the running environment is expected to charge REAL cards. Test
 * mode is legitimate in development (the Replit Connector fallback is
 * sandbox-only), so the live-mode assertion only applies to deployed apps
 * by default. Override explicitly with STRIPE_REQUIRE_LIVEMODE=true/false
 * (e.g. to run the full health check against a dev deployment).
 */
export function expectLiveMode(): boolean {
  const override = process.env.STRIPE_REQUIRE_LIVEMODE;
  if (override === "true") return true;
  if (override === "false") return false;
  return process.env.REPLIT_DEPLOYMENT === "1";
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

  // …then assert the key is LIVE mode when the app is deployed. If
  // STRIPE_SECRET_KEY is ever deleted/lost (or "fixed" by re-authorizing the
  // connector), stripeClient silently falls back to the Replit Connector in
  // TEST mode — balance.retrieve still succeeds, so the probes above stay
  // green, while every live checkout 500s on our livemode price IDs and no
  // real revenue arrives.
  if (expectLiveMode() && isTestModeKey(key, balance?.livemode)) {
    throw new Error(
      "Stripe is running in TEST mode on the live deployment — live checkout will 500 on the site's pinned livemode price IDs and no real revenue arrives. " +
        "The STRIPE_SECRET_KEY secret is likely missing/deleted, so stripeClient fell back to the Replit Connector (sandbox). " +
        "Set the live key (sk_live_…) as STRIPE_SECRET_KEY in Replit Secrets to fix.",
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

/**
 * Shared outcome recorder: applies the healthy→broken transition logic,
 * updates the on-demand status snapshot, and dispatches the owner alert
 * (email → sheet fallback) on the transition. Used by the periodic
 * credential checks AND by the event-driven reporters (pricing serving,
 * blog SSR serving).
 */
async function recordOutcome(
  name: ServiceName,
  ok: boolean,
  error: unknown,
  failureContext: string,
): Promise<void> {
  const { next, shouldAlert, recovered } = evaluateTransition(state[name], ok);
  state[name] = next;

  status[name] = {
    healthy: ok,
    lastCheckedAt: new Date().toISOString(),
    lastError: ok ? null : error instanceof Error ? error.message : String(error),
  };

  if (ok) {
    if (recovered) {
      console.log(`[credential-check] ${name} RECOVERED — service healthy again`);
    }
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`[credential-check] ALERT: ${name.toUpperCase()} ${failureContext}: ${message}`);

  if (shouldAlert) {
    // Primary channel: email. If Gmail itself is the broken service the email
    // can't be sent — fall back to appending an alert row to the Google Sheet
    // (separate google-sheet connector, so it survives a Gmail outage).
    // Exception: when Sheets ITSELF is the broken service, the sheet fallback
    // is pointless — rely on email only and log loudly if that also fails.
    const emailSent = await sendCredentialAlertEmail(name, error);
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

async function checkService(name: ServiceName, fn: () => Promise<void>): Promise<void> {
  const result = await checkWithRetry(fn);
  await recordOutcome(
    name,
    result.ok,
    result.error,
    `credentials failed to resolve (twice, ${RETRY_DELAY_MS / 1000}s apart)`,
  );
}

/**
 * Event-driven pricing-serving monitor, reported from /api/stripe/products:
 * `ok=false` when the endpoint served a stale last-known-good snapshot or
 * failed entirely (buyers are seeing stale or unavailable pricing);
 * `ok=true` when a fresh catalog was served. Uses the same healthy→broken
 * transition + alert chain (email → sheet fallback) as the periodic checks,
 * so the owner is alerted once per outage and recovery resets the state.
 */
export async function reportPricingServing(ok: boolean, error?: unknown): Promise<void> {
  try {
    await recordOutcome(
      "pricing",
      ok,
      error ?? new Error("Pricing endpoint failure"),
      "buyers are seeing stale or unavailable pricing",
    );
  } catch (e) {
    // Never let monitoring break the products endpoint itself.
    console.error("[credential-check] Failed to record pricing serving outcome:", e);
  }
}

/**
 * Event-driven blog-SSR monitor, reported from BOTH crawler-facing blog
 * routes: the GET /blog/:slug handler (server/blogSlugRoute.ts) and the
 * GET /blog index handler (server/blogIndexRoute.ts). `ok=false` when
 * storage threw and the route degraded — the slug route serves the SPA
 * shell (crawlers silently get thin client-side HTML for every AI post),
 * the index route serves the prerendered static file (crawlers silently
 * get a stale index that omits every AI-published post) — while the outage
 * lasts; `ok=true` when full crawler HTML was served (a published DB post,
 * or the merged MDX+DB index). Both routes share one service deliberately:
 * a DB outage breaks both the same way, so the owner gets ONE alert per
 * outage (email → sheet fallback), and recovery resets the state.
 */
export async function reportBlogSsrServing(ok: boolean, error?: unknown): Promise<void> {
  try {
    await recordOutcome(
      "blogSsr",
      ok,
      error ?? new Error("Blog SSR serving failure"),
      "crawlers are getting the SPA shell instead of crawler HTML for AI blog posts",
    );
  } catch (e) {
    // Never let monitoring break the blog route itself.
    console.error("[credential-check] Failed to record blog SSR serving outcome:", e);
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

/**
 * Pure test-mode detection (unit-tested): a key is in test mode when its
 * prefix says so OR the account's balance reports livemode=false. Either
 * signal alone is enough — the prefix catches it even if a future Stripe
 * API version drops the balance livemode flag, and the flag catches
 * restricted keys (rk_test_…) whose prefix this doesn't enumerate.
 */
export function isTestModeKey(key: string, balanceLivemode: boolean | undefined): boolean {
  return key.startsWith("sk_test_") || key.startsWith("rk_test_") || balanceLivemode === false;
}
