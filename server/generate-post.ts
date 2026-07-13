/**
 * Standalone CLI entry for the blog auto-publisher.
 * Run manually (or from an external scheduler) with:
 *   npx tsx server/generate-post.ts
 * Exits 1 on any failure (a failure email is sent by the pipeline).
 */
import { generateAndPublishPost } from "./blogGenerator";
import { pool } from "./db";

async function main() {
  const post = await generateAndPublishPost();
  console.log(`Done. Published "${post.title}" at /blog/${post.slug}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("Blog generation failed:", error);
    await pool.end().catch(() => {});
    process.exit(1);
  });
