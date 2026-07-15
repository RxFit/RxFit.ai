/**
 * One-off backfill: generate + store hero images for already-published
 * AI posts that don't have one, then save the URL on the post.
 *
 * Usage: npx tsx server/backfill-hero-images.ts
 */
import { db } from "./db";
import { generatedPosts } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { generateAndStoreHeroImage } from "./heroImage";

async function main() {
  const posts = await db
    .select()
    .from(generatedPosts)
    .where(isNull(generatedPosts.heroImage));

  if (posts.length === 0) {
    console.log("All generated posts already have hero images. Nothing to do.");
    return;
  }
  console.log(`Backfilling hero images for ${posts.length} post(s)...`);

  let failures = 0;
  for (const post of posts) {
    try {
      const url = await generateAndStoreHeroImage(post.slug, post.title, post.pillar);
      await db
        .update(generatedPosts)
        .set({ heroImage: url })
        .where(eq(generatedPosts.id, post.id));
      console.log(`✓ ${post.slug} → ${url}`);
    } catch (error) {
      failures++;
      console.error(`✗ ${post.slug} failed:`, error);
    }
  }
  console.log(`Done. ${posts.length - failures} succeeded, ${failures} failed.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
