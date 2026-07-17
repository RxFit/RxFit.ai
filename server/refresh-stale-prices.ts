/**
 * Manual CLI: detect and refresh every published post whose body/FAQ still
 * quotes outdated PLAN_PRICING prices (the same condition that fails the
 * validate-seo build gate after a price change).
 *
 *   npx tsx server/refresh-stale-prices.ts
 *
 * The production scheduler (server/blogScheduler.ts) runs the same check
 * automatically at boot + hourly, so this CLI is for fixing the build gate
 * immediately after a price change without waiting for the deploy.
 */
import { refreshStalePricePosts } from "./stalePriceRefresher";
import { pool } from "./db";

refreshStalePricePosts()
  .then(({ stale, refreshed }) => {
    if (stale.length === 0) console.log("No published posts quote outdated prices.");
    else console.log(`Done: refreshed ${refreshed.length} post(s): ${refreshed.join(", ")}`);
  })
  .catch((err) => {
    console.error("Stale-price refresh failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
