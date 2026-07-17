/**
 * Regression tests for the SITE_URL/APP_URL parser (scripts/siteConfig.mjs)
 * that scripts/validate-seo.mjs uses to derive the canonical site origins
 * from shared/site.ts instead of hardcoding duplicate literals.
 *
 * The key drift guard: the values the validator parses out of shared/site.ts
 * must equal the real @shared/site exports the app compiles against. A wiring
 * test also pins validate-seo.mjs to the shared loader so the script can't
 * silently reintroduce its own hardcoded URLs.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseSiteUrl,
  siteUrlFromSource,
  originFromSource,
  loadSiteUrl,
  loadSiteOrigins,
} from "./siteConfig.mjs";
import { SITE_URL, APP_URL } from "@shared/site";

const ROOT = path.resolve(__dirname, "..");

describe("parseSiteUrl / loadSiteOrigins", () => {
  it("parses the real shared/site.ts to exactly the values the app exports", () => {
    const src = fs.readFileSync(path.join(ROOT, "shared", "site.ts"), "utf8");
    expect(parseSiteUrl(src)).toBe(SITE_URL);
    expect(loadSiteUrl(ROOT)).toBe(SITE_URL);
    expect(loadSiteOrigins(ROOT)).toEqual({ siteUrl: SITE_URL, appUrl: APP_URL });
  });

  it("returns null when the constant is missing", () => {
    expect(parseSiteUrl('export const APP_URL = "https://app.example.com";')).toBeNull();
    expect(parseSiteUrl("")).toBeNull();
  });

  it("siteUrlFromSource throws loudly when the constant is missing", () => {
    expect(() => siteUrlFromSource("export const OTHER = 1;")).toThrow(/SITE_URL constant/);
    expect(() => originFromSource('export const SITE_URL = "https://rxfit.ai";', "APP_URL")).toThrow(
      /APP_URL constant/,
    );
  });

  it("rejects malformed origins (trailing slash, path, non-URL)", () => {
    for (const bad of [
      '"https://rxfit.ai/"',
      '"https://rxfit.ai/blog"',
      '"rxfit.ai"',
      '"ftp://rxfit.ai"',
    ]) {
      expect(() => siteUrlFromSource(`export const SITE_URL = ${bad};`)).toThrow(
        /not a bare origin|SITE_URL constant/,
      );
    }
  });

  it("accepts a well-formed replacement origin (domain-change scenario)", () => {
    expect(siteUrlFromSource('export const SITE_URL = "https://staging.rxfit.ai";')).toBe(
      "https://staging.rxfit.ai",
    );
  });
});

describe("validate-seo.mjs wiring", () => {
  const script = fs.readFileSync(path.join(ROOT, "scripts", "validate-seo.mjs"), "utf8");

  it("imports and calls loadSiteOrigins from siteConfig.mjs", () => {
    expect(script).toMatch(
      /import\s*\{[^}]*loadSiteOrigins[^}]*\}\s*from\s*["']\.\/siteConfig\.mjs["']/,
    );
    expect(script).toMatch(
      /const\s*\{\s*siteUrl:\s*SITE_URL\s*,\s*appUrl:\s*APP_URL\s*\}\s*=\s*loadSiteOrigins\(\s*ROOT\s*\)/,
    );
  });

  it("has no duplicate hardcoded origin literals", () => {
    expect(script).not.toMatch(/SITE_URL\s*=\s*["']https?:\/\//);
    expect(script).not.toContain('"https://app.rxfit.ai"');
  });
});
