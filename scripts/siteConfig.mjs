/**
 * Shared parser for the canonical site origins in shared/site.ts.
 *
 * scripts/validate-seo.mjs must build canonical/JSON-LD URLs against the SAME
 * SITE_URL/APP_URL the app uses (client/src/lib/seo.tsx, server/blogSsr.ts,
 * routes.ts all import them from @shared/site). Hardcoding a second copy of a
 * URL in the validator would let the two silently drift apart after a domain
 * change — approving broken canonicals or rejecting correct ones. So the
 * validator parses the constants out of shared/site.ts at run time (same
 * approach as its STATIC_ROUTES loader) and fails the build loudly if it
 * can't.
 *
 * Regression-tested in scripts/siteConfig.test.ts, including drift guards
 * that compare the parsed values against the real @shared/site exports.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Extract a named exported string-constant literal from shared/site.ts
 * source. Returns null when the constant can't be located.
 */
export function parseSiteConstant(src, name) {
  const m = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*"([^"]+)"`));
  return m ? m[1] : null;
}

/** Extract the SITE_URL string literal. Returns null when missing. */
export function parseSiteUrl(src) {
  return parseSiteConstant(src, "SITE_URL");
}

/**
 * Parse and validate an origin constant from shared/site.ts source, throwing
 * a loud error (which fails the build) when it is missing or malformed.
 */
export function originFromSource(src, name, origin = "shared/site.ts") {
  const url = parseSiteConstant(src, name);
  if (!url) {
    throw new Error(
      `${origin}: could not locate the ${name} constant — the SEO validator cannot determine the canonical site origin. ` +
        `Expected a line like: export const ${name} = "https://example.com";`,
    );
  }
  if (!/^https?:\/\/[^/\s]+$/.test(url)) {
    throw new Error(
      `${origin}: ${name} ${JSON.stringify(url)} is not a bare origin — expected "https://host" with no trailing slash or path.`,
    );
  }
  return url;
}

/** Parse + validate SITE_URL from shared/site.ts source (throws loudly). */
export function siteUrlFromSource(src, origin = "shared/site.ts") {
  return originFromSource(src, "SITE_URL", origin);
}

/** Read shared/site.ts under rootDir and return its validated SITE_URL. */
export function loadSiteUrl(rootDir) {
  return loadSiteOrigins(rootDir).siteUrl;
}

/**
 * Read shared/site.ts under rootDir and return both validated origins the
 * SEO validator needs: the canonical site origin and the product-app origin
 * (used in the Organization JSON-LD sameAs entry).
 */
export function loadSiteOrigins(rootDir) {
  const sitePath = path.join(rootDir, "shared", "site.ts");
  const src = fs.readFileSync(sitePath, "utf8");
  return {
    siteUrl: originFromSource(src, "SITE_URL"),
    appUrl: originFromSource(src, "APP_URL"),
  };
}
