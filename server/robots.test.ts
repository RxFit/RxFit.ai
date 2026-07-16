/**
 * Guards the crawler-side half of the /admin contract (see also
 * script/prerenderRoutes.test.ts): every UA group in robots.txt must
 * disallow /admin, /api/ and /success. Dedicated UA groups override the `*`
 * group entirely (they don't inherit), so a group missing a disallow would
 * expose those URLs to that crawler.
 */
import { describe, it, expect } from "vitest";
import { buildRobotsTxt, ROBOTS_UA_GROUPS, ROBOTS_DISALLOWS } from "./robots";

const BASE = "https://rxfit.ai";

/** Parse robots.txt into { ua, lines } groups (blank-line separated). */
function parseGroups(body: string): { ua: string; lines: string[] }[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim().split("\n"))
    .filter((lines) => lines[0]?.startsWith("User-agent:"))
    .map((lines) => ({ ua: lines[0].replace("User-agent:", "").trim(), lines }));
}

describe("buildRobotsTxt", () => {
  const body = buildRobotsTxt(BASE);
  const groups = parseGroups(body);

  it("emits a group for * and every AI crawler", () => {
    expect(groups.map((g) => g.ua)).toEqual([...ROBOTS_UA_GROUPS]);
    expect(ROBOTS_UA_GROUPS).toEqual(
      expect.arrayContaining(["*", "GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended", "CCBot"]),
    );
  });

  it("disallows /admin in EVERY UA group", () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.lines, `UA group "${g.ua}" must disallow /admin`).toContain("Disallow: /admin");
    }
  });

  it("repeats /api/ and /success disallows and allows / in every group", () => {
    expect(ROBOTS_DISALLOWS).toEqual(expect.arrayContaining(["/api/", "/success", "/admin"]));
    for (const g of groups) {
      expect(g.lines).toContain("Allow: /");
      expect(g.lines).toContain("Disallow: /api/");
      expect(g.lines).toContain("Disallow: /success");
    }
  });

  it("points at the sitemap on the canonical origin", () => {
    expect(body).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });
});
