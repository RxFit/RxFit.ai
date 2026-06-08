const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
type UtmKey = (typeof UTM_KEYS)[number];
export type UtmParams = Partial<Record<UtmKey, string>>;

const STORAGE_KEY = "rxfit_utm";

function readSession(): UtmParams {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmParams) : {};
  } catch {
    return {};
  }
}

function writeSession(params: UtmParams) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    /* ignore */
  }
}

/**
 * Returns the stored UTM params, capturing any present in the current URL
 * (first-touch wins, then persisted in sessionStorage for the rest of the visit).
 */
export function getStoredUtm(): UtmParams {
  const stored = readSession();
  if (typeof window === "undefined") return stored;

  const url = new URLSearchParams(window.location.search);
  let updated = false;
  const merged: UtmParams = { ...stored };
  for (const key of UTM_KEYS) {
    const value = url.get(key);
    if (value && !merged[key]) {
      merged[key] = value;
      updated = true;
    }
  }
  if (updated) writeSession(merged);
  return merged;
}

/** Appends stored UTM params (plus a content slug) to an outbound URL. */
export function appendUtm(url: string, slug?: string): string {
  const utm = getStoredUtm();
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://rxfit.ai");
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", utm.utm_source || "rxfit_blog");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", utm.utm_medium || "referral");
    if (utm.utm_campaign && !u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", utm.utm_campaign);
    if (slug && !u.searchParams.has("utm_content")) u.searchParams.set("utm_content", slug);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Compact attribution string passed to Stripe as `client_reference_id`.
 * Format: `slug|source|medium|campaign` (empty segments preserved for parsing).
 */
export function getClientReferenceId(slug?: string): string {
  const utm = getStoredUtm();
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const contentSlug = slug || (path.startsWith("/blog/") ? path.replace("/blog/", "") : path || "/");
  const parts = [
    contentSlug,
    utm.utm_source || "direct",
    utm.utm_medium || "none",
    utm.utm_campaign || "none",
  ];
  return parts.join("|").slice(0, 200);
}
