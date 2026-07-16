/**
 * Single source of truth for the Postgres SSL config used by BOTH the runtime
 * server pool (server/db.ts) and the deploy-time DB broken-link gate
 * (scripts/validate-seo.mjs). Plain .mjs so the node-run gate script can
 * import it without a TS build step; server/db.ts imports it via the
 * companion declaration file (shared/db-ssl.d.mts).
 *
 * Keeping this shared prevents the two from drifting: if production SSL
 * requirements change, both the app and the deploy gate change together.
 */
export function dbSslConfig(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "production" ? { rejectUnauthorized: false } : false;
}
