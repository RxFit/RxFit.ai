/**
 * In-app scheduler for the blog auto-publisher.
 *
 * The site is deployed as an autoscale web service (the [deployment] target in
 * .replit must stay "autoscale" for rxfit.ai itself), so instead of a separate
 * scheduled deployment we run a due-check inside the Express process:
 *   - shortly after boot (autoscale instances wake on traffic), and
 *   - every hour while the instance stays alive.
 *
 * A post is "due" when the latest generated post is older than 3 days (or none
 * exists yet). A Postgres advisory lock guarantees only one instance publishes
 * even when autoscale runs several concurrently.
 *
 * Enabled in production automatically; in development set BLOG_AUTOPUBLISH=true
 * or run `npx tsx server/generate-post.ts` manually.
 */
import { pool } from "./db";
import { storage } from "./storage";
import { generateAndPublishPost } from "./blogGenerator";

const PUBLISH_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // every 3 days
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly due-check
const BOOT_DELAY_MS = 30 * 1000;
const ADVISORY_LOCK_KEY = 815_042; // arbitrary app-unique key for pg_try_advisory_lock

let running = false;

export function isPostDue(latestCreatedAt: Date | undefined, now = new Date()): boolean {
  if (!latestCreatedAt) return true;
  return now.getTime() - latestCreatedAt.getTime() >= PUBLISH_INTERVAL_MS;
}

async function runIfDue(): Promise<void> {
  if (running) return;
  running = true;
  const client = await pool.connect();
  let locked = false;
  try {
    const latest = await storage.getLatestGeneratedPost();
    if (!isPostDue(latest?.createdAt)) return;

    const lockResult = await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      ADVISORY_LOCK_KEY,
    ]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) {
      console.log("[blog-scheduler] Another instance holds the publish lock — skipping");
      return;
    }

    // Re-check under the lock in case another instance just published.
    const latestUnderLock = await storage.getLatestGeneratedPost();
    if (!isPostDue(latestUnderLock?.createdAt)) return;

    console.log("[blog-scheduler] Post is due — starting generation run");
    await generateAndPublishPost();
  } catch (error) {
    // Failure email already sent by the pipeline; keep the server alive.
    console.error("[blog-scheduler] Publish run failed:", error);
  } finally {
    if (locked) {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
    }
    client.release();
    running = false;
  }
}

export function startBlogScheduler(): void {
  const enabled = process.env.NODE_ENV === "production" || process.env.BLOG_AUTOPUBLISH === "true";
  if (!enabled) {
    console.log(
      "[blog-scheduler] Disabled in development (set BLOG_AUTOPUBLISH=true or run `npx tsx server/generate-post.ts` to publish manually)",
    );
    return;
  }
  console.log("[blog-scheduler] Enabled — checking every hour whether a post is due (every 3 days)");
  setTimeout(() => void runIfDue(), BOOT_DELAY_MS);
  setInterval(() => void runIfDue(), CHECK_INTERVAL_MS).unref();
}
