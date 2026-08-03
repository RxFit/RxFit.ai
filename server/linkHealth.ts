/**
 * Outbound link health checks for generated blog posts.
 *
 * The 2026-08-02 Ahrefs audit surfaced two distinct failures that reached
 * production because nothing verified external citations before publish:
 *
 *   1. A cdc.gov URL that 404s (CDC reorganised their site).
 *   2. A `preview-www.nature.com` URL — a Springer Nature *staging* hostname
 *      that leaked out of Exa results, through the LLM, and into a published
 *      post. It 303s to an auth handshake for anyone who isn't Springer.
 *
 * Those two need very different treatment, which is why this module grades
 * links rather than just pinging them.
 *
 * The grading policy is deliberately forgiving about status codes, because
 * scholarly publishers routinely block automated clients. Measured against the
 * real citations on this blog: nature.com and link.springer.com return 406,
 * gsb.stanford.edu returns 403, preprints.org returns 403, and cdc.gov returns
 * 403 to some user agents while serving browsers normally. Treating any of
 * those as "broken" would block correct, working citations — a validator that
 * cries wolf gets switched off. So only unambiguous evidence of a dead target
 * (404/410) hard-fails.
 *
 * Redirects are likewise not failures. A doi.org link 302s *by design* — that
 * is the entire point of a persistent identifier — and every nature.com article
 * URL bounces through idp.nature.com to set a cookie before returning 200.
 *
 * Host checks, by contrast, are offline, deterministic and absolute: a staging
 * hostname is never correct in published content regardless of what it returns
 * today, so it fails without a network call.
 */

/** Verdicts, ordered roughly by severity. */
export type LinkVerdict =
  /** Reachable, or blocked in a way that does not imply the target is missing. */
  | "ok"
  /** Hostname is never publishable (staging, preview, loopback, internal). */
  | "forbidden-host"
  /** Target is definitively gone (404/410). */
  | "broken"
  /** Malformed, or a scheme we refuse to publish. */
  | "invalid"
  /** Transient: 5xx, timeout, DNS failure. Warn, never block. */
  | "unreachable";

export interface LinkCheckResult {
  url: string;
  verdict: LinkVerdict;
  status: number | null;
  reason: string;
}

export interface LinkCheckOptions {
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Max links checked concurrently. */
  concurrency?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 4;

/**
 * Hostnames that must never appear in published content, matched against the
 * full hostname. `preview-www.nature.com` is the case that actually shipped;
 * the rest close off the same class of mistake.
 */
const FORBIDDEN_HOST_PATTERNS: RegExp[] = [
  /^preview[-.]/i,
  /^(staging|stage|dev|test|qa|uat|sandbox)\./i,
  /[-.](staging|preview)\.[^.]+\.[^.]+$/i,
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^192\.168\./,
  /^10\./,
];

/** Schemes we are willing to publish. */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Extract external (absolute http/https) link targets from markdown, including
 * both `[text](url)` links and the `source="url"` prop on <Stat> components,
 * which is where both audit failures lived.
 */
export function extractExternalLinks(markdown: string): string[] {
  const found = new Set<string>();

  for (const m of Array.from(markdown.matchAll(/\]\(\s*<?([^)\s>]+)/g))) {
    const url = m[1].trim();
    if (/^https?:\/\//i.test(url)) found.add(url);
  }

  // <Stat ... source="https://..." /> and any other quoted source= prop.
  for (const m of Array.from(markdown.matchAll(/\bsource=["']([^"']+)["']/g))) {
    const url = m[1].trim();
    if (/^https?:\/\//i.test(url)) found.add(url);
  }

  return Array.from(found);
}

/**
 * Offline check: is this URL structurally publishable? Catches staging hosts
 * and bad schemes without touching the network, so it stays reliable even when
 * the checker runs somewhere with no outbound access.
 */
export function screenUrl(url: string): LinkCheckResult | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { url, verdict: "invalid", status: null, reason: "not a parseable URL" };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      url,
      verdict: "invalid",
      status: null,
      reason: `disallowed URL scheme "${parsed.protocol}"`,
    };
  }

  const host = parsed.hostname;
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(host)) {
      return {
        url,
        verdict: "forbidden-host",
        status: null,
        reason: `"${host}" looks like a staging/internal hostname and must not be published`,
      };
    }
  }

  return null;
}

