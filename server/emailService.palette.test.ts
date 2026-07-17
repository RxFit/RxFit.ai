/**
 * Brand-palette + escaping regression test for EVERY email template.
 *
 * The customer templates moved from the retired teal/coral palette to
 * champagne gold, but nothing prevented a future edit (or a template pasted
 * from an old draft) from silently reintroducing off-brand colors — emails
 * had no automated guard. This test renders every template in the
 * EMAIL_TEMPLATES registry (server/emailService.ts) with hostile fixture
 * input and asserts:
 *
 *  (a) none of the retired palette colors appear (teal #2DD4BF / #14B8A6,
 *      coral #FB923C, and their rgba channel triplets);
 *  (b) the correct brand color per template family — gold #D4AF37 for
 *      customer/notification emails, red #EF4444 for owner failure alerts
 *      (deliberately red-branded, no gold requirement);
 *  (c) a probe string containing <script> arrives HTML-escaped, never raw.
 *
 * A completeness guard counts `<!DOCTYPE html>` occurrences in the
 * emailService.ts source and fails when a template exists that is not in
 * the registry — so a new pasted-in template can't dodge the palette check.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const sendMock = () => Promise.resolve();
// emailService imports gmailClient at module scope; mocking keeps this test
// hermetic even though rendering itself never touches Gmail.
import { vi } from "vitest";
vi.mock("./gmailClient", () => ({
  getUncachableGmailClient: vi.fn().mockImplementation(async () => ({
    users: { messages: { send: sendMock }, getProfile: vi.fn() },
  })),
}));

import { EMAIL_TEMPLATES } from "./emailService";

/** Retired palette: hexes and the rgba channel triplets of those colors. */
const RETIRED_PALETTE = [
  "#2dd4bf", // teal-400
  "#14b8a6", // teal-500
  "#fb923c", // coral/orange-400
  "45,212,191", // rgba teal-400
  "20,184,166", // rgba teal-500
  "251,146,60", // rgba coral
];

const BRAND_GOLD = "#d4af37";
const ALERT_RED = "#ef4444";

const SCRIPT_PROBE = `<script>alert("xss")</script>`;

/** Lowercase and strip whitespace so `rgba(45, 212, 191)` can't hide. */
function normalize(html: string): string {
  return html.toLowerCase().replace(/\s+/g, "");
}

const entries = Object.entries(EMAIL_TEMPLATES);

describe("email template brand palette", () => {
  it("registry has templates to check", () => {
    expect(entries.length).toBeGreaterThanOrEqual(7);
  });

  it.each(entries)("%s: no retired teal/coral palette colors", (_name, tpl) => {
    const html = normalize(tpl.render("Casey Customer"));
    for (const banned of RETIRED_PALETTE) {
      expect(html).not.toContain(banned.replace(/\s+/g, ""));
    }
  });

  it.each(entries)("%s: carries its brand color", (_name, tpl) => {
    const html = normalize(tpl.render("Casey Customer"));
    if (tpl.brand === "gold") {
      expect(html).toContain(BRAND_GOLD);
    } else {
      expect(html).toContain(ALERT_RED);
      // Alert emails are red-branded on purpose; they must not accidentally
      // gain retired colors either (covered above) — no gold requirement.
    }
  });

  it.each(entries)("%s: dynamic strings arrive HTML-escaped", (_name, tpl) => {
    const html = tpl.render(SCRIPT_PROBE);
    expect(html).not.toContain(SCRIPT_PROBE);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("registry completeness", () => {
  it("every <!DOCTYPE html> template in emailService.ts is registered", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "emailService.ts"), "utf-8");
    const templateCount = (source.match(/<!DOCTYPE html>/g) ?? []).length;
    expect(templateCount).toBe(entries.length);
  });
});
