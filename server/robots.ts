/**
 * robots.txt body, extracted from routes.ts so a unit test (server/robots.test.ts)
 * can assert the crawl-policy contract: every UA group must disallow /admin
 * (internal ops dashboard), /api/, and /success. A template refactor that
 * drops a disallow would otherwise silently leak those URLs to crawlers.
 *
 * AI crawlers (GPTBot/PerplexityBot/ClaudeBot/Google-Extended/CCBot) get
 * explicit groups so our content can be cited (AEO/GEO) — and each group
 * repeats the shared disallows because a dedicated UA group overrides the
 * `*` group entirely rather than inheriting from it.
 */

export const ROBOTS_DISALLOWS: readonly string[] = ["/api/", "/success", "/admin"];

export const ROBOTS_UA_GROUPS: readonly string[] = [
  "*",
  "GPTBot",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
];

export function buildRobotsTxt(baseUrl: string): string {
  const groups = ROBOTS_UA_GROUPS.map((ua) => {
    const lines = [`User-agent: ${ua}`, "Allow: /", ...ROBOTS_DISALLOWS.map((d) => `Disallow: ${d}`)];
    return lines.join("\n");
  });
  return `${groups.join("\n\n")}\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}
