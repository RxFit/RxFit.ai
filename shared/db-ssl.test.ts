/**
 * Guards the shared Postgres SSL config used by BOTH server/db.ts (runtime
 * pool) and scripts/validate-seo.mjs (deploy-time DB link gate). If this
 * changes, both change together — that's the point.
 */
import { describe, it, expect } from "vitest";
import { dbSslConfig } from "./db-ssl.mjs";

describe("dbSslConfig", () => {
  it("enables SSL with full certificate verification in production", () => {
    expect(dbSslConfig("production")).toEqual({ rejectUnauthorized: true });
  });

  it("disables SSL in development / test / unset environments", () => {
    expect(dbSslConfig("development")).toBe(false);
    expect(dbSslConfig("test")).toBe(false);
    expect(dbSslConfig(undefined)).toBe(false);
  });
});
