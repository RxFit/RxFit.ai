/**
 * Guards the outbound-link validator against the two failures that actually
 * reached production (see linkHealth.ts): a 404'd cdc.gov citation and a
 * `preview-www.nature.com` staging hostname.
 *
 * The bot-blocking cases matter as much as the broken ones — every publisher
 * cited on this blog (nature.com, link.springer.com, gsb.stanford.edu,
 * preprints.org) refuses automated clients with 403/406, and a validator that
 * flags those as dead links would block correct citations and get disabled.
 */
import { describe, it, expect } from "vitest";
import {
  extractExternalLinks,
  screenUrl,
  isPublicIp,
  publicDnsLookup,
  checkLink,
  checkExternalLinks,
  linkHealthErrors,
  linkHealthWarnings,
  type LinkCheckResult,
} from "./linkHealth";

/** Build a fetch stub that answers by URL substring. */
function stubFetch(routes: Record<string, number | "timeout" | "network-error">) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const hit = Object.keys(routes).find((k) => url.includes(k));
    const outcome = hit ? routes[hit] : 200;

    if (outcome === "timeout") {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
    if (outcome === "network-error") throw new Error("getaddrinfo ENOTFOUND");
    return new Response(null, { status: outcome });
  }) as unknown as typeof fetch;
}

describe("extractExternalLinks", () => {
  it("finds markdown links and <Stat source> props, and ignores internal links", () => {
    const md = [
      "See [the study](https://example.com/study) for detail.",
      'Also [our guide](/blog/how-to-read-your-hrv) is internal.',
      '<Stat value="30–40%" label="swing" source="https://pmc.ncbi.nlm.nih.gov/articles/PMC12300306/" />',
      "![hero](/blog-heroes/x.webp)",
    ].join("\n\n");

    expect(extractExternalLinks(md).sort()).toEqual([
      "https://example.com/study",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC12300306/",
    ]);
  });

  it("de-duplicates repeated URLs", () => {
    const md = "[a](https://example.com/x) and [b](https://example.com/x)";
    expect(extractExternalLinks(md)).toEqual(["https://example.com/x"]);
  });

  it("returns nothing for a body with no external links", () => {
    expect(extractExternalLinks("Just [internal](/compare) copy.")).toEqual([]);
  });
});

describe("screenUrl — offline host and scheme screening", () => {
  it("rejects the exact staging hostname that shipped to production", () => {
    const r = screenUrl("https://preview-www.nature.com/articles/s41598-026-42405-2");
    expect(r?.verdict).toBe("forbidden-host");
    expect(r?.reason).toContain("preview-www.nature.com");
  });

  it("rejects other staging and internal hostnames", () => {
    for (const url of [
      "https://staging.example.com/a",
      "https://dev.example.com/a",
      "http://localhost:5000/a",
      "http://127.0.0.1/a",
      "https://api.internal/a",
      "https://box.local/a",
    ]) {
      expect(screenUrl(url)?.verdict, url).toBe("forbidden-host");
    }
  });

  it("allows the real published hostnames", () => {
    for (const url of [
      "https://www.nature.com/articles/s41598-026-42405-2",
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC12300306/",
      "https://www.health.harvard.edu/exercise-and-fitness/what-can-you-do-to-maintain-exercise-motivation",
      "https://doi.org/10.20944/preprints202606.0644.v1",
    ]) {
      expect(screenUrl(url), url).toBeNull();
    }
  });

  it("rejects disallowed schemes and unparseable URLs", () => {
    expect(screenUrl("javascript:alert(1)")?.verdict).toBe("invalid");
    expect(screenUrl("not a url")?.verdict).toBe("invalid");
  });

  it("screens without any network call", async () => {
    const never = (() => {
      throw new Error("network must not be touched");
    }) as unknown as typeof fetch;
    const r = await checkLink("https://preview-www.nature.com/x", { fetchImpl: never });
    expect(r.verdict).toBe("forbidden-host");
  });
});

describe("checkLink — status grading", () => {
  it("treats 404 and 410 as broken", async () => {
    for (const status of [404, 410]) {
      const r = await checkLink("https://example.com/gone", {
        fetchImpl: stubFetch({ "example.com": status }),
      });
      expect(r.verdict).toBe("broken");
      expect(r.status).toBe(status);
    }
  });

  it("does NOT treat publisher bot-blocking as broken", async () => {
    // Observed in the audit: nature.com 406, springer 406, stanford 403,
    // preprints.org 403, cdc.gov 403 to non-browser agents.
    for (const status of [401, 403, 406, 429]) {
      const r = await checkLink("https://www.nature.com/articles/x", {
        fetchImpl: stubFetch({ "nature.com": status }),
      });
      expect(r.verdict, `status ${status}`).toBe("ok");
      expect(r.reason).toContain("bot-blocking");
    }
  });

  it("treats 5xx as transient rather than blocking", async () => {
    const r = await checkLink("https://example.com/x", {
      fetchImpl: stubFetch({ "example.com": 503 }),
    });
    expect(r.verdict).toBe("unreachable");
  });

  it("treats timeouts and DNS failures as transient", async () => {
    const t = await checkLink("https://slow.example.com/x", {
      fetchImpl: stubFetch({ "slow.example.com": "timeout" }),
      timeoutMs: 10,
    });
    expect(t.verdict).toBe("unreachable");

    const d = await checkLink("https://nope.example.com/x", {
      fetchImpl: stubFetch({ "nope.example.com": "network-error" }),
    });
    expect(d.verdict).toBe("unreachable");
  });

  it("falls back to GET when HEAD is refused with 405", async () => {
    const seen: string[] = [];
    const impl = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push(init?.method ?? "GET");
      return new Response(null, { status: init?.method === "HEAD" ? 405 : 200 });
    }) as unknown as typeof fetch;

    const r = await checkLink("https://example.com/x", { fetchImpl: impl });
    expect(seen).toEqual(["HEAD", "GET"]);
    expect(r.verdict).toBe("ok");
    expect(r.status).toBe(200);
  });

  it("never throws, whatever fetch does", async () => {
    const explode = (() => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(checkLink("https://example.com/x", { fetchImpl: explode })).resolves.toMatchObject({
      verdict: "unreachable",
    });
  });
});

