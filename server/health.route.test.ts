/**
 * Request-level evidence for GET /api/health, on the real Express app that
 * registerRoutes builds. Every dependency a route could reach (database,
 * Stripe, Gmail, Sheets, blog SSR, hero images) is mocked to THROW, so the
 * only way these tests pass is if the liveness route touches none of them.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "http";

const touched = (name: string) => () => {
  throw new Error(`${name} must not be touched by /api/health`);
};
const throwingModule = (name: string) =>
  new Proxy({}, { get: (_t, prop) => (prop === "then" ? undefined : touched(`${name}.${String(prop)}`)) });

vi.mock("./db", () => ({ db: throwingModule("db") }));
vi.mock("./storage", () => ({ storage: throwingModule("storage") }));
vi.mock("./stripeClient", () => ({
  getUncachableStripeClient: touched("stripeClient.getUncachableStripeClient"),
  getStripePublishableKey: touched("stripeClient.getStripePublishableKey"),
}));
vi.mock("./emailService", () => ({
  sendWelcomeEmail: touched("emailService.sendWelcomeEmail"),
  sendLeadEmail: touched("emailService.sendLeadEmail"),
}));
vi.mock("./sheetsService", () => ({ appendLeadToSheet: touched("sheetsService.appendLeadToSheet") }));
vi.mock("./blogSsr", () => ({ renderGeneratedPostPage: touched("blogSsr.renderGeneratedPostPage") }));
vi.mock("./heroImage", () => ({ getHeroImageBytes: touched("heroImage.getHeroImageBytes") }));
vi.mock("./credentialHealthCheck", () => ({
  getCredentialHealthStatus: touched("credentialHealthCheck.getCredentialHealthStatus"),
  runCredentialHealthCheck: touched("credentialHealthCheck.runCredentialHealthCheck"),
}));

let server: Server;
let base: string;

beforeAll(async () => {
  vi.stubEnv("RXFIT_BUILD_ID", "abc1234 built 2026-09-17T14:00Z");
  const { registerRoutes } = await import("./routes");
  const app = express();
  server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("GET /api/health (request level)", () => {
  it("answers 200 JSON with no-store and the liveness payload, touching no dependency", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.build).toBe("abc1234 built 2026-09-17T14:00Z");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true);
    expect(() => new Date(body.checkedAt).toISOString()).not.toThrow();
    expect(Object.keys(body).sort()).toEqual(["build", "checkedAt", "status", "uptimeSeconds"]);
  });

  it("answers HEAD 200 with the same headers and an empty body (what an uptime probe sends)", async () => {
    const res = await fetch(`${base}/api/health`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^application\/json/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("");
  });

  it("is not shadowed by the SPA/blog catch-alls: an unknown /api path still 404s while /api/health does not", async () => {
    const res = await fetch(`${base}/api/health/nope`);
    expect(res.status).toBe(404);
  });
});
