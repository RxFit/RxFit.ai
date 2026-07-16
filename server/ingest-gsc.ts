/**
 * Manual CLI: pull today's Google Search Console snapshot into the DB and
 * print the current striking-distance report.
 *
 *   npx tsx server/ingest-gsc.ts
 */
import { ingestGscSnapshot, findStrikingDistancePosts } from "./seoFeedback";
import { pool } from "./db";

(async () => {
  const count = await ingestGscSnapshot();
  console.log(count === 0 ? "Snapshot for today already exists." : `Stored ${count} rows.`);
  const striking = await findStrikingDistancePosts();
  if (striking.length === 0) {
    console.log("No DB posts in striking distance right now.");
  } else {
    for (const s of striking) {
      console.log(`\n/blog/${s.slug} — opportunity ${s.opportunity} impressions`);
      for (const q of s.queries) {
        console.log(`  "${q.query}" pos ${q.position.toFixed(1)}, ${q.impressions} imp, ${q.clicks} clicks`);
      }
    }
  }
})()
  .catch((err) => {
    console.error("GSC ingestion failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