/**
 * Check a single URL. Never throws — every failure mode is folded into a
 * verdict so one bad link cannot take down a publish run.
 */
export async function checkLink(
  url: string,
  opts: LinkCheckOptions = {},
): Promise<LinkCheckResult> {
  const screened = screenUrl(url);
  if (screened) return screened;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = opts.fetchImpl ?? fetch;

  // Some CDNs 405 a HEAD but serve GET fine, so fall back rather than trusting
  // the first answer.
  for (const method of ["HEAD", "GET"] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          // Identify honestly, but as a browser-ish client: a bare fetch UA is
          // refused by several publishers we legitimately cite.
          "User-Agent":
            "Mozilla/5.0 (compatible; RxFitLinkCheck/1.0; +https://rxfit.ai)",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      });
      clearTimeout(timer);

      if (res.status === 404 || res.status === 410) {
        return { url, verdict: "broken", status: res.status, reason: `target returned ${res.status}` };
      }
      if (res.status === 405 && method === "HEAD") {
        continue; // retry as GET
      }
      if (res.status >= 500) {
        return {
          url,
          verdict: "unreachable",
          status: res.status,
          reason: `target returned ${res.status} (transient, not blocking)`,
        };
      }
      // 2xx, 3xx already followed, and 401/403/406/429 bot-blocking all pass.
      return {
        url,
        verdict: "ok",
        status: res.status,
        reason:
          res.status >= 400
            ? `returned ${res.status} — treated as bot-blocking, not a dead link`
            : `returned ${res.status}`,
      };
    } catch (err) {
      clearTimeout(timer);
      if (method === "GET") {
        const aborted = err instanceof Error && err.name === "AbortError";
        return {
          url,
          verdict: "unreachable",
          status: null,
          reason: aborted
            ? `no response within ${timeoutMs}ms (transient, not blocking)`
            : `request failed: ${err instanceof Error ? err.message : String(err)} (transient, not blocking)`,
        };
      }
      // HEAD threw — fall through and try GET.
    }
  }

  return { url, verdict: "unreachable", status: null, reason: "no response (transient, not blocking)" };
}

/** Check every external link in a markdown body, with bounded concurrency. */
export async function checkExternalLinks(
  markdown: string,
  opts: LinkCheckOptions = {},
): Promise<LinkCheckResult[]> {
  const urls = extractExternalLinks(markdown);
  if (urls.length === 0) return [];

  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const results: LinkCheckResult[] = new Array(urls.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < urls.length) {
      const i = cursor++;
      results[i] = await checkLink(urls[i], opts);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

/**
 * Reduce results to blocking errors, in the shape validateDraft uses so they
 * can be fed back to the LLM as retry feedback.
 *
 * Only `forbidden-host`, `broken` and `invalid` block. `unreachable` is
 * deliberately excluded — a slow or briefly-down publisher must not stop a
 * correct post from going out.
 */
export function linkHealthErrors(results: LinkCheckResult[]): string[] {
  return results
    .filter((r) => r.verdict === "forbidden-host" || r.verdict === "broken" || r.verdict === "invalid")
    .map((r) => `external link ${r.url} — ${r.reason}`);
}

/** Non-blocking results worth logging. */
export function linkHealthWarnings(results: LinkCheckResult[]): string[] {
  return results
    .filter((r) => r.verdict === "unreachable")
    .map((r) => `external link ${r.url} — ${r.reason}`);
}
