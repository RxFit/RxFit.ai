/**
 * Regression tests for the DB-published broken-link deploy gate in
 * scripts/validate-seo.mjs (validateDbPostLinks). Runs the real script as a
 * subprocess with a controlled environment to lock in three behaviors:
 *   1. missing DATABASE_URL → warning + overall pass (gate skipped, not failed)
 *   2. DB connection/query failure → hard error (exit 1), never a warning
 *   3. a published post linking an unknown slug/route → hard error (exit 1)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import pg from "pg";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "validate-seo.mjs");

async function runScript(env: Record<string, string | undefined>) {
  try {
    const { stdout, stderr } = await execFileAsync("node", [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      timeout: 120_000,
    });
    return { code: 0, out: stdout + stderr };
  } catch (e: any) {
    return { code: e.code ?? 1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

describe("validate-seo DB broken-link gate", () => {
  it("warns and skips (still passes) when DATABASE_URL is not set", async () => {
    const { code, out } = await runScript({ DATABASE_URL: undefined });
    expect(code).toBe(0);
    expect(out).toContain("DATABASE_URL not set");
    expect(out).toContain("SEO validation passed");
  }, 120_000);

  it("fails hard (exit 1) when the DB query fails — never downgraded to a warning", async () => {
    // Port 1 on localhost refuses connections immediately.
    const { code, out } = await runScript({
      DATABASE_URL: "postgres://nobody:nope@127.0.0.1:1/nodb",
    });
    expect(code).toBe(1);
    expect(out).toContain("failed to validate DB-published post links");
    expect(out).toMatch(/ERROR generated_posts/);
  }, 120_000);

  describe("with a published post containing a broken internal link", () => {
    const slug = `test-broken-link-gate-${Date.now()}`;
    let pool: pg.Pool;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required for this test");
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query(
        `INSERT INTO generated_posts
           (slug, title, description, keyword_theme, pillar, author, tldr, body_markdown, status, date)
         VALUES ($1, 'Test post', 'test', 'test', 'test', 'Test', 'test',
                 'See [this gone page](/blog/this-slug-does-not-exist-anywhere) and [dead route](/no-such-route).',
                 'published', '2026-01-01')`,
        [slug],
      );
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM generated_posts WHERE slug = $1`, [slug]);
      await pool.end();
    });

    it("fails the build with errors naming the broken links", async () => {
      const { code, out } = await runScript({});
      expect(code).toBe(1);
      expect(out).toContain(`generated_posts/${slug}`);
      expect(out).toContain("/blog/this-slug-does-not-exist-anywhere");
      expect(out).toContain("/no-such-route");
    }, 120_000);
  });
});
