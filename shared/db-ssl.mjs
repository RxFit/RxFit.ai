/**
 * Single source of truth for the Postgres SSL config used by BOTH the runtime
 * server pool (server/db.ts) and the deploy-time DB broken-link gate
 * (scripts/validate-seo.mjs). Plain .mjs so the node-run gate script can
 * import it without a TS build step; server/db.ts imports it via the
 * companion declaration file (shared/db-ssl.d.mts).
 *
 * Keeping this shared prevents the two from drifting: if production SSL
 * requirements change, both the app and the deploy gate change together.
 *
 * Why full verification (rejectUnauthorized: true) in production:
 * - The production DATABASE_URL (Replit-managed Postgres, "helium" infra)
 *   carries `sslmode=require` in its query string. pg >= 8.16 treats
 *   require/prefer/verify-ca as aliases for verify-full, and pg's
 *   ConnectionParameters merges the parsed connection string OVER the
 *   explicit pool config (`Object.assign({}, config, parse(connectionString))`),
 *   so the URL's sslmode has always governed: production connections were
 *   already running with full chain + hostname verification, proven by
 *   successful deploys (e.g. stripe-replit-sync's runMigrations connects with
 *   no ssl override at every boot). The endpoint's certificate verifies
 *   against the system trust store.
 * - This option is therefore a defense-in-depth backstop: it ONLY takes
 *   effect if the connection string stops specifying sslmode entirely (the
 *   URL always wins when sslmode is present). In that case we still demand a
 *   verified certificate instead of silently accepting any cert. Note this
 *   does NOT protect against pg v9's planned libpq-compat weakening —
 *   there, parse('sslmode=require') will yield {rejectUnauthorized:false}
 *   and still override this option; before upgrading to pg 9, the URL
 *   should carry sslmode=verify-full.
 * - In development the DATABASE_URL points at the local helium proxy with
 *   `sslmode=disable`, which likewise overrides this value — connections are
 *   plaintext to the local sidecar regardless of what we return here.
 */
export function dbSslConfig(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "production" ? { rejectUnauthorized: true } : false;
}
