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
