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
 *
 * SSRF screening: the URLs checked here come from Exa results filtered through
 * an LLM, so they are attacker-influenced input. Before any fetch we reject
 * non-public destinations — every reserved IPv4 range (including 169.254/16,
 * the cloud metadata service), non-global IPv6 (loopback, link-local,
 * site-local, unique-local, documentation, Teredo/6to4/NAT64 forms that embed
 * IPv4), and any hostname that DNS-resolves to a non-public address. Redirects
 * are followed manually (capped, each hop re-screened) so a public URL cannot
 * bounce the checker into an internal endpoint. The connection itself is
 * pinned the same way: requests go through an undici Agent whose lookup hook
 * (publicDnsLookup) returns only public addresses to the transport, so a
 * DNS-rebinding answer — public to the preflight, private to the connection —
 * fails closed at connect time.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";

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
  /**
   * Injectable DNS resolver for tests. On the real network path (no fetchImpl)
   * this defaults to the system resolver; when a fetchImpl is injected without
   * a lookupImpl, DNS screening is skipped so existing offline tests stay
   * offline.
   */
  lookupImpl?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CONCURRENCY = 4;
/** Redirects are legitimate (doi.org!) but bounded; each hop is re-screened. */
const MAX_REDIRECTS = 5;

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

/** True when the host is an IP literal (v4 dotted quad or v6, brackets ok). */
function isIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return parseIpv4(h) !== null || h.includes(":");
}

function parseIpv4(h: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/**
 * True only for globally routable addresses. Rejects every non-public range:
 * IPv4 loopback/RFC-1918/link-local (incl. 169.254.169.254, the cloud metadata
 * service), CGNAT, benchmark, documentation and multicast/reserved blocks;
 * IPv4-mapped IPv6 forms. IPv6 is default-deny: only 2000::/3 (global unicast)
 * passes, minus the IETF special-purpose blocks inside it (2001::/23, the two
 * documentation ranges, 6to4 which embeds IPv4, and domain-scoped SRv6). Every
 * other IPv6 range — loopback, link-local, site-local, ULA, multicast, NAT64,
 * discard — falls outside 2000::/3 and is rejected automatically. Hostnames
 * return true here — they are vetted by DNS resolution instead (screenDns).
 */
export function isPublicIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  const v4 = parseIpv4(mapped ? mapped[1] : h);
  if (v4) {
    const [a, b, c] = v4;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // RFC 1918
    if (a === 192 && b === 0 && c === 0) return false; // IETF protocol assignments
    if (a === 192 && b === 168) return false; // RFC 1918
    if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
    if (a === 192 && b === 0 && c === 2) return false; // TEST-NET-1
    if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
    if (a >= 224) return false; // multicast + reserved
    return true;
  }
  if (h.includes(":")) {
    const words = h.split(":");
    const first = parseInt(words[0] || "0", 16);
    const second = parseInt(words[1] || "0", 16);
    // Default-deny: 2000::/3 is the only global-unicast allocation. Loopback,
    // link-local, site-local, ULA, multicast, NAT64 (0064), discard (0100) and
    // every reserved range all fall outside it.
    if ((first & 0xe000) !== 0x2000) return false;
    // Exceptions inside 2000::/3 that are still not globally routable:
    if (first === 0x2001 && second < 0x0200) return false; // 2001::/23 IETF special-purpose (Teredo embeds IPv4, benchmarking, …)
    if (first === 0x2001 && second === 0x0db8) return false; // 2001:db8::/32 documentation
    if (first === 0x2002) return false; // 6to4 embeds IPv4
    if (first === 0x3fff && (second & 0xf000) === 0) return false; // 3fff::/20 documentation
    if (first === 0x5f00) return false; // 5f00::/16 SRv6 SID (already outside 2000::/3; kept for clarity)
    return true;
  }
  return true;
}

/**
 * Resolve a hostname and reject it if ANY answer is non-public. DNS failures
 * and empty answers are transient ("unreachable"), never blocking. Literal IPs
 * were already screened offline, so only names are resolved.
 */
async function screenDns(
  url: string,
  lookup: LinkCheckOptions["lookupImpl"],
  reportUrl = url,
): Promise<LinkCheckResult | null> {
  if (!lookup) return null;
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }
  if (isIpLiteral(hostname)) return null;
  try {
    const addrs = await lookup(hostname);
    if (addrs.length === 0) {
      return {
        url: reportUrl,
        verdict: "unreachable",
        status: null,
        reason: `"${hostname}" resolved to no addresses (transient, not blocking)`,
      };
    }
    if (addrs.some((a) => !isPublicIp(a.address))) {
      return {
        url: reportUrl,
        verdict: "forbidden-host",
        status: null,
        reason: `"${hostname}" resolves to a non-public address and must not be fetched or published`,
      };
    }
    return null;
  } catch {
    return {
      url: reportUrl,
      verdict: "unreachable",
      status: null,
      reason: `DNS lookup for "${hostname}" failed (transient, not blocking)`,
    };
  }
}

