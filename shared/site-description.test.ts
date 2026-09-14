/**
 * Drift guard for the site's one-line positioning sentence (SITE_DESCRIPTION
 * in shared/site.ts). It is the `description` of every Organization/WebSite
 * JSON-LD block the site emits; before it was extracted, the sentence was
 * duplicated as a literal in server/blogSsr.ts (4x) and client/src/lib/seo.tsx
 * (2x), so a copy change could silently leave stale structured data on some
 * pages. These tests fail the build (npm test runs inside npm run build) if:
 *  - either emitter re-inlines the sentence instead of using the constant,
 *  - an emitter stops wiring the constant into its description fields,
 *  - the static client/index.html shell's Organization JSON-LD (the dev/SPA
 *    fallback head, which cannot import TS constants) drifts out of sync.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SITE_DESCRIPTION } from "./site";
import { ORGANIZATION_JSONLD, WEBSITE_JSONLD } from "./jsonld";

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf-8");

describe("SITE_DESCRIPTION shape", () => {
  it("is a single non-empty sentence about the brand", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(40);
    expect(SITE_DESCRIPTION.startsWith("RxFit.ai")).toBe(true);
    expect(SITE_DESCRIPTION.trim().endsWith(".")).toBe(true);
  });
});

describe("runtime emitters use SITE_DESCRIPTION", () => {
  it("client Organization + WebSite JSON-LD descriptions equal the constant", () => {
    expect(ORGANIZATION_JSONLD.description).toBe(SITE_DESCRIPTION);
    expect(WEBSITE_JSONLD.description).toBe(SITE_DESCRIPTION);
  });
});

describe("source drift guards (no re-inlined literal)", () => {
  it("the shared schema module owns both descriptions", () => {
    const src = read("shared/jsonld.ts");
    expect(src.includes(SITE_DESCRIPTION)).toBe(false);
    expect(src).toMatch(
      /import\s*\{[^}]*\bSITE_DESCRIPTION\b[^}]*\}\s*from\s*"\.\/site"/,
    );
    expect(src.match(/description:\s*SITE_DESCRIPTION\b/g) ?? []).toHaveLength(2);
  });

  for (const file of ["server/blogSsr.ts", "client/src/lib/seo.tsx"]) {
    it(`${file} imports the shared schemas and never inlines the sentence`, () => {
      const src = read(file);
      expect(src.includes(SITE_DESCRIPTION)).toBe(false);
      expect(src).toMatch(/from\s*"@shared\/jsonld"/);
    });
  }

  it("client/index.html static Organization JSON-LD stays in sync with the constant", () => {
    const html = read("client/index.html");
    const scripts = [
      ...html.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    expect(scripts.length).toBeGreaterThan(0);
    const orgs = scripts
      .map((m) => JSON.parse(m[1]) as Record<string, unknown>)
      .filter((j) => j["@type"] === "Organization");
    expect(orgs).toHaveLength(1);
    expect(orgs[0].description).toBe(SITE_DESCRIPTION);
  });
});
