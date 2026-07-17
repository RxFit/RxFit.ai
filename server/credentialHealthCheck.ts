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
import { PLAN_PRICING, type PlanTier } from "@shared/stripe-constants";

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const BOOT_DELAY_MS = 45 * 1000;
const RETRY_DELAY_MS = 15 * 1000;

export type ServiceName = "stripe" | "gmail" | "sheets" | "products" | "pricing" | "blogSsr";

type ServiceState = { healthy: boolean; alerted: boolean };

const state: Record<ServiceName, ServiceState> = {
  stripe: { healthy: true, alerted: false },
  gmail: { healthy: true, alerted: false },
  sheets: { healthy: true, alerted: false },
  products: { healthy: true, alerted: false },
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
  products: { healthy: null, lastCheckedAt: null, lastError: null },
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
      products: { ...status.products },
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

/** Minimal shape of a Stripe price (with expanded product) for tier matching. */
export type TierPriceCandidate = {
  active?: boolean | null;
  recurring?: { trial_period_days?: number | null } | null;
  unit_amount?: number | null;
  product?: { active?: boolean | null; metadata?: Record<string, string> | null } | null;
};

/**
 * Pure tier→price verification (unit-tested): given the live active prices
 * (product expanded), return a human-readable problem per PLAN_PRICING tier
 * that no longer resolves to an active recurring price on an active product
 * with the expected amount. Empty array = everything matches.
 *
 * This mirrors what SignupModalProvider does with /api/stripe/products
 * (metadata.tier → price id; checkout is disabled when a tier can't
 * resolve) — but loudly, so the owner hears about it.
 */
export function findTierPriceProblems(prices: TierPriceCandidate[]): string[] {
  const problems: string[] = [];
  for (const tier of Object.keys(PLAN_PRICING) as PlanTier[]) {
    const candidates = prices.filter(
      (p) => p.product?.metadata?.tier === tier && p.product?.active !== false,
    );
    if (candidates.length === 0) {
      const archivedOnly = prices.some((p) => p.product?.metadata?.tier === tier);
      problems.push(
        archivedOnly
          ? `${tier}: product with metadata.tier="${tier}" is archived (checkout for this tier is disabled until fixed)`
          : `${tier}: no active Stripe product has metadata.tier="${tier}" (checkout for this tier is disabled until fixed)`,
      );
      continue;
    }
    const usable = candidates.filter((p) => p.active !== false && p.recurring);
    if (usable.length === 0) {
      problems.push(
        `${tier}: product resolves but has no active recurring price (found ${candidates.length} price(s), none usable)`,
      );
      continue;
    }
    const expectedAmount = PLAN_PRICING[tier].amount * 100;
    const amountMatches = usable.filter((p) => p.unit_amount === expectedAmount);
    if (amountMatches.length === 0) {
      const seen = usable.map((p) => p.unit_amount).join(", ");
      problems.push(
        `${tier}: no active recurring price matches the site's ${PLAN_PRICING[tier].display} (expected unit_amount ${expectedAmount}, found: ${seen})`,
      );
      continue;
    }
    // If the site advertises a free trial for this tier, the live price must
    // still carry it — otherwise buyers get charged immediately while the site
    // promises a trial (trust/compliance problem the amount check won't catch).
    const plan = PLAN_PRICING[tier] as { trialDays?: number };
    const expectedTrial = plan.trialDays;
    if (
      expectedTrial &&
      !amountMatches.some((p) => p.recurring?.trial_period_days === expectedTrial)
    ) {
      const seenTrials = amountMatches
        .map((p) => p.recurring?.trial_period_days ?? "none")
        .join(", ");
      problems.push(
        `${tier}: price amount matches but the advertised ${expectedTrial}-day free trial is missing (expected trial_period_days ${expectedTrial}, found: ${seenTrials}) — buyers would be charged immediately`,
      );
    }
  }
  return problems;
}

async function checkProducts(): Promise<void> {
  // Verify the live Stripe catalog still matches the site's plan tiers:
  // each PLAN_PRICING tier must resolve (via product metadata.tier) to an
  // active recurring price with the advertised amount. If a product is
  // renamed/archived or loses its tier metadata, the signup modal disables
  // checkout for that tier — this check tells the owner why, loudly.
  const stripe = await getUncachableStripeClient();
  const prices = await stripe.prices.list({
    active: true,
    limit: 100,
    expand: ["data.product"],
  });
  const problems = findTierPriceProblems((prices.data ?? []) as TierPriceCandidate[]);
  if (problems.length > 0) {
    throw new Error(`Stripe plan-tier mismatch — ${problems.join("; ")}`);
  }
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
 * credential checks AND by event-driven reporters like the pricing monitor.
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
 * Event-driven blog-SSR monitor, reported from the GET /blog/:slug handler
 * (server/blogSlugRoute.ts): `ok=false` when storage threw and the route
 * degraded to the SPA shell — visitors still get a page, but crawlers are
 * silently served thin client-side HTML for every AI-published post while
 * the outage lasts; `ok=true` when a published DB post was served as full
 * crawler HTML. Uses the same healthy→broken transition + alert chain
 * (email → sheet fallback) as the periodic checks, so the owner is alerted
 * once per outage and recovery resets the state.
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
    await checkService("products", checkProducts);
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
  console.log("[credential-check] Enabled — verifying Stripe, Gmail & Sheets credentials plus Stripe plan-tier prices at boot and hourly");
  setTimeout(() => void runCredentialHealthCheck(), BOOT_DELAY_MS);
  setInterval(() => void runCredentialHealthCheck(), CHECK_INTERVAL_MS).unref();
}
