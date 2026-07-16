/**
 * Manual CLI: refresh one DB-published blog post now.
 *
 *   npx tsx server/refresh-post.ts           # auto-pick (striking-distance → oldest stale)
 *   npx tsx server/refresh-post.ts some-slug # force a specific post
 *
 * Also: `npx tsx server/ingest-gsc.ts` to pull a GSC snapshot on demand.
 */
import { refreshOnePost } from "./blogRefresher";
import { pool } from "./db";

const slug = process.argv[2];

refreshOnePost(slug)
  .then((post) => {
    if (post) console.log(`Done: refreshed /blog/${post.slug}`);
    else console.log("No post needed a refresh.");
  })
  .catch((err) => {
    console.error("Refresh failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
