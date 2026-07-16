/**
 * Google Search Console client for the SEO feedback loop.
 *
 * Auth: a Google service account (JSON key in the GSC_SERVICE_ACCOUNT_JSON
 * secret) that the owner has added as a user on the rxfit.ai property in
 * Search Console. Fails loudly when the secret is missing or the API errors —
 * callers send a failure email and rethrow, mirroring the blog pipeline.
 *
 * Property defaults to the domain property `sc-domain:rxfit.ai`; override
 * with the GSC_SITE_URL env var (e.g. "https://rxfit.ai/").
 */
import { google } from "googleapis";
import { SITE_URL } from "@shared/site";

export interface GscRow {
  /** Site-relative page path, e.g. /blog/some-slug */
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  /** Fraction 0-1 */
  ctr: number;
  /** Average position (1 = top) */
  position: number;
}

export function isGscConfigured(): boolean {
  return !!process.env.GSC_SERVICE_ACCOUNT_JSON;
}

function getSiteUrl(): string {
  return process.env.GSC_SITE_URL || "sc-domain:rxfit.ai";
}

function getAuth() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GSC_SERVICE_ACCOUNT_JSON is not set — add the Search Console service-account key as a secret and grant it access to the rxfit.ai property.",
    );
  }
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON is not valid JSON (paste the full service-account key file)");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GSC_SERVICE_ACCOUNT_JSON is missing client_email/private_key fields");
  }
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
}

/** Strip the origin so stored pages are site-relative paths. */
export function toRelativePage(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url;
  }
}

/**
 * Pull the last `days` days of page+query performance data.
 * GSC data lags ~2 days, so the window ends 2 days ago.
 */
export async function fetchSearchAnalytics(days = 28): Promise<GscRow[]> {
  const auth = getAuth();
  const searchconsole = google.searchconsole({ version: "v1", auth });

  const end = new Date();
  end.setDate(end.getDate() - 2);
  const start = new Date(end);
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await searchconsole.searchanalytics.query({
    siteUrl: getSiteUrl(),
    requestBody: {
      startDate: fmt(start),
      endDate: fmt(end),
      dimensions: ["page", "query"],
      rowLimit: 5000,
      dataState: "final",
    },
  });

  const rows = res.data.rows ?? [];
  return rows
    .filter((r) => r.keys && r.keys.length === 2)
    .map((r) => ({
      page: toRelativePage(r.keys![0]),
      query: r.keys![1],
      clicks: Math.round(r.clicks ?? 0),
      impressions: Math.round(r.impressions ?? 0),
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
}

/** SITE_URL is exported for consumers building absolute page URLs. */
export { SITE_URL };