describe("checkExternalLinks", () => {
  it("checks every link in a body", async () => {
    const md = [
      "[good](https://good.example.com/a)",
      "[dead](https://dead.example.com/b)",
      '<Stat value="1" label="x" source="https://preview-www.nature.com/c" />',
    ].join("\n\n");

    const results = await checkExternalLinks(md, {
      fetchImpl: stubFetch({ "good.example.com": 200, "dead.example.com": 404 }),
      concurrency: 2,
    });

    expect(results).toHaveLength(3);
    const byUrl = Object.fromEntries(results.map((r) => [r.url, r.verdict]));
    expect(byUrl["https://good.example.com/a"]).toBe("ok");
    expect(byUrl["https://dead.example.com/b"]).toBe("broken");
    expect(byUrl["https://preview-www.nature.com/c"]).toBe("forbidden-host");
  });

  it("returns an empty list when there is nothing to check", async () => {
    const never = (() => {
      throw new Error("network must not be touched");
    }) as unknown as typeof fetch;
    await expect(checkExternalLinks("no links here", { fetchImpl: never })).resolves.toEqual([]);
  });
});

describe("error and warning partitioning", () => {
  const results: LinkCheckResult[] = [
    { url: "https://a/", verdict: "ok", status: 200, reason: "returned 200" },
    { url: "https://b/", verdict: "broken", status: 404, reason: "target returned 404" },
    { url: "https://preview-www.c/", verdict: "forbidden-host", status: null, reason: "staging" },
    { url: "https://d/", verdict: "unreachable", status: 503, reason: "transient" },
    { url: "javascript:x", verdict: "invalid", status: null, reason: "disallowed scheme" },
  ];

  it("blocks only on broken, forbidden-host and invalid", () => {
    const errors = linkHealthErrors(results);
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toContain("https://b/");
    expect(errors.join("\n")).toContain("https://preview-www.c/");
    expect(errors.join("\n")).toContain("javascript:x");
  });

  it("does not block on transient failures — a slow publisher must not stop a publish", () => {
    expect(linkHealthErrors(results).join("\n")).not.toContain("https://d/");
    expect(linkHealthWarnings(results)).toHaveLength(1);
    expect(linkHealthWarnings(results)[0]).toContain("https://d/");
  });
});