/**
 * Connection-time DNS gate for the real network path. Passed to the undici
 * Agent as its `connect.lookup` hook, so the address the transport dials is
 * filtered here: a DNS answer that is non-public (or a rebinding flip after a
 * clean preflight) fails closed before any socket opens. The optional fourth
 * parameter is a test seam — undici always calls with three arguments.
 */
export function publicDnsLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (
    err: Error | null,
    address?: string | Array<{ address: string; family: number }>,
    family?: number,
  ) => void,
  resolveImpl: (h: string) => Promise<Array<{ address: string; family: number }>> = (h) =>
    dnsLookup(h, { all: true, verbatim: true }),
): void {
  resolveImpl(hostname).then(
    (addrs) => {
      const publicAddrs = addrs.filter((a) => isPublicIp(a.address));
      if (publicAddrs.length === 0) {
        const err: NodeJS.ErrnoException = new Error(
          `"${hostname}" resolves only to non-public addresses — connection refused by SSRF guard`,
        );
        err.code = "ENOTFOUND";
        callback(err);
        return;
      }
      if (options.all) callback(null, publicAddrs);
      else callback(null, publicAddrs[0].address, publicAddrs[0].family);
    },
    (err: Error) => callback(err),
  );
}

/** Real-network fetch: undici with the SSRF-guarded dispatcher. */
const ssrfAgent = new Agent({
  connect: { lookup: publicDnsLookup as unknown as import("node:net").LookupFunction },
});
const defaultFetch: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  undiciFetch(input as never, { ...(init as object), dispatcher: ssrfAgent } as never) as unknown as Promise<Response>) as typeof fetch;

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
  if (isIpLiteral(host) && !isPublicIp(host)) {
    return {
      url,
      verdict: "forbidden-host",
      status: null,
      reason: `"${host}" is a non-public IP address and must not be published`,
    };
  }
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
  const doFetch = opts.fetchImpl ?? defaultFetch;
  // DNS screening runs on the real network path. Tests that inject fetchImpl
  // without lookupImpl stay fully offline, matching the pre-existing contract.
  const lookup =
    opts.lookupImpl ??
    (opts.fetchImpl
      ? undefined
      : (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true }));

  const dnsBlock = await screenDns(url, lookup);
  if (dnsBlock) return dnsBlock;

  // Some CDNs 405 a HEAD but serve GET fine, so fall back rather than trusting
  // the first answer.
  for (const method of ["HEAD", "GET"] as const) {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch(current, {
          method,
          // Manual: every redirect hop is re-screened (host patterns, IP
          // literals, DNS) before we follow it, so a public URL cannot bounce
          // the checker into an internal/metadata endpoint.
          redirect: "manual",
          signal: controller.signal,
          headers: {
            // Identify honestly, but as a browser-ish client: a bare fetch UA is
            // refused by several publishers we legitimately cite.
            "User-Agent":
              "Mozilla/5.0 (compatible; RxFitLinkCheck/1.0; +https://rxfit.ai)",
            Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          },
        });
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
        break; // HEAD threw — fall through and try GET.
      }
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (hop === MAX_REDIRECTS) {
          return {
            url,
            verdict: "unreachable",
            status: res.status,
            reason: `more than ${MAX_REDIRECTS} redirects (transient, not blocking)`,
          };
        }
        let next: string;
        try {
          next = new URL(res.headers.get("location") as string, current).toString();
        } catch {
          return {
            url,
            verdict: "unreachable",
            status: res.status,
            reason: "redirect Location is not a parseable URL (transient, not blocking)",
          };
        }
        const hopScreen = screenUrl(next);
        if (hopScreen) {
          return {
            url,
            verdict: hopScreen.verdict,
            status: res.status,
            reason: `redirects to ${next}: ${hopScreen.reason}`,
          };
        }
        const hopDns = await screenDns(next, lookup, url);
        if (hopDns) return hopDns;
        current = next;
        continue;
      }

      if (res.status === 404 || res.status === 410) {
        return { url, verdict: "broken", status: res.status, reason: `target returned ${res.status}` };
      }
      if (res.status === 405 && method === "HEAD") {
        break; // retry as GET
      }
      if (res.status >= 500) {
        return {
          url,
          verdict: "unreachable",
          status: res.status,
          reason: `target returned ${res.status} (transient, not blocking)`,
        };
      }
      // 2xx, followed 3xx finals, and 401/403/406/429 bot-blocking all pass.
      return {
        url,
        verdict: "ok",
        status: res.status,
        reason:
          res.status >= 400
            ? `returned ${res.status} — treated as bot-blocking, not a dead link`
            : `returned ${res.status}`,
      };
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
