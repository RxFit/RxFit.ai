import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { dbSslConfig } from "@shared/db-ssl.mjs";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: dbSslConfig(),
});

export const db = drizzle(pool, { schema });