describe("SSRF screening — non-public destinations must never be fetched", () => {
  it("rejects every non-public IP literal offline, including cloud metadata", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/a",
      "http://172.31.255.255/a",
      "http://100.64.0.1/a",
      "http://0.0.0.0/a",
      "http://192.0.2.1/a",
      "http://198.51.100.7/a",
      "http://203.0.113.9/a",
      "http://224.0.0.1/a",
      "http://[::1]/a",
      "http://[fe80::1]/a",
      "http://[fec0::1]/a",
      "http://[fd00::1]/a",
      "http://[2001:db8::1]/a",
      "http://[2002::1]/a",
      "http://[100::1]/a",
      "http://[5f00::1]/a",
      "http://[3fff::1]/a",
      "http://[::ffff:127.0.0.1]/a",
      "http://[::ffff:a9fe:a9fe]/a",
    ]) {
      const r = screenUrl(url);
      expect(r?.verdict, url).toBe("forbidden-host");
    }
  });

  it("isPublicIp accepts real public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "104.18.32.47", "2606:4700::6810:84e5", "2001:4860:4860::8888"]) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
    for (const ip of [
      "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254",
      "::1", "::", "fec0::1", "2001:db8::1", "2002::1", "100::1",
      "5f00::1", "3fff::1",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });

  it("rejects exactly 3fff::/20, not its neighbours (boundary check)", () => {
    expect(isPublicIp("3fff:0fff::1")).toBe(false); // inside /20
    expect(isPublicIp("3fff::1")).toBe(false); // /20 base
    expect(isPublicIp("3fff:1000::1")).toBe(true); // just outside /20
    expect(isPublicIp("3ffe:ffff::1")).toBe(true); // just before 3fff::
  });

  it("blocks a hostname that DNS-resolves to a private address, before any fetch", async () => {
    const never = (() => {
      throw new Error("network must not be touched");
    }) as unknown as typeof fetch;
    const r = await checkLink("https://sneaky.example.com/x", {
      fetchImpl: never,
      lookupImpl: async () => [{ address: "169.254.169.254", family: 4 }],
    });
    expect(r.verdict).toBe("forbidden-host");
    expect(r.reason).toContain("sneaky.example.com");
  });

  it("blocks when ANY resolved address is non-public", async () => {
    const never = (() => {
      throw new Error("network must not be touched");
    }) as unknown as typeof fetch;
    const r = await checkLink("https://mixed.example.com/x", {
      fetchImpl: never,
      lookupImpl: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.7", family: 4 },
      ],
    });
    expect(r.verdict).toBe("forbidden-host");
  });

  it("treats DNS failure as transient, never blocking", async () => {
    const r = await checkLink("https://flaky.example.com/x", {
      fetchImpl: stubFetch({ "flaky.example.com": 200 }),
      lookupImpl: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(r.verdict).toBe("unreachable");
  });

  it("fetches normally when DNS resolves to public addresses", async () => {
    const r = await checkLink("https://example.com/x", {
      fetchImpl: stubFetch({ "example.com": 200 }),
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(r.verdict).toBe("ok");
  });

  it("follows a public→public redirect chain (the doi.org pattern)", async () => {
    const seen: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      const u = typeof input === "string" ? input : input.toString();
      seen.push(u);
      if (u.includes("doi.org")) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://www.nature.com/articles/s41598-026-42405-2" },
        });
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const r = await checkLink("https://doi.org/10.1038/x", { fetchImpl: impl });
    expect(r.verdict).toBe("ok");
    expect(r.status).toBe(200);
    expect(seen).toEqual([
      "https://doi.org/10.1038/x",
      "https://www.nature.com/articles/s41598-026-42405-2",
    ]);
  });

  it("blocks a public URL that redirects to a private or metadata endpoint", async () => {
    const seen: string[] = [];
    const impl = (async (input: string | URL | Request) => {
      seen.push(typeof input === "string" ? input : input.toString());
      return new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      });
    }) as unknown as typeof fetch;

    const r = await checkLink("https://evil.example.com/a", { fetchImpl: impl });
    expect(r.verdict).toBe("forbidden-host");
    expect(r.reason).toContain("redirects to");
    expect(seen).toEqual(["https://evil.example.com/a"]); // hop never fetched
  });

  it("blocks a redirect to a disallowed scheme", async () => {
    const impl = (async () =>
      new Response(null, { status: 302, headers: { location: "file:///etc/passwd" } }),
    ) as unknown as typeof fetch;
    const r = await checkLink("https://evil.example.com/a", { fetchImpl: impl });
    expect(r.verdict).toBe("invalid");
  });

  it("gives up (non-blocking) on an endless redirect loop", async () => {
    const impl = (async (input: string | URL | Request) => {
      const u = typeof input === "string" ? input : input.toString();
      return new Response(null, { status: 302, headers: { location: `${u}?hop` } });
    }) as unknown as typeof fetch;
    const r = await checkLink("https://loop.example.com/a", { fetchImpl: impl });
    expect(r.verdict).toBe("unreachable");
    expect(linkHealthErrors([r])).toEqual([]);
  });
});

describe("publicDnsLookup — the address the transport dials is vetted", () => {
  it("refuses the connection when resolution yields only non-public addresses", async () => {
    const err: Error = await new Promise((resolve) => {
      publicDnsLookup(
        "rebind.example",
        {},
        (e) => resolve(e ?? new Error("unexpected success")),
        async () => [{ address: "169.254.169.254", family: 4 }],
      );
    });
    expect(err.message).toContain("non-public");
    expect((err as NodeJS.ErrnoException).code).toBe("ENOTFOUND");
  });

  it("strips non-public answers from a mixed response", async () => {
    const addrs = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
      publicDnsLookup(
        "mixed.example",
        { all: true },
        (e, a) => (e ? reject(e) : resolve(a as Array<{ address: string; family: number }>)),
        async () => [
          { address: "10.0.0.7", family: 4 },
          { address: "8.8.8.8", family: 4 },
        ],
      );
    });
    expect(addrs).toEqual([{ address: "8.8.8.8", family: 4 }]);
  });

  it("returns a public answer in the single-address form", async () => {
    const got = await new Promise<{ address: string; family: number }>((resolve, reject) => {
      publicDnsLookup(
        "example.com",
        {},
        (e, a, f) => (e ? reject(e) : resolve({ address: a as string, family: f as number })),
        async () => [{ address: "93.184.216.34", family: 4 }],
      );
    });
    expect(got).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("propagates resolver errors to the transport", async () => {
    const err: Error = await new Promise((resolve) => {
      publicDnsLookup(
        "down.example",
        {},
        (e) => resolve(e as Error),
        async () => {
          throw new Error("ENOTFOUND");
        },
      );
    });
    expect(err.message).toContain("ENOTFOUND");
  });
});
